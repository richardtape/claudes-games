#!/usr/bin/env node
// Golden two-player replays (Phase 2a).
//   node games/dead-drop/tools/golden.mjs --record [--force]   write test/golden/*.json
//   node games/dead-drop/tools/golden.mjs --check [--matches 400] [--from 0]
// --check drives each match with the live modules and the frozen ones in test/golden/v1/ and compares
// step by step.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import * as E from '../js/engine.js';
import * as B from '../js/bot.js';
import * as V1E from '../test/golden/v1/engine.js';
import * as V1B from '../test/golden/v1/bot.js';
import { driveMatch, roundDigests, firstDiff, GOLDEN_SAMPLES } from '../test/golden/drive.mjs';
import { createTable } from '../js/session.js';
import { resolveConfig } from './sim/config.mjs';
import { playBatch } from './sim/play.mjs';
import { summarize } from './sim/stats.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
const val = (f, d) => (args.includes(`--${f}`) ? Number(args[args.indexOf(`--${f}`) + 1]) : d);
const DIR = new URL('../test/golden/', import.meta.url);
const file = (n) => new URL(n, DIR).pathname;

function record() {
  const files = ['two-player.json', 'v1-table.json', 'sim-2p.json'].map(file);
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
  const t = createTable({ seed: 'golden-save', names: ['Agent Fox', 'Mr Heron'] });
  const first = (seat) => t.view(seat).round.legal[0];
  t.act(0, { a: 'lock', ...first(0) });
  t.act(1, { a: 'lock', ...first(1) });
  t.act(0, { a: 'escalate' });
  t.act(1, { a: 'respond', accept: true });
  t.act(0, { a: 'lock', ...first(0) });
  writeFileSync(files[1], JSON.stringify(t.toJSON(), null, 1) + '\n');
  writeFileSync(files[2], JSON.stringify(summarize(playBatch(resolveConfig({ samples: 2, target: 4 }), 0, 6).stats), null, 1) + '\n');
  console.log(`recorded ${files.length} fixtures at ${commit} (table turn ${t.state.round.turn}, stake ${t.state.round.stake})`);
}

function check() {
  const n = val('matches', 400);
  const from = val('from', 0);
  let steps = 0;
  for (let i = from; i < from + n; i++) {
    const now = driveMatch(E, B, i);
    const then = driveMatch(V1E, V1B, i);
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
  console.error('usage: golden.mjs --record [--force] | --check [--matches N] [--from N]');
  process.exit(2);
}
