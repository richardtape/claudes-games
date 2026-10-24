// Scripted play-through for `npm run check`: every screen solo (title, help, the Regulars book, the
// morning, the coached first dish played with real clicks on the canvas, the Rush, pause, closing
// time, the market, a split-kitchen night, the end of the week), then `duo`: two pages joined over
// BroadcastChannel play a night together. The loop runs on the manual clock so nothing depends on
// timing.

const ready = (page) => page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 10000 });
const screenIs = (page, s, timeout = 5000) => page.waitForFunction((s) => document.getElementById('app').dataset.screen === s, s, { timeout });
const settle = (page) => page.waitForTimeout(450); // entrance animations (0.35 s)

/** Click a kitchen tile on the canvas the way a player would. */
async function clickTile(page, c, r) {
  const p = await page.evaluate(([c, r]) => window.__game.tilePoint(c, r), [c, r]);
  await page.mouse.click(p.x, p.y);
}
async function clickStation(page, k, ing) {
  const t = await page.evaluate(([k, ing]) => window.__game.findTile(k, ing), [k, ing]);
  if (!t) throw new Error(`no ${k} ${ing || ''} in the kitchen`);
  await clickTile(page, t.c, t.r);
}
const advance = (page, s) => page.evaluate((s) => window.__game.advance(s), s);

export default async function smoke(page, { log, shot, audit, phone }) {
  await ready(page);
  await page.evaluate(() => {
    window.__game.loop.manual = true;
    window.__game.skipAnimations(true);
  });
  await settle(page);
  await shot('title');
  await audit('title');

  await page.click('[data-action=help]');
  await page.waitForSelector('.modal');
  await shot('help');
  await audit('help');
  await page.click('.modal .close');
  await page.click('#panel [data-action=album]');
  await page.waitForSelector('.album');
  await shot('regulars');
  await audit('regulars');
  await page.click('.modal .close');

  await page.click('#panel [data-action=together]');
  await page.waitForSelector('#code-in');
  await settle(page);
  await shot('together');
  await audit('together');
  await page.click('#panel [data-action=back]');

  // A solo week: Monday morning, then the coached first dish with real clicks.
  await page.evaluate(() => localStorage.clear());
  await page.click('#panel [data-action=solo]');
  await page.waitForSelector('#panel [data-action=soloBoth]');
  await settle(page);
  await shot('solo-choice');
  await audit('solo-choice');
  await page.click('#panel [data-action=soloBoth]');
  await screenIs(page, 'morning');
  await settle(page);
  await shot('monday-morning');
  await audit('monday-morning');
  await page.click('#panel [data-action=ready]');
  await screenIs(page, 'service');
  await advance(page, 0.5);
  await shot('service-coach');
  await audit('service');
  if ((await page.evaluate(() => window.__game.coachStep())) !== 0) throw new Error('the coach should start on a first week');
  // Salmon crate, board (slice), plates, board (add), rice, dock: the coach's six steps.
  for (const [k, ing, secs] of [
    ['crate', 'salmon', 1.2],
    ['board', null, 3],
    ['plates', null, 1.2],
    ['board', null, 1.2],
    ['cooker', null, 1.2],
    ['dock', null, 3],
  ]) {
    await clickStation(page, k, ing);
    await advance(page, secs);
  }
  const step = await page.evaluate(() => window.__game.coachStep());
  if (step < 6) throw new Error(`the coached dish stalled at step ${step}`);
  if (!(await page.evaluate(() => window.__game.state.events.some((e) => e.type === 'load' && e.dish === 'salmon_nigiri')))) throw new Error('the first dish never sailed');
  log('first dish made with real clicks; the coach followed');

  // Pause and resume with the keyboard.
  await page.keyboard.press('p');
  await page.waitForSelector('#pause:not([hidden])');
  await shot('paused');
  await audit('paused');
  await page.keyboard.press('p');
  await page.waitForSelector('#pause', { state: 'hidden' });

  // A busy night under the bot, to see the Rush and a full bar.
  await page.evaluate(() => {
    const g = window.__game;
    g.soloNight({ night: 2, menu: ['salmon_nigiri', 'tuna_nigiri', 'kappa_maki', 'ebi'], ups: { board2: true }, bot: true, skill: 0.95 });
    g.fastForward(40);
  });
  await advance(page, 0.2);
  await shot('busy-night');
  await audit('busy-night');

  // The reading aids: the menu board (wide screens only), the glow on where Pebble's salmon goes,
  // a tick for a plate already sailing to someone, and a tapped bubble showing its recipe.
  await page.evaluate(() => {
    const g = window.__game;
    g.botPlay(false);
    const st = g.state;
    const svc = st.svc;
    st.sel = 0;
    Object.assign(svc.otters[0], { hold: { k: 'salmon' }, queue: [], goal: null, act: null, path: [] });
    for (const t of svc.grid) if (t.k === 'board') t.item = null;
    let cu = svc.customers.find((c) => c.phase === 'wait' && c.seat >= 0);
    if (!cu) {
      cu = { id: svc.nextId++, sp: 'seal', seat: svc.seats.indexOf(null), phase: 'wait', t: 0, order: [], ate: [], pat: 60, patMax: 60, huff: false };
      svc.seats[cu.seat] = cu.id;
      svc.customers.push(cu);
    }
    cu.order.push('salmon_nigiri');
    cu.pat = cu.patMax;
    Object.assign(svc.rafts.find((r) => !r.plate), { plate: { plate: true, parts: ['rice', 'salmon_s'] }, laps: 0 });
  });
  await advance(page, 1 / 60);
  const aids = await page.evaluate(() => window.__game.aids());
  if (aids.board !== !phone) throw new Error(`the menu board should ${phone ? 'not ' : ''}show (${JSON.stringify(aids)})`);
  if (aids.glow < 1) throw new Error(`nothing glows for raw salmon in Pebble's paws (${JSON.stringify(aids)})`);
  if (aids.ticks < 1 || aids.bubbles < 1) throw new Error(`no tick for the sailing salmon nigiri (${JSON.stringify(aids)})`);
  const bubble = await page.evaluate(() => window.__game.bubblePoint(0));
  await page.mouse.click(bubble.x, bubble.y);
  await advance(page, 1 / 60);
  const recipe = await page.evaluate(() => window.__game.aids().recipe);
  if (recipe !== bubble.dish) throw new Error(`tapping the ${bubble.dish} bubble showed ${recipe}`);
  await page.waitForTimeout(400); // the tap ripples fade; the recipe slip stays 2.8 s
  await shot('reading-aids');
  await audit('reading-aids');
  log(`reading aids: ${phone ? 'no board on a phone' : 'menu board'}, ${aids.glow} glowing, ${aids.ticks} ticked, a tapped bubble showed its recipe`);
  // Enough in the purse that rent is paid and the week goes on.
  await page.evaluate(() => {
    window.__game.state.purse = 200;
    window.__game.closeNow();
  });
  await screenIs(page, 'closed');
  await settle(page);
  await page.waitForSelector('.stamp.down');
  await shot('closing-time');
  await audit('closing-time');

  // On to the market: buy something, then the split kitchen.
  await page.click('#panel [data-action=ready]');
  await screenIs(page, 'morning');
  await page.evaluate(() => window.__game.setPurse(80));
  await settle(page);
  const offers = await page.$$('#panel [data-action=buy]:not([disabled])');
  if (!offers.length) throw new Error('nothing to buy with 80 coins');
  await offers[0].click();
  await page.waitForSelector('.offer.bought');
  await shot('market');
  await audit('market');
  await page.evaluate(() => {
    const st = window.__game.state;
    st.twists[st.night] = 'split';
  });
  await page.click('#panel [data-action=ready]');
  await screenIs(page, 'service');
  await advance(page, 2.5);
  if ((await page.evaluate(() => window.__game.state.svc.layout)) !== 'split') throw new Error('expected the split kitchen');
  // In solo, a tap on the far side goes to the otter who can reach it.
  await clickStation(page, 'dock');
  await advance(page, 0.1);
  const who = await page.evaluate(() => window.__game.state.events.filter((e) => e.type === 'tap').at(-1)?.o);
  if (who !== 1) throw new Error(`the dock tap went to otter ${who}, not Kelp`);
  await shot('split-kitchen');
  await audit('split-kitchen');

  // A night the purse can't pay for ends the week.
  await page.evaluate(() => {
    const g = window.__game;
    g.state.purse = 0;
    g.state.svc.takings = 0;
    g.closeNow();
  });
  await screenIs(page, 'closed');
  await page.waitForSelector('.stamp.closed.down');
  await page.click('#panel [data-action=ready]');
  await screenIs(page, 'over');
  await settle(page);
  await shot('week-over');
  await audit('week-over');
  await page.click('#panel [data-action=quit]');
  await screenIs(page, 'title');
  log(`solo week played through every screen${phone ? ' (phone)' : ''}`);

  // Solo with a computer Kelp: the player runs Pebble, and Kelp gets on with dishes by itself.
  await page.click('#panel [data-action=solo]');
  await page.click('#panel [data-action=soloHelper]');
  await screenIs(page, 'morning');
  await page.click('#panel [data-action=ready]');
  await screenIs(page, 'service');
  await page.evaluate(() => {
    const svc = window.__game.state.svc;
    svc.arrivals = [{ at: 0, sp: 'seal', order: ['salmon_nigiri'] }];
  });
  // A first-time player is still being coached: Kelp leaves the first dish to them.
  await advance(page, 4);
  if (await page.evaluate(() => window.__game.coachStep() !== null && window.__game.state.events.some((e) => e.o === 1 && e.type === 'do'))) throw new Error('the computer Kelp cooked during the coached dish');
  await page.evaluate(() => (window.__game.game.coach = null));
  await advance(page, 14);
  const kelp = await page.evaluate(() => window.__game.state.events.filter((e) => e.o === 1 && (e.type === 'do' || e.type === 'slice')).length);
  if (kelp < 3) throw new Error(`the computer Kelp did ${kelp} things in 14 s`);
  await clickStation(page, 'cooker');
  await advance(page, 0.1);
  if ((await page.evaluate(() => window.__game.state.events.filter((e) => e.type === 'tap').at(-1)?.o)) !== 0) throw new Error('a player tap went to the computer Kelp');
  await shot('computer-kelp');
  await page.keyboard.press('p');
  await page.click('#pause [data-action=quit]');
  await screenIs(page, 'title');
  log('the computer Kelp cooks by itself and the player’s taps stay with Pebble');
  await page.evaluate(() => localStorage.clear());
}

/** Two players: Pebble hosts, Kelp joins with the code, and they play a night together. */
export async function duo([host, guest], { url, log, shot, audit, live = false }) {
  // npm run check joins two tabs over BroadcastChannel; verify-live runs this again with { live: true }
  // in two browsers through the public relays, where connecting takes longer.
  const T = live ? 45000 : 8000;
  const at = (token, hash = '') => (live ? `${url}${hash}` : `${url}?net=local&token=${token}${hash}`);
  await host.goto(at('host-token'));
  await ready(host);
  await host.evaluate(() => {
    localStorage.clear();
    window.__game.skipAnimations(true);
  });
  await host.click('#panel [data-action=together]');
  await host.click('#panel [data-action=host]');
  await host.waitForSelector('.lobby .code');
  const code = (await host.textContent('.lobby .code')).trim();
  await shot('host-lobby', host);
  await audit('host-lobby', host);

  await guest.goto(at('guest-token', `#join=${code}`));
  await ready(guest);
  await guest.evaluate(() => window.__game.skipAnimations(true));
  await guest.waitForFunction(() => window.__game.game.net?.status === 'welcome', null, { timeout: T });
  await host.waitForSelector('[data-action=startWeek]:not([disabled])', { timeout: T });
  await shot('guest-lobby', guest);
  await host.click('[data-action=startWeek]');
  await screenIs(host, 'morning', T);
  await screenIs(guest, 'morning', T);
  await settle(guest);
  await shot('guest-morning', guest);
  await audit('guest-morning', guest);

  // Both must press: the host alone waits.
  await host.click('#panel [data-action=ready]');
  await host.waitForSelector('#panel .btn.waiting', { timeout: T });
  if ((await host.evaluate(() => window.__game.state.phase)) !== 'morning') throw new Error('the night opened before Kelp was ready');
  await guest.click('#panel [data-action=ready]');
  await screenIs(host, 'service', T);
  await screenIs(guest, 'service', T);
  log('both players readied up and the night opened on both phones');

  // Kelp taps the plates and the rice cooker on the guest's own canvas; the host's engine moves Kelp.
  await guest.waitForFunction(() => window.__game.state?.svc, null, { timeout: T });
  await clickStation(guest, 'plates');
  await host.waitForFunction(() => {
    const o = window.__game.state.svc.otters[1];
    return o.queue.length || o.goal || o.path.length || o.hold;
  }, null, { timeout: T });
  await clickStation(guest, 'cooker');
  await host.waitForFunction(() => window.__game.state.svc.otters[1].hold?.parts?.includes('rice'), null, { timeout: T });
  await guest.waitForFunction(() => window.__game.state.svc.otters[1].hold?.parts?.includes('rice'), null, { timeout: T });
  // Pebble's otter never moved for Kelp's taps.
  if (await host.evaluate(() => window.__game.state.events.some((e) => e.type === 'tap' && e.o === 0))) throw new Error('a guest tap moved Pebble');
  await shot('host-service', host);
  await shot('guest-service', guest);
  await audit('guest-service', guest);
  log('Kelp’s taps on the guest phone drove Kelp in the host’s kitchen');

  // Kelp hides the tab: the night pauses for both.
  await guest.evaluate(() => window.__game.game.net.session.hidden(true));
  await host.waitForSelector('#pause:not([hidden])', { timeout: T });
  const t0 = await host.evaluate(() => window.__game.state.svc.t);
  await host.waitForTimeout(400);
  if ((await host.evaluate(() => window.__game.state.svc.t)) !== t0) throw new Error('the night ran on while Kelp was away');
  await guest.evaluate(() => window.__game.game.net.session.hidden(false));
  await host.waitForSelector('#pause', { state: 'hidden', timeout: T });

  // Kelp reloads mid-night and gets Kelp back.
  await guest.reload();
  await ready(guest);
  await guest.waitForFunction(() => window.__game.game.net?.status === 'welcome' && window.__game.game.me === 1, null, { timeout: T });
  await screenIs(guest, 'service', T);
  log('a guest reload got Kelp back');

  // Closing time on both (with rent covered); both ready for the morning.
  await host.evaluate(() => {
    window.__game.state.purse = 100;
    window.__game.closeNow();
  });
  await screenIs(host, 'closed', T);
  await screenIs(guest, 'closed', T);
  await settle(guest);
  await shot('guest-closing', guest);
  await audit('guest-closing', guest);
  await guest.click('#panel [data-action=ready]');
  await host.click('#panel [data-action=ready]');
  await screenIs(host, 'morning', T);
  await screenIs(guest, 'morning', T);
  log('closing time and the next morning reached both phones');
  await host.evaluate(() => localStorage.clear());
}
