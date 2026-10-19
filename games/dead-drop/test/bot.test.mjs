import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { determinize, think, stakeCall } from '../js/bot.js';
import { DECK, RIVALS } from '../js/data.js';
import { createRng } from '../../../shared/rng.js';

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

test('stake calls stay two-player until Phase 2b-i', () => {
  const s = midRoundN(3, 4, 4);
  const steady = { ...RIVALS[2], noise: 0 };
  assert.equal(stakeCall(E.viewFor(s, 0), 0.95, steady, createRng(2)), null);
  assert.equal(stakeCall({ ...E.viewFor(s, 0), round: { ...E.viewFor(s, 0).round, turn: 5 } }, -0.99, steady, createRng(2)), null);
});
