// Solver and bots for Comet Cup: find ace lines, and play holes with human-ish aim noise so
// tools/bank.mjs can set par. Pure; used offline by the tools (and by tests).
import { PHYS, COMET_R, HAZARD_ENDS, newFlight, stepFlight, prepareWorld, newHole, launch, finishFlight } from './engine.js';

const TAU = Math.PI * 2;

/** Fly a shot and also report how close it came to the cup. */
export function fly(w, x, y, vx, vy) {
  const f = newFlight(w, x, y, vx, vy);
  let end = null;
  let near = Infinity;
  while (!end) {
    end = stepFlight(w, f);
    const d = (f.x - w.cupX) ** 2 + (f.y - w.cupY) ** 2;
    if (d < near) near = d;
  }
  return { end, x: f.x, y: f.y, contact: f.contact, steps: f.t, near: Math.sqrt(near) };
}

/** Rough strokes still needed from where a shot ended (0 when holed). */
export function remaining(w, from, r) {
  if (r.end === 'sink') return 0;
  if (HAZARD_ENDS.has(r.end)) return 1.6 + restValue(w, from.x, from.y, from.contact ?? -1);
  return restValue(w, r.x, r.y, r.contact) + (r.end === 'halt' ? 0.25 : 0);
}

function restValue(w, x, y, contact) {
  const d = Math.hypot(x - w.cupX, y - w.cupY);
  if (contact === w.cupBody) return 1 + Math.min(0.7, d / 500);
  return 1.25 + d / 1000;
}

/** Every shot on an angle × power grid from (x, y). */
export function grid(w, x, y, { angles = 120, powers = 10, minPower = 0.08 } = {}) {
  const out = [];
  for (let a = 0; a < angles; a++) {
    const ang = (a / angles) * TAU;
    const cx = Math.cos(ang);
    const cy = Math.sin(ang);
    for (let p = 0; p < powers; p++) {
      const power = minPower + ((1 - minPower) * p) / (powers - 1);
      const s = power * PHYS.maxSpeed;
      out.push({ ang, power, vx: cx * s, vy: cy * s, r: fly(w, x, y, cx * s, cy * s) });
    }
  }
  return out;
}

/**
 * Search for a hole in one from the tee: a coarse grid, then fine grids around the shots
 * that came closest. Returns { ace: {vx, vy, ang, power} | null, rate, near }.
 */
export function findAce(w, x, y, { angles = 360, powers = 20, refine = 10 } = {}) {
  const coarse = grid(w, x, y, { angles, powers, minPower: 0.05 });
  const sinks = coarse.filter((s) => s.r.end === 'sink');
  const rate = sinks.length / coarse.length;
  if (sinks.length) {
    // Prefer the middle of the widest window: the sink whose neighbours also sink.
    const best = sinks[Math.floor(sinks.length / 2)];
    return { ace: pick(best), rate, near: 0, windows: sinks.length };
  }
  const near = coarse.slice().sort((a, b) => a.r.near - b.r.near).slice(0, refine);
  const da = TAU / angles;
  const dp = 0.95 / (powers - 1);
  let found = [];
  for (const s of near) {
    for (let i = -10; i <= 10; i++) {
      for (let j = -6; j <= 6; j++) {
        const ang = s.ang + (i / 10) * da;
        const power = s.power + (j / 6) * dp;
        if (power <= 0.03 || power > 1) continue;
        const sp = power * PHYS.maxSpeed;
        const vx = Math.cos(ang) * sp;
        const vy = Math.sin(ang) * sp;
        const r = fly(w, x, y, vx, vy);
        if (r.end === 'sink') found.push({ ang, power, vx, vy, r });
      }
    }
    if (found.length) break;
  }
  if (!found.length) return { ace: null, rate: 0, near: near[0]?.r.near ?? Infinity, windows: 0 };
  return { ace: pick(found[Math.floor(found.length / 2)]), rate, near: 0, windows: found.length };
}

const pick = (s) => ({ vx: s.vx, vy: s.vy, ang: s.ang, power: s.power });

export const SKILLS = {
  // Aim noise in radians and power noise as a fraction of the shot's power.
  expert: { aim: 0.006, power: 0.015 },
  good: { aim: 0.014, power: 0.03 },
  casual: { aim: 0.028, power: 0.06 },
};

function gauss(rng) {
  const u = Math.max(1e-9, rng.next());
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

/** Choose a shot: best expected value over a few noisy tries of the most promising shots. */
export function chooseShot(w, x, y, contact, skill, rng, { angles = 120, powers = 10, top = 8, tries = 5 } = {}) {
  const from = { x, y, contact };
  const shots = grid(w, x, y, { angles, powers });
  for (const s of shots) s.v = 1 + remaining(w, from, s.r);
  shots.sort((a, b) => a.v - b.v);
  let best = shots[0];
  let bestEv = Infinity;
  for (const s of shots.slice(0, top)) {
    let total = 0;
    for (let k = 0; k < tries; k++) {
      const n = noisy(s, skill, rng);
      total += 1 + remaining(w, from, fly(w, x, y, n.vx, n.vy));
    }
    const ev = total / tries;
    if (ev < bestEv) {
      bestEv = ev;
      best = s;
    }
  }
  return { ...best, ev: bestEv };
}

function noisy(s, skill, rng) {
  const ang = s.ang + gauss(rng) * skill.aim;
  const power = Math.max(0.02, Math.min(1, s.power * (1 + gauss(rng) * skill.power)));
  const sp = power * PHYS.maxSpeed;
  return { vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp };
}

/** Play a hole start to finish. Returns strokes (capped like a real player). */
export function playHole(hole, skill, rng, opts = {}) {
  const st = newHole(hole);
  let contact = hole.tee.b ?? -1;
  while (st.phase === 'aim') {
    const s = chooseShot(st.w, st.x, st.y, contact, skill, rng, opts);
    const n = noisy(s, skill, rng);
    launch(st, n.vx, n.vy);
    finishFlight(st);
    contact = st.log[st.log.length - 1].end === 'rest' ? lastContact(st) : -1;
  }
  return st.result.strokes;
}

function lastContact(st) {
  let best = -1;
  let bd = Infinity;
  for (const b of st.w.solids) {
    const d = Math.hypot(st.x - b.x, st.y - b.y) - b.r - COMET_R;
    if (d < bd) {
      bd = d;
      best = b.i;
    }
  }
  return bd < 2 ? best : -1;
}

export { prepareWorld };
