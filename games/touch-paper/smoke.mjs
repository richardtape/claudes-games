// Scripted play-through run by `npm run check` (scripts/check.mjs), at desktop and phone size.
// Drives the real UI with clicks, taps and keys; uses window.__game only to set up state.
export default async function smoke(page, { log, shot, audit, phone }) {
  const game = (fn, arg) => page.evaluate(fn, arg);
  const fail = (msg) => {
    throw new Error(msg);
  };
  // Wait for entrance animations so shots don't catch half-faded panels.
  const settle = () =>
    page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, { timeout: 4000 }).catch(() => {});
  const tap = async (sel) => {
    const el = await page.waitForSelector(sel, { timeout: 5000 });
    await el.scrollIntoViewIfNeeded();
    if (phone) {
      const b = await el.boundingBox();
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    } else await el.click();
  };
  const screen = (name) => page.waitForFunction((n) => window.__game.ui.screen === n, name, { timeout: 8000 });

  await page.waitForSelector('.title-logo');
  await settle();
  await shot('title');
  await audit('title');

  // Start a display with a fixed seed, animations on, and play the opening by hand.
  await game(() => window.__game.newShow('SMOKE-7'));
  await screen('play');
  await page.waitForFunction(() => !document.querySelector('.intro'), null, { timeout: 4000 });
  await shot('play-start');
  await audit('play-start');

  // Make the first open card playable, then tap it: it must join the volley.
  const slot = await game(() => window.__game.fuseFor());
  await tap(`[data-slot="${slot}"]`);
  const v1 = await game(() => window.__game.state.volley.length);
  if (v1 !== 1) fail(`tapping a playable card did not load a shell (volley ${v1})`);
  // Play on with the bot for a few moves through the real handlers.
  for (let i = 0; i < 6; i++) await game(() => window.__game.botMove(0.9));
  await shot('play-volley');
  await audit('play-volley');

  // Strike a hand card that doesn't follow the fuse: the volley must go up.
  const k = await game(() => {
    const g = window.__game;
    const fits = new Set(g.engine.legalHandPlays(g.state));
    return [0, 1, 2].find((i) => !fits.has(i) && i < g.engine.hand(g.state).length) ?? -1;
  });
  if (k >= 0) {
    const before = await game(() => window.__game.state.log.length);
    const hadVolley = await game(() => window.__game.state.volley.length > 0);
    await tap(`[data-hand="${k}"]`);
    const after = await game(() => window.__game.state.log.length);
    if (hadVolley && after !== before + 1) fail('striking a hand card did not fire the volley');
    // let the show go up for a moment, then shoot it
    await page.waitForTimeout(1200);
    await shot('fireworks');
    log(`struck hand card ${k}; volleys fired ${after}`);
  }

  // Keyboard: a number key plays the first glowing card.
  if (!phone) {
    await game(() => window.__game.fuseFor());
    const n0 = await game(() => window.__game.state.seq);
    await page.keyboard.press('1');
    const n1 = await game(() => window.__game.state.seq);
    if (n1 !== n0 + 1) fail('key 1 did not play a card');
  }

  // Help and the Pattern Book.
  await tap('[data-action="help"]');
  await page.waitForSelector('.modal.help');
  await settle();
  await shot('help');
  await audit('help');
  await tap('.modal .close');
  await tap('[data-action="book"]');
  await page.waitForSelector('.modal.book');
  await settle();
  await shot('book');
  await audit('book');
  await tap('.modal .close');

  // Clear the act: the finale fires and the report shows.
  await game(() => window.__game.skipAnimations(true));
  await game(() => window.__game.finishAct(true));
  await screen('report');
  await settle();
  await shot('report');
  await audit('report');
  const rep = await game(() => window.__game.state.report);
  if (!rep.cleared || !rep.passed) fail(`expected a cleared, passed act: ${JSON.stringify(rep)}`);
  await tap('[data-action="to-shed"]');
  await screen('shed');
  await settle();
  await shot('shed');
  await audit('shed');
  const offers = await game(() => window.__game.state.offers.length);
  if (offers !== 3) fail(`the shed offered ${offers} perks`);
  await tap('[data-action="perk"]');
  await screen('play');
  const act = await game(() => window.__game.state.act);
  if (act !== 1) fail(`picking a perk did not start act 2 (act ${act})`);
  await settle();
  await shot('act-2');
  await audit('act-2');

  // Fall short: the crowd goes home and the programme shows.
  await game(() => window.__game.finishAct(false));
  await screen('report');
  await settle();
  await shot('report-fail');
  await tap('[data-action="to-end"]');
  await screen('end');
  await page.waitForTimeout(400);
  await shot('end');
  await audit('end');
  const phase = await game(() => window.__game.state.phase);
  if (phase !== 'over') fail(`expected the show to be over, got ${phase}`);
  await tap('[data-action="title"]');
  await screen('title');
  await game(() => window.__game.skipAnimations(false));
  log('title → play → strike → help/book → report → shed → act 2 → end OK');
}
