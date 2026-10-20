import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENTS, CITIES, CLASSIC_CITIES, DECK, RIVALS, ROSTER, TWISTS } from '../js/data.js';
import { CLASSIC_SETUP, drawRoster, freeSetup, ladderSetup, matchOptions, MIXED_ALL, network } from '../js/roster.js';
import { createRng } from '../../../shared/rng.js';

const ALL = AGENTS.map((a) => a.id);
const ORDER = (ids) => ids.slice().sort((a, b) => ALL.indexOf(a) - ALL.indexOf(b));

test('20 agents and 20 cities; Classic is the first 12 and the first 11, unchanged', () => {
  assert.equal(AGENTS.length, 20);
  assert.equal(CITIES.length, 20);
  assert.deepEqual(DECK, ['heavy', 'sleeper', 'veteran', 'double', 'jammer', 'handler', 'mole', 'getaway', 'lookout', 'assassin', 'tripwire', 'impostor']);
  assert.deepEqual(CLASSIC_CITIES, CITIES.slice(0, 11).map((c) => c.id));
  const p = Object.fromEntries(AGENTS.map((a) => [a.id, a.power]));
  assert.deepEqual([p.wiretap, p.interrogator, p.bodyguard, p.accomplice, p.turncoat, p.courier, p.blackmailer, p.decoy], [1, 2, 2, 1, 0, 2, 2, 0]);
});

test('drawRoster: 12 in pool order, always Heavy and the musts, never without a takedown', () => {
  for (let i = 0; i < 200; i++) {
    const r = drawRoster(ALL, createRng(`r${i}`), { must: ['courier'] });
    assert.equal(r.length, ROSTER.size);
    assert.deepEqual(r, ORDER(r));
    assert.ok(r.includes('heavy') && r.includes('courier'));
    assert.ok(r.some((id) => ROSTER.takedowns.includes(id)));
  }
  assert.deepEqual(drawRoster(DECK, createRng(1)), DECK);
  assert.notDeepEqual(drawRoster(ALL, createRng(1)), drawRoster(ALL, createRng(2)));
  assert.throws(() => drawRoster(ALL.slice(0, 11), createRng(1)), /12/);
});

test('network: Classic plus the packs of beaten rivals', () => {
  assert.deepEqual(network([]), { agents: DECK, cities: CLASSIC_CITIES });
  const two = network(['wren', 'magpie']);
  assert.deepEqual(two.agents, [...DECK, 'courier', 'blackmailer']);
  assert.deepEqual(two.cities, [...CLASSIC_CITIES, 'tokyo', 'macau']);
  const all = network(RIVALS.map((r) => r.id));
  assert.deepEqual([all.agents.length, all.cities.length], [20, 20]);
});

test('ladder setups: Wren is Classic; each rival adds its own pack, features its cities and brings its twist', () => {
  assert.deepEqual(ladderSetup('wren'), CLASSIC_SETUP);
  const m = ladderSetup('magpie');
  assert.deepEqual([m.mixed, m.must, m.feature, m.twist], [true, ['courier', 'blackmailer'], ['tokyo', 'macau'], TWISTS.magpie]);
  assert.deepEqual(m.agents, [...DECK, 'courier', 'blackmailer']);
  const h = ladderSetup('heron');
  assert.ok(h.must.includes('sleeper') && h.agents.includes('courier') && h.cities.includes('macau'));
  const c = ladderSetup('control');
  assert.deepEqual([c.agents.length, c.cities.length, c.feature], [20, 20, ['prague', 'glienicke', 'geneva']]);
  assert.deepEqual(freeSetup(['wren', 'magpie']).twist, null);
  const o = matchOptions(ladderSetup('heron'), createRng(3), 1);
  assert.deepEqual(o.twist, { ...TWISTS.heron, seat: 1 });
  assert.ok(o.roster.includes('bodyguard') && o.roster.includes('decoy') && o.roster.includes('sleeper'));
  assert.deepEqual(matchOptions(CLASSIC_SETUP, createRng(3)), { roster: DECK, pool: CLASSIC_CITIES, feature: null, twist: null });
  assert.equal(matchOptions(MIXED_ALL, createRng(3)).pool.length, 20);
});
