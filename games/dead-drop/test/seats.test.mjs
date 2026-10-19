import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { DECK, START_HAND, MAX_HAND, TURNS } from '../js/data.js';

const m = (n, cities, seed = 7) => E.newMatch({ seed, cities, seats: n });
const uidOf = (s, seat, kind) => Object.values(s.round.cards).find((c) => c.origin === seat && c.id0 === kind).uid;
function give(s, seat, kind) {
  const R = s.round;
  const uid = uidOf(s, seat, kind);
  if (!R.hands[seat].includes(uid)) {
    const i = R.decks[seat].indexOf(uid);
    R.decks[seat][i] = R.hands[seat].shift();
    R.hands[seat].push(uid);
  }
  return uid;
}
/** Every seat drops ([kind, city], or null to pass) and the turn resolves. */
function play(s, ...moves) {
  moves.forEach((mv, seat) => {
    if (!mv) s.round.plans[seat] = { pass: true };
    else assert.ok(E.lock(s, seat, { uid: give(s, seat, mv[0]), city: mv[1] }), `seat ${seat} could not drop ${mv[0]} in city ${mv[1]}`);
  });
  return E.resolveTurn(s);
}
const power = (s, seat, kind) => E.powerOf(s, uidOf(s, seat, kind));
const inPlay = (s, seat, kind) => s.round.cards[uidOf(s, seat, kind)].city !== null;

test('a match seats 2 to 4 players, each with a full deck and hand', () => {
  for (const n of [2, 3, 4]) {
    const s = E.newMatch({ seed: 'n', seats: n });
    assert.equal(E.seatCount(s), n);
    assert.deepEqual(s.scores, Array(n).fill(0));
    assert.deepEqual(s.round.hands.map((h) => h.length), Array(n).fill(START_HAND));
    assert.equal(Object.keys(s.round.cards).length, n * DECK.length);
    assert.ok(s.round.cities.every((c) => c.sides.length === n));
    assert.deepEqual(s.round.hands.map((h) => h[0][0]), ['a', 'b', 'c', 'd'].slice(0, n));
  }
  for (const n of [1, 5, 2.5]) assert.throws(() => E.newMatch({ seats: n }), /seats must be 2 to 4/);
});

test('initiative passes round the table each turn and moves on each round', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((t) => E.initiativeOf(3, 0, t)), [0, 1, 2, 0, 1, 2]);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((t) => E.initiativeOf(3, 1, t)), [1, 2, 0, 1, 2, 0]);
  for (let r = 0; r < 6; r++) for (let t = 1; t <= 6; t++) assert.equal(E.initiativeOf(2, r, t), (r + t + 1) % 2, 'two seats: as Phase 1');
  assert.deepEqual(E.turnOrder(4, 2), [2, 3, 0, 1]);
  assert.deepEqual(E.rivalsOf(4, 1), [2, 3, 0]);
  assert.deepEqual(E.rivalsOf(2, 0), [1]);
  assert.deepEqual(E.rivalsOf(3, -1), [0, 1, 2], 'a spectator has every seat as a rival');
});

test('marks: two players mark each other; with more, marks rotate and nobody marks themselves', () => {
  for (let r = 0; r < 5; r++) assert.deepEqual([0, 1].map((s) => E.markOf(2, s, r)), [1, 0]);
  assert.deepEqual([0, 1, 2].map((s) => E.markOf(3, s, 0)), [1, 2, 0]);
  assert.deepEqual([0, 1, 2].map((s) => E.markOf(3, s, 1)), [2, 0, 1]);
  assert.deepEqual([0, 1, 2, 3].map((s) => E.markOf(4, s, 2)), [3, 0, 1, 2]);
  for (const n of [3, 4])
    for (let r = 0; r < 6; r++) {
      const marks = [...Array(n).keys()].map((s) => E.markOf(n, s, r));
      assert.equal(new Set(marks).size, n);
      assert.ok(marks.every((x, s) => x !== s));
    }
});

test('a turn waits for every seat, then resolves in initiative order', () => {
  const s = m(3, ['berlin', 'monaco', 'tangier']);
  assert.equal(s.round.initiative, 0);
  for (const seat of [0, 1]) E.lock(s, seat, E.legalDrops(s, seat)[0]);
  assert.equal(E.ready(s), false, 'seat 2 has not locked');
  for (const seat of [0, 1]) E.unlock(s, seat);
  let ev = play(s, ['heavy', 0], ['heavy', 1], ['heavy', 2]);
  assert.deepEqual(ev.filter((e) => e.t === 'drop').map((e) => e.seat), [0, 1, 2]);
  ev = play(s, ['mole', 1], ['mole', 2], ['mole', 0]);
  assert.deepEqual(ev.filter((e) => e.t === 'drop').map((e) => e.seat), [1, 2, 0]);
});

test('rival tricks reach every other seat: Mole, Jammer, Assassin, Tripwire', () => {
  const s = m(3, ['berlin', 'monaco', 'tangier']);
  play(s, ['heavy', 0], ['mole', 0], ['mole', 0]);
  assert.equal(power(s, 0, 'heavy'), 6 - 1 - 1, 'two rival Moles stack');
  assert.equal(power(s, 1, 'mole'), 2 - 1, 'only the other rival’s Mole counts');
  play(s, ['jammer', 1], ['handler', 1], ['veteran', 1]);
  assert.equal(power(s, 2, 'veteran'), 3, 'seat 0’s Jammer switches off seat 2’s lone-wolf bonus');
  const a = m(3, ['monaco', 'berlin', 'tangier']);
  play(a, ['lookout', 2], ['heavy', 0], ['handler', 0]);
  play(a, ['assassin', 0], ['mole', 1], ['mole', 1]);
  assert.equal(inPlay(a, 1, 'heavy'), false, 'the strongest face-up agent of any rival');
  assert.equal(inPlay(a, 2, 'handler'), true);
  const t = m(3, ['monaco', 'berlin', 'tangier']);
  play(t, ['tripwire', 0], ['lookout', 1], ['heavy', 0]);
  assert.equal(inPlay(t, 2, 'heavy'), false, 'a Tripwire catches either rival');
  play(t, ['mole', 1], ['veteran', 0], ['mole', 2]);
  assert.equal(inPlay(t, 1, 'veteran'), true, 'and is spent');
});

test('Double Agent and Impostor follow your mark', () => {
  const d = m(3, ['berlin', 'monaco', 'tangier']);
  play(d, ['double', 0], ['heavy', 2], ['lookout', 1]); // round 0: seat 0 marks seat 1
  assert.equal(d.round.cards[uidOf(d, 0, 'double')].city, 2);
  const i = m(3, ['berlin', 'monaco', 'tangier']);
  i.roundNo = 1;
  E.startRound(i, { cities: ['berlin', 'monaco', 'tangier'] }); // round 1: seat 0 marks seat 2
  play(i, ['impostor', 0], ['heavy', 1], ['lookout', 2]);
  assert.equal(i.round.cards[uidOf(i, 0, 'impostor')].kind, 'lookout');
});

test('Havana passes every agent there one seat along', () => {
  const h = m(3, ['havana', 'monaco', 'tangier']);
  play(h, ['heavy', 0], ['mole', 0], ['lookout', 1]);
  play(h, null, null, null);
  play(h, null, null, null);
  const ev = play(h, null, null, null);
  assert.ok(ev.some((e) => e.t === 'havana'));
  assert.equal(h.round.cards[uidOf(h, 0, 'heavy')].owner, 1);
  assert.equal(h.round.cards[uidOf(h, 1, 'mole')].owner, 2);
  assert.deepEqual(h.round.cities[0].sides.map((x) => x.length), [0, 1, 1]);
});

test('leaderOf: the single top total among seats with agents there; Lisbon the single lowest', () => {
  assert.equal(E.leaderOf('monaco', [6, 6, 1], [1, 1, 1]), null, 'a tie at the top holds nothing');
  assert.equal(E.leaderOf('monaco', [6, 5, 1], [1, 1, 1]), 0);
  assert.equal(E.leaderOf('monaco', [0, 0, 0], [1, 0, 0]), null, 'a lone zero holds nothing');
  assert.equal(E.leaderOf('monaco', [0, 2, 0, 0], [1, 1, 0, 0]), 1);
  assert.equal(E.leaderOf('lisbon', [1, 6, 6], [1, 1, 1]), 0);
  assert.equal(E.leaderOf('lisbon', [3, 0, 0], [1, 0, 0]), 0, 'seats with nobody there are not lower');
  assert.equal(E.leaderOf('lisbon', [1, 1, 6], [1, 1, 1]), null);
  assert.equal(E.leaderOf('lisbon', [0, 0], [1, 0]), 0, 'alone in Lisbon, even at zero');
  assert.equal(E.leaderOf('berlin', [0, 0, 0], [0, 0, 0]), null);
});

test('roundWinner: most cities, then the tie-break among the tied seats only', () => {
  const ids = ['monaco', 'berlin', 'helsinki'];
  assert.equal(E.roundWinner(ids, [0, 0, 1], [[3, 1], [4, 2], [1, 5]]), 0);
  assert.equal(E.roundWinner(ids, [0, 1, null], [[3, 1], [1, 4], [2, 2]]), 1, 'two seats: 6 v 7 on power');
  assert.equal(E.roundWinner(ids, [0, 1, null], [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 9, 9]]), null, 'seats 2 and 3 are not in the tie');
  assert.equal(E.roundWinner(ids, [0, 1, null], [[1, 0, 0, 0], [0, 2, 0, 0], [0, 0, 9, 9]]), 1);
  assert.deepEqual(E.tiebreakTotals(['lisbon', 'helsinki', 'berlin'], [[6, 0, 2], [1, 3, 0], [0, 0, 4]], 'out'), [1, 3, 4]);
});

test('matchWinner: the single leader at or past the target', () => {
  assert.equal(E.matchWinner([10, 4], 10), 0);
  assert.equal(E.matchWinner([10, 10], 10), null, 'level at the top plays on');
  assert.equal(E.matchWinner([9, 12, 12], 10), null);
  assert.equal(E.matchWinner([11, 12, 3], 10), 1);
  assert.equal(E.matchWinner([9, 9, 9, 9], 10), null);
});

test('stakes stay two-player until Phase 2b-i', () => {
  const s = m(3, ['berlin', 'monaco', 'tangier']);
  const before = JSON.stringify(s);
  assert.equal(E.canEscalate(s, 0), false);
  assert.equal(E.escalate(s, 0), false);
  assert.equal(E.respond(s, 1, true), false);
  assert.equal(E.fold(s, 2), false);
  assert.equal(JSON.stringify(s), before);
});

test('a turn where nobody can drop resolves by itself at three seats', () => {
  const s = m(3, ['moscow', 'helsinki', 'venice']);
  play(s, ['heavy', 0], ['heavy', 0], ['heavy', 0]);
  play(s, ['mole', 0], ['mole', 0], ['mole', 0]);
  const ev = play(s, ['handler', 0], ['handler', 0], ['handler', 0]);
  assert.equal(s.round.turn, 5);
  assert.equal(ev.filter((e) => e.t === 'pass').length, 3);
});

test('a seat outside the table sees as a spectator and cannot act', () => {
  const s = m(3, ['berlin', 'monaco', 'tangier']);
  for (const seat of [-1, 3, 7, '1', undefined, null]) {
    const v = E.viewFor(s, seat);
    assert.deepEqual([v.round.hand, v.round.myDeck, v.round.legal, v.round.plan, v.round.rivalLocked], [[], [], [], null, false], String(seat));
    assert.equal(E.lock(s, seat, { uid: s.round.hands[0][0], city: 0 }), false);
    assert.equal(E.unlock(s, seat), false);
  }
  const two = m(2, ['berlin', 'monaco', 'tangier']);
  const before = JSON.stringify(two);
  assert.equal(E.escalate(two, 2), false);
  assert.equal(E.fold(two, -1), false);
  assert.equal(JSON.stringify(two), before);
});

test('rivalLocked waits for every rival', () => {
  const s = m(3, ['berlin', 'monaco', 'tangier']);
  E.lock(s, 1, E.legalDrops(s, 1)[0]);
  assert.equal(E.viewFor(s, 0).round.rivalLocked, false);
  E.lock(s, 2, E.legalDrops(s, 2)[0]);
  assert.equal(E.viewFor(s, 0).round.rivalLocked, true);
  assert.equal(E.viewFor(s, 1).round.rivalLocked, false, 'seat 0 has not locked');
});

/** Every problem with what `seat` may see in `state`; [] when the view is clean. */
function leaks(state, seat) {
  const R = state.round;
  const n = E.seatCount(state);
  const player = Number.isInteger(seat) && seat >= 0 && seat < n;
  const v = E.viewFor(state, seat);
  const out = [];
  const secret = new Set();
  R.hands.forEach((h, s) => s !== seat && h.forEach((u) => secret.add(u)));
  R.decks.forEach((d, s) => s !== seat && d.forEach((u) => secret.add(u)));
  for (const c of Object.values(R.cards)) if (c.faceDown && c.owner !== seat) secret.add(c.uid);
  (function walk(o, path) {
    if (!o || typeof o !== 'object') return;
    for (const k of ['cards', 'hands', 'decks', 'plans', 'rng']) if (Object.hasOwn(o, k)) out.push(`${path}.${k}: engine internals`);
    if (secret.has(o.uid) && ['kind', 'id0', 'power', 'base', 'as'].some((k) => o[k] !== undefined && o[k] !== null)) out.push(`${path}: names secret card ${o.uid}`);
    for (const [k, x] of Object.entries(o)) walk(x, `${path}.${k}`);
  })(v, '$');
  if (JSON.stringify(v.round.hand.map((c) => c.uid)) !== JSON.stringify(player ? R.hands[seat] : [])) out.push('$.round.hand is not exactly this seat’s hand');
  if (!player && (v.round.myDeck.length || v.round.plan || v.round.legal.length)) out.push('a spectator sees a deck, a plan or legal drops');
  if (player && v.round.myDeck.length !== R.decks[seat].length) out.push('$.round.myDeck is not this seat’s deck');
  return out;
}

/** Random legal play at n seats; calls check(state) after every action. Escalates now and then. */
function randomMatch(n, seed, check) {
  const s = E.newMatch({ seed, seats: n, target: 6 });
  let r = seed >>> 0;
  const next = () => (r = (r * 1103515245 + 12345) >>> 0);
  for (let rounds = 0; s.phase !== 'match-over' && rounds < 40; ) {
    if (s.phase === 'round-over') {
      E.nextRound(s);
      rounds++;
      continue;
    }
    if (next() % 97 === 0) {
      const ok = E.escalate(s, next() % n);
      if (n > 2) assert.equal(ok, false, 'escalation works only at two seats');
    }
    if (s.round.pending) E.respond(s, 1 - s.round.pending.by, next() % 5 !== 0);
    if (s.phase !== 'plan') continue;
    for (let seat = 0; seat < n; seat++) {
      if (s.round.plans[seat]) continue;
      const legal = E.legalDrops(s, seat);
      assert.ok(E.lock(s, seat, legal[next() % legal.length]));
      check(s);
    }
    E.resolveTurn(s);
    check(s);
  }
  return s;
}

test('property: no view at any table size shows a rival’s hand, deck or face-down card', () => {
  for (const [n, seeds] of [[2, 120], [3, 80], [4, 60]])
    for (let seed = 1; seed <= seeds; seed++)
      randomMatch(n, seed, (s) => {
        for (let seat = -1; seat < n; seat++) assert.deepEqual(leaks(s, seat), [], `${n} seats, seed ${seed}, seat ${seat}, round ${s.roundNo} turn ${s.round.turn}`);
      });
});

test('invariant: random play at 2 to 4 seats never loses a card and always finishes', () => {
  for (const [n, seeds] of [[2, 100], [3, 100], [4, 100]])
    for (let seed = 1; seed <= seeds; seed++) {
      const s = randomMatch(n, seed, (st) => {
        const R = st.round;
        const seen = [...R.hands.flat(), ...R.decks.flat(), ...R.gone.flat(), ...R.cities.flatMap((c) => c.sides.flat())];
        assert.equal(seen.length, n * DECK.length, `${n} seats, seed ${seed}: card count`);
        assert.equal(new Set(seen).size, n * DECK.length, `${n} seats, seed ${seed}: duplicates`);
        for (const c of R.cities) c.sides.forEach((side, seat) => assert.ok(side.length <= E.capacityOf(c.id) && side.every((u) => R.cards[u].owner === seat)));
        assert.ok(R.turn <= TURNS && R.hands.every((h) => h.length <= MAX_HAND));
      });
      assert.equal(s.phase, 'match-over', `${n} seats, seed ${seed} finished`);
    }
});

test('a Tripwire search goes in table order after the arriving agent’s owner', () => {
  const s = m(3, ['monaco', 'berlin', 'tangier']);
  play(s, ['tripwire', 0], ['lookout', 2], ['tripwire', 1]);
  const w0 = uidOf(s, 0, 'tripwire');
  const w2 = uidOf(s, 2, 'tripwire');
  // Seat 2's wire is the only card in city 1: move it to city 0 by hand (an arriving wire would spring on seat 0's).
  s.round.cities[1].sides[2].pop();
  s.round.cities[0].sides[2].push(w2);
  s.round.cards[w2].city = 0;
  assert.ok(s.round.cards[w0].faceDown && s.round.cards[w2].faceDown);
  play(s, ['mole', 2], ['heavy', 0], ['mole', 2]);
  assert.equal(inPlay(s, 1, 'heavy'), false);
  assert.equal(s.round.cards[w2].faceDown, false, 'seat 2 comes first after seat 1');
  assert.equal(s.round.cards[w0].faceDown, true, 'seat 0’s wire stays armed');
});

test('Assassin ties between rivals go to the later one in the owner’s table order', () => {
  for (const [owner, gone, kept] of [[0, 2, 1], [1, 0, 2]]) {
    const s = m(3, ['monaco', 'berlin', 'tangier']);
    const moves = [0, 1, 2].map((seat) => (seat === owner ? ['lookout', 2] : ['heavy', 0]));
    play(s, ...moves);
    const mv = [0, 1, 2].map((seat) => (seat === owner ? ['assassin', 0] : ['mole', 1]));
    play(s, ...mv);
    assert.equal(inPlay(s, gone, 'heavy'), false, `owner ${owner}: seat ${gone} goes`);
    assert.equal(inPlay(s, kept, 'heavy'), true);
  }
});

test('draws come in initiative order round the table, Hong Kong first', () => {
  const s = m(3, ['hongkong', 'monaco', 'tangier']);
  play(s, ['lookout', 1], ['lookout', 1], ['lookout', 1]);
  assert.equal(s.round.initiative, 1);
  const ev = play(s, ['heavy', 0], ['heavy', 0], ['heavy', 0]);
  const drawn = (why) => ev.filter((e) => e.t === 'draw' && e.why === why).map((e) => e.seat);
  assert.deepEqual(E.turnOrder(3, 1), [1, 2, 0]);
  assert.deepEqual(drawn('hongkong'), [1, 2, 0]);
  assert.deepEqual(ev.filter((e) => e.t === 'draw').map((e) => e.seat), [1, 2, 0, 1, 2, 0]);
});

test('Havana wraps: the last seat’s agents pass to seat 0', () => {
  const h = m(3, ['havana', 'monaco', 'tangier']);
  play(h, null, null, ['heavy', 0]);
  play(h, null, null, null);
  play(h, null, null, null);
  play(h, null, null, null);
  assert.equal(h.round.cards[uidOf(h, 2, 'heavy')].owner, 0);
  assert.deepEqual(h.round.cities[0].sides.map((x) => x.length), [1, 0, 0]);
});
