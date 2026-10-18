import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK } from '../js/bank.js';
import { buildCourse, LAYOUT, coursePar } from '../js/course.js';
import { prepareWorld, simulate } from '../js/engine.js';

test('every hole in the bank is aced by its stored ace line', () => {
  for (const h of BANK) {
    const w = prepareWorld(h);
    const r = simulate(w, h.tee.x, h.tee.y, h.ace.vx, h.ace.vy);
    assert.equal(r.end, 'sink', `hole ${h.id} ace line ends in ${r.end}`);
  }
});

test('bank holes are well formed', () => {
  const ids = new Set();
  for (const h of BANK) {
    assert.ok(!ids.has(h.id), `duplicate id ${h.id}`);
    ids.add(h.id);
    assert.ok(h.par >= 2 && h.par <= 5, `${h.id} par ${h.par}`);
    assert.ok(h.name && h.name.length < 40, `${h.id} name`);
    assert.equal(h.bodies[h.cup.b].k, 'planet');
    assert.equal(h.bodies[h.tee.b].k, 'planet');
    for (const b of h.bodies) if (b.k === 'gate') assert.equal(h.bodies[b.pair].pair, h.bodies.indexOf(b));
  }
  for (const tier of [1, 2, 3, 4]) assert.ok(BANK.filter((h) => h.tier === tier).length >= 4, `tier ${tier} has holes`);
});

test('a course is nine distinct plates rising in tier, the same for the same seed', () => {
  const a = buildCourse('2026-10-17');
  const b = buildCourse('2026-10-17');
  const c = buildCourse('2026-10-18');
  assert.equal(a.length, 9);
  assert.deepEqual(a.map((h) => h.tier), LAYOUT);
  assert.equal(new Set(a.map((h) => h.id)).size, 9);
  assert.deepEqual(a.map((h) => h.id), b.map((h) => h.id));
  assert.notDeepEqual(a.map((h) => h.id), c.map((h) => h.id));
  const par = coursePar(a);
  assert.ok(par >= 22 && par <= 36, `course par ${par}`);
});
