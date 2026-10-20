// Frozen copy of the Phase 2b-i rules (commit 086c23d). Never edit: Classic play is compared against it.
// Computer spymasters. A bot only ever sees viewFor(state, seat): it fills in what it can't
// see at random (determinize), plays every legal drop out to the end of the round many times
// with a quick heuristic policy (Monte Carlo), and picks the drop that does best. Each playout
// scores the round and the Microfilm, and drops are ranked by round + weight × film, so a bot
// chases the film city (harder when anyone is one strip from the reel). Its bets use the round
// alone: it spends escalation tokens on strong hands, paced so it keeps tokens back for the rounds
// ahead (its bluffs keep the same pace and never spend its last token), answers any call it owes at
// any table size, and folds late and only sometimes, all blurred by the rival's personality
// (STAKES in data.js).
import * as E from './engine.js';
import { AGENT, DECK, STAKES } from './data.js';
import { createRng } from '../../../../../shared/rng.js';

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * A full engine state (state v2: tokens, pot, folds and the Microfilm included) consistent with
 * `view`, with every unseen card filled in at random.
 */
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
  // Cards in `gone` with no kind are a folded rival's face-down agents, withdrawn unseen.
  const known = [...V.cities.flatMap((c) => c.sides.flat()), ...V.gone.flat(), ...V.hand];
  for (const cv of known) if (cv.kind) forget(cv.origin, cv.id0);
  // My own deck: known contents, unknown order.
  for (const kind of V.myDeck) forget(seat, kind);

  // Each rival's unseen cards are shuffled on their own, and its face-down board cards come
  // out of that pool, then its face-down cards withdrawn by a fold (any kind).
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
    for (const cv of V.gone[rival]) {
      if (cv.kind) continue;
      const kind = take(() => true);
      put(cv, kind, kind);
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
  // A folded seat passes for the rest of the round, as the engine's withdraw left it.
  const plans = V.folded.map((out) => (out ? { pass: true } : null));
  if (V.plan) plans[seat] = V.plan;
  return {
    v: E.STATE_VERSION,
    seed: 'sim',
    rng: Math.floor(rng.next() * 2 ** 32),
    target: view.target,
    scores: view.scores.slice(),
    tokens: view.tokens.slice(),
    carry: 0,
    strips: view.strips.slice(),
    reel: view.reel,
    filmRule: view.filmRule,
    roundNo: view.roundNo,
    phase: 'plan',
    history: [],
    winner: null,
    winBy: null,
    round: {
      no: V.no,
      cities: V.cities.map((c) => ({ id: c.id, sides: c.sides.map((side) => side.map((cv) => cv.uid)), first: c.first })),
      film: V.film,
      cards,
      hands,
      decks,
      gone: V.gone.map((g) => g.map((cv) => cv.uid)),
      turn: V.turn,
      initiative: V.initiative,
      plans,
      stake: V.stake,
      pot: V.pot,
      escalated: V.escalated.slice(),
      // A call still waiting for answers is left out: the playout plays the round as if it settled with everyone on.
      pending: null,
      called: V.called ? { by: V.called.by, answers: V.called.answers.slice() } : null,
      folded: V.folded.slice(),
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
    if (d.city === R.film) v += 1; // the Microfilm's city
    v += rng.next() * 3;
    if (v > bestV) {
      bestV = v;
      best = d;
    }
  }
  return best;
}

/**
 * Plays the rest of the round from `state` (mutated) and scores it for `seat`: +1 if `seat` won,
 * 0 for a dead heat, −1 if anyone else won. filmScore reads the same finished state for the film.
 */
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

/** The Microfilm after a playout: +1 if `seat` took the round's strip, −1 if a rival did, 0 if nobody did. */
function filmScore(state, seat) {
  const strip = state.round.result?.strip ?? null;
  return strip === null ? 0 : strip === seat ? 1 : -1;
}

/** What the film is worth against the round when choosing a drop: decisive when any seat is one strip from the reel. */
export const filmWeightFor = (view) => (view.reel > 0 && view.strips.some((x) => x >= view.reel - 1) ? STAKES.filmDecisive : STAKES.filmWeight);

/**
 * Mean round and film scores over `samples` fresh playouts of `drop` (null: the seat's locked
 * plan, or a quick drop, or a pass).
 */
function rescore(view, samples, rng, drop) {
  let round = 0;
  let film = 0;
  for (let k = 0; k < samples; k++) {
    const s = determinize(view, rng);
    const plan = drop || s.round.plans[view.seat] || (E.legalDrops(s, view.seat).length ? quickDrop(s, view.seat, rng) : { pass: true });
    s.round.plans[view.seat] = null;
    round += playout(s, view.seat, plan, rng);
    film += filmScore(s, view.seat);
  }
  return { value: round / samples, film: film / samples };
}

/**
 * Evaluate every legal drop for the seat whose view this is. Returns { drop, value, film, ranked }:
 * value ≈ P(win) − P(lose) for the round and film ≈ P(this seat takes the strip) − P(a rival does),
 * both from a fresh re-score of the chosen drop. Drops are ranked by round + w × film (w from
 * filmWeightFor) plus the rival's noise; stake calls use `value`, the round alone.
 */
export function think(view, { samples = 20, noise = 0, rng = createRng(Date.now()) } = {}) {
  const V = view.round;
  const legal = V.legal;
  if (!legal.length) return { drop: { pass: true }, ...rescore(view, samples, rng, null), ranked: [] };
  const totals = legal.map(() => 0);
  const films = legal.map(() => 0);
  for (let k = 0; k < samples; k++) {
    const base = determinize(view, rng);
    const json = JSON.stringify(base);
    for (let i = 0; i < legal.length; i++) {
      const s = JSON.parse(json);
      s.round.plans[view.seat] = null;
      totals[i] += playout(s, view.seat, legal[i], rng);
      films[i] += filmScore(s, view.seat);
    }
  }
  const w = filmWeightFor(view);
  const ranked = legal
    .map((d, i) => {
      const value = totals[i] / samples;
      const film = films[i] / samples;
      return { ...d, value, film, score: value + w * film + (rng.next() - 0.5) * 2 * noise };
    })
    .sort((a, b) => b.score - a.score);
  const drop = { uid: ranked[0].uid, city: ranked[0].city };
  // The best of many noisy estimates is optimistic, so score the chosen drop again with fresh
  // playouts before using it for fold/escalate calls.
  return { drop, ...rescore(view, samples, rng, drop), ranked };
}

/** Value of the round (alone, no film) as it stands for a seat that has already locked (or must pass). */
export function estimateLocked(view, samples = 20, rng = createRng(Date.now())) {
  return rescore(view, samples, rng, null).value;
}

/**
 * Stake decisions for a rival personality at any table size, given value ≈ P(win) − P(lose) for
 * the round: 'escalate', 'accept' or 'fold' (answering a call this seat owes), 'fold', or null.
 * Strictly, folding is right whenever the round is worth less than −stake; real players (and
 * fun rivals) play on much more often, so the thresholds lean towards seeing the final flip.
 * A seat with no tokens never escalates, a bluff never spends the last token nor one the pace is
 * keeping back, and only a seat that still owes an answer answers.
 */
export function stakeCall(view, value, rival, rng) {
  const V = view.round;
  const seat = view.seat;
  if (!Number.isInteger(seat) || seat < 0 || seat >= view.scores.length || V.folded[seat]) return null;
  const v = value + (rng.next() - 0.5) * 2 * (rival.noise ?? 0);
  const nerve = rival.nerve ?? 0;
  if (V.pending) return V.pending.from.includes(seat) && V.pending.mine === null ? (v > STAKES.answer - nerve ? 'accept' : 'fold') : null;
  // Folding before the final flip saves half, but rivals who always bail rob the player of the
  // reveal, so they only sometimes cut their losses, and only late.
  if (V.turn >= 5 && v < STAKES.lateFold - nerve && rng.next() < STAKES.lateFoldChance) return 'fold';
  const tokens = view.tokens[seat];
  if (view.phase !== 'plan' || V.escalated.some(Boolean) || tokens < 1) return null;
  // Spend a token on a strong hand, a stronger one when tokens are short of one every other round left.
  const roundsLeft = Math.max(1, Math.ceil((view.target - Math.max(...view.scores)) / STAKES.roundPoints));
  const short = Math.max(0, Math.ceil(roundsLeft / 2) - tokens);
  if (V.turn >= 2 && v > STAKES.escalate - nerve + short * STAKES.scarce) return 'escalate';
  // Bluffs keep to the same pace: a rival that bluffed while holding its tokens back for value would
  // make every early escalation a bluff, a tell anyone could learn.
  if (short === 0 && V.turn >= STAKES.bluffTurn && v < 0 && tokens > 1 && rng.next() < (rival.bluff ?? 0) / 3) return 'escalate';
  return null;
}
