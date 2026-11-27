/**
 * Omind v5 — Local Node.js Server Entrypoint
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNodeHttpHandler, createNodeRoomCluster } from './router.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3500);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.OMIND_DATA_DIR || path.resolve(__dirname, '../data');

const cluster = createNodeRoomCluster({ dataDir: DATA_DIR });
const server = http.createServer(createNodeHttpHandler(cluster));

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ┌──────────────────────────────────────────────────────────────┐');
  console.log('  │  Omind v5 — 半异步圆桌会议室 · 1-Room-1-DO · MCP 双向连接器   │');
  console.log('  ├──────────────────────────────────────────────────────────────┤');
  console.log(`  │  Web:   http://${HOST}:${PORT.toString().padEnd(43)}│`);
  console.log(`  │  MCP:   http://${HOST}:${PORT}/mcp${' '.repeat(39 - PORT.toString().length)}│`);
  console.log('  └──────────────────────────────────────────────────────────────┘');
  console.log('');
});

function shutdown() {
  server.close(() => {
    cluster.closeAll();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
