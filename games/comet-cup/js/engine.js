// Comet Cup engine: orbit-golf physics and the state of one hole. Pure and DOM-free.
//
// Determinism: the flight step uses only + - * / and Math.sqrt, which every JS engine rounds
// identically, so a stored launch velocity (the bank's ace line) replays the same path in
// Node, Chrome, Safari and Firefox. Keep Math.sin/cos/atan2/pow out of stepFlight.

export const W = 1600; // the plate, in world units
export const H = 1000;
export const DT = 1 / 120;
export const COMET_R = 9;

export const PHYS = {
  g: 950, // surface gravity of a density-1 planet (units/s²); pull = g * dens * r²
  maxSpeed: 680, // launch speed at full power: escapes the biggest world at ~70%
  exposure: 12, // seconds of flight per stroke before the comet halts
  spaceDrag: 0.03, // per second, everywhere
  nebulaDrag: 1.6, // per second, extra inside a nebula
  restitution: 0.38, // planets
  rockRestitution: 0.8,
  tangentKeep: 0.86, // tangential speed kept through a hard impact
  roll: 0.45, // rolling friction: deceleration = roll * how hard gravity presses
  stick: 0.55, // static friction: rests if the sideways pull is below stick * pressing pull
  restSpeed: 8,
  sinkSpeed: 170, // reach the cup slower than this and it drops
  cupCatch: 13,
  cupPull: 320, // the lip slopes into the cup: pull toward it when slow and close
  cupPullRange: 36,
  margin: 40, // how far past the plate edge the comet may stray
  passReach: 1.1, // a pass rings when it comes within passReach * r + 40 of the surface
  voidPull: 5200, // a dark star pulls like a planet of radius ~72
  sunDens: 1.5,
  maxOver: 4, // a hole is picked up at par + maxOver
};

export const KINDS = ['planet', 'sun', 'void', 'rock', 'nebula', 'gate'];
export const ENDS = ['sink', 'rest', 'halt', 'burn', 'void', 'lost'];
export const HAZARD_ENDS = new Set(['burn', 'void', 'lost']);

/**
 * Turn hole data into fast lookup lists.
 * Hole: { bodies: [{ k, x, y, r, d?, pair? }], tee: { x, y, b }, cup: { b, nx, ny }, par }
 */
export function prepareWorld(hole) {
  const bodies = hole.bodies.map((b, i) => {
    const k = b.k;
    let pull = 0;
    if (k === 'planet') pull = PHYS.g * (b.d ?? 1) * b.r * b.r;
    else if (k === 'sun') pull = PHYS.g * PHYS.sunDens * b.r * b.r;
    else if (k === 'void') pull = PHYS.g * PHYS.voidPull;
    return { ...b, i, pull };
  });
  const cupB = bodies[hole.cup.b];
  const rr = cupB.r + COMET_R;
  return {
    hole,
    bodies,
    grav: bodies.filter((b) => b.pull > 0),
    solids: bodies.filter((b) => b.k === 'planet' || b.k === 'rock' || b.k === 'sun'),
    planets: bodies.filter((b) => b.k === 'planet'),
    voids: bodies.filter((b) => b.k === 'void'),
    nebulae: bodies.filter((b) => b.k === 'nebula'),
    gates: bodies.filter((b) => b.k === 'gate'),
    cupBody: hole.cup.b,
    cupX: cupB.x + hole.cup.nx * rr,
    cupY: cupB.y + hole.cup.ny * rr,
  };
}

/** Where the comet sits for a cup or tee on body b along unit normal (nx, ny). */
export function surfacePoint(body, nx, ny) {
  const rr = body.r + COMET_R;
  return { x: body.x + nx * rr, y: body.y + ny * rr };
}

export function newFlight(w, x, y, vx, vy) {
  const n = w.bodies.length;
  const prev = new Float64Array(n);
  const trend = new Int8Array(n);
  for (const b of w.planets) prev[b.i] = Math.sqrt(sq(x - b.x) + sq(y - b.y)) - b.r - COMET_R;
  return { x, y, vx, vy, t: 0, contact: -1, gateLock: -1, prev, trend, lipped: false };
}

const sq = (v) => v * v;

/**
 * Advance a flight by DT. Pushes events into `events` (if given) and returns how the flight
 * ended ('sink' | 'rest' | 'halt' | 'burn' | 'void' | 'lost') or null while it flies on.
 */
export function stepFlight(w, f, events = null) {
  const P = PHYS;
  // Gravity.
  let ax = 0;
  let ay = 0;
  for (const b of w.grav) {
    const dx = b.x - f.x;
    const dy = b.y - f.y;
    let d2 = dx * dx + dy * dy;
    const floor = b.k === 'void' ? b.r * b.r : sq(b.r + COMET_R);
    if (d2 < floor) d2 = floor;
    const inv = b.pull / (d2 * Math.sqrt(d2));
    ax += dx * inv;
    ay += dy * inv;
  }

  // Rolling on a surface: friction from how hard gravity presses the comet into it, and the
  // cup's lip, which slopes toward the cup.
  let pressing = 0;
  if (f.contact >= 0) {
    const b = w.bodies[f.contact];
    const dx = f.x - b.x;
    const dy = f.y - b.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / d;
    const ny = dy / d;
    pressing = -(ax * nx + ay * ny);
    if (f.contact === w.cupBody) {
      const cx = w.cupX - f.x;
      const cy = w.cupY - f.y;
      const cd = Math.sqrt(cx * cx + cy * cy);
      const speed = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
      if (cd < P.cupPullRange && cd > 0.001 && speed < P.sinkSpeed * 1.3) {
        ax += (cx / cd) * P.cupPull;
        ay += (cy / cd) * P.cupPull;
      }
    }
    if (pressing > 0) {
      const vn = f.vx * nx + f.vy * ny;
      const tx = f.vx - vn * nx;
      const ty = f.vy - vn * ny;
      const ts = Math.sqrt(tx * tx + ty * ty);
      const dec = P.roll * pressing * DT;
      const k = ts <= dec ? 0 : 1 - dec / ts;
      f.vx = vn * nx + tx * k;
      f.vy = vn * ny + ty * k;
    }
  }

  // Integrate (semi-implicit Euler) with drag.
  let drag = P.spaceDrag;
  for (const b of w.nebulae) if (sq(f.x - b.x) + sq(f.y - b.y) < b.r * b.r) drag += P.nebulaDrag;
  f.vx = (f.vx + ax * DT) * (1 - drag * DT);
  f.vy = (f.vy + ay * DT) * (1 - drag * DT);
  f.x += f.vx * DT;
  f.y += f.vy * DT;
  f.t++;

  // Collisions.
  f.contact = -1;
  for (const b of w.solids) {
    const dx = f.x - b.x;
    const dy = f.y - b.y;
    const d2 = dx * dx + dy * dy;
    const rr = b.r + COMET_R;
    if (b.k === 'sun') {
      if (d2 < sq(b.r + COMET_R * 0.4)) {
        events?.push({ t: 'burn', i: b.i });
        return 'burn';
      }
      continue;
    }
    if (d2 >= sq(rr + 0.75)) continue;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    if (d < rr) {
      f.x = b.x + nx * rr;
      f.y = b.y + ny * rr;
    }
    const vn = f.vx * nx + f.vy * ny;
    if (vn < 0) {
      const tx = f.vx - vn * nx;
      const ty = f.vy - vn * ny;
      const hard = -vn > 40;
      let out = -vn * (b.k === 'rock' ? P.rockRestitution : P.restitution);
      if (out < 22 && b.k !== 'rock') out = 0; // settle instead of buzzing on the surface
      const keep = hard ? P.tangentKeep : 1;
      f.vx = tx * keep + nx * out;
      f.vy = ty * keep + ny * out;
      if (hard) events?.push({ t: 'bounce', i: b.i, v: -vn, rock: b.k === 'rock' });
    }
    f.contact = b.i;
  }

  // Dark stars swallow.
  for (const b of w.voids) {
    if (sq(f.x - b.x) + sq(f.y - b.y) < b.r * b.r) {
      events?.push({ t: 'void', i: b.i });
      return 'void';
    }
  }

  // Wormholes: in one, out the other at the same offset and velocity.
  if (f.gateLock >= 0) {
    const g = w.bodies[f.gateLock];
    if (sq(f.x - g.x) + sq(f.y - g.y) > sq(g.r + COMET_R + 4)) f.gateLock = -1;
  }
  for (const g of w.gates) {
    if (g.i === f.gateLock) continue;
    if (sq(f.x - g.x) + sq(f.y - g.y) < g.r * g.r) {
      const o = w.bodies[g.pair];
      f.x = o.x + (f.x - g.x);
      f.y = o.y + (f.y - g.y);
      f.gateLock = o.i;
      events?.push({ t: 'warp', i: g.i, to: o.i });
      break;
    }
  }

  // The cup.
  const speed = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
  const cd2 = sq(f.x - w.cupX) + sq(f.y - w.cupY);
  if (cd2 < P.cupCatch * P.cupCatch) {
    if (speed < P.sinkSpeed) {
      events?.push({ t: 'sink', v: speed });
      return 'sink';
    }
    if (!f.lipped) events?.push({ t: 'lip', v: speed });
    f.lipped = true;
  } else if (cd2 > sq(P.cupCatch * 2.5)) f.lipped = false;

  // Off the plate.
  const m = P.margin;
  if (f.x < -m || f.y < -m || f.x > W + m || f.y > H + m) {
    events?.push({ t: 'lost' });
    return 'lost';
  }

  // Close passes ring the planet (at the closest point of each pass).
  if (events) {
    for (const b of w.planets) {
      const sd = Math.sqrt(sq(f.x - b.x) + sq(f.y - b.y)) - b.r - COMET_R;
      const before = f.prev[b.i];
      if (sd > before && f.trend[b.i] < 0) {
        const reach = P.passReach * b.r + 40;
        if (before < reach && f.contact !== b.i) events.push({ t: 'pass', i: b.i, close: 1 - before / reach, v: speed });
      }
      if (sd !== before) f.trend[b.i] = sd < before ? -1 : 1;
      f.prev[b.i] = sd;
    }
  }

  // Resting on a surface.
  if (f.contact >= 0 && speed < P.restSpeed) {
    const b = w.bodies[f.contact];
    const dx = f.x - b.x;
    const dy = f.y - b.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / d;
    const ny = dy / d;
    const an = -(ax * nx + ay * ny);
    const at = Math.sqrt(sq(ax + an * nx) + sq(ay + an * ny));
    if (an > 0 && at <= P.stick * an) {
      f.vx = 0;
      f.vy = 0;
      events?.push({ t: 'rest', i: b.i });
      return 'rest';
    }
  }

  if (f.t >= Math.round(P.exposure / DT)) {
    events?.push({ t: 'halt' });
    return 'halt';
  }
  return null;
}

/**
 * Fly a whole shot without events (for bots, the bank and previews).
 * Returns { end, x, y, steps, contact, path? }. `every` records a path point every n steps.
 */
export function simulate(w, x, y, vx, vy, { maxSteps = Infinity, every = 0 } = {}) {
  const f = newFlight(w, x, y, vx, vy);
  const path = every ? [[x, y]] : null;
  let end = null;
  while (!end && f.t < maxSteps) {
    end = stepFlight(w, f);
    if (path && (f.t % every === 0 || end)) path.push([f.x, f.y]);
  }
  return { end, x: f.x, y: f.y, steps: f.t, contact: f.contact, path, vx: f.vx, vy: f.vy };
}

/** Launch velocity for an aim angle (radians) and power 0..1. */
export function aimVelocity(angle, power) {
  const s = Math.max(0, Math.min(1, power)) * PHYS.maxSpeed;
  return { vx: Math.cos(angle) * s, vy: Math.sin(angle) * s };
}

// ---------------------------------------------------------------------------------------
// One hole being played.

export function newHole(hole) {
  const w = prepareWorld(hole);
  return {
    hole,
    w,
    x: hole.tee.x,
    y: hole.tee.y,
    strokes: 0,
    penalties: 0,
    phase: 'aim', // aim | fly | sunk | picked
    flight: null,
    from: null,
    log: [], // one entry per launch: { from, vx, vy, path, end }
    result: null,
  };
}

export function launch(st, vx, vy) {
  if (st.phase !== 'aim') return false;
  st.strokes++;
  st.from = { x: st.x, y: st.y };
  st.flight = newFlight(st.w, st.x, st.y, vx, vy);
  st.log.push({ from: st.from, vx, vy, path: [[st.x, st.y]], end: null, notes: [] });
  st.phase = 'fly';
  return true;
}

/** Advance the flying comet by one step; returns the events of this step. */
export function tick(st) {
  const events = [];
  if (st.phase !== 'fly') return events;
  const f = st.flight;
  const end = stepFlight(st.w, f, events);
  const shot = st.log[st.log.length - 1];
  for (const e of events) if (e.t === 'pass') shot.notes.push(e.i);
  if (f.t % 2 === 0 || end || events.some((e) => e.t === 'warp')) shot.path.push([f.x, f.y]);
  if (events.some((e) => e.t === 'warp')) shot.path.push(null); // break the drawn line
  if (!end) return events;
  shot.end = end;
  st.flight = null;
  if (end === 'sink') {
    st.x = st.w.cupX;
    st.y = st.w.cupY;
    st.phase = 'sunk';
    st.result = { strokes: st.strokes, par: st.hole.par, picked: false };
    events.push({ t: 'holed' });
    return events;
  }
  if (HAZARD_ENDS.has(end)) {
    st.penalties++;
    st.strokes++;
    st.x = st.from.x;
    st.y = st.from.y;
    events.push({ t: 'penalty', why: end });
  } else {
    st.x = f.x;
    st.y = f.y;
  }
  const cap = st.hole.par + PHYS.maxOver;
  if (st.strokes >= cap) {
    st.phase = 'picked';
    st.result = { strokes: cap, par: st.hole.par, picked: true };
    events.push({ t: 'picked' });
  } else st.phase = 'aim';
  return events;
}

/** Fly the current shot to its end (fast-forward). */
export function finishFlight(st, maxSteps = 100000) {
  const all = [];
  let n = 0;
  while (st.phase === 'fly' && n++ < maxSteps) all.push(...tick(st));
  return all;
}

/** Golf name for strokes against par. */
export function scoreName(strokes, par, picked = false) {
  if (picked) return 'Picked up';
  if (strokes === 1) return 'Hole in one';
  const d = strokes - par;
  return { '-4': 'Condor', '-3': 'Albatross', '-2': 'Eagle', '-1': 'Birdie', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' }[d] ?? `${d} over`;
}

/** "+3", "−2", "E" for a total against par. */
export function toPar(n) {
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : `−${-n}`;
}
