#!/usr/bin/env node
// Flies whole flights with the bot pilot at several skills and reports what tuning needs:
// crosses reached and their distances, photos are not flown (the bot has no camera), landing
// quality, propane left, flight length and when first light came.
//
//   node games/first-light/tools/sim.mjs [--n 60] [--skills 0.3,0.6,0.9] [--set burnHeat=0.06,cool=0.01]
import { createFlight, step, K, scoreOf } from '../js/engine.js';
import { createPilot } from '../js/bot.js';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => s.trim().split(/\s+/)));
const n = Number(args.n ?? 60);
const skills = (args.skills ?? '0.3,0.6,0.9').split(',').map(Number);
for (const kv of (args.set ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  K[k] = Number(v);
}

const pct = (a, b) => `${((100 * a) / Math.max(1, b)).toFixed(0)}%`;
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const q = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
};

for (const skill of skills) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const f = createFlight({ seed: 1000 + i });
    const pilot = createPilot({ skill, seed: 77 + i });
    while (f.phase !== 'landed' && f.t < 900) step(f, pilot.act(f));
    const dropped = f.crosses.filter((c) => c.result);
    rows.push({
      score: scoreOf(f).total,
      reached: dropped.length,
      ds: dropped.map((c) => c.result.d),
      pts: dropped.reduce((s, c) => s + c.result.points, 0),
      t: f.t,
      fuel: f.landing?.fuel ?? f.b.fuel,
      quality: f.landing?.quality ?? 'none',
      surface: f.landing?.surface ?? 'none',
      lit: f.sun.litAt,
      first: !!f.firstLight,
      bumps: f.bumps,
      maxAlt: f.maxAlt,
    });
  }
  const ds = rows.flatMap((r) => r.ds);
  const qual = {};
  const surf = {};
  for (const r of rows) {
    qual[r.quality] = (qual[r.quality] ?? 0) + 1;
    surf[r.surface] = (surf[r.surface] ?? 0) + 1;
  }
  console.log(`\nskill ${skill}  (${n} flights)`);
  console.log(`  score       mean ${mean(rows.map((r) => r.score)).toFixed(0)}  p10 ${q(rows.map((r) => r.score), 0.1)}  p90 ${q(rows.map((r) => r.score), 0.9)}`);
  console.log(`  crosses     mean reached ${mean(rows.map((r) => r.reached)).toFixed(2)} of 3  all three ${pct(rows.filter((r) => r.reached === 3).length, n)}  none ${pct(rows.filter((r) => r.reached === 0).length, n)}`);
  console.log(`  distance    median ${q(ds, 0.5).toFixed(1)} m  p25 ${q(ds, 0.25).toFixed(1)}  p75 ${q(ds, 0.75).toFixed(1)}  bullseyes ${pct(ds.filter((d) => d <= 3).length, ds.length)}  marker pts mean ${mean(rows.map((r) => r.pts)).toFixed(0)}`);
  console.log(`  flight      mean ${mean(rows.map((r) => r.t)).toFixed(0)} s  p10 ${q(rows.map((r) => r.t), 0.1).toFixed(0)}  p90 ${q(rows.map((r) => r.t), 0.9).toFixed(0)}  propane left ${mean(rows.map((r) => r.fuel)).toFixed(0)}%  max alt ${mean(rows.map((r) => r.maxAlt)).toFixed(0)} m`);
  console.log(`  first light airborne ${pct(rows.filter((r) => r.first).length, n)} at ${mean(rows.filter((r) => r.lit !== null).map((r) => r.lit)).toFixed(0)} s   bumps ${mean(rows.map((r) => r.bumps)).toFixed(2)}`);
  console.log(`  landing     ${Object.entries(qual).map(([k, v]) => `${k} ${pct(v, n)}`).join('  ')}   on ${Object.entries(surf).map(([k, v]) => `${k} ${pct(v, n)}`).join('  ')}`);
}
