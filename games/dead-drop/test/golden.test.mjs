import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import * as B from '../js/bot.js';
import * as V1E from './golden/v1/engine.js';
import * as V1B from './golden/v1/bot.js';
import { driveMatch, roundDigests, firstDiff } from './golden/drive.mjs';
import { restoreTable } from '../js/session.js';
import { resolveConfig } from '../tools/sim/config.mjs';
import { playBatch } from '../tools/sim/play.mjs';
import { summarize } from '../tools/sim/stats.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./golden/${name}`, import.meta.url), 'utf8'));

test('two-player replays match the frozen Phase 1 engine after every call', () => {
  for (let i = 0; i < 8; i++) {
    const now = driveMatch(E, B, i);
    const then = driveMatch(V1E, V1B, i);
    for (let k = 0; k < Math.max(now.length, then.length); k++) {
      if (now[k]?.json === then[k]?.json) continue;
      const where = now[k] ? `${now[k].call} by seat ${now[k].seat}, round ${now[k].round} turn ${now[k].turn}` : 'past the end';
      assert.fail(`match ${i} step ${k} (${where}): ${now[k] && then[k] ? firstDiff(JSON.parse(now[k].json), JSON.parse(then[k].json)) : 'different number of steps'}`);
    }
  }
});

test('two-player replays match the recorded digests', () => {
  const g = fixture('two-player.json');
  for (const m of g.matches) assert.deepEqual(roundDigests(driveMatch(E, B, m.index, { samples: g.samples })), m.rounds, `match ${m.index}`);
});

test('a table saved by the Phase 1 build restores, looks the same and plays to the end', () => {
  const saved = fixture('v1-table.json');
  const t = restoreTable(structuredClone(saved));
  for (const s of [0, 1, -1]) assert.equal(JSON.stringify(E.viewFor(t.state, s)), JSON.stringify(V1E.viewFor(structuredClone(saved.state), s)), `seat ${s}`);
  for (let guard = 0; t.state.phase !== 'match-over' && guard < 5000; guard++) {
    const S = t.state;
    if (S.phase === 'round-over') [0, 1].forEach((seat) => t.act(seat, { a: 'next' }));
    else if (S.round.pending) t.act(1 - S.round.pending.by, { a: 'respond', accept: true });
    else for (const seat of [0, 1]) if (!S.round.plans[seat]) t.act(seat, { a: 'lock', ...t.view(seat).round.legal[0] });
  }
  assert.equal(t.state.phase, 'match-over');
});

test('two-player sim numbers match the Phase 1 harness', () => {
  const was = fixture('sim-2p.json');
  const now = summarize(playBatch(resolveConfig({ samples: 2, target: 4 }), 0, 6).stats);
  for (const key of Object.keys(was)) assert.deepEqual(now[key], was[key], key);
});
