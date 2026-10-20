import test from 'node:test';
import assert from 'node:assert/strict';
import { countMatch, countWin, MAX_COUNTED } from '../js/meta.js';

test('a match id counts once', () => {
  const meta = { matches: 0 };
  assert.equal(countMatch(meta, 'abcd1234'), true);
  assert.equal(countMatch(meta, 'abcd1234'), false);
  assert.equal(meta.matches, 1);
  assert.deepEqual(meta.counted, ['abcd1234']);
});

test('only the last 20 ids are remembered', () => {
  const meta = { matches: 0 };
  for (let i = 0; i < 25; i++) countMatch(meta, 'id' + i);
  assert.equal(MAX_COUNTED, 20);
  assert.equal(meta.counted.length, 20);
  assert.equal(meta.counted[0], 'id5');
  assert.equal(meta.matches, 25);
});

test('an online win counts once per match id, however often the finished match is reloaded', () => {
  const meta = { onlineWins: 2 };
  assert.equal(countWin(meta, 'win1'), true);
  assert.equal(countWin(meta, 'win1'), false);
  assert.equal(meta.onlineWins, 3);
  assert.equal(countWin(meta, 'win2'), true);
  assert.equal(meta.onlineWins, 4);
  assert.deepEqual(meta.wonIds, ['win1', 'win2']);
  for (let i = 0; i < 25; i++) countWin(meta, 'w' + i);
  assert.equal(meta.wonIds.length, MAX_COUNTED);
  assert.equal(meta.onlineWins, 29);
});

test('a win with no match id still counts (an old view), and an old meta starts its list', () => {
  const meta = {};
  assert.equal(countWin(meta, undefined), true);
  assert.equal(meta.onlineWins, 1);
  assert.deepEqual(meta.wonIds, []);
});

import { CODENAMES, RIVALS } from '../js/data.js';
import { META_VERSION, TOKEN_VERSION, meet, migrateMeta } from '../js/meta.js';

test('migrateMeta keeps the codename, token, rivals beaten and counts, cleans the rest and stamps v2', () => {
  const opts = { codenames: CODENAMES, rivals: RIVALS.map((r) => r.id), fresh: { codename: 'Agent Owl', token: 'ffffffffffffffff' } };
  const v1 = { v: 1, codename: 'Agent Fox', beaten: ['wren', 'magpie'], token: '0123456789abcdef', tokenV: 1, matches: 7, onlineWins: 2, counted: ['abcd1234'], wonIds: ['zzzz9999'], later: { x: 1 } };
  assert.deepEqual([META_VERSION, TOKEN_VERSION], [2, 1]);
  const met = { agents: [], cities: [], rivals: [] };
  assert.deepEqual(migrateMeta(v1, opts), { ...v1, v: 2, met });
  const clean = { v: 2, codename: 'Agent Owl', beaten: [], token: 'ffffffffffffffff', tokenV: 1, matches: 0, onlineWins: 0, counted: [], wonIds: [], met };
  assert.deepEqual(migrateMeta({}, opts), clean);
  assert.deepEqual(migrateMeta({ codename: '<b>Hi</b>', beaten: ['magpie', 'nobody', 'wren', 'wren'], token: 'short', tokenV: 1, matches: -3, onlineWins: 'x', counted: 'no', wonIds: [1] }, opts), { ...clean, beaten: ['wren', 'magpie'] });
});

test('a token from before PROTOCOL 5 (no tokenV) is replaced once: the new one is kept from then on', () => {
  const opts = { codenames: CODENAMES, rivals: RIVALS.map((r) => r.id), fresh: { codename: 'Agent Owl', token: 'ffffffffffffffff' } };
  const before = { v: 2, codename: 'Agent Fox', token: '0123456789abcdef', matches: 3 };
  const once = migrateMeta(before, opts);
  assert.deepEqual([once.token, once.tokenV, once.codename, once.matches], ['ffffffffffffffff', 1, 'Agent Fox', 3]);
  const again = migrateMeta(JSON.parse(JSON.stringify(once)), { ...opts, fresh: { codename: 'Agent Owl', token: 'eeeeeeeeeeeeeeee' } });
  assert.equal(again.token, 'ffffffffffffffff', 'rotated once, not on every load');
  assert.equal(migrateMeta({ ...once, tokenV: 0 }, { ...opts, fresh: { codename: 'Agent Owl', token: 'dddddddddddddddd' } }).token, 'dddddddddddddddd', 'any other issue is replaced too');
});

const metOpts = { codenames: CODENAMES, rivals: RIVALS.map((r) => r.id), fresh: { codename: 'Agent Owl', token: 'ffffffffffffffff' } };

test('meet returns only the new, non-Classic ids and records them; a second meeting returns nothing', () => {
  const meta = migrateMeta({}, metOpts);
  const seen = { agents: ['heavy', 'courier', 'blackmailer', 'courier', 'nobody'], cities: ['lisbon', 'tokyo', 'macau', 'moscow'], rivals: ['magpie'] };
  assert.deepEqual(meet(meta, seen), { agents: ['courier', 'blackmailer'], cities: ['tokyo', 'macau'], rivals: ['magpie'] });
  assert.deepEqual(meta.met, { agents: ['courier', 'blackmailer'], cities: ['tokyo', 'macau'], rivals: ['magpie'] });
  assert.deepEqual(meet(meta, seen), { agents: [], cities: [], rivals: [] });
  assert.deepEqual(meta.met, { agents: ['courier', 'blackmailer'], cities: ['tokyo', 'macau'], rivals: ['magpie'] });
  // Wren is a rival to meet like any other; Classic agents and cities never are new.
  assert.deepEqual(meet(meta, { agents: ['decoy', 'courier', 'sleeper'], rivals: ['wren'] }), { agents: ['decoy'], cities: [], rivals: ['wren'] });
  assert.deepEqual(meta.met, { agents: ['courier', 'blackmailer', 'decoy'], cities: ['tokyo', 'macau'], rivals: ['wren', 'magpie'] });
  assert.deepEqual(meet(meta), { agents: [], cities: [], rivals: [] });
  // A profile from before Phase 2b-ii (no met at all) starts its lists.
  const old = {};
  assert.deepEqual(meet(old, { cities: ['vienna', 'rome'] }), { agents: [], cities: ['rome'], rivals: [] });
  assert.deepEqual(old.met, { agents: [], cities: ['rome'], rivals: [] });
});

test('migrateMeta cleans met: known ids only, once each, missing lists filled', () => {
  const m = migrateMeta({ met: { agents: ['courier', 'nobody', 'courier', 7], cities: 'tokyo', rivals: ['control', 'boss', 'magpie'], later: 1 } }, metOpts);
  assert.deepEqual(m.met, { agents: ['courier'], cities: [], rivals: ['magpie', 'control'], later: 1 });
  assert.deepEqual(migrateMeta({ met: ['courier'] }, metOpts).met, { agents: [], cities: [], rivals: [] });
  assert.deepEqual(migrateMeta({ met: { rivals: ['wren'] } }, metOpts).met, { agents: [], cities: [], rivals: ['wren'] });
});
