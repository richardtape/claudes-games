import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { RULES } from '../js/data.js';
import { pick, play, uidOf, withRules } from './helpers.mjs';

const m = (n, cities = ['berlin', 'monaco', 'tangier'], seed = 7) => E.newMatch({ seed, cities, seats: n });
const onBoard = (s, seat) => s.round.cities.flatMap((c) => c.sides[seat]);
const SIX = ['heavy', 'sleeper', 'veteran', 'jammer', 'handler', 'mole'];

test('a v2 match: tokens for everyone, an empty pot, nobody out', () => {
  assert.equal(E.STATE_VERSION, 2);
  for (const n of [2, 3, 4]) {
    const s = m(n);
    assert.equal(s.v, 2);
    assert.deepEqual(s.tokens, Array(n).fill(RULES.tokens));
    assert.deepEqual([s.carry, s.round.pot, s.round.called, s.round.pending], [0, 0, null, null]);
    assert.deepEqual(s.round.folded, Array(n).fill(false));
  }
});

test('escalating spends a token that lasts the match; one escalation a round; none without a token', () => {
  const s = m(2);
  assert.ok(E.escalate(s, 0));
  assert.deepEqual(s.tokens, [RULES.tokens - 1, RULES.tokens]);
  assert.deepEqual(s.round.pending, { by: 0, from: [1], calls: [null, null] });
  assert.equal(E.canEscalate(s, 1), false, 'while one is pending');
  assert.ok(E.respond(s, 1, true));
  assert.deepEqual([s.round.stake, s.round.pending, s.round.called], [2, null, { by: 0, answers: [null, 'on'] }]);
  assert.equal(E.canEscalate(s, 1), false, 'one a round');
  s.phase = 'round-over';
  E.nextRound(s);
  assert.deepEqual(s.tokens, [RULES.tokens - 1, RULES.tokens], 'tokens belong to the match');
  assert.ok(E.canEscalate(s, 1));
  s.tokens[1] = 0;
  const before = JSON.stringify(s);
  assert.equal(E.escalate(s, 1), false);
  assert.equal(JSON.stringify(s), before);
});

test('two players: folding in answer gives the escalator the stake, as before', () => {
  const s = m(2);
  E.escalate(s, 0);
  assert.ok(E.respond(s, 1, false));
  assert.equal(s.phase, 'round-over');
  assert.deepEqual(s.scores, [1, 0]);
  assert.deepEqual(pick(s.round.result, ['winner', 'points', 'folded', 'stake', 'pot', 'carry']), { winner: 0, points: 1, folded: 1, stake: 1, pot: 1, carry: 0 });
  assert.deepEqual(s.round.events, [{ t: 'fold', seat: 1 }]);
});

test('two players: a fold ends the round, the folder’s agents leave, the other takes the pot with any rollover', () => {
  const s = m(2);
  s.round.pot = 3;
  play(s, ['heavy', 0], ['heavy', 1]);
  assert.ok(E.fold(s, 0));
  assert.deepEqual(s.scores, [0, 4]);
  assert.deepEqual(onBoard(s, 0), []);
  assert.equal(onBoard(s, 1).length, 1);
  assert.ok(s.round.gone[0].includes(uidOf(s, 0, 'heavy')));
});

test('three seats: a fold pays the stake into the pot; your agents leave, still secret; you drop and draw no more', () => {
  const s = m(3, ['vienna', 'monaco', 'tangier']);
  play(s, ['mole', 1], ['heavy', 1], ['heavy', 0]); // seat 2's Heavy lands face down in Vienna
  const hand2 = s.round.hands[2].length;
  assert.ok(E.fold(s, 2));
  assert.equal(s.phase, 'plan');
  assert.deepEqual([s.round.pot, s.round.folded], [1, [false, false, true]]);
  assert.deepEqual(onBoard(s, 2), []);
  const heavy = s.round.cards[uidOf(s, 2, 'heavy')];
  assert.deepEqual([heavy.city, heavy.faceDown], [null, true]);
  assert.equal(E.viewFor(s, 0).round.gone[2][0].kind, null, 'nobody learns what it was');
  assert.deepEqual([E.legalDrops(s, 2), s.round.plans[2]], [[], { pass: true }]);
  const ev = play(s, ['lookout', 2], ['veteran', 2]);
  assert.equal(s.round.hands[2].length, hand2, 'no draws while out');
  assert.ok(!ev.some((e) => e.seat === 2), 'no events for a seat that is out');
  assert.equal(E.fold(s, 2), false);
});

test('answers stay secret until all are in; then the folds and the doubling land together', () => {
  const s = m(3);
  assert.ok(E.escalate(s, 0));
  assert.deepEqual(s.round.pending.from, [1, 2]);
  assert.ok(E.respond(s, 1, true));
  assert.equal(E.respond(s, 1, false), false, 'one answer each');
  assert.equal(E.fold(s, 1), false, 'no folding after answering, until the call settles');
  assert.equal(s.round.stake, 1);
  assert.deepEqual(E.viewFor(s, 2).round.pending, { by: 0, from: [1, 2], answered: [false, true, false], mine: null });
  assert.equal(E.viewFor(s, 1).round.pending.mine, 'on');
  for (const seat of [-1, 0, 1, 2]) assert.ok(!JSON.stringify(E.viewFor(s, seat)).includes('"calls"'), `seat ${seat}`);
  assert.ok(E.respond(s, 2, false));
  assert.deepEqual(s.round.called, { by: 0, answers: [null, 'on', 'fold'] });
  assert.deepEqual([s.round.pending, s.round.pot, s.round.stake, s.round.folded, s.phase], [null, 1, 2, [false, false, true], 'plan']);
});

test('everyone folds in answer: the escalator takes the pot at once', () => {
  const s = m(3);
  E.escalate(s, 1); // asks seats 2 then 0
  E.respond(s, 2, false);
  E.respond(s, 0, false);
  assert.equal(s.phase, 'round-over');
  assert.deepEqual(pick(s.round.result, ['winner', 'points', 'folded', 'pot']), { winner: 1, points: 2, folded: 0, pot: 2 });
  assert.deepEqual(s.scores, [0, 2, 0]);
});

test('the last player standing after folds takes the pot', () => {
  const s = m(4);
  assert.ok(E.fold(s, 1));
  play(s, ['heavy', 0], null, ['heavy', 1], ['heavy', 2]);
  assert.ok(E.fold(s, 3));
  assert.ok(E.fold(s, 2));
  assert.deepEqual([s.phase, ...Object.values(pick(s.round.result, ['winner', 'points', 'folded']))], ['round-over', 0, 3, 2]);
});

test('the escalator may fold while waiting: the call is off and the token stays spent', () => {
  const two = m(2);
  E.escalate(two, 0);
  assert.ok(E.fold(two, 0));
  assert.deepEqual([two.scores, two.tokens[0], two.round.result.points], [[0, 1], RULES.tokens - 1, 1]);
  const s = m(3);
  E.escalate(s, 0);
  E.respond(s, 1, true);
  assert.ok(E.fold(s, 0));
  assert.deepEqual([s.round.pending, s.round.called, s.round.stake, s.round.pot, s.phase], [null, null, 1, 1, 'plan']);
  assert.equal(E.canEscalate(s, 1), false, 'still one escalation a round');
});

test('a call asks only the players still in', () => {
  const s = m(4);
  E.fold(s, 2);
  E.escalate(s, 3);
  assert.deepEqual(s.round.pending.from, [0, 1]);
  assert.equal(E.respond(s, 2, true), false);
  assert.equal(E.escalate(m(3), 5), false);
});

test('round end: the winner scores the stake × 2 plus the pot', () => {
  const s = m(2, ['istanbul', 'hongkong', 'lisbon']);
  s.round.pot = 2;
  E.escalate(s, 0);
  E.respond(s, 1, true);
  SIX.forEach((kind, i) => play(s, [kind, i % 3], null));
  assert.deepEqual(pick(s.round.result, ['winner', 'points', 'stake', 'pot', 'carry']), { winner: 0, points: 6, stake: 2, pot: 2, carry: 0 });
  assert.deepEqual(s.scores, [6, 0]);
});

test('a dead heat scores nothing and rolls the stake and the pot into the next round', () => {
  const s = m(2);
  s.round.pot = 1;
  E.escalate(s, 0);
  E.respond(s, 1, true);
  for (let t = 0; t < 6; t++) play(s, null, null);
  assert.deepEqual(pick(s.round.result, ['winner', 'points', 'carry']), { winner: null, points: 0, carry: 3 });
  assert.equal(s.carry, 3);
  E.nextRound(s);
  assert.deepEqual([s.round.pot, s.carry], [3, 0]);
  withRules({ rollover: 0 }, () => {
    const r = m(2);
    for (let t = 0; t < 6; t++) play(r, null, null);
    assert.equal(r.round.result.carry, 0);
  });
});

test('roundWinner: a tie on cities goes to the tied seat holding Zurich, before power', () => {
  const ids = ['monaco', 'zurich', 'berlin'];
  assert.equal(E.roundWinner(ids, [0, 1, null], [[9, 0], [0, 1], [0, 0]]), 1);
  assert.equal(E.roundWinner(['monaco', 'helsinki', 'berlin'], [0, 1, null], [[9, 0], [0, 1], [0, 0]]), 0, 'no Zurich: power');
  assert.equal(E.roundWinner(ids, [0, null, 1], [[9, 0], [2, 2], [0, 1]]), 0, 'Zurich held by nobody: power');
  assert.equal(E.roundWinner(ids, [0, 2, 1], [[5, 0, 0], [0, 0, 1], [0, 5, 0]]), 2, 'three seats, a city each');
});

test('Havana passes agents to the next player still in', () => {
  const s = m(3, ['havana', 'monaco', 'tangier']);
  play(s, ['heavy', 0], ['mole', 1], ['lookout', 0]);
  E.fold(s, 1);
  for (let t = 0; t < 3; t++) play(s, null, null, null);
  assert.equal(s.round.cards[uidOf(s, 0, 'heavy')].owner, 2);
  assert.equal(s.round.cards[uidOf(s, 2, 'lookout')].owner, 0);
  assert.deepEqual(s.round.cities[0].sides.map((x) => x.length), [1, 0, 1]);
});

test('Havana with four seats and one out: each seat in passes its agents to the next seat in, round the table', () => {
  const s = m(4, ['havana', 'monaco', 'tangier']);
  assert.ok(E.fold(s, 1));
  play(s, ['heavy', 0], null, ['lookout', 0], ['mole', 0]);
  for (let t = 0; t < 3; t++) play(s, null, null, null, null);
  assert.equal(s.round.turn, 5);
  const owner = (kind, seat) => s.round.cards[uidOf(s, seat, kind)].owner;
  assert.deepEqual([owner('heavy', 0), owner('lookout', 2), owner('mole', 3)], [2, 3, 0]);
  assert.deepEqual(s.round.cities[0].sides.map((x) => x.length), [1, 0, 1, 1]);
});

test('views show tokens, the pot, who is out and the last call', () => {
  const s = m(3);
  E.escalate(s, 0);
  E.respond(s, 1, true);
  E.respond(s, 2, true);
  const v = E.viewFor(s, -1);
  assert.deepEqual([v.tokens, v.round.pot, v.round.folded, v.round.called, v.round.pending], [[RULES.tokens - 1, RULES.tokens, RULES.tokens], 0, [false, false, false], { by: 0, answers: [null, 'on', 'on'] }, null]);
});

test('roundWinner: a seat that has folded is never in the tie', () => {
  // Nobody holds a city. Under 'invert' the two seats still in sit below the folded seat's 0.
  const ids = ['lisbon', 'monaco', 'berlin'];
  const totals = [[2, 2, 0], [0, 0, 0], [0, 0, 0]];
  assert.equal(E.roundWinner(ids, [null, null, null], totals, 'invert'), 2, 'without the folded list');
  assert.equal(E.roundWinner(ids, [null, null, null], totals, 'invert', [false, false, true]), null);
});

const BOARD = ['istanbul', 'hongkong', 'lisbon'];
/** Seat 0 takes Istanbul and Lisbon; seat 1 takes Hong Kong. */
function splitRound(s) {
  play(s, ['heavy', 0], ['heavy', 1]);
  play(s, ['sleeper', 2], ['sleeper', 1]);
  play(s, ['veteran', 0], ['veteran', 1]);
  for (const kind of ['jammer', 'handler', 'mole']) play(s, [kind, kind === 'handler' ? 0 : 2], null);
}

test('each round one city carries the Microfilm, drawn from the match seed', () => {
  const a = E.newMatch({ seed: 'film' });
  assert.equal(a.round.film, E.newMatch({ seed: 'film' }).round.film);
  const seen = new Set([a.round.film]);
  for (let r = 0; r < 30; r++) {
    a.phase = 'round-over';
    E.nextRound(a);
    seen.add(a.round.film);
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
  assert.deepEqual([a.strips, a.reel, a.filmRule, a.winBy], [[0, 0], RULES.reel, 'comeback', null]);
  assert.equal(RULES.film, 'comeback');
  assert.equal(E.newMatch({ seed: 1, film: 2 }).round.film, 2);
  withRules({ reel: 0 }, () => assert.equal(E.newMatch({ seed: 1 }).round.film, null));
});

test('the comeback film: the holder takes a strip only if they did not win the round', () => {
  const won = E.newMatch({ seed: 3, cities: BOARD, film: 1 });
  SIX.forEach((kind, i) => play(won, [kind, i % 3], null)); // seat 0 holds everything, the film city too
  assert.deepEqual([won.round.result.winner, won.round.result.strip, won.strips], [0, null, [0, 0]]);
  const lost = E.newMatch({ seed: 3, cities: BOARD, film: 1 });
  splitRound(lost);
  assert.deepEqual([lost.round.result.winner, lost.round.result.strip, lost.strips], [0, 1, [0, 1]], 'seat 1 lost the round but held Hong Kong');
  assert.deepEqual(pick(lost.history.at(-1), ['film', 'strips']), { film: 1, strips: [0, 1] });
  const dead = E.newMatch({ seed: 3, cities: ['monaco', 'berlin', 'helsinki'], film: 0 });
  play(dead, ['heavy', 0], ['heavy', 1]); // a city each, 6 to 6 on power: a dead heat
  for (let t = 0; t < 5; t++) play(dead, null, null);
  assert.deepEqual([dead.round.result.winner, dead.round.result.strip], [null, 0], 'in a dead heat the holder takes it');
  assert.deepEqual(dead.strips, [1, 0]);
});

test('the comeback film: a round that ends in folds awards no strip', () => {
  const s = E.newMatch({ seed: 3, cities: BOARD, film: 0 });
  play(s, ['heavy', 0], ['mole', 0]); // both get Istanbul's +3, and the Mole takes 1: 8 to 5
  E.fold(s, 0);
  assert.deepEqual([s.round.result.winner, s.round.result.strip, s.strips], [1, null, [0, 0]]);
});

test('the holder rule (a switch for the sim): whoever holds the film city takes the strip, after a fold too', () => {
  withRules({ film: 'holder' }, () => {
    const s = E.newMatch({ seed: 3, cities: BOARD, film: 1 });
    assert.equal(s.filmRule, 'holder');
    SIX.forEach((kind, i) => play(s, [kind, i % 3], null));
    assert.deepEqual([s.round.result.strip, s.strips], [0, [1, 0]]);
    const f = E.newMatch({ seed: 3, cities: BOARD, film: 0 });
    play(f, ['heavy', 0], ['mole', 0]);
    E.fold(f, 0);
    assert.deepEqual(pick(f.round.result, ['winner', 'strip']), { winner: 1, strip: 1 }, 'held once the folder’s agents are out');
    const t = E.newMatch({ seed: 3, cities: BOARD, film: 1 });
    play(t, ['heavy', 1], ['mole', 0]);
    E.fold(t, 0); // nobody is left in Hong Kong
    assert.equal(t.round.result.strip, null);
  });
  assert.equal(E.newMatch({ seed: 3 }).filmRule, 'comeback', 'a match keeps the rule it began with');
});

test('the full reel wins the match outright, whatever the score, even when the points target lands too', () => {
  const s = E.newMatch({ seed: 3, cities: BOARD, film: 1 });
  s.strips = [0, RULES.reel - 1];
  s.scores = [9, 0];
  splitRound(s);
  assert.equal(s.round.result.winner, 0);
  assert.ok(s.scores[0] >= s.target);
  assert.deepEqual([s.phase, s.winner, s.winBy], ['match-over', 1, 'reel']);
  const p = E.newMatch({ seed: 3, cities: BOARD, film: 0 });
  p.scores = [9, 0];
  SIX.forEach((kind, i) => play(p, [kind, i % 3], null));
  assert.deepEqual([p.winner, p.winBy], [0, 'points']);
});

test('views show strips, the reel, the film rule, the film city and how the match was won', () => {
  const s = E.newMatch({ seed: 3, seats: 3, film: 2 });
  const v = E.viewFor(s, 1);
  assert.deepEqual([v.strips, v.reel, v.filmRule, v.winBy, v.round.film], [[0, 0, 0], RULES.reel, 'comeback', null, 2]);
});

test('several folds at once (settleCall): the last seat standing takes the strip only under the holder rule, and only if it holds the film city', () => {
  const three = (film) => {
    const s = E.newMatch({ seed: 3, seats: 3, cities: BOARD, film });
    play(s, ['heavy', 1], null, null);
    assert.ok(E.escalate(s, 0));
    assert.ok(E.respond(s, 1, false));
    assert.ok(E.respond(s, 2, false));
    return s;
  };
  const c = three(1);
  assert.deepEqual([c.round.result.winner, c.round.result.strip, c.strips], [0, null, [0, 0, 0]], 'comeback: the winner takes none');
  withRules({ film: 'holder' }, () => {
    const h = three(1);
    assert.deepEqual([h.round.result.winner, h.round.result.strip, h.strips], [0, 0, [1, 0, 0]]);
    const n = three(0); // seat 0 holds Hong Kong, not the film city
    assert.deepEqual([n.round.result.winner, n.round.result.strip, n.strips], [0, null, [0, 0, 0]]);
  });
});

test('newMatch rejects a film city that is not null or 0 to 2', () => {
  for (const film of [3, -1, 1.5, '1']) assert.throws(() => E.newMatch({ seed: 1, film }), RangeError);
  for (const film of [null, 0, 1, 2]) assert.doesNotThrow(() => E.newMatch({ seed: 1, film }));
});

const UID = /^[a-d]\d+\.[0-9a-z]{4}$/;
const uidsIn = (v) => new Set(JSON.stringify(v).match(/[a-d]\d+\.[0-9a-z]{4}/g));

test('card uids are opaque: a seat letter, the round and four random characters', () => {
  for (const n of [2, 3, 4]) {
    const s = E.newMatch({ seed: n, seats: n });
    for (const c of Object.values(s.round.cards)) {
      assert.match(c.uid, UID);
      assert.equal(c.uid[0], 'abcd'[c.owner]);
    }
  }
});

test('a card a Getaway sends home comes back under a uid its rival has never seen', () => {
  const s = E.newMatch({ seed: 5, cities: ['berlin', 'vienna', 'monaco'] });
  play(s, ['heavy', 0], null);
  const old = uidOf(s, 0, 'heavy');
  const seen = uidsIn(E.viewFor(s, 1));
  assert.ok(seen.has(old));
  play(s, ['getaway', 0], null);
  const fresh = uidOf(s, 0, 'heavy');
  assert.notEqual(fresh, old);
  assert.match(fresh, UID);
  assert.ok(s.round.hands[0].includes(fresh));
  assert.equal(s.round.cards[old], undefined);
  for (const u of uidsIn(E.viewFor(s, 1))) seen.add(u);
  assert.ok(!seen.has(fresh));
  assert.ok(E.lock(s, 0, { uid: fresh, city: 1 })); // Vienna: face down
  s.round.plans[1] = { pass: true };
  E.resolveTurn(s);
  const cv = E.viewFor(s, 1).round.cities[1].sides[0].find((c) => c.uid === fresh);
  assert.equal(cv.kind, null);
});

test('a face-down card shows its owner as its origin to everyone else', () => {
  const s = E.newMatch({ seed: 5, cities: ['berlin', 'vienna', 'monaco'] });
  play(s, ['heavy', 1], null);
  s.round.cards[uidOf(s, 0, 'heavy')].origin = 1; // as a turned asset would be (2b-ii's Glienicke and Turncoat make them mid-round)
  assert.equal(E.viewFor(s, 1).round.cities[1].sides[0][0].origin, 0);
  assert.equal(E.viewFor(s, 0).round.cities[1].sides[0][0].origin, 1, 'its owner knows');
});
