import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentIntersection, pointInPolygon, polygonArea, distToSegment, closestOnSegment } from '../js/geom.js';

test('segmentIntersection finds the crossing point of an X', () => {
  const p = segmentIntersection({ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 });
  assert.ok(p);
  assert.ok(Math.abs(p.x) < 1e-9 && Math.abs(p.y) < 1e-9);
  assert.ok(Math.abs(p.t - 0.5) < 1e-9 && Math.abs(p.u - 0.5) < 1e-9);
});

test('segmentIntersection returns null for parallel or separate segments', () => {
  assert.equal(segmentIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }), null);
  assert.equal(segmentIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: -1 }, { x: 2, y: 1 }), null);
});

test('pointInPolygon handles a square and a concave shape', () => {
  const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  assert.equal(pointInPolygon(5, 5, sq), true);
  assert.equal(pointInPolygon(15, 5, sq), false);
  // A "C" shape: the notch is outside.
  const c = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 7 }, { x: 10, y: 7 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  assert.equal(pointInPolygon(6, 5, c), false);
  assert.equal(pointInPolygon(1.5, 5, c), true);
});

test('polygonArea is the absolute shoelace area', () => {
  const sq = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }];
  assert.equal(polygonArea(sq), 100);
});

test('distToSegment measures to the nearest point, clamped to the ends', () => {
  assert.equal(distToSegment(5, 3, { x: 0, y: 0 }, { x: 10, y: 0 }), 3);
  assert.equal(distToSegment(13, 4, { x: 0, y: 0 }, { x: 10, y: 0 }), 5);
  const c = closestOnSegment(5, 3, { x: 0, y: 0 }, { x: 10, y: 0 });
  assert.deepEqual([c.x, c.y, c.t], [5, 0, 0.5]);
});
