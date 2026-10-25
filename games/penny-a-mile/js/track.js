// Track geometry, shared by the engine and the renderer.
//
// A tile has four edges: 0 N (y-1), 1 E (x+1), 2 S (y+1), 3 W (x-1). A piece of track joins two
// edges: two straights (NS, EW) and four curves (NE, ES, SW, WN). A tile's track is a bitmask of
// pieces, so junctions and diamond crossings are just several pieces on one tile.
//
// A path is a list of steps { x, y, i, o }: the tile, the edge the train came in by and the edge
// it leaves by. The first and last steps are station tiles: the train starts and stops at the
// centre, so those steps are half a tile long.

export const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
export const opp = (e) => (e + 2) & 3;
export const PIECES = [
  [0, 2],
  [1, 3],
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
];
export const STRAIGHT_NS = 1;
export const STRAIGHT_EW = 2;

export function pieceIndex(a, b) {
  for (let i = 0; i < 6; i++) {
    const p = PIECES[i];
    if ((p[0] === a && p[1] === b) || (p[0] === b && p[1] === a)) return i;
  }
  return -1;
}
export const pieceBit = (a, b) => 1 << pieceIndex(a, b);
export const isStraight = (a, b) => opp(a) === b;
export const pieceLen = (a, b) => (isStraight(a, b) ? 1 : Math.PI / 4);

/** Pieces in a mask that touch edge e, as the other edge of each. */
export function exitsFrom(mask, e) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    if (!(mask & (1 << i))) continue;
    const [a, b] = PIECES[i];
    if (a === e) out.push(b);
    else if (b === e) out.push(a);
  }
  return out;
}

export const countPieces = (mask) => {
  let n = 0;
  for (let i = 0; i < 6; i++) if (mask & (1 << i)) n++;
  return n;
};

const MID = [
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5],
];
export const edgeMid = (e) => MID[e];

function corner(a, b) {
  const has = (e) => a === e || b === e;
  if (has(0) && has(1)) return [1, 0];
  if (has(1) && has(2)) return [1, 1];
  if (has(2) && has(3)) return [0, 1];
  return [0, 0];
}

/** A point on the piece from edge a to edge b, a fraction f of the way (tile-local 0..1 coords). */
export function pieceAt(a, b, f) {
  const p = MID[a];
  const q = MID[b];
  if (isStraight(a, b)) return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  const c = corner(a, b);
  const a0 = Math.atan2(p[1] - c[1], p[0] - c[0]);
  let a1 = Math.atan2(q[1] - c[1], q[0] - c[0]);
  let d = a1 - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const t = a0 + d * f;
  return [c[0] + 0.5 * Math.cos(t), c[1] + 0.5 * Math.sin(t)];
}

export function stepLen(path, k) {
  if (k === 0 || k === path.length - 1) return 0.5;
  return pieceLen(path[k].i, path[k].o);
}

export function pathLength(path) {
  let s = 0;
  for (let k = 0; k < path.length; k++) s += stepLen(path, k);
  return s;
}

/** Where a train is, d tiles along a path: world tile coords (x + u, y + v) and the step index. */
export function pointOnPath(path, d) {
  if (!path || !path.length) return null;
  if (d < 0) d = 0;
  for (let k = 0; k < path.length; k++) {
    const L = stepLen(path, k);
    if (d <= L || k === path.length - 1) {
      const f = Math.min(1, d / L);
      const s = path[k];
      let u;
      if (k === 0) {
        const m = MID[s.o];
        u = [0.5 + (m[0] - 0.5) * f, 0.5 + (m[1] - 0.5) * f];
      } else if (k === path.length - 1) {
        const m = MID[s.i];
        u = [m[0] + (0.5 - m[0]) * f, m[1] + (0.5 - m[1]) * f];
      } else u = pieceAt(s.i, s.o, f);
      return { x: s.x + u[0], y: s.y + u[1], k };
    }
    d -= L;
  }
  return null;
}

/** A point and its heading (unit vector in tile space) d tiles along a path. */
export function poseOnPath(path, d) {
  const len = pathLength(path);
  const a = pointOnPath(path, Math.min(d, len - 0.02));
  const b = pointOnPath(path, Math.min(d, len - 0.02) + 0.02);
  const p = pointOnPath(path, d);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const m = Math.hypot(dx, dy) || 1;
  return { x: p.x, y: p.y, k: p.k, hx: dx / m, hy: dy / m };
}

/** The tiles a path visits, as "x,y" keys. */
export const pathTiles = (path) => path.map((s) => `${s.x},${s.y}`);
