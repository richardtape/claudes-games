// The one that got away (Phase 4): a round's record and the single-change replay. Pure, no DOM.
//
// A table keeps one record per round (session.js, Decision 1 of the Phase 4 plan): a deep copy of the state
// when the round's first act came, then for every turn the acts that changed the stakes (escalations, answers,
// folds) and the plans every seat locked. Replaying the record runs the engine again from the copy, acts first,
// then the plans, and lands where the round did: the engine is pure and its RNG lives in the state.
//
// gotAway() replays a lost round with one of a seat's drops changed, everything else as recorded, and finds the
// single change that would have won it (Decisions 2 and 3). The seat's own later drops stand too, except that a
// later drop of the card the change plays early uses the card it replaced (the swap rule). An alternative under
// which a recorded act or lock is refused, the turns fall out of step, or a turn can't resolve (a call it opened
// that nobody answered) doesn't count; it never throws.
import * as E from './engine.js';
import { AGENT, CITY } from './data.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

/** May a record start here: planning turn 1 with no plan but a pass, nothing escalated, no call waiting. */
export function canStart(state) {
  const R = state.round;
  return state.phase === 'plan' && !!R && R.turn === 1 && R.plans.every((p) => !p || !!p.pass) && !R.escalated.some(Boolean) && !R.pending;
}

/** A round's record, starting from a deep copy of `state` (its history left out). */
export function newRecord(state, { match, round }) {
  return { match, round, start: clone({ ...state, history: [] }), turns: [], open: [], events: [] };
}

/** Note an act that changed the stakes (escalate, respond with its answer, fold); every other act is ignored. */
export function noteAct(rec, seat, a) {
  if (a.a === 'escalate' || a.a === 'fold') rec.open.push({ seat, a: a.a });
  else if (a.a === 'respond') rec.open.push({ seat, a: 'respond', accept: !!a.accept });
}

/** Close the turn whose plans are all in (call it only when E.ready(state), before resolving). */
export function recordTurn(rec, state) {
  rec.turns.push({ turn: state.round.turn, acts: rec.open, plans: state.round.plans.map((p) => ({ ...p })) });
  rec.open = [];
}

/** Add a resolved turn's events (resolveTurn's return value) to the round's. */
export function noteEvents(rec, events) {
  for (const e of clone(events)) rec.events.push(e);
}

/** Apply turn T's recorded acts to `s`. False if `s` isn't planning turn T or an act is refused. */
function openTurn(s, T) {
  if (s.phase !== 'plan' || s.round.turn !== T.turn) return false;
  for (const x of T.acts) {
    const ok = x.a === 'escalate' ? E.escalate(s, x.seat) : x.a === 'respond' ? E.respond(s, x.seat, x.accept) : x.a === 'fold' ? E.fold(s, x.seat) : false;
    if (!ok) return false;
  }
  return true;
}

/** The card a later plan of the changed seat names, after the swap rule: the change's card plays the one it replaced. */
const swapUid = (u, alt, was) => (u === alt.uid && alt.uid !== was.uid ? was.uid : alt.partner && was.partner && u === alt.partner && alt.partner !== was.partner ? was.partner : u);

function swapped(p, alt, was) {
  if (p.pass) return p;
  const uid = swapUid(p.uid, alt, was);
  const partner = p.partner === undefined ? undefined : swapUid(p.partner, alt, was);
  if (uid === p.uid && partner === p.partner) return p;
  const q = { ...p, uid };
  if (partner !== undefined) q.partner = partner;
  return q;
}

/**
 * Lock every seat still unlocked with its recorded plan (`seat`'s through the swap rule, when `alt` is given),
 * then resolve the turn. A seat already set (a pass: no legal drop, or a fold) must have recorded a pass, except
 * `changed`, the seat that has just locked the change.
 */
function closeTurn(s, T, seat = -1, alt = null, was = null, changed = -1) {
  const plans = s.round.plans;
  for (let p = 0; p < T.plans.length; p++) {
    if (plans[p]) {
      if (p !== changed && !T.plans[p].pass) return false;
      continue;
    }
    if (!E.lock(s, p, p === seat && alt ? swapped(T.plans[p], alt, was) : T.plans[p])) return false;
  }
  if (!E.ready(s)) return false;
  E.resolveTurn(s);
  return true;
}

/** After `seat` locked `alt` in place of `was` on recorded turn k: the rest of turn k and every later turn. */
function playOn(s, turns, k, seat, alt, was) {
  if (!closeTurn(s, turns[k], -1, null, null, seat)) return false;
  for (let j = k + 1; j < turns.length; j++) {
    if (!openTurn(s, turns[j])) return false;
    if (s.phase !== 'plan') return true;
    if (!closeTurn(s, turns[j], seat, alt, was)) return false;
  }
  return true;
}

/**
 * The round replayed from its record: as played, or with `alter` ({ turn, seat, plan }): `seat` locks `plan` on
 * that turn instead of its recorded drop, and its later plans follow the swap rule. Null when the replay can't
 * follow the record (an act or a lock refused, the turns out of step, a turn that can't resolve) or the change
 * can't be made (no such turn, the seat already set: passing or folded). Returns the replayed state, at the
 * round's end when the record is complete.
 */
export function replayRound(rec, alter = null) {
  const s = clone(rec.start);
  const turns = rec.turns;
  const k = alter ? turns.findIndex((T) => T.turn === alter.turn) : turns.length;
  if (k < 0) return null;
  for (let j = 0; j < k; j++) {
    if (!openTurn(s, turns[j])) return null;
    if (s.phase !== 'plan') return alter ? null : s;
    if (!closeTurn(s, turns[j])) return null;
  }
  if (!alter) return s;
  const was = turns[k].plans[alter.seat];
  if (!was || !openTurn(s, turns[k]) || s.phase !== 'plan' || s.round.plans[alter.seat] || !E.lock(s, alter.seat, alter.plan)) return null;
  return playOn(s, turns, k, alter.seat, alter.plan, was) ? s : null;
}

const sameDrop = (a, b) => a.uid === b.uid && a.city === b.city && (a.partner ?? null) === (b.partner ?? null) && !!a.down === !!b.down;

/** A plan with the kinds of its cards, as they were in hand that turn. */
function described(s, p) {
  const d = { ...p, kind: s.round.cards[p.uid].kind };
  if (p.partner) d.partnerKind = s.round.cards[p.partner].kind;
  return d;
}

/**
 * The one that got away for `seat`: `{ turn, was, instead, held }` or null. Only for a round that ended at the
 * flip with a winner other than `seat` and nobody folded (Decision 2), replayed from its record (and, given the
 * round's actual `result`, only when the replay reaches it). Tries every other legal drop of `seat` on each turn
 * it dropped, latest turn first, and stops at the first turn with a winning change. Among those (Decision 3): the
 * same card to another city, then the same city (another card, a partner or a face), then both changed; then the
 * most cities held; then legalDrops order. `was` and `instead` are the drops with `kind` (and `partnerKind`);
 * `held` is how many cities `seat` holds with the change.
 */
export function gotAway(rec, seat, { result = null } = {}) {
  const turns = rec.turns;
  const pre = [];
  const s = clone(rec.start);
  for (const T of turns) {
    pre.push(clone(s));
    if (!openTurn(s, T)) return null;
    if (s.phase !== 'plan') break;
    if (!closeTurn(s, T)) return null;
  }
  if (s.phase === 'plan' || !Number.isInteger(seat) || seat < 0 || seat >= E.seatCount(s)) return null;
  const res = s.round.result;
  if (res.folded !== null || res.winner === null || res.winner === seat || s.round.folded.some(Boolean)) return null;
  if (result && JSON.stringify(res) !== JSON.stringify(result)) return null;
  for (let k = turns.length - 1; k >= 0; k--) {
    const was = turns[k].plans[seat];
    if (!was || was.pass) continue;
    // Turn k's start, kept from the replay above: used once, so its acts go straight onto it.
    const base = pre[k];
    if (!openTurn(base, turns[k]) || base.phase !== 'plan' || base.round.plans[seat]) continue;
    let best = null;
    for (const alt of E.legalDrops(base, seat)) {
      if (sameDrop(alt, was)) continue;
      const out = clone(base);
      if (!E.lock(out, seat, alt) || !playOn(out, turns, k, seat, alt, was) || out.phase === 'plan') continue;
      const r = out.round.result;
      if (r.winner !== seat) continue;
      const rank = alt.uid === was.uid && alt.city !== was.city ? 0 : alt.city === was.city ? 1 : 2;
      let held = 0;
      if (r.cityWinners) for (const w of r.cityWinners) if (w === seat) held++;
      if (!best || rank < best.rank || (rank === best.rank && held > best.held)) best = { rank, held, alt };
    }
    if (best) return { turn: turns[k].turn, was: described(base, was), instead: described(base, best.alt), held: best.held };
  }
  return null;
}

const agentName = (kind) => AGENT[kind]?.name ?? String(kind);
const cityName = (ids, ci) => CITY[ids[ci]]?.name ?? String(ids[ci]);

/**
 * The line in words, for the round's `cityIds`: "Turn 4: Heavy to Tangier instead of Monaco would have won the
 * round." when only the city changes (or Casablanca's face), and otherwise with articles: "Turn 2: the Mole to
 * Berlin instead of the Heavy …", "… the Sleeper to Berlin instead of the Heavy to Istanbul …". Casablanca says
 * the face ("the Sleeper face down in Casablanca"), an Accomplice its partner ("the Accomplice with the Mole").
 */
export function gotAwayText(g, cityIds) {
  const { was, instead } = g;
  const byUid = was.uid !== undefined && instead.uid !== undefined;
  const sameCard = byUid ? was.uid === instead.uid : was.kind === instead.kind;
  const samePartner = byUid ? (was.partner ?? null) === (instead.partner ?? null) : (was.partnerKind ?? null) === (instead.partnerKind ?? null);
  const casablanca = (p) => cityIds[p.city] === 'casablanca';
  const face = (p) => `face ${p.down ? 'down' : 'up'}`;
  const where = (p) => (casablanca(p) ? `${face(p)} in ${cityName(cityIds, p.city)}` : `to ${cityName(cityIds, p.city)}`);
  // The same card with another partner (or none): the side without one says so.
  const who = (p, the = 'the ') => `${the}${agentName(p.kind)}${p.partnerKind ? ` with the ${agentName(p.partnerKind)}` : sameCard && !samePartner ? ' alone' : ''}`;
  let body;
  if (sameCard && samePartner) {
    const before = was.city !== instead.city ? (casablanca(was) ? where(was) : cityName(cityIds, was.city)) : face(was);
    body = `${who(instead, '')} ${where(instead)} instead of ${before}`;
  } else if (was.city === instead.city && !!was.down === !!instead.down) body = `${who(instead)} ${where(instead)} instead of ${who(was)}`;
  else body = `${who(instead)} ${where(instead)} instead of ${who(was)} ${where(was)}`;
  return `Turn ${g.turn}: ${body} would have won the round.`;
}
