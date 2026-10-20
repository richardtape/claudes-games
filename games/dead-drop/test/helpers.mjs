// Shared test helpers for engine rules at any table size.
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { AGENTS, CITIES, RULES } from '../js/data.js';

export const uidOf = (s, seat, kind) => Object.values(s.round.cards).find((c) => c.origin === seat && c.id0 === kind).uid;
/**
 * Put seat's card of this kind into its hand (from its deck), returning its uid. To keep the hand's size it
 * swaps out the first hand card not in `keep` (uids that must stay in the hand); if every card is kept, the
 * hand grows by one.
 */
export function give(s, seat, kind, { keep = [] } = {}) {
  const R = s.round;
  const uid = uidOf(s, seat, kind);
  if (!R.hands[seat].includes(uid)) {
    const i = R.decks[seat].indexOf(uid);
    const out = R.hands[seat].findIndex((u) => !keep.includes(u));
    if (out < 0 && R.hands[seat].length) R.decks[seat].splice(i, 1);
    else R.decks[seat][i] = R.hands[seat].splice(out, 1)[0];
    R.hands[seat].push(uid);
  }
  return uid;
}
/**
 * One move per seat ([kind, city], [kind, city, { partner, down }], or null to pass); seats already out or
 * passing are skipped. `partner` is a kind, put in the hand through give(); `partner` and `down` reach
 * lock() only when given. Resolves the turn.
 */
export function play(s, ...moves) {
  moves.forEach((mv, seat) => {
    if (s.round.folded?.[seat] || s.round.plans[seat]?.pass) return;
    if (!mv) {
      s.round.plans[seat] = { pass: true };
      return;
    }
    const [kind, city] = mv;
    const opts = mv[2] ?? {};
    const plan = { uid: give(s, seat, kind), city };
    if (opts.partner !== undefined) plan.partner = give(s, seat, opts.partner, { keep: [plan.uid] });
    if (opts.down !== undefined) plan.down = opts.down;
    assert.ok(E.lock(s, seat, plan), `seat ${seat} could not drop ${kind} in city ${city}${mv[2] ? ` with ${JSON.stringify(opts)}` : ''}`);
  });
  return E.resolveTurn(s);
}
export const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
/** Run fn with obj's fields patched, always restoring them. */
export function withPatch(obj, patch, fn) {
  const old = Object.fromEntries(Object.keys(patch).map((k) => [k, obj[k]]));
  Object.assign(obj, patch);
  try {
    return fn();
  } finally {
    Object.assign(obj, old);
  }
}
export const withRules = (patch, fn) => withPatch(RULES, patch, fn);

export const ALL_AGENTS = AGENTS.map((a) => a.id);
export const ALL_CITIES = CITIES.map((c) => c.id);

/** A match whose roster is every agent (each seat holds one of all 20), dealing `cities` in round 1. */
export const mixed = (cities, { seats = 2, seed = 7, ...o } = {}) => E.newMatch({ seed, seats, cities, roster: ALL_AGENTS, ...o });

/** The card of this kind that seat was dealt (found by origin, so it follows the card across owners). */
export const cardOf = (s, seat, kind) => s.round.cards[uidOf(s, seat, kind)];

/** Has seat's card of this kind been taken out (it sits in any gone list)? */
export const isOut = (s, seat, kind) => {
  const uid = uidOf(s, seat, kind);
  return s.round.gone.some((g) => g.includes(uid));
};

/**
 * Make seat's hand exactly these kinds (in this order): seat's own cards (by origin and id0, as give() and
 * uidOf() find them), taken from its hand or deck; the old hand's other cards go to the end of its deck.
 * Unlike give(), it can build a hand of any size. Returns the uids.
 */
export function setHand(s, seat, kinds) {
  const R = s.round;
  const from = [...R.hands[seat], ...R.decks[seat]];
  const uids = [];
  for (const kind of kinds) {
    const uid = from.find((u) => R.cards[u].origin === seat && R.cards[u].id0 === kind && !uids.includes(u));
    assert.ok(uid, `seat ${seat} has no ${kind} in its hand or deck`);
    uids.push(uid);
  }
  const others = R.hands[seat].filter((u) => !uids.includes(u));
  R.decks[seat] = [...R.decks[seat].filter((u) => !uids.includes(u)), ...others];
  R.hands[seat] = uids;
  return uids;
}
