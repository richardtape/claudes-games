#!/usr/bin/env node
// Headless smoke test for the arcade, using the installed Google Chrome (no browser download).
//
//   npm run check                 every game + the front page
//   npm run check -- press-run    one game
//   npm run check -- --no-thumb   skip writing thumbnails
//
// For each game it:
// The arcade is served under /claudes-games/ exactly as on GitHub Pages (requests outside it 404).
//   1. loads it at desktop size, fails on console errors / page errors / failed requests,
//   2. waits for the ready signal (document.documentElement.dataset.ready = "1", set by
//      markReady() in shared/arcade.js),
//   3. calls window.__game.prepareThumbnail() if present, audits the DOM (nested buttons,
//      unlabeled buttons, overflow), then writes games/<slug>/thumb.jpg,
//   4. runs games/<slug>/smoke.mjs if present: export default async (page, ctx) => {...}
//      where ctx = { base, url, outDir, log(msg), shot(name), audit(label) },
//   5. reloads at phone size (390x844, touch) and warns on horizontal overflow,
//      (on the start screen and again after prepareThumbnail()), saving
//      .tmp/check/<slug>-desktop.png, -mobile-start.png and -mobile.png for visual review.
// Then rebuilds games.js. Exits 1 if anything errored.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createArcadeServer, listen, ROOT } from './serve.mjs';
import { loadGames } from './build-gallery.mjs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const only = args.filter((a) => !a.startsWith('--'));
const writeThumbs = !flags.has('--no-thumb');
const READY_TIMEOUT = 10000;

// Start clean so old screenshots can't be mistaken for this run's.
const outDir = join(ROOT, '.tmp/check');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// Serve under /claudes-games/ like GitHub Pages does; anything outside it is a 404, so a game
// using an absolute URL ("/shared/...") fails here instead of after deploying.
const PREFIX = '/claudes-games';
const handle = createArcadeServer({ quiet: true }).listeners('request')[0];
const server = createServer((req, res) => {
  if (!req.url.startsWith(`${PREFIX}/`)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end(`Outside ${PREFIX}/ (would 404 on GitHub Pages): ${req.url}`);
  }
  req.url = req.url.slice(PREFIX.length);
  handle(req, res);
});
const port = await listen(server, 0);
const base = `http://127.0.0.1:${port}${PREFIX}/`;
const browser = await chromium.launch({ channel: 'chrome' });

let failures = 0;
const report = (slug, level, msg) => {
  if (level === 'error') failures++;
  const mark = { error: '✗', warn: '!', ok: '✓' }[level];
  console.log(`  ${mark} ${msg}`);
};

function watch(page, slug) {
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  return problems;
}

async function waitReady(page) {
  try {
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: READY_TIMEOUT });
    return true;
  } catch {
    return false;
  }
}

/**
 * Installed in every page before it loads. The HTML parser silently "fixes" markup like
 * <button><button></button></button> by splitting it into siblings, which wrecks layouts
 * without any error. So we inspect HTML strings as they are assigned and record any
 * <button>/<a> that opens inside another one.
 */
const AUDIT_INIT = () => {
  window.__cgNested = [];
  const scan = (html) => {
    const re = /<\/?(button|a)\b[^>]*>/gi;
    let open = 0;
    let m;
    while ((m = re.exec(html))) {
      if (m[0][1] === '/') open = Math.max(0, open - 1);
      else {
        if (open > 0 && window.__cgNested.length < 20) window.__cgNested.push(html.slice(Math.max(0, m.index - 60), m.index + 40));
        open++;
      }
    }
  };
  const wrap = (proto, name) => {
    const d = Object.getOwnPropertyDescriptor(proto, name);
    Object.defineProperty(proto, name, {
      ...d,
      set(v) {
        try { scan(String(v)); } catch {}
        d.set.call(this, v);
      },
    });
  };
  wrap(Element.prototype, 'innerHTML');
  wrap(Element.prototype, 'outerHTML');
  const iah = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function (pos, html) {
    try { scan(String(html)); } catch {}
    return iah.call(this, pos, html);
  };
};

/**
 * DOM problems that don't throw errors but break games: nested interactive elements (the
 * browser silently splits <button><button>, wrecking layout), unlabeled buttons, and content
 * wider than the viewport. Returns a list of human-readable findings.
 */
async function audit(page) {
  return page.evaluate(() => {
    const out = [];
    const nested = document.querySelectorAll('button button, button a[href], a[href] button, a[href] a[href], button input, button select');
    if (nested.length) out.push(`${nested.length} interactive element(s) nested inside a button/link, e.g. ${nested[0].outerHTML.slice(0, 90)}`);
    const parsed = window.__cgNested || [];
    if (parsed.length) out.push(`HTML string nests a <button>/<a> inside another (the parser splits these apart), near: …${parsed[0].replace(/\s+/g, ' ')}…`);
    window.__cgNested = [];
    const unlabeled = [...document.querySelectorAll('button, [role=button]')].filter(
      (b) => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title') && b.offsetParent,
    );
    if (unlabeled.length) out.push(`${unlabeled.length} button(s) with no text or aria-label, e.g. ${unlabeled[0].outerHTML.slice(0, 90)}`);
    const over = document.documentElement.scrollWidth - window.innerWidth;
    if (over > 1) out.push(`page is ${over}px wider than the viewport (horizontal scroll)`);
    return out;
  });
}

async function checkGame(game) {
  console.log(`\n${game.slug}  (${game.title})`);
  const url = `${base}games/${game.slug}/`;

  // Desktop pass
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(AUDIT_INIT);
  const page = await ctx.newPage();
  const problems = watch(page, game.slug);
  await page.goto(url, { waitUntil: 'load' });
  if (await waitReady(page)) report(game.slug, 'ok', 'ready signal received');
  else report(game.slug, 'warn', `no ready signal within ${READY_TIMEOUT / 1000}s (call markReady() from shared/arcade.js)`);

  const hasPrep = await page.evaluate(() => typeof window.__game?.prepareThumbnail === 'function');
  if (hasPrep) {
    await page.evaluate(() => window.__game.prepareThumbnail());
    await page.waitForTimeout(400);
  } else {
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: join(outDir, `${game.slug}-desktop.png`) });
  for (const f of await audit(page)) report(game.slug, 'warn', `desktop: ${f}`);
  if (writeThumbs) {
    await page.screenshot({ path: join(ROOT, 'games', game.slug, 'thumb.jpg'), type: 'jpeg', quality: 82 });
    report(game.slug, 'ok', `thumbnail written`);
  }

  const smokePath = join(ROOT, 'games', game.slug, 'smoke.mjs');
  if (existsSync(smokePath)) {
    try {
      await page.goto(url, { waitUntil: 'load' });
      await waitReady(page);
      const { default: smoke } = await import(pathToFileURL(smokePath).href + `?t=${Date.now()}`);
      let shots = 0;
      await smoke(page, {
        base,
        url,
        outDir,
        log: (m) => console.log(`    · ${m}`),
        // Save a screenshot of the current state for visual review: .tmp/check/<slug>-NN-<name>.png
        shot: (name) => page.screenshot({ path: join(outDir, `${game.slug}-${String(++shots).padStart(2, '0')}-${name}.png`) }),
        // Run the DOM audit on the current screen; findings are reported as warnings.
        audit: async (label) => (await audit(page)).forEach((f) => report(game.slug, 'warn', `${label}: ${f}`)),
      });
      report(game.slug, 'ok', 'smoke.mjs passed');
    } catch (e) {
      report(game.slug, 'error', `smoke.mjs failed: ${e.message.split('\n')[0]}`);
      await page.screenshot({ path: join(outDir, `${game.slug}-smoke-fail.png`) }).catch(() => {});
    }
  }
  await ctx.close();

  // Phone pass
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await mctx.addInitScript(AUDIT_INIT);
  const mpage = await mctx.newPage();
  const mproblems = watch(mpage, game.slug);
  await mpage.goto(url, { waitUntil: 'load' });
  await waitReady(mpage);
  await mpage.waitForTimeout(500);
  await mpage.screenshot({ path: join(outDir, `${game.slug}-mobile-start.png`) });
  // Check the in-game screen too, not just the title screen.
  if (await mpage.evaluate(() => typeof window.__game?.prepareThumbnail === 'function')) {
    await mpage.evaluate(() => window.__game.prepareThumbnail());
    await mpage.waitForTimeout(500);
  }
  const mfindings = await audit(mpage);
  mfindings.forEach((f) => report(game.slug, 'warn', `phone: ${f}`));
  if (!mfindings.length) report(game.slug, 'ok', 'phone layout fits 390px, DOM audit clean');
  await mpage.screenshot({ path: join(outDir, `${game.slug}-mobile.png`) });
  await mctx.close();

  const all = [...new Set([...problems, ...mproblems])];
  if (all.length) all.forEach((p) => report(game.slug, 'error', p));
  else report(game.slug, 'ok', 'no console errors or failed requests');
}

const games = loadGames({ includeDrafts: true, warn: (m) => console.log(`  ! ${m}`) });
const targets = only.length ? games.filter((g) => only.includes(g.slug)) : games;
if (only.length && targets.length !== only.length) {
  console.log(`Unknown game(s): ${only.filter((s) => !games.some((g) => g.slug === s)).join(', ')}`);
  failures++;
}

for (const g of targets) await checkGame(g);

// Rebuild the manifest so freshly written thumbnails show up, then check the front page.
execFileSync(process.execPath, [join(ROOT, 'scripts/build-gallery.mjs')], { stdio: 'inherit' });
if (!only.length) {
  console.log('\nfront page');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const problems = watch(page, 'index');
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(outDir, 'index-desktop.png'), fullPage: true });
  problems.forEach((p) => report('index', 'error', p));
  if (!problems.length) report('index', 'ok', 'front page loads cleanly');
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${failures ? `${failures} problem(s)` : 'All clear'} — screenshots in .tmp/check/`);
process.exit(failures ? 1 : 0);
