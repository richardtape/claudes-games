// Hole generator for the bank (tools/bank.mjs). Builds a hole from a tier's archetypes; the
// solver in bot.js then decides whether it is any good. Pure.
import { W, H, COMET_R, surfacePoint } from './engine.js';

const TAU = Math.PI * 2;
const EDGE = 56; // keep bodies this far inside the plate

export const STARS = [
  'Alcor', 'Mizar', 'Vega', 'Deneb', 'Altair', 'Rigel', 'Capella', 'Algol', 'Electra', 'Maia', 'Merope',
  'Alcyone', 'Sadr', 'Albireo', 'Achernar', 'Mira', 'Caph', 'Schedar', 'Ruchbah', 'Nunki', 'Ascella',
  'Thuban', 'Eltanin', 'Rastaban', 'Kochab', 'Pherkad', 'Izar', 'Muphrid', 'Arcturus', 'Spica', 'Porrima',
  'Denebola', 'Regulus', 'Algieba', 'Zosma', 'Castor', 'Pollux', 'Alhena', 'Wasat', 'Procyon', 'Gomeisa',
  'Adhara', 'Wezen', 'Aludra', 'Mirzam', 'Bellatrix', 'Saiph', 'Alnitak', 'Alnilam', 'Mintaka', 'Hatysa',
  'Aldebaran', 'Elnath', 'Menkalinan', 'Almach', 'Mirach', 'Alpheratz', 'Hamal', 'Sheratan', 'Menkar',
  'Diphda', 'Fomalhaut', 'Enif', 'Scheat', 'Markab', 'Algenib', 'Sadalsuud', 'Skat', 'Dabih', 'Nashira',
  'Rasalhague', 'Sabik', 'Unukalhai', 'Gemma', 'Alkaid', 'Phecda', 'Megrez', 'Dubhe', 'Merak', 'Talitha',
  'Alula', 'Tarazed', 'Sualocin', 'Rotanev', 'Peacock', 'Shaula', 'Lesath', 'Acrux', 'Mimosa', 'Hadar',
];

const TITLES = {
  plain: ['{s}', 'The Shores of {s}', '{s} and its Neighbour', 'The Approach to {s}'],
  blocker: ['The Shoulder of {s}', 'Around {s}', 'The Great Wall of {s}', '{s} in the Way'],
  far: ['The Far Side of {s}', 'The Back of {s}', '{s} Turned Away'],
  binary: ['The Binary of {s}', 'The Twins of {s}', '{s} and its Companion'],
  belt: ['The Shoals of {s}', 'The Reef of {s}', 'The Gravel of {s}'],
  ring: ['The Ringwall of {s}', 'The Fortress of {s}', '{s} Enclosed'],
  sun: ['The Furnace of {s}', 'The Corona of {s}', '{s} under the Sun'],
  void: ['The Dark Star of {s}', 'The Abyss near {s}', 'The Drain of {s}'],
  gates: ['The Gates of {s}', 'The Doors of {s}', 'The Shortcut to {s}'],
  nebula: ['The Veil of {s}', 'The Mists of {s}', 'The Cloud over {s}'],
};

/** Which archetypes a tier draws from, with weights. */
export const TIERS = {
  1: { mids: [1, 1], kinds: { plain: 3, blocker: 2 }, facing: true },
  2: { mids: [1, 2], kinds: { blocker: 2, far: 2, binary: 2, belt: 2, nebula: 1 } },
  3: { mids: [1, 3], kinds: { sun: 3, void: 2, gates: 2, ring: 2, binary: 1, belt: 1, far: 1 } },
  4: { mids: [2, 3], kinds: { sun: 2, void: 2, gates: 2, ring: 2 }, extra: true },
};

function weighted(rng, obj) {
  return rng.weighted(Object.entries(obj), ([, w]) => w)[0];
}

const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
const inside = (b, pad = EDGE) => b.x - b.r >= pad && b.x + b.r <= W - pad && b.y - b.r >= pad && b.y + b.r <= H - pad;

/** Try to add a body; false if it doesn't fit. Nebulae may overlap anything but the tee. */
function fits(bodies, b, minGap) {
  if (!inside(b, b.k === 'nebula' ? 20 : b.k === 'rock' ? 40 : EDGE)) return false;
  for (const o of bodies) {
    if (b.k === 'nebula' || o.k === 'nebula') continue;
    const need = b.k === 'rock' && o.k === 'rock' ? 4 : minGap;
    if (gap(b, o) < need) return false;
  }
  return true;
}

function placeNear(rng, bodies, make, { tries = 60, minGap = 64 } = {}) {
  for (let i = 0; i < tries; i++) {
    const b = make();
    if (fits(bodies, b, minGap)) {
      bodies.push(b);
      return b;
    }
  }
  return null;
}

/** Point along the segment from a to b at t, pushed sideways by s (units). */
function along(a, b, t, s = 0) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  return { x: a.x + dx * t - (dy / L) * s, y: a.y + dy * t + (dx / L) * s };
}

export function generateHole(rng, tier) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const h = tryBuild(rng, tier);
    if (h) return h;
  }
  throw new Error(`could not build a tier ${tier} hole`);
}

function tryBuild(rng, tier) {
  const T = TIERS[tier];
  const kind = weighted(rng, T.kinds);
  const extra = T.extra ? weighted(rng, { belt: 1, nebula: 1, binary: 1, blocker: 1, none: 1 }) : null;
  const bodies = [];

  const tee = { k: 'planet', x: rng.float(150, 420), y: rng.float(170, 830), r: rng.float(38, 70) };
  bodies.push(tee);
  const cupR = kind === 'ring' ? rng.float(36, 54) : rng.float(34, 80);
  const cupPad = kind === 'ring' ? 130 : 0;
  const cup = { k: 'planet', x: rng.float(1080 - cupPad * 0.3, 1460 - cupPad), y: rng.float(150 + cupPad, 850 - cupPad), r: cupR };
  if (!fits(bodies, cup, 200)) return null;
  bodies.push(cup);

  const line = (t, s) => along(tee, cup, t, s);
  const mids = rng.int(T.mids[0], T.mids[1]);

  const midPlanet = (r0, r1, t0 = 0.25, t1 = 0.75, side = 260) =>
    placeNear(rng, bodies, () => {
      const p = line(rng.float(t0, t1), rng.float(-side, side));
      return { k: 'planet', x: p.x, y: p.y, r: rng.float(r0, r1), d: rng.chance(0.25) ? 1.35 : 1 };
    });

  const want = new Set([kind, extra]);
  if (want.has('blocker')) {
    if (!placeNear(rng, bodies, () => {
      const p = line(rng.float(0.4, 0.6), rng.float(-40, 40));
      return { k: 'planet', x: p.x, y: p.y, r: tier === 1 ? rng.float(65, 90) : rng.float(80, 110), d: 1 };
    })) return null;
  }
  if (want.has('binary')) {
    // Two worlds close together near the cup, or the cup world gets a close companion.
    const g = rng.float(34, 70);
    const r = rng.float(36, 70);
    const a = rng.float(0, TAU);
    const comp = { k: 'planet', x: cup.x + Math.cos(a) * (cup.r + r + g), y: cup.y + Math.sin(a) * (cup.r + r + g), r, d: 1 };
    if (!fits(bodies.filter((b) => b !== cup), comp, 64) || gap(comp, cup) < 30) return null;
    bodies.push(comp);
  }
  if (want.has('sun')) {
    if (!placeNear(rng, bodies, () => {
      const p = line(rng.float(0.35, 0.65), rng.float(-120, 120));
      return { k: 'sun', x: p.x, y: p.y, r: rng.float(38, 62) };
    }, { minGap: 90 })) return null;
  }
  if (want.has('void')) {
    if (!placeNear(rng, bodies, () => {
      const p = line(rng.float(0.3, 0.7), rng.float(-180, 180));
      return { k: 'void', x: p.x, y: p.y, r: 15 };
    }, { minGap: 110 })) return null;
  }
  if (want.has('nebula')) {
    const around = rng.chance(0.6) ? cup : null;
    const b = placeNear(rng, bodies, () => {
      const p = around ? { x: cup.x + rng.float(-40, 40), y: cup.y + rng.float(-40, 40) } : line(rng.float(0.3, 0.7), rng.float(-150, 150));
      return { k: 'nebula', x: p.x, y: p.y, r: rng.float(120, 175) };
    });
    if (!b || gap(b, tee) < 30) return null;
  }

  for (let i = 0; i < mids; i++) midPlanet(34, 88);

  if (want.has('belt')) {
    // A line of rocks across the way with one or two gaps.
    const c = line(rng.float(0.35, 0.65), rng.float(-60, 60));
    const dx = cup.x - tee.x;
    const dy = cup.y - tee.y;
    const L = Math.hypot(dx, dy);
    const tilt = rng.float(-0.5, 0.5);
    const ux = -dy / L + (dx / L) * tilt;
    const uy = dx / L + (dy / L) * tilt;
    const ul = Math.hypot(ux, uy);
    const n = rng.int(9, 14);
    const spacing = rng.float(40, 52);
    const gapAt = new Set([rng.int(1, n - 2)]);
    if (rng.chance(0.4)) gapAt.add(rng.int(1, n - 2));
    let placed = 0;
    for (let k = 0; k < n; k++) {
      if (gapAt.has(k)) continue;
      const o = (k - (n - 1) / 2) * spacing;
      const rock = { k: 'rock', x: c.x + (ux / ul) * o + rng.float(-6, 6), y: c.y + (uy / ul) * o + rng.float(-6, 6), r: rng.float(11, 17) };
      if (fits(bodies, rock, 40)) {
        bodies.push(rock);
        placed++;
      }
    }
    if (placed < 6) return null;
  }
  let ringGap = null;
  if (want.has('ring')) {
    const R = cup.r + rng.float(70, 95);
    ringGap = rng.float(0, TAU);
    const n = Math.round((TAU * R) / 42);
    let placed = 0;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      let da = Math.abs(a - ringGap) % TAU;
      if (da > Math.PI) da = TAU - da;
      if (da < 0.42) continue;
      const rock = { k: 'rock', x: cup.x + Math.cos(a) * R, y: cup.y + Math.sin(a) * R, r: rng.float(12, 16) };
      if (fits(bodies, rock, 30)) {
        bodies.push(rock);
        placed++;
      }
    }
    if (placed < n * 0.7) return null;
  }
  if (want.has('gates')) {
    const a = placeNear(rng, bodies, () => {
      const p = line(rng.float(0.12, 0.4), rng.float(-260, 260));
      return { k: 'gate', x: p.x, y: p.y, r: 24 };
    }, { minGap: 60 });
    if (!a) return null;
    const b = placeNear(rng, bodies, () => {
      const ang = rng.float(0, TAU);
      const d = cup.r + rng.float(60, 150);
      return { k: 'gate', x: cup.x + Math.cos(ang) * d, y: cup.y + Math.sin(ang) * d, r: 24 };
    }, { minGap: 40 });
    if (!b) return null;
    a.pair = bodies.indexOf(b);
    b.pair = bodies.indexOf(a);
  }

  // Tee faces roughly toward the cup; the cup faces according to the archetype.
  const toCup = Math.atan2(cup.y - tee.y, cup.x - tee.x);
  const teeA = toCup + rng.float(-0.9, 0.9);
  const fromTee = toCup + Math.PI;
  let cupA;
  if (kind === 'far') cupA = toCup + rng.float(-0.7, 0.7);
  else if (kind === 'ring') cupA = rng.chance(0.5) ? ringGap + rng.float(-0.3, 0.3) : rng.float(0, TAU);
  else if (T.facing) cupA = fromTee + rng.float(-0.8, 0.8);
  else cupA = rng.chance(0.55) ? fromTee + rng.float(-1.1, 1.1) : rng.float(0, TAU);

  const hole = {
    kind,
    extra,
    bodies,
    tee: { ...surfacePoint(tee, Math.cos(teeA), Math.sin(teeA)), b: 0 },
    cup: { b: 1, nx: Math.cos(cupA), ny: Math.sin(cupA) },
  };
  if (!clearAround(hole)) return null;
  return mirror(rng, hole);
}

/** The tee and the cup must have open space in front of them. */
function clearAround(hole) {
  const check = (body, nx, ny, need) => {
    const p = { x: body.x + nx * (body.r + COMET_R + need / 2), y: body.y + ny * (body.r + COMET_R + need / 2), r: need / 2 };
    return hole.bodies.every((b) => b === body || b.k === 'nebula' || b.k === 'gate' || gap(p, b) > 6);
  };
  const tb = hole.bodies[0];
  const tn = { x: (hole.tee.x - tb.x) / (tb.r + COMET_R), y: (hole.tee.y - tb.y) / (tb.r + COMET_R) };
  return check(tb, tn.x, tn.y, 50) && check(hole.bodies[1], hole.cup.nx, hole.cup.ny, 44);
}

function mirror(rng, hole) {
  const fx = rng.chance(0.5);
  const fy = rng.chance(0.5);
  const X = (x) => (fx ? W - x : x);
  const Y = (y) => (fy ? H - y : y);
  hole.bodies = hole.bodies.map((b) => ({ ...b, x: X(b.x), y: Y(b.y) }));
  hole.tee = { ...hole.tee, x: X(hole.tee.x), y: Y(hole.tee.y) };
  hole.cup = { ...hole.cup, nx: fx ? -hole.cup.nx : hole.cup.nx, ny: fy ? -hole.cup.ny : hole.cup.ny };
  return hole;
}

/** Round to the stored precision (the bank is solved on exactly these numbers). */
export function roundHole(hole) {
  const r1 = (v) => Math.round(v * 10) / 10;
  const bodies = hole.bodies.map((b) => {
    const o = { k: b.k, x: r1(b.x), y: r1(b.y), r: r1(b.r) };
    if (b.d && b.d !== 1) o.d = b.d;
    if (b.pair !== undefined) o.pair = b.pair;
    return o;
  });
  const cl = Math.hypot(hole.cup.nx, hole.cup.ny);
  const cup = { b: hole.cup.b, nx: Math.round((hole.cup.nx / cl) * 1e4) / 1e4, ny: Math.round((hole.cup.ny / cl) * 1e4) / 1e4 };
  const tb = bodies[hole.tee.b];
  const tl = Math.hypot(hole.tee.x - tb.x, hole.tee.y - tb.y);
  const tnx = Math.round(((hole.tee.x - tb.x) / tl) * 1e4) / 1e4;
  const tny = Math.round(((hole.tee.y - tb.y) / tl) * 1e4) / 1e4;
  const tee = { b: hole.tee.b, nx: tnx, ny: tny, ...surfacePoint(tb, tnx, tny) };
  return { kind: hole.kind, extra: hole.extra, bodies, tee, cup };
}

export function holeName(rng, kind) {
  const t = rng.pick(TITLES[kind] || TITLES.plain);
  return t.replace('{s}', rng.pick(STARS));
}
