import test from 'node:test';
import assert from 'node:assert/strict';
import { createTable, attachBot, hostSession, guestSession, restoreTable } from '../js/session.js';
import { createMemoryPair } from '../../../shared/net.js';
import { RIVALS } from '../js/data.js';
import { createRng } from '../../../shared/rng.js';
import * as E from '../js/engine.js';

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

test('every match has an id that survives a save and changes on a rematch', () => {
  const t = createTable({ seed: 3 });
  const id = t.view(0).matchId;
  assert.match(id, /^[a-z0-9]{8}$/);
  assert.equal(restoreTable(JSON.parse(JSON.stringify(t.toJSON()))).view(1).matchId, id);
  const old = JSON.parse(JSON.stringify(t.toJSON()));
  delete old.matchId;
  const r = restoreTable(old);
  assert.match(r.view(0).matchId, /^[a-z0-9]{8}$/);
  assert.equal(r.view(1).matchId, r.view(0).matchId, 'a pre-Phase-1 save gets one stable id');
  assert.notEqual(createTable({ seed: 3 }).view(0).matchId, id, 'same seed, different id');
  t.state.phase = 'match-over';
  t.act(0, { a: 'rematch' });
  t.act(1, { a: 'rematch' });
  assert.notEqual(t.view(0).matchId, id);
});

test('the host only accepts codenames from the list', () => {
  for (const [name, shown] of [['Agent Owl', 'Agent Owl'], ['<img src=x onerror=alert(1)>', 'Agent ?'], ['Agent Owl but longer', 'Agent ?']]) {
    const table = createTable({ seed: 4 });
    const room = { peers: new Set(['g']), handlers: {}, on(t, cb) { this.handlers[t] = cb; }, send() {}, leave() {} };
    hostSession({ room, table });
    room.handlers.hello({ v: 1, name, token: 't' }, 'g');
    assert.equal(table.names[1], shown);
  }
});

test('leaving says bye: the other side hears it once, not as a lost connection', async () => {
  const { a, b, connect } = createMemoryPair();
  const table = createTable({ seed: 9 });
  const hostStatus = [];
  const guestStatus = [];
  const host = hostSession({ room: a, table, onStatus: (s) => hostStatus.push(s) });
  const guest = guestSession({ room: b, name: 'Agent Lynx', token: 't1', onView: () => {}, onStatus: (s) => guestStatus.push(s) });
  connect();
  await until(() => hostStatus.includes('joined') && guestStatus.includes('joined'));
  // Each side says bye while the other is still in the room (nobody tells a peer that has gone).
  await host.bye();
  await until(() => guestStatus.includes('bye'));
  await guest.bye();
  b.leave();
  await until(() => hostStatus.includes('bye'));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(hostStatus, ['joined', 'bye']);
});

test('bye settles within 400 ms even if the send never settles', async () => {
  const table = createTable({ seed: 5 });
  const room = { peers: new Set(['g']), handlers: {}, on(t, cb) { this.handlers[t] = cb; }, send: () => new Promise(() => {}), leave() {} };
  const host = hostSession({ room, table });
  room.handlers.hello({ v: 1, name: 'Agent Owl', token: 't' }, 'g');
  const t0 = Date.now();
  await host.bye();
  assert.ok(Date.now() - t0 < 700);
});

test('bye resolves at once, sending nothing, when there is no peer left to tell', async () => {
  const sent = [];
  const fakeRoom = (peers) => ({ peers: new Set(peers), handlers: {}, on(t, cb) { this.handlers[t] = cb; }, send: (type) => (sent.push(type), new Promise(() => {})), leave() {} });
  // Host: no guest yet, then a guest who has gone.
  const lonely = hostSession({ room: fakeRoom([]), table: createTable({ seed: 6 }) });
  const t0 = Date.now();
  await lonely.bye();
  const room = fakeRoom(['g']);
  const host = hostSession({ room, table: createTable({ seed: 6 }) });
  room.handlers.hello({ v: 1, name: 'Agent Owl', token: 't' }, 'g');
  room.peers.delete('g');
  await host.bye();
  // Guest: no host yet, then a host who has gone.
  const groom = fakeRoom([]);
  const guest = guestSession({ room: groom, name: 'Agent Lynx', token: 't1', onView: () => {} });
  await guest.bye();
  groom.peers.add('h');
  groom.handlers.welcome({ name: 'Agent Fox' }, 'h');
  groom.peers.delete('h');
  await guest.bye();
  assert.deepEqual(sent.filter((t) => t === 'bye'), [], 'no bye sent to a peer that is gone');
  assert.ok(Date.now() - t0 < 200, 'each bye resolved at once rather than waiting out its 400 ms');
});

test('a guest that heard bye reports a later real disconnect once the host is welcomed back', async () => {
  const { a, b, connect } = createMemoryPair();
  const table = createTable({ seed: 9, names: ['Agent Fox', 'Rival'] });
  const guestStatus = [];
  const host = hostSession({ room: a, table });
  guestSession({ room: b, name: 'Agent Lynx', token: 't1', onView: () => {}, onStatus: (s, n) => guestStatus.push([s, n]) });
  connect();
  await until(() => guestStatus.length === 1);
  await host.bye();
  await until(() => guestStatus.length === 2);
  a.send('welcome', { name: '<b>x</b>' }, 'peer-b');
  await until(() => guestStatus.length === 3);
  a.leave();
  await until(() => guestStatus.length === 4);
  assert.deepEqual(guestStatus.map((x) => x[0]), ['joined', 'bye', 'joined', 'left']);
  assert.equal(guestStatus[2][1], 'Agent ?', 'host-supplied names are whitelisted');
});

test('a three-seat table of computer rivals plays a whole match', async () => {
  const t = createTable({ seed: 31, seats: 3, target: 4 });
  assert.deepEqual(t.names, ['Red', 'Teal', 'Cobalt']);
  assert.deepEqual([t.ready, t.rematch], [[false, false, false], [false, false, false]]);
  const bots = [0, 1, 2].map((seat) => attachBot(t, seat, { ...RIVALS[0], samples: 2 }, { pace: 0, rng: createRng(seat + 1) }));
  await until(() => t.state.phase === 'match-over', 30000);
  bots.forEach((b) => b.stop());
  assert.ok(t.state.scores[t.state.winner] >= 4);
});

test('a three-seat table keeps three seats across rounds, rematches and a save', () => {
  const t = createTable({ seed: 32, seats: 3 });
  t.state.phase = 'round-over';
  [0, 1, 2].forEach((seat) => t.act(seat, { a: 'next' }));
  assert.deepEqual(t.ready, [false, false, false]);
  t.state.phase = 'match-over';
  [0, 1, 2].forEach((seat) => t.act(seat, { a: 'rematch' }));
  assert.equal(E.seatCount(t.state), 3);
  assert.deepEqual(t.rematch, [false, false, false]);
  const copy = restoreTable(JSON.parse(JSON.stringify(t.toJSON())));
  assert.equal(E.seatCount(copy.state), 3);
  assert.equal(copy.ready.length, 3);
});

test('a stopped computer rival never finishes the move it was making', async () => {
  for (const phase of ['plan', 'round-over']) {
    const t = createTable({ seed: 21 });
    t.state.phase = phase;
    const bot = attachBot(t, 1, { ...RIVALS[0], samples: 2 }, { pace: 0.02, rng: createRng(4) });
    bot.stop(); // the bot is now inside its first wait
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(t.seq, 0, `${phase}: nothing happened after stop`);
    assert.equal(t.state.round.plans[1], null);
    assert.equal(t.ready[1], false);
  }
});

test('names must match the seat count, and online play stays two seats', () => {
  assert.throws(() => createTable({ seats: 3, names: ['A', 'B'] }), /one entry per seat/);
  const room = { peers: new Set(), handlers: {}, on(t, cb) { this.handlers[t] = cb; }, send() {}, leave() {} };
  assert.throws(() => hostSession({ room, table: createTable({ seats: 3 }) }), /two players until Phase 3/);
});

test('an action from a seat outside the table changes nothing', () => {
  const t = createTable({ seed: 5, seats: 2 });
  for (const phase of ['round-over', 'match-over']) {
    t.state.phase = phase;
    const a = phase === 'round-over' ? 'next' : 'rematch';
    for (const seat of [7, -1, '1', 2, null, undefined, 0.5]) {
      const seq = t.seq;
      assert.equal(t.act(seat, { a }), false, `${a} from ${String(seat)}`);
      assert.equal(t.ready.length, 2);
      assert.equal(t.rematch.length, 2);
      assert.deepEqual([t.ready, t.rematch], [[false, false], [false, false]]);
      assert.equal(t.seq, seq);
    }
  }
});
