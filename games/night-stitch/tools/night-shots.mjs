#!/usr/bin/env node
// Plays a whole night in headless Chrome with the bot on the manual clock and screenshots the
// key moments (each boss, the swarm, the last hour, the end) into .tmp/night/. Short smoke
// tests miss late-game problems; this is how the 2 AM clutter problem was found.
//
//   node games/night-stitch/tools/night-shots.mjs [skill=0.6]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createArcadeServer, listen, ROOT } from '../../../scripts/serve.mjs';

const skill = Number(process.argv[2] || 0.6);
const out = join(ROOT, '.tmp/night');
mkdirSync(out, { recursive: true });
const server = createArcadeServer({ quiet: true });
const port = await listen(server, 0);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
await page.goto(`http://127.0.0.1:${port}/games/night-stitch/`);
await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
await page.evaluate(async (skill) => {
  const { createBot } = await import('./js/bot.js');
  const g = window.__game;
  g.loop.manual = true;
  g.startNight('free');
  const think = createBot({ skill, seed: 11 });
  window.__run = (secs) => {
    for (let i = 0; i < secs * 10 && g.state.phase === 'play'; i++) g.advance(0.1, () => think(g.state, 1 / 60).target || null);
    const s = g.state;
    return { phase: s.phase, hour: s.hour, t: +s.hourT.toFixed(1), score: s.score, moths: s.moths.length, holes: s.holes.length };
  };
}, skill);

const moments = [[0, 20, '1-10pm'], [2, 4, '2-midnight'], [2, 20, '3-atlas'], [4, 2, '4-swarm'], [4, 25, '5-2am'], [6, 6, '6-deathshead'], [7, 30, '7-5am']];
for (const [hour, t, name] of moments) {
  let st;
  for (let k = 0; k < 400; k++) {
    st = await page.evaluate(() => {
      document.querySelector('[data-action=notion]')?.click(); // take the first notion offered
      return window.__run(1);
    });
    if (st.phase === 'notion') await page.waitForTimeout(800); // the notion screen opens on a timer
    if (st.phase === 'over' || st.phase === 'dawn' || st.hour > hour || (st.hour === hour && st.t >= t)) break;
  }
  console.log(name, JSON.stringify(st));
  await page.screenshot({ path: join(out, `${name}.png`) });
  if (st.phase === 'over' || st.phase === 'dawn') break;
}
await page.waitForTimeout(2500);
await page.screenshot({ path: join(out, '9-end.png') });
await browser.close();
server.close();
