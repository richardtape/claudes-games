#!/usr/bin/env node
// Times the bot's think() on mid-round positions, per seat count and rival.
//
//   node games/dead-drop/tools/think-time.mjs [--positions 30] [--rivals heron,control] [--seats 2,3,4] [--json]
//
// Position k at n seats: newMatch({ seed: `think:n:k`, seats: n }) after k % 6 turns of random legal play,
// seen by seat k % n (skipped if the round is over). Times are milliseconds on this machine.
import { performance } from 'node:perf_hooks';
import * as E from '../js/engine.js';
import { think } from '../js/bot.js';
import { RIVALS } from '../js/data.js';
import { createRng } from '../../../shared/rng.js';

const o = { positions: '30', rivals: 'heron,control', seats: '2,3,4' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const key = argv[i].slice(2);
  if (key === 'json') o.json = true;
  else if (key in o) o[key] = argv[++i];
  else throw new Error(`unknown option: ${argv[i]}`);
}
const positions = Number(o.positions);
const seatCounts = o.seats.split(',').map(Number);
const rivals = o.rivals.split(',').map((id) => RIVALS.find((r) => r.id === id) ?? (() => { throw new Error(`unknown rival: ${id}`); })());

function position(n, k) {
  const tag = `think:${n}:${k}`;
  const state = E.newMatch({ seed: tag, seats: n });
  const rng = createRng(tag);
  for (let t = 0; t < k % 6 && state.phase === 'plan'; t++) {
    for (let seat = 0; seat < n; seat++) {
      const drops = E.legalDrops(state, seat);
      E.lock(state, seat, drops.length ? rng.pick(drops) : { pass: true });
    }
    E.resolveTurn(state);
  }
  return state.phase === 'plan' ? E.viewFor(state, k % n) : null;
}

const rows = [];
for (const seats of seatCounts) {
  const views = Array.from({ length: positions }, (_, k) => position(seats, k)).filter(Boolean);
  for (const rival of rivals) {
    const rng = createRng(`think-time:${seats}:${rival.id}`);
    const ms = views.map((view) => {
      const t0 = performance.now();
      think(view, { samples: rival.samples, noise: rival.noise, rng });
      return performance.now() - t0;
    }).sort((a, b) => a - b);
    const r = (x) => Math.round(x * 100) / 100;
    rows.push({ seats, rival: rival.id, samples: rival.samples, positions: ms.length,
      mean: r(ms.reduce((t, x) => t + x, 0) / ms.length), p95: r(ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))]), max: r(ms[ms.length - 1]) });
  }
}
if (o.json) console.log(JSON.stringify(rows));
else {
  console.log('seats rival    samples positions   mean    p95    max  (ms)');
  for (const r of rows) console.log(`${String(r.seats).padEnd(5)} ${r.rival.padEnd(8)} ${String(r.samples).padStart(7)} ${String(r.positions).padStart(9)} ${String(r.mean).padStart(6)} ${String(r.p95).padStart(6)} ${String(r.max).padStart(6)}`);
}
