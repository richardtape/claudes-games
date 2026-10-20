import { readFileSync } from 'node:fs';
import { AGENT, AGENTS, CITIES, CITY, CLASSIC_CITIES, DECK } from './js/data.js';
import { cable, DOSSIERS, EPILOGUE, operation, REMARKS, twistText } from './js/story.js';
import { sightings, unseen } from './js/counting.js';
import { deckList } from './js/engine.js';
// Scripted play-through run by `npm run check` (see scripts/check.mjs).
// smoke(): one page — title, rivals, a solo match (its round title card and the First flip
// token; a turn dropped by dragging a card onto a city, whose reveal is sped up, then skipped;
// escalation; the final turn at night, with its card, stamp and dimmed reveal; round result and
// See the board, and Enter on its focused button; match over; rematch), pass and play (a turn, then
// a rematch), the help sheet's tabs, turned assets, leaving mid-reveal, the escalation flash taking
// every tap and key over the prompt, leaving over a round card or a flash, the final card
// ending by itself, the final turn under reduced motion (no card), and skipAnimations (no round
// card). The stakes on the table: each side's escalation tokens and film frames, the film city's
// canister on its plate and on the round card, a token spent by escalating, and a table with no
// tokens left (Escalate disabled, E does nothing). Round ends: the pot in the result, the
// Microfilm's line (who took a strip, or why the film stays put), the full reel (its card, then a
// dossier that says so), a rival's fold behind a held round card (the flash, then the result),
// my own fold (none of my agents left on the board), and in pass and play Enter and B waiting out a
// fold's exit while the next round begins behind it (foldExit). On a phone the play screen must fit without
// scrolling (phoneFits). Every round opens on a title card, so each step that starts one clears
// it first (clearCard). The new content on the table (newContent, on staged tables): an Accomplice
// and its partner, Casablanca's face, both at once with the twist chip and the unseen strip open (the
// busiest phone screen), the Countess listening and a Wiretap's slip, an Interrogator
// mid-reveal, and the ticker on a rival's partner and Mr Heron's placed card; Control's Seen stamp.
// The menus (menus): the network on the title, the ladder's twists and packs and free play on the
// rivals screen, help by roster during a free-play match (and Continue for it), pass and play's
// roster sheet, and a match saved by the 2b-i build resuming as Classic. The match frame
// (matchFrame): a first meeting's dossier and roster card, and neither the second time; C's cable
// on the round card; the unseen strip (U, its counts, an outside tap); the twist chip; and the
// epilogue after a ladder win over Control, before the dossier. A match may open on intro cards
// (a first meeting's dossier, a roster that isn't Classic) before its round card: clearCard skips them.
// duo(): two pages in one browser joined over the BroadcastChannel transport (?net=local) —
// host lobby (it switches the roster to Mixed, and the guest's first view has that roster), guest joins, the host locks in while the guest's round card is still up, a turn
// each, an escalation answered across the wire (Space over the host's flash doesn't answer it;
// both screens agree on the tokens, the escalator's side one chit down),
// match over and a rematch, a guest reload during the rematch's first turn (it must not count the
// match again, and a turn that resolves behind the guest's round card must still be revealed from
// the turn-1 board), and the guest leaving. It plays a Mixed roster, so its rounds vary between runs.
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

/** The cards a match may open on before its round card: a rival's dossier, tonight's roster. */
const INTRO = '.dossier-card, .roster-card';

/** Skip a match's intro cards with Enter, as a player would, until the round's title card is up (or no card is). */
async function skipIntro(page) {
  for (let i = 0; i < 4; i++) {
    await until(page, (sel) => document.querySelector(`.title-card, ${sel}`) || !window.__game.ui.card, INTRO, 'the round title card or an intro card (or none)');
    if (!(await page.$(INTRO))) return;
    await page.keyboard.press('Enter');
  }
}

/**
 * Every round opens on a title card, which covers the table and takes every tap (and a match may
 * open on intro cards before it). Wait until it is up (or no card is showing at all), then skip
 * each with Enter, as a player would.
 */
async function clearCard(page) {
  await skipIntro(page);
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

/**
 * Where the play screen's parts end up (px from the top of the viewport): the scorebar's top (and
 * its height), the board's bottom, the lowest card in the hand, Lock in's bottom, and the window's
 * height. On a phone everything must fit between 0 and innerHeight, with no scrolling.
 */
const phoneFits = (page) =>
  page.evaluate(() => {
    const box = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
    const px = (n) => (Number.isFinite(n) ? Math.round(n) : null);
    const cards = [...document.querySelectorAll('#hand .card')].map((c) => c.getBoundingClientRect().bottom);
    return {
      scorebarTop: px(box('.scorebar')?.top),
      scorebarHeight: px(box('.scorebar')?.height),
      boardBottom: px(box('#board')?.bottom),
      handBottom: px(cards.length ? Math.max(...cards) : NaN),
      lockBottom: px(box('[data-action=lock]')?.bottom),
      innerHeight,
    };
  });

/**
 * The stakes on the table, as the view has them: on each side the live escalation chits match its
 * tokens and the film frames match the reel; exactly one canister, on the film city's plate.
 */
async function checkMarks(page, when) {
  const m = await page.evaluate(() => {
    const v = window.__game.view;
    const sides = v.scores.map((_, s) => {
      const el = document.querySelector(`.scorebar .side.s-${s}`);
      return { seat: s, tokens: v.tokens[s], live: el ? el.querySelectorAll('.tk:not(.spent)').length : null, frames: el ? el.querySelectorAll('.fr').length : null };
    });
    const cans = [...document.querySelectorAll('.plate .canister')];
    return { reel: v.reel, film: v.round.film, sides, cans: cans.length, onFilm: cans.length === 1 && !!cans[0].closest(`#board .city.film[data-city="${v.round.film}"]`) };
  });
  const bad = m.sides.filter((x) => x.live !== x.tokens || x.frames !== m.reel);
  if (bad.length) throw new Error(`${when}: each side should show its tokens as live chits and ${m.reel} film frames: ${JSON.stringify(m)}`);
  if (m.film === null ? m.cans !== 0 : m.cans !== 1 || !m.onFilm) throw new Error(`${when}: expected one canister, on the film city's plate (city ${m.film}): ${JSON.stringify(m)}`);
  return m;
}

/** Live escalation chits on a seat's side of the scorebar. */
const liveTokens = (page, seat) => page.evaluate((s) => document.querySelectorAll(`.scorebar .side.s-${s} .tk:not(.spent)`).length, seat);

/**
 * Pick the first playable card, the first city it can go to, and lock in, through the real UI. On a
 * Mixed roster it passes over a Blackmailer (its free escalation would use up the round's one
 * escalation, which a later step makes) and an Accomplice (it asks for a partner) while another card
 * can go; an Accomplice that has to go drops alone.
 */
async function dropFirst(page) {
  await until(page, () => document.querySelector('.card:not([disabled])'), null, 'a playable card');
  const plain = '.card:not([disabled]):not(.k-blackmailer):not(.k-accomplice)';
  await page.click((await page.$(plain)) ? plain : '.card:not([disabled])');
  if (!(await page.$('.city.target'))) throw new Error('picking a card did not highlight any city');
  await page.click('.city.target .plate');
  if (await page.$('[data-action=alone]')) await page.click('[data-action=alone]');
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

/**
 * Pass and play: Red folds, and while the fold's exit plays over the old board (the result isn't up
 * yet) Enter and B must wait, as they do while a card is up. Meanwhile both seats get ready
 * through the table, as an online rival's ready lands on the host, so the next round begins behind
 * the exit. Once the exit is over that round must open cleanly: no page error, its round card,
 * then the cover. The fold flash is held, so the exit starts on our own Enter, and the keys and the
 * readiness go in the same step, inside its 450 ms.
 */
async function foldExit(page, { log, fail }) {
  const errors = [];
  const onError = (e) => errors.push(e.message);
  page.on('pageerror', onError);
  const threw = () => errors.length && fail(`a new round behind the fold's exit threw: ${errors.join(' | ')}`);
  // A wait that times out after a page error reports the error.
  const waitFor = async (fn, what) => {
    try {
      await until(page, fn, null, what);
    } catch (e) {
      threw();
      throw e;
    }
  };
  try {
    await page.evaluate(() => window.__game.startPass());
    await clearCard(page);
    await until(page, () => document.querySelector('.cover') && window.__game.ui.cover?.seat === 0, null, 'Red’s cover');
    await page.click('[data-action=uncover]');
    await until(page, () => document.querySelector('[data-action=fold]') && !window.__game.ui.updating, null, 'Red’s turn to fold on');
    // A pick is standing when Red folds: it must not arm Lock in in the round that follows.
    await page.click('.card:not([disabled])');
    await page.click('.city.target .plate');
    await page.click('[data-action=fold]');
    const flash = await page.evaluate(() => {
      document.querySelector('.modal [data-action=confirm-fold]').click();
      window.__game.holdCard();
      return document.querySelector('.cine.flash.fold .small')?.textContent ?? null;
    });
    if (flash !== 'Red aborts to save the network') fail(`confirming the fold should put the fold flash up, in the story's words: ${flash}`);
    const exit = await page.evaluate(async () => {
      const g = window.__game;
      const key = (k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      key('Enter'); // skips the held flash: the exit starts
      for (let i = 0; i < 50 && !/out of the round/.test(g.ui.caption); i++) await Promise.resolve();
      const during = { holdBoard: g.ui.holdBoard, card: !!g.ui.card, caption: g.ui.caption, result: !!document.querySelector('.result') };
      key('Enter');
      key('b');
      const keys = { phase: g.state.phase, ready: g.table.ready.some(Boolean), peek: g.ui.peek };
      g.table.act(0, { a: 'next' });
      g.table.act(1, { a: 'next' });
      return { during, keys, roundNo: g.state.roundNo, phase: g.state.phase };
    });
    const d = exit.during;
    if (!d.holdBoard || d.card || d.result || !/^Red pulls out of the round\.$/.test(d.caption)) fail(`skipping the fold flash should start the exit over the old board: ${JSON.stringify(exit)}`);
    if (exit.keys.phase !== 'round-over' || exit.keys.ready || exit.keys.peek) fail(`Enter and B during the fold's exit should wait for the result: ${JSON.stringify(exit)}`);
    if (exit.roundNo !== 1 || exit.phase !== 'plan') fail(`both seats ready should start round 2: ${JSON.stringify(exit)}`);
    await waitFor(() => window.__game.view?.roundNo === 1 && !window.__game.ui.holdBoard && document.querySelector('.title-card'), 'round 2’s card once the exit is over');
    await clearCard(page);
    await waitFor(() => document.querySelector('.cover') && window.__game.ui.cover?.seat === 0 && window.__game.view.roundNo === 1 && !window.__game.ui.updating, 'Red’s cover for round 2');
    await page.click('[data-action=uncover]');
    await waitFor(() => document.querySelector('.hand .card') && document.querySelector('[data-action=lock]'), 'round 2’s plan screen');
    const lock = await page.evaluate(() => {
      const b = document.querySelector('[data-action=lock]');
      return { disabled: b.disabled, ready: b.classList.contains('ready'), selected: window.__game.ui.selected, target: window.__game.ui.target };
    });
    if (!lock.disabled || lock.ready || lock.selected || lock.target !== null) fail(`Lock in must not be armed in the round after a fold, before anything is picked: ${JSON.stringify(lock)}`);
    threw();
    log('pass and play: Lock in stayed disarmed after the fold');
    log('pass and play: Enter and B waited out the fold’s exit; round 2 began behind it and opened cleanly');
  } finally {
    page.off('pageerror', onError);
  }
}

export default async function smoke(page, { log, shot, audit, phone = false }) {
  const fail = (m) => {
    throw new Error(m);
  };
  await until(page, () => window.__game && document.querySelector('.title-screen'), null, 'the title screen');
  // A match saved by the Phase 1 build is cleared on load, with a toast, not resumed.
  const old = readFileSync(new URL('./test/golden/v1-table.json', import.meta.url), 'utf8');
  await page.evaluate((json) => localStorage.setItem('cg:dead-drop:match', JSON.stringify({ mode: 'solo', rival: 'wren', table: JSON.parse(json) })), old);
  await page.reload();
  await until(page, () => window.__game && document.querySelector('.title-screen'), null, 'the title screen after the old save');
  // The toast lives 2.2 s: read its text in the wait itself, so a slow step can't miss it.
  await until(page, () => /older version/.test(document.querySelector('.toast')?.textContent || ''), null, 'the old-save toast');
  const cleared = await page.evaluate(() => ({ cont: !!document.querySelector('[data-action=continue]'), left: localStorage.getItem('cg:dead-drop:match') }));
  if (cleared.cont || cleared.left !== null) fail(`an old save was not cleared: ${JSON.stringify(cleared)}`);
  await shot('old-save');
  await until(page, () => window.__game.audio?.sceneName === 'title', null, 'the title music');
  await snap(page, shot, 'title');
  await audit('title');

  await page.click('[data-action=rivals]');
  await page.waitForSelector('.rivals-screen');
  await snap(page, shot, 'rivals');
  await audit('rivals');
  // Choosing the rival opens the match on a card: the first time, Agent Wren's dossier (he plays
  // Classic, so no roster card follows). The second click of a double-click lands inside its 400 ms
  // tap guard and must not skip it (one synchronous step, so it is certainly early). Enter skips the
  // dossier, and the round's title card follows.
  const early = await page.evaluate(() => {
    document.querySelector('[data-action=rival][data-id=wren]').click();
    const up = !!document.querySelector('.cine');
    document.querySelector('.cine')?.click();
    return { up, still: !!document.querySelector('.cine'), dossier: !!document.querySelector('.dossier-card'), plan: window.__game.state.round.plans[1] };
  });
  if (!early.up || !early.still) fail(`choosing a rival should put a card up that an instant second click does not skip: ${JSON.stringify(early)}`);
  if (!early.dossier || early.plan !== null) fail(`meeting Agent Wren for the first time should open on his dossier, with the rival waiting: ${JSON.stringify(early)}`);
  await page.keyboard.press('Enter');

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
  // C's cable names the film city (once: no second line under the credits), on screen, and the
  // city's slip carries the canister.
  const film = await page.evaluate(() => {
    const v = window.__game.view;
    const wire = document.querySelector('.title-card .cable');
    const tagged = [...document.querySelectorAll('.title-card .line')].map((l, i) => (l.querySelector('.film-tag .canister') ? i : -1)).filter((i) => i >= 0);
    const r = wire?.getBoundingClientRect();
    return { id: v.round.film === null ? null : v.round.cities[v.round.film].id, film: v.round.film, text: wire?.querySelector('.vh')?.textContent ?? null, notes: document.querySelector('.title-card .notes')?.textContent ?? '', tagged, inView: !!r && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
  });
  const filmSaid = film.id === null ? !/FILM/.test(film.text || '') : film.text?.includes(`THE FILM TRAVELS VIA ${CITY[film.id].name.toUpperCase()}.`) && film.tagged.join() === String(film.film);
  if (!film.text || !film.inView || !filmSaid || /film travels/i.test(film.notes)) fail(`the round card's cable should say where the film travels, once, on screen, and tag that city's slip: ${JSON.stringify(film)}`);
  await page.keyboard.press('Enter');
  if (await page.$('.title-card')) fail('Enter did not skip the round card');
  log(`round card OK (${card.label})`);

  await until(page, () => window.__game.ui.screen === 'play' && document.querySelector('.hand .card'), null, 'the table');
  await snap(page, shot, 'play');
  await audit('play');
  if (phone) {
    const fit = await phoneFits(page);
    log(`phone fit: ${JSON.stringify(fit)}`);
    // A missing part measures null, and null <= innerHeight is true: fail on it first.
    const missing = Object.keys(fit).filter((k) => fit[k] === null);
    if (missing.length) fail(`the phone's play screen is missing ${missing.join(', ')}: ${JSON.stringify(fit)}`);
    const over = ['boardBottom', 'handBottom', 'lockBottom'].filter((k) => !(fit[k] <= fit.innerHeight));
    if (!(fit.scorebarTop >= 0) || over.length) fail(`the phone's play screen should show the scorebar, the cities, the hand and Lock in without scrolling: ${JSON.stringify(fit)}`);
  }
  const marks = await checkMarks(page, 'the first play screen');
  log(`marks: tokens ${marks.sides.map((x) => x.live).join(' and ')}, a reel of ${marks.reel}, the film in city ${marks.film}`);
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

  // Escalate through the button; the bot must answer (play on or fold). It spends one of my tokens:
  // my side shows one chit fewer, and Escalate is disabled for the rest of the round.
  if (await page.$('[data-action=escalate]:not([disabled])')) {
    const chits = await liveTokens(page, 0);
    await page.click('[data-action=escalate]');
    await until(page, () => !window.__game.state.round.pending, null, 'the rival to answer the escalation');
    log(`escalation answered: ${await page.evaluate(() => (window.__game.state.phase === 'plan' ? 'play on' : 'fold'))}`);
    await until(page, (n) => document.querySelectorAll('.scorebar .side.s-0 .tk:not(.spent)').length === n && window.__game.state.tokens[0] === n, chits - 1, 'my side to show one escalation token fewer');
    await until(page, () => window.__game.state.phase !== 'plan' || document.querySelector('[data-action=escalate]')?.disabled, null, 'Escalate to be disabled after escalating');
    log(`escalating spent a token (${chits} -> ${chits - 1})`);
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

  // Jump to the end of the match, with 2 points in the round's pot: the result counts them (a flip
  // win adds them, a fold pays them, a dead heat leaves them). (Unless the rival has folded the
  // round already, in its own time: then there is no pot to plant.)
  const potPlanted = await page.evaluate(() => {
    const g = window.__game;
    const open = g.state.phase === 'plan';
    if (open) g.state.round.pot = 2;
    g.state.scores = [9, 3];
    g.state.target = 1;
    g.finishRound();
    return open;
  });
  // A strip here may complete a reel, whose card comes before the result.
  await until(page, () => document.querySelector('[data-action=final]') && !window.__game.ui.card && !window.__game.ui.updating, null, 'the final report button');
  if (await page.$('.result.peek')) fail('See the board carried over into the next round');
  if (potPlanted) {
    const pr = await page.evaluate(() => {
      const v = window.__game.view;
      const res = v.round.result;
      return {
        text: document.querySelector('.result .lines')?.textContent.replace(/\s+/g, ' ') ?? '',
        folded: res.folded,
        winner: res.winner,
        strip: res.strip,
        city: v.round.film === null ? null : v.round.cities[v.round.film].id,
        stripLine: document.querySelector('.result .strip-line')?.textContent ?? null,
      };
    });
    const potSaid = pr.folded !== null ? /and the pot/.test(pr.text) : pr.winner !== null ? /pot of 2/.test(pr.text) : /rolls? into the next round|left on the table/.test(pr.text);
    if (!potSaid) fail(`the result should count the pot of 2: ${JSON.stringify(pr)}`);
    // The Microfilm's line: who took the strip (naming the film city), or why the film stays put.
    if (pr.strip !== null ? !pr.stripLine?.includes(CITY[pr.city].name) : pr.city !== null && !/the film stays put/.test(pr.text)) fail(`the result should say where the film went: ${JSON.stringify(pr)}`);
    log(`the pot in the result: ${pr.text}`);
  } else log('the rival folded round 2 before the jump: no pot to plant');
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
  await page.click('.pass-sheet [data-action=pass-start][data-choice=classic]');
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

  // Out of tokens: on a fresh table with my tokens gone (re-rendered through the table's own
  // change signal), Escalate is disabled and says so, and E does nothing. The rival locks in its
  // turn-1 drop behind the round card, so it makes no move of its own meanwhile.
  await page.evaluate(() => window.__game.startSolo('wren'));
  await until(page, () => document.querySelector('.title-card'), null, 'a round card on a fresh table');
  if (!(await page.evaluate(() => window.__game.rivalLocks()))) fail('the rival could not lock in before the no-tokens check');
  await clearCard(page);
  await until(page, () => !window.__game.ui.updating && !window.__game.ui.card, null, 'a quiet table to run out of tokens on');
  await page.evaluate(() => {
    window.__game.state.tokens[0] = 0;
    window.__game.table.touch();
  });
  await until(page, () => document.querySelector('[data-action=escalate]')?.disabled && !document.querySelector('.scorebar .side.s-0 .tk:not(.spent)'), null, 'Escalate disabled and no live chits with no tokens left');
  const noTokens = await page.evaluate(() => {
    const b = document.querySelector('[data-action=escalate]');
    return { label: b.getAttribute('aria-label'), left: b.querySelector('.left')?.textContent, spent: document.querySelectorAll('.scorebar .side.s-0 .tk.spent').length };
  });
  if (noTokens.label !== 'Escalate: no tokens left' || noTokens.left !== '0 left' || !noTokens.spent) fail(`with no tokens left Escalate should say so: ${JSON.stringify(noTokens)}`);
  await page.keyboard.press('e');
  const afterE = await page.evaluate(() => ({ pending: window.__game.state.round.pending, tokens: window.__game.state.tokens[0], escalated: window.__game.state.round.escalated.some(Boolean), flash: !!document.querySelector('.cine.flash'), phase: window.__game.state.phase }));
  if (afterE.pending !== null || afterE.tokens !== 0 || afterE.escalated || afterE.flash || afterE.phase !== 'plan') fail(`E with no tokens left should do nothing: ${JSON.stringify(afterE)}`);
  await snap(page, shot, 'no-tokens');
  await audit('no-tokens');
  log('no tokens left: Escalate disabled and labelled, E did nothing');

  // The pot's chit on the stake slip of a plan screen (a fresh table, the pot set through the
  // table's own change signal): it must sit on the slip, and on a phone the screen still fits.
  await page.evaluate(() => window.__game.startSolo('wren'));
  await until(page, () => document.querySelector('.title-card'), null, 'a round card on a fresh table for the pot');
  await clearCard(page);
  await until(page, () => window.__game.ui.screen === 'play' && !window.__game.ui.updating && !window.__game.ui.card && document.querySelector('.hand .card'), null, 'a quiet table for the pot');
  await page.evaluate(() => {
    window.__game.state.round.pot = 3;
    window.__game.table.touch();
  });
  await until(page, () => document.querySelector('.stake .pot, .pot'), null, 'the pot chit on the stake slip');
  const potBox = await page.evaluate(() => {
    const r = document.querySelector('.pot').getBoundingClientRect();
    return { text: document.querySelector('.pot').textContent, inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
  });
  if (potBox.text !== '+3' || !potBox.inView) fail(`the pot chit should read +3 and sit on screen: ${JSON.stringify(potBox)}`);
  await snap(page, shot, 'pot');
  await audit('pot');
  if (phone) {
    const fit = await phoneFits(page);
    const bad = Object.keys(fit).filter((k) => fit[k] === null || (k !== 'scorebarTop' && k !== 'scorebarHeight' && k !== 'innerHeight' && !(fit[k] <= fit.innerHeight)));
    if (bad.length || !(fit.scorebarTop >= 0)) fail(`with a pot the phone's plan screen should still fit: ${JSON.stringify(fit)}`);
  }
  log('the pot chit on a plan screen: on the slip and on screen');

  // The full reel: both sides one strip short, and the round ends at once (quickTurns, so no
  // reveal plays). Whoever takes this round's strip completes the reel, and its card comes up
  // before the result. Under the comeback film a round's winner takes no strip, so a round can
  // award none: then try again on a fresh table. Random drops award a strip in about one round in
  // four (measured on the engine), so twenty tables miss about one run in 300 (ten: one in 18).
  let reeled = null;
  let tables = 0;
  for (; tables < 20 && !reeled; tables++) {
    await page.evaluate(() => window.__game.startSolo('wren'));
    await clearCard(page);
    await until(page, () => !window.__game.ui.updating && !window.__game.ui.card, null, 'a quiet table for the full reel');
    // The card goes up inside finishRound(): hold it in the same step (it lasts 1.8 s).
    const r = await page.evaluate(() => {
      const g = window.__game;
      if (g.state.phase !== 'plan') return { open: false };
      g.state.strips = [g.state.reel - 1, g.state.reel - 1];
      g.finishRound();
      const card = !!document.querySelector('.cine.reel-card');
      if (card) g.holdCard();
      return { open: true, strip: g.view.round.result?.strip ?? null, winBy: g.state.winBy, winner: g.state.winner, card };
    });
    if (r.open && r.strip !== null) reeled = r;
  }
  if (!reeled) log('twenty fresh tables in a row awarded no strip of film, so the full reel was not checked');
  else {
    if (reeled.winBy !== 'reel' || reeled.winner !== reeled.strip) fail(`a strip that completes the reel should win the match: ${JSON.stringify(reeled)}`);
    if (!reeled.card) {
      await until(page, () => document.querySelector('.cine.reel-card'), null, 'the full reel card');
      await page.evaluate(() => window.__game.holdCard());
    }
    // Measured once the strip has run in through the gate (it starts off to the right).
    await snap(page, shot, 'reel-card');
    await audit('reel-card');
    const rc = await page.evaluate(() => {
      const el = document.querySelector('.cine.reel-card');
      const r = el.querySelector('.filmstrip')?.getBoundingClientRect();
      return { big: el.querySelector('.big')?.textContent.trim(), small: el.querySelector('.small')?.textContent.trim(), label: el.getAttribute('aria-label'), strip: !!r && r.left >= 0 && r.right <= innerWidth };
    });
    if (!/^the full reel$/i.test(rc.big || '') || !/strips?\. The match is/.test(rc.small || '') || !rc.strip) fail(`the full reel card should read "The full reel" and whose it is, its strip of film on screen: ${JSON.stringify(rc)}`);
    await page.keyboard.press('Enter');
    await until(page, () => !window.__game.ui.card && document.querySelector('.result [data-action=final]'), null, 'the result after the full reel card');
    await page.click('[data-action=final]');
    await until(page, () => document.querySelector('.over .dossier'), null, 'the dossier after the full reel');
    const dossier = await page.evaluate(() => document.querySelector('.over .dossier').textContent.replace(/\s+/g, ' '));
    if (!/full reel/.test(dossier)) fail(`the dossier of a match won on film should say so: ${dossier}`);
    await snap(page, shot, 'reel-dossier');
    await audit('reel-dossier');
    log(`the full reel on table ${tables}: "${rc.small}"; the dossier says so`);
  }

  // A fold that lands while the round card is up (Review Focus 4): the rival folds behind it, and
  // once the card goes, the fold flash plays, then the result with the fold line. Nothing stale
  // may paint over it. The card watcher records the flash, however short a slow step makes it.
  await page.evaluate(() => window.__game.startSolo('wren'));
  await until(page, () => document.querySelector('.title-card'), null, 'a round card to fold behind');
  await watchCards(page);
  const foldedBehind = await page.evaluate(() => {
    const g = window.__game;
    g.holdCard();
    return g.rivalFolds();
  });
  if (!foldedBehind) fail('the rival could not fold behind the round card');
  await page.keyboard.press('Enter');
  await until(page, () => window.__cines.some((c) => c.cls.includes('flash') && c.cls.includes('fold')), null, 'the fold flash once the round card has gone');
  await until(page, () => document.querySelector('.result .lines') && !window.__game.ui.card && !window.__game.ui.updating, null, 'the fold result after its flash');
  const fr = await page.evaluate(() => {
    const v = window.__game.view;
    return { phase: window.__game.state.phase, folded: v.round.result.folded, film: v.round.film, head: document.querySelector('.result h2').textContent.replace(/\s+/g, ' ').trim(), text: document.querySelector('.result .lines').textContent.replace(/\s+/g, ' '), plan: !!document.querySelector('[data-action=lock], .modal.hot') };
  });
  await page.evaluate(() => window.__cineWatch.disconnect());
  if (fr.phase !== 'round-over' || fr.folded !== 1 || !/folds/i.test(fr.head) || !/You score 1 \(the stake\)/.test(fr.text) || fr.plan) fail(`after the card, the rival's fold should show its result: ${JSON.stringify(fr)}`);
  if (fr.film !== null && !/A fold: the film stays put/.test(fr.text)) fail(`a fold awards no strip, and the result should say so: ${JSON.stringify(fr)}`);
  await snap(page, shot, 'fold-result');
  await audit('fold-result');
  log(`a fold behind the round card: the flash, then "${fr.text.trim()}"`);

  // My fold through the Fold button and its confirm, two turns in: my agents pull out of the round,
  // and See the board shows none of them left. (The 450 ms exit itself isn't caught: under load a
  // smoke would miss it.) Both turns go straight through the table while the round card holds the
  // rival, which then locks in its third drop, so it makes no move of its own.
  let quiet = false;
  for (let tries = 0; tries < 5 && !quiet; tries++) {
    await page.evaluate(() => window.__game.startSolo('wren'));
    await until(page, () => document.querySelector('.title-card'), null, 'a round card to play two turns behind');
    quiet = await page.evaluate(() => {
      const g = window.__game;
      g.quickTurns(2);
      return g.state.phase === 'plan' && g.rivalLocks();
    });
  }
  if (!quiet) fail('five fresh tables in a row left the rival nowhere to drop on turn 3');
  await clearCard(page);
  await until(page, () => !window.__game.ui.updating && !window.__game.ui.card && document.querySelector('[data-action=fold]'), null, 'turn 3 to fold on');
  const mine = await page.evaluate(() => document.querySelectorAll('#board .chip.own-0').length);
  await page.click('[data-action=fold]');
  await page.click('.modal [data-action=confirm-fold]');
  await until(page, () => document.querySelector('.result .lines') && !window.__game.ui.card && !window.__game.ui.updating, null, 'the result after my fold');
  await page.click('[data-action=peek]');
  await until(page, () => document.querySelector('.result.peek'), null, 'See the board after my fold');
  const leftOn = await page.evaluate(() => ({ chips: document.querySelectorAll('#board .chip.own-0').length, exfil: document.querySelectorAll('.exfil').length, folded: window.__game.state.round.folded[0] }));
  if (leftOn.chips || leftOn.exfil || !leftOn.folded) fail(`after my fold none of my agents should be left on the board: ${JSON.stringify(leftOn)}`);
  log(`my fold pulled ${mine} agent${mine === 1 ? '' : 's'} off the board`);
  await foldExit(page, { log, fail });

  // Mid-reveal, a click in any modal but help only skips the reveal: the quit modal's Leave
  // must not leave. Then leaving anyway (through the Leave action itself): the title is up at
  // once, the abandoned reveal runs out without a sound, and the title answers the very next
  // click. Sounds are counted as WebAudio sources created, with the music off (its own button;
  // back on at the end): the title theme rightly starts the moment the title is up, on a spy
  // chord of 21 sources, and is not the reveal's. (With the music on, the step passed only while
  // the pass and play victory cue still held the band, 2.3 s after it, so a slow run failed.)
  // The reveal's effects and city flourishes play with the music off, so they all still count.
  // One synchronous step, so the reveal is certainly still running.
  const musicOff = await page.evaluate(() => {
    const music = () => document.querySelector('[data-action=music]');
    window.__musicWasOn = music().getAttribute('aria-pressed') === 'true';
    if (window.__musicWasOn) music().click();
    const off = music().getAttribute('aria-pressed') === 'false';
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
    return off;
  });
  if (!musicOff) fail('the Music button should switch the music off');
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
  const wasOn = await page.evaluate(() => window.__musicWasOn);
  if (wasOn) await page.click('[data-action=music]');
  await until(page, (on) => document.querySelector('[data-action=music]')?.getAttribute('aria-pressed') === String(on), wasOn, 'the Music button to show what it showed before');
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
    return { escalated, up, prompt: !!fold, onFlash: !!hit?.closest('.cine.flash'), still: !!document.querySelector('.cine.flash'), pending: !!g.state.round.pending, focus: document.activeElement?.dataset.action ?? null, small: document.querySelector('.cine.flash .small')?.textContent };
  });
  if (!flashTap.escalated || !flashTap.up || !flashTap.prompt) fail(`the rival's escalation should put the prompt up under a flash: ${JSON.stringify(flashTap)}`);
  if (flashTap.small !== 'Agent Wren goes loud: the stake doubles') fail(`the escalation flash should say it in the story's words: ${JSON.stringify(flashTap)}`);
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
  // Once the flash has gone, the rival remarks on going loud, in the ticker.
  await until(page, (lines) => lines.includes(document.querySelector('#ticker')?.textContent.trim()), REMARKS.wren.escalate, 'Agent Wren’s remark on escalating');
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

  await newContent(page, { log, shot, audit, phone });
  await menus(page, { log, shot, audit, phone });
  await matchFrame(page, { log, shot, audit, phone });
}

/** On a phone, the plan screen must still show the scorebar, the cities, the hand and Lock in without scrolling. */
async function checkFits(page, when) {
  const fit = await phoneFits(page);
  // A missing part measures null, and null <= innerHeight is true: fail on it first.
  const missing = Object.keys(fit).filter((k) => fit[k] === null);
  const over = ['boardBottom', 'handBottom', 'lockBottom'].filter((k) => !(fit[k] <= fit.innerHeight));
  if (missing.length || over.length || !(fit.scorebarTop >= 0)) throw new Error(`${when}: the phone's plan screen should show the scorebar, the cities, the hand and Lock in without scrolling: ${JSON.stringify(fit)}`);
  return fit;
}

/** Record every line the ticker shows from now on in window.__said. */
const watchTicker = (page) =>
  page.evaluate(() => {
    window.__said = [];
    window.__sayWatch?.disconnect();
    let last = null;
    window.__sayWatch = new MutationObserver(() => {
      const t = document.querySelector('#ticker')?.textContent.trim();
      if (t && t !== last) window.__said.push((last = t));
    });
    window.__sayWatch.observe(document.querySelector('#app'), { childList: true, subtree: true, characterData: true });
  });

/** A staged table (__game.stage) is up: its plan screen, with no update running. */
async function staged(page, opts, what) {
  await page.evaluate((o) => window.__game.stage(o), opts);
  await until(page, () => window.__game.ui.screen === 'play' && !window.__game.ui.updating && !window.__game.ui.card && document.querySelector('.hand .card') && document.querySelector('[data-action=lock]'), null, what);
}

/** Lock in through the button with every animation skipped, and wait for the turn to resolve. */
async function lockSkipped(page, what) {
  const turn = await page.evaluate(() => {
    window.__game.skipAnimations(true);
    return window.__game.state.round.turn;
  });
  await page.click('[data-action=lock]');
  await until(page, (t) => window.__game.state.round.turn !== t && !window.__game.ui.animating && !window.__game.ui.updating, turn, what);
  await page.evaluate(() => window.__game.skipAnimations(false));
}

/**
 * Phase 2b-ii's new content on the table, each step on a table staged for it (__game.stage), with
 * the rival held (it locks in only when asked, away from the city the step drops in) and real clicks.
 * Exported so a scratch script can run these steps alone against the dev server.
 */
export async function newContent(page, { log, shot, audit, phone }) {
  const fail = (m) => {
    throw new Error(m);
  };
  // Nothing in these steps may make the reveal give up (main.js warns 'reveal animation skipped').
  const problems = [];
  const onConsole = (m) => {
    if (m.type() === 'error' || /reveal animation skipped/.test(m.text())) problems.push(m.text());
  };
  page.on('console', onConsole);
  const clean = (when) => problems.length && fail(`${when}: the console complained: ${problems.join(' | ')}`);
  try {
    // 1. An Accomplice and its partner, in Monaco: the prompt, a partner chosen (both ghosts), then
    // two chips land, the partner face down with its rings.
    await staged(page, { rival: 'countess', hand: ['accomplice', 'heavy'], cities: ['lisbon', 'monaco', 'berlin'] }, 'a table with an Accomplice and a Heavy');
    await page.click('.hand .card.k-accomplice');
    await page.click('#board .city.target[data-city="1"] .plate');
    const prompt = await page.evaluate(() => ({
      status: document.querySelector('.controls .status')?.textContent,
      candidates: document.querySelectorAll('.hand .card.candidate[data-action=partner]').length,
      alone: !!document.querySelector('[data-action=alone]'),
      lock: document.querySelector('[data-action=lock]')?.disabled,
    }));
    if (!/^Pick a partner to drop face down with your Accomplice, or drop it alone\./.test(prompt.status || '') || prompt.candidates !== 3 || !prompt.alone || !prompt.lock) fail(`an Accomplice in Monaco should ask for a partner, with Lock in waiting: ${JSON.stringify(prompt)}`);
    await snap(page, shot, 'partner-prompt');
    await audit('partner-prompt');
    if (phone) log(`partner prompt fits: ${JSON.stringify(await checkFits(page, 'the partner prompt'))}`);
    await page.click('.hand .card.k-heavy');
    await snap(page, shot, 'partner-chosen');
    if (phone) await checkFits(page, 'the partner chosen');
    const chosen = await page.evaluate(() => ({
      partner: window.__game.ui.partner,
      heavy: document.querySelector('.hand .card.k-heavy')?.dataset.uid,
      ghosts: document.querySelectorAll('#board .row[data-row="1-0"] .chip.ghost').length,
      mate: !!document.querySelector('#board .row[data-row="1-0"] .chip.ghost.fd.partner .mk-partner'),
      lock: document.querySelector('[data-action=lock]')?.disabled,
      status: document.querySelector('.controls .status')?.textContent,
    }));
    if (chosen.partner !== chosen.heavy || chosen.ghosts !== 2 || !chosen.mate || chosen.lock || !/^Lock in your Accomplice and Heavy \(face down\) for Monaco\./.test(chosen.status || '')) fail(`choosing the Heavy as partner should show both ghosts and arm Lock in: ${JSON.stringify(chosen)}`);
    if (!(await page.evaluate(() => window.__game.rivalLocks({ avoid: 1 })))) fail('the rival could not lock in away from Monaco');
    await lockSkipped(page, 'the Accomplice’s drop to resolve');
    const landed = await page.evaluate(() => ({
      chips: document.querySelectorAll('#board .row[data-row="1-0"] .chip').length,
      mates: document.querySelectorAll('#board .row[data-row="1-0"] .chip.fd.partner .mk-partner').length,
      view: window.__game.view.round.cities[1].sides[0].map((c) => `${c.kind}${c.partner ? '+partner' : ''}${c.faceDown ? '+down' : ''}`),
    }));
    if (landed.chips !== 2 || landed.mates !== 1 || landed.view.join() !== 'accomplice,heavy+partner+down') fail(`the Accomplice and its partner should both be in Monaco, the partner face down with its rings: ${JSON.stringify(landed)}`);
    await snap(page, shot, 'partner-landed');
    await audit('partner');
    log('an Accomplice asked for a partner, showed both ghosts and landed with its partner face down');

    // 2. Casablanca: the face is a choice, by default the agent's own (a Heavy: face up); V turns it.
    await staged(page, { rival: 'countess', hand: ['heavy'], cities: ['casablanca', 'lisbon', 'berlin'] }, 'a table with Casablanca');
    await page.click('.hand .card.k-heavy');
    await page.click('#board .city.target[data-city="0"] .plate');
    const face = () =>
      page.evaluate(() => {
        const b = document.querySelector('[data-action=face]');
        return b && { on: b.querySelector('.on')?.textContent, pressed: b.getAttribute('aria-pressed'), ghostDown: !!document.querySelector('#board .row[data-row="0-0"] .chip.ghost.fd'), status: document.querySelector('.controls .status')?.textContent };
      });
    const up = await face();
    if (!up || up.on !== 'Face up' || up.pressed !== 'false' || up.ghostDown) fail(`a Heavy aimed at Casablanca should offer its face, face up first: ${JSON.stringify(up)}`);
    await page.keyboard.press('v');
    const down = await face();
    if (down?.on !== 'Face down' || down.pressed !== 'true' || !down.ghostDown || !/face down\./.test(down.status || '')) fail(`V should turn the drop face down, ghost and all: ${JSON.stringify(down)}`);
    await snap(page, shot, 'casablanca');
    await audit('casablanca');
    if (phone) log(`Casablanca's toggle fits: ${JSON.stringify(await checkFits(page, 'Casablanca’s toggle'))}`);
    if (!(await page.evaluate(() => window.__game.rivalLocks({ avoid: 0 })))) fail('the rival could not lock in away from Casablanca');
    await lockSkipped(page, 'the Casablanca drop to resolve');
    const landedDown = await page.evaluate(() => ({ chip: !!document.querySelector('#board .row[data-row="0-0"] .chip.k-heavy.fd'), view: window.__game.view.round.cities[0].sides[0].find((c) => c.kind === 'heavy')?.faceDown }));
    if (!landedDown.chip || landedDown.view !== true) fail(`the Heavy should land face down in Casablanca: ${JSON.stringify(landedDown)}`);
    log('Casablanca: Face up by default, V turned it face down, and it landed face down');

    // 2b. The busiest plan screen: an Accomplice aimed at Casablanca asks for its face and for a
    // partner (Face up/down and Drop alone side by side), under the Countess's twist chip, with the
    // unseen strip open over the board. The staged rival is held, so nothing moves meanwhile.
    await staged(page, { rival: 'countess', hand: ['accomplice', 'heavy'], cities: ['casablanca', 'lisbon', 'berlin'] }, 'a table with an Accomplice and Casablanca');
    await page.click('.hand .card.k-accomplice');
    await page.click('#board .city.target[data-city="0"] .plate');
    await until(page, () => document.querySelector('.controls .choice [data-action=face]') && document.querySelector('.controls .choice [data-action=alone]'), null, 'both choices for an Accomplice aimed at Casablanca');
    await page.keyboard.press('u');
    await until(page, () => document.querySelector('.unseen-panel') && window.__game.ui.unseenOpen === 1, null, 'U to open the unseen strip over the two choices');
    const busy = await page.evaluate(() => {
      // One row when every choice overlaps the first one's height (the slips sit a few px askew).
      const boxes = [...document.querySelectorAll('.controls .choice button')].map((b) => b.getBoundingClientRect());
      return {
        face: !!document.querySelector('.controls .choice [data-action=face]'),
        alone: !!document.querySelector('.controls .choice [data-action=alone]'),
        rows: boxes.every((b) => b.top < boxes[0].bottom && b.bottom > boxes[0].top) ? 1 : 2,
        chip: !!document.querySelector('.scorebar .twist-chip'),
        strip: !!document.querySelector('.unseen-panel'),
        target: window.__game.ui.target,
        rival: window.__game.state.round.plans[1],
        status: document.querySelector('.controls .status')?.textContent,
      };
    });
    if (!busy.face || !busy.alone || !busy.chip || !busy.strip || busy.target !== 0 || busy.rival !== null || !/^Pick a partner to drop face down with your Accomplice, or drop it alone\./.test(busy.status || '')) fail(`an Accomplice aimed at Casablanca should offer its face and Drop alone under the twist chip, with the unseen strip open: ${JSON.stringify(busy)}`);
    await snap(page, shot, 'casablanca-accomplice');
    await audit('casablanca-accomplice');
    if (phone) log(`Accomplice at Casablanca, twist chip, unseen strip open (choices ${busy.rows === 1 ? 'on one row' : 'wrapped'}), phone fit: ${JSON.stringify(await checkFits(page, 'an Accomplice at Casablanca with the unseen strip open'))}`);
    await page.keyboard.press('Escape');
    await until(page, () => !document.querySelector('.unseen-panel') && document.querySelector('.controls .choice [data-action=alone]'), null, 'Escape to close the strip, leaving the choices up');
    log(`an Accomplice at Casablanca offered its face and Drop alone (${busy.rows === 1 ? 'on one row' : 'wrapped'}) under the twist chip, with the unseen strip open`);

    // 3. The Countess's tap on the final turn: the listening line, and she hears the city once I lock.
    let heard = null;
    for (let tries = 0; tries < 5 && !heard; tries++) {
      await staged(page, { rival: 'countess', cities: ['lisbon', 'monaco', 'moscow'] }, 'a Countess table');
      const open = await page.evaluate(() => {
        const g = window.__game;
        g.skipAnimations(true); // no final card: the night isn't what this step checks
        g.toFinalTurn();
        return g.state.phase === 'plan' && g.view.round.turn === 6 && g.view.round.legal.length > 0;
      });
      await until(page, () => !window.__game.ui.updating, null, 'the final turn to come up');
      await page.evaluate(() => window.__game.skipAnimations(false));
      if (!open) continue;
      const listen = await page.evaluate(() => document.querySelector('.controls .status')?.textContent);
      if (!/The Countess is listening: they’ll hear which city you pick\./.test(listen || '')) fail(`the Countess's tap should put the listening line in the status: ${listen}`);
      await snap(page, shot, 'listening');
      await page.click('.hand .card:not([disabled])');
      await page.click('#board .city.target .plate');
      if (await page.$('[data-action=alone]')) await page.click('[data-action=alone]');
      // Lock in, and in the same step read what the Countess's seat hears.
      heard = await page.evaluate(() => {
        document.querySelector('[data-action=lock]').click();
        const g = window.__game;
        return { plan: g.state.round.plans[0], tapped: g.table.view(1).round.tapped, status: document.querySelector('.controls .status')?.textContent };
      });
    }
    if (!heard) fail('five Countess tables in a row reached a final turn with nowhere to drop');
    // Her twist and a Wiretap she dropped on turn 5 can both tap the final turn: the engine keeps both
    // entries, so the check is on what she hears (one seat, one city), not on the count.
    const entries = new Set(heard.tapped.map((t) => `${t.seat}@${t.city}`));
    if (entries.size !== 1 || !heard.tapped.every((t) => t.seat === 0 && t.city === heard.plan?.city)) fail(`once I lock in, the Countess's view should hear my city: ${JSON.stringify(heard)}`);
    log(`the Countess was listening on the final turn and heard city ${heard.plan.city}`);

    // My own Wiretap: its flip says who is tapped next turn; next turn, a slip marks the city the rival locks.
    await staged(page, { rival: 'countess', hand: ['wiretap'], cities: ['lisbon', 'monaco', 'moscow'] }, 'a table with a Wiretap');
    await watchTicker(page);
    await page.click('.hand .card.k-wiretap');
    await page.click('#board .city.target[data-city="0"] .plate');
    if (!(await page.evaluate(() => window.__game.rivalLocks({ avoid: 0 })))) fail('the rival could not lock in away from the Wiretap');
    await page.click('[data-action=lock]');
    await until(page, () => window.__game.state.round.turn === 2 && !window.__game.ui.animating && !window.__game.ui.updating, null, 'the Wiretap’s turn to play out');
    const said = await page.evaluate(() => {
      window.__sayWatch.disconnect();
      return window.__said;
    });
    if (!said.includes('Your Wiretap is in: next turn you’ll hear which city The Countess picks.')) fail(`the Wiretap's flip should say who is tapped next turn: ${JSON.stringify(said)}`);
    const live = await page.evaluate(() => ({ slips: document.querySelectorAll('#board .plate .tapped').length, tapped: window.__game.view.round.tapped, status: document.querySelector('.controls .status')?.textContent }));
    if (live.slips || live.tapped.length !== 1 || live.tapped[0].city !== null) fail(`before the rival locks in, the tap is live with no slip: ${JSON.stringify(live)}`);
    const rivalCity = await page.evaluate(() => window.__game.rivalLocks() && window.__game.state.round.plans[1].city);
    await until(page, (ci) => document.querySelector(`#board .city[data-city="${ci}"] .plate .tapped`), rivalCity, 'the tapped slip on the city the rival locked');
    const slips = await page.evaluate(() => ({ n: document.querySelectorAll('#board .plate .tapped').length, label: document.querySelector('#board .plate .tapped')?.getAttribute('aria-label'), status: document.querySelector('.controls .status')?.textContent }));
    if (slips.n !== 1 || !/^Tapped: The Countess picked /.test(slips.label || '') || !/Your tap: The Countess picked /.test(slips.status || '')) fail(`one tapped slip should mark the rival's city: ${JSON.stringify(slips)}`);
    await snap(page, shot, 'tapped');
    await audit('tapped');
    log(`a Wiretap: "${said.find((t) => /Wiretap/.test(t))}", then the slip on city ${rivalCity}`);

    // 4. An Interrogator turns Mr Heron's placed Sleeper over, mid-reveal (held for the shot), then the reveal runs on.
    const roster = ['heavy', 'sleeper', 'veteran', 'double', 'jammer', 'handler', 'mole', 'getaway', 'lookout', 'assassin', 'tripwire', 'interrogator'];
    await staged(page, { rival: 'heron', roster, hand: ['interrogator'], cities: ['lisbon', 'monaco', 'moscow'] }, 'a Heron table with an Interrogator');
    const ci = await page.evaluate(() => window.__game.view.round.cities.findIndex((c) => c.sides[1].some((x) => x.placed)));
    if (ci < 0) fail('Mr Heron placed no card');
    await page.click('.hand .card.k-interrogator');
    await page.click(`#board .city.target[data-city="${ci}"] .plate`);
    // The reveal holds itself once the Interrogator's trick has played (holdAt), whatever the pace.
    await page.evaluate((c) => {
      window.__game.skipAnimations(false);
      window.__game.holdAt('interrogator');
      window.__game.rivalLocks({ avoid: c });
    }, ci);
    await page.click('[data-action=lock]');
    await until(page, () => window.__game.ui.animating && window.__game.ui.speed < 1, null, 'the reveal to hold once the Interrogator has played');
    const lit = await page.evaluate((c) => ({ acting: !!document.querySelector('#board .chip.acting.k-interrogator'), turned: !!document.querySelector(`#board .row[data-row="${c}-1"] .chip.k-sleeper.placed:not(.back)`), ticker: document.querySelector('#ticker')?.textContent.trim() }), ci);
    if (!lit.acting || !lit.turned || lit.ticker !== 'Interrogator: a face-down agent talks.') fail(`held at the Interrogator's moment, it should be lit with the placed Sleeper turned over: ${JSON.stringify(lit)}`);
    await snap(page, shot, 'interrogator');
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await idle(page);
    const asked = await page.evaluate((c) => window.__game.view.round.cities[c].sides[1].find((x) => x.placed), ci);
    if (asked?.kind !== 'sleeper' || asked.faceDown !== false) fail(`the Interrogator should leave the placed Sleeper face up: ${JSON.stringify(asked)}`);
    clean('the Interrogator’s reveal');
    log('an Interrogator turned the placed Sleeper over mid-reveal; the reveal ran on cleanly');

    // 5. Inspect: a rival's partner and Mr Heron's placed card, face down, read from faceDownText.
    const roster5 = ['heavy', 'sleeper', 'veteran', 'double', 'jammer', 'handler', 'mole', 'getaway', 'lookout', 'assassin', 'tripwire', 'accomplice'];
    await staged(page, { rival: 'heron', roster: roster5, rivalHand: ['accomplice'], cities: ['lisbon', 'monaco', 'moscow'] }, 'a Heron table with the rival’s Accomplice');
    // The rival drops its Accomplice with a partner that stays face down (not a Tripwire or a Decoy).
    const rc = await page.evaluate(() => {
      const g = window.__game;
      const v = g.table.view(1);
      const kind = (uid) => v.round.hand.find((c) => c.uid === uid)?.kind;
      const d = v.round.legal.find((x) => x.partner && kind(x.uid) === 'accomplice' && !['tripwire', 'decoy'].includes(kind(x.partner)));
      return d && g.table.act(1, { a: 'lock', ...d }) ? d.city : null;
    });
    if (rc === null) fail('the rival could not drop its Accomplice with a partner');
    await page.click('.hand .card:not([disabled])');
    await page.click(`#board .city.target:not([data-city="${rc}"]) .plate`);
    if (await page.$('[data-action=alone]')) await page.click('[data-action=alone]');
    await lockSkipped(page, 'the turn with the rival’s partner to resolve');
    const backs = await page.evaluate((c) => ({ partner: document.querySelector(`#board .row[data-row="${c}-1"] .chip.back.partner .mk-partner`)?.closest('.chip').dataset.uid, placed: document.querySelector('#board .chip.back.placed .mk-placed')?.closest('.chip').dataset.uid }), rc);
    if (!backs.partner || !backs.placed) fail(`a rival partner and a placed card should be face down with their marks: ${JSON.stringify(backs)}`);
    const ticker = () => page.evaluate(() => document.querySelector('#ticker')?.textContent.trim());
    await page.click(`#board .chip[data-uid="${backs.partner}"]`);
    await until(page, () => /^An Accomplice’s partner: it could be anything, with no tricks \(unless it’s a Tripwire or a Decoy\)\.$/.test(document.querySelector('#ticker')?.textContent.trim() || ''), null, 'the partner chip’s line in the ticker');
    log(`a rival's partner: "${await ticker()}"`);
    await page.click(`#board .chip[data-uid="${backs.placed}"]`);
    await until(page, () => /^Mr Heron placed this Sleeper before the round began\.$/.test(document.querySelector('#ticker')?.textContent.trim() || ''), null, 'the placed chip’s line in the ticker');
    await snap(page, shot, 'inspect-placed');
    await audit('inspect');
    log(`Mr Heron's placed card: "${await ticker()}"`);

    // Control has seen cards of my hand (its twist's count): each wears a Seen stamp, and says so.
    await staged(page, { rival: 'control' }, 'a Control table');
    const seen = await page.evaluate(() => ({
      count: window.__game.view.twist.count,
      labels: [...document.querySelectorAll('.hand .card')].filter((c) => c.querySelector('.stamp.seen')).map((c) => c.getAttribute('aria-label')),
    }));
    if (!seen.count || seen.labels.length !== seen.count || !seen.labels.every((l) => l.includes(', seen by Control'))) fail(`Control's twist should stamp the cards of my hand it has seen: ${JSON.stringify(seen)}`);
    await snap(page, shot, 'seen');
    await audit('seen');
    if (phone) await checkFits(page, 'the Seen stamp');
    log(`Control saw ${seen.count} card${seen.count === 1 ? '' : 's'}: stamped Seen`);
    clean('the new content steps');
  } finally {
    page.off('console', onConsole);
  }
}

/** The help sheet's text clears its cut: the body ends 12px above the sheet's bottom, the title 6px below its top. */
const helpClear = (page) =>
  page.evaluate(() => {
    const sheet = document.querySelector('.sheet').getBoundingClientRect();
    const body = document.querySelector('.sheet-body').getBoundingClientRect();
    const h2 = document.querySelector('.sheet h2').getBoundingClientRect();
    return body.bottom <= sheet.bottom - 12 && h2.top >= sheet.top + 6;
  });

/** Back to the title through the menu (Leave, then Leave in the modal), from a table. */
async function toTitle(page) {
  await page.click('[data-action=quit]');
  await page.click('.modal [data-action=title]');
  await until(page, () => document.querySelector('.title-screen'), null, 'the title screen');
}

/**
 * Phase 2b-ii's menus, with real clicks: the title's network counter, the rivals screen's ladder
 * (twists and packs) and free play, help by roster during a free-play match (and Continue for it),
 * pass and play's roster sheet, and a match saved by the 2b-i build resuming as Classic. Exported so a
 * scratch script can run these steps alone against the dev server.
 */
export async function menus(page, { log, shot, audit, phone }) {
  const fail = (m) => {
    throw new Error(m);
  };
  const problems = [];
  const onConsole = (m) => {
    if (m.type() === 'error') problems.push(m.text());
  };
  page.on('console', onConsole);
  const clean = (when) => problems.length && fail(`${when}: the console complained: ${problems.join(' | ')}`);
  const network = () => page.evaluate(() => document.querySelector('.title-screen .network')?.textContent.replace(/\s+/g, ' ').trim());
  try {
    // 1. The title counts your network: Classic to begin with; beating Wren and the Magpie adds the
    // Magpie's two agents and two cities (after a reload, from the saved profile).
    await page.evaluate(() => {
      window.__game.leave();
      window.__game.beat([]);
    });
    await until(page, () => document.querySelector('.title-screen .network'), null, 'the title with the network');
    const fresh = await network();
    if (fresh !== `Network: 12 of ${AGENTS.length} agents · 11 of ${CITIES.length} cities`) fail(`a new profile's network should be Classic: "${fresh}"`);
    // A ladder win recruits: beating the Magpie names her agents and cities in a toast.
    await page.evaluate(() => {
      const g = window.__game;
      g.beat(['wren']);
      g.skipAnimations(true);
      g.startSolo('magpie');
      // A margin no round can close: on the Magpie's Mixed table a flipped Blackmailer and Macau
      // can score 6, which from 3 would tie 9 and leave the match on.
      g.state.scores = [30, 0];
      g.state.target = 1;
      g.finishRound();
    });
    await until(page, () => /^Recruited: /.test(document.querySelector('.toast')?.textContent || ''), null, 'the recruits toast');
    const recruited = await page.evaluate(() => ({ toast: document.querySelector('.toast').textContent, beaten: window.__game.meta.beaten.join(), winner: window.__game.state.winner }));
    if (recruited.toast !== 'Recruited: Courier and Blackmailer. Tokyo and Macau join your network.' || recruited.beaten !== 'wren,magpie' || recruited.winner !== 0) fail(`a ladder win over the Magpie should recruit her pack: ${JSON.stringify(recruited)}`);
    await page.evaluate(() => {
      window.__game.skipAnimations(false);
      window.__game.leave();
    });
    log(`ladder win: "${recruited.toast}"`);
    await page.evaluate(() => window.__game.beat(['wren', 'magpie']));
    await page.reload();
    await until(page, () => window.__game && document.querySelector('.title-screen .network'), null, 'the title after a reload');
    const grown = await network();
    if (grown !== `Network: 14 of ${AGENTS.length} agents · 13 of ${CITIES.length} cities`) fail(`beating the Magpie should grow the network to 14 and 13: "${grown}"`);
    const tagline = await page.evaluate(() => document.querySelector('.tagline')?.textContent);
    if (!/^Winter, 1963\./.test(tagline || '') || /for two/.test(tagline)) fail(`the title's tagline should be the story's: "${tagline}"`);
    await snap(page, shot, 'title-network');
    log(`title: ${fresh}, then ${grown}`);

    // 2. The rivals screen. On the ladder the Magpie (met: beaten) shows its twist and its pack; Mr
    // Heron, open but not met, says what he brings. Free play is open, and lists Wren and the Magpie.
    await page.click('[data-action=rivals]');
    await until(page, () => document.querySelector('.rivals-screen .rival'), null, 'the rivals screen');
    const ladder = await page.evaluate(() => {
      const row = (id) => document.querySelector(`.rival[data-id=${id}]`);
      const m = row('magpie');
      return {
        head: document.querySelector('.rivals-screen h2')?.textContent.replace(/\s+/g, ''),
        twist: m?.querySelector('.twist')?.textContent.replace(/^Twist\s*/, '').trim(),
        pack: [...(m?.querySelectorAll('.pack .mini') ?? [])].map((x) => x.textContent.trim()),
        art: m?.querySelectorAll('.pack .mini svg').length,
        heron: row('heron')?.querySelector('.brings')?.textContent.trim(),
        heronTwist: !!row('heron')?.querySelector('.twist'),
        countess: { disabled: row('countess')?.disabled, twist: !!row('countess')?.querySelector('.twist') },
        free: document.querySelector('[data-action=rivals-tab][data-choice=free]')?.disabled,
        pressed: document.querySelector('[data-action=rivals-tab][aria-pressed=true]')?.dataset.choice,
      };
    });
    if (ladder.head !== 'Rivalservices') fail(`the rivals screen should be headed "Rival services": ${ladder.head}`);
    if (ladder.twist !== twistText('magpie') || ladder.pack.join() !== 'Courier,Blackmailer,Tokyo,Macau' || ladder.art !== 4) fail(`the Magpie's row should show its twist and its pack: ${JSON.stringify(ladder)}`);
    if (ladder.heron !== 'Brings two new agents and two new cities.' || !ladder.heronTwist) fail(`Mr Heron's row (open, not met) should show his twist and what he brings: ${JSON.stringify(ladder)}`);
    if (!ladder.countess.disabled || ladder.countess.twist) fail(`the Countess is locked, with no twist shown yet: ${JSON.stringify(ladder)}`);
    if (ladder.free !== false || ladder.pressed !== 'ladder') fail(`free play should be open, with the ladder chosen: ${JSON.stringify(ladder)}`);
    await snap(page, shot, 'rivals-ladder');
    await audit('rivals-ladder');
    await page.click('[data-action=rivals-tab][data-choice=free]');
    await until(page, () => document.querySelector('[data-action=rivals-tab][data-choice=free][aria-pressed=true]'), null, 'free play');
    const free = await page.evaluate(() => [...document.querySelectorAll('.rival')].map((r) => ({ id: r.dataset.id, free: r.dataset.free, blurb: r.querySelector('.blurb')?.textContent })));
    if (free.map((r) => r.id).join() !== 'wren,magpie' || !free.every((r) => r.free === '1' && r.blurb === 'Mixed: your network · no twist')) fail(`free play should list Wren and the Magpie, each on your network with no twist: ${JSON.stringify(free)}`);
    await snap(page, shot, 'rivals-free');
    await audit('rivals-free');
    log('rivals: the Magpie’s twist and pack on the ladder; free play lists Wren and the Magpie');

    // 4. Help with a Mixed match on: free play against the Magpie deals 12 of the network's 14 agents
    // (no twist), so the Agents tab has all three sections: 12 tonight, 2 more in the network and the
    // 6 not yet recruited. The rival is held meanwhile, so no escalation flash takes the clicks.
    await page.evaluate(() => window.__game.holdRival(true));
    await page.click('.rival[data-id=magpie][data-free="1"]');
    await clearCard(page);
    // A drop saves the match (the rival, held, doesn't answer it, so the turn waits).
    await dropFirst(page);
    await until(page, () => window.__game.view.round.plan && localStorage.getItem('cg:dead-drop:match'), null, 'the free-play match saved');
    const match = await page.evaluate(() => {
      const g = window.__game;
      return { roster: g.state.roster, twist: g.state.twist, mixed: g.table.setup.mixed, free: g.ui.free, saved: JSON.parse(localStorage.getItem('cg:dead-drop:match')).free };
    });
    const net14 = [...DECK, 'courier', 'blackmailer'];
    if (match.roster.length !== 12 || !match.roster.every((id) => net14.includes(id)) || match.twist !== null || !match.mixed || !match.free || match.saved !== true) fail(`free play should deal Mixed from the network, with no twist, and save as free play: ${JSON.stringify(match)}`);
    await page.click('[data-action=help]');
    await page.waitForSelector('.sheet.help');
    await page.click('[role=tab][data-tab=agents]');
    await until(page, () => window.__game.ui.helpTab === 'agents' && document.querySelector('.help-sec'), null, 'the Agents tab');
    const agents = await page.evaluate(() =>
      [...document.querySelectorAll('.help-sec')].map((sec) => ({
        title: sec.querySelector('h3')?.textContent,
        names: [...sec.querySelectorAll('li b')].map((b) => b.firstChild.textContent.trim()),
        notes: [...sec.querySelectorAll('li .note')].map((n) => n.textContent),
        recruit: [...sec.querySelectorAll('li .recruit')].map((n) => n.textContent),
      })),
    );
    const titles = agents.map((sec) => sec.title).join(' | ');
    if (titles !== 'Tonight’s roster | In your network | Not yet recruited' || agents[0].names.length !== 12 || agents[1].names.length !== 2 || agents[2].names.length !== 6) fail(`help's Agents tab should show tonight's 12, the network's other 2 and the 6 not yet recruited: ${JSON.stringify(agents)}`);
    const tonight = match.roster.map((id) => AGENT[id]);
    if (agents[0].names.join() !== tonight.map((a) => a.name).join() || agents[0].notes.join('|') !== tonight.filter((a) => a.note).map((a) => a.note).join('|')) fail(`tonight's roster should list the view's roster in order, each with its note: ${JSON.stringify(agents[0])}`);
    if (!agents[2].recruit.length || !agents[2].recruit.every((r) => /^Beat (Mr Heron|The Countess|Control) to recruit\.$/.test(r))) fail(`the agents not yet recruited should say whom to beat: ${JSON.stringify(agents[2])}`);
    if (!(await helpClear(page))) fail('help sheet text runs into the cut (Agents, Mixed)');
    await snap(page, shot, 'help-agents-mixed');
    await audit('help-agents-mixed');
    await page.evaluate(() => document.querySelector('.help-sec.locked').scrollIntoView({ block: 'start' }));
    await snap(page, shot, 'help-agents-locked');
    await page.click('[role=tab][data-tab=cities]');
    await until(page, () => window.__game.ui.helpTab === 'cities' && document.querySelector('.help-sec .city-list'), null, 'the Cities tab');
    const cities = await page.evaluate(() =>
      [...document.querySelectorAll('.help-sec')].map((sec) => ({ title: sec.querySelector('h3')?.textContent, notes: [...sec.querySelectorAll('.note')].map((n) => n.textContent), n: sec.querySelectorAll('li').length })),
    );
    const pool = [...CLASSIC_CITIES, 'tokyo', 'macau'].map((id) => CITY[id]);
    if (cities[0]?.title !== 'Tonight’s cities' || cities[0].n !== 13 || cities[0].notes.join('|') !== pool.filter((c) => c.note).map((c) => c.note).join('|') || cities.at(-1)?.title !== 'Not yet recruited') fail(`help's Cities tab should show tonight's pool with every note, then the cities not yet recruited: ${JSON.stringify(cities)}`);
    await snap(page, shot, 'help-cities-mixed');
    await page.keyboard.press('Escape');
    log(`help by roster: ${agents.map((sec) => `${sec.title} ${sec.names.length}`).join(', ')}; cities with ${cities[0].notes.length} notes`);

    // Continue resumes free play: the title says so, and the table comes back as it was.
    await toTitle(page);
    const cont = await page.evaluate(() => document.querySelector('[data-action=continue]')?.textContent.trim());
    if (cont !== 'Continue free play against The Magpie') fail(`the title should offer to continue free play: "${cont}"`);
    await page.click('[data-action=continue]');
    await until(page, () => window.__game.ui.screen === 'play' && document.querySelector('.hand .card'), null, 'free play resumed');
    await clearCard(page);
    const back = await page.evaluate(() => ({ free: window.__game.ui.free, roster: window.__game.state.roster, mixed: window.__game.table.setup.mixed }));
    if (!back.free || !back.mixed || back.roster.join() !== match.roster.join()) fail(`Continue should resume free play with its roster: ${JSON.stringify(back)}`);
    await toTitle(page);
    await page.evaluate(() => window.__game.holdRival(false));
    log('free play saved and continued');

    // 3. Pass and play asks for a roster: Escape closes the sheet; Mixed deals 12 of all 20 agents.
    await page.click('[data-action=pass]');
    await until(page, () => document.querySelector('.pass-sheet [data-action=pass-start][data-choice=mixed]'), null, 'the pass and play sheet');
    const sheet = await page.evaluate(() => ({
      primary: document.querySelector('.pass-sheet .slip.primary')?.dataset.choice,
      labels: [...document.querySelectorAll('.pass-sheet [data-action=pass-start] > span')].map((x) => x.textContent),
    }));
    if (sheet.primary !== 'classic' || sheet.labels.join('|') !== `Classic|Mixed: all ${AGENTS.length} agents and cities`) fail(`the pass and play sheet should offer Classic (primary) and Mixed: ${JSON.stringify(sheet)}`);
    await snap(page, shot, 'pass-roster');
    await audit('pass-roster');
    await page.keyboard.press('Escape');
    await until(page, () => !document.querySelector('.pass-sheet') && document.querySelector('.title-screen'), null, 'Escape to close the pass and play sheet');
    await page.click('[data-action=pass]');
    await page.click('.pass-sheet [data-action=pass-start][data-choice=mixed]');
    // Behind the intro cards no hand is uncovered: the dimmed table names the operation and who is
    // next, as the cover will, never a spectator's "Nowhere to drop this turn".
    await until(page, () => document.querySelector('.roster-card, .title-card') && document.querySelector('.play .controls .status'), null, 'an intro card over the pass and play table');
    const behind = await page.evaluate(() => ({ status: document.querySelector('.play .controls .status').textContent, id: window.__game.view.matchId }));
    const wantBehind = `Operation ${operation(behind.id, 0).name}. Pass the device to Red.`;
    if (behind.status !== wantBehind) fail(`behind pass and play's intro cards the status should read "${wantBehind}": ${JSON.stringify(behind)}`);
    await clearCard(page);
    await page.waitForSelector('.cover');
    const mixed = await page.evaluate(() => ({ roster: window.__game.view.roster, mixed: window.__game.table.setup.mixed, mode: window.__game.ui.mode }));
    if (mixed.mode !== 'pass' || !mixed.mixed || mixed.roster.length !== 12 || !mixed.roster.includes('heavy') || new Set(mixed.roster).size !== 12) fail(`Mixed pass and play should deal a roster of 12: ${JSON.stringify(mixed)}`);
    log(`pass and play Mixed: ${mixed.roster.join(', ')}`);
    await page.click('[data-action=quit]');
    await page.click('.modal [data-action=title]');
    await until(page, () => document.querySelector('.title-screen'), null, 'the title screen');

    // 6. A match saved by the 2b-i build (no setup, the stake escalated to 2, my turn-2 drop locked)
    // resumes as Classic, with no toast. The rival is held, so the turn waits for the real UI: I take
    // my drop back and drop again, then the rival locks in and the turn resolves.
    const v2 = readFileSync(new URL('./test/golden/v2-table.json', import.meta.url), 'utf8');
    // The fixture's table seats Mr Heron, so the save names him as the rival.
    await page.evaluate((json) => localStorage.setItem('cg:dead-drop:match', JSON.stringify({ mode: 'solo', rival: 'heron', table: JSON.parse(json) })), v2);
    await page.reload();
    await until(page, () => window.__game && document.querySelector('.title-screen'), null, 'the title after the 2b-i save');
    const offer = await page.evaluate(() => ({ cont: document.querySelector('[data-action=continue]')?.textContent.trim(), toast: document.querySelector('.toast')?.textContent ?? null }));
    if (offer.cont !== 'Continue against Mr Heron' || offer.toast !== null) fail(`a 2b-i save should be offered with no toast: ${JSON.stringify(offer)}`);
    await page.evaluate(() => window.__game.holdRival(true));
    await page.click('[data-action=continue]');
    await until(page, () => window.__game.ui.screen === 'play' && document.querySelector('.hand .card') && !window.__game.ui.updating, null, 'the 2b-i table');
    await clearCard(page);
    const resumed = await page.evaluate(() => {
      const g = window.__game;
      return { stake: g.view.round.stake, shown: document.querySelector('.scorebar .stake b')?.textContent, turn: g.view.round.turn, roster: g.state.roster, pool: g.state.cityPool, mixed: g.table.setup.mixed, plan: !!g.view.round.plan };
    });
    if (resumed.stake !== 2 || resumed.shown !== '2' || resumed.turn !== 2 || resumed.roster.join() !== DECK.join() || resumed.pool.join() !== CLASSIC_CITIES.join() || resumed.mixed || !resumed.plan) fail(`the 2b-i save should resume as Classic at stake 2, turn 2, with my drop locked: ${JSON.stringify(resumed)}`);
    await snap(page, shot, 'resume-2b1');
    await audit('resume-2b1');
    await page.click('[data-action=unlock]');
    await until(page, () => !window.__game.view.round.plan && document.querySelector('[data-action=lock]'), null, 'my drop taken back');
    await dropFirst(page);
    await until(page, () => !!window.__game.view.round.plan, null, 'my drop locked again');
    if (!(await page.evaluate(() => window.__game.rivalLocks()))) fail('the rival could not lock in on the 2b-i table');
    await until(page, () => (window.__game.ui.animating && (window.__game.ui.skip = true), window.__game.state.round.turn === 3 && !window.__game.ui.animating && !window.__game.ui.updating), null, 'turn 2 to resolve on the 2b-i table');
    await page.evaluate(() => window.__game.holdRival(false));
    log('a 2b-i save resumed as Classic at stake 2, and its turn resolved');
    await toTitle(page);
    clean('the menu steps');
  } finally {
    page.off('console', onConsole);
  }
}

/**
 * Phase 2b-ii's match frame, with every card played and real keys and clicks: a first meeting (the
 * Magpie's dossier, tonight's roster with her two new agents, C's cable on the round card, the rival
 * held behind all three) and none the second time; the unseen strip after a turn (U, its list and
 * counts, the board left where it was, an outside tap); the twist chip; and the epilogue after a
 * ladder win over Control, before the dossier, whose rounds carry their operations' names. Exported
 * so a scratch script can run these steps alone against the dev server.
 */
export async function matchFrame(page, { log, shot, audit, phone }) {
  const fail = (m) => {
    throw new Error(m);
  };
  const problems = [];
  const onConsole = (m) => {
    if (m.type() === 'error') problems.push(m.text());
  };
  page.on('console', onConsole);
  const clean = (when) => problems.length && fail(`${when}: the console complained: ${problems.join(' | ')}`);
  /** Wait for the card `sel`, hold it still, and read whether the rival has made its turn-1 drop. */
  const held = async (sel, what) => {
    await until(page, (s) => document.querySelector(s), sel, what);
    return page.evaluate(() => {
      window.__game.holdCard();
      return window.__game.state.round.plans[1];
    });
  };
  try {
    // 1. A first meeting: with nothing met, the Magpie's ladder match opens on her dossier, then
    // tonight's roster (her Courier and Blackmailer stamped New), then round 1's card with the cable.
    // The rival waits behind every one of them, and moves once they have gone.
    await page.evaluate(() => {
      const g = window.__game;
      g.leave();
      g.holdRival(false);
      g.skipAnimations(false);
      g.beat(['wren']);
      g.meta.met = { agents: [], cities: [], rivals: [] };
      g.startSolo('magpie');
    });
    if ((await held('.dossier-card', 'the Magpie’s dossier')) !== null) fail('the rival locked in behind the dossier');
    const dossier = await page.evaluate(() => {
      const el = document.querySelector('.dossier-card');
      return {
        stamp: el.querySelector('.dossier-stamp')?.textContent,
        name: el.querySelector('.who')?.textContent.replace(/\s+/g, ' ').trim(),
        file: el.querySelector('.file')?.textContent,
        twist: el.querySelector('.twist')?.textContent.replace(/^Twist\s*/, '').trim(),
        pack: [...el.querySelectorAll('.pack .mini')].map((m) => m.textContent.trim()),
        art: el.querySelectorAll('.pack .mini svg').length,
        label: el.getAttribute('aria-label'),
      };
    });
    if (dossier.stamp !== 'Dossier' || dossier.name !== 'The Magpie' || dossier.file !== DOSSIERS.magpie || dossier.twist !== twistText('magpie') || dossier.pack.join() !== 'Courier,Blackmailer,Tokyo,Macau' || dossier.art !== 4) fail(`the Magpie's dossier should show the stamp, her name, her file, her twist and her pack: ${JSON.stringify(dossier)}`);
    await snap(page, shot, 'dossier');
    await audit('dossier');
    await page.keyboard.press('Enter');
    if ((await held('.roster-card', 'the roster card')) !== null) fail('the rival locked in behind the roster card');
    const roster = await page.evaluate(() => {
      const el = document.querySelector('.roster-card');
      return {
        roster: window.__game.view.roster,
        sub: el.querySelector('.sub')?.textContent,
        minis: [...el.querySelectorAll('.mc .nm')].map((n) => n.textContent),
        fresh: [...el.querySelectorAll('.mc.new .nm')].map((n) => n.textContent),
        tags: el.querySelectorAll('.mc .new-tag').length,
        news: [...el.querySelectorAll('.news-line')].map((l) => ({ name: l.querySelector('h3').firstChild.textContent.trim(), text: l.querySelector('p:not(.note)')?.textContent, note: l.querySelector('.note')?.textContent ?? null })),
      };
    });
    const want = (id) => ({ name: AGENT[id].name, text: AGENT[id].text, note: AGENT[id].note ?? null });
    if (roster.minis.join() !== roster.roster.map((id) => AGENT[id].name).join() || roster.minis.length !== 12) fail(`the roster card should deal tonight's 12 agents in order: ${JSON.stringify(roster)}`);
    // Her deck holds one card more than the roster (her twist), and the card says so.
    if (roster.sub !== 'Every deck at the table holds these 12 agents. The Magpie carries one more: an extra Lookout.') fail(`the roster card should count the shared roster and the Magpie's extra card: ${JSON.stringify(roster.sub)}`);
    if (roster.fresh.join() !== 'Courier,Blackmailer' || roster.tags !== 2 || JSON.stringify(roster.news) !== JSON.stringify(['courier', 'blackmailer'].map(want))) fail(`the roster card should stamp the Courier and the Blackmailer New, with their text and notes: ${JSON.stringify(roster)}`);
    await snap(page, shot, 'roster-card');
    await audit('roster-card');
    await page.keyboard.press('Enter');
    if ((await held('.title-card', 'round 1’s card')) !== null) fail('the rival locked in behind the round card');
    const card = await page.evaluate(() => {
      const el = document.querySelector('.title-card');
      const v = window.__game.view;
      return {
        view: { matchId: v.matchId, roundNo: v.roundNo, round: { cities: v.round.cities.map((c) => ({ id: c.id })), film: v.round.film } },
        said: el.querySelector('.cable .vh')?.textContent,
        typed: el.querySelector('.cable .typed')?.textContent,
        fresh: [...el.querySelectorAll('.line.new h3')].map((h) => h.textContent),
        stamps: el.querySelectorAll('.line .new-tag').length,
        notes: [...el.querySelectorAll('.line.new .note')].map((n) => n.textContent),
      };
    });
    // 2. The cable names the operation, the three dealt cities and the film city, as story.js writes it.
    const wire = cable(card.view);
    const sites = card.view.round.cities.map((c) => CITY[c.id].name.toUpperCase());
    const filmSaid = card.view.round.film === null || wire.includes(`THE FILM TRAVELS VIA ${sites[card.view.round.film]}.`);
    if (card.said !== wire || card.typed !== wire || !wire.includes(`SITES: ${sites.join(', ')}.`) || !filmSaid || !wire.startsWith(`OPERATION ${operation(card.view.matchId, 0).name.toUpperCase()}.`)) fail(`the round card's cable should name the operation, the three cities and the film city: ${JSON.stringify({ card, wire })}`);
    const newCities = card.view.round.cities.map((c) => c.id).filter((id) => !CLASSIC_CITIES.includes(id));
    if (card.fresh.join() !== newCities.map((id) => CITY[id].name).join() || card.stamps !== newCities.length || card.notes.join('|') !== newCities.filter((id) => CITY[id].note).map((id) => CITY[id].note).join('|')) fail(`the cities met for the first time should be stamped New, with their notes: ${JSON.stringify(card)}`);
    await snap(page, shot, 'cable');
    await audit('cable');
    await page.keyboard.press('Enter');
    await until(page, () => !window.__game.ui.card && window.__game.ui.screen === 'play' && document.querySelector('.hand .card'), null, 'the table after the intro');
    // Held by the cards, the rival makes its first move once they have gone.
    await until(page, () => window.__game.state.round.plans[1] || window.__game.state.round.pending || window.__game.state.phase !== 'plan', null, 'the rival to move once the cards had gone');
    const met = await page.evaluate(() => window.__game.meta.met);
    if (!met.rivals.includes('magpie') || !['courier', 'blackmailer'].every((id) => met.agents.includes(id)) || !newCities.every((id) => met.cities.includes(id))) fail(`a first meeting should be recorded: ${JSON.stringify(met)}`);
    log(`first meeting: the Magpie's dossier, the roster (New: ${roster.fresh.join(', ')}), then "${wire}"${newCities.length ? ` with ${newCities.map((id) => CITY[id].name).join(', ')} stamped New` : ''}; the rival waited behind all three`);

    // The second meeting: no dossier, and nothing on the roster card is new. (A city never dealt
    // before may still be new on the round card: only the ones met in the first match are checked.)
    await page.evaluate(() => window.__game.startSolo('magpie'));
    await until(page, () => document.querySelector('.cine'), null, 'the second Magpie match’s first card');
    const again = await page.evaluate(() => ({ dossier: !!document.querySelector('.dossier-card'), roster: !!document.querySelector('.roster-card'), tags: document.querySelectorAll('.new-tag').length, news: document.querySelectorAll('.news-line').length }));
    if (again.dossier || !again.roster || again.tags || again.news) fail(`meeting the Magpie again should open on the roster card, with nothing new: ${JSON.stringify(again)}`);
    await page.keyboard.press('Enter');
    await held('.title-card', 'the second match’s round card');
    const stamped = await page.evaluate(() => [...document.querySelectorAll('.title-card .line.new')].map((l) => l.querySelector('h3').textContent));
    const metBefore = met.cities.map((id) => CITY[id].name);
    if (stamped.some((name) => metBefore.includes(name))) fail(`a city met in the first match is stamped New again: ${JSON.stringify(stamped)}`);
    await page.keyboard.press('Enter');
    await until(page, () => !window.__game.ui.card, null, 'the second match’s table');
    log('the second meeting: no dossier, and no New tags');

    // 3. The unseen strip, on a staged Magpie table (her 13 agents): she drops a Heavy face up and I drop
    // through the UI. U opens the strip over the board, without moving it: her deck list minus what this
    // round has shown, and her hand and deck counts. An outside tap closes it; so does Escape.
    await staged(page, { rival: 'magpie', rivalHand: ['heavy'], cities: ['lisbon', 'monaco', 'moscow'] }, 'a Magpie table for the unseen strip');
    if (!(await page.evaluate(() => window.__game.rivalLocks()))) fail('the Magpie could not lock in on the staged table');
    await page.evaluate(() => window.__game.skipAnimations(true));
    await dropFirst(page);
    await until(page, () => window.__game.state.round.turn === 2 && !window.__game.ui.animating && !window.__game.ui.updating, null, 'turn 1 to resolve for the unseen strip');
    await page.evaluate(() => window.__game.skipAnimations(false));
    const boardTop = () => page.evaluate(() => Math.round(document.querySelector('#board').getBoundingClientRect().top));
    const top0 = await boardTop();
    await page.keyboard.press('u');
    await until(page, () => document.querySelector('.unseen-panel'), null, 'U to open the unseen strip');
    const strip = await page.evaluate(() => {
      const v = window.__game.view;
      const panel = document.querySelector('.unseen-panel');
      const btn = document.querySelector('[data-action=unseen]');
      return {
        view: { seat: v.seat, roster: v.roster, twist: v.twist, round: { cities: v.round.cities, gone: v.round.gone, hand: v.round.hand, events: v.round.events } },
        counts: [v.round.handCounts[1], v.round.deckCounts[1]],
        names: [...panel.querySelectorAll('.unseen-list li')].map((li) => li.textContent.trim()),
        head: panel.querySelector('.unseen-head span')?.textContent,
        expanded: btn.getAttribute('aria-expanded'),
        count: btn.querySelector('b')?.textContent,
      };
    });
    const seen = sightings(strip.view).filter((x) => x.origin === 1).map((x) => x.id0);
    const left = unseen(deckList(strip.view, 1), seen).map((id) => AGENT[id].name);
    if (!seen.includes('heavy') || strip.names.join() !== left.join() || strip.count !== String(left.length) || strip.expanded !== 'true') fail(`the unseen strip should list the Magpie's deck list minus what was seen: ${JSON.stringify({ seen, left, strip: { ...strip, view: undefined } })}`);
    if (strip.head !== `Hand ${strip.counts[0]} · Deck ${strip.counts[1]}`) fail(`the unseen strip's counts should be the Magpie's hand and deck: ${JSON.stringify({ head: strip.head, counts: strip.counts })}`);
    if ((await boardTop()) !== top0) fail('opening the unseen strip moved the board');
    await snap(page, shot, 'unseen');
    await audit('unseen');
    if (phone) log(`unseen strip open, phone fit: ${JSON.stringify(await checkFits(page, 'the unseen strip open'))}`);
    await page.click('#ticker');
    await until(page, () => !document.querySelector('.unseen-panel') && document.querySelector('[data-action=unseen]')?.getAttribute('aria-expanded') === 'false', null, 'an outside tap to close the unseen strip');
    await page.keyboard.press('u');
    await until(page, () => document.querySelector('.unseen-panel'), null, 'U to open the strip again');
    await page.keyboard.press('Escape');
    await until(page, () => !document.querySelector('.unseen-panel'), null, 'Escape to close the strip');
    // The strip is for planning: open it, pick a drop and lock in by key, and the reveal plays without it.
    if (!(await page.evaluate(() => window.__game.rivalLocks()))) fail('the Magpie could not lock in her turn-2 drop');
    const pickable = '.card:not([disabled]):not(.k-blackmailer):not(.k-accomplice)';
    await page.click((await page.$(pickable)) ? pickable : '.card:not([disabled])');
    await page.click('.city.target .plate');
    if (await page.$('[data-action=alone]')) await page.click('[data-action=alone]');
    await page.keyboard.press('u');
    await until(page, () => document.querySelector('.unseen-panel'), null, 'the strip open before locking in');
    await page.keyboard.press('Enter');
    const during = await page.evaluate(() => ({ animating: window.__game.ui.animating, turn: window.__game.state.round.turn, open: window.__game.ui.unseenOpen, panel: !!document.querySelector('.unseen-panel'), expanded: document.querySelector('[data-action=unseen]')?.getAttribute('aria-expanded') }));
    if (!during.animating || during.open !== null || during.panel || during.expanded !== 'false') fail(`locking in should start the reveal with the unseen strip closed: ${JSON.stringify(during)}`);
    await page.evaluate(() => window.__game.skipAnimations(true));
    await until(page, () => window.__game.state.round.turn === 3 && !window.__game.ui.animating && !window.__game.ui.updating, null, 'turn 2’s reveal to end');
    await page.evaluate(() => window.__game.skipAnimations(false));
    if (await page.$('.unseen-panel')) fail('the unseen strip came back after the reveal');
    log(`unseen strip: ${left.length} of ${deckList(strip.view, 1).length} unseen (${strip.head}); an outside tap and Escape closed it, and locking in by key closed it for the reveal`);

    // 4. The twist chip beside the Magpie's name reads her twist into the ticker.
    await page.click('.twist-chip');
    await until(page, (t) => document.querySelector('#ticker')?.textContent.trim() === t, twistText('magpie'), 'the twist chip’s line in the ticker');
    log(`twist chip: "${twistText('magpie')}"`);

    // 5. The epilogue: a ladder win over Control plays C's last cable before the dossier, and the
    // dossier names each round's operation. "Read the epilogue" on the rivals screen plays it again.
    await page.evaluate(() => {
      const g = window.__game;
      g.leave();
      g.beat(['wren', 'magpie', 'heron', 'countess']);
      g.skipAnimations(true);
      g.startSolo('control');
      g.state.scores = [30, 0];
      g.state.target = 1;
      g.finishRound();
    });
    await until(page, () => document.querySelector('[data-action=final]') && !window.__game.ui.updating && !window.__game.ui.card, null, 'the final report after beating Control');
    const won = await page.evaluate(() => ({ winner: window.__game.state.winner, beaten: window.__game.meta.beaten.join(), epilogue: window.__game.ui.epilogue, toast: document.querySelector('.toast')?.textContent ?? null }));
    if (won.winner !== 0 || !won.beaten.endsWith('control') || !won.epilogue) fail(`beating Control on the ladder should leave the epilogue due: ${JSON.stringify(won)}`);
    // Its recruits toast waits for the epilogue, so it never runs on over the card.
    if (/^Recruited/.test(won.toast || '')) fail(`the recruits toast should wait until the epilogue has gone: ${JSON.stringify(won)}`);
    await page.evaluate(() => window.__game.skipAnimations(false));
    await page.click('[data-action=final]');
    await until(page, () => document.querySelector('.epilogue-card'), null, 'the epilogue card');
    const ep = await page.evaluate(() => {
      window.__game.holdCard();
      return { over: !!document.querySelector('.over'), lines: [...document.querySelectorAll('.epilogue-card .eline .vh')].map((x) => x.textContent), toast: document.querySelector('.toast')?.textContent ?? null };
    });
    if (ep.over || ep.lines.join('|') !== EPILOGUE.join('|') || ep.toast !== null) fail(`the epilogue should play C's lines before the dossier, with no toast over it: ${JSON.stringify(ep)}`);
    // Every line typed out (about nine seconds), then the shot.
    await until(page, () => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, 'the epilogue to type out');
    await shot('epilogue');
    await audit('epilogue');
    await page.keyboard.press('Enter');
    await until(page, () => document.querySelector('.over .rounds li') && !window.__game.ui.card, null, 'the dossier after the epilogue');
    // The toast lives 6 s: read its text in the wait itself.
    await until(page, () => /^Recruited: Interrogator and Turncoat\. /.test(document.querySelector('.toast')?.textContent || ''), null, 'the recruits toast after the epilogue');
    const ops = await page.evaluate(() => ({ id: window.__game.view.matchId, ops: [...document.querySelectorAll('.over .rounds li .op')].map((o) => o.textContent), rows: document.querySelectorAll('.over .rounds li').length }));
    if (!ops.rows || ops.ops.length !== ops.rows || ops.ops.join('|') !== ops.ops.map((_, i) => operation(ops.id, i).name).join('|')) fail(`each round of the dossier should start with its operation's name: ${JSON.stringify(ops)}`);
    await snap(page, shot, 'dossier-operations');
    await page.click('[data-action=title]');
    await page.click('[data-action=rivals]');
    await page.click('[data-action=epilogue]');
    await until(page, () => document.querySelector('.epilogue-card'), null, '"Read the epilogue" to play it again');
    await page.keyboard.press('Enter');
    await until(page, () => !document.querySelector('.epilogue-card') && document.querySelector('.rivals-screen'), null, 'the epilogue to go back to the rivals screen');
    log(`epilogue after Control, then the dossier (${ops.ops.join(', ')}); "Read the epilogue" replayed it`);
    await page.click('[data-action=title]');
    clean('the match frame steps');
  } finally {
    page.off('console', onConsole);
  }
}

/**
 * Two players: pages = [host, guest]. Local (BroadcastChannel) unless ctx.live. The host picks Mixed in
 * the lobby, so the duo plays a Mixed roster: its rounds vary between runs, and a failure may not replay.
 */
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
  // The host's roster: Classic by default. Mixed deals the table again before anyone joins.
  const classicFirst = await host.evaluate(() => document.querySelector('[data-action=host-roster][data-choice=classic]')?.getAttribute('aria-pressed'));
  if (classicFirst !== 'true') throw new Error(`the lobby's roster should start on Classic: ${classicFirst}`);
  await host.click('[data-action=host-roster][data-choice=mixed]');
  await until(host, () => window.__game.table.setup.mixed && document.querySelector('[data-action=host-roster][data-choice=mixed][aria-pressed=true]'), null, 'the host’s Mixed roster');
  await shot('lobby-mixed', host);

  await guest.goto(local(url, `#join=${code}`));
  await until(host, () => window.__game.ui.screen === 'play', null, 'the host to see the guest');
  await until(guest, () => window.__game.ui.screen === 'play' && document.querySelector('.hand .card'), null, 'the guest table');
  // The guest's first view deals the host's Mixed roster, and the host's roster switch has gone.
  const rosters = await Promise.all([host, guest].map((p) => p.evaluate(() => window.__game.view.roster)));
  if (rosters[0].length !== 12 || rosters[0].join() !== rosters[1].join()) throw new Error(`the guest should play the host's roster: ${JSON.stringify(rosters)}`);
  if (await host.$('[data-action=host-roster]')) throw new Error('the roster switch should go once a guest has joined');
  log(`guest joined, on the host's Mixed roster (${rosters[1].join(', ')})`);

  // Both open on tonight's roster (the duo plays Mixed), then the round's title card. The guest skips
  // its roster card and leaves its round card up: the host skips theirs and locks in, and once the
  // guest's card ends by itself the guest's table must show the host locked (the latest view, never
  // the one from before the card).
  await skipIntro(guest);
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
  // The token it spent crossed too: both views agree on the tokens, and on each screen the
  // escalator's side (the guest's, seat 1) shows one live chit fewer than the host's.
  for (const p of [host, guest]) {
    await until(
      p,
      () => {
        const v = window.__game.view;
        const live = (s) => document.querySelectorAll(`.scorebar .side.s-${s} .tk:not(.spent)`).length;
        return live(0) === v.tokens[0] && live(1) === v.tokens[1] && live(1) === live(0) - 1;
      },
      null,
      'the escalator’s side to show one live token fewer',
    );
  }
  const tokens = await Promise.all([host, guest].map((p) => p.evaluate(() => window.__game.view.tokens.join())));
  if (tokens[0] !== tokens[1]) throw new Error(`host and guest disagree on the tokens: ${tokens.join(' vs ')}`);
  log(`tokens agree across the wire (${tokens[0]})`);

  // Waits that also skip any reveal in progress, so a slow page never holds up the next step.
  const untilQuick = (p, fn, what) => until(p, `(window.__game.ui.animating && (window.__game.ui.skip = true), (${fn})())`, null, what);

  // The host ends the match; both read the final report. (The duo plays Mixed: a margin no round can
  // close, since a Blackmailer's free escalation and Macau can score 6 in a round.)
  await host.evaluate(() => {
    window.__game.state.scores = [30, 0];
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
    window.__game.state.scores = [30, 0];
    window.__game.state.target = 1;
    window.__game.finishRound();
  });
  await untilQuick(host, () => document.querySelector('[data-action=final]'), 'the final report button on the host');
  await host.click('[data-action=final]');
  await until(host, () => document.querySelector('.over .wait')?.textContent.includes('left the table') && !document.querySelector('[data-action=rematch]'), null, 'the dossier to say the guest left');
  await snap(host, shot, 'duo-left-over-host');
  log('leaving said goodbye');
}
