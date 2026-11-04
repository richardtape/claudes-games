import { homeLink, markReady, recordBest, recordPlay, store, reducedMotion } from '../../../shared/arcade.js';
import { floatText, shake, toast } from '../../../shared/juice.js';
import { createLoop } from '../../../shared/loop.js';
import { dailySeed } from '../../../shared/rng.js';
import * as E from './engine.js';
import { ACT_TIMES, LAYOUTS, PERK, SHELL, SHELLS, TWIST } from './data.js';
import { createSky, SUIT_COLOUR } from './sky.js';
import { createAudio } from './audio.js';
import { backHTML, cardName, faceHTML, pip, suitSprite, tubeHTML } from './cards.js';
import { chooseMove } from './bot.js';
import { drawProgramme, drawSpecimen } from './programme.js';

const SLUG = 'touch-paper';
const saved = store(SLUG);
const audio = createAudio(SLUG);
const { sfx } = audio;
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const SAVE_V = 1;

let state = null;
const ui = {
  screen: 'title', // title | play | report | shed | end
  shownTotal: 0,
  pending: 0, // volleys still going up
  instant: false, // tests: skip every animation
  slowArmed: false,
  ending: false,
  intro: false,
  modal: null,
  lastSeq: -1,
  demo: true, // title-screen fireworks
  keyHints: [],
  finaleFired: false,
  nameRow: 0, // staggers shell names when volleys overlap
};

// ---------- the sky ----------
const glowEl = $('#glow');
const sky = createSky({
  scenery: $('#scenery'),
  canvas: $('#sky'),
  onFlash(color, x, y, strength) {
    if (ui.instant) return;
    const rgb = { red: '255,70,60', gold: '255,180,60', green: '80,230,120', blue: '90,140,255', white: '230,230,255' }[color] || '255,180,60';
    glowEl.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(${rgb},0.55), rgba(${rgb},0.12) 45%, rgba(${rgb},0) 80%)`;
    glowEl.getAnimations().forEach((a) => a.cancel());
    glowEl.animate([{ opacity: strength * 0.55 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' });
  },
});

let demoClock = 0;
const loop = createLoop({
  update(dt) {
    sky.update(dt);
    if (ui.demo && !ui.instant) {
      demoClock -= dt;
      if (demoClock <= 0) {
        demoClock = 0.7 + Math.random() * 1.4;
        const kinds = ['shell', 'shell', 'peony', 'willow', 'ring', 'palm', 'crossette', 'chrysanthemum', 'brocade', 'strobe'];
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        const color = SUIT_COLOUR[Math.floor(Math.random() * 4)];
        sky.launch({ kind, color, size: 0.8 + Math.random() * 0.5, onBurst: () => audioOk() && audio.burst(0, { size: 0.6, crackle: 3 }) });
        if (audioOk()) audio.launch(0);
      }
    }
  },
  render(dt) {
    sky.render(dt);
  },
});
const audioOk = () => !document.hidden && ui.screen === 'title' && !ui.instant;

// ---------- layout metrics ----------
const app = $('#app');
const tableauEl = $('#tableau');
const benchEl = $('#bench');
const topEl = $('#top');
const skyArea = $('#skyArea');
const screenEl = $('#screen');
const modalEl = $('#modal');

function measure() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const phone = vw < 700;
  // Wide screens put the bench beside the layout, so the sky gets the height.
  const wide = !phone && vw >= 980 && vw / vh >= 1.15;
  const info = E.layoutInfo(state?.layoutId || 'finale');
  const maxRows = 6; // every layout is at most five lines (six half-cards tall)
  const header = phone ? 46 : 52;
  const skyMin = vh * (phone ? 0.22 : wide ? 0.4 : 0.3);
  // readout line, labels under the cards and padding (plus the rack's own row on phones)
  const benchExtra = phone ? 128 : 78;
  let ch;
  if (wide) {
    const byWidth = ((vw - 150) / 12.4) * 1.4;
    const byHeight = (vh - header - skyMin - 30) / (maxRows / 2);
    ch = Math.floor(Math.min(byWidth, byHeight, 150));
  } else {
    const byWidth = (Math.min(vw - 16, 780) / 7) * 1.4;
    const byHeight = (vh - header - skyMin - benchExtra - 24) / (maxRows / 2 + 1);
    ch = Math.floor(Math.min(byWidth, byHeight, 150));
  }
  ch = Math.max(56, ch);
  const cw = Math.floor(ch / 1.4);
  const root = document.documentElement.style;
  root.setProperty('--cw', `${cw}px`);
  root.setProperty('--ch', `${ch}px`);
  root.setProperty('--tab-w', `${(info.cols * cw) / 2}px`);
  root.setProperty('--tab-h', `${(maxRows * ch) / 2}px`);
  document.body.classList.toggle('phone', phone);
  document.body.classList.toggle('wide', wide);
  // position the cards
  [...tableauEl.children].forEach((el) => {
    const slot = info.slots[Number(el.dataset.slot)];
    if (!slot) return;
    el.style.left = `${(slot.col * cw) / 2}px`;
    el.style.top = `${(slot.row * ch) / 2}px`;
  });
  requestAnimationFrame(() => {
    const r = skyArea.getBoundingClientRect();
    const pr = $('#patio').getBoundingClientRect();
    sky.layout({ skyRect: { x: r.left, y: r.top + Math.min(70, r.height * 0.2), w: r.width, h: r.height * 0.8 }, horizon: Math.round(pr.top + 4) });
    $('#say').style.top = `${Math.max(r.top + 96, pr.top - 46)}px`;
  });
}
window.addEventListener('resize', () => measure());

// ---------- rendering ----------
function renderTop() {
  if (!state || ui.screen === 'title') {
    topEl.innerHTML = `<div class="top-left" id="homeSlot"></div><div class="top-mid"></div>${topButtons()}`;
  } else {
    const act = state.act;
    const twist = E.twistOf(state);
    const tw = twist ? TWIST[twist] : null;
    const twText = tw ? (twist === 'damp' ? `Damp ${['red', 'gold', 'green', 'blue'][state.dampSuit]} shells: they score nothing` : tw.text) : '';
    topEl.innerHTML = `<div class="top-left" id="homeSlot"></div>
      <div class="top-mid"><span class="act-time">${ACT_TIMES[act]} pm</span> <span class="act-name">${esc(LAYOUTS[act].name)}</span>
      ${tw ? `<button class="cond" data-action="cond" title="${esc(twText)}">${esc(tw.name)}</button>` : ''}
      ${state.daily ? '<span class="daily-tag">Tonight’s display</span>' : ''}</div>
      ${topButtons()}`;
  }
  homeLink({ parent: $('#homeSlot') });
}
const topButtons = () => `<div class="top-right">
  <button class="icon-btn" data-action="book" aria-label="Pattern book" title="Pattern book (B)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-5a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h6z"/></svg></button>
  <button class="icon-btn" data-action="help" aria-label="How to play" title="How to play (H)"><span aria-hidden="true">?</span></button>
  <button class="icon-btn" data-action="mute" aria-label="${sfx.muted ? 'Unmute' : 'Mute'}" title="Sound (M)">${sfx.muted ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM16 8a5 5 0 0 1 0 8M18.5 5.5a8.5 8.5 0 0 1 0 13"/></svg>'}</button>
</div>`;

function renderGauge() {
  let g = $('#gauge');
  if (!state || ui.screen === 'title') {
    g?.remove();
    return;
  }
  if (!g) {
    g = document.createElement('div');
    g.id = 'gauge';
    g.className = 'gauge';
    skyArea.append(g);
  }
  const target = E.targetFor(state);
  const prev = state.act > 0 ? E.targetFor(state, state.act - 1) : 0;
  const shown = Math.round(ui.shownTotal);
  const k = Math.max(0, Math.min(1, (shown - prev) / Math.max(1, target - prev)));
  const done = shown >= target;
  g.classList.toggle('done', done);
  g.innerHTML = `<div class="g-num"><span id="gNum">${fmt(shown)}</span> <span class="g-unit">oohs</span></div>
    <div class="g-fuse" aria-hidden="true"><span class="g-burnt" style="width:${(k * 100).toFixed(1)}%"></span><span class="g-spark" style="left:${(k * 100).toFixed(1)}%"></span></div>
    <div class="g-of">${done ? `The crowd’s happy: ${fmt(target)} by ${endTime(state.act)}` : `The crowd wants ${fmt(target)} by ${endTime(state.act)}`}</div>`;
}
const endTime = (act) => (act < 4 ? ACT_TIMES[act + 1] : '9:30');

function buildTableau() {
  const info = E.layoutInfo(state.layoutId);
  tableauEl.innerHTML = info.slots
    .map((_, i) => `<button class="card slot" data-slot="${i}" aria-label="Face-down card"><div class="inner">${faceHTML(state.slots[i].card)}${backHTML()}</div><span class="key" aria-hidden="true"></span></button>`)
    .join('');
  tableauEl.dataset.layout = state.layoutId;
  measure();
  updateTableau();
}

function updateTableau() {
  const plays = new Set(E.legalPlays(state));
  const order = [...plays].sort((a, b) => keyOrder(a) - keyOrder(b));
  ui.keyHints = order;
  state.slots.forEach((s, i) => {
    const el = tableauEl.children[i];
    if (!el) return;
    el.classList.toggle('up', s.up);
    el.classList.toggle('gone', s.gone);
    const open = !s.gone && E.isOpen(state, i);
    el.classList.toggle('open', open);
    el.classList.toggle('playable', plays.has(i));
    el.disabled = s.gone;
    el.setAttribute('aria-label', s.gone ? 'Played' : s.up ? `${cardName(s.card)}${plays.has(i) ? ', plays' : open ? '' : ', covered'}` : 'Face-down card');
    const k = order.indexOf(i);
    el.querySelector('.key').textContent = k >= 0 && k < 9 ? String(k + 1) : '';
  });
}
function keyOrder(i) {
  const s = E.layoutInfo(state.layoutId).slots[i];
  return s.col * 100 + s.row;
}

function renderBench() {
  if (!state) {
    benchEl.innerHTML = '';
    return;
  }
  const fired = ui.finaleFired; // the box went up in the finale: show it empty
  const hand = fired ? [] : E.hand(state);
  const handFits = new Set(fired ? [] : E.legalHandPlays(state));
  const rest = fired ? 0 : state.box.length - hand.length;
  const v = state.volley;
  const sc = v.length ? E.scoreVolley(state) : null;
  const canSlow = E.canSlow(state);
  if (!canSlow) ui.slowArmed = false;
  const keys = ['Z', 'X', 'C'];
  const handHTML = hand
    .map((c, k) => {
      const fits = handFits.has(k) && !ui.slowArmed;
      const verb = fits ? 'Add' : 'Light';
      return `<button class="card up hand ${fits ? 'fits' : 'strike'}${ui.slowArmed ? ' slow' : ''}" data-hand="${k}" style="--k:${k}" aria-label="${esc(cardName(c))}: ${fits ? 'add it to the volley' : ui.slowArmed ? 'strike it with the slow match' : 'strike it to light the volley'}">
        <div class="inner">${faceHTML(c)}</div><span class="verb">${verb}</span><span class="key" aria-hidden="true">${keys[k]}</span></button>`;
    })
    .join('');
  const tubes = Array.from({ length: E.RACK }, (_, i) => (v[i] ? tubeHTML(v[i].c, i) : `<div class="tube empty" style="--i:${i}"></div>`)).join('');
  const readout = sc
    ? `<span class="r-sum">Volley of ${v.length}: <b>${fmt(sc.base)}</b> × <b>${sc.lift}</b> = <b class="r-total">${fmt(sc.score)}</b></span>${
        sc.dud ? '<span class="chip dud">fizzles</span>' : ''
      }${sc.patterns.map((p) => `<span class="chip pat">${SHELL[p.id].name} +${p.bonus}</span>`).join('')}${sc.extras
        .map((p) => `<span class="chip">${p.id === 'crowd' ? 'Big crowd' : 'Black powder'} +1</span>`)
        .join('')}`
    : `<span class="r-hint">${hint()}</span>`;
  benchEl.innerHTML = `
    <div class="readout" id="readout">${readout}</div>
    <div class="bench-row">
      <div class="box" aria-label="${rest} more cards in the box" title="Cards left in the box"><div class="box-stack"${rest ? '' : ' data-empty="1"'}></div><span class="box-n">${rest}</span></div>
      <div class="hand-fan" role="group" aria-label="Your hand">${handHTML || '<span class="empty-hand">Box empty</span>'}</div>
      <div class="fuse-wrap"><div class="card up fuse" id="fuse" aria-label="Fuse: ${esc(cardName(state.fuse))}"><div class="inner">${faceHTML(state.fuse)}</div><span class="ember" aria-hidden="true"></span></div><span class="fuse-label">Fuse</span></div>
      <div class="rack-wrap">
        <div class="rack" id="rack" aria-label="Rack: ${v.length} of ${E.RACK} shells">${tubes}</div>
        ${E.has(state, 'slowmatch') ? `<button class="slow-btn${ui.slowArmed ? ' armed' : ''}" data-action="slow" ${canSlow ? '' : 'disabled'}>Slow match</button>` : ''}
      </div>
    </div>`;
}

function hint() {
  if (!state) return '';
  if (state.phase !== 'play') return '';
  const plays = E.legalPlays(state).length + E.legalHandPlays(state).length;
  if (E.isWild(state.fuse)) return 'A sparkler: any card can follow it.';
  if (state.log.length === 0 && state.act === 0) return 'Tap a glowing card: one rank above or below the fuse.';
  if (!plays && state.box.length) return 'Nothing follows the fuse. Light a card from your hand.';
  if (!plays) return 'Nothing left to play.';
  return 'One above or below the fuse. Kings and Aces join.';
}

function renderAll() {
  renderTop();
  renderGauge();
  renderBench();
  if (state && ui.screen !== 'title') updateTableau();
  document.body.dataset.screen = ui.screen;
}

// ---------- actions ----------
function canAct() {
  return state && state.phase === 'play' && ui.screen === 'play' && !ui.ending && !ui.modal && !ui.intro;
}

function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function flyTo(from, el, ms = 260) {
  if (!el || ui.instant || reducedMotion()) return;
  const to = rectOf(el);
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${from.w / to.w}) rotate(${dx > 0 ? -8 : 8}deg)` },
      { transform: 'translate(0,0) scale(1.06)', offset: 0.85 },
      { transform: 'none' },
    ],
    { duration: ms, easing: 'cubic-bezier(.2,.8,.3,1)' },
  );
}

function doPlay(slot) {
  if (!canAct()) return;
  const el = tableauEl.children[slot];
  if (!E.legalPlays(state).includes(slot)) {
    if (el && state.slots[slot].up && E.isOpen(state, slot)) {
      audio.nope();
      shake(el, 0.6);
      say(`${cardName(state.slots[slot].card)} doesn’t follow the fuse.`);
    }
    return;
  }
  const from = el ? rectOf(el) : null;
  const before = state.slots.map((s) => s.up);
  const r = E.play(state, slot);
  if (!r.ok) return;
  afterLoad(r, from);
  state.slots.forEach((s, i) => {
    if (s.up && !before[i] && !s.gone) flipIn(i);
  });
}

function doHand(k) {
  if (!canAct()) return;
  const card = E.hand(state)[k];
  if (card === undefined) return;
  const el = benchEl.querySelector(`[data-hand="${k}"]`);
  const from = el ? rectOf(el) : null;
  if (!ui.slowArmed && E.legalHandPlays(state).includes(k)) {
    const r = E.playHand(state, k);
    if (r.ok) afterLoad(r, from, { hand: true });
    return;
  }
  doStrike(k, from);
}

function doStrike(k = 0, from = null) {
  if (!canAct()) return;
  const slow = ui.slowArmed && E.canSlow(state);
  const rackRects = loadedTubes();
  const r = E.strike(state, { pick: k, slow });
  if (!r.ok) return;
  ui.slowArmed = false;
  audio.strike();
  renderAll();
  flyTo(from || rectOf($('.box')), $('#fuse'), 300);
  if (r.fired) fireShow(r.fired, rackRects);
  else if (slow) say('Slow match: the volley stays loaded.');
  ui.lastSeq = state.seq;
  save();
  if (r.ended) endAct(r.ended);
}

function afterLoad(r, from, { hand = false } = {}) {
  audio.load(r.position || E.RACK, { hand });
  const rackBefore = loadedTubes();
  renderAll();
  const fuse = $('#fuse');
  if (from) flyTo(from, fuse);
  const tube = benchEl.querySelectorAll('.tube:not(.empty)');
  const last = tube[tube.length - 1];
  if (last && !ui.instant && !reducedMotion()) last.animate([{ transform: 'translateY(-14px) scale(1.2)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'ease-out' });
  if (r.fired) {
    // A full rack goes up by itself; the chain carries on.
    fireShow(r.fired, rackBefore, { full: true });
    say('A full rack! It goes up and the chain carries on.');
  }
  save();
  if (r.ended) endAct(r.ended);
}

function flipIn(i) {
  const el = tableauEl.children[i];
  if (!el || ui.instant) return;
  audio.flip();
}

// ---------- the show (a volley going up) ----------
const PATTERN_KIND = {
  peony: 'peony',
  chrysanthemum: 'chrysanthemum',
  palm: 'palm',
  tourbillion: 'tourbillion',
  willow: 'willow',
  waterfall: 'waterfall',
  strobe: 'strobe',
  brocade: 'brocade',
  crossette: 'crossette',
  ring: 'ring',
  comet: 'comet',
  kamuro: 'kamuro',
};

function noteBook(patterns) {
  const book = saved.get('book', {});
  const fresh = [];
  for (const p of patterns) {
    if (!book[p.id]) fresh.push(p.id);
    book[p.id] = (book[p.id] || 0) + 1;
  }
  saved.set('book', book);
  return fresh;
}

/** The loaded tubes as they sit in the rack now (to send them up after a re-render). */
function loadedTubes() {
  return [...benchEl.querySelectorAll('.tube:not(.empty)')].map((el) => ({ rect: rectOf(el), html: el.outerHTML }));
}

/** Tube copies lift out of the rack, one per rocket, on the rockets' own schedule. */
function liftTubes(tubes, startAt) {
  if (ui.instant || reducedMotion()) return;
  tubes.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = 'lifting';
    el.innerHTML = t.html;
    Object.assign(el.style, { left: `${t.rect.x}px`, top: `${t.rect.y}px`, width: `${t.rect.w}px`, height: `${t.rect.h}px` });
    document.body.append(el);
    const anim = el.animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: 'translateY(-10px) scale(1.15)', opacity: 1, offset: 0.25 },
        { transform: 'translateY(-90px) scale(0.5)', opacity: 0 },
      ],
      { duration: 520, delay: startAt(i) * 1000, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'both' },
    );
    anim.onfinish = () => el.remove();
    setTimeout(() => el.remove(), startAt(i) * 1000 + 900);
  });
}

function fireShow(fired, rackTubes = [], { full = false } = {}) {
  const fresh = fired.dud ? [] : noteBook(fired.patterns);
  const total = fired.score;
  if (ui.instant) {
    ui.shownTotal += total;
    renderGauge();
    for (const id of fresh) say(`New in the Pattern Book: ${SHELL[id].name}`);
    return;
  }
  ui.pending++;
  const n = fired.shells.length;
  const a = sky.area;
  // rockets leave the fence in a spread across the sky, a little faster each time
  const reduced = reducedMotion();
  const starts = [];
  let t = 0;
  fired.shells.forEach((_, i) => {
    starts.push(t);
    t += Math.max(0.08, 0.26 - i * 0.02);
  });
  liftTubes(rackTubes.slice(0, n), (i) => starts[i] ?? 0);
  fired.shells.forEach((sh, i) => {
    const startT = starts[i];
    sky.after(startT, () => {
      const x = a.x + a.w * (0.12 + ((i * 0.37 + 0.5) % 1) * 0.76);
      const y = a.y + a.h * (0.15 + ((i * 0.29 + 0.2) % 1) * 0.45);
      const suit = E.suitOf(sh.c);
      audio.launch(i, { whistle: i % 4 === 3 });
      sky.launch({
        x,
        y,
        color: SUIT_COLOUR[suit] || 'gold',
        kind: 'shell',
        size: 0.75 + Math.min(0.6, i * 0.06),
        rise: reduced ? 0.4 : 0.75 + i * 0.03,
        onBurst: (bx, by) => {
          audio.burst(i, { size: 0.7 + i * 0.08, crackle: 5 });
          floatText({ x: bx, y: by }, fired.dud ? 'fizz' : `+${sh.pts}`, { className: `pts s${suit}` });
        },
      });
    });
  });
  // after the last shell bursts, the named shells bloom, then the total lands
  const lastBurst = t + 0.75 + n * 0.03;
  let tt = lastBurst + 0.3;
  if (fired.dud) {
    sky.after(lastBurst, () => say('Gusts: that volley fizzled out.'));
  }
  const named = fired.dud ? [] : fired.patterns;
  const row = ui.nameRow++ % 3;
  named.forEach((p, k) => {
    const at = tt;
    tt += 0.65;
    sky.after(at, () => {
      const x = a.x + a.w * (0.22 + ((k * 0.37 + row * 0.23) % 1) * 0.56);
      const y = a.y + a.h * (0.22 + row * 0.14 + (k % 2) * 0.12);
      const colours = fired.shells.map((s) => SUIT_COLOUR[E.suitOf(s.c)]);
      const color = colours[k % colours.length] || 'gold';
      sky.launch({
        x,
        y,
        color,
        kind: PATTERN_KIND[p.id] || 'peony',
        size: 1.3 + SHELL[p.id].bonus * 0.15,
        rise: 0.6,
        onBurst: (bx, by) => {
          audio.burst(n + k, { size: 2.2, crackle: 10 });
          audio.named(k);
          shellName(bx, by, SHELL[p.id].name, `+${p.bonus} lift`, fresh.includes(p.id));
          if (!reduced) shake($('#stage'), 0.6 + SHELL[p.id].bonus * 0.4);
        },
      });
    });
  });
  sky.after(tt + 0.25 + (named.length ? 0.4 : 0), () => {
    ui.shownTotal += total;
    ui.pending--;
    renderGauge();
    const g = $('#gNum');
    if (g && total > 0) {
      floatText(g, `+${fmt(total)}`, { className: `total-pop${total >= 200 ? ' big' : ''}` });
      g.animate?.([{ transform: 'scale(1.25)' }, { transform: 'none' }], { duration: 300, easing: 'ease-out' });
    }
    if (total > 0) audio.stamp();
    if (total >= 150) audio.ooh(total / 150);
    if (full) say(`A full rack: ${fmt(total)} oohs.`);
  });
}

function shellName(x, y, name, sub, fresh) {
  const el = document.createElement('div');
  el.className = `shell-name${fresh ? ' fresh' : ''}`;
  el.innerHTML = `<span class="sn-name">${esc(name)}</span><span class="sn-sub">${esc(sub)}${fresh ? ' · new in the book' : ''}</span>`;
  const w = window.innerWidth;
  el.style.left = `${Math.max(90, Math.min(w - 90, x))}px`;
  el.style.top = `${Math.max(60, y)}px`;
  document.body.append(el);
  setTimeout(() => el.remove(), 2200);
}

function fastForward() {
  if (ui.instant) return;
  sky.flushTimers();
}

const showsDone = () => ui.pending === 0 && !sky.busy;
function waitShows() {
  return new Promise((resolve) => {
    const check = () => (showsDone() ? resolve() : setTimeout(check, 60));
    check();
  });
}

// ---------- end of an act ----------
async function endAct(report) {
  ui.ending = true;
  renderAll();
  if (!ui.instant) await waitShows();
  if (report.cleared && report.finale.rockets && !ui.instant) {
    say(`Layout cleared! The finale: ${report.finale.rockets} rockets.`);
    ui.finaleFired = true;
    renderBench();
    await finaleShow(report.finale);
  } else if (report.cleared && ui.instant) {
    // nothing to animate
  }
  ui.shownTotal = state.total;
  renderGauge();
  ui.ending = false;
  showReport();
}

function finaleShow(finale) {
  return new Promise((resolve) => {
    const a = sky.area;
    const kinds = ['peony', 'chrysanthemum', 'willow', 'ring', 'palm', 'crossette', 'kamuro', 'brocade', 'strobe', 'comet'];
    let sum = 0;
    for (let i = 0; i < finale.rockets; i++) {
      sky.after(i * 0.16, () => {
        const pts = finale.each * (i + 1);
        sky.launch({
          x: a.x + a.w * (0.08 + Math.random() * 0.84),
          y: a.y + a.h * (0.1 + Math.random() * 0.5),
          kind: kinds[i % kinds.length],
          color: SUIT_COLOUR[i % 4],
          size: 1 + Math.min(0.8, i * 0.05),
          rise: 0.7,
          onBurst: (bx, by) => {
            sum += pts;
            audio.burst(i, { size: 1.4 + i * 0.05, crackle: 6 });
            floatText({ x: bx, y: by }, `+${pts}`, { className: 'pts finale' });
            ui.shownTotal = Math.min(state.total, ui.shownTotal + pts);
            renderGauge();
          },
        });
        audio.launch(i, { whistle: i % 3 === 0 });
      });
    }
    sky.after(finale.rockets * 0.16 + 1.2, () => {
      shellName(window.innerWidth / 2, a.y + a.h * 0.35, 'Finale!', `${finale.rockets} rockets, +${fmt(finale.points)}`, false);
      audio.fanfare();
      setTimeout(resolve, ui.instant ? 0 : 900);
    });
    void sum;
  });
}

// ---------- screens ----------
function showScreen(html, cls = '') {
  screenEl.innerHTML = html ? `<div class="panel-wrap ${cls}"><div class="panel label">${html}</div></div>` : '';
  screenEl.classList.toggle('on', !!html);
  const first = screenEl.querySelector('[data-primary]');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
}

function showReport() {
  ui.screen = 'report';
  if (state.report?.cleared) ui.finaleFired = true;
  renderAll();
  const r = state.report;
  const act = r.act;
  const verdict =
    r.outcome === 'over'
      ? 'The crowd drifts home.'
      : r.outcome === 'won'
        ? 'What a night! The crowd stayed to the end.'
        : r.total >= r.target * 1.5
          ? 'The crowd is loving it.'
          : 'The crowd is staying for more.';
  const volleys = state.log.filter((v) => v.act === act);
  const best = volleys.slice().sort((a, b) => b.score - a.score)[0];
  const btn =
    r.outcome === 'shed'
      ? `<button class="btn primary" data-action="to-shed" data-primary>To the shed <kbd>Enter</kbd></button>`
      : `<button class="btn primary" data-action="to-end" data-primary>See the programme <kbd>Enter</kbd></button>`;
  showScreen(
    `<p class="kicker">${ACT_TIMES[act]} pm · ${esc(LAYOUTS[act].name)}</p>
    <h2 class="title-script">${r.cleared ? 'Cleared!' : r.outcome === 'over' ? 'Damp squib' : 'Act over'}</h2>
    <dl class="tally">
      <div><dt>${volleys.length} volley${volleys.length === 1 ? '' : 's'}</dt><dd>${fmt(r.actScore - r.finale.points)}</dd></div>
      ${r.cleared ? `<div><dt>Finale: ${r.finale.rockets} rocket${r.finale.rockets === 1 ? '' : 's'}</dt><dd>${fmt(r.finale.points)}</dd></div>` : `<div><dt>${r.left} card${r.left === 1 ? '' : 's'} left unlit</dt><dd>no finale</dd></div>`}
      ${best ? `<div><dt>Best volley (${best.cards.length} shells)</dt><dd>${fmt(best.score)}</dd></div>` : ''}
      <div class="sum"><dt>Tonight so far</dt><dd>${fmt(r.total)} <small>of ${fmt(r.target)}</small></dd></div>
    </dl>
    <p class="verdict ${r.passed ? 'ok' : 'bad'}">${verdict}</p>
    ${btn}`,
    'report',
  );
  if (r.passed) audio.fanfare();
  else audio.sad();
  save();
}

function showShed() {
  if (state.phase === 'report') E.nextAct(state);
  if (state.phase !== 'shed') return showEnd();
  ui.screen = 'shed';
  renderAll();
  const next = state.act + 1;
  const tw = state.twists[next] ? TWIST[state.twists[next]] : null;
  const twText = tw && state.twists[next] === 'damp' ? `Damp ${['red', 'gold', 'green', 'blue'][state.dampSuit]} shells score nothing.` : tw?.text;
  const owned = state.perks.map((id) => PERK[id].name);
  showScreen(
    `<p class="kicker">The shed, before ${ACT_TIMES[next]} pm</p>
    <h2 class="title-script">Pick your chemistry</h2>
    <div class="offers">${state.offers
      .map(
        (id, k) => `<button class="packet p${k}" data-action="perk" data-perk="${id}" ${k === 0 ? 'data-primary' : ''}>
          <span class="pk-name">${esc(PERK[id].name)}</span><span class="pk-text">${esc(PERK[id].text)}</span><kbd>${k + 1}</kbd></button>`,
      )
      .join('')}</div>
    <div class="next-act">
      <p><b>Next: ${ACT_TIMES[next]} pm, ${esc(LAYOUTS[next].name)}.</b> The crowd wants ${fmt(E.targetFor(state, next))} by ${endTime(next)}.</p>
      ${tw ? `<p class="cond-line"><b>${esc(tw.name)}:</b> ${esc(twText)}</p>` : ''}
      ${owned.length ? `<p class="owned">In your pockets: ${owned.map(esc).join(', ')}</p>` : ''}
    </div>`,
    'shed',
  );
  save();
}

function pickPerk(id) {
  if (state.phase !== 'shed') return;
  audio.pick();
  E.choosePerk(state, id);
  startAct();
}

function startAct() {
  ui.screen = 'play';
  ui.ending = false;
  ui.finaleFired = false;
  ui.slowArmed = false;
  ui.shownTotal = state.total;
  showScreen('');
  buildTableau();
  renderAll();
  save();
  intro();
}

function intro() {
  if (ui.instant) return;
  const act = state.act;
  const tw = E.twistOf(state) ? TWIST[E.twistOf(state)] : null;
  const el = document.createElement('div');
  el.className = 'intro';
  el.innerHTML = `<div class="intro-card"><span class="i-time">${ACT_TIMES[act]} pm</span><span class="i-name">${esc(LAYOUTS[act].name)}</span>
    ${tw ? `<span class="i-cond">${esc(tw.name)}</span>` : ''}<span class="i-target">The crowd wants ${fmt(E.targetFor(state))} by ${endTime(act)}</span></div>`;
  document.body.append(el);
  ui.intro = true;
  const done = () => {
    if (!el.isConnected) return;
    el.remove();
    ui.intro = false;
    window.removeEventListener('pointerdown', done, true);
    window.removeEventListener('keydown', done, true);
  };
  setTimeout(() => {
    window.addEventListener('pointerdown', done, true);
    window.addEventListener('keydown', done, true);
  }, 350);
  setTimeout(done, 2200);
}

function showEnd() {
  if (state.phase === 'report') E.nextAct(state);
  ui.screen = 'end';
  ui.demo = state.phase === 'won';
  renderAll();
  const won = state.phase === 'won';
  const isBest = recordBest(SLUG, state.total, `${fmt(state.total)} oohs`);
  if (state.daily) {
    const d = saved.get('dailyBest', null);
    if (!d || d.date !== state.seed || state.total > d.total) saved.set('dailyBest', { date: state.seed, total: state.total, won });
  }
  saved.remove(state.daily ? 'daily' : 'show');
  const found = Object.keys(state.found).length;
  const book = Object.keys(saved.get('book', {})).length;
  showScreen(
    `<div class="programme-wrap"><canvas id="programme" width="900" height="1200" aria-label="The programme for tonight's display"></canvas></div>
    <div class="end-side">
      <h2 class="title-script">${won ? 'A night to remember' : 'The crowd went home'}</h2>
      <p class="end-total"><b>${fmt(state.total)}</b> oohs${isBest ? ' <span class="best-tag">Your best</span>' : ''}</p>
      <p class="end-line">${won ? 'All five acts, start to finish.' : `They left during ${ACT_TIMES[state.report.act]} pm, ${esc(LAYOUTS[state.report.act].name)}.`} ${found} named shell${found === 1 ? '' : 's'} tonight · ${book} of 12 in your Pattern Book.</p>
      <div class="end-btns">
        <button class="btn primary" data-action="again" data-primary>Another display <kbd>Enter</kbd></button>
        <button class="btn" data-action="save-png">Save the programme</button>
        <button class="btn ghost" data-action="title">Title</button>
      </div>
    </div>`,
    'end',
  );
  drawProgramme($('#programme'), state, { won, date: new Date() });
  if (won) audio.fanfare();
}

function showTitle() {
  ui.screen = 'title';
  ui.demo = true;
  state = null;
  tableauEl.innerHTML = '';
  renderAll();
  const show = loadSave('show');
  const daily = loadSave('daily');
  const today = `daily-${dailySeed()}`;
  const db = saved.get('dailyBest', null);
  const dailyDone = db && db.date === today ? db : null;
  const stats = saved.get('stats', null);
  const book = Object.keys(saved.get('book', {})).length;
  const cont = show || daily;
  showScreen(
    `<p class="maker">Ember &amp; Daughters · Safety Fireworks</p>
    <h1 class="title-logo"><span>Touch</span> <span>Paper</span></h1>
    <p class="title-sub">A patience game for fireworks night</p>
    <div class="title-btns">
      ${cont ? `<button class="btn primary" data-action="continue" data-primary>Continue: ${ACT_TIMES[cont.act]} pm, ${fmt(cont.total)} oohs</button>` : ''}
      <button class="btn ${cont ? '' : 'primary'}" data-action="daily" ${cont ? '' : 'data-primary'}>Tonight’s display${dailyDone ? ` <small>best ${fmt(dailyDone.total)}</small>` : ''}</button>
      <button class="btn" data-action="new">A new display</button>
      <div class="title-small">
        <button class="btn ghost" data-action="help">How to play</button>
        <button class="btn ghost" data-action="book">Pattern book <small>${book}/12</small></button>
      </div>
    </div>
    ${stats?.best ? `<p class="title-best">Your best: ${esc(stats.bestLabel)}</p>` : ''}
    <p class="warning">Light the blue touch paper and retire</p>`,
    'title',
  );
  measure();
}

// ---------- show lifecycle ----------
function newShow({ seed = null, daily = false } = {}) {
  sky.clear();
  ui.demo = false;
  const s = daily ? `daily-${dailySeed()}` : seed || Math.random().toString(36).slice(2, 10);
  state = E.newShow({ seed: s, daily });
  ui.shownTotal = 0;
  recordPlay(SLUG);
  startAct();
  if (!saved.get('seenHelp', false) && !ui.instant) {
    saved.set('seenHelp', true);
  }
}

function loadSave(slot) {
  const s = saved.get(slot, null);
  if (!s || s.saveV !== SAVE_V) return null;
  const st = E.upgradeState(s.state);
  if (!st) return null;
  if (slot === 'daily' && st.seed !== `daily-${dailySeed()}`) return null;
  return st;
}

function save() {
  if (!state) return;
  if (state.phase === 'over' || state.phase === 'won') return;
  saved.set(state.daily ? 'daily' : 'show', { saveV: SAVE_V, state });
}

function resume(st) {
  sky.clear();
  ui.demo = false;
  state = st;
  ui.shownTotal = state.total;
  if (state.phase === 'play') return startAct();
  if (state.phase === 'report') {
    buildTableau();
    return showReport();
  }
  if (state.phase === 'shed') {
    buildTableau();
    return showShed();
  }
  showTitle();
}

// ---------- modals ----------
function openModal(html, cls = '') {
  ui.modal = cls || 'modal';
  modalEl.innerHTML = `<div class="modal-back" data-action="close"></div><div class="modal ${cls}" role="dialog" aria-modal="true">
    <button class="icon-btn close" data-action="close" aria-label="Close">×</button>${html}</div>`;
  modalEl.classList.add('on');
  setTimeout(() => modalEl.querySelector('.close')?.focus({ preventScroll: true }), 20);
}
function closeModal() {
  ui.modal = null;
  modalEl.classList.remove('on');
  modalEl.innerHTML = '';
}

function openHelp() {
  openModal(
    `<h2 class="title-script">How to play</h2>
    <div class="help-cols">
      <div>
        <p><b>Chain cards up and down.</b> Tap any uncovered card one rank above or below the <b>fuse</b>. Kings and Aces join. Each card you play loads a shell into the rack.</p>
        <p><b>Light it.</b> When nothing follows, tap a card in your hand to strike it: the volley goes up and that card becomes the new fuse. A hand card that follows the fuse can join the volley instead, but then it isn't there to strike later.</p>
        <p><b>Shell 1 scores 1, shell 2 scores 2…</b> times the volley's <b>lift</b>. A full rack of ten goes up by itself and the chain carries on.</p>
        <p><b>Clear the layout</b> for the finale: every card left in the box goes up as a rocket, each worth more than the last.</p>
      </div>
      <div>
        <p><b>Named shells add lift.</b> Three of one colour is a Peony; four rising is a Palm; four falling, a Willow; all four colours, a Crossette. The Pattern Book has all twelve.</p>
        <p><b>Five acts, 7 pm to 9 pm.</b> The crowd wants a running total by the end of each act; fall short and they go home. Between acts, pick one bit of chemistry from the shed.</p>
        <p class="keys-help">Keys: <kbd>1</kbd>–<kbd>9</kbd> play glowing cards left to right, <kbd>Z</kbd> <kbd>X</kbd> <kbd>C</kbd> your hand, <kbd>S</kbd> slow match, <kbd>Enter</kbd> hurries the display, <kbd>B</kbd> book, <kbd>M</kbd> sound.</p>
      </div>
    </div>`,
    'help',
  );
}

function openBook() {
  const book = saved.get('book', {});
  openModal(
    `<h2 class="title-script">The Pattern Book</h2>
    <p class="book-sub">${Object.keys(book).length} of 12 shells seen. Only the biggest of each family counts in a volley.</p>
    <div class="book-grid">${SHELLS.map(
      (s) => `<div class="specimen${book[s.id] ? ' seen' : ''}"><canvas data-specimen="${s.id}" width="160" height="120" aria-hidden="true"></canvas>
        <div class="sp-text"><span class="sp-name">${esc(s.name)} <small>+${s.bonus} lift</small></span><span class="sp-rule">${esc(s.rule)}</span>
        <span class="sp-count">${book[s.id] ? `Seen ${book[s.id]} time${book[s.id] === 1 ? '' : 's'}` : 'Not seen yet'}</span></div></div>`,
    ).join('')}</div>`,
    'book',
  );
  modalEl.querySelectorAll('[data-specimen]').forEach((c) => drawSpecimen(c, c.dataset.specimen, !!book[c.dataset.specimen]));
}

function savePNG() {
  const c = $('#programme');
  if (!c) return;
  const a = document.createElement('a');
  a.download = `touch-paper-${new Date().toISOString().slice(0, 10)}.png`;
  a.href = c.toDataURL('image/png');
  a.click();
}

// ---------- say (one status line) ----------
let sayTimer = 0;
function say(text) {
  const el = $('#say');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => el.classList.remove('on'), 2400);
}

// ---------- input ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action], [data-slot], [data-hand]');
  if (!t) {
    if (ui.screen === 'play' && !ui.modal) fastForward();
    return;
  }
  if (t.dataset.slot !== undefined) return doPlay(Number(t.dataset.slot));
  if (t.dataset.hand !== undefined) return doHand(Number(t.dataset.hand));
  const a = t.dataset.action;
  if (a === 'close') return closeModal();
  if (a === 'help') return openHelp();
  if (a === 'book') return openBook();
  if (a === 'mute') {
    sfx.toggleMute();
    renderTop();
    syncBonfire();
    return;
  }
  if (a === 'cond') return say(t.title);
  if (a === 'slow') {
    if (E.canSlow(state)) ui.slowArmed = !ui.slowArmed;
    renderBench();
    if (ui.slowArmed) say('Slow match lit: strike a hand card and the volley stays loaded.');
    return;
  }
  if (a === 'to-shed') return showShed();
  if (a === 'to-end') return showEnd();
  if (a === 'perk') return pickPerk(t.dataset.perk);
  if (a === 'again') return newShow();
  if (a === 'title') return showTitle();
  if (a === 'daily') return newShow({ daily: true });
  if (a === 'new') return newShow();
  if (a === 'continue') {
    const st = loadSave('show') || loadSave('daily');
    if (st) resume(st);
    return;
  }
  if (a === 'save-png') return savePNG();
});

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'escape' && ui.modal) return closeModal();
  if (ui.modal) return;
  if (k === 'm') {
    sfx.toggleMute();
    renderTop();
    syncBonfire();
    return;
  }
  if (k === 'h' || k === '?') return openHelp();
  if (k === 'b') return openBook();
  if (ui.screen === 'play') {
    if (/^[1-9]$/.test(k)) {
      const slot = ui.keyHints[Number(k) - 1];
      if (slot !== undefined) doPlay(slot);
      return;
    }
    const h = { z: 0, x: 1, c: 2 }[k];
    if (h !== undefined) return doHand(h);
    if (k === 's' && E.canSlow(state)) {
      ui.slowArmed = !ui.slowArmed;
      renderBench();
      return;
    }
    if (k === 'enter' || k === ' ') {
      e.preventDefault();
      fastForward();
    }
    return;
  }
  if (ui.screen === 'shed' && /^[1-3]$/.test(k)) {
    const id = state.offers[Number(k) - 1];
    if (id) pickPerk(id);
    return;
  }
  if (k === 'enter') {
    const p = screenEl.querySelector('[data-primary]');
    if (p && document.activeElement !== p) {
      e.preventDefault();
      p.click();
    }
  }
});

// The bonfire crackles only while the page is visible and sound is on.
function syncBonfire() {
  const on = !document.hidden && !sfx.muted && !ui.instant;
  if (on && !sfx.now()) return; // not unlocked yet
  audio.bonfire(on);
}
document.addEventListener('visibilitychange', syncBonfire);
window.addEventListener('pointerdown', () => setTimeout(syncBonfire, 50), { once: true });
window.addEventListener('keydown', () => setTimeout(syncBonfire, 50), { once: true });

// ---------- boot ----------
suitSprite();
showTitle();
measure();

function playable() {
  return state ? E.legalPlays(state) : [];
}

markReady({
  get state() {
    return state;
  },
  ui,
  sky,
  loop,
  engine: E,
  advance: (s) => loop.advance(s),
  skipAnimations(on = true) {
    ui.instant = !!on;
    if (on) {
      sky.clear();
      ui.demo = false;
    }
    syncBonfire();
  },
  newShow: (seed = 'TEST-1', daily = false) => newShow({ seed, daily }),
  playable,
  play: (slot) => doPlay(slot),
  hand: (k) => doHand(k),
  strike: (k = 0) => doStrike(k),
  /** Put a card on the fuse that the first open card follows (for scripted tests). */
  fuseFor(slot = null) {
    const open = state.slots.map((_, i) => i).filter((i) => !state.slots[i].gone && E.isOpen(state, i));
    const i = slot ?? open[0];
    const c = state.slots[i].card;
    state.fuse = E.rankOf(c) === 13 ? c - 1 : c + 1;
    renderAll();
    return i;
  },
  /** Let the bot make one move through the real handlers. */
  botMove(skill = 0.8) {
    if (!canAct()) return false;
    const m = chooseMove(state, { skill });
    if (m.kind === 'play') doPlay(m.slot);
    else if (m.kind === 'hand') doHand(m.k);
    else {
      if (m.slow) ui.slowArmed = true;
      doStrike(m.pick || 0);
    }
    return true;
  },
  /** Bot-play until the act ends (instant mode recommended). */
  botAct(skill = 0.8, max = 400) {
    let n = 0;
    while (canAct() && n++ < max) this.botMove(skill);
    return state.phase;
  },
  /**
   * End the act now, through the real handlers: a pass clears the layout with one last play
   * (so the finale fires); a fail empties the box down to one card nothing follows and strikes it.
   */
  finishAct(pass = true) {
    if (!canAct()) return false;
    state.volley = [];
    if (pass) {
      state.total = Math.max(state.total, E.targetFor(state) + 50);
      ui.shownTotal = state.total;
      const open = state.slots.map((_, i) => i).filter((i) => !state.slots[i].gone && E.isOpen(state, i));
      const last = open[0];
      state.slots.forEach((s, i) => {
        if (i !== last) s.gone = true;
      });
      const c = state.slots[last].card;
      state.fuse = E.rankOf(c) === 13 ? c - 1 : c + 1;
      renderAll();
      doPlay(last);
    } else {
      state.total = 0;
      ui.shownTotal = 0;
      const x = state.box[0] ?? state.fuse;
      state.box = [x];
      const never = (c) => E.suitOf(c) * 13 + ((E.rankOf(x) - 1 + 6) % 13);
      state.slots.forEach((s) => {
        if (!s.gone) s.card = never(s.card);
      });
      renderAll();
      doStrike(0);
    }
    return true;
  },
  toShed: () => showShed(),
  pickPerk: (id) => pickPerk(id ?? state.offers[0]),
  openBook,
  openHelp,
  closeModal,
  prepareThumbnail() {
    ui.instant = false;
    newShow({ seed: 'THUMB-3' });
    const g = window.__game;
    document.querySelector('.intro')?.remove();
    ui.intro = false;
    // play until a few shells are loaded (stop short of lighting them)
    for (let i = 0; i < 60 && state.volley.length < 4; i++) {
      const m = chooseMove(state, { skill: 0.9, rng: () => 0.5 });
      if (m.kind === 'strike' && state.volley.length >= 2) break;
      if (m.kind === 'play') doPlay(m.slot);
      else if (m.kind === 'hand') doHand(m.k);
      else doStrike(m.pick || 0);
    }
    document.querySelectorAll('.lifting, .shell-name, .cg-float').forEach((el) => el.remove());
    void g;
    // a volley in the air for the picture
    const a = sky.area;
    const kinds = [
      ['willow', 'gold', 0.3, 0.3],
      ['peony', 'red', 0.62, 0.25],
      ['ring', 'blue', 0.82, 0.45],
      ['chrysanthemum', 'green', 0.16, 0.55],
    ];
    for (const [kind, color, fx, fy] of kinds) sky.burst(a.x + a.w * fx, a.y + a.h * fy, { kind, color, size: 1.3, light: false });
    loop.manual = true;
    for (let i = 0; i < 30; i++) loop.advance(1 / 60);
  },
});
