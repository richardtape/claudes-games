#!/usr/bin/env node
// The daily operation's schedule, and a first look at its deck.
//   node games/dead-drop/tools/daily.mjs --from 2026-10-21 --days 60
//   node games/dead-drop/tools/daily.mjs --from 2026-10-21 --days 3 --sim 3 --rounds 1000 --samples 8
// --sim N plays the first N dates' setups (Heron, as seat 0's bot A, against the day's rival at --samples) through
// tools/sim/play.mjs and prints per date: rounds, seat 0's win rate, each featured agent's win% when played and the
// featured city's "winner took the round", all with 95% margins. One process, so run it at `nice -n 19`.
import { dailyKey, dailyOperation } from '../js/daily.js';
import { AGENT, CITY } from '../js/data.js';
import { resolveConfig } from './sim/config.mjs';
import { playBatch } from './sim/play.mjs';
import { mergeStats, summarize, margin } from './sim/stats.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
};
const from = opt('from', dailyKey());
const days = Number(opt('days', 60));
const simDays = Number(opt('sim', 0));
const rounds = Number(opt('rounds', 1000));
const samples = opt('samples', null);

const dateAt = (i) => {
  const [y, m, d] = from.split('-').map(Number);
  return dailyKey(new Date(y, m - 1, d + i));
};
const pad = (s, n) => String(s).padEnd(n);
const pm = (pct, m) => (pct === null ? 'n/a' : `${pct.toFixed(1)} ±${m.toFixed(1)}`);

console.log(`Dead Drop daily schedule from ${from}, ${days} days`);
console.log(`${pad('date', 11)}${pad('rival', 15)}${pad('featured agents', 28)}${pad('city', 19)}operation`);
const keys = [];
for (let i = 0; i < days; i++) {
  const key = dateAt(i);
  keys.push(key);
  const d = dailyOperation(key);
  const agents = d.featured.agents.map((id) => AGENT[id].name).join(' + ');
  console.log(`${pad(key, 11)}${pad(d.rival.name, 15)}${pad(agents, 28)}${pad(CITY[d.featured.city].name, 19)}${d.operation.name}`);
}

for (const key of keys.slice(0, simDays)) {
  const d = dailyOperation(key);
  const config = resolveConfig({ name: key, seed: `sim:${key}`, setup: `daily:${key}`, a: 'heron', samples });
  let stats = null;
  let i = 0;
  while (!stats || stats.rounds < rounds) {
    const { stats: part } = playBatch(config, i, 20);
    stats = stats ? mergeStats(stats, part) : part;
    i += 20;
  }
  const s = summarize(stats);
  console.log(`\n${key}  Mr Heron (seat 0's bot) vs ${d.rival.name}: ${s.matches} matches, ${s.rounds} rounds, ${s.roundsPerMatch.mean.toFixed(2)} rounds a match`);
  console.log(`  seat 0 won ${pm(s.seat0Matches.pct, s.seat0Matches.margin)}% of matches; Heron (bot A) won ${pm(s.aMatchWins.pct, s.aMatchWins.margin)}%`);
  for (const id of d.featured.agents) {
    const a = s.agents[id];
    console.log(`  ${pad(AGENT[id].name, 14)} win% when played ${pm(a.winPlayed, a.winPlayedMargin)} (played ${a.played}, in the roster ${s.inRoster[id]} rounds)`);
  }
  const c = s.cities[d.featured.city];
  const pct = c.decided ? (100 * c.agrees) / c.decided : null;
  console.log(`  ${pad(CITY[d.featured.city].name, 14)} winner took the round ${pm(pct, margin(c.agrees, c.decided))} (in ${c.n} rounds, ${c.decided} decided)`);
}
