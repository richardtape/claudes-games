// A human-ish pilot for the simulator and the title-screen demo. `skill` 0..1 sets how often
// it re-decides, how noisy its steering is and how sensibly it picks upgrades.
import { DROP_R, WEAPONS } from './data.js';
import { PR, edible } from './engine.js';

export function createBot({ skill = 0.7, seed = 1 } = {}) {
  let r = seed >>> 0 || 1;
  const rand = () => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296);
  let wait = 0;
  let cur = { mx: 0, my: 0 };
  const DIRS = 16;

  function steer(s) {
    const p = s.p;
    const threats = [];
    const food = [];
    let nearest = null, nd = 1e9;
    for (const e of s.enemies) {
      const dx = e.x - p.x, dy = e.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (edible(s, e)) { if (d2 < 330 * 330 && food.length < 14) food.push(e); continue; }
      if (d2 < nd) { nd = d2; nearest = e; }
      if (d2 < 170 * 170 || e.boss) threats.push(e);
    }
    const hpFrac = p.hp / p.mhp;
    const fear = 0.55 + (1 - hpFrac) * 1.8 + (1 - skill) * 0.3;
    let best = -1e9, bx = 0, by = 0;
    for (let i = 0; i <= DIRS; i++) {
      const a = (i / DIRS) * Math.PI * 2;
      const ux = i === DIRS ? 0 : Math.cos(a), uy = i === DIRS ? 0 : Math.sin(a);
      const qx = p.x + ux * 48, qy = p.y + uy * 48;
      let sc = 0;
      for (const e of threats) {
        const w = e.boss ? 3 : e.elite ? 1.6 : 1;
        // where it will be in a moment, roughly
        const ex = e.x + e.fx * e.spd * 0.3, ey = e.y + e.fy * e.spd * 0.3;
        const d = Math.hypot(qx - ex, qy - ey) - e.r - PR;
        const reach = e.boss ? 150 : 80;
        if (d < reach) sc -= (w * fear * (reach - d) ** 2) / reach / 6;
        if (e.ai === 'charger' && e.st > 0) {
          // stay off the line of the charge
          const along = (qx - e.x) * e.fx + (qy - e.y) * e.fy;
          const off = Math.abs((qx - e.x) * -e.fy + (qy - e.y) * e.fx);
          if (along > -40 && along < 520 && off < 110) sc -= (110 - off) * 0.5 * (4 + skill * 6);
        }
      }
      for (const b of s.toxins) {
        const tx = b.x + b.vx * 0.35, ty = b.y + b.vy * 0.35;
        const d = Math.hypot(qx - tx, qy - ty) - PR;
        if (d < 70) sc -= ((70 - d) ** 2 / 70 / 5) * fear;
      }
      for (const e of food) sc += (e.boss ? 30 : e.elite ? 8 : 3) / (1 + Math.hypot(qx - e.x, qy - e.y) / 60);
      let motes = 0;
      for (const m of s.motes) {
        if (m.mag) continue;
        const d = Math.hypot(qx - m.x, qy - m.y);
        if (d < 360 && motes++ < 60) sc += (1.1 * Math.min(4, m.v)) / (1 + d / 70);
      }
      for (const d of s.drops) sc += ((d.kind === 'sugar' ? 8 * (1.2 - hpFrac) : 4)) / (1 + Math.hypot(qx - d.x, qy - d.y) / 80);
      // nothing in reach of the weapons: go and find trouble
      if (nearest && nd > 200 * 200) sc += ((ux * (nearest.x - p.x) + uy * (nearest.y - p.y)) / Math.sqrt(nd)) * 1.5;
      const out = Math.hypot(qx, qy) - (DROP_R - 260);
      if (out > 0) sc -= out * 0.05;
      sc += (rand() - 0.5) * (1 - skill) * 3.5;
      // a little momentum, so it doesn't jitter
      sc += (ux * cur.mx + uy * cur.my) * 0.3;
      if (sc > best) { best = sc; bx = ux; by = uy; }
    }
    cur = { mx: bx, my: by };
  }

  return {
    input(s) {
      if (--wait <= 0) {
        wait = Math.round(3 + (1 - skill) * 14);
        steer(s);
      }
      let burst = false;
      if (s.p.burst >= s.mods.burstNeed) {
        let n = 0;
        for (const e of s.enemies) if ((e.x - s.p.x) ** 2 + (e.y - s.p.y) ** 2 < 260 * 260) n += e.boss ? 10 : 1;
        burst = n >= 10 || s.p.hp < s.p.mhp * 0.3;
      }
      return { mx: cur.mx, my: cur.my, burst };
    },
    /** Which offer to take. */
    pick(s) {
      const o = s.offers;
      if (rand() > 0.35 + skill * 0.6) return Math.floor(rand() * o.length);
      const val = (x) => {
        if (x.type === 'evo') return 100;
        if (x.type === 'weapon') return x.lvl === 1 ? (s.weapons.length < 3 ? 9 : 5) : 7 + (x.lvl === 6 ? 1 : 0);
        if (x.type === 'organelle') {
          const partner = s.weapons.some((w) => WEAPONS[w.id].evo.with === x.id);
          return (x.lvl === 1 && partner ? 8 : 5) + (x.id === 'ribosome' || x.id === 'mito' ? 1 : 0);
        }
        return 1;
      };
      let bi = 0;
      for (let i = 1; i < o.length; i++) if (val(o[i]) + rand() > val(o[bi]) + rand()) bi = i;
      return bi;
    },
  };
}
