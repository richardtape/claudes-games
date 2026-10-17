import { homeLink, markReady, recordBest, recordPlay, store, reducedMotion, onHidden } from '../../../shared/arcade.js';
import { floatText, shake } from '../../../shared/juice.js';
import { dailySeed, createRng } from '../../../shared/rng.js';
import { createLoop, fixedSteps } from '../../../shared/loop.js';
import * as E from './engine.js';
import { HOURS, SPECIES, NOTIONS, FLOSS, HOUR_LEN, CASE_ORDER, DAWN_LABEL, CLOSE_GAP } from './data.js';
import { closestOnSegment, pointInPolygon } from './geom.js';
import { createRenderer, drawMoth } from './render.js';
import { createAudio } from './audio.js';
import { createBot, botPickNotion } from './bot.js';
import { stitchSVG } from './stitchfont.js';
import { notionIcon } from './icons.js';

const SLUG = 'night-stitch';
const audio = createAudio(SLUG);
const sfx = audio.sfx;
const saved = store(SLUG);
const $ = (sel) => document.querySelector(sel);
const canvas = $('#stage');
const stageWrap = $('#wrap'); // shake moves the room and stage canvases together
const R = createRenderer(canvas, { room: $('#room') });
const SAVE_VERSION = 1;

// Lifetime record for the specimen case and best scores.
const profile = Object.assign(
  { v: SAVE_VERSION, caught: {}, gilded: {}, nights: 0, dawns: 0, bestLoop: 0, best: 0, latest: null },
  saved.get('profile', {}),
);
const daily = saved.get('daily', { seed: null, best: 0, tries: 0 });
const saveProfile = () => saved.set('profile', profile);

const ui = {
  screen: 'title', // title | play | notion | paused | over | dawn
  night: null,
  attract: null,
  attractBot: null,
  mode: 'free',
  fx: [],
  particles: [],
  ghosts: [],
  reveals: [],
  revealed: 0,
  clock: 0,
  acc: 0,
  last: performance.now(),
  needleAngle: -0.8,
  prevNeedle: null,
  pointer: null, // world target from mouse/touch
  touchJump: null,
  keys: new Set(),
  tickT: 0,
  tock: false,
  dawnK: 0,
  hudScore: -1,
  hudFabric: -1,
  shownIntegrity: 1,
  endShown: false,
  busyUntil: 0,
  frozen: false,
};

// ---------------------------------------------------------------------------------------
// Layout

function layout() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const wide = W >= 820 && W / H > 1.15;
  let Rpx;
  let cx;
  let cy;
  if (wide) {
    const side = Math.min(320, W * 0.25);
    Rpx = Math.min((H - 64) / 2, (W - side * 2) / 2) / 1.08;
    // On the title the hoop slides right to make room for the title card.
    cx = W / 2 + (ui.screen === 'title' ? Math.min(190, W * 0.12) : 0);
    cy = H / 2 + 8;
  } else {
    const top = 124;
    Rpx = Math.min((W - 18) / 2, (H - top - 20) / 2) / 1.08;
    cx = W / 2;
    // Title: hoop up top, the card below. Play: hoop centred under the HUD row.
    cy = ui.screen === 'title' ? 64 + Rpx * 1.08 : top + Math.max(Rpx * 1.08 + 6, (H - top) / 2 - 10);
  }
  document.body.classList.toggle('wide', wide);
  const st = document.documentElement.style;
  st.setProperty('--hoop-cx', `${cx}px`);
  st.setProperty('--hoop-cy', `${cy}px`);
  st.setProperty('--hoop-r', `${Rpx * 1.08}px`);
  R.resize({ W, H, dpr, cx, cy, R: Rpx });
}

// ---------------------------------------------------------------------------------------
// Nights

function startNight(mode = ui.mode) {
  ui.mode = mode;
  const seed = mode === 'daily' ? `daily:${dailySeed()}` : `free:${Date.now()}`;
  ui.night = E.newNight({ seed, daily: mode === 'daily' });
  ui.fx = [];
  ui.particles = [];
  ui.ghosts = [];
  ui.reveals = [];
  ui.revealed = 0;
  ui.endShown = false;
  ui.dawnK = 0;
  ui.tearAt = null;
  ui.pointer = null;
  ui.prevNeedle = { ...ui.night.needle };
  steps.reset();
  ui.hudScore = -1;
  ui.hudFabric = -1;
  if (mode === 'daily') {
    if (daily.seed !== dailySeed()) Object.assign(daily, { seed: dailySeed(), best: 0, tries: 0 });
    daily.tries++;
    saved.set('daily', daily);
  }
  recordPlay(SLUG);
  profile.nights++;
  saveProfile();
  handleEvents(ui.night); // the opening "10 PM" banner
  setScreen('play');
}

function activeState() {
  return ui.screen === 'title' ? ui.attract : ui.night;
}

function newAttract() {
  ui.attract = E.newNight({ seed: `attract:${Date.now()}` });
  ui.attractBot = createBot({ skill: 0.55, seed: Date.now() & 0xffff });
  ui.attractRng = createRng(Date.now() & 0xffff);
  ui.revealed = 0;
  ui.reveals = [];
}

function input() {
  if (ui.touchJump) {
    const j = ui.touchJump;
    ui.touchJump = null;
    return { jump: j };
  }
  let x = 0;
  let y = 0;
  const k = ui.keys;
  if (k.has('ArrowLeft') || k.has('a')) x -= 1;
  if (k.has('ArrowRight') || k.has('d')) x += 1;
  if (k.has('ArrowUp') || k.has('w')) y -= 1;
  if (k.has('ArrowDown') || k.has('s')) y += 1;
  if (x || y) return { dir: { x, y } };
  if (ui.pointer) return { target: ui.pointer };
  return {};
}

function tickState(s, inp) {
  for (const m of s.moths) {
    m.px = m.x;
    m.py = m.y;
  }
  ui.prevNeedle = { x: s.needle.x, y: s.needle.y };
  E.step(s, inp);
}

// ---------------------------------------------------------------------------------------
// Events → sound, juice and the reveal queue

const STEP = 0.075; // seconds between each caught moth flipping into embroidery
const CINCH = 0.2;

function handleEvents(s) {
  const live = s === ui.night;
  const evs = s.events.splice(0);
  for (const e of evs) {
    if (!live) {
      if (e.type === 'loop') scheduleLoop(s, e, false);
      continue;
    }
    switch (e.type) {
      case 'loop':
        scheduleLoop(s, e, true);
        break;
      case 'snap':
        audio.snap();
        ui.fx.push({ type: 'snapPiece', pts: e.lost, color: FLOSS[s.floss % FLOSS.length], t0: ui.clock, dur: 0.9, drift: 90 });
        burst(e.x, e.y, 6, '#efe3c8', 'fluff');
        shake(stageWrap, 1.2);
        floatAt(e.x, e.y, e.by === 'beetle' ? 'Snapped!' : 'Gust!', 'float-bad');
        break;
      case 'wax':
        audio.wax();
        ring(e.x, e.y, 6, 60, '#e1a83a', 0.5);
        floatAt(e.x, e.y, 'Beeswax', 'float-gold');
        break;
      case 'startle':
        audio.startle();
        burst(e.x, e.y, 5, 'rgba(230, 210, 160, 0.9)', 'dust');
        break;
      case 'hole-done':
        audio.holeDone();
        burst(e.x, e.y, 4, '#8a7350', 'dust');
        break;
      case 'arrive':
        if (SPECIES[e.kind].boss) {
          audio.arrive(true);
          banner(`The ${SPECIES[e.kind].name} arrives`, SPECIES[e.kind].note);
        }
        break;
      case 'swarm':
        audio.swarm();
        banner('A swarm', 'Clothes moths, all at once. Find the biggest loop you can.');
        break;
      case 'gust-windup':
        audio.windup();
        break;
      case 'gust':
        audio.gust();
        ring(e.x, e.y, 30, e.r, '#efe3c8', 0.7, 0.6, 5);
        shake(stageWrap, 1.6);
        break;
      case 'boss-heal':
        ring(e.x, e.y, 20, 80, '#b5362f', 0.6);
        floatAt(e.x, e.y, 'It shook loose', 'float-bad');
        break;
      case 'boss-left':
        banner(`The ${SPECIES[e.kind].name} flew off`, 'Out of the window and into the night.');
        break;
      case 'hour': {
        const H = HOURS[e.hour];
        const intro = (H.intro || []).map((k) => SPECIES[k].name.toLowerCase());
        if (e.hour === 0) banner('10 PM', 'Loop the moths before they eat the linen.');
        else if (!H.boss && !H.swarm) banner(H.label, intro.length ? `New tonight: ${listText(intro)}.` : 'Busier now.');
        break;
      }
      case 'chime':
        audio.chime();
        setTimeout(() => ui.night === s && s.phase === 'notion' && setScreen('notion'), reducedMotion() ? 50 : 650);
        break;
      case 'over':
        audio.over();
        shake(stageWrap, 3);
        ui.tearAt = ui.clock;
        endNight(s);
        break;
      case 'dawn':
        audio.dawn();
        endNight(s);
        break;
    }
  }
}

function scheduleLoop(s, e, live) {
  live = live && !ui.quiet; // staged loops (thumbnail) skip sound and juice
  const t0 = ui.clock;
  const entries = (e.darned.length ? e.darned.length : 0) + (e.n || e.hits.length ? 1 : 0) + e.caught.length;
  const start = s.history.length - entries;
  const firstMoth = s.history.length - e.caught.length;
  ui.fx.push({ type: 'cinch', poly: e.poly, color: e.color, cx: e.centroid.x, cy: e.centroid.y, t0, dur: 0.55 });
  ui.reveals.push({ upTo: firstMoth, at: t0 + CINCH });
  const steps = [];
  e.caught.forEach((m, i) => {
    const at = t0 + CINCH + (i + 1) * STEP;
    steps.push(at);
    ui.ghosts.push({ ...m, t0, flipAt: at });
    ui.reveals.push({ upTo: firstMoth + i + 1, at, moth: m, live, i, n: e.n });
  });
  if (live && e.n > 1) ui.fx.push({ type: 'tally', x: e.centroid.x, y: e.centroid.y, n: e.n, steps, t0, dur: CINCH + e.n * STEP + 0.9 });
  if (start < 0) ui.revealed = s.history.length;
  if (!live) return;
  audio.cinch(e.n);
  if (e.darned.length) setTimeout(() => audio.darn(), CINCH * 1000);
  for (const h of e.hits) {
    audio.bossHit(h.hp);
    ring(h.x, h.y, 20, 110, '#e1a83a', 0.8, 0.5, 4);
    floatAt(h.x, h.y - 60, `${3 - h.hp} of 3`, 'float-gold');
  }
  const n = e.n;
  if (n) {
    setTimeout(() => {
      if (n > 1) floatAt(e.centroid.x, e.centroid.y - 40, `+${e.score.toLocaleString('en-US')}`, n >= 5 ? 'float-big' : 'float-score');
      if (n >= 3) shake(stageWrap, Math.min(3, 0.6 + n * 0.25));
      if (n >= 5) ui.fx.push({ type: 'flare', x: e.centroid.x, y: e.centroid.y, r: 160 + n * 22, t0: ui.clock, dur: 0.8 });
      if (n >= 8) {
        audio.grand();
        banner(n >= 12 ? 'A magnificent loop' : 'A grand loop', `${n} moths in one go.`);
      }
      setLoopNote(e);
    }, (CINCH + n * STEP) * 1000);
  } else if (e.darned.length) {
    setTimeout(() => floatAt(e.centroid.x, e.centroid.y, `Darned +${e.score}`, 'float-score'), CINCH * 1000);
  }
}

function processReveals() {
  while (ui.reveals.length && ui.reveals[0].at <= ui.clock) {
    const r = ui.reveals.shift();
    ui.revealed = Math.max(ui.revealed, r.upTo);
    if (r.moth && r.live) {
      audio.pluck(r.i, { gilded: r.moth.gilded });
      burst(r.moth.x, r.moth.y, 5, FLOSS[(r.i * 3) % FLOSS.length], 'fluff');
      ring(r.moth.x, r.moth.y, 10, 46, r.moth.gilded ? '#f6d77e' : '#fff3d6', 0.7, 0.32, 2.5);
      // Multi-moth loops count up in the stitched tally instead; the total floats at the end.
      if (r.n === 1 || r.moth.gilded) floatAt(r.moth.x, r.moth.y, r.moth.gilded ? `Gilded! +${r.moth.points}` : `+${r.moth.points}`, r.moth.gilded ? 'float-gold' : 'float-small');
    }
  }
  ui.ghosts = ui.ghosts.filter((g) => g.flipAt > ui.clock);
  ui.fx = ui.fx.filter((f) => ui.clock - f.t0 < f.dur);
  ui.particles = ui.particles.filter((p) => ui.clock - p.t0 < p.dur);
  if (ui.particles.length > 220) ui.particles.splice(0, ui.particles.length - 220);
}

// ---------------------------------------------------------------------------------------
// Juice helpers (world coordinates)

function floatAt(x, y, text, className) {
  if (ui.quiet) return;
  const p = R.toScreen(x, y);
  floatText(p, text, { className: `float ${className}` });
}

function ring(x, y, r0, r1, color, alpha = 0.8, dur = 0.5, width = 3) {
  ui.fx.push({ type: 'ring', x, y, r0, r1, color, alpha, t0: ui.clock, dur, width });
}

function burst(x, y, n, color, shape) {
  if (reducedMotion()) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 40 + Math.random() * 90;
    ui.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, color, shape, t0: ui.clock, dur: 0.5 + Math.random() * 0.4, g: shape === 'fluff' ? 0.6 : 1.2 });
  }
}

let bannerTimer = 0;
function banner(title, sub = '') {
  if (ui.quiet) return;
  const el = $('#banner');
  el.innerHTML = `<div class="banner-title">${title}</div>${sub ? `<div class="banner-sub">${sub}</div>` : ''}`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

const listText = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function setLoopNote(e) {
  const el = $('#loopnote');
  el.textContent = e.n > 1 ? `${e.n} moths, ×${e.n}${e.gold ? ', gold thread' : ''}` : `${SPECIES[e.caught[0].kind].name}`;
  el.classList.remove('fresh');
  void el.offsetWidth;
  el.classList.add('fresh');
}

// ---------------------------------------------------------------------------------------
// HUD

const CLOCK_MARKS = (() => {
  // Events on the dial: hour index → icon label.
  const m = {};
  HOURS.forEach((h, i) => {
    if (h.boss) m[i] = h.boss;
    else if (h.swarm) m[i] = 'swarm';
  });
  return m;
})();

function buildClock() {
  const svg = $('#clock');
  let marks = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = Math.sin(a) * 38;
    const y = -Math.cos(a) * 38;
    marks += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i % 3 === 0 ? 2.6 : 1.4}" fill="#dcd0b4" opacity=".8"/>`;
  }
  // Night arc from 10 to 6, with event pins.
  let pins = '';
  for (const [i, kind] of Object.entries(CLOCK_MARKS)) {
    const hour12 = (22 + Number(i)) % 12;
    const a = (hour12 / 12) * Math.PI * 2;
    const x = Math.sin(a) * 27;
    const y = -Math.cos(a) * 27;
    pins += `<circle class="pin pin-${kind}" data-hour="${i}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${kind === 'swarm' ? '#c9a560' : '#b5362f'}" stroke="#171c3a" stroke-width="1.5"/>`;
  }
  const dawnA = (6 / 12) * Math.PI * 2;
  pins += `<circle cx="${(Math.sin(dawnA) * 27).toFixed(1)}" cy="${(-Math.cos(dawnA) * 27).toFixed(1)}" r="5" fill="#f4b860" stroke="#171c3a" stroke-width="1.5"/>`;
  svg.innerHTML = `
    <circle r="47" fill="#232a52" stroke="#c48c52" stroke-width="4"/>
    <path id="clock-arc" fill="none" stroke="#e1a83a" stroke-width="5" stroke-linecap="round" opacity=".55"/>
    ${marks}${pins}
    <line id="clock-min" x1="0" y1="4" x2="0" y2="-36" stroke="#dcd0b4" stroke-width="2.4" stroke-linecap="round"/>
    <line id="clock-hour" x1="0" y1="4" x2="0" y2="-24" stroke="#f4e6c8" stroke-width="4" stroke-linecap="round"/>
    <circle r="3.4" fill="#e1a83a"/>`;
}

function arcPath(a0, a1, r) {
  const p = (a) => `${(Math.sin(a) * r).toFixed(2)} ${(-Math.cos(a) * r).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(a0)} A${r} ${r} 0 ${large} 1 ${p(a1)}`;
}

function updateHUD(s) {
  if (!s) return;
  if (s.score !== ui.hudScore) {
    ui.hudScore = s.score;
    $('#score').innerHTML = stitchSVG(s.score.toLocaleString('en-US'), { cell: document.body.classList.contains('wide') ? 5.2 : 4.4, color: '#f0c25a', shade: '#a8751f' });
  }
  const integ = E.integrity(s);
  ui.shownIntegrity += (integ - ui.shownIntegrity) * 0.15;
  const pct = Math.round(integ * 100);
  if (pct !== ui.hudFabric) {
    ui.hudFabric = pct;
    $('#fabric-pct').textContent = `${pct}%`;
    const lit = Math.ceil(integ * 20);
    const danger = integ < 0.35;
    let cells = '';
    for (let i = 0; i < 20; i++) cells += `<span class="x ${i < lit ? 'on' : 'off'}"></span>`;
    const f = $('#fabric');
    f.innerHTML = cells;
    f.classList.toggle('danger', danger);
    document.body.classList.toggle('fraying', danger);
  }
  // Clock hands: hour hand through the night, minute hand per hour.
  const hours = 22 + s.hour + Math.min(s.hourT, HOUR_LEN) / HOUR_LEN;
  $('#clock-hour').setAttribute('transform', `rotate(${((hours % 12) / 12) * 360})`);
  $('#clock-min').setAttribute('transform', `rotate(${((Math.min(s.hourT, HOUR_LEN) / HOUR_LEN) * 360).toFixed(1)})`);
  // The gold arc grows from 10 o'clock as the night passes.
  const a0 = (10 / 12) * Math.PI * 2;
  const aEnd = a0 + ((hours - 22) / 12) * Math.PI * 2;
  $('#clock-arc').setAttribute('d', arcPath(a0, Math.max(a0 + 0.01, aEnd), 27));
  $('#clock-time').textContent = E.clockLabel(s);
  $('#clock-next').textContent = nextEventText(s);
}

/** On a first night, until the first loop, a chalk circle round a settled moth shows the idea. */
function firstGuide(s) {
  if (profile.nights > 1 || s.stats.loops > 0 || s.t < 2) return null;
  const m = s.moths.find((x) => x.mode === 'eat' && Math.hypot(x.x, x.y) < 330);
  if (!m) return null;
  if (!ui.guideShown) {
    ui.guideShown = true;
    banner('Follow the chalk', 'Steer the needle all the way round the moth.');
  }
  return { x: m.x, y: m.y, r: 120 };
}

/** Where crossing the old thread would close a loop that catches something, if the needle is near. */
function closeHint(s) {
  const th = s.thread;
  const n = s.needle;
  if (th.length < 6 || s.phase !== 'play') return null;
  const last = th[th.length - 1];
  let back = Math.hypot(n.x - last.x, n.y - last.y);
  let best = null;
  for (let i = th.length - 2; i >= 0; i--) {
    back += Math.hypot(th[i + 1].x - th[i].x, th[i + 1].y - th[i].y);
    if (back < CLOSE_GAP + 40) continue;
    const c = closestOnSegment(n.x, n.y, th[i], th[i + 1]);
    const d = Math.hypot(n.x - c.x, n.y - c.y);
    if (d < 80 && (!best || d < best.d)) best = { d, x: c.x, y: c.y, i };
  }
  if (!best) return null;
  const poly = [{ x: best.x, y: best.y }, ...th.slice(best.i + 1), { x: n.x, y: n.y }];
  const catches = s.moths.some((m) => pointInPolygon(m.x, m.y, poly)) || s.holes.some((h) => pointInPolygon(h.x, h.y, poly));
  return catches ? { x: best.x, y: best.y, k: 1 - best.d / 80 } : null;
}

function nextEventText(s) {
  const here = HOURS[s.hour];
  if (here.boss && s.moths.some((m) => m.kind === here.boss)) return `${SPECIES[here.boss].name}: 3 loops`;
  for (let i = s.hour + 1; i < HOURS.length; i++) {
    const H = HOURS[i];
    if (H.boss) return `${H.label}: ${SPECIES[H.boss].name}`;
    if (H.swarm) return `${H.label}: a swarm`;
  }
  return `Dawn at ${DAWN_LABEL}`;
}

// ---------------------------------------------------------------------------------------
// Screens

function setScreen(name) {
  const relayout = (name === 'title') !== (ui.screen === 'title');
  ui.screen = name;
  ui.frozen = false;
  if (relayout) layout();
  if (name !== 'play') $('#banner').classList.remove('show');
  document.body.dataset.screen = name;
  $('#hud').hidden = name === 'title' || name === 'over' || name === 'dawn' || name === 'notion';
  const ov = $('#overlay');
  if (name === 'title') ov.innerHTML = titleHTML();
  else if (name === 'notion') {
    ov.innerHTML = notionHTML(ui.night);
    ui.busyUntil = performance.now() + 350; // ignore a click or key already in flight from play
  }
  else if (name === 'paused') ov.innerHTML = pauseHTML();
  else if (name === 'over' || name === 'dawn') {
    ov.innerHTML = endHTML(ui.night);
    paintEnd(ui.night);
  } else ov.innerHTML = '';
  ov.className = name;
  if (name === 'play' || name === 'title') updateHUD(activeState());
  const focus = ov.querySelector('[data-autofocus]');
  if (focus && matchMedia('(hover: hover)').matches) focus.focus({ preventScroll: true });
}

const key = (k) => `<kbd class="key">${k}</kbd>`;

function titleHTML() {
  const best = profile.best ? `<p class="title-best">Your best: ${profile.best.toLocaleString('en-US')}${profile.dawns ? `, ${profile.dawns} dawn${profile.dawns > 1 ? 's' : ''}` : ''}</p>` : '';
  const found = CASE_ORDER.filter((k) => profile.caught[k]).length;
  const dailyLine = daily.seed === dailySeed() && daily.tries ? `Best today ${daily.best.toLocaleString('en-US')}` : 'Same moths for everyone today';
  return `
  <div class="title-card pinked">
    <h1 class="title-word">${stitchSVG('NIGHT', { cell: 9, color: '#b5362f', shade: '#7e231e', label: 'Night' })}${stitchSVG('STITCH', { cell: 9, color: '#33478c', shade: '#222f61', label: 'Stitch' })}</h1>
    <p class="title-sub">Steer the needle around the moths. Cross your own thread to close the loop and stitch them in. Keep the linen whole until dawn.</p>
    <div class="title-buttons">
      <button class="tag big" data-action="start-daily" data-autofocus><span>Tonight's pattern</span><small>${dailyLine}</small></button>
      <button class="tag" data-action="start-free"><span>Free stitching</span><small>A new night every time</small></button>
      <div class="title-row">
        <button class="tag small" data-action="case">Specimen case <small>${found}/${CASE_ORDER.length}</small></button>
        <button class="tag small" data-action="help">How to play</button>
      </div>
    </div>
    ${best}
  </div>`;
}

function notionHTML(s) {
  const next = HOURS[s.hour + 1];
  const words = { '11 PM': 'eleven', Midnight: 'midnight', '1 AM': 'one', '2 AM': 'two', '3 AM': 'three', '4 AM': 'four', '5 AM': 'five' };
  const cards = s.offers
    .map((id, i) => {
      const n = NOTIONS.find((x) => x.id === id);
      const lvl = s.notions[id] || 0;
      const pips = n.max > 1 ? `<span class="pips">${Array.from({ length: n.max }, (_, k) => `<i class="${k < lvl ? 'had' : k === lvl ? 'new' : ''}"></i>`).join('')}</span>` : '';
      return `<button class="notion pinked" data-action="notion" data-id="${id}" ${i === 0 ? 'data-autofocus' : ''}>
        <span class="notion-icon">${notionIcon(id)}</span>
        <span class="notion-name">${n.name}</span>
        <span class="notion-text">${n.text}</span>
        ${pips}
        <span class="notion-key">${key(i + 1)}</span>
      </button>`;
    })
    .join('');
  const warn = next.boss ? `<p class="notion-warn">${SPECIES[next.boss].name} this hour. ${SPECIES[next.boss].note}</p>` : next.swarm ? '<p class="notion-warn">A swarm is coming this hour.</p>' : '';
  return `<div class="notion-panel">
    <h2 class="notion-head">The clock strikes ${words[next.label] || next.label}</h2>
    <p class="notion-sub">Take one notion for the rest of the night.</p>
    ${warn}
    <div class="notion-cards">${cards}</div>
  </div>`;
}

function pauseHTML() {
  return `<div class="modal-card pinked pause-card">
    <h2>Paused</h2>
    <p>${E.clockLabel(ui.night)}, fabric ${Math.round(E.integrity(ui.night) * 100)}%.</p>
    <div class="row">
      <button class="tag big" data-action="resume" data-autofocus>Resume ${key('P')}</button>
      <button class="tag" data-action="quit">End the night</button>
    </div>
  </div>`;
}

function endNight(s) {
  if (ui.endShown) return;
  ui.endShown = true;
  const caughtNow = s.stats.caught;
  const fresh = [];
  for (const [k, n] of Object.entries(caughtNow)) {
    if (!profile.caught[k]) fresh.push(k);
    profile.caught[k] = (profile.caught[k] || 0) + n;
  }
  for (const [k, n] of Object.entries(s.stats.gilded)) {
    if (!profile.gilded[k]) fresh.push(`gilded:${k}`);
    profile.gilded[k] = (profile.gilded[k] || 0) + n;
  }
  ui.freshSpecies = fresh;
  ui.prevBest = profile.best;
  profile.best = Math.max(profile.best, s.score);
  profile.bestLoop = Math.max(profile.bestLoop, s.stats.biggestLoop);
  if (s.phase === 'dawn') profile.dawns++;
  saveProfile();
  const label = s.phase === 'dawn' ? `${s.score.toLocaleString('en-US')} at dawn` : `${s.score.toLocaleString('en-US')} pts`;
  recordBest(SLUG, s.score, label);
  if (s.daily) {
    daily.best = Math.max(daily.best, s.score);
    saved.set('daily', daily);
  }
  const wait = reducedMotion() ? 100 : s.phase === 'dawn' ? 2200 : 1400;
  setTimeout(() => ui.night === s && setScreen(s.phase), wait);
}

function inscription(s) {
  const d = new Date();
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const date = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  const first = s.phase === 'dawn' ? `DAWN ${date}` : `TORN ${E.clockLabel(s).replace(' ', '')}`;
  return [
    { text: first, color: '#33478c', shade: '#222f61' },
    { text: s.score.toLocaleString('en-US'), color: '#b5362f', shade: '#7e231e' },
  ];
}

function endHTML(s) {
  const won = s.phase === 'dawn';
  const caught = Object.values(s.stats.caught).reduce((a, b) => a + b, 0);
  const isBest = s.score > ui.prevBest && s.score > 0;
  const head = won ? 'Dawn. The sampler is finished.' : `The linen tore at ${E.clockLabel(s)}.`;
  const names = ui.freshSpecies.map((k) => (k.startsWith('gilded:') ? `gilded ${SPECIES[k.slice(7)].name.toLowerCase()}` : SPECIES[k].name.toLowerCase()));
  const fresh = names.length > 4 ? [...names.slice(0, 3), `${names.length - 3} more`] : names;
  const rows = [
    ['Moths stitched', caught],
    ['Biggest loop', s.stats.biggestLoop ? `${s.stats.biggestLoop} moths` : 'none'],
    ['Holes darned', s.stats.darned],
    ['Thread snapped', `${s.stats.snaps} time${s.stats.snaps === 1 ? '' : 's'}`],
  ];
  if (won) rows.push(['Fabric left', `${Math.round(E.integrity(s) * 100)}% (+${s.dawnBonus.toLocaleString('en-US')})`]);
  const dailyLine = s.daily ? `<p class="end-daily">Tonight's pattern: best ${daily.best.toLocaleString('en-US')} from ${daily.tries} night${daily.tries > 1 ? 's' : ''}.</p>` : '';
  return `<div class="end ${won ? 'won' : 'lost'}">
    <div class="end-sampler"><canvas id="sampler" aria-label="Your finished sampler"></canvas></div>
    <div class="end-card pinked">
      <h2>${head}</h2>
      <div class="end-score">${stitchSVG(s.score.toLocaleString('en-US'), { cell: 6, color: '#b5362f', shade: '#7e231e' })}</div>
      <p class="end-best">${isBest ? 'A new best.' : `Your best: ${profile.best.toLocaleString('en-US')}`}</p>
      <dl class="end-stats">${rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>
      ${fresh.length ? `<p class="end-new">New in your case: ${listText(fresh)}.</p>` : ''}
      ${dailyLine}
      <div class="row">
        <button class="tag big" data-action="again" data-autofocus>Stitch again ${key('Enter')}</button>
        <button class="tag" data-action="save">Save sampler</button>
        <button class="tag" data-action="case">Specimen case</button>
        <button class="tag" data-action="title">Title</button>
      </div>
    </div>
  </div>`;
}

/** Download the end-screen sampler as a PNG. */
function saveSampler() {
  const c = $('#sampler');
  if (!c?.toBlob) return;
  c.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `night-stitch-sampler-${dailySeed()}.png`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

function paintEnd(s) {
  const c = $('#sampler');
  if (!c) return;
  const size = Math.min(520, Math.max(260, Math.min(window.innerWidth - 32, window.innerHeight * 0.62)));
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  R.sampler(c, s, { size, inscription: inscription(s), tear: s.phase === 'over' ? 1 : 0 });
}

// ---------------------------------------------------------------------------------------
// Modals

function openModal(html) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-back" data-action="close-modal"></div><div class="modal-card pinked" role="dialog" aria-modal="true">${html}<button class="tag close" data-action="close-modal" data-autofocus>Close ${key('Esc')}</button></div>`;
  root.classList.add('open');
  if (ui.screen === 'play') pause();
  root.querySelector('[data-autofocus]')?.focus({ preventScroll: true });
}

function closeModal() {
  const root = $('#modal-root');
  root.classList.remove('open');
  root.innerHTML = '';
}

const modalOpen = () => $('#modal-root').classList.contains('open');

function helpHTML() {
  const hover = matchMedia('(hover: hover)').matches;
  return `<h2>How to play</h2>
  <ol class="how">
    <li><b>Steer the needle.</b> ${hover ? 'It follows your mouse or trackpad; no clicking needed. Arrow keys work too.' : 'Drag your finger; it follows. Lift and touch elsewhere to start a fresh thread.'}</li>
    <li><b>Cross your own thread</b> to close a loop. Every moth inside is stitched in. More moths in one loop multiply the score.</li>
    <li><b>Settled moths eat holes.</b> Catch them to darn their hole, or loop an old hole to mend it. If the fabric reaches 0%, the night is over.</li>
    <li><b>Mind the edges.</b> Settled moths take off if the needle comes close, and carpet beetles bite through thread.</li>
    <li><b>Last until dawn.</b> At each chime, pick a sewing notion. Bosses take three loops.</li>
  </ol>
  <p class="how-keys">${key('P')} pause ${key('M')} sound ${key('1')}${key('2')}${key('3')} notions</p>`;
}

function caseHTML() {
  const cells = CASE_ORDER.map((k) => {
    const n = profile.caught[k] || 0;
    const g = profile.gilded[k] || 0;
    const sp = SPECIES[k];
    return `<div class="specimen ${n ? 'found' : 'missing'}">
      <canvas data-kind="${k}" data-found="${n ? 1 : 0}" width="120" height="96" aria-hidden="true"></canvas>
      <div class="specimen-name">${n ? sp.name : 'Not yet stitched'}</div>
      <div class="specimen-meta">${n ? `<i>${sp.latin}</i>` : ''}</div>
      <div class="specimen-count">${n ? `${n.toLocaleString('en-US')} stitched` : ''}${g ? `<span class="gilded-mark">${g} gilded</span>` : ''}</div>
      ${n ? `<p class="specimen-note">${sp.note}</p>` : ''}
    </div>`;
  }).join('');
  return `<h2>Specimen case</h2><p class="case-sub">Every moth you have stitched, across all your nights. Rare gilded moths shine gold and are worth five times as much.</p><div class="case-grid">${cells}</div>`;
}

function paintCase() {
  for (const c of document.querySelectorAll('.specimen canvas')) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = 120 * dpr;
    c.height = 96 * dpr;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const kind = c.dataset.kind;
    const sp = SPECIES[kind];
    const s = Math.min(44, 16 + sp.size * 0.75);
    const found = c.dataset.found === '1';
    drawMoth(ctx, kind, 60, 48, -Math.PI / 2, { s, emb: found, transfer: !found, gilded: found && (profile.gilded[kind] || 0) > 0 });
  }
}

// ---------------------------------------------------------------------------------------
// Pause, input

function pause() {
  if (ui.screen !== 'play') return;
  setScreen('paused');
}

function resume() {
  if (ui.screen !== 'paused') return;
  loop.resync();
  steps.reset();
  setScreen('play');
}

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a !== 'close-modal') audio.click();
  switch (a) {
    case 'start-daily':
      startNight('daily');
      break;
    case 'start-free':
      startNight('free');
      break;
    case 'again':
      startNight(ui.mode);
      break;
    case 'title':
      closeModal();
      newAttract();
      setScreen('title');
      break;
    case 'notion':
      pickNotion(el.dataset.id);
      break;
    case 'pause':
      if (ui.screen === 'play') pause();
      else if (ui.screen === 'paused') resume();
      break;
    case 'resume':
      resume();
      break;
    case 'quit':
      if (ui.night) {
        ui.night.phase = 'over';
        ui.night.events.push({ type: 'over' });
        setScreen('play');
        handleEvents(ui.night);
      }
      break;
    case 'mute':
      updateMute(sfx.toggleMute());
      break;
    case 'help':
      openModal(helpHTML());
      break;
    case 'case':
      openModal(caseHTML());
      paintCase();
      break;
    case 'close-modal':
      closeModal();
      break;
    case 'save':
      saveSampler();
      break;
  }
});

function pickNotion(id) {
  const s = ui.night;
  if (!s || s.phase !== 'notion' || performance.now() < ui.busyUntil) return;
  if (E.chooseNotion(s, id)) {
    audio.pick();
    loop.resync();
    steps.reset();
    setScreen('play');
    handleEvents(s);
  }
}

function updateMute(m) {
  const b = $('#btn-mute');
  b.classList.toggle('muted', m);
  b.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
}

document.addEventListener('keydown', (ev) => {
  const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  ui.frozen = false;
  if (modalOpen()) {
    if (k === 'Escape') closeModal();
    return;
  }
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'w', 'a', 's', 'd'].includes(k)) {
    if (ui.screen === 'play') {
      ui.keys.add(k);
      ui.pointer = null;
      ev.preventDefault();
    }
    return;
  }
  if (k === 'm') updateMute(sfx.toggleMute());
  else if (k === 'p' || k === 'Escape') {
    if (ui.screen === 'play') pause();
    else if (ui.screen === 'paused') resume();
  } else if (ui.screen === 'notion' && ['1', '2', '3'].includes(k)) {
    const id = ui.night.offers[Number(k) - 1];
    if (id) pickNotion(id);
  } else if ((ui.screen === 'over' || ui.screen === 'dawn') && k === 'Enter' && document.activeElement === document.body) {
    startNight(ui.mode);
  }
});
document.addEventListener('keyup', (ev) => {
  const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  ui.keys.delete(k);
});

canvas.addEventListener('pointermove', (ev) => {
  if (ui.screen !== 'play') return;
  ui.frozen = false;
  if (ev.pointerType === 'touch' && !ev.isPrimary) return;
  ui.pointer = R.toWorld(ev.clientX, ev.clientY);
});
canvas.addEventListener('pointerdown', (ev) => {
  if (ui.screen !== 'play') return;
  const p = R.toWorld(ev.clientX, ev.clientY);
  if (ev.pointerType !== 'mouse') {
    // Touching down near the needle carries on the same thread; elsewhere re-threads there.
    const n = ui.night?.needle;
    const near = n && Math.hypot(p.x - n.x, p.y - n.y) * R.scale < 56;
    if (!near) ui.touchJump = p;
    canvas.setPointerCapture?.(ev.pointerId);
  }
  ui.pointer = p;
});
canvas.addEventListener('pointerup', (ev) => {
  if (ev.pointerType !== 'mouse') ui.pointer = null;
});

onHidden(() => {
  ui.keys.clear();
  pause();
});
window.addEventListener('resize', () => {
  layout();
  if (ui.screen === 'over' || ui.screen === 'dawn') paintEnd(ui.night);
});

// ---------------------------------------------------------------------------------------
// Main loop

const steps = fixedSteps(E.DT);

/** Advance the game by dt seconds of real time (fixed 60 Hz engine steps inside). */
function update(dt) {
  ui.clock += dt;
  const s = activeState();
  const running = !ui.frozen && ((ui.screen === 'play' && s && s.phase === 'play') || (ui.screen === 'title' && s));
  if (running) {
    steps.run(dt, () => {
      const inp = ui.screen === 'title' ? ui.attractBot(s, E.DT) : input();
      tickState(s, inp);
      handleEvents(s);
      return s.phase === 'play';
    });
    if (ui.screen === 'title') {
      if (s.phase === 'notion') E.chooseNotion(s, botPickNotion(s, ui.attractRng));
      if (s.phase !== 'play' && s.phase !== 'notion') newAttract();
      else if (E.integrity(s) < 0.5 || s.t > 150) newAttract();
    } else {
      ui.tickT += dt;
      const every = E.integrity(s) < 0.35 ? 0.5 : 1;
      if (ui.tickT >= every) {
        ui.tickT = 0;
        ui.tock = !ui.tock;
        audio.tick(ui.tock);
      }
    }
  }
  if (ui.night && ui.night.phase === 'dawn') ui.dawnK = Math.min(1, ui.dawnK + dt * 0.5);
  processReveals();
  ui.running = running;
}

function render(dt) {
  const running = ui.running;
  const st = activeState();
  if (st) {
    // Needle angle follows its travel.
    const prev = ui.prevNeedle || st.needle;
    const a = steps.alpha;
    const nx = prev.x + (st.needle.x - prev.x) * a;
    const ny = prev.y + (st.needle.y - prev.y) * a;
    const mvx = st.needle.x - prev.x;
    const mvy = st.needle.y - prev.y;
    if (Math.hypot(mvx, mvy) > 0.8) {
      const target = Math.atan2(mvy, mvx);
      let d = target - ui.needleAngle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      ui.needleAngle += d * Math.min(1, dt * 14);
    }
    R.frame({
      state: st,
      t: ui.clock,
      alpha: running ? a : 1,
      needle: { x: nx, y: ny },
      needleAngle: ui.needleAngle,
      fx: ui.fx,
      ghosts: ui.ghosts,
      particles: ui.particles,
      revealed: ui.revealed,
      showNeedle: ui.screen !== 'over' && ui.screen !== 'dawn' && !(st.phase === 'over' || st.phase === 'dawn'),
      embAlpha: ui.thumb && ui.frozen ? 0.85 : st.phase === 'play' || st.phase === 'notion' ? 0.5 : 1,
      dawn: ui.dawnK,
      pointer: ui.screen === 'play' ? ui.pointer : null,
      hint: ui.screen === 'play' || ui.screen === 'title' ? closeHint(st) : null,
      tear: ui.tearAt != null && st === ui.night ? Math.min(1, (ui.clock - ui.tearAt) / 0.6) : 0,
      guide: ui.screen === 'play' ? firstGuide(st) : null,
    });
    if (ui.screen !== 'title') updateHUD(st);
  }
}

// ---------------------------------------------------------------------------------------
// Boot

homeLink({ parent: $('#home-slot') });
buildClock();
updateMute(sfx.muted);
layout();
newAttract();
setScreen('title');
const loop = createLoop({ update, render });

function liveNight() {
  if (!ui.night || ui.screen === 'title') startNight('free');
  return ui.night;
}

markReady({
  get state() {
    return ui.night;
  },
  ui,
  sfx,
  startNight,
  /** Put a moth somewhere (settled or flying). */
  spawn(kind = 'clothes', x = 0, y = 0, opts = {}) {
    return E.addMoth(liveNight(), kind, x, y, opts);
  },
  /** Drive the needle through points as real input would, one step per point. */
  drive(pts) {
    const s = liveNight();
    for (const p of pts) {
      tickState(s, { target: p });
      handleEvents(s);
    }
  },
  /** Walk the needle to the circle's edge, then trace one full turn and a bit around (x, y). */
  loopAround(x, y, r = 120) {
    const s = liveNight();
    const start = { x: x + r, y };
    for (let i = 0; i < 240 && Math.hypot(s.needle.x - start.x, s.needle.y - start.y) > 1; i++) {
      tickState(s, { target: start });
      handleEvents(s);
    }
    const pts = [];
    for (let i = 0; i <= 100; i++) pts.push({ x: x + Math.cos((i / 90) * Math.PI * 2) * r, y: y + Math.sin((i / 90) * Math.PI * 2) * r });
    this.drive(pts);
  },
  /**
   * Run the real update loop for `seconds` on a manual clock, then draw once. For testing
   * in a background tab, where requestAnimationFrame does not run. `path(t)` may return a
   * world point for the pointer at time t.
   */
  advance(seconds = 1, path = null) {
    loop.advance(seconds, (t) => {
      const p = path?.(t);
      if (p) ui.pointer = p;
    });
    return { screen: ui.screen, t: activeState()?.t };
  },
  /** The shared loop: set loop.manual = true to stop real time while testing. */
  get loop() {
    return loop;
  },
  /** Skip to the end of the current hour (the chime and notion pick follow). */
  endHour() {
    const s = liveNight();
    s.hourT = HOUR_LEN - E.DT;
  },
  setHour(h) {
    const s = liveNight();
    s.hour = h;
    s.hourT = 0;
  },
  tear() {
    const s = liveNight();
    E.addHole(s, 0, 0, 200);
  },
  dawn() {
    const s = liveNight();
    s.hour = HOURS.length - 1;
    s.hourT = HOUR_LEN - E.DT;
  },
  prepareThumbnail() {
    // A sampler mid-night: colourful finished loops, a cluster about to be cinched (thread
    // most of the way round, the close-here glow showing), a gilded moth, a luna, a beetle.
    ui.quiet = true; // no banners, floats or shakes while staging
    startNight('free');
    const s = ui.night;
    s.director = false;
    s.hour = 3;
    s.hourT = 14;
    const groups = [
      [-230, -170, ['clothes', 'house', 'clothes'], 105],
      [-20, -300, ['tiger', 'clothes'], 95],
      [230, -160, ['rosy', 'clothes', 'house', 'clothes'], 110],
      [-300, 60, ['house', 'clothes'], 95],
      [250, 110, ['tiger', 'rosy', 'clothes'], 105],
      [-170, 250, ['clothes', 'clothes', 'house', 'rosy'], 110],
      [140, 300, ['hawk', 'clothes'], 95],
      [-30, -120, ['clothes', 'clothes'], 85],
    ];
    for (const [gx, gy, kinds, r] of groups) {
      kinds.forEach((k, i) => E.addMoth(s, k, gx + Math.cos(i * 2.1) * r * 0.32, gy + Math.sin(i * 2.1) * r * 0.32, { settled: true, frozen: true }));
      this.loopAround(gx, gy, r);
    }
    E.addHole(s, 330, -10, 16);
    E.addHole(s, -90, 360, 12);
    // The cluster being looped right now.
    const cx = 40;
    const cy = 110;
    ['clothes', 'house', 'tiger', 'clothes', 'rosy'].forEach((k, i) =>
      E.addMoth(s, k, cx + Math.cos(i * 1.3) * 42, cy + Math.sin(i * 1.3) * 42, { settled: true, frozen: true }),
    );
    E.addMoth(s, 'rosy', -150, 20, { gilded: true, frozen: true });
    E.addMoth(s, 'luna', 200, -20, { frozen: true });
    E.addMoth(s, 'clothes', 330, 220, { frozen: true });
    E.addMoth(s, 'house', -330, -60, { frozen: true });
    E.addBeetle(s, -250, 150, { heading: -0.4 }).frozen = true;
    for (const m of s.moths) m.t = 0.4 + (m.id % 5) * 0.37; // varied wing beats
    ui.reveals = [];
    ui.revealed = s.history.length;
    ui.ghosts = [];
    ui.fx = [];
    const r = 128;
    this.drive([{ x: cx + r, y: cy }, ...Array.from({ length: 80 }, (_, i) => ({ x: cx + Math.cos((i / 90) * Math.PI * 2) * r, y: cy + Math.sin((i / 90) * Math.PI * 2) * r }))]);
    s.events.length = 0;
    s.director = true;
    ui.quiet = false;
    ui.thumb = true;
    document.querySelectorAll('.cg-float').forEach((el) => el.remove());
    $('#loopnote').classList.remove('fresh');
    setScreen('play');
    $('#banner').classList.remove('show');
    ui.frozen = true; // hold still for the screenshot; any input thaws it
  },
});
