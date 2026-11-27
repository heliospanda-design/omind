/**
 * Omind v5.2 — Standard Streamable HTTP MCP Server (`/mcp`, MCP 2025-03-26 JSON-RPC 2.0)
 * Exposes the 4 room-scoped tools per PRD v5.2 Section 4.3 with full v5.1 Auth & RAW Isolation:
 *   1. `omind_get_room_topic`
 *   2. `omind_submit_pa_brief` (issues one-time `claimCode` when submitted via `roomMcpToken`)
 *   3. `omind_pull_deliverable` (requires `participantToken` or `roomMcpToken`)
 *   4. `omind_query_room_raw` (requires `participantToken` or `roomMcpToken`; strictly blocks `shareToken`)
 */

import { compileDeliverable } from './compiler.mjs';
import {
  CLAIM_CODE_TTL_MS,
  appendRoomEvent,
  computeFutureIso,
  decodeRoomIdFromShareId,
  generateClaimCode,
  generateId,
  hashToken,
  hydrateArtifact,
  hydrateEventLog,
  hydrateLink,
  hydrateMessage,
  hydratePaBrief,
  hydrateParticipant,
  hydrateRoomMeta,
  hydrateSnapshot,
} from './db-core.mjs';
import { DEFAULT_REDLINE_TOPICS, makeAvatarText, pickParticipantColor } from './presets.mjs';

export const MCP_TOOLS_MANIFEST = [
  {
    name: 'omind_get_room_topic',
    description:
      '会前读取 Omind 房间议题、预设类型、已启用公共角色及当前白板概况，供本地 PA 搜集精准背景资料。',
    inputSchema: {
      type: 'object',
      properties: {
        roomUrl: { type: 'string', description: 'Omind 房间链接或 roomId' },
        roomToken: { type: 'string', description: '房间级凭证或 participantToken（亦可通过 Bearer Header 传递）' },
      },
      required: ['roomUrl'],
    },
  },
  {
    name: 'omind_submit_pa_brief',
    description:
      '会前由参会人本地 PA 经本人确认后，携带凭证向 Omind 房间投递脱敏背景事实、倾向立场与红线边界，返回一次性 claimCode 供本人进房认领。',
    inputSchema: {
      type: 'object',
      properties: {
        roomUrl: { type: 'string' },
        roomToken: { type: 'string', description: '房间级凭证或已有 participantToken' },
        participantName: { type: 'string', description: '投递人姓名' },
        sourceClient: {
          type: 'string',
          enum: ['cursor', 'claude_code', 'claude_desktop', 'feishu_assistant', 'other'],
        },
        mode: {
          type: 'string',
          enum: ['context_only', 'proxy_tiered'],
          default: 'context_only',
        },
        summaryMarkdown: { type: 'string', description: '脱敏背景与立场综述（≤ 800 字）' },
        facts: {
          type: 'array',
          items: { type: 'string' },
          description: '已核实的客观事实条目（如 PR 压测数据、排期占用）',
        },
        stances: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              topic: { type: 'string' },
              position: { type: 'string' },
              rationale: { type: 'string' },
            },
            required: ['topic', 'position'],
          },
        },
        allowedAutoTopics: { type: 'array', items: { type: 'string' } },
        redlineTopics: { type: 'array', items: { type: 'string' } },
      },
      required: ['roomUrl', 'participantName', 'summaryMarkdown', 'roomToken'],
    },
  },
  {
    name: 'omind_pull_deliverable',
    description:
      '会后一键拉取最终定稿的业务成品文档、人类拍板锁定决策、分配给本人的行动项以及已排除避坑附录。',
    inputSchema: {
      type: 'object',
      properties: {
        roomOrShareUrl: {
          type: 'string',
          description: 'Omind 房间链接、分享页链接或 shareId',
        },
        token: {
          type: 'string',
          description: 'participantToken 或 roomMcpToken',
        },
        ownerFilter: {
          type: 'string',
          description: '可选：按成员姓名或 ID 筛选分配给本人的行动项',
        },
      },
      required: ['roomOrShareUrl', 'token'],
    },
  },
  {
    name: 'omind_query_room_raw',
    description:
      '下游执行遇到细节疑问时，按关键词或问题按需穿透检索本场会议的 RAW 原始语音、便签、连线争议与 PA 原简报（严禁凭公开 shareToken 访问）。',
    inputSchema: {
      type: 'object',
      properties: {
        roomOrShareUrl: { type: 'string' },
        token: {
          type: 'string',
          description: '必须为 participantToken 或 roomMcpToken',
        },
        query: {
          type: 'string',
          description: '要回查的具体细节问题或关键词（如：为什么放弃 WebSocket）',
        },
        topK: { type: 'integer', default: 8, maximum: 20 },
      },
      required: ['roomOrShareUrl', 'token', 'query'],
    },
  },
];

/**
 * Parse roomId, shareId, room/participant token, and shareToken (`?t=...`) from URL or ID string
 */
export function parseRoomOrShareRef(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) return { roomId: null, shareId: null, token: null, shareToken: null };

  if (raw.includes('://') || raw.startsWith('/') || raw.startsWith('?')) {
    try {
      const u = new URL(raw, 'https://kokowork.top');
      const qRoom = u.searchParams.get('room') || u.searchParams.get('roomId');
      const qShare = u.searchParams.get('share') || u.searchParams.get('shareId');
      const qToken =
        u.searchParams.get('token') ||
        u.searchParams.get('mcpToken') ||
        u.searchParams.get('roomToken');
      const qShareToken = u.searchParams.get('t') || u.searchParams.get('shareToken');
      const pathRoom =
        u.pathname.match(/\/api\/rooms\/([^/]+)/)?.[1] ||
        u.pathname.match(/^\/(?:room|r)\/([^/]+)/)?.[1] ||
        (u.pathname === '/starter' ? 'room_starter_v5' : null);
      const pathShare =
        u.pathname.match(/\/api\/shares\/([^/]+)/)?.[1] ||
        u.pathname.match(/^\/(?:share|s)\/([^/]+)/)?.[1];

      const shareId = qShare || (pathShare ? decodeURIComponent(pathShare) : null);
      let roomId = qRoom || (pathRoom ? decodeURIComponent(pathRoom) : null);
      if (!roomId && shareId) {
        roomId = decodeRoomIdFromShareId(shareId);
      }
      return { roomId, shareId, token: qToken, shareToken: qShareToken };
    } catch {
      // Fall through to bare ID checks
    }
  }

  if (raw.startsWith('shr_')) {
    return {
      roomId: decodeRoomIdFromShareId(raw),
      shareId: raw,
      token: null,
      shareToken: null,
    };
  }

  return { roomId: raw, shareId: null, token: null, shareToken: null };
}

/**
 * Strict v5.1/v5.2 credential check for MCP tools:
 * Accepts `roomMcpToken` or unexpired `participantToken`; explicitly blocks `shareToken`!
 */
export function verifyRoomOrParticipantToken(db, rawToken, nowMs = Date.now()) {
  const clean = String(rawToken || '').trim();
  if (!clean) {
    const err = new Error('Unauthorized: roomMcpToken or participantToken is required');
    err.code = -32001;
    err.statusCode = 401;
    throw err;
  }

  const metaRow = db.prepare('SELECT * FROM room_meta LIMIT 1').get();
  if (!metaRow) {
    const err = new Error('Target room does not exist');
    err.code = -32000;
    err.statusCode = 404;
    throw err;
  }

  const incomingHash = hashToken(clean);

  // 1. Room-level MCP token
  if (incomingHash === metaRow.mcp_access_token_hash) {
    return { kind: 'room_mcp', participant: null };
  }

  // 2. Participant Bearer token
  const pRow = db
    .prepare(
      "SELECT * FROM participants WHERE token_hash = ? AND token_hash NOT IN ('', 'PENDING_CLAIM') LIMIT 1"
    )
    .get(incomingHash);

  if (pRow) {
    const expMs = Date.parse(pRow.token_expires_at || '');
    if (!Number.isNaN(expMs) && expMs <= nowMs) {
      const err = new Error('Unauthorized: participantToken has expired');
      err.code = -32001;
      err.statusCode = 401;
      throw err;
    }
    return { kind: 'participant', participant: hydrateParticipant(pRow) };
  }

  // 3. Explicitly detect and block read-only `shareToken` from penetrating MCP / RAW!
  const snapMatch = db
    .prepare('SELECT id FROM deliverable_snapshots WHERE share_token_hash = ? LIMIT 1')
    .get(incomingHash);
  if (snapMatch || clean.startsWith('st_')) {
    const err = new Error(
      'Forbidden: shareToken is read-only for public deliverable preview and cannot access MCP or RAW context'
    );
    err.code = -32001;
    err.statusCode = 403;
    throw err;
  }

  const err = new Error('Unauthorized: Invalid roomMcpToken or participantToken');
  err.code = -32001;
  err.statusCode = 401;
  throw err;
}

function tokenizeQueryForRawSearch(query) {
  const clean = String(query || '').trim().toLowerCase();
  const tokens = new Set();
  if (!clean) return [];

  tokens.add(clean);

  const eng = clean.match(/[a-z0-9_#-]{2,}/g) || [];
  for (const w of eng) tokens.add(w);

  const stripped = clean.replace(
    /(为什么|为何|怎么|如何|什么|哪些|关于|请问|当时|会议里|讨论的)/g,
    ' '
  );
  const cjkRuns = stripped.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  for (const run of cjkRuns) {
    tokens.add(run);
    for (let i = 0; i <= run.length - 2; i += 1) {
      tokens.add(run.slice(i, i + 2));
    }
  }

  if (/(放弃|排除|否决|不用|为什么不)/.test(clean)) {
    tokens.add('排除');
    tokens.add('放弃');
    tokens.add('conflict');
  }
  return [...tokens].filter((t) => t.length >= 2);
}

function scoreCorpusEntry(text, query, tokens) {
  const hay = String(text || '').toLowerCase();
  if (!hay) return 0;
  const fullQ = String(query || '').trim().toLowerCase();
  let score = 0;
  if (fullQ && hay.includes(fullQ)) score += 12;
  for (const tok of tokens) {
    if (hay.includes(tok)) {
      score += tok.length >= 3 ? 4 : 2;
    }
  }
  return score;
}

/**
 * Execute one of the 4 MCP tools directly against a Room's SQLite DB
 */
export async function executeRoomMcpTool(
  db,
  {
    toolName,
    args = {},
    providedToken = null,
    emitEvent = null,
    env = {},
    nowMs = Date.now(),
  }
) {
  const metaRow = db.prepare('SELECT * FROM room_meta LIMIT 1').get();
  if (!metaRow) {
    throw new Error('Target room does not exist or has not been initialized');
  }

  const parsedTarget = parseRoomOrShareRef(args.roomUrl || args.roomOrShareUrl || '');
  const candidateToken =
    args.roomToken ||
    args.token ||
    providedToken ||
    parsedTarget.token ||
    parsedTarget.shareToken ||
    null;

  // Enforce v5.1/v5.2 credential check on all 4 MCP endpoints
  const auth = verifyRoomOrParticipantToken(db, candidateToken, nowMs);
  const meta = hydrateRoomMeta(metaRow);

  if (toolName === 'omind_get_room_topic') {
    const activeRoles = db
      .prepare('SELECT * FROM room_roles WHERE enabled = 1 ORDER BY dimension ASC')
      .all()
      .map((r) => `${r.badge_emoji} ${r.display_name} (${r.role_key})`);

    const existingArtifactHeadlines = db
      .prepare(
        'SELECT title, content FROM canvas_artifacts WHERE is_rejected = 0 ORDER BY created_at DESC LIMIT 15'
      )
      .all()
      .map((a) =>
        a.title ? `${a.title}：${String(a.content).slice(0, 48)}` : String(a.content).slice(0, 60)
      );

    const openQuestions = db
      .prepare(
        "SELECT content FROM consensus_items WHERE section = 'open_question' OR status != 'locked' ORDER BY created_at DESC LIMIT 10"
      )
      .all()
      .map((q) => q.content);

    return {
      roomId: meta.id,
      title: meta.title,
      presetId: meta.presetId,
      topicSummary: meta.topicSummary || meta.title,
      activeRoles,
      existingArtifactHeadlines,
      openQuestions,
    };
  }

  if (toolName === 'omind_submit_pa_brief') {
    const participantName = String(args.participantName || auth.participant?.name || '').trim();
    const summaryMarkdown = String(args.summaryMarkdown || '').trim().slice(0, 800);
    if (!participantName || !summaryMarkdown) {
      throw new Error('participantName and summaryMarkdown are required');
    }

    const mode = args.mode === 'proxy_tiered' ? 'proxy_tiered' : 'context_only';
    const sourceClient = args.sourceClient || 'other';
    const nowIso = new Date(nowMs).toISOString();

    let participantRow = null;
    let claimCode = null;
    let claimExpiresAt = null;
    let seatStatus = 'pending_claim';

    if (auth.kind === 'participant' && auth.participant) {
      // Authenticated directly with a human participant's own Bearer token -> auto-claim!
      participantRow = db
        .prepare('SELECT * FROM participants WHERE id = ?')
        .get(auth.participant.id);
      seatStatus = 'claimed';
    } else {
      // Submitted via room-level MCP token prior to human joining -> create/reuse PENDING_CLAIM seat & issue one-time claimCode
      participantRow = db
        .prepare(
          "SELECT * FROM participants WHERE LOWER(name) = LOWER(?) AND token_hash = 'PENDING_CLAIM' LIMIT 1"
        )
        .get(participantName);

      if (!participantRow) {
        const newPid = generateId('u');
        db.prepare(
          `INSERT INTO participants
            (id, name, avatar, color, role_title, is_online, last_active_at, joined_at, token_hash, token_expires_at)
           VALUES (?, ?, ?, ?, 'PA 待认领座席', 0, ?, ?, 'PENDING_CLAIM', '')`
        ).run(
          newPid,
          participantName,
          makeAvatarText(participantName),
          pickParticipantColor(participantName),
          nowIso,
          nowIso
        );
        participantRow = db.prepare('SELECT * FROM participants WHERE id = ?').get(newPid);
      }

      claimCode = generateClaimCode();
      claimExpiresAt = computeFutureIso(nowMs, CLAIM_CODE_TTL_MS);
      seatStatus = 'pending_claim';
    }

    const participant = hydrateParticipant(participantRow);
    const mergedRedlines = Array.from(
      new Set([
        ...DEFAULT_REDLINE_TOPICS,
        ...(Array.isArray(args.redlineTopics) ? args.redlineTopics : []),
      ])
    );

    const existingBrief = db
      .prepare('SELECT * FROM pa_briefs WHERE participant_id = ?')
      .get(participant.id);

    const briefId = existingBrief ? existingBrief.id : generateId('brief');
    const factsJson = JSON.stringify(Array.isArray(args.facts) ? args.facts : []);
    const stancesJson = JSON.stringify(Array.isArray(args.stances) ? args.stances : []);
    const allowedJson = JSON.stringify(
      Array.isArray(args.allowedAutoTopics) ? args.allowedAutoTopics : []
    );
    const redlinesJson = JSON.stringify(mergedRedlines);
    const claimHash = claimCode ? hashToken(claimCode) : null;
    const claimedAtVal = seatStatus === 'claimed' ? nowIso : null;
    const claimedPidVal = seatStatus === 'claimed' ? participant.id : null;

    if (existingBrief) {
      db.prepare(
        `UPDATE pa_briefs
         SET source_client = ?,
             mode = ?,
             summary_markdown = ?,
             facts_json = ?,
             stances_json = ?,
             allowed_auto_topics_json = ?,
             redline_topics_json = ?,
             claim_code_hash = ?,
             claim_expires_at = ?,
             claimed_at = ?,
             claimed_participant_id = ?,
             updated_at = ?
         WHERE id = ?`
      ).run(
        sourceClient,
        mode,
        summaryMarkdown,
        factsJson,
        stancesJson,
        allowedJson,
        redlinesJson,
        claimHash,
        claimExpiresAt,
        claimedAtVal,
        claimedPidVal,
        nowIso,
        briefId
      );
    } else {
      db.prepare(
        `INSERT INTO pa_briefs
          (id, participant_id, source_client, mode, summary_markdown, facts_json, stances_json, allowed_auto_topics_json, redline_topics_json, reference_count, submitted_at, updated_at, claim_code_hash, claim_expires_at, claimed_at, claimed_participant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
      ).run(
        briefId,
        participant.id,
        sourceClient,
        mode,
        summaryMarkdown,
        factsJson,
        stancesJson,
        allowedJson,
        redlinesJson,
        nowIso,
        nowIso,
        claimHash,
        claimExpiresAt,
        claimedAtVal,
        claimedPidVal
      );
    }

    const hydratedBrief = hydratePaBrief(
      db.prepare('SELECT * FROM pa_briefs WHERE id = ?').get(briefId)
    );

    const ev = appendRoomEvent(db, {
      eventType: 'pa.brief_submitted',
      actorType: 'pa_proxy',
      actorId: participant.id,
      actorName: `${participant.name} (${sourceClient})`,
      summaryText: `${participant.name} 通过 MCP 投递了 PA 立场包（模式：${mode === 'proxy_tiered' ? '分级代答' : '仅上下文'}，状态：${seatStatus === 'claimed' ? '已绑定' : '待认领'}）`,
      payload: { briefId, participantId: participant.id, mode, sourceClient, seatStatus },
      createdAt: nowIso,
    });

    emitEvent?.('pa.brief_updated', {
      participant,
      brief: hydratedBrief,
      seq: ev.seq,
    });

    return {
      ok: true,
      briefId,
      participantId: participant.id,
      claimCode,
      claimExpiresAt,
      seatStatus,
      appliedMode: mode,
      redlineGuardActive: true,
    };
  }

  if (toolName === 'omind_pull_deliverable') {
    const ref = parseRoomOrShareRef(args.roomOrShareUrl);
    let snapRow = ref.shareId
      ? db.prepare('SELECT * FROM deliverable_snapshots WHERE id = ?').get(ref.shareId)
      : null;
    if (!snapRow) {
      snapRow = db
        .prepare('SELECT * FROM deliverable_snapshots ORDER BY created_at DESC LIMIT 1')
        .get();
    }

    const rawCountRow = db.prepare('SELECT COUNT(*) AS cnt FROM room_event_log').get();
    const rawEventCount = Number(rawCountRow?.cnt || 0);

    let shareId = null;
    let templateId = meta.defaultTemplateId;
    let compiledMarkdown = '';
    let structured = null;

    if (snapRow) {
      const snap = hydrateSnapshot(snapRow);
      shareId = snap.id;
      templateId = snap.templateId;
      compiledMarkdown = snap.compiledMarkdown;
      structured = snap.structured;
    } else {
      const liveCompiled = await compileDeliverable(db, { env });
      shareId = `live_${meta.id}`;
      templateId = liveCompiled.templateId;
      compiledMarkdown = liveCompiled.compiledMarkdown;
      structured = liveCompiled.structuredJson;
    }

    const ownerFilter = String(args.ownerFilter || '').trim().toLowerCase();
    const allActions = structured?.actionItems || [];
    const myActionItems = ownerFilter
      ? allActions.filter(
          (a) =>
            String(a.ownerName || '').toLowerCase().includes(ownerFilter) ||
            String(a.ownerParticipantId || '').toLowerCase() === ownerFilter ||
            String(a.content || '').toLowerCase().includes(ownerFilter)
        )
      : allActions;

    return {
      shareId,
      title: meta.title,
      templateId,
      compiledMarkdown,
      lockedDecisions: structured?.skeletonDecisions || [],
      myActionItems,
      pendingSignoffs: structured?.pendingSignoffs || [],
      excludedBranches: structured?.excludedBranches || [],
      rawEventCount,
    };
  }

  if (toolName === 'omind_query_room_raw') {
    const query = String(args.query || '').trim();
    const topK = Math.min(20, Math.max(1, Number(args.topK || 8)));
    const tokens = tokenizeQueryForRawSearch(query);

    const candidates = [];

    // 1. Messages (Air Stream + Spatial Voice)
    const messages = db
      .prepare('SELECT * FROM messages ORDER BY created_at DESC')
      .all()
      .map(hydrateMessage);
    for (const m of messages) {
      const sc = scoreCorpusEntry(`${m.senderName} ${m.content}`, query, tokens);
      if (sc > 0) {
        candidates.push({
          score: sc + (m.inputModality === 'spatial_voice' ? 2 : 0),
          seq: 0,
          sourceType: 'message',
          author: m.senderName,
          timestamp: m.createdAt,
          content: `[${m.inputModality}] ${m.content}`,
          relatedArtifactIds: m.anchorArtifactIds.length
            ? m.anchorArtifactIds
            : m.promotedArtifactId
              ? [m.promotedArtifactId]
              : [],
        });
      }
    }

    // 2. Canvas Artifacts (including rejected branches!)
    const artifacts = db.prepare('SELECT * FROM canvas_artifacts').all().map(hydrateArtifact);
    for (const a of artifacts) {
      const rejectTag = a.isRejected ? '[已排除分支] ' : '';
      const text = `${rejectTag}${a.title} ${a.content} ${JSON.stringify(a.metadata || {})}`;
      const sc = scoreCorpusEntry(text, query, tokens);
      if (sc > 0) {
        candidates.push({
          score: sc + (a.isRejected ? 3 : 1),
          seq: 0,
          sourceType: 'artifact',
          author: a.authorName,
          timestamp: a.createdAt,
          content: `${rejectTag}${a.title ? `${a.title}：` : ''}${a.content}`,
          relatedArtifactIds: [a.id],
        });
      }
    }

    // 3. Semantic Links
    const links = db.prepare('SELECT * FROM artifact_links').all().map(hydrateLink);
    const artTitleMap = new Map(artifacts.map((a) => [a.id, a.title || a.content.slice(0, 20)]));
    for (const l of links) {
      const desc = `[${l.kind}] ${artTitleMap.get(l.fromArtifactId) || l.fromArtifactId} <-> ${artTitleMap.get(l.toArtifactId) || l.toArtifactId}：${l.reason}`;
      const sc = scoreCorpusEntry(desc, query, tokens);
      if (sc > 0) {
        candidates.push({
          score: sc + (l.kind === 'conflict' ? 2 : 0),
          seq: 0,
          sourceType: 'link',
          author: l.createdBy,
          timestamp: l.createdAt,
          content: desc,
          relatedArtifactIds: [l.fromArtifactId, l.toArtifactId],
        });
      }
    }

    // 4. PA Briefs
    const paBriefs = db.prepare('SELECT * FROM pa_briefs').all().map(hydratePaBrief);
    const pMap = new Map(
      db.prepare('SELECT * FROM participants').all().map((p) => [p.id, p.name])
    );
    for (const b of paBriefs) {
      const ownerName = pMap.get(b.participantId) || b.participantId;
      const body = `${ownerName} PA简报：${b.summaryMarkdown} 事实：${b.facts.join('；')} 立场：${b.stances.map((s) => `${s.topic}:${s.position}`).join('；')}`;
      const sc = scoreCorpusEntry(body, query, tokens);
      if (sc > 0) {
        candidates.push({
          score: sc + 1,
          seq: 0,
          sourceType: 'pa_brief',
          author: `${ownerName} PA (${b.sourceClient})`,
          timestamp: b.submittedAt,
          content: body,
          relatedArtifactIds: [],
        });
      }
    }

    // 5. Immutable Room Event Log
    const events = db
      .prepare('SELECT * FROM room_event_log ORDER BY seq DESC')
      .all()
      .map(hydrateEventLog);
    for (const e of events) {
      const sc = scoreCorpusEntry(`${e.summaryText} ${JSON.stringify(e.payload)}`, query, tokens);
      if (sc > 0) {
        candidates.push({
          score: sc,
          seq: e.seq,
          sourceType: 'event',
          author: e.actorName,
          timestamp: e.createdAt,
          content: `[#E${e.seq}] ${e.summaryText}`,
          relatedArtifactIds: e.payload?.artifactId ? [e.payload.artifactId] : [],
        });
      }
    }

    for (const item of candidates) {
      if (!item.seq && events.length > 0) {
        const nearest =
          events.find((ev) => ev.createdAt <= item.timestamp) || events[events.length - 1];
        item.seq = nearest?.seq || 1;
      }
    }

    candidates.sort((a, b) => b.score - a.score || b.seq - a.seq);

    const selected =
      candidates.length > 0
        ? candidates.slice(0, topK)
        : events.slice(0, Math.min(topK, 5)).map((e) => ({
            seq: e.seq,
            sourceType: 'event',
            author: e.actorName,
            timestamp: e.createdAt,
            content: `[#E${e.seq}] ${e.summaryText}`,
            relatedArtifactIds: e.payload?.artifactId ? [e.payload.artifactId] : [],
          }));

    return {
      totalMatched: candidates.length,
      snippets: selected.map(({ score, ...rest }) => rest),
    };
  }

  const err = new Error(`Unknown MCP tool: ${toolName}`);
  err.code = -32601;
  throw err;
}

/**
 * Format JSON-RPC 2.0 envelope for Streamable HTTP MCP (`POST /mcp`)
 */
export async function handleMcpJsonRpcPayload(
  rpcBody,
  {
    authHeader = '',
    resolveRoomExecutor,
  }
) {
  const bearerMatch = String(authHeader || '').match(/^Bearer\s+(.+)$/i);
  const headerToken = bearerMatch ? bearerMatch[1].trim() : null;

  const processOne = async (reqObj) => {
    if (!reqObj || typeof reqObj !== 'object') {
      return {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid JSON-RPC Request' },
      };
    }

    const { id, method, params = {} } = reqObj;

    if (method === 'notifications/initialized' || method?.startsWith('notifications/')) {
      return null;
    }

    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: id ?? null,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: 'omind-v5-room-mcp',
            version: '5.2.0',
          },
        },
      };
    }

    if (method === 'ping') {
      return { jsonrpc: '2.0', id: id ?? null, result: {} };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: id ?? null,
        result: {
          tools: MCP_TOOLS_MANIFEST,
        },
      };
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      const rawTarget = toolArgs.roomUrl || toolArgs.roomOrShareUrl || params?.roomUrl || '';
      const parsedRef = parseRoomOrShareRef(rawTarget);
      const effectiveToken =
        headerToken ||
        toolArgs.roomToken ||
        toolArgs.token ||
        parsedRef.token ||
        parsedRef.shareToken ||
        null;

      try {
        const payload = await resolveRoomExecutor({
          parsedRef,
          toolName,
          toolArgs,
          providedToken: effectiveToken,
        });

        return {
          jsonrpc: '2.0',
          id: id ?? null,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(payload, null, 2),
              },
            ],
            structuredContent: payload,
            isError: false,
          },
        };
      } catch (err) {
        return {
          jsonrpc: '2.0',
          id: id ?? null,
          error: {
            code: err.code || -32000,
            message: err.message || 'MCP tool execution failed',
          },
        };
      }
    }

    return {
      jsonrpc: '2.0',
      id: id ?? null,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    };
  };

  if (Array.isArray(rpcBody)) {
    const results = (await Promise.all(rpcBody.map(processOne))).filter(Boolean);
    return { status: results.length > 0 ? 200 : 202, body: results.length > 0 ? results : null };
  }

  const single = await processOne(rpcBody);
  if (!single) return { status: 202, body: null };
  return { status: 200, body: single };
}
