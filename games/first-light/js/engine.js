// First Light's rules: one dawn flight of a hot-air balloon. Pure and serializable (no DOM, no
// Math.random): the whole flight is `state`, advanced in fixed 1/60 s steps by `step()`. The UI
// drains `state.events` for sound and juice.
import { getTerrain, noise2, HALF } from './terrain.js';
import { layerWind, planMorning } from './winds.js';

export const VERSION = 1;
export const DT = 1 / 60;

/** Tuning, kept in one place for the simulator (tools/sim.mjs --set burnHeat=0.06). */
export const K = {
  burnHeat: 0.095, // heat per second the burner puts into the pending heat
  heatFlow: 1.1, // seconds for pending heat to reach the envelope (the burner's lag)
  cool: 0.0105, // heat the envelope loses per second
  coolHot: 0.032, // and more the hotter it is (per second per unit of heat above neutral)
  vent: 0.075, // extra heat lost per second while venting
  heatMin: -0.32,
  heatMax: 0.42,
  lift: 15, // m/s of climb per unit of heat
  tauV: 1.9, // seconds for vertical speed to follow the heat
  tauH: 3.4, // seconds for the balloon to take up the wind
  ceiling: 470, // lift fades out above this
  fuelPerSec: 1.35, // % of the tank per second of burn
  settle: 2.4, // seconds on the ground with the burner off before the flight is over
  bump: 2.6, // m/s of descent that makes a touch a bump
  dropRange: 150, // m from a cross a marker can be dropped
  markerTerminal: 24,
  markerDrag: 0.22,
  sun0: 0.25, // sun elevation (degrees) at launch
  sunRate: 0.06, // degrees per second
  sunAz: (113 * Math.PI) / 180, // where the sun rises (radians clockwise from north)
  sunUp: 9.5, // elevation at which the whole valley is lit anyway
  firstLight: 200,
  bumpCost: 40,
  propanePoint: 3, // points per % of propane left at landing
};

export const LANDINGS = {
  soft: { points: 400, label: 'Soft landing' },
  firm: { points: 250, label: 'Firm landing' },
  bumpy: { points: 120, label: 'Bumpy landing' },
  hard: { points: 0, label: 'Hard landing' },
};
const SURFACE = {
  field: { k: 1, label: 'in a field' },
  orchard: { k: 0.5, label: 'in the apricot trees' },
  town: { k: 0.4, label: 'in the potters’ town' },
  rock: { k: 0.3, label: 'among the chimneys' },
  river: { k: 0, label: 'in the river' },
  edge: { k: 0, label: 'beyond the valley' },
};

/** Points for a marker that lands `d` metres from the centre of its cross: 1000 within 3 m, 12 fewer
 * a metre after that, and 50 for any marker that lands within 150 m. */
export const markerPoints = (d) => (d <= 3 ? 1000 : d > 150 ? 0 : Math.max(50, Math.round(1000 - (d - 3) * 12)));
/** Photo points for a framing score 0..1. */
export const photoPoints = (framing) => Math.round(150 + 250 * Math.max(0, Math.min(1, framing)));

export function landingQuality(impact) {
  if (impact <= 0.9) return 'soft';
  if (impact <= 1.6) return 'firm';
  if (impact <= K.bump) return 'bumpy';
  return 'hard';
}

/** A new flight, standing inflated on its launch field. */
export function createFlight({ seed, mode = 'free', day = null, plan = null } = {}) {
  plan ??= planMorning(seed);
  const { launch } = plan;
  return {
    v: VERSION,
    seed: plan.seed,
    mode,
    day,
    t: 0,
    phase: 'ready', // ready → flying → landed
    layers: plan.layers,
    launch,
    crosses: plan.crosses.map((c) => ({ ...c, dropped: false, result: null })),
    b: { x: launch.x, y: launch.y, z: launch.z, vx: 0, vy: 0, vz: 0, heat: -0.06, pend: 0, fuel: 100, burning: false, venting: false, onGround: true },
    markers: [],
    photos: [],
    sun: { elev: K.sun0, lit: false, litAt: null },
    firstLight: null,
    touch: null, // the latest touchdown: { impact, surface, t }
    settleT: 0,
    bumps: 0, // bumps and scrapes together (each costs points)
    scrapes: 0,
    scrapeT: -9,
    landing: null,
    track: [[Math.round(launch.x), Math.round(launch.y), Math.round(launch.z)]],
    maxAlt: launch.y,
    events: [],
  };
}

/** The wind at (x, y, z) for this flight: the layers, slow gusts, and calm near the ground. */
export function windAt(state, x, y, z) {
  const T = getTerrain();
  const w = layerWind(state.layers, y);
  const g1 = noise2(x / 380 + state.t * 0.004, z / 380, 71) - 0.5;
  const g2 = noise2(x / 300, z / 300 - state.t * 0.003, 72) - 0.5;
  const turn = g1 * 0.32;
  const gain = 1 + g2 * 0.24;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const clear = y - T.groundAt(x, z);
  const calm = 0.3 + 0.7 * smooth(0, 40, clear);
  return { x: (w.x * c - w.z * s) * gain * calm, z: (w.x * s + w.z * c) * gain * calm };
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * One balloon's physics for dt seconds (shared with the other balloons in the sky). Returns
 * the vertical speed it hit the ground with, or null if it did not touch down this step.
 */
export function stepBalloon(b, input, wind, ground, dt = DT) {
  const burning = !!input.burn && b.fuel > 0;
  b.burning = burning;
  b.venting = !!input.vent;
  if (burning) {
    b.pend += K.burnHeat * dt;
    b.fuel = Math.max(0, b.fuel - K.fuelPerSec * dt);
  }
  const flow = (b.pend * dt) / K.heatFlow;
  b.pend -= flow;
  b.heat += flow - (K.cool + K.coolHot * Math.max(0, b.heat)) * dt - (b.venting ? K.vent * dt : 0);
  b.heat = Math.max(K.heatMin, Math.min(K.heatMax, b.heat));
  const above = smooth(K.ceiling, K.ceiling + 60, b.y);
  const want = K.lift * b.heat - above * 7;
  b.vy += ((want - b.vy) * dt) / K.tauV;
  b.vx += ((wind.x - b.vx) * dt) / K.tauH;
  b.vz += ((wind.z - b.vz) * dt) / K.tauH;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  let hit = null;
  if (b.y <= ground) {
    if (!b.onGround) hit = Math.max(0, -b.vy);
    b.y = ground;
    if (b.vy < 0) b.vy = 0;
    b.onGround = true;
    // The basket drags on the ground.
    b.vx *= 1 - Math.min(1, 5 * dt);
    b.vz *= 1 - Math.min(1, 5 * dt);
  } else if (b.y > ground + 0.05) {
    b.onGround = false;
  }
  return hit;
}

/** Advance the flight by one step. input: { burn, vent }. */
export function step(state, input = {}) {
  if (state.phase === 'landed') return state;
  const T = getTerrain();
  const b = state.b;
  const ev = state.events;
  state.t += DT;
  const wasReady = state.phase === 'ready';
  const ground = T.groundAt(b.x, b.z);
  const wind = wasReady ? { x: 0, z: 0 } : windAt(state, b.x, b.y, b.z);
  const hit = stepBalloon(b, input, wind, ground);

  if (wasReady) {
    // Standing on the launch field until the envelope is hot enough to lift.
    if (!b.onGround) {
      state.phase = 'flying';
      ev.push({ type: 'liftoff' });
    } else {
      b.x = state.launch.x;
      b.z = state.launch.z;
    }
  }

  if (state.phase === 'flying') {
    // Chimneys: the basket scrapes off them.
    const c = T.chimneyAt(b.x, b.y, b.z, 1.2);
    if (c) {
      const dx = b.x - c.x;
      const dz = b.z - c.z;
      const d = Math.hypot(dx, dz) || 1;
      const k = Math.max(0, Math.min(1, (b.y - c.y) / c.h));
      const r = c.r * (1 - 0.45 * k) + 1.3;
      b.x = c.x + (dx / d) * r;
      b.z = c.z + (dz / d) * r;
      const vn = (b.vx * dx + b.vz * dz) / d;
      if (vn < 0) {
        b.vx -= 1.3 * vn * (dx / d);
        b.vz -= 1.3 * vn * (dz / d);
      }
      // Only a real knock counts, not a basket resting against the rock.
      if (vn < -0.7 && state.t - state.scrapeT > 1.2) {
        state.scrapeT = state.t;
        state.bumps++;
        state.scrapes = (state.scrapes ?? 0) + 1;
        ev.push({ type: 'scrape', x: b.x, y: b.y, z: b.z });
      }
    }
    if (hit !== null) {
      const surface = T.surfaceAt(b.x, b.z);
      state.touch = { impact: hit, surface, t: state.t };
      ev.push({ type: 'touch', impact: hit, surface });
      if (hit > K.bump) {
        state.bumps++;
        ev.push({ type: 'bump', impact: hit });
      }
    }
    // Settling: on (or within a hand's breadth of) the ground with the burner off. A basket
    // nudged off the ground by a chimney or a slope still settles.
    const clear = b.y - T.groundAt(b.x, b.z);
    if (clear < 0.6 && !b.burning) state.settleT += DT;
    else if (b.burning || clear > 2) state.settleT = 0;
    if (clear < 0.6 && state.touch && (state.settleT >= K.settle || (b.fuel <= 0 && state.settleT >= 0.6))) land(state, T.surfaceAt(b.x, b.z));
    if (Math.abs(b.x) > HALF || Math.abs(b.z) > HALF) land(state, 'edge');
    for (const m of state.markers) if (!m.landed) stepMarker(state, m);
    sunrise(state);
    if (Math.round(state.t * 60) % 60 === 0) {
      state.track.push([Math.round(b.x), Math.round(b.y), Math.round(b.z)]);
      state.maxAlt = Math.max(state.maxAlt, b.y);
    }
    if (b.fuel <= 15 && !state.lowFuel) {
      state.lowFuel = true;
      ev.push({ type: 'lowFuel' });
    }
    if (b.fuel <= 0 && !state.noFuel) {
      state.noFuel = true;
      ev.push({ type: 'noFuel' });
    }
  }
  return state;
}

/** Advance `seconds` of flight with the same input held. */
export function advance(state, seconds, input = {}) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n && state.phase !== 'landed'; i++) step(state, input);
  return state;
}

function sunrise(state) {
  const s = state.sun;
  s.elev = K.sun0 + K.sunRate * state.t;
  if (s.lit) return;
  // Look east every quarter second: has the sun cleared the ridges from where the basket is?
  if (Math.round(state.t * 60) % 15 !== 0) return;
  const b = state.b;
  const horizon = (getTerrain().horizonAngle(b.x, b.y + 12, b.z, K.sunAz) * 180) / Math.PI;
  if (s.elev > horizon || s.elev >= K.sunUp) {
    s.lit = true;
    s.litAt = state.t;
    const airborne = !b.onGround && s.elev < K.sunUp;
    if (airborne) {
      state.firstLight = { t: state.t, alt: b.y, agl: b.y - getTerrain().groundAt(b.x, b.z), points: K.firstLight };
    }
    state.events.push({ type: 'firstLight', airborne, alt: b.y });
  }
}

/** The cross a marker dropped now would count for, or null. */
export function dropTarget(state) {
  if (state.phase !== 'flying') return null;
  const b = state.b;
  let best = null;
  let bestD = K.dropRange;
  for (const c of state.crosses) {
    if (c.dropped) continue;
    const d = Math.hypot(c.x - b.x, c.z - b.z);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** Drop a marker on the nearest cross in range. Returns the marker, or null. */
export function dropMarker(state) {
  const c = dropTarget(state);
  if (!c) return null;
  const b = state.b;
  c.dropped = true;
  const m = { cross: c.id, x: b.x, y: b.y - 1, z: b.z, vx: b.vx, vy: Math.min(0, b.vy), vz: b.vz, landed: false };
  state.markers.push(m);
  state.events.push({ type: 'drop', cross: c.id });
  return m;
}

function stepMarker(state, m) {
  const T = getTerrain();
  m.vy = Math.max(-K.markerTerminal, m.vy - 9.8 * DT);
  const w = windAt(state, m.x, m.y, m.z);
  m.vx += (w.x - m.vx) * K.markerDrag * DT;
  m.vz += (w.z - m.vz) * K.markerDrag * DT;
  m.x += m.vx * DT;
  m.y += m.vy * DT;
  m.z += m.vz * DT;
  const g = T.groundAt(m.x, m.z);
  if (m.y <= g) {
    m.y = g;
    m.landed = true;
    const c = state.crosses[m.cross];
    const d = Math.hypot(m.x - c.x, m.z - c.z);
    c.result = { x: m.x, z: m.z, d, points: markerPoints(d) };
    state.events.push({ type: 'markerLanded', cross: c.id, d, points: c.result.points });
  }
}

/** Where a marker dropped now would land (same physics, run ahead). */
export function predictMarker(state, seconds = 8) {
  const T = getTerrain();
  const b = state.b;
  const m = { x: b.x, y: b.y - 1, z: b.z, vx: b.vx, vy: Math.min(0, b.vy), vz: b.vz };
  const dt = 1 / 30;
  for (let i = 0; i < seconds / dt; i++) {
    m.vy = Math.max(-K.markerTerminal, m.vy - 9.8 * dt);
    const w = windAt(state, m.x, m.y, m.z);
    m.vx += (w.x - m.vx) * K.markerDrag * dt;
    m.vz += (w.z - m.vz) * K.markerDrag * dt;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.z += m.vz * dt;
    const g = T.groundAt(m.x, m.z);
    if (m.y <= g) return { x: m.x, y: g, z: m.z };
  }
  return { x: m.x, y: T.groundAt(m.x, m.z), z: m.z };
}

/**
 * Record a photo of subject `id` (a landmark or special shot) with framing 0..1. Only the best
 * framing of each subject counts in a flight. Returns { points, gained, first } or null.
 */
export function takePhoto(state, id, framing) {
  if (state.phase !== 'flying') return null;
  const points = photoPoints(framing);
  const had = state.photos.find((p) => p.id === id);
  if (had && had.points >= points) return { points: had.points, gained: 0, first: false };
  const gained = points - (had?.points ?? 0);
  if (had) Object.assign(had, { points, framing, t: state.t });
  else state.photos.push({ id, points, framing, t: state.t });
  state.events.push({ type: 'photo', id, points, gained, first: !had });
  return { points, gained, first: !had };
}

function land(state, surface) {
  const b = state.b;
  const impact = state.touch?.impact ?? 0;
  const quality = surface === 'edge' ? 'hard' : landingQuality(impact);
  const s = SURFACE[surface] ?? SURFACE.field;
  const points = Math.round(LANDINGS[quality].points * s.k);
  state.phase = 'landed';
  state.landing = { impact, quality, surface, points, label: `${LANDINGS[quality].label} ${s.label}`, fuel: b.fuel, x: b.x, z: b.z };
  if (surface === 'edge') state.landing.label = 'Drifted out of the valley';
  state.track.push([Math.round(b.x), Math.round(b.y), Math.round(b.z)]);
  state.events.push({ type: 'landed', ...state.landing });
}

/** The flight's score so far, line by line. */
export function scoreOf(state) {
  const crosses = state.crosses.reduce((s, c) => s + (c.result?.points ?? 0), 0);
  const photos = state.photos.reduce((s, p) => s + p.points, 0);
  const firstLight = state.firstLight?.points ?? 0;
  const landing = state.landing?.points ?? 0;
  // Leftover propane counts only once every marker is down (landing at once must not pay).
  const allDown = state.crosses.every((c) => c.dropped);
  const propane = state.landing && state.landing.surface !== 'edge' && allDown ? Math.round(state.landing.fuel * K.propanePoint) : 0;
  const bumps = -state.bumps * K.bumpCost;
  const total = Math.max(0, crosses + photos + firstLight + landing + propane + bumps);
  return { crosses, photos, firstLight, landing, propane, bumps, total };
}

/** Reopen a saved flight (null if it is from another version or broken). */
export function restore(saved) {
  if (!saved || saved.v !== VERSION || !saved.b || !Array.isArray(saved.layers)) return null;
  saved.events = [];
  return saved;
}
