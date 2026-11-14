// Big Eater's rules: a pure, DOM-free simulation. The whole run is one plain JSON object
// (so it can be saved mid-run), advanced by step(state, input) at 60 Hz.
import {
  BOSSES, BOSS_TIMES, BURST_NEED, CELLS, DROP_R, DT, GERMS, MAX_ENEMIES, ORGANELLES, ORGANELLE_SLOTS,
  SEGMENT, SPAWN_R, WEAPONS, WEAPON_SLOTS, strainMul, xpFor,
} from './data.js';

export const PR = 18; // the cell's radius
const TAU = Math.PI * 2;

// ---------- randomness (state.rng is a plain number, so saves resume the same sequence) ----------
function rnd(s) {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------- setup ----------
export function createRun({ seed = Date.now(), cell = 'macro', strain = 0, daily = null } = {}) {
  const c = CELLS[cell];
  const s = {
    v: 1, seed, rng: typeof seed === 'string' ? hash(seed) : seed >>> 0, cell, strain, daily,
    t: 0,
    p: { x: 0, y: 0, hp: c.hp, mhp: c.hp, inv: 0, fx: 1, fy: 0, lvl: 1, xp: 0, need: xpFor(1), burst: 0, trail: 0, speedNow: 0 },
    weapons: [], organelles: [], mods: null,
    enemies: [], shots: [], zones: [], rings: [], toxins: [], motes: [], drops: [],
    nextId: 1, spawnAcc: 0, schedule: [], seg: -1, bossIdx: 0, eliteAt: 55, eliteN: 0,
    offers: null, rerolls: 2, levelsTaken: 0,
    chain: 0, chainT: 0,
    stats: { kills: 0, gulps: 0, bestChain: 0, byKind: {}, dmgBy: {}, bossGulps: 0, bosses: [], hurt: 0, evos: [] },
    over: null, events: [],
  };
  s.schedule = makeSchedule(s);
  addWeapon(s, c.weapon);
  recompute(s);
  // company from the first second
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + rnd(s), d = 300 + rnd(s) * 160;
    spawn(s, 'coccus', Math.cos(a) * d, Math.sin(a) * d);
  }
  return s;
}

function makeSchedule(s) {
  const out = [];
  let prev = null;
  for (let i = 0; i < 30; i++) {
    const t = i * SEGMENT;
    const open = Object.keys(GERMS).filter((k) => GERMS[k].from <= t);
    let kind;
    if (i === 0) kind = 'coccus';
    else if (i === 1) kind = 'bacillus';
    else {
      const newest = open[open.length - 1];
      const isNew = GERMS[newest].from === t;
      if (isNew) kind = newest;
      else {
        const pool = open.filter((k) => k !== prev);
        // lean towards the stain the last wave was not, so both bonuses matter
        const w = pool.map((k) => (prev && GERMS[k].gram !== GERMS[prev].gram ? 2 : 1));
        let r = rnd(s) * w.reduce((a, b) => a + b, 0);
        kind = pool[pool.length - 1];
        for (let j = 0; j < pool.length; j++) if ((r -= w[j]) < 0) { kind = pool[j]; break; }
      }
    }
    out.push(kind);
    prev = kind;
  }
  return out;
}

// ---------- build ----------
export function wepStat(w, key) {
  const def = WEAPONS[w.id];
  if (w.evo && def.evo[key] !== undefined) return def.evo[key];
  const v = def[key];
  return Array.isArray(v) ? v[w.lvl - 1] : v;
}
const findW = (s, id) => s.weapons.find((w) => w.id === id);
const findO = (s, id) => s.organelles.find((o) => o.id === id);

function addWeapon(s, id) {
  const w = findW(s, id);
  if (w) w.lvl = Math.min(6, w.lvl + 1);
  else s.weapons.push({ id, lvl: 1, evo: false, cd: 0.4, ang: 0, tick: 0 });
}

function recompute(s) {
  const c = CELLS[s.cell];
  const L = (id) => findO(s, id)?.lvl || 0;
  const before = s.p.mhp;
  s.mods = {
    dmg: 1 + 0.12 * L('ribosome'),
    cd: 0.92 ** L('mito'),
    area: (c.area || 1) * (1 + 0.12 * L('golgi')),
    amount: L('granule'),
    spd: c.spd * (1 + 0.09 * L('pseudopod')),
    pickup: 64 * (1 + 0.35 * L('receptor')),
    regen: 0.4 + 0.3 * L('membrane'),
    gulpPct: 0.5 + 0.07 * L('lysosome'),
    gulpHeal: 0.5 * (c.gulpHeal || 1) * (1 + 0.5 * L('lysosome')),
    burstNeed: Math.round(BURST_NEED * (c.burst || 1)),
    offers: c.offers || 3,
  };
  s.p.mhp = c.hp + 20 * L('membrane') + (s.bonusHp || 0);
  if (s.p.mhp > before) s.p.hp = Math.min(s.p.mhp, s.p.hp + (s.p.mhp - before));
}

function offerPool(s) {
  const evos = [];
  const rest = [];
  for (const w of s.weapons) {
    const def = WEAPONS[w.id];
    if (w.evo) continue;
    if (w.lvl >= 6) {
      if (findO(s, def.evo.with)) evos.push({ type: 'evo', id: w.id });
    } else rest.push({ type: 'weapon', id: w.id, lvl: w.lvl + 1, w: 1.5 });
  }
  if (s.weapons.length < WEAPON_SLOTS)
    for (const id of Object.keys(WEAPONS)) if (!findW(s, id)) rest.push({ type: 'weapon', id, lvl: 1, w: 1 });
  for (const o of s.organelles) if (o.lvl < ORGANELLES[o.id].max) rest.push({ type: 'organelle', id: o.id, lvl: o.lvl + 1, w: 1.3 });
  if (s.organelles.length < ORGANELLE_SLOTS)
    for (const id of Object.keys(ORGANELLES)) {
      if (findO(s, id)) continue;
      // an organelle that would unlock an evolution for a weapon you hold turns up more often
      const partner = s.weapons.some((w) => WEAPONS[w.id].evo.with === id);
      rest.push({ type: 'organelle', id, lvl: 1, w: partner ? 1.6 : 1 });
    }
  return { evos, rest };
}

function makeOffers(s) {
  const { evos, rest } = offerPool(s);
  const n = s.mods.offers;
  const out = evos.slice(0, 1);
  const pool = rest.slice();
  while (out.length < n && pool.length) {
    let r = rnd(s) * pool.reduce((a, o) => a + o.w, 0);
    let i = 0;
    for (; i < pool.length - 1; i++) if ((r -= pool[i].w) < 0) break;
    out.push(pool.splice(i, 1)[0]);
  }
  for (const type of ['tough', 'heal', 'charge']) if (out.length < n) out.push({ type });
  s.offers = out;
}

/** Take offer `i` of the level-up. */
export function choose(s, i) {
  const o = s.offers?.[i];
  if (!o) return false;
  apply(s, o);
  s.offers = null;
  s.levelsTaken++;
  return true;
}

export function reroll(s) {
  if (!s.offers || s.rerolls <= 0) return false;
  s.rerolls--;
  makeOffers(s);
  return true;
}

/** Apply an upgrade (also the debug path: grant(state, { type, id })). */
export function apply(s, o) {
  if (o.type === 'weapon') addWeapon(s, o.id);
  else if (o.type === 'evo') {
    const w = findW(s, o.id);
    w.evo = true;
    w.cd = 0;
    if (!s.stats.evos.includes(o.id)) s.stats.evos.push(o.id);
    s.events.push({ e: 'evo', id: o.id });
  } else if (o.type === 'organelle') {
    const g = findO(s, o.id);
    if (g) g.lvl = Math.min(ORGANELLES[o.id].max, g.lvl + 1);
    else s.organelles.push({ id: o.id, lvl: 1 });
  } else if (o.type === 'tough') s.bonusHp = (s.bonusHp || 0) + 10;
  else if (o.type === 'heal') s.p.hp = Math.min(s.p.mhp, s.p.hp + 30);
  else if (o.type === 'charge') s.p.burst = s.mods?.burstNeed ?? BURST_NEED;
  recompute(s);
}

// ---------- spatial grid (rebuilt every step; not part of the state) ----------
const CELL = 72;
let grid = new Map();
let byId = new Map();
const gkey = (cx, cy) => (cx + 512) * 1024 + (cy + 512);
function buildGrid(s) {
  grid = new Map();
  byId = new Map();
  for (const e of s.enemies) {
    if (e.dead) continue;
    byId.set(e.id, e);
    const k = gkey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
    const a = grid.get(k);
    if (a) a.push(e);
    else grid.set(k, [e]);
  }
}
/** Calls cb(e, dist) for live germs whose centre is within r (+ their own radius) of (x, y). */
function near(x, y, r, cb) {
  const pad = r + 62;
  const x0 = Math.floor((x - pad) / CELL), x1 = Math.floor((x + pad) / CELL);
  const y0 = Math.floor((y - pad) / CELL), y1 = Math.floor((y + pad) / CELL);
  for (let cx = x0; cx <= x1; cx++)
    for (let cy = y0; cy <= y1; cy++) {
      const a = grid.get(gkey(cx, cy));
      if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const e = a[i];
        if (e.dead) continue;
        const dx = e.x - x, dy = e.y - y;
        const lim = r + e.r;
        const d2 = dx * dx + dy * dy;
        if (d2 <= lim * lim) cb(e, Math.sqrt(d2));
      }
    }
}
function nearestN(s, x, y, range, n, skip = null, prefer = null) {
  const found = [];
  near(x, y, range, (e, d) => {
    if (skip && skip.includes(e.id)) return;
    found.push([prefer && prefer(e) ? d - 2000 : d, e]);
  });
  found.sort((a, b) => a[0] - b[0]);
  return found.slice(0, n).map((f) => f[1]);
}

// ---------- germs ----------
export function edible(s, e) {
  if (e.dead) return false;
  if (e.boss) return e.hp <= e.mhp * 0.1;
  return e.mark > 0 || e.hp <= e.mhp * s.mods.gulpPct;
}

const hpMul = (s) => (1 + (s.t / 60) ** 1.35 * 0.5) * strainMul(s.strain).hp;

function spawn(s, kind, x, y, opt = {}) {
  const g = GERMS[kind];
  const m = strainMul(s.strain);
  const mul = g.boss ? m.hp : hpMul(s);
  const elite = !!opt.elite;
  const hp = Math.round(g.hp * mul * (elite ? 9 : 1));
  const d = Math.hypot(x, y);
  if (d > DROP_R - 12) { x *= (DROP_R - 12) / d; y *= (DROP_R - 12) / d; }
  const e = {
    id: s.nextId++, k: kind, x, y, kx: 0, ky: 0, hp, mhp: hp, r: g.r * (elite ? 1.55 : 1),
    spd: g.spd * m.spd * (g.boss ? 1 : 1.15 + Math.min(1, s.t / 450) * 0.4) * (elite ? 0.9 : 1) * (0.92 + rnd(s) * 0.16), dmg: g.dmg * m.dmg * (1 + 0.6 * Math.min(1, s.t / 450)) * (elite ? 1.3 : 1),
    gram: g.gram, xp: g.xp * (elite ? 10 : 1), ai: g.ai, mark: 0, slow: 0, slowF: 1, flash: 0,
    t: 0, ph: rnd(s) * TAU, cd: 1.5 + rnd(s) * 2, st: 0, oc: 0, fx: 1, fy: 0,
  };
  if (elite) e.elite = true;
  if (g.boss) { e.boss = true; e.cd = 2.5; e.cd2 = 8; e.cd3 = 9; }
  s.enemies.push(e);
  return e;
}

function spawnPoint(s) {
  const heading = Math.atan2(s.p.fy, s.p.fx);
  for (let i = 0; i < 8; i++) {
    // more than half arrive ahead of a moving cell, so running in a line is no escape
    const a = s.p.speedNow > 40 && rnd(s) < 0.55 ? heading + (rnd(s) - 0.5) * 2.4 : rnd(s) * TAU;
    const d = SPAWN_R * (1 + rnd(s) * 0.12);
    const x = s.p.x + Math.cos(a) * d, y = s.p.y + Math.sin(a) * d;
    if (x * x + y * y < (DROP_R - 20) ** 2) return [x, y];
  }
  const a = Math.atan2(-s.p.y, -s.p.x) + (rnd(s) - 0.5);
  return [s.p.x + Math.cos(a) * SPAWN_R, s.p.y + Math.sin(a) * SPAWN_R];
}

function spawnGroup(s, kind, opt) {
  const g = GERMS[kind];
  const [x, y] = spawnPoint(s);
  const n = opt?.elite ? 1 : g.group;
  for (let i = 0; i < n; i++) spawn(s, kind, x + (rnd(s) - 0.5) * 26 * Math.sqrt(n), y + (rnd(s) - 0.5) * 26 * Math.sqrt(n), opt);
  return n;
}

export const spawnRate = (s) => (2 + 30 * Math.min(1.4, s.t / 450)) * strainMul(s.strain).rate;

function spawning(s) {
  const seg = Math.min(s.schedule.length - 1, Math.floor(s.t / SEGMENT));
  if (seg !== s.seg) {
    s.seg = seg;
    s.events.push({ e: 'wave', k: s.schedule[seg], seg });
  }
  // bosses arrive on the clock
  if (s.bossIdx < BOSSES.length && s.t >= BOSS_TIMES[s.bossIdx]) {
    const k = BOSSES[s.bossIdx++];
    const [x, y] = spawnPoint(s);
    spawn(s, k, x, y);
    s.events.push({ e: 'boss', k });
  }
  const bossUp = s.enemies.some((e) => e.boss && !e.dead);
  if (s.t >= s.eliteAt) {
    s.eliteAt += 40;
    spawnGroup(s, s.schedule[seg], { elite: true });
    s.events.push({ e: 'elite', k: s.schedule[seg] });
  }
  s.spawnAcc += spawnRate(s) * (bossUp ? 0.55 : 1) * DT;
  let guard = 0;
  while (s.spawnAcc >= 1 && guard++ < 6) {
    if (s.enemies.length >= MAX_ENEMIES) { s.spawnAcc = 0; break; }
    const feature = s.schedule[seg];
    let kind = feature;
    if (rnd(s) > 0.62) {
      const open = Object.keys(GERMS).filter((k) => GERMS[k].from <= s.t);
      kind = open[Math.floor(rnd(s) * open.length)];
    }
    // heavier germs cost more of the budget
    const g = GERMS[kind];
    s.spawnAcc -= spawnGroup(s, kind) * Math.max(1, Math.sqrt(g.hp / 9));
  }
}

function hit(s, e, raw, wid) {
  if (e.dead) return;
  let d = raw * s.mods.dmg;
  // a germ that is already lunch soaks up less, so there is time to reach it
  if (!e.boss && wid !== 'burst' && (e.mark > 0 || e.hp <= e.mhp * s.mods.gulpPct)) d *= 0.75;
  const bonus = WEAPONS[wid]?.bonus;
  if (bonus && bonus === e.gram) d *= 2;
  e.hp -= d;
  e.flash = 0.12;
  s.stats.dmgBy[wid] = (s.stats.dmgBy[wid] || 0) + d;
  if (s.events.length < 400) s.events.push({ e: 'dmg', x: e.x, y: e.y - e.r, d, crit: !!(bonus && bonus === e.gram) });
  if (e.hp <= 0) kill(s, e, false, wid);
}

function gainXp(s, v) {
  s.p.xp += v;
}

function dropMote(s, x, y, v) {
  if (s.motes.length >= 320) { s.motes[Math.floor(rnd(s) * s.motes.length)].v += v; return; }
  s.motes.push({ x, y, v, mag: false, sp: 0 });
}

function kill(s, e, gulped, wid) {
  if (e.dead) return;
  e.dead = true;
  s.stats.kills++;
  s.stats.byKind[e.k] = (s.stats.byKind[e.k] || 0) + 1;
  const g = GERMS[e.k];
  if (gulped) gainXp(s, e.xp * (2 + Math.min(s.chain, 10) * 0.1));
  else if (e.boss) for (let i = 0; i < 24; i++) dropMote(s, e.x + (rnd(s) - 0.5) * 120, e.y + (rnd(s) - 0.5) * 120, e.xp / 24);
  else dropMote(s, e.x, e.y, e.xp);
  if (g.split && !gulped) for (let i = 0; i < 2; i++) spawn(s, g.split, e.x + (i ? 9 : -9), e.y + (rnd(s) - 0.5) * 8);
  if (e.elite) {
    s.eliteN++;
    s.drops.push({ x: e.x, y: e.y, kind: s.eliteN % 3 === 0 ? 'magnet' : 'sugar' });
  }
  s.events.push({ e: 'kill', x: e.x, y: e.y, k: e.k, r: e.r, gulp: gulped, gram: e.gram, elite: !!e.elite });
  if (wid === 'interferon' && findW(s, 'interferon')?.evo)
    s.rings.push({ x: e.x, y: e.y, r: 6, rmax: 62 * s.mods.area, speed: 300, dmg: 15, knock: 0, wid: 'interferon', hit: { [e.id]: 1 }, small: true });
  if (e.boss) {
    s.stats.bosses.push(e.k);
    if (gulped) s.stats.bossGulps++;
    s.drops.push({ x: e.x + 30, y: e.y, kind: 'sugar' }, { x: e.x - 30, y: e.y, kind: 'magnet' });
    s.events.push({ e: 'bossdown', k: e.k, gulp: gulped, x: e.x, y: e.y });
    s.noLevel = 0.4; // let the moment play before the next level-up interrupts it
    if (e.k === 'superbug') s.over = 'won';
  }
}

function gulp(s, e) {
  s.chain = s.chainT > 0 ? s.chain + 1 : 1;
  s.chainT = 1.6;
  s.stats.gulps++;
  if (s.chain > s.stats.bestChain) s.stats.bestChain = s.chain;
  s.p.hp = Math.min(s.p.mhp, s.p.hp + s.mods.gulpHeal * (e.boss ? 20 : e.elite ? 6 : 1));
  s.p.burst = Math.min(s.mods.burstNeed, s.p.burst + (e.boss ? 12 : e.elite ? 4 : 1));
  s.events.push({ e: 'gulp', x: e.x, y: e.y, k: e.k, r: e.r, chain: s.chain, boss: !!e.boss });
  kill(s, e, true);
}

function toxin(s, x, y, a, speed = 120) {
  s.toxins.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 6, dmg: 9 * strainMul(s.strain).dmg, life: 5 });
}

function germAI(s, e) {
  const p = s.p;
  const eat = edible(s, e);
  let spd = e.spd * (e.slow > 0 ? e.slowF : 1) * (eat ? 0.45 : 1);
  const dx = p.x - e.x, dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  let ux = dx / d, uy = dy / d;
  let vx = 0, vy = 0;
  e.t += DT;
  switch (e.ai) {
    case 'dart': {
      const c = (e.t + e.ph) % 1.3;
      spd *= c < 0.75 ? 0.25 : 3.3;
      vx = ux * spd; vy = uy * spd;
      break;
    }
    case 'weave': {
      const w = Math.sin(e.t * 5 + e.ph) * 0.95;
      vx = (ux - uy * w) * spd; vy = (uy + ux * w) * spd;
      break;
    }
    case 'shoot': {
      const dir = d > 260 ? 1 : d < 180 ? -0.6 : 0;
      const side = Math.sin(e.ph) > 0 ? 0.5 : -0.5;
      vx = (ux * dir - uy * side) * spd; vy = (uy * dir + ux * side) * spd;
      e.cd -= DT;
      if (e.cd <= 0 && d < 420 && !eat) {
        e.cd = 2.7;
        toxin(s, e.x, e.y, Math.atan2(dy, dx));
        s.events.push({ e: 'toxin', x: e.x, y: e.y });
      }
      break;
    }
    case 'bud':
      vx = ux * spd; vy = uy * spd;
      e.cd -= DT;
      if (e.cd <= 0 && !eat) {
        e.cd = 5;
        if (s.enemies.length < MAX_ENEMIES) spawn(s, 'bud', e.x + ux * e.r, e.y + uy * e.r);
      }
      break;
    case 'biofilm':
      vx = ux * spd; vy = uy * spd;
      e.cd -= DT;
      if (e.cd <= 0) {
        e.cd = 3.2;
        for (let i = 0; i < 4; i++) {
          const a = e.ph + (i / 4) * TAU + e.t;
          if (s.enemies.length < MAX_ENEMIES) spawn(s, i % 2 ? 'coccus' : 'bacillus', e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r);
        }
        s.events.push({ e: 'shed', x: e.x, y: e.y });
      }
      break;
    case 'charger':
      e.cd -= DT;
      if (e.st === 0) {
        vx = ux * spd; vy = uy * spd;
        if (e.cd <= 0) { e.st = 1; e.cd = 0.85; e.fx = ux; e.fy = uy; s.events.push({ e: 'telegraph', x: e.x, y: e.y }); }
      } else if (e.st === 1) {
        // still, aiming (the first half tracks the cell, then it commits)
        if (e.cd > 0.4) { e.fx = ux; e.fy = uy; }
        if (e.cd <= 0) { e.st = 2; e.cd = 0.75; s.events.push({ e: 'charge', x: e.x, y: e.y }); }
      } else {
        const cs = eat ? 150 : 540;
        vx = e.fx * cs; vy = e.fy * cs;
        if (e.cd <= 0) { e.st = 0; e.cd = 2.4; }
      }
      break;
    case 'superbug':
      vx = ux * spd; vy = uy * spd;
      e.cd -= DT; e.cd2 -= DT; e.cd3 -= DT;
      if (e.cd <= 0 && !eat) {
        e.cd = 3.2;
        const n = 12;
        for (let i = 0; i < n; i++) toxin(s, e.x, e.y, e.t * 0.7 + (i / n) * TAU, 105);
        s.events.push({ e: 'toxin', x: e.x, y: e.y, big: true });
      }
      if (e.cd2 <= 0) {
        e.cd2 = 8;
        e.gram = e.gram === 'p' ? 'n' : 'p';
        s.events.push({ e: 'flip', gram: e.gram, x: e.x, y: e.y });
      }
      if (e.cd3 <= 0) {
        e.cd3 = 10;
        const kind = e.gram === 'p' ? 'diplo' : 'spiro';
        for (let i = 0; i < 5; i++) if (s.enemies.length < MAX_ENEMIES) spawn(s, kind, e.x + Math.cos(i * 1.26) * e.r, e.y + Math.sin(i * 1.26) * e.r);
      }
      break;
    default:
      vx = ux * spd; vy = uy * spd;
  }
  if (e.ai !== 'charger' || e.st !== 2) { e.fx = ux; e.fy = uy; }
  e.x += (vx + e.kx) * DT;
  e.y += (vy + e.ky) * DT;
  e.kx *= 0.86; e.ky *= 0.86;
  if (e.mark > 0 && e.mark < 900) e.mark -= DT;
  if (e.slow > 0) e.slow -= DT;
  if (e.flash > 0) e.flash -= DT;
  // left far behind: swim round and come at the cell from somewhere new
  if (d > (e.boss ? 900 : 760)) { const [nx, ny] = spawnPoint(s); e.x = nx; e.y = ny; e.kx = e.ky = 0; }
  const dd = e.x * e.x + e.y * e.y;
  if (dd > (DROP_R - e.r) ** 2) { const k = (DROP_R - e.r) / Math.sqrt(dd); e.x *= k; e.y *= k; }

  // touch the cell: lunch, or it hurts
  const reach = PR + e.r;
  if (d < reach + 5 && eat) gulp(s, e);
  else if (d < reach * 0.82 && p.inv <= 0) {
    p.hp -= e.dmg;
    p.inv = 0.65;
    s.stats.hurt += e.dmg;
    s.events.push({ e: 'hurt', d: e.dmg });
    // shove the crowd back a little so one touch isn't three
    near(p.x, p.y, 46, (o, od) => { if (!o.boss) { o.kx += ((o.x - p.x) / (od || 1)) * 190; o.ky += ((o.y - p.y) / (od || 1)) * 190; } });
  }
}

function separate(s) {
  for (const e of s.enemies) {
    if (e.dead || e.boss) continue;
    near(e.x, e.y, e.r * 0.7, (o, d) => {
      if (o === e || o.id < e.id) return;
      const want = (e.r + o.r) * 0.85;
      if (d >= want) return;
      const push = (want - d) * 0.25;
      const nx = d > 0.01 ? (o.x - e.x) / d : 1, ny = d > 0.01 ? (o.y - e.y) / d : 0;
      e.x -= nx * push; e.y -= ny * push;
      if (!o.boss) { o.x += nx * push; o.y += ny * push; }
    });
  }
}

// ---------- weapons ----------
export function orbs(s, w) {
  const n = wepStat(w, 'n') + s.mods.amount;
  const R = wepStat(w, 'orbit') * Math.sqrt(s.mods.area);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = w.ang + (i / n) * TAU;
    out.push({ x: s.p.x + Math.cos(a) * R, y: s.p.y + Math.sin(a) * R, r: 13 * s.mods.area });
  }
  const inner = w.evo ? WEAPONS.complement.evo.inner : 0;
  for (let i = 0; i < inner; i++) {
    const a = -w.ang * 1.4 + (i / inner) * TAU;
    out.push({ x: s.p.x + Math.cos(a) * R * 0.52, y: s.p.y + Math.sin(a) * R * 0.52, r: 10 * s.mods.area });
  }
  return out;
}

function fire(s, w) {
  const p = s.p, m = s.mods;
  const id = w.id;
  const timed = WEAPONS[id].cd !== undefined;
  if (timed) {
    w.cd -= DT;
    if (w.cd > 0) return;
  }
  const cdNow = timed ? wepStat(w, 'cd') * m.cd : 0;
  switch (id) {
    case 'antibody': {
      const n = wepStat(w, 'n') + m.amount;
      const targets = nearestN(s, p.x, p.y, 430, n, null, (e) => !edible(s, e));
      if (!targets.length) { w.cd = 0.15; return; }
      for (let i = 0; i < n; i++) {
        const t = targets[i % targets.length];
        const a = Math.atan2(t.y - p.y, t.x - p.x) + (i - (n - 1) / 2) * 0.35;
        s.shots.push({ k: 'ab', wid: id, x: p.x, y: p.y, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, r: 7, dmg: wepStat(w, 'dmg'), life: 2.4, pierce: wepStat(w, 'pierce') || 0, mark: wepStat(w, 'mark'), tgt: t.id, hit: [] });
      }
      break;
    }
    case 'lysozyme': {
      const t = nearestN(s, p.x, p.y, 300, 1)[0];
      if (!t) { w.cd = 0.15; return; }
      const n = wepStat(w, 'n') + m.amount;
      const base = Math.atan2(t.y - p.y, t.x - p.x);
      const spread = WEAPONS.lysozyme.spread * (w.evo ? 0.5 : 1);
      for (let i = 0; i < n; i++) {
        const a = base + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0) + (rnd(s) - 0.5) * 0.06;
        const sp = 400 * (0.9 + rnd(s) * 0.2);
        s.shots.push({ k: 'ly', wid: id, x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 5 * m.area, dmg: wepStat(w, 'dmg'), life: WEAPONS.lysozyme.life * (w.evo ? 1.3 : 1), pierce: wepStat(w, 'pierce'), hit: [] });
      }
      break;
    }
    case 'complement': {
      w.ang += WEAPONS.complement.spin * DT;
      const dmg = wepStat(w, 'dmg');
      for (const o of orbs(s, w)) near(o.x, o.y, o.r, (e) => { if (e.oc <= s.t) { e.oc = s.t + 0.45; hit(s, e, dmg, id); } });
      return;
    }
    case 'cytokine':
      s.rings.push({ x: p.x, y: p.y, r: 12, rmax: wepStat(w, 'rmax') * m.area, speed: 430, dmg: wepStat(w, 'dmg'), knock: WEAPONS.cytokine.knock, slow: 1.5, wid: id, hit: {} });
      if (w.evo) for (const mo of s.motes) mo.mag = true;
      break;
    case 'net': {
      const n = wepStat(w, 'n') + m.amount;
      const cands = nearestN(s, p.x, p.y, 380, 14);
      if (!cands.length) { w.cd = 0.3; return; }
      for (let i = 0; i < n; i++) {
        const t = cands[Math.floor(rnd(s) * cands.length)];
        s.zones.push({ k: 'net', wid: id, x: t.x, y: t.y, r: wepStat(w, 'zr') * m.area, life: WEAPONS.net.dur, max: WEAPONS.net.dur, dps: wepStat(w, 'dps'), slow: 0.45, pull: wepStat(w, 'pull') || 0, tick: 0, seed: Math.floor(rnd(s) * 1000) });
      }
      break;
    }
    case 'peroxide':
      if (p.trail >= 15) {
        p.trail = 0;
        const dur = wepStat(w, 'dur');
        s.zones.push({ k: 'ox', wid: id, x: p.x - p.fx * 10, y: p.y - p.fy * 10, r: wepStat(w, 'zr') * m.area, life: dur, max: dur, dps: wepStat(w, 'dps'), tick: 0, seed: Math.floor(rnd(s) * 1000) });
      }
      return;
    case 'interferon': {
      let cur = nearestN(s, p.x, p.y, 330, 1)[0];
      if (!cur) { w.cd = 0.2; return; }
      const n = wepStat(w, 'n') + m.amount * 2;
      const dmg = wepStat(w, 'dmg');
      const pts = [[p.x, p.y]];
      const seen = [];
      for (let i = 0; i < n && cur; i++) {
        pts.push([cur.x, cur.y]);
        seen.push(cur.id);
        const from = cur;
        hit(s, cur, dmg, id);
        cur = nearestN(s, from.x, from.y, 150, 1, seen)[0];
      }
      s.events.push({ e: 'zap', pts });
      break;
    }
    case 'fever': {
      w.tick -= DT;
      if (w.tick > 0) return;
      w.tick = 0.3;
      const dmg = wepStat(w, 'dps') * 0.3;
      const slow = w.evo;
      near(p.x, p.y, wepStat(w, 'zr') * m.area, (e) => { if (slow) { e.slow = 0.4; e.slowF = 0.6; } hit(s, e, dmg, id); });
      return;
    }
  }
  w.cd = cdNow;
  s.events.push({ e: 'fire', w: id });
}

function shots(s) {
  for (const b of s.shots) {
    b.life -= DT;
    if (b.k === 'ab') {
      let t = byId.get(b.tgt);
      if (!t || t.dead) {
        t = nearestN(s, b.x, b.y, 260, 1, b.hit)[0];
        b.tgt = t ? t.id : 0;
      }
      if (t) {
        const a = Math.atan2(t.y - b.y, t.x - b.x);
        const cur = Math.atan2(b.vy, b.vx);
        let da = a - cur;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        const na = cur + Math.max(-0.16, Math.min(0.16, da));
        b.vx = Math.cos(na) * 340; b.vy = Math.sin(na) * 340;
      }
    }
    b.x += b.vx * DT; b.y += b.vy * DT;
    if (b.life <= 0) continue;
    near(b.x, b.y, b.r, (e) => {
      if (b.life <= 0 || b.hit.includes(e.id)) return;
      b.hit.push(e.id);
      if (b.mark && !e.boss) e.mark = Math.max(e.mark, b.mark);
      hit(s, e, b.dmg, b.wid);
      if (b.pierce-- <= 0) b.life = 0;
      else if (b.k === 'ab') b.tgt = 0;
    });
  }
  s.shots = s.shots.filter((b) => b.life > 0);
}

function zones(s) {
  for (const z of s.zones) {
    z.life -= DT;
    z.tick -= DT;
    if (z.tick > 0) continue;
    z.tick = 0.25;
    near(z.x, z.y, z.r, (e, d) => {
      if (z.slow) { e.slow = 0.4; e.slowF = z.slow; }
      if (z.pull && !e.boss && d > 8) { e.x += ((z.x - e.x) / d) * z.pull * 0.25; e.y += ((z.y - e.y) / d) * z.pull * 0.25; }
      hit(s, e, z.dps * 0.25, z.wid);
    });
  }
  s.zones = s.zones.filter((z) => z.life > 0);
}

function rings(s) {
  for (const g of s.rings) {
    g.r += g.speed * DT;
    const reach = Math.min(g.r, g.rmax);
    near(g.x, g.y, reach, (e, d) => {
      if (g.hit[e.id]) return;
      g.hit[e.id] = 1;
      if (g.knock) {
        const k = g.knock * (e.boss ? 0.12 : 1);
        e.kx += ((e.x - g.x) / (d || 1)) * k; e.ky += ((e.y - g.y) / (d || 1)) * k;
      }
      if (g.slow) { e.slow = g.slow; e.slowF = 0.55; }
      if (g.mark && !e.boss) e.mark = Math.max(e.mark, g.mark);
      hit(s, e, g.dmg, g.wid);
    });
  }
  s.rings = s.rings.filter((g) => g.r < g.rmax);
}

function burst(s) {
  const p = s.p;
  p.burst = 0;
  p.inv = Math.max(p.inv, 0.8);
  s.rings.push({ x: p.x, y: p.y, r: 16, rmax: 430 * s.mods.area, speed: 950, dmg: 20 + p.lvl * 2, knock: 240, slow: 2, mark: 6, wid: 'burst', hit: {}, burst: true });
  s.toxins = [];
  s.events.push({ e: 'burst', x: p.x, y: p.y });
}

// ---------- the step ----------
/** input: { mx, my } (a vector, length up to 1) and burst (true to fire the Burst). */
export function step(s, input = {}) {
  if (s.over || s.offers) return;
  if (s.events.length > 600) s.events.length = 0;
  const p = s.p, m = s.mods;
  s.t += DT;

  let mx = input.mx || 0, my = input.my || 0;
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  if (ml > 0.05) { p.fx = mx / Math.min(1, ml) || p.fx; p.fy = my / Math.min(1, ml) || 0; const fl = Math.hypot(p.fx, p.fy) || 1; p.fx /= fl; p.fy /= fl; }
  const ox = p.x, oy = p.y;
  p.x += mx * m.spd * DT; p.y += my * m.spd * DT;
  const pd = Math.hypot(p.x, p.y);
  if (pd > DROP_R - PR) { p.x *= (DROP_R - PR) / pd; p.y *= (DROP_R - PR) / pd; }
  const moved = Math.hypot(p.x - ox, p.y - oy);
  p.trail += moved;
  p.speedNow = moved / DT;
  if (p.inv > 0) p.inv -= DT;
  p.hp = Math.min(p.mhp, p.hp + m.regen * DT);
  if (s.chainT > 0) { s.chainT -= DT; if (s.chainT <= 0) s.chain = 0; }

  spawning(s);
  buildGrid(s);
  if (input.burst && p.burst >= m.burstNeed) burst(s);
  for (const w of s.weapons) fire(s, w);
  shots(s);
  zones(s);
  rings(s);
  for (const e of s.enemies) if (!e.dead) germAI(s, e);
  separate(s);
  if (s.enemies.some((e) => e.dead)) s.enemies = s.enemies.filter((e) => !e.dead);

  for (const b of s.toxins) {
    b.x += b.vx * DT; b.y += b.vy * DT; b.life -= DT;
    const dx = b.x - p.x, dy = b.y - p.y;
    if (dx * dx + dy * dy < (PR * 0.8 + b.r) ** 2) {
      b.life = 0;
      if (p.inv <= 0) { p.hp -= b.dmg; p.inv = 0.5; s.stats.hurt += b.dmg; s.events.push({ e: 'hurt', d: b.dmg, toxin: true }); }
    }
  }
  if (s.toxins.length) s.toxins = s.toxins.filter((b) => b.life > 0);

  let got = 0;
  for (const mo of s.motes) {
    const dx = p.x - mo.x, dy = p.y - mo.y;
    const d2 = dx * dx + dy * dy;
    if (!mo.mag && d2 < m.pickup * m.pickup) mo.mag = true;
    if (mo.mag) {
      const d = Math.sqrt(d2) || 1;
      mo.sp = Math.min(640, mo.sp + 1400 * DT);
      mo.x += (dx / d) * mo.sp * DT; mo.y += (dy / d) * mo.sp * DT;
      if (d < 20) { mo.v0 = mo.v; got += mo.v; mo.v = 0; }
    }
  }
  if (got) {
    gainXp(s, got);
    s.motes = s.motes.filter((mo) => mo.v > 0);
    s.events.push({ e: 'xp', v: got });
  }
  for (const d of s.drops) {
    if ((d.x - p.x) ** 2 + (d.y - p.y) ** 2 < 36 * 36) {
      d.got = true;
      if (d.kind === 'sugar') p.hp = Math.min(p.mhp, p.hp + 25);
      else for (const mo of s.motes) mo.mag = true;
      s.events.push({ e: 'pickup', kind: d.kind });
    }
  }
  if (s.drops.some((d) => d.got)) s.drops = s.drops.filter((d) => !d.got);

  if (p.hp <= 0 && !s.over) {
    p.hp = 0;
    s.over = 'dead';
    s.events.push({ e: 'dead' });
  }
  if (s.noLevel > 0) s.noLevel -= DT;
  if (!s.over && p.xp >= p.need && !(s.noLevel > 0)) {
    p.xp -= p.need;
    p.lvl++;
    p.need = xpFor(p.lvl);
    makeOffers(s);
    s.events.push({ e: 'level', lvl: p.lvl });
  }
}

/** What the HUD announces: the wave after this one, and when. */
export function nextWave(s) {
  const seg = Math.floor(s.t / SEGMENT);
  const at = (seg + 1) * SEGMENT;
  const boss = s.bossIdx < BOSSES.length ? { k: BOSSES[s.bossIdx], at: BOSS_TIMES[s.bossIdx] } : null;
  if (boss && boss.at - s.t <= SEGMENT) return { k: boss.k, in: boss.at - s.t, boss: true };
  return { k: s.schedule[Math.min(s.schedule.length - 1, seg + 1)], in: at - s.t, boss: false };
}

/** A single number for "best" and the words for it. */
export function score(s) {
  const value = s.strain * 100000 + (s.over === 'won' ? 50000 : 0) + Math.floor(s.t) * 10 + Math.min(9, s.p.lvl / 10);
  return { value };
}

/** Debug and tests: put a germ on the slide. */
export function debugSpawn(s, kind, x, y, opt) {
  return spawn(s, kind, x, y, opt);
}
