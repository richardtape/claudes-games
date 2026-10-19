// Computer spymasters. A bot only ever sees viewFor(state, seat): it fills in what it can't
// see at random (determinize), plays every legal drop out to the end of the round many times
// with a quick heuristic policy (Monte Carlo), and picks the drop that wins most. Its fold and
// escalate calls come from the same estimate, blurred by the rival's personality.
import * as E from './engine.js';
import { AGENT, DECK } from './data.js';
import { createRng } from '../../../shared/rng.js';

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** A full engine state consistent with `view`, with every unseen card filled in at random. */
export function determinize(view, rng) {
  const seat = view.seat;
  const n = E.seatCount(view);
  const rivals = E.rivalsOf(n, seat);
  const V = view.round;
  const cards = {};
  const pool = {};
  for (let s = 0; s < n; s++) pool[s] = DECK.slice();
  const forget = (origin, id0) => {
    const i = pool[origin].indexOf(id0);
    if (i >= 0) pool[origin].splice(i, 1);
  };
  const put = (cv, kind = cv.kind, id0 = cv.id0) => {
    cards[cv.uid] = {
      uid: cv.uid, kind, id0, owner: cv.owner, origin: cv.origin, city: cv.city, turn: cv.turn,
      faceDown: cv.faceDown, hidden: cv.hidden, bonus: cv.bonus,
    };
  };
  const known = [...V.cities.flatMap((c) => c.sides.flat()), ...V.gone.flat(), ...V.hand];
  for (const cv of known) if (cv.kind) forget(cv.origin, cv.id0);
  // My own deck: known contents, unknown order.
  for (const kind of V.myDeck) forget(seat, kind);

  // Each rival's unseen cards are shuffled on their own, and its face-down board cards come
  // out of that pool.
  const unknown = {};
  for (const rival of rivals) {
    const secretOnBoard = V.cities.flatMap((c) => c.sides[rival].filter((cv) => !cv.kind));
    const pile = (unknown[rival] = shuffleInPlace(pool[rival].slice(), rng));
    const take = (ok) => {
      const i = pile.findIndex(ok);
      return pile.splice(i >= 0 ? i : 0, 1)[0];
    };
    // Face-down agents outside Vienna can only be a Sleeper or a Tripwire.
    const order = secretOnBoard.slice().sort((a, b) => Number(V.cities[a.city].id === 'vienna') - Number(V.cities[b.city].id === 'vienna'));
    for (const cv of order) {
      const anything = V.cities[cv.city].id === 'vienna';
      const kind = take((k) => anything || AGENT[k].faceDown);
      put(cv, kind, kind);
      const city = V.cities[cv.city];
      if (city.id === 'istanbul' && cv.turn === city.first) cards[cv.uid].bonus = 3;
    }
  }
  for (const cv of known) if (cv.kind) put(cv);

  const fresh = (prefix, kinds, owner) =>
    kinds.map((kind, i) => {
      const uid = `${prefix}${i}`;
      cards[uid] = { uid, kind, id0: kind, owner, origin: owner, city: null, turn: 0, faceDown: false, hidden: false, bonus: 0 };
      return uid;
    });
  const hands = [];
  const decks = [];
  for (const rival of rivals) {
    hands[rival] = fresh(`?h${rival}.`, unknown[rival].splice(0, V.handCounts[rival]), rival);
    decks[rival] = fresh(`?d${rival}.`, unknown[rival].splice(0, V.deckCounts[rival]), rival);
  }
  decks[seat] = fresh('?m', shuffleInPlace(V.myDeck.slice(), rng), seat);
  hands[seat] = V.hand.map((cv) => cv.uid);
  const plans = Array.from({ length: n }, () => null);
  if (V.plan) plans[seat] = V.plan;
  return {
    v: 1,
    seed: 'sim',
    rng: Math.floor(rng.next() * 2 ** 32),
    target: view.target,
    scores: view.scores.slice(),
    roundNo: view.roundNo,
    phase: 'plan',
    winner: null,
    history: [],
    round: {
      no: V.no,
      cities: V.cities.map((c) => ({ id: c.id, sides: c.sides.map((side) => side.map((cv) => cv.uid)), first: c.first })),
      cards,
      hands,
      decks,
      gone: V.gone.map((g) => g.map((cv) => cv.uid)),
      turn: V.turn,
      initiative: V.initiative,
      plans,
      stake: V.stake,
      escalated: V.escalated.slice(),
      pending: null,
      events: [],
      result: null,
    },
  };
}

/** Quick playout policy: strong cards where they swing a city, with plenty of randomness. */
export function quickDrop(state, seat, rng) {
  const legal = E.legalDrops(state, seat);
  if (!legal.length) return { pass: true };
  const rivals = E.rivalSeats(E.seatCount(state), seat);
  if (rng.next() < 0.25) return legal[Math.floor(rng.next() * legal.length)];
  const R = state.round;
  let best = null;
  let bestV = -Infinity;
  for (const d of legal) {
    const kind = R.cards[d.uid].kind;
    const city = R.cities[d.city];
    const pow = AGENT[kind].power;
    const totals = E.cityTotals(state, d.city);
    const mine = totals[seat];
    let theirs = -Infinity;
    for (const r of rivals) if (totals[r] > theirs) theirs = totals[r];
    let v = city.id === 'lisbon' ? 3 - pow : pow;
    const gap = theirs - mine;
    if (gap > 0 && gap < pow + 2) v += 2; // this drop could swing the city
    if (gap < -7) v -= 3; // already safe here
    if (kind === 'assassin' && rivals.some((r) => city.sides[r].length)) v += 3;
    if (kind === 'veteran' && !city.sides[seat].length) v += 3;
    v += rng.next() * 3;
    if (v > bestV) {
      bestV = v;
      best = d;
    }
  }
  return best;
}

/** Plays the rest of the round from `state` (mutated) and scores it for `seat`: +1 if `seat` won, 0 for a dead heat, −1 if anyone else won. */
function playout(state, seat, firstDrop, rng) {
  const n = E.seatCount(state);
  E.lock(state, seat, firstDrop);
  while (state.phase === 'plan') {
    for (let s = 0; s < n; s++) if (!state.round.plans[s]) E.lock(state, s, quickDrop(state, s, rng));
    if (!E.resolveTurn(state)) break;
  }
  const res = state.round.result;
  if (!res || res.winner === null) return 0;
  return res.winner === seat ? 1 : -1;
}

/**
 * Evaluate every legal drop for the seat whose view this is.
 * Returns { drop, value, ranked } where value ≈ P(win) − P(lose) for the best drop.
 */
export function think(view, { samples = 20, noise = 0, rng = createRng(Date.now()) } = {}) {
  const V = view.round;
  const legal = V.legal;
  if (!legal.length) return { drop: { pass: true }, value: estimateLocked(view, samples, rng), ranked: [] };
  const totals = legal.map(() => 0);
  for (let k = 0; k < samples; k++) {
    const base = determinize(view, rng);
    const json = JSON.stringify(base);
    for (let i = 0; i < legal.length; i++) {
      const s = JSON.parse(json);
      s.round.plans[view.seat] = null;
      totals[i] += playout(s, view.seat, legal[i], rng);
    }
  }
  const ranked = legal
    .map((d, i) => ({ ...d, value: totals[i] / samples, score: totals[i] / samples + (rng.next() - 0.5) * 2 * noise }))
    .sort((a, b) => b.score - a.score);
  const drop = { uid: ranked[0].uid, city: ranked[0].city };
  // The best of many noisy estimates is optimistic, so score the chosen drop again with fresh
  // playouts before using it for fold/escalate calls.
  let fresh = 0;
  for (let k = 0; k < samples; k++) {
    const s = determinize(view, rng);
    s.round.plans[view.seat] = null;
    fresh += playout(s, view.seat, drop, rng);
  }
  return { drop, value: fresh / samples, ranked };
}

/** Value of the round as it stands for a seat that has already locked (or must pass). */
export function estimateLocked(view, samples = 20, rng = createRng(Date.now())) {
  let total = 0;
  for (let k = 0; k < samples; k++) {
    const s = determinize(view, rng);
    const plan = s.round.plans[view.seat] || (E.legalDrops(s, view.seat).length ? quickDrop(s, view.seat, rng) : { pass: true });
    s.round.plans[view.seat] = null;
    total += playout(s, view.seat, plan, rng);
  }
  return total / samples;
}

/**
 * Stake decisions for a rival personality, given value ≈ P(win) − P(lose).
 * Strictly, folding is right whenever the round is worth less than −stake; real players (and
 * fun rivals) play on much more often, so the thresholds lean towards seeing the final flip.
 */
export function stakeCall(view, value, rival, rng) {
  if (view.scores.length > 2) return null; // stakes stay two-player until Phase 2b-i
  const V = view.round;
  const seat = view.seat;
  const v = value + (rng.next() - 0.5) * 2 * (rival.noise ?? 0);
  const nerve = rival.nerve ?? 0;
  if (V.pending && V.pending.by !== seat) return v > -0.6 - nerve ? 'accept' : 'fold';
  // Folding before the final flip saves half, but rivals who always bail rob the player of the
  // reveal, so they only sometimes cut their losses, and only late.
  if (!V.pending && V.turn >= 5 && v < -0.9 - nerve && rng.next() < 0.45) return 'fold';
  if (E_canEscalate(view)) {
    if (V.turn >= 2 && v > 0.45 - nerve) return 'escalate';
    if (V.turn >= 3 && v < 0 && rng.next() < (rival.bluff ?? 0) / 3) return 'escalate';
  }
  return null;
}

const E_canEscalate = (view) => view.phase === 'plan' && !view.round.escalated.some(Boolean) && !view.round.pending;
