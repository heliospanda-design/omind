/**
 * Omind v5.2 — Multi-Room Gateway Router & Node 1-Room-1-DB Manager
 * Handles:
 *   - `GET /api/rooms` & `POST /api/rooms`
 *   - `/api/rooms/:roomId/*` & SSE `GET /api/rooms/:roomId/events` (with `Last-Event-ID`)
 *   - `GET /api/shares/:shareId` & `GET /api/shares/:shareId/replay` (with `shareToken` validation)
 *   - `POST /mcp` (Streamable HTTP MCP Server JSON-RPC 2.0)
 *   - Static assets serving from `./public` for local Node mode
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeRoomIdFromShareId,
  generateId,
  seedShowcaseRoom,
  seedStarterCaseRoom,
} from './db-core.mjs';
import { createNodeRoomSqlite } from './db.mjs';
import { handleMcpJsonRpcPayload, parseRoomOrShareRef } from './mcp-server.mjs';
import {
  CORS_HEADERS,
  DELIVERABLE_TEMPLATES,
  ROOM_PRESETS,
  SIMULATED_PERSONAS,
} from './presets.mjs';
import { RoomEngine } from './room-engine.mjs';

export { CORS_HEADERS };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

export function createMemoryOrFileShareRegistry(persistFilePath = null) {
  const shares = new Map();
  const rooms = new Map();

  if (persistFilePath && fs.existsSync(persistFilePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(persistFilePath, 'utf8'));
      for (const [k, v] of Object.entries(raw.shares || {})) shares.set(k, v);
      for (const [k, v] of Object.entries(raw.rooms || {})) rooms.set(k, v);
    } catch {
      // ignore corrupt local cache
    }
  }

  const flushToDisk = () => {
    if (!persistFilePath) return;
    try {
      fs.mkdirSync(path.dirname(persistFilePath), { recursive: true });
      fs.writeFileSync(
        persistFilePath,
        JSON.stringify(
          {
            shares: Object.fromEntries(shares.entries()),
            rooms: Object.fromEntries(rooms.entries()),
          },
          null,
          2
        )
      );
    } catch {
      // ignore
    }
  };

  return {
    async registerShare(shareId, entry) {
      shares.set(shareId, entry);
      flushToDisk();
    },
    async resolveShare(shareId) {
      if (shares.has(shareId)) return shares.get(shareId);
      const decodedRoomId = decodeRoomIdFromShareId(shareId);
      if (decodedRoomId) return { shareId, roomId: decodedRoomId };
      return null;
    },
    async registerRoom(roomId, summary) {
      rooms.set(roomId, summary);
      flushToDisk();
    },
    async listRooms() {
      return [...rooms.values()].sort((a, b) =>
        String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      );
    },
  };
}

/**
 * Node.js 1-Room-1-SQLite Manager (exact structural twin of 1-Room-1-Durable-Object)
 */
export function createNodeRoomCluster({
  dataDir = null,
  env = {},
  triageDebounceMs = 3000,
  fastDebounceMs = 400,
  handRaiseFoldMs = 30_000,
  roleCooldownMs = 60_000,
  nowFn = () => Date.now(),
  seedShowcase = true,
} = {}) {
  /** @type {Map<string, RoomEngine>} */
  const engines = new Map();
  const registryPath = dataDir ? path.join(dataDir, 'registry.json') : null;
  const shareRegistry = createMemoryOrFileShareRegistry(registryPath);

  function getOrOpenEngine(roomId) {
    const cleanId = String(roomId || '').trim();
    if (!cleanId) throw new Error('Invalid roomId');
    if (engines.has(cleanId)) return engines.get(cleanId);

    const safeFile = cleanId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const dbPath = dataDir ? path.join(dataDir, 'rooms', `${safeFile}.db`) : ':memory:';
    const db = createNodeRoomSqlite(dbPath);

    if (seedShowcase && cleanId === 'room_showcase_v5') {
      seedShowcaseRoom(db, 'room_showcase_v5');
    } else if (seedShowcase && cleanId === 'room_starter_v5') {
      seedStarterCaseRoom(db, { roomId: 'room_starter_v5' });
    }

    const engine = new RoomEngine({
      db,
      roomId: cleanId,
      env,
      shareRegistry,
      triageDebounceMs,
      fastDebounceMs,
      handRaiseFoldMs,
      roleCooldownMs,
      nowFn,
    });
    engines.set(cleanId, engine);
    return engine;
  }

  if (seedShowcase) {
    const starter = getOrOpenEngine('room_starter_v5');
    const stStarter = starter.getFullState();
    if (stStarter?.roomMeta) {
      shareRegistry.registerRoom('room_starter_v5', {
        roomId: 'room_starter_v5',
        title: stStarter.roomMeta.title,
        presetId: stStarter.roomMeta.presetId,
        presetName: stStarter.roomMeta.presetName,
        status: stStarter.roomMeta.status,
        createdAt: stStarter.roomMeta.createdAt,
        isStarter: true,
      });
    }

    const demo = getOrOpenEngine('room_showcase_v5');
    const st = demo.getFullState();
    if (st?.roomMeta) {
      shareRegistry.registerRoom('room_showcase_v5', {
        roomId: 'room_showcase_v5',
        title: st.roomMeta.title,
        presetId: st.roomMeta.presetId,
        presetName: st.roomMeta.presetName,
        status: st.roomMeta.status,
        createdAt: st.roomMeta.createdAt,
        isShowcase: true,
      });
    }
  }

  function closeAll() {
    for (const eng of engines.values()) {
      if (eng.debounceTimer) clearTimeout(eng.debounceTimer);
      for (const ft of eng.foldTimers) clearTimeout(ft);
      try {
        eng.db.close();
      } catch {
        // ignore
      }
    }
    engines.clear();
  }

  return {
    engines,
    shareRegistry,
    getOrOpenEngine,
    closeAll,
  };
}

function sendJson(res, status, data, extraHeaders = {}) {
  const payload = data === null || data === undefined ? '' : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS_HEADERS,
    ...extraHeaders,
  });
  res.end(payload);
}

async function readNodeJsonBody(req) {
  if (req._parsedBody !== undefined) return req._parsedBody;
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return {};
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

/**
 * Node HTTP Request Handler supporting REST API, SSE (`Last-Event-ID`), `/mcp`, and `./public` static files
 */
export function createNodeHttpHandler(cluster) {
  return async function handler(req, res) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || '127.0.0.1:3500';
    const origin = `${proto}://${host}`;
    const url = new URL(req.url || '/', origin);
    const pathname = url.pathname;
    const query = Object.fromEntries(url.searchParams.entries());

    // 1. Health & Meta Catalog
    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        version: '5.2.0',
        architecture: '1-room-1-sqlite-do',
        authModel: 'v5.1-bearer-claim-sharetoken',
        presets: Object.values(ROOM_PRESETS),
        templates: Object.values(DELIVERABLE_TEMPLATES),
        personas: SIMULATED_PERSONAS,
      });
      return;
    }

    // 2. Standard Streamable HTTP MCP Server (`/mcp`)
    if (pathname === '/mcp' || pathname === '/mcp/') {
      if (req.method === 'GET') {
        sendJson(res, 200, {
          name: 'omind-v5-room-mcp',
          version: '5.2.0',
          protocolVersion: '2025-03-26',
          transport: 'streamable-http',
          endpoint: `${origin}/mcp`,
        });
        return;
      }

      if (req.method === 'POST') {
        let rpcBody;
        try {
          rpcBody = await readNodeJsonBody(req);
        } catch {
          sendJson(res, 400, {
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' },
          });
          return;
        }

        const out = await handleMcpJsonRpcPayload(rpcBody, {
          authHeader: req.headers.authorization || '',
          resolveRoomExecutor: async ({ parsedRef, toolName, toolArgs, providedToken }) => {
            let roomId = parsedRef.roomId;
            if (!roomId && parsedRef.shareId) {
              const entry = await cluster.shareRegistry.resolveShare(parsedRef.shareId);
              roomId = entry?.roomId || null;
            }
            if (!roomId) {
              throw new Error('Cannot resolve target roomId from roomUrl / roomOrShareUrl');
            }
            const engine = cluster.getOrOpenEngine(roomId);
            return engine.executeMcp({ toolName, toolArgs, providedToken });
          },
        });

        sendJson(res, out.status, out.body);
        return;
      }
    }

    // 3. Room Registry & Creation (`GET /api/rooms`, `POST /api/rooms`)
    if (pathname === '/api/rooms') {
      if (req.method === 'GET') {
        const rooms = await cluster.shareRegistry.listRooms();
        sendJson(res, 200, {
          rooms,
          presets: Object.values(ROOM_PRESETS),
          templates: Object.values(DELIVERABLE_TEMPLATES),
          personas: SIMULATED_PERSONAS,
        });
        return;
      }

      if (req.method === 'POST') {
        let body;
        try {
          body = await readNodeJsonBody(req);
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON body' });
          return;
        }
        const roomId = body.roomId || generateId('room');
        const engine = cluster.getOrOpenEngine(roomId);
        const created = engine.createRoom({ ...body, origin });

        await cluster.shareRegistry.registerRoom(roomId, {
          roomId,
          title: created.roomMeta.title,
          presetId: created.roomMeta.presetId,
          presetName: created.roomMeta.presetName,
          status: created.roomMeta.status,
          createdAt: created.roomMeta.createdAt,
        });

        sendJson(res, 201, created);
        return;
      }
    }

    // 4. Share Read & 30s Replay (`GET /api/shares/:shareId`, `GET /api/shares/:shareId/replay`)
    const shareReplayMatch = pathname.match(/^\/api\/shares\/([^/]+)\/replay$/);
    if (req.method === 'GET' && shareReplayMatch) {
      const shareId = decodeURIComponent(shareReplayMatch[1]);
      const resolved = await cluster.shareRegistry.resolveShare(shareId);
      if (!resolved?.roomId) {
        sendJson(res, 404, { error: 'Share ID not found' });
        return;
      }
      const engine = cluster.getOrOpenEngine(resolved.roomId);
      if (!engine.isInitialized()) {
        sendJson(res, 404, { error: 'Source room not found' });
        return;
      }
      try {
        const replay = engine.getShareReplay(shareId, { query, headers: req.headers });
        sendJson(res, 200, replay);
      } catch (err) {
        sendJson(res, err.statusCode || 403, { error: err.message });
      }
      return;
    }

    const shareGetMatch = pathname.match(/^\/api\/shares\/([^/]+)$/);
    if (req.method === 'GET' && shareGetMatch) {
      const shareId = decodeURIComponent(shareGetMatch[1]);
      const resolved = await cluster.shareRegistry.resolveShare(shareId);
      if (!resolved?.roomId) {
        sendJson(res, 404, { error: 'Share ID not found' });
        return;
      }
      const engine = cluster.getOrOpenEngine(resolved.roomId);
      try {
        const bundle = engine.getShareBundle(shareId, origin, { query, headers: req.headers });
        if (!bundle) {
          sendJson(res, 404, { error: 'Deliverable snapshot not found' });
          return;
        }
        sendJson(res, 200, bundle);
      } catch (err) {
        sendJson(res, err.statusCode || 403, { error: err.message });
      }
      return;
    }

    // 5. Room-Scoped SSE (`GET /api/rooms/:roomId/events`) with `Last-Event-ID`
    const sseMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/events$/);
    if (req.method === 'GET' && sseMatch) {
      const roomId = decodeURIComponent(sseMatch[1]);
      const engine = cluster.getOrOpenEngine(roomId);
      if (!engine.isInitialized()) {
        sendJson(res, 404, { error: `Room not found: ${roomId}` });
        return;
      }

      const participantId = query.participantId || 'anonymous';
      if (participantId !== 'anonymous') {
        engine.touchParticipant(participantId);
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        ...CORS_HEADERS,
      });

      const clientObj = {
        id: generateId('sse'),
        participantId,
        send(event, data, seq) {
          const idLine = seq ? `id: ${seq}\n` : '';
          res.write(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        close() {
          try {
            res.end();
          } catch {
            // ignore
          }
        },
      };

      engine.sseClients.add(clientObj);
      const pacing = engine.recomputePacingMode();
      res.write(
        `event: connected\ndata: ${JSON.stringify({ roomId, participantId, ...pacing })}\n\n`
      );

      const lastEventId = req.headers['last-event-id'] || query.lastEventId;
      if (lastEventId !== undefined && lastEventId !== null && lastEventId !== '') {
        const missed = engine.getEventsAfterSeq(Number(lastEventId));
        for (const m of missed) {
          clientObj.send(m.sseEvent, m.data, m.seq);
        }
      }

      const hb = setInterval(() => {
        try {
          res.write(`: heartbeat ${Date.now()}\n\n`);
        } catch {
          clearInterval(hb);
        }
      }, 20_000);
      if (typeof hb.unref === 'function') hb.unref();

      req.on('close', () => {
        clearInterval(hb);
        engine.sseClients.delete(clientObj);
        engine.recomputePacingMode();
      });
      return;
    }

    // 6. Room-Scoped REST Routes (`/api/rooms/:roomId...`)
    const roomRouteMatch = pathname.match(/^\/api\/rooms\/([^/]+)(\/.*)?$/);
    if (roomRouteMatch) {
      const roomId = decodeURIComponent(roomRouteMatch[1]);
      const subPath = roomRouteMatch[2] || '';

      let body = {};
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        try {
          body = await readNodeJsonBody(req);
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON body' });
          return;
        }
      }

      // Cross-room share import coordinator (`POST /api/rooms/:roomId/artifacts/import-share`)
      if (req.method === 'POST' && subPath === '/artifacts/import-share') {
        const parsed = parseRoomOrShareRef(body.shareUrl || body.shareId || '');
        const targetShareId = body.shareId || parsed.shareId;
        const targetShareToken =
          body.shareToken || parsed.shareToken || parsed.token || query.t || '';
        const resolved = await cluster.shareRegistry.resolveShare(targetShareId);
        if (!resolved?.roomId) {
          sendJson(res, 404, { error: `Cannot resolve shareId: ${targetShareId}` });
          return;
        }
        const sourceEngine = cluster.getOrOpenEngine(resolved.roomId);
        try {
          const shareBundle = sourceEngine.getShareBundle(targetShareId, origin, {
            query: { t: targetShareToken },
            headers: req.headers,
          });
          if (!shareBundle) {
            sendJson(res, 404, { error: 'Source share snapshot not found' });
            return;
          }
          body = {
            ...body,
            shareId: targetShareId,
            shareToken: targetShareToken,
            shareBundle,
          };
        } catch (err) {
          sendJson(res, err.statusCode || 403, { error: err.message });
          return;
        }
      }

      const engine = cluster.getOrOpenEngine(roomId);
      const out = await engine.handleRoomRequest(req.method, subPath, {
        query,
        body,
        origin,
        headers: req.headers,
      });

      if (req.method === 'POST' && subPath === '/finalize' && out.status === 201) {
        const st = engine.getFullState({ origin });
        if (st?.roomMeta) {
          await cluster.shareRegistry.registerRoom(roomId, {
            roomId,
            title: st.roomMeta.title,
            presetId: st.roomMeta.presetId,
            presetName: st.roomMeta.presetName,
            status: st.roomMeta.status,
            createdAt: st.roomMeta.createdAt,
          });
        }
      }

      sendJson(res, out.status, out.body);
      return;
    }

    // 7. Static Assets from `./public` (SPA fallback to `index.html`)
    if (req.method === 'GET' || req.method === 'HEAD') {
      const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const candidate = path.resolve(PUBLIC_DIR, relPath);
      if (
        candidate.startsWith(PUBLIC_DIR) &&
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isFile()
      ) {
        const ext = path.extname(candidate).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(candidate).pipe(res);
        return;
      }

      const indexHtml = path.join(PUBLIC_DIR, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(indexHtml).pipe(res);
        return;
      }
    }

    sendJson(res, 404, { error: 'Not found' });
  };
}
