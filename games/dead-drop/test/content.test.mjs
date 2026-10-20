import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { AGENTS, CITIES, CLASSIC_CITIES, DECK, RULES, TURNS } from '../js/data.js';
import { ALL_AGENTS, ALL_CITIES, cardOf, give, isOut, mixed, pick, play, setHand, uidOf } from './helpers.mjs';
import { canRestore, restoreTable } from '../js/session.js';

const PLAIN = ['monaco', 'zurich', 'hongkong'];

test('Classic is the default roster and pool', () => {
  const s = E.newMatch({ seed: 3 });
  assert.deepEqual([s.roster, s.cityPool, s.twist], [DECK, CLASSIC_CITIES, null]);
  const v = E.viewFor(s, 1);
  assert.deepEqual([v.roster, v.cityPool, v.twist], [DECK, CLASSIC_CITIES, null]);
});

test('a match deals its own roster to every seat and its own pool of cities', () => {
  const roster = ['heavy', 'sleeper', 'veteran', 'jammer', 'handler', 'mole', 'lookout', 'assassin', 'wiretap', 'bodyguard', 'courier', 'decoy'];
  const pool = ['tokyo', 'rome', 'zurich', 'prague'];
  const s = E.newMatch({ seed: 4, seats: 3, roster, pool });
  const seen = new Set();
  for (let r = 0; r < 20; r++) {
    for (let seat = 0; seat < 3; seat++) {
      const kinds = Object.values(s.round.cards).filter((c) => c.origin === seat).map((c) => c.id0).sort();
      assert.deepEqual(kinds, roster.slice().sort());
    }
    for (const c of s.round.cities) seen.add(c.id);
    s.phase = 'round-over';
    E.nextRound(s);
  }
  assert.deepEqual([...seen].sort(), pool.slice().sort());
});

test('featured cities: round 1 deals one of them; later rounds deal from the pool', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = E.newMatch({ seed, pool: ALL_CITIES, feature: ['tokyo', 'macau'] });
    assert.ok(s.round.cities.some((c) => ['tokyo', 'macau'].includes(c.id)), `seed ${seed}`);
  }
});

test('a table saved by 2b-i (no roster, pool or twist) resumes and finishes as Classic', () => {
  const saved = JSON.parse(readFileSync(new URL('./golden/v2-table.json', import.meta.url), 'utf8'));
  const t = restoreTable(structuredClone(saved));
  assert.deepEqual([t.state.roster, t.state.cityPool, t.state.twist], [DECK, CLASSIC_CITIES, null], 'upgradeState filled the Classic defaults');
  assert.deepEqual(E.deckList(t.state, 0), DECK);
  for (let guard = 0; t.state.phase !== 'match-over' && guard < 5000; guard++) {
    const S = t.state;
    if (S.phase === 'round-over') [0, 1].forEach((seat) => t.act(seat, { a: 'next' }));
    else if (S.round.pending) S.round.pending.from.forEach((seat) => t.act(seat, { a: 'respond', accept: true }));
    else for (const seat of [0, 1]) if (!S.round.plans[seat]) t.act(seat, { a: 'lock', ...t.view(seat).round.legal[0] });
  }
  assert.equal(t.state.phase, 'match-over');
  for (const c of Object.values(t.state.round.cards)) assert.ok(DECK.includes(c.id0));
});

test('canRestore refuses a v2 save that upgradeState could not complete', () => {
  const saved = JSON.parse(readFileSync(new URL('./golden/v2-table.json', import.meta.url), 'utf8'));
  assert.ok(canRestore(saved));
  const without = (k) => {
    const s = structuredClone(saved);
    delete s.state[k];
    return s;
  };
  for (const k of ['tokens', 'reel', 'round']) assert.equal(canRestore(without(k)), false, k);
  assert.throws(() => restoreTable(without('round')), /older version/);
});

// ── the test helpers themselves (Task 4 review) ──────────────────────────────

test('give() never moves out a card it was told to keep, and play() keeps the main card when giving a partner', () => {
  let exercised = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const s = mixed(PLAIN, { seed });
    const R = s.round;
    const first = R.hands[0][0];
    const second = give(s, 0, R.cards[R.decks[0][0]].kind, { keep: [first] });
    assert.ok(R.hands[0].includes(first) && R.hands[0].includes(second), `seed ${seed}: both in hand`);
    assert.equal(R.hands[0].length, 4, `seed ${seed}: the hand stays at four`);
    assert.equal(new Set([...R.hands[0], ...R.decks[0]]).size, ALL_AGENTS.length, `seed ${seed}: no card lost`);
    // The case the review found: the Accomplice first in the hand and its partner in the deck.
    const t = mixed(PLAIN, { seed });
    if (t.round.cards[t.round.hands[0][0]].kind !== 'accomplice' || t.round.hands[0].includes(uidOf(t, 0, 'tripwire'))) continue;
    exercised++;
    play(t, ['accomplice', 0, { partner: 'tripwire' }], ['heavy', 1]);
    assert.equal(cardOf(t, 0, 'accomplice').city, 0, `seed ${seed}`);
  }
  assert.ok(exercised > 0, 'some seed deals the Accomplice first with its partner in the deck');
});

test('play() takes a null options slot; setHand() takes the seat’s own cards, never a rival’s', () => {
  const s = mixed(PLAIN);
  play(s, ['heavy', 0, null], ['heavy', 1, null]);
  assert.deepEqual([cardOf(s, 0, 'heavy').city, cardOf(s, 1, 'heavy').city], [0, 1]);
  const t = mixed(PLAIN);
  // A rival's Mole in seat 0's hand, in front (as a turned asset would be): setHand must still pick seat 0's own.
  const R = t.round;
  const theirs = uidOf(t, 1, 'mole');
  for (const list of [R.hands[1], R.decks[1]]) if (list.includes(theirs)) list.splice(list.indexOf(theirs), 1);
  R.hands[0].unshift(theirs);
  const [mine] = setHand(t, 0, ['mole']);
  assert.equal(mine, uidOf(t, 0, 'mole'));
  assert.ok(R.decks[0].includes(theirs), 'the rival card went to the end of the deck with the rest of the old hand');
});

// ── Agents I: Bodyguard, Decoy, Interrogator, Turncoat (Task 5) ──────────────

test('Bodyguard: an Assassin passes over the guarded agents; the Bodyguard guards everyone but itself', () => {
  const s = mixed(PLAIN);
  play(s, ['heavy', 0], ['mole', 0]);
  play(s, ['bodyguard', 0], ['lookout', 1]);
  play(s, ['veteran', 0], ['assassin', 0]);
  assert.ok(isOut(s, 0, 'bodyguard'));
  assert.ok(!isOut(s, 0, 'heavy') && !isOut(s, 0, 'veteran'));
});

test('Bodyguard: a guarded arrival walks past an armed Tripwire; jammed, it guards nothing', () => {
  const s = mixed(PLAIN);
  play(s, ['bodyguard', 0], ['heavy', 1]);
  play(s, ['lookout', 1], ['tripwire', 0]);
  play(s, ['heavy', 0], null);
  assert.equal(cardOf(s, 0, 'heavy').city, 0);
  assert.equal(cardOf(s, 1, 'tripwire').faceDown, true, 'still armed');
  play(s, null, ['jammer', 0]);
  play(s, ['mole', 0], null);
  assert.ok(isOut(s, 0, 'mole'));
});

test('Bodyguard: Tangier takes the strongest unguarded agent', () => {
  const s = mixed(['tangier', 'monaco', 'zurich']);
  play(s, ['heavy', 0], ['sleeper', 0]);
  play(s, ['bodyguard', 0], null);
  for (let t = 0; t < 4; t++) play(s, null, null);
  assert.ok(isOut(s, 1, 'sleeper'));
  assert.ok(!isOut(s, 0, 'heavy') && !isOut(s, 0, 'bodyguard'));
});

test('Decoy: drops face down and takes the Assassin’s shot, revealed', () => {
  const s = mixed(PLAIN);
  play(s, ['decoy', 0], ['lookout', 1]);
  assert.deepEqual([cardOf(s, 0, 'decoy').faceDown, E.viewFor(s, 1).round.cities[0].sides[0][0].kind], [true, null]);
  play(s, ['heavy', 0], ['mole', 1]);
  const ev = play(s, null, ['assassin', 0]);
  assert.ok(isOut(s, 0, 'decoy') && !isOut(s, 0, 'heavy'));
  assert.ok(ev.some((e) => e.t === 'decoy' && e.uid === uidOf(s, 0, 'decoy') && e.saved === uidOf(s, 0, 'heavy')));
});

test('Decoy: takes a Tripwire meant for your arriving agent; never saves itself; jammed, it saves nobody', () => {
  const s = mixed(PLAIN);
  play(s, ['decoy', 0], ['heavy', 1]);
  play(s, ['lookout', 1], ['tripwire', 0]);
  play(s, ['heavy', 0], null);
  assert.ok(isOut(s, 0, 'decoy') && !isOut(s, 0, 'heavy'));
  assert.equal(cardOf(s, 1, 'tripwire').faceDown, false);
  const self = mixed(PLAIN);
  play(self, ['lookout', 1], ['tripwire', 0]);
  play(self, ['decoy', 0], null);
  assert.ok(isOut(self, 0, 'decoy'));
  const jam = mixed(PLAIN);
  play(jam, ['decoy', 0], ['jammer', 0]);
  play(jam, ['heavy', 0], ['lookout', 1]);
  play(jam, null, ['assassin', 0]);
  assert.ok(isOut(jam, 0, 'heavy') && !isOut(jam, 0, 'decoy'));
});

test('Interrogator: every face-down rival agent here turns face up, at any table size', () => {
  const s = mixed(PLAIN, { seats: 3 });
  play(s, ['heavy', 1], ['sleeper', 0], ['decoy', 0]);
  const ev = play(s, ['interrogator', 0], null, null);
  assert.deepEqual([cardOf(s, 1, 'sleeper').faceDown, cardOf(s, 2, 'decoy').faceDown], [false, false]);
  assert.deepEqual(ev.find((e) => e.t === 'trick' && e.kind === 'interrogator').revealed, [uidOf(s, 1, 'sleeper'), uidOf(s, 2, 'decoy')]);
  assert.equal(E.viewFor(s, 0).round.cities[0].sides[1][0].kind, 'sleeper');
});

test('Interrogator: a revealed Tripwire is disarmed; a revealed face-down drop still has no tricks', () => {
  const s = mixed(['casablanca', 'monaco', 'zurich']);
  play(s, ['bodyguard', 1], ['assassin', 0, { down: true }]);
  play(s, ['lookout', 2], ['tripwire', 1]);
  play(s, ['interrogator', 1], null); // a guarded arrival: the wire stays armed until the flip
  assert.equal(cardOf(s, 1, 'tripwire').faceDown, false);
  const c = mixed(['casablanca', 'monaco', 'zurich']);
  play(c, ['heavy', 1], ['assassin', 0, { down: true }]);
  play(c, ['interrogator', 0, { down: false }], null);
  const a = cardOf(c, 1, 'assassin');
  assert.deepEqual([a.faceDown, E.hasTricks(c, a)], [false, false]);
});

test('Interrogator: a guarded arrival leaves the Tripwire armed; the flip reveals it, hidden, and it never springs', () => {
  const s = mixed(PLAIN);
  play(s, ['bodyguard', 1], ['lookout', 2]);
  play(s, ['lookout', 2], ['tripwire', 1]);
  const ev = play(s, ['interrogator', 1], null);
  const wire = cardOf(s, 1, 'tripwire');
  assert.deepEqual([wire.faceDown, wire.hidden, wire.city], [false, true, 1]);
  assert.ok(!ev.some((e) => e.t === 'tripwire'), 'the guarded Interrogator walked past the wire');
  assert.ok(ev.some((e) => e.t === 'reveal' && e.uid === wire.uid && e.by === 'interrogator'));
  assert.ok(!isOut(s, 0, 'interrogator'));
});

test('Turncoat: swaps sides with the weakest face-up rival agent here', () => {
  const s = mixed(PLAIN, { seats: 3 });
  play(s, ['heavy', 1], ['lookout', 0], ['veteran', 0]);
  const ev = play(s, ['turncoat', 0], null, null);
  assert.deepEqual([cardOf(s, 1, 'lookout').owner, cardOf(s, 0, 'turncoat').owner], [0, 1]);
  assert.ok(s.round.cities[0].sides[0].includes(uidOf(s, 1, 'lookout')));
  assert.ok(s.round.cities[0].sides[1].includes(uidOf(s, 0, 'turncoat')));
  assert.ok(ev.some((e) => e.kind === 'turncoat' && e.target === uidOf(s, 1, 'lookout') && e.to === 1));
});

test('Turncoat: ties go to the latest arrival; a guard, a Decoy and Moscow change the outcome', () => {
  const tie = mixed(PLAIN);
  play(tie, ['heavy', 1], ['lookout', 0]);
  play(tie, null, ['assassin', 0]);
  play(tie, ['turncoat', 0], null);
  assert.equal(cardOf(tie, 1, 'assassin').owner, 0);
  const guard = mixed(PLAIN);
  play(guard, null, ['lookout', 0]);
  play(guard, null, ['bodyguard', 0]);
  play(guard, ['turncoat', 0], null);
  assert.deepEqual([cardOf(guard, 1, 'bodyguard').owner, cardOf(guard, 1, 'lookout').owner], [0, 1]);
  const decoy = mixed(PLAIN);
  play(decoy, null, ['decoy', 0]);
  play(decoy, null, ['lookout', 0]);
  play(decoy, ['turncoat', 0], null);
  assert.deepEqual([cardOf(decoy, 1, 'decoy').owner, cardOf(decoy, 1, 'decoy').faceDown, cardOf(decoy, 1, 'lookout').owner], [0, false, 1]);
  const mos = mixed(['moscow', 'monaco', 'zurich']);
  play(mos, null, ['lookout', 0]);
  const ev = play(mos, ['turncoat', 0], null);
  assert.deepEqual([cardOf(mos, 1, 'lookout').owner, ev.find((e) => e.t === 'trick' && e.kind === 'turncoat').target], [1, null]);
});

test('Turncoat: an agent turned before its own flip loses that flip, and the board stays whole', () => {
  // Three seats, round 1, flips in seat order: seat 1's mark is seat 2, so its Double Agent would chase seat 2's drop.
  const s = mixed(PLAIN, { seats: 3 });
  play(s, ['turncoat', 0], ['double', 0], ['heavy', 1]);
  const [da, tc] = [cardOf(s, 1, 'double'), cardOf(s, 0, 'turncoat')];
  assert.deepEqual([da.owner, da.city, tc.owner, tc.city], [0, 0, 1, 0]);
  const R = s.round;
  R.cities.forEach((city, ci) => city.sides.forEach((side, seat) => side.forEach((u) => assert.deepEqual([R.cards[u].city, R.cards[u].owner], [ci, seat], u))));
  assert.equal(Object.values(R.cards).filter((c) => c.city !== null).length, R.cities.flatMap((c) => c.sides.flat()).length, 'every card on the board sits in exactly one side');
});

test('Turncoat: a Getaway can send home a Turncoat that just turned to its side, and the turn still resolves', () => {
  // Found by Mixed random play: the Hong Kong draw read the Turncoat's old uid after the Getaway re-keyed it.
  const s = mixed(['hongkong', 'vienna', 'zurich']);
  play(s, ['lookout', 0], null);
  assert.equal(s.round.initiative, 1, 'turn 2: seat 1 flips first');
  const ev = play(s, ['getaway', 0], ['turncoat', 0]);
  const tc = cardOf(s, 1, 'turncoat');
  assert.deepEqual([tc.owner, tc.city, tc.uid[0], s.round.hands[0].includes(tc.uid)], [0, null, 'a', true], 'the Turncoat sits in seat 0’s hand, re-keyed');
  assert.deepEqual([cardOf(s, 0, 'lookout').owner, cardOf(s, 0, 'lookout').city], [1, 0]);
  assert.deepEqual(ev.filter((e) => e.t === 'draw' && e.why === 'hongkong').map((e) => e.seat), [0], 'seat 1’s drop has left Hong Kong: no draw');
});

test('a turned asset sent home and dropped face down shows rivals its new owner as its origin', () => {
  // As above: seat 1's Turncoat turns to seat 0's side and seat 0's Getaway sends it home, re-keyed.
  const s = mixed(['hongkong', 'vienna', 'zurich']);
  play(s, ['lookout', 0], null);
  play(s, ['getaway', 0], ['turncoat', 0]);
  const { uid } = cardOf(s, 1, 'turncoat');
  assert.ok(E.lock(s, 0, { uid, city: 1 })); // Vienna: face down
  s.round.plans[1] = { pass: true };
  E.resolveTurn(s);
  const seenBy = (seat) => E.viewFor(s, seat).round.cities[1].sides[0].find((cv) => cv.uid === uid);
  for (const seat of [1, -1]) {
    const cv = seenBy(seat);
    assert.deepEqual([cv.kind, cv.id0, cv.owner, cv.origin, cv.uid[0]], [null, null, 0, 0, 'a'], `seat ${seat}`);
  }
  assert.deepEqual([seenBy(0).kind, seenBy(0).origin], ['turncoat', 1], 'its owner knows where it came from');
});

test('Decoy: still face down when the round ends, it takes Tangier’s hit for its side, once', () => {
  const s = mixed(['tangier', 'monaco', 'zurich']);
  play(s, ['heavy', 0], ['mole', 0]);
  play(s, ['decoy', 0], null);
  for (let t = 0; t < 3; t++) play(s, null, null);
  const ev = play(s, null, null);
  assert.ok(isOut(s, 0, 'decoy') && !isOut(s, 0, 'heavy') && !isOut(s, 1, 'mole'));
  const decoy = uidOf(s, 0, 'decoy');
  const saved = ev.findIndex((e) => e.t === 'decoy' && e.uid === decoy && e.saved === uidOf(s, 0, 'heavy'));
  const out = ev.findIndex((e) => e.t === 'out' && e.uid === decoy && e.cause === 'tangier');
  assert.ok(saved >= 0 && out > saved, 'a decoy event, then the Decoy goes to Tangier');
  assert.deepEqual(s.round.result.totals[0], [5, 2], 'the Heavy counts (6, −1 for the rival Mole)');
  // A Decoy whose side Tangier doesn't hit is still turned over at the end of the round.
  const spare = mixed(['tangier', 'monaco', 'zurich']);
  play(spare, ['decoy', 0], ['heavy', 0]);
  for (let t = 0; t < 4; t++) play(spare, null, null);
  const ev2 = play(spare, null, null);
  assert.ok(isOut(spare, 1, 'heavy') && !isOut(spare, 0, 'decoy'));
  assert.equal(cardOf(spare, 0, 'decoy').faceDown, false);
  assert.ok(ev2.some((e) => e.t === 'reveal' && e.uid === uidOf(spare, 0, 'decoy')));
});

test('Decoy: revealed earlier (by an Interrogator), it doesn’t cover Tangier', () => {
  const s = mixed(['tangier', 'monaco', 'zurich']);
  play(s, ['heavy', 0], null);
  play(s, ['decoy', 0], null);
  play(s, null, ['interrogator', 0]);
  assert.equal(cardOf(s, 0, 'decoy').faceDown, false);
  for (let t = 0; t < 3; t++) play(s, null, null);
  assert.ok(isOut(s, 0, 'heavy') && !isOut(s, 0, 'decoy'));
});

test('Decoy: at Tangier’s top power itself, it stands in for the other and goes once', () => {
  const s = mixed(['tangier', 'monaco', 'zurich']);
  play(s, ['tripwire', 0], null);
  play(s, ['decoy', 0], null);
  for (let t = 0; t < 4; t++) play(s, null, null);
  assert.ok(isOut(s, 0, 'decoy') && !isOut(s, 0, 'tripwire'));
  assert.equal(s.round.gone[0].filter((u) => u === uidOf(s, 0, 'decoy')).length, 1);
});

// ── Agents II: Accomplice, Courier, Blackmailer, Wiretap (Task 6) ────────────

test('Accomplice: legal drops offer it alone or with any other card in hand, where two places are free', () => {
  const s = mixed(['berlin', 'monaco', 'zurich']);
  const acc = give(s, 0, 'accomplice');
  const others = s.round.hands[0].filter((u) => u !== acc);
  const mine = (ci) => E.legalDrops(s, 0).filter((d) => d.uid === acc && d.city === ci);
  for (let ci = 0; ci < 3; ci++) {
    assert.deepEqual(mine(ci)[0], { uid: acc, city: ci }, 'alone first');
    assert.deepEqual(mine(ci).slice(1).map((d) => d.partner), others);
  }
  play(s, ['heavy', 0], null); // Berlin holds two a side: one place left
  assert.deepEqual(mine(0), [{ uid: acc, city: 0 }]);
  assert.equal(E.lock(s, 0, { uid: acc, city: 0, partner: s.round.hands[0].find((u) => u !== acc) }), false);
});

test('Accomplice: both land; the partner is face down with its tricks off, flagged for everyone', () => {
  const s = mixed(PLAIN);
  const ev = play(s, ['accomplice', 0, { partner: 'assassin' }], ['heavy', 0]);
  const p = cardOf(s, 0, 'assassin');
  assert.deepEqual([p.city, p.faceDown, p.hidden, p.partner], [0, true, true, true]);
  assert.ok(!isOut(s, 1, 'heavy'), 'a partner Assassin has no trick');
  const cv = E.viewFor(s, 1).round.cities[0].sides[0].find((c) => c.uid === p.uid);
  assert.deepEqual([cv.kind, cv.partner], [null, true]);
  assert.equal(s.round.hands[0].length, 3, 'four, less two dropped, plus the turn’s draw');
  assert.ok(ev.some((e) => e.t === 'drop' && e.uid === p.uid && e.partnerOf === uidOf(s, 0, 'accomplice')));
  assert.equal(E.viewFor(s, 1).round.events.find((e) => e.uid === p.uid).kind, null);
});

test('Accomplice: a Tripwire partner still springs; a partner sent home comes back unflagged under a new uid', () => {
  const s = mixed(PLAIN);
  play(s, ['accomplice', 0, { partner: 'tripwire' }], ['lookout', 1]);
  play(s, null, ['heavy', 0]);
  assert.ok(isOut(s, 1, 'heavy'));
  const g = mixed(PLAIN);
  play(g, ['accomplice', 0, { partner: 'tripwire' }], null);
  const old = uidOf(g, 0, 'tripwire');
  play(g, ['getaway', 0], null);
  const back = cardOf(g, 0, 'tripwire');
  assert.notEqual(back.uid, old);
  assert.deepEqual([g.round.hands[0].includes(back.uid), back.partner, back.faceDown, back.hidden], [true, undefined, false, false]);
});

test('Accomplice: a hand of just the Accomplice can still drop it', () => {
  const s = mixed(PLAIN);
  setHand(s, 0, ['accomplice']);
  assert.deepEqual(E.legalDrops(s, 0).map((d) => Object.keys(d).sort().join()), ['city,uid', 'city,uid', 'city,uid']);
});

test('Accomplice: Istanbul gives both its bonus; Hong Kong draws once; the Accomplice arrives first', () => {
  const s = mixed(['istanbul', 'hongkong', 'zurich']);
  play(s, ['accomplice', 0, { partner: 'heavy' }], null);
  const [a, h] = [cardOf(s, 0, 'accomplice'), cardOf(s, 0, 'heavy')];
  assert.deepEqual([a.bonus, h.bonus, h.turn], [3, 3, 1]);
  assert.deepEqual(s.round.cities[0].sides[0], [a.uid, h.uid]);
  const k = mixed(['istanbul', 'hongkong', 'zurich']);
  const ev = play(k, ['accomplice', 1, { partner: 'heavy' }], null);
  assert.equal(ev.filter((e) => e.t === 'draw' && e.seat === 0 && e.why === 'hongkong').length, 1);
  const drops = ev.filter((e) => e.t === 'drop' && e.seat === 0);
  assert.deepEqual(drops.map((e) => [e.uid, e.partner, e.partnerOf]), [[uidOf(k, 0, 'accomplice'), uidOf(k, 0, 'heavy'), undefined], [uidOf(k, 0, 'heavy'), undefined, uidOf(k, 0, 'accomplice')]]);
});

test('Accomplice: a face-down Decoy partner can take a Tripwire meant for its Accomplice', () => {
  const s = mixed(PLAIN);
  play(s, ['lookout', 1], ['tripwire', 0]);
  play(s, ['accomplice', 0, { partner: 'decoy' }], null);
  assert.ok(isOut(s, 0, 'decoy') && !isOut(s, 0, 'accomplice'));
  assert.deepEqual(s.round.cities[0].sides[0], [uidOf(s, 0, 'accomplice')]);
  assert.equal(cardOf(s, 0, 'accomplice').city, 0);
});

test('lock stores the matched legal drop: no stray keys; a partner or a face the drop doesn’t offer is refused', () => {
  const s = mixed(PLAIN);
  const heavy = give(s, 0, 'heavy');
  const other = s.round.hands[0].find((u) => u !== heavy);
  assert.equal(E.lock(s, 0, { uid: heavy, city: 0, partner: other }), false, 'only an Accomplice takes a partner');
  assert.equal(E.lock(s, 0, { uid: heavy, city: 0, down: true }), false, 'only Casablanca offers a face');
  assert.ok(E.lock(s, 0, { city: 0, uid: heavy, down: false, extra: 1 }));
  assert.deepEqual(Object.keys(s.round.plans[0]), ['uid', 'city']);
  const acc = give(s, 1, 'accomplice');
  const mate = s.round.hands[1].find((u) => u !== acc);
  assert.equal(E.lock(s, 1, { uid: acc, city: 2, partner: acc }), false, 'never itself');
  assert.ok(E.lock(s, 1, { partner: mate, uid: acc, city: 2, extra: 1 }));
  assert.deepEqual(s.round.plans[1], { uid: acc, city: 2, partner: mate });
  assert.deepEqual(E.viewFor(s, 1).round.plan, { uid: acc, city: 2, partner: mate });
});

test('Courier: your strongest face-up agent elsewhere moves here, and it arrives (Tokyo counts it last)', () => {
  const s = mixed(['tokyo', 'monaco', 'zurich']);
  play(s, ['heavy', 1], null);
  play(s, ['handler', 2], null);
  const ev = play(s, ['courier', 0], null);
  const h = cardOf(s, 0, 'heavy');
  assert.deepEqual([h.city, h.turn], [0, 3]);
  assert.deepEqual([E.powerOf(s, h.uid), E.powerOf(s, uidOf(s, 0, 'courier'))], [9, 5], 'both arrived on the latest turn');
  assert.ok(ev.some((e) => e.kind === 'courier' && e.moved === h.uid && e.from === 1));
});

test('Courier: the move comes first in the events, then the arrival; the mover’s bonus resets', () => {
  const s = mixed(['istanbul', 'monaco', 'zurich']);
  play(s, ['heavy', 0], null); // Istanbul's first arrival: +3
  play(s, ['handler', 2], null);
  const ev = play(s, ['courier', 1], null);
  const h = cardOf(s, 0, 'heavy');
  assert.deepEqual([h.city, h.turn, h.bonus, E.powerOf(s, h.uid)], [1, 3, 0, 6]);
  const trick = ev.find((e) => e.t === 'trick' && e.kind === 'courier');
  assert.deepEqual([trick.moved, trick.from], [h.uid, 0]);
  assert.deepEqual(s.round.cities[1].sides[0], [uidOf(s, 0, 'courier'), h.uid]);
  assert.deepEqual(s.round.cities[0].sides[0], []);
});

test('Courier: never out of Moscow, never a face-down agent, not without room; ties go to the latest arrival', () => {
  const s = mixed(['moscow', 'monaco', 'zurich']);
  play(s, ['heavy', 0], null);
  play(s, ['sleeper', 1], null);
  const ev = play(s, ['courier', 2], null);
  assert.deepEqual([ev.find((e) => e.t === 'trick' && e.kind === 'courier').moved, cardOf(s, 0, 'heavy').city], [null, 0]);
  const full = mixed(['berlin', 'monaco', 'zurich']);
  play(full, ['heavy', 1], null);
  play(full, ['lookout', 0], null);
  play(full, ['courier', 0], null);
  assert.equal(cardOf(full, 0, 'heavy').city, 1);
  const tie = mixed(PLAIN);
  play(tie, ['veteran', 1], null); // 3 + 3 alone
  play(tie, ['heavy', 2], null); // 6, later
  play(tie, ['courier', 0], null);
  assert.deepEqual([cardOf(tie, 0, 'heavy').city, cardOf(tie, 0, 'veteran').city], [0, 1]);
});

test('Blackmailer: with no escalation yet the stake doubles for free; nobody answers or spends a token', () => {
  const s = mixed(PLAIN, { seats: 3 });
  E.fold(s, 2);
  const ev = play(s, ['blackmailer', 0], ['heavy', 1], null);
  assert.deepEqual([s.round.stake, s.tokens, s.round.pending], [2, Array(3).fill(RULES.tokens), null]);
  assert.deepEqual(s.round.called, { by: 0, answers: [null, 'on', null], free: true });
  assert.equal(ev.find((e) => e.t === 'trick' && e.kind === 'blackmailer').stake, 2);
  assert.equal(E.canEscalate(s, 1), false, 'the round’s one escalation is used');
});

test('Blackmailer: once someone has escalated it does nothing; face down it does nothing', () => {
  const s = mixed(PLAIN);
  E.escalate(s, 1);
  E.respond(s, 0, true);
  const ev = play(s, ['blackmailer', 0], null);
  assert.deepEqual([s.round.stake, ev.find((e) => e.t === 'trick' && e.kind === 'blackmailer').stake], [2, null]);
  const c = mixed(['casablanca', 'monaco', 'zurich']);
  play(c, ['blackmailer', 0, { down: true }], null);
  assert.equal(c.round.stake, 1);
});

test('Blackmailer: once someone has escalated it does nothing, and the call stays theirs; views show a free call', () => {
  const s = mixed(PLAIN);
  E.escalate(s, 1);
  E.respond(s, 0, true);
  const called = structuredClone(s.round.called);
  const ev = play(s, ['blackmailer', 0], null);
  assert.deepEqual([s.round.stake, ev.find((e) => e.t === 'trick' && e.kind === 'blackmailer').stake, s.round.called], [2, null, called]);
  assert.deepEqual(E.viewFor(s, 0).round.called, { by: 1, answers: ['on', null] }, 'no free key on a paid call');
  const f = mixed(PLAIN);
  play(f, ['blackmailer', 0], null);
  assert.deepEqual(E.viewFor(f, 1).round.called, { by: 0, answers: [null, 'on'], free: true });
});

test('Wiretap: next turn the wiretapper hears the city its mark locks, and nobody else does', () => {
  const s = mixed(PLAIN, { seats: 3 });
  const ev = play(s, ['wiretap', 0], ['heavy', 1], ['heavy', 1]);
  assert.ok(ev.some((e) => e.kind === 'wiretap' && e.on === 1 && e.turn === 2));
  assert.deepEqual(E.viewFor(s, 0).round.tapped, [{ seat: 1, city: null }]);
  assert.ok(E.lock(s, 1, { uid: give(s, 1, 'mole'), city: 2 }));
  assert.deepEqual(E.viewFor(s, 0).round.tapped, [{ seat: 1, city: 2 }]);
  for (const seat of [1, 2, -1]) assert.deepEqual(E.viewFor(s, seat).round.tapped, [], `seat ${seat}`);
  assert.deepEqual(E.viewFor(s, 1).round.taps, [{ by: 0, on: 1 }], 'the mark knows its line is tapped');
  E.unlock(s, 1);
  assert.deepEqual(E.viewFor(s, 0).round.tapped, [{ seat: 1, city: null }]);
  play(s, ['heavy', 1], ['mole', 2], ['lookout', 1]);
  assert.deepEqual([E.viewFor(s, 0).round.tapped, E.viewFor(s, 1).round.taps], [[], []], 'one turn only');
});

test('Wiretap: on the final turn there is no next turn to tap', () => {
  const s = mixed(PLAIN);
  for (let t = 1; t < TURNS; t++) play(s, null, null);
  const ev = play(s, ['wiretap', 0], null);
  assert.equal(ev.find((e) => e.t === 'trick' && e.kind === 'wiretap').turn, null);
});

// ── The nine new cities (Task 7) ─────────────────────────────────────────────

test('Reykjavik: most agents holds it; a tie on agents goes to the higher total', () => {
  assert.equal(E.leaderOf('reykjavik', [6, 2], [1, 2]), 1);
  assert.equal(E.leaderOf('reykjavik', [6, 3], [2, 2]), 0);
  assert.equal(E.leaderOf('reykjavik', [3, 3], [2, 2]), null);
  assert.equal(E.leaderOf('reykjavik', [0, 5], [2, 1]), 0, 'even with no power');
  assert.equal(E.leaderOf('reykjavik', [1, 9, 9], [1, 2, 2]), null);
});

test('Geneva: a tie goes to whoever is behind in the match', () => {
  assert.equal(E.leaderOf('geneva', [4, 4], [1, 1], [3, 5]), 0);
  assert.equal(E.leaderOf('geneva', [4, 4], [1, 1], [5, 5]), null);
  assert.equal(E.leaderOf('geneva', [4, 4, 2], [1, 1, 1], [6, 2, 0]), 1, 'only the tied seats count');
  assert.equal(E.leaderOf('monaco', [4, 4], [1, 1], [3, 5]), null);
  const s = mixed(['geneva', 'monaco', 'zurich']);
  s.scores = [3, 5];
  play(s, ['heavy', 0], ['heavy', 0]);
  assert.equal(E.cityLeader(s, 0), 0);
});

test('Casablanca: every drop there comes face up or face down, and the choice holds', () => {
  const s = mixed(['casablanca', 'monaco', 'zurich']);
  const heavy = give(s, 0, 'heavy');
  assert.deepEqual(E.legalDrops(s, 0).filter((d) => d.uid === heavy && d.city === 0).map((d) => d.down), [false, true]);
  assert.ok(E.legalDrops(s, 0).filter((d) => d.city !== 0).every((d) => !('down' in d)));
  play(s, ['heavy', 0, { down: true }], ['sleeper', 0, { down: false }]);
  assert.deepEqual([cardOf(s, 0, 'heavy').faceDown, cardOf(s, 1, 'sleeper').faceDown], [true, false]);
  assert.equal(E.viewFor(s, 1).round.cities[0].sides[0][0].kind, null);
  play(s, ['assassin', 0, { down: true }], null);
  assert.ok(!isOut(s, 1, 'sleeper'), 'a face-down Assassin has no trick');
  const up = mixed(['casablanca', 'monaco', 'zurich']);
  play(up, ['tripwire', 0, { down: false }], null);
  play(up, null, ['heavy', 0]);
  assert.ok(!isOut(up, 1, 'heavy'), 'a face-up Tripwire never springs');
});

test('Rome: each side’s single strongest agent counts double', () => {
  const s = mixed(['rome', 'monaco', 'zurich']);
  play(s, ['heavy', 0], ['veteran', 0]);
  play(s, ['handler', 0], ['lookout', 0]);
  assert.deepEqual(E.cityTotals(s, 0), [16, 7]); // (6+1)×2 + 2 against 3×2 + 1
  assert.deepEqual(E.viewFor(s, 1).round.cities[0].known, [16, 7]);
});

test('Rome: known totals double only what the viewer can see; spectators see the face-up agents', () => {
  const s = mixed(['rome', 'monaco', 'zurich']);
  play(s, ['sleeper', 0], ['lookout', 0]);
  play(s, ['handler', 0], null);
  assert.equal(E.cityTotals(s, 0)[0], 12); // (4+1)×2 + 2, the Sleeper face down
  assert.equal(E.viewFor(s, 0).round.cities[0].known[0], 12);
  for (const seat of [1, -1, null]) assert.equal(E.viewFor(s, seat).round.cities[0].known[0], 4, `seat ${seat}: the Handler alone, doubled`);
});

test('Tokyo: the agents that arrived on the latest turn get +3', () => {
  const s = mixed(['tokyo', 'monaco', 'zurich']);
  play(s, ['heavy', 0], ['mole', 0]);
  assert.deepEqual([E.powerOf(s, uidOf(s, 0, 'heavy')), E.powerOf(s, uidOf(s, 1, 'mole'))], [8, 5]);
  play(s, ['lookout', 0], null);
  assert.deepEqual([E.powerOf(s, uidOf(s, 0, 'heavy')), E.powerOf(s, uidOf(s, 0, 'lookout')), E.powerOf(s, uidOf(s, 1, 'mole'))], [5, 3, 2]);
});

test('Zurich: a round tied on cities goes to its holder, whatever the power', () => {
  const s = mixed(['zurich', 'monaco', 'berlin']);
  play(s, ['heavy', 1], ['lookout', 0]);
  for (let t = 1; t < TURNS; t++) play(s, null, null);
  assert.equal(s.round.result.winner, 1);
});

test('Macau: the round’s winner holding Macau scores the stake once more', () => {
  const s = mixed(['macau', 'monaco', 'zurich']);
  E.escalate(s, 0);
  E.respond(s, 1, true);
  ['heavy', 'sleeper', 'veteran', 'jammer', 'handler', 'mole'].forEach((kind, i) => play(s, [kind, i % 3], null));
  assert.deepEqual(pick(s.round.result, ['winner', 'points', 'macau', 'monaco']), { winner: 0, points: 6, macau: 0, monaco: 0 });
  assert.equal(s.scores[0], 7);
  const n = mixed(['macau', 'monaco', 'zurich']);
  play(n, ['heavy', 1], ['lookout', 0]);
  play(n, ['sleeper', 2], null);
  for (let t = 2; t < TURNS; t++) play(n, null, null);
  assert.deepEqual(pick(n.round.result, ['winner', 'points', 'macau']), { winner: 0, points: 2, macau: null });
});

test('Glienicke Bridge: after turn 3 each side’s strongest agent there crosses over, face up; two players swap', () => {
  const s = mixed(['glienicke', 'monaco', 'zurich']);
  play(s, ['heavy', 0], ['sleeper', 0]);
  play(s, ['lookout', 0], ['handler', 0]);
  const ev = play(s, null, null);
  assert.deepEqual([cardOf(s, 0, 'heavy').owner, cardOf(s, 1, 'sleeper').owner, cardOf(s, 1, 'sleeper').faceDown], [1, 0, false]);
  assert.deepEqual(ev.find((e) => e.t === 'bridge'), { t: 'bridge', city: 0, moves: [{ uid: uidOf(s, 0, 'heavy'), from: 0, to: 1 }, { uid: uidOf(s, 1, 'sleeper'), from: 1, to: 0 }] });
});

test('Glienicke Bridge: with more players each crosses to the next player still in', () => {
  const s = mixed(['glienicke', 'monaco', 'zurich'], { seats: 3 });
  play(s, ['heavy', 0], ['handler', 0], ['lookout', 0]);
  E.fold(s, 1);
  play(s, null, null, null);
  play(s, null, null, null);
  assert.deepEqual([cardOf(s, 0, 'heavy').owner, cardOf(s, 2, 'lookout').owner], [2, 0]);
});

test('Prague: an arrival turns every other face-down agent there face up, after any Tripwire', () => {
  const s = mixed(['prague', 'monaco', 'zurich']);
  play(s, ['sleeper', 0], ['heavy', 1]);
  assert.equal(cardOf(s, 0, 'sleeper').faceDown, true, 'nobody else has arrived');
  const ev = play(s, ['lookout', 1], ['mole', 0]);
  assert.equal(cardOf(s, 0, 'sleeper').faceDown, false);
  assert.ok(ev.some((e) => e.t === 'reveal' && e.uid === uidOf(s, 0, 'sleeper') && e.by === 'prague'));
  const both = mixed(['prague', 'monaco', 'zurich']);
  play(both, ['sleeper', 0], ['decoy', 0]);
  assert.deepEqual([cardOf(both, 0, 'sleeper').faceDown, cardOf(both, 1, 'decoy').faceDown], [false, false], 'same-turn drops reveal each other');
  const wire = mixed(['prague', 'monaco', 'zurich']);
  play(wire, ['lookout', 1], ['tripwire', 0]);
  play(wire, ['heavy', 0], null);
  assert.ok(isOut(wire, 0, 'heavy'));
});

// ── Task 7 review ────────────────────────────────────────────────────────────

test('Prague: the turn’s drops reveal once all have arrived, so who moves first changes nothing', () => {
  const seen = new Set();
  for (const no of [0, 1]) {
    const s = mixed(['prague', 'monaco', 'zurich']);
    if (no) {
      s.roundNo = no;
      E.startRound(s, { cities: ['prague', 'monaco', 'zurich'] });
    }
    play(s, ['lookout', 1], ['tripwire', 0]);
    seen.add(s.round.initiative);
    // Seat 1's own Sleeper arriving first must not disarm its Tripwire before the Heavy arrives.
    const ev = play(s, ['heavy', 0], ['sleeper', 0]);
    assert.ok(isOut(s, 0, 'heavy'), `round ${no}: the wire takes the Heavy`);
    assert.equal(cardOf(s, 1, 'sleeper').faceDown, true, `round ${no}: the one arrival left keeps its face`);
    assert.ok(!ev.some((e) => e.by === 'prague'), `round ${no}: nothing was left face down to reveal`);
  }
  assert.deepEqual([...seen].sort(), [0, 1], 'both initiatives on turn 2');
});

test('Prague: a move during the flips (a Double Agent’s) still reveals on its own arrival', () => {
  const s = mixed(['prague', 'monaco', 'zurich']);
  const ev = play(s, ['double', 1], ['sleeper', 0]);
  assert.equal(cardOf(s, 0, 'double').city, 0, 'the Double Agent followed its rival into Prague');
  assert.equal(cardOf(s, 1, 'sleeper').faceDown, false);
  const move = ev.findIndex((e) => e.t === 'trick' && e.kind === 'double');
  const reveal = ev.findIndex((e) => e.by === 'prague' && e.uid === uidOf(s, 1, 'sleeper'));
  assert.ok(move >= 0 && reveal > move, 'revealed by the move: the Sleeper was the only drop there');
});

test('Glienicke Bridge: with three players in, each crosses to the next seat round the table', () => {
  const s = mixed(['glienicke', 'monaco', 'zurich'], { seats: 3 });
  play(s, ['heavy', 0], ['veteran', 0], ['lookout', 0]);
  play(s, null, null, null);
  const ev = play(s, null, null, null);
  const [h, v, l] = [uidOf(s, 0, 'heavy'), uidOf(s, 1, 'veteran'), uidOf(s, 2, 'lookout')];
  assert.deepEqual(ev.find((e) => e.t === 'bridge').moves, [{ uid: h, from: 0, to: 1 }, { uid: v, from: 1, to: 2 }, { uid: l, from: 2, to: 0 }]);
  assert.deepEqual(s.round.cities[0].sides, [[l], [h], [v]]);
});

test('Glienicke Bridge: on equal power the latest arrival crosses, then the last in side order', () => {
  // The latest arrival, also last in side order: a Jammer (turn 1) and a Veteran (turn 2), 3 each.
  const a = mixed(['glienicke', 'monaco', 'zurich']);
  play(a, ['jammer', 0], null);
  play(a, ['veteran', 0], null);
  play(a, null, null);
  assert.deepEqual([cardOf(a, 0, 'veteran').owner, cardOf(a, 0, 'jammer').owner], [1, 0]);
  // The latest arrival first in side order: the Turncoat (0, turn 3) takes the Lookout's place in seat 1's
  // side, ahead of seat 1's Tripwire (0, turn 2), and crosses back.
  const b = mixed(['glienicke', 'monaco', 'zurich']);
  play(b, ['bodyguard', 0], ['lookout', 0]);
  play(b, null, ['tripwire', 0]);
  const ev = play(b, ['turncoat', 0], null); // guarded, it walks past the wire, then swaps with the Lookout
  assert.deepEqual(ev.find((e) => e.t === 'bridge').moves, [{ uid: uidOf(b, 0, 'bodyguard'), from: 0, to: 1 }, { uid: uidOf(b, 0, 'turncoat'), from: 1, to: 0 }]);
  assert.equal(cardOf(b, 1, 'tripwire').owner, 1);
  // Equal power and turn: an Accomplice and its partner Lookout (1 each, turn 1); the partner is last.
  const c = mixed(['glienicke', 'monaco', 'zurich']);
  play(c, ['accomplice', 0, { partner: 'lookout' }], null);
  play(c, null, null);
  play(c, null, null);
  assert.deepEqual([cardOf(c, 0, 'lookout').owner, cardOf(c, 0, 'lookout').faceDown, cardOf(c, 0, 'accomplice').owner], [1, false, 0]);
});

test('Macau: a round that ends in a fold scores nothing extra', () => {
  const s = mixed(['macau', 'monaco', 'zurich']);
  play(s, ['heavy', 0], null);
  E.fold(s, 1);
  assert.deepEqual(pick(s.round.result, ['winner', 'points', 'folded']), { winner: 0, points: 1, folded: 1 });
  assert.equal(s.round.result.macau ?? null, null);
  assert.equal(s.scores[0], 1);
});

test('Casablanca: a face-up Decoy has no trick; face down, it stands in', () => {
  const up = mixed(['casablanca', 'monaco', 'zurich']);
  play(up, ['decoy', 0, { down: false }], ['lookout', 1]);
  play(up, ['heavy', 0], null);
  play(up, null, ['assassin', 0]);
  assert.ok(isOut(up, 0, 'heavy') && !isOut(up, 0, 'decoy'));
  const down = mixed(['casablanca', 'monaco', 'zurich']);
  play(down, ['decoy', 0, { down: true }], ['lookout', 1]);
  play(down, ['heavy', 0], null);
  play(down, null, ['assassin', 0]);
  assert.ok(isOut(down, 0, 'decoy') && !isOut(down, 0, 'heavy'));
});

const deckOf = (s, seat) => Object.values(s.round.cards).filter((c) => c.origin === seat).map((c) => c.id0).sort();

test('twist extra: the Magpie’s seat carries the roster plus a second Lookout, every round', () => {
  const s = E.newMatch({ seed: 2, twist: { seat: 1, id: 'extra', kind: 'lookout' } });
  for (let r = 0; r < 3; r++) {
    assert.deepEqual([deckOf(s, 0).length, deckOf(s, 1).length], [12, 13]);
    assert.equal(deckOf(s, 1).filter((k) => k === 'lookout').length, 2);
    s.phase = 'round-over';
    E.nextRound(s);
  }
  assert.deepEqual(E.deckList(E.viewFor(s, 0), 1), [...DECK, 'lookout']);
});

test('twist placed: Heron starts every round with a Sleeper face down in a city, flagged placed', () => {
  const cities = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const s = E.newMatch({ seed, twist: { seat: 1, id: 'placed', kind: 'sleeper' } });
    const c = cardOf(s, 1, 'sleeper');
    assert.deepEqual([c.turn, c.faceDown, c.hidden, c.placed, c.owner], [0, true, true, true, 1]);
    assert.ok(s.round.cities[c.city].sides[1].includes(c.uid));
    assert.equal(s.round.hands[1].length, 4);
    const cv = E.viewFor(s, 0).round.cities[c.city].sides[1][0];
    assert.deepEqual([cv.kind, cv.placed], [null, true]);
    cities.add(c.city);
  }
  assert.equal(cities.size, 3);
});

test('twist tap: on the final turn the Countess hears your city once you lock in', () => {
  const s = E.newMatch({ seed: 5, twist: { seat: 1, id: 'tap', from: TURNS } });
  for (let t = 1; t < TURNS; t++) {
    assert.deepEqual(E.viewFor(s, 1).round.tapped, []);
    play(s, null, null);
  }
  assert.deepEqual(E.viewFor(s, 1).round.tapped, [{ seat: 0, city: null }]);
  const d = E.legalDrops(s, 0)[0];
  E.lock(s, 0, d);
  assert.deepEqual(E.viewFor(s, 1).round.tapped, [{ seat: 0, city: d.city }]);
});

test('twist seen at count 1: the rival sees one card of your hand, and knows it even face down', () => {
  const s = E.newMatch({ seed: 6, cities: ['vienna', 'monaco', 'zurich'], twist: { seat: 1, id: 'seen', count: 1 } });
  assert.equal(s.round.exposed.length, 1);
  const { uid } = s.round.exposed[0];
  assert.ok(s.round.hands[0].includes(uid));
  const kind = s.round.cards[uid].kind;
  assert.deepEqual(E.viewFor(s, 1).round.exposed, [{ uid, by: 1, kind }]);
  assert.deepEqual(E.viewFor(s, 0).round.exposed, [{ uid, by: 1, kind }], 'you know which card was seen');
  assert.deepEqual(E.viewFor(s, -1).round.exposed, []);
  E.lock(s, 0, { uid, city: 0 }); // face down in Vienna
  s.round.plans[1] = { pass: true };
  E.resolveTurn(s);
  assert.equal(E.viewFor(s, 1).round.cities[0].sides[0][0].kind, null);
  assert.equal(E.viewFor(s, 1).round.exposed[0].kind, kind);
});

test('twist seen at count 3 (Control’s): three different cards of the mark’s hand, and no more than the hand holds', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const s = E.newMatch({ seed, twist: { seat: 1, id: 'seen', count: 3 } });
    for (let r = 0; r < 2; r++) {
      const R = s.round;
      const uids = R.exposed.map((e) => e.uid);
      assert.equal(uids.length, 3, `seed ${seed} round ${r}`);
      assert.equal(new Set(uids).size, 3, 'three different cards');
      assert.ok(R.exposed.every((e) => e.by === 1 && R.hands[0].includes(e.uid)), 'all from the mark’s hand');
      assert.equal(E.viewFor(s, 0).round.exposed.length, 3);
      s.phase = 'round-over';
      E.nextRound(s);
    }
  }
  // A two-agent roster deals a two-card hand: the twist sees both and stops there.
  const small = E.newMatch({ seed: 7, roster: ['heavy', 'veteran'], twist: { seat: 1, id: 'seen', count: 3 } });
  assert.equal(small.round.hands[0].length, 2);
  assert.deepEqual(small.round.exposed.map((e) => e.uid).sort(), [...small.round.hands[0]].sort());
});

test('twist seen: a seen card a Getaway sends home is forgotten', () => {
  const SAFE = ['heavy', 'veteran', 'jammer', 'handler', 'mole', 'lookout', 'assassin'];
  const s = Array.from({ length: 40 }, (_, i) => E.newMatch({ seed: i + 1, cities: ['monaco', 'zurich', 'hongkong'], twist: { seat: 1, id: 'seen', count: 1 } })).find(
    (m) => SAFE.includes(m.round.cards[m.round.exposed[0].uid].kind),
  );
  const { uid } = s.round.exposed[0];
  assert.ok(E.lock(s, 0, { uid, city: 0 }));
  s.round.plans[1] = { pass: true };
  E.resolveTurn(s);
  assert.equal(E.viewFor(s, 1).round.exposed.length, 1);
  play(s, ['getaway', 0], null);
  assert.equal(s.round.cards[uid], undefined, 'sent home under a new uid');
  assert.deepEqual([s.round.exposed, E.viewFor(s, 0).round.exposed, E.viewFor(s, 1).round.exposed], [[], [], []]);
});

test('twist placed: the card doesn’t arrive, and a seat without a card of the kind places nothing', () => {
  // In Istanbul the placed card takes no bonus, so the first agent to arrive still does.
  const s = Array.from({ length: 30 }, (_, i) => E.newMatch({ seed: i + 1, cities: ['istanbul', 'monaco', 'zurich'], twist: { seat: 1, id: 'placed', kind: 'sleeper' } })).find((m) => cardOf(m, 1, 'sleeper').city === 0);
  assert.deepEqual([cardOf(s, 1, 'sleeper').bonus, s.round.cities[0].first, s.round.events], [0, 0, []]);
  play(s, ['heavy', 0], null);
  assert.equal(cardOf(s, 0, 'heavy').bonus, 3);
  // No Sleeper in the roster: no placement and no draw for one, so the match deals as without the twist.
  const roster = DECK.filter((k) => k !== 'sleeper');
  const placed = E.newMatch({ seed: 4, roster, twist: { seat: 1, id: 'placed', kind: 'sleeper' } });
  assert.deepEqual({ ...placed, twist: null }, E.newMatch({ seed: 4, roster }));
});
