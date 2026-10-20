// Pure bookkeeping for counting each match, and each online win, once, and for first meetings (no DOM,
// no storage). The game persists `meta` through its own store(slug) save.
import { AGENTS, CITIES, CLASSIC_CITIES, DECK, RIVALS } from './data.js';

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

const AGENT_IDS = AGENTS.map((a) => a.id);
const CITY_IDS = CITIES.map((c) => c.id);
const isObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);
const ids = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && /^[a-z0-9]{8}$/.test(x)).slice(-MAX_COUNTED) : []);

/**
 * Bring a saved profile up to date. Fields it doesn't know are kept as they are (later phases
 * add their own); the known ones are cleaned, falling back to `fresh` where unusable. `met` (Phase
 * 2b-ii, from meet()) keeps the known `agents`, `cities` and `rivals` in each of its lists, once each.
 */
export function migrateMeta(raw, { codenames, rivals, fresh, agents = AGENT_IDS, cities = CITY_IDS }) {
  const m = isObject(raw) ? raw : {};
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
    met: cleanMet(m.met, { agents, cities, rivals }),
  };
}

// ── first meetings (spec 2.6) ───────────────────────────────────────────────
const MET = ['agents', 'cities', 'rivals'];
const KNOWN = { agents: AGENT_IDS, cities: CITY_IDS, rivals: RIVALS.map((r) => r.id) };
const CLASSIC = { agents: DECK, cities: CLASSIC_CITIES, rivals: [] };

/** The ids of `known` that `list` holds, in `known`'s order, once each ([] when `list` isn't a list). */
const keep = (known, list) => (Array.isArray(list) ? known.filter((id) => list.includes(id)) : []);

/** `meta.met` as migrateMeta keeps it: every list known ids only, once each; other fields kept. */
function cleanMet(met, known) {
  const m = isObject(met) ? met : {};
  return { ...m, agents: keep(known.agents, m.agents), cities: keep(known.cities, m.cities), rivals: keep(known.rivals, m.rivals) };
}

/**
 * Meet these agents, cities and rivals. Returns the ids met for the first time (in the order given, once
 * each) and records them in `meta.met`, whose lists stay in catalogue order. Classic agents and cities
 * are never new, and unknown ids are ignored. The intros (the dossier, the roster card's "New" tags)
 * show for what it returns.
 */
export function meet(meta, { agents = [], cities = [], rivals = [] } = {}) {
  if (!isObject(meta.met)) meta.met = {};
  const given = { agents, cities, rivals };
  const fresh = {};
  for (const k of MET) {
    const had = Array.isArray(meta.met[k]) ? meta.met[k] : [];
    fresh[k] = [...new Set(given[k])].filter((id) => KNOWN[k].includes(id) && !CLASSIC[k].includes(id) && !had.includes(id));
    meta.met[k] = keep(KNOWN[k], [...had, ...fresh[k]]);
  }
  return fresh;
}
