// A railway manager for the simulator and the title-screen demo. Each month it adds trains where
// cargo piles up, modernises the busiest services when a new class arrives, and builds the best
// new route it can afford. `skill` (0..1) blurs its judgement: lower skill picks among more of the
// candidates at random, checks its services less often and keeps less in reserve.
import * as E from './engine.js';
import { W, H, WATER, ROCK, INDUSTRY, LOAN, YEAR } from './data.js';

const idx = (x, y) => y * W + x;

/** Candidate station tiles that cover a place: an industry's surroundings or a town's edge. */
export function spotsFor(s, end) {
  const out = [];
  const seen = new Set();
  const add = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const k = idx(x, y);
    if (seen.has(k) || !E.canHostStation(s, x, y)) return;
    seen.add(k);
    out.push({ x, y });
  };
  if (end.ind !== undefined) {
    const o = s.industries[end.ind];
    for (let dy = -2; dy < o.h + 2; dy++) for (let dx = -2; dx < o.w + 2; dx++) add(o.x + dx, o.y + dy);
  } else {
    const t = s.towns[end.town];
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = t.x + dx;
        const y = t.y + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (E.canHostStation(s, x, y) && E.coverage(s, x, y).houses >= 6) add(x, y);
      }
  }
  // Existing stations that already reach it come first (free, and they share track).
  const have = s.stations.filter((st) => {
    const cov = E.stationCov(s, st);
    return end.ind !== undefined ? cov.inds.includes(end.ind) : (cov.towns.get(end.town) || 0) >= 4;
  });
  return [...have.map((st) => ({ x: st.x, y: st.y, existing: true })), ...out.filter((p) => !have.some((st) => st.x === p.x && st.y === p.y))];
}

/** Every producer → taker pair worth considering. */
function pairs(s) {
  const out = [];
  const centre = (end) => E.endPos(s, end);
  for (const p of s.industries) {
    const def = INDUSTRY[p.kind];
    const c = def.makes || def.turns;
    if (!c) continue;
    if (def.turns && p.prod <= 0) continue;
    if (c === 'goods') {
      for (const t of s.towns) if (t.pop >= 300) out.push({ c, src: { ind: p.id }, dst: { town: t.id } });
      continue;
    }
    for (const q of s.industries) if ((INDUSTRY[q.kind].takes || []).includes(c)) out.push({ c, src: { ind: p.id }, dst: { ind: q.id } });
  }
  for (const a of s.towns) for (const b of s.towns) if (a.id < b.id) out.push({ c: 'pax', src: { town: a.id }, dst: { town: b.id } });
  return out
    .map((x) => ({ ...x, d: Math.abs(centre(x.src).x - centre(x.dst).x) + Math.abs(centre(x.src).y - centre(x.dst).y) }))
    .filter((x) => x.d >= 7 && x.d <= 30);
}

function closest(spots, to) {
  let best = null;
  for (const p of spots) {
    const d = Math.abs(p.x - to.x) + Math.abs(p.y - to.y) - (p.existing ? 1.5 : 0);
    if (!best || d < best.d) best = { ...p, d };
  }
  return best;
}

export function createBot({ skill = 1, seed = 1, plansPerThink = 7 } = {}) {
  let r = seed >>> 0 || 1;
  const rand = () => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296);
  let lastThink = -999;
  let lastBuild = -999;
  // People build a route every few months at normal speed, not every month.
  const buildGap = skill >= 0.9 ? 2 : skill >= 0.5 ? 3 : 5;

  function reserve(s) {
    return 2500 + 0.02 * Math.max(0, E.companyValue(s));
  }

  function addTrains(s) {
    let bought = 0;
    for (const v of s.services) {
      const A = E.stationById(s, v.a);
      const B = E.stationById(s, v.b);
      const trains = s.trains.filter((t) => t.svc === v.id);
      const cap = E.newestModel(s).cap;
      const backlog = (st, other) => {
        const acc = E.stationCov(s, other).accepts;
        let n = 0;
        for (const c in st.waiting) if (acc.has(c)) n += st.waiting[c];
        return n;
      };
      const pile = Math.max(backlog(A, B), backlog(B, A));
      // A profitable service with cargo waiting for more than a trainload gets another engine.
      const profitable = !v.last || v.last.income - v.last.cost > 0 || s.day - v.opened < YEAR;
      const limit = 3 + Math.floor(skill * 9);
      if (pile > cap * (1.6 - 0.5 * skill) && trains.length < limit && profitable && E.spendable(s) - E.newestModel(s).cost > reserve(s)) {
        if (E.buyTrain(s, v.id)) bought++;
      }
      // Sell trains on a service that loses money year after year.
      if (v.last && v.last.income < v.last.cost * 0.8 && trains.length > 1 && skill > 0.5) E.sellTrain(s, trains[trains.length - 1].id);
      if (bought >= 2) break;
    }
    return bought;
  }

  function modernise(s) {
    if (skill < 0.4) return;
    const m = E.newestModel(s);
    const svcs = s.services.slice().sort((a, b) => (b.last?.income || 0) - (a.last?.income || 0));
    for (const v of svcs.slice(0, 2)) {
      const p = E.modernisePrice(s, v.id);
      if (p.n && E.spendable(s) - p.cost > reserve(s) * 2 && s.cash > p.cost) E.modernise(s, v.id);
    }
    return m;
  }

  function bestRoute(s) {
    const cands = [];
    for (const x of pairs(s)) {
      // Skip what's already served.
      const sa = spotsFor(s, x.src);
      const sb = spotsFor(s, x.dst);
      if (!sa.length || !sb.length) continue;
      const pd = E.endPos(s, x.dst);
      const ps = E.endPos(s, x.src);
      const a = closest(sa, pd);
      const b = closest(sb, ps);
      if (!a || !b) continue;
      if (a.existing && b.existing) {
        const A = E.stationById(s, s.station[idx(a.x, a.y)]);
        const B = E.stationById(s, s.station[idx(b.x, b.y)]);
        if (E.findService(s, A.id, B.id)) continue;
      }
      const est = E.estimate(s, a.x, a.y, b.x, b.y, Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + 2);
      if (est.profit <= 0) continue;
      const rough = (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) * 420 + (a.existing ? 0 : 2400) + (b.existing ? 0 : 2400) + E.newestModel(s).cost;
      const subsidy = s.subsidies.some((sb2) => !sb2.awarded && sb2.c === x.c && JSON.stringify(sb2.src) === JSON.stringify(x.src) && JSON.stringify(sb2.dst) === JSON.stringify(x.dst));
      const gain = est.profit * Math.min(est.trainsNeeded, 4) * (subsidy ? 1.8 : 1);
      cands.push({ a, b, est, score: gain / rough, rough, sub: subsidy });
    }
    cands.sort((p, q) => q.score - p.score);
    let best = null;
    for (const c of cands.slice(0, plansPerThink)) {
      const plan = E.planRoute(s, c.a.x, c.a.y, c.b.x, c.b.y);
      if (!plan.ok) continue;
      const est = E.estimate(s, c.a.x, c.a.y, c.b.x, c.b.y, plan.length);
      const gain = est.profit * Math.min(est.trainsNeeded, 4) * (c.sub ? 1.8 : 1);
      const score = (gain / Math.max(1, plan.cost.total + E.newestModel(s).cost * (Math.min(est.trainsNeeded, 4) - 1))) * (0.75 + 0.5 * rand() * (1 - skill));
      if (!best || score > best.score) best = { plan, est, score };
    }
    return best;
  }

  function think(s) {
    if (s.hold || s.over) return;
    const every = skill >= 0.8 ? 1 : skill >= 0.5 ? 2 : 3;
    const month = Math.floor(s.day / 30);
    if (month - lastThink < every) return;
    lastThink = month;
    addTrains(s);
    if (yearsSinceModel(s) <= 1) modernise(s);
    const best = month - lastBuild >= buildGap ? bestRoute(s) : null;
    if (best && best.score > 0.05) {
      const cost = best.plan.cost.total;
      // Borrow for the first lines; later, build only from what's spare.
      const budget = s.day < 2 * YEAR ? E.spendable(s) : s.cash + (skill > 0.6 ? LOAN.max - s.loan : 0);
      if (cost < budget - reserve(s) && E.build(s, best.plan).ok) lastBuild = month;
    }
    // Pay the bank back once the railway runs itself.
    if (skill > 0.5 && s.loan > 0 && s.cash > 60000 + reserve(s) * 2) E.repay(s, Math.min(s.loan, Math.floor((s.cash - 40000) / 10000) * 10000));
  }

  function yearsSinceModel(s) {
    const m = E.newestModel(s);
    return E.yearOf(s.day) - m.year;
  }

  return { think, bestRoute };
}
