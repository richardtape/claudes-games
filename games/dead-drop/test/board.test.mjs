import test from 'node:test';
import assert from 'node:assert/strict';
import { revealTap, REVEAL_GUARD_MS, FAST } from '../js/board.js';

test('a reveal ignores taps for 400 ms, then speeds up, then skips', () => {
  assert.equal(REVEAL_GUARD_MS, 400);
  assert.equal(FAST, 3);
  assert.equal(revealTap({ at: 1000, speed: 1 }, 1399), 'ignore');
  assert.equal(revealTap({ at: 1000, speed: 1 }, 1400), 'fast');
  assert.equal(revealTap({ at: 1000, speed: 3 }, 1400), 'skip');
});

test('the guard holds even once the reveal is already fast', () => {
  // A speed-up can only come after the guard, but a skip within it is still a stray tap.
  assert.equal(revealTap({ at: 1000, speed: 3 }, 1200), 'ignore');
});
