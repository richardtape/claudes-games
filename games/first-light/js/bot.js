// A human-ish balloon pilot: it reads the wind layers, picks the height whose drift passes
// closest to the next cross, flies there with the burner and vent (with a reaction delay and a
// misjudged target height), drops when the marker would land close, and lands when the propane
// runs low. `skill` 0..1 scales the noise. Flies the title-screen demo and the simulator.
import { createRng } from '../../../shared/rng.js';
import { getTerrain } from './terrain.js';
import { K, dropTarget, dropMarker, predictMarker } from './engine.js';
import { layerWind } from './winds.js';

export function createPilot({ skill = 0.7, seed = 1 } = {}) {
  const rng = createRng(seed);
  const T = getTerrain();
  const think = 2.6 - 1.6 * skill; // seconds between plans (shorter when close to a cross)
  const slop = (1 - skill) * 45; // metres of height misjudged
  const p = { goal: null, alt: 120, next: 0, err: 0, dropAt: null, best: Infinity, mode: 'climb' };

  function plan(f) {
    const b = f.b;
    const left = f.crosses.filter((c) => !c.dropped);
    if (!left.length || b.fuel < 16 || f.t > 330) {
      p.mode = 'land';
      p.goal = null;
      // Near the edge of the valley, drift back inwards while coming down.
      const edge = Math.max(Math.abs(b.x), Math.abs(b.z));
      if (edge > T.HALF - 450) {
        const r = bestHeight(f, { x: b.x * 0.3, z: b.z * 0.3 }, true);
        p.alt = r.alt;
        p.inward = true;
      } else p.inward = false;
      return;
    }
    p.mode = 'fly';
    let best = null;
    for (const c of left) {
      const r = bestHeight(f, c);
      const cost = r.miss + 0.05 * r.when * 4;
      if (!best || cost < best.cost) best = { c, ...r, cost };
    }
    p.goal = best.c;
    p.alt = best.alt;
    p.err = (rng.next() - 0.5) * 2 * slop;
  }

  function bestHeight(f, c, anyHeight = false) {
    const b = f.b;
    const g = T.groundAt(b.x, b.z);
    const dist = Math.hypot(c.x - b.x, c.z - b.z);
    if (!anyHeight && dist < 240) return approach(f, c);
    let best = null;
    const stepA = skill > 0.5 ? 12 : 24;
    for (let a = Math.max(g + 18, 18); a <= 460; a += stepA) {
      // Drift: half the climb time at the mean of the two winds, then at the new height.
      const climb = Math.abs(a - b.y) / 3;
      let x = b.x;
      let z = b.z;
      let miss = Infinity;
      let when = 0;
      const w0 = layerWind(f.layers, b.y);
      const w1 = layerWind(f.layers, a);
      for (let t = 0; t <= 160; t += 2) {
        const k = Math.min(1, t / Math.max(1, climb));
        x += (w0.x + (w1.x - w0.x) * k) * 2;
        z += (w0.z + (w1.z - w0.z) * k) * 2;
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < miss) {
          miss = d;
          when = t;
        }
      }
      let cost = miss + (rng.next() - 0.5) * (1 - skill) * 60;
      // Close in: low is accurate.
      if (dist < 320) cost += Math.max(0, a - T.groundAt(c.x, c.z) - 35) * 0.25;
      if (!best || cost < best.cost) best = { alt: a, miss, when, cost };
    }
    return best;
  }

  // Close to a cross: search low heights finely, with the real (gusty) wind along the way.
  function approach(f, c) {
    const b = f.b;
    const gc = T.groundAt(c.x, c.z);
    let best = null;
    const stepA = skill > 0.5 ? 4 : 10;
    for (let a = gc + 18; a <= gc + 140; a += stepA) {
      let x = b.x;
      let z = b.z;
      let miss = Infinity;
      let when = 0;
      const climb = Math.abs(a - b.y) / 2.5;
      const w0 = layerWind(f.layers, b.y);
      const w1 = layerWind(f.layers, a);
      for (let t = 0; t <= 90; t += 1) {
        const k = Math.min(1, t / Math.max(1, climb));
        x += w0.x + (w1.x - w0.x) * k;
        z += w0.z + (w1.z - w0.z) * k;
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < miss) {
          miss = d;
          when = t;
        }
      }
      const cost = miss + (a - gc) * 0.12 + (rng.next() - 0.5) * (1 - skill) * 40;
      if (!best || cost < best.cost) best = { alt: a, miss, when, cost };
    }
    return best;
  }

  function decide(f) {
    const b = f.b;
    if (f.phase === 'landed') return {};
    if (f.t >= p.next) {
      plan(f);
      const close = p.goal && Math.hypot(p.goal.x - b.x, p.goal.z - b.z) < 240;
      p.next = f.t + (close ? 0.6 + 0.6 * (1 - skill) : think) * (0.7 + 0.6 * rng.next());
    }
    const g = T.groundAt(b.x, b.z);
    const clear = b.y - g;
    let target = p.alt + p.err;
    if (f.phase === 'ready') return { burn: true };
    if (p.mode === 'land' && !p.inward) target = g - 10;
    if (p.mode === 'land' && p.inward && Math.max(Math.abs(b.x), Math.abs(b.z)) < T.HALF - 650) {
      p.inward = false;
      target = g - 10;
    }

    // Look ahead for terrain and chimneys on the line of drift.
    let ahead = g;
    for (const s of [6, 12, 20]) ahead = Math.max(ahead, T.groundAt(b.x + b.vx * s, b.z + b.vz * s));
    const minClear = p.mode === 'land' ? 0 : 22;
    target = Math.max(target, ahead + minClear, f.t < 20 ? g + 60 : -Infinity);

    const want = Math.max(-3.2, Math.min(4, (target - b.y) * 0.06));
    const coming = K.lift * (b.heat + b.pend);
    const input = { burn: coming < want - 0.35, vent: K.lift * b.heat > want + 1.8 && clear > 25 };
    if (p.mode === 'land' && !p.inward) {
      // Down gently: burn to cushion the last stretch, then let it settle.
      input.vent = clear > 60 && b.vy > -2;
      input.burn = clear < 30 ? b.vy < -1.0 && !b.onGround : clear < 80 ? b.vy < -2.2 : false;
    } else if (clear < 14 && b.vy < 0) input.burn = true;

    // Drop when the marker would land close (with a little hesitation for weaker pilots).
    const c = dropTarget(f);
    if (c && c === p.goal) {
      const m = predictMarker(f);
      const d = Math.hypot(m.x - c.x, m.z - c.z);
      const good = 4 + (1 - skill) * 22;
      // Drop when it's close enough, or on the best pass (the predicted distance turns back up).
      if (d < good || d > p.best + 1.5) {
        if (p.dropAt === null) p.dropAt = f.t + 0.15 + (1 - skill) * rng.next() * 0.9;
      }
      p.best = Math.min(p.best, d);
      if (p.dropAt !== null && f.t >= p.dropAt) input.drop = true;
    } else if (!c) {
      p.best = Infinity;
      p.dropAt = null;
    }
    return input;
  }

  return {
    decide,
    get plan() {
      return p;
    },
    /** Decide, and act on a drop through the engine (sims and the demo; the UI drops for itself). */
    act(f) {
      const input = decide(f);
      if (input.drop && dropMarker(f)) {
        p.dropAt = null;
        p.best = Infinity;
        p.next = 0;
      }
      return input;
    },
  };
}
