import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';

const deal = (s) => JSON.stringify([s.round.hands, s.round.cities.map((c) => c.id), s.round.film]);

test('an unseeded match carries 128 bits of RNG state and no seed', () => {
  const s = E.newMatch({ seed: null });
  assert.equal(s.seed, null);
  assert.ok(Array.isArray(s.rng) && s.rng.length === 4);
  assert.ok(s.rng.every((x) => Number.isInteger(x) && x >= 0 && x < 2 ** 32));
  assert.ok(s.rng.some((x) => x !== 0));
  assert.equal(E.newMatch().seed, null, 'the default is unseeded');
});

test('unseeded matches differ; a seeded match is as before', () => {
  const deals = new Set(Array.from({ length: 20 }, () => deal(E.newMatch({ seed: null }))));
  assert.equal(deals.size, 20);
  assert.equal(deal(E.newMatch({ seed: 7 })), deal(E.newMatch({ seed: 7 })));
  assert.equal(typeof E.newMatch({ seed: 7 }).rng, 'number');
  assert.equal(typeof E.newMatch({ seed: 'dd:1' }).rng, 'number');
});

test('the array state replays: a clone deals the same next round, and the state moves on', () => {
  const a = E.newMatch({ seed: null, seats: 3 });
  const b = structuredClone(a);
  const before = a.rng.slice();
  for (const s of [a, b]) {
    s.phase = 'round-over';
    E.nextRound(s);
  }
  assert.equal(deal(a), deal(b));
  assert.deepEqual(a.rng, b.rng);
  assert.notDeepEqual(a.rng, before);
});

test('xoshiro output is well spread', () => {
  const s = E.newMatch({ seed: null });
  const seen = new Set();
  let sum = 0;
  for (let i = 0; i < 10000; i++) {
    const v = E.rint(s, 1e9);
    seen.add(v);
    sum += v / 1e9;
  }
  assert.ok(seen.size > 9990);
  assert.ok(Math.abs(sum / 10000 - 0.5) < 0.02);
});
