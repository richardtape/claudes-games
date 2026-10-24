#!/usr/bin/env node
// Plays whole weeks with the kitchen bot to tune rent, patience and arrivals.
//
//   node games/sushi-raft/tools/sim.mjs                     # 40 weeks at skills 0.4, 0.6, 0.8, 1.0
//   node games/sushi-raft/tools/sim.mjs --weeks 100 --skill 0.6 --summer 2
//   node games/sushi-raft/tools/sim.mjs --nights            # per-night detail
//   node games/sushi-raft/tools/sim.mjs --rent 1.2          # rent scaled; --greedy buys everything
//
// Reports, per skill: how often the week is survived, the night it ends on, average takings per
// night against the rent, and how many customers huff off. The bot plays both otters (as a solo
// player or a pair would); market policy: buy the dishes offered, then upgrades, keeping half of
// tomorrow's rent in the purse.
import * as E from '../js/engine.js';
import { createBot, playNight } from '../js/bot.js';
import { NIGHTS } from '../js/data.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const weeks = opt('weeks', 40);
const summer = opt('summer', 1);
const skills = args.includes('--skill') ? [opt('skill', 0.8)] : [0.4, 0.6, 0.8, 1.0];
const perNight = args.includes('--nights');

const rentScale = opt('rent', 1);
// --rent 1.2 tries dearer rent without editing data.js.
for (const N of NIGHTS) N.rent = Math.round(N.rent * rentScale);
const policy = args.includes('--greedy') ? 'greedy' : 'balanced';
/** greedy: buy everything affordable, dishes first. balanced: one dish a morning, then upgrades. */
function shop(st) {
  const reserve = 0.5 * E.rentFor(st);
  const order = st.offers.map((o, i) => ({ o, i })).sort((a, b) => (a.o.kind === b.o.kind ? E.offerCost(a.o) - E.offerCost(b.o) : a.o.kind === 'dish' ? -1 : 1));
  let dishes = 0;
  for (const { o, i } of order) {
    if (policy === 'balanced' && o.kind === 'dish' && dishes >= 1) continue;
    if (st.purse - E.offerCost(o) >= reserve && E.buy(st, i) && o.kind === 'dish') dishes++;
  }
}

for (const skill of skills) {
  const nights = NIGHTS.map(() => ({ n: 0, takings: 0, rent: 0, served: 0, huffs: 0, away: 0, failed: 0, plates: 0 }));
  let won = 0;
  let earned = 0;
  const reached = [];
  const t0 = Date.now();
  for (let w = 0; w < weeks; w++) {
    const st = E.newWeek({ seed: `sim-${w}`, summer });
    const bot = createBot({ otters: [0, 1], skill, seed: w + 1 });
    while (st.phase !== 'over') {
      if (st.phase === 'morning') {
        shop(st);
        E.openNight(st);
      }
      const h = playNight(st, bot);
      const N = nights[h.night];
      N.n++;
      N.takings += h.takings;
      N.rent += h.rent;
      N.served += h.served;
      N.huffs += h.huffs;
      N.away += h.away;
      N.plates += h.plates.length;
      if (!h.paid) N.failed++;
      E.toMorning(st);
    }
    if (st.result === 'won') won++;
    earned += st.earned;
    reached.push(st.history.length);
  }
  const pct = (x) => `${((100 * x) / weeks).toFixed(0)}%`;
  console.log(`\nskill ${skill} (${policy}): survived ${pct(won)} of ${weeks} weeks (summer ${summer}), mean week ${(earned / weeks).toFixed(0)} coins, ${((Date.now() - t0) / weeks).toFixed(0)} ms/week`);
  console.log('  night       played  takings  rent  plates  served  huffs  away  failed');
  nights.forEach((N, i) => {
    if (!N.n) return;
    const a = (x) => (x / N.n).toFixed(1).padStart(6);
    console.log(`  ${NIGHTS[i].name.padEnd(10)} ${String(N.n).padStart(6)} ${a(N.takings)}  ${a(N.rent)} ${a(N.plates)} ${a(N.served)} ${a(N.huffs)} ${a(N.away)}  ${pct(N.failed).padStart(5)}`);
  });
  if (perNight) console.log('  nights reached:', reached.join(' '));
}
