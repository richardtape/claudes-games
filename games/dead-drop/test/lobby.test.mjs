import test from 'node:test';
import assert from 'node:assert/strict';
import { createLobby, sit, away, resize, fill, unfill, canStart, start, seatOf, publicLobby, setTimer } from '../js/lobby.js';
import { RIVALS } from '../js/data.js';

const host = { name: 'Agent Fox', token: 'h'.repeat(16) };
const g = (i) => ({ name: ['Agent Owl', 'Agent Pike', 'Agent Lynx', 'Agent Moth'][i], token: String(i).repeat(16) });

test('four open seats by default; guests sit in order, tokens come back to their seat, extras spectate', () => {
  const L = createLobby({ host });
  assert.equal(L.seats.length, 4);
  assert.deepEqual([sit(L, g(0)), sit(L, g(1)), sit(L, g(2))], [1, 2, 3]);
  assert.equal(sit(L, g(3)), -1, 'the table is full: a spectator');
  assert.equal(sit(L, g(1)), 2, 'a known token keeps its seat');
  away(L, g(1).token);
  assert.equal(L.seats[2].kind, 'empty', 'before start a seat that goes quiet is free again');
  assert.equal(sit(L, g(3)), 2);
  assert.deepEqual(publicLobby(L).seats.map((s) => s.kind), ['host', 'guest', 'guest', 'guest']);
  assert.ok(!JSON.stringify(publicLobby(L)).includes(host.token));
});

test('resize never cuts a taken seat; fill seats bots from the ladder in order', () => {
  const L = createLobby({ host, size: 2 });
  assert.equal(canStart(L), false);
  sit(L, g(0));
  assert.equal(resize(L, 1), false);
  assert.ok(resize(L, 4));
  fill(L);
  assert.deepEqual(L.seats.slice(2).map((s) => s.rival), [RIVALS[0].id, RIVALS[1].id]);
  assert.ok(canStart(L));
  unfill(L);
  assert.deepEqual(L.seats.slice(2).map((s) => s.kind), ['empty', 'empty']);
  assert.ok(resize(L, 2));
  assert.equal(L.seats.length, 2);
});

test('start plays with the taken seats only, renumbered, and keeps the tokens for reconnects', () => {
  const L = createLobby({ host, timer: 30000 });
  sit(L, g(0));
  resize(L, 4);
  fill(L);
  unfill(L);
  sit(L, g(1));
  away(L, g(1).token);
  const S = start(L);
  assert.deepEqual([S.seats, S.names, S.bots, S.tokens], [2, ['Agent Fox', 'Agent Owl'], [], [host.token, g(0).token]]);
  assert.equal(L.started, true);
  assert.equal(sit(L, g(1)), -1, 'after the start a newcomer is a spectator');
  assert.equal(sit(L, g(0)), 1);
  assert.equal(seatOf(L, g(0).token), 1);
  assert.equal(resize(L, 3), false);
  assert.throws(() => start(L));
});

test('a bot’s seat is never given away, and start with bots names them', () => {
  const L = createLobby({ host, size: 3 });
  fill(L);
  const S = start(L);
  assert.deepEqual(S.bots.map((b) => b.seat), [1, 2]);
  assert.equal(S.names[1], RIVALS[0].name);
  assert.equal(sit(L, g(0)), -1);
  setTimer(L, 10000);
  assert.equal(L.timer, 0, 'settings are frozen once started');
});
