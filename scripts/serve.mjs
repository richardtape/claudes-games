#!/usr/bin/env node
// Zero-dependency static server for the arcade. Sends `Cache-Control: no-store` so the
// browser never runs stale JS/CSS after an edit (the #1 cause of "my fix didn't work").
//
//   npm start                 -> http://localhost:8642
//   PORT=9000 npm start       -> custom port
//
// If the port is already taken by this same server, it says so and exits 0, so it is
// always safe to run `npm start` before testing.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize, sep } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_PORT = 8642;
const PING = '/__ping';
const PING_BODY = 'claudes-games';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

export function createArcadeServer({ quiet = false } = {}) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === PING) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end(PING_BODY);
    }
    let rel;
    try {
      rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    } catch {
      res.writeHead(400);
      return res.end('Bad path');
    }
    let file = join(ROOT, rel);
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    try {
      let info = await stat(file);
      if (info.isDirectory()) {
        if (!url.pathname.endsWith('/')) {
          res.writeHead(301, { location: url.pathname + '/' + url.search });
          return res.end();
        }
        file = join(file, 'index.html');
        info = await stat(file);
      }
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(body);
    } catch {
      if (!quiet) console.warn(`404 ${url.pathname}`);
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end(`Not found: ${url.pathname}`);
    }
  });
}

/** Resolves to true if an arcade server already answers on `port`. */
export async function isArcadeRunning(port) {
  try {
    const r = await fetch(`http://localhost:${port}${PING}`, { signal: AbortSignal.timeout(800) });
    return (await r.text()) === PING_BODY;
  } catch {
    return false;
  }
}

/** Starts a server on `port` (0 = random free port). Resolves to the bound port. */
export function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  if (await isArcadeRunning(port)) {
    console.log(`Arcade already running at http://localhost:${port}/`);
    process.exit(0);
  }
  try {
    await listen(createArcadeServer(), port);
    console.log(`Arcade running at http://localhost:${port}/  (no-store caching, Ctrl+C to stop)`);
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is busy with something else. Try: PORT=${port + 1} npm start`);
      process.exit(1);
    }
    throw err;
  }
}
