/**
 * Omind v5.2 — Cloudflare Workers + 1-Room-1-SQLite Durable Object + KV Share Registry
 * Strict compliance with PRD v5.2:
 *   - Every room routes to its own isolated `OmindRoomDO` via `env.OMIND_ROOM.idFromName(roomId)`
 *   - `OMIND_SHARES` KV stores lightweight `share:<shareId> -> { roomId, title, createdAt }` & recent rooms directory
 *   - Full header & token forwarding (`Authorization`, `X-Share-Token`, `?t=shareToken`)
 *   - Exposes standard Streamable HTTP MCP Server at `POST /mcp`
 *   - Supports SSE with `Last-Event-ID` replay & Durable Object `alarm()` for 30s hand-raise auto-fold
 */

import { DurableObject } from 'cloudflare:workers';
import {
  decodeRoomIdFromShareId,
  generateId,
  initRoomSchema,
  safeJsonParse,
  seedShowcaseRoom,
  seedStarterCaseRoom,
} from '../src/db-core.mjs';
import { handleMcpJsonRpcPayload, parseRoomOrShareRef } from '../src/mcp-server.mjs';
import {
  CORS_HEADERS,
  DELIVERABLE_TEMPLATES,
  ROOM_PRESETS,
  SIMULATED_PERSONAS,
} from '../src/presets.mjs';
import { RoomEngine } from '../src/room-engine.mjs';

export function createCloudflareSqliteAdapter(sqlStorage) {
  return {
    exec(sql) {
      sqlStorage.exec(sql);
    },
    prepare(sql) {
      return {
        run(...args) {
          const clean = args.map((v) => (v === undefined ? null : v));
          sqlStorage.exec(sql, ...clean);
          return { changes: 1 };
        },
        get(...args) {
          const clean = args.map((v) => (v === undefined ? null : v));
          const rows = [...sqlStorage.exec(sql, ...clean)];
          return rows[0] ?? undefined;
        },
        all(...args) {
          const clean = args.map((v) => (v === undefined ? null : v));
          return [...sqlStorage.exec(sql, ...clean)];
        },
      };
    },
    close() {},
  };
}

function createKvShareRegistry(kv) {
  return {
    async registerShare(shareId, entry) {
      if (!kv) return;
      await kv.put(`share:${shareId}`, JSON.stringify(entry));
    },
    async resolveShare(shareId) {
      if (kv) {
        const raw = await kv.get(`share:${shareId}`);
        const parsed = safeJsonParse(raw, null);
        if (parsed?.roomId) return parsed;
      }
      const decodedRoomId = decodeRoomIdFromShareId(shareId);
      if (decodedRoomId) return { shareId, roomId: decodedRoomId };
      return null;
    },
    async registerRoom(roomId, summary) {
      if (!kv) return;
      await kv.put(`room:${roomId}`, JSON.stringify(summary));
      const rawList = await kv.get('rooms:index');
      const list = safeJsonParse(rawList, []);
      const filtered = list.filter((r) => r.roomId !== roomId);
      filtered.unshift(summary);
      await kv.put('rooms:index', JSON.stringify(filtered.slice(0, 40)));
    },
    async listRooms() {
      const defaults = [
        {
          roomId: 'room_starter_v5',
          title: '🌟 新手上手案例：首屏免注册体验改版共创',
          presetId: 'brainstorm_breakthrough',
          presetName: '💡 破局脑暴局',
          status: 'active',
          createdAt: '2026-11-26T02:00:00.000Z',
          isStarter: true,
        },
        {
          roomId: 'room_showcase_v5',
          title: 'Omind v5.2 实时同步网关与 PA 授权边界拍板会',
          presetId: 'decision_review',
          presetName: '⚖️ 方案拍板局',
          status: 'active',
          createdAt: '2026-11-26T01:00:00.000Z',
          isShowcase: true,
        },
      ];
      if (!kv) return defaults;
      const rawList = await kv.get('rooms:index');
      const list = safeJsonParse(rawList, []);
      for (const d of defaults) {
        if (!list.some((r) => r.roomId === d.roomId)) {
          list.push(d);
        }
      }
      return list;
    },
  };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  const body = data === null || data === undefined ? '' : JSON.stringify(data);
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function collectForwardAuthHeaders(request) {
  const h = {};
  const auth = request.headers.get('authorization');
  const shareTok = request.headers.get('x-share-token');
  const flush = request.headers.get('x-omind-flush-triage');
  if (auth) h.authorization = auth;
  if (shareTok) h['x-share-token'] = shareTok;
  if (flush) h['x-omind-flush-triage'] = flush;
  return h;
}

export class OmindRoomDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.db = createCloudflareSqliteAdapter(ctx.storage.sql);
    this.shareRegistry = createKvShareRegistry(env.OMIND_SHARES);
    this.ctx.blockConcurrencyWhile(async () => {
      initRoomSchema(this.db);
    });

    this.engine = new RoomEngine({
      db: this.db,
      roomId: 'unassigned',
      env,
      shareRegistry: this.shareRegistry,
      waitUntil: (p) => this.ctx.waitUntil(p),
      scheduleAlarmAt: (tsMs) => this.ctx.storage.setAlarm(tsMs),
    });
  }

  ensureRoomBinding(roomId) {
    if (roomId && this.engine.roomId !== roomId) {
      this.engine.roomId = roomId;
    }
    // Note: seedShowcaseRoom & seedStarterCaseRoom also backfill v5.1/v5.2 demo tokens on existing DOs!
    if (roomId === 'room_showcase_v5') {
      seedShowcaseRoom(this.db, 'room_showcase_v5');
    } else if (roomId === 'room_starter_v5') {
      seedStarterCaseRoom(this.db, { roomId: 'room_starter_v5' });
    }
  }

  async alarm() {
    this.engine.sweepExpiredHandRaises();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const roomId =
      request.headers.get('x-omind-room-id') ||
      url.searchParams.get('roomId') ||
      'room_showcase_v5';
    const origin = request.headers.get('x-omind-origin') || `${url.protocol}//${url.host}`;
    const subPath = request.headers.get('x-omind-subpath') ?? url.pathname;

    this.ensureRoomBinding(roomId);

    // SSE Live Stream inside this Room's DO
    if (request.method === 'GET' && subPath === '/events') {
      if (!this.engine.isInitialized()) {
        return jsonResponse({ error: `Room not found: ${roomId}` }, 404);
      }

      const participantId = url.searchParams.get('participantId') || 'anonymous';
      if (participantId !== 'anonymous') {
        this.engine.touchParticipant(participantId);
      }

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      const clientObj = {
        id: generateId('sse'),
        participantId,
        send: (event, data, seq) => {
          const idPrefix = seq ? `id: ${seq}\n` : '';
          const frame = `${idPrefix}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          writer.write(encoder.encode(frame)).catch(() => {
            this.engine.sseClients.delete(clientObj);
          });
        },
        close: () => {
          try {
            writer.close();
          } catch {
            // ignore
          }
        },
      };

      this.engine.sseClients.add(clientObj);
      const pacing = this.engine.recomputePacingMode();

      writer
        .write(
          encoder.encode(
            `event: connected\ndata: ${JSON.stringify({ roomId, participantId, ...pacing })}\n\n`
          )
        )
        .catch(() => {
          this.engine.sseClients.delete(clientObj);
        });

      const lastEventId =
        request.headers.get('last-event-id') || url.searchParams.get('lastEventId');
      if (lastEventId !== null && lastEventId !== '') {
        const missed = this.engine.getEventsAfterSeq(Number(lastEventId));
        for (const m of missed) {
          clientObj.send(m.sseEvent, m.data, m.seq);
        }
      }

      request.signal?.addEventListener('abort', () => {
        this.engine.sseClients.delete(clientObj);
        this.engine.recomputePacingMode();
        try {
          writer.close();
        } catch {
          // ignore
        }
      });

      return new Response(readable, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          ...CORS_HEADERS,
        },
      });
    }

    let body = {};
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const text = await request.text();
      if (text.trim()) {
        try {
          body = JSON.parse(text);
        } catch {
          return jsonResponse({ error: 'Invalid JSON body' }, 400);
        }
      }
    }

    const headersObj = {};
    request.headers.forEach((val, key) => {
      headersObj[key.toLowerCase()] = val;
    });

    const out = await this.engine.handleRoomRequest(request.method, subPath, {
      query: Object.fromEntries(url.searchParams.entries()),
      body,
      origin,
      headers: headersObj,
    });

    return jsonResponse(out.body, out.status);
  }
}

async function callRoomDO(
  env,
  roomId,
  method,
  subPath,
  { origin, query = '', body = null, headers = {} } = {}
) {
  const id = env.OMIND_ROOM.idFromName(roomId);
  const stub = env.OMIND_ROOM.get(id);
  const doUrl = `https://omind-room.internal${subPath}${query}`;
  const reqHeaders = new Headers(headers);
  reqHeaders.set('x-omind-room-id', roomId);
  reqHeaders.set('x-omind-subpath', subPath);
  if (origin) reqHeaders.set('x-omind-origin', origin);
  if (body !== null && !reqHeaders.has('content-type')) {
    reqHeaders.set('content-type', 'application/json');
  }

  return stub.fetch(
    new Request(doUrl, {
      method,
      headers: reqHeaders,
      body: body !== null ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    })
  );
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;
    const origin = `${url.protocol}//${url.host}`;
    const shareRegistry = createKvShareRegistry(env.OMIND_SHARES);

    // 1. Health check
    if (request.method === 'GET' && pathname === '/api/health') {
      return jsonResponse({
        ok: true,
        version: '5.2.0',
        architecture: '1-room-1-sqlite-do',
        authModel: 'v5.1-bearer-claim-sharetoken',
        presets: Object.values(ROOM_PRESETS),
        templates: Object.values(DELIVERABLE_TEMPLATES),
        personas: SIMULATED_PERSONAS,
      });
    }

    // 2. Standard Streamable HTTP MCP Server (`/mcp`)
    if (pathname === '/mcp' || pathname === '/mcp/') {
      if (request.method === 'GET') {
        return jsonResponse({
          name: 'omind-v5-room-mcp',
          version: '5.2.0',
          protocolVersion: '2025-03-26',
          transport: 'streamable-http',
          endpoint: `${origin}/mcp`,
        });
      }

      if (request.method === 'POST') {
        let rpcBody;
        try {
          rpcBody = await request.json();
        } catch {
          return jsonResponse(
            { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
            400
          );
        }

        const out = await handleMcpJsonRpcPayload(rpcBody, {
          authHeader: request.headers.get('authorization') || '',
          resolveRoomExecutor: async ({ parsedRef, toolName, toolArgs, providedToken }) => {
            let roomId = parsedRef.roomId;
            if (!roomId && parsedRef.shareId) {
              const entry = await shareRegistry.resolveShare(parsedRef.shareId);
              roomId = entry?.roomId || null;
            }
            if (!roomId) {
              throw new Error('Cannot resolve target roomId from roomUrl / roomOrShareUrl');
            }
            const doRes = await callRoomDO(env, roomId, 'POST', '/mcp-exec', {
              origin,
              body: { toolName, toolArgs, providedToken },
            });
            const data = await doRes.json();
            if (!doRes.ok) {
              const err = new Error(data?.error || 'MCP execution failed');
              err.code = doRes.status === 401 || doRes.status === 403 ? -32001 : -32000;
              throw err;
            }
            return data;
          },
        });

        return jsonResponse(out.body, out.status);
      }
    }

    // 3. Room Registry & Creation (`GET /api/rooms`, `POST /api/rooms`)
    if (pathname === '/api/rooms') {
      if (request.method === 'GET') {
        const rooms = await shareRegistry.listRooms();
        return jsonResponse({
          rooms,
          presets: Object.values(ROOM_PRESETS),
          templates: Object.values(DELIVERABLE_TEMPLATES),
          personas: SIMULATED_PERSONAS,
        });
      }

      if (request.method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: 'Invalid JSON body' }, 400);
        }
        const roomId = body.roomId || generateId('room');
        const doRes = await callRoomDO(env, roomId, 'POST', '/init', { origin, body });
        const created = await doRes.json();
        if (doRes.ok && created?.roomMeta) {
          await shareRegistry.registerRoom(roomId, {
            roomId,
            title: created.roomMeta.title,
            presetId: created.roomMeta.presetId,
            presetName: created.roomMeta.presetName,
            status: created.roomMeta.status,
            createdAt: created.roomMeta.createdAt,
          });
        }
        return jsonResponse(created, doRes.status);
      }
    }

    // 4. Share Read & 30s Replay (`GET /api/shares/:shareId`, `GET /api/shares/:shareId/replay`)
    const shareReplayMatch = pathname.match(/^\/api\/shares\/([^/]+)\/replay$/);
    if (request.method === 'GET' && shareReplayMatch) {
      const shareId = decodeURIComponent(shareReplayMatch[1]);
      const resolved = await shareRegistry.resolveShare(shareId);
      if (!resolved?.roomId) {
        return jsonResponse({ error: 'Share ID not found' }, 404);
      }
      return callRoomDO(
        env,
        resolved.roomId,
        'GET',
        `/share-replay/${encodeURIComponent(shareId)}`,
        {
          origin,
          query: url.search,
          headers: collectForwardAuthHeaders(request),
        }
      );
    }

    const shareGetMatch = pathname.match(/^\/api\/shares\/([^/]+)$/);
    if (request.method === 'GET' && shareGetMatch) {
      const shareId = decodeURIComponent(shareGetMatch[1]);
      const resolved = await shareRegistry.resolveShare(shareId);
      if (!resolved?.roomId) {
        return jsonResponse({ error: 'Share ID not found' }, 404);
      }
      return callRoomDO(
        env,
        resolved.roomId,
        'GET',
        `/share-bundle/${encodeURIComponent(shareId)}`,
        {
          origin,
          query: url.search,
          headers: collectForwardAuthHeaders(request),
        }
      );
    }

    // 5. Room-Scoped Routes & SSE (`/api/rooms/:roomId...`)
    const roomRouteMatch = pathname.match(/^\/api\/rooms\/([^/]+)(\/.*)?$/);
    if (roomRouteMatch) {
      const roomId = decodeURIComponent(roomRouteMatch[1]);
      const subPath = roomRouteMatch[2] || '';

      if (request.method === 'GET' && subPath === '/events') {
        const id = env.OMIND_ROOM.idFromName(roomId);
        const stub = env.OMIND_ROOM.get(id);
        const sseHeaders = new Headers(request.headers);
        sseHeaders.set('x-omind-room-id', roomId);
        sseHeaders.set('x-omind-subpath', '/events');
        sseHeaders.set('x-omind-origin', origin);
        return stub.fetch(
          new Request(`https://omind-room.internal/events${url.search}`, {
            method: 'GET',
            headers: sseHeaders,
            signal: request.signal,
          })
        );
      }

      // Cross-room share import coordinator (`POST /api/rooms/:roomId/artifacts/import-share`)
      if (request.method === 'POST' && subPath === '/artifacts/import-share') {
        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: 'Invalid JSON body' }, 400);
        }
        const parsed = parseRoomOrShareRef(body.shareUrl || body.shareId || '');
        const targetShareId = body.shareId || parsed.shareId;
        const targetShareToken =
          body.shareToken || parsed.shareToken || parsed.token || url.searchParams.get('t') || '';
        const resolved = await shareRegistry.resolveShare(targetShareId);
        if (!resolved?.roomId) {
          return jsonResponse({ error: `Cannot resolve shareId: ${targetShareId}` }, 404);
        }
        const srcQuery = targetShareToken ? `?t=${encodeURIComponent(targetShareToken)}` : '';
        const srcRes = await callRoomDO(
          env,
          resolved.roomId,
          'GET',
          `/share-bundle/${encodeURIComponent(targetShareId)}`,
          {
            origin,
            query: srcQuery,
            headers: collectForwardAuthHeaders(request),
          }
        );
        if (!srcRes.ok) {
          const errPayload = await srcRes.json().catch(() => ({ error: 'Share access denied' }));
          return jsonResponse(errPayload, srcRes.status);
        }
        const shareBundle = await srcRes.json();
        return callRoomDO(env, roomId, 'POST', '/artifacts/import-share', {
          origin,
          headers: collectForwardAuthHeaders(request),
          body: {
            ...body,
            shareId: targetShareId,
            shareToken: targetShareToken,
            shareBundle,
          },
        });
      }

      const rawBody =
        request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : null;

      const doRes = await callRoomDO(env, roomId, request.method, subPath, {
        origin,
        query: url.search,
        body: rawBody,
        headers: collectForwardAuthHeaders(request),
      });

      if (request.method === 'POST' && subPath === '/finalize' && doRes.status === 201) {
        const cloned = await doRes.clone().json().catch(() => null);
        if (cloned?.snapshot) {
          await shareRegistry.registerRoom(roomId, {
            roomId,
            title: cloned.snapshot.title,
            presetId: 'decision_review',
            status: 'finalized',
            createdAt: cloned.snapshot.createdAt,
          });
        }
      }

      return doRes;
    }

    // 6. Static Assets Fallback (SPA)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Omind v5.2 Edge Worker Running', { status: 200 });
  },
};
