// Mergeable tallies from match records, with 95% margins. Stats stay plain JSON.
import { AGENTS, CITIES, DECK } from '../../js/data.js';

export function emptyStats(seats = 2) {
  const zeros = () => new Array(seats).fill(0);
  return {
    matches: 0, capped: 0, rounds: 0, roundsHist: {}, matchWins: zeros(), seatMatchWins: zeros(),
    halfLeader: { n: 0, won: 0 }, folds: 0, deadHeats: 0, tiebreaks: 0, decided: 0, seatRoundWins: zeros(),
    pointsHist: {}, escalated: 0, escalatorWon: 0, answers: 0, answeredFold: 0,
    reelWins: 0, reelComebacks: 0, strips: 0, filmDecided: 0, filmAgrees: 0, potHist: {}, carries: 0, tokensSpentHist: {}, outOfTokens: 0, maxStake: 0,
    bluffs: 0, escTurnHist: {},
    // inRoster: rounds dealt with the agent in the match's roster (folds included).
    agents: Object.fromEntries(AGENTS.map((a) => [a.id, { played: 0, wonPlayed: 0, notPlayed: 0, wonNotPlayed: 0, turnSum: 0, inRoster: 0 }])),
    cities: Object.fromEntries(CITIES.map((c) => [c.id, { n: 0, decided: 0, agrees: 0 }])),
  };
}

const bump = (hist, key, by = 1) => { hist[key] = (hist[key] || 0) + by; };

/**
 * Folds one match record (play.mjs) into `stats`. An agent counts as not played only in a match whose roster
 * holds it; a record without a roster (an older or hand-made one) is Classic.
 */
export function addMatch(stats, rec) {
  const roster = rec.roster ?? DECK;
  stats.matches++;
  stats.rounds += rec.rounds.length;
  for (const id of roster) stats.agents[id].inRoster += rec.rounds.length;
  for (const r of rec.rounds) {
    const res = r.result;
    bump(stats.pointsHist, res.points);
    for (const e of r.escalations) {
      stats.escalated++;
      if (res.winner === e.seat) stats.escalatorWon++;
      for (const a of e.answers) {
        stats.answers++;
        if (a.call === 'fold') stats.answeredFold++;
      }
      if (e.value < 0) stats.bluffs++;
      bump(stats.escTurnHist, e.turn);
    }
    if (res.winner !== null) bump(stats.potHist, res.pot);
    if (res.carry > 0) stats.carries++;
    if (res.strip !== null && res.strip !== undefined) stats.strips++;
    if (r.tokensAtStart.some((t) => t === 0)) stats.outOfTokens++;
    if (res.folded !== null) {
      stats.folds++;
      continue;
    }
    if (res.winner !== null && res.stake >= 2) stats.maxStake++;
    if (r.tiebreak) stats.tiebreaks++;
    if (res.winner === null) stats.deadHeats++;
    else {
      stats.decided++;
      stats.seatRoundWins[res.winner]++;
    }
    for (let seat = 0; seat < r.played.length; seat++) {
      const won = res.winner === seat ? 1 : 0;
      const kinds = new Set(r.played[seat].map((p) => p.kind));
      for (const p of r.played[seat]) {
        const a = stats.agents[p.kind];
        a.played++;
        a.wonPlayed += won;
        a.turnSum += p.turn;
      }
      for (const id of roster) {
        if (kinds.has(id)) continue;
        stats.agents[id].notPlayed++;
        stats.agents[id].wonNotPlayed += won;
      }
    }
    if (r.film !== null && res.cityWinners[r.film] !== null) {
      stats.filmDecided++;
      if (res.cityWinners[r.film] === res.winner) stats.filmAgrees++;
    }
    r.cities.forEach((id, ci) => {
      const c = stats.cities[id];
      c.n++;
      const w = res.cityWinners[ci];
      if (w !== null) c.decided++;
      if (w !== null && w === res.winner) c.agrees++;
    });
  }
  if (rec.capped) {
    stats.capped++;
    return stats;
  }
  bump(stats.roundsHist, rec.rounds.length);
  stats.seatMatchWins[rec.winner]++;
  rec.tokens.forEach((left, s) => bump(stats.tokensSpentHist, rec.rounds[0].tokensAtStart[s] - left));
  if (rec.winBy === 'reel') {
    stats.reelWins++;
    if (rec.scores[rec.winner] < Math.max(...rec.scores.filter((_, s) => s !== rec.winner))) stats.reelComebacks++;
  }
  const n = stats.matchWins.length;
  stats.matchWins[(rec.winner + rec.rotation) % n]++;
  if (rec.rounds.length >= 2) {
    const half = rec.rounds[Math.floor(rec.rounds.length / 2) - 1].scores;
    const top = Math.max(...half);
    if (half.filter((x) => x === top).length === 1) {
      stats.halfLeader.n++;
      if (rec.winner === half.indexOf(top)) stats.halfLeader.won++;
    }
  }
  return stats;
}

/** Sums every number, array element and object key into a new object. */
export function mergeStats(a, b) {
  if (a === undefined) return structuredClone(b);
  if (b === undefined) return structuredClone(a);
  if (typeof a === 'number') return a + b;
  if (Array.isArray(a)) return a.map((x, i) => mergeStats(x, b[i]));
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = mergeStats(a[k], b[k]);
  return out;
}

/** 95% margin of a proportion k/n, in percentage points. */
export function margin(k, n) {
  if (!n) return null;
  const p = k / n;
  return 196 * Math.sqrt((p * (1 - p)) / n);
}

const rate = (k, n) => ({ pct: n ? (100 * k) / n : null, margin: margin(k, n), n });

function histMean(hist) {
  let n = 0, sum = 0, sq = 0;
  for (const [v, c] of Object.entries(hist)) {
    n += c;
    sum += v * c;
    sq += v * v * c;
  }
  if (!n) return { mean: null, margin: null, n: 0 };
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
  return { mean, margin: (1.96 * sd) / Math.sqrt(n), n };
}

export function summarize(s) {
  const finished = s.matches - s.capped;
  const agents = {};
  // Rounds each agent was in the roster, beside `agents` so each agent's numbers keep their 2b-i shape.
  const inRoster = {};
  for (const [id, a] of Object.entries(s.agents)) {
    inRoster[id] = a.inRoster ?? 0;
    agents[id] = {
      played: a.played,
      winPlayed: a.played ? (100 * a.wonPlayed) / a.played : null,
      winPlayedMargin: margin(a.wonPlayed, a.played),
      winNot: a.notPlayed ? (100 * a.wonNotPlayed) / a.notPlayed : null,
      winNotMargin: margin(a.wonNotPlayed, a.notPlayed),
      avgTurn: a.played ? a.turnSum / a.played : null,
    };
  }
  const cities = {};
  for (const [id, c] of Object.entries(s.cities)) {
    cities[id] = { n: c.n, decided: c.decided, agrees: c.agrees };
  }
  return {
    matches: s.matches,
    capped: s.capped,
    rounds: s.rounds,
    escalation: rate(s.escalated, s.rounds),
    maxStake: rate(s.maxStake, s.rounds),
    escalatorWins: rate(s.escalatorWon, s.escalated),
    foldInAnswer: rate(s.answeredFold, s.answers),
    reelWins: rate(s.reelWins, finished),
    reelComeback: rate(s.reelComebacks, s.reelWins),
    filmHolderWins: rate(s.filmAgrees, s.filmDecided),
    rollovers: rate(s.carries, s.rounds),
    outOfTokens: rate(s.outOfTokens, s.rounds),
    stripsPerMatch: s.matches ? s.strips / s.matches : null,
    tokensSpent: histMean(s.tokensSpentHist),
    potTaken: histMean(s.potHist),
    folds: rate(s.folds, s.rounds),
    deadHeats: rate(s.deadHeats, s.rounds),
    tiebreaks: rate(s.tiebreaks, s.rounds),
    seat0Rounds: rate(s.seatRoundWins[0], s.decided),
    aMatchWins: rate(s.matchWins[0], finished),
    seat0Matches: rate(s.seatMatchWins[0], finished),
    halfLeaderWins: rate(s.halfLeader.won, s.halfLeader.n),
    bluffs: s.bluffs,
    seats: s.matchWins.length,
    seatRounds: s.seatRoundWins.map((k) => rate(k, s.decided)),
    seatMatches: s.seatMatchWins.map((k) => rate(k, finished)),
    botMatches: s.matchWins.map((k) => rate(k, finished)),
    pointsPerRound: histMean(s.pointsHist),
    roundsPerMatch: histMean(s.roundsHist),
    agents,
    cities,
    inRoster,
  };
}

const RATE_KEYS = ['escalation', 'maxStake', 'escalatorWins', 'foldInAnswer', 'folds', 'deadHeats', 'tiebreaks', 'seat0Rounds', 'aMatchWins', 'seat0Matches', 'halfLeaderWins', 'reelWins', 'reelComeback', 'filmHolderWins', 'rollovers', 'outOfTokens'];
const MEAN_KEYS = ['pointsPerRound', 'roundsPerMatch', 'tokensSpent', 'potTaken'];

/** Row per headline number; `sig` when the difference is bigger than the two margins combined. */
export function compare(a, b) {
  const rows = [];
  for (const key of [...RATE_KEYS, ...MEAN_KEYS]) {
    const x = a[key], y = b[key];
    if (!x || !y) continue; // an older baseline may lack a key
    const [vx, vy] = RATE_KEYS.includes(key) ? [x.pct, y.pct] : [x.mean, y.mean];
    if (vx === null || vy === null) continue;
    const m = Math.sqrt(x.margin ** 2 + y.margin ** 2);
    const delta = vy - vx;
    rows.push({ key, base: vx, other: vy, delta, margin: m, sig: Math.abs(delta) > m });
  }
  return rows;
}

const pc = (r) => (r.pct === null ? '  n/a' : `${r.pct.toFixed(1)}% ±${r.margin.toFixed(1)}`);
const num = (v, d = 1) => (v === null ? 'n/a' : v.toFixed(d));

export function formatSummary(sum, title = 'Dead Drop sim') {
  const L = [];
  L.push(`${title}`);
  L.push(`${sum.rounds} rounds, ${sum.matches} matches (${sum.capped} capped), ${num(sum.roundsPerMatch.mean)} ±${num(sum.roundsPerMatch.margin, 2)} rounds/match, A wins ${pc(sum.aMatchWins)}, seat 0 wins ${pc(sum.seat0Matches)} of matches`);
  L.push(`folds ${pc(sum.folds)}  dead heats ${pc(sum.deadHeats)}  tie-breaks ${pc(sum.tiebreaks)}  seat 0 wins ${pc(sum.seat0Rounds)} of decided rounds  half-time leader wins ${pc(sum.halfLeaderWins)}`);
  L.push(`points/round ${num(sum.pointsPerRound.mean, 2)} ±${num(sum.pointsPerRound.margin, 2)}  won at stake 2 or more in ${pc(sum.maxStake)} of rounds`);
  L.push(`escalations ${pc(sum.escalation)} of rounds, escalator won ${pc(sum.escalatorWins)}, answers were folds ${pc(sum.foldInAnswer)}, bluffs ${sum.bluffs}`);
  L.push(`Stakes: ${num(sum.tokensSpent.mean, 2)} tokens spent per player per match, ${pc(sum.outOfTokens)} of rounds begun with a seat out of tokens, pot taken ${num(sum.potTaken.mean, 2)} on average, ${pc(sum.rollovers)} of rounds rolled over`);
  L.push(`Microfilm: strips ${num(sum.stripsPerMatch, 2)} per match, reel wins ${pc(sum.reelWins)} of matches, ${pc(sum.reelComeback)} of those from behind on points, film city's holder took the round ${pc(sum.filmHolderWins)}`);
  if (sum.seats > 2) {
    L.push('', 'Seats           decided rounds won    matches won');
    sum.seatRounds.forEach((r, i) => L.push(`seat ${i}${' '.repeat(10)}${pc(r).padStart(18)}  ${pc(sum.seatMatches[i]).padStart(16)}`));
    sum.botMatches.forEach((r, i) => L.push(`bot ${String.fromCharCode(65 + i)} wins matches ${pc(r).padStart(16)}`));
  }
  // Only what the run dealt: agents some roster held (every agent, for a summary from before rosters) and
  // cities dealt at least once. A run whose rosters varied also shows the rounds each agent was in one.
  const held = (id) => !sum.inRoster || sum.inRoster[id] > 0;
  const varied = !!sum.inRoster && AGENTS.some((a) => held(a.id) && sum.inRoster[a.id] < sum.rounds);
  L.push('', `Agent           played  win% when played  win% when not  avg turn${varied ? '  in roster' : ''}`);
  for (const a of AGENTS) {
    if (!held(a.id)) continue;
    const s = sum.agents[a.id];
    const w = (v, m) => (v === null ? 'n/a' : `${v.toFixed(1)}% ±${m.toFixed(1)}`);
    L.push(`${a.name.padEnd(14)}${String(s.played).padStart(8)}  ${w(s.winPlayed, s.winPlayedMargin).padStart(16)}  ${w(s.winNot, s.winNotMargin).padStart(13)}  ${num(s.avgTurn).padStart(8)}${varied ? String(sum.inRoster[a.id]).padStart(11) : ''}`);
  }
  L.push('', 'City           rounds  decided  winner took round');
  for (const c of CITIES) {
    const s = sum.cities[c.id];
    if (!s.n) continue;
    const d = rate(s.decided, s.n), g = rate(s.agrees, s.decided);
    L.push(`${c.name.padEnd(14)}${String(s.n).padStart(7)}  ${pc(d).padStart(14)}  ${pc(g).padStart(18)}`);
  }
  return L.join('\n');
}
