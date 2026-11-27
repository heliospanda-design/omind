/**
 * Omind v5 — Granola-Style "Human-Skeleton-First" Deliverable Compiler
 * Implements PRD FR-07 & T13:
 *   1. Tier-1 Hard Skeleton (100% preserved): `locked` consensus items + vote-winning cards + human >=2 voted cards
 *   2. Tier-2 Grounded Flesh: PA verified facts, support links, action items, pending signoffs, [#E<seq>] citations
 *   3. Mandatory Appendix (`## 附：已排除方案与核心争论边界`): rejected cards (`is_rejected = 1`), conflict losers, rejected proposals
 */

import {
  hydrateArtifact,
  hydrateConsensusItem,
  hydrateEventLog,
  hydrateLink,
  hydratePaBrief,
  hydrateParticipant,
  hydrateProposal,
  hydrateRoomMeta,
} from './db-core.mjs';
import { DELIVERABLE_TEMPLATES } from './presets.mjs';

function formatCitationRefs(sourceRefs = [], fallbackSeq = null) {
  const tags = [];
  if (Array.isArray(sourceRefs)) {
    for (const ref of sourceRefs) {
      if (ref?.seq) tags.push(`[#E${ref.seq}]`);
      else if (ref?.id) tags.push(`[#${ref.id}]`);
    }
  }
  if (tags.length === 0 && fallbackSeq) {
    tags.push(`[#E${fallbackSeq}]`);
  }
  return tags.length > 0 ? ` ${tags.join(' ')}` : '';
}

export function extractDeliverableStructure(db) {
  const meta = hydrateRoomMeta(db.prepare('SELECT * FROM room_meta LIMIT 1').get());
  const participants = db.prepare('SELECT * FROM participants ORDER BY joined_at ASC').all().map(hydrateParticipant);
  const participantMap = new Map(participants.map((p) => [p.id, p]));

  const consensusItems = db.prepare('SELECT * FROM consensus_items ORDER BY created_at ASC').all().map(hydrateConsensusItem);
  const artifacts = db.prepare('SELECT * FROM canvas_artifacts ORDER BY created_at ASC').all().map(hydrateArtifact);
  const artifactMap = new Map(artifacts.map((a) => [a.id, a]));
  const links = db.prepare('SELECT * FROM artifact_links ORDER BY created_at ASC').all().map(hydrateLink);
  const paBriefs = db.prepare('SELECT * FROM pa_briefs ORDER BY submitted_at ASC').all().map(hydratePaBrief);
  const proposals = db.prepare('SELECT * FROM revision_proposals ORDER BY created_at ASC').all().map(hydrateProposal);
  const events = db.prepare('SELECT * FROM room_event_log ORDER BY seq ASC').all().map(hydrateEventLog);

  const endSeq = events.length > 0 ? events[events.length - 1].seq : 0;

  // Identify conflict winners & losers from vote_a / vote_b
  const winningArtifactIds = new Set();
  const losingConflictRecords = [];
  for (const lk of links) {
    if (lk.kind === 'conflict') {
      const aVotes = lk.voteAUsers.length;
      const bVotes = lk.voteBUsers.length;
      const artA = artifactMap.get(lk.fromArtifactId);
      const artB = artifactMap.get(lk.toArtifactId);
      if (aVotes > bVotes && artA) {
        winningArtifactIds.add(artA.id);
        if (artB) {
          losingConflictRecords.push({
            title: artB.title || artB.content.slice(0, 28),
            content: artB.content,
            reason: `在「${lk.reason || '观点碰撞'}」投票中未胜出 (${bVotes}:${aVotes})`,
          });
        }
      } else if (bVotes > aVotes && artB) {
        winningArtifactIds.add(artB.id);
        if (artA) {
          losingConflictRecords.push({
            title: artA.title || artA.content.slice(0, 28),
            content: artA.content,
            reason: `在「${lk.reason || '观点碰撞'}」投票中未胜出 (${aVotes}:${bVotes})`,
          });
        }
      }
    }
  }

  // Tier 1: Locked Consensus + High-Vote / Pinned / Vote-Winning Cards
  const lockedDecisions = consensusItems.filter(
    (c) => c.status === 'locked' && (c.section === 'decision' || c.section === 'context')
  );
  const draftDecisions = consensusItems.filter(
    (c) => c.status !== 'locked' && c.section === 'decision' && c.signoffStatus !== 'rejected'
  );
  const contextItems = consensusItems.filter((c) => c.section === 'context');
  const openQuestions = consensusItems.filter(
    (c) => c.section === 'open_question' || c.status === 'stale_upstream'
  );

  const actionItems = consensusItems
    .filter((c) => c.section === 'action_item' && c.signoffStatus !== 'rejected')
    .map((c) => {
      const owner = c.ownerParticipantId ? participantMap.get(c.ownerParticipantId) : null;
      return {
        ...c,
        ownerName: owner?.name || '待认领',
      };
    });

  const pendingSignoffs = consensusItems
    .filter((c) => c.signoffStatus === 'pending_human_signoff')
    .map((c) => {
      const owner = c.ownerParticipantId ? participantMap.get(c.ownerParticipantId) : null;
      return {
        id: c.id,
        content: c.content,
        ownerParticipantId: c.ownerParticipantId,
        ownerName: owner?.name || '待本人确认',
        dueDate: c.dueDate,
      };
    });

  const highSignalArtifacts = artifacts.filter(
    (a) =>
      !a.isRejected &&
      (a.totalVotes >= 2 || winningArtifactIds.has(a.id) || Boolean(a.metadata?.pinned))
  );

  const sparkHighlights = artifacts.filter((a) => !a.isRejected && a.zone === 'spark_zone');

  // Tier 2: PA Grounded Facts
  const paReferences = paBriefs.map((b) => {
    const p = participantMap.get(b.participantId);
    return {
      participantId: b.participantId,
      participantName: p?.name || b.participantId,
      sourceClient: b.sourceClient,
      mode: b.mode,
      summaryMarkdown: b.summaryMarkdown,
      facts: b.facts,
      referenceCount: b.referenceCount,
    };
  });

  // Mandatory Appendix: Excluded Branches & Core Contention Boundaries
  const excludedBranches = [];
  const seenExcluded = new Set();

  for (const a of artifacts) {
    if (a.isRejected) {
      const key = a.id;
      seenExcluded.add(key);
      excludedBranches.push({
        id: a.id,
        title: a.title || a.content.slice(0, 32),
        content: a.content,
        authorName: a.authorName,
        reason: a.metadata?.rejectReason || '会中明确标记为已排除分支（is_rejected = 1）',
      });
    }
  }

  for (const loser of losingConflictRecords) {
    const sig = `${loser.title}::${loser.content}`;
    if (!seenExcluded.has(sig) && !excludedBranches.some((e) => e.content === loser.content)) {
      seenExcluded.add(sig);
      excludedBranches.push({
        id: null,
        title: loser.title,
        content: loser.content,
        authorName: '碰撞对比项',
        reason: loser.reason,
      });
    }
  }

  for (const c of consensusItems.filter((item) => item.signoffStatus === 'rejected')) {
    const owner = c.ownerParticipantId ? participantMap.get(c.ownerParticipantId) : null;
    excludedBranches.push({
      id: c.id,
      title: '红线待签已驳回项',
      content: c.content,
      authorName: owner?.name || '本人驳回',
      reason: '触及个人授权红线并经本人明确驳回',
    });
  }

  for (const p of proposals.filter((pr) => pr.status === 'rejected')) {
    excludedBranches.push({
      id: p.id,
      title: '未采纳修订提案',
      content: p.proposedContent,
      authorName: 'AI 修订提案',
      reason: `人类保留原锁定结论，未采纳该改动（原由：${p.reason}）`,
    });
  }

  return {
    meta,
    participants,
    endSeq,
    skeletonDecisions: lockedDecisions,
    draftDecisions,
    contextItems,
    openQuestions,
    actionItems,
    pendingSignoffs,
    highSignalArtifacts,
    sparkHighlights,
    paReferences,
    excludedBranches,
    allArtifacts: artifacts,
    allLinks: links,
  };
}

function buildLocalMarkdown(templateId, structure, customOutline = '') {
  const {
    meta,
    participants,
    endSeq,
    skeletonDecisions,
    draftDecisions,
    contextItems,
    openQuestions,
    actionItems,
    pendingSignoffs,
    highSignalArtifacts,
    sparkHighlights,
    paReferences,
    excludedBranches,
    allArtifacts,
  } = structure;

  const tpl = DELIVERABLE_TEMPLATES[templateId] || DELIVERABLE_TEMPLATES.prd_or_decision_memo;
  const memberLine = participants.map((p) => `${p.name}（${p.roleTitle}）`).join('、') || '匿名协作者';
  const lines = [];

  lines.push(`# ${meta.title} — ${tpl.name.replace(/^[^\s]+\s*/, '')}`);
  lines.push('');
  lines.push(
    `> **预设局类型**：${meta.presetName} ｜ **参会座席**：${memberLine} ｜ **封存事件帧**：\`#E1 ~ #E${endSeq}\``
  );
  lines.push('');

  const renderSkeletonBlock = (heading) => {
    lines.push(`## ${heading}`);
    if (skeletonDecisions.length === 0 && highSignalArtifacts.length === 0 && draftDecisions.length === 0) {
      const fallbackCards = allArtifacts.filter((a) => !a.isRejected).slice(0, 4);
      if (fallbackCards.length === 0) {
        lines.push('- 暂无已锁定结论（当前房间尚未录入拍板条目）。');
      } else {
        for (const a of fallbackCards) {
          lines.push(`- **[桌面要点 · 草案]** ${a.title ? `**${a.title}**：` : ''}${a.content}`);
        }
      }
    } else {
      for (const item of skeletonDecisions) {
        lines.push(
          `- 🔒 **[人类已拍板 · ${item.lockedBy || '全员确认'}]** ${item.content}${formatCitationRefs(item.sourceRefs, endSeq)}`
        );
      }
      for (const card of highSignalArtifacts) {
        const alreadyCovered = skeletonDecisions.some((d) => d.content.includes(card.title || card.content.slice(0, 14)));
        if (!alreadyCovered) {
          lines.push(
            `- ⭐ **[高票共识卡 · ${card.totalVotes} 票]** ${card.title ? `**${card.title}**：` : ''}${card.content}（提出：${card.authorName}）`
          );
        }
      }
      for (const d of draftDecisions) {
        lines.push(`- 📝 *[AI 提炼草案 · 待最终拍板]* ${d.content}`);
      }
    }
    lines.push('');
  };

  const renderPaAndContextBlock = (heading) => {
    lines.push(`## ${heading}`);
    if (meta.topicSummary) {
      lines.push(`- **会议核心议题**：${meta.topicSummary}`);
    }
    for (const ctx of contextItems) {
      lines.push(
        `- ${ctx.status === 'locked' ? '🔒' : '📌'} ${ctx.content}${formatCitationRefs(ctx.sourceRefs)}`
      );
    }
    for (const pa of paReferences) {
      lines.push(
        `- **${pa.participantName} 的 PA 上下文简报**（来源 \`${pa.sourceClient}\` · 模式 \`${pa.mode}\`）：${pa.summaryMarkdown}`
      );
      for (const fact of pa.facts.slice(0, 4)) {
        lines.push(`  - 核实事实：${fact}`);
      }
    }
    if (!meta.topicSummary && contextItems.length === 0 && paReferences.length === 0) {
      lines.push('- 本场直接围绕桌面卡片展开快速对齐。');
    }
    lines.push('');
  };

  const renderActionTable = (heading) => {
    lines.push(`## ${heading}`);
    if (actionItems.length === 0 && pendingSignoffs.length === 0) {
      lines.push('- 暂无明确拆解的个人待办事项。');
    } else {
      lines.push('| 状态 | 事项内容 | 责任人 | 截止时间 / 签字状态 | 上游依赖 |');
      lines.push('| :--- | :--- | :--- | :--- | :--- |');
      for (const act of actionItems) {
        const badge =
          act.signoffStatus === 'pending_human_signoff'
            ? '⏳ 待本人签字'
            : act.status === 'locked'
              ? '🔒 已锁定'
              : act.status === 'stale_upstream'
                ? '⚠️ 上游变更待复核'
                : '📝 草案';
        const depText = act.dependsOnIds.length > 0 ? act.dependsOnIds.join(', ') : '—';
        lines.push(
          `| ${badge} | ${act.content.replace(/\|/g, '｜')} | @${act.ownerName} | ${act.dueDate || '待定'} | ${depText} |`
        );
      }
      for (const ps of pendingSignoffs) {
        if (!actionItems.some((a) => a.id === ps.id)) {
          lines.push(
            `| ⏳ 红线待签 | ${ps.content.replace(/\|/g, '｜')} | @${ps.ownerName} | 需本人确认生效 | — |`
          );
        }
      }
    }
    lines.push('');
  };

  const renderOpenQuestions = (heading) => {
    lines.push(`## ${heading}`);
    if (openQuestions.length === 0 && pendingSignoffs.length === 0) {
      lines.push('- 当前核心分歧均已收敛拍板。');
    } else {
      for (const q of openQuestions) {
        const prefix = q.status === 'stale_upstream' ? '⚠️ **[上游决策变更引发重审]** ' : '❓ ';
        lines.push(`- ${prefix}${q.content}`);
      }
      for (const s of pendingSignoffs) {
        lines.push(`- 🛑 **[PA 红线挂起 · 待 @${s.ownerName} 本人签字]** ${s.content}`);
      }
    }
    lines.push('');
  };

  if (templateId === 'creative_brief') {
    renderPaAndContextBlock('1. 核心背景与痛点洞察');
    renderSkeletonBlock('2. 入选破局方向（人类锁定骨架）');
    lines.push('## 3. 边缘灵感池与跳脱火花');
    if (sparkHighlights.length === 0) {
      lines.push('- 本场灵感均已合并至主桌面方案区。');
    } else {
      for (const sp of sparkHighlights) {
        lines.push(`- 💡 **${sp.title || sp.authorName}**：${sp.content}`);
      }
    }
    lines.push('');
    renderActionTable('4. 下一步最小验证实验（MVP Actions）');
  } else if (templateId === 'task_schedule') {
    renderSkeletonBlock('1. 已锁定里程碑与技术前提');
    renderActionTable('2. 任务排期、责任人与上下游依赖表');
    renderOpenQuestions('3. 排期风险与待本人签字红线');
    renderPaAndContextBlock('4. 成员 PA 排期容量与客观约束');
  } else if (templateId === 'client_minutes') {
    renderPaAndContextBlock('1. 共创背景与参会双方');
    renderSkeletonBlock('2. 已达成共识边界（拍板锁定）');
    renderActionTable('3. 双方交付分工与时间节点');
    renderOpenQuestions('4. 待客户/负责人二次确认事项');
  } else if (templateId === 'custom_outline' && String(customOutline || '').trim()) {
    const sections = String(customOutline)
      .split('\n')
      .map((s) => s.replace(/^#+\s*/, '').trim())
      .filter(Boolean);
    sections.forEach((secTitle, idx) => {
      if (idx === 0) renderSkeletonBlock(`1. ${secTitle}（核心锁定结论）`);
      else if (idx === 1) renderPaAndContextBlock(`2. ${secTitle}`);
      else if (idx === 2) renderActionTable(`3. ${secTitle}`);
      else {
        lines.push(`## ${idx + 1}. ${secTitle}`);
        for (const a of allArtifacts.filter((x) => !x.isRejected).slice(0, 3)) {
          lines.push(`- ${a.title ? `**${a.title}**：` : ''}${a.content}`);
        }
        lines.push('');
      }
    });
  } else {
    // Default: prd_or_decision_memo
    renderPaAndContextBlock('1. 背景目标与已核实上下文');
    renderSkeletonBlock('2. 已拍板核心决策与高票骨架');
    renderOpenQuestions('3. 待决分歧与 PA 红线待签项');
    renderActionTable('4. 行动项清单与依赖链路');
  }

  // Mandatory Appendix required by PRD FR-07.2 & T13!
  lines.push('## 附：已排除方案与核心争论边界');
  if (excludedBranches.length === 0) {
    lines.push(
      '- 本场讨论未产生被标记否决的分支卡片；下游 Agent 执行时请严格以第 2 节「人类已拍板结论」为准，勿自行扩写未授权特性。'
    );
  } else {
    lines.push(
      '> 以下方案在会中经过明确对比或红线校验后已被排除，下游编码/执行 Agent **严禁重新引入或重复踩坑**：'
    );
    lines.push('');
    for (const ex of excludedBranches) {
      lines.push(`- ❌ **已排除：${ex.title}** — ${ex.content}（排除原因：*${ex.reason}*）`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

export async function compileDeliverable(
  db,
  { templateId = null, customOutline = '', env = {} } = {}
) {
  const structure = extractDeliverableStructure(db);
  const chosenTemplateId =
    templateId && DELIVERABLE_TEMPLATES[templateId]
      ? templateId
      : structure.meta?.defaultTemplateId || 'prd_or_decision_memo';

  let compiledMarkdown = buildLocalMarkdown(chosenTemplateId, structure, customOutline);

  // Optional Tier-2 Reasoning Model Polish (if LLM_API_KEY configured), while preserving skeleton & appendix invariants
  const apiKey = env?.LLM_API_KEY || process.env.LLM_API_KEY;
  const baseUrl = (env?.LLM_BASE_URL || process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = env?.LLM_REASONING_MODEL || process.env.LLM_REASONING_MODEL || 'gpt-4o-mini';

  if (apiKey) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content:
                '你是 Omind 成品文档编译器。严格遵守「人类骨架优先」铁律：必须 100% 保留输入草稿中所有 🔒 人类已拍板结论原文与数据，并在文末完整保留 `## 附：已排除方案与核心争论边界` 章节及全部 ❌ 已排除条目。只做行文润色与逻辑衔接。',
            },
            {
              role: 'user',
              content: `模板类型：${chosenTemplateId}\n${customOutline ? `自定义大纲：\n${customOutline}\n` : ''}\n结构化初稿：\n${compiledMarkdown}`,
            },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const candidate = data?.choices?.[0]?.message?.content?.trim();
        if (candidate && candidate.includes('已排除方案与核心争论边界')) {
          compiledMarkdown = candidate;
        }
      }
    } catch {
      // Deterministic local_fallback already built `compiledMarkdown`
    }
  }

  const structuredJson = {
    skeletonDecisions: structure.skeletonDecisions.map((d) => ({
      id: d.id,
      section: d.section,
      content: d.content,
      lockedBy: d.lockedBy,
      lockedAt: d.lockedAt,
    })),
    openQuestions: structure.openQuestions.map((q) => ({
      id: q.id,
      content: q.content,
      status: q.status,
    })),
    actionItems: structure.actionItems.map((a) => ({
      id: a.id,
      content: a.content,
      ownerParticipantId: a.ownerParticipantId,
      ownerName: a.ownerName,
      dueDate: a.dueDate,
      status: a.status,
      signoffStatus: a.signoffStatus,
      dependsOnIds: a.dependsOnIds,
    })),
    pendingSignoffs: structure.pendingSignoffs,
    excludedBranches: structure.excludedBranches,
    paReferences: structure.paReferences,
  };

  return {
    templateId: chosenTemplateId,
    title: structure.meta?.title || 'Omind 定稿成品',
    compiledMarkdown,
    structuredJson,
    rawEventEndSeq: structure.endSeq,
  };
}
