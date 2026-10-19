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

export const META_VERSION = 2;

const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);
const ids = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && /^[a-z0-9]{8}$/.test(x)).slice(-MAX_COUNTED) : []);

/**
 * Bring a saved profile up to date. Fields it doesn't know are kept as they are (later phases
 * add their own); the known ones are cleaned, falling back to `fresh` where unusable.
 */
export function migrateMeta(raw, { codenames, rivals, fresh }) {
  const m = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    ...m,
    v: META_VERSION,
    codename: codenames.includes(m.codename) ? m.codename : fresh.codename,
    token: typeof m.token === 'string' && /^[0-9a-f]{16}$/.test(m.token) ? m.token : fresh.token,
    beaten: Array.isArray(m.beaten) ? rivals.filter((id) => m.beaten.includes(id)) : [],
    matches: count(m.matches),
    onlineWins: count(m.onlineWins),
    counted: ids(m.counted),
    wonIds: ids(m.wonIds),
  };
}
