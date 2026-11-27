/**
 * Omind v5.2 — Frontend REST, Bearer Token Auth, SSE (`Last-Event-ID`) & Streamable HTTP MCP Client
 */

import { loadRoomParticipantToken, loadShareToken, state } from './state.js';

function resolveRoomBearerHeader(path) {
  const m = String(path || '').match(/^\/api\/rooms\/([^/?]+)/);
  if (!m) return {};
  const rid = decodeURIComponent(m[1]);
  const pid = state.roomId === rid ? state.currentParticipantId : null;
  const tok =
    (state.roomId === rid ? state.currentParticipantToken : null) ||
    loadRoomParticipantToken(rid, pid) ||
    state.demoSeatTokens?.[pid] ||
    null;
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

async function request(method, path, body = undefined, extraHeaders = {}) {
  const autoAuth = resolveRoomBearerHeader(path);
  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...autoAuth,
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(data?.error || data?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  listRooms: () => request('GET', '/api/rooms'),
  createRoom: (payload) => request('POST', '/api/rooms', payload),
  getRoom: (roomId, participantId = '') =>
    request(
      'GET',
      `/api/rooms/${encodeURIComponent(roomId)}${participantId ? `?participantId=${encodeURIComponent(participantId)}` : ''}`
    ),
  joinRoom: (roomId, payload, useFreshIdentity = true) =>
    request(
      'POST',
      `/api/rooms/${encodeURIComponent(roomId)}/join`,
      payload,
      useFreshIdentity ? { Authorization: '' } : {}
    ),
  resetStarterRoom: (roomId, payload = {}) =>
    request('POST', `/api/rooms/${encodeURIComponent(roomId)}/reset-starter`, payload),

  patchRole: (roomId, roleKey, payload) =>
    request(
      'PATCH',
      `/api/rooms/${encodeURIComponent(roomId)}/roles/${encodeURIComponent(roleKey)}`,
      payload
    ),
  addCustomRole: (roomId, payload) =>
    request('POST', `/api/rooms/${encodeURIComponent(roomId)}/roles`, payload),

  postMessage: (roomId, payload) =>
    request('POST', `/api/rooms/${encodeURIComponent(roomId)}/messages`, payload),
  promoteMessage: (roomId, messageId, payload) =>
    request(
      'POST',
      `/api/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}/promote`,
      payload
    ),

  createArtifact: (roomId, payload) =>
    request('POST', `/api/rooms/${encodeURIComponent(roomId)}/artifacts`, payload),
  importShareCard: (roomId, payload) =>
    request('POST', `/api/rooms/${encodeURIComponent(roomId)}/artifacts/import-share`, payload),
  patchArtifact: (roomId, artifactId, payload) =>
    request(
      'PATCH',
      `/api/rooms/${encodeURIComponent(roomId)}/artifacts/${encodeURIComponent(artifactId)}`,
      payload
    ),
  deleteArtifact: (roomId, artifactId, actorId) =>
    request(
      'DELETE',
      `/api/rooms/${encodeURIComponent(roomId)}/artifacts/${encodeURIComponent(artifactId)}`,
      { actorId }
    ),
  summonAgentOnArtifact: (roomId, artifactId, payload) =>
    request(
      'POST',
      `/api/rooms/${encodeURIComponent(roomId)}/artifacts/${encodeURIComponent(artifactId)}/summon-agent`,
      payload
    ),

  createLink: (roomId, payload) =>
    request('POST', `/api/rooms/${encodeURIComponent(roomId)}/links`, payload),
  patchLink: (roomId, linkId, payload) =>
    request(
      'PATCH',
      `/api/rooms/${encodeURIComponent(roomId)}/links/${encodeURIComponent(linkId)}`,
      payload
    ),
  deleteLink: (roomId, linkId, actorId) =>
    request(
      'DELETE',
      `/api/rooms/${encodeURIComponent(roomId)}/links/${encodeURIComponent(linkId)}`,
      { actorId }
    ),
  voteLink: (roomId, linkId, payload) =>
    request(
      'POST',
      `/api/rooms/${encodeURIComponent(roomId)}/links/${encodeURIComponent(linkId)}/vote`,
      payload
    ),
  parallelEvalLink: (roomId, linkId, actorId) =>
    request(
      'POST',
      `/api/rooms/${encodeURIComponent(roomId)}/links/${encodeURIComponent(linkId)}/parallel-eval`,
      { actorId }
    ),
  synthesizeLink: (roomId, linkId, actorId) =>
    request(
      'POST',
      `/api/rooms/${encodeURIComponent(roomId)}/links/${encodeURIComponent(linkId)}/synthesize`,
      { actorId }
    ),

  expandHandRaise: (roomId, handRaiseId, actorId) =>
    request(
      'POST',
      `/api/rooms/${encodeURIComponent(roomId)}/hand-raises/${encodeURIComponent(handRaiseId)}/expand`,
      { actorId }
    ),
  dismissHandRaise: (roomId, handRaiseId, actorId) =>
    request(
      'POST',
      `/api/rooms/${encodeURIComponent(roomId)}/hand-raises/${encodeURIComponent(handRaiseId)}/dismiss`,
      { actorId }
    ),

  claimPaBrief: (roomId, claimCode) =>
    request('POST', `/api/rooms/${encodeURIComponent(roomId)}/pa-briefs/claim`, { claimCode }),

  patchPaBrief: (roomId, participantId, payload) =>
    request(
      'PATCH',
      `/api/rooms/${encodeURIComponent(roomId)}/pa-briefs/${encodeURIComponent(participantId)}`,
      payload
    ),

  addConsensus: (roomId, payload) =>
    request('POST', `/api/rooms/${encodeURIComponent(roomId)}/consensus`, payload),
  lockConsensus: (roomId, itemId, payload) =>
    request(
      'POST',
      `/api/rooms/${encodeURIComponent(roomId)}/consensus/${encodeURIComponent(itemId)}/lock`,
      payload
    ),
  signoffConsensus: (roomId, itemId, payload) =>
    request(
      'POST',
      `/api/rooms/${encodeURIComponent(roomId)}/consensus/${encodeURIComponent(itemId)}/signoff`,
      payload
    ),
  resolveProposal: (roomId, proposalId, payload) =>
    request(
      'POST',
      `/api/rooms/${encodeURIComponent(roomId)}/proposals/${encodeURIComponent(proposalId)}/resolve`,
      payload
    ),

  finalizeRoom: (roomId, payload) =>
    request('POST', `/api/rooms/${encodeURIComponent(roomId)}/finalize`, payload),

  getShare: (shareId, shareToken = '') => {
    const tok = shareToken || state.activeShareToken || loadShareToken(shareId) || '';
    const qs = tok ? `?t=${encodeURIComponent(tok)}` : '';
    return request('GET', `/api/shares/${encodeURIComponent(shareId)}${qs}`);
  },

  getShareReplay: (shareId, shareToken = '') => {
    const tok = shareToken || state.activeShareToken || loadShareToken(shareId) || '';
    const qs = tok ? `?t=${encodeURIComponent(tok)}` : '';
    return request('GET', `/api/shares/${encodeURIComponent(shareId)}/replay${qs}`);
  },

  callMcpTool: (toolName, args, bearerToken = '') =>
    request(
      'POST',
      '/mcp',
      {
        jsonrpc: '2.0',
        id: `web_${Date.now()}`,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
      },
      bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}
    ),
};

export function connectRoomSse(roomId, participantId, lastEventId, handlers = {}) {
  const qs = new URLSearchParams();
  if (participantId) qs.set('participantId', participantId);
  if (lastEventId) qs.set('lastEventId', String(lastEventId));

  const es = new EventSource(`/api/rooms/${encodeURIComponent(roomId)}/events?${qs.toString()}`);

  const eventNames = [
    'connected',
    'room.pacing_changed',
    'participant.updated',
    'role.updated',
    'message.created',
    'artifact.upserted',
    'artifact.deleted',
    'link.upserted',
    'link.deleted',
    'agent.cursor_flash',
    'agent.hand_raised',
    'agent.hand_updated',
    'pa.brief_updated',
    'pa.referenced',
    'consensus.updated',
    'proposal.created',
    'proposal.updated',
    'room.finalized',
    'room.reset',
    'peer.cursor',
  ];

  for (const name of eventNames) {
    es.addEventListener(name, (ev) => {
      let parsed = {};
      try {
        parsed = JSON.parse(ev.data || '{}');
      } catch {
        parsed = {};
      }
      if (ev.lastEventId) {
        handlers.onSeq?.(Number(ev.lastEventId));
      } else if (parsed.seq) {
        handlers.onSeq?.(Number(parsed.seq));
      }
      handlers.onEvent?.(name, parsed);
    });
  }

  return es;
}
