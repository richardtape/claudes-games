import test from 'node:test';
import assert from 'node:assert/strict';
import { createTable, attachBot, hostSession, guestSession, restoreTable } from '../js/session.js';
import { createMemoryPair } from '../../../shared/net.js';
import { RIVALS } from '../js/data.js';
import { createRng } from '../../../shared/rng.js';

const until = async (cond, ms = 4000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 2));
  }
};

test('host and guest play a turn over the network; the guest sees only its own view', async () => {
  const { a, b, connect } = createMemoryPair();
  const table = createTable({ seed: 9, cities: ['berlin', 'monaco', 'tangier'], names: ['Agent Fox', 'Rival'] });
  const statuses = [];
  hostSession({ room: a, table, onStatus: (s) => statuses.push(s) });
  let view = null;
  const guest = guestSession({ room: b, name: 'Agent Lynx', token: 't1', onView: (v) => (view = v) });
  connect();
  await until(() => view);
  assert.deepEqual(statuses, ['joined']);
  assert.equal(view.seat, 1);
  assert.equal(view.names[1], 'Agent Lynx');

  // Host drops its Sleeper face down; guest drops whatever it holds first.
  const S = table.state;
  const sleeper = Object.values(S.round.cards).find((c) => c.origin === 0 && c.kind === 'sleeper').uid;
  if (!S.round.hands[0].includes(sleeper)) {
    const i = S.round.decks[0].indexOf(sleeper);
    S.round.decks[0][i] = S.round.hands[0].shift();
    S.round.hands[0].push(sleeper);
  }
  table.touch();
  assert.ok(table.act(0, { a: 'lock', uid: sleeper, city: 0 }));
  await until(() => view.round.rivalLocked);
  const mine = view.round.hand[0].uid;
  assert.ok(guest.act({ a: 'lock', uid: mine, city: 2 }));
  await until(() => view.turnSeq === 1);
  assert.equal(view.round.turn, 2);
  assert.equal(view.round.cities[0].sides[0][0].kind, null, 'the host’s Sleeper stays hidden from the guest');
  assert.ok(view.round.events.some((e) => e.t === 'drop' && e.seat === 0 && e.kind === null));
});

test('a third browser is turned away; the same guest can come back', async () => {
  const table = createTable({ seed: 4 });
  const hostRoom = { peers: new Set(), handlers: {}, sent: [], on(t, cb) { this.handlers[t] = cb; }, send(type, data, to) { this.sent.push({ type, data, to }); }, leave() {} };
  const statuses = [];
  hostSession({ room: hostRoom, table, onStatus: (s) => statuses.push(s) });
  hostRoom.peers.add('g1');
  hostRoom.handlers.hello({ v: 1, name: 'Agent Owl', token: 'tok' }, 'g1');
  hostRoom.peers.add('g2');
  hostRoom.handlers.hello({ v: 1, name: 'Agent Pike', token: 'other' }, 'g2');
  assert.deepEqual(hostRoom.sent.filter((m) => m.to === 'g2').map((m) => m.type), ['nope']);
  hostRoom.peers.delete('g1');
  hostRoom.onPeerLeave('g1');
  hostRoom.peers.add('g3');
  hostRoom.handlers.hello({ v: 1, name: 'Agent Owl', token: 'tok' }, 'g3');
  assert.deepEqual(statuses, ['joined', 'left', 'back']);
  assert.equal(table.names[1], 'Agent Owl');
});

test('a saved host table restores and keeps playing', () => {
  const table = createTable({ seed: 5 });
  table.act(0, { a: 'lock', ...table.view(0).round.legal[0] });
  const copy = restoreTable(JSON.parse(JSON.stringify(table.toJSON())));
  assert.ok(copy.act(1, { a: 'lock', ...copy.view(1).round.legal[0] }));
  assert.equal(copy.state.round.turn, 2);
});

test('a computer rival plays a whole match against a random player', async () => {
  const table = createTable({ seed: 21, target: 6 });
  const rng = createRng(3);
  const bot = attachBot(table, 1, { ...RIVALS[1], samples: 3 }, { pace: 0, rng: createRng(8) });
  const human = () => {
    const v = table.view(0);
    if (v.phase === 'plan') {
      if (v.round.pending && v.round.pending.by === 1) table.act(0, { a: 'respond', accept: rng.chance(0.8) });
      else if (!v.round.plan && v.round.legal.length) table.act(0, { a: 'lock', ...rng.pick(v.round.legal) });
    } else if (v.phase === 'round-over' && !v.ready[0]) table.act(0, { a: 'next' });
  };
  table.onChange(() => setTimeout(human, 0));
  human();
  await until(() => table.state.phase === 'match-over', 20000);
  bot.stop();
  assert.ok(table.state.scores[table.state.winner] >= 6);
});
