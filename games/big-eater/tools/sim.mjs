// Plays whole runs headless with the bot and reports what the numbers do.
//   node games/big-eater/tools/sim.mjs [--runs 20] [--skill 0.4,0.7,0.95] [--cell macro] [--strain 0]
//        [--only antibody]  (start weapon forced and only that weapon offered: one-variable probes)
// Columns: win% | mean time survived | level at the end | level at each boss | share of kills that
// were gulps | bursts worth of charge | peak germs on the slide | ms per run.
import { BOSS_TIMES, CELLS, WEAPONS, fmtTime } from '../js/data.js';
import { createBot } from '../js/bot.js';
import { apply, choose, createRun, step } from '../js/engine.js';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? def : process.argv[i + 1];
};
const runs = +arg('runs', 12);
const skills = String(arg('skill', '0.4,0.7,0.95')).split(',').map(Number);
const cells = String(arg('cell', 'macro')).split(',');
const strain = +arg('strain', 0);
const only = arg('only', null);
const verbose = process.argv.includes('--verbose');

export function playRun({ seed, skill, cell, strain = 0, only = null, maxT = 620 }) {
  const s = createRun({ seed, cell, strain });
  if (only && s.weapons[0].id !== only) { s.weapons.length = 0; apply(s, { type: 'weapon', id: only }); }
  const bot = createBot({ skill, seed: seed + 7 });
  const lvAt = [];
  let peak = 0;
  let hpLow = 1;
  while (!s.over && s.t < maxT) {
    if (s.offers) {
      if (only) {
        const i = s.offers.findIndex((o) => o.type !== 'weapon' || o.id === only);
        choose(s, i < 0 ? 0 : i);
        if (i < 0) { s.weapons = s.weapons.filter((w) => w.id === only); }
      } else choose(s, bot.pick(s));
      continue;
    }
    step(s, bot.input(s));
    s.events.length = 0;
    if (s.enemies.length > peak) peak = s.enemies.length;
    hpLow = Math.min(hpLow, s.p.hp / s.p.mhp);
    for (let i = 0; i < BOSS_TIMES.length; i++) if (lvAt[i] === undefined && s.t >= BOSS_TIMES[i]) lvAt[i] = s.p.lvl;
  }
  return { s, lvAt, peak, hpLow };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const cell of cells)
    for (const skill of skills) {
      const t0 = Date.now();
      let wins = 0, time = 0, lvl = 0, gulps = 0, kills = 0, peak = 0;
      const lv = [0, 0, 0], lvN = [0, 0, 0];
      const dmg = {};
      const deaths = [];
      const bosses = [0, 0, 0];
      for (let i = 0; i < runs; i++) {
        const { s, lvAt, peak: pk } = playRun({ seed: 1000 + i * 7919, skill, cell, strain, only });
        if (s.over === 'won') wins++;
        else deaths.push(s.over ? fmtTime(s.t) : 'timed out');
        time += s.t; lvl += s.p.lvl; gulps += s.stats.gulps; kills += s.stats.kills; peak = Math.max(peak, pk);
        lvAt.forEach((l, j) => { lv[j] += l; lvN[j]++; });
        s.stats.bosses.forEach((_, j) => bosses[j]++);
        for (const [k, v] of Object.entries(s.stats.dmgBy)) dmg[k] = (dmg[k] || 0) + v;
        if (verbose) console.log(`  seed ${i}: ${s.over} ${fmtTime(s.t)} lvl ${s.p.lvl} kills ${s.stats.kills} gulps ${s.stats.gulps} build ${s.weapons.map((w) => w.id + (w.evo ? '*' : w.lvl)).join(' ')} | ${s.organelles.map((o) => o.id + o.lvl).join(' ')}`);
      }
      const tot = Object.values(dmg).reduce((a, b) => a + b, 0) || 1;
      const share = Object.entries(dmg).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((v / tot) * 100)}%`).join(', ');
      console.log(
        `${CELLS[cell].name.padEnd(11)} skill ${skill} strain ${strain}${only ? ` only ${WEAPONS[only].name}` : ''}: win ${Math.round((wins / runs) * 100)}% | time ${fmtTime(time / runs)} | lvl ${(lvl / runs).toFixed(1)} | lvl@boss ${lv.map((l, j) => (lvN[j] ? (l / lvN[j]).toFixed(1) : '-')).join('/')} | bosses down ${bosses.join('/')} | gulps ${Math.round((gulps / kills) * 100)}% of ${Math.round(kills / runs)} kills | peak ${peak} | ${Math.round((Date.now() - t0) / runs)} ms/run`,
      );
      console.log(`   damage: ${share}`);
      if (deaths.length) console.log(`   not won: ${deaths.join(', ')}`);
    }
}
