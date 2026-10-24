// First Light: wiring. Screens (title with a demo flight, play, certificate), input (hold the
// burner and vent, drag to look), photos into the album, saving mid-flight, and the sunrise.
import { homeLink, markReady, recordBest, recordPlay, store, onHidden, reducedMotion } from '../../../shared/arcade.js';
import { createLoop, fixedSteps } from '../../../shared/loop.js';
import { dailySeed } from '../../../shared/rng.js';
import { shake, countUp, sleep } from '../../../shared/juice.js';
import { getTerrain, SPECIALS, ERCIYES_AZ, HALF } from './terrain.js';
import { createFlight, step, DT, dropMarker, dropTarget, predictMarker, takePhoto, scoreOf, restore, K } from './engine.js';
import { createSky, advanceSky } from './ambient.js';
import { createPilot } from './bot.js';
import { createRenderer } from './render.js';
import { drawMinimap, drawLadder, createLabels, labelItems, valleyMap } from './hud.js';
import { createAudio } from './audio.js';

const SLUG = 'first-light';
const saved = store(SLUG);
const audio = createAudio(SLUG);
const $ = (s) => document.querySelector(s);
const app = $('#app');
const DEG = Math.PI / 180;
const reduced = reducedMotion();
const phoneish = matchMedia('(hover: none)').matches;
const T = getTerrain();

const ALL_PAGES = [...T.landmarks.map((m) => ({ id: m.id, name: m.name, fact: m.fact, hint: m.hint, kind: 'place' })), ...SPECIALS.map((s) => ({ ...s, kind: 'moment' }))];

homeLink({ parent: $('.home-slot') });

let render;
try {
  render = createRenderer($('#view'), { lowPower: phoneish });
} catch (e) {
  app.dataset.screen = 'nogl';
  app.insertAdjacentHTML('beforeend', `<div class="overlay nogl"><div class="panel"><h2>This browser can’t draw the valley</h2><p>First Light needs WebGL. Try an up-to-date Chrome, Safari or Firefox, or turn on hardware acceleration.</p></div></div>`);
  throw e;
}
const labels = createLabels($('#labels'));

// ---------------------------------------------------------------- state

const ui = {
  screen: 'title',
  flight: null,
  sky: null,
  pilot: null,
  auto: false, // the bot flies the player's balloon (debug and smoke)
  input: { burn: false, vent: false },
  held: { burnKey: false, ventKey: false, burnPtr: new Set(), ventPtr: new Set() },
  look: { left: false, right: false },
  paused: false,
  prev: { x: 0, y: 0, z: 0 },
  now: 0,
  burnGlow: 0,
  album: saved.get('album', {}),
  flights: saved.get('flights', 0),
  photosThisFlight: {},
  coachKey: '',
  saveT: 0,
  momentShown: false,
  candidate: null,
  candT: 0,
  hudT: 0,
  landedAt: null,
  creakT: 0,
  birdT: 0,
  sunLookUntil: 0,
};

const steps = fixedSteps(DT);
const loop = createLoop({
  update(dt) {
    ui.now += dt;
    if (ui.paused || !ui.flight) return;
    steps.run(dt, tick);
  },
  render(dt) {
    draw(dt);
  },
});

// ---------------------------------------------------------------- flights

function newDemo() {
  // Already up among the others when the title appears.
  const flight = createFlight({ seed: 'demo-' + Math.floor(Math.random() * 1e6), mode: 'demo' });
  ui.pilot = createPilot({ skill: 0.85, seed: 5 });
  for (let i = 0; i < 60 * 30; i++) step(flight, ui.pilot.act(flight));
  flight.events.length = 0;
  return flight;
}

function begin(flight, sky = null) {
  ui.flight = flight;
  ui.sky = sky ?? createSky(flight);
  if (flight.t > 0) advanceSky(ui.sky, flight, flight.t);
  ui.prev = { x: flight.b.x, y: flight.b.y, z: flight.b.z };
  ui.momentShown = flight.mode !== 'demo' && flight.sun.lit;
  ui.landedAt = null;
  ui.candidate = null;
  steps.reset();
  render.setFlight(flight);
  render.resetCamera();
  // Face the first cross from the launch field.
  const c = flight.crosses[0];
  render.cam.yaw = Math.atan2(c.x - flight.b.x, -(c.z - flight.b.z));
  render.cam.init = true;
  audio.setLit(flight.sun.lit && flight.mode !== 'demo');
}

function showTitle() {
  ui.screen = 'title';
  app.dataset.screen = 'title';
  ui.auto = false;
  setInput(false, false);
  $('#title').hidden = false;
  $('#cert').hidden = true;
  $('#pause').hidden = true;
  ui.paused = false;
  render.setDistance(150);
  begin(newDemo());
  labels.clear();
  coach('');
  refreshTitle();
  audio.silence();
}

function refreshTitle() {
  const n = Object.keys(ui.album).length;
  $('#album-count').textContent = `${n} of ${ALL_PAGES.length}`;
  const day = dailySeed();
  const best = saved.get('daily', {})[day];
  $('#daily-note').textContent = best ? `Your best today: ${best.toLocaleString('en-US')}` : 'The same winds for everyone today';
  const stats = saved.get('stats', null);
  $('#best-line').textContent = stats?.best ? `Best flight: ${stats.best.toLocaleString('en-US')} points` : '';
  const s = saved.get('flight', null);
  const cont = document.querySelector('[data-action="continue"]');
  const ok = s && restore(structuredClone(s)) && s.phase !== 'landed';
  cont.hidden = !ok;
  if (ok) $('#continue-note').textContent = `${s.mode === 'daily' ? 'Today’s flight' : 'Free flight'}, ${clockOf(s.t)}`;
}

function startFlight(mode, seed = null) {
  audio.sfx.now(); // wake audio inside the gesture
  const day = dailySeed();
  const flight = createFlight({ seed: mode === 'daily' ? `daily-${day}` : seed ?? (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0), mode, day: mode === 'daily' ? day : null });
  enterPlay(flight);
  recordPlay(SLUG);
  ui.flights++;
  saved.set('flights', ui.flights);
}

function enterPlay(flight) {
  ui.quiet = false;
  ui.screen = 'play';
  app.dataset.screen = 'play';
  ui.auto = false;
  ui.photosThisFlight = {};
  $('#title').hidden = true;
  $('#cert').hidden = true;
  render.setDistance(72);
  begin(flight);
  saveFlight();
  audio.startMusic();
  coach('');
}

function continueFlight() {
  const s = restore(saved.get('flight', null));
  if (!s) return showTitle();
  enterPlay(s);
}

function saveFlight() {
  if (ui.screen !== 'play' || !ui.flight || ui.flight.mode === 'demo') return;
  if (ui.flight.phase === 'landed') saved.remove('flight');
  else saved.set('flight', { ...ui.flight, events: [] });
}

// ---------------------------------------------------------------- the step

function tick() {
  const f = ui.flight;
  const b = f.b;
  ui.prev.x = b.x;
  ui.prev.y = b.y;
  ui.prev.z = b.z;
  let input;
  if (ui.screen === 'play' && !ui.auto) {
    input = { burn: ui.input.burn, vent: ui.input.vent };
  } else if (ui.pilot) {
    input = ui.pilot.decide(f);
    if (input.drop) {
      if (ui.screen === 'play') doDrop();
      else dropMarker(f);
      ui.pilot.plan.dropAt = null;
      ui.pilot.plan.best = Infinity;
      ui.pilot.plan.next = 0;
    }
  } else input = {};
  step(f, input);
  advanceSky(ui.sky, f, f.t);
  for (const e of f.events.splice(0)) onEvent(e);
  if (ui.screen === 'title' && (f.phase === 'landed' || f.t > 240)) begin(newDemo());
  if (ui.screen === 'play') {
    ui.saveT += DT;
    if (ui.saveT > 3) {
      ui.saveT = 0;
      saveFlight();
    }
  }
}

function onEvent(e) {
  if (ui.screen !== 'play') return;
  const f = ui.flight;
  switch (e.type) {
    case 'liftoff':
      audio.liftoff();
      break;
    case 'firstLight':
      audio.setLit(true);
      if (e.airborne) firstLightMoment(e.alt);
      break;
    case 'drop':
      audio.drop();
      break;
    case 'markerLanded': {
      audio.thud(e.points);
      const c = f.crosses[e.cross];
      const what = e.d <= 3 ? 'Bullseye!' : e.points >= 700 ? 'Close!' : e.points > 0 ? 'On the field' : 'Missed the cross';
      flyToast(`<b>${what}</b> ${e.d.toFixed(1)} m from the ${crossName(c)} cross <em>+${e.points}</em>`, e.points >= 1000 ? 'gold' : '');
      if (e.points >= 1000) shake($('#view'), 1.5);
      break;
    }
    case 'scrape':
      audio.scrape();
      flyToast(`<b>Scraped a chimney</b> <em class="neg">−${K.bumpCost}</em>`, 'warn');
      shake($('#view'), 1.2);
      break;
    case 'bump':
      audio.bump();
      flyToast(`<b>Bump!</b> Too fast into the ground <em class="neg">−${K.bumpCost}</em>`, 'warn');
      shake($('#view'), 2);
      break;
    case 'touch':
      audio.touch();
      break;
    case 'lowFuel':
      audio.lowFuel();
      flyToast('<b>Propane is low.</b> Look for a field to land in.', 'warn');
      break;
    case 'noFuel':
      flyToast('<b>The tank is empty.</b> You will sink to the ground.', 'warn');
      break;
    case 'landed':
      audio.landed();
      ui.landedAt = ui.now;
      saved.remove('flight');
      setTimeout(() => ui.screen === 'play' && ui.flight === f && showCertificate(), reduced ? 300 : 1800);
      break;
  }
}

const crossName = (c) => ['gold', 'blue', 'pink'][c.id] ?? 'next';

// ---------------------------------------------------------------- drawing

function interp() {
  const b = ui.flight.b;
  const a = ui.paused ? 1 : steps.alpha;
  return { x: ui.prev.x + (b.x - ui.prev.x) * a, y: ui.prev.y + (b.y - ui.prev.y) * a, z: ui.prev.z + (b.z - ui.prev.z) * a };
}

function lightRamp(f) {
  if (f.mode === 'demo') return 0;
  if (!f.sun.lit) return 0;
  const k = Math.min(1, (f.t - f.sun.litAt) / (reduced ? 0.6 : 2.6));
  return k * k * (3 - 2 * k);
}

function draw(dt) {
  const f = ui.flight;
  if (!f) return;
  // Looking around with the arrow keys.
  const turn = (ui.look.right ? 1 : 0) - (ui.look.left ? 1 : 0);
  if (turn) render.look(turn * 1.3 * dt, 0, ui.now);
  ui.burnGlow += ((f.b.burning ? 1 : 0) - ui.burnGlow) * Math.min(1, dt * (f.b.burning ? 6 : 2.5));
  const pos = interp();
  const view = { flight: f, sky: ui.sky, pos, now: ui.now, dt, light: lightRamp(f), burnGlow: ui.burnGlow, reduced, demo: ui.screen !== 'play', lookSun: ui.screen === 'play' && ui.now < ui.sunLookUntil };
  if (f.mode === 'demo') view.sunElev = Math.min(f.sun.elev, 0.3);
  render.setShift(...titleShift());
  render.frame(view);
  if (ui.screen === 'play') {
    audio.update({ burning: f.b.burning, venting: f.b.venting, alt: f.b.y - T.groundAt(f.b.x, f.b.z), vy: f.b.vy, playing: !ui.paused && f.phase !== 'landed' });
    ambience(dt);
    hud(view);
  }
}

function titleShift() {
  if (ui.screen !== 'title') return [0, 0];
  const w = innerWidth;
  return w > 760 ? [0.2, 0] : [0, -0.16];
}

function hud(view) {
  const f = ui.flight;
  const b = f.b;
  const sc = scoreOf(f);
  $('#score').textContent = sc.total.toLocaleString('en-US');
  $('#propane').textContent = `${Math.ceil(b.fuel)}%`;
  $('#propane-bar').style.transform = `scaleX(${b.fuel / 100})`;
  app.classList.toggle('low-fuel', b.fuel <= 15);
  $('#clock').textContent = clockOf(f.t);
  const goal = f.crosses.find((c) => c === dropTarget(f)) ?? nextGoal(f);
  drawLadder($('#ladder'), { flight: f, yaw: render.cam.yaw, goal });
  drawMinimap($('#minimap'), { flight: f, yaw: render.cam.yaw, album: ui.album });
  const W = innerWidth;
  const H = innerHeight;
  labels.update(declutter(labelItems(render, f, ui.album, W, H)));
  // Controls.
  const c = dropTarget(f);
  const dropBtn = $('#drop');
  dropBtn.hidden = !c;
  if (c) {
    dropBtn.style.setProperty('--c', c.color);
    $('#drop-label').textContent = `Drop on ${crossName(c)}`;
  }
  ui.candT -= view.dt;
  if (ui.candT <= 0) {
    ui.candT = 0.15;
    ui.candidate = f.phase === 'flying' ? photoCandidate() : null;
  }
  const pb = $('#photo');
  pb.hidden = !ui.candidate;
  if (ui.candidate) $('#photo-label').textContent = ui.candidate.name;
  $('#burn').classList.toggle('on', b.burning);
  $('#burn').style.setProperty('--fuel', b.fuel / 100);
  $('#vent').classList.toggle('on', b.venting);
  coachUpdate();
}

/** Nudge labels apart vertically so none sits on another (crosses keep their place first). */
function declutter(items) {
  const placed = [];
  for (const it of items) {
    const w = it.cls.startsWith('place') ? 130 : 96;
    let y = it.y;
    for (let k = 0; k < 6; k++) {
      const hit = placed.find((p) => Math.abs(p.x - it.x) < (p.w + w) / 2 && Math.abs(p.y - y) < 32);
      if (!hit) break;
      y = hit.y + (y >= hit.y ? 34 : -34);
    }
    if (it.cls.startsWith('place') && placed.some((p) => Math.abs(p.x - it.x) < (p.w + w) / 2 && Math.abs(p.y - y) < 30)) continue;
    placed.push({ x: it.x, y, w });
    it.y = y;
  }
  return items.filter((it) => placed.some((p) => p.x === it.x && p.y === it.y));
}

function nextGoal(f) {
  let best = null;
  let bd = Infinity;
  for (const c of f.crosses) {
    if (c.dropped) continue;
    const d = Math.hypot(c.x - f.b.x, c.z - f.b.z);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

function clockOf(t) {
  const m = 6 * 60 + 4 + Math.floor(t / 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function ambience(dt) {
  const f = ui.flight;
  if (f.phase !== 'flying') return;
  ui.creakT -= dt;
  if (ui.creakT < 0) {
    ui.creakT = 4 + Math.random() * 7;
    audio.creak();
  }
  const clear = f.b.y - T.groundAt(f.b.x, f.b.z);
  ui.birdT -= dt;
  if (ui.birdT < 0) {
    ui.birdT = 5 + Math.random() * 9;
    if (clear < 90) audio.birds();
  }
}

// ---------------------------------------------------------------- coach

function coach(html, key = html) {
  if (ui.coachKey === key) return;
  ui.coachKey = key;
  const el = $('#coach');
  el.innerHTML = html ? `<p>${html}</p>` : '';
  el.classList.toggle('show', !!html);
}

function coachUpdate() {
  if (ui.quiet) return coach('');
  const f = ui.flight;
  const b = f.b;
  const first = ui.flights <= 2;
  const k = phoneish ? '' : ' (Space)';
  if (f.phase === 'landed') return coach('');
  if (f.phase === 'ready') return coach(`Hold the <b>Burner</b>${k} to heat the envelope and lift off.`, 'ready');
  if (b.onGround && f.t > 5) return coach('Landing. Hold the <b>Burner</b> to take off again.', 'settle');
  if (b.fuel <= 0) return coach('Out of propane: you are sinking. Let the basket settle.', 'empty');
  if (HALF - Math.max(Math.abs(b.x), Math.abs(b.z)) < 220) return coach('Near the edge of the valley. Change height to turn back: past the dashed line on the map, the flight ends.', 'edge');
  if (b.fuel <= 20) return coach('Propane is low. Come down gently on open ground, and let the basket settle.', 'low');
  if (ui.momentShown && f.sun.lit && f.t - f.sun.litAt < 6) return coach('');
  const c = dropTarget(f);
  if (c) return coach(first ? `In range. The dashed ring is where a marker would land: drop when it meets the ${crossName(c)} cross.` : '', 'drop' + c.id);
  if (!first) return coach('');
  if (!f.sun.lit && f.t < 90) return coach('Climb above the valley rim to see the sunrise.', 'rim');
  if (f.sun.lit && f.t - f.sun.litAt < 6) return coach('');
  if (!f.crosses.some((x) => x.dropped) && f.t < 160) return coach('Each height has its own wind, shown on the ladder. The gold one heads for a cross. On the map, the dotted line is where you will drift if you stay at this height.', 'ladder');
  if (f.t < 200 && !Object.keys(ui.photosThisFlight).length) return coach('When a landmark comes into view, <b>Photo</b> appears. Frame it well for more points.', 'photo');
  coach('');
}

// ---------------------------------------------------------------- toasts and the moment

function flyToast(html, cls = '') {
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.innerHTML = html;
  $('#toasts').append(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3200);
  while ($('#toasts').children.length > 3) $('#toasts').firstElementChild.remove();
}

function firstLightMoment(alt) {
  if (ui.momentShown) return;
  ui.momentShown = true;
  ui.sunLookUntil = ui.now + 6.5;
  audio.firstLight();
  const el = $('#moment');
  el.innerHTML = `<h2>First light</h2><p>from ${Math.round(alt - T.groundAt(ui.flight.b.x, ui.flight.b.z))} metres up <em>+${K.firstLight}</em></p>`;
  el.classList.remove('play');
  void el.offsetWidth;
  el.classList.add('play');
  const bloom = $('#bloom');
  bloom.classList.remove('play');
  void bloom.offsetWidth;
  bloom.classList.add('play');
}

// ---------------------------------------------------------------- photos

function lineOfSight(a, b) {
  for (let i = 1; i < 24; i++) {
    const t = i / 24;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const z = a.z + (b.z - a.z) * t;
    if (T.groundAt(x, z) > y + 3) return false;
  }
  return true;
}

function photoCandidate() {
  const f = ui.flight;
  const cam = render.camera;
  const half = (cam.fov * DEG) / 2;
  let best = null;
  const consider = (id, name, framing, aim) => {
    if (!best || framing > best.framing) best = { id, name, framing, aim };
  };
  for (const m of T.landmarks) {
    const s = m.subject;
    const d = Math.hypot(s.x - cam.position.x, s.y - cam.position.y, s.z - cam.position.z);
    if (d > 850) continue;
    const p = render.project(s.x, s.y, s.z);
    if (!p.front || Math.abs(p.nx) > 0.8 || Math.abs(p.ny) > 0.8) continue;
    if (!lineOfSight(cam.position, s)) continue;
    const size = Math.atan(m.r / d) / half;
    const sizeScore = 1 - Math.min(1, Math.abs(size - 0.4) / 0.4);
    const centre = 1 - Math.min(1, Math.hypot(p.nx, p.ny) / 0.85);
    consider(m.id, m.name, 0.55 * centre + 0.45 * sizeScore, { x: s.x, y: s.y, z: s.z, fov: Math.max(18, Math.min(60, ((Math.atan(m.r / d) * 2.6) / DEG))) });
  }
  // The sunrise: the sun itself in frame while it is low.
  if (f.sun.lit && f.sun.elev < 8) {
    const sd = render.sunDirection();
    const p = render.project(cam.position.x + sd.x * 1000, cam.position.y + sd.y * 1000, cam.position.z + sd.z * 1000);
    if (p.front && Math.abs(p.nx) < 0.8 && Math.abs(p.ny) < 0.8) consider('sunrise', 'Sunrise', 1 - Math.min(1, Math.hypot(p.nx, p.ny) / 0.9), { dir: sd, fov: 50 });
  }
  // Erciyes from above 300 m.
  if (f.b.y - T.groundAt(f.b.x, f.b.z) >= 300 || f.b.y >= 330) {
    const a = ERCIYES_AZ * DEG;
    const p = render.project(cam.position.x + Math.sin(a) * 5000, cam.position.y + 250, cam.position.z - Math.cos(a) * 5000);
    if (p.front && Math.abs(p.nx) < 0.75 && Math.abs(p.ny) < 0.8) consider('erciyes', 'Mount Erciyes', 1 - Math.min(1, Math.hypot(p.nx, p.ny * 0.6) / 0.85), { dir: { x: Math.sin(a), y: 0.03, z: -Math.cos(a) }, fov: 22 });
  }
  // A sky of balloons: a dozen in one frame.
  let n = 0;
  for (const k of ui.sky.balloons) {
    if (k.b.onGround) continue;
    const p = render.project(k.b.x, k.b.y + 12, k.b.z);
    if (p.front && Math.abs(p.nx) < 0.95 && Math.abs(p.ny) < 0.95 && Math.hypot(k.b.x - cam.position.x, k.b.z - cam.position.z) < 1800) n++;
  }
  if (n >= 12) {
    const fwd = render.camera.getWorldDirection(new render.camera.position.constructor());
    consider('sky', `${n} balloons`, Math.min(1, 0.45 + (n - 12) / 16), { dir: { x: fwd.x, y: fwd.y + 0.12, z: fwd.z }, fov: 64 });
  }
  return best;
}

function doPhoto() {
  const f = ui.flight;
  if (ui.screen !== 'play' || f.phase !== 'flying') return;
  const cand = photoCandidate();
  if (!cand) return;
  // The photo is the view from the basket, aimed at the subject.
  const from = { x: f.b.x, y: f.b.y + 2, z: f.b.z };
  const a = cand.aim;
  const to = a.dir ? { x: from.x + a.dir.x * 1000, y: from.y + a.dir.y * 1000, z: from.z + a.dir.z * 1000 } : a;
  const url = render.photo(from, to, { fov: a.fov });
  audio.shutter();
  const flash = $('#flash');
  flash.classList.remove('play');
  void flash.offsetWidth;
  flash.classList.add('play');
  const r = takePhoto(f, cand.id, cand.framing);
  if (!r) return;
  const page = ALL_PAGES.find((p) => p.id === cand.id);
  const had = ui.album[cand.id];
  ui.photosThisFlight[cand.id] = url;
  const better = !had || cand.framing > had.framing + 0.01;
  if (better) {
    ui.album[cand.id] = { framing: Math.round(cand.framing * 100) / 100, day: dailySeed() };
    saved.set('album', ui.album);
    saved.set(`photo:${cand.id}`, url);
  }
  const stars = '★'.repeat(1 + Math.round(cand.framing * 2)) + '☆'.repeat(2 - Math.round(cand.framing * 2));
  if (!had) flyToast(`<b>New in your album:</b> ${page.name} <span class="stars">${stars}</span> <em>+${r.gained}</em>`, 'gold');
  else if (r.gained > 0) flyToast(`<b>${page.name}</b>, a better shot <span class="stars">${stars}</span> <em>+${r.gained}</em>`);
  else flyToast(`<b>${page.name}</b> <span class="stars">${stars}</span> You have a better one from this flight.`);
}

function doDrop() {
  const f = ui.flight;
  if (ui.screen !== 'play') return;
  if (dropMarker(f)) $('#drop').hidden = true;
}

// ---------------------------------------------------------------- certificate

const BLESSING = 'The winds carried you kindly, the sun found you early, and the valley set you gently down again.';

async function showCertificate() {
  const f = ui.flight;
  ui.screen = 'cert';
  app.dataset.screen = 'cert';
  setInput(false, false);
  audio.silence();
  labels.clear();
  coach('');
  const sc = scoreOf(f);
  const best = recordBest(SLUG, sc.total, `${sc.total.toLocaleString('en-US')} pts`);
  let dayBest = false;
  if (f.mode === 'daily') {
    const d = saved.get('daily', {});
    if (!d[f.day] || sc.total > d[f.day]) {
      d[f.day] = sc.total;
      dayBest = true;
      // Keep the last few weeks.
      const keys = Object.keys(d).sort();
      while (keys.length > 40) delete d[keys.shift()];
      saved.set('daily', d);
    }
  }
  $('#cert').hidden = false;
  $('#cert-title').textContent = f.mode === 'daily' ? 'Today’s flight' : 'A free flight';
  const mins = Math.floor(f.t / 60);
  const secs = Math.round(f.t % 60);
  const high = Math.max(...f.track.map(([, y, , ], i) => y - T.groundAt(f.track[i][0], f.track[i][2])));
  $('#cert-sub').textContent = `From ${f.launch.name}, ${mins} min ${secs} s in the air, ${Math.round(high)} metres at the highest.`;
  drawCertMap($('#cert-map'), f);
  const lines = [];
  for (const c of f.crosses) {
    const label = c.result ? `${cap(crossName(c))} cross, ${c.result.d.toFixed(1)} m` : `${cap(crossName(c))} cross, not reached`;
    lines.push({ label, value: c.result?.points ?? 0, dot: c.color });
  }
  if (f.firstLight) lines.push({ label: `First light from ${Math.round(f.firstLight.agl ?? f.firstLight.alt)} m up`, value: f.firstLight.points });
  for (const p of f.photos) lines.push({ label: `Photo: ${ALL_PAGES.find((q) => q.id === p.id)?.name}`, value: p.points });
  if (f.landing) lines.push({ label: f.landing.label, value: f.landing.points });
  if (sc.propane) lines.push({ label: `${Math.round(f.landing.fuel)}% propane left`, value: sc.propane });
  else if (f.landing && f.landing.surface !== 'edge' && f.landing.fuel >= 1) lines.push({ label: `${Math.round(f.landing.fuel)}% propane left (counts once all three markers are down)`, value: 0 });
  const scrapes = f.scrapes ?? 0;
  const bumps = f.bumps - scrapes;
  const knocks = [bumps ? `${bumps} bump${bumps > 1 ? 's' : ''}` : '', scrapes ? `${scrapes} chimney scrape${scrapes > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ');
  if (f.bumps) lines.push({ label: cap(knocks), value: sc.bumps });
  const ol = $('#cert-lines');
  ol.innerHTML = lines.map((l) => `<li><span>${l.dot ? `<i style="--c:${l.dot}"></i>` : ''}${l.label}</span><b>${l.value < 0 ? '−' + Math.abs(l.value) : l.value.toLocaleString('en-US')}</b></li>`).join('') + `<li class="total"><span>Total</span><b id="cert-total">0</b></li>`;
  const prints = Object.entries(ui.photosThisFlight);
  $('#cert-photos').innerHTML = prints.map(([id, url]) => `<figure><img src="${url}" alt=""><figcaption>${ALL_PAGES.find((q) => q.id === id)?.name ?? ''}</figcaption></figure>`).join('');
  $('#cert-blessing').textContent = BLESSING;
  $('#cert-best').textContent = best ? 'Your best flight yet.' : dayBest ? 'Your best of today’s flight.' : '';
  $('#again-label').textContent = f.mode === 'daily' ? 'Fly today’s again' : 'Fly again';
  audio.cork();
  // Reveal the lines one by one, then count the total.
  const items = [...ol.children];
  items.forEach((li) => li.classList.add('wait'));
  for (const li of items) {
    if (ui.screen !== 'cert') return;
    li.classList.remove('wait');
    if (!li.classList.contains('total')) audio.tick();
    await sleep(reduced ? 0 : 260);
  }
  countUp($('#cert-total'), 0, sc.total, { ms: reduced ? 1 : 900 });
  await sleep(reduced ? 0 : 950);
  if (ui.screen === 'cert') audio.chime();
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

function drawCertMap(canvas, f) {
  const g = canvas.getContext('2d');
  const S = canvas.width;
  // Frame the flight: its track and crosses, with a margin.
  const xs = [...f.track.map((p) => p[0]), ...f.crosses.map((c) => c.x)];
  const zs = [...f.track.map((p) => p[2]), ...f.crosses.map((c) => c.z)];
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const span = Math.max(500, Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) * 1.25;
  const k = S / span;
  const X = (x) => S / 2 + (x - cx) * k;
  const Z = (z) => S / 2 + (z - cz) * k;
  g.clearRect(0, 0, S, S);
  g.drawImage(valleyMap(), X(-HALF), Z(-HALF), 2 * HALF * k, 2 * HALF * k);
  g.fillStyle = 'rgba(244, 233, 214, 0.25)';
  g.fillRect(0, 0, S, S);
  for (const c of f.crosses) {
    g.fillStyle = c.color;
    g.strokeStyle = '#1f2350';
    g.lineWidth = 2;
    for (const [w, h] of [[22, 6], [6, 22]]) {
      g.fillRect(X(c.x) - w / 2, Z(c.z) - h / 2, w, h);
      g.strokeRect(X(c.x) - w / 2, Z(c.z) - h / 2, w, h);
    }
    if (c.result) {
      g.fillStyle = '#1f2350';
      g.beginPath();
      g.arc(X(c.result.x), Z(c.result.z), 4, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.strokeStyle = '#2849a8';
  g.lineWidth = 4;
  g.lineJoin = 'round';
  g.setLineDash([10, 7]);
  g.beginPath();
  f.track.forEach(([x, , z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
  g.stroke();
  g.setLineDash([]);
  // Launch and landing.
  g.fillStyle = '#fbf7ef';
  g.strokeStyle = '#1f2350';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(X(f.launch.x), Z(f.launch.z), 8, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  const end = f.track.at(-1);
  g.fillStyle = '#ffc845';
  g.beginPath();
  g.arc(X(end[0]), Z(end[2]), 10, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // North.
  g.fillStyle = '#1f2350';
  g.font = '700 22px Marcellus, serif';
  g.textAlign = 'center';
  g.fillText('N', S - 26, 34);
  g.beginPath();
  g.moveTo(S - 26, 40);
  g.lineTo(S - 32, 56);
  g.lineTo(S - 20, 56);
  g.closePath();
  g.fill();
}

// ---------------------------------------------------------------- album

function openAlbum() {
  const grid = $('#album-grid');
  const n = Object.keys(ui.album).length;
  $('#album-sub').textContent = n ? `${n} of ${ALL_PAGES.length} pages. A better-framed photo replaces the old one.` : 'Empty for now. Photograph landmarks from the air to fill it.';
  grid.innerHTML = ALL_PAGES.map((p) => {
    const got = ui.album[p.id];
    const url = got ? saved.get(`photo:${p.id}`, null) : null;
    const hint = p.hint ?? 'Find it from the air.';
    return `<figure class="page${got ? ' got' : ''}">${url ? `<img src="${url}" alt="Your photo of ${p.name}">` : `<div class="blank" aria-hidden="true"></div>`}<figcaption><b>${p.name}</b><span>${got ? p.fact : hint}</span></figcaption></figure>`;
  }).join('');
  openSheet('#album');
}

function openSheet(sel) {
  const d = $(sel);
  if (!d.open) d.showModal();
  if (ui.screen === 'play' && !ui.paused) pause();
}

// ---------------------------------------------------------------- pause

function pause() {
  if (ui.screen !== 'play' || ui.paused) return;
  ui.paused = true;
  setInput(false, false);
  audio.silence();
  audio.stopMusic();
  saveFlight();
  if (!$('#album').open && !$('#help').open) $('#pause').hidden = false;
}

function resume() {
  if (!ui.paused) return;
  ui.paused = false;
  $('#pause').hidden = true;
  loop.resync();
  steps.reset();
  audio.startMusic();
}

onHidden(() => pause());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) audio.stopMusic();
});

// ---------------------------------------------------------------- input

function setInput(burn, vent) {
  ui.held.burnKey = ui.held.ventKey = false;
  ui.held.burnPtr.clear();
  ui.held.ventPtr.clear();
  ui.input.burn = burn;
  ui.input.vent = vent;
}

/** Pointer capture keeps a held button held when the thumb slides off; it can throw (a pointer
 * already gone), and that must never cost the input itself. */
function capture(el, id) {
  try {
    el.setPointerCapture(id);
  } catch {
    /* no capture: pointerup on the element still releases */
  }
}

function syncInput() {
  ui.input.burn = ui.held.burnKey || ui.held.burnPtr.size > 0;
  ui.input.vent = ui.held.ventKey || ui.held.ventPtr.size > 0;
}

for (const btn of document.querySelectorAll('[data-hold]')) {
  const which = btn.dataset.hold;
  const set = which === 'burn' ? ui.held.burnPtr : ui.held.ventPtr;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (ui.screen !== 'play' || ui.paused) return;
    set.add(e.pointerId);
    syncInput();
    capture(btn, e.pointerId);
  });
  const up = (e) => {
    set.delete(e.pointerId);
    syncInput();
  };
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('lostpointercapture', up);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Drag the view to look around.
const view = $('#view');
const drag = { id: null, x: 0, y: 0 };
view.addEventListener('pointerdown', (e) => {
  if (drag.id !== null) return;
  drag.id = e.pointerId;
  drag.x = e.clientX;
  drag.y = e.clientY;
  capture(view, e.pointerId);
});
view.addEventListener('pointermove', (e) => {
  if (e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  render.look((dx / innerWidth) * Math.PI * 1.2, (dy / innerHeight) * 1.2, ui.now);
});
const endDrag = (e) => {
  if (e.pointerId === drag.id) drag.id = null;
};
view.addEventListener('pointerup', endDrag);
view.addEventListener('pointercancel', endDrag);

const KEYS_BURN = new Set(['Space', 'ArrowUp', 'KeyW']);
const KEYS_VENT = new Set(['ArrowDown', 'KeyV', 'KeyS']);
addEventListener('keydown', (e) => {
  if ($('#album').open || $('#help').open) return;
  if (ui.screen === 'play' && !ui.paused) {
    if (KEYS_BURN.has(e.code)) {
      ui.held.burnKey = true;
      syncInput();
      e.preventDefault();
      return;
    }
    if (KEYS_VENT.has(e.code)) {
      ui.held.ventKey = true;
      syncInput();
      e.preventDefault();
      return;
    }
    if (e.code === 'ArrowLeft' || e.code === 'KeyQ') ui.look.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyE') ui.look.right = true;
    if (e.repeat) return;
    if (e.code === 'KeyD') doDrop();
    if (e.code === 'KeyP') doPhoto();
    if (e.code === 'Escape') pause();
  } else if (ui.screen === 'play' && ui.paused) {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      resume();
    }
  } else if (ui.screen === 'title') {
    if (e.code === 'Enter') startFlight('daily');
  } else if (ui.screen === 'cert') {
    if (e.code === 'Enter') again();
    if (e.code === 'Escape') showTitle();
  }
  if (e.repeat) return;
  if (e.code === 'KeyM') toggleSound();
  if (e.code === 'KeyN') toggleMusic();
  if (e.code === 'KeyH') openSheet('#help');
});
addEventListener('keyup', (e) => {
  if (KEYS_BURN.has(e.code)) ui.held.burnKey = false;
  if (KEYS_VENT.has(e.code)) ui.held.ventKey = false;
  if (e.code === 'ArrowLeft' || e.code === 'KeyQ') ui.look.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyE') ui.look.right = false;
  syncInput();
});
addEventListener('blur', () => {
  setInput(false, false);
  ui.look.left = ui.look.right = false;
});

function again() {
  const f = ui.flight;
  if (f.mode === 'daily') startFlight('daily');
  else startFlight('free');
}

function toggleSound() {
  const muted = audio.sfx.toggleMute();
  const b = document.querySelector('[data-action="sound"]');
  b.setAttribute('aria-pressed', String(!muted));
  b.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on');
  if (!muted && ui.screen === 'play' && !ui.paused) audio.startMusic();
}

function toggleMusic() {
  audio.setMusic(!audio.musicOn);
  const b = document.querySelector('[data-action="music"]');
  b.setAttribute('aria-pressed', String(audio.musicOn));
  b.setAttribute('aria-label', audio.musicOn ? 'Music on' : 'Music off');
  if (audio.musicOn && ui.screen === 'play' && !ui.paused) audio.startMusic();
}

app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const a = t.dataset.action;
  if (a === 'daily') startFlight('daily');
  if (a === 'free') startFlight('free');
  if (a === 'continue') continueFlight();
  if (a === 'album') openAlbum();
  if (a === 'help') openSheet('#help');
  if (a === 'close') t.closest('dialog').close();
  if (a === 'drop') doDrop();
  if (a === 'photo') doPhoto();
  if (a === 'resume') resume();
  if (a === 'menu') showTitle();
  if (a === 'again') again();
  if (a === 'sound') toggleSound();
  if (a === 'music') toggleMusic();
});
for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('close', () => {
    if (ui.screen === 'play' && ui.paused) $('#pause').hidden = false;
  });
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });
}

// Reflect saved toggles.
{
  const s = document.querySelector('[data-action="sound"]');
  s.setAttribute('aria-pressed', String(!audio.sfx.muted));
  s.setAttribute('aria-label', audio.sfx.muted ? 'Sound off' : 'Sound on');
  const m = document.querySelector('[data-action="music"]');
  m.setAttribute('aria-pressed', String(audio.musicOn));
  m.setAttribute('aria-label', audio.musicOn ? 'Music on' : 'Music off');
}

// ---------------------------------------------------------------- boot

showTitle();
valleyMap();

/** Step the game `seconds` on the manual clock (works in a hidden tab). */
function advance(seconds) {
  loop.manual = true;
  loop.advance(seconds);
}

/** Fly `seconds` with the given input held, through the same tick as play. */
function fly(seconds, input = {}) {
  loop.manual = true;
  const was = { ...ui.input };
  ui.input.burn = !!input.burn;
  ui.input.vent = !!input.vent;
  loop.advance(seconds);
  ui.input.burn = was.burn;
  ui.input.vent = was.vent;
}

markReady({
  get state() {
    return { screen: ui.screen, paused: ui.paused, flight: ui.flight, album: ui.album, candidate: ui.candidate, score: ui.flight ? scoreOf(ui.flight) : null };
  },
  loop,
  render,
  audio,
  advance,
  fly,
  start: (mode = 'free', seed = 4242) => startFlight(mode, seed),
  showTitle,
  continueFlight,
  pause,
  resume,
  drop: doDrop,
  photo: doPhoto,
  /** Where a marker dropped now would land, and how far that is from the cross in range. */
  predict() {
    const f = ui.flight;
    const c = dropTarget(f);
    const m = predictMarker(f);
    return { x: m.x, z: m.z, cross: c?.id ?? null, d: c ? Math.hypot(m.x - c.x, m.z - c.z) : null };
  },
  photoCandidate,
  openAlbum,
  /** Let the bot fly your balloon (drops go through the same path as the Drop button). */
  autopilot(on = true, skill = 0.9) {
    ui.auto = on;
    ui.pilot = on ? createPilot({ skill, seed: 11 }) : null;
  },
  /** Fly on with the autopilot until `until(flight)` or `max` seconds. */
  flyUntil(until, max = 120) {
    loop.manual = true;
    for (let t = 0; t < max * 60 && !until(ui.flight); t++) loop.advance(1 / 60);
    return until(ui.flight);
  },
  /** Point the camera at a place (radians clockwise from north). */
  face(yaw, pitch = 0.18) {
    render.cam.yaw = yaw;
    render.cam.pitch = pitch;
    render.cam.userT = ui.now + 1e6;
  },
  faceAt(x, z) {
    const b = ui.flight.b;
    render.cam.yaw = Math.atan2(x - b.x, -(z - b.z));
    render.cam.userT = ui.now + 1e6;
  },
  certificate: () => showCertificate(),
  prepareThumbnail() {
    // High over the valley a minute after first light, looking across the sunlit chimneys.
    startFlight('free', 777);
    ui.quiet = true;
    loop.manual = true;
    fly(9, { burn: true });
    for (let i = 0; i < 90 && ui.flight.b.y - T.groundAt(ui.flight.b.x, ui.flight.b.z) < 210; i++) fly(1, { burn: ui.flight.b.vy < 3 });
    fly(12, {});
    for (const id of ['#moment', '#bloom']) $(id).classList.remove('play');
    render.cam.yaw = K.sunAz + Math.PI * 0.82;
    render.cam.pitch = render.cam.basePitch = 0.16;
    render.cam.userT = ui.now + 1e6;
    coach('');
    loop.advance(1 / 60);
  },
});
