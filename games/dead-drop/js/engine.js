// Dead Drop rules. Pure state + functions, no DOM. The whole match is plain JSON (including
// the RNG position) so it can be saved, sent to the host, cloned for bot playouts and resumed.
//
// Flow: newMatch() → each turn every seat lock()s a drop → resolveTurn() returns events for
// the UI to animate → after turn 6 the round is scored → nextRound(). escalate()/respond()/
// fold() run alongside at any table size (see "stakes"). viewFor(state, seat) is what a player
// is allowed to see.
//
// A table has 2 to 4 seats, numbered 0..n−1. "Rival agents" are every other seat's; a seat's
// "rival's drop" (Double Agent, Impostor) is its mark's drop. With two seats every rule is
// exactly the two-player game.
//
// Uids carry no order: every uid is `<seat letter><round>.<4 random base-36 characters>` (mintUid,
// drawn from the state RNG), and a card that goes back to a hand is re-keyed (returnToHand), so a
// rival can't recognise it later face down. Any new path that sends a card to a hand must use
// returnToHand (Phase 2b-ii).
import { createRng, hashString } from '../../../shared/rng.js';
import { AGENT, CAPACITY, CITIES, CITY, DECK, MAX_HAND, MAX_SEATS, MIN_SEATS, RULES, START_HAND, TARGET, TURNS } from './data.js';

// ── randomness kept inside state.rng ─────────────────────────────────────────
const rng = createRng(0);
function rnd(state) {
  rng.state = state.rng;
  const v = rng.next();
  state.rng = rng.state;
  return v;
}
const rint = (state, n) => Math.floor(rnd(state) * n);
function rshuffle(state, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rint(state, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── seats ───────────────────────────────────────────────────────────────────
/** Seats at the table. Works on a state and on a view. */
export const seatCount = (stateOrView) => stateOrView.scores.length;

const seatsOf = (n) => Array.from({ length: n }, (_, s) => s);
const inRange = (n, seat) => Number.isInteger(seat) && seat >= 0 && seat < n;
/** Is `seat` a player at this table (not a spectator, a string or a seat that isn't there)? */
const isSeat = (state, seat) => inRange(seatCount(state), seat);

/** Seats in table order starting from `first`. */
export const turnOrder = (n, first) => seatsOf(n).map((i) => (first + i) % n);

/** The other seats in table order after `seat`; a seat outside the table has every seat as a rival. */
export const rivalsOf = (n, seat) => (inRange(n, seat) ? turnOrder(n, seat).slice(1) : seatsOf(n));

// The seat lists above for each table size, precomputed, frozen and shared, because bot
// playouts resolve millions of turns. Iterate them; never store one in the state.
const TABLES = [];
for (let n = MIN_SEATS; n <= MAX_SEATS; n++) {
  const seats = Object.freeze(seatsOf(n));
  TABLES[n] = { seats, orders: seats.map((s) => Object.freeze(turnOrder(n, s))), rivals: seats.map((s) => Object.freeze(rivalsOf(n, s))) };
}
const allSeats = (n) => TABLES[n]?.seats ?? seatsOf(n);
const orderFrom = (n, first) => TABLES[n]?.orders[first] ?? turnOrder(n, first);
/**
 * The frozen, shared `rivalsOf(n, seat)`: read-only, never store it in a state. `rivalsOf`
 * returns a fresh copy. A seat outside the table gets every seat, as `rivalsOf` gives a spectator.
 */
export const rivalSeats = (n, seat) => (inRange(n, seat) ? TABLES[n].rivals[seat] : allSeats(n));

/** Seats still in the round (not folded), in table order, as a fresh array. Works on a state and on a view. */
export const activeSeats = (stateOrView) => allSeats(seatCount(stateOrView)).filter((s) => !stateOrView.round.folded[s]);

/** Who moves first on turn `turn` of round `roundNo`: round the table each turn, moved on each round. */
export const initiativeOf = (n, roundNo, turn) => (roundNo + turn - 1) % n;

/** The seat whose drop is `seat`'s "rival's drop" this round. Never itself; two seats mark each other. */
export const markOf = (n, seat, roundNo) => (seat + 1 + (roundNo % (n - 1))) % n;

// ── setup ───────────────────────────────────────────────────────────────────
/** The shape of the saved state. 2: escalation tokens, secret answers, the pot and rollover, strips, reel, filmRule and winBy. */
export const STATE_VERSION = 2;

/** A fresh card uid for `seat`, unique within this round's cards. Deal time and a return to hand only. */
function mintUid(state, seat) {
  const cards = state.round.cards;
  for (;;) {
    const uid = `${'abcd'[seat]}${state.round.no}.${rint(state, 36 ** 4).toString(36).padStart(4, '0')}`;
    if (!(uid in cards)) return uid;
  }
}

export function newMatch({ seed = Date.now(), target = TARGET, cities = null, seats = 2, film = null } = {}) {
  if (!Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS) throw new RangeError(`seats must be ${MIN_SEATS} to ${MAX_SEATS}, got ${seats}`);
  if (film !== null && !(Number.isInteger(film) && film >= 0 && film <= 2)) throw new RangeError(`film must be null or 0 to 2, got ${film}`);
  const state = {
    v: STATE_VERSION,
    seed: String(seed),
    rng: typeof seed === 'number' ? seed >>> 0 : hashString(String(seed)),
    target,
    scores: Array(seats).fill(0),
    tokens: Array(seats).fill(RULES.tokens),
    carry: 0,
    strips: Array(seats).fill(0),
    reel: RULES.reel,
    filmRule: RULES.film,
    roundNo: 0,
    phase: 'plan',
    round: null,
    history: [],
    winner: null,
    winBy: null,
  };
  startRound(state, { cities, film });
  return state;
}

export function startRound(state, { cities = null, film = null } = {}) {
  const no = state.roundNo;
  const n = seatCount(state);
  const cityIds = cities || rshuffle(state, CITIES.map((c) => c.id)).slice(0, 3);
  const cards = {};
  state.round = { no, cards }; // mintUid reads these two while dealing
  const decks = allSeats(n).map((seat) =>
    rshuffle(state, DECK).map((kind) => {
      const uid = mintUid(state, seat);
      cards[uid] = { uid, kind, id0: kind, owner: seat, origin: seat, city: null, turn: 0, faceDown: false, hidden: false, bonus: 0 };
      return uid;
    }),
  );
  const hands = decks.map((d) => d.splice(0, START_HAND));
  // The film city is drawn after the decks, so this round's dealing is the same with or without the Microfilm (the extra draw moves later rounds).
  const filmCity = state.reel > 0 ? (film ?? rint(state, 3)) : null;
  state.round = {
    no,
    cities: cityIds.map((id) => ({ id, sides: allSeats(n).map(() => []), first: 0 })),
    film: filmCity,
    cards,
    hands,
    decks,
    gone: allSeats(n).map(() => []),
    turn: 1,
    initiative: 0,
    plans: Array(n).fill(null),
    stake: 1,
    pot: state.carry,
    escalated: Array(n).fill(false),
    pending: null,
    called: null,
    folded: Array(n).fill(false),
    events: [],
    result: null,
  };
  state.carry = 0;
  state.phase = 'plan';
  beginTurn(state);
  return state;
}

function beginTurn(state) {
  const R = state.round;
  const n = seatCount(state);
  R.initiative = initiativeOf(n, R.no, R.turn);
  R.plans = Array(n).fill(null);
  for (const seat of allSeats(n)) if (!legalDrops(state, seat).length) R.plans[seat] = { pass: true };
}

export function nextRound(state) {
  if (state.phase !== 'round-over') return false;
  state.roundNo++;
  startRound(state);
  return true;
}

// ── rules helpers ───────────────────────────────────────────────────────────
export const capacityOf = (cityId) => (cityId === 'berlin' ? 2 : CAPACITY);

export function cityOpen(state, ci, turn = state.round.turn) {
  const id = state.round.cities[ci].id;
  if (id === 'helsinki' && turn > 3) return false;
  if (id === 'venice' && turn % 2 === 0) return false;
  return true;
}

const canArrive = (state, seat, ci) => cityOpen(state, ci) && state.round.cities[ci].sides[seat].length < capacityOf(state.round.cities[ci].id);

export function legalDrops(state, seat) {
  const R = state.round;
  if (!R || state.phase !== 'plan' || !isSeat(state, seat) || R.folded[seat]) return [];
  const out = [];
  for (const uid of R.hands[seat]) for (let ci = 0; ci < 3; ci++) if (canArrive(state, seat, ci)) out.push({ uid, city: ci });
  return out;
}

const cityOf = (state, card) => state.round.cities[card.city];

/** Does a rival Jammer (whose own trick works) sit in this card's city, on any other seat's side? */
function jammed(state, card) {
  if (card.kind === 'jammer') return false;
  const sides = cityOf(state, card).sides;
  const cards = state.round.cards;
  for (let r = 0; r < sides.length; r++) {
    if (r === card.owner) continue;
    for (const u of sides[r]) {
      const c = cards[u];
      if (c.kind === 'jammer' && !c.hidden) return true;
    }
  }
  return false;
}

/** Tricks work unless the card dropped face down (Vienna, Sleeper, Tripwire's power) or is jammed. */
export function hasTricks(state, card) {
  if (card.city === null) return false;
  if (card.hidden && card.kind !== 'tripwire') return false;
  if (cityOf(state, card).id === 'vienna') return false;
  return !jammed(state, card);
}

export function powerOf(state, uid) {
  const R = state.round;
  const card = R.cards[uid];
  let p = AGENT[card.kind].power + card.bonus;
  if (card.city === null) return p;
  const city = cityOf(state, card);
  const mine = city.sides[card.owner];
  if (card.kind === 'veteran' && hasTricks(state, card) && mine.length === 1) p += 3;
  for (const u of mine) if (u !== uid && R.cards[u].kind === 'handler' && hasTricks(state, R.cards[u])) p += 1;
  // Every rival Mole here counts: two of them give −2. (Plain loops: this is the bots' hot path.)
  for (let r = 0; r < city.sides.length; r++) {
    if (r === card.owner) continue;
    for (const u of city.sides[r]) if (R.cards[u].kind === 'mole' && hasTricks(state, R.cards[u])) p -= 1;
  }
  return Math.max(0, p);
}

export function cityTotals(state, ci) {
  const sides = state.round.cities[ci].sides;
  return sides.map((side) => side.reduce((s, u) => s + powerOf(state, u), 0));
}

/**
 * Who holds a city, given each seat's total there (`totals[s]`) and number of agents there
 * (`counts[s]`). Seats with nobody there take no part. Lisbon goes to the single lowest total;
 * anywhere else to the single highest, if it is above 0. A tie holds nothing.
 */
export function leaderOf(cityId, totals, counts) {
  const low = cityId === 'lisbon';
  let best = null;
  let tied = false;
  for (let s = 0; s < totals.length; s++) {
    if (!counts[s]) continue;
    if (best === null || (low ? totals[s] < totals[best] : totals[s] > totals[best])) {
      best = s;
      tied = false;
    } else if (totals[s] === totals[best]) tied = true;
  }
  if (best === null || tied) return null;
  return low || totals[best] > 0 ? best : null;
}

/** Seat that holds the city right now, or null. */
export function cityLeader(state, ci) {
  const city = state.round.cities[ci];
  return leaderOf(city.id, cityTotals(state, ci), city.sides.map((s) => s.length));
}

// ── planning ────────────────────────────────────────────────────────────────
export function lock(state, seat, plan) {
  const R = state.round;
  if (state.phase !== 'plan' || !plan || !isSeat(state, seat)) return false;
  if (plan.pass) {
    if (legalDrops(state, seat).length) return false;
    R.plans[seat] = { pass: true };
    return true;
  }
  if (!legalDrops(state, seat).some((d) => d.uid === plan.uid && d.city === plan.city)) return false;
  R.plans[seat] = { uid: plan.uid, city: plan.city };
  return true;
}

export function unlock(state, seat) {
  const R = state.round;
  if (state.phase !== 'plan' || !isSeat(state, seat) || !R.plans[seat] || R.plans[seat].pass) return false;
  R.plans[seat] = null;
  return true;
}

export const ready = (state) => state.phase === 'plan' && !state.round.pending && state.round.plans.every(Boolean);

// ── stakes ──────────────────────────────────────────────────────────────────
// The same rules at every table size; with two seats a fold always ends the round.
// - Every player starts the match with RULES.tokens escalation tokens (public), and escalating
//   spends one. At most one escalation a round, by whoever calls it first.
// - An escalation asks every other seat still in (pending.from, in table order after the
//   escalator). Each answers once, in secret: play on or fold. When the last answer is in, the
//   call settles: every seat that answered fold folds, then the stake doubles if anyone played
//   on. The answers then go public as R.called. The escalator may fold while waiting, which
//   calls the escalation off (no doubling, the token stays spent).
// - A fold pays the current stake into the round's pot and withdraws the folder's agents into
//   gone, face-down ones still secret. A seat that has folded drops, draws and passes no more
//   this round. When only one seat is left in, it takes the pot at once.
// - At the final flip the round's winner scores stake × 2 plus the pot. A dead heat scores
//   nothing and rolls the stake (not doubled) and the pot into the next round's pot.

/** A seat still in the round, with a token left, may escalate if nobody has this round. */
export function canEscalate(state, seat) {
  const R = state.round;
  return isSeat(state, seat) && state.phase === 'plan' && !R.folded[seat] && state.tokens[seat] > 0 && !R.escalated.some(Boolean) && !R.pending;
}

export function escalate(state, seat) {
  if (!canEscalate(state, seat)) return false;
  const R = state.round;
  const n = seatCount(state);
  state.tokens[seat]--;
  R.escalated[seat] = true;
  // A fresh array: never store the frozen seat list in the state.
  R.pending = { by: seat, from: rivalSeats(n, seat).filter((s) => !R.folded[s]), calls: Array(n).fill(null) };
  return true;
}

/** A seat the escalation asked answers it, once: accept plays on, decline folds. The last answer settles the call. */
export function respond(state, seat, accept) {
  const R = state.round;
  const P = R.pending;
  if (state.phase !== 'plan' || !P || !P.from.includes(seat) || P.calls[seat] !== null) return false;
  P.calls[seat] = accept ? 'on' : 'fold';
  if (P.from.every((s) => P.calls[s] !== null)) settleCall(state);
  return true;
}

/** Every answer is in: the folds land (each paying the stake before it doubles), then the stake doubles if anyone played on. */
function settleCall(state) {
  const R = state.round;
  const P = R.pending;
  R.pending = null;
  R.called = { by: P.by, answers: P.calls };
  let folder = null;
  for (const seat of P.from)
    if (P.calls[seat] === 'fold') {
      withdraw(state, seat);
      folder = seat;
    }
  if (P.from.some((s) => P.calls[s] === 'on')) R.stake *= 2;
  if (folder !== null && activeSeats(state).length === 1) endByFold(state, folder);
}

/**
 * A seat still in folds. A seat that owes an answer folds by answering fold (it lands when the
 * call settles); one that has answered can't fold until then. The escalator folding while it
 * waits calls the escalation off.
 */
export function fold(state, seat) {
  const R = state.round;
  if (state.phase !== 'plan' || !isSeat(state, seat) || R.folded[seat]) return false;
  const P = R.pending;
  if (P && P.from.includes(seat)) return respond(state, seat, false);
  if (P) {
    // Every other seat still in is in `from`, so this seat is the escalator.
    if (P.by !== seat) return false;
    R.pending = null;
  }
  withdraw(state, seat);
  if (activeSeats(state).length === 1) endByFold(state, seat);
  return true;
}

/** Out of the round: pay the stake into the pot, pass from now on, and take every agent off the board (face down stays face down). */
function withdraw(state, seat) {
  const R = state.round;
  R.pot += R.stake;
  R.folded[seat] = true;
  R.plans[seat] = { pass: true };
  for (const city of R.cities) {
    const side = city.sides[seat];
    for (const u of side) {
      R.cards[u].city = null;
      R.gone[seat].push(u);
    }
    side.length = 0;
  }
}

/** The last seat still in takes the pot. `folder` is the seat whose fold ended the round. */
function endByFold(state, folder) {
  const R = state.round;
  R.pending = null;
  const winner = activeSeats(state)[0];
  R.result = { winner, points: R.pot, folded: folder, cityWinners: null, totals: null, monaco: null, strip: stripFor(state, winner), stake: R.stake, pot: R.pot, carry: 0 };
  R.events = [{ t: 'fold', seat: folder }];
  award(state);
}

/**
 * The seat that takes the round's Microfilm strip: whoever holds the film city now (after any
 * withdrawal, so face-down cards count), or null. Under the comeback film the round's winner takes
 * none. At the flip, pass the round's `cityWinners` (already worked out) so the film city isn't
 * counted twice.
 */
function stripFor(state, winner, cityWinners = null) {
  const R = state.round;
  if (R.film === null) return null; // a reel of 0: no Microfilm
  const holder = cityWinners ? cityWinners[R.film] : cityLeader(state, R.film);
  return holder !== null && state.filmRule === 'comeback' && holder === winner ? null : holder;
}

function award(state) {
  const R = state.round;
  const res = R.result;
  if (res.winner !== null) state.scores[res.winner] += res.points;
  if (res.monaco !== null && res.monaco !== undefined) state.scores[res.monaco] += 1;
  if (res.strip !== null && res.strip !== undefined) state.strips[res.strip]++;
  state.history.push({ no: R.no, cities: R.cities.map((c) => c.id), film: R.film, ...res, scores: state.scores.slice(), strips: state.strips.slice() });
  // A full reel wins outright, even in the round the points target lands too.
  const reeled = state.reel > 0 ? state.strips.findIndex((x) => x >= state.reel) : -1;
  const winner = reeled >= 0 ? reeled : matchWinner(state.scores, state.target);
  if (winner !== null) {
    state.phase = 'match-over';
    state.winner = winner;
    state.winBy = reeled >= 0 ? 'reel' : 'points';
  } else {
    state.phase = 'round-over';
    state.carry = res.carry;
  }
}

/** The match goes to the single top score, once it is at or past the target. Level at the top plays on. */
export function matchWinner(scores, target) {
  const top = Math.max(...scores);
  if (top < target) return null;
  const leaders = scores.flatMap((x, s) => (x === top ? [s] : []));
  return leaders.length === 1 ? leaders[0] : null;
}

// ── resolving a turn ────────────────────────────────────────────────────────
function takeOut(state, uid, ev, cause) {
  const R = state.round;
  const card = R.cards[uid];
  const side = R.cities[card.city].sides[card.owner];
  side.splice(side.indexOf(uid), 1);
  ev.push({ t: 'out', uid, city: card.city, owner: card.owner, kind: card.kind, cause });
  card.faceDown = false;
  card.city = null;
  R.gone[card.owner].push(uid);
}

function draw(state, seat, ev, why = 'turn') {
  const R = state.round;
  if (!R.decks[seat].length || R.hands[seat].length >= MAX_HAND) return;
  const uid = R.decks[seat].shift();
  R.hands[seat].push(uid);
  ev.push({ t: 'draw', seat, uid, why });
}

/** Put a card into a city (as a drop or a move) and spring any armed rival Tripwire there. */
function arrive(state, uid, ci, ev) {
  const R = state.round;
  const card = R.cards[uid];
  const city = R.cities[ci];
  card.city = ci;
  city.sides[card.owner].push(uid);
  if (city.id === 'moscow') return true;
  // The first armed Tripwire of any rival, searching seats in table order after the owner.
  let wire;
  for (const r of rivalSeats(seatCount(state), card.owner)) {
    wire = city.sides[r].find((u) => {
      const w = R.cards[u];
      return w.kind === 'tripwire' && w.faceDown && hasTricks(state, w);
    });
    if (wire) break;
  }
  if (!wire) return true;
  R.cards[wire].faceDown = false;
  ev.push({ t: 'tripwire', uid: wire, victim: uid, city: ci });
  takeOut(state, uid, ev, 'tripwire');
  return false;
}

/** The strongest face-up agent of any rival here; ties go to the latest arrival, then the later in table order. */
function strongestRival(state, card) {
  const R = state.round;
  const sides = cityOf(state, card).sides;
  let best = null;
  for (const r of rivalSeats(seatCount(state), card.owner))
    for (const u of sides[r]) {
      const c = R.cards[u];
      if (c.faceDown) continue;
      const p = powerOf(state, u);
      if (!best || p > best.p || (p === best.p && c.turn >= best.turn)) best = { uid: u, p, turn: c.turn };
    }
  return best?.uid ?? null;
}

/**
 * A card leaves the board for `seat`'s hand, reset to its printed self and re-keyed under a fresh
 * uid (origin kept). Returns the new uid. Every path to a hand must use this (Phase 2b-ii).
 */
function returnToHand(state, uid, seat) {
  const R = state.round;
  const card = R.cards[uid];
  // Mint while the old uid is still taken, so the fresh one can never equal it.
  const fresh = mintUid(state, seat);
  delete R.cards[uid];
  Object.assign(card, { uid: fresh, kind: card.id0, city: null, turn: 0, faceDown: false, hidden: false, bonus: 0, owner: seat });
  R.cards[fresh] = card;
  R.hands[seat].push(fresh);
  return fresh;
}

function flipTrick(state, uid, seat, ev) {
  const R = state.round;
  const card = R.cards[uid];
  if (card.city === null || card.faceDown || !hasTricks(state, card)) return;
  const city = cityOf(state, card);
  // "Your rival's drop" is your mark's drop this round.
  const rivalPlan = R.plans[markOf(seatCount(state), seat, R.no)];
  const rivalCard = rivalPlan && !rivalPlan.pass ? R.cards[rivalPlan.uid] : null;
  switch (card.kind) {
    case 'lookout':
      ev.push({ t: 'trick', uid, kind: 'lookout' });
      draw(state, seat, ev, 'lookout');
      break;
    case 'assassin': {
      const target = city.id === 'moscow' ? null : strongestRival(state, card);
      ev.push({ t: 'trick', uid, kind: 'assassin', target });
      if (target) takeOut(state, target, ev, 'assassin');
      break;
    }
    case 'double': {
      const to = rivalPlan && !rivalPlan.pass ? rivalPlan.city : null;
      if (to === null || to === card.city || city.id === 'moscow' || !canArrive(state, seat, to)) {
        ev.push({ t: 'trick', uid, kind: 'double', to: null });
        break;
      }
      const from = card.city;
      city.sides[seat].splice(city.sides[seat].indexOf(uid), 1);
      card.bonus = 0;
      ev.push({ t: 'trick', uid, kind: 'double', from, to });
      arrive(state, uid, to, ev);
      break;
    }
    case 'getaway': {
      if (city.id === 'moscow') {
        ev.push({ t: 'trick', uid, kind: 'getaway', target: null });
        break;
      }
      let pick = null;
      for (const u of city.sides[seat]) {
        if (u === uid) continue;
        const p = powerOf(state, u);
        if (!pick || p < pick.p) pick = { uid: u, p };
      }
      ev.push({ t: 'trick', uid, kind: 'getaway', target: pick?.uid ?? null });
      if (pick) {
        city.sides[seat].splice(city.sides[seat].indexOf(pick.uid), 1);
        returnToHand(state, pick.uid, seat);
      }
      break;
    }
    case 'impostor': {
      if (!rivalCard || rivalCard.hidden || rivalCard.kind === 'impostor') {
        ev.push({ t: 'trick', uid, kind: 'impostor', as: null });
        break;
      }
      card.kind = rivalCard.kind;
      ev.push({ t: 'trick', uid, kind: 'impostor', as: card.kind });
      if (AGENT[card.kind].flip) flipTrick(state, uid, seat, ev);
      break;
    }
  }
}

/**
 * Every seat has locked in: drop, spring traps, fire flip tricks, draw, advance, all in
 * initiative order round the table, skipping seats that have folded. Returns the events. A
 * following turn where no seat can drop anywhere resolves in the same call.
 */
export function resolveTurn(state) {
  if (!ready(state)) return null;
  const ev = [];
  resolveOne(state, ev);
  while (state.phase === 'plan' && ready(state) && state.round.plans.every((p) => p.pass)) resolveOne(state, ev);
  state.round.events = ev;
  return ev;
}

function resolveOne(state, ev) {
  const R = state.round;
  const n = seatCount(state);
  // The seats still in, in initiative order: the shared frozen list unless someone has folded.
  const order = R.folded.includes(true) ? orderFrom(n, R.initiative).filter((s) => !R.folded[s]) : orderFrom(n, R.initiative);
  const dropped = Array(n).fill(null);

  // Every card lands at once; Istanbul gives +3 to every agent that arrives on its first busy turn.
  for (const seat of order) {
    const plan = R.plans[seat];
    if (plan.pass) {
      ev.push({ t: 'pass', seat });
      continue;
    }
    const card = R.cards[plan.uid];
    R.hands[seat].splice(R.hands[seat].indexOf(plan.uid), 1);
    const cid = R.cities[plan.city].id;
    card.hidden = !!AGENT[card.kind].faceDown || cid === 'vienna';
    card.faceDown = card.hidden;
    card.turn = R.turn;
    if (cid === 'istanbul' && (!R.cities[plan.city].first || R.cities[plan.city].first === R.turn)) {
      R.cities[plan.city].first = R.turn;
      card.bonus = 3;
    }
    dropped[seat] = plan.uid;
    ev.push({ t: 'drop', seat, uid: plan.uid, city: plan.city, kind: card.kind, faceDown: card.faceDown });
  }
  // Place without traps first, so a Tripwire also catches a rival dropped on the same turn.
  for (const seat of order) {
    const uid = dropped[seat];
    if (!uid) continue;
    const card = R.cards[uid];
    card.city = R.plans[seat].city;
    R.cities[card.city].sides[seat].push(uid);
  }
  for (const seat of order) {
    const uid = dropped[seat];
    if (!uid) continue;
    const card = R.cards[uid];
    const ci = card.city;
    const side = R.cities[ci].sides[seat];
    side.splice(side.indexOf(uid), 1);
    arrive(state, uid, ci, ev);
  }
  for (const seat of order) if (dropped[seat]) flipTrick(state, dropped[seat], seat, ev);
  for (const seat of order) {
    const uid = dropped[seat];
    if (uid && R.cards[uid].city === R.plans[seat].city && R.cities[R.plans[seat].city].id === 'hongkong') draw(state, seat, ev, 'hongkong');
  }

  // Havana: at the end of turn 4 everyone there defects to the next seat still in round the
  // table (seat s's agents go to seat s + 1 when nobody has folded; two seats still in swap).
  // Face-down agents turn over.
  if (R.turn === 4) {
    R.cities.forEach((city, ci) => {
      if (city.id !== 'havana' || city.sides.every((side) => !side.length)) return;
      // `order` runs round the table from the initiative, so each seat's successor in it (the last
      // wrapping to the first) is the next seat still in.
      const sides = city.sides;
      const last = sides[order[order.length - 1]];
      for (let i = order.length - 1; i > 0; i--) sides[order[i]] = sides[order[i - 1]];
      sides[order[0]] = last;
      for (const seat of order)
        for (const u of sides[seat]) {
          R.cards[u].owner = seat;
          R.cards[u].faceDown = false;
        }
      ev.push({ t: 'havana', city: ci });
    });
  }

  if (R.turn >= TURNS) {
    endRound(state, ev);
  } else {
    for (const seat of order) draw(state, seat, ev);
    R.turn++;
    beginTurn(state);
  }
}

/** Each seat's total for the tie-break. Lisbon (lowest wins) is left out, inverted, or counted, per `mode`. */
export function tiebreakTotals(cityIds, totals, mode = RULES.lisbonTiebreak) {
  return allSeats(widthOf(totals)).map((s) =>
    totals.reduce((t, x, i) => {
      if (cityIds[i] !== 'lisbon') return t + x[s];
      return mode === 'out' ? t : mode === 'invert' ? t - x[s] : t + x[s];
    }, 0),
  );
}

/** Seats covered by per-city, per-seat totals (`totals[ci][s]`). */
const widthOf = (totals) => totals.reduce((n, row) => Math.max(n, row.length), 0);

/**
 * The round goes to the single seat holding the most cities. Among seats tied on cities, the one
 * holding Zurich (by id) takes it. Otherwise the tie-break totals (see tiebreakTotals) decide
 * among the tied seats only; a tie there is a dead heat (null). Seats marked in `out` (folded)
 * are never in the tie.
 */
export function roundWinner(cityIds, cityWinners, totals, mode = RULES.lisbonTiebreak, out = null) {
  const seats = allSeats(widthOf(totals));
  const wins = seats.map((s) => cityWinners.filter((w) => w === s).length);
  const most = Math.max(...wins);
  const tied = seats.filter((s) => wins[s] === most && !out?.[s]);
  if (tied.length === 1) return tied[0];
  const zurich = cityWinners[cityIds.indexOf('zurich')];
  if (zurich !== undefined && tied.includes(zurich)) return zurich;
  const sum = tiebreakTotals(cityIds, totals, mode);
  const best = Math.max(...tied.map((s) => sum[s]));
  const ahead = tied.filter((s) => sum[s] === best);
  return ahead.length === 1 ? ahead[0] : null;
}

function endRound(state, ev) {
  const R = state.round;
  for (const city of R.cities)
    for (const side of city.sides)
      for (const u of side)
        if (R.cards[u].faceDown) {
          R.cards[u].faceDown = false;
          ev.push({ t: 'reveal', uid: u, kind: R.cards[u].kind });
        }
  R.cities.forEach((city, ci) => {
    if (city.id !== 'tangier') return;
    const all = city.sides.flat();
    if (!all.length) return;
    const top = Math.max(...all.map((u) => powerOf(state, u)));
    for (const u of all.filter((u) => powerOf(state, u) === top)) takeOut(state, u, ev, 'tangier');
  });
  const totals = R.cities.map((_, ci) => cityTotals(state, ci));
  const cityWinners = R.cities.map((_, ci) => cityLeader(state, ci));
  const winner = roundWinner(R.cities.map((c) => c.id), cityWinners, totals, RULES.lisbonTiebreak, R.folded);
  const mi = R.cities.findIndex((c) => c.id === 'monaco');
  const monaco = mi >= 0 ? cityWinners[mi] : null;
  const { stake, pot } = R;
  // A dead heat rolls the stake (not doubled) and the pot into the next round's pot.
  const carry = winner === null && RULES.rollover ? stake + pot : 0;
  R.pending = null;
  R.result = { winner, points: winner === null ? 0 : stake * 2 + pot, folded: null, cityWinners, totals, monaco, strip: stripFor(state, winner, cityWinners), stake, pot, carry };
  ev.push({ t: 'round', ...R.result });
  award(state);
}

// ── what a seat may see ─────────────────────────────────────────────────────
/** A card as `seat` sees it: rival face-down cards hide their identity and power. */
export function cardView(state, uid, seat) {
  const c = state.round.cards[uid];
  const secret = c.faceDown && c.owner !== seat;
  return {
    uid,
    owner: c.owner,
    origin: secret ? c.owner : c.origin,
    city: c.city,
    turn: c.turn,
    faceDown: c.faceDown,
    hidden: c.hidden,
    kind: secret ? null : c.kind,
    id0: secret ? null : c.id0,
    power: secret ? null : c.city === null ? AGENT[c.kind].power : powerOf(state, uid),
    base: secret ? null : AGENT[c.kind].power,
    bonus: secret ? 0 : c.bonus,
    tricks: secret || c.city === null ? null : hasTricks(state, c),
  };
}

/** Events as `seat` sees them: the rival's face-down drops and their draws stay secret. */
function maskEvent(e, seat) {
  if (e.t === 'drop' && e.seat !== seat && e.faceDown) return { ...e, kind: null };
  if (e.t === 'draw' && e.seat !== seat) return { ...e, uid: null };
  return e;
}

/**
 * What `seat` may see. A seat outside the table (e.g. -1, n, '1', null) is a spectator: no hand,
 * every face-down card hidden.
 */
export function viewFor(state, seat) {
  const R = state.round;
  const player = isSeat(state, seat);
  const myDeck = player ? R.decks[seat].map((u) => R.cards[u].kind).sort() : [];
  const secretIn = (city) => city.sides.some((side) => side.some((u) => R.cards[u].faceDown && R.cards[u].owner !== seat));
  return {
    seat,
    target: state.target,
    scores: state.scores.slice(),
    tokens: state.tokens.slice(),
    strips: state.strips.slice(),
    reel: state.reel,
    filmRule: state.filmRule,
    winBy: state.winBy,
    roundNo: state.roundNo,
    phase: state.phase,
    winner: state.winner,
    history: state.history.map((h) => ({ ...h })),
    round: {
      no: R.no,
      film: R.film,
      turn: R.turn,
      initiative: R.initiative,
      stake: R.stake,
      pot: R.pot,
      escalated: R.escalated.slice(),
      // Who has answered, but not how: answers stay secret until the call settles.
      pending: R.pending
        ? { by: R.pending.by, from: R.pending.from.slice(), answered: R.pending.calls.map((c) => c !== null), mine: player ? R.pending.calls[seat] : null }
        : null,
      called: R.called ? { by: R.called.by, answers: R.called.answers.slice() } : null,
      folded: R.folded.slice(),
      cities: R.cities.map((city, ci) => ({
        id: city.id,
        first: city.first,
        open: state.phase === 'plan' ? cityOpen(state, ci) : false,
        capacity: capacityOf(city.id),
        sides: city.sides.map((side) => side.map((u) => cardView(state, u, seat))),
        leader: secretIn(city) ? null : cityLeader(state, ci),
        known: city.sides.map((side) => side.reduce((s, u) => s + (R.cards[u].faceDown && R.cards[u].owner !== seat ? 0 : powerOf(state, u)), 0)),
        hiddenCount: city.sides.map((side) => side.filter((u) => R.cards[u].faceDown && R.cards[u].owner !== seat).length),
      })),
      hand: player ? R.hands[seat].map((u) => cardView(state, u, seat)) : [],
      handCounts: R.hands.map((h) => h.length),
      deckCounts: R.decks.map((d) => d.length),
      myDeck,
      gone: R.gone.map((g) => g.map((u) => cardView(state, u, seat))),
      plan: player && R.plans[seat] ? { ...R.plans[seat] } : null,
      rivalLocked: player && rivalSeats(seatCount(state), seat).every((s) => !!R.plans[s]),
      locked: R.plans.map(Boolean),
      legal: player ? legalDrops(state, seat) : [],
      events: R.events.map((e) => maskEvent(e, seat)),
      result: R.result ? JSON.parse(JSON.stringify(R.result)) : null,
    },
  };
}
