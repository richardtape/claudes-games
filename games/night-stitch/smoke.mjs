// Scripted play-through run by `npm run check` (see scripts/check.mjs).
// Drives the real UI (clicks, keys, pointer moves) and uses window.__game to set up state.
export default async function smoke(page, { log, shot, audit }) {
  const game = (fn, arg) => page.evaluate(fn, arg);
  const fail = (msg) => {
    throw new Error(msg);
  };
  const screen = () => game(() => window.__game.ui.screen);
  const waitScreen = (name, timeout = 5000) =>
    page.waitForFunction((n) => window.__game.ui.screen === n, name, { timeout });

  await page.waitForTimeout(800); // let the title demo stitch a little
  await shot('title');
  await audit('title');

  // How to play and the specimen case from the title.
  await page.click('[data-action=help]');
  await shot('help');
  await audit('help');
  await page.keyboard.press('Escape');
  await page.click('[data-action=case]');
  await shot('case');
  await audit('case');
  await page.click('.modal-card [data-action=close-modal]');

  // Start tonight's pattern and steer with the real pointer handler.
  await page.click('[data-action=start-daily]');
  if ((await screen()) !== 'play') fail('daily button did not start a night');
  const box = await page.$eval('#stage', (c) => {
    const s = getComputedStyle(document.documentElement);
    return { cx: parseFloat(s.getPropertyValue('--hoop-cx')), cy: parseFloat(s.getPropertyValue('--hoop-cy')), r: parseFloat(s.getPropertyValue('--hoop-r')) / 1.08 };
  });
  // A settled moth at the centre, then a real mouse circle around it.
  // Frozen so it can't finish its hole and leave while a slow emulated mouse goes round.
  await game(() => window.__game.spawn('clothes', 0, 0, { settled: true, frozen: true }));
  const pts = [];
  const rr = box.r * 0.26;
  for (let i = 0; i <= 64; i++) pts.push([box.cx + Math.cos((i / 56) * Math.PI * 2) * rr, box.cy + Math.sin((i / 56) * Math.PI * 2) * rr]);
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.waitForTimeout(400);
  for (const [x, y] of pts) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(500);
  const caught = await game(() => window.__game.state.stats.caught.clothes || 0);
  if (caught < 1) fail('a mouse loop around a settled moth did not catch it');
  log(`mouse loop caught ${caught} moth(s), score ${await game(() => window.__game.state.score)}`);

  // A bigger catch for the screenshot.
  await game(() => {
    const g = window.__game;
    ['clothes', 'house', 'clothes', 'clothes', 'house'].forEach((k, i) => g.spawn(k, -150 + Math.cos(i * 1.3) * 40, 120 + Math.sin(i * 1.3) * 40, { settled: true }));
    g.loopAround(-150, 120, 115);
  });
  await page.waitForTimeout(250);
  await shot('cinch');
  await page.waitForTimeout(900);
  await shot('play');
  await audit('play');

  // Pause and resume with the keyboard.
  await page.keyboard.press('p');
  if ((await screen()) !== 'paused') fail('P did not pause');
  await shot('paused');
  await audit('paused');
  await page.keyboard.press('p');
  if ((await screen()) !== 'play') fail('P did not resume');

  // Arrow keys steer the needle.
  const x0 = await game(() => window.__game.state.needle.x);
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(350);
  await page.keyboard.up('ArrowLeft');
  const x1 = await game(() => window.__game.state.needle.x);
  if (!(x1 < x0 - 30)) fail(`ArrowLeft should move the needle left (${x0.toFixed(0)} -> ${x1.toFixed(0)})`);

  // The chime and a notion pick.
  await game(() => window.__game.endHour());
  await waitScreen('notion');
  await page.waitForTimeout(450);
  await shot('notion');
  await audit('notion');
  const offer = await game(() => window.__game.state.offers[0]);
  await page.keyboard.press('1');
  const after = await game(() => ({ hour: window.__game.state.hour, has: window.__game.state.notions }));
  if (after.hour !== 1 || !after.has[offer]) fail(`notion pick failed: ${JSON.stringify(after)}`);
  log(`took ${offer} at the chime`);

  // Midnight's boss shows its tally.
  await game(() => {
    const g = window.__game;
    g.setHour(2);
    g.spawn('atlas', 60, -40, { frozen: true });
    g.loopAround(60, -40, 125);
  });
  await page.waitForTimeout(400);
  await shot('boss');
  const hp = await game(() => window.__game.state.moths.find((m) => m.kind === 'atlas')?.hp);
  if (hp !== 2) fail(`a loop around the Atlas moth should leave 2 of 3, got ${hp}`);

  // Tear the linen: the night ends.
  await game(() => window.__game.tear());
  await waitScreen('over');
  await page.waitForTimeout(300);
  await shot('torn');
  await audit('torn');
  const head = await page.textContent('.end-card h2');
  if (!/tore/.test(head)) fail(`expected a torn ending, got "${head}"`);

  // Stitch again, then reach dawn.
  await page.click('[data-action=again]');
  if ((await screen()) !== 'play') fail('Stitch again did not start a night');
  await game(() => window.__game.dawn());
  await waitScreen('dawn', 8000);
  await page.waitForTimeout(300);
  await shot('dawn');
  await audit('dawn');
  log('torn and dawn endings OK');

  await page.click('[data-action=title]');
  if ((await screen()) !== 'title') fail('Title button did not return to the title');
}
