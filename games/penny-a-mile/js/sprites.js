// The model-railway art: every tile, building and industry drawn as vectors into cached sprites.
//
// Art is drawn in world pixels at zoom 1, in isometric tile space: P(X, Y, Z) maps tile coords
// (x right-down, y left-down) and a height to the screen, with (0, 0) at the anchor tile's top
// corner. sprite(name, zoom, dpr) renders it once at that scale and caches the canvas.

export const TW = 64;
export const TH = 32;
export const P = (X, Y, Z = 0) => [(X - Y) * (TW / 2), (X + Y) * (TH / 2) - Z];

export const PAL = {
  grass: ['#6f9a3c', '#73a03f', '#6b9539', '#77a242'],
  flockDark: '#557a2b',
  flockLight: '#97b957',
  flockGold: '#b9b85a',
  soil: '#8b6a3e',
  soilDark: '#755631',
  cropGreen: '#86a848',
  cropGold: '#d4b24c',
  water: '#3d7f8f',
  waterDeep: '#336e7d',
  gloss: '#b7dfe0',
  bank: '#7d6c47',
  rockLight: '#b9b19e',
  rock: '#9a927f',
  rockDark: '#6d665a',
  moss: '#6f8a3a',
  road: '#9a917f',
  roadLight: '#b0a792',
  roadEdge: '#7a7264',
  ballast: '#857b6c',
  ballastDark: '#6b6255',
  sleeper: '#4f3a2a',
  rail: '#dfe3e6',
  railShadow: '#4c4a46',
  platform: '#cfc5ad',
  platformEdge: '#f1e9d4',
  platformFront: '#9a9078',
  leafDark: '#3f5a26',
  leaf: '#5b7a30',
  leafLight: '#86a446',
  pine: '#36522b',
  pineLight: '#4f7037',
  trunk: '#5b4128',
  wallCream: '#ead9b5',
  wallBrick: '#b0563e',
  wallStone: '#c7bea9',
  roofRed: '#a3402f',
  roofSlate: '#56606c',
  roofBrown: '#7e4a2c',
  window: '#344550',
  green: '#1d4a37',
  greenLight: '#2f6b4f',
  brass: '#c8a14b',
  cream: '#f1e6c8',
  coal: '#2e2b28',
  brick: '#9c4a35',
  brickDark: '#7a3a2a',
  iron: '#4a4f55',
  timber: '#a8642f',
  timberLight: '#c98a4e',
  plank: '#d8b07a',
  hay: '#d9b552',
  red: '#b3302a',
  ply: '#c99a5c',
  plyTop: '#e6c18a',
  plyDark: '#a77a42',
};

// ---- primitives -------------------------------------------------------------------------------

export function poly(ctx, pts, fill, stroke, lw = 1) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

/** Mixes a hex colour toward black (k < 0) or white (k > 0). */
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const t = k < 0 ? 0 : 255;
  const a = Math.abs(k);
  r = Math.round(r + (t - r) * a);
  g = Math.round(g + (t - g) * a);
  b = Math.round(b + (t - b) * a);
  return `rgb(${r},${g},${b})`;
}

/** An iso box: footprint [X, X+w] × [Y, Y+d], from height z0 up h px. Faces: top, +y (left), +x (right). */
export function box(ctx, X, Y, w, d, z0, h, col, { top = null, left = null, right = null, line = null } = {}) {
  const t = (x, y) => P(x, y, z0 + h);
  const b = (x, y) => P(x, y, z0);
  poly(ctx, [b(X, Y + d), b(X + w, Y + d), t(X + w, Y + d), t(X, Y + d)], left || shade(col, -0.12), line, 0.6);
  poly(ctx, [b(X + w, Y), b(X + w, Y + d), t(X + w, Y + d), t(X + w, Y)], right || shade(col, -0.3), line, 0.6);
  poly(ctx, [t(X, Y), t(X + w, Y), t(X + w, Y + d), t(X, Y + d)], top || shade(col, 0.08), line, 0.6);
}

/** A pitched roof over [X, X+w] × [Y, Y+d] from height z, ridge along x ('x') or y ('y'). */
export function roof(ctx, X, Y, w, d, z, rh, col, axis = 'x', overhang = 0.04) {
  const o = overhang;
  X -= o;
  Y -= o;
  w += 2 * o;
  d += 2 * o;
  const front = shade(col, 0.05);
  const back = shade(col, -0.18);
  const gable = shade(col, -0.32);
  if (axis === 'x') {
    const ym = Y + d / 2;
    poly(ctx, [P(X, Y, z), P(X + w, Y, z), P(X + w, ym, z + rh), P(X, ym, z + rh)], back);
    poly(ctx, [P(X + w, Y, z), P(X + w, Y + d, z), P(X + w, ym, z + rh)], gable);
    poly(ctx, [P(X, Y + d, z), P(X + w, Y + d, z), P(X + w, ym, z + rh), P(X, ym, z + rh)], front);
    ctx.strokeStyle = shade(col, -0.45);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(...P(X, ym, z + rh));
    ctx.lineTo(...P(X + w, ym, z + rh));
    ctx.stroke();
  } else {
    const xm = X + w / 2;
    poly(ctx, [P(X, Y, z), P(X, Y + d, z), P(xm, Y + d, z + rh), P(xm, Y, z + rh)], back);
    poly(ctx, [P(X, Y + d, z), P(X + w, Y + d, z), P(xm, Y + d, z + rh)], gable);
    poly(ctx, [P(X + w, Y, z), P(X + w, Y + d, z), P(xm, Y + d, z + rh), P(xm, Y, z + rh)], front);
    ctx.strokeStyle = shade(col, -0.45);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(...P(xm, Y, z + rh));
    ctx.lineTo(...P(xm, Y + d, z + rh));
    ctx.stroke();
  }
}

/** Windows on the +y face (left) or +x face (right) of a box. */
function windows(ctx, X, Y, w, d, z, h, face, n, colour = PAL.window, rows = 1) {
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < n; k++) {
      const f0 = (k + 0.3) / n;
      const f1 = (k + 0.7) / n;
      const z0 = z + (h * (r + 0.32)) / rows;
      const z1 = z + (h * (r + 0.74)) / rows;
      let pts;
      if (face === 'left') {
        const yy = Y + d + 0.001;
        pts = [P(X + w * f0, yy, z0), P(X + w * f1, yy, z0), P(X + w * f1, yy, z1), P(X + w * f0, yy, z1)];
      } else {
        const xx = X + w + 0.001;
        pts = [P(xx, Y + d * f0, z0), P(xx, Y + d * f1, z0), P(xx, Y + d * f1, z1), P(xx, Y + d * f0, z1)];
      }
      poly(ctx, pts, colour, 'rgba(255,248,230,.55)', 0.5);
    }
}

function cylinder(ctx, X, Y, r, z0, h, col) {
  // A vertical cylinder seen in iso: an ellipse top and a shaded body.
  const [cx, cy] = P(X, Y, z0);
  const rx = r * 32 * 1.414;
  const ry = rx / 2;
  const g = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
  g.addColorStop(0, shade(col, -0.05));
  g.addColorStop(0.45, shade(col, 0.12));
  g.addColorStop(1, shade(col, -0.38));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(cx - rx, cy - h);
  ctx.ellipse(cx, cy - h, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(col, 0.15);
  ctx.beginPath();
  ctx.ellipse(cx, cy - h, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Tiny seeded LCG for repeatable speckle. */
function lcg(seed) {
  let a = seed >>> 0 || 1;
  return () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// ---- trees ---------------------------------------------------------------------------------------

export function lichenTree(ctx, X, Y, s, rnd) {
  const [x, y] = P(X, Y, 0);
  ctx.fillStyle = 'rgba(30,40,15,.25)';
  ctx.beginPath();
  ctx.ellipse(x + 2 * s, y + 1, 7 * s, 3.2 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PAL.trunk;
  ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 7 * s);
  ctx.stroke();
  const puffs = [
    [0, -12, 7.2],
    [-4.5, -9, 5.4],
    [4.6, -9.5, 5.6],
    [-1.5, -16.5, 5.2],
    [2.8, -14.5, 4.6],
  ];
  const hue = rnd();
  const base = hue < 0.33 ? PAL.leaf : hue < 0.66 ? '#64803a' : '#577433';
  for (const [dx, dy, r] of puffs) {
    ctx.fillStyle = PAL.leafDark;
    ctx.beginPath();
    ctx.arc(x + (dx + 1) * s, y + (dy + 1.2) * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const [dx, dy, r] of puffs) {
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, r * 0.92 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  // Flock highlights: the lichen's texture.
  for (let k = 0; k < 14; k++) {
    const a = rnd() * Math.PI * 2;
    const rr = rnd() * 7 * s;
    ctx.fillStyle = rnd() < 0.6 ? PAL.leafLight : shade(base, -0.2);
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * rr - 1.5 * s, y - 13 * s + Math.sin(a) * rr * 0.8, (0.8 + rnd() * 1.2) * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function pineTree(ctx, X, Y, s, rnd) {
  const [x, y] = P(X, Y, 0);
  ctx.fillStyle = 'rgba(30,40,15,.25)';
  ctx.beginPath();
  ctx.ellipse(x + 2 * s, y + 1, 6 * s, 3 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.trunk;
  ctx.fillRect(x - 0.8 * s, y - 5 * s, 1.6 * s, 5 * s);
  const h = (22 + rnd() * 8) * s;
  for (let k = 0; k < 3; k++) {
    const yb = y - 4 * s - k * h * 0.26;
    const w = (7.5 - k * 1.8) * s;
    poly(ctx, [[x - w, yb], [x, yb - h * 0.48], [x + w, yb]], PAL.pine);
    poly(ctx, [[x - w * 0.15, yb], [x, yb - h * 0.48], [x + w, yb]], shade(PAL.pine, -0.2));
    poly(ctx, [[x - w, yb], [x, yb - h * 0.48], [x - w * 0.35, yb]], PAL.pineLight);
  }
}

// ---- sprite definitions ----------------------------------------------------------------------------
// Each: { w, h, ax, ay, draw(ctx, rnd) } in world px at zoom 1; (ax, ay) is where P(0, 0) lands.

const DEFS = {};

function diamond(ctx, X = 0, Y = 0, w = 1, d = 1, grow = 0) {
  const g = grow;
  return [P(X - g, Y - g), P(X + w + g, Y - g), P(X + w + g, Y + d + g), P(X - g, Y + d + g)];
}

for (let v = 0; v < 4; v++)
  DEFS[`grass${v}`] = {
    w: 66,
    h: 34,
    ax: 33,
    ay: 1,
    draw(ctx) {
      const rnd = lcg(91 + v * 17);
      poly(ctx, diamond(ctx, 0, 0, 1, 1, 0.012), PAL.grass[v]);
      for (let k = 0; k < 34; k++) {
        const u = rnd();
        const w = rnd();
        const [x, y] = P(u, w);
        const r = rnd();
        ctx.fillStyle = r < 0.5 ? PAL.flockDark : r < 0.88 ? PAL.flockLight : PAL.flockGold;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(x - 0.7, y - 0.4, 1.4, 0.9);
      }
      ctx.globalAlpha = 1;
    },
  };

for (const [k, axis, crop] of [
  [0, 'x', PAL.cropGreen],
  [1, 'y', PAL.cropGreen],
  [2, 'x', PAL.cropGold],
  [3, 'y', PAL.cropGold],
])
  DEFS[`field${k}`] = {
    w: 66,
    h: 34,
    ax: 33,
    ay: 1,
    draw(ctx) {
      poly(ctx, diamond(ctx, 0, 0, 1, 1, 0.012), PAL.soil);
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a = (i + 0.2) / n;
        const b = (i + 0.62) / n;
        const pts = axis === 'x' ? [P(0.04, a), P(0.96, a), P(0.96, b), P(0.04, b)] : [P(a, 0.04), P(b, 0.04), P(b, 0.96), P(a, 0.96)];
        poly(ctx, pts, crop);
        const sh = axis === 'x' ? [P(0.04, b), P(0.96, b), P(0.96, b + 0.04), P(0.04, b + 0.04)] : [P(b, 0.04), P(b + 0.04, 0.04), P(b + 0.04, 0.96), P(b, 0.96)];
        poly(ctx, sh, PAL.soilDark);
      }
    },
  };

// Water by which edges touch land (bit e set = land beyond edge e).
for (let m = 0; m < 16; m++)
  DEFS[`water${m}`] = {
    w: 66,
    h: 34,
    ax: 33,
    ay: 1,
    draw(ctx) {
      poly(ctx, diamond(ctx, 0, 0, 1, 1, 0.012), PAL.water);
      const rnd = lcg(7 + m * 13);
      // Darker depth toward the middle, then gloss streaks.
      poly(ctx, diamond(ctx, 0.2, 0.2, 0.6, 0.6), PAL.waterDeep);
      ctx.strokeStyle = PAL.gloss;
      ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const u = 0.2 + rnd() * 0.5;
        const w = 0.2 + rnd() * 0.5;
        ctx.globalAlpha = 0.35 + rnd() * 0.3;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(...P(u, w));
        ctx.lineTo(...P(u + 0.18, w - 0.05));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const E = [
        [P(0, 0), P(1, 0), P(1, 0.14), P(0, 0.14)],
        [P(1, 0), P(1, 1), P(0.86, 1), P(0.86, 0)],
        [P(0, 1), P(1, 1), P(1, 0.86), P(0, 0.86)],
        [P(0, 0), P(0, 1), P(0.14, 1), P(0.14, 0)],
      ];
      const L = [
        [P(0, 0.14), P(1, 0.14)],
        [P(0.86, 0), P(0.86, 1)],
        [P(0, 0.86), P(1, 0.86)],
        [P(0.14, 0), P(0.14, 1)],
      ];
      for (let e = 0; e < 4; e++)
        if (m & (1 << e)) {
          poly(ctx, E[e], PAL.bank);
          ctx.strokeStyle = 'rgba(220,240,235,.6)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(...L[e][0]);
          ctx.lineTo(...L[e][1]);
          ctx.stroke();
        }
    },
  };

for (let m = 0; m < 16; m++)
  DEFS[`road${m}`] = {
    w: 66,
    h: 34,
    ax: 33,
    ay: 1,
    draw(ctx) {
      const hw = 0.2;
      const arm = [
        [0.5 - hw, 0, 0.5 + hw, 0.5 + hw],
        [0.5 - hw, 0.5 - hw, 1, 0.5 + hw],
        [0.5 - hw, 0.5 - hw, 0.5 + hw, 1],
        [0, 0.5 - hw, 0.5 + hw, 0.5 + hw],
      ];
      const rect = ([a, b, c, d], col) => poly(ctx, [P(a, b), P(c, b), P(c, d), P(a, d)], col);
      const any = m !== 0;
      for (let e = 0; e < 4; e++) if (m & (1 << e)) rect(arm[e].map((v, i) => v + (i < 2 ? -0.03 : 0.03)), PAL.roadEdge);
      for (let e = 0; e < 4; e++) if (m & (1 << e)) rect(arm[e], PAL.road);
      if (!any) rect([0.5 - hw, 0.5 - hw, 0.5 + hw, 0.5 + hw], PAL.road);
      const rnd = lcg(300 + m);
      for (let k = 0; k < 16; k++) {
        const [x, y] = P(0.3 + rnd() * 0.4, 0.3 + rnd() * 0.4);
        ctx.fillStyle = rnd() < 0.5 ? PAL.roadLight : PAL.roadEdge;
        ctx.fillRect(x, y, 1, 0.7);
      }
    },
  };

for (let v = 0; v < 3; v++)
  DEFS[`rock${v}`] = {
    w: 70,
    h: 60,
    ax: 35,
    ay: 26,
    draw(ctx) {
      const rnd = lcg(55 + v * 31);
      const lumps = [
        [0.3, 0.35, 0.34, 18],
        [0.62, 0.45, 0.3, 13],
        [0.42, 0.7, 0.26, 9],
      ];
      for (const [cx, cy, r, h0] of lumps) {
        const h = h0 * (0.8 + rnd() * 0.5);
        const n = 6;
        const pts = [];
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + rnd() * 0.4;
          const rr = r * (0.75 + rnd() * 0.35);
          pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
        }
        const top = [cx + (rnd() - 0.5) * 0.08, cy + (rnd() - 0.5) * 0.08];
        // Facets from the base ring to the peak, lit from the upper left.
        for (let k = 0; k < n; k++) {
          const p = pts[k];
          const q = pts[(k + 1) % n];
          const nx = (p[0] + q[0]) / 2 - cx;
          const ny = (p[1] + q[1]) / 2 - cy;
          const lit = -(nx + ny);
          const col = lit > 0.08 ? PAL.rockLight : lit > -0.08 ? PAL.rock : PAL.rockDark;
          poly(ctx, [P(p[0], p[1]), P(q[0], q[1]), P(top[0], top[1], h)], col, 'rgba(60,55,45,.35)', 0.4);
        }
        // A little moss in the hollows.
        ctx.fillStyle = PAL.moss;
        const [mx, my] = P(cx + 0.1, cy + 0.12, 2);
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.ellipse(mx, my, 3.5, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    },
  };

for (let d = 1; d <= 3; d++)
  for (let v = 0; v < 4; v++)
    DEFS[`trees${d}_${v}`] = {
      w: 80,
      h: 72,
      ax: 40,
      ay: 46,
      draw(ctx) {
        const rnd = lcg(1000 + d * 97 + v * 13);
        const spots = [
          [0.3, 0.32],
          [0.72, 0.42],
          [0.42, 0.72],
          [0.75, 0.78],
          [0.5, 0.5],
        ];
        const n = d === 1 ? 1 + (v % 2) : d === 2 ? 3 : 5;
        const pick = spots.slice(0, n).sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
        for (const [u, w] of pick) {
          const s = 0.62 + rnd() * 0.3;
          if (d === 3 && rnd() < 0.4) pineTree(ctx, u + (rnd() - 0.5) * 0.1, w + (rnd() - 0.5) * 0.1, s * 0.9, rnd);
          else lichenTree(ctx, u + (rnd() - 0.5) * 0.1, w + (rnd() - 0.5) * 0.1, s, rnd);
        }
      },
    };

// Houses: level 1 cottage, 2 a terrace pair, 3 a shop with rooms over, 4 a tall town building.
const WALLS = [PAL.wallCream, PAL.wallBrick, PAL.wallStone];
const ROOFS = [PAL.roofRed, PAL.roofSlate, PAL.roofBrown];
for (let lvl = 1; lvl <= 4; lvl++)
  for (let v = 0; v < 6; v++)
    DEFS[`house${lvl}_${v}`] = {
      w: 70,
      h: 100,
      ax: 35,
      ay: 66,
      draw(ctx) {
        const wall = WALLS[v % 3];
        const rf = ROOFS[(v + lvl) % 3];
        const axis = v % 2 ? 'x' : 'y';
        // A garden: a hedge round a lawn.
        poly(ctx, diamond(ctx, 0.08, 0.08, 0.84, 0.84), '#7aa647');
        if (lvl === 1) {
          const [X, Y, w, d] = axis === 'x' ? [0.24, 0.3, 0.52, 0.36] : [0.3, 0.24, 0.36, 0.52];
          box(ctx, X, Y, w, d, 0, 11, wall);
          windows(ctx, X, Y, w, d, 0, 11, 'left', 2);
          windows(ctx, X, Y, w, d, 0, 11, 'right', 1);
          roof(ctx, X, Y, w, d, 11, 9, rf, axis);
          box(ctx, X + w * 0.7, Y + d * 0.3, 0.06, 0.06, 15, 6, PAL.brick);
        } else if (lvl === 2) {
          const [X, Y, w, d] = axis === 'x' ? [0.12, 0.28, 0.76, 0.42] : [0.28, 0.12, 0.42, 0.76];
          box(ctx, X, Y, w, d, 0, 17, wall);
          windows(ctx, X, Y, w, d, 0, 17, 'left', 4, PAL.window, 2);
          windows(ctx, X, Y, w, d, 0, 17, 'right', axis === 'x' ? 1 : 3, PAL.window, 2);
          roof(ctx, X, Y, w, d, 17, 10, rf, axis);
          for (const f of [0.25, 0.75]) {
            const cx = axis === 'x' ? X + w * f : X + w * 0.5;
            const cy = axis === 'x' ? Y + d * 0.5 : Y + d * f;
            box(ctx, cx - 0.03, cy - 0.03, 0.06, 0.06, 23, 6, PAL.brick);
          }
        } else if (lvl === 3) {
          const [X, Y, w, d] = [0.18, 0.18, 0.64, 0.64];
          box(ctx, X, Y, w, d, 0, 8, '#2f6b4f');
          windows(ctx, X, Y, w, d, 0, 8, 'left', 2, '#d9c58c');
          windows(ctx, X, Y, w, d, 0, 8, 'right', 2, '#d9c58c');
          box(ctx, X, Y, w, d, 8, 14, wall);
          windows(ctx, X, Y, w, d, 8, 14, 'left', 3);
          windows(ctx, X, Y, w, d, 8, 14, 'right', 3);
          roof(ctx, X, Y, w, d, 22, 11, rf, axis);
        } else {
          const [X, Y, w, d] = [0.14, 0.16, 0.72, 0.68];
          box(ctx, X, Y, w, d, 0, 34, v % 2 ? PAL.wallBrick : PAL.wallStone);
          windows(ctx, X, Y, w, d, 0, 34, 'left', 4, PAL.window, 3);
          windows(ctx, X, Y, w, d, 0, 34, 'right', 4, PAL.window, 3);
          box(ctx, X - 0.02, Y - 0.02, w + 0.04, d + 0.04, 34, 2.5, PAL.wallStone);
          roof(ctx, X, Y, w, d, 36.5, 12, PAL.roofSlate, axis);
          if (v % 3 === 0) {
            // A clock tower on the town hall.
            box(ctx, X + w * 0.38, Y + d * 0.38, 0.16, 0.16, 40, 18, PAL.wallStone);
            const [cx, cy] = P(X + w * 0.46, Y + d * 0.54 + 0.001, 50);
            ctx.fillStyle = PAL.cream;
            ctx.beginPath();
            ctx.ellipse(cx - 1, cy, 2.4, 2.8, 0, 0, Math.PI * 2);
            ctx.fill();
            poly(ctx, [P(X + w * 0.36, Y + d * 0.36, 58), P(X + w * 0.56, Y + d * 0.36, 58), P(X + w * 0.56, Y + d * 0.56, 58), P(X + w * 0.36, Y + d * 0.56, 58), P(X + w * 0.46, Y + d * 0.46, 68)].slice(0, 4), PAL.roofSlate);
            poly(ctx, [P(X + w * 0.36, Y + d * 0.56, 58), P(X + w * 0.56, Y + d * 0.56, 58), P(X + w * 0.46, Y + d * 0.46, 68)], shade(PAL.roofSlate, 0.1));
            poly(ctx, [P(X + w * 0.56, Y + d * 0.36, 58), P(X + w * 0.56, Y + d * 0.56, 58), P(X + w * 0.46, Y + d * 0.46, 68)], shade(PAL.roofSlate, -0.25));
          }
        }
      },
    };

// Station buildings, at the back of the platform. axis: the track runs along 'x' or 'y'.
for (const axis of ['x', 'y'])
  DEFS[`stationHouse_${axis}`] = {
    w: 70,
    h: 70,
    ax: 35,
    ay: 40,
    draw(ctx) {
      const [X, Y, w, d] = axis === 'x' ? [0.2, 0.04, 0.6, 0.2] : [0.04, 0.2, 0.2, 0.6];
      box(ctx, X, Y, w, d, 3, 12, PAL.wallCream);
      windows(ctx, X, Y, w, d, 3, 12, axis === 'x' ? 'left' : 'right', 3, PAL.green);
      roof(ctx, X, Y, w, d, 15, 7, PAL.roofRed, axis);
      // The canopy over the platform edge, in company green.
      const [cX, cY, cw, cd] = axis === 'x' ? [0.12, 0.22, 0.76, 0.1] : [0.22, 0.12, 0.1, 0.76];
      box(ctx, cX, cY, cw, cd, 13, 1.5, PAL.greenLight);
      for (const f of [0.15, 0.85]) {
        const px = axis === 'x' ? cX + cw * f : cX + cd * 0.5;
        const py = axis === 'x' ? cY + cd * 0.5 : cY + cd * f;
        box(ctx, px - 0.012, py - 0.012, 0.024, 0.024, 3, 10, PAL.green);
      }
    },
  };

// ---- industries (2×2) ---------------------------------------------------------------------------

const IND_DEF = { w: 150, h: 170, ax: 75, ay: 106 };

function yard(ctx, col = '#8d8470') {
  poly(ctx, diamond(ctx, 0.06, 0.06, 1.88, 1.88), col);
  const rnd = lcg(5);
  for (let k = 0; k < 40; k++) {
    const [x, y] = P(0.1 + rnd() * 1.8, 0.1 + rnd() * 1.8);
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.12)';
    ctx.fillRect(x, y, 1.4, 0.9);
  }
}

function heap(ctx, X, Y, r, h, col) {
  const [x, y] = P(X, Y);
  const rx = r * 45;
  const g = ctx.createLinearGradient(x - rx, y - h, x + rx, y);
  g.addColorStop(0, shade(col, 0.25));
  g.addColorStop(0.5, col);
  g.addColorStop(1, shade(col, -0.35));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - rx, y);
  ctx.quadraticCurveTo(x - rx * 0.35, y - h * 1.25, x, y - h);
  ctx.quadraticCurveTo(x + rx * 0.4, y - h * 1.2, x + rx, y);
  ctx.ellipse(x, y, rx, rx * 0.42, 0, 0, Math.PI);
  ctx.fill();
}

function logs(ctx, X, Y, n, axis = 'x') {
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < n - r; k++) {
      const off = (k + r * 0.5) * 0.09;
      const X0 = axis === 'x' ? X : X + off;
      const Y0 = axis === 'x' ? Y + off : Y;
      const z = r * 4.2;
      // A log seen end-on at the +x or +y face, body along the axis.
      const len = 0.42;
      const [a, b] = axis === 'x' ? [P(X0, Y0, z + 2), P(X0 + len, Y0, z + 2)] : [P(X0, Y0, z + 2), P(X0, Y0 + len, z + 2)];
      ctx.strokeStyle = PAL.timber;
      ctx.lineWidth = 4.2;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(...a);
      ctx.lineTo(...b);
      ctx.stroke();
      ctx.fillStyle = PAL.plank;
      ctx.beginPath();
      ctx.ellipse(b[0], b[1], 2.1, 2.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PAL.timberLight;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
}

DEFS.colliery = {
  ...IND_DEF,
  draw(ctx) {
    yard(ctx, '#6f675a');
    heap(ctx, 1.45, 1.55, 0.42, 16, PAL.coal);
    heap(ctx, 1.62, 1.08, 0.3, 11, '#3a3632');
    // Engine house with its chimney.
    box(ctx, 0.2, 0.95, 0.62, 0.8, 0, 26, PAL.brick);
    windows(ctx, 0.2, 0.95, 0.62, 0.8, 0, 26, 'left', 2, PAL.window, 2);
    windows(ctx, 0.2, 0.95, 0.62, 0.8, 0, 26, 'right', 3, PAL.window, 2);
    roof(ctx, 0.2, 0.95, 0.62, 0.8, 26, 10, PAL.roofSlate, 'y');
    cylinder(ctx, 0.36, 0.86, 0.07, 0, 66, PAL.brickDark);
    // The winding headframe: two lattice legs, a back stay and the wheel.
    const legA = P(0.95, 0.3, 0);
    const legB = P(1.35, 0.3, 0);
    const top = P(1.15, 0.3, 58);
    const stay = P(1.15, 0.85, 0);
    ctx.strokeStyle = PAL.iron;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(...legA);
    ctx.lineTo(...top);
    ctx.lineTo(...legB);
    ctx.moveTo(...top);
    ctx.lineTo(...stay);
    ctx.stroke();
    ctx.lineWidth = 0.8;
    for (let k = 1; k < 6; k++) {
      const f = k / 6;
      const l = [legA[0] + (top[0] - legA[0]) * f, legA[1] + (top[1] - legA[1]) * f];
      const r = [legB[0] + (top[0] - legB[0]) * f, legB[1] + (top[1] - legB[1]) * f];
      ctx.beginPath();
      ctx.moveTo(...l);
      ctx.lineTo(...r);
      ctx.stroke();
    }
    ctx.strokeStyle = '#2e3236';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(top[0], top[1] + 2, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(top[0] - 7, top[1] + 2);
    ctx.lineTo(top[0] + 7, top[1] + 2);
    ctx.moveTo(top[0], top[1] - 5);
    ctx.lineTo(top[0], top[1] + 9);
    ctx.stroke();
    // Pit-head shed.
    box(ctx, 1.0, 0.36, 0.3, 0.3, 0, 9, PAL.wallStone);
    roof(ctx, 1.0, 0.36, 0.3, 0.3, 9, 5, PAL.roofSlate, 'x');
  },
};

DEFS.power = {
  ...IND_DEF,
  draw(ctx) {
    yard(ctx, '#857c6b');
    heap(ctx, 1.55, 1.6, 0.36, 12, PAL.coal);
    box(ctx, 0.2, 0.3, 1.2, 0.95, 0, 34, '#a85a3e');
    windows(ctx, 0.2, 0.3, 1.2, 0.95, 0, 34, 'left', 6, PAL.window, 2);
    windows(ctx, 0.2, 0.3, 1.2, 0.95, 0, 34, 'right', 4, PAL.window, 2);
    roof(ctx, 0.2, 0.3, 1.2, 0.95, 34, 9, PAL.roofSlate, 'x');
    box(ctx, 0.25, 1.3, 0.7, 0.45, 0, 18, '#b9694c');
    windows(ctx, 0.25, 1.3, 0.7, 0.45, 0, 18, 'left', 3);
    roof(ctx, 0.25, 1.3, 0.7, 0.45, 18, 6, PAL.roofSlate, 'x');
    cylinder(ctx, 0.55, 0.55, 0.085, 34, 52, PAL.brickDark);
    cylinder(ctx, 1.05, 0.55, 0.085, 34, 52, PAL.brickDark);
    // Pale bands near the tops.
    for (const X of [0.55, 1.05]) {
      const [x, y] = P(X, 0.55, 80);
      ctx.fillStyle = PAL.cream;
      ctx.fillRect(x - 3.5, y - 1, 7, 2.2);
    }
  },
};

DEFS.forest = {
  ...IND_DEF,
  draw(ctx) {
    poly(ctx, diamond(ctx, 0.04, 0.04, 1.92, 1.92), '#5f7f33');
    const rnd = lcg(77);
    // Cleared corner with a log stack and a hut.
    poly(ctx, diamond(ctx, 1.05, 1.0, 0.85, 0.9), '#9a8664');
    box(ctx, 1.12, 1.1, 0.35, 0.3, 0, 10, PAL.timber);
    roof(ctx, 1.12, 1.1, 0.35, 0.3, 10, 6, PAL.roofBrown, 'x');
    logs(ctx, 1.25, 1.5, 4, 'x');
    const spots = [];
    for (let k = 0; k < 15; k++) {
      const u = 0.15 + rnd() * 1.7;
      const w = 0.15 + rnd() * 1.7;
      if (u > 1.0 && w > 0.95) continue;
      spots.push([u, w]);
    }
    spots.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
    for (const [u, w] of spots) pineTree(ctx, u, w, 0.85 + rnd() * 0.35, rnd);
  },
};

DEFS.sawmill = {
  ...IND_DEF,
  draw(ctx) {
    yard(ctx, '#9a8664');
    logs(ctx, 0.2, 1.35, 5, 'x');
    // The mill shed with a saw-tooth roof.
    box(ctx, 0.3, 0.3, 1.25, 0.8, 0, 18, PAL.timber);
    windows(ctx, 0.3, 0.3, 1.25, 0.8, 0, 18, 'left', 5, '#3b2a1c');
    windows(ctx, 0.3, 0.3, 1.25, 0.8, 0, 18, 'right', 3, '#3b2a1c');
    for (let k = 0; k < 4; k++) {
      const X = 0.3 + k * 0.3125;
      poly(ctx, [P(X, 0.3, 18), P(X, 1.1, 18), P(X + 0.25, 1.1, 28), P(X + 0.25, 0.3, 28)], shade(PAL.roofSlate, 0.05));
      poly(ctx, [P(X + 0.25, 0.3, 28), P(X + 0.25, 1.1, 28), P(X + 0.3125, 1.1, 18), P(X + 0.3125, 0.3, 18)], '#a9c3c9');
      poly(ctx, [P(X, 1.1, 18), P(X + 0.25, 1.1, 28), P(X + 0.3125, 1.1, 18)], shade(PAL.timber, -0.2));
    }
    // Plank stacks for the goods.
    for (let k = 0; k < 2; k++) {
      box(ctx, 1.25 + k * 0.32, 1.3, 0.26, 0.5, 0, 7, PAL.plank);
      box(ctx, 1.25 + k * 0.32, 1.3, 0.26, 0.5, 7, 0.8, '#b98c55');
    }
    cylinder(ctx, 1.6, 0.5, 0.05, 0, 40, PAL.iron);
  },
};

DEFS.farm = {
  ...IND_DEF,
  draw(ctx) {
    poly(ctx, diamond(ctx, 0.04, 0.04, 1.92, 1.92), '#8d9a4b');
    // Farmhouse, a red barn and a silo, with haystacks.
    box(ctx, 0.25, 1.15, 0.5, 0.45, 0, 13, PAL.wallCream);
    windows(ctx, 0.25, 1.15, 0.5, 0.45, 0, 13, 'left', 2);
    roof(ctx, 0.25, 1.15, 0.5, 0.45, 13, 9, PAL.roofBrown, 'x');
    box(ctx, 0.85, 0.25, 0.8, 0.6, 0, 20, '#a2392c');
    poly(ctx, [P(0.85, 0.85 + 0.001, 4), P(1.65, 0.85 + 0.001, 4), P(1.65, 0.85 + 0.001, 15), P(0.85, 0.85 + 0.001, 15)], 'rgba(255,240,220,.0)');
    for (const f of [0.2, 0.5, 0.8]) {
      ctx.strokeStyle = PAL.cream;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(...P(0.85 + 0.8 * f, 0.851, 0));
      ctx.lineTo(...P(0.85 + 0.8 * f, 0.851, 20));
      ctx.stroke();
    }
    roof(ctx, 0.85, 0.25, 0.8, 0.6, 20, 12, PAL.roofSlate, 'x');
    cylinder(ctx, 0.5, 0.45, 0.14, 0, 40, '#c9c3b2');
    const [dx, dy] = P(0.5, 0.45, 40);
    ctx.fillStyle = PAL.roofSlate;
    ctx.beginPath();
    ctx.moveTo(dx - 9, dy);
    ctx.quadraticCurveTo(dx, dy - 12, dx + 9, dy);
    ctx.fill();
    for (const [u, w] of [
      [1.2, 1.25],
      [1.55, 1.45],
      [1.3, 1.65],
    ]) {
      const [x, y] = P(u, w);
      ctx.fillStyle = PAL.hay;
      ctx.beginPath();
      ctx.ellipse(x, y - 5, 7, 7, 0, Math.PI, 0);
      ctx.lineTo(x + 7, y);
      ctx.ellipse(x, y, 7, 3, 0, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = shade(PAL.hay, -0.25);
      ctx.beginPath();
      ctx.ellipse(x + 2, y - 3, 4, 5, 0, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
    }
  },
};

DEFS.mill = {
  ...IND_DEF,
  draw(ctx) {
    yard(ctx, '#9b9172');
    // The miller's store and sacks; the tower is drawn with its sails in the dynamic pass.
    box(ctx, 1.0, 1.05, 0.75, 0.6, 0, 15, PAL.wallStone);
    windows(ctx, 1.0, 1.05, 0.75, 0.6, 0, 15, 'left', 3);
    windows(ctx, 1.0, 1.05, 0.75, 0.6, 0, 15, 'right', 2);
    roof(ctx, 1.0, 1.05, 0.75, 0.6, 15, 9, PAL.roofRed, 'x');
    for (let k = 0; k < 4; k++) {
      const [x, y] = P(0.35 + k * 0.12, 1.6);
      ctx.fillStyle = '#e8dcc0';
      ctx.beginPath();
      ctx.ellipse(x, y - 3, 3.2, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#b8a98a';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    // Tower mill: a tapered brick tower.
    const base = 0.26;
    const top = 0.16;
    const c = [0.65, 0.65];
    const H = 50;
    const ring = (r, z) => [P(c[0] - r, c[1] - r, z), P(c[0] + r, c[1] - r, z), P(c[0] + r, c[1] + r, z), P(c[0] - r, c[1] + r, z)];
    const b = ring(base, 0);
    const t = ring(top, H);
    poly(ctx, [b[3], b[2], t[2], t[3]], '#d9cdb2');
    poly(ctx, [b[1], b[2], t[2], t[1]], '#b4a88d');
    windows(ctx, c[0] - top, c[1] - top, top * 2, top * 2, 14, 20, 'left', 1, PAL.window);
    // The cap.
    const [cx, cy] = P(c[0], c[1], H);
    ctx.fillStyle = PAL.roofSlate;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 12, 6, 0, Math.PI, 0);
    ctx.quadraticCurveTo(cx + 6, cy - 14, cx, cy - 15);
    ctx.quadraticCurveTo(cx - 6, cy - 14, cx - 12, cy);
    ctx.fill();
  },
};

/** Where the windmill's sails hub sits, relative to the industry's top corner (world px at zoom 1). */
export const MILL_HUB = (() => {
  const [x, y] = P(0.65 + 0.16, 0.65 + 0.16, 58);
  return [x, y];
})();
/** Chimney tops for smoke, in tile space (X, Y, Z) relative to the industry's corner. */
export const CHIMNEYS = {
  colliery: [[0.36, 0.86, 66]],
  power: [
    [0.55, 0.55, 86],
    [1.05, 0.55, 86],
  ],
  sawmill: [[1.6, 0.5, 40]],
};

// ---- the cache ------------------------------------------------------------------------------------

const cache = new Map();

/** A cached canvas for a sprite at this scale: { canvas, ax, ay } in device pixels. */
export function sprite(name, scale) {
  const key = `${name}@${scale}`;
  let c = cache.get(key);
  if (c) return c;
  const def = DEFS[name];
  if (!def) throw new Error(`no sprite ${name}`);
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(def.w * scale));
  canvas.height = Math.max(1, Math.ceil(def.h * scale));
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.translate(def.ax, def.ay);
  def.draw(ctx);
  c = { canvas, ax: def.ax * scale, ay: def.ay * scale };
  cache.set(key, c);
  return c;
}

/** Drop sprites cached at other scales (call after a zoom change settles). */
export function trimSprites(keepScale) {
  for (const k of cache.keys()) if (!k.endsWith(`@${keepScale}`)) cache.delete(k);
}

export const SPRITES = Object.keys(DEFS);
