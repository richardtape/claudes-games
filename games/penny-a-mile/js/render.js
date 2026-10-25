// Draws the layout: a cached flat layer (ground, water, roads, track, platforms) re-rendered only
// when the camera or the world changes, then everything with height (trees, houses, industries,
// station buildings, trains, smoke) in depth order, then labels, previews and floating sums.
import { W, H, GRASS, WATER, ROCK, FIELD, RADIUS, CARGO, MODELS } from './data.js';
import { PIECES, isStraight, pieceAt, poseOnPath, edgeMid, opp, DIRS, STRAIGHT_NS, STRAIGHT_EW } from './track.js';
import { sprite, PAL, shade, MILL_HUB, CHIMNEYS } from './sprites.js';
import { stationById, serviceById, MODEL } from './engine.js';

export const ZOOMS = [0.5, 0.75, 1, 1.5, 2];
const idx = (x, y) => y * W + x;
const BOARD_T = 18; // plywood edge thickness, world px

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const flat = document.createElement('canvas');
  const fctx = flat.getContext('2d');
  const cam = { x: 0, y: H * 16, z: 0.75 };
  let vw = 1;
  let vh = 1;
  let dpr = 1;
  let flatKey = '';
  let objects = null;
  let objectsTopo = -1;
  const smoke = [];
  const floats = [];
  const pops = [];
  let lastT = 0;
  let smokeAcc = 0;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const d = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === vw && h === vh && d === dpr) return false;
    vw = w;
    vh = h;
    dpr = d;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    flat.width = canvas.width;
    flat.height = canvas.height;
    flatKey = '';
    return true;
  }

  // World px (zoom 1, origin at tile 0,0's top corner) → CSS px on the canvas.
  const offX = () => vw / 2 - cam.x * cam.z;
  const offY = () => vh / 2 - cam.y * cam.z;
  /** Tile space (X, Y, Z px) → device px. */
  function pr(X, Y, Z = 0) {
    return [((X - Y) * 32 * cam.z + offX()) * dpr, (((X + Y) * 16 - Z) * cam.z + offY()) * dpr];
  }
  /** CSS px on the canvas → tile space at ground level. */
  function toTile(px, py) {
    const wx = (px - offX()) / cam.z;
    const wy = (py - offY()) / cam.z;
    const X = (wx / 32 + wy / 16) / 2;
    const Y = (wy / 16 - wx / 32) / 2;
    return { X, Y, x: Math.floor(X), y: Math.floor(Y) };
  }
  function toScreen(X, Y, Z = 0) {
    const [x, y] = pr(X, Y, Z);
    return { x: x / dpr, y: y / dpr };
  }

  function clampCam() {
    const minX = -H * 32;
    const maxX = W * 32;
    cam.x = Math.max(minX + 40, Math.min(maxX - 40, cam.x));
    cam.y = Math.max(0, Math.min((W + H) * 16, cam.y));
  }

  function centreOn(X, Y) {
    cam.x = (X - Y) * 32;
    cam.y = (X + Y) * 16;
    clampCam();
  }

  /** Zooms to the next level in `dir` (+1 in, -1 out), keeping the point under (px, py) still. */
  function zoomAt(dir, px = vw / 2, py = vh / 2) {
    const i = ZOOMS.indexOf(cam.z);
    const j = Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 2 : i) + dir));
    if (ZOOMS[j] === cam.z) return false;
    const before = toTile(px, py);
    cam.z = ZOOMS[j];
    const after = toTile(px, py);
    cam.x += ((before.X - before.Y) - (after.X - after.Y)) * 32;
    cam.y += ((before.X + before.Y) - (after.X + after.Y)) * 16;
    clampCam();
    return true;
  }

  function fitZoom() {
    // The largest level at which the whole board fits.
    for (let k = ZOOMS.length - 1; k >= 0; k--) {
      const z = ZOOMS[k];
      if ((W + H) * 32 * z <= vw * 1.02 && ((W + H) * 16 + 30) * z <= vh * 1.05) return z;
    }
    return ZOOMS[0];
  }

  // ---- the flat layer --------------------------------------------------------------------------

  function visible(X, Y, m = 2) {
    const [x, y] = pr(X, Y);
    const mx = 70 * cam.z * dpr * m;
    return x > -mx && x < canvas.width + mx && y > -mx * 2 && y < canvas.height + mx;
  }

  function drawSprite(c, name, X, Y, Z = 0) {
    const sp = sprite(name, cam.z * dpr);
    const [x, y] = pr(X, Y, Z);
    c.drawImage(sp.canvas, Math.round(x - sp.ax), Math.round(y - sp.ay));
  }

  function landMask(s, x, y) {
    let m = 0;
    for (let e = 0; e < 4; e++) {
      const nx = x + DIRS[e][0];
      const ny = y + DIRS[e][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (s.ground[idx(nx, ny)] !== WATER) m |= 1 << e;
    }
    return m;
  }

  function pieceSamples(a, b) {
    const n = isStraight(a, b) ? 2 : 9;
    const out = [];
    for (let k = 0; k < n; k++) out.push(pieceAt(a, b, k / (n - 1)));
    return out;
  }

  function offsetLine(pts, x, y, off) {
    // pts: tile-local; returns device px points offset sideways by `off` tiles.
    const res = [];
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      const q = pts[Math.min(pts.length - 1, k + 1)];
      const o = pts[Math.max(0, k - 1)];
      let dx = q[0] - o[0];
      let dy = q[1] - o[1];
      const m = Math.hypot(dx, dy) || 1;
      dx /= m;
      dy /= m;
      res.push(pr(x + p[0] - dy * off, y + p[1] + dx * off));
    }
    return res;
  }

  function strokePts(c, pts, col, lw) {
    c.strokeStyle = col;
    c.lineWidth = lw;
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.stroke();
  }

  function drawTrackTile(c, s, x, y, pass) {
    const mask = s.track[idx(x, y)];
    const water = s.ground[idx(x, y)] === WATER;
    const k = cam.z * dpr;
    for (let i = 0; i < 6; i++) {
      if (!(mask & (1 << i))) continue;
      const [a, b] = PIECES[i];
      const pts = pieceSamples(a, b);
      if (pass === 0) {
        const L = offsetLine(pts, x, y, water ? 0.3 : 0.21);
        const R = offsetLine(pts, x, y, water ? -0.3 : -0.21);
        c.fillStyle = water ? '#6b4a2e' : PAL.ballast;
        c.beginPath();
        L.forEach((p, j) => (j ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
        for (let j = R.length - 1; j >= 0; j--) c.lineTo(R[j][0], R[j][1]);
        c.closePath();
        c.fill();
        if (water) {
          // Girders either side of the deck.
          strokePts(c, offsetLine(pts, x, y, 0.29), '#3f4448', 2.4 * k);
          strokePts(c, offsetLine(pts, x, y, -0.29), '#3f4448', 2.4 * k);
        } else {
          strokePts(c, offsetLine(pts, x, y, 0.2), PAL.ballastDark, 0.8 * k);
          strokePts(c, offsetLine(pts, x, y, -0.2), PAL.ballastDark, 0.8 * k);
        }
      } else if (pass === 1) {
        // Sleepers across the piece.
        const n = isStraight(a, b) ? 6 : 5;
        c.strokeStyle = PAL.sleeper;
        c.lineWidth = 2.1 * k;
        c.beginPath();
        for (let j = 0; j < n; j++) {
          const f = (j + 0.5) / n;
          const p = pieceAt(a, b, f);
          const q = pieceAt(a, b, Math.min(1, f + 0.01));
          let dx = q[0] - p[0];
          let dy = q[1] - p[1];
          const m = Math.hypot(dx, dy) || 1;
          dx /= m;
          dy /= m;
          const l = pr(x + p[0] - dy * 0.15, y + p[1] + dx * 0.15);
          const r = pr(x + p[0] + dy * 0.15, y + p[1] - dx * 0.15);
          c.moveTo(l[0], l[1]);
          c.lineTo(r[0], r[1]);
        }
        c.stroke();
      } else {
        for (const off of [0.085, -0.085]) {
          const line = offsetLine(pts, x, y, off);
          strokePts(c, line.map((p) => [p[0], p[1] + 0.7 * k]), PAL.railShadow, 1.2 * k);
          strokePts(c, line, PAL.rail, 0.9 * k);
        }
      }
    }
  }

  function drawPlatforms(c, s, st) {
    const mask = s.track[idx(st.x, st.y)];
    const k = cam.z * dpr;
    const quad = (x0, y0, x1, y1, z) => [pr(st.x + x0, st.y + y0, z), pr(st.x + x1, st.y + y0, z), pr(st.x + x1, st.y + y1, z), pr(st.x + x0, st.y + y1, z)];
    const fill = (pts, col) => {
      c.fillStyle = col;
      c.beginPath();
      pts.forEach((p, j) => (j ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
      c.closePath();
      c.fill();
    };
    const plat = (x0, y0, x1, y1) => {
      // Front faces then the top, 3 px up.
      fill([pr(st.x + x0, st.y + y1, 0), pr(st.x + x1, st.y + y1, 0), pr(st.x + x1, st.y + y1, 3), pr(st.x + x0, st.y + y1, 3)], PAL.platformFront);
      fill([pr(st.x + x1, st.y + y0, 0), pr(st.x + x1, st.y + y1, 0), pr(st.x + x1, st.y + y1, 3), pr(st.x + x1, st.y + y0, 3)], shade(PAL.platformFront, -0.2));
      fill(quad(x0, y0, x1, y1, 3), PAL.platform);
      c.strokeStyle = PAL.platformEdge;
      c.lineWidth = 1 * k;
      c.beginPath();
      const e = x1 - x0 > y1 - y0 ? [pr(st.x + x0, st.y + y1, 3), pr(st.x + x1, st.y + y1, 3)] : [pr(st.x + x1, st.y + y0, 3), pr(st.x + x1, st.y + y1, 3)];
      c.moveTo(...e[0]);
      c.lineTo(...e[1]);
      c.stroke();
    };
    if (mask & STRAIGHT_EW || !(mask & STRAIGHT_NS)) plat(0.03, 0.03, 0.97, 0.29);
    if (mask & STRAIGHT_NS) plat(0.03, 0.03, 0.29, 0.97);
  }

  function renderFlat(s) {
    const c = fctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, flat.width, flat.height);
    const k = cam.z * dpr;
    // The baseboard: plywood edges below the two front sides, then a grass base.
    const t = BOARD_T;
    const fill = (pts, col) => {
      c.fillStyle = col;
      c.beginPath();
      pts.forEach((p, j) => (j ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
      c.closePath();
      c.fill();
    };
    fill([pr(0, H), pr(W, H), pr(W, H, -t), pr(0, H, -t)], PAL.ply);
    fill([pr(W, 0), pr(W, H), pr(W, H, -t), pr(W, 0, -t)], PAL.plyDark);
    for (const f of [0.35, 0.62, 0.85]) {
      c.strokeStyle = 'rgba(90,60,30,.22)';
      c.lineWidth = 1 * k;
      c.beginPath();
      c.moveTo(...pr(0, H, -t * f));
      c.lineTo(...pr(W, H, -t * f));
      c.lineTo(...pr(W, 0, -t * f));
      c.stroke();
    }
    fill([pr(0, H, 0), pr(W, H, 0), pr(W, H, -2.5), pr(0, H, -2.5)], PAL.plyTop);
    fill([pr(W, 0, 0), pr(W, H, 0), pr(W, H, -2.5), pr(W, 0, -2.5)], shade(PAL.plyTop, -0.15));
    fill([pr(0, 0), pr(W, 0), pr(W, H), pr(0, H)], PAL.grass[0]);

    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!visible(x + 0.5, y + 0.5)) continue;
        const i = idx(x, y);
        const g = s.ground[i];
        const v = s.variant[i];
        if (g === WATER) drawSprite(c, `water${landMask(s, x, y)}`, x, y);
        else if (g === FIELD) drawSprite(c, `field${v & 3}`, x, y);
        else drawSprite(c, `grass${v & 3}`, x, y);
        if (s.road[i] || (s.owner[i] >= 0 && !s.house[i] && s.towns[s.owner[i]].x === x && s.towns[s.owner[i]].y === y)) drawSprite(c, `road${s.road[i]}`, x, y);
      }
    for (let pass = 0; pass < 3; pass++)
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) if (s.track[idx(x, y)] && visible(x + 0.5, y + 0.5)) drawTrackTile(c, s, x, y, pass);
    for (const st of s.stations) if (visible(st.x + 0.5, st.y + 0.5)) drawPlatforms(c, s, st);
  }

  // ---- objects ---------------------------------------------------------------------------------

  function collectObjects(s) {
    const list = [];
    const seenInd = new Set();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        if (s.ind[i] >= 0) {
          const o = s.industries[s.ind[i]];
          if (seenInd.has(o.id)) continue;
          seenInd.add(o.id);
          list.push({ kind: 'ind', o, X: o.x, Y: o.y, depth: o.x + o.y + o.w + o.h - 1.6 });
          continue;
        }
        if (s.station[i] >= 0) {
          list.push({ kind: 'station', st: stationById(s, s.station[i]), X: x, Y: y, depth: x + y + 0.55 });
          continue;
        }
        if (s.house[i]) {
          list.push({ kind: 'house', name: `house${s.house[i]}_${s.variant[i] % 6}`, X: x, Y: y, depth: x + y + 0.98 });
          continue;
        }
        if (s.ground[i] === ROCK) {
          list.push({ kind: 'sprite', name: `rock${s.variant[i] % 3}`, X: x, Y: y, depth: x + y + 0.98 });
          continue;
        }
        if (s.trees[i] && !s.track[i] && !s.road[i]) list.push({ kind: 'sprite', name: `trees${s.trees[i]}_${s.variant[i] % 4}`, X: x, Y: y, depth: x + y + 0.98 });
      }
    return list;
  }

  function stationAxis(s, st) {
    const m = s.track[idx(st.x, st.y)];
    return m & STRAIGHT_NS && !(m & STRAIGHT_EW) ? 'y' : 'x';
  }

  function drawWaiting(s, st) {
    const axis = stationAxis(s, st);
    let slot = 0;
    for (const c of Object.keys(CARGO)) {
      const n = st.waiting[c] || 0;
      if (n < 4) continue;
      const stacks = Math.min(4, Math.ceil(n / 50));
      for (let k = 0; k < stacks && slot < 7; k++, slot++) {
        const f = 0.12 + slot * 0.11;
        const X = st.x + (axis === 'x' ? f : 0.2);
        const Y = st.y + (axis === 'x' ? 0.2 : f);
        const col = CARGO[c].color;
        if (c === 'pax') {
          // A little figure.
          const [x, y] = pr(X, Y, 3);
          const k2 = cam.z * dpr;
          ctx.fillStyle = slot % 2 ? '#3a3330' : col;
          ctx.fillRect(x - 1.3 * k2, y - 7 * k2, 2.6 * k2, 5 * k2);
          ctx.fillStyle = '#e8c9a8';
          ctx.beginPath();
          ctx.arc(x, y - 8.4 * k2, 1.4 * k2, 0, Math.PI * 2);
          ctx.fill();
        } else orientedBox(X, Y, 1, 0, 0.08, 0.08, 3, 4, col);
      }
    }
  }

  // An oriented box in tile space: centre (X, Y), heading (hx, hy), length L, width Wd (tiles), from z0 up h px.
  function orientedBox(X, Y, hx, hy, L, Wd, z0, h, col, topCol = null) {
    const nx = -hy;
    const ny = hx;
    const c = [
      [X + (hx * L) / 2 + (nx * Wd) / 2, Y + (hy * L) / 2 + (ny * Wd) / 2],
      [X + (hx * L) / 2 - (nx * Wd) / 2, Y + (hy * L) / 2 - (ny * Wd) / 2],
      [X - (hx * L) / 2 - (nx * Wd) / 2, Y - (hy * L) / 2 - (ny * Wd) / 2],
      [X - (hx * L) / 2 + (nx * Wd) / 2, Y - (hy * L) / 2 + (ny * Wd) / 2],
    ];
    // Faces: 0-1 front (+h), 1-2 side (-n), 2-3 back (-h), 3-0 side (+n).
    const normals = [
      [hx, hy],
      [-nx, -ny],
      [-hx, -hy],
      [nx, ny],
    ];
    const faces = [];
    for (let f = 0; f < 4; f++) {
      const [ax, ay] = normals[f];
      const facing = ax + ay;
      if (facing <= 0.001) continue;
      const p = c[f];
      const q = c[(f + 1) % 4];
      faces.push({ pts: [pr(p[0], p[1], z0), pr(q[0], q[1], z0), pr(q[0], q[1], z0 + h), pr(p[0], p[1], z0 + h)], lit: ay > ax ? -0.1 : -0.3 });
    }
    for (const f of faces) fillPts(f.pts, shade(col, f.lit));
    fillPts(
      c.map((p) => pr(p[0], p[1], z0 + h)),
      topCol || shade(col, 0.08),
    );
  }

  function fillPts(pts, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    pts.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fill();
  }

  /** Where each car of a train is: [{ X, Y, hx, hy, kind }], engine first. */
  function trainCars(s, t) {
    const m = MODEL[t.model];
    const nW = Math.ceil(m.cap / 20);
    const svc = serviceById(s, t.svc);
    const paxService = svc && ['a', 'b'].some((e) => {
      const st = stationById(s, svc[e]);
      return st && (st.waiting.pax !== undefined || t.cargo.some((p) => p.c === 'pax'));
    });
    // Wagons hold 20 units each, filled in cargo order.
    const kinds = [];
    let k = 0;
    for (const pk of t.cargo) {
      let n = pk.n;
      while (n > 0 && k < nW) {
        kinds.push(pk.c);
        n -= 20;
        k++;
      }
    }
    while (kinds.length < nW) kinds.push(paxService ? 'coach' : 'empty');
    let path = t.path;
    let pos = t.pos;
    if (!path) {
      const st = stationById(s, t.at);
      if (!st) return [];
      const mask = s.track[idx(st.x, st.y)];
      const o = mask & STRAIGHT_EW ? 1 : 0;
      path = [
        { x: st.x, y: st.y, i: opp(o), o },
        { x: st.x + DIRS[o][0], y: st.y + DIRS[o][1], i: opp(o), o },
      ];
      pos = 0;
    }
    const cars = [];
    const gap = 0.4;
    const total = [m.wheels === 'diesel' ? 'diesel' : 'engine', ...kinds];
    for (let j = 0; j < total.length; j++) {
      const d = pos - j * gap;
      let pose;
      if (d >= 0) pose = poseOnPath(path, d);
      else {
        // Behind the start: along the platform's other half.
        const s0 = path[0];
        const mi = edgeMid(s0.i);
        const f = Math.min(1, -d / 0.5);
        const head = poseOnPath(path, 0);
        pose = { x: s0.x + 0.5 + (mi[0] - 0.5) * f, y: s0.y + 0.5 + (mi[1] - 0.5) * f, hx: head.hx, hy: head.hy };
      }
      cars.push({ X: pose.x, Y: pose.y, hx: pose.hx, hy: pose.hy, kind: total[j], livery: m.livery, model: m });
    }
    return cars;
  }

  function drawCar(car, colour) {
    const { X, Y, hx, hy, kind } = car;
    if (kind === 'engine') {
      orientedBox(X, Y, hx, hy, 0.4, 0.2, 1.5, 3, '#2a2724');
      // Boiler toward the front, cab at the back.
      orientedBox(X + hx * 0.06, Y + hy * 0.06, hx, hy, 0.28, 0.14, 4.5, 7, car.livery);
      orientedBox(X - hx * 0.13, Y - hy * 0.13, hx, hy, 0.13, 0.2, 4.5, 10, car.livery, shade(car.livery, -0.3));
      orientedBox(X - hx * 0.13, Y - hy * 0.13, hx, hy, 0.15, 0.21, 14.5, 1.2, '#2a2724');
      orientedBox(X + hx * 0.16, Y + hy * 0.16, hx, hy, 0.04, 0.04, 11.5, 5, '#2a2724');
      orientedBox(X + hx * 0.05, Y + hy * 0.05, hx, hy, 0.05, 0.05, 11.5, 2.5, PAL.brass);
      // The service's colour as a band on the cab.
      orientedBox(X - hx * 0.13, Y - hy * 0.13, hx, hy, 0.135, 0.205, 8.5, 1.5, colour);
    } else if (kind === 'diesel') {
      orientedBox(X, Y, hx, hy, 0.4, 0.2, 1.5, 3, '#2a2724');
      orientedBox(X, Y, hx, hy, 0.38, 0.19, 4.5, 9, car.livery);
      orientedBox(X, Y, hx, hy, 0.385, 0.195, 9, 1.6, colour);
    } else {
      orientedBox(X, Y, hx, hy, 0.34, 0.19, 1.5, 2, '#2a2724');
      if (kind === 'coach') {
        orientedBox(X, Y, hx, hy, 0.34, 0.18, 3.5, 4, '#7d2430');
        orientedBox(X, Y, hx, hy, 0.34, 0.18, 7.5, 3.5, '#efe1c0');
        orientedBox(X, Y, hx, hy, 0.35, 0.19, 11, 1.4, '#5b5f63');
      } else if (kind === 'pax') {
        orientedBox(X, Y, hx, hy, 0.34, 0.18, 3.5, 4, CARGO.pax.color);
        orientedBox(X, Y, hx, hy, 0.34, 0.18, 7.5, 3.5, '#f6e9c8');
        orientedBox(X, Y, hx, hy, 0.35, 0.19, 11, 1.4, '#5b5f63');
      } else if (kind === 'goods') {
        orientedBox(X, Y, hx, hy, 0.33, 0.18, 3.5, 8, CARGO.goods.color, '#e9e4d6');
      } else if (kind === 'grain') {
        orientedBox(X, Y, hx, hy, 0.33, 0.18, 3.5, 7, '#b38b2c', '#d8b557');
      } else {
        // Open wagon, with its load on top.
        orientedBox(X, Y, hx, hy, 0.33, 0.18, 3.5, 5, '#6d5a45', '#3a2f25');
        if (kind === 'coal') orientedBox(X, Y, hx, hy, 0.27, 0.13, 8.5, 1.6, CARGO.coal.color, '#1f1d1b');
        if (kind === 'wood') {
          orientedBox(X, Y, hx, hy, 0.3, 0.06, 8.5, 2.5, CARGO.wood.color);
          orientedBox(X + hy * 0.04, Y - hx * 0.04, hx, hy, 0.3, 0.06, 8.5, 2.5, shade(CARGO.wood.color, 0.1));
        }
      }
    }
  }

  function drawMillSails(o, time) {
    const [x, y] = pr(o.x, o.y);
    const k = cam.z * dpr;
    const hx = x + MILL_HUB[0] * k;
    const hy = y + MILL_HUB[1] * k;
    const a0 = time * 1.6;
    ctx.save();
    ctx.translate(hx, hy);
    for (let b = 0; b < 4; b++) {
      ctx.save();
      ctx.rotate(a0 + (b * Math.PI) / 2);
      ctx.fillStyle = '#efe6cf';
      ctx.strokeStyle = '#6a5440';
      ctx.lineWidth = 0.7 * k;
      ctx.fillRect(2 * k, -2.6 * k, 24 * k, 5.2 * k);
      ctx.strokeRect(2 * k, -2.6 * k, 24 * k, 5.2 * k);
      ctx.beginPath();
      for (let j = 1; j < 5; j++) {
        ctx.moveTo((2 + j * 4.8) * k, -2.6 * k);
        ctx.lineTo((2 + j * 4.8) * k, 2.6 * k);
      }
      ctx.stroke();
      ctx.fillStyle = '#5a4634';
      ctx.fillRect(0, -0.7 * k, 27 * k, 1.4 * k);
      ctx.restore();
    }
    ctx.fillStyle = '#3b3b3b';
    ctx.beginPath();
    ctx.arc(0, 0, 2 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---- labels ---------------------------------------------------------------------------------

  function plate(text, x, y, { bg = PAL.green, fg = PAL.cream, rim = PAL.brass, size = 11, sub = null, alpha = 1 } = {}) {
    const k = dpr;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `600 ${size * k}px "Cabin Condensed", "Cabin", system-ui, sans-serif`;
    const w = ctx.measureText(text).width;
    let w2 = 0;
    if (sub) {
      ctx.font = `500 ${(size - 2) * k}px "Cabin", system-ui, sans-serif`;
      w2 = ctx.measureText(sub).width + 8 * k;
      ctx.font = `600 ${size * k}px "Cabin Condensed", "Cabin", system-ui, sans-serif`;
    }
    const pw = w + w2 + 12 * k;
    const ph = (size + 7) * k;
    const px = Math.round(x - pw / 2);
    const py = Math.round(y - ph);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    roundRect(px + 1 * k, py + 2 * k, pw, ph, 3 * k);
    ctx.fill();
    ctx.fillStyle = bg;
    roundRect(px, py, pw, ph, 3 * k);
    ctx.fill();
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.2 * k;
    roundRect(px + 1.5 * k, py + 1.5 * k, pw - 3 * k, ph - 3 * k, 2 * k);
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, px + 6 * k, py + ph / 2 + 0.5 * k);
    if (sub) {
      ctx.font = `500 ${(size - 2) * k}px "Cabin", system-ui, sans-serif`;
      ctx.fillStyle = PAL.brass;
      ctx.fillText(sub, px + 6 * k + w + 6 * k, py + ph / 2 + 0.5 * k);
    }
    ctx.restore();
    return { x: px / k, y: py / k, w: pw / k, h: ph / k };
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function townLabel(t) {
    const [x, y] = pr(t.x + 0.5, t.y + 0.5, 46);
    const k = dpr;
    const size = cam.z >= 1 ? 16 : 14;
    ctx.save();
    ctx.font = `700 ${size * k}px "Cabin", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5 * k;
    ctx.strokeStyle = 'rgba(29,40,30,.75)';
    ctx.strokeText(t.name, x, y);
    ctx.fillStyle = '#fffaf0';
    ctx.fillText(t.name, x, y);
    ctx.font = `500 ${11 * k}px "Cabin", system-ui, sans-serif`;
    ctx.lineWidth = 3 * k;
    const pop = `${t.pop.toLocaleString('en-GB')} people`;
    ctx.strokeText(pop, x, y + 13 * k);
    ctx.fillStyle = '#f1e6c8';
    ctx.fillText(pop, x, y + 13 * k);
    ctx.restore();
  }

  // ---- overlays ----------------------------------------------------------------------------------

  function tileDiamond(x, y, fill, stroke = null, lw = 1) {
    const pts = [pr(x, y), pr(x + 1, y), pr(x + 1, y + 1), pr(x, y + 1)];
    if (fill) fillPts(pts, fill);
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw * dpr;
      ctx.beginPath();
      pts.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.stroke();
    }
  }

  function catchment(x, y, col) {
    const x0 = Math.max(0, x - RADIUS);
    const y0 = Math.max(0, y - RADIUS);
    const x1 = Math.min(W, x + RADIUS + 1);
    const y1 = Math.min(H, y + RADIUS + 1);
    const pts = [pr(x0, y0), pr(x1, y0), pr(x1, y1), pr(x0, y1)];
    fillPts(pts, col);
    ctx.strokeStyle = 'rgba(255,250,235,.85)';
    ctx.setLineDash([5 * dpr, 4 * dpr]);
    ctx.lineWidth = 1.4 * dpr;
    ctx.beginPath();
    pts.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function pathLine(path, col, width = 5, dash = null) {
    const pts = [];
    for (let k = 0; k < path.length; k++) {
      const st = path[k];
      if (k === 0) {
        pts.push(pr(st.x + 0.5, st.y + 0.5, 2));
        continue;
      }
      if (k === path.length - 1) {
        const m = edgeMid(st.i);
        pts.push(pr(st.x + m[0], st.y + m[1], 2), pr(st.x + 0.5, st.y + 0.5, 2));
        continue;
      }
      const n = isStraight(st.i, st.o) ? 2 : 6;
      for (let j = 0; j < n; j++) {
        const p = pieceAt(st.i, st.o, j / (n - 1));
        pts.push(pr(st.x + p[0], st.y + p[1], 2));
      }
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (dash) ctx.setLineDash(dash.map((d) => d * dpr));
    ctx.strokeStyle = 'rgba(20,25,20,.45)';
    ctx.lineWidth = (width + 3) * dpr;
    ctx.beginPath();
    pts.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = width * dpr;
    ctx.stroke();
    ctx.restore();
  }

  // ---- the frame -------------------------------------------------------------------------------

  /**
   * ui: { tool, hover: {x,y}|null, plan, planOk, selected: {kind,id}|null, time, reduced, labels }
   */
  function draw(s, ui) {
    if (syncSize()) flatKey = '';
    const time = ui.time;
    const dt = Math.min(0.1, Math.max(0, time - lastT));
    lastT = time;
    const key = `${cam.x.toFixed(2)},${cam.y.toFixed(2)},${cam.z},${s.topo},${vw},${vh},${dpr},${s.trackStamp || 0}`;
    if (key !== flatKey) {
      renderFlat(s);
      flatKey = key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(flat, 0, 0);

    if (ui.tool === 'build' || ui.tool === 'bulldoze') {
      ctx.strokeStyle = 'rgba(255,255,240,.13)';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      for (let x = 0; x <= W; x++) {
        ctx.moveTo(...pr(x, 0));
        ctx.lineTo(...pr(x, H));
      }
      for (let y = 0; y <= H; y++) {
        ctx.moveTo(...pr(0, y));
        ctx.lineTo(...pr(W, y));
      }
      ctx.stroke();
    }

    // Catchments under the objects.
    const sel = ui.selected;
    if (sel?.kind === 'station') {
      const st = stationById(s, sel.id);
      if (st) catchment(st.x, st.y, 'rgba(200,161,75,.22)');
    }
    if (ui.plan) {
      const p = ui.plan;
      catchment(p.ax, p.ay, 'rgba(241,230,200,.2)');
      if (p.bx !== undefined) catchment(p.bx, p.by, 'rgba(241,230,200,.2)');
    } else if (ui.hover && ui.tool === 'build') {
      catchment(ui.hover.x, ui.hover.y, 'rgba(241,230,200,.16)');
    }
    // Pulsing brass rings round places the coach or a subsidy points at.
    if (ui.marks)
      for (const m of ui.marks) {
        const [x, y] = pr(m.x, m.y);
        const ph = (time * 1.4) % 1;
        for (const k of [0, 0.5]) {
          const f = (ph + k) % 1;
          ctx.strokeStyle = `rgba(243,207,90,${(1 - f) * 0.9})`;
          ctx.lineWidth = 3 * dpr;
          ctx.beginPath();
          ctx.ellipse(x, y, (40 + f * 50) * cam.z * dpr, (20 + f * 25) * cam.z * dpr, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    if (ui.hover && (ui.tool === 'build' || ui.tool === 'bulldoze')) tileDiamond(ui.hover.x, ui.hover.y, ui.tool === 'bulldoze' ? 'rgba(179,48,42,.35)' : 'rgba(255,250,235,.25)', 'rgba(255,250,235,.9)', 1.5);

    // Highlight the selected service's line.
    if (sel?.kind === 'service' || sel?.kind === 'train') {
      const t = sel.kind === 'train' ? s.trains.find((x) => x.id === sel.id) : null;
      const svc = serviceById(s, t ? t.svc : sel.id);
      if (svc) {
        const tr = t || s.trains.find((x) => x.svc === svc.id && x.path);
        if (tr?.path) pathLine(tr.path, svc.colour, 4);
      }
    }

    if (objectsTopo !== s.topo || !objects) {
      objects = collectObjects(s);
      objectsTopo = s.topo;
    }
    const draws = [];
    for (const ob of objects) {
      const cx = ob.kind === 'ind' ? ob.X + 1 : ob.X + 0.5;
      const cy = ob.kind === 'ind' ? ob.Y + 1 : ob.Y + 0.5;
      if (!visible(cx, cy, ob.kind === 'ind' ? 3 : 2)) continue;
      draws.push(ob);
    }
    const carsByTrain = new Map();
    for (const t of s.trains) {
      const svc = serviceById(s, t.svc);
      const cars = trainCars(s, t);
      carsByTrain.set(t.id, cars);
      for (const car of cars) {
        if (!visible(car.X, car.Y)) continue;
        draws.push({ kind: 'car', car, colour: svc?.colour || PAL.brass, depth: car.X + car.Y, t });
      }
    }
    draws.sort((a, b) => a.depth - b.depth);
    for (const d of draws) {
      if (d.kind === 'ind') {
        drawSprite(ctx, d.o.kind, d.X, d.Y);
        if (d.o.kind === 'mill') drawMillSails(d.o, ui.reduced ? 0.4 : time);
      } else if (d.kind === 'station') {
        drawSprite(ctx, `stationHouse_${stationAxis(s, d.st)}`, d.X, d.Y);
        drawWaiting(s, d.st);
      } else if (d.kind === 'car') drawCar(d.car, d.colour);
      else drawSprite(ctx, d.name, d.X, d.Y);
    }

    // Lost trains wave a red flag.
    for (const t of s.trains) {
      if (!t.lost) continue;
      const car = carsByTrain.get(t.id)?.[0];
      if (!car || !visible(car.X, car.Y)) continue;
      const [x, y] = pr(car.X, car.Y, 30);
      const k = dpr;
      ctx.fillStyle = '#b3302a';
      ctx.beginPath();
      ctx.arc(x, y, 8 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${12 * k}px Cabin, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', x, y + 0.5 * k);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // Steam: puffs from moving engines and from working chimneys.
    if (!ui.reduced && !ui.paused) {
      smokeAcc += dt;
      if (smokeAcc > 0.09) {
        smokeAcc = 0;
        for (const t of s.trains) {
          if (t.state !== 'run' || MODEL[t.model].wheels === 'diesel') continue;
          const car = carsByTrain.get(t.id)?.[0];
          if (!car || !visible(car.X, car.Y)) continue;
          if (Math.random() < 0.6) smoke.push({ X: car.X + car.hx * 0.16, Y: car.Y + car.hy * 0.16, Z: 17, t: 0, life: 1.1, r: 2.5, white: true });
        }
        for (const o of s.industries) {
          const ch = CHIMNEYS[o.kind];
          if (!ch || Math.random() > 0.35) continue;
          for (const [cx, cy, cz] of ch) if (visible(o.x + cx, o.y + cy)) smoke.push({ X: o.x + cx, Y: o.y + cy, Z: cz, t: 0, life: 2.6, r: 3.5, white: o.kind !== 'power' });
        }
        if (smoke.length > 400) smoke.splice(0, smoke.length - 400);
      }
    }
    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i];
      if (!ui.paused) {
        p.t += dt;
        p.Z += dt * 16;
        p.X += dt * 0.12;
        p.Y -= dt * 0.05;
        p.r += dt * 5;
      }
      if (p.t > p.life) {
        smoke.splice(i, 1);
        continue;
      }
      const [x, y] = pr(p.X, p.Y, p.Z);
      const a = (1 - p.t / p.life) * 0.55;
      ctx.fillStyle = p.white ? `rgba(246,242,232,${a})` : `rgba(170,165,158,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, p.r * cam.z * dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Houses that just appeared get a little pop of dust.
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      p.t += dt;
      if (p.t > 0.8) {
        pops.splice(i, 1);
        continue;
      }
      const [x, y] = pr(p.x + 0.5, p.y + 0.5, 8);
      ctx.strokeStyle = `rgba(255,248,225,${1 - p.t / 0.8})`;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.ellipse(x, y, (8 + p.t * 30) * cam.z * dpr, (4 + p.t * 15) * cam.z * dpr, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // The plan being drawn.
    if (ui.plan) {
      const p = ui.plan;
      if (p.ok) {
        pathLine(p.path, ui.planOk ? '#f3cf5a' : '#e0675c', 5, [8, 6]);
      }
      for (const [x, y, ok] of [
        [p.ax, p.ay, true],
        [p.bx, p.by, p.ok],
      ]) {
        if (x === undefined) continue;
        tileDiamond(x, y, ok ? 'rgba(243,207,90,.45)' : 'rgba(179,48,42,.5)', '#fff6dc', 2);
      }
    }

    // Labels: towns, stations, and industries when building or hovered.
    for (const t of s.towns) if (visible(t.x, t.y)) townLabel(t);
    // Station nameplates: the selected and hovered ones first, then front to back, skipping any
    // that would cover a plate already drawn.
    const plates = [];
    const size = cam.z >= 1 ? 11 : 10;
    const hov = ui.hover ? s.station[idx(ui.hover.x, ui.hover.y)] : -1;
    const order = s.stations
      .filter((st) => visible(st.x, st.y))
      .map((st) => ({ st, pri: (sel?.kind === 'station' && sel.id === st.id) || st.id === hov ? 0 : 1 }))
      .sort((a, b) => a.pri - b.pri || b.st.x + b.st.y - (a.st.x + a.st.y));
    ctx.font = `600 ${size * dpr}px "Cabin Condensed", "Cabin", system-ui, sans-serif`;
    for (const { st, pri } of order) {
      const [x, y] = pr(st.x + 0.5, st.y + 0.5, 30);
      const w = (ctx.measureText(st.name).width / dpr + 12) * dpr;
      const h = (size + 7) * dpr;
      const box = { x: x - w / 2, y: y - h, w, h };
      if (pri && plates.some((o) => box.x < o.x + o.w - 4 && o.x < box.x + box.w - 4 && box.y < o.y + o.h - 3 && o.y < box.y + box.h - 3)) continue;
      plates.push(box);
      const selected = sel?.kind === 'station' && sel.id === st.id;
      plate(st.name, x, y, { size, bg: selected ? '#b3302a' : PAL.green });
      ctx.font = `600 ${size * dpr}px "Cabin Condensed", "Cabin", system-ui, sans-serif`;
    }
    if (ui.labels || ui.tool === 'build') {
      for (const o of s.industries) {
        if (!visible(o.x + 1, o.y + 1)) continue;
        const [x, y] = pr(o.x + 1, o.y + 1, 0);
        const def = { colliery: 'coal', forest: 'wood', farm: 'grain', sawmill: 'goods', mill: 'goods', power: null }[o.kind];
        const takes = { power: 'takes coal', sawmill: 'takes wood', mill: 'takes grain' }[o.kind];
        const sub = def && o.kind !== 'sawmill' && o.kind !== 'mill' ? `${o.prod}${CARGO[def].unit} ${CARGO[def].short}/mo` : takes;
        plate(o.name, x, y + 26 * dpr, { bg: '#f1e6c8', fg: '#22301f', rim: '#9a8a63', size: 10, sub, alpha: 0.95 });
      }
    } else if (ui.hover) {
      const i = idx(ui.hover.x, ui.hover.y);
      if (ui.hover.x >= 0 && ui.hover.y >= 0 && ui.hover.x < W && ui.hover.y < H && s.ind[i] >= 0) {
        const o = s.industries[s.ind[i]];
        const [x, y] = pr(o.x + 1, o.y + 1, 0);
        plate(o.name, x, y + 26 * dpr, { bg: '#f1e6c8', fg: '#22301f', rim: '#9a8a63', size: 10 });
      }
    }

    // Floating sums.
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      if (!ui.paused) f.t += dt;
      if (f.t > f.life) {
        floats.splice(i, 1);
        continue;
      }
      const [x, y0] = pr(f.X, f.Y, 34 + f.t * 30);
      const y = y0 - (f.lift || 0) * dpr;
      const a = f.t < 0.15 ? f.t / 0.15 : 1 - Math.max(0, (f.t - f.life * 0.6) / (f.life * 0.4));
      const sc = f.t < 0.15 ? 0.7 + (f.t / 0.15) * 0.45 : 1.15 - Math.min(0.15, (f.t - 0.15) * 0.6);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = `700 ${Math.round(f.size * sc * dpr)}px "Cabin", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4 * dpr;
      ctx.strokeStyle = f.dark || '#2a2016';
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.colour;
      ctx.fillText(f.text, x, y);
      ctx.restore();
    }
    return { plates };
  }

  function syncSize() {
    return resize();
  }

  return {
    cam,
    draw,
    resize,
    toTile,
    toScreen,
    zoomAt,
    fitZoom,
    centreOn,
    clampCam,
    get size() {
      return { w: vw, h: vh };
    },
    float(X, Y, text, { colour = '#f3cf5a', size = 15, life = 1.7, dark = null } = {}) {
      // Sums landing at the same spot stack upward instead of printing over each other.
      const near = floats.filter((f) => Math.abs(f.X - X) < 0.6 && Math.abs(f.Y - Y) < 0.6 && f.t < 0.9).length;
      floats.push({ X, Y, text, colour, size, life, t: 0, dark, lift: near * (size + 4) });
      if (floats.length > 60) floats.shift();
    },
    pop(x, y) {
      pops.push({ x, y, t: 0 });
    },
    /** The train car nearest a screen point (CSS px), within `r` px. */
    trainAt(s, px, py, r = 16) {
      let best = null;
      for (const t of s.trains) {
        for (const car of trainCars(s, t)) {
          const p = toScreen(car.X, car.Y, 6);
          const d = Math.hypot(p.x - px, p.y - py);
          if (d < r && (!best || d < best.d)) best = { t, d };
        }
      }
      return best?.t || null;
    },
    trainCars: (s, t) => trainCars(s, t),
    invalidate() {
      flatKey = '';
      objects = null;
    },
    /** Forget smoke, sums and dust from another shire. */
    reset() {
      smoke.length = 0;
      floats.length = 0;
      pops.length = 0;
      flatKey = '';
      objects = null;
    },
  };
}
