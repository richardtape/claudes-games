// Shire generation: terrain, a river, towns with roads and houses, and the industries.
// Pure and seeded: generate(seed) always makes the same shire.
import { createRng } from '../../../shared/rng.js';
import { W, H, GRASS, WATER, ROCK, FIELD, INDUSTRY, INDUSTRY_MIX, TOWN_COUNT, HOUSE_POP, NAME_A, NAME_B } from './data.js';

const idx = (x, y) => y * W + x;
const inside = (x, y, m = 0) => x >= m && y >= m && x < W - m && y < H - m;

function noiseField(rng, cell) {
  const gw = Math.ceil(W / cell) + 2;
  const gh = Math.ceil(H / cell) + 2;
  const g = Array.from({ length: gw * gh }, () => rng.next());
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell;
    const fy = y / cell;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = sm(fx - x0);
    const ty = sm(fy - y0);
    const v = (i, j) => g[(y0 + j) * gw + (x0 + i)];
    const a = v(0, 0) + (v(1, 0) - v(0, 0)) * tx;
    const b = v(0, 1) + (v(1, 1) - v(0, 1)) * tx;
    return a + (b - a) * ty;
  };
}

function townName(rng, used) {
  for (let tries = 0; tries < 200; tries++) {
    const a = rng.pick(NAME_A);
    const b = rng.pick(NAME_B);
    // Avoid doubled letters across the join that read badly (Kettle + ley is fine, Hal + ley too).
    let n = a + b;
    if (a.endsWith(b[0]) && a.endsWith(b[0] + b[0])) continue;
    if (/(.)\1\1/.test(n)) continue;
    if (used.has(n) || [...used].some((u) => u.slice(0, 3) === n.slice(0, 3))) continue;
    used.add(n);
    return n;
  }
  const n = `Town ${used.size + 1}`;
  used.add(n);
  return n;
}

/** Makes one attempt at a shire; returns null when the layout came out unusable. */
function attempt(rng) {
  const N = W * H;
  const ground = new Array(N).fill(GRASS);
  const trees = new Array(N).fill(0);
  const road = new Array(N).fill(0);
  const track = new Array(N).fill(0);
  const house = new Array(N).fill(0); // house level 0..4
  const owner = new Array(N).fill(-1); // town id for houses and roads
  const ind = new Array(N).fill(-1); // industry id on its footprint
  const station = new Array(N).fill(-1);
  const variant = Array.from({ length: N }, () => rng.int(0, 255));

  const forestN = noiseField(rng, 7);
  const forestN2 = noiseField(rng, 3);
  const rockN = noiseField(rng, 5);

  // A river from one edge to the opposite one, wandering but never turning back.
  const alongX = rng.chance(0.5);
  let px = alongX ? 0 : rng.int(8, W - 9);
  let py = alongX ? rng.int(8, H - 9) : 0;
  let drift = 0;
  const wet = (x, y) => inside(x, y) && (ground[idx(x, y)] = WATER);
  while (inside(px, py)) {
    wet(px, py);
    if (rng.chance(0.12)) wet(px + (alongX ? 0 : 1), py + (alongX ? 1 : 0));
    if (rng.chance(0.3)) {
      drift = Math.max(-1, Math.min(1, drift + rng.pick([-1, 1])));
      if (drift !== 0) {
        if (alongX) py += drift;
        else px += drift;
        wet(px, py);
        // Keep the river away from the edges it runs along.
        if (alongX) py = Math.max(4, Math.min(H - 5, py));
        else px = Math.max(4, Math.min(W - 5, px));
      }
    }
    if (alongX) px++;
    else py++;
  }
  // A lake or two.
  for (let l = 0; l < rng.int(1, 2); l++) {
    const cx = rng.int(6, W - 7);
    const cy = rng.int(6, H - 7);
    const r = rng.float(1.4, 2.4);
    for (let y = -3; y <= 3; y++)
      for (let x = -3; x <= 3; x++) if (x * x + y * y <= r * r + rng.float(-0.5, 0.5)) wet(cx + x, cy + y);
  }

  // Crags and woods.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (ground[i] === WATER) continue;
      if (rockN(x, y) > 0.83) ground[i] = ROCK;
      else {
        const f = forestN(x, y) * 0.75 + forestN2(x, y) * 0.25;
        if (f > 0.62) trees[i] = f > 0.74 ? 3 : f > 0.68 ? 2 : 1;
        else if (rng.chance(0.025)) trees[i] = 1;
      }
    }

  const free = (x, y) => inside(x, y) && ground[idx(x, y)] !== WATER && ground[idx(x, y)] !== ROCK && !road[idx(x, y)] && !house[idx(x, y)] && ind[idx(x, y)] < 0;

  // Towns.
  const names = new Set();
  const towns = [];
  for (let tries = 0; towns.length < TOWN_COUNT && tries < 600; tries++) {
    const x = rng.int(4, W - 5);
    const y = rng.int(4, H - 5);
    if (!free(x, y)) continue;
    if (towns.some((t) => Math.abs(t.x - x) + Math.abs(t.y - y) < 13)) continue;
    towns.push({ id: towns.length, name: townName(rng, names), x, y, pop: 0, grew: 0, served: 0, goods: 0, paxOut: 0, firstTrain: false, size: rng.int(0, 2) });
  }
  if (towns.length < TOWN_COUNT) return null;

  for (const t of towns) {
    // Roads: a cross from the centre, longer arms for bigger towns.
    const arms = [0, 1, 2, 3].map(() => rng.int(2, 3 + t.size));
    road[idx(t.x, t.y)] = 0;
    owner[idx(t.x, t.y)] = t.id;
    const dirs = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    const put = (x, y, bits) => {
      road[idx(x, y)] |= bits;
      owner[idx(x, y)] = t.id;
      trees[idx(x, y)] = 0;
      if (ground[idx(x, y)] === FIELD) ground[idx(x, y)] = GRASS;
    };
    for (let e = 0; e < 4; e++) {
      let x = t.x;
      let y = t.y;
      for (let k = 0; k < arms[e]; k++) {
        const nx = x + dirs[e][0];
        const ny = y + dirs[e][1];
        if (!free(nx, ny) || !inside(nx, ny, 1)) break;
        put(x, y, 1 << e);
        put(nx, ny, 1 << ((e + 2) & 3));
        x = nx;
        y = ny;
      }
    }
    // Houses beside the roads until the town reaches its starting size.
    const want = [180, 300, 460][t.size] + rng.int(0, 80);
    let pop = 0;
    for (let guard = 0; pop < want && guard < 400; guard++) {
      const spots = [];
      for (let y = t.y - 5; y <= t.y + 5; y++)
        for (let x = t.x - 5; x <= t.x + 5; x++) {
          if (!free(x, y)) continue;
          let near = false;
          for (const [dx, dy] of dirs) {
            const i = inside(x + dx, y + dy) ? idx(x + dx, y + dy) : -1;
            if (i >= 0 && owner[i] === t.id && (road[i] || i === idx(t.x, t.y))) near = true;
          }
          if (near) spots.push([x, y]);
        }
      if (!spots.length) break;
      const [x, y] = rng.pick(spots);
      const d = Math.abs(x - t.x) + Math.abs(y - t.y);
      const lvl = d <= 1 ? rng.int(2, 3) : d <= 2 ? rng.int(1, 2) : 1;
      house[idx(x, y)] = lvl;
      owner[idx(x, y)] = t.id;
      trees[idx(x, y)] = 0;
      pop += HOUSE_POP[lvl];
    }
    t.pop = pop;
  }

  // Industries: footprints on open land, clear of towns and each other.
  const industries = [];
  for (const kind of rng.shuffle(INDUSTRY_MIX)) {
    const def = INDUSTRY[kind];
    let best = null;
    for (let tries = 0; tries < 300; tries++) {
      const x = rng.int(2, W - 2 - def.w);
      const y = rng.int(2, H - 2 - def.h);
      let ok = true;
      for (let dy = -1; dy <= def.h && ok; dy++)
        for (let dx = -1; dx <= def.w && ok; dx++) {
          const fx = x + dx;
          const fy = y + dy;
          const edge = dx < 0 || dy < 0 || dx >= def.w || dy >= def.h;
          if (!inside(fx, fy)) ok = false;
          else if (!edge && !free(fx, fy)) ok = false;
          else if (edge && (ind[idx(fx, fy)] >= 0 || road[idx(fx, fy)] || house[idx(fx, fy)])) ok = false;
        }
      if (!ok) continue;
      const cx = x + def.w / 2;
      const cy = y + def.h / 2;
      if (towns.some((t) => Math.abs(t.x - cx) + Math.abs(t.y - cy) < 6)) continue;
      if (industries.some((o) => Math.abs(o.x + 1 - cx) + Math.abs(o.y + 1 - cy) < 7)) continue;
      // Woods want to sit in woodland; everything else prefers open ground.
      let wood = 0;
      for (let dy = -2; dy < def.h + 2; dy++) for (let dx = -2; dx < def.w + 2; dx++) if (inside(x + dx, y + dy)) wood += trees[idx(x + dx, y + dy)];
      const score = (kind === 'forest' ? wood : -wood) + rng.float(0, 4);
      if (!best || score > best.score) best = { x, y, score };
      if (tries > 60 && best) break;
    }
    if (!best) return null;
    const id = industries.length;
    const prod = def.makes ? rng.int(def.prod[0], def.prod[1]) : 0;
    industries.push({ id, kind, x: best.x, y: best.y, w: def.w, h: def.h, name: '', prod, stock: 0, made: 0, moved: 0, lastMade: 0, lastMoved: 0, got: 0 });
    for (let dy = 0; dy < def.h; dy++)
      for (let dx = 0; dx < def.w; dx++) {
        const i = idx(best.x + dx, best.y + dy);
        ind[i] = id;
        trees[i] = 0;
        ground[i] = GRASS;
      }
    if (kind === 'farm') {
      for (let dy = -2; dy < def.h + 2; dy++)
        for (let dx = -2; dx < def.w + 2; dx++) {
          const fx = best.x + dx;
          const fy = best.y + dy;
          if (!free(fx, fy)) continue;
          const i = idx(fx, fy);
          if (ground[i] === GRASS && rng.chance(0.8)) {
            ground[i] = FIELD;
            trees[i] = 0;
          }
        }
    }
    if (kind === 'forest') {
      for (let dy = -2; dy < def.h + 2; dy++)
        for (let dx = -2; dx < def.w + 2; dx++) {
          const fx = best.x + dx;
          const fy = best.y + dy;
          if (free(fx, fy) && rng.chance(0.7)) trees[idx(fx, fy)] = Math.max(trees[idx(fx, fy)], rng.int(2, 3));
        }
    }
  }

  // Name each industry after its nearest town that doesn't already have one of that kind.
  for (const o of industries) {
    const byDist = towns.slice().sort((a, b) => Math.abs(a.x - o.x) + Math.abs(a.y - o.y) - (Math.abs(b.x - o.x) + Math.abs(b.y - o.y)));
    const def = INDUSTRY[o.kind];
    for (const t of byDist) {
      const n = `${t.name} ${def.name}`;
      if (!industries.some((p) => p.name === n)) {
        o.name = n;
        break;
      }
    }
    o.town = byDist[0].id;
  }

  // A playable first route: some colliery has a power station 9 to 24 tiles away.
  const pairOk = industries.some(
    (a) =>
      a.kind === 'colliery' &&
      industries.some((b) => b.kind === 'power' && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) >= 9 && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 24),
  );
  if (!pairOk) return null;

  return { ground, trees, road, track, house, owner, ind, station, variant, towns, industries };
}

/** A whole shire from a seed (a number or a string). */
export function generate(seed) {
  const rng = createRng(typeof seed === 'string' ? seed : seed >>> 0);
  for (let n = 0; n < 50; n++) {
    const m = attempt(rng);
    if (m) return m;
  }
  throw new Error(`could not generate a shire for seed ${seed}`);
}
