import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock, arm, clear, left, expired, viewOf, NEXT_MS, GRACE_MS } from '../js/clock.js';

test('a 30 s drop clock: counts down, expires after the grace, reads as a view', () => {
  const c = createClock({ timer: 30000 });
  arm(c, 'drop', 1000);
  assert.deepEqual(viewOf(c, 1000), { kind: 'drop', left: 30000 });
  assert.equal(left(c, 20000), 11000);
  assert.equal(left(c, 40000), 0);
  assert.equal(expired(c, 31000), false, 'the grace');
  assert.equal(expired(c, 1000 + 30000 + GRACE_MS), true);
  clear(c);
  assert.equal(viewOf(c, 1), null);
  assert.equal(expired(c, 1e9), false);
});

test('Next round has its own 20 s, with no grace; a timer of 0 never arms', () => {
  const c = createClock({ timer: 10000 });
  arm(c, 'next', 0);
  assert.deepEqual([left(c, 0), expired(c, NEXT_MS - 1), expired(c, NEXT_MS)], [NEXT_MS, false, true]);
  const off = createClock({ timer: 0 });
  arm(off, 'drop', 0);
  assert.equal(viewOf(off, 0), null);
});
