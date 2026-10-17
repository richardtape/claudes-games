#!/usr/bin/env node
// Bot-vs-bot simulator for balancing Dead Drop.
//
//   node games/dead-drop/tools/sim.mjs                     cards/cities/stakes report (mid bots)
//   node games/dead-drop/tools/sim.mjs --ladder            every rival against every other
//   node games/dead-drop/tools/sim.mjs --rounds 400 --samples 10 --a heron --b heron
//   node games/dead-drop/tools/sim.mjs --set sleeper.power=4      try a tweak without editing data.js
//
// Agent stats compare round win rate when a seat played that agent vs when it didn't
// (folded rounds excluded). City stats show how often a city was decided and how often its
// winner took the round.
import * as E from '../js/engine.js';
import { think, stakeCall } from '../js/bot.js';
import { AGENTS, CITIES, RIVALS } from '../js/data.js';
import { createRng } from '../../../shared/rng.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const ROUNDS = Number(opt('rounds', 300));
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--set') continue;
  const [path, value] = args[i + 1].split('=');
  const [id, field] = path.split('.');
  const target = AGENTS.find((a) => a.id === id);
  if (!target) throw new Error(`no agent ${id}`);
  target[field] = Number.isNaN(Number(value)) ? value : Number(value);
  console.log(`set ${id}.${field} = ${target[field]}`);
}
const SAMPLES = opt('samples', null);
const rivalOf = (id) => {
  const r = RIVALS.find((x) => x.id === id) || RIVALS[2];
  return SAMPLES ? { ...r, samples: Number(SAMPLES) } : r;
};

/** Plays one round between two rivals from the state's current round. Returns notes about it. */
function playRound(state, bots, rng) {
  const played = [[], []];
  const escalations = [];
  while (state.phase === 'plan') {
    const R = state.round;
    const thoughts = [0, 1].map((seat) => (R.plans[seat] ? null : think(E.viewFor(state, seat), { samples: bots[seat].samples, noise: bots[seat].noise, rng })));
    for (const seat of [0, 1]) {
      if (state.phase !== 'plan') break;
      const value = thoughts[seat]?.value ?? 0;
      const call = stakeCall(E.viewFor(state, seat), value, bots[seat], rng);
      if (call === 'fold') E.fold(state, seat);
      else if (call === 'escalate' && E.escalate(state, seat)) {
        escalations.push({ seat, turn: R.turn, value });
        const other = 1 - seat;
        const ov = thoughts[other]?.value ?? 0;
        const answer = stakeCall(E.viewFor(state, other), ov, bots[other], rng);
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
  return { result: state.round.result, cities: state.round.cities.map((c) => c.id), played, escalations };
}

function runMatches(aId, bId, rounds, rng, onRound) {
  const bots = [rivalOf(aId), rivalOf(bId)];
  let n = 0;
  let matches = 0;
  const wins = [0, 0];
  const roundsPerMatch = [];
  while (n < rounds) {
    // Alternate seats so neither bot always has seat 0.
    const flip = matches % 2 === 1;
    const seatBots = flip ? [bots[1], bots[0]] : bots;
    const state = E.newMatch({ seed: rng.int(1, 2 ** 31) });
    let r = 0;
    while (state.phase !== 'match-over' && n < rounds) {
      const note = playRound(state, seatBots, rng);
      onRound?.(note, flip);
      n++;
      r++;
      if (state.phase === 'round-over') E.nextRound(state);
    }
    if (state.phase === 'match-over') {
      wins[flip ? 1 - state.winner : state.winner]++;
      roundsPerMatch.push(r);
    }
    matches++;
  }
  return { wins, roundsPerMatch };
}

const pct = (x) => `${(100 * x).toFixed(0)}%`.padStart(4);
const rng = createRng(Number(opt('seed', 1)));

if (args.includes('--ladder')) {
  const ids = RIVALS.map((r) => r.id);
  console.log(`Ladder (${ROUNDS} rounds per pairing): row's match win rate vs column\n`);
  console.log('            ' + ids.map((i) => i.padStart(9)).join(''));
  for (const a of ids) {
    const row = [];
    for (const b of ids) {
      if (a === b) {
        row.push('        —');
        continue;
      }
      const { wins } = runMatches(a, b, ROUNDS, rng);
      row.push(pct(wins[0] / Math.max(1, wins[0] + wins[1])).padStart(9));
    }
    console.log(a.padEnd(12) + row.join(''));
  }
  process.exit(0);
}

const agentStat = Object.fromEntries(AGENTS.map((a) => [a.id, { played: 0, won: 0, turns: 0 }]));
const notPlayed = Object.fromEntries(AGENTS.map((a) => [a.id, { n: 0, won: 0 }]));
const cityStat = Object.fromEntries(CITIES.map((c) => [c.id, { n: 0, decided: 0, agrees: 0 }]));
const out = { rounds: 0, folds: 0, draws: 0, seat0: 0, decided: 0, points: 0, esc: 0, escWon: 0, stakes: {}, bluffs: 0 };
const t0 = Date.now();
const { wins, roundsPerMatch } = runMatches(opt('a', 'heron'), opt('b', 'heron'), ROUNDS, rng, (note) => {
  const res = note.result;
  out.rounds++;
  out.points += res.points;
  out.stakes[res.points] = (out.stakes[res.points] || 0) + 1;
  for (const e of note.escalations) {
    out.esc++;
    if (res.winner === e.seat) out.escWon++;
    if (e.value < 0) out.bluffs++;
  }
  if (res.folded !== null) {
    out.folds++;
    return;
  }
  if (res.winner === null) out.draws++;
  else {
    out.decided++;
    if (res.winner === 0) out.seat0++;
  }
  for (const seat of [0, 1]) {
    const won = res.winner === seat ? 1 : 0;
    const kinds = new Set(note.played[seat].map((p) => p.kind));
    for (const p of note.played[seat]) {
      agentStat[p.kind].played++;
      agentStat[p.kind].won += won;
      agentStat[p.kind].turns += p.turn;
    }
    for (const a of AGENTS) if (!kinds.has(a.id)) {
      notPlayed[a.id].n++;
      notPlayed[a.id].won += won;
    }
  }
  note.cities.forEach((id, ci) => {
    cityStat[id].n++;
    const w = res.cityWinners[ci];
    if (w !== null) cityStat[id].decided++;
    if (w !== null && w === res.winner) cityStat[id].agrees++;
  });
});

console.log(`${out.rounds} rounds in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${roundsPerMatch.length} matches finished, avg ${(roundsPerMatch.reduce((a, b) => a + b, 0) / Math.max(1, roundsPerMatch.length)).toFixed(1)} rounds/match, match wins ${wins.join(' : ')}`);
console.log(`folds ${pct(out.folds / out.rounds)}  draws ${pct(out.draws / out.rounds)}  seat 0 wins ${pct(out.seat0 / Math.max(1, out.decided))} of decided  avg points/round ${(out.points / out.rounds).toFixed(2)}`);
console.log(`escalations ${out.esc} (${(out.esc / out.rounds).toFixed(2)}/round), escalator won ${pct(out.escWon / Math.max(1, out.esc))}, bluffs ${out.bluffs}`);
console.log(`points per round: ${Object.entries(out.stakes).map(([k, v]) => `${k}:${v}`).join('  ')}`);
console.log('\nAgent         played  win% when played  win% when not  avg turn');
for (const a of AGENTS) {
  const s = agentStat[a.id];
  const np = notPlayed[a.id];
  console.log(`${a.name.padEnd(14)}${String(s.played).padStart(6)}   ${pct(s.won / Math.max(1, s.played)).padStart(14)}   ${pct(np.won / Math.max(1, np.n)).padStart(12)}   ${(s.turns / Math.max(1, s.played)).toFixed(1).padStart(7)}`);
}
console.log('\nCity          rounds  decided  winner took round');
for (const c of CITIES) {
  const s = cityStat[c.id];
  console.log(`${c.name.padEnd(14)}${String(s.n).padStart(6)}   ${pct(s.decided / Math.max(1, s.n)).padStart(6)}   ${pct(s.agrees / Math.max(1, s.decided)).padStart(8)}`);
}
