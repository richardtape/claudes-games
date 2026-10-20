// The daily operation as data (no DOM, no storage): one operation a day, the same for everyone, drawn
// from the date alone. Classic plus two featured agents and one featured city, against one rival.
import { AGENTS, CITIES, CLASSIC_CITIES, DECK, RIVALS } from './data.js';
import { operation } from './story.js';
import { createRng, dailySeed } from '../../../shared/rng.js';

/** The local date as 'YYYY-MM-DD'. */
export const dailyKey = (date = new Date()) => dailySeed(date);
/** The key's eight digits, 'YYYYMMDD': the daily's match id (it passes the id checks of restoreTable and meta). */
export const dailyId = (key) => key.replaceAll('-', '');

/** The eight agents outside Classic, in AGENTS order; the nine cities outside Classic, in CITIES order. */
export const NEW_AGENTS = Object.freeze(AGENTS.map((a) => a.id).filter((id) => !DECK.includes(id)));
export const NEW_CITIES = Object.freeze(CITIES.map((c) => c.id).filter((id) => !CLASSIC_CITIES.includes(id)));

const deepFreeze = (x) => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) deepFreeze(v);
  }
  return x;
};

/** The first day of the walk: from here on, no agent or city is featured two days running. */
export const DAILY_EPOCH = '2026-10-01';

const drawDay = (key, prev) => {
  const rng = createRng(`daily:${key}`);
  const rival = rng.pick(RIVALS);
  const agents = rng.shuffle(NEW_AGENTS.filter((id) => !prev || !prev.agents.includes(id))).slice(0, 2);
  const city = rng.pick(NEW_CITIES.filter((id) => !prev || id !== prev.city));
  return { rival, agents, city };
};

let walked = null; // { key, drawn }: the last walk's day, so the next day's call is one step
/** The draw for `key`: walked day by day from DAILY_EPOCH (local dates, DST-safe), each day excluding the day before's features. */
function drawFor(key) {
  if (key < DAILY_EPOCH) return drawDay(key, null);
  if (walked?.key === key) return walked.drawn;
  const [y, m, d] = DAILY_EPOCH.split('-').map(Number);
  let day = DAILY_EPOCH;
  let drawn = drawDay(day, null);
  if (walked && walked.key < key && walked.key > DAILY_EPOCH) {
    day = walked.key;
    drawn = walked.drawn;
  }
  let i = day === DAILY_EPOCH ? 0 : Math.round((Date.UTC(...day.split('-').map((x, j) => (j === 1 ? x - 1 : +x))) - Date.UTC(y, m - 1, d)) / 86400000);
  while (day < key) {
    i++;
    day = dailyKey(new Date(y, m - 1, d + i));
    drawn = drawDay(day, { agents: drawn.agents, city: drawn.city });
    if (i > 100000) throw new RangeError(`not a day: ${key}`);
  }
  walked = { key, drawn };
  return drawn;
}

/**
 * The operation for a day: { key, seed, matchId, rival, featured: { agents, city }, setup, operation }, deep-frozen.
 * Drawn with createRng(`daily:${day}`): the rival, the two agents, the city; from DAILY_EPOCH on, neither agent nor the city of the day before.
 * `setup` is roster.js's shape (a non-Mixed setup deals its list as is). Copy before changing anything.
 */
export function dailyOperation(key) {
  const seed = `daily:${key}`;
  const { rival, agents, city } = drawFor(key);
  const matchId = dailyId(key);
  return deepFreeze({
    key,
    seed,
    matchId,
    rival,
    featured: { agents, city },
    setup: { mixed: false, agents: [...DECK, ...agents], cities: [...CLASSIC_CITIES, city], must: [], feature: [city], twist: null },
    operation: operation(matchId, 0),
  });
}

/** How a finished daily went for seat `me`: the margin is against the best other score. */
export function dailyResult(state, me) {
  if (state.phase !== 'match-over') throw new Error('the match is not over');
  const others = state.scores.filter((_, i) => i !== me);
  return { margin: state.scores[me] - Math.max(...others), won: state.winner === me, by: state.winBy, rounds: state.history.length };
}
