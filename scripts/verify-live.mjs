#!/usr/bin/env node
// Checks the deployed arcade in headless Chrome: the front page and every game on its shelf
// must load from GitHub Pages, reach the ready signal, and log no errors or failed requests.
// Catches hosting-only problems a local check can't (case-sensitive paths, missing files,
// absolute URLs that escape /claudes-games/).
//
//   npm run verify-live                      https://richardtape.github.io/claudes-games/
//   npm run verify-live -- http://host/path/ another base URL
import { chromium } from 'playwright-core';

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
}

await browser.close();
console.log(failures ? `${failures} problem(s)` : 'Live site OK');
process.exit(failures ? 1 : 0);
