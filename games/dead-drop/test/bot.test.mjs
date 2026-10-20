import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { determinize, think, stakeCall, filmWeightFor, couldBe, constraints, candidates, quickDrop, estimateLocked } from '../js/bot.js';
import { DECK, RIVALS, RULES, STAKES, TARGET } from '../js/data.js';
import { drawRoster } from '../js/roster.js';
import { createRng } from '../../../shared/rng.js';
import { play, withPatch, ALL_AGENTS, ALL_CITIES, mixed, setHand } from './helpers.mjs';

/** Random legal play for a few turns, to get varied mid-round positions. */
function midRound(seed, turns) {
  const s = E.newMatch({ seed });
  const rng = createRng(seed);
  for (let t = 0; t < turns && s.phase === 'plan'; t++) {
    for (const seat of [0, 1]) if (!s.round.plans[seat]) E.lock(s, seat, rng.pick(E.legalDrops(s, seat)));
    E.resolveTurn(s);
  }
  return s;
}

test('determinize keeps everything the seat can see and invents only what it cannot', () => {
  const rng = createRng(5);
  for (let seed = 1; seed <= 120; seed++) {
    const s = midRound(seed, seed % 6);
    if (s.phase !== 'plan') continue;
    for (const seat of [0, 1]) {
      const view = E.viewFor(s, seat);
      const d = determinize(view, rng);
      const R = d.round;
      const all = [...R.hands.flat(), ...R.decks.flat(), ...R.gone.flat(), ...R.cities.flatMap((c) => c.sides.flat())];
      assert.equal(all.length, 2 * DECK.length, `seed ${seed}: 24 cards`);
      assert.deepEqual(R.hands[seat], s.round.hands[seat]);
      assert.deepEqual(R.hands[1 - seat].length, s.round.hands[1 - seat].length);
      R.cities.forEach((c, ci) => assert.deepEqual(c.sides, s.round.cities[ci].sides));
      // Each origin still holds exactly one of every agent.
      for (const origin of [0, 1]) {
        const kinds = Object.values(R.cards).filter((c) => c.origin === origin).map((c) => c.id0).sort();
        assert.deepEqual(kinds, DECK.slice().sort(), `seed ${seed}: origin ${origin} deck`);
      }
      // Face-down rival agents outside Vienna are always a Sleeper or a Tripwire.
      for (const c of R.cities) if (c.id !== 'vienna') for (const u of c.sides[1 - seat]) if (R.cards[u].faceDown) assert.ok(['sleeper', 'tripwire'].includes(R.cards[u].kind));
    }
  }
});

test('think returns a legal drop and a value between −1 and 1', () => {
  const s = midRound(11, 2);
  const view = E.viewFor(s, 1);
  const { drop, value } = think(view, { samples: 8, rng: createRng(1) });
  assert.ok(view.round.legal.some((d) => d.uid === drop.uid && d.city === drop.city));
  assert.ok(value >= -1 && value <= 1);
  assert.ok(E.lock(s, 1, drop));
});

test('stake calls: confident bots escalate, hopeless ones fold, escalations get answered', () => {
  const s = midRound(4, 3);
  s.scores = [0, TARGET - 1]; // late in the match, so the rivals' pace leaves tokens to spare
  const view = E.viewFor(s, 0);
  const steady = { ...RIVALS[2], noise: 0 };
  const rng = createRng(2);
  assert.equal(stakeCall(view, 0.9, steady, rng), 'escalate');
  const late = { ...view, round: { ...view.round, turn: 5 } };
  const folds = Array.from({ length: 40 }, () => stakeCall(late, -0.95, steady, rng)).filter((c) => c === 'fold').length;
  assert.ok(folds > 5 && folds < 35, `hopeless late rounds fold sometimes (${folds}/40)`);
  E.escalate(s, 1);
  const facing = E.viewFor(s, 0);
  assert.equal(stakeCall(facing, 0.2, steady, rng), 'accept');
  assert.equal(stakeCall(facing, -0.9, steady, rng), 'fold');
});

/** Random legal play for a few turns at n seats. */
function midRoundN(n, seed, turns) {
  const s = E.newMatch({ seed, seats: n });
  const rng = createRng(seed);
  for (let t = 0; t < turns && s.phase === 'plan'; t++) {
    for (let seat = 0; seat < n; seat++) if (!s.round.plans[seat]) E.lock(s, seat, rng.pick(E.legalDrops(s, seat)));
    E.resolveTurn(s);
  }
  return s;
}

test('determinize at 3 and 4 seats keeps what the seat sees and invents only the rest', () => {
  const rng = createRng(6);
  for (const n of [3, 4])
    for (let seed = 1; seed <= 40; seed++) {
      const s = midRoundN(n, seed, seed % 6);
      if (s.phase !== 'plan') continue;
      for (let seat = 0; seat < n; seat++) {
        const R = determinize(E.viewFor(s, seat), rng).round;
        const all = [...R.hands.flat(), ...R.decks.flat(), ...R.gone.flat(), ...R.cities.flatMap((c) => c.sides.flat())];
        assert.equal(all.length, n * DECK.length, `${n} seats, seed ${seed}`);
        assert.deepEqual(R.hands[seat], s.round.hands[seat]);
        assert.deepEqual(R.hands.map((h) => h.length), s.round.hands.map((h) => h.length));
        R.cities.forEach((c, ci) => assert.deepEqual(c.sides, s.round.cities[ci].sides));
        assert.equal(R.plans.length, n);
        for (let origin = 0; origin < n; origin++) {
          const kinds = Object.values(R.cards).filter((c) => c.origin === origin).map((c) => c.id0).sort();
          assert.deepEqual(kinds, DECK.slice().sort(), `origin ${origin}`);
        }
      }
    }
});

test('think at 3 and 4 seats returns a legal drop and a value between −1 and 1', () => {
  for (const n of [3, 4]) {
    const s = midRoundN(n, 12, 2);
    const view = E.viewFor(s, n - 1);
    const { drop, value } = think(view, { samples: 4, rng: createRng(1) });
    assert.ok(view.round.legal.some((d) => d.uid === drop.uid && d.city === drop.city));
    assert.ok(value >= -1 && value <= 1);
  }
});

const steady = { ...RIVALS[2], noise: 0, nerve: 0, bluff: 0 };
const liar = { ...steady, bluff: 3 }; // bluff / 3 = 1: always bluffs, when allowed
const stakeView = ({ tokens, turn = 2, seats = 2, scores } = {}) => {
  const s = E.newMatch({ seed: 9, seats });
  if (tokens) s.tokens = tokens;
  if (scores) s.scores = scores;
  s.round.turn = turn;
  return E.viewFor(s, 0);
};
const call = (view, value, rival = steady) => stakeCall(view, value, rival, createRng(1));
// Tokens a rival wants in hand when the leader has `lead` points: one for every two rounds left,
// counting STAKES.roundPoints a round (bot.js), and the first lead at which it wants `n`.
const wanted = (lead) => Math.ceil(Math.max(1, Math.ceil((TARGET - lead) / STAKES.roundPoints)) / 2);
const leadWanting = (n) => [...Array(TARGET).keys()].find((lead) => wanted(lead) === n);

test('stake calls: tokens to spare escalate on a good hand; a short supply needs a better one; none means never', () => {
  const spare = { scores: [leadWanting(1), 0] }; // late in the match one token covers the rounds left
  assert.equal(call(stakeView(spare), STAKES.escalate + 0.05), 'escalate');
  assert.equal(call(stakeView(spare), STAKES.escalate - 0.05), null);
  assert.equal(call(stakeView({ ...spare, turn: 1 }), 0.99), null, 'never on turn 1');
  // where 2 tokens are wanted, a rival holding 1 is one short
  const short = { tokens: [1, 3], scores: [leadWanting(2), 0] };
  assert.equal(call(stakeView(short), STAKES.escalate + 0.05), null);
  // Only the arithmetic: escalate + scarce is above any value a round can have (−1 to 1, plus a
  // rival's noise), so in real play a short rival can't value-escalate (nor bluff, below).
  assert.equal(call(stakeView(short), STAKES.escalate + STAKES.scarce + 0.05), 'escalate');
  assert.equal(call(stakeView({ tokens: [0, 3], turn: 4 }), 0.99), null);
});

test('stake calls: the tuned pace (SIMLOG B16) keeps every token until the leader has 4 points', () => {
  assert.equal(RULES.tokens, 3);
  for (const lead of [0, 3]) assert.equal(call(stakeView({ scores: [0, lead] }), 0.99), null, `leader on ${lead}`);
  assert.equal(call(stakeView({ scores: [0, 4] }), STAKES.escalate + 0.05), 'escalate');
  assert.equal(call(stakeView({ tokens: [2, 3], scores: [0, 5] }), 0.99), null, 'the second token waits for 6');
  assert.equal(call(stakeView({ tokens: [2, 3], scores: [0, 6] }), STAKES.escalate + 0.05), 'escalate');
  // Bluffs keep the same pace, so a rival's early escalation is never a sure bluff: it makes none.
  const bluffTurn = { turn: STAKES.bluffTurn };
  for (const lead of [0, 3]) assert.equal(call(stakeView({ ...bluffTurn, scores: [0, lead] }), -0.2, liar), null, `no bluff with the leader on ${lead}`);
  assert.equal(call(stakeView({ ...bluffTurn, scores: [0, 4] }), -0.2, liar), 'escalate', 'a bluff once the pace allows');
  assert.equal(call(stakeView({ ...bluffTurn, tokens: [2, 3], scores: [0, 5] }), -0.2, liar), null, 'nor with the second token before 6');
});

test('stake calls: a bluff never spends the last token, nor one the pace keeps back', () => {
  const spare = { turn: STAKES.bluffTurn, scores: [leadWanting(1), 0] }; // one token covers the rounds left
  assert.equal(call(stakeView(spare), -0.2, liar), 'escalate');
  assert.equal(call(stakeView({ ...spare, tokens: [1, 3] }), -0.2, liar), null, 'the last token');
  assert.equal(call(stakeView({ ...spare, turn: STAKES.bluffTurn - 1 }), -0.2, liar), null, 'not before bluffTurn');
  // where 3 tokens are wanted, a rival holding 2 is one short: no bluff
  const lead = leadWanting(3);
  if (lead !== undefined) assert.equal(call(stakeView({ ...spare, tokens: [2, 3], scores: [lead, 0] }), -0.2, liar), null, 'short');
});

test('stake calls: answering by value, and only seats that owe an answer answer', () => {
  const s = E.newMatch({ seed: 9, seats: 3 });
  E.escalate(s, 0);
  assert.equal(call(E.viewFor(s, 1), STAKES.answer + 0.05), 'accept');
  assert.equal(call(E.viewFor(s, 1), STAKES.answer - 0.05), 'fold');
  assert.equal(call(E.viewFor(s, 0), 0.9), null, 'the escalator waits');
  E.respond(s, 1, true);
  assert.equal(call(E.viewFor(s, 1), -0.99), null, 'already answered');
  assert.equal(call(E.viewFor(s, -1), 0.9), null, 'a spectator');
});

test('think returns the round value and the film value', () => {
  const r = think(E.viewFor(E.newMatch({ seed: 2 }), 0), { samples: 4, rng: createRng(3) });
  assert.ok(r.value >= -1 && r.value <= 1 && r.film >= -1 && r.film <= 1);
});

test('think weighs the Microfilm: with a heavy film weight the bot drops into the film city', () => {
  // On the last turn a drop can still decide who holds the film city; on turn 1 one drop of six barely moves it, so no
  // weight shows there. Under the holder rule, holding the film city is the whole film term; this tests the weighting, not the rule.
  const into = (filmWeight) => withPatch(RULES, { film: 'holder' }, () => withPatch(STAKES, { filmWeight }, () => {
    let n = 0;
    let tried = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = midRound(seed, 5);
      if (s.phase !== 'plan') continue;
      const legal = E.viewFor(s, 0).round.legal;
      if (!legal.some((d) => d.city === s.round.film) || !legal.some((d) => d.city !== s.round.film)) continue;
      tried++;
      if (think(E.viewFor(s, 0), { samples: 8, rng: createRng(seed) }).drop.city === s.round.film) n++;
    }
    return { n, tried };
  }));
  const heavy = into(5);
  const none = into(0);
  // The gap is the real check; the floor sits well under the 21–24 of 31 nearby RNG draws give.
  assert.ok(heavy.tried >= 20 && heavy.n / heavy.tried >= 0.6 && heavy.n - none.n >= heavy.tried / 4, `${heavy.n} of ${heavy.tried} (${none.n} with no film weight)`);
});

test('determinize fills in a folded rival’s face-down cards and carries the stakes and the film', () => {
  const s = E.newMatch({ seed: 4, seats: 3, cities: ['vienna', 'monaco', 'tangier'], film: 1 });
  play(s, ['mole', 1], ['heavy', 1], ['heavy', 0]);
  E.fold(s, 2);
  const d = determinize(E.viewFor(s, 0), createRng(1));
  for (const u of d.round.gone.flat()) assert.ok(d.round.cards[u], `gone card ${u}`);
  for (let o = 0; o < 3; o++) assert.deepEqual(Object.values(d.round.cards).filter((c) => c.origin === o).map((c) => c.id0).sort(), DECK.slice().sort());
  assert.deepEqual([d.v, d.tokens, d.strips, d.reel, d.filmRule, d.round.pot, d.round.folded, d.round.film], [2, s.tokens, s.strips, s.reel, s.filmRule, 1, [false, false, true], 1]);
});

test('the film weighs decisive when any seat is one strip from the reel, and never with the Microfilm off', () => {
  const weight = (strips, reel) => {
    const s = E.newMatch({ seed: 1 });
    Object.assign(s, { strips, reel });
    return filmWeightFor(E.viewFor(s, 0));
  };
  assert.notEqual(STAKES.filmWeight, STAKES.filmDecisive);
  assert.equal(weight([0, 0], 3), STAKES.filmWeight);
  assert.equal(weight([1, 1], 3), STAKES.filmWeight);
  assert.equal(weight([0, 2], 3), STAKES.filmDecisive, 'a rival one strip away');
  assert.equal(weight([2, 0], 3), STAKES.filmDecisive, 'this seat one strip away');
  assert.equal(weight([0, 0], 0), STAKES.filmWeight, 'reel 0: no Microfilm');
});

test('determinize on Mixed rosters fills face-down cards only with what they can be', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = E.newMatch({ seed, roster: drawRoster(ALL_AGENTS, createRng(seed)), pool: ALL_CITIES });
    const rng = createRng(seed);
    for (let t = 0; t < 4 && s.phase === 'plan'; t++) {
      for (let seat = 0; seat < 2; seat++) {
        const legal = E.legalDrops(s, seat);
        E.lock(s, seat, legal.length ? rng.pick(legal) : { pass: true });
      }
      E.resolveTurn(s);
    }
    if (s.phase !== 'plan') continue;
    const view = E.viewFor(s, 0);
    const d = determinize(view, createRng(seed + 99));
    for (const city of view.round.cities)
      for (const cv of city.sides[1])
        if (!cv.kind) assert.ok(couldBe(cv, city.id, view)(d.round.cards[cv.uid].kind), `seed ${seed}: ${d.round.cards[cv.uid].kind} in ${city.id}${cv.partner ? ' as a partner' : ''}`);
    for (let o = 0; o < 2; o++) assert.deepEqual(Object.values(d.round.cards).filter((c) => c.origin === o).map((c) => c.id0).sort(), E.deckList(view, o).slice().sort());
  }
});

test('couldBe: natural face-down kinds, anything in Vienna, Casablanca or as a partner, the twist’s kind when placed', () => {
  const view = { roster: ALL_AGENTS, twist: { seat: 1, id: 'placed', kind: 'sleeper' } };
  const kinds = (cv, city) => ALL_AGENTS.filter(couldBe(cv, city, view));
  assert.deepEqual(kinds({}, 'monaco'), ['sleeper', 'tripwire', 'decoy']);
  assert.equal(kinds({}, 'casablanca').length, 20);
  assert.equal(kinds({ partner: true }, 'monaco').length, 20);
  assert.deepEqual(kinds({ placed: true }, 'monaco'), ['sleeper']);
});

test('Control’s seen card is known to its determinize; a tapped city binds the mark’s playout drop', () => {
  const s = E.newMatch({ seed: 6, twist: { seat: 1, id: 'seen', count: 1 } });
  const { uid } = s.round.exposed[0];
  const d = determinize(E.viewFor(s, 1), createRng(1));
  assert.deepEqual([d.round.hands[0].includes(uid), d.round.cards[uid].kind], [true, s.round.cards[uid].kind]);
  const t = E.newMatch({ seed: 5, twist: { seat: 1, id: 'tap', from: 1 } });
  E.lock(t, 0, E.legalDrops(t, 0).find((x) => x.city === 2));
  assert.deepEqual(constraints(E.viewFor(t, 1)), { 0: 2 });
  for (let i = 0; i < 20; i++) assert.equal(quickDrop(t, 0, createRng(i), 2).city, 2);
});

// The brief's two partners per city became one: the think-time bar's fallback 1 (task 9 report).
test('candidates trim partner drops to the strongest partner per city', () => {
  const s = mixed(['monaco', 'zurich', 'hongkong']);
  const [, heavy] = setHand(s, 0, ['accomplice', 'heavy', 'sleeper', 'veteran', 'lookout', 'tripwire']);
  const view = E.viewFor(s, 0);
  const c = candidates(view);
  for (let ci = 0; ci < 3; ci++) assert.deepEqual(c.filter((d) => d.partner && d.city === ci).map((d) => d.partner), [heavy]);
  assert.equal(c.filter((d) => !d.partner).length, view.round.legal.filter((d) => !d.partner).length);
});

test('candidates keep Casablanca’s face-down drops for natural face-down agents and strong ones only', () => {
  const s = mixed(['casablanca', 'monaco', 'berlin']);
  const uids = setHand(s, 0, ['lookout', 'heavy', 'decoy', 'handler']);
  const view = E.viewFor(s, 0);
  const c = candidates(view);
  assert.deepEqual(c.filter((d) => d.down === true).map((d) => d.uid), [uids[1], uids[2]]);
  assert.equal(c.filter((d) => d.down === false).length, 4);
  assert.equal(c.length, view.round.legal.length - 2);
  // No partner and no face-down drop: the legal list itself.
  const t = mixed(['monaco', 'zurich', 'hongkong']);
  setHand(t, 0, ['heavy', 'sleeper', 'lookout', 'tripwire']);
  const plain = E.viewFor(t, 0);
  assert.equal(candidates(plain), plain.round.legal);
});

test('quickDrop drops an Accomplice alone or with its strongest partner, and face down in Casablanca only what drops face down by nature', () => {
  const s = mixed(['casablanca', 'monaco', 'berlin']);
  const [accomplice, heavy] = setHand(s, 0, ['accomplice', 'heavy', 'sleeper', 'lookout']);
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const d = quickDrop(s, 0, createRng(i));
    if (d.partner) assert.deepEqual([d.uid, d.partner], [accomplice, heavy]);
    if (d.down) assert.equal(s.round.cards[d.uid].kind, 'sleeper');
    seen.add(`${d.partner ? 'partner' : ''}${d.down ? 'down' : ''}`);
  }
  assert.deepEqual([...seen].sort(), ['', 'down', 'partner']);
});

test('think’s drop keeps the top candidate’s partner and face, and locks as given; Classic drops stay { uid, city }', () => {
  const s = mixed(['casablanca', 'monaco', 'berlin']);
  setHand(s, 0, ['accomplice', 'heavy', 'sleeper', 'decoy']);
  const view = E.viewFor(s, 0);
  const keys = new Set();
  for (let i = 0; i < 6; i++) {
    const { drop, ranked } = think(view, { samples: 2, rng: createRng(i) });
    const top = ranked[0];
    assert.deepEqual(drop, Object.fromEntries(['uid', 'city', 'partner', 'down'].filter((k) => k in top).map((k) => [k, top[k]])));
    assert.ok(E.lock(structuredClone(s), 0, drop));
    for (const k of Object.keys(drop)) keys.add(k);
  }
  assert.ok(keys.has('down'), [...keys].join());
  const classic = think(E.viewFor(E.newMatch({ seed: 3 }), 0), { samples: 2, rng: createRng(1) }).drop;
  assert.deepEqual(Object.keys(classic), ['uid', 'city']);
});

test('think and estimateLocked play a wiretapped mark’s locked city into their playouts', () => {
  const t = E.newMatch({ seed: 5, twist: { seat: 1, id: 'tap', from: 1 } });
  E.lock(t, 0, E.legalDrops(t, 0).find((x) => x.city === 2));
  const view = E.viewFor(t, 1);
  assert.deepEqual(constraints(view), { 0: 2 });
  // The same position before the mark's lock reaches the wiretapper: no constraint, so any difference
  // below comes from the bind alone (same seeds, same everything else).
  const unheard = structuredClone(view);
  unheard.round.tapped[0].city = null;
  const values = (v) => think(v, { samples: 4, rng: createRng(7) }).ranked.map((r) => `${r.uid}@${r.city}:${r.value}:${r.film}`);
  assert.deepEqual(values(view), values(view), 'deterministic for a seed');
  assert.notDeepEqual(values(view), values(unheard), 'think’s playouts');
  const locked = (v) => [1, 2, 3, 4, 5].map((seed) => estimateLocked(v, 8, createRng(seed)));
  assert.notDeepEqual(locked(view), locked(unheard), 'rescore’s playouts');
});
