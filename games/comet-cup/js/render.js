// Comet Cup renderer: Trouvelot-style pastel worlds on blue-black paper.
// Two canvases: #paper holds everything static (paper, frame, worlds, finished chalk lines)
// and is repainted only on resize, a new hole or a finished stroke; #stage draws what moves.
// Painters work in world units; `px` is one screen pixel in world units.
import { W, H, COMET_R, PHYS } from './engine.js';
import { createRng, hashString } from '../../../shared/rng.js';

export const INK = '#eadfc4';
export const GOLD = '#e9c35b';
export const SUN = '#f2a65a';
export const VIOLET = '#8a5fd1';
export const TEAL = '#6fd3c4';
export const PAPER = '#141c33';

// Pastels: [light, base, dark].
export const PASTELS = [
  ['#f4cdc4', '#d99a8f', '#7d4a4a'], // rose
  ['#f1dca6', '#d6b26e', '#7a5a2c'], // ochre
  ['#cfe6da', '#8dbaa8', '#3f6359'], // verdigris
  ['#d8cff0', '#a89dcc', '#514a7a'], // lavender
  ['#cbdaf0', '#86a3c9', '#3d5277'], // slate
];

const FRAME = 26; // world units of frame around the plate
const TAU = Math.PI * 2;

/** Stable look for each body of a hole. */
export function bodyLooks(hole) {
  const rng = createRng(hashString(`${hole.id || 'h'}:look`));
  const used = [];
  return hole.bodies.map((b, i) => {
    let c = rng.int(0, PASTELS.length - 1);
    if (used.length < PASTELS.length) while (used.includes(c)) c = (c + 1) % PASTELS.length;
    used.push(c);
    if (i === hole.cup.b) c = c === 1 ? 0 : c; // keep ochre off the cup world: gold is the cup
    return {
      c,
      banded: b.r > 68 || (b.r > 46 && rng.chance(0.4)),
      tilt: rng.float(-0.45, 0.45),
      seed: rng.int(1, 1e9),
      rot: rng.float(0, TAU),
    };
  });
}

export function createRenderer({ paper, stage }) {
  const pctx = paper.getContext('2d');
  const ctx = stage.getContext('2d');
  const view = { cssW: 1, cssH: 1, dpr: 1, s: 1, ox: 0, oy: 0, rot: false };
  let hole = null;
  let looks = [];
  let grain = null;
  let stars = [];

  /** Fit the plate into the canvas, leaving `inset` (CSS px per side) clear for overlays. */
  function resize(cssW, cssH, dpr, inset = { l: 0, t: 0, r: 0, b: 0 }) {
    Object.assign(view, { cssW, cssH, dpr });
    for (const c of [paper, stage]) {
      c.width = Math.round(cssW * dpr);
      c.height = Math.round(cssH * dpr);
      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;
    }
    const aw = Math.max(40, cssW - inset.l - inset.r);
    const ah = Math.max(40, cssH - inset.t - inset.b);
    const rot = ah > aw * 1.08;
    const ww = (rot ? H : W) + FRAME * 2;
    const wh = (rot ? W : H) + FRAME * 2;
    const s = Math.min(aw / ww, ah / wh);
    view.rot = rot;
    view.s = s;
    view.ox = inset.l + (aw - ww * s) / 2 + FRAME * s;
    view.oy = inset.t + (ah - wh * s) / 2 + FRAME * s;
    if (hole) repaintStatic(null);
  }

  /** World point to CSS pixels inside the canvas. */
  function toScreen(x, y) {
    const { s, ox, oy, rot } = view;
    return rot ? { x: ox + (H - y) * s, y: oy + x * s } : { x: ox + x * s, y: oy + y * s };
  }
  function toWorld(sx, sy) {
    const { s, ox, oy, rot } = view;
    return rot ? { x: (sy - oy) / s, y: H - (sx - ox) / s } : { x: (sx - ox) / s, y: (sy - oy) / s };
  }
  /** A screen-space direction (CSS px) as a world direction. */
  function dirToWorld(dx, dy) {
    return view.rot ? { x: dy, y: -dx } : { x: dx, y: dy };
  }
  function worldTransform(c, dpr = view.dpr, v = view) {
    const k = dpr * v.s;
    if (v.rot) c.setTransform(0, k, -k, 0, dpr * (v.ox + H * v.s), dpr * v.oy);
    else c.setTransform(k, 0, 0, k, dpr * v.ox, dpr * v.oy);
  }

  function setHole(h) {
    hole = h;
    looks = bodyLooks(h);
    const rng = createRng(hashString(`${h.id || 'h'}:stars`));
    stars = [];
    for (let i = 0; i < 170; i++) stars.push({ x: rng.float(-10, W + 10), y: rng.float(-10, H + 10), r: rng.chance(0.08) ? rng.float(1.6, 2.6) : rng.float(0.5, 1.3), a: rng.float(0.15, 0.6), tw: rng.float(0, TAU) });
  }

  // -------------------------------------------------------------------------------------
  // Static layer

  function makeGrain() {
    const g = document.createElement('canvas');
    g.width = g.height = 220;
    const c = g.getContext('2d');
    const rng = createRng(7);
    for (let i = 0; i < 2600; i++) {
      const light = rng.chance(0.5);
      c.fillStyle = light ? `rgba(234,223,196,${rng.float(0.015, 0.05)})` : `rgba(0,0,0,${rng.float(0.04, 0.12)})`;
      c.fillRect(rng.float(0, 220), rng.float(0, 220), rng.float(0.6, 1.8), rng.float(0.6, 1.8));
    }
    return g;
  }

  function paintPaper(c, dpr, v) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = PAPER;
    c.fillRect(0, 0, v.cssW, v.cssH);
    grain = grain || makeGrain();
    c.fillStyle = c.createPattern(grain, 'repeat');
    c.fillRect(0, 0, v.cssW, v.cssH);
    const vg = c.createRadialGradient(v.cssW / 2, v.cssH / 2, Math.min(v.cssW, v.cssH) * 0.3, v.cssW / 2, v.cssH / 2, Math.max(v.cssW, v.cssH) * 0.75);
    vg.addColorStop(0, 'rgba(40,52,90,0.18)');
    vg.addColorStop(1, 'rgba(4,6,14,0.55)');
    c.fillStyle = vg;
    c.fillRect(0, 0, v.cssW, v.cssH);
  }

  function paintFrame(c, px) {
    c.save();
    c.strokeStyle = INK;
    c.globalAlpha = 0.42;
    c.lineWidth = 1.2 * px;
    c.strokeRect(0, 0, W, H);
    c.globalAlpha = 0.28;
    c.lineWidth = 2.4 * px;
    c.strokeRect(-FRAME * 0.62, -FRAME * 0.62, W + FRAME * 1.24, H + FRAME * 1.24);
    // Degree ticks along the inner rule.
    c.globalAlpha = 0.34;
    c.lineWidth = 1 * px;
    c.beginPath();
    for (let x = 0; x <= W; x += 20) {
      const L = x % 200 === 0 ? 12 : x % 100 === 0 ? 8 : 4;
      c.moveTo(x, 0);
      c.lineTo(x, -L * 0.9);
      c.moveTo(x, H);
      c.lineTo(x, H + L * 0.9);
    }
    for (let y = 0; y <= H; y += 20) {
      const L = y % 200 === 0 ? 12 : y % 100 === 0 ? 8 : 4;
      c.moveTo(0, y);
      c.lineTo(-L * 0.9, y);
      c.moveTo(W, y);
      c.lineTo(W + L * 0.9, y);
    }
    c.stroke();
    // A faint graticule.
    c.globalAlpha = 0.05;
    c.beginPath();
    for (let x = 200; x < W; x += 200) {
      c.moveTo(x, 0);
      c.lineTo(x, H);
    }
    for (let y = 200; y < H; y += 200) {
      c.moveTo(0, y);
      c.lineTo(W, y);
    }
    c.stroke();
    c.restore();
  }

  function paintStars(c, px) {
    c.save();
    for (const s of stars) {
      c.globalAlpha = s.a;
      c.fillStyle = INK;
      c.beginPath();
      c.arc(s.x, s.y, s.r * px * 1.2, 0, TAU);
      c.fill();
      if (s.r > 1.5) {
        c.globalAlpha = s.a * 0.35;
        c.lineWidth = 0.8 * px;
        c.strokeStyle = INK;
        c.beginPath();
        c.moveTo(s.x - s.r * 3.2 * px, s.y);
        c.lineTo(s.x + s.r * 3.2 * px, s.y);
        c.moveTo(s.x, s.y - s.r * 3.2 * px);
        c.lineTo(s.x, s.y + s.r * 3.2 * px);
        c.stroke();
      }
    }
    c.restore();
  }

  function paintNebula(c, b, look) {
    const rng = createRng(look.seed);
    const tints = ['rgba(217,154,143,', 'rgba(141,186,168,', 'rgba(168,157,204,'];
    c.save();
    for (let i = 0; i < 9; i++) {
      const a = rng.float(0, TAU);
      const d = rng.float(0, b.r * 0.45);
      const x = b.x + Math.cos(a) * d;
      const y = b.y + Math.sin(a) * d;
      const r = b.r * rng.float(0.45, 0.8);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      const t = tints[i % 3];
      g.addColorStop(0, `${t}0.16)`);
      g.addColorStop(0.6, `${t}0.07)`);
      g.addColorStop(1, `${t}0)`);
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
    }
    // Wisps.
    c.strokeStyle = INK;
    c.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const a = rng.float(0, TAU);
      const d = rng.float(0, b.r * 0.85);
      const x = b.x + Math.cos(a) * d;
      const y = b.y + Math.sin(a) * d;
      c.globalAlpha = rng.float(0.025, 0.07);
      c.lineWidth = rng.float(6, 16);
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + rng.float(-30, 30), y + rng.float(-30, 30), x + rng.float(-50, 50), y + rng.float(-20, 20));
      c.stroke();
    }
    // Its edge: a dotted contour so the slow zone is readable.
    c.globalAlpha = 0.2;
    c.lineWidth = 1.6;
    c.setLineDash([2, 9]);
    c.beginPath();
    c.arc(b.x, b.y, b.r, 0, TAU);
    c.stroke();
    c.restore();
  }

  function paintPlanet(c, b, look, px, { field = true } = {}) {
    const [light, base, dark] = PASTELS[look.c];
    const rng = createRng(look.seed);
    const { x, y, r } = b;
    c.save();
    // The reach of its pull, as an orbit line on a chart.
    if (field) {
      c.strokeStyle = base;
      c.globalAlpha = 0.16;
      c.lineWidth = 1.1 * px;
      c.setLineDash([1.5 * px, 7 * px]);
      c.beginPath();
      c.arc(x, y, r * (b.d > 1 ? 2.25 : 1.9), 0, TAU);
      c.stroke();
      c.setLineDash([]);
    }
    // Atmosphere halo.
    const halo = c.createRadialGradient(x, y, r * 0.9, x, y, r * 1.45);
    halo.addColorStop(0, hexA(base, 0.3));
    halo.addColorStop(1, hexA(base, 0));
    c.globalAlpha = 1;
    c.fillStyle = halo;
    c.beginPath();
    c.arc(x, y, r * 1.45, 0, TAU);
    c.fill();
    // Sphere shading: lit from the upper left.
    const g = c.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x - r * 0.1, y - r * 0.1, r * 1.12);
    g.addColorStop(0, light);
    g.addColorStop(0.45, base);
    g.addColorStop(1, dark);
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
    c.save();
    c.clip();
    if (look.banded) {
      c.translate(x, y);
      c.rotate(look.tilt);
      const n = rng.int(5, 8);
      for (let i = 0; i < n; i++) {
        const by = -r + ((i + 0.5) / n) * 2 * r + rng.float(-r * 0.06, r * 0.06);
        const bh = rng.float(r * 0.06, r * 0.2);
        c.globalAlpha = rng.float(0.12, 0.28);
        c.fillStyle = rng.chance(0.5) ? light : dark;
        c.beginPath();
        c.ellipse(0, by, r * 1.3, bh, 0, 0, TAU);
        c.fill();
      }
      c.rotate(-look.tilt);
      c.translate(-x, -y);
    } else {
      // Soft maria: overlapping blotches, then a scatter of small craters.
      const n = rng.int(3, 5);
      for (let i = 0; i < n; i++) {
        const a = rng.float(0, TAU);
        const d = rng.float(r * 0.1, r * 0.75);
        const mx = x + Math.cos(a) * d;
        const my = y + Math.sin(a) * d;
        const mr = rng.float(r * 0.25, r * 0.55);
        const mg = c.createRadialGradient(mx, my, 0, mx, my, mr);
        mg.addColorStop(0, hexA(rng.chance(0.7) ? dark : light, rng.float(0.16, 0.3)));
        mg.addColorStop(1, hexA(dark, 0));
        c.globalAlpha = 1;
        c.fillStyle = mg;
        c.beginPath();
        c.ellipse(mx, my, mr, mr * rng.float(0.5, 0.9), rng.float(0, TAU), 0, TAU);
        c.fill();
      }
      const craters = rng.int(5, 11);
      for (let i = 0; i < craters; i++) {
        const a = rng.float(0, TAU);
        const d = Math.sqrt(rng.next()) * r * 0.85;
        const cx = x + Math.cos(a) * d;
        const cy = y + Math.sin(a) * d;
        const cr = rng.float(r * 0.03, r * 0.09);
        c.globalAlpha = 0.22;
        c.fillStyle = dark;
        c.beginPath();
        c.arc(cx, cy, cr, 0, TAU);
        c.fill();
        c.globalAlpha = 0.3;
        c.strokeStyle = light;
        c.lineWidth = Math.max(0.6, cr * 0.3);
        c.beginPath();
        c.arc(cx, cy, cr, Math.PI * 0.1, Math.PI * 0.9);
        c.stroke();
      }
    }
    // Pastel strokes: short hatches at one angle, like chalk on paper.
    c.lineCap = 'round';
    const strokes = Math.round(r * 2.2);
    for (let i = 0; i < strokes; i++) {
      const a = rng.float(0, TAU);
      const d = Math.sqrt(rng.next()) * r;
      const sx = x + Math.cos(a) * d;
      const sy = y + Math.sin(a) * d;
      const L = rng.float(3, 9);
      c.globalAlpha = rng.float(0.05, 0.14);
      c.strokeStyle = rng.chance(0.55) ? light : dark;
      c.lineWidth = rng.float(1, 2.4);
      c.beginPath();
      c.moveTo(sx - L * 0.8, sy + L * 0.6);
      c.lineTo(sx + L * 0.8, sy - L * 0.6);
      c.stroke();
    }
    // Night side.
    const shade = c.createRadialGradient(x - r * 0.5, y - r * 0.55, r * 0.6, x - r * 0.3, y - r * 0.3, r * 1.6);
    shade.addColorStop(0, 'rgba(10,14,30,0)');
    shade.addColorStop(1, 'rgba(10,14,30,0.55)');
    c.globalAlpha = 1;
    c.fillStyle = shade;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.restore();
    // Lit rim.
    c.globalAlpha = 0.5;
    c.strokeStyle = light;
    c.lineWidth = 1.4 * px;
    c.beginPath();
    c.arc(x, y, Math.max(0.5, r - 0.7 * px), Math.PI * 0.95, Math.PI * 1.75);
    c.stroke();
    c.restore();
  }

  function paintRock(c, b, look, px) {
    const rng = createRng(look.seed);
    const n = rng.int(7, 10);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + look.rot;
      const rr = b.r * rng.float(0.82, 1.12);
      pts.push([b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr]);
    }
    c.save();
    const g = c.createRadialGradient(b.x - b.r * 0.4, b.y - b.r * 0.4, 1, b.x, b.y, b.r * 1.2);
    g.addColorStop(0, '#d9d3e6');
    g.addColorStop(1, '#5c5878');
    c.fillStyle = g;
    c.beginPath();
    pts.forEach(([px2, py2], i) => (i ? c.lineTo(px2, py2) : c.moveTo(px2, py2)));
    c.closePath();
    c.fill();
    c.globalAlpha = 0.45;
    c.strokeStyle = INK;
    c.lineWidth = 1 * px;
    c.stroke();
    c.restore();
  }

  function paintSunBase(c, b) {
    c.save();
    const g = c.createRadialGradient(b.x, b.y, b.r * 0.2, b.x, b.y, b.r * 2.6);
    g.addColorStop(0, 'rgba(242,166,90,0.5)');
    g.addColorStop(0.4, 'rgba(242,120,60,0.16)');
    g.addColorStop(1, 'rgba(242,120,60,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(b.x, b.y, b.r * 2.6, 0, TAU);
    c.fill();
    const core = c.createRadialGradient(b.x - b.r * 0.2, b.y - b.r * 0.2, 0, b.x, b.y, b.r);
    core.addColorStop(0, '#fff3d6');
    core.addColorStop(0.55, '#f7c27a');
    core.addColorStop(1, '#e9783e');
    c.fillStyle = core;
    c.beginPath();
    c.arc(b.x, b.y, b.r, 0, TAU);
    c.fill();
    c.restore();
  }

  function paintCupNotch(c, h, px) {
    const b = h.bodies[h.cup.b];
    const sx = b.x + h.cup.nx * b.r;
    const sy = b.y + h.cup.ny * b.r;
    c.save();
    c.fillStyle = 'rgba(8,10,22,0.85)';
    c.beginPath();
    c.arc(sx, sy, COMET_R + 3, 0, TAU);
    c.fill();
    c.strokeStyle = GOLD;
    c.globalAlpha = 0.85;
    c.lineWidth = 1.6 * px;
    c.beginPath();
    c.arc(sx, sy, COMET_R + 3, 0, TAU);
    c.stroke();
    c.restore();
  }

  function paintTee(c, h, px) {
    const b = h.bodies[h.tee.b];
    const nx = h.tee.nx ?? (h.tee.x - b.x) / (b.r + COMET_R);
    const ny = h.tee.ny ?? (h.tee.y - b.y) / (b.r + COMET_R);
    c.save();
    c.strokeStyle = INK;
    c.globalAlpha = 0.55;
    c.lineWidth = 1.4 * px;
    // A short tick either side of the tee, like a survey mark.
    const tx = -ny;
    const ty = nx;
    const sx = b.x + nx * b.r;
    const sy = b.y + ny * b.r;
    c.beginPath();
    for (const k of [-1, 1]) {
      c.moveTo(sx + tx * k * 15, sy + ty * k * 15);
      c.lineTo(sx + tx * k * 15 + nx * 8, sy + ty * k * 15 + ny * 8);
    }
    c.stroke();
    c.restore();
  }

  /** Chalk line of a finished shot. */
  function paintPath(c, path, px, { color = INK, alpha = 0.36, width = 1.6, dash = null } = {}) {
    if (!path || path.length < 2) return;
    c.save();
    c.strokeStyle = color;
    c.globalAlpha = alpha;
    c.lineWidth = width * px;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (dash) c.setLineDash(dash.map((d) => d * px));
    c.beginPath();
    let pen = false;
    for (const p of path) {
      if (!p) {
        pen = false;
        continue;
      }
      if (pen) c.lineTo(p[0], p[1]);
      else c.moveTo(p[0], p[1]);
      pen = true;
    }
    c.stroke();
    c.restore();
  }

  function paintEnd(c, shot, px) {
    const last = lastPoint(shot.path);
    if (!last || !['burn', 'void', 'lost'].includes(shot.end)) return;
    const [x, y] = last;
    c.save();
    c.strokeStyle = SUN;
    c.globalAlpha = 0.7;
    c.lineWidth = 2 * px;
    const k = 9;
    c.beginPath();
    c.moveTo(x - k, y - k);
    c.lineTo(x + k, y + k);
    c.moveTo(x + k, y - k);
    c.lineTo(x - k, y + k);
    c.stroke();
    c.restore();
  }

  /** Paint a hole (and optionally its finished shots) into any context with a transform set. */
  function paintHole(c, h, lk, px, { log = null, gold = false, field = true, still = false } = {}) {
    for (const [i, b] of h.bodies.entries()) if (b.k === 'nebula') paintNebula(c, b, lk[i]);
    for (const [i, b] of h.bodies.entries()) {
      if (b.k === 'planet') paintPlanet(c, b, lk[i], px, { field });
      else if (b.k === 'rock') paintRock(c, b, lk[i], px);
      else if (b.k === 'sun') paintSunBase(c, b);
      else if (still && b.k === 'void') paintStill(c, b, VIOLET, '#05040a');
      else if (still && b.k === 'gate') paintStill(c, b, TEAL, 'rgba(111,211,196,0.25)');
    }
    paintTee(c, h, px);
    paintCupNotch(c, h, px);
    if (log) {
      for (const shot of log) {
        if (!shot.end) continue;
        paintPath(c, shot.path, px, gold ? { color: GOLD, alpha: 0.85, width: 2.2 } : {});
        paintEnd(c, shot, px);
      }
    }
  }

  /** Dark stars and wormholes animate on the stage; miniatures get a still version. */
  function paintStill(c, b, ring, fill) {
    c.save();
    c.fillStyle = fill;
    c.strokeStyle = ring;
    c.lineWidth = 5;
    c.beginPath();
    c.arc(b.x, b.y, b.r * (b.k === 'void' ? 1.4 : 1), 0, TAU);
    c.fill();
    c.stroke();
    c.restore();
  }

  let staticLog = null;
  function repaintStatic(log = staticLog) {
    staticLog = log;
    paintPaper(pctx, view.dpr, view);
    worldTransform(pctx);
    const px = 1 / view.s;
    paintFrame(pctx, px);
    paintStars(pctx, px);
    if (hole) paintHole(pctx, hole, looks, px, { log });
  }

  // -------------------------------------------------------------------------------------
  // Moving layer

  function clear() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, stage.width, stage.height);
    worldTransform(ctx);
  }

  function drawSunFlare(b, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + t * 0.15 + Math.sin(t * 1.3 + i) * 0.05;
      const L = b.r * (1.25 + 0.22 * Math.sin(t * 2.1 + i * 1.7));
      ctx.strokeStyle = 'rgba(242,166,90,0.18)';
      ctx.lineWidth = b.r * 0.12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x + Math.cos(a) * b.r * 0.9, b.y + Math.sin(a) * b.r * 0.9);
      ctx.lineTo(b.x + Math.cos(a) * L, b.y + Math.sin(a) * L);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawVoid(b, t, px) {
    ctx.save();
    const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.6, b.x, b.y, b.r * 5);
    g.addColorStop(0, 'rgba(138,95,209,0.45)');
    g.addColorStop(0.35, 'rgba(138,95,209,0.12)');
    g.addColorStop(1, 'rgba(138,95,209,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 5, 0, TAU);
    ctx.fill();
    // Accretion: arcs spiralling in.
    ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const rr = b.r * (1.4 + ((i * 0.55 + t * 0.6) % 3.2));
      ctx.strokeStyle = i % 2 ? VIOLET : '#c9b4f2';
      ctx.globalAlpha = 0.5 * (1 - (rr / b.r - 1.4) / 3.2);
      ctx.lineWidth = 1.6 * px;
      const a0 = t * (2.4 - i * 0.2) + i * 1.9;
      ctx.beginPath();
      ctx.arc(b.x, b.y, rr, a0, a0 + 1.6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#05040a';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#c9b4f2';
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.4 * px;
    ctx.stroke();
    ctx.restore();
  }

  function drawGate(b, t, px, glyph) {
    ctx.save();
    ctx.translate(b.x, b.y);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, b.r * 1.6);
    g.addColorStop(0, 'rgba(111,211,196,0.35)');
    g.addColorStop(1, 'rgba(111,211,196,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 1.6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = TEAL;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.85 - i * 0.22;
      ctx.lineWidth = (2.2 - i * 0.5) * px;
      const rr = b.r * (1 - i * 0.26);
      const a = t * (1.6 + i * 0.7) * (i % 2 ? -1 : 1);
      ctx.beginPath();
      ctx.arc(0, 0, rr, a, a + 4.6);
      ctx.stroke();
    }
    ctx.restore();
    if (glyph) label(glyph, b.x, b.y - b.r - 16, { color: TEAL, size: 15, alpha: 0.85 });
  }

  function drawFlag(h, t, px) {
    const b = h.bodies[h.cup.b];
    const { nx, ny } = h.cup;
    const sx = b.x + nx * b.r;
    const sy = b.y + ny * b.r;
    const L = 52;
    const tx = -ny;
    const ty = nx;
    const topX = sx + nx * L;
    const topY = sy + ny * L;
    ctx.save();
    // Glow at the cup.
    const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, 34);
    g.addColorStop(0, 'rgba(233,195,91,0.38)');
    g.addColorStop(1, 'rgba(233,195,91,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, 34, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.5 * px;
    ctx.beginPath();
    ctx.moveTo(sx + nx * 2, sy + ny * 2);
    ctx.lineTo(topX, topY);
    ctx.stroke();
    // A pennant that ripples.
    ctx.fillStyle = GOLD;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    const segs = 6;
    const len = 26;
    const pt = (k, drop) => {
      const wave = Math.sin(t * 5 - k * 3) * 3 * k;
      ctx.lineTo(topX + tx * len * k - nx * (wave + drop), topY + ty * len * k - ny * (wave + drop));
    };
    ctx.moveTo(topX, topY);
    for (let i = 1; i <= segs; i++) pt(i / segs, 0);
    for (let i = segs; i >= 0; i--) pt(i / segs, (1 - i / segs) * 15);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawRinging(h, ringing, px) {
    for (const [i, level] of ringing) {
      const b = h.bodies[i];
      if (!b || level <= 0.01) continue;
      const [light] = PASTELS[looks[i].c];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rr = b.r * (1.05 + (1 - level) * 0.6);
      ctx.strokeStyle = light;
      ctx.globalAlpha = level * 0.55;
      ctx.lineWidth = (1.5 + level * 3) * px;
      ctx.beginPath();
      ctx.arc(b.x, b.y, rr, 0, TAU);
      ctx.stroke();
      const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.8, b.x, b.y, b.r * 1.5);
      g.addColorStop(0, hexA(light, 0.22 * level));
      g.addColorStop(1, hexA(light, 0));
      ctx.fillStyle = g;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 1.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawComet(x, y, tail, t, { resting = false, alpha = 1 } = {}) {
    const px = 1 / view.s;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Tail: recent positions, tapering.
    if (tail && tail.length > 1) {
      ctx.lineCap = 'round';
      for (let i = 1; i < tail.length; i++) {
        const k = i / tail.length;
        ctx.strokeStyle = k > 0.6 ? '#fff4dc' : '#a9e3e8';
        ctx.globalAlpha = 0.5 * k * k * alpha;
        ctx.lineWidth = Math.max(1.2 * px, COMET_R * 1.5 * k);
        ctx.beginPath();
        ctx.moveTo(tail[i - 1][0], tail[i - 1][1]);
        ctx.lineTo(tail[i][0], tail[i][1]);
        ctx.stroke();
      }
    }
    const pulse = resting ? 0.75 + 0.25 * Math.sin(t * 3) : 1;
    const R = Math.max(COMET_R * 3.2, 14 * px);
    const g = ctx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, `rgba(255,248,230,${0.95 * alpha})`);
    g.addColorStop(0.25, `rgba(250,236,200,${0.55 * pulse * alpha})`);
    g.addColorStop(1, 'rgba(169,227,232,0)');
    ctx.fillStyle = g;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fffaf0';
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(COMET_R * 0.72, 3 * px), 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawPreview(points, power) {
    const px = 1 / view.s;
    ctx.save();
    ctx.fillStyle = INK;
    const n = points.length;
    for (let i = 1; i < n; i++) {
      const k = 1 - i / n;
      ctx.globalAlpha = 0.85 * k;
      ctx.beginPath();
      ctx.arc(points[i][0], points[i][1], Math.max(1.6 * px, (2.4 + power * 1.6) * px * (0.5 + k * 0.6)), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Slingshot band from the comet, and the power gauge. */
  function drawAim(x, y, angle, power) {
    const px = 1 / view.s;
    const back = 26 + power * 70;
    const bx = x - Math.cos(angle) * back;
    const by = y - Math.sin(angle) * back;
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.2 * px;
    ctx.setLineDash([4 * px, 4 * px]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    // Power arc around the comet.
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 3 * px;
    const R = COMET_R + 16;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = power > 0.92 ? SUN : GOLD;
    ctx.beginPath();
    ctx.arc(x, y, R, angle - power * Math.PI, angle + power * Math.PI);
    ctx.stroke();
    ctx.restore();
    // The power as a number, behind the comet where the pull is.
    const lx = x - Math.cos(angle) * (back + 26);
    const ly = y - Math.sin(angle) * (back + 26);
    label(`${Math.round(power * 100)}%`, lx, ly, { size: 14, alpha: 0.85, color: power > 0.92 ? SUN : INK });
  }

  function drawFx(fx, t) {
    const px = 1 / view.s;
    for (const f of fx) {
      const k = Math.min(1, (t - f.t0) / f.dur);
      if (k >= 1 || k < 0) continue;
      ctx.save();
      if (f.kind === 'ripple') {
        ctx.strokeStyle = f.color || GOLD;
        ctx.globalAlpha = (1 - k) * (f.alpha ?? 0.9);
        ctx.lineWidth = (f.width ?? 2.5) * px * (1 - k * 0.5);
        ctx.beginPath();
        ctx.arc(f.x, f.y, Math.max(0.1, f.r0 + (f.r1 - f.r0) * easeOut(k)), 0, TAU);
        ctx.stroke();
      } else if (f.kind === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = f.color || INK;
        for (const p of f.parts) {
          const d = easeOut(k) * p.d;
          ctx.globalAlpha = (1 - k) * p.a;
          ctx.beginPath();
          ctx.arc(f.x + p.dx * d, f.y + p.dy * d, p.r * (1 - k * 0.6), 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  /** Text upright on screen at a world point. */
  function label(text, wx, wy, { color = INK, size = 14, alpha = 1, italic = true, font = 'Old Standard TT' } = {}) {
    const p = toScreen(wx, wy);
    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.font = `${italic ? 'italic ' : ''}${size}px "${font}", Georgia, serif`;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, p.x, p.y);
    ctx.restore();
    worldTransform(ctx);
  }

  /**
   * Draw the moving layer. scene: { t, st, comet, tail, preview, aim, fx, ringing, gilded,
   * ace (path + k), flying (live path) }
   */
  function frame(scene) {
    clear();
    const h = hole;
    if (!h) return;
    const px = 1 / view.s;
    const t = scene.t;
    let gates = 0;
    const glyphs = ['α', 'β', 'γ'];
    const gateGlyph = new Map();
    for (const [i, b] of h.bodies.entries()) {
      if (b.k === 'sun') drawSunFlare(b, t);
      else if (b.k === 'void') drawVoid(b, t, px);
      else if (b.k === 'gate') {
        if (!gateGlyph.has(i)) {
          gateGlyph.set(i, glyphs[gates]);
          gateGlyph.set(b.pair, glyphs[gates]);
          gates++;
        }
        drawGate(b, t, px, gateGlyph.get(i));
      }
    }
    if (scene.ringing) drawRinging(h, scene.ringing, px);
    if (scene.ace) {
      const n = Math.floor(scene.ace.path.length * scene.ace.k);
      paintPath(ctx, scene.ace.path.slice(0, Math.max(2, n)), px, { color: GOLD, alpha: 0.75, width: 1.8, dash: [6, 5] });
    }
    if (scene.gilded) {
      for (const p of scene.gilded.paths) paintPath(ctx, p, px, { color: GOLD, alpha: 0.9 * scene.gilded.k, width: 2.4 });
    }
    if (scene.flying) paintPath(ctx, scene.flying, px, { alpha: 0.42 });
    if (!scene.hideFlag) drawFlag(h, t, px);
    if (scene.preview) drawPreview(scene.preview, scene.aim?.power ?? 0.5);
    if (scene.aim) drawAim(scene.comet.x, scene.comet.y, scene.aim.angle, scene.aim.power);
    if (scene.comet && !scene.comet.hidden) drawComet(scene.comet.x, scene.comet.y, scene.tail, t, { resting: !!scene.resting, alpha: scene.comet.alpha ?? 1 });
    if (scene.fx) drawFx(scene.fx, t);
    if (h.star) {
      const b = h.bodies[h.cup.b];
      // Under the world on screen, or over it when the cup faces down: never on the flag.
      const c = toScreen(b.x, b.y);
      const n = view.rot ? { x: -h.cup.ny, y: h.cup.nx } : { x: h.cup.nx, y: h.cup.ny };
      const up = n.y > 0.45 ? -1 : 1;
      const p = toWorld(c.x, c.y + up * (b.r * view.s + 13));
      label(h.star, p.x, p.y, { size: 14, alpha: 0.55 });
    }
    if (scene.exposure !== undefined) drawExposure(scene.exposure, scene.fast);
  }

  /** The exposure dial: how much of this stroke's 12 seconds has run, top right of the plate. */
  function drawExposure(k, fast = false) {
    const corner = view.rot ? toScreen(W - 8, H - 8) : toScreen(W - 8, 8);
    const x = view.rot ? corner.x + 6 : corner.x - 26;
    const y = corner.y + 26;
    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = k > 0.8 ? SUN : INK;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, 9, -Math.PI / 2, -Math.PI / 2 + k * TAU);
    ctx.closePath();
    ctx.fill();
    ctx.font = 'italic 13px "Old Standard TT", Georgia, serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = INK;
    ctx.fillText(fast ? 'exposure \u00d74' : 'exposure', x - 17, y);
    ctx.restore();
    worldTransform(ctx);
  }

  return {
    view,
    resize,
    toScreen,
    toWorld,
    dirToWorld,
    setHole,
    repaintStatic,
    frame,
    label,
    get looks() {
      return looks;
    },
    /** Draw a finished hole into its own canvas (the end-of-course sheet). */
    miniature(canvas, h, log, cssW, cssH, dpr) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      const c = canvas.getContext('2d');
      const s = Math.min(cssW / (W + 40), cssH / (H + 40));
      const v = { cssW, cssH, dpr, s, ox: (cssW - W * s) / 2, oy: (cssH - H * s) / 2, rot: false };
      paintPaper(c, dpr, v);
      worldTransform(c, dpr, v);
      const px = 1 / s;
      c.save();
      c.strokeStyle = INK;
      c.globalAlpha = 0.3;
      c.lineWidth = px;
      c.strokeRect(0, 0, W, H);
      c.restore();
      const lk = bodyLooks(h);
      paintHole(c, h, lk, px, { log, gold: true, field: false, still: true });
      // Flag, still.
      const b = h.bodies[h.cup.b];
      c.save();
      c.strokeStyle = GOLD;
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(b.x + h.cup.nx * b.r, b.y + h.cup.ny * b.r);
      c.lineTo(b.x + h.cup.nx * (b.r + 55), b.y + h.cup.ny * (b.r + 55));
      c.stroke();
      c.restore();
    },
  };
}

function lastPoint(path) {
  for (let i = path.length - 1; i >= 0; i--) if (path[i]) return path[i];
  return null;
}

const easeOut = (k) => 1 - (1 - k) ** 3;

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

export { PHYS };
