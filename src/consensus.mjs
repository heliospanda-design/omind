/**
 * Omind v5 — Consensus Governance, Human Lock Protection, Causal Staleness & Redline Signoff
 * Implements PRD FR-05.2, FR-06, T10, T11, T12
 */

import {
  appendRoomEvent,
  generateId,
  hydrateConsensusItem,
  hydrateProposal,
  safeJsonParse,
} from './db-core.mjs';

export class ForbiddenSignoffError extends Error {
  constructor(message = 'Forbidden: 仅待签责任人本人可执行红线签字') {
    super(message);
    this.name = 'ForbiddenSignoffError';
    this.statusCode = 403;
  }
}

export function synthesizeDownstreamRevision(downstreamContent, oldUpstream, newUpstream) {
  let updated = String(downstreamContent || '');
  const oldLower = String(oldUpstream || '').toLowerCase();
  const newLower = String(newUpstream || '').toLowerCase();

  if (oldLower.includes('sse') && (newLower.includes('websocket') || newLower.includes('ws'))) {
    updated = updated
      .replace(/SSE\s*\+?\s*Last-Event-ID/gi, 'WebSocket 双工帧协议')
      .replace(/EventSource/gi, 'WebSocket Client')
      .replace(/Last-Event-ID/gi, 'Seq-ACK 重传')
      .replace(/SSE/gi, 'WebSocket');
  } else if (oldLower.includes('websocket') && newLower.includes('sse')) {
    updated = updated
      .replace(/WebSocket(\s*集群|\s*帧协议)?/gi, 'SSE + Last-Event-ID')
      .replace(/WS/g, 'SSE');
  }

  if (updated === downstreamContent) {
    const snippet = String(newUpstream || '').trim().slice(0, 36);
    updated = `${downstreamContent}（需对齐最新上游决策：「${snippet}」）`;
  }
  return updated;
}

export function createConsensusItem(
  db,
  {
    section = 'decision',
    content,
    ownerParticipantId = null,
    dueDate = null,
    status = 'draft',
    signoffStatus = 'none',
    lockedBy = null,
    actorType = 'public_role',
    actorId = 'host',
    actorName = 'Host 控场记录',
    dependsOnIds = [],
    sourceRefs = [],
  }
) {
  const id = generateId('cons');
  const now = new Date().toISOString();

  // Hard rule: AI can never create a pre-locked item; pending_human_signoff stays draft
  let effectiveStatus = actorType === 'human' ? status : 'draft';
  if (signoffStatus === 'pending_human_signoff') {
    effectiveStatus = 'draft';
  }
  const lockedAt = effectiveStatus === 'locked' ? now : null;
  const effectiveLockedBy = effectiveStatus === 'locked' ? lockedBy || actorName : null;

  db.prepare(
    `INSERT INTO consensus_items
      (id, section, content, owner_participant_id, due_date, status, signoff_status, locked_by, locked_at, depends_on_ids_json, source_refs_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    section,
    String(content || '').trim(),
    ownerParticipantId,
    dueDate,
    effectiveStatus,
    signoffStatus,
    effectiveLockedBy,
    lockedAt,
    JSON.stringify(dependsOnIds || []),
    JSON.stringify(sourceRefs || []),
    now,
    now
  );

  const item = hydrateConsensusItem(db.prepare('SELECT * FROM consensus_items WHERE id = ?').get(id));

  appendRoomEvent(db, {
    eventType: effectiveStatus === 'locked' ? 'consensus.locked' : 'consensus.created',
    actorType,
    actorId,
    actorName,
    summaryText:
      signoffStatus === 'pending_human_signoff'
        ? `挂起红线待本人签字项：${item.content.slice(0, 48)}`
        : `${actorName} 提炼了共识草案：${item.content.slice(0, 48)}`,
    payload: { itemId: item.id, section: item.section, status: item.status, signoffStatus: item.signoffStatus },
    createdAt: now,
  });

  return item;
}

/**
 * Hard Guardrail (PRD 0.1 #5 & FR-06 & Section 5.2 #4):
 * AI is strictly prohibited from overwriting or deleting a `locked` consensus item.
 * Any AI attempt to modify a `locked` item automatically converts into a `revision_proposals` row.
 */
export function aiReviseConsensusSafely(
  db,
  {
    targetItemId,
    proposedContent,
    reason = '基于最新讨论上下文提出修订建议',
    triggeredByItemId = null,
    actorId = 'host',
    actorName = 'Host 控场记录',
  }
) {
  const row = db.prepare('SELECT * FROM consensus_items WHERE id = ?').get(targetItemId);
  if (!row) throw new Error('Target consensus item not found');

  const trimmed = String(proposedContent || '').trim();
  if (!trimmed) {
    return { action: 'noop', item: hydrateConsensusItem(row), proposal: null };
  }

  if (row.status === 'locked') {
    const existingProp = db
      .prepare(
        `SELECT * FROM revision_proposals
         WHERE target_item_id = ? AND status = 'pending' AND proposed_content = ?`
      )
      .get(targetItemId, trimmed);
    if (existingProp) {
      return {
        action: 'proposal_created',
        item: hydrateConsensusItem(row),
        proposal: hydrateProposal(existingProp),
      };
    }

    const propId = generateId('prop');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO revision_proposals
        (id, target_item_id, original_content, proposed_content, reason, triggered_by_item_id, status, created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NULL)`
    ).run(propId, targetItemId, row.content, trimmed, reason, triggeredByItemId, now);

    const proposal = hydrateProposal(db.prepare('SELECT * FROM revision_proposals WHERE id = ?').get(propId));
    appendRoomEvent(db, {
      eventType: 'proposal.created',
      actorType: 'public_role',
      actorId,
      actorName,
      summaryText: `${actorName} 针对已锁定条目提交了修订提案（未覆写原结论）`,
      payload: { proposalId: propId, targetItemId },
      createdAt: now,
    });

    return {
      action: 'proposal_created',
      item: hydrateConsensusItem(row),
      proposal,
    };
  }

  // Draft or stale_upstream item can be refined while staying draft
  const now = new Date().toISOString();
  db.prepare('UPDATE consensus_items SET content = ?, updated_at = ? WHERE id = ?').run(trimmed, now, targetItemId);
  return {
    action: 'draft_updated',
    item: hydrateConsensusItem(db.prepare('SELECT * FROM consensus_items WHERE id = ?').get(targetItemId)),
    proposal: null,
  };
}

/**
 * Human Lock & Causal Downstream Staleness Propagation (`stale_upstream` + Diff Proposal)
 */
export function humanLockConsensusItem(
  db,
  {
    itemId,
    actorId,
    actorName = '协作者',
    content = undefined,
    ownerParticipantId = undefined,
    dueDate = undefined,
    dependsOnIds = undefined,
  }
) {
  const existing = db.prepare('SELECT * FROM consensus_items WHERE id = ?').get(itemId);
  if (!existing) throw new Error('Consensus item not found');

  // Redline pending signoff cannot be locked by someone else!
  if (
    existing.signoff_status === 'pending_human_signoff' &&
    existing.owner_participant_id &&
    existing.owner_participant_id !== actorId
  ) {
    throw new ForbiddenSignoffError('该红线承诺须由责任人本人点击签字确认，他人不可代锁');
  }

  const now = new Date().toISOString();
  const oldContent = existing.content;
  const newContent = content !== undefined && String(content).trim() ? String(content).trim() : existing.content;
  const contentChangedOnLocked = existing.status === 'locked' && newContent !== oldContent;

  const nextOwner = ownerParticipantId !== undefined ? ownerParticipantId : existing.owner_participant_id;
  const nextDue = dueDate !== undefined ? dueDate : existing.due_date;
  const nextDeps =
    dependsOnIds !== undefined ? JSON.stringify(dependsOnIds) : existing.depends_on_ids_json;
  const nextSignoff =
    existing.signoff_status === 'pending_human_signoff' && existing.owner_participant_id === actorId
      ? 'signed'
      : existing.signoff_status;

  db.prepare(
    `UPDATE consensus_items
     SET content = ?,
         owner_participant_id = ?,
         due_date = ?,
         depends_on_ids_json = ?,
         status = 'locked',
         signoff_status = ?,
         locked_by = ?,
         locked_at = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(newContent, nextOwner, nextDue, nextDeps, nextSignoff, actorName, now, now, itemId);

  const updatedItem = hydrateConsensusItem(db.prepare('SELECT * FROM consensus_items WHERE id = ?').get(itemId));

  appendRoomEvent(db, {
    eventType: 'consensus.locked',
    actorType: 'human',
    actorId,
    actorName,
    summaryText: contentChangedOnLocked
      ? `${actorName} 修订并重新锁定上游结论：${newContent.slice(0, 44)}`
      : `${actorName} 拍板锁定了结论：${newContent.slice(0, 44)}`,
    payload: { itemId, contentChangedOnLocked, status: 'locked' },
    createdAt: now,
  });

  const staleItems = [];
  const generatedProposals = [];

  // Propagate `stale_upstream` along `depends_on_ids` DAG whenever upstream content changed
  if (contentChangedOnLocked || (content !== undefined && newContent !== oldContent)) {
    const allRows = db.prepare('SELECT * FROM consensus_items').all();
    const visited = new Set([itemId]);
    const queue = [itemId];

    while (queue.length > 0) {
      const upstreamId = queue.shift();
      for (const candidate of allRows) {
        if (visited.has(candidate.id)) continue;
        const deps = safeJsonParse(candidate.depends_on_ids_json, []);
        if (Array.isArray(deps) && deps.includes(upstreamId)) {
          visited.add(candidate.id);
          queue.push(candidate.id);

          db.prepare(
            `UPDATE consensus_items
             SET status = 'stale_upstream', updated_at = ?
             WHERE id = ?`
          ).run(now, candidate.id);

          const refreshedDownstream = hydrateConsensusItem(
            db.prepare('SELECT * FROM consensus_items WHERE id = ?').get(candidate.id)
          );
          staleItems.push(refreshedDownstream);

          const proposedText = synthesizeDownstreamRevision(candidate.content, oldContent, newContent);
          const propId = generateId('prop');
          const reason = `上游依赖结论已由 ${actorName} 修改为「${newContent.slice(0, 36)}」，下游事项需同步复核`;

          db.prepare(
            `INSERT INTO revision_proposals
              (id, target_item_id, original_content, proposed_content, reason, triggered_by_item_id, status, created_at, resolved_at)
             VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NULL)`
          ).run(propId, candidate.id, candidate.content, proposedText, reason, itemId, now);

          const proposal = hydrateProposal(db.prepare('SELECT * FROM revision_proposals WHERE id = ?').get(propId));
          generatedProposals.push(proposal);

          appendRoomEvent(db, {
            eventType: 'consensus.stale',
            actorType: 'public_role',
            actorId: 'linker',
            actorName: 'Linker 逻辑串联',
            summaryText: `上游决策变更传导：下游条目「${candidate.content.slice(0, 30)}」标为待复核并生成修订提案`,
            payload: { itemId: candidate.id, triggeredByItemId: itemId, proposalId: propId },
            createdAt: now,
          });
        }
      }
    }
  }

  return { item: updatedItem, staleItems, generatedProposals };
}

/**
 * Owner-only Redline Signoff (`POST /api/rooms/:roomId/consensus/:id/signoff`, T11)
 */
export function signoffConsensusItem(
  db,
  { itemId, participantId, participantName = '本人', decision = 'signed', editedContent = undefined }
) {
  const existing = db.prepare('SELECT * FROM consensus_items WHERE id = ?').get(itemId);
  if (!existing) throw new Error('Consensus item not found');

  if (!existing.owner_participant_id || existing.owner_participant_id !== participantId) {
    throw new ForbiddenSignoffError('Forbidden: 仅 owner_participant_id 本人可执行红线签字确认');
  }

  const now = new Date().toISOString();
  const finalContent =
    editedContent !== undefined && String(editedContent).trim()
      ? String(editedContent).trim()
      : existing.content;

  if (decision === 'signed') {
    db.prepare(
      `UPDATE consensus_items
       SET content = ?,
           status = 'locked',
           signoff_status = 'signed',
           locked_by = ?,
           locked_at = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(finalContent, participantName, now, now, itemId);
  } else {
    db.prepare(
      `UPDATE consensus_items
       SET content = ?,
           status = 'draft',
           signoff_status = 'rejected',
           updated_at = ?
       WHERE id = ?`
    ).run(finalContent, now, itemId);
  }

  // Sync companion signoff_card on canvas if present
  const signoffCards = db
    .prepare("SELECT * FROM canvas_artifacts WHERE type = 'signoff_card'")
    .all();
  let updatedArtifact = null;
  for (const card of signoffCards) {
    const meta = safeJsonParse(card.metadata_json, {});
    if (meta.consensusItemId === itemId) {
      meta.signoffStatus = decision;
      meta.resolvedAt = now;
      const isRej = decision === 'rejected' ? 1 : 0;
      db.prepare(
        `UPDATE canvas_artifacts
         SET content = ?, metadata_json = ?, is_rejected = ?, updated_at = ?
         WHERE id = ?`
      ).run(finalContent, JSON.stringify(meta), isRej, now, card.id);
      updatedArtifact = db.prepare('SELECT * FROM canvas_artifacts WHERE id = ?').get(card.id);
    }
  }

  const updatedItem = hydrateConsensusItem(db.prepare('SELECT * FROM consensus_items WHERE id = ?').get(itemId));

  appendRoomEvent(db, {
    eventType: decision === 'signed' ? 'consensus.locked' : 'artifact.rejected',
    actorType: 'human',
    actorId: participantId,
    actorName: participantName,
    summaryText:
      decision === 'signed'
        ? `${participantName} 本人签字确认了红线事项：${finalContent.slice(0, 42)}`
        : `${participantName} 本人驳回了红线代签事项：${finalContent.slice(0, 42)}`,
    payload: { itemId, decision, signoffStatus: decision },
    createdAt: now,
  });

  return { item: updatedItem, updatedArtifactRow: updatedArtifact };
}

export function resolveRevisionProposal(
  db,
  { proposalId, actorId, actorName = '协作者', decision = 'accepted', editedContent = undefined }
) {
  const prop = db.prepare('SELECT * FROM revision_proposals WHERE id = ?').get(proposalId);
  if (!prop) throw new Error('Revision proposal not found');

  const now = new Date().toISOString();
  const nextStatus = decision === 'accepted' ? 'accepted' : 'rejected';

  db.prepare(
    `UPDATE revision_proposals SET status = ?, resolved_at = ? WHERE id = ?`
  ).run(nextStatus, now, proposalId);

  let updatedItem = null;
  if (nextStatus === 'accepted') {
    const finalText =
      editedContent !== undefined && String(editedContent).trim()
        ? String(editedContent).trim()
        : prop.proposed_content;

    db.prepare(
      `UPDATE consensus_items
       SET content = ?, status = 'locked', locked_by = ?, locked_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(finalText, actorName, now, now, prop.target_item_id);

    updatedItem = hydrateConsensusItem(
      db.prepare('SELECT * FROM consensus_items WHERE id = ?').get(prop.target_item_id)
    );

    appendRoomEvent(db, {
      eventType: 'consensus.locked',
      actorType: 'human',
      actorId,
      actorName,
      summaryText: `${actorName} 采纳了修订提案并重新锁定：${finalText.slice(0, 40)}`,
      payload: { proposalId, itemId: prop.target_item_id },
      createdAt: now,
    });
  } else {
    // Restore stale_upstream back to locked if human explicitly rejects upstream diff
    const target = db.prepare('SELECT * FROM consensus_items WHERE id = ?').get(prop.target_item_id);
    if (target) {
      updatedItem = hydrateConsensusItem(target);
    }
  }

  return {
    proposal: hydrateProposal(db.prepare('SELECT * FROM revision_proposals WHERE id = ?').get(proposalId)),
    item: updatedItem,
  };
}
