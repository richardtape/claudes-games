// Night Stitch rules: pure and DOM-free so tests and the simulator can run them headless.
//
//   const s = newNight({ seed: '2026-10-16' });
//   step(s, { target: { x, y } });   // pointer: the needle chases the target (capped speed)
//   step(s, { dir: { x, y } });      // keyboard: steer
//   step(s, { jump: { x, y } });     // touch-down: re-thread at a new spot
//   s.events.splice(0)               // what happened this step, for sound and juice
//
// Hoop centre is (0,0), radius HOOP_R. The thread is s.thread (oldest point first); the
// needle is its live head and is not stored in the array.
import { createRng } from '../../../shared/rng.js';
import {
  HOOP_R, HOUR_LEN, THREAD_LEN, NEEDLE_SPEED, KEY_SPEED, SEG, CLOSE_TOL, CLOSE_GAP, MIN_LOOP_AREA,
  LOSS_AREA, DAWN_BONUS, DARN_POINTS, GILDED_CHANCE, GILDED_MULT, BOSS_DECAY, FLOSS, SPECIES, HOURS, NOTIONS,
} from './data.js';
import { segmentIntersection, pointInPolygon, polygonArea, closestOnSegment, polygonCentroid } from './geom.js';

export const DT = 1 / 60;
const NEEDLE_MARGIN = 14;

export function newNight({ seed = String(Date.now()), director = true, daily = false } = {}) {
  const start = { x: 0, y: HOOP_R * 0.3 };
  const s = {
    seed,
    daily,
    director,
    phase: 'play', // play | notion | over | dawn
    t: 0,
    hour: 0,
    hourT: 0,
    needle: { ...start },
    needleSpeed: 0,
    thread: [{ ...start }],
    moths: [],
    holes: [],
    nextId: 1,
    score: 0,
    dawnBonus: 0,
    floss: 0,
    notions: {},
    mods: {},
    offers: [],
    wax: 0,
    history: [], // everything stitched into the sampler, in order
    events: [],
    stats: { caught: {}, gilded: {}, loops: 0, biggestLoop: 0, bestLoopScore: 0, darned: 0, snaps: 0, startles: 0 },
    spawn: { next: 1.2, beetleNext: 4, queued: null, beetleQueued: null },
    rng: createRng(`${seed}:world`),
    arrivalRng: createRng(`${seed}:arrivals`),
    beetleRng: createRng(`${seed}:beetles`),
    notionRng: createRng(`${seed}:notions`),
  };
  recompute(s);
  startHour(s);
  return s;
}

function recompute(s) {
  const n = (id) => s.notions[id] || 0;
  s.mods = {
    threadLen: THREAD_LEN * (1 + 0.2 * n('spool')),
    speed: NEEDLE_SPEED * (1 + 0.15 * n('needle')),
    keySpeed: KEY_SPEED * (1 + 0.15 * n('needle')),
    eat: 1 - 0.2 * n('lavender'),
    wax: n('beeswax'),
    startle: 1 - 0.25 * n('thimble'),
    gold: 0.5 * n('gold'),
    beetleSpeed: 1 - 0.3 * n('cedar'),
    mushroom: n('mushroom') > 0,
    wick: n('wick'),
    pins: 5 * n('pins'),
  };
}

// ---------------------------------------------------------------------------------------
// Queries

export function integrity(s) {
  let area = 0;
  for (const h of s.holes) area += Math.PI * h.r * h.r;
  return Math.max(0, 1 - area / LOSS_AREA);
}

export function threadLength(s) {
  const th = s.thread;
  let len = 0;
  for (let i = 1; i < th.length; i++) len += Math.hypot(th[i].x - th[i - 1].x, th[i].y - th[i - 1].y);
  const last = th[th.length - 1];
  return len + Math.hypot(s.needle.x - last.x, s.needle.y - last.y);
}

/** "1:24 AM" style time of night. */
export function clockLabel(s) {
  const minutes = (22 + s.hour) * 60 + Math.floor((Math.min(s.hourT, HOUR_LEN) / HOUR_LEN) * 60);
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h24 % 12 || 12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** 0..1 through the whole night. */
export const nightProgress = (s) => Math.min(1, (s.hour + Math.min(s.hourT, HOUR_LEN) / HOUR_LEN) / HOURS.length);

export const isBoss = (m) => !!SPECIES[m.kind].boss;

// ---------------------------------------------------------------------------------------
// Setup helpers (also used by the director and the debug API)

function randomGoal(s, rng = s.rng) {
  const a = rng.float(0, Math.PI * 2);
  const r = HOOP_R * 0.82 * Math.sqrt(rng.next()) * (1 - 0.22 * s.mods.wick);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

export function addMoth(s, kind, x, y, { settled = false, frozen = false, gilded = false, goal = null, flyTime = null } = {}) {
  const sp = SPECIES[kind];
  const m = {
    id: s.nextId++,
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: s.rng.float(0, Math.PI * 2),
    mode: 'fly',
    modeT: 0,
    t: s.rng.float(0, 10),
    flyTime: flyTime ?? s.rng.float(sp.fly[0], sp.fly[1]),
    goal: goal || randomGoal(s),
    wobF: s.rng.float(2.2, 3.6),
    wobP: s.rng.float(0, Math.PI * 2),
    orbitR: s.rng.float(140, 300),
    orbitDir: s.rng.chance(0.5) ? 1 : -1,
    gilded,
    frozen,
    hole: null,
    inside: Math.hypot(x, y) < HOOP_R - 30,
    hp: sp.hp || 1,
    maxHp: sp.hp || 1,
    lastHit: 0,
    gustT: sp.gustEvery || 0,
    windup: 0,
    snapCd: 0,
  };
  if (sp.crawler) {
    m.mode = 'crawl';
    m.angle = Math.atan2(-y, -x);
  }
  s.moths.push(m);
  if (settled) settle(s, m);
  return m;
}

export function addBeetle(s, x, y, { heading = null } = {}) {
  const b = addMoth(s, 'beetle', x, y);
  if (heading !== null) b.angle = heading;
  b.inside = true;
  return b;
}

export function addHole(s, x, y, r, eater = null) {
  const h = { id: s.nextId++, x, y, r, rMax: r, eater, seed: s.rng.int(0, 1e6) };
  s.holes.push(h);
  return h;
}

function settle(s, m) {
  const sp = SPECIES[m.kind];
  m.mode = 'eat';
  m.modeT = 0;
  m.vx = m.vy = 0;
  const h = addHole(s, m.x, m.y, 2, m.id);
  h.rMax = sp.holeMax * s.rng.float(0.85, 1.15);
  m.hole = h.id;
  s.events.push({ type: 'land', id: m.id, kind: m.kind, x: m.x, y: m.y });
}

function takeOff(s, m, from = null) {
  const sp = SPECIES[m.kind];
  const h = s.holes.find((x) => x.id === m.hole);
  if (h) h.eater = null;
  m.hole = null;
  m.mode = 'fly';
  m.modeT = 0;
  m.flyTime = s.rng.float(sp.fly[0], sp.fly[1]);
  if (from) {
    const dx = m.x - from.x;
    const dy = m.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    const go = s.rng.float(180, 300);
    let gx = m.x + (dx / d) * go;
    let gy = m.y + (dy / d) * go;
    const gr = Math.hypot(gx, gy);
    if (gr > HOOP_R * 0.82) {
      gx *= (HOOP_R * 0.82) / gr;
      gy *= (HOOP_R * 0.82) / gr;
    }
    m.goal = { x: gx, y: gy };
    m.vx = (dx / d) * sp.speed * 1.6;
    m.vy = (dy / d) * sp.speed * 1.6;
  } else {
    m.goal = randomGoal(s);
  }
}

// ---------------------------------------------------------------------------------------
// The step

export function step(s, input = {}, dt = DT) {
  if (s.phase !== 'play') return s;
  s.t += dt;
  s.hourT += dt;
  moveNeedle(s, input, dt);
  updateThread(s);
  updateMoths(s, dt);
  if (s.director) direct(s, dt);
  if (integrity(s) <= 0) {
    s.phase = 'over';
    s.events.push({ type: 'over' });
  } else if (s.hourT >= HOUR_LEN) {
    endHour(s);
  }
  return s;
}

function clampToHoop(p, margin = NEEDLE_MARGIN) {
  const r = Math.hypot(p.x, p.y);
  const max = HOOP_R - margin;
  if (r > max) return { x: (p.x / r) * max, y: (p.y / r) * max };
  return { x: p.x, y: p.y };
}

function moveNeedle(s, input, dt) {
  const n = s.needle;
  const ox = n.x;
  const oy = n.y;
  if (input.jump) {
    const p = clampToHoop(input.jump);
    n.x = p.x;
    n.y = p.y;
    s.thread = [{ x: n.x, y: n.y }];
    s.needleSpeed = 0;
    return;
  }
  let tx;
  let ty;
  let maxD;
  if (input.dir && (input.dir.x || input.dir.y)) {
    const l = Math.hypot(input.dir.x, input.dir.y);
    maxD = s.mods.keySpeed * dt;
    tx = n.x + (input.dir.x / l) * maxD;
    ty = n.y + (input.dir.y / l) * maxD;
  } else if (input.target) {
    const p = clampToHoop(input.target);
    tx = p.x;
    ty = p.y;
    maxD = s.mods.speed * dt;
  } else {
    s.needleSpeed = 0;
    return;
  }
  let dx = tx - n.x;
  let dy = ty - n.y;
  const d = Math.hypot(dx, dy);
  if (d > maxD) {
    dx *= maxD / d;
    dy *= maxD / d;
  }
  const p = clampToHoop({ x: n.x + dx, y: n.y + dy });
  n.x = p.x;
  n.y = p.y;
  s.needleSpeed = Math.hypot(n.x - ox, n.y - oy) / dt;
}

function updateThread(s) {
  const th = s.thread;
  const last = th[th.length - 1];
  if (Math.hypot(s.needle.x - last.x, s.needle.y - last.y) >= SEG) {
    th.push({ x: s.needle.x, y: s.needle.y });
    if (detectLoop(s)) return;
  }
  trimThread(s);
}

function trimThread(s) {
  const th = s.thread;
  let excess = threadLength(s) - s.mods.threadLen;
  while (excess > 0 && th.length > 1) {
    const a = th[0];
    const b = th[1];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l <= excess) {
      th.shift();
      excess -= l;
    } else {
      const k = excess / l;
      a.x += (b.x - a.x) * k;
      a.y += (b.y - a.y) * k;
      excess = 0;
    }
  }
}

/** Checks the newest thread segment against the old thread; closes the loop if it caught anything. */
function detectLoop(s) {
  const th = s.thread;
  const k = th.length - 1;
  if (k < 3) return false;
  const a = th[k - 1];
  const b = th[k];
  // Exact crossings, oldest first (the biggest loop wins).
  for (let i = 0; i <= k - 3; i++) {
    const x = segmentIntersection(a, b, th[i], th[i + 1]);
    if (!x) continue;
    const poly = [{ x: x.x, y: x.y }, ...th.slice(i + 1, k)];
    if (polygonArea(poly) >= MIN_LOOP_AREA && closeLoop(s, poly)) return true;
  }
  // Near misses: the needle came back within CLOSE_TOL of thread laid well before.
  const cum = [0];
  for (let i = 1; i <= k; i++) cum[i] = cum[i - 1] + Math.hypot(th[i].x - th[i - 1].x, th[i].y - th[i - 1].y);
  for (let i = 0; i <= k - 2; i++) {
    if (cum[k] - cum[i + 1] < CLOSE_GAP) break;
    const c = closestOnSegment(b.x, b.y, th[i], th[i + 1]);
    if (Math.hypot(b.x - c.x, b.y - c.y) > CLOSE_TOL) continue;
    const poly = [{ x: c.x, y: c.y }, ...th.slice(i + 1, k + 1)];
    if (polygonArea(poly) >= MIN_LOOP_AREA && closeLoop(s, poly)) return true;
  }
  return false;
}

function mothValue(s, m) {
  return (SPECIES[m.kind].points + s.mods.pins) * (m.gilded ? GILDED_MULT : 1);
}

function closeLoop(s, poly) {
  const caught = [];
  const hits = [];
  for (const m of s.moths) {
    if (!pointInPolygon(m.x, m.y, poly)) continue;
    if (isBoss(m) && m.hp > 1) hits.push(m);
    else caught.push(m);
  }
  const darned = s.holes.filter((h) => pointInPolygon(h.x, h.y, poly));
  if (!caught.length && !hits.length && !darned.length) return false;

  const color = FLOSS[s.floss % FLOSS.length];
  s.floss++;
  for (const m of hits) {
    m.hp--;
    m.lastHit = s.t;
  }
  if (caught.length && s.mods.mushroom) {
    const open = s.holes.filter((h) => !darned.includes(h)).sort((p, q) => q.r - p.r)[0];
    if (open) darned.push(open);
  }
  const n = caught.length;
  const base = caught.reduce((sum, m) => sum + mothValue(s, m), 0);
  const gold = n >= 4 ? 1 + s.mods.gold : 1;
  const loopScore = Math.round(base * n * gold);
  const darnScore = darned.length * DARN_POINTS;
  s.score += loopScore + darnScore;

  for (const h of darned) {
    const eater = s.moths.find((m) => m.id === h.eater && !caught.includes(m));
    if (eater) takeOff(s, eater);
    s.holes.splice(s.holes.indexOf(h), 1);
    s.history.push({ type: 'darn', x: h.x, y: h.y, r: h.r, color, seed: h.seed });
  }
  // History order is reveal order: darns, then the loop's outline, then each moth.
  const pts = poly.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
  if (n || hits.length) s.history.push({ type: 'loop', pts, color });
  for (const m of caught) {
    s.moths.splice(s.moths.indexOf(m), 1);
    s.stats.caught[m.kind] = (s.stats.caught[m.kind] || 0) + 1;
    if (m.gilded) s.stats.gilded[m.kind] = (s.stats.gilded[m.kind] || 0) + 1;
    s.history.push({ type: 'moth', kind: m.kind, x: m.x, y: m.y, angle: m.angle, gilded: m.gilded });
  }
  s.stats.loops++;
  s.stats.darned += darned.length;
  s.stats.biggestLoop = Math.max(s.stats.biggestLoop, n);
  s.stats.bestLoopScore = Math.max(s.stats.bestLoopScore, loopScore);
  s.events.push({
    type: 'loop',
    poly: pts,
    color,
    n,
    score: loopScore + darnScore,
    loopScore,
    gold: gold > 1,
    centroid: polygonCentroid(poly),
    caught: caught.map((m) => ({ id: m.id, kind: m.kind, x: m.x, y: m.y, angle: m.angle, gilded: m.gilded, points: mothValue(s, m) })),
    hits: hits.map((m) => ({ id: m.id, kind: m.kind, x: m.x, y: m.y, hp: m.hp })),
    darned: darned.map((h) => ({ x: h.x, y: h.y, r: h.r })),
  });
  s.thread = [{ x: s.needle.x, y: s.needle.y }];
  return true;
}

// ---------------------------------------------------------------------------------------
// Moths and beetles

function eatRate(s) {
  const aura = s.moths.some((m) => SPECIES[m.kind].aura) ? SPECIES.deathshead.aura : 1;
  return s.mods.eat * aura * (HOURS[s.hour].hunger || 1);
}

function updateMoths(s, dt) {
  const eatMul = eatRate(s);
  for (const m of [...s.moths]) {
    m.t += dt;
    if (m.snapCd > 0) m.snapCd -= dt;
    if (m.frozen) continue;
    const sp = SPECIES[m.kind];
    if (m.mode === 'crawl') {
      crawl(s, m, sp, dt);
      continue;
    }
    if (sp.boss) bossTick(s, m, sp, dt);
    if (m.mode === 'eat') {
      const h = s.holes.find((x) => x.id === m.hole);
      if (!h) {
        takeOff(s, m);
        continue;
      }
      h.r = Math.min(h.rMax, h.r + sp.eat * eatMul * dt);
      const near = Math.hypot(s.needle.x - m.x, s.needle.y - m.y) < sp.startle * s.mods.startle;
      if (near && s.needleSpeed > 40) {
        takeOff(s, m, s.needle);
        s.stats.startles++;
        s.events.push({ type: 'startle', id: m.id, kind: m.kind, x: m.x, y: m.y });
      } else if (h.r >= h.rMax) {
        takeOff(s, m);
        s.events.push({ type: 'hole-done', x: h.x, y: h.y, r: h.r });
      }
      continue;
    }
    fly(s, m, sp, dt);
  }
}

function fly(s, m, sp, dt) {
  const r = Math.hypot(m.x, m.y);
  if (r < HOOP_R - 30) m.inside = true;
  if (m.inside) m.modeT += dt;
  if (sp.lands === false && !sp.boss) {
    // Circle the lamp.
    const a = Math.atan2(m.y, m.x) + m.orbitDir * 0.5;
    m.goal = { x: Math.cos(a) * m.orbitR, y: Math.sin(a) * m.orbitR };
  }
  let gx = m.goal.x - m.x;
  let gy = m.goal.y - m.y;
  const gd = Math.hypot(gx, gy) || 1;
  gx /= gd;
  gy /= gd;
  const wob = Math.sin(m.t * m.wobF + m.wobP) * 0.75;
  let dx = (gx - gy * wob) * sp.speed;
  let dy = (gy + gx * wob) * sp.speed;
  if (sp.flee) {
    const nx = m.x - s.needle.x;
    const ny = m.y - s.needle.y;
    const nd = Math.hypot(nx, ny) || 1;
    if (nd < sp.flee && m.inside) {
      const k = (1 - nd / sp.flee) * sp.speed * 2.2;
      dx += (nx / nd) * k;
      dy += (ny / nd) * k;
    }
  }
  if (s.mods.wick && m.inside) {
    dx -= (m.x / (r || 1)) * sp.speed * 0.25 * s.mods.wick;
    dy -= (m.y / (r || 1)) * sp.speed * 0.25 * s.mods.wick;
  }
  if (m.inside && r > HOOP_R * 0.86) {
    dx -= (m.x / r) * sp.speed * 1.5;
    dy -= (m.y / r) * sp.speed * 1.5;
  }
  const k = Math.min(1, dt * 3.2);
  m.vx += (dx - m.vx) * k;
  m.vy += (dy - m.vy) * k;
  m.x += m.vx * dt;
  m.y += m.vy * dt;
  if (Math.hypot(m.vx, m.vy) > 5) m.angle = Math.atan2(m.vy, m.vx);
  if (gd < 24) m.goal = randomGoal(s);
  if (sp.lands !== false && m.inside && m.modeT >= m.flyTime && r < HOOP_R - 40) settle(s, m);
}

function crawl(s, m, sp, dt) {
  m.angle += Math.sin(m.t * 0.8 + m.wobP) * 0.25 * dt;
  const v = sp.speed * s.mods.beetleSpeed;
  m.x += Math.cos(m.angle) * v * dt;
  m.y += Math.sin(m.angle) * v * dt;
  const r = Math.hypot(m.x, m.y);
  if (r < HOOP_R - 20) m.inside = true;
  if (m.inside && r > HOOP_R + 30) {
    s.moths.splice(s.moths.indexOf(m), 1);
    return;
  }
  if (m.snapCd <= 0 && m.inside) {
    const cut = newestSegmentWithin(s, m.x, m.y, sp.size + 3);
    if (cut) snapThread(s, cut, m);
  }
}

/** The thread segment nearest the needle that passes within `r` of (x, y). */
function newestSegmentWithin(s, x, y, r) {
  const pts = [...s.thread, s.needle];
  for (let i = pts.length - 2; i >= 0; i--) {
    const c = closestOnSegment(x, y, pts[i], pts[i + 1]);
    if (Math.hypot(x - c.x, y - c.y) <= r) return { i, x: c.x, y: c.y };
  }
  return null;
}

function snapThread(s, cut, by) {
  by.snapCd = 1.6;
  if (s.wax > 0) {
    s.wax--;
    s.events.push({ type: 'wax', x: cut.x, y: cut.y, left: s.wax });
    return;
  }
  const lost = s.thread.slice(0, cut.i + 1).concat([{ x: cut.x, y: cut.y }]);
  s.thread = [{ x: cut.x, y: cut.y }, ...s.thread.slice(cut.i + 1)];
  s.stats.snaps++;
  s.events.push({ type: 'snap', x: cut.x, y: cut.y, lost, by: by.kind });
}

function bossTick(s, m, sp, dt) {
  if (m.hp < m.maxHp && s.t - m.lastHit > BOSS_DECAY) {
    m.hp++;
    m.lastHit = s.t;
    s.events.push({ type: 'boss-heal', id: m.id, kind: m.kind, hp: m.hp, x: m.x, y: m.y });
  }
  if (!sp.gustEvery || !m.inside) return;
  m.gustT -= dt;
  m.windup = Math.max(0, 1 - m.gustT / sp.gustWindup);
  if (m.gustT <= sp.gustWindup && !m.winding) {
    m.winding = true;
    s.events.push({ type: 'gust-windup', id: m.id, x: m.x, y: m.y });
  }
  if (m.gustT > 0) return;
  m.gustT = sp.gustEvery;
  m.winding = false;
  m.windup = 0;
  s.events.push({ type: 'gust', id: m.id, x: m.x, y: m.y, r: sp.gustRadius });
  const cut = newestSegmentWithin(s, m.x, m.y, sp.gustRadius);
  if (cut) snapThread(s, cut, m);
  for (const o of s.moths) {
    if (o === m || o.mode === 'crawl') continue;
    const dx = o.x - m.x;
    const dy = o.y - m.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > sp.gustRadius || o.mode === 'eat') continue;
    o.vx += (dx / d) * 260;
    o.vy += (dy / d) * 260;
  }
}

// ---------------------------------------------------------------------------------------
// The night: arrivals, hours, notions

function rollArrival(s, kind = null) {
  const rng = s.arrivalRng;
  const H = HOURS[s.hour];
  const mix = Object.entries(H.mix);
  const k = kind || rng.weighted(mix, (e) => e[1])[0];
  const a = rng.float(0, Math.PI * 2);
  const dist = HOOP_R + rng.float(60, 140);
  return {
    kind: k,
    x: Math.cos(a) * dist,
    y: Math.sin(a) * dist,
    goal: randomGoal(s, rng),
    gilded: rng.chance(GILDED_CHANCE),
  };
}

// Moths come in little flights that settle near each other, so loops can catch several.
const FLIGHT_SIZES = [
  [1, 40],
  [2, 32],
  [3, 20],
  [4, 8],
];
export const MEAN_FLIGHT = FLIGHT_SIZES.reduce((a, [n, w]) => a + n * w, 0) / FLIGHT_SIZES.reduce((a, [, w]) => a + w, 0);

function rollFlight(s) {
  const rng = s.arrivalRng;
  const lead = rollArrival(s);
  const n = SPECIES[lead.kind].lands === false ? 1 : rng.weighted(FLIGHT_SIZES, (e) => e[1])[0];
  const flight = [lead];
  for (let i = 1; i < n; i++) {
    const kind = rng.chance(0.7) ? lead.kind : rollArrival(s).kind;
    const lands = SPECIES[kind].lands !== false;
    flight.push({
      kind: lands ? kind : lead.kind,
      x: lead.x + rng.float(-50, 50),
      y: lead.y + rng.float(-50, 50),
      goal: { x: lead.goal.x + rng.float(-65, 65), y: lead.goal.y + rng.float(-65, 65) },
      gilded: rng.chance(GILDED_CHANCE),
      delay: i * rng.float(0.1, 0.35),
    });
  }
  return flight;
}

function arrive(s, a) {
  const m = addMoth(s, a.kind, a.x, a.y, { gilded: a.gilded, goal: a.goal });
  if (a.delay) m.flyTime += a.delay * 3;
  s.events.push({ type: 'arrive', id: m.id, kind: m.kind, gilded: m.gilded, x: m.x, y: m.y });
  return m;
}

function direct(s, dt) {
  const H = HOURS[s.hour];
  const sp = s.spawn;
  sp.next -= dt;
  if (sp.next <= 0) {
    if (!sp.queued) sp.queued = rollFlight(s);
    const crowd = s.moths.filter((m) => !isBoss(m) && m.mode !== 'crawl').length;
    if (crowd < H.cap) {
      for (const a of sp.queued) arrive(s, a);
      // Keep the average arrival rate at one moth per `every` seconds.
      sp.next += H.every * sp.queued.length * s.arrivalRng.float(0.75, 1.25);
      sp.queued = null;
    }
  }
  if (H.beetleEvery) {
    sp.beetleNext -= dt;
    if (sp.beetleNext <= 0) {
      const rng = s.beetleRng;
      const a = rng.float(0, Math.PI * 2);
      const b = addMoth(s, 'beetle', Math.cos(a) * (HOOP_R + 10), Math.sin(a) * (HOOP_R + 10));
      b.angle = a + Math.PI + rng.float(-0.45, 0.45);
      s.events.push({ type: 'arrive', id: b.id, kind: 'beetle', x: b.x, y: b.y });
      sp.beetleNext = H.beetleEvery * rng.float(0.8, 1.2);
    }
  }
}

function startHour(s) {
  const H = HOURS[s.hour];
  s.wax = s.mods.wax;
  s.events.push({ type: 'hour', hour: s.hour, label: H.label });
  if (!s.director) return;
  if (H.boss) {
    const a = rollArrival(s, H.boss);
    const m = arrive(s, { ...a, gilded: false });
    m.goal = { x: 0, y: 0 };
  }
  if (H.swarm) {
    const rng = s.arrivalRng;
    const a = rng.float(0, Math.PI * 2);
    const cx = Math.cos(a + Math.PI) * HOOP_R * 0.35;
    const cy = Math.sin(a + Math.PI) * HOOP_R * 0.35;
    for (let i = 0; i < H.swarm; i++) {
      const r = HOOP_R + rng.float(40, 160);
      const aa = a + rng.float(-0.35, 0.35);
      arrive(s, {
        kind: 'clothes',
        x: Math.cos(aa) * r,
        y: Math.sin(aa) * r,
        goal: { x: cx + rng.float(-110, 110), y: cy + rng.float(-110, 110) },
        gilded: rng.chance(GILDED_CHANCE),
      });
    }
    s.events.push({ type: 'swarm', x: Math.cos(a) * HOOP_R, y: Math.sin(a) * HOOP_R });
  }
}

function endHour(s) {
  if (s.hour >= HOURS.length - 1) {
    s.phase = 'dawn';
    s.dawnBonus = Math.round(integrity(s) * 100) * DAWN_BONUS;
    s.score += s.dawnBonus;
    s.events.push({ type: 'dawn', bonus: s.dawnBonus });
    return;
  }
  for (const m of s.moths.filter(isBoss)) {
    s.moths.splice(s.moths.indexOf(m), 1);
    s.events.push({ type: 'boss-left', kind: m.kind, x: m.x, y: m.y });
  }
  const open = NOTIONS.filter((n) => (s.notions[n.id] || 0) < n.max).map((n) => n.id);
  s.offers = s.notionRng.shuffle(open).slice(0, 3);
  s.phase = 'notion';
  s.events.push({ type: 'chime', hour: s.hour + 1, label: HOURS[s.hour + 1].label });
}

/**
 * Take a notion. During a notion pick this also starts the next hour. `force` applies it
 * at any time without changing the phase (tests and the debug API).
 */
export function chooseNotion(s, id, { force = false } = {}) {
  const def = NOTIONS.find((n) => n.id === id);
  if (!def) return false;
  if (!force && (s.phase !== 'notion' || !s.offers.includes(id))) return false;
  s.notions[id] = (s.notions[id] || 0) + 1;
  recompute(s);
  if (force) {
    s.wax = s.mods.wax;
    return true;
  }
  s.offers = [];
  s.phase = 'play';
  s.hour++;
  s.hourT = 0;
  startHour(s);
  return true;
}
