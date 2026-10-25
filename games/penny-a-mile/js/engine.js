// Penny a Mile: the rules. Pure and DOM-free; the whole game is one JSON-able state object.
//
//   const s = newGame('seed');
//   const plan = planRoute(s, ax, ay, bx, by);   // cheapest track between two tiles, with its bill
//   if (plan.ok) build(s, plan);                 // lays it, builds stations, opens a service, buys a train
//   step(s, days);                               // runs the railway; read s.events for what happened
//
// Time is in days (30-day months, 360-day years from 1 January 1900).
import { hashString } from '../../../shared/rng.js';
import { generate } from './map.js';
import {
  W, H, MONTH, YEAR, START_YEAR, END_YEAR, MONTH_NAMES, BOARD, START_CASH, LOAN, RADIUS, GRASS, WATER, ROCK, FIELD, COST, CARGO, CARGO_IDS,
  INDUSTRY, HOUSE_POP, PAX_RATE, PAX_HOUSES, GOODS_HOUSES, MODELS, DEPRECIATION, DEPRECIATION_FLOOR, TRADE_IN, LINE_COLOURS, MAX_WAITING,
} from './data.js';
import { DIRS, opp, pieceBit, isStraight, pieceLen, exitsFrom, countPieces, pathLength, STRAIGHT_NS, STRAIGHT_EW } from './track.js';

export const VERSION = 1;
const idx = (x, y) => y * W + x;
const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const MODEL = Object.fromEntries(MODELS.map((m) => [m.id, m]));

/** Seeded random in [0, 1) that lives in the state (mulberry32), so saves resume the same sequence. */
export function rnd(s) {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (s, a, b) => a + Math.floor(rnd(s) * (b - a + 1));

function emit(s, type, data = {}) {
  // The envelope's own fields go last, so a payload can never overwrite the id.
  s.events.push({ ...data, type, id: ++s.seq, day: s.day });
  if (s.events.length > 160) s.events.splice(0, s.events.length - 160);
}

// ---------------------------------------------------------------------------------------------
// Setup

export function newGame(seed, { daily = false } = {}) {
  const m = generate(seed);
  const s = {
    v: VERSION,
    seed: String(seed),
    daily,
    rng: (hashString(String(seed)) ^ 0x5bd1e995) >>> 0,
    day: 0,
    ...m,
    stations: [],
    services: [],
    trains: [],
    subsidies: [],
    cash: START_CASH,
    loan: 0,
    infra: 0,
    broke: 0,
    year: freshYear(),
    last: null,
    history: [],
    carried: Object.fromEntries(CARGO_IDS.map((c) => [c, 0])),
    boards: [],
    hold: null,
    over: null,
    final: null,
    freePlay: false,
    events: [],
    seq: 0,
    nextId: 1,
    colour: 0,
    models: MODELS.filter((x) => x.year <= START_YEAR).map((x) => x.id),
    topo: 0,
    stats: { routes: 0, trainsBought: 0, best: null },
  };
  s.history.push({ day: 0, value: companyValue(s) });
  offerSubsidy(s, true);
  return s;
}

function freshYear() {
  return { income: 0, cargo: Object.fromEntries(CARGO_IDS.map((c) => [c, 0])), running: 0, upkeep: 0, interest: 0, build: 0, trains: 0, sold: 0 };
}

/** Fills in anything a save from an older version lacks. */
export function upgradeState(s) {
  if (!s || s.v !== VERSION) return null;
  return s;
}

// ---------------------------------------------------------------------------------------------
// Dates and money

export function dateOf(day) {
  const d = Math.floor(day);
  return { year: START_YEAR + Math.floor(d / YEAR), month: Math.floor((d % YEAR) / MONTH), date: (d % MONTH) + 1 };
}
export const yearOf = (day) => START_YEAR + Math.floor(day / YEAR);
export function dateLabel(day) {
  const { year, month } = dateOf(day);
  return `${MONTH_NAMES[month]} ${year}`;
}

export function trainValue(s, t) {
  const age = (s.day - t.born) / YEAR;
  return Math.round(t.cost * Math.max(DEPRECIATION_FLOOR, 1 - DEPRECIATION * age));
}

export function companyValue(s) {
  let v = s.cash - s.loan + 0.5 * s.infra;
  for (const t of s.trains) v += trainValue(s, t);
  return Math.round(v);
}

export const newestModel = (s) => MODEL[s.models[s.models.length - 1]];

/** The next Board meeting (or null in free play / after the end). */
export function nextBoard(s) {
  if (s.freePlay || s.over) return null;
  const y = yearOf(s.day);
  const b = BOARD.find((x) => x.year > y);
  return b || { year: END_YEAR, target: null, final: true };
}

// ---------------------------------------------------------------------------------------------
// Coverage: what a station at (x, y) gathers from and delivers to.

const covCache = new WeakMap();

export function coverage(s, x, y) {
  let cache = covCache.get(s);
  if (!cache || cache.topo !== s.topo) {
    cache = { topo: s.topo, map: new Map() };
    covCache.set(s, cache);
  }
  const key = idx(x, y);
  const hit = cache.map.get(key);
  if (hit) return hit;
  const inds = new Set();
  const towns = new Map();
  let houses = 0;
  let pop = 0;
  for (let dy = -RADIUS; dy <= RADIUS; dy++)
    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (!inside(tx, ty)) continue;
      const i = idx(tx, ty);
      if (s.ind[i] >= 0) inds.add(s.ind[i]);
      if (s.house[i]) {
        houses++;
        pop += HOUSE_POP[s.house[i]];
        towns.set(s.owner[i], (towns.get(s.owner[i]) || 0) + 1);
      }
    }
  const supplies = new Set();
  const accepts = new Set();
  if (houses > 0) supplies.add('pax');
  if (houses >= PAX_HOUSES) accepts.add('pax');
  if (houses >= GOODS_HOUSES) accepts.add('goods');
  for (const id of inds) {
    const def = INDUSTRY[s.industries[id].kind];
    if (def.makes) supplies.add(def.makes);
    if (def.turns) supplies.add(def.turns);
    for (const c of def.takes || []) accepts.add(c);
  }
  const out = { inds: [...inds], houses, pop, towns, supplies, accepts };
  cache.map.set(key, out);
  return out;
}

export const stationCov = (s, st) => coverage(s, st.x, st.y);
export const stationById = (s, id) => s.stations.find((st) => st.id === id);
export const serviceById = (s, id) => s.services.find((v) => v.id === id);
export const trainById = (s, id) => s.trains.find((t) => t.id === id);

/** Cargo a station sends: what its own reach supplies and some service's far end accepts. */
export function activeCargo(s, st) {
  const out = new Set();
  const mine = stationCov(s, st).supplies;
  for (const v of s.services) {
    let other = null;
    if (v.a === st.id) other = v.b;
    else if (v.b === st.id) other = v.a;
    if (other === null) continue;
    const acc = stationCov(s, stationById(s, other)).accepts;
    for (const c of mine) if (acc.has(c)) out.add(c);
  }
  return out;
}

/** Monthly output of a cargo within a coverage, before ratings (for previews and the bot). */
export function monthlySupply(s, cov, c) {
  let n = 0;
  if (c === 'pax') n += cov.pop * PAX_RATE;
  for (const id of cov.inds) {
    const o = s.industries[id];
    const def = INDUSTRY[o.kind];
    if (def.makes === c) n += o.prod;
    if (def.turns === c) n += o.prod;
  }
  return n;
}

// ---------------------------------------------------------------------------------------------
// Building

export function canHostStation(s, x, y) {
  if (!inside(x, y)) return false;
  const i = idx(x, y);
  if (s.station[i] >= 0) return true;
  if (s.ground[i] !== GRASS && s.ground[i] !== FIELD) return false;
  if (s.road[i] || s.house[i] || s.ind[i] >= 0) return false;
  const tr = s.track[i];
  return tr === 0 || tr === STRAIGHT_NS || tr === STRAIGHT_EW;
}

/** Money (and planning weight) to add the piece a–b on tile i, or null if it can't go there. */
function pieceCost(s, i, a, b) {
  const bit = pieceBit(a, b);
  const len = pieceLen(a, b);
  if (s.track[i] & bit) return { money: 0, weight: COST.reuse * len };
  const g = s.ground[i];
  if (g === ROCK || s.house[i] || s.ind[i] >= 0) return null;
  const straight = isStraight(a, b);
  if (s.station[i] >= 0) return straight ? { money: COST.track, weight: COST.track } : null;
  if (g === WATER) {
    if (!straight || s.track[i]) return null;
    return { money: COST.bridge, weight: COST.bridge };
  }
  if (s.road[i]) {
    if (!straight || s.track[i]) return null;
    return { money: COST.track + COST.road, weight: COST.track + COST.road };
  }
  let money = COST.track * len;
  if (g === FIELD) money += COST.field;
  if (s.trees[i]) money += COST.forest * (0.6 + 0.2 * s.trees[i]);
  money = Math.round(money);
  return { money, weight: straight ? money : money * COST.curve };
}

class Heap {
  constructor() {
    this.a = [];
  }
  push(k, p) {
    const a = this.a;
    a.push([p, k]);
    let i = a.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (a[j][0] <= a[i][0]) break;
      [a[i], a[j]] = [a[j], a[i]];
      i = j;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

/**
 * Plans a route between two tiles: the cheapest track (reusing what's there), new stations at
 * either end if needed, and a train if the service is new.
 * Returns { ok, reason, path, pieces, cost: { track, stations, train, total }, a, b, newA, newB, service }.
 */
export function planRoute(s, ax, ay, bx, by) {
  const fail = (reason) => ({ ok: false, reason, ax, ay, bx, by });
  if (!inside(ax, ay) || !inside(bx, by)) return fail('off the layout');
  if (ax === bx && ay === by) return fail('same spot');
  if (!canHostStation(s, ax, ay)) return fail('no room for a station here');
  if (!canHostStation(s, bx, by)) return fail('no room for a station there');
  const A = idx(ax, ay);
  const B = idx(bx, by);
  const N = W * H;
  const dist = new Map();
  const prev = new Map();
  const heap = new Heap();
  const relax = (key, d, from) => {
    if (d < (dist.get(key) ?? Infinity)) {
      dist.set(key, d);
      prev.set(key, from);
      heap.push(key, d);
    }
  };
  // Leave A by any edge on a straight piece through it (a platform is straight).
  for (let e = 0; e < 4; e++) {
    const nx = ax + DIRS[e][0];
    const ny = ay + DIRS[e][1];
    if (!inside(nx, ny)) continue;
    const c = pieceCost(s, A, opp(e), e);
    if (!c) continue;
    relax(idx(nx, ny) * 4 + opp(e), c.weight, { start: e });
  }
  let goal = null;
  while (heap.size) {
    const [d, key] = heap.pop();
    if (d > (dist.get(key) ?? Infinity)) continue;
    if (key >= N * 4) {
      goal = key;
      break;
    }
    const t = key >> 2;
    const ein = key & 3;
    if (t === A) continue;
    if (t === B) {
      const c = pieceCost(s, B, ein, opp(ein));
      if (c) relax(N * 4 + ein, d + c.weight, { from: key });
      continue;
    }
    const tx = t % W;
    const ty = (t / W) | 0;
    for (let out = 0; out < 4; out++) {
      if (out === ein) continue;
      const nx = tx + DIRS[out][0];
      const ny = ty + DIRS[out][1];
      if (!inside(nx, ny)) continue;
      const c = pieceCost(s, t, ein, out);
      if (!c) continue;
      relax(idx(nx, ny) * 4 + opp(out), d + c.weight, { from: key, out });
    }
  }
  if (goal === null) return fail('no way through');

  // Walk back from the goal to build the steps.
  const mids = [];
  let key = goal;
  const endIn = goal - N * 4;
  let p = prev.get(key);
  key = p.from;
  let startEdge = null;
  while (key !== undefined) {
    const pr = prev.get(key);
    const t = key >> 2;
    const ein = key & 3;
    if (pr.start !== undefined) {
      startEdge = pr.start;
      mids.push({ t, i: ein, o: null });
      break;
    }
    mids.push({ t, i: ein, o: null });
    key = pr.from;
  }
  mids.reverse();
  // Each tile's exit edge is the edge that led into the next one.
  const path = [{ x: ax, y: ay, i: opp(startEdge), o: startEdge }];
  for (let k = 0; k < mids.length; k++) {
    const m = mids[k];
    const next = k + 1 < mids.length ? mids[k + 1] : null;
    const o = next ? opp(next.i) : opp(endIn);
    path.push({ x: m.t % W, y: (m.t / W) | 0, i: m.i, o });
  }
  // The last mid is B itself: its exit is straight on from the entry edge.
  const last = path[path.length - 1];
  last.o = opp(last.i);

  const pieces = [];
  let track = 0;
  for (const st of path) {
    const i = idx(st.x, st.y);
    const c = pieceCost(s, i, st.i, st.o);
    if (!c) return fail('blocked');
    if (c.money > 0) {
      pieces.push({ x: st.x, y: st.y, bit: pieceBit(st.i, st.o), money: c.money });
      track += c.money;
    }
  }
  const newA = s.station[A] < 0;
  const newB = s.station[B] < 0;
  const stations = (newA ? COST.station : 0) + (newB ? COST.station : 0);
  const service = !newA && !newB ? findService(s, s.station[A], s.station[B]) : null;
  const train = service ? 0 : newestModel(s).cost;
  return {
    ok: true,
    ax,
    ay,
    bx,
    by,
    path,
    pieces,
    newA,
    newB,
    service: service ? service.id : null,
    cost: { track, stations, train, total: track + stations + train },
    length: pathLength(path),
    dist: Math.abs(ax - bx) + Math.abs(ay - by),
  };
}

export function findService(s, a, b) {
  return s.services.find((v) => (v.a === a && v.b === b) || (v.a === b && v.b === a)) || null;
}

/** Cash available for building: what's in the bank plus what the bank would still lend. */
export const spendable = (s) => s.cash + (LOAN.max - s.loan);

/** Borrows in steps until cash covers `need` (if the loan allows). Returns the amount borrowed. */
function borrowFor(s, need) {
  let got = 0;
  while (s.cash < need && s.loan < LOAN.max) {
    const amt = Math.min(LOAN.step, LOAN.max - s.loan);
    s.loan += amt;
    s.cash += amt;
    got += amt;
  }
  if (got) emit(s, 'borrow', { amount: got, auto: true });
  return got;
}

/** Tiles from (x, y) to the nearest tile of an industry's footprint. */
export function footDist(o, x, y) {
  const dx = x < o.x ? o.x - x : x >= o.x + o.w ? x - (o.x + o.w - 1) : 0;
  const dy = y < o.y ? o.y - y : y >= o.y + o.h ? y - (o.y + o.h - 1) : 0;
  return dx + dy;
}

/**
 * Which industry each end of a new line is for: at A one that sends what B takes, at B one that
 * takes what A sends. Names the stations after their role on the line ({ a, b }: ids or null).
 */
export function lineRoles(s, ax, ay, bx, by) {
  const ca = coverage(s, ax, ay);
  const cb = coverage(s, bx, by);
  const sends = (o, acc) => {
    const d = INDUSTRY[o.kind];
    return (d.makes && acc.has(d.makes)) || (d.turns && acc.has(d.turns));
  };
  const takes = (o, sup) => (INDUSTRY[o.kind].takes || []).some((c) => sup.has(c));
  const pick = (cov, x, y, ok) =>
    cov.inds
      .map((id) => s.industries[id])
      .filter(ok)
      .sort((p, q) => footDist(p, x, y) - footDist(q, x, y))[0]?.id ?? null;
  return {
    a: pick(ca, ax, ay, (o) => sends(o, cb.accepts) || takes(o, cb.supplies)),
    b: pick(cb, bx, by, (o) => takes(o, ca.supplies) || sends(o, ca.accepts)),
  };
}

function stationName(s, x, y, prefer = null) {
  const cov = coverage(s, x, y);
  const byDist = s.towns.slice().sort((a, b) => man(a, { x, y }) - man(b, { x, y }));
  const town = byDist[0];
  const taken = (n) => s.stations.some((st) => st.name === n);
  const tries = [];
  const nearInd = prefer !== null ? s.industries[prefer] : cov.inds.map((id) => s.industries[id]).sort((a, b) => footDist(a, x, y) - footDist(b, x, y))[0];
  const mainTown = [...cov.towns.entries()].sort((a, b) => b[1] - a[1])[0];
  if (mainTown && mainTown[1] >= 6) tries.push(s.towns[mainTown[0]].name);
  if (nearInd) tries.push(nearInd.name);
  if (mainTown) tries.push(s.towns[mainTown[0]].name);
  const dx = x - town.x;
  const dy = y - town.y;
  // Screen-ish compass: the layout's north is up-right, but players read the map, so use tile axes.
  const side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'East' : 'West') : dy > 0 ? 'South' : 'North';
  const base = tries[0] || `${town.name} Halt`;
  tries.push(`${base.split(' ')[0]} ${side}`, `${town.name} Halt`, `${town.name} Road`, `${town.name} Junction`, `${town.name} Sidings`);
  for (const n of tries) if (!taken(n)) return n;
  for (let k = 2; ; k++) if (!taken(`${base} ${k}`)) return `${base} ${k}`;
}

function addStation(s, x, y, prefer = null) {
  const i = idx(x, y);
  const st = { id: s.nextId++, x, y, name: '', waiting: {}, rating: {}, last: {}, speed: {}, built: s.day };
  st.name = stationName(s, x, y, prefer);
  s.stations.push(st);
  s.station[i] = st.id;
  s.trees[i] = 0;
  s.topo++;
  return st;
}

/** Lays a planned route. Returns { ok, service, train, borrowed } or { ok: false, reason }. */
export function build(s, plan, { train = true } = {}) {
  if (!plan?.ok) return { ok: false, reason: plan?.reason || 'no plan' };
  // Re-plan so a stale preview can't lay track over something that changed since.
  const fresh = planRoute(s, plan.ax, plan.ay, plan.bx, plan.by);
  if (!fresh.ok) return { ok: false, reason: fresh.reason };
  plan = fresh;
  const total = plan.cost.track + plan.cost.stations + (train && !plan.service ? plan.cost.train : 0);
  if (total > spendable(s)) return { ok: false, reason: 'not enough money', need: total };
  const borrowed = borrowFor(s, total);
  for (const p of plan.pieces) {
    const i = idx(p.x, p.y);
    s.track[i] |= p.bit;
    s.trees[i] = 0;
  }
  s.cash -= plan.cost.track + plan.cost.stations;
  s.infra += plan.cost.track + plan.cost.stations;
  s.year.build += plan.cost.track + plan.cost.stations;
  const roles = lineRoles(s, plan.ax, plan.ay, plan.bx, plan.by);
  const A = s.station[idx(plan.ax, plan.ay)] >= 0 ? stationById(s, s.station[idx(plan.ax, plan.ay)]) : addStation(s, plan.ax, plan.ay, roles.a);
  const B = s.station[idx(plan.bx, plan.by)] >= 0 ? stationById(s, s.station[idx(plan.bx, plan.by)]) : addStation(s, plan.bx, plan.by, roles.b);
  s.topo++;
  let svc = findService(s, A.id, B.id);
  let t = null;
  if (!svc && train) {
    svc = { id: s.nextId++, a: A.id, b: B.id, colour: LINE_COLOURS[s.colour++ % LINE_COLOURS.length], income: 0, cost: 0, last: null, term: 0, trips: 0, opened: s.day };
    s.services.push(svc);
    s.stats.routes++;
    t = buyTrain(s, svc.id, { free: false });
  }
  // Trains that were lost may have a way home now.
  for (const tr of s.trains) if (tr.lost) tr.wait = Math.min(tr.wait, 0.1);
  emit(s, 'built', { a: A.id, b: B.id, service: svc?.id ?? null, train: t?.id ?? null, cost: total, pieces: plan.pieces.length, borrowed });
  return { ok: true, service: svc, train: t, borrowed, a: A, b: B };
}

/** Buys a train of the newest class for a service. It starts at whichever end has more waiting. */
export function buyTrain(s, svcId) {
  const svc = serviceById(s, svcId);
  if (!svc) return null;
  const m = newestModel(s);
  if (m.cost > spendable(s)) return null;
  borrowFor(s, m.cost);
  s.cash -= m.cost;
  s.year.trains += m.cost;
  const A = stationById(s, svc.a);
  const B = stationById(s, svc.b);
  const waitAt = (st, other) => {
    const acc = stationCov(s, other).accepts;
    let n = 0;
    for (const c in st.waiting) if (acc.has(c)) n += st.waiting[c];
    return n;
  };
  const startB = waitAt(B, A) > waitAt(A, B);
  const t = {
    id: s.nextId++,
    svc: svc.id,
    model: m.id,
    cost: m.cost,
    born: s.day,
    at: startB ? B.id : A.id,
    state: 'load',
    wait: 0.5 + 0.25 * s.trains.filter((x) => x.svc === svc.id).length,
    path: null,
    prev: null,
    pos: 0,
    len: 0,
    cargo: [],
    profit: 0,
    lastProfit: null,
    lost: false,
    trips: 0,
  };
  s.trains.push(t);
  s.stats.trainsBought++;
  emit(s, 'train', { train: t.id, service: svc.id });
  return t;
}

export function sellTrain(s, trainId) {
  const t = trainById(s, trainId);
  if (!t) return false;
  const v = trainValue(s, t);
  s.cash += v;
  s.year.sold += v;
  s.trains = s.trains.filter((x) => x !== t);
  const svc = serviceById(s, t.svc);
  if (svc && !s.trains.some((x) => x.svc === svc.id)) s.services = s.services.filter((x) => x !== svc);
  emit(s, 'sold', { train: t.id, amount: v });
  return true;
}

/** Replaces every train on a service older than the newest class. Returns the cost, or null if unaffordable. */
export function modernisePrice(s, svcId) {
  const m = newestModel(s);
  let cost = 0;
  let n = 0;
  for (const t of s.trains)
    if (t.svc === svcId && t.model !== m.id) {
      cost += m.cost - Math.round(TRADE_IN * trainValue(s, t));
      n++;
    }
  return { cost, n, model: m };
}
export function modernise(s, svcId) {
  const { cost, n, model } = modernisePrice(s, svcId);
  if (!n || cost > spendable(s)) return null;
  borrowFor(s, cost);
  s.cash -= cost;
  s.year.trains += cost;
  for (const t of s.trains)
    if (t.svc === svcId && t.model !== model.id) {
      t.model = model.id;
      t.cost = model.cost;
      t.born = s.day;
    }
  emit(s, 'modernised', { service: svcId, n, cost, model: model.id });
  return cost;
}

/** What's on a tile, for bulldozing and the Look tool. */
export function tileInfo(s, x, y) {
  if (!inside(x, y)) return null;
  const i = idx(x, y);
  return {
    x,
    y,
    ground: s.ground[i],
    trees: s.trees[i],
    track: s.track[i],
    road: s.road[i],
    house: s.house[i],
    town: s.owner[i] >= 0 ? s.towns[s.owner[i]] : null,
    industry: s.ind[i] >= 0 ? s.industries[s.ind[i]] : null,
    station: s.station[i] >= 0 ? stationById(s, s.station[i]) : null,
  };
}

/** Tiles a train occupies right now (its current step and the step its tail is on). */
function trainTiles(t) {
  const out = new Set();
  const add = (p) => p && p.forEach((st) => out.add(idx(st.x, st.y)));
  // Conservative: the whole of the current path and the end of the previous one.
  if (t.state === 'run' && t.path) add(t.path);
  if (t.prev) add(t.prev.slice(-3));
  if (t.path && t.state === 'load') add(t.path.slice(-3));
  return out;
}

/** Bulldozes the track or station on a tile. Returns { ok, refund, reason }. */
export function bulldoze(s, x, y) {
  if (!inside(x, y)) return { ok: false, reason: 'off the layout' };
  const i = idx(x, y);
  if (s.station[i] >= 0) {
    const st = stationById(s, s.station[i]);
    const svcs = s.services.filter((v) => v.a === st.id || v.b === st.id);
    let sold = 0;
    for (const v of svcs) for (const t of s.trains.filter((x) => x.svc === v.id)) (sold += trainValue(s, t)), sellTrain(s, t.id);
    const refund = Math.round(COST.station * COST.refund);
    s.cash += refund;
    s.infra = Math.max(0, s.infra - COST.station);
    s.stations = s.stations.filter((x) => x !== st);
    s.station[i] = -1;
    s.topo++;
    emit(s, 'bulldozed', { x, y, station: st.id, refund, sold });
    return { ok: true, refund, sold, station: st.name };
  }
  if (!s.track[i]) return { ok: false, reason: 'nothing to clear' };
  for (const t of s.trains) if (trainTiles(t).has(i)) return { ok: false, reason: 'a train is using that track' };
  const n = countPieces(s.track[i]);
  const base = s.ground[i] === WATER ? COST.bridge : COST.track;
  const refund = Math.round(n * base * COST.refund);
  s.cash += refund;
  s.infra = Math.max(0, s.infra - n * base);
  s.track[i] = 0;
  s.topo++;
  emit(s, 'bulldozed', { x, y, refund });
  return { ok: true, refund };
}

export function borrow(s, amount = LOAN.step) {
  const amt = Math.min(amount, LOAN.max - s.loan);
  if (amt <= 0) return 0;
  s.loan += amt;
  s.cash += amt;
  emit(s, 'borrow', { amount: amt });
  return amt;
}
export function repay(s, amount = LOAN.step) {
  const amt = Math.min(amount, s.loan, Math.max(0, Math.floor(s.cash)));
  if (amt <= 0) return 0;
  s.loan -= amt;
  s.cash -= amt;
  emit(s, 'repay', { amount: amt });
  return amt;
}

// ---------------------------------------------------------------------------------------------
// Trains

/** Shortest way over existing track from station tile a to station tile b (steps), or null. */
export function findPath(s, a, b) {
  const A = idx(a.x, a.y);
  const B = idx(b.x, b.y);
  const N = W * H;
  const dist = new Map();
  const prev = new Map();
  const heap = new Heap();
  const relax = (key, d, from) => {
    if (d < (dist.get(key) ?? Infinity)) {
      dist.set(key, d);
      prev.set(key, from);
      heap.push(key, d + 0);
    }
  };
  for (const e of [0, 1, 2, 3]) {
    if (!(s.track[A] & pieceBit(opp(e), e))) continue;
    const nx = a.x + DIRS[e][0];
    const ny = a.y + DIRS[e][1];
    if (!inside(nx, ny)) continue;
    relax(idx(nx, ny) * 4 + opp(e), 0.5, { start: e });
  }
  let goal = null;
  while (heap.size) {
    const [d, key] = heap.pop();
    if (d > (dist.get(key) ?? Infinity)) continue;
    if (key >= N * 4) {
      goal = key;
      break;
    }
    const t = key >> 2;
    const ein = key & 3;
    if (t === B) {
      if (s.track[B] & pieceBit(ein, opp(ein))) relax(N * 4 + ein, d + 0.5, { from: key });
      continue;
    }
    if (t === A) continue;
    const tx = t % W;
    const ty = (t / W) | 0;
    for (const out of exitsFrom(s.track[t], ein)) {
      const nx = tx + DIRS[out][0];
      const ny = ty + DIRS[out][1];
      if (!inside(nx, ny)) continue;
      // The next tile must have a piece that starts at the edge we arrive by.
      if (!exitsFrom(s.track[idx(nx, ny)], opp(out)).length) continue;
      relax(idx(nx, ny) * 4 + opp(out), d + pieceLen(ein, out), { from: key });
    }
  }
  if (goal === null) return null;
  const rev = [];
  let key = prev.get(goal).from;
  let startEdge = null;
  while (key !== undefined) {
    const pr = prev.get(key);
    rev.push(key);
    if (pr.start !== undefined) {
      startEdge = pr.start;
      break;
    }
    key = pr.from;
  }
  rev.reverse();
  const path = [{ x: a.x, y: a.y, i: opp(startEdge), o: startEdge }];
  for (let k = 0; k < rev.length; k++) {
    const t = rev[k] >> 2;
    const ein = rev[k] & 3;
    const o = k + 1 < rev.length ? opp(rev[k + 1] & 3) : opp(ein);
    path.push({ x: t % W, y: (t / W) | 0, i: ein, o });
  }
  return path;
}

const otherEnd = (svc, stId) => (svc.a === stId ? svc.b : svc.a);

function depart(s, t) {
  const svc = serviceById(s, t.svc);
  const from = stationById(s, t.at);
  const to = stationById(s, otherEnd(svc, t.at));
  const path = findPath(s, from, to);
  if (!path) {
    if (!t.lost) emit(s, 'lost', { train: t.id, service: svc.id });
    t.lost = true;
    t.wait = 3;
    return;
  }
  t.lost = false;
  t.prev = t.path;
  t.path = path;
  t.len = pathLength(path);
  t.pos = 0;
  t.state = 'run';
  t.to = to.id;
  emit(s, 'depart', { train: t.id, station: from.id });
}

export function timeFactor(c, days) {
  const k = CARGO[c];
  if (days <= k.fresh) return 1;
  if (days >= k.stale) return 0.3;
  return 1 - (0.7 * (days - k.fresh)) / (k.stale - k.fresh);
}

function subsidyFor(s, c, from, to) {
  for (const sb of s.subsidies)
    if (sb.awarded && sb.c === c && ((sb.from === from.id && sb.to === to.id) || (c === 'pax' && sb.from === to.id && sb.to === from.id))) return sb;
  return null;
}

const covers = (s, st, end) => {
  const cov = stationCov(s, st);
  if (end.ind !== undefined) return cov.inds.includes(end.ind);
  return cov.towns.has(end.town);
};

function pay(s, t, st, pk) {
  const from = stationById(s, pk.from);
  if (!from) return 0;
  const dist = man(from, st);
  const days = s.day - pk.day;
  // Award an open subsidy to the first delivery that matches it.
  for (const sb of s.subsidies) {
    if (sb.awarded || sb.c !== pk.c) continue;
    if (covers(s, from, sb.src) && covers(s, st, sb.dst)) {
      sb.awarded = true;
      sb.from = from.id;
      sb.to = st.id;
      sb.ends = s.day + 2 * YEAR;
      emit(s, 'subsidyWon', { subsidy: sb.id, c: sb.c, from: from.id, to: st.id });
    }
  }
  const sub = subsidyFor(s, pk.c, from, st);
  const amount = Math.round(pk.n * CARGO[pk.c].rate * dist * timeFactor(pk.c, days) * (sub ? 2 : 1));
  s.cash += amount;
  s.year.income += amount;
  s.year.cargo[pk.c] += amount;
  s.carried[pk.c] += pk.n;
  t.profit += amount;
  const svc = serviceById(s, t.svc);
  svc.income += amount;
  svc.term += amount;
  // Feed the industries and towns at this end.
  const cov = stationCov(s, st);
  const taker = cov.inds.map((id) => s.industries[id]).find((o) => (INDUSTRY[o.kind].takes || []).includes(pk.c));
  if (taker) taker.got += pk.n;
  if (pk.c === 'goods' || pk.c === 'pax') {
    const main = [...cov.towns.entries()].sort((a, b) => b[1] - a[1])[0];
    if (main) {
      const town = s.towns[main[0]];
      if (pk.c === 'goods') town.goods += pk.n;
      else town.paxIn = (town.paxIn || 0) + pk.n;
    }
  }
  return amount;
}

function arrive(s, t) {
  const st = stationById(s, t.to);
  const svc = serviceById(s, t.svc);
  t.at = st.id;
  t.trips++;
  svc.trips++;
  const acc = stationCov(s, st).accepts;
  let moved = 0;
  let earned = 0;
  const parts = [];
  const keep = [];
  for (const pk of t.cargo) {
    if (pk.from === st.id) {
      st.waiting[pk.c] = (st.waiting[pk.c] || 0) + pk.n;
    } else if (acc.has(pk.c)) {
      const amt = pay(s, t, st, pk);
      earned += amt;
      moved += pk.n;
      parts.push({ c: pk.c, n: pk.n, amount: amt });
    } else keep.push(pk);
  }
  t.cargo = keep;
  if (parts.length) emit(s, 'pay', { station: st.id, train: t.id, amount: earned, parts });

  // First train into a town: the citizens celebrate.
  const cov = stationCov(s, st);
  for (const [tid, n] of cov.towns)
    if (n >= 2 && !s.towns[tid].firstTrain) {
      s.towns[tid].firstTrain = true;
      emit(s, 'firstTrain', { town: tid, station: st.id });
    }

  moved += loadTrain(s, t, st);
  t.state = 'load';
  t.wait = 1.2 + moved / 35;
  t.waited = 0;
}

const loadOf = (t) => t.cargo.reduce((a, p) => a + p.n, 0);

/** Loads whatever the far end wants, the biggest pile first. Returns the units loaded. */
function loadTrain(s, t, st) {
  const svc = serviceById(s, t.svc);
  const cov = stationCov(s, st);
  const far = stationById(s, otherEnd(svc, st.id));
  const farAcc = stationCov(s, far).accepts;
  const m = MODEL[t.model];
  let room = m.cap - loadOf(t);
  let moved = 0;
  const kinds = Object.keys(st.waiting)
    .filter((c) => farAcc.has(c) && st.waiting[c] >= 1)
    .sort((a, b) => st.waiting[b] - st.waiting[a]);
  for (const c of kinds) {
    // Pickups count even when the train leaves full of something else.
    st.last[c] = s.day;
    st.speed[c] = m.speed;
    if (room <= 0) continue;
    const n = Math.min(room, Math.floor(st.waiting[c]));
    if (n <= 0) continue;
    st.waiting[c] -= n;
    room -= n;
    moved += n;
    const same = t.cargo.find((p) => p.c === c && p.from === st.id);
    if (same) same.n += n;
    else t.cargo.push({ c, n, from: st.id, day: s.day });
    if (c === 'pax') {
      const main = [...cov.towns.entries()].sort((a, b) => b[1] - a[1])[0];
      if (main) s.towns[main[0]].paxOut += n;
    }
  }
  // Mark every cargo the far end wants as picked up (a visit), so ratings know the service is there.
  for (const c of activeCargo(s, st)) if (farAcc.has(c)) st.last[c] = s.day;
  return moved;
}

/** Wait for a load: an empty-ish train at a station that sends cargo to the far end waits up to 20 days for a third of a load. */
const WAIT_FOR_LOAD = 20;
function wantsToWait(s, t) {
  if ((t.waited || 0) >= WAIT_FOR_LOAD) return false;
  if (loadOf(t) >= MODEL[t.model].cap / 3) return false;
  const svc = serviceById(s, t.svc);
  const st = stationById(s, t.at);
  const farAcc = stationCov(s, stationById(s, otherEnd(svc, st.id))).accepts;
  for (const c of stationCov(s, st).supplies) if (farAcc.has(c)) return true;
  return false;
}

// ---------------------------------------------------------------------------------------------
// The calendar

/** Runs the railway for `days` (split into small steps). Does nothing while held (a Board meeting) or over. */
const TICK = 10;

export function step(s, days) {
  let left = days;
  while (left > 1e-9) {
    if (s.hold || (s.over && !s.freePlay)) return;
    const dt = Math.min(left, 0.25);
    const before = Math.floor(s.day / TICK);
    // Never step past a ten-day boundary: output arrives, and the month's books close, exactly then.
    const toBoundary = (before + 1) * TICK - s.day;
    const d = Math.min(dt, toBoundary);
    for (const t of s.trains) {
      if (t.state === 'load') {
        t.wait -= d;
        if (t.wait > 0) continue;
        if (wantsToWait(s, t)) {
          t.waited = (t.waited || 0) + d;
          const n = loadTrain(s, t, stationById(s, t.at));
          if (n) t.wait = n / 35;
        } else {
          t.waited = 0;
          depart(s, t);
        }
      } else {
        t.pos += MODEL[t.model].speed * d;
        if (t.pos >= t.len) {
          t.pos = t.len;
          arrive(s, t);
        }
      }
    }
    s.day += d;
    left -= d;
    if (Math.floor((s.day + 1e-9) / TICK) > before) {
      s.day = Math.round(s.day);
      produce(s);
      if (s.day % MONTH === 0) monthEnd(s);
      if (s.day % YEAR === 0) yearEnd(s);
    }
  }
}

function covering(s) {
  // Every station's reach, inverted: industry id → stations, house tile → stations.
  const byInd = new Map();
  const byHouse = new Map();
  for (const st of s.stations) {
    const cov = stationCov(s, st);
    for (const id of cov.inds) (byInd.get(id) || byInd.set(id, []).get(id)).push(st);
    if (cov.houses)
      for (let dy = -RADIUS; dy <= RADIUS; dy++)
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
          const x = st.x + dx;
          const y = st.y + dy;
          if (!inside(x, y) || !s.house[idx(x, y)]) continue;
          const i = idx(x, y);
          (byHouse.get(i) || byHouse.set(i, []).get(i)).push(st);
        }
  }
  return { byInd, byHouse };
}

function rating(st, c) {
  if (st.rating[c] === undefined) st.rating[c] = 0.55;
  return st.rating[c];
}

function deliverTo(s, list, c, amount, actives) {
  const active = list.filter((st) => actives.get(st.id).has(c));
  if (!active.length || amount <= 0) return 0;
  let moved = 0;
  for (const st of active) {
    const got = (amount / active.length) * rating(st, c);
    st.waiting[c] = Math.min(MAX_WAITING, (st.waiting[c] || 0) + got);
    moved += got;
  }
  return moved;
}

/** Every ten days: industries send a third of a month's output, secondaries turn what they were sent into goods, houses make passengers. */
function produce(s) {
  const { byInd, byHouse } = covering(s);
  const actives = new Map(s.stations.map((st) => [st.id, activeCargo(s, st)]));
  const share = TICK / MONTH;
  for (const o of s.industries) {
    const def = INDUSTRY[o.kind];
    let made = 0;
    let c = null;
    if (def.makes) {
      c = def.makes;
      made = o.prod * share;
    } else if (def.turns) {
      c = def.turns;
      made = o.got;
      o.monthGot = (o.monthGot || 0) + o.got;
      o.got = 0;
    }
    if (!c || made <= 0) continue;
    o.made += made;
    o.moved += deliverTo(s, byInd.get(o.id) || [], c, made, actives);
  }
  for (const [i, list] of byHouse) {
    const pax = HOUSE_POP[s.house[i]] * PAX_RATE * share;
    const town = s.towns[s.owner[i]];
    town.paxMade = (town.paxMade || 0) + pax;
    deliverTo(s, list, 'pax', pax, actives);
  }
}

function monthEnd(s) {
  const actives = new Map(s.stations.map((st) => [st.id, activeCargo(s, st)]));
  // A secondary's output this month, for its card and the estimates.
  for (const o of s.industries)
    if (INDUSTRY[o.kind].turns) {
      o.prod = Math.round(o.monthGot || 0);
      o.monthGot = 0;
    }

  // Ratings drift toward what the service deserves.
  for (const st of s.stations) {
    for (const c of actives.get(st.id)) {
      const since = st.last[c] === undefined ? 999 : s.day - st.last[c];
      const fresh = since <= 15 ? 0.3 : since <= 30 ? 0.22 : since <= 60 ? 0.1 : since <= 120 ? 0.03 : 0;
      const spd = Math.max(0, Math.min(1, ((st.speed[c] || 0.2) - 0.2) / 0.4)) * 0.17;
      const w = st.waiting[c] || 0;
      const pen = w > 400 ? 0.2 : w > 200 ? 0.12 : w > 100 ? 0.05 : 0;
      const target = Math.max(0.08, Math.min(0.95, 0.3 + fresh + spd - pen));
      st.rating[c] = rating(st, c) + (target - rating(st, c)) * 0.5;
    }
  }

  // Towns grow when they're served.
  for (const t of s.towns) {
    const served = (t.paxOut || 0) > 0;
    const goods = t.goods || 0;
    const p = 0.03 + (served ? 0.13 : 0) + Math.min(0.2, goods / 300);
    if (rnd(s) < p) growTown(s, t);
    if (served && rnd(s) < 0.15) growTown(s, t);
    t.lastPax = t.paxOut || 0;
    t.lastGoods = goods;
    t.paxOut = 0;
    t.goods = 0;
    t.paxIn = 0;
  }

  // The bills.
  let running = 0;
  for (const t of s.trains) {
    const r = MODEL[t.model].run / 12;
    running += r;
    t.profit -= r;
    const svc = serviceById(s, t.svc);
    if (svc) {
      svc.cost += r;
      svc.term -= r;
    }
  }
  let pieces = 0;
  for (let i = 0; i < W * H; i++) if (s.track[i]) pieces += countPieces(s.track[i]);
  const upkeep = (pieces * COST.upkeepPiece + s.stations.length * COST.upkeepStation) / 12;
  const interest = (s.loan * LOAN.rate) / 12;
  s.cash -= running + upkeep + interest;
  s.year.running += running;
  s.year.upkeep += upkeep;
  s.year.interest += interest;

  // Subsidies run out.
  for (const sb of s.subsidies.slice()) {
    if (!sb.awarded && s.day >= sb.until) {
      s.subsidies = s.subsidies.filter((x) => x !== sb);
      emit(s, 'subsidyLapsed', { subsidy: sb.id });
    } else if (sb.awarded && s.day >= sb.ends) {
      s.subsidies = s.subsidies.filter((x) => x !== sb);
      emit(s, 'subsidyEnded', { subsidy: sb.id });
    }
  }
  if (Math.round(s.day) % (YEAR / 2) === 0 && s.subsidies.filter((x) => !x.awarded).length < 2) offerSubsidy(s);

  // Short of money: the bank lends what it can, then the receivers wait three months.
  if (s.cash < 0) {
    borrowFor(s, 0);
    if (s.cash < 0) {
      s.broke++;
      emit(s, 'broke', { months: s.broke });
      if (s.broke >= 3 && !s.freePlay) {
        s.over = { reason: 'bankrupt', day: s.day, value: companyValue(s) };
        emit(s, 'over', { reason: 'bankrupt' });
      }
    } else s.broke = 0;
  } else s.broke = 0;

  s.history.push({ day: s.day, value: companyValue(s) });
  emit(s, 'month', { value: companyValue(s) });
}

function growTown(s, t) {
  const dirs = DIRS;
  const spots = [];
  const ups = [];
  const R = 4 + Math.floor(t.pop / 500);
  for (let y = t.y - R; y <= t.y + R; y++)
    for (let x = t.x - R; x <= t.x + R; x++) {
      if (!inside(x, y)) continue;
      const i = idx(x, y);
      const d = Math.abs(x - t.x) + Math.abs(y - t.y);
      if (s.house[i] && s.owner[i] === t.id) {
        const cap = d <= 1 ? 4 : d <= 2 ? 3 : d <= 4 ? 2 : 1;
        if (s.house[i] < cap) ups.push(i);
        continue;
      }
      if (s.ground[i] === WATER || s.ground[i] === ROCK || s.road[i] || s.house[i] || s.ind[i] >= 0 || s.track[i] || s.station[i] >= 0) continue;
      let near = false;
      for (const [dx, dy] of dirs) {
        if (!inside(x + dx, y + dy)) continue;
        const j = idx(x + dx, y + dy);
        if (s.owner[j] === t.id && (s.road[j] || s.house[j] || j === idx(t.x, t.y))) near = true;
      }
      if (near) spots.push(i);
    }
  let i = -1;
  if (ups.length && (rnd(s) < 0.4 || !spots.length)) {
    i = ups[Math.floor(rnd(s) * ups.length)];
    s.house[i]++;
  } else if (spots.length) {
    // Prefer spots close to the centre.
    spots.sort((a, b) => Math.abs((a % W) - t.x) + Math.abs(((a / W) | 0) - t.y) - (Math.abs((b % W) - t.x) + Math.abs(((b / W) | 0) - t.y)));
    i = spots[Math.floor(rnd(s) * Math.min(spots.length, 6))];
    s.house[i] = 1;
    s.owner[i] = t.id;
    s.trees[i] = 0;
    if (s.ground[i] === FIELD) s.ground[i] = GRASS;
  }
  if (i < 0) return false;
  const before = t.pop;
  t.pop = 0;
  for (let j = 0; j < W * H; j++) if (s.house[j] && s.owner[j] === t.id) t.pop += HOUSE_POP[s.house[j]];
  s.topo++;
  emit(s, 'grow', { town: t.id, x: i % W, y: (i / W) | 0, pop: t.pop });
  // Milestones make the paper.
  for (const mark of [500, 750, 1000, 1500, 2000, 3000])
    if (before < mark && t.pop >= mark) emit(s, 'news', { kind: 'town', town: t.id, text: `${t.name} passes ${mark.toLocaleString('en-GB')} people` });
  return true;
}

function yearEnd(s) {
  const year = yearOf(s.day);
  s.last = { ...s.year, year: year - 1, value: companyValue(s) };
  s.year = freshYear();
  for (const v of s.services) {
    v.last = { income: v.income, cost: v.cost };
    v.income = 0;
    v.cost = 0;
  }
  for (const t of s.trains) {
    t.lastProfit = t.profit;
    t.profit = 0;
  }
  // Industries change with how well they're served.
  for (const o of s.industries) {
    const def = INDUSTRY[o.kind];
    o.lastMade = o.made;
    o.lastMoved = o.moved;
    const f = o.made ? o.moved / o.made : 0;
    o.made = 0;
    o.moved = 0;
    if (!def.makes) continue;
    const r = rnd(s);
    let ch = 0;
    if (f >= 0.55) ch = r < 0.55 ? 0.2 + 0.15 * rnd(s) : r > 0.96 ? -0.1 : 0;
    else if (f >= 0.25) ch = r < 0.3 ? 0.15 : r > 0.88 ? -0.15 : 0;
    else if (f > 0) ch = r < 0.12 ? 0.15 : r > 0.82 ? -0.2 : 0;
    else ch = r < 0.08 ? 0.15 : r > 0.88 ? -0.15 : 0;
    if (ch) {
      const before = o.prod;
      o.prod = Math.max(24, Math.min(360, Math.round(o.prod * (1 + ch))));
      if (o.prod !== before) emit(s, 'news', { kind: ch > 0 ? 'up' : 'down', industry: o.id, text: `${o.name} ${ch > 0 ? 'increases' : 'cuts'} production`, from: before, to: o.prod });
    }
  }
  // New locomotives.
  for (const m of MODELS)
    if (m.year === year && !s.models.includes(m.id)) {
      s.models.push(m.id);
      emit(s, 'model', { model: m.id });
    }
  // The Board.
  if (!s.freePlay) {
    const b = BOARD.find((x) => x.year === year);
    if (b || year === END_YEAR) {
      const value = companyValue(s);
      const final = year === END_YEAR;
      const pass = final || value >= b.target;
      const services = s.services.map((v) => ({ id: v.id, a: v.a, b: v.b, colour: v.colour, term: Math.round(v.term) }));
      s.boards.push({ year, value, target: final ? null : b.target, pass, final, services });
      for (const v of s.services) v.term = 0;
      s.hold = 'board';
      if (!pass) s.over = { reason: 'board', day: s.day, value, target: b.target };
      if (final) s.over = { reason: 'final', day: s.day, value };
      emit(s, 'board', { year, value, target: final ? null : b.target, pass, final });
    }
  }
}

/** Ends a Board meeting (the UI calls this when the ceremony closes). */
export function resume(s) {
  s.hold = null;
}

/** After 1920: keep running the line with no more targets. */
export function continueFreePlay(s) {
  if (!s.over || s.over.reason !== 'final') return false;
  s.final = s.over;
  s.over = null;
  s.freePlay = true;
  s.hold = null;
  return true;
}

// ---------------------------------------------------------------------------------------------
// Subsidies

function offerSubsidy(s, first = false) {
  const cands = [];
  const centre = (o) => ({ x: o.x + (o.w || 1) / 2, y: o.y + (o.h || 1) / 2 });
  const taken = (src, dst) => s.subsidies.some((sb) => JSON.stringify(sb.src) === JSON.stringify(src) && JSON.stringify(sb.dst) === JSON.stringify(dst));
  for (const p of s.industries) {
    const def = INDUSTRY[p.kind];
    const c = def.makes || (def.turns && p.prod > 0 ? def.turns : null);
    if (!c) continue;
    if (c === 'goods') {
      for (const t of s.towns) {
        const d = man(centre(p), t);
        if (t.pop >= 300 && d >= 9 && d <= 26) cands.push({ c, src: { ind: p.id }, dst: { town: t.id }, d, w: 1 });
      }
      continue;
    }
    for (const q of s.industries) {
      if (!(INDUSTRY[q.kind].takes || []).includes(c)) continue;
      const d = man(centre(p), centre(q));
      if (d < 9 || d > 26) continue;
      cands.push({ c, src: { ind: p.id }, dst: { ind: q.id }, d, w: c === 'coal' ? 2 : 1 });
    }
  }
  for (const a of s.towns)
    for (const b of s.towns) {
      if (a.id >= b.id) continue;
      const d = man(a, b);
      if (d >= 10 && d <= 26) cands.push({ c: 'pax', src: { town: a.id }, dst: { town: b.id }, d, w: 0.8 });
    }
  let pool = cands.filter((x) => !taken(x.src, x.dst) && !servedAlready(s, x));
  if (first) {
    const coal = pool.filter((x) => x.c === 'coal' && x.d <= 20);
    if (coal.length) pool = [coal.sort((a, b) => a.d - b.d)[0]];
  }
  if (!pool.length) return null;
  let r = rnd(s) * pool.reduce((a, x) => a + x.w, 0);
  let pick = pool[pool.length - 1];
  for (const x of pool) if ((r -= x.w) < 0) {
    pick = x;
    break;
  }
  const sb = { id: s.nextId++, c: pick.c, src: pick.src, dst: pick.dst, until: s.day + YEAR, awarded: false, from: null, to: null, ends: null };
  s.subsidies.push(sb);
  emit(s, 'subsidy', { subsidy: sb.id, c: sb.c });
  return sb;
}

function servedAlready(s, x) {
  for (const v of s.services) {
    const A = stationById(s, v.a);
    const B = stationById(s, v.b);
    if ((covers(s, A, x.src) && covers(s, B, x.dst)) || (covers(s, B, x.src) && covers(s, A, x.dst))) return true;
  }
  return false;
}

export const endName = (s, end) => (end.ind !== undefined ? s.industries[end.ind].name : s.towns[end.town].name);
export function endPos(s, end) {
  if (end.ind !== undefined) {
    const o = s.industries[end.ind];
    return { x: o.x + o.w / 2, y: o.y + o.h / 2 };
  }
  const t = s.towns[end.town];
  return { x: t.x + 0.5, y: t.y + 0.5 };
}

// ---------------------------------------------------------------------------------------------
// Estimates (the build preview and the bot)

/**
 * What a service between two spots would carry and earn per train per year, with the newest class.
 * `length` is the track length between them (from a plan).
 */
export function estimate(s, ax, ay, bx, by, length, model = newestModel(s)) {
  const ca = coverage(s, ax, ay);
  const cb = coverage(s, bx, by);
  const dist = Math.abs(ax - bx) + Math.abs(ay - by);
  const trip = length / model.speed + 2.5;
  const round = 2 * trip;
  const trips = YEAR / round;
  const flows = [];
  let income = 0;
  let trainsNeeded = 0;
  for (const [from, to, dir] of [
    [ca, cb, 'ab'],
    [cb, ca, 'ba'],
  ]) {
    let load = 0;
    let perTrip = 0;
    let monthly = 0;
    for (const c of from.supplies) {
      if (!to.accepts.has(c)) continue;
      const m = monthlySupply(s, from, c);
      if (m <= 0 && c !== 'goods') continue;
      flows.push({ c, dir, monthly: Math.round(m) });
      monthly += m * 0.6;
    }
    const supplyPerRound = (monthly * round) / MONTH;
    load = Math.min(model.cap, supplyPerRound);
    if (monthly > 0) {
      // Mixed loads pay at a weighted rate.
      let rate = 0;
      let wsum = 0;
      for (const f of flows.filter((x) => x.dir === dir)) {
        rate += CARGO[f.c].rate * timeFactor(f.c, trip) * f.monthly;
        wsum += f.monthly;
      }
      rate = wsum ? rate / wsum : 0;
      perTrip = load * rate * dist;
      trainsNeeded = Math.max(trainsNeeded, supplyPerRound / model.cap);
    }
    income += perTrip * trips;
  }
  return { flows, income: Math.round(income), profit: Math.round(income - model.run), trainsNeeded: Math.max(1, Math.round(trainsNeeded)), trips, dist };
}
