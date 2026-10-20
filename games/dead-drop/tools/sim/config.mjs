// Simulation configuration: who plays, with which seed, under which data patches, dealing which agents and cities.
import { AGENT, CITY, RIVALS, RULES, STAKES, TARGET, TWISTS } from '../../js/data.js';
import { CLASSIC_SETUP, MIXED_ALL, ladderSetup } from '../../js/roster.js';
import { hashString } from '../../../../shared/rng.js';

/** 4: rosters, ladder setups and twists (Phase 2b-ii). */
export const SIM_VERSION = 4;
/** Matches per batch: the unit the worker pool hands out and the cache keys on. */
export const BATCH = 20;
export const MAX_ROUNDS = 40;

const rivalBot = (id, samples = null) => {
  const r = RIVALS.find((x) => x.id === id);
  if (!r) throw new Error(`unknown rival: ${id}`);
  const { name, blurb, pack, ...bot } = r; // pack is ladder content, not a bot setting (and would move every configHash)
  return { ...bot, samples: samples ?? r.samples };
};

const coerce = (v) => (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v);

function checkPin(pin) {
  for (const id of pin) if (!CITY[id]) throw new Error(`unknown city: ${id}`);
  if (pin.length > 3) throw new Error('at most 3 pinned cities');
  return pin;
}

function checkRoster(roster) {
  if (roster !== 'classic' && roster !== 'mixed') throw new Error(`roster must be classic or mixed, got ${roster}`);
  return roster;
}
function checkForce(force) {
  for (const id of force) if (!AGENT[id]) throw new Error(`unknown agent: ${id}`);
  return force;
}
function checkSetup(setup) {
  if (setup !== null && !RIVALS.some((r) => r.id === setup)) throw new Error(`unknown rival setup: ${setup}`);
  return setup;
}
function checkTwist(twist) {
  if (twist !== 'on' && twist !== 'off') throw new Error(`twist must be on or off, got ${twist}`);
  return twist;
}

/**
 * `roster`: 'classic' (the original 12 agents and 11 cities) or 'mixed' (a roster of 12 drawn from all 20 agents
 * each match, all 20 cities). `force`: agent ids every Mixed roster includes. `setup`: a rival id, to play that
 * rival's ladder setup (its pool, featured cities and twist, held by bot B) instead of `roster`. `twist`: 'off'
 * plays a setup without its twist.
 */
export function resolveConfig({ name = 'base', seed = 'dd', a = 'heron', b = 'heron', c = 'heron', d = 'heron', seats = 2, samples = null, target = TARGET, pin = [], set = {}, roster = 'classic', force = [], setup = null, twist = 'on' } = {}) {
  if (!Number.isInteger(Number(seats)) || Number(seats) < 2 || Number(seats) > 4) throw new Error('seats must be 2 to 4');
  const s = samples === null ? null : Number(samples);
  const bots = [a, b, c, d].slice(0, Number(seats)).map((id) => rivalBot(id, s));
  return {
    name, seed: String(seed), samples: s, target: Number(target), pin: checkPin([...pin]), set: { ...set }, bots,
    roster: checkRoster(roster), force: checkForce([...force]), setup: checkSetup(setup ?? null), twist: checkTwist(twist),
  };
}

/**
 * What a config's matches deal from (roster.js's setup shape): a ladder setup with `force` added to its `must`,
 * else Mixed from everything with `must: force`, else Classic. Called per match, inside the config's patches, so
 * a twist setting (`control.count`) reaches the setup.
 */
export function setupOf(config) {
  if (config.setup) {
    const s = ladderSetup(config.setup);
    return config.force.length ? { ...s, must: [...new Set([...s.must, ...config.force])] } : s;
  }
  return config.roster === 'mixed' ? { ...MIXED_ALL, must: [...config.force] } : CLASSIC_SETUP;
}

/**
 * A copy of `config` with one thing changed. Keys: a, b, c, d, seats, samples, target, pin, roster, with (adds
 * an agent to `force`), setup, twist, or a settings path.
 */
export function applyVariant(config, key, value) {
  const next = { ...config, pin: [...config.pin], set: { ...config.set }, bots: config.bots.map((x) => ({ ...x })), force: [...config.force] };
  if (key === 'a') next.bots[0] = rivalBot(value, config.samples);
  else if (key === 'b') next.bots[1] = rivalBot(value, config.samples);
  else if (key === 'c' || key === 'd') {
    const i = key === 'c' ? 2 : 3;
    if (i >= next.bots.length) throw new Error(`--${key} needs at least ${i + 1} seats`);
    next.bots[i] = rivalBot(value, config.samples);
  } else if (key === 'seats') {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 2 || n > 4) throw new Error('seats must be 2 to 4');
    while (next.bots.length < n) next.bots.push(rivalBot('heron', config.samples));
    next.bots.length = n;
  }
  else if (key === 'samples') {
    next.samples = Number(value);
    next.bots = next.bots.map((x) => ({ ...x, samples: next.samples }));
  }
  else if (key === 'target') next.target = Number(value);
  else if (key === 'pin') next.pin = checkPin([...next.pin, value]);
  else if (key === 'roster') next.roster = checkRoster(value);
  else if (key === 'with') next.force = checkForce([...next.force, value]);
  else if (key === 'setup') next.setup = checkSetup(value);
  else if (key === 'twist') next.twist = checkTwist(value);
  else next.set[key] = coerce(value);
  return next;
}

/**
 * Prefix -> { obj, family }: the entry a path edits, and every entry of its kind (so a typo'd field is caught).
 * Add a line here to open up a new family of settings. A twisted rival's id edits its twist (`control.count`);
 * each twist is its own family, since the twists share no fields.
 */
const registry = () => {
  const agents = Object.values(AGENT);
  const cities = Object.values(CITY);
  return {
    rules: { obj: RULES, family: [RULES] },
    stakes: { obj: STAKES, family: [STAKES] },
    ...Object.fromEntries(Object.entries(AGENT).map(([id, obj]) => [id, { obj, family: agents }])),
    ...Object.fromEntries(Object.entries(CITY).map(([id, obj]) => [id, { obj, family: cities }])),
    ...Object.fromEntries(Object.entries(TWISTS).map(([id, obj]) => [id, { obj, family: [obj] }])),
  };
};

/** Applies `set` ({ 'heavy.power': 5 }) to the live data, runs fn, and always restores the old values. */
export function withPatches(set, fn) {
  const targets = registry();
  const undo = [];
  try {
    for (const [path, value] of Object.entries(set)) {
      const dot = path.indexOf('.');
      const prefix = dot > 0 ? path.slice(0, dot) : '';
      const field = path.slice(dot + 1);
      const entry = (Object.hasOwn(targets, prefix) ? targets[prefix] : null);
      if (!entry || !entry.family.some((o) => Object.hasOwn(o, field))) throw new Error(`unknown sim setting: ${path}`);
      const { obj } = entry;
      undo.push([obj, field, Object.hasOwn(obj, field), obj[field]]);
      obj[field] = value;
    }
    return fn();
  } finally {
    for (const [obj, field, had, old] of undo.reverse()) {
      if (had) obj[field] = old;
      else delete obj[field];
    }
  }
}

/** Identifies everything that changes play (not the name), so cached batches can be reused. */
export function configHash(config) {
  const set = Object.fromEntries(Object.keys(config.set).sort().map((k) => [k, config.set[k]]));
  const text = JSON.stringify({ v: SIM_VERSION, batch: BATCH, seed: config.seed, target: config.target, pin: config.pin, set, bots: config.bots, roster: config.roster, force: config.force, setup: config.setup, twist: config.twist });
  return hashString(text).toString(16).padStart(8, '0') + hashString(`${text}#`).toString(16).padStart(8, '0');
}
