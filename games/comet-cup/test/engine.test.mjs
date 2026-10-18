import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';

const { COMET_R } = E;

// A tee planet on the left and a cup planet on the right, cup facing left (toward the tee).
function basic(extra = []) {
  const bodies = [
    { k: 'planet', x: 300, y: 500, r: 60 },
    { k: 'planet', x: 1200, y: 500, r: 60 },
    ...extra,
  ];
  const tee = E.surfacePoint(bodies[0], 1, 0);
  return { id: 't', par: 3, bodies, tee: { ...tee, b: 0 }, cup: { b: 1, nx: -1, ny: 0 } };
}

test('a comet released near a planet falls, lands and comes to rest on its surface', () => {
  const w = E.prepareWorld(basic());
  const r = E.simulate(w, 300, 300, 0, 0);
  assert.equal(r.end, 'rest');
  const d = Math.hypot(r.x - 300, r.y - 500);
  assert.ok(Math.abs(d - (60 + COMET_R)) < 1, `rests on the surface (d=${d})`);
});

test('the cup catches a comet that arrives slowly', () => {
  const hole = basic();
  const w = E.prepareWorld(hole);
  // Dropped just above the cup point, it falls straight in.
  const r = E.simulate(w, w.cupX - 30, w.cupY, 0, 0);
  assert.equal(r.end, 'sink');
});

test('a slow roll along the surface drops into the cup thanks to the lip', () => {
  const hole = basic();
  const w = E.prepareWorld(hole);
  // Start on the cup planet a little round from the cup, nudged toward it.
  const a = Math.PI + 0.45;
  const p = E.surfacePoint(w.bodies[1], Math.cos(a), Math.sin(a));
  const tx = -Math.sin(a);
  const ty = Math.cos(a); // tangent direction (counter-clockwise)
  const toCup = (w.cupX - p.x) * tx + (w.cupY - p.y) * ty > 0 ? 1 : -1;
  const r = E.simulate(w, p.x, p.y, tx * toCup * 120, ty * toCup * 120);
  assert.equal(r.end, 'sink');
});

test('a fast comet skims over the cup and lips out', () => {
  const hole = basic();
  const w = E.prepareWorld(hole);
  const events = [];
  const f = E.newFlight(w, w.cupX, w.cupY - 120, 0, 420);
  let end = null;
  while (!end) end = E.stepFlight(w, f, events);
  assert.ok(events.some((e) => e.t === 'lip'), 'lip event');
  assert.notEqual(end, 'sink');
});

test('flying into a sun is a penalty and the comet goes back where it was shot from', () => {
  const hole = basic([{ k: 'sun', x: 750, y: 500, r: 50 }]);
  const st = E.newHole(hole);
  const tee = { x: st.x, y: st.y };
  E.launch(st, 400, 0);
  const ev = E.finishFlight(st);
  assert.ok(ev.some((e) => e.t === 'burn'));
  assert.equal(st.strokes, 2, 'the shot and a penalty stroke');
  assert.equal(st.penalties, 1);
  assert.deepEqual({ x: st.x, y: st.y }, tee);
  assert.equal(st.phase, 'aim');
});

test('leaving the plate is lost; a dark star swallows', () => {
  const st = E.newHole(basic());
  E.launch(st, -300, -500);
  const ev = E.finishFlight(st);
  assert.ok(ev.some((e) => e.t === 'lost'));
  const st2 = E.newHole(basic([{ k: 'void', x: 750, y: 500, r: 16 }]));
  E.launch(st2, 380, 0);
  assert.ok(E.finishFlight(st2).some((e) => e.t === 'void'));
});

test('an exposure ends a long flight where the comet is', () => {
  const hole = { par: 3, bodies: [{ k: 'planet', x: 100, y: 100, r: 30 }], tee: { x: 800, y: 500 }, cup: { b: 0, nx: 1, ny: 0 } };
  const st = E.newHole(hole);
  E.launch(st, 3, 0);
  const ev = E.finishFlight(st);
  assert.ok(ev.some((e) => e.t === 'halt'));
  assert.equal(st.phase, 'aim');
  assert.ok(st.x !== 800 || st.y !== 500, 'it moved');
});

test('a wormhole carries the comet to its pair at the same speed', () => {
  const hole = basic([
    { k: 'gate', x: 500, y: 300, r: 24, pair: 3 },
    { k: 'gate', x: 900, y: 800, r: 24, pair: 2 },
  ]);
  const w = E.prepareWorld(hole);
  const events = [];
  const f = E.newFlight(w, 420, 300, 300, 0);
  for (let i = 0; i < 60; i++) E.stepFlight(w, f, events);
  const warp = events.find((e) => e.t === 'warp');
  assert.ok(warp, 'warped');
  assert.equal(warp.to, 3);
});

test('flights are deterministic', () => {
  const w = E.prepareWorld(basic([{ k: 'planet', x: 750, y: 380, r: 80 }]));
  const a = E.simulate(w, 369, 500, 330, -140);
  const b = E.simulate(w, 369, 500, 330, -140);
  assert.deepEqual(a, b);
});

test('passing close to a planet rings it once per pass', () => {
  const hole = basic([{ k: 'planet', x: 750, y: 420, r: 50 }]);
  const w = E.prepareWorld(hole);
  const events = [];
  const f = E.newFlight(w, 500, 560, 360, 0);
  for (let i = 0; i < 160; i++) E.stepFlight(w, f, events);
  const passes = events.filter((e) => e.t === 'pass' && e.i === 2);
  assert.equal(passes.length, 1);
  assert.ok(passes[0].close > 0 && passes[0].close <= 1);
});

test('a hole is picked up at par + maxOver', () => {
  const st = E.newHole(basic());
  for (let i = 0; i < 10 && st.phase === 'aim'; i++) {
    E.launch(st, -300, -500); // lost every time: +2 a go
    E.finishFlight(st);
  }
  assert.equal(st.phase, 'picked');
  assert.equal(st.result.strokes, 3 + E.PHYS.maxOver);
});

test('sinking ends the hole with the stroke count', () => {
  const hole = basic();
  const st = E.newHole(hole);
  st.x = st.w.cupX - 40;
  st.y = st.w.cupY;
  E.launch(st, 0, 0);
  const ev = E.finishFlight(st);
  assert.ok(ev.some((e) => e.t === 'holed'));
  assert.equal(st.phase, 'sunk');
  assert.equal(st.result.strokes, 1);
  assert.equal(E.scoreName(1, 3), 'Hole in one');
  assert.equal(E.scoreName(2, 3), 'Birdie');
  assert.equal(E.toPar(-2), '−2');
  assert.equal(E.toPar(0), 'E');
});
