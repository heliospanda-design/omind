/**
 * Omind v5.2 — 1-Room-1-DO SQLite Core Schema, Token Helpers, Hydrators, Event Log & Seed Data
 * Includes v5.1 Auth/Claim/ShareToken DDL + Idempotent Live DO Column Migrations.
 * Works identically in Cloudflare Workers SQLite Durable Objects and Node.js (node:sqlite).
 */

import crypto from 'node:crypto';
import {
  BUILTIN_ROLE_CATALOG,
  DEFAULT_REDLINE_TOPICS,
  ROOM_PRESETS,
  makeAvatarText,
  pickParticipantColor,
} from './presets.mjs';

export const PARTICIPANT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const CLAIM_CODE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function safeJsonParse(raw, fallback) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

export function generateId(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function generateMcpToken() {
  return `omind_mcp_${crypto.randomBytes(16).toString('hex')}`;
}

export function generateParticipantToken() {
  return `ptk_${crypto.randomBytes(16).toString('hex')}`;
}

export function generateShareToken() {
  return `st_${crypto.randomBytes(16).toString('hex')}`;
}

export function generateClaimCode() {
  return `claim_${crypto.randomBytes(8).toString('hex')}`;
}

export function computeFutureIso(nowMs = Date.now(), ttlMs = PARTICIPANT_TOKEN_TTL_MS) {
  return new Date(nowMs + ttlMs).toISOString();
}

/**
 * Encodes roomId inside shareId using only [a-zA-Z0-9_-] characters (PRD FR-01.3 regex safe),
 * paired with KV Share Registry (shareId -> { roomId, title, createdAt }).
 */
export function encodeShareId(roomId) {
  const b64 = Buffer.from(String(roomId), 'utf8').toString('base64url');
  const nonce = crypto.randomBytes(3).toString('hex');
  return `shr_${b64}__${nonce}`;
}

export function decodeRoomIdFromShareId(shareId) {
  const raw = String(shareId || '').trim();
  const match = raw.match(/^shr_([A-Za-z0-9_-]+)__([0-9a-f]{6})$/);
  if (!match) return null;
  try {
    return Buffer.from(match[1], 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Exact 12-table DDL per PRD v5.2 Section 3 + Safe Idempotent Column Upgrades for Live DOs
 */
export function initRoomSchema(db) {
  try {
    db.exec('PRAGMA foreign_keys = ON;');
  } catch {
    // Ignore if environment manages foreign keys differently
  }

  db.exec(`
    -- 1. 房间元数据（单 DO 仅存 1 条记录）
    CREATE TABLE IF NOT EXISTS room_meta (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      topic_summary TEXT NOT NULL DEFAULT '',
      preset_id TEXT NOT NULL CHECK(preset_id IN ('brainstorm_breakthrough', 'decision_review', 'schedule_align')),
      default_template_id TEXT NOT NULL DEFAULT 'prd_or_decision_memo',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'finalized')),
      pacing_mode TEXT NOT NULL DEFAULT 'solo' CHECK(pacing_mode IN ('solo', 'multiplayer')),
      mcp_access_token_hash TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      finalized_at TEXT
    );

    -- 2. 参会成员（支持免注册昵称快速进房 + v5.1 Bearer Token 校验）
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT NOT NULL,
      color TEXT NOT NULL,
      role_title TEXT NOT NULL DEFAULT '协作者',
      is_online INTEGER NOT NULL DEFAULT 1,
      last_active_at TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      token_hash TEXT NOT NULL DEFAULT '',
      token_expires_at TEXT NOT NULL DEFAULT ''
    );

    -- 3. 公共房间角色 Agent 配置（思维角色 + 业务岗位双维拼装）
    CREATE TABLE IF NOT EXISTS room_roles (
      id TEXT PRIMARY KEY,
      dimension TEXT NOT NULL CHECK(dimension IN ('cognitive', 'domain')),
      role_key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      badge_emoji TEXT NOT NULL,
      color TEXT NOT NULL,
      behavior_mode TEXT NOT NULL CHECK(behavior_mode IN ('silent_board', 'hand_raise_or_spark')),
      system_instruction TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      hand_raise_count INTEGER NOT NULL DEFAULT 0,
      last_acted_at TEXT
    );

    -- 4. 个人 Agent（PA）会前投递立场上下文包（含 v5.1 一次性 claimCode 认领机制）
    CREATE TABLE IF NOT EXISTS pa_briefs (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL UNIQUE,
      source_client TEXT NOT NULL DEFAULT 'mcp_external',
      mode TEXT NOT NULL DEFAULT 'context_only' CHECK(mode IN ('context_only', 'proxy_tiered')),
      summary_markdown TEXT NOT NULL,
      facts_json TEXT NOT NULL DEFAULT '[]',
      stances_json TEXT NOT NULL DEFAULT '[]',
      allowed_auto_topics_json TEXT NOT NULL DEFAULT '[]',
      redline_topics_json TEXT NOT NULL DEFAULT '["排期死线变更","预算报价承诺","核心目标拍板","敏感凭据"]',
      reference_count INTEGER NOT NULL DEFAULT 0,
      submitted_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      claim_code_hash TEXT,
      claim_expires_at TEXT,
      claimed_at TEXT,
      claimed_participant_id TEXT,
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    );

    -- 5. 对话流（空气层：文字 + 按住说语音条 + 空间锚定语音）
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_type TEXT NOT NULL CHECK(sender_type IN ('human', 'public_role', 'pa_proxy')),
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      input_modality TEXT NOT NULL DEFAULT 'text' CHECK(input_modality IN ('text', 'voice_ptt', 'spatial_voice')),
      content TEXT NOT NULL,
      voice_duration_ms INTEGER,
      anchor_artifact_ids_json TEXT NOT NULL DEFAULT '[]',
      mentions_json TEXT NOT NULL DEFAULT '[]',
      promoted_artifact_id TEXT,
      created_at TEXT NOT NULL
    );

    -- 6. 白板元素（焦点层）
    CREATE TABLE IF NOT EXISTS canvas_artifacts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('sticky', 'image', 'link', 'prior_room_card', 'spark_card', 'pa_quote_card', 'signoff_card')),
      zone TEXT NOT NULL DEFAULT 'main' CHECK(zone IN ('main', 'spark_zone', 'cluster_context', 'cluster_solution', 'cluster_conflict', 'cluster_action')),
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      author_type TEXT NOT NULL CHECK(author_type IN ('human', 'public_role', 'pa_proxy')),
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#FEF9C3',
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL DEFAULT 240,
      votes_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      source_ref_json TEXT NOT NULL DEFAULT 'null',
      is_rejected INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 7. 语义连线（三色虚线）
    CREATE TABLE IF NOT EXISTS artifact_links (
      id TEXT PRIMARY KEY,
      from_artifact_id TEXT NOT NULL,
      to_artifact_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('support', 'derive', 'conflict')),
      reason TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      vote_a_users_json TEXT NOT NULL DEFAULT '[]',
      vote_b_users_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      FOREIGN KEY (from_artifact_id) REFERENCES canvas_artifacts(id) ON DELETE CASCADE,
      FOREIGN KEY (to_artifact_id) REFERENCES canvas_artifacts(id) ON DELETE CASCADE
    );

    -- 8. 举手懒加载记录表
    CREATE TABLE IF NOT EXISTS hand_raises (
      id TEXT PRIMARY KEY,
      role_key TEXT NOT NULL,
      teaser TEXT NOT NULL,
      trigger_context_json TEXT NOT NULL,
      target_artifact_ids_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'raised_teaser' CHECK(status IN ('raised_teaser', 'expanding', 'expanded', 'dismissed', 'folded')),
      expanded_artifact_id TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    -- 9. 结构化共识与行动项（拍板锁定 + 上下游过期传导 + PA 红线待签）
    CREATE TABLE IF NOT EXISTS consensus_items (
      id TEXT PRIMARY KEY,
      section TEXT NOT NULL CHECK(section IN ('context', 'decision', 'open_question', 'action_item')),
      content TEXT NOT NULL,
      owner_participant_id TEXT,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'locked', 'stale_upstream')),
      signoff_status TEXT NOT NULL DEFAULT 'none' CHECK(signoff_status IN ('none', 'pending_human_signoff', 'signed', 'rejected')),
      locked_by TEXT,
      locked_at TEXT,
      depends_on_ids_json TEXT NOT NULL DEFAULT '[]',
      source_refs_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 10. 锁定项修订提案
    CREATE TABLE IF NOT EXISTS revision_proposals (
      id TEXT PRIMARY KEY,
      target_item_id TEXT NOT NULL,
      original_content TEXT NOT NULL,
      proposed_content TEXT NOT NULL,
      reason TEXT NOT NULL,
      triggered_by_item_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (target_item_id) REFERENCES consensus_items(id) ON DELETE CASCADE
    );

    -- 11. 追加写事件流（支撑 RAW 穿透检索 + 30 秒倍速回放）
    CREATE TABLE IF NOT EXISTS room_event_log (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      summary_text TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- 12. 定稿交付快照（不可变成品 + v5.1 shareToken 哈希）
    CREATE TABLE IF NOT EXISTS deliverable_snapshots (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      title TEXT NOT NULL,
      compiled_markdown TEXT NOT NULL,
      structured_json TEXT NOT NULL,
      raw_event_end_seq INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      share_token_hash TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS room_internal_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Safe idempotent migrations for pre-existing v5.0 Durable Objects on Cloudflare
  const alterStatements = [
    "ALTER TABLE participants ADD COLUMN token_hash TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE participants ADD COLUMN token_expires_at TEXT NOT NULL DEFAULT ''",
    'ALTER TABLE pa_briefs ADD COLUMN claim_code_hash TEXT',
    'ALTER TABLE pa_briefs ADD COLUMN claim_expires_at TEXT',
    'ALTER TABLE pa_briefs ADD COLUMN claimed_at TEXT',
    'ALTER TABLE pa_briefs ADD COLUMN claimed_participant_id TEXT',
    "ALTER TABLE deliverable_snapshots ADD COLUMN share_token_hash TEXT NOT NULL DEFAULT ''",
  ];
  for (const stmt of alterStatements) {
    try {
      db.exec(stmt);
    } catch {
      // Column already exists
    }
  }
}

export function hydrateRoomMeta(row, presetOverride = null) {
  if (!row) return null;
  const preset = presetOverride || ROOM_PRESETS[row.preset_id] || ROOM_PRESETS.decision_review;
  return {
    id: row.id,
    title: row.title,
    topicSummary: row.topic_summary || '',
    presetId: row.preset_id,
    presetName: preset.name,
    presetEmoji: preset.emoji,
    recommendedDomainRoles: preset.recommendedDomainRoles,
    defaultTemplateId: row.default_template_id,
    status: row.status,
    pacingMode: row.pacing_mode,
    createdBy: row.created_by,
    createdAt: row.created_at,
    finalizedAt: row.finalized_at,
  };
}

export function hydrateParticipant(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    color: row.color,
    roleTitle: row.role_title,
    isOnline: Boolean(row.is_online),
    pendingClaim: row.token_hash === 'PENDING_CLAIM',
    lastActiveAt: row.last_active_at,
    joinedAt: row.joined_at,
  };
}

export function hydrateRoomRole(row, presetId = 'decision_review') {
  if (!row) return null;
  const preset = ROOM_PRESETS[presetId] || ROOM_PRESETS.decision_review;
  return {
    id: row.id,
    dimension: row.dimension,
    roleKey: row.role_key,
    displayName: row.display_name,
    badgeEmoji: row.badge_emoji,
    color: row.color,
    behaviorMode: row.behavior_mode,
    systemInstruction: row.system_instruction,
    enabled: Boolean(row.enabled),
    recommended: preset.recommendedDomainRoles.includes(row.role_key),
    handRaiseCount: Number(row.hand_raise_count || 0),
    lastActedAt: row.last_acted_at,
  };
}

export function hydratePaBrief(row) {
  if (!row) return null;
  return {
    id: row.id,
    participantId: row.participant_id,
    sourceClient: row.source_client,
    mode: row.mode,
    summaryMarkdown: row.summary_markdown,
    facts: safeJsonParse(row.facts_json, []),
    stances: safeJsonParse(row.stances_json, []),
    allowedAutoTopics: safeJsonParse(row.allowed_auto_topics_json, []),
    redlineTopics: safeJsonParse(row.redline_topics_json, DEFAULT_REDLINE_TOPICS),
    referenceCount: Number(row.reference_count || 0),
    pendingClaim: Boolean(row.claim_code_hash && !row.claimed_at),
    claimedAt: row.claimed_at || null,
    claimedParticipantId: row.claimed_participant_id || null,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
}

export function hydrateMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    senderType: row.sender_type,
    senderId: row.sender_id,
    senderName: row.sender_name,
    inputModality: row.input_modality,
    content: row.content,
    voiceDurationMs:
      row.voice_duration_ms !== null && row.voice_duration_ms !== undefined
        ? Number(row.voice_duration_ms)
        : null,
    anchorArtifactIds: safeJsonParse(row.anchor_artifact_ids_json, []),
    mentions: safeJsonParse(row.mentions_json, []),
    promotedArtifactId: row.promoted_artifact_id || null,
    createdAt: row.created_at,
  };
}

export function hydrateArtifact(row) {
  if (!row) return null;
  const votes = safeJsonParse(row.votes_json, {});
  let totalVotes = 0;
  for (const arr of Object.values(votes)) {
    if (Array.isArray(arr)) totalVotes += arr.length;
  }
  return {
    id: row.id,
    type: row.type,
    zone: row.zone,
    title: row.title || '',
    content: row.content,
    authorType: row.author_type,
    authorId: row.author_id,
    authorName: row.author_name,
    color: row.color,
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width || 240),
    votes,
    totalVotes,
    metadata: safeJsonParse(row.metadata_json, {}),
    sourceRef: safeJsonParse(row.source_ref_json, null),
    isRejected: Boolean(row.is_rejected),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function hydrateLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    fromArtifactId: row.from_artifact_id,
    toArtifactId: row.to_artifact_id,
    kind: row.kind,
    reason: row.reason || '',
    createdBy: row.created_by,
    voteAUsers: safeJsonParse(row.vote_a_users_json, []),
    voteBUsers: safeJsonParse(row.vote_b_users_json, []),
    createdAt: row.created_at,
  };
}

export function hydrateHandRaise(row) {
  if (!row) return null;
  return {
    id: row.id,
    roleKey: row.role_key,
    teaser: row.teaser,
    triggerContext: safeJsonParse(row.trigger_context_json, {}),
    targetArtifactIds: safeJsonParse(row.target_artifact_ids_json, []),
    status: row.status,
    expandedArtifactId: row.expanded_artifact_id || null,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at || null,
  };
}

export function hydrateConsensusItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    section: row.section,
    content: row.content,
    ownerParticipantId: row.owner_participant_id || null,
    dueDate: row.due_date || null,
    status: row.status,
    signoffStatus: row.signoff_status || 'none',
    lockedBy: row.locked_by || null,
    lockedAt: row.locked_at || null,
    dependsOnIds: safeJsonParse(row.depends_on_ids_json, []),
    sourceRefs: safeJsonParse(row.source_refs_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function hydrateProposal(row) {
  if (!row) return null;
  return {
    id: row.id,
    targetItemId: row.target_item_id,
    originalContent: row.original_content,
    proposedContent: row.proposed_content,
    reason: row.reason,
    triggeredByItemId: row.triggered_by_item_id || null,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at || null,
  };
}

export function hydrateEventLog(row) {
  if (!row) return null;
  return {
    seq: Number(row.seq),
    eventType: row.event_type,
    actorType: row.actor_type,
    actorId: row.actor_id,
    actorName: row.actor_name,
    summaryText: row.summary_text,
    payload: safeJsonParse(row.payload_json, {}),
    createdAt: row.created_at,
  };
}

export function hydrateSnapshot(row) {
  if (!row) return null;
  return {
    id: row.id,
    shareId: row.id,
    templateId: row.template_id,
    title: row.title,
    compiledMarkdown: row.compiled_markdown,
    structured: safeJsonParse(row.structured_json, {}),
    rawEventEndSeq: Number(row.raw_event_end_seq || 0),
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function appendRoomEvent(
  db,
  {
    eventType,
    actorType = 'system',
    actorId = 'system',
    actorName = 'Omind',
    summaryText = '',
    payload = {},
    createdAt = new Date().toISOString(),
  }
) {
  const inserted = db
    .prepare(
      `INSERT INTO room_event_log
        (event_type, actor_type, actor_id, actor_name, summary_text, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING *`
    )
    .get(
      eventType,
      actorType,
      actorId,
      actorName,
      summaryText || eventType,
      JSON.stringify(payload ?? {}),
      createdAt
    );

  if (inserted) return hydrateEventLog(inserted);

  const fallback = db.prepare('SELECT * FROM room_event_log ORDER BY seq DESC LIMIT 1').get();
  return hydrateEventLog(fallback);
}

/**
 * Initialize a brand-new room according to 1 of the 3 presets (PRD FR-01.1 + v5.1 Auth)
 */
export function initPresetRoom(
  db,
  {
    roomId,
    title,
    topicSummary = '',
    presetId = 'decision_review',
    creatorName = '发起人',
    creatorAvatar = null,
    creatorColor = null,
    creatorRoleTitle = '房间发起人',
    creatorId = null,
    creatorParticipantToken = null,
    mcpToken = null,
    enableRecommendedDomain = false,
    now = new Date().toISOString(),
  }
) {
  const existing = db.prepare('SELECT * FROM room_meta LIMIT 1').get();
  if (existing) {
    const savedTok = db.prepare("SELECT value FROM room_internal_kv WHERE key = 'mcp_token'").get();
    const creator = db.prepare('SELECT * FROM participants ORDER BY joined_at ASC LIMIT 1').get();
    return {
      roomMeta: hydrateRoomMeta(existing),
      creator: hydrateParticipant(creator),
      creatorParticipantToken: null,
      mcpToken: savedTok?.value || null,
    };
  }

  const preset = ROOM_PRESETS[presetId] || ROOM_PRESETS.decision_review;
  const token = mcpToken || generateMcpToken();
  const tokenHash = hashToken(token);
  const pId = creatorId || generateId('u');
  const pToken = creatorParticipantToken || generateParticipantToken();
  const nowMs = Date.parse(now) || Date.now();
  const pExpiresAt = computeFutureIso(nowMs, PARTICIPANT_TOKEN_TTL_MS);

  db.prepare(
    `INSERT INTO room_meta
      (id, title, topic_summary, preset_id, default_template_id, status, pacing_mode, mcp_access_token_hash, created_by, created_at, finalized_at)
     VALUES (?, ?, ?, ?, ?, 'active', 'solo', ?, ?, ?, NULL)`
  ).run(roomId, title, topicSummary, preset.id, preset.defaultTemplateId, tokenHash, pId, now);

  db.prepare("INSERT OR REPLACE INTO room_internal_kv (key, value) VALUES ('mcp_token', ?)").run(
    token
  );

  db.prepare(
    `INSERT INTO participants
      (id, name, avatar, color, role_title, is_online, last_active_at, joined_at, token_hash, token_expires_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
  ).run(
    pId,
    creatorName,
    makeAvatarText(creatorName, creatorAvatar),
    creatorColor || pickParticipantColor(creatorName),
    creatorRoleTitle,
    now,
    now,
    hashToken(pToken),
    pExpiresAt
  );

  const insertRole = db.prepare(
    `INSERT INTO room_roles
      (id, dimension, role_key, display_name, badge_emoji, color, behavior_mode, system_instruction, enabled, hand_raise_count, last_acted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`
  );

  for (const r of BUILTIN_ROLE_CATALOG) {
    const isEnabled =
      preset.enabledCognitiveRoles.includes(r.roleKey) ||
      (enableRecommendedDomain && preset.recommendedDomainRoles.includes(r.roleKey));
    insertRole.run(
      `role_${r.roleKey}`,
      r.dimension,
      r.roleKey,
      r.displayName,
      r.badgeEmoji,
      r.color,
      r.behaviorMode,
      r.systemInstruction,
      isEnabled ? 1 : 0
    );
  }

  appendRoomEvent(db, {
    eventType: 'room.created',
    actorType: 'human',
    actorId: pId,
    actorName: creatorName,
    summaryText: `${creatorName} 开启了「${preset.name}」：${title}`,
    payload: { roomId, title, presetId: preset.id, defaultTemplateId: preset.defaultTemplateId },
    createdAt: now,
  });

  return {
    roomMeta: hydrateRoomMeta(db.prepare('SELECT * FROM room_meta LIMIT 1').get(), preset),
    creator: hydrateParticipant(db.prepare('SELECT * FROM participants WHERE id = ?').get(pId)),
    creatorParticipantToken: pToken,
    mcpToken: token,
  };
}

/**
 * Rich flagship v5.2 showcase room (`room_showcase_v5`) with cute Emoji avatars & valid seat tokens
 */
export function seedShowcaseRoom(db, roomId = 'room_showcase_v5') {
  const existing = db.prepare('SELECT * FROM room_meta LIMIT 1').get();
  if (existing) {
    // Backfill demo seat tokens & cute avatars if upgraded from an older v5.0 DO instance
    const hasDemoKv = db
      .prepare("SELECT value FROM room_internal_kv WHERE key = 'demo_seat_tokens'")
      .get();
    if (!hasDemoKv) {
      const exp = '2099-12-31T23:59:59.000Z';
      const demoTokens = {
        u_lin: 'ptk_demo_showcase_lin',
        u_chen: 'ptk_demo_showcase_chen',
        u_zhou: 'ptk_demo_showcase_zhou',
      };
      for (const [uid, tok] of Object.entries(demoTokens)) {
        db.prepare(
          'UPDATE participants SET token_hash = ?, token_expires_at = ? WHERE id = ?'
        ).run(hashToken(tok), exp, uid);
      }
      db.prepare("UPDATE participants SET avatar = '🦊' WHERE id = 'u_lin'").run();
      db.prepare("UPDATE participants SET avatar = '🐱' WHERE id = 'u_chen'").run();
      db.prepare("UPDATE participants SET avatar = '🐨' WHERE id = 'u_zhou'").run();
      db.prepare(
        "INSERT OR REPLACE INTO room_internal_kv (key, value) VALUES ('is_demo_room', '1')"
      ).run();
      db.prepare(
        "INSERT OR REPLACE INTO room_internal_kv (key, value) VALUES ('demo_seat_tokens', ?)"
      ).run(JSON.stringify(demoTokens));
    }
    return;
  }

  const t0 = '2026-11-26T01:00:00.000Z';
  const farFuture = '2099-12-31T23:59:59.000Z';
  const token = 'omind_mcp_showcase_v5_demo_token';
  const demoTokens = {
    u_lin: 'ptk_demo_showcase_lin',
    u_chen: 'ptk_demo_showcase_chen',
    u_zhou: 'ptk_demo_showcase_zhou',
  };

  initPresetRoom(db, {
    roomId,
    title: 'Omind v5.2 实时同步网关与 PA 授权边界拍板会',
    topicSummary:
      '确定单房 SQLite DO 下采用 SSE + Last-Event-ID 还是 WebSocket，并对齐后端与客户端排期边界。',
    presetId: 'decision_review',
    creatorName: '林岚',
    creatorAvatar: '🦊',
    creatorColor: '#4F46E5',
    creatorRoleTitle: '产品负责人',
    creatorId: 'u_lin',
    creatorParticipantToken: demoTokens.u_lin,
    mcpToken: token,
    enableRecommendedDomain: true,
    now: t0,
  });

  db.prepare("UPDATE participants SET token_expires_at = ? WHERE id = 'u_lin'").run(farFuture);

  const insertP = db.prepare(
    `INSERT INTO participants
      (id, name, avatar, color, role_title, is_online, last_active_at, joined_at, token_hash, token_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insertP.run(
    'u_chen',
    '陈默',
    '🐱',
    '#059669',
    '边缘架构师',
    1,
    '2026-11-26T01:08:00.000Z',
    '2026-11-26T01:01:00.000Z',
    hashToken(demoTokens.u_chen),
    farFuture
  );
  insertP.run(
    'u_zhou',
    '周予',
    '🐨',
    '#D97706',
    '客户端负责人',
    0,
    '2026-11-26T00:40:00.000Z',
    '2026-11-26T01:01:30.000Z',
    hashToken(demoTokens.u_zhou),
    farFuture
  );

  db.prepare(
    "INSERT OR REPLACE INTO room_internal_kv (key, value) VALUES ('is_demo_room', '1')"
  ).run();
  db.prepare(
    "INSERT OR REPLACE INTO room_internal_kv (key, value) VALUES ('demo_seat_tokens', ?)"
  ).run(JSON.stringify(demoTokens));

  db.prepare("UPDATE room_meta SET pacing_mode = 'multiplayer' WHERE id = ?").run(roomId);

  const insertBrief = db.prepare(
    `INSERT INTO pa_briefs
      (id, participant_id, source_client, mode, summary_markdown, facts_json, stances_json, allowed_auto_topics_json, redline_topics_json, reference_count, submitted_at, updated_at, claimed_at, claimed_participant_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  insertBrief.run(
    'brief_chen',
    'u_chen',
    'cursor',
    'context_only',
    '基于 Cloudflare Workers + SQLite DO 压测结果：单房 30 人并发下 SSE + Last-Event-ID 内存占用仅 18MB，断线重连零丢帧。',
    JSON.stringify([
      'PR #502 压测：单房 SQLite DO + SSE 在弱网切网重连时依靠 room_event_log.seq 补发耗时 < 35ms',
      'WebSocket Hibernation API 若混合 HTTP POST MCP 调用需额外维护会话序列化状态',
    ]),
    JSON.stringify([
      {
        topic: '实时传输协议',
        position: '倾向 SSE + HTTP POST 双通道',
        rationale: '与 Streamable HTTP MCP 天然同构，无需维护双栈连接池',
      },
    ]),
    JSON.stringify(['压测指标', 'DO SQLite 容量']),
    JSON.stringify(DEFAULT_REDLINE_TOPICS),
    1,
    '2026-11-26T01:02:00.000Z',
    '2026-11-26T01:05:00.000Z',
    '2026-11-26T01:02:10.000Z',
    'u_chen'
  );

  insertBrief.run(
    'brief_zhou',
    'u_zhou',
    'claude_code',
    'proxy_tiered',
    '周予上午在客户现场，授权 PA 代答常规客户端联调进度；涉及发版死线提前或新增原生录音模块需本人签字确认。',
    JSON.stringify([
      'Web 端 EventSource 断线续传与 800ms 贝塞尔微光标渲染已完成 90%',
      '本周四前排期已被 iOS Safari 语音权限兼容占满，剩余机动工时仅 0.5 人日',
    ]),
    JSON.stringify([
      {
        topic: '客户端联调周期',
        position: '标准 SSE 客户端周五可提测',
        rationale: '复用浏览器原生 EventSource，零第三方 SDK 体积',
      },
    ]),
    JSON.stringify(['客户端联调进度', '空闲时段', 'EventSource 兼容性']),
    JSON.stringify(['排期死线变更', '预算报价承诺', '核心目标拍板', '敏感凭据', '提前上线']),
    1,
    '2026-11-26T01:02:30.000Z',
    '2026-11-26T01:06:00.000Z',
    '2026-11-26T01:02:40.000Z',
    'u_zhou'
  );

  appendRoomEvent(db, {
    eventType: 'pa.brief_submitted',
    actorType: 'pa_proxy',
    actorId: 'u_chen',
    actorName: '陈默的 PA (Cursor)',
    summaryText: '陈默通过 MCP 投递了会前立场简报（模式：仅提供上下文）',
    payload: { participantId: 'u_chen', mode: 'context_only' },
    createdAt: '2026-11-26T01:02:00.000Z',
  });

  appendRoomEvent(db, {
    eventType: 'pa.brief_submitted',
    actorType: 'pa_proxy',
    actorId: 'u_zhou',
    actorName: '周予的 PA (Claude Code)',
    summaryText: '周予通过 MCP 投递了会前立场简报（模式：分级授权代发言）',
    payload: { participantId: 'u_zhou', mode: 'proxy_tiered' },
    createdAt: '2026-11-26T01:02:30.000Z',
  });

  const insertArt = db.prepare(
    `INSERT INTO canvas_artifacts
      (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  insertArt.run(
    'art_sse_plan',
    'sticky',
    'main',
    '方案 A：SSE + Last-Event-ID 增量流',
    '利用单房 SQLite room_event_log.seq 做断线精确补发，与 Streamable HTTP /mcp 完全同构，浏览器原生零依赖。',
    'human',
    'u_lin',
    '林岚',
    '#FEF9C3',
    120,
    135,
    256,
    JSON.stringify({ '🔥': ['u_lin', 'u_chen'], '👍': ['u_lin'] }),
    JSON.stringify({ category: 'solution' }),
    'null',
    0,
    '2026-11-26T01:03:00.000Z',
    '2026-11-26T01:03:00.000Z'
  );

  insertArt.run(
    'art_ws_plan',
    'sticky',
    'main',
    '方案 B：全双工 WebSocket 自研帧协议',
    '客户端与服务端均自建二进制心跳帧、ACK 队列与多端光标高频广播通道。',
    'human',
    'u_chen',
    '陈默',
    '#FFE4E6',
    450,
    135,
    256,
    JSON.stringify({}),
    JSON.stringify({ category: 'conflict' }),
    'null',
    1,
    '2026-11-26T01:03:40.000Z',
    '2026-11-26T01:07:00.000Z'
  );

  insertArt.run(
    'art_pa_chen_bench',
    'pa_quote_card',
    'main',
    '📎 陈默 PA 核实事实',
    'PR #502 实测：单房 SQLite DO + SSE 在弱网重连时依靠 seq 补发耗时 < 35ms，内存仅 18MB。',
    'public_role',
    'host',
    'Host 控场记录',
    '#DCFCE7',
    120,
    355,
    256,
    JSON.stringify({ '👍': ['u_lin'] }),
    JSON.stringify({ participantId: 'u_chen', sourceClient: 'cursor' }),
    JSON.stringify({ type: 'pa_brief', id: 'brief_chen', label: '陈默 PA · PR #502 压测简报' }),
    0,
    '2026-11-26T01:04:30.000Z',
    '2026-11-26T01:04:30.000Z'
  );

  insertArt.run(
    'art_pa_zhou_proxy',
    'pa_quote_card',
    'main',
    '🤖 周予的 PA 代言（常规授权）',
    'Web 端 EventSource 续传与 800ms 微光标已完成 90%，采用方案 A 本周五可如期提测。',
    'pa_proxy',
    'u_zhou',
    '🤖 周予的 PA 代言',
    '#F3E8FF',
    450,
    355,
    256,
    JSON.stringify({}),
    JSON.stringify({ participantId: 'u_zhou', mode: 'proxy_tiered' }),
    JSON.stringify({ type: 'pa_brief', id: 'brief_zhou', label: '周予 PA · 客户端进度授权' }),
    0,
    '2026-11-26T01:05:20.000Z',
    '2026-11-26T01:05:20.000Z'
  );

  insertArt.run(
    'art_spark_lazy',
    'spark_card',
    'spark_zone',
    '🛡 成本与风控：举手懒加载省 80% 算力',
    '多人开会时角色先挂 ≤20 字悬念钩子，仅在真人点击时才调推理模型展开全文，避免多分支空跑烧 Token。',
    'public_role',
    'cost_risk',
    '成本与风控',
    '#FEF3C7',
    820,
    150,
    248,
    JSON.stringify({ '💡': ['u_lin', 'u_chen'] }),
    JSON.stringify({ roleKey: 'cost_risk' }),
    'null',
    0,
    '2026-11-26T01:06:00.000Z',
    '2026-11-26T01:06:00.000Z'
  );

  appendRoomEvent(db, {
    eventType: 'artifact.created',
    actorType: 'human',
    actorId: 'u_lin',
    actorName: '林岚',
    summaryText: '林岚贴上了「方案 A：SSE + Last-Event-ID 增量流」',
    payload: {
      artifactId: 'art_sse_plan',
      title: '方案 A：SSE + Last-Event-ID 增量流',
      x: 120,
      y: 135,
    },
    createdAt: '2026-11-26T01:03:00.000Z',
  });

  appendRoomEvent(db, {
    eventType: 'artifact.created',
    actorType: 'human',
    actorId: 'u_chen',
    actorName: '陈默',
    summaryText: '陈默贴上了对比项「方案 B：全双工 WebSocket 自研帧协议」（后标记为排除分支）',
    payload: {
      artifactId: 'art_ws_plan',
      title: '方案 B：全双工 WebSocket 自研帧协议',
      x: 450,
      y: 135,
    },
    createdAt: '2026-11-26T01:03:40.000Z',
  });

  appendRoomEvent(db, {
    eventType: 'pa.referenced',
    actorType: 'public_role',
    actorId: 'host',
    actorName: 'Host 控场记录',
    summaryText: 'Host 引用了陈默 PA 的 PR #502 压测事实佐证方案 A',
    payload: { participantId: 'u_chen', artifactId: 'art_pa_chen_bench' },
    createdAt: '2026-11-26T01:04:30.000Z',
  });

  const insertLink = db.prepare(
    `INSERT INTO artifact_links
      (id, from_artifact_id, to_artifact_id, kind, reason, created_by, vote_a_users_json, vote_b_users_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  insertLink.run(
    'lnk_conflict_ab',
    'art_sse_plan',
    'art_ws_plan',
    'conflict',
    '传输层二选一：原生轻量 SSE vs 重型自建 WebSocket 帧协议',
    'linker',
    JSON.stringify(['u_lin', 'u_chen']),
    JSON.stringify([]),
    '2026-11-26T01:04:00.000Z'
  );

  insertLink.run(
    'lnk_support_bench',
    'art_pa_chen_bench',
    'art_sse_plan',
    'support',
    'PR #502 弱网补发 <35ms 实测数据直接支撑方案 A',
    'linker',
    '[]',
    '[]',
    '2026-11-26T01:04:45.000Z'
  );

  insertLink.run(
    'lnk_derive_client',
    'art_sse_plan',
    'art_pa_zhou_proxy',
    'derive',
    '选定 SSE 后可直接复用客户端已完成 90% 的 EventSource 模块',
    'linker',
    '[]',
    '[]',
    '2026-11-26T01:05:35.000Z'
  );

  appendRoomEvent(db, {
    eventType: 'link.created',
    actorType: 'public_role',
    actorId: 'linker',
    actorName: 'Linker 逻辑串联',
    summaryText: 'Linker 拉出了方案 A 与方案 B 的橙色冲突虚线，并关联了 PA 压测佐证绿线',
    payload: { linkId: 'lnk_conflict_ab', kind: 'conflict' },
    createdAt: '2026-11-26T01:04:45.000Z',
  });

  const insertMsg = db.prepare(
    `INSERT INTO messages
      (id, sender_type, sender_id, sender_name, input_modality, content, voice_duration_ms, anchor_artifact_ids_json, mentions_json, promoted_artifact_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  insertMsg.run(
    'msg_1',
    'human',
    'u_lin',
    '林岚',
    'spatial_voice',
    '针对方案 A 我补一句：既然 MCP 2025-03-26 也是 Streamable HTTP，统一走 HTTP + SSE 能让网关少维护一套状态机。',
    4800,
    JSON.stringify(['art_sse_plan']),
    '[]',
    null,
    '2026-11-26T01:05:00.000Z'
  );

  insertMsg.run(
    'msg_2',
    'human',
    'u_chen',
    '陈默',
    'text',
    '同意，我把自建 WebSocket 标为已排除分支，写进定稿避坑附录，省得下周新同学又提一遍。 @周予 客户端周五提测没问题吧？',
    null,
    '[]',
    JSON.stringify(['u_zhou']),
    null,
    '2026-11-26T01:05:15.000Z'
  );

  db.prepare(
    `INSERT INTO hand_raises
      (id, role_key, teaser, trigger_context_json, target_artifact_ids_json, status, expanded_artifact_id, created_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, 'raised_teaser', NULL, ?, NULL)`
  ).run(
    'hr_demo_critic',
    'critic',
    '如果单房事件超 5000 条怎么截断？',
    JSON.stringify({
      topic: 'SSE Last-Event-ID 断线补发上限',
      relatedText: '利用单房 SQLite room_event_log.seq 做断线精确补发',
    }),
    JSON.stringify(['art_sse_plan']),
    new Date().toISOString()
  );

  appendRoomEvent(db, {
    eventType: 'hand.raised',
    actorType: 'public_role',
    actorId: 'critic',
    actorName: 'Critic 挑刺者',
    summaryText: 'Critic 挑刺者举手：「如果单房事件超 5000 条怎么截断？」',
    payload: {
      handRaiseId: 'hr_demo_critic',
      roleKey: 'critic',
      teaser: '如果单房事件超 5000 条怎么截断？',
    },
    createdAt: '2026-11-26T01:06:30.000Z',
  });

  const insertCons = db.prepare(
    `INSERT INTO consensus_items
      (id, section, content, owner_participant_id, due_date, status, signoff_status, locked_by, locked_at, depends_on_ids_json, source_refs_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  insertCons.run(
    'cons_ctx_1',
    'context',
    '架构基线切换为 1 Room = 1 SQLite Durable Object，彻底隔离单房状态并对齐 Streamable HTTP MCP。',
    null,
    null,
    'locked',
    'none',
    '林岚',
    '2026-11-26T01:04:10.000Z',
    '[]',
    JSON.stringify([{ type: 'artifact', id: 'art_sse_plan', seq: 4 }]),
    '2026-11-26T01:04:00.000Z',
    '2026-11-26T01:04:10.000Z'
  );

  insertCons.run(
    'cons_dec_1',
    'decision',
    '实时同步层统一采用 SSE + Last-Event-ID（基于 room_event_log.seq 断线补发），放弃自建全双工 WebSocket 帧协议。',
    'u_chen',
    null,
    'locked',
    'none',
    '林岚',
    '2026-11-26T01:06:50.000Z',
    JSON.stringify(['cons_ctx_1']),
    JSON.stringify([
      { type: 'artifact', id: 'art_sse_plan', seq: 4 },
      { type: 'pa_brief', id: 'brief_chen', seq: 6 },
    ]),
    '2026-11-26T01:05:40.000Z',
    '2026-11-26T01:06:50.000Z'
  );

  insertCons.run(
    'cons_act_1',
    'action_item',
    '基于 SSE EventSource 完成断线 Last-Event-ID 自动补发与 800ms 角色微光标联调提测。',
    'u_zhou',
    '本周五 18:00',
    'locked',
    'none',
    '陈默',
    '2026-11-26T01:07:10.000Z',
    JSON.stringify(['cons_dec_1']),
    JSON.stringify([{ type: 'artifact', id: 'art_pa_zhou_proxy', seq: 6 }]),
    '2026-11-26T01:06:10.000Z',
    '2026-11-26T01:07:10.000Z'
  );

  insertCons.run(
    'cons_q_1',
    'open_question',
    '单房超长会议（>2000 条事件）重连时，Last-Event-ID 超过阈值是否直接回退全量 GET 快照？',
    'u_chen',
    null,
    'draft',
    'none',
    null,
    null,
    JSON.stringify(['cons_dec_1']),
    '[]',
    '2026-11-26T01:07:20.000Z',
    '2026-11-26T01:07:20.000Z'
  );

  appendRoomEvent(db, {
    eventType: 'consensus.locked',
    actorType: 'human',
    actorId: 'u_lin',
    actorName: '林岚',
    summaryText: '林岚拍板锁定核心决策：采用 SSE + Last-Event-ID，放弃自建 WebSocket',
    payload: { itemId: 'cons_dec_1' },
    createdAt: '2026-11-26T01:06:50.000Z',
  });
}

const STARTER_SKETCH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 220" fill="none">
  <rect width="360" height="220" rx="12" fill="#FAF8F5"/>
  <rect x="18" y="16" width="324" height="188" rx="10" fill="#FFFFFF" stroke="#D6D3D1" stroke-width="1.6"/>
  <circle cx="34" cy="30" r="4" fill="#FCA5A5"/>
  <circle cx="47" cy="30" r="4" fill="#FCD34D"/>
  <circle cx="60" cy="30" r="4" fill="#6EE7B7"/>
  <line x1="18" y1="44" x2="342" y2="44" stroke="#E7E5E4" stroke-width="1.4"/>
  <rect x="38" y="60" width="112" height="72" rx="8" fill="#FEF3C7" stroke="#D97706" stroke-width="1.4" stroke-dasharray="4 3"/>
  <text x="50" y="86" fill="#92400E" font-family="sans-serif" font-size="11" font-weight="bold">1. 零门槛进桌面</text>
  <text x="50" y="106" fill="#78716C" font-family="sans-serif" font-size="10">聚光灯案例秒上手</text>
  <path d="M156 96 C176 96, 182 96, 198 96" stroke="#7C3AED" stroke-width="2" stroke-dasharray="4 3"/>
  <polygon points="198,92 206,96 198,100" fill="#7C3AED"/>
  <rect x="210" y="60" width="114" height="72" rx="8" fill="#DCFCE7" stroke="#059669" stroke-width="1.5"/>
  <text x="222" y="86" fill="#065F46" font-family="sans-serif" font-size="11" font-weight="bold">2. 一键收成定稿</text>
  <text x="222" y="106" fill="#047857" font-family="sans-serif" font-size="10">带凭证安全分享</text>
  <rect x="38" y="148" width="286" height="38" rx="19" fill="#EEF2FF" stroke="#4F46E5" stroke-width="1.5"/>
  <text x="96" y="171" fill="#4F46E5" font-family="sans-serif" font-size="11.5" font-weight="bold">✦ 砍掉首屏注册墙 · 留存提升 +28.4%</text>
</svg>`;

/**
 * Interactive Guided Starter Case Room (`room_starter_v5` or per-user guided room)
 * Designed for first-time users to experience Omind in 60 seconds with the Spotlight Cutout Tour!
 */
export function seedStarterCaseRoom(
  db,
  {
    roomId = 'room_starter_v5',
    title = '🌟 新手上手案例：首屏免注册体验改版共创',
    creatorName = '林知夏',
    creatorAvatar = null,
    creatorColor = '#4F46E5',
    creatorRoleTitle = '产品体验官',
    allowTableSpeak = true,
    resetExisting = false,
  } = {}
) {
  if (resetExisting) {
    db.exec(`
      DELETE FROM artifact_links;
      DELETE FROM canvas_artifacts;
      DELETE FROM messages;
      DELETE FROM hand_raises;
      DELETE FROM revision_proposals;
      DELETE FROM consensus_items;
      DELETE FROM pa_briefs;
      DELETE FROM participants;
      DELETE FROM room_roles;
      DELETE FROM room_event_log;
      DELETE FROM deliverable_snapshots;
      DELETE FROM room_meta;
    `);
  } else {
    const existing = db.prepare('SELECT id FROM room_meta LIMIT 1').get();
    if (existing) {
      const hasDemoKv = db
        .prepare("SELECT value FROM room_internal_kv WHERE key = 'demo_seat_tokens'")
        .get();
      if (!hasDemoKv) {
        const exp = '2099-12-31T23:59:59.000Z';
        const demoTokens = {
          u_starter_me: 'ptk_demo_starter_me',
          u_suxiao: 'ptk_demo_starter_suxiao',
          u_alex: 'ptk_demo_starter_alex',
        };
        for (const [uid, tok] of Object.entries(demoTokens)) {
          db.prepare(
            'UPDATE participants SET token_hash = ?, token_expires_at = ? WHERE id = ?'
          ).run(hashToken(tok), exp, uid);
        }
        db.prepare("UPDATE participants SET avatar = '🐰' WHERE id = 'u_suxiao'").run();
        db.prepare("UPDATE participants SET avatar = '🐙' WHERE id = 'u_alex'").run();
        db.prepare(
          "INSERT OR REPLACE INTO room_internal_kv (key, value) VALUES ('is_demo_room', '1')"
        ).run();
        db.prepare(
          "INSERT OR REPLACE INTO room_internal_kv (key, value) VALUES ('demo_seat_tokens', ?)"
        ).run(JSON.stringify(demoTokens));
      }

      const hasLayoutV54 = db
        .prepare("SELECT value FROM room_internal_kv WHERE key = 'layout_v54_migrated'")
        .get();
      if (!hasLayoutV54) {
        db.prepare("UPDATE canvas_artifacts SET x = 72, y = 92 WHERE id = 'art_guide_sketch'").run();
        db.prepare("UPDATE canvas_artifacts SET x = 454, y = 92 WHERE id = 'art_guide_pain'").run();
        db.prepare("UPDATE canvas_artifacts SET x = 454, y = 408 WHERE id = 'art_guide_plan'").run();
        db.prepare("UPDATE canvas_artifacts SET x = 72, y = 434 WHERE id = 'art_guide_pa'").run();
        db.prepare("UPDATE canvas_artifacts SET x = 826, y = 132 WHERE id = 'art_guide_spark_tray'").run();
        db.prepare(
          "INSERT OR REPLACE INTO room_internal_kv (key, value) VALUES ('layout_v54_migrated', '1')"
        ).run();
      }
      return;
    }
  }

  const now = new Date().toISOString();
  const farFuture = '2099-12-31T23:59:59.000Z';
  const creatorId = 'u_starter_me';
  const meToken = generateParticipantToken();
  const suxiaoToken = generateParticipantToken();
  const alexToken = generateParticipantToken();

  const created = initPresetRoom(db, {
    roomId,
    title,
    topicSummary:
      '1 分钟互动体验：如何把“先强制注册”改为“先进自由桌面体验聚光灯引导案例，定稿时再生成凭证分享”？',
    presetId: 'brainstorm_breakthrough',
    creatorName,
    creatorAvatar: makeAvatarText(creatorName, creatorAvatar),
    creatorColor: creatorColor || '#4F46E5',
    creatorRoleTitle,
    creatorId,
    creatorParticipantToken: meToken,
    enableRecommendedDomain: true,
    now,
  });

  db.prepare('UPDATE participants SET token_expires_at = ? WHERE id = ?').run(farFuture, creatorId);
  db.prepare("UPDATE room_roles SET enabled = 1 WHERE role_key IN ('critic', 'target_user')").run();

  const insertP = db.prepare(
    `INSERT INTO participants
      (id, name, avatar, color, role_title, is_online, last_active_at, joined_at, token_hash, token_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insertP.run(
    'u_suxiao',
    '苏晓',
    '🐰',
    '#DB2777',
    '增长产品负责人',
    1,
    now,
    now,
    hashToken(suxiaoToken),
    farFuture
  );
  insertP.run(
    'u_alex',
    'Alex',
    '🐙',
    '#D97706',
    '交互设计师',
    0,
    now,
    now,
    hashToken(alexToken),
    farFuture
  );

  const demoTokens = {
    [creatorId]: meToken,
    u_suxiao: suxiaoToken,
    u_alex: alexToken,
  };
  db.prepare(
    "INSERT OR REPLACE INTO room_internal_kv (key, value) VALUES ('is_demo_room', '1')"
  ).run();
  db.prepare(
    "INSERT OR REPLACE INTO room_internal_kv (key, value) VALUES ('demo_seat_tokens', ?)"
  ).run(JSON.stringify(demoTokens));

  db.prepare("UPDATE room_meta SET pacing_mode = 'multiplayer' WHERE id = ?").run(roomId);

  const insertBrief = db.prepare(
    `INSERT INTO pa_briefs
      (id, participant_id, source_client, mode, summary_markdown, facts_json, stances_json, allowed_auto_topics_json, redline_topics_json, reference_count, submitted_at, updated_at, claimed_at, claimed_participant_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  insertBrief.run(
    'brief_starter_me',
    creatorId,
    'cursor',
    allowTableSpeak ? 'proxy_tiered' : 'context_only',
    `${creatorName} 的个人 Agent 已连接：${allowTableSpeak ? '支持常规进度协同代答，涉及排期死线/预算红线必挂本人待签卡' : '仅向 Host 提供脱敏背景参考，不在桌面代发言'}。`,
    JSON.stringify(['本周目标：让新访客 60 秒内看懂并爱上自由桌面共创']),
    JSON.stringify([{ topic: '上手引导形式', position: '用半透明聚光灯镂空聚焦代替长篇文字说明书' }]),
    JSON.stringify(['上手体验偏好', '案例文案']),
    JSON.stringify(DEFAULT_REDLINE_TOPICS),
    0,
    now,
    now,
    now,
    creatorId
  );

  insertBrief.run(
    'brief_suxiao',
    'u_suxiao',
    'claude_desktop',
    'context_only',
    '上周漏斗诊断：首屏强制手机号注册流失了 42% 访客；小流量推迟注册实验组次日留存提升 +28.4%。',
    JSON.stringify([
      '漏斗数据：42% 新访客卡在首屏注册弹窗未进入画布',
      'A/B 实验 #19：先开放免登录体验案例局，首日留存率 +28.4%，分享率翻倍',
    ]),
    JSON.stringify([{ topic: '注册时机', position: '先体验桌面，点击收敛定稿/分享时再签发凭证' }]),
    JSON.stringify(['漏斗转化数据', 'A/B 实验结果']),
    JSON.stringify(DEFAULT_REDLINE_TOPICS),
    1,
    now,
    now,
    now,
    'u_suxiao'
  );

  insertBrief.run(
    'brief_alex',
    'u_alex',
    'cursor',
    'proxy_tiered',
    'Alex 下午在用户访谈现场，常规交互细节由 PA 代答；涉及发版死线提前或大改底层视觉需本人签字。',
    JSON.stringify([
      '拍立得线框图组件与聚光灯镂空聚焦遮罩已完成走查，周五可随主干发布',
      '实测带聚光灯高亮镂空的引导比纯空白页首次点击率高 3.1 倍',
    ]),
    JSON.stringify([{ topic: '默认桌面形态', position: '预置 4 张有故事线的案例卡片 + 5 步聚光灯引导' }]),
    JSON.stringify(['设计走查进度', '组件可用性']),
    JSON.stringify(['排期死线变更', '预算报价承诺', '核心目标拍板', '敏感凭据']),
    1,
    now,
    now,
    now,
    'u_alex'
  );

  const sketchDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(STARTER_SKETCH_SVG)}`;
  const insertArt = db.prepare(
    `INSERT INTO canvas_artifacts
      (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  insertArt.run(
    'art_guide_sketch',
    'image',
    'main',
    'Onboarding v2 · 首屏改版草图',
    '悬停此拍立得卡片按住 Space 键，试试直接对它发一条「空间锚定语音」！',
    'human',
    'u_alex',
    'Alex · 设计',
    '#FFFFFF',
    72,
    92,
    256,
    JSON.stringify({ '🔥': ['u_suxiao', creatorId] }),
    JSON.stringify({
      dataUrl: sketchDataUrl,
      stepBadge: 1,
      stationery: 'polaroid',
    }),
    'null',
    0,
    now,
    now
  );

  insertArt.run(
    'art_guide_pain',
    'sticky',
    'main',
    '痛点：首屏注册墙劝退 42% 新访客',
    '用户还没看清白板怎么玩就被要求填手机号，体验断裂。（试试拖拽移动或双击修改这张便签）',
    'human',
    'u_suxiao',
    '苏晓',
    '#FEF3C7',
    454,
    92,
    258,
    JSON.stringify({ '👍': ['u_alex'] }),
    JSON.stringify({
      category: 'context',
      stepBadge: 2,
      stationery: 'washi',
    }),
    'null',
    0,
    now,
    now
  );

  insertArt.run(
    'art_guide_plan',
    'sticky',
    'main',
    '新方案：免注册案例桌面 + 定稿再领走',
    '进站直接给可爱风随机昵称体验完整共创案例；点右上「收敛定稿」生成文档与带凭证分享链接。',
    'human',
    creatorId,
    creatorName,
    '#DCFCE7',
    454,
    408,
    258,
    JSON.stringify({ '🔥': ['u_suxiao', 'u_alex'] }),
    JSON.stringify({
      category: 'solution',
      stepBadge: 3,
      stationery: 'clean',
    }),
    'null',
    0,
    now,
    now
  );

  insertArt.run(
    'art_guide_pa',
    'pa_quote_card',
    'main',
    '📎 苏晓 PA 核实实验数据',
    'A/B 实验 #19 证实：先开放免登录互动案例后，新访客首日留存率提升 +28.4%，分享率翻倍。',
    'public_role',
    'host',
    'Host 控场记录',
    '#F0FDF4',
    72,
    434,
    256,
    JSON.stringify({ '💡': [creatorId] }),
    JSON.stringify({
      participantId: 'u_suxiao',
      mode: 'context_only',
      verifiedBadge: 'PA 已核实 · 置信度 98%',
      stepBadge: 4,
    }),
    JSON.stringify({ type: 'pa_brief', id: 'brief_suxiao', label: '苏晓 PA · A/B 实验 #19' }),
    0,
    now,
    now
  );

  insertArt.run(
    'art_guide_spark_tray',
    'spark_card',
    'spark_zone',
    '✦ AI Spark · 语音即贴卡',
    '观察发现：新用户面对空白页容易卡壳，提供「一句话对话式开局 + 边缘灵感」能把首次互动时间缩短至 8 秒。',
    'public_role',
    'spark',
    'Spark 跳脱者',
    '#FFFBEB',
    826,
    132,
    248,
    JSON.stringify({ '💡': ['u_suxiao'] }),
    JSON.stringify({ roleKey: 'spark', confidenceLabel: '匹配度 94%' }),
    'null',
    0,
    now,
    now
  );

  const insertLink = db.prepare(
    `INSERT INTO artifact_links
      (id, from_artifact_id, to_artifact_id, kind, reason, created_by, vote_a_users_json, vote_b_users_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  insertLink.run(
    'lnk_guide_derive',
    'art_guide_sketch',
    'art_guide_plan',
    'derive',
    '由首屏线框草图推导出免注册案例沙盒方案',
    'linker',
    '[]',
    '[]',
    now
  );

  insertLink.run(
    'lnk_guide_support',
    'art_guide_pa',
    'art_guide_plan',
    'support',
    '苏晓 PA 的 +28.4% 留存实验数据直接支撑该改版方案',
    'linker',
    '[]',
    '[]',
    now
  );

  insertLink.run(
    'lnk_guide_conflict',
    'art_guide_pain',
    'art_guide_plan',
    'conflict',
    '旧版首屏强制注册拦截 vs 新版免注册沙盒先体验',
    'linker',
    JSON.stringify([]),
    JSON.stringify(['u_suxiao', creatorId]),
    now
  );

  db.prepare(
    `INSERT INTO messages
      (id, sender_type, sender_id, sender_name, input_modality, content, voice_duration_ms, anchor_artifact_ids_json, mentions_json, promoted_artifact_id, created_at)
     VALUES (?, 'human', 'u_suxiao', '苏晓', 'voice_ptt', ?, 3800, '[]', '[]', NULL, ?)`
  ).run(
    'msg_guide_1',
    '欢迎来到新手案例桌面！跟着聚光灯高亮提示（或点顶部胶囊跳步体验），轻松玩转空间语音、双路召唤 Agent、三大画布切换与一键定稿。',
    now
  );

  db.prepare(
    `INSERT INTO hand_raises
      (id, role_key, teaser, trigger_context_json, target_artifact_ids_json, status, expanded_artifact_id, created_at, resolved_at)
     VALUES (?, 'spark', ?, ?, ?, 'raised_teaser', NULL, ?, NULL)`
  ).run(
    'hr_guide_spark',
    '如果连昵称都配颗随机骰子呢？',
    JSON.stringify({
      topic: '零阻力冷启动身份体验',
      relatedText: '让新访客点一下随机骰子即可生成可爱 Emoji 身份直接开聊，连打字都省掉',
    }),
    JSON.stringify(['art_guide_plan']),
    now
  );

  const insertCons = db.prepare(
    `INSERT INTO consensus_items
      (id, section, content, owner_participant_id, due_date, status, signoff_status, locked_by, locked_at, depends_on_ids_json, source_refs_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'none', ?, ?, ?, ?, ?, ?)`
  );

  insertCons.run(
    'cons_guide_ctx',
    'context',
    '首屏强制注册导致 42% 新访客流失，必须让用户先在真实互动桌面上感受到价值。',
    null,
    null,
    'locked',
    '苏晓',
    now,
    '[]',
    JSON.stringify([{ type: 'artifact', id: 'art_guide_pain', seq: 2 }]),
    now,
    now
  );

  insertCons.run(
    'cons_guide_dec',
    'decision',
    '首屏默认开放「极简对话式开局 + 聚光灯新手案例桌面」，在收敛定稿时签发安全分享凭证。',
    creatorId,
    null,
    'locked',
    creatorName,
    now,
    JSON.stringify(['cons_guide_ctx']),
    JSON.stringify([
      { type: 'artifact', id: 'art_guide_plan', seq: 3 },
      { type: 'pa_brief', id: 'brief_suxiao', seq: 4 },
    ]),
    now,
    now
  );

  insertCons.run(
    'cons_guide_act',
    'action_item',
    '上线对话式首页、可爱风 Emoji 头像池与 5 步聚光灯引导闭环，跟踪首日定稿完成率。',
    'u_alex',
    '本周五 18:00',
    'locked',
    '苏晓',
    now,
    JSON.stringify(['cons_guide_dec']),
    JSON.stringify([{ type: 'artifact', id: 'art_guide_sketch', seq: 2 }]),
    now,
    now
  );

  appendRoomEvent(db, {
    eventType: 'artifact.created',
    actorType: 'human',
    actorId: 'u_alex',
    actorName: 'Alex · 设计',
    summaryText: 'Alex 贴上了拍立得草图「Onboarding v2 · 首屏改版草图」与核心痛点便签',
    payload: { artifactId: 'art_guide_sketch' },
    createdAt: now,
  });

  appendRoomEvent(db, {
    eventType: 'pa.referenced',
    actorType: 'public_role',
    actorId: 'host',
    actorName: 'Host 控场记录',
    summaryText: 'Host 引用苏晓 PA 实验数据（留存 +28.4%）并拉出三色语义连线',
    payload: { participantId: 'u_suxiao', artifactId: 'art_guide_pa' },
    createdAt: now,
  });

  appendRoomEvent(db, {
    eventType: 'hand.raised',
    actorType: 'public_role',
    actorId: 'spark',
    actorName: 'Spark 跳脱者',
    summaryText: 'Spark 跳脱者举手：「如果连昵称都配颗随机骰子呢？」',
    payload: { handRaiseId: 'hr_guide_spark', roleKey: 'spark' },
    createdAt: now,
  });

  appendRoomEvent(db, {
    eventType: 'consensus.locked',
    actorType: 'human',
    actorId: creatorId,
    actorName: creatorName,
    summaryText: `${creatorName} 拍板锁定改版方案：首屏默认开放聚光灯新手案例桌面`,
    payload: { itemId: 'cons_guide_dec' },
    createdAt: now,
  });

  return created;
}
