// Phase 4's return loop, for the default smoke: smoke.mjs calls returnLoop() last (after lobbySteps), at desktop
// and at phone size. Each Phase 4 task adds its steps as a function returnLoop calls in order. `h` carries the
// smoke's own helpers ({ until, idle, settle, skipIntro, clearCard, phoneFits, toTitle, helpClear, clearToasts }),
// so this module never imports smoke.mjs (which would load it, and its state, twice).
//
// gotAwaySteps (Task 2): the one that got away on a lost round's result. A staged late swing (seat 0 holds its
// Heavy for the last turn and drops it where it isn't needed) loses at the flip; the result carries the line on
// its telegram slip and the ticker says it; a tap (or Enter on the focused slip) folds the result to See the
// board's strip and lights the named city, and the light goes out by itself; a view without the key (an older
// host's) draws no slip and throws nothing; a won round and a fold-ended round show none; and a three-seat Table
// round from a fixed deal shows its line and lights the city and your row in it. Pass and play at two seats shows
// the loser's line on the shared result, named, only while it names no card still in their hand; played to its end,
// the shared case file pins that line (naming only the card the loser played) and no line that names a held card.
//
// dailySteps (Task 4): today's operation. A ladder match saved on the title stays untouched throughout. The title
// offers the day (a check sets the day: __game.today), its slip naming the operation and the rival; a click deals it
// (the roster card with its featured line, the day's match id, rival and featured city); leaving mid-round leaves
// "Continue today's operation" beside the ladder's Continue; finishing it records the margin, removes only its own
// save, and touches neither the ladder nor the shelf's best; the played slip then says how it went, with the best
// margin under the network line. Tomorrow offers a new operation, and a day's save left from the day before goes
// quietly (no toast).
//
// caseFileSteps (Task 6): the case file and its poster. A won ladder match of three rounds (a staged Assassin takes out
// the rival's Heavy in Berlin in round 1, the rival folds round 3) ends on the folder: the Closed stamp, one row a
// round, the evidence (the takedown named) and Save as PNG first. The poster draws at 1200 × 1600 with its stamp in red
// and its folder in manila, and is written to .tmp/check/dead-drop-poster.png for review; with every silhouette broken
// it still draws; Save as PNG with a browser that gives no picture (toBlob's null) toasts once, however often it is
// pressed. A view with no recap (an older host's) shows the file without the evidence. A match of one round ended by
// a fold, and a four-seat Table, end on their own case files (the four seats on two rows on a phone).
//
// briefingSteps (Task 8): the briefing. On a first visit's title (a fresh profile, no Continue) the briefing's slip
// leads, above Play the computer, and the phone's title still fits down to the join form. It deals the scripted round
// against Agent Wren with C's coach slip above the hand, no fuse, no Fold, no unseen strip: turn 1 suggests the Heavy
// and Istanbul, and its gate turns the Assassin and Monaco away (the ticker says why); each reveal leaves C's line in
// the ticker; the Assassin takes out Wren's Veteran; turn 4 holds back every drop but the Mole in Berlin and its Lock
// in waits for the escalation, and Wren plays on; turn 5 holds back every card but the Jammer; the final flip at night
// (its card, on desktop) takes all three cities. Finish the briefing plays C's end card, then the way on: the profile is
// briefed, nothing counted or saved. Play Agent Wren starts the real ladder; then the title stops offering the
// briefing, and Help's footer always has it (with a match on, through the quit sheet, keeping the match's save).
// Leaving mid-briefing leaves it unfinished. Played to its end over a saved match, the way on offers Continue your
// match first (Play Agent Wren says it starts a new one), the save untouched until Continue resumes that match. On
// the phone pass every turn also fits 320 × 640, where C's slip carries the ticker's line (the turn just flipped, a
// correction) above the lesson.
//
// guestWaitSteps (Task 9): how a turn works, for a friend waiting. On the phone pass a second page of the same browser
// opens an invite to a room nobody hosts (?net=local#join=NOPE99): it stays on "Looking for room NOPE99…" with the
// four illustrated lines under it and Cancel still on screen, nothing past the right edge and no page errors. Then the
// page closes and the saves it may have touched (it boots like any page) go back as they were. Help there offers no
// briefing, and closing it leaves the page in the room (lobbyHelp, which smoke.mjs's duo also runs on both lobbies).
// The guest lobby's own guide (and the host's lack of one) is checked in smoke.mjs's duo and table, where a host is up.

import { writeFileSync } from 'node:fs';
import { AGENT, CITY } from './js/data.js';
import { TUTORIAL } from './js/tutorial.js';

const fail = (m) => {
  throw new Error(m);
};

/** test/replay.test.mjs's late swing, on Agent Wren's Classic table: [[kind, city] for seat 0, [kind, city] for seat 1] a turn. */
const SWING = {
  cities: ['moscow', 'monaco', 'berlin'],
  hand: ['sleeper', 'veteran', 'handler', 'mole', 'jammer', 'heavy'],
  rivalHand: ['heavy', 'sleeper', 'handler', 'veteran', 'jammer', 'mole'],
  turns: [
    [['sleeper', 0], ['heavy', 1]],
    [['veteran', 2], ['sleeper', 2]],
    [['handler', 1], ['handler', 2]],
    [['mole', 1], ['veteran', 0]],
    [['jammer', 0], ['jammer', 1]],
    [['heavy', 0], ['mole', 1]],
  ],
  // The Heavy in Moscow, which seat 0 holds anyway, loses Berlin 6 to 7; in Berlin it would have held it and the round.
  line: 'Turn 6: Heavy to Berlin instead of Moscow would have won the round.',
  city: 2,
};
/** A three-seat Classic Table whose fixed deal, played as quickTurns(6) with seed 7's draws, loses seat 0 the round at the flip (nobody folds). */
const TABLE3 = { seed: 'got-away-4', cities: ['monaco', 'berlin', 'istanbul'], line: 'Turn 6: the Heavy to Istanbul instead of the Handler would have won the round.', city: 2 };

export async function returnLoop(page, ctx, h) {
  await gotAwaySteps(page, ctx, h);
  await dailySteps(page, ctx, h);
  await caseFileSteps(page, ctx, h);
  await briefingSteps(page, ctx, h);
  await guestWaitSteps(page, ctx, h);
}

/** A staged late swing (Wren held), played with real clicks for seat 0 and the rival's drops made through the table. `last`: seat 0's turn-6 drop. */
async function lateSwing(page, h, { last = SWING.turns[5][0], skipAll = false } = {}) {
  await page.evaluate((o) => {
    window.__game.skipAnimations(true);
    window.__game.stage({ rival: 'wren', hand: o.hand, rivalHand: o.rivalHand, cities: o.cities });
  }, SWING);
  await h.until(page, () => window.__game.ui.screen === 'play' && !window.__game.ui.updating && !window.__game.ui.card && document.querySelector('[data-action=lock]'), null, 'the staged late swing');
  for (let t = 0; t < 6; t++) {
    const [mine, theirs] = t === 5 ? [last, SWING.turns[5][1]] : SWING.turns[t];
    // Turns 1 to 5 go by with every animation skipped (the final card too); turn 6's reveal plays.
    if (t === 5 && !skipAll) await page.evaluate(() => window.__game.skipAnimations(false));
    const ok = await page.evaluate(([kind, city]) => {
      const g = window.__game;
      const R = g.state.round;
      const uid = R.hands[1].find((u) => R.cards[u].kind === kind);
      return !!uid && g.table.act(1, { a: 'lock', uid, city });
    }, theirs);
    if (!ok) fail(`the late swing: the rival could not drop its ${theirs[0]} in city ${theirs[1]} on turn ${t + 1}`);
    const sel = `#hand .card.k-${mine[0]}:not([disabled])`;
    await h.until(page, (s) => document.querySelector(s) && !window.__game.ui.updating, sel, `my ${mine[0]} on turn ${t + 1}`);
    await page.click(sel);
    const target = `#board .city.target[data-city="${mine[1]}"] .plate`;
    if (!(await page.$(target))) fail(`the late swing: my ${mine[0]} can't go to city ${mine[1]} on turn ${t + 1}`);
    await page.click(target);
    await page.click('[data-action=lock]');
    if (t < 5) await h.until(page, (n) => window.__game.state.round.turn === n + 2 && !window.__game.ui.updating && !window.__game.ui.animating, t, `turn ${t + 2} of the late swing`);
  }
  // The final flip: Space past the reveal's guard speeds it up, and again skips it, as a player would.
  if (!skipAll) {
    await h.until(page, () => window.__game.ui.animating && performance.now() - window.__game.ui.revealAt > 450, null, 'the final reveal past its guard');
    await page.keyboard.press(' ');
    await page.keyboard.press(' ');
  }
  await h.until(page, () => window.__game.state.phase !== 'plan' && document.querySelector('.result .lines') && !window.__game.ui.animating && !window.__game.ui.updating && !window.__game.ui.card, null, 'the late swing’s result');
}

/** The result's slip as drawn: its line, the city it names, the view's line, and the round's winner. */
const slipNow = (page) =>
  page.evaluate(() => {
    const g = window.__game;
    const el = document.querySelector('.result .got-away');
    const r = el?.getBoundingClientRect();
    return {
      text: el?.querySelector('span')?.textContent ?? null,
      city: el ? Number(el.dataset.city) : null,
      height: r ? Math.round(r.height) : null,
      ga: g.gotAway,
      winner: g.state.round.result?.winner ?? null,
      ticker: document.querySelector('#ticker')?.textContent.trim() ?? null,
    };
  });

/** On a phone, the result (with its slip) fits the screen: its buttons on it, nothing past either edge. */
async function resultFits(page, h, when) {
  const fit = await h.phoneFits(page);
  const box = await page.evaluate(() => {
    const px = (n) => Math.round(n);
    const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
    const res = rect('.result');
    const btns = rect('.result .btns');
    const slip = rect('.result .got-away');
    return {
      top: res && px(res.top),
      bottom: res && px(res.bottom),
      btnsBottom: btns && px(btns.bottom),
      slipLeft: slip && px(slip.left),
      slipRight: slip && px(slip.right),
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth,
      innerHeight,
    };
  });
  const missing = ['top', 'bottom', 'btnsBottom', 'slipLeft', 'slipRight'].filter((k) => box[k] === null);
  if (missing.length || !(fit.scorebarTop >= 0) || box.top < 0 || box.bottom > box.innerHeight || box.btnsBottom > box.innerHeight || box.slipLeft < 0 || box.slipRight > box.innerWidth || box.scrollWidth > box.innerWidth) {
    fail(`${when}: the phone's result should fit the screen with its slip and buttons on it: ${JSON.stringify({ ...box, missing, scorebarTop: fit.scorebarTop })}`);
  }
  return box;
}

/** Tap the slip (or press Enter on it, focused) with its light held: the result folds to the strip and city `want` is lit. */
async function tapSlip(page, h, want, { key = false } = {}) {
  await page.evaluate(() => window.__game.holdHint(true));
  if (key) {
    await page.focus('.result .got-away');
    await page.keyboard.press('Enter');
  } else await page.click('.result .got-away');
  await h.until(page, () => document.querySelector('.result.peek') && document.querySelector('#board .city.ga-hint'), null, `the ${key ? 'Enter on the slip' : 'tap on the slip'} to show the board with the city lit`);
  const lit = await page.evaluate(() => {
    const g = window.__game;
    const plate = document.querySelector('#board .city.ga-hint .plate');
    return {
      lit: [...document.querySelectorAll('#board .city.ga-hint')].map((c) => Number(c.dataset.city)),
      glow: plate ? getComputedStyle(plate).animationName : null,
      ring: plate ? getComputedStyle(plate).boxShadow : null,
      phase: g.state.phase,
      ready: g.table.ready[0],
    };
  });
  if (lit.lit.join() !== String(want) || lit.glow !== 'ga-glow' || !/inset/.test(lit.ring || '')) fail(`the slip should light city ${want} (its plate pulsing): ${JSON.stringify(lit)}`);
  if (lit.phase === 'plan' || lit.ready) fail(`the slip must not start the next round: ${JSON.stringify(lit)}`);
  return lit;
}

/** Let the light go, as in play: it goes out by itself, and the board stays shown. */
async function lightOut(page, h) {
  await page.evaluate(() => window.__game.holdHint(false));
  await h.until(page, () => !document.querySelector('#board .city.ga-hint') && document.querySelector('.result.peek'), null, 'the got-away light to go out by itself');
}

export async function gotAwaySteps(page, { log, shot, audit, phone }, h) {
  // 1. A lost round's result carries the one that got away.
  await lateSwing(page, h);
  await h.clearToasts(page);
  const s = await slipNow(page);
  if (s.winner !== 1) fail(`the late swing should lose seat 0 the round at the flip: ${JSON.stringify(s)}`);
  if (!s.text || !s.text.startsWith('Turn ') || !s.text.endsWith('would have won the round.')) fail(`the lost round's result should show the one that got away: ${JSON.stringify(s)}`);
  if (!s.ga || s.ga.turn !== Number(/^Turn (\d+)/.exec(s.text)?.[1]) || s.city !== s.ga.instead.city) fail(`the slip should say the view's line and name its city: ${JSON.stringify(s)}`);
  if (s.text !== SWING.line || s.city !== SWING.city) fail(`the late swing's line should be "${SWING.line}" (city ${SWING.city}): ${JSON.stringify(s)}`);
  if (!(s.height >= 40)) fail(`the slip should be at least 40px tall: ${s.height}`);
  await h.settle(page);
  await shot('got-away', page);
  await audit('got-away');
  if (phone) log(`phone result with the slip: ${JSON.stringify(await resultFits(page, h, 'the got-away result'))}`);
  // 3. The ticker said it, after the rival's remark.
  if (s.ticker !== SWING.line) fail(`the ticker should carry the one that got away: ${JSON.stringify(s.ticker)}`);
  log(`got-away: "${s.text}" on the slip and the ticker`);

  // 5. A view without the key (a Phase 3 host's) or with it undefined draws no slip, and throws nothing.
  const stripped = await page.evaluate(() => {
    const g = window.__game;
    const was = g.ui.view;
    const out = {};
    const { gotAway, ...none } = was;
    for (const [name, v] of [
      ['undefined', { ...was, gotAway: undefined }],
      ['absent', none],
    ]) {
      let error = null;
      try {
        g.ui.view = v;
        g.render();
      } catch (e) {
        error = String(e);
      }
      out[name] = { error, slip: !!document.querySelector('.got-away'), result: !!document.querySelector('.result .lines'), next: !!document.querySelector('.result [data-action=next]') };
    }
    g.ui.view = was;
    g.render();
    out.back = !!document.querySelector('.result .got-away') && !!gotAway;
    return out;
  });
  if (Object.values(stripped).some((x) => typeof x === 'object' && (x.error || x.slip || !x.result || !x.next)) || !stripped.back) fail(`a view without gotAway should draw the result with no slip and no error: ${JSON.stringify(stripped)}`);

  // 2. A tap lights the named city on the board (See the board), and the light goes out by itself.
  await tapSlip(page, h, SWING.city);
  await h.settle(page);
  await shot('got-away-hint', page);
  await lightOut(page, h);
  // B brings the full result back; Enter on the focused slip presses it (it doesn't start the next round).
  await page.keyboard.press('b');
  await h.until(page, () => document.querySelector('.result .got-away') && !document.querySelector('.result.peek'), null, 'B to bring the result and its slip back');
  await tapSlip(page, h, SWING.city, { key: true });
  // Under reduced motion the lit city keeps a steady ring, with no pulse.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const still = await page.evaluate(() => {
    const plate = document.querySelector('#board .city.ga-hint .plate');
    return plate ? { glow: getComputedStyle(plate).animationName, ring: getComputedStyle(plate).boxShadow } : null;
  });
  await page.emulateMedia({ reducedMotion: null });
  if (!still || still.glow !== 'none' || !/inset/.test(still.ring)) fail(`under reduced motion the lit city should keep a steady ring, no pulse: ${JSON.stringify(still)}`);
  await lightOut(page, h);
  log('got-away: a tap and Enter light the city on See the board; the light goes out; steady under reduced motion; a stripped view draws no slip');

  // 4. A won round shows no slip, and nor does a round ended by a fold.
  await lateSwing(page, h, { last: ['heavy', 2], skipAll: true });
  const won = await slipNow(page);
  if (won.winner !== 0 || won.text !== null || won.ga !== null) fail(`a won round should show no one that got away: ${JSON.stringify(won)}`);
  await page.evaluate((o) => window.__game.stage({ rival: 'wren', hand: o.hand, rivalHand: o.rivalHand, cities: o.cities }), SWING);
  await h.until(page, () => window.__game.ui.screen === 'play' && !window.__game.ui.updating && document.querySelector('[data-action=lock]'), null, 'a staged table to fold on');
  if (!(await page.evaluate(() => window.__game.rivalFolds()))) fail('the rival could not fold');
  await h.until(page, () => window.__game.state.phase !== 'plan' && document.querySelector('.result .lines') && !window.__game.ui.updating && !window.__game.ui.card, null, 'the fold’s result');
  const folded = await slipNow(page);
  if (folded.text !== null || folded.ga !== null) fail(`a round ended by a fold should show no one that got away: ${JSON.stringify(folded)}`);
  log('got-away: none on a won round or a fold');

  // 6. A three-seat Table: seat 0 loses at the flip, nobody folded, and its line shows; the tap lights the city and its row.
  await page.evaluate((o) => {
    const g = window.__game;
    g.holdRival(true);
    g.startTable({ seats: 3, seed: o.seed, cities: o.cities });
  }, TABLE3);
  await h.until(page, () => window.__game.ui.screen === 'play' && !window.__game.ui.updating && !window.__game.ui.card && document.querySelector('.hand .card'), null, 'the three-seat Table');
  await page.evaluate(() => {
    let x = 7;
    window.__game.quickTurns(6, () => ((x = (x * 16807) % 2147483647) / 2147483647));
  });
  await h.until(page, () => window.__game.state.phase !== 'plan' && document.querySelector('.result .lines') && !window.__game.ui.updating, null, 'the three-seat round’s result');
  const t3 = await slipNow(page);
  if (!t3.ga || t3.winner === 0 || t3.winner === null) fail(`the three-seat deal (${TABLE3.seed}) should lose seat 0 the round at the flip with a line: ${JSON.stringify(t3)}`);
  if (t3.text !== TABLE3.line || t3.city !== TABLE3.city) fail(`the three-seat result should show "${TABLE3.line}" (city ${TABLE3.city}): ${JSON.stringify(t3)}`);
  await h.clearToasts(page);
  await h.settle(page);
  await shot('got-away-table-result', page);
  await audit('got-away-table-result');
  if (phone) await resultFits(page, h, 'the three-seat got-away result');
  await tapSlip(page, h, TABLE3.city);
  const row = await page.evaluate((ci) => {
    const el = document.querySelector(`#board .city.ga-hint > .row[data-row="${ci}-0"]`);
    const lane = document.querySelector(`#board .city.ga-hint > .row.lane`);
    return { row: el ? getComputedStyle(el).animationName : null, outline: el ? getComputedStyle(el).outlineStyle : null, lane: lane ? getComputedStyle(lane).animationName : null };
  }, TABLE3.city);
  if (row.row !== 'ga-row' || row.outline !== 'dashed' || row.lane !== 'none') fail(`at three seats your own row in the lit city should glow too (and no rival's lane): ${JSON.stringify(row)}`);
  await h.settle(page);
  await shot('got-away-table', page);
  await lightOut(page, h);
  log(`got-away at three seats: "${t3.text}", city and row lit`);

  // 7. Pass and play at two seats: the late swing dealt to Red and Teal (as stage deals) and played through the table.
  // The shared result names the loser before the line; a line naming a held card (another card, or a new partner
  // for the same one) shows nothing on the shared screen.
  await page.evaluate((o) => {
    const g = window.__game;
    g.startPass({ seats: 2, cities: o.cities });
    const R = g.state.round;
    const deal = (seat, kinds) => {
      const size = R.hands[seat].length;
      const pool = [...R.hands[seat], ...R.decks[seat]];
      const picked = kinds.map((kind) => pool.splice(pool.findIndex((u) => R.cards[u].kind === kind), 1)[0]);
      const all = [...picked, ...pool];
      const n = Math.max(size, picked.length);
      R.hands[seat] = all.slice(0, n);
      R.decks[seat] = all.slice(n);
    };
    deal(0, o.hand);
    deal(1, o.rivalHand);
    for (const moves of o.turns)
      moves.forEach(([kind, city], seat) => {
        const S = g.state.round;
        g.table.act(seat, { a: 'lock', uid: S.hands[seat].find((u) => S.cards[u].kind === kind), city });
      });
  }, SWING);
  await h.until(page, () => window.__game.state.phase !== 'plan' && document.querySelector('.result .lines') && !window.__game.ui.updating && !window.__game.ui.card, null, 'pass and play’s shared result');
  const shared = await slipNow(page);
  if (shared.winner !== 1 || shared.ga !== null || shared.text !== `Red: ${SWING.line}` || shared.ticker !== `Red: ${SWING.line}`) fail(`pass and play's shared result should name Red before the line, on the slip and the ticker (the shared view has none of its own): ${JSON.stringify(shared)}`);
  const held = await page.evaluate(() => {
    const g = window.__game;
    const T = g.table.gotAway;
    const line = T.seats[0];
    const out = {};
    for (const [name, instead] of [
      ['another card', { ...line.instead, uid: `${line.instead.uid}x` }],
      ['a new partner', { ...line.instead, partner: 'planted', partnerKind: 'mole' }],
    ]) {
      T.seats[0] = { ...line, instead };
      g.render();
      out[name] = !!document.querySelector('.got-away');
    }
    T.seats[0] = line;
    g.render();
    out.back = !!document.querySelector('.got-away');
    return out;
  });
  if (held['another card'] || held['a new partner'] || !held.back) fail(`pass and play's shared result must not show a line that names a held card: ${JSON.stringify(held)}`);
  await h.settle(page);
  await shot('got-away-pass', page);
  log('got-away in pass and play: "Red: …" on the shared result; none when the line names a held card');

  // The match played out (Teal one short of the target, Red folds round 2): the shared case file pins Red's round-1
  // line, which names only the card Red played (sharedSafe), and a planted line naming a held card (another card, a
  // new partner for the same one) pins nothing.
  const ended = await page.evaluate(() => {
    const g = window.__game;
    const T = g.table;
    const ok = [0, 1].map((seat) => T.act(seat, { a: 'next' }));
    g.state.scores = [g.state.scores[0], g.state.target - 1];
    ok.push(T.act(0, { a: 'fold' }));
    return { ok, phase: g.state.phase };
  });
  if (!ended.ok.every(Boolean) || ended.phase !== 'match-over') fail(`the pass match should end on Red's fold in round 2: ${JSON.stringify(ended)}`);
  await toCaseFile(page, h, 'the pass and play match');
  const pinned = await page.evaluate(() => {
    const g = window.__game;
    const T = g.table;
    const pins = () => [...document.querySelectorAll('.over .case-file .ga-pin')].map((p) => ({ title: p.getAttribute('title'), row: [...document.querySelectorAll('.over .round-strip li')].indexOf(p.closest('li')) }));
    const out = { pins: pins(), rows: document.querySelectorAll('.over .round-strip li').length, missed: T.missed.map((list) => list.length) };
    const line = T.missed[0][0];
    for (const [name, instead] of [
      ['another card', { ...line.instead, uid: `${line.instead.uid}x` }],
      ['a new partner', { ...line.instead, partner: 'planted', partnerKind: 'mole' }],
    ]) {
      T.missed[0][0] = { ...line, instead };
      g.render();
      out[name] = pins().length;
    }
    T.missed[0][0] = line;
    g.render();
    out.back = pins().length;
    return out;
  });
  const played = AGENT[SWING.turns[5][0][0]].name;
  const named = (title) => Object.values(AGENT).filter((a) => title?.includes(a.name)).map((a) => a.name);
  if (pinned.rows !== 2 || pinned.pins.length !== 1 || pinned.pins[0].row !== 0 || pinned.pins[0].title !== `Red: ${SWING.line}`) fail(`the shared case file should pin Red's round-1 line, and only it: ${JSON.stringify(pinned)}`);
  if (pinned.pins.some((pin) => named(pin.title).join() !== played)) fail(`every pin on the shared case file names only the card its loser played (the ${played}): ${JSON.stringify(pinned.pins)}`);
  if (pinned['another card'] || pinned['a new partner'] || pinned.back !== 1) fail(`a line naming a held card must put no pin on the shared case file: ${JSON.stringify(pinned)}`);
  await h.settle(page);
  await shot('got-away-pass-file', page);
  await audit('got-away-pass-file');
  log(`got-away in pass and play's case file: one pin, "${pinned.pins[0].title}"; none for a line naming a held card`);

  await page.evaluate(() => {
    const g = window.__game;
    g.skipAnimations(false);
    g.holdRival(false);
    g.leave();
  });
  await h.until(page, () => document.querySelector('.title-screen'), null, 'the title after the got-away steps');
}

// ── today's operation (Task 4) ──────────────────────────────────────────────
/** The days the daily steps play: the day, the next (started and left), and the one after (its save is stale). */
const DAY = '2026-11-03';
const NEXT_DAY = '2026-11-04';
const DAY_AFTER = '2026-11-05';

/** The title's daily slip, best line and ladder Continue as drawn, with the saves and toasts behind them. */
const titleDaily = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.title-screen .slip.daily');
    return {
      slip: !!el,
      disabled: el ? el.disabled : null,
      opacity: el ? getComputedStyle(el).opacity : null,
      head: el?.querySelector('span')?.textContent ?? null,
      small: el?.querySelector('small')?.textContent ?? null,
      best: document.querySelector('.title-screen .daily-best')?.textContent ?? null,
      bestMargin: document.querySelector('.title-screen .daily-best b')?.textContent ?? null,
      cont: document.querySelector('.title-screen [data-action=continue]')?.textContent ?? null,
      match: localStorage.getItem('cg:dead-drop:match'),
      daily: localStorage.getItem('cg:dead-drop:daily'),
      toasts: document.querySelectorAll('.cg-toast').length,
    };
  });

/** The day's operation as the page draws it: its name, rival, featured agents (names) and city. */
async function operationOf(page, day) {
  const o = await page.evaluate((d) => {
    const op = window.__game.dailyOperation(d);
    return { name: op.operation.name, rival: op.rival.name, rivalId: op.rival.id, agents: [...op.featured.agents], city: op.featured.city, matchId: op.matchId };
  }, day);
  return { ...o, agentNames: o.agents.map((id) => AGENT[id].name), cityName: CITY[o.city].name };
}

/** The saved daily ({ day, table }) once its table has reached turn `turn` (the rival's drop that turn saves it). */
const dailySavedOn = (page, h, day, turn, what) =>
  h.until(page, ([d, t]) => {
    const s = JSON.parse(localStorage.getItem('cg:dead-drop:daily') || 'null');
    return s?.day === d && s.table?.state?.round?.turn === t;
  }, [day, turn], what);

/** On a phone the title's menu fits down to the join form, with nothing past the right edge. */
async function titleFits(page, when) {
  const box = await page.evaluate(() => {
    const bottom = (sel) => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      return r ? Math.round(r.bottom + scrollY) : null;
    };
    return { daily: bottom('.title-screen .slip.daily'), join: bottom('.title-screen .join'), innerHeight, scrollWidth: document.scrollingElement.scrollWidth, innerWidth };
  });
  if (box.daily === null || box.join === null || box.join > box.innerHeight || box.scrollWidth > box.innerWidth) fail(`${when}: the phone's title should fit down to the join form with the daily slip on it: ${JSON.stringify(box)}`);
  return box;
}

export async function dailySteps(page, { log, shot, audit, phone }, h) {
  // What the smoke found, so step 8 leaves it so: the ladder save, the daily record and the agents met.
  const found = await page.evaluate(() => ({ match: localStorage.getItem('cg:dead-drop:match'), daily: JSON.stringify(window.__game.meta.daily), met: [...window.__game.meta.met.agents] }));

  // 1. A saved ladder match to keep: Agent Wren, one turn, saved by the rival's next drop; then the title.
  await page.evaluate(() => {
    const g = window.__game;
    g.skipAnimations(true);
    g.startSolo('wren');
    g.quickTurns(1);
  });
  await h.until(page, () => JSON.parse(localStorage.getItem('cg:dead-drop:match') || 'null')?.table?.state?.round?.turn === 2, null, 'the ladder match saved on turn 2');
  await h.toTitle(page);
  const before = await page.evaluate(() => ({
    match: localStorage.getItem('cg:dead-drop:match'),
    stats: JSON.parse(localStorage.getItem('cg:dead-drop:stats') || 'null'),
    beaten: [...window.__game.meta.beaten],
    cont: document.querySelector('.title-screen [data-action=continue]')?.textContent ?? null,
  }));
  if (!before.match || !before.cont || !before.stats) fail(`a ladder match left on turn 2 should be saved, with Continue on the title: ${JSON.stringify(before)}`);

  // 2. The title offers today: the slip names the day's operation and its rival.
  await page.evaluate((d) => window.__game.today(d), DAY);
  const op = await operationOf(page, DAY);
  const t2 = await titleDaily(page);
  if (!t2.slip || t2.disabled || t2.head !== 'Today’s operation' || t2.small !== `Operation ${op.name} · ${op.rival}’s day · 3 November`) fail(`the title should offer ${DAY}'s operation (${op.name}, ${op.rival}): ${JSON.stringify(t2)}`);
  if (t2.cont !== before.cont) fail(`the ladder's Continue should stay beside the daily: ${JSON.stringify(t2)}`);
  if (phone) log(`phone title with the daily and Continue: ${JSON.stringify(await titleFits(page, 'the title with the daily'))}`);
  await h.settle(page);
  await shot('title-daily', page);
  await audit('title-daily');

  // 3. Play it: a click deals the day. Its roster card says what is featured, the featured agents stamped Today
  // (or New, met for the first time); the table is the day's: its match id, its 14 agents, its city in round 1.
  // The first featured agent has been met before and the second hasn't, so the card shows one stamp of each.
  await page.evaluate((ids) => {
    const g = window.__game;
    g.meta.met.agents = [...g.meta.met.agents.filter((id) => id !== ids[1]), ...(g.meta.met.agents.includes(ids[0]) ? [] : [ids[0]])];
    g.skipAnimations(false);
  }, op.agents);
  await page.click('.title-screen .slip.daily');
  await h.until(page, () => document.querySelector('.roster-card') && window.__game.ui.card, null, 'the daily’s roster card');
  await page.evaluate(() => window.__game.holdCard());
  const r3 = await page.evaluate(() => {
    const g = window.__game;
    const v = g.view;
    return {
      featured: document.querySelector('.roster-card .featured')?.textContent ?? null,
      minis: [...document.querySelectorAll('.roster-card .mc')].map((m) => ({ name: m.querySelector('.nm')?.textContent, today: m.classList.contains('today'), isNew: m.classList.contains('new'), tag: m.querySelector('.new-tag')?.textContent ?? null })),
      dossier: !!document.querySelector('.dossier-card'),
      matchId: v.matchId,
      roster: v.roster.length,
      cities: v.round.cities.map((c) => c.id),
      names: v.names,
      free: g.ui.free,
    };
  });
  const line = `Featured today: ${op.agentNames.join(' and ')}, with ${op.cityName} among the cities. They’re a taste of the ladder: playing them recruits nobody.`;
  if (r3.featured !== line) fail(`the daily's roster card should carry its featured line: ${JSON.stringify(r3.featured)}`);
  const stamps = r3.minis.filter((m) => m.tag).map((m) => `${m.name}:${m.tag}:${m.today ? 'today' : m.isNew ? 'new' : '-'}`);
  if (stamps.join() !== `${op.agentNames[0]}:Today:today,${op.agentNames[1]}:New:new`) fail(`the featured agents should wear Today (met before) or New, and nobody else a stamp: ${JSON.stringify(stamps)}`);
  if (r3.dossier || !r3.free) fail(`the daily plays as free play, with no dossier: ${JSON.stringify(r3)}`);
  if (r3.matchId !== op.matchId || r3.matchId !== '20261103' || r3.roster !== 14 || !r3.cities.includes(op.city) || r3.names[1] !== op.rival) fail(`the daily's table should be the day's: ${JSON.stringify({ ...r3, minis: undefined, want: op })}`);
  await h.settle(page);
  await shot('daily-roster', page);
  await h.clearCard(page);
  // Help's Rules count the day's roster: 14 agents, the Classic 12 and the two featured.
  await page.click('[data-action=help]');
  await h.until(page, () => document.querySelector('.sheet.help [role=tab][data-tab=rules]'), null, 'Help in the daily');
  await page.click('.sheet.help [role=tab][data-tab=rules]');
  await h.until(page, () => window.__game.ui.helpTab === 'rules' && document.querySelector('.sheet.help ol.rules'), null, 'Help’s Rules in the daily');
  const rules = await page.evaluate(() => document.querySelector('.sheet.help ol.rules').textContent);
  if (!rules.includes('the same roster of 14 agents') || /\b12 agents\b/.test(rules)) fail(`Help's Rules in the daily should count its 14 agents: ${JSON.stringify(rules.match(/[^.]*roster[^.]*\./g))}`);
  await page.click('.sheet.help footer [data-action=close-modal]');
  await h.until(page, () => !document.querySelector('.sheet.help'), null, 'Help closed in the daily');
  log(`daily ${DAY}: Operation ${op.name}, ${op.rival}; featured ${op.agentNames.join(' and ')} and ${op.cityName}; stamps ${stamps.join(', ')}`);

  // 4. Leave it mid-round: the title offers to continue it, and the ladder's Continue keeps its save.
  await page.evaluate(() => {
    window.__game.skipAnimations(true);
    window.__game.quickTurns(1);
  });
  await dailySavedOn(page, h, DAY, 2, 'the daily saved on turn 2');
  await h.toTitle(page);
  const t4 = await titleDaily(page);
  if (t4.head !== 'Continue today’s operation' || t4.disabled || JSON.parse(t4.daily || 'null')?.day !== DAY) fail(`left mid-round, the daily should offer to continue: ${JSON.stringify(t4)}`);
  if (t4.match !== before.match || t4.cont !== before.cont) fail(`the daily must not touch the ladder's save: ${JSON.stringify({ cont: t4.cont, same: t4.match === before.match })}`);

  // 5. Finish it: continued from its save, the day's result goes on record, its own save goes, and nothing else moves.
  await page.click('.title-screen .slip.daily');
  await h.until(page, () => window.__game.ui.screen === 'play' && window.__game.ui.daily && !window.__game.ui.updating && !window.__game.ui.card, null, 'today’s operation continued');
  const back = await page.evaluate(() => ({ matchId: window.__game.view.matchId, turn: window.__game.view.round.turn }));
  if (back.matchId !== op.matchId || back.turn !== 2) fail(`Continue should bring back the day's match on turn 2: ${JSON.stringify(back)}`);
  await page.evaluate(() => {
    const g = window.__game;
    g.state.scores = [30, 0];
    g.state.target = 1;
    g.finishRound();
  });
  await h.until(page, () => window.__game.state.phase === 'match-over' && document.querySelector('.result [data-action=final]') && !window.__game.ui.updating, null, 'the daily’s last result');
  const done = await page.evaluate((d) => {
    const g = window.__game;
    const S = g.state;
    return {
      margin: S.scores[0] - Math.max(...S.scores.slice(1)),
      winner: S.winner,
      rec: g.meta.daily.results[d] ?? null,
      beaten: [...g.meta.beaten],
      stats: JSON.parse(localStorage.getItem('cg:dead-drop:stats') || 'null'),
      match: localStorage.getItem('cg:dead-drop:match'),
      daily: localStorage.getItem('cg:dead-drop:daily'),
    };
  }, DAY);
  // Thirty up with the target at 1, plus or minus the last round's points.
  if (done.winner !== 0 || !(done.margin >= 25) || !done.rec || done.rec.margin !== done.margin || done.rec.won !== true || done.rec.by !== 'points' || done.rec.rival !== op.rivalId) fail(`the finished daily should be on record with its margin: ${JSON.stringify(done)}`);
  if (JSON.stringify(done.beaten) !== JSON.stringify(before.beaten)) fail(`the daily recruits nobody: ${JSON.stringify({ before: before.beaten, after: done.beaten })}`);
  // The shelf: the daily counted as one play when it began (not again on Continue), and offered no best.
  const shelf = (x) => ({ best: x?.best ?? null, bestLabel: x?.bestLabel ?? '' });
  if (JSON.stringify(shelf(done.stats)) !== JSON.stringify(shelf(before.stats)) || done.stats.plays !== before.stats.plays + 1) fail(`the daily should count one play and offer no best: ${JSON.stringify({ before: before.stats, after: done.stats })}`);
  if (done.match !== before.match || done.daily !== null) fail(`finishing the daily removes its own save only: ${JSON.stringify({ sameMatch: done.match === before.match, daily: done.daily })}`);
  await page.click('.result [data-action=final]');
  await h.until(page, () => document.querySelector('.over') && !window.__game.ui.card, null, 'the daily’s dossier');
  const over = await page.evaluate(() => ({
    stamp: document.querySelector('.over .case-file .label')?.textContent ?? null,
    sub: document.querySelector('.over .sub')?.textContent ?? null,
    rematch: !!document.querySelector('.over [data-action=rematch]'),
    next: !!document.querySelector('.over [data-action=rival]'),
    title: !!document.querySelector('.over .slip.primary[data-action=title]'),
  }));
  if (over.stamp !== 'Today’s operation · 3 November' || over.sub !== `You beat ${op.rival} by ${done.margin}.` || over.rematch || over.next || !over.title) fail(`the daily's case file should say the day in its label and the margin, with no rematch: ${JSON.stringify(over)}`);
  await h.settle(page);
  await shot('daily-over', page);
  await audit('daily-over');

  // 6. Back on the title: the played slip says how it went (at full strength), and the best daily is under the network.
  await page.click('.over [data-action=title]');
  await h.until(page, () => document.querySelector('.title-screen'), null, 'the title after the daily');
  const t6 = await titleDaily(page);
  if (!t6.disabled || t6.opacity !== '1' || t6.head !== `Today’s operation: won by ${done.margin}` || t6.small !== 'Tomorrow brings another.') fail(`the played daily should say how it went: ${JSON.stringify(t6)}`);
  if (t6.bestMargin !== `+${done.margin}` || t6.best !== `Best daily: +${done.margin} (3 November, against ${op.rival})`) fail(`the title should show the best daily: ${JSON.stringify(t6.best)}`);
  if (t6.match !== before.match || t6.cont !== before.cont) fail(`the ladder's Continue should still be there: ${JSON.stringify(t6.cont)}`);
  await h.settle(page);
  await shot('title-daily-done', page);
  await audit('title-daily-done');
  log(`daily ${DAY} won by ${done.margin}: on record, the best daily on the title; the ladder save untouched`);

  // 7. Tomorrow: a new operation. Started and left, its save is gone the day after, with no toast, and the slip offers that day's.
  await page.evaluate((d) => window.__game.today(d), NEXT_DAY);
  const op2 = await operationOf(page, NEXT_DAY);
  const t7 = await titleDaily(page);
  if (t7.disabled || t7.head !== 'Today’s operation' || t7.small !== `Operation ${op2.name} · ${op2.rival}’s day · 4 November`) fail(`the next day should offer its own operation: ${JSON.stringify(t7)}`);
  await page.click('.title-screen .slip.daily');
  await h.until(page, (id) => window.__game.ui.screen === 'play' && window.__game.view?.matchId === id && !window.__game.ui.updating && !window.__game.ui.card, op2.matchId, 'the next day’s operation');
  await page.evaluate(() => window.__game.quickTurns(1));
  await dailySavedOn(page, h, NEXT_DAY, 2, 'the next day’s daily saved on turn 2');
  await h.toTitle(page);
  const t7b = await titleDaily(page);
  if (t7b.head !== 'Continue today’s operation') fail(`left mid-round, the next day's daily should offer to continue: ${JSON.stringify(t7b)}`);
  await h.clearToasts(page);
  await page.evaluate((d) => window.__game.today(d), DAY_AFTER);
  const t7c = await titleDaily(page);
  if (t7c.head !== 'Today’s operation' || t7c.disabled || t7c.daily !== null || t7c.toasts !== 0) fail(`a day's save left from the day before should go quietly: ${JSON.stringify(t7c)}`);
  if (t7c.match !== before.match || t7c.cont !== before.cont) fail(`the ladder's Continue should outlast the stale daily: ${JSON.stringify(t7c.cont)}`);
  log(`daily: ${NEXT_DAY} offered its own operation (${op2.name}, ${op2.rival}); its save went quietly on ${DAY_AFTER}`);

  // 8. Leave things as the smoke found them: the clock's day, the ladder save, the daily record.
  await page.evaluate((f) => {
    const g = window.__game;
    g.skipAnimations(false);
    g.today(null);
    if (f.match === null) localStorage.removeItem('cg:dead-drop:match');
    else localStorage.setItem('cg:dead-drop:match', f.match);
    g.meta.daily = JSON.parse(f.daily);
    g.meta.met.agents = f.met;
    // beat() saves the profile (the daily record and the agents met as found) and draws the title again; the beaten list stays as it is.
    g.beat(g.meta.beaten);
  }, found);
  await h.until(page, () => document.querySelector('.title-screen') && !localStorage.getItem('cg:dead-drop:daily'), null, 'the title as the daily steps found it');
}

// ── the case file and its poster (Task 6) ───────────────────────────────────
/** Where the check keeps its screenshots (scripts/check.mjs: the repo's .tmp/check/), for the poster's PNG. */
const CHECK_DIR = new URL('../../.tmp/check/', import.meta.url);
/** A data URL's PNG, written beside the check's screenshots for review. */
const savePng = (name, url) => writeFileSync(new URL(name, CHECK_DIR), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));

/** The over screen's case file as drawn, with the view and the recap behind it. */
const caseNow = (page) =>
  page.evaluate(() => {
    const g = window.__game;
    const el = document.querySelector('.over .dossier .case-file');
    const all = (sel) => [...(el?.querySelectorAll(sel) ?? [])];
    const box = el?.getBoundingClientRect();
    return {
      file: !!el,
      stamp: el?.querySelector('.cf-stamp')?.textContent ?? null,
      stampCls: el?.querySelector('.cf-stamp')?.className ?? null,
      label: el?.querySelector('.label')?.textContent ?? null,
      head: el?.querySelector('h2')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      rows: all('.round-strip li').length,
      hows: all('.round-strip .how').map((x) => x.textContent),
      history: g.view?.history.length ?? null,
      seats: all('.score-line .seat').length,
      // Rows of seats on the score line: tops more than 30px apart (the winner's thicker rule moves its top a little).
      seatRows: all('.score-line .seat')
        .map((x) => x.getBoundingClientRect().top)
        .sort((a, b) => a - b)
        .filter((t, i, list) => i === 0 || t - list[i - 1] > 30).length,
      evidence: !!el?.querySelector('.evidence'),
      slips: all('.evidence .slip-ev .ev-text').map((x) => x.textContent),
      takedown: el?.querySelector('.slip-ev.takedown .ev-text')?.textContent ?? null,
      recap: Array.isArray(g.view?.recap) ? g.view.recap.length : null,
      first: document.querySelector('.over .actions > *')?.dataset.action ?? null,
      width: box ? Math.round(box.width) : null,
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth,
    };
  });

/** The poster for the view on screen: its size, a pixel of its stamp and of its folder, and the PNG as a data URL. */
const drawn = (page) =>
  page.evaluate(async () => {
    const c = await window.__game.poster.draw();
    const px = (xy) => {
      const [x, y] = xy.split(',').map(Number);
      return [...c.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3);
    };
    return { canvas: c instanceof HTMLCanvasElement, w: c.width, h: c.height, stamp: px(c.dataset.stamp), folder: px(c.dataset.folder), url: c.toDataURL('image/png') };
  });

/** Final report, then the case file once it's up (its recruits toast, if any, cleared for the shot). */
async function toCaseFile(page, h, what) {
  await h.until(page, () => document.querySelector('.result [data-action=final]') && !window.__game.ui.updating && !window.__game.ui.card, null, `${what}: the last result`);
  await page.click('.result [data-action=final]');
  await h.until(page, () => document.querySelector('.over .case-file') && !window.__game.ui.card, null, `${what}: the case file`);
  await h.clearToasts(page);
}

/** On a phone the case file fills the width and nothing runs past the right edge. */
function phoneFile(c, when) {
  if (c.scrollWidth > c.innerWidth || !(c.width >= c.innerWidth - 24)) fail(`${when}: the phone's case file should fill the width with nothing past the edge: ${JSON.stringify(c)}`);
}

export async function caseFileSteps(page, { log, shot, audit, phone }, h) {
  // 1. A won ladder match of three rounds: round 1 staged so my Assassin takes out Agent Wren's Heavy in Berlin (Moscow
  // stops tricks, so not there), round 2 played at random, round 3 folded by the rival with me one point short.
  await page.evaluate(() => {
    const g = window.__game;
    g.skipAnimations(true);
    g.stage({ rival: 'wren', hand: ['heavy', 'assassin', 'sleeper', 'veteran', 'mole', 'handler'], rivalHand: ['heavy', 'sleeper', 'veteran', 'mole', 'handler', 'lookout'], cities: ['moscow', 'monaco', 'berlin'] });
  });
  await h.until(page, () => window.__game.ui.screen === 'play' && !window.__game.ui.updating && !window.__game.ui.card, null, 'the staged case-file match');
  const staged = await page.evaluate(() => {
    const g = window.__game;
    const T = g.table;
    const lock = (seat, kind, city) => {
      const R = T.state.round;
      return T.act(seat, { a: 'lock', uid: R.hands[seat].find((u) => R.cards[u].kind === kind), city });
    };
    const ok = [lock(1, 'heavy', 2), lock(0, 'heavy', 1), lock(1, 'sleeper', 0), lock(0, 'assassin', 2)];
    const out = T.state.round.cities[2].sides[1].length === 0;
    g.quickTurns(4);
    for (const seat of [0, 1]) ok.push(T.act(seat, { a: 'next' }));
    g.quickTurns(6);
    for (const seat of [0, 1]) ok.push(T.act(seat, { a: 'next' }));
    g.state.scores = [9, Math.min(g.state.scores[1], 6)];
    ok.push(g.rivalFolds());
    return { ok, out };
  });
  if (!staged.ok.every(Boolean) || !staged.out) fail(`the staged takedown should play through the table: ${JSON.stringify(staged)}`);
  await toCaseFile(page, h, 'the won match');
  const c1 = await caseNow(page);
  if (!c1.file || c1.stamp !== 'Closed' || !/\bwon\b/.test(c1.stampCls) || !/\bland\b/.test(c1.stampCls) || c1.head !== 'Mission accomplished') fail(`a won match should end on a closed case file: ${JSON.stringify(c1)}`);
  if (c1.rows !== c1.history || c1.rows !== 3 || c1.hows[2] !== 'Agent Wren folded') fail(`the round strip should have one row a round (the last one folded): ${JSON.stringify(c1)}`);
  if (!c1.recap || !c1.evidence) fail(`a match with a recap should file its evidence: ${JSON.stringify(c1)}`);
  if (!/^Best takedown: your (Assassin|Tripwire) took out an? .+ \(\d\) in .+, round \d\.$/.test(c1.takedown ?? '') || !c1.takedown.includes('Heavy (6)')) fail(`the evidence should name the best takedown, the Heavy (6): ${JSON.stringify(c1.slips)}`);
  if (!c1.label?.startsWith('CASE FILE · ') || !c1.label.includes(' vs Agent Wren · ')) fail(`the case file's label should name the file: ${JSON.stringify(c1.label)}`);
  if (c1.first !== 'save-poster') fail(`Save as PNG should come first under the case file: ${JSON.stringify(c1.first)}`);
  if (phone) phoneFile(c1, 'the won case file');
  await h.settle(page);
  await shot('case-file', page);
  await audit('case-file');
  // A redraw (a rival accepting a rematch would do one) doesn't drop the stamp on again.
  const again = await page.evaluate(() => {
    window.__game.render();
    return document.querySelector('.over .cf-stamp')?.className ?? null;
  });
  if (again !== 'cf-stamp won') fail(`a redraw should leave the stamp where it landed: ${JSON.stringify(again)}`);
  log(`case file: ${c1.rows} rounds, "${c1.takedown}", ${c1.slips.length} slips`);

  // 2. The poster: 1200 × 1600, the stamp's ink red, the folder manila; then with every silhouette failing to load.
  const p = await drawn(page);
  const near = (rgb, want, by) => rgb.every((v, i) => Math.abs(v - want[i]) <= by);
  if (!p.canvas || p.w !== 1200 || p.h !== 1600 || !(p.stamp[0] > 150 && p.stamp[1] < 110 && p.stamp[2] < 100) || !near(p.folder, [0xe9, 0xd3, 0x9c], 18)) fail(`the poster should be 1200 × 1600 with a red stamp on a manila folder: ${JSON.stringify({ ...p, url: undefined })}`);
  if (!phone) savePng('dead-drop-poster.png', p.url);
  const broken = await page.evaluate(async () => {
    const g = window.__game;
    g.poster.breakArt(true);
    try {
      const c = await g.poster.draw();
      return { canvas: c instanceof HTMLCanvasElement, w: c.width, h: c.height, url: c.toDataURL('image/png') };
    } catch (e) {
      return { error: String(e) };
    } finally {
      g.poster.breakArt(false);
    }
  });
  if (broken.error || !broken.canvas || broken.w !== 1200 || broken.h !== 1600) fail(`with every silhouette failing the poster should still draw: ${JSON.stringify({ ...broken, url: undefined })}`);
  if (!phone) savePng('dead-drop-poster-noart.png', broken.url);
  // Save as PNG where the browser gives no picture: one toast, however often it's pressed, and nothing downloads.
  await page.evaluate(() => {
    const proto = HTMLCanvasElement.prototype;
    window.__realToBlob = proto.toBlob;
    window.__blobCalls = 0;
    proto.toBlob = function (cb) {
      window.__blobCalls++;
      setTimeout(() => cb(null), 150);
    };
  });
  // A double press: the second lands while the first is still drawing.
  await page.evaluate(() => {
    const el = document.querySelector('.over [data-action=save-poster]');
    el.click();
    el.click();
  });
  await h.until(page, () => document.querySelector('.cg-toast')?.textContent === 'That browser could not make the picture.' && !window.__game.poster.busy, null, 'the toast for a picture the browser could not make');
  const blob = await page.evaluate(() => {
    HTMLCanvasElement.prototype.toBlob = window.__realToBlob;
    return { calls: window.__blobCalls, busy: window.__game.poster.busy, toasts: document.querySelectorAll('.cg-toast').length, aria: document.querySelector('.over [data-action=save-poster]')?.getAttribute('aria-busy') ?? null };
  });
  if (blob.calls !== 1 || blob.busy || blob.aria !== null) fail(`Save as PNG should make one picture at a time and toast when it gets none: ${JSON.stringify(blob)}`);
  await h.clearToasts(page);
  log('case file: poster 1200 × 1600 (stamp red, folder manila), drawn without its silhouettes too; no picture toasts once');

  // 3. A view with no recap (Review Focus 3, an older host's): the file without its evidence, and its poster, no error.
  const bare = await page.evaluate(async () => {
    const g = window.__game;
    const was = g.ui.view;
    g.ui.view = { ...was, recap: undefined };
    let error = null;
    let poster = null;
    try {
      g.render();
      const c = await g.poster.draw();
      poster = c.width;
    } catch (e) {
      error = String(e);
    }
    const out = { error, poster, file: !!document.querySelector('.over .case-file'), evidence: !!document.querySelector('.over .evidence'), rows: document.querySelectorAll('.over .round-strip li').length };
    g.ui.view = was;
    g.render();
    out.back = !!document.querySelector('.over .evidence');
    return out;
  });
  if (bare.error || !bare.file || bare.evidence || bare.rows !== 3 || bare.poster !== 1200 || !bare.back) fail(`a view with no recap should show the case file without its evidence: ${JSON.stringify(bare)}`);

  // 4. A match of one round ended by a fold: one row, the fold's how, no takedown, and its poster.
  await page.evaluate(() => {
    const g = window.__game;
    g.stage({ rival: 'wren' });
  });
  await h.until(page, () => window.__game.ui.screen === 'play' && !window.__game.ui.updating && !window.__game.ui.card, null, 'a table to fold on');
  await page.evaluate(() => {
    const g = window.__game;
    g.state.scores = [9, 0];
    g.rivalFolds();
  });
  await toCaseFile(page, h, 'the fold');
  const c4 = await caseNow(page);
  const p4 = await drawn(page);
  if (c4.rows !== 1 || c4.hows.join() !== 'Agent Wren folded' || c4.takedown !== null || !c4.evidence || c4.stamp !== 'Closed') fail(`a match of one folded round should file one row and no takedown: ${JSON.stringify(c4)}`);
  if (p4.w !== 1200 || !(p4.stamp[0] > 150)) fail(`the one-round poster should draw: ${JSON.stringify({ ...p4, url: undefined })}`);
  await h.settle(page);
  await shot('case-file-fold', page);
  log(`case file of one folded round: ${c4.slips.join(' | ')}`);

  // 5. A Table of four: two rounds, Agent Wren takes the match; every seat on the score line (two rows on a phone).
  await page.evaluate(() => {
    const g = window.__game;
    g.holdRival(true);
    g.startTable({ seats: 4 });
  });
  await h.until(page, () => window.__game.ui.screen === 'play' && !window.__game.ui.updating && !window.__game.ui.card && document.querySelector('.hand .card'), null, 'the four-seat Table');
  await page.evaluate(() => {
    const g = window.__game;
    g.quickTurns(6);
    for (let s = 0; s < 4; s++) g.table.act(s, { a: 'next' });
    g.state.scores = [4, 9, 3, 2];
    g.state.target = 1;
    g.finishRound();
  });
  await toCaseFile(page, h, 'the four-seat Table');
  const c5 = await caseNow(page);
  if (c5.seats !== 4 || c5.rows !== c5.history || c5.stamp !== 'Burned' || c5.head !== 'Burned' || c5.seatRows !== (phone ? 2 : 1)) fail(`a four-seat case file should list every seat (on ${phone ? 'two rows' : 'one row'}) and be burned: ${JSON.stringify(c5)}`);
  if (phone) phoneFile(c5, 'the four-seat case file');
  await h.settle(page);
  await shot('case-file-four', page);
  await audit('case-file-four');
  if (!phone) savePng('dead-drop-poster-four.png', (await drawn(page)).url);
  log(`case file at four seats: "${c5.label}", ${c5.rows} rounds`);

  await page.evaluate(() => {
    const g = window.__game;
    g.skipAnimations(false);
    g.holdRival(false);
    g.leave();
  });
  await h.until(page, () => document.querySelector('.title-screen'), null, 'the title after the case-file steps');
}

// ── the briefing (Task 8) ───────────────────────────────────────────────────
/** The briefing's table as drawn: C's slip, the ticker, the status, the marks, and what the controls offer. */
const briefingNow = (page) =>
  page.evaluate(() => {
    const g = window.__game;
    const v = g.view;
    return {
      lesson: document.querySelector('.coach .lesson')?.textContent ?? null,
      text: document.querySelector('.coach p:not(.note)')?.textContent ?? null,
      note: document.querySelector('.coach .note')?.textContent ?? null,
      noteShown: (() => {
        const n = document.querySelector('.coach .note');
        return !!n && getComputedStyle(n).display !== 'none';
      })(),
      tickerShown: (() => {
        const t = document.querySelector('#ticker');
        return !!t && getComputedStyle(t).display !== 'none';
      })(),
      role: document.querySelector('.coach')?.getAttribute('role') ?? null,
      ticker: document.querySelector('#ticker')?.textContent ?? null,
      status: document.querySelector('.controls .status')?.textContent ?? null,
      suggest: { card: [...document.querySelectorAll('#hand .card.suggest')].map((c) => c.className.match(/k-(\w+)/)?.[1]), city: [...document.querySelectorAll('#board .city.suggest')].map((c) => Number(c.dataset.city)), tab: document.querySelector('#hand .card.suggest .try')?.textContent ?? null },
      gated: [...document.querySelectorAll('#hand .card.gated[aria-disabled=true]')].map((c) => c.className.match(/k-(\w+)/)?.[1]),
      escalate: !!document.querySelector('.controls [data-action=escalate]'),
      fold: !!document.querySelector('.controls [data-action=fold]'),
      unseen: !!document.querySelector('[data-action=unseen]'),
      fuse: !!document.querySelector('.fuse'),
      lock: document.querySelector('[data-action=lock]')?.disabled ?? null,
      turn: v?.round?.turn ?? null,
      phase: v?.phase ?? null,
      tutorial: g.ui.tutorial,
      selected: g.ui.selected,
      target: g.ui.target,
      night: document.body.dataset.night,
    };
  });

/** The briefing's turn `turn` up for planning: nothing playing, Wren locked in (it acts at once), the slip on screen. */
const planning = (page, h, turn, what) =>
  h.until(page, (n) => {
    const g = window.__game;
    return g.view?.phase === 'plan' && g.view.round.turn === n && g.view.round.rivalLocked && !g.ui.updating && !g.ui.animating && !g.ui.card && document.querySelector('.coach');
  }, turn, what);

/**
 * Drop `kind` in city `ci` by clicks (the card unless it's already picked, the city's plate, Lock in) and wait for the
 * next turn or the result.
 */
async function briefingDrop(page, h, turn, [kind, ci], { lock = true } = {}) {
  if (!(await page.$(`#hand .card.k-${kind}.sel`))) await page.click(`#hand .card.k-${kind}`);
  await page.click(`#board .city.target[data-city="${ci}"] .plate`);
  if (!lock) return;
  await page.click('[data-action=lock]');
  await h.until(page, (n) => {
    const g = window.__game;
    return (g.view.phase !== 'plan' || g.view.round.turn === n + 1) && !g.ui.updating && !g.ui.animating;
  }, turn, `the briefing's turn ${turn} to resolve`);
}

/** The play screen fits the phone (the scorebar, the cities, the hand and Lock in), failing first on a missing part. */
async function briefingFits(page, h, when) {
  const fit = await h.phoneFits(page);
  const coach = await page.evaluate(() => {
    const r = document.querySelector('.coach')?.getBoundingClientRect();
    const hand = Math.min(...[...document.querySelectorAll('#hand .card')].map((c) => c.getBoundingClientRect().top));
    return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), handTop: Math.round(hand), scrollWidth: document.scrollingElement.scrollWidth, innerWidth } : null;
  });
  const missing = Object.keys(fit).filter((k) => fit[k] === null);
  const over = ['boardBottom', 'handBottom', 'lockBottom'].filter((k) => !(fit[k] <= fit.innerHeight));
  if (!coach || missing.length || over.length || !(fit.scorebarTop >= 0) || coach.scrollWidth > coach.innerWidth) fail(`${when}: the scorebar, the cities, C's slip, the hand and Lock in should fit the phone: ${JSON.stringify({ fit, coach })}`);
  // The slip sits above the hand and never over it (the suggested card's lift and tab may reach into the gap).
  if (!(coach.bottom <= coach.handTop + 16)) fail(`${when}: C's slip must not cover the hand: ${JSON.stringify(coach)}`);
  return { ...fit, coachTop: coach.top, coachBottom: coach.bottom };
}

export async function briefingSteps(page, { log, shot, audit, phone }, h) {
  const SUG = TUTORIAL.turns.map((t) => t.suggest);
  // What the smoke found, so the last step leaves it so: the profile's counts, the saves.
  const found = await page.evaluate(() => {
    const m = window.__game.meta;
    return { matches: m.matches, briefed: m.briefed, beaten: [...m.beaten], daily: JSON.stringify(m.daily), match: localStorage.getItem('cg:dead-drop:match'), dailySave: localStorage.getItem('cg:dead-drop:daily') };
  });

  // 1. A first visit: no match to continue, nothing played. The briefing's slip leads the title, above Play the computer.
  await page.evaluate(() => {
    localStorage.removeItem('cg:dead-drop:match');
    localStorage.removeItem('cg:dead-drop:daily');
    window.__game.skipAnimations(true);
    window.__game.freshProfile();
    window.__game.render();
  });
  await h.until(page, () => document.querySelector('.title-screen .slip.briefing'), null, 'the briefing on a first visit’s title');
  const t1 = await page.evaluate(() => {
    const menu = [...document.querySelectorAll('.title-screen .menu > .slip')].map((b) => b.dataset.action);
    const slip = document.querySelector('.title-screen .slip.briefing');
    return { menu, primary: [...document.querySelectorAll('.title-screen .slip.primary')].map((b) => b.dataset.action), text: slip.textContent, small: slip.querySelector('small')?.textContent };
  });
  if (t1.primary.join() !== 'briefing' || t1.menu.indexOf('briefing') !== 0 || t1.menu.indexOf('rivals') !== 1 || t1.small !== 'One scripted round against Agent Wren, about three minutes.' || !t1.text.startsWith('New here? Take the briefing')) fail(`a first visit's title should lead with the briefing, above Play the computer: ${JSON.stringify(t1)}`);
  if (phone) log(`phone title with the briefing and the daily: ${JSON.stringify(await titleFits(page, 'the first visit’s title'))}`);
  await h.settle(page);
  await shot('title-briefing', page);
  await audit('title-briefing');

  // Turn 1: C's slip on the lesson, the Heavy and Istanbul suggested, the rest of the hand held back; no Escalate,
  // Fold, unseen strip or fuse (the briefing is never timed).
  await page.click('.title-screen .slip.briefing');
  await planning(page, h, 1, 'the briefing’s turn 1');
  const b1 = await briefingNow(page);
  if (b1.lesson !== 'Briefing 1 of 6 · The drop' || b1.text !== TUTORIAL.turns[0].text || b1.role !== 'status') fail(`turn 1's slip should carry the first lesson: ${JSON.stringify(b1)}`);
  if (b1.suggest.card.join() !== 'heavy' || b1.suggest.city.join() !== '0' || b1.suggest.tab !== 'Try this' || b1.gated.join() !== 'assassin,sleeper,mole') fail(`turn 1 should suggest the Heavy and Istanbul and hold the rest back: ${JSON.stringify(b1)}`);
  if (b1.escalate || b1.fold || b1.unseen || b1.fuse || b1.lock !== true) fail(`turn 1 has only Lock in (disabled), no fuse and no unseen strip: ${JSON.stringify(b1)}`);
  const names = await page.evaluate(() => window.__game.view.names);
  if (names[1] !== 'Agent Wren' || b1.tutorial?.step !== 1) fail(`the briefing is against Agent Wren: ${JSON.stringify({ names, tutorial: b1.tutorial })}`);
  if (phone) log(`phone briefing turn 1: ${JSON.stringify(await briefingFits(page, h, 'the briefing’s turn 1'))}`);
  await h.settle(page);
  await shot('briefing-1', page);
  await audit('briefing-1');

  // 2. The gate. The Assassin (a tap still reaches it: it is held back, not disabled) is turned away, and so is Monaco
  // for the Heavy, each with the ticker saying what the lesson wants; Istanbul and Lock in go through, and Wren's drop
  // has gone in by itself.
  await page.click('#hand .card.k-assassin', { force: true });
  const g1 = await briefingNow(page);
  if (g1.selected !== null || g1.ticker !== 'Follow the briefing: the Heavy this turn.') fail(`the gate should turn the Assassin away: ${JSON.stringify(g1)}`);
  await page.click('#hand .card.k-heavy');
  await page.click('#board .city[data-city="1"] .plate');
  const g2 = await briefingNow(page);
  const targets = await page.evaluate(() => [...document.querySelectorAll('#board .city.target')].map((c) => Number(c.dataset.city)));
  if (g2.target !== null || g2.ticker !== 'Not there: Istanbul this turn.' || targets.join() !== '0' || g2.suggest.card.length || g2.suggest.city.length) fail(`with the Heavy picked, only Istanbul is on offer and Monaco is turned away (the suggestion gone): ${JSON.stringify({ ...g2, targets })}`);
  await briefingDrop(page, h, 1, SUG[0]);
  await planning(page, h, 2, 'the briefing’s turn 2');
  const b2 = await briefingNow(page);
  if (b2.ticker !== TUTORIAL.turns[0].after || b2.lesson !== 'Briefing 2 of 6 · The flip trick' || b2.tutorial?.step !== 2) fail(`after turn 1 the ticker has C's line and the slip the next lesson: ${JSON.stringify(b2)}`);
  log(`briefing: the gate turned the Assassin and Monaco away; turn 1's line: ${b2.ticker}`);

  // 3. Turns 2 and 3 by the suggestions: the Assassin takes out Wren's Veteran in Monaco.
  await briefingDrop(page, h, 2, SUG[1]);
  const vet = await page.evaluate(() => {
    const R = window.__game.state.round;
    return R.gone[1].map((u) => R.cards[u].kind);
  });
  if (!vet.includes('veteran')) fail(`the Assassin should take out Wren's Veteran: ${JSON.stringify(vet)}`);
  await planning(page, h, 3, 'the briefing’s turn 3');
  const b3 = await briefingNow(page);
  if (b3.ticker !== TUTORIAL.turns[1].after || b3.lesson !== 'Briefing 3 of 6 · The face-down card' || b3.suggest.card.join() !== 'sleeper' || b3.suggest.city.join() !== '2') fail(`turn 3 should suggest the Sleeper and Berlin: ${JSON.stringify(b3)}`);
  await h.settle(page);
  await shot('briefing-3', page);
  await briefingDrop(page, h, 3, SUG[2]);

  // 4. Turn 4: Escalate is back, and Lock in waits for it ("Escalate first"). Escalate; Wren plays on: stake 2.
  await planning(page, h, 4, 'the briefing’s turn 4');
  const b4a = await briefingNow(page);
  if (b4a.lesson !== 'Briefing 4 of 6 · Escalate' || !b4a.escalate || b4a.fold || b4a.gated.length !== 3 || b4a.gated.includes('mole') || b4a.suggest.card.join() !== 'mole' || b4a.suggest.city.join() !== '2') fail(`turn 4 offers Escalate and holds back every card but the Mole: ${JSON.stringify(b4a)}`);
  // Its gate turns another card away, and another city for the Mole.
  await page.click(`#hand .card.k-${b4a.gated[0]}`, { force: true });
  const g4 = await briefingNow(page);
  if (g4.selected !== null || g4.ticker !== 'Follow the briefing: the Mole this turn.') fail(`turn 4's gate should turn the ${b4a.gated[0]} away: ${JSON.stringify(g4)}`);
  await page.click('#hand .card.k-mole');
  await page.click('#board .city[data-city="0"] .plate');
  const g4b = await briefingNow(page);
  const t4 = await page.evaluate(() => [...document.querySelectorAll('#board .city.target')].map((c) => Number(c.dataset.city)));
  if (g4b.target !== null || g4b.ticker !== 'Not there: Berlin this turn.' || t4.join() !== '2') fail(`with the Mole picked, only Berlin is on offer: ${JSON.stringify({ ...g4b, targets: t4 })}`);
  await briefingDrop(page, h, 4, SUG[3], { lock: false });
  const b4 = await briefingNow(page);
  if (b4.lock !== true || b4.status !== 'Escalate first: press Escalate or E.' || b4.selected === null || b4.target !== 2) fail(`turn 4's Lock in should wait for the escalation: ${JSON.stringify(b4)}`);
  if (phone) await briefingFits(page, h, 'turn 4 waiting for the escalation');
  await h.settle(page);
  await shot('briefing-4', page);
  await audit('briefing-4');
  await page.click('.controls [data-action=escalate]');
  await h.until(page, () => {
    const g = window.__game;
    return g.view.round.escalated[0] && !g.view.round.pending && !g.ui.updating && !g.ui.card;
  }, null, 'Wren’s answer to the escalation');
  const stake = await page.evaluate(() => ({ stake: window.__game.view.round.stake, answer: window.__game.view.round.called?.answers?.[1] ?? null, lock: document.querySelector('[data-action=lock]')?.disabled }));
  if (stake.stake !== 2 || stake.lock !== false) fail(`Wren plays on (stake 2), and Lock in is ready: ${JSON.stringify(stake)}`);
  await page.click('[data-action=lock]');
  await h.until(page, () => window.__game.view.round.turn === 5 && !window.__game.ui.updating && !window.__game.ui.animating, null, 'the briefing’s turn 4 to resolve');

  // 5. Turns 5 and 6 by the suggestions. On desktop turn 5's reveal plays (sped up, then skipped) so the final turn's
  // card shows; turn 6 is at night. The final flip takes all three cities.
  await planning(page, h, 5, 'the briefing’s turn 5');
  const b5 = await briefingNow(page);
  if (b5.ticker !== TUTORIAL.turns[3].after || b5.lesson !== 'Briefing 5 of 6 · Read the board' || b5.gated.length !== 3 || b5.gated.includes('jammer') || b5.escalate) fail(`turn 5: Wren's play-on line, the fifth lesson, every card but the Jammer held back: ${JSON.stringify(b5)}`);
  if (phone) await briefingFits(page, h, 'the briefing’s turn 5');
  await h.settle(page);
  await shot('briefing-5', page);
  await audit('briefing-5');
  await page.click(`#hand .card.k-${b5.gated[0]}`, { force: true });
  const g5 = await briefingNow(page);
  if (g5.selected !== null || g5.ticker !== 'Follow the briefing: the Jammer this turn.') fail(`turn 5's gate should turn the ${b5.gated[0]} away: ${JSON.stringify(g5)}`);
  if (!phone) {
    await briefingDrop(page, h, 5, SUG[4], { lock: false });
    await page.evaluate(() => window.__game.skipAnimations(false));
    await page.click('[data-action=lock]');
    await h.until(page, () => window.__game.ui.animating && performance.now() - window.__game.ui.revealAt > 450, null, 'turn 5’s reveal past its guard');
    await page.keyboard.press(' ');
    await page.keyboard.press(' ');
    await h.until(page, () => document.querySelector('.final-card') && window.__game.ui.card, null, 'the final turn’s card in the briefing');
    await page.evaluate(() => window.__game.holdCard());
    await h.settle(page);
    await shot('briefing-final', page);
    await page.keyboard.press('Enter');
    await h.until(page, () => !window.__game.ui.card, null, 'the final card to go');
    await page.evaluate(() => window.__game.skipAnimations(true));
  } else await briefingDrop(page, h, 5, SUG[4]);
  await planning(page, h, 6, 'the briefing’s turn 6');
  const b6 = await briefingNow(page);
  if (b6.night !== '1' || b6.ticker !== TUTORIAL.turns[4].after || b6.lesson !== 'Briefing 6 of 6 · The final flip' || b6.suggest.card.join() !== 'veteran') fail(`turn 6 is the final drop, at night: ${JSON.stringify(b6)}`);
  await briefingDrop(page, h, 6, SUG[5]);
  await h.until(page, () => document.querySelector('.result [data-action=finish-briefing]') && !window.__game.ui.updating && !window.__game.ui.animating, null, 'the briefing’s result');
  const res = await page.evaluate(() => {
    const S = window.__game.state;
    return {
      winners: S.round.result.cityWinners,
      scores: S.scores,
      mine: document.querySelectorAll('.result .city-line.w-me').length,
      head: document.querySelector('.result h2')?.textContent.replace(/\s+/g, ' ').trim(),
      btn: document.querySelector('.result [data-action=finish-briefing]')?.textContent,
      next: !!document.querySelector('.result [data-action=next]'),
      coach: !!document.querySelector('.coach'),
    };
  });
  if (res.winners.join() !== '0,0,0' || res.scores.join() !== '5,0' || res.mine !== 3 || res.next || !res.btn?.startsWith('Finish the briefing') || res.coach) fail(`the briefing's result: all three cities, 5 to 0, and Finish the briefing: ${JSON.stringify(res)}`);
  await h.settle(page);
  await shot('briefing-result', page);
  await audit('briefing-result');
  log(`briefing: ${res.head}, ${res.scores.join(' to ')}, all three cities`);

  // Finish: C's end card, typed (held for the shot), then the way on. The profile is briefed; nothing counted or saved.
  await page.evaluate(() => window.__game.skipAnimations(false));
  await page.click('.result [data-action=finish-briefing]');
  await h.until(page, () => document.querySelector('.briefing-card .telegram') && window.__game.ui.card, null, 'the briefing’s end card');
  await page.evaluate(() => window.__game.holdCard());
  const end = await page.evaluate(() => [...document.querySelectorAll('.briefing-card .eline .vh')].map((x) => x.textContent));
  if (end.join('|') !== [TUTORIAL.end.title, TUTORIAL.end.won, TUTORIAL.end.text].join('|') || !(await page.$('.briefing-card .eline.sig'))) fail(`the end card says the round is won, what a match is, and who sends it: ${JSON.stringify(end)}`);
  // Its keys are typed over about five seconds: the shot waits for the last.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, { timeout: 12000 }).catch(() => {});
  await shot('briefing-end', page);
  await page.keyboard.press('Enter');
  await h.until(page, () => document.querySelector('.sheet.briefed [data-action=rival]') && !window.__game.ui.card, null, 'the way on after the briefing');
  const after = await page.evaluate(() => ({
    briefed: window.__game.meta.briefed,
    matches: window.__game.meta.matches,
    match: localStorage.getItem('cg:dead-drop:match'),
    daily: localStorage.getItem('cg:dead-drop:daily'),
    saved: JSON.parse(localStorage.getItem('cg:dead-drop:meta') || 'null')?.briefed,
    btns: [...document.querySelectorAll('.sheet.briefed .btns .slip')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
  }));
  if (after.briefed !== true || after.saved !== true || after.matches !== 0 || after.match !== null || after.daily !== null) fail(`the finished briefing leaves the profile briefed, nothing counted, nothing saved: ${JSON.stringify(after)}`);
  if (after.btns[0] !== 'Play Agent Wren' || !after.btns[1]?.startsWith('Title screen')) fail(`after the briefing: Play Agent Wren or Title screen: ${JSON.stringify(after.btns)}`);
  await h.settle(page);
  await shot('briefing-briefed', page);
  await audit('briefing-briefed');

  // 6. Play Agent Wren: the real ladder match, with its round card. Leave: the title no longer offers the briefing,
  // and Help's footer has it.
  await page.click('.sheet.briefed [data-action=rival]');
  await h.until(page, () => document.querySelector('.title-card, .dossier-card') && window.__game.ui.card, null, 'Agent Wren’s match opening on its cards');
  await h.clearCard(page);
  const wren = await page.evaluate(() => ({ name: window.__game.view.names[1], tutorial: window.__game.ui.tutorial, free: window.__game.ui.free, coach: !!document.querySelector('.coach'), matches: window.__game.meta.matches }));
  if (wren.name !== 'Agent Wren' || wren.tutorial !== null || wren.free || wren.coach || wren.matches !== 1) fail(`Play Agent Wren starts the ladder's first match (counted), with no slip: ${JSON.stringify(wren)}`);
  // A turn on its table saves it (as a rival's drop would), so the title has a match to continue in step 7.
  await page.evaluate(() => {
    window.__game.skipAnimations(true);
    window.__game.quickTurns(1);
  });
  await h.until(page, () => JSON.parse(localStorage.getItem('cg:dead-drop:match') || 'null')?.table?.state?.round?.turn === 2, null, 'Agent Wren’s match saved on turn 2');
  await h.toTitle(page);
  if (await page.$('.title-screen .slip.briefing')) fail('once briefed, the title should stop offering the briefing');
  await page.click('[data-action=help]');
  await h.until(page, () => document.querySelector('.sheet.help'), null, 'Help on the title');
  const foot = await page.evaluate(() => [...document.querySelectorAll('.sheet.help footer .slip')].map((b) => `${b.dataset.action}:${b.textContent}`));
  if (foot.join() !== 'briefing:Play the briefing,close-modal:Back to the table') fail(`Help's footer should offer the briefing: ${JSON.stringify(foot)}`);
  if (!(await h.helpClear(page))) fail('Help with the briefing in its footer should keep its text clear of the cut');
  await page.keyboard.press('Escape');
  await h.until(page, () => !document.querySelector('.sheet.help'), null, 'Help closed');

  // 7. Help's Play the briefing with a match on: the quit sheet asks first, and the match's save stays. Leaving the
  // briefing part-way leaves it unfinished and saves nothing; the title offers it again.
  // The match's rival is held, so its save can't move under the check (the briefing's Wren is let go once it starts).
  await page.evaluate(() => {
    window.__game.freshProfile();
    window.__game.holdRival(true);
  });
  if (!(await page.evaluate(() => localStorage.getItem('cg:dead-drop:match')))) fail('leaving Agent Wren’s match should have saved it');
  await page.click('.title-screen [data-action=continue]');
  await h.until(page, () => window.__game.ui.screen === 'play' && !window.__game.ui.updating && !window.__game.ui.card && document.querySelector('#hand .card'), null, 'Agent Wren’s match continued');
  await page.click('[data-action=help]');
  await h.until(page, () => document.querySelector('.sheet.help footer [data-action=briefing]'), null, 'Help over the match');
  await page.click('.sheet.help footer [data-action=briefing]');
  await h.until(page, () => document.querySelector('.modal [data-action=start-briefing]'), null, 'the quit sheet before the briefing');
  const quit = await page.evaluate(() => ({ text: document.querySelector('.modal .sheet p')?.textContent, leave: document.querySelector('.modal [data-action=start-briefing]')?.textContent }));
  if (quit.leave !== 'Leave for the briefing' || quit.text !== 'Your match is saved; you can continue it from the title screen.') fail(`Help's briefing asks before leaving a match: ${JSON.stringify(quit)}`);
  const wrenSave = await page.evaluate(() => localStorage.getItem('cg:dead-drop:match'));
  await page.click('.modal [data-action=start-briefing]');
  await page.evaluate(() => window.__game.holdRival(false));
  await planning(page, h, 1, 'the briefing from Help');
  const m7 = await page.evaluate(() => ({ save: localStorage.getItem('cg:dead-drop:match'), lesson: document.querySelector('.coach .lesson')?.textContent }));
  if (m7.save !== wrenSave || m7.lesson !== 'Briefing 1 of 6 · The drop') fail(`the briefing from Help keeps the match's save: ${JSON.stringify({ same: m7.save === wrenSave, lesson: m7.lesson })}`);
  // A turn in, then Leave (the quit sheet says what leaving the briefing does).
  await page.evaluate(() => {
    const g = window.__game;
    const uid = g.view.round.hand.find((c) => c.kind === 'heavy').uid;
    g.table.act(0, { a: 'lock', uid, city: 0 });
  });
  await planning(page, h, 2, 'the briefing’s turn 2, before leaving it');
  await page.click('[data-action=quit]');
  const q2 = await page.evaluate(() => document.querySelector('.modal .sheet p')?.textContent);
  if (q2 !== 'The briefing stops here. Help has it whenever you want it again.') fail(`the quit sheet over the briefing should say what leaving it does: ${JSON.stringify(q2)}`);
  await page.click('.modal [data-action=title]');
  await h.until(page, () => document.querySelector('.title-screen'), null, 'the title after leaving the briefing');
  const left = await page.evaluate(() => ({
    briefed: window.__game.meta.briefed,
    matches: window.__game.meta.matches,
    same: localStorage.getItem('cg:dead-drop:match'),
    daily: localStorage.getItem('cg:dead-drop:daily'),
    slip: !!document.querySelector('.title-screen .slip.briefing'),
    cont: !!document.querySelector('.title-screen [data-action=continue]'),
  }));
  if (left.briefed !== false || left.matches !== 0 || left.same !== wrenSave || left.daily !== null || !left.slip || !left.cont) fail(`leaving the briefing part-way leaves it unfinished, saves nothing, and the title offers it again: ${JSON.stringify({ ...left, same: left.same === wrenSave })}`);
  log('briefing: Help’s path kept the match’s save; leaving part-way left it unfinished, and the title offers it again');

  // 8. Help's briefing played to its end over the saved match: the way on offers Continue your match first, and Play
  // Agent Wren says it starts a new match. The match's save is untouched until Continue, which resumes that match.
  await page.evaluate(() => window.__game.holdRival(true));
  await page.click('.title-screen [data-action=continue]');
  await h.until(page, () => window.__game.ui.screen === 'play' && !window.__game.ui.updating && !window.__game.ui.card && document.querySelector('#hand .card'), null, 'Agent Wren’s match continued again');
  const kept = await page.evaluate(() => {
    const v = window.__game.view;
    return { id: v.matchId, roundNo: v.roundNo, turn: v.round.turn };
  });
  await page.click('[data-action=help]');
  await h.until(page, () => document.querySelector('.sheet.help footer [data-action=briefing]'), null, 'Help over the match again');
  await page.click('.sheet.help footer [data-action=briefing]');
  await h.until(page, () => document.querySelector('.modal [data-action=start-briefing]'), null, 'the quit sheet before the briefing again');
  kept.save = await page.evaluate(() => localStorage.getItem('cg:dead-drop:match'));
  if (!kept.save) fail('the continued match should be saved before the briefing');
  await page.click('.modal [data-action=start-briefing]');
  await page.evaluate(() => {
    window.__game.holdRival(false);
    window.__game.skipAnimations(true);
  });
  for (let turn = 1; turn <= TUTORIAL.turns.length; turn++) {
    await planning(page, h, turn, `the briefing over a saved match, turn ${turn}`);
    if (turn !== 4) {
      await briefingDrop(page, h, turn, SUG[turn - 1]);
      continue;
    }
    await briefingDrop(page, h, 4, SUG[3], { lock: false });
    await page.click('.controls [data-action=escalate]');
    await h.until(page, () => !window.__game.view.round.pending && !window.__game.ui.updating && !window.__game.ui.card && window.__game.view.round.stake === 2, null, 'Wren’s answer in the briefing over a saved match');
    await page.click('[data-action=lock]');
    await h.until(page, () => window.__game.view.round.turn === 5 && !window.__game.ui.updating && !window.__game.ui.animating, null, 'turn 4 of the briefing over a saved match');
  }
  await h.until(page, () => document.querySelector('.result [data-action=finish-briefing]') && !window.__game.ui.updating && !window.__game.ui.animating, null, 'the briefing’s result over a saved match');
  await page.click('.result [data-action=finish-briefing]');
  await h.until(page, () => document.querySelector('.sheet.briefed') && !window.__game.ui.card, null, 'the way on with a match to continue');
  const way = await page.evaluate(() => ({
    btns: [...document.querySelectorAll('.sheet.briefed .btns .slip')].map((b) => `${b.dataset.action}:${b.textContent.replace(/\s+/g, ' ').trim()}`),
    primary: [...document.querySelectorAll('.sheet.briefed .btns .slip.primary')].map((b) => b.dataset.action),
    save: localStorage.getItem('cg:dead-drop:match'),
  }));
  if (way.btns[0] !== 'continue:Continue your match' || way.btns[1] !== 'rival:Play Agent Wren (starts a new match)' || !way.btns[2]?.startsWith('title:Title screen') || way.btns.length !== 3 || way.primary.join() !== 'continue') fail(`after the briefing over a saved match: Continue your match first, then Play Agent Wren (starts a new match), then Title screen: ${JSON.stringify(way.btns)}`);
  if (way.save !== kept.save) fail('the briefing must leave the saved match as it was');
  await h.settle(page);
  await shot('briefing-briefed-continue', page);
  await audit('briefing-briefed-continue');
  await page.evaluate(() => window.__game.holdRival(true));
  await page.click('.sheet.briefed [data-action=continue]');
  await h.until(page, () => window.__game.ui.screen === 'play' && !window.__game.ui.tutorial && !window.__game.ui.updating && !window.__game.ui.card && document.querySelector('#hand .card'), null, 'the match continued from the way on');
  const back = await page.evaluate(() => {
    const v = window.__game.view;
    return { id: v.matchId, roundNo: v.roundNo, turn: v.round.turn, name: v.names[1], coach: !!document.querySelector('.coach'), modal: window.__game.ui.modal };
  });
  if (back.id !== kept.id || back.roundNo !== kept.roundNo || back.turn !== kept.turn || back.name !== 'Agent Wren' || back.coach || back.modal) fail(`Continue your match resumes the saved match: ${JSON.stringify({ back, kept: { ...kept, save: undefined } })}`);
  await h.toTitle(page);
  await page.evaluate(() => window.__game.holdRival(false));
  log(`briefing over a saved match: the way on offered Continue your match first; it resumed match ${back.id} on turn ${back.turn}`);

  // 9. The narrowest phone: every turn (C's slip, the hand and Lock in) fits 320 × 640. There the slip carries the
  // ticker's line above the lesson (the ticker and the status stand aside while you plan): from turn 2 the turn just
  // flipped, readable all turn, and a correction when the gate turns a pick away (turn 1's Assassin).
  if (phone) {
    const size = page.viewportSize();
    await page.setViewportSize({ width: 320, height: 640 });
    try {
      await page.evaluate(() => window.__game.startTutorial());
      const fits = [];
      for (let turn = 1; turn <= TUTORIAL.turns.length; turn++) {
        await planning(page, h, turn, `the briefing’s turn ${turn} at 320 × 640`);
        const at = await briefingNow(page);
        const after = turn > 1 ? TUTORIAL.turns[turn - 2].after : null;
        if (at.tickerShown || (after ? at.note !== after || !at.noteShown : at.note !== null)) fail(`at 320 × 640 turn ${turn}'s slip carries the last turn's line instead of the ticker: ${JSON.stringify(at)}`);
        const fit = await briefingFits(page, h, `the briefing’s turn ${turn} at 320 × 640`);
        fits.push(`${turn}: hand ${fit.handBottom}, Lock in ${fit.lockBottom}`);
        await h.settle(page);
        await shot(`briefing-320-${turn}`, page);
        if (turn === 1) {
          await audit('briefing-320');
          await page.click('#hand .card.k-assassin', { force: true });
          const said = await briefingNow(page);
          if (said.note !== 'Follow the briefing: the Heavy this turn.' || !said.noteShown) fail(`at 320 × 640 the gate's correction shows on C's slip: ${JSON.stringify(said)}`);
          await briefingFits(page, h, 'the gate’s correction at 320 × 640');
        }
        if (turn === 4) {
          await briefingDrop(page, h, 4, SUG[3], { lock: false });
          const wait = await briefingNow(page);
          if (wait.note !== 'Escalate first: press Escalate or E.' || wait.lock !== true) fail(`at 320 × 640 the slip says to escalate first: ${JSON.stringify(wait)}`);
          await briefingFits(page, h, 'turn 4 waiting for the escalation at 320 × 640');
          await page.click('.controls [data-action=escalate]');
          await h.until(page, () => !window.__game.view.round.pending && !window.__game.ui.updating && !window.__game.ui.card && window.__game.view.round.stake === 2, null, 'Wren’s answer at 320 × 640');
          await page.click('[data-action=lock]');
          await h.until(page, () => window.__game.view.round.turn === 5 && !window.__game.ui.updating && !window.__game.ui.animating, null, 'turn 4 at 320 × 640');
        } else if (turn < TUTORIAL.turns.length) await briefingDrop(page, h, turn, SUG[turn - 1]);
      }
      log(`320 × 640 briefing, every turn: ${fits.join('; ')}`);
      await page.evaluate(() => window.__game.leave());
      await h.until(page, () => document.querySelector('.title-screen'), null, 'the title after the briefing at 320');
    } finally {
      await page.setViewportSize(size ?? { width: 390, height: 844 });
      await page.evaluate(() => scrollTo(0, 0));
    }
  }

  // Leave things as the smoke found them: the profile's counts and the saves.
  await page.evaluate((f) => {
    const g = window.__game;
    g.skipAnimations(false);
    for (const [k, v] of [['cg:dead-drop:match', f.match], ['cg:dead-drop:daily', f.dailySave]]) {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    }
    g.meta.matches = f.matches;
    g.meta.briefed = f.briefed;
    g.meta.daily = JSON.parse(f.daily);
    // beat() saves the profile as restored and draws the title again.
    g.beat(f.beaten);
  }, found);
  await h.until(page, () => document.querySelector('.title-screen'), null, 'the title as the briefing steps found it');
}

/**
 * Help in an online lobby (a host's or a guest's, a room up or not): its footer has no Play the briefing (starting one
 * would leave the room, and close a host's table), only Back; and closing it leaves the page in the room, on the
 * lobby, its invite still in the address. With `shot`, the open sheet is shot and audited as `name`.
 */
export async function lobbyHelp(page, { shot = null, audit = null, name = 'lobby-help' } = {}) {
  const wait = (fn, what) => page.waitForFunction(fn, null, { timeout: 15000, polling: 50 }).catch(() => fail(`timed out waiting for ${what}`));
  const room = () => page.evaluate(() => ({ screen: window.__game.ui.screen, mode: window.__game.ui.mode, code: window.__game.ui.net?.code ?? null, hash: location.hash }));
  const before = await room();
  await page.click('[data-action=help]');
  await wait(() => document.querySelector('.sheet.help footer') && window.__game.ui.modal === 'help', 'Help in the lobby');
  const foot = await page.evaluate(() => [...document.querySelectorAll('.sheet.help footer .slip')].map((b) => b.dataset.action));
  if (foot.join() !== 'close-modal' || (await page.$('[data-action=briefing]'))) fail(`Help in an online lobby should offer no briefing, only Back: ${JSON.stringify({ foot, before })}`);
  if (shot) {
    await shot(name, page);
    await audit(name, page);
  }
  await page.click('.sheet.help footer [data-action=close-modal]');
  await wait(() => !document.querySelector('.sheet.help') && !window.__game.ui.modal, 'Help to close in the lobby');
  const after = await room();
  if (before.screen !== 'lobby' || !before.code || JSON.stringify(after) !== JSON.stringify(before)) fail(`closing Help should leave the page in the room's lobby: ${JSON.stringify({ before, after })}`);
}

export async function guestWaitSteps(page, { log, shot, audit, phone, url }, h) {
  if (!phone) return;
  const keep = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('cg:dead-drop:')).map((k) => [k, localStorage.getItem(k)])));
  const wait = await page.context().newPage();
  const errors = [];
  wait.on('pageerror', (e) => errors.push(e.message));
  wait.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  try {
    await wait.goto(`${url}${url.includes('?') ? '&' : '?'}net=local#join=NOPE99`);
    await h.until(wait, () => window.__game?.ui.net?.status === 'searching' && document.querySelector('.lobby .turn-guide li'), null, 'a friend waiting on room NOPE99');
    await h.settle(wait);
    const seen = await wait.evaluate(() => ({
      status: document.querySelector('.lobby .wait')?.textContent.trim(),
      lines: document.querySelectorAll('.turn-guide li').length,
      art: document.querySelectorAll('.turn-guide svg').length,
      cancel: document.querySelector('.lobby [data-action=title]')?.getBoundingClientRect().bottom ?? null,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      innerHeight,
    }));
    if (seen.status !== 'Looking for room NOPE99…' || seen.lines !== 4 || seen.art !== 4) fail(`a friend waiting for a room should see how a turn works under the status: ${JSON.stringify(seen)}`);
    if (seen.scrollWidth > seen.innerWidth || seen.cancel === null || seen.cancel > seen.innerHeight) fail(`the friend's wait should fit the phone, Cancel on screen and nothing past the right edge: ${JSON.stringify(seen)}`);
    await shot('guest-wait-briefing', wait);
    await audit('guest-wait-briefing', wait);
    // Help there has no briefing to leave the room for, and closing it leaves the friend waiting on NOPE99.
    await lobbyHelp(wait, { shot, audit, name: 'guest-wait-help' });
    if (errors.length) fail(`the friend's waiting page logged errors: ${errors.join(' | ')}`);
    log(`a friend waiting on a room: how a turn works under the status, Cancel at ${Math.round(seen.cancel)} of ${seen.innerHeight}; Help offers no briefing`);
  } finally {
    await wait.close();
    await page.evaluate((saves) => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('cg:dead-drop:') && !(k in saves)) localStorage.removeItem(k);
      for (const [k, v] of Object.entries(saves)) localStorage.setItem(k, v);
    }, keep);
  }
}
