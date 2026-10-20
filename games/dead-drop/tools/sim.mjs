#!/usr/bin/env node
// Bot-vs-bot simulator for balancing Dead Drop. Rules and stats live in tools/sim/*.mjs.
//
//   node games/dead-drop/tools/sim.mjs [options]
//
//   --rounds N            volume per configuration, in rounds (default 5000), rounded up to whole batches
//   --a ID --b ID         rivals (default heron, heron); --samples N overrides both (default: their own)
//   --seats N             2 to 4 players (default 2); --c ID and --d ID fill seats three and four (default heron).
//                         Every table size plays the stake game (tokens, answers, the pot, the Microfilm)
//   --target N            points to win a match (default: follows the seat count, targetFor(seats) in js/data.js)
//   --seed S              default "dd"
//   --pin city            pin a city into every round (repeatable, at most 3); the rest come from the match's pool
//   --roster classic|mixed   classic (default): the original 12 agents and 11 cities. mixed: each match draws a
//                         roster of 12 from all 20 agents (always the Heavy, always a takedown) and deals all 20 cities
//   --with ID             (repeatable) force this agent into every Mixed roster (--roster mixed, or a --setup past Wren)
//   --setup RIVAL         play that rival's ladder setup instead of --roster: Classic plus the packs up to it, its own
//                         pack's agents always in, its cities featured in round 1, and its twist held by bot B
//                         (whichever seat B sits in). wren is Classic
//   --twist on|off        off plays a --setup without its twist (default on)
//   --set path=value      (repeatable) change data, e.g. heavy.power=5 or control.count=2 (a twisted rival's id edits
//                         its twist); applies to the base and every variant
//   --variant name:key=value   (repeatable; repeat a name to set more than one key). Keys: a, b, c, d, seats,
//                         samples, target, pin, roster, with, setup, twist, or a settings path
//   --probe agents|cities|stakes   agents: one "<id>+1" variant (power + 1) per agent the base can deal, each forcing
//                         its agent into the roster when the base is Mixed; cities: a "pin-<id>" variant per city
//                         of the base's pool; stakes: tokens2, tokens9, no-film (rules.reel=0) and no-rollover
//                         (rules.rollover=0)
//   --ladder [all]        adjacent rival pairs (default) or all 10 pairs, no base run
//   --workers W           default 4; 1 runs in-process with no threads
//   --run NAME            batch log .tmp/dead-drop-sim/NAME.jsonl (default "sim"); --resume reuses it
//   --out FILE            JSON summary (default .tmp/dead-drop-sim/NAME.json)
//   --against FILE        compare this run's base with the base in a saved JSON. Against a phase2a 3- or 4-seat
//                         baseline the stake keys will read as changed: expected, 2a had no stakes at those tables
//   --json                print the JSON to stdout instead of the text report
//
// Every configuration plays batches 0, 1, 2, ... and keeps the shortest prefix that reaches --rounds, so
// the numbers do not depend on --workers or on which batch finishes first.
import { Worker } from 'node:worker_threads';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { AGENT, AGENTS, CITIES, RIVALS } from '../js/data.js';
import { resolveConfig, applyVariant, configHash, setupOf, SIM_VERSION, BATCH } from './sim/config.mjs';
import { playBatch } from './sim/play.mjs';
import { emptyStats, mergeStats, summarize, formatSummary, compare, margin } from './sim/stats.mjs';

const DIR = new URL('../../../.tmp/dead-drop-sim/', import.meta.url).pathname;
const WORKER = new URL('./sim/worker.mjs', import.meta.url);

// ---- arguments ----
const REPEAT = new Set(['pin', 'set', 'variant', 'with']);
const FLAGS = new Set(['json', 'resume']);
const VALUED = new Set(['rounds', 'a', 'b', 'c', 'd', 'seats', 'samples', 'target', 'seed', 'probe', 'workers', 'run', 'out', 'against', 'roster', 'setup', 'twist']);
const POSITIVE_INTS = ['rounds', 'workers', 'samples', 'target'];
function parseArgs(argv) {
  const o = { pin: [], set: [], variant: [], with: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`unexpected argument: ${a}`);
    const key = a.slice(2);
    if (FLAGS.has(key)) o[key] = true;
    else if (key === 'ladder') o.ladder = argv[i + 1] === 'all' ? (i++, 'all') : 'adjacent';
    else {
      if (!REPEAT.has(key) && !VALUED.has(key)) throw new Error(`unknown option: ${a}`);
      const v = argv[++i];
      if (v === undefined) throw new Error(`--${key} needs a value`);
      if (REPEAT.has(key)) o[key].push(v);
      else o[key] = v;
    }
  }
  for (const key of POSITIVE_INTS) {
    if (o[key] !== undefined && !(/^\d+$/.test(o[key]) && Number(o[key]) >= 1)) throw new Error(`--${key} must be a whole number of at least 1, got "${o[key]}"`);
  }
  if (o.seats !== undefined && !(/^[234]$/.test(o.seats))) throw new Error('--seats must be 2 to 4');
  const nSeats = Number(o.seats ?? 2);
  if (o.c !== undefined && nSeats < 3) throw new Error('--c needs --seats 3 or more');
  if (o.d !== undefined && nSeats < 4) throw new Error('--d needs --seats 4');
  if (o.ladder && o.seats !== undefined && o.seats !== '2') throw new Error('--ladder plays two seats');
  return o;
}
const splitOnce = (s, ch) => {
  const i = s.indexOf(ch);
  return i < 0 ? [s, undefined] : [s.slice(0, i), s.slice(i + 1)];
};

// ---- configurations ----
function buildConfigs(o) {
  const common = { seed: o.seed ?? 'dd', samples: o.samples ?? null, target: o.target, pin: o.pin, roster: o.roster ?? 'classic', force: o.with, setup: o.setup ?? null, twist: o.twist ?? 'on' };
  const withSets = (c) => o.set.reduce((acc, s) => applyVariant(acc, ...splitOnce(s, '=')), c);
  const named = (c, name) => ({ ...c, name });
  const list = [];
  if (o.ladder) {
    const ids = RIVALS.map((r) => r.id);
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        if (o.ladder !== 'all' && j !== i + 1) continue;
        const name = `${ids[i]}-${ids[j]}`;
        list.push(withSets(resolveConfig({ ...common, name, a: ids[i], b: ids[j] })));
      }
    return list;
  }
  const base = withSets(resolveConfig({ ...common, name: 'base', a: o.a ?? 'heron', b: o.b, c: o.c ?? 'heron', d: o.d ?? 'heron', seats: o.seats ?? 2 }));
  list.push(base);
  const variants = new Map();
  for (const v of o.variant) {
    const [name, rest] = splitOnce(v, ':');
    const [key, value] = splitOnce(rest ?? '', '=');
    if (!name || !key || value === undefined) throw new Error(`bad --variant (want name:key=value): ${v}`);
    variants.set(name, applyVariant(variants.get(name) ?? base, key, value));
  }
  // The probes cover what the base can deal: its setup's agents (each forced into a Mixed roster) and its pool.
  const deals = setupOf(base);
  if (o.probe === 'agents') {
    for (const id of deals.agents) {
      const key = `${id}.power`;
      const up = applyVariant(base, key, (base.set[key] ?? AGENT[id].power) + 1);
      variants.set(`${id}+1`, deals.mixed && !up.force.includes(id) ? applyVariant(up, 'with', id) : up);
    }
  } else if (o.probe === 'cities') {
    for (const id of deals.cities) variants.set(`pin-${id}`, applyVariant(base, 'pin', id));
  } else if (o.probe === 'stakes') {
    for (const [vname, key, value] of [['tokens2', 'rules.tokens', 2], ['tokens9', 'rules.tokens', 9], ['no-film', 'rules.reel', 0], ['no-rollover', 'rules.rollover', 0]]) variants.set(vname, applyVariant(base, key, value));
  } else if (o.probe) throw new Error(`unknown --probe: ${o.probe}`);
  for (const [name, c] of variants) list.push(named(c, name));
  return list;
}

// ---- batch log ----
function loadLog(file) {
  const done = new Map(); // `${hash}:${batch}` -> {rounds, stats}
  if (!existsSync(file)) return done;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      done.set(`${r.hash}:${r.batch}`, { stats: r.stats, rounds: r.stats.rounds });
    } catch {}
  }
  return done;
}

// ---- scheduling ----
/** Plays every configuration to its prefix of batches; returns merged stats per config name. */
async function runAll(configs, o, log) {
  const need = Math.max(1, Math.ceil(Number(o.rounds ?? 5000)));
  const workers = Math.max(1, Number(o.workers ?? 4));
  const cached = o.resume ? loadLog(log) : new Map();
  if (!o.resume) writeFileSync(log, '');
  const st = configs.map((config) => ({ config, hash: configHash(config), results: [], next: 0, prefix: 0, rounds: 0, merged: emptyStats(config.bots.length), fromLog: 0, done: false }));
  const advance = (s) => {
    while (!s.done && s.results[s.prefix]) {
      const r = s.results[s.prefix++];
      s.merged = mergeStats(s.merged, r.stats);
      s.rounds += r.rounds;
      if (r.cached) s.fromLog++;
      if (s.rounds >= need) s.done = true;
    }
  };
  // Take cached batches first, in order.
  for (const s of st) {
    while (!s.done) {
      const hit = cached.get(`${s.hash}:${s.next}`);
      if (!hit) break;
      s.results[s.next++] = { ...hit, cached: true };
      advance(s);
    }
  }
  // Next batch to hand out: round-robin over configurations that still need work.
  let rr = 0;
  const take = () => {
    for (let k = 0; k < st.length; k++) {
      const s = st[(rr + k) % st.length];
      if (s.done) continue;
      rr = (rr + k + 1) % st.length;
      return { s, batch: s.next++ };
    }
    return null;
  };
  const finish = ({ s, batch }, res) => {
    s.results[batch] = { stats: res.stats, rounds: res.rounds };
    appendFileSync(log, `${JSON.stringify({ run: s.config.name, hash: s.hash, batch, stats: res.stats })}\n`);
    advance(s);
  };
  if (workers === 1) {
    for (let t = take(); t; t = take()) finish(t, playBatch(t.s.config, t.batch * BATCH, BATCH));
  } else {
    const pool = Array.from({ length: workers }, () => new Worker(WORKER));
    try {
      await Promise.all(
        pool.map(
          (w) =>
            new Promise((ok, fail) => {
              let job = null;
              const feed = () => {
                job = take();
                if (!job) return ok();
                w.postMessage({ id: job.batch, config: job.s.config, start: job.batch * BATCH, count: BATCH });
              };
              w.on('message', (res) => {
                finish(job, res);
                feed();
              });
              w.on('error', fail);
              feed();
            }),
        ),
      );
    } finally {
      await Promise.all(pool.map((w) => w.terminate()));
    }
  }
  return st;
}

// ---- report ----
const f1 = (v) => (v === null ? 'n/a' : v.toFixed(1));
function compareLines(rows) {
  return rows.map((r) => `  ${r.sig ? '*' : ' '} ${r.key.padEnd(14)} ${f1(r.base).padStart(6)} -> ${f1(r.other).padStart(6)}  (${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(1)} ±${r.margin.toFixed(1)})`);
}
/** The deal settings a variant changed from the base (roster, forced agents, setup, twist). */
function dealDiff(config, base) {
  const out = {};
  for (const k of ['roster', 'force', 'setup', 'twist']) if (JSON.stringify(config[k]) !== JSON.stringify(base[k])) out[k] = config[k];
  return out;
}
function textReport(o, header, runs, base, probe, against) {
  const L = [header, ''];
  if (o.ladder) {
    L.push('Ladder (A is the first rival)');
    for (const [name, r] of Object.entries(runs)) {
      const w = r.summary.aMatchWins;
      L.push(`  ${name.padEnd(18)} A wins ${f1(w.pct)}% ±${f1(w.margin)}   ${r.summary.roundsPerMatch.mean?.toFixed(2)} rounds/match   (${r.rounds} rounds)`);
    }
    return L.join('\n');
  }
  L.push(formatSummary(base.summary, 'Base'));
  for (const [name, r] of Object.entries(runs)) {
    if (name === 'base') continue;
    L.push('', `Variant ${name}: ${JSON.stringify({ ...r.config.set, ...(r.config.pin.length ? { pin: r.config.pin } : {}), ...dealDiff(r.config, base.config) })}`, ...compareLines(compare(base.summary, r.summary)));
  }
  if (probe === 'agents') {
    L.push('', `Agent probe: win% when played (base -> power + 1${setupOf(base.config).mixed ? ', forced into every roster' : ''})`);
    for (const a of AGENTS) {
      const v = runs[`${a.id}+1`];
      if (!v) continue;
      const b = base.summary.agents[a.id].winPlayed, x = v.summary.agents[a.id].winPlayed;
      if (b === null || x === null) {
        L.push(`  ${a.name.padEnd(14)} ${f1(b).padStart(6)} -> ${f1(x).padStart(6)}`);
        continue;
      }
      const m = Math.sqrt(base.summary.agents[a.id].winPlayedMargin ** 2 + v.summary.agents[a.id].winPlayedMargin ** 2);
      L.push(`  ${a.name.padEnd(14)} ${f1(b).padStart(6)} -> ${f1(x).padStart(6)}  (${x - b >= 0 ? '+' : ''}${(x - b).toFixed(1)} ±${m.toFixed(1)})${Math.abs(x - b) > m ? ' *' : ''}`);
    }
  }
  if (probe === 'cities') {
    L.push('', 'City probe: pinned city, share of rounds it was decided, and winner took round');
    for (const c of CITIES) {
      if (!runs[`pin-${c.id}`]) continue;
      const s = runs[`pin-${c.id}`].summary.cities[c.id];
      const d = s.n ? (100 * s.decided) / s.n : null;
      const g = s.decided ? (100 * s.agrees) / s.decided : null;
      L.push(`  ${c.name.padEnd(14)} decided ${f1(d)}% ±${f1(margin(s.decided, s.n))}   agrees ${f1(g)}% ±${f1(margin(s.agrees, s.decided))}`);
    }
  }
  if (against) L.push('', 'Against saved base (* = significant)', ...compareLines(against));
  return L.join('\n');
}

// ---- main ----
let o;
try {
  o = parseArgs(process.argv.slice(2));
} catch (e) {
  console.error(`sim: ${e.message}`);
  process.exit(1);
}
let configs;
try {
  configs = buildConfigs(o);
} catch (e) {
  console.error(`sim: ${e.message}`);
  process.exit(1);
}
const name = o.run ?? 'sim';
mkdirSync(DIR, { recursive: true });
const log = `${DIR}${name}.jsonl`;
const t0 = Date.now();
const done = await runAll(configs, o, log);
const seconds = (Date.now() - t0) / 1000;

const runs = {};
for (const s of done) runs[s.config.name] = { config: s.config, rounds: s.rounds, matches: s.merged.matches, summary: summarize(s.merged), stats: s.merged };
const base = runs.base;
let against;
if (o.against) {
  const saved = JSON.parse(readFileSync(resolve(o.against), 'utf8'));
  if (!saved.runs?.base) throw new Error(`${o.against} has no base run`);
  against = compare(saved.runs.base.summary, (base ?? Object.values(runs)[0]).summary);
}
const out = { version: SIM_VERSION, seed: o.seed ?? 'dd', seconds, resumedBatches: done.reduce((n, s) => n + s.fromLog, 0), runs, ...(against ? { against } : {}) };
writeFileSync(o.out ? resolve(o.out) : `${DIR}${name}.json`, JSON.stringify(out));
if (o.json) console.log(JSON.stringify(out));
else {
  const total = Object.values(runs).reduce((n, r) => n + r.rounds, 0);
  const deal = base ? (base.config.setup ? `, ${base.config.setup}'s setup${base.config.twist === 'off' ? ' without its twist' : ''}` : base.config.roster === 'mixed' ? ', Mixed rosters' : '') + (base.config.force.length ? ` with ${base.config.force.join(', ')}` : '') : '';
  const header = `${total} rounds across ${configs.length} configuration${configs.length > 1 ? 's' : ''} in ${seconds.toFixed(1)}s (${(total / Math.max(seconds, 0.001)).toFixed(0)} rounds/s), ${o.workers ?? 4} workers, seed ${out.seed}${base && base.config.bots.length !== 2 ? `, ${base.config.bots.length} seats` : ''}${deal}${out.resumedBatches ? `, ${out.resumedBatches} batches resumed` : ''}`;
  console.log(textReport(o, header, runs, base, o.probe, against));
}
