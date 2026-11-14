// Scripted play-through run by `npm run check` (scripts/check.mjs), at desktop and phone size.
// Real clicks, keys and drags drive the UI; window.__game sets up state on the manual clock, so
// nothing here depends on timing or on the date (every run is started from a fixed seed).
export default async function smoke(page, { log, shot, audit, phone }) {
  const game = (fn, arg) => page.evaluate(fn, arg);
  const fail = (msg) => { throw new Error(msg); };
  const screen = (name) => page.waitForFunction((n) => window.__game.ui.screen === n, name, { timeout: 8000 });
  const settle = () => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, { timeout: 4000 }).catch(() => {});
  const tap = async (sel) => {
    const el = await page.waitForSelector(sel, { timeout: 5000 });
    if (phone) { const b = await el.boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); } else await el.click();
  };
  const inView = (sel) => game((s) => {
    const el = document.querySelector(s);
    if (!el) return `${s} is missing`;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 ? '' : `${s} is outside the screen (${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)})`;
  }, sel);

  await page.waitForSelector('.title-card');
  await game(() => { window.__game.loop.manual = true; window.__game.skipAnimations(true); window.__game.advance(0.5); });
  await shot('title');
  await audit('title');
  for (const sel of ['.go', '[data-action=daily]', '[data-action=atlas]']) { const bad = await inView(sel); if (bad) fail(`title: ${bad}`); }

  // help and atlas
  await tap('[data-action=help]');
  await page.waitForSelector('.modal-card');
  await shot('help');
  await audit('help');
  await tap('.modal-card [data-action=close]');
  await tap('[data-action=atlas]');
  await page.waitForSelector('.atlas');
  await shot('atlas-empty');
  await audit('atlas');
  await page.keyboard.press('Escape');
  if (await game(() => !document.getElementById('modal').hidden)) fail('Escape did not close the atlas');

  // a locked cell cannot start a culture
  await tap('[data-id=neutro]');
  if (!(await game(() => document.querySelector('.go').disabled))) fail('a locked cell could be started');
  await tap('[data-id=macro]');

  // start through the real button, then restart from a fixed seed
  await tap('.go');
  await screen('play');
  await game(() => { window.__game.start({ seed: 4242 }); window.__game.advance(0.2); });
  await shot('play-start');
  await audit('play-start');
  if (!(await game(() => document.getElementById('coach').classList.contains('show')))) fail('the first tip did not show');

  // swim: keyboard, then a drag on the slide
  const x0 = await game(() => window.__game.state.p.x);
  await page.keyboard.down('d');
  await game(() => window.__game.advance(1));
  await page.keyboard.up('d');
  const x1 = await game(() => window.__game.state.p.x);
  if (!(x1 > x0 + 100)) fail(`holding D did not swim right (${x0} to ${x1})`);
  const vp = page.viewportSize();
  await page.mouse.move(vp.width / 2, vp.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(vp.width / 2, vp.height * 0.6 - 90, { steps: 4 });
  await game(() => window.__game.advance(1));
  const y1 = await game(() => window.__game.state.p.y);
  if (!(await game(() => document.getElementById('stick').classList.contains('on')))) fail('the stick did not show while dragging');
  await page.mouse.up();
  if (!(y1 < -100)) fail(`dragging up did not swim up (y ${y1})`);
  if (await game(() => !window.__game.meta.coach.move)) fail('the swim tip did not clear after swimming');

  // engulf a tagged germ by swimming over it
  const g0 = await game(() => {
    const g = window.__game;
    g.state.enemies.length = 0;
    const e = g.spawn('yeast', 70, 0);
    e.mark = 9; e.spd = 0;
    return g.state.stats.gulps;
  });
  await page.keyboard.down('ArrowRight');
  await game(() => window.__game.advance(0.6));
  await page.keyboard.up('ArrowRight');
  const g1 = await game(() => window.__game.state.stats.gulps);
  if (g1 !== g0 + 1) fail(`swimming over a tagged germ did not engulf it (${g0} to ${g1})`);

  // level up: three slides, pick one with a real click
  await game(() => { window.__game.levelUp(); window.__game.advance(0.1); });
  await screen('levelup');
  await settle();
  await shot('levelup');
  await audit('levelup');
  const offers = await game(() => window.__game.state.offers.length);
  if (offers !== 3) fail(`expected three slides, got ${offers}`);
  for (let i = 0; i < 3; i++) { const bad = await inView(`.pick[data-i="${i}"]`); if (bad) fail(`level-up: ${bad}`); }
  await page.waitForTimeout(420); // the pick guard (real time)
  const before = await game(() => JSON.stringify([window.__game.state.weapons, window.__game.state.organelles]));
  await tap('.pick[data-i="1"]');
  await screen('play');
  if ((await game(() => JSON.stringify([window.__game.state.weapons, window.__game.state.organelles]))) === before) fail('picking a slide changed nothing');

  // the Burst: fill it, fire it with the real control
  await game(() => { const g = window.__game; g.give('charge'); for (let i = 0; i < 8; i++) g.spawn('coccus', 80 + i * 14, (i - 4) * 20); g.advance(0.05); });
  if (!(await game(() => document.getElementById('burst').classList.contains('ready')))) fail('a full Burst did not show as ready');
  if (phone) await tap('#burst'); else await page.keyboard.press('Space');
  await game(() => window.__game.advance(0.12));
  if (!(await game(() => window.__game.state.rings.some((r) => r.burst)))) fail('the Burst did not fire');
  await shot('burst');
  if ((await game(() => window.__game.state.p.burst)) !== 0) fail('the Burst did not empty its meter');

  // a boss arrives: bar and banner
  await game(() => { const g = window.__game; g.boss(1); g.advance(0.4); });
  if (await game(() => document.getElementById('boss').hidden)) fail('no boss bar');
  await shot('boss');
  await audit('boss');

  // a crowded minute with the bot, upgrades and all (fixed seed, manual clock)
  await game(() => { const g = window.__game; g.start({ seed: 777 }); g.autopilot(true, 0.9); });
  for (let i = 0; i < 12; i++) await game(() => window.__game.advance(10));
  const mid = await game(() => ({ t: window.__game.state.t, n: window.__game.state.enemies.length, lvl: window.__game.state.p.lvl, over: window.__game.state.over, scr: window.__game.ui.screen }));
  log(`bot at ${Math.round(mid.t)} s: level ${mid.lvl}, ${mid.n} germs${mid.over ? `, ${mid.over}` : ''}`);
  if (!mid.over && mid.lvl < 5) fail(`two minutes of bot play only reached level ${mid.lvl}`);
  await game(() => window.__game.autopilot(false));
  if (!mid.over) {
    await shot('crowd');
    await audit('crowd');
    for (const sel of ['#burst', '[data-action=pause]', '.hp', '#time', '#wave']) { const bad = await inView(sel); if (bad) fail(`play: ${bad}`); }
    const clash = await game(() => {
      const a = document.getElementById('burst').getBoundingClientRect(), b = document.getElementById('build').getBoundingClientRect();
      return b.width > 0 && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    });
    if (clash) fail('the build chips sit under the Burst button');
  } else await game(() => { window.__game.start({ seed: 778 }); window.__game.advance(1); });

  // pause, save and leave, carry on
  await tap('[data-action=pause]');
  await screen('pause');
  await settle();
  await shot('pause');
  await audit('pause');
  const tPause = await game(() => window.__game.state.t);
  await tap('[data-action=quit]');
  await screen('title');
  await page.waitForSelector('[data-action=resume]');
  await shot('title-resume');
  await tap('[data-action=resume]');
  await page.waitForFunction(() => ['play', 'levelup'].includes(window.__game.ui.screen), null, { timeout: 5000 });
  const tBack = await game(() => window.__game.state.t);
  if (Math.abs(tBack - tPause) > 0.01) fail(`the saved run came back at ${tBack}, not ${tPause}`);
  if (await game(() => window.__game.ui.screen === 'levelup')) await game(() => window.__game.pick(0, true));

  // swallow a boss whole
  await game(() => {
    const g = window.__game;
    g.skipAnimations(false);
    g.state.enemies.length = 0;
    g.state.p.hp = g.state.p.mhp;
    const b = g.boss(0, true);
    b.x = g.state.p.x + 60; b.y = g.state.p.y;
    g.advance(0.3);
  });
  if ((await game(() => window.__game.state.stats.bossGulps)) !== 1) fail('a weak boss was not engulfed on touch');
  await shot('boss-gulp');
  await game(() => { window.__game.skipAnimations(true); window.__game.advance(1); if (window.__game.ui.screen === 'levelup') window.__game.pick(0, true); });

  // lose
  await game(() => { window.__game.lose(); window.__game.advance(0.5); });
  await screen('report');
  await settle();
  await shot('report-lost');
  await audit('report-lost');
  if (!(await page.textContent('.report-text h2')).includes('culture won')) fail('the lost report has the wrong heading');
  if (!(await game(() => !!window.__game.meta.cells.neutro))) fail('beating the Biofilm did not unlock the Neutrophil');
  if (await game(() => !!JSON.parse(localStorage.getItem('cg:big-eater:run') || 'null'))) fail('a finished run left its save behind');
  for (const sel of ['.report-card .go', '#plate']) { const bad = await inView(sel); if (bad && !phone) fail(`report: ${bad}`); }

  // again, and win
  await page.waitForTimeout(520);
  await tap('.report-card .go');
  await screen('play');
  await game(() => { const g = window.__game; g.win(); g.give('weapon', 'cytokine'); g.advance(3); });
  await screen('report');
  await settle();
  await shot('report-won');
  await audit('report-won');
  if (!(await page.textContent('.report-text h2')).includes('cleared')) fail('the won report has the wrong heading');
  const m = await game(() => ({ strainMax: window.__game.meta.strainMax, dendri: !!window.__game.meta.cells.dendri, wins: window.__game.meta.wins }));
  if (m.strainMax !== 1 || !m.dendri || m.wins !== 1) fail(`winning did not unlock strain 2 and the Dendritic cell (${JSON.stringify(m)})`);

  await tap('[data-action=title]');
  await screen('title');
  await tap('[data-id=dendri]');
  await tap('[data-action=strain][data-d="1"]');
  await game(() => window.__game.advance(0.3));
  await shot('title-unlocked');
  await audit('title-unlocked');
  await tap('[data-action=atlas]');
  await page.waitForSelector('.atlas');
  await shot('atlas');
  await page.keyboard.press('Escape');

  // today's culture starts with the day's cell
  await tap('[data-action=daily]');
  await screen('play');
  if (!(await game(() => !!window.__game.state.daily))) fail("today's culture did not start a daily run");
  log('title, help, atlas, play, level-up, burst, boss, pause, resume, boss gulp, both reports, unlocks and the daily all OK');
}
