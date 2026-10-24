#!/usr/bin/env node
// Play a game by hand from the terminal: one headless Chrome page kept open, driven over HTTP.
//
//   npm run drive -- <slug> [--phone] [--port 8650]      (run it in the background)
//   curl -s 127.0.0.1:8650 -d "__game.state.screen"      evaluate JS in the page, get JSON back
//   curl -s 127.0.0.1:8650 -d reload                     reload the page (picks up code edits)
//
// Every request screenshots the page to .tmp/drive.png afterwards, so you can look at what you
// just did. Combine with the game's manual clock (__game.advance / helpers that hold an input
// for N seconds) to take one decision at a time, the way a player would. First Light's hand
// flights found six problems its bot and simulator never showed (see CLAUDE.md, Testing).
// Serves the page from the dev server (npm start, http://localhost:8642).
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
const phone = args.includes('--phone');
const port = Number(args[args.indexOf('--port') + 1]) || 8650;
if (!slug) {
  console.log('usage: npm run drive -- <slug> [--phone] [--port 8650]');
  process.exit(1);
}
mkdirSync('.tmp', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));
const ready = () => page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 15000 });
await page.goto(`http://localhost:8642/games/${slug}/`, { waitUntil: 'load' });
await ready();
createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  let out;
  try {
    if (body.trim() === 'reload') {
      await page.reload();
      await ready();
      out = 'reloaded';
    } else out = await page.evaluate(body);
    await page.waitForTimeout(120);
    await page.screenshot({ path: '.tmp/drive.png' });
  } catch (e) {
    out = `ERR ${e.message.split('\n')[0]}`;
  }
  res.end(JSON.stringify({ out, errors: errors.splice(0) }) + '\n');
}).listen(port, () => console.log(`driving ${slug}${phone ? ' (phone)' : ''} on http://127.0.0.1:${port}/`));
process.on('SIGTERM', () => browser.close().then(() => process.exit(0)));
