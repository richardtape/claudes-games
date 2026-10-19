// Scripted play-through run by `npm run check` (see scripts/check.mjs).
// smoke(): one page — title, rivals, a solo match (its round title card and the First flip
// token; a turn dropped by dragging a card onto a city, whose reveal is sped up, then skipped;
// escalation; the final turn at night, with its card, stamp and dimmed reveal; round result and
// See the board, and Enter on its focused button; match over; rematch), pass and play (a turn, then
// a rematch), the help sheet's tabs, turned assets, leaving mid-reveal, the escalation flash taking
// every tap and key over the prompt, leaving over a round card or a flash, the final card
// ending by itself, the final turn under reduced motion (no card), and skipAnimations (no round
// card). Every round opens on a title card, so each step that starts one clears it first
// (clearCard).
// duo(): two pages in one browser joined over the BroadcastChannel transport (?net=local) —
// host lobby, guest joins, the host locks in while the guest's round card is still up, a turn
// each, an escalation answered across the wire (Space over the host's flash doesn't answer it),
// match over and a rematch, a guest reload during the rematch's first turn (it must not count the
// match again, and a turn that resolves behind the guest's round card must still be revealed from
// the turn-1 board), and the guest leaving.
// scripts/verify-live.mjs runs duo() again on the live site with { live: true }, joining
// through the real public relays.
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
  await shot(name, page);
};

/**
 * Every round opens on a title card, which covers the table and takes every tap. Wait until it is
 * up (or no card is showing at all), then skip it with Enter, as a player would.
 */
async function clearCard(page) {
  await until(page, () => document.querySelector('.title-card') || !window.__game.ui.card, null, 'the round title card (or none)');
  if (await page.$('.title-card')) await page.keyboard.press('Enter');
  await until(page, () => !document.querySelector('.title-card') && !window.__game.ui.card, null, 'the round title card to go');
}

/** Exactly one First flip token on the table, beside whoever holds initiative in the view on screen. */
async function checkToken(page, when) {
  const t = await page.evaluate(() => {
    const v = window.__game.view;
    const holder = v.round.initiative;
    const name = holder === 0 ? 'You' : v.names[holder];
    return { n: document.querySelectorAll('.first-flip').length, label: document.querySelector('.first-flip')?.getAttribute('aria-label'), want: `First flip: ${name}` };
  });
  if (t.n !== 1 || t.label !== t.want) throw new Error(`${when}: expected one First flip token labelled "${t.want}", got ${t.n} (${t.label})`);
  return t.want;
}

/** Pick the first playable card, the first city it can go to, and lock in, through the real UI. */
async function dropFirst(page) {
  await until(page, () => document.querySelector('.card:not([disabled])'), null, 'a playable card');
  await page.click('.card:not([disabled])');
  if (!(await page.$('.city.target'))) throw new Error('picking a card did not highlight any city');
  await page.click('.city.target .plate');
  await page.click('[data-action=lock]');
}

/**
 * The final turn plays at night. From a solo table in its planning phase with no card up,
 * toFinalTurn() jumps to turn 6 through the real update path. Its card comes up (held still for
 * the shot) and Enter skips it. The table is then dark, with the ×2 stamp on the stake in place of
 * the "at the final flip" line. A real drop follows; once both seats lock in, the reveal plays
 * with everything but the cities dimmed, and it is shot as the first city resolves. Then it is
 * sped up and skipped as in turn 1. Returns once the reveal is over (the result follows): true,
 * or false if there was nowhere to drop (the turn resolved behind the card, so no final reveal
 * could be checked).
 */
async function finalTurn(page, { log, shot, audit }) {
  const fail = (m) => {
    throw new Error(m);
  };
  // The card goes up inside toFinalTurn(), so it is held in the same step (it lasts only 1.2 s).
  // If an update was still running (a flash, which is a card too), it comes up when that ends:
  // hold it then.
  const jump = await page.evaluate(() => {
    const g = window.__game;
    g.toFinalTurn();
    const held = !!document.querySelector('.final-card');
    if (held) g.holdCard();
    return { held, open: g.state.phase === 'plan' };
  });
  if (!jump.open) {
    log('final turn: neither side could drop, so it resolved at once');
    return false;
  }
  if (!jump.held) {
    await until(page, () => window.__game.ui.card && document.querySelector('.final-card'), null, 'the final drop card');
    await page.evaluate(() => window.__game.holdCard());
  }
  if (!(await page.$('.final-card'))) fail('toFinalTurn() should put the final drop card up');
  await snap(page, shot, 'final-card');
  await audit('final-card');
  const card = await page.evaluate(() => {
    const el = document.querySelector('.final-card');
    const inView = (sel) => {
      const r = el.querySelector(sel)?.getBoundingClientRect();
      return !!r && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
    };
    return { role: el.getAttribute('role'), label: el.getAttribute('aria-label'), big: el.querySelector('.big')?.textContent.trim(), small: el.querySelector('.small')?.textContent.trim(), inView: inView('.big') && inView('.small') };
  });
  if (card.role !== 'dialog' || !card.label || !/^final drop$/i.test(card.big || '') || !/stake doubles/i.test(card.small || '') || !card.inView) fail(`the final drop card should be a dialog reading "Final drop" and "The stake doubles on the flip", all on screen: ${JSON.stringify(card)}`);
  // The rival is held while the card is up. Freeze its choice now (it locks in), so it can't fold
  // or escalate while the table is inspected.
  const canDrop = await page.evaluate(() => window.__game.view.round.legal.length > 0);
  await page.evaluate(() => window.__game.rivalLocks());
  await page.keyboard.press('Enter');
  await until(page, () => !document.querySelector('.final-card') && !window.__game.ui.card && !window.__game.ui.updating, null, 'Enter to skip the final drop card');

  const night = await page.evaluate(() => ({
    night: document.body.dataset.night,
    turn: window.__game.view.round.turn,
    stamp: document.querySelector('.stake .x2-stamp')?.textContent,
    line: !!document.querySelector('.stake small'),
  }));
  if (night.night !== '1' || night.turn !== 6 || night.stamp !== '×2' || night.line) fail(`the final turn should play at night with a ×2 stamp on the stake: ${JSON.stringify(night)}`);
  await snap(page, shot, 'final-turn');
  await audit('final-turn');
  if (!canDrop) {
    // Nowhere to drop (say Helsinki has closed, Venice is shut on even turns and the last city is
    // full): the turn resolved behind the card and has been revealed already.
    log('final turn: nowhere to drop, so there was no final reveal to check');
    return false;
  }

  // The band drops out at night: only the heartbeat (and the clock) plays, no bass. (Checked only
  // when there is somewhere to drop: the rival has locked in, so the turn stays in planning until
  // this player drops. With nowhere to drop it flipped behind the card and the music is at 'break'.)
  const fin = await page.evaluate(() => ({ ...window.__game.audio.played }));
  await until(page, (h) => window.__game.audio.played.heart > h, fin.heart, 'the final turn’s heartbeat');
  const finBass = await page.evaluate(() => window.__game.audio.played.bass);
  if (finBass !== fin.bass) fail(`the final turn should play a heartbeat with no bass: bass went ${fin.bass} -> ${finBass}`);

  await dropFirst(page);
  await until(page, () => document.querySelector('.play.revealing'), null, 'the final reveal (both locked in)');
  // Freeze the reveal the moment the first city resolves (in the same step that sees it), so a slow
  // screenshot can't let it run out before the Space presses below. A tap still speeds it up.
  await until(page, () => document.querySelector('#board .city.sweeping') && performance.now() - window.__game.ui.revealAt > 450 && window.__game.holdReveal(), null, 'the first city of the final flip to resolve');
  await snap(page, shot, 'final-reveal');
  const dim = await page.evaluate(() => {
    // Opacity compounds down the tree: multiply it up to .play.
    const op = (sel) => {
      let o = 1;
      for (let el = document.querySelector(sel); el && el !== document.body; el = el.parentElement) o *= Number(getComputedStyle(el).opacity);
      return Math.round(o * 100) / 100;
    };
    return {
      night: document.body.dataset.night,
      board: op('#board'),
      scorebar: op('.play.revealing > .scorebar'),
      hand: op('.play.revealing > .hand'),
      top: op('#top'),
      flip: op('.play.revealing > .controls > .status'),
      ticker: op('.play.revealing > .ticker'),
      tap: op('.play.revealing [data-action=reveal-tap]'),
    };
  });
  const dimmed = ['scorebar', 'hand', 'top', 'flip'].every((k) => dim[k] === 0.35);
  const lit = ['board', 'ticker', 'tap'].every((k) => dim[k] === 1);
  if (dim.night !== '1' || !dimmed || !lit) fail(`during the final reveal everything but the cities, the ticker and the Speed up control should dim to 35%: ${JSON.stringify(dim)}`);
  if (!(await page.evaluate(() => window.__game.ui.animating))) fail('the held final reveal ended before the Space presses');
  await page.keyboard.press('Space');
  if ((await page.evaluate(() => window.__game.ui.speed)) !== 3) fail('Space did not speed the final reveal up to 3x');
  await page.keyboard.press('Space');
  if ((await page.evaluate(() => window.__game.ui.skip)) !== true) fail('a second Space did not skip the final reveal');
  await idle(page);
  log('final turn at night (card skipped with Enter, ×2 stamp, the reveal dimmed all but the cities, ticker and Speed up)');
  return true;
}

/**
 * A fresh solo match taken to its final turn with toFinalTurn() (and, with `lock`, the rival locked
 * in at once, in the same step). Tried again on a new match while that turn has nowhere for you to
 * drop: Helsinki closes after turn 3, Venice is shut on even turns, and the last city can be full,
 * on both sides even, when the turn resolves at once. window.__t0 is when toFinalTurn() ran, and
 * a card record (watchCards) starts afresh with it.
 */
async function freshFinalTurn(page, { lock = false } = {}) {
  for (let tries = 0; tries < 5; tries++) {
    await page.evaluate(() => window.__game.startSolo('wren'));
    await clearCard(page);
    // A wait left over from the last table (a flash it was leaving) can still bring this round's
    // card up late: let it come and go first.
    await until(page, () => !window.__game.ui.updating && !window.__game.ui.card, null, 'the fresh table to settle');
    const open = await page.evaluate((lock) => {
      const g = window.__game;
      window.__t0 = performance.now();
      if (window.__cineWatch) window.__cines = []; // only this attempt's cards (watchCards)
      g.toFinalTurn();
      if (lock) g.rivalLocks();
      return g.state.phase === 'plan' && g.view.round.legal.length > 0;
    }, lock);
    if (open) return;
  }
  throw new Error('five fresh matches in a row reached a final turn with nowhere to drop');
}

/**
 * Record every title card (.cine) put up from now on in window.__cines: { cls, up, down }, the
 * performance.now() times it went up and came down (down stays null while it is up).
 */
const watchCards = (page) =>
  page.evaluate(() => {
    window.__cines = [];
    window.__cineWatch?.disconnect();
    const seen = new WeakMap();
    window.__cineWatch = new MutationObserver((ms) => {
      const now = performance.now();
      for (const m of ms) {
        for (const n of m.addedNodes) {
          if (!n.classList?.contains('cine')) continue;
          const rec = { cls: n.className, up: now, down: null };
          seen.set(n, rec);
          window.__cines.push(rec);
        }
        for (const n of m.removedNodes) if (seen.has(n)) seen.get(n).down = now;
      }
    });
    window.__cineWatch.observe(document.querySelector('#app'), { childList: true });
  });

/**
 * The same through real pointer input: drag the first playable card onto the first city it can
 * go to, then lock in. First two drags that end over the card's own place in the hand: the card
 * stays selected and nothing locks in. The second lifts a card that is already selected, so
 * nothing re-renders under the mouse and the browser follows the release with a click on the
 * card, which must not toggle it off. With `shot`, screenshot the drag over the city.
 */
async function dragFirst(page, { shot = null } = {}) {
  const fail = (m) => {
    throw new Error(m);
  };
  await until(page, () => document.querySelector('.card:not([disabled])'), null, 'a playable card');
  const centre = (sel) =>
    page.$eval(sel, (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, uid: el.dataset.uid };
    });
  const state = () => page.evaluate(() => ({ selected: window.__game.ui.selected, target: window.__game.ui.target, plan: window.__game.view.round.plan, drag: window.__game.ui.drag, ghost: !!document.querySelector('.drag-ghost') }));

  for (const lift of ['an unselected', 'a selected']) {
    const c0 = await centre('.card:not([disabled])');
    await page.mouse.move(c0.x, c0.y);
    await page.mouse.down();
    await page.mouse.move(c0.x, c0.y - 30, { steps: 5 });
    await page.mouse.up();
    const kept = await state();
    if (kept.selected !== c0.uid || kept.plan || kept.drag || kept.ghost) fail(`${lift} card dragged and released over itself should stay selected and lock nothing: ${JSON.stringify({ uid: c0.uid, ...kept })}`);
  }

  const c = await centre('.card:not([disabled])');
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y - 30, { steps: 5 });
  if (!(await page.$('.city.target'))) fail('dragging a card did not highlight any city');
  const p = await page.$eval('.city.target .plate', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, city: Number(el.closest('.city').dataset.city) };
  });
  await page.mouse.move(p.x, p.y, { steps: 8 });
  if (!(await page.$('.city.drop-over'))) fail('dragging a card over a city did not mark it .drop-over');
  if (!(await page.$('.drag-ghost'))) fail('dragging a card shows no .drag-ghost');
  if (shot) await shot('drag', page);
  await page.mouse.up();
  const s = await state();
  if (!s.selected || s.target !== p.city || s.plan || s.drag || s.ghost) fail(`dropping a card on a city should choose that city and lock nothing yet: ${JSON.stringify({ city: p.city, ...s })}`);
  await page.click('[data-action=lock]');
}

export default async function smoke(page, { log, shot, audit, phone = false }) {
  const fail = (m) => {
    throw new Error(m);
  };
  await until(page, () => window.__game && document.querySelector('.title-screen'), null, 'the title screen');
  await until(page, () => window.__game.audio?.sceneName === 'title', null, 'the title music');
  await snap(page, shot, 'title');
  await audit('title');

  await page.click('[data-action=rivals]');
  await page.waitForSelector('.rivals-screen');
  await snap(page, shot, 'rivals');
  await audit('rivals');
  // Choosing the rival opens the round on a title card. The second click of a double-click lands
  // inside its 400 ms tap guard and must not skip it (one synchronous step, so it is certainly early).
  const early = await page.evaluate(() => {
    document.querySelector('[data-action=rival][data-id=wren]').click();
    const up = !!document.querySelector('.title-card');
    document.querySelector('.title-card')?.click();
    return { up, still: !!document.querySelector('.title-card') };
  });
  if (!early.up || !early.still) fail(`choosing a rival should put a round card up that an instant second click does not skip: ${JSON.stringify(early)}`);

  // The card: the round number, then each city with its skyline and rule. Held still for the shot
  // (it would end by itself after 2.5 s), then Enter skips it at once.
  await until(page, () => document.querySelector('.title-card'), null, 'the round title card');
  await page.evaluate(() => window.__game.holdCard());
  // The card holds the rival. Lock its turn-1 drop in now, so it can't lock (or escalate) in the
  // middle of the drags below: the player's lock then resolves the turn at once.
  if (!(await page.evaluate(() => window.__game.rivalLocks()))) fail('the rival could not lock in its turn-1 drop');
  await snap(page, shot, 'round-card');
  await audit('round-card');
  const card = await page.evaluate(() => {
    const el = document.querySelector('.title-card');
    const lines = [...el.querySelectorAll('.line')];
    return {
      role: el.getAttribute('role'),
      label: el.getAttribute('aria-label'),
      lines: lines.length,
      // A slip is clipped if it runs off screen, or its name or rule runs past its edges (a long
      // word wider than its column, or text spilling out of the slip, where the cut would shave it).
      clipped: lines
        .filter((l) => {
          const r = l.getBoundingClientRect();
          const inView = r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
          const fits = [...l.querySelectorAll('h3, p')].every((t) => {
            const b = t.getBoundingClientRect();
            return t.scrollWidth <= t.clientWidth + 1 && b.left >= r.left && b.right <= r.right && b.top >= r.top && b.bottom <= r.bottom;
          });
          return !inView || !fits;
        })
        .map((l) => l.textContent.trim()),
    };
  });
  if (card.role !== 'dialog' || !/^Round 1: [^,]+, [^,]+, [^,]+$/.test(card.label || '')) fail(`the round card should be a dialog labelled "Round 1: A, B, C": ${JSON.stringify(card)}`);
  if (card.lines !== 3) fail(`the round card should list three cities, not ${card.lines}`);
  if (card.clipped.length) fail(`round card lines off screen or clipped: ${card.clipped.join(' | ')}`);
  await page.keyboard.press('Enter');
  if (await page.$('.title-card')) fail('Enter did not skip the round card');
  log(`round card OK (${card.label})`);

  await until(page, () => window.__game.ui.screen === 'play' && document.querySelector('.hand .card'), null, 'the table');
  await snap(page, shot, 'play');
  await audit('play');
  log(`turn 1: ${await checkToken(page, 'turn 1')}`);
  // The table music starts with its bass (the first click unlocked audio); the riff comes in
  // from turn 2, so none plays on turn 1.
  const t1 = await page.evaluate(() => ({ scene: window.__game.audio.sceneName, ...window.__game.audio.played }));
  if (t1.scene !== 'table') fail(`the table should play the table music, not ${t1.scene}`);
  await until(page, (b) => window.__game.audio.played.bass > b, t1.bass, 'the table music’s bass on turn 1');
  const riff1 = await page.evaluate(() => window.__game.audio.played.riff);
  if (riff1 !== t1.riff) fail(`no riff should play on turn 1: riff went ${t1.riff} -> ${riff1}`);
  log('table music on turn 1: bass, no riff');

  // A real turn: drag a card onto a city and lock; the rival locked in behind the round card, so
  // the lock resolves the turn and the reveal plays. Past its 400 ms guard, Space speeds it up and
  // a second Space skips it.
  await dragFirst(page, { shot });
  if (!(await page.evaluate(() => window.__game.state.round.turn === 2 || window.__game.state.phase !== 'plan'))) fail('Lock in did not resolve the turn (the rival had locked in)');
  await until(page, () => window.__game.state.round.turn === 2 || window.__game.state.phase !== 'plan', null, 'the rival to drop');
  // Freeze the reveal past its guard (in the same step that sees it), so it can't run out before
  // the first Space. At 3x it may end before the second lands (a slow machine): that also passes.
  await until(page, () => window.__game.ui.animating && performance.now() - window.__game.ui.revealAt > 450 && window.__game.holdReveal(), null, 'the reveal to pass its guard');
  // During the reveal the token stays with the turn being flipped.
  if ((await page.evaluate(() => document.querySelectorAll('.play.revealing .first-flip').length)) !== 1) fail('no First flip token during the reveal');
  await page.keyboard.press('Space');
  if ((await page.evaluate(() => window.__game.ui.speed)) !== 3) fail('Space did not speed the reveal up to 3x');
  await page.keyboard.press('Space');
  if (!(await page.evaluate(() => window.__game.ui.skip === true || !window.__game.ui.animating))) fail('a second Space did not skip the reveal');
  await idle(page);
  log('turn 1 revealed (Space sped it up, then skipped it)');
  if (await page.evaluate(() => window.__game.state.phase === 'plan')) log(`turn 2: ${await checkToken(page, 'turn 2')}`);

  // Escalate through the button; the bot must answer (play on or fold).
  if (await page.$('[data-action=escalate]:not([disabled])')) {
    await page.click('[data-action=escalate]');
    await until(page, () => !window.__game.state.round.pending, null, 'the rival to answer the escalation');
    log(`escalation answered: ${await page.evaluate(() => (window.__game.state.phase === 'plan' ? 'play on' : 'fold'))}`);
  }
  await idle(page);
  await snap(page, shot, 'after-escalate');

  // Play the round's final turn at night, then read the result (once a fold's flash has gone).
  // If the rival folded the escalation (or the final turn had nowhere to drop), the night is
  // played again on a fresh match at the end.
  const nightNow = await page.evaluate(() => window.__game.state.phase === 'plan');
  let nightDone = false;
  if (nightNow) nightDone = await finalTurn(page, { log, shot, audit });
  else log('the rival folded round 1: the final turn is played on a fresh match at the end');
  await until(page, () => document.querySelector('.result') && !document.querySelector('.flash'), null, 'the round result');
  if (nightNow && (await page.evaluate(() => document.body.dataset.night)) !== '1') fail('the final flip’s result should still be at night');
  await snap(page, shot, 'round-result');
  await audit('round-result');

  // See the board: the result shrinks to a strip at the bottom, clear of every city.
  await page.click('[data-action=peek]');
  await until(page, () => document.querySelector('.result.peek'), null, 'the result to shrink to a strip');
  await snap(page, shot, 'see-board');
  await audit('see-board');
  const covered = await page.evaluate(() => {
    const strip = document.querySelector('.result.peek').getBoundingClientRect();
    return [...document.querySelectorAll('#board .city')]
      .filter((c) => {
        const r = c.getBoundingClientRect();
        const inView = r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
        const under = r.bottom > strip.top && r.top < strip.bottom && r.right > strip.left && r.left < strip.right;
        return !inView || under;
      })
      .map((c) => c.dataset.city);
  });
  if (covered.length) fail(`with See the board up, cities ${covered.join(', ')} are off screen or under the strip`);
  if (!(await page.$('.result.peek [data-action=next], .result.peek [data-action=final], .result.peek .wait'))) fail('the strip lost the next-round button');
  await page.keyboard.press('b');
  await until(page, () => !document.querySelector('.result.peek') && document.querySelector('.result .lines p') && document.querySelector('.result [data-action=peek]'), null, 'B to bring the full result back');
  // Enter on the focused See the board button presses that button (the board shows again); it
  // doesn't start the next round.
  await page.focus('.result [data-action=peek]');
  await page.keyboard.press('Enter');
  await until(page, () => document.querySelector('.result.peek'), null, 'Enter on the focused See the board button to show the board again');
  if (await page.evaluate(() => window.__game.state.roundNo !== 0 || window.__game.table.ready[0])) fail('Enter on the focused See the board button went on to the next round');
  // Go on from the strip, with focus off the button: the next round's result must open in full.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Enter');
  await until(page, () => window.__game.state.phase === 'plan' && window.__game.state.roundNo === 1, null, 'round 2');
  // Round 2's card: past its tap guard, a tap anywhere skips it.
  await until(page, () => !!window.__game.ui.card, null, 'round 2’s title card');
  await page.evaluate(() => window.__game.holdCard());
  await until(page, () => performance.now() - window.__game.ui.card.at > 450, null, 'round 2’s card to pass its tap guard');
  await page.click('.title-card');
  await until(page, () => !document.querySelector('.title-card') && !window.__game.ui.card, null, 'a tap to skip round 2’s card');
  if ((await page.evaluate(() => document.body.dataset.night)) !== '0') fail('round 2 should open by day');
  log('round 2 started (See the board and B both work; a tap skipped its card)');

  // Jump to the end of the match.
  await page.evaluate(() => {
    window.__game.state.scores = [9, 3];
    window.__game.state.target = 1;
    window.__game.finishRound();
  });
  await until(page, () => document.querySelector('[data-action=final]'), null, 'the final report button');
  if (await page.$('.result.peek')) fail('See the board carried over into the next round');
  await page.click('[data-action=final]');
  await page.waitForSelector('.over');
  if ((await page.evaluate(() => window.__game.audio.sceneName)) !== null) fail('the dossier should stop the music (scene null)');
  await snap(page, shot, 'match-over');
  await audit('match-over');

  // Rematch: the dossier gives way to a fresh table.
  await page.click('[data-action=rematch]');
  await until(page, () => window.__game.ui.screen === 'play' && window.__game.view?.scores.join() === '0,0' && !document.querySelector('.over'), null, 'the solo rematch table');
  await clearCard(page);
  log('solo rematch OK');

  // A save from before match ids gets one on resume, saved at once so a reload keeps it, and
  // the match is not counted again. (One synchronous step, so the rival can't move and save.)
  await page.click('[data-action=quit]');
  await page.click('.modal [data-action=title]');
  const before = await page.evaluate(() => {
    const m = JSON.parse(localStorage.getItem('cg:dead-drop:match'));
    delete m.table.matchId;
    localStorage.setItem('cg:dead-drop:match', JSON.stringify(m));
    return window.__game.meta.matches;
  });
  const resume = async () => {
    await page.reload();
    await until(page, () => window.__game && document.querySelector('[data-action=continue]'), null, 'the continue button');
    return page.evaluate(() => {
      document.querySelector('[data-action=continue]').click();
      const g = window.__game;
      return { id: g.table.matchId, saved: JSON.parse(localStorage.getItem('cg:dead-drop:match')).table.matchId, matches: g.meta.matches };
    });
  };
  const first = await resume();
  const second = await resume();
  await clearCard(page);
  if (first.saved !== first.id || second.id !== first.id) fail(`an old save's match id moved: ${JSON.stringify([first, second])}`);
  if (first.matches !== before || second.matches !== before) fail(`resuming an old save counted it again: ${before} -> ${first.matches} -> ${second.matches}`);
  log('old save resumed with a stable id');

  // Pass and play: cover, Red drops, cover, Teal drops, reveal, cover again.
  await page.click('[data-action=quit]');
  await page.click('.modal [data-action=title]');
  await page.click('[data-action=pass]');
  await clearCard(page);
  await page.waitForSelector('.cover');
  await snap(page, shot, 'pass-cover');
  await audit('pass-cover');
  await page.click('[data-action=uncover]');
  await dropFirst(page);
  await until(page, () => window.__game.ui.cover?.seat === 1, null, 'the cover for Teal');
  await page.click('[data-action=uncover]');
  await snap(page, shot, 'pass-teal');
  // Teal drags: the board is drawn from Teal's side now, and the drop must still find the city.
  await dragFirst(page);
  await page.keyboard.press('Space');
  await until(page, () => window.__game.ui.cover?.seat === 0 && window.__game.state.round.turn === 2, null, 'the next turn cover');
  log('pass and play turn OK');

  // Pass and play rematch: back to Red's cover with a clean table.
  await page.click('[data-action=uncover]');
  await page.evaluate(() => {
    window.__game.state.scores = [9, 3];
    window.__game.state.target = 1;
    window.__game.finishRound();
  });
  await until(page, () => document.querySelector('[data-action=final]'), null, 'the pass and play final report');
  await page.click('[data-action=final]');
  await page.click('[data-action=rematch]');
  await clearCard(page);
  await until(page, () => window.__game.ui.cover?.seat === 0 && window.__game.view?.scores.join() === '0,0' && document.querySelector('.cover'), null, 'the pass and play rematch cover');
  log('pass and play rematch OK');

  // Help: a tabbed sheet. Its cut is a fixed size, so no tab's text ever runs into a corner.
  await page.click('[data-action=help]');
  await page.waitForSelector('.sheet.help');
  const tabs = phone ? ['rules', 'agents', 'cities'] : ['rules', 'agents', 'cities', 'keys'];
  for (const tab of tabs) {
    await page.click(`[role=tab][data-tab=${tab}]`);
    await until(page, (t) => window.__game.ui.helpTab === t && document.querySelector(`[role=tab][data-tab=${t}][aria-selected=true]`), tab, `the ${tab} help tab`);
    if (tab === 'rules' || tab === 'agents') {
      const clear = await page.evaluate(() => {
        const sheet = document.querySelector('.sheet').getBoundingClientRect();
        const body = document.querySelector('.sheet-body').getBoundingClientRect();
        const h2 = document.querySelector('.sheet h2').getBoundingClientRect();
        return body.bottom <= sheet.bottom - 12 && h2.top >= sheet.top + 6;
      });
      if (!clear) fail('help sheet text runs into the cut');
    }
    await snap(page, shot, `help-${tab}`);
    await audit(`help-${tab}`);
  }
  const short = await page.evaluate(() =>
    [...document.querySelectorAll('[role=tab]')].filter((t) => t.getClientRects().length && t.getBoundingClientRect().height < 40).map((t) => t.dataset.tab),
  );
  if (short.length) fail(`help tabs under 40px tall: ${short.join(', ')}`);
  if (phone && (await page.evaluate(() => document.querySelector('[role=tab][data-tab=keys]')?.getClientRects().length))) fail('the Keys help tab shows on a touch screen');
  const tabBefore = await page.evaluate(() => window.__game.ui.helpTab);
  await page.keyboard.press('ArrowRight');
  await until(page, (b) => window.__game.ui.helpTab !== b, tabBefore, 'ArrowRight to switch the help tab');
  if (phone && (await page.evaluate(() => window.__game.ui.helpTab)) === 'keys') fail('ArrowRight landed on the hidden Keys tab');
  log(`help tabs OK (ArrowRight: ${tabBefore} -> ${await page.evaluate(() => window.__game.ui.helpTab)})`);
  await page.keyboard.press('Escape');

  // Turned assets (rival agents now on your side). Set up straight on the table, since a real
  // one takes a Getaway in Havana after turn 4: one in your hand wears the stamp, and one on
  // the board outside Havana says so when inspected.
  await page.evaluate(() => window.__game.startSolo('wren'));
  await until(page, () => window.__game.ui.screen === 'play' && document.querySelector('.hand .card'), null, 'a fresh solo table');
  await clearCard(page);
  const boardUid = await page.evaluate(() => {
    const g = window.__game;
    const R = g.state.round;
    const take = () => {
      const uid = R.decks[1].find((u) => !['sleeper', 'tripwire'].includes(R.cards[u].kind));
      R.decks[1].splice(R.decks[1].indexOf(uid), 1);
      R.cards[uid].owner = 0;
      return uid;
    };
    R.hands[0].unshift(take());
    const ci = R.cities.findIndex((c) => c.id !== 'havana' && c.id !== 'vienna');
    const uid = take();
    Object.assign(R.cards[uid], { city: ci, turn: 1 });
    R.cities[ci].sides[0].push(uid);
    g.quickTurns(0);
    return uid;
  });
  const stamps = await page.evaluate(() => [...document.querySelectorAll('.hand .card')].filter((c) => c.querySelector('.turned')).map((c) => c.getAttribute('aria-label')));
  if (stamps.length !== 1 || !stamps[0].includes(', a turned asset')) fail(`expected one stamped turned asset in hand, got ${JSON.stringify(stamps)}`);
  await page.click(`#board .chip[data-uid="${boardUid}"]`);
  await until(page, () => document.querySelector('#ticker')?.textContent.includes('a turned asset'), null, 'the inspect text to call it a turned asset');
  await snap(page, shot, 'turned');
  await audit('turned');
  log('turned assets stamped and inspected');

  // Mid-reveal, a click in any modal but help only skips the reveal: the quit modal's Leave
  // must not leave. Then leaving anyway (through the Leave action itself): the title is up at
  // once, the abandoned reveal runs out without a sound, and the title answers the very next
  // click. Sounds are counted as WebAudio sources created. One synchronous step, so the reveal
  // is certainly still running.
  await page.evaluate(() => {
    const proto = (window.AudioContext || window.webkitAudioContext).prototype;
    window.__sounds = 0;
    for (const m of ['createOscillator', 'createBufferSource']) {
      const orig = proto[m];
      proto[m] = function (...args) {
        window.__sounds++;
        return orig.apply(this, args);
      };
    }
    window.__game.startSolo('wren');
  });
  await until(page, () => window.__game.ui.screen === 'play' && document.querySelector('.hand .card'), null, 'a fresh table to leave');
  await clearCard(page);
  await dropFirst(page);
  await until(page, () => window.__game.ui.animating, null, 'a reveal to start');
  const left = await page.evaluate(() => {
    const g = window.__game;
    const sounds = window.__sounds;
    document.querySelector('.top [data-action=quit]').click();
    const before = performance.now() - g.ui.revealAt;
    document.querySelector('.modal [data-action=title]').click();
    const after = performance.now() - g.ui.revealAt;
    const blocked = { before, after, screen: g.ui.screen, modal: g.ui.modal, speed: g.ui.speed, skip: g.ui.skip, animating: g.ui.animating };
    g.leave();
    return { sounds, blocked, animating: g.ui.animating, title: !!document.querySelector('.title-screen') };
  });
  const b = left.blocked;
  // Inside the reveal's first 400 ms the click is a stray tap and changes nothing; after, it speeds
  // the reveal up. (A click that straddles 400 ms may do either.)
  const tapped = !b.skip && (b.after < 400 ? b.speed === 1 : b.before >= 400 ? b.speed === 3 : b.speed === 1 || b.speed === 3);
  if (b.screen !== 'play' || b.modal !== 'quit' || !b.animating || !tapped) fail(`mid-reveal, the quit modal's Leave should only count as a tap on the reveal: ${JSON.stringify(b)}`);
  if (!left.sounds) fail('no sound had played before leaving, so the silence check below proves nothing');
  if (left.animating || !left.title) fail(`leaving mid-reveal should show the title and end the reveal: ${JSON.stringify(left)}`);
  await until(page, () => !window.__game.ui.updating, null, 'the abandoned reveal to run out');
  const after = await page.evaluate(() => ({ sounds: window.__sounds, board: !!document.querySelector('#board'), title: !!document.querySelector('.title-screen') }));
  if (after.sounds !== left.sounds) fail(`the abandoned reveal played ${after.sounds - left.sounds} sound(s) over the title`);
  if (after.board || !after.title) fail(`the abandoned reveal painted over the title: ${JSON.stringify(after)}`);
  await page.click('[data-action=rivals]');
  await until(page, () => document.querySelector('.rivals-screen'), null, 'the title to answer a click after leaving mid-reveal');
  log(`left mid-reveal cleanly (${left.sounds} sounds before, none after; the Leave click ${b.speed === 1 ? 'fell inside the guard' : 'sped the reveal up'})`);

  // The escalation flash takes every tap and key, as a title card does: nothing reaches the prompt
  // under it. The rival's turn-1 drop is locked in behind the round card, so the only move it makes
  // here is the escalation below. That goes through the table in one synchronous step with a tap
  // where the prompt's Fold button sits, so the tap certainly lands inside the flash's 400 ms
  // guard: it must hit the flash and change nothing. Then F (the prompt's Fold key) is swallowed,
  // and Enter (its Play on key, with Play on focused) skips the flash without answering. Once the
  // flash has gone, the prompt answers at once.
  await page.evaluate(() => window.__game.startSolo('wren'));
  await until(page, () => document.querySelector('.title-card'), null, 'a round card to escalate after');
  if (!(await page.evaluate(() => window.__game.rivalLocks()))) fail('the rival could not lock in before escalating');
  await clearCard(page);
  await until(page, () => !window.__game.ui.updating && !window.__game.ui.card, null, 'a quiet table to escalate on');
  const flashTap = await page.evaluate(() => {
    const g = window.__game;
    const escalated = g.rivalEscalates();
    const up = !!g.ui.card?.el.classList.contains('flash');
    g.holdCard();
    const fold = document.querySelector('.modal.hot [data-action=respond][data-accept="0"]');
    const r = fold?.getBoundingClientRect();
    const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    hit?.click();
    return { escalated, up, prompt: !!fold, onFlash: !!hit?.closest('.cine.flash'), still: !!document.querySelector('.cine.flash'), pending: !!g.state.round.pending, focus: document.activeElement?.dataset.action ?? null };
  });
  if (!flashTap.escalated || !flashTap.up || !flashTap.prompt) fail(`the rival's escalation should put the prompt up under a flash: ${JSON.stringify(flashTap)}`);
  if (!flashTap.onFlash || !flashTap.still || !flashTap.pending) fail(`a tap on the prompt's Fold through the flash should land on the flash and change nothing: ${JSON.stringify(flashTap)}`);
  await snap(page, shot, 'escalate-flash');
  await audit('escalate-flash');
  const flashState = () => page.evaluate(() => ({ flash: !!document.querySelector('.cine.flash'), card: !!window.__game.ui.card, pending: !!window.__game.state.round.pending, prompt: !!document.querySelector('.modal.hot'), stake: window.__game.state.round.stake, phase: window.__game.state.phase }));
  await page.keyboard.press('f');
  const afterF = await flashState();
  if (!afterF.flash || !afterF.pending || afterF.phase !== 'plan') fail(`F during the flash should be swallowed: ${JSON.stringify(afterF)}`);
  await page.keyboard.press('Enter');
  const afterEnter = await flashState();
  if (afterEnter.flash || afterEnter.card || !afterEnter.pending || !afterEnter.prompt || afterEnter.stake !== 1) fail(`Enter during the flash should skip it without answering the prompt: ${JSON.stringify(afterEnter)}`);
  await page.click('.modal.hot [data-action=respond][data-accept="1"]');
  await until(page, () => !window.__game.state.round.pending && window.__game.state.round.stake === 2, null, 'Play on to answer once the flash has gone');
  log(`the escalation flash took every tap and key (a tap on Fold and F did nothing; Enter skipped it with ${flashTap.focus === 'respond' ? 'Play on focused' : 'focus elsewhere'}); Play on answered after`);

  // Overlays go with the table. A new match started over a round card shows only its own card;
  // leaving over a card takes it down at once and ends its wait; leaving over an escalation flash
  // takes the flash down too, rather than leaving it over the title.
  await page.evaluate(() => window.__game.startSolo('wren'));
  await until(page, () => document.querySelector('.title-card'), null, 'a round card to start over');
  const id2 = await page.evaluate(() => {
    window.__game.startSolo('wren');
    return window.__game.table.matchId;
  });
  await until(page, (id) => window.__game.view?.matchId === id && document.querySelector('.title-card'), id2, 'the new match’s round card');
  const cards = await page.evaluate(() => document.querySelectorAll('.cine').length);
  if (cards !== 1) fail(`a new match over a round card left ${cards} cards up`);
  const gone = await page.evaluate(() => {
    window.__game.leave();
    return { cards: document.querySelectorAll('.cine').length, card: !!window.__game.ui.card, title: !!document.querySelector('.title-screen') };
  });
  if (gone.cards || gone.card || !gone.title) fail(`leaving over a round card should take it down: ${JSON.stringify(gone)}`);
  await until(page, () => !window.__game.ui.updating, null, 'the abandoned round card’s wait to end');
  await page.evaluate(() => window.__game.startSolo('wren'));
  await clearCard(page);
  await page.click('[data-action=escalate]');
  await until(page, () => document.querySelector('.flash'), null, 'the escalation flash');
  const flashGone = await page.evaluate(() => {
    window.__game.leave();
    return { flash: document.querySelectorAll('.flash').length, title: !!document.querySelector('.title-screen') };
  });
  if (flashGone.flash || !flashGone.title) fail(`leaving over an escalation flash should take it down: ${JSON.stringify(flashGone)}`);
  if ((await page.evaluate(() => document.body.dataset.night)) !== '0') fail('the title should be by day');
  log('overlays go with the table (one card at a time; leaving clears cards and flashes)');

  // The night again on a fresh match if round 1 couldn't show it (a fold, or nowhere to drop).
  for (let tries = 0; !nightDone && tries < 5; tries++) {
    await page.evaluate(() => window.__game.startSolo('wren'));
    await clearCard(page);
    await until(page, () => !window.__game.ui.updating && !window.__game.ui.card, null, 'the fresh table to settle');
    nightDone = await finalTurn(page, { log, shot, audit });
    await until(page, () => document.querySelector('.result') && !window.__game.ui.animating, null, 'the final flip’s result');
    await snap(page, shot, 'final-result');
  }
  if (!nightDone) fail('five final turns in a row had nowhere to drop, so the final reveal was never checked');

  // The final card ends by itself after about 1.2 s, timed in the page by the card watcher, from the
  // moment it went up to the moment it came down.
  await watchCards(page);
  await freshFinalTurn(page);
  await until(page, () => window.__cines.some((c) => c.cls.includes('final-card') && c.down !== null), null, 'the final drop card to end by itself');
  const lasted = await page.evaluate(() => {
    const c = window.__cines.find((x) => x.cls.includes('final-card'));
    return c.down - c.up;
  });
  if (lasted < 1150 || lasted > 4000) fail(`the final drop card should last about 1.2 s, not ${Math.round(lasted)} ms`);
  log(`the final drop card ended by itself after ${Math.round(lasted)} ms`);

  // Reduced motion: no final card (the night colours and the stamp carry the news). The rival locks
  // in with the jump (it is held by the update then), so it can't fold the round away mid-check.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await watchCards(page);
  await freshFinalTurn(page, { lock: true });
  await until(page, () => window.__cines.length || performance.now() - window.__t0 > 1500, null, '1.5 s of the final turn under reduced motion');
  const rm = await page.evaluate(() => ({ cines: window.__cines.map((c) => c.cls), night: document.body.dataset.night, stamp: !!document.querySelector('.stake .x2-stamp'), turn: window.__game.view.round.turn }));
  if (rm.cines.length || rm.night !== '1' || !rm.stamp || rm.turn !== 6) fail(`under reduced motion the final turn should go dark with its stamp and no card: ${JSON.stringify(rm)}`);
  await page.emulateMedia({ reducedMotion: null });

  // skipAnimations(true): the next round opens without its title card.
  await watchCards(page);
  await page.evaluate(() => {
    window.__game.skipAnimations(true);
    window.__game.finishRound();
  });
  await until(page, () => document.querySelector('.result [data-action=next]') && !window.__game.ui.updating, null, 'the result with every animation skipped');
  await page.click('.result [data-action=next]');
  await until(page, () => window.__game.view?.roundNo === 1 && window.__game.view.phase === 'plan' && !window.__game.ui.updating, null, 'round 2 with every animation skipped');
  const sk = await page.evaluate(() => ({ cines: window.__cines.map((c) => c.cls), card: !!window.__game.ui.card, night: document.body.dataset.night }));
  await page.evaluate(() => {
    window.__game.skipAnimations(false);
    window.__cineWatch.disconnect();
  });
  if (sk.cines.length || sk.card || sk.night !== '0') fail(`with animations skipped the next round should open by day without a title card: ${JSON.stringify(sk)}`);
  log('reduced motion: the night and its stamp without a card; skipAnimations: no round card');
}

/** Two players: pages = [host, guest]. Local (BroadcastChannel) unless ctx.live. */
export async function duo([host, guest], { url, log, shot, audit, live = false, code = 'SMOKE7' }) {
  T = live ? 45000 : 15000;
  const local = (u, hash = '') => (live ? `${u}${hash}` : `${u}${u.includes('?') ? '&' : '?'}net=local${hash}`);
  await host.goto(local(url));
  await until(host, () => window.__game, null, 'the host page');
  await host.evaluate((c) => window.__game.startHost(c), code);
  await until(host, () => document.querySelector('.lobby .code'), null, 'the lobby');
  if ((await host.evaluate(() => window.__game.audio.sceneName)) !== 'lobby') throw new Error('the lobby should play the lobby music');
  await shot('lobby', host);
  await audit('lobby', host);

  await guest.goto(local(url, `#join=${code}`));
  await until(host, () => window.__game.ui.screen === 'play', null, 'the host to see the guest');
  await until(guest, () => window.__game.ui.screen === 'play' && document.querySelector('.hand .card'), null, 'the guest table');
  log('guest joined');

  // Both open on the round's title card. Leave the guest's up: the host skips theirs and locks in,
  // and once the guest's card ends by itself the guest's table must show the host locked (the
  // latest view, never the one from before the card).
  await clearCard(host);
  await dropFirst(host);
  const cardUp = await guest.evaluate(() => !!document.querySelector('.title-card'));
  await until(guest, () => !document.querySelector('.title-card') && window.__game.view.round.rivalLocked, null, 'the guest card to end by itself with the host shown locked');
  log(`the host locked in ${cardUp ? 'while the guest’s round card was up' : 'after the guest’s round card had gone'}; the guest sees it`);
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
  // The flash over the prompt (held still, if it is still up) takes keys: Space, with Play on
  // focused, skips it without pressing Play on. The click below waits for the flash to go.
  const flashHeld = await host.evaluate(() => {
    const up = !!document.querySelector('.cine.flash');
    if (up) window.__game.holdCard();
    return up;
  });
  if (flashHeld) {
    await host.keyboard.press(' ');
    const s = await host.evaluate(() => ({ flash: !!document.querySelector('.cine.flash'), pending: !!window.__game.view.round.pending, prompt: !!document.querySelector('.modal.hot') }));
    if (s.flash || !s.pending || !s.prompt) throw new Error(`Space over the host's escalation flash should skip it without answering: ${JSON.stringify(s)}`);
  }
  await shot('duo-escalated', host);
  await host.click('.modal.hot [data-action=respond][data-accept="1"]');
  await until(guest, () => window.__game.view.round.stake === 2, null, 'the doubled stake on the guest');
  log(`escalation crossed the wire${flashHeld ? ' (Space skipped the host’s flash without answering)' : ''}`);

  // Waits that also skip any reveal in progress, so a slow page never holds up the next step.
  const untilQuick = (p, fn, what) => until(p, `(window.__game.ui.animating && (window.__game.ui.skip = true), (${fn})())`, null, what);

  // The host ends the match; both read the final report.
  await host.evaluate(() => {
    window.__game.state.scores = [9, 3];
    window.__game.state.target = 1;
    window.__game.finishRound();
  });
  for (const p of [host, guest]) {
    await untilQuick(p, () => document.querySelector('[data-action=final]'), 'the final report button');
    await p.click('[data-action=final]');
    await until(p, () => document.querySelector('.over'), null, 'the dossier');
  }
  await snap(guest, shot, 'duo-over-guest');

  // Rematch: the host offers, the guest accepts, and both screens return to a fresh table.
  await host.click('[data-action=rematch]');
  await until(guest, () => document.querySelector('[data-action=rematch]')?.textContent.includes('Accept rematch'), null, 'the rematch offer on the guest');
  await guest.click('[data-action=rematch]');
  for (const p of [host, guest]) {
    await until(p, () => window.__game.ui.screen === 'play' && window.__game.view?.scores.join() === '0,0' && !document.querySelector('.over'), null, 'the rematch table');
  }
  for (const p of [host, guest]) await clearCard(p);
  await snap(guest, shot, 'duo-rematch-guest');
  await audit('duo-rematch-guest', guest);
  log('rematch returned both players to the table');

  // The new match plays a turn. Live (two browsers, the real relays): a plain turn each. Locally,
  // the guest locks in first and reloads, which must not count the match again and brings the
  // round card up again; the host locks in while it is up, so the turn resolves behind the card.
  // Once it goes, the guest must play turn 1's reveal over the turn-1 board, not jump to turn 2
  // and replay its events over a board that already shows them.
  if (live) {
    await dropFirst(host);
    await until(guest, () => window.__game.view.round.rivalLocked, null, 'the guest to see the host locked after the rematch');
    await dropFirst(guest);
  } else {
    const counted = () => ({ matches: window.__game.meta.matches, counted: (window.__game.meta.counted || []).slice() });
    const before = await guest.evaluate(counted);
    await dropFirst(guest);
    await until(host, () => window.__game.view.round.rivalLocked, null, 'the host to see the guest locked after the rematch');
    await guest.reload();
    await until(guest, () => window.__game?.ui.screen === 'play' && document.querySelector('.title-card'), null, 'the guest’s round card again after a reload');
    const after = await guest.evaluate(counted);
    if (after.matches !== before.matches) throw new Error(`a guest reload counted the match again: ${before.matches} -> ${after.matches}`);
    if (new Set(after.counted).size !== after.counted.length) throw new Error(`meta.counted holds a duplicate: ${after.counted}`);
    // Note the turn of the board on screen whenever a reveal is playing on the guest.
    await guest.evaluate(() => {
      window.__revealTurns = [];
      setInterval(() => window.__game.ui.animating && window.__revealTurns.push(window.__game.view.round.turn), 5);
    });
    await dropFirst(host);
    const cardUp = await guest.evaluate(() => !!document.querySelector('.title-card'));
    await until(
      guest,
      () => {
        const g = window.__game;
        return !document.querySelector('.title-card') && g.view.round.turn === 2 && !g.ui.animating && g.ui.shownSeq === g.view.turnSeq;
      },
      null,
      'the guest to reveal turn 1 once its card has gone',
    );
    const turns = await guest.evaluate(() => [...new Set(window.__revealTurns)]);
    if (turns.join() !== '1') throw new Error(`a turn resolved behind the guest's round card: its reveal ${turns.length ? `played over the turn ${turns.join(', ')} board` : 'never played'}, not turn 1's`);
    log(`guest reload kept ${after.matches} matches; the host locked in ${cardUp ? 'behind the guest’s round card' : 'after the guest’s round card had gone'} and the guest revealed turn 1 from its board`);
  }
  for (const p of [host, guest]) {
    await untilQuick(p, () => window.__game.view?.round.turn === 2 && !window.__game.ui.animating, 'turn 2 of the rematch on both screens');
  }

  // The guest leaves through the menu; the host hears it.
  await guest.click('[data-action=quit]');
  await guest.click('.modal [data-action=title]');
  await until(host, () => document.querySelector('.banner')?.textContent.includes('left the table'), null, 'the host to hear the guest leave');
  await snap(host, shot, 'duo-left-host');
  await audit('duo-left-host', host);

  // The host's dossier says so too, in place of a rematch nobody can accept.
  await host.evaluate(() => {
    window.__game.state.scores = [9, 3];
    window.__game.state.target = 1;
    window.__game.finishRound();
  });
  await untilQuick(host, () => document.querySelector('[data-action=final]'), 'the final report button on the host');
  await host.click('[data-action=final]');
  await until(host, () => document.querySelector('.over .wait')?.textContent.includes('left the table') && !document.querySelector('[data-action=rematch]'), null, 'the dossier to say the guest left');
  await snap(host, shot, 'duo-left-over-host');
  log('leaving said goodbye');
}
