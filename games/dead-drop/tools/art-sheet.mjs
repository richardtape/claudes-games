#!/usr/bin/env node
// Dead Drop art contact sheet: every agent and city from js/art.js at the sizes the game uses,
// on the mustard table and on night ink, so a new silhouette can be judged beside the old ones,
// and the four pictures of how a turn works (the lobby's guide) at 160 and 80 px on paper.
//
//   node games/dead-drop/tools/art-sheet.mjs [--shot]
//
// Writes .tmp/dead-drop-art.html (open it over http or file://; it has no dependencies). Agents
// show at 96, 48 and 24 px (card, chip, the smallest chip); cities at 300 and 150 px wide, with a
// dashed line at 60% of the box height (only one landmark per city should cross it, since the
// plate's text sits above), plus the faint ghost the plates print. New ids carry a red dot.
// --shot screenshots it through headless Chrome to .tmp/dead-drop-art.png (the whole sheet), and
// each section to .tmp/dead-drop-art-<section>.png at 1:1, for reading the 24 px column closely.
// One Chrome, closed at the end: check `pgrep -fl "chrome.*headless"` first on a shared machine.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { agentSVG, briefSVG, citySVG } from '../js/art.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OUT = `${ROOT}.tmp/`;
const shot = process.argv.includes('--shot');

// The classic 12 and 11 first, then the Phase 2b additions (data.js gains them in a later task,
// so the lists live here rather than coming from AGENTS and CITIES).
const AGENTS = ['heavy', 'sleeper', 'veteran', 'double', 'jammer', 'handler', 'mole', 'getaway', 'lookout', 'assassin', 'tripwire', 'impostor'];
const NEW_AGENTS = ['wiretap', 'interrogator', 'bodyguard', 'accomplice', 'turncoat', 'courier', 'blackmailer', 'decoy'];
const CITIES = ['lisbon', 'vienna', 'istanbul', 'berlin', 'havana', 'monaco', 'hongkong', 'helsinki', 'moscow', 'venice', 'tangier'];
const NEW_CITIES = ['reykjavik', 'casablanca', 'rome', 'tokyo', 'zurich', 'macau', 'glienicke', 'prague', 'geneva'];

// Colours from the game's own stylesheet, so the sheet follows any palette change.
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const token = (name, fallback) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`))?.[1] ?? fallback;
const C = {
  mustard: token('mustard', '#e0a030'),
  mustardDeep: token('mustard-deep', '#b97a17'),
  ink: token('ink', '#1d1a17'),
  paper: token('paper', '#f0e2c4'),
  red: token('red', '#c8321f'),
  teal: token('teal', '#1e6a6e'),
  night: token('night', '#170f0d'),
};

const isNew = (id) => NEW_AGENTS.includes(id) || NEW_CITIES.includes(id);
const empty = (svg) => !/<path/.test(svg);
const label = (id) => `<span class="id${isNew(id) ? ' new' : ''}">${id}</span>`;

const agentCell = (id) => {
  const s = agentSVG(id);
  return `<div class="agent">${label(id)}<div class="a96">${s}</div><div class="smalls"><div class="a48">${s}</div><div class="a24">${s}</div></div></div>`;
};
const cityCell = (id, cls) => `<div class="city ${cls}">${label(id)}<div class="box">${citySVG(id)}</div></div>`;

const allAgents = [...AGENTS, ...NEW_AGENTS];
const allCities = [...CITIES, ...NEW_CITIES];
const BRIEFS = ['the drop', 'the flip', 'the cities', 'the stake'];
const briefCell = (name, i) => `<div class="brief"><span class="id">${i}: ${name}</span><div class="b160">${briefSVG(i)}</div><div class="b80">${briefSVG(i)}</div></div>`;

const section = (key, title) => `
<section class="${key}">
  <h2>${title}</h2>
  <div class="agents" id="${key}-agents">${allAgents.map(agentCell).join('')}</div>
  <div class="cities w300" id="${key}-cities">${allCities.map((id) => cityCell(id, 'c300')).join('')}</div>
  <div class="cities w150" id="${key}-cities-small">${allCities.map((id) => cityCell(id, 'c150')).join('')}</div>
  ${key === 'night' ? `<h3>As the plates print them (paper at 17%)</h3><div class="cities w150 ghost" id="night-plates">${allCities.map((id) => cityCell(id, 'c150')).join('')}</div>` : ''}
</section>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Dead Drop art sheet</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; width: 1280px; font: 11px/1.2 'Courier Prime', 'Courier New', monospace; background: ${C.ink}; }
  section { padding: 14px 16px 18px; }
  h2 { margin: 0 0 10px; font: 700 15px/1 'Arial Narrow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  h3 { margin: 14px 0 6px; font: 700 12px/1 'Arial Narrow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  .day { background: ${C.mustard}; color: ${C.ink}; }
  .day .ac { fill: ${C.red}; }
  .night { background: ${C.ink}; color: ${C.paper}; }
  .night .ac { fill: ${C.mustard}; }
  .night .agents .agent:nth-child(even) .ac { fill: ${C.teal}; }
  .night .ghost .box { color: rgb(240 226 196 / 0.17); }
  .night .ghost .ac { fill: rgb(224 160 48 / 0.3); }
  svg { display: block; width: 100%; height: 100%; }
  .id { display: block; height: 13px; white-space: nowrap; overflow: hidden; }
  .id.new::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 4px; border-radius: 50%; background: ${C.red}; }
  .agents { display: grid; grid-template-columns: repeat(10, 120px); gap: 4px 4px; }
  .agent { padding: 4px; }
  .a96 { width: 96px; height: 96px; }
  .smalls { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
  .a48 { width: 48px; height: 48px; }
  .a24 { width: 24px; height: 24px; }
  .cities { display: grid; gap: 8px 12px; margin-top: 14px; }
  .w300 { grid-template-columns: repeat(4, 300px); }
  .w150 { grid-template-columns: repeat(7, 150px); }
  .c300 .box { position: relative; width: 300px; height: 120px; }
  .c150 .box { position: relative; width: 150px; height: 60px; }
  .c300 .box::after { content: ''; position: absolute; left: 0; right: 0; top: 40%; border-top: 1px dashed currentColor; opacity: 0.35; }
  .box { outline: 1px solid rgb(127 127 127 / 0.25); }
  .briefing { background: ${C.mustard}; color: ${C.ink}; }
  .briefs { display: grid; grid-template-columns: repeat(4, 280px); gap: 12px; }
  .brief { display: grid; grid-template-columns: 160px 80px; gap: 6px 14px; align-items: end; padding: 8px 10px 10px; background: ${C.paper}; }
  .brief .id { grid-column: 1 / -1; }
  .brief .ac { fill: ${C.red}; }
  .b160 { width: 160px; height: 100px; }
  .b80 { width: 80px; height: 50px; }
</style>
</head>
<body>
${section('day', 'Day: the mustard table (ink, red accent)')}
${section('night', 'Night: ink (paper, mustard and teal accents)')}
<section class="briefing">
  <h2>Briefing: how a turn works (ink on paper, red accent; 160 and 80 px)</h2>
  <div class="briefs" id="briefing">${BRIEFS.map(briefCell).join('')}</div>
</section>
</body>
</html>
`;

mkdirSync(OUT, { recursive: true });
const file = `${OUT}dead-drop-art.html`;
writeFileSync(file, html);
const blanks = [...allAgents.filter((id) => empty(agentSVG(id))), ...allCities.filter((id) => empty(citySVG(id))), ...BRIEFS.filter((_, i) => empty(briefSVG(i))).map((n) => `briefing ${n}`)];
console.log(`wrote ${file} (${allAgents.length} agents, ${allCities.length} cities, ${BRIEFS.length} briefing pictures)`);
if (blanks.length) console.log(`no art yet: ${blanks.join(', ')}`);

if (shot) {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
    await page.screenshot({ path: `${OUT}dead-drop-art.png`, fullPage: true });
    for (const id of ['day-agents', 'day-cities', 'day-cities-small', 'night-agents', 'night-cities', 'night-cities-small', 'night-plates', 'briefing']) {
      await page.locator(`#${id}`).screenshot({ path: `${OUT}dead-drop-art-${id}.png` });
    }
    console.log(`wrote ${OUT}dead-drop-art.png and dead-drop-art-<section>.png`);
    if (errors.length) {
      console.log('page errors:', errors);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}
