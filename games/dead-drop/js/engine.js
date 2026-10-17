// Dead Drop rules. Pure state + functions, no DOM. The whole match is plain JSON (including
// the RNG position) so it can be saved, sent to the host, cloned for bot playouts and resumed.
//
// Flow: newMatch() → each turn both seats lock() a drop → resolveTurn() returns events for
// the UI to animate → after turn 6 the round is scored → nextRound(). escalate()/respond()/
// fold() run alongside. viewFor(state, seat) is what a player is allowed to see.
import { createRng, hashString } from '../../../shared/rng.js';
import { AGENT, CAPACITY, CITIES, CITY, DECK, MAX_HAND, START_HAND, TARGET, TURNS } from './data.js';

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

const other = (seat) => 1 - seat;

// ── setup ───────────────────────────────────────────────────────────────────
export function newMatch({ seed = Date.now(), target = TARGET, cities = null } = {}) {
  const state = {
    v: 1,
    seed: String(seed),
    rng: typeof seed === 'number' ? seed >>> 0 : hashString(String(seed)),
    target,
    scores: [0, 0],
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
  const cityIds = cities || rshuffle(state, CITIES.map((c) => c.id)).slice(0, 3);
  const cards = {};
  const decks = [0, 1].map((seat) =>
    rshuffle(state, DECK).map((kind, i) => {
      const uid = `${'ab'[seat]}${no}.${i}`;
      cards[uid] = { uid, kind, id0: kind, owner: seat, origin: seat, city: null, turn: 0, faceDown: false, hidden: false, bonus: 0 };
      return uid;
    }),
  );
  const hands = decks.map((d) => d.splice(0, START_HAND));
  state.round = {
    no,
    cities: cityIds.map((id) => ({ id, sides: [[], []], first: 0 })),
    cards,
    hands,
    decks,
    gone: [[], []],
    turn: 1,
    initiative: 0,
    plans: [null, null],
    stake: 1,
    escalated: [false, false],
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
  R.initiative = (R.no + R.turn + 1) % 2;
  R.plans = [null, null];
  for (const seat of [0, 1]) if (!legalDrops(state, seat).length) R.plans[seat] = { pass: true };
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
  if (!R || state.phase !== 'plan') return [];
  const out = [];
  for (const uid of R.hands[seat]) for (let ci = 0; ci < 3; ci++) if (canArrive(state, seat, ci)) out.push({ uid, city: ci });
  return out;
}

const cityOf = (state, card) => state.round.cities[card.city];

/** Does a rival Jammer (whose own trick works) sit in this card's city? */
function jammed(state, card) {
  if (card.kind === 'jammer') return false;
  const rivals = cityOf(state, card).sides[other(card.owner)];
  return rivals.some((u) => {
    const c = state.round.cards[u];
    return c.kind === 'jammer' && !c.hidden;
  });
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
  const theirs = city.sides[other(card.owner)];
  if (card.kind === 'veteran' && hasTricks(state, card) && mine.length === 1) p += 3;
  for (const u of mine) if (u !== uid && R.cards[u].kind === 'handler' && hasTricks(state, R.cards[u])) p += 1;
  for (const u of theirs) if (R.cards[u].kind === 'mole' && hasTricks(state, R.cards[u])) p -= 1;
  return Math.max(0, p);
}

export function cityTotals(state, ci) {
  const sides = state.round.cities[ci].sides;
  return sides.map((side) => side.reduce((s, u) => s + powerOf(state, u), 0));
}

/** Seat that holds the city right now, or null. */
export function cityLeader(state, ci) {
  const city = state.round.cities[ci];
  const [a, b] = cityTotals(state, ci);
  const has = city.sides.map((s) => s.length > 0);
  if (!has[0] && !has[1]) return null;
  if (has[0] !== has[1]) {
    // Only one side has agents: they win unless it's a zero-zero standoff in a normal city.
    const seat = has[0] ? 0 : 1;
    if (city.id === 'lisbon') return seat;
    return [a, b][seat] > 0 ? seat : null;
  }
  if (a === b) return null;
  if (city.id === 'lisbon') return a < b ? 0 : 1;
  return a > b ? 0 : 1;
}

// ── planning ────────────────────────────────────────────────────────────────
export function lock(state, seat, plan) {
  const R = state.round;
  if (state.phase !== 'plan' || !plan) return false;
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
  if (state.phase !== 'plan' || !R.plans[seat] || R.plans[seat].pass) return false;
  R.plans[seat] = null;
  return true;
}

export const ready = (state) => state.phase === 'plan' && !state.round.pending && state.round.plans.every(Boolean);

// ── stakes ──────────────────────────────────────────────────────────────────
/** One escalation per round, by whoever calls it first. */
export const canEscalate = (state, seat) => state.phase === 'plan' && !state.round.escalated.some(Boolean) && !state.round.pending;

export function escalate(state, seat) {
  if (!canEscalate(state, seat)) return false;
  state.round.escalated[seat] = true;
  state.round.pending = { by: seat };
  return true;
}

/** The escalated-against seat answers: accept doubles the stake, decline folds. */
export function respond(state, seat, accept) {
  const R = state.round;
  if (state.phase !== 'plan' || !R.pending || R.pending.by === seat) return false;
  if (!accept) return fold(state, seat);
  R.stake *= 2;
  R.pending = null;
  return true;
}

export function fold(state, seat) {
  const R = state.round;
  if (state.phase !== 'plan') return false;
  const winner = other(seat);
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
  const [a, b] = state.scores;
  const t = state.target;
  if ((a >= t || b >= t) && a !== b) {
    state.phase = 'match-over';
    state.winner = a > b ? 0 : 1;
  } else state.phase = 'round-over';
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
  const wire = city.sides[other(card.owner)].find((u) => {
    const w = R.cards[u];
    return w.kind === 'tripwire' && w.faceDown && hasTricks(state, w);
  });
  if (!wire) return true;
  R.cards[wire].faceDown = false;
  ev.push({ t: 'tripwire', uid: wire, victim: uid, city: ci });
  takeOut(state, uid, ev, 'tripwire');
  return false;
}

function strongestRival(state, card) {
  const R = state.round;
  let best = null;
  for (const u of cityOf(state, card).sides[other(card.owner)]) {
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
  const rivalPlan = R.plans[other(seat)];
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
 * Both seats have locked in: drop, spring traps, fire flip tricks, draw, advance. Returns the
 * events. A following turn where neither seat can drop anywhere resolves in the same call.
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
  const order = [R.initiative, other(R.initiative)];
  const dropped = [null, null];

  // Both cards land at once; Istanbul gives +3 to every agent that arrives on its first busy turn.
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

  // Havana: at the end of turn 4 everyone there defects (face-down agents turn over).
  if (R.turn === 4) {
    R.cities.forEach((city, ci) => {
      if (city.id !== 'havana' || (!city.sides[0].length && !city.sides[1].length)) return;
      city.sides.reverse();
      for (const seat of [0, 1])
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
    const all = [...city.sides[0], ...city.sides[1]];
    if (!all.length) return;
    const top = Math.max(...all.map((u) => powerOf(state, u)));
    for (const u of all.filter((u) => powerOf(state, u) === top)) takeOut(state, u, ev, 'tangier');
  });
  const totals = R.cities.map((_, ci) => cityTotals(state, ci));
  const cityWinners = R.cities.map((_, ci) => cityLeader(state, ci));
  const wins = [0, 1].map((s) => cityWinners.filter((w) => w === s).length);
  let winner = null;
  if (wins[0] !== wins[1]) winner = wins[0] > wins[1] ? 0 : 1;
  else {
    const sum = [0, 1].map((s) => totals.reduce((t, x) => t + x[s], 0));
    if (sum[0] !== sum[1]) winner = sum[0] > sum[1] ? 0 : 1;
  }
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

/** What `seat` may see. Any other seat (e.g. -1) is a spectator: no hand, every face-down card hidden. */
export function viewFor(state, seat) {
  const R = state.round;
  const player = seat === 0 || seat === 1;
  const rival = other(seat);
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
      rivalLocked: player && !!R.plans[rival],
      locked: R.plans.map(Boolean),
      legal: player ? legalDrops(state, seat) : [],
      events: R.events.map((e) => maskEvent(e, seat)),
      result: R.result ? JSON.parse(JSON.stringify(R.result)) : null,
    },
  };
}
