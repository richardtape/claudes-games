// Shared test helpers for engine rules at any table size.
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { RULES } from '../js/data.js';

export const uidOf = (s, seat, kind) => Object.values(s.round.cards).find((c) => c.origin === seat && c.id0 === kind).uid;
/** Put seat's card of this kind into its hand (from its deck), returning its uid. */
export function give(s, seat, kind) {
  const R = s.round;
  const uid = uidOf(s, seat, kind);
  if (!R.hands[seat].includes(uid)) {
    const i = R.decks[seat].indexOf(uid);
    R.decks[seat][i] = R.hands[seat].shift();
    R.hands[seat].push(uid);
  }
  return uid;
}
/** One move per seat ([kind, city], or null to pass); seats already out or passing are skipped. Resolves the turn. */
export function play(s, ...moves) {
  moves.forEach((mv, seat) => {
    if (s.round.folded?.[seat] || s.round.plans[seat]?.pass) return;
    if (!mv) s.round.plans[seat] = { pass: true };
    else assert.ok(E.lock(s, seat, { uid: give(s, seat, mv[0]), city: mv[1] }), `seat ${seat} could not drop ${mv[0]} in city ${mv[1]}`);
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
