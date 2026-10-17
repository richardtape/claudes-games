import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { DECK, START_HAND, TURNS } from '../js/data.js';

const uidOf = (s, seat, kind) => Object.values(s.round.cards).find((c) => c.origin === seat && c.id0 === kind).uid;
/** Make sure `seat` holds `kind` (pulling it from the deck if needed) and return its uid. */
function give(s, seat, kind) {
  const R = s.round;
  const uid = uidOf(s, seat, kind);
  if (!R.hands[seat].includes(uid)) {
    // Swap it with a hand card so hand sizes stay true to the rules.
    const i = R.decks[seat].indexOf(uid);
    R.decks[seat][i] = R.hands[seat].shift();
    R.hands[seat].push(uid);
  }
  return uid;
}
/** Both seats drop ([kind, city] or null to pass) and the turn resolves. */
function play(s, a, b) {
  for (const [seat, mv] of [[0, a], [1, b]]) {
    if (!mv) s.round.plans[seat] = { pass: true };
    else assert.ok(E.lock(s, seat, { uid: give(s, seat, mv[0]), city: mv[1] }), `seat ${seat} could not drop ${mv[0]} in city ${mv[1]}`);
  }
  return E.resolveTurn(s);
}
const match = (cities, seed = 7) => E.newMatch({ seed, cities });
const power = (s, seat, kind) => E.powerOf(s, uidOf(s, seat, kind));
const inPlay = (s, seat, kind) => s.round.cards[uidOf(s, seat, kind)].city !== null;

test('a new match deals three cities and four cards each, reproducibly', () => {
  const a = E.newMatch({ seed: 'abc' });
  const b = E.newMatch({ seed: 'abc' });
  assert.equal(a.round.cities.length, 3);
  assert.equal(new Set(a.round.cities.map((c) => c.id)).size, 3);
  assert.deepEqual(a.round.hands.map((h) => h.length), [START_HAND, START_HAND]);
  assert.deepEqual(a.round.decks.map((d) => d.length), [DECK.length - START_HAND, DECK.length - START_HAND]);
  assert.deepEqual(a.round.cities, b.round.cities);
  assert.deepEqual(a.round.hands.map((h) => h.map((u) => a.round.cards[u].kind)), b.round.hands.map((h) => h.map((u) => b.round.cards[u].kind)));
});

test('a drop must be a card in hand going to an open city with room', () => {
  const s = match(['berlin', 'helsinki', 'venice']);
  const handCard = s.round.hands[0][0];
  const deckCard = s.round.decks[0][0];
  assert.equal(E.lock(s, 0, { uid: deckCard, city: 0 }), false);
  assert.equal(E.lock(s, 0, { uid: handCard, city: 0 }), true);
  assert.equal(E.unlock(s, 0), true);
  assert.equal(E.ready(s), false);
  // Venice closes on even turns, Helsinki after turn 3, Berlin holds two a side.
  play(s, ['heavy', 0], ['heavy', 2]);
  assert.equal(E.cityOpen(s, 2), false, 'Venice is closed on turn 2');
  play(s, ['mole', 0], ['mole', 1]);
  assert.equal(E.legalDrops(s, 0).some((d) => d.city === 0), false, 'Berlin is full for seat 0');
  play(s, ['handler', 2], ['handler', 1]);
  assert.equal(E.cityOpen(s, 1), false, 'Helsinki closes after turn 3');
});

test('a turn where neither seat can drop resolves by itself', () => {
  const s = match(['moscow', 'helsinki', 'venice']);
  play(s, ['heavy', 0], ['heavy', 0]);
  play(s, ['mole', 0], ['mole', 0]);
  const ev = play(s, ['handler', 0], ['handler', 0]);
  // Turn 4: Moscow is full, Helsinki has closed and Venice only sails on odd turns.
  assert.equal(s.round.turn, 5, 'turn 4 passed for both and resolved');
  assert.equal(ev.filter((e) => e.t === 'pass').length, 2);
  assert.ok(E.legalDrops(s, 0).every((d) => d.city === 2));
});

test('turns advance, initiative alternates and both players draw', () => {
  const s = match(['moscow', 'monaco', 'tangier']);
  const init = s.round.initiative;
  play(s, ['heavy', 0], ['heavy', 1]);
  assert.equal(s.round.turn, 2);
  assert.equal(s.round.initiative, 1 - init);
  assert.deepEqual(s.round.hands.map((h) => h.length), [START_HAND, START_HAND]);
});

test('Tripwire catches a rival arriving the same turn whoever has initiative', () => {
  for (const init of [0, 1]) {
    const s = match(['berlin', 'monaco', 'tangier']);
    s.round.initiative = init;
    play(s, ['tripwire', 0], ['heavy', 0]);
    assert.equal(inPlay(s, 1, 'heavy'), false);
    assert.equal(s.round.cards[uidOf(s, 0, 'tripwire')].faceDown, false, 'sprung tripwire turns over');
    // Spent: the next rival arrival is safe.
    play(s, ['mole', 1], ['veteran', 0]);
    assert.equal(inPlay(s, 1, 'veteran'), true);
  }
});

test('Tripwire is defused in Moscow, by a Jammer and in Vienna', () => {
  for (const [cities, setup] of [
    [['moscow', 'monaco', 'tangier'], null],
    [['berlin', 'monaco', 'tangier'], 'jammer'],
    [['vienna', 'monaco', 'tangier'], null],
  ]) {
    const s = match(cities);
    if (setup) play(s, ['heavy', 1], [setup, 0]);
    play(s, ['tripwire', 0], ['sleeper', 2]);
    play(s, ['mole', 1], ['veteran', 0]);
    assert.equal(inPlay(s, 1, 'veteran'), true, `veteran survives in ${cities[0]}${setup ? ' with jammer' : ''}`);
  }
});

test('Assassin takes out the strongest face-up rival, never a face-down one, never in Moscow', () => {
  const s = match(['berlin', 'monaco', 'tangier']);
  play(s, ['heavy', 0], ['sleeper', 0]);
  play(s, ['veteran', 1], ['assassin', 0]);
  assert.equal(inPlay(s, 0, 'heavy'), false);
  const m = match(['moscow', 'monaco', 'tangier']);
  play(m, ['heavy', 0], ['mole', 1]);
  play(m, ['veteran', 1], ['assassin', 0]);
  assert.equal(inPlay(m, 0, 'heavy'), true);
  const f = match(['berlin', 'monaco', 'tangier']);
  play(f, ['sleeper', 0], ['mole', 1]);
  play(f, ['veteran', 1], ['assassin', 0]);
  assert.equal(inPlay(f, 0, 'sleeper'), true);
});

test('Double Agent follows the rival’s drop if there is room', () => {
  const s = match(['berlin', 'monaco', 'tangier']);
  const ev = play(s, ['double', 0], ['heavy', 2]);
  assert.equal(s.round.cards[uidOf(s, 0, 'double')].city, 2);
  assert.ok(ev.some((e) => e.t === 'trick' && e.kind === 'double' && e.to === 2));
  const full = match(['berlin', 'monaco', 'tangier']);
  play(full, ['heavy', 2], ['mole', 1]);
  play(full, ['handler', 2], ['lookout', 1]);
  play(full, ['veteran', 2], ['assassin', 1]);
  play(full, ['double', 0], ['getaway', 2]);
  assert.equal(full.round.cards[uidOf(full, 0, 'double')].city, 0, 'no room in Tangier, so it stays');
});

test('Impostor copies the rival’s face-up drop, tricks included', () => {
  const s = match(['berlin', 'monaco', 'tangier']);
  play(s, ['impostor', 0], ['heavy', 1]);
  assert.equal(power(s, 0, 'impostor'), 6);
  const d = match(['berlin', 'monaco', 'tangier']);
  const before = d.round.hands[0].length;
  play(d, ['impostor', 0], ['lookout', 1]);
  assert.equal(d.round.hands[0].length, before - 1 + 1 + 1, 'copied Lookout draws, then the turn draw');
  const h = match(['berlin', 'monaco', 'tangier']);
  play(h, ['impostor', 0], ['sleeper', 1]);
  assert.equal(power(h, 0, 'impostor'), 0, 'face-down drops cannot be copied');
});

test('Getaway takes your weakest other agent here back to hand, reset', () => {
  const s = match(['berlin', 'monaco', 'tangier']);
  play(s, ['heavy', 2], ['mole', 0]);
  play(s, ['assassin', 2], ['handler', 0]);
  const assassin = uidOf(s, 0, 'assassin');
  play(s, ['getaway', 2], ['veteran', 1]);
  assert.ok(s.round.hands[0].includes(assassin));
  assert.equal(s.round.cards[assassin].city, null);
  assert.equal(inPlay(s, 0, 'heavy'), true);
});

test('Handler, Mole, Veteran and Jammer change power', () => {
  const s = match(['berlin', 'monaco', 'tangier']);
  play(s, ['veteran', 2], ['heavy', 1]);
  assert.equal(power(s, 0, 'veteran'), 6, 'lone Veteran gets +3');
  play(s, ['handler', 2], ['mole', 2]);
  assert.equal(power(s, 0, 'veteran'), 3 + 1 - 1, 'no longer alone; Handler +1; Mole −1');
  play(s, ['jammer', 2], ['jammer', 2]);
  assert.equal(power(s, 0, 'veteran'), 3, 'rival Jammer switches off the Handler; ours stops the Mole');
  assert.equal(power(s, 1, 'heavy'), 6);
});

test('Vienna: drops land face down and have no tricks', () => {
  const s = match(['vienna', 'monaco', 'tangier']);
  play(s, ['handler', 0], ['heavy', 1]);
  play(s, ['veteran', 0], ['lookout', 1]);
  assert.equal(s.round.cards[uidOf(s, 0, 'veteran')].faceDown, true);
  assert.equal(power(s, 0, 'veteran'), 3, 'no Handler bonus, no lone-wolf bonus in Vienna');
  const v = E.viewFor(s, 1);
  assert.equal(v.round.cities[0].sides[0][0].kind, null, 'rival cannot see Vienna drops');
  assert.equal(v.round.cities[0].leader, null);
});

test('Istanbul: +3 for the first arrivals only (both, if simultaneous)', () => {
  const s = match(['istanbul', 'monaco', 'tangier']);
  play(s, ['mole', 0], ['handler', 0]);
  assert.equal(s.round.cards[uidOf(s, 0, 'mole')].bonus, 3);
  assert.equal(s.round.cards[uidOf(s, 1, 'handler')].bonus, 3);
  play(s, ['heavy', 0], ['veteran', 1]);
  assert.equal(s.round.cards[uidOf(s, 0, 'heavy')].bonus, 0);
});

test('Havana: everyone there switches sides after turn 4', () => {
  const s = match(['havana', 'monaco', 'tangier']);
  play(s, ['heavy', 0], ['mole', 0]);
  play(s, ['handler', 0], ['lookout', 1]);
  play(s, ['veteran', 1], ['assassin', 2]);
  const ev = play(s, ['sleeper', 0], ['jammer', 2]);
  assert.ok(ev.some((e) => e.t === 'havana'));
  assert.equal(s.round.cards[uidOf(s, 0, 'heavy')].owner, 1);
  assert.equal(s.round.cards[uidOf(s, 1, 'mole')].owner, 0);
  assert.equal(s.round.cards[uidOf(s, 0, 'sleeper')].faceDown, false, 'defectors turn over');
  assert.equal(s.round.cities[0].sides[1].length, 3);
});

test('Hong Kong draws a card for the drop', () => {
  const s = match(['hongkong', 'monaco', 'tangier']);
  play(s, ['heavy', 0], ['heavy', 1]);
  assert.equal(s.round.hands[0].length, START_HAND + 1);
  assert.equal(s.round.hands[1].length, START_HAND);
});

/** Plays out the remaining turns with both seats making their first legal drop. */
function finish(s, seats = [0, 1]) {
  while (s.phase === 'plan') {
    for (const seat of seats) if (!s.round.plans[seat]) assert.ok(E.lock(s, seat, E.legalDrops(s, seat)[0]));
    E.resolveTurn(s);
  }
}

test('Lisbon: lowest total wins; Tangier takes out the strongest; Monaco pays +1', () => {
  const s = match(['lisbon', 'monaco', 'tangier']);
  play(s, ['impostor', 0], ['heavy', 0]);
  // Seat 0's Impostor copied Heavy (6) vs Heavy (6): tie. Add a Lookout (1) to seat 1 to lose Lisbon.
  play(s, ['mole', 1], ['lookout', 0]);
  play(s, ['heavy', 2], ['veteran', 2]);
  play(s, ['handler', 1], ['tripwire', 1]);
  play(s, ['jammer', 1], ['sleeper', 2]);
  play(s, ['assassin', 2], ['getaway', 1]);
  assert.equal(s.phase === 'round-over' || s.phase === 'match-over', true);
  const res = s.round.result;
  assert.equal(res.cityWinners[0], 0, 'seat 0 has the lower total in Lisbon');
  assert.equal(s.round.cards[uidOf(s, 0, 'heavy')].city, null, 'Tangier took out the strongest');
  assert.equal(res.monaco, res.cityWinners[1]);
});

test('stakes: escalate, respond, fold and the final doubling', () => {
  const s = match(['berlin', 'monaco', 'tangier']);
  assert.equal(E.escalate(s, 0), true);
  assert.equal(E.escalate(s, 1), false, 'one escalation pending at a time');
  assert.equal(E.ready(s), false);
  assert.equal(E.respond(s, 0, true), false, 'cannot answer your own escalation');
  assert.equal(E.respond(s, 1, true), true);
  assert.equal(s.round.stake, 2);
  assert.equal(E.escalate(s, 0), false, 'once per round');
  assert.equal(E.escalate(s, 1), false, 'and only by whoever calls it first');
  assert.equal(E.fold(s, 0), true);
  assert.deepEqual(s.scores, [0, 2], 'folding loses the current stake');
  assert.equal(s.phase, 'round-over');

  const d = match(['berlin', 'monaco', 'tangier']);
  E.escalate(d, 1);
  assert.equal(E.respond(d, 0, false), true, 'declining folds');
  assert.deepEqual(d.scores, [0, 1]);

  const t = match(['berlin', 'monaco', 'tangier']);
  E.escalate(t, 1);
  E.respond(t, 0, true);
  finish(t);
  const r = t.round.result;
  if (r.winner !== null) assert.equal(r.points, 4, 'stake 2 doubles on the final flip');
});

test('the match ends when someone reaches the target', () => {
  const s = E.newMatch({ seed: 3, target: 3 });
  let guard = 0;
  while (s.phase !== 'match-over' && guard++ < 50) {
    if (s.phase === 'round-over') E.nextRound(s);
    E.fold(s, s.roundNo % 2);
  }
  assert.equal(s.phase, 'match-over');
  assert.ok(s.scores[s.winner] >= 3);
});

test('views hide the rival hand, face-down identities and their draws', () => {
  const s = match(['berlin', 'monaco', 'tangier']);
  play(s, ['sleeper', 0], ['heavy', 1]);
  const v1 = E.viewFor(s, 1);
  assert.equal(v1.round.hand.length, s.round.hands[1].length);
  assert.equal(v1.round.cities[0].sides[0][0].kind, null);
  assert.equal(v1.round.cities[0].sides[0][0].power, null);
  assert.equal(v1.round.cities[0].hiddenCount[0], 1);
  assert.ok(v1.round.events.filter((e) => e.t === 'drop' && e.seat === 0).every((e) => e.kind === null));
  assert.ok(v1.round.events.filter((e) => e.t === 'draw' && e.seat === 0).every((e) => e.uid === null));
  const v0 = E.viewFor(s, 0);
  assert.equal(v0.round.cities[0].sides[0][0].kind, 'sleeper', 'you can see your own face-down agent');
  const secret = uidOf(s, 0, 'sleeper');
  const leaks = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (o.uid === secret && (o.kind || o.id0)) leaks.push(o);
    Object.values(o).forEach(walk);
  })(v1);
  assert.deepEqual(leaks, [], 'nothing in the rival view names the face-down card');
});

test('invariant: random play never loses a card and always finishes', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const s = E.newMatch({ seed, target: 6 });
    let r = 0;
    let rounds = 0;
    while (s.phase !== 'match-over' && rounds < 40) {
      if (s.phase === 'round-over') {
        E.nextRound(s);
        rounds++;
        continue;
      }
      r = (r * 1103515245 + 12345 + seed) >>> 0;
      if (r % 97 === 0) E.escalate(s, r % 2);
      if (s.round.pending) E.respond(s, 1 - s.round.pending.by, r % 5 !== 0);
      if (s.phase !== 'plan') continue;
      for (const seat of [0, 1]) {
        if (s.round.plans[seat]) continue;
        const legal = E.legalDrops(s, seat);
        assert.ok(E.lock(s, seat, legal[(r >>> 3) % legal.length]));
      }
      E.resolveTurn(s);
      const R = s.round;
      // Every card is in exactly one place.
      const seen = [...R.hands.flat(), ...R.decks.flat(), ...R.gone.flat(), ...R.cities.flatMap((c) => c.sides.flat())];
      assert.equal(seen.length, 2 * DECK.length, `seed ${seed}: card count`);
      assert.equal(new Set(seen).size, 2 * DECK.length, `seed ${seed}: duplicates`);
      for (const c of R.cities) c.sides.forEach((side, seat) => assert.ok(side.length <= E.capacityOf(c.id) && side.every((u) => R.cards[u].owner === seat)));
      assert.ok(R.turn <= TURNS);
    }
    assert.equal(s.phase, 'match-over', `seed ${seed} finished`);
  }
});
