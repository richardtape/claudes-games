// Plays seeded bot-vs-bot matches and folds them into stats.
import * as E from '../../js/engine.js';
import { think, stakeCall } from '../../js/bot.js';
import { CITIES } from '../../js/data.js';
import { createRng } from '../../../../shared/rng.js';
import { MAX_ROUNDS, withPatches } from './config.mjs';
import { emptyStats, addMatch } from './stats.mjs';

/** Plays one round between the bots (one per seat) from the state's current round. */
function playRound(state, bots, rng) {
  const n = E.seatCount(state);
  const seats = Array.from({ length: n }, (_, i) => i);
  const played = seats.map(() => []);
  const escalations = [];
  const film = state.round.film;
  const tokensAtStart = state.tokens.slice();
  while (state.phase === 'plan') {
    const R = state.round;
    const thoughts = seats.map((seat) => (R.plans[seat] ? null : think(E.viewFor(state, seat), { samples: bots[seat].samples, noise: bots[seat].noise, rng })));
    for (const seat of E.turnOrder(n, R.initiative)) {
      if (state.phase !== 'plan') break;
      if (state.round.folded[seat]) continue;
      const value = thoughts[seat]?.value ?? 0;
      const call = stakeCall(E.viewFor(state, seat), value, bots[seat], rng);
      if (call === 'fold') E.fold(state, seat);
      else if (call === 'escalate' && E.escalate(state, seat)) {
        // Every seat the call asks answers, in table order; the last answer settles it (pending → null).
        const record = { seat, turn: R.turn, value, answers: [] };
        for (const other of state.round.pending.from) {
          const accept = stakeCall(E.viewFor(state, other), thoughts[other]?.value ?? 0, bots[other], rng) === 'accept';
          record.answers.push({ seat: other, call: accept ? 'accept' : 'fold' });
          E.respond(state, other, accept);
        }
        escalations.push(record);
      }
    }
    if (state.phase !== 'plan') break;
    for (const seat of seats) {
      if (thoughts[seat]) {
        const d = thoughts[seat].drop;
        // A seat that folded this turn can't lock: no drop is recorded for it.
        const kind = d.pass ? null : state.round.cards[d.uid].kind;
        if (E.lock(state, seat, d) && !d.pass) played[seat].push({ kind, turn: R.turn, city: R.cities[d.city].id });
      }
    }
    E.resolveTurn(state);
  }
  const result = JSON.parse(JSON.stringify(state.round.result));
  const cw = result.cityWinners;
  const tiebreak = result.folded === null && !!cw && (() => {
    const wins = seats.map((s) => cw.filter((w) => w === s).length);
    return wins.filter((x) => x === Math.max(...wins)).length >= 2;
  })();
  return { cities: state.round.cities.map((c) => c.id), film, tokensAtStart, result, tiebreak, played, escalations, scores: state.scores.slice() };
}

/** Three cities for a pinned match: the pinned ones, filled from the rest, in the bots' rng order. */
function pinnedCities(pin, rng) {
  const rest = rng.shuffle(CITIES.map((c) => c.id).filter((id) => !pin.includes(id)));
  return rng.shuffle([...pin, ...rest.slice(0, 3 - pin.length)]);
}

/** One whole match, replayable from (config, index). Assumes the config's patches are applied. */
export function playMatch(config, index) {
  const n = config.bots.length;
  if (n < 2 || n > 4) throw new Error('seats must be 2 to 4');
  const rotation = index % n;
  const bots = Array.from({ length: n }, (_, s) => config.bots[(s + rotation) % n]);
  const rng = createRng(`${config.seed}:${index}:bots`);
  const pick = () => (config.pin.length ? pinnedCities(config.pin, rng) : null);
  const state = E.newMatch({ seed: `${config.seed}:${index}`, target: config.target, cities: pick(), seats: n });
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
  return { index, rotation, winner: over ? state.winner : null, winBy: over ? state.winBy : null, scores: state.scores.slice(), strips: state.strips.slice(), tokens: state.tokens.slice(), capped: !over, rounds };
}

/** Plays matches start .. start + count - 1 and returns their stats. */
export function playBatch(config, start, count) {
  return withPatches(config.set, () => {
    const stats = emptyStats(config.bots.length);
    for (let i = start; i < start + count; i++) addMatch(stats, playMatch(config, i));
    return { stats, rounds: stats.rounds };
  });
}
