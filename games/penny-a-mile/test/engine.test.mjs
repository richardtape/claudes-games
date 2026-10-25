import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, planRoute, build, step, findPath, bulldoze, companyValue, buyTrain, stationById, resume, coverage, modernise, MODEL } from '../js/engine.js';
import { generate } from '../js/map.js';
import { W, H, WATER, ROCK, TOWN_COUNT, INDUSTRY_MIX, BOARD, YEAR } from '../js/data.js';
import { DIRS, opp } from '../js/track.js';

const idx = (x, y) => y * W + x;

/** A free tile next to an industry, on the side nearest (tx, ty). */
export function spotNear(s, o, tx, ty) {
  let best = null;
  for (let dy = -2; dy < o.h + 2; dy++)
    for (let dx = -2; dx < o.w + 2; dx++) {
      const x = o.x + dx;
      const y = o.y + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = idx(x, y);
      if (s.ind[i] >= 0 || s.house[i] || s.road[i] || s.ground[i] === WATER || s.ground[i] === ROCK) continue;
      const d = Math.abs(x - tx) + Math.abs(y - ty);
      if (!best || d < best.d) best = { x, y, d };
    }
  return best;
}

function firstRoute(s) {
  // The colliery and power station whose distance is nearest 14 tiles (pay is by distance).
  let P = null;
  let Q = null;
  const off = (p, q) => Math.abs(Math.abs(p.x - q.x) + Math.abs(p.y - q.y) - 14);
  for (const p of s.industries.filter((o) => o.kind === 'colliery'))
    for (const q of s.industries.filter((o) => o.kind === 'power')) if (!P || off(p, q) < off(P, Q)) [P, Q] = [p, q];
  const a = spotNear(s, P, Q.x, Q.y);
  const b = spotNear(s, Q, P.x, P.y);
  return { a, b, plan: planRoute(s, a.x, a.y, b.x, b.y) };
}

function contiguous(path) {
  for (let k = 0; k + 1 < path.length; k++) {
    const p = path[k];
    const q = path[k + 1];
    if (q.x !== p.x + DIRS[p.o][0] || q.y !== p.y + DIRS[p.o][1]) return `step ${k} leaves by ${p.o} but the next tile is ${q.x},${q.y}`;
    if (q.i !== opp(p.o)) return `step ${k + 1} enters by ${q.i}, expected ${opp(p.o)}`;
    if (q.i === q.o) return `step ${k + 1} turns back`;
  }
  return null;
}

test('shires are deterministic and complete', () => {
  for (const seed of ['a', 'b', 'penny', 12345, '2026-10-24']) {
    const m1 = generate(seed);
    const m2 = generate(seed);
    assert.deepEqual(m1, m2);
    assert.equal(m1.towns.length, TOWN_COUNT);
    assert.equal(m1.industries.length, INDUSTRY_MIX.length);
    for (const o of m1.industries)
      for (let dy = 0; dy < o.h; dy++)
        for (let dx = 0; dx < o.w; dx++) {
          const i = idx(o.x + dx, o.y + dy);
          assert.notEqual(m1.ground[i], WATER, `${o.name} sits on water`);
          assert.equal(m1.ind[i], o.id);
          assert.equal(m1.house[i], 0);
        }
    assert.ok(new Set(m1.towns.map((t) => t.name)).size === TOWN_COUNT, 'town names are unique');
    assert.ok(new Set(m1.industries.map((o) => o.name)).size === m1.industries.length, 'industry names are unique');
  }
});

test('a planned route is contiguous, costs money and builds a working service', () => {
  const s = newGame('route-test');
  const { plan } = firstRoute(s);
  assert.ok(plan.ok, plan.reason);
  assert.equal(contiguous(plan.path), null);
  assert.ok(plan.cost.track > 0 && plan.cost.stations > 0 && plan.cost.train > 0);
  const cash = s.cash;
  const r = build(s, plan);
  assert.ok(r.ok);
  assert.equal(s.stations.length, 2);
  assert.equal(s.services.length, 1);
  assert.equal(s.trains.length, 1);
  assert.ok(Math.abs(cash - plan.cost.total - s.cash) < 1);
  // The trains' own pathfinder sees the same line.
  const p = findPath(s, r.a, r.b);
  assert.ok(p);
  assert.equal(contiguous(p), null);
  // Planning it again is free: the track and the service exist.
  const again = planRoute(s, plan.ax, plan.ay, plan.bx, plan.by);
  assert.ok(again.ok);
  assert.equal(again.cost.total, 0);
});

test('a second route reuses track it shares, for free', () => {
  const s = newGame('reuse-test');
  const { a, b, plan } = firstRoute(s);
  build(s, plan);
  // A spur from one tile beside the far end back to the first station follows the line.
  const mid = plan.path[Math.floor(plan.path.length / 2)];
  let spur = null;
  for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [3, 0], [0, 3]]) {
    const p = planRoute(s, a.x, a.y, mid.x + dx, mid.y + dy);
    if (p.ok) {
      spur = p;
      break;
    }
  }
  assert.ok(spur, 'some spur plans');
  const shared = spur.path.filter((st) => s.track[idx(st.x, st.y)]).length;
  assert.ok(shared >= 2, `the spur shares ${shared} tiles`);
  assert.ok(spur.pieces.length < spur.path.length, 'the shared pieces are not billed');
});

test('trains carry cargo and earn money over two years', () => {
  const s = newGame('earn-test');
  const { plan } = firstRoute(s);
  const r = build(s, plan);
  buyTrain(s, r.service.id);
  buyTrain(s, r.service.id);
  const v0 = companyValue(s);
  step(s, 2 * YEAR);
  assert.ok(s.carried.coal > 100, `carried ${s.carried.coal} t of coal`);
  assert.ok(s.services[0].last.income > 0);
  assert.ok(companyValue(s) > v0, 'the company is worth more');
});

test('bulldozing a line strands its trains until it is relaid', () => {
  const s = newGame('lost-test');
  const { plan } = firstRoute(s);
  const r = build(s, plan);
  const t = r.train;
  // Wait until the train is loading at a station, then cut the line in the middle.
  while (t.state !== 'load' || t.trips < 1) step(s, 0.25);
  // Cut next to the far end from where it waits (the tiles under its tail are protected).
  const mid = plan.path[1];
  const cut = bulldoze(s, mid.x, mid.y);
  assert.ok(cut.ok, cut.reason);
  step(s, 10);
  assert.equal(t.lost, true);
  assert.equal(t.state, 'load');
  const re = planRoute(s, plan.ax, plan.ay, plan.bx, plan.by);
  assert.ok(re.ok && re.cost.track > 0 && re.cost.train === 0);
  build(s, re);
  step(s, 5);
  assert.equal(t.lost, false);
});

test('you cannot bulldoze track a running train is on', () => {
  const s = newGame('busy-test');
  const { plan } = firstRoute(s);
  const r = build(s, plan);
  while (r.train.state !== 'run') step(s, 0.25);
  const mid = plan.path[Math.floor(plan.path.length / 2)];
  const cut = bulldoze(s, mid.x, mid.y);
  assert.equal(cut.ok, false);
});

test('the Board passes or dismisses on company value', () => {
  const pass = newGame('board-test');
  pass.cash = 10_000_000;
  step(pass, BOARD[0].year * 0 + 5 * YEAR);
  assert.equal(pass.hold, 'board');
  assert.equal(pass.boards[0].pass, true);
  assert.equal(pass.over, null);
  resume(pass);
  step(pass, 10);
  assert.ok(pass.day > 5 * YEAR);

  const fail = newGame('board-test');
  fail.cash = 1000;
  step(fail, 5 * YEAR);
  assert.equal(fail.boards[0].pass, false);
  assert.equal(fail.over.reason, 'board');
});

test('a save resumes exactly', () => {
  const s = newGame('save-test');
  const { plan } = firstRoute(s);
  const r = build(s, plan);
  buyTrain(s, r.service.id);
  step(s, 200);
  const copy = JSON.parse(JSON.stringify(s));
  step(s, 400);
  step(copy, 400);
  assert.deepEqual(JSON.parse(JSON.stringify(copy)), JSON.parse(JSON.stringify(s)));
});

test('event ids rise by exactly one', () => {
  const s = newGame('events-test');
  const { plan } = firstRoute(s);
  const r = build(s, plan);
  buyTrain(s, r.service.id);
  let last = s.seq;
  const seen = [];
  for (let d = 0; d < 3 * YEAR; d += 7) {
    step(s, 7);
    if (s.hold) resume(s);
    for (const e of s.events) if (e.id > last) seen.push(e.id);
    last = s.seq;
  }
  for (let k = 1; k < seen.length; k++) assert.equal(seen[k], seen[k - 1] + 1);
  assert.ok(seen.length > 20);
});

test('served towns grow', () => {
  const s = newGame('grow-test');
  // Link the two closest towns at their centres' edges.
  const [t1, t2] = s.towns.slice().sort((a, b) => a.x + a.y - (b.x + b.y));
  const spot = (t) => {
    for (let r = 1; r < 5; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = t.x + dx;
          const y = t.y + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const i = idx(x, y);
          if (!s.house[i] && !s.road[i] && s.ind[i] < 0 && s.ground[i] !== WATER && s.ground[i] !== ROCK && coverage(s, x, y).houses >= 4) return { x, y };
        }
  };
  const a = spot(t1);
  const b = spot(t2);
  const plan = planRoute(s, a.x, a.y, b.x, b.y);
  assert.ok(plan.ok, plan.reason);
  const r = build(s, plan);
  buyTrain(s, r.service.id);
  const p0 = t1.pop + t2.pop;
  step(s, 3 * YEAR);
  assert.ok(t1.pop + t2.pop > p0, `towns grew from ${p0} to ${t1.pop + t2.pop}`);
});

test('modernising swaps the class and charges less than new', () => {
  const s = newGame('modern-test');
  const { plan } = firstRoute(s);
  const r = build(s, plan);
  s.cash = 1e6;
  s.models.push('mendip');
  const cost = modernise(s, r.service.id);
  assert.ok(cost > 0 && cost < MODEL.mendip.cost);
  assert.equal(r.train.model, 'mendip');
});

test('a station on the line accepts what its reach wants', () => {
  const s = newGame('accept-test');
  const { b, plan } = firstRoute(s);
  build(s, plan);
  const st = stationById(s, s.station[idx(b.x, b.y)]);
  assert.ok(coverage(s, st.x, st.y).accepts.has('coal'));
});
