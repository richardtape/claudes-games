// Dead Drop rules. Pure state + functions, no DOM. The whole match is plain JSON (including
// the RNG position) so it can be saved, sent to the host, cloned for bot playouts and resumed.
//
// Flow: newMatch() → each turn every seat lock()s a drop → resolveTurn() returns events for
// the UI to animate → after turn 6 the round is scored → nextRound(). escalate()/respond()/
// fold() run alongside (two seats only, for now). viewFor(state, seat) is what a player is
// allowed to see.
//
// A table has 2 to 4 seats, numbered 0..n−1. "Rival agents" are every other seat's; a seat's
// "rival's drop" (Double Agent, Impostor) is its mark's drop. With two seats every rule is
// exactly the two-player game.
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

/** Who moves first on turn `turn` of round `roundNo`: round the table each turn, moved on each round. */
export const initiativeOf = (n, roundNo, turn) => (roundNo + turn - 1) % n;

/** The seat whose drop is `seat`'s "rival's drop" this round. Never itself; two seats mark each other. */
export const markOf = (n, seat, roundNo) => (seat + 1 + (roundNo % (n - 1))) % n;

// ── setup ───────────────────────────────────────────────────────────────────
export function newMatch({ seed = Date.now(), target = TARGET, cities = null, seats = 2 } = {}) {
  if (!Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS) throw new RangeError(`seats must be ${MIN_SEATS} to ${MAX_SEATS}, got ${seats}`);
  const state = {
    v: 1,
    seed: String(seed),
    rng: typeof seed === 'number' ? seed >>> 0 : hashString(String(seed)),
    target,
    scores: Array(seats).fill(0),
    roundNo: 0,
    phase: 'plan',
    round: null,
    history: [],
    winner: null,
  };
  startRound(state, { cities });
  return state;
}

export function startRound(state, { cities = null } = {}) {
  const no = state.roundNo;
  const n = seatCount(state);
  const cityIds = cities || rshuffle(state, CITIES.map((c) => c.id)).slice(0, 3);
  const cards = {};
  const decks = allSeats(n).map((seat) =>
    rshuffle(state, DECK).map((kind, i) => {
      const uid = `${'abcd'[seat]}${no}.${i}`;
      cards[uid] = { uid, kind, id0: kind, owner: seat, origin: seat, city: null, turn: 0, faceDown: false, hidden: false, bonus: 0 };
      return uid;
    }),
  );
  const hands = decks.map((d) => d.splice(0, START_HAND));
  state.round = {
    no,
    cities: cityIds.map((id) => ({ id, sides: allSeats(n).map(() => []), first: 0 })),
    cards,
    hands,
    decks,
    gone: allSeats(n).map(() => []),
    turn: 1,
    initiative: 0,
    plans: Array(n).fill(null),
    stake: 1,
    escalated: Array(n).fill(false),
    pending: null,
    events: [],
    result: null,
  };
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
  if (!R || state.phase !== 'plan' || !isSeat(state, seat)) return [];
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
// Stakes are two-player only for now: with more seats escalate, respond and fold refuse.
const stakesOpen = (state, seat) => seatCount(state) <= 2 && isSeat(state, seat) && state.phase === 'plan';

/** One escalation per round, by whoever calls it first. */
export const canEscalate = (state, seat) => stakesOpen(state, seat) && !state.round.escalated.some(Boolean) && !state.round.pending;

export function escalate(state, seat) {
  if (!canEscalate(state, seat)) return false;
  state.round.escalated[seat] = true;
  state.round.pending = { by: seat };
  return true;
}

/** The escalated-against seat answers: accept doubles the stake, decline folds. */
export function respond(state, seat, accept) {
  const R = state.round;
  if (!stakesOpen(state, seat) || !R.pending || R.pending.by === seat) return false;
  if (!accept) return fold(state, seat);
  R.stake *= 2;
  R.pending = null;
  return true;
}

export function fold(state, seat) {
  const R = state.round;
  if (!stakesOpen(state, seat)) return false;
  const winner = rivalsOf(2, seat)[0];
  R.pending = null;
  R.result = { winner, points: R.stake, folded: seat, cityWinners: null, totals: null, monaco: null };
  R.events = [{ t: 'fold', seat }];
  award(state);
  return true;
}

function award(state) {
  const R = state.round;
  const res = R.result;
  if (res.winner !== null) state.scores[res.winner] += res.points;
  if (res.monaco !== null && res.monaco !== undefined) state.scores[res.monaco] += 1;
  state.history.push({ no: R.no, cities: R.cities.map((c) => c.id), ...res, scores: state.scores.slice() });
  const winner = matchWinner(state.scores, state.target);
  if (winner !== null) {
    state.phase = 'match-over';
    state.winner = winner;
  } else state.phase = 'round-over';
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
        const back = R.cards[pick.uid];
        city.sides[seat].splice(city.sides[seat].indexOf(pick.uid), 1);
        Object.assign(back, { kind: back.id0, city: null, turn: 0, faceDown: false, hidden: false, bonus: 0, owner: seat });
        R.hands[seat].push(pick.uid);
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
 * initiative order round the table. Returns the events. A following turn where no seat can drop
 * anywhere resolves in the same call.
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
  const order = orderFrom(n, R.initiative);
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

  // Havana: at the end of turn 4 everyone there defects, passing one seat along (seat s's agents
  // go to seat s + 1; with two seats, a swap). Face-down agents turn over.
  if (R.turn === 4) {
    R.cities.forEach((city, ci) => {
      if (city.id !== 'havana' || city.sides.every((side) => !side.length)) return;
      city.sides.unshift(city.sides.pop());
      for (const seat of allSeats(n))
        for (const u of city.sides[seat]) {
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
 * The round goes to the single seat holding the most cities. Otherwise the tie-break totals
 * (see tiebreakTotals) decide among the tied seats only; a tie there is a dead heat (null).
 */
export function roundWinner(cityIds, cityWinners, totals, mode = RULES.lisbonTiebreak) {
  const seats = allSeats(widthOf(totals));
  const wins = seats.map((s) => cityWinners.filter((w) => w === s).length);
  const most = Math.max(...wins);
  const tied = seats.filter((s) => wins[s] === most);
  if (tied.length === 1) return tied[0];
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
  const winner = roundWinner(R.cities.map((c) => c.id), cityWinners, totals);
  const mi = R.cities.findIndex((c) => c.id === 'monaco');
  const monaco = mi >= 0 ? cityWinners[mi] : null;
  R.pending = null;
  R.result = { winner, points: winner === null ? 0 : R.stake * 2, folded: null, cityWinners, totals, monaco, stake: R.stake };
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
    origin: c.origin,
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
    roundNo: state.roundNo,
    phase: state.phase,
    winner: state.winner,
    history: state.history.map((h) => ({ ...h })),
    round: {
      no: R.no,
      turn: R.turn,
      initiative: R.initiative,
      stake: R.stake,
      escalated: R.escalated.slice(),
      pending: R.pending ? { ...R.pending } : null,
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
