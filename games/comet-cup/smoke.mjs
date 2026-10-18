// Scripted play-through run by `npm run check` (see scripts/check.mjs), at desktop and phone
// size. Drives the real pointer, keys and buttons; window.__game settles flights on the game
// clock so nothing depends on real time.
export default async function smoke(page, { log, shot, audit, phone }) {
  const game = (fn, arg) => page.evaluate(fn, arg);
  const fail = (msg) => {
    throw new Error(msg);
  };
  const screen = () => game(() => window.__game.state.screen);
  const waitScreen = (name, timeout = 6000) => page.waitForFunction((n) => window.__game.state.screen === n, name, { timeout });
  const settle = () => game(() => window.__game.settle());
  const quiet = () => page.waitForTimeout(500); // entrance animations (0.45 s)

  // Title, with the demo flying.
  await page.waitForTimeout(1200);
  await shot('title');
  await audit('title');

  await page.click('.title-card [data-action=help]');
  await quiet();
  await shot('help');
  await audit('help');
  await page.keyboard.press('Escape');
  if (await page.$('.modal-card')) fail('Escape did not close How to play');

  // Today's course: the first plate.
  await page.click('[data-action=daily]');
  await waitScreen('play');
  await page.waitForTimeout(2400); // let the plate title fade
  await shot('plate-1');
  await audit('plate-1');

  // Aim with the real pointer: press on the plate, pull back, check the preview, let go.
  const box = await page.$eval('#stage', (c) => {
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + i * 9, box.y + i * 4);
  const aiming = await game(() => ({ set: window.__game.state.aimSet, dots: window.__game.state.preview?.length || 0, power: window.__game.state.aim.power }));
  if (!aiming.set || aiming.dots < 5) fail(`pulling back did not aim: ${JSON.stringify(aiming)}`);
  await shot('aiming');
  await page.mouse.up();
  const flying = await game(() => window.__game.hole.phase);
  if (flying !== 'fly') fail(`letting go did not launch (phase ${flying})`);
  log(`pointer launch at power ${aiming.power.toFixed(2)}`);
  await settle();
  if ((await game(() => window.__game.hole.strokes)) < 1) fail('the stroke was not counted');
  await page.waitForTimeout(300);
  await shot('after-stroke');

  // A wild shot off the plate costs a penalty and returns to the same spot.
  const before = await game(() => ({ x: window.__game.hole.x, y: window.__game.hole.y, s: window.__game.hole.strokes }));
  await game(() => window.__game.miss());
  const after = await game(() => ({ x: window.__game.hole.x, y: window.__game.hole.y, s: window.__game.hole.strokes, end: window.__game.hole.log.at(-1).end }));
  if (['burn', 'void', 'lost'].includes(after.end)) {
    if (after.s !== before.s + 2 || after.x !== before.x || after.y !== before.y) fail(`penalty rules broken: ${JSON.stringify({ before, after })}`);
    await shot('penalty');
    log(`penalty (${after.end}) returned the comet to its spot`);
  }

  // Keyboard aim and launch.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  if ((await game(() => window.__game.hole.phase)) !== 'fly') fail('Space did not launch');
  await settle();

  // Pause and resume.
  if ((await screen()) === 'play') {
    await page.keyboard.press('p');
    await quiet();
    if (!(await game(() => window.__game.state.paused))) fail('P did not pause');
    await shot('paused');
    await audit('paused');
    await page.keyboard.press('p');
    if (await game(() => window.__game.state.paused)) fail('P did not resume');
  }

  // Ace the hole the real way (aim along the ace line, launch): the drop and the card.
  if ((await screen()) === 'play') await game(() => window.__game.ace());
  await waitScreen('holed');
  await quiet();
  await shot('holed');
  await audit('holed');
  const word = await page.textContent('.holed-card .word');
  log(`plate I: ${word}`);

  // Next plate by keyboard; ace it in one and look at the result.
  await page.keyboard.press('Enter');
  await waitScreen('play');
  if ((await game(() => window.__game.state.course.index)) !== 1) fail('Enter did not move to plate II');
  await game(() => window.__game.ace());
  await waitScreen('holed');
  await quiet();
  await shot('ace');
  const ace = await page.textContent('.holed-card .word');
  if (ace !== 'Hole in one') fail(`expected a hole in one on plate II, got "${ace}"`);

  // Plate III: two strokes, then the ace line.
  await page.click('[data-action=next]');
  await waitScreen('play');
  await page.waitForTimeout(300);
  await game(() => {
    const g = window.__game;
    g.setAim(g.hole.w.cupX > g.hole.x ? Math.PI : 0, 0.15);
    g.shoot();
    g.settle();
    if (g.state.screen === 'play') g.ace();
  });
  await waitScreen('holed');
  await page.waitForTimeout(400);
  if (await page.$('[data-action=ace]')) {
    await page.click('[data-action=ace]');
    await game(() => window.__game.advance(2.5));
    await shot('ace-line');
  }

  // Finish the course and read the sheet.
  for (let i = 0; i < 9 && (await screen()) !== 'sheet'; i++) {
    await game(() => {
      const g = window.__game;
      if (g.state.screen === 'holed') g.nextHole();
      if (g.state.screen === 'play') g.ace();
    });
    await page.waitForFunction(() => ['holed', 'sheet'].includes(window.__game.state.screen), null, { timeout: 6000 });
  }
  if ((await screen()) === 'holed') await game(() => window.__game.nextHole());
  await waitScreen('sheet');
  await quiet();
  await shot('sheet');
  await audit('sheet');
  const total = await page.textContent('.sheet .big');
  log(`course finished: ${total}`);

  // Back to the title: the record shows, and there is nothing to continue.
  await page.click('.sheet [data-action=title]');
  await waitScreen('title');
  if (await page.$('[data-action=continue]')) fail('a finished course still offers Continue');
  const rec = await page.textContent('.title-card .record');
  if (!/Best round/.test(rec)) fail(`title record missing: "${rec}"`);

  // A course in progress survives a reload.
  await page.click('[data-action=random]');
  await waitScreen('play');
  await game(() => {
    const g = window.__game;
    g.setAim(0.3, 0.3);
    g.shoot();
    g.settle();
  });
  const mid = await game(() => ({ i: window.__game.state.course.index, s: window.__game.hole?.strokes, ids: window.__game.state.course.holes.map((h) => h.id).join() }));
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await page.click('[data-action=continue]');
  await waitScreen('play');
  const back = await game(() => ({ i: window.__game.state.course.index, s: window.__game.hole?.strokes, ids: window.__game.state.course.holes.map((h) => h.id).join() }));
  if (back.ids !== mid.ids || back.i !== mid.i || (mid.s !== undefined && back.s !== mid.s)) fail(`resume mismatch ${JSON.stringify({ mid, back })}`);
  log(`resumed plate ${back.i + 1} at stroke ${back.s}${phone ? ' (phone)' : ''}`);
}
