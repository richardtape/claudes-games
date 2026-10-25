// Plays whole charters with the bot and reports company value at each Board meeting.
//   node games/penny-a-mile/tools/sim.mjs [--runs 20] [--skill 0.3,0.6,1] [--seed sim]
// Prints, per skill: the share of runs passing each Board, median value at each meeting, and
// the final value (1920) for runs that got there.
import * as E from '../js/engine.js';
import { createBot } from '../js/bot.js';
import { BOARD, YEAR } from '../js/data.js';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const runs = +arg('runs', 20);
const skills = arg('skill', '0.3,0.6,1').split(',').map(Number);
const seed = arg('seed', 'sim');

const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);
const k = (n) => (Number.isFinite(n) ? `£${Math.round(n / 1000)}k` : '-');

for (const skill of skills) {
  const atBoard = BOARD.map(() => []);
  const passed = BOARD.map(() => 0);
  const finals = [];
  const yearVals = Array.from({ length: 21 }, () => []);
  let trains = 0;
  let routes = 0;
  const t0 = Date.now();
  for (let r = 0; r < runs; r++) {
    const s = E.newGame(`${seed}-${r}`);
    const bot = createBot({ skill, seed: r + 1 });
    while (!s.over || s.hold) {
      if (s.hold) {
        const b = s.boards[s.boards.length - 1];
        const i = BOARD.findIndex((x) => x.year === b.year);
        if (i >= 0) {
          atBoard[i].push(b.value);
          if (b.pass) passed[i]++;
        }
        if (s.over) break;
        E.resume(s);
      }
      bot.think(s);
      E.step(s, 10);
      const y = Math.floor(s.day / YEAR);
      if (s.day % YEAR < 10) yearVals[y]?.push(E.companyValue(s));
    }
    if (s.over?.reason === 'final') finals.push(s.over.value);
    trains += s.trains.length;
    routes += s.services.length;
    if (r === 0) {
      const last = s.services.map((v) => (v.last ? v.last.income - v.last.cost : 0));
      const per = s.services.map((v) => s.trains.filter((t) => t.svc === v.id).length);
      console.log(`  run 0: services' profit last year ${k(last.reduce((a, b) => a + b, 0))}, per service ${last.map((x) => Math.round(x / 1000)).join(' ')}; trains ${per.join(' ')}`);
      const inc = s.last;
      if (inc) console.log(`  run 0 last year: income ${k(inc.income)} (${Object.entries(inc.cargo).map(([c, v]) => `${c} ${k(v)}`).join(', ')}), running ${k(inc.running)}, upkeep ${k(inc.upkeep)}, interest ${k(inc.interest)}`);
    }
  }
  console.log(`skill ${skill}: ${runs} runs in ${((Date.now() - t0) / 1000).toFixed(1)}s, avg ${(trains / runs).toFixed(1)} trains, ${(routes / runs).toFixed(1)} services at the end`);
  BOARD.forEach((b, i) => console.log(`  ${b.year} target ${k(b.target)}: passed ${passed[i]}/${atBoard[i].length}, median ${k(med(atBoard[i]))}, range ${k(Math.min(...atBoard[i]))}–${k(Math.max(...atBoard[i]))}`));
  console.log(`  1920 final: ${finals.length} runs, median ${k(med(finals))}`);
  console.log(`  value by year: ${yearVals.map((v, y) => (v.length ? `${1900 + y}:${k(med(v))}` : '')).filter(Boolean).join(' ')}`);
}
