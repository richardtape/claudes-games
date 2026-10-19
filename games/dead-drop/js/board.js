// The table on screen: cities, agents (chips on the board, cards in hand) and the reveal
// animation that plays a turn's events over the board before it re-renders from the new view.
import { AGENT, CITY } from './data.js';
import { agentSVG, citySVG } from './art.js';

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const $ = (sel, root = document) => root.querySelector(sel);

/** Power badge classes: boosted or weakened compared to the printed number. */
function powClass(cv) {
  if (cv.power === null || cv.base === null) return '';
  return cv.power > cv.base ? ' up' : cv.power < cv.base ? ' down' : '';
}

/** A card on the board. Rival face-down cards show their back. */
export function chipHTML(cv, { ghost = false } = {}) {
  if (!cv.kind) return `<div class="chip back own-${cv.owner}" data-uid="${cv.uid}" data-action="inspect" role="img" aria-label="Face-down agent"><span class="q" aria-hidden="true">?</span></div>`;
  const a = AGENT[cv.kind];
  const muted = cv.tricks === false && a.text && !['heavy', 'sleeper'].includes(cv.kind);
  const classes = ['chip', `own-${cv.owner}`, `k-${cv.kind}`];
  if (cv.faceDown) classes.push('fd');
  if (ghost) classes.push('ghost');
  if (ghost && cv.locked) classes.push('locked');
  if (muted) classes.push('muted');
  const label = `${a.name}, power ${cv.power}${cv.faceDown ? ', face down' : ''}${muted ? ', tricks switched off' : ''}`;
  return `<div class="${classes.join(' ')}" data-uid="${cv.uid}" data-action="inspect" role="img" aria-label="${esc(label)}">
    <b class="pow${powClass(cv)}">${cv.power}</b><span class="art">${agentSVG(cv.kind)}</span><span class="nm">${esc(a.name)}</span>${cv.faceDown ? '<i class="fd-mark" aria-hidden="true"></i>' : ''}</div>`;
}

/** A card in your hand. A turned asset (a rival's agent that came over to you) says so. */
export function cardHTML(cv, i, { selected = false, disabled = false } = {}) {
  const a = AGENT[cv.kind];
  const turned = cv.origin !== undefined && cv.origin !== cv.owner;
  return `<button class="card${selected ? ' sel' : ''}${turned ? ' turned-asset' : ''} k-${cv.kind}" data-action="pick" data-uid="${cv.uid}" ${disabled ? 'disabled' : ''}
      aria-pressed="${selected}" aria-label="${esc(`${a.name}, power ${a.power}${turned ? ', a turned asset' : ''}. ${a.text}`)}">
    <b class="pow">${a.power}</b><span class="art">${agentSVG(cv.kind)}</span><span class="nm">${esc(a.name)}</span>
    <span class="tx">${esc(a.text)}</span>${turned ? '<span class="turned">Turned</span>' : ''}<kbd>${i + 1}</kbd></button>`;
}

/** Board-row slots: real cards plus empty sockets up to the city's capacity. */
function rowHTML(cards, capacity, ci, seat, ghost) {
  const chips = cards.map((cv) => chipHTML(cv));
  if (ghost) chips.push(chipHTML(ghost, { ghost: true }));
  const empty = Math.max(0, capacity - chips.length);
  return `<div class="row" data-row="${ci}-${seat}">${chips.join('')}${'<i class="slot" aria-hidden="true"></i>'.repeat(empty)}</div>`;
}

function totalHTML(city, seat, mine) {
  const hidden = city.hiddenCount[seat];
  const n = city.known[seat];
  return `<span class="total t-${seat}${mine ? ' me' : ''}" data-total="${seat}">${n}${hidden ? `<small>+?</small>` : ''}</span>`;
}

/**
 * One city column. `me` is the seat shown at the bottom. `plan` (uid, city) shows the
 * pending drop as a ghost; `choosing` highlights cities you can drop the selected card in.
 */
export function cityHTML(view, ci, me, { ghost = null, choosing = false, legalCities = [] } = {}) {
  const city = view.round.cities[ci];
  const def = CITY[city.id];
  const them = 1 - me;
  const target = choosing && legalCities.includes(ci);
  const closedNow = !city.open && view.phase === 'plan';
  const leader = city.leader;
  const cls = ['city', `c-${city.id}`];
  if (target) cls.push('target');
  if (closedNow) cls.push('closed');
  if (leader !== null && leader !== undefined) cls.push(leader === me ? 'lead-me' : 'lead-them');
  const keys = ['A', 'S', 'D'];
  return `<section class="${cls.join(' ')}" data-city="${ci}" ${target ? `data-action="city" role="button" tabindex="0" aria-label="Drop in ${esc(def.name)}"` : ''}>
    ${rowHTML(city.sides[them], city.capacity, ci, them, null)}
    <div class="plate">
      <div class="sky" aria-hidden="true">${citySVG(city.id)}</div>
      ${totalHTML(city, them, false)}
      <h3>${esc(def.name)}${target ? `<kbd>${keys[ci]}</kbd>` : ''}</h3>
      <p class="rule">${esc(def.rule)}</p>
      ${closedNow ? '<p class="shut">Closed</p>' : ''}
      ${totalHTML(city, me, true)}
    </div>
    ${rowHTML(city.sides[me], city.capacity, ci, me, ghost && ghost.city === ci ? ghost.cv : null)}
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

/**
 * Plays `events` (from the new view) over the board currently rendered from the previous
 * view. `ctx` supplies: root (board element), me (seat at the bottom), names, cityName(ci),
 * cardOf(uid) (the card in the new view, if it is still on the board), wait(ms) (the reveal's
 * clock, which follows speed-ups and skips), dur(ms) (a WAAPI duration at the pace of the moment
 * it starts), cancelled(), say(text), sound(what, arg) (an effect of js/audio.js, or 'chord': the
 * spy chord on the final flip), shake(n), and finale(result) for the end of a round.
 */
export async function playEvents(events, ctx) {
  const { root, wait, say, sound } = ctx;
  const chipEl = (uid) => root.querySelector(`.chip[data-uid="${CSS.escape(uid)}"]`);
  const rowEl = (ci, seat) => root.querySelector(`.row[data-row="${ci}-${seat}"]`);
  const faceFor = (uid, kind, owner, faceDown) => {
    const next = ctx.cardOf(uid);
    const power = next && next.kind === kind && next.power !== null ? next.power : AGENT[kind].power;
    return { uid, kind, owner, power, base: AGENT[kind].power, faceDown: !!faceDown, tricks: next?.tricks ?? true };
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
  /** Move an element to a new parent, animating from where it was (FLIP). */
  const glide = async (el, parent, ms = 420) => {
    const a = el.getBoundingClientRect();
    placeInRow(parent, el);
    const b = el.getBoundingClientRect();
    el.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }], { duration: ctx.dur(ms), easing: 'cubic-bezier(.2,.8,.2,1)' });
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
  const remove = async (uid, why) => {
    const el = chipEl(uid);
    if (!el) return;
    el.classList.add('taken');
    sound('out', why);
    await wait(460);
    el.replaceWith(html('<i class="slot" aria-hidden="true"></i>'));
  };

  // 1. Both drops land together, face down, then flip together.
  const drops = events.filter((e) => e.t === 'drop');
  const landed = [];
  for (const d of drops) {
    const row = rowEl(d.city, d.seat);
    if (!row) continue;
    const el = html(chipHTML({ uid: d.uid, owner: d.seat, kind: null }));
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
        if (d.kind) await flipTo(el, faceFor(d.uid, d.kind, d.seat, d.faceDown));
      }),
    );
    const secret = landed.filter(({ d }) => !d.kind);
    if (secret.length) say(secret.map(({ d }) => `${ctx.names[d.seat]} drops an agent face down in ${ctx.cityName(d.city)}.`).join(' '));
    await wait(320);
  }

  // 2. Traps, tricks and takedowns, one at a time.
  for (const e of events) {
    if (ctx.cancelled?.()) return;
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
        if (e.kind === 'lookout') say(`${ctx.names[ctx.ownerOf(e.uid)]}’s Lookout draws a card.`);
        if (e.kind === 'assassin') say(e.target ? `Assassin takes aim at ${NAME(ctx.kindOf(e.target))}.` : 'Assassin finds nobody to hit.');
        if (e.kind === 'impostor') {
          if (e.as && el) {
            say(`Impostor becomes a ${AGENT[e.as].name}.`);
            await wait(260);
            await flipTo(el, faceFor(e.uid, e.as, ctx.ownerOf(e.uid), false));
          } else say('Impostor has nobody to copy.');
        }
        if (e.kind === 'double') {
          if (e.to !== null && e.to !== undefined && el) {
            say(`Double Agent slips across to ${ctx.cityName(e.to)}.`);
            await glide(el, rowEl(e.to, ctx.ownerOf(e.uid)));
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
        await wait(560);
        el?.classList.remove('acting');
        break;
      }
      case 'out':
        if (e.cause === 'tangier') say(`Tangier: ${NAME(e.kind)} is taken out.`);
        await remove(e.uid, e.cause);
        break;
      case 'draw':
        if (e.why === 'hongkong') say(`Hong Kong: ${ctx.names[e.seat]} draws a card.`);
        break;
      case 'havana': {
        say('Havana: everyone there switches sides!');
        sound('swap');
        const top = rowEl(e.city, 1 - ctx.me);
        const bottom = rowEl(e.city, ctx.me);
        if (top && bottom) {
          const [a, b] = [top.getBoundingClientRect(), bottom.getBoundingClientRect()];
          top.animate([{ transform: 'none' }, { transform: `translateY(${b.top - a.top}px)` }], { duration: ctx.dur(600), easing: 'ease-in-out' });
          bottom.animate([{ transform: 'none' }, { transform: `translateY(${a.top - b.top}px)` }], { duration: ctx.dur(600), easing: 'ease-in-out' });
        }
        await wait(650);
        break;
      }
      case 'reveal': {
        const el = chipEl(e.uid);
        if (el && el.classList.contains('back')) await flipTo(el, faceFor(e.uid, e.kind, ctx.ownerOf(e.uid), false));
        break;
      }
      case 'round':
        await ctx.finale(e);
        break;
    }
  }
}
