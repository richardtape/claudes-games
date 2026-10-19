// Plays seeded bot-vs-bot matches and folds them into stats.
import * as E from '../../js/engine.js';
import { think, stakeCall } from '../../js/bot.js';
import { CITIES } from '../../js/data.js';
import { createRng } from '../../../../shared/rng.js';
import { MAX_ROUNDS, withPatches } from './config.mjs';
import { emptyStats, addMatch } from './stats.mjs';

/** Plays one round between two bots from the state's current round. */
function playRound(state, bots, rng) {
  const played = [[], []];
  const escalations = [];
  while (state.phase === 'plan') {
    const R = state.round;
    const thoughts = [0, 1].map((seat) => (R.plans[seat] ? null : think(E.viewFor(state, seat), { samples: bots[seat].samples, noise: bots[seat].noise, rng })));
    for (const seat of [R.initiative, 1 - R.initiative]) {
      if (state.phase !== 'plan') break;
      const value = thoughts[seat]?.value ?? 0;
      const call = stakeCall(E.viewFor(state, seat), value, bots[seat], rng);
      if (call === 'fold') E.fold(state, seat);
      else if (call === 'escalate' && E.escalate(state, seat)) {
        const other = 1 - seat;
        const ov = thoughts[other]?.value ?? 0;
        const answer = stakeCall(E.viewFor(state, other), ov, bots[other], rng) === 'accept' ? 'accept' : 'fold';
        escalations.push({ seat, turn: R.turn, value, answer });
        E.respond(state, other, answer === 'accept');
      }
    }
    if (state.phase !== 'plan') break;
    for (const seat of [0, 1]) {
      if (thoughts[seat]) {
        const d = thoughts[seat].drop;
        if (!d.pass) played[seat].push({ kind: state.round.cards[d.uid].kind, turn: R.turn, city: R.cities[d.city].id });
        E.lock(state, seat, d);
      }
    }
    E.resolveTurn(state);
  }
  const result = JSON.parse(JSON.stringify(state.round.result));
  const cw = result.cityWinners;
  const tiebreak = result.folded === null && !!cw && cw.filter((w) => w === 0).length === cw.filter((w) => w === 1).length;
  return { cities: state.round.cities.map((c) => c.id), result, tiebreak, played, escalations, scores: state.scores.slice() };
}

/** Three cities for a pinned match: the pinned ones, filled from the rest, in the bots' rng order. */
function pinnedCities(pin, rng) {
  const rest = rng.shuffle(CITIES.map((c) => c.id).filter((id) => !pin.includes(id)));
  return rng.shuffle([...pin, ...rest.slice(0, 3 - pin.length)]);
}

/** One whole match, replayable from (config, index). Assumes the config's patches are applied. */
export function playMatch(config, index) {
  if (config.bots.length !== 2) throw new Error('the Phase 1 engine plays 2 seats');
  const swapped = index % 2 === 1;
  const bots = swapped ? [config.bots[1], config.bots[0]] : config.bots;
  const rng = createRng(`${config.seed}:${index}:bots`);
  const pick = () => (config.pin.length ? pinnedCities(config.pin, rng) : null);
  const state = E.newMatch({ seed: `${config.seed}:${index}`, target: config.target, cities: pick() });
  const rounds = [];
  while (true) {
    rounds.push(playRound(state, bots, rng));
    if (state.phase === 'match-over' || rounds.length >= MAX_ROUNDS) break;
    if (config.pin.length) {
      state.roundNo++;
      E.startRound(state, { cities: pick() });
    } else E.nextRound(state);
  }
  const over = state.phase === 'match-over';
  return { index, swapped, winner: over ? state.winner : null, scores: state.scores.slice(), capped: !over, rounds };
}

/** Plays matches start .. start + count - 1 and returns their stats. */
export function playBatch(config, start, count) {
  return withPatches(config.set, () => {
    const stats = emptyStats();
    for (let i = start; i < start + count; i++) addMatch(stats, playMatch(config, i));
    return { stats, rounds: stats.rounds };
  });
}
