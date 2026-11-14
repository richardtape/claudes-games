import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBot } from '../js/bot.js';
import { BOSS_TIMES, CELLS, GERMS, ORGANELLES, WEAPONS, WEAPON_SLOTS, ORGANELLE_SLOTS, xpFor } from '../js/data.js';
import { apply, choose, createRun, debugSpawn, edible, nextWave, reroll, step, wepStat } from '../js/engine.js';

const play = (s, seconds, input = {}) => { for (let i = 0; i < seconds * 60 && !s.over; i++) { if (s.offers) choose(s, 0); step(s, input); } };

test('same seed, same inputs: the same run', () => {
  const run = () => {
    const s = createRun({ seed: 99 });
    const bot = createBot({ skill: 0.8, seed: 3 });
    for (let i = 0; i < 60 * 40; i++) { if (s.offers) choose(s, bot.pick(s)); step(s, bot.input(s)); s.events.length = 0; }
    return JSON.stringify(s);
  };
  assert.equal(run(), run());
});

test('a run survives JSON (a save) and carries on identically', () => {
  const a = createRun({ seed: 5 });
  const botA = createBot({ skill: 0.8, seed: 3 });
  for (let i = 0; i < 60 * 20; i++) { if (a.offers) choose(a, 0); step(a, botA.input(a)); a.events.length = 0; }
  const b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 600; i++) { for (const s of [a, b]) { if (s.offers) choose(s, 0); step(s, { mx: 1, my: 0 }); s.events.length = 0; } }
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('every cell starts with its weapon and company on the slide', () => {
  for (const [id, c] of Object.entries(CELLS)) {
    const s = createRun({ seed: 1, cell: id });
    assert.equal(s.weapons[0].id, c.weapon);
    assert.equal(s.p.hp, c.hp);
    assert.ok(s.enemies.length >= 10);
  }
});

test('the level curve always climbs', () => {
  for (let l = 1; l < 60; l++) assert.ok(xpFor(l + 1) > xpFor(l));
});

test('a tagged or weakened germ is edible; touching it engulfs, heals and charges', () => {
  const s = createRun({ seed: 2 });
  s.enemies.length = 0;
  s.weapons.length = 0;
  const e = debugSpawn(s, 'yeast', 300, 0);
  assert.equal(edible(s, e), false);
  e.hp = e.mhp * 0.3;
  assert.equal(edible(s, e), true);
  e.hp = e.mhp; e.mark = 3;
  assert.equal(edible(s, e), true);
  e.x = 20; e.y = 0;
  s.p.hp = 50;
  step(s, {});
  assert.equal(s.stats.gulps, 1);
  assert.ok(s.p.hp > 50);
  assert.equal(s.p.burst, 1);
  assert.ok(s.p.xp > 0);
  assert.ok(!s.enemies.includes(e));
});

test('a healthy germ hurts on touch, and not twice in the same instant', () => {
  const s = createRun({ seed: 2 });
  s.enemies.length = 0; s.weapons.length = 0;
  debugSpawn(s, 'coccus', 5, 0); debugSpawn(s, 'coccus', -5, 0);
  step(s, {});
  const lost = 100 - s.p.hp;
  assert.ok(lost > 0 && lost < 12, `one hit, not two (lost ${lost})`);
});

test('a boss can only be engulfed under a tenth of its health, and the Superbug ends the run', () => {
  const s = createRun({ seed: 2 });
  s.enemies.length = 0; s.weapons.length = 0;
  const b = debugSpawn(s, 'superbug', 300, 0);
  b.mark = 5;
  assert.equal(edible(s, b), false);
  b.hp = b.mhp * 0.09;
  assert.equal(edible(s, b), true);
  b.x = 30;
  step(s, {});
  assert.equal(s.over, 'won');
  assert.equal(s.stats.bossGulps, 1);
});

test('stain bonuses: Lysozyme doubles on violet, Complement on pink', () => {
  const dmg = (wid, kind) => {
    const s = createRun({ seed: 3 });
    s.enemies.length = 0; s.weapons.length = 0;
    apply(s, { type: 'weapon', id: wid });
    const e = debugSpawn(s, kind, 80, 0);
    e.hp = e.mhp = 100000; e.spd = 0;
    for (let i = 0; i < 240; i++) step(s, {});
    return 100000 - e.hp;
  };
  assert.ok(dmg('complement', 'bacillus') > dmg('complement', 'coccus') * 1.6);
  assert.ok(dmg('lysozyme', 'coccus') > dmg('lysozyme', 'bacillus') * 1.6);
});

test('every weapon does damage on its own, at level 1, level 6 and evolved', () => {
  for (const id of Object.keys(WEAPONS)) {
    for (const mode of ['one', 'six', 'evo']) {
      const s = createRun({ seed: 4 });
      s.enemies.length = 0; s.weapons.length = 0;
      for (let i = 0; i < (mode === 'one' ? 1 : 6); i++) apply(s, { type: 'weapon', id });
      if (mode === 'evo') { apply(s, { type: 'organelle', id: WEAPONS[id].evo.with }); apply(s, { type: 'evo', id }); }
      for (let i = 0; i < 8; i++) { const e = debugSpawn(s, 'spore', 60 + i * 8, (i - 4) * 14); e.hp = e.mhp = 1e6; }
      // swim in a circle so the wake weapon lays down and germs follow
      for (let i = 0; i < 360; i++) step(s, { mx: Math.cos(i / 20), my: Math.sin(i / 20) });
      assert.ok((s.stats.dmgBy[id] || 0) > 0, `${id} (${mode}) did nothing`);
      assert.ok(Number.isFinite(wepStat(s.weapons[0], 'dmg') ?? wepStat(s.weapons[0], 'dps')));
    }
  }
});

test('level-ups offer distinct, valid choices and respect the slots', () => {
  const s = createRun({ seed: 6 });
  const bot = createBot({ skill: 0.5, seed: 9 });
  let seenEvo = false;
  for (let n = 0; n < 70; n++) {
    s.p.xp = s.p.need;
    step(s, {});
    assert.ok(s.offers && s.offers.length === 3, 'three offers');
    const keys = s.offers.map((o) => `${o.type}:${o.id}`);
    assert.equal(new Set(keys).size, keys.length, 'no duplicate offers');
    for (const o of s.offers) {
      if (o.type === 'weapon') assert.ok(o.lvl >= 1 && o.lvl <= 6);
      if (o.type === 'organelle') assert.ok(o.lvl <= ORGANELLES[o.id].max);
      if (o.type === 'evo') seenEvo = true;
    }
    const evo = s.offers.findIndex((o) => o.type === 'evo');
    choose(s, evo >= 0 ? evo : bot.pick(s));
    assert.equal(s.offers, null);
    assert.ok(s.weapons.length <= WEAPON_SLOTS && s.organelles.length <= ORGANELLE_SLOTS);
    s.enemies.length = 0; s.p.hp = s.p.mhp;
  }
  assert.ok(seenEvo, 'an evolution was offered once a weapon was maxed with its partner');
  assert.ok(s.weapons.every((w) => w.lvl === 6));
});

test('reroll swaps the offers and runs out', () => {
  const s = createRun({ seed: 6 });
  s.p.xp = s.p.need; step(s, {});
  assert.ok(reroll(s)); assert.ok(reroll(s)); assert.equal(reroll(s), false);
  assert.equal(s.offers.length, 3);
});

test('the Dendritic cell is offered four', () => {
  const s = createRun({ seed: 6, cell: 'dendri' });
  s.p.xp = s.p.need; step(s, {});
  assert.equal(s.offers.length, 4);
});

test('bosses arrive on the clock and the HUD announces them', () => {
  const s = createRun({ seed: 8 });
  s.weapons.length = 0;
  s.t = BOSS_TIMES[0] - 10;
  assert.deepEqual([nextWave(s).k, nextWave(s).boss], ['biofilm', true]);
  s.p.hp = s.p.mhp = 1e9;
  for (let i = 0; i < 60 * 11; i++) step(s, {});
  assert.ok(s.enemies.some((e) => e.k === 'biofilm'));
});

test('the wave schedule opens with staph, then E. coli, and introduces each germ on time', () => {
  const s = createRun({ seed: 12 });
  assert.equal(s.schedule[0], 'coccus');
  assert.equal(s.schedule[1], 'bacillus');
  for (const [k, g] of Object.entries(GERMS)) if (g.from > 25 && g.from < 1e6) assert.equal(s.schedule[g.from / 25], k);
  for (let i = 1; i < s.schedule.length; i++) assert.notEqual(s.schedule[i], s.schedule[i - 1]);
});

test('the Burst needs a full meter, empties it, tags germs and clears toxin', () => {
  const s = createRun({ seed: 2 });
  s.enemies.length = 0; s.weapons.length = 0;
  const e = debugSpawn(s, 'spore', 150, 0);
  step(s, { burst: true });
  assert.equal(s.rings.length, 0);
  s.p.burst = s.mods.burstNeed;
  s.toxins.push({ x: 300, y: 0, vx: 0, vy: 0, r: 6, dmg: 5, life: 5 });
  step(s, { burst: true });
  assert.equal(s.p.burst, 0);
  assert.equal(s.toxins.length, 0);
  for (let i = 0; i < 30; i++) step(s, {});
  assert.ok(e.mark > 0 && e.hp < e.mhp);
});

test('germs left far behind come back round, so running in a line is no escape', () => {
  const s = createRun({ seed: 2 });
  s.weapons.length = 0;
  s.p.hp = s.p.mhp = 1e9;
  for (let i = 0; i < 60 * 20; i++) step(s, { mx: 1, my: 0 });
  const far = s.enemies.filter((e) => Math.hypot(e.x - s.p.x, e.y - s.p.y) > 800).length;
  assert.equal(far, 0);
});

test('event ids are plain data and the list never grows without bound', () => {
  const s = createRun({ seed: 2 });
  play(s, 60, { mx: 0.5, my: 0.2 });
  assert.ok(s.events.length <= 1200);
});

test('a bot-played run reaches an end and its numbers stay finite', () => {
  const s = createRun({ seed: 31 });
  const bot = createBot({ skill: 0.7, seed: 3 });
  for (let i = 0; i < 60 * 700 && !s.over; i++) { if (s.offers) choose(s, bot.pick(s)); step(s, bot.input(s)); s.events.length = 0; }
  assert.ok(Number.isFinite(s.p.x) && Number.isFinite(s.p.hp) && Number.isFinite(s.p.xp));
  for (const e of s.enemies) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.hp));
  assert.ok(s.stats.kills > 200);
});
