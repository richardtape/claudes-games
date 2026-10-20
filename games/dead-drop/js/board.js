// The table on screen: cities, agents (chips on the board, cards in hand) and the reveal
// animation that plays a turn's events over the board before it re-renders from the new view.
import { AGENT, CITY } from './data.js';
import { deckList, rivalsOf, seatCount } from './engine.js';
import { agentSVG, citySVG, filmSVG } from './art.js';

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const $ = (sel, root = document) => root.querySelector(sel);

/** Power badge classes: boosted or weakened compared to the printed number. */
function powClass(cv) {
  if (cv.power === null || cv.base === null) return '';
  return cv.power > cv.base ? ' up' : cv.power < cv.base ? ' down' : '';
}

/**
 * Small marks, drawn in currentColor: the linked rings of an Accomplice's partner, the pin of a card
 * placed before the round began, and the headphones of a wiretap.
 */
const RINGS = '<svg viewBox="0 0 18 12" aria-hidden="true"><circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="6" r="4.2" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>';
const PIN = '<svg viewBox="0 0 12 16" aria-hidden="true"><path fill="currentColor" d="M3 .8h6v1.6L8 3v3.2l2.4 2.4v1.6H1.6V8.6L4 6.2V3L3 2.4z"/><path fill="currentColor" d="M5.3 10.2h1.4V15l-.7 1-.7-1z"/></svg>';
const PHONES = '<svg viewBox="0 0 20 18" aria-hidden="true"><path d="M3 11V9a7 7 0 0 1 14 0v2" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="1" y="10" width="5" height="7.5" rx="1.6" fill="currentColor"/><rect x="14" y="10" width="5" height="7.5" rx="1.6" fill="currentColor"/></svg>';
export const ringsSVG = () => RINGS;

/**
 * A card on the board. Rival face-down cards show their back. An Accomplice's partner and a card
 * placed before the round wear their mark on both sides of the table (both are public); `x2` turns
 * down Rome's corner on a side's strongest agent.
 */
export function chipHTML(cv, { ghost = false, x2 = false } = {}) {
  const marks = `${cv.partner ? `<i class="mk mk-partner" aria-hidden="true">${RINGS}</i>` : ''}${cv.placed ? `<i class="mk mk-placed" aria-hidden="true">${PIN}</i>` : ''}`;
  const notes = `${cv.partner ? ', an Accomplice’s partner' : ''}${cv.placed ? ', placed before the round' : ''}`;
  const tags = `${cv.partner ? ' partner' : ''}${cv.placed ? ' placed' : ''}`;
  if (!cv.kind) return `<div class="chip back own-${cv.owner}${tags}" data-uid="${cv.uid}" data-action="inspect" role="img" aria-label="Face-down agent${notes}"><span class="q" aria-hidden="true">?</span>${marks}</div>`;
  const a = AGENT[cv.kind];
  const muted = cv.tricks === false && a.text && !['heavy', 'sleeper'].includes(cv.kind);
  const classes = ['chip', `own-${cv.owner}`, `k-${cv.kind}`];
  if (cv.faceDown) classes.push('fd');
  if (ghost) classes.push('ghost');
  if (ghost && cv.locked) classes.push('locked');
  if (muted) classes.push('muted');
  if (x2) classes.push('x2');
  const label = `${a.name}, power ${cv.power}${cv.faceDown ? ', face down' : ''}${muted ? ', tricks switched off' : ''}${x2 ? ', counts double here' : ''}${notes}`;
  return `<div class="${classes.join(' ')}${tags}" data-uid="${cv.uid}" data-action="inspect" role="img" aria-label="${esc(label)}">
    <b class="pow${powClass(cv)}">${cv.power}</b><span class="art">${agentSVG(cv.kind)}</span><span class="nm">${esc(a.name)}</span>${cv.faceDown ? '<i class="fd-mark" aria-hidden="true"></i>' : ''}${x2 ? '<i class="x2c" aria-hidden="true">×2</i>' : ''}${marks}</div>`;
}

/** Characters of rule text past which a card in hand sets it smaller. */
const LONG_TEXT = 60;

/**
 * A card in your hand. A turned asset (a rival's agent that came over to you) says so, and so does
 * one a rival has seen (`seenBy`: their name). While an Accomplice asks for a partner, the other
 * cards are `candidate`s (their action is `partner`), and the one chosen (`mate`) is marked.
 */
export function cardHTML(cv, i, { selected = false, disabled = false, candidate = false, mate = false, seenBy = null } = {}) {
  const a = AGENT[cv.kind];
  const turned = cv.origin !== undefined && cv.origin !== cv.owner;
  // A long rule (the Wiretap's, the Decoy's) sets smaller, so it stays on the card.
  const cls = `card${selected ? ' sel' : ''}${turned ? ' turned-asset' : ''}${candidate ? ' candidate' : ''}${mate ? ' mate' : ''}${a.text.length > LONG_TEXT ? ' long' : ''} k-${cv.kind}`;
  const stamps = `${turned ? '<span class="stamp turned">Turned</span>' : ''}${seenBy ? '<span class="stamp seen">Seen</span>' : ''}${mate ? `<span class="stamp partner">${RINGS}Partner</span>` : ''}`;
  const label = `${a.name}, power ${a.power}${turned ? ', a turned asset' : ''}${seenBy ? `, seen by ${seenBy}` : ''}${candidate ? (mate ? ', the partner' : ', a possible partner') : ''}. ${a.text}`;
  return `<button class="${cls}" data-action="${candidate ? 'partner' : 'pick'}" data-uid="${cv.uid}" ${disabled ? 'disabled' : ''}
      aria-pressed="${candidate ? mate : selected}" aria-label="${esc(label)}">
    <b class="pow">${a.power}</b><span class="art">${agentSVG(cv.kind)}</span><span class="nm">${esc(a.name)}</span>
    <span class="tx">${esc(a.text)}</span>${stamps ? `<span class="stamps">${stamps}</span>` : ''}<kbd>${i + 1}</kbd></button>`;
}

/** Board-row slots: real cards (Rome's strongest, `x2`, with its corner), the ghosts of a pending drop, then empty sockets up to the city's capacity. */
function rowHTML(cards, capacity, ci, seat, ghosts = [], x2 = null) {
  const chips = cards.map((cv) => chipHTML(cv, { x2: cv.uid === x2 }));
  for (const g of ghosts) chips.push(chipHTML(g, { ghost: true }));
  const empty = Math.max(0, capacity - chips.length);
  return `<div class="row" data-row="${ci}-${seat}">${chips.join('')}${'<i class="slot" aria-hidden="true"></i>'.repeat(empty)}</div>`;
}

/**
 * A side's total on the plate. Reykjavik counts heads: there the total shows the side's number of
 * agents (public, face-down ones too), with its power in the title text.
 */
function totalHTML(city, seat, mine) {
  const hidden = city.hiddenCount[seat];
  const n = city.known[seat];
  if (city.id === 'reykjavik') {
    const count = city.sides[seat].length;
    const title = `${count} agent${count === 1 ? '' : 's'} here, power ${n}${hidden ? ' and more' : ''}`;
    return `<span class="total t-${seat}${mine ? ' me' : ''} count" data-total="${seat}" title="${title}">${count}</span>`;
  }
  return `<span class="total t-${seat}${mine ? ' me' : ''}" data-total="${seat}">${n}${hidden ? `<small>+?</small>` : ''}</span>`;
}

/** Rome: the side's strongest agent whose power this view knows (the first of equals), or null. */
function strongest(side) {
  let best = null;
  for (const cv of side) if (cv.power !== null && cv.power !== undefined && (!best || cv.power > best.power)) best = cv;
  return best?.uid ?? null;
}

const FACE_DOWN_GLOSS = { sleeper: `power ${AGENT.sleeper.power}`, tripwire: 'springs on the next agent to arrive', decoy: 'takes the next hit here' };
/** "a, b or c" */
const orList = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`);

/**
 * What a face-down agent you can't see could be, for the ticker when it is tapped: a card a rival
 * placed before the round (its kind is announced by the twist), an Accomplice's partner, anything in
 * Vienna or Casablanca, or else one of the face-down kinds in its owner's deck list.
 */
export function faceDownText(view, cv) {
  if (cv.placed) {
    const kind = view.twist?.kind;
    return `${view.names?.[cv.owner] ?? 'Your rival'} placed this ${kind ? AGENT[kind].name : 'agent'} before the round began.`;
  }
  if (cv.partner) return 'An Accomplice’s partner: it could be anything, with no tricks (unless it’s a Tripwire or a Decoy).';
  const city = cv.city !== null && cv.city !== undefined ? view.round.cities[cv.city] : null;
  if (city && (city.id === 'vienna' || city.id === 'casablanca')) return `Face-down agent in ${CITY[city.id].name}: it could be anything.`;
  const kinds = [...new Set(deckList(view, cv.owner))].filter((id) => AGENT[id].faceDown);
  if (!kinds.length) return 'Face-down agent: it could be anything.';
  return `Face-down agent: ${orList(kinds.map((id) => `a ${AGENT[id].name}${FACE_DOWN_GLOSS[id] ? ` (${FACE_DOWN_GLOSS[id]})` : ''}`))}.`;
}

/**
 * The Microfilm's canister: with its small label, as it sits on the film city's plate, or (with
 * `label: false`) as a decoration beside text that already names the film.
 */
export const canisterHTML = ({ label = true } = {}) =>
  label ? `<span class="canister" role="img" aria-label="Carries the Microfilm">${filmSVG()}<b>Film</b></span>` : `<span class="canister" aria-hidden="true">${filmSVG()}</span>`;

/**
 * One city column. `me` is the seat shown at the bottom. `ghost` ({ city, cvs }) shows the pending
 * drop (an Accomplice's with its partner) as ghosts; `choosing` highlights cities you can drop the
 * selected card in. The city carrying the Microfilm gets class `film` and the canister on its plate.
 * A wiretapper sees a "Tapped" slip, in the mark's colour, on the plate of the city its mark locked
 * (`tapFresh`: it has just appeared, so it comes in once).
 */
export function cityHTML(view, ci, me, { ghost = null, choosing = false, legalCities = [], tapFresh = false } = {}) {
  const city = view.round.cities[ci];
  const def = CITY[city.id];
  const them = rivalsOf(seatCount(view), me)[0]; // two-player: Phase 3 makes this a lane per rival
  const target = choosing && legalCities.includes(ci);
  const closedNow = !city.open && view.phase === 'plan';
  const leader = city.leader;
  const film = view.round.film === ci;
  const cls = ['city', `c-${city.id}`];
  if (film) cls.push('film');
  if (target) cls.push('target');
  if (closedNow) cls.push('closed');
  if (leader !== null && leader !== undefined) cls.push(leader === me ? 'lead-me' : 'lead-them');
  const keys = ['A', 'S', 'D'];
  const rome = city.id === 'rome';
  // One slip per mark: a `tap` twist and a Wiretap on the same mark give two identical entries.
  const marks = [...new Set((view.round.tapped || []).filter((t) => t.city === ci).map((t) => t.seat))];
  const taps = marks
    .map((s) => {
      const said = `Tapped: ${view.names?.[s] ?? 'your mark'} picked ${def.name}`;
      return `<span class="tapped own-${s}${tapFresh ? ' fresh' : ''}" role="img" aria-label="${esc(said)}" title="${esc(said)}">${PHONES}<b>Tapped</b></span>`;
    })
    .join('');
  const ghosts = ghost && ghost.city === ci ? ghost.cvs : [];
  return `<section class="${cls.join(' ')}" data-city="${ci}" ${target ? `data-action="city" role="button" tabindex="0" aria-label="Drop in ${esc(def.name)}"` : ''}>
    ${rowHTML(city.sides[them], city.capacity, ci, them, [], rome ? strongest(city.sides[them]) : null)}
    <div class="plate">
      <div class="sky" aria-hidden="true">${citySVG(city.id)}</div>
      ${film ? canisterHTML() : ''}
      ${taps}
      ${totalHTML(city, them, false)}
      <h3>${esc(def.name)}${target ? `<kbd>${keys[ci]}</kbd>` : ''}</h3>
      <p class="rule">${esc(def.rule)}</p>
      ${closedNow ? '<p class="shut">Closed</p>' : ''}
      ${totalHTML(city, me, true)}
    </div>
    ${rowHTML(city.sides[me], city.capacity, ci, me, ghosts, rome ? strongest(city.sides[me]) : null)}
  </section>`;
}

// ── reveal animation ────────────────────────────────────────────────────────

/** A reveal ignores taps this long after it starts: a stray tap from locking in can't skip it. */
export const REVEAL_GUARD_MS = 400;
/** The first tap after the guard plays the reveal this many times faster. */
export const FAST = 3;

/**
 * What a tap (or Space, Enter, Escape) does to a reveal that started at `at` and is playing at
 * `speed`, at time `now` (all from performance.now()): 'ignore' inside the guard, then 'fast',
 * then 'skip' once it is already fast.
 */
export function revealTap({ at, speed }, now) {
  if (now - at < REVEAL_GUARD_MS) return 'ignore';
  return speed >= FAST ? 'skip' : 'fast';
}

const NAME = (kind) => (kind ? AGENT[kind].name : 'a face-down agent');
const NUMBER = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];

/**
 * Plays `events` (from the new view) over the board currently rendered from the previous
 * view. `ctx` supplies: root (board element), me (seat at the bottom), names, cityName(ci),
 * cardOf(uid) (the card in the new view, if it is still on the board), wait(ms) (the reveal's
 * clock, which follows speed-ups and skips), dur(ms) (a WAAPI duration at the pace of the moment
 * it starts), cancelled(), say(text), sound(what, arg) (an effect of js/audio.js, or 'chord': the
 * spy chord on the final flip), shake(n), stake(n) (the Blackmailer raised the stake to n: show it
 * on the slip), reduced (prefers-reduced-motion: things move to their new places without gliding),
 * moment(kind) (a trick of that kind has just played, its agent still lit) and finale(result) for
 * the end of a round.
 */
export async function playEvents(events, ctx) {
  const { root, wait, say, sound } = ctx;
  const chipEl = (uid) => root.querySelector(`.chip[data-uid="${CSS.escape(uid)}"]`);
  const rowEl = (ci, seat) => root.querySelector(`.row[data-row="${ci}-${seat}"]`);
  /** [city, seat] of the row a chip sits in on screen: its owner before this event, whatever the new view says. */
  const rowOf = (el) => el?.closest('.row')?.dataset.row.split('-').map(Number) ?? null;
  /** The kind a chip on screen shows (its k- class), or null for a back. */
  const kindOn = (el) => [...el.classList].find((c) => c.startsWith('k-'))?.slice(2) ?? null;
  const you = (s) => s === ctx.me && ctx.names[s] === 'You';
  const whose = (s) => (you(s) ? 'Your' : `${ctx.names[s]}’s`);
  const faceFor = (uid, kind, owner, faceDown) => {
    const next = ctx.cardOf(uid);
    const power = next && next.kind === kind && next.power !== null ? next.power : AGENT[kind].power;
    const cv = { uid, kind, owner, power, base: AGENT[kind].power, faceDown: !!faceDown, tricks: next?.tricks ?? true };
    if (next?.partner) cv.partner = true;
    if (next?.placed) cv.placed = true;
    return cv;
  };
  const placeInRow = (row, el) => {
    const slot = row.querySelector('.slot');
    if (slot) slot.replaceWith(el);
    else row.append(el);
  };
  const html = (s) => {
    const t = document.createElement('template');
    t.innerHTML = s.trim();
    return t.content.firstElementChild;
  };
  /**
   * While it moves, an element rides above the city plates and the other rows (`.gliding`), so a chip
   * crossing upward passes over the plate as one crossing downward does (a top row comes before its
   * plate on the page, so it would otherwise slide under it).
   */
  const lift = (el, anim) => {
    el.classList.add('gliding');
    anim.onfinish = anim.oncancel = () => el.classList.remove('gliding');
  };
  /** Animate an element from the box `from` (its old place) to where it is now (FLIP); nothing moves under reduced motion. */
  const slide = (el, from, ms) => {
    if (ctx.reduced) return;
    const b = el.getBoundingClientRect();
    lift(el, el.animate([{ transform: `translate(${from.left - b.left}px, ${from.top - b.top}px)` }, { transform: 'none' }], { duration: ctx.dur(ms), easing: 'cubic-bezier(.2,.8,.2,1)' }));
  };
  /** Move an element to a new parent, animating from where it was. */
  const glide = async (el, parent, ms = 420) => {
    const a = el.getBoundingClientRect();
    placeInRow(parent, el);
    slide(el, a, ms);
    await wait(ms);
  };
  const flipTo = async (el, cv) => {
    el.classList.add('flipping');
    sound('flip');
    await wait(140);
    const fresh = html(chipHTML(cv));
    fresh.classList.add('flipped-in');
    el.replaceWith(fresh);
    await wait(260);
    return fresh;
  };
  /** A face-down chip turns face up: a rival's back, or (`own`) your own face-down card too. */
  const reveal = async (uid, kind, own) => {
    const el = chipEl(uid);
    if (el && (el.classList.contains('back') || (own && el.classList.contains('fd')))) await flipTo(el, faceFor(uid, kind, rowOf(el)?.[1] ?? ctx.ownerOf(uid), false));
  };
  const remove = async (uid, why) => {
    const el = chipEl(uid);
    if (!el) return;
    el.classList.add('taken');
    sound('out', why);
    await wait(460);
    el.replaceWith(html('<i class="slot" aria-hidden="true"></i>'));
  };
  /** A Decoy takes a hit meant for `saved`: it turns face up (its `out`, if any, follows as an event). */
  const decoy = async (e) => {
    sound('trick', 'decoy');
    say(`A Decoy takes the hit for ${NAME(ctx.kindOf(e.saved))}.`);
    const el = chipEl(e.uid);
    if (el) await flipTo(el, faceFor(e.uid, 'decoy', rowOf(el)?.[1] ?? ctx.ownerOf(e.uid), false));
    await wait(380);
  };
  /**
   * Cards change sides on screen, all at once: each `{ uid, to, row }` leaves its chip for a fresh one
   * in `to`'s colour, face up. With `row`, it lands in that row; otherwise the chips trade places.
   */
  const crossOver = async (moves, ms) => {
    const live = moves.map((m) => ({ ...m, el: chipEl(m.uid) })).filter((m) => m.el);
    const from = live.map((m) => m.el.getBoundingClientRect());
    const fresh = live.map((m) => {
      const kind = ctx.kindOf(m.uid) || kindOn(m.el);
      return html(chipHTML(kind ? faceFor(m.uid, kind, m.to, false) : { uid: m.uid, owner: m.to, kind: null }));
    });
    if (live.length === 2 && !live[0].row) {
      // Trade places: each fresh chip goes where the other one was.
      const [a, b] = live;
      b.el.replaceWith(fresh[0]);
      a.el.replaceWith(fresh[1]);
    } else {
      // Leave first, then land, so a full row has room for its newcomer.
      for (const m of live) m.el.replaceWith(html('<i class="slot" aria-hidden="true"></i>'));
      live.forEach((m, k) => m.row && placeInRow(m.row, fresh[k]));
    }
    fresh.forEach((el, k) => el.isConnected && slide(el, from[k], ms));
    await wait(ms);
  };

  // 1. Both drops land together, face down, then flip together. An Accomplice's partner is a second
  // drop: it lands beside it, face down, with the partner's rings.
  const drops = events.filter((e) => e.t === 'drop');
  const landed = [];
  for (const d of drops) {
    const row = rowEl(d.city, d.seat);
    if (!row) continue;
    const el = html(chipHTML({ uid: d.uid, owner: d.seat, kind: null, partner: !!d.partnerOf }));
    el.classList.add(d.seat === ctx.me ? 'land-me' : 'land-them');
    placeInRow(row, el);
    landed.push({ d, el });
  }
  for (const e of events.filter((x) => x.t === 'pass')) say(`${ctx.names[e.seat]} has nowhere to drop and passes.`);
  if (landed.length) {
    sound('drop');
    await wait(520);
    sound('slam');
    // The final flip (the round ends with this turn): the spy chord rings out as the cards land.
    if (events.some((e) => e.t === 'round')) sound('chord');
    ctx.shake(1);
    await wait(160);
    await Promise.all(
      landed.map(async ({ d, el }) => {
        if (d.kind) await flipTo(el, { ...faceFor(d.uid, d.kind, d.seat, d.faceDown), ...(d.partnerOf ? { partner: true } : {}) });
      }),
    );
    const secret = landed.filter(({ d }) => !d.kind);
    if (secret.length)
      say(
        secret
          .map(({ d }) => (d.partnerOf ? `${whose(d.seat)} Accomplice brings a partner, face down.` : `${ctx.names[d.seat]} drops an agent face down in ${ctx.cityName(d.city)}.`))
          .join(' '),
      );
    await wait(320);
  }

  // 2. Traps, tricks and takedowns, one at a time. Some events are played as part of the one
  // before them (an Interrogator's reveals, a Decoy standing in for a Turncoat's target): `done`.
  const done = new Set();
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (ctx.cancelled?.()) return;
    if (done.has(e)) continue;
    switch (e.t) {
      case 'tripwire': {
        const el = chipEl(e.uid);
        if (el) await flipTo(el, faceFor(e.uid, 'tripwire', ctx.ownerOf(e.uid), false));
        say(`Tripwire! ${NAME(ctx.kindOf(e.victim))} walks into it in ${ctx.cityName(e.city)}.`);
        sound('trick', 'tripwire');
        await wait(500);
        break;
      }
      case 'trick': {
        const el = chipEl(e.uid);
        el?.classList.add('acting');
        sound('trick', e.kind);
        const [here, owner] = rowOf(el) ?? [null, ctx.ownerOf(e.uid)];
        if (e.kind === 'lookout') say(`${whose(owner)} Lookout draws a card.`);
        if (e.kind === 'assassin') say(e.target ? `Assassin takes aim at ${NAME(ctx.kindOf(e.target))}.` : 'Assassin finds nobody to hit.');
        if (e.kind === 'impostor') {
          if (e.as && el) {
            say(`Impostor becomes a ${AGENT[e.as].name}.`);
            await wait(260);
            await flipTo(el, faceFor(e.uid, e.as, owner, false));
          } else say('Impostor has nobody to copy.');
        }
        if (e.kind === 'double') {
          if (e.to !== null && e.to !== undefined && el) {
            say(`Double Agent slips across to ${ctx.cityName(e.to)}.`);
            await glide(el, rowEl(e.to, owner));
          } else say('Double Agent stays put.');
        }
        if (e.kind === 'getaway') {
          if (e.target) {
            say(`Getaway pulls ${NAME(ctx.kindOf(e.target))} out, back to the hand.`);
            const t = chipEl(e.target);
            if (t) {
              t.classList.add('pulled', ctx.ownerOf(e.target) === ctx.me ? 'to-me' : 'to-them');
              await wait(420);
              t.replaceWith(html('<i class="slot" aria-hidden="true"></i>'));
            }
          } else say('Getaway has nobody to pull out.');
        }
        if (e.kind === 'interrogator') {
          // The lamp goes on, and every face-down rival agent here turns over while it shines.
          const n = e.revealed?.length ?? 0;
          say(n ? `Interrogator: ${n === 1 ? 'a face-down agent talks' : `${NUMBER[n] ?? n} face-down agents talk`}.` : 'Interrogator finds nobody to question.');
          await wait(300);
          for (let j = i + 1; j < events.length && events[j].t === 'reveal' && events[j].by === 'interrogator'; j++) {
            done.add(events[j]);
            await reveal(events[j].uid, events[j].kind, true);
          }
        }
        if (e.kind === 'turncoat') {
          if (e.target) {
            say(`Turncoat swaps sides with ${NAME(ctx.kindOf(e.target))}.`);
            // A face-down Decoy may stand in for the target: it turns over first, and it is the one that changes sides.
            const next = events[i + 1];
            let turned = e.target;
            if (next?.t === 'decoy' && next.saved === e.target) {
              done.add(next);
              await decoy(next);
              turned = next.uid;
            }
            await crossOver([{ uid: e.uid, to: e.to }, { uid: turned, to: owner }], 520);
          } else say('Turncoat finds nobody to turn.');
        }
        if (e.kind === 'courier') {
          const moved = e.moved ? chipEl(e.moved) : null;
          if (e.moved) {
            say(`Courier brings ${NAME(ctx.kindOf(e.moved))} over from ${ctx.cityName(e.from)}.`);
            const row = here === null ? null : rowEl(here, owner);
            if (moved && row) await glide(moved, row, 480);
          } else say('Courier has nobody to bring.');
        }
        if (e.kind === 'blackmailer') {
          if (e.stake !== null && e.stake !== undefined) {
            await wait(220);
            say(`${whose(owner)} Blackmailer: the stake doubles to ${e.stake}.`);
            sound('escalate');
            ctx.stake?.(e.stake);
          } else say('Blackmailer: the stake has already gone up this round.');
        }
        if (e.kind === 'wiretap') {
          if (e.turn === null || e.turn === undefined) say(`${whose(owner)} Wiretap is in, but there is no next turn to listen to.`);
          else if (you(owner)) say(`Your Wiretap is in: next turn you’ll hear which city ${ctx.names[e.on]} picks.`);
          else say(`${whose(owner)} Wiretap is in: next turn they’ll hear which city ${you(e.on) ? 'you pick' : `${ctx.names[e.on]} picks`}.`);
        }
        // The trick has played: a debug hold (__game.holdAt) can stop the reveal here, still lit.
        ctx.moment?.(e.kind);
        await wait(560);
        el?.classList.remove('acting');
        break;
      }
      case 'decoy':
        await decoy(e);
        break;
      case 'out':
        // After a Decoy stood in, its own line has said what happened.
        if (e.cause === 'tangier' && !(events[i - 1]?.t === 'decoy' && events[i - 1].uid === e.uid)) say(`Tangier: ${NAME(e.kind)} is taken out.`);
        await remove(e.uid, e.cause);
        break;
      case 'draw':
        if (e.why === 'hongkong') say(`Hong Kong: ${ctx.names[e.seat]} draws a card.`);
        break;
      case 'havana': {
        say('Havana: everyone there switches sides!');
        sound('swap');
        const top = rowEl(e.city, rivalsOf(ctx.names.length, ctx.me)[0]); // two-player: Phase 3 makes this a lane per rival
        const bottom = rowEl(e.city, ctx.me);
        if (top && bottom && !ctx.reduced) {
          const [a, b] = [top.getBoundingClientRect(), bottom.getBoundingClientRect()];
          lift(top, top.animate([{ transform: 'none' }, { transform: `translateY(${b.top - a.top}px)` }], { duration: ctx.dur(600), easing: 'ease-in-out' }));
          lift(bottom, bottom.animate([{ transform: 'none' }, { transform: `translateY(${a.top - b.top}px)` }], { duration: ctx.dur(600), easing: 'ease-in-out' }));
        }
        await wait(650);
        break;
      }
      case 'bridge': {
        // Each side's strongest crosses to the next seat round the table (two players: they pass each other), face up.
        say(`${ctx.cityName(e.city)}: the strongest agents cross over.`);
        sound('swap');
        await crossOver(
          e.moves.map((m) => ({ uid: m.uid, to: m.to, row: rowEl(e.city, m.to) })),
          650,
        );
        await wait(150);
        break;
      }
      case 'reveal': {
        // Prague turns a batch over at once: one line for it.
        if (e.by === 'prague' && events[i - 1]?.by !== 'prague') say('Prague: every cover here is blown.');
        await reveal(e.uid, e.kind, !!e.by);
        break;
      }
      case 'round':
        await ctx.finale(e);
        break;
    }
  }
}
