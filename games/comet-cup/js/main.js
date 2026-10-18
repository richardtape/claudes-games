import { homeLink, markReady, recordBest, recordPlay, store, reducedMotion, onHidden } from '../../../shared/arcade.js';
import { shake, toast } from '../../../shared/juice.js';
import { dailySeed } from '../../../shared/rng.js';
import { createLoop } from '../../../shared/loop.js';
import * as E from './engine.js';
import { BANK } from './bank.js';
import { buildCourse, coursePar, ROMAN, holeById } from './course.js';
import { createRenderer, GOLD, INK, SUN, VIOLET, TEAL } from './render.js';
import { createAudio, worldNote } from './audio.js';

const SLUG = 'comet-cup';
const SAVE_VERSION = 1;
const PREVIEW_STEPS = 100; // the dotted aim shows the first ~0.8 s of flight
const audio = createAudio(SLUG);
const saved = store(SLUG);
const $ = (s) => document.querySelector(s);
const wrap = $('#wrap');
const stage = $('#stage');
const overlay = $('#overlay');
const R = createRenderer({ paper: $('#paper'), stage });

const profile = Object.assign({ v: SAVE_VERSION, rounds: 0, aces: 0, holes: 0, best: null, dailies: {}, aced: {} }, saved.get('profile', {}));
const saveProfile = () => saved.set('profile', profile);

const ui = {
  screen: 'title', // title | play | holed | sheet
  paused: false,
  course: null, // { mode, seed, date, holes, index, scores, logs }
  st: null,
  aim: { angle: 0, power: 0.45 },
  aimSet: false,
  drag: null,
  preview: null,
  tail: [],
  ringing: new Map(),
  fx: [],
  t: 0,
  stepAcc: 0,
  fast: false,
  slowBudget: 0,
  drop: null,
  gild: null,
  ace: null,
  demo: null,
  respawn: null,
  cardAt: null,
  inputLock: 0,
  lastAim: null,
  hinted: saved.get('hinted', false),
};

// ---------------------------------------------------------------------------------------
// Courses and holes

function startCourse(mode) {
  const date = dailySeed();
  const seed = mode === 'daily' ? date : `r${Date.now().toString(36)}`;
  ui.course = { mode, seed, date, holes: buildCourse(seed), index: 0, scores: [], logs: [] };
  recordPlay(SLUG);
  startHole(0);
}

function resumeCourse(run) {
  const holes = run.ids.map((id) => holeById(id));
  if (holes.some((h) => !h)) return false;
  ui.course = { mode: run.mode, seed: run.seed, date: run.date, holes, index: Math.min(run.index, holes.length - 1), scores: run.scores, logs: run.logs };
  if (run.index >= holes.length) finishCourse(); // reloaded on the last plate's result
  else startHole(run.index, run.cur);
  return true;
}

function startHole(i, resume = null) {
  const c = ui.course;
  c.index = i;
  const hole = c.holes[i];
  ui.st = E.newHole(hole);
  if (resume) Object.assign(ui.st, { x: resume.x, y: resume.y, strokes: resume.strokes, penalties: resume.penalties, log: resume.log || [] });
  ui.screen = 'play';
  ui.paused = false;
  ui.demo = null;
  ui.fx = [];
  ui.tail = [];
  ui.ringing.clear();
  ui.drop = ui.gild = ui.ace = ui.respawn = ui.cardAt = null;
  ui.fast = false;
  ui.preview = null;
  ui.drag = null;
  ui.aimSet = false;
  ui.lastAim = null;
  ui.aim = { angle: Math.atan2(ui.st.w.cupY - ui.st.y, ui.st.w.cupX - ui.st.x), power: 0.45 };
  overlay.innerHTML = '';
  document.body.classList.remove('flying');
  R.setHole(hole);
  layout();
  R.repaintStatic(ui.st.log);
  updateHud();
  showIntro(hole, i);
  showHint();
  // Overture: each world rings its note once, left to right across the plate.
  ui.overture = ui.st.w.planets
    .slice()
    .sort((a, b) => a.x - b.x)
    .map((b, k) => ({ at: ui.t + 0.5 + k * 0.16, i: b.i }));
  ui.inputLock = performance.now() + 250;
  saveRun();
}

/** Strokes against par over the plates scored so far. */
const courseDiff = (c) => c.holes.reduce((d, h, i) => d + (c.scores[i] === undefined ? 0 : c.scores[i] - h.par), 0);

function nextHole() {
  const c = ui.course;
  if (!c) return;
  if (c.index < c.holes.length - 1) startHole(c.index + 1);
  else finishCourse();
}

function finishCourse() {
  const c = ui.course;
  const strokes = c.scores.reduce((s, v) => s + v, 0);
  const par = coursePar(c.holes);
  const diff = strokes - par;
  profile.rounds++;
  const newBest = profile.best === null || diff < profile.best;
  if (newBest) profile.best = diff;
  if (c.mode === 'daily') {
    const prev = profile.dailies[c.date];
    if (prev === undefined || diff < prev) profile.dailies[c.date] = diff;
  }
  saveProfile();
  recordBest(SLUG, diff, `${E.toPar(diff)} (${strokes})`, { lowerIsBetter: true });
  saved.remove('run');
  hideIntro();
  ui.lastCourse = c;
  ui.screen = 'sheet';
  ui.st = null;
  document.body.classList.remove('flying');
  updateHud();
  renderSheet({ strokes, par, diff, newBest });
}

// ---------------------------------------------------------------------------------------
// Saving: after every stroke, so a reload resumes where the comet rests.

function packPath(path) {
  const out = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (!p) out.push(null);
    else if (i % 3 === 0 || i === path.length - 1 || !path[i + 1] || !path[i - 1]) out.push([Math.round(p[0]), Math.round(p[1])]);
  }
  return out;
}
const packLog = (log) => log.filter((s) => s.end).map((s) => ({ end: s.end, path: packPath(s.path), notes: s.notes }));

function saveRun() {
  const c = ui.course;
  if (!c) return;
  // Once a plate is scored, a reload continues with the next one.
  const scored = c.scores[c.index] !== undefined;
  const st = ui.st;
  const cur = !scored && st && st.phase === 'aim' ? { x: st.x, y: st.y, strokes: st.strokes, penalties: st.penalties, log: packLog(st.log) } : null;
  const index = scored ? c.index + 1 : c.index;
  saved.set('run', { v: SAVE_VERSION, mode: c.mode, seed: c.seed, date: c.date, ids: c.holes.map((h) => h.id), index, scores: c.scores, logs: c.logs, cur });
}

function loadRun() {
  const run = saved.get('run', null);
  if (!run || run.v !== SAVE_VERSION) return null;
  if (run.mode === 'daily' && run.date !== dailySeed()) return null;
  return run;
}

// ---------------------------------------------------------------------------------------
// Aiming and shooting

function updatePreview() {
  const st = ui.st;
  if (!ui.aimSet || !st || st.phase !== 'aim') {
    ui.preview = null;
    return;
  }
  const { vx, vy } = E.aimVelocity(ui.aim.angle, ui.aim.power);
  ui.preview = E.simulate(st.w, st.x, st.y, vx, vy, { maxSteps: PREVIEW_STEPS, every: 5 }).path;
}

function setAim(angle, power) {
  ui.aim.angle = angle;
  ui.aim.power = Math.max(0, Math.min(1, power));
  // A soft ratchet every 10% of pull, like a slingshot's band.
  const notch = Math.floor(ui.aim.power * 10);
  if (notch !== ui.notch) {
    if (ui.aimSet) audio.tick(notch);
    ui.notch = notch;
  }
  ui.aimSet = true;
  updatePreview();
}

function shoot() {
  const st = ui.st;
  if (ui.screen !== 'play' || ui.paused || !st || st.phase !== 'aim') return false;
  const { vx, vy } = E.aimVelocity(ui.aim.angle, ui.aim.power);
  if (!E.launch(st, vx, vy)) return false;
  audio.launch(ui.aim.power);
  ui.lastAim = { ...ui.aim };
  ui.preview = null;
  ui.drag = null;
  ui.tail = [];
  ui.fast = false;
  ui.slowBudget = 1.8;
  ui.lipped = false;
  ui.stepAcc = 0;
  ui.respawn = null;
  ui.fx.push({ kind: 'ripple', x: st.x, y: st.y, r0: 6, r1: 40, t0: ui.t, dur: 0.45, color: INK, alpha: 0.6, width: 1.5 });
  document.body.classList.add('flying');
  hideHint();
  hideIntro();
  updateHud();
  return true;
}

const pullLen = () => Math.max(110, Math.min(250, Math.min(R.view.cssW, R.view.cssH) * 0.36));

function stagePoint(e) {
  const r = stage.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

stage.addEventListener('pointerdown', (e) => {
  if (performance.now() < ui.inputLock || ui.paused) return;
  if (ui.screen !== 'play' || !ui.st) return;
  if (ui.st.phase === 'fly') {
    ui.fast = true;
    return;
  }
  if (ui.st.phase !== 'aim') return;
  stage.setPointerCapture?.(e.pointerId);
  const p = stagePoint(e);
  ui.drag = { id: e.pointerId, x0: p.x, y0: p.y, live: false, L: 0 };
});

stage.addEventListener('pointermove', (e) => {
  const d = ui.drag;
  if (!d || d.id !== e.pointerId || !ui.st || ui.st.phase !== 'aim') return;
  const p = stagePoint(e);
  const dx = p.x - d.x0;
  const dy = p.y - d.y0;
  d.L = Math.hypot(dx, dy);
  if (d.L > 10) {
    d.live = true;
    const w = R.dirToWorld(-dx, -dy);
    setAim(Math.atan2(w.y, w.x), d.L / pullLen());
  } else if (d.live) {
    ui.aimSet = false; // pulled back to the start: cancel
    ui.preview = null;
  }
});

function endDrag(e, cancel = false) {
  const d = ui.drag;
  if (!d || d.id !== e.pointerId) return;
  ui.drag = null;
  if (!cancel && d.live && d.L > 14) shoot();
  else if (d.live) {
    ui.aimSet = false;
    ui.preview = null;
  }
}
stage.addEventListener('pointerup', (e) => endDrag(e));
stage.addEventListener('pointercancel', (e) => endDrag(e, true));

// ---------------------------------------------------------------------------------------
// The flight

function nearCup(st) {
  const f = st.flight;
  if (!f) return false;
  const d = Math.hypot(f.x - st.w.cupX, f.y - st.w.cupY);
  return d < 120 && Math.hypot(f.vx, f.vy) < 280;
}

function update(dt) {
  if (ui.paused) return;
  ui.t += dt;
  for (const [i, v] of ui.ringing) {
    const n = v - dt * 0.8;
    if (n <= 0) ui.ringing.delete(i);
    else ui.ringing.set(i, n);
  }
  if (ui.fx.length > 40 || ui.fx.some((f) => ui.t - f.t0 > f.dur)) ui.fx = ui.fx.filter((f) => ui.t - f.t0 <= f.dur);
  if (ui.screen === 'title') return updateDemo(dt);
  const st = ui.st;
  if (!st) return;
  while (ui.overture?.length && ui.t >= ui.overture[0].at) {
    const { i } = ui.overture.shift();
    audio.bell(worldNote(st.w.bodies[i].r), { vol: 0.07, dur: 1.4 });
    ui.ringing.set(i, 0.55);
  }
  if (st.phase === 'fly' && ui.screen === 'play') {
    let rate = 1 / E.DT;
    if (ui.fast) rate *= 4;
    else if (ui.slowBudget > 0 && nearCup(st) && !reducedMotion()) {
      rate *= 0.4;
      ui.slowBudget -= dt;
    }
    ui.stepAcc += dt * rate;
    while (ui.stepAcc >= 1 && st.phase === 'fly') {
      ui.stepAcc -= 1;
      const ev = E.tick(st);
      if (st.flight) pushTail(st.flight.x, st.flight.y);
      handleEvents(ev, st);
    }
  } else if (ui.tail.length) ui.tail.shift();
  if (ui.cardAt !== null && ui.t >= ui.cardAt) {
    ui.cardAt = null;
    showHoled();
  }
}

function pushTail(x, y) {
  ui.tail.push([x, y]);
  if (ui.tail.length > 28) ui.tail.shift();
}

const PENALTY = {
  burn: 'Burned up in the sun. One penalty stroke.',
  void: 'Swallowed by the dark star. One penalty stroke.',
  lost: 'Lost off the edge of the plate. One penalty stroke.',
};

// Tips shown once each, the first time the situation comes up.
const TIPS = {
  lost: 'Softer shots bend more around the worlds.',
  burn: 'Suns pull hard: give them a wide berth.',
  void: 'Dark stars pull from a long way off.',
  cupWorld: 'On the cup\u2019s world now: a gentle shot along the surface rolls in.',
};
const tipsSeen = new Set(saved.get('tips', []));
function tip(id) {
  if (tipsSeen.has(id)) return '';
  tipsSeen.add(id);
  saved.set('tips', [...tipsSeen]);
  return ` ${TIPS[id]}`;
}

function handleEvents(ev, st) {
  const f = st.flight;
  // Where it happened: a flight that just ended has already been put back (penalties).
  const end = !f && st.log.length ? lastPoint(st.log[st.log.length - 1].path) : null;
  const at = f ? { x: f.x, y: f.y } : end ? { x: end[0], y: end[1] } : { x: st.x, y: st.y };
  for (const e of ev) {
    switch (e.t) {
      case 'pass': {
        const b = st.w.bodies[e.i];
        audio.pass(b.r, e.close, e.v);
        ui.ringing.set(e.i, Math.max(ui.ringing.get(e.i) || 0, 0.35 + 0.65 * e.close));
        break;
      }
      case 'bounce':
        audio.bounce(e.v, e.rock);
        ui.fx.push({ kind: 'ripple', ...at, r0: 8, r1: 18 + e.v * 0.08, t0: ui.t, dur: 0.4, color: INK, alpha: 0.5, width: 1.4 });
        if (e.v > 300) shake(wrap, 0.6);
        break;
      case 'lip':
        audio.lip();
        ui.lipped = true;
        ui.fx.push({ kind: 'ripple', x: st.w.cupX, y: st.w.cupY, r0: 8, r1: 30, t0: ui.t, dur: 0.5, color: GOLD });
        break;
      case 'warp': {
        audio.warp();
        const a = st.w.bodies[e.i];
        const b = st.w.bodies[e.to];
        for (const g of [a, b]) ui.fx.push({ kind: 'ripple', x: g.x, y: g.y, r0: g.r, r1: g.r * 3, t0: ui.t, dur: 0.6, color: TEAL });
        ui.tail = [];
        break;
      }
      case 'burn':
        audio.burn();
        ui.fx.push(sparks(at.x, at.y, SUN, 22));
        shake(wrap, 1.6);
        break;
      case 'void':
        audio.swallow();
        ui.fx.push({ kind: 'ripple', ...at, r0: 70, r1: 4, t0: ui.t, dur: 0.8, color: VIOLET, width: 3 });
        break;
      case 'lost':
        audio.lost();
        break;
      case 'rest':
        audio.rest();
        if (e.i === st.w.cupBody && !tipsSeen.has('cupWorld')) banner(tip('cupWorld').trim());
        break;
      case 'halt':
        audio.halt();
        banner('The exposure ended. Play on from here.');
        break;
      case 'penalty':
        banner(PENALTY[e.why] + tip(e.why), 'danger');
        ui.respawn = { t0: ui.t };
        break;
      case 'holed':
        onHoled(st);
        break;
      case 'picked':
        onPicked(st);
        break;
    }
  }
  if (st.phase !== 'fly' && ev.length) afterStroke(st);
}

function afterStroke(st) {
  document.body.classList.remove('flying');
  if (ui.lipped && st.phase === 'aim' && !st.log.at(-1).end?.match(/burn|void|lost|halt/)) banner('It lipped out. Arrive slower and it drops in.');
  ui.lipped = false;
  ui.fast = false;
  ui.stepAcc = 0;
  R.repaintStatic(st.phase === 'sunk' ? st.log.map((s) => ({ ...s, end: null })) : st.log);
  updateHud();
  if (st.phase === 'aim') {
    // Keep the last aim, so a small correction is a small drag or a few key presses.
    if (ui.lastAim) ui.aim = { ...ui.lastAim };
    updatePreview();
    saveRun();
  }
}

function sparks(x, y, color, n) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    parts.push({ dx: Math.cos(a), dy: Math.sin(a), d: 30 + Math.random() * 80, r: 2 + Math.random() * 3.5, a: 0.6 + Math.random() * 0.4 });
  }
  return { kind: 'spark', x, y, color, parts, t0: ui.t, dur: 0.9 };
}

function recordHole(st, strokes) {
  const c = ui.course;
  c.scores[c.index] = strokes;
  c.logs[c.index] = packLog(st.log);
  profile.holes++;
  if (strokes === 1 && !st.result.picked) {
    profile.aces++;
    profile.aced[st.hole.id] = dailySeed();
  }
  saveProfile();
  saveRun();
}

function onHoled(st) {
  const strokes = st.result.strokes;
  const last = st.log[st.log.length - 1];
  const notes = last.notes.map((i) => worldNote(st.w.bodies[i].r));
  if (strokes === 1) audio.ace(notes);
  else audio.sink(notes);
  const from = lastPoint(last.path);
  ui.drop = { t0: ui.t, fx: from[0], fy: from[1] };
  ui.gild = { t0: ui.t + 0.3, paths: st.log.map((s) => s.path) };
  ui.fx.push({ kind: 'ripple', x: st.w.cupX, y: st.w.cupY, r0: 10, r1: 150, t0: ui.t, dur: 1.3, color: GOLD, width: 3 });
  ui.fx.push({ kind: 'ripple', x: st.w.cupX, y: st.w.cupY, r0: 6, r1: 80, t0: ui.t + 0.15, dur: 1.0, color: GOLD, width: 2 });
  ui.fx.push(sparks(st.w.cupX, st.w.cupY, GOLD, strokes === 1 ? 46 : 24));
  shake(wrap, strokes === 1 ? 2.2 : 1);
  ui.tail = [];
  recordHole(st, strokes);
  ui.cardAt = ui.t + (reducedMotion() ? 0.3 : strokes === 1 ? 1.9 : 1.25);
}

function onPicked(st) {
  recordHole(st, st.result.strokes);
  banner('Picked up. On to the next plate.', 'danger');
  ui.cardAt = ui.t + 0.9;
}

function showAce() {
  const st = ui.st;
  if (!st || ui.ace) return;
  const h = st.hole;
  const r = E.simulate(st.w, h.tee.x, h.tee.y, h.ace.vx, h.ace.vy, { every: 2 });
  ui.ace = { t0: ui.t, path: r.path };
  const btn = overlay.querySelector('[data-action=ace]');
  if (btn) btn.remove();
  overlay.querySelector('.holed-card')?.classList.add('compact'); // out of the ace line's way
  overlay.querySelector('[data-action=next]')?.focus({ preventScroll: true });
  audio.click();
}

// ---------------------------------------------------------------------------------------
// Title demo: the comet flies the ace line of a hole, silently, on a loop.

const DEMO_ID = pickDemo();

function pickDemo() {
  // The bank hole whose ace line rings the most worlds (a melody, not a putt).
  let best = BANK[0];
  let most = -1;
  for (const h of BANK.filter((x) => x.tier >= 2 && x.tier <= 3).slice(0, 40)) {
    const st = E.newHole(h);
    E.launch(st, h.ace.vx, h.ace.vy);
    const ev = E.finishFlight(st);
    const passes = ev.filter((e) => e.t === 'pass').length + ev.filter((e) => e.t === 'bounce').length * 0.3;
    if (st.phase === 'sunk' && passes > most) {
      most = passes;
      best = h;
    }
  }
  return best.id;
}

function startDemo() {
  const hole = holeById(DEMO_ID) || BANK[0];
  ui.demo = { hole, st: E.newHole(hole), wait: 0.9 };
  ui.tail = [];
  ui.drop = ui.gild = ui.ace = null;
  ui.ringing.clear();
  R.setHole(hole);
  R.repaintStatic([]);
}

function updateDemo(dt) {
  const d = ui.demo;
  if (!d) return;
  const st = d.st;
  if (st.phase === 'aim') {
    d.wait -= dt;
    if (d.wait <= 0) {
      E.launch(st, d.hole.ace.vx, d.hole.ace.vy);
      ui.tail = [];
    }
    return;
  }
  if (st.phase === 'fly') {
    ui.stepAcc += dt / E.DT;
    while (ui.stepAcc >= 1 && st.phase === 'fly') {
      ui.stepAcc -= 1;
      const ev = E.tick(st);
      if (st.flight) pushTail(st.flight.x, st.flight.y);
      for (const e of ev) {
        if (e.t === 'pass') ui.ringing.set(e.i, 0.35 + 0.65 * e.close);
        if (e.t === 'holed') {
          ui.drop = { t0: ui.t, fx: st.log[0].path.at(-1)[0], fy: st.log[0].path.at(-1)[1] };
          ui.gild = { t0: ui.t + 0.3, paths: st.log.map((s) => s.path) };
          ui.fx.push({ kind: 'ripple', x: st.w.cupX, y: st.w.cupY, r0: 10, r1: 130, t0: ui.t, dur: 1.3, color: GOLD, width: 3 });
          d.wait = 3.2;
        }
      }
    }
    return;
  }
  if (ui.tail.length) ui.tail.shift();
  d.wait -= dt;
  if (d.wait <= 0) {
    d.st = E.newHole(d.hole);
    d.wait = 0.8;
    ui.drop = ui.gild = null;
  }
}

// ---------------------------------------------------------------------------------------
// Drawing

function lastPoint(path) {
  for (let i = path.length - 1; i >= 0; i--) if (path[i]) return path[i];
  return null;
}

function render() {
  const st = ui.screen === 'title' ? ui.demo?.st : ui.st;
  if (!st) return;
  const t = ui.t;
  const scene = { t, tail: ui.tail, fx: ui.fx, ringing: ui.ringing };
  if (st.phase === 'fly') {
    scene.comet = { x: st.flight.x, y: st.flight.y };
    scene.flying = st.log[st.log.length - 1].path;
    if (ui.screen === 'play') {
      scene.exposure = (st.flight.t * E.DT) / E.PHYS.exposure;
      scene.fast = ui.fast;
    }
  } else if (st.phase === 'aim' || st.phase === 'picked') {
    scene.comet = { x: st.x, y: st.y };
    scene.resting = true;
    if (ui.respawn) scene.comet.alpha = Math.min(1, (t - ui.respawn.t0) / 0.5);
  } else if (st.phase === 'sunk' && ui.drop) {
    const k = Math.min(1, (t - ui.drop.t0) / 0.3);
    scene.comet = { x: ui.drop.fx + (st.w.cupX - ui.drop.fx) * k, y: ui.drop.fy + (st.w.cupY - ui.drop.fy) * k, alpha: 1 - k };
  }
  if (ui.screen === 'play' && st.phase === 'aim' && ui.aimSet && !ui.paused) {
    scene.preview = ui.preview;
    scene.aim = ui.aim;
  }
  if (ui.gild && t > ui.gild.t0) scene.gilded = { paths: ui.gild.paths, k: Math.min(1, (t - ui.gild.t0) / 0.9) };
  if (ui.ace) scene.ace = { path: ui.ace.path, k: Math.min(1, (t - ui.ace.t0) / 2.4) };
  R.frame(scene);
}

const loop = createLoop({ update, render });

function layout() {
  const r = wrap.getBoundingClientRect();
  // On the title the plate moves aside so the demo isn't hidden behind the title card.
  const inset = { l: 0, t: 0, r: ui.screen === 'title' ? 12 : 0, b: 0 };
  const card = ui.screen === 'title' && overlay.querySelector('.title-card');
  if (card) {
    const c = card.getBoundingClientRect();
    if (c.width < r.width * 0.6) inset.l = Math.max(0, c.right - r.left + 12);
    else inset.b = Math.max(0, r.bottom - c.top + 10);
  }
  R.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)), Math.min(window.devicePixelRatio || 1, 2.5), inset);
  if (ui.st) R.repaintStatic(ui.st.phase === 'sunk' ? ui.st.log.map((s) => ({ ...s, end: null })) : ui.st.log);
  else R.repaintStatic([]);
}
new ResizeObserver(() => layout()).observe(wrap);

// ---------------------------------------------------------------------------------------
// HUD and screens

function updateHud() {
  const playing = ui.screen === 'play' || ui.screen === 'holed';
  $('#plate').hidden = !playing;
  $('#hole-stats').hidden = !playing;
  $('#card').hidden = !playing;
  $('#btn-pause').hidden = ui.screen !== 'play';
  document.body.dataset.screen = ui.screen;
  if (!playing) return;
  const c = ui.course;
  const h = c.holes[c.index];
  $('#plate-no').textContent = `Plate ${ROMAN[c.index]}.`;
  $('#plate-name').textContent = h.name;
  $('#par').textContent = h.par;
  $('#strokes').textContent = ui.st ? ui.st.strokes : c.scores[c.index] ?? 0;
  const done = c.scores.filter((s) => s !== undefined);
  const diff = courseDiff(c);
  const tot = $('#total');
  tot.innerHTML = done.length ? parHTML(diff) : 'E';
  tot.classList.toggle('under', diff < 0);
  renderCard();
}

function renderCard() {
  const c = ui.course;
  const cells = c.holes
    .map((h, i) => {
      const s = c.scores[i];
      const cls = s === undefined ? '' : s === 1 ? 'ace' : s < h.par ? 'under' : s > h.par ? 'over' : '';
      const show = s === undefined ? `<span class="sc-par" title="Par ${h.par}">${h.par}</span>` : s;
      return `<div class="sc-cell${i === c.index ? ' now' : ''}"><span class="sc-head">${ROMAN[i]}</span><span class="sc-score ${cls}">${show}</span></div>`;
    })
    .join('');
  const done = c.scores.filter((s) => s !== undefined).length;
  const strokes = c.scores.reduce((s, v) => s + (v || 0), 0);
  $('#card').innerHTML = `<div class="sc-cell sc-key"><span class="sc-head">Plate</span><span class="sc-head">Score</span></div>${cells}<div class="sc-cell sc-total"><span class="sc-head">Strokes</span><span class="sc-score">${done ? strokes : '–'}</span></div>`;
}

// The first plate with a new kind of hazard says what it does.
const NEW_KINDS = {
  sun: 'A sun: touch it and the comet burns up.',
  void: 'A dark star: fall in and the comet is gone.',
  gate: 'Wormholes: in one, out of its twin at the same speed.',
  rock: 'Rocks: no pull, but very bouncy.',
  nebula: 'A nebula: its dust slows the comet down.',
};

function showIntro(hole, i) {
  wrap.querySelectorAll('.plate-intro').forEach((n) => n.remove());
  const seen = new Set(profile.kinds || []);
  const fresh = Object.keys(NEW_KINDS).find((k) => !seen.has(k) && hole.bodies.some((b) => b.k === k));
  if (fresh) {
    seen.add(fresh);
    profile.kinds = [...seen];
    saveProfile();
  }
  const el = document.createElement('div');
  el.className = `plate-intro${fresh ? ' long' : ''}`;
  el.innerHTML = `<div class="pi-no">Plate ${ROMAN[i]}.</div><div class="pi-name">${hole.name}</div><div class="pi-par">Par ${hole.par}</div>${fresh ? `<div class="pi-new">${NEW_KINDS[fresh]}</div>` : ''}`;
  wrap.append(el);
  setTimeout(() => el.remove(), reducedMotion() ? 1800 : fresh ? 4200 : 2300);
}

/** The plate title steps aside once play starts (or the screen changes). */
function hideIntro() {
  wrap.querySelectorAll('.plate-intro').forEach((n) => {
    n.classList.add('gone');
    setTimeout(() => n.remove(), 300);
  });
}

let hintTimer = 0;
function showHint() {
  const el = $('#hint');
  const touch = matchMedia('(hover: none)').matches;
  el.innerHTML = touch
    ? 'Pull back from anywhere on the plate, then let go'
    : 'Pull back from anywhere on the plate, then let go <span class="keys-only">(or <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>Space</kbd>)</span>';
  const first = ui.course && ui.course.index === 0 && ui.st.strokes === 0;
  el.hidden = !(first || !ui.hinted);
  el.classList.remove('gone');
}
function hideHint() {
  const el = $('#hint');
  if (el.hidden) return;
  el.classList.add('gone');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => (el.hidden = true), 400);
  if (!ui.hinted) {
    ui.hinted = true;
    saved.set('hinted', true);
  }
}

let bannerTimer = 0;
function banner(text, kind = '') {
  const el = $('#banner');
  el.textContent = text;
  el.style.top = `${Math.round(wrap.getBoundingClientRect().top + 10)}px`; // under the header, whatever its height
  el.className = `banner show ${kind}`;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function renderTitle() {
  hideIntro();
  ui.screen = 'title';
  ui.course = null;
  ui.st = null;
  ui.paused = false;
  document.body.classList.remove('flying');
  updateHud();
  startDemo();
  const run = loadRun();
  const today = dailySeed();
  const todayBest = profile.dailies[today];
  const dateLabel = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const record = profile.rounds
    ? `Best round <b>${parHTML(profile.best)}</b> over ${profile.rounds} ${profile.rounds === 1 ? 'round' : 'rounds'}. Plates aced: <b>${Object.keys(profile.aced).length}</b> of ${BANK.length}.`
    : 'Nine plates a course. A new course every day.';
  overlay.innerHTML = `
    <section class="title-card engraved enter" aria-label="Comet Cup">
      <h1>Comet Cup<svg class="swash" viewBox="0 0 300 16" preserveAspectRatio="none" aria-hidden="true"><path d="M2 12 C 80 14, 190 12, 288 4" stroke="#eadfc4" stroke-width="1.6" fill="none" opacity=".55"/><circle cx="290" cy="4" r="3.4" fill="#fffaf0"/></svg></h1>
      <p class="lede">Orbit golf on a star chart. Sling a comet past the singing worlds and drop it in the cup.</p>
      <div class="actions">
        ${run ? `<button class="btn primary" data-action="continue">Continue <span class="sub">${run.mode === 'daily' ? "today's course" : 'random course'}, ${run.index < 9 ? `plate ${ROMAN[run.index]}` : 'the last result'}</span></button>` : ''}
        <button class="btn ${run ? '' : 'primary'}" data-action="daily">Today's course <span class="sub">${todayBest !== undefined ? `your best: ${parWords(todayBest).toLowerCase()}` : dateLabel}</span> <kbd class="key">Enter</kbd></button>
        <button class="btn" data-action="random">A random course</button>
        <button class="btn" data-action="help">How to play</button>
      </div>
      <p class="record">${record}</p>
    </section>`;
  layout();
}

function showHoled() {
  const st = ui.st;
  const c = ui.course;
  if (!st || !st.result) return;
  ui.screen = 'holed';
  const { strokes, par, picked } = st.result;
  const word = E.scoreName(strokes, par, picked);
  const cls = picked || strokes > par ? 'over' : strokes < par ? 'under' : '';
  const done = c.scores.filter((s) => s !== undefined);
  const diff = courseDiff(c);
  const last = c.index === c.holes.length - 1;
  const strokesText = picked ? `Scored ${strokes} on a par ${par}.` : `${strokes} ${strokes === 1 ? 'stroke' : 'strokes'} on a par ${par}.`;
  const ace = strokes === 1 && !picked;
  overlay.innerHTML = `
    <section class="holed-card engraved enter" aria-label="Hole result">
      <p class="word stamp ${cls}">${word}</p>
      <p class="detail">${strokesText} ${parWords(diff)} after ${done.length} ${done.length === 1 ? 'plate' : 'plates'}.</p>
      <div class="actions">
        ${ace ? '' : '<button class="btn" data-action="ace">Show the ace line <kbd class="key">A</kbd></button>'}
        <button class="btn primary" data-action="next">${last ? 'See the finished sheet' : `On to plate ${ROMAN[c.index + 1]}`} <kbd class="key">Enter</kbd></button>
      </div>
    </section>`;
  ui.inputLock = performance.now() + 350;
  updateHud();
  overlay.querySelector('[data-action=next]')?.focus({ preventScroll: true });
}

const NUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
/** A score against par with a sign that holds up in display type. */
const parHTML = (diff) => {
  const t = E.toPar(diff);
  if (t[0] === '\u2212') return `<span class="minus" role="img" aria-label="minus"></span>${t.slice(1)}`;
  return t[0] === '+' ? `<span class="sign">+</span>${t.slice(1)}` : t;
};

/** "Two under par", "Level par", "Eleven over par" (as words: an italic minus reads as a dash). */
function parWords(diff) {
  if (diff === 0) return 'Level par';
  const n = Math.abs(diff);
  return `${NUM[n] ?? n} ${diff < 0 ? 'under' : 'over'} par`;
}

function renderSheet({ strokes, par, diff, newBest }) {
  const c = ui.course;
  const title = c.mode === 'daily' ? `Today's course, ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'A random course';
  const aces = c.scores.filter((s) => s === 1).length;
  const figs = c.holes
    .map((h, i) => {
      const s = c.scores[i];
      const cls = s < h.par ? 'under' : s > h.par ? 'over' : '';
      return `<figure class="mini"><canvas data-mini="${i}" aria-label="Plate ${ROMAN[i]}: ${h.name}"></canvas><figcaption><span class="nm"><span class="rn">${ROMAN[i]}.</span> <span class="full">${h.name}</span></span><b class="${cls}">${s}</b></figcaption></figure>`;
    })
    .join('');
  overlay.innerHTML = `
    <section class="sheet enter" aria-label="Finished course">
      <div class="sheet-inner">
        <div class="sheet-side">
        <h2>Nine plates observed</h2>
        <p class="sheet-sub">${title}</p>
        <div class="totals">
          <span class="big ${diff < 0 ? 'under' : ''}">${parHTML(diff)}</span>
          <span>${strokes} strokes on a par ${par} course${aces ? `, with ${aces} ${aces === 1 ? 'ace' : 'aces'}` : ''}.${newBest ? ' Your best round yet.' : ` Your best is ${parWords(profile.best).toLowerCase()}.`}</span>
        </div>
        <div class="actions">
          <button class="btn primary" data-action="random">Play a random course <kbd class="key">Enter</kbd></button>
          <button class="btn" data-action="copy">Copy the scorecard</button>
          <button class="btn" data-action="save">Save the sheet as a picture</button>
          <button class="btn" data-action="title">Back to the title</button>
        </div>
        </div>
        <div class="sheet-grid">${figs}</div>
      </div>
    </section>`;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const cv of overlay.querySelectorAll('canvas[data-mini]')) {
    const i = Number(cv.dataset.mini);
    const w = cv.getBoundingClientRect().width || 300;
    R.miniature(cv, c.holes[i], unpackLog(c.logs[i]), w, (w * 1040) / 1640, dpr);
  }
}

const unpackLog = (log = []) => log.map((s) => ({ ...s, path: s.path }));

/** A plain-text scorecard to paste into a chat. */
function scorecardText() {
  const c = ui.lastCourse;
  if (!c) return '';
  const strokes = c.scores.reduce((s, v) => s + v, 0);
  const par = coursePar(c.holes);
  const when = c.mode === 'daily' ? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'a random course';
  const row = c.scores.map((s, i) => (s === 1 ? '\u2604\uFE0F' : String(s))).join(' ');
  return `Comet Cup, ${when}: ${E.toPar(strokes - par)} (${strokes} on par ${par})\n${row}\n${new URL('.', location.href).href}`;
}

/** The finished sheet as one poster: nine gilded plates, the score and the date. */
async function saveSheet() {
  const c = ui.lastCourse;
  if (!c) return;
  await document.fonts?.ready;
  const cell = 560;
  const W2 = 75 * 2 + cell * 3 + 25 * 2;
  const cellH = Math.round((cell * 1040) / 1640);
  const top = 230;
  const H2 = top + 3 * (cellH + 62) + 40;
  const cv = document.createElement('canvas');
  cv.width = W2;
  cv.height = H2;
  const g = cv.getContext('2d');
  g.fillStyle = '#0c1224';
  g.fillRect(0, 0, W2, H2);
  g.strokeStyle = 'rgba(234,223,196,0.45)';
  g.lineWidth = 2;
  g.strokeRect(24, 24, W2 - 48, H2 - 48);
  g.strokeStyle = 'rgba(234,223,196,0.2)';
  g.strokeRect(36, 36, W2 - 72, H2 - 72);
  const strokes = c.scores.reduce((s, v) => s + v, 0);
  const diff = strokes - coursePar(c.holes);
  g.fillStyle = '#eadfc4';
  g.font = 'italic 700 92px "Bodoni Moda", Didot, Georgia, serif';
  g.fillText('Comet Cup', 75, 140);
  g.font = 'italic 34px "Old Standard TT", Georgia, serif';
  g.fillStyle = 'rgba(234,223,196,0.7)';
  const when = c.mode === 'daily' ? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'A random course';
  g.fillText(`${when}. ${strokes} strokes, ${parWords(diff).toLowerCase()}.`, 78, 192);
  g.textAlign = 'right';
  g.fillStyle = diff < 0 ? '#e9c35b' : '#eadfc4';
  g.font = '700 120px "Bodoni Moda", Didot, Georgia, serif';
  // Bodoni's minus is a hairline: draw a sturdy one.
  const num = diff < 0 ? String(-diff) : E.toPar(diff);
  g.fillText(num, W2 - 75, 160);
  if (diff < 0) g.fillRect(W2 - 75 - g.measureText(num).width - 62, 112, 48, 10);
  g.textAlign = 'left';
  c.holes.forEach((h, i) => {
    const x = 75 + (i % 3) * (cell + 25);
    const y = top + Math.floor(i / 3) * (cellH + 62);
    const m = document.createElement('canvas');
    R.miniature(m, h, unpackLog(c.logs[i]), cell, cellH, 1);
    g.drawImage(m, x, y);
    g.strokeStyle = 'rgba(234,223,196,0.25)';
    g.strokeRect(x + 0.5, y + 0.5, cell - 1, cellH - 1);
    g.font = 'italic 24px "Old Standard TT", Georgia, serif';
    g.fillStyle = 'rgba(234,223,196,0.7)';
    g.fillText(`${ROMAN[i]}. ${h.name}`, x, y + cellH + 34);
    g.textAlign = 'right';
    g.font = '700 32px "Bodoni Moda", Didot, Georgia, serif';
    const s = c.scores[i];
    g.fillStyle = s < h.par ? '#e9c35b' : s > h.par ? '#d99a8f' : '#eadfc4';
    g.fillText(String(s), x + cell, y + cellH + 36);
    g.textAlign = 'left';
  });
  cv.toBlob((blob) => {
    if (!blob) return toast('That browser could not make the picture.');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `comet-cup-${c.mode === 'daily' ? c.date : 'course'}.png`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

async function copyResult() {
  try {
    await navigator.clipboard.writeText(scorecardText());
    toast('Scorecard copied');
  } catch {
    toast('Your browser would not let the page copy. Try a screenshot instead.');
  }
}

function pause(on = !ui.paused) {
  if (ui.screen !== 'play') return;
  ui.paused = on;
  loop.resync();
  if (on) {
    ui.drag = null;
    overlay.innerHTML = `
      <section class="pause-card engraved enter" aria-label="Paused">
        <h2>Paused</h2>
        <p><em>Plate ${ROMAN[ui.course.index]}, stroke ${ui.st.strokes}.</em></p>
        <div class="actions">
          <button class="btn primary" data-action="resume">Resume <kbd class="key">P</kbd></button>
          <button class="btn" data-action="title">Back to the title</button>
        </div>
      </section>`;
  } else overlay.innerHTML = '';
}

function openHelp() {
  const sw = (fill, extra = '') => `<svg viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="9" fill="${fill}" ${extra}/></svg>`;
  $('#modal-root').innerHTML = `
    <div class="scrim" data-action="close-modal"></div>
    <section class="modal-card engraved enter" role="dialog" aria-modal="true" aria-label="How to play">
      <button class="icon-btn close" data-action="close-modal" aria-label="Close">✕</button>
      <h2>How to play</h2>
      <p>Pull back from anywhere on the plate, like a slingshot, and let go. The dotted line shows only the start of the flight; gravity does the rest.</p>
      <ul>
        <li>${sw('#a89dcc')}<span>Every world pulls the comet, and big worlds pull from further away (the faint dotted ring). Each one rings a note as you pass it.</span></li>
        <li><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M10 26 L10 6 L24 11 L10 16" fill="#e9c35b" stroke="#eadfc4" stroke-width="1.2"/></svg><span>Drop the comet into the cup under the gold flag. Arrive slowly: too fast and it lips out. It rolls to a stop on any world, and you play on from there.</span></li>
        <li>${sw('#f2a65a')}<span>Suns burn, dark stars swallow, and the edge of the plate is out of bounds. Each costs a penalty stroke and you shoot again from the same spot.</span></li>
        <li>${sw('#6fd3c4', 'fill-opacity=".35" stroke="#6fd3c4" stroke-width="2"')}<span>Wormholes carry the comet to the hole with the same letter. Grey rocks bounce and don't pull; nebulae slow the comet down.</span></li>
        <li>${sw('none', 'stroke="#eadfc4" stroke-width="1.4" stroke-dasharray="2 3"')}<span>Each launch is a 12-second exposure. If the comet is still flying when it ends, you play on from wherever it stopped.</span></li>
      </ul>
      <p class="keys-only"><em>Keys: ← → aim (hold Shift for fine), ↑ ↓ power, Space launches, Space or a click fast-forwards a flight, P pauses, M mutes.</em></p>
      <p><em>Tap during a flight to fast-forward. Par is set by robot golfers; every plate can be aced, and after each one you can see how.</em></p>
    </section>`;
  $('#modal-root .close').focus({ preventScroll: true });
  if (ui.screen === 'play' && !ui.paused && ui.st?.phase === 'fly') pause(true);
}
function closeModal() {
  $('#modal-root').innerHTML = '';
}
const modalOpen = () => !!$('#modal-root').firstElementChild;

function toggleMute() {
  const m = audio.sfx.toggleMute();
  $('#btn-mute').classList.toggle('off', m);
  $('#btn-mute').setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
}

// ---------------------------------------------------------------------------------------
// Input: buttons and keys

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (performance.now() < ui.inputLock && el.closest('#overlay')) return;
  const a = el.dataset.action;
  if (a !== 'mute') audio.click();
  if (a === 'daily') startCourse('daily');
  else if (a === 'random') startCourse('random');
  else if (a === 'continue') {
    const run = loadRun();
    if (!run || !resumeCourse(run)) startCourse('daily');
  } else if (a === 'help') openHelp();
  else if (a === 'close-modal') closeModal();
  else if (a === 'mute') toggleMute();
  else if (a === 'pause') pause();
  else if (a === 'resume') pause(false);
  else if (a === 'next') nextHole();
  else if (a === 'ace') showAce();
  else if (a === 'copy') copyResult();
  else if (a === 'save') saveSheet();
  else if (a === 'title') renderTitle();
});

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (modalOpen()) {
    if (k === 'Escape' || k === '?') closeModal();
    return;
  }
  if (k === 'm' || k === 'M') return toggleMute();
  if (k === '?') return openHelp();
  if (k === 'p' || k === 'P' || (k === 'Escape' && ui.screen === 'play')) return pause();
  if (ui.screen === 'title') {
    if (k === 'Enter' && !e.target.closest?.('button')) startCourse('daily');
    return;
  }
  if (ui.screen === 'sheet') {
    if (k === 'Enter' && !e.target.closest?.('button')) startCourse('random');
    return;
  }
  if (ui.screen === 'holed') {
    if (performance.now() < ui.inputLock) return;
    const onButton = !!e.target.closest?.('button');
    if (((k === 'Enter' || k === ' ') && !onButton) || k === 'n' || k === 'N') {
      e.preventDefault();
      nextHole();
    } else if (k === 'a' || k === 'A') showAce();
    return;
  }
  if (ui.screen !== 'play' || ui.paused || !ui.st) return;
  const st = ui.st;
  if (st.phase === 'fly') {
    if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      ui.fast = true;
    }
    return;
  }
  if (st.phase !== 'aim') return;
  const fine = e.shiftKey;
  const da = ((fine ? 0.2 : 1.5) * Math.PI) / 180;
  const dp = fine ? 0.005 : 0.02;
  if (k === 'ArrowLeft') setAim(ui.aim.angle - da, ui.aim.power);
  else if (k === 'ArrowRight') setAim(ui.aim.angle + da, ui.aim.power);
  else if (k === 'ArrowUp') setAim(ui.aim.angle, ui.aim.power + dp);
  else if (k === 'ArrowDown') setAim(ui.aim.angle, ui.aim.power - dp);
  else if (k === ' ' || k === 'Enter') {
    if (e.target.closest?.('button')) return;
    if (ui.aimSet) shoot();
    else setAim(ui.aim.angle, ui.aim.power);
  } else return;
  e.preventDefault();
});

onHidden(() => {
  if (ui.screen === 'play' && !ui.paused) pause(true);
});

// ---------------------------------------------------------------------------------------
// Start

homeLink({ parent: $('#home-slot') });
if (audio.sfx.muted) $('#btn-mute').classList.add('off');
layout();
renderTitle();

/** Aim exactly along a hole's ace line (debug: goes through setAim and shoot). */
function aimAce() {
  const h = ui.st.hole;
  const s = Math.hypot(h.ace.vx, h.ace.vy);
  ui.st.x = h.tee.x;
  ui.st.y = h.tee.y;
  setAim(Math.atan2(h.ace.vy, h.ace.vx), s / E.PHYS.maxSpeed);
}

markReady({
  get state() {
    return ui;
  },
  get hole() {
    return ui.st;
  },
  profile,
  loop,
  E,
  advance: (s) => loop.advance(s),
  startCourse,
  startHole: (i) => startHole(i),
  setAim,
  shoot,
  aimAce,
  /** Play out the current flight in game time. */
  settle(maxSeconds = 14) {
    for (let i = 0; i < maxSeconds * 10 && ui.st?.phase === 'fly'; i++) loop.advance(0.1);
    loop.advance(ui.cardAt ? Math.max(0.05, ui.cardAt - ui.t + 0.05) : 0.05);
  },
  /** Ace the current hole the real way: aim along the ace line and launch. */
  ace() {
    aimAce();
    shoot();
    this.settle();
  },
  /** A wild shot off the plate (penalty). */
  miss() {
    const st = ui.st;
    setAim(Math.atan2(-(st.w.cupY - st.y), -(st.w.cupX - st.x)), 1);
    shoot();
    this.settle();
  },
  showAce,
  nextHole,
  finishCourse,
  renderTitle,
  pause,
  openHelp,
  /** Curation: every bank hole of a tier (or a list of ids) with its ace line. */
  contact(tier = 0, cols = 5) {
    const holes = Array.isArray(tier) ? tier.map((id) => holeById(id)) : BANK.filter((h) => !tier || h.tier === tier);
    ui.screen = 'sheet';
    overlay.innerHTML = `<section class="sheet"><div class="sheet-inner" style="max-width:none;display:block"><div class="sheet-grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${holes
      .map((h, i) => `<figure class="mini"><canvas data-c="${i}"></canvas><figcaption><span>${h.id} ${h.kind}${h.extra ? '+' + h.extra : ''} ${h.stats.casual}/${(h.stats.rate * 100).toFixed(2)}%</span><b>${h.par}</b></figcaption></figure>`)
      .join('')}</div></div></section>`;
    for (const cv of overlay.querySelectorAll('canvas[data-c]')) {
      const h = holes[Number(cv.dataset.c)];
      const w = cv.getBoundingClientRect().width || 240;
      const path = E.simulate(E.prepareWorld(h), h.tee.x, h.tee.y, h.ace.vx, h.ace.vy, { every: 3 }).path;
      R.miniature(cv, h, [{ end: 'sink', path }], w, (w * 1040) / 1640, 1);
    }
    return holes.length;
  },
  /** The course's most dramatic ace line, caught two thirds of the way along. */
  prepareThumbnail() {
    loop.manual = true;
    startCourse('daily');
    let best = 0;
    let steps = 0;
    ui.course.holes.forEach((h, i) => {
      const r = E.simulate(E.prepareWorld(h), h.tee.x, h.tee.y, h.ace.vx, h.ace.vy, { every: 1 });
      let len = 0;
      for (let k = 1; k < r.path.length; k++) len += Math.hypot(r.path[k][0] - r.path[k - 1][0], r.path[k][1] - r.path[k - 1][1]);
      if (len > steps) {
        steps = len;
        best = i;
      }
    });
    startHole(best);
    wrap.querySelectorAll('.plate-intro').forEach((n) => n.remove());
    $('#hint').hidden = true;
    aimAce();
    shoot();
    const total = E.simulate(ui.st.w, ui.st.x, ui.st.y, ui.st.hole.ace.vx, ui.st.hole.ace.vy).steps * E.DT;
    loop.advance(total * 0.68);
  },
});
