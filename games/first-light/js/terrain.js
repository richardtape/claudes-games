// The valley: one hand-shaped piece of Cappadocia, built the same way every time (no DOM, no
// randomness beyond a fixed noise seed). Coordinates are metres: x east, z south (north is -z, as
// in three.js), y up from the valley-floor datum. The engine reads heights from the same grid the
// renderer turns into triangles, so the basket meets exactly the ground you see.

export const HALF = 1600; // the play area is a square ±HALF metres
export const EXTENT = 2000; // the grid reaches further, so its edges sit in the fog
export const CELL = 20;
export const N = (EXTENT * 2) / CELL + 1; // vertices per side

// ---------------------------------------------------------------- noise

function hash2(i, j, seed) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in 0..1. */
export function noise2(x, z, seed = 1) {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j, seed);
  const b = hash2(i + 1, j, seed);
  const c = hash2(i, j + 1, seed);
  const d = hash2(i + 1, j + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, z, seed = 1, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x * f, z * f, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
};

// ---------------------------------------------------------------- the valleys

// Each valley is a polyline with a floor height that runs from `floor[0]` at the first point to
// `floor[1]` at the last, a flat floor of half-width `w`, and walls rising `steep` metres per metre.
export const VALLEYS = [
  { id: 'main', floor: [8, 14], w: 165, steep: 0.62, pts: [[-2100, 1150], [-1500, 900], [-950, 640], [-420, 380], [80, 190], [560, 20], [1000, -230], [1450, -520], [2100, -760]] },
  { id: 'pigeon', floor: [78, 22], w: 46, steep: 1.05, pts: [[-1150, -1700], [-1000, -1150], [-860, -620], [-760, -150], [-700, 520]] },
  { id: 'rose', floor: [84, 26], w: 42, steep: 1.15, pts: [[1250, -1750], [980, -1250], [720, -760], [520, -330], [420, 60]] },
  { id: 'church', floor: [74, 24], w: 38, steep: 1.2, pts: [[-120, -1500], [10, -1050], [110, -600], [170, -150], [230, 160]] },
  { id: 'devrent', floor: [62, 20], w: 95, steep: 0.55, pts: [[1700, 1700], [1250, 1150], [880, 760], [520, 420], [300, 120]] },
  { id: 'south', floor: [66, 18], w: 60, steep: 0.8, pts: [[-520, 1900], [-430, 1350], [-330, 900], [-260, 560], [-260, 330]] },
];

/** Distance from (x, z) to a polyline, and the fraction (0..1) along it of the nearest point. */
function polyDist(pts, x, z, lens, total) {
  let best = Infinity;
  let bestT = 0;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const L2 = dx * dx + dz * dz;
    let u = ((x - ax) * dx + (z - az) * dz) / L2;
    u = Math.max(0, Math.min(1, u));
    const px = ax + dx * u - x;
    const pz = az + dz * u - z;
    const d = Math.sqrt(px * px + pz * pz);
    if (d < best) {
      best = d;
      bestT = (acc + u * lens[i]) / total;
    }
    acc += lens[i];
  }
  return { d: best, t: bestT };
}

for (const v of VALLEYS) {
  v.lens = v.pts.slice(1).map(([x, z], i) => Math.hypot(x - v.pts[i][0], z - v.pts[i][1]));
  v.total = v.lens.reduce((a, b) => a + b, 0);
}

/** A point `t` (0..1) along a valley's centre line, moved `offset` metres to its left. */
export function along(id, t, offset = 0) {
  const v = VALLEYS.find((q) => q.id === id);
  let want = t * v.total;
  for (let i = 0; i < v.lens.length; i++) {
    if (want <= v.lens[i] || i === v.lens.length - 1) {
      const u = Math.min(1, want / v.lens[i]);
      const [ax, az] = v.pts[i];
      const [bx, bz] = v.pts[i + 1];
      const dx = (bx - ax) / v.lens[i];
      const dz = (bz - az) / v.lens[i];
      // Left of the direction of travel (x east, z south): (dz, -dx).
      return { x: ax + (bx - ax) * u + dz * offset, z: az + (bz - az) * u - dx * offset };
    }
    want -= v.lens[i];
  }
  return { x: v.pts.at(-1)[0], z: v.pts.at(-1)[1] };
}

export const valleyInfo = (id, x, z) => {
  const v = VALLEYS.find((q) => q.id === id);
  return polyDist(v.pts, x, z, v.lens, v.total);
};

// Big shapes on top of the plateau.
export const CASTLE = { x: -470, z: -560 }; // the castle rock's hill
const PLATEAU = 122;

/** The analytic height before it is sampled into the grid (and before the river channel). */
function shapeHeight(x, z) {
  let h = PLATEAU + 34 * (fbm(x / 520, z / 520, 3, 4) - 0.5);
  // A higher ridge along the east edge: from the valley floor it hides the sunrise.
  h += 46 * smoothstep(700, 1700, x - 0.25 * z);
  // The castle hill: a broad dome under the castle rock.
  const cd = Math.hypot(x - CASTLE.x, z - CASTLE.z);
  h += 92 * Math.exp(-(cd * cd) / (2 * 210 * 210));
  for (const v of VALLEYS) {
    const { d, t } = polyDist(v.pts, x, z, v.lens, v.total);
    if (d > v.w + 400) continue;
    const floor = v.floor[0] + (v.floor[1] - v.floor[0]) * t + 3 * (noise2(x / 90, z / 90, 9) - 0.5);
    const wobble = 0.8 + 0.45 * noise2(x / 140, z / 140, 11);
    const wall = floor + Math.max(0, d - v.w) * v.steep * wobble;
    h = smin(h, wall, 14);
  }
  // Strata: soften the slopes into benches, the stepped layers of tuff.
  const step = 15;
  const k = h / step;
  const f = Math.floor(k);
  const benched = (f + smoothstep(0.3, 0.7, k - f)) * step;
  h = h + (benched - h) * 0.55;
  return h;
}

// ---------------------------------------------------------------- build

let built = null;

/** The valley, built once and cached. */
export function getTerrain() {
  if (!built) built = buildTerrain();
  return built;
}

function buildTerrain() {
  const heights = new Float32Array(N * N);
  const main = VALLEYS[0];
  for (let j = 0; j < N; j++) {
    const z = -EXTENT + j * CELL;
    for (let i = 0; i < N; i++) {
      const x = -EXTENT + i * CELL;
      let h = shapeHeight(x, z);
      const { d, t } = polyDist(main.pts, x, z, main.lens, main.total);
      const floor = main.floor[0] + (main.floor[1] - main.floor[0]) * t;
      if (d < 26) h = Math.min(h, floor - 2.5 + (d / 26) * 2.5); // the river's channel
      heights[j * N + i] = h;
    }
  }

  /** Ground height under (x, z), on the same triangles the renderer draws. */
  function groundAt(x, z) {
    const gx = Math.min(N - 1.001, Math.max(0, (x + EXTENT) / CELL));
    const gz = Math.min(N - 1.001, Math.max(0, (z + EXTENT) / CELL));
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    const h00 = heights[j * N + i];
    const h10 = heights[j * N + i + 1];
    const h01 = heights[(j + 1) * N + i];
    const h11 = heights[(j + 1) * N + i + 1];
    // Each cell is split along its (i, j+1)–(i+1, j) diagonal (as in buildTerrainGeometry).
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  /** Steepness (rise over run) of the ground under (x, z). */
  function slopeAt(x, z) {
    const e = CELL * 0.5;
    const dx = (groundAt(x + e, z) - groundAt(x - e, z)) / (2 * e);
    const dz = (groundAt(x, z + e) - groundAt(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  }

  const T = { heights, groundAt, slopeAt, N, CELL, EXTENT, HALF };
  T.river = riverLine();
  T.town = townHouses(T);
  T.landmarks = placeLandmarks(T);
  T.trees = plantTrees(T);
  T.chimneys = raiseChimneys(T);
  T.chimneyIndex = indexChimneys(T.chimneys);
  T.chimneyAt = (x, y, z, pad = 0) => chimneyAt(T, x, y, z, pad);
  T.surfaceAt = (x, z) => surfaceAt(T, x, z);
  T.horizonAngle = (x, y, z, azimuth) => horizonAngle(T, x, y, z, azimuth);
  T.launches = LAUNCHES.map((p) => ({ ...p, y: groundAt(p.x, p.z) }));
  T.sites = targetSites(T);
  return T;
}

function riverLine() {
  const out = [];
  for (let t = 0; t <= 1.0001; t += 0.01) out.push(along('main', t, 14 * Math.sin(t * 37)));
  return out;
}

// ---------------------------------------------------------------- places

export const LAUNCHES = [
  { id: 'west', name: 'the west meadow', ...along('main', 0.18, -60) },
  { id: 'orchard', name: 'the orchard field', ...along('main', 0.36, 90) },
  { id: 'bridge', name: 'the river field', ...along('main', 0.5, -95) },
  { id: 'devrent', name: 'the Devrent flats', ...along('devrent', 0.55, 0) },
  { id: 'east', name: 'the east bend', ...along('main', 0.7, 90) },
];

const L = (id, name, fact, pos, extra = {}) => ({ id, name, fact, ...pos, ...extra });

/**
 * The album's places. `x, z` stand them on the ground; `subject` is the point a photo should
 * frame (height above that ground) and `r` its size, for framing scores.
 */
function placeLandmarks(T) {
  const list = [
    L('castle', 'Castle Rock', 'Villagers carved hundreds of rooms into rock castles like this one, and kept watch from the top.', { x: CASTLE.x, z: CASTLE.z }, { hint: 'The highest hill, north-west of the bridge.', lift: 60, r: 75, keep: 120 }),
    L('beauties', 'The Three Beauties', 'Fairy chimneys form where soft volcanic tuff wears away from under a cap of harder rock.', along('south', 0.62, 72), { hint: 'Three tall chimneys up the side valley to the south.', lift: 22, r: 30, keep: 45 }),
    L('camel', 'Camel Rock', 'Wind and rain carve the soft tuff into shapes that people love to name. This one is a camel.', along('devrent', 0.32, -40), { hint: 'Out in the wide Devrent valley to the south-east.', lift: 10, r: 26, keep: 40 }),
    L('pigeons', 'Pigeon Valley', 'Farmers carved dovecotes into the cliffs and spread the droppings on their vineyards.', along('pigeon', 0.5, 58), { hint: 'White dovecotes along the cliffs of the north-western valley.', lift: 18, r: 60, keep: 0 }),
    L('church', 'The Cave Church', 'About a thousand years ago, Christian communities carved churches into the rock and painted them inside.', along('church', 0.55, 24), { hint: 'In the narrow valley running north from the bridge.', lift: 14, r: 30, keep: 40 }),
    L('monks', "Monks' Valley", 'Hermits once lived in chimneys like these, and some chimneys carry two or three caps.', along('main', 0.27, 150), { hint: 'Chimneys with two and three caps, west along the river’s north bank.', lift: 16, r: 50, keep: 70 }),
    L('bridge', 'Red River Bridge', 'The Red River, the Kızılırmak, carries the red clay that potters in Avanos have shaped for centuries.', along('main', 0.555, 0), { hint: 'Where the river runs past the potters’ town.', lift: 4, r: 40, keep: 60 }),
    L('orchards', 'Apricot Orchards', 'Vineyards and apricot orchards fill the valley floors, where the volcanic soil is rich.', along('main', 0.43, -110), { hint: 'Rows of trees on the river’s south bank, west of the bridge.', lift: 4, r: 70, keep: 0 }),
    L('rose', 'Rose Valley', 'In the low sun of morning and evening the rock of Rose Valley glows pink.', along('rose', 0.45, 0), { hint: 'Pink ridges up the north-eastern valley.', lift: 30, r: 90, keep: 0 }),
  ];
  for (const m of list) {
    m.y = T.groundAt(m.x, m.z);
    m.subject = { x: m.x, y: m.y + m.lift, z: m.z };
  }
  return list;
}

/** The three shots that are moments rather than places. */
export const SPECIALS = [
  { id: 'sunrise', name: 'First Light', fact: 'Balloons fly at dawn, when the air is cool and calm. By mid-morning the warming ground makes it bumpy.', hint: 'Photograph the sun while it is still low.' },
  { id: 'erciyes', name: 'Mount Erciyes', fact: 'Nearly 4,000 metres high, Erciyes is one of the old volcanoes whose ash became the soft tuff of Cappadocia.', hint: 'Photograph the snowy volcano from above 300 metres.' },
  { id: 'sky', name: 'A Sky of Balloons', fact: 'On a calm morning well over a hundred balloons can take off over the valleys of Göreme.', hint: 'Fit a dozen balloons into one photo.' },
];

/** The potters' town on the river's north bank. */
function townHouses(T) {
  const houses = [];
  for (let k = 0; k < 46; k++) {
    const t = 0.565 + 0.045 * hash2(k, 1, 77);
    const off = 45 + 110 * hash2(k, 2, 77);
    const p = along('main', t, off);
    const y = T.groundAt(p.x, p.z);
    houses.push({ x: p.x, z: p.z, y, w: 7 + 6 * hash2(k, 3, 77), d: 7 + 5 * hash2(k, 4, 77), h: 5 + 6 * hash2(k, 5, 77), rot: hash2(k, 6, 77) * Math.PI });
  }
  return houses;
}

function plantTrees(T) {
  const trees = [];
  // Poplars along the river banks.
  for (let k = 0; k < 220; k++) {
    const t = hash2(k, 1, 31);
    const side = hash2(k, 2, 31) < 0.5 ? -1 : 1;
    const p = along('main', t, side * (34 + 30 * hash2(k, 3, 31)));
    if (Math.abs(p.x) > EXTENT - 50 || Math.abs(p.z) > EXTENT - 50) continue;
    trees.push({ kind: 'poplar', x: p.x, z: p.z, y: T.groundAt(p.x, p.z), h: 12 + 8 * hash2(k, 4, 31) });
  }
  // Apricot orchards in rows, on the main valley floor.
  const orchards = [
    { t: 0.43, off: -110, n: 9, m: 6 },
    { t: 0.31, off: 95, n: 7, m: 5 },
    { t: 0.64, off: -105, n: 8, m: 5 },
    { t: 0.12, off: 100, n: 6, m: 5 },
  ];
  for (const o of orchards) {
    const c = along('main', o.t, o.off);
    for (let a = 0; a < o.n; a++)
      for (let b = 0; b < o.m; b++) {
        const x = c.x + (a - o.n / 2) * 12 + 2 * (hash2(a, b, 5) - 0.5);
        const z = c.z + (b - o.m / 2) * 12 + 2 * (hash2(b, a, 6) - 0.5);
        trees.push({ kind: 'apricot', x, z, y: T.groundAt(x, z), h: 5 + 1.5 * hash2(a, b, 7) });
      }
  }
  return trees;
}

/** Fairy chimneys, thickest along the valley walls. */
function raiseChimneys(T) {
  const out = [];
  const keepOut = [...T.landmarks.filter((m) => m.keep).map((m) => ({ x: m.x, z: m.z, r: m.keep })), ...LAUNCHES.map((p) => ({ ...p, r: 110 }))];
  const sp = 24;
  for (let gz = -EXTENT + 40; gz < EXTENT - 40; gz += sp) {
    for (let gx = -EXTENT + 40; gx < EXTENT - 40; gx += sp) {
      const ii = Math.round(gx / sp);
      const jj = Math.round(gz / sp);
      const x = gx + (hash2(ii, jj, 41) - 0.5) * sp * 0.9;
      const z = gz + (hash2(ii, jj, 42) - 0.5) * sp * 0.9;
      // Where the walls are: close to a valley floor's edge, on its slope.
      let near = 0;
      for (const v of VALLEYS) {
        const { d } = polyDist(v.pts, x, z, v.lens, v.total);
        const u = d - v.w;
        if (u > -25 && u < 110) near = Math.max(near, 1 - Math.abs(u - 30) / 80);
      }
      const field = fbm(x / 260, z / 260, 51, 3);
      const p = near * 0.55 + (field - 0.5) * 1.3;
      if (p < 0.34 || hash2(ii, jj, 43) > p) continue;
      const main = valleyInfo('main', x, z);
      if (main.d < 70) continue;
      if (keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
      if (T.town.some((h) => Math.hypot(x - h.x, z - h.z) < 30)) continue;
      const y = T.groundAt(x, z) - 1.5;
      const r = 3.6 + 3.8 * hash2(ii, jj, 44);
      const h = 13 + 24 * hash2(ii, jj, 45) * (0.6 + 0.6 * near);
      out.push({ x, z, y, r, h, cap: hash2(ii, jj, 46) < 0.78, caps: 1, lean: (hash2(ii, jj, 47) - 0.5) * 0.12 });
    }
  }
  return out;
}

function indexChimneys(list) {
  const idx = new Map();
  list.forEach((c, n) => {
    const key = `${Math.floor(c.x / 40)},${Math.floor(c.z / 40)}`;
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key).push(n);
  });
  return idx;
}

/** The chimney the point (x, y, z) is inside (radius padded by `pad`), or null. */
function chimneyAt(T, x, y, z, pad) {
  const ci = Math.floor(x / 40);
  const cj = Math.floor(z / 40);
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++) {
      const list = T.chimneyIndex.get(`${ci + a},${cj + b}`);
      if (!list) continue;
      for (const n of list) {
        const c = T.chimneys[n];
        if (y > c.y + c.h + 2) continue;
        // The chimney narrows to about half its base radius at the top.
        const k = Math.max(0, Math.min(1, (y - c.y) / c.h));
        const r = c.r * (1 - 0.45 * k) + pad;
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < r * r) return c;
      }
    }
  return null;
}

/** What lies under (x, z): field, orchard, river, town, rock or edge. */
function surfaceAt(T, x, z) {
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return 'edge';
  const main = valleyInfo('main', x, z);
  if (main.d < 20) return 'river';
  if (T.town.some((h) => Math.hypot(x - h.x, z - h.z) < 14)) return 'town';
  if (T.trees.some((t) => t.kind === 'apricot' && Math.hypot(x - t.x, z - t.z) < 7)) return 'orchard';
  if (T.chimneyAt(x, T.groundAt(x, z) + 1, z, 2)) return 'rock';
  if (T.slopeAt(x, z) > 0.22) return 'rock';
  return 'field';
}

/** Flat open spots where a cross can be laid out. */
function targetSites(T) {
  const sites = [];
  for (let z = -HALF + 160; z <= HALF - 160; z += 40) {
    for (let x = -HALF + 160; x <= HALF - 160; x += 40) {
      if (T.slopeAt(x, z) > 0.06) continue;
      if (T.slopeAt(x + 15, z) > 0.08 || T.slopeAt(x - 15, z) > 0.08 || T.slopeAt(x, z + 15) > 0.08 || T.slopeAt(x, z - 15) > 0.08) continue;
      if (valleyInfo('main', x, z).d < 45) continue;
      if (T.chimneyAt(x, T.groundAt(x, z) + 1, z, 22)) continue;
      if (T.trees.some((t) => Math.hypot(x - t.x, z - t.z) < 22)) continue;
      if (T.town.some((h) => Math.hypot(x - h.x, z - h.z) < 50)) continue;
      if (T.landmarks.some((m) => Math.hypot(x - m.x, z - m.z) < 70)) continue;
      sites.push({ x, z, y: T.groundAt(x, z) });
    }
  }
  return sites;
}

/**
 * The angle (radians) above level at which the terrain hides the sky from (x, y, z) towards
 * `azimuth` (radians clockwise from north), with the far mountains as a floor.
 */
function horizonAngle(T, x, y, z, azimuth) {
  const dx = Math.sin(azimuth);
  const dz = -Math.cos(azimuth);
  let best = (mountainProfile((azimuth * 180) / Math.PI) * Math.PI) / 180;
  for (let d = 30; d < 2600; d += d < 400 ? 30 : 80) {
    const px = x + dx * d;
    const pz = z + dz * d;
    if (Math.abs(px) > EXTENT || Math.abs(pz) > EXTENT) break;
    const a = Math.atan2(T.groundAt(px, pz) - y, d);
    if (a > best) best = a;
  }
  return best;
}

/** Bearing (degrees clockwise from north) of Mount Erciyes and of Hasan, the two far volcanoes. */
export const ERCIYES_AZ = 103;
export const HASAN_AZ = 248;

/** Elevation in degrees of the far mountains' skyline at bearing `az` (degrees). */
export function mountainProfile(az) {
  const a = ((az % 360) + 360) % 360;
  const dA = (b) => Math.abs(((a - b + 540) % 360) - 180);
  const e = dA(ERCIYES_AZ);
  const h = dA(HASAN_AZ);
  let el = 0.25 + 0.75 * fbm(a / 7, 3.5, 61, 4) ** 2;
  el += Math.max(0, 2.9 - e * 0.46) + 0.75 * Math.exp(-((e / 11) ** 2));
  el += Math.max(0, 1.5 - h * 0.34) + 0.5 * Math.exp(-((h / 9) ** 2));
  return el;
}

/** Strata colour of exposed rock at height h (0..1 components), for the renderer and the map. */
export const STRATA = [
  [0.95, 0.87, 0.76], // cream tuff
  [0.93, 0.74, 0.58], // apricot
  [0.96, 0.9, 0.84], // white tuff
  [0.86, 0.6, 0.6], // rose
  [0.9, 0.7, 0.5], // ochre
  [0.94, 0.82, 0.7],
];
