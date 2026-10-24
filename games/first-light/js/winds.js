// A morning's weather and task sheet from a seed: five wind layers that veer with height, the
// launch field and three crosses. Crosses are laid along a route the winds can really fly
// (a random climb-and-sink plan drifted from the launch), so every one can be reached.
import { createRng } from '../../../shared/rng.js';
import { getTerrain, HALF } from './terrain.js';

/** Layer heights (m above the valley floor) and their speeds before the day's variation. */
export const LAYER_Y = [22, 95, 175, 265, 375];
const BASE_SPEED = [3.0, 5.0, 6.8, 8.6, 10.6];

export const CROSS_COLORS = ['#ffcc55', '#7fd0ff', '#ff8fa3'];

/** Unit vector a heading (radians clockwise from north) points along, in x east / z south. */
export const headingVec = (a) => ({ x: Math.sin(a), z: -Math.cos(a) });

export function makeLayers(rng) {
  // Wind veers (turns clockwise) with height: 55–95° per layer, so the five span most of the
  // compass and any direction can be reached by mixing two of them.
  let dir = rng.float(0, Math.PI * 2);
  const out = [];
  for (let i = 0; i < LAYER_Y.length; i++) {
    const speed = BASE_SPEED[i] * rng.float(0.85, 1.15);
    const v = headingVec(dir);
    out.push({ y: LAYER_Y[i], dir: ((dir % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), speed, vx: v.x * speed, vz: v.z * speed });
    dir += rng.float(0.96, 1.66);
  }
  return out;
}

/** Wind of the layers alone at height y (no gusts, no ground friction). */
export function layerWind(layers, y) {
  if (y <= layers[0].y) return { x: layers[0].vx, z: layers[0].vz };
  const last = layers[layers.length - 1];
  if (y >= last.y) return { x: last.vx, z: last.vz };
  let i = 0;
  while (y > layers[i + 1].y) i++;
  const a = layers[i];
  const b = layers[i + 1];
  let f = (y - a.y) / (b.y - a.y);
  f = f * f * (3 - 2 * f);
  return { x: a.vx + (b.vx - a.vx) * f, z: a.vz + (b.vz - a.vz) * f };
}

/**
 * Plan a morning: { seed, layers, launch, crosses: [{ id, x, y, z, color }] }.
 * Tries routes until one passes three good sites; always returns a plan.
 */
export function planMorning(seed) {
  const T = getTerrain();
  const rng = createRng(typeof seed === 'number' ? seed : String(seed));
  for (let attempt = 0; attempt < 60; attempt++) {
    const layers = makeLayers(rng);
    const launch = rng.pick(T.launches);
    const crosses = routeCrosses(T, rng, layers, launch);
    if (crosses) return { seed, layers, launch: { id: launch.id, name: launch.name, x: launch.x, y: launch.y, z: launch.z }, crosses };
  }
  // Fallback (never seen in tests): calm winds and three sites near the launch.
  const layers = makeLayers(rng);
  const launch = T.launches[0];
  const near = T.sites.filter((s) => Math.hypot(s.x - launch.x, s.z - launch.z) > 250).slice(0, 3);
  return { seed, layers, launch: { ...launch }, crosses: near.map((s, i) => ({ id: i, ...s, color: CROSS_COLORS[i] })) };
}

function routeCrosses(T, rng, layers, launch) {
  // Drift a plan of held heights from the launch, recording where it goes.
  let x = launch.x;
  let z = launch.z;
  let y = launch.y;
  const route = [];
  let t = 0;
  let hold = rng.pick(LAYER_Y.slice(1)) + rng.float(-20, 20);
  let next = rng.float(25, 45);
  while (t < 190) {
    if (t > next) {
      hold = Math.max(T.groundAt(x, z) + 25, rng.pick(LAYER_Y) + rng.float(-25, 25));
      next = t + rng.float(25, 50);
    }
    y += Math.max(-2.5, Math.min(3, (hold - y) * 0.15));
    y = Math.max(y, T.groundAt(x, z) + 15);
    const w = layerWind(layers, y);
    x += w.x;
    z += w.z;
    t += 1;
    if (Math.abs(x) > HALF - 180 || Math.abs(z) > HALF - 180) return null;
    route.push({ x, z, t });
  }
  const picked = [];
  for (const when of [rng.float(38, 52), rng.float(82, 100), rng.float(125, 145)]) {
    const p = route.find((r) => r.t >= when);
    let best = null;
    let bestD = 160;
    for (const s of T.sites) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d >= bestD) continue;
      if (Math.hypot(s.x - launch.x, s.z - launch.z) < 260) continue;
      if (picked.some((q) => Math.hypot(s.x - q.x, s.z - q.z) < 260)) continue;
      best = s;
      bestD = d;
    }
    if (!best) return null;
    picked.push(best);
  }
  return picked.map((s, i) => ({ id: i, x: s.x, y: s.y, z: s.z, color: CROSS_COLORS[i] }));
}
