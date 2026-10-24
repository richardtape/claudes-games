// Sushi Raft's rules: a week of five nights at the pier. Pure and DOM-free: the host (or the solo
// page, a test, the simulator) owns a state object and calls these functions; step() advances a
// night by dt seconds. Every random draw goes through rnd(state), so a seed replays a week exactly.
//
//   const st = newWeek({ seed: 'abc' });   // phase 'morning' before Monday
//   openNight(st);                          // phase 'service'
//   tap(st, 0, col, row);                   // queue a station for otter 0 ('auto' routes it)
//   step(st, 1 / 60);                       // ... until phase 'closed'
//   toMorning(st);  buy(st, 'tuna_nigiri');  openNight(st);
//
// Events (st.events, each with a rising id) tell the UI what happened for sounds and juice.
import {
  CANAL,
  COLS,
  CRATES,
  DISHES,
  FESTIVAL,
  LAYOUTS,
  NIGHTS,
  PARTS,
  PREP,
  QUEUE_MAX,
  ROWS,
  SEATS,
  SPECIES,
  TIMES,
  TIP_RATE,
  TWISTS,
  UPGRADES,
  orderWeight,
  summerPatience,
  summerRent,
} from './data.js';

export const VERSION = 1;
const EVENTS_KEPT = 80;

// ── randomness ────────────────────────────────────────────────────────────────

function hash(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 on st.rng: the week's only source of randomness. */
export function rnd(st) {
  st.rng = (st.rng + 0x6d2b79f5) >>> 0;
  let t = st.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (st, a, b) => a + Math.floor(rnd(st) * (b - a + 1));
const pick = (st, arr) => arr[Math.floor(rnd(st) * arr.length)];
function weighted(st, items, w) {
  const total = items.reduce((s, it) => s + w(it), 0);
  let r = rnd(st) * total;
  for (const it of items) if ((r -= w(it)) < 0) return it;
  return items[items.length - 1];
}

function ev(st, type, data = {}) {
  // The sequence id goes last: a payload's own id (a customer's, a dish's) must never replace it.
  st.events.push({ type, t: st.svc ? st.svc.t : 0, ...data, id: ++st.eventSeq });
  if (st.events.length > EVENTS_KEPT) st.events.splice(0, st.events.length - EVENTS_KEPT);
}

// ── the week ──────────────────────────────────────────────────────────────────

/**
 * A new week. `summer` (1+) raises rent and shortens patience; `daily` marks today's tide; `solo`
 * means one player runs both otters (only used for the stats).
 */
export function newWeek({ seed = 'week', summer = 1, daily = false, solo = true } = {}) {
  const st = {
    v: VERSION,
    seed: String(seed),
    rng: hash(String(seed)),
    summer,
    daily,
    solo,
    night: 0,
    purse: 0,
    earned: 0,
    menu: ['salmon_nigiri'],
    up: {},
    twists: [],
    phase: 'morning', // morning | service | closed | over
    result: null, // 'won' | 'closed' once over
    history: [],
    offers: [],
    sel: 0,
    events: [],
    eventSeq: 0,
    svc: null,
  };
  const pool = Object.keys(TWISTS).filter((k) => k !== 'split');
  // The split kitchen is the co-op heart of the week, so it always comes, on Tuesday to Thursday.
  const nights = [null, null, null];
  nights[rint(st, 0, 2)] = 'split';
  for (let i = 0; i < 3; i++) if (!nights[i]) nights[i] = pool.splice(Math.floor(rnd(st) * pool.length), 1)[0];
  st.twists = [null, ...nights, 'festival'];
  return st;
}

export const nightInfo = (st, n = st.night) => NIGHTS[n];
export const rentFor = (st, n = st.night) => Math.round(NIGHTS[n].rent * summerRent(st.summer));
export function twistInfo(st, n = st.night) {
  const k = st.twists[n];
  if (!k) return null;
  return k === 'festival' ? { id: k, ...FESTIVAL } : { id: k, ...TWISTS[k] };
}

/** The morning market's offers: up to two dishes whose prerequisites are on the menu, and two upgrades. */
export function makeOffers(st) {
  if (st.night === 0) return (st.offers = []);
  const dishes = Object.keys(DISHES).filter((d) => !st.menu.includes(d) && (DISHES[d].needs || []).every((n) => st.menu.includes(n)));
  const ups = Object.keys(UPGRADES).filter((u) => !st.up[u]);
  const offers = [];
  for (let i = 0; i < 2 && dishes.length; i++) offers.push({ kind: 'dish', id: dishes.splice(Math.floor(rnd(st) * dishes.length), 1)[0], bought: false });
  for (let i = 0; i < 2 && ups.length; i++) offers.push({ kind: 'up', id: ups.splice(Math.floor(rnd(st) * ups.length), 1)[0], bought: false });
  return (st.offers = offers);
}

export const offerCost = (o) => (o.kind === 'dish' ? DISHES[o.id].cost : UPGRADES[o.id].cost);

/** Buy offer `i` at the market. Returns true if bought. */
export function buy(st, i) {
  const o = st.offers[i];
  if (st.phase !== 'morning' || !o || o.bought || st.purse < offerCost(o)) return false;
  st.purse -= offerCost(o);
  o.bought = true;
  if (o.kind === 'dish') st.menu.push(o.id);
  else st.up[o.id] = true;
  ev(st, 'buy', { kind: o.kind, item: o.id });
  return true;
}

// ── the kitchen ───────────────────────────────────────────────────────────────

/** Which raw ingredient (or station) a plate part comes from. */
const SOURCE = { rice: 'rice', nori: 'nori' };
for (const [raw, p] of Object.entries(PREP)) SOURCE[p.to] = raw;

/** Is this ingredient used by anything on the menu? */
function needed(menu, raw) {
  return menu.some((d) => DISHES[d].parts.some((p) => SOURCE[p] === raw));
}

/** The tiles of tonight's kitchen. Stations the menu doesn't need yet are plain counters. */
export function buildGrid(layoutId, menu, up = {}) {
  const L = LAYOUTS[layoutId];
  const grid = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const ch = L.rows[r][c];
      const t = { k: 'counter', item: null };
      if (ch === '.') t.k = 'floor';
      else if (ch === 'D') t.k = 'dock';
      else if (ch === 'R') Object.assign(t, { k: 'cooker', servings: 0, cook: 0 });
      else if (ch === 'P') t.k = 'plates';
      else if (ch === 'X') t.k = 'bin';
      else if (ch === 'B' || (ch === 'b' && up.board2)) t.k = 'board';
      else if (ch === 'p' && needed(menu, 'egg')) t.k = 'pan';
      else if (ch === 'f' && needed(menu, 'shrimp')) t.k = 'fryer';
      else if (CRATES[ch] && needed(menu, CRATES[ch])) Object.assign(t, { k: 'crate', ing: CRATES[ch] });
      grid.push(t);
    }
  return grid;
}

export const idx = (c, r) => r * COLS + c;
export const tileAt = (svc, c, r) => (c >= 0 && r >= 0 && c < COLS && r < ROWS ? svc.grid[idx(c, r)] : null);
const NEIGH = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Label every floor tile with its connected region (-1 for stations). */
function regions(grid) {
  const reg = grid.map(() => -1);
  let id = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i].k !== 'floor' || reg[i] >= 0) continue;
    const stack = [i];
    reg[i] = id;
    while (stack.length) {
      const j = stack.pop();
      const c = j % COLS;
      const r = Math.floor(j / COLS);
      for (const [dc, dr] of NEIGH) {
        const n = tileAt({ grid }, c + dc, r + dr) && idx(c + dc, r + dr);
        if (n !== null && n !== undefined && grid[n].k === 'floor' && reg[n] < 0) {
          reg[n] = id;
          stack.push(n);
        }
      }
    }
    id++;
  }
  return reg;
}

/** Floor tiles in otter `oi`'s region from which it can use tile (c, r): the tile itself if floor, else its neighbours. */
export function standSpots(svc, oi, c, r) {
  const region = svc.otters[oi].region;
  const t = tileAt(svc, c, r);
  if (!t) return [];
  if (t.k === 'floor') return svc.region[idx(c, r)] === region ? [[c, r]] : [];
  const out = [];
  for (const [dc, dr] of NEIGH) {
    const n = tileAt(svc, c + dc, r + dr);
    if (n && n.k === 'floor' && svc.region[idx(c + dc, r + dr)] === region) out.push([c + dc, r + dr]);
  }
  return out;
}

export const canReach = (svc, oi, c, r) => standSpots(svc, oi, c, r).length > 0;

/** Shortest walk (a list of tiles, excluding the start) from (c0, r0) to any of `goals`, or null. */
function path(svc, c0, r0, goals) {
  const key = (c, r) => idx(c, r);
  const want = new Set(goals.map(([c, r]) => key(c, r)));
  if (want.has(key(c0, r0))) return [];
  const prev = new Map([[key(c0, r0), null]]);
  const q = [[c0, r0]];
  while (q.length) {
    const [c, r] = q.shift();
    for (const [dc, dr] of NEIGH) {
      const nc = c + dc;
      const nr = r + dr;
      const t = tileAt(svc, nc, nr);
      const k = key(nc, nr);
      if (!t || t.k !== 'floor' || prev.has(k)) continue;
      prev.set(k, key(c, r));
      if (want.has(k)) {
        const out = [];
        for (let at = k; at !== key(c0, r0); at = prev.get(at)) out.unshift([at % COLS, Math.floor(at / COLS)]);
        return out;
      }
      q.push([nc, nr]);
    }
  }
  return null;
}

// ── plates and dishes ─────────────────────────────────────────────────────────

/** Can `part` go on `plate` and still be on the way to something on the menu? */
export function canAdd(st, plate, part) {
  if (!PARTS.includes(part) || plate.parts.includes(part)) return false;
  const want = [...plate.parts, part];
  return st.menu.some((d) => want.every((p) => DISHES[d].parts.includes(p)));
}

/** The finished dish on a plate, or null. */
export function dishOf(st, plate) {
  if (!plate?.plate) return null;
  return st.menu.find((d) => DISHES[d].parts.length === plate.parts.length && DISHES[d].parts.every((p) => plate.parts.includes(p))) || null;
}

// ── a night ───────────────────────────────────────────────────────────────────

function nightParams(st) {
  const twist = st.twists[st.night];
  return {
    twist,
    layout: twist === 'split' ? 'split' : 'open',
    walk: TIMES.walk * (st.up.sandals ? 1.25 : 1),
    slice: TIMES.slice * (st.up.knife ? 2 / 3 : 1),
    rice: st.up.cooker ? 3.5 : TIMES.rice,
    servings: twist === 'smallrice' ? 3 : st.up.cooker ? 9 : TIMES.riceServings,
    burn: st.up.timer ? 2 : 1,
    canal: twist === 'slowtide' ? 0.65 : 1,
    lanterns: st.up.lanterns ? TIMES.lanterns - 1 : TIMES.lanterns,
    tip: TIP_RATE * (st.up.jar ? 1.5 : 1),
    patience: summerPatience(st.summer) * (st.up.cat ? 1.2 : 1) * (NIGHTS[st.night].patience ?? 1),
    gulls: twist === 'gulls' || twist === 'festival',
  };
}

function orderFor(st, sp, size) {
  const order = [];
  const fav = SPECIES[sp].fav;
  for (let i = 0; i < size; i++) order.push(st.menu.includes(fav) && rnd(st) < 0.35 ? fav : weighted(st, st.menu, (d) => orderWeight(DISHES[d].parts.length)));
  return order;
}

function planArrivals(st, P) {
  const N = NIGHTS[st.night];
  const list = [];
  const kinds = Object.keys(SPECIES).filter((k) => !SPECIES[k].vip);
  const weight = (k) => SPECIES[k].weight * (P.twist === 'puffers' && k === 'puffer' ? 5 : 1);
  const span = TIMES.open - 16;
  const gap = span / N.guests;
  for (let i = 0; i < N.guests; i++) {
    const at = Math.max(1.5, 2 + i * gap + (rnd(st) - 0.5) * gap * 0.6);
    const sp = weighted(st, kinds, weight);
    const [lo, hi] = SPECIES[sp].orders;
    list.push({ at, sp, order: orderFor(st, sp, rint(st, lo, Math.min(hi, N.maxOrder))) });
  }
  if (P.twist === 'penguins') {
    // Three school trips: three penguins a moment apart, all after the same dish.
    for (let k = 0; k < 3; k++) {
      const at = 12 + k * 40 + rnd(st) * 10;
      const dish = pick(st, st.menu);
      for (let j = 0; j < 3; j++) list.push({ at: at + j * 0.7, sp: 'penguin', order: [dish] });
    }
  }
  if (P.twist === 'festival') {
    for (const f of [0.3, 0.65]) list.push({ at: TIMES.open * f, sp: 'walrus', order: orderFor(st, 'walrus', rint(st, 4, 5)) });
  }
  return list.sort((a, b) => a.at - b.at);
}

/** Open tonight's service (from the morning). */
export function openNight(st) {
  if (st.phase !== 'morning') return false;
  const P = nightParams(st);
  const grid = buildGrid(P.layout, st.menu, st.up);
  for (const t of grid) if (t.k === 'cooker') t.servings = P.servings;
  const region = regions(grid);
  const L = LAYOUTS[P.layout];
  st.svc = {
    t: 0,
    P,
    layout: P.layout,
    grid,
    region,
    otters: L.start.map(([c, r], i) => ({
      i,
      x: c + 0.5,
      y: r + 0.5,
      c,
      r,
      region: region[idx(c, r)],
      path: [],
      goal: null,
      queue: [],
      hold: null,
      act: null,
      busy: 0,
      facing: i ? -1 : 1,
      mood: 'idle',
      moodT: 0,
    })),
    canal: 0,
    rafts: Array.from({ length: CANAL.rafts }, () => ({ plate: null, laps: 0 })),
    seats: Array(SEATS).fill(null),
    customers: [],
    arrivals: planArrivals(st, P),
    nextId: 1,
    lanterns: 0,
    rush: 0,
    gulls: [],
    gullAt: P.gulls ? 14 : Infinity,
    takings: 0,
    plates: [],
    tips: 0,
    served: 0,
    huffs: 0,
    away: 0,
    hearts: [],
    closing: false,
  };
  st.phase = 'service';
  st.sel = 0;
  ev(st, 'open', { night: st.night, layout: P.layout });
  return true;
}

// ── the canal ─────────────────────────────────────────────────────────────────

const R_TURN = (CANAL.near - CANAL.far) / 2;
const MID = (CANAL.near + CANAL.far) / 2;
const W = CANAL.right - CANAL.left;
export const CANAL_LENGTH = 2 * W + 2 * Math.PI * R_TURN;
const RAFT_GAP = CANAL_LENGTH / CANAL.rafts;

/** Where along the canal a point is: s runs right along the near lane, round, then left along the far lane. */
export function canalPoint(s) {
  s = ((s % CANAL_LENGTH) + CANAL_LENGTH) % CANAL_LENGTH;
  if (s < W) return { x: CANAL.left + s, y: CANAL.near, lane: 'near' };
  s -= W;
  if (s < Math.PI * R_TURN) {
    const a = s / R_TURN;
    return { x: CANAL.right + R_TURN * Math.sin(a), y: MID + R_TURN * Math.cos(a), lane: 'turn' };
  }
  s -= Math.PI * R_TURN;
  if (s < W) return { x: CANAL.right - s, y: CANAL.far, lane: 'far' };
  s -= W;
  const a = s / R_TURN;
  return { x: CANAL.left - R_TURN * Math.sin(a), y: MID - R_TURN * Math.cos(a), lane: 'turn' };
}
/** s of the near lane beside column x (dock), and of the far lane beside a seat. */
export const sNear = (x) => x - CANAL.left;
export const sFar = (x) => W + Math.PI * R_TURN + (CANAL.right - x);
export const seatX = (i) => CANAL.left + (i + 0.5) * (W / SEATS);
export const raftS = (svc, i) => (svc.canal + i * RAFT_GAP) % CANAL_LENGTH;

/** Did a point moving from a to b (wrapping at the canal's end) pass s? */
function crossed(a, b, s) {
  if (b >= a) return s > a && s <= b;
  return s > a || s <= b;
}

// ── commands ──────────────────────────────────────────────────────────────────

/**
 * Queue tile (c, r) for otter `who` (0, 1, or 'auto': the selected otter if it can reach, else the
 * other). Returns { ok, otter, why }.
 */
export function tap(st, who, c, r) {
  const svc = st.svc;
  if (st.phase !== 'service' || !tileAt(svc, c, r)) return { ok: false, why: 'closed' };
  let oi = who;
  if (who === 'auto') {
    const order = [st.sel, 1 - st.sel];
    oi = order.find((i) => canReach(svc, i, c, r));
    if (oi === undefined) return { ok: false, why: 'unreachable' };
  }
  const o = svc.otters[oi];
  if (!canReach(svc, oi, c, r)) {
    ev(st, 'cantReach', { o: oi, c, r });
    return { ok: false, otter: oi, why: 'unreachable' };
  }
  if (o.queue.length >= QUEUE_MAX) return { ok: false, otter: oi, why: 'full' };
  o.queue.push({ c, r });
  ev(st, 'tap', { o: oi, c, r });
  return { ok: true, otter: oi };
}

/** Clear an otter's queue (and stop it slicing); it finishes the step it's on. */
export function cancel(st, oi) {
  const o = st.svc?.otters[oi];
  if (!o) return false;
  o.queue = [];
  o.goal = null;
  o.path = o.path.slice(0, 1);
  o.act = null;
  ev(st, 'cancel', { o: oi });
  return true;
}

export function select(st, oi) {
  st.sel = oi;
}

/** Tap a gull: shooed if it hasn't got the plate yet. */
export function shoo(st, id) {
  const g = st.svc?.gulls.find((x) => x.id === id);
  if (!g || g.state !== 'fly') return false;
  g.state = 'flee';
  g.t = 0;
  ev(st, 'shoo', { id, x: g.x, y: g.y });
  return true;
}

// ── otters at work ────────────────────────────────────────────────────────────

function interact(st, oi, c, r) {
  const svc = st.svc;
  const o = svc.otters[oi];
  const tile = tileAt(svc, c, r);
  const H = o.hold;
  const C = tile.item;
  const P = svc.P;
  const ok = (what, extra = {}) => {
    o.busy = TIMES.busy;
    ev(st, 'do', { o: oi, c, r, what, ...extra });
    return true;
  };
  const fail = (why) => {
    o.mood = 'oops';
    o.moodT = 0.7;
    ev(st, 'fail', { o: oi, c, r, why });
    return false;
  };
  if (tile.k === 'floor') return true;
  switch (tile.k) {
    case 'crate': {
      if (!H) return (o.hold = { k: tile.ing }), ok('take', { k: tile.ing });
      if (H.plate && canAdd(st, H, tile.ing)) return H.parts.push(tile.ing), ok('add', { k: tile.ing });
      if (!H.plate && H.k === tile.ing) return (o.hold = null), ok('return', { k: tile.ing });
      return fail(H.plate ? 'doesntGo' : 'pawsFull');
    }
    case 'board':
    case 'pan':
    case 'fryer': {
      if (!H) {
        if (!C) return fail('empty');
        if (tile.k === 'board' && PREP[C.k]?.at === 'board') {
          o.act = { kind: 'slice', c, r };
          ev(st, 'slice', { o: oi, c, r, k: C.k });
          return true;
        }
        if (tile.k !== 'board' && PREP[C.k]) return fail('notReady');
        tile.item = null;
        o.hold = { k: C.k };
        return ok('take', { k: C.k });
      }
      if (H.plate) {
        if (C && canAdd(st, H, C.k)) {
          tile.item = null;
          H.parts.push(C.k);
          return ok('add', { k: C.k });
        }
        return fail(C ? (PREP[C.k] ? 'notReady' : 'doesntGo') : 'empty');
      }
      if (C) return fail('full');
      if (tile.k === 'board') {
        tile.item = { k: H.k, prog: 0 };
        o.hold = null;
        if (PREP[H.k]?.at === 'board') {
          o.act = { kind: 'slice', c, r };
          ev(st, 'slice', { o: oi, c, r, k: H.k });
          return true;
        }
        return ok('put', { k: H.k });
      }
      if (PREP[H.k]?.at !== tile.k) return fail('wrongStation');
      tile.item = { k: H.k, cook: 0 };
      o.hold = null;
      return ok('cook', { k: H.k, station: tile.k });
    }
    case 'cooker': {
      if (tile.cook > 0) return fail('cooking');
      if (tile.servings <= 0) {
        tile.cook = P.rice;
        o.busy = TIMES.busy;
        ev(st, 'riceStart', { o: oi, c, r });
        return true;
      }
      if (!H) {
        o.hold = { k: 'rice' };
      } else if (H.plate && canAdd(st, H, 'rice')) {
        H.parts.push('rice');
      } else return fail(H.plate ? 'doesntGo' : 'pawsFull');
      tile.servings--;
      return ok(H ? 'add' : 'take', { k: 'rice', left: tile.servings });
    }
    case 'plates': {
      if (!H) return (o.hold = { plate: true, parts: [] }), ok('plate');
      if (!H.plate && canAdd(st, { parts: [] }, H.k)) return (o.hold = { plate: true, parts: [H.k] }), ok('plate', { k: H.k });
      return fail(H.plate ? 'pawsFull' : 'doesntGo');
    }
    case 'counter': {
      if (!C && H) return (tile.item = H), (o.hold = null), ok('put');
      if (C && !H) return (tile.item = null), (o.hold = C), ok('take');
      if (C && H) {
        if (C.plate && !H.plate && canAdd(st, C, H.k)) return C.parts.push(H.k), (o.hold = null), ok('add', { k: H.k, onto: true });
        if (H.plate && !C.plate && canAdd(st, H, C.k)) return H.parts.push(C.k), (tile.item = null), ok('add', { k: C.k });
        return fail('full');
      }
      return fail('empty');
    }
    case 'dock': {
      if (H?.plate) {
        const dish = dishOf(st, H);
        if (!dish) return fail('unfinished');
        if (C) return fail('dockBusy');
        tile.item = H;
        o.hold = null;
        o.mood = 'happy';
        o.moodT = 0.8;
        return ok('launch', { dish });
      }
      if (!H && C) return (tile.item = null), (o.hold = C), ok('take');
      return fail(H ? 'notAPlate' : 'empty');
    }
    case 'bin': {
      if (!H) return fail('empty');
      if (H.plate && H.parts.length) return (H.parts = []), ok('scrape');
      o.hold = null;
      return ok('bin', { k: H.plate ? 'plate' : H.k });
    }
  }
  return fail('nothing');
}

function stepOtter(st, oi, dt) {
  const svc = st.svc;
  const o = svc.otters[oi];
  if (o.moodT > 0 && (o.moodT -= dt) <= 0) o.mood = 'idle';
  if (o.busy > 0) {
    o.busy -= dt;
    return;
  }
  if (o.act) {
    const tile = tileAt(svc, o.act.c, o.act.r);
    const item = tile.item;
    if (!item || PREP[item.k]?.at !== 'board') {
      o.act = null;
      return;
    }
    item.prog = (item.prog || 0) + dt / svc.P.slice;
    if (item.prog >= 1) {
      tile.item = { k: PREP[item.k].to };
      for (const other of svc.otters) if (other.act && other.act.c === o.act.c && other.act.r === o.act.r && other !== o) other.act = null;
      ev(st, 'sliced', { o: oi, c: o.act.c, r: o.act.r, k: tile.item.k });
      o.act = null;
      o.busy = TIMES.busy;
    }
    return;
  }
  if (o.path.length) {
    const [tc, tr] = o.path[0];
    const tx = tc + 0.5;
    const ty = tr + 0.5;
    const dx = tx - o.x;
    const dy = ty - o.y;
    const d = Math.hypot(dx, dy);
    const stepLen = svc.P.walk * dt;
    if (Math.abs(dx) > 0.01) o.facing = dx > 0 ? 1 : -1;
    if (d <= stepLen) {
      o.x = tx;
      o.y = ty;
      o.c = tc;
      o.r = tr;
      o.path.shift();
    } else {
      o.x += (dx / d) * stepLen;
      o.y += (dy / d) * stepLen;
    }
    return;
  }
  if (o.goal) {
    const g = o.goal;
    o.goal = null;
    if (g.c + 0.5 !== o.x) o.facing = g.c + 0.5 > o.x ? 1 : -1;
    interact(st, oi, g.c, g.r);
    return;
  }
  if (o.queue.length) {
    const g = o.queue.shift();
    const spots = standSpots(svc, oi, g.c, g.r);
    const p = spots.length ? path(svc, o.c, o.r, spots) : null;
    if (!p) {
      ev(st, 'cantReach', { o: oi, c: g.c, r: g.r });
      return;
    }
    o.path = p;
    o.goal = tileAt(svc, g.c, g.r).k === 'floor' ? null : g;
  }
}

function stepStations(st, dt) {
  const svc = st.svc;
  const P = svc.P;
  svc.grid.forEach((t, i) => {
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    if (t.k === 'cooker' && t.cook > 0) {
      t.cook -= dt;
      if (t.cook <= 0) {
        t.cook = 0;
        t.servings = P.servings;
        ev(st, 'riceDone', { c, r });
      }
    }
    if ((t.k === 'pan' || t.k === 'fryer') && t.item) {
      const prep = Object.values(PREP).find((p) => p.to === t.item.k || p.burn === t.item.k) || PREP[t.item.k];
      const cookT = t.k === 'pan' ? TIMES.pan : TIMES.fryer;
      const burnT = cookT + (t.k === 'pan' ? TIMES.panBurn : TIMES.fryerBurn) * P.burn;
      const before = t.item.cook;
      t.item.cook += dt;
      if (PREP[t.item.k] && t.item.cook >= cookT) {
        t.item.k = prep.to;
        ev(st, 'cooked', { c, r, k: t.item.k });
      } else if (t.item.k === prep.to && t.item.cook >= burnT && before < burnT) {
        t.item.k = prep.burn;
        ev(st, 'burnt', { c, r, k: t.item.k });
      }
    }
  });
}

// ── customers ─────────────────────────────────────────────────────────────────

function seatCustomer(st, cu, seat) {
  const svc = st.svc;
  svc.seats[seat] = cu.id;
  cu.seat = seat;
  cu.phase = 'walk';
  cu.t = TIMES.sit;
}

function arrive(st, a) {
  const svc = st.svc;
  const sp = SPECIES[a.sp];
  const patMax = (TIMES.patience + TIMES.patiencePerDish * (a.order.length - 1)) * sp.patience * svc.P.patience;
  const cu = { id: svc.nextId++, sp: a.sp, seat: -1, phase: 'line', t: 0, order: a.order.slice(), ate: [], pat: patMax, patMax, huff: false };
  const free = svc.seats.findIndex((s) => s === null);
  const lined = svc.customers.filter((x) => x.phase === 'line').length;
  if (free >= 0) seatCustomer(st, cu, free);
  else if (lined >= TIMES.lineup) {
    svc.away++;
    ev(st, 'turnedAway', { sp: a.sp });
    return;
  }
  svc.customers.push(cu);
  ev(st, 'arrive', { cu: cu.id, sp: a.sp, seat: cu.seat, order: cu.order });
}

function settle(st, cu, { tip = true } = {}) {
  const svc = st.svc;
  const base = cu.ate.reduce((s, a) => s + a.price, 0);
  const rate = svc.P.tip * (SPECIES[cu.sp].vip ? 2 : 1);
  const tipAmt = tip && !cu.huff ? Math.round(base * rate * Math.max(0, cu.pat / cu.patMax)) : 0;
  const amount = base + tipAmt;
  svc.takings += amount;
  svc.tips += tipAmt;
  if (cu.ate.length) svc.served++;
  ev(st, 'pay', { cu: cu.id, seat: cu.seat, sp: cu.sp, amount, base, tip: tipAmt, plates: cu.ate.length });
  return amount;
}

function leave(st, cu) {
  cu.phase = 'leave';
  cu.t = TIMES.leave;
}

function huff(st, cu) {
  const svc = st.svc;
  cu.huff = true;
  svc.huffs++;
  ev(st, 'huff', { cu: cu.id, seat: cu.seat, sp: cu.sp });
  if (svc.lanterns > 0) ev(st, 'lanternsOut', {});
  svc.lanterns = 0;
  settle(st, cu, { tip: false });
  leave(st, cu);
}

function stepCustomers(st, dt) {
  const svc = st.svc;
  for (const cu of svc.customers) {
    if (cu.phase === 'line') {
      cu.pat -= dt * 0.5;
      if (cu.pat <= 0) {
        cu.phase = 'gone';
        svc.away++;
        ev(st, 'gaveUp', { cu: cu.id, sp: cu.sp });
      }
    } else if (cu.phase === 'walk') {
      if ((cu.t -= dt) <= 0) cu.phase = 'wait';
    } else if (cu.phase === 'wait') {
      cu.pat -= dt;
      if (cu.pat <= 0) {
        cu.pat = 0;
        huff(st, cu);
      }
    } else if (cu.phase === 'eat') {
      if ((cu.t -= dt) <= 0) {
        if (cu.order.length) cu.phase = 'wait';
        else {
          cu.phase = 'pay';
          cu.t = TIMES.pay;
        }
      }
    } else if (cu.phase === 'pay') {
      if ((cu.t -= dt) <= 0) {
        settle(st, cu);
        leave(st, cu);
      }
    } else if (cu.phase === 'leave') {
      if ((cu.t -= dt) <= 0) {
        cu.phase = 'gone';
        if (cu.seat >= 0) svc.seats[cu.seat] = null;
      }
    }
  }
  svc.customers = svc.customers.filter((c) => c.phase !== 'gone');
  // Free seats go to whoever has waited longest in the line.
  for (let s = 0; s < SEATS; s++) {
    if (svc.seats[s] !== null) continue;
    const next = svc.customers.find((c) => c.phase === 'line');
    if (!next) break;
    seatCustomer(st, next, s);
    ev(st, 'seated', { cu: next.id, seat: s });
  }
}

function grab(st, cu, raft, dish) {
  const svc = st.svc;
  const i = cu.order.indexOf(dish);
  cu.order.splice(i, 1);
  const price = DISHES[dish].price * (svc.rush > 0 ? 2 : 1);
  const fav = SPECIES[cu.sp].fav === dish;
  cu.ate.push({ dish, price });
  svc.plates.push({ dish, x2: svc.rush > 0 });
  cu.phase = 'eat';
  cu.t = TIMES.eat;
  cu.pat = Math.min(cu.patMax, cu.pat + cu.patMax * TIMES.patienceBack);
  raft.plate = null;
  if (fav) svc.hearts.push(cu.sp);
  ev(st, 'grab', { cu: cu.id, seat: cu.seat, sp: cu.sp, dish, price, fav, rush: svc.rush > 0 });
  if (svc.rush <= 0) {
    svc.lanterns++;
    ev(st, 'lantern', { n: svc.lanterns, of: svc.P.lanterns });
    if (svc.lanterns >= svc.P.lanterns) {
      svc.rush = TIMES.rush;
      svc.lanterns = 0;
      ev(st, 'rush', {});
    }
  }
}

function stepCanal(st, dt) {
  const svc = st.svc;
  const prev = svc.canal;
  svc.canal = (svc.canal + CANAL.speed * svc.P.canal * dt) % CANAL_LENGTH;
  const docks = [];
  svc.grid.forEach((t, i) => t.k === 'dock' && docks.push({ t, s: sNear((i % COLS) + 0.5), c: i % COLS }));
  svc.rafts.forEach((raft, i) => {
    const a = (prev + i * RAFT_GAP) % CANAL_LENGTH;
    const b = (svc.canal + i * RAFT_GAP) % CANAL_LENGTH;
    if (raft.plate && b < a && ++raft.laps >= CANAL.laps) {
      ev(st, 'soggy', { raft: i, dish: dishOf(st, raft.plate) });
      raft.plate = null;
    }
    if (!raft.plate) {
      for (const d of docks)
        if (d.t.item && crossed(a, b, d.s)) {
          raft.plate = d.t.item;
          raft.laps = 0;
          d.t.item = null;
          ev(st, 'load', { raft: i, c: d.c, dish: dishOf(st, raft.plate) });
          break;
        }
      return;
    }
    const dish = dishOf(st, raft.plate);
    for (const cu of svc.customers) {
      if (cu.phase !== 'wait' || !cu.order.includes(dish)) continue;
      if (crossed(a, b, sFar(seatX(cu.seat)))) {
        grab(st, cu, raft, dish);
        break;
      }
    }
  });
}

// ── gulls ─────────────────────────────────────────────────────────────────────

const GULL_FLY = 2.6;

function stepGulls(st, dt) {
  const svc = st.svc;
  if (svc.t >= svc.gullAt && svc.t < TIMES.open) {
    svc.gullAt = svc.t + 9 + rnd(st) * 5;
    const loaded = svc.rafts.map((r, i) => (r.plate ? i : -1)).filter((i) => i >= 0);
    if (loaded.length) {
      const from = rnd(st) < 0.5 ? -1.5 : 7.5;
      svc.gulls.push({ id: svc.nextId++, raft: pick(st, loaded), state: 'fly', t: 0, x0: from, y0: -3.4, x: from, y: -3.4 });
      ev(st, 'gull', {});
    }
  }
  for (const g of svc.gulls) {
    g.t += dt;
    if (g.state === 'fly') {
      const raft = svc.rafts[g.raft];
      if (!raft.plate) {
        // Someone took it first: look for another plate, or give up.
        const loaded = svc.rafts.map((r, i) => (r.plate ? i : -1)).filter((i) => i >= 0);
        if (loaded.length) g.raft = loaded[0];
        else {
          g.state = 'flee';
          g.t = 0;
          continue;
        }
      }
      const p = canalPoint(raftS(svc, g.raft));
      const k = Math.min(1, g.t / GULL_FLY);
      const e = k * k * (3 - 2 * k);
      g.x = g.x0 + (p.x - g.x0) * e;
      g.y = g.y0 + (p.y - 0.25 - g.y0) * e;
      if (k >= 1) {
        g.state = 'grab';
        g.t = 0;
        g.plate = svc.rafts[g.raft].plate;
        svc.rafts[g.raft].plate = null;
        ev(st, 'steal', { raft: g.raft, dish: dishOf(st, g.plate), x: g.x, y: g.y });
      }
    } else {
      // grab and flee: away and up.
      const dir = g.x < 3 ? -1 : 1;
      g.x += dir * 3.2 * dt;
      g.y -= 2.2 * dt;
    }
  }
  svc.gulls = svc.gulls.filter((g) => g.t < 3 || g.state === 'fly');
}

// ── the night ─────────────────────────────────────────────────────────────────

/** Advance the night by dt seconds. */
export function step(st, dt) {
  if (st.phase !== 'service') return;
  const svc = st.svc;
  svc.t += dt;
  while (svc.arrivals.length && svc.arrivals[0].at <= svc.t) arrive(st, svc.arrivals.shift());
  for (let i = 0; i < svc.otters.length; i++) stepOtter(st, i, dt);
  stepStations(st, dt);
  stepCanal(st, dt);
  stepCustomers(st, dt);
  stepGulls(st, dt);
  if (svc.rush > 0 && (svc.rush -= dt) <= 0) {
    svc.rush = 0;
    ev(st, 'rushEnd', {});
  }
  if (!svc.closing && svc.t >= TIMES.open) {
    svc.closing = true;
    ev(st, 'lastOrders', {});
  }
  const empty = !svc.arrivals.length && !svc.customers.length;
  if (svc.t >= TIMES.open && empty) closeNight(st);
  else if (svc.t >= TIMES.open + TIMES.lastOrders) {
    // Lights down: everyone still at the bar settles up for what they ate and goes home.
    for (const cu of svc.customers) if (cu.seat >= 0 && cu.phase !== 'leave') settle(st, cu, { tip: cu.phase === 'pay' });
    svc.customers = [];
    closeNight(st);
  }
}

/** End the night: takings into the purse, rent out of it. */
export function closeNight(st) {
  const svc = st.svc;
  if (st.phase !== 'service') return;
  const rent = rentFor(st);
  const night = {
    night: st.night,
    takings: svc.takings,
    tips: svc.tips,
    plates: svc.plates.slice(),
    served: svc.served,
    huffs: svc.huffs,
    away: svc.away,
    hearts: svc.hearts.slice(),
    rent,
    paid: false,
  };
  st.purse += svc.takings;
  st.earned += svc.takings;
  if (st.purse >= rent) {
    st.purse -= rent;
    night.paid = true;
  }
  st.history.push(night);
  st.phase = 'closed';
  if (!night.paid) {
    st.result = 'closed';
  } else if (st.night === NIGHTS.length - 1) st.result = 'won';
  ev(st, 'close', { night: st.night, takings: svc.takings, rent, paid: night.paid });
}

/** After the tally: on to the next morning, or the week is over. */
export function toMorning(st) {
  if (st.phase !== 'closed') return false;
  if (st.result) {
    st.phase = 'over';
    ev(st, 'over', { result: st.result });
    return true;
  }
  st.night++;
  st.phase = 'morning';
  makeOffers(st);
  ev(st, 'morning', { night: st.night });
  return true;
}

// ── reading the state ─────────────────────────────────────────────────────────

/** Everything a customer at a seat still wants, minus what's already sailing. */
export function demand(st) {
  const svc = st.svc;
  const want = {};
  for (const cu of svc.customers) if (cu.phase !== 'leave' && cu.phase !== 'pay') for (const d of cu.order) want[d] = (want[d] || 0) + 1;
  for (const raft of svc.rafts) {
    const d = raft.plate && dishOf(st, raft.plate);
    if (d && want[d]) want[d]--;
  }
  return want;
}

/** The week's score so far (coins taken). */
export const score = (st) => st.earned + (st.phase === 'service' ? st.svc.takings : 0);
