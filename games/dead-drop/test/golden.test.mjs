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
import * as V2E from './golden/v2/engine.js';
import * as V2B from './golden/v2/bot.js';
import { driveMatch, roundDigests, firstDiff, project, NEW_KEYS } from './golden/drive.mjs';
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
  for (const key of Object.keys(was)) {
    if (key !== 'agents' && key !== 'cities') {
      assert.deepEqual(now[key], was[key], key);
      continue;
    }
    // The fixture keys the Classic 12 and 11; the stats now key all 20 and 20, and a Classic run never deals the rest.
    for (const id of Object.keys(was[key])) assert.deepEqual(now[key][id], was[key][id], `${key}.${id}`);
    for (const id of Object.keys(now[key])) if (!(id in was[key])) assert.equal(key === 'agents' ? now[key][id].played : now[key][id].n, 0, `${key}.${id} in a Classic run`);
  }
});

test('the projection changes nothing on a 2b-i match', () => {
  for (const step of driveMatch(V2E, V2B, 3)) {
    for (const k of NEW_KEYS) assert.ok(!step.json.includes(`"${k}":`), `2b-i already uses "${k}": rename it in NEW_KEYS and in this phase`);
    assert.equal(JSON.stringify(project(JSON.parse(step.json))), step.json);
  }
});

test('Classic two-player play matches the frozen 2b-i engine after every call', () => {
  for (let i = 0; i < 8; i++) {
    const now = driveMatch(E, B, i);
    const then = driveMatch(V2E, V2B, i);
    for (let k = 0; k < Math.max(now.length, then.length); k++) {
      if (now[k]?.json === then[k]?.json) continue;
      const where = now[k] ? `${now[k].call} by seat ${now[k].seat}, round ${now[k].round} turn ${now[k].turn}` : 'past the end';
      assert.fail(`match ${i} step ${k} (${where}): ${now[k] && then[k] ? firstDiff(JSON.parse(now[k].json), JSON.parse(then[k].json)) : 'different number of steps'}`);
    }
  }
});
