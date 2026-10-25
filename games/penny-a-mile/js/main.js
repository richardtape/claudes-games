// Penny a Mile: the page. Screens, input, the HUD, ticket cards, news slips, the Board meeting,
// the end of the charter and the debug hooks. The rules live in engine.js; drawing in render.js.
import { homeLink, markReady, recordBest, recordPlay, store, reducedMotion, onHidden } from '../../../shared/arcade.js';
import { createSfx } from '../../../shared/sfx.js';
import { dailySeed } from '../../../shared/rng.js';
import { createLoop } from '../../../shared/loop.js';
import { floatText, shake, pulse } from '../../../shared/juice.js';
import * as E from './engine.js';
import { W, H, CARGO, INDUSTRY, MODELS, LOAN, BOARD, END_YEAR, START_YEAR, YEAR, MONTH, MONTH_NAMES, COST, START_CASH } from './data.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { createBot } from './bot.js';
import { drawCompanyMap } from './poster.js';
import { createMusic } from './music.js';

const SLUG = 'penny-a-mile';
const DAYS_PER_SEC = 10;
const SAVE_V = 1;
const saved = store(SLUG);
const sfx = createSfx(SLUG);
const audio = createAudio(sfx);
const music = createMusic(sfx, saved);
const $ = (sel) => document.querySelector(sel);
const appEl = $('#app');
const canvas = $('#layout');
const renderer = createRenderer(canvas);
const R = renderer;

// ---- formatting ---------------------------------------------------------------------------------

const MINUS = '−';
export function money(n, { sign = false } = {}) {
  const v = Math.round(n);
  const s = `£${Math.abs(v).toLocaleString('en-GB')}`;
  if (v < 0) return MINUS + s;
  return sign && v > 0 ? `+${s}` : s;
}
function short(n) {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `£${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M` : a >= 1e4 ? `£${Math.round(a / 1000)}k` : `£${Math.round(a).toLocaleString('en-GB')}`;
  return n < 0 ? MINUS + s : s;
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const units = (c, n) => {
  const k = CARGO[c];
  const v = Math.round(n);
  if (c === 'pax') return `${v} ${v === 1 ? 'passenger' : 'passengers'}`;
  if (c === 'goods') return `${v} ${v === 1 ? 'crate' : 'crates'} of goods`;
  return `${v}${k.unit} of ${k.short}`;
};
const mph = (m) => Math.round(m.speed * 160);
const chip = (c, text, off = false) => `<span class="chip${off ? ' off' : ''}"><i style="--c:${CARGO[c].color}"></i>${esc(text)}</span>`;
const RANKS = [
  [0, 'Platform porter'],
  [400000, 'Booking clerk'],
  [900000, 'Stationmaster'],
  [1500000, 'Traffic manager'],
  [2500000, 'General manager'],
  [4000000, 'Chairman'],
  [6000000, 'Railway king'],
];
const rankFor = (v) => RANKS.filter(([min]) => v >= min).pop()[1];

// ---- state ---------------------------------------------------------------------------------------

const app = {
  screen: 'title',
  s: null,
  demo: null,
  demoBot: null,
  tool: 'look',
  speed: 1,
  paused: false,
  autoPaused: false,
  selected: null,
  plan: null,
  planStart: null,
  planMode: null, // 'drag' | 'tap' | 'confirm'
  hover: null,
  lastSeq: 0,
  time: 0,
  marks: null,
  coach: null,
  keys: new Set(),
  busy: false,
  skip: false,
  labels: false,
};
window.__pam = app;

const loop = createLoop({ update, render, maxDt: 0.1 });

// ---- the loop ------------------------------------------------------------------------------------

function current() {
  return app.screen === 'title' ? app.demo : app.s;
}

function update(dt) {
  app.time += dt;
  // Music on the layout only, never into a hidden tab, and never while a test drives the clock.
  music.sync(app.screen === 'play' && !document.hidden && !loop.manual && !sfx.muted);
  // Keyboard panning.
  if (app.keys.size && app.screen !== 'title') {
    const sp = (600 * dt) / R.cam.z;
    if (app.keys.has('left')) R.cam.x -= sp;
    if (app.keys.has('right')) R.cam.x += sp;
    if (app.keys.has('up')) R.cam.y -= sp;
    if (app.keys.has('down')) R.cam.y += sp;
    R.clampCam();
  }
  if (app.screen === 'title' && app.demo) {
    const before = Math.floor(app.demo.day / MONTH);
    E.step(app.demo, dt * DAYS_PER_SEC * 1.5);
    if (Math.floor(app.demo.day / MONTH) !== before) app.demoBot.think(app.demo);
    if (app.demo.hold) E.resume(app.demo);
    if (app.demo.over) startDemo();
    return;
  }
  const s = app.s;
  if (!s || app.screen !== 'play') return;
  if (!app.paused && !s.hold) E.step(s, dt * DAYS_PER_SEC * app.speed);
  handleEvents();
  // A soft chuff when you're close enough to hear the engines.
  if (!app.paused && R.cam.z >= 1 && (app.chuffAt || 0) < app.time) {
    app.chuffAt = app.time + 0.34 / Math.min(2, app.speed);
    let n = 0;
    for (const t of s.trains) {
      if (t.state !== 'run' || !t.path) continue;
      const p = t.path[Math.min(t.path.length - 1, Math.floor(t.pos))];
      if (p && onScreen(p.x, p.y)) n++;
    }
    if (n) audio.chuff(n);
  }
}

function render() {
  const s = current();
  if (!s) return;
  const ui = {
    tool: app.screen === 'play' ? app.tool : 'look',
    hover: app.screen === 'play' ? app.hover : null,
    plan: app.plan || (app.planStart ? { ax: app.planStart.x, ay: app.planStart.y } : null),
    planOk: app.plan?.ok && app.plan.cost.total <= E.spendable(s),
    selected: app.screen === 'play' ? app.selected : null,
    time: app.time,
    reduced: reducedMotion(),
    paused: app.screen === 'play' && (app.paused || !!s.hold),
    labels: app.labels,
    marks: app.marks && app.time < app.marks.until ? app.marks.list : null,
  };
  R.draw(s, ui);
  if (app.screen === 'play') {
    hud();
    if (app.time - (app.cardsAt || 0) > 0.4) {
      app.cardsAt = app.time;
      refreshCards();
    }
  }
}

// ---- HUD ----------------------------------------------------------------------------------------

const hudCache = {};
function setText(id, text) {
  if (hudCache[id] === text) return;
  hudCache[id] = text;
  $(id).textContent = text;
}
function hud() {
  const s = app.s;
  const d = E.dateOf(s.day);
  const dateKey = `${d.month}-${d.year}`;
  if (hudCache.date !== dateKey) {
    hudCache.date = dateKey;
    const name = MONTH_NAMES[d.month];
    $('#date').innerHTML = `<span class="m-long">${name}</span><span class="m-short">${name.slice(0, 3)}</span> ${d.year}`;
  }
  setText('#cash', money(s.cash));
  $('#cash').classList.toggle('neg', s.cash < 0);
  setText('#loan', s.loan ? `loan ${short(s.loan)}` : 'no loan');
  const value = E.companyValue(s);
  const b = E.nextBoard(s);
  if (s.freePlay) {
    setText('#target-text', 'Free play: no more Board meetings');
    setText('#target-value', `Worth ${short(value)}`);
    $('#target-fill').style.width = '100%';
  } else if (b?.final) {
    setText('#target-text', `Final count on 1 January ${END_YEAR}`);
    setText('#target-value', `Worth ${short(value)}`);
    const best = saved.get('stats', null)?.best || 0;
    $('#target-fill').style.width = `${best ? Math.min(100, (value / best) * 100) : 100}%`;
  } else if (b) {
    setText('#target-text', `The Board wants ${short(b.target)} by ${b.year}`);
    setText('#target-value', `Worth ${short(value)}`);
    const f = Math.max(0, Math.min(1, value / b.target));
    $('#target-fill').style.width = `${(f * 100).toFixed(1)}%`;
    $('#target-fill').classList.toggle('ahead', value >= b.target);
  }
  for (const btn of document.querySelectorAll('.speed')) {
    const on = btn.dataset.action === 'pause' ? app.paused : !app.paused && +btn.dataset.speed === app.speed;
    if (btn.getAttribute('aria-pressed') !== String(on)) btn.setAttribute('aria-pressed', String(on));
  }
}

function setTool(t) {
  if (app.tool !== t) audio.click();
  app.tool = t;
  appEl.dataset.tool = t;
  cancelPlan();
  for (const b of document.querySelectorAll('.tool[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
  if (t === 'build') coachEvent('tool-build');
  refreshCards(true);
}

function setSpeed(n) {
  app.speed = n;
  app.paused = false;
  app.autoPaused = false;
  audio.click();
}
function togglePause() {
  app.paused = !app.paused;
  app.autoPaused = false;
  audio.click();
}

// ---- planning and building --------------------------------------------------------------------

function cancelPlan() {
  app.plan = null;
  app.planStart = null;
  app.planMode = null;
}

function planTo(x, y) {
  const st = app.planStart;
  if (!st || (st.x === x && st.y === y)) {
    app.plan = null;
    return;
  }
  if (app.plan && app.plan.bx === x && app.plan.by === y) return;
  app.plan = E.planRoute(app.s, st.x, st.y, x, y);
  if (!app.plan.ok) app.plan.bx = x;
  if (!app.plan.ok) app.plan.by = y;
}

function tryBuild() {
  const s = app.s;
  const p = app.plan;
  if (!p) return false;
  if (!p.ok) {
    audio.nope();
    toastAt(p.reason === 'no way through' ? 'No way through: rocks, water or buildings block it' : capital(p.reason));
    return false;
  }
  if (p.cost.total === 0 && p.service !== null) {
    // Already built and served: show it.
    select({ kind: 'service', id: p.service });
    cancelPlan();
    return false;
  }
  if (p.cost.total > E.spendable(s)) {
    audio.nope();
    toastAt(`Not enough money: this needs ${money(p.cost.total)}, and you can find ${money(E.spendable(s))} with the loan`);
    return false;
  }
  const r = E.build(s, p);
  if (!r.ok) {
    audio.nope();
    toastAt(capital(r.reason));
    return false;
  }
  audio.build(p.pieces.length);
  if (p.newA || p.newB) setTimeout(() => audio.station(), 260);
  R.float(p.bx + 0.5, p.by + 0.5, money(-p.cost.total), { colour: '#ffd9cf', dark: '#5e1a14', size: 15 });
  if (r.borrowed) floatText($('#loan'), `+${short(r.borrowed)} loan`, { className: 'pam-float' });
  handleEvents();
  if (r.service) select({ kind: 'service', id: r.service.id });
  cancelPlan();
  coachEvent('built');
  saveGame();
  return true;
}

const capital = (t) => (t ? t[0].toUpperCase() + t.slice(1) : '');

function toastAt(text) {
  addSlip({ mast: 'From the engineer', title: text, body: '', tone: 'bad', ms: 3500 });
}

// ---- selection and cards -----------------------------------------------------------------------

function select(sel) {
  app.selected = sel;
  if (sel) audio.tap();
  refreshCards(true);
}

let cardKey = '';
function refreshCards(force = false) {
  const el = $('#cards');
  const parts = [];
  const s = app.s;
  if (!s) return;
  if (app.tool === 'build' && (app.plan || app.planStart)) parts.push(planCard(s));
  else if (app.tool === 'build' && !app.selected) parts.push(buildHelpCard());
  if (app.selected) {
    const c = selectedCard(s, app.selected);
    if (c) parts.push(c);
    else app.selected = null;
  }
  appEl.classList.toggle('cards-open', parts.length > 0);
  appEl.classList.toggle('planning', !!app.planStart);
  const key = parts.map((p) => p.key).join('|');
  if (force || key !== cardKey) {
    const old = cardKey.split('|');
    el.innerHTML = parts.map((p) => p.html.replace('class="ticket', `class="ticket${old.includes(p.key) ? '' : ' enter'}`)).join('');
    cardKey = key;
  }
  // On a phone the cards are a bottom sheet: the coach sits just above it.
  const coach = $('#coach');
  const box = el.getBoundingClientRect();
  if (parts.length && box.width > innerWidth * 0.8) coach.style.bottom = `${Math.round(innerHeight - box.top + 6)}px`;
  else coach.style.bottom = '';
  for (const p of parts)
    for (const [k, v] of Object.entries(p.values || {})) {
      const n = el.querySelector(`[data-v="${k}"]`);
      if (n && n.textContent !== v) n.textContent = v;
    }
}

function coverSummary(s, x, y) {
  const cov = E.coverage(s, x, y);
  const sup = [...cov.supplies].map((c) => {
    const m = E.monthlySupply(s, cov, c);
    return chip(c, m > 0 ? `${CARGO[c].name} ${Math.round(m)} a month` : `${CARGO[c].name} (once supplied)`);
  });
  const acc = [...cov.accepts].map((c) => chip(c, CARGO[c].name));
  return { cov, sup, acc };
}

function placeName(s, x, y, prefer = null) {
  const i = y * W + x;
  if (s.station[i] >= 0) return E.stationById(s, s.station[i]).name;
  const cov = E.coverage(s, x, y);
  const ind = prefer !== null ? s.industries[prefer] : cov.inds.map((id) => s.industries[id]).sort((a, b) => E.footDist(a, x, y) - E.footDist(b, x, y))[0];
  const town = [...cov.towns.entries()].sort((a, b) => b[1] - a[1])[0];
  if (town && town[1] >= 6) return `A new station in ${s.towns[town[0]].name}`;
  if (ind) return `A new station by ${ind.name}`;
  if (town && town[1] >= 3) return `A new station in ${s.towns[town[0]].name}`;
  if (town) return `A new station on the edge of ${s.towns[town[0]].name}`;
  return 'A new station in open country';
}

function buildHelpCard() {
  return {
    key: 'buildhelp',
    html: `<div class="ticket cream" data-card="buildhelp">
      <h2>Lay a line</h2>
      <p>Drag from one spot to another: next to a colliery, a farm, the woods or a town. Stations appear at both ends, the track finds its own way, and a train sets off.</p>
      <p class="hint">${matchMedia('(hover: none)').matches ? 'Or tap one end, then the other. Two fingers move the map.' : 'Or click one end, then the other. Right-drag or the arrow keys move the map.'}</p>
    </div>`,
  };
}

function planCard(s) {
  const p = app.plan;
  const a = app.planStart;
  if (!p) {
    const { sup, acc } = coverSummary(s, a.x, a.y);
    return {
      key: `planstart-${a.x}-${a.y}`,
      html: `<div class="ticket cream" data-card="plan">
        <h2>${esc(placeName(s, a.x, a.y))}</h2>
        <p class="kind">${app.planMode === 'tap' ? 'Now tap where the line should go.' : 'Drag to where the line should go.'}</p>
        ${sup.length ? `<p>Gathers</p><div class="chips">${sup.join('')}</div>` : '<p class="hint">Nothing to gather here.</p>'}
        ${acc.length ? `<p>Takes</p><div class="chips">${acc.join('')}</div>` : ''}
        <div class="actions"><button class="btn plain" data-action="cancel-plan">Cancel <kbd>Esc</kbd></button></div>
      </div>`,
    };
  }
  if (!p.ok) {
    return {
      key: `planbad-${p.bx}-${p.by}-${p.reason}`,
      html: `<div class="ticket cream" data-card="plan">
        <h2>Can't build that</h2>
        <p class="neg">${esc(capital(p.reason === 'no way through' ? 'no way through: rocks, water or buildings are in the way' : p.reason))}.</p>
        <div class="actions"><button class="btn plain" data-action="cancel-plan">Cancel <kbd>Esc</kbd></button></div>
      </div>`,
    };
  }
  const est = E.estimate(s, p.ax, p.ay, p.bx, p.by, p.length);
  const afford = p.cost.total <= E.spendable(s);
  const bridges = p.pieces.filter((x) => s.ground[x.y * W + x.x] === 1).length;
  const flowsAB = est.flows.filter((f) => f.dir === 'ab');
  const flowsBA = est.flows.filter((f) => f.dir === 'ba');
  const flowText = (fl) => fl.map((f) => chip(f.c, f.monthly > 0 ? `${CARGO[f.c].name} ${f.monthly} a month` : `${CARGO[f.c].name} (once supplied)`)).join('');
  const nothing = !est.flows.length;
  const existing = p.service !== null;
  const confirm = app.planMode === 'confirm';
  const subsidy = s.subsidies.find((sb) => !sb.awarded && est.flows.some((f) => f.c === sb.c) && matchesSubsidy(s, sb, p));
  const roles = E.lineRoles(s, p.ax, p.ay, p.bx, p.by);
  return {
    key: `plan-${p.ax}-${p.ay}-${p.bx}-${p.by}-${confirm}-${afford}`,
    html: `<div class="ticket cream" data-card="plan">
      <h2>${esc(placeName(s, p.bx, p.by, roles.b))}</h2>
      <p class="kind">From ${esc(placeName(s, p.ax, p.ay, roles.a).replace(/^A new/, 'a new'))}, ${p.dist} tiles apart</p>
      ${est.flows.length ? `<div class="chips">${flowText(flowsAB)}${flowsBA.length ? `${flowsAB.length ? '<span class="chip-sep">and back</span>' : ''}${flowText(flowsBA)}` : ''}</div>` : ''}
      ${nothing ? '<p class="neg">Nothing to carry: neither end gathers what the other takes.</p>' : `<p><b>About ${money(est.profit)} a year</b> for each train${est.trainsNeeded > 1 ? `, and work for about ${est.trainsNeeded} trains` : ''}.</p>`}
      ${subsidy ? '<p class="good"><b>Wins the subsidy:</b> double pay for two years.</p>' : ''}
      <p class="bill">${[
        p.cost.track ? `${money(p.cost.track)} of track${bridges ? ` (${bridges} on bridges)` : ''}` : 'Uses track you own',
        p.cost.stations ? `${money(p.cost.stations)} for ${p.newA && p.newB ? 'two stations' : 'a station'}` : '',
        p.cost.train ? `${money(p.cost.train)} for a ${esc(E.newestModel(s).name)}` : existing ? 'the service already runs' : '',
      ]
        .filter(Boolean)
        .join(', ')}. <b class="${afford ? '' : 'neg'}">${money(p.cost.total)} in all.</b>${afford ? (p.cost.total > s.cash ? ` Borrows ${money(Math.ceil((p.cost.total - s.cash) / LOAN.step) * LOAN.step)}.` : '') : ` <span class="neg">You can find ${money(E.spendable(s))}, loan included.</span>`}</p>
      ${confirm ? `<div class="actions"><button class="btn brass" data-action="build-plan" ${afford ? '' : 'disabled'}>Build ${money(p.cost.total)} <kbd>Enter</kbd></button><button class="btn plain" data-action="cancel-plan">Cancel</button></div>` : '<p class="hint">Let go to build.</p>'}
    </div>`,
  };
}

function matchesSubsidy(s, sb, p) {
  const ca = E.coverage(s, p.ax, p.ay);
  const cb = E.coverage(s, p.bx, p.by);
  const hit = (cov, end) => (end.ind !== undefined ? cov.inds.includes(end.ind) : cov.towns.has(end.town));
  return (hit(ca, sb.src) && hit(cb, sb.dst)) || (hit(cb, sb.src) && hit(ca, sb.dst));
}

function servicesAt(s, st) {
  return s.services.filter((v) => v.a === st.id || v.b === st.id);
}
const svcName = (s, v) => `${E.stationById(s, v.a)?.name} to ${E.stationById(s, v.b)?.name}`;

function selectedCard(s, sel) {
  const close = '<button class="ticket-close" data-action="deselect" aria-label="Close">×</button>';
  const no = (n) => `<span class="ticket-no">No. ${String(n).padStart(4, '0')}</span>`;
  if (sel.kind === 'station') {
    const st = E.stationById(s, sel.id);
    if (!st) return null;
    const { sup, acc } = coverSummary(s, st.x, st.y);
    const active = [...E.activeCargo(s, st)];
    const svcs = servicesAt(s, st);
    const values = {};
    const waiting = active
      .map((c) => {
        values[`w-${c}`] = Math.round(st.waiting[c] || 0).toString();
        const r = st.rating[c] ?? 0.55;
        values[`r-${c}`] = `${Math.round(r * 100)}%`;
        return `<div class="row"><span>${esc(CARGO[c].name)} waiting</span><b data-v="w-${c}"></b></div>
          <div class="row"><span>Share collected</span><b data-v="r-${c}"></b></div>`;
      })
      .join('');
    return {
      key: `station-${st.id}-${active.join(',')}-${svcs.length}-${active.some((c) => (st.waiting[c] || 0) > 150)}`,
      values,
      html: `<div class="ticket" data-card="station">${no(st.id)}${close}
        <h2>${esc(st.name)}</h2>
        <p class="kind">Station, opened ${E.yearOf(st.built)}</p>
        ${sup.length ? `<p>Gathers</p><div class="chips">${sup.join('')}</div>` : ''}
        ${acc.length ? `<p>Takes</p><div class="chips">${acc.join('')}</div>` : '<p class="hint">Takes nothing: no industry or town in reach wants anything.</p>'}
        ${waiting}
        ${active.some((c) => (st.waiting[c] || 0) > 150) ? '<p class="neg">Cargo is piling up and the share collected falls: add trains to a service from here.</p>' : ''}
        ${svcs.length ? `<ul class="lines">${svcs.map((v) => `<li><span class="dot" style="--c:${v.colour}"></span><button class="linkish" data-action="select-service" data-id="${v.id}">To ${esc(E.stationById(s, v.a === st.id ? v.b : v.a).name)}</button></li>`).join('')}</ul>` : '<p class="hint">No trains call here.</p>'}
        <div class="actions"><button class="btn" data-action="build-from" data-id="${st.id}">Build from here</button><button class="btn plain" data-action="clear-station" data-id="${st.id}">Close station</button></div>
      </div>`,
    };
  }
  if (sel.kind === 'service') {
    const v = E.serviceById(s, sel.id);
    if (!v) return null;
    const trains = s.trains.filter((t) => t.svc === v.id);
    const m = E.newestModel(s);
    const mod = E.modernisePrice(s, v.id);
    const classes = [...new Set(trains.map((t) => E.MODEL[t.model].name))];
    const values = {
      inc: money(v.income),
      cost: money(-v.cost),
      last: v.last ? money(v.last.income - v.last.cost) : 'first year',
      trips: String(v.trips),
    };
    return {
      key: `service-${v.id}-${trains.length}-${mod.n}-${m.id}-${E.spendable(s) >= m.cost}-${E.spendable(s) >= mod.cost}`,
      values,
      html: `<div class="ticket green" data-card="service">${no(v.id)}${close}
        <h2><span class="dot-inline" style="color:${v.colour}">●</span> ${esc(svcName(s, v))}</h2>
        <p class="kind">Service, opened ${E.yearOf(v.opened)}. ${trains.length} ${trains.length === 1 ? 'train' : 'trains'}: ${esc(classes.join(' and '))}.</p>
        <div class="row"><span>Earned this year</span><b data-v="inc"></b></div>
        <div class="row"><span>Running costs this year</span><b data-v="cost" class="neg"></b></div>
        <div class="row"><span>Profit last year</span><b data-v="last"></b></div>
        <div class="row"><span>Journeys</span><b data-v="trips"></b></div>
        <div class="actions">
          <button class="btn brass" data-action="add-train" data-id="${v.id}" ${E.spendable(s) >= m.cost ? '' : 'disabled'}>Add a train ${money(m.cost)}</button>
          ${trains.length > 1 ? `<button class="btn plain" data-action="sell-train" data-id="${trains[trains.length - 1].id}">Sell one</button>` : ''}
          ${mod.n ? `<button class="btn" data-action="modernise" data-id="${v.id}" ${E.spendable(s) >= mod.cost ? '' : 'disabled'}>Modernise ${mod.n} to ${esc(m.name)} ${money(mod.cost)}</button>` : ''}
          <button class="btn plain" data-action="close-service" data-id="${v.id}">Close service</button>
        </div>
      </div>`,
    };
  }
  if (sel.kind === 'train') {
    const t = E.trainById(s, sel.id);
    if (!t) return null;
    const m = E.MODEL[t.model];
    const v = E.serviceById(s, t.svc);
    const load = t.cargo.length ? t.cargo.map((p) => units(p.c, p.n)).join(', ') : 'empty';
    const where = t.lost ? 'lost: no track to its next station' : t.state === 'load' ? `loading at ${E.stationById(s, t.at)?.name}` : `heading for ${E.stationById(s, t.to)?.name}`;
    return {
      key: `train-${t.id}-${t.model}`,
      values: { load, where, profit: money(t.profit), last: t.lastProfit === null ? 'first year' : money(t.lastProfit), value: money(E.trainValue(s, t)) },
      html: `<div class="ticket green" data-card="train">${no(t.id)}${close}
        <h2>${esc(m.name)} ${esc(m.wheels)}</h2>
        <p class="kind">${m.cap} units, ${mph(m)} mph. On ${esc(svcName(s, v))}.</p>
        <p data-v="where" class="${t.lost ? 'neg' : ''}"></p>
        <div class="row"><span>Carrying</span><b data-v="load"></b></div>
        <div class="row"><span>Profit this year</span><b data-v="profit"></b></div>
        <div class="row"><span>Profit last year</span><b data-v="last"></b></div>
        <div class="row"><span>Worth</span><b data-v="value"></b></div>
        <div class="actions"><button class="btn" data-action="select-service" data-id="${v.id}">Its service</button><button class="btn plain" data-action="sell-train" data-id="${t.id}">Sell</button></div>
      </div>`,
    };
  }
  if (sel.kind === 'industry') {
    const o = s.industries[sel.id];
    const def = INDUSTRY[o.kind];
    const lastPct = o.lastMade ? Math.round((o.lastMoved / o.lastMade) * 100) : null;
    let what;
    if (def.makes) what = `<div class="chips">${chip(def.makes, `${CARGO[def.makes].name} ${o.prod} a month`)}</div>`;
    else if (def.turns) what = `<p>Takes ${def.takes.map((c) => CARGO[c].short).join(' and ')} and turns it into goods.</p><div class="chips">${chip(def.takes[0], `Takes ${CARGO[def.takes[0]].short}`)}${chip('goods', o.prod > 0 ? `Goods ${o.prod} a month` : 'Goods, once supplied')}</div>`;
    else what = `<p>Takes ${def.takes.map((c) => CARGO[c].short).join(' and ')}.</p><div class="chips">${def.takes.map((c) => chip(c, `Takes ${CARGO[c].short}`)).join('')}</div>`;
    return {
      key: `industry-${o.id}-${o.prod}`,
      html: `<div class="ticket" data-card="industry">${close}
        <h2>${esc(o.name)}</h2>
        <p class="kind">${esc(def.name)}</p>
        ${what}
        ${lastPct !== null && def.makes ? `<div class="row"><span>Carried away last year</span><b>${lastPct}%</b></div>` : ''}
        <p class="hint">${def.makes ? 'Serve it well and it tends to grow. A station within three tiles gathers its output.' : 'A station within three tiles delivers to it.'}</p>
      </div>`,
    };
  }
  if (sel.kind === 'town') {
    const t = s.towns[sel.id];
    return {
      key: `town-${t.id}`,
      values: { pop: t.pop.toLocaleString('en-GB'), pax: String(Math.round(t.lastPax || 0)), goods: String(Math.round(t.lastGoods || 0)) },
      html: `<div class="ticket" data-card="town">${close}
        <h2>${esc(t.name)}</h2>
        <p class="kind">Town</p>
        <div class="row"><span>People</span><b data-v="pop"></b></div>
        <div class="row"><span>Passengers carried last month</span><b data-v="pax"></b></div>
        <div class="row"><span>Goods delivered last month</span><b data-v="goods"></b></div>
        <p class="hint">Towns grow when trains carry their people, and faster when goods arrive. Bigger towns make more passengers.</p>
      </div>`,
    };
  }
  return null;
}

// ---- subsidies -----------------------------------------------------------------------------------

let subsKey = '';
function renderSubsidies() {
  const s = app.s;
  const el = $('#subsidies');
  if (!s) return;
  const list = s.subsidies.slice().sort((a, b) => Number(b.awarded) - Number(a.awarded));
  const key = list.map((sb) => `${sb.id}${sb.awarded}`).join(',');
  if (key === subsKey) return;
  subsKey = key;
  appEl.classList.toggle('has-subsidies', list.length > 0);
  el.innerHTML = list
    .map((sb) => {
      const from = E.endName(s, sb.src);
      const to = E.endName(s, sb.dst);
      const body = `${CARGO[sb.c].name} from ${from} to ${to}`;
      const when = sb.awarded ? `Double pay until ${E.dateLabel(sb.ends)}` : `Double pay for two years to the first delivery. Open until ${E.dateLabel(sb.until)}.`;
      return `<button class="subsidy${sb.awarded ? ' won' : ''}" data-action="show-subsidy" data-id="${sb.id}"><b>${sb.awarded ? `Subsidy won: double pay until ${esc(E.dateLabel(sb.ends))}` : 'Subsidy offered'}</b>${esc(body)}<small>${esc(when)}</small></button>`;
    })
    .join('');
}

function showSubsidy(id) {
  const s = app.s;
  const sb = s.subsidies.find((x) => x.id === id);
  if (!sb) return;
  const a = E.endPos(s, sb.src);
  const b = E.endPos(s, sb.dst);
  R.centreOn((a.x + b.x) / 2, (a.y + b.y) / 2);
  app.marks = { list: [a, b], until: app.time + 6 };
  audio.tap();
}

// ---- news ----------------------------------------------------------------------------------------

function addSlip(slip) {
  // News that arrives during a Board meeting waits until you're back at work.
  if (app.screen !== 'play') {
    (app.pendingSlips ||= []).push(slip);
    return;
  }
  showSlip(slip);
}
function flushSlips() {
  const list = app.pendingSlips || [];
  app.pendingSlips = [];
  list.slice(-3).forEach((sl, i) => setTimeout(() => showSlip(sl), 300 + i * 450));
}
function showSlip({ mast = 'The Shire Gazette', title, body = '', tone = '', ms = 6500 }) {
  const el = $('#news');
  const slip = document.createElement('div');
  slip.className = `slip ${tone}`;
  const date = app.s ? E.dateLabel(app.s.day) : '';
  slip.innerHTML = `<div class="slip-mast"><span>${esc(mast)}</span><span>${esc(date)}</span></div><h3>${esc(title)}</h3>${body ? `<p>${esc(body)}</p>` : ''}`;
  el.append(slip);
  while (el.children.length > 2) el.firstElementChild.remove();
  setTimeout(() => {
    slip.classList.add('leaving');
    setTimeout(() => slip.remove(), 320);
  }, ms);
}

// ---- events ---------------------------------------------------------------------------------------

function onScreen(X, Y) {
  const p = R.toScreen(X, Y);
  const { w, h } = R.size;
  return p.x > -40 && p.y > -40 && p.x < w + 40 && p.y < h + 40;
}

function handleEvents() {
  const s = app.s;
  if (!s) return;
  for (const e of s.events) {
    if (e.id <= app.lastSeq) continue;
    app.lastSeq = e.id;
    onEvent(s, e);
  }
}

function onEvent(s, e) {
  switch (e.type) {
    case 'pay': {
      const st = E.stationById(s, e.station);
      if (!st) break;
      const size = 13 + Math.min(9, Math.log2(1 + e.amount / 300) * 1.6);
      R.float(st.x + 0.5, st.y + 0.5, money(e.amount), { size });
      if (onScreen(st.x, st.y)) audio.coin(e.amount);
      if (!app.firstPay) {
        app.firstPay = true;
        coachEvent('paid');
      }
      break;
    }
    case 'depart': {
      const st = E.stationById(s, e.station);
      if (st && onScreen(st.x, st.y) && Math.random() < 0.35) audio.whistle();
      break;
    }
    case 'firstTrain': {
      const t = s.towns[e.town];
      addSlip({ title: `Citizens celebrate! First train arrives in ${t.name}`, body: `Crowds turned out at ${E.stationById(s, e.station)?.name} to see it come in.`, tone: 'good' });
      audio.cheer();
      break;
    }
    case 'subsidy': {
      const sb = s.subsidies.find((x) => x.id === e.subsidy);
      if (sb && s.day > 0) {
        addSlip({ mast: 'Board of Trade', title: 'Subsidy offered', body: `${CARGO[sb.c].name} from ${E.endName(s, sb.src)} to ${E.endName(s, sb.dst)}: double pay for two years to the first delivery.` });
        audio.news();
      }
      renderSubsidies();
      break;
    }
    case 'subsidyWon': {
      const sb = s.subsidies.find((x) => x.id === e.subsidy);
      if (sb) addSlip({ mast: 'Board of Trade', title: 'Subsidy won!', body: `${CARGO[sb.c].name} from ${E.endName(s, sb.src)} to ${E.endName(s, sb.dst)} now pays double until ${E.dateLabel(sb.ends)}.`, tone: 'good' });
      audio.fanfare();
      renderSubsidies();
      break;
    }
    case 'subsidyLapsed':
    case 'subsidyEnded':
      renderSubsidies();
      break;
    case 'news': {
      const tone = e.kind === 'down' ? 'bad' : e.kind === 'up' || e.kind === 'town' ? 'good' : '';
      let body = '';
      if (e.industry !== undefined) {
        const o = s.industries[e.industry];
        const c = INDUSTRY[o.kind].makes;
        body = `Now ${e.to}${CARGO[c].unit} of ${CARGO[c].short} a month, ${e.to > e.from ? 'up' : 'down'} from ${e.from}.`;
      }
      addSlip({ title: e.text, body, tone });
      audio.news();
      break;
    }
    case 'model': {
      const m = E.MODEL[e.model];
      addSlip({ mast: 'The Railway Gazette', title: `New locomotive: the ${m.name} ${m.wheels}`, body: `${mph(m)} mph and ${m.cap} units a trip. New trains are ${m.name}s; modernise a service from its card.`, tone: 'good', ms: 9000 });
      audio.brass();
      break;
    }
    case 'board':
      boardMeeting(s.boards[s.boards.length - 1]);
      break;
    case 'broke':
      addSlip({ mast: 'The bank', title: e.months >= 2 ? 'Final warning from the bank' : 'Out of money', body: `The loan is at its limit and the account is overdrawn. ${3 - e.months} more ${3 - e.months === 1 ? 'month' : 'months'} of this and the receivers come in. Sell trains or close losing services.`, tone: 'bad', ms: 9000 });
      audio.warn();
      break;
    case 'over':
      if (s.over?.reason === 'bankrupt') setTimeout(() => showEnd(), 600);
      break;
    case 'grow':
      if (onScreen(e.x, e.y)) R.pop(e.x, e.y);
      break;
    case 'lost': {
      const v = E.serviceById(s, e.service);
      if (v) addSlip({ mast: 'From the signal box', title: 'A train is lost', body: `A train on ${svcName(s, v)} has no track to its next station.`, tone: 'bad' });
      break;
    }
    case 'borrow':
      if (e.auto) pulse($('#loan'), 'bump', 300);
      break;
    case 'month':
      if (Math.floor(s.day / MONTH) % 1 === 0) saveGame();
      coachTick();
      break;
  }
}

// ---- input -------------------------------------------------------------------------------------

const pointers = new Map();
let gesture = null;

function localPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function capture(e) {
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {}
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  if (app.screen !== 'play') return;
  const p = localPoint(e);
  pointers.set(e.pointerId, p);
  capture(e);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, moved: true };
    if (app.planMode === 'drag') cancelPlan();
    return;
  }
  if (pointers.size > 2) return;
  const t = R.toTile(p.x, p.y);
  const panButton = e.button === 1 || e.button === 2 || app.keys.has('space');
  if (panButton || app.tool === 'look') {
    gesture = { type: 'pan', start: p, last: p, moved: false };
    return;
  }
  if (app.tool === 'build') {
    if (app.planStart && (app.planMode === 'tap' || app.planMode === 'confirm')) {
      gesture = { type: 'tapB', start: p, tile: t, moved: false };
      return;
    }
    if (inside(t) && E.canHostStation(app.s, t.x, t.y)) {
      app.planStart = { x: t.x, y: t.y };
      app.planMode = 'drag';
      app.plan = null;
      gesture = { type: 'plan', start: p, moved: false };
      refreshCards(true);
      return;
    }
    gesture = { type: 'pan', start: p, last: p, moved: false, deniedAt: t };
    return;
  }
  if (app.tool === 'bulldoze') {
    gesture = { type: 'doze', start: p, last: `${t.x},${t.y}`, moved: false };
    doze(t, true);
  }
});

const inside = (t) => t.x >= 0 && t.y >= 0 && t.x < W && t.y < H;

canvas.addEventListener('pointermove', (e) => {
  if (app.screen !== 'play') return;
  const p = localPoint(e);
  if (e.pointerType === 'mouse' || pointers.size === 0) {
    const t = R.toTile(p.x, p.y);
    app.hover = inside(t) ? { x: t.x, y: t.y } : null;
    if (app.tool === 'build' && app.planMode === 'tap' && app.hover && e.pointerType === 'mouse') {
      planTo(app.hover.x, app.hover.y);
      refreshCards();
    }
  }
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, p);
  if (!gesture) return;
  if (gesture.type === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    R.cam.x -= (mid.x - gesture.mid.x) / R.cam.z;
    R.cam.y -= (mid.y - gesture.mid.y) / R.cam.z;
    gesture.mid = mid;
    if (d / gesture.d0 > 1.35) {
      R.zoomAt(1, mid.x, mid.y);
      gesture.d0 = d;
    } else if (d / gesture.d0 < 0.74) {
      R.zoomAt(-1, mid.x, mid.y);
      gesture.d0 = d;
    }
    R.clampCam();
    return;
  }
  const moved = Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > 7;
  if (moved) gesture.moved = true;
  if (gesture.type === 'pan' && gesture.moved) {
    R.cam.x -= (p.x - gesture.last.x) / R.cam.z;
    R.cam.y -= (p.y - gesture.last.y) / R.cam.z;
    R.clampCam();
    gesture.last = p;
    canvas.classList.add('dragging');
  } else if (gesture.type === 'plan' && gesture.moved) {
    const t = R.toTile(p.x, p.y);
    if (inside(t)) {
      planTo(t.x, t.y);
      refreshCards();
    }
  } else if (gesture.type === 'doze') {
    const t = R.toTile(p.x, p.y);
    const k = `${t.x},${t.y}`;
    if (k !== gesture.last) {
      gesture.last = k;
      doze(t, false);
    }
  }
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  canvas.classList.remove('dragging');
  if (!gesture) return;
  const g = gesture;
  if (g.type === 'pinch') {
    if (pointers.size === 0) gesture = null;
    return;
  }
  gesture = null;
  if (e.type === 'pointercancel') {
    if (g.type === 'plan') cancelPlan();
    return;
  }
  const p = localPoint(e);
  const t = R.toTile(p.x, p.y);
  if (g.type === 'pan' && !g.moved) {
    if (g.deniedAt) {
      audio.nope();
      toastAt(inside(t) ? 'No room for a station there' : 'That is off the layout');
      return;
    }
    tapSelect(p, t);
  } else if (g.type === 'plan') {
    if (!g.moved || (app.plan === null && t.x === app.planStart?.x && t.y === app.planStart?.y)) {
      // A tap: wait for the other end.
      app.planMode = 'tap';
      app.plan = null;
      audio.tap();
      refreshCards(true);
    } else if (app.plan) {
      tryBuild();
      refreshCards(true);
    }
  } else if (g.type === 'tapB') {
    if (g.moved) return;
    if (!inside(t)) return;
    if (t.x === app.planStart.x && t.y === app.planStart.y) {
      cancelPlan();
      refreshCards(true);
      return;
    }
    if (e.pointerType === 'mouse' && app.plan && app.plan.bx === t.x && app.plan.by === t.y) {
      tryBuild();
      refreshCards(true);
      return;
    }
    planTo(t.x, t.y);
    app.planMode = 'confirm';
    audio.tap();
    refreshCards(true);
    framePlan();
  }
}

/** Pans so a planned line sits in the space between the bar and the cards (phones). */
function framePlan() {
  const p = app.plan;
  if (!p || !p.ok) return;
  const cards = $('#cards').getBoundingClientRect();
  const bar = $('#bar').getBoundingClientRect();
  const { w, h } = R.size;
  // Only when the cards span the screen's width (the phone's bottom sheet).
  if (cards.width < w * 0.8) return;
  const top = bar.bottom + 10;
  const bottom = cards.top - 10;
  if (bottom - top < 80) return;
  const pts = [R.toScreen(p.ax + 0.5, p.ay + 0.5), R.toScreen(p.bx + 0.5, p.by + 0.5)];
  if (pts.every((q) => q.y > top && q.y < bottom && q.x > 0 && q.x < w)) return;
  const mid = R.toScreen((p.ax + p.bx) / 2 + 0.5, (p.ay + p.by) / 2 + 0.5);
  R.cam.x += (mid.x - w / 2) / R.cam.z;
  R.cam.y += (mid.y - (top + bottom) / 2) / R.cam.z;
  R.clampCam();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => {
  if (pointers.size === 0) app.hover = null;
});

canvas.addEventListener(
  'wheel',
  (e) => {
    if (app.screen !== 'play') return;
    e.preventDefault();
    const p = localPoint(e);
    if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      app.wheel = (app.wheel || 0) + e.deltaY;
      if (Math.abs(app.wheel) > 60) {
        R.zoomAt(app.wheel < 0 ? 1 : -1, p.x, p.y);
        app.wheel = 0;
      }
    } else {
      R.cam.x += e.deltaX / R.cam.z;
      R.clampCam();
    }
  },
  { passive: false },
);

function tapSelect(p, t) {
  const s = app.s;
  const tr = R.trainAt(s, p.x, p.y);
  if (tr) return select({ kind: 'train', id: tr.id });
  if (!inside(t)) return select(null);
  const info = E.tileInfo(s, t.x, t.y);
  if (info.station) return select({ kind: 'station', id: info.station.id });
  if (info.industry) return select({ kind: 'industry', id: info.industry.id });
  if (info.town && (info.house || info.road || (info.town.x === t.x && info.town.y === t.y))) return select({ kind: 'town', id: info.town.id });
  select(null);
}

function doze(t, first) {
  if (!inside(t)) return;
  const s = app.s;
  const info = E.tileInfo(s, t.x, t.y);
  if (info.station) {
    if (first) askClearStation(info.station.id);
    return;
  }
  if (!info.track) return;
  const r = E.bulldoze(s, t.x, t.y);
  if (r.ok) {
    audio.bulldoze();
    R.float(t.x + 0.5, t.y + 0.5, money(r.refund, { sign: true }), { colour: '#e9f0d8', size: 12 });
  } else if (first) {
    audio.nope();
    toastAt(capital(r.reason));
  }
}

function askClearStation(id) {
  const s = app.s;
  const st = E.stationById(s, id);
  const svcs = servicesAt(s, st);
  const trains = s.trains.filter((t) => svcs.some((v) => v.id === t.svc));
  confirmBox({
    title: `Close ${st.name}?`,
    body: svcs.length ? `This ends ${svcs.length} ${svcs.length === 1 ? 'service' : 'services'} and sells ${trains.length} ${trains.length === 1 ? 'train' : 'trains'} for what ${trains.length === 1 ? 'it is' : 'they are'} worth. The track stays.` : 'The track stays. You get a quarter of the station’s cost back.',
    yes: 'Close the station',
    danger: true,
    onYes() {
      const r = E.bulldoze(s, st.x, st.y);
      if (r.ok) {
        audio.bulldoze();
        R.float(st.x + 0.5, st.y + 0.5, money(r.refund + (r.sold || 0), { sign: true }), { colour: '#e9f0d8', size: 13 });
        if (app.selected?.kind === 'station' && app.selected.id === id) select(null);
        handleEvents();
        saveGame();
      }
    },
  });
}

// Keyboard.
const KEYPAN = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const open = document.querySelector('dialog[open]');
  if (app.screen === 'board' || app.screen === 'end') {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (app.busy) app.skip = true;
      else document.querySelector(`#${app.screen === 'board' ? 'board-room' : 'end'} [data-default]`)?.click();
    }
    return;
  }
  if (open) return;
  if (app.screen !== 'play') return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (KEYPAN[k]) {
    app.keys.add(KEYPAN[k]);
    e.preventDefault();
    return;
  }
  if (k === ' ') {
    e.preventDefault();
    togglePause();
  } else if (k === '1') setSpeed(1);
  else if (k === '2') setSpeed(2);
  else if (k === '3') setSpeed(4);
  else if (k === 'l') setTool('look');
  else if (k === 'b') setTool('build');
  else if (k === 'd') setTool('bulldoze');
  else if (k === 's') openServices();
  else if (k === 'y') openLedger();
  else if (k === '+' || k === '=') R.zoomAt(1);
  else if (k === '-' || k === '_') R.zoomAt(-1);
  else if (k === 'n') app.labels = !app.labels;
  else if (k === 'm') {
    music.toggle();
    audio.click();
  }
  else if (k === '?') openHelp();
  else if (k === 'Enter' && app.planMode === 'confirm') tryBuild();
  else if (k === 'Escape') {
    if (app.plan || app.planStart) cancelPlan();
    else if (app.selected) select(null);
    else openMenu();
    refreshCards(true);
  }
});
window.addEventListener('keyup', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (KEYPAN[k]) app.keys.delete(KEYPAN[k]);
});
window.addEventListener('blur', () => app.keys.clear());

// Buttons everywhere go through one handler.
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const a = b.dataset.action;
  const id = b.dataset.id !== undefined ? +b.dataset.id : null;
  const s = app.s;
  switch (a) {
    case 'tool':
      setTool(b.dataset.tool);
      break;
    case 'pause':
      togglePause();
      break;
    case 'speed':
      setSpeed(+b.dataset.speed);
      break;
    case 'zoom-in':
      R.zoomAt(1);
      break;
    case 'zoom-out':
      R.zoomAt(-1);
      break;
    case 'deselect':
      select(null);
      break;
    case 'cancel-plan':
      cancelPlan();
      refreshCards(true);
      break;
    case 'build-plan':
      tryBuild();
      refreshCards(true);
      break;
    case 'build-from': {
      const st = E.stationById(s, id);
      setTool('build');
      app.planStart = { x: st.x, y: st.y };
      app.planMode = 'tap';
      refreshCards(true);
      break;
    }
    case 'clear-station':
      askClearStation(id);
      break;
    case 'select-service':
      select({ kind: 'service', id });
      closeSheets();
      break;
    case 'add-train': {
      const t = E.buyTrain(s, id);
      if (t) {
        audio.whistle();
        const st = E.stationById(s, t.at);
        R.float(st.x + 0.5, st.y + 0.5, money(-t.cost), { colour: '#ffd9cf', dark: '#5e1a14', size: 13 });
        coachEvent('train');
        handleEvents();
        saveGame();
      } else audio.nope();
      refreshCards(true);
      break;
    }
    case 'sell-train': {
      const t = E.trainById(s, id);
      if (!t) break;
      const v = E.trainValue(s, t);
      const svc = t.svc;
      E.sellTrain(s, id);
      audio.coin(v);
      floatText($('#cash'), money(v, { sign: true }), { className: 'pam-float' });
      if (app.selected?.kind === 'train') select(E.serviceById(s, svc) ? { kind: 'service', id: svc } : null);
      handleEvents();
      refreshCards(true);
      saveGame();
      break;
    }
    case 'modernise': {
      const cost = E.modernise(s, id);
      if (cost !== null) {
        audio.brass();
        floatText($('#cash'), money(-cost), { className: 'pam-float neg' });
        handleEvents();
        saveGame();
      } else audio.nope();
      refreshCards(true);
      break;
    }
    case 'close-service': {
      const v = E.serviceById(s, id);
      const trains = s.trains.filter((t) => t.svc === id);
      confirmBox({
        title: 'Close this service?',
        body: `${svcName(s, v)}: its ${trains.length} ${trains.length === 1 ? 'train is' : 'trains are'} sold for what ${trains.length === 1 ? 'it is' : 'they are'} worth. The track and stations stay.`,
        yes: 'Close the service',
        danger: true,
        onYes() {
          let got = 0;
          for (const t of trains) {
            got += E.trainValue(s, t);
            E.sellTrain(s, t.id);
          }
          audio.coin(got);
          floatText($('#cash'), money(got, { sign: true }), { className: 'pam-float' });
          select(null);
          handleEvents();
          saveGame();
        },
      });
      break;
    }
    case 'show-subsidy':
      showSubsidy(id);
      break;
    case 'services':
      openServices();
      break;
    case 'ledger':
      openLedger();
      break;
    case 'menu':
      openMenu();
      break;
    case 'help':
      openHelp();
      break;
    case 'close':
      closeSheets();
      break;
    case 'borrow':
      E.borrow(s);
      audio.coin(LOAN.step);
      openLedger();
      break;
    case 'repay':
      if (E.repay(s)) audio.click();
      else audio.nope();
      openLedger();
      break;
    case 'repay-all':
      while (s.loan > 0 && E.repay(s)) {}
      audio.click();
      openLedger();
      break;
    case 'mute':
      sfx.toggleMute();
      openMenu();
      break;
    case 'music':
      music.toggle();
      openMenu();
      break;
    case 'resume':
      closeSheets();
      break;
    case 'to-title':
      closeSheets();
      saveGame();
      toTitle();
      break;
    case 'new':
      startGame(`shire-${Math.floor(Math.random() * 1e9).toString(36)}`, false);
      break;
    case 'daily':
      startGame(`daily-${dailySeed()}`, true);
      break;
    case 'continue':
      continueGame();
      break;
    case 'free-play':
      if (E.continueFreePlay(app.s)) {
        $('#end').hidden = true;
        app.screen = 'play';
        appEl.dataset.screen = 'play';
        saveGame();
      }
      break;
    case 'save-map':
      saveMap();
      break;
    case 'coach-next':
      coachNext();
      break;
    case 'coach-skip':
      coachDone();
      break;
    case 'confirm-yes':
      $('#confirm').close();
      app.onConfirm?.();
      app.onConfirm = null;
      break;
    case 'confirm-no':
      $('#confirm').close();
      app.onConfirm = null;
      break;
  }
});

// ---- sheets ----------------------------------------------------------------------------------

function sheetHead(id, title) {
  return `<div class="sheet-head"><h2 id="${id}-title">${esc(title)}</h2><button class="btn" data-action="close" aria-label="Close">×</button></div>`;
}
function openSheet(id, html) {
  const d = $(`#${id}`);
  d.innerHTML = html;
  if (!d.open) d.showModal();
}
function closeSheets() {
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
}

function openServices() {
  const s = app.s;
  if (!s) return;
  const rows = s.services
    .map((v) => ({ v, n: s.trains.filter((t) => t.svc === v.id).length, last: v.last ? v.last.income - v.last.cost : null, now: v.income - v.cost }))
    .sort((a, b) => (b.last ?? b.now) - (a.last ?? a.now));
  openSheet(
    'services',
    `${sheetHead('services', 'Services')}<div class="sheet-body">${
      rows.length
        ? `<table class="table"><thead><tr><th>Service</th><th class="num">Trains</th><th class="num">This year</th><th class="num">Last year</th></tr></thead><tbody>${rows
            .map(
              ({ v, n, last, now }) =>
                `<tr class="click" data-action="select-service" data-id="${v.id}"><td><span style="color:${v.colour}">●</span> ${esc(svcName(s, v))}</td><td class="num">${n}</td><td class="num ${now < 0 ? 'neg' : ''}">${money(now)}</td><td class="num ${last < 0 ? 'neg' : ''}">${last === null ? '' : money(last)}</td></tr>`,
            )
            .join('')}</tbody></table><p class="hint">Profit after running costs. Pick a service to see it on the layout.</p>`
        : '<p>No services yet. Choose <b>Build</b> and drag a line between two places.</p>'
    }</div>`,
  );
}

function sparkline(s) {
  const pts = s.history.slice(-121);
  if (pts.length < 2) return '';
  const vals = pts.map((p) => p.value);
  const hi = Math.max(...vals);
  const lo = Math.min(...vals);
  const pad = Math.max(1000, (hi - lo) * 0.12);
  const max = hi + pad;
  const min = lo - pad;
  const w = 560;
  const h = 90;
  const y = (v) => (h - ((v - min) / (max - min)) * h).toFixed(1);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * w).toFixed(1)},${y(p.value)}`).join('');
  const first = E.dateLabel(pts[0].day);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d} L${w},${h} L0,${h} Z" fill="rgba(29,74,55,.1)"/><path d="${d}" fill="none" stroke="#1d4a37" stroke-width="2.2" vector-effect="non-scaling-stroke"/></svg>
    <p class="hint">Company value since ${esc(first)}: from ${short(pts[0].value)} to ${short(pts[pts.length - 1].value)}.</p>`;
}

function openLedger() {
  const s = app.s;
  if (!s) return;
  const y = s.year;
  const l = s.last;
  const row = (name, a, b) => `<tr><td>${name}</td><td class="num ${a < 0 ? 'neg' : ''}">${money(a)}</td><td class="num ${b < 0 ? 'neg' : ''}">${b === null ? '' : money(b)}</td></tr>`;
  const cargoRows = Object.keys(CARGO)
    .filter((c) => y.cargo[c] || l?.cargo[c])
    .map((c) => row(`&nbsp;&nbsp;${CARGO[c].name}`, y.cargo[c], l ? l.cargo[c] : null))
    .join('');
  const value = E.companyValue(s);
  const trainsWorth = s.trains.reduce((a, t) => a + E.trainValue(s, t), 0);
  openSheet(
    'ledger',
    `${sheetHead('ledger', 'The books')}<div class="sheet-body">
      <h3>Company value ${money(value)}</h3>
      <p>Cash ${money(s.cash)}, less the loan ${money(s.loan)}, plus trains worth ${money(trainsWorth)} and half of the ${money(s.infra)} spent on track and stations.</p>
      ${sparkline(s)}
      <h3>The bank</h3>
      <p>Loan ${money(s.loan)} of ${money(LOAN.max)}, at ${Math.round(LOAN.rate * 100)}% a year. Building borrows for you when cash runs short.</p>
      <div class="bank-row">
        <button class="btn" data-action="borrow" ${s.loan >= LOAN.max ? 'disabled' : ''}>Borrow ${money(LOAN.step)}</button>
        <button class="btn plain" data-action="repay" ${s.loan <= 0 || s.cash < LOAN.step ? 'disabled' : ''}>Repay ${money(LOAN.step)}</button>
        <button class="btn plain" data-action="repay-all" ${s.loan <= 0 || s.cash < s.loan ? 'disabled' : ''}>Repay it all</button>
      </div>
      <h3>This year and last</h3>
      <table class="table"><thead><tr><th></th><th class="num">${E.yearOf(s.day)}</th><th class="num">${l ? l.year : ''}</th></tr></thead><tbody>
        ${row('<b>Income</b>', y.income, l ? l.income : null)}
        ${cargoRows}
        ${row('Running trains', -y.running, l ? -l.running : null)}
        ${row('Track and station upkeep', -y.upkeep, l ? -l.upkeep : null)}
        ${row('Interest', -y.interest, l ? -l.interest : null)}
        ${row('Building', -y.build, l ? -l.build : null)}
        ${row('New and modernised trains', -y.trains, l ? -l.trains : null)}
      </tbody></table>
    </div>`,
  );
}

function helpHTML() {
  return `${sheetHead('help', 'How to play')}<div class="sheet-body">
    <h3>Lay a line</h3>
    <p>Choose <b>Build</b> and drag from one spot to another. A station appears at each end, gathering from everything within three tiles, and the track finds the cheapest way between them, using any track you already own for free. A train sets off at once.</p>
    <h3>What to carry</h3>
    <ul>
      <li><b>Coal</b> from collieries to power stations.</li>
      <li><b>Wood</b> from the woods to sawmills, and <b>grain</b> from farms to mills. Sawmills and mills turn it into <b>goods</b>, which towns want.</li>
      <li><b>Passengers</b> between towns, both ways.</li>
    </ul>
    <p>You're paid by the tile: the farther apart the two stations, the more each load pays. Passengers want to get there quickly; coal doesn't mind.</p>
    <h3>Grow</h3>
    <p>When cargo piles up on a platform, add trains from the service's card. Stations that are visited often collect a bigger share of what's made nearby. Well-served industries tend to grow, and towns grow when you carry their people and bring them goods.</p>
    <p>The Board of Trade offers <b>subsidies</b>: the first delivery on the route named wins double pay for two years. New, faster engines arrive in 1905, 1910 and 1915: modernise a service from its card.</p>
    <h3>The Board</h3>
    <p>Company value is your cash, less the loan, plus your trains and half what the track and stations cost. The Board meets in 1905, 1910 and 1915 and wants it to reach a mark each time. Miss it and you're out. In 1920 the charter ends and your value is your score.</p>
    <h3>Controls</h3>
    <ul>
      <li><b>Look</b> (L): drag to move the map, tap a station, train, industry or town for its card.</li>
      <li><b>Build</b> (B): drag a line, or tap one end and then the other.</li>
      <li><b>Clear</b> (D): tap or drag over track to lift it, or tap a station to close it.</li>
      <li>Wheel, pinch or + and − to zoom. Arrow keys, right-drag or two fingers to move. Space pauses; 1, 2 and 3 set the speed. S lists the services, Y opens the books, N shows every industry's name, M turns the music on or off.</li>
    </ul>
    <p><button class="btn" data-action="coach-replay">Show the first steps again</button></p>
  </div>`;
}
function openHelp() {
  openSheet('help', helpHTML());
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="coach-replay"]')) {
    closeSheets();
    saved.remove('coached');
    if (app.screen === 'play') coachStart(true);
  }
});

function openMenu() {
  if (!app.s) return;
  openSheet(
    'menu',
    `${sheetHead('menu', 'Menu')}<div class="sheet-body"><div class="title-actions">
      <button class="btn brass" data-action="resume">Back to the layout</button>
      <button class="btn" data-action="help">How to play</button>
      <button class="btn" data-action="mute">${sfx.muted ? 'Sound is off' : 'Sound is on'}</button>
      <button class="btn" data-action="music">${music.on ? 'Music is on' : 'Music is off'}</button>
      <button class="btn plain" data-action="to-title">Save and leave</button>
    </div><p class="hint">${app.s.daily ? 'Today’s shire' : 'Shire'} ${esc(app.s.seed.replace(/^(daily|shire)-/, ''))}. Your railway saves itself every month.</p></div>`,
  );
}

function confirmBox({ title, body, yes, danger = false, onYes }) {
  app.onConfirm = onYes;
  openSheet(
    'confirm',
    `${sheetHead('confirm', title)}<div class="sheet-body"><p>${esc(body)}</p><div class="bank-row"><button class="btn ${danger ? 'danger' : 'brass'}" data-action="confirm-yes">${esc(yes)}</button><button class="btn plain" data-action="confirm-no">Keep it</button></div></div>`,
  );
}

// ---- the Board meeting --------------------------------------------------------------------------

const sleep = (ms) =>
  new Promise((r) => {
    if (app.skip || app.skipAll || reducedMotion()) return r();
    const t0 = performance.now();
    const tick = () => (app.skip || app.skipAll || performance.now() - t0 >= ms ? r() : setTimeout(tick, 30));
    setTimeout(tick, Math.min(ms, 30));
  });

function gaugeSVG(target) {
  // A steam-pressure gauge from 0 to 1.5× the Board's mark; below the mark is the red zone.
  const cx = 150;
  const cy = 150;
  const r = 118;
  const a0 = -210;
  const a1 = 30;
  const ang = (f) => ((a0 + (a1 - a0) * f) * Math.PI) / 180;
  const pt = (f, rr) => [cx + Math.cos(ang(f)) * rr, cy + Math.sin(ang(f)) * rr];
  const arc = (f0, f1, rr) => {
    const [x0, y0] = pt(f0, rr);
    const [x1, y1] = pt(f1, rr);
    return `M${x0.toFixed(1)},${y0.toFixed(1)} A${rr},${rr} 0 ${(f1 - f0) * (a1 - a0) > 180 ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
  };
  const mark = 1 / 1.5;
  let ticks = '';
  for (let k = 0; k <= 15; k++) {
    const f = k / 15;
    const [x0, y0] = pt(f, r - 6);
    const [x1, y1] = pt(f, r - (k % 5 === 0 ? 22 : 14));
    ticks += `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="#2a2620" stroke-width="${k % 5 === 0 ? 2.4 : 1.2}"/>`;
  }
  const lab = (f, text) => {
    const [x, y] = pt(f, r - 38);
    return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-family="Cabin Condensed, Cabin, sans-serif" font-weight="600" font-size="14" fill="#2a2620">${text}</text>`;
  };
  return `<svg class="gauge" viewBox="0 0 300 300" aria-hidden="true">
    <circle cx="${cx}" cy="${cy}" r="${r + 18}" fill="url(#gauge-brass)"/>
    <defs><radialGradient id="gauge-brass" cx="40%" cy="35%"><stop offset="0" stop-color="#f3dc97"/><stop offset=".7" stop-color="#c8a14b"/><stop offset="1" stop-color="#7a5a1e"/></radialGradient></defs>
    <circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="#f6efdc" stroke="#7a5a1e" stroke-width="2"/>
    <path d="${arc(0, mark, r - 10)}" stroke="rgba(179,48,42,.75)" stroke-width="12" fill="none"/>
    <path d="${arc(mark, 1, r - 10)}" stroke="rgba(64,120,70,.75)" stroke-width="12" fill="none"/>
    ${ticks}
    ${lab(0, '£0')}${lab(mark, short(target))}${lab(1, short(target * 1.5))}
    <text x="${cx}" y="${cy + 46}" text-anchor="middle" font-family="Cabin, sans-serif" font-size="12" fill="#5a5245">company value</text>
    <g class="needle" id="needle" style="transform: rotate(0deg)">
      <line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(ang(0)) * (r - 18)}" y2="${cy + Math.sin(ang(0)) * (r - 18)}" stroke="#1d1d1d" stroke-width="3.2" stroke-linecap="round"/>
      <line x1="${cx}" y1="${cy}" x2="${cx - Math.cos(ang(0)) * 20}" y2="${cy - Math.sin(ang(0)) * 20}" stroke="#1d1d1d" stroke-width="5" stroke-linecap="round"/>
    </g>
    <circle cx="${cx}" cy="${cy}" r="8" fill="#2a2620"/><circle cx="${cx - 2}" cy="${cy - 2}" r="3" fill="#8a8170"/>
  </svg>`;
}

async function boardMeeting(b) {
  if (!b) return;
  app.screen = 'board';
  appEl.dataset.screen = 'board';
  cancelPlan();
  closeSheets();
  saveGame();
  const s = app.s;
  const el = $('#board-room');
  const years = `${b.year - 5} to ${b.year - 1}`;
  const prevBoard = s.boards[s.boards.length - 2];
  const fromYear = prevBoard ? prevBoard.year : START_YEAR;
  const lines = b.services
    .filter((v) => v.term !== 0)
    .sort((x, y) => y.term - x.term)
    .slice(0, 9);
  const rest = b.services.filter((v) => !lines.includes(v)).reduce((a, v) => a + v.term, 0);
  const total = b.services.reduce((a, v) => a + v.term, 0);
  const nameOf = (v) => `${E.stationById(s, v.a)?.name || 'Closed'} to ${E.stationById(s, v.b)?.name || 'closed'}`;
  const final = b.final;
  el.innerHTML = `<div class="ledger" role="dialog" aria-label="The Board meeting">
    <div class="page">
      <h2>${final ? 'The charter ends' : `Board meeting, ${b.year}`}</h2>
      <p class="sub">1 January ${b.year}. What each service earned, after running costs, ${fromYear} to ${b.year - 1}.</p>
      <ul class="entries" id="entries">
        ${lines.map((v) => `<li><span class="who"><i class="dot" style="--c:${v.colour}"></i><span>${esc(nameOf(v))}</span></span><b class="${v.term < 0 ? 'neg' : ''}">${money(v.term)}</b></li>`).join('')}
        ${rest ? `<li><span class="who"><span>Other services</span></span><b>${money(rest)}</b></li>` : ''}
        ${!b.services.length ? '<li><span class="who"><span>No services ran.</span></span><b></b></li>' : ''}
        <li class="total"><span class="who"><span>Services' profit</span></span><b>${money(total)}</b></li>
      </ul>
    </div>
    <div class="page">
      ${
        final
          ? `<h2>Company value</h2><p class="sub">Cash, less the loan, plus trains and half the track.</p><div class="big-sum" id="final-sum">£0</div><p class="verdict" id="verdict"></p>`
          : `<h2>The Board's mark</h2><p class="sub">${short(b.target)} of company value by 1 January ${b.year}.</p>${gaugeSVG(b.target)}<p class="verdict" id="verdict"></p>`
      }
      <div class="stamp-wrap"><div class="stamp ${b.pass ? 'pass' : ''}" id="stamp">${final ? 'Charter complete' : b.pass ? 'Charter renewed' : 'Dismissed'}</div></div>
      <div class="ledger-actions" id="board-actions"></div>
      <span class="skip-hint">${matchMedia('(hover: none)').matches ? 'Tap to hurry' : 'Click or Enter to hurry'}</span>
    </div>
  </div>`;
  el.hidden = false;
  app.busy = true;
  app.skip = false;
  const hurry = () => {
    if (app.busy) app.skip = true;
  };
  el.addEventListener('pointerdown', hurry);
  await sleep(500);
  const items = [...el.querySelectorAll('#entries li')];
  for (let i = 0; i < items.length; i++) {
    items[i].classList.add('in');
    if (!app.skip) {
      if (items[i].classList.contains('total')) audio.coin(total);
      else audio.pen();
      if (i % 2 === 0) audio.tick(i);
    }
    await sleep(items.length > 6 ? 220 : 340);
  }
  await sleep(350);
  if (final) {
    const sum = $('#final-sum');
    const t0 = performance.now();
    if (!app.skip) audio.needle();
    await new Promise((r) => {
      const step = () => {
        const f = app.skip || app.skipAll ? 1 : Math.min(1, (performance.now() - t0) / 1400);
        sum.textContent = money(b.value * (1 - (1 - f) ** 3));
        if (f >= 1) r();
        else requestAnimationFrame(step);
      };
      step();
    });
    const stats = saved.get('stats', null);
    $('#verdict').innerHTML = `Your title: <b>${esc(rankFor(b.value))}</b>.${stats?.best && b.value >= stats.best ? ' A new best.' : ''}`;
  } else {
    const f = Math.max(0, Math.min(1.02, b.value / (b.target * 1.5)));
    const needle = $('#needle');
    if (!app.skip) audio.needle();
    requestAnimationFrame(() => (needle.style.transform = `rotate(${(240 * f).toFixed(1)}deg)`));
    if (app.skip || app.skipAll) needle.style.transition = 'none';
    await sleep(1700);
    $('#verdict').innerHTML = `Worth <b>${money(b.value)}</b> against a mark of ${money(b.target)}. ${b.pass ? 'The Board is satisfied.' : 'The Board has lost confidence in you.'}`;
  }
  await sleep(300);
  const stamp = $('#stamp');
  stamp.classList.add('down');
  audio.stamp(b.pass);
  shake($('#board-room .ledger'), 2);
  await sleep(450);
  app.busy = false;
  app.skip = false;
  el.removeEventListener('pointerdown', hurry);
  const next = BOARD.find((x) => x.year > b.year);
  $('#board-actions').innerHTML = s.over
    ? `<button class="btn brass" data-action="board-end" data-default>See the company map <kbd>Enter</kbd></button>`
    : `<button class="btn brass" data-action="board-close" data-default>Back to work <kbd>Enter</kbd></button>${next ? '' : ''}`;
  if (!s.over && next) $('#verdict').insertAdjacentHTML('beforeend', ` Next: ${short(next.target)} by ${next.year}.`);
  if (!s.over && !next) $('#verdict').insertAdjacentHTML('beforeend', ` Next: the final count in ${END_YEAR}.`);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action="board-close"], [data-action="board-end"]');
  if (!b) return;
  $('#board-room').hidden = true;
  if (b.dataset.action === 'board-end') {
    showEnd();
    return;
  }
  E.resume(app.s);
  app.screen = 'play';
  appEl.dataset.screen = 'play';
  flushSlips();
  saveGame();
});

// ---- the end ---------------------------------------------------------------------------------------

function finishRun() {
  const s = app.s;
  if (s.recorded) return;
  s.recorded = true;
  const value = s.over?.value ?? E.companyValue(s);
  const label = `${short(value)}, ${rankFor(value)}`;
  if (s.over?.reason === 'final') recordBest(SLUG, value, label);
  else recordBest(SLUG, value, `${short(value)} (${s.over?.reason === 'board' ? `out in ${E.yearOf(s.over.day)}` : 'bankrupt'})`);
  if (s.daily) {
    const k = `daily:${s.seed}`;
    const prev = saved.get(k, null);
    if (prev === null || value > prev) saved.set(k, value);
  }
  saveGame();
}

function showEnd() {
  const s = app.s;
  finishRun();
  app.screen = 'end';
  appEl.dataset.screen = 'end';
  const o = s.over;
  const value = o?.value ?? E.companyValue(s);
  const title = o.reason === 'final' ? 'The charter is complete' : o.reason === 'board' ? 'The Board has replaced you' : 'The receivers are in';
  const why = o.reason === 'final' ? `Twenty years of the Penny a Mile Railway, ${START_YEAR} to ${END_YEAR}.` : o.reason === 'board' ? `On 1 January ${E.yearOf(o.day)} the company was worth ${money(o.value)}; the Board wanted ${money(o.target)}.` : `The money ran out in ${E.dateLabel(o.day)} with the loan at its limit.`;
  let pieces = 0;
  for (let i = 0; i < W * H; i++) if (s.track[i]) pieces++;
  const carried = Object.keys(CARGO)
    .filter((c) => s.carried[c] > 0)
    .map((c) => chip(c, units(c, s.carried[c])))
    .join('');
  const best = saved.get('stats', null)?.best;
  const daily = s.daily ? saved.get(`daily:${s.seed}`, null) : null;
  $('#end').innerHTML = `<div class="ledger" role="dialog" aria-label="${esc(title)}">
    <div class="page">
      <h2>${esc(title)}</h2>
      <p class="sub">${esc(why)}</p>
      <div class="big-sum">${money(value)}</div>
      <p><b>${esc(rankFor(value))}</b>${best ? `. Your best: ${short(best)}` : ''}${daily !== null ? `. Today's best: ${short(daily)}` : ''}.</p>
      <ul class="entries">
        <li class="in"><span class="who"><span>Services</span></span><b>${s.services.length}</b></li>
        <li class="in"><span class="who"><span>Trains</span></span><b>${s.trains.length}</b></li>
        <li class="in"><span class="who"><span>Tiles of track</span></span><b>${pieces}</b></li>
        <li class="in"><span class="who"><span>Stations</span></span><b>${s.stations.length}</b></li>
        <li class="in"><span class="who"><span>People in the shire</span></span><b>${s.towns.reduce((a, t) => a + t.pop, 0).toLocaleString('en-GB')}</b></li>
      </ul>
      <div class="chips">${carried}</div>
      <div class="ledger-actions">
        ${o.reason === 'final' ? '<button class="btn brass" data-action="free-play">Keep running the line</button>' : ''}
        <button class="btn ${o.reason === 'final' ? '' : 'brass'}" data-action="new" data-default>New shire</button>
        <button class="btn" data-action="daily">Today's shire</button>
        <button class="btn plain" data-action="to-title">Title</button>
      </div>
    </div>
    <div class="page">
      <canvas class="map-poster" id="poster" width="720" height="720" aria-label="The company's map"></canvas>
      <div class="ledger-actions"><button class="btn plain" data-action="save-map">Save the map</button></div>
    </div>
  </div>`;
  $('#end').hidden = false;
  drawCompanyMap($('#poster'), s, { title: 'The Penny a Mile Railway', subtitle: `System map, ${E.dateLabel(s.day)}`, value: money(value), rank: rankFor(value) });
  saved.remove('game');
}

function saveMap() {
  const c = $('#poster');
  if (!c) return;
  const a = document.createElement('a');
  a.download = `penny-a-mile-${app.s.seed}.png`;
  a.href = c.toDataURL('image/png');
  a.click();
}

// ---- the coach (first steps) ------------------------------------------------------------------

function coachStart(force = false) {
  if (!force && saved.get('coached', false)) return;
  app.coach = { step: 0 };
  coachShow();
}

function coachShow() {
  const el = $('#coach');
  const c = app.coach;
  const s = app.s;
  if (!c || !s) {
    el.hidden = true;
    return;
  }
  const sb = s.subsidies.find((x) => !x.awarded && x.c === 'coal') || s.subsidies.find((x) => !x.awarded);
  let html = '';
  if (c.step === 0) {
    const what = sb ? `The Board of Trade will pay double for the first ${CARGO[sb.c].short} carried from <b>${esc(E.endName(s, sb.src))}</b> to <b>${esc(E.endName(s, sb.dst))}</b>.` : 'Coal pays steadily from a colliery to a power station.';
    html = `${what} Choose <b>Build</b>, then drag from beside the first to beside the second.`;
    document.querySelector('.tool[data-tool="build"]').classList.add('attention');
    if (sb) {
      const a = E.endPos(s, sb.src);
      const b = E.endPos(s, sb.dst);
      app.marks = { list: [a, b], until: app.time + 9999 };
    }
  } else if (c.step === 1) {
    html = 'Drag from a spot <b>next to</b> one, to a spot next to the other. The dashed square shows what a station there would reach.';
  } else if (c.step === 2) {
    html = 'There goes your first train. Coal piles up on the platform faster than one engine can shift it: press <b>Add a train</b> on the service card.';
  } else if (c.step === 3) {
    html = 'Now find more work. Towns swap <b>passengers</b> both ways; <b>wood</b> and <b>grain</b> go to sawmills and mills, which make <b>goods</b> for towns. Watch the Board’s mark at the top.';
  }
  el.innerHTML = `${html}<div class="coach-row">${c.step >= 3 ? '<button class="btn brass" data-action="coach-skip">Got it</button>' : '<button class="btn plain" data-action="coach-skip">Skip the tips</button>'}</div>`;
  el.hidden = false;
}

function coachEvent(what) {
  const c = app.coach;
  if (!c) return;
  if (what === 'tool-build') document.querySelector('.tool[data-tool="build"]').classList.remove('attention');
  if (what === 'tool-build' && c.step === 0) c.step = 1;
  else if (what === 'built' && c.step <= 1) {
    c.step = 2;
    app.marks = null;
    document.querySelector('.tool[data-tool="build"]').classList.remove('attention');
  } else if (what === 'train' && c.step === 2) c.step = 3;
  else return;
  coachShow();
}
function coachTick() {
  const c = app.coach;
  if (c?.step === 2 && app.s.trains.length >= 2) {
    c.step = 3;
    coachShow();
  }
}
function coachNext() {
  if (!app.coach) return;
  app.coach.step++;
  coachShow();
}
function coachDone() {
  app.coach = null;
  app.marks = null;
  document.querySelector('.tool[data-tool="build"]').classList.remove('attention');
  saved.set('coached', true);
  $('#coach').hidden = true;
}

// ---- screens -------------------------------------------------------------------------------------

function startDemo() {
  const seed = `demo-${Math.floor(Math.random() * 1e6)}`;
  const s = E.newGame(seed);
  const bot = createBot({ skill: 0.8, seed: 7, plansPerThink: 5 });
  // A year already under way, so the title opens on a working railway.
  for (let m = 0; m < 14; m++) {
    bot.think(s);
    E.step(s, MONTH);
    if (s.hold) E.resume(s);
  }
  app.demo = s;
  app.demoBot = bot;
  frameDemo();
}

/** Frames the demo railway in the space the title card leaves free: to its right, or above it on phones. */
function frameDemo() {
  const s = app.demo;
  R.resize();
  const { w, h } = R.size;
  const pts = s.stations.length ? s.stations : [{ x: W / 2, y: H / 2 }];
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  R.cam.z = w < 760 ? 0.5 : 0.75;
  R.centreOn(cx, cy);
  if (w >= 1000) R.cam.x -= Math.min(300, w * 0.24) / R.cam.z;
  else if (w < 760) R.cam.y += Math.min(220, h * 0.26) / R.cam.z;
  R.clampCam();
}

function loadSave() {
  const g = saved.get('game', null);
  if (!g || g.sv !== SAVE_V || !g.s || g.s.v !== E.VERSION || g.s.over) return null;
  return g;
}

function toTitle() {
  app.screen = 'title';
  appEl.dataset.screen = 'title';
  $('#end').hidden = true;
  $('#board-room').hidden = true;
  $('#coach').hidden = true;
  app.s = null;
  R.reset();
  if (!app.demo) startDemo();
  const g = loadSave();
  const today = dailySeed();
  const dailyBest = saved.get(`daily:daily-${today}`, null);
  $('#title-actions').innerHTML = `
    ${g ? `<button class="btn brass" data-action="continue">Carry on<small>${esc(E.dateLabel(g.s.day))}, worth ${short(E.companyValue(g.s))}</small></button>` : ''}
    <button class="btn ${g ? '' : 'brass'}" data-action="daily">Today's shire<small>The same map for everyone today${dailyBest !== null ? `. Your best: ${short(dailyBest)}` : ''}</small></button>
    <button class="btn" data-action="new">A new shire<small>A fresh map</small></button>
    <button class="btn plain" data-action="help">How to play</button>`;
  const st = saved.get('stats', null);
  $('#title-best').textContent = st?.best ? `Your best: ${st.bestLabel}` : '';
}

function enterPlay() {
  app.screen = 'play';
  appEl.dataset.screen = 'play';
  app.selected = null;
  cancelPlan();
  app.paused = false;
  app.speed = 1;
  app.lastSeq = app.s.seq;
  subsKey = '';
  cardKey = '';
  $('#news').innerHTML = '';
  app.pendingSlips = [];
  $('#end').hidden = true;
  $('#board-room').hidden = true;
  setTool('look');
  renderSubsidies();
  R.reset();
  hud();
  measureBar();
  R.resize();
}

function startGame(seed, daily) {
  closeSheets();
  app.s = E.newGame(seed, { daily });
  recordPlay(SLUG);
  enterPlay();
  // Frame the subsidy's two ends.
  const sb = app.s.subsidies[0];
  if (sb) {
    const a = E.endPos(app.s, sb.src);
    const b = E.endPos(app.s, sb.dst);
    framePoints([a, b]);
  } else {
    R.cam.z = 0.75;
    R.centreOn(W / 2, H / 2);
  }
  app.firstPay = false;
  coachStart();
  saveGame();
}

function framePoints(pts) {
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const { w, h } = R.size;
  // The biggest zoom at which every point sits inside the free middle of the screen.
  for (const z of [1, 0.75, 0.5]) {
    R.cam.z = z;
    R.centreOn(cx, cy);
    const ok = pts.every((p) => {
      const q = R.toScreen(p.x, p.y);
      return q.x > 60 && q.x < w - 60 && q.y > 140 && q.y < h - 150;
    });
    if (ok) break;
  }
  R.centreOn(cx, cy);
}

function continueGame() {
  const g = loadSave();
  if (!g) return toTitle();
  closeSheets();
  app.s = g.s;
  enterPlay();
  R.cam.z = g.cam?.z || 0.75;
  R.cam.x = g.cam?.x ?? 0;
  R.cam.y = g.cam?.y ?? H * 16;
  R.clampCam();
  recordPlay(SLUG);
  if (app.s.hold === 'board') {
    // Saved mid-meeting: hold it again.
    boardMeeting(app.s.boards[app.s.boards.length - 1]);
  }
}

function saveGame() {
  const s = app.s;
  if (!s) return;
  if (s.over && !s.freePlay) return;
  saved.set('game', { sv: SAVE_V, s, cam: { x: R.cam.x, y: R.cam.y, z: R.cam.z } });
}

onHidden(() => {
  if (app.screen === 'play' && !app.paused) {
    app.paused = true;
    app.autoPaused = true;
  }
  saveGame();
  loop.resync();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && app.autoPaused) {
    // Stay paused until the player chooses; the pause button shows it.
  }
});
function measureBar() {
  const bar = $('#bar');
  if (bar.offsetHeight) appEl.style.setProperty('--bar-h', `${bar.offsetTop + bar.offsetHeight}px`);
}
window.addEventListener('resize', () => {
  measureBar();
  R.resize();
  if (app.screen === 'title' && app.demo) frameDemo();
});

// ---- boot ------------------------------------------------------------------------------------------

homeLink({ parent: $('#bar-home') });
toTitle();
if (document.fonts?.ready) document.fonts.ready.then(() => R.invalidate());

// ---- debug hooks (window.__game) ----------------------------------------------------------------

markReady({
  get state() {
    return app.s || app.demo;
  },
  app,
  E,
  loop,
  renderer: R,
  advance(seconds) {
    loop.advance(seconds);
  },
  /** Runs the railway for `days` the way the clock does (events handled as they come). */
  run(days) {
    const s = app.s;
    let left = days;
    while (left > 0 && !s.hold && !(s.over && !s.freePlay)) {
      const d = Math.min(left, 5);
      E.step(s, d);
      left -= d;
      handleEvents();
    }
  },
  newGame(seed = 'test', daily = false) {
    startGame(seed, daily);
  },
  /** Builds a route between two tiles through the same path the pointer uses. */
  route(ax, ay, bx, by) {
    setTool('build');
    app.planStart = { x: ax, y: ay };
    app.planMode = 'confirm';
    planTo(bx, by);
    const ok = tryBuild();
    refreshCards(true);
    return ok;
  },
  /** Good spots for a first route: the opening subsidy's two ends. */
  subsidySpots() {
    const s = app.s;
    const sb = s.subsidies[0];
    return firstRouteSpots(s, sb);
  },
  botMonths(n, skill = 0.8) {
    const bot = createBot({ skill, seed: 3 });
    const s = app.s;
    for (let m = 0; m < n; m++) {
      if (s.hold) break;
      bot.think(s);
      this.run(MONTH);
    }
  },
  /** Where a tile's centre is on screen (CSS px, page coordinates), for tests that tap the map. */
  tilePoint(x, y) {
    const r = canvas.getBoundingClientRect();
    const p = R.toScreen(x + 0.5, y + 0.5);
    return { x: r.left + p.x, y: r.top + p.y };
  },
  select,
  setTool,
  setSpeed,
  togglePause,
  openLedger,
  openServices,
  openHelp,
  openMenu,
  closeSheets,
  coachDone,
  /** Skip the Board meeting's pacing (tests): every wait resolves at once. */
  skipAnimations(on = true) {
    app.skipAll = on;
  },
  /** Jumps to the eve of the next Board meeting with a given company value. */
  toBoard(value) {
    const s = app.s;
    const b = E.nextBoard(s);
    const day = (b.year - START_YEAR) * YEAR - 1;
    s.day = Math.max(s.day, day);
    s.cash += value - E.companyValue(s);
  },
  prepareThumbnail() {
    if (app.screen !== 'play') startGame('thumb-shire', false);
    coachDone();
    const s = app.s;
    this.botMonths(40, 0.9);
    if (s.hold) {
      E.resume(s);
      $('#board-room').hidden = true;
      app.screen = 'play';
      appEl.dataset.screen = 'play';
    }
    E.step(s, 3);
    $('#news').innerHTML = '';
    app.selected = null;
    // Frame the busiest station.
    const st = s.stations.slice().sort((a, b) => servicesAt(s, b).length - servicesAt(s, a).length)[0];
    if (st) {
      R.cam.z = 1;
      R.centreOn(st.x + 0.5, st.y + 0.5);
    }
    R.invalidate();
    loop.advance(0.5);
  },
});

function firstRouteSpots(s, sb) {
  if (!sb) return null;
  const P = sb.src.ind !== undefined ? s.industries[sb.src.ind] : null;
  const Q = sb.dst.ind !== undefined ? s.industries[sb.dst.ind] : null;
  if (!P || !Q) return null;
  const near = (o, to) => {
    let best = null;
    for (let dy = -2; dy < o.h + 2; dy++)
      for (let dx = -2; dx < o.w + 2; dx++) {
        const x = o.x + dx;
        const y = o.y + dy;
        if (!E.canHostStation(s, x, y)) continue;
        const d = Math.abs(x - to.x) + Math.abs(y - to.y);
        if (!best || d < best.d) best = { x, y, d };
      }
    return best;
  };
  const a = near(P, Q);
  const b = near(Q, P);
  return a && b ? { ax: a.x, ay: a.y, bx: b.x, by: b.y } : null;
}
