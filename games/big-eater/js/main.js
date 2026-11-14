// Big Eater: screens, HUD, input, sound and saves around the pure engine.
import { homeLink, markReady, onHidden, recordBest, recordPlay, reducedMotion, store } from '../../../shared/arcade.js';
import { createLoop, fixedSteps } from '../../../shared/loop.js';
import { dailySeed, hashString } from '../../../shared/rng.js';
import { createAudio } from './audio.js';
import { createBot } from './bot.js';
import { BOSSES, CELLS, DT, GERMS, GRAM_NAME, ORGANELLES, STRAINS, WEAPONS, fmtTime } from './data.js';
import * as engine from './engine.js';
import { ICONS } from './icons.js';
import { drawPlate } from './plate.js';
import { createRenderer } from './render.js';

const SLUG = 'big-eater';
const saved = store(SLUG);
const audio = createAudio(SLUG, saved);
const $ = (id) => document.getElementById(id);
const canvas = $('slide');
const renderer = createRenderer(canvas);
renderer.reduced = reducedMotion();
const touch = matchMedia('(hover: none)').matches;
const cellIds = Object.keys(CELLS);
const KINDS = Object.keys(GERMS).filter((k) => !GERMS[k].hidden);

// ---------- what persists ----------
const META_V = 1;
function loadMeta() {
  const m = saved.get('meta', null);
  const base = { v: META_V, cells: { macro: true }, strainMax: 0, atlas: {}, evos: [], runs: 0, wins: 0, daily: null, cell: 'macro', strain: 0, coach: {} };
  return m && m.v === META_V ? { ...base, ...m } : base;
}
const meta = loadMeta();
const saveMeta = () => saved.set('meta', meta);

const ui = { screen: 'title', modal: null, cell: meta.cells[meta.cell] ? meta.cell : 'macro', strain: Math.min(meta.strain, meta.strainMax), openedAt: 0, auto: false, autoPick: false, skip: false, news: [] };
let run = null;
let demo = null;
let demoBot = null;
let autoBot = null;
let ending = 0; // seconds since the run ended, before the report opens
let slow = 0; // seconds of slow motion left
let lastReport = null;
const steps = fixedSteps(DT, 6);
const input = { keys: new Set(), sx: 0, sy: 0, stick: false, burst: false };

// ---------- small helpers ----------
const portraits = {};
const portrait = (k) => (portraits[k] ||= renderer.portrait(k, 44));
const cellPics = {};
const cellPic = (k) => (cellPics[k] ||= renderer.cellPortrait(k, 56));
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const kbd = (k) => `<kbd>${k}</kbd>`;
const gramDot = (g) => `<i class="dot g-${g}"></i>`;

function banner(text, cls = '', ms = 1800) {
  const b = $('banner');
  b.className = '';
  void b.offsetWidth;
  b.textContent = text;
  b.className = `show ${cls}`;
  clearTimeout(banner.t);
  banner.t = setTimeout(() => (b.className = ''), ms);
}

function chips(s) {
  const w = s.weapons.map((x) => `<span class="chip wpn${x.evo ? ' evo' : ''}" title="${esc(x.evo ? WEAPONS[x.id].evo.name : WEAPONS[x.id].name)}">${ICONS[x.id]}<i>${x.evo ? '★' : x.lvl}</i></span>`).join('');
  const o = s.organelles.map((x) => `<span class="chip org" title="${esc(ORGANELLES[x.id].name)}">${ICONS[x.id]}<i>${x.lvl}</i></span>`).join('');
  return w + o;
}

// ---------- runs ----------
function dailyCell() {
  return cellIds[hashString(`cell:${dailySeed()}`) % cellIds.length];
}

function start({ seed = (Math.random() * 2 ** 32) >>> 0, cell = ui.cell, strain = ui.strain, daily = null } = {}) {
  run = engine.createRun({ seed, cell, strain, daily });
  recordPlay(SLUG);
  meta.runs++;
  if (!daily) { meta.cell = cell; meta.strain = strain; }
  saveMeta();
  saved.remove('run');
  beginPlay();
}

function beginPlay() {
  ending = 0; slow = 0;
  renderer.reset();
  steps.reset();
  input.burst = false;
  hudCache = {};
  setScreen('play');
  audio.music(true);
}

function resume() {
  const sv = saved.get('run', null);
  if (!sv || sv.v !== 1 || !sv.s || sv.s.over) return false;
  run = sv.s;
  run.events = [];
  beginPlay();
  if (run.offers) openLevelUp();
  return true;
}

function saveRun() {
  if (!run || run.over) return;
  const ev = run.events;
  run.events = [];
  saved.set('run', { v: 1, s: run });
  run.events = ev;
}

function newDemo() {
  demo = engine.createRun({ seed: (Math.random() * 2 ** 32) >>> 0, cell: ui.cell });
  demoBot = createBot({ skill: 0.85, seed: 11 });
  for (const id of ['complement', 'cytokine', 'lysozyme']) if (!demo.weapons.some((w) => w.id === id)) engine.apply(demo, { type: 'weapon', id });
  // already under way when the title appears
  for (let i = 0; i < 60 * 80; i++) stepDemo(false);
}
function stepDemo(live = true) {
  if (demo.offers) engine.choose(demo, demoBot.pick(demo));
  engine.step(demo, demoBot.input(demo));
  if (live) handleEvents(demo, false);
  else demo.events.length = 0;
  if (demo.over || demo.t > 200) { renderer.reset(); newDemo(); }
}

// ---------- events from the engine: effects, sound, announcements ----------
function handleEvents(s, live) {
  const ev = s.events;
  let dmgShown = 0;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    switch (e.e) {
      case 'dmg':
        if (e.crit ? dmgShown < 14 : dmgShown < 6 && Math.random() < 0.5) {
          dmgShown++;
          renderer.text(e.x, e.y - 4, String(Math.max(1, Math.round(e.d))), e.crit ? { col: '#2b6cb0', size: 13, bold: true } : { col: 'rgba(29,26,43,0.6)', size: 10 });
        }
        break;
      case 'kill':
        if (!e.gulp) {
          renderer.splat(e.x, e.y, e.gram, e.r, e.elite ? 12 : 5);
          if (live) audio.pop(e.gram, e.elite);
        }
        break;
      case 'gulp':
        renderer.vacuole(e.k, e.boss);
        if (e.chain >= 3 || e.boss) renderer.text(s.p.x, s.p.y - 34, e.boss ? 'Gulp!' : `×${e.chain}`, { col: '#b3740a', size: Math.min(26, 13 + e.chain), life: 0.7, bold: true, out: true, key: 'chain' });
        if (live) {
          audio.gulp(e.chain, e.boss);
          if (e.boss) { slow = 1.0; renderer.bigGulp(e.k, e.r); renderer.shake(12); banner('Gulp!', 'gulp', 1500); }
          coachDone('eat');
        }
        break;
      case 'hurt':
        if (live) { renderer.shake(5 + Math.min(6, e.d * 0.3)); renderer.hurt(); audio.hurt(); flashHurt(); }
        break;
      case 'zap': renderer.zap(e.pts); break;
      case 'fire': if (live) audio.fire(e.w); break;
      case 'xp': if (live) audio.xp(); break;
      case 'burst':
        renderer.shake(10);
        if (live) { audio.burst(); coachDone('burst'); }
        break;
      case 'toxin': if (live) audio.toxin(e.big); break;
      case 'telegraph': if (live) audio.telegraph(); break;
      case 'charge': if (live) { audio.charge(); renderer.shake(4); } break;
      case 'pickup': if (live) audio.pickup(e.kind); break;
      case 'flip':
        if (live) banner(`The Superbug stains ${e.gram === 'p' ? 'violet' : 'pink'}`, e.gram === 'p' ? 'violet' : 'pink', 1400);
        break;
      case 'boss':
        if (live) { audio.boss(); banner(GERMS[e.k].name, 'boss', 2600); renderer.shake(6); }
        break;
      case 'bossdown':
        renderer.splat(e.x, e.y, GERMS[e.k].gram, 60, 40);
        renderer.shake(12);
        if (live) { audio.bossDown(); if (!e.gulp) banner(`${GERMS[e.k].name} is down`, 'boss', 2200); }
        break;
      case 'evo':
        if (live) { audio.evo(); banner(WEAPONS[e.id].evo.name, 'evo', 2400); }
        break;
      case 'wave': if (live && e.seg > 0) audio.wave(); break;
      case 'dead':
        renderer.splat(s.p.x, s.p.y, 'v', 30, 30);
        if (live) { audio.dead(); renderer.shake(12); }
        break;
    }
  }
  ev.length = 0;
}

function flashHurt() {
  const h = $('hurt');
  h.classList.remove('on');
  void h.offsetWidth;
  h.classList.add('on');
}

// ---------- coach: three tips, each shown until it is done once ----------
const COACH = {
  move: () => (touch ? 'Drag anywhere to swim' : 'Swim with WASD or the arrow keys'),
  eat: () => 'An amber ring means lunch: swim over it',
  burst: () => (touch ? 'Burst is ready: tap it' : 'Burst is ready: press Space'),
};
let coachNow = null;
function coachShow(key) {
  if (meta.coach[key] || coachNow === key) return;
  coachNow = key;
  const c = $('coach');
  c.textContent = COACH[key]();
  c.classList.add('show');
}
function coachDone(key) {
  if (meta.coach[key]) return;
  meta.coach[key] = 1;
  saveMeta();
  if (coachNow === key) { coachNow = null; $('coach').classList.remove('show'); }
}
function coachTick() {
  if (!run || ui.screen !== 'play' || ui.noCoach) return;
  if (!meta.coach.move) { coachShow('move'); if (Math.hypot(run.p.x, run.p.y) > 60) coachDone('move'); return; }
  if (!meta.coach.eat) { if (coachNow === 'eat' || run.enemies.some((e) => engine.edible(run, e) && (e.x - run.p.x) ** 2 + (e.y - run.p.y) ** 2 < 300 * 300)) coachShow('eat'); return; }
  if (!meta.coach.burst && run.p.burst >= run.mods.burstNeed) coachShow('burst');
}

// ---------- HUD ----------
let hudCache = {};
function setIf(key, value, fn) {
  if (hudCache[key] === value) return;
  hudCache[key] = value;
  fn(value);
}
function hud() {
  const s = run, p = s.p;
  setIf('xp', Math.round((p.xp / p.need) * 200), (v) => ($('xpFill').style.width = `${Math.min(100, v / 2)}%`));
  setIf('lvl', p.lvl, (v) => ($('lvl').textContent = `Level ${v}`));
  setIf('hp', Math.round((p.hp / p.mhp) * 100), (v) => { $('hpFill').style.width = `${v}%`; $('hud').classList.toggle('low', v < 30); });
  setIf('hpt', `${Math.ceil(p.hp)} / ${p.mhp}`, (v) => ($('hpText').textContent = v));
  setIf('time', Math.floor(s.t), (v) => ($('time').textContent = fmtTime(v)));
  setIf('kills', s.stats.kills, (v) => ($('kills').textContent = v.toLocaleString('en-US')));
  const sig = s.weapons.map((w) => w.id + w.lvl + w.evo).join() + s.organelles.map((o) => o.id + o.lvl).join();
  setIf('build', sig, () => ($('build').innerHTML = chips(s)));
  const nw = engine.nextWave(s);
  const g = GERMS[nw.k];
  setIf('wave', `${nw.k}|${nw.boss}`, () => {
    $('wave').className = `wave${nw.boss ? ' warn' : ''}`;
    $('wave').innerHTML = `<img src="${portrait(nw.k)}" alt="" />${gramDot(g.gram)}<span>${nw.boss ? esc(g.name) : `Next: ${esc(g.name)}`}</span><b id="waveIn"></b>`;
    hudCache.wavein = null;
  });
  setIf('wavein', Math.ceil(nw.in), (v) => ($('waveIn').textContent = fmtTime(v)));
  const boss = s.enemies.find((e) => e.boss);
  setIf('boss', boss ? boss.k : '', (v) => {
    $('boss').hidden = !v;
    if (v) $('bossName').textContent = GERMS[v].name;
  });
  if (boss) {
    setIf('bosshp', Math.round((boss.hp / boss.mhp) * 100), (v) => ($('bossFill').style.width = `${v}%`));
    setIf('bosseat', boss.hp <= boss.mhp * 0.1, (v) => { $('boss').classList.toggle('eat', v); if (v) banner('Engulf it!', 'gulp', 1600); });
    setIf('bossgram', boss.gram, (v) => ($('boss').dataset.gram = v));
  }
  const need = s.mods.burstNeed;
  setIf('burst', Math.round((p.burst / need) * 100), (v) => {
    $('burstRing').style.setProperty('--fill', `${v}%`);
    const ready = v >= 100;
    if (ready && !$('burst').classList.contains('ready')) audio.burstReady();
    $('burst').classList.toggle('ready', ready);
  });
  audio.setHeat(Math.min(1, s.enemies.length / 220) * 0.6 + (boss ? 0.4 : 0));
}

// ---------- screens ----------
function setScreen(name) {
  ui.screen = name;
  ui.openedAt = performance.now();
  document.body.dataset.screen = name;
  $('hud').hidden = !(name === 'play' || name === 'levelup' || name === 'pause');
  const scr = $('screen');
  if (name === 'title') scr.innerHTML = titleHTML();
  else if (name === 'levelup') scr.innerHTML = levelHTML();
  else if (name === 'pause') scr.innerHTML = pauseHTML();
  else if (name === 'report') { scr.innerHTML = reportHTML(); drawPlate($('plate'), lastReport.run, 420); }
  else scr.innerHTML = '';
  scr.className = `scr-${name}`;
  if (name !== 'play') { input.stick = false; input.sx = input.sy = 0; $('stick').classList.remove('on'); input.keys.clear(); }
  if (name === 'title') placeDemo();
}

function soundButtons() {
  return `<button class="round" data-action="mute" aria-label="${audio.sfx.muted ? 'Turn sound on' : 'Turn sound off'}" aria-pressed="${!audio.sfx.muted}">${audio.sfx.muted ? ICONS.mute : ICONS.sound}</button>
    <button class="round${audio.musicOn ? '' : ' off'}" data-action="music" aria-label="${audio.musicOn ? 'Turn music off' : 'Turn music on'}" aria-pressed="${audio.musicOn}">${ICONS.music}</button>`;
}

function titleHTML() {
  const sv = saved.get('run', null);
  const canResume = sv && sv.v === 1 && sv.s && !sv.s.over;
  const today = dailySeed();
  const d = meta.daily && meta.daily.date === today ? meta.daily : null;
  const cell = CELLS[ui.cell];
  const found = KINDS.filter((k) => meta.atlas[k]).length + meta.evos.length;
  const all = KINDS.length + Object.keys(WEAPONS).length;
  return `<div class="card title-card">
    <div class="frost"><span>Slide ${String(meta.runs + 1).padStart(3, '0')}</span><span>H&amp;E, Gram</span></div>
    <div class="card-body">
      <h1 class="logo">Big Eater</h1>
      <p class="tag">You're a white blood cell. Everything else on the slide is lunch.</p>
      <div class="cells" role="radiogroup" aria-label="Your cell">
        ${cellIds.map((id) => {
          const open = !!meta.cells[id];
          return `<button class="cell${ui.cell === id ? ' on' : ''}${open ? '' : ' locked'}" role="radio" aria-checked="${ui.cell === id}" data-action="cell" data-id="${id}" aria-label="${esc(CELLS[id].name)}${open ? '' : ' (locked)'}">
            <img src="${cellPic(id)}" alt="" />${open ? '' : `<span class="lock">${ICONS.lock}</span>`}</button>`;
        }).join('')}
      </div>
      <p class="cell-blurb"><b>${esc(cell.name)}</b>, ${esc(cell.nick)}. ${meta.cells[ui.cell] ? esc(cell.blurb) : `Locked: ${esc(cell.unlock.toLowerCase())}.`}</p>
      <div class="strain" role="group" aria-label="Strain">
        <button class="round" data-action="strain" data-d="-1" aria-label="Easier strain" ${ui.strain <= 0 ? 'disabled' : ''}>‹</button>
        <span>Strain <b>${STRAINS[ui.strain]}</b>${ui.strain === 0 ? '' : `<small>tougher, faster, more of them</small>`}</span>
        <button class="round" data-action="strain" data-d="1" aria-label="Harder strain" ${ui.strain >= meta.strainMax || ui.strain >= STRAINS.length - 1 ? 'disabled' : ''}>›</button>
      </div>
      <button class="go" data-action="start" ${meta.cells[ui.cell] ? '' : 'disabled'}>Start a culture ${kbd('Enter')}</button>
      ${canResume ? `<button class="plain" data-action="resume">Carry on at ${fmtTime(sv.s.t)}, level ${sv.s.p.lvl}</button>` : ''}
      <button class="plain" data-action="daily">Today's culture<small>${d ? `your best: ${d.won ? 'cleared' : fmtTime(d.t)}, ${d.kills.toLocaleString('en-US')} germs` : `everyone gets the ${esc(CELLS[dailyCell()].name.toLowerCase())} and the same waves`}</small></button>
      <div class="row">
        <button class="plain small" data-action="atlas">Atlas <b>${found}/${all}</b></button>
        <button class="plain small" data-action="help">How to play</button>
        ${soundButtons()}
      </div>
    </div>
  </div>`;
}

function offerView(o) {
  if (o.type === 'weapon') {
    const d = WEAPONS[o.id];
    return { cls: 'wpn', icon: ICONS[o.id], name: d.name, tag: o.lvl === 1 ? 'New weapon' : `Level ${o.lvl}`, desc: o.lvl === 1 ? d.blurb : d.steps[o.lvl - 1] };
  }
  if (o.type === 'evo') {
    const d = WEAPONS[o.id];
    return { cls: 'evo', icon: ICONS[o.id], name: d.evo.name, tag: 'Evolution', desc: `${d.name} evolves. ${d.evo.blurb}` };
  }
  if (o.type === 'organelle') {
    const d = ORGANELLES[o.id];
    const partner = run && run.weapons.find((w) => !w.evo && WEAPONS[w.id].evo.with === o.id);
    return { cls: 'org', icon: ICONS[o.id], name: d.name, tag: o.lvl === 1 ? 'New organelle' : `Level ${o.lvl} of ${d.max}`, desc: d.blurb + (partner && o.lvl === 1 ? ` Lets ${WEAPONS[partner.id].name} evolve at level 6.` : '') };
  }
  if (o.type === 'tough') return { cls: 'heal', icon: ICONS.membrane, name: 'Thicker skin', tag: 'Snack', desc: '+10 health, for good.' };
  if (o.type === 'heal') return { cls: 'heal', icon: ICONS.heal, name: 'Glucose', tag: 'Snack', desc: 'Restore 30 health.' };
  return { cls: 'heal', icon: ICONS.charge, name: 'Adrenaline', tag: 'Snack', desc: 'Fill the Burst.' };
}

function levelHTML() {
  return `<div class="levelup">
    <h2>Level ${run.p.lvl}</h2>
    <p class="sub">Pick a slide</p>
    <div class="tray">
      ${run.offers.map((o, i) => {
        const v = offerView(o);
        return `<button class="pick ${v.cls}" data-action="pick" data-i="${i}">
          <span class="frost">${v.icon}<b>${esc(v.tag)}</b></span>
          <span class="pick-body"><b>${esc(v.name)}</b><span>${esc(v.desc)}</span></span>
          ${kbd(i + 1)}
        </button>`;
      }).join('')}
    </div>
    <button class="plain small" data-action="reroll" ${run.rerolls > 0 ? '' : 'disabled'}>Swap these (${run.rerolls} left) ${kbd('R')}</button>
    <div class="build mini">${chips(run)}</div>
  </div>`;
}

function buildList(s) {
  const w = s.weapons.map((x) => `<li><span class="chip wpn${x.evo ? ' evo' : ''}">${ICONS[x.id]}</span><b>${esc(x.evo ? WEAPONS[x.id].evo.name : WEAPONS[x.id].name)}</b><span>${x.evo ? 'evolved' : `level ${x.lvl}`}${!x.evo ? `, evolves with ${esc(ORGANELLES[WEAPONS[x.id].evo.with].name)}` : ''}</span></li>`).join('');
  const o = s.organelles.map((x) => `<li><span class="chip org">${ICONS[x.id]}</span><b>${esc(ORGANELLES[x.id].name)}</b><span>level ${x.lvl}</span></li>`).join('');
  return `<ul class="build-list">${w}${o}</ul>`;
}

function pauseHTML() {
  return `<div class="card pause-card">
    <div class="frost"><span>Paused</span><span>${fmtTime(run.t)}</span></div>
    <div class="card-body">
      <h2>Paused</h2>
      ${buildList(run)}
      <button class="go" data-action="unpause">Carry on ${kbd('P')}</button>
      <div class="row">
        <button class="plain small" data-action="help">How to play</button>
        <button class="plain small" data-action="quit">Save and leave</button>
        ${soundButtons()}
      </div>
    </div>
  </div>`;
}

function reportHTML() {
  const r = lastReport, s = r.run;
  const won = s.over === 'won';
  const top = Object.entries(s.stats.dmgBy).sort((a, b) => b[1] - a[1])[0];
  const topName = top ? (top[0] === 'burst' ? 'the Burst' : WEAPONS[top[0]].name) : '';
  return `<div class="card report-card">
    <div class="frost"><span>Lab report</span><span>${s.daily ? esc(s.daily) : `strain ${STRAINS[s.strain]}`}</span></div>
    <div class="card-body">
      <canvas id="plate" aria-label="A culture plate grown from this run"></canvas>
      <div class="report-text">
        <h2>${won ? 'Culture cleared' : 'The culture won'}</h2>
        <p class="sub">${esc(CELLS[s.cell].name)}, ${fmtTime(s.t)} on the slide${r.best ? ', your best yet' : ''}</p>
        <dl class="stats">
          <div><dt>Germs destroyed</dt><dd>${s.stats.kills.toLocaleString('en-US')}</dd></div>
          <div><dt>Engulfed</dt><dd>${s.stats.gulps.toLocaleString('en-US')}</dd></div>
          <div><dt>Longest gulp chain</dt><dd>×${s.stats.bestChain}</dd></div>
          <div><dt>Level</dt><dd>${s.p.lvl}</dd></div>
          <div><dt>Bosses beaten</dt><dd>${s.stats.bosses.length} of 3${s.stats.bossGulps ? `, ${s.stats.bossGulps} swallowed whole` : ''}</dd></div>
          ${topName ? `<div><dt>Did the most damage</dt><dd>${esc(topName)}</dd></div>` : ''}
        </dl>
        <div class="build">${chips(s)}</div>
        ${r.news.length ? `<ul class="news">${r.news.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        <button class="go" data-action="again">${s.daily ? "Try today's culture again" : 'Start another culture'} ${kbd('Enter')}</button>
        <div class="row">
          <button class="plain small" data-action="title">Back to the title</button>
          <button class="plain small" data-action="savepic">Save the plate</button>
        </div>
      </div>
    </div>
  </div>`;
}

function helpHTML() {
  return `<div class="card modal-card" role="dialog" aria-label="How to play">
    <div class="frost"><span>How to play</span></div>
    <div class="card-body">
      <h2>How to play</h2>
      <ul class="how">
        <li><b>Swim.</b> ${touch ? 'Drag anywhere on the slide.' : 'WASD or the arrow keys (or drag with the mouse).'} Your weapons fire by themselves.</li>
        <li><b>Eat.</b> A germ in an <span class="amber">amber ring</span> is weak or tagged. Swim over it to engulf it: double ATP, a little health and charge for the Burst.</li>
        <li><b>Burst.</b> ${touch ? 'Tap Burst' : 'Press Space'} when the meter is full: a wave that hurts and tags everything near, and wipes out toxin.</li>
        <li><b>Grow.</b> Amber ATP levels you up. Five weapons, five organelles. A weapon at level 6 evolves if you own its partner organelle.</li>
        <li><b>Read the stain.</b> ${gramDot('p')} violet germs take double from Lysozyme, ${gramDot('n')} pink from Complement, ${gramDot('v')} viruses from Interferon. ${gramDot('s')} Green is just tough. <span class="tox">Chartreuse</span> is toxin: dodge it.</li>
        <li><b>Survive 7:30</b> and beat the Superbug. A boss under a tenth of its health can be swallowed whole.</li>
      </ul>
      <button class="go" data-action="close">Got it ${kbd('Esc')}</button>
    </div>
  </div>`;
}

function atlasHTML() {
  const germs = KINDS.map((k) => {
    const g = GERMS[k], n = meta.atlas[k] || 0;
    return `<li class="${n ? '' : 'unknown'}"><img src="${portrait(k)}" alt="" /><div><b>${n ? esc(g.name) : 'Not met yet'}</b>${n ? `<i>${esc(g.latin)}</i><span>${gramDot(g.gram)}${esc(GRAM_NAME[g.gram])}. ${esc(g.note)}</span><small>${n.toLocaleString('en-US')} destroyed</small>` : `<span>${g.boss ? 'A boss.' : `Arrives after ${fmtTime(g.from)}.`}</span>`}</div></li>`;
  }).join('');
  const evos = Object.keys(WEAPONS).map((id) => {
    const d = WEAPONS[id], has = meta.evos.includes(id);
    return `<li class="${has ? '' : 'unknown'}"><span class="chip wpn evo">${ICONS[id]}</span><div><b>${has ? esc(d.evo.name) : '???'}</b><span>${esc(d.name)} at level 6, with ${esc(ORGANELLES[d.evo.with].name)}${has ? `. ${esc(d.evo.blurb)}` : ''}</span></div></li>`;
  }).join('');
  return `<div class="card modal-card atlas" role="dialog" aria-label="Atlas">
    <div class="frost"><span>Atlas</span><span>${meta.wins} cleared of ${meta.runs}</span></div>
    <div class="card-body">
      <h2>Atlas</h2>
      <div class="atlas-scroll">
        <h3>Germs</h3><ul class="atlas-list">${germs}</ul>
        <h3>Evolutions</h3><ul class="atlas-list">${evos}</ul>
      </div>
      <button class="go" data-action="close">Close ${kbd('Esc')}</button>
    </div>
  </div>`;
}

function openModal(name) {
  ui.modal = name;
  const m = $('modal');
  m.hidden = false;
  m.innerHTML = name === 'help' ? helpHTML() : atlasHTML();
  m.querySelector('.go')?.focus();
}
function closeModal() {
  ui.modal = null;
  $('modal').hidden = true;
  $('modal').innerHTML = '';
}

function openLevelUp() {
  audio.level();
  setScreen('levelup');
  saveRun();
  if (ui.autoPick) pick(autoBot ? autoBot.pick(run) : 0, true);
}

function pick(i, force = false) {
  if (ui.screen !== 'levelup' || !run.offers) return;
  if (!force && performance.now() - ui.openedAt < 350) return; // no accidental picks mid-dodge
  const o = run.offers[i];
  if (!o) return;
  engine.choose(run, i);
  if (o.type !== 'evo') audio.pick();
  handleEvents(run, true);
  hudCache = {};
  setScreen('play');
}

function pause() {
  if (ui.screen !== 'play' || run.over) return;
  saveRun();
  setScreen('pause');
  audio.music(false);
}
function unpause() {
  if (ui.screen !== 'pause') return;
  setScreen('play');
  loop.resync();
  audio.music(true);
}

function finish() {
  const s = run;
  const news = [];
  for (const [k, n] of Object.entries(s.stats.byKind)) {
    if (!meta.atlas[k] && !GERMS[k].hidden) news.push(`New in the atlas: ${GERMS[k].name}`);
    meta.atlas[k] = (meta.atlas[k] || 0) + n;
  }
  for (const id of s.stats.evos) if (!meta.evos.includes(id)) { meta.evos.push(id); news.push(`Evolution found: ${WEAPONS[id].evo.name}`); }
  const unlock = (id) => { if (!meta.cells[id]) { meta.cells[id] = true; news.push(`New cell: the ${CELLS[id].name}`); } };
  if (s.stats.bosses.includes('biofilm')) unlock('neutro');
  if (s.stats.bosses.includes('waterbear')) unlock('eosino');
  if (s.over === 'won') {
    unlock('dendri');
    meta.wins++;
    if (!s.daily && s.strain >= meta.strainMax && meta.strainMax < STRAINS.length - 1) { meta.strainMax = s.strain + 1; news.push(`Strain ${STRAINS[meta.strainMax]} is ready for you`); }
  }
  if (s.daily) {
    const better = !meta.daily || meta.daily.date !== s.daily || (s.over === 'won') > meta.daily.won || ((s.over === 'won') === meta.daily.won && s.t > meta.daily.t);
    if (better) meta.daily = { date: s.daily, t: s.t, won: s.over === 'won', kills: s.stats.kills };
  }
  saveMeta();
  saved.remove('run');
  const { value } = engine.score(s);
  const label = s.over === 'won' ? `Strain ${STRAINS[s.strain]} cleared` : `Strain ${STRAINS[s.strain]}, ${fmtTime(s.t)}`;
  const best = recordBest(SLUG, value, label);
  lastReport = { run: s, news: news.slice(0, 5), best: best && meta.runs > 1 };
  audio.music(false);
  if (s.over === 'won') audio.won();
  setScreen('report');
}

function toTitle() {
  run = null;
  renderer.reset();
  newDemo();
  setScreen('title');
  audio.music(false);
}

// the title card sits beside (desktop) or below (phone) the demo; aim the camera at the gap
const demoOffset = { ox: 0, oy: 0 };
function placeDemo() {
  const card = document.querySelector('.title-card');
  if (!card) return;
  const r = card.getBoundingClientRect();
  if (innerWidth > 760) { demoOffset.ox = (r.right + innerWidth) / 2 - innerWidth / 2; demoOffset.oy = 0; }
  else { demoOffset.ox = 0; demoOffset.oy = r.top / 2 - innerHeight / 2; }
}
addEventListener('resize', placeDemo);

// ---------- input ----------
const MOVE = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
function readInput() {
  if (ui.auto && autoBot) return autoBot.input(run);
  let mx = input.sx, my = input.sy;
  for (const k of input.keys) { const m = MOVE[k]; if (m) { mx += m[0]; my += m[1]; } }
  const b = input.burst;
  input.burst = false;
  return { mx, my, burst: b };
}

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (ui.modal) { if (k === 'escape' || k === 'enter') { e.preventDefault(); closeModal(); } return; }
  if (ui.screen === 'play') {
    if (MOVE[k]) { input.keys.add(k); e.preventDefault(); }
    else if (k === ' ') { input.burst = true; e.preventDefault(); }
    else if (k === 'p' || k === 'escape') pause();
  } else if (ui.screen === 'levelup') {
    if (k >= '1' && k <= '4') pick(+k - 1);
    else if (k === 'r') act('reroll');
  } else if (ui.screen === 'pause') {
    if (k === 'p' || k === 'escape' || k === 'enter') { e.preventDefault(); unpause(); }
  } else if (ui.screen === 'title') {
    if (k === 'enter' && !e.repeat && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); act('start'); }
  } else if (ui.screen === 'report') {
    if (k === 'enter' && !e.repeat && performance.now() - ui.openedAt > 500 && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); act('again'); }
  }
});
addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));

let stickId = null, stickX = 0, stickY = 0;
function stickMove(x, y) {
  const dx = x - stickX, dy = y - stickY;
  const d = Math.hypot(dx, dy), R = 46;
  const k = d > R ? R / d : 1;
  input.sx = (dx * k) / R; input.sy = (dy * k) / R;
  // a small dead zone, then full speed quickly
  const m = Math.hypot(input.sx, input.sy);
  if (m < 0.15) { input.sx = input.sy = 0; } else { const f = Math.min(1, (m - 0.15) / 0.5) / m; input.sx *= f; input.sy *= f; }
  $('stick').firstElementChild.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
}
canvas.addEventListener('pointerdown', (e) => {
  if (ui.screen !== 'play' || stickId !== null) return;
  stickId = e.pointerId; stickX = e.clientX; stickY = e.clientY;
  input.stick = true;
  const st = $('stick');
  st.style.left = `${stickX}px`; st.style.top = `${stickY}px`;
  st.classList.add('on');
  stickMove(e.clientX, e.clientY);
  try { canvas.setPointerCapture(e.pointerId); } catch {}
});
canvas.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickMove(e.clientX, e.clientY); });
const stickEnd = (e) => {
  if (e.pointerId !== stickId) return;
  stickId = null; input.stick = false; input.sx = input.sy = 0;
  $('stick').classList.remove('on');
};
canvas.addEventListener('pointerup', stickEnd);
canvas.addEventListener('pointercancel', stickEnd);

function act(name, el) {
  switch (name) {
    case 'start': if (meta.cells[ui.cell]) start(); break;
    case 'daily': start({ seed: `daily:${dailySeed()}`, cell: dailyCell(), strain: 0, daily: dailySeed() }); break;
    case 'resume': resume(); break;
    case 'cell':
      ui.cell = el.dataset.id;
      audio.ui();
      if (meta.cells[ui.cell]) { demo.cell = ui.cell; }
      setScreen('title');
      break;
    case 'strain': ui.strain = Math.max(0, Math.min(meta.strainMax, ui.strain + +el.dataset.d)); audio.ui(); setScreen('title'); break;
    case 'pick': pick(+el.dataset.i); break;
    case 'reroll': if (engine.reroll(run)) { audio.ui(); setScreen('levelup'); ui.openedAt = 0; } break;
    case 'pause': pause(); break;
    case 'unpause': unpause(); break;
    case 'quit': saveRun(); toTitle(); break;
    case 'burst': input.burst = true; break;
    case 'again':
      if (lastReport?.run.daily) act('daily'); else start({ cell: lastReport?.run.cell || ui.cell, strain: Math.min(lastReport?.run.strain ?? ui.strain, meta.strainMax) });
      break;
    case 'title': toTitle(); break;
    case 'savepic': {
      const big = document.createElement('canvas');
      drawPlate(big, lastReport.run, 900);
      const a = document.createElement('a');
      a.download = `big-eater-${dailySeed()}.png`;
      a.href = big.toDataURL('image/png');
      a.click();
      break;
    }
    case 'help': openModal('help'); break;
    case 'atlas': openModal('atlas'); break;
    case 'close': closeModal(); break;
    case 'mute': audio.sfx.toggleMute(); refreshSound(); break;
    case 'music': audio.toggleMusic(ui.screen === 'play'); refreshSound(); break;
  }
}
function refreshSound() {
  if (ui.screen === 'title' || ui.screen === 'pause') setScreen(ui.screen);
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && !el.disabled) act(el.dataset.action, el);
  else if (e.target.id === 'modal') closeModal();
});
// the Burst button answers on press, not release
$('burst').addEventListener('pointerdown', () => (input.burst = true));

onHidden(() => { if (ui.screen === 'play' && !ui.auto) pause(); else audio.music(false); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && ui.screen === 'play') audio.music(true); });

// ---------- the loop ----------
const loop = createLoop({
  update(dt) {
    if (ui.modal) return;
    if (ui.screen === 'title') {
      steps.run(dt, () => stepDemo(true));
      renderer.tick(dt);
    } else if (ui.screen === 'play') {
      let k = 1;
      if (slow > 0) { slow -= dt; k = ui.skip ? 1 : 0.22; }
      steps.run(dt * k, () => {
        engine.step(run, readInput());
        handleEvents(run, true);
        if (run.offers) { openLevelUp(); return false; }
        if (run.over) return false;
      });
      renderer.tick(dt);
      if (run.over) {
        ending += dt;
        if (ending > (ui.skip ? 0 : run.over === 'won' ? 2.2 : 1.4)) finish();
      } else coachTick();
      if (ui.screen !== 'report') hud();
    }
  },
  render() {
    if (ui.screen === 'title') renderer.draw(demo, demoOffset);
    else if (run) renderer.draw(run, { hideCell: run.over === 'dead' });
  },
});

homeLink();
document.fonts?.load('700 20px DynaPuff');
newDemo();
setScreen('title');

markReady({
  get state() { return run; },
  get demo() { return demo; },
  ui, meta, loop, engine, renderer, audio,
  advance(seconds = 1) { loop.advance(seconds); },
  start, resume, pause, unpause, toTitle, pick,
  /** Hand the controls to the bot (and let it pick upgrades). */
  autopilot(on = true, skill = 0.85, picks = true) {
    ui.auto = on; ui.autoPick = on && picks;
    autoBot = on ? createBot({ skill, seed: 5 }) : null;
    if (on && ui.screen === 'levelup') pick(autoBot.pick(run), true);
  },
  skipAnimations(on = true) { ui.skip = on; },
  /** Give an upgrade through the same path as a level-up choice. */
  give(type, id) { engine.apply(run, { type, id }); hudCache = {}; },
  levelUp() { run.p.xp = run.p.need; },
  spawn(kind, dx = 120, dy = 0, opt) { return engine.debugSpawn(run, kind, run.p.x + dx, run.p.y + dy, opt); },
  /** Bring a boss on now, optionally nearly beaten (so it can be engulfed). */
  boss(i = 0, weak = false) {
    const e = engine.debugSpawn(run, BOSSES[i], run.p.x + 200, run.p.y);
    if (weak) e.hp = e.mhp * 0.08;
    return e;
  },
  lose() { run.p.hp = 0.01; run.p.inv = 0; engine.debugSpawn(run, 'coccus', run.p.x + 4, run.p.y).dmg = 50; },
  win() { run.enemies.length = 0; const e = engine.debugSpawn(run, 'superbug', run.p.x + 60, run.p.y); e.hp = 1; },
  clearSave() { saved.remove('run'); },
  /** Hand play on the manual clock: hold a direction for some seconds, get a summary back. */
  hold(mx = 0, my = 0, seconds = 1, burst = false) {
    loop.manual = true;
    input.sx = mx; input.sy = my; input.burst = burst;
    loop.advance(seconds);
    input.sx = input.sy = 0;
    const s = run;
    if (!s) return null;
    const near = s.enemies.map((e) => ({ k: e.k, dx: Math.round(e.x - s.p.x), dy: Math.round(e.y - s.p.y), eat: engine.edible(s, e) })).sort((a, b) => a.dx ** 2 + a.dy ** 2 - (b.dx ** 2 + b.dy ** 2)).slice(0, 6);
    return { screen: ui.screen, t: +s.t.toFixed(1), hp: Math.round(s.p.hp), lvl: s.p.lvl, xp: `${Math.round(s.p.xp)}/${s.p.need}`, burst: `${s.p.burst}/${s.mods.burstNeed}`, germs: s.enemies.length, kills: s.stats.kills, gulps: s.stats.gulps, near, offers: s.offers?.map((o) => `${o.type}:${o.id || ''}`) };
  },
  prepareThumbnail() {
    loop.manual = true;
    closeModal();
    ui.noCoach = true; // for this page only: nothing is saved
    start({ seed: 20261113, cell: 'macro', strain: 0 });
    for (const id of ['complement', 'peroxide']) engine.apply(run, { type: 'weapon', id });
    const bot = createBot({ skill: 0.9, seed: 3 });
    while (run.t < 138 && !run.over) {
      if (run.offers) engine.choose(run, bot.pick(run));
      engine.step(run, bot.input(run));
      run.events.length = 0;
    }
    if (run.offers) engine.choose(run, 0);
    run.p.hp = Math.max(run.p.hp, run.p.mhp * 0.7);
    ui.auto = true; ui.autoPick = true; autoBot = bot;
    hudCache = {};
    loop.advance(0.6);
    ui.auto = false; ui.autoPick = false;
  },
});
