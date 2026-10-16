#!/usr/bin/env node
// Whole-run simulator: bots play full runs (rounds + shopping) against the real targets.
//   node games/press-run/tools/runsim.mjs [runs=60]
// Vocabulary size stands in for skill: a human under a little pressure finds roughly what a
// bot with a few thousand common words finds.
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { prepareCandidates, bestPlays } from '../js/solver.js';
import { DINGBAT_BY_ID, DINGBAT_SLOTS, EDITIONS_TO_WIN } from '../js/data.js';

const ROOT = new URL('../../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').split('\n').filter(Boolean);
const dict = new Set(read('shared/words/dictionary.txt'));
const common = read('shared/words/common.txt');
const RUNS = Number(process.argv[2]) || 60;
const BOTS = { casual: 4000, decent: 10000, sharp: 25000 };
const RANK = { rare: 3, uncommon: 2, common: 1 };

function shop(run) {
  // Buy the best dingbats we can afford, then upgrades for the lengths we play most, then inks.
  for (let pass = 0; pass < 3; pass++) {
    const offers = run.shop.offers.map((o, i) => ({ o, i })).filter(({ o }) => !o.sold && o.cost <= run.money);
    const dings = offers.filter(({ o }) => o.type === 'dingbat').sort((a, b) => RANK[DINGBAT_BY_ID[b.o.id].rarity] - RANK[DINGBAT_BY_ID[a.o.id].rarity]);
    if (dings.length && run.dingbats.length < DINGBAT_SLOTS) {
      E.buy(run, dings[0].i);
      continue;
    }
    if (dings.length && run.dingbats.length >= DINGBAT_SLOTS) {
      const weakest = run.dingbats.find((d) => RANK[DINGBAT_BY_ID[d.id].rarity] < RANK[DINGBAT_BY_ID[dings[0].o.id].rarity]);
      if (weakest) {
        E.sell(run, weakest.uid);
        E.buy(run, dings[0].i);
        continue;
      }
    }
    const up = offers.find(({ o }) => o.type === 'upgrade' && o.length >= 4 && o.length <= 6);
    if (up) {
      E.buy(run, up.i);
      continue;
    }
    const ink = offers.find(({ o }) => ['magenta', 'cyan', 'gold', 'emboss'].includes(o.id));
    if (ink) {
      const picks = run.caseIds.filter((id) => !run.tiles[id].ink && 'eaiorst'.includes(run.tiles[id].letter)).slice(0, 2);
      E.buy(run, ink.i, picks.slice(0, ink.o.id === 'gold' ? 1 : 2));
      continue;
    }
    break;
  }
  E.leaveShop(run);
}

function playRun(seed, cands) {
  const run = E.createRun(seed);
  E.chooseStarter(run, run.starter[0]);
  for (let guard = 0; guard < 200; guard++) {
    if (run.phase === 'round') {
      let [best] = bestPlays(run, E.handTiles(run), cands, { limit: 1 });
      if (run.round.redrawsLeft > 0 && (!best || best.word.length <= 4) && run.round.editor !== 'minimalist') {
        const keep = new Set(best?.uids || []);
        E.redraw(run, run.round.hand.filter((id) => !keep.has(id)));
        [best] = bestPlays(run, E.handTiles(run), cands, { limit: 1 });
      }
      if (!best) E.forfeit(run);
      else E.print(run, best.uids, best.letters, dict);
    } else if (run.phase === 'cleared') E.collect(run);
    else if (run.phase === 'shop') shop(run);
    else break;
  }
  return { edition: run.edition, round: run.roundIndex, won: run.phase === 'won', dingbats: run.dingbats.map((d) => d.id) };
}

for (const [name, size] of Object.entries(BOTS)) {
  const cands = prepareCandidates(common.slice(0, size));
  const reached = new Array(EDITIONS_TO_WIN + 2).fill(0);
  let wins = 0;
  const lostAt = {};
  for (let i = 0; i < RUNS; i++) {
    const r = playRun(`RUN-${name}-${i}`, cands);
    if (r.won) wins++;
    else {
      const key = `${r.edition}.${r.round + 1}`;
      lostAt[key] = (lostAt[key] || 0) + 1;
    }
    reached[r.won ? EDITIONS_TO_WIN + 1 : r.edition]++;
  }
  const where = Object.entries(lostAt).sort().map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(`${name.padEnd(7)} wins ${((wins / RUNS) * 100).toFixed(0).padStart(3)}%   lost at (edition.round) ${where}`);
}
