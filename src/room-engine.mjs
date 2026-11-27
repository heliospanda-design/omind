/**
 * Omind v5.2 — Single-Room Stateful Coordinator (`RoomEngine`)
 * Includes v5.1 Participant Bearer Auth, PA `claimCode` Binding, and `shareToken` Read-Only Isolation.
 * Runs identically inside Cloudflare `OmindRoomDO` (1 Room = 1 SQLite DO)
 * and local Node.js `NodeRoomManager` (1 Room = 1 SQLite instance).
 */

import { compileDeliverable } from './compiler.mjs';
import {
  ForbiddenSignoffError,
  createConsensusItem,
  humanLockConsensusItem,
  resolveRevisionProposal,
  signoffConsensusItem,
} from './consensus.mjs';
import {
  PARTICIPANT_TOKEN_TTL_MS,
  appendRoomEvent,
  computeFutureIso,
  encodeShareId,
  generateId,
  generateParticipantToken,
  generateShareToken,
  hashToken,
  hydrateArtifact,
  hydrateConsensusItem,
  hydrateEventLog,
  hydrateHandRaise,
  hydrateLink,
  hydrateMessage,
  hydratePaBrief,
  hydrateParticipant,
  hydrateProposal,
  hydrateRoomMeta,
  hydrateRoomRole,
  hydrateSnapshot,
  initPresetRoom,
  safeJsonParse,
  seedStarterCaseRoom,
} from './db-core.mjs';
import { executeRoomMcpTool } from './mcp-server.mjs';
import {
  checkRedlineHit,
  detectPriorRoomConflict,
  evaluateConflictParallel,
  expandHandRaiseToBoard,
  runColdStartIcebreaker,
  runTriageCycle,
  synthesizeDeriveLink,
} from './orchestrator.mjs';
import {
  DELIVERABLE_TEMPLATES,
  ROOM_PRESETS,
  SIMULATED_PERSONAS,
  makeAvatarText,
  pickParticipantColor,
} from './presets.mjs';

const EVENT_TO_SSE_MAP = {
  'room.created': 'room.updated',
  'message.created': 'message.created',
  'artifact.created': 'artifact.upserted',
  'artifact.moved': 'artifact.upserted',
  'artifact.rejected': 'artifact.upserted',
  'link.created': 'link.upserted',
  'hand.raised': 'agent.hand_raised',
  'hand.expanded': 'agent.hand_updated',
  'hand.folded': 'agent.hand_updated',
  'pa.brief_submitted': 'pa.brief_updated',
  'pa.brief_claimed': 'pa.brief_updated',
  'pa.referenced': 'pa.referenced',
  'consensus.created': 'consensus.updated',
  'consensus.locked': 'consensus.updated',
  'consensus.stale': 'consensus.updated',
  'proposal.created': 'proposal.created',
  'room.finalized': 'room.finalized',
};

export function extractBearerToken(headers = {}) {
  const auth = headers?.authorization || headers?.Authorization || '';
  const match = String(auth).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export class RoomEngine {
  constructor({
    db,
    roomId,
    env = {},
    shareRegistry = null,
    waitUntil = null,
    scheduleAlarmAt = null,
    triageDebounceMs = 3000,
    fastDebounceMs = 400,
    handRaiseFoldMs = 30_000,
    roleCooldownMs = 60_000,
    activeHumanWindowMs = 5 * 60_000,
    nowFn = () => Date.now(),
  }) {
    this.db = db;
    this.roomId = roomId;
    this.env = env;
    this.shareRegistry = shareRegistry;
    this.waitUntil = waitUntil;
    this.scheduleAlarmAt = scheduleAlarmAt;
    this.triageDebounceMs = triageDebounceMs;
    this.fastDebounceMs = fastDebounceMs;
    this.handRaiseFoldMs = handRaiseFoldMs;
    this.roleCooldownMs = roleCooldownMs;
    this.activeHumanWindowMs = activeHumanWindowMs;
    this.nowFn = nowFn;

    /** @type {Set<{ id: string, participantId: string, send: (event: string, data: any, seq?: number) => void, close: () => void }>} */
    this.sseClients = new Set();
    this.pendingDeltaBuffer = [];
    this.debounceTimer = null;
    this.debouncePromiseResolve = null;
    this.foldTimers = new Set();
    this.eventSeqFallback = 1;
  }

  nowIso() {
    return new Date(this.nowFn()).toISOString();
  }

  emitSse(event, data = {}) {
    const seq = data?.seq || undefined;
    for (const client of this.sseClients) {
      try {
        client.send(event, data, seq);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  isInitialized() {
    const row = this.db.prepare('SELECT id FROM room_meta LIMIT 1').get();
    return Boolean(row);
  }

  getMcpTokenPreview() {
    const row = this.db
      .prepare("SELECT value FROM room_internal_kv WHERE key = 'mcp_token'")
      .get();
    return row?.value || null;
  }

  /**
   * Resolve and validate `Authorization: Bearer <participantToken>`
   */
  authenticateParticipant(headers = {}, { optional = false } = {}) {
    const token = extractBearerToken(headers);
    if (!token) {
      if (optional) return null;
      const err = new Error('Unauthorized: Missing Authorization Bearer participantToken');
      err.statusCode = 401;
      throw err;
    }

    const tokenHash = hashToken(token);
    const pRow = this.db
      .prepare(
        "SELECT * FROM participants WHERE token_hash = ? AND token_hash NOT IN ('', 'PENDING_CLAIM') LIMIT 1"
      )
      .get(tokenHash);

    if (!pRow) {
      if (optional) return null;
      const err = new Error('Unauthorized: Invalid participantToken');
      err.statusCode = 401;
      throw err;
    }

    const expMs = Date.parse(pRow.token_expires_at || '');
    if (!Number.isNaN(expMs) && expMs <= this.nowFn()) {
      if (optional) return null;
      const err = new Error('Unauthorized: participantToken has expired');
      err.statusCode = 401;
      throw err;
    }

    return hydrateParticipant(pRow);
  }

  /**
   * Validate read-only `shareToken` (or valid room/participant token) for `/api/shares/:shareId` & `/replay`
   */
  verifyShareAccess(snapRow, { query = {}, headers = {} } = {}) {
    const provided =
      query.t ||
      query.shareToken ||
      query.token ||
      headers['x-share-token'] ||
      extractBearerToken(headers) ||
      '';
    const clean = String(provided || '').trim();
    if (!clean) {
      const err = new Error('Unauthorized: Valid shareToken (?t=...) is required to view this share');
      err.statusCode = 401;
      throw err;
    }

    const incomingHash = hashToken(clean);
    if (snapRow.share_token_hash && incomingHash === snapRow.share_token_hash) {
      return true;
    }

    const metaRow = this.db.prepare('SELECT mcp_access_token_hash FROM room_meta LIMIT 1').get();
    if (metaRow && incomingHash === metaRow.mcp_access_token_hash) {
      return true;
    }

    const pRow = this.db
      .prepare(
        "SELECT id, token_expires_at FROM participants WHERE token_hash = ? AND token_hash NOT IN ('', 'PENDING_CLAIM') LIMIT 1"
      )
      .get(incomingHash);
    if (pRow) {
      const expMs = Date.parse(pRow.token_expires_at || '');
      if (Number.isNaN(expMs) || expMs > this.nowFn()) {
        return true;
      }
    }

    const err = new Error('Forbidden: Invalid shareToken');
    err.statusCode = 403;
    throw err;
  }

  buildMcpConnectInfo(origin = 'https://kokowork.top') {
    const token = this.getMcpTokenPreview();
    const roomUrl = `${origin}/room/${encodeURIComponent(this.roomId)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const mcpEndpoint = `${origin}/mcp`;
    return {
      mcpEndpoint,
      roomUrl,
      bearerToken: token,
      cursorConfigJson: {
        mcpServers: {
          [`omind-${this.roomId}`]: {
            type: 'streamable-http',
            url: mcpEndpoint,
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        },
      },
      preMeetingPrompt: `请调用 Omind MCP 工具 omind_get_room_topic 读取房间 ${roomUrl} 的议题，结合我本地资料整理一份脱敏背景简报，确认后用 omind_submit_pa_brief 投递进去（模式选 proxy_tiered），并把返回的 claimCode 告诉我以便进房认领。`,
      postMeetingPrompt: `请调用 Omind MCP 工具 omind_pull_deliverable（携带我的凭证）拉取 ${roomUrl} 的定稿成品与我的待办；若实现细节有疑问再用 omind_query_room_raw 按需穿透检索原始上下文。`,
    };
  }

  /**
   * FR-04.1: Dynamic Active Human Density Auto-Pacing
   */
  recomputePacingMode() {
    const metaRow = this.db.prepare('SELECT * FROM room_meta LIMIT 1').get();
    if (!metaRow) return { pacingMode: 'solo', activeHumanCount: 0 };

    const nowMs = this.nowFn();
    const liveParticipantIds = new Set();
    for (const c of this.sseClients) {
      if (c.participantId && c.participantId !== 'anonymous') {
        liveParticipantIds.add(c.participantId);
      }
    }

    const pRows = this.db
      .prepare("SELECT * FROM participants WHERE token_hash != 'PENDING_CLAIM'")
      .all();
    for (const p of pRows) {
      if (!p.is_online) continue;
      const lastMs = Date.parse(p.last_active_at || p.joined_at);
      if (!Number.isNaN(lastMs) && nowMs - lastMs <= this.activeHumanWindowMs) {
        liveParticipantIds.add(p.id);
      }
    }

    const activeHumanCount = Math.max(liveParticipantIds.size, pRows.length > 0 ? 1 : 0);
    const nextMode = activeHumanCount >= 2 ? 'multiplayer' : 'solo';

    if (metaRow.pacing_mode !== nextMode) {
      this.db
        .prepare('UPDATE room_meta SET pacing_mode = ? WHERE id = ?')
        .run(nextMode, metaRow.id);
      this.emitSse('room.pacing_changed', {
        pacingMode: nextMode,
        activeHumanCount,
      });
    }

    return { pacingMode: nextMode, activeHumanCount };
  }

  touchParticipant(participantId) {
    if (!participantId) return null;
    const row = this.db.prepare('SELECT * FROM participants WHERE id = ?').get(participantId);
    if (!row || row.token_hash === 'PENDING_CLAIM') return null;
    const now = this.nowIso();
    this.db
      .prepare('UPDATE participants SET is_online = 1, last_active_at = ? WHERE id = ?')
      .run(now, participantId);
    this.recomputePacingMode();
    return hydrateParticipant(
      this.db.prepare('SELECT * FROM participants WHERE id = ?').get(participantId)
    );
  }

  /**
   * FR-04.2: Auto-fold unclicked `raised_teaser` bubbles older than 30s (`handRaiseFoldMs`)
   */
  sweepExpiredHandRaises() {
    if (!this.isInitialized()) return [];
    const nowMs = this.nowFn();
    const nowIso = new Date(nowMs).toISOString();
    const openRows = this.db
      .prepare("SELECT * FROM hand_raises WHERE status = 'raised_teaser'")
      .all();

    const folded = [];
    for (const hr of openRows) {
      const createdMs = Date.parse(hr.created_at);
      if (!Number.isNaN(createdMs) && nowMs - createdMs >= this.handRaiseFoldMs) {
        this.db
          .prepare("UPDATE hand_raises SET status = 'folded', resolved_at = ? WHERE id = ?")
          .run(nowIso, hr.id);
        const updated = hydrateHandRaise(
          this.db.prepare('SELECT * FROM hand_raises WHERE id = ?').get(hr.id)
        );
        folded.push(updated);
        const ev = appendRoomEvent(this.db, {
          eventType: 'hand.folded',
          actorType: 'system',
          actorId: hr.role_key,
          actorName: hr.role_key,
          summaryText: `举手气泡超时未点，静默折叠进顶栏角标：「${hr.teaser}」`,
          payload: { handRaiseId: hr.id, roleKey: hr.role_key },
          createdAt: nowIso,
        });
        this.emitSse('agent.hand_updated', { handRaise: updated, seq: ev.seq });
      }
    }
    return folded;
  }

  scheduleHandRaiseFoldWatch() {
    if (this.scheduleAlarmAt) {
      try {
        const maybePromise = this.scheduleAlarmAt(this.nowFn() + this.handRaiseFoldMs + 50);
        if (maybePromise?.catch) maybePromise.catch(() => {});
      } catch {
        // ignore alarm scheduling error in local mode
      }
    }
    const timer = setTimeout(() => {
      this.foldTimers.delete(timer);
      try {
        this.sweepExpiredHandRaises();
      } catch {
        // ignore
      }
    }, this.handRaiseFoldMs + 30);
    if (typeof timer.unref === 'function') timer.unref();
    this.foldTimers.add(timer);
  }

  /**
   * Section 5.1: 3s / 400ms Event Debounce Aggregator
   */
  enqueueTriageDelta(delta, { fastTrack = false, flushImmediate = false } = {}) {
    this.pendingDeltaBuffer.push(delta);

    if (flushImmediate || this.triageDebounceMs <= 0) {
      return this.flushTriageNow();
    }

    const delay = fastTrack ? this.fastDebounceMs : this.triageDebounceMs;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const promise = new Promise((resolve) => {
      const prevResolve = this.debouncePromiseResolve;
      this.debouncePromiseResolve = (val) => {
        prevResolve?.(val);
        resolve(val);
      };

      this.debounceTimer = setTimeout(async () => {
        this.debounceTimer = null;
        const done = this.debouncePromiseResolve;
        this.debouncePromiseResolve = null;
        try {
          const result = await this.flushTriageNow();
          done?.(result);
        } catch {
          done?.(null);
        }
      }, delay);

      if (typeof this.debounceTimer.unref === 'function') {
        this.debounceTimer.unref();
      }
    });

    if (this.waitUntil) {
      try {
        this.waitUntil(promise);
      } catch {
        // ignore outside request context
      }
    }

    return promise;
  }

  async flushTriageNow() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    const batch = this.pendingDeltaBuffer.splice(0, this.pendingDeltaBuffer.length);
    if (batch.length === 0) return null;

    this.recomputePacingMode();
    const res = await runTriageCycle(this.db, batch, {
      env: this.env,
      emitEvent: (evName, payload) => this.emitSse(evName, payload),
      roleCooldownMs: this.roleCooldownMs,
      nowMs: this.nowFn(),
    });

    if (res.raisedHands?.length > 0) {
      this.scheduleHandRaiseFoldWatch();
    }

    if (this.debouncePromiseResolve) {
      const r = this.debouncePromiseResolve;
      this.debouncePromiseResolve = null;
      r(res);
    }

    return res;
  }

  createRoom({
    title = '未命名圆桌讨论',
    topicSummary = '',
    presetId = 'decision_review',
    creatorName = '发起人',
    creatorAvatar = null,
    creatorColor = null,
    creatorRoleTitle = '房间发起人',
    allowTableSpeak = true,
    seedStarterCase = false,
    enableRecommendedDomain = false,
    origin = 'https://kokowork.top',
  }) {
    if (seedStarterCase) {
      const seeded = seedStarterCaseRoom(this.db, {
        roomId: this.roomId,
        title: String(title || '🌟 新手上手案例：首屏免注册体验改版共创').trim(),
        creatorName: String(creatorName || '林知夏').trim(),
        creatorAvatar,
        creatorColor: creatorColor || '#4F46E5',
        creatorRoleTitle: String(creatorRoleTitle || '产品体验官').trim(),
        allowTableSpeak: Boolean(allowTableSpeak),
      });
      const creatorId = seeded?.creator?.id || 'u_starter_me';
      const state = this.getFullState({ participantId: creatorId, origin });
      return {
        ...state,
        creator: seeded?.creator || state.participants?.[0],
        participantId: creatorId,
        participantToken:
          seeded?.creatorParticipantToken || state.demoSeatTokens?.[creatorId] || null,
        mcpToken: seeded?.mcpToken,
      };
    }

    const validPresetId = ROOM_PRESETS[presetId] ? presetId : 'decision_review';
    const created = initPresetRoom(this.db, {
      roomId: this.roomId,
      title: String(title || '未命名圆桌讨论').trim(),
      topicSummary: String(topicSummary || '').trim(),
      presetId: validPresetId,
      creatorName: String(creatorName || '发起人').trim(),
      creatorAvatar,
      creatorColor,
      creatorRoleTitle: String(creatorRoleTitle || '房间发起人').trim(),
      enableRecommendedDomain: Boolean(enableRecommendedDomain),
      now: this.nowIso(),
    });

    const state = this.getFullState({ participantId: created.creator?.id, origin });
    return {
      ...state,
      creator: created.creator,
      participantId: created.creator?.id,
      participantToken: created.creatorParticipantToken,
      mcpToken: created.mcpToken,
    };
  }

  resetStarterCase({
    creatorName = '林知夏',
    creatorAvatar = null,
    creatorColor = '#4F46E5',
    origin = 'https://kokowork.top',
  } = {}) {
    const seeded = seedStarterCaseRoom(this.db, {
      roomId: this.roomId,
      creatorName,
      creatorAvatar,
      creatorColor,
      resetExisting: true,
    });
    const full = this.getFullState({ participantId: seeded?.creator?.id, origin });
    this.emitSse('room.reset', full);
    return {
      ...full,
      participantId: seeded?.creator?.id,
      participantToken: seeded?.creatorParticipantToken,
    };
  }

  getFullState({ participantId = null, origin = 'https://kokowork.top' } = {}) {
    const metaRow = this.db.prepare('SELECT * FROM room_meta LIMIT 1').get();
    if (!metaRow) return null;

    if (participantId) {
      this.touchParticipant(participantId);
    }
    this.sweepExpiredHandRaises();
    const { pacingMode, activeHumanCount } = this.recomputePacingMode();

    const refreshedMeta = hydrateRoomMeta(this.db.prepare('SELECT * FROM room_meta LIMIT 1').get());
    const participants = this.db
      .prepare('SELECT * FROM participants ORDER BY joined_at ASC')
      .all()
      .map(hydrateParticipant);
    const roles = this.db
      .prepare('SELECT * FROM room_roles ORDER BY dimension ASC, id ASC')
      .all()
      .map((r) => hydrateRoomRole(r, refreshedMeta.presetId));
    const paBriefs = this.db
      .prepare('SELECT * FROM pa_briefs ORDER BY submitted_at ASC')
      .all()
      .map(hydratePaBrief);
    const artifacts = this.db
      .prepare('SELECT * FROM canvas_artifacts ORDER BY created_at ASC')
      .all()
      .map(hydrateArtifact);
    const links = this.db
      .prepare('SELECT * FROM artifact_links ORDER BY created_at ASC')
      .all()
      .map(hydrateLink);
    const messages = this.db
      .prepare('SELECT * FROM messages ORDER BY created_at ASC')
      .all()
      .map(hydrateMessage);
    const handRaises = this.db
      .prepare('SELECT * FROM hand_raises ORDER BY created_at DESC')
      .all()
      .map(hydrateHandRaise);
    const consensusItems = this.db
      .prepare('SELECT * FROM consensus_items ORDER BY created_at ASC')
      .all()
      .map(hydrateConsensusItem);
    const proposals = this.db
      .prepare("SELECT * FROM revision_proposals WHERE status = 'pending' ORDER BY created_at DESC")
      .all()
      .map(hydrateProposal);
    const latestSnapshotRow = this.db
      .prepare('SELECT * FROM deliverable_snapshots ORDER BY created_at DESC LIMIT 1')
      .get();
    const latestEventRow = this.db
      .prepare('SELECT seq FROM room_event_log ORDER BY seq DESC LIMIT 1')
      .get();

    const isDemoRow = this.db
      .prepare("SELECT value FROM room_internal_kv WHERE key = 'is_demo_room'")
      .get();
    const demoTokensRow =
      isDemoRow?.value === '1'
        ? this.db
            .prepare("SELECT value FROM room_internal_kv WHERE key = 'demo_seat_tokens'")
            .get()
        : null;

    let latestShareToken = null;
    if (latestSnapshotRow) {
      const stRow = this.db
        .prepare('SELECT value FROM room_internal_kv WHERE key = ?')
        .get(`share_token:${latestSnapshotRow.id}`);
      latestShareToken = stRow?.value || null;
    }

    return {
      roomMeta: {
        ...refreshedMeta,
        pacingMode,
        activeHumanCount,
        lastEventSeq: Number(latestEventRow?.seq || 0),
        isDemoRoom: isDemoRow?.value === '1',
      },
      participants,
      roles,
      paBriefs,
      artifacts,
      links,
      messages,
      handRaises,
      consensusItems,
      proposals,
      latestSnapshot: hydrateSnapshot(latestSnapshotRow),
      latestShareToken,
      demoSeatTokens: demoTokensRow ? safeJsonParse(demoTokensRow.value, null) : null,
      presets: Object.values(ROOM_PRESETS),
      templates: Object.values(DELIVERABLE_TEMPLATES),
      personas: SIMULATED_PERSONAS,
      mcpConnectInfo: this.buildMcpConnectInfo(origin),
    };
  }

  /**
   * PRD v5.1 / v5.2: Issue 7-day `participantToken` on join; never allow unauthenticated name spoofing!
   */
  joinParticipant(
    { name, roleTitle = '协作者', avatar = null, color = null },
    headers = {}
  ) {
    const cleanName = String(name || '').trim() || '新成员';
    const nowMs = this.nowFn();
    const now = new Date(nowMs).toISOString();
    const participantToken = generateParticipantToken();
    const tokenExpiresAt = computeFutureIso(nowMs, PARTICIPANT_TOKEN_TTL_MS);

    const existingAuth = this.authenticateParticipant(headers, { optional: true });
    let row = null;

    if (existingAuth) {
      this.db
        .prepare(
          `UPDATE participants
           SET name = ?, avatar = ?, role_title = ?, is_online = 1, last_active_at = ?, token_hash = ?, token_expires_at = ?
           WHERE id = ?`
        )
        .run(
          cleanName,
          makeAvatarText(cleanName, avatar || existingAuth.avatar),
          roleTitle || existingAuth.roleTitle,
          now,
          hashToken(participantToken),
          tokenExpiresAt,
          existingAuth.id
        );
      row = this.db.prepare('SELECT * FROM participants WHERE id = ?').get(existingAuth.id);
    } else {
      const newId = generateId('u');
      this.db
        .prepare(
          `INSERT INTO participants
            (id, name, avatar, color, role_title, is_online, last_active_at, joined_at, token_hash, token_expires_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
        )
        .run(
          newId,
          cleanName,
          makeAvatarText(cleanName, avatar),
          color || pickParticipantColor(cleanName),
          roleTitle || '协作者',
          now,
          now,
          hashToken(participantToken),
          tokenExpiresAt
        );
      row = this.db.prepare('SELECT * FROM participants WHERE id = ?').get(newId);
    }

    const participant = hydrateParticipant(row);
    const { pacingMode, activeHumanCount } = this.recomputePacingMode();

    appendRoomEvent(this.db, {
      eventType: 'participant.joined',
      actorType: 'human',
      actorId: participant.id,
      actorName: participant.name,
      summaryText: `${participant.avatar} ${participant.name}（${participant.roleTitle}）入座圆桌`,
      payload: { participantId: participant.id, pacingMode, activeHumanCount },
      createdAt: now,
    });

    this.emitSse('participant.updated', { participant, pacingMode, activeHumanCount });

    return {
      participantId: participant.id,
      participantToken,
      participant,
      pacingMode,
      activeHumanCount,
      roomMeta: hydrateRoomMeta(this.db.prepare('SELECT * FROM room_meta LIMIT 1').get()),
    };
  }

  /**
   * PRD v5.1 / v5.2: `POST /api/rooms/:roomId/pa-briefs/claim`
   * Binds a pre-submitted PA brief (and any pending signoffs) to the authenticated caller & invalidates `claimCode`.
   */
  claimPaBrief({ claimCode }, headers = {}) {
    const caller = this.authenticateParticipant(headers);
    const cleanCode = String(claimCode || '').trim();
    if (!cleanCode) {
      const err = new Error('claimCode is required');
      err.statusCode = 400;
      throw err;
    }

    const codeHash = hashToken(cleanCode);
    const briefRow = this.db
      .prepare('SELECT * FROM pa_briefs WHERE claim_code_hash = ? LIMIT 1')
      .get(codeHash);

    if (!briefRow) {
      const err = new Error('Invalid or already claimed claimCode');
      err.statusCode = 403;
      throw err;
    }

    if (briefRow.claim_expires_at) {
      const expMs = Date.parse(briefRow.claim_expires_at);
      if (!Number.isNaN(expMs) && expMs <= this.nowFn()) {
        const err = new Error('claimCode has expired');
        err.statusCode = 403;
        throw err;
      }
    }

    const now = this.nowIso();
    const oldPid = briefRow.participant_id;
    const newPid = caller.id;

    if (oldPid !== newPid) {
      // Remove any earlier brief attached to caller so UNIQUE(participant_id) stays clean
      this.db
        .prepare('DELETE FROM pa_briefs WHERE participant_id = ? AND id != ?')
        .run(newPid, briefRow.id);

      this.db
        .prepare('UPDATE pa_briefs SET participant_id = ? WHERE id = ?')
        .run(newPid, briefRow.id);

      // Migrate any consensus items & redline signoffs created while PA was pending claim!
      this.db
        .prepare('UPDATE consensus_items SET owner_participant_id = ? WHERE owner_participant_id = ?')
        .run(newPid, oldPid);

      this.db
        .prepare('UPDATE messages SET sender_id = ? WHERE sender_id = ?')
        .run(newPid, oldPid);

      const relatedCards = this.db
        .prepare('SELECT id, author_id, metadata_json FROM canvas_artifacts')
        .all();
      for (const c of relatedCards) {
        const metaObj = safeJsonParse(c.metadata_json, {});
        let changed = false;
        if (metaObj.ownerParticipantId === oldPid) {
          metaObj.ownerParticipantId = newPid;
          changed = true;
        }
        if (metaObj.participantId === oldPid) {
          metaObj.participantId = newPid;
          changed = true;
        }
        const nextAuthor = c.author_id === oldPid ? newPid : c.author_id;
        if (changed || nextAuthor !== c.author_id) {
          this.db
            .prepare(
              'UPDATE canvas_artifacts SET author_id = ?, metadata_json = ?, updated_at = ? WHERE id = ?'
            )
            .run(nextAuthor, JSON.stringify(metaObj), now, c.id);
        }
      }

      // Remove temporary PENDING_CLAIM seat placeholder
      this.db
        .prepare("DELETE FROM participants WHERE id = ? AND token_hash = 'PENDING_CLAIM'")
        .run(oldPid);
    }

    this.db
      .prepare(
        `UPDATE pa_briefs
         SET claim_code_hash = NULL,
             claim_expires_at = NULL,
             claimed_at = ?,
             claimed_participant_id = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .run(now, newPid, now, briefRow.id);

    const updatedBrief = hydratePaBrief(
      this.db.prepare('SELECT * FROM pa_briefs WHERE id = ?').get(briefRow.id)
    );

    const ev = appendRoomEvent(this.db, {
      eventType: 'pa.brief_claimed',
      actorType: 'human',
      actorId: caller.id,
      actorName: caller.name,
      summaryText: `${caller.name} 已使用一次性认领码绑定个人 Agent 座席`,
      payload: { briefId: updatedBrief.id, participantId: caller.id, previousSeatId: oldPid },
      createdAt: now,
    });

    this.emitSse('pa.brief_updated', {
      participantId: caller.id,
      participant: caller,
      removedParticipantId: oldPid !== newPid ? oldPid : null,
      brief: updatedBrief,
      seq: ev.seq,
    });

    return {
      ok: true,
      participantId: caller.id,
      participant: caller,
      brief: updatedBrief,
    };
  }

  updateRole(roleKey, { enabled, systemInstruction, actorId = 'human' }) {
    const existing = this.db.prepare('SELECT * FROM room_roles WHERE role_key = ?').get(roleKey);
    if (!existing) throw new Error(`Role not found: ${roleKey}`);

    const nextEnabled = enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled;
    const nextInst =
      systemInstruction !== undefined && String(systemInstruction).trim()
        ? String(systemInstruction).trim()
        : existing.system_instruction;

    this.db
      .prepare('UPDATE room_roles SET enabled = ?, system_instruction = ? WHERE role_key = ?')
      .run(nextEnabled, nextInst, roleKey);

    const meta = hydrateRoomMeta(this.db.prepare('SELECT * FROM room_meta LIMIT 1').get());
    const updated = hydrateRoomRole(
      this.db.prepare('SELECT * FROM room_roles WHERE role_key = ?').get(roleKey),
      meta?.presetId
    );

    const ev = appendRoomEvent(this.db, {
      eventType: 'role.updated',
      actorType: 'human',
      actorId,
      actorName: '成员设置',
      summaryText: `${updated.enabled ? '启用' : '关闭'}公共角色「${updated.displayName}」`,
      payload: { roleKey, enabled: updated.enabled },
      createdAt: this.nowIso(),
    });

    this.emitSse('role.updated', { role: updated, seq: ev.seq });
    return updated;
  }

  addCustomRole({
    displayName,
    dimension = 'domain',
    badgeEmoji = '🧭',
    systemInstruction = '',
    focusRisks = '',
    color = '#0D9488',
    actorId = 'human',
  }) {
    const cleanName = String(displayName || '').trim();
    if (!cleanName) throw new Error('displayName is required');
    const roleKey = `custom_${generateId('r').replace(/^r_/, '')}`;
    const validDim = dimension === 'cognitive' ? 'cognitive' : 'domain';
    const fullInst =
      [systemInstruction, focusRisks ? `重点关注风险：${focusRisks}` : '']
        .filter(Boolean)
        .join('；') || `${cleanName}专业视角审视与建议`;

    this.db
      .prepare(
        `INSERT INTO room_roles
          (id, dimension, role_key, display_name, badge_emoji, color, behavior_mode, system_instruction, enabled, hand_raise_count, last_acted_at)
         VALUES (?, ?, ?, ?, ?, ?, 'hand_raise_or_spark', ?, 1, 0, NULL)`
      )
      .run(`role_${roleKey}`, validDim, roleKey, cleanName, badgeEmoji || '🧭', color, fullInst);

    const meta = hydrateRoomMeta(this.db.prepare('SELECT * FROM room_meta LIMIT 1').get());
    const role = hydrateRoomRole(
      this.db.prepare('SELECT * FROM room_roles WHERE role_key = ?').get(roleKey),
      meta?.presetId
    );

    const ev = appendRoomEvent(this.db, {
      eventType: 'role.created',
      actorType: 'human',
      actorId,
      actorName: '成员设置',
      summaryText: `新增自定义岗位角色「${role.badgeEmoji} ${role.displayName}」`,
      payload: { roleKey: role.roleKey, displayName: role.displayName },
      createdAt: this.nowIso(),
    });

    this.emitSse('role.updated', { role, seq: ev.seq });
    return role;
  }

  async postMessage({
    senderId,
    senderName = null,
    content,
    inputModality = 'text',
    voiceDurationMs = null,
    anchorArtifactIds = [],
    mentions = [],
    flushImmediate = false,
  }) {
    const cleanContent = String(content || '').trim();
    if (!cleanContent) throw new Error('Message content cannot be empty');

    const p = this.touchParticipant(senderId);
    const resolvedSenderId = p?.id || senderId || 'u_guest';
    const resolvedSenderName = p?.name || senderName || '协作者';
    const validModality = ['text', 'voice_ptt', 'spatial_voice'].includes(inputModality)
      ? inputModality
      : anchorArtifactIds?.length > 0
        ? 'spatial_voice'
        : 'text';

    const artCountRow = this.db.prepare('SELECT COUNT(*) AS cnt FROM canvas_artifacts').get();
    const wasEmptyBoard = Number(artCountRow?.cnt || 0) === 0;

    const inlineMentions = (cleanContent.match(/@([A-Za-z0-9_\u4e00-\u9fa5]+)/g) || []).map((s) =>
      s.slice(1)
    );
    const mergedMentions = Array.from(
      new Set([...(Array.isArray(mentions) ? mentions : []), ...inlineMentions])
    );

    const msgId = generateId('msg');
    const now = this.nowIso();

    this.db
      .prepare(
        `INSERT INTO messages
          (id, sender_type, sender_id, sender_name, input_modality, content, voice_duration_ms, anchor_artifact_ids_json, mentions_json, promoted_artifact_id, created_at)
         VALUES (?, 'human', ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
      )
      .run(
        msgId,
        resolvedSenderId,
        resolvedSenderName,
        validModality,
        cleanContent,
        voiceDurationMs !== null && voiceDurationMs !== undefined ? Number(voiceDurationMs) : null,
        JSON.stringify(Array.isArray(anchorArtifactIds) ? anchorArtifactIds : []),
        JSON.stringify(mergedMentions),
        now
      );

    let message = hydrateMessage(this.db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId));
    const ev = appendRoomEvent(this.db, {
      eventType: 'message.created',
      actorType: 'human',
      actorId: resolvedSenderId,
      actorName: resolvedSenderName,
      summaryText:
        validModality === 'spatial_voice'
          ? `${resolvedSenderName} 发起空间锚定语音：「${cleanContent.slice(0, 46)}」`
          : `${resolvedSenderName} 发言：「${cleanContent.slice(0, 46)}」`,
      payload: {
        messageId: msgId,
        inputModality: validModality,
        anchorArtifactIds: message.anchorArtifactIds,
      },
      createdAt: now,
    });

    this.emitSse('message.created', { message, seq: ev.seq });

    let coldStartCards = [];
    if (wasEmptyBoard) {
      coldStartCards = runColdStartIcebreaker(this.db, {
        seedText: cleanContent,
        sourceMessageId: msgId,
        emitEvent: (evName, payload) => this.emitSse(evName, payload),
      });
      message = hydrateMessage(this.db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId));
    }

    const fastTrack =
      mergedMentions.length > 0 ||
      message.anchorArtifactIds.length > 0 ||
      validModality === 'spatial_voice' ||
      wasEmptyBoard;

    const triageTask = this.enqueueTriageDelta(
      { kind: 'message', message },
      { fastTrack, flushImmediate }
    );
    if (flushImmediate || this.triageDebounceMs <= 0) {
      await triageTask;
      message = hydrateMessage(this.db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId));
    }

    return { message, coldStartCards };
  }

  resolveOpenCanvasSpot(prefX = 180, prefY = 140, width = 258, height = 195) {
    const existing = this.db
      .prepare('SELECT x, y, width, type FROM canvas_artifacts')
      .all();
    const padX = 28;
    const padY = 26;

    const hitsAny = (cx, cy) =>
      existing.some((r) => {
        const rw = Number(r.width || 256);
        const rh = r.type === 'image' ? 275 : 185;
        return (
          cx < Number(r.x) + rw + padX &&
          cx + width + padX > Number(r.x) &&
          cy < Number(r.y) + rh + padY &&
          cy + height + padY > Number(r.y)
        );
      });

    const baseX = Math.max(60, Math.round(Number(prefX ?? 180)));
    const baseY = Math.max(88, Math.round(Number(prefY ?? 140)));
    if (!hitsAny(baseX, baseY)) return { x: baseX, y: baseY };

    const offsets = [
      [330, 0],
      [0, 240],
      [-330, 0],
      [330, 240],
      [0, -220],
      [660, 0],
      [330, -220],
      [0, 480],
      [660, 240],
    ];
    for (const [dx, dy] of offsets) {
      const tx = Math.max(60, baseX + dx);
      const ty = Math.max(88, baseY + dy);
      if (!hitsAny(tx, ty)) return { x: tx, y: ty };
    }
    return { x: baseX + 42, y: baseY + 260 };
  }

  promoteMessageToBoard(messageId, { actorId = 'human', x = null, y = null } = {}) {
    const msgRow = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    if (!msgRow) throw new Error('Message not found');
    if (msgRow.promoted_artifact_id) {
      const existing = this.db
        .prepare('SELECT * FROM canvas_artifacts WHERE id = ?')
        .get(msgRow.promoted_artifact_id);
      if (existing) return hydrateArtifact(existing);
    }

    const p = this.touchParticipant(actorId);
    const countRow = this.db.prepare('SELECT COUNT(*) AS cnt FROM canvas_artifacts').get();
    const idx = Number(countRow?.cnt || 0);
    const rawX = x !== null && x !== undefined ? Number(x) : 92 + (idx % 2) * 360;
    const rawY = y !== null && y !== undefined ? Number(y) : 110 + Math.floor(idx / 2) * 260;
    const { x: posX, y: posY } = this.resolveOpenCanvasSpot(rawX, rawY, 252, 185);
    const now = this.nowIso();
    const artId = generateId('art');

    this.db
      .prepare(
        `INSERT INTO canvas_artifacts
          (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
         VALUES (?, 'sticky', 'main', ?, ?, 'human', ?, ?, '#FEF9C3', ?, ?, 248, '{}', '{}', ?, 0, ?, ?)`
      )
      .run(
        artId,
        `📌 ${msgRow.sender_name} 发言摘录`,
        msgRow.content,
        msgRow.sender_id,
        msgRow.sender_name,
        posX,
        posY,
        JSON.stringify({ type: 'message', id: messageId, label: `${p?.name || '成员'}贴上桌` }),
        now,
        now
      );

    this.db
      .prepare('UPDATE messages SET promoted_artifact_id = ? WHERE id = ?')
      .run(artId, messageId);
    const artifact = hydrateArtifact(
      this.db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(artId)
    );

    const ev = appendRoomEvent(this.db, {
      eventType: 'artifact.created',
      actorType: 'human',
      actorId: p?.id || actorId,
      actorName: p?.name || '协作者',
      summaryText: `将 ${msgRow.sender_name} 的发言贴上白板`,
      payload: { artifactId: artId, sourceMessageId: messageId, x: posX, y: posY },
      createdAt: now,
    });

    this.emitSse('artifact.upserted', { artifact, seq: ev.seq });
    return artifact;
  }

  async createArtifact({
    type = 'sticky',
    zone = 'main',
    title = '',
    content = '',
    x = 180,
    y = 160,
    width = 248,
    color = '#FEF9C3',
    authorId = 'u_guest',
    authorName = null,
    metadata = {},
    sourceMessageId = null,
    flushImmediate = false,
  }) {
    const p = this.touchParticipant(authorId);
    const resolvedAuthorId = p?.id || authorId;
    const resolvedAuthorName = p?.name || authorName || '协作者';

    const artCountRow = this.db.prepare('SELECT COUNT(*) AS cnt FROM canvas_artifacts').get();
    const wasEmptyBoard = Number(artCountRow?.cnt || 0) === 0;

    const validTypes = [
      'sticky',
      'image',
      'link',
      'prior_room_card',
      'spark_card',
      'pa_quote_card',
      'signoff_card',
    ];
    const resolvedType = validTypes.includes(type) ? type : 'sticky';
    const artId = generateId('art');
    const now = this.nowIso();

    const sourceRef = sourceMessageId
      ? { type: 'message', id: sourceMessageId, label: '关联对话' }
      : null;
    const openPos = this.resolveOpenCanvasSpot(
      Number(x ?? 180),
      Number(y ?? 160),
      Number(width ?? 248),
      resolvedType === 'image' ? 275 : 185
    );

    this.db
      .prepare(
        `INSERT INTO canvas_artifacts
          (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'human', ?, ?, ?, ?, ?, ?, '{}', ?, ?, 0, ?, ?)`
      )
      .run(
        artId,
        resolvedType,
        zone,
        String(title || '').trim(),
        String(content || title || '新卡片').trim(),
        resolvedAuthorId,
        resolvedAuthorName,
        color || '#FEF9C3',
        openPos.x,
        openPos.y,
        Number(width ?? 248),
        JSON.stringify(metadata || {}),
        JSON.stringify(sourceRef),
        now,
        now
      );

    if (sourceMessageId) {
      this.db
        .prepare('UPDATE messages SET promoted_artifact_id = ? WHERE id = ?')
        .run(artId, sourceMessageId);
    }

    const artifact = hydrateArtifact(
      this.db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(artId)
    );

    const ev = appendRoomEvent(this.db, {
      eventType: 'artifact.created',
      actorType: 'human',
      actorId: resolvedAuthorId,
      actorName: resolvedAuthorName,
      summaryText: `${resolvedAuthorName} 贴上了卡片「${artifact.title || artifact.content.slice(0, 24)}」`,
      payload: { artifactId: artId, type: resolvedType, x: artifact.x, y: artifact.y },
      createdAt: now,
    });

    this.emitSse('artifact.upserted', { artifact, seq: ev.seq });

    let coldStartCards = [];
    if (wasEmptyBoard && resolvedType !== 'prior_room_card') {
      coldStartCards = runColdStartIcebreaker(this.db, {
        seedText: `${artifact.title} ${artifact.content}`,
        seedTitle: artifact.title,
        emitEvent: (evName, payload) => this.emitSse(evName, payload),
      });
    }

    const triageTask = this.enqueueTriageDelta(
      { kind: 'artifact', artifact },
      { fastTrack: wasEmptyBoard, flushImmediate }
    );
    if (flushImmediate || this.triageDebounceMs <= 0) {
      await triageTask;
    }

    return { artifact, coldStartCards };
  }

  importPriorShareCard({
    shareBundle,
    shareId,
    shareToken = null,
    x = 120,
    y = 120,
    authorId = 'u_guest',
  }) {
    if (!shareBundle) throw new Error(`Share snapshot not found: ${shareId}`);
    const p = this.touchParticipant(authorId);
    const resolvedAuthorId = p?.id || authorId;
    const resolvedAuthorName = p?.name || '协作者';

    const structured = shareBundle.snapshot?.structured || {};
    const lockedDecisions = structured.skeletonDecisions || [];
    const openQuestions = structured.openQuestions || [];
    const excludedBranches = structured.excludedBranches || [];

    const summaryLines = [];
    if (lockedDecisions.length > 0) {
      summaryLines.push(
        `🔒 已拍板(${lockedDecisions.length})：${lockedDecisions
          .map((d) => d.content)
          .join('；')
          .slice(0, 140)}`
      );
    }
    if (excludedBranches.length > 0) {
      summaryLines.push(
        `❌ 已排除(${excludedBranches.length})：${excludedBranches
          .map((e) => e.title)
          .join('、')
          .slice(0, 80)}`
      );
    }
    if (summaryLines.length === 0) {
      summaryLines.push(String(shareBundle.snapshot?.compiledMarkdown || '').slice(0, 140));
    }

    const artId = generateId('art');
    const now = this.nowIso();
    const sourceTitle = shareBundle.snapshot?.title || shareBundle.roomMeta?.title || '前序定稿会议';

    this.db
      .prepare(
        `INSERT INTO canvas_artifacts
          (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
         VALUES (?, 'prior_room_card', 'main', ?, ?, 'human', ?, ?, '#EEF2FF', ?, ?, 280, '{}', ?, ?, 0, ?, ?)`
      )
      .run(
        artId,
        `🔗 前序会议参考：${sourceTitle}`,
        summaryLines.join('\n'),
        resolvedAuthorId,
        resolvedAuthorName,
        Number(x ?? 120),
        Number(y ?? 120),
        JSON.stringify({
          shareId,
          shareToken: shareToken || null,
          sourceRoomId: shareBundle.roomMeta?.id || null,
          sourceTitle,
          templateId: shareBundle.snapshot?.templateId,
          lockedDecisions,
          openQuestions,
          excludedBranches,
        }),
        JSON.stringify({ type: 'prior_room', id: shareId, label: sourceTitle }),
        now,
        now
      );

    const priorCard = hydrateArtifact(
      this.db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(artId)
    );

    const ev = appendRoomEvent(this.db, {
      eventType: 'artifact.created',
      actorType: 'human',
      actorId: resolvedAuthorId,
      actorName: resolvedAuthorName,
      summaryText: `导入前序会议参考卡：「${sourceTitle}」`,
      payload: { artifactId: artId, shareId, type: 'prior_room_card' },
      createdAt: now,
    });

    this.emitSse('artifact.upserted', { artifact: priorCard, seq: ev.seq });

    const otherCards = this.db
      .prepare("SELECT * FROM canvas_artifacts WHERE id != ? AND type != 'prior_room_card'")
      .all(artId)
      .map(hydrateArtifact);
    const conflictLinks = [];

    for (const card of otherCards) {
      const reason = detectPriorRoomConflict(`${card.title} ${card.content}`, priorCard);
      if (reason) {
        const linkId = generateId('lnk');
        this.db
          .prepare(
            `INSERT INTO artifact_links
              (id, from_artifact_id, to_artifact_id, kind, reason, created_by, vote_a_users_json, vote_b_users_json, created_at)
             VALUES (?, ?, ?, 'conflict', ?, 'linker', '[]', '[]', ?)`
          )
          .run(linkId, card.id, priorCard.id, reason, now);
        const lk = hydrateLink(
          this.db.prepare('SELECT * FROM artifact_links WHERE id = ?').get(linkId)
        );
        conflictLinks.push(lk);
        this.emitSse('link.upserted', { link: lk });
      }
    }

    return { artifact: priorCard, conflictLinks };
  }

  patchArtifact(
    artifactId,
    {
      x,
      y,
      width,
      title,
      content,
      color,
      zone,
      isRejected,
      voteEmoji,
      metadata,
      actorId = 'u_guest',
    }
  ) {
    const existing = this.db
      .prepare('SELECT * FROM canvas_artifacts WHERE id = ?')
      .get(artifactId);
    if (!existing) throw new Error('Artifact not found');

    const p = this.touchParticipant(actorId);
    const uid = p?.id || actorId;
    const uname = p?.name || '协作者';
    const now = this.nowIso();

    const nextX = x !== undefined ? Number(x) : existing.x;
    const nextY = y !== undefined ? Number(y) : existing.y;
    const nextW = width !== undefined ? Number(width) : existing.width;
    const nextTitle = title !== undefined ? String(title) : existing.title;
    const nextContent = content !== undefined ? String(content) : existing.content;
    const nextColor = color !== undefined ? String(color) : existing.color;
    const nextZone = zone !== undefined ? String(zone) : existing.zone;
    const nextRejected =
      isRejected !== undefined ? (isRejected ? 1 : 0) : existing.is_rejected;

    const votes = safeJsonParse(existing.votes_json, {});
    if (voteEmoji) {
      const arr = Array.isArray(votes[voteEmoji]) ? [...votes[voteEmoji]] : [];
      const idx = arr.indexOf(uid);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(uid);
      if (arr.length > 0) votes[voteEmoji] = arr;
      else delete votes[voteEmoji];
    }

    const nextMeta =
      metadata !== undefined
        ? { ...safeJsonParse(existing.metadata_json, {}), ...metadata }
        : safeJsonParse(existing.metadata_json, {});

    this.db
      .prepare(
        `UPDATE canvas_artifacts
         SET x = ?, y = ?, width = ?, title = ?, content = ?, color = ?, zone = ?, is_rejected = ?, votes_json = ?, metadata_json = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        nextX,
        nextY,
        nextW,
        nextTitle,
        nextContent,
        nextColor,
        nextZone,
        nextRejected,
        JSON.stringify(votes),
        JSON.stringify(nextMeta),
        now,
        artifactId
      );

    const updated = hydrateArtifact(
      this.db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(artifactId)
    );

    let eventType = 'artifact.moved';
    let summaryText = `${uname} 调整了卡片「${updated.title || updated.content.slice(0, 18)}」`;
    if (isRejected !== undefined && Boolean(isRejected) !== Boolean(existing.is_rejected)) {
      eventType = 'artifact.rejected';
      summaryText = updated.isRejected
        ? `${uname} 将「${updated.title || updated.content.slice(0, 22)}」标记为已排除分支`
        : `${uname} 恢复了卡片「${updated.title || updated.content.slice(0, 22)}」`;
    }

    const ev = appendRoomEvent(this.db, {
      eventType,
      actorType: 'human',
      actorId: uid,
      actorName: uname,
      summaryText,
      payload: { artifactId, x: updated.x, y: updated.y, isRejected: updated.isRejected },
      createdAt: now,
    });

    this.emitSse('artifact.upserted', { artifact: updated, seq: ev.seq });
    return updated;
  }

  deleteArtifact(artifactId) {
    const existing = this.db
      .prepare('SELECT * FROM canvas_artifacts WHERE id = ?')
      .get(artifactId);
    if (!existing) return { deleted: false };
    this.db.prepare('DELETE FROM canvas_artifacts WHERE id = ?').run(artifactId);
    this.emitSse('artifact.deleted', { artifactId });
    return { deleted: true, artifactId };
  }

  createLink({ fromId, toId, kind = 'derive', reason = '', createdBy = 'human' }) {
    if (!fromId || !toId || fromId === toId) {
      throw new Error('fromId and toId must be two distinct artifact IDs');
    }
    const validKind = ['support', 'derive', 'conflict'].includes(kind) ? kind : 'derive';
    const linkId = generateId('lnk');
    const now = this.nowIso();

    this.db
      .prepare(
        `INSERT INTO artifact_links
          (id, from_artifact_id, to_artifact_id, kind, reason, created_by, vote_a_users_json, vote_b_users_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, '[]', '[]', ?)`
      )
      .run(linkId, fromId, toId, validKind, String(reason || '').trim(), createdBy, now);

    const link = hydrateLink(
      this.db.prepare('SELECT * FROM artifact_links WHERE id = ?').get(linkId)
    );
    const ev = appendRoomEvent(this.db, {
      eventType: 'link.created',
      actorType: createdBy === 'linker' ? 'public_role' : 'human',
      actorId: createdBy,
      actorName: createdBy,
      summaryText: `创建了 ${validKind} 连线：${link.reason || '卡片关联'}`,
      payload: { linkId, fromId, toId, kind: validKind },
      createdAt: now,
    });

    this.emitSse('link.upserted', { link, seq: ev.seq });
    return link;
  }

  patchLink(linkId, { reason, kind, actorId = 'human' } = {}) {
    const row = this.db.prepare('SELECT * FROM artifact_links WHERE id = ?').get(linkId);
    if (!row) throw new Error('Link not found');
    const p = this.touchParticipant(actorId);
    const nextReason =
      reason !== undefined ? String(reason || '').trim() : String(row.reason || '');
    const nextKind = ['support', 'derive', 'conflict'].includes(kind) ? kind : row.kind;

    this.db
      .prepare('UPDATE artifact_links SET kind = ?, reason = ? WHERE id = ?')
      .run(nextKind, nextReason, linkId);

    const updated = hydrateLink(
      this.db.prepare('SELECT * FROM artifact_links WHERE id = ?').get(linkId)
    );
    const ev = appendRoomEvent(this.db, {
      eventType: 'link.created',
      actorType: 'human',
      actorId: p?.id || actorId,
      actorName: p?.name || '协作者',
      summaryText: `更新了连线说明：${updated.reason || updated.kind}`,
      payload: { linkId, kind: updated.kind, reason: updated.reason },
      createdAt: this.nowIso(),
    });
    this.emitSse('link.upserted', { link: updated, seq: ev.seq });
    return updated;
  }

  deleteLink(linkId) {
    const existing = this.db.prepare('SELECT * FROM artifact_links WHERE id = ?').get(linkId);
    if (!existing) return { deleted: false };
    this.db.prepare('DELETE FROM artifact_links WHERE id = ?').run(linkId);
    this.emitSse('link.deleted', { linkId });
    return { deleted: true, linkId };
  }

  /**
   * Direct Spatial Agent Summon on a Canvas Card (`🤖` button OR Drag-and-Drop Role / PA onto Card)
   */
  summonAgentOnArtifact(
    artifactId,
    { targetType = 'role', roleKey = 'spark', participantId = null, promptHint = '', actorId = 'u_guest' } = {}
  ) {
    const targetRow = this.db
      .prepare('SELECT * FROM canvas_artifacts WHERE id = ?')
      .get(artifactId);
    if (!targetRow) throw new Error('Target artifact not found');
    const targetCard = hydrateArtifact(targetRow);
    const caller = this.touchParticipant(actorId);
    const now = this.nowIso();
    const focusLabel = (targetCard.title || targetCard.content || '该便签').slice(0, 18);

    // Case A: Summon a Teammate's Personal Agent (PA) onto this Card
    if (targetType === 'pa' && participantId) {
      const ownerRow = this.db.prepare('SELECT * FROM participants WHERE id = ?').get(participantId);
      const briefRow = this.db
        .prepare('SELECT * FROM pa_briefs WHERE participant_id = ?')
        .get(participantId);
      if (!ownerRow || !briefRow) {
        throw new Error('该成员尚未挂载个人 Agent 立场包');
      }
      const owner = hydrateParticipant(ownerRow);
      const brief = hydratePaBrief(briefRow);

      // Respect context_only boundary!
      if (brief.mode === 'context_only') {
        this.db
          .prepare('UPDATE pa_briefs SET reference_count = reference_count + 1 WHERE id = ?')
          .run(brief.id);
        const updatedBrief = hydratePaBrief(
          this.db.prepare('SELECT * FROM pa_briefs WHERE id = ?').get(brief.id)
        );
        this.emitSse('pa.referenced', { participantId: owner.id, brief: updatedBrief });
        return {
          mode: 'context_only',
          note: `${owner.name} 的 PA 设为「仅背景参考」，已静默提供背景给 Host，不在桌面直接贴卡`,
        };
      }

      const combinedQuery = `${targetCard.title} ${targetCard.content} ${promptHint}`;
      const hitRedline = checkRedlineHit(combinedQuery, brief.redlineTopics || []);

      if (hitRedline) {
        const consItem = createConsensusItem(this.db, {
          section: 'action_item',
          content: `涉及「${focusLabel}」的授权边界项（触发红线：${hitRedline}），需 @${owner.name} 本人确认`,
          status: 'draft',
          ownerParticipantId: owner.id,
          signoffStatus: 'pending_human_signoff',
          actorType: 'pa_proxy',
          actorId: owner.id,
          actorName: `${owner.name}的PA`,
          sourceRefs: [{ type: 'artifact', id: targetCard.id }],
        });
        this.emitSse('consensus.updated', { item: consItem });

        const signCardId = generateId('art');
        const sx = Number(targetCard.x) + 292;
        const sy = Number(targetCard.y) + 28;
        this.db
          .prepare(
            `INSERT INTO canvas_artifacts
              (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
             VALUES (?, 'signoff_card', 'main', ?, ?, 'pa_proxy', ?, ?, '#FFFBEB', ?, ?, 268, '{}', ?, ?, 0, ?, ?)`
          )
          .run(
            signCardId,
            `🛑 需 @${owner.name} 本人签字`,
            `针对「${focusLabel}」触及授权红线（${hitRedline}），PA 不越权承诺，已挂起等待本人签字。`,
            owner.id,
            `${owner.avatar} ${owner.name}·PA`,
            sx,
            sy,
            JSON.stringify({
              consensusItemId: consItem.id,
              ownerParticipantId: owner.id,
              ownerName: owner.name,
              signoffStatus: 'pending_human_signoff',
            }),
            JSON.stringify({ type: 'artifact', id: targetCard.id }),
            now,
            now
          );
        const signCard = hydrateArtifact(
          this.db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(signCardId)
        );
        this.emitSse('artifact.upserted', { artifact: signCard });
        const link = this.createLink({
          fromId: targetCard.id,
          toId: signCardId,
          kind: 'conflict',
          reason: `触发 ${owner.name} 红线待签`,
          createdBy: owner.id,
        });
        return { artifact: signCard, link, redlineTriggered: true };
      }

      // Normal verified PA fact quote card
      this.db
        .prepare('UPDATE pa_briefs SET reference_count = reference_count + 1 WHERE id = ?')
        .run(brief.id);
      const refreshedBrief = hydratePaBrief(
        this.db.prepare('SELECT * FROM pa_briefs WHERE id = ?').get(brief.id)
      );
      this.emitSse('pa.referenced', { participantId: owner.id, brief: refreshedBrief });

      const firstSnippet =
        String(brief.summaryMarkdown || '')
          .split(/\n+/)
          .map((l) => l.replace(/^[-*#\s]+/, '').trim())
          .find((l) => l.length > 4) || '已完成前置技术联调与客观数据核验。';

      const paCardId = generateId('art');
      const px = Number(targetCard.x) + 292;
      const py = Number(targetCard.y) + 24;
      this.db
        .prepare(
          `INSERT INTO canvas_artifacts
            (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
           VALUES (?, 'pa_quote_card', 'main', ?, ?, 'pa_proxy', ?, ?, '#ECFDF5', ?, ?, 262, '{}', ?, ?, 0, ?, ?)`
        )
        .run(
          paCardId,
          `${owner.avatar} ${owner.name}·PA 核实反馈`,
          `结合「${focusLabel}」同步已核实背景：${firstSnippet.slice(0, 110)}`,
          owner.id,
          `${owner.avatar} ${owner.name}·PA`,
          px,
          py,
          JSON.stringify({ verifiedBadge: `${owner.name} PA 已核实事实` }),
          JSON.stringify({ type: 'artifact', id: targetCard.id }),
          now,
          now
        );

      const paCard = hydrateArtifact(
        this.db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(paCardId)
      );
      this.emitSse('agent.cursor_flash', {
        roleKey: 'pa',
        displayName: `${owner.name}·PA`,
        color: '#059669',
        fromPoint: { x: targetCard.x + 220, y: Math.max(40, targetCard.y - 60) },
        toPoint: { x: px + 40, y: py + 36 },
        actionLabel: '贴出核实反馈',
      });
      this.emitSse('artifact.upserted', { artifact: paCard });
      const link = this.createLink({
        fromId: targetCard.id,
        toId: paCardId,
        kind: 'support',
        reason: `${owner.name} PA 事实佐证`,
        createdBy: owner.id,
      });
      return { artifact: paCard, link };
    }

    // Case B: Summon a Public Cognitive / Domain Role Agent onto this Card!
    const roleRow =
      this.db.prepare('SELECT * FROM room_roles WHERE role_key = ?').get(roleKey) ||
      this.db.prepare("SELECT * FROM room_roles WHERE role_key = 'spark'").get() ||
      this.db.prepare('SELECT * FROM room_roles LIMIT 1').get();
    const meta = hydrateRoomMeta(this.db.prepare('SELECT * FROM room_meta LIMIT 1').get());
    const role = roleRow
      ? hydrateRoomRole(roleRow, meta?.presetId)
      : {
          roleKey: 'spark',
          displayName: '跳脱者',
          badgeEmoji: '💡',
          color: '#7C3AED',
          systemInstruction: '逆向破局视角',
        };

    const roleTemplates = {
      spark: {
        title: `💡 跳脱者 · 破局新招`,
        body: `针对「${focusLabel}」逆向发散：如果直接省掉前置配置/登录环节，让用户先拿到核心结果再渐进保存凭证，漏斗转化可提升一倍！`,
        linkKind: 'derive',
        linkReason: '跳脱破局衍生',
        color: '#EDE9FE',
      },
      critic: {
        title: `🔍 挑刺者 · 边界审视`,
        body: `审视「${focusLabel}」的潜在风险：极端弱网重连或恶意高频请求下是否会造成状态污染？建议补充幂等限流兜底。`,
        linkKind: 'conflict',
        linkReason: '风险挑刺审视',
        color: '#FFE4E6',
      },
      linker: {
        title: `🧭 串联者 · 脉络整合`,
        body: `围绕「${focusLabel}」梳理前后脉络：该提议可与当前主方案互补融合，建议直接收敛为一条可验收的拍板共识。`,
        linkKind: 'derive',
        linkReason: '上下文脉络串联',
        color: '#FEF3C7',
      },
      tech_feasibility: {
        title: `🛠 技术评估 · 落地工期`,
        body: `评估「${focusLabel}」工程可行性：直接复用单房间 Durable Object 原生 SQLite 与 Token 哈希校验，约 0.5–1.5 人日即可稳妥上线。`,
        linkKind: 'support',
        linkReason: '技术可行性佐证',
        color: '#E0F2FE',
      },
      cost_risk: {
        title: `🛡 成本风控 · 核算建议`,
        body: `核算「${focusLabel}」成本与合规：通过 3 秒增量防抖 + 按需点将展开，可将推理 Token 消耗压低 75% 以上且满足隔离审计。`,
        linkKind: 'support',
        linkReason: '成本风控核算',
        color: '#DCFCE7',
      },
      target_user: {
        title: `🧑‍💻 目标用户 · 第一体感`,
        body: `站在新用户第一眼看「${focusLabel}」：别让我看复杂说明书，最好双击桌面就能写、指着卡片就能说，3 秒内看到反馈！`,
        linkKind: 'derive',
        linkReason: '一线用户体验反馈',
        color: '#FEF3C7',
      },
    };

    const tpl = roleTemplates[role.roleKey] || {
      title: `${role.badgeEmoji} ${role.displayName} · 专业建议`,
      body: `从「${role.displayName}」视角评估「${focusLabel}」：${role.systemInstruction.slice(0, 48)}，建议明确验收指标与负责人。`,
      linkKind: 'derive',
      linkReason: `${role.displayName}评估`,
      color: '#EDE9FE',
    };

    const newCardId = generateId('art');
    const { x: nx, y: ny } = this.resolveOpenCanvasSpot(
      Number(targetCard.x) + 335,
      Number(targetCard.y) + 18,
      260,
      190
    );

    this.db
      .prepare(
        `INSERT INTO canvas_artifacts
          (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
         VALUES (?, 'spark_card', 'main', ?, ?, 'public_role', ?, ?, ?, ?, ?, 260, '{}', ?, ?, 0, ?, ?)`
      )
      .run(
        newCardId,
        tpl.title,
        tpl.body,
        role.roleKey,
        `${role.badgeEmoji} ${role.displayName}`,
        tpl.color,
        nx,
        ny,
        JSON.stringify({
          confidenceLabel: `${role.displayName} · 针对卡片召唤`,
          stationery: 'washi',
          tintColor: tpl.color,
        }),
        JSON.stringify({ type: 'artifact', id: targetCard.id, summonedBy: caller?.id || actorId }),
        now,
        now
      );

    const createdCard = hydrateArtifact(
      this.db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(newCardId)
    );

    const ev = appendRoomEvent(this.db, {
      eventType: 'artifact.created',
      actorType: 'public_role',
      actorId: role.roleKey,
      actorName: `${role.badgeEmoji} ${role.displayName}`,
      summaryText: `${caller?.name || '成员'} 在卡片「${focusLabel}」上召唤了 ${role.displayName}`,
      payload: { artifactId: newCardId, targetArtifactId: targetCard.id, roleKey: role.roleKey },
      createdAt: now,
    });

    this.emitSse('agent.cursor_flash', {
      roleKey: role.roleKey,
      displayName: `${role.badgeEmoji} ${role.displayName}`,
      color: role.color || '#4F46E5',
      fromPoint: { x: targetCard.x + 210, y: Math.max(40, targetCard.y - 70) },
      toPoint: { x: nx + 40, y: ny + 36 },
      actionLabel: `回应「${focusLabel}」`,
      seq: ev.seq,
    });
    this.emitSse('artifact.upserted', { artifact: createdCard, seq: ev.seq });

    const link = this.createLink({
      fromId: targetCard.id,
      toId: newCardId,
      kind: tpl.linkKind,
      reason: tpl.linkReason,
      createdBy: role.roleKey,
    });

    return { artifact: createdCard, link };
  }

  voteLink(linkId, { userId = 'u_guest', choice = 'A' }) {
    const row = this.db.prepare('SELECT * FROM artifact_links WHERE id = ?').get(linkId);
    if (!row) throw new Error('Link not found');
    this.touchParticipant(userId);

    const voteA = new Set(safeJsonParse(row.vote_a_users_json, []));
    const voteB = new Set(safeJsonParse(row.vote_b_users_json, []));

    if (choice === 'B') {
      voteA.delete(userId);
      if (voteB.has(userId)) voteB.delete(userId);
      else voteB.add(userId);
    } else {
      voteB.delete(userId);
      if (voteA.has(userId)) voteA.delete(userId);
      else voteA.add(userId);
    }

    this.db
      .prepare('UPDATE artifact_links SET vote_a_users_json = ?, vote_b_users_json = ? WHERE id = ?')
      .run(JSON.stringify([...voteA]), JSON.stringify([...voteB]), linkId);

    const updated = hydrateLink(
      this.db.prepare('SELECT * FROM artifact_links WHERE id = ?').get(linkId)
    );
    this.emitSse('link.upserted', { link: updated });
    return updated;
  }

  async expandHandRaise(handRaiseId, { actorId = 'human' } = {}) {
    this.touchParticipant(actorId);
    return expandHandRaiseToBoard(this.db, {
      handRaiseId,
      actorId,
      env: this.env,
      emitEvent: (evName, payload) => this.emitSse(evName, payload),
    });
  }

  dismissHandRaise(handRaiseId) {
    const existing = this.db.prepare('SELECT * FROM hand_raises WHERE id = ?').get(handRaiseId);
    if (!existing) throw new Error('Hand raise not found');
    const now = this.nowIso();
    this.db
      .prepare("UPDATE hand_raises SET status = 'dismissed', resolved_at = ? WHERE id = ?")
      .run(now, handRaiseId);
    const updated = hydrateHandRaise(
      this.db.prepare('SELECT * FROM hand_raises WHERE id = ?').get(handRaiseId)
    );
    this.emitSse('agent.hand_updated', { handRaise: updated });
    return updated;
  }

  /**
   * PRD v5.1 / v5.2: Only the authenticated participant matching `:participantId` can patch their PA brief!
   */
  patchPaBrief(
    participantId,
    { mode, allowedAutoTopics, redlineTopics, summaryMarkdown },
    headers = {}
  ) {
    const caller = this.authenticateParticipant(headers);
    if (caller.id !== participantId) {
      const err = new Error(
        `Forbidden: Only participant ${participantId} can modify their own PA authorization`
      );
      err.statusCode = 403;
      throw err;
    }

    const existing = this.db
      .prepare('SELECT * FROM pa_briefs WHERE participant_id = ?')
      .get(participantId);
    if (!existing) throw new Error('PA brief not found for participant');

    const nextMode =
      mode === 'proxy_tiered' || mode === 'context_only' ? mode : existing.mode;
    const nextAllowed = Array.isArray(allowedAutoTopics)
      ? JSON.stringify(allowedAutoTopics)
      : existing.allowed_auto_topics_json;
    const nextRedlines = Array.isArray(redlineTopics)
      ? JSON.stringify(redlineTopics)
      : existing.redline_topics_json;
    const nextSummary =
      summaryMarkdown !== undefined && String(summaryMarkdown).trim()
        ? String(summaryMarkdown).trim()
        : existing.summary_markdown;
    const now = this.nowIso();

    this.db
      .prepare(
        `UPDATE pa_briefs
         SET mode = ?, allowed_auto_topics_json = ?, redline_topics_json = ?, summary_markdown = ?, updated_at = ?
         WHERE participant_id = ?`
      )
      .run(nextMode, nextAllowed, nextRedlines, nextSummary, now, participantId);

    const brief = hydratePaBrief(
      this.db.prepare('SELECT * FROM pa_briefs WHERE participant_id = ?').get(participantId)
    );
    this.emitSse('pa.brief_updated', { participantId, brief });
    return brief;
  }

  addConsensus({
    section = 'decision',
    content,
    ownerParticipantId = null,
    dueDate = null,
    status = 'draft',
    dependsOnIds = [],
    sourceRefs = [],
    actorId = 'u_guest',
  }) {
    const p = this.touchParticipant(actorId);
    const item = createConsensusItem(this.db, {
      section,
      content,
      ownerParticipantId,
      dueDate,
      status,
      actorType: 'human',
      actorId: p?.id || actorId,
      actorName: p?.name || '协作者',
      dependsOnIds,
      sourceRefs,
    });
    this.emitSse('consensus.updated', { item });
    return item;
  }

  lockOrEditConsensus(itemId, { actorId, content, ownerParticipantId, dueDate, dependsOnIds }) {
    const p = this.touchParticipant(actorId);
    const actorName = p?.name || actorId || '协作者';
    const result = humanLockConsensusItem(this.db, {
      itemId,
      actorId: p?.id || actorId,
      actorName,
      content,
      ownerParticipantId,
      dueDate,
      dependsOnIds,
    });

    this.emitSse('consensus.updated', { item: result.item });
    for (const st of result.staleItems) {
      this.emitSse('consensus.updated', { item: st });
    }
    for (const pr of result.generatedProposals) {
      this.emitSse('proposal.created', { proposal: pr });
    }
    return result;
  }

  /**
   * PRD v5.1 / v5.2: Strict Bearer `participantToken` verification matching `owner_participant_id`
   */
  signoffConsensus(itemId, { decision = 'signed', editedContent }, headers = {}) {
    const caller = this.authenticateParticipant(headers);
    this.touchParticipant(caller.id);

    const res = signoffConsensusItem(this.db, {
      itemId,
      participantId: caller.id,
      participantName: caller.name,
      decision,
      editedContent,
    });

    this.emitSse('consensus.updated', { item: res.item });
    if (res.updatedArtifactRow) {
      this.emitSse('artifact.upserted', {
        artifact: hydrateArtifact(res.updatedArtifactRow),
      });
    }
    return res.item;
  }

  resolveProposal(proposalId, { actorId, decision = 'accepted', editedContent }) {
    const p = this.touchParticipant(actorId);
    const res = resolveRevisionProposal(this.db, {
      proposalId,
      actorId: p?.id || actorId,
      actorName: p?.name || '协作者',
      decision,
      editedContent,
    });
    if (res.item) this.emitSse('consensus.updated', { item: res.item });
    this.emitSse('proposal.updated', { proposal: res.proposal });
    return res;
  }

  async finalizeDeliverable({
    templateId = null,
    actorId = 'u_guest',
    customOutline = '',
    origin = 'https://kokowork.top',
  }) {
    if (this.pendingDeltaBuffer.length > 0) {
      await this.flushTriageNow();
    }

    const p = this.touchParticipant(actorId);
    const actorName = p?.name || '协作者';
    const now = this.nowIso();

    const compiled = await compileDeliverable(this.db, {
      templateId,
      customOutline,
      env: this.env,
    });

    const shareId = encodeShareId(this.roomId);
    const shareToken = generateShareToken();
    const shareTokenHash = hashToken(shareToken);

    const finEvent = appendRoomEvent(this.db, {
      eventType: 'room.finalized',
      actorType: 'human',
      actorId: p?.id || actorId,
      actorName,
      summaryText: `${actorName} 收敛编译生成了业务成品文档（模板：${compiled.templateId}）`,
      payload: { shareId, templateId: compiled.templateId },
      createdAt: now,
    });

    this.db
      .prepare(
        `INSERT INTO deliverable_snapshots
          (id, template_id, title, compiled_markdown, structured_json, raw_event_end_seq, created_by, created_at, share_token_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        shareId,
        compiled.templateId,
        compiled.title,
        compiled.compiledMarkdown,
        JSON.stringify(compiled.structuredJson),
        finEvent.seq,
        actorName,
        now,
        shareTokenHash
      );

    this.db
      .prepare('INSERT OR REPLACE INTO room_internal_kv (key, value) VALUES (?, ?)')
      .run(`share_token:${shareId}`, shareToken);

    this.db
      .prepare("UPDATE room_meta SET status = 'finalized', finalized_at = ? WHERE id = ?")
      .run(now, this.roomId);

    const snapshot = hydrateSnapshot(
      this.db.prepare('SELECT * FROM deliverable_snapshots WHERE id = ?').get(shareId)
    );

    if (this.shareRegistry?.registerShare) {
      await this.shareRegistry.registerShare(shareId, {
        shareId,
        roomId: this.roomId,
        title: snapshot.title,
        templateId: snapshot.templateId,
        createdAt: now,
      });
    }

    const shareUrl = `${origin}/share/${encodeURIComponent(shareId)}?t=${encodeURIComponent(shareToken)}`;
    const mcpConnect = this.buildMcpConnectInfo(origin);

    this.emitSse('room.finalized', {
      snapshot,
      shareId,
      shareToken,
      shareUrl,
      seq: finEvent.seq,
    });

    return {
      snapshot,
      shareId,
      shareToken,
      shareUrl,
      mcpPullCommand: `请调用 omind_pull_deliverable（携带房间或成员凭证）拉取房间 ${mcpConnect.roomUrl} 的成品文档与我的行动项。`,
      mcpConnectInfo: mcpConnect,
    };
  }

  /**
   * PRD v5.1 / v5.2: Read-only Share Snapshot (`GET /api/shares/:shareId`)
   * Requires valid `shareToken` (`?t=...`), and NEVER exposes raw `messages`, `paBriefs`, or `mcpToken`!
   */
  getShareBundle(shareId = null, origin = 'https://kokowork.top', authCtx = {}) {
    let snapRow = shareId
      ? this.db.prepare('SELECT * FROM deliverable_snapshots WHERE id = ?').get(shareId)
      : null;
    if (!snapRow) {
      snapRow = this.db
        .prepare('SELECT * FROM deliverable_snapshots ORDER BY created_at DESC LIMIT 1')
        .get();
    }
    if (!snapRow) return null;

    this.verifyShareAccess(snapRow, authCtx);

    const snapshot = hydrateSnapshot(snapRow);
    const roomMeta = hydrateRoomMeta(this.db.prepare('SELECT * FROM room_meta LIMIT 1').get());
    const eventCountRow = this.db
      .prepare('SELECT COUNT(*) AS cnt FROM room_event_log WHERE seq <= ?')
      .get(snapshot.rawEventEndSeq);

    const providedTok =
      authCtx?.query?.t ||
      authCtx?.query?.shareToken ||
      authCtx?.headers?.['x-share-token'] ||
      '';
    const shareUrl = `${origin}/share/${encodeURIComponent(snapshot.id)}${providedTok ? `?t=${encodeURIComponent(providedTok)}` : ''}`;

    return {
      shareId: snapshot.id,
      shareUrl,
      snapshot,
      roomMeta: {
        id: roomMeta.id,
        title: roomMeta.title,
        presetId: roomMeta.presetId,
        presetName: roomMeta.presetName,
        status: roomMeta.status,
        finalizedAt: roomMeta.finalizedAt,
      },
      templates: Object.values(DELIVERABLE_TEMPLATES),
      replayMeta: {
        totalEvents: Number(eventCountRow?.cnt || 0),
        targetDurationSeconds: 30,
      },
      mcpEndpoint: `${origin}/mcp`,
    };
  }

  /**
   * FR-07.3 & T16: 30-Second Cropped Keyframe Process Replay (`GET /api/shares/:shareId/replay`)
   * Requires valid `shareToken` (`?t=...`).
   */
  getShareReplay(shareId = null, authCtx = {}) {
    const snapRow = shareId
      ? this.db.prepare('SELECT * FROM deliverable_snapshots WHERE id = ?').get(shareId)
      : this.db
          .prepare('SELECT * FROM deliverable_snapshots ORDER BY created_at DESC LIMIT 1')
          .get();

    if (!snapRow) {
      const err = new Error('Share snapshot not found');
      err.statusCode = 404;
      throw err;
    }

    this.verifyShareAccess(snapRow, authCtx);

    const maxSeq = Number(snapRow.raw_event_end_seq);
    const rows = this.db
      .prepare('SELECT * FROM room_event_log WHERE seq <= ? ORDER BY seq ASC')
      .all(maxSeq)
      .map(hydrateEventLog);

    const total = Math.max(1, rows.length);
    const keyframes = rows.map((ev, index) => {
      const progress = total === 1 ? 1 : Number((index / (total - 1)).toFixed(4));
      return {
        seq: ev.seq,
        eventType: ev.eventType,
        actorType: ev.actorType,
        actorName: ev.actorName,
        summaryText: ev.summaryText,
        createdAt: ev.createdAt,
        progress,
        playbackTimeMs: Math.round(progress * 30_000),
      };
    });

    return {
      shareId: snapRow.id,
      roomId: this.roomId,
      totalKeyframes: keyframes.length,
      durationMs: 30_000,
      keyframes,
    };
  }

  getEventsAfterSeq(lastSeq = 0) {
    const seqNum = Number(lastSeq || 0);
    if (Number.isNaN(seqNum) || seqNum < 0) return [];
    return this.db
      .prepare('SELECT * FROM room_event_log WHERE seq > ? ORDER BY seq ASC LIMIT 200')
      .all(seqNum)
      .map((row) => {
        const ev = hydrateEventLog(row);
        return {
          seq: ev.seq,
          sseEvent: EVENT_TO_SSE_MAP[ev.eventType] || 'room.event',
          data: {
            ...ev.payload,
            eventType: ev.eventType,
            summaryText: ev.summaryText,
            actorName: ev.actorName,
            createdAt: ev.createdAt,
            seq: ev.seq,
          },
        };
      });
  }

  async executeMcp({ toolName, toolArgs, providedToken }) {
    return executeRoomMcpTool(this.db, {
      toolName,
      args: toolArgs,
      providedToken,
      emitEvent: (evName, payload) => this.emitSse(evName, payload),
      env: this.env,
      nowMs: this.nowFn(),
    });
  }

  /**
   * Dispatch internal room-scoped HTTP JSON action (used by both Node router and DO fetch)
   */
  async handleRoomRequest(
    method,
    subPath,
    { query = {}, body = {}, origin = 'https://kokowork.top', headers = {} } = {}
  ) {
    const flushImmediate =
      Boolean(body?.flushImmediate) || headers['x-omind-flush-triage'] === '1';

    try {
      if (method === 'POST' && subPath === '/init') {
        const created = this.createRoom({ ...body, origin });
        return { status: 201, body: created };
      }

      if (!this.isInitialized()) {
        return { status: 404, body: { error: `Room not found: ${this.roomId}` } };
      }

      if (method === 'GET' && (subPath === '' || subPath === '/')) {
        return {
          status: 200,
          body: this.getFullState({ participantId: query.participantId, origin }),
        };
      }

      if (method === 'POST' && subPath === '/join') {
        return { status: 200, body: this.joinParticipant(body, headers) };
      }

      if (method === 'POST' && subPath === '/reset-starter') {
        return { status: 200, body: this.resetStarterCase({ ...body, origin }) };
      }

      if (method === 'POST' && subPath === '/cursor') {
        const { participantId, name, color, x, y } = body;
        this.emitSse('peer.cursor', { participantId, name, color, x, y });
        return { status: 200, body: { ok: true } };
      }

      if (method === 'POST' && subPath === '/triage-flush') {
        const res = await this.flushTriageNow();
        return { status: 200, body: { ok: true, result: res } };
      }

      // Roles
      if (method === 'POST' && subPath === '/roles') {
        const role = this.addCustomRole(body);
        return { status: 201, body: { role } };
      }

      const roleMatch = subPath.match(/^\/roles\/([^/]+)$/);
      if (method === 'PATCH' && roleMatch) {
        const roleKey = decodeURIComponent(roleMatch[1]);
        const role = this.updateRole(roleKey, body);
        return { status: 200, body: { role } };
      }

      // Messages & Promote
      if (method === 'POST' && subPath === '/messages') {
        const res = await this.postMessage({ ...body, flushImmediate });
        return { status: 201, body: res };
      }

      const promoteMatch = subPath.match(/^\/messages\/([^/]+)\/promote$/);
      if (method === 'POST' && promoteMatch) {
        const artifact = this.promoteMessageToBoard(decodeURIComponent(promoteMatch[1]), body);
        return { status: 201, body: { artifact } };
      }

      // Artifacts & Prior Share Import
      if (method === 'POST' && subPath === '/artifacts') {
        const res = await this.createArtifact({ ...body, flushImmediate });
        return { status: 201, body: res };
      }

      if (method === 'POST' && subPath === '/artifacts/import-share') {
        const res = this.importPriorShareCard(body);
        return { status: 201, body: res };
      }

      const artSummonMatch = subPath.match(/^\/artifacts\/([^/]+)\/summon-agent$/);
      if (method === 'POST' && artSummonMatch) {
        const res = this.summonAgentOnArtifact(decodeURIComponent(artSummonMatch[1]), body);
        return { status: 201, body: res };
      }

      const artMatch = subPath.match(/^\/artifacts\/([^/]+)$/);
      if (artMatch) {
        const artId = decodeURIComponent(artMatch[1]);
        if (method === 'PATCH') {
          const artifact = this.patchArtifact(artId, body);
          return { status: 200, body: { artifact } };
        }
        if (method === 'DELETE') {
          return { status: 200, body: this.deleteArtifact(artId) };
        }
      }

      // Links & Link Capsule Actions
      if (method === 'POST' && subPath === '/links') {
        const link = this.createLink(body);
        return { status: 201, body: { link } };
      }

      const linkItemMatch = subPath.match(/^\/links\/([^/]+)$/);
      if (linkItemMatch) {
        const linkId = decodeURIComponent(linkItemMatch[1]);
        if (method === 'PATCH') {
          const link = this.patchLink(linkId, body);
          return { status: 200, body: { link } };
        }
        if (method === 'DELETE') {
          return { status: 200, body: this.deleteLink(linkId) };
        }
      }

      const linkVoteMatch = subPath.match(/^\/links\/([^/]+)\/vote$/);
      if (method === 'POST' && linkVoteMatch) {
        const link = this.voteLink(decodeURIComponent(linkVoteMatch[1]), body);
        return { status: 200, body: { link } };
      }

      const linkEvalMatch = subPath.match(/^\/links\/([^/]+)\/parallel-eval$/);
      if (method === 'POST' && linkEvalMatch) {
        const cards = await evaluateConflictParallel(this.db, {
          linkId: decodeURIComponent(linkEvalMatch[1]),
          actorId: body.actorId,
          emitEvent: (e, p) => this.emitSse(e, p),
        });
        return { status: 201, body: { artifacts: cards } };
      }

      const linkSynthMatch = subPath.match(/^\/links\/([^/]+)\/synthesize$/);
      if (method === 'POST' && linkSynthMatch) {
        const res = synthesizeDeriveLink(this.db, {
          linkId: decodeURIComponent(linkSynthMatch[1]),
          actorId: body.actorId,
          emitEvent: (e, p) => this.emitSse(e, p),
        });
        return { status: 201, body: res };
      }

      // Hand Raises
      const hrExpandMatch = subPath.match(/^\/hand-raises\/([^/]+)\/expand$/);
      if (method === 'POST' && hrExpandMatch) {
        const res = await this.expandHandRaise(decodeURIComponent(hrExpandMatch[1]), body);
        return { status: 200, body: res };
      }

      const hrDismissMatch = subPath.match(/^\/hand-raises\/([^/]+)\/dismiss$/);
      if (method === 'POST' && hrDismissMatch) {
        const hr = this.dismissHandRaise(decodeURIComponent(hrDismissMatch[1]));
        return { status: 200, body: { handRaise: hr } };
      }

      // PA Briefs: Claim, Submit & Authenticated Seat Control
      if (method === 'POST' && subPath === '/pa-briefs/claim') {
        const res = this.claimPaBrief(body, headers);
        return { status: 200, body: res };
      }

      if (method === 'POST' && subPath === '/pa-briefs') {
        const bearerTok = extractBearerToken(headers);
        const res = await this.executeMcp({
          toolName: 'omind_submit_pa_brief',
          toolArgs: { roomUrl: this.roomId, ...body },
          providedToken: bearerTok || body.roomToken || null,
        });
        return { status: 201, body: res };
      }

      const paPatchMatch = subPath.match(/^\/pa-briefs\/([^/]+)$/);
      if (method === 'PATCH' && paPatchMatch) {
        const brief = this.patchPaBrief(decodeURIComponent(paPatchMatch[1]), body, headers);
        return { status: 200, body: { brief } };
      }

      // Consensus, Lock, Redline Signoff & Proposals
      if (method === 'POST' && subPath === '/consensus') {
        const item = this.addConsensus(body);
        return { status: 201, body: { item } };
      }

      const consLockMatch = subPath.match(/^\/consensus\/([^/]+)\/lock$/);
      if (method === 'POST' && consLockMatch) {
        const res = this.lockOrEditConsensus(decodeURIComponent(consLockMatch[1]), body);
        return { status: 200, body: res };
      }

      const consSignoffMatch = subPath.match(/^\/consensus\/([^/]+)\/signoff$/);
      if (method === 'POST' && consSignoffMatch) {
        const item = this.signoffConsensus(decodeURIComponent(consSignoffMatch[1]), body, headers);
        return { status: 200, body: { item } };
      }

      const propResolveMatch = subPath.match(/^\/proposals\/([^/]+)\/resolve$/);
      if (method === 'POST' && propResolveMatch) {
        const res = this.resolveProposal(decodeURIComponent(propResolveMatch[1]), body);
        return { status: 200, body: res };
      }

      // Finalize & Share Retrieval (with shareToken enforcement)
      if (method === 'POST' && subPath === '/finalize') {
        const res = await this.finalizeDeliverable({ ...body, origin });
        return { status: 201, body: res };
      }

      const shareGetMatch = subPath.match(/^\/share-bundle\/([^/]+)$/);
      if (method === 'GET' && shareGetMatch) {
        const sid = decodeURIComponent(shareGetMatch[1]);
        const bundle = this.getShareBundle(sid === 'latest' ? null : sid, origin, {
          query,
          headers,
        });
        if (!bundle) return { status: 404, body: { error: 'Share snapshot not found' } };
        return { status: 200, body: bundle };
      }

      const shareReplayMatch = subPath.match(/^\/share-replay\/([^/]+)$/);
      if (method === 'GET' && shareReplayMatch) {
        const sid = decodeURIComponent(shareReplayMatch[1]);
        return {
          status: 200,
          body: this.getShareReplay(sid === 'latest' ? null : sid, { query, headers }),
        };
      }

      if (method === 'POST' && subPath === '/mcp-exec') {
        const out = await this.executeMcp(body);
        return { status: 200, body: out };
      }

      return { status: 404, body: { error: `Unknown room route: ${method} ${subPath}` } };
    } catch (err) {
      const code =
        err instanceof ForbiddenSignoffError || err?.statusCode === 403
          ? 403
          : err?.statusCode || 400;
      return {
        status: code,
        body: { error: err.message || 'Room operation failed' },
      };
    }
  }
}
