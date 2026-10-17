// Canvas drawing for Night Stitch. Engine units in, pixels out.
// Layers: bg (room, lamp, linen; redrawn on resize), emb (the embroidery so far, drawn
// incrementally from state.history), ring (the wooden hoop, above the fabric), then live
// things every frame: holes, thread, moths, needle, effects.
import { HOOP_R, SPECIES, FLOSS } from './data.js';
import { stitchCanvas, layout as stitchLayout } from './stitchfont.js';

const layoutWidth = (text) => stitchLayout(text).cols;

const NIGHT = '#171c3a';
const DARK = [20, 24, 51];
const LINEN = '#dcd0b4';
const GOLD = ['#e1a83a', '#f6d77e', '#a8751f'];

// ---------------------------------------------------------------------------------------
// Colour helpers

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const mixCache = new Map();
/** Mix `a` toward `b` by k (0..1); cached because live moths ask every frame. */
export function mix(a, b, k) {
  const key = `${a}|${b}|${Math.round(k * 20)}`;
  let v = mixCache.get(key);
  if (!v) {
    const q = Math.round(k * 20) / 20;
    const A = hex(a);
    const B = typeof b === 'string' ? hex(b) : b;
    v = rgb(A.map((x, i) => x + (B[i] - x) * q));
    mixCache.set(key, v);
  }
  return v;
}
const lighten = (c, k) => mix(c, '#ffffff', k);
const darken = (c, k) => mix(c, '#140f0a', k);

// Deterministic per-item noise.
function hashRand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------
// Moth shapes, in local units with the head toward +x and size s = half wingspan.

function wingPaths(wing, s) {
  // Each wing is a list of [cmd, ...pts] for the right-hand (y > 0) side.
  switch (wing) {
    case 'narrow':
      return {
        fore: [[0.12, 0.04], [0.05, 0.55, -0.18, 0.98], [-0.32, 0.86, -0.52, 0.34], [-0.3, 0.08, -0.12, 0.05]],
        hind: [[-0.05, 0.05], [-0.12, 0.6, -0.36, 0.68], [-0.62, 0.5, -0.5, 0.12]],
      };
    case 'broad':
      return {
        fore: [[0.12, 0.05], [0.12, 0.62, -0.08, 1.0], [-0.42, 0.9, -0.5, 0.48], [-0.34, 0.1, -0.12, 0.06]],
        hind: [[-0.08, 0.06], [-0.1, 0.82, -0.48, 0.78], [-0.72, 0.42, -0.42, 0.1]],
      };
    case 'swept':
      return {
        fore: [[0.14, 0.04], [0.0, 0.45, -0.42, 0.95], [-0.5, 0.72, -0.5, 0.36], [-0.28, 0.08, -0.1, 0.04]],
        hind: [[-0.06, 0.05], [-0.18, 0.42, -0.38, 0.45], [-0.58, 0.3, -0.42, 0.08]],
      };
    case 'hawkbig':
      return {
        fore: [[0.14, 0.04], [0.06, 0.52, -0.28, 1.0], [-0.5, 0.8, -0.52, 0.36], [-0.28, 0.08, -0.1, 0.04]],
        hind: [[-0.06, 0.05], [-0.06, 0.66, -0.44, 0.7], [-0.74, 0.44, -0.48, 0.08]],
      };
    case 'tails':
      return {
        fore: [[0.12, 0.05], [0.14, 0.6, -0.04, 0.98], [-0.36, 0.86, -0.44, 0.45], [-0.3, 0.1, -0.1, 0.06]],
        hind: [[-0.06, 0.06], [-0.1, 0.75, -0.46, 0.6], [-0.9, 0.62, -1.38, 0.5], [-0.8, 0.32, -0.42, 0.08]],
      };
    case 'atlas':
      return {
        fore: [[0.12, 0.05], [0.24, 0.62, 0.06, 1.0], [-0.08, 1.05, -0.18, 0.88], [-0.46, 0.82, -0.46, 0.4], [-0.32, 0.1, -0.12, 0.06]],
        hind: [[-0.08, 0.06], [-0.04, 0.84, -0.5, 0.82], [-0.82, 0.5, -0.46, 0.08]],
      };
    default:
      return null;
  }
}

/** Trace a wing outline (right side when side = 1, mirrored when -1), scaled. */
function traceWing(ctx, pts, s, side, spread) {
  const Y = (y) => y * s * side * spread;
  ctx.beginPath();
  ctx.moveTo(pts[0][0] * s, Y(pts[0][1]));
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.length === 4) ctx.quadraticCurveTo(p[0] * s, Y(p[1]), p[2] * s, Y(p[3]));
    else ctx.lineTo(p[0] * s, Y(p[1]));
  }
  ctx.closePath();
}

function speciesColors(kind, gilded) {
  const sp = SPECIES[kind];
  if (!gilded) return sp;
  return { ...sp, fore: GOLD[0], hind: GOLD[1], body: GOLD[2], accent: '#fff3c4' };
}

/** Pattern marks on a wing, drawn while clipped to it. */
function wingPattern(ctx, sp, part, s, side, spread, L) {
  const Y = (y) => y * s * side * spread;
  const dot = (x, y, r, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(x * s, Y(y), r * s, r * s * Math.max(0.3, spread), 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const p = sp.pattern;
  if (p === 'spots' && part === 'fore') {
    dot(-0.08, 0.42, 0.07, L(sp.accent));
    dot(-0.2, 0.62, 0.06, L(sp.accent));
    dot(-0.3, 0.34, 0.05, L(sp.accent));
  } else if (p === 'tiger') {
    if (part === 'fore') {
      dot(-0.02, 0.3, 0.12, L(sp.accent));
      dot(-0.14, 0.66, 0.13, L(sp.accent));
      dot(-0.34, 0.42, 0.1, L(sp.accent));
      dot(0.0, 0.82, 0.07, L(sp.accent));
    } else {
      dot(-0.3, 0.5, 0.08, L('#24264a'));
      dot(-0.5, 0.3, 0.07, L('#24264a'));
    }
  } else if (p === 'band' && part === 'fore') {
    ctx.strokeStyle = L(sp.hind);
    ctx.lineWidth = s * 0.26;
    ctx.beginPath();
    ctx.moveTo(-0.32 * s, Y(0.05));
    ctx.lineTo(-0.14 * s, Y(1.0));
    ctx.stroke();
  } else if (p === 'eyes') {
    const y = part === 'fore' ? 0.5 : 0.42;
    const x = part === 'fore' ? -0.16 : -0.3;
    dot(x, y, 0.09, L(sp.accent));
    dot(x, y, 0.045, L('#5a3a2a'));
  } else if (p === 'stripe' && part === 'fore') {
    ctx.strokeStyle = L(sp.accent);
    ctx.lineWidth = s * 0.12;
    ctx.beginPath();
    ctx.moveTo(0.05 * s, Y(0.1));
    ctx.quadraticCurveTo(-0.2 * s, Y(0.5), -0.44 * s, Y(0.9));
    ctx.stroke();
  } else if (p === 'windows') {
    ctx.fillStyle = L(sp.accent);
    ctx.beginPath();
    const x = part === 'fore' ? -0.12 : -0.34;
    const y = part === 'fore' ? 0.52 : 0.4;
    ctx.moveTo(x * s, Y(y - 0.1));
    ctx.lineTo((x + 0.1) * s, Y(y + 0.1));
    ctx.lineTo((x - 0.08) * s, Y(y + 0.08));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = L(mix(sp.accent, sp.fore, 0.3));
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.moveTo(0.1 * s, Y(0.3));
    ctx.quadraticCurveTo(-0.3 * s, Y(0.55), -0.5 * s, Y(0.95));
    ctx.stroke();
  } else if (p === 'skull' && part === 'fore') {
    ctx.strokeStyle = L('#6e5a48');
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.moveTo(-0.05 * s, Y(0.2));
    ctx.quadraticCurveTo(-0.2 * s, Y(0.6), -0.44 * s, Y(0.82));
    ctx.stroke();
  } else if (p === 'skull' && part === 'hind') {
    ctx.strokeStyle = L('#2a201c');
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.moveTo(-0.12 * s, Y(0.18));
    ctx.quadraticCurveTo(-0.3 * s, Y(0.45), -0.36 * s, Y(0.64));
    ctx.moveTo(-0.3 * s, Y(0.12));
    ctx.quadraticCurveTo(-0.5 * s, Y(0.3), -0.6 * s, Y(0.44));
    ctx.stroke();
  } else if (p === 'plain' && part === 'fore') {
    ctx.strokeStyle = L(darken(sp.fore, 0.18));
    ctx.lineWidth = s * 0.08;
    ctx.beginPath();
    ctx.moveTo(-0.2 * s, Y(0.1));
    ctx.lineTo(-0.4 * s, Y(0.7));
    ctx.stroke();
  }
}

/** Satin-stitch texture: fine lines fanning out from the shoulder, clipped to the current path. */
function satin(ctx, s, side, spread, color, step) {
  ctx.strokeStyle = color;
  ctx.lineWidth = step * 0.45;
  ctx.beginPath();
  for (let a = -1.9; a <= 0.4; a += step / (s * 0.9)) {
    const ex = Math.cos(a + Math.PI / 2) * s * 1.6;
    const ey = Math.sin(a + Math.PI / 2) * s * 1.6 * side * spread;
    ctx.moveTo(0, 0);
    ctx.lineTo(ex, ey);
  }
  ctx.stroke();
}

/**
 * Draw a moth (or beetle) centred at (x, y) heading `angle`, in the current transform.
 * opts: s (half wingspan), spread (0.2..1.2 wing opening), settled, light (0..1),
 * emb (embroidered look), gilded, t (time, for antennae).
 */
export function drawMoth(ctx, kind, x, y, angle, opts = {}) {
  const sp0 = SPECIES[kind];
  const sp = speciesColors(kind, opts.gilded);
  const s = opts.s ?? sp0.size;
  const light = opts.light ?? 1;
  const L = light >= 0.99 ? (c) => c : (c) => mix(c, DARK, 1 - light);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  if (opts.transfer) {
    drawTransfer(ctx, sp0, s);
    ctx.restore();
    return;
  }
  if (sp0.wing === 'beetle') {
    drawBeetle(ctx, sp, s, L, opts);
    ctx.restore();
    return;
  }
  const shape = wingPaths(sp0.wing, s);
  const settled = opts.settled;
  const spread = opts.spread ?? (settled ? 0.5 : 1);
  const emb = opts.emb;
  const parts = settled ? ['fore'] : ['hind', 'fore'];

  // Shadow on the linen (live moths only).
  if (!emb && opts.shadow !== false) {
    ctx.save();
    ctx.translate(s * 0.1, s * (settled ? 0.1 : 0.3));
    ctx.fillStyle = `rgba(30, 18, 8, ${settled ? 0.38 : 0.26})`;
    for (const part of parts) {
      for (const side of [1, -1]) {
        ctx.save();
        if (settled) ctx.rotate(side * -0.5);
        traceWing(ctx, shape[part], s, side, spread);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  for (const part of parts) {
    const base = part === 'fore' ? sp.fore : sp.hind;
    for (const side of [1, -1]) {
      ctx.save();
      if (settled) ctx.rotate(side * -0.5); // folded back into a tent
      traceWing(ctx, shape[part], s, side, spread);
      ctx.fillStyle = L(base);
      ctx.fill();
      ctx.save();
      ctx.clip();
      wingPattern(ctx, sp, part, s, side, spread, L);
      if (emb) {
        satin(ctx, s, side, spread, 'rgba(255,255,255,0.22)', Math.max(1.1, s * 0.07));
        satin(ctx, s, side, spread, 'rgba(60,30,10,0.12)', Math.max(1.6, s * 0.1));
      }
      ctx.restore();
      traceWing(ctx, shape[part], s, side, spread); // the clip pass replaced the path
      ctx.strokeStyle = L(darken(base, emb ? 0.35 : 0.55));
      ctx.lineWidth = emb ? Math.max(0.9, s * 0.05) : Math.max(1.2, s * 0.05);
      if (emb) ctx.setLineDash([s * 0.09, s * 0.04]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // Body and head.
  ctx.fillStyle = L(sp.body);
  ctx.beginPath();
  ctx.ellipse(-0.08 * s, 0, 0.3 * s, 0.075 * s + 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  if (sp0.pattern === 'skull') {
    ctx.fillStyle = L(sp.accent);
    ctx.beginPath();
    ctx.ellipse(0.05 * s, 0, 0.1 * s, 0.085 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = L('#2a201c');
    ctx.beginPath();
    ctx.arc(0.07 * s, 0.035 * s, 0.024 * s, 0, Math.PI * 2);
    ctx.moveTo(0.07 * s, -0.035 * s);
    ctx.arc(0.07 * s, -0.035 * s, 0.024 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  if (emb) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = Math.max(0.6, s * 0.03);
    ctx.beginPath();
    for (let bx = -0.34; bx < 0.2; bx += 0.07) {
      ctx.moveTo(bx * s, -0.07 * s);
      ctx.lineTo(bx * s + 0.03 * s, 0.07 * s);
    }
    ctx.stroke();
  }
  ctx.fillStyle = L(darken(sp.body, 0.2));
  ctx.beginPath();
  ctx.arc(0.24 * s, 0, 0.065 * s + 0.4, 0, Math.PI * 2);
  ctx.fill();
  // Antennae.
  const tw = emb ? 0 : Math.sin((opts.t || 0) * 5) * 0.05;
  ctx.strokeStyle = L(darken(sp.body, 0.3));
  ctx.lineWidth = Math.max(0.5, s * 0.025);
  ctx.beginPath();
  for (const side of [1, -1]) {
    ctx.moveTo(0.28 * s, side * 0.03 * s);
    ctx.quadraticCurveTo(0.45 * s, side * (0.08 + tw) * s, 0.55 * s, side * (0.22 + tw) * s);
  }
  ctx.stroke();
  ctx.restore();
}

/** An unstitched pattern: blue transfer-ink dashes, like a printed embroidery kit. */
function drawTransfer(ctx, sp, s) {
  ctx.strokeStyle = 'rgba(70, 100, 190, 0.7)';
  ctx.lineWidth = Math.max(1, s * 0.035);
  ctx.setLineDash([s * 0.07, s * 0.06]);
  if (sp.wing === 'beetle') {
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.9, s * 0.72, 0, 0, Math.PI * 2);
    ctx.moveTo(s * 1.1, 0);
    ctx.ellipse(s * 0.82, 0, s * 0.28, s * 0.36, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const shape = wingPaths(sp.wing, s);
    for (const part of ['hind', 'fore']) {
      for (const side of [1, -1]) {
        traceWing(ctx, shape[part], s, side, 1);
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.ellipse(-0.08 * s, 0, 0.3 * s, 0.075 * s + 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawBeetle(ctx, sp, s, L, opts) {
  if (!opts.emb) {
    ctx.fillStyle = 'rgba(30, 20, 10, 0.3)';
    ctx.beginPath();
    ctx.ellipse(s * 0.1, s * 0.12, s * 1.05, s * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Legs, scuttling.
  const ph = (opts.t || 0) * 14;
  ctx.strokeStyle = L('#3a302a');
  ctx.lineWidth = Math.max(0.6, s * 0.12);
  ctx.beginPath();
  for (let i = -1; i <= 1; i++) {
    for (const side of [1, -1]) {
      const wig = opts.emb ? 0 : Math.sin(ph + i * 2 + (side > 0 ? 0 : Math.PI)) * 0.25;
      ctx.moveTo(i * s * 0.4, side * s * 0.4);
      ctx.lineTo(i * s * 0.5 + wig * s, side * s * 1.05);
    }
  }
  ctx.stroke();
  ctx.fillStyle = L(sp.body);
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.9, s * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = L('#1d1814');
  ctx.beginPath();
  ctx.ellipse(s * 0.82, 0, s * 0.28, s * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  // Mottled scales.
  const r = hashRand(7);
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 0.6;
    ctx.fillStyle = L(i % 3 === 0 ? '#d98a3a' : sp.accent);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d * s, Math.sin(a) * d * s * 0.8, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = L('#0e0b09');
  ctx.lineWidth = Math.max(0.5, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(s * 0.55, 0);
  ctx.lineTo(-s * 0.85, 0);
  ctx.stroke();
}

// ---------------------------------------------------------------------------------------
// The renderer

/**
 * `room`: an optional canvas behind the main one for the static background (room, lamp,
 * linen). With it, frames skip a full-screen copy; without it (the sampler), the background
 * is drawn into every frame.
 */
export function createRenderer(canvas, { room = null } = {}) {
  const ctx = canvas.getContext('2d');
  const bg = room || document.createElement('canvas');
  const ring = document.createElement('canvas');
  let RW = 1; // css size of the square ring layer
  const emb = document.createElement('canvas');
  let L = { W: 1, H: 1, dpr: 1, cx: 0, cy: 0, R: 100 };
  let scale = 0.2;
  let embDrawn = 0;
  let embHistory = null;
  let vis = 2.2;
  // Drawn half-wingspan: small moths are scaled up a lot for legibility, bosses less.
  const drawSize = (kind) => {
    const sp = SPECIES[kind];
    return sp.boss ? sp.size * (1 + (vis - 1) * 0.6) : sp.crawler ? sp.size * vis * 0.75 : sp.size * vis;
  };
  const motes = Array.from({ length: 34 }, (_, i) => {
    const r = hashRand(i * 13 + 5);
    return { a: r() * Math.PI * 2, d: Math.sqrt(r()) * 1.5, sp: 0.02 + r() * 0.05, ph: r() * 10, z: 0.6 + r() * 0.8 };
  });

  function resize(layout) {
    L = { ...layout };
    scale = L.R / HOOP_R;
    vis = Math.min(2.8, Math.max(2.2, 2.2 * Math.sqrt(0.65 / scale)));
    for (const c of [canvas, bg]) {
      c.width = Math.round(L.W * L.dpr);
      c.height = Math.round(L.H * L.dpr);
    }
    RW = Math.ceil(L.R * 2.4);
    ring.width = ring.height = Math.round(RW * L.dpr);
    canvas.style.width = `${L.W}px`;
    canvas.style.height = `${L.H}px`;
    if (room) {
      room.style.width = `${L.W}px`;
      room.style.height = `${L.H}px`;
    }
    const es = Math.ceil(L.R * 2 * L.dpr);
    emb.width = emb.height = es;
    paintBackground();
    paintRing();
    embDrawn = 0;
    embHistory = null;
  }

  const world = (c) => c.setTransform(L.dpr * scale, 0, 0, L.dpr * scale, L.dpr * L.cx, L.dpr * L.cy);
  const screen = (c) => c.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
  const toWorld = (px, py) => ({ x: (px - L.cx) / scale, y: (py - L.cy) / scale });
  const toScreen = (x, y) => ({ x: L.cx + x * scale, y: L.cy + y * scale });
  const px = (n) => n / scale; // n pixels in world units

  function paintBackground() {
    const c = bg.getContext('2d');
    screen(c);
    c.clearRect(0, 0, L.W, L.H);
    if (L.room !== false) paintRoom(c);
    // Hoop shadow.
    c.fillStyle = 'rgba(5, 6, 18, 0.55)';
    c.filter = `blur(${Math.round(L.R * 0.06)}px)`;
    c.beginPath();
    c.ellipse(L.cx + L.R * 0.04, L.cy + L.R * 0.09, L.R * 1.06, L.R * 1.05, 0, 0, Math.PI * 2);
    c.fill();
    c.filter = 'none';
    paintLinen(c);
  }

  function paintRoom(c) {
    const g = c.createLinearGradient(0, 0, 0, L.H);
    g.addColorStop(0, '#1b2044');
    g.addColorStop(1, '#0f1229');
    c.fillStyle = g;
    c.fillRect(0, 0, L.W, L.H);
    // Lamp pool.
    const lamp = c.createRadialGradient(L.cx - L.R * 0.25, L.cy - L.R * 0.35, L.R * 0.1, L.cx, L.cy, L.R * 2.1);
    lamp.addColorStop(0, 'rgba(244, 184, 96, 0.42)');
    lamp.addColorStop(0.45, 'rgba(200, 130, 70, 0.16)');
    lamp.addColorStop(1, 'rgba(23, 28, 58, 0)');
    c.fillStyle = lamp;
    c.fillRect(0, 0, L.W, L.H);
  }

  function paintLinen(c) {
    world(c);
    c.save();
    c.beginPath();
    c.arc(0, 0, HOOP_R, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = LINEN;
    c.fillRect(-HOOP_R, -HOOP_R, HOOP_R * 2, HOOP_R * 2);
    const r = hashRand(42);
    const pitch = Math.max(px(2.2), 3.2);
    c.lineWidth = pitch * 0.45;
    for (let y = -HOOP_R; y < HOOP_R; y += pitch) {
      const k = r();
      c.strokeStyle = k < 0.5 ? `rgba(120, 98, 62, ${0.06 + r() * 0.08})` : `rgba(255, 250, 235, ${0.08 + r() * 0.1})`;
      c.beginPath();
      c.moveTo(-HOOP_R, y + r() * 0.6);
      c.lineTo(HOOP_R, y + r() * 0.6);
      c.stroke();
    }
    for (let x = -HOOP_R; x < HOOP_R; x += pitch) {
      const k = r();
      c.strokeStyle = k < 0.5 ? `rgba(120, 98, 62, ${0.05 + r() * 0.07})` : `rgba(255, 250, 235, ${0.06 + r() * 0.08})`;
      c.beginPath();
      c.moveTo(x + r() * 0.6, -HOOP_R);
      c.lineTo(x + r() * 0.6, HOOP_R);
      c.stroke();
    }
    // Slubs: thicker irregular threads.
    for (let i = 0; i < 70; i++) {
      const horiz = r() < 0.5;
      const a = (r() * 2 - 1) * HOOP_R;
      const b = (r() * 2 - 1) * HOOP_R;
      const len = 20 + r() * 90;
      c.strokeStyle = `rgba(${r() < 0.5 ? '130, 104, 66' : '250, 244, 226'}, ${0.05 + r() * 0.07})`;
      c.lineWidth = pitch * (0.5 + r() * 0.4);
      c.beginPath();
      if (horiz) {
        c.moveTo(b, a);
        c.lineTo(b + len, a);
      } else {
        c.moveTo(a, b);
        c.lineTo(a, b + len);
      }
      c.stroke();
    }
    // Lamp light on the linen and a darker rim.
    const hl = c.createRadialGradient(-HOOP_R * 0.3, -HOOP_R * 0.35, 0, 0, 0, HOOP_R * 1.05);
    hl.addColorStop(0, 'rgba(255, 236, 196, 0.38)');
    hl.addColorStop(0.6, 'rgba(255, 220, 170, 0.05)');
    hl.addColorStop(0.92, 'rgba(70, 45, 25, 0.16)');
    hl.addColorStop(1, 'rgba(50, 30, 15, 0.42)');
    c.fillStyle = hl;
    c.fillRect(-HOOP_R, -HOOP_R, HOOP_R * 2, HOOP_R * 2);
    c.restore();
  }

  function paintRing() {
    const c = ring.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, ring.width, ring.height);
    c.setTransform(L.dpr * scale, 0, 0, L.dpr * scale, (L.dpr * RW) / 2, (L.dpr * RW) / 2);
    const rw = Math.max(px(9), HOOP_R * 0.06);
    // Outer wooden hoop.
    const wood = c.createLinearGradient(-HOOP_R, -HOOP_R, HOOP_R, HOOP_R);
    wood.addColorStop(0, '#e2b27a');
    wood.addColorStop(0.5, '#c48c52');
    wood.addColorStop(1, '#8f5d30');
    c.lineWidth = rw;
    c.strokeStyle = wood;
    c.beginPath();
    c.arc(0, 0, HOOP_R + rw / 2, 0, Math.PI * 2);
    c.stroke();
    // Grain.
    const r = hashRand(9);
    c.lineWidth = Math.max(px(0.8), 1);
    for (let i = 0; i < 26; i++) {
      const rr = HOOP_R + rw * (0.15 + r() * 0.7);
      const a0 = r() * Math.PI * 2;
      c.strokeStyle = `rgba(110, 66, 30, ${0.2 + r() * 0.25})`;
      c.beginPath();
      c.arc(0, 0, rr, a0, a0 + 0.3 + r() * 0.9);
      c.stroke();
    }
    // Edge highlights.
    c.lineWidth = Math.max(px(1.2), 1.5);
    c.strokeStyle = 'rgba(255, 230, 190, 0.55)';
    c.beginPath();
    c.arc(0, 0, HOOP_R + rw - c.lineWidth, Math.PI * 1.05, Math.PI * 1.75);
    c.stroke();
    c.strokeStyle = 'rgba(60, 35, 15, 0.6)';
    c.beginPath();
    c.arc(0, 0, HOOP_R + c.lineWidth / 2, 0, Math.PI * 2);
    c.stroke();
    // Inner shadow of the hoop on the linen.
    const sh = c.createRadialGradient(0, 0, HOOP_R * 0.9, 0, 0, HOOP_R);
    sh.addColorStop(0, 'rgba(60, 35, 15, 0)');
    sh.addColorStop(1, 'rgba(60, 35, 15, 0.32)');
    c.fillStyle = sh;
    c.beginPath();
    c.arc(0, 0, HOOP_R, 0, Math.PI * 2);
    c.fill();
    // Brass clasp at the top.
    c.save();
    c.translate(0, -HOOP_R - rw);
    const brass = c.createLinearGradient(-rw, 0, rw, 0);
    brass.addColorStop(0, '#8a6a2a');
    brass.addColorStop(0.5, '#e7c873');
    brass.addColorStop(1, '#7a5a20');
    c.fillStyle = brass;
    c.fillRect(-rw * 0.9, -rw * 0.55, rw * 0.6, rw * 1.3);
    c.fillRect(rw * 0.3, -rw * 0.55, rw * 0.6, rw * 1.3);
    c.fillRect(-rw * 1.5, -rw * 0.25, rw * 3, rw * 0.5);
    c.fillStyle = '#5a4214';
    c.beginPath();
    c.arc(rw * 1.6, 0, rw * 0.32, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  // ---- Embroidery layer ---------------------------------------------------------------

  function embCtx() {
    const c = emb.getContext('2d');
    const k = (emb.width / 2 / HOOP_R);
    c.setTransform(k, 0, 0, k, emb.width / 2, emb.height / 2);
    return c;
  }

  function drawHistoryItem(c, h) {
    c.save();
    c.beginPath();
    c.arc(0, 0, HOOP_R - 2, 0, Math.PI * 2);
    c.clip();
    if (h.type === 'loop') drawRunningStitch(c, h.pts, h.color);
    else if (h.type === 'moth') drawMoth(c, h.kind, h.x, h.y, h.angle, { s: drawSize(h.kind) * 0.86, emb: true, gilded: h.gilded });
    else if (h.type === 'darn') drawDarn(c, h);
    c.restore();
  }

  function drawRunningStitch(c, pts, color) {
    const w = Math.max(px(2.2), 3);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.setLineDash([w * 3.2, w * 2]);
    c.lineWidth = w;
    c.strokeStyle = 'rgba(60, 36, 16, 0.25)';
    c.save();
    c.translate(w * 0.35, w * 0.5);
    tracePoly(c, pts, true);
    c.stroke();
    c.restore();
    c.strokeStyle = color;
    tracePoly(c, pts, true);
    c.stroke();
    c.lineWidth = w * 0.35;
    c.strokeStyle = 'rgba(255,255,255,0.28)';
    c.stroke();
    c.setLineDash([]);
  }

  function drawDarn(c, h) {
    const r = h.r * 1.25 + 3;
    const w = Math.max(px(1.6), 2.2);
    c.save();
    c.beginPath();
    c.arc(h.x, h.y, r, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = mix(h.color, LINEN, 0.72);
    c.fillRect(h.x - r, h.y - r, r * 2, r * 2);
    c.lineWidth = w;
    c.strokeStyle = mix(h.color, LINEN, 0.3);
    c.beginPath();
    for (let y = h.y - r; y < h.y + r; y += w * 1.6) {
      c.moveTo(h.x - r, y);
      c.lineTo(h.x + r, y);
    }
    c.stroke();
    c.strokeStyle = lighten(h.color, 0.25);
    c.setLineDash([w * 1.6, w * 1.6]);
    c.beginPath();
    let flip = 0;
    for (let x = h.x - r; x < h.x + r; x += w * 1.6) {
      c.lineDashOffset = flip++ % 2 ? w * 1.6 : 0;
      c.moveTo(x, h.y - r);
      c.lineTo(x, h.y + r);
      c.stroke();
      c.beginPath();
    }
    c.setLineDash([]);
    c.restore();
    c.strokeStyle = darken(h.color, 0.2);
    c.lineWidth = w * 0.8;
    c.setLineDash([w * 1.2, w * 0.8]);
    c.beginPath();
    c.arc(h.x, h.y, r, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
  }

  /** Bring the embroidery layer up to `upTo` entries of history (redraws if history changed). */
  const stitchedAt = new Map(); // history index -> time it was stitched, for the fresh glow
  function syncEmbroidery(history, upTo = history.length, now = 0) {
    if (embHistory !== history || upTo < embDrawn) {
      stitchedAt.clear();
      emb.getContext('2d').setTransform(1, 0, 0, 1, 0, 0);
      emb.getContext('2d').clearRect(0, 0, emb.width, emb.height);
      embDrawn = 0;
      embHistory = history;
    }
    if (embDrawn >= upTo) return;
    const c = embCtx();
    const fresh = embHistory === history && embDrawn > 0;
    for (; embDrawn < upTo; embDrawn++) {
      drawHistoryItem(c, history[embDrawn]);
      if (fresh) stitchedAt.set(embDrawn, now);
    }
  }

  // ---- Live things -------------------------------------------------------------------

  function tracePoly(c, pts, close) {
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    if (close) c.closePath();
  }

  function traceSmooth(c, pts) {
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      c.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    c.lineTo(last.x, last.y);
  }

  function drawHoles(c, holes) {
    for (const h of holes) {
      if (h.r < 0.5) continue;
      const r = hashRand(h.seed || 1);
      const n = 14;
      const rad = [];
      for (let i = 0; i < n; i++) rad.push(h.r * (0.82 + r() * 0.36));
      const trace = (k) => {
        c.beginPath();
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2;
          const rr = rad[i % n] * k;
          if (i === 0) c.moveTo(h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr);
          else c.lineTo(h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr);
        }
        c.closePath();
      };
      trace(1.18);
      c.fillStyle = 'rgba(90, 64, 34, 0.35)'; // frayed, thinned edge
      c.fill();
      trace(1);
      c.fillStyle = '#120f22';
      c.fill();
      // Loose fibres across the gap.
      c.strokeStyle = 'rgba(214, 198, 160, 0.7)';
      c.lineWidth = Math.max(px(0.7), 0.8);
      c.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = r() * Math.PI * 2;
        const l = h.r * (0.3 + r() * 0.5);
        c.moveTo(h.x + Math.cos(a) * h.r * 0.95, h.y + Math.sin(a) * h.r * 0.95);
        c.lineTo(h.x + Math.cos(a) * (h.r - l), h.y + Math.sin(a) * (h.r - l));
      }
      c.stroke();
    }
  }

  function drawThread(c, pts, color, { alpha = 1, width = null } = {}) {
    if (pts.length < 2) return;
    const w = width ?? Math.min(px(3.4), Math.max(px(2), HOOP_R / 110));
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.globalAlpha = alpha;
    c.save();
    c.translate(w * 0.5, w * 0.9);
    c.strokeStyle = 'rgba(50, 30, 12, 0.3)';
    c.lineWidth = w;
    traceSmooth(c, pts);
    c.stroke();
    c.restore();
    c.strokeStyle = color;
    c.lineWidth = w;
    traceSmooth(c, pts);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.32)';
    c.lineWidth = w * 0.32;
    c.setLineDash([w * 1.4, w * 1.6]);
    c.stroke();
    c.setLineDash([]);
    c.globalAlpha = 1;
  }

  function drawNeedle(c, x, y, angle) {
    const len = Math.max(px(26), 38);
    const w = Math.max(px(2.6), 3.2);
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    // Shadow.
    c.fillStyle = 'rgba(40, 25, 10, 0.32)';
    c.beginPath();
    c.moveTo(-len * 0.1 + w, -w * 0.5 + w * 1.4);
    c.lineTo(len * 0.9 + w, w * 1.4);
    c.lineTo(-len * 0.1 + w, w * 0.5 + w * 1.4);
    c.fill();
    const g = c.createLinearGradient(0, -w, 0, w);
    g.addColorStop(0, '#f4f6fa');
    g.addColorStop(0.5, '#a9b0bd');
    g.addColorStop(1, '#5d6472');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-len * 0.14, -w * 0.55);
    c.lineTo(len * 0.62, -w * 0.4);
    c.lineTo(len * 0.9, 0);
    c.lineTo(len * 0.62, w * 0.4);
    c.lineTo(-len * 0.14, w * 0.55);
    c.arc(-len * 0.14, 0, w * 0.55, Math.PI / 2, -Math.PI / 2);
    c.fill();
    // Eye.
    c.fillStyle = '#3a3e48';
    c.beginPath();
    c.ellipse(-len * 0.06, 0, w * 0.75, w * 0.18, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  /**
   * One frame. view = { state, t, alpha (interp), needle {x,y,angle}, fx: [...], ghosts: [...],
   * revealed (history entries committed to the embroidery layer), showNeedle, dawn (0..1) }.
   */
  function frame(view) {
    const s = view.state;
    screen(ctx);
    ctx.clearRect(0, 0, L.W, L.H);
    if (!room) ctx.drawImage(bg, 0, 0, L.W, L.H);
    world(ctx);

    // Dust motes drifting in the lamp light.
    ctx.fillStyle = 'rgba(255, 226, 170, 0.5)';
    for (const m of view.motes === false ? [] : motes) {
      const a = m.a + view.t * m.sp;
      const d = m.d * HOOP_R + Math.sin(view.t * 0.4 + m.ph) * 20;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d * 0.8 - ((view.t * 6 * m.z + m.ph * 50) % 300) + 150;
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(view.t + m.ph);
      ctx.beginPath();
      ctx.arc(x, y, px(1.1 * m.z), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (s) syncEmbroidery(s.history, view.revealed ?? s.history.length, view.t);
    // During play the embroidery sits back so live moths read clearly; the end screen
    // shows it at full strength.
    const embAlpha = view.embAlpha ?? 1;
    screen(ctx);
    ctx.globalAlpha = embAlpha;
    ctx.drawImage(emb, L.cx - L.R, L.cy - L.R, L.R * 2, L.R * 2);
    ctx.globalAlpha = 1;
    world(ctx);
    if (s && embAlpha < 1) {
      // Just-stitched pieces start vivid and settle back over two seconds.
      for (const [i, at] of stitchedAt) {
        const age = view.t - at;
        if (age > 2 || age < 0) {
          stitchedAt.delete(i);
          continue;
        }
        ctx.globalAlpha = (1 - embAlpha) * (1 - age / 2);
        drawHistoryItem(ctx, s.history[i]);
      }
      ctx.globalAlpha = 1;
    }
    if (s) {
      // Moths eat through the stitching too, so open holes sit above the embroidery.
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, HOOP_R, 0, Math.PI * 2);
      ctx.clip();
      drawHoles(ctx, s.holes);
      if (view.tear > 0) drawTear(ctx, s.holes, view.tear);
      ctx.restore();
    }
    screen(ctx);
    ctx.drawImage(ring, L.cx - RW / 2, L.cy - RW / 2, RW, RW);
    world(ctx);
    if (!s) return;

    const t = view.t;
    const fx = view.fx || [];
    // Effects under the moths.
    for (const e of fx) {
      const k = (t - e.t0) / e.dur;
      if (k < 0 || k > 1) continue;
      if (e.type === 'ring') {
        ctx.strokeStyle = e.color;
        ctx.globalAlpha = (1 - k) * (e.alpha ?? 0.8);
        ctx.lineWidth = px(e.width ?? 3);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r0 + (e.r1 - e.r0) * (1 - (1 - k) ** 2), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (e.type === 'cinch') {
        const ease = 1 - (1 - Math.min(1, k * 1.6)) ** 3;
        const sc = 1 - 0.07 * ease;
        ctx.save();
        ctx.translate(e.cx, e.cy);
        ctx.scale(sc, sc);
        ctx.translate(-e.cx, -e.cy);
        ctx.globalAlpha = 1 - k * k;
        ctx.fillStyle = mix(e.color, '#fff3d6', 0.6);
        ctx.globalAlpha = (1 - k) * 0.28;
        tracePoly(ctx, e.poly, true);
        ctx.fill();
        ctx.globalAlpha = 1 - k * k;
        ctx.shadowColor = lighten(e.color, 0.4);
        ctx.shadowBlur = 14 * L.dpr;
        ctx.strokeStyle = lighten(e.color, 0.15);
        ctx.lineWidth = px(4.5);
        ctx.lineJoin = 'round';
        tracePoly(ctx, e.poly, true);
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1;
      } else if (e.type === 'flare') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const rr = e.r * (0.6 + 0.6 * k);
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, rr);
        g.addColorStop(0, `rgba(255, 214, 140, ${0.42 * (1 - k)})`);
        g.addColorStop(1, 'rgba(255, 214, 140, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (e.type === 'snapPiece') {
        const off = e.drift * k * k;
        ctx.save();
        ctx.translate(0, off);
        drawThread(ctx, e.pts, e.color, { alpha: 1 - k });
        ctx.restore();
      }
    }

    // The live thread.
    const head = view.needle || s.needle;
    const color = FLOSS[s.floss % FLOSS.length];
    // "Close here": a warm glow where crossing the old thread would catch something.
    if (view.hint && view.showNeedle !== false) {
      const h = view.hint;
      const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 34);
      g.addColorStop(0, `rgba(255, 220, 140, ${0.75 * h.k})`);
      g.addColorStop(1, 'rgba(255, 220, 140, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 34, 0, Math.PI * 2);
      ctx.fill();
    }
    if (view.showNeedle !== false) drawThread(ctx, [...s.thread, head], color);
    if (view.showNeedle !== false && s.thread.length) {
      const tail = s.thread[0];
      ctx.fillStyle = darken(color, 0.15);
      ctx.beginPath();
      ctx.arc(tail.x, tail.y, Math.max(px(2.6), 3.6), 0, Math.PI * 2);
      ctx.fill();
    }

    // Moths: settled first, then crawlers, then fliers, bosses last.
    const order = (m) => (m.mode === 'eat' ? 0 : m.mode === 'crawl' ? 1 : SPECIES[m.kind].boss ? 3 : 2);
    const moths = [...s.moths].sort((a, b) => order(a) - order(b));
    const alpha = view.alpha ?? 1;
    for (const m of moths) {
      const sp = SPECIES[m.kind];
      const x = m.px !== undefined ? m.px + (m.x - m.px) * alpha : m.x;
      const y = m.py !== undefined ? m.py + (m.y - m.py) * alpha : m.y;
      const r = Math.hypot(x, y);
      const light = r <= HOOP_R ? 1 : Math.max(0.16, 1 - (r - HOOP_R) / 170);
      const flapRate = sp.boss ? 5 : sp.size > 20 ? 9 : 14;
      let spread = 0.3 + 0.7 * Math.abs(Math.sin(m.t * flapRate));
      if (m.windup) spread = 0.6 + 0.6 * m.windup;
      if (sp.boss && m.windup > 0) {
        ctx.strokeStyle = '#b5362f';
        ctx.globalAlpha = 0.25 + 0.5 * m.windup;
        ctx.lineWidth = px(2.5);
        ctx.setLineDash([px(8), px(6)]);
        ctx.beginPath();
        ctx.arc(x, y, sp.gustRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (m.mode === 'eat') spread = 0.5;
      if (m.mode === 'eat' && view.showNeedle !== false) {
        // Settled moths twitch as the needle nears, and show how close is too close.
        const R0 = sp.startle * s.mods.startle;
        const d = Math.hypot(head.x - x, head.y - y);
        const near = Math.max(0, Math.min(1, 1 - (d - R0) / (R0 * 0.8)));
        spread = 0.5 + 0.2 * near * Math.abs(Math.sin(t * 32 + m.id));
        if (near > 0) {
          ctx.strokeStyle = `rgba(181, 54, 47, ${0.4 * near})`;
          ctx.lineWidth = px(1.5);
          ctx.setLineDash([px(4), px(5)]);
          ctx.beginPath();
          ctx.arc(x, y, R0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      drawMoth(ctx, m.kind, x, y, m.angle, {
        s: drawSize(m.kind),
        spread,
        settled: m.mode === 'eat',
        light,
        gilded: m.gilded,
        t: m.t,
      });
      if (m.gilded && light > 0.5) {
        const tw = 0.5 + 0.5 * Math.sin(t * 6 + m.id);
        ctx.fillStyle = `rgba(255, 240, 190, ${0.5 * tw})`;
        ctx.beginPath();
        ctx.arc(x + drawSize(m.kind) * 0.5, y - drawSize(m.kind) * 0.5, px(2 + 2 * tw), 0, Math.PI * 2);
        ctx.fill();
      }
      if (sp.boss && m.inside) drawTally(ctx, x, y - drawSize(m.kind) - px(18), m);
    }

    // Ghosts: moths caught this moment, waiting for their turn to flip into embroidery.
    for (const g of view.ghosts || []) {
      const k = Math.max(0, Math.min(1, (t - g.t0) / (g.flipAt - g.t0)));
      ctx.save();
      ctx.translate(g.x, g.y);
      // Held still in the loop, swelling and glowing, then squeezing flat as it flips.
      const swell = 1 + 0.18 * Math.sin(Math.min(1, k * 1.25) * Math.PI);
      const flip = k > 0.8 ? Math.max(0.08, 1 - (k - 0.8) / 0.2) : 1;
      ctx.rotate(g.angle);
      ctx.scale(swell, swell * flip);
      ctx.rotate(-g.angle);
      ctx.shadowColor = 'rgba(255, 236, 190, 0.95)';
      ctx.shadowBlur = 16 * L.dpr * Math.min(1, k * 2);
      drawMoth(ctx, g.kind, 0, 0, g.angle, { s: drawSize(g.kind), spread: 1, gilded: g.gilded, t, shadow: false });
      ctx.restore();
    }

    // First night: a chalk circle showing where to stitch.
    if (view.guide) {
      const gd = view.guide;
      ctx.strokeStyle = 'rgba(235, 240, 255, 0.8)';
      ctx.lineWidth = px(2.4);
      ctx.setLineDash([px(9), px(7)]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath();
      ctx.arc(gd.x, gd.y, gd.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
    // Tailor's chalk where the pointer is, when the needle lags behind it.
    if (view.pointer && view.showNeedle !== false && Math.hypot(view.pointer.x - head.x, view.pointer.y - head.y) > px(12)) {
      const p = view.pointer;
      ctx.strokeStyle = 'rgba(235, 240, 255, 0.55)';
      ctx.lineWidth = px(1.6);
      ctx.beginPath();
      ctx.moveTo(p.x - px(5), p.y - px(5));
      ctx.lineTo(p.x + px(5), p.y + px(5));
      ctx.moveTo(p.x + px(5), p.y - px(5));
      ctx.lineTo(p.x - px(5), p.y + px(5));
      ctx.stroke();
    }
    if (view.showNeedle !== false) drawNeedle(ctx, head.x, head.y, view.needleAngle ?? -Math.PI / 4);

    // The loop's multiplier, stitched at its centre and counting up as each moth flips.
    for (const e of fx) {
      if (e.type !== 'tally') continue;
      const k = (t - e.t0) / e.dur;
      const n = e.steps.filter((at) => at <= t).length;
      if (k < 0 || k > 1 || !n) continue;
      const pop = Math.max(0, 1 - (t - e.steps[n - 1]) / 0.14);
      const fade = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
      const cell = px(e.n >= 5 ? 7 : 6) * (1 + 0.3 * pop);
      const label = `×${n}`;
      const w = stitchLayout(label).cols * cell;
      ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(23, 28, 58, 0.62)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, w / 2 + cell * 2.4, cell * 5.4, 0, 0, Math.PI * 2);
      ctx.fill();
      stitchCanvas(ctx, label, e.x, e.y, cell, '#f6d77e', { shade: '#a8751f' });
      ctx.globalAlpha = 1;
    }

    // Particles above everything.
    for (const p of view.particles || []) {
      const k = (t - p.t0) / p.dur;
      if (k < 0 || k > 1) continue;
      const x = p.x + p.vx * k * p.dur + 0;
      const y = p.y + p.vy * k * p.dur + 40 * k * k * (p.g ?? 1);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = p.color;
      if (p.shape === 'fluff') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = px(1.4);
        ctx.beginPath();
        ctx.moveTo(x - px(3), y);
        ctx.quadraticCurveTo(x, y - px(3), x + px(3), y + px(1));
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, px(p.size ?? 1.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Dawn wash.
    if (view.dawn > 0) {
      screen(ctx);
      ctx.fillStyle = `rgba(255, 190, 160, ${0.16 * view.dawn})`;
      ctx.fillRect(0, 0, L.W, L.H);
    }
  }

  /** The linen splitting through its biggest holes. k 0..1 draws it progressively. */
  function drawTear(c, holes, k) {
    const hs = [...holes].sort((a, b) => b.r - a.r).slice(0, 5).sort((a, b) => a.x - b.x);
    if (!hs.length) return;
    const first = hs[0];
    const last = hs[hs.length - 1];
    const anchors = [{ x: -HOOP_R, y: first.y * 0.8 - 30 }, ...hs, { x: HOOP_R, y: last.y * 0.8 + 30 }];
    const r = hashRand(hs.length * 97 + Math.round(first.x));
    const pts = [];
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i];
      const b = anchors[i + 1];
      const n = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 16));
      for (let j = 0; j < n; j++) {
        const q = j / n;
        pts.push({ x: a.x + (b.x - a.x) * q + (r() - 0.5) * 10, y: a.y + (b.y - a.y) * q + (r() - 0.5) * 18 });
      }
    }
    pts.push(anchors[anchors.length - 1]);
    const upto = Math.max(2, Math.round(pts.length * Math.min(1, k)));
    const part = pts.slice(0, upto);
    c.lineJoin = 'miter';
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(90, 64, 34, 0.4)';
    c.lineWidth = 16;
    tracePoly(c, part, false);
    c.stroke();
    c.strokeStyle = '#120f22';
    c.lineWidth = 8;
    c.stroke();
    c.strokeStyle = 'rgba(214, 198, 160, 0.75)';
    c.lineWidth = Math.max(px(0.7), 0.8);
    c.beginPath();
    for (let i = 1; i < part.length; i += 2) {
      const p = part[i];
      c.moveTo(p.x, p.y - 5);
      c.lineTo(p.x + (r() - 0.5) * 8, p.y + 5);
    }
    c.stroke();
  }

  function drawTally(c, x, y, m) {
    const cell = Math.max(px(3), 4);
    const n = m.maxHp;
    const w = n * cell * 6;
    for (let i = 0; i < n; i++) {
      const done = i < m.maxHp - m.hp;
      const cxp = x - w / 2 + i * cell * 6 + cell * 3;
      c.fillStyle = 'rgba(23, 28, 58, 0.55)';
      c.beginPath();
      c.arc(cxp, y, cell * 2.6, 0, Math.PI * 2);
      c.fill();
      stitchCanvas(c, 'X', cxp, y, cell * 0.9, done ? GOLD[0] : 'rgba(220, 208, 180, 0.35)', { shade: done ? GOLD[2] : null });
    }
  }

  /** Render a finished sampler (embroidery + holes + hoop) into another canvas, for end screens. */
  function sampler(target, state, { size = 480, inscription = null, tear = 0 } = {}) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const tmp = createRenderer(target);
    tmp.resize({ W: size, H: size, dpr, cx: size / 2, cy: size / 2, R: size * 0.45, room: false });
    tmp.frame({ state: { ...state, moths: [] }, t: 0, showNeedle: false, motes: false, tear });
    if (inscription) label(target.getContext('2d'), inscription, size, dpr);
    return target;
  }

  /** A woven label sewn onto the sampler, with the date and score stitched on it. */
  function label(c, lines, size, dpr) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = size * 0.45;
    const cols = Math.max(...lines.map((l) => layoutWidth(l.text)));
    const cell = Math.max(2, Math.min(R * 0.026, (R * 1.35) / cols));
    const widths = lines.map((l) => layoutWidth(l.text) * cell);
    const w = Math.max(...widths) + cell * 6;
    const h = cell * 7 * lines.length + cell * 3 * (lines.length - 1) + cell * 5;
    const x = size / 2 - w / 2;
    const y = size / 2 + R * 0.86 - h;
    c.save();
    c.translate(x, y);
    c.rotate(-0.025);
    c.fillStyle = 'rgba(30, 18, 8, 0.28)';
    c.fillRect(2, 3, w, h);
    c.fillStyle = '#f1e8d3';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(110, 88, 52, 0.12)';
    c.lineWidth = 1;
    c.beginPath();
    for (let yy = 2; yy < h; yy += 2.5) {
      c.moveTo(0, yy);
      c.lineTo(w, yy);
    }
    c.stroke();
    c.strokeStyle = '#b5362f';
    c.lineWidth = Math.max(1, cell * 0.28);
    c.setLineDash([cell * 1.1, cell * 0.8]);
    c.strokeRect(cell * 1.1, cell * 1.1, w - cell * 2.2, h - cell * 2.2);
    c.setLineDash([]);
    lines.forEach((l, i) => {
      stitchCanvas(c, l.text, w / 2, cell * 2.5 + cell * 3.5 + i * cell * 10, cell, l.color, { shade: l.shade });
    });
    c.restore();
  }

  return { resize, frame, toWorld, toScreen, px, sampler, get scale() { return scale; }, get layout() { return L; } };
}
