// Sushi Raft: the page. Screens (title, lobby, morning market, service, closing time, the week),
// input, the loop, sounds and juice from engine events, and online co-op through net-play.js.
// The rules are in engine.js, drawing in render.js and art.js.
import { homeLink, markReady, onHidden, recordBest, recordPlay, reducedMotion, store } from '../../../shared/arcade.js';
import { toast } from '../../../shared/juice.js';
import { createLoop, fixedSteps } from '../../../shared/loop.js';
import { dailySeed } from '../../../shared/rng.js';
import { cleanCode, joinRoom, roomCode } from '../../../shared/net.js';
import * as E from './engine.js';
import { createBot } from './bot.js';
import { createRenderer, T } from './render.js';
import { createAudio } from './audio.js';
import { guestSession, hostSession, roomToken, SNAP_HZ } from './net-play.js';
import { drawCustomer, drawDish, drawIngredient, drawOtter } from './art.js';
import { CANAL, DISHES, ING_NAMES, NIGHTS, OTTERS, SPECIES, SPECIES_ORDER, TIMES, TWISTS, UPGRADES, rimOf } from './data.js';
import { drawUpgradeIcon } from './icons.js';

const SLUG = 'sushi-raft';
const SAVE_V = 1;
const params = new URLSearchParams(location.search);
const NET = params.get('net') === 'local' ? 'local' : 'p2p';
const saved = store(SLUG);
const audio = createAudio(SLUG);
const $ = (s, root = document) => root.querySelector(s);
const app = $('#app');
const stage = $('#stage');
const panel = $('#panel');
const R = createRenderer(stage);

const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
const profile = Object.assign(
  { v: SAVE_V, token: null, weeks: 0, wins: 0, best: 0, summer: 1, hearts: {}, seen: {}, coached: false, dailies: {}, plates: 0, helper: true },
  saved.get('profile', {}),
);
// ?net=local tabs share one localStorage: each takes its token from the URL instead (tests only).
if (NET === 'local' && params.get('token')) profile.token = params.get('token');
if (!profile.token) profile.token = newToken();
const saveProfile = () => {
  const out = { ...profile };
  if (NET === 'local' && params.get('token')) delete out.token;
  saved.set('profile', out);
};
saveProfile();

// ── the game object ──────────────────────────────────────────────────────────

const game = {
  mode: 'title', // title | solo | host | guest
  sub: 'main', // title panel: main | together
  st: null,
  me: 0, // my otter (solo: both)
  paused: false,
  pauseBy: null,
  ready: [false, false],
  lastEv: 0,
  t: 0,
  demo: null,
  demoBot: null,
  net: null,
  coach: null,
  tally: null, // the closing-time count-up in progress
  skip: false, // tests: no waiting on animations
  holdAt: 0,
  screen: '',
  hints: {},
  shake: 0,
  bot: null, // a bot playing an otter (solo's computer Kelp, the thumbnail, tests)
  helper: false, // solo with a computer Kelp (the bot plays otter 1)
};
const steps = fixedSteps(1 / 60);
const isSolo = () => game.mode === 'solo';
/** Solo where the player runs both otters (no computer Kelp). */
const soloBoth = () => game.mode === 'solo' && !game.helper;
/** Does this player give orders to otter `o`? */
const controls = (o) => (soloBoth() ? true : o === game.me);
const makeHelper = () => (game.bot = createBot({ otters: [1], skill: 0.62, seed: Math.floor(Math.random() * 1e6), fumbles: false }));
/** The computer Kelp lets a first-time player make the coached dish alone, then joins in. */
const helperWaits = () => game.helper && game.coach && game.coach.step < 6;
const isGuest = () => game.mode === 'guest';
const runsEngine = () => game.mode === 'solo' || game.mode === 'host';

// ── the demo behind the title ────────────────────────────────────────────────

function newDemo() {
  const st = E.newWeek({ seed: `demo-${Math.floor(Math.random() * 1e6)}` });
  st.menu.push('tuna_nigiri', 'kappa_maki', 'ebi');
  st.up.board2 = true;
  st.night = 2;
  E.openNight(st);
  st.svc.t = 30;
  game.demo = st;
  game.demoBot = createBot({ otters: [0, 1], skill: 0.85, seed: 7, fumbles: false });
}

// ── screens ──────────────────────────────────────────────────────────────────

function screen() {
  if (game.mode === 'title') return 'title';
  if (!game.st) return 'lobby';
  return game.st.phase; // morning | service | closed | over
}

function setScreen() {
  const s = screen();
  if (s !== game.screen) {
    game.screen = s;
    app.dataset.screen = s;
    renderPanel();
    if (s !== 'service') {
      bannerEl.classList.remove('show');
      // Tips and the coach belong to the night.
      showTip.until = 0;
      $('#coach').hidden = true;
    }
    if (s === 'closed') beginTally();
    if (s === 'service') audio.music(true, 'calm');
    else if (s === 'closed' || s === 'over') audio.music(true, 'night');
    else if (s === 'title') audio.music(false);
  }
  renderHud();
}

const nightName = (st, n = st.night) => NIGHTS[n].name;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const coinHTML = (n) => `<span class="coin" aria-hidden="true"></span><b>${n}</b>`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

let lastPanelKey = '';
function renderPanel() {
  const s = screen();
  let html = '';
  if (s === 'title') html = game.sub === 'together' ? togetherHTML() : game.sub === 'solo' ? soloHTML() : titleHTML();
  else if (s === 'lobby') html = lobbyHTML();
  else if (s === 'morning') html = morningHTML();
  else if (s === 'closed') html = tallyHTML();
  else if (s === 'over') html = overHTML();
  panel.innerHTML = html;
  // Entrance animations play when the screen changes, not on every re-render (a purchase, a ready).
  const key = `${s}|${game.sub}|${game.st?.night}`;
  if (key === lastPanelKey) panel.querySelectorAll('.enter').forEach((el) => el.classList.remove('enter'));
  else panel.scrollTop = 0;
  lastPanelKey = key;
  paintIcons(panel);
  if (s === 'lobby' && game.net?.qr) $('.qr', panel)?.insertAdjacentHTML('afterbegin', game.net.qr);
  if (s === 'over') {
    // The whole week's plates, stacked by rim colour.
    const cols = towerColumns(game.st.history.flatMap((h) => h.plates));
    $('.tower.week', panel).innerHTML = cols
      .map((c) => `<div class="col" style="--rim:${rimOf(c.plates[0].dish)}"><div class="stack">${'<i></i>'.repeat(Math.min(c.plates.length, 24))}</div><span>${c.plates.length}</span></div>`)
      .join('');
  }
}

function savedWeek() {
  const w = saved.get('week');
  return w && w.v === SAVE_V && w.st?.phase === 'morning' ? w : null;
}

function titleHTML() {
  const w = savedWeek();
  const daily = profile.dailies[dailySeed()];
  return `
    <div class="title-card enter">
      <h1 class="logo"><span>Sushi</span><span>Raft</span></h1>
      <p class="lede">Two sea otters, one sushi canal. Cook together: each phone runs one otter, and rent is due every night.</p>
      <div class="menu">
        ${w ? `<button class="btn primary" data-action="continue">Continue <small>${esc(nightName(w.st))} morning</small></button>` : ''}
        <button class="btn ${w ? '' : 'primary'}" data-action="together">Play together <small>two phones</small></button>
        <button class="btn" data-action="solo">Play solo <small>with a computer Kelp, or both</small></button>
        <button class="btn" data-action="daily">Today’s tide <small>${daily ? `best ${daily} coins` : 'the same week for everyone today'}</small></button>
        <div class="row">
          <button class="btn small" data-action="album">Regulars book</button>
          <button class="btn small" data-action="help">How to play</button>
        </div>
      </div>
      ${profile.best ? `<p class="best">Best week: ${coinHTML(profile.best)}${profile.summer > 1 ? ` <span class="summer">Summer ${profile.summer} unlocked</span>` : ''}</p>` : ''}
    </div>`;
}

function soloHTML() {
  return `
    <div class="title-card enter">
      <h2>Play solo</h2>
      <p class="lede">You’re Pebble. Kelp can be run by the computer, or you can run both otters and switch between them.</p>
      <div class="menu">
        <button class="btn primary" data-action="soloHelper">With a computer Kelp <small>a partner who helps</small></button>
        <button class="btn" data-action="soloBoth">Run both otters <small>tap an otter to switch</small></button>
        <button class="btn small" data-action="back">Back</button>
      </div>
    </div>`;
}

function togetherHTML() {
  return `
    <div class="title-card enter">
      <h2>Play together</h2>
      <p class="lede">One of you opens the pier and gets Pebble. The other joins with the code and gets Kelp. Same room is best: you’ll want to shout.</p>
      <div class="menu">
        <button class="btn primary" data-action="host">Open the pier <small>you’ll be Pebble</small></button>
        <form class="join" data-action="join">
          <label for="code-in">Partner’s code</label>
          <div class="join-row">
            <input id="code-in" name="code" inputmode="text" autocomplete="off" autocapitalize="characters" maxlength="8" placeholder="ABC123" />
            <button class="btn" type="submit">Join <small>as Kelp</small></button>
          </div>
        </form>
        <button class="btn small" data-action="back">Back</button>
      </div>
      <p class="fine">Phones find each other through public relays, then talk directly. If it won’t connect (some hotel and office networks block it), try mobile data, or play solo on one phone.</p>
    </div>`;
}

function lobbyHTML() {
  const n = game.net;
  if (game.mode === 'host') {
    const here = n.status === 'here';
    return `
      <div class="title-card lobby enter">
        <h2>Your pier is open</h2>
        <p class="lede">Your partner scans this, or opens the link, or types the code under Play together.</p>
        <div class="qr" role="img" aria-label="QR code for the invite link"></div>
        <div class="code" aria-label="Room code">${esc(n.code)}</div>
        <div class="row">
          <button class="btn small" data-action="copy">Copy link</button>
          ${navigator.share ? '<button class="btn small" data-action="share">Share</button>' : ''}
        </div>
        <p class="status ${here ? 'ok' : ''}" role="status">${here ? 'Kelp is on the pier!' : n.status === 'error' ? esc(n.error) : 'Waiting for Kelp…'}</p>
        <div class="menu">
          <button class="btn primary" data-action="startWeek" ${here ? '' : 'disabled'}>Start the week</button>
          <button class="btn small" data-action="leave">Leave</button>
        </div>
      </div>`;
  }
  const slow = n.status === 'looking' && performance.now() - n.since > 20000;
  return `
    <div class="title-card lobby enter">
      <h2>Joining ${esc(n.code)}</h2>
      <p class="status ${n.status === 'welcome' ? 'ok' : ''}" role="status">${
        n.status === 'welcome'
          ? 'You’re Kelp! Waiting for Pebble to start the week.'
          : n.status === 'nope'
            ? 'That pier already has two otters.'
            : n.status === 'hostLeft'
              ? 'Pebble has left the pier.'
              : n.status === 'error'
                ? esc(n.error)
                : 'Looking for the pier…'
      }</p>
      ${slow ? '<p class="fine">Can’t connect? Both phones need to be online, and some networks block direct connections: try mobile data on one phone, or check the code.</p>' : ''}
      <div class="menu"><button class="btn small" data-action="leave">Leave</button></div>
    </div>`;
}

function readyLine(label) {
  const st = game.st;
  const mine = game.ready[game.me];
  if (isSolo()) return `<button class="btn primary" data-action="ready">${label} <kbd>Enter</kbd></button>`;
  const other = game.ready[1 - game.me];
  const partner = OTTERS[1 - game.me].name;
  return `
    <button class="btn primary ${mine ? 'waiting' : ''}" data-action="ready" ${mine ? 'aria-pressed="true"' : ''}>${mine ? `Waiting for ${partner}…` : label} <kbd>Enter</kbd></button>
    <p class="partner ${other ? 'ok' : ''}">${other ? `${partner} is ready` : `${partner} is still looking`}</p>`;
}

function morningHTML() {
  const st = game.st;
  const tw = E.twistInfo(st);
  const first = st.night === 0;
  const offers = st.offers
    .map((o, i) => {
      const cost = E.offerCost(o);
      const can = !o.bought && st.purse >= cost;
      const name = o.kind === 'dish' ? DISHES[o.id].name : UPGRADES[o.id].name;
      const text = o.kind === 'dish' ? `New dish: ${DISHES[o.id].price} coins a plate. ${dishRecipe(o.id)}.` : UPGRADES[o.id].text;
      const icon = o.kind === 'dish' ? `<canvas class="ico" data-dish="${o.id}" width="56" height="56"></canvas>` : `<canvas class="ico" data-up="${o.id}" width="56" height="56"></canvas>`;
      return `<li class="offer ${o.bought ? 'bought' : ''} ${can || o.bought ? '' : 'cant'}">
        ${icon}
        <div class="offer-text"><b>${esc(name)}</b><span>${esc(text)}</span></div>
        <button class="btn buy" data-action="buy" data-i="${i}" ${can ? '' : 'disabled'} aria-label="Buy ${esc(name)} for ${cost} coins">${o.bought ? 'Bought' : `${coinHTML(cost)}`}</button>
      </li>`;
    })
    .join('');
  const menu = st.menu.map((d) => `<li title="${esc(DISHES[d].name)}"><canvas class="ico small" data-dish="${d}" width="40" height="40"></canvas><span>${DISHES[d].price}</span></li>`).join('');
  return `
    <div class="sheet morning enter">
      <p class="eyebrow-day">${first ? `Summer ${st.summer}${st.daily ? ', today’s tide' : ''}` : `Night ${st.night + 1} of ${NIGHTS.length}`}</p>
      <h2>${esc(nightName(st))}${first ? ' at the pier' : ' morning'}</h2>
      <div class="facts">
        <div class="fact"><span>Purse</span>${coinHTML(st.purse)}</div>
        <div class="fact rent"><span>Rent tonight</span>${coinHTML(E.rentFor(st))}</div>
      </div>
      ${first ? `<p class="lede">Customers sit across the canal and want what’s in their bubbles. Make it, send it out on a raft, and they’ll grab it as it passes. Takings go in the purse; rent comes out after closing.</p>` : ''}
      ${tw ? `<div class="twist ${tw.id}"><b>Tonight: ${esc(tw.name)}</b><span>${esc(tw.text)}</span></div>` : ''}
      ${offers ? `<h3>The morning market</h3><ul class="offers">${offers}</ul><p class="fine">Spend now or keep it for rent. A purse that can’t pay closes the pier.</p>` : ''}
      <h3>On the menu</h3>
      <ul class="menu-list">${menu}</ul>
      <div class="go">${readyLine('Open for the evening')}</div>
    </div>`;
}

function dishRecipe(id) {
  const parts = DISHES[id].parts.map((p) => ING_NAMES[p]);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
}

function tallyHTML() {
  const st = game.st;
  const h = st.history[st.history.length - 1];
  const last = !!st.result;
  return `
    <div class="sheet tally enter">
      <p class="eyebrow-day">${esc(nightName(st, h.night))}</p>
      <h2>Closing time</h2>
      <div class="tower" aria-hidden="true"></div>
      <dl class="sums">
        <div><dt>Plates</dt><dd data-k="plates">0</dd></div>
        <div><dt>Tips</dt><dd data-k="tips">0</dd></div>
        <div class="big"><dt>Takings</dt><dd data-k="takings">0</dd></div>
        <div><dt>Rent</dt><dd data-k="rent">${h.rent}</dd></div>
        <div class="big"><dt>Purse</dt><dd data-k="purse">${st.purse}</dd></div>
      </dl>
      <p class="tally-notes">${tallyNotes(h)}</p>
      <div class="stamp ${h.paid ? 'paid' : 'closed'}" aria-hidden="true"><span>${h.paid ? 'Rent paid' : 'Pier closed'}</span></div>
      <p class="sr-only" role="status">${h.paid ? `Rent paid. ${st.purse} coins left in the purse.` : 'The purse could not cover the rent.'}</p>
      <div class="go">${readyLine(last ? 'See the week' : `${nightName(st, h.night + 1 < NIGHTS.length ? h.night + 1 : h.night)} morning`)}</div>
    </div>`;
}

function tallyNotes(h) {
  const bits = [`${plural(h.served, 'customer')} fed`];
  if (h.huffs) bits.push(`${h.huffs} left in a huff`);
  if (h.away) bits.push(`${h.away} couldn’t get a seat`);
  if (h.hearts.length) bits.push(`${plural(h.hearts.length, 'favourite')} served`);
  return bits.join(', ') + '.';
}

function overHTML() {
  const st = game.st;
  const won = st.result === 'won';
  const plates = st.history.reduce((n, h) => n + h.plates.length, 0);
  const hearts = st.history.flatMap((h) => h.hearts);
  const lastNight = nightName(st, st.history[st.history.length - 1]?.night ?? st.night);
  return `
    <div class="sheet over enter">
      <p class="eyebrow-day">Summer ${st.summer}${st.daily ? `, today’s tide` : ''}</p>
      <h2>${won ? 'We made it through the festival!' : `The pier closed on ${esc(lastNight)}`}</h2>
      <div class="facts">
        <div class="fact"><span>Takings this week</span>${coinHTML(st.earned)}</div>
        <div class="fact"><span>Plates served</span><b>${plates}</b></div>
      </div>
      ${game.newBest ? '<p class="best-badge">A new best week</p>' : profile.best ? `<p class="fine">Best week: ${profile.best} coins</p>` : ''}
      <div class="tower week" aria-hidden="true"></div>
      ${hearts.length ? `<p class="fine">Favourites served: ${[...new Set(hearts)].map((s) => esc(SPECIES[s].name.toLowerCase())).join(', ')}.</p>` : ''}
      ${won && st.summer >= profile.summer - 1 ? `<p class="lede">Summer ${st.summer + 1} is open: dearer rent, hungrier customers.</p>` : ''}
      <div class="go">
        ${isGuest() ? '<p class="partner">Pebble picks the next week.</p>' : `<button class="btn primary" data-action="again">Another week <kbd>Enter</kbd></button>${won ? `<button class="btn" data-action="harder">Summer ${st.summer + 1}</button>` : ''}`}
        <button class="btn small" data-action="album">Regulars book</button>
        <button class="btn small" data-action="quit">Back to the title</button>
      </div>
    </div>`;
}

/** Draw the dish and upgrade icons into their little canvases. */
function paintIcons(root) {
  for (const c of root.querySelectorAll('canvas.ico')) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Number(c.getAttribute('width'));
    c.width = w * dpr;
    c.height = w * dpr;
    c.style.width = `${w}px`;
    c.style.height = `${w}px`;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (c.dataset.dish) {
      R.drawPlateWithFood(g, w / 2, w * 0.58, w * 0.82, { plate: true, parts: DISHES[c.dataset.dish].parts.slice() }, 1, game.st?.menu || Object.keys(DISHES));
    } else if (c.dataset.up) drawUpgradeIcon(g, c.dataset.up, w / 2, w / 2, w * 0.8);
    else if (c.dataset.sp) {
      drawCustomer(g, w / 2, w * 0.98, w * 0.86, { species: c.dataset.sp, t: 0, mood: c.dataset.mood || 'happy' });
      if (c.dataset.locked) {
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = '#3a3550';
        g.fillRect(0, 0, w, w);
        g.globalCompositeOperation = 'source-over';
      }
    } else if (c.dataset.otter) {
      drawOtter(g, w / 2, w * 0.94, w * 0.78, { who: c.dataset.otter, t: game.t, mood: 'wave' });
    }
  }
}

// ── the HUD and the footer during service ───────────────────────────────────

const hud = $('#hud');
const foot = $('#foot');
let hudKey = '';
function renderHud() {
  const st = game.st;
  const s = screen();
  if (s !== 'service' || !st?.svc) {
    if (hudKey !== 'none') {
      hud.hidden = true;
      foot.hidden = true;
      hudKey = 'none';
    }
    return;
  }
  const svc = st.svc;
  const left = Math.max(0, TIMES.open - svc.t);
  const rent = E.rentFor(st);
  const key = `${st.night}|${svc.takings}|${Math.ceil(left)}|${svc.closing}|${game.paused}`;
  if (key !== hudKey) {
    hudKey = key;
    hud.hidden = false;
    const k = Math.min(1, svc.t / TIMES.open);
    const reached = svc.takings + st.purse >= rent;
    hud.innerHTML = `
      <div class="hud-night"><b>${esc(nightName(st))}</b><span class="clock" role="img" aria-label="${svc.closing ? 'Last orders' : `${Math.ceil(left)} seconds until last orders`}"><span style="width:${(k * 100).toFixed(1)}%"></span></span></div>
      <div class="hud-coins ${reached ? 'ok' : ''}" aria-label="Tonight's takings ${svc.takings}, rent ${rent}${st.purse ? `, ${st.purse} in the purse` : ''}">${coinHTML(svc.takings)}<span class="of">rent ${rent}</span>${st.purse ? `<span class="purse">purse ${st.purse}</span>` : ''}</div>`;
  }
  renderFoot();
}

let footKey = '';
function renderFoot() {
  const st = game.st;
  const svc = st.svc;
  const key = svc.otters.map((o) => `${o.hold ? (o.hold.plate ? 'P' + o.hold.parts.join('+') : o.hold.k) : '-'}:${o.queue.length + (o.goal ? 1 : 0)}`).join('|') + `|${st.sel}|${game.mode}|${game.helper}|${game.net?.status}|${game.ready}`;
  if (key === footKey) return;
  footKey = key;
  foot.hidden = false;
  foot.innerHTML = svc.otters
    .map((o, i) => {
      const mine = controls(i);
      const sel = soloBoth() ? st.sel === i : i === game.me;
      const held = o.hold ? (o.hold.plate ? (E.dishOf(st, o.hold) ? DISHES[E.dishOf(st, o.hold)].name : o.hold.parts.length ? 'a plate of ' + o.hold.parts.map((p) => ING_NAMES[p]).join(' and ') : 'an empty plate') : ING_NAMES[o.hold.k]) : 'nothing';
      const label = `${OTTERS[i].name}${soloBoth() ? '' : i === game.me ? ' (you)' : game.helper ? ' (computer)' : ''}`;
      const n = o.queue.length + (o.goal ? 1 : 0);
      const tag = mine ? 'button' : 'div';
      return `<${tag} class="otter-card ${OTTERS[i].id} ${sel ? 'sel' : ''}" ${mine ? `data-action="${soloBoth() ? 'select' : 'cancel'}" data-o="${i}"` : ''} aria-label="${esc(label)}, holding ${esc(held)}${n ? `, ${n} queued` : ''}${mine ? (soloBoth() ? '. Select' : '. Clear queue') : ''}">
        <canvas class="held" data-held="${i}" width="40" height="40"></canvas>
        <span class="who"><b>${esc(label)}</b><small>${esc(held)}</small></span>
        ${n ? `<span class="q" aria-hidden="true">${n}</span>` : ''}
        ${soloBoth() && i === 0 ? '<kbd class="tabkey">Tab</kbd>' : ''}
      </${tag}>`;
    })
    .join('');
  for (const c of foot.querySelectorAll('canvas.held')) {
    const o = svc.otters[Number(c.dataset.held)];
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = 40 * dpr;
    c.height = 40 * dpr;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (o.hold?.plate) R.drawPlateWithFood(g, 20, 23, 34, o.hold, 1, st.menu);
    else if (o.hold) drawIngredient(g, o.hold.k, 20, 20, 30);
    else {
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.setLineDash([3, 3]);
      g.beginPath();
      g.arc(20, 20, 12, 0, Math.PI * 2);
      g.stroke();
    }
  }
}

// ── sounds and juice from engine events ─────────────────────────────────────

const FAIL_HINTS = {
  unfinished: 'That plate isn’t a finished dish yet. Check the bubbles.',
  doesntGo: 'That doesn’t go on this plate.',
  pawsFull: 'Paws full: put it down on a counter first.',
  notReady: 'Not ready yet.',
  cooking: 'The rice is cooking.',
  wrongStation: 'That doesn’t cook there.',
  dockBusy: 'The dock is waiting for a raft.',
  full: 'Something is already there.',
};

function hint(key, text, ms = 2400) {
  // Hints are for people: not while a bot plays every otter (the thumbnail, tests).
  if (game.bot && !game.helper) return;
  const now = performance.now();
  if (game.hints[key] && now - game.hints[key] < 6000) return;
  game.hints[key] = now;
  toast(text, { ms, className: 'hint-toast' });
}

const tileCenter = (c, r) => ({ x: c * T + T / 2, y: r * T + T / 2 - 6 });
const seatPoint = (seat) => ({ x: E.seatX(seat) * T, y: -2.6 * T });

function onEvent(e, st) {
  const mine = e.o === undefined || controls(e.o);
  switch (e.type) {
    case 'tap':
      // A guest already answered its own tap locally (see the pointer handler).
      if (mine && !isGuest()) {
        audio.tap();
        R.effect({ kind: 'ripple', ...tileCenter(e.c, e.r), dur: 0.35, color: OTTERS[e.o].light });
      }
      break;
    case 'do':
      if (e.what === 'take' || e.what === 'plate') audio.take();
      else if (e.what === 'add') audio.add();
      else if (e.what === 'launch') audio.launch();
      else audio.put();
      break;
    case 'sliced':
      audio.sliced();
      break;
    case 'fail':
      if (mine) {
        audio.fail();
        if (FAIL_HINTS[e.why]) hint(e.why, FAIL_HINTS[e.why]);
      }
      break;
    case 'cantReach':
      if (mine) {
        audio.nope();
        hint('reach', soloBoth() ? 'Neither otter can reach that.' : game.helper ? 'That’s Kelp’s side: pass things over the counter, and Kelp will do the rest.' : `That’s on ${OTTERS[1 - e.o].name}’s side: ask them, or pass things over the counter.`, 3000);
      }
      break;
    case 'riceStart':
      audio.riceStart();
      break;
    case 'riceDone':
      audio.riceDone();
      break;
    case 'cooked':
      audio.cooked();
      break;
    case 'burnt':
      audio.burnt();
      hint('burnt', 'Burnt! Bin it and start again.');
      break;
    case 'load': {
      audio.plop();
      const p = E.canalPoint(E.sNear(e.c + 0.5));
      R.effect({ kind: 'splash', x: p.x * T, y: p.y * T, dur: 0.5 });
      break;
    }
    case 'arrive':
      profile.seen[e.sp] = true;
      break;
    case 'grab': {
      audio.nom(e.sp);
      const p = seatPoint(e.seat);
      R.effect({ kind: 'text', x: p.x, y: p.y - 6, text: `${e.price}`, color: rimOf(e.dish), size: 15, dur: 0.9, rise: 22 });
      if (e.fav) {
        audio.love();
        R.effect({ kind: 'hearts', x: p.x, y: p.y - 14, dur: 1.2 });
        profile.hearts[e.sp] = Math.min(5, (profile.hearts[e.sp] || 0) + 1);
      }
      break;
    }
    case 'pay': {
      const p = seatPoint(e.seat);
      audio.coins(e.amount);
      R.effect({ kind: 'text', x: p.x, y: p.y - 24, text: `+${e.amount}`, size: e.amount >= 10 ? 22 : 18, dur: 1.4, rise: 40 });
      if (e.tip > 0) R.effect({ kind: 'text', x: p.x, y: p.y + 2, text: `tip ${e.tip}`, size: 11, color: '#fff6dc', dur: 1.2, rise: 30, t0: performance.now() / 1000 + 0.15 });
      break;
    }
    case 'huff': {
      audio.huff();
      const p = seatPoint(e.seat);
      R.effect({ kind: 'puff', x: p.x, y: p.y, dur: 0.9 });
      R.effect({ kind: 'text', x: p.x, y: p.y - 30, text: 'hmph!', size: 14, color: '#ffb3a8', dur: 1.2 });
      game.shake = 2;
      break;
    }
    case 'lantern':
      audio.lantern(e.n);
      break;
    case 'lanternsOut':
      audio.lanternsOut();
      break;
    case 'rush':
      audio.rush();
      audio.music(true, 'rush');
      banner('Lantern Rush!', 'Plates count double');
      game.shake = 3;
      break;
    case 'rushEnd':
      audio.music(true, st.svc?.closing ? 'busy' : 'calm');
      break;
    case 'gull':
      audio.gull();
      hint('gull', 'A gull! Tap it before it grabs a plate.', 2200);
      break;
    case 'shoo':
      audio.shoo();
      R.effect({ kind: 'feathers', x: e.x * T, y: e.y * T, dur: 0.8 });
      break;
    case 'steal':
      audio.steal();
      R.effect({ kind: 'text', x: e.x * T, y: e.y * T - 20, text: 'squawk!', size: 13, color: '#ffffff', dur: 1 });
      break;
    case 'soggy': {
      audio.soggy();
      hint('soggy', 'A plate went round twice and went soggy.');
      break;
    }
    case 'lastOrders':
      audio.lastOrders();
      audio.music(true, 'busy');
      banner('Last orders', 'No new customers tonight');
      break;
    case 'turnedAway':
    case 'gaveUp':
      hint('away', `A ${SPECIES[e.sp].name.toLowerCase()} couldn’t get a seat and went home.`);
      break;
    case 'open':
      audio.open();
      if (e.layout === 'split' && !(game.coach && game.coach.step < COACH.length)) showTip(splitTip(), 9000);
      banner(nightName(st, e.night), e.layout === 'split' ? 'The pass: each otter keeps to their side' : E.twistInfo(st, e.night)?.name || 'Open for the evening');
      break;
  }
  coachEvent(e);
}

function processEvents(st) {
  if (!st) return;
  for (const e of st.events) {
    if (e.id <= game.lastEv) continue;
    game.lastEv = e.id;
    onEvent(e, st);
  }
}

const bannerEl = $('#banner');
let bannerTimer = 0;
function banner(title, sub = '') {
  bannerEl.innerHTML = `<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
  bannerEl.classList.remove('show');
  void bannerEl.offsetWidth;
  bannerEl.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => bannerEl.classList.remove('show'), 2000);
}

// ── the first night's coach ──────────────────────────────────────────────────

const COACH = [
  { text: 'Tap the salmon crate. Your otter runs over and takes one.', at: (svc) => find(svc, (t) => t.k === 'crate' && t.ing === 'salmon'), done: (e) => e.type === 'do' && e.what === 'take' && e.k === 'salmon' },
  { text: 'Tap the cutting board to slice it. Your otter stays until it’s done.', at: (svc) => find(svc, (t) => t.k === 'board'), done: (e) => e.type === 'sliced' },
  { text: 'Grab a plate from the stack.', at: (svc) => find(svc, (t) => t.k === 'plates'), done: (e) => e.type === 'do' && e.what === 'plate' },
  { text: 'Tap the board again: the salmon goes on the plate.', at: (svc) => find(svc, (t) => t.k === 'board'), done: (e) => e.type === 'do' && e.what === 'add' && e.k === 'salmon_s' },
  { text: 'Add rice from the rice cooker.', at: (svc) => find(svc, (t) => t.k === 'cooker'), done: (e) => e.type === 'do' && e.what === 'add' && e.k === 'rice' },
  { text: 'Salmon nigiri! Tap the dock to send it out on a raft.', at: (svc) => find(svc, (t) => t.k === 'dock'), done: (e) => e.type === 'load' },
  { text: 'Whoever ordered it grabs it as it sails past. Tap ahead: your otter does up to four things in order.', helper: 'Whoever ordered it grabs it as it sails past. Kelp joins in now: tap ahead, up to four things in order.', at: () => null, done: (e) => e.type === 'pay', ms: 9000 },
];
function find(svc, pred) {
  const i = svc.grid.findIndex(pred);
  return i < 0 ? null : { c: i % 6, r: Math.floor(i / 6) };
}
/** Who does what tonight in the split kitchen, for whoever is reading. */
function splitTip() {
  if (soloBoth()) return 'Split kitchen: Pebble’s side has the fish and the boards, Kelp’s side the plates, rice and dock. Pass things over the middle counter.';
  if (game.me === 0) return `Split kitchen: you have the fish, nori and boards. Slice things and set them on the middle counter, and Kelp${game.helper ? '' : ' can'} plate${game.helper ? 's' : ''} them up.`;
  return 'Split kitchen: you have the plates, rice, dock and the pan and fryer. Pick up what Pebble sets on the middle counter and plate it up.';
}

/** A one-off line in the coach's slip, gone after `ms`. */
function showTip(text, ms) {
  const el = $('#coach');
  el.hidden = false;
  el.innerHTML = esc(text);
  showTip.until = performance.now() + ms;
  clearTimeout(showTip.timer);
  showTip.timer = setTimeout(() => {
    if (!(game.coach && game.coach.step < COACH.length)) el.hidden = true;
  }, ms);
}

function startCoach() {
  game.coach = !profile.coached && game.st.night === 0 ? { step: 0, shownAt: 0 } : null;
  showCoach();
}
function showCoach() {
  const el = $('#coach');
  const c = game.coach;
  if (!c || c.step >= COACH.length) {
    // A tip still on show (the split kitchen's) stays until its own timer.
    if (performance.now() < (showTip.until || 0)) return;
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const line = (game.helper && COACH[c.step].helper) || COACH[c.step].text;
  el.innerHTML = `<span class="coach-n">${c.step + 1}/${COACH.length}</span> ${esc(line)}`;
}
function coachEvent(e) {
  const c = game.coach;
  if (!c || c.step >= COACH.length) return;
  if (COACH[c.step].done(e)) {
    c.step++;
    if (c.step >= COACH.length) {
      profile.coached = true;
      saveProfile();
      setTimeout(() => {
        if (game.coach === c) showCoach();
      }, 100);
    } else showCoach();
  }
}
const coachTile = () => {
  const c = game.coach;
  if (!c || c.step >= COACH.length || !game.st?.svc) return null;
  return COACH[c.step].at(game.st.svc);
};

// ── closing time: the plate tower ────────────────────────────────────────────

const RIM_ORDER = [2, 3, 4, 6, 8];
function towerColumns(plates) {
  const cols = {};
  for (const p of plates) {
    const price = DISHES[p.dish].price;
    (cols[price] ||= []).push(p);
  }
  return RIM_ORDER.filter((p) => cols[p]).map((p) => ({ price: p, plates: cols[p] }));
}

async function beginTally() {
  const st = game.st;
  const h = st.history[st.history.length - 1];
  const tally = (game.tally = { done: false });
  const tower = $('.tower', panel);
  const sums = Object.fromEntries([...panel.querySelectorAll('dd[data-k]')].map((d) => [d.dataset.k, d]));
  const stamp = $('.stamp', panel);
  const cols = towerColumns(h.plates);
  tower.innerHTML = cols.map((c) => `<div class="col" style="--rim:${rimOf(c.plates[0].dish)}"><div class="stack"></div><span>${c.price}</span></div>`).join('');
  const stacks = [...tower.querySelectorAll('.stack')];
  const fast = () => game.skip || reducedMotion() || tally.skip;
  const wait = (ms) => new Promise((r) => (fast() ? r() : setTimeout(r, ms)));
  let total = 0;
  let n = 0;
  const per = Math.max(40, Math.min(140, 2200 / Math.max(1, h.plates.length)));
  for (let ci = 0; ci < cols.length; ci++) {
    for (const p of cols[ci].plates) {
      if (game.tally !== tally) return;
      const plate = document.createElement('i');
      if (p.x2) plate.className = 'x2';
      stacks[ci].append(plate);
      n++;
      total += DISHES[p.dish].price * (p.x2 ? 2 : 1);
      sums.plates.textContent = n;
      if (!fast()) audio.coin(n);
      await wait(per);
    }
  }
  if (game.tally !== tally) return;
  sums.tips.textContent = `+${h.tips}`;
  sums.takings.textContent = h.takings;
  await wait(350);
  if (game.tally !== tally) return;
  stamp.classList.add('down');
  audio.stamp();
  if (!h.paid) setTimeout(() => audio.sad(), fast() ? 0 : 300);
  else if (st.result === 'won') setTimeout(() => audio.fanfare(), fast() ? 0 : 300);
  tally.done = true;
}

// ── actions ──────────────────────────────────────────────────────────────────

/** Apply an action for otter seat `seat` to the engine (solo or host). */
function applyAct(seat, a) {
  const st = game.st;
  if (!st) return;
  switch (a.type) {
    case 'tap':
      if (st.phase === 'service' && !game.paused) E.tap(st, soloBoth() ? 'auto' : seat, a.c, a.r);
      break;
    case 'cancel':
      if (st.phase === 'service') E.cancel(st, soloBoth() ? (a.o ?? st.sel) : seat);
      break;
    case 'shoo':
      if (!game.paused) E.shoo(st, a.id);
      break;
    case 'buy':
      if (E.buy(st, a.i)) {
        audio.buy();
        persist();
        renderPanel();
      }
      break;
    case 'ready':
      game.ready[seat] = true;
      advanceIfReady();
      renderPanel();
      break;
    case 'pause':
      setPaused(true, seat);
      break;
    case 'resume':
      setPaused(false, seat);
      break;
  }
  pushSnap(true);
}

function advanceIfReady() {
  const st = game.st;
  const need = isSolo() || !game.net?.session?.peer ? [game.me] : [0, 1];
  if (!need.every((s) => game.ready[s])) return;
  game.ready = [false, false];
  if (st.phase === 'morning') {
    if (st.night === 0) {
      recordPlay(SLUG);
      profile.weeks++;
      saveProfile();
    }
    E.openNight(st);
    startCoach();
  } else if (st.phase === 'closed') {
    E.toMorning(st);
    if (st.phase === 'over') finishWeek();
    else persist();
  }
  setScreen();
}

function act(type, data = {}) {
  if (isGuest()) {
    game.net?.session?.act(type, data);
    if (type === 'ready') {
      game.ready[game.me] = true;
      renderPanel();
    }
    return;
  }
  applyAct(game.me, { type, ...data });
}

function setPaused(on, by = game.me) {
  if (game.paused === on) return;
  game.paused = on;
  game.pauseBy = on ? by : null;
  loop.resync();
  renderPause();
}

function renderPause() {
  const el = $('#pause');
  const away = game.mode === 'host' && game.st?.phase === 'service' && game.net?.session?.away;
  const guestPaused = isGuest() && (game.snapPaused || game.hostQuiet);
  const show = (game.paused || away || guestPaused) && screen() === 'service';
  el.hidden = !show;
  if (!show) return;
  const who = game.pauseBy !== null && game.pauseBy !== game.me && !isSolo() ? `${OTTERS[game.pauseBy].name} paused` : 'Paused';
  const reason = away
    ? game.net.session.peer
      ? 'Kelp’s phone is asleep. Waiting…'
      : 'Kelp has left the pier.'
    : guestPaused && game.hostQuiet && !game.snapPaused
      ? 'Waiting for Pebble…'
      : guestPaused && game.snapPausedWhy
        ? game.snapPausedWhy
        : who;
  el.innerHTML = `
    <div class="pause-card">
      <h2>${esc(reason)}</h2>
      <div class="menu">
        ${away && !game.net.session.peer ? '<button class="btn primary" data-action="carryOn">Carry on with both otters</button>' : '<button class="btn primary" data-action="resume">Resume <kbd>P</kbd></button>'}
        <button class="btn small" data-action="music">${audio.musicOn ? 'Music off' : 'Music on'}</button>
        <button class="btn small" data-action="help">How to play</button>
        <button class="btn small" data-action="quit">Leave the week</button>
      </div>
    </div>`;
}

function persist() {
  const st = game.st;
  if (!st || st.phase !== 'morning') return;
  const slot = game.mode === 'host' ? `host:${game.net.code}` : st.daily ? 'daily' : 'week';
  if (game.noSave) return;
  saved.set(slot, { v: SAVE_V, st: stripForSave(st), helper: game.helper, at: Date.now() });
}
function stripForSave(st) {
  return { ...st, events: [], svc: null };
}

function finishWeek() {
  const st = game.st;
  // Both partners keep the week on their own shelf; only the browser that ran it clears its save.
  game.newBest = st.earned > profile.best;
  if (game.newBest) profile.best = st.earned;
  if (st.result === 'won') {
    profile.wins++;
    profile.summer = Math.max(profile.summer, st.summer + 1);
  }
  if (st.daily) profile.dailies[dailySeed()] = Math.max(profile.dailies[dailySeed()] || 0, st.earned);
  recordBest(SLUG, st.earned, `${st.earned} coins`);
  if (!isGuest()) {
    saved.remove(st.daily ? 'daily' : 'week');
    if (game.mode === 'host') saved.remove(`host:${game.net.code}`);
  }
  profile.plates += st.history.reduce((n, h) => n + h.plates.length, 0);
  saveProfile();
}

function startWeek({ daily = false, summer = 1, resume = null } = {}) {
  game.st = resume || E.newWeek({ seed: daily ? `tide-${dailySeed()}` : `w${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, summer, daily, solo: isSolo() });
  game.lastEv = game.st.eventSeq;
  game.ready = [false, false];
  game.paused = false;
  game.tally = null;
  game.bot = game.helper ? makeHelper() : null;
  persist();
  setScreen();
  pushSnap(true);
}

function startSolo(helper) {
  game.mode = 'solo';
  game.me = 0;
  game.helper = helper;
  profile.helper = helper;
  saveProfile();
  startWeek({ summer: 1 });
}

function quitToTitle() {
  leaveOnline();
  game.mode = 'title';
  game.sub = 'main';
  game.st = null;
  game.helper = false;
  game.bot = null;
  game.paused = false;
  game.coach = null;
  $('#coach').hidden = true;
  history.replaceState(null, '', location.pathname + location.search);
  renderPause();
  setScreen();
  renderPanel();
}

// ── online ───────────────────────────────────────────────────────────────────

const inviteLink = () => {
  const url = new URL(location.href);
  url.hash = `join=${game.net.code}`;
  return url.toString();
};

async function makeQR() {
  const net = game.net;
  try {
    const { renderSVG } = await import('https://cdn.jsdelivr.net/npm/uqr@0.1.3/+esm');
    if (game.net !== net) return;
    net.qr = renderSVG(inviteLink(), { border: 1, whiteColor: '#fff8ea', blackColor: '#24335a' });
    if (screen() === 'lobby') renderPanel();
  } catch {
    /* the link and the code still work */
  }
}

async function startHost(code = roomCode(), resume = null) {
  leaveOnline();
  game.mode = 'host';
  game.me = 0;
  game.st = null;
  const net = (game.net = { role: 'host', code, status: 'connecting', qr: null, session: null });
  history.replaceState(null, '', `#host=${code}`);
  setScreen();
  let room;
  try {
    room = await joinRoom({ slug: SLUG, code, transport: NET });
  } catch {
    if (game.net !== net) return;
    net.status = 'error';
    net.error = 'Couldn’t load the connection library. Check your internet and try again.';
    renderPanel();
    return;
  }
  if (game.net !== net) return room.leave();
  room.onError = (m) => {
    if (game.net !== net) return;
    net.status = 'error';
    net.error = m;
    if (screen() === 'lobby') renderPanel();
  };
  net.session = hostSession({
    room,
    onAct: (a) => applyAct(1, a),
    onStatus: (s) => {
      if (game.net !== net) return;
      if (s === 'joined' || s === 'back') {
        audio.join();
        if (game.st) toast(s === 'back' ? 'Kelp is back.' : 'Kelp joined the pier.');
        net.status = 'here';
        if (game.bot) game.bot = null;
      } else if (s === 'left' || s === 'bye') {
        net.status = 'waiting';
        toast(s === 'bye' ? 'Kelp left the pier.' : 'Lost Kelp’s connection.');
        game.ready[1] = false;
      } else if (s === 'here') net.status = 'here';
      if (screen() === 'lobby') renderPanel();
      renderPause();
      pushSnap(true);
    },
  });
  net.status = 'waiting';
  if (resume) startWeek({ resume });
  else renderPanel();
  makeQR();
}

async function startGuest(code) {
  leaveOnline();
  game.mode = 'guest';
  game.me = 1;
  game.st = null;
  const net = (game.net = { role: 'guest', code, status: 'looking', since: performance.now(), session: null });
  history.replaceState(null, '', `#join=${code}`);
  setScreen();
  const slowTimer = setTimeout(() => game.net === net && screen() === 'lobby' && renderPanel(), 20500);
  net.slowTimer = slowTimer;
  let room;
  try {
    room = await joinRoom({ slug: SLUG, code, transport: NET });
  } catch {
    if (game.net !== net) return;
    net.status = 'error';
    net.error = 'Couldn’t load the connection library. Check your internet and try again.';
    renderPanel();
    return;
  }
  if (game.net !== net) return room.leave();
  room.onError = (m) => {
    if (game.net !== net) return;
    net.status = 'error';
    net.error = m;
    if (screen() === 'lobby') renderPanel();
  };
  net.session = guestSession({
    room,
    token: await roomToken(profile.token, code),
    onSnap: (snap) => receiveSnap(snap),
    onStatus: (s) => {
      if (game.net !== net) return;
      if (s === 'welcome') {
        net.status = 'welcome';
        audio.join();
      } else if (s.startsWith('nope')) net.status = 'nope';
      else if (s === 'hostLeft') {
        net.status = 'hostLeft';
        if (game.st) {
          game.snapPaused = true;
          game.snapPausedWhy = 'Pebble has left the pier.';
          renderPause();
        }
      }
      if (screen() === 'lobby') renderPanel();
    },
  });
}

function leaveOnline() {
  const net = game.net;
  if (!net) return;
  clearTimeout(net.slowTimer);
  try {
    if (net.role === 'guest') net.session?.leave();
    else {
      net.session?.send('bye', {});
      net.session?.close();
    }
  } catch {}
  game.net = null;
}

// Snapshots: the host streams the week; the guest draws it.
let snapClock = 0;
let lastSentEv = 0;
function pushSnap(now = false) {
  const net = game.net;
  if (game.mode !== 'host' || !net?.session?.peer) return;
  if (!now && performance.now() - snapClock < 1000 / SNAP_HZ) return;
  snapClock = performance.now();
  const st = game.st;
  const ev = st ? st.events.filter((e) => e.id > lastSentEv) : [];
  if (ev.length) lastSentEv = ev[ev.length - 1].id;
  const away = st?.phase === 'service' && net.session.away;
  net.session.snap({
    st: st ? { ...st, events: [] } : null,
    ev,
    ready: game.ready,
    paused: game.paused || away,
    pausedWhy: game.paused ? (game.pauseBy === 1 ? 'You paused' : 'Pebble paused') : away ? 'Waiting for you…' : null,
    tally: game.tally?.done ?? null,
  });
}

function receiveSnap(snap) {
  const prevPhase = game.st?.phase;
  const prev = game.st;
  if (!snap.st) {
    game.st = null;
    setScreen();
    return;
  }
  const st = snap.st;
  st.events = snap.ev || [];
  // Keep the otters gliding: start from where they were drawn and ease to the host's position.
  if (prev?.svc && st.svc && prev.night === st.night && prev.phase === st.phase) {
    st.svc.otters.forEach((o, i) => {
      const p = prev.svc.otters[i];
      o.drawX = p.drawX ?? p.x;
      o.drawY = p.drawY ?? p.y;
    });
  }
  const fresh = !prev || prev.seed !== st.seed;
  if (fresh && st.night === 0 && st.phase === 'morning') {
    recordPlay(SLUG);
    profile.weeks++;
    saveProfile();
  }
  game.st = st;
  game.snapAt = performance.now();
  game.snapCanal = st.svc?.canal ?? 0;
  if (fresh) game.lastEv = Math.max(0, (st.events[0]?.id ?? st.eventSeq + 1) - 1);
  processEvents(st);
  const wasReady = game.ready.slice();
  game.ready = snap.ready || [false, false];
  game.snapPaused = !!snap.paused;
  game.snapPausedWhy = snap.pausedWhy;
  if (prevPhase !== st.phase) {
    if (st.phase === 'service') startCoach();
    if (st.phase === 'over') finishWeek();
    setScreen();
  } else if ((st.phase === 'morning' || st.phase === 'closed') && (wasReady.join() !== game.ready.join() || JSON.stringify(prev?.offers) !== JSON.stringify(st.offers) || prev?.purse !== st.purse)) {
    if (st.phase === 'morning') renderPanel();
    else updateReadyLine();
  }
  renderPause();
  renderHud();
}

function updateReadyLine() {
  const go = $('.go', panel);
  if (!go || screen() !== 'closed') return;
  const h = game.st.history[game.st.history.length - 1];
  go.innerHTML = readyLine(game.st.result ? 'See the week' : `${nightName(game.st, Math.min(NIGHTS.length - 1, h.night + 1))} morning`);
}

// ── the loop ─────────────────────────────────────────────────────────────────

let chopClock = 0;
const loop = createLoop({
  update(dt) {
    game.t += dt;
    if (game.mode === 'title' || !game.st) {
      if (!game.demo || game.demo.phase !== 'service') newDemo();
      steps.run(dt, () => {
        game.demoBot.tick(game.demo, 1 / 60);
        E.step(game.demo, 1 / 60);
        if (game.demo.svc && game.demo.svc.t > TIMES.open - 10) newDemo();
      });
      return;
    }
    const st = game.st;
    if (runsEngine() && st.phase === 'service') {
      const away = game.mode === 'host' && game.net?.session?.away;
      if (!game.paused && !away) {
        steps.run(dt, () => {
          if (!helperWaits()) game.bot?.tick(st, 1 / 60);
          E.step(st, 1 / 60);
          if (st.phase !== 'service') return false;
        });
      }
      processEvents(st);
      pushSnap();
      if (st.phase !== 'service') setScreen();
    }
    // A guest who hears nothing from the host for a while shows that it's waiting.
    const quiet = isGuest() && st.phase === 'service' && performance.now() - (game.snapAt || 0) > 2500;
    if (quiet !== !!game.hostQuiet) {
      game.hostQuiet = quiet;
      renderPause();
    }
    if (isGuest() && st.phase === 'service' && !game.snapPaused && !quiet) {
      // Between snapshots the canal keeps flowing and the otters glide toward the host's word.
      const since = (performance.now() - game.snapAt) / 1000;
      st.svc.canal = (game.snapCanal + CANAL.speed * st.svc.P.canal * Math.min(since, 0.3)) % E.CANAL_LENGTH;
    } else if (game.mode === 'host') pushSnap();
    // Knife taps while anyone slices.
    if (st.phase === 'service' && st.svc.otters.some((o) => o.act) && !game.paused) {
      chopClock -= dt;
      if (chopClock <= 0) {
        audio.chop();
        chopClock = 0.16;
      }
    }
    if (st.phase === 'service') renderHud();
  },
  render(dt) {
    syncSize();
    if (screen() === 'closed' || screen() === 'over') {
      R.drawClosing(game.t);
      return;
    }
    const st = game.mode === 'title' || !game.st ? game.demo : screen() === 'morning' ? morningView() : game.st;
    if (isGuest() && st?.svc) {
      const k = Math.min(1, (dt || 1 / 60) * 14);
      for (const o of st.svc.otters) {
        o.drawX = (o.drawX ?? o.x) + (o.x - (o.drawX ?? o.x)) * k;
        o.drawY = (o.drawY ?? o.y) + (o.y - (o.drawY ?? o.y)) * k;
      }
    }
    game.shake = Math.max(0, game.shake - (dt || 0) * 10);
    R.draw(st, game.t, { me: game.me, solo: soloBoth() || game.mode === 'title', coach: coachTile(), shake: reducedMotion() ? 0 : game.shake, guest: isGuest(), morning: screen() === 'morning' });
  },
});

/** Screens change the canvas's box (the panel comes and goes): match it before drawing or hit-testing. */
function syncSize() {
  if (Math.abs(stage.clientWidth - R.cssW) > 0.5 || Math.abs(stage.clientHeight - R.cssH) > 0.5) R.resize();
}

/** The morning screen shows tonight's kitchen in the morning light: a copy of the week, opened. */
function morningView() {
  const st = game.st;
  const key = `${st.seed}|${st.night}|${st.menu.join()}|${Object.keys(st.up).join()}`;
  if (game.preview?.key !== key) {
    const copy = JSON.parse(JSON.stringify({ ...st, events: [], svc: null, eventSeq: 0 }));
    E.openNight(copy);
    copy.svc.arrivals = [];
    copy.svc.otters.forEach((o) => (o.mood = 'happy'));
    game.preview = { key, st: copy };
  }
  return game.preview.st;
}

// ── input ────────────────────────────────────────────────────────────────────

stage.addEventListener('pointerdown', (ev) => {
  if (screen() !== 'service') return;
  ev.preventDefault();
  syncSize();
  const rect = stage.getBoundingClientRect();
  const p = R.toWorld(ev.clientX - rect.left, ev.clientY - rect.top);
  const hit = R.hit(game.st, p.x, p.y);
  if (!hit) return;
  if (game.paused || (isGuest() && game.snapPaused)) return;
  if (hit.kind === 'gull') act('shoo', { id: hit.id });
  else if (hit.kind === 'otter') {
    if (soloBoth()) {
      if (game.st.sel === hit.i) act('cancel', { o: hit.i });
      else selectOtter(hit.i);
    } else if (hit.i === game.me) act('cancel');
  } else if (hit.kind === 'tile') {
    R.cursor = null;
    if (isGuest()) {
      // Answer at once; the host's echo of the tap arrives a beat later.
      audio.tap();
      R.effect({ kind: 'ripple', ...tileCenter(hit.c, hit.r), dur: 0.35, color: OTTERS[game.me].light });
    }
    act('tap', { c: hit.c, r: hit.r });
  }
});

function selectOtter(i) {
  if (!soloBoth() || !game.st) return;
  E.select(game.st, i);
  audio.click();
  footKey = '';
  renderFoot();
}

const ACTIONS = {
  continue: () => {
    const w = savedWeek();
    if (!w) return;
    game.mode = 'solo';
    game.me = 0;
    game.helper = w.helper ?? true;
    startWeek({ resume: w.st });
  },
  solo: () => {
    game.sub = 'solo';
    renderPanel();
  },
  soloHelper: () => startSolo(true),
  soloBoth: () => startSolo(false),
  daily: () => {
    game.mode = 'solo';
    game.me = 0;
    game.helper = profile.helper;
    const w = saved.get('daily');
    startWeek(w?.v === SAVE_V && w.st?.daily && w.st.seed === `tide-${dailySeed()}` ? { resume: w.st } : { daily: true });
  },
  together: () => {
    game.sub = 'together';
    renderPanel();
    setTimeout(() => $('#code-in')?.focus({ preventScroll: true }), 50);
  },
  back: () => {
    game.sub = 'main';
    renderPanel();
  },
  host: () => startHost(),
  startWeek: () => game.mode === 'host' && game.net?.session?.peer && startWeek({ summer: 1 }),
  leave: () => quitToTitle(),
  copy: async () => {
    try {
      await navigator.clipboard.writeText(inviteLink());
      toast('Invite link copied.');
    } catch {
      toast(`The code is ${game.net.code}`);
    }
  },
  share: () => navigator.share?.({ title: 'Sushi Raft', text: 'Come and run the sushi raft with me', url: inviteLink() }).catch(() => {}),
  buy: (el) => act('buy', { i: Number(el.dataset.i) }),
  ready: () => {
    if (screen() === 'closed' && game.tally && !game.tally.done) {
      game.tally.skip = true;
      return;
    }
    act('ready');
  },
  select: (el) => selectOtter(Number(el.dataset.o)),
  cancel: (el) => act('cancel', { o: Number(el.dataset.o) }),
  pause: () => togglePause(),
  resume: () => togglePause(false),
  carryOn: () => {
    // The partner left mid-week: the computer takes Kelp from here.
    game.mode = 'solo';
    game.helper = true;
    makeHelper();
    leaveOnline();
    history.replaceState(null, '', location.pathname + location.search);
    setPaused(false);
    renderPause();
    footKey = '';
  },
  music: () => {
    audio.setMusic(!audio.musicOn);
    audio.music(audio.musicOn && screen() !== 'title', audio.mode);
    renderPause();
  },
  mute: () => {
    const m = audio.sfx.toggleMute();
    $('#btn-mute').setAttribute('aria-pressed', String(m));
    $('#btn-mute').classList.toggle('off', m);
  },
  help: () => openModal(helpHTML()),
  album: () => openModal(albumHTML()),
  close: () => closeModal(),
  again: () => {
    if (game.mode === 'host') startWeek({ summer: game.st.summer });
    else startWeek({ summer: game.st.summer, daily: false });
  },
  harder: () => startWeek({ summer: game.st.summer + 1 }),
  quit: () => {
    closeModal();
    quitToTitle();
  },
};

function togglePause(on = !(game.paused || game.snapPaused)) {
  if (screen() !== 'service') return;
  act(on ? 'pause' : 'resume');
}

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.tagName === 'FORM' || el.disabled) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  ev.preventDefault();
  audio.click();
  fn(el);
});

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('form.join');
  if (!form) return;
  ev.preventDefault();
  const code = cleanCode(new FormData(form).get('code'));
  if (code.length < 4) {
    toast('Type the code from your partner’s phone.');
    return;
  }
  audio.click();
  startGuest(code);
});

document.addEventListener('keydown', (ev) => {
  if (ev.target.closest?.('input, textarea')) return;
  if ($('#modal-root').children.length) {
    if (ev.key === 'Escape') closeModal();
    return;
  }
  const s = screen();
  if (ev.key === 'm' || ev.key === 'M') return ACTIONS.mute();
  if (ev.key === '?') return ACTIONS.help();
  if (s === 'service') {
    if (ev.key === 'p' || ev.key === 'P' || (ev.key === 'Escape' && game.paused)) return togglePause();
    if (game.paused) return;
    if (ev.key === 'Tab' && soloBoth()) {
      ev.preventDefault();
      return selectOtter(1 - game.st.sel);
    }
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (dirs[ev.key]) {
      ev.preventDefault();
      const c = R.cursor || { c: 2, r: 0 };
      R.cursor = { c: Math.max(0, Math.min(5, c.c + dirs[ev.key][0])), r: Math.max(0, Math.min(5, c.r + dirs[ev.key][1])) };
      return;
    }
    if ((ev.key === ' ' || ev.key === 'Enter') && R.cursor) {
      ev.preventDefault();
      return act('tap', { c: R.cursor.c, r: R.cursor.r });
    }
    if (ev.key === 'Escape') return act('cancel', { o: soloBoth() ? game.st.sel : game.me });
    return;
  }
  if (ev.key === 'Enter') {
    const primary = $('.btn.primary:not([disabled])', panel);
    if (primary && !ev.target.closest?.('button')) {
      ev.preventDefault();
      primary.click();
    }
  }
});

// ── modals ───────────────────────────────────────────────────────────────────

function openModal(html) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-back" data-action="close"></div><div class="modal" role="dialog" aria-modal="true">${html}<button class="btn small close" data-action="close">Close</button></div>`;
  paintIcons(root);
  if (screen() === 'service' && runsEngine() && !game.paused) act('pause');
  $('.modal .close', root).focus({ preventScroll: true });
}
function closeModal() {
  $('#modal-root').innerHTML = '';
}

function helpHTML() {
  return `
    <h2>How to play</h2>
    <div class="help">
      <p><b>Tap a station</b> and your otter runs over and uses it. Tap ahead: it does up to four things in order. Tap your otter to clear its list.</p>
      <ul class="steps">
        <li><canvas class="ico small" data-dish="salmon_nigiri" width="40" height="40"></canvas><span><b>Make dishes on plates.</b> Salmon nigiri is rice plus sliced salmon: take a salmon, slice it on the board, take a plate, add the salmon and some rice.</span></li>
        <li><canvas class="ico small" data-up="cooker" width="40" height="40"></canvas><span><b>Keep the rice coming.</b> The cooker holds a few servings; tap it when it’s empty to cook more. The pan and fryer cook by themselves, and burn if you forget them.</span></li>
        <li><canvas class="ico small" data-up="lanterns" width="40" height="40"></canvas><span><b>Send it out from the dock.</b> A raft carries it round the canal and whoever wants it grabs it. Five plates in a row light the lanterns: a Lantern Rush, when plates count double.</span></li>
        <li><canvas class="ico small" data-sp="puffer" data-mood="cross" width="40" height="40"></canvas><span><b>Mind their patience.</b> The bar under each bubble runs down. Fed quickly, they tip. Left too long, they leave in a huff, and the lanterns go out.</span></li>
      </ul>
      <p><b>Rent is due every night.</b> Takings go in the purse, rent comes out after closing. In the morning, spend on new dishes (dearer plates) or kitchen upgrades, or keep it for rent. Survive five nights, up to Friday’s Lantern Festival.</p>
      <p><b>Together:</b> each phone runs one otter. Some nights the kitchen is split down the middle, so you pass things to each other over the counter. <b>Solo:</b> a computer Kelp helps you, or you run both otters yourself: then a tap goes to whichever otter can reach it, or the selected one (tap an otter, or press Tab).</p>
      <p class="fine">Keyboard: arrow keys and Space queue a station, Tab switches otter, Esc clears, P pauses, M mutes.</p>
    </div>`;
}

function albumHTML() {
  const cards = SPECIES_ORDER.map((sp) => {
    const seen = profile.seen[sp];
    const hearts = profile.hearts[sp] || 0;
    const S = SPECIES[sp];
    return `<li class="regular ${seen ? '' : 'unseen'} ${hearts >= 5 ? 'friend' : ''}">
      <canvas class="ico" data-sp="${sp}" ${seen ? '' : 'data-locked="1"'} data-mood="${hearts >= 5 ? 'love' : 'happy'}" width="64" height="64"></canvas>
      <div><b>${seen ? esc(S.name) : 'Not met yet'}</b>
      <span class="hearts" aria-label="${hearts} of 5 hearts">${'<i class="on"></i>'.repeat(hearts)}${'<i></i>'.repeat(5 - hearts)}</span>
      <span class="fav">${seen ? `Loves ${esc(DISHES[S.fav].name.toLowerCase())}. ${esc(S.note)}` : S.vip ? 'Only comes to the festival.' : 'Comes by now and then.'}</span></div>
    </li>`;
  }).join('');
  const friends = SPECIES_ORDER.filter((s) => (profile.hearts[s] || 0) >= 5).length;
  return `<h2>Regulars book</h2><p class="fine">Serve a customer their favourite dish for a heart. Five hearts and they’re a regular: ${friends} of ${SPECIES_ORDER.length} so far.</p><ul class="album">${cards}</ul>`;
}

// ── visibility, resize, boot ─────────────────────────────────────────────────

// Solo pauses on blur too; online play only when the tab is really hidden (a blur on one phone
// shouldn't stop the night for both).
onHidden(() => {
  if (isSolo() && screen() === 'service' && !game.paused) act('pause');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (isGuest()) game.net?.session?.hidden(true);
    else if (game.mode === 'host' && screen() === 'service' && !game.paused) act('pause');
    audio.music(false);
  } else {
    if (isGuest()) game.net?.session?.hidden(false);
    loop.resync();
    const s = screen();
    if (s === 'service') audio.music(true, audio.mode);
    else if (s === 'closed' || s === 'over') audio.music(true, 'night');
  }
});
window.addEventListener('resize', () => R.resize());

homeLink({ parent: $('#home-slot') });
document.fonts?.ready.then(() => R.resize());
R.resize();
newDemo();
setScreen();

// A link from a partner (#join=CODE) or a host's reload (#host=CODE).
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.get('join')) startGuest(cleanCode(hash.get('join')));
else if (hash.get('host')) {
  const code = cleanCode(hash.get('host'));
  const w = saved.get(`host:${code}`);
  startHost(code, w?.v === SAVE_V ? w.st : null);
}

// ── debug hooks (npm run check, Chrome testing) ──────────────────────────────

function fastForward(seconds) {
  const st = game.st;
  if (!st || st.phase !== 'service') return;
  for (let i = 0; i < Math.round(seconds * 60) && st.phase === 'service'; i++) {
    game.bot?.tick(st, 1 / 60);
    E.step(st, 1 / 60);
  }
  processEvents(st);
  setScreen();
}

markReady({
  get state() {
    return game.st;
  },
  game,
  E,
  loop,
  advance: (s) => loop.advance(s),
  /** Solo week straight to a night with `menu` (dish ids) and `ups`, the bot playing if `bot`. */
  soloNight({ night = 0, menu = null, ups = {}, twist, purse = 0, bot = false, skill = 0.85, helper = false } = {}) {
    game.mode = 'solo';
    game.me = 0;
    game.helper = helper;
    game.noSave = true;
    startWeek({});
    game.noSave = false;
    const st = game.st;
    st.night = night;
    if (menu) st.menu = menu.slice();
    Object.assign(st.up, ups);
    if (twist !== undefined) st.twists[night] = twist;
    st.purse = purse;
    E.openNight(st);
    game.coach = null;
    $('#coach').hidden = true;
    game.bot = bot ? createBot({ otters: [0, 1], skill, seed: 5 }) : helper ? makeHelper() : null;
    setScreen();
    return st;
  },
  fastForward,
  /** Close tonight now (as if the clock ran out). */
  closeNow() {
    const st = game.st;
    if (st?.phase !== 'service') return;
    st.svc.customers = [];
    st.svc.arrivals = [];
    st.svc.t = Math.max(st.svc.t, TIMES.open);
    E.step(st, 1 / 60);
    processEvents(st);
    setScreen();
  },
  skipAnimations(on = true) {
    game.skip = on;
  },
  setPurse(n) {
    if (game.st) game.st.purse = n;
    if (screen() === 'morning') renderPanel();
  },
  botPlay(on = true, skill = 0.85) {
    game.bot = on ? createBot({ otters: isSolo() ? [0, 1] : [game.me], skill, seed: 9 }) : null;
  },
  coachStep: () => game.coach?.step ?? null,
  /** Where tile (c, r) is on screen (client px), for clicking the canvas like a player. */
  tilePoint(c, r) {
    syncSize();
    const rect = stage.getBoundingClientRect();
    const p = R.toScreen(c * T + T / 2, r * T + T / 2);
    return { x: rect.left + p.x, y: rect.top + p.y };
  },
  /** The first tile of a kind (and crate ingredient) in tonight's kitchen. */
  findTile(k, ing) {
    const svc = game.st?.svc;
    const i = svc ? svc.grid.findIndex((t) => t.k === k && (!ing || t.ing === ing)) : -1;
    return i < 0 ? null : { c: i % 6, r: Math.floor(i / 6) };
  },
  prepareThumbnail() {
    this.soloNight({ night: 2, menu: ['salmon_nigiri', 'tuna_nigiri', 'kappa_maki', 'ebi'], ups: { board2: true }, twist: null, bot: true, skill: 0.9 });
    fastForward(46);
    game.bot = null;
    R.fx.length = 0;
    loop.manual = true;
    loop.advance(1 / 60);
  },
});
