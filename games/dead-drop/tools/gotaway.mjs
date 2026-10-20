#!/usr/bin/env node
// The one that got away on bot matches: does every round replay as played, how often is a line found, what
// does it cost (Phase 4, tools/SIMLOG.md B46).
//
//   node games/dead-drop/tools/gotaway.mjs --matches 300 [--samples 8] [--seats 2] [--roster classic|mixed] [--seed dd] [--parallel 4] [--out file]
//
// Match m is a table, createTable({ seed: `${seed}:${m}`, seats, setup }) (Classic, or Mixed from all 20 agents and
// cities), with Mr Heron at --samples in every seat (attachBot, pace 0, rng createRng(`${seed}:${m}:${seat}`),
// tapWait 50), played to match-over; --parallel tables at a time on the one thread. The table records its own
// rounds, as in play. At each round's end the tool takes the table's record and checks it:
// - replayed as played (replayRound), every round that went to the flip must reach the round's result and scores;
// - gotAway() for every seat, worked out again from the record, must equal the table's lines.
// The first failure of either is printed and the tool exits 1. The second also times the work the table does at a
// round's end (every seat's gotAway, all rounds; the table itself skips the winner and rounds with a fold, so this
// is an upper bound on its work): ms per round. Lost seat-rounds are the seats other than the winner of a round won
// at the flip; eligible ones are those in which nobody folded (Decision 2). Kinds: city only (the same card and
// partner to another city), the same card with another partner (any city) or another face (in Casablanca), card
// changed (another card to the same city), or both (another card to another city).
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { attachBot, createTable } from '../js/session.js';
import { gotAway, gotAwayText, replayRound } from '../js/replay.js';
import { RIVALS } from '../js/data.js';
import { CLASSIC_SETUP, MIXED_ALL } from '../js/roster.js';
import { createRng } from '../../../shared/rng.js';

const o = { matches: '300', samples: '8', seats: '2', roster: 'classic', seed: 'dd', parallel: '4', out: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const key = argv[i].slice(2);
  if (!argv[i].startsWith('--') || !(key in o)) throw new Error(`unknown option: ${argv[i]}`);
  o[key] = argv[++i];
}
if (o.roster !== 'classic' && o.roster !== 'mixed') throw new Error(`--roster must be classic or mixed, got ${o.roster}`);
const matches = Number(o.matches);
const samples = Number(o.samples);
const seats = Number(o.seats);
const parallel = Math.max(1, Number(o.parallel));
const setup = o.roster === 'mixed' ? MIXED_ALL : CLASSIC_SETUP;
const heron = { ...RIVALS.find((r) => r.id === 'heron'), samples };

const stats = { rounds: 0, flipRounds: 0, replayed: 0, foldRounds: 0, lost: 0, eligible: 0, found: 0, byTurn: [0, 0, 0, 0, 0, 0], kinds: { cityOnly: 0, partnerOrFace: 0, cardOnly: 0, both: 0 }, roundMs: [], sentences: [] };
let failure = null;

/** The checks at one round's end: `rec` is the table's record of the round that just ended. */
function roundEnded(t, rec, m) {
  const S = t.state;
  const res = S.round.result;
  const where = `match ${m} (seed ${o.seed}:${m}), round ${S.roundNo}`;
  stats.rounds++;
  if (S.round.folded.some(Boolean)) stats.foldRounds++;
  if (!rec) return void (failure ??= `${where}: no record`);
  if (res.folded === null) {
    stats.flipRounds++;
    const again = replayRound(rec);
    if (!again || JSON.stringify(again.round.result) !== JSON.stringify(res) || JSON.stringify(again.scores) !== JSON.stringify(S.scores)) {
      failure ??= `${where}: the record replays to ${again ? JSON.stringify({ result: again.round.result, scores: again.scores }) : 'nothing'}, the round ended ${JSON.stringify({ result: res, scores: S.scores })}`;
      return;
    }
    stats.replayed++;
  }
  const t0 = performance.now();
  const lines = S.scores.map((_, s) => gotAway(rec, s, { result: res }));
  stats.roundMs.push(performance.now() - t0);
  if (JSON.stringify(lines) !== JSON.stringify(t.gotAway.seats)) return void (failure ??= `${where}: the table's lines ${JSON.stringify(t.gotAway.seats)}, worked out again ${JSON.stringify(lines)}`);
  if (res.folded !== null || res.winner === null) return;
  const cityIds = S.round.cities.map((c) => c.id);
  lines.forEach((g, s) => {
    if (s === res.winner) return;
    stats.lost++;
    if (S.round.folded.some(Boolean)) return;
    stats.eligible++;
    if (!g) return;
    stats.found++;
    stats.byTurn[g.turn - 1]++;
    const sameCard = g.instead.uid === g.was.uid;
    const sameCity = g.instead.city === g.was.city;
    const samePartner = (g.instead.partner ?? null) === (g.was.partner ?? null);
    const sameFace = !!g.instead.down === !!g.was.down;
    const kind = !sameCard ? (sameCity ? 'cardOnly' : 'both') : !samePartner || (sameCity && !sameFace) ? 'partnerOrFace' : 'cityOnly';
    stats.kinds[kind]++;
    if (stats.sentences.length < 5) stats.sentences.push(`${where}, seat ${s}: ${gotAwayText(g, cityIds)}`);
  });
}

function playMatch(m) {
  const t = createTable({ seed: `${o.seed}:${m}`, seats, setup });
  let rec = null;
  let seen = null;
  return new Promise((resolve) => {
    let bots = [];
    const done = () => {
      bots.forEach((b) => b.stop());
      clearTimeout(guard);
      resolve();
    };
    const guard = setTimeout(() => ((failure ??= `match ${m}: no match-over after 300 s`), done()), 300000);
    t.onChange(() => {
      if (t.replay) rec = t.replay;
      if (t.gotAway && t.gotAway !== seen) {
        seen = t.gotAway;
        roundEnded(t, rec, m);
      }
      if (t.state.phase === 'match-over' || failure) done();
    });
    bots = Array.from({ length: seats }, (_, s) => attachBot(t, s, heron, { pace: 0, rng: createRng(`${o.seed}:${m}:${s}`), tapWait: 50 }));
  });
}

const started = performance.now();
let next = 0;
const lane = async () => {
  while (next < matches && !failure) await playMatch(next++);
};
await Promise.all(Array.from({ length: parallel }, lane));
if (failure) {
  console.error(`FAILED: ${failure}`);
  process.exit(1);
}

const pct = (k, n) => (n ? `${((100 * k) / n).toFixed(1)}% ±${(196 * Math.sqrt(((k / n) * (1 - k / n)) / n)).toFixed(1)}` : 'n/a');
const sorted = [...stats.roundMs].sort((a, b) => a - b);
const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))] : 0;
const mean = sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1);
let commit = null;
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: new URL('.', import.meta.url).pathname }).toString().trim();
} catch {}
const out = {
  commit,
  options: { matches, samples, seats, roster: o.roster, seed: o.seed, parallel },
  seconds: Math.round((performance.now() - started) / 1000),
  rounds: stats.rounds,
  flipRounds: stats.flipRounds,
  replayedAsPlayed: `${stats.replayed} of ${stats.flipRounds}`,
  roundsWithAFold: stats.foldRounds,
  lostSeatRounds: stats.lost,
  eligible: stats.eligible,
  found: stats.found,
  foundOfEligible: pct(stats.found, stats.eligible),
  foundOfLost: pct(stats.found, stats.lost),
  foundByTurn: stats.byTurn,
  kinds: stats.kinds,
  msPerRound: { mean: Number(mean.toFixed(2)), p95: Number(p95.toFixed(2)), max: Number((sorted.at(-1) ?? 0).toFixed(2)) },
  sentences: stats.sentences,
};
console.log(`${seats} seats, ${o.roster}, Heron at ${samples} samples, ${matches} matches, seed ${o.seed} (${out.seconds} s)`);
console.log(`rounds ${out.rounds}, flip rounds ${out.flipRounds}, replayed as played ${out.replayedAsPlayed}, rounds with a fold ${out.roundsWithAFold}`);
console.log(`lost seat-rounds ${out.lostSeatRounds}, eligible (nobody folded) ${out.eligible}, found ${out.found}: ${out.foundOfEligible} of eligible (${out.foundOfLost} of lost)`);
console.log(`found by turn 1-6: ${out.foundByTurn.join(' / ')}`);
console.log(`kinds: city only ${out.kinds.cityOnly}, same card with another partner or face ${out.kinds.partnerOrFace}, card changed ${out.kinds.cardOnly}, both ${out.kinds.both}`);
console.log(`ms per round (every seat's gotAway): mean ${out.msPerRound.mean}, p95 ${out.msPerRound.p95}, max ${out.msPerRound.max}`);
for (const line of out.sentences) console.log(`  ${line}`);
if (o.out) writeFileSync(o.out, JSON.stringify(out, null, 1) + '\n');
