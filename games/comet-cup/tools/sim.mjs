#!/usr/bin/env node
// How hard is par? Bots of three aim skills play holes from the bank; reports mean strokes
// against par per tier and how often each skill makes par or better.
//
//   node games/comet-cup/tools/sim.mjs              # 8 holes per tier, 3 runs each
//   node games/comet-cup/tools/sim.mjs --holes 20 --runs 4
import { createRng } from '../../../shared/rng.js';
import { BANK } from '../js/bank.js';
import { playHole, SKILLS } from '../js/bot.js';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? Number(args[args.indexOf(`--${n}`) + 1]) : d);
const HOLES = opt('holes', 8);
const RUNS = opt('runs', 3);
const rng = createRng('sim');

for (const tier of [1, 2, 3, 4]) {
  const pool = rng.shuffle(BANK.filter((h) => h.tier === tier)).slice(0, HOLES);
  const par = pool.reduce((s, h) => s + h.par, 0) / pool.length;
  const line = [`tier ${tier}  par ${par.toFixed(2)}`];
  for (const [name, skill] of Object.entries(SKILLS)) {
    let total = 0;
    let atPar = 0;
    let n = 0;
    for (const h of pool) {
      for (let r = 0; r < RUNS; r++) {
        const s = playHole(h, skill, rng);
        total += s;
        if (s <= h.par) atPar++;
        n++;
      }
    }
    line.push(`${name} ${(total / n).toFixed(2)} (par or better ${Math.round((atPar / n) * 100)}%)`);
  }
  console.log(line.join('   '));
}
