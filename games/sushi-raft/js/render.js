// Draws the pier: sky and lanterns, the customers at the bar, the canal with its rafts, and the
// kitchen with its stations and otters. Everything is in design px with a kitchen tile of T = 56;
// the renderer scales that to fit the canvas. Characters and food come from art.js.
import { drawCustomer, drawDish, drawGull, drawIngredient, drawOtter, drawPlate, drawFloatingOtters, INK } from './art.js';
import * as E from './engine.js';
import { CANAL, COLS, DISHES, OTTERS, PREP, ROWS, SEATS, SPECIES, TIMES, rimOf } from './data.js';

export const T = 56;
const VIEW = { x0: -0.85 * T, x1: 6.85 * T, y0: -4.55 * T, y1: 6.2 * T };
export const VIEW_W = VIEW.x1 - VIEW.x0;
export const VIEW_H = VIEW.y1 - VIEW.y0;
const FONT = '"Mochiy Pop One", "Zen Maru Gothic", system-ui, sans-serif';
const BODY = '"Zen Maru Gothic", system-ui, sans-serif';

const COL = {
  wood: '#e8c896',
  woodTop: '#efd5a8',
  woodFront: '#c99e64',
  woodDark: '#9a7044',
  woodLine: 'rgba(120,80,40,.18)',
  floor: '#d6b98c',
  floorLine: 'rgba(110,75,40,.16)',
  indigo: '#24335a',
  teal: '#2f8b96',
  tealDeep: '#23707c',
  tealLight: '#5fb3b7',
  vermilion: '#de4b3a',
  rice: '#fbf6ea',
  board: '#f4e2bd',
  steel: '#3b3f4a',
};

const BAR = { top: -1.98 * T, bottom: -1.72 * T };
const WATER = { top: -1.72 * T, bottom: -0.1 * T, divTop: -0.98 * T, divBot: -0.82 * T };
const SEAT_Y = BAR.top + 6; // the customers' busts stand on the bar's back edge

const ease = (k) => k * k * (3 - 2 * k);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, k) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], k))).join(',')})`;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const R = {
    canvas,
    scale: 1,
    ox: 0,
    oy: 0,
    dpr: 1,
    fx: [], // effects: { kind, x, y, t0, dur, ... }
    cursor: null,
    kitchenCache: null,
    kitchenKey: '',
    boardCache: null,
    boardKey: '',
    boardShown: false, // the recipe board fits beside the pier (wide screens)
    bubbleHits: [], // order bubbles as last drawn, for taps: { x, y, w, h, cx, dishes: [{ d, x }] }
    recipe: null, // a recipe card on show after a bubble tap: { dish, x, top, t0 }
    glowN: 0, // stations glowing this frame (tests)
  };

  R.resize = function () {
    const rect = { width: canvas.clientWidth, height: canvas.clientHeight };
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    R.dpr = dpr;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    R.scale = Math.min(rect.width / VIEW_W, rect.height / VIEW_H);
    R.ox = (rect.width - VIEW_W * R.scale) / 2 - VIEW.x0 * R.scale;
    // Spare height goes mostly above the scene (more sky), so on a phone the kitchen sits near the thumbs.
    R.oy = (rect.height - VIEW_H * R.scale) * 0.9 - VIEW.y0 * R.scale;
    R.cssW = rect.width;
    R.cssH = rect.height;
    // The visible world, for scenery that bleeds to the canvas edges.
    R.world = { x0: -R.ox / R.scale, y0: -R.oy / R.scale, x1: (rect.width - R.ox) / R.scale, y1: (rect.height - R.oy) / R.scale };
    R.kitchenKey = '';
  };

  /** Canvas-relative css px → design px. */
  R.toWorld = (px, py) => ({ x: (px - R.ox) / R.scale, y: (py - R.oy) / R.scale });
  /** Design px → canvas-relative css px. */
  R.toScreen = (x, y) => ({ x: x * R.scale + R.ox, y: y * R.scale + R.oy });

  /** What's under a point (design px): a gull, an otter, a kitchen tile or a customer. */
  R.hit = function (st, x, y) {
    const svc = st?.svc;
    if (!svc) return null;
    for (const g of svc.gulls) if (g.state === 'fly' && Math.hypot(g.x * T - x, g.y * T - y) < 0.75 * T) return { kind: 'gull', id: g.id };
    for (const b of R.bubbleHits) {
      if (x < b.x - 4 || x > b.x + b.w + 4 || y < b.y - 4 || y > b.y + b.h + 8) continue;
      const near = b.dishes.reduce((best, d) => (Math.abs(d.x - x) < Math.abs(best.x - x) ? d : best));
      return { kind: 'bubble', dish: near.d, x: b.cx, top: b.y };
    }
    for (const o of svc.otters) if (Math.hypot((o.drawX ?? o.x) * T - x, (o.drawY ?? o.y) * T - 6 - y) < 0.36 * T) return { kind: 'otter', i: o.i };
    const c = Math.floor(x / T);
    const r = Math.floor(y / T);
    if (c >= 0 && r >= 0 && c < COLS && r < ROWS) return { kind: 'tile', c, r };
    // Taps on the canal just above the kitchen land on row 0.
    if (r === -1 && c >= 0 && c < COLS && y > WATER.divBot) return { kind: 'tile', c, r: 0 };
    return null;
  };

  R.effect = (fx) => R.fx.push({ t0: performance.now() / 1000, ...fx });

  // ── static kitchen ──

  function kitchenBase(svc) {
    const key = `${svc.layout}|${svc.grid.map((t) => t.k + (t.ing || '')).join(',')}|${R.scale}|${R.dpr}`;
    if (R.kitchenKey === key && R.kitchenCache) return R.kitchenCache;
    const off = R.kitchenCache || document.createElement('canvas');
    const pad = 4;
    const k = R.scale * R.dpr;
    off.width = Math.ceil((COLS * T + pad * 2) * k);
    off.height = Math.ceil((ROWS * T + pad * 2 + 6) * k);
    const g = off.getContext('2d');
    g.setTransform(k, 0, 0, k, pad * k, pad * k);
    g.clearRect(-pad, -pad, COLS * T + pad * 2, ROWS * T + pad * 2 + 6);
    drawFloor(g, svc);
    svc.grid.forEach((t, i) => {
      if (t.k === 'floor') return;
      drawStationBase(g, t, (i % COLS) * T, Math.floor(i / COLS) * T, svc, i);
    });
    R.kitchenCache = off;
    R.kitchenKey = key;
    R.kitchenPad = pad;
    return off;
  }

  function drawFloor(g, svc) {
    // Pale hinoki planks running across, with a darker frame.
    g.fillStyle = COL.woodFront;
    rr(g, -4, -4, COLS * T + 8, ROWS * T + 10, 10);
    g.fill();
    g.fillStyle = COL.floor;
    g.fillRect(0, 0, COLS * T, ROWS * T);
    g.strokeStyle = COL.floorLine;
    g.lineWidth = 1;
    for (let y = T / 4; y < ROWS * T; y += T / 4) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(COLS * T, y);
      g.stroke();
    }
    for (let r = 0; r < ROWS * 4; r++) {
      const off = (r * 37) % 90;
      for (let x = off; x < COLS * T; x += 90 + ((r * 13) % 40)) {
        g.beginPath();
        g.moveTo(x, r * (T / 4));
        g.lineTo(x, (r + 1) * (T / 4));
        g.stroke();
      }
    }
    // The split kitchen's two sides get a faint wash so the halves read at a glance.
    if (svc.layout === 'split') {
      svc.grid.forEach((t, i) => {
        if (t.k !== 'floor') return;
        const reg = svc.region[i];
        g.fillStyle = reg === svc.otters[0].region ? 'rgba(36,51,90,.07)' : 'rgba(63,125,74,.08)';
        g.fillRect((i % COLS) * T, Math.floor(i / COLS) * T, T, T);
      });
    }
  }

  function box(g, x, y, top = COL.woodTop, front = COL.woodFront) {
    g.fillStyle = 'rgba(60,35,15,.18)';
    rr(g, x + 3, y + 6, T - 6, T - 4, 7);
    g.fill();
    g.fillStyle = front;
    rr(g, x + 2, y + 4, T - 4, T - 6, 7);
    g.fill();
    g.fillStyle = top;
    rr(g, x + 2, y + 2, T - 4, T - 14, 7);
    g.fill();
    g.strokeStyle = 'rgba(70,45,20,.35)';
    g.lineWidth = 1.2;
    rr(g, x + 2, y + 2, T - 4, T - 6, 7);
    g.stroke();
  }

  function drawStationBase(g, t, x, y, svc, i) {
    const cx = x + T / 2;
    const cy = y + T / 2 - 5;
    switch (t.k) {
      case 'counter':
        box(g, x, y);
        break;
      case 'crate': {
        box(g, x, y, '#b98a55', '#8d6338');
        // slats and the ingredient piled inside
        g.fillStyle = t.ing === 'salmon' || t.ing === 'tuna' || t.ing === 'shrimp' ? '#e3f2f5' : '#d9b77f';
        rr(g, x + 7, y + 7, T - 14, T - 26, 5);
        g.fill();
        g.strokeStyle = 'rgba(60,35,15,.4)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x + 4, y + T - 14);
        g.lineTo(x + T - 4, y + T - 14);
        g.stroke();
        drawIngredient(g, t.ing, cx - 7, cy - 2, 22);
        drawIngredient(g, t.ing, cx + 7, cy + 1, 22);
        break;
      }
      case 'board':
        box(g, x, y);
        g.fillStyle = COL.board;
        rr(g, x + 6, y + 6, T - 12, T - 22, 6);
        g.fill();
        g.strokeStyle = 'rgba(120,85,40,.35)';
        g.lineWidth = 1;
        g.stroke();
        // the knife resting at the side
        g.fillStyle = '#cfd6db';
        rr(g, x + T - 13, y + 8, 4, 18, 2);
        g.fill();
        g.fillStyle = COL.woodDark;
        rr(g, x + T - 13.5, y + 25, 5, 9, 2);
        g.fill();
        break;
      case 'pan':
        box(g, x, y, '#cfd2d6', '#8e949c');
        g.fillStyle = COL.steel;
        rr(g, x + 9, y + 8, T - 22, T - 26, 4);
        g.fill();
        g.fillStyle = '#23262d';
        rr(g, x + T - 14, y + T / 2 - 10, 10, 5, 2);
        g.fill();
        break;
      case 'fryer':
        box(g, x, y, '#cfd2d6', '#8e949c');
        g.fillStyle = COL.steel;
        g.beginPath();
        g.ellipse(cx, cy, T * 0.34, T * 0.26, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#e8b53e';
        g.beginPath();
        g.ellipse(cx, cy, T * 0.28, T * 0.2, 0, 0, Math.PI * 2);
        g.fill();
        break;
      case 'cooker':
        box(g, x, y);
        break;
      case 'plates':
        box(g, x, y);
        for (let k = 0; k < 4; k++) {
          g.fillStyle = '#ffffff';
          g.strokeStyle = 'rgba(42,34,51,.45)';
          g.lineWidth = 1;
          g.beginPath();
          g.ellipse(cx, cy + 6 - k * 4, T * 0.3, T * 0.12, 0, 0, Math.PI * 2);
          g.fill();
          g.stroke();
        }
        break;
      case 'dock':
        box(g, x, y, '#d8b27a', '#a87d48');
        // a little slipway down to the water, with rope lashings
        g.fillStyle = '#c99e64';
        g.beginPath();
        g.moveTo(x + 10, y + 2);
        g.lineTo(x + T - 10, y + 2);
        g.lineTo(x + T - 14, y - 8);
        g.lineTo(x + 14, y - 8);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(70,45,20,.5)';
        g.lineWidth = 1;
        g.stroke();
        g.strokeStyle = COL.vermilion;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x + 6, y + T - 16);
        g.lineTo(x + T - 6, y + T - 16);
        g.stroke();
        break;
      case 'bin':
        box(g, x, y);
        g.fillStyle = '#7d5a3a';
        g.beginPath();
        g.moveTo(x + 14, y + 10);
        g.lineTo(x + T - 14, y + 10);
        g.lineTo(x + T - 17, y + T - 16);
        g.lineTo(x + 17, y + T - 16);
        g.closePath();
        g.fill();
        g.fillStyle = '#4d3524';
        g.beginPath();
        g.ellipse(cx, y + 11, T / 2 - 14, 4, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#c9a26a';
        g.lineWidth = 2;
        for (const yy of [y + 18, y + 30]) {
          g.beginPath();
          g.moveTo(x + 15.5, yy);
          g.lineTo(x + T - 15.5, yy);
          g.stroke();
        }
        break;
    }
  }

  // ── per-frame drawing ──

  function sky(svc, t, morning = false) {
    const k = morning ? 0 : svc ? clamp(svc.t / (TIMES.open + 20)) : 0.35;
    // Morning is a clear blue; the evening runs from sunset to night.
    const top = morning ? '#7fb6dc' : mix('#f3a46b', '#1d2350', ease(clamp(k * 1.3)));
    const mid = morning ? '#bfe0ee' : mix('#f9cf8e', '#3b3f7a', ease(clamp(k * 1.2)));
    const low = morning ? '#f3ecd6' : mix('#fde6b5', '#7c6aa3', ease(k));
    const W0 = R.world;
    const skyTop = Math.min(VIEW.y0, W0.y0) - 4;
    const g = ctx.createLinearGradient(0, skyTop, 0, BAR.top);
    g.addColorStop(0, top);
    g.addColorStop(0.6, mid);
    g.addColorStop(1, low);
    ctx.fillStyle = g;
    ctx.fillRect(W0.x0 - 4, skyTop, W0.x1 - W0.x0 + 8, BAR.top - skyTop + 20);
    // stars come out
    if (k > 0.35) {
      ctx.fillStyle = `rgba(255,248,220,${clamp((k - 0.35) * 2) * 0.8})`;
      const spanW = W0.x1 - W0.x0;
      const spanH = -2.9 * T - skyTop;
      for (let i = 0; i < 40; i++) {
        const sx = W0.x0 + ((i * 97.3) % spanW);
        const sy = skyTop + 6 + ((i * 53.7) % spanH);
        const tw = 0.6 + 0.4 * Math.sin(t * 2 + i);
        ctx.beginPath();
        ctx.arc(sx, sy, 0.9 + (i % 3) * 0.35 * tw, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // the sun sinks, the moon rises
    const sunY = lerp(-3.4 * T, -1.6 * T, clamp(k * 1.6));
    ctx.fillStyle = 'rgba(255,214,140,.9)';
    ctx.beginPath();
    ctx.arc(5.2 * T, sunY, 0.42 * T, 0, Math.PI * 2);
    ctx.fill();
    if (k > 0.25) {
      const my = lerp(-1.8 * T, -3.9 * T, ease(clamp((k - 0.25) * 1.5)));
      ctx.fillStyle = '#fff6dc';
      ctx.beginPath();
      ctx.arc(0.6 * T, my, 0.3 * T, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = mix('#f9cf8e', '#3b3f7a', ease(clamp(k * 1.2)));
      ctx.beginPath();
      ctx.arc(0.6 * T + 7, my - 3, 0.26 * T, 0, Math.PI * 2);
      ctx.fill();
    }
    // spare sky above the scene (tall phones): clouds, far-off gulls and the shop's sign
    if (W0.y0 < VIEW.y0 - 20) {
      ctx.fillStyle = `rgba(255,240,225,${0.35 - k * 0.25})`;
      for (let i = 0; i < 4; i++) {
        const cx = W0.x0 + (((i * 131 + t * (3 + i)) % (W0.x1 - W0.x0 + 120)) - 60);
        const cy = W0.y0 + 30 + i * 34;
        for (const [dx, dy, r] of [
          [0, 0, 14],
          [14, -6, 16],
          [30, 0, 12],
        ]) {
          ctx.beginPath();
          ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.strokeStyle = 'rgba(60,50,70,.5)';
      ctx.lineWidth = 1.3;
      for (let i = 0; i < 3; i++) {
        const gx = W0.x0 + ((i * 97 + t * 9) % (W0.x1 - W0.x0));
        const gy = W0.y0 + 60 + i * 22 + Math.sin(t * 1.3 + i) * 5;
        const f = Math.sin(t * 6 + i) * 2;
        ctx.beginPath();
        ctx.moveTo(gx - 6, gy - f);
        ctx.quadraticCurveTo(gx - 3, gy - 4, gx, gy);
        ctx.quadraticCurveTo(gx + 3, gy - 4, gx + 6, gy - f);
        ctx.stroke();
      }
      if (VIEW.y0 - W0.y0 > 90) shopSign(Math.max(W0.y0 + 18, VIEW.y0 - 78), t, k);
    }
    // the far shore: hills, a lighthouse, and the harbour water
    ctx.fillStyle = morning ? '#8fae8a' : mix('#c98b74', '#2c2d55', ease(k));
    ctx.beginPath();
    ctx.moveTo(W0.x0 - 4, -2.6 * T);
    ctx.lineTo(VIEW.x0 - 20, -2.6 * T);
    ctx.bezierCurveTo(0, -3.3 * T, 1.6 * T, -3.1 * T, 2.6 * T, -2.75 * T);
    ctx.bezierCurveTo(3.6 * T, -2.5 * T, 4.5 * T, -3.0 * T, VIEW.x1 + 20, -2.7 * T);
    ctx.lineTo(W0.x1 + 4, -2.7 * T);
    ctx.lineTo(W0.x1 + 4, BAR.top);
    ctx.lineTo(W0.x0 - 4, BAR.top);
    ctx.fill();
    // lighthouse
    const lx = 6.2 * T;
    ctx.fillStyle = mix('#f6efe0', '#c9c4dc', k);
    ctx.beginPath();
    ctx.moveTo(lx - 7, -2.65 * T);
    ctx.lineTo(lx + 7, -2.65 * T);
    ctx.lineTo(lx + 4.5, -3.35 * T);
    ctx.lineTo(lx - 4.5, -3.35 * T);
    ctx.fill();
    ctx.fillStyle = COL.vermilion;
    ctx.fillRect(lx - 5.5, -3.08 * T, 11, 5);
    if (k > 0.3) {
      const a = t * 1.3;
      ctx.fillStyle = `rgba(255,236,160,${0.25 * clamp((k - 0.3) * 3)})`;
      ctx.beginPath();
      ctx.moveTo(lx, -3.38 * T);
      ctx.lineTo(lx + Math.cos(a) * 2.6 * T, -3.38 * T - 14);
      ctx.lineTo(lx + Math.cos(a) * 2.6 * T, -3.38 * T + 14);
      ctx.fill();
    }
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(lx, -3.4 * T, 4, 0, Math.PI * 2);
    ctx.fill();
    // harbour water behind the bar
    ctx.fillStyle = mix('#7fb8c0', '#2a3f6e', ease(k));
    ctx.fillRect(W0.x0 - 4, -2.75 * T, W0.x1 - W0.x0 + 8, BAR.top + 2.75 * T);
    ctx.strokeStyle = `rgba(255,255,255,${0.25 - k * 0.12})`;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) {
      const yy = -2.65 * T + i * 6;
      const xx = W0.x0 + ((i * 71 + t * 6) % (W0.x1 - W0.x0));
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx + 18, yy);
      ctx.stroke();
    }
    return k;
  }

  /** The shop's wooden sign, hung from two cords (only where a tall screen leaves sky to spare). */
  function shopSign(y, t, k) {
    const x = 3 * T;
    const sway = Math.sin(t * 0.9) * 0.02;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway);
    ctx.strokeStyle = 'rgba(42,34,51,.6)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-60, 0);
    ctx.lineTo(-48, -40);
    ctx.moveTo(60, 0);
    ctx.lineTo(48, -40);
    ctx.stroke();
    ctx.fillStyle = 'rgba(40,20,10,.25)';
    rr(ctx, -84, 4, 168, 46, 9);
    ctx.fill();
    ctx.fillStyle = mix('#c99e64', '#7a5a4a', k * 0.5);
    rr(ctx, -86, 0, 172, 46, 9);
    ctx.fill();
    ctx.fillStyle = mix('#e8c896', '#9a8070', k * 0.5);
    rr(ctx, -80, 4, 160, 38, 7);
    ctx.fill();
    ctx.font = `24px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL.indigo;
    ctx.fillText('Sushi', -28, 24);
    ctx.fillStyle = COL.vermilion;
    ctx.fillText('Raft', 42, 24);
    ctx.restore();
  }

  function lanterns(svc, t, k) {
    const n = svc?.P.lanterns ?? TIMES.lanterns;
    const lit = svc ? (svc.rush > 0 ? n : svc.lanterns) : Math.floor(t / 1.5) % (n + 1);
    const rush = svc && svc.rush > 0;
    const y0 = -4.3 * T;
    // the string sags between two posts
    ctx.strokeStyle = 'rgba(42,34,51,.65)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(VIEW.x0, y0 - 6);
    ctx.quadraticCurveTo(3 * T, y0 + 26, VIEW.x1, y0 - 6);
    ctx.stroke();
    // the posts the string hangs from
    ctx.fillStyle = '#5a3d2a';
    for (const px of [VIEW.x0 + 2, VIEW.x1 - 8]) ctx.fillRect(px, y0 - 12, 6, BAR.top - y0 + 12);
    for (let i = 0; i < n; i++) {
      const fx = (i + 1) / (n + 1);
      const x = lerp(VIEW.x0, VIEW.x1, fx);
      const y = y0 - 6 + 32 * fx * (1 - fx) * 2 - 2;
      const sway = Math.sin(t * 1.6 + i) * (rush ? 0.16 : 0.05);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sway);
      const on = i < lit;
      if (on) {
        ctx.fillStyle = `rgba(255,190,90,${rush ? 0.35 + 0.15 * Math.sin(t * 8 + i) : 0.22})`;
        ctx.beginPath();
        ctx.arc(0, 16, rush ? 26 : 20, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 4);
      ctx.stroke();
      ctx.fillStyle = '#2a2233';
      rr(ctx, -6, 3, 12, 4, 1.5);
      ctx.fill();
      ctx.fillStyle = on ? (rush ? '#ff7a4a' : COL.vermilion) : mix('#a8786f', '#4c3f5a', k);
      ctx.beginPath();
      ctx.ellipse(0, 16, 11, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(42,34,51,.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = on ? 'rgba(255,220,150,.7)' : 'rgba(255,255,255,.18)';
      for (const dy of [-5, 0, 5]) {
        ctx.beginPath();
        ctx.ellipse(0, 16 + dy, 10.5 - Math.abs(dy) * 0.5, 2, 0, 0, Math.PI);
        ctx.stroke();
      }
      ctx.fillStyle = '#2a2233';
      rr(ctx, -6, 25.5, 12, 4, 1.5);
      ctx.fill();
      ctx.restore();
    }
  }

  function customerPos(cu, svc, now) {
    const x = E.seatX(Math.max(0, cu.seat)) * T;
    let dx = 0;
    let alpha = 1;
    if (cu.phase === 'walk') dx = (1 - ease(1 - clamp(cu.t / TIMES.sit))) * 0.9 * T * (cu.seat < SEATS / 2 ? -1 : 1);
    if (cu.phase === 'leave') {
      const k = 1 - clamp(cu.t / TIMES.leave);
      dx = ease(k) * 0.9 * T * (cu.seat < SEATS / 2 ? -1 : 1);
      alpha = 1 - k;
    }
    if (cu.phase === 'walk') alpha = clamp(1 - cu.t / TIMES.sit + 0.3);
    return { x: x + dx, alpha };
  }

  function moodOf(cu, svc) {
    if (cu.phase === 'eat') return 'eating';
    if (cu.phase === 'pay') return cu.ate.some((a) => SPECIES[cu.sp].fav === a.dish) ? 'love' : 'happy';
    if (cu.phase === 'leave') return cu.huff ? 'leaving' : 'happy';
    const frac = cu.pat / cu.patMax;
    // A wanted plate is coming along the far lane.
    for (let i = 0; i < svc.rafts.length; i++) {
      const raft = svc.rafts[i];
      const d = raft.plate && dishFor(raft.plate);
      if (!d || !cu.order.includes(d)) continue;
      const p = E.canalPoint(E.raftS(svc, i));
      if (p.lane === 'far' && p.x > E.seatX(cu.seat) && p.x - E.seatX(cu.seat) < 1.6) return 'eager';
    }
    if (frac < 0.3) return 'cross';
    return 'wait';
  }

  let menuNow = [];
  const dishFor = (plate, menu = menuNow) => {
    const parts = plate.parts;
    return menu.find((d) => DISHES[d].parts.length === parts.length && DISHES[d].parts.every((p) => parts.includes(p))) || null;
  };

  function customers(st, t, k) {
    const svc = st.svc;
    // Seat cushions along the bar.
    for (let s = 0; s < SEATS; s++) {
      const x = E.seatX(s) * T;
      ctx.fillStyle = mix('#5a3a2c', '#2d2140', k * 0.6);
      rr(ctx, x - 20, BAR.top - 12, 40, 14, 6);
      ctx.fill();
    }
    if (!svc) return;
    const seated = svc.customers.filter((c) => c.seat >= 0).sort((a, b) => a.seat - b.seat);
    for (const cu of seated) {
      const { x, alpha } = customerPos(cu, svc);
      const vip = SPECIES[cu.sp].vip;
      const size = vip ? 66 : 52;
      ctx.save();
      ctx.globalAlpha = alpha;
      drawCustomer(ctx, x, SEAT_Y, size, { species: cu.sp, t: t + cu.id * 1.7, mood: moodOf(cu, svc), puff: cu.sp === 'puffer' ? clamp(1 - cu.pat / cu.patMax) : 0 });
      ctx.restore();
    }
  }

  function bar(st, t, k) {
    // The harbour around the pier, so the scene reaches the canvas edges.
    const W0 = R.world;
    ctx.fillStyle = mix('#3f8f9a', '#1d3a5a', ease(k));
    ctx.fillRect(W0.x0 - 4, BAR.bottom - 2, W0.x1 - W0.x0 + 8, W0.y1 - BAR.bottom + 6);
    ctx.strokeStyle = `rgba(255,255,255,${0.16 - k * 0.06})`;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 40; i++) {
      const xx = W0.x0 + ((i * 89.7 + Math.sin(t * 0.5 + i) * 6) % (W0.x1 - W0.x0));
      const yy = BAR.bottom + 10 + ((i * 47.3) % (W0.y1 - BAR.bottom));
      if (xx > -0.3 * T && xx < 6.3 * T && yy > 0) continue; // under the kitchen
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.quadraticCurveTo(xx + 6, yy - 2.5, xx + 12, yy);
      ctx.stroke();
    }
    // pilings under the kitchen's edges
    ctx.fillStyle = mix('#5a3d2a', '#2d2333', k * 0.5);
    for (const px of [-0.2 * T, 6.2 * T - 9]) for (let py = 0.5 * T; py < 6 * T; py += 1.6 * T) ctx.fillRect(px, py, 9, 0.5 * T);
    // The customers' counter: a hinoki ledge with their stacked plates.
    ctx.fillStyle = mix('#d9b07a', '#8f6f58', k * 0.5);
    ctx.fillRect(W0.x0 - 4, BAR.top, W0.x1 - W0.x0 + 8, BAR.bottom - BAR.top);
    ctx.fillStyle = mix('#f0d3a0', '#b49274', k * 0.5);
    ctx.fillRect(W0.x0 - 4, BAR.top, W0.x1 - W0.x0 + 8, 4);
    ctx.fillStyle = 'rgba(60,30,10,.25)';
    ctx.fillRect(W0.x0 - 4, BAR.bottom - 3, W0.x1 - W0.x0 + 8, 3);
    const svc = st?.svc;
    if (!svc) return;
    for (const cu of svc.customers) {
      if (cu.seat < 0 || !cu.ate.length) continue;
      const { x, alpha } = customerPos(cu, svc);
      ctx.save();
      ctx.globalAlpha = alpha;
      cu.ate.forEach((a, i) => {
        const y = BAR.top + 9 - i * 3.2;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(42,34,51,.55)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(x + 15, y, 9, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = rimOf(a.dish);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(x + 15, y, 7.5, 2.6, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();
    }
  }

  function water(svc, t, k) {
    const top = WATER.top;
    const bot = WATER.bottom;
    const midY = (top + bot) / 2;
    const rOut = (bot - top) / 2;
    const channel = () => {
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(6 * T, top);
      ctx.arc(6 * T, midY, rOut, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(0, bot);
      ctx.arc(0, midY, rOut, Math.PI / 2, (Math.PI * 3) / 2);
    };
    // a hinoki rim, so the canal reads as a channel built into the pier
    channel();
    ctx.strokeStyle = mix('#c99e64', '#6a5248', k * 0.5);
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60,30,10,.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = mix(COL.teal, '#1f4f6a', k * 0.6);
    channel();
    ctx.fill();
    // ripples drifting with the current
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = 1.3;
    const flow = svc ? svc.canal * T : t * CANAL.speed * T;
    for (let i = 0; i < 14; i++) {
      const lane = i % 2;
      const yy = lane ? -1.35 * T + ((i * 7) % 11) - 5 : -0.45 * T + ((i * 5) % 11) - 5;
      let xx = ((i * 61 + flow * (lane ? -1 : 1)) % (6 * T) + 6 * T) % (6 * T);
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.quadraticCurveTo(xx + 5, yy - 2, xx + 10, yy);
      ctx.stroke();
    }
    // the median between the lanes: a bamboo rail with little stones
    ctx.fillStyle = mix('#8fb46a', '#4a6a4a', k * 0.6);
    rr(ctx, 0, WATER.divTop, 6 * T, WATER.divBot - WATER.divTop, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(42,60,30,.5)';
    ctx.lineWidth = 1;
    for (let x = 18; x < 6 * T; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, WATER.divTop + 1);
      ctx.lineTo(x, WATER.divBot - 1);
      ctx.stroke();
    }
    // the kitchen's ledge along the near lane
    ctx.fillStyle = COL.woodFront;
    ctx.fillRect(-0.2 * T, -0.12 * T, 6.4 * T, 0.12 * T + 2);
  }

  function rafts(st, t) {
    const svc = st.svc;
    if (!svc) return;
    svc.rafts.forEach((raft, i) => {
      const s = E.raftS(svc, i);
      const p = E.canalPoint(s);
      const p2 = E.canalPoint(s + 0.05);
      const ang = Math.atan2(p2.y - p.y, p2.x - p.x);
      const x = p.x * T;
      const y = p.y * T + Math.sin(t * 2.4 + i) * 1.2;
      ctx.save();
      ctx.translate(x, y);
      ctx.save();
      ctx.rotate(ang);
      // bamboo raft: five poles lashed together
      ctx.fillStyle = 'rgba(10,40,50,.25)';
      rr(ctx, -17, -11, 34, 24, 6);
      ctx.fill();
      for (let b = 0; b < 5; b++) {
        ctx.fillStyle = b % 2 ? '#c9b26a' : '#d8c27c';
        rr(ctx, -16, -10 + b * 4.2, 32, 4, 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#7a5a2e';
      ctx.lineWidth = 1.4;
      for (const bx of [-10, 10]) {
        ctx.beginPath();
        ctx.moveTo(bx, -10.5);
        ctx.lineTo(bx, 10.5);
        ctx.stroke();
      }
      ctx.restore();
      if (raft.plate) drawPlateWithFood(ctx, 0, -3, 30, raft.plate, raft.laps >= CANAL.laps - 1 ? 0.75 : 1);
      ctx.restore();
    });
  }

  function drawPlateWithFood(g, x, y, s, plate, alpha = 1, menu = menuNow) {
    const dish = dishFor(plate, menu);
    g.save();
    if (alpha < 1) g.globalAlpha = alpha;
    drawPlate(g, x, y, s, dish ? rimOf(dish) : '#d8d2c4');
    if (dish) drawDish(g, dish, x, y - s * 0.12, s * 0.76);
    else {
      plate.parts.forEach((p, i) => {
        const n = plate.parts.length;
        const off = (i - (n - 1) / 2) * s * 0.26;
        drawIngredient(g, p, x + off, y - s * 0.08, s * 0.5);
      });
    }
    g.restore();
  }
  R.drawPlateWithFood = drawPlateWithFood;

  function drawItem(g, item, x, y, s = 30) {
    if (item.plate) drawPlateWithFood(g, x, y, s * 1.15, item);
    else drawIngredient(g, item.k, x, y, s);
  }

  function ring(x, y, r, k, color, back = 'rgba(42,34,51,.25)') {
    ctx.lineWidth = 4;
    ctx.strokeStyle = back;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(k));
    ctx.stroke();
  }

  function stations(st, t) {
    const svc = st.svc;
    svc.grid.forEach((tile, i) => {
      const x = (i % COLS) * T;
      const y = Math.floor(i / COLS) * T;
      const cx = x + T / 2;
      const cy = y + T / 2 - 6;
      if (tile.k === 'cooker') {
        // a round white rice cooker; pips for servings, steam while cooking
        const open = tile.servings <= 0 && !(tile.cook > 0);
        ctx.fillStyle = '#f7f4ee';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.4;
        rr(ctx, cx - 17, cy - 12, 34, 26, 10);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = open ? '#e9e2d4' : '#ffffff';
        ctx.beginPath();
        ctx.ellipse(cx, cy - 11 - (open ? 6 : 0), 16, 6, open ? -0.35 : 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = COL.vermilion;
        ctx.beginPath();
        ctx.arc(cx, cy - 13 - (open ? 6 : 0), 2.4, 0, Math.PI * 2);
        ctx.fill();
        const max = svc.P.servings;
        for (let k = 0; k < max; k++) {
          const px = cx - (max - 1) * 2.6 + k * 5.2;
          ctx.fillStyle = k < tile.servings ? '#fbf6ea' : 'rgba(42,34,51,.25)';
          ctx.strokeStyle = 'rgba(42,34,51,.5)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(px, cy + 4, 2.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        if (tile.cook > 0) {
          ring(cx, cy, 22, 1 - tile.cook / svc.P.rice, '#7cc4d0');
          for (let k = 0; k < 3; k++) {
            const ph = (t * 0.8 + k / 3) % 1;
            ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - ph)})`;
            ctx.beginPath();
            ctx.arc(cx - 6 + k * 6 + Math.sin(ph * 6 + k) * 3, cy - 18 - ph * 20, 3 + ph * 4, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (open) {
          bounceBadge(cx + 14, cy - 18, '!', t);
        }
      }
      if (tile.k === 'fryer' && tile.item) {
        for (let k = 0; k < 5; k++) {
          const ph = (t * 1.7 + k * 0.37) % 1;
          ctx.fillStyle = `rgba(255,250,220,${0.8 * (1 - ph)})`;
          ctx.beginPath();
          ctx.arc(cx - 12 + k * 6, cy + 4 - ph * 8, 1.5 + ph * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (!tile.item) return;
      const item = tile.item;
      drawItem(ctx, item, cx, cy, tile.k === 'crate' ? 24 : 30);
      if (tile.k === 'board' && PREP[item.k]?.at === 'board' && item.prog > 0) ring(cx, cy, 22, item.prog, '#ffffff');
      if (tile.k === 'pan' || tile.k === 'fryer') {
        const cookT = tile.k === 'pan' ? TIMES.pan : TIMES.fryer;
        const burnT = (tile.k === 'pan' ? TIMES.panBurn : TIMES.fryerBurn) * svc.P.burn;
        if (PREP[item.k]) ring(cx, cy, 22, item.cook / cookT, '#f6cf4a');
        else if (!item.k.endsWith('_b')) {
          const left = 1 - (item.cook - cookT) / burnT;
          const warn = left < 0.4;
          ring(cx, cy, 22, left, warn && Math.sin(t * 18) > 0 ? COL.vermilion : '#7bc46a');
        } else {
          ctx.fillStyle = 'rgba(80,80,80,.35)';
          ctx.beginPath();
          ctx.arc(cx + Math.sin(t * 3) * 4, cy - 16 - ((t * 20) % 12), 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (tile.k === 'dock') {
        // a little bell sways while the plate waits for a raft
        ctx.fillStyle = '#e2b84a';
        ctx.beginPath();
        ctx.arc(x + T - 9, y + 6 + Math.sin(t * 9) * 1.5, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function bounceBadge(x, y, text, t) {
    const b = Math.abs(Math.sin(t * 5)) * 3;
    ctx.fillStyle = COL.vermilion;
    ctx.beginPath();
    ctx.arc(x, y - b, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - b + 0.5);
  }

  function pins(st, me) {
    const svc = st.svc;
    svc.otters.forEach((o, oi) => {
      const list = [...(o.goal ? [o.goal] : []), ...o.queue];
      const color = OTTERS[oi].color;
      const seen = new Map();
      list.forEach((g, n) => {
        const key = `${g.c},${g.r}`;
        const k = seen.get(key) || 0;
        seen.set(key, k + 1);
        const x = g.c * T + (oi ? 12 : T - 12) - (oi ? -1 : 1) * k * 13;
        const y = g.r * T + 11;
        ctx.fillStyle = color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 7.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `10px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n + 1), x, y + 0.5);
      });
    });
  }

  function otters(st, t, { me, solo }) {
    const svc = st.svc;
    const list = svc.otters.slice().sort((a, b) => (a.drawY ?? a.y) - (b.drawY ?? b.y));
    for (const o of list) {
      const walking = o.path.length > 0;
      const ox = o.drawX ?? o.x;
      const oy = o.drawY ?? o.y;
      const x = ox * T + (svc.otters.some((p) => p !== o && Math.hypot((p.drawX ?? p.x) - ox, (p.drawY ?? p.y) - oy) < 0.4) ? (o.i ? 8 : -8) : 0);
      const y = oy * T + 0.3 * T;
      const selected = solo ? st.sel === o.i : me === o.i;
      const { hx, hy } = drawOtter(ctx, x, y, 52, {
        who: OTTERS[o.i].id,
        t: t + o.i * 2.3,
        walk: walking,
        facing: o.facing,
        work: o.act ? 'chop' : null,
        holding: !!o.hold,
        mood: o.mood === 'oops' ? 'oops' : o.mood === 'happy' ? 'happy' : 'idle',
        selected,
      }) || { hx: x, hy: y - 30 };
      if (o.hold) drawItem(ctx, o.hold, hx, hy, 26);
      if (o.mood === 'oops' && o.moodT > 0) {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(x + 16, y - 58, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = INK;
        ctx.font = `12px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', x + 16, y - 57.5);
      }
    }
  }

  function bubbles(st, t) {
    const svc = st.svc;
    // Dishes already sailing to someone fade in their bubble, with a tick.
    const ways = E.onTheWay(st);
    R.bubbleHits = [];
    for (const cu of svc.customers) {
      if (cu.seat < 0 || cu.phase === 'leave' || cu.phase === 'walk' || !cu.order.length) continue;
      const { x } = customerPos(cu, svc);
      const n = cu.order.length;
      const per = n > 3 ? 3 : n;
      const rows = Math.ceil(n / per);
      const s = n === 1 ? 26 : n === 2 ? 21 : 17;
      const w = per * (s + 3) + 8;
      const h = rows * (s * 0.8 + 3) + 9;
      const vip = SPECIES[cu.sp].vip;
      const by = SEAT_Y - (vip ? 70 : 56) - h;
      const bx = clamp(x - w / 2, VIEW.x0 + 2, VIEW.x1 - w - 2);
      const frac = clamp(cu.pat / cu.patMax);
      const urgent = frac < 0.3 && cu.phase === 'wait';
      ctx.fillStyle = 'rgba(42,34,51,.25)';
      rr(ctx, bx + 1, by + 2, w, h, 9);
      ctx.fill();
      ctx.fillStyle = urgent ? '#fff1ea' : '#fffdf6';
      ctx.strokeStyle = urgent && Math.sin(t * 10) > 0 ? COL.vermilion : INK;
      ctx.lineWidth = 1.4;
      rr(ctx, bx, by, w, h, 9);
      ctx.fill();
      ctx.stroke();
      // tail toward the customer
      ctx.beginPath();
      ctx.moveTo(x - 4, by + h - 0.5);
      ctx.lineTo(x, by + h + 6);
      ctx.lineTo(x + 4, by + h - 0.5);
      ctx.fillStyle = urgent ? '#fff1ea' : '#fffdf6';
      ctx.fill();
      const coming = (ways[cu.id] || []).slice();
      const hit = { x: bx, y: by, w, h, cx: x, dishes: [] };
      cu.order.forEach((d, j) => {
        const col = j % per;
        const row = Math.floor(j / per);
        const dx = bx + 4 + col * (s + 3) + (s + 3) / 2;
        const dy = by + 5 + row * (s * 0.8 + 3) + s * 0.4;
        const k = coming.indexOf(d);
        if (k >= 0) coming.splice(k, 1);
        ctx.save();
        if (k >= 0) ctx.globalAlpha = 0.4;
        ctx.fillStyle = rimOf(d);
        ctx.beginPath();
        ctx.ellipse(dx, dy + s * 0.18, s * 0.5, s * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        drawDish(ctx, d, dx, dy, s);
        ctx.restore();
        if (k >= 0) tick(dx + s * 0.34, dy + s * 0.2, Math.max(4.6, s * 0.24));
        hit.dishes.push({ d, x: dx });
      });
      R.bubbleHits.push(hit);
      // patience: a bar along the bubble's foot
      ctx.fillStyle = 'rgba(42,34,51,.15)';
      rr(ctx, bx + 5, by + h - 5, w - 10, 3, 1.5);
      ctx.fill();
      ctx.fillStyle = frac > 0.55 ? '#6cb35f' : frac > 0.3 ? '#efb23a' : COL.vermilion;
      rr(ctx, bx + 5, by + h - 5, (w - 10) * frac, 3, 1.5);
      ctx.fill();
    }
  }

  function gulls(st, t) {
    for (const g of st.svc.gulls) {
      const x = g.x * T;
      const y = g.y * T;
      if (g.state === 'grab' || (g.state === 'flee' && g.plate)) {
        drawGull(ctx, x, y, 44, { t, state: 'grab' });
        if (g.plate) drawPlateWithFood(ctx, x, y + 19, 26, g.plate);
      } else if (g.state === 'flee' && g.x < 3) {
        // the art flees rightward: mirror it for gulls heading left
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(-1, 1);
        drawGull(ctx, 0, 0, 44, { t, state: 'flee' });
        ctx.restore();
      } else drawGull(ctx, x, y, 44, { t, state: g.state });
      if (g.state === 'fly') {
        ctx.strokeStyle = `rgba(222,75,58,${0.5 + 0.4 * Math.sin(t * 12)})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(x, y, 28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  function effects(now) {
    R.fx = R.fx.filter((f) => now - f.t0 < f.dur);
    for (const f of R.fx) {
      const k = (now - f.t0) / f.dur;
      if (k < 0) continue;
      if (f.kind === 'text') {
        const y = f.y - ease(Math.min(1, k * 1.6)) * (f.rise ?? 34);
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        ctx.font = `${f.size || 16}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = f.stroke || 'rgba(42,34,51,.85)';
        ctx.strokeText(f.text, f.x, y);
        ctx.fillStyle = f.color || '#ffe08a';
        ctx.fillText(f.text, f.x, y);
        ctx.globalAlpha = 1;
      } else if (f.kind === 'ripple') {
        ctx.strokeStyle = f.color || 'rgba(255,255,255,.8)';
        ctx.lineWidth = 2.5 * (1 - k);
        ctx.beginPath();
        ctx.arc(f.x, f.y, 8 + k * (f.r || 22), 0, Math.PI * 2);
        ctx.stroke();
      } else if (f.kind === 'splash') {
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI / 2 + (i - 3) * 0.4;
          const d = ease(k) * 16;
          ctx.fillStyle = `rgba(220,245,250,${1 - k})`;
          ctx.beginPath();
          ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d + k * k * 10, 2.4 * (1 - k * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (f.kind === 'hearts') {
        for (let i = 0; i < 3; i++) {
          const hx = f.x + (i - 1) * 12 + Math.sin(k * 6 + i) * 3;
          const hy = f.y - ease(k) * 30 - i * 5;
          ctx.globalAlpha = 1 - k;
          heart(hx, hy, 5 + i);
          ctx.globalAlpha = 1;
        }
      } else if (f.kind === 'puff') {
        ctx.fillStyle = `rgba(90,80,90,${0.5 * (1 - k)})`;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(f.x + (i - 1.5) * 9, f.y - k * 18 - (i % 2) * 5, 6 + k * 6, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (f.kind === 'feathers') {
        for (let i = 0; i < 6; i++) {
          const a = i * 1.05;
          ctx.fillStyle = `rgba(255,255,255,${1 - k})`;
          ctx.save();
          ctx.translate(f.x + Math.cos(a) * k * 30, f.y + Math.sin(a) * k * 20 + k * 14);
          ctx.rotate(a + k * 3);
          ctx.beginPath();
          ctx.ellipse(0, 0, 5, 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  function heart(x, y, s) {
    ctx.fillStyle = '#ff6f91';
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.4, y - s * 0.2, x - s * 0.5, y - s * 1.2, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s * 0.5, y - s * 1.2, x + s * 1.4, y - s * 0.2, x, y + s * 0.9);
    ctx.fill();
  }

  function cursorBox(st, t) {
    const c = R.cursor;
    if (!c) return;
    ctx.strokeStyle = `rgba(255,255,255,${0.7 + 0.3 * Math.sin(t * 6)})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    rr(ctx, c.c * T + 3, c.r * T + 3, T - 6, T - 6, 8);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── reading aids: the station glow, the ticks, the recipes ──

  /** A canal-teal disc with a white tick: this dish is already on its way to them. */
  function tick(x, y, r) {
    ctx.save();
    ctx.fillStyle = COL.teal;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = Math.max(1.5, r * 0.34);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.45, y + r * 0.02);
    ctx.lineTo(x - r * 0.1, y + r * 0.38);
    ctx.lineTo(x + r * 0.5, y - r * 0.36);
    ctx.stroke();
    ctx.restore();
  }

  /** Where the thing in otter `oi`'s paws goes next: those stations' tops washed in its colour. */
  function stopGlow(st, t, oi, still) {
    const stops = E.nextStops(st, oi);
    R.glowN = stops.length;
    if (!stops.length) return;
    const [lr, lg, lb] = hexToRgb(OTTERS[oi].light);
    const pulse = still ? 1 : 0.75 + 0.25 * Math.sin(t * 4);
    ctx.save();
    for (const p of stops) {
      const x = p.c * T;
      const y = p.r * T;
      // Lantern light on the station's top, ringed in the otter's colour with a soft halo.
      ctx.fillStyle = `rgba(255,246,214,${0.55 * pulse})`;
      rr(ctx, x + 2, y + 2, T - 4, T - 14, 7);
      ctx.fill();
      ctx.shadowColor = `rgba(${lr},${lg},${lb},${0.9 * pulse})`;
      ctx.shadowBlur = 10 * R.scale * R.dpr;
      ctx.strokeStyle = `rgba(${lr},${lg},${lb},${0.95 * pulse})`;
      ctx.lineWidth = 3;
      rr(ctx, x + 1.5, y + 1.5, T - 3, T - 5, 8);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }
    ctx.restore();
  }

  // A recipe row: the dish on its rim-coloured plate, its name, then its parts in a row.
  const ROW_H = 38;
  const PART_DX = 20;
  const NAME_FONT = `700 10.5px ${BODY}`;
  function rowWidth(dish) {
    ctx.font = NAME_FONT;
    return Math.max(42 + ctx.measureText(DISHES[dish].name).width, 51 + (DISHES[dish].parts.length - 1) * PART_DX + 9);
  }
  function recipeRow(g, dish, x, y) {
    const parts = DISHES[dish].parts;
    drawPlateWithFood(g, x + 18, y + 3, 32, { plate: true, parts: parts.slice() }, 1, [dish]);
    g.font = NAME_FONT;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = INK;
    g.fillText(DISHES[dish].name, x + 42, y - 8);
    parts.forEach((part, i) => {
      const px = x + 51 + i * PART_DX;
      const py = y + 9;
      g.fillStyle = 'rgba(251,246,234,.95)';
      g.strokeStyle = 'rgba(120,80,40,.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(px, py, 8.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      drawIngredient(g, part, px, py, 15);
    });
  }

  /** The menu board on its posts in the harbour, left of the pier, wherever the screen has room. */
  function menuBoard(st, k, wants) {
    const menu = st.menu;
    const w = Math.max(...menu.map(rowWidth)) + 46;
    const h = 34 + menu.length * ROW_H + 8;
    const x1 = -0.45 * T;
    const x0 = x1 - w;
    const y0 = 0.35 * T;
    R.boardShown = menu.length > 0 && x0 >= R.world.x0 + 10;
    if (!R.boardShown) return;
    // posts down into the water
    ctx.fillStyle = mix('#5a3d2a', '#2d2333', k * 0.5);
    for (const px of [x0 + 20, x1 - 27]) ctx.fillRect(px, y0 + h - 6, 7, 30);
    ctx.strokeStyle = `rgba(255,255,255,${0.22 - k * 0.08})`;
    ctx.lineWidth = 1.2;
    for (const px of [x0 + 23.5, x1 - 23.5]) {
      ctx.beginPath();
      ctx.ellipse(px, y0 + h + 24, 9, 2.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const key = `${menu.join()}|${R.scale}|${R.dpr}`;
    const pad = 6;
    const s = R.scale * R.dpr;
    if (R.boardKey !== key || !R.boardCache) {
      const off = R.boardCache || document.createElement('canvas');
      off.width = Math.ceil((w + pad * 2) * s);
      off.height = Math.ceil((h + pad * 2) * s);
      const g = off.getContext('2d');
      g.setTransform(s, 0, 0, s, pad * s, pad * s);
      g.clearRect(-pad, -pad, w + pad * 2, h + pad * 2);
      g.fillStyle = 'rgba(40,20,10,.28)';
      rr(g, 3, 5, w, h, 10);
      g.fill();
      g.fillStyle = COL.woodFront;
      rr(g, 0, 0, w, h, 10);
      g.fill();
      g.fillStyle = COL.wood;
      rr(g, 5, 5, w - 10, h - 10, 7);
      g.fill();
      g.strokeStyle = COL.woodLine;
      g.lineWidth = 1;
      for (let yy = 14; yy < h - 8; yy += 11) {
        g.beginPath();
        g.moveTo(9, yy);
        g.lineTo(w - 9, yy + ((yy * 7) % 3) - 1);
        g.stroke();
      }
      g.font = `15px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = COL.indigo;
      g.fillText('Menu', w / 2, 20);
      g.strokeStyle = 'rgba(120,80,40,.3)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(14, 33);
      g.lineTo(w - 14, 33);
      g.stroke();
      menu.forEach((d, i) => recipeRow(g, d, 12, 34 + i * ROW_H + ROW_H / 2));
      R.boardCache = off;
      R.boardKey = key;
    }
    ctx.drawImage(R.boardCache, x0 - pad, y0 - pad, R.boardCache.width / s, R.boardCache.height / s);
    if (k > 0.02) {
      ctx.fillStyle = `rgba(29,35,80,${k * 0.3})`;
      rr(ctx, x0, y0, w, h, 10);
      ctx.fill();
    }
    // How many of each dish the bar is still waiting for (beyond what's already sailing).
    menu.forEach((d, i) => {
      const n = wants[d] || 0;
      if (n <= 0) return;
      const y = y0 + 34 + i * ROW_H + ROW_H / 2;
      ctx.fillStyle = COL.vermilion;
      rr(ctx, x1 - 31, y - 9, 24, 18, 9);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`×${n}`, x1 - 19, y + 0.5);
    });
  }

  /** A tapped order bubble shows that dish's recipe on a slip for a moment. */
  R.showRecipe = (dish, at) => (R.recipe = { dish, x: at.x, top: at.top, t0: performance.now() / 1000 });
  const RECIPE_SECS = 2.8;
  function recipeCard(now) {
    const c = R.recipe;
    if (!c) return;
    const age = now - c.t0;
    if (age > RECIPE_SECS) {
      R.recipe = null;
      return;
    }
    const w = rowWidth(c.dish) + 22;
    const h = 46;
    const W0 = R.world;
    const x = clamp(c.x - w / 2, W0.x0 + 4, W0.x1 - w - 4);
    let y = c.top - h - 10;
    if (y < W0.y0 + 4) y = BAR.bottom + 6;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, age / 0.12, (RECIPE_SECS - age) / 0.4));
    ctx.fillStyle = 'rgba(42,34,51,.25)';
    rr(ctx, x + 1, y + 3, w, h, 10);
    ctx.fill();
    ctx.fillStyle = '#fffdf6';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    rr(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
    recipeRow(ctx, c.dish, x + 11, y + h / 2);
    ctx.restore();
  }

  /**
   * Draw a frame. `opts`: { me (seat), solo, coach: {c, r} | null, morning, board (show the menu
   * board if it fits), glow (an otter whose next stops light up, or null), still (reduced motion) }
   */
  R.draw = function (st, t, opts = {}) {
    const now = performance.now() / 1000;
    R.glowN = 0;
    ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    ctx.clearRect(0, 0, R.cssW, R.cssH);
    ctx.fillStyle = '#1b2440';
    ctx.fillRect(0, 0, R.cssW, R.cssH);
    const k = R.scale * R.dpr;
    ctx.setTransform(k, 0, 0, k, R.ox * R.dpr, R.oy * R.dpr);
    ctx.save();
    if (opts.shake) ctx.translate(Math.sin(now * 61) * opts.shake, Math.cos(now * 47) * opts.shake);
    const svc = st?.svc;
    menuNow = st?.menu || [];
    const night = sky(svc, t, opts.morning);
    lanterns(svc, t, night);
    customers(st || {}, t, night);
    bar(st, t, night);
    water(svc, t, night);
    if (opts.board && st?.menu) menuBoard(st, night, svc && !opts.morning ? E.demand(st) : {});
    else R.boardShown = false;
    if (svc) {
      rafts(st, t);
      const base = kitchenBase(svc);
      const pad = R.kitchenPad;
      ctx.drawImage(base, -pad, -pad, base.width / k, base.height / k);
      if (opts.glow != null) stopGlow(st, t, opts.glow, opts.still);
      stations(st, t);
      if (opts.coach) coachRing(opts.coach, t);
      pins(st, opts.me);
      otters(st, t, opts);
      cursorBox(st, t);
      bubbles(st, t);
      gulls(st, t);
      if (svc.rush > 0) rushGlow(t, svc.rush);
    }
    effects(now);
    recipeCard(now);
    ctx.restore();
  };

  function coachRing(c, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    ctx.strokeStyle = `rgba(255,224,138,${0.6 + 0.4 * pulse})`;
    ctx.lineWidth = 3 + pulse * 2;
    rr(ctx, c.c * T + 1, c.r * T + 1, T - 2, T - 2, 10);
    ctx.stroke();
  }

  function rushGlow(t, left) {
    ctx.save();
    const a = Math.min(1, left / 2) * (0.18 + 0.08 * Math.sin(t * 6));
    const g = ctx.createRadialGradient(3 * T, -2 * T, T, 3 * T, -2 * T, 6 * T);
    g.addColorStop(0, `rgba(255,170,80,0)`);
    g.addColorStop(1, `rgba(255,140,60,${a})`);
    ctx.fillStyle = g;
    // The whole visible harbour, not just the scene's box (wide screens showed its edges).
    const W0 = R.world;
    ctx.fillRect(W0.x0 - 4, W0.y0 - 4, W0.x1 - W0.x0 + 8, W0.y1 - W0.y0 + 8);
    ctx.restore();
  }

  /** The closing scene: the harbour at night, the moon, and the two otters floating holding paws. */
  R.drawClosing = function (t) {
    ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    const w = R.cssW;
    const h = R.cssH;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#141a3a');
    g.addColorStop(0.55, '#2b2f5e');
    g.addColorStop(0.56, '#1f3f5c');
    g.addColorStop(1, '#14283f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(255,248,220,${0.4 + 0.4 * Math.sin(t * 1.5 + i)})`;
      ctx.beginPath();
      ctx.arc((i * 137.5) % w, ((i * 71.3) % (h * 0.5)) + 4, 1 + (i % 3) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    const mx = w * 0.72;
    const my = h * 0.2;
    ctx.fillStyle = 'rgba(255,240,200,.12)';
    ctx.beginPath();
    ctx.arc(mx, my, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff4d6';
    ctx.beginPath();
    ctx.arc(mx, my, 30, 0, Math.PI * 2);
    ctx.fill();
    // moonlight on the water
    for (let i = 0; i < 9; i++) {
      const y = h * 0.6 + i * 12;
      const ww = 50 - i * 3 + Math.sin(t * 2 + i) * 8;
      ctx.fillStyle = `rgba(255,240,200,${0.25 - i * 0.02})`;
      ctx.fillRect(mx - ww / 2, y, ww, 2.5);
    }
    const s = Math.min(w / 2.8, h / 3.4, 190);
    drawFloatingOtters(ctx, w / 2, h * 0.74, s, t);
  };

  return R;
}
