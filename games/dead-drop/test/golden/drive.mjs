// Drives a seeded two-player bot match with a given engine/bot module pair, recording the full
// state, the call's return and the views for seats 0, 1 and -1 after every call.
import { createHash } from 'node:crypto';
import { createRng } from '../../../../shared/rng.js';
import { RIVALS } from '../../js/data.js';

export const GOLDEN_SAMPLES = 2;
export const GOLDEN_MAX_ROUNDS = 40;

export function driveMatch(E, B, index, { samples = GOLDEN_SAMPLES } = {}) {
  const bots = [RIVALS[index % 5], RIVALS[(index + 2) % 5]].map((r) => ({ ...r, samples }));
  const rng = createRng(`golden:${index}:bots`);
  const state = E.newMatch({ seed: `golden:${index}` });
  const steps = [];
  const record = (seat, call, arg, ret) =>
    steps.push({ round: state.roundNo, turn: state.round.turn, seat, call, json: JSON.stringify({ arg, ret, state, views: [0, 1, -1].map((s) => E.viewFor(state, s)) }) });
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
