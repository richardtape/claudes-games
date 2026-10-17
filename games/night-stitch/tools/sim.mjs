#!/usr/bin/env node
// Plays whole nights headless with bots of different skill and reports how far they get.
//
//   node games/night-stitch/tools/sim.mjs            200 nights per skill level
//   node games/night-stitch/tools/sim.mjs 50 0.5     50 nights at skill 0.5 only
//
// Aim (see CLAUDE.md Balancing): the middle bot reaches dawn about 25-55% of the time, the
// weak bot sees midnight (the first boss) most nights.
import { newNight, step, chooseNotion, integrity, DT } from '../js/engine.js';
import { createBot, botPickNotion } from '../js/bot.js';
import { HOURS } from '../js/data.js';
import { createRng } from '../../../shared/rng.js';

const [nArg, skillArg] = process.argv.slice(2);
const N = Number(nArg) || 200;
const skills = skillArg ? skillArg.split(',').map(Number) : [0.3, 0.55, 0.8];

function night(seed, skill) {
  const s = newNight({ seed: `sim-${seed}` });
  const think = createBot({ skill, seed });
  const rng = createRng(seed * 7 + 1);
  const hourIntegrity = [];
  let guard = 0;
  while ((s.phase === 'play' || s.phase === 'notion') && guard++ < 60 * 60 * 10) {
    if (s.phase === 'notion') {
      hourIntegrity.push(integrity(s));
      chooseNotion(s, botPickNotion(s, rng));
      continue;
    }
    step(s, think(s, DT));
    s.events.length = 0;
  }
  return { s, hourIntegrity };
}

for (const skill of skills) {
  const reached = new Array(HOURS.length + 1).fill(0);
  let dawns = 0;
  let score = 0;
  let biggest = 0;
  let snaps = 0;
  let caught = 0;
  let bosses = 0;
  const integ = new Array(HOURS.length).fill(0);
  const scores = [];
  for (let i = 0; i < N; i++) {
    const { s, hourIntegrity } = night(i, skill);
    if (s.phase === 'dawn') dawns++;
    reached[s.phase === 'dawn' ? HOURS.length : s.hour]++;
    score += s.score;
    scores.push(s.score);
    biggest += s.stats.biggestLoop;
    snaps += s.stats.snaps;
    caught += Object.values(s.stats.caught).reduce((a, b) => a + b, 0);
    bosses += (s.stats.caught.atlas || 0) + (s.stats.caught.deathshead || 0);
    hourIntegrity.forEach((v, h) => (integ[h] += v));
  }
  scores.sort((a, b) => a - b);
  const pct = (x) => `${Math.round((x / N) * 100)}%`;
  console.log(`\nskill ${skill}: dawn ${pct(dawns)}  mean score ${Math.round(score / N)}  median ${scores[N >> 1]}  p90 ${scores[Math.floor(N * 0.9)]}`);
  console.log(`  ended in hour: ${HOURS.map((h, i) => `${h.label} ${pct(reached[i])}`).join('  ')}  dawn ${pct(reached[HOURS.length])}`);
  console.log(`  fabric at each chime (survivors): ${integ.map((v, h) => (v ? (v / Math.max(1, N - reached.slice(0, h + 1).reduce((a, b) => a + b, 0))).toFixed(2) : '-')).join(' ')}`);
  console.log(`  per night: caught ${(caught / N).toFixed(1)}  biggest loop ${(biggest / N).toFixed(1)}  snaps ${(snaps / N).toFixed(1)}  bosses ${(bosses / N).toFixed(2)}`);
}
