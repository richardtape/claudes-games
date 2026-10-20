import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTable, attachBot, hostSession, guestSession, restoreTable, canRestore, PROTOCOL } from '../js/session.js';
import { createMemoryPair, createMemoryHub } from '../../../shared/net.js';
import { createLobby, seatOf } from '../js/lobby.js';
import { RIVALS, DECK, TWISTS, RULES, samplesFor } from '../js/data.js';
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

/** A room a test drives by hand: handlers by message type, and every send recorded as { type, data, to }. */
const fakeRoom = (peers = []) => ({
  peers: new Set(peers),
  handlers: {},
  sent: [],
  on(t, cb) {
    this.handlers[t] = cb;
  },
  send(type, data, to) {
    this.sent.push({ type, data, to });
  },
  leave() {},
  onPeerLeave() {},
});
const lobbyFor = () => createLobby({ host: { name: 'Agent Fox', token: 'h'.repeat(16) } });
const makeTable = (S, extra = {}) => createTable({ seed: 1, seats: S.seats, names: S.names, ...extra });
const hello = (room, id, i, v = PROTOCOL) => room.handlers.hello({ v, name: ['Agent Owl', 'Agent Pike', 'Agent Lynx', 'Agent Moth', 'Agent Hare', 'Agent Kite', 'Agent Puma', 'Agent Crane', 'Agent Ibis'][i], token: String(i).repeat(16) }, id);

test('host and guest play a turn over the network; the guest sees only its own view', async () => {
  const { a, b, connect } = createMemoryPair();
  const statuses = [];
  const host = hostSession({ room: a, lobby: lobbyFor(), makeTable: (S) => createTable({ seed: 9, cities: ['berlin', 'monaco', 'tangier'], names: S.names }), onStatus: (s) => statuses.push(s) });
  let view = null;
  const guest = guestSession({ room: b, name: 'Agent Lynx', token: '1'.repeat(16), onView: (v) => (view = v) });
  connect();
  await until(() => statuses.includes('joined') && guest.seat === 1);
  await sleep(10);
  assert.equal(view, null, 'a guest joining no longer starts the match: the host does');
  const table = host.start();
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
  guest.close();
  host.close();
});

test('a third browser watches a two-seat table; a seat freed before the start is a new join; the same guest comes back', () => {
  const room = fakeRoom();
  const statuses = [];
  const h = hostSession({ room, lobby: createLobby({ host: { name: 'Agent Fox', token: 'h'.repeat(16) }, size: 2 }), makeTable, now: () => 0, onStatus: (s) => statuses.push(s) });
  // Before the start, a guest who leaves frees the seat: whoever sits there next has joined, not come back.
  room.peers.add('g0');
  hello(room, 'g0', 0);
  room.peers.delete('g0');
  room.onPeerLeave('g0');
  assert.equal(h.lobby.seats[1].kind, 'empty');
  room.peers.add('g1');
  hello(room, 'g1', 1);
  assert.deepEqual(statuses, ['joined', 'left', 'joined']);
  h.start();
  room.peers.add('g2');
  hello(room, 'g2', 2);
  assert.deepEqual(room.sent.filter((m) => m.to === 'g2').map((m) => [m.type, m.data.seat]), [['welcome', -1], ['view', -1]], 'the table is full: the third browser watches');
  hello(room, 'g2', 2);
  assert.equal(room.sent.filter((m) => m.type === 'welcome' && m.to === 'g2').length, 2, 'a repeated hello is welcomed again');
  assert.equal(statuses.filter((s) => s === 'watching').length, 1, 'but not announced again');
  room.peers.delete('g1');
  room.onPeerLeave('g1');
  room.peers.add('g3');
  room.handlers.hello({ v: PROTOCOL, name: 'Agent Owl', token: '1'.repeat(16) }, 'g3');
  assert.deepEqual(statuses, ['joined', 'left', 'joined', 'watching', 'left', 'back']);
  assert.equal(h.table.names[1], 'Agent Owl');
  // The same token from yet another connection takes the seat over; the old connection's leave changes nothing.
  room.peers.add('g4');
  room.handlers.hello({ v: PROTOCOL, name: 'Agent Owl', token: '1'.repeat(16) }, 'g4');
  room.peers.delete('g3');
  room.onPeerLeave('g3');
  assert.deepEqual(statuses.slice(6), ['back']);
  assert.deepEqual(h.table.here, [true, true]);
  // Every view the watcher got as the table changed was a spectator's.
  const watched = room.sent.filter((m) => m.type === 'view' && m.to === 'g2');
  assert.ok(watched.length > 1 && watched.every((m) => m.data.seat === -1 && m.data.round.hand.length === 0));
  h.close();
});

test('a hello needs a proper token; a second tab of the host’s browser (its token) gets a guest seat, never the host’s', () => {
  const token = 'abcdef0123456789';
  const room = fakeRoom(['x', 'tab', 'tab2']);
  const h = hostSession({ room, lobby: createLobby({ host: { name: 'Agent Fox', token }, size: 2 }), makeTable, now: () => 0 });
  for (const bad of [undefined, '', 'tok', 'ABCDEF0123456789', '0123456789abcdef0', 7]) room.handlers.hello({ v: PROTOCOL, name: 'Agent Owl', token: bad }, 'x');
  assert.deepEqual(room.sent, [], 'a hello without a 16-hex token is ignored');
  room.handlers.hello({ v: PROTOCOL, name: 'Agent Owl', token }, 'tab');
  assert.equal(room.sent.find((m) => m.type === 'welcome' && m.to === 'tab').data.seat, 1);
  assert.equal(seatOf(h.lobby, token), 0, 'the host keeps its seat');
  const t = h.start();
  assert.ok(room.sent.filter((m) => m.type === 'view' && m.to === 'tab').every((m) => m.data.seat === 1));
  // That tab reloads: the same token finds the guest seat again.
  room.handlers.hello({ v: PROTOCOL, name: 'Agent Owl', token }, 'tab2');
  assert.equal(room.sent.filter((m) => m.type === 'welcome' && m.to === 'tab2').at(-1).data.seat, 1);
  assert.deepEqual(t.names, ['Agent Fox', 'Agent Owl']);
  h.close();
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
    const room = fakeRoom(['g']);
    const h = hostSession({ room, lobby: lobbyFor(), makeTable, now: () => 0 });
    room.handlers.hello({ v: PROTOCOL, name, token: '1'.repeat(16) }, 'g');
    assert.equal(h.start().names[1], shown);
    h.close();
  }
});

test('leaving says bye: the other side hears it once, not as a lost connection', async () => {
  const { a, b, connect } = createMemoryPair();
  const hostStatus = [];
  const guestStatus = [];
  const host = hostSession({ room: a, lobby: lobbyFor(), makeTable, onStatus: (s) => hostStatus.push(s) });
  const guest = guestSession({ room: b, name: 'Agent Lynx', token: '1'.repeat(16), onView: () => {}, onStatus: (s) => guestStatus.push(s) });
  connect();
  await until(() => hostStatus.includes('joined') && guestStatus.includes('joined'));
  host.start();
  // Each side says bye while the other is still in the room (nobody tells a peer that has gone).
  await host.bye();
  await until(() => guestStatus.includes('bye'));
  await guest.bye();
  guest.close();
  await until(() => hostStatus.includes('bye'));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(hostStatus, ['joined', 'bye', 'standin'], 'a goodbye mid-match brings the stand-in at once; the leave after it is no lost connection');
  host.close();
});

test('bye settles within 400 ms even if the send never settles', async () => {
  const room = { peers: new Set(['g']), handlers: {}, on(t, cb) { this.handlers[t] = cb; }, send: () => new Promise(() => {}), leave() {} };
  const host = hostSession({ room, lobby: lobbyFor(), makeTable, now: () => 0 });
  room.handlers.hello({ v: PROTOCOL, name: 'Agent Owl', token: '1'.repeat(16) }, 'g');
  // Raced against a 1000 ms timer rather than the wall clock: timers fire in the order they fall due,
  // so a loaded machine delays both and bye's 400 ms timer still goes first.
  let late;
  const first = await Promise.race([host.bye().then(() => 'bye'), new Promise((r) => (late = setTimeout(r, 1000, 'late')))]);
  clearTimeout(late);
  assert.equal(first, 'bye');
  host.close();
});

test('bye resolves at once, sending nothing, when there is no peer left to tell', async () => {
  const sent = [];
  const stuckRoom = (peers) => ({ peers: new Set(peers), handlers: {}, on(t, cb) { this.handlers[t] = cb; }, send: (type) => (sent.push(type), new Promise(() => {})), leave() {} });
  // Host: no guest yet, then a guest who has gone.
  const lonely = hostSession({ room: stuckRoom([]), lobby: lobbyFor(), makeTable, now: () => 0 });
  const t0 = Date.now();
  await lonely.bye();
  const room = stuckRoom(['g']);
  const host = hostSession({ room, lobby: lobbyFor(), makeTable, now: () => 0 });
  room.handlers.hello({ v: PROTOCOL, name: 'Agent Owl', token: '1'.repeat(16) }, 'g');
  room.peers.delete('g');
  await host.bye();
  // Guest: no host yet, then a host who has gone.
  const groom = stuckRoom([]);
  const guest = guestSession({ room: groom, name: 'Agent Lynx', token: '1'.repeat(16), onView: () => {} });
  await guest.bye();
  groom.peers.add('h');
  groom.handlers.welcome({ name: 'Agent Fox' }, 'h');
  groom.peers.delete('h');
  await guest.bye();
  assert.deepEqual(sent.filter((t) => t === 'bye'), [], 'no bye sent to a peer that is gone');
  assert.ok(Date.now() - t0 < 200, 'each bye resolved at once rather than waiting out its 400 ms');
  [lonely, host, guest].forEach((x) => x.close());
});

test('a guest that heard bye reports a later real disconnect once the host is welcomed back', async () => {
  const { a, b, connect } = createMemoryPair();
  const guestStatus = [];
  const host = hostSession({ room: a, lobby: lobbyFor(), makeTable });
  const guest = guestSession({ room: b, name: 'Agent Lynx', token: '1'.repeat(16), onView: () => {}, onStatus: (s, n) => guestStatus.push([s, n]) });
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
  assert.equal(guest.seat, 1, 'a welcome without a seat means seat 1');
  guest.close();
  host.close();
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

test('a computer rival busy with a turn that ends under it still hears what happens meanwhile: it accepts a rematch both others asked for', async () => {
  const t = createTable({ seed: 22, seats: 3 });
  const bot = attachBot(t, 1, { ...RIVALS[0], samples: 2 }, { pace: 0.2, rng: createRng(5) });
  // The bot is now inside its first wait (thinking about turn 1). The match ends under it, and both
  // others ask for a rematch, before that wait is over.
  t.state.scores = [30, 0, 0];
  t.state.target = 1;
  for (let k = 0; k < 6 && t.state.phase === 'plan'; k++) {
    for (const seat of [0, 1, 2]) {
      const d = t.view(seat).round.legal[0];
      if (!t.state.round.plans[seat] && d) t.act(seat, { a: 'lock', uid: d.uid, city: d.city });
    }
  }
  assert.equal(t.state.phase, 'match-over');
  t.act(0, { a: 'rematch' });
  t.act(2, { a: 'rematch' });
  const id = t.matchId;
  await until(() => t.matchId !== id, 3000);
  assert.equal(t.state.phase, 'plan');
  bot.stop();
});

test('names must match the seat count', () => {
  assert.throws(() => createTable({ seats: 3, names: ['A', 'B'] }), /one entry per seat/);
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

test('protocol 4: a 2b-ii guest is turned away with the version message', () => {
  assert.equal(PROTOCOL, 4);
  const sent = [];
  const room = { peers: new Set(['g']), handlers: {}, on(t, cb) { this.handlers[t] = cb; }, send(t, d, id) { sent.push([t, d, id]); }, leave() {} };
  const h = hostSession({ room, lobby: lobbyFor(), makeTable, now: () => 0 });
  room.handlers.hello({ v: 3, name: 'Agent Fox', token: '0123456789abcdef' }, 'g');
  assert.deepEqual(sent, [['nope', { why: 'version' }, 'g']]);
  h.close();
});

test('tables carry their setup through saves, restarts and rematches', () => {
  const t = createTable({ setup: MIXED_ALL });
  assert.equal(t.state.seed, null);
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

test('real tables are unseeded; rematches and restarts too; a saved one restores', () => {
  const t = createTable();
  assert.equal(t.state.seed, null);
  assert.equal(t.state.rng.length, 4);
  assert.equal(t.state.roster.length, 12);
  const copy = restoreTable(JSON.parse(JSON.stringify(t.toJSON())));
  assert.deepEqual(copy.state.rng, t.state.rng);
  t.state.phase = 'match-over';
  t.act(0, { a: 'rematch' });
  t.act(1, { a: 'rematch' });
  assert.equal(t.state.seed, null);
  t.restart(CLASSIC_SETUP);
  assert.equal(t.state.seed, null);
  assert.equal(createTable({ seed: 5 }).state.seed, '5', 'tests and sims still seed');
});

test('a bot with stakes off never escalates or folds and plays on when called', async () => {
  const t = createTable({ seed: 44, seats: 3 });
  const bot = attachBot(t, 1, { ...RIVALS[3], samples: 2, bluff: 1 }, { pace: 0, rng: createRng(1), stakes: false });
  const other = attachBot(t, 2, { ...RIVALS[0], samples: 2 }, { pace: 0, rng: createRng(2) });
  assert.ok(t.act(0, { a: 'escalate' }));
  await until(() => !t.state.round.pending, 5000);
  assert.equal(t.state.round.called.answers[1], 'on');
  for (let guard = 0; t.state.phase === 'plan' && guard < 20; guard++) {
    if (!t.state.round.plans[0]) t.act(0, { a: 'lock', ...t.view(0).round.legal[0] });
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(t.state.tokens[1], RULES.tokens);
  assert.equal(t.state.round.folded[1], false);
  bot.stop();
  other.stop();
});

test('bots at three and four seats think with capped samples', () => {
  assert.deepEqual([samplesFor(RIVALS[4], 2), samplesFor(RIVALS[4], 3), samplesFor(RIVALS[4], 4), samplesFor(RIVALS[0], 4)], [80, 24, 12, 6]);
});

test('protocol 4: a v3 guest is turned away; three guests sit, the rest watch, the ninth is refused', () => {
  assert.equal(PROTOCOL, 4);
  const room = fakeRoom();
  const h = hostSession({ room, lobby: lobbyFor(), makeTable, now: () => 0 });
  room.peers.add('old');
  hello(room, 'old', 0, 3);
  assert.deepEqual(room.sent.filter((m) => m.to === 'old').map((m) => [m.type, m.data.why]), [['nope', 'version']]);
  for (let i = 0; i < 8; i++) {
    room.peers.add(`g${i}`);
    hello(room, `g${i}`, i);
  }
  const welcomes = room.sent.filter((m) => m.type === 'welcome');
  assert.deepEqual(welcomes.map((m) => m.data.seat), [1, 2, 3, -1, -1, -1, -1]);
  assert.deepEqual(room.sent.filter((m) => m.to === 'g7').map((m) => [m.type, m.data.why]), [['nope', 'full']]);
  assert.ok(welcomes.every((m) => !JSON.stringify(m.data.lobby).includes('hhhh')), 'no tokens on the wire');
  h.close();
});

test('start plays the taken seats with bots in the filled ones, and every seated peer gets only its own view', () => {
  const room = fakeRoom();
  const h = hostSession({ room, lobby: lobbyFor(), makeTable, now: () => 0 });
  room.peers.add('g0');
  hello(room, 'g0', 0);
  h.setLobby({ size: 3, fill: true });
  const t = h.start();
  assert.equal(E.seatCount(t.state), 3);
  assert.deepEqual(t.names, ['Agent Fox', 'Agent Owl', RIVALS[0].name]);
  const views = room.sent.filter((m) => m.type === 'view' && m.to === 'g0');
  assert.ok(views.length >= 1 && views.every((m) => m.data.seat === 1));
  assert.ok(views.at(-1).data.round.hand.every((c) => c.owner === 1));
  // A newcomer after the start watches, never takes the bot's seat.
  room.peers.add('late');
  hello(room, 'late', 5);
  const w = room.sent.filter((m) => m.type === 'view' && m.to === 'late').at(-1);
  assert.equal(w.data.seat, -1);
  assert.deepEqual(w.data.round.hand, []);
  for (const c of w.data.round.cities) for (const side of c.sides) for (const cv of side) if (cv.faceDown) assert.equal(cv.kind, null);
  h.close();
});

test('a quiet guest gets a stand-in after 30 s that plays on but never stakes; the seat goes back on return', async () => {
  let now = 0;
  const room = fakeRoom();
  const statuses = [];
  const h = hostSession({ room, lobby: lobbyFor(), makeTable: (S) => makeTable(S, { seed: 44 }), now: () => now, onStatus: (s, n) => statuses.push([s, n]) });
  room.peers.add('g0');
  hello(room, 'g0', 0);
  const t = h.start();
  now = 29000;
  h.tick();
  assert.deepEqual(t.standIn, [false, false]);
  now = 30000;
  h.tick();
  assert.deepEqual(t.standIn, [false, true]);
  assert.ok(statuses.some(([s]) => s === 'standin'));
  await until(() => !!t.state.round.plans[1], 4000);
  assert.ok(t.act(0, { a: 'escalate' }));
  await until(() => !t.state.round.pending, 4000);
  assert.equal(t.state.round.called.answers[1], 'on');
  h.tick();
  assert.deepEqual(t.standIn, [false, true], 'one stand-in, not two');
  room.handlers.ping({}, 'g0');
  assert.deepEqual(t.standIn, [false, false]);
  assert.equal(statuses.at(-1)[0], 'back');
  assert.ok(t.state.round.plans[1], 'the stand-in’s lock stands');
  now = 59000;
  h.tick();
  assert.deepEqual(t.standIn, [false, false], 'the ping at 30 s reset the clock: 29 s quiet is not 30');
  room.handlers.bye({}, 'g0');
  assert.deepEqual(t.standIn, [false, true], 'a goodbye covers the seat at once');
  h.close();
});

test('emotes carry an index, reach every peer, and are rate-limited per seat', () => {
  let now = 0;
  const room = fakeRoom();
  const h = hostSession({ room, lobby: lobbyFor(), makeTable, now: () => now });
  for (const id of ['g0', 'g1']) room.peers.add(id);
  hello(room, 'g0', 0);
  hello(room, 'g1', 1);
  h.start();
  room.sent.length = 0;
  room.handlers.emote({ i: 2 }, 'g0');
  room.handlers.emote({ i: 3 }, 'g0');
  room.handlers.emote({ i: 9 }, 'g1');
  room.handlers.emote({ i: 'Bluffing?' }, 'g1');
  const out = room.sent.filter((m) => m.type === 'emote');
  assert.deepEqual([...new Set(out.map((m) => JSON.stringify(m.data)))], ['{"seat":1,"i":2}']);
  assert.deepEqual(new Set(out.map((m) => m.to)), new Set(['g0', 'g1']));
  now = 3000;
  room.handlers.emote({ i: 3 }, 'g0');
  assert.equal(room.sent.filter((m) => m.type === 'emote' && m.data.i === 3).length, 2);
  h.close();
});

test('a saved host (table and lobby) restores: bots re-seat, tokens find their seats', () => {
  const room = fakeRoom();
  const h = hostSession({ room, lobby: lobbyFor(), makeTable, now: () => 0 });
  room.peers.add('g0');
  hello(room, 'g0', 0);
  h.setLobby({ size: 3, fill: true });
  h.start();
  const saved = JSON.parse(JSON.stringify(h.toJSON()));
  h.close();
  const room2 = fakeRoom();
  const back = hostSession({ room: room2, lobby: saved.lobby, table: restoreTable(saved.table), makeTable, now: () => 0 });
  assert.equal(E.seatCount(back.table.state), 3);
  room2.peers.add('g0b');
  hello(room2, 'g0b', 0);
  assert.equal(room2.sent.find((m) => m.type === 'welcome').data.seat, 1);
  room2.peers.add('x');
  hello(room2, 'x', 7);
  assert.equal(room2.sent.filter((m) => m.type === 'welcome').at(-1).data.seat, -1, 'the bot’s seat stays the bot’s');
  back.close();
});

test('a saved table without its guests’ tokens: the stand-in covers the quiet seat, the first newcomer takes it, the next watches', () => {
  let now = 0;
  const saved = JSON.parse(JSON.stringify(createTable({ seed: 3, names: ['Agent Fox', 'Agent Owl'] }).toJSON()));
  const lobby = createLobby({ host: { name: 'Agent Fox', token: 'h'.repeat(16) }, size: 2 });
  lobby.seats[1] = { kind: 'guest', name: 'Agent Owl', token: null, here: false };
  lobby.started = true;
  const room = fakeRoom(['a', 'b']);
  const statuses = [];
  const h = hostSession({ room, lobby, table: restoreTable(saved), makeTable, now: () => now, onStatus: (s) => statuses.push(s) });
  assert.deepEqual([h.table.here, h.table.standIn], [[true, false], [false, false]], 'every guest seat starts quiet');
  now = 30000;
  h.tick();
  assert.deepEqual(h.table.standIn, [false, true]);
  hello(room, 'a', 2);
  hello(room, 'b', 3);
  assert.deepEqual(room.sent.filter((m) => m.type === 'welcome').map((m) => [m.to, m.data.seat]), [['a', 1], ['b', -1]]);
  assert.deepEqual(statuses, ['standin', 'joined', 'watching']);
  assert.deepEqual([h.table.here, h.table.standIn, h.table.names[1]], [[true, true], [false, false], 'Agent Lynx']);
  assert.equal(seatOf(h.lobby, '2'.repeat(16)), 1);
  h.close();
});

test('seats renumbered by the start or a smaller table follow their tokens: views, actions, emotes and the stand-in clock', () => {
  for (const shrink of [false, true]) {
    let now = 0;
    const room = fakeRoom();
    const emotes = [];
    const h = hostSession({ room, lobby: lobbyFor(), makeTable, now: () => now, onEmote: (e) => emotes.push(e) });
    for (const i of [0, 1, 2]) {
      room.peers.add(`g${i}`);
      hello(room, `g${i}`, i);
    }
    // Agent Owl (seat 1) leaves before the start: the empty seat goes, and Pike and Lynx move up a seat.
    room.peers.delete('g0');
    room.onPeerLeave('g0');
    if (shrink) assert.ok(h.setLobby({ size: 3 }), 'a three-seat table drops the empty seat from the middle');
    // Each guest's lobby says the seat it holds now: a smaller table moves Pike and Lynx up at once.
    const lobbySeat = (id) => room.sent.filter((m) => m.type === 'lobby' && m.to === id).at(-1)?.data.seat;
    assert.deepEqual([lobbySeat('g1'), lobbySeat('g2')], shrink ? [1, 2] : [2, 3]);
    const t = h.start();
    assert.deepEqual(t.names, ['Agent Fox', 'Agent Pike', 'Agent Lynx']);
    assert.deepEqual([lobbySeat('g1'), lobbySeat('g2')], [1, 2], 'the start’s lobby says the seats the table deals');
    for (const [id, seat] of [['g1', 1], ['g2', 2]]) {
      const views = room.sent.filter((m) => m.type === 'view' && m.to === id);
      assert.ok(views.length >= 1, `${id} got a view`);
      for (const m of views) {
        assert.equal(m.data.seat, seat, `${id} sees seat ${seat}`);
        assert.ok(m.data.round.hand.every((c) => c.owner === seat), `${id} holds only its own cards`);
      }
    }
    room.handlers.act({ a: 'lock', ...t.view(1).round.legal[0] }, 'g1');
    assert.deepEqual(t.state.round.plans.map(Boolean), [false, true, false], 'Pike’s lock lands on Pike’s seat');
    room.handlers.emote({ i: 1 }, 'g2');
    assert.deepEqual(emotes, [{ seat: 2, i: 1 }]);
    // Both keep pinging: neither seat goes quiet, so nobody gets the stand-in.
    now = 20000;
    room.handlers.ping({}, 'g1');
    room.handlers.ping({}, 'g2');
    now = 40000;
    h.tick();
    assert.deepEqual(t.standIn, [false, false, false]);
    h.close();
  }
});

test('a guest takes its seat from the welcome: -1 to watch, 1 when missing or not a seat at any table', () => {
  for (const [seat, want] of [[2, 2], [3, 3], [-1, -1], [undefined, 1], [4, 1], [-2, 1], ['2', 1], [1.5, 1]]) {
    const room = fakeRoom(['h']);
    const statuses = [];
    const g = guestSession({ room, name: 'Agent Owl', token: '1'.repeat(16), onView: () => {}, onStatus: (s) => statuses.push(s) });
    assert.equal(g.seat, null);
    room.handlers.welcome({ name: 'Agent Fox', seat }, 'h');
    assert.deepEqual([g.seat, statuses], [want, [want === -1 ? 'watching' : 'joined']], `welcome seat ${String(seat)}`);
    g.close();
  }
});

test('a guest takes its seat from each lobby the host sends, once welcomed and only from the host', () => {
  const room = fakeRoom(['h']);
  const lobbies = [];
  const g = guestSession({ room, name: 'Agent Owl', token: '1'.repeat(16), onView: () => {}, onLobby: (l) => lobbies.push(l) });
  room.handlers.lobby({ size: 4, seats: [], seat: 3 }, 'h');
  assert.deepEqual([g.seat, lobbies.length], [null, 0], 'nothing from the host before its welcome');
  room.handlers.welcome({ name: 'Agent Fox', seat: 3 }, 'h');
  room.handlers.lobby({ size: 3, seats: [], seat: 2 }, 'h');
  assert.equal(g.seat, 2, 'the host closed an empty seat before this one');
  for (const seat of [4, -2, '1', undefined]) room.handlers.lobby({ size: 3, seats: [], seat }, 'h');
  assert.equal(g.seat, 2, 'a seat that is no seat changes nothing');
  room.handlers.lobby({ size: 3, seats: [], seat: 1 }, 'x');
  assert.equal(g.seat, 2, 'only the host says');
  g.close();
});

test('a three-way tap cycle resolves without waiting out TAP_WAIT_MS', async () => {
  const t = createTable({ seed: 10, seats: 3 });
  t.state.round.taps.push({ by: 0, on: 1, turn: 1 }, { by: 1, on: 2, turn: 1 }, { by: 2, on: 0, turn: 1 });
  const t0 = Date.now();
  const bots = [0, 1, 2].map((seat) => attachBot(t, seat, { ...RIVALS[0], samples: 2 }, { pace: 0, rng: createRng(seat), tapWait: 5000 }));
  await until(() => t.state.round.turn === 2, 6000);
  assert.ok(Date.now() - t0 < 2000, `${Date.now() - t0} ms: the cycle's first seat in initiative order should lock at once`);
  bots.forEach((b) => b.stop());
});

test('three browsers play a turn over the hub; nobody sees another hand', async () => {
  const { rooms, connect } = createMemoryHub(3);
  const h = hostSession({ room: rooms[0], lobby: lobbyFor(), makeTable: (S) => makeTable(S, { seed: 9 }) });
  const views = [null, null];
  const guests = [1, 2].map((i) => guestSession({ room: rooms[i], name: ['Agent Owl', 'Agent Pike'][i - 1], token: String(i).repeat(16), onView: (v) => (views[i - 1] = v), onLobby: () => {} }));
  connect();
  await until(() => h.lobby.seats.filter((s) => s.kind === 'guest').length === 2);
  const t = h.start();
  await until(() => views[0] && views[1]);
  assert.deepEqual(views.map((v) => v.seat), [1, 2]);
  t.act(0, { a: 'lock', ...t.view(0).round.legal[0] });
  for (const [i, g] of guests.entries()) g.act({ a: 'lock', ...views[i].round.legal[0] });
  await until(() => views[0].round.turn === 2 && views[1].round.turn === 2);
  for (const v of views) assert.ok(v.round.hand.every((c) => c.owner === v.seat));
  guests.forEach((g) => g.close());
  h.close();
});
