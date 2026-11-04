// The night garden: a scenery layer painted once per resize (sky, smoke haze, stars, rooftops,
// fence, patio) and a fireworks layer drawn every frame with additive light and fading trails.
//
//   const sky = createSky({ scenery, canvas, onFlash });
//   sky.layout({ skyRect, horizon })          // after any resize
//   sky.launch({ x, color, kind, size, onBurst })
//   sky.burst(x, y, { kind, color, size })
//   sky.update(dt); sky.render(dt);
import { createRng } from '../../../shared/rng.js';

export const COLOURS = {
  red: [255, 72, 64],
  gold: [255, 186, 64],
  green: [86, 232, 120],
  blue: [92, 150, 255],
  white: [236, 238, 255],
  glitter: [255, 178, 70],
  ember: [255, 130, 50],
};
export const SUIT_COLOUR = ['red', 'gold', 'green', 'blue'];

const TAU = Math.PI * 2;

export function createSky({ scenery, canvas, onFlash = () => {} }) {
  const ctx = canvas.getContext('2d');
  const sctx = scenery.getContext('2d');
  let dpr = 0;
  let W = 0;
  let H = 0;
  let area = { x: 0, y: 0, w: 300, h: 200 };
  let horizon = 200;
  const parts = [];
  const rockets = [];
  const timers = []; // { at, fn } on the sky's own clock
  let clock = 0;
  let fresh = false; // has the simulation moved since the last frame was drawn?
  let rnd = Math.random;
  const MAX = 5000;

  function resize() {
    const d = Math.min(2, window.devicePixelRatio || 1);
    if (d === dpr && W === window.innerWidth && H === window.innerHeight) return;
    dpr = d;
    W = window.innerWidth;
    H = window.innerHeight;
    for (const c of [canvas, scenery]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      c.style.width = `${W}px`;
      c.style.height = `${H}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function layout({ skyRect, horizon: hz }) {
    resize();
    area = skyRect;
    horizon = hz;
    paintScenery();
    fresh = true; // draw what's in the air again (a resize clears the canvas)
  }

  // ---------- scenery ----------
  function paintScenery() {
    const g = sctx;
    const rng = createRng('garden');
    g.clearRect(0, 0, W, H);
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#060b18');
    sky.addColorStop(0.55, '#121834');
    sky.addColorStop(0.86, '#2a2338');
    sky.addColorStop(1, '#4a2e33');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, horizon + 2);
    // stars, hazed out near the horizon
    for (let i = 0; i < Math.round((W * horizon) / 2600); i++) {
      const x = rng.next() * W;
      const y = rng.next() ** 1.6 * horizon * 0.8;
      const a = (1 - y / horizon) * (0.25 + rng.next() * 0.55);
      g.fillStyle = `rgba(230,232,255,${a.toFixed(3)})`;
      const r = rng.next() < 0.08 ? 1.3 : 0.7;
      g.fillRect(x, y, r, r);
    }
    // a hazy moon
    const mx = W * 0.86;
    const my = Math.max(40, horizon * 0.2);
    const mr = Math.max(10, Math.min(22, horizon * 0.06));
    const halo = g.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 5);
    halo.addColorStop(0, 'rgba(240,226,200,0.18)');
    halo.addColorStop(1, 'rgba(240,226,200,0)');
    g.fillStyle = halo;
    g.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
    // a crescent: the disc with an offset disc cut out of it (on its own canvas)
    const moon = document.createElement('canvas');
    const ms = Math.ceil(mr * 2 + 4);
    moon.width = moon.height = ms * dpr;
    const m = moon.getContext('2d');
    m.scale(dpr, dpr);
    m.fillStyle = '#efe2c6';
    m.beginPath();
    m.arc(ms / 2, ms / 2, mr, 0, TAU);
    m.fill();
    m.globalCompositeOperation = 'destination-out';
    m.beginPath();
    m.arc(ms / 2 - mr * 0.5, ms / 2 - mr * 0.18, mr * 0.9, 0, TAU);
    m.fill();
    g.drawImage(moon, mx - ms / 2, my - ms / 2, ms, ms);
    // smoke drifting low over the gardens
    for (let i = 0; i < 9; i++) {
      const x = rng.next() * W;
      const y = horizon - horizon * (0.08 + rng.next() * 0.3);
      const r = 60 + rng.next() * 180;
      const sm = g.createRadialGradient(x, y, 0, x, y, r);
      sm.addColorStop(0, 'rgba(120,96,110,0.10)');
      sm.addColorStop(1, 'rgba(120,96,110,0)');
      g.fillStyle = sm;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // distant terraced rooftops with chimneys
    g.fillStyle = '#0d0e1a';
    let x = -20;
    const roofBase = horizon - Math.min(70, horizon * 0.2);
    g.beginPath();
    g.moveTo(-20, horizon);
    while (x < W + 40) {
      const w = 70 + rng.next() * 60;
      const h = 18 + rng.next() * 16;
      g.lineTo(x, roofBase);
      g.lineTo(x + w / 2, roofBase - h);
      g.lineTo(x + w, roofBase);
      // chimney
      if (rng.next() < 0.7) {
        const cx = x + w * (0.2 + rng.next() * 0.5);
        g.lineTo(cx, roofBase);
      }
      x += w;
    }
    g.lineTo(W + 40, horizon);
    g.closePath();
    g.fill();
    // chimney stacks
    x = 0;
    const chimneys = createRng('chimneys');
    while (x < W) {
      x += 50 + chimneys.next() * 90;
      const ch = 10 + chimneys.next() * 10;
      g.fillRect(x, roofBase - 30 - ch * 0.4, 9, 30);
      g.fillRect(x - 2, roofBase - 32 - ch * 0.4, 13, 3);
    }
    // windows: a few lit ones
    for (let i = 0; i < W / 70; i++) {
      if (rng.next() < 0.45) continue;
      const wx = rng.next() * W;
      const wy = roofBase + 6 + rng.next() * Math.max(4, horizon - roofBase - 24);
      g.fillStyle = rng.next() < 0.5 ? 'rgba(255,196,110,0.55)' : 'rgba(255,170,90,0.35)';
      g.fillRect(wx, wy, 7, 9);
    }
    // a bare tree on the right
    tree(g, W * 0.72, horizon, Math.min(150, horizon * 0.55), createRng('tree'));
    // the garden fence along the horizon
    g.fillStyle = '#16120f';
    const fenceTop = horizon - Math.min(38, horizon * 0.12);
    g.fillRect(0, fenceTop + 6, W, horizon - fenceTop - 6);
    for (let px = 0; px < W; px += 14) {
      g.fillRect(px, fenceTop + (px % 28 ? 2 : 0), 11, horizon - fenceTop);
    }
    g.fillStyle = 'rgba(255,140,60,0.10)';
    g.fillRect(0, fenceTop + 6, W, 2);
    // patio below
    const pat = g.createLinearGradient(0, horizon, 0, H);
    pat.addColorStop(0, '#2b231f');
    pat.addColorStop(1, '#14100f');
    g.fillStyle = pat;
    g.fillRect(0, horizon, W, H - horizon);
    // flagstone joints
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 1.5;
    let y = horizon;
    let row = 0;
    while (y < H) {
      const hRow = 46 + row * 10;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
      let fx = (row % 2) * 40 - 30;
      while (fx < W) {
        g.beginPath();
        g.moveTo(fx, y);
        g.lineTo(fx - 6, y + hRow);
        g.stroke();
        fx += 90 + ((row * 37 + fx) % 50);
      }
      y += hRow;
      row++;
    }
    // stone speckle
    for (let i = 0; i < (W * (H - horizon)) / 900; i++) {
      g.fillStyle = rng.next() < 0.5 ? 'rgba(255,240,220,0.035)' : 'rgba(0,0,0,0.12)';
      g.fillRect(rng.next() * W, horizon + rng.next() * (H - horizon), 2, 2);
    }
    // bonfire light across the patio (from the left of the horizon)
    const fx = Math.min(W * 0.12, 120);
    const light = g.createRadialGradient(fx, horizon, 10, fx, horizon, Math.max(W, H) * 0.7);
    light.addColorStop(0, 'rgba(255,120,40,0.30)');
    light.addColorStop(0.4, 'rgba(255,100,40,0.10)');
    light.addColorStop(1, 'rgba(255,100,40,0)');
    g.fillStyle = light;
    g.fillRect(0, horizon - 80, W, H - horizon + 80);
  }

  function tree(g, x, base, h, rng) {
    g.strokeStyle = '#0b0c15';
    g.lineCap = 'round';
    const branch = (x0, y0, len, ang, w, depth) => {
      const x1 = x0 + Math.cos(ang) * len;
      const y1 = y0 + Math.sin(ang) * len;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      if (depth <= 0) return;
      const n = 2 + (rng.next() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        branch(x1, y1, len * (0.6 + rng.next() * 0.2), ang + (rng.next() - 0.5) * 1.2, w * 0.62, depth - 1);
      }
    };
    branch(x, base, h * 0.42, -Math.PI / 2, Math.max(4, h * 0.07), 5);
  }

  // ---------- fireworks ----------
  function add(p) {
    if (parts.length >= MAX) return;
    parts.push(p);
  }

  function spark(x, y, vx, vy, col, o = {}) {
    add({
      x,
      y,
      px: x,
      py: y,
      vx,
      vy,
      col,
      age: 0,
      life: o.life ?? 1.2 + rnd() * 0.5,
      size: (o.size ?? 1.6) * 1.55,
      drag: o.drag ?? 1.6,
      grav: o.grav ?? 60,
      trail: o.trail ?? false,
      kind: o.kind ?? 'spark',
      split: o.split ?? 0,
      flick: o.flick ?? 0.3,
      seed: rnd(),
    });
  }

  /** Scale bursts to the sky area so they fit a phone and fill a monitor. */
  const scale = () => Math.max(0.55, Math.min(1.5, Math.min(area.w / 520, area.h / 300)));

  function burst(x, y, { kind = 'shell', color = 'gold', size = 1, light = true } = {}) {
    const col = COLOURS[color] || COLOURS.gold;
    const k = scale() * size;
    const sp = 150 * k;
    switch (kind) {
      case 'willow':
      case 'kamuro': {
        const n = kind === 'kamuro' ? 150 : 90;
        const c = COLOURS.glitter;
        for (let i = 0; i < n; i++) {
          const a = rnd() * TAU;
          const v = sp * (0.55 + rnd() * 0.5) * (kind === 'kamuro' ? 1.25 : 1);
          spark(x, y, Math.cos(a) * v, Math.sin(a) * v, c, {
            life: 2.6 + rnd() * 1.2,
            drag: 2.2,
            grav: 26,
            trail: true,
            size: 1.4,
            kind: 'glitter',
            flick: 0.6,
          });
        }
        break;
      }
      case 'palm': {
        const n = 9;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + ((i - (n - 1) / 2) / n) * Math.PI * 1.7;
          const v = sp * 1.1;
          spark(x, y, Math.cos(a) * v, Math.sin(a) * v, col, { life: 2.2, drag: 1.1, grav: 70, trail: true, size: 3.2, kind: 'comet' });
        }
        break;
      }
      case 'ring': {
        const n = 48;
        const tilt = 0.35 + rnd() * 0.5;
        const rot = rnd() * TAU;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          const ex = Math.cos(a);
          const ey = Math.sin(a) * tilt;
          const vx = ex * Math.cos(rot) - ey * Math.sin(rot);
          const vy = ex * Math.sin(rot) + ey * Math.cos(rot);
          spark(x, y, vx * sp, vy * sp, col, { life: 1.6, drag: 1.5, grav: 30, size: 2 });
        }
        for (let i = 0; i < 14; i++) {
          const a = rnd() * TAU;
          spark(x, y, Math.cos(a) * sp * 0.25, Math.sin(a) * sp * 0.25, COLOURS.white, { life: 1.1, size: 1.6 });
        }
        break;
      }
      case 'crossette': {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU + rnd() * 0.3;
          spark(x, y, Math.cos(a) * sp * 0.8, Math.sin(a) * sp * 0.8, col, { life: 0.55, drag: 1, grav: 30, size: 2.6, split: 4, trail: true });
        }
        break;
      }
      case 'strobe': {
        for (let i = 0; i < 60; i++) {
          const a = rnd() * TAU;
          const v = sp * (0.3 + rnd() * 0.7);
          spark(x, y, Math.cos(a) * v, Math.sin(a) * v, COLOURS.white, { life: 2.4 + rnd(), drag: 2.6, grav: 14, size: 2.2, kind: 'strobe' });
        }
        break;
      }
      case 'brocade': {
        for (let i = 0; i < 70; i++) {
          const a = rnd() * TAU;
          const v = sp * (0.7 + rnd() * 0.4);
          spark(x, y, Math.cos(a) * v, Math.sin(a) * v, COLOURS.glitter, { life: 1.8 + rnd() * 0.6, drag: 1.7, grav: 40, trail: true, size: 1.3, kind: 'glitter' });
        }
        break;
      }
      case 'tourbillion': {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          spark(x, y, Math.cos(a) * sp * 0.5, Math.sin(a) * sp * 0.5 - sp * 0.6, col, { life: 1.6, drag: 0.6, grav: 40, size: 2.4, trail: true, kind: 'spinner' });
        }
        break;
      }
      case 'waterfall': {
        const n = 70;
        const span = Math.min(area.w * 0.8, 520 * scale());
        for (let i = 0; i < n; i++) {
          const sx = x - span / 2 + (i / n) * span;
          spark(sx, y + rnd() * 10, (rnd() - 0.5) * 10, rnd() * 20, COLOURS.glitter, { life: 2.4 + rnd(), drag: 1, grav: 50, trail: true, size: 1.4, kind: 'glitter' });
        }
        break;
      }
      case 'chrysanthemum':
      case 'peony':
      case 'comet':
      case 'shell':
      default: {
        const n = kind === 'shell' ? 58 : 96;
        const trail = kind === 'chrysanthemum' || kind === 'comet';
        for (let i = 0; i < n; i++) {
          // even directions with a soft 3D look: speed tapers towards the rim of the sphere
          const a = (i / n) * TAU + rnd() * 0.2;
          const v = sp * Math.sqrt(1 - (rnd() * 0.9) ** 2) * (kind === 'shell' ? 0.85 : 1.05);
          spark(x, y, Math.cos(a) * v, Math.sin(a) * v, col, { life: 1.1 + rnd() * 0.6, trail, size: kind === 'shell' ? 1.7 : 2 });
        }
        if (kind === 'comet') {
          for (let i = 0; i < 6; i++) {
            const a = rnd() * TAU;
            spark(x, y, Math.cos(a) * sp * 1.3, Math.sin(a) * sp * 1.3, COLOURS.glitter, { life: 1.9, drag: 0.9, trail: true, size: 2.6, kind: 'comet' });
          }
        }
      }
    }
    // a soft flash of light where it broke, then a hot white core
    add({ x, y, px: x, py: y, vx: 0, vy: 0, col, age: 0, life: 0.35, size: 70 * k, drag: 0, grav: 0, trail: false, kind: 'flash', split: 0, flick: 0, seed: 0 });
    for (let i = 0; i < 6; i++) {
      const a = rnd() * TAU;
      spark(x, y, Math.cos(a) * 20, Math.sin(a) * 20, COLOURS.white, { life: 0.25, size: 3.5, grav: 0 });
    }
    if (light) onFlash(color, x, y, Math.min(1, 0.35 + 0.25 * size));
  }

  /**
   * Launch a rocket from the fence line to a point in the sky; it bursts there.
   * Returns the time (s) until it bursts.
   */
  function launch({ x = null, y = null, color = 'gold', kind = 'shell', size = 1, rise = null, onBurst = null } = {}) {
    const sx = x ?? area.x + area.w * (0.15 + rnd() * 0.7);
    const ty = y ?? area.y + area.h * (0.18 + rnd() * 0.42);
    const tx = sx + (rnd() - 0.5) * 60;
    const t = rise ?? 0.75 + rnd() * 0.25;
    rockets.push({ x: sx, y: horizon - 6, sx, sy: horizon - 6, tx, ty, t, age: 0, color, kind, size, onBurst });
    return t;
  }

  function after(seconds, fn) {
    timers.push({ at: clock + seconds, fn });
  }

  function update(dt) {
    if (dt > 0) fresh = true;
    clock += dt;
    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].at <= clock) {
        const { fn } = timers[i];
        timers.splice(i, 1);
        fn();
      }
    }
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.age += dt;
      const k = Math.min(1, r.age / r.t);
      const e = 1 - (1 - k) ** 2; // ease out: slows as it climbs
      const nx = r.sx + (r.tx - r.sx) * e;
      const ny = r.sy + (r.ty - r.sy) * e;
      // trail sparks
      if (rnd() < 0.9) {
        spark(r.x, r.y, (rnd() - 0.5) * 20, 20 + rnd() * 30, COLOURS.glitter, { life: 0.35 + rnd() * 0.3, size: 1.1, grav: 60 });
      }
      r.x = nx;
      r.y = ny;
      if (k >= 1) {
        rockets.splice(i, 1);
        burst(r.x, r.y, { kind: r.kind, color: r.color, size: r.size });
        r.onBurst?.(r.x, r.y);
      }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) {
        if (p.split) {
          for (let j = 0; j < p.split; j++) {
            const a = (j / p.split) * TAU + Math.PI / 4;
            const v = 60 * scale();
            spark(p.x, p.y, Math.cos(a) * v + p.vx * 0.2, Math.sin(a) * v + p.vy * 0.2, p.col, { life: 0.9, size: 1.6, trail: true });
          }
        }
        parts[i] = parts[parts.length - 1];
        parts.pop();
        continue;
      }
      p.px = p.x;
      p.py = p.y;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d + p.grav * dt;
      if (p.kind === 'spinner') {
        const a = 9 * dt;
        const vx = p.vx * Math.cos(a) - p.vy * Math.sin(a);
        const vy = p.vx * Math.sin(a) + p.vy * Math.cos(a);
        p.vx = vx;
        p.vy = vy - 30 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'glitter' && rnd() < 0.08) {
        spark(p.x, p.y, 0, 10, COLOURS.white, { life: 0.3, size: 1, grav: 40 });
      }
    }
  }

  function render(dt = 1 / 60) {
    // A paused clock (manual mode, a hidden tab) must leave the frame as it is: drawing the
    // same stars again on top of themselves would burn them out to white.
    if (!fresh) return;
    fresh = false;
    // Fade what is there (trails), then draw light on top.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, 1 - 0.86 ** (dt * 60)).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const r of rockets) {
      // a hot streak from where it was a moment ago
      const k = Math.min(1, r.age / r.t);
      const len = 26 * (1 - k) + 6;
      const grad = ctx.createLinearGradient(r.x, r.y, r.x, r.y + len);
      grad.addColorStop(0, 'rgba(255,240,200,0.95)');
      grad.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x - (r.tx - r.sx) * 0.02, r.y + len);
      ctx.stroke();
      ctx.fillStyle = '#fff6dc';
      ctx.fillRect(r.x - 1.3, r.y - 1.3, 2.6, 2.6);
    }
    for (const p of parts) {
      const k = p.age / p.life;
      if (p.kind === 'flash') {
        const [r, g, b] = p.col;
        const rad = p.size * (0.6 + k * 0.6);
        const fg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
        fg.addColorStop(0, `rgba(255,250,235,${(0.55 * (1 - k)).toFixed(3)})`);
        fg.addColorStop(0.3, `rgba(${r},${g},${b},${(0.3 * (1 - k)).toFixed(3)})`);
        fg.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = fg;
        ctx.fillRect(p.x - rad, p.y - rad, rad * 2, rad * 2);
        continue;
      }
      let a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      if (k > 0.5 && p.flick && rnd() < p.flick * k) a *= 0.3;
      if (p.kind === 'strobe') a *= (Math.sin((p.age + p.seed) * 40) > 0.3 ? 1 : 0.05);
      if (a <= 0.01) continue;
      const [r, g, b] = p.col;
      // cool and dim as they age (white-hot first)
      const hot = Math.max(0, 1 - p.age / 0.18);
      const cr = Math.round(r + (255 - r) * hot);
      const cg = Math.round(g + (255 - g) * hot);
      const cb = Math.round(b + (255 - b) * hot);
      // every star draws a streak from where it was last frame, so the fade leaves a trail
      const s = p.size * (1 - k * 0.4);
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(a * (p.trail ? 0.75 : 0.9)).toFixed(3)})`;
      ctx.lineWidth = s * (p.trail ? 0.8 : 0.7);
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${a.toFixed(3)})`;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function clear() {
    parts.length = 0;
    rockets.length = 0;
    timers.length = 0;
    ctx.clearRect(0, 0, W, H);
  }

  return {
    layout,
    launch,
    burst,
    after,
    update,
    render,
    clear,
    get busy() {
      return rockets.length > 0 || timers.length > 0;
    },
    get count() {
      return parts.length;
    },
    get area() {
      return area;
    },
    get horizon() {
      return horizon;
    },
    set random(fn) {
      rnd = fn;
    },
    /** Drop pending timers but keep what's in the air (fast-forward). */
    flushTimers() {
      const pending = timers.splice(0, timers.length);
      for (const t of pending) t.fn();
    },
  };
}
