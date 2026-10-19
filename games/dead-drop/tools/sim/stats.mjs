// Mergeable tallies from match records, with 95% margins. Stats stay plain JSON.
import { AGENTS, CITIES } from '../../js/data.js';

export function emptyStats() {
  return {
    matches: 0, capped: 0, rounds: 0, roundsHist: {}, matchWins: [0, 0], seatMatchWins: [0, 0],
    halfLeader: { n: 0, won: 0 }, folds: 0, deadHeats: 0, tiebreaks: 0, decided: 0, seatRoundWins: [0, 0],
    pointsHist: {}, escalated: 0, escalatorWon: 0, answeredFold: 0, bluffs: 0, escTurnHist: {},
    agents: Object.fromEntries(AGENTS.map((a) => [a.id, { played: 0, wonPlayed: 0, notPlayed: 0, wonNotPlayed: 0, turnSum: 0 }])),
    cities: Object.fromEntries(CITIES.map((c) => [c.id, { n: 0, decided: 0, agrees: 0 }])),
  };
}

const bump = (hist, key, by = 1) => { hist[key] = (hist[key] || 0) + by; };

export function addMatch(stats, rec) {
  stats.matches++;
  stats.rounds += rec.rounds.length;
  for (const r of rec.rounds) {
    const res = r.result;
    bump(stats.pointsHist, res.points);
    for (const e of r.escalations) {
      stats.escalated++;
      if (res.winner === e.seat) stats.escalatorWon++;
      if (e.answer === 'fold') stats.answeredFold++;
      if (e.value < 0) stats.bluffs++;
      bump(stats.escTurnHist, e.turn);
    }
    if (res.folded !== null) {
      stats.folds++;
      continue;
    }
    if (r.tiebreak) stats.tiebreaks++;
    if (res.winner === null) stats.deadHeats++;
    else {
      stats.decided++;
      stats.seatRoundWins[res.winner]++;
    }
    for (const seat of [0, 1]) {
      const won = res.winner === seat ? 1 : 0;
      const kinds = new Set(r.played[seat].map((p) => p.kind));
      for (const p of r.played[seat]) {
        const a = stats.agents[p.kind];
        a.played++;
        a.wonPlayed += won;
        a.turnSum += p.turn;
      }
      for (const id of Object.keys(stats.agents)) {
        if (kinds.has(id)) continue;
        stats.agents[id].notPlayed++;
        stats.agents[id].wonNotPlayed += won;
      }
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
  stats.matchWins[rec.swapped ? 1 - rec.winner : rec.winner]++;
  if (rec.rounds.length >= 2) {
    const [x, y] = rec.rounds[Math.floor(rec.rounds.length / 2) - 1].scores;
    if (x !== y) {
      stats.halfLeader.n++;
      if (rec.winner === (x > y ? 0 : 1)) stats.halfLeader.won++;
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
  for (const [id, a] of Object.entries(s.agents)) {
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
    maxStake: rate(s.pointsHist[4] || 0, s.rounds),
    escalatorWins: rate(s.escalatorWon, s.escalated),
    foldInAnswer: rate(s.answeredFold, s.escalated),
    folds: rate(s.folds, s.rounds),
    deadHeats: rate(s.deadHeats, s.rounds),
    tiebreaks: rate(s.tiebreaks, s.rounds),
    seat0Rounds: rate(s.seatRoundWins[0], s.decided),
    aMatchWins: rate(s.matchWins[0], finished),
    seat0Matches: rate(s.seatMatchWins[0], finished),
    halfLeaderWins: rate(s.halfLeader.won, s.halfLeader.n),
    bluffs: s.bluffs,
    pointsPerRound: histMean(s.pointsHist),
    roundsPerMatch: histMean(s.roundsHist),
    agents,
    cities,
  };
}

const RATE_KEYS = ['escalation', 'maxStake', 'escalatorWins', 'foldInAnswer', 'folds', 'deadHeats', 'tiebreaks', 'seat0Rounds', 'aMatchWins', 'seat0Matches', 'halfLeaderWins'];
const MEAN_KEYS = ['pointsPerRound', 'roundsPerMatch'];

/** Row per headline number; `sig` when the difference is bigger than the two margins combined. */
export function compare(a, b) {
  const rows = [];
  for (const key of [...RATE_KEYS, ...MEAN_KEYS]) {
    const x = a[key], y = b[key];
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
  L.push(`points/round ${num(sum.pointsPerRound.mean, 2)} ±${num(sum.pointsPerRound.margin, 2)}  stake 4 in ${pc(sum.maxStake)} of rounds`);
  L.push(`escalations ${pc(sum.escalation)} of rounds, escalator won ${pc(sum.escalatorWins)}, answered with a fold ${pc(sum.foldInAnswer)}, bluffs ${sum.bluffs}`);
  L.push('', 'Agent           played  win% when played  win% when not  avg turn');
  for (const a of AGENTS) {
    const s = sum.agents[a.id];
    const w = (v, m) => (v === null ? 'n/a' : `${v.toFixed(1)}% ±${m.toFixed(1)}`);
    L.push(`${a.name.padEnd(14)}${String(s.played).padStart(8)}  ${w(s.winPlayed, s.winPlayedMargin).padStart(16)}  ${w(s.winNot, s.winNotMargin).padStart(13)}  ${num(s.avgTurn).padStart(8)}`);
  }
  L.push('', 'City           rounds  decided  winner took round');
  for (const c of CITIES) {
    const s = sum.cities[c.id];
    const d = rate(s.decided, s.n), g = rate(s.agrees, s.decided);
    L.push(`${c.name.padEnd(14)}${String(s.n).padStart(7)}  ${pc(d).padStart(14)}  ${pc(g).padStart(18)}`);
  }
  return L.join('\n');
}
