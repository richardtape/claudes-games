// Pure bookkeeping for counting each match, and each online win, once (no DOM, no storage). The
// game persists `meta` through its own store(slug) save.
export const MAX_COUNTED = 20;

/** Count a match id once. Returns true if it was new (and counted), false if already seen. */
export function countMatch(meta, matchId) {
  if (!Array.isArray(meta.counted)) meta.counted = [];
  if (meta.counted.includes(matchId)) return false;
  meta.matches = (meta.matches || 0) + 1;
  meta.counted.push(matchId);
  if (meta.counted.length > MAX_COUNTED) meta.counted.splice(0, meta.counted.length - MAX_COUNTED);
  return true;
}

/**
 * Count an online win once per match id, so reloading a finished match doesn't count it again.
 * Returns true if it counted. A view with no id (from an older host) always counts.
 */
export function countWin(meta, matchId) {
  if (!Array.isArray(meta.wonIds)) meta.wonIds = [];
  if (matchId) {
    if (meta.wonIds.includes(matchId)) return false;
    meta.wonIds.push(matchId);
    if (meta.wonIds.length > MAX_COUNTED) meta.wonIds.splice(0, meta.wonIds.length - MAX_COUNTED);
  }
  meta.onlineWins = (meta.onlineWins || 0) + 1;
  return true;
}
