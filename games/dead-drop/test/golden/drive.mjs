// Drives a seeded two-player bot match with a given engine/bot module pair, recording the full
// state, the call's return and the views for seats 0, 1 and -1 after every call.
import { createHash } from 'node:crypto';
import { createRng } from '../../../../shared/rng.js';
import { RIVALS } from '../../js/data.js';

export const GOLDEN_SAMPLES = 2;
export const GOLDEN_MAX_ROUNDS = 40;

/** Keys Phase 2b-ii adds to state, views and calls. Classic play never sets them, but later code may
 *  write them with default values, so comparisons strip them at any depth. */
export const NEW_KEYS = Object.freeze(['roster', 'cityPool', 'twist', 'taps', 'tapped', 'exposed', 'macau', 'partner', 'partnerOf', 'placed', 'down', 'free']);

/** A deep copy of a JSON value without any object key in NEW_KEYS, everything else in order. */
export function project(value) {
  if (Array.isArray(value)) return value.map(project);
  if (value === null || typeof value !== 'object') return value;
  const out = {};
  for (const k of Object.keys(value)) if (!NEW_KEYS.includes(k)) out[k] = project(value[k]);
  return out;
}

export function driveMatch(E, B, index, { samples = GOLDEN_SAMPLES } = {}) {
  const bots = [RIVALS[index % 5], RIVALS[(index + 2) % 5]].map((r) => ({ ...r, samples }));
  const rng = createRng(`golden:${index}:bots`);
  const state = E.newMatch({ seed: `golden:${index}` });
  const steps = [];
  const record = (seat, call, arg, ret) =>
    steps.push({ round: state.roundNo, turn: state.round.turn, seat, call, json: JSON.stringify(project({ arg, ret, state, views: [0, 1, -1].map((s) => E.viewFor(state, s)) })) });
  record(null, 'newMatch', null, null);
  for (let rounds = 0; ; ) {
    while (state.phase === 'plan') {
      const R = state.round;
      const thoughts = [0, 1].map((seat) => (R.plans[seat] ? null : B.think(E.viewFor(state, seat), { samples, noise: bots[seat].noise, rng })));
      for (const seat of [R.initiative, 1 - R.initiative]) {
        if (state.phase !== 'plan') break;
        const call = B.stakeCall(E.viewFor(state, seat), thoughts[seat]?.value ?? 0, bots[seat], rng);
        if (call === 'fold') record(seat, 'fold', null, E.fold(state, seat));
        else if (call === 'escalate' && E.canEscalate(state, seat)) {
          record(seat, 'escalate', null, E.escalate(state, seat));
          // Every seat the call asks answers in turn; the last answer settles it.
          for (const other of state.round.pending.from) {
            const accept = B.stakeCall(E.viewFor(state, other), thoughts[other]?.value ?? 0, bots[other], rng) === 'accept';
            record(other, 'respond', accept, E.respond(state, other, accept));
          }
        }
      }
      if (state.phase !== 'plan') break;
      for (const seat of [0, 1]) if (thoughts[seat]) record(seat, 'lock', thoughts[seat].drop, E.lock(state, seat, thoughts[seat].drop));
      record(null, 'resolveTurn', null, E.resolveTurn(state));
    }
    if (state.phase === 'match-over' || ++rounds >= GOLDEN_MAX_ROUNDS) break;
    record(null, 'nextRound', null, E.nextRound(state));
  }
  return steps;
}

/** SHA-256 (hex) of each round's step jsons joined with newlines, in round order. */
export function roundDigests(steps) {
  const byRound = new Map();
  for (const s of steps) {
    if (!byRound.has(s.round)) byRound.set(s.round, []);
    byRound.get(s.round).push(s.json);
  }
  return [...byRound.entries()].sort((a, b) => a[0] - b[0]).map(([, js]) => createHash('sha256').update(js.join('\n')).digest('hex'));
}

/** Path of the first difference between two parsed JSON values (key order counts), or null. */
export function firstDiff(a, b, path = '$') {
  if (a === b) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return path;
  if (Array.isArray(a)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (i >= a.length || i >= b.length) return `${path}[${i}]`;
      const d = firstDiff(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    if (ka[i] !== kb[i]) return `${path}.${ka[i] ?? kb[i]} (key order or presence)`;
    const d = firstDiff(a[ka[i]], b[kb[i]], `${path}.${ka[i]}`);
    if (d) return d;
  }
  return null;
}
