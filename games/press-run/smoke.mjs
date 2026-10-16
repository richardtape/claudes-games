// Scripted play-through run by `npm run check` (see scripts/check.mjs).
// Drives the real UI with the keyboard and uses window.__game only to set up state.
export default async function smoke(page, { log, shot, audit }) {
  const game = (fn, arg) => page.evaluate(fn, arg);
  const idle = () => page.waitForFunction(() => !window.__game.ui.busy, null, { timeout: 10000 });
  const fail = (msg) => {
    throw new Error(msg);
  };

  await shot('title');
  await game(() => window.__game.newRun('SMOKE-0001'));
  await shot('starter');
  await audit('starter');
  await page.click('[data-action=starter]');
  if ((await game(() => window.__game.run.phase)) !== 'round') fail('starter did not start a round');

  // Type a word with the Qu tile and print it.
  await game(() => window.__game.setHand('quartzes'));
  await page.keyboard.type('quartz');
  await shot('round');
  await audit('round');
  const verdict = await page.textContent('#verdict');
  if (!/is a word/.test(verdict)) fail(`QUARTZ not accepted: "${verdict}"`);
  await page.keyboard.press('Enter');
  await idle();
  const words = await game(() => window.__game.run.stats.words.map((w) => w.word));
  if (words[0] !== 'quartz') fail(`expected quartz printed, got ${words}`);
  log(`printed QUARTZ for ${await game(() => window.__game.run.stats.words[0].score)}`);

  // Redraw two tiles.
  if ((await game(() => window.__game.run.phase)) === 'round') {
    const before = await game(() => window.__game.run.round.redrawsLeft);
    await page.click('#hand .tile');
    await page.click('#hand .tile');
    await page.keyboard.press('Shift+Enter');
    const after = await game(() => window.__game.run.round.redrawsLeft);
    if (after !== before - 1) fail('redraw did not spend a redraw');
  }

  // Clear the round, collect, buy something, move on.
  await game(() => window.__game.winRound());
  await page.click('[data-action=collect]');
  if ((await game(() => window.__game.run.phase)) !== 'shop') fail('collect did not open the Foundry');
  await game(() => window.__game.cash(50));
  await shot('shop');
  await audit('shop');
  const bought = await page.$('[data-action=buy]:not([disabled])');
  if (bought) {
    await bought.click();
    if (await page.$('[data-action=pick-tile]')) {
      await shot('pick-tiles');
      await page.click('[data-action=pick-tile]');
      await page.click('[data-action=confirm-pick]');
    }
  }
  await page.click('[data-action=leave-shop]');
  if ((await game(() => window.__game.run.phase)) !== 'round') fail('leaving the Foundry did not start a round');
  log('shop and next round OK');

  // Lose on purpose and check the run-over screen appears.
  await game(() => {
    window.__game.run.round.printsLeft = 1;
    window.__game.setHand('catsdogs');
  });
  await page.keyboard.type('cats');
  await page.keyboard.press('Enter');
  await idle();
  await page.waitForSelector('text=The presses stopped', { timeout: 5000 });
  await shot('run-over');
  await audit('run-over');
  log('run-over screen OK');
}
