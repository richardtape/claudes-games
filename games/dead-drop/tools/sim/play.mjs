// Plays seeded bot-vs-bot matches and folds them into stats.
import * as E from '../../js/engine.js';
import { think, stakeCall } from '../../js/bot.js';
import { matchOptions } from '../../js/roster.js';
import { createRng } from '../../../../shared/rng.js';
import { MAX_ROUNDS, setupOf, withPatches } from './config.mjs';
import { emptyStats, addMatch } from './stats.mjs';

/**
 * Does `seat` wiretap a mark this turn that hasn't locked in (a folded or passing mark has), and that isn't
 * wiretapping `seat` back? Such a seat chooses after the others lock, as attachBot's tap wait does. Reads the
 * state the way session.js's waitingOnMark reads the seat's view (`tapped`, `taps`, `locked`).
 */
function waitsOnMark(R, seat) {
  for (const t of R.taps) {
    if (t.turn !== R.turn || t.by !== seat || R.plans[t.on]) continue;
    let back = false;
    for (const u of R.taps) if (u.turn === R.turn && u.by === t.on && u.on === seat) back = true;
    if (!back) return true;
  }
  return false;
}

/** Plays one round between the bots (one per seat) from the state's current round. */
function playRound(state, bots, rng) {
  const n = E.seatCount(state);
  const seats = Array.from({ length: n }, (_, i) => i);
  const played = seats.map(() => []);
  const escalations = [];
  const film = state.round.film;
  const tokensAtStart = state.tokens.slice();
  const thinkFor = (seat) => think(E.viewFor(state, seat), { samples: bots[seat].samples, noise: bots[seat].noise, rng });
  while (state.phase === 'plan') {
    const R = state.round;
    const thoughts = seats.map(() => null);
    // Seats think, call and lock in groups: with no wiretaps, one group (every seat), as before. A seat waiting
    // on its mark goes in a later group and thinks with a fresh view; seats that all wait on each other go
    // together. `todo` holds the seats left for later groups.
    let todo = seats;
    // A seat left for later that must answer a call answers from what it sees now (as attachBot's does), then
    // thinks again for its drop in its own group.
    const valueOf = (seat) => thoughts[seat]?.value ?? (todo.includes(seat) && !R.plans[seat] ? thinkFor(seat).value : 0);
    while (todo.length && state.phase === 'plan') {
      const later = R.taps.length ? todo.filter((seat) => !R.plans[seat] && waitsOnMark(R, seat)) : [];
      const group = later.length && later.length < todo.length ? todo.filter((seat) => !later.includes(seat)) : todo;
      todo = group === todo ? [] : later;
      for (const seat of group) if (!R.plans[seat]) thoughts[seat] = thinkFor(seat);
      for (const seat of E.turnOrder(n, R.initiative)) {
        if (state.phase !== 'plan') break;
        if (!group.includes(seat) || state.round.folded[seat]) continue;
        const value = thoughts[seat]?.value ?? 0;
        const call = stakeCall(E.viewFor(state, seat), value, bots[seat], rng);
        if (call === 'fold') E.fold(state, seat);
        else if (call === 'escalate' && E.escalate(state, seat)) {
          // Every seat the call asks answers, in table order; the last answer settles it (pending → null).
          const record = { seat, turn: R.turn, value, answers: [] };
          for (const other of state.round.pending.from) {
            const accept = stakeCall(E.viewFor(state, other), valueOf(other), bots[other], rng) === 'accept';
            record.answers.push({ seat: other, call: accept ? 'accept' : 'fold' });
            E.respond(state, other, accept);
          }
          escalations.push(record);
        }
      }
      if (state.phase !== 'plan') break;
      for (const seat of group) {
        if (thoughts[seat]) {
          const d = thoughts[seat].drop;
          // A seat that folded this turn can't lock: no drop is recorded for it. A partner counts as played too.
          const kind = d.pass ? null : state.round.cards[d.uid].kind;
          const partner = d.partner ? state.round.cards[d.partner].kind : null;
          if (E.lock(state, seat, d) && !d.pass) {
            played[seat].push({ kind, turn: R.turn, city: R.cities[d.city].id });
            if (partner) played[seat].push({ kind: partner, turn: R.turn, city: R.cities[d.city].id, partner: true });
          }
        }
      }
    }
    if (state.phase !== 'plan') break;
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

/** Three cities for a pinned match: the pinned ones, filled from the rest of the match's pool, in the bots' rng order. */
function pinnedCities(pin, pool, rng) {
  const rest = rng.shuffle(pool.filter((id) => !pin.includes(id)));
  return rng.shuffle([...pin, ...rest.slice(0, 3 - pin.length)]);
}

/**
 * One whole match, replayable from (config, index). Assumes the config's patches are applied. The roster is
 * drawn from its own rng (`seed:index:setup`), so a Classic match deals exactly as before; a setup's twist goes
 * to bot B's seat under this index's rotation, or nowhere with `twist: 'off'`.
 */
export function playMatch(config, index) {
  const n = config.bots.length;
  if (n < 2 || n > 4) throw new Error('seats must be 2 to 4');
  const rotation = index % n;
  const bots = Array.from({ length: n }, (_, s) => config.bots[(s + rotation) % n]);
  const rng = createRng(`${config.seed}:${index}:bots`);
  // Bot B (config.bots[1]) sits in seat (1 - rotation) mod n.
  const opts = matchOptions(setupOf(config), createRng(`${config.seed}:${index}:setup`), (n + 1 - rotation) % n);
  if (config.twist === 'off') opts.twist = null;
  const pick = (pool) => (config.pin.length ? pinnedCities(config.pin, pool, rng) : null);
  const state = E.newMatch({ seed: `${config.seed}:${index}`, target: config.target, cities: pick(opts.pool), seats: n, ...opts });
  const rounds = [];
  while (true) {
    rounds.push(playRound(state, bots, rng));
    if (state.phase === 'match-over' || rounds.length >= MAX_ROUNDS) break;
    if (config.pin.length) {
      state.roundNo++;
      E.startRound(state, { cities: pick(state.cityPool) });
    } else E.nextRound(state);
  }
  const over = state.phase === 'match-over';
  return { index, rotation, winner: over ? state.winner : null, winBy: over ? state.winBy : null, scores: state.scores.slice(), strips: state.strips.slice(), tokens: state.tokens.slice(), capped: !over, rounds, roster: state.roster.slice(), twistSeat: state.twist ? state.twist.seat : null };
}

/** Plays matches start .. start + count - 1 and returns their stats. */
export function playBatch(config, start, count) {
  return withPatches(config.set, () => {
    const stats = emptyStats(config.bots.length);
    for (let i = start; i < start + count; i++) addMatch(stats, playMatch(config, i));
    return { stats, rounds: stats.rounds };
  });
}
