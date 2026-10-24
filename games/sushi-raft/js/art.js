// Sushi Raft art: the otters, the customers, the gull, the ingredients and the dishes.
// Pure Canvas 2D drawing (no DOM, no images). Every export saves and restores the
// context and leaves no state behind. Inside each export the context is translated to
// the anchor and scaled by s, so shapes below are written in units of s.
// Style: storybook stickers. Warm ink outline, flat fill, one soft shade, one highlight.

export const INK = '#2a2233';

const TAU = Math.PI * 2;
const BLUSH = 'rgba(255,120,140,0.45)';
const BLUSH_HOT = 'rgba(255,105,130,0.6)';
const SHADOW = 'rgba(42,34,51,0.22)';
const WHITE = '#ffffff';
const MOUTH = '#7e2836';
const TONGUE = '#f2899a';

// ---------------------------------------------------------------------------------------
// State: begin() and end() bracket every export. LW is the outline width in local units.

let LW = 0.035;
const lwStack = [];

function begin(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  lwStack.push(LW);
  LW = Math.max(1, s * 0.035) / s;
  ctx.lineWidth = LW;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.setLineDash([]);
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'rgba(0,0,0,0)';
}

function end(ctx) {
  LW = lwStack.pop() ?? 0.035;
  ctx.restore();
}

/** Draw `fn` at (x, y) scaled by k inside the current local space, with a finer outline. */
function sub(ctx, x, y, k, fn) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  const keep = LW;
  LW = (keep / k) * 0.7;
  try { fn(ctx); } finally { LW = keep; ctx.restore(); }
}

// ---------------------------------------------------------------------------------------
// Small maths and colour helpers

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Eye openness 0..1: a quick blink every ~3.7 s at a time picked from a hash of the period. */
function blinkOpen(t, seed = 0) {
  const P = 3.7;
  const tt = t + seed * 1.91;
  const k = Math.floor(tt / P);
  const at = 0.3 + hash(k * 7.13 + seed) * (P - 0.6);
  const d = tt - k * P - at;
  if (d < 0 || d > 0.18) return 1;
  return Math.abs(d - 0.09) / 0.09;
}

/** A 0..1..0 envelope for a brief twitch that happens in some periods and not others. */
function twitch(t, seed, period = 2.9, len = 0.35) {
  const tt = t + seed;
  const k = Math.floor(tt / period);
  if (hash(k * 3.1 + seed * 11) < 0.45) return 0;
  const d = tt - k * period - 0.5;
  if (d < 0 || d > len) return 0;
  return Math.sin((d / len) * Math.PI);
}

const mixCache = new Map();
function mix(a, b, k) {
  const key = `${a}|${b}|${k}`;
  let v = mixCache.get(key);
  if (v === undefined) {
    const A = parseInt(a.slice(1), 16);
    const B = parseInt(b.slice(1), 16);
    const ch = (sh) => Math.round(((A >> sh) & 255) + (((B >> sh) & 255) - ((A >> sh) & 255)) * k);
    v = `rgb(${ch(16)},${ch(8)},${ch(0)})`;
    mixCache.set(key, v);
  }
  return v;
}
const dark = (c, k = 0.25) => mix(c, '#3b2440', k);
const lite = (c, k = 0.4) => mix(c, '#ffffff', k);

const alphaCache = new Map();
/** `c` (a #rrggbb colour) at alpha a, rounded to 0.05 so the cache stays small. */
function alpha(c, a) {
  const q = Math.round(clamp(a, 0, 1) * 20) / 20;
  const key = `${c}|${q}`;
  let v = alphaCache.get(key);
  if (v === undefined) {
    const n = parseInt(c.slice(1), 16);
    v = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${q})`;
    alphaCache.set(key, v);
  }
  return v;
}

// ---------------------------------------------------------------------------------------
// Path helpers

function ell(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(rx, 1e-4), Math.max(ry, 1e-4), rot, 0, TAU);
}

function circ(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(r, 1e-4), 0, TAU);
}

function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The top part of a rounded box: rounded top corners, a straight bottom at y + h. */
function topRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

function fill(ctx, c) {
  ctx.fillStyle = c;
  ctx.fill();
}

function stroke(ctx, w = LW, c = INK) {
  ctx.lineWidth = w;
  ctx.strokeStyle = c;
  ctx.stroke();
}

function fillStroke(ctx, c, w = LW) {
  fill(ctx, c);
  stroke(ctx, w);
}

function line(ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
}

/** A sticker ball: shade underneath, lit body offset to the upper left, a highlight, an outline. */
function ball(ctx, x, y, rx, ry, base, shade, hi = 'rgba(255,255,255,0.42)', w = LW) {
  ell(ctx, x, y, rx, ry);
  fill(ctx, shade);
  ell(ctx, x - rx * 0.07, y - ry * 0.09, rx * 0.9, ry * 0.88);
  fill(ctx, base);
  if (hi) {
    ell(ctx, x - rx * 0.42, y - ry * 0.5, rx * 0.22, ry * 0.12, -0.55);
    fill(ctx, hi);
  }
  ell(ctx, x, y, rx, ry);
  stroke(ctx, w);
}

/** A thick line with an ink outline (an outlined capsule): limbs, stalks, straps. */
function limb(ctx, x0, y0, x1, y1, w, col, cx, cy) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  if (cx === undefined) ctx.lineTo(x1, y1);
  else ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.lineWidth = w + LW * 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = w;
  ctx.strokeStyle = col;
  ctx.stroke();
  ctx.strokeStyle = INK;
}

const TP = new Float64Array(4 * 33);
/** A tapered stroke along a cubic curve as one closed path (tails, tentacles, ribbons). */
function taper(ctx, x0, y0, c1x, c1y, c2x, c2y, x1, y1, w0, w1, n = 10) {
  let a0 = 0;
  let a1 = 0;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const v = 1 - u;
    const px = v * v * v * x0 + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * x1;
    const py = v * v * v * y0 + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * y1;
    let dx = 3 * v * v * (c1x - x0) + 6 * v * u * (c2x - c1x) + 3 * u * u * (x1 - c2x);
    let dy = 3 * v * v * (c1y - y0) + 6 * v * u * (c2y - c1y) + 3 * u * u * (y1 - c2y);
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const w = (w0 + (w1 - w0) * u) * 0.5;
    TP[i * 4] = px - dy * w;
    TP[i * 4 + 1] = py + dx * w;
    TP[i * 4 + 2] = px + dy * w;
    TP[i * 4 + 3] = py - dx * w;
    if (i === 0) a0 = Math.atan2(dy, dx);
    if (i === n) a1 = Math.atan2(dy, dx);
  }
  ctx.beginPath();
  ctx.moveTo(TP[0], TP[1]);
  for (let i = 1; i <= n; i++) ctx.lineTo(TP[i * 4], TP[i * 4 + 1]);
  ctx.arc(x1, y1, Math.max(w1 * 0.5, 1e-4), a1 + Math.PI / 2, a1 - Math.PI / 2, true);
  for (let i = n; i >= 0; i--) ctx.lineTo(TP[i * 4 + 2], TP[i * 4 + 3]);
  ctx.arc(x0, y0, Math.max(w0 * 0.5, 1e-4), a0 - Math.PI / 2, a0 + Math.PI / 2, true);
  ctx.closePath();
}

/** Outline several shapes as one silhouette: a wide ink pass, then a fill pass. */
function union(ctx, shapes, col, w = LW) {
  ctx.lineWidth = w * 2;
  ctx.strokeStyle = INK;
  for (const s of shapes) { s(ctx); ctx.stroke(); }
  ctx.fillStyle = col;
  for (const s of shapes) { s(ctx); ctx.fill(); }
}

/** A short ribbon end from (x0, y0) along (dx, dy), bent sideways, with a notched tip. */
function ribbonTail(ctx, x0, y0, dx, dy, w, bend) {
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const nx = -uy;
  const ny = ux;
  const x1 = x0 + dx;
  const y1 = y0 + dy;
  const mx = x0 + dx * 0.5 + nx * bend;
  const my = y0 + dy * 0.5 + ny * bend;
  const h = w * 0.5;
  ctx.beginPath();
  ctx.moveTo(x0 + nx * h * 0.8, y0 + ny * h * 0.8);
  ctx.quadraticCurveTo(mx + nx * h, my + ny * h, x1 + nx * h * 1.15, y1 + ny * h * 1.15);
  ctx.lineTo(x1 - ux * w * 0.4, y1 - uy * w * 0.4);
  ctx.lineTo(x1 - nx * h * 1.15, y1 - ny * h * 1.15);
  ctx.quadraticCurveTo(mx - nx * h, my - ny * h, x0 - nx * h * 0.8, y0 - ny * h * 0.8);
  ctx.closePath();
}

function heartPath(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.35, y + r * 0.05, x - r * 0.95, y - r * 1.05, x, y - r * 0.35);
  ctx.bezierCurveTo(x + r * 0.95, y - r * 1.05, x + r * 1.35, y + r * 0.05, x, y + r * 0.9);
  ctx.closePath();
}

function star4(ctx, x, y, r) {
  const k = r * 0.28;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + k, y - k, x + r, y);
  ctx.quadraticCurveTo(x + k, y + k, x, y + r);
  ctx.quadraticCurveTo(x - k, y + k, x - r, y);
  ctx.quadraticCurveTo(x - k, y - k, x, y - r);
  ctx.closePath();
}

function dropPath(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.7);
  ctx.bezierCurveTo(x + r * 0.4, y - r * 0.9, x + r, y - r * 0.4, x + r, y + r * 0.1);
  ctx.arc(x, y + r * 0.1, r, 0, Math.PI);
  ctx.bezierCurveTo(x - r, y - r * 0.4, x - r * 0.4, y - r * 0.9, x, y - r * 1.7);
  ctx.closePath();
}

// ---------------------------------------------------------------------------------------
// Faces: eyes, mouths, blush and the little mood marks

function eyeDot(ctx, x, y, r, open = 1) {
  if (open < 0.3) {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.85, y);
    ctx.quadraticCurveTo(x, y + r * 0.55, x + r * 0.85, y);
    stroke(ctx, Math.max(LW * 1.1, r * 0.32));
    return;
  }
  ell(ctx, x, y, r * 0.8, r * open);
  fill(ctx, INK);
  circ(ctx, x - r * 0.24, y - r * 0.36 * open, r * 0.32);
  fill(ctx, WHITE);
  circ(ctx, x + r * 0.3, y + r * 0.36 * open, r * 0.13);
  fill(ctx, WHITE);
}

/** Big glossy eyes (the seal): two highlights and a cool lower shine. */
function eyeWet(ctx, x, y, r, open = 1) {
  if (open < 0.3) return eyeDot(ctx, x, y, r, open);
  ell(ctx, x, y, r * 0.84, r * open);
  fill(ctx, INK);
  ell(ctx, x + r * 0.05, y + r * 0.42 * open, r * 0.5, r * 0.22 * open);
  fill(ctx, 'rgba(150,190,230,0.55)');
  circ(ctx, x - r * 0.26, y - r * 0.34 * open, r * 0.34);
  fill(ctx, WHITE);
  circ(ctx, x + r * 0.32, y - r * 0.05 * open, r * 0.14);
  fill(ctx, WHITE);
}

function eyeSparkle(ctx, x, y, r) {
  ell(ctx, x, y, r * 0.9, r * 1.1);
  fill(ctx, INK);
  circ(ctx, x - r * 0.22, y - r * 0.32, r * 0.42);
  fill(ctx, WHITE);
  star4(ctx, x + r * 0.32, y + r * 0.38, r * 0.34);
  fill(ctx, WHITE);
}

function eyeHappy(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x - r * 0.85, y + r * 0.35);
  ctx.quadraticCurveTo(x, y - r * 0.95, x + r * 0.85, y + r * 0.35);
  stroke(ctx, Math.max(LW * 1.15, r * 0.36));
}

function eyeSleep(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x - r * 0.85, y - r * 0.15);
  ctx.quadraticCurveTo(x, y + r * 0.75, x + r * 0.85, y - r * 0.15);
  stroke(ctx, Math.max(LW * 1.1, r * 0.34));
}

function eyeHeart(ctx, x, y, r) {
  heartPath(ctx, x, y, r * 1.05);
  fill(ctx, '#ec4660');
  stroke(ctx, LW * 0.8);
  circ(ctx, x - r * 0.42, y - r * 0.32, r * 0.2);
  fill(ctx, 'rgba(255,255,255,0.85)');
}

function eyeAngry(ctx, x, y, r, side) {
  ctx.beginPath();
  ctx.moveTo(x - r * 0.85, y - r * 0.2 + side * r * 0.2);
  ctx.lineTo(x + r * 0.85, y - r * 0.2 - side * r * 0.2);
  ctx.quadraticCurveTo(x + r * 0.7, y + r * 0.85, x, y + r * 0.8);
  ctx.quadraticCurveTo(x - r * 0.7, y + r * 0.85, x - r * 0.85, y - r * 0.2 + side * r * 0.2);
  ctx.closePath();
  fill(ctx, INK);
  circ(ctx, x - r * 0.15, y + r * 0.25, r * 0.2);
  fill(ctx, WHITE);
}

function blush(ctx, x, y, rx, ry, c = BLUSH) {
  ell(ctx, x, y, rx, ry);
  fill(ctx, c);
}

function mouthW(ctx, x, y, w) {
  ctx.beginPath();
  ctx.moveTo(x - w, y - w * 0.3);
  ctx.quadraticCurveTo(x - w * 0.5, y + w * 0.6, x, y - w * 0.12);
  ctx.quadraticCurveTo(x + w * 0.5, y + w * 0.6, x + w, y - w * 0.3);
  stroke(ctx, LW * 0.9);
}

function mouthSmile(ctx, x, y, w) {
  ctx.beginPath();
  ctx.moveTo(x - w, y - w * 0.2);
  ctx.quadraticCurveTo(x, y + w * 0.75, x + w, y - w * 0.2);
  stroke(ctx, LW * 0.95);
}

function mouthOpen(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x, y + h * 2, x + w, y);
  ctx.closePath();
  fill(ctx, MOUTH);
  ell(ctx, x, y + h * 0.72, w * 0.5, h * 0.28);
  fill(ctx, TONGUE);
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x, y + h * 2, x + w, y);
  ctx.closePath();
  stroke(ctx, LW * 0.9);
}

function mouthO(ctx, x, y, r) {
  ell(ctx, x, y, r * 0.8, r);
  fill(ctx, MOUTH);
  stroke(ctx, LW * 0.85);
}

function mouthFrown(ctx, x, y, w) {
  ctx.beginPath();
  ctx.moveTo(x - w, y + w * 0.35);
  ctx.quadraticCurveTo(x, y - w * 0.55, x + w, y + w * 0.35);
  stroke(ctx, LW * 1.05);
}

function mouthWobble(ctx, x, y, w) {
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const x0 = x - w + (2 * w * i) / n;
    ctx.quadraticCurveTo(x0 + w / n, y + (i % 2 ? w : -w) * 0.38, x0 + (2 * w) / n, y);
  }
  stroke(ctx, LW * 0.9);
}

function mouthChew(ctx, x, y, w, t) {
  const c = 0.5 + 0.5 * Math.sin(t * 14);
  ell(ctx, x, y + w * 0.1, w * (0.5 + 0.25 * c), w * (0.1 + 0.32 * c));
  fill(ctx, MOUTH);
  stroke(ctx, LW * 0.85);
}

function sweat(ctx, x, y, r) {
  dropPath(ctx, x, y, r);
  fill(ctx, '#cfeeff');
  stroke(ctx, LW * 0.8);
  ell(ctx, x - r * 0.35, y + r * 0.05, r * 0.2, r * 0.32);
  fill(ctx, 'rgba(255,255,255,0.9)');
}

/** Anger vein: the four little red brackets. */
function vein(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i * (Math.PI / 2) + Math.PI / 4;
    const cx = x + Math.cos(a) * r * 0.75;
    const cy = y + Math.sin(a) * r * 0.75;
    ctx.moveTo(cx + Math.cos(a + 1.2) * r * 0.55, cy + Math.sin(a + 1.2) * r * 0.55);
    ctx.quadraticCurveTo(cx - Math.cos(a) * r * 0.25, cy - Math.sin(a) * r * 0.25,
      cx + Math.cos(a - 1.2) * r * 0.55, cy + Math.sin(a - 1.2) * r * 0.55);
  }
  stroke(ctx, LW * 2.6, INK);
  stroke(ctx, LW * 1.3, '#ef3b3b');
}

function steamPuffs(ctx, x, y, t) {
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.9 + i / 3) % 1;
    const a = 0.9 * (1 - p);
    const r = 0.035 + 0.045 * p;
    circ(ctx, x + p * 0.1, y - p * 0.16, r);
    fill(ctx, alpha('#ffffff', a));
    stroke(ctx, LW * 0.8, alpha('#2a2233', a * 0.75));
  }
}

function floatHeart(ctx, x, y, t, r = 0.07) {
  const p = (t * 0.55) % 1;
  const a = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
  heartPath(ctx, x + Math.sin(p * 6) * 0.02, y - p * 0.16, r * (0.8 + 0.3 * p));
  fill(ctx, alpha('#ff6f8b', a));
  stroke(ctx, LW * 0.8, alpha('#2a2233', a * 0.85));
}

function sparkles(ctx, x, y, t, r = 0.05) {
  for (let i = 0; i < 2; i++) {
    const p = (t * 1.6 + i * 0.5) % 1;
    const k = Math.sin(p * Math.PI);
    star4(ctx, x + (i ? 0.1 : -0.02), y + (i ? 0.08 : 0), r * k * (i ? 0.7 : 1));
    fill(ctx, '#fff6c2');
    stroke(ctx, LW * 0.6);
  }
}

function whiskers(ctx, x, y, side, len, spread, w, col = 'rgba(42,34,51,0.7)') {
  ctx.beginPath();
  for (let k = -1; k <= 1; k++) {
    ctx.moveTo(x, y + k * spread * 0.4);
    ctx.quadraticCurveTo(x + side * len * 0.5, y + k * spread * 0.6 - 0.008,
      x + side * len, y + k * spread + 0.004);
  }
  stroke(ctx, w, col);
}

// ---------------------------------------------------------------------------------------
// The otters

const OTTER = {
  pebble: {
    fur: '#8a5a3c', furDark: dark('#8a5a3c', 0.32), face: '#f1dcc0', muzzle: '#fbf0e0',
    band: '#24335a', bandHi: '#5a6ea8', paw: '#5f3d29', seed: 0,
  },
  kelp: {
    fur: '#b98454', furDark: dark('#b98454', 0.3), face: '#f6e6cc', muzzle: '#fff7ea',
    band: '#3f7d4a', bandHi: '#86c27a', paw: '#7e5331', seed: 1.7,
  },
};

function otterTail(ctx, P, d, t, walking) {
  const sw = walking ? Math.sin(t * 10) * 0.05 : Math.sin(t * 1.8 + P.seed) * 0.025;
  taper(ctx, d * 0.1, -0.14, d * 0.36, -0.08, d * 0.52, -0.16 + sw * 0.5, d * 0.5, -0.36 + sw,
    0.19, 0.085);
  fill(ctx, P.furDark);
  stroke(ctx);
  taper(ctx, d * 0.16, -0.16, d * 0.34, -0.12, d * 0.46, -0.2 + sw * 0.5, d * 0.46, -0.32 + sw,
    0.06, 0.03);
  fill(ctx, alpha('#ffffff', 0.16));
}

function otterFeet(ctx, P, t, walking) {
  for (const side of [-1, 1]) {
    const lift = walking ? Math.max(0, Math.sin(t * 10) * side) * 0.06 : 0;
    const fx = side * 0.13;
    const fy = -0.035 - lift;
    ell(ctx, fx, fy, 0.105, 0.055);
    fillStroke(ctx, P.paw);
    ctx.beginPath();
    ctx.moveTo(fx - 0.03, fy + 0.012);
    ctx.lineTo(fx - 0.03, fy + 0.04);
    ctx.moveTo(fx + 0.03, fy + 0.012);
    ctx.lineTo(fx + 0.03, fy + 0.04);
    stroke(ctx, LW * 0.6, 'rgba(42,34,51,0.5)');
    ell(ctx, fx - 0.03, fy - 0.022, 0.035, 0.012);
    fill(ctx, 'rgba(255,255,255,0.25)');
  }
}

function otterApron(ctx, P) {
  const trim = P.band;
  ctx.beginPath();
  ctx.moveTo(-0.13, -0.5);
  ctx.lineTo(0.13, -0.5);
  ctx.quadraticCurveTo(0.205, -0.36, 0.2, -0.21);
  ctx.bezierCurveTo(0.2, -0.07, -0.2, -0.07, -0.2, -0.21);
  ctx.quadraticCurveTo(-0.205, -0.36, -0.13, -0.5);
  ctx.closePath();
  fill(ctx, '#fffaf1');
  stroke(ctx, LW * 0.85);
  // Shade down the right side of the apron.
  ctx.beginPath();
  ctx.moveTo(0.16, -0.42);
  ctx.quadraticCurveTo(0.2, -0.32, 0.195, -0.21);
  ctx.bezierCurveTo(0.19, -0.13, 0.12, -0.1, 0.07, -0.095);
  ctx.quadraticCurveTo(0.16, -0.2, 0.16, -0.42);
  fill(ctx, 'rgba(120,100,140,0.16)');
  // Bib trim and hem trim.
  ctx.beginPath();
  ctx.moveTo(-0.13, -0.5);
  ctx.lineTo(0.13, -0.5);
  ctx.lineTo(0.148, -0.458);
  ctx.lineTo(-0.148, -0.458);
  ctx.closePath();
  fillStroke(ctx, trim, LW * 0.7);
  ctx.beginPath();
  ctx.moveTo(-0.18, -0.17);
  ctx.bezierCurveTo(-0.17, -0.105, 0.17, -0.105, 0.18, -0.17);
  stroke(ctx, LW * 1.2, trim);
  // Pocket.
  rrect(ctx, -0.07, -0.33, 0.14, 0.09, 0.03);
  fill(ctx, '#f4ece0');
  stroke(ctx, LW * 0.6);
  line(ctx, -0.055, -0.315, 0.055, -0.315);
  stroke(ctx, LW * 0.9, trim);
}

function otterArm(ctx, P, sx, sy, px, py, cx, cy) {
  limb(ctx, sx, sy, px, py, 0.1, P.fur, cx, cy);
  circ(ctx, px, py, 0.05);
  fillStroke(ctx, P.paw);
  circ(ctx, px - 0.016, py - 0.018, 0.014);
  fill(ctx, 'rgba(255,255,255,0.3)');
}

function knife(ctx, px, py, f) {
  ctx.beginPath();
  ctx.moveTo(px - f * 0.02, py + 0.03);
  ctx.lineTo(px + f * 0.05, py + 0.03);
  ctx.lineTo(px + f * 0.06, py + 0.2);
  ctx.quadraticCurveTo(px - f * 0.01, py + 0.18, px - f * 0.02, py + 0.11);
  ctx.closePath();
  fill(ctx, '#eef3f8');
  stroke(ctx, LW * 0.85);
  line(ctx, px + f * 0.038, py + 0.05, px + f * 0.044, py + 0.17);
  stroke(ctx, LW * 0.8, '#a9b6c6');
}

function spoon(ctx, px, py, f) {
  limb(ctx, px, py, px + f * 0.05, py + 0.17, 0.025, '#c98a4a');
  ell(ctx, px + f * 0.055, py + 0.19, 0.035, 0.025, f * 0.3);
  fillStroke(ctx, '#d99a5a', LW * 0.8);
}

function otterHead(ctx, P, t, f, mood) {
  const fx = f * 0.035;
  const hy = -0.79;
  const tw = twitch(t, P.seed + 0.4, 3.3, 0.3);
  // Ears behind the head.
  for (const side of [-1, 1]) {
    const ey = -0.995 + (side === -f ? -0.025 * tw : 0);
    circ(ctx, side * 0.235, ey, 0.072);
    fillStroke(ctx, P.fur);
    circ(ctx, side * 0.235, ey + 0.008, 0.036);
    fill(ctx, P.furDark);
  }
  // Fluffy cheeks peeking out at the sides.
  for (const side of [-1, 1]) {
    circ(ctx, side * 0.285, -0.715, 0.06);
    fillStroke(ctx, P.fur);
  }
  ball(ctx, 0, hy, 0.31, 0.29, P.fur, P.furDark, 'rgba(255,255,255,0.3)');
  // The cream face of a sea otter.
  ell(ctx, fx, -0.735, 0.245, 0.185);
  fill(ctx, P.face);
  ell(ctx, fx * 1.2, -0.84, 0.2, 0.1);
  fill(ctx, P.face);
  // Headband (hachimaki) round the forehead, knotted at the back side.
  ctx.beginPath();
  ctx.moveTo(-0.258, -0.945);
  ctx.quadraticCurveTo(0, -1.04, 0.258, -0.945);
  ctx.lineTo(0.294, -0.872);
  ctx.quadraticCurveTo(0, -0.96, -0.294, -0.872);
  ctx.closePath();
  fillStroke(ctx, P.band);
  ctx.beginPath();
  ctx.moveTo(-0.2, -0.95);
  ctx.quadraticCurveTo(0, -1.01, 0.2, -0.95);
  stroke(ctx, LW * 0.8, P.bandHi);
  for (const k of [-0.12, 0, 0.12]) {
    circ(ctx, k + fx * 0.5, -0.925 - (0.012 - Math.abs(k) * 0.08), 0.012);
    fill(ctx, 'rgba(255,255,255,0.75)');
  }
  const d = -f;
  const sw = Math.sin(t * 5 + P.seed) * 0.02;
  ribbonTail(ctx, d * 0.28, -0.935, d * 0.15, -0.075 + sw, 0.07, -d * 0.02);
  fillStroke(ctx, P.band, LW * 0.85);
  ribbonTail(ctx, d * 0.28, -0.91, d * 0.13, 0.07 - sw, 0.07, d * 0.02);
  fillStroke(ctx, P.band, LW * 0.85);
  circ(ctx, d * 0.28, -0.922, 0.042);
  fillStroke(ctx, P.band, LW * 0.85);
  ell(ctx, d * 0.268, -0.936, 0.016, 0.01);
  fill(ctx, P.bandHi);

  // Eyes.
  const ex = 0.118;
  const ey = -0.825;
  const er = 0.06;
  const open = blinkOpen(t, P.seed);
  if (mood === 'happy') {
    eyeHappy(ctx, fx - ex, ey, er);
    eyeHappy(ctx, fx + ex, ey, er);
  } else if (mood === 'wave') {
    eyeSparkle(ctx, fx - ex, ey, er);
    eyeSparkle(ctx, fx + ex, ey, er);
  } else if (mood === 'oops') {
    eyeDot(ctx, fx - ex, ey, er * 1.05, 1);
    eyeDot(ctx, fx + ex, ey, er * 1.05, 1);
  } else {
    eyeDot(ctx, fx - ex, ey, er, open);
    eyeDot(ctx, fx + ex, ey, er, open);
  }
  // Blush.
  blush(ctx, fx - 0.19, -0.742, 0.05, 0.03, mood === 'happy' || mood === 'wave' ? BLUSH_HOT : BLUSH);
  blush(ctx, fx + 0.19, -0.742, 0.05, 0.03, mood === 'happy' || mood === 'wave' ? BLUSH_HOT : BLUSH);
  // Muzzle pads, whiskers, nose, mouth.
  ell(ctx, fx - 0.053, -0.718, 0.066, 0.052);
  fill(ctx, P.muzzle);
  ell(ctx, fx + 0.053, -0.718, 0.066, 0.052);
  fill(ctx, P.muzzle);
  const wt = twitch(t, P.seed + 2.2, 2.3, 0.3) * Math.sin(t * 40) * 0.012;
  whiskers(ctx, fx - 0.1, -0.725 + wt, -1, 0.24, 0.05, LW * 0.5);
  whiskers(ctx, fx + 0.1, -0.725 - wt, 1, 0.24, 0.05, LW * 0.5);
  ctx.beginPath();
  ctx.moveTo(fx - 0.05, -0.787);
  ctx.quadraticCurveTo(fx, -0.802, fx + 0.05, -0.787);
  ctx.quadraticCurveTo(fx + 0.045, -0.762, fx, -0.737);
  ctx.quadraticCurveTo(fx - 0.045, -0.762, fx - 0.05, -0.787);
  ctx.closePath();
  fill(ctx, '#33242a');
  ell(ctx, fx - 0.016, -0.781, 0.016, 0.008);
  fill(ctx, 'rgba(255,255,255,0.75)');
  line(ctx, fx, -0.737, fx, -0.716);
  stroke(ctx, LW * 0.8);
  if (mood === 'happy' || mood === 'wave') {
    ctx.beginPath();
    ctx.moveTo(fx - 0.058, -0.712);
    ctx.quadraticCurveTo(fx, -0.6, fx + 0.058, -0.712);
    ctx.closePath();
    fill(ctx, MOUTH);
    ell(ctx, fx, -0.67, 0.028, 0.017);
    fill(ctx, TONGUE);
    ctx.beginPath();
    ctx.moveTo(fx - 0.058, -0.712);
    ctx.quadraticCurveTo(fx, -0.6, fx + 0.058, -0.712);
    ctx.closePath();
    stroke(ctx, LW * 0.85);
  } else if (mood === 'oops') {
    mouthWobble(ctx, fx, -0.685, 0.055);
  } else {
    mouthW(ctx, fx, -0.705, 0.058);
  }
  if (mood === 'oops') sweat(ctx, f * 0.31, -0.93 + Math.sin(t * 6) * 0.01, 0.035);
}

/**
 * One otter chef, front-facing. (x, y) is the floor point between its feet; it fits in a
 * box about s wide and 1.2 s tall above that point.
 * o: { who: 'pebble'|'kelp', t, walk, facing: -1|1, work: null|'chop'|'stir', holding,
 *      mood: 'idle'|'happy'|'oops'|'wave', selected }
 * Returns { hx, hy }: where to draw the held item (about 0.55 s wide), in front of the chest.
 */
export function drawOtter(ctx, x, y, s, o = {}) {
  const P = OTTER[o.who] || OTTER.pebble;
  const t = o.t || 0;
  const f = o.facing === -1 ? -1 : 1;
  const walking = !!o.walk;
  const mood = o.mood || 'idle';
  const work = o.work || null;
  const ph = t * 10;
  const bob = walking ? -0.05 * Math.abs(Math.sin(ph)) : -0.006 * (1 + Math.sin(t * 2.4 + P.seed));
  const tilt = walking ? 0.07 * Math.sin(ph) : 0;
  const hx = f * 0.02;
  const hy = -0.5;
  begin(ctx, x, y, s);
  try {
    if (o.selected) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      ell(ctx, 0, 0, 0.5, 0.16);
      fill(ctx, alpha(P.band, 0.3));
      stroke(ctx, LW * 2, P.band);
      ell(ctx, 0, 0, 0.36 + 0.06 * pulse, 0.11 + 0.02 * pulse);
      stroke(ctx, LW * 1.2, 'rgba(255,255,255,0.6)');
    }
    ell(ctx, 0, 0, 0.32 - (walking ? 0.05 * Math.abs(Math.sin(ph)) : 0), 0.075);
    fill(ctx, SHADOW);
    ctx.translate(0, bob);
    ctx.rotate(tilt);

    otterTail(ctx, P, -f, t, walking);
    otterFeet(ctx, P, t, walking);
    const breathe = 1 + 0.012 * Math.sin(t * 2.4 + P.seed);
    ball(ctx, 0, -0.33, 0.3, 0.31 * breathe, P.fur, P.furDark, 'rgba(255,255,255,0.22)');
    otterApron(ctx, P);

    // Arms: work, then holding, then a wave, else paws resting on the tummy.
    if (work === 'chop') {
      const c = 0.5 + 0.5 * Math.sin(t * 18);
      const kx = f * 0.215;
      const ky = -0.32 - 0.14 * c;
      otterArm(ctx, P, -f * 0.2, -0.5, -f * 0.12, -0.3);
      knife(ctx, kx, ky, f);
      otterArm(ctx, P, f * 0.2, -0.52, kx, ky, f * 0.27, -0.44);
    } else if (work === 'stir') {
      const a = t * 8;
      const cx = f * 0.04 + 0.05 * Math.cos(a);
      const cy = -0.36 + 0.03 * Math.sin(a);
      spoon(ctx, cx + f * 0.05, cy, f);
      otterArm(ctx, P, -0.2, -0.5, cx - 0.06, cy + 0.01);
      otterArm(ctx, P, 0.2, -0.5, cx + 0.06, cy - 0.01);
    } else if (o.holding) {
      otterArm(ctx, P, -0.19, -0.55, -0.27, -0.47);
      otterArm(ctx, P, 0.19, -0.55, 0.27, -0.47);
    } else if (mood === 'wave') {
      const w = Math.sin(t * 9);
      otterArm(ctx, P, -f * 0.2, -0.5, -f * 0.12, -0.33);
      otterArm(ctx, P, f * 0.22, -0.55, f * (0.44 + 0.035 * w), -0.84 + 0.015 * Math.abs(w),
        f * 0.43, -0.6);
    } else {
      const b = 0.006 * Math.sin(t * 2.4 + P.seed);
      otterArm(ctx, P, -0.21, -0.5, -0.12, -0.33 + b);
      otterArm(ctx, P, 0.21, -0.5, 0.12, -0.33 + b);
    }
    otterHead(ctx, P, t, f, mood);
  } finally {
    end(ctx);
  }
  const c = Math.cos(tilt);
  const sn = Math.sin(tilt);
  return { hx: x + (hx * c - hy * sn) * s, hy: y + (hx * sn + hy * c + bob) * s };
}

// ---------------------------------------------------------------------------------------
// Closing time: the otters float on their backs, holding paws

/** World position of a point (lx, ly) in a floater's frame at (cx, cy) turned by a. */
function toWorld(cx, cy, a, lx, ly) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [cx + lx * c - ly * s, cy + lx * s + ly * c];
}

/** One otter on its back, seen from above, upright in its own frame (head up). */
function floater(ctx, P, d, pebble) {
  // Water lapping round the body.
  ell(ctx, 0, -0.04, 0.29, 0.42);
  stroke(ctx, 0.07, 'rgba(255,255,255,0.1)');
  // Tail and hind feet poking out below.
  ell(ctx, 0, 0.37, 0.075, 0.12);
  fillStroke(ctx, P.furDark);
  for (const side of [-1, 1]) {
    ell(ctx, side * 0.13, 0.31, 0.068, 0.088, side * 0.45);
    fillStroke(ctx, P.paw);
    ctx.beginPath();
    ctx.moveTo(side * 0.115, 0.34);
    ctx.lineTo(side * 0.14, 0.38);
    ctx.moveTo(side * 0.15, 0.33);
    ctx.lineTo(side * 0.18, 0.36);
    stroke(ctx, LW * 0.6, 'rgba(42,34,51,0.45)');
  }
  // Body and a lighter tummy.
  ball(ctx, 0, 0.05, 0.245, 0.3, P.fur, P.furDark, 'rgba(255,255,255,0.25)');
  ell(ctx, 0.01, 0.1, 0.16, 0.19);
  fill(ctx, lite(P.fur, 0.22));
  // Ears and head.
  for (const side of [-1, 1]) {
    circ(ctx, side * 0.165, -0.49, 0.055);
    fillStroke(ctx, P.fur);
    circ(ctx, side * 0.165, -0.485, 0.027);
    fill(ctx, P.furDark);
  }
  ball(ctx, 0, -0.32, 0.235, 0.215, P.fur, P.furDark, 'rgba(255,255,255,0.3)');
  ell(ctx, 0, -0.28, 0.185, 0.14);
  fill(ctx, P.face);
  ell(ctx, 0, -0.355, 0.15, 0.08);
  fill(ctx, P.face);
  // Headband, knotted on the outer side.
  ctx.beginPath();
  ctx.moveTo(-0.196, -0.43);
  ctx.quadraticCurveTo(0, -0.505, 0.196, -0.43);
  ctx.lineTo(0.222, -0.375);
  ctx.quadraticCurveTo(0, -0.445, -0.222, -0.375);
  ctx.closePath();
  fillStroke(ctx, P.band, LW * 0.9);
  ribbonTail(ctx, d * 0.215, -0.405, d * 0.1, -0.06, 0.05, -d * 0.015);
  fillStroke(ctx, P.band, LW * 0.8);
  ribbonTail(ctx, d * 0.215, -0.395, d * 0.09, 0.06, 0.05, d * 0.015);
  fillStroke(ctx, P.band, LW * 0.8);
  circ(ctx, d * 0.215, -0.4, 0.03);
  fillStroke(ctx, P.band, LW * 0.8);
  // Content face: closed eyes, blush, muzzle, smile.
  eyeSleep(ctx, -0.085, -0.335, 0.048);
  eyeSleep(ctx, 0.085, -0.335, 0.048);
  blush(ctx, -0.145, -0.275, 0.042, 0.025, BLUSH_HOT);
  blush(ctx, 0.145, -0.275, 0.042, 0.025, BLUSH_HOT);
  ell(ctx, -0.038, -0.255, 0.05, 0.04);
  fill(ctx, P.muzzle);
  ell(ctx, 0.038, -0.255, 0.05, 0.04);
  fill(ctx, P.muzzle);
  whiskers(ctx, -0.08, -0.26, -1, 0.17, 0.035, LW * 0.45);
  whiskers(ctx, 0.08, -0.26, 1, 0.17, 0.035, LW * 0.45);
  ctx.beginPath();
  ctx.moveTo(-0.037, -0.3);
  ctx.quadraticCurveTo(0, -0.312, 0.037, -0.3);
  ctx.quadraticCurveTo(0.032, -0.28, 0, -0.264);
  ctx.quadraticCurveTo(-0.032, -0.28, -0.037, -0.3);
  ctx.closePath();
  fill(ctx, '#33242a');
  mouthW(ctx, 0, -0.242, 0.045);
  // The outer paw rests on the tummy; Pebble keeps her pebble there.
  if (pebble) {
    ell(ctx, -d * 0.04, 0.05, 0.085, 0.06, 0.2);
    fillStroke(ctx, '#aaa5b8');
    ell(ctx, -d * 0.04 - 0.025, 0.03, 0.032, 0.015, 0.2);
    fill(ctx, 'rgba(255,255,255,0.65)');
  }
  otterArm(ctx, P, d * 0.2, -0.1, d * 0.08, 0.1, d * 0.18, 0.06);
}

/**
 * Closing time: Pebble and Kelp float on their backs in the harbour, holding paws, eyes
 * closed, heads leaning together. (x, y) is the centre; it fits about 2.4 s wide and 1 s
 * tall (the ripples take the width). Otters and ripples only (no sea or moon).
 */
export function drawFloatingOtters(ctx, x, y, s, t = 0) {
  begin(ctx, x, y, s);
  try {
    const bA = Math.sin(t * 1.5) * 0.02;
    const bB = Math.sin(t * 1.5 + 1.3) * 0.02;
    const rA = Math.sin(t * 1.1) * 0.04;
    const rB = Math.sin(t * 1.1 + 2) * 0.04;
    // Ripple rings spreading round the pair.
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.25 + i / 3) % 1;
      ell(ctx, 0, 0.1, 0.72 + 0.46 * p, 0.3 + 0.14 * p);
      stroke(ctx, LW * 1.2, alpha('#ffffff', 0.4 * (1 - p) * Math.min(1, p * 5)));
    }
    // Glints on the water.
    for (const [gx, gy, k] of [[-0.95, -0.05, 0], [0.9, 0.26, 1.7], [-0.75, 0.36, 3.1], [1.0, -0.12, 4.4]]) {
      const a = 0.5 + 0.5 * Math.sin(t * 2.2 + k);
      line(ctx, gx - 0.05, gy, gx + 0.05, gy);
      stroke(ctx, LW * 1.2, alpha('#ffffff', 0.25 + 0.5 * a));
    }
    const A = { cx: -0.34, cy: 0.04 + bA, a: 0.32 + rA };
    const B = { cx: 0.34, cy: 0.04 + bB, a: -0.32 - rB };
    for (const [P, d, F, peb] of [[OTTER.pebble, -1, A, true], [OTTER.kelp, 1, B, false]]) {
      ctx.save();
      ctx.translate(F.cx, F.cy);
      ctx.rotate(F.a);
      floater(ctx, P, d, peb);
      ctx.restore();
    }
    // Holding paws between them, under their chins.
    const jy = 0.0 + (bA + bB) / 2;
    const [ax, ay] = toWorld(A.cx, A.cy, A.a, 0.2, -0.1);
    const [bx, by] = toWorld(B.cx, B.cy, B.a, -0.2, -0.1);
    otterArm(ctx, OTTER.pebble, ax, ay, -0.03, jy, (ax - 0.03) / 2, jy + 0.06);
    otterArm(ctx, OTTER.kelp, bx, by, 0.03, jy + 0.01, (bx + 0.03) / 2, jy + 0.07);
    // A little heart drifts up from their paws now and then.
    const p = (t * 0.3) % 1;
    if (p < 0.6) {
      const a = p < 0.1 ? p / 0.1 : 1 - (p - 0.1) / 0.5;
      heartPath(ctx, Math.sin(p * 9) * 0.03, -0.12 - p * 0.55, 0.05 + p * 0.03);
      fill(ctx, alpha('#ff7a92', a));
      stroke(ctx, LW * 0.8, alpha('#2a2233', a * 0.8));
    }
  } finally {
    end(ctx);
  }
}

// ---------------------------------------------------------------------------------------
// Customers: busts seated at the bar. Each species draws its body and head and returns a
// face spec; face() draws the eyes, mouth and mood marks from it.

function bustBody(ctx, w, h, col, dk, y0 = 0.08) {
  ctx.beginPath();
  ctx.ellipse(0, y0, w, h, 0, Math.PI, TAU);
  ctx.closePath();
  fill(ctx, dk);
  ctx.beginPath();
  ctx.ellipse(-w * 0.07, y0, w * 0.88, h * 0.93, 0, Math.PI, TAU);
  ctx.closePath();
  fill(ctx, col);
  ctx.beginPath();
  ctx.ellipse(0, y0, w, h, 0, Math.PI, TAU);
  ctx.closePath();
  stroke(ctx);
}

function flipper(ctx, x, y, rx, ry, rot, col) {
  ell(ctx, x, y, rx, ry, rot);
  fillStroke(ctx, col);
}

function seal(ctx) {
  const G = '#9aa6b2';
  const GD = '#76839a';
  flipper(ctx, -0.33, -0.08, 0.075, 0.15, 0.55, GD);
  flipper(ctx, 0.33, -0.08, 0.075, 0.15, -0.55, GD);
  bustBody(ctx, 0.35, 0.42, G, GD);
  ctx.beginPath();
  ctx.ellipse(0, 0.08, 0.19, 0.3, 0, Math.PI, TAU);
  ctx.closePath();
  fill(ctx, '#bcc6cf');
  ball(ctx, 0, -0.56, 0.31, 0.27, G, GD);
  ctx.fillStyle = 'rgba(80,92,112,0.55)';
  for (const [sx, sy, r] of [[-0.2, -0.7, 0.035], [-0.1, -0.78, 0.022], [0.16, -0.74, 0.03],
    [0.24, -0.6, 0.022], [-0.25, -0.55, 0.02], [0.05, -0.8, 0.016]]) {
    circ(ctx, sx, sy, r);
    ctx.fill();
  }
  ell(ctx, -0.062, -0.468, 0.078, 0.06);
  fill(ctx, '#e0e6ec');
  ell(ctx, 0.062, -0.468, 0.078, 0.06);
  fill(ctx, '#e0e6ec');
  ctx.fillStyle = 'rgba(42,34,51,0.45)';
  for (const [dx, dy] of [[0.035, -0.47], [0.075, -0.455], [0.06, -0.49]]) {
    circ(ctx, dx, dy, 0.008); ctx.fill();
    circ(ctx, -dx, dy, 0.008); ctx.fill();
  }
  whiskers(ctx, -0.12, -0.465, -1, 0.26, 0.06, LW * 0.5);
  whiskers(ctx, 0.12, -0.465, 1, 0.26, 0.06, LW * 0.5);
  ctx.beginPath();
  ctx.moveTo(-0.045, -0.53);
  ctx.quadraticCurveTo(0, -0.545, 0.045, -0.53);
  ctx.quadraticCurveTo(0.04, -0.505, 0, -0.49);
  ctx.quadraticCurveTo(-0.04, -0.505, -0.045, -0.53);
  ctx.closePath();
  fill(ctx, '#2e2a36');
  return {
    eyes: [-0.135, -0.6, 0.135, -0.6], er: 0.075, wet: true, mx: 0, my: -0.415, mw: 0.05,
    mouth: 'w', cheeks: [-0.215, -0.5, 0.215, -0.5], face: G, hw: 0.31, top: -0.83,
  };
}

function penguin(ctx, t, mood) {
  const K = '#2f3550';
  const KD = '#1d2033';
  const flap = mood === 'eager' || mood === 'happy' || mood === 'love' ? Math.sin(t * 16) * 0.22 : 0;
  flipper(ctx, -0.29, -0.16, 0.07, 0.2, 0.45 + flap, K);
  flipper(ctx, 0.29, -0.16, 0.07, 0.2, -0.45 - flap, K);
  bustBody(ctx, 0.3, 0.52, K, KD);
  ctx.beginPath();
  ctx.ellipse(0, 0.08, 0.205, 0.38, 0, Math.PI, TAU);
  ctx.closePath();
  fill(ctx, '#f8f8fd');
  ball(ctx, 0, -0.6, 0.28, 0.27, K, KD, 'rgba(170,200,255,0.4)');
  // Rim light so the dark head reads on a dark sky.
  ctx.beginPath();
  ctx.ellipse(0, -0.6, 0.255, 0.245, 0, Math.PI * 1.05, Math.PI * 1.45);
  stroke(ctx, LW * 1.1, 'rgba(160,190,255,0.55)');
  // A little tuft on top.
  ctx.beginPath();
  ctx.moveTo(-0.02, -0.86);
  ctx.quadraticCurveTo(-0.07, -0.95, -0.02, -0.97);
  ctx.moveTo(0.01, -0.865);
  ctx.quadraticCurveTo(0.03, -0.96, 0.08, -0.95);
  stroke(ctx, LW * 1.8, K);
  // White face: two lobes, like a heart.
  ctx.beginPath();
  ctx.ellipse(-0.085, -0.585, 0.12, 0.145, 0.25, 0, TAU);
  ctx.ellipse(0.085, -0.585, 0.12, 0.145, -0.25, 0, TAU);
  fill(ctx, '#ffffff');
  // Beak.
  const open = mood === 'eager' || mood === 'happy' || mood === 'love' ? 1 :
    mood === 'eating' ? 0.5 + 0.5 * Math.sin(t * 14) : 0;
  if (open > 0.05) {
    ell(ctx, 0, -0.5 + 0.018 * open, 0.04, 0.03 * open + 0.01);
    fill(ctx, MOUTH);
  }
  ctx.beginPath();
  ctx.moveTo(-0.05, -0.47 + 0.035 * open);
  ctx.quadraticCurveTo(0, -0.44 + 0.04 * open, 0.05, -0.47 + 0.035 * open);
  ctx.quadraticCurveTo(0, -0.48 + 0.035 * open, -0.05, -0.47 + 0.035 * open);
  ctx.closePath();
  fillStroke(ctx, '#e07a1f', LW * 0.8);
  ctx.beginPath();
  ctx.moveTo(-0.06, -0.525);
  ctx.quadraticCurveTo(0, -0.55, 0.06, -0.525);
  ctx.quadraticCurveTo(0.035, -0.48, 0, -0.465);
  ctx.quadraticCurveTo(-0.035, -0.48, -0.06, -0.525);
  ctx.closePath();
  fillStroke(ctx, '#f6a531', LW * 0.85);
  ell(ctx, -0.02, -0.522, 0.018, 0.008);
  fill(ctx, 'rgba(255,255,255,0.7)');
  if (mood === 'leaving') {
    ctx.beginPath();
    ctx.moveTo(-0.04, -0.455);
    ctx.quadraticCurveTo(0, -0.475, 0.04, -0.455);
    stroke(ctx, LW * 0.8);
  }
  return {
    eyes: [-0.1, -0.6, 0.1, -0.6], er: 0.055, mx: 0, my: -0.45, mw: 0.04, mouth: 'none',
    cheeks: [-0.155, -0.53, 0.155, -0.53], face: '#ffffff', hw: 0.28, top: -0.87,
  };
}

function crabClaw(ctx, side, t, mood) {
  const clap = mood === 'happy' || mood === 'love' ? Math.abs(Math.sin(t * 9)) : 0;
  const snap = mood === 'eager' ? 0.5 + 0.5 * Math.sin(t * 16) :
    mood === 'cross' || mood === 'leaving' ? 0.25 + 0.25 * Math.sin(t * 6) : 0.35;
  const R = '#e0523e';
  const cx = side * (0.42 - clap * 0.17);
  const cy = -0.5 - clap * 0.04;
  limb(ctx, side * 0.28, -0.3, cx, cy + 0.06, 0.07, R, side * 0.42, -0.26);
  const open = 0.15 + snap * 0.45;
  union(ctx, [
    (c) => ell(c, cx, cy, 0.1, 0.09, side * 0.2),
    (c) => ell(c, cx + side * 0.035, cy - 0.095, 0.042, 0.085, side * (0.15 - open * 0.3)),
    (c) => ell(c, cx - side * 0.045, cy - 0.085, 0.036, 0.075, -side * (0.25 + open * 0.6)),
  ], R);
  ell(ctx, cx - side * 0.03, cy - 0.03, 0.03, 0.018, -0.4);
  fill(ctx, 'rgba(255,255,255,0.45)');
  ctx.fillStyle = 'rgba(255,220,200,0.6)';
  circ(ctx, cx + side * 0.04, cy + 0.03, 0.012);
  ctx.fill();
}

function crab(ctx, t, mood) {
  const R = '#e0523e';
  const RD = '#b03a30';
  // Legs peeking out under the shell.
  for (const side of [-1, 1]) {
    for (const k of [0, 1]) {
      limb(ctx, side * 0.25, -0.12 + k * 0.06, side * (0.44 - k * 0.03), -0.06 + k * 0.08, 0.045, RD,
        side * 0.4, -0.18 + k * 0.06);
    }
  }
  // Eye stalks.
  const sway = Math.sin(t * 2.5) * 0.015;
  for (const side of [-1, 1]) {
    limb(ctx, side * 0.08, -0.52, side * 0.125 + sway, -0.76, 0.045, R, side * 0.08, -0.66);
  }
  ball(ctx, 0, -0.34, 0.37, 0.28, R, RD, 'rgba(255,255,255,0.4)');
  ctx.fillStyle = 'rgba(255,190,160,0.55)';
  for (const [bx, by, r] of [[-0.2, -0.47, 0.022], [-0.1, -0.54, 0.016], [0.13, -0.53, 0.02],
    [0.23, -0.44, 0.016], [0.02, -0.57, 0.013]]) {
    circ(ctx, bx, by, r);
    ctx.fill();
  }
  // Shell ridge.
  ctx.beginPath();
  ctx.moveTo(-0.28, -0.4);
  ctx.quadraticCurveTo(0, -0.5, 0.28, -0.4);
  stroke(ctx, LW * 0.7, 'rgba(120,30,30,0.35)');
  // Eyeballs on top of the stalks.
  for (const side of [-1, 1]) {
    circ(ctx, side * 0.125 + sway, -0.79, 0.072);
    fillStroke(ctx, WHITE);
  }
  return {
    eyes: [-0.125 + sway, -0.79, 0.125 + sway, -0.79], er: 0.048, mx: 0, my: -0.31, mw: 0.055,
    mouth: 'smile', cheeks: [-0.2, -0.33, 0.2, -0.33], face: R, hw: 0.3, top: -0.86,
    browY: -0.885, flush: [0, -0.4, 0.3, 0.13],
  };
}

function puffer(ctx, t, mood, o) {
  const p = clamp(o.puff ?? 0, 0, 1);
  const Y = '#f4d47a';
  const YD = '#d2a54c';
  const rx = 0.29 + 0.16 * p;
  const ry = 0.245 + 0.2 * p;
  const cy = -0.38 - 0.12 * p;
  // Tail fin peeking out behind, upper right.
  const tw = Math.sin(t * 6) * 0.06;
  ctx.beginPath();
  ctx.moveTo(rx * 0.7, cy - ry * 0.35);
  ctx.quadraticCurveTo(rx + 0.12, cy - ry * 0.9 - 0.08 + tw, rx + 0.16, cy - ry * 0.55 + tw);
  ctx.quadraticCurveTo(rx + 0.1, cy - ry * 0.35, rx + 0.15, cy - ry * 0.05 + tw);
  ctx.quadraticCurveTo(rx + 0.04, cy - 0.02, rx * 0.8, cy + ry * 0.1);
  ctx.closePath();
  fillStroke(ctx, '#e9b95a');
  // Spines all round.
  const n = 18;
  const len = 0.015 + 0.08 * p;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.15;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const bx = ca * rx * 0.93;
    const by = cy + sa * ry * 0.93;
    const nx = ca * ry;
    const ny = sa * rx;
    const nl = Math.hypot(nx, ny) || 1;
    ctx.moveTo(bx - sa * 0.03, by + ca * 0.03);
    ctx.lineTo(bx + (nx / nl) * (len + 0.07), by + (ny / nl) * (len + 0.07));
    ctx.lineTo(bx + sa * 0.03, by - ca * 0.03);
    ctx.closePath();
  }
  fill(ctx, '#fff1c6');
  stroke(ctx, LW * 0.75);
  // Pectoral fins fluttering at the sides.
  const fl = Math.sin(t * 14) * 0.25;
  for (const side of [-1, 1]) {
    ell(ctx, side * (rx + 0.02), cy + ry * 0.15, 0.06, 0.035, side * (0.4 + fl));
    fillStroke(ctx, '#f2c25e', LW * 0.8);
  }
  ball(ctx, 0, cy, rx, ry, Y, YD, 'rgba(255,255,255,0.5)');
  ctx.beginPath();
  ctx.ellipse(0, cy + ry * 0.38, rx * 0.74, ry * 0.5, 0, 0, TAU);
  fill(ctx, '#fff6dc');
  ctx.fillStyle = 'rgba(160,110,50,0.55)';
  for (const [sx, sy, r] of [[-0.55, -0.55, 0.06], [-0.2, -0.75, 0.05], [0.25, -0.7, 0.06],
    [0.6, -0.4, 0.05], [-0.72, -0.2, 0.045], [0.02, -0.92, 0.045], [0.45, -0.85, 0.04]]) {
    circ(ctx, sx * rx, cy + sy * ry, r * (0.6 + 0.4 * (rx / 0.44)) * 0.6);
    ctx.fill();
  }
  ell(ctx, 0, cy, rx, ry);
  stroke(ctx);
  // Dorsal fin.
  ctx.beginPath();
  ctx.moveTo(-0.05, cy - ry + 0.01);
  ctx.quadraticCurveTo(0, cy - ry - 0.08, 0.06, cy - ry + 0.01);
  stroke(ctx, LW * 0.9);
  const er = 0.064 + 0.03 * p;
  return {
    eyes: [-rx * 0.38, cy - ry * 0.1, rx * 0.38, cy - ry * 0.1], er, mx: 0, my: cy + ry * 0.36,
    mw: 0.045 + 0.015 * p, mouth: 'o', cheeks: [-rx * 0.62, cy + ry * 0.2, rx * 0.62, cy + ry * 0.2],
    face: Y, hw: rx, top: cy - ry,
  };
}

function octopus(ctx, t, mood) {
  const O = '#d77aa8';
  const OD = '#ad5689';
  const happy = mood === 'happy' || mood === 'love' || mood === 'eager';
  // The skirt where the arms start (mostly under the counter).
  ell(ctx, 0, -0.08, 0.36, 0.16);
  fillStroke(ctx, OD);
  // Arms curling up at the sides.
  for (const side of [-1, 1]) {
    const w = Math.sin(t * (happy ? 7 : 2.2) + side) * (happy ? 0.05 : 0.025);
    taper(ctx, side * 0.22, -0.1, side * 0.5, -0.1, side * 0.56, -0.38 + w, side * 0.4 + w * side, -0.46 + w,
      0.13, 0.04, 12);
    fillStroke(ctx, O);
    ctx.fillStyle = '#f6c3dc';
    for (const [u, r] of [[0.3, 0.02], [0.5, 0.017], [0.68, 0.014]]) {
      const x = side * (0.26 + u * 0.26);
      const y = -0.1 - u * 0.3 + w * u;
      circ(ctx, x - side * 0.02, y + 0.02, r);
      ctx.fill();
    }
    taper(ctx, side * 0.12, -0.04, side * 0.3, 0.0, side * 0.38, -0.14, side * 0.3, -0.2, 0.1, 0.04, 8);
    fillStroke(ctx, O);
  }
  ball(ctx, 0, -0.56, 0.3, 0.35, O, OD, 'rgba(255,255,255,0.45)');
  ctx.fillStyle = 'rgba(255,215,235,0.7)';
  for (const [sx, sy, r] of [[-0.14, -0.78, 0.025], [0.12, -0.8, 0.032], [0.2, -0.68, 0.02],
    [-0.21, -0.66, 0.018], [0.0, -0.86, 0.018]]) {
    circ(ctx, sx, sy, r);
    ctx.fill();
  }
  return {
    eyes: [-0.12, -0.53, 0.12, -0.53], er: 0.065, mx: 0, my: -0.4, mw: 0.05, mouth: 'smile',
    cheeks: [-0.21, -0.44, 0.21, -0.44], face: O, hw: 0.3, top: -0.91,
  };
}

function turtle(ctx, t) {
  const G = '#6aa36a';
  const GD = '#4b7e50';
  const S = '#8a6a3a';
  // Shell dome behind, with its plates.
  ell(ctx, 0, -0.38, 0.47, 0.36);
  fillStroke(ctx, S);
  ell(ctx, -0.02, -0.4, 0.41, 0.3);
  fill(ctx, '#b88d4c');
  ctx.beginPath();
  ctx.moveTo(-0.13, -0.68);
  ctx.lineTo(0.13, -0.68);
  ctx.lineTo(0.21, -0.52);
  ctx.lineTo(-0.21, -0.52);
  ctx.closePath();
  ctx.moveTo(-0.13, -0.68);
  ctx.lineTo(-0.24, -0.66);
  ctx.moveTo(0.13, -0.68);
  ctx.lineTo(0.24, -0.66);
  ctx.moveTo(-0.21, -0.52);
  ctx.lineTo(-0.38, -0.5);
  ctx.moveTo(0.21, -0.52);
  ctx.lineTo(0.38, -0.5);
  ctx.moveTo(-0.3, -0.62);
  ctx.lineTo(-0.3, -0.51);
  ctx.moveTo(0.3, -0.62);
  ctx.lineTo(0.3, -0.51);
  stroke(ctx, LW * 1.1, '#6e4f26');
  ell(ctx, -0.2, -0.63, 0.06, 0.025, -0.3);
  fill(ctx, 'rgba(255,255,255,0.35)');
  ctx.beginPath();
  ctx.ellipse(0, -0.38, 0.44, 0.33, 0, Math.PI * 1.05, Math.PI * 1.95);
  stroke(ctx, LW * 0.8, 'rgba(255,230,180,0.35)');
  // Front flippers.
  const fl = Math.sin(t * 2) * 0.05;
  for (const side of [-1, 1]) {
    ell(ctx, side * 0.34, -0.1, 0.08, 0.17, side * (-0.7 + fl));
    fillStroke(ctx, G);
    circ(ctx, side * 0.35, -0.12, 0.018);
    fill(ctx, GD);
  }
  // Neck and chest (plastron).
  bustBody(ctx, 0.27, 0.34, G, GD);
  ctx.beginPath();
  ctx.ellipse(0, 0.08, 0.15, 0.24, 0, Math.PI, TAU);
  ctx.closePath();
  fill(ctx, '#e3dc9a');
  limb(ctx, 0, -0.32, 0, -0.45, 0.24, G);
  ball(ctx, 0, -0.58, 0.25, 0.23, G, GD, 'rgba(255,255,255,0.4)');
  ctx.fillStyle = GD;
  for (const [sx, sy, rx, ry] of [[0, -0.76, 0.06, 0.035], [-0.11, -0.73, 0.04, 0.03],
    [0.11, -0.73, 0.04, 0.03], [-0.18, -0.64, 0.025, 0.02], [0.18, -0.64, 0.025, 0.02]]) {
    ell(ctx, sx, sy, rx, ry);
    ctx.fill();
  }
  return {
    eyes: [-0.105, -0.585, 0.105, -0.585], er: 0.062, mx: 0, my: -0.48, mw: 0.06, mouth: 'smile',
    cheeks: [-0.17, -0.51, 0.17, -0.51], face: G, hw: 0.26, top: -0.81,
  };
}

function cat(ctx, t) {
  const C = '#e59a4a';
  const CD = '#c4763a';
  const ST = '#b8662a';
  // Tail curling up behind one shoulder.
  const sw = Math.sin(t * 2.2) * 0.04;
  taper(ctx, 0.25, -0.05, 0.48, -0.05, 0.5, -0.35, 0.4 + sw, -0.48, 0.09, 0.07, 10);
  fillStroke(ctx, C);
  ctx.beginPath();
  ctx.moveTo(0.43, -0.13);
  ctx.lineTo(0.5, -0.15);
  ctx.moveTo(0.46, -0.26);
  ctx.lineTo(0.53, -0.27);
  ctx.moveTo(0.44 + sw * 0.5, -0.38);
  ctx.lineTo(0.5 + sw * 0.5, -0.4);
  stroke(ctx, LW * 1.1, ST);
  bustBody(ctx, 0.33, 0.38, C, CD);
  ctx.beginPath();
  ctx.ellipse(0, 0.08, 0.17, 0.26, 0, Math.PI, TAU);
  ctx.closePath();
  fill(ctx, '#fff3e3');
  // Sailor's neckerchief.
  ctx.beginPath();
  ctx.moveTo(-0.2, -0.36);
  ctx.quadraticCurveTo(0, -0.31, 0.2, -0.36);
  ctx.lineTo(0, -0.12);
  ctx.closePath();
  fillStroke(ctx, '#2f5aa8');
  ctx.beginPath();
  ctx.moveTo(-0.15, -0.325);
  ctx.lineTo(0, -0.155);
  ctx.lineTo(0.15, -0.325);
  stroke(ctx, LW * 0.9, '#ffffff');
  ell(ctx, 0, -0.33, 0.045, 0.035);
  fillStroke(ctx, '#2f5aa8', LW * 0.8);
  // Ears.
  const tw = twitch(t, 3.3, 3.1, 0.3);
  for (const side of [-1, 1]) {
    const lift = side > 0 ? tw * 0.03 : 0;
    ctx.beginPath();
    ctx.moveTo(side * 0.27, -0.66);
    ctx.quadraticCurveTo(side * 0.27, -0.84 - lift, side * 0.22, -0.9 - lift);
    ctx.quadraticCurveTo(side * 0.14, -0.86, side * 0.07, -0.79);
    ctx.closePath();
    fillStroke(ctx, C);
    ctx.beginPath();
    ctx.moveTo(side * 0.235, -0.71);
    ctx.quadraticCurveTo(side * 0.235, -0.81 - lift, side * 0.215, -0.845 - lift);
    ctx.quadraticCurveTo(side * 0.16, -0.82, side * 0.12, -0.78);
    ctx.closePath();
    fill(ctx, '#f7b4b4');
  }
  ball(ctx, 0, -0.58, 0.31, 0.26, C, CD, 'rgba(255,255,255,0.35)');
  // Tabby stripes.
  ctx.beginPath();
  ctx.moveTo(0, -0.83);
  ctx.lineTo(0, -0.75);
  ctx.moveTo(-0.07, -0.82);
  ctx.lineTo(-0.055, -0.755);
  ctx.moveTo(0.07, -0.82);
  ctx.lineTo(0.055, -0.755);
  for (const side of [-1, 1]) {
    ctx.moveTo(side * 0.31, -0.6);
    ctx.lineTo(side * 0.24, -0.59);
    ctx.moveTo(side * 0.305, -0.54);
    ctx.lineTo(side * 0.245, -0.545);
  }
  stroke(ctx, LW * 1.5, ST);
  // Muzzle.
  ell(ctx, -0.055, -0.5, 0.07, 0.055);
  fill(ctx, '#fff3e3');
  ell(ctx, 0.055, -0.5, 0.07, 0.055);
  fill(ctx, '#fff3e3');
  whiskers(ctx, -0.11, -0.505, -1, 0.26, 0.05, LW * 0.5);
  whiskers(ctx, 0.11, -0.505, 1, 0.26, 0.05, LW * 0.5);
  ctx.beginPath();
  ctx.moveTo(-0.032, -0.548);
  ctx.lineTo(0.032, -0.548);
  ctx.lineTo(0, -0.52);
  ctx.closePath();
  fill(ctx, '#ec7f8e');
  stroke(ctx, LW * 0.6);
  return {
    eyes: [-0.125, -0.61, 0.125, -0.61], er: 0.062, mx: 0, my: -0.49, mw: 0.05, mouth: 'w',
    cheeks: [-0.2, -0.53, 0.2, -0.53], face: C, hw: 0.31, top: -0.86,
  };
}

function moustacheHalf(ctx, k) {
  ctx.moveTo(0, -0.575);
  ctx.bezierCurveTo(k * 0.07, -0.615, k * 0.17, -0.6, k * 0.22, -0.54);
  ctx.bezierCurveTo(k * 0.25, -0.5, k * 0.3, -0.52, k * 0.3, -0.575);
  ctx.bezierCurveTo(k * 0.345, -0.52, k * 0.3, -0.45, k * 0.22, -0.475);
  ctx.bezierCurveTo(k * 0.15, -0.49, k * 0.07, -0.5, 0, -0.52);
}

function walrus(ctx, t) {
  const W = '#b98a78';
  const WD = '#94685a';
  for (const side of [-1, 1]) flipper(ctx, side * 0.42, -0.1, 0.08, 0.17, -side * 0.6, WD);
  bustBody(ctx, 0.46, 0.5, W, WD);
  // Wrinkles on the chest.
  ctx.beginPath();
  ctx.moveTo(-0.22, -0.2);
  ctx.quadraticCurveTo(0, -0.16, 0.22, -0.2);
  ctx.moveTo(-0.16, -0.1);
  ctx.quadraticCurveTo(0, -0.07, 0.16, -0.1);
  stroke(ctx, LW * 0.7, 'rgba(90,50,40,0.35)');
  ball(ctx, 0, -0.56, 0.36, 0.29, W, WD, 'rgba(255,255,255,0.35)');
  // Tiny crown, worn at a jaunty angle.
  ctx.save();
  ctx.translate(0.07, -0.83);
  ctx.rotate(0.14);
  ctx.beginPath();
  ctx.moveTo(-0.1, 0.03);
  ctx.lineTo(-0.11, -0.07);
  ctx.lineTo(-0.05, -0.02);
  ctx.lineTo(0, -0.09);
  ctx.lineTo(0.05, -0.02);
  ctx.lineTo(0.11, -0.07);
  ctx.lineTo(0.1, 0.03);
  ctx.closePath();
  fillStroke(ctx, '#f2c33a', LW * 0.9);
  circ(ctx, 0, -0.005, 0.018);
  fill(ctx, '#e0405a');
  for (const [cx, cy, r] of [[-0.11, -0.075, 0.014], [0.11, -0.075, 0.014], [0, -0.095, 0.016]]) {
    circ(ctx, cx, cy, r);
    fill(ctx, '#f2c33a');
  }
  line(ctx, -0.07, 0.0, -0.04, 0.0);
  stroke(ctx, LW * 0.6, 'rgba(255,255,255,0.8)');
  ctx.restore();
  // Tusks, behind the muzzle.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 0.05, -0.43);
    ctx.quadraticCurveTo(side * 0.07, -0.29, side * 0.06, -0.2);
    ctx.quadraticCurveTo(side * 0.11, -0.3, side * 0.115, -0.43);
    ctx.closePath();
    fillStroke(ctx, '#fffaf0', LW * 0.9);
    line(ctx, side * 0.075, -0.4, side * 0.08, -0.3);
    stroke(ctx, LW * 0.6, 'rgba(180,170,150,0.6)');
  }
  // Puffy muzzle with whisker dots.
  for (const side of [-1, 1]) {
    ell(ctx, side * 0.095, -0.465, 0.115, 0.085);
    fillStroke(ctx, '#d8ad9a', LW * 0.8);
  }
  ctx.fillStyle = 'rgba(90,50,40,0.5)';
  for (const side of [-1, 1]) {
    for (const [dx, dy] of [[0.06, -0.445], [0.1, -0.43], [0.14, -0.445], [0.08, -0.405], [0.12, -0.41]]) {
      circ(ctx, side * dx, dy, 0.009);
      ctx.fill();
    }
  }
  // A grand handlebar moustache.
  ctx.beginPath();
  moustacheHalf(ctx, 1);
  ctx.closePath();
  moustacheHalf(ctx, -1);
  ctx.closePath();
  fill(ctx, '#f3e4c8');
  ctx.beginPath();
  for (const k of [-1, 1]) {
    ctx.moveTo(k * 0.03, -0.535);
    ctx.quadraticCurveTo(k * 0.1, -0.55, k * 0.17, -0.53);
    ctx.moveTo(k * 0.05, -0.565);
    ctx.quadraticCurveTo(k * 0.12, -0.58, k * 0.19, -0.56);
  }
  stroke(ctx, LW * 0.6, 'rgba(170,140,100,0.7)');
  ctx.beginPath();
  moustacheHalf(ctx, 1);
  ctx.closePath();
  moustacheHalf(ctx, -1);
  ctx.closePath();
  stroke(ctx, LW * 0.95);
  ctx.beginPath();
  ctx.moveTo(-0.035, -0.64);
  ctx.quadraticCurveTo(0, -0.655, 0.035, -0.64);
  ctx.quadraticCurveTo(0.03, -0.612, 0, -0.598);
  ctx.quadraticCurveTo(-0.03, -0.612, -0.035, -0.64);
  ctx.closePath();
  fill(ctx, '#4a2e2e');
  ell(ctx, -0.012, -0.636, 0.012, 0.006);
  fill(ctx, 'rgba(255,255,255,0.6)');
  return {
    eyes: [-0.15, -0.69, 0.15, -0.69], er: 0.052, mx: 0, my: -0.37, mw: 0.045, mouth: 'smile',
    cheeks: [-0.25, -0.6, 0.25, -0.6], face: W, hw: 0.36, top: -0.9, monocle: true,
  };
}

function monocle(ctx, x, y, t) {
  // Chain first, as beads hanging in a loop to the shoulder.
  const sag = Math.sin(t * 2) * 0.01;
  ctx.fillStyle = '#e8b42e';
  for (let i = 1; i <= 9; i++) {
    const u = i / 10;
    const v = 1 - u;
    const bx = v * v * (x + 0.07) + 2 * v * u * (x + 0.06) + u * u * (x + 0.2);
    const by = v * v * (y + 0.05) + 2 * v * u * (y + 0.3 + sag) + u * u * (y + 0.36);
    circ(ctx, bx, by, 0.011);
    ctx.fill();
  }
  circ(ctx, x, y, 0.078);
  fill(ctx, 'rgba(220,240,255,0.22)');
  stroke(ctx, LW * 2.4, INK);
  stroke(ctx, LW * 1.2, '#f2c33a');
  ell(ctx, x - 0.032, y - 0.036, 0.024, 0.011, -0.6);
  fill(ctx, 'rgba(255,255,255,0.8)');
}

const SPECIES_ART = {
  seal: { draw: seal, seed: 0.3 },
  penguin: { draw: penguin, seed: 1.1 },
  crab: { draw: crab, seed: 2.3, after: (ctx, t, mood) => { crabClaw(ctx, -1, t, mood); crabClaw(ctx, 1, t, mood); } },
  puffer: { draw: puffer, seed: 0.9 },
  octopus: { draw: octopus, seed: 1.7 },
  turtle: { draw: turtle, seed: 2.9 },
  cat: { draw: cat, seed: 0.6 },
  walrus: { draw: walrus, seed: 1.4 },
};

function face(ctx, F, mood, t, seed) {
  const [lx, ly, rx, ry] = F.eyes;
  const er = F.er;
  const open = blinkOpen(t, seed);
  if (mood === 'leaving') {
    const [fx, fy, frx, fry] = F.flush || [(lx + rx) / 2, ly + er * 0.4, F.hw * 0.82, er * 3.2];
    ell(ctx, fx, fy, frx, fry);
    fill(ctx, 'rgba(235,60,60,0.26)');
  }
  // Puffed cheeks while eating.
  if (mood === 'eating' && F.mouth !== 'none') {
    const [cxl, cyl, cxr, cyr] = F.cheeks;
    const k = 0.5 + 0.5 * Math.sin(t * 14);
    for (const [cx, cy] of [[cxl, cyl], [cxr, cyr]]) {
      ell(ctx, cx + Math.sign(cx) * 0.02, cy + 0.01, 0.075 + 0.012 * k, 0.06 + 0.01 * k);
      fill(ctx, F.face);
    }
  }
  if (mood !== 'leaving' && mood !== 'cross') {
    const c = mood === 'love' || mood === 'happy' || mood === 'eating' ? BLUSH_HOT : BLUSH;
    const [cxl, cyl, cxr, cyr] = F.cheeks;
    blush(ctx, cxl, cyl, er * 0.85, er * 0.5, c);
    blush(ctx, cxr, cyr, er * 0.85, er * 0.5, c);
  }
  for (const [x, y, side] of [[lx, ly, -1], [rx, ry, 1]]) {
    switch (mood) {
      case 'eager': eyeSparkle(ctx, x, y, er); break;
      case 'eating': eyeSleep(ctx, x, y, er); break;
      case 'happy': eyeHappy(ctx, x, y, er); break;
      case 'love': eyeHeart(ctx, x, y, er * 1.15); break;
      case 'leaving': eyeAngry(ctx, x, y, er, side); break;
      default:
        if (F.wet) eyeWet(ctx, x, y, er, open);
        else eyeDot(ctx, x, y, er, mood === 'cross' ? Math.min(open, 0.75) : open);
    }
  }
  if (mood === 'cross' || mood === 'leaving') {
    const by = F.browY ?? ly - er * 1.75;
    const col = mood === 'leaving' ? '#9a1d2a' : INK;
    ctx.beginPath();
    ctx.moveTo(lx - er * 1.0, by - er * 0.45);
    ctx.lineTo(lx + er * 0.9, by + er * 0.3);
    ctx.moveTo(rx + er * 1.0, by - er * 0.45);
    ctx.lineTo(rx - er * 0.9, by + er * 0.3);
    stroke(ctx, LW * (mood === 'leaving' ? 1.7 : 1.4), col);
  }
  if (F.mouth !== 'none') {
    const { mx, my, mw } = F;
    switch (mood) {
      case 'eager':
        mouthOpen(ctx, mx, my - mw * 0.1, mw * 0.95, mw * 0.85);
        break;
      case 'eating': mouthChew(ctx, mx, my, mw, t); break;
      case 'happy':
      case 'love': mouthOpen(ctx, mx, my - mw * 0.15, mw * 1.15, mw * 0.85); break;
      case 'cross': mouthWobble(ctx, mx, my + mw * 0.2, mw * 0.85); break;
      case 'leaving': mouthFrown(ctx, mx, my + mw * 0.25, mw * 0.9); break;
      default:
        if (F.mouth === 'w') mouthW(ctx, mx, my, mw);
        else if (F.mouth === 'o') {
          ell(ctx, mx, my, mw * 0.55, mw * 0.45);
          fill(ctx, '#f08aa0');
          stroke(ctx, LW * 0.8);
          ell(ctx, mx, my, mw * 0.22, mw * 0.16);
          fill(ctx, MOUTH);
        } else mouthSmile(ctx, mx, my, mw * 0.8);
    }
  }
  if (F.monocle) monocle(ctx, rx, ry, t);
  // Mood marks around the head.
  const top = F.top;
  const hw = F.hw;
  if (mood === 'cross') steamPuffs(ctx, hw * 0.95, top + 0.12, t);
  else if (mood === 'leaving') vein(ctx, hw * 0.62, top + 0.12, 0.06);
  else if (mood === 'love') floatHeart(ctx, hw * 0.85, top + 0.02, t);
  else if (mood === 'eager') sparkles(ctx, -hw * 0.95, top + 0.12, t);
  else if (mood === 'eating') {
    const p = (t * 1.3) % 1;
    circ(ctx, F.mx + 0.1 + p * 0.05, F.my + p * 0.1, 0.012);
    fill(ctx, alpha('#fbf6ea', 1 - p));
  }
}

/**
 * A customer seated at the bar: head and shoulders only. (x, y) is the bottom centre of the
 * bust (the counter edge covers it); the bust fits in a box s wide and about s tall above y,
 * and its body runs 0.08 s below y so a bob never shows a gap.
 * o: { species, t, mood: 'wait'|'eager'|'eating'|'happy'|'love'|'cross'|'leaving',
 *      puff: 0..1 (the puffer only) }
 */
export function drawCustomer(ctx, x, y, s, o = {}) {
  const sp = SPECIES_ART[o.species] || SPECIES_ART.seal;
  const t = o.t || 0;
  const mood = o.mood || 'wait';
  begin(ctx, x, y, s);
  try {
    let bob = Math.sin(t * 2 + sp.seed * 3) * 0.008;
    if (mood === 'happy' || mood === 'love') bob = -Math.abs(Math.sin(t * 7)) * 0.03;
    else if (mood === 'eating') bob = Math.sin(t * 14) * 0.007;
    else if (mood === 'eager') bob = -Math.abs(Math.sin(t * 5)) * 0.015;
    else if (mood === 'leaving') bob = 0.015;
    const shake = mood === 'cross' && Math.sin(t * 2.7) > 0.6 ? Math.sin(t * 40) * 0.008 : 0;
    ctx.translate(shake, bob);
    const F = sp.draw(ctx, t, mood, o);
    if (sp.after) sp.after(ctx, t, mood, o);
    face(ctx, F, mood, t, sp.seed);
  } finally {
    end(ctx);
  }
}

// ---------------------------------------------------------------------------------------
// The gull

function gullWing(ctx, side, flap) {
  ctx.save();
  ctx.translate(side * 0.1, -0.02);
  ctx.rotate(side * (-0.25 - 0.65 * flap));
  const shape = (c) => {
    c.beginPath();
    c.moveTo(0, -0.06);
    c.quadraticCurveTo(side * 0.2, -0.13, side * 0.44, -0.05);
    c.quadraticCurveTo(side * 0.42, 0.01, side * 0.35, 0.02);
    c.quadraticCurveTo(side * 0.33, 0.065, side * 0.25, 0.06);
    c.quadraticCurveTo(side * 0.21, 0.1, side * 0.13, 0.09);
    c.quadraticCurveTo(side * 0.06, 0.12, 0, 0.08);
    c.closePath();
  };
  shape(ctx);
  fill(ctx, '#aab5c6');
  ctx.save();
  shape(ctx);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(side * 0.31, -0.2);
  ctx.lineTo(side * 0.5, -0.2);
  ctx.lineTo(side * 0.5, 0.1);
  ctx.lineTo(side * 0.27, 0.1);
  ctx.closePath();
  fill(ctx, '#3a3f52');
  circ(ctx, side * 0.38, -0.04, 0.018);
  fill(ctx, '#ffffff');
  ctx.beginPath();
  ctx.moveTo(side * 0.02, -0.04);
  ctx.quadraticCurveTo(side * 0.18, -0.1, side * 0.3, -0.07);
  stroke(ctx, LW * 1.4, 'rgba(255,255,255,0.45)');
  ctx.restore();
  shape(ctx);
  stroke(ctx);
  ctx.restore();
}

/**
 * The cheeky seagull. Fits in an s by s box centred at (x, y).
 * o: { t, state: 'fly'|'grab'|'flee' }. In 'grab' its feet hang down to y + 0.42 s, gripping
 * whatever the renderer draws there.
 */
export function drawGull(ctx, x, y, s, o = {}) {
  const t = o.t || 0;
  const st = o.state || 'fly';
  begin(ctx, x, y, s);
  try {
    const speed = st === 'flee' ? 28 : st === 'grab' ? 15 : 10;
    const flap = Math.sin(t * speed);
    if (st === 'flee') {
      ctx.beginPath();
      for (const [ly, lx] of [[-0.12, 0.3], [0.04, 0.38], [0.2, 0.3]]) {
        ctx.moveTo(-0.3, ly);
        ctx.lineTo(-0.3 - lx * 0.5, ly + 0.03);
      }
      stroke(ctx, LW * 1.2, 'rgba(255,255,255,0.8)');
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.9 + i / 3) % 1;
        const fx = [-0.36, 0.3, -0.18][i] + Math.sin(t * 5 + i) * 0.05;
        const fy = [-0.35, -0.3, 0.32][i] + p * 0.2;
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(t * 4 + i * 2);
        ell(ctx, 0, 0, 0.055, 0.022);
        fill(ctx, alpha('#ffffff', 1 - p * 0.7));
        stroke(ctx, LW * 0.6, alpha('#2a2233', 0.7 * (1 - p * 0.7)));
        line(ctx, -0.05, 0, 0.04, 0);
        stroke(ctx, LW * 0.5, alpha('#8890a0', 1 - p * 0.7));
        ctx.restore();
      }
    }
    ctx.rotate(st === 'flee' ? -0.15 + Math.sin(t * 20) * 0.06 : Math.sin(t * 3) * 0.04);
    // Legs and feet.
    const FOOT = '#f2925a';
    if (st === 'grab') {
      for (const side of [-1, 1]) {
        limb(ctx, side * 0.05, 0.2, side * 0.08, 0.38, 0.03, FOOT);
        ctx.beginPath();
        ctx.moveTo(side * 0.03, 0.42);
        ctx.quadraticCurveTo(side * 0.08, 0.36, side * 0.14, 0.42);
        stroke(ctx, LW * 2.8, INK);
        stroke(ctx, LW * 1.2, FOOT);
      }
    } else if (st === 'flee') {
      for (const side of [-1, 1]) {
        const k = Math.sin(t * 30 + side) * 0.05;
        limb(ctx, side * 0.05, 0.2, side * 0.1 + k, 0.33, 0.03, FOOT);
        ctx.beginPath();
        ctx.moveTo(side * 0.1 + k, 0.33);
        ctx.lineTo(side * 0.16 + k, 0.38);
        ctx.lineTo(side * 0.06 + k, 0.39);
        ctx.closePath();
        fillStroke(ctx, FOOT, LW * 0.8);
      }
    } else {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 0.03, 0.24);
        ctx.lineTo(side * 0.1, 0.3);
        ctx.lineTo(side * 0.02, 0.31);
        ctx.closePath();
        fillStroke(ctx, FOOT, LW * 0.8);
      }
    }
    gullWing(ctx, -1, flap);
    gullWing(ctx, 1, flap);
    // Tail.
    ctx.beginPath();
    ctx.moveTo(-0.08, 0.2);
    ctx.lineTo(0, 0.31);
    ctx.lineTo(0.08, 0.2);
    ctx.closePath();
    fillStroke(ctx, '#3a3f52', LW * 0.8);
    ball(ctx, 0, 0.06, 0.16, 0.2, '#fbfbfd', '#d5dae6', 'rgba(255,255,255,0.9)');
    ball(ctx, 0, -0.2, 0.15, 0.14, '#ffffff', '#d9dee9', 'rgba(255,255,255,0.9)');
    // Face.
    if (st === 'flee') {
      for (const side of [-1, 1]) {
        circ(ctx, side * 0.06, -0.225, 0.045);
        fillStroke(ctx, WHITE, LW * 0.8);
        circ(ctx, side * 0.06, -0.225, 0.014);
        fill(ctx, INK);
      }
      ell(ctx, 0.005, -0.12, 0.045, 0.045);
      fill(ctx, MOUTH);
      ctx.beginPath();
      ctx.moveTo(-0.05, -0.18);
      ctx.quadraticCurveTo(0, -0.195, 0.05, -0.18);
      ctx.quadraticCurveTo(0.03, -0.14, 0.005, -0.13);
      ctx.quadraticCurveTo(-0.025, -0.14, -0.05, -0.18);
      ctx.closePath();
      fillStroke(ctx, '#f7c843', LW * 0.85);
      ctx.beginPath();
      ctx.moveTo(-0.035, -0.09);
      ctx.quadraticCurveTo(0, -0.06, 0.04, -0.09);
      ctx.quadraticCurveTo(0.01, -0.075, -0.035, -0.09);
      fillStroke(ctx, '#f7c843', LW * 0.85);
      circ(ctx, 0.012, -0.074, 0.013);
      fill(ctx, '#e0402f');
      sweat(ctx, 0.17, -0.3, 0.025);
    } else {
      for (const side of [-1, 1]) {
        circ(ctx, side * 0.06, -0.225, 0.026);
        fill(ctx, INK);
        circ(ctx, side * 0.06 - 0.008, -0.233, 0.009);
        fill(ctx, WHITE);
      }
      // Cheeky brows: one cocked.
      ctx.beginPath();
      ctx.moveTo(-0.1, -0.27);
      ctx.lineTo(-0.025, -0.255);
      ctx.moveTo(0.1, -0.29);
      ctx.lineTo(0.03, -0.265);
      stroke(ctx, LW * 1.4, '#7b8396');
      ctx.beginPath();
      ctx.moveTo(-0.05, -0.185);
      ctx.quadraticCurveTo(0, -0.2, 0.05, -0.185);
      ctx.quadraticCurveTo(0.045, -0.11, 0.018, -0.065);
      ctx.quadraticCurveTo(0.0, -0.075, -0.012, -0.1);
      ctx.quadraticCurveTo(-0.045, -0.13, -0.05, -0.185);
      ctx.closePath();
      fillStroke(ctx, '#f7c843', LW * 0.85);
      circ(ctx, 0.016, -0.09, 0.015);
      fill(ctx, '#e0402f');
      ell(ctx, -0.02, -0.175, 0.016, 0.008);
      fill(ctx, 'rgba(255,255,255,0.7)');
      blush(ctx, -0.1, -0.17, 0.03, 0.017);
      blush(ctx, 0.1, -0.17, 0.03, 0.017);
    }
  } finally {
    end(ctx);
  }
}

// ---------------------------------------------------------------------------------------
// Food palette

const RICE = '#fbf6ea';
const RICE_D = '#e4d8bf';
const SALMON = '#f4896b';
const SALMON_D = '#df6a50';
const SALMON_ST = '#ffd3c0';
const TUNA = '#c8384a';
const TUNA_D = '#a2283b';
const TUNA_ST = '#e06878';
const EGG = '#f6cf4a';
const EGG_D = '#e2ad32';
const AVO = '#9cc65a';
const AVO_P = '#d9e8a0';
const AVO_SKIN = '#3e5a2a';
const CUKE = '#4f9a4a';
const CUKE_P = '#cfe8b0';
const BATTER = '#e9b44c';
const BATTER_D = '#c98e2e';
const TAIL = '#f06a4a';
const NORI = '#1e3a2b';

/** Rice grain outlines scattered over a shape: [x, y, rotation] triples. */
function grains(ctx, list, r = 0.045) {
  ctx.lineWidth = LW * 0.55;
  ctx.strokeStyle = 'rgba(42,34,51,0.3)';
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < list.length; i += 3) {
    ell(ctx, list[i], list[i + 1], r, r * 0.5, list[i + 2]);
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
}

/** A 3/4 block: front face shade, top face lit, then an outline. */
function block(ctx, x, y, w, h, top, front, r = 0.08, topK = 0.6) {
  rrect(ctx, x, y, w, h, r);
  fill(ctx, front);
  topRect(ctx, x, y, w, h * topK, r);
  fill(ctx, top);
}

function fishBlock(ctx, top, front, stripe, tuna) {
  const x = -0.38;
  const y = -0.24;
  const w = 0.76;
  const h = 0.5;
  block(ctx, x, y, w, h, top, front, 0.09, 0.62);
  ctx.beginPath();
  if (tuna) {
    for (let i = 0; i < 3; i++) {
      const sx = x + 0.17 + i * 0.2;
      ctx.moveTo(sx, y + 0.04);
      ctx.quadraticCurveTo(sx + 0.1, y + 0.15, sx + 0.02, y + 0.27);
    }
    stroke(ctx, LW * 0.8, stripe);
  } else {
    for (let i = 0; i < 4; i++) {
      const sx = x + 0.12 + i * 0.17;
      ctx.moveTo(sx, y + 0.035);
      ctx.quadraticCurveTo(sx + 0.09, y + 0.15, sx + 0.01, y + 0.285);
      ctx.lineTo(sx + 0.03, y + h - 0.05);
    }
    stroke(ctx, 0.032, stripe);
  }
  ell(ctx, x + 0.2, y + 0.07, 0.11, 0.028, -0.15);
  fill(ctx, 'rgba(255,255,255,0.55)');
  rrect(ctx, x, y, w, h, 0.09);
  stroke(ctx);
}

/** A sashimi slice, local to (0,0): a rounded slab with its cut edge down the right side. */
function fishSlice(ctx, top, edge, stripe, tuna) {
  rrect(ctx, -0.13, -0.27, 0.26, 0.54, 0.06);
  fill(ctx, edge);
  rrect(ctx, -0.13, -0.27, 0.2, 0.54, 0.06);
  fill(ctx, top);
  ctx.beginPath();
  if (tuna) {
    ctx.moveTo(-0.08, -0.1);
    ctx.quadraticCurveTo(0, -0.05, 0.05, -0.13);
    ctx.moveTo(-0.08, 0.1);
    ctx.quadraticCurveTo(0, 0.15, 0.05, 0.07);
    stroke(ctx, LW * 0.7, stripe);
  } else {
    for (const k of [-0.15, 0.0, 0.15]) {
      ctx.moveTo(-0.11, k);
      ctx.quadraticCurveTo(-0.02, k + 0.07, 0.06, k - 0.02);
    }
    stroke(ctx, 0.03, stripe);
  }
  ell(ctx, -0.06, -0.19, 0.028, 0.05, 0.2);
  fill(ctx, 'rgba(255,255,255,0.5)');
  rrect(ctx, -0.13, -0.27, 0.26, 0.54, 0.06);
  stroke(ctx);
}

/** Three slices shingled in a leaning row, drawn right to left so each cut edge shows. */
function slicesFan(ctx, top, edge, stripe, tuna) {
  ell(ctx, 0.02, 0.27, 0.36, 0.06);
  fill(ctx, SHADOW);
  for (const [x, y] of [[0.17, 0.03], [0, 0], [-0.17, -0.03]]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.42);
    fishSlice(ctx, top, edge, stripe, tuna);
    ctx.restore();
  }
}

function eggPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(0, -0.4);
  ctx.bezierCurveTo(0.2, -0.4, 0.3, -0.05, 0.3, 0.1);
  ctx.bezierCurveTo(0.3, 0.3, 0.16, 0.38, 0, 0.38);
  ctx.bezierCurveTo(-0.16, 0.38, -0.3, 0.3, -0.3, 0.1);
  ctx.bezierCurveTo(-0.3, -0.05, -0.2, -0.4, 0, -0.4);
  ctx.closePath();
}

function tamagoBlock(ctx, x, y, w, h, burnt) {
  const top = burnt ? '#5a3b22' : '#f9dc6a';
  const front = burnt ? '#3a2616' : EGG;
  block(ctx, x, y, w, h, top, front, 0.07, 0.55);
  const ly = y + h * 0.55;
  ctx.beginPath();
  ctx.moveTo(x + 0.04, ly + h * 0.16);
  ctx.quadraticCurveTo(x + w * 0.5, ly + h * 0.22, x + w - 0.04, ly + h * 0.14);
  ctx.moveTo(x + 0.04, ly + h * 0.3);
  ctx.quadraticCurveTo(x + w * 0.5, ly + h * 0.36, x + w - 0.04, ly + h * 0.29);
  stroke(ctx, LW * 0.8, burnt ? '#1e140c' : EGG_D);
  if (burnt) {
    ctx.fillStyle = '#1c130d';
    for (const [bx, by, r] of [[0.2, 0.2, 0.09], [0.55, 0.3, 0.07], [0.75, 0.15, 0.06], [0.4, 0.75, 0.08]]) {
      ell(ctx, x + w * bx, y + h * by, r * w, r * h * 0.8);
      ctx.fill();
    }
    ctx.fillStyle = '#ff8a3a';
    circ(ctx, x + w * 0.62, y + h * 0.28, 0.012);
    ctx.fill();
    circ(ctx, x + w * 0.3, y + h * 0.2, 0.01);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(210,140,50,0.35)';
    for (const [bx, by] of [[0.25, 0.2], [0.6, 0.32], [0.78, 0.18]]) {
      ell(ctx, x + w * bx, y + h * by, 0.05 * w, 0.06 * h);
      ctx.fill();
    }
    ell(ctx, x + w * 0.2, y + h * 0.12, w * 0.1, h * 0.05);
    fill(ctx, 'rgba(255,255,255,0.6)');
  }
  rrect(ctx, x, y, w, h, 0.07);
  stroke(ctx);
}

function smoke(ctx, x, y, k = 1) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - 0.08 * k, y - 0.06 * k, x + 0.08 * k, y - 0.12 * k, x, y - 0.18 * k);
  ctx.bezierCurveTo(x - 0.06 * k, y - 0.23 * k, x + 0.03 * k, y - 0.28 * k, x + 0.02 * k, y - 0.3 * k);
  stroke(ctx, 0.05 * k, 'rgba(110,100,115,0.45)');
  stroke(ctx, 0.022 * k, 'rgba(235,230,240,0.6)');
}

/** A tempura shrimp along the axis (x0,y0) to (x1,y1); the tail fans out beyond (x1,y1). */
function tempura(ctx, x0, y0, x1, y1, r, burnt) {
  const bat = burnt ? '#4b2e1b' : BATTER;
  const batD = burnt ? '#2c1a0f' : BATTER_D;
  const tail = burnt ? '#5a2118' : TAIL;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const a = Math.atan2(uy, ux);
  // Tail fan.
  ctx.save();
  ctx.translate(x1 + ux * r * 0.6, y1 + uy * r * 0.6);
  ctx.rotate(a);
  union(ctx, [
    (c) => ell(c, r * 0.7, -r * 0.45, r * 0.75, r * 0.38, -0.55),
    (c) => ell(c, r * 0.8, 0, r * 0.8, r * 0.36, 0),
    (c) => ell(c, r * 0.7, r * 0.45, r * 0.75, r * 0.38, 0.55),
  ], tail);
  ctx.beginPath();
  ctx.moveTo(r * 0.2, 0);
  ctx.lineTo(r * 1.3, 0);
  ctx.moveTo(r * 0.2, -0.02);
  ctx.lineTo(r * 1.1, -r * 0.55);
  ctx.moveTo(r * 0.2, 0.02);
  ctx.lineTo(r * 1.1, r * 0.55);
  stroke(ctx, LW * 0.6, burnt ? 'rgba(0,0,0,0.4)' : 'rgba(255,220,200,0.7)');
  ctx.restore();
  // Bumpy batter: circles along the axis, outlined as one shape.
  const n = 6;
  const bumps = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const rr = r * (0.82 + 0.18 * Math.sin(u * Math.PI)) * (1 - u * 0.15);
    const j = [0.02, -0.03, 0.025, -0.02, 0.03, -0.01][i] * r * 4;
    const cx = x0 + dx * u - uy * j;
    const cy = y0 + dy * u + ux * j;
    bumps.push((c) => circ(c, cx, cy, rr));
    const wob = r * 0.22;
    bumps.push((c) => circ(c, cx - uy * rr * 0.75, cy + ux * rr * 0.75, wob));
    bumps.push((c) => circ(c, cx + uy * rr * 0.75 + ux * wob, cy - ux * rr * 0.75 + uy * wob, wob));
  }
  union(ctx, bumps, bat);
  // Crunchy crumbs (dark and light) and a highlight.
  ctx.fillStyle = batD;
  for (const [u, o, rr] of [[0.15, 0.4, 0.12], [0.4, -0.35, 0.1], [0.6, 0.45, 0.11], [0.85, -0.3, 0.1],
    [0.3, 0.05, 0.08], [0.72, 0.1, 0.09]]) {
    circ(ctx, x0 + dx * u - uy * o * r, y0 + dy * u + ux * o * r, rr * r);
    ctx.fill();
  }
  ctx.fillStyle = burnt ? 'rgba(255,140,60,0.7)' : '#fbe08e';
  for (const [u, o, rr] of [[0.22, -0.3, 0.1], [0.5, 0.25, 0.09], [0.78, -0.45, 0.08], [0.05, 0.05, 0.08]]) {
    circ(ctx, x0 + dx * u - uy * o * r, y0 + dy * u + ux * o * r, rr * r);
    ctx.fill();
  }
  if (!burnt) {
    ctx.beginPath();
    ctx.moveTo(x0 + dx * 0.12 + uy * r * 0.55, y0 + dy * 0.12 - ux * r * 0.55);
    ctx.lineTo(x0 + dx * 0.6 + uy * r * 0.6, y0 + dy * 0.6 - ux * r * 0.6);
    stroke(ctx, r * 0.18, 'rgba(255,250,220,0.6)');
  }
}

function makiPiece(ctx, x, y, r, centre) {
  const ry = r * 0.62;
  const h = r * 0.55;
  ctx.beginPath();
  ctx.ellipse(x, y, r, ry, 0, Math.PI, TAU);
  ctx.lineTo(x + r, y + h);
  ctx.ellipse(x, y + h, r, ry, 0, 0, Math.PI);
  ctx.closePath();
  fill(ctx, NORI);
  stroke(ctx);
  ctx.beginPath();
  ctx.moveTo(x - r * 0.75, y + ry * 0.4);
  ctx.lineTo(x - r * 0.75, y + h + ry * 0.45);
  stroke(ctx, r * 0.12, 'rgba(140,200,170,0.35)');
  ell(ctx, x, y, r * 0.86, ry * 0.86);
  fill(ctx, RICE);
  ell(ctx, x, y + ry * 0.08, r * 0.86, ry * 0.86);
  ctx.strokeStyle = 'rgba(42,34,51,0.2)';
  ctx.lineWidth = LW * 0.5;
  ctx.beginPath();
  for (const [gx, gy, a] of [[-0.55, -0.4, 0.3], [0.45, -0.5, -0.4], [-0.6, 0.35, -0.2], [0.55, 0.3, 0.5],
    [0.05, -0.7, 0], [0.0, 0.7, 0.2]]) {
    const cx = x + gx * r * 0.82;
    const cy = y + gy * ry * 0.82;
    ctx.moveTo(cx - Math.cos(a) * r * 0.1, cy - Math.sin(a) * r * 0.1);
    ctx.lineTo(cx + Math.cos(a) * r * 0.1, cy + Math.sin(a) * r * 0.1);
  }
  ctx.stroke();
  centre(ctx, x, y, r, ry);
  ell(ctx, x, y, r, ry);
  stroke(ctx);
}

function cukeCentre(ctx, x, y, r, ry) {
  ell(ctx, x, y, r * 0.36, ry * 0.36);
  fillStroke(ctx, CUKE, LW * 0.7);
  ell(ctx, x, y, r * 0.22, ry * 0.22);
  fill(ctx, CUKE_P);
  circ(ctx, x - r * 0.05, y - ry * 0.05, r * 0.05);
  fill(ctx, '#f6fbe8');
}

function salmonAvoCentre(ctx, x, y, r, ry) {
  rrect(ctx, x - r * 0.42, y - ry * 0.36, r * 0.46, ry * 0.72, r * 0.1);
  fillStroke(ctx, SALMON, LW * 0.7);
  line(ctx, x - r * 0.32, y - ry * 0.2, x - r * 0.1, y + ry * 0.15);
  stroke(ctx, LW * 0.8, SALMON_ST);
  ctx.beginPath();
  ctx.ellipse(x + r * 0.18, y, r * 0.24, ry * 0.36, 0.5, 0, TAU);
  fill(ctx, AVO);
  stroke(ctx, LW * 0.7);
  ell(ctx, x + r * 0.15, y - ry * 0.05, r * 0.11, ry * 0.18, 0.5);
  fill(ctx, AVO_P);
}

function riceBlock(ctx, x = 0, y = 0.0, w = 0.72, h = 0.3) {
  rrect(ctx, x - w / 2, y - h / 2, w, h, h * 0.48);
  fill(ctx, RICE_D);
  rrect(ctx, x - w / 2 + 0.01, y - h / 2, w - 0.04, h - 0.05, h * 0.45);
  fill(ctx, RICE);
  grains(ctx, [x - w * 0.36, y + h * 0.12, 0.4, x - w * 0.15, y + h * 0.28, -0.2,
    x + w * 0.1, y + h * 0.25, 0.3, x + w * 0.33, y + h * 0.1, -0.5], w * 0.06);
  rrect(ctx, x - w / 2, y - h / 2, w, h, h * 0.48);
  stroke(ctx);
}

function drapedSlice(ctx, top, edge, stripe, tuna, y = -0.06) {
  const path = (c) => {
    c.beginPath();
    c.moveTo(-0.44, y + 0.12);
    c.bezierCurveTo(-0.42, y - 0.18, 0.42, y - 0.18, 0.44, y + 0.12);
    c.quadraticCurveTo(0.46, y + 0.18, 0.4, y + 0.17);
    c.bezierCurveTo(0.33, y - 0.01, -0.33, y - 0.01, -0.4, y + 0.17);
    c.quadraticCurveTo(-0.46, y + 0.18, -0.44, y + 0.12);
    c.closePath();
  };
  path(ctx);
  fill(ctx, top);
  // The cut edge along the front.
  ctx.beginPath();
  ctx.moveTo(-0.4, y + 0.17);
  ctx.bezierCurveTo(-0.33, y - 0.01, 0.33, y - 0.01, 0.4, y + 0.17);
  stroke(ctx, 0.05, edge);
  ctx.beginPath();
  if (tuna) {
    ctx.moveTo(-0.2, y - 0.04);
    ctx.quadraticCurveTo(-0.12, y + 0.02, -0.18, y + 0.06);
    ctx.moveTo(0.1, y - 0.06);
    ctx.quadraticCurveTo(0.18, y, 0.12, y + 0.05);
    stroke(ctx, LW * 0.7, stripe);
  } else {
    for (const k of [-0.27, -0.09, 0.09, 0.27]) {
      ctx.moveTo(k - 0.03, y - 0.07 + Math.abs(k) * 0.12);
      ctx.quadraticCurveTo(k + 0.05, y + 0.0 + Math.abs(k) * 0.1, k + 0.0, y + 0.06 + Math.abs(k) * 0.12);
    }
    stroke(ctx, 0.032, stripe);
  }
  ctx.beginPath();
  ctx.moveTo(-0.3, y - 0.05);
  ctx.quadraticCurveTo(-0.1, y - 0.11, 0.1, y - 0.1);
  stroke(ctx, 0.025, 'rgba(255,255,255,0.55)');
  path(ctx);
  stroke(ctx);
}

// ---------------------------------------------------------------------------------------
// Ingredients

const ING = {
  rice(ctx) {
    const mound = (c) => {
      c.beginPath();
      c.moveTo(-0.36, 0.2);
      c.bezierCurveTo(-0.44, -0.12, -0.2, -0.32, 0, -0.32);
      c.bezierCurveTo(0.2, -0.32, 0.44, -0.12, 0.36, 0.2);
      c.quadraticCurveTo(0, 0.32, -0.36, 0.2);
      c.closePath();
    };
    ell(ctx, 0, 0.24, 0.34, 0.07);
    fill(ctx, SHADOW);
    mound(ctx);
    fill(ctx, RICE);
    ctx.save();
    mound(ctx);
    ctx.clip();
    ell(ctx, 0.12, 0.2, 0.36, 0.17);
    fill(ctx, RICE_D);
    ctx.restore();
    grains(ctx, [-0.18, -0.12, 0.5, 0.05, -0.2, -0.3, 0.2, -0.05, 0.6, -0.25, 0.06, -0.4,
      0.0, 0.02, 0.2, 0.22, 0.12, -0.6, -0.08, 0.16, 0.4], 0.06);
    ell(ctx, -0.15, -0.2, 0.08, 0.035, -0.5);
    fill(ctx, 'rgba(255,255,255,0.9)');
    mound(ctx);
    stroke(ctx);
  },
  salmon(ctx) { fishBlock(ctx, SALMON, SALMON_D, SALMON_ST, false); },
  salmon_s(ctx) { slicesFan(ctx, SALMON, SALMON_D, SALMON_ST, false); },
  tuna(ctx) { fishBlock(ctx, TUNA, TUNA_D, TUNA_ST, true); },
  tuna_s(ctx) { slicesFan(ctx, TUNA, TUNA_D, TUNA_ST, true); },
  cucumber(ctx) {
    ctx.save();
    ctx.rotate(-0.5);
    rrect(ctx, -0.44, -0.13, 0.88, 0.26, 0.13);
    fill(ctx, '#3f7f3a');
    rrect(ctx, -0.44, -0.13, 0.88, 0.21, 0.11);
    fill(ctx, CUKE);
    line(ctx, -0.3, -0.06, 0.3, -0.06);
    stroke(ctx, 0.035, 'rgba(190,230,150,0.55)');
    ctx.fillStyle = '#2f6a2e';
    for (const [bx, by] of [[-0.25, 0.04], [-0.08, 0.06], [0.1, 0.03], [0.26, 0.06], [-0.15, -0.02],
      [0.18, -0.02]]) {
      circ(ctx, bx, by, 0.014);
      ctx.fill();
    }
    ell(ctx, 0.43, 0, 0.03, 0.05);
    fill(ctx, '#8a7a3a');
    rrect(ctx, -0.44, -0.13, 0.88, 0.26, 0.13);
    stroke(ctx);
    ell(ctx, -0.395, 0, 0.035, 0.09);
    fill(ctx, '#9ccd78');
    ctx.restore();
  },
  cucumber_s(ctx) {
    for (const [x, y] of [[0, -0.14], [-0.17, 0.08], [0.17, 0.1]]) {
      const r = 0.18;
      const ry = 0.14;
      ctx.beginPath();
      ctx.ellipse(x, y, r, ry, 0, Math.PI, TAU);
      ctx.lineTo(x + r, y + 0.05);
      ctx.ellipse(x, y + 0.05, r, ry, 0, 0, Math.PI);
      ctx.closePath();
      fillStroke(ctx, '#3f7f3a');
      ell(ctx, x, y, r, ry);
      fillStroke(ctx, CUKE);
      ell(ctx, x, y, r * 0.8, ry * 0.8);
      fill(ctx, CUKE_P);
      ell(ctx, x, y, r * 0.42, ry * 0.42);
      fill(ctx, '#b5d98e');
      ctx.fillStyle = '#f4f9e4';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.3;
        ell(ctx, x + Math.cos(a) * r * 0.28, y + Math.sin(a) * ry * 0.28, 0.018, 0.01, a);
        ctx.fill();
      }
    }
  },
  nori(ctx) {
    ctx.save();
    ctx.rotate(-0.12);
    ctx.beginPath();
    ctx.moveTo(-0.34, -0.32);
    ctx.lineTo(0.2, -0.34);
    ctx.lineTo(0.34, -0.2);
    ctx.lineTo(0.33, 0.33);
    ctx.lineTo(-0.33, 0.34);
    ctx.closePath();
    fillStroke(ctx, NORI);
    ctx.beginPath();
    ctx.moveTo(0.2, -0.34);
    ctx.lineTo(0.22, -0.2);
    ctx.lineTo(0.34, -0.2);
    ctx.closePath();
    fillStroke(ctx, '#3d6b52', LW * 0.8);
    ctx.fillStyle = 'rgba(110,170,130,0.35)';
    for (const [a, b] of [[-0.22, -0.2], [-0.05, -0.12], [0.12, -0.22], [-0.18, 0.05], [0.02, 0.1],
      [0.2, 0.02], [-0.1, 0.24], [0.18, 0.22]]) {
      ell(ctx, a, b, 0.035, 0.012, 0.3);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(-0.3, 0.12);
    ctx.lineTo(0.05, -0.3);
    ctx.moveTo(-0.18, 0.28);
    ctx.lineTo(0.28, -0.12);
    stroke(ctx, 0.045, 'rgba(170,230,200,0.18)');
    ctx.restore();
  },
  egg(ctx) {
    ell(ctx, 0, 0.36, 0.26, 0.06);
    fill(ctx, SHADOW);
    ctx.save();
    ctx.rotate(0.15);
    eggPath(ctx);
    fill(ctx, '#fbf0d9');
    ctx.save();
    eggPath(ctx);
    ctx.clip();
    ell(ctx, 0.12, 0.22, 0.3, 0.26);
    fill(ctx, '#ead6b0');
    ctx.restore();
    ell(ctx, -0.1, -0.18, 0.06, 0.11, 0.3);
    fill(ctx, 'rgba(255,255,255,0.85)');
    ctx.fillStyle = 'rgba(190,150,100,0.45)';
    for (const [sx, sy] of [[0.1, -0.1], [0.15, 0.05], [-0.05, 0.15], [0.08, 0.25], [-0.15, 0.05]]) {
      circ(ctx, sx, sy, 0.014);
      ctx.fill();
    }
    eggPath(ctx);
    stroke(ctx);
    ctx.restore();
  },
  egg_c(ctx) { tamagoBlock(ctx, -0.38, -0.2, 0.76, 0.44, false); },
  egg_b(ctx) {
    tamagoBlock(ctx, -0.38, -0.16, 0.76, 0.42, true);
    smoke(ctx, 0.05, -0.18, 1);
  },
  shrimp(ctx) {
    const B = '#d4aab6';
    const BD = '#b48596';
    // Tail fan at the bottom left.
    ctx.save();
    ctx.translate(-0.12, 0.27);
    ctx.rotate(2.6);
    union(ctx, [
      (c) => ell(c, 0.07, -0.04, 0.08, 0.04, -0.5),
      (c) => ell(c, 0.08, 0.0, 0.085, 0.04, 0),
      (c) => ell(c, 0.07, 0.04, 0.08, 0.04, 0.5),
    ], '#c98fa0');
    ctx.restore();
    // Segments round a C, tail first so the head sits on top.
    const segs = 6;
    for (let i = segs - 1; i >= 0; i--) {
      const u = i / (segs - 1);
      const a = -1.75 + u * 3.6;
      const r = 0.13 - u * 0.055;
      const cx = 0.02 + Math.cos(a) * 0.2;
      const cy = 0.0 + Math.sin(a) * 0.2;
      ell(ctx, cx, cy, r, r * 0.82, a + Math.PI / 2);
      fill(ctx, i === 0 ? B : i % 2 ? B : lite(B, 0.12));
      stroke(ctx, LW * 0.85);
      ell(ctx, cx - Math.cos(a) * r * 0.25, cy - Math.sin(a) * r * 0.25, r * 0.55, r * 0.25, a + Math.PI / 2);
      fill(ctx, 'rgba(255,255,255,0.35)');
      if (i > 0) {
        line(ctx, cx - Math.cos(a) * r * 0.6, cy - Math.sin(a) * r * 0.6,
          cx - Math.cos(a) * r * 1.1, cy - Math.sin(a) * r * 1.1);
        stroke(ctx, LW * 0.6, BD);
      }
    }
    // Head: eye and feelers.
    circ(ctx, -0.05, -0.17, 0.022);
    fill(ctx, INK);
    ctx.beginPath();
    ctx.moveTo(-0.05, -0.2);
    ctx.quadraticCurveTo(-0.25, -0.38, -0.4, -0.25);
    ctx.moveTo(-0.03, -0.21);
    ctx.quadraticCurveTo(-0.2, -0.45, -0.36, -0.4);
    stroke(ctx, LW * 0.7, '#9b6a7c');
  },
  shrimp_f(ctx) { tempura(ctx, -0.3, 0.24, 0.18, -0.16, 0.13, false); },
  shrimp_b(ctx) {
    tempura(ctx, -0.3, 0.26, 0.18, -0.12, 0.13, true);
    smoke(ctx, -0.05, -0.05, 0.9);
  },
  avocado(ctx) {
    const pear = (c, k, oy = 0) => {
      c.beginPath();
      c.moveTo(0, -0.42 * k + oy);
      c.bezierCurveTo(0.17 * k, -0.42 * k + oy, 0.2 * k, -0.2 * k + oy, 0.26 * k, 0 + oy);
      c.bezierCurveTo(0.34 * k, 0.26 * k + oy, 0.18 * k, 0.42 * k + oy, 0, 0.42 * k + oy);
      c.bezierCurveTo(-0.18 * k, 0.42 * k + oy, -0.34 * k, 0.26 * k + oy, -0.26 * k, 0 + oy);
      c.bezierCurveTo(-0.2 * k, -0.2 * k + oy, -0.17 * k, -0.42 * k + oy, 0, -0.42 * k + oy);
      c.closePath();
    };
    ctx.save();
    ctx.rotate(0.25);
    pear(ctx, 1);
    fillStroke(ctx, AVO_SKIN);
    pear(ctx, 0.86, 0.01);
    fill(ctx, AVO);
    pear(ctx, 0.7, 0.03);
    fill(ctx, AVO_P);
    circ(ctx, 0, 0.12, 0.14);
    fill(ctx, '#7a4628');
    circ(ctx, -0.01, 0.11, 0.12);
    fill(ctx, '#9a5a32');
    ell(ctx, -0.05, 0.06, 0.04, 0.025, -0.5);
    fill(ctx, 'rgba(255,255,255,0.55)');
    circ(ctx, 0, 0.12, 0.14);
    stroke(ctx);
    ell(ctx, -0.08, -0.2, 0.035, 0.07, 0.2);
    fill(ctx, 'rgba(255,255,255,0.45)');
    ctx.restore();
  },
  avocado_s(ctx) {
    const moon = (c) => {
      c.beginPath();
      c.moveTo(-0.3, -0.05);
      c.quadraticCurveTo(0, 0.27, 0.3, -0.05);
      c.quadraticCurveTo(0, 0.04, -0.3, -0.05);
      c.closePath();
    };
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(-0.11 + i * 0.07, -0.2 + i * 0.12);
      ctx.rotate(-0.12 + i * 0.05);
      moon(ctx);
      fill(ctx, '#e4efaf');
      ctx.beginPath();
      ctx.moveTo(-0.25, -0.025);
      ctx.quadraticCurveTo(0, 0.17, 0.25, -0.025);
      stroke(ctx, 0.04, '#a8d060');
      ctx.beginPath();
      ctx.moveTo(-0.29, -0.035);
      ctx.quadraticCurveTo(0, 0.25, 0.29, -0.035);
      stroke(ctx, 0.04, AVO_SKIN);
      moon(ctx);
      stroke(ctx, LW * 0.85);
      ctx.beginPath();
      ctx.moveTo(-0.15, 0.0);
      ctx.quadraticCurveTo(0, 0.05, 0.12, 0.0);
      stroke(ctx, 0.02, 'rgba(255,255,255,0.55)');
      ctx.restore();
    }
  },
};

/**
 * One ingredient, centred at (x, y), fitting an s by s box. kind: one of INGREDIENTS.
 */
export function drawIngredient(ctx, kind, x, y, s) {
  const fn = ING[kind];
  begin(ctx, x, y, s);
  try {
    if (fn) fn(ctx);
    else {
      circ(ctx, 0, 0, 0.3);
      fillStroke(ctx, '#ddd');
    }
  } finally {
    end(ctx);
  }
}

// ---------------------------------------------------------------------------------------
// Dishes

const DISH = {
  salmon_nigiri(ctx) {
    riceBlock(ctx, 0, 0.1);
    drapedSlice(ctx, SALMON, SALMON_D, SALMON_ST, false);
  },
  tuna_nigiri(ctx) {
    riceBlock(ctx, 0, 0.1);
    drapedSlice(ctx, TUNA, TUNA_D, TUNA_ST, true);
  },
  kappa_maki(ctx) {
    makiPiece(ctx, -0.2, -0.12, 0.2, cukeCentre);
    makiPiece(ctx, 0.2, -0.12, 0.2, cukeCentre);
    makiPiece(ctx, 0, 0.04, 0.2, cukeCentre);
  },
  tamago(ctx) {
    riceBlock(ctx, 0, 0.12);
    tamagoBlock(ctx, -0.39, -0.17, 0.78, 0.26, false);
    rrect(ctx, -0.065, -0.2, 0.13, 0.46, 0.03);
    fillStroke(ctx, NORI, LW * 0.9);
    line(ctx, -0.04, -0.16, -0.04, 0.2);
    stroke(ctx, LW * 0.8, 'rgba(140,200,170,0.4)');
  },
  ebi(ctx) {
    riceBlock(ctx, 0, 0.12);
    tempura(ctx, -0.34, -0.02, 0.2, -0.08, 0.12, false);
  },
  salmon_roll(ctx) {
    makiPiece(ctx, -0.22, -0.06, 0.25, salmonAvoCentre);
    makiPiece(ctx, 0.23, -0.02, 0.25, salmonAvoCentre);
  },
  dragon_roll(ctx) {
    // The tempura tail flicks up at the right end.
    ctx.save();
    ctx.translate(0.4, -0.1);
    ctx.rotate(-0.7);
    union(ctx, [
      (c) => ell(c, 0.08, -0.06, 0.1, 0.045, -0.5),
      (c) => ell(c, 0.11, 0.0, 0.11, 0.045, 0),
      (c) => ell(c, 0.08, 0.06, 0.1, 0.045, 0.5),
    ], TAIL);
    ctx.beginPath();
    ctx.moveTo(0.02, 0);
    ctx.lineTo(0.17, 0);
    stroke(ctx, LW * 0.6, 'rgba(255,220,200,0.8)');
    ctx.restore();
    // Three pieces, rice outside, dotted with roe.
    for (const px of [-0.29, 0, 0.29]) {
      rrect(ctx, px - 0.14, -0.06, 0.28, 0.27, 0.09);
      fill(ctx, RICE);
      stroke(ctx);
      ctx.fillStyle = '#f08a3a';
      for (const [dx, dy] of [[-0.07, 0.1], [0.06, 0.14], [0.0, 0.17], [-0.04, 0.05], [0.08, 0.06]]) {
        circ(ctx, px + dx, dy, 0.013);
        ctx.fill();
      }
    }
    // Avocado draped over the top as overlapping scales.
    rrect(ctx, -0.43, -0.13, 0.86, 0.16, 0.08);
    fillStroke(ctx, '#7fae45', LW * 0.9);
    for (let i = 0; i < 6; i++) {
      const sx = -0.36 + i * 0.145;
      ctx.beginPath();
      ctx.ellipse(sx, -0.03, 0.095, 0.13, 0, Math.PI, TAU);
      ctx.closePath();
      fill(ctx, i % 2 ? AVO : '#b4d66e');
      stroke(ctx, LW * 0.85);
      ctx.beginPath();
      ctx.ellipse(sx, -0.03, 0.065, 0.095, 0, Math.PI * 1.15, Math.PI * 1.6);
      stroke(ctx, LW * 0.9, 'rgba(240,250,200,0.75)');
    }
    // Sauce drizzle and sesame.
    ctx.beginPath();
    ctx.moveTo(-0.42, -0.1);
    for (let i = 0; i < 8; i++) ctx.lineTo(-0.34 + i * 0.1, i % 2 ? -0.13 : -0.05);
    stroke(ctx, 0.03, '#6b3a1e');
    ctx.fillStyle = '#ffffff';
    for (const [dx, dy] of [[-0.3, -0.15], [-0.05, -0.16], [0.2, -0.14], [0.08, -0.08]]) {
      ell(ctx, dx, dy, 0.014, 0.008, 0.4);
      ctx.fill();
    }
  },
  platter(ctx) {
    // Geta board on two feet.
    rrect(ctx, -0.38, 0.2, 0.13, 0.09, 0.02);
    fillStroke(ctx, '#8a5e33');
    rrect(ctx, 0.25, 0.2, 0.13, 0.09, 0.02);
    fillStroke(ctx, '#8a5e33');
    rrect(ctx, -0.5, -0.22, 1.0, 0.45, 0.05);
    fill(ctx, '#b07f45');
    topRect(ctx, -0.5, -0.22, 1.0, 0.37, 0.05);
    fill(ctx, '#dcae6c');
    ctx.beginPath();
    ctx.moveTo(-0.45, -0.15);
    ctx.quadraticCurveTo(-0.1, -0.13, 0.25, -0.16);
    ctx.moveTo(-0.3, 0.08);
    ctx.quadraticCurveTo(0.1, 0.06, 0.45, 0.09);
    stroke(ctx, LW * 0.6, 'rgba(140,90,40,0.4)');
    rrect(ctx, -0.5, -0.22, 1.0, 0.45, 0.05);
    stroke(ctx);
    // Garnish at the back: a baran leaf and pink ginger.
    ctx.beginPath();
    ctx.moveTo(0.27, -0.12);
    ctx.lineTo(0.31, -0.32);
    ctx.lineTo(0.36, -0.2);
    ctx.lineTo(0.41, -0.36);
    ctx.lineTo(0.44, -0.22);
    ctx.lineTo(0.48, -0.3);
    ctx.lineTo(0.47, -0.1);
    ctx.closePath();
    fillStroke(ctx, '#4fae55', LW * 0.8);
    // Back row of nigiri, front row of rolls and the tempura.
    sub(ctx, -0.3, -0.1, 0.3, DISH.salmon_nigiri);
    sub(ctx, -0.02, -0.11, 0.3, DISH.tuna_nigiri);
    sub(ctx, 0.25, -0.08, 0.26, DISH.tamago);
    sub(ctx, -0.35, 0.07, 0.24, (c) => makiPiece(c, 0, 0, 0.36, salmonAvoCentre));
    sub(ctx, -0.14, 0.08, 0.24, (c) => makiPiece(c, 0, 0, 0.36, cukeCentre));
    sub(ctx, 0.19, 0.1, 0.3, (c) => tempura(c, -0.38, 0.02, 0.22, -0.06, 0.13, false));
    for (const [gx, gy, a] of [[0.43, 0.06, 0.3], [0.45, 0.0, -0.4]]) {
      ell(ctx, gx, gy, 0.045, 0.028, a);
      fillStroke(ctx, '#f6b3c0', LW * 0.6);
    }
  },
};

/**
 * A finished dish (no plate), centred at (x, y), about s wide. dish: one of DISHES.
 * 'platter' includes its wooden geta board.
 */
export function drawDish(ctx, dish, x, y, s) {
  const fn = DISH[dish];
  begin(ctx, x, y, s);
  try {
    if (fn) fn(ctx);
    else {
      riceBlock(ctx, 0, 0.05);
    }
  } finally {
    end(ctx);
  }
}

/**
 * An empty sushi plate seen slightly from above, centred at (x, y): s wide, about 0.42 s
 * tall, with a coloured rim band `rim` (any CSS colour).
 */
export function drawPlate(ctx, x, y, s, rim = '#de4b3a') {
  begin(ctx, x, y, s);
  try {
    ell(ctx, 0.02, 0.07, 0.5, 0.2);
    fill(ctx, 'rgba(42,34,51,0.18)');
    // Plate side (its thickness), then the top.
    ell(ctx, 0, 0.035, 0.5, 0.21);
    fill(ctx, rim);
    fill(ctx, 'rgba(42,34,51,0.3)');
    stroke(ctx);
    ell(ctx, 0, 0, 0.5, 0.21);
    fill(ctx, rim);
    stroke(ctx);
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.455, 0.185, 0, Math.PI * 1.08, Math.PI * 1.45);
    stroke(ctx, LW * 1.1, 'rgba(255,255,255,0.55)');
    // Little dashes round the rim.
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.3;
      const cx = Math.cos(a) * 0.445;
      const cy = Math.sin(a) * 0.185;
      ctx.moveTo(cx - Math.sin(a) * 0.015, cy + Math.cos(a) * 0.006);
      ctx.lineTo(cx + Math.sin(a) * 0.015, cy - Math.cos(a) * 0.006);
    }
    stroke(ctx, LW * 0.9, 'rgba(255,255,255,0.5)');
    // The well.
    ell(ctx, 0, 0.005, 0.385, 0.152);
    fill(ctx, '#efe5cf');
    stroke(ctx, LW * 0.7, 'rgba(42,34,51,0.35)');
    ell(ctx, 0, 0.02, 0.37, 0.135);
    fill(ctx, RICE);
    ell(ctx, 0, 0.035, 0.2, 0.07);
    stroke(ctx, LW * 0.6, 'rgba(42,34,51,0.12)');
  } finally {
    end(ctx);
  }
}

export const SPECIES = ['seal', 'penguin', 'crab', 'puffer', 'octopus', 'turtle', 'cat', 'walrus'];
export const INGREDIENTS = ['rice', 'salmon', 'salmon_s', 'tuna', 'tuna_s', 'cucumber', 'cucumber_s',
  'nori', 'egg', 'egg_c', 'egg_b', 'shrimp', 'shrimp_f', 'shrimp_b', 'avocado', 'avocado_s'];
export const DISHES = ['salmon_nigiri', 'tuna_nigiri', 'kappa_maki', 'tamago', 'ebi', 'salmon_roll',
  'dragon_roll', 'platter'];
