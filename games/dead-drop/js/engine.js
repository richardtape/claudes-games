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
import { AGENT, CAPACITY, CITY, CLASSIC_CITIES, DECK, MAX_HAND, MAX_SEATS, MIN_SEATS, RULES, START_HAND, TARGET, TURNS } from './data.js';

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

/**
 * A new match. `roster` is the agents every seat is dealt one of (default: Classic, DECK) and `pool` the
 * cities rounds are dealt from (default: Classic, CLASSIC_CITIES); js/roster.js builds both for Mixed and
 * ladder matches. `feature` (ids from the pool) makes round 1 deal one of them. `twist` is a ladder rival's
 * twist ({ ...TWISTS[id], seat }) or null. `cities` deals those three ids in round 1 instead (tests, the sim).
 */
export function newMatch({ seed = Date.now(), target = TARGET, cities = null, seats = 2, film = null, roster = DECK, pool = CLASSIC_CITIES, feature = null, twist = null } = {}) {
  if (!Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS) throw new RangeError(`seats must be ${MIN_SEATS} to ${MAX_SEATS}, got ${seats}`);
  if (film !== null && !(Number.isInteger(film) && film >= 0 && film <= 2)) throw new RangeError(`film must be null or 0 to 2, got ${film}`);
  if (!roster.length || !roster.every((id) => AGENT[id])) throw new RangeError(`unknown agent in roster: ${roster}`);
  if (pool.length < 3 || !pool.every((id) => CITY[id])) throw new RangeError(`a city pool needs 3 or more known cities, got ${pool}`);
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
    // Phase 2b-ii, last so Classic states keep 2b-i's key order (startRound reads them).
    roster: roster.slice(),
    cityPool: pool.slice(),
    twist: twist ? { ...twist } : null,
  };
  startRound(state, { cities, film, feature });
  return state;
}

/**
 * The agents `seat` is dealt each round: the match's roster, plus the twist's card for the seat holding an
 * `extra` twist. A fresh array. Works on a state and on a view. Call it per deal, never per card.
 */
export function deckList(stateOrView, seat) {
  const t = stateOrView.twist;
  return t && t.id === 'extra' && t.seat === seat ? [...stateOrView.roster, t.kind] : stateOrView.roster.slice();
}

/**
 * Round 1 of a match with featured cities: one of them (drawn first), then two from a shuffle of the rest
 * of the pool, the three shuffled.
 */
function featuredCities(state, feature) {
  const first = feature[rint(state, feature.length)];
  const rest = rshuffle(state, state.cityPool.filter((id) => id !== first)).slice(0, 2);
  return rshuffle(state, [first, ...rest]);
}

/**
 * Fills the fields Phase 2b-ii added to the state with their Classic defaults, where missing, so a
 * match saved by 2b-i resumes as Classic. In place, idempotent; returns the state.
 */
export function upgradeState(state) {
  if (!Array.isArray(state.roster)) state.roster = DECK.slice();
  if (!Array.isArray(state.cityPool)) state.cityPool = CLASSIC_CITIES.slice();
  if (state.twist === undefined) state.twist = null;
  if (state.round && !Array.isArray(state.round.taps)) state.round.taps = [];
  if (state.round && !Array.isArray(state.round.exposed)) state.round.exposed = [];
  return state;
}

/**
 * Deals round `state.roundNo`: three cities (`cities` if given; in round 0 one of `feature` if given;
 * otherwise three from a shuffle of the pool) and each seat's deck from deckList, then sets up the
 * match's twist, if any (setUpTwist).
 */
export function startRound(state, { cities = null, film = null, feature = null } = {}) {
  const no = state.roundNo;
  const n = seatCount(state);
  // A Classic pool is CITIES' first 11 in 2b-i's order, so this shuffle draws exactly as 2b-i's did.
  const cityIds = cities || (feature?.length && no === 0 ? featuredCities(state, feature) : rshuffle(state, state.cityPool).slice(0, 3));
  const cards = {};
  state.round = { no, cards }; // mintUid reads these two while dealing
  const decks = allSeats(n).map((seat) =>
    rshuffle(state, deckList(state, seat)).map((kind) => {
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
    // Phase 2b-ii, last so Classic rounds keep 2b-i's key order. Wiretaps: { by, on, turn } (flipTrick,
    // the `tap` twist); hand cards a `seen` twist has shown its seat: { by, uid }.
    taps: [],
    exposed: [],
  };
  // After the film draw, so a match without a twist draws exactly as 2b-i's did.
  if (state.twist) setUpTwist(state);
  state.carry = 0;
  state.phase = 'plan';
  beginTurn(state);
  return state;
}

/**
 * The twist's part of a deal (startRound, every round), for the seat holding it. `extra`: nothing more
 * (deckList dealt its card). `placed`: the seat's card of `kind` (from its deck, or else from its hand,
 * which then takes the deck's top card, with no event) starts the round face down in a random city,
 * turn 0, flagged `placed`; it doesn't arrive (no Istanbul, Tokyo, Tripwire or Prague). `tap`: the seat
 * taps its mark on turns `from`..TURNS, as a Wiretap would. `seen`: the seat sees `count` cards of its
 * mark's hand, picked at random.
 */
function setUpTwist(state) {
  const R = state.round;
  const { id, seat } = state.twist;
  if (id === 'placed') {
    const { kind } = state.twist;
    let uid = R.decks[seat].find((u) => R.cards[u].kind === kind);
    if (uid) R.decks[seat].splice(R.decks[seat].indexOf(uid), 1);
    else {
      uid = R.hands[seat].find((u) => R.cards[u].kind === kind);
      if (!uid) return; // not among the seat's cards: nothing to place
      R.hands[seat].splice(R.hands[seat].indexOf(uid), 1);
      if (R.decks[seat].length) R.hands[seat].push(R.decks[seat].shift());
    }
    const ci = rint(state, 3);
    Object.assign(R.cards[uid], { city: ci, turn: 0, hidden: true, faceDown: true, placed: true });
    R.cities[ci].sides[seat].push(uid);
  } else if (id === 'tap') {
    const on = markOf(seatCount(state), seat, R.no);
    for (let turn = state.twist.from; turn <= TURNS; turn++) R.taps.push({ by: seat, on, turn });
  } else if (id === 'seen') {
    const mark = markOf(seatCount(state), seat, R.no);
    for (let i = 0; i < state.twist.count; i++) {
      const unseen = R.hands[mark].filter((u) => !R.exposed.some((e) => e.uid === u));
      if (!unseen.length) break;
      R.exposed.push({ by: seat, uid: unseen[rint(state, unseen.length)] });
    }
  }
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

/**
 * Every drop `seat` may lock this turn, in hand order, then cities 0..2: `{ uid, city }`, and for an
 * Accomplice where its side has two or more free places, right after that, `{ uid, city, partner }` for
 * every other card in hand (in hand order). In Casablanca every one of those drops comes twice, face up
 * then face down: `{ uid, city, down: false }`, `{ uid, city, down: true }` (and `{ uid, city, down,
 * partner }`). A plan's `partner` and `down` are present only when used.
 */
export function legalDrops(state, seat) {
  const R = state.round;
  if (!R || state.phase !== 'plan' || !isSeat(state, seat) || R.folded[seat]) return [];
  const out = [];
  const hand = R.hands[seat];
  for (const uid of hand) {
    // One property read per card: Classic hands never take the partner branch.
    const partners = AGENT[R.cards[uid].kind].partner;
    for (let ci = 0; ci < 3; ci++) {
      if (!canArrive(state, seat, ci)) continue;
      const pair = partners && capacityOf(R.cities[ci].id) - R.cities[ci].sides[seat].length >= 2;
      if (R.cities[ci].id === 'casablanca') {
        out.push({ uid, city: ci, down: false }, { uid, city: ci, down: true });
        if (pair) for (const p of hand) if (p !== uid) out.push({ uid, city: ci, down: false, partner: p }, { uid, city: ci, down: true, partner: p });
        continue;
      }
      out.push({ uid, city: ci });
      if (pair) for (const p of hand) if (p !== uid) out.push({ uid, city: ci, partner: p });
    }
  }
  return out;
}

/** The same drop: uid and city, the same partner (none if missing) and the same face (`down`, missing is face up). */
const sameDrop = (a, b) => a.uid === b.uid && a.city === b.city && (a.partner ?? null) === (b.partner ?? null) && !!a.down === !!b.down;

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

/**
 * Tricks work unless the card dropped face down (Vienna, Sleeper) or is jammed. Tripwire and Decoy are
 * the exceptions: their tricks work face down (not in Vienna, not jammed).
 */
export function hasTricks(state, card) {
  if (card.city === null) return false;
  if (card.hidden && card.kind !== 'tripwire' && card.kind !== 'decoy') return false;
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
  // Tokyo: every agent that arrived on the latest turn with an arrival here (a placed card's turn 0 never counts).
  if (city.id === 'tokyo' && card.turn >= 1 && card.turn === latestTurn(state, city)) p += CITY.tokyo.bonus;
  return Math.max(0, p);
}

/** The latest turn any agent in this city arrived on (0 if none has). Plain loops: powerOf calls it in Tokyo. */
function latestTurn(state, city) {
  const cards = state.round.cards;
  let latest = 0;
  for (let r = 0; r < city.sides.length; r++) for (const u of city.sides[r]) if (cards[u].turn > latest) latest = cards[u].turn;
  return latest;
}

export function cityTotals(state, ci) {
  const city = state.round.cities[ci];
  // Rome: each side's single strongest agent counts again, × (factor − 1).
  if (city.id === 'rome') return city.sides.map((side) => romeTotal(state, side, true, null));
  return city.sides.map((side) => side.reduce((s, u) => s + powerOf(state, u), 0));
}

/**
 * A side's total in Rome: its powers plus the strongest one again × (CITY.rome.factor − 1). With `all`
 * false, only what `seat` can see (viewFor's `known`): its own cards and the face-up ones; a spectator
 * sees the face-up ones.
 */
function romeTotal(state, side, all, seat) {
  const cards = state.round.cards;
  let sum = 0;
  let top = 0;
  for (const u of side) {
    if (!all && cards[u].faceDown && cards[u].owner !== seat) continue;
    const p = powerOf(state, u);
    sum += p;
    if (p > top) top = p;
  }
  return sum + top * (CITY.rome.factor - 1);
}

/**
 * Who holds a city, given each seat's total there (`totals[s]`), number of agents there (`counts[s]`)
 * and match points (`scores[s]`, for Geneva). Seats with nobody there take no part. Lisbon goes to the
 * single lowest total; Reykjavik to the single seat with the most agents, a tie on agents to the single
 * higher total among those seats, whatever the power; anywhere else to the single highest, if it is
 * above 0. A tie holds nothing, except in Geneva: it goes to the tied seat single lowest on `scores`
 * (still nothing if those are level too, or without `scores`).
 */
export function leaderOf(cityId, totals, counts, scores = null) {
  if (cityId === 'reykjavik') return mostAgents(totals, counts);
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
  if (best === null) return null;
  if (tied) best = cityId === 'geneva' && scores ? behindOf(totals, counts, scores, totals[best]) : null;
  return best !== null && (low || totals[best] > 0) ? best : null;
}

/** Reykjavik: the single seat with the most agents there; among seats tied on agents, the single higher total. */
function mostAgents(totals, counts) {
  let best = null;
  let tied = false;
  for (let s = 0; s < counts.length; s++) {
    if (!counts[s]) continue;
    if (best === null || counts[s] > counts[best] || (counts[s] === counts[best] && totals[s] > totals[best])) {
      best = s;
      tied = false;
    } else if (counts[s] === counts[best] && totals[s] === totals[best]) tied = true;
  }
  return tied ? null : best;
}

/** Geneva: among the seats with agents there and a total of `top`, the one single lowest on match points, or null. */
function behindOf(totals, counts, scores, top) {
  let best = null;
  let tied = false;
  for (let s = 0; s < totals.length; s++) {
    if (!counts[s] || totals[s] !== top) continue;
    if (best === null || scores[s] < scores[best]) {
      best = s;
      tied = false;
    } else if (scores[s] === scores[best]) tied = true;
  }
  return tied ? null : best;
}

/** Seat that holds the city right now, or null. */
export function cityLeader(state, ci) {
  const city = state.round.cities[ci];
  return leaderOf(city.id, cityTotals(state, ci), city.sides.map((s) => s.length), state.scores);
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
  // Store the matched legal drop, not the caller's object, so a plan never carries a stray key.
  const drop = legalDrops(state, seat).find((d) => sameDrop(d, plan));
  if (!drop) return false;
  R.plans[seat] = drop;
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
 * The Blackmailer's flip (Decision 4): the round's one escalation, free and settled on the spot. If nobody
 * has escalated this round, `seat` has: the stake doubles and every other seat still in is recorded as
 * playing on (`called.free`). No token is spent and nobody answers: it fires while a turn resolves, after
 * every plan is locked. Internal on purpose (never an option on `escalate`, so no table action reaches it).
 * Returns whether it escalated.
 */
function freeEscalation(state, seat) {
  const R = state.round;
  if (R.escalated.some(Boolean)) return false;
  R.escalated[seat] = true;
  R.stake *= 2;
  // A fresh array, as settleCall's answers are.
  R.called = { by: seat, answers: R.folded.map((out, s) => (out || s === seat ? null : 'on')), free: true };
  return true;
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

/**
 * Is this agent guarded: does another agent of its owner's, in its city, a Bodyguard with tricks, stand
 * with it? A guarded agent can't be taken out or turned (Assassin, Tripwire, Tangier, Turncoat). A plain
 * loop: the arrival path runs it.
 */
function guarded(state, uid) {
  const R = state.round;
  const card = R.cards[uid];
  for (const u of R.cities[card.city].sides[card.owner]) {
    if (u === uid) continue;
    const c = R.cards[u];
    if (c.kind === 'bodyguard' && hasTricks(state, c)) return true;
  }
  return false;
}

/**
 * The card that actually takes a take-out or a turn meant for `uid`: the owner's first face-down Decoy
 * with tricks in that city (never `uid` itself), turned face up, or else `uid`. Check guarded() first,
 * so a guarded agent never uses up a Decoy.
 */
function stand(state, uid, ev) {
  const R = state.round;
  const card = R.cards[uid];
  for (const u of R.cities[card.city].sides[card.owner]) {
    if (u === uid) continue;
    const c = R.cards[u];
    if (c.kind === 'decoy' && c.faceDown && hasTricks(state, c)) {
      c.faceDown = false;
      ev.push({ t: 'decoy', uid: u, saved: uid, city: card.city });
      return u;
    }
  }
  return uid;
}

function draw(state, seat, ev, why = 'turn') {
  const R = state.round;
  if (!R.decks[seat].length || R.hands[seat].length >= MAX_HAND) return;
  const uid = R.decks[seat].shift();
  R.hands[seat].push(uid);
  ev.push({ t: 'draw', seat, uid, why });
}

/**
 * Put a card into a city (as a drop or a move) and spring any armed rival Tripwire there, unless the
 * card is guarded. A Decoy can take the wire for it. Then, in Prague, every other face-down agent there
 * turns face up, whether or not the arrival survived; resolveOne's drops pass `prague` false and reveal
 * together once all have arrived (pragueDrops). Returns whether the arriving card is still there.
 */
function arrive(state, uid, ci, ev, prague = true) {
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
  // A guarded arrival walks past, and the wire stays armed. (Asked only once a wire is found: the
  // search has no side effects, and most arrivals meet no wire.)
  let here = true;
  if (wire && !guarded(state, uid)) {
    R.cards[wire].faceDown = false;
    ev.push({ t: 'tripwire', uid: wire, victim: uid, city: ci });
    const gone = stand(state, uid, ev);
    takeOut(state, gone, ev, 'tripwire');
    here = gone !== uid;
  }
  if (prague && city.id === 'prague') blowCovers(state, uid, city, ev);
  return here;
}

/**
 * Prague: every face-down agent in the city but `uid` (the arrival, which keeps its face; null for none)
 * turns face up, seats in order, each side in order. Revealed cards keep `hidden`, as the Interrogator's do.
 */
function blowCovers(state, uid, city, ev) {
  const cards = state.round.cards;
  for (let r = 0; r < city.sides.length; r++)
    for (const u of city.sides[r]) {
      const c = cards[u];
      if (u === uid || !c.faceDown) continue;
      c.faceDown = false;
      ev.push({ t: 'reveal', uid: u, kind: c.kind, by: 'prague' });
    }
}

/**
 * The strongest (Assassin) or, with `weakest`, the weakest (Turncoat) face-up, unguarded agent of any
 * rival here; ties go to the latest arrival, then the later in table order. Null if there is none.
 */
function rivalTarget(state, card, weakest = false) {
  const R = state.round;
  const sides = cityOf(state, card).sides;
  let best = null;
  for (const r of rivalSeats(seatCount(state), card.owner))
    for (const u of sides[r]) {
      const c = R.cards[u];
      if (c.faceDown || guarded(state, u)) continue;
      const p = powerOf(state, u);
      if (!best || (weakest ? p < best.p : p > best.p) || (p === best.p && c.turn >= best.turn)) best = { uid: u, p, turn: c.turn };
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
  delete card.partner;
  delete card.placed;
  // A `seen` twist forgets it: the old uid is free now and could be minted again for another card. (In place: bot playouts send cards home.)
  for (let i = R.exposed.length - 1; i >= 0; i--) if (R.exposed[i].uid === uid) R.exposed.splice(i, 1);
  R.cards[fresh] = card;
  R.hands[seat].push(fresh);
  return fresh;
}

function flipTrick(state, uid, seat, ev) {
  const R = state.round;
  const card = R.cards[uid];
  // An agent taken out or turned (Turncoat) before its flip loses the flip. (In Classic the owner is always the seat.)
  if (card.city === null || card.faceDown || card.owner !== seat || !hasTricks(state, card)) return;
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
      const target = city.id === 'moscow' ? null : rivalTarget(state, card);
      ev.push({ t: 'trick', uid, kind: 'assassin', target });
      if (target) takeOut(state, stand(state, target, ev), ev, 'assassin');
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
    case 'interrogator': {
      // Every face-down rival agent here, seats in table order after the owner, each side in order.
      // Revealed cards keep `hidden`, so a face-down drop still has no tricks, and a Tripwire is disarmed.
      const revealed = [];
      for (const r of rivalSeats(seatCount(state), card.owner)) for (const u of city.sides[r]) if (R.cards[u].faceDown) revealed.push(u);
      ev.push({ t: 'trick', uid, kind: 'interrogator', revealed });
      for (const u of revealed) {
        R.cards[u].faceDown = false;
        ev.push({ t: 'reveal', uid: u, kind: R.cards[u].kind, by: 'interrogator' });
      }
      break;
    }
    case 'turncoat': {
      const target = city.id === 'moscow' ? null : rivalTarget(state, card, true);
      if (!target) {
        ev.push({ t: 'trick', uid, kind: 'turncoat', target: null, to: null });
        break;
      }
      const to = R.cards[target].owner;
      ev.push({ t: 'trick', uid, kind: 'turncoat', target, to });
      // The two swap places and owners (origin kept). Both are face up: a Decoy that stands in turns over.
      const turned = stand(state, target, ev);
      const mine = city.sides[card.owner];
      const theirs = city.sides[to];
      mine[mine.indexOf(uid)] = turned;
      theirs[theirs.indexOf(turned)] = uid;
      R.cards[turned].owner = card.owner;
      card.owner = to;
      break;
    }
    case 'courier': {
      // Your strongest face-up agent in another city, never one in Moscow (ties: the latest arrival, then
      // the lowest city index), moves here if there is room. The move is an arrival (Decision 4).
      const here = card.city;
      let pick = null;
      if (canArrive(state, seat, here))
        for (let ci = 0; ci < R.cities.length; ci++) {
          if (ci === here || R.cities[ci].id === 'moscow') continue;
          for (const u of R.cities[ci].sides[seat]) {
            const c = R.cards[u];
            if (c.faceDown) continue;
            const p = powerOf(state, u);
            if (!pick || p > pick.p || (p === pick.p && c.turn > pick.turn)) pick = { uid: u, p, turn: c.turn, ci };
          }
        }
      ev.push({ t: 'trick', uid, kind: 'courier', moved: pick ? pick.uid : null, from: pick ? pick.ci : null });
      if (pick) {
        const side = R.cities[pick.ci].sides[seat];
        side.splice(side.indexOf(pick.uid), 1);
        const moved = R.cards[pick.uid];
        moved.bonus = 0;
        moved.turn = R.turn;
        arrive(state, pick.uid, here, ev);
      }
      break;
    }
    case 'blackmailer':
      ev.push({ t: 'trick', uid, kind: 'blackmailer', stake: freeEscalation(state, seat) ? R.stake : null });
      break;
    case 'wiretap': {
      // Next turn `seat` hears which city its mark locks (viewFor's `tapped`). The final turn has no next turn.
      const on = markOf(seatCount(state), seat, R.no);
      const turn = R.turn < TURNS ? R.turn + 1 : null;
      if (turn !== null) R.taps.push({ by: seat, on, turn });
      ev.push({ t: 'trick', uid, kind: 'wiretap', on, turn });
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

/**
 * The rest of an Accomplice's drop with a partner (resolveOne, after the Accomplice's own): the partner
 * leaves the hand too, face down and flagged `partner` (no tricks but a Tripwire's or a Decoy's), dropped
 * this turn, with Istanbul's bonus whenever the Accomplice took it. Pushes both drop events.
 */
function dropPartner(state, seat, plan, ev) {
  const R = state.round;
  const card = R.cards[plan.uid];
  const mate = R.cards[plan.partner];
  const city = R.cities[plan.city];
  R.hands[seat].splice(R.hands[seat].indexOf(plan.partner), 1);
  mate.hidden = true;
  mate.faceDown = true;
  mate.partner = true;
  mate.turn = R.turn;
  // The Accomplice's drop just set Istanbul's first busy turn if it took the bonus.
  if (city.id === 'istanbul' && city.first === R.turn) mate.bonus = 3;
  ev.push({ t: 'drop', seat, uid: plan.uid, city: plan.city, kind: card.kind, faceDown: card.faceDown, partner: plan.partner });
  ev.push({ t: 'drop', seat, uid: plan.partner, city: plan.city, kind: mate.kind, faceDown: true, partnerOf: plan.uid });
}

/**
 * Prague for a turn's drops, after every drop has arrived: each drop (or partner) that arrived in city `ci`
 * this turn and is still there turns every other face-down agent there face up. So with two or more of
 * them every face-down agent there turns over, and with one, all but it. Each card is revealed once.
 */
function pragueDrops(state, ci, order, dropped, ev) {
  const R = state.round;
  let count = 0;
  let only = null;
  for (const seat of order) {
    const uid = dropped[seat];
    if (!uid) continue;
    if (R.cards[uid].city === ci) {
      count++;
      only = uid;
    }
    const mate = R.plans[seat].partner;
    if (mate && R.cards[mate].city === ci) {
      count++;
      only = mate;
    }
  }
  if (count) blowCovers(state, count === 1 ? only : null, R.cities[ci], ev);
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
    // Casablanca: the face the drop chose. (Its partner, if any, is always face down: dropPartner.)
    card.hidden = cid === 'casablanca' ? !!plan.down : !!AGENT[card.kind].faceDown || cid === 'vienna';
    card.faceDown = card.hidden;
    card.turn = R.turn;
    if (cid === 'istanbul' && (!R.cities[plan.city].first || R.cities[plan.city].first === R.turn)) {
      R.cities[plan.city].first = R.turn;
      card.bonus = 3;
    }
    dropped[seat] = plan.uid;
    if (plan.partner) dropPartner(state, seat, plan, ev);
    else ev.push({ t: 'drop', seat, uid: plan.uid, city: plan.city, kind: card.kind, faceDown: card.faceDown });
  }
  // Place without traps first, so a Tripwire also catches a rival dropped on the same turn. An
  // Accomplice's partner is placed with it, before any arrival.
  for (const seat of order) {
    const uid = dropped[seat];
    if (!uid) continue;
    const card = R.cards[uid];
    card.city = R.plans[seat].city;
    R.cities[card.city].sides[seat].push(uid);
    const mate = R.plans[seat].partner;
    if (mate) {
      R.cards[mate].city = card.city;
      R.cities[card.city].sides[seat].push(mate);
    }
  }
  for (const seat of order) {
    const uid = dropped[seat];
    if (!uid) continue;
    const ci = R.plans[seat].city;
    const side = R.cities[ci].sides[seat];
    side.splice(side.indexOf(uid), 1);
    arrive(state, uid, ci, ev, false);
    // Then the partner, unless it already left: a Decoy partner can take a Tripwire meant for its Accomplice.
    const mate = R.plans[seat].partner;
    if (mate && R.cards[mate].city !== null) {
      side.splice(side.indexOf(mate), 1);
      arrive(state, mate, ci, ev, false);
    }
  }
  // Prague reveals for the drops once all of them have arrived, so (like the traps) it doesn't depend on who moves first.
  for (let ci = 0; ci < R.cities.length; ci++) if (R.cities[ci].id === 'prague') pragueDrops(state, ci, order, dropped, ev);
  for (const seat of order) if (dropped[seat]) flipTrick(state, dropped[seat], seat, ev);
  for (const seat of order) {
    const uid = dropped[seat];
    // A drop can be gone from the cards: a Turncoat turned to a rival's side, then sent home (re-keyed) by its Getaway.
    if (uid && R.cards[uid]?.city === R.plans[seat].city && R.cities[R.plans[seat].city].id === 'hongkong') draw(state, seat, ev, 'hongkong');
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
  if (R.turn === CITY.glienicke.turn) for (let ci = 0; ci < R.cities.length; ci++) if (R.cities[ci].id === 'glienicke') crossBridge(state, ci, ev);

  if (R.turn >= TURNS) {
    endRound(state, ev);
  } else {
    for (const seat of order) draw(state, seat, ev);
    R.turn++;
    beginTurn(state);
  }
}

/**
 * Glienicke Bridge, at the end of turn CITY.glienicke.turn: each seat still in with agents in city `ci`
 * sends its strongest there (by powerOf, face-down ones too; ties: the latest arrival, then the last in
 * side order) across to the next seat still in after it round the table (two seats swap). Every move is
 * worked out first, then made: the crosser changes owner and side, turns face up (keeping `hidden`, as
 * Havana's do) and keeps its origin. Neither a Bodyguard nor a Decoy stops it. Pushes a `bridge` event.
 */
function crossBridge(state, ci, ev) {
  const R = state.round;
  const sides = R.cities[ci].sides;
  const seats = activeSeats(state);
  const moves = [];
  for (let i = 0; i < seats.length; i++) {
    const from = seats[i];
    const to = seats[(i + 1) % seats.length];
    let pick = null;
    for (const u of sides[from]) {
      const p = powerOf(state, u);
      const turn = R.cards[u].turn;
      if (!pick || p > pick.p || (p === pick.p && turn >= pick.turn)) pick = { uid: u, p, turn };
    }
    if (pick && to !== from) moves.push({ uid: pick.uid, from, to });
  }
  if (!moves.length) return;
  for (const { uid, from, to } of moves) {
    sides[from].splice(sides[from].indexOf(uid), 1);
    sides[to].push(uid);
    R.cards[uid].owner = to;
    R.cards[uid].faceDown = false;
  }
  ev.push({ t: 'bridge', city: ci, moves });
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
  // Everything face down turns over, except a Decoy in Tangier: it stays down until Tangier has struck,
  // so it can still take the hit for its side (then it's revealed below).
  for (const city of R.cities)
    for (const side of city.sides)
      for (const u of side)
        if (R.cards[u].faceDown && !(R.cards[u].kind === 'decoy' && city.id === 'tangier')) {
          R.cards[u].faceDown = false;
          ev.push({ t: 'reveal', uid: u, kind: R.cards[u].kind });
        }
  R.cities.forEach((city, ci) => {
    if (city.id !== 'tangier') return;
    // Every unguarded agent at the top power among the unguarded ones, each through a Decoy. Skip one
    // already gone: a Decoy at the top power that stood in for another.
    const all = city.sides.flat().filter((u) => !guarded(state, u));
    if (all.length) {
      const top = Math.max(...all.map((u) => powerOf(state, u)));
      for (const u of all.filter((u) => powerOf(state, u) === top)) if (R.cards[u].city !== null) takeOut(state, stand(state, u, ev), ev, 'tangier');
    }
    // The Decoys Tangier didn't need turn over now.
    for (const side of city.sides)
      for (const u of side)
        if (R.cards[u].faceDown) {
          R.cards[u].faceDown = false;
          ev.push({ t: 'reveal', uid: u, kind: R.cards[u].kind });
        }
  });
  const totals = R.cities.map((_, ci) => cityTotals(state, ci));
  const cityWinners = R.cities.map((_, ci) => cityLeader(state, ci));
  const winner = roundWinner(R.cities.map((c) => c.id), cityWinners, totals, RULES.lisbonTiebreak, R.folded);
  const mi = R.cities.findIndex((c) => c.id === 'monaco');
  const monaco = mi >= 0 ? cityWinners[mi] : null;
  // Macau: the round's winner holding it scores the stake (before the final doubling) once more per time.
  let macau = null;
  if (winner !== null) for (let ci = 0; ci < R.cities.length; ci++) if (R.cities[ci].id === 'macau' && cityWinners[ci] === winner) macau = winner;
  const { stake, pot } = R;
  // A dead heat rolls the stake (not doubled) and the pot into the next round's pot.
  const carry = winner === null && RULES.rollover ? stake + pot : 0;
  R.pending = null;
  const extra = macau === null ? 0 : stake * CITY.macau.times;
  // `macau` last: Phase 2b-ii's key, so Classic results keep 2b-i's key order.
  R.result = { winner, points: winner === null ? 0 : stake * 2 + pot + extra, folded: null, cityWinners, totals, monaco, strip: stripFor(state, winner, cityWinners), stake, pot, carry, macau };
  ev.push({ t: 'round', ...R.result });
  award(state);
}

// ── what a seat may see ─────────────────────────────────────────────────────
/**
 * A card as `seat` sees it: rival face-down cards hide their identity and power. A card dropped as an
 * Accomplice's partner says so to everyone (`partner: true`, present only then), and so does a card a
 * `placed` twist put in place before the round (`placed: true`, present only then).
 */
export function cardView(state, uid, seat) {
  const c = state.round.cards[uid];
  const secret = c.faceDown && c.owner !== seat;
  const v = {
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
  if (c.partner) v.partner = true;
  if (c.placed) v.placed = true;
  return v;
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
  // This turn's wiretaps: who is tapping whom is public; the city a mark locks reaches its wiretapper only.
  const taps = state.phase === 'plan' ? R.taps.filter((t) => t.turn === R.turn) : [];
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
      called: R.called ? (R.called.free ? { by: R.called.by, answers: R.called.answers.slice(), free: true } : { by: R.called.by, answers: R.called.answers.slice() }) : null,
      folded: R.folded.slice(),
      cities: R.cities.map((city, ci) => ({
        id: city.id,
        first: city.first,
        open: state.phase === 'plan' ? cityOpen(state, ci) : false,
        capacity: capacityOf(city.id),
        sides: city.sides.map((side) => side.map((u) => cardView(state, u, seat))),
        leader: secretIn(city) ? null : cityLeader(state, ci),
        known: city.sides.map((side) =>
          city.id === 'rome' ? romeTotal(state, side, false, seat) : side.reduce((s, u) => s + (R.cards[u].faceDown && R.cards[u].owner !== seat ? 0 : powerOf(state, u)), 0),
        ),
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
      // Phase 2b-ii, last so Classic views keep 2b-i's key order. A mark that is unlocked, passing or folded shows no city.
      taps: taps.map((t) => ({ by: t.by, on: t.on })),
      tapped: player ? taps.filter((t) => t.by === seat).map((t) => ({ seat: t.on, city: R.plans[t.on] && !R.plans[t.on].pass ? R.plans[t.on].city : null })) : [],
      // A `seen` twist's cards, for the seat that saw them and the card's owner only. The watcher keeps the
      // kind even once the card has gone down face down; a card re-keyed on its way back to a hand drops out.
      exposed: player ? R.exposed.filter((e) => R.cards[e.uid] && (e.by === seat || R.cards[e.uid].owner === seat)).map((e) => ({ uid: e.uid, by: e.by, kind: R.cards[e.uid].kind })) : [],
    },
    // Phase 2b-ii, last so Classic views keep 2b-i's key order. Public: everyone plays the same roster.
    roster: state.roster.slice(),
    cityPool: state.cityPool.slice(),
    twist: state.twist ? { ...state.twist } : null,
  };
}
