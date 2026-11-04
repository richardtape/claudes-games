#!/usr/bin/env node
// Plays whole Touch Paper shows with the bot and reports how far each skill gets.
//
//   node games/touch-paper/tools/sim.mjs [--n 400] [--skills 0.3,0.6,0.9]
//        [--targets 70,190,360,600,900] [--finale 10] [--free]   (--free: ignore targets, play all 5 acts)
//
// Reports per skill: share of shows that pass each act, mean cumulative total at each act's
// end (when played), clear rate per layout, volley length, best volley, named-shell rates.
import { ACTS, choosePerk, legalPlays, newShow, nextAct, play, playHand, strike, tune, TARGETS, targetFor } from '../js/engine.js';
import { chooseMove, choosePerkFor } from '../js/bot.js';
import { LAYOUTS, SHELLS } from '../js/data.js';
import { createRng } from '../../../shared/rng.js';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const N = Number(opt('n', 400));
const skills = opt('skills', '0.3,0.6,0.9').split(',').map(Number);
const free = args.includes('--free');
if (opt('targets')) tune({ targets: opt('targets').split(',').map(Number) });
if (opt('finale')) tune({ finale: Number(opt('finale')) });
if (opt('window')) tune({ window: Number(opt('window')) });
if (opt('handplay')) tune({ handPlay: opt('handplay') === '1' });
if (opt('handcost')) (await import('../js/bot.js')).setHandCost(Number(opt('handcost')));

function runShow(seed, skill) {
  const s = newShow({ seed });
  const rng = createRng(`bot|${seed}|${skill}`);
  const r = () => rng.next();
  const acts = [];
  let guard = 0;
  while (s.phase !== 'over' && s.phase !== 'won') {
    if (++guard > 10000) throw new Error('stuck');
    if (s.phase === 'play') {
      const m = chooseMove(s, { skill, rng: r });
      if (m.kind === 'play') play(s, m.slot);
      else if (m.kind === 'hand') playHand(s, m.k);
      else strike(s, { slow: m.slow, pick: m.pick || 0 });
    } else if (s.phase === 'report') {
      const rep = s.report;
      acts.push({ ...rep, volleys: s.log.filter((v) => v.act === rep.act) });
      if (free && rep.outcome === 'over') {
        if (rep.act === ACTS - 1) {
          s.phase = 'over';
          break;
        }
        s.report.outcome = 'shed';
      }
      nextAct(s);
    } else if (s.phase === 'shed') choosePerk(s, choosePerkFor(s, { skill, rng: r }));
  }
  return { s, acts };
}

const pct = (x) => `${(100 * x).toFixed(0)}%`.padStart(4);
for (const skill of skills) {
  const t0 = Date.now();
  const passed = Array(ACTS).fill(0);
  const reached = Array(ACTS).fill(0);
  const totals = Array.from({ length: ACTS }, () => []);
  const actScores = Array.from({ length: ACTS }, () => []);
  const cleared = Array(ACTS).fill(0);
  const finalePts = Array(ACTS).fill(0);
  let volleys = 0;
  let shells = 0;
  const bestVolleys = [];
  const shellHits = {};
  const finalTotals = [];
  for (let i = 0; i < N; i++) {
    const { s, acts } = runShow(`sim-${i}`, skill);
    finalTotals.push(s.total);
    bestVolleys.push(s.stats.best ? s.stats.best.cards.length : 0);
    for (const a of acts) {
      reached[a.act]++;
      if (a.passed) passed[a.act]++;
      totals[a.act].push(a.total);
      actScores[a.act].push(a.actScore);
      if (a.cleared) cleared[a.act]++;
      finalePts[a.act] += a.finale.points;
      for (const v of a.volleys) {
        volleys++;
        shells += v.cards.length;
        for (const p of v.patterns) shellHits[p] = (shellHits[p] || 0) + 1;
      }
    }
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const q = (a, p) => {
    const b = a.slice().sort((x, y) => x - y);
    return b.length ? b[Math.floor(p * (b.length - 1))] : 0;
  };
  console.log(`\nskill ${skill}  (${N} shows, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  console.log('act  layout              reach  pass  clear  act score (mean, p10-p90)   total mean  target  finale/act');
  for (let a = 0; a < ACTS; a++) {
    const tg = targetFor({ twists: [] }, a);
    console.log(
      `${a + 1}    ${LAYOUTS[a].name.padEnd(20)} ${pct(reached[a] / N)}  ${pct(passed[a] / N)}  ${pct(cleared[a] / Math.max(1, reached[a]))}   ` +
        `${mean(actScores[a]).toFixed(0).padStart(5)} (${q(actScores[a], 0.1)}-${q(actScores[a], 0.9)})`.padEnd(26) +
        `   ${mean(totals[a]).toFixed(0).padStart(6)} (p25 ${q(totals[a], 0.25)}, p50 ${q(totals[a], 0.5)})   ${String(TARGETS[a]).padStart(5)}   ${(finalePts[a] / Math.max(1, reached[a])).toFixed(0)}`,
    );
    void tg;
  }
  console.log(`won ${pct(passed[ACTS - 1] / N)}   mean volley ${(shells / volleys).toFixed(2)} shells   best volley median ${q(bestVolleys, 0.5)}, p90 ${q(bestVolleys, 0.9)}   final total median ${q(finalTotals, 0.5)}`);
  console.log(
    'named shells per 100 volleys: ' +
      SHELLS.map((x) => `${x.name} ${((100 * (shellHits[x.id] || 0)) / volleys).toFixed(1)}`).join(', '),
  );
}
