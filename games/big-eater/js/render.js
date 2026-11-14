// Draws the slide: a brightfield microscope view. Germs are pre-rendered stain sprites drawn with
// `multiply`, so overlapping ones darken like real stain. All effects (splats, numbers, zaps,
// the cell's vacuoles) live here on a clock of their own, fed by tick(dt).
import { CELLS, DROP_R, GERMS } from './data.js';
import { PR, edible, orbs, wepStat } from './engine.js';

const TAU = Math.PI * 2;
export const STAIN = {
  p: { fill: '#5b34a8', edge: '#2e1763', light: '#9a7fd6' },
  n: { fill: '#e8477a', edge: '#a81e4a', light: '#f7a3bd' },
  s: { fill: '#22a37f', edge: '#0e6b52', light: '#8fdcc3' },
  v: { fill: '#3a3552', edge: '#1d1a2b', light: '#8b86a6' },
};
const FIELD = '#e4eef0';
const AMBER = '#e0a01c';
const BLUE = '#2b6cb0';
const TOXIN = '#b4d916';

// ---------- sprites (drawn in world units, facing +x) ----------
function blobPath(c, r, bumps, amp, seed) {
  c.beginPath();
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (1 + amp * Math.sin(a * bumps + seed) + amp * 0.6 * Math.sin(a * (bumps + 3) + seed * 2.3));
    if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath();
}
function ball(c, x, y, r, st, flash) {
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, flash ? '#fff' : st.light);
  g.addColorStop(0.75, flash ? '#fff' : st.fill);
  g.addColorStop(1, st.edge);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
}
function rod(c, x0, x1, w, st, flash) {
  c.lineCap = 'round';
  c.strokeStyle = st.edge;
  c.lineWidth = w;
  c.beginPath(); c.moveTo(x0, 0); c.lineTo(x1, 0); c.stroke();
  c.strokeStyle = flash ? '#fff' : st.fill;
  c.lineWidth = w - 2.4;
  c.beginPath(); c.moveTo(x0, 0); c.lineTo(x1, 0); c.stroke();
  c.strokeStyle = flash ? '#fff' : st.light;
  c.globalAlpha = 0.7;
  c.lineWidth = w * 0.25;
  c.beginPath(); c.moveTo(x0, -w * 0.2); c.lineTo(x1 - w * 0.2, -w * 0.2); c.stroke();
  c.globalAlpha = 1;
}

const DRAW = {
  coccus(c, r, st, f) { ball(c, 0, 0, r, st, f); },
  bud(c, r, st, f) { c.scale(1.15, 0.9); ball(c, 0, 0, r, st, f); },
  bacillus(c, r, st, f) { rod(c, -r * 0.9, r * 0.9, r * 1.15, st, f); },
  vibrio(c, r, st, f) {
    c.lineCap = 'round';
    for (const [col, w] of [[st.edge, r * 1.0], [f ? '#fff' : st.fill, r * 1.0 - 2.4]]) {
      c.strokeStyle = col; c.lineWidth = w;
      c.beginPath(); c.arc(0, r * 1.1, r * 1.3, -Math.PI * 0.85, -Math.PI * 0.2); c.stroke();
    }
    c.strokeStyle = st.edge; c.lineWidth = 1;
    c.beginPath(); c.moveTo(-r * 1.1, r * 0.4); c.quadraticCurveTo(-r * 1.9, r * 0.2, -r * 2.1, r * 0.9); c.stroke();
  },
  diplo(c, r, st, f) {
    c.fillStyle = st.light; c.globalAlpha = 0.35;
    c.beginPath(); c.ellipse(0, 0, r * 1.25, r * 0.95, 0, 0, TAU); c.fill();
    c.globalAlpha = 1;
    ball(c, -r * 0.42, 0, r * 0.62, st, f); ball(c, r * 0.42, 0, r * 0.62, st, f);
  },
  virus(c, r, st, f) {
    c.strokeStyle = st.edge; c.lineWidth = 1.2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-r * 0.2, 0); c.lineTo(-r * 1.3, 0);
    for (const s of [-1, 1]) { c.moveTo(-r * 1.3, 0); c.lineTo(-r * 0.9, s * r * 0.8); c.lineTo(-r * 1.6, s * r * 1.1); }
    c.stroke();
    c.fillStyle = f ? '#fff' : st.fill; c.strokeStyle = st.edge;
    c.beginPath();
    for (let i = 0; i < 6; i++) c.lineTo(r * 0.35 + Math.cos((i / 6) * TAU) * r * 0.85, Math.sin((i / 6) * TAU) * r * 0.85);
    c.closePath(); c.fill(); c.stroke();
  },
  spiro(c, r, st, f) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [col, w] of [[st.edge, r * 0.62], [f ? '#fff' : st.fill, r * 0.62 - 2]]) {
      c.strokeStyle = col; c.lineWidth = w;
      c.beginPath();
      for (let i = 0; i <= 24; i++) {
        const x = -r * 1.6 + (i / 24) * r * 3.2;
        const y = Math.sin((i / 24) * TAU * 2.5) * r * 0.55;
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.stroke();
    }
  },
  clost(c, r, st, f) {
    rod(c, -r * 1.0, r * 0.5, r * 0.95, st, f);
    c.fillStyle = f ? '#fff' : '#d9f2e6'; c.strokeStyle = st.edge; c.lineWidth = 1.6;
    c.beginPath(); c.ellipse(r * 0.85, 0, r * 0.62, r * 0.72, 0, 0, TAU); c.fill(); c.stroke();
  },
  yeast(c, r, st, f) {
    c.save(); c.scale(1.1, 0.88); ball(c, -r * 0.1, 0, r * 0.95, st, f); c.restore();
    ball(c, r * 0.95, -r * 0.25, r * 0.42, st, f);
    c.fillStyle = '#fff'; c.globalAlpha = 0.35;
    c.beginPath(); c.arc(-r * 0.25, r * 0.1, r * 0.38, 0, TAU); c.fill(); c.globalAlpha = 1;
  },
  spore(c, r, st, f) {
    c.fillStyle = st.edge; c.beginPath(); c.ellipse(0, 0, r * 1.15, r * 0.9, 0, 0, TAU); c.fill();
    c.fillStyle = f ? '#fff' : st.fill; c.beginPath(); c.ellipse(0, 0, r * 0.92, r * 0.68, 0, 0, TAU); c.fill();
    c.fillStyle = f ? '#fff' : st.light; c.beginPath(); c.ellipse(-r * 0.1, -r * 0.05, r * 0.55, r * 0.36, 0, 0, TAU); c.fill();
  },
  biofilm(c, r, st, f) {
    blobPath(c, r * 0.95, 5, 0.07, 1.3);
    c.fillStyle = f ? '#fff' : '#b9d8c2'; c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = '#5d9a7e'; c.lineWidth = 3; c.stroke();
    blobPath(c, r * 0.7, 4, 0.1, 4.1);
    c.fillStyle = '#9cc7ad'; c.globalAlpha = 0.7; c.fill(); c.globalAlpha = 1;
    let q = 7;
    const rr = () => ((q = (q * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 46; i++) {
      const a = rr() * TAU, d = Math.sqrt(rr()) * r * 0.74;
      c.save(); c.translate(Math.cos(a) * d, Math.sin(a) * d); c.rotate(rr() * TAU);
      if (i % 3) rod(c, -5, 5, 6.5, STAIN.n, f); else ball(c, 0, 0, 4.6, STAIN.p, f);
      c.restore();
    }
  },
  waterbear(c, r, st, f) {
    const body = f ? '#fff' : '#cfe3c4', edge = '#4f7d5c';
    c.strokeStyle = edge; c.lineWidth = 2.6; c.lineCap = 'round';
    // legs
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      const x = -r * 0.75 + i * r * 0.5;
      c.fillStyle = body;
      c.beginPath(); c.ellipse(x, s * r * 0.62, r * 0.17, r * 0.24, 0, 0, TAU); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(x - 3, s * r * 0.86); c.lineTo(x - 5, s * r * 0.98); c.moveTo(x + 3, s * r * 0.86); c.lineTo(x + 5, s * r * 0.98); c.stroke();
    }
    // segments, tail to head
    for (let i = 0; i < 5; i++) {
      const x = -r * 0.8 + i * r * 0.4;
      const rr = r * (0.42 + 0.12 * Math.sin((i / 4) * Math.PI));
      c.fillStyle = body;
      c.beginPath(); c.ellipse(x, 0, rr * 0.8, rr, 0, 0, TAU); c.fill(); c.stroke();
    }
    // snout and eyes
    c.fillStyle = body; c.beginPath(); c.ellipse(r * 0.98, 0, r * 0.2, r * 0.17, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = edge; c.beginPath(); c.arc(r * 1.06, 0, r * 0.07, 0, TAU); c.fill();
    c.fillStyle = '#1d1a2b';
    c.beginPath(); c.arc(r * 0.72, -r * 0.2, 2.6, 0, TAU); c.arc(r * 0.72, r * 0.2, 2.6, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.globalAlpha = 0.5;
    c.beginPath(); c.ellipse(-r * 0.1, -r * 0.15, r * 0.5, r * 0.12, 0, 0, TAU); c.fill(); c.globalAlpha = 1;
  },
  superbug(c, r, st, f) {
    // golden staph: a grape-cluster with gilded rims and a crown of spikes
    c.strokeStyle = '#b07a10'; c.lineWidth = 3; c.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      c.beginPath(); c.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); c.lineTo(Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02); c.stroke();
    }
    const spots = [[0, 0, 0.42], [0.5, 0.1, 0.36], [-0.48, 0.16, 0.36], [0.2, -0.5, 0.36], [-0.3, -0.42, 0.34], [0.22, 0.52, 0.36], [-0.3, 0.5, 0.32], [0.6, -0.34, 0.26], [-0.66, -0.2, 0.26]];
    for (const [x, y, k] of spots) {
      c.fillStyle = '#d9a21e'; c.beginPath(); c.arc(x * r, y * r, k * r + 2.2, 0, TAU); c.fill();
      ball(c, x * r, y * r, k * r, st, f);
    }
  },
};

function makeSprite(kind, S, gram, flash) {
  const g = GERMS[kind];
  const r = g.r;
  const half = r * (kind === 'virus' ? 2.1 : kind === 'vibrio' ? 2.4 : kind === 'spiro' ? 2.0 : g.boss ? 1.25 : 1.6) + 3;
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.ceil(half * 2 * S);
  const c = cv.getContext('2d');
  c.setTransform(S, 0, 0, S, half * S, half * S);
  DRAW[kind](c, r, STAIN[gram || g.gram], flash);
  cv.half = half;
  return cv;
}

// the background tile: eosin wisps, pale red cells, specks
function makeTile(S, size) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(size * S);
  const c = cv.getContext('2d');
  c.scale(cv.width / size, cv.width / size);
  c.fillStyle = FIELD;
  c.fillRect(0, 0, size, size);
  let q = 12345;
  const rr = () => ((q = (q * 16807) % 2147483647) / 2147483647);
  const wrap = (fn) => { for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) { c.save(); c.translate(ox, oy); fn(); c.restore(); } };
  for (let i = 0; i < 9; i++) {
    const x = rr() * size, y = rr() * size, a = rr() * TAU, len = 120 + rr() * 200, w = 14 + rr() * 30, bend = (rr() - 0.5) * 160;
    wrap(() => {
      c.strokeStyle = `rgba(240,150,180,${0.07 + rr() * 0.05})`; c.lineWidth = w; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, y);
      c.quadraticCurveTo(x + Math.cos(a) * len * 0.5 - Math.sin(a) * bend, y + Math.sin(a) * len * 0.5 + Math.cos(a) * bend, x + Math.cos(a) * len, y + Math.sin(a) * len);
      c.stroke();
    });
  }
  for (let i = 0; i < 16; i++) {
    const x = rr() * size, y = rr() * size, r = 13 + rr() * 5, sq = 0.75 + rr() * 0.25, a = rr() * TAU;
    wrap(() => {
      c.save(); c.translate(x, y); c.rotate(a); c.scale(1, sq);
      c.fillStyle = 'rgba(236,128,140,0.20)'; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
      c.fillStyle = 'rgba(228,238,240,0.55)'; c.beginPath(); c.arc(0, 0, r * 0.45, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(200,90,110,0.20)'; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
      c.restore();
    });
  }
  for (let i = 0; i < 70; i++) {
    c.fillStyle = `rgba(60,70,110,${0.05 + rr() * 0.1})`;
    c.beginPath(); c.arc(rr() * size, rr() * size, 0.6 + rr() * 1.6, 0, TAU); c.fill();
  }
  return cv;
}

function softDisc(S, r, inner, outer) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.ceil(r * 2 * S);
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(r * S, r * S, 0, r * S, r * S, r * S);
  for (const [stop, col] of inner) g.addColorStop(stop, col);
  if (outer) g.addColorStop(1, outer);
  c.fillStyle = g;
  c.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, S = 1; // S: device px per world unit
  let sprites = {};
  let tile = null, bleach = null, heat = null;
  const TILE = 640;
  const cam = { x: 0, y: 0, zoom: 1, ox: 0, oy: 0 };
  let T = 0;
  let shakeAmt = 0;
  const fx = { parts: [], texts: [], zaps: [], vac: [], pops: [], big: null, hurt: 0 };
  let reduced = false;

  function syncSize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const d = Math.min(2, window.devicePixelRatio || 1);
    if (!w || !h || (w === W && h === H && d === dpr)) return;
    W = w; H = h; dpr = d;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    S = (Math.hypot(W, H) / 1000) * dpr;
    build();
  }
  function build() {
    sprites = {};
    for (const k of Object.keys(GERMS)) sprites[k] = { n: makeSprite(k, S, null, false), f: makeSprite(k, S, null, true) };
    sprites.superbug_n = { n: makeSprite('superbug', S, 'n', false), f: makeSprite('superbug', S, 'n', true) };
    tile = makeTile(Math.min(S, 1.6), TILE);
    bleach = softDisc(Math.min(S, 2), 32, [[0, 'rgba(255,255,255,0.75)'], [0.7, 'rgba(250,253,255,0.6)']], 'rgba(255,255,255,0)');
    heat = softDisc(Math.min(S, 1), 128, [[0, 'rgba(255,170,60,0)'], [0.6, 'rgba(255,160,50,0.10)'], [0.92, 'rgba(250,120,40,0.30)']], 'rgba(250,120,40,0)');
  }
  const spriteFor = (e) => (e.k === 'superbug' && e.gram === 'n' ? sprites.superbug_n : sprites[e.k]);

  function cellPath(c, r, t, kind, stretchX, stretchY) {
    const n = 28;
    const spiky = kind === 'dendri';
    c.beginPath();
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      let k = 1 + 0.07 * Math.sin(a * 3 + t * 1.7) + 0.05 * Math.sin(a * 5 - t * 2.3) + 0.03 * Math.sin(a * 7 + t * 3.1);
      if (spiky) k += 0.22 * Math.max(0, Math.sin(a * 6 + Math.sin(t * 0.8) * 0.6)) ** 3;
      const along = Math.cos(a) * stretchX + Math.sin(a) * stretchY;
      k *= 1 + 0.16 * along;
      pts.push([Math.cos(a) * r * k, Math.sin(a) * r * k]);
    }
    for (let i = 0; i < n; i++) {
      const p0 = pts[i], p1 = pts[(i + 1) % n];
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      if (i === 0) c.moveTo(mx, my);
      else c.quadraticCurveTo(p0[0], p0[1], mx, my);
    }
    const p0 = pts[0], p1 = pts[1];
    c.quadraticCurveTo(p0[0], p0[1], (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2);
    c.closePath();
  }

  const CELL_LOOK = {
    macro: { body: 'rgba(122,170,222,0.62)', edge: '#3d6fa8', nuc: '#4b2a8f' },
    neutro: { body: 'rgba(190,176,226,0.6)', edge: '#6a58a8', nuc: '#3f2580' },
    eosino: { body: 'rgba(244,170,150,0.62)', edge: '#c0603f', nuc: '#4b2a8f' },
    dendri: { body: 'rgba(130,200,196,0.6)', edge: '#2f7f86', nuc: '#40308c' },
  };

  /** Draw a cell at the origin of the current transform (also used by the cell picker). */
  function drawCell(c, kind, r, t, sx = 0, sy = 0, hurt = 0) {
    const look = CELL_LOOK[kind];
    cellPath(c, r, t, kind, sx, sy);
    c.fillStyle = hurt > 0 ? 'rgba(255,255,255,0.9)' : look.body;
    c.fill();
    c.strokeStyle = look.edge; c.lineWidth = 2; c.stroke();
    // granules
    c.fillStyle = kind === 'eosino' ? 'rgba(226,70,60,0.75)' : 'rgba(40,70,130,0.35)';
    for (let i = 0; i < (kind === 'eosino' ? 12 : 6); i++) {
      const a = i * 2.4 + t * 0.3, d = r * (0.45 + 0.3 * Math.sin(i * 1.7 + t * 0.6));
      c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d, kind === 'eosino' ? 2 : 1.5, 0, TAU); c.fill();
    }
    // nucleus
    c.fillStyle = look.nuc; c.globalAlpha = 0.85;
    c.beginPath();
    if (kind === 'neutro') { for (const [x, y] of [[-0.3, -0.12], [0.08, 0.22], [0.34, -0.18]]) { c.moveTo(x * r + r * 0.24, y * r); c.arc(x * r, y * r, r * 0.24, 0, TAU); } }
    else if (kind === 'eosino') { c.arc(-r * 0.24, 0, r * 0.27, 0, TAU); c.moveTo(r * 0.5, 0); c.arc(r * 0.24, 0, r * 0.27, 0, TAU); }
    else if (kind === 'dendri') c.ellipse(0, 0, r * 0.36, r * 0.3, 0.3, 0, TAU);
    else { c.ellipse(-r * 0.1, -r * 0.05, r * 0.42, r * 0.3, 0.5, 0, TAU); }
    c.fill();
    c.globalAlpha = 1;
    if (kind === 'macro') { c.fillStyle = look.body; c.beginPath(); c.arc(r * 0.12, r * 0.14, r * 0.17, 0, TAU); c.fill(); }
  }

  function tick(dt) {
    T += dt;
    shakeAmt = Math.max(0, shakeAmt - dt * 26);
    if (fx.hurt > 0) fx.hurt -= dt;
    for (const p of fx.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; p.life -= dt; }
    fx.parts = fx.parts.filter((p) => p.life > 0);
    for (const t of fx.texts) { t.y -= 34 * dt; t.life -= dt; }
    fx.texts = fx.texts.filter((t) => t.life > 0);
    for (const z of fx.zaps) z.life -= dt;
    fx.zaps = fx.zaps.filter((z) => z.life > 0);
    for (const v of fx.vac) v.life -= dt;
    fx.vac = fx.vac.filter((v) => v.life > 0);
    for (const v of fx.pops) v.life -= dt;
    fx.pops = fx.pops.filter((v) => v.life > 0);
    if (fx.big) { fx.big.t += dt; if (fx.big.t > fx.big.dur) fx.big = null; }
  }

  function draw(s, opts = {}) {
    syncSize();
    if (!W) return;
    const p = s.p;
    const zoomTo = fx.big ? 1.28 : 1;
    cam.zoom += (zoomTo - cam.zoom) * 0.12;
    cam.x = p.x; cam.y = p.y;
    const Z = S * cam.zoom;
    const sh = reduced ? 0 : shakeAmt;
    const tx = canvas.width / 2 + (opts.ox || 0) * dpr - cam.x * Z + (Math.sin(T * 91) * sh) * dpr;
    const ty = canvas.height / 2 + (opts.oy || 0) * dpr - cam.y * Z + (Math.cos(T * 77) * sh) * dpr;
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = FIELD;
    c.fillRect(0, 0, canvas.width, canvas.height);
    // visible world box
    const vx0 = (0 - tx) / Z, vy0 = (0 - ty) / Z, vx1 = (canvas.width - tx) / Z, vy1 = (canvas.height - ty) / Z;
    const vis = (x, y, r) => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1;
    c.setTransform(Z, 0, 0, Z, tx, ty);
    for (let gx = Math.floor(vx0 / TILE); gx * TILE < vx1; gx++)
      for (let gy = Math.floor(vy0 / TILE); gy * TILE < vy1; gy++) c.drawImage(tile, gx * TILE, gy * TILE, TILE + 0.5, TILE + 0.5);

    // the edge of the drop
    if (Math.hypot(p.x, p.y) > DROP_R - 900) {
      c.strokeStyle = 'rgba(70,96,112,0.55)'; c.lineWidth = 1200;
      c.beginPath(); c.arc(0, 0, DROP_R + 600, 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 5;
      c.beginPath(); c.arc(0, 0, DROP_R - 4, 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(40,60,80,0.5)'; c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, DROP_R + 2, 0, TAU); c.stroke();
    }

    // zones under everything alive
    for (const z of s.zones) {
      if (!vis(z.x, z.y, z.r)) continue;
      const k = Math.min(1, z.life / 0.5) * Math.min(1, (z.max - z.life) / 0.15 + 0.2);
      if (z.k === 'ox') {
        c.globalAlpha = k;
        c.drawImage(bleach, z.x - z.r * 1.15, z.y - z.r * 1.15, z.r * 2.3, z.r * 2.3);
        c.globalAlpha = k * 0.7;
        c.strokeStyle = '#7fb4e0'; c.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const a = z.seed + i * 2.1, d = z.r * 0.55, up = ((T * 0.7 + i * 0.37 + z.seed) % 1);
          c.beginPath(); c.arc(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d - up * 8, 1.5 + up * 2.5, 0, TAU); c.stroke();
        }
      } else {
        c.globalAlpha = k * 0.9;
        c.fillStyle = 'rgba(90,120,170,0.10)';
        c.beginPath(); c.arc(z.x, z.y, z.r, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(50,80,140,0.55)'; c.lineWidth = 1.2;
        c.beginPath();
        const spokes = 9;
        for (let i = 0; i < spokes; i++) {
          const a = z.seed + (i / spokes) * TAU;
          c.moveTo(z.x, z.y); c.lineTo(z.x + Math.cos(a) * z.r, z.y + Math.sin(a) * z.r);
        }
        for (const f of [0.35, 0.68, 1]) {
          for (let i = 0; i <= spokes; i++) {
            const a = z.seed + (i / spokes) * TAU, rr = z.r * f * (i % 2 ? 0.94 : 1);
            if (i === 0) c.moveTo(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr); else c.lineTo(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr);
          }
        }
        c.stroke();
      }
    }
    c.globalAlpha = 1;
    const fever = s.weapons.find((w) => w.id === 'fever');
    if (fever) {
      const r = wepStat(fever, 'zr') * s.mods.area * (1 + 0.03 * Math.sin(T * 6));
      c.drawImage(heat, p.x - r, p.y - r, r * 2, r * 2);
    }

    // ATP and drops
    c.fillStyle = AMBER;
    for (const m of s.motes) {
      if (!vis(m.x, m.y, 6)) continue;
      const r = 2.6 + Math.min(4, Math.sqrt(m.v)) * 1.1;
      c.beginPath(); c.moveTo(m.x, m.y - r); c.lineTo(m.x + r * 0.8, m.y); c.lineTo(m.x, m.y + r); c.lineTo(m.x - r * 0.8, m.y); c.closePath(); c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,0.8)';
    for (const m of s.motes) if (vis(m.x, m.y, 6)) c.fillRect(m.x - 1.2, m.y - 2.2, 1.4, 1.4);
    for (const d of s.drops) {
      const bob = Math.sin(T * 4 + d.x) * 2;
      c.save(); c.translate(d.x, d.y + bob);
      if (d.kind === 'sugar') {
        c.rotate(0.3);
        c.fillStyle = '#fff'; c.strokeStyle = '#8fa9c9'; c.lineWidth = 1.6;
        c.beginPath(); c.roundRect(-9, -9, 18, 18, 3); c.fill(); c.stroke();
        c.strokeStyle = '#d6475f'; c.lineWidth = 3; c.beginPath(); c.moveTo(-5, 0); c.lineTo(5, 0); c.moveTo(0, -5); c.lineTo(0, 5); c.stroke();
      } else {
        c.strokeStyle = AMBER; c.lineWidth = 3;
        c.beginPath(); c.arc(0, 0, 10, 0, TAU); c.stroke();
        c.beginPath(); c.arc(0, 0, 4 + ((T * 6) % 6), 0, TAU); c.globalAlpha = 0.5; c.stroke(); c.globalAlpha = 1;
      }
      c.restore();
    }

    // telegraphs
    for (const e of s.enemies) {
      if (e.ai === 'charger' && e.st === 1) {
        c.save(); c.translate(e.x, e.y); c.rotate(Math.atan2(e.fy, e.fx));
        c.fillStyle = `rgba(180,217,22,${0.18 + 0.14 * Math.sin(T * 30)})`;
        c.fillRect(0, -e.r, 440, e.r * 2);
        c.restore();
      }
    }

    // germs, stained
    c.globalCompositeOperation = 'multiply';
    const eat = [];
    for (const e of s.enemies) {
      if (!vis(e.x, e.y, e.r * 2.5)) continue;
      const sp = spriteFor(e);
      if (!sp) continue;
      const ed = edible(s, e);
      if (ed) eat.push(e);
      const img = sp.n;
      const sc = (e.r / GERMS[e.k].r) * (ed ? 1 + 0.06 * Math.sin(T * 14 + e.id) : 1);
      const a = Math.atan2(e.fy, e.fx) + (e.ai === 'seek' && !e.boss ? Math.sin(T * 5 + e.ph) * 0.25 : 0) + (ed ? Math.sin(T * 9 + e.id) * 0.3 : 0);
      const cs = Math.cos(a) * Z * sc, sn = Math.sin(a) * Z * sc;
      c.setTransform(cs, sn, -sn, cs, tx + e.x * Z, ty + e.y * Z);
      const h = img.half;
      c.globalAlpha = ed ? 0.72 : 1;
      c.drawImage(img, -h, -h, h * 2, h * 2);
      if (e.flash > 0) {
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = Math.min(1, e.flash * 9);
        c.drawImage(sp.f, -h, -h, h * 2, h * 2);
        c.globalCompositeOperation = 'multiply';
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.setTransform(Z, 0, 0, Z, tx, ty);

    // elite collars, edible rings, boss marks
    for (const e of s.enemies) {
      if (e.elite && vis(e.x, e.y, e.r * 2)) {
        c.strokeStyle = '#1d1a2b'; c.lineWidth = 2; c.setLineDash([2, 5]);
        c.beginPath(); c.arc(e.x, e.y, e.r * 1.45, T, T + TAU); c.stroke(); c.setLineDash([]);
      }
    }
    c.strokeStyle = AMBER; c.lineWidth = 2.4;
    for (const e of eat) {
      const rr = e.r * 1.35 + 3 + Math.sin(T * 8 + e.id) * 1.5;
      c.setLineDash([5, 4]); c.lineDashOffset = -T * 30;
      c.beginPath(); c.arc(e.x, e.y, rr, 0, TAU); c.stroke();
      if (e.boss) {
        c.setLineDash([]); c.lineWidth = 5; c.globalAlpha = 0.5 + 0.5 * Math.sin(T * 10);
        c.beginPath(); c.arc(e.x, e.y, rr + 10, 0, TAU); c.stroke(); c.globalAlpha = 1; c.lineWidth = 2.4;
      }
    }
    c.setLineDash([]);

    // rings (cytokines, the burst)
    for (const g of s.rings) {
      const k = 1 - g.r / g.rmax;
      if (g.burst) {
        c.strokeStyle = `rgba(255,255,255,${0.5 + k * 0.5})`; c.lineWidth = 26 * k + 6;
        c.beginPath(); c.arc(g.x, g.y, g.r, 0, TAU); c.stroke();
        c.strokeStyle = `rgba(43,108,176,${k})`; c.lineWidth = 4;
        c.beginPath(); c.arc(g.x, g.y, g.r + 14, 0, TAU); c.stroke();
      } else {
        c.strokeStyle = g.small ? `rgba(43,150,176,${k * 0.8})` : `rgba(43,108,176,${0.25 + k * 0.6})`; c.lineWidth = g.small ? 3 : 3 + k * 5;
        c.beginPath(); c.arc(g.x, g.y, g.r, 0, TAU); c.stroke();
        if (!g.small) { c.strokeStyle = `rgba(120,170,230,${k * 0.5})`; c.lineWidth = 2; c.beginPath(); c.arc(g.x, g.y, g.r * 0.86, 0, TAU); c.stroke(); }
      }
    }

    // complement rings
    const comp = s.weapons.find((w) => w.id === 'complement');
    if (comp) {
      for (const o of orbs(s, comp)) {
        c.strokeStyle = '#147d85'; c.lineWidth = o.r * 0.55;
        c.beginPath(); c.arc(o.x, o.y, o.r * 0.72, 0, TAU); c.stroke();
        c.strokeStyle = '#7fd4d6'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(o.x, o.y, o.r * 0.72, T * 3, T * 3 + 2); c.stroke();
      }
    }

    // shots
    for (const b of s.shots) {
      if (b.k === 'ab') {
        c.save(); c.translate(b.x, b.y); c.rotate(Math.atan2(b.vy, b.vx));
        c.strokeStyle = BLUE; c.lineWidth = 2.6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-7, 0); c.lineTo(1, 0); c.lineTo(8, -6); c.moveTo(1, 0); c.lineTo(8, 6); c.stroke();
        c.restore();
      } else {
        c.fillStyle = 'rgba(60,170,210,0.85)';
        c.beginPath(); c.arc(b.x, b.y, b.r * 0.9, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.7)';
        c.beginPath(); c.arc(b.x - 1, b.y - 1, b.r * 0.35, 0, TAU); c.fill();
      }
    }
    for (const b of s.toxins) {
      c.fillStyle = '#3c4a0c'; c.beginPath(); c.arc(b.x, b.y, b.r + 2.5, 0, TAU); c.fill();
      c.fillStyle = TOXIN; c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill();
      c.fillStyle = '#f2ffb0'; c.beginPath(); c.arc(b.x - 1.5, b.y - 1.5, b.r * 0.4, 0, TAU); c.fill();
    }

    // zaps
    c.lineJoin = 'round';
    for (const z of fx.zaps) {
      const k = z.life / 0.16;
      for (const [col, w] of [[`rgba(43,108,176,${k * 0.5})`, 6], [`rgba(220,240,255,${k})`, 2]]) {
        c.strokeStyle = col; c.lineWidth = w;
        c.beginPath();
        z.pts.forEach(([x, y], i) => {
          if (i === 0) { c.moveTo(x, y); return; }
          const [px, py] = z.pts[i - 1];
          const mx = (px + x) / 2 + (y - py) * 0.18 * (i % 2 ? 1 : -1), my = (py + y) / 2 - (x - px) * 0.18 * (i % 2 ? 1 : -1);
          c.lineTo(mx, my); c.lineTo(x, y);
        });
        c.stroke();
      }
    }

    // splats
    for (const q of fx.parts) {
      c.globalAlpha = Math.min(1, q.life * 3) * 0.8;
      c.fillStyle = q.col;
      c.beginPath(); c.arc(q.x, q.y, q.r, 0, TAU); c.fill();
    }
    for (const q of fx.pops) {
      const k = 1 - q.life / q.max;
      c.globalAlpha = 1 - k;
      c.strokeStyle = q.col; c.lineWidth = 2.5;
      c.beginPath(); c.arc(q.x, q.y, q.r * (0.6 + k * 1.2), 0, TAU); c.stroke();
    }
    c.globalAlpha = 1;

    // the cell
    if (!opts.hideCell) {
      const big = fx.big;
      let scale = 1;
      if (big) { const k = big.t / big.dur; scale = 1 + Math.sin(Math.min(1, k * 1.15) * Math.PI) * (big.r / PR) * 1.25; }
      const gulpPulse = fx.vac.length ? 1 + 0.07 * Math.min(3, fx.vac.length) : 1;
      const mv = Math.min(1, p.speedNow / 150);
      c.save();
      c.translate(p.x, p.y);
      if (p.inv > 0 && s.t % 0.14 < 0.07 && !big) c.globalAlpha = 0.55;
      c.scale(scale * gulpPulse, scale * gulpPulse);
      drawCell(c, s.cell, PR * 1.12, T, p.fx * mv, p.fy * mv, fx.hurt);
      // what it ate, dissolving
      for (const v of fx.vac) {
        const k = v.life / v.max;
        const sp = sprites[v.k];
        if (!sp) continue;
        const h = Math.min(PR * 0.55, sp.n.half) * k * (v.boss ? 2 : 1);
        c.globalAlpha = k * 0.9;
        c.fillStyle = 'rgba(255,255,255,0.5)';
        c.beginPath(); c.arc(v.ox, v.oy, h * 1.1, 0, TAU); c.fill();
        c.save(); c.translate(v.ox, v.oy); c.rotate(v.a + T * 2);
        c.drawImage(sp.n, -h, -h, h * 2, h * 2);
        c.restore();
      }
      c.restore();
      c.globalAlpha = 1;
    }

    // numbers
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const t of fx.texts) {
      const k = Math.min(1, t.life * 3);
      const pop = t.life > t.max - 0.1 ? 1.3 : 1;
      c.globalAlpha = k;
      c.font = `${t.bold ? 700 : 600} ${t.size * pop}px DynaPuff, system-ui, sans-serif`;
      if (t.out) { c.lineWidth = 4; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.strokeText(t.str, t.x, t.y); }
      c.fillStyle = t.col;
      c.fillText(t.str, t.x, t.y);
    }
    c.globalAlpha = 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  return {
    draw, tick, drawCell,
    get T() { return T; },
    set reduced(v) { reduced = v; },
    reset() { fx.parts = []; fx.texts = []; fx.zaps = []; fx.vac = []; fx.pops = []; fx.big = null; shakeAmt = 0; cam.zoom = 1; },
    shake(n) { shakeAmt = Math.min(14, Math.max(shakeAmt, n)); },
    hurt() { fx.hurt = 0.12; },
    splat(x, y, gram, r, n = 5) {
      if (fx.parts.length > 260) return;
      const col = STAIN[gram].fill;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, v = 40 + Math.random() * 160;
        fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1 + Math.random() * r * 0.3, life: 0.25 + Math.random() * 0.35, col });
      }
      fx.pops.push({ x, y, r, col, life: 0.22, max: 0.22 });
    },
    text(x, y, str, { col = '#1d1a2b', size = 11, life = 0.6, bold = false, out = false, key = null } = {}) {
      if (key) fx.texts = fx.texts.filter((t) => t.key !== key);
      else if (fx.texts.length > 46 && !out) return;
      fx.texts.push({ x: key ? x : x + (Math.random() - 0.5) * 10, y, str, col, size, life, max: life, bold, out, key });
    },
    zap(pts) { fx.zaps.push({ pts, life: 0.16 }); },
    vacuole(k, boss = false) {
      if (fx.vac.length > 5 && !boss) fx.vac.shift();
      const a = Math.random() * TAU, d = boss ? 0 : Math.random() * PR * 0.5;
      const max = boss ? 1.6 : 0.9;
      fx.vac.push({ k, ox: Math.cos(a) * d, oy: Math.sin(a) * d, a, life: max, max, boss });
    },
    bigGulp(k, r) { fx.big = { k, r, t: 0, dur: 1.1 }; },
    /** A germ portrait for the atlas and the HUD, as a data URL. */
    portrait(kind, px = 72) {
      const g = GERMS[kind];
      const half = g.r * (g.boss ? 1.3 : kind === 'vibrio' || kind === 'virus' ? 2.3 : 1.8);
      const scale = px / (half * 2);
      const cv = document.createElement('canvas');
      cv.width = cv.height = px * 2;
      const c = cv.getContext('2d');
      c.setTransform(scale * 2, 0, 0, scale * 2, px, px);
      c.rotate(-0.4);
      DRAW[kind](c, g.r, STAIN[g.gram], false);
      return cv.toDataURL();
    },
    cellPortrait(kind, px = 72) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = px * 2;
      const c = cv.getContext('2d');
      c.setTransform(2, 0, 0, 2, px, px);
      drawCell(c, kind, px * 0.36, 1.2);
      return cv.toDataURL();
    },
    toScreen(x, y) {
      const Z = (S * cam.zoom) / dpr;
      return { x: W / 2 + (x - cam.x) * Z, y: H / 2 + (y - cam.y) * Z };
    },
  };
}

export const cellNames = Object.keys(CELLS);
