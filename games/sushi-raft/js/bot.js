// A kitchen bot: plays one or both otters through the same tap() a player uses. It drives the
// simulator (tools/sim.mjs) and the title-screen demo. Human-ish: each time an otter stands idle
// it waits a moment (`think`, longer at low skill), then picks one useful tap.
//
// An otter that can reach the plates, the rice and the dock takes jobs (one dish for the most
// impatient customer) and makes them, prepping what nobody else is. An otter that can't (the far
// side of the split kitchen) supplies: it preps what the jobs need and passes it over the counter.
//
//   const bot = createBot({ otters: [0, 1], skill: 0.7, seed: 1 });
//   bot.tick(st, dt);   // call before E.step(st, dt)
import * as E from './engine.js';
import { DISHES, PREP } from './data.js';

const RAW_FOR = {};
for (const [raw, p] of Object.entries(PREP)) RAW_FOR[p.to] = raw;
const COLS = 6;

const idle = (o) => !o.queue.length && !o.goal && !o.path.length && !o.act && o.busy <= 0;
const dist = (o, [c, r]) => Math.abs(o.c - c) + Math.abs(o.r - r);

/** `fumbles`: now and then tap a wrong station, as people do (the simulator); off for a partner on screen. */
export function createBot({ otters = [0, 1], skill = 0.8, seed = 1, fumbles = true } = {}) {
  let s = seed >>> 0 || 1;
  const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const think = () => (0.1 + (1 - skill) * 0.8) * (0.6 + rand() * 0.8);
  const wait = {};
  const jobs = {};
  const gullSeen = new Map();
  let night = -1;
  let lastEvent = 0;
  const bot = {
    otters,
    skill,
    taps: 0,
    jobs,
    tick(st, dt) {
      if (st.phase !== 'service') return;
      const svc = st.svc;
      if (night !== st.night) {
        night = st.night;
        for (const k of Object.keys(jobs)) delete jobs[k];
        gullSeen.clear();
      }
      // A launched plate ends its otter's job.
      for (const e of st.events) {
        if (e.id <= lastEvent) continue;
        lastEvent = e.id;
        if (e.type === 'do' && e.what === 'launch') delete jobs[e.o];
      }
      for (const oi of otters) {
        const o = svc.otters[oi];
        if (!idle(o)) {
          wait[oi] = think();
          continue;
        }
        if ((wait[oi] = (wait[oi] ?? think()) - dt) > 0) continue;
        wait[oi] = think();
        const t = decide(st, oi, { rand, skill, jobs, mine: otters, fumbles });
        if (t && E.tap(st, oi, t[0], t[1]).ok) bot.taps++;
      }
      // Gulls: noticed after a human-ish moment, and sometimes missed.
      for (const g of svc.gulls) {
        if (g.state !== 'fly') continue;
        if (!gullSeen.has(g.id)) gullSeen.set(g.id, { at: svc.t + 0.5 + (1 - skill) * 1.6 + rand() * 0.6, try: rand() < 0.35 + skill * 0.6 });
        const seen = gullSeen.get(g.id);
        if (seen.try && svc.t >= seen.at) E.shoo(st, g.id);
      }
    },
  };
  return bot;
}

/** A snapshot of the kitchen for one decision. */
function survey(st, jobs) {
  const svc = st.svc;
  const tiles = svc.grid.map((t, i) => ({ t, c: i % COLS, r: Math.floor(i / COLS) }));
  const want = E.demand(st);
  const plates = [];
  for (const o of svc.otters) if (o.hold?.plate) plates.push({ plate: o.hold, where: 'held', o: o.i });
  for (const x of tiles) if (x.t.item?.plate) plates.push({ plate: x.t.item, where: x.t.k, c: x.c, r: x.r });
  const fits = (plate, d) => plate.parts.every((q) => DISHES[d].parts.includes(q));
  // Plates in someone's paws belong to that otter's job; the rest serve whatever is wanted most.
  for (const p of plates) {
    const done = E.dishOf(st, p.plate);
    const job = p.where === 'held' ? jobs[p.o] : null;
    if (job && fits(p.plate, job.dish)) p.target = job.dish;
    else if (done && (p.where === 'dock' || !st.menu.some((d) => d !== done && fits(p.plate, d) && (want[d] || 0) > (want[done] || 0)))) p.target = done;
    else {
      const options = st.menu.filter((d) => fits(p.plate, d));
      options.sort((a, b) => (want[b] || 0) - (want[a] || 0) || DISHES[a].parts.length - DISHES[b].parts.length);
      p.target = options[0] || null;
    }
    if (p.target && want[p.target]) want[p.target]--;
    p.missing = p.target ? DISHES[p.target].parts.filter((q) => !p.plate.parts.includes(q)) : [];
  }
  // Jobs not yet on a plate cover their dish too.
  for (const [oi, job] of Object.entries(jobs)) if (job && !plates.some((p) => p.where === 'held' && p.o === Number(oi)) && want[job.dish]) want[job.dish]--;
  return { svc, tiles, want, plates };
}

/** Prepared `part`s that exist or are on their way (raw on its station or in paws; raw left on a counter doesn't count). */
function supply(S, part) {
  const raw = RAW_FOR[part];
  let n = 0;
  for (const x of S.tiles) {
    const k = x.t.item?.k;
    if (k === part || (raw && k === raw && x.t.k !== 'counter')) n++;
  }
  for (const o of S.svc.otters) {
    if (o.hold && !o.hold.plate && (o.hold.k === part || (raw && o.hold.k === raw))) n++;
    // An otter already on its way to the crate counts too, or both otters fetch the same salmon.
    if (raw && !o.hold)
      for (const g of [o.goal, ...o.queue]) {
        const t = g && S.svc.grid[g.r * COLS + g.c];
        if (t?.k === 'crate' && t.ing === raw) n++;
      }
  }
  return n;
}

/**
 * The dish the most impatient customer is waiting for that nobody is making yet; with `can(dish)`, the
 * first such dish that can be made now (its parts are ready, coming, or this otter can prep them), so an
 * otter in the split kitchen doesn't wait on cucumber that isn't coming while tuna sits on the pass.
 */
function nextDish(st, S, can = null) {
  const left = { ...S.want };
  const cus = S.svc.customers.filter((c) => c.phase === 'wait' || c.phase === 'eat' || c.phase === 'walk').sort((a, b) => a.pat - b.pat);
  let first = null;
  for (const cu of cus)
    for (const d of cu.order) {
      if ((left[d] || 0) <= 0) continue;
      if (!can || can(d)) return d;
      first ??= d;
    }
  return can ? null : first;
}

function decide(st, oi, { rand, skill, jobs, mine = [0, 1], fumbles = true }) {
  const svc = st.svc;
  const o = svc.otters[oi];
  const other = 1 - oi;
  const H = o.hold;
  // Stations a person has queued for their otter are theirs: a helper never races them there.
  const claimed = new Set();
  for (const x of svc.otters) if (!mine.includes(x.i)) for (const g of [x.goal, ...x.queue]) if (g) claimed.add(`${g.c},${g.r}`);
  const reach = ([c, r]) => E.canReach(svc, oi, c, r) && !claimed.has(`${c},${r}`);
  const partnerReach = ([c, r]) => E.canReach(svc, other, c, r);
  const S = survey(st, jobs);
  const at = (pred) => S.tiles.filter((x) => pred(x.t, x)).map((x) => [x.c, x.r]);
  const nearest = (list) => list.filter(reach).sort((a, b) => dist(o, a) - dist(o, b))[0] || null;
  const split = svc.layout === 'split';
  const counter = () => nearest(at((t, x) => t.k === 'counter' && !t.item && (!split || partnerReach([x.c, x.r]))));
  const canAssemble = (i) => ['plates', 'dock', 'cooker'].every((k) => at((t) => t.k === k).some(([c, r]) => E.canReach(svc, i, c, r)));
  const iAssemble = canAssemble(oi);

  // Sources of a part that this otter can get to right now.
  const sourceOf = (part) => {
    if (part === 'rice') return nearest(at((t) => t.k === 'cooker' && t.servings > 0 && !(t.cook > 0)));
    const crate = part === 'nori' ? nearest(at((t) => t.k === 'crate' && t.ing === 'nori')) : null;
    return nearest(at((t) => t.item?.k === part && !t.item.plate && t.k !== 'dock')) || crate;
  };
  // Can this otter prep `part` from scratch (reach the crate and a free station)?
  const canPrep = (part) => {
    const raw = RAW_FOR[part];
    if (!raw) return false;
    return !!nearest(at((t) => t.k === 'crate' && t.ing === raw)) && !!nearest(at((t) => t.k === PREP[raw].at && !t.item));
  };

  if (fumbles && rand() < (1 - skill) * 0.05) {
    const any = at((t) => t.k !== 'floor').filter(reach);
    return any[Math.floor(rand() * any.length)] || null;
  }

  // ── holding a plate ──
  if (H?.plate) {
    const mine = S.plates.find((p) => p.plate === H);
    if (!mine.target) return nearest(at((t) => t.k === 'bin'));
    if (!mine.missing.length) {
      const dock = nearest(at((t) => t.k === 'dock'));
      if (dock) return E.tileAt(svc, ...dock).item ? null : dock;
      return counter();
    }
    for (const part of mine.missing) {
      const src = sourceOf(part);
      if (src) return src;
    }
    // Waiting on parts: if one has no supply and this otter could prep it, set the plate down and go.
    if (mine.missing.some((part) => RAW_FOR[part] && supply(S, part) === 0 && canPrep(part))) return counter();
    if (mine.missing.includes('rice') && at((t) => t.k === 'cooker' && t.servings <= 0 && !(t.cook > 0)).some(reach)) return counter();
    return null;
  }

  // ── holding something else ──
  if (H) {
    const k = H.k;
    if (k.endsWith('_b')) return nearest(at((t) => t.k === 'bin'));
    if (PREP[k]) {
      const station = nearest(at((t) => t.k === PREP[k].at && !t.item));
      if (station) return station;
      // The station is busy: wait if it's working, else set this down so its finished part can be moved.
      if (at((t) => t.k === PREP[k].at && t.item && PREP[t.item.k]).some(reach)) return null;
      return counter() || nearest(at((t) => t.k === 'bin'));
    }
    const plate = S.plates.find((p) => p.where !== 'held' && p.where !== 'dock' && p.missing?.includes(k) && reach([p.c, p.r]));
    if (plate) return [plate.c, plate.r];
    const job = jobs[oi];
    if (iAssemble && job && DISHES[job.dish].parts.includes(k)) return nearest(at((t) => t.k === 'plates'));
    if (iAssemble && !job) {
      const d = nextDish(st, S);
      if (d && DISHES[d].parts.includes(k)) {
        jobs[oi] = { dish: d };
        return nearest(at((t) => t.k === 'plates'));
      }
    }
    return counter() || nearest(at((t) => t.k === 'bin'));
  }

  // ── empty paws ──
  const dry = nearest(at((t) => t.k === 'cooker' && t.servings <= 0 && !(t.cook > 0)));
  if (dry) return dry;
  const burnt = nearest(at((t) => t.item?.k?.endsWith('_b')));
  if (burnt) return burnt;
  const toSlice = nearest(at((t) => t.k === 'board' && t.item && PREP[t.item.k]?.at === 'board'));
  if (toSlice) return toSlice;
  const ready = S.plates.find((p) => p.where === 'counter' && p.target && !p.missing.length && reach([p.c, p.r]) && at((t) => t.k === 'dock').some(reach));
  if (ready) return [ready.c, ready.r];
  // A finished part sitting on the only free kind of station while raw things queue for it: clear it.
  for (const kind of ['board', 'pan', 'fryer']) {
    if (at((t) => t.k === kind && !t.item).length) continue;
    const queued = svc.otters.some((x) => x.hold && PREP[x.hold.k]?.at === kind) || at((t) => t.k === 'counter' && PREP[t.item?.k]?.at === kind).length;
    const blocked = nearest(at((t) => t.k === kind && t.item && !PREP[t.item.k]));
    if (blocked && queued && (counter() || iAssemble)) return blocked;
  }

  // Raw things set down on a counter go to their station.
  const rawHere = nearest(at((t) => t.k === 'counter' && t.item && PREP[t.item.k] && at((s) => s.k === PREP[t.item.k].at && !s.item).some(reach)));
  if (rawHere) return rawHere;

  // A dish can be made now if each prepared part is ready, on its way, or this otter can prep it.
  const makeable = (d) =>
    DISHES[d].parts.every((part) => {
      if (part === 'nori') return !!sourceOf('nori') || supply(S, 'nori') > 0;
      return !RAW_FOR[part] || supply(S, part) > 0 || canPrep(part);
    });
  if (iAssemble) {
    let job = jobs[oi];
    if (job && !(S.want[job.dish] >= 0)) job = null;
    // Stuck on a dish that can't be made yet while another can: switch.
    if (job && !makeable(job.dish)) {
      const other = nextDish(st, S, makeable);
      if (other) job = jobs[oi] = { dish: other };
    }
    if (!job) {
      // Finish a plate someone set down before starting a new one.
      const parked = S.plates.find((p) => p.where === 'counter' && p.target && reach([p.c, p.r]) && p.missing.every((part) => sourceOf(part)));
      if (parked) {
        jobs[oi] = { dish: parked.target };
        return [parked.c, parked.r];
      }
      const d = nextDish(st, S, makeable) || nextDish(st, S);
      if (d) job = jobs[oi] = { dish: d };
    }
    if (job) {
      const parts = DISHES[job.dish].parts;
      // Prep what nobody has started.
      for (const part of parts) if (RAW_FOR[part] && supply(S, part) === 0 && canPrep(part)) return nearest(at((t) => t.k === 'crate' && t.ing === RAW_FOR[part]));
      // Everything is ready or coming: fetch a plate and gather.
      if (parts.every((part) => !RAW_FOR[part] || supply(S, part) > 0) && parts.every((part) => sourceOf(part) || RAW_FOR[part] || part === 'rice' || !split)) return nearest(at((t) => t.k === 'plates'));
    }
  } else delete jobs[oi];

  // Supply: prep or pass what the jobs and the queue need that isn't coming yet.
  const need = {};
  const add = (part, n = 1) => (need[part] = (need[part] || 0) + n);
  for (const job of Object.values(jobs)) if (job) for (const part of DISHES[job.dish].parts) add(part);
  for (const p of S.plates) for (const part of p.missing) add(part);
  const ahead = nextDish(st, S);
  if (ahead) for (const part of DISHES[ahead].parts) add(part);
  for (const part of Object.keys(need)) {
    if (part === 'rice') continue;
    if (part === 'nori') {
      // Nori lives on one side of the split kitchen: pass a sheet over if the assembler can't reach it.
      const noriFar = split && !at((t) => t.k === 'crate' && t.ing === 'nori').some(partnerReach);
      if (noriFar && canAssemble(other) && supply(S, 'nori') < 1) return nearest(at((t) => t.k === 'crate' && t.ing === 'nori'));
      continue;
    }
    if (supply(S, part) >= need[part]) continue;
    const raw = RAW_FOR[part];
    const crate = nearest(at((t) => t.k === 'crate' && t.ing === raw));
    if (crate && (nearest(at((t) => t.k === PREP[raw].at && !t.item)) || !at((t) => t.k === PREP[raw].at).some(reach))) return crate;
  }
  // Prepared parts this side can't use but the assembler can't reach: carry them to the pass.
  if (split && !iAssemble) {
    const stranded = nearest(at((t, x) => (t.k === 'board' || t.k === 'pan' || t.k === 'fryer') && t.item && !PREP[t.item.k] && !t.item.k.endsWith('_b') && !partnerReach([x.c, x.r])));
    if (stranded && counter()) return stranded;
  }
  // Cooked things about to burn: take them off.
  const cooked = nearest(at((t) => (t.k === 'pan' || t.k === 'fryer') && t.item && !PREP[t.item.k] && !t.item.k.endsWith('_b') && t.item.cook > 7));
  if (cooked && counter()) return cooked;
  return null;
}

/** Play a whole night with the bot (the simulator's inner loop). Returns the night's history entry. */
export function playNight(st, bot, dt = 1 / 30) {
  while (st.phase === 'service') {
    bot.tick(st, dt);
    E.step(st, dt);
  }
  return st.history[st.history.length - 1];
}
