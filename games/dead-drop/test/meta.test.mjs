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
import { META_VERSION, migrateMeta } from '../js/meta.js';

test('migrateMeta keeps the codename, token, rivals beaten and counts, cleans the rest and stamps v2', () => {
  const opts = { codenames: CODENAMES, rivals: RIVALS.map((r) => r.id), fresh: { codename: 'Agent Owl', token: 'ffffffffffffffff' } };
  const v1 = { v: 1, codename: 'Agent Fox', beaten: ['wren', 'magpie'], token: '0123456789abcdef', matches: 7, onlineWins: 2, counted: ['abcd1234'], wonIds: ['zzzz9999'], later: { x: 1 } };
  assert.equal(META_VERSION, 2);
  assert.deepEqual(migrateMeta(v1, opts), { ...v1, v: 2 });
  const clean = { v: 2, codename: 'Agent Owl', beaten: [], token: 'ffffffffffffffff', matches: 0, onlineWins: 0, counted: [], wonIds: [] };
  assert.deepEqual(migrateMeta({}, opts), clean);
  assert.deepEqual(migrateMeta({ codename: '<b>Hi</b>', beaten: ['magpie', 'nobody', 'wren', 'wren'], token: 'short', matches: -3, onlineWins: 'x', counted: 'no', wonIds: [1] }, opts), { ...clean, beaten: ['wren', 'magpie'] });
});
