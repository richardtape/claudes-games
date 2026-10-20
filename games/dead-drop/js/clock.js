/**
 * The turn clock: pure, DOM-free, plain JSON state. The caller supplies `now` (ms) to every call, so
 * there are no timers and no Date.now() in here. `timer` 0 means no clock.
 * kind: 'drop' | 'answer' (the table's timer, with a grace for latency) | 'next' (NEXT_MS, no grace).
 */
export const NEXT_MS = 20000;
export const GRACE_MS = 1500;

export function createClock({ timer = 0 } = {}) {
  return { timer, kind: null, deadline: null };
}

export function arm(clock, kind, now) {
  if (!clock.timer) return;
  clock.kind = kind;
  clock.deadline = now + (kind === 'next' ? NEXT_MS : clock.timer);
}

export function clear(clock) {
  clock.kind = null;
  clock.deadline = null;
}

export function left(clock, now) {
  if (clock.deadline === null) return null;
  return Math.max(0, clock.deadline - now);
}

export function expired(clock, now) {
  if (clock.deadline === null) return false;
  const grace = clock.kind === 'next' ? 0 : GRACE_MS;
  return now >= clock.deadline + grace;
}

export function viewOf(clock, now) {
  if (clock.deadline === null) return null;
  return { kind: clock.kind, left: left(clock, now) };
}
