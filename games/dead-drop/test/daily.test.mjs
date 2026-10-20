import test from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_EPOCH, dailyKey, dailyId, dailyOperation, dailyResult, NEW_AGENTS, NEW_CITIES } from '../js/daily.js';
import { DECK, CLASSIC_CITIES, RIVALS } from '../js/data.js';
import { createTable } from '../js/session.js';
import * as E from '../js/engine.js';

test('the day is the local date, its id eight digits', () => {
  assert.equal(dailyKey(new Date(2026, 9, 21, 23, 59)), '2026-10-21');
  assert.equal(dailyId('2026-10-21'), '20261021');
  assert.match(dailyId('2026-10-21'), /^[a-z0-9]{8}$/);
});

test('the day’s operation is the same every time, Classic plus two new agents and one new city, a set rival, no twist', () => {
  const d1 = dailyOperation('2026-10-21');
  const d2 = dailyOperation('2026-10-21');
  assert.deepEqual(d1, d2);
  assert.equal(NEW_AGENTS.length, 8);
  assert.equal(NEW_CITIES.length, 9);
  assert.equal(d1.setup.agents.length, DECK.length + 2);
  assert.ok(d1.featured.agents.every((id) => NEW_AGENTS.includes(id)) && d1.featured.agents[0] !== d1.featured.agents[1]);
  assert.ok(NEW_CITIES.includes(d1.featured.city));
  assert.deepEqual(d1.setup.cities, [...CLASSIC_CITIES, d1.featured.city]);
  assert.deepEqual(d1.setup.feature, [d1.featured.city]);
  assert.equal(d1.setup.twist, null);
  assert.equal(d1.setup.mixed, false);
  assert.ok(RIVALS.includes(d1.rival));
  assert.equal(d1.seed, 'daily:2026-10-21');
  assert.equal(d1.matchId, '20261021');
  assert.equal(typeof d1.operation.name, 'string');
  assert.ok(Object.isFrozen(d1) && Object.isFrozen(d1.setup) && Object.isFrozen(d1.setup.agents));
  const days = Array.from({ length: 60 }, (_, i) => dailyOperation(dailyKey(new Date(2026, 9, 21 + i))));
  assert.ok(new Set(days.map((d) => d.rival.id)).size === 5, 'sixty days meet every rival');
  assert.ok(new Set(days.map((d) => d.featured.agents.join())).size > 20);
});

test('two browsers playing the day deal the same cards every round, whatever a Getaway did', () => {
  const d = dailyOperation('2026-10-21');
  const mk = () => createTable({ seed: d.seed, setup: d.setup, names: ['You', d.rival.name], fixedDeals: true });
  const a = mk();
  const b = mk();
  assert.deepEqual(a.state.roster, b.state.roster);
  assert.equal(a.state.round.cities.some((c) => c.id === d.featured.city), true, 'round 1 deals the featured city');
  a.state.rng = (a.state.rng + 999) >>> 0;
  for (const t of [a, b]) { t.state.phase = 'round-over'; E.nextRound(t.state); }
  assert.deepEqual(a.state.round.hands, b.state.round.hands);
  assert.deepEqual(a.state.round.cities.map((c) => c.id), b.state.round.cities.map((c) => c.id));
});

test('dailyResult reads the margin and how the match ended', () => {
  const s = E.newMatch({ seed: 1 });
  Object.assign(s, { phase: 'match-over', winner: 0, winBy: 'points', scores: [11, 6], history: [1, 2, 3, 4, 5] });
  assert.deepEqual(dailyResult(s, 0), { margin: 5, won: true, by: 'points', rounds: 5 });
  assert.deepEqual(dailyResult(s, 1), { margin: -5, won: false, by: 'points', rounds: 5 });
  assert.throws(() => dailyResult(E.newMatch({ seed: 1 }), 0));
  const t = E.newMatch({ seed: 1, seats: 3 });
  Object.assign(t, { phase: 'match-over', winner: 2, winBy: 'points', scores: [4, 9, 11], history: [1, 2] });
  assert.equal(dailyResult(t, 2).margin, 2, 'against the best other score');
  assert.equal(dailyResult(t, 0).margin, -7);
  assert.equal(dailyResult(t, 0).won, false);
});

test('no agent and no city is featured two days running (400 days), whatever order the days are asked in', () => {
  assert.equal(DAILY_EPOCH, '2026-10-01');
  const key = (i) => dailyKey(new Date(2026, 9, 21 + i));
  const first = Array.from({ length: 400 }, (_, i) => dailyOperation(key(i)));
  for (let i = 1; i < first.length; i++) {
    const [p, d] = [first[i - 1].featured, first[i].featured];
    assert.ok(!d.agents.some((a) => p.agents.includes(a)), `agents repeat on ${key(i)}`);
    assert.notEqual(d.city, p.city, `city repeats on ${key(i)}`);
  }
  for (const i of [399, 5, 200, 0, 5, 77]) assert.deepEqual(dailyOperation(key(i)), first[i]);
});

test('a key before the epoch still draws, and a far date is quick', () => {
  const old = dailyOperation('2026-09-15');
  assert.deepEqual(old, dailyOperation('2026-09-15'));
  assert.equal(old.featured.agents.length, 2);
  const t = performance.now();
  dailyOperation('2027-10-21');
  dailyOperation('2028-10-21');
  assert.ok(performance.now() - t < 200);
});
