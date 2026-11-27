/**
 * Omind v5 — Two-Stage Multi-Role Orchestration Engine (`src/orchestrator.mjs`)
 * Implements PRD Section 5, FR-01.2, FR-01.3, FR-02, FR-04, FR-05:
 *   - Cold-Start 15s Icebreaker (2-3 initial context anchor cards)
 *   - Stage 1: Low-latency Triage Router (OpenAI-compatible Fast LLM + deterministic `local_fallback`)
 *   - Hard Server-Side Guardrail Middleware (pacing_mode, 60s cooldown, <=20-char teaser, PA redline force signoff, locked immutability)
 *   - Stage 2: On-Demand Lazy Expansion (`expandHandRaise`) & Parallel A/B Pros-Cons (`evaluateConflictParallel`)
 */

import { aiReviseConsensusSafely, createConsensusItem } from './consensus.mjs';
import {
  appendRoomEvent,
  generateId,
  hydrateArtifact,
  hydrateConsensusItem,
  hydrateHandRaise,
  hydrateLink,
  hydrateMessage,
  hydratePaBrief,
  hydrateParticipant,
  hydrateRoomMeta,
  hydrateRoomRole,
  safeJsonParse,
} from './db-core.mjs';
import { REDLINE_KEYWORDS } from './presets.mjs';

const LOW_SIGNAL_CHITCHAT_RE =
  /^(哈哈+|好的|收到|明白|ok|okay|嗯+|行|没问题|来了|在吗|测试一下|test|111+|\+1|赞|辛苦了)[！!。.~～\s]*$/i;

const ROLE_NAME_ALIASES = {
  host: ['host', '主持人', '控场'],
  linker: ['linker', '串联', '逻辑串联'],
  spark: ['spark', '跳脱', '跳脱者', '火花'],
  critic: ['critic', '挑刺', '挑刺者', '魔鬼代言'],
  tech_feasibility: ['tech_feasibility', '技术可行性', '技术评估', '架构师'],
  cost_risk: ['cost_risk', '成本与风控', '成本', '风控'],
  target_user: ['target_user', '目标用户', '挑剔用户', '用户替身'],
};

function clampChars(str, maxChars) {
  const clean = String(str || '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(clean);
  if (chars.length <= maxChars) return clean;
  return `${chars.slice(0, Math.max(1, maxChars - 1)).join('')}…`;
}

function extractKeyTerms(text) {
  const raw = String(text || '');
  const terms = new Set();
  const eng = raw.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) || [];
  for (const w of eng) terms.add(w.toLowerCase());
  const cjkChunks = raw.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
  for (const c of cjkChunks) {
    if (!['我们', '这个', '那个', '可以', '需要', '还是', '觉得', '讨论', '方案', '问题', '目前', '进行'].includes(c)) {
      terms.add(c);
    }
  }
  return [...terms];
}

export function checkRedlineHit(text, customRedlines = []) {
  const hay = String(text || '').toLowerCase();
  for (const topic of customRedlines || []) {
    const clean = String(topic || '').trim().toLowerCase();
    if (!clean) continue;
    if (hay.includes(clean)) return topic;
    // Match high-specificity redline stems without false-firing on benign progress queries
    if (clean.includes('死线') && /(死线|提前|延期|改期|截止变更)/.test(hay)) return topic;
    if (clean.includes('预算') && /(预算|报价|经费|万块|万元|采购)/.test(hay)) return topic;
    if (clean.includes('目标拍板') && /(核心目标|推翻目标|重构底层|目标变更)/.test(hay)) return topic;
    if (clean.includes('凭据') && /(凭据|密钥|私钥|password|secret|token)/.test(hay)) return topic;
  }
  for (const kw of REDLINE_KEYWORDS) {
    if (hay.includes(kw.toLowerCase())) {
      return kw;
    }
  }
  return null;
}

export function detectPriorRoomConflict(candidateText, priorArtifact) {
  const text = String(candidateText || '');
  const textLower = text.toLowerCase();
  const meta = priorArtifact.metadata || {};
  const lockedList = Array.isArray(meta.lockedDecisions) ? meta.lockedDecisions : [];
  const excludedList = Array.isArray(meta.excludedBranches) ? meta.excludedBranches : [];

  // 1. Direct revival of a previously excluded branch!
  for (const ex of excludedList) {
    const exText = `${ex.title || ''} ${ex.content || ''}`;
    const engTokens = (exText.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) || []).map((s) => s.toLowerCase());
    for (const tok of engTokens) {
      if (tok.length >= 3 && !['the', 'and', 'for', 'api'].includes(tok) && textLower.includes(tok)) {
        if (!/不|放弃|禁用|排除|不用/.test(text)) {
          return `本场提议触及前序会议已排除方案「${ex.title || tok}」`;
        }
      }
    }
    const cjkPhrases = exText.match(/[\u4e00-\u9fa5]{3,8}/g) || [];
    for (const ph of cjkPhrases) {
      if (!['已排除方案', '会中明确标记'].includes(ph) && text.includes(ph) && !/不|放弃|排除/.test(text)) {
        return `本场提议重提了前序已否决方向「${ph}」`;
      }
    }
  }

  // 2. Reversal / negation against prior locked decisions
  const reversalCue = /(改用|换成|推翻|不再|重做|放弃|改成|切回|不用|替代|相反|重新启用|强制)/.test(text);
  for (const dec of lockedList) {
    const decContent = typeof dec === 'string' ? dec : dec.content || '';
    const abandonedMatch = decContent.match(/(?:放弃|不采用|不做|禁用|排除)\s*([A-Za-z0-9_\u4e00-\u9fa5+-]{2,16})/);
    if (abandonedMatch) {
      const forbiddenTerm = abandonedMatch[1].toLowerCase();
      if (
        forbiddenTerm.length >= 2 &&
        textLower.includes(forbiddenTerm) &&
        !/(放弃|不采用|不做|禁用|排除)/.test(text)
      ) {
        return `与前序锁定结论「${decContent.slice(0, 32)}」直接冲突`;
      }
    }
    if (reversalCue) {
      const terms = extractKeyTerms(decContent);
      const hit = terms.find((t) => t.length >= 2 && textLower.includes(t.toLowerCase()));
      if (hit) {
        return `试图变更前序已锁定结论（涉及「${hit}」）：${decContent.slice(0, 28)}`;
      }
    }
  }

  // 3. Fallback against prior card body text
  const bodyAbandoned = String(priorArtifact.content || '').match(
    /(?:放弃|不采用|不做|禁用)\s*([A-Za-z0-9_\u4e00-\u9fa5+-]{2,14})/
  );
  if (bodyAbandoned && textLower.includes(bodyAbandoned[1].toLowerCase()) && !/(放弃|不采用|不做)/.test(text)) {
    return `与前序参考卡「${priorArtifact.title}」中的禁用结论冲突`;
  }

  return null;
}

function nextMainBoardSlot(existingArtifacts) {
  const mainCards = existingArtifacts.filter((a) => a.zone === 'main');
  const idx = mainCards.length;
  const col = idx % 2;
  const row = Math.floor(idx / 2);
  return {
    x: 110 + col * 290 + ((idx * 17) % 24),
    y: 130 + row * 195 + ((idx * 13) % 18),
  };
}

function nextSparkZoneSlot(existingArtifacts) {
  const sparkCards = existingArtifacts.filter((a) => a.zone === 'spark_zone');
  const idx = sparkCards.length;
  return {
    x: 810 + (idx % 2) * 268,
    y: 135 + Math.floor(idx / 2) * 190,
  };
}

/**
 * FR-01.2: 15-Second Cold-Start Icebreaker
 * When an empty room receives its first message/voice or first link/image/sticky,
 * Host decomposes it into >=2 structured initial anchor cards (`category: 'context'`) on the central board.
 */
export function runColdStartIcebreaker(db, { seedText, seedTitle = '', sourceMessageId = null, emitEvent }) {
  const clean = String(seedText || seedTitle || '').trim();
  if (!clean) return [];

  const meta = hydrateRoomMeta(db.prepare('SELECT * FROM room_meta LIMIT 1').get());
  const clauses = clean
    .split(/[。！？!?\n；;，,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);

  const anchorSpecs = [];
  const primaryPoint = clauses[0] || clean.slice(0, 60);
  anchorSpecs.push({
    title: '🎯 核心议题锚点',
    content: primaryPoint,
    color: '#FEF9C3',
    x: 130,
    y: 150,
  });

  if (clauses.length >= 2) {
    anchorSpecs.push({
      title: '📌 关键约束与现状',
      content: clauses.slice(1, 3).join('；'),
      color: '#DCFCE7',
      x: 430,
      y: 150,
    });
  } else {
    const presetQuestion =
      meta?.presetId === 'brainstorm_breakthrough'
        ? `围绕「${clampChars(primaryPoint, 18)}」：阻碍突破的最大惯性假设是什么？`
        : meta?.presetId === 'schedule_align'
          ? `围绕「${clampChars(primaryPoint, 18)}」：关键里程碑死线与上下游阻塞点有哪些？`
          : `围绕「${clampChars(primaryPoint, 18)}」：拍板标准、备选方案与不可触碰红线是什么？`;
    anchorSpecs.push({
      title: '🧭 待拆解关键问题',
      content: presetQuestion,
      color: '#E0F2FE',
      x: 430,
      y: 150,
    });
  }

  if (clauses.length >= 3) {
    anchorSpecs.push({
      title: '🔍 延伸边界线索',
      content: clauses.slice(3).join('；'),
      color: '#F3E8FF',
      x: 280,
      y: 350,
    });
  }

  const now = new Date().toISOString();
  const createdCards = [];

  if (!meta?.topicSummary) {
    db.prepare('UPDATE room_meta SET topic_summary = ? WHERE id = ?').run(clampChars(clean, 120), meta.id);
  }

  for (const spec of anchorSpecs) {
    const id = generateId('art');
    const sourceRef = sourceMessageId
      ? { type: 'message', id: sourceMessageId, label: '破冰首条输入' }
      : { type: 'cold_start', id: 'init', label: '冷启动自动拆解' };

    db.prepare(
      `INSERT INTO canvas_artifacts
        (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
       VALUES (?, 'sticky', 'main', ?, ?, 'public_role', 'host', 'Host 控场记录', ?, ?, ?, 252, '{}', ?, ?, 0, ?, ?)`
    ).run(
      id,
      spec.title,
      spec.content,
      spec.color,
      spec.x,
      spec.y,
      JSON.stringify({ category: 'context', coldStartAnchor: true }),
      JSON.stringify(sourceRef),
      now,
      now
    );

    const card = hydrateArtifact(db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(id));
    createdCards.push(card);

    const ev = appendRoomEvent(db, {
      eventType: 'artifact.created',
      actorType: 'public_role',
      actorId: 'host',
      actorName: 'Host 控场记录',
      summaryText: `Host 冷启动破冰生成锚点卡「${card.title}」`,
      payload: { artifactId: card.id, title: card.title, x: card.x, y: card.y, coldStart: true },
      createdAt: now,
    });

    emitEvent?.('agent.cursor_flash', {
      roleKey: 'host',
      displayName: 'Host 控场记录',
      color: '#4F46E5',
      fromPoint: { x: 80, y: 80 },
      toPoint: { x: card.x + 80, y: card.y + 40 },
      actionLabel: `铺设锚点：${card.title}`,
      seq: ev.seq,
    });
    emitEvent?.('artifact.upserted', { artifact: card, seq: ev.seq });
  }

  if (sourceMessageId && createdCards[0]) {
    db.prepare('UPDATE messages SET promoted_artifact_id = ? WHERE id = ?').run(
      createdCards[0].id,
      sourceMessageId
    );
  }

  // Create an initial draft context consensus item
  const ctxItem = createConsensusItem(db, {
    section: 'context',
    content: primaryPoint,
    status: 'draft',
    actorType: 'public_role',
    actorId: 'host',
    actorName: 'Host 控场记录',
    sourceRefs: createdCards.map((c) => ({ type: 'artifact', id: c.id })),
  });
  emitEvent?.('consensus.updated', { item: ctxItem });

  return createdCards;
}

function generateRoleTeaserAndFullInsight(role, contextText, targetCard = null) {
  const focus = clampChars(targetCard?.title || targetCard?.content || contextText || '当前方案', 14);
  switch (role.roleKey) {
    case 'spark':
      return {
        teaser: clampChars('如果直接砍掉中间配置步呢？', 20),
        cardTitle: '💡 Spark 跳脱破局点',
        cardContent: `针对「${focus}」的逆向破局：如果彻底砍掉前置配置步骤，让用户零设置先拿到第 1 个结果再渐进补全，转化漏斗可缩短 60%。`,
      };
    case 'critic':
      return {
        teaser: clampChars('极端并发或断网下会丢状态吗？', 20),
        cardTitle: '🔍 Critic 边界挑刺',
        cardContent: `审视「${focus}」的隐含脆弱点：若遇到弱网反复重连或上游超时，需明确幂等去重与降级兜底策略，避免状态撕裂。`,
      };
    case 'tech_feasibility':
      return {
        teaser: clampChars('单实例存储上限与迁移成本？', 20),
        cardTitle: '🛠 技术可行性评估',
        cardContent: `工程落地建议（「${focus}」）：优先复用边缘原生 SQLite + 标准 HTTP 流接口，可将联调工作量控制在 2 人日以内并保持零外部依赖。`,
      };
    case 'cost_risk':
      return {
        teaser: clampChars('高频触发会导致 Token 翻倍吗？', 20),
        cardTitle: '🛡 成本与风控核算',
        cardContent: `成本风控提示（「${focus}」）：建议对高频事件加 3 秒防抖窗与小模型分流，把高阶推理调用严格收敛在用户主动展开与定稿编译时刻。`,
      };
    case 'target_user':
      return {
        teaser: clampChars('新用户前10秒看得懂怎么点吗？', 20),
        cardTitle: '🧑‍💻 挑剔目标用户体感',
        cardContent: `一线用户视角（「${focus}」）：进房第一眼别让我填超过 2 个框！最好按住空格说一句话就能看到白板自动铺开结构。`,
      };
    default:
      return {
        teaser: clampChars(`${role.badgeEmoji} 从${role.displayName}看有盲点`, 20),
        cardTitle: `${role.badgeEmoji} ${role.displayName}视角`,
        cardContent: `结合「${role.systemInstruction.slice(0, 36)}」审视「${focus}」：建议补充可量化验收指标与异常回滚预案。`,
      };
  }
}

async function maybeCallFastTriageLlm(contextPayload, env = {}) {
  const apiKey = env?.LLM_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) return null;
  const baseUrl = (env?.LLM_BASE_URL || process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = env?.LLM_FAST_MODEL || process.env.LLM_FAST_MODEL || 'gpt-4o-mini';

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.15,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '你是 Omind Triage Router。根据增量事件输出严格 JSON: { "silentBoardActions": [], "paCoordinatorActions": [], "handRaiseCandidates": [] }。handRaiseCandidates.teaser 必须 <= 20 字。',
          },
          { role: 'user', content: JSON.stringify(contextPayload) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return safeJsonParse(data?.choices?.[0]?.message?.content, null);
  } catch {
    return null;
  }
}

/**
 * Deterministic Stage-1 Local Triage Router (`local_fallback`)
 * Guarantees 100% rich multi-role intelligence even with zero LLM API keys!
 */
export function buildLocalTriagePlan(db, deltaEvents = []) {
  const roles = db.prepare('SELECT * FROM room_roles WHERE enabled = 1').all().map((r) => hydrateRoomRole(r));
  const enabledRoleMap = new Map(roles.map((r) => [r.roleKey, r]));
  const participants = db.prepare('SELECT * FROM participants').all().map(hydrateParticipant);
  const paBriefs = db.prepare('SELECT * FROM pa_briefs').all().map(hydratePaBrief);
  const artifacts = db.prepare('SELECT * FROM canvas_artifacts ORDER BY created_at DESC LIMIT 25').all().map(hydrateArtifact);
  const links = db.prepare('SELECT * FROM artifact_links').all().map(hydrateLink);
  const consensusItems = db.prepare('SELECT * FROM consensus_items').all().map(hydrateConsensusItem);

  const silentBoardActions = [];
  const paCoordinatorActions = [];
  const handRaiseCandidates = [];

  const priorCards = artifacts.filter((a) => a.type === 'prior_room_card');

  for (const delta of deltaEvents) {
    if (delta.kind === 'message') {
      const msg = delta.message;
      if (!msg || msg.senderType !== 'human') continue;
      const text = String(msg.content || '').trim();
      if (!text || LOW_SIGNAL_CHITCHAT_RE.test(text)) continue;

      const anchorIds = Array.isArray(msg.anchorArtifactIds) ? msg.anchorArtifactIds : [];

      // 1. Spatial Voice / Anchored Message Priority (FR-02.1, T04)
      if (anchorIds.length > 0 && enabledRoleMap.has('host')) {
        for (const anchorId of anchorIds) {
          const targetArt = artifacts.find((a) => a.id === anchorId);
          if (!targetArt) continue;
          silentBoardActions.push({
            roleKey: 'host',
            action: 'anchor_elaborate',
            payload: {
              anchorArtifactId: anchorId,
              sourceMessageId: msg.id,
              senderName: msg.senderName,
              content: text,
              linkKind: /(反对|不同意|冲突|问题|风险|但是|弊端|不行)/.test(text) ? 'conflict' : 'derive',
            },
          });
        }
      } else if (
        enabledRoleMap.has('host') &&
        (text.length >= 14 ||
          /(决定|采用|方案|必须|应该|负责|排期|周[一二三四五六日]|风险|分歧|为什么|建议|目标|预算|上线)/.test(text))
      ) {
        // 2. High-signal air stream promotion onto Shared Desk (FR-02.2)
        silentBoardActions.push({
          roleKey: 'host',
          action: 'promote_card',
          payload: {
            sourceMessageId: msg.id,
            title: `📌 ${msg.senderName} 要点提炼`,
            content: clampChars(text, 110),
            section: /(负责|待办|排期|提测|完成|前交付)/.test(text)
              ? 'action_item'
              : /(为什么|怎么|是否|待确认|\?|？)/.test(text)
                ? 'open_question'
                : 'decision',
          },
        });
      }

      // 3. Prior Room Conflict Check (FR-01.3, T15)
      if (enabledRoleMap.has('linker') && priorCards.length > 0) {
        for (const prior of priorCards) {
          const conflictReason = detectPriorRoomConflict(text, prior);
          if (conflictReason) {
            silentBoardActions.push({
              roleKey: 'linker',
              action: 'flag_prior_conflict',
              payload: {
                priorArtifactId: prior.id,
                sourceMessageId: msg.id,
                content: text,
                reason: conflictReason,
              },
            });
          }
        }
      }

      // 4. Check if message attempts to revise an existing locked consensus item (T12)
      const lockedItems = consensusItems.filter((c) => c.status === 'locked');
      if (/(修改锁定|推翻结论|建议把结论改为|AI提议修改)/.test(text) && lockedItems[0]) {
        silentBoardActions.push({
          roleKey: 'host',
          action: 'draft_consensus',
          payload: {
            targetItemId: lockedItems[0].id,
            proposedContent: text,
            reason: `源于 ${msg.senderName} 的会中补充异议`,
          },
        });
      }

      // 5. PA Coordinator Matching (FR-05.2, T09, T10)
      for (const brief of paBriefs) {
        const owner = participants.find((p) => p.id === brief.participantId);
        if (!owner) continue;

        const isExplicitlyMentioned =
          (msg.mentions || []).includes(owner.id) ||
          (msg.mentions || []).includes(owner.name) ||
          text.includes(`@${owner.name}`) ||
          text.includes(owner.name);

        const redlineHit = checkRedlineHit(text, brief.redlineTopics);
        const briefCorpus = [
          brief.summaryMarkdown,
          ...brief.facts,
          ...brief.stances.map((s) => `${s.topic} ${s.position} ${s.rationale || ''}`),
          ...brief.allowedAutoTopics,
        ].join(' ');
        const briefTerms = extractKeyTerms(briefCorpus);
        const topicMatched = briefTerms.some((t) => t.length >= 2 && text.toLowerCase().includes(t.toLowerCase()));

        if (!isExplicitlyMentioned && !topicMatched && !(redlineHit && paBriefs.length === 1)) {
          continue;
        }

        if (redlineHit && (isExplicitlyMentioned || topicMatched || paBriefs.length === 1)) {
          paCoordinatorActions.push({
            participantId: owner.id,
            action: 'create_redline_signoff',
            summary: clampChars(
              `涉及 @${owner.name} 红线「${redlineHit}」：${text}（待本人确认签字）`,
              80
            ),
            matchedFactOrRedline: redlineHit,
          });
        } else if (brief.mode === 'context_only') {
          const matchedFact =
            brief.facts.find((f) =>
              extractKeyTerms(f).some((t) => t.length >= 2 && text.toLowerCase().includes(t.toLowerCase()))
            ) ||
            brief.facts[0] ||
            brief.summaryMarkdown;

          paCoordinatorActions.push({
            participantId: owner.id,
            action: 'host_quote_context',
            summary: clampChars(`据 ${owner.name} PA 简报核实：${matchedFact}`, 80),
            matchedFactOrRedline: clampChars(matchedFact, 60),
          });
        } else {
          // proxy_tiered regular topic
          const matchedStance = brief.stances[0];
          const matchedFact = brief.facts[0] || brief.summaryMarkdown;
          const replyCore = matchedStance
            ? `${matchedStance.topic}：${matchedStance.position}（${matchedFact.slice(0, 34)}）`
            : matchedFact;

          paCoordinatorActions.push({
            participantId: owner.id,
            action: 'request_proxy_reply',
            summary: clampChars(replyCore, 76),
            matchedFactOrRedline: matchedStance?.topic || '常规授权进度',
          });
        }
      }

      // 6. Public Hand-Raise / Spark Role Candidates (FR-04)
      const specialistRoles = roles.filter((r) => r.behaviorMode === 'hand_raise_or_spark');
      for (const role of specialistRoles) {
        const aliases = ROLE_NAME_ALIASES[role.roleKey] || [role.roleKey, role.displayName];
        const directMention = aliases.some(
          (al) =>
            text.toLowerCase().includes(`@${al.toLowerCase()}`) ||
            (msg.mentions || []).some((m) => String(m).toLowerCase() === al.toLowerCase())
        );

        let confidence = 0.74;
        if (directMention) confidence = 0.98;
        else if (role.roleKey === 'spark' && /(突破|创意|脑暴|怎么改|转化|方案|思路|点子|留存|新)/.test(text))
          confidence = 0.88;
        else if (role.roleKey === 'critic' && /(绝对|一定|直接|全部|重构|没问题|完美|WebSocket|SSE)/.test(text))
          confidence = 0.85;
        else if (role.roleKey === 'tech_feasibility' && /(架构|接口|数据库|性能|并发|SDK|部署|延迟)/.test(text))
          confidence = 0.84;
        else if (role.roleKey === 'cost_risk' && /(成本|Token|算力|预算|权限|安全|隐私)/.test(text))
          confidence = 0.86;
        else if (role.roleKey === 'target_user' && /(用户|首屏|体验|引导|上手|注册|页面)/.test(text))
          confidence = 0.84;

        const targetArt = anchorIds[0]
          ? artifacts.find((a) => a.id === anchorIds[0])
          : artifacts.find((a) => a.zone === 'main');
        const { teaser } = generateRoleTeaserAndFullInsight(role, text, targetArt);

        handRaiseCandidates.push({
          roleKey: role.roleKey,
          teaser,
          targetArtifactIds: targetArt ? [targetArt.id] : [],
          confidence,
          directMention,
          triggerText: text,
        });
      }
    } else if (delta.kind === 'artifact') {
      const art = delta.artifact;
      if (!art || art.authorType !== 'human') continue;
      const text = `${art.title || ''} ${art.content || ''}`.trim();

      // Check conflict against any prior_room_card (T15)
      if (enabledRoleMap.has('linker') && art.type !== 'prior_room_card') {
        for (const prior of priorCards) {
          const conflictReason = detectPriorRoomConflict(text, prior);
          if (conflictReason) {
            const exists = links.some(
              (l) =>
                (l.fromArtifactId === art.id && l.toArtifactId === prior.id) ||
                (l.fromArtifactId === prior.id && l.toArtifactId === art.id)
            );
            if (!exists) {
              silentBoardActions.push({
                roleKey: 'linker',
                action: 'create_link',
                payload: {
                  fromArtifactId: art.id,
                  toArtifactId: prior.id,
                  kind: 'conflict',
                  reason: conflictReason,
                },
              });
            }
          }
        }

        // Semantic link to related main board artifact
        const peers = artifacts.filter(
          (other) => other.id !== art.id && other.zone === 'main' && other.type !== 'prior_room_card'
        );
        if (peers.length > 0) {
          const isConflict = /(替代|相反|VS|对比|方案\s*B|还是用|反对)/i.test(text);
          const isSupport = /(数据|实测|压测|佐证|报告|截图|参考)/.test(text);
          if (isConflict || isSupport) {
            const targetPeer = peers[0];
            const alreadyLinked = links.some(
              (l) =>
                (l.fromArtifactId === art.id && l.toArtifactId === targetPeer.id) ||
                (l.fromArtifactId === targetPeer.id && l.toArtifactId === art.id)
            );
            if (!alreadyLinked) {
              silentBoardActions.push({
                roleKey: 'linker',
                action: 'create_link',
                payload: {
                  fromArtifactId: art.id,
                  toArtifactId: targetPeer.id,
                  kind: isConflict ? 'conflict' : 'support',
                  reason: isConflict ? '互斥备选方案碰撞对比' : '补充论据支撑核心观点',
                },
              });
            }
          }
        }
      }

      // Specialist role reaction when human posts a new card on the desk (T05 / T06)
      const specialistRoles = roles.filter((r) => r.behaviorMode === 'hand_raise_or_spark');
      for (const role of specialistRoles) {
        const { teaser } = generateRoleTeaserAndFullInsight(role, text, art);
        handRaiseCandidates.push({
          roleKey: role.roleKey,
          teaser,
          targetArtifactIds: [art.id],
          confidence: role.roleKey === 'spark' ? 0.89 : 0.8,
          directMention: false,
          triggerText: text,
        });
      }
    }
  }

  return {
    silentBoardActions,
    paCoordinatorActions,
    handRaiseCandidates,
  };
}

/**
 * Stage 2: Expand a Hand Raise into a complete Spark/Role Card inside `spark_zone`
 */
export async function expandHandRaiseToBoard(
  db,
  { handRaiseId, actorId = 'human', env = {}, emitEvent }
) {
  const row = db.prepare('SELECT * FROM hand_raises WHERE id = ?').get(handRaiseId);
  if (!row) throw new Error('Hand raise record not found');
  if (row.status === 'expanded' && row.expanded_artifact_id) {
    const existingArt = db
      .prepare('SELECT * FROM canvas_artifacts WHERE id = ?')
      .get(row.expanded_artifact_id);
    return {
      handRaise: hydrateHandRaise(row),
      artifact: hydrateArtifact(existingArt),
    };
  }

  // Transition -> expanding
  db.prepare("UPDATE hand_raises SET status = 'expanding' WHERE id = ?").run(handRaiseId);
  emitEvent?.('agent.hand_updated', {
    handRaise: hydrateHandRaise(db.prepare('SELECT * FROM hand_raises WHERE id = ?').get(handRaiseId)),
  });

  const roleRow = db.prepare('SELECT * FROM room_roles WHERE role_key = ?').get(row.role_key);
  const role = roleRow
    ? hydrateRoomRole(roleRow)
    : {
        roleKey: row.role_key,
        displayName: row.role_key,
        badgeEmoji: '💡',
        color: '#D97706',
        systemInstruction: '',
      };

  const triggerCtx = safeJsonParse(row.trigger_context_json, {});
  const targetIds = safeJsonParse(row.target_artifact_ids_json, []);
  const targetArtRow = targetIds[0]
    ? db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(targetIds[0])
    : null;
  const targetArt = hydrateArtifact(targetArtRow);

  let { cardTitle, cardContent } = generateRoleTeaserAndFullInsight(
    role,
    triggerCtx.relatedText || row.teaser,
    targetArt
  );

  // Optional Stage-2 Reasoning Model call
  const apiKey = env?.LLM_API_KEY || process.env.LLM_API_KEY;
  if (apiKey) {
    const baseUrl = (env?.LLM_BASE_URL || process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = env?.LLM_REASONING_MODEL || process.env.LLM_REASONING_MODEL || 'gpt-4o-mini';
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          messages: [
            {
              role: 'system',
              content: `你是圆桌角色「${role.displayName}」(${role.systemInstruction})。请将你的举手钩子「${row.teaser}」展开为一张 60~120 字的高密度可执行白板灵感卡正文（纯文本，不要标题前缀）。`,
            },
            {
              role: 'user',
              content: `触发上下文：${JSON.stringify(triggerCtx)}\n关联卡片：${targetArt ? `${targetArt.title}: ${targetArt.content}` : '无'}`,
            },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const llmText = data?.choices?.[0]?.message?.content?.trim();
        if (llmText) cardContent = clampChars(llmText, 180);
      }
    } catch {
      // local_fallback cardContent already prepared
    }
  }

  const allArts = db.prepare('SELECT * FROM canvas_artifacts').all().map(hydrateArtifact);
  const slot = nextSparkZoneSlot(allArts);
  const artId = generateId('art');
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO canvas_artifacts
      (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
     VALUES (?, 'spark_card', 'spark_zone', ?, ?, 'public_role', ?, ?, '#FEF3C7', ?, ?, 248, '{}', ?, ?, 0, ?, ?)`
  ).run(
    artId,
    cardTitle,
    cardContent,
    role.roleKey,
    role.displayName,
    slot.x,
    slot.y,
    JSON.stringify({ roleKey: role.roleKey, expandedFromHandRaiseId: handRaiseId, teaser: row.teaser }),
    JSON.stringify({ type: 'hand_raise', id: handRaiseId, label: row.teaser }),
    now,
    now
  );

  let createdLink = null;
  if (targetArt) {
    const linkId = generateId('lnk');
    const linkKind = role.roleKey === 'critic' ? 'conflict' : 'derive';
    db.prepare(
      `INSERT INTO artifact_links
        (id, from_artifact_id, to_artifact_id, kind, reason, created_by, vote_a_users_json, vote_b_users_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, '[]', '[]', ?)`
    ).run(linkId, artId, targetArt.id, linkKind, `${role.displayName}点将展开：${row.teaser}`, role.roleKey, now);
    createdLink = hydrateLink(db.prepare('SELECT * FROM artifact_links WHERE id = ?').get(linkId));
  }

  db.prepare(
    `UPDATE hand_raises
     SET status = 'expanded', expanded_artifact_id = ?, resolved_at = ?
     WHERE id = ?`
  ).run(artId, now, handRaiseId);

  const expandedArt = hydrateArtifact(db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(artId));
  const updatedHr = hydrateHandRaise(db.prepare('SELECT * FROM hand_raises WHERE id = ?').get(handRaiseId));

  const ev = appendRoomEvent(db, {
    eventType: 'hand.expanded',
    actorType: 'human',
    actorId,
    actorName: role.displayName,
    summaryText: `点将展开「${role.displayName}」举手卡片：${row.teaser}`,
    payload: { handRaiseId, artifactId: artId, roleKey: role.roleKey },
    createdAt: now,
  });

  emitEvent?.('agent.cursor_flash', {
    roleKey: role.roleKey,
    displayName: role.displayName,
    color: role.color,
    fromPoint: { x: 760, y: 72 },
    toPoint: { x: expandedArt.x + 80, y: expandedArt.y + 40 },
    actionLabel: `${role.badgeEmoji} 展开落卡`,
    seq: ev.seq,
  });
  emitEvent?.('artifact.upserted', { artifact: expandedArt, seq: ev.seq });
  if (createdLink) emitEvent?.('link.upserted', { link: createdLink, seq: ev.seq });
  emitEvent?.('agent.hand_updated', { handRaise: updatedHr, seq: ev.seq });

  return { handRaise: updatedHr, artifact: expandedArt, link: createdLink };
}

/**
 * Execute Triage Pipeline + Hard Server-Side Guardrail Middleware (PRD Section 5.2)
 */
export async function runTriageCycle(
  db,
  deltaEvents,
  {
    env = {},
    emitEvent,
    roleCooldownMs = 60_000,
    nowMs = Date.now(),
  } = {}
) {
  if (!Array.isArray(deltaEvents) || deltaEvents.length === 0) {
    return { executedSilent: 0, executedPa: 0, raisedHands: [], autoDroppedSparks: [] };
  }

  const meta = hydrateRoomMeta(db.prepare('SELECT * FROM room_meta LIMIT 1').get());
  if (!meta) return { executedSilent: 0, executedPa: 0, raisedHands: [], autoDroppedSparks: [] };

  // Build deterministic baseline plan + optional Fast LLM plan
  const localPlan = buildLocalTriagePlan(db, deltaEvents);
  const llmPlan = await maybeCallFastTriageLlm(
    {
      roomMeta: { title: meta.title, presetId: meta.presetId, pacingMode: meta.pacingMode },
      deltas: deltaEvents.slice(0, 6),
    },
    env
  );

  const mergedPlan = {
    silentBoardActions: localPlan.silentBoardActions,
    paCoordinatorActions: localPlan.paCoordinatorActions,
    handRaiseCandidates:
      llmPlan?.handRaiseCandidates?.length > 0
        ? [...llmPlan.handRaiseCandidates, ...localPlan.handRaiseCandidates]
        : localPlan.handRaiseCandidates,
  };

  const nowIso = new Date(nowMs).toISOString();
  let executedSilent = 0;
  let executedPa = 0;
  const raisedHands = [];
  const autoDroppedSparks = [];

  // =========================================================================
  // 1. Execute Silent Board Actions (`host` & `linker`) + Locked Guardrail #4
  // =========================================================================
  for (const act of mergedPlan.silentBoardActions.slice(0, 5)) {
    const allArts = db.prepare('SELECT * FROM canvas_artifacts').all().map(hydrateArtifact);

    if (act.action === 'anchor_elaborate') {
      const { anchorArtifactId, sourceMessageId, senderName, content, linkKind } = act.payload;
      const anchor = allArts.find((a) => a.id === anchorArtifactId);
      if (!anchor) continue;

      const cardId = generateId('art');
      const pos = { x: anchor.x + 36, y: anchor.y + 185 };
      db.prepare(
        `INSERT INTO canvas_artifacts
          (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
         VALUES (?, 'sticky', 'main', ?, ?, 'public_role', 'host', 'Host 控场记录', '#E0F2FE', ?, ?, 248, '{}', ?, ?, 0, ?, ?)`
      ).run(
        cardId,
        `🎙 针对「${clampChars(anchor.title || anchor.content, 12)}」补充`,
        clampChars(`${senderName}：${content}`, 130),
        pos.x,
        pos.y,
        JSON.stringify({ anchoredTo: anchor.id }),
        JSON.stringify({ type: 'message', id: sourceMessageId, label: `${senderName} 空间锚定语音` }),
        nowIso,
        nowIso
      );

      if (sourceMessageId) {
        db.prepare('UPDATE messages SET promoted_artifact_id = ? WHERE id = ?').run(cardId, sourceMessageId);
      }

      const linkId = generateId('lnk');
      db.prepare(
        `INSERT INTO artifact_links
          (id, from_artifact_id, to_artifact_id, kind, reason, created_by, vote_a_users_json, vote_b_users_json, created_at)
         VALUES (?, ?, ?, ?, ?, 'linker', '[]', '[]', ?)`
      ).run(linkId, cardId, anchor.id, linkKind || 'derive', `${senderName} 空间语音定向补充`, nowIso);

      const newCard = hydrateArtifact(db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(cardId));
      const newLink = hydrateLink(db.prepare('SELECT * FROM artifact_links WHERE id = ?').get(linkId));

      const ev = appendRoomEvent(db, {
        eventType: 'artifact.created',
        actorType: 'public_role',
        actorId: 'host',
        actorName: 'Host 控场记录',
        summaryText: `Host 将 ${senderName} 针对「${anchor.title || '锚定卡'}」的空间语音整理上墙`,
        payload: { artifactId: cardId, anchorArtifactId: anchor.id, linkId },
        createdAt: nowIso,
      });

      emitEvent?.('agent.cursor_flash', {
        roleKey: 'host',
        displayName: 'Host 控场记录',
        color: '#4F46E5',
        fromPoint: { x: anchor.x + 90, y: anchor.y + 60 },
        toPoint: { x: newCard.x + 90, y: newCard.y + 40 },
        actionLabel: '锚定语音落卡',
        seq: ev.seq,
      });
      emitEvent?.('artifact.upserted', { artifact: newCard, seq: ev.seq });
      emitEvent?.('link.upserted', { link: newLink, seq: ev.seq });
      executedSilent += 1;
    } else if (act.action === 'promote_card') {
      const { sourceMessageId, title, content, section } = act.payload;
      // Avoid promoting the same message twice
      if (sourceMessageId) {
        const msgRow = db.prepare('SELECT promoted_artifact_id FROM messages WHERE id = ?').get(sourceMessageId);
        if (msgRow?.promoted_artifact_id) continue;
      }

      const slot = nextMainBoardSlot(allArts);
      const cardId = generateId('art');
      db.prepare(
        `INSERT INTO canvas_artifacts
          (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
         VALUES (?, 'sticky', 'main', ?, ?, 'public_role', 'host', 'Host 控场记录', '#FEF9C3', ?, ?, 248, '{}', ?, ?, 0, ?, ?)`
      ).run(
        cardId,
        title || '📌 讨论要点',
        content,
        slot.x,
        slot.y,
        JSON.stringify({ category: section || 'decision' }),
        JSON.stringify(
          sourceMessageId ? { type: 'message', id: sourceMessageId, label: '发言高光提炼' } : null
        ),
        nowIso,
        nowIso
      );

      if (sourceMessageId) {
        db.prepare('UPDATE messages SET promoted_artifact_id = ? WHERE id = ?').run(cardId, sourceMessageId);
      }

      const newCard = hydrateArtifact(db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(cardId));
      const ev = appendRoomEvent(db, {
        eventType: 'artifact.created',
        actorType: 'public_role',
        actorId: 'host',
        actorName: 'Host 控场记录',
        summaryText: `Host 提炼高信噪比发言上墙：「${clampChars(content, 28)}」`,
        payload: { artifactId: cardId, sourceMessageId, x: newCard.x, y: newCard.y },
        createdAt: nowIso,
      });

      const draftCons = createConsensusItem(db, {
        section: section || 'decision',
        content,
        status: 'draft',
        actorType: 'public_role',
        actorId: 'host',
        actorName: 'Host 控场记录',
        sourceRefs: [{ type: 'artifact', id: cardId, seq: ev.seq }],
      });

      emitEvent?.('agent.cursor_flash', {
        roleKey: 'host',
        displayName: 'Host 控场记录',
        color: '#4F46E5',
        fromPoint: { x: 900, y: 520 },
        toPoint: { x: newCard.x + 80, y: newCard.y + 40 },
        actionLabel: '提炼要点上墙',
        seq: ev.seq,
      });
      emitEvent?.('artifact.upserted', { artifact: newCard, seq: ev.seq });
      emitEvent?.('consensus.updated', { item: draftCons, seq: ev.seq });
      executedSilent += 1;
    } else if (act.action === 'flag_prior_conflict') {
      const { priorArtifactId, sourceMessageId, content, reason } = act.payload;
      const priorCard = allArts.find((a) => a.id === priorArtifactId);
      if (!priorCard) continue;

      // Find promoted card for this message or create a contention card
      let fromId = null;
      if (sourceMessageId) {
        const msgRow = db.prepare('SELECT promoted_artifact_id FROM messages WHERE id = ?').get(sourceMessageId);
        fromId = msgRow?.promoted_artifact_id || null;
      }
      if (!fromId) {
        fromId = generateId('art');
        db.prepare(
          `INSERT INTO canvas_artifacts
            (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
           VALUES (?, 'sticky', 'main', '⚠️ 与前序结论冲突提议', ?, 'public_role', 'linker', 'Linker 逻辑串联', '#FFE4E6', ?, ?, 248, '{}', '{}', ?, 0, ?, ?)`
        ).run(
          fromId,
          clampChars(content, 110),
          priorCard.x + 290,
          priorCard.y + 20,
          JSON.stringify(sourceMessageId ? { type: 'message', id: sourceMessageId, label: '冲突发言' } : null),
          nowIso,
          nowIso
        );
        const createdConflictCard = hydrateArtifact(
          db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(fromId)
        );
        emitEvent?.('artifact.upserted', { artifact: createdConflictCard });
      }

      const linkId = generateId('lnk');
      db.prepare(
        `INSERT INTO artifact_links
          (id, from_artifact_id, to_artifact_id, kind, reason, created_by, vote_a_users_json, vote_b_users_json, created_at)
         VALUES (?, ?, ?, 'conflict', ?, 'linker', '[]', '[]', ?)`
      ).run(linkId, fromId, priorCard.id, reason, nowIso);

      const newLink = hydrateLink(db.prepare('SELECT * FROM artifact_links WHERE id = ?').get(linkId));
      const ev = appendRoomEvent(db, {
        eventType: 'link.created',
        actorType: 'public_role',
        actorId: 'linker',
        actorName: 'Linker 逻辑串联',
        summaryText: `Linker 检测到与前序会议结论冲突：${reason}`,
        payload: { linkId, fromArtifactId: fromId, toArtifactId: priorCard.id, kind: 'conflict' },
        createdAt: nowIso,
      });

      emitEvent?.('agent.cursor_flash', {
        roleKey: 'linker',
        displayName: 'Linker 逻辑串联',
        color: '#7C3AED',
        fromPoint: { x: priorCard.x + 120, y: priorCard.y + 60 },
        toPoint: { x: priorCard.x + 260, y: priorCard.y + 60 },
        actionLabel: '⚠️ 前序结论冲突预警',
        seq: ev.seq,
      });
      emitEvent?.('link.upserted', { link: newLink, seq: ev.seq });
      executedSilent += 1;
    } else if (act.action === 'create_link') {
      const { fromArtifactId, toArtifactId, kind, reason } = act.payload;
      if (!fromArtifactId || !toArtifactId || fromArtifactId === toArtifactId) continue;
      const linkId = generateId('lnk');
      db.prepare(
        `INSERT INTO artifact_links
          (id, from_artifact_id, to_artifact_id, kind, reason, created_by, vote_a_users_json, vote_b_users_json, created_at)
         VALUES (?, ?, ?, ?, ?, 'linker', '[]', '[]', ?)`
      ).run(linkId, fromArtifactId, toArtifactId, kind || 'derive', reason || '', nowIso);

      const newLink = hydrateLink(db.prepare('SELECT * FROM artifact_links WHERE id = ?').get(linkId));
      const ev = appendRoomEvent(db, {
        eventType: 'link.created',
        actorType: 'public_role',
        actorId: 'linker',
        actorName: 'Linker 逻辑串联',
        summaryText: `Linker 创建了 ${kind} 语义虚线：${reason || '关联卡片'}`,
        payload: { linkId, kind: newLink.kind, fromArtifactId, toArtifactId },
        createdAt: nowIso,
      });
      emitEvent?.('link.upserted', { link: newLink, seq: ev.seq });
      executedSilent += 1;
    } else if (act.action === 'draft_consensus') {
      const { targetItemId, proposedContent, reason } = act.payload;
      if (targetItemId) {
        // Guardrail #4: Locked items are NEVER overwritten; converts to revision_proposal!
        const res = aiReviseConsensusSafely(db, {
          targetItemId,
          proposedContent,
          reason: reason || 'AI 修订建议',
        });
        if (res.proposal) emitEvent?.('proposal.created', { proposal: res.proposal });
        if (res.item) emitEvent?.('consensus.updated', { item: res.item });
        executedSilent += 1;
      }
    }
  }

  // =========================================================================
  // 2. Execute PA Coordinator Actions + Hard Redline Intercept (Guardrail #3)
  // =========================================================================
  const deltaTextCombined = deltaEvents
    .map((d) => (d.kind === 'message' ? d.message?.content : `${d.artifact?.title} ${d.artifact?.content}`))
    .join(' ');

  for (const paAct of mergedPlan.paCoordinatorActions.slice(0, 3)) {
    const briefRow = db
      .prepare('SELECT * FROM pa_briefs WHERE participant_id = ?')
      .get(paAct.participantId);
    const ownerRow = db.prepare('SELECT * FROM participants WHERE id = ?').get(paAct.participantId);
    if (!briefRow || !ownerRow) continue;

    const brief = hydratePaBrief(briefRow);
    const owner = hydrateParticipant(ownerRow);

    // Hard Guardrail #3: Force `create_redline_signoff` if ANY redline keyword/topic is touched!
    const detectedRedline =
      checkRedlineHit(paAct.summary, brief.redlineTopics) ||
      checkRedlineHit(paAct.matchedFactOrRedline, brief.redlineTopics) ||
      checkRedlineHit(deltaTextCombined, brief.redlineTopics);

    let effectiveAction = paAct.action;
    if (detectedRedline) {
      effectiveAction = 'create_redline_signoff';
    } else if (brief.mode === 'context_only') {
      // In `context_only` mode, PA NEVER speaks as proxy; Host silently cites verified context!
      effectiveAction = 'host_quote_context';
    }

    const allArts = db.prepare('SELECT * FROM canvas_artifacts').all().map(hydrateArtifact);
    const slot = nextMainBoardSlot(allArts);

    if (effectiveAction === 'create_redline_signoff') {
      const signoffText = clampChars(
        paAct.summary || `涉及 @${owner.name} 红线事项（${detectedRedline || '待本人拍板'}）：${deltaTextCombined}`,
        110
      );

      const consItem = createConsensusItem(db, {
        section: 'action_item',
        content: signoffText,
        ownerParticipantId: owner.id,
        status: 'draft',
        signoffStatus: 'pending_human_signoff',
        actorType: 'public_role',
        actorId: 'host',
        actorName: 'Host 控场记录',
        sourceRefs: [{ type: 'pa_brief', id: brief.id }],
      });

      const cardId = generateId('art');
      db.prepare(
        `INSERT INTO canvas_artifacts
          (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
         VALUES (?, 'signoff_card', 'main', ?, ?, 'public_role', 'host', 'Host 红线守卫', '#FEF3C7', ?, ?, 264, '{}', ?, ?, 0, ?, ?)`
      ).run(
        cardId,
        `🛑 待 ${owner.name} 本人签字确认`,
        signoffText,
        slot.x,
        slot.y,
        JSON.stringify({
          consensusItemId: consItem.id,
          ownerParticipantId: owner.id,
          ownerName: owner.name,
          redlineTopic: detectedRedline || '授权红线',
          signoffStatus: 'pending_human_signoff',
        }),
        JSON.stringify({ type: 'pa_brief', id: brief.id, label: `${owner.name} 红线拦截` }),
        nowIso,
        nowIso
      );

      const signoffCard = hydrateArtifact(
        db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(cardId)
      );
      emitEvent?.('artifact.upserted', { artifact: signoffCard });
      emitEvent?.('consensus.updated', { item: consItem });
      executedPa += 1;
    } else if (effectiveAction === 'host_quote_context') {
      db.prepare(
        'UPDATE pa_briefs SET reference_count = reference_count + 1, updated_at = ? WHERE id = ?'
      ).run(nowIso, brief.id);

      const cardId = generateId('art');
      const quoteBody = clampChars(paAct.summary, 80);
      db.prepare(
        `INSERT INTO canvas_artifacts
          (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
         VALUES (?, 'pa_quote_card', 'main', ?, ?, 'public_role', 'host', 'Host 控场记录', '#DCFCE7', ?, ?, 252, '{}', ?, ?, 0, ?, ?)`
      ).run(
        cardId,
        `📎 ${owner.name} PA 上下文核实`,
        quoteBody,
        slot.x,
        slot.y,
        JSON.stringify({ participantId: owner.id, mode: 'context_only' }),
        JSON.stringify({ type: 'pa_brief', id: brief.id, label: `${owner.name} PA 脱敏简报` }),
        nowIso,
        nowIso
      );

      const quoteCard = hydrateArtifact(db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(cardId));
      const updatedBrief = hydratePaBrief(db.prepare('SELECT * FROM pa_briefs WHERE id = ?').get(brief.id));

      const ev = appendRoomEvent(db, {
        eventType: 'pa.referenced',
        actorType: 'public_role',
        actorId: 'host',
        actorName: 'Host 控场记录',
        summaryText: `Host 静默引用了 ${owner.name} 的 PA 事实：${quoteBody}`,
        payload: { participantId: owner.id, briefId: brief.id, artifactId: cardId },
        createdAt: nowIso,
      });

      emitEvent?.('pa.referenced', {
        participantId: owner.id,
        participantName: owner.name,
        brief: updatedBrief,
        artifactId: cardId,
        seq: ev.seq,
      });
      emitEvent?.('artifact.upserted', { artifact: quoteCard, seq: ev.seq });
      executedPa += 1;
    } else if (effectiveAction === 'request_proxy_reply') {
      // `proxy_tiered` regular topic: Host coordinates concise <=80 char PA proxy card on board
      db.prepare(
        'UPDATE pa_briefs SET reference_count = reference_count + 1, updated_at = ? WHERE id = ?'
      ).run(nowIso, brief.id);

      const replyBody = clampChars(paAct.summary, 80);
      const cardId = generateId('art');
      db.prepare(
        `INSERT INTO canvas_artifacts
          (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
         VALUES (?, 'pa_quote_card', 'main', ?, ?, 'pa_proxy', ?, ?, '#F3E8FF', ?, ?, 252, '{}', ?, ?, 0, ?, ?)`
      ).run(
        cardId,
        `🤖 ${owner.name}的 PA 代言`,
        replyBody,
        owner.id,
        `🤖 ${owner.name}的 PA 代言`,
        slot.x,
        slot.y,
        JSON.stringify({ participantId: owner.id, mode: 'proxy_tiered' }),
        JSON.stringify({ type: 'pa_brief', id: brief.id, label: `${owner.name} 常规授权代答` }),
        nowIso,
        nowIso
      );

      const proxyCard = hydrateArtifact(db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(cardId));
      const updatedBrief = hydratePaBrief(db.prepare('SELECT * FROM pa_briefs WHERE id = ?').get(brief.id));

      const ev = appendRoomEvent(db, {
        eventType: 'pa.referenced',
        actorType: 'pa_proxy',
        actorId: owner.id,
        actorName: `🤖 ${owner.name}的 PA 代言`,
        summaryText: `🤖 ${owner.name}的 PA 代言（经 Host 控麦）：${replyBody}`,
        payload: { participantId: owner.id, briefId: brief.id, artifactId: cardId, mode: 'proxy_tiered' },
        createdAt: nowIso,
      });

      emitEvent?.('pa.referenced', {
        participantId: owner.id,
        participantName: owner.name,
        brief: updatedBrief,
        artifactId: cardId,
        seq: ev.seq,
      });
      emitEvent?.('artifact.upserted', { artifact: proxyCard, seq: ev.seq });
      executedPa += 1;
    }
  }

  // =========================================================================
  // 3. Guardrail #1 & #2: Auto-Pacing (`solo` Spark Zone vs `multiplayer` Hand-Raise)
  // =========================================================================
  const sortedCandidates = [...mergedPlan.handRaiseCandidates].sort(
    (a, b) => Number(b.confidence || 0) - Number(a.confidence || 0)
  );

  if (meta.pacingMode === 'solo') {
    // Solo Director Mode (`activeHumanCount <= 1`): Auto-drop top 1-2 insights directly into `spark_zone`!
    const picked = sortedCandidates.filter((c) => Number(c.confidence || 0) >= 0.72).slice(0, 2);
    const seenRoles = new Set();

    for (const cand of picked) {
      if (seenRoles.has(cand.roleKey)) continue;
      seenRoles.add(cand.roleKey);

      const roleRow = db
        .prepare('SELECT * FROM room_roles WHERE role_key = ? AND enabled = 1')
        .get(cand.roleKey);
      if (!roleRow) continue;
      const role = hydrateRoomRole(roleRow);

      const allArts = db.prepare('SELECT * FROM canvas_artifacts').all().map(hydrateArtifact);
      const targetArt = cand.targetArtifactIds?.[0]
        ? allArts.find((a) => a.id === cand.targetArtifactIds[0])
        : allArts[0];

      const { cardTitle, cardContent } = generateRoleTeaserAndFullInsight(
        role,
        cand.triggerText || cand.teaser,
        targetArt
      );
      const slot = nextSparkZoneSlot(allArts);
      const cardId = generateId('art');

      db.prepare(
        `INSERT INTO canvas_artifacts
          (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
         VALUES (?, 'spark_card', 'spark_zone', ?, ?, 'public_role', ?, ?, '#FEF3C7', ?, ?, 248, '{}', ?, 'null', 0, ?, ?)`
      ).run(
        cardId,
        cardTitle,
        cardContent,
        role.roleKey,
        role.displayName,
        slot.x,
        slot.y,
        JSON.stringify({ roleKey: role.roleKey, autoDroppedInSolo: true }),
        nowIso,
        nowIso
      );

      db.prepare(
        'UPDATE room_roles SET hand_raise_count = hand_raise_count + 1, last_acted_at = ? WHERE role_key = ?'
      ).run(nowIso, role.roleKey);

      const sparkCard = hydrateArtifact(db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(cardId));
      autoDroppedSparks.push(sparkCard);

      const ev = appendRoomEvent(db, {
        eventType: 'artifact.created',
        actorType: 'public_role',
        actorId: role.roleKey,
        actorName: role.displayName,
        summaryText: `${role.displayName}（单人智囊模式）向边缘灵感区投入卡片：「${cardTitle}」`,
        payload: { artifactId: cardId, zone: 'spark_zone', roleKey: role.roleKey },
        createdAt: nowIso,
      });

      emitEvent?.('agent.cursor_flash', {
        roleKey: role.roleKey,
        displayName: role.displayName,
        color: role.color,
        fromPoint: { x: 760, y: 72 },
        toPoint: { x: sparkCard.x + 80, y: sparkCard.y + 40 },
        actionLabel: `${role.badgeEmoji} 灵感入区`,
        seq: ev.seq,
      });
      emitEvent?.('artifact.upserted', { artifact: sparkCard, seq: ev.seq });
    }
  } else {
    // Multiplayer Mode (`activeHumanCount >= 2`):
    // STRICT GUARDRAIL: At most 1 handRaiseCandidate per Triage, confidence >= 0.72,
    // cooldown >= 60s (`roleCooldownMs`), unresolved hand raises for role < 5, teaser <= 20 chars!
    for (const cand of sortedCandidates) {
      if (Number(cand.confidence || 0) < 0.72) continue;

      const roleRow = db
        .prepare('SELECT * FROM room_roles WHERE role_key = ? AND enabled = 1')
        .get(cand.roleKey);
      if (!roleRow || roleRow.behavior_mode !== 'hand_raise_or_spark') continue;

      if (roleRow.last_acted_at) {
        const elapsed = nowMs - new Date(roleRow.last_acted_at).getTime();
        if (elapsed < roleCooldownMs) {
          continue; // Still in 60s cooldown!
        }
      }

      const unresolvedRow = db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM hand_raises
           WHERE role_key = ? AND status IN ('raised_teaser', 'folded')`
        )
        .get(cand.roleKey);
      if (Number(unresolvedRow?.cnt || 0) >= 5) {
        continue; // Cap unresolved hand raises at 5!
      }

      const teaser = clampChars(cand.teaser, 20);
      const hrId = generateId('hr');

      db.prepare(
        `INSERT INTO hand_raises
          (id, role_key, teaser, trigger_context_json, target_artifact_ids_json, status, expanded_artifact_id, created_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, 'raised_teaser', NULL, ?, NULL)`
      ).run(
        hrId,
        cand.roleKey,
        teaser,
        JSON.stringify({ relatedText: cand.triggerText || deltaTextCombined.slice(0, 160) }),
        JSON.stringify(cand.targetArtifactIds || []),
        nowIso
      );

      db.prepare(
        'UPDATE room_roles SET hand_raise_count = hand_raise_count + 1, last_acted_at = ? WHERE role_key = ?'
      ).run(nowIso, cand.roleKey);

      const hr = hydrateHandRaise(db.prepare('SELECT * FROM hand_raises WHERE id = ?').get(hrId));
      raisedHands.push(hr);

      const ev = appendRoomEvent(db, {
        eventType: 'hand.raised',
        actorType: 'public_role',
        actorId: roleRow.role_key,
        actorName: roleRow.display_name,
        summaryText: `${roleRow.display_name} 举手：「${teaser}」`,
        payload: { handRaiseId: hrId, roleKey: roleRow.role_key, teaser },
        createdAt: nowIso,
      });

      emitEvent?.('agent.hand_raised', {
        handRaise: hr,
        role: hydrateRoomRole(db.prepare('SELECT * FROM room_roles WHERE role_key = ?').get(cand.roleKey)),
        seq: ev.seq,
      });

      // If explicitly @mentioned by human in multiplayer, immediately lazy-expand!
      if (cand.directMention) {
        await expandHandRaiseToBoard(db, { handRaiseId: hrId, actorId: 'mention_auto', env, emitEvent });
      }

      break; // Enforce <= 1 hand raise per Triage cycle!
    }
  }

  return {
    executedSilent,
    executedPa,
    raisedHands,
    autoDroppedSparks,
  };
}

/**
 * FR-03.2 & Section 5.3 #2: Conflict Link `✨ 并行推演利弊` (Generates A/B Pros-Cons Dual Cards)
 */
export async function evaluateConflictParallel(db, { linkId, actorId = 'human', emitEvent }) {
  const linkRow = db.prepare('SELECT * FROM artifact_links WHERE id = ?').get(linkId);
  if (!linkRow) throw new Error('Link not found');
  const artA = hydrateArtifact(
    db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(linkRow.from_artifact_id)
  );
  const artB = hydrateArtifact(
    db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(linkRow.to_artifact_id)
  );
  if (!artA || !artB) throw new Error('Linked artifacts not found');

  const allArts = db.prepare('SELECT * FROM canvas_artifacts').all().map(hydrateArtifact);
  const slotA = nextSparkZoneSlot(allArts);
  const slotB = { x: slotA.x, y: slotA.y + 185 };
  const now = new Date().toISOString();

  const evalCards = [
    {
      id: generateId('art'),
      title: `⚖️ 推演 A：${clampChars(artA.title || artA.content, 12)}`,
      content: `优势：落地路径短、与现有架构同构风险低；代价：极端高并发双向流扩展性受限。适用：当前 V1 快速验证闭环。`,
      targetId: artA.id,
      pos: slotA,
    },
    {
      id: generateId('art'),
      title: `⚖️ 推演 B：${clampChars(artB.title || artB.content, 12)}`,
      content: `优势：理论上限与自定义控制力强；代价：客户端重连状态机与双栈维护成本增加约 2.5 倍。适用：二期超大规模场景。`,
      targetId: artB.id,
      pos: slotB,
    },
  ];

  const created = [];
  for (const spec of evalCards) {
    db.prepare(
      `INSERT INTO canvas_artifacts
        (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
       VALUES (?, 'spark_card', 'spark_zone', ?, ?, 'public_role', 'critic', 'Critic 并行推演', '#FEF3C7', ?, ?, 252, '{}', ?, 'null', 0, ?, ?)`
    ).run(
      spec.id,
      spec.title,
      spec.content,
      spec.pos.x,
      spec.pos.y,
      JSON.stringify({ parallelEvalForLink: linkId, targetArtifactId: spec.targetId }),
      now,
      now
    );
    const card = hydrateArtifact(db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(spec.id));
    created.push(card);
    emitEvent?.('artifact.upserted', { artifact: card });
  }

  appendRoomEvent(db, {
    eventType: 'artifact.created',
    actorType: 'human',
    actorId,
    actorName: 'Critic 并行推演',
    summaryText: `针对冲突连线生成了 A/B 并行利弊推演双卡`,
    payload: { linkId, cardIds: created.map((c) => c.id) },
    createdAt: now,
  });

  return created;
}

/**
 * FR-03.2: Derive Link `✨ 合成结论`
 */
export function synthesizeDeriveLink(db, { linkId, actorId = 'human', emitEvent }) {
  const linkRow = db.prepare('SELECT * FROM artifact_links WHERE id = ?').get(linkId);
  if (!linkRow) throw new Error('Link not found');
  const artA = hydrateArtifact(
    db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(linkRow.from_artifact_id)
  );
  const artB = hydrateArtifact(
    db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(linkRow.to_artifact_id)
  );
  if (!artA || !artB) throw new Error('Linked artifacts not found');

  const mergedText = `综合「${clampChars(artA.title || artA.content, 18)}」与「${clampChars(artB.title || artB.content, 18)}」：${clampChars(artA.content, 48)}，并衔接 ${clampChars(artB.content, 48)}。`;

  const now = new Date().toISOString();
  const cardId = generateId('art');
  const midX = Math.round((artA.x + artB.x) / 2);
  const midY = Math.round(Math.max(artA.y, artB.y) + 180);

  db.prepare(
    `INSERT INTO canvas_artifacts
      (id, type, zone, title, content, author_type, author_id, author_name, color, x, y, width, votes_json, metadata_json, source_ref_json, is_rejected, created_at, updated_at)
     VALUES (?, 'sticky', 'main', '✨ 互补合成结论', ?, 'public_role', 'linker', 'Linker 逻辑串联', '#DCFCE7', ?, ?, 260, '{}', ?, 'null', 0, ?, ?)`
  ).run(cardId, mergedText, midX, midY, JSON.stringify({ synthesizedFromLink: linkId }), now, now);

  const card = hydrateArtifact(db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(cardId));
  const consItem = createConsensusItem(db, {
    section: 'decision',
    content: mergedText,
    status: 'draft',
    actorType: 'public_role',
    actorId: 'linker',
    actorName: 'Linker 逻辑串联',
    sourceRefs: [
      { type: 'artifact', id: artA.id },
      { type: 'artifact', id: artB.id },
    ],
  });

  emitEvent?.('artifact.upserted', { artifact: card });
  emitEvent?.('consensus.updated', { item: consItem });

  return { artifact: card, consensusItem: consItem };
}
