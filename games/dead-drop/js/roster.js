// Dead Drop rosters and city pools: which agents and cities a match deals. Pure, no DOM.
//
// A setup says what a match may deal: { mixed, agents, cities, must, feature, twist }. Classic deals the
// original 12 agents and 11 cities; Mixed draws a roster of 12 from `agents`. The ladder's rival k plays
// Classic plus the packs of rivals 1..k (Decision 2), and free play plays your network. matchOptions()
// turns a setup into the options newMatch() takes.
import { AGENTS, CITIES, CLASSIC_CITIES, DECK, RIVALS, ROSTER, TWISTS } from './data.js';

const AGENT_IDS = AGENTS.map((a) => a.id);
const CITY_IDS = CITIES.map((c) => c.id);
const DRAWS = 50;

/** `ids` (any order, no duplicates) in the order of `all`. */
const inOrder = (all, ids) => all.filter((id) => ids.includes(id));

/**
 * A Mixed roster of ROSTER.size agents from `pool`, in AGENTS order: always ROSTER.always and `must`,
 * the rest from a shuffle of the pool. The fill is redrawn while the roster has no takedown, at most
 * DRAWS times; then the Assassin is forced in, if the pool has one.
 */
export function drawRoster(pool, rng, { must = [] } = {}) {
  if (pool.length < ROSTER.size) throw new RangeError(`a roster needs a pool of ${ROSTER.size} agents or more, got ${pool.length}`);
  const fixed = [...new Set([...ROSTER.always, ...must])];
  const rest = pool.filter((id) => !fixed.includes(id));
  const need = Math.max(0, ROSTER.size - fixed.length);
  const hasTakedown = (fill) => fixed.some((id) => ROSTER.takedowns.includes(id)) || fill.some((id) => ROSTER.takedowns.includes(id));
  let fill = rng.shuffle(rest).slice(0, need);
  for (let i = 0; i < DRAWS && !hasTakedown(fill); i++) fill = rng.shuffle(rest).slice(0, need);
  if (!hasTakedown(fill) && fill.length && pool.includes('assassin')) fill[fill.length - 1] = 'assassin';
  return inOrder(AGENT_IDS, [...fixed, ...fill]);
}

/** Your network: Classic plus the packs of the rivals in `beaten`, in AGENTS and CITIES order. */
export function network(beaten) {
  const agents = [...DECK];
  const cities = [...CLASSIC_CITIES];
  for (const r of RIVALS) {
    if (!beaten.includes(r.id)) continue;
    agents.push(...r.pack.agents);
    cities.push(...r.pack.cities);
  }
  return { agents: inOrder(AGENT_IDS, agents), cities: inOrder(CITY_IDS, cities) };
}

const frozenSetup = (s) => Object.freeze({ ...s, agents: Object.freeze([...s.agents]), cities: Object.freeze([...s.cities]), must: Object.freeze([...s.must]) });

/** The original 12 agents and 11 cities, no twist. */
export const CLASSIC_SETUP = frozenSetup({ mixed: false, agents: DECK, cities: CLASSIC_CITIES, must: [], feature: null, twist: null });

/** Everything: a Mixed roster from all 20 agents, all 20 cities (online and pass and play's Mixed). */
export const MIXED_ALL = frozenSetup({ mixed: true, agents: AGENT_IDS, cities: CITY_IDS, must: [], feature: null, twist: null });

/** Free play against a beaten rival: Mixed from your network, no twist. */
export function freeSetup(beaten) {
  const { agents, cities } = network(beaten);
  return { mixed: true, agents, cities, must: [], feature: null, twist: null };
}

/**
 * The ladder match against `rivalId`. Wren is Classic. Rival k ≥ 1 deals Mixed from Classic plus packs
 * 1..k, always with its own pack's agents (and a `placed` twist's card), features its own cities in
 * round 1 and brings its twist.
 */
export function ladderSetup(rivalId) {
  const k = RIVALS.findIndex((r) => r.id === rivalId);
  if (k < 0) throw new Error(`unknown rival: ${rivalId}`);
  if (k === 0) return CLASSIC_SETUP;
  const { pack } = RIVALS[k];
  const twist = TWISTS[rivalId] ? { ...TWISTS[rivalId] } : null;
  const { agents, cities } = network(RIVALS.slice(0, k + 1).map((r) => r.id));
  const must = twist?.id === 'placed' ? [...pack.agents, twist.kind] : [...pack.agents];
  return { mixed: true, agents, cities, must, feature: [...pack.cities], twist };
}

/**
 * newMatch's { roster, pool, feature, twist } for a setup. A Mixed roster is drawn with `rng`; the
 * twist belongs to `twistSeat` (the rival's seat).
 */
export function matchOptions(setup, rng, twistSeat = 1) {
  return {
    roster: setup.mixed ? drawRoster(setup.agents, rng, { must: setup.must }) : [...setup.agents],
    pool: [...setup.cities],
    feature: setup.feature ? [...setup.feature] : null,
    twist: setup.twist ? { ...setup.twist, seat: twistSeat } : null,
  };
}
