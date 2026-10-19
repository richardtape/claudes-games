// Simulation configuration: who plays, with which seed, under which data patches.
import { AGENT, CITY, RIVALS, RULES } from '../../js/data.js';
import { hashString } from '../../../../shared/rng.js';

export const SIM_VERSION = 2;
/** Matches per batch: the unit the worker pool hands out and the cache keys on. */
export const BATCH = 20;
export const MAX_ROUNDS = 40;

const rivalBot = (id, samples = null) => {
  const r = RIVALS.find((x) => x.id === id);
  if (!r) throw new Error(`unknown rival: ${id}`);
  const { name, blurb, ...bot } = r;
  return { ...bot, samples: samples ?? r.samples };
};

const coerce = (v) => (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v);

function checkPin(pin) {
  for (const id of pin) if (!CITY[id]) throw new Error(`unknown city: ${id}`);
  if (pin.length > 3) throw new Error('at most 3 pinned cities');
  return pin;
}

export function resolveConfig({ name = 'base', seed = 'dd', a = 'heron', b = 'heron', c = 'heron', d = 'heron', seats = 2, samples = null, target = 10, pin = [], set = {} } = {}) {
  if (!Number.isInteger(Number(seats)) || Number(seats) < 2 || Number(seats) > 4) throw new Error('seats must be 2 to 4');
  const s = samples === null ? null : Number(samples);
  const bots = [a, b, c, d].slice(0, Number(seats)).map((id) => rivalBot(id, s));
  return { name, seed: String(seed), samples: s, target: Number(target), pin: checkPin([...pin]), set: { ...set }, bots };
}

/** A copy of `config` with one thing changed. Keys: a, b, c, d, seats, samples, target, pin, or a settings path. */
export function applyVariant(config, key, value) {
  const next = { ...config, pin: [...config.pin], set: { ...config.set }, bots: config.bots.map((x) => ({ ...x })) };
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
  else next.set[key] = coerce(value);
  return next;
}

/**
 * Prefix -> { obj, family }: the entry a path edits, and every entry of its kind (so a typo'd field is caught).
 * Add a line here to open up a new family of settings (Task 5: rules -> { obj: RULES, family: [RULES] }).
 */
const registry = () => {
  const agents = Object.values(AGENT);
  const cities = Object.values(CITY);
  return {
    rules: { obj: RULES, family: [RULES] },
    ...Object.fromEntries(Object.entries(AGENT).map(([id, obj]) => [id, { obj, family: agents }])),
    ...Object.fromEntries(Object.entries(CITY).map(([id, obj]) => [id, { obj, family: cities }])),
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
  const text = JSON.stringify({ v: SIM_VERSION, batch: BATCH, seed: config.seed, target: config.target, pin: config.pin, set, bots: config.bots });
  return hashString(text).toString(16).padStart(8, '0') + hashString(`${text}#`).toString(16).padStart(8, '0');
}
