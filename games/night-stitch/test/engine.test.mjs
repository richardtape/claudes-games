import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newNight, step, chooseNotion, integrity, addMoth, addBeetle, addHole, threadLength, clockLabel, DT,
} from '../js/engine.js';
import { HOURS, HOUR_LEN, SPECIES, THREAD_LEN, NOTIONS, HOOP_R, LOSS_AREA, DARN_POINTS } from '../js/data.js';

const quiet = (opts = {}) => newNight({ seed: 'test', director: false, ...opts });

/** Steps the night with the needle chasing each point in turn. */
function drive(s, pts, maxSteps = 20) {
  for (const p of pts) {
    for (let i = 0; i < maxSteps; i++) {
      step(s, { target: p });
      if (Math.hypot(s.needle.x - p.x, s.needle.y - p.y) < 0.5) break;
    }
  }
}

function circle(cx, cy, r, turns = 1.15, n = 90, start = 0) {
  const pts = [];
  const total = Math.round(n * turns);
  for (let i = 0; i <= total; i++) {
    const a = start + (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

const events = (s, type) => s.events.filter((e) => e.type === type);

test('the needle never moves faster than its speed cap', () => {
  const s = quiet();
  const from = { ...s.needle };
  step(s, { target: { x: 400, y: -400 } });
  const moved = Math.hypot(s.needle.x - from.x, s.needle.y - from.y);
  assert.ok(moved > 0 && moved <= s.mods.speed * DT + 1e-9, `moved ${moved}`);
});

test('the needle stays inside the hoop', () => {
  const s = quiet();
  for (let i = 0; i < 200; i++) step(s, { target: { x: 2000, y: 0 } });
  assert.ok(Math.hypot(s.needle.x, s.needle.y) < HOOP_R);
});

test('the thread never grows past its length', () => {
  const s = quiet();
  drive(s, [{ x: -400, y: -300 }, { x: 400, y: -300 }, { x: 400, y: 300 }, { x: -380, y: 280 }]);
  assert.ok(threadLength(s) <= THREAD_LEN + 1e-6, `thread is ${threadLength(s)}`);
  assert.ok(threadLength(s) > THREAD_LEN * 0.95, 'thread should be near full length after a long trip');
});

test('looping a settled moth catches it, scores it and resets the thread', () => {
  const s = quiet();
  const m = addMoth(s, 'clothes', 0, 0, { settled: true });
  drive(s, [{ x: 120, y: 0 }]);
  s.events.length = 0;
  drive(s, circle(0, 0, 120));
  assert.equal(s.moths.includes(m), false, 'moth should be gone');
  assert.equal(s.score, SPECIES.clothes.points + DARN_POINTS, 'its hole is darned too');
  assert.equal(events(s, 'loop').length, 1);
  assert.equal(s.stats.caught.clothes, 1);
  assert.ok(s.history.some((h) => h.type === 'moth' && h.kind === 'clothes'));
  assert.ok(threadLength(s) < 140, 'thread restarts from the needle after a loop (only the overshoot remains)');
});

test('two moths in one loop score their sum times two', () => {
  const s = quiet();
  addMoth(s, 'clothes', -20, 0, { settled: true });
  addMoth(s, 'house', 20, 0, { settled: true });
  drive(s, [{ x: 130, y: 0 }]);
  drive(s, circle(0, 0, 130));
  assert.equal(s.score, (SPECIES.clothes.points + SPECIES.house.points) * 2 + 2 * DARN_POINTS);
  assert.equal(s.stats.biggestLoop, 2);
});

test('a moth outside the loop is left alone', () => {
  const s = quiet();
  const outside = addMoth(s, 'clothes', 300, 0, { settled: true });
  drive(s, [{ x: -100, y: 0 }]);
  drive(s, circle(-200, 0, 100, 1.15, 90, 0));
  assert.ok(s.moths.includes(outside));
});

test('a loop longer than the thread cannot close', () => {
  const s = quiet();
  addMoth(s, 'clothes', 0, 0, { settled: true });
  drive(s, [{ x: 170, y: 0 }]);
  drive(s, circle(0, 0, 170));
  assert.equal(events(s, 'loop').length, 0);
});

test('a tiny wiggle does not count as a loop', () => {
  const s = quiet();
  drive(s, circle(0, 0, 12, 2, 24));
  assert.equal(events(s, 'loop').length, 0);
});

test('coming back close to old thread closes the loop without an exact crossing', () => {
  const s = quiet();
  const m = addMoth(s, 'clothes', 0, 0, { settled: true });
  drive(s, [{ x: 120, y: 0 }]);
  // Stop just short of the start point (gap of ~8 units).
  const pts = circle(0, 0, 120, 1, 90).slice(0, -1);
  pts.push({ x: 119, y: -8 });
  drive(s, pts);
  assert.equal(s.moths.includes(m), false);
});

test('a settled moth eats a growing hole and the fabric weakens', () => {
  const s = quiet();
  addMoth(s, 'clothes', 200, 200, { settled: true });
  const before = integrity(s);
  for (let i = 0; i < 120; i++) step(s, {});
  assert.equal(s.holes.length, 1);
  assert.ok(s.holes[0].r > 4);
  assert.ok(integrity(s) < before);
});

test('looping an open hole darns it and restores the fabric', () => {
  const s = quiet();
  addHole(s, 0, 0, 20);
  const holed = integrity(s);
  drive(s, [{ x: 100, y: 0 }]);
  drive(s, circle(0, 0, 100));
  assert.ok(integrity(s) > holed);
  assert.equal(integrity(s), 1);
  assert.ok(s.history.some((h) => h.type === 'darn'));
});

test('catching a moth while it eats darns its hole', () => {
  const s = quiet();
  addMoth(s, 'clothes', 0, 0, { settled: true });
  for (let i = 0; i < 60; i++) step(s, {});
  assert.ok(integrity(s) < 1);
  drive(s, [{ x: 130, y: 0 }]);
  drive(s, circle(0, 0, 130));
  assert.equal(integrity(s), 1);
});

test('a settled moth takes off when the needle comes close', () => {
  const s = quiet();
  const m = addMoth(s, 'clothes', 0, 0, { settled: true });
  drive(s, [{ x: 200, y: 0 }, { x: 20, y: 0 }]);
  assert.equal(m.mode, 'fly');
  assert.ok(events(s, 'startle').length >= 1);
});

test('a beetle crossing the thread snaps off the older part', () => {
  const s = quiet();
  drive(s, [{ x: -300, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }]);
  const len = threadLength(s);
  addBeetle(s, 0, -40, { heading: Math.PI / 2 }); // crawling down across y = 0
  for (let i = 0; i < 120; i++) step(s, {});
  assert.ok(events(s, 'snap').length >= 1);
  assert.ok(threadLength(s) < len - 200);
});

test('beeswax shrugs off a snap', () => {
  const s = quiet();
  chooseNotion(s, 'beeswax', { force: true });
  drive(s, [{ x: -300, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }]);
  const len = threadLength(s);
  addBeetle(s, 0, -40, { heading: Math.PI / 2 });
  for (let i = 0; i < 60; i++) step(s, {});
  assert.equal(events(s, 'snap').length, 0);
  assert.ok(events(s, 'wax').length >= 1);
  assert.ok(threadLength(s) >= len - 1);
});

test('a boss takes three loops and the tally shows on each', () => {
  const s = quiet();
  const boss = addMoth(s, 'atlas', 0, 0, { frozen: true });
  drive(s, [{ x: 130, y: 0 }]);
  drive(s, circle(0, 0, 130));
  assert.equal(boss.hp, 2);
  assert.ok(s.moths.includes(boss));
  drive(s, circle(0, 0, 130, 1.15, 90, Math.PI * 0.3));
  drive(s, circle(0, 0, 130, 1.15, 90, Math.PI * 0.6));
  assert.equal(s.moths.includes(boss), false);
  assert.equal(s.stats.caught.atlas, 1);
  assert.ok(s.score >= SPECIES.atlas.points);
});

test('the hour ends with a notion pick, then the next hour starts', () => {
  const s = quiet();
  for (let i = 0; i < Math.ceil(HOUR_LEN / DT) + 2; i++) step(s, {});
  assert.equal(s.phase, 'notion');
  assert.equal(s.offers.length, 3);
  assert.equal(new Set(s.offers).size, 3);
  const pick = s.offers[0];
  chooseNotion(s, pick);
  assert.equal(s.phase, 'play');
  assert.equal(s.hour, 1);
  assert.equal(s.notions[pick], 1);
  step(s, {});
  assert.equal(s.hour, 1, 'stepping during play keeps the new hour');
});

test('the spool notion lengthens the thread', () => {
  const s = quiet();
  chooseNotion(s, 'spool', { force: true });
  assert.ok(Math.abs(s.mods.threadLen - THREAD_LEN * 1.2) < 1e-6);
});

test('surviving the last hour brings dawn and the fabric bonus', () => {
  const s = quiet();
  s.hour = HOURS.length - 1;
  for (let i = 0; i < Math.ceil(HOUR_LEN / DT) + 2; i++) step(s, {});
  assert.equal(s.phase, 'dawn');
  assert.equal(s.dawnBonus, 100 * 50);
  assert.ok(s.score >= 5000);
});

test('the night ends when the fabric gives way', () => {
  const s = quiet();
  addHole(s, 0, 0, Math.sqrt(LOSS_AREA / Math.PI) + 1);
  step(s, {});
  assert.equal(s.phase, 'over');
  assert.equal(integrity(s), 0);
});

test('nothing moves once the night is over', () => {
  const s = quiet();
  addHole(s, 0, 0, Math.sqrt(LOSS_AREA / Math.PI) + 1);
  step(s, {});
  const t = s.t;
  step(s, { target: { x: 200, y: 0 } });
  assert.equal(s.t, t);
});

test('the same seed and inputs give the same night', () => {
  const run = () => {
    const s = newNight({ seed: 'same' });
    for (let i = 0; i < 60 * 30; i++) step(s, { target: { x: Math.cos(i / 40) * 200, y: Math.sin(i / 40) * 200 } });
    return JSON.stringify({ score: s.score, moths: s.moths.map((m) => [m.kind, m.x.toFixed(3), m.y.toFixed(3)]), holes: s.holes.length });
  };
  assert.equal(run(), run());
});

test('arrivals follow the seed, not the player, so daily patterns match', () => {
  const arrivals = (input) => {
    const s = newNight({ seed: 'daily' });
    const seen = [];
    for (let i = 0; i < 60 * 25; i++) {
      step(s, input(i));
      for (const e of s.events) if (e.type === 'arrive') seen.push(e.kind);
      s.events.length = 0;
    }
    return seen.join(',');
  };
  assert.equal(arrivals(() => ({})), arrivals((i) => ({ target: { x: Math.cos(i / 30) * 150, y: Math.sin(i / 30) * 150 } })));
});

test('the director spawns moths and the pace climbs through the night', () => {
  const s = newNight({ seed: 'busy' });
  for (let i = 0; i < 60 * 10; i++) step(s, {});
  assert.ok(s.moths.length > 2);
  for (let h = 1; h < HOURS.length; h++) {
    assert.ok(HOURS[h].every <= HOURS[h - 1].every, `hour ${h} should not be slower`);
    assert.ok(HOURS[h].cap >= HOURS[h - 1].cap, `hour ${h} should not hold fewer moths`);
  }
});

test('bosses arrive at the start of their hour', () => {
  const s = quiet({ director: true });
  const bossHour = HOURS.findIndex((h) => h.boss);
  s.hour = bossHour - 1;
  for (let i = 0; i < Math.ceil(HOUR_LEN / DT) + 2; i++) {
    step(s, {});
    s.holes.length = 0; // nobody is playing; keep the linen whole so the hour can end
  }
  assert.equal(s.phase, 'notion');
  chooseNotion(s, s.offers[0]);
  step(s, {});
  assert.ok(s.moths.some((m) => m.kind === HOURS[bossHour].boss));
});

test('notion offers respect each notion’s maximum', () => {
  const s = quiet();
  for (const n of NOTIONS) s.notions[n.id] = n.max;
  s.notions.spool = 0;
  s.notions.pins = 0;
  for (let i = 0; i < Math.ceil(HOUR_LEN / DT) + 2; i++) step(s, {});
  assert.deepEqual([...s.offers].sort(), ['pins', 'spool']);
});

test('the clock reads the time of night', () => {
  const s = quiet();
  assert.equal(clockLabel(s), '10:00 PM');
  s.hour = 2;
  s.hourT = HOUR_LEN / 2;
  assert.equal(clockLabel(s), '12:30 AM');
});
