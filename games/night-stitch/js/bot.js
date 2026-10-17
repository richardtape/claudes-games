// A stand-in player: picks the most valuable circle it can close with the thread it has,
// walks to its edge and traces it. Used by tools/sim.mjs for balancing and by the title
// screen as a live demo. `skill` 0..1 sets drawing speed, reaction time and aim.
import { SPECIES, HOOP_R } from './data.js';
import { createRng } from '../../../shared/rng.js';

export function createBot({ skill = 0.7, seed = 1 } = {}) {
  const rng = createRng(seed);
  let plan = null;
  let wait = 0.3;
  let lastLoops = 0;
  // Humans: notice, decide, move. Slower and sloppier than a solver.
  const speed = 420 + 520 * skill; // units/s while tracing
  const react = 0.3 + (1 - skill) * 0.7;
  const aimNoise = 15 + (1 - skill) * 55;
  const fumble = 0.04 + (1 - skill) * 0.22; // chance a loop falls short and must be redone

  function choose(s) {
    const maxR = (s.mods.threadLen / (2 * Math.PI)) * (0.86 + 0.06 * skill);
    const moths = s.moths.filter((m) => m.inside && m.mode !== 'crawl');
    const candidates = [...moths.map((m) => ({ x: m.x, y: m.y })), ...s.holes.map((h) => ({ x: h.x, y: h.y }))];
    let best = null;
    for (const c0 of candidates) {
      // Pull the centre inward so the circle stays inside the hoop.
      const cr = Math.hypot(c0.x, c0.y);
      const lim = HOOP_R - 20 - maxR;
      const c = cr > lim && cr > 0 ? { x: (c0.x / cr) * Math.max(0, lim), y: (c0.y / cr) * Math.max(0, lim) } : c0;
      let value = 0;
      let n = 0;
      for (const m of moths) {
        const d = Math.hypot(m.x - c.x, m.y - c.y);
        const sp = SPECIES[m.kind];
        const safe = m.mode === 'eat' ? d + sp.startle * s.mods.startle < maxR : d < maxR - 25;
        if (!safe) continue;
        n++;
        value += sp.points + (m.mode === 'eat' ? 25 : 0) + (sp.boss ? 200 : 0);
      }
      for (const h of s.holes) if (Math.hypot(h.x - c.x, h.y - c.y) < maxR - 10) value += 8 + h.r;
      value *= Math.max(1, n);
      // Weaker players misjudge which cluster is best.
      value *= 1 + rng.float(0, 1.4 * (1 - skill));
      if (!best || value > best.value) best = { c, value };
    }
    if (!best || best.value <= 0) return null;
    const c = { x: best.c.x + rng.float(-aimNoise, aimNoise), y: best.c.y + rng.float(-aimNoise, aimNoise) };
    const a0 = Math.atan2(s.needle.y - c.y, s.needle.x - c.x);
    const short = rng.chance(fumble);
    return {
      c,
      r: maxR * (0.95 - (1 - skill) * 0.1),
      a0,
      dir: rng.chance(0.5) ? 1 : -1,
      progress: 0,
      approach: true,
      end: short ? Math.PI * 2 * rng.float(0.75, 0.92) : Math.PI * 2 + 0.5,
      wob: rng.float(0, 0.12 * (1 - skill) + 0.03),
      wobP: rng.float(0, 6.28),
    };
  }

  return function think(s, dt) {
    if (s.stats.loops !== lastLoops) {
      lastLoops = s.stats.loops;
      plan = null;
      wait = react;
    }
    if (!plan) {
      wait -= dt;
      if (wait > 0) return {};
      plan = choose(s);
      if (!plan) {
        wait = 0.3;
        return {};
      }
    }
    const p = plan;
    if (p.approach) {
      const ax = p.c.x + Math.cos(p.a0) * p.r;
      const ay = p.c.y + Math.sin(p.a0) * p.r;
      if (Math.hypot(s.needle.x - ax, s.needle.y - ay) < 12) p.approach = false;
      return { target: { x: ax, y: ay } };
    }
    p.progress += (speed / p.r) * dt;
    if (p.progress > p.end) {
      plan = null;
      wait = react;
      return {};
    }
    const a = p.a0 + p.dir * p.progress;
    const rr = p.r * (1 + p.wob * Math.sin(p.progress * 2 + p.wobP));
    return { target: { x: p.c.x + Math.cos(a) * rr, y: p.c.y + Math.sin(a) * rr } };
  };
}

/** Pick a notion the way a sensible player might (sim and demo only). */
export function botPickNotion(s, rng) {
  const pref = ['spool', 'lavender', 'mushroom', 'beeswax', 'gold', 'thimble', 'wick', 'needle', 'pins', 'cedar'];
  const offers = [...s.offers].sort((a, b) => pref.indexOf(a) - pref.indexOf(b));
  return rng && rng.chance(0.35) ? rng.pick(s.offers) : offers[0];
}
