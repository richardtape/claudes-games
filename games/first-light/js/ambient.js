// The other balloons in the sky: launched in clusters from the same fields, each with its own
// plan of heights, flown on the same physics and winds as yours. They are scenery, but they also
// show the wind: a balloon above you drifting another way is a layer you could join.
import { createRng } from '../../../shared/rng.js';
import { getTerrain } from './terrain.js';
import { stepBalloon, windAt } from './engine.js';
import { LAYER_Y } from './winds.js';

const STEP = 0.1;

export function createSky(flight, count = 42) {
  const T = getTerrain();
  const rng = createRng(`${flight.seed}:sky`);
  const balloons = [];
  for (let i = 0; i < count; i++) {
    const field = rng.pick(T.launches);
    const ox = rng.float(-140, 140);
    const oz = rng.float(-140, 140);
    const x = field.x + ox;
    const z = field.z + oz;
    const early = i < count * 0.45; // already up when you launch
    const y0 = T.groundAt(x, z);
    const b = { x, y: y0, z, vx: 0, vy: 0, vz: 0, heat: -0.06, pend: 0, fuel: 100, onGround: true, burning: false, venting: false };
    const plan = { launch: early ? -rng.float(20, 90) : rng.float(4, 150), hold: rng.pick(LAYER_Y) + rng.float(-30, 40), next: 0, landAt: rng.float(220, 420), down: false };
    balloons.push({ id: i, design: i % 8, b, plan, landed: false, seen: 0 });
  }
  const sky = { balloons, t: -100, shim: { layers: flight.layers, t: 0 } };
  // Fly the early risers up to the moment of your launch.
  advanceSky(sky, flight, 0);
  return sky;
}

/** Step every balloon on to flight time `t`. */
export function advanceSky(sky, flight, t) {
  const T = getTerrain();
  while (sky.t + STEP <= t) {
    sky.t += STEP;
    sky.shim.t = Math.max(0, sky.t);
    sky.shim.layers = flight.layers;
    for (const k of sky.balloons) {
      if (k.landed) continue;
      const { b, plan } = k;
      const ground = T.groundAt(b.x, b.z);
      if (sky.t < plan.launch) continue;
      if (sky.t > plan.next) {
        plan.hold = Math.max(ground + 40, LAYER_Y[Math.floor(hash(k.id, plan.next) * LAYER_Y.length)] + (hash(plan.next, k.id) - 0.5) * 70);
        plan.next = sky.t + 25 + 40 * hash(k.id + 7, plan.next);
      }
      if (sky.t > plan.landAt) plan.down = true;
      const target = plan.down ? ground - 5 : plan.hold;
      const want = Math.max(-2.2, Math.min(3, (target - b.y) * 0.05));
      const input = { burn: b.vy < want - 0.25 && b.heat < 0.3, vent: b.vy > want + 1.6 };
      if (plan.down && b.y - ground < 25) input.burn = b.vy < -1.2;
      const wind = b.onGround && sky.t < plan.launch + 2 ? { x: 0, z: 0 } : windAt(sky.shim, b.x, b.y, b.z);
      stepBalloon(b, input, wind, ground, STEP);
      if (plan.down && b.onGround && sky.t > plan.landAt + 8) k.landed = true;
    }
  }
}

function hash(a, b) {
  let h = Math.imul(Math.floor(a * 1000) | 0, 374761393) ^ Math.imul(Math.floor(b * 1000) | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
