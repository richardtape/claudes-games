#!/usr/bin/env node
// Balancing simulator: plays rounds with a bot that always prints the best word it knows.
//   node games/press-run/tools/sim.mjs [rounds=300]
// "good" bot knows the 25k most common words; "expert" knows the whole dictionary.
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { prepareCandidates, bestPlays } from '../js/solver.js';
import { roundTarget } from '../js/data.js';

const ROOT = new URL('../../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').split('\n').filter(Boolean);
const dictWords = read('shared/words/dictionary.txt');
const dict = new Set(dictWords);
const common = read('shared/words/common.txt').slice(0, 25000);
const BOTS = { good: prepareCandidates(common), expert: prepareCandidates(dictWords) };
const N = Number(process.argv[2]) || 300;

function playRound(run, cands, { useRedraws = true } = {}) {
  run.round.target = Infinity;
  while (run.round.printsLeft > 0) {
    let [best] = bestPlays(run, E.handTiles(run), cands, { limit: 1 });
    if (useRedraws && run.round.redrawsLeft > 0 && (!best || best.word.length <= 4)) {
      const keep = new Set(best?.uids || []);
      E.redraw(run, run.round.hand.filter((id) => !keep.has(id)));
      [best] = bestPlays(run, E.handTiles(run), cands, { limit: 1 });
    }
    if (!best) {
      E.forfeit(run);
      continue;
    }
    E.print(run, best.uids, best.letters, dict);
  }
  return run.round.score;
}

const BUILDS = {
  none: [],
  starter: ['fleuron'],
  mid: ['fleuron', 'longarm', 'hedera'],
  strong: ['pencil', 'longarm', 'hedera', 'masterpiece', 'dropcap'],
};

function stats(xs) {
  xs.sort((a, b) => a - b);
  const q = (p) => xs[Math.floor(p * (xs.length - 1))];
  return { p10: q(0.1), median: q(0.5), p90: q(0.9), mean: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) };
}

for (const [botName, cands] of Object.entries(BOTS)) {
  for (const [buildName, ids] of Object.entries(BUILDS)) {
    const totals = [];
    const lens = [];
    for (let i = 0; i < N; i++) {
      const run = E.createRun(`SIM-${botName}-${i}`);
      E.chooseStarter(run, run.starter[0]);
      run.dingbats = ids.map((id, k) => ({ uid: 5000 + k, id, counter: 0 }));
      E.startRound(run);
      totals.push(playRound(run, cands));
      lens.push(...run.round.words.map((w) => w.word.length));
    }
    const s = stats(totals);
    const avgLen = (lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(1);
    console.log(`${botName.padEnd(6)} ${buildName.padEnd(7)} round total p10 ${s.p10}  median ${s.median}  p90 ${s.p90}   avg word ${avgLen} letters`);
  }
  if (botName === 'good' && N > 100) continue;
}

console.log('\nCurrent targets:');
for (let e = 1; e <= 6; e++) console.log(`  edition ${e}: ${[0, 1, 2].map((r) => roundTarget(e, r)).join(' / ')}`);
