import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, step, advance, K, DT, markerPoints, landingQuality, dropMarker, dropTarget, takePhoto, scoreOf, restore, windAt, stepBalloon } from '../js/engine.js';
import { planMorning, layerWind, LAYER_Y } from '../js/winds.js';
import { getTerrain, HALF } from '../js/terrain.js';

test('the same seed plans the same morning', () => {
  const a = planMorning('daily-2026-10-24');
  const b = planMorning('daily-2026-10-24');
  assert.deepEqual(a, b);
  assert.notDeepEqual(planMorning('x'), a);
});

test('every plan has five veering layers, a launch field and three crosses in the valley', () => {
  for (let s = 0; s < 40; s++) {
    const p = planMorning(s);
    assert.equal(p.layers.length, 5);
    assert.deepEqual(p.layers.map((l) => l.y), LAYER_Y);
    // Veers clockwise: each layer turns 55–95° from the one below.
    for (let i = 1; i < 5; i++) {
      const d = (((p.layers[i].dir - p.layers[i - 1].dir) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      assert.ok(d > 0.9 && d < 1.7, `layer ${i} veers ${d}`);
    }
    assert.equal(p.crosses.length, 3);
    for (const c of p.crosses) {
      assert.ok(Math.abs(c.x) < HALF && Math.abs(c.z) < HALF);
      assert.ok(Math.hypot(c.x - p.launch.x, c.z - p.launch.z) >= 250, 'crosses are away from the launch field');
    }
  }
});

test('layer wind blends between layers and holds beyond the ends', () => {
  const layers = planMorning(3).layers;
  const lo = layerWind(layers, 0);
  assert.equal(lo.x, layers[0].vx);
  const hi = layerWind(layers, 999);
  assert.equal(hi.z, layers[4].vz);
  const at = layerWind(layers, layers[2].y);
  assert.ok(Math.abs(at.x - layers[2].vx) < 1e-9);
});

test('the wind is calmer near the ground', () => {
  const f = createFlight({ seed: 5 });
  const T = getTerrain();
  const { x, z } = f.launch;
  const g = T.groundAt(x, z);
  const low = windAt(f, x, g + 2, z);
  const up = windAt(f, x, g + 60, z);
  assert.ok(Math.hypot(low.x, low.z) < Math.hypot(up.x, up.z));
});

test('burning lifts off within a few seconds and the balloon climbs', () => {
  const f = createFlight({ seed: 9 });
  assert.equal(f.phase, 'ready');
  advance(f, 6, { burn: true });
  assert.equal(f.phase, 'flying');
  const y = f.b.y;
  advance(f, 6, { burn: true });
  assert.ok(f.b.y > y + 5);
  assert.ok(f.b.fuel < 100);
});

test('the burner answers late and keeps working after you let go (the lag)', () => {
  const f = createFlight({ seed: 9 });
  advance(f, 12, { burn: true });
  advance(f, 25, {});
  const vy0 = f.b.vy;
  advance(f, 1, { burn: true });
  // One second of burner barely changes the climb yet...
  assert.ok(f.b.vy - vy0 < 1.2);
  const vy1 = f.b.vy;
  advance(f, 2, {});
  // ...and it keeps rising after release.
  assert.ok(f.b.vy > vy1);
});

test('without the burner the envelope cools and the balloon comes down', () => {
  const f = createFlight({ seed: 9 });
  advance(f, 15, { burn: true });
  advance(f, 90, {});
  assert.ok(f.b.vy < 0 || f.phase === 'landed');
});

test('venting sinks faster than cooling alone', () => {
  const a = createFlight({ seed: 9 });
  const b = createFlight({ seed: 9 });
  advance(a, 15, { burn: true });
  advance(b, 15, { burn: true });
  advance(a, 20, {});
  advance(b, 20, { vent: true });
  assert.ok(b.b.y < a.b.y - 20);
});

test('fuel runs out and the burner stops working', () => {
  const f = createFlight({ seed: 9 });
  f.b.fuel = 0.5;
  advance(f, 4, { burn: true });
  assert.equal(f.b.fuel, 0);
  assert.equal(f.b.burning, false);
});

test('marker points: 1000 within 3 m, then 12 a metre, 50 for anything within 150 m', () => {
  assert.equal(markerPoints(0), 1000);
  assert.equal(markerPoints(3), 1000);
  assert.equal(markerPoints(13), 880);
  assert.equal(markerPoints(120), 50);
  assert.equal(markerPoints(200), 0);
  for (let d = 0; d < 100; d += 0.5) assert.ok(markerPoints(d) >= markerPoints(d + 0.5));
});

test('landing quality bands by impact', () => {
  assert.equal(landingQuality(0.5), 'soft');
  assert.equal(landingQuality(1.2), 'firm');
  assert.equal(landingQuality(2), 'bumpy');
  assert.equal(landingQuality(3), 'hard');
});

test('a marker can be dropped only near an undropped cross, and lands with a score', () => {
  const f = createFlight({ seed: 21 });
  advance(f, 5, { burn: true });
  assert.equal(dropTarget(f), null);
  assert.equal(dropMarker(f), null);
  const c = f.crosses[1];
  // Put the basket 40 m over the cross (a setup), then fly on with real steps.
  Object.assign(f.b, { x: c.x, z: c.z, y: c.y + 40, vx: 0, vz: 0, vy: 0, heat: 0, pend: 0, onGround: false });
  assert.equal(dropTarget(f), c);
  assert.ok(dropMarker(f));
  assert.equal(dropMarker(f), null, 'one marker per cross');
  advance(f, 6, { burn: true });
  assert.ok(c.result, 'the marker landed');
  assert.ok(c.result.d < 25, `landed ${c.result.d} m away`);
  assert.equal(c.result.points, markerPoints(c.result.d));
  assert.equal(scoreOf(f).crosses, c.result.points);
});

test('photos keep only the best framing of each subject in a flight', () => {
  const f = createFlight({ seed: 21 });
  advance(f, 6, { burn: true });
  const a = takePhoto(f, 'castle', 0.2);
  assert.ok(a.first);
  const b = takePhoto(f, 'castle', 0.1);
  assert.equal(b.gained, 0);
  const c = takePhoto(f, 'castle', 0.9);
  assert.ok(c.gained > 0);
  assert.equal(f.photos.length, 1);
  assert.equal(scoreOf(f).photos, f.photos[0].points);
});

test('a gentle touchdown with the burner off lands the flight; burning takes off again', () => {
  const f = createFlight({ seed: 33 });
  advance(f, 8, { burn: true });
  // Come down on the cooling alone, burning a little when sinking fast.
  let guard = 0;
  while (!f.b.onGround && guard++ < 60 * 200) step(f, { burn: f.b.vy < -1.1 && f.b.y - getTerrain().groundAt(f.b.x, f.b.z) < 30 });
  assert.ok(f.b.onGround);
  advance(f, 0.5, {});
  assert.equal(f.phase, 'flying', 'not landed until the basket settles');
  advance(f, 3, { burn: true });
  advance(f, K.settle + 0.5, {});
  if (f.b.onGround) assert.equal(f.phase, 'landed');
});

test('landing scores by quality and surface, and propane left counts', () => {
  const f = createFlight({ seed: 33 });
  advance(f, 6, { burn: true });
  let guard = 0;
  while (f.phase !== 'landed' && guard++ < 60 * 400) {
    const clear = f.b.y - getTerrain().groundAt(f.b.x, f.b.z);
    step(f, { burn: clear < 30 && f.b.vy < -0.9 && !f.b.onGround });
  }
  assert.equal(f.phase, 'landed');
  const s = scoreOf(f);
  assert.equal(s.landing, f.landing.points);
  // No markers were dropped, so leftover propane does not count.
  assert.equal(s.propane, 0);
});

test('leftover propane counts once every marker is down', () => {
  const f = createFlight({ seed: 33 });
  advance(f, 6, { burn: true });
  for (const c of f.crosses) c.dropped = true;
  let guard = 0;
  while (f.phase !== 'landed' && guard++ < 60 * 400) {
    const clear = f.b.y - getTerrain().groundAt(f.b.x, f.b.z);
    step(f, { burn: clear < 30 && f.b.vy < -0.9 && !f.b.onGround });
  }
  const s = scoreOf(f);
  if (f.landing.surface !== 'edge') assert.equal(s.propane, Math.round(f.landing.fuel * K.propanePoint));
});

test('climbing above the rim brings first light early, with a bonus', () => {
  const f = createFlight({ seed: 4242 });
  advance(f, 40, { burn: true });
  assert.ok(f.sun.lit);
  assert.ok(f.firstLight && f.firstLight.points === K.firstLight);
  // Staying on the valley floor, the sun takes far longer.
  const g = createFlight({ seed: 4242 });
  advance(g, 40, {});
  assert.equal(g.sun.lit, false);
});

test('leaving the valley ends the flight', () => {
  const f = createFlight({ seed: 5 });
  advance(f, 5, { burn: true });
  Object.assign(f.b, { x: HALF + 5 });
  step(f, {});
  assert.equal(f.phase, 'landed');
  assert.equal(f.landing.surface, 'edge');
  assert.equal(f.landing.points, 0);
});

test('a saved flight restores and continues identically', () => {
  const a = createFlight({ seed: 77 });
  advance(a, 20, { burn: true });
  const copy = restore(JSON.parse(JSON.stringify(a)));
  advance(a, 15, { vent: true });
  advance(copy, 15, { vent: true });
  const plain = (f) => JSON.parse(JSON.stringify({ ...f, events: [] }));
  assert.deepEqual(plain(copy), plain(a));
  assert.equal(restore({ v: 0 }), null);
});

test('the shared balloon step reports a touchdown speed once', () => {
  const b = { x: 0, y: 10, z: 0, vx: 0, vy: -2, vz: 0, heat: -0.3, pend: 0, fuel: 100, onGround: false };
  let hits = 0;
  for (let i = 0; i < 600; i++) if (stepBalloon(b, {}, { x: 0, z: 0 }, 0, DT) !== null) hits++;
  assert.equal(hits, 1);
  assert.equal(b.y, 0);
});

test('a basket resting against a chimney on the ground settles, without a stream of scrapes', () => {
  const T = getTerrain();
  const f = createFlight({ seed: 33 });
  advance(f, 5, { burn: true });
  // Stand the basket on the ground right against a chimney.
  const c = T.chimneys.find((q) => Math.abs(q.x) < 1200 && Math.abs(q.z) < 1200 && T.slopeAt(q.x, q.z) < 0.2);
  const x = c.x + c.r + 0.8;
  Object.assign(f.b, { x, z: c.z, y: T.groundAt(x, c.z) + 0.3, vx: -0.4, vz: 0, vy: -0.3, heat: -0.05, pend: 0, onGround: false });
  const before = f.bumps;
  advance(f, 8, {});
  assert.equal(f.phase, 'landed');
  assert.ok(f.bumps - before <= 1, `knocks while resting: ${f.bumps - before}`);
});
