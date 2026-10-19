#!/usr/bin/env node
// Golden two-player replays.
//   node games/dead-drop/tools/golden.mjs --record [--force]   write test/golden/two-player.json and sim-2p.json
// test/golden/v1-table.json (a table saved by the Phase 1 build) is a fixed fixture: never re-recorded.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import * as E from '../js/engine.js';
import * as B from '../js/bot.js';
import { driveMatch, roundDigests, GOLDEN_SAMPLES } from '../test/golden/drive.mjs';
import { resolveConfig } from './sim/config.mjs';
import { playBatch } from './sim/play.mjs';
import { summarize } from './sim/stats.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
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
  console.log(`recorded ${files.length} fixtures at ${commit}`);
}

if (has('record')) record();
else {
  console.error('usage: golden.mjs --record [--force]');
  process.exit(2);
}
