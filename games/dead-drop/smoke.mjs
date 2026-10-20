import { readFileSync } from 'node:fs';
import { AGENT, AGENTS, CITIES, CITY, CLASSIC_CITIES, DECK } from './js/data.js';
import { cable, DOSSIERS, EPILOGUE, operation, REMARKS, twistText } from './js/story.js';
import { sightings, unseen } from './js/counting.js';
import { deckList } from './js/engine.js';
import { roomToken } from './js/session.js';
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
// Phase 3: the table at four seats (tableSeats: the longest codename in every seat, the sheets, which come
// up from the bottom on a phone, and the final turn at night, whose skipped reveal plays no tick burst; on
// the phone pass narrowTable: Agent Wren II and III at 390px, then 320×568 with five and seven cards and the
// drag ghost's print), the flows at three (tableFlows, pass and play for three from the title's sheet), and
// lobbySteps: the rivals screen's Table tab (Start on screen at four seats, and Continue for it), then the
// host's lobby on a ?net=local page (Seats, Timer, Fill and its top-up, Start) with a spectator in a second
// tab (no side: no sting, nothing coloured as its own).
// The turn timer (timerSteps): no clock without a timer; the Table tab's Blitz and the fuse across the
// hand, standing still while the clock is held; time running out on a picked drop, on nothing picked, at
// the solo clock's own zero (no grace), on an answer and on Next (the full result and See the board's
// strip); the seconds under reduced motion; Continue keeping the timer; and pass and play's clock starting
// only at uncover, and pressing Next on the shared result.
// duo(): two pages in one browser joined over the BroadcastChannel transport (?net=local) —
// host lobby (it switches the roster to Mixed, and the guest's first view has that roster), guest joins
// (the host sees them in its seat list, the guest waits read-only, then the host presses Start), the host locks in while the guest's round card is still up, a turn
// each, an escalation answered across the wire (Space over the host's flash doesn't answer it;
// both screens agree on the tokens, the escalator's side one chit down),
// match over and a rematch, a guest reload during the rematch's first turn (it must not count the
// match again, and a turn that resolves behind the guest's round card must still be revealed from
// the turn-1 board), and the guest leaving (the host's banner then stands, one element, through two
// turns). It plays a Mixed roster, so its rounds vary between runs.
// scripts/verify-live.mjs runs duo() again on the live site with { live: true }, joining
// through the real public relays.
// table(): three players and a watcher at one online table, four pages in one browser on ?net=local,
// each a player of its own (token= and name= in its URL) — the lobby, Start and a turn of face-down
// Sleepers no guest or spectator view names, a spectator, an escalation with two answers (the answers
// card on every page, then the abort's exit), emotes from the Emote row (the slip by the sender's tag, the host's
// 3 s limit, Hide emotes, the row on a phone), a line going dead (the stand-in sits and locks; the
// player comes back to its lock), a guest's reload and the host's (route() reopens the table and lobby),
// a player leaving (the stand-in at once) and a rematch at three seats, all on a 30 s turn timer (every view
// carries the host's clock, every player sees the fuse, and the host's clock runs out a turn at the end).
// verify-live runs it with three browsers through the relays (no watcher, no stand-in clock, no host reload).
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
/** Let entrance animations finish before a screenshot (endless pulses, and the turn clock's fuse burning down, are ignored). */
const settle = (page) =>
  page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity || ['burn', 'heat', 'spark'].includes(a.animationName)), null, { timeout: 4000 })
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
 * its height; at three seats and more, the tag bar's), the board's bottom, the lowest card in the
 * hand, Lock in's bottom, and the window's height. With tags on screen, also the tags' right edge
 * and bottom, and the window's width. On a phone everything must fit between 0 and innerHeight (and
 * innerWidth), with no scrolling.
 */
const phoneFits = (page) =>
  page.evaluate(() => {
    const box = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
    const px = (n) => (Number.isFinite(n) ? Math.round(n) : null);
    const cards = [...document.querySelectorAll('#hand .card')].map((c) => c.getBoundingClientRect().bottom);
    const tags = box('.tags');
    return {
      scorebarTop: px(box('.scorebar, .tagbar')?.top),
      scorebarHeight: px(box('.scorebar, .tagbar')?.height),
      boardBottom: px(box('#board')?.bottom),
      handBottom: px(cards.length ? Math.max(...cards) : NaN),
      lockBottom: px(box('[data-action=lock]')?.bottom),
      innerHeight,
      ...(tags ? { tagsRight: px(tags.right), tagsBottom: px(tags.bottom), innerWidth } : {}),
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
  // Out of the hand, the ghost keeps the print of the card it left (the hand sizes it by how many it holds).
  const print = await page.evaluate((uid) => {
    const size = (el, sel) => getComputedStyle(el.querySelector(sel)).fontSize;
    const g = document.querySelector('.drag-ghost');
    const card = document.querySelector(`#hand .card[data-uid="${uid}"]`);
    return { ghost: [size(g, '.nm'), size(g, '.tx')], card: [size(card, '.nm'), size(card, '.tx')] };
  }, c.uid);
  if (print.ghost.join() !== print.card.join()) fail(`the drag ghost's name and rule should be the card's size: ${JSON.stringify(print)}`);
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

export default async function smoke(page, { log, shot, audit, phone = false, url }) {
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
  // Two seats keep their screen: the scorebar and the rival's full row, no tags and no lanes.
  const two = await page.evaluate(() => ({ scorebar: !!document.querySelector('.scorebar'), tags: !!document.querySelector('.tags'), lanes: document.querySelectorAll('.lane').length, rows: document.querySelectorAll('#board .row[data-row]').length }));
  if (!two.scorebar || two.tags || two.lanes || two.rows !== 6) fail(`a two-seat table should show the scorebar and two full rows per city, no tags or lanes: ${JSON.stringify(two)}`);
  // Emotes are for online tables: playing the computer there is no Emote button.
  if (await page.$('[data-action=emote-row]')) fail('playing the computer should show no Emote button');
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
  if (await page.$('[data-action=emote-row]')) fail('pass and play should show no Emote button');
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
  await tableSeats(page, { log, shot, audit, phone });
  await tableFlows(page, { log, shot, audit, phone });
  await timerSteps(page, { log, shot, audit, phone });
  await lobbySteps(page, { log, shot, audit, phone, url });
}

/** Take down any toast still up (the ladder's six-second recruits toast, say), so it isn't in the next shots. */
const clearToasts = (page) => page.evaluate(() => document.querySelectorAll('.cg-toast').forEach((t) => t.remove()));

/** The longest codename, in every seat: the tags' worst case (seat 0 still reads "You"). */
const MARTENS = ['Agent Marten', 'Agent Marten', 'Agent Marten', 'Agent Marten'];

/**
 * An open sheet's box (px from the viewport's edges), its height and its Close button's, and the window's
 * size: on a phone the city dossier and a rival's file come up from the bottom edge, at most 70% of the
 * screen high, with Close on screen and at least 44px tall.
 */
const sheetFits = (page) =>
  page.evaluate(() => {
    const r = document.querySelector('#modal-root .sheet')?.getBoundingClientRect();
    const c = document.querySelector('#modal-root .sheet [data-action=close-modal]')?.getBoundingClientRect();
    if (!r || !c) return null;
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height), close: Math.round(c.height), closeBottom: Math.round(c.bottom), innerWidth, innerHeight };
  });
const bottomSheet = (f) => !!f && f.top >= 0 && f.bottom <= f.innerHeight && f.bottom >= f.innerHeight - 1 && f.left >= 0 && f.right <= f.innerWidth && f.height <= Math.ceil(f.innerHeight * 0.7) + 1 && f.close >= 44 && f.closeBottom <= f.innerHeight;

/** The tags' names as shown (a tight tag drops its title: main.js fitTags), any cut short by an ellipsis, and the bar's right edge. */
const tagNames = (page) =>
  page.evaluate(() => {
    const whos = [...document.querySelectorAll('.tags .who')];
    return {
      shown: whos.map((w) => w.innerText),
      cut: whos.filter((w) => w.scrollWidth > w.clientWidth + 1).map((w) => w.innerText),
      short: !!document.querySelector('.tags.short'),
      right: Math.round(document.querySelector('.tags').getBoundingClientRect().right),
      innerWidth,
    };
  });

/** The hand across the window: how many cards, its edges, and any card whose power, name, picture or rule spills out of it. */
const handFits = (page) =>
  page.evaluate(() => {
    const cards = [...document.querySelectorAll('#hand .card')];
    const spill = cards
      .filter((c) => {
        const r = c.getBoundingClientRect();
        return [...c.children].some((k) => {
          if (k.tagName === 'KBD' || getComputedStyle(k).display === 'none') return false;
          const b = k.getBoundingClientRect();
          return b.left < r.left - 2 || b.right > r.right + 2 || b.bottom > r.bottom + 2;
        });
      })
      .map((c) => c.querySelector('.nm')?.textContent);
    return {
      n: cards.length,
      left: Math.round(Math.min(...cards.map((c) => c.getBoundingClientRect().left))),
      right: Math.round(Math.max(...cards.map((c) => c.getBoundingClientRect().right))),
      innerWidth,
      scrollWidth: document.scrollingElement.scrollWidth,
      spill,
    };
  });

/** A four-seat Table (the rivals held by the caller) named `names`, its round card skipped and two turns played straight through, with no toast up. */
async function table4(page, names, extra = {}) {
  await page.evaluate(([names, extra]) => window.__game.startTable({ seats: 4, names, ...extra }), [names, extra]);
  await clearCard(page);
  await until(page, () => window.__game.ui.screen === 'play' && !window.__game.ui.updating && !window.__game.ui.card && document.querySelector('.hand .card'), null, 'the four-seat table');
  // Two turns at random, straight through the table, so the lanes have agents in them.
  await page.evaluate(() => {
    let s = 11;
    window.__game.quickTurns(2, () => ((s = (s * 16807) % 2147483647) / 2147483647));
  });
  await until(page, () => window.__game.view?.round.turn === 3 && document.querySelector('.tags'), null, 'turn 3 at the four-seat table');
  await clearToasts(page);
}

/**
 * The table at four seats (Phase 3), from __game.startTable with the rivals held so nothing races
 * the checks, the longest codename in every seat: four tags in table order from you (each with its name,
 * score, tokens and reel, and one First flip coin among them), three lanes above each plate and your
 * full row below, the seat colours on <body>, then the city dossier (a plate's tap; Escape closes it)
 * and a rival's file (its tag; an outside tap closes it), and the final turn at night (tags on ink,
 * lanes at 60%), whose skipped reveal plays no burst of tally ticks. On a phone the tags, the cities,
 * the hand and Lock in fit 390px without scrolling, an open sheet comes up from the bottom without
 * making the page grow, and narrowTable() goes on to Agent Wren II and III at 390px and to 320px.
 */
export async function tableSeats(page, { log, shot, audit, phone }) {
  const fail = (m) => {
    throw new Error(m);
  };
  await page.evaluate((names) => {
    window.__game.holdRival(true);
    // Three cities that never close (and no Berlin), so the final turn always has somewhere to drop.
    window.__game.startTable({ seats: 4, names, seed: 'table4', cities: ['moscow', 'istanbul', 'lisbon'] });
  }, MARTENS);
  await clearCard(page);
  await until(page, () => window.__game.ui.screen === 'play' && !window.__game.ui.updating && !window.__game.ui.card && document.querySelector('.hand .card'), null, 'the four-seat table');
  await clearToasts(page);
  // Two turns at random, straight through the table, so the lanes have agents in them.
  await page.evaluate(() => {
    let s = 11;
    window.__game.quickTurns(2, () => ((s = (s * 16807) % 2147483647) / 2147483647));
  });
  await until(page, () => window.__game.view?.round.turn === 3 && document.querySelector('.tags'), null, 'turn 3 at the four-seat table');
  const t = await page.evaluate(() => {
    const v = window.__game.view;
    const tags = [...document.querySelectorAll('.tags .tag')];
    const cities = [...document.querySelectorAll('#board .city')].map((c) => {
      const plate = c.querySelector('.plate');
      const lanes = [...c.querySelectorAll('.row.lane')];
      const mine = c.querySelector(`.row[data-row="${c.dataset.city}-0"]:not(.lane)`);
      const before = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return {
        lanes: lanes.map((l) => l.dataset.row.split('-')[1]).join(''),
        minis: lanes.map((l) => l.querySelectorAll('.chip').length).join(''),
        sides: [1, 2, 3].map((s) => v.round.cities[Number(c.dataset.city)].sides[s].length).join(''),
        order: lanes.every((l) => before(l, plate)) && !!mine && before(plate, mine),
        badges: plate.querySelectorAll('.total.badge').length,
      };
    });
    return {
      order: tags.map((x) => x.dataset.seat).join(''),
      parts: tags.every((x) => ['.who', '.score', '.tokens', '.reel'].every((sel) => x.querySelector(sel))),
      mine: tags[0]?.tagName,
      buttons: tags.filter((x) => x.tagName === 'BUTTON').length,
      marks: document.querySelectorAll('.tags .mark').length,
      cities,
      scorebar: !!document.querySelector('.scorebar'),
    };
  });
  if (t.order !== '0123' || !t.parts || t.mine !== 'DIV' || t.buttons !== 3 || t.marks !== 4) fail(`four tags in table order from you (yours not a button), each with its name, score, tokens, reel and mark: ${JSON.stringify(t)}`);
  if (t.scorebar || t.cities.some((c) => c.lanes !== '123' || !c.order || c.badges !== 3 || c.minis !== c.sides)) fail(`each city should have three lanes (seats 1, 2, 3, each chip a mini) above its plate, three badges, and your row below: ${JSON.stringify(t.cities)}`);
  log(`four seats: tags ${t.order}; lanes ${t.cities.map((c) => c.minis).join(' / ')} agents; ${await checkToken(page, 'four seats')}`);
  await snap(page, shot, 'table4');
  await audit('table4');
  if (phone) {
    const fit = await phoneFits(page);
    log(`phone fit at four seats: ${JSON.stringify(fit)}`);
    const missing = Object.keys(fit).filter((k) => fit[k] === null);
    if (missing.length || !('tagsRight' in fit)) fail(`the four-seat phone screen is missing ${missing.join(', ') || 'the tags'}: ${JSON.stringify(fit)}`);
    const over = ['boardBottom', 'handBottom', 'lockBottom', 'tagsBottom'].filter((k) => !(fit[k] <= fit.innerHeight));
    if (!(fit.scorebarTop >= 0) || !(fit.tagsRight <= fit.innerWidth) || over.length) fail(`the four-seat phone screen should show the tags, the cities, the hand and Lock in without scrolling: ${JSON.stringify(fit)}`);
    // Every name fits its tag (no ellipsis cutting a short name).
    const cut = await page.evaluate(() => [...document.querySelectorAll('.tags .who')].filter((w) => w.scrollWidth > w.clientWidth + 1).map((w) => w.textContent));
    if (cut.length) fail(`names cut short in the tags: ${cut.join(', ')}`);
  }

  // The seat colours: you red, then teal, cobalt and plum round the table, on <body>.
  const colours = await page.evaluate(() => ({ body: document.body.className, own: getComputedStyle(document.querySelector('.tag.s-2')).getPropertyValue('--own').trim().toLowerCase() }));
  if (!['c0-red', 'c1-teal', 'c2-cobalt', 'c3-plum'].every((c) => colours.body.split(' ').includes(c)) || colours.own !== '#2c4f9e') fail(`the seats' colours should be on <body>, seat 2 cobalt: ${JSON.stringify(colours)}`);

  // The city dossier: a tap on a plate (no card picked, so it isn't a drop target) lists every seat's agents there.
  const ci = await page.evaluate(() => window.__game.view.round.cities.reduce((best, c, i, all) => (c.sides.flat().length > all[best].sides.flat().length ? i : best), 0));
  const height = await page.evaluate(() => document.scrollingElement.scrollHeight);
  await page.click(`#board .city[data-city="${ci}"] .plate[data-action=city-sheet]`);
  await until(page, () => document.querySelector('.city-sheet') && window.__game.ui.modal === 'city', null, 'the city dossier');
  const sheet = await page.evaluate((c) => {
    const v = window.__game.view;
    const rows = [...document.querySelectorAll('.city-sheet .seat-row')];
    return { rows: rows.length, chips: rows.map((r) => r.querySelectorAll('.chip').length).join(''), want: [0, 1, 2, 3].map((s) => v.round.cities[c].sides[s].length).join(''), name: document.querySelector('.city-sheet h2')?.textContent };
  }, ci);
  if (sheet.rows !== 4 || sheet.chips !== sheet.want) fail(`the city dossier should list every seat's agents there: ${JSON.stringify(sheet)}`);
  await snap(page, shot, 'city-sheet');
  await audit('city-sheet');
  if (phone) {
    const fit = await phoneFits(page);
    const grown = await page.evaluate((h) => ({ now: document.scrollingElement.scrollHeight, h, wide: document.scrollingElement.scrollWidth > innerWidth }), height);
    log(`phone fit with the city dossier open: ${JSON.stringify({ ...fit, scrollHeight: grown.now })}`);
    if (grown.now > grown.h || grown.wide) fail(`the city dossier should overlay the table without making the page grow: ${JSON.stringify(grown)}`);
    await settle(page);
    const sheetBox = await sheetFits(page);
    log(`the city dossier as a bottom sheet: ${JSON.stringify(sheetBox)}`);
    if (!bottomSheet(sheetBox)) fail(`on a phone the city dossier comes up from the bottom, at most 70% high, Close on screen and 44px tall: ${JSON.stringify(sheetBox)}`);
  }
  await page.keyboard.press('Escape');
  await until(page, () => !document.querySelector('.city-sheet') && window.__game.ui.modal === null, null, 'Escape to close the city dossier');
  log(`city dossier (${sheet.name}): agents by seat ${sheet.chips}; Escape closed it`);

  // A rival's file, from its tag: name, score, its mark, and the agents not seen this round.
  await page.click('.tags button.tag[data-seat="2"]');
  await until(page, () => document.querySelector('.tag-sheet') && window.__game.ui.modal === 'tag', null, 'the rival’s file');
  const file = await page.evaluate(() => {
    const v = window.__game.view;
    const el = document.querySelector('.tag-sheet');
    return {
      name: el.querySelector('h2')?.textContent,
      want: v.names[2],
      score: el.querySelector('.tag-score .score')?.textContent,
      wantScore: String(v.scores[2]),
      mark: !!el.querySelector('.mark-line .mark'),
      unseen: !!el.querySelector('.unseen-head') && !!el.querySelector('.unseen-list, .unseen-none'),
    };
  });
  if (file.name !== file.want || file.score !== file.wantScore || !file.mark || !file.unseen) fail(`a rival's file should show its name, score, mark and unseen agents: ${JSON.stringify(file)}`);
  await snap(page, shot, 'tag-sheet');
  await audit('tag-sheet');
  if (phone) {
    await settle(page);
    const sheetBox = await sheetFits(page);
    if (!bottomSheet(sheetBox)) fail(`on a phone a rival's file comes up from the bottom, at most 70% high, Close on screen and 44px tall: ${JSON.stringify(sheetBox)}`);
  }
  // An outside tap (the veil, clear of the sheet) closes it.
  await page.mouse.click(4, 4);
  await until(page, () => !document.querySelector('.tag-sheet') && window.__game.ui.modal === null, null, 'an outside tap to close the rival’s file');
  // Your own tag opens nothing.
  await page.click('.tags .tag[data-seat="0"]');
  if (await page.evaluate(() => window.__game.ui.modal !== null || !!document.querySelector('.sheet'))) fail('tapping your own tag should open nothing');
  log(`a rival's file (${file.name}): score, mark and unseen list; an outside tap closed it`);

  // Night at four seats: the final turn (toFinalTurn on a Table). The tags turn to ink with paper type,
  // the rivals' lanes stand back at 60%, and the cities stay lit.
  await page.evaluate(() => window.__game.toFinalTurn());
  await until(page, () => document.querySelector('.final-card') || (!window.__game.ui.card && !window.__game.ui.updating && window.__game.view?.round.turn === 6), null, 'the final turn’s card (or none)');
  if (await page.$('.final-card')) await page.keyboard.press('Enter');
  await until(page, () => !window.__game.ui.card && !window.__game.ui.updating && window.__game.view?.round.turn === 6 && document.body.dataset.night === '1' && document.querySelector('#hand .card:not([disabled])'), null, 'the final turn at night, four seats');
  await clearToasts(page);
  const night = await page.evaluate(() => {
    const tag = getComputedStyle(document.querySelector('.tags .tag.s-1'));
    return { bg: tag.backgroundColor, color: tag.color, lanes: [...new Set([...document.querySelectorAll('#board .row.lane')].map((l) => getComputedStyle(l).opacity))], plates: [...new Set([...document.querySelectorAll('#board .plate')].map((p) => getComputedStyle(p).opacity))] };
  });
  if (night.bg !== 'rgb(46, 41, 36)' || night.color !== 'rgb(240, 226, 196)' || night.lanes.join() !== '0.6' || night.plates.join() !== '1') fail(`at night the tags are ink with paper type, the lanes at 60% and the cities lit: ${JSON.stringify(night)}`);
  await snap(page, shot, 'table4-night');
  await audit('table4-night');
  if (phone) {
    const fit = await phoneFits(page);
    const over = ['boardBottom', 'lockBottom', 'tagsBottom'].filter((k) => !(fit[k] <= fit.innerHeight));
    if (over.length || !(fit.tagsRight <= fit.innerWidth)) fail(`the four-seat night should show the tags, the cities and Lock in without scrolling: ${JSON.stringify(fit)}`);
  }
  // Its reveal, skipped: the cities resolve at once, with no burst of the tally's ticks (it was 18 at once).
  const skipping = await page.evaluate(() => window.__game.ui.alwaysSkip);
  const heard = () => page.evaluate(() => ({ ...window.__game.audio.effects }));
  const before = await heard();
  await page.evaluate(() => {
    window.__game.skipAnimations(true);
    window.__game.rivalLocks();
  });
  await dropFirst(page);
  await until(page, () => window.__game.view?.phase !== 'plan' && !window.__game.ui.updating && document.querySelector('.result'), null, 'the final flip, skipped');
  const after = await heard();
  await page.evaluate((s) => window.__game.skipAnimations(s), skipping);
  const ticks = after.tick - before.tick;
  const ends = ['roundWon', 'roundLost', 'nobody'].reduce((n, k) => n + after[k] - before[k], 0);
  if (ticks !== 0 || ends < 1) fail(`a skipped final reveal resolves the cities with no tally ticks: ${JSON.stringify({ ticks, ends })}`);
  log(`night at four seats: tags ${night.bg} with ${night.color} type, lanes at ${night.lanes}; the skipped final flip ticked ${ticks} times`);

  if (phone) await narrowTable(page, { log, shot, audit, fail });

  await page.evaluate(() => {
    window.__game.leave();
    window.__game.holdRival(false);
  });
  await until(page, () => document.querySelector('.title-screen'), null, 'the title after the four-seat table');
}

/**
 * The four-seat table on the narrowest phones (the phone pass only). At 390px, Agent Wren, Wren II and
 * Wren III (14 characters): a name that won't fit drops its title on every tag, and none is cut. Then at
 * 320×568: the longest codename in every seat, with the tags across the window, Lock in on screen and no
 * overflow; the sheets come up from the bottom; five cards share the width, and the drag ghost keeps the
 * card's print; then seven. The viewport goes back to 390×844 whatever happens.
 */
async function narrowTable(page, { log, shot, audit, fail }) {
  // Seeded deals, the cities with the longest names and rules (the tallest plates).
  const deal = { seed: 'narrow', cities: ['tangier', 'glienicke', 'macau'] };
  await table4(page, ['Agent Marten', 'Agent Wren', 'Agent Wren II', 'Agent Wren III'], deal);
  const wrens = await tagNames(page);
  log(`Agent Wren II and III at 390px: ${JSON.stringify(wrens)}`);
  if (wrens.cut.length || !(wrens.right <= wrens.innerWidth) || !wrens.shown.includes('Wren III')) fail(`at 390px Agent Wren II and III fit their tags (without their title): ${JSON.stringify(wrens)}`);
  const phoneSize = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 568 });
  try {
    await table4(page, MARTENS, deal);
    const fit = await phoneFits(page);
    const names = await tagNames(page);
    log(`320px: ${JSON.stringify({ ...fit, names: names.shown, cut: names.cut })}`);
    const missing = Object.keys(fit).filter((k) => fit[k] === null);
    if (missing.length || !(fit.tagsRight <= fit.innerWidth) || !(fit.tagsBottom <= fit.innerHeight) || !(fit.lockBottom <= fit.innerHeight) || !(fit.scorebarTop >= 0)) fail(`at 320×568 the four tags fit across and Lock in is on screen: ${JSON.stringify(fit)}`);
    if (!(names.right <= names.innerWidth)) fail(`the tags run off a 320px screen: ${JSON.stringify(names)}`);
    await snap(page, shot, 'table4-320');
    await audit('table4-320');

    // The sheets, from the bottom edge.
    const ci = await page.evaluate(() => window.__game.view.round.cities.reduce((best, c, i, all) => (c.sides.flat().length > all[best].sides.flat().length ? i : best), 0));
    await page.click(`#board .city[data-city="${ci}"] .plate[data-action=city-sheet]`);
    await until(page, () => document.querySelector('.city-sheet') && window.__game.ui.modal === 'city', null, 'the city dossier at 320px');
    await settle(page);
    const city = await sheetFits(page);
    await snap(page, shot, 'city-sheet-320');
    await audit('city-sheet-320');
    await page.keyboard.press('Escape');
    await until(page, () => !document.querySelector('.sheet'), null, 'the city dossier closed at 320px');
    await page.click('.tags button.tag[data-seat="1"]');
    await until(page, () => document.querySelector('.tag-sheet') && window.__game.ui.modal === 'tag', null, 'a rival’s file at 320px');
    await settle(page);
    const tag = await sheetFits(page);
    await audit('tag-sheet-320');
    await page.keyboard.press('Escape');
    await until(page, () => !document.querySelector('.sheet'), null, 'the file closed at 320px');
    log(`320px sheets: city ${JSON.stringify(city)}, file ${JSON.stringify(tag)}`);
    if (!bottomSheet(city) || !bottomSheet(tag)) fail(`at 320px the sheets come up from the bottom, at most 70% high, Close on screen and 44px tall: ${JSON.stringify({ city, tag })}`);

    // Five cards share the width, every part of each inside its card.
    const dealt = await page.evaluate(() => window.__game.view.round.hand.length);
    if (dealt > 5) fail(`the seeded deal should leave at most five cards in hand by turn 3, not ${dealt}`);
    await page.evaluate((n) => window.__game.give(5 - n), dealt);
    await until(page, () => document.querySelectorAll('#hand .card').length === 5 && !window.__game.ui.updating, null, 'five cards in hand');
    const five = await handFits(page);
    if (five.left < 0 || five.right > five.innerWidth || five.scrollWidth > five.innerWidth || five.spill.length) fail(`five cards should fit 320px, each card's print inside it: ${JSON.stringify(five)}`);
    await audit('hand5-320');
    // A card dragged out of the hand keeps its print: the ghost's name is the size of the card's.
    await page.evaluate(() => document.querySelector('#hand').scrollIntoView({ block: 'end' }));
    const c = await page.$eval('#hand .card:not([disabled])', (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, uid: el.dataset.uid };
    });
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x, c.y - 40, { steps: 5 });
    await until(page, () => document.querySelector('.drag-ghost'), null, 'the drag ghost at 320px');
    const ghost = await page.evaluate((uid) => {
      const size = (el, sel) => getComputedStyle(el.querySelector(sel)).fontSize;
      const g = document.querySelector('.drag-ghost');
      const card = document.querySelector(`#hand .card[data-uid="${uid}"]`);
      return { ghost: [size(g, '.nm'), size(g, '.tx')], card: [size(card, '.nm'), size(card, '.tx')] };
    }, c.uid);
    await page.mouse.move(c.x, c.y, { steps: 3 });
    await page.mouse.up();
    if (ghost.ghost.join() !== ghost.card.join()) fail(`the drag ghost should keep the card's print at 320px with five cards: ${JSON.stringify(ghost)}`);
    await snap(page, shot, 'hand5-320');
    // Seven.
    await page.evaluate(() => window.__game.give(2));
    await until(page, () => document.querySelectorAll('#hand .card').length === 7 && !window.__game.ui.updating, null, 'seven cards in hand');
    const seven = await handFits(page);
    if (seven.left < 0 || seven.right > seven.innerWidth || seven.scrollWidth > seven.innerWidth || seven.spill.length) fail(`seven cards should fit 320px: ${JSON.stringify(seven)}`);
    await audit('hand7-320');
    log(`320px hands: five ${five.left}–${five.right}, seven ${seven.left}–${seven.right} of ${seven.innerWidth}; the ghost's name ${ghost.ghost[0]} as the card's`);
  } finally {
    await page.setViewportSize(phoneSize ?? { width: 390, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
  }
}

/**
 * A three-seat Table with the rivals held (they move only when a step asks), its round card skipped
 * and (with `turns`) that many turns played straight through the table from a fixed draw, then no
 * toast left up. `seed` and `cities` deal a chosen match.
 */
async function table3(page, { turns = 0, seed = null, cities = null, what = 'a three-seat table' } = {}) {
  await page.evaluate(
    (o) => {
      window.__game.holdRival(true);
      window.__game.startTable({ seats: 3, ...(o.seed ? { seed: o.seed } : {}), ...(o.cities ? { cities: o.cities } : {}) });
    },
    { seed, cities },
  );
  await clearCard(page);
  await until(page, () => window.__game.ui.screen === 'play' && !window.__game.ui.updating && !window.__game.ui.card && document.querySelector('.hand .card'), null, what);
  if (turns) {
    await page.evaluate((n) => {
      let s = 7;
      window.__game.quickTurns(n, () => ((s = (s * 16807) % 2147483647) / 2147483647));
    }, turns);
    await until(page, (t) => window.__game.view?.round.turn === t + 1 && !window.__game.ui.updating, turns, `turn ${turns + 1} of ${what}`);
  }
  await clearToasts(page);
}

/** The board on screen and the table's state for the flows below: a seat's chips, its tag, the stake and pot, the ticker. */
const tableNow = (page, seat) =>
  page.evaluate((s) => {
    const g = window.__game;
    const tag = document.querySelector(`.tags .tag.s-${s}`);
    return {
      phase: g.state.phase,
      turn: g.state.round.turn,
      folded: g.state.round.folded.slice(),
      stake: g.view.round.stake,
      pot: g.view.round.pot,
      chips: document.querySelectorAll(`#board .row[data-row$="-${s}"] .chip`).length,
      lanesOut: document.querySelectorAll(`#board .row.lane.out[data-row$="-${s}"]`).length,
      tagOut: !!tag?.classList.contains('out') && getComputedStyle(tag, '::after').content === '"Out"',
      ticker: document.querySelector('#ticker')?.textContent.trim() ?? null,
      stakeShown: document.querySelector('.mid .stake b')?.textContent ?? null,
      lock: !!document.querySelector('[data-action=lock]'),
      names: g.table.names.slice(),
    };
  }, seat);

/**
 * Phase 3's flows at three seats, each on a Table with the rivals held (__game.startTable) and moves
 * made through the table or the real UI: a call's answers revealed together on the answers card, then
 * the aborting seat pulling out; a rival's fold that leaves the round going; my own fold with two
 * others in (the fold sheet's copy, the folded view, a reveal still playing); the escalation prompt
 * only for a seat it asks, and the status after answering; pass and play for three (a cover per seat,
 * each naming the others, and an escalation's covers for its answers); Havana's rotation; and the
 * reveal's pace (1.25 at three seats, 3.75 sped up, then skipped).
 */
export async function tableFlows(page, { log, shot, audit, phone }) {
  const fail = (m) => {
    throw new Error(m);
  };

  // 1. Answers. I escalate; seat 1 plays on and seat 2 aborts, through the table. The answers card
  // shows both, in table order after me; then seat 2's agents leave the board and its tag reads Out.
  // The stake doubles (someone played on) and the pot holds seat 2's stake.
  await table3(page, { turns: 2, seed: 'flows-answers', what: 'a three-seat table to escalate on' });
  const had = (await tableNow(page, 2)).chips;
  if (!had) fail('seat 2 should have agents on the board to pull out');
  await page.click('[data-action=escalate]');
  await until(page, () => window.__game.state.round.pending && (window.__game.ui.card || !window.__game.ui.updating), null, 'my escalation (its flash, if it shows)');
  if (await page.evaluate(() => !!window.__game.ui.card)) await page.keyboard.press('Enter');
  await until(page, () => !window.__game.ui.card && !window.__game.ui.updating, null, 'my escalation’s flash to go');
  const asking = await page.evaluate(() => ({ status: document.querySelector('.controls .status')?.textContent, prompt: !!document.querySelector('.modal.hot'), names: window.__game.table.names }));
  if (asking.prompt || asking.status !== `Waiting for ${asking.names[1]} and ${asking.names[2]} to answer your escalation…`) fail(`the escalator gets no prompt, and the status names who is to answer: ${JSON.stringify(asking)}`);
  const card = await page.evaluate(async () => {
    const g = window.__game;
    g.table.act(1, { a: 'respond', accept: true });
    g.table.act(2, { a: 'respond', accept: false });
    for (let i = 0; i < 50 && !g.ui.card; i++) await Promise.resolve();
    g.holdCard();
    const el = g.ui.card?.el;
    return {
      cls: el?.className ?? null,
      lines: [...(el?.querySelectorAll('.ans') ?? [])].map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
      label: el?.getAttribute('aria-label') ?? null,
      held: g.ui.holdBoard,
      under: document.querySelectorAll('#board .row[data-row$="-2"] .chip').length,
    };
  });
  const [, wren, magpie] = asking.names;
  const want = [`${wren} plays on.`, `${magpie} aborts.`];
  if (!/\banswers-card\b/.test(card.cls) || !/\bown-0\b/.test(card.cls) || card.lines.join('|') !== want.join('|') || card.label !== want.join(' ')) fail(`the answers card should show every answer in table order, in my colour: ${JSON.stringify(card)}`);
  if (!card.held || card.under !== had) fail(`the board should stand as it was under the answers card: ${JSON.stringify({ ...card, had })}`);
  await snap(page, shot, 'answers');
  await audit('answers');
  await page.keyboard.press('Enter');
  await until(page, () => !window.__game.ui.card && !window.__game.ui.holdBoard && !window.__game.ui.updating, null, 'the answers card and the exit after it');
  const answered = await tableNow(page, 2);
  if (answered.phase !== 'plan' || !answered.folded[2] || answered.chips || answered.lanesOut !== 3 || !answered.tagOut) fail(`after the answers, the aborting seat should be out: no agents, its lanes back, its tag Out: ${JSON.stringify(answered)}`);
  if (answered.stake !== 2 || answered.pot !== 1 || answered.stakeShown !== '2' || answered.ticker !== `${magpie} pulls out of the round.`) fail(`the stake doubles, the pot takes the folded stake, and the ticker says who pulled out: ${JSON.stringify(answered)}`);
  log(`answers: "${want.join(' ')}"; ${magpie}'s ${had} agent${had === 1 ? '' : 's'} pulled out; stake ${answered.stake}, pot ${answered.pot}`);

  // 2. A rival folds mid-round (not answering anything): its flash, its agents pulling out, and the
  // round goes on for the two of us.
  await table3(page, { turns: 2, seed: 'flows-fold', what: 'a three-seat table for a rival to fold on' });
  const folding = await page.evaluate(async () => {
    const g = window.__game;
    const before = document.querySelectorAll('#board .row[data-row$="-2"] .chip').length;
    const ok = g.rivalFolds(2);
    for (let i = 0; i < 50 && !g.ui.card; i++) await Promise.resolve();
    g.holdCard();
    return { ok, before, small: document.querySelector('.cine.flash.fold .small')?.textContent ?? null, name: g.table.names[2] };
  });
  if (!folding.ok || !folding.before || folding.small !== `${folding.name} aborts to save the network`) fail(`a rival's fold mid-round should flash: ${JSON.stringify(folding)}`);
  await page.keyboard.press('Enter');
  await until(page, () => !window.__game.ui.card && !window.__game.ui.holdBoard && !window.__game.ui.updating, null, 'the fold’s exit');
  const goesOn = await tableNow(page, 2);
  if (goesOn.phase !== 'plan' || !goesOn.folded[2] || goesOn.chips || !goesOn.tagOut || !goesOn.lock || goesOn.ticker !== `${folding.name} pulls out of the round.`) fail(`after a rival's fold the round goes on without its agents: ${JSON.stringify(goesOn)}`);
  await snap(page, shot, 'fold-midround');
  await audit('fold-midround');
  log(`a rival's fold mid-round: the flash, ${folding.before} agent${folding.before === 1 ? '' : 's'} out, and play goes on (pot ${goesOn.pot})`);

  // 3. My fold with two others in: the fold sheet says the others play on; once folded, my hand sits
  // out, the controls only say so, F and E do nothing, and the next reveal still plays.
  await table3(page, { turns: 2, seed: 'flows-mine', what: 'a three-seat table to fold on' });
  await page.click('[data-action=fold]');
  const foldSheet = await page.evaluate(() => document.querySelector('.modal .sheet')?.textContent.replace(/\s+/g, ' ') ?? '');
  if (!/You leave the round\. Your agents pull out, the stake \(1\) goes into the pot, and the others play on for it\./.test(foldSheet)) fail(`the fold sheet with two others in: ${foldSheet}`);
  await page.click('.modal [data-action=confirm-fold]');
  await until(page, () => window.__game.state.round.folded[0] && !window.__game.ui.card && !window.__game.ui.holdBoard && !window.__game.ui.updating, null, 'my fold’s flash and exit');
  const out = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#hand .card')];
    return { hand: !!document.querySelector('#hand.hand.out'), cards: cards.length, disabled: cards.every((c) => c.disabled), status: document.querySelector('.controls .status')?.textContent, buttons: document.querySelectorAll('.controls button').length };
  });
  const me0 = await tableNow(page, 0);
  if (!out.hand || !out.cards || !out.disabled || out.buttons || out.status !== 'You’re out of this round: the others play on for the pot (1).' || me0.chips || !me0.tagOut) fail(`my folded view: a dimmed, disabled hand, only the status, my tag Out: ${JSON.stringify({ out, me0 })}`);
  await page.keyboard.press('f');
  await page.keyboard.press('e');
  const keys = await page.evaluate(() => ({ modal: window.__game.ui.modal, pending: !!window.__game.state.round.pending }));
  if (keys.modal || keys.pending) fail(`F and E should do nothing once I'm out: ${JSON.stringify(keys)}`);
  await snap(page, shot, 'folded-view');
  await audit('folded-view');
  // Two rivals lock in: the second move lands while the first's update is finishing, and the reveal
  // follows on the next pass (microtasks, no timers), as it would in play.
  const reveal = await page.evaluate(async () => {
    const g = window.__game;
    const turn = g.state.round.turn;
    const locked = g.rivalLocks();
    for (let i = 0; i < 50 && !g.ui.animating; i++) await Promise.resolve();
    return { turn, locked, animating: g.ui.animating };
  });
  if (!reveal.locked || !reveal.animating) fail(`with me out, the rivals' drops should still reveal: ${JSON.stringify(reveal)}`);
  await until(page, (t) => window.__game.state.round.turn === t + 1 && !window.__game.ui.animating && !window.__game.ui.updating, reveal.turn, 'the reveal with me out');
  if (!(await page.evaluate(() => !!document.querySelector('#hand.hand.out') && !document.querySelector('[data-action=lock]')))) fail('I should stay out for the rest of the round');
  log('my fold with two others in: the sheet, the folded view, F and E ignored, the reveal played on');

  // 4. The escalation prompt only for a seat it asks: seat 1 escalates and asks seat 2 and me. Once I
  // answer, no prompt (my answer is in) while seat 2 hasn't, and the status names seat 2.
  await table3(page, { turns: 1, seed: 'flows-prompt', what: 'a three-seat table for a rival to escalate on' });
  const called = await page.evaluate(async () => {
    const g = window.__game;
    const ok = g.rivalEscalates(1);
    for (let i = 0; i < 50 && !g.ui.card; i++) await Promise.resolve();
    // Held, so the Enter below certainly finds the flash up (it would end by itself after 1.3 s).
    g.holdCard();
    return { ok, flash: !!g.ui.card };
  });
  if (!called.ok) fail('seat 1 could not escalate');
  if (called.flash) await page.keyboard.press('Enter');
  await until(page, () => document.querySelector('.modal.hot') && !window.__game.ui.card && !window.__game.ui.updating, null, 'the escalation prompt');
  const prompt = await page.evaluate(() => ({ head: document.querySelector('.modal.hot h2')?.textContent.replace(/\s+/g, ' ').trim(), text: document.querySelector('.modal.hot p')?.textContent.replace(/\s+/g, ' ').trim(), names: window.__game.table.names }));
  if (prompt.head !== `${prompt.names[1]} escalates` || !prompt.text.startsWith('Play on and this round is worth 2, or 4 at the final flip. Fold and you’re out of this round: the stake (1) goes into the pot for whoever wins it.')) fail(`the prompt at three seats: ${JSON.stringify(prompt)}`);
  await snap(page, shot, 'prompt-three');
  await audit('prompt-three');
  await page.click('.modal.hot [data-action=respond][data-accept="1"]');
  await until(page, () => window.__game.view.round.pending?.mine === 'on' && !document.querySelector('.modal.hot'), null, 'my answer in, and the prompt gone');
  const waiting = await page.evaluate(() => ({ status: document.querySelector('.controls .status')?.textContent ?? '', answered: window.__game.view.round.pending.answered.slice() }));
  if (!waiting.status.startsWith(`Waiting for ${prompt.names[2]} to answer ${prompt.names[1]}’s escalation…`) || waiting.answered[2]) fail(`after my answer, the status should name the seat still to answer: ${JSON.stringify(waiting)}`);
  log(`the prompt asked me, then went; "${waiting.status}"`);

  // 5. Pass and play for three, from the title's sheet (Players 3, Classic): a cover per seat, each
  // naming the other two; then Red escalates and locks in, and the device goes to Teal, then Cobalt, for
  // their answers. Every animation is skipped.
  await page.evaluate(() => {
    window.__game.holdRival(false);
    window.__game.skipAnimations(true);
    window.__game.leave();
  });
  await until(page, () => document.querySelector('.title-screen [data-action=pass]'), null, 'the title for pass and play');
  await page.click('[data-action=pass]');
  await until(page, () => document.querySelector('.pass-sheet [data-action=pass-seats][data-choice="2"][aria-pressed=true]'), null, 'the pass and play sheet, two players first');
  await page.click('.pass-sheet [data-action=pass-seats][data-choice="3"]');
  await until(page, () => document.querySelector('.pass-sheet [data-action=pass-seats][data-choice="3"][aria-pressed=true]') && /^Three spymasters/.test(document.querySelector('.pass-sheet > p')?.textContent || ''), null, 'Players 3 pressed');
  await snap(page, shot, 'pass-sheet');
  await audit('pass-sheet');
  await page.click('.pass-sheet [data-action=pass-start][data-choice=classic]');
  await until(page, () => window.__game.ui.mode === 'pass' && window.__game.state?.scores.length === 3, null, 'a three-player pass and play table');
  const coverAt = async (seat, why) => {
    await until(page, (o) => document.querySelector('.cover') && window.__game.ui.cover?.seat === o.seat && window.__game.ui.cover.why === o.why && !window.__game.ui.updating, { seat, why }, `the cover for seat ${seat} (${why})`);
    const c = await page.evaluate(() => ({ text: document.querySelector('.cover').textContent.replace(/\s+/g, ' '), names: window.__game.table.names }));
    // "Teal, Cobalt, no peeking.": exactly the two others.
    const named = (c.text.match(/([^.]+), no peeking\./)?.[1] ?? '').trim().split(', ').sort();
    const others = c.names.filter((_, s) => s !== seat).sort();
    if (!c.text.includes(`Pass the device to ${c.names[seat]}`) || named.join('|') !== others.join('|')) fail(`the cover for ${c.names[seat]} should name the two others: ${c.text}`);
    return c;
  };
  for (const seat of [0, 1, 2]) {
    await coverAt(seat, 'turn');
    await page.click('[data-action=uncover]');
    await dropFirst(page);
  }
  await coverAt(0, 'turn');
  await page.click('[data-action=uncover]');
  await until(page, () => document.querySelector('[data-action=escalate]:not([disabled])'), null, 'Red’s Escalate');
  await page.click('[data-action=escalate]');
  await until(page, () => window.__game.state.round.pending && !window.__game.ui.updating && document.querySelector('.hand .card:not([disabled])'), null, 'Red, still uncovered after escalating');
  await dropFirst(page);
  const teal = await coverAt(1, 'escalated');
  await page.click('[data-action=uncover]');
  await until(page, () => document.querySelector('.modal.hot'), null, 'the prompt for Teal');
  await page.click('.modal.hot [data-action=respond][data-accept="1"]');
  await coverAt(2, 'escalated');
  await page.click('[data-action=uncover]');
  await until(page, () => document.querySelector('.modal.hot'), null, 'the prompt for Cobalt');
  await page.click('.modal.hot [data-action=respond][data-accept="1"]');
  await coverAt(1, 'turn');
  const settled = await page.evaluate(() => ({ stake: window.__game.state.round.stake, pending: window.__game.state.round.pending }));
  if (settled.stake !== 2 || settled.pending) fail(`both played on: the call settles and the stake doubles: ${JSON.stringify(settled)}`);
  await page.evaluate(() => window.__game.skipAnimations(false));
  log(`pass and play for three: covers in turn, each naming the others; "${teal.text.trim()}"`);

  // 6. Havana at three seats: three turns into Havana from every seat (a fixed deal), then a turn
  // elsewhere; after turn 4 each agent there belongs to the next seat round the table, and every
  // seat's row glided to the next seat's.
  await page.evaluate(() => window.__game.skipAnimations(true));
  await table3(page, { seed: 'havana-3', cities: ['havana', 'lisbon', 'istanbul'], what: 'a three-seat table with Havana' });
  const staged = await page.evaluate(() => {
    const g = window.__game;
    for (let t = 0; t < 3; t++) {
      for (const s of [0, 1, 2]) {
        const legal = g.table.view(s).round.legal;
        const d = legal.find((x) => x.city === 0 && !x.partner) ?? legal[0];
        if (d) g.table.act(s, { a: 'lock', uid: d.uid, city: d.city });
      }
    }
    return { turn: g.state.round.turn, havana: g.state.round.cities[0].sides.map((side) => side.length) };
  });
  await until(page, () => window.__game.state.round.turn === 4 && window.__game.view.round.turn === 4 && !window.__game.ui.animating && !window.__game.ui.updating, null, 'turn 4 at the Havana table');
  await page.evaluate(() => window.__game.skipAnimations(false));
  const swap = await page.evaluate(async () => {
    const g = window.__game;
    window.__glided = new Set();
    window.__glideWatch?.disconnect();
    window.__glideWatch = new MutationObserver((ms) => {
      for (const m of ms) if (m.target.classList?.contains('row') && m.target.classList.contains('gliding')) window.__glided.add(m.target.dataset.row);
    });
    window.__glideWatch.observe(document.querySelector('#app'), { subtree: true, attributes: true, attributeFilter: ['class'] });
    const before = g.state.round.cities[0].sides.map((side) => side.slice());
    for (const s of [1, 2, 0]) {
      const legal = g.table.view(s).round.legal;
      const d = legal.find((x) => x.city !== 0 && !x.partner) ?? legal[0];
      if (d) g.table.act(s, { a: 'lock', uid: d.uid, city: d.city });
    }
    for (let i = 0; i < 50 && !g.ui.animating; i++) await Promise.resolve();
    return { before, speed: g.ui.speed, animating: g.ui.animating };
  });
  await until(page, () => window.__game.state.round.turn === 5 && !window.__game.ui.animating && !window.__game.ui.updating, null, 'turn 4’s reveal at the Havana table');
  const rotated = await page.evaluate((before) => {
    const g = window.__game;
    window.__glideWatch.disconnect();
    const after = g.state.round.cities[0].sides;
    const moves = [];
    before.forEach((side, s) =>
      side.forEach((uid) => {
        const now = after.findIndex((x) => x.includes(uid));
        if (now >= 0) moves.push({ uid, from: s, to: now, row: !!document.querySelector(`#board .row[data-row="0-${now}"] .chip[data-uid="${uid}"]`) });
      }),
    );
    return { moves, glided: [...window.__glided].sort(), events: g.view.round.events.some((e) => e.t === 'havana') };
  }, swap.before);
  const wrong = rotated.moves.filter((m) => m.to !== (m.from + 1) % 3 || !m.row);
  const from = new Set(rotated.moves.map((m) => m.from));
  if (!swap.animating || swap.speed !== 1.25 || rotated.moves.length < 3 || from.size < 2 || wrong.length || !rotated.events) fail(`Havana at three seats: every agent there passes to the next seat round the table: ${JSON.stringify({ staged, swap: { speed: swap.speed, animating: swap.animating }, rotated, wrong })}`);
  if (['0-0', '0-1', '0-2'].some((r) => !rotated.glided.includes(r))) fail(`each of Havana's rows should glide to the next seat's: ${JSON.stringify(rotated.glided)}`);
  log(`Havana at three seats: ${rotated.moves.length} agents from ${from.size} seats passed one seat on; rows ${rotated.glided.join(', ')} glided`);

  // 7. The reveal's pace at three seats: 1.25 (and --pace 0.8) from the start, 3.75 after a tap,
  // then a second tap skips it.
  const paced = await page.evaluate(async () => {
    const g = window.__game;
    g.rivalLocks();
    const d = g.view.round.legal[0];
    g.table.act(0, { a: 'lock', uid: d.uid, city: d.city });
    for (let i = 0; i < 50 && !g.ui.animating; i++) await Promise.resolve();
    const play = document.querySelector('#screen .play');
    return { animating: g.ui.animating, speed: g.ui.speed, pace: play?.style.getPropertyValue('--pace'), label: document.querySelector('[data-action=reveal-tap]')?.textContent };
  });
  if (!paced.animating || paced.speed !== 1.25 || paced.pace !== '0.8' || !/^Speed up/.test(paced.label)) fail(`a three-seat reveal should start at 1.25: ${JSON.stringify(paced)}`);
  await until(page, () => window.__game.ui.animating && performance.now() - window.__game.ui.revealAt > 450 && window.__game.holdReveal(), null, 'the three-seat reveal to pass its guard');
  await page.keyboard.press('Space');
  const fast = await page.evaluate(() => ({ speed: window.__game.ui.speed, skip: window.__game.ui.skip, pace: document.querySelector('#screen .play')?.style.getPropertyValue('--pace'), label: document.querySelector('[data-action=reveal-tap]')?.textContent }));
  if (fast.speed !== 3.75 || fast.skip || Math.abs(Number(fast.pace) - 1 / 3.75) > 1e-9 || !/^Skip/.test(fast.label)) fail(`a tap should take a three-seat reveal to 3.75: ${JSON.stringify(fast)}`);
  await page.click('[data-action=reveal-tap]');
  const skipped = await page.evaluate(() => window.__game.ui.skip || !window.__game.ui.animating);
  if (!skipped) fail('a second tap should skip the three-seat reveal');
  await idle(page);
  log(`three-seat reveal pace: ${paced.speed}, then ${fast.speed}, then skipped`);

  await page.evaluate(() => {
    window.__game.leave();
    window.__game.holdRival(false);
  });
  await until(page, () => document.querySelector('.title-screen'), null, 'the title after the three-seat flows');
}

/**
 * The turn timer (Phase 3, Task 13), on the check's page. A ladder match has no timer: no fuse, no clock.
 * The Table tab's Timer (Blitz) deals a three-seat table whose fuse burns across the top of the hand
 * (the clock held, so it never runs out by itself mid-step; __game.clock.expire() runs it out through its
 * own path). Out of time with a card and a city picked, that drop locks in; next turn with nothing
 * picked, a random legal one does. A rival's escalation brings the prompt with its own fuse, and running
 * out plays on; the round's result has its fuse under the heading, and running out presses Next. Under
 * reduced motion the fuse stands still and counts the seconds. Continue keeps the timer. Pass and play's
 * sheet has the Timer too, and its clock starts only when a player uncovers.
 */
export async function timerSteps(page, { log, shot, audit, phone }) {
  const fail = (m) => {
    throw new Error(m);
  };
  const skipping = await page.evaluate(() => window.__game.ui.alwaysSkip);
  await page.evaluate(() => {
    window.__game.leave();
    window.__game.skipAnimations(true);
    window.__game.holdRival(true);
    window.__game.startSolo('wren');
  });
  await clearCard(page);
  await until(page, () => window.__game.ui.screen === 'play' && !window.__game.ui.updating && !window.__game.ui.card && document.querySelector('#hand .card'), null, 'a ladder table');
  const plain = await page.evaluate(() => ({ fuse: document.querySelectorAll('.fuse').length, clock: window.__game.clock, view: window.__game.view.clock, timer: window.__game.view.timer }));
  if (plain.fuse || plain.clock !== null || plain.view !== null || plain.timer !== 0) fail(`a match with no timer has no fuse and no clock: ${JSON.stringify(plain)}`);

  // 1. The Table tab: Timer Blitz, three seats, Start. The fuse burns across the top of the hand.
  await page.evaluate(() => window.__game.leave());
  await until(page, () => document.querySelector('.title-screen [data-action=rivals]'), null, 'the title for the timed Table');
  await page.click('[data-action=rivals]');
  await page.click('[data-action=rivals-tab][data-choice=table]');
  await until(page, () => document.querySelector('[data-action=table-timer][data-choice="0"][aria-pressed=true]'), null, 'the Table tab, its timer Off');
  await page.click('[data-action=table-seats][data-choice="3"]');
  await page.click('[data-action=table-timer][data-choice="10000"]');
  await until(page, () => document.querySelector('[data-action=table-timer][data-choice="10000"][aria-pressed=true]') && /only you are timed/.test(document.querySelector('.table-pick').textContent), null, 'Blitz pressed on the Table tab');
  await page.evaluate(() => window.__game.holdClock(true));
  await page.click('[data-action=table-start]');
  await clearCard(page);
  await until(page, () => window.__game.ui.screen === 'play' && !window.__game.ui.updating && !window.__game.ui.card && document.querySelector('#hand .fuse.kind-drop'), null, 'the fuse across the hand');
  const lit = await page.evaluate(() => {
    const g = window.__game;
    const f = document.querySelector('#hand .fuse');
    const core = f.querySelector('i').getAnimations();
    return { seats: g.view.scores.length, timer: g.view.timer, kind: g.clock?.kind, clock: g.table.view(0).clock, burning: core.map((a) => a.animationName), state: [...new Set(core.map((a) => a.playState))].join(), held: f.classList.contains('held'), done: f.classList.contains('done') };
  });
  // (The check holds the clock, so the fuse stands still where it is: held, its burn paused.)
  if (lit.seats !== 3 || lit.timer !== 10000 || lit.kind !== 'drop' || lit.clock?.kind !== 'drop' || !(lit.clock.left > 0 && lit.clock.left <= 10000) || !lit.burning.includes('burn') || !lit.held || lit.state !== 'paused' || lit.done) {
    fail(`Blitz at the Table: a 10 s drop clock and a fuse across the hand, standing still while the clock is held: ${JSON.stringify(lit)}`);
  }
  await snap(page, shot, 'fuse');
  await audit('fuse');
  if (phone) {
    const fit = await phoneFits(page);
    const fuse = await page.evaluate(() => {
      const r = document.querySelector('#hand .fuse').getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), innerWidth, innerHeight };
    });
    log(`phone fit with the fuse: ${JSON.stringify({ ...fit, fuse })}`);
    const missing = Object.keys(fit).filter((k) => fit[k] === null);
    const over = ['boardBottom', 'handBottom', 'lockBottom', 'tagsBottom'].filter((k) => !(fit[k] <= fit.innerHeight));
    if (missing.length || over.length || !(fit.scorebarTop >= 0) || !(fit.tagsRight <= fit.innerWidth)) fail(`the timed phone screen should show the tags, the cities, the hand and Lock in without scrolling: ${JSON.stringify(fit)}`);
    if (!(fuse.top >= 0 && fuse.bottom <= fuse.innerHeight && fuse.left >= 0 && fuse.right <= fuse.innerWidth)) fail(`the fuse should be on the phone's screen: ${JSON.stringify(fuse)}`);
  }

  // 2. Out of time with a card and a city picked: that drop locks in.
  const pick = '#hand .card:not([disabled]):not(.k-blackmailer):not(.k-accomplice)';
  await page.click((await page.$(pick)) ? pick : '#hand .card:not([disabled])');
  await page.click('.city.target .plate');
  if (await page.$('[data-action=alone]')) await page.click('[data-action=alone]');
  const mine = await page.evaluate(() => {
    const g = window.__game;
    const want = { uid: g.ui.selected, city: g.ui.target };
    const ran = g.clock.expire();
    return { want, ran, plan: g.table.view(0).round.plan, rivals: g.state.round.plans.slice(1) };
  });
  if (!mine.ran || mine.plan?.uid !== mine.want.uid || mine.plan.city !== mine.want.city || mine.rivals.some(Boolean)) fail(`out of time, my picked drop should lock in (and nothing for the rivals): ${JSON.stringify(mine)}`);
  await until(page, () => document.querySelector('[data-action=unlock]') && document.querySelector('#hand .fuse.done') === null, null, 'my drop locked in, the clock run out');

  // 3. Next turn, nothing picked: a random legal drop locks in.
  await page.evaluate(() => window.__game.rivalLocks());
  await untilSkipping(page, () => window.__game.view?.round.turn === 2 && !window.__game.ui.updating && document.querySelector('#hand .fuse.kind-drop:not(.done)'), null, 'turn 2 and its fuse');
  const random = await page.evaluate(() => {
    const g = window.__game;
    const legal = g.table.view(0).round.legal;
    const ran = g.clock.expire();
    const plan = g.table.view(0).round.plan;
    return { ran, plan, legal: !!plan && legal.some((d) => d.uid === plan.uid && d.city === plan.city), selected: g.ui.selected };
  });
  if (!random.ran || !random.legal || random.selected !== null) fail(`out of time with nothing picked, a random legal drop should lock in: ${JSON.stringify(random)}`);
  await until(page, () => document.querySelector('[data-action=unlock]'), null, 'the random drop locked in');

  // 3b. The clock let go for real: at its own zero my picked drop locks in at once, not after the 1.5 s
  // grace the host gives a guest's line (solo's clock is on this device). The deadline is brought near.
  await page.evaluate(() => window.__game.rivalLocks());
  await untilSkipping(page, () => window.__game.view?.round.turn === 3 && !window.__game.ui.updating && document.querySelector('#hand .fuse.kind-drop:not(.done)'), null, 'turn 3 and its fuse');
  await page.click((await page.$(pick)) ? pick : '#hand .card:not([disabled])');
  await page.click('.city.target .plate');
  if (await page.$('[data-action=alone]')) await page.click('[data-action=alone]');
  await clearToasts(page);
  const burning = await page.evaluate(() => {
    const g = window.__game;
    window.__zeroAt = Date.now() + 400;
    g.table.clock.deadline = window.__zeroAt;
    g.holdClock(false); // the fuse burns again, and its timers are set from the clock
    const f = document.querySelector('#hand .fuse');
    return { held: f.classList.contains('held'), state: [...new Set(f.querySelector('i').getAnimations().map((a) => a.playState))].join() };
  });
  if (burning.held || burning.state !== 'running') fail(`let go, the fuse burns again: ${JSON.stringify(burning)}`);
  await until(page, () => window.__game.table.view(0).round.plan, null, 'my drop locked in at the clock’s zero');
  const zero = await page.evaluate(() => {
    window.__game.holdClock(true);
    return { late: Date.now() - window.__zeroAt, toast: document.querySelector('.toast')?.textContent ?? '' };
  });
  log(`the solo clock's own zero locked my pick ${zero.late} ms after zero`);
  if (!(zero.late < 1500) || !zero.toast.includes('your drop is locked in')) fail(`at the solo clock's zero my pick locks in at once, inside the 1.5 s grace: ${JSON.stringify(zero)}`);

  // 4. A rival escalates: the prompt has its fuse, and running out plays on.
  await page.evaluate(() => window.__game.rivalEscalates(1));
  await untilSkipping(page, () => document.querySelector('.modal.hot .sheet > .fuse.kind-answer:not(.done)') && !window.__game.ui.card && !window.__game.ui.updating, null, 'the escalation prompt with its fuse');
  await snap(page, shot, 'fuse-answer');
  await audit('fuse-answer');
  const answered = await page.evaluate(() => {
    const g = window.__game;
    const ran = g.clock.expire();
    return { ran, mine: g.state.round.pending?.calls[0] ?? null };
  });
  if (!answered.ran || answered.mine !== 'on') fail(`out of time on a call, I play on: ${JSON.stringify(answered)}`);
  await until(page, () => !document.querySelector('.modal.hot'), null, 'the prompt to go once I played on');

  // 5. The round's result: its fuse under the heading; running out presses Next for me.
  await page.evaluate(() => window.__game.finishRound());
  await untilSkipping(page, () => document.querySelector('.result h2 + .fuse.kind-next:not(.done)') && !window.__game.ui.updating && !window.__game.ui.card, null, 'the result with its fuse');
  await clearToasts(page);
  await snap(page, shot, 'fuse-next');
  await audit('fuse-next');
  // See the board: the strip keeps the fuse.
  await page.click('[data-action=peek]');
  await until(page, () => document.querySelector('.result.peek > .fuse.kind-next'), null, 'the peek strip with its fuse');
  await snap(page, shot, 'fuse-peek');
  await audit('fuse-peek');
  await page.click('[data-action=peek]');
  await until(page, () => document.querySelector('.result:not(.peek) h2 + .fuse.kind-next'), null, 'the full result again');
  const next = await page.evaluate(() => {
    const g = window.__game;
    const ran = g.clock.expire();
    return { ran, ready: g.table.ready.slice(), roundNo: g.state.roundNo };
  });
  if (!next.ran || next.ready.join() !== 'true,false,false') fail(`out of time on the result, Next is pressed for me (the held rivals not yet): ${JSON.stringify(next)}`);

  // 6. Reduced motion: the next round's fuse stands still and counts the seconds down.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    const t = window.__game.table;
    t.act(1, { a: 'next' });
    t.act(2, { a: 'next' });
  });
  await clearCard(page);
  await until(page, (r) => window.__game.view?.roundNo === r + 1 && !window.__game.ui.updating && document.querySelector('#hand .fuse.kind-drop b'), next.roundNo, 'the next round’s fuse under reduced motion');
  const still = await page.evaluate(() => {
    const f = document.querySelector('#hand .fuse');
    return { secs: Number(f.querySelector('b').textContent), moving: f.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').map((a) => a.animationName), spark: getComputedStyle(f, '::after').display };
  });
  if (!(still.secs >= 1 && still.secs <= 10) || still.moving.length || still.spark !== 'none') fail(`under reduced motion the fuse says the seconds and stands still: ${JSON.stringify(still)}`);
  await page.evaluate(() => window.__game.holdClock(false));
  await until(page, (s) => Number(document.querySelector('#hand .fuse b')?.textContent) < s, still.secs, 'the seconds to count down');
  await page.evaluate(() => window.__game.holdClock(true));
  await clearToasts(page);
  await snap(page, shot, 'fuse-reduced');
  await page.emulateMedia({ reducedMotion: null });

  // 7. Continue keeps the timer.
  await until(page, () => JSON.parse(localStorage.getItem('cg:dead-drop:match') || 'null')?.table?.timer === 10000, null, 'the timed Table saved');
  await toTitle(page);
  await page.click('[data-action=continue]');
  await clearCard(page);
  await until(page, () => window.__game.ui.screen === 'play' && !window.__game.ui.updating && window.__game.view?.scores.length === 3, null, 'the timed Table resumed');
  const resumed = await page.evaluate(() => ({ timer: window.__game.table.timer, clock: window.__game.clock?.kind ?? null, fuse: !!document.querySelector('#hand .fuse') }));
  if (resumed.timer !== 10000 || !resumed.clock || !resumed.fuse) fail(`Continue should keep the Table's timer: ${JSON.stringify(resumed)}`);
  log(`timer: Blitz at the Table; out of time my pick locked in, then a random drop, then play on and Next; reduced motion counted ${still.secs}, then down; Continue kept it`);

  // 8. Pass and play's sheet has the Timer; the clock starts only when a player uncovers.
  await toTitle(page);
  await page.evaluate(() => localStorage.removeItem('cg:dead-drop:match'));
  await page.click('[data-action=pass]');
  await page.click('.pass-sheet [data-action=pass-seats][data-choice="2"]');
  await page.click('.pass-sheet [data-action=pass-timer][data-choice="30000"]');
  await until(page, () => document.querySelector('.pass-sheet [data-action=pass-timer][data-choice="30000"][aria-pressed=true]') && document.querySelector('.pass-sheet [data-action=pass-seats][data-choice="2"][aria-pressed=true]'), null, 'pass and play: two players, 30 s');
  await clearToasts(page);
  await snap(page, shot, 'pass-timer');
  await audit('pass-timer');
  await page.click('.pass-sheet [data-action=pass-start][data-choice=classic]');
  await until(page, () => window.__game.ui.screen === 'cover' && window.__game.ui.cover?.seat === 0 && !window.__game.ui.updating, null, 'the first cover');
  const covered = await page.evaluate(() => ({ timer: window.__game.table.timer, clock: window.__game.table.view(-1).clock, fuse: document.querySelectorAll('.fuse').length }));
  if (covered.timer !== 30000 || covered.clock !== null || covered.fuse) fail(`behind the cover no clock runs: ${JSON.stringify(covered)}`);
  await page.click('[data-action=uncover]');
  await until(page, () => document.querySelector('#hand .fuse.kind-drop'), null, 'the fuse once uncovered');
  const uncovered = await page.evaluate(() => window.__game.table.view(0).clock);
  if (uncovered?.kind !== 'drop' || !(uncovered.left > 0 && uncovered.left <= 30000)) fail(`uncovered, the drop clock runs: ${JSON.stringify(uncovered)}`);
  await dropFirst(page);
  await until(page, () => window.__game.ui.screen === 'cover' && window.__game.ui.cover?.seat === 1, null, 'the second cover');
  const handed = await page.evaluate(() => window.__game.table.view(-1).clock);
  if (handed !== null) fail(`handing the device over stops the clock until the next player uncovers: ${JSON.stringify(handed)}`);
  // The round's result is everyone's: the clock runs for Next there (whoever holds the device presses it,
  // or it does), and running out starts the next round.
  await page.click('[data-action=uncover]');
  await until(page, () => window.__game.ui.screen === 'play' && document.querySelector('#hand .fuse.kind-drop'), null, 'the second player’s hand');
  await page.evaluate(() => window.__game.finishRound());
  await untilSkipping(page, () => window.__game.state.phase === 'round-over' && document.querySelector('.result h2 + .fuse.kind-next:not(.done)') && !window.__game.ui.updating && !window.__game.ui.card, null, 'pass and play’s shared result with its fuse');
  const shared = await page.evaluate(() => {
    const g = window.__game;
    const kind = g.clock?.kind;
    const ran = g.clock.expire();
    return { kind, ran, roundNo: g.state.roundNo, ready: g.table.ready.slice() };
  });
  if (shared.kind !== 'next' || !shared.ran || shared.roundNo !== 1) fail(`pass and play's result: Next on the clock, and running out starts the next round: ${JSON.stringify(shared)}`);
  await clearCard(page);
  await until(page, () => window.__game.ui.screen === 'cover' && !window.__game.ui.updating && window.__game.table.view(-1).clock === null, null, 'the next round’s cover, no clock');
  log('pass and play: Timer 30 s on the sheet; no clock behind a cover, the fuse once uncovered; the shared result pressed Next when its clock ran out');

  await page.evaluate((skip) => {
    const g = window.__game;
    g.leave();
    g.holdClock(false);
    g.holdRival(false);
    g.skipAnimations(skip);
    g.ui.tableTimer = 0;
    g.ui.passTimer = 0;
    localStorage.removeItem('cg:dead-drop:match');
  }, skipping);
  await until(page, () => document.querySelector('.title-screen'), null, 'the title after the timer');
}

/**
 * Phase 3's screens (Task 10). The rivals screen's Table tab: four seats default to the open rungs (Agent
 * Wren, the Magpie, Mr Heron; never Control), a rung picked twice is "Agent Wren II", Mixed draws from your
 * network, Start deals a four-seat table with those names, and the title's Continue resumes it; with
 * nobody beaten it offers only Agent Wren (three times over) and says why Mixed waits. Then the host's
 * lobby on its own page (?net=local, no guest): Seats 3, Timer 30 s, Fill (two computer rivals) and
 * Start with one human, while a second tab, which arrived once the table was full, watches: from the
 * lobby to the table with no hand and no controls, every tag a button, the help sheet, a round's result
 * with no Next round (and no sting, no city coloured as its own), and a dossier with no rematch and no win
 * or loss. That tab isn't the check's page: its shots and DOM audits go through the check's own shot() and
 * audit(), which take a page (`<slug>-[phone-]tab-<name>.png`).
 */
export async function lobbySteps(page, { log, shot, audit, phone, url }) {
  const fail = (m) => {
    throw new Error(m);
  };
  // 1. The Table screen.
  await page.evaluate(() => {
    window.__game.leave();
    window.__game.beat(['wren', 'magpie']);
  });
  await until(page, () => document.querySelector('.title-screen [data-action=rivals]'), null, 'the title for the Table');
  await page.click('[data-action=rivals]');
  await page.click('[data-action=rivals-tab][data-choice=table]');
  await until(page, () => document.querySelector('.table-pick') && document.querySelector('[data-action=rivals-tab][data-choice=table][aria-pressed=true]'), null, 'the Table tab');
  await page.click('[data-action=table-seats][data-choice="4"]');
  await until(page, () => document.querySelectorAll('.table-seat').length === 4, null, 'four seats at the Table');
  /** The Table's rival seats as drawn: names, the pressed slip in each, the rungs offered, Mixed, the roster note. */
  const pickNow = () =>
    page.evaluate(() => {
      const rows = [...document.querySelectorAll('.table-seat')].slice(1);
      const mixed = document.querySelector('[data-action=table-roster][data-choice=mixed]');
      return {
        names: rows.map((r) => r.querySelector('.nm').textContent),
        pressed: rows.map((r) => [...r.querySelectorAll('[data-action=table-rival][aria-pressed=true]')].map((b) => b.dataset.id).join('+')),
        offered: [...new Set(rows.map((r) => [...r.querySelectorAll('[data-action=table-rival]')].map((b) => b.dataset.id).join()))],
        mixed: mixed ? !mixed.disabled : null,
        note: document.querySelector('.table-pick .pick-row .seg-note')?.textContent ?? '',
      };
    });
  const four = await pickNow();
  if (four.names.join('|') !== 'Agent Wren|The Magpie|Mr Heron' || four.pressed.join() !== 'wren,magpie,heron' || four.offered.join('/') !== 'wren,magpie,heron' || four.mixed !== true) {
    fail(`with Wren and the Magpie beaten, four seats should default to Wren, the Magpie and Mr Heron, offer those three (no Control) and allow Mixed: ${JSON.stringify(four)}`);
  }
  await page.click('[data-action=table-rival][data-seat="3"][data-id=wren]');
  await until(page, () => document.querySelectorAll('.table-seat .nm')[3]?.textContent === 'Agent Wren II', null, 'seat 4’s rival changed to Agent Wren II');
  const changed = await pickNow();
  if (changed.names.join('|') !== 'Agent Wren|The Magpie|Agent Wren II' || changed.pressed.join() !== 'wren,magpie,wren') fail(`a rung picked twice is "Agent Wren II": ${JSON.stringify(changed)}`);
  await clearToasts(page);
  await page.evaluate(() => scrollTo(0, 0));
  await snap(page, shot, 'table-screen');
  await audit('table-screen');
  // Start is on screen without scrolling at four seats, with three rungs open and with all five (its bar
  // sticks to the window's foot).
  const startAt = () =>
    page.evaluate(() => {
      scrollTo(0, 0);
      const r = document.querySelector('[data-action=table-start]').getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), innerHeight, scrollHeight: document.scrollingElement.scrollHeight };
    });
  const start3 = await startAt();
  await page.evaluate(() => window.__game.beat(['wren', 'magpie', 'heron', 'countess', 'control']));
  await until(page, () => document.querySelectorAll('.table-seat:nth-child(2) [data-action=table-rival]').length === 5, null, 'five rungs at the Table');
  const start5 = await startAt();
  await page.evaluate(() => window.__game.beat(['wren', 'magpie']));
  await until(page, () => document.querySelectorAll('.table-seat:nth-child(2) [data-action=table-rival]').length === 3, null, 'three rungs at the Table again');
  log(`the Table's Start at four seats: ${JSON.stringify({ start3, start5 })}`);
  if (![start3, start5].every((r) => r.top >= 0 && r.bottom <= r.innerHeight)) fail(`the Table's Start should be on screen without scrolling at four seats: ${JSON.stringify({ start3, start5 })}`);
  // Mixed from the network, then Start: the rivals are held, and a drop saves the Table.
  await page.click('[data-action=table-roster][data-choice=mixed]');
  await until(page, () => document.querySelector('[data-action=table-roster][data-choice=mixed][aria-pressed=true]'), null, 'the Table’s Mixed roster');
  await page.evaluate(() => window.__game.holdRival(true));
  await page.click('[data-action=table-start]');
  await clearCard(page);
  await until(page, () => window.__game.ui.screen === 'play' && window.__game.view?.names.length === 4 && !window.__game.ui.updating && !window.__game.ui.card && document.querySelector('.hand .card'), null, 'the four-seat Table');
  const started = await page.evaluate(() => {
    const g = window.__game;
    return { names: g.view.names.slice(1), mixed: g.table.setup.mixed, twist: g.state.twist, rivals: g.ui.tableRivals, roster: g.state.roster };
  });
  const net14 = [...DECK, 'courier', 'blackmailer'];
  if (started.names.join('|') !== 'Agent Wren|The Magpie|Agent Wren II' || !started.mixed || started.twist !== null || started.rivals?.join() !== 'wren,magpie,wren' || !started.roster.every((id) => net14.includes(id))) {
    fail(`Start should deal a four-seat Mixed table from the network, no twist, with the names chosen: ${JSON.stringify(started)}`);
  }
  await dropFirst(page);
  await until(page, () => window.__game.view.round.plan && JSON.parse(localStorage.getItem('cg:dead-drop:match') || 'null')?.rivals, null, 'the Table saved');
  await toTitle(page);
  const cont = await page.evaluate(() => document.querySelector('[data-action=continue]')?.textContent.trim());
  if (cont !== 'Continue the table against Agent Wren, The Magpie and Agent Wren II') fail(`the title should offer to continue the Table: "${cont}"`);
  await page.click('[data-action=continue]');
  await clearCard(page);
  await until(page, () => window.__game.ui.screen === 'play' && window.__game.view?.names.length === 4 && !window.__game.ui.updating && document.querySelector('.tags'), null, 'the Table resumed');
  const resumed = await page.evaluate(() => ({ seats: window.__game.view.scores.length, names: window.__game.view.names.slice(1), plan: !!window.__game.view.round.plan, rivals: window.__game.ui.tableRivals }));
  if (resumed.seats !== 4 || resumed.names.join('|') !== 'Agent Wren|The Magpie|Agent Wren II' || !resumed.plan || resumed.rivals?.join() !== 'wren,magpie,wren') fail(`Continue should resume the four-seat Table with my drop locked: ${JSON.stringify(resumed)}`);
  await toTitle(page);
  log(`the Table: Wren, the Magpie and Mr Heron by default; "${changed.names[2]}"; Mixed dealt ${started.roster.length} from the network; "${cont}" resumed it`);
  // Nobody beaten: Agent Wren is the only rung, three times over, and Mixed waits for the network.
  await page.evaluate(() => {
    window.__game.holdRival(false);
    window.__game.beat([]);
    localStorage.removeItem('cg:dead-drop:match');
  });
  await page.click('[data-action=rivals]');
  await page.click('[data-action=rivals-tab][data-choice=table]');
  await until(page, () => document.querySelectorAll('.table-seat').length === 4, null, 'the Table with nobody beaten');
  const wrens = await pickNow();
  if (wrens.names.join('|') !== 'Agent Wren|Agent Wren II|Agent Wren III' || wrens.offered.join('/') !== 'wren' || wrens.mixed !== false || !wrens.note.includes('Mixed opens once you beat The Magpie')) {
    fail(`with nobody beaten the Table offers only Agent Wren, three times, and says why Mixed waits: ${JSON.stringify(wrens)}`);
  }
  await page.click('.rivals-screen [data-action=title]');
  await until(page, () => document.querySelector('.title-screen'), null, 'the title after the Table');
  log(`nobody beaten: ${wrens.names.join(', ')}; "${wrens.note}"`);

  // 2. The host's lobby, on a page of its own that talks over BroadcastChannel (?net=local).
  const hostUrl = `${url}${url.includes('?') ? '&' : '?'}net=local`;
  await page.goto(hostUrl);
  await until(page, () => window.__game && document.querySelector('.title-screen'), null, 'the title on a local-network page');
  await page.evaluate(() => window.__game.startHost('SMOKE9'));
  await until(page, () => window.__game.ui.net?.session && window.__game.ui.net.status === 'waiting' && document.querySelector('.lobby .seats'), null, 'the host’s lobby');
  const lobbyNow = () =>
    page.evaluate(() => ({
      seats: [...document.querySelectorAll('.lobby .seat')].map((x) => x.className.split(' ')[1]).join(),
      names: [...document.querySelectorAll('.lobby .seat .nm')].map((x) => x.textContent),
      pressed: ['lobby-size', 'lobby-timer', 'host-roster'].map((a) => document.querySelector(`[data-action=${a}][aria-pressed=true]`)?.dataset.choice).join(),
      small: [...document.querySelectorAll('[data-action=lobby-size]:disabled')].map((b) => b.dataset.choice).join(),
      start: document.querySelector('[data-action=lobby-start]')?.textContent.trim(),
      startOff: document.querySelector('[data-action=lobby-start]')?.disabled,
      fill: document.querySelector('[data-action=lobby-fill]')?.textContent.trim(),
      token: document.body.innerHTML.includes(window.__game.meta.token) || JSON.stringify(window.__game.ui.lobby).includes(window.__game.meta.token),
    }));
  const opened = await lobbyNow();
  if (opened.seats !== 'host,empty,empty,empty' || opened.pressed !== '4,0,classic' || opened.start !== 'Start' || !opened.startOff || opened.fill !== 'Fill empty seats with computer rivals' || opened.token) {
    fail(`the lobby opens with four seats (yours and three open), no timer, Classic, Start disabled and no token anywhere: ${JSON.stringify(opened)}`);
  }
  await page.click('[data-action=lobby-size][data-choice="3"]');
  await page.click('[data-action=lobby-timer][data-choice="30000"]');
  await until(
    page,
    () => window.__game.ui.lobby?.size === 3 && window.__game.ui.lobby.timer === 30000 && document.querySelector('[data-action=lobby-size][data-choice="3"][aria-pressed=true]') && document.querySelector('[data-action=lobby-timer][data-choice="30000"][aria-pressed=true]'),
    null,
    'Seats 3 and Timer 30 s pressed',
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await snap(page, shot, 'lobby-host');
  await audit('lobby-host');
  if (phone) {
    // The seat list and Start, on screen without scrolling (measured from the top of the page).
    const fit = await page.evaluate(() => {
      const bottom = (sel) => Math.round((document.querySelector(sel)?.getBoundingClientRect().bottom ?? NaN) + scrollY);
      return { seats: bottom('.lobby .seats'), start: bottom('[data-action=lobby-start]'), innerHeight };
    });
    log(`phone fit in the lobby: ${JSON.stringify(fit)}`);
    if (!(fit.seats <= fit.innerHeight) || !(fit.start <= fit.innerHeight)) fail(`the phone's lobby should show the seat list and Start without scrolling: ${JSON.stringify(fit)}`);
  }
  await page.click('[data-action=lobby-fill]');
  await until(page, () => document.querySelectorAll('.lobby .seat.bot').length === 2, null, 'two computer rivals in the seat list');
  const filled = await lobbyNow();
  const roles = () => page.evaluate(() => [...document.querySelectorAll('.lobby .seat .role')].map((x) => x.textContent));
  const filledRoles = await roles();
  if (filled.seats !== 'host,bot,bot' || filled.names.some((n) => /computer/i.test(n)) || filledRoles.slice(1).join() !== 'Computer,Computer' || filled.fill !== 'Clear computer rivals' || filled.start !== 'Start' || filled.startOff || filled.small !== '2') {
    fail(`Fill seats two computer rivals (named once, "Computer" beside them); Start is open, and two seats (fewer than the three taken) can't be chosen: ${JSON.stringify({ ...filled, roles: filledRoles })}`);
  }
  // A table grown after Fill has an open seat again: Fill tops it up, then Clear empties the computer seats.
  await page.click('[data-action=lobby-size][data-choice="4"]');
  await until(page, () => window.__game.ui.lobby?.size === 4 && document.querySelectorAll('.lobby .seat.empty').length === 1, null, 'a fourth, open seat');
  const grown = await lobbyNow();
  if (grown.fill !== 'Fill empty seats with computer rivals') fail(`with a seat open again, the lobby offers Fill: ${JSON.stringify(grown)}`);
  await page.click('[data-action=lobby-fill]');
  await until(page, () => document.querySelectorAll('.lobby .seat.bot').length === 3, null, 'Fill topping up the fourth seat');
  const topped = await lobbyNow();
  if (topped.seats !== 'host,bot,bot,bot' || topped.fill !== 'Clear computer rivals') fail(`Fill tops up the grown table, then offers Clear: ${JSON.stringify(topped)}`);
  await page.click('[data-action=lobby-fill]');
  await until(page, () => !document.querySelector('.lobby .seat.bot'), null, 'Clear emptying the computer seats');
  await page.click('[data-action=lobby-size][data-choice="3"]');
  await until(page, () => window.__game.ui.lobby?.size === 3, null, 'three seats again');
  await page.click('[data-action=lobby-fill]');
  await until(page, () => document.querySelectorAll('.lobby .seat.bot').length === 2, null, 'two computer rivals again');
  const again = await lobbyNow();
  if (again.seats !== 'host,bot,bot' || again.names.join('|') !== filled.names.join('|')) fail(`Fill seats the same two computer rivals again: ${JSON.stringify(again)}`);
  log(`lobby: Seats 3 and Timer 30 s pressed; Fill seated ${filled.names.slice(1).join(' and ')}; grown to four, Fill topped up ${topped.names[3]}, Clear emptied them`);

  // A second tab arrives while the table is full: it watches.
  const sp = await page.context().newPage();
  const spErrors = [];
  sp.on('pageerror', (e) => spErrors.push(e.message));
  sp.on('console', (m) => m.type() === 'error' && spErrors.push(m.text()));
  // The tab's screenshots and DOM audit go through the check's own (shot and audit take a page).
  const spShot = (name) => snap(sp, shot, `tab-${name}`);
  const spAudit = (label) => audit(`spectator tab ${label}`, sp);
  try {
    await sp.goto(`${hostUrl}#join=SMOKE9`);
    await until(sp, () => window.__game?.ui.seat === -1 && document.querySelector('.lobby.guest .seats'), null, 'the spectator’s lobby');
    const watchLobby = await sp.evaluate(() => ({ wait: document.querySelector('.lobby .wait')?.textContent.trim(), seats: [...document.querySelectorAll('.lobby .seat')].map((x) => x.className.split(' ')[1]).join() }));
    if (watchLobby.wait !== 'The table is full: you’ll watch the match.' || watchLobby.seats !== 'host,bot,bot') fail(`a tab that arrives at a full table should be told it will watch: ${JSON.stringify(watchLobby)}`);
    await spShot('watch-lobby');
    await spAudit('lobby');

    // Start with one human and two computer rivals (held, so nothing moves under the checks).
    await page.evaluate(() => window.__game.holdRival(true));
    await page.click('[data-action=lobby-start]');
    await until(page, () => window.__game.ui.screen === 'play' && window.__game.view?.names.length === 3, null, 'the host’s three-seat table');
    const dealt = await page.evaluate(() => ({ names: window.__game.view.names, timer: window.__game.view.timer, save: JSON.parse(localStorage.getItem('cg:dead-drop:host-SMOKE9') || 'null') }));
    if (dealt.names[1] !== 'Agent Wren' || dealt.names[2] !== 'The Magpie' || dealt.timer !== 30000) fail(`Start should deal a three-seat table with the computer rivals and the 30 s timer: ${JSON.stringify({ names: dealt.names, timer: dealt.timer })}`);
    if (!dealt.save?.lobby?.started || dealt.save.lobby.seats.length !== 3 || dealt.save.table?.state?.scores.length !== 3) fail(`the host's save should hold the started lobby and the table: ${JSON.stringify(dealt.save?.lobby ?? null)}`);
    await clearCard(page);

    // The spectator goes from the lobby to the table as seat -1: no hand, no controls, every tag a button.
    await until(sp, () => window.__game.ui.screen === 'play' && window.__game.ui.seat === -1 && window.__game.view?.names.length === 3, null, 'the spectator’s table');
    await clearCard(sp);
    await until(sp, () => !window.__game.ui.updating && document.querySelector('.tags'), null, 'the spectator’s table, settled');
    const watch = await sp.evaluate(() => ({
      hand: document.querySelectorAll('#hand .card').length,
      controls: [...document.querySelectorAll('.controls button')].map((b) => b.dataset.action),
      status: document.querySelector('.controls .status')?.textContent ?? '',
      tags: [...document.querySelectorAll('.tags .tag')].map((t) => t.tagName).join(),
      who: [...document.querySelectorAll('.tags .who')].map((t) => t.textContent),
      leave: !!document.querySelector('.top [data-action=quit]'),
      names: window.__game.view.names,
    }));
    const wantStatus = `Watching: ${watch.names[0]}, ${watch.names[1]} and ${watch.names[2]}.`;
    if (watch.hand || watch.controls.length || !watch.status.startsWith(wantStatus) || watch.tags !== 'BUTTON,BUTTON,BUTTON' || watch.who.join('|') !== watch.names.join('|') || !watch.leave) {
      fail(`a spectator sees the table with no hand or controls, "${wantStatus}", every tag a button named for its seat (no "You") and Leave: ${JSON.stringify(watch)}`);
    }
    // Seat 0's file opens from its tag (every tag is a rival's to a spectator), and the help sheet works.
    await sp.click('.tags button.tag[data-seat="0"]');
    await until(sp, () => document.querySelector('.tag-sheet') && window.__game.ui.modal === 'tag', null, 'seat 0’s file for the spectator');
    await sp.keyboard.press('Escape');
    await until(sp, () => !document.querySelector('.tag-sheet') && window.__game.ui.modal === null, null, 'the file closed');
    await sp.click('[data-action=help]');
    await until(sp, () => document.querySelector('.sheet.help'), null, 'the help sheet for the spectator');
    await sp.keyboard.press('Escape');
    await until(sp, () => !document.querySelector('.sheet.help'), null, 'the help sheet closed');
    // F (fold) and E (escalate) do nothing for a spectator.
    await sp.keyboard.press('f');
    await sp.keyboard.press('e');
    if (await sp.evaluate(() => window.__game.ui.modal !== null || !!document.querySelector('.modal'))) fail('F or E opened something for a spectator');
    await clearToasts(sp);
    await spShot('spectator');
    await spAudit('table');

    // A round ends: the spectator's result has no Next round, only who it waits for. A spectator has no
    // side: no win or loss sting, and no city or line coloured as its own ("me"), only by its winner's seat.
    // A dead heat plays no sting to anyone, so the check would say nothing: until a round has a winner, the
    // players start another (the film strips cleared each time, so no reel can end the match meanwhile).
    const stings = () => sp.evaluate(() => ['roundWon', 'roundLost'].map((k) => window.__game.audio.effects[k]));
    let stung = null;
    let decided = null;
    let played = 0;
    for (let round = 0; round < 6 && decided === null; round++, played++) {
      if (round) {
        await page.evaluate(() => [0, 1, 2].forEach((s) => window.__game.table.act(s, { a: 'next' })));
        await until(sp, (r) => (window.__game.ui.animating && (window.__game.ui.skip = true), window.__game.ui.card?.skip(), window.__game.view?.roundNo === r && window.__game.view.phase === 'plan' && !window.__game.ui.updating && !window.__game.ui.card), round, 'the next round for the spectator');
      }
      stung = await stings();
      await page.evaluate(() => {
        const g = window.__game;
        g.state.strips = g.state.strips.map(() => 0);
        g.finishRound();
      });
      await until(sp, (r) => (window.__game.ui.animating && (window.__game.ui.skip = true), window.__game.view?.roundNo === r && window.__game.view.phase === 'round-over' && !window.__game.ui.updating && document.querySelector('.result')), round, 'the round’s result for the spectator');
      decided = await sp.evaluate(() => window.__game.view.round.result.winner);
    }
    if (decided === null) fail('six dead heats in a row: no round with a winner to check the spectator’s silence on');
    const result = await sp.evaluate(() => ({
      next: !!document.querySelector('[data-action=next]'),
      wait: document.querySelector('.result .wait')?.textContent.trim() ?? null,
      mine: document.querySelectorAll('.city.won-me, .city-line.w-me').length,
      won: [...document.querySelectorAll('#board .city')].map((c) => (c.classList.contains('won-them') ? `them${c.dataset.them}` : c.classList.contains('won-none') ? 'none' : '?')),
      winners: window.__game.view.round.result.cityWinners,
    }));
    const after = await stings();
    const wonOk = result.won.every((w, i) => (result.winners[i] === null ? w === 'none' : w === `them${result.winners[i]}`));
    if (result.next || !/^Waiting for .+…$/.test(result.wait || '') || result.mine || !wonOk || after.join() !== stung.join()) fail(`a spectator's round result has no Next round, no sting and nothing coloured as its own: ${JSON.stringify({ ...result, stung, after })}`);
    await clearToasts(sp);
    await spShot('spectator-result');
    // The match ends: the dossier names the winner, with no rematch, and neither won nor lost.
    await page.evaluate(() => {
      const g = window.__game;
      for (const s of [0, 1, 2]) g.table.act(s, { a: 'next' });
      g.state.scores = [30, 0, 0];
      g.state.target = 1;
      g.finishRound();
    });
    await until(sp, `(window.__game.ui.animating && (window.__game.ui.skip = true), window.__game.ui.card?.skip(), document.querySelector('[data-action=final]'))`, null, 'the final report button for the spectator');
    await sp.click('[data-action=final]');
    await until(sp, () => document.querySelector('.over'), null, 'the spectator’s dossier');
    const over = await sp.evaluate(() => ({ cls: document.querySelector('.over').className, rematch: !!document.querySelector('[data-action=rematch]'), title: !!document.querySelector('.over [data-action=title]'), head: document.querySelector('.over h2')?.textContent.replace(/\s+/g, ' ').trim() }));
    if (over.cls !== 'over' || over.rematch || !over.title) fail(`a spectator's dossier has no rematch and no won or lost: ${JSON.stringify(over)}`);
    await spShot('spectator-over');
    await spAudit('dossier');
    if (spErrors.length) fail(`the spectator's tab logged errors: ${spErrors.join(' | ')}`);
    log(`a spectator: "${watch.status}"; no Next round ("${result.wait}") and no sting in a round won by ${decided === 0 ? 'the host' : 'a computer rival'} (round ${played} of the match), no rematch on "${over.head}"`);
  } finally {
    await sp.close();
  }
  await page.evaluate(() => {
    window.__game.holdRival(false);
    window.__game.leave();
    localStorage.removeItem('cg:dead-drop:host-SMOKE9');
  });
  await page.goto(url);
  await until(page, () => window.__game && document.querySelector('.title-screen'), null, 'the title again');
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
        // A Blackmailer of mine that flipped on the last quick turn leaves my call waiting on her answer, and
        // the status says that instead of the listening line: deal again.
        return g.state.phase === 'plan' && g.view.round.turn === 6 && g.view.round.legal.length > 0 && !g.view.round.pending;
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
    // round has shown, and her hand and deck counts. An outside tap closes it; so does Escape. Her
    // turn-2 drop is a Veteran: a Blackmailer there would open a call whose prompt covers the twist chip.
    await staged(page, { rival: 'magpie', rivalHand: ['heavy', 'veteran'], cities: ['lisbon', 'monaco', 'moscow'] }, 'a Magpie table for the unseen strip');
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
  // The host's roster: Classic by default. Mixed is the lobby's setup, which the match deals from at Start.
  const classicFirst = await host.evaluate(() => document.querySelector('[data-action=host-roster][data-choice=classic]')?.getAttribute('aria-pressed'));
  if (classicFirst !== 'true') throw new Error(`the lobby's roster should start on Classic: ${classicFirst}`);
  await host.click('[data-action=host-roster][data-choice=mixed]');
  await until(host, () => window.__game.ui.lobby?.roster === 'mixed' && document.querySelector('[data-action=host-roster][data-choice=mixed][aria-pressed=true]'), null, 'the host’s Mixed roster');
  await shot('lobby-mixed', host);

  // The guest sits down: the host sees them in the seat list and nothing starts until the host says so.
  await guest.goto(local(url, `#join=${code}`));
  await until(host, () => document.querySelector('.lobby .seat.guest') && document.querySelector('[data-action=lobby-start]:not([disabled])'), null, 'the guest in the host’s seat list');
  await until(guest, () => document.querySelector('.lobby.guest .seats') && window.__game.ui.lobby?.seats.length === 4, null, 'the guest’s lobby');
  const lobbies = {
    host: await host.evaluate(() => ({ screen: window.__game.ui.screen, start: document.querySelector('[data-action=lobby-start]').textContent.trim(), seats: [...document.querySelectorAll('.lobby .seat')].map((x) => x.className.split(' ')[1]).join() })),
    guest: await guest.evaluate((token) => ({ screen: window.__game.ui.screen, wait: document.querySelector('.lobby .wait')?.textContent.trim(), seats: [...document.querySelectorAll('.lobby .seat')].map((x) => x.className.split(' ')[1]).join(), buttons: document.querySelectorAll('.lobby .seats button, [data-action^=lobby-], [data-action=host-roster]').length, token: JSON.stringify(window.__game.ui.lobby).includes(token) || document.body.innerHTML.includes(token) }), await guest.evaluate(() => window.__game.meta.token)),
  };
  if (lobbies.host.screen !== 'lobby' || lobbies.host.start !== 'Start with 2' || lobbies.host.seats !== 'host,guest,empty,empty') throw new Error(`the host's lobby should list the guest and offer "Start with 2": ${JSON.stringify(lobbies.host)}`);
  if (lobbies.guest.screen !== 'lobby' || !/^Waiting for .+ to start…$/.test(lobbies.guest.wait || '') || lobbies.guest.seats !== 'host,guest,empty,empty' || lobbies.guest.buttons || lobbies.guest.token) throw new Error(`the guest's lobby should wait for the host, read-only, with no token: ${JSON.stringify(lobbies.guest)}`);
  await snap(host, shot, 'lobby-seats');
  await audit('lobby-seats', host);
  await snap(guest, shot, 'lobby-guest');
  await audit('lobby-guest', guest);
  log(`the guest sat down; the host's lobby offers "${lobbies.host.start}", the guest's says "${lobbies.guest.wait}"`);
  await host.click('[data-action=lobby-start]');
  await until(host, () => window.__game.ui.screen === 'play', null, 'the host’s table after Start');
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
  // The banner is announced once: it lives in #banner (role="status"), outside the table, and two turns
  // drawn under it (the stand-in plays the seat) leave the same element there (its data-id stamp).
  const stamp = () =>
    host.evaluate(() => {
      const b = document.querySelector('.banner');
      return { id: b?.dataset.id ?? null, text: b?.textContent ?? '', home: b?.parentElement?.id ?? null, role: document.querySelector('#banner')?.getAttribute('role') ?? null, inScreen: !!document.querySelector('#screen .banner') };
    });
  const first = await stamp();
  if (first.home !== 'banner' || first.role !== 'status' || first.inScreen || !first.id) throw new Error(`the banner should live in #banner, a status region outside the table: ${JSON.stringify(first)}`);
  for (let k = 0; k < 2; k++) {
    // The host plays through its table, as its own lock and answer do: the stand-in's Blackmailer may have
    // put a call to it (a prompt over the hand), and with nowhere to drop it passes by itself.
    const turn = await host.evaluate(() => {
      const t = window.__game.table;
      const P = t.state.round.pending;
      if (P && P.from.includes(0) && P.calls[0] === null) t.act(0, { a: 'respond', accept: true });
      const d = t.view(0).round;
      if (!d.plan && d.legal.length) t.act(0, { a: 'lock', uid: d.legal[0].uid, city: d.legal[0].city });
      return d.turn;
    });
    await untilQuick(host, `() => window.__game.state.round.turn > ${turn} && window.__game.view?.round.turn > ${turn} && !window.__game.ui.updating`, `turn ${turn + 1} under the banner`);
  }
  const later = await stamp();
  if (later.id !== first.id || later.text !== first.text || later.inScreen) throw new Error(`two new views redrew the table but should leave the banner as it was: ${JSON.stringify({ first, later })}`);
  log(`the banner ("${first.text.trim()}") stood through two turns as one element (data-id ${first.id})`);

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

// ── table(): three players and a watcher, online ───────────────────────────────────────────────

/** Pages for the table pass: four in one browser for `npm run check` (host, two guests, a watcher); three separate browsers live. */
export const tablePages = { local: 4, live: 3 };

/**
 * The table's players, one per page. Pages of one browser share its storage, so on ?net=local each
 * URL carries a token and codename of its own (main.js's tabAs) and the host tells them apart.
 */
const TABLE_PLAYERS = [
  { token: 'd0d0d0d0d0d0d000', name: 'Agent Fox' },
  { token: 'd0d0d0d0d0d0d001', name: 'Agent Owl' },
  { token: 'd0d0d0d0d0d0d002', name: 'Agent Pike' },
  { token: 'd0d0d0d0d0d0d003', name: 'Agent Lynx' },
];

/** As until(), skipping any reveal in progress on the way (a tap would), so a slow page never holds up the step. */
const untilSkipping = (page, fn, arg, what) => until(page, `(window.__game.ui.animating && (window.__game.ui.skip = true), (${fn})(${JSON.stringify(arg ?? null)}))`, null, what);

/** Pick the card of `kind` in my hand, the first city it can go to, and lock in, through the real UI. */
async function dropKind(page, kind) {
  const sel = `#hand .card.k-${kind}:not([disabled])`;
  await until(page, (s) => document.querySelector(s), sel, `a ${kind} to drop`);
  await page.click(sel);
  if (!(await page.$('.city.target'))) throw new Error(`picking the ${kind} did not highlight any city`);
  await page.click('.city.target .plate');
  await page.click('[data-action=lock]');
}

/**
 * What a guest's (or a spectator's) latest view, as it came over the wire, gives away: its seat, the owners
 * of the cards in its hand, how many of the others' face-down agents are on the board, how many of those
 * (or their drop events) carry a kind, a power or a deck id, and on screen the face-down chips drawn as
 * backs and the others' face-down chips drawn with their face.
 */
const secrets = (page) =>
  page.evaluate(() => {
    const v = window.__game.ui.remote;
    const me = v.seat;
    const theirs = [...v.round.cities.flatMap((c) => c.sides.flat()), ...v.round.gone.flat()].filter((cv) => cv.faceDown && cv.owner !== me);
    const drops = v.round.events.filter((e) => e.t === 'drop' && e.faceDown && e.seat !== me);
    const chips = [...document.querySelectorAll('#board .chip')];
    return {
      seat: me,
      owners: v.round.hand.map((c) => c.owner),
      hidden: theirs.length,
      told: theirs.filter((cv) => cv.kind !== null || cv.power !== null || cv.id0 !== null).length + drops.filter((e) => e.kind !== null && e.kind !== undefined).length,
      backs: chips.filter((c) => c.classList.contains('back')).length,
      faces: chips.filter((c) => c.classList.contains('fd') && !c.classList.contains(`own-${me}`)).length,
    };
  });

/** Record every toast the page shows from now on in window.__toasts (each is up for about two seconds). */
const watchToasts = (page) =>
  page.evaluate(() => {
    window.__toasts = [];
    window.__toastWatch?.disconnect();
    window.__toastWatch = new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains('cg-toast')) window.__toasts.push(n.textContent);
    });
    window.__toastWatch.observe(document.body, { childList: true });
  });

/** Record, in window.__exits, the board row of every chip that starts a fold's exit (it lifts off: class exfil) from now on. */
const watchExits = (page) =>
  page.evaluate(() => {
    window.__exits = [];
    window.__exitWatch?.disconnect();
    window.__exitWatch = new MutationObserver((ms) => {
      for (const m of ms) if (m.target.classList?.contains('exfil')) window.__exits.push(m.target.closest('.row')?.dataset.row ?? null);
    });
    window.__exitWatch.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });

/**
 * Three players at one online table, in ten steps, each waiting on state: the host's three-seat lobby,
 * two guests, Start and a turn of face-down Sleepers that no guest's view names; a spectator (seat -1, no
 * hand or controls, every face-down agent hidden); an escalation with two answers, one on and one abort
 * (the answers card on every page, held for the checks, then the abort's exit on every page); emotes
 * (relayed, and a second within 3 s dropped); a player whose line goes dead (the stand-in sits, says so
 * and locks; the player comes back to its lock); a guest's reload and then the host's (route() reopens
 * the table and its lobby, and every guest gets its seat back by token); a player leaving through the
 * menu (the stand-in at once, and the match goes on); a rematch at three seats, which the stand-in
 * accepts by itself. Locally the pages are tabs of one browser on ?net=local, each a player of its own
 * (token= and name=); live (scripts/verify-live.mjs) they are three browsers on the public relays, with
 * no watcher, no stand-in clock and no host reload.
 */
export async function table(pages, { url, log, shot, audit, live = false, code = 'TABLE7' }) {
  T = live ? 45000 : 15000;
  const fail = (m) => {
    throw new Error(m);
  };
  const P = TABLE_PLAYERS;
  const sep = url.includes('?') ? '&' : '?';
  // Guests ping every 500 ms here, so the host's 2 s stand-in wait (step 7) covers only a line that has gone.
  const at = (i, hash = '') => (live ? `${url}${hash}` : `${url}${sep}net=local&token=${P[i].token}&name=${encodeURIComponent(P[i].name)}&ping=500${hash}`);
  let [host, a, b] = pages;
  const watcher = live ? null : pages[3];
  const everyone = () => [host, a, b, watcher].filter(Boolean);

  // 1. The host opens a lobby of three seats on Classic. (Locally, first: the tab knobs need ?net=local.)
  if (!live) {
    await host.goto(`${url}${sep}token=${P[0].token}&name=${encodeURIComponent(P[0].name)}`);
    await until(host, () => window.__game && document.querySelector('.title-screen'), null, 'a page without ?net=local');
    const plain = await host.evaluate(() => ({ token: window.__game.meta.token, codename: window.__game.meta.codename }));
    if (plain.token === P[0].token) fail('token= changed the token of a page without ?net=local');
    await host.goto(at(0));
    await until(host, () => window.__game && document.querySelector('.title-screen'), null, 'the host page');
    const tab = await host.evaluate(() => ({ token: window.__game.meta.token, codename: window.__game.meta.codename, saved: JSON.parse(localStorage.getItem('cg:dead-drop:meta') || 'null') }));
    if (tab.token !== P[0].token || tab.codename !== P[0].name || tab.saved?.token !== plain.token || tab.saved?.codename !== plain.codename) {
      fail(`a ?net=local page plays as its token= and name= in memory, and the save keeps the browser's own: ${JSON.stringify({ tab: [tab.token, tab.codename], saved: [tab.saved?.token, tab.saved?.codename], own: plain })}`);
    }
  } else {
    await host.goto(at(0));
    await until(host, () => window.__game && document.querySelector('.title-screen'), null, 'the host page');
  }
  await host.evaluate((c) => window.__game.startHost(c), code);
  await until(host, () => window.__game.ui.net?.session && window.__game.ui.net.status === 'waiting' && document.querySelector('.lobby .seats'), null, 'the host’s lobby');
  await host.click('[data-action=lobby-size][data-choice="3"]');
  await until(host, () => window.__game.ui.lobby?.size === 3 && window.__game.ui.lobby.roster === 'classic' && document.querySelector('[data-action=lobby-size][data-choice="3"][aria-pressed=true]'), null, 'a three-seat lobby on Classic');
  await host.click('[data-action=lobby-timer][data-choice="30000"]');
  await until(host, () => window.__game.ui.lobby?.timer === 30000 && document.querySelector('[data-action=lobby-timer][data-choice="30000"][aria-pressed=true]'), null, 'Timer 30 s in the lobby');
  const hostNet = await host.evaluate(() => window.__game.net);
  if (hostNet?.role !== 'host' || hostNet.code !== code || hostNet.seat !== 0) fail(`__game.net should say the host's role, code and seat: ${JSON.stringify(hostNet)}`);
  await snap(host, shot, 'lobby-host');
  await audit('lobby-host', host);
  log("1. the host's lobby: three seats, Classic, Timer 30 s");

  // 2. Two guests sit down, one after the other (so they take seats 1 and 2 in that order, even through
  // the relays); the host sees both, here.
  await a.goto(at(1, `#join=${code}`));
  await until(host, () => window.__game.ui.lobby?.seats[1]?.kind === 'guest', null, 'the first guest at seat 1');
  await b.goto(at(2, `#join=${code}`));
  await until(host, () => window.__game.ui.lobby?.seats.filter((s) => s.kind === 'guest' && s.here).length === 2 && document.querySelector('[data-action=lobby-start]:not([disabled])'), null, 'both guests in the host’s seat list');
  for (const [p, seat] of [
    [a, 1],
    [b, 2],
  ]) {
    await until(p, (s) => window.__game.ui.lobby?.seats.length === 3 && window.__game.net?.seat === s && document.querySelector('.lobby.guest .seat.you'), seat, `the lobby of the guest at seat ${seat}`);
  }
  const tokens = await Promise.all([host, a, b].map((p) => p.evaluate(() => window.__game.meta.token)));
  const leaked = await Promise.all([a, b].map((p) => p.evaluate((ts) => ts.some((t) => document.body.innerHTML.includes(t) || JSON.stringify(window.__game.ui.lobby).includes(t)), tokens)));
  if (leaked.some(Boolean)) fail('a guest’s lobby shows a token');
  await snap(host, shot, 'lobby-full');
  await audit('lobby-full', host);
  await snap(a, shot, 'lobby-guest');
  await audit('lobby-guest', a);
  log('2. two guests sat down at seats 1 and 2');

  // 3. Start. Everyone holds a Sleeper (moved into each hand on the host's table, as a deal could have),
  // so face-down agents are on the board for the checks below; each drops it, and turn 1 resolves.
  await host.click('[data-action=lobby-start]');
  // The host's clock waits from here on (a steady table for the checks); step 11 runs it out.
  await host.evaluate(() => window.__game.holdClock(true));
  for (const p of [host, a, b]) await until(p, () => window.__game.ui.screen === 'play' && window.__game.view?.scores.length === 3, null, 'the three-seat table');
  const planted = await host.evaluate(() => {
    const g = window.__game;
    const R = g.state.round;
    for (let seat = 0; seat < R.hands.length; seat++) {
      const uid = Object.keys(R.cards).find((u) => R.cards[u].origin === seat && R.cards[u].kind === 'sleeper');
      if (R.hands[seat].includes(uid)) continue;
      const i = R.decks[seat].indexOf(uid);
      if (i < 0) return `no Sleeper in seat ${seat}'s hand or deck`;
      R.decks[seat][i] = R.hands[seat].pop();
      R.hands[seat].push(uid);
    }
    g.table.touch();
    return null;
  });
  if (planted) fail(planted);
  for (const p of [a, b]) await until(p, () => window.__game.ui.remote?.round.hand.some((c) => c.kind === 'sleeper'), null, 'a Sleeper in the guest’s hand');
  for (const p of [host, a, b]) await clearCard(p);
  // Everyone is on the host's 30 s clock: every view carries it, and a fuse burns across every hand.
  for (const p of [host, a, b]) await until(p, () => document.querySelector('#hand .fuse.kind-drop'), null, 'the fuse across the hand');
  const clocks = await Promise.all([host, a, b].map((p) => p.evaluate(() => ({ clock: (window.__game.ui.remote ?? window.__game.table.view(0)).clock, timer: window.__game.view.timer, has: !!window.__game.clock }))));
  if (clocks.some((c, i) => c.clock?.kind !== 'drop' || !(c.clock.left > 0 && c.clock.left <= 30000) || c.timer !== 30000 || c.has !== (i === 0))) {
    fail(`every view should carry the host's 30 s drop clock (and only the host has one to run out): ${JSON.stringify(clocks)}`);
  }
  for (const p of [host, a, b]) await dropKind(p, 'sleeper');
  for (const p of [host, a, b]) await until(p, () => window.__game.view?.round.turn === 2 && !window.__game.ui.animating && !window.__game.ui.updating && window.__game.ui.shownSeq === window.__game.view.turnSeq, null, 'turn 2, revealed');
  await snap(host, shot, 'table-host');
  await audit('table-host', host);
  await snap(a, shot, 'table-guest');
  await audit('table-guest', a);
  for (const [p, seat] of [
    [a, 1],
    [b, 2],
  ]) {
    const s = await secrets(p);
    if (s.seat !== seat || !s.owners.length || s.owners.some((o) => o !== seat)) fail(`the guest at seat ${seat} should hold only its own cards: ${JSON.stringify(s)}`);
    if (s.hidden !== 2 || s.told || s.backs !== 2 || s.faces) fail(`the guest at seat ${seat} should see the other two Sleepers face down, with nothing about them: ${JSON.stringify(s)}`);
  }
  log(`3. Start dealt three seats on a 30 s clock (left ${clocks.map((c) => c.clock.left).join(' / ')} ms, a fuse on every hand); three Sleepers went down and no guest’s view names one`);

  // 4. A spectator arrives mid-match: seat -1, no hand, no controls, every face-down agent hidden.
  if (watcher) {
    await watcher.goto(at(3, `#join=${code}`));
    await until(watcher, () => window.__game?.ui.seat === -1 && window.__game.ui.screen === 'play' && window.__game.ui.remote?.round.turn === 2 && !window.__game.ui.updating && document.querySelector('.tags'), null, 'the spectator’s table');
    const seen = await watcher.evaluate(() => ({ net: window.__game.net, hand: document.querySelectorAll('#hand .card').length, controls: document.querySelectorAll('.controls button').length, emote: !!document.querySelector('[data-action=emote-row]') }));
    const s = await secrets(watcher);
    if (seen.net?.role !== 'guest' || seen.net.seat !== -1 || seen.hand || seen.controls || seen.emote) fail(`a spectator has seat -1, no hand, no controls and no Emote: ${JSON.stringify(seen)}`);
    if (s.hidden !== 3 || s.told || s.backs !== 3 || s.faces) fail(`a spectator should see all three Sleepers face down, with nothing about them: ${JSON.stringify(s)}`);
    await snap(watcher, shot, 'spectator');
    await audit('spectator', watcher);
    log('4. a spectator watches as seat -1: no hand, no controls, three face-down agents and nothing about them');
  }

  // 5. An escalation with two answers: the guest at seat 1 escalates, the host plays on, seat 2 aborts.
  // The answers card comes up on every page and is held there until each has been checked.
  for (const p of everyone()) await watchExits(p);
  await a.click('[data-action=escalate]');
  for (const p of [host, b]) await until(p, () => document.querySelector('.modal.hot [data-action=respond]'), null, 'the escalation prompt');
  const answered = Promise.all(
    everyone().map((p) =>
      until(
        p,
        () => {
          const up = !!document.querySelector('.cine.answers-card');
          if (up) window.__game.holdCard();
          return up;
        },
        null,
        'the answers card',
      ),
    ),
  );
  answered.catch(() => {}); // awaited below, once the answers are in
  await host.click('.modal.hot [data-action=respond][data-accept="1"]');
  await until(host, () => window.__game.state.round.pending?.calls[0] === 'on', null, 'the host’s answer');
  await b.click('.modal.hot [data-action=respond][data-accept="0"]');
  await answered;
  const slips = await host.evaluate(() => ({ slips: [...document.querySelectorAll('.cine.answers-card .ans')].map((li) => li.textContent.trim()), aborts: [...document.querySelectorAll('.cine.answers-card .ans.abort')].map((li) => li.textContent.trim()) }));
  // In table order after the escalator: seat 2, then the host.
  if (slips.slips.length !== 2 || slips.slips[1] !== 'You play on.' || slips.aborts.length !== 1 || slips.aborts[0] !== slips.slips[0] || !slips.aborts[0].endsWith(' aborts.')) {
    fail(`the host's answers card should say seat 2 aborts and the host plays on: ${JSON.stringify(slips)}`);
  }
  await snap(host, shot, 'answers');
  await audit('answers', host);
  // The host and seat 1 go on: their cards go, seat 2's agents pull out of their boards, and they lock
  // in, so the turn resolves behind the cards still held on seat 2's page (and the watcher's). Once
  // those go, the abort's exit must still play there, over the board on screen, before the turn's reveal.
  const ahead = [host, a];
  const behind = [b, watcher].filter(Boolean);
  for (const p of ahead) await p.keyboard.press('Escape');
  for (const p of ahead) await until(p, () => window.__exits.some((r) => r?.endsWith('-2')) && !window.__game.ui.holdBoard && !window.__game.ui.updating, null, 'seat 2’s agents to pull out');
  const called = await host.evaluate(() => window.__game.table.turnSeq);
  for (const p of ahead) await dropFirst(p);
  await until(host, (s) => window.__game.table.turnSeq > s, called, 'the turn to resolve');
  for (const p of behind) await until(p, (s) => window.__game.ui.remote.turnSeq > s && document.querySelector('.cine.answers-card'), called, 'the turn resolved behind the held answers card');
  for (const p of behind) await p.keyboard.press('Escape');
  for (const p of behind) {
    await until(p, () => window.__exits.some((r) => r?.endsWith('-2')) && window.__game.view.round.turn === 3 && !window.__game.ui.animating && !window.__game.ui.updating, null, 'seat 2’s exit, then the reveal of the turn that resolved behind the card');
  }
  const out = {
    folded: await b.evaluate(() => window.__game.ui.remote.round.folded[2]),
    tag: await host.evaluate(() => {
      const t = document.querySelector('.tags .tag.s-2');
      return t ? { out: t.classList.contains('out'), stamp: getComputedStyle(t, '::after').content } : null;
    }),
    status: await b.evaluate(() => document.querySelector('.controls.out .status')?.textContent ?? ''),
    stakes: await Promise.all(everyone().map((p) => p.evaluate(() => window.__game.view.round.stake))),
  };
  if (!out.folded || !out.tag?.out || out.tag.stamp !== '"Out"' || !out.status.startsWith('You’re out of this round') || out.stakes.some((s) => s !== 2)) {
    fail(`after the answers seat 2 is out (its tag stamped Out on the host, the out status on its screen) and the stake is 2 everywhere: ${JSON.stringify(out)}`);
  }
  log(`5. an escalation with two answers: "${slips.slips.join(' ')}" on every page, then seat 2's exit, also where the turn resolved behind the card; stake ${out.stakes.join('/')}`);

  // 6. Emotes, through the Emote button. Seat 1 opens the row and presses Well played: within a second its
  // slip hangs under seat 1's tag on the host, on seat 2 and on its own page (and the watcher's), and takes
  // no tap. A second press within 3 s is dropped by the host: no other slip shows there. A later emote from
  // seat 2 marks the point by which the host has heard (and dropped) it. Then the host hides emotes (saved),
  // and seat 1's next one, once 3 s have passed on the host's clock, lands in ui.emotes and draws nothing.
  const LAND = live ? 5000 : 1000;
  const within = (p, ms, fn, arg, what) =>
    p.waitForFunction(fn, arg, { timeout: ms, polling: 25 }).catch(() => {
      throw new Error(`timed out (${ms} ms) waiting for ${what}`);
    });
  const openRow = async (p) => {
    await p.click('#top [data-action=emote-row]');
    await until(p, () => document.querySelector('#emote-row [data-action=emote]') && document.querySelector('#top [data-action=emote-row]').getAttribute('aria-expanded') === 'true', null, 'the emote row');
  };
  const emoteVia = async (p, i) => {
    await openRow(p);
    await p.click(`#emote-row [data-action=emote][data-i="${i}"]`);
    if (await p.$('#emote-row')) fail('pressing an emote should close the row');
  };
  const slipOn = (seat, text) =>
    `[...document.querySelectorAll('#emote-root .emote-slip.own-${seat}')].some((s) => !s.hidden && !s.classList.contains('out') && s.textContent.includes(${JSON.stringify(text)}))`;
  /** Record, in window.__slips, every emote slip the page puts up from now on. */
  const watchSlips = (p) =>
    p.evaluate(() => {
      window.__slips = [];
      window.__slipWatch?.disconnect();
      window.__slipWatch = new MutationObserver((ms) => {
        for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains('emote-slip')) window.__slips.push({ seat: Number(n.dataset.seat), text: n.querySelector('.paper')?.textContent ?? '' });
      });
      window.__slipWatch.observe(document.querySelector('#emote-root'), { childList: true });
    });
  // The watcher can't send: no Emote button (step 4 checks it too).
  for (const p of [host, a, b]) await until(p, () => document.querySelector('#top [data-action=emote-row]') && !window.__game.ui.updating, null, 'the Emote button');
  // The sender's flick sounds when the host's echo lands, not on the press: a press the host drops is silent.
  const flicks = () => a.evaluate(() => (document.hidden ? null : window.__game.audio.effects.emote));
  const flick0 = await flicks();
  await emoteVia(a, 2);
  const pressed = Date.now();
  await within(host, LAND, slipOn(1, 'Well played'), null, "seat 1's Well played by its tag (0)");
  const first = await host.evaluate(() => ({ ...window.__game.ui.emotes[1] }));
  if (first.seat !== 1 || first.i !== 2) fail(`the host's ui.emotes should hold seat 1's Well played: ${JSON.stringify(first)}`);
  // The second press goes as soon as the host has the first, not once it has reached every page (through
  // the relays that can take seconds): within 3 s of the first on the host's clock, so the host drops it.
  await watchSlips(host);
  await emoteVia(a, 3);
  const soon = await host.evaluate((t) => performance.now() - t, first.at);
  if (soon >= 2900) fail(`the second emote went out ${Math.round(soon)} ms after the first: too late to try the host's 3 s limit`);
  await Promise.all([b, a].map((p, i) => within(p, LAND, slipOn(1, 'Well played'), null, `seat 1's Well played by its tag (${i + 1})`)));
  const landed = Date.now() - pressed;
  const flick1 = await flicks();
  await snap(host, shot, 'emote');
  await audit('emote', host);
  // The slip hangs under seat 1's tag, its tail on the tag, and never takes a tap: the tag is still what a tap finds.
  const hung = await host.evaluate(() => {
    const slip = [...document.querySelectorAll('#emote-root .emote-slip.own-1')].find((s) => !s.classList.contains('out'));
    const tag = document.querySelector('.tags .tag.s-1');
    if (!slip || !tag) return { slip: !!slip, tag: !!tag };
    const s = slip.getBoundingClientRect();
    const t = tag.getBoundingClientRect();
    const tail = s.left + parseFloat(getComputedStyle(slip).getPropertyValue('--tail'));
    const hit = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2);
    return {
      gap: Math.round(s.top - t.bottom),
      tailOnTag: tail >= t.left && tail <= t.right,
      inWindow: s.left >= 0 && s.right <= innerWidth,
      events: getComputedStyle(slip).pointerEvents,
      inButton: !!slip.closest('button, a'),
      hitSlip: !!hit?.closest('.emote-slip'),
    };
  });
  if (!(hung.gap >= 0 && hung.gap <= 24) || !hung.tailOnTag || !hung.inWindow || hung.events !== 'none' || hung.inButton || hung.hitSlip) fail(`the slip should hang just under seat 1's tag, inside the window, and take no tap: ${JSON.stringify(hung)}`);
  if (watcher) await until(watcher, slipOn(1, 'Well played'), null, 'seat 1’s Well played on the watcher');
  await emoteVia(b, 4);
  await until(host, () => window.__game.ui.emotes[2]?.i === 4, null, 'seat 2’s emote on the host');
  const second = await host.evaluate(() => ({ emote: { ...window.__game.ui.emotes[1] }, slips: window.__slips }));
  if (second.emote.i !== first.i || second.emote.at !== first.at || second.slips.some((x) => x.seat === 1)) fail(`a second emote within 3 s should be dropped, with no new slip on the host: ${JSON.stringify({ first, second })}`);
  if (!second.slips.some((x) => x.seat === 2 && x.text.includes('Bon voyage'))) fail(`seat 2's Bon voyage should show on the host: ${JSON.stringify(second.slips)}`);
  await until(a, slipOn(2, 'Bon voyage'), null, 'seat 2’s Bon voyage on seat 1');
  const flick2 = await flicks();
  // (A page in the background plays no sound at all; then there is nothing to count.)
  if (flick0 !== null && flick2 !== null && (flick1 - flick0 !== 1 || flick2 - flick1 !== 1)) fail(`seat 1 hears one flick for its own emote (on the echo) and one for seat 2's, none for the press the host dropped: ${JSON.stringify({ flick0, flick1, flick2 })}`);
  // The host hides emotes from its row (the row stays open, the toggle pressed, saved for the browser); Escape closes the row.
  await openRow(host);
  await audit('emote row', host);
  await host.click('#emote-row [data-action=hide-emotes]');
  const hid = await host.evaluate(() => ({
    hide: window.__game.ui.hideEmotes,
    pressed: document.querySelector('#emote-row [data-action=hide-emotes]')?.getAttribute('aria-pressed'),
    saved: localStorage.getItem('cg:dead-drop:hideEmotes'),
    slips: document.querySelectorAll('#emote-root .emote-slip:not(.own-0)').length,
  }));
  if (!hid.hide || hid.pressed !== 'true' || hid.saved !== 'true' || hid.slips) fail(`Hide emotes should press, save and take the others' slips away: ${JSON.stringify(hid)}`);
  await host.keyboard.press('Escape');
  await until(host, () => !document.querySelector('#emote-row') && document.querySelector('#top [data-action=emote-row]').getAttribute('aria-expanded') === 'false', null, 'Escape to close the emote row');
  // Seat 1 sends again once 3 s have passed since its last on the host's own clock (a timestamp, not a sleep).
  await until(host, (t) => performance.now() - t > 3100, first.at, '3 s since seat 1’s last emote, on the host');
  await watchSlips(host);
  await emoteVia(a, 5);
  await until(host, (t) => window.__game.ui.emotes[1].at !== t, first.at, 'seat 1’s next emote on the host');
  await until(b, slipOn(1, 'Hmm.'), null, 'seat 1’s Hmm. on seat 2, who shows emotes');
  const hidden = await host.evaluate(() => ({ emote: { ...window.__game.ui.emotes[1] }, slips: window.__slips, drawn: document.querySelectorAll('#emote-root .emote-slip.own-1').length }));
  if (hidden.emote.i !== 5 || hidden.slips.length || hidden.drawn) fail(`a hidden emote lands in ui.emotes and draws nothing: ${JSON.stringify(hidden)}`);
  const seat1 = hidden.emote;
  // On a phone the row's six lines and the toggle fit across 390px, every one a 40px target, with the header's Emote.
  let rowFit = null;
  if (!live) {
    await b.setViewportSize({ width: 390, height: 844 });
    await openRow(b);
    await settle(b);
    rowFit = await b.evaluate(() => {
      const row = document.querySelector('#emote-row').getBoundingClientRect();
      const btns = [...document.querySelectorAll('#emote-row button')].map((x) => x.getBoundingClientRect());
      const tools = document.querySelector('#top .tools').getBoundingClientRect();
      return {
        buttons: btns.length,
        small: btns.filter((r) => r.width < 40 || r.height < 40).length,
        outside: btns.filter((r) => r.left < row.left || r.right > row.right || r.top < row.top || r.bottom > row.bottom).length,
        row: [Math.round(row.left), Math.round(row.right), Math.round(row.top), Math.round(row.bottom)],
        toolsRight: Math.round(tools.right),
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    await snap(b, shot, 'emote-row-phone');
    await audit('emote row on a phone', b);
    await b.keyboard.press('Escape');
    await b.setViewportSize({ width: 1100, height: 760 });
    if (rowFit.buttons !== 7 || rowFit.small || rowFit.outside || rowFit.row[0] < 0 || rowFit.row[1] > rowFit.width || rowFit.row[2] < 0 || rowFit.toolsRight > rowFit.width || rowFit.scrollWidth > rowFit.width) {
      fail(`the emote row should fit a 390px phone, six lines and the toggle, each 40px or more: ${JSON.stringify(rowFit)}`);
    }
  }
  log(`6. Well played from seat 1's Emote row by its tag on every page in ${landed} ms; its second within 3 s dropped; hidden on the host, the next landed in ui.emotes and drew nothing${rowFit ? `; the row on a phone: ${JSON.stringify(rowFit)}` : ''}`);

  // 7. A line goes dead: the stand-in sits after the 2 s wait and locks in; the player comes back to its lock.
  // The 2 s wait starts here, so the guests who stay are never one stall from a stand-in in the steps before.
  if (!live) {
    await watchToasts(host);
    await host.evaluate(() => window.__game.standInMs(2000));
    await a.close();
    await until(host, () => window.__game.view?.here[1] === false, null, 'the host to see seat 1’s line drop');
    // Nothing more from seat 1 came after step 6's last emote.
    const third = await host.evaluate(() => ({ ...window.__game.ui.emotes[1] }));
    if (third.at !== seat1.at) fail(`no emote from seat 1 since step 6's last: ${JSON.stringify({ third, seat1 })}`);
    const dead = `${P[1].name}’s line went dead`;
    await until(host, (t) => window.__game.view.standIn[1] && window.__toasts.some((x) => x.includes(t)), dead, 'the stand-in at seat 1, and the toast');
    await until(host, () => window.__game.table.view(0).round.locked[1], null, 'the stand-in to lock in');
    // Nobody else's line went quiet meanwhile: the others ping more often than the wait.
    const others = await host.evaluate(() => ({ standIn: window.__game.view.standIn, toasts: window.__toasts }));
    if (others.standIn[2] || others.toasts.some((x) => x.includes('line went dead') && !x.includes(dead))) fail(`only seat 1's line went dead: ${JSON.stringify(others)}`);
    const said = await host.evaluate((t) => window.__toasts.find((x) => x.includes(t)), dead);
    a = await host.context().newPage();
    await a.goto(at(1, `#join=${code}`));
    await until(host, (t) => !window.__game.view.standIn[1] && window.__game.view.here[1] && window.__toasts.some((x) => x.includes(t)), `${P[1].name} is back`, 'seat 1 back on the host');
    await until(a, () => window.__game?.view?.seat === 1 && window.__game.view.round.plan && !window.__game.ui.updating && document.querySelector('[data-action=unlock]'), null, 'seat 1 back at its seat, its lock standing');
    await snap(a, shot, 'standin-back');
    await audit('standin-back', a);
    await host.evaluate(() => window.__game.standInMs(30000));
    log(`7. seat 1's line went dead: "${said}"; the stand-in locked in, and the player came back to its lock`);
  }

  // 8. Reloads: the guest at seat 2 gets its seat back by token (still out of the round). Locally the host
  // reloads too: route() reopens the saved table and lobby, and each guest's hello finds its seat.
  await b.reload();
  await until(b, () => window.__game?.view?.seat === 2 && window.__game.view.round.folded[2] && !window.__game.ui.updating && document.querySelector('.controls.out'), null, 'seat 2 back at its seat, still out');
  if (!live) {
    const before = await host.evaluate(() => ({ turnSeq: window.__game.table.turnSeq, matchId: window.__game.table.matchId }));
    // Each guest says so when it is welcomed back ("Back in …’s game", or "You’re watching …").
    for (const p of [a, b, watcher]) await watchToasts(p);
    await host.reload();
    await until(host, () => window.__game?.ui.screen === 'play' && window.__game.net?.role === 'host' && window.__game.ui.net.session && window.__game.view, null, 'the host’s table, reopened');
    // The reopened table's clock (the timer came back with the save) waits too, until step 11.
    if (!(await host.evaluate(() => window.__game.table.timer === 30000 && !!window.__game.clock))) fail('the reopened table should keep its 30 s timer and clock');
    if (!(await host.evaluate(() => window.__game.ui.hideEmotes === true))) fail('Hide emotes should be saved across the host’s reload');
    await host.evaluate(() => window.__game.holdClock(true));
    const reopened = await host.evaluate(() => {
      const g = window.__game;
      return { turnSeq: g.table.turnSeq, matchId: g.table.matchId, started: g.ui.net.lobby.started, tokens: g.ui.net.lobby.seats.map((s) => s.token ?? null) };
    });
    // The lobby keys each seat by that player's token for this room, never the token itself.
    const keyed = await Promise.all([0, 1, 2].map((i) => roomToken(P[i].token, code)));
    if (reopened.turnSeq !== before.turnSeq || reopened.matchId !== before.matchId || !reopened.started || reopened.tokens.join() !== keyed.join()) {
      fail(`the host's reload should reopen the saved table and its lobby: ${JSON.stringify({ before, reopened })}`);
    }
    // The reopened table starts every guest seat quiet (not here) until its player's hello.
    await until(host, () => window.__game.view.here.every(Boolean) && !window.__game.view.standIn.some(Boolean), null, 'both guests back at their seats on the host');
    for (const [p, said] of [
      [a, `Back in ${P[0].name}’s game.`],
      [b, `Back in ${P[0].name}’s game.`],
      [watcher, `You’re watching ${P[0].name}’s table.`],
    ]) {
      await until(p, (t) => window.__toasts.includes(t), said, `"${said}" after the host's reload`);
    }
    for (const [p, seat] of [
      [a, 1],
      [b, 2],
      [watcher, -1],
    ]) {
      await until(p, ([s, seq]) => window.__game.ui.seat === s && window.__game.view?.seat === s && window.__game.view.turnSeq === seq && window.__game.ui.shownSeq === seq && !window.__game.ui.updating, [seat, before.turnSeq], `seat ${seat} on the reopened table at turnSeq ${before.turnSeq}`);
    }
    log(`8. seat 2 reloaded into its seat; the host reloaded and reopened the table (turnSeq ${before.turnSeq} on every page)`);
  } else log('8. seat 2 reloaded into its seat');

  // 9. A player leaves through the menu: the stand-in sits at once (no wait), and the match goes on.
  await watchToasts(host);
  const leaver = await a.evaluate(() => window.__game.meta.codename);
  const left = Date.now();
  await a.click('[data-action=quit]');
  await a.click('.modal [data-action=title]');
  // One toast for both: the stand-in sat down straight after the goodbye. (A quiet seat would wait 30 s
  // from the goodbye, which the bound below tells apart however slow the line.)
  await until(host, (t) => window.__game.view?.standIn[1] && window.__toasts.includes(t), `${leaver} left the table. The station is covering.`, 'the host to hear seat 1 leave and the stand-in to sit');
  const waited = Date.now() - left;
  if (waited >= 25000) fail(`a goodbye brings the stand-in at once, not after the 30 s wait: ${waited} ms`);
  const seq = await host.evaluate(() => window.__game.table.turnSeq);
  await dropFirst(host);
  await untilSkipping(host, (s) => window.__game.table.turnSeq > s && window.__game.view.turnSeq > s && !window.__game.ui.animating && !window.__game.ui.updating, seq, 'the turn to resolve with the stand-in');
  await until(host, () => window.__game.table.view(0).round.locked[1], null, 'the stand-in to lock in the next turn');
  log(`9. seat 1 left: the stand-in sat in ${waited} ms, and the turn resolved`);

  // 10. A rematch at three seats: the host offers, seat 2 accepts, the stand-in accepts by itself.
  const oldMatch = await host.evaluate(() => window.__game.table.matchId);
  await host.evaluate(() => {
    const g = window.__game;
    g.state.scores = [30, 0, 0];
    g.state.target = 1;
    g.finishRound();
  });
  const players = [host, b, watcher].filter(Boolean);
  for (const p of players) {
    await untilSkipping(p, () => document.querySelector('[data-action=final]') && !window.__game.ui.card, null, 'the final report button');
    await p.click('[data-action=final]');
    await until(p, () => document.querySelector('.over'), null, 'the dossier');
  }
  await host.click('[data-action=rematch]');
  await until(b, () => document.querySelector('[data-action=rematch]')?.textContent.includes('Accept rematch'), null, 'the rematch offer on seat 2');
  await b.click('[data-action=rematch]');
  for (const p of players) await until(p, (old) => window.__game.ui.screen === 'play' && window.__game.view?.matchId !== old && window.__game.view.scores.join() === '0,0,0' && !document.querySelector('.over'), oldMatch, 'the rematch table');
  for (const p of players) await clearCard(p);
  const covered = await host.evaluate(() => window.__game.view.standIn);
  if (!covered[1]) fail(`the stand-in should still cover seat 1 in the rematch: ${covered}`);
  await snap(host, shot, 'table-rematch');
  await audit('table-rematch', host);
  log('10. a rematch at three seats: seat 2 accepted, the stand-in accepted by itself');

  // 11. The host's clock runs out: seat 2 has locked its own drop, the host has picked nothing and gets a
  // random one, and the stand-in (never timed) locks by itself, so the turn resolves.
  const seq11 = await host.evaluate(() => window.__game.table.turnSeq);
  await dropFirst(b);
  await until(host, () => window.__game.state.round.plans[2], null, 'seat 2’s drop on the host');
  const own = await host.evaluate(() => window.__game.state.round.plans[2]);
  const ran = await host.evaluate(() => window.__game.clock.expire());
  await untilSkipping(host, (s) => window.__game.table.turnSeq > s, seq11, 'the turn to resolve once the clock ran out');
  const drops = await host.evaluate(() => window.__game.state.round.events.filter((e) => e.t === 'drop').map((e) => ({ seat: e.seat, uid: e.uid })));
  const by = (s) => drops.find((d) => d.seat === s);
  if (!ran || !by(0) || by(2)?.uid !== own.uid || !by(1)) fail(`the clock should drop for the host only, seat 2 keeping its own drop and the stand-in locking by itself: ${JSON.stringify({ ran, own, drops })}`);
  log('11. the host’s clock ran out: a random drop for the host, seat 2’s own stood, the stand-in locked by itself');
}
