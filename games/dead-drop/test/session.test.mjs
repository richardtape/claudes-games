import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTable, attachBot, hostSession, guestSession, restoreTable, canRestore, PROTOCOL } from '../js/session.js';
import { createMemoryPair } from '../../../shared/net.js';
import { RIVALS, DECK, TWISTS } from '../js/data.js';
import { CLASSIC_SETUP, MIXED_ALL, ladderSetup } from '../js/roster.js';
import { createRng } from '../../../shared/rng.js';
import * as E from '../js/engine.js';
import { give } from './helpers.mjs';

const until = async (cond, ms = 4000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 2));
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  hostRoom.handlers.hello({ v: PROTOCOL, name: 'Agent Owl', token: 'tok' }, 'g1');
  hostRoom.peers.add('g2');
  hostRoom.handlers.hello({ v: PROTOCOL, name: 'Agent Pike', token: 'other' }, 'g2');
  assert.deepEqual(hostRoom.sent.filter((m) => m.to === 'g2').map((m) => m.type), ['nope']);
  hostRoom.peers.delete('g1');
  hostRoom.onPeerLeave('g1');
  hostRoom.peers.add('g3');
  hostRoom.handlers.hello({ v: PROTOCOL, name: 'Agent Owl', token: 'tok' }, 'g3');
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
  assert.ok(table.state.winBy === 'reel' || table.state.scores[table.state.winner] >= 6);
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
    room.handlers.hello({ v: PROTOCOL, name, token: 't' }, 'g');
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
  room.handlers.hello({ v: PROTOCOL, name: 'Agent Owl', token: 't' }, 'g');
  // Raced against a 1000 ms timer rather than the wall clock: timers fire in the order they fall due,
  // so a loaded machine delays both and bye's 400 ms timer still goes first.
  let late;
  const first = await Promise.race([host.bye().then(() => 'bye'), new Promise((r) => (late = setTimeout(r, 1000, 'late')))]);
  clearTimeout(late);
  assert.equal(first, 'bye');
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
  room.handlers.hello({ v: PROTOCOL, name: 'Agent Owl', token: 't' }, 'g');
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
  assert.ok(t.state.winBy === 'reel' || t.state.scores[t.state.winner] >= 4);
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

test('protocol 3: a 2b-i guest is turned away with the version message', () => {
  assert.equal(PROTOCOL, 3);
  const sent = [];
  const room = { peers: new Set(['g']), handlers: {}, on(t, cb) { this.handlers[t] = cb; }, send(t, d, id) { sent.push([t, d, id]); }, leave() {} };
  hostSession({ room, table: createTable({ seed: 1 }) });
  room.handlers.hello({ v: 2, name: 'Agent Fox', token: '0123456789abcdef' }, 'g');
  assert.deepEqual(sent, [['nope', { why: 'version' }, 'g']]);
});

test('tables carry their setup through saves, restarts and rematches', () => {
  const t = createTable({ setup: MIXED_ALL });
  assert.match(t.state.seed, /^[0-9a-f]{16}$/);
  assert.equal(t.state.roster.length, 12);
  const copy = restoreTable(JSON.parse(JSON.stringify(t.toJSON())));
  assert.deepEqual([copy.setup, copy.state.roster], [MIXED_ALL, t.state.roster]);
  const id = t.matchId;
  t.restart(CLASSIC_SETUP);
  assert.deepEqual([t.state.roster, t.matchId !== id], [DECK, true]);
  const r = createTable({ setup: ladderSetup('heron') });
  r.state.phase = 'match-over';
  r.act(0, { a: 'rematch' });
  r.act(1, { a: 'rematch' });
  assert.deepEqual([r.state.twist, r.state.roster.includes('bodyguard')], [{ ...TWISTS.heron, seat: 1 }, true]);
});

test('a 2b-i save restores as Classic; a restart keeps listeners and tells them', () => {
  const v2 = JSON.parse(readFileSync(new URL('./golden/v2-table.json', import.meta.url), 'utf8'));
  assert.equal('setup' in v2, false);
  assert.equal(restoreTable(v2).setup, CLASSIC_SETUP);
  const t = createTable({ seed: 'lobby' });
  let heard = 0;
  t.onChange(() => heard++);
  const seed = t.state.seed;
  t.restart(MIXED_ALL);
  assert.deepEqual([heard, t.setup, t.state.seed !== seed, t.state.roster.length], [1, MIXED_ALL, true, 12]);
  assert.deepEqual(t.toJSON().setup, MIXED_ALL);
});

test('a lock action passes a partner and a face to the engine, and nothing else', () => {
  const t = createTable({ seed: 12, setup: { ...MIXED_ALL, must: ['accomplice'] }, cities: ['casablanca', 'berlin', 'monaco'] });
  const S = t.state;
  const acc = give(S, 0, 'accomplice');
  const mate = give(S, 0, 'heavy', { keep: [acc] });
  assert.ok(t.act(0, { a: 'lock', uid: acc, city: 0, partner: mate, down: true, faceDown: false, power: 9 }));
  assert.deepEqual(S.round.plans[0], { uid: acc, city: 0, down: true, partner: mate });
  assert.ok(t.act(0, { a: 'unlock' }));
  assert.ok(t.act(0, { a: 'lock', uid: acc, city: 0, partner: 7, down: 'yes' }), 'a partner that is not a string and a face that is not a boolean are left out');
  assert.deepEqual(S.round.plans[0], { uid: acc, city: 0, down: false });
  assert.ok(t.act(0, { a: 'unlock' }));
  assert.ok(t.act(0, { a: 'lock', uid: acc, city: 1, partner: mate }));
  assert.deepEqual(S.round.plans[0], { uid: acc, city: 1, partner: mate });
});

test('saves: only a v2 table restores; a Phase 1 save is refused', () => {
  const v1 = JSON.parse(readFileSync(new URL('./golden/v1-table.json', import.meta.url), 'utf8'));
  assert.equal(canRestore(v1), false);
  assert.throws(() => restoreTable(v1), /older version/);
  for (const bad of [null, undefined, {}, { state: null }, { state: { v: 2 } }]) assert.equal(canRestore(bad), false);
  const t = createTable({ seed: 2 });
  const copy = JSON.parse(JSON.stringify(t.toJSON()));
  assert.ok(canRestore(copy));
  assert.deepEqual(restoreTable(copy).state, t.state);
});

test('saves: a mid-round table (a spent token, a pot, strips, a pending call) restores whole, and its bot answers', async () => {
  const t = createTable({ seed: 17 });
  assert.ok(t.act(0, { a: 'escalate' }));
  t.state.round.pot = 2;
  t.state.strips = [1, 0];
  assert.ok(t.state.round.pending);
  const copy = JSON.parse(JSON.stringify(t.toJSON()));
  assert.ok(canRestore(copy));
  const back = restoreTable(copy);
  assert.deepEqual(back.state, t.state);
  assert.equal(back.state.tokens[0], t.state.tokens[0]);
  const owes = 1 - back.state.round.pending.by;
  const bot = attachBot(back, owes, { ...RIVALS[0], samples: 2 }, { pace: 0, rng: createRng(5) });
  await until(() => !back.state.round.pending, 5000);
  bot.stop();
  assert.ok(back.state.round.called);
  assert.equal(back.state.round.pending, null);
});

test('a three-seat table: one seat escalates and the computer rivals answer', async () => {
  const t = createTable({ seed: 41, seats: 3 });
  const bots = [1, 2].map((seat) => attachBot(t, seat, { ...RIVALS[0], samples: 2 }, { pace: 0, rng: createRng(seat) }));
  assert.ok(t.act(0, { a: 'escalate' }));
  await until(() => !t.state.round.pending, 5000);
  bots.forEach((b) => b.stop());
  assert.equal(t.state.round.called.by, 0);
  assert.ok(t.state.round.called.answers.every((a, s) => (s === 0 ? a === null : ['on', 'fold'].includes(a))));
});

/** Record every seat's lock as it's made (a turn that resolves at once resets the plans before any listener could read them). */
function lockLog(t) {
  const order = [];
  const act = t.act;
  t.act = (seat, a) => (a?.a === 'lock' && order.push(seat), act(seat, a));
  return order;
}
const tapTable = (seed) => createTable({ seed, setup: { ...CLASSIC_SETUP, twist: { id: 'tap', from: 1 } } }); // seat 1 taps seat 0 every turn

test('a wiretapping bot waits for its mark, but never for ever', async () => {
  const t = tapTable(8);
  const order = lockLog(t);
  const bot = attachBot(t, 1, { ...RIVALS[0], samples: 2 }, { pace: 0, rng: createRng(1), tapWait: 2000 });
  await sleep(120);
  assert.deepEqual(order, [], 'waiting for seat 0');
  t.act(0, { a: 'lock', ...t.view(0).round.legal[0] });
  await until(() => t.state.round.turn === 2, 3000);
  assert.deepEqual(order.slice(0, 2), [0, 1]);
  bot.stop();
  const lone = tapTable(9);
  const b2 = attachBot(lone, 1, { ...RIVALS[0], samples: 2 }, { pace: 0, rng: createRng(2), tapWait: 200 });
  await until(() => !!lone.state.round.plans[1], 2000);
  b2.stop();
});

test('two seats tapping each other never wait for each other', async () => {
  const t = tapTable(10);
  t.state.round.taps.push({ by: 0, on: 1, turn: 1 }); // seat 0 holds a Wiretap on seat 1 this turn
  const order = lockLog(t);
  // Each would wait a minute for the other: turn 1 resolving within 5 s means neither waited.
  const bots = [0, 1].map((seat) => attachBot(t, seat, { ...RIVALS[0], samples: 2 }, { pace: 0, rng: createRng(seat), tapWait: 60000 }));
  try {
    await until(() => t.state.round.turn === 2, 5000);
  } finally {
    bots.forEach((b) => b.stop());
  }
  assert.deepEqual(order.slice(0, 2).sort(), [0, 1], 'both seats locked turn 1');
});

test('a wiretapping bot stops waiting for its mark to answer an escalation it owes', async () => {
  const t = createTable({ seed: 11 });
  t.state.round.taps.push({ by: 1, on: 0, turn: 1 }); // seat 1 holds a Wiretap on seat 0 this turn
  // It would wait a minute for seat 0's lock: an answer within 5 s means the escalation ended the wait.
  const bot = attachBot(t, 1, { ...RIVALS[0], samples: 2 }, { pace: 0, rng: createRng(3), tapWait: 60000 });
  try {
    await sleep(200);
    assert.ok(!t.state.round.plans[1], 'still waiting for seat 0 to lock');
    assert.ok(t.act(0, { a: 'escalate' }));
    await until(() => !!t.state.round.called, 5000); // settled by seat 1's answer, play on or fold
    assert.equal(t.state.round.pending, null);
    assert.ok(['on', 'fold'].includes(t.state.round.called.answers[1]));
  } finally {
    bot.stop();
  }
});
