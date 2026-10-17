#!/usr/bin/env node
// Checks the deployed arcade in headless Chrome: the front page and every game on its shelf
// must load from GitHub Pages, reach the ready signal, and log no errors or failed requests.
// Catches hosting-only problems a local check can't (case-sensitive paths, missing files,
// absolute URLs that escape /claudes-games/).
//
// Multiplayer games (smoke.mjs exports `duo`) also get a live two-player run: two separate
// browsers join a fresh room through the real public relays and play a turn.
//
//   npm run verify-live                      https://richardtape.github.io/claudes-games/
//   npm run verify-live -- http://host/path/ another base URL
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const base = (process.argv[2] || 'https://richardtape.github.io/claudes-games/').replace(/\/?$/, '/');
const browser = await chromium.launch({ channel: 'chrome' });
let failures = 0;

async function visit(url, { ready }) {
  const page = await browser.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console.error: ${m.text()}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${r.url()}`));
  // Bypass the 10-minute Pages cache so we see what was just deployed.
  await page.route('**/*', (route) => route.continue({ headers: { ...route.request().headers(), 'cache-control': 'no-cache' } }));
  const res = await page.goto(url, { waitUntil: 'load' });
  if (!res || res.status() >= 400) problems.push(`HTTP ${res?.status()} for the page itself`);
  if (ready) {
    try {
      await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 15000 });
    } catch {
      problems.push('no ready signal within 15s');
    }
  }
  return { page, problems };
}

console.log(`checking ${base}`);
const { page: front, problems: fp } = await visit(base, { ready: false });
const games = await front.evaluate(() => window.GAMES || []);
fp.forEach((p) => console.log(`  ✗ front page: ${p}`));
failures += fp.length;
if (!fp.length) console.log(`  ✓ front page (${games.length} game${games.length === 1 ? '' : 's'} on the shelf)`);
await front.close();

for (const g of games) {
  const { page, problems } = await visit(new URL(g.href, base).href, { ready: true });
  problems.forEach((p) => console.log(`  ✗ ${g.slug}: ${p}`));
  failures += problems.length;
  if (!problems.length) console.log(`  ✓ ${g.slug} loads and is ready`);
  await page.close();

  const smokePath = join(ROOT, 'games', g.slug, 'smoke.mjs');
  const { duo } = existsSync(smokePath) ? await import(pathToFileURL(smokePath).href) : {};
  if (typeof duo === 'function') {
    const ctxs = [await browser.newContext(), await browser.newContext()];
    const pages = await Promise.all(ctxs.map((c) => c.newPage()));
    const errs = [];
    // Relay hiccups log WebSocket errors; only real page errors count.
    pages.forEach((p) => p.on('pageerror', (e) => errs.push(`uncaught: ${e.message}`)));
    const code = `LIVE${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    try {
      const t0 = Date.now();
      await duo(pages, { url: new URL(g.href, base).href, live: true, code, log: () => {}, shot: async () => {}, audit: async () => {} });
      if (errs.length) throw new Error(errs[0]);
      console.log(`  ✓ ${g.slug}: two browsers played online through the public relays (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      failures++;
      console.log(`  ✗ ${g.slug}: live two-player run failed: ${e.message.split('\n')[0]}`);
    }
    await Promise.all(ctxs.map((c) => c.close()));
  }
}

await browser.close();
console.log(failures ? `${failures} problem(s)` : 'Live site OK');
process.exit(failures ? 1 : 0);
