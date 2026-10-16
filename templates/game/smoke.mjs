// Scripted play-through, run by `npm run check` (scripts/check.mjs) in headless Chrome.
// Set up state with window.__game helpers, drive the real UI with page.click/page.keyboard,
// and call shot()/audit() on every distinct screen (start, play, pause, game over...).
// Throw an Error to fail the check.
export default async function smoke(page, { log, shot, audit }) {
  await shot('start');
  await audit('start');

  // Example: start playing and confirm the game reacted.
  // await page.keyboard.press('Space');
  // await page.waitForFunction(() => window.__game.state.playing, null, { timeout: 3000 });
  // await shot('playing');

  log('start screen OK');
}
