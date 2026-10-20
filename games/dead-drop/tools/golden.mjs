#!/usr/bin/env node
// Golden two-player replays.
//   node games/dead-drop/tools/golden.mjs --record [--force] [--table]   write test/golden/two-player.json and sim-2p.json
//   node games/dead-drop/tools/golden.mjs --check [--matches 400] [--from 0]
// --check drives each match with the live modules and the frozen 2b-i ones in test/golden/v2/ and compares
// step by step (both projected through NEW_KEYS).
// test/golden/v1-table.json (a table saved by the Phase 1 build) and v2-table.json (one saved by the 2b-i
// build) are fixed fixtures: v2-table.json is written only when missing, or with --table.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import * as E from '../js/engine.js';
import * as B from '../js/bot.js';
import * as V2E from '../test/golden/v2/engine.js';
import * as V2B from '../test/golden/v2/bot.js';
import { driveMatch, roundDigests, firstDiff, GOLDEN_SAMPLES } from '../test/golden/drive.mjs';
import { createTable } from '../js/session.js';
import { resolveConfig } from './sim/config.mjs';
import { playBatch } from './sim/play.mjs';
import { summarize } from './sim/stats.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
const val = (f, d) => (has(f) ? Number(args[args.indexOf(`--${f}`) + 1]) : d);
const DIR = new URL('../test/golden/', import.meta.url);
const file = (n) => new URL(n, DIR).pathname;

function record() {
  const files = ['two-player.json', 'sim-2p.json'].map(file);
  if (!has('force') && files.some(existsSync)) {
    console.error('Fixtures exist; pass --force to overwrite.');
    process.exit(1);
  }
  mkdirSync(file('.'), { recursive: true });
  const commit = execSync('git rev-parse --short HEAD', { cwd: new URL('.', import.meta.url).pathname }).toString().trim();
  const matches = [];
  for (let index = 0; index < 24; index++) {
    const steps = driveMatch(E, B, index);
    const s = JSON.parse(steps.at(-1).json).state;
    matches.push({ index, rounds: roundDigests(steps), scores: s.scores, winner: s.winner ?? null });
  }
  writeFileSync(files[0], JSON.stringify({ commit, samples: GOLDEN_SAMPLES, matches }, null, 1) + '\n');
  writeFileSync(files[1], JSON.stringify(summarize(playBatch(resolveConfig({ samples: 2, target: 4 }), 0, 6).stats), null, 1) + '\n');
  let table = 'kept v2-table.json';
  if (has('table') || !existsSync(file('v2-table.json'))) {
    const t = createTable({ seed: 'golden-save', names: ['Agent Fox', 'Mr Heron'] });
    t.matchId = 'v2table0';
    const first = (seat) => t.view(seat).round.legal[0];
    t.act(0, { a: 'lock', ...first(0) });
    t.act(1, { a: 'lock', ...first(1) });
    t.act(0, { a: 'escalate' });
    t.act(1, { a: 'respond', accept: true });
    t.act(0, { a: 'lock', ...first(0) });
    writeFileSync(file('v2-table.json'), JSON.stringify(t.toJSON(), null, 1) + '\n');
    table = `wrote v2-table.json (turn ${t.state.round.turn}, stake ${t.state.round.stake})`;
  }
  console.log(`recorded ${files.length} fixtures at ${commit}; ${table}`);
}

function check() {
  const n = val('matches', 400);
  const from = val('from', 0);
  let steps = 0;
  for (let i = from; i < from + n; i++) {
    const now = driveMatch(E, B, i);
    const then = driveMatch(V2E, V2B, i);
    for (let k = 0; k < Math.max(now.length, then.length); k++) {
      if (now[k]?.json === then[k]?.json) continue;
      const s = now[k] ?? then[k];
      const d = now[k] && then[k] ? firstDiff(JSON.parse(now[k].json), JSON.parse(then[k].json)) : 'different number of steps';
      console.log(`match ${i} round ${s.round} turn ${s.turn} step ${k} (${s.call} by seat ${s.seat}): ${d}`);
      process.exit(1);
    }
    steps += now.length;
    if ((i - from + 1) % 50 === 0) console.log(`... ${i - from + 1} matches`);
  }
  console.log(`identical: ${n} matches, ${steps} steps`);
}

if (has('record')) record();
else if (has('check')) check();
else {
  console.error('usage: golden.mjs --record [--force] [--table] | --check [--matches N] [--from N]');
  process.exit(2);
}
