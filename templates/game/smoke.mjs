// Scripted play-through, run by `npm run check` (scripts/check.mjs) in headless Chrome.
// Set up state with window.__game helpers, drive the real UI with page.click/page.keyboard,
// and call shot()/audit() on every distinct screen (start, play, pause, game over...).
// Throw an Error to fail the check.
export default async function smoke(page, { log, shot, audit }) {
  // If this smoke plays a daily seed, pin the date so it can't drift (see CLAUDE.md, Testing):
  // await page.clock.setFixedTime(new Date('2026-10-24T12:00:00'));
  await shot('start');
  await audit('start');

  // Example: start playing and confirm the game reacted.
  // await page.keyboard.press('Space');
  // await page.waitForFunction(() => window.__game.state.playing, null, { timeout: 3000 });
  // await shot('playing');

  log('start screen OK');
}
