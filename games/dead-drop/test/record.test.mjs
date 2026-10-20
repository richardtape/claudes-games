// The table's round records (Phase 4): every act goes into the round's record, and when a round ends each
// seat that lost gets its one that got away, in its own view only; `missed` gathers them for the match.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { createTable, attachBot, restoreTable, hostSession, guestSession } from '../js/session.js';
import { createMemoryPair } from '../../../shared/net.js';
import { createLobby } from '../js/lobby.js';
import { highlights, posterData } from '../js/casefile.js';
import { replayRound } from '../js/replay.js';
import { RIVALS } from '../js/data.js';
import { createRng } from '../../../shared/rng.js';
import { setHand } from './helpers.mjs';

const CITIES = ['moscow', 'monaco', 'berlin'];
/** replay.test.mjs's late swing: seat 0 drops its last-turn Heavy in Moscow and loses Berlin 6 to 7. */
const LATE_SWING = [
  [['sleeper', 0], ['heavy', 1]],
  [['veteran', 2], ['sleeper', 2]],
  [['handler', 1], ['handler', 2]],
  [['mole', 1], ['veteran', 0]],
  [['jammer', 0], ['jammer', 1]],
  [['heavy', 0], ['mole', 1]],
];
function lateSwingTable() {
  const t = createTable({ seed: 22, cities: CITIES });
  setHand(t.state, 0, ['sleeper', 'veteran', 'handler', 'mole', 'jammer', 'heavy']);
  setHand(t.state, 1, ['heavy', 'sleeper', 'handler', 'veteran', 'jammer', 'mole']);
  return t;
}
const inHand = (t, seat, kind) => t.state.round.hands[seat].find((u) => t.state.round.cards[u].kind === kind);
/** Lock turns `from`..`to` - 1 of the late swing through the table, as players would. */
function swing(t, from = 0, to = 6) {
  for (const moves of LATE_SWING.slice(from, to))
    moves.forEach(([kind, city], seat) => assert.ok(t.act(seat, { a: 'lock', uid: inHand(t, seat, kind), city }), `seat ${seat}: ${kind} to ${city}`));
}
const roundTrip = (t) => restoreTable(JSON.parse(JSON.stringify(t.toJSON())));
const views = (t) => [-1, ...t.state.scores.keys()].map((s) => t.view(s));
/** Every seat locks its first legal drop. */
const firstDrops = (t) => t.state.scores.forEach((_, s) => !t.state.round.plans[s] && t.act(s, { a: 'lock', ...t.view(s).round.legal[0] }));

test('the table records the round and sends the loser its line, in its own view only', () => {
  const t = lateSwingTable();
  assert.equal(t.replay, null);
  assert.deepEqual([t.gotAway, t.missed], [null, [[], []]]);
  swing(t, 0, 1);
  assert.equal(t.replay.round, 0);
  assert.equal(t.replay.match, t.matchId);
  assert.equal(t.replay.turns.length, 1);
  swing(t, 1);
  assert.equal(t.state.phase, 'round-over');
  assert.equal(t.state.round.result.winner, 1);
  assert.equal(t.replay, null, 'the record is done with once the round is over');
  const heavy = Object.values(t.state.round.cards).find((c) => c.origin === 0 && c.kind === 'heavy').uid;
  const g = t.view(0).gotAway;
  assert.deepEqual(g, { turn: 6, was: { uid: heavy, city: 0, kind: 'heavy' }, instead: { uid: heavy, city: 2, kind: 'heavy' }, held: 2 });
  assert.equal(t.view(1).gotAway, null);
  assert.equal(t.view(-1).gotAway, null);
  assert.deepEqual(t.missed, [[{ no: 0, ...g }], []]);
  assert.ok(views(t).every((v) => !('missed' in v)), 'missed only at match-over');
  assert.deepEqual(roundTrip(t).view(0).gotAway, g, 'a save keeps the line');
  assert.deepEqual(roundTrip(t).missed, t.missed);
  t.act(0, { a: 'next' });
  assert.deepEqual(t.view(0).gotAway, g, 'still on the result until the next round begins');
  t.act(1, { a: 'next' });
  assert.equal(t.state.roundNo, 1);
  assert.equal(t.view(0).gotAway, null);
  assert.equal(t.gotAway, null);
  firstDrops(t);
  assert.equal(t.replay.round, 1);
  assert.equal(t.replay.start.round.no, 1);
});

test('a record started before a state swap is never used', () => {
  const t = createTable({ seed: 4 });
  assert.ok(t.act(0, { a: 'lock', ...t.view(0).round.legal[0] }));
  const old = t.replay;
  assert.ok(old);
  for (const seed of [5, 4]) {
    // As __game.stage() does: a fresh deal on the same table (same match id, round 0), seed 4 even the same deal.
    const fresh = createTable({ seed }).state;
    const cards = JSON.parse(JSON.stringify(fresh.round.cards));
    t.state = fresh;
    const before = t.replay;
    assert.ok(t.act(0, { a: 'lock', ...t.view(0).round.legal[0] }));
    assert.notEqual(t.replay, before, `seed ${seed}: a new record`);
    assert.deepEqual(t.replay.start.round.cards, cards);
    assert.deepEqual(t.replay.start.round.plans, [null, null], 'started before the lock');
  }
  assert.notDeepEqual(createTable({ seed: 5 }).state.round.cards, old.start.round.cards);
});

test('a save without a record (a Phase 3 save, or restored mid-round) gets no line for that round, and the next round records', () => {
  const t = lateSwingTable();
  swing(t, 0, 2);
  const saved = JSON.parse(JSON.stringify(t.toJSON()));
  for (const k of ['replay', 'gotAway', 'missed']) {
    assert.ok(k in saved);
    delete saved[k];
  }
  const r = restoreTable(saved);
  assert.deepEqual([r.replay, r.gotAway, r.missed], [null, null, [[], []]]);
  swing(r, 2);
  assert.equal(r.state.round.result.winner, 1, 'the same round as the late swing');
  assert.equal(r.replay, null, 'turn 3 is no clean start');
  assert.deepEqual(r.gotAway.seats, [null, null]);
  assert.equal(r.view(0).gotAway, null);
  assert.deepEqual(r.missed, [[], []]);
  r.act(0, { a: 'next' });
  r.act(1, { a: 'next' });
  firstDrops(r);
  assert.equal(r.replay.round, 1);
  // Malformed fields restore as nothing.
  for (const bad of [{ replay: { start: {}, turns: [] } }, { replay: { start: { round: {} }, turns: 'x' } }, { missed: [[]] }, { missed: 'x' }, { missed: [[{ no: 0 }], []] }, { gotAway: { seats: 'x' } }, { gotAway: { match: 'abcdefgh', round: 0, seats: ['x', null] } }]) {
    const m = restoreTable({ ...JSON.parse(JSON.stringify(t.toJSON())), ...bad });
    if ('replay' in bad) assert.equal(m.replay, null);
    if ('missed' in bad) assert.deepEqual(m.missed, [[], []]);
    if ('gotAway' in bad) assert.equal(m.gotAway, null);
  }
});

test('a broken record restored mid-round never freezes the table: no line, the record cleared', () => {
  const t = lateSwingTable();
  swing(t, 0, 2);
  const good = JSON.parse(JSON.stringify(t.toJSON()));
  assert.equal(restoreTable(good).replay.turns.length, 2, 'the setup: a well-formed record restores');
  const broken = (f) => {
    const saved = JSON.parse(JSON.stringify(good));
    f(saved.replay);
    return saved;
  };
  // Entries restoreTable refuses: the record is dropped at once.
  const refused = [
    (r) => (r.turns[0] = { turn: 1 }),
    (r) => (r.turns[0].turn = '1'),
    (r) => (r.turns[1] = null),
    (r) => (r.turns[0].acts = [{ seat: 0, a: 'jump' }]),
    (r) => (r.turns[0].acts = [{ seat: '0', a: 'fold' }]),
    (r) => (r.turns[0].acts = [{ seat: 0, a: 'respond' }]),
    (r) => (r.turns[0].plans = [r.turns[0].plans[0]]),
    (r) => (r.turns[0].plans = [null, r.turns[0].plans[1]]),
    (r) => (r.open = [{ a: 'escalate' }]),
  ];
  // A record of the right shape whose replay throws in the engine (its deal has no cards): the round's end catches it.
  const kept = (r) => (r.start.round.cards = {});
  for (const [i, f] of [...refused, kept].entries()) {
    const r = restoreTable(broken(f));
    assert.equal(r.replay === null, i < refused.length, `case ${i}: ${i < refused.length ? 'refused' : 'kept'} at restore`);
    assert.doesNotThrow(() => swing(r, 2), `case ${i}: the round plays out`);
    assert.equal(r.state.phase, 'round-over');
    assert.equal(r.replay, null);
    assert.deepEqual(r.gotAway.seats, [null, null]);
    assert.equal(r.view(0).gotAway, null);
    assert.deepEqual(r.missed, [[], []]);
    assert.ok(r.seq > good.seq, `case ${i}: the change went out`);
  }
});

test('a restored record whose events recapOf can\'t read (an unknown kind, a city off the board) still ends the round, with outs null', () => {
  const t = lateSwingTable();
  swing(t, 0, 2);
  const saved = JSON.parse(JSON.stringify(t.toJSON()));
  saved.replay.events.push({ t: 'out', kind: 'nobody', city: 9 });
  const r = restoreTable(saved);
  assert.ok(r.replay, 'the setup: restoreTable keeps a record whose events are an array');
  assert.doesNotThrow(() => swing(r, 2), 'the round plays out');
  assert.equal(r.state.phase, 'round-over');
  assert.equal(r.recap.length, 1);
  assert.equal(r.recap[0].outs, null);
  assert.equal(r.recap[0].no, 0);
  assert.equal(r.replay, null, 'the record is done with');
  assert.ok(r.seq > saved.seq, 'the change went out');
  // Only the recap's take-outs fell back: the one that got away still comes from the record's turns.
  swing(t, 2);
  assert.ok(t.view(0).gotAway);
  assert.deepEqual(r.view(0).gotAway, t.view(0).gotAway);
});

test('a save mid-round keeps its record: the restored table still finds the line', () => {
  const t = lateSwingTable();
  swing(t, 0, 3);
  const r = roundTrip(t);
  assert.deepEqual(r.replay, JSON.parse(JSON.stringify(t.replay)));
  swing(r, 3);
  swing(t, 3);
  assert.ok(t.view(0).gotAway);
  assert.deepEqual(r.view(0).gotAway, t.view(0).gotAway);
});

test('missed: at match-over only, each seat its own list, a spectator none', () => {
  const t = createTable({ seed: 31 });
  const rng = createRng(31);
  let lines = 0;
  let seen = null;
  t.onChange(() => {
    if (t.gotAway && t.gotAway !== seen) {
      seen = t.gotAway;
      lines += t.gotAway.seats.filter(Boolean).length;
    }
    if (t.state.phase !== 'match-over') assert.ok(views(t).every((v) => !('missed' in v)));
  });
  for (let guard = 0; t.state.phase !== 'match-over'; guard++) {
    assert.ok(guard < 2000, 'the match ends');
    const S = t.state;
    if (S.phase === 'round-over') {
      t.act(0, { a: 'next' });
      t.act(1, { a: 'next' });
    } else if (S.round.pending) for (const seat of S.round.pending.from) t.act(seat, { a: 'respond', accept: true });
    else
      for (const seat of [0, 1]) {
        const legal = t.view(seat).round.legal;
        if (!S.round.plans[seat] && legal.length) t.act(seat, { a: 'lock', ...rng.pick(legal) });
      }
  }
  assert.ok(lines > 0, 'random play leaves lines to find');
  assert.equal(t.missed[0].length + t.missed[1].length, lines);
  for (const seat of [0, 1]) {
    const v = t.view(seat);
    assert.deepEqual(v.missed, t.missed[seat]);
    assert.notEqual(v.missed, t.missed[seat], 'a copy');
    assert.ok(v.missed.every((m) => Number.isInteger(m.no) && m.no <= t.state.roundNo && m.was && m.instead));
  }
  assert.deepEqual(t.view(-1).missed, []);
  // A rematch starts the list again.
  t.act(0, { a: 'rematch' });
  t.act(1, { a: 'rematch' });
  assert.deepEqual(t.missed, [[], []]);
  assert.equal(t.view(0).gotAway, null);
});

const until = async (cond, ms) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};

/** Seat's hand at the start of `turn` in the recorded round (before that turn's acts). */
function handAt(rec, seat, turn) {
  const k = rec.turns.findIndex((T) => T.turn === turn);
  assert.ok(k >= 0, `turn ${turn} is recorded`);
  const s = replayRound({ ...rec, turns: rec.turns.slice(0, k) });
  return s.round.hands[seat];
}

test('leak: at 2, 3 and 4 seats a line names only its own seat’s cards and reaches only that seat', async () => {
  const found = { 2: 0, 3: 0, 4: 0 };
  for (const n of [2, 3, 4])
    for (let i = 0; i < 2; i++) {
      const t = createTable({ seed: `leak:${n}:${i}`, seats: n });
      const problems = [];
      let rec = null;
      let seen = null;
      let rounds = 0;
      let lines = 0;
      t.onChange(() => {
        try {
          if (t.replay) rec = t.replay;
          if (!t.gotAway || t.gotAway === seen) return;
          seen = t.gotAway;
          rounds++;
          const S = t.state;
          assert.deepEqual([t.gotAway.match, t.gotAway.round], [t.matchId, S.roundNo]);
          if (S.round.result.folded === null) {
            const again = replayRound(rec);
            assert.deepEqual(again.round.result, S.round.result, 'the round replays as played');
          }
          assert.equal(t.view(-1).gotAway, null);
          t.gotAway.seats.forEach((g, seat) => {
            assert.deepEqual(t.view(seat).gotAway, g);
            if (!g) return;
            lines++;
            assert.ok(S.round.result.winner !== null && S.round.result.winner !== seat && !S.round.folded.some(Boolean));
            const hand = handAt(rec, seat, g.turn);
            for (const uid of [g.was.uid, g.was.partner, g.instead.uid, g.instead.partner].filter(Boolean)) {
              assert.ok(hand.includes(uid), `${n} seats: ${uid} was in seat ${seat}’s hand on turn ${g.turn}`);
              assert.equal(uid[0], 'abcd'[seat]);
            }
            for (let o = 0; o < n; o++) if (o !== seat) assert.notDeepEqual(t.view(o).gotAway, g);
          });
        } catch (e) {
          problems.push(e);
        }
      });
      const bots = Array.from({ length: n }, (_, s) => attachBot(t, s, { ...RIVALS[0], samples: 2 }, { pace: 0, rng: createRng(i * 4 + s), tapWait: 50 }));
      try {
        await until(() => t.state.phase === 'match-over' || problems.length, 60000);
      } finally {
        bots.forEach((b) => b.stop());
      }
      if (problems.length) throw problems[0];
      assert.ok(rounds >= 1);
      for (let s = 0; s < n; s++) assert.deepEqual(t.view(s).missed, t.missed[s]);
      assert.equal(t.missed.flat().length, lines);
      found[n] += lines;
    }
  for (const n of [2, 3, 4]) assert.ok(found[n] > 0, `${n} seats: lines to check`);
});

// ── Phase 4 Task 5: the per-round recap, and tolerance both ways ──

const lobbyFor = () => createLobby({ host: { name: 'Agent Fox', token: 'h'.repeat(16) } });
const untilSoon = async (cond, ms = 4000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 2));
  }
};

/** One step of seeded play through `t.act`: a next, the answers, or every seat's random legal drop. */
function step(t, rng) {
  const S = t.state;
  if (S.phase === 'round-over') {
    t.act(0, { a: 'next' });
    t.act(1, { a: 'next' });
  } else if (S.round.pending) for (const seat of S.round.pending.from) t.act(seat, { a: 'respond', accept: true });
  else
    for (const seat of S.scores.keys()) {
      const legal = t.view(seat).round.legal;
      if (!S.round.plans[seat] && legal.length) t.act(seat, { a: 'lock', ...rng.pick(legal) });
    }
}
/** Play a seeded table to match-over, calling `each(t)` after every step. */
function playOut(t, rng, each = () => {}) {
  for (let guard = 0; t.state.phase !== 'match-over'; guard++) {
    assert.ok(guard < 2000, 'the match ends');
    step(t, rng);
    each(t);
  }
}

test('the table keeps a recap: one per round, in views at match-over only, saved, restored, emptied by a rematch', () => {
  const t = createTable({ seed: 31 });
  const rng = createRng(31);
  assert.deepEqual(t.recap, []);
  let firstDone = false;
  playOut(t, rng, () => {
    if (t.state.phase !== 'match-over') assert.ok(views(t).every((v) => !('recap' in v)), 'no recap before match-over');
    if (!firstDone && t.state.phase === 'round-over') {
      firstDone = true;
      assert.equal(t.recap.length, 1);
      assert.equal(t.recap[0].no, 0);
      assert.ok(Array.isArray(t.recap[0].outs), 'a played round has its record, so its take-outs');
    }
  });
  assert.equal(t.recap.length, t.state.history.length);
  assert.equal(t.view(-1).recap.length, t.state.history.length);
  assert.deepEqual(t.view(0).recap, t.recap);
  assert.notEqual(t.view(0).recap, t.recap, 'a copy');
  assert.deepEqual(roundTrip(t).recap, t.recap, 'the recap survives a save');
  const saved = JSON.parse(JSON.stringify(t.toJSON()));
  delete saved.recap;
  assert.deepEqual(restoreTable(saved).recap, [], 'a save without a recap restores with none');
  saved.recap = 'junk';
  assert.deepEqual(restoreTable(saved).recap, []);
  t.act(0, { a: 'rematch' });
  t.act(1, { a: 'rematch' });
  assert.deepEqual(t.recap, []);
});

test('a round with no record (a Phase 3 save restored mid-round) still gets a recap, with outs null', () => {
  const t0 = createTable({ seed: 31 });
  const rng = createRng(31);
  step(t0, rng); // turn 1 locked and resolved or waiting: either way the round is under way
  const saved = JSON.parse(JSON.stringify(t0.toJSON()));
  delete saved.replay;
  delete saved.recap;
  const t = restoreTable(saved);
  assert.equal(t.replay, null);
  for (let guard = 0; t.state.phase === 'plan'; guard++) {
    assert.ok(guard < 200, 'the round ends');
    step(t, rng);
  }
  assert.equal(t.recap.length, 1);
  assert.equal(t.recap[0].outs, null);
  assert.equal(t.recap[0].no, 0);
  assert.equal(t.recap[0].board.length, 3);
});

test('a Phase 4 guest at a Phase 3 host: views without gotAway, missed or recap still make a case file', async () => {
  const { a, b, connect } = createMemoryPair();
  const strip = (v) => { const out = { ...v }; delete out.gotAway; delete out.missed; delete out.recap; return out; };
  const host = hostSession({ room: a, lobby: lobbyFor(), makeTable: (S) => {
    const t = createTable({ seed: 2, names: S.names });
    const real = t.view;
    t.view = (seat) => strip(real(seat));
    return t;
  } });
  let view = null;
  const guest = guestSession({ room: b, code: 'ROOMAA', name: 'Agent Lynx', token: '1'.repeat(16), onView: (v) => (view = v) });
  connect();
  await untilSoon(() => guest.seat === 1);
  host.start();
  await untilSoon(() => view);
  assert.equal('gotAway' in view, false);
  // The same stripping on a finished match, where the history is populated.
  const over = strip(fourViews().at(-2));
  assert.ok(over.history.length > 0);
  assert.equal('missed' in over, false);
  assert.equal('recap' in over, false);
  assert.deepEqual(highlights(over.recap, 0), highlights([], 0));
  assert.equal(posterData(over, 0, { label: (s) => over.names[s] }).rounds.length, over.history.length);
  guest.close();
  host.close();
});

// Recorded at finalisation from 497bad4: createTable({ seed: 2 }).view(s) for seat 0 and the spectator, in plan and at
// round-over (the same 26 keys in each). Nullable keys (winBy, winner, twist, clock) are checked for presence only.
const P3_TYPES = { seat: 'number', target: 'number', scores: 'array', tokens: 'array', strips: 'array', reel: 'number', filmRule: 'string', roundNo: 'number', phase: 'string', history: 'array', round: 'object', roster: 'array', cityPool: 'array', names: 'array', ready: 'array', rematch: 'array', seq: 'number', turnSeq: 'number', matchId: 'string', standIn: 'array', here: 'array', timer: 'number' };
const P3_NULLABLE = ['winBy', 'winner', 'twist', 'clock'];
const typeOf = (x) => (x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x);

/** Views of seat 0 and the spectator in plan, at round-over and at match-over of a seeded table. */
function fourViews() {
  const t = createTable({ seed: 2 });
  const rng = createRng(2);
  const out = [];
  const grab = () => out.push(t.view(0), t.view(-1));
  grab();
  let atRound = false;
  playOut(t, rng, () => {
    if (!atRound && t.state.phase === 'round-over') { atRound = true; grab(); }
  });
  grab();
  return out;
}

test('a Phase 3 guest at a Phase 4 host: every key a 497bad4 view carried is still there, with its type', () => {
  const vs = fourViews();
  assert.equal(vs.length, 6);
  for (const v of vs) {
    for (const [k, ty] of Object.entries(P3_TYPES)) assert.equal(typeOf(v[k]), ty, `${k} keeps its type`);
    for (const k of P3_NULLABLE) assert.ok(k in v, `${k} is still there`);
    const extra = Object.keys(v).filter((k) => !(k in P3_TYPES) && !P3_NULLABLE.includes(k));
    assert.ok(extra.every((k) => ['gotAway', 'missed', 'recap'].includes(k)), `only Phase 4 keys are new: ${extra}`);
  }
});

test('restoring a save with a malformed recap drops it rather than letting highlights throw', () => {
  const t = createTable({ seed: 31 });
  playOut(t, createRng(31));
  const good = JSON.parse(JSON.stringify(t.toJSON()));
  assert.ok(good.recap.length > 0);
  for (const patch of [{ outs: [null] }, { board: [5] }, { board: [[5]] }, { board: [[[null]]] }]) {
    const bad = JSON.parse(JSON.stringify(good));
    Object.assign(bad.recap[0], patch);
    const r = restoreTable(bad);
    assert.deepEqual(r.recap, [], JSON.stringify(patch));
    assert.doesNotThrow(() => highlights(r.recap, 0));
  }
});
