#!/usr/bin/env node
// Are the public relays up? Two headless pages join a bare Trystero room (the build shared/net.js
// pins) and wait to meet. Run this first when verify-live's online runs fail: if the bare room
// can't connect either, the relays are down and the games are fine.
//
//   npm run relays [-- --timeout 40]
import { chromium } from 'playwright-core';
import { TRYSTERO_URL } from '../shared/net.js';

const args = process.argv.slice(2);
const i = args.indexOf('--timeout');
const timeout = (i >= 0 ? Number(args[i + 1]) : 40) * 1000;
const code = `relay-test-${Math.random().toString(36).slice(2, 8)}`;
// Two separate browsers, as verify-live uses (and as two players would be).
const browsers = [await chromium.launch({ channel: 'chrome' }), await chromium.launch({ channel: 'chrome' })];
const pages = [];
const sockets = new Map();
for (let k = 0; k < 2; k++) {
  const page = await browsers[k].newPage();
  page.on('websocket', (ws) => {
    const host = new URL(ws.url()).host;
    sockets.set(host, sockets.get(host) ?? 'opened');
    ws.on('framereceived', () => sockets.set(host, 'answering'));
    ws.on('socketerror', () => sockets.set(host, 'error'));
    ws.on('close', () => sockets.get(host) !== 'answering' && sockets.set(host, 'closed'));
  });
  // Any https page will do; the import needs a secure context.
  await page.goto('https://richardtape.github.io/claudes-games/');
  pages.push(page);
}
const t0 = Date.now();
const met = await Promise.all(
  pages.map((page) =>
    page
      .evaluate(
        async ({ url, code, timeout }) => {
          const { joinRoom } = await import(url);
          const room = joinRoom({ appId: 'claudes-games-relay-test' }, code);
          return new Promise((resolve) => {
            room.onPeerJoin = () => resolve(true);
            setTimeout(() => resolve(false), timeout);
          });
        },
        { url: TRYSTERO_URL, code, timeout },
      )
      .catch((e) => `error: ${e.message}`),
  ),
);
const ok = met.every((m) => m === true);
console.log(ok ? `✓ two bare pages met through the relays in ${((Date.now() - t0) / 1000).toFixed(1)} s` : `✗ the bare pages never met (${JSON.stringify(met)}): the relays look down`);
for (const [host, s] of sockets) console.log(`  ${s === 'answering' ? '✓' : '!'} ${host}: ${s}`);
await Promise.all(browsers.map((b) => b.close()));
process.exit(ok ? 0 : 1);
