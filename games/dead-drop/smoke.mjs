// Scripted play-through run by `npm run check` (see scripts/check.mjs).
// smoke(): one page — title, rivals, a solo match (turn, escalation, round result, match
// over), pass and play, and the help sheet. duo(): two pages in one browser joined over the
// BroadcastChannel transport (?net=local) — host lobby, guest joins, a turn each, an
// escalation answered across the wire. scripts/verify-live.mjs runs duo() again on the live
// site with { live: true }, joining through the real public relays.
// Waits on game state, never on fixed sleeps.
let T = 15000;

async function until(page, fn, arg, what) {
  try {
    await page.waitForFunction(fn, arg, { timeout: T, polling: 50 });
  } catch {
    throw new Error(`timed out waiting for ${what}`);
  }
}
const idle = (page) => until(page, () => !window.__game.ui.animating, null, 'the reveal to finish');
/** Let entrance animations finish before a screenshot (endless pulses are ignored). */
const settle = (page) =>
  page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, { timeout: 4000 })
    .catch(() => {});
const snap = async (page, shot, name) => {
  await settle(page);
  await shot(name);
};

/** Pick the first playable card, the first city it can go to, and lock in, through the real UI. */
async function dropFirst(page) {
  await until(page, () => document.querySelector('.card:not([disabled])'), null, 'a playable card');
  await page.click('.card:not([disabled])');
  if (!(await page.$('.city.target'))) throw new Error('picking a card did not highlight any city');
  await page.click('.city.target .plate');
  await page.click('[data-action=lock]');
}

export default async function smoke(page, { log, shot, audit }) {
  const fail = (m) => {
    throw new Error(m);
  };
  await until(page, () => window.__game && document.querySelector('.title-screen'), null, 'the title screen');
  await snap(page, shot, 'title');
  await audit('title');

  await page.click('[data-action=rivals]');
  await page.waitForSelector('.rivals-screen');
  await snap(page, shot, 'rivals');
  await audit('rivals');
  await page.click('[data-action=rival][data-id=wren]');
  await until(page, () => window.__game.ui.screen === 'play' && document.querySelector('.hand .card'), null, 'the table');
  await snap(page, shot, 'play');
  await audit('play');

  // A real turn: drop, lock, the bot answers, the reveal plays (skipped with Space).
  await dropFirst(page);
  if (!(await page.evaluate(() => window.__game.view.round.plan))) fail('Lock in did not lock the drop');
  await until(page, () => window.__game.state.round.turn === 2 || window.__game.state.phase !== 'plan', null, 'the rival to drop');
  await page.keyboard.press('Space');
  await idle(page);
  log('turn 1 revealed');

  // Escalate through the button; the bot must answer (play on or fold).
  if (await page.$('[data-action=escalate]:not([disabled])')) {
    await page.click('[data-action=escalate]');
    await until(page, () => !window.__game.state.round.pending, null, 'the rival to answer the escalation');
    log(`escalation answered: ${await page.evaluate(() => (window.__game.state.phase === 'plan' ? 'play on' : 'fold'))}`);
  }
  await idle(page);
  await snap(page, shot, 'after-escalate');

  // Finish the round and read the result.
  await page.evaluate(() => window.__game.state.phase === 'plan' && window.__game.finishRound());
  await until(page, () => document.querySelector('.result'), null, 'the round result');
  await snap(page, shot, 'round-result');
  await audit('round-result');
  await page.keyboard.press('Enter');
  await until(page, () => window.__game.state.phase === 'plan' && window.__game.state.roundNo === 1, null, 'round 2');
  log('round 2 started');

  // Jump to the end of the match.
  await page.evaluate(() => {
    window.__game.state.scores = [9, 3];
    window.__game.state.target = 1;
    window.__game.finishRound();
  });
  await until(page, () => document.querySelector('[data-action=final]'), null, 'the final report button');
  await page.click('[data-action=final]');
  await page.waitForSelector('.over');
  await snap(page, shot, 'match-over');
  await audit('match-over');

  // Pass and play: cover, Red drops, cover, Teal drops, reveal, cover again.
  await page.click('[data-action=title]');
  await page.click('[data-action=pass]');
  await page.waitForSelector('.cover');
  await snap(page, shot, 'pass-cover');
  await audit('pass-cover');
  await page.click('[data-action=uncover]');
  await dropFirst(page);
  await until(page, () => window.__game.ui.cover?.seat === 1, null, 'the cover for Teal');
  await page.click('[data-action=uncover]');
  await snap(page, shot, 'pass-teal');
  await dropFirst(page);
  await page.keyboard.press('Space');
  await until(page, () => window.__game.ui.cover?.seat === 0 && window.__game.state.round.turn === 2, null, 'the next turn cover');
  log('pass and play turn OK');

  await page.click('[data-action=help]');
  await page.waitForSelector('.sheet');
  await snap(page, shot, 'help');
  await audit('help');
  await page.keyboard.press('Escape');
}

/** Two players: pages = [host, guest]. Local (BroadcastChannel) unless ctx.live. */
export async function duo([host, guest], { url, log, shot, audit, live = false, code = 'SMOKE7' }) {
  T = live ? 45000 : 15000;
  const local = (u, hash = '') => (live ? `${u}${hash}` : `${u}${u.includes('?') ? '&' : '?'}net=local${hash}`);
  await host.goto(local(url));
  await until(host, () => window.__game, null, 'the host page');
  await host.evaluate((c) => window.__game.startHost(c), code);
  await until(host, () => document.querySelector('.lobby .code'), null, 'the lobby');
  await shot('lobby', host);
  await audit('lobby', host);

  await guest.goto(local(url, `#join=${code}`));
  await until(host, () => window.__game.ui.screen === 'play', null, 'the host to see the guest');
  await until(guest, () => window.__game.ui.screen === 'play' && document.querySelector('.hand .card'), null, 'the guest table');
  log('guest joined');

  await dropFirst(host);
  await until(guest, () => window.__game.view.round.rivalLocked, null, 'the guest to see the host locked');
  await dropFirst(guest);
  for (const p of [host, guest]) {
    await until(p, () => window.__game.view?.round.turn === 2 && !window.__game.ui.animating, null, 'turn 2 on both screens');
  }
  await shot('duo-host', host);
  await shot('duo-guest', guest);
  await audit('duo-guest', guest);
  // The guest must never hold the host's cards.
  const owners = await guest.evaluate(() => window.__game.view.round.hand.map((c) => c.owner));
  if (owners.some((o) => o !== 1)) throw new Error(`guest hand holds a host card: ${owners}`);

  // Guest escalates; the host gets the prompt and plays on.
  await guest.click('[data-action=escalate]');
  await until(host, () => document.querySelector('.modal.hot [data-action=respond][data-accept="1"]'), null, 'the escalation prompt on the host');
  await shot('duo-escalated', host);
  await host.click('.modal.hot [data-action=respond][data-accept="1"]');
  await until(guest, () => window.__game.view.round.stake === 2, null, 'the doubled stake on the guest');
  log('escalation crossed the wire');
}
