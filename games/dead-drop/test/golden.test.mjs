// Golden two-player replays: the Phase 2b-i reference for Classic two-player play.
// test/golden/two-player.json (per-round digests of 24 seeded bot matches, call by call) and
// test/golden/sim-2p.json (a short simulator run's summary) were recorded on the finished 2b-i
// engine (the stakes: tokens, answers, the pot, rollover, the Microfilm with a reel of 2).
// Phase 2b-ii's Classic play must keep them: a change that moves either is a two-player rules
// change and needs a design reason. Re-record only for one, with
//   node games/dead-drop/tools/golden.mjs --record --force
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import * as B from '../js/bot.js';
import { driveMatch, roundDigests } from './golden/drive.mjs';
import { resolveConfig } from '../tools/sim/config.mjs';
import { playBatch } from '../tools/sim/play.mjs';
import { summarize } from '../tools/sim/stats.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./golden/${name}`, import.meta.url), 'utf8'));

test('two-player replays match the recorded digests', () => {
  const g = fixture('two-player.json');
  for (const m of g.matches) assert.deepEqual(roundDigests(driveMatch(E, B, m.index, { samples: g.samples })), m.rounds, `match ${m.index}`);
});

test('two-player sim numbers match the recorded harness numbers', () => {
  const was = fixture('sim-2p.json');
  const now = summarize(playBatch(resolveConfig({ samples: 2, target: 4 }), 0, 6).stats);
  for (const key of Object.keys(was)) assert.deepEqual(now[key], was[key], key);
});
