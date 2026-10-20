#!/usr/bin/env node
// Points by roster (plan Risk 1, SIMLOG B30): do an agent and a city pay in points more than their round-win
// rates show? Replays a sim run's matches from its saved configuration and reports points per round with and
// without the agent in the roster and the city dealt, and each one's share of the rounds and of the points;
// then, for every agent, the rounds per match of the run's matches with and without it in the roster.
//
//   node games/dead-drop/tools/points-by-roster.mjs --from FILE [--run base] [--rounds 10000] [--agent blackmailer]
//        [--city macau] [--workers 4]
//
// --from is a sim summary JSON (tools/baselines/*.json, or .tmp/dead-drop-sim/<run>.json) and --run picks one
// of its configurations. Matches replay through tools/sim/play.mjs's playMatch with that configuration (seed,
// bots and samples, roster, setup, twist, --set patches), so match i here is match i of the run. (The sim's
// .jsonl batch log can't stand in: it keeps merged stats per batch, not matches.) Like sim.mjs, it plays
// batches of BATCH matches and keeps the shortest in-order prefix that reaches --rounds, so the numbers don't
// depend on --workers.
//
// Definitions:
// - A round's points are its `result.points`: what the round's winner scores (twice the stake plus the pot,
//   plus Macau's extra; the pot after a fold; 0 for a dead heat). Monaco's +1 is not in them. Points per round
//   count every round, folds included, as the sim's "points/round" does.
// - ± on a mean is 1.96 × SD / √n over rounds (stats.mjs's histMean), as if rounds were independent; they
//   cluster in matches, so it is a little narrow. ± on a share is the 95% margin of a proportion.
// - The agent "played, to the flip": a (round, seat) where the seat dropped the agent (as its drop or as a
//   partner) and no fold ended the round. Its share of the rounds is the seat's round wins over those; its
//   share of the points is the points the seat won over all the points those rounds paid.
// - The city "held at the flip": a round no fold ended, with the city dealt and won by one seat
//   (`cityWinners`; a tie or an empty city holds nothing). Shares as for the agent, for the city's winner.
// - Rosters: every match of the run (its own count), with the roster drawn alone (roster.js's matchOptions on
//   the seed `<seed>:<index>:setup`, as playMatch draws it, no play), against the rounds each agent was in a
//   roster (the run's `summary.inRoster`).
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AGENT, AGENTS, CITY } from '../js/data.js';
import { matchOptions } from '../js/roster.js';
import { createRng } from '../../../shared/rng.js';
import { BATCH, setupOf, withPatches } from './sim/config.mjs';
import { playMatch } from './sim/play.mjs';

/** The few fields this tool reads from a batch of match records. */
function playRecords(config, start, count, agent, city) {
  return withPatches(config.set, () => {
    const out = [];
    for (let i = start; i < start + count; i++) {
      const rec = playMatch(config, i);
      out.push({
        inRoster: rec.roster.includes(agent),
        rounds: rec.rounds.map((r) => {
          const res = r.result;
          const ci = r.cities.indexOf(city);
          return {
            points: res.points,
            winner: res.winner,
            folded: res.folded !== null,
            dealt: ci >= 0,
            holder: ci >= 0 && res.cityWinners ? res.cityWinners[ci] : null,
            played: r.played.map((p) => p.some((x) => x.kind === agent)),
          };
        }),
      });
    }
    return out;
  });
}

if (!isMainThread) {
  parentPort.on('message', ({ id, config, start, count, agent, city }) => parentPort.postMessage({ id, records: playRecords(config, start, count, agent, city) }));
} else {
  const o = { from: null, run: 'base', rounds: '10000', agent: 'blackmailer', city: 'macau', workers: '4' };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].slice(2);
    if (!argv[i].startsWith('--') || !(key in o) || argv[i + 1] === undefined) throw new Error(`bad option: ${argv[i]}`);
    o[key] = argv[++i];
  }
  if (!o.from) throw new Error('--from FILE is required');
  if (!AGENT[o.agent]) throw new Error(`unknown agent: ${o.agent}`);
  if (!CITY[o.city]) throw new Error(`unknown city: ${o.city}`);
  const saved = JSON.parse(readFileSync(resolve(o.from), 'utf8'));
  const run = saved.runs?.[o.run];
  if (!run) throw new Error(`${o.from} has no run "${o.run}"`);
  const { config } = run;
  const need = Number(o.rounds);
  const workers = Math.max(1, Number(o.workers));

  // ---- play: batches in order, the shortest prefix reaching `need` rounds ----
  const t0 = Date.now();
  const batches = [];
  let next = 0, prefix = 0, have = 0, done = false;
  const advance = () => {
    while (!done && batches[prefix]) {
      have += batches[prefix].reduce((n, m) => n + m.rounds.length, 0);
      prefix++;
      if (have >= need) done = true;
    }
  };
  const pool = Array.from({ length: workers }, () => new Worker(new URL(import.meta.url)));
  try {
    await Promise.all(pool.map((w) => new Promise((ok, fail) => {
      let id = -1;
      const feed = () => {
        if (done) return ok();
        id = next++;
        w.postMessage({ id, config, start: id * BATCH, count: BATCH, agent: o.agent, city: o.city });
      };
      w.on('message', (m) => {
        batches[m.id] = m.records;
        advance();
        feed();
      });
      w.on('error', fail);
      feed();
    })));
  } finally {
    await Promise.all(pool.map((w) => w.terminate()));
  }
  const seconds = (Date.now() - t0) / 1000;
  const matches = batches.slice(0, prefix).flat();
  const rounds = matches.flatMap((m) => m.rounds.map((r) => ({ ...r, inRoster: m.inRoster })));

  // ---- report ----
  const mean = (xs) => {
    const n = xs.length;
    if (!n) return 'n/a';
    const mu = xs.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / n);
    return `${mu.toFixed(2)} ±${((1.96 * sd) / Math.sqrt(n)).toFixed(2)} (${n} rounds)`;
  };
  const share = (k, n) => (n ? `${((100 * k) / n).toFixed(1)}% ±${(196 * Math.sqrt(((k / n) * (1 - k / n)) / n)).toFixed(1)}` : 'n/a');
  const pts = (rs) => mean(rs.map((r) => r.points));
  const aName = AGENT[o.agent].name, cName = CITY[o.city].name;
  const L = [];
  L.push(`${matches.length} matches, ${rounds.length} rounds of ${o.from} (${o.run}) in ${seconds.toFixed(1)} s (${(rounds.length / Math.max(seconds, 0.001)).toFixed(0)} rounds/s), ${workers} workers`);
  L.push('', `Points per round, ${aName} in the roster: ${pts(rounds.filter((r) => r.inRoster))}`);
  L.push(`Points per round, ${aName} not in the roster: ${pts(rounds.filter((r) => !r.inRoster))}`);
  let n = 0, won = 0, ptsWon = 0, ptsAll = 0;
  for (const r of rounds) {
    if (r.folded) continue;
    r.played.forEach((p, seat) => {
      if (!p) return;
      n++;
      ptsAll += r.points;
      if (r.winner === seat) (won++, (ptsWon += r.points));
    });
  }
  L.push(`${aName} played, to the flip: ${n} seat-rounds; the seat took ${share(won, n)} of them and ${ptsAll ? ((100 * ptsWon) / ptsAll).toFixed(1) : 'n/a'}% of the points they paid`);
  L.push('', `Points per round, ${cName} dealt: ${pts(rounds.filter((r) => r.dealt))}`);
  L.push(`Points per round, ${cName} not dealt: ${pts(rounds.filter((r) => !r.dealt))}`);
  let h = 0, hw = 0, hPts = 0, hAll = 0;
  for (const r of rounds) {
    if (r.folded || r.holder === null) continue;
    h++;
    hAll += r.points;
    if (r.winner === r.holder) (hw++, (hPts += r.points));
  }
  L.push(`${cName} held at the flip: ${h} rounds; its holder took ${share(hw, h)} of them and ${hAll ? ((100 * hPts) / hAll).toFixed(1) : 'n/a'}% of the points they paid`);

  // ---- rosters: every match of the run, roster draws only ----
  const counts = Object.fromEntries(AGENTS.map((a) => [a.id, 0]));
  const nSeats = config.bots.length;
  withPatches(config.set, () => {
    for (let i = 0; i < run.matches; i++) {
      const rotation = i % nSeats;
      const { roster } = matchOptions(setupOf(config), createRng(`${config.seed}:${i}:setup`), (nSeats + 1 - rotation) % nSeats);
      for (const id of roster) counts[id]++;
    }
  });
  const inRoster = run.summary.inRoster;
  L.push('', `Rosters of all ${run.matches} matches (${run.rounds} rounds): matches holding the agent, and rounds per match with and without it`);
  for (const a of AGENTS) {
    const k = counts[a.id];
    if (!k) continue;
    const without = run.matches - k ? ((run.rounds - inRoster[a.id]) / (run.matches - k)).toFixed(2) : 'n/a';
    L.push(`  ${a.name.padEnd(14)} ${String(k).padStart(5)}  ${(inRoster[a.id] / k).toFixed(2).padStart(5)}  ${without.padStart(5)}`);
  }
  console.log(L.join('\n'));
}
