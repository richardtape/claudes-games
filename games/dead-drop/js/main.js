// Dead Drop UI: screens, the four ways to play (computer, pass and play, host, guest), input,
// and the reveal flow that animates each turn's events before re-rendering from the new view.
import { homeLink, markReady, onHidden, recordBest, recordPlay, store } from '../../../shared/arcade.js';
import { createSfx } from '../../../shared/sfx.js';
import { shake, toast as cgToast } from '../../../shared/juice.js';
import { cleanCode, joinRoom, roomCode } from '../../../shared/net.js';
import { AGENT, AGENTS, CITIES, CITY, CODENAMES, RIVALS, TURNS } from './data.js';
import { attachBot, createTable, guestSession, hostSession, restoreTable } from './session.js';
import { cardHTML, chipHTML, cityHTML, esc, playEvents } from './board.js';
import { agentSVG, spySVG } from './art.js';
import { createAudio } from './audio.js';

const SLUG = 'dead-drop';
const saved = store(SLUG);
const sfx = createSfx(SLUG);
const audio = createAudio(sfx, SLUG);
const params = new URLSearchParams(location.search);
const NET = params.get('net') === 'local' ? 'local' : 'p2p';

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
const pickCodename = (not) => {
  const pool = CODENAMES.filter((c) => c !== not);
  return pool[Math.floor(Math.random() * pool.length)];
};

const meta = Object.assign({ v: 1, codename: pickCodename(), beaten: [], token: randomToken(), matches: 0, onlineWins: 0 }, saved.get('meta', {}));
const saveMeta = () => saved.set('meta', meta);
saveMeta();

const ui = {
  screen: 'title', // title | rivals | lobby | cover | play | over
  mode: null, // solo | pass | host | guest
  seat: 0, // my seat (pass mode: the seat whose turn it is, or null while both watch)
  view: null, // view currently on screen
  remote: null, // latest view from the host (guest)
  shownSeq: 0, // turnSeq already animated
  selected: null,
  target: null,
  animating: false,
  dirty: false,
  skip: false,
  modal: null, // help | fold | escalated | quit
  cover: null, // pass and play: { seat, why }
  prevSpectator: null,
  caption: '',
  inspect: null,
  net: null,
  rival: null,
  flashSeen: null,
  updating: false, // onUpdate() in progress (reveal or flash playing)
  matchDone: false,
  sentPlan: null, // guest: the drop we sent, shown until the host's view confirms it
};
let table = null;
let bot = null;
let unwatch = null;

const wait = (ms) => new Promise((r) => setTimeout(r, ui.skip ? 0 : ms));
const toast = (msg) => cgToast(msg, { className: 'toast' });
const view = () => ui.view;
const me = () => (ui.mode === 'pass' ? (ui.seat ?? 0) : ui.mode === 'guest' ? 1 : 0);
const label = (seat, v = view()) => {
  if (!v) return '';
  if (ui.mode !== 'pass' && seat === me()) return 'You';
  return v.names[seat];
};
const labelLower = (seat, v) => (ui.mode !== 'pass' && seat === me() ? 'you' : label(seat, v));
const cityName = (v, ci) => CITY[v.round.cities[ci].id].name;

// ── sessions ────────────────────────────────────────────────────────────────

function watch(t) {
  unwatch?.();
  unwatch = t.onChange(() => {
    persist();
    onUpdate();
  });
}

function persist() {
  if (!table) return;
  if (ui.mode === 'solo' || ui.mode === 'pass') saved.set('match', { mode: ui.mode, rival: ui.rival?.id ?? null, table: table.toJSON() });
  if (ui.mode === 'host' && ui.net?.code) saved.set(`host-${ui.net.code}`, { table: table.toJSON(), at: Date.now() });
}

function resetMatchUi() {
  bot?.stop();
  bot = null;
  ui.view = null;
  ui.remote = null;
  ui.shownSeq = 0;
  ui.selected = null;
  ui.target = null;
  ui.modal = null;
  ui.cover = null;
  ui.caption = '';
  ui.inspect = null;
  ui.flashSeen = null;
  ui.prevSpectator = null;
}

function startSolo(rivalId, resume = null) {
  leaveMatch({ keepSave: !!resume });
  resetMatchUi();
  ui.mode = 'solo';
  ui.rival = RIVALS.find((r) => r.id === rivalId) || RIVALS[0];
  table = resume ? restoreTable(resume) : createTable({ names: [meta.codename, ui.rival.name] });
  watch(table);
  bot = attachBot(table, 1, ui.rival, { hold: () => ui.updating });
  beginMatch(!resume);
}

function startPass(resume = null) {
  leaveMatch({ keepSave: !!resume });
  resetMatchUi();
  ui.mode = 'pass';
  ui.rival = null;
  table = resume ? restoreTable(resume) : createTable({ names: ['Red', 'Teal'] });
  watch(table);
  ui.seat = null;
  beginMatch(!resume);
}

async function startHost({ code = roomCode(), resume = null } = {}) {
  leaveMatch();
  resetMatchUi();
  ui.mode = 'host';
  ui.net = { role: 'host', code, status: 'connecting', peer: null, error: null, qr: null };
  ui.screen = 'lobby';
  history.replaceState(null, '', `#host=${code}`);
  render();
  table = resume ? restoreTable(resume) : createTable({ names: [meta.codename, 'Your rival'] });
  table.names[0] = meta.codename;
  watch(table);
  try {
    ui.net.room = await joinRoom({ slug: SLUG, code, transport: NET });
  } catch (err) {
    ui.net.status = 'error';
    ui.net.error = 'Couldn’t load the connection library. Check your internet connection and try again.';
    render();
    return;
  }
  const room = ui.net.room;
  room.onError = (m) => {
    ui.net.error = m;
    render();
  };
  ui.net.session = hostSession({
    room,
    table,
    onStatus: (s, name) => {
      if (s === 'joined' || s === 'back') {
        ui.net.peer = 'here';
        if (ui.screen === 'lobby') beginMatch(!resume);
        else toast(`${name} is back.`);
      } else if (s === 'left') {
        ui.net.peer = 'gone';
        render();
      }
    },
  });
  ui.net.status = 'waiting';
  render();
  makeQR();
}

async function startGuest(code) {
  leaveMatch();
  resetMatchUi();
  ui.mode = 'guest';
  ui.net = { role: 'guest', code, status: 'connecting', peer: null, error: null, slow: false };
  ui.screen = 'lobby';
  history.replaceState(null, '', `#join=${code}`);
  render();
  try {
    ui.net.room = await joinRoom({ slug: SLUG, code, transport: NET });
  } catch {
    ui.net.status = 'error';
    ui.net.error = 'Couldn’t load the connection library. Check your internet connection and try again.';
    render();
    return;
  }
  const net = ui.net;
  net.room.onError = (m) => {
    net.error = m;
    render();
  };
  net.session = guestSession({
    room: net.room,
    name: meta.codename,
    token: meta.token,
    onView: (v) => {
      ui.remote = v;
      if (ui.screen === 'lobby') beginMatch(true);
      else onUpdate();
    },
    onStatus: (s, name) => {
      if (s === 'joined') {
        net.peer = 'here';
        net.status = 'joined';
        if (ui.screen === 'play') toast(`Back in ${name}’s game.`);
      } else if (s === 'left') {
        net.peer = 'gone';
        render();
      } else if (s === 'full' || s === 'version') {
        net.status = s;
        render();
      }
    },
  });
  net.status = 'searching';
  render();
  setTimeout(() => {
    if (ui.net === net && net.status === 'searching') {
      net.slow = true;
      render();
    }
  }, 20000);
}

function beginMatch(fresh = true) {
  ui.screen = 'play';
  if (fresh) {
    recordPlay(SLUG);
    meta.matches++;
    saveMeta();
  }
  audio.music(true);
  onUpdate();
}

/** Stop the current match: bot, network room, saved solo game (unless resuming it). */
function leaveMatch({ keepSave = false } = {}) {
  bot?.stop();
  bot = null;
  unwatch?.();
  unwatch = null;
  if (ui.net?.room) ui.net.room.leave();
  ui.net = null;
  if (!keepSave && (ui.mode === 'solo' || ui.mode === 'pass') && table && table.state.phase === 'match-over') saved.remove('match');
  table = null;
  audio.music(false);
  audio.tension(0);
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

function act(a) {
  if (ui.mode === 'guest') return ui.net?.session?.act(a);
  if (!table) return false;
  if (ui.mode === 'pass') {
    if (a.a === 'next' || a.a === 'rematch') return table.act(0, a) | table.act(1, a);
    ui.prevSpectator = table.view(-1);
    return table.act(ui.seat, a);
  }
  if (ui.mode === 'solo' && a.a === 'rematch') return table.act(0, a) | table.act(1, a);
  return table.act(0, a);
}

/** My drop this turn: locked on the table, or (guest) sent and not yet confirmed. */
function myPlan(v) {
  if (v.round.plan) return v.round.plan;
  const sp = ui.sentPlan;
  return ui.mode === 'guest' && sp && sp.round === v.roundNo && sp.turn === v.round.turn ? sp : null;
}

function latestView() {
  if (ui.mode === 'guest') return ui.remote;
  if (!table) return null;
  if (ui.mode === 'pass') return table.view(ui.seat === null ? -1 : ui.seat);
  return table.view(0);
}

// ── the update / reveal flow ────────────────────────────────────────────────

async function onUpdate() {
  if (ui.screen !== 'play' && ui.screen !== 'cover' && ui.screen !== 'over') return render();
  // One update at a time: reveals and flashes are awaited, and anything that arrives
  // meanwhile is picked up afterwards from the latest view, never from a stale copy.
  if (ui.updating) {
    ui.dirty = true;
    return;
  }
  ui.updating = true;
  try {
    if (ui.mode === 'pass' && table && table.turnSeq > ui.shownSeq) ui.seat = null;
    let v = latestView();
    if (!v) return;
    const prev = ui.view;
    if (v.turnSeq > ui.shownSeq && prev && v.round.events.length) {
      ui.shownSeq = v.turnSeq;
      ui.selected = null;
      ui.target = null;
      ui.inspect = null;
      const from = ui.mode === 'pass' && ui.prevSpectator ? ui.prevSpectator : prev;
      await animateTurn(from, v);
      v = latestView();
    }
    ui.shownSeq = Math.max(ui.shownSeq, v.turnSeq);
    // An escalation just landed: flash it once.
    const pend = v.round.pending;
    if (pend && v.phase === 'plan' && ui.flashSeen !== `${v.roundNo}-${pend.by}`) {
      ui.flashSeen = `${v.roundNo}-${pend.by}`;
      ui.view = v;
      render();
      await flashEscalate(v, pend.by);
      v = latestView();
    }
    const folded = v.round.result?.folded;
    if (ui.view && ui.view.phase === 'plan' && v.phase !== 'plan' && folded !== null && folded !== undefined && v.roundNo === ui.view.roundNo) {
      ui.view = v;
      render();
      await flashFold(v, folded);
      v = latestView();
    }
    ui.view = v;
    if (ui.mode === 'pass') passCover(v);
    audio.tension(v.phase === 'plan' && (v.round.turn === TURNS || v.round.stake > 1) ? 1 : 0);
    if (v.phase === 'match-over' && !ui.matchDone) {
      ui.matchDone = true;
      finishMatch(v);
    }
    if (v.phase !== 'match-over') ui.matchDone = false;
  } finally {
    ui.updating = false;
  }
  render();
  if (ui.dirty) {
    ui.dirty = false;
    onUpdate();
  }
}

/** Pass and play: decide whose hands the device should be in, and show the cover if it changes. */
function passCover(v) {
  if (v.phase !== 'plan') {
    ui.seat = null;
    ui.cover = null;
    return;
  }
  const full = table.view(-1).round;
  let actor = null;
  let why = 'turn';
  if (full.pending && !full.locked[full.pending.by]) actor = full.pending.by;
  else if (full.pending) {
    actor = 1 - full.pending.by;
    why = 'escalated';
  } else if (!full.locked[0]) actor = 0;
  else if (!full.locked[1]) actor = 1;
  if (actor !== null && actor !== ui.seat) {
    ui.seat = null;
    ui.cover = { seat: actor, why };
    ui.screen = 'cover';
  }
}

async function animateTurn(from, next) {
  ui.animating = true;
  ui.skip = false;
  ui.caption = '';
  const seatAtBottom = ui.mode === 'pass' ? (ui.prevSpectator ? 0 : (ui.seat ?? 0)) : me();
  ui.view = from;
  renderPlay({ board: from, hand: next, revealing: true, bottom: seatAtBottom });
  const root = $('#board');
  const known = new Map();
  for (const v of [from, next]) for (const c of v.round.cities) for (const side of c.sides) for (const cv of side) if (cv.kind) known.set(cv.uid, cv);
  for (const g of next.round.gone.flat()) known.set(g.uid, g);
  const nextOnBoard = new Map();
  for (const c of next.round.cities) for (const side of c.sides) for (const cv of side) nextOnBoard.set(cv.uid, cv);
  const events = next.round.events;
  const kinds = new Map();
  for (const e of events) {
    if (e.t === 'drop' && e.kind) kinds.set(e.uid, e.kind);
    if (e.t === 'out' || e.t === 'reveal') kinds.set(e.uid, e.kind);
  }
  try {
    await playEvents(events, {
      root,
      me: seatAtBottom,
      names: next.names.map((_, s) => label(s, next)),
      fast: false,
      wait,
      say: (text) => say(text),
      sound: (what, arg) => audio[what]?.(arg),
      shake: (n) => shake(root, n),
      cityName: (ci) => cityName(next, ci),
      cardOf: (uid) => nextOnBoard.get(uid) || null,
      kindOf: (uid) => kinds.get(uid) || known.get(uid)?.kind || null,
      ownerOf: (uid) => (nextOnBoard.get(uid) || known.get(uid))?.owner ?? from.round.cities.flatMap((c) => c.sides.flat()).find((c) => c.uid === uid)?.owner ?? 0,
      finale: (e) => finale(e, next, seatAtBottom),
    });
  } catch (err) {
    console.warn('reveal animation skipped', err);
  }
  ui.animating = false;
  ui.prevSpectator = null;
  ui.caption = '';
}

/** The final flip: every city resolves in turn, then the stake slides to the winner. */
async function finale(e, next, bottom) {
  say('The final flip.');
  await wait(500);
  for (let ci = 0; ci < 3; ci++) {
    const sec = $(`#board .city[data-city="${ci}"]`);
    if (!sec) continue;
    sec.classList.add('resolving');
    const totals = e.totals[ci];
    const els = [...sec.querySelectorAll('[data-total]')];
    for (let step = 1; step <= 6; step++) {
      for (const el of els) {
        const s = Number(el.dataset.total);
        el.textContent = String(Math.round((totals[s] * step) / 6));
      }
      audio.tick(step);
      await wait(55);
    }
    const w = e.cityWinners[ci];
    sec.classList.add(w === null ? 'won-none' : w === bottom ? 'won-me' : 'won-them', 'sweeping');
    if (w === null) audio.nobody();
    else audio.city(ui.mode === 'pass' ? w === 0 : w === me());
    say(w === null ? `${cityName(next, ci)}: nobody holds it.` : `${cityName(next, ci)} goes to ${labelLower(w, next)}.`);
    await wait(750);
    sec.classList.remove('resolving');
  }
  if (e.winner !== null) {
    const mine = ui.mode === 'pass' ? true : e.winner === me();
    (mine ? audio.roundWon : audio.roundLost)();
    shake($('#board'), 2);
  } else audio.nobody();
  await wait(500);
}

async function flashEscalate(v, by) {
  audio.escalate();
  const el = document.createElement('div');
  el.className = `flash esc own-${by}`;
  el.innerHTML = `<div class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div><p class="big">${jitter('Escalate')}</p><p class="small">${esc(label(by, v))} doubled the stake</p>`;
  app.append(el);
  shake(app, 2);
  await new Promise((r) => setTimeout(r, ui.skip ? 300 : 1300));
  el.remove();
}

async function flashFold(v, seat) {
  audio.fold();
  const el = document.createElement('div');
  el.className = `flash fold own-${seat}`;
  el.innerHTML = `<p class="big">${jitter('Fold')}</p><p class="small">${esc(label(seat, v))} ${ui.mode !== 'pass' && seat === me() ? 'walk' : 'walks'} away from the round</p>`;
  app.append(el);
  await new Promise((r) => setTimeout(r, 1000));
  el.remove();
}

function say(text) {
  ui.caption = text;
  const el = $('#ticker');
  if (el) {
    el.textContent = text;
    el.classList.remove('typing');
    void el.offsetWidth;
    el.classList.add('typing');
  }
}

function finishMatch(v) {
  if (ui.mode === 'solo') {
    const won = v.winner === 0;
    if (won && ui.rival && !meta.beaten.includes(ui.rival.id)) meta.beaten.push(ui.rival.id);
    saveMeta();
    const top = RIVALS.reduce((best, r, i) => (meta.beaten.includes(r.id) ? i + 1 : best), 0);
    if (top) recordBest(SLUG, top, `Beat ${RIVALS[top - 1].name}`);
    saved.remove('match');
    (won ? audio.victory : audio.defeat)();
  } else if (ui.mode === 'pass') {
    saved.remove('match');
    audio.victory();
  } else {
    if (v.winner === me()) {
      meta.onlineWins++;
      saveMeta();
      audio.victory();
    } else audio.defeat();
  }
}

// ── rendering ───────────────────────────────────────────────────────────────

/** Hand-cut type: every letter nudged and tilted a little. */
function jitter(text, seed = 7) {
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280) - 0.5;
  // Letters are inline blocks, so wrap each word to keep lines from breaking inside it.
  return text
    .split(' ')
    .map((word) => `<span class="word">${[...word].map((ch) => `<span class="cut" style="--r:${(r() * 7).toFixed(1)}deg;--y:${(r() * 0.12).toFixed(2)}em">${esc(ch)}</span>`).join('')}</span>`)
    .join(' ');
}

const ICON = {
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor"/><path d="M16 8.5c1.3 1 2 2.2 2 3.5s-.7 2.5-2 3.5M18.5 6c2 1.6 3 3.6 3 6s-1 4.4-3 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17.5V5l11-2v12.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><ellipse cx="6.5" cy="17.5" rx="3.2" ry="2.6" fill="currentColor"/><ellipse cx="17.5" cy="15.5" rx="3.2" ry="2.6" fill="currentColor"/></svg>',
};

function renderTop() {
  return `<header class="top">
    <div class="home-slot"></div>
    <p class="mark">${jitter('Dead Drop', 3)}</p>
    <div class="tools">
      ${ui.screen === 'play' || ui.screen === 'cover' ? '<button class="tool" data-action="quit">Leave</button>' : ''}
      <button class="tool" data-action="help" aria-label="How to play">?</button>
      <button class="tool icon${sfx.muted ? ' off' : ''}" data-action="mute" aria-label="Sound effects" aria-pressed="${!sfx.muted}" title="Sound (M)">${ICON.sound}</button>
      <button class="tool icon${audio.musicOn ? '' : ' off'}" data-action="music" aria-label="Music" aria-pressed="${audio.musicOn}" title="Music">${ICON.music}</button>
    </div>
  </header>`;
}

function titleHTML() {
  const resume = saved.get('match', null);
  const canResume = resume && resume.table?.state?.phase !== 'match-over';
  const resumeLabel = canResume ? (resume.mode === 'pass' ? 'Continue pass and play' : `Continue against ${RIVALS.find((r) => r.id === resume.rival)?.name || 'the computer'}`) : '';
  const intro = !ui.introDone;
  ui.introDone = true;
  return `<div class="title-screen${intro ? ' intro' : ''}">
    <div class="poster">
      <div class="bars" aria-hidden="true"><i></i><i></i><i></i></div>
      <h1 class="logo" aria-label="Dead Drop">${jitter('Dead', 11)}<br>${jitter('Drop', 5)}</h1>
      <p class="tagline">A spy card duel for two. Drop agents in secret, flip together, call the bluff.</p>
      <div class="spy" aria-hidden="true">${spySVG()}</div>
    </div>
    <nav class="menu" aria-label="Play">
      ${canResume ? `<button class="slip primary" data-action="continue">${esc(resumeLabel)}</button>` : ''}
      <button class="slip ${canResume ? '' : 'primary'}" data-action="rivals">Play the computer</button>
      <button class="slip" data-action="host">Play a friend online</button>
      <button class="slip" data-action="pass">Pass and play</button>
      <form class="join" data-form="join">
        <label for="code">Got a room code?</label>
        <span class="join-row"><input id="code" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="8" placeholder="K7QX2M" /><button class="slip small" type="submit">Join</button></span>
      </form>
      <p class="codename">You are <b>${esc(meta.codename)}</b> <button class="link" data-action="rename">Change codename</button></p>
    </nav>
  </div>`;
}

function rivalsHTML() {
  const next = RIVALS.findIndex((r) => !meta.beaten.includes(r.id));
  return `<div class="rivals-screen">
    <h2 class="cut-h">${jitter('Choose your rival', 2)}</h2>
    <ol class="rivals">
      ${RIVALS.map((r, i) => {
        const beaten = meta.beaten.includes(r.id);
        const open = i === 0 || meta.beaten.includes(RIVALS[i - 1].id);
        return `<li><button class="rival${beaten ? ' beaten' : ''}${i === next ? ' next' : ''}" data-action="rival" data-id="${r.id}" ${open ? '' : 'disabled'}>
          <span class="rank">${i + 1}</span><span class="who"><b>${esc(r.name)}</b><span>${esc(open ? r.blurb : `Beat ${RIVALS[i - 1].name} to unlock.`)}</span></span>
          <span class="state">${beaten ? 'Beaten' : open ? 'Play' : 'Locked'}</span></button></li>`;
      }).join('')}
    </ol>
    <button class="slip quiet" data-action="title">Back</button>
  </div>`;
}

function inviteLink() {
  const url = new URL(location.href);
  url.hash = `join=${ui.net.code}`;
  return url.toString();
}

function lobbyHTML() {
  const n = ui.net;
  if (!n) return '';
  if (n.role === 'host') {
    const status =
      n.status === 'connecting' ? 'Opening a room…' : n.status === 'error' ? esc(n.error) : 'Waiting for your rival to open the link…';
    return `<div class="lobby">
      <h2 class="cut-h">${jitter('Play a friend', 4)}</h2>
      <p>Send your rival this link. The game starts as soon as they open it.</p>
      <div class="invite">
        <input readonly value="${esc(inviteLink())}" aria-label="Invite link" />
        <button class="slip primary small" data-action="copy-link">Copy link</button>
        ${navigator.share ? '<button class="slip small" data-action="share-link">Share</button>' : ''}
      </div>
      <div class="qr-wrap">
        <div class="qr" aria-label="QR code for the invite link" role="img">${n.qr || ''}</div>
        <p class="code">Room code <b>${esc(n.code)}</b><span>They can also type it on the title screen.</span></p>
      </div>
      <p class="wait" role="status">${n.status === 'waiting' ? '<i class="dots" aria-hidden="true"></i>' : ''}${status}</p>
      ${n.error && n.status !== 'error' ? `<p class="err">${esc(n.error)}</p>` : ''}
      <p class="fine">Rooms are private to whoever has the link. Your browsers connect directly, so your rival’s browser can see your internet address, as with any direct call.</p>
      <button class="slip quiet" data-action="title">Cancel</button>
    </div>`;
  }
  const msg = {
    connecting: 'Opening the line…',
    searching: `Looking for room ${esc(n.code)}…`,
    joined: 'Connected. Waiting for the table…',
    full: 'That game already has two spymasters.',
    version: 'Your rival is on a different version of Dead Drop. Both reload the page and try again.',
    error: esc(n.error || 'Something went wrong.'),
  }[n.status];
  return `<div class="lobby">
    <h2 class="cut-h">${jitter('Joining', 6)}</h2>
    <p class="wait" role="status">${['connecting', 'searching', 'joined'].includes(n.status) ? '<i class="dots" aria-hidden="true"></i>' : ''}${msg}</p>
    ${n.slow ? `<p class="err">Still looking. Check that your rival has the game open on the same link. Some office and school networks block direct connections: try mobile data or another Wi-Fi, or play pass and play on one device.</p>` : ''}
    ${n.error && n.status !== 'error' ? `<p class="err">${esc(n.error)}</p>` : ''}
    <button class="slip quiet" data-action="title">Cancel</button>
  </div>`;
}

function coverHTML() {
  const c = ui.cover;
  const v = table.view(-1);
  const name = v.names[c.seat];
  const other = v.names[1 - c.seat];
  const why = c.why === 'escalated' ? `${other} escalated. You decide: fold, or play on for double.` : `Turn ${v.round.turn} of ${TURNS}. ${other}, no peeking.`;
  return `<div class="cover own-${c.seat}">
    <p class="pass">Pass the device to</p>
    <h2>${jitter(name, c.seat + 2)}</h2>
    <p>${esc(why)}</p>
    <button class="slip primary" data-action="uncover">I’m ${esc(name)}: show my hand<kbd>Enter</kbd></button>
  </div>`;
}

function statusText(v) {
  const R = v.round;
  const rival = 1 - me();
  if (v.phase !== 'plan') return '';
  if (R.pending && R.pending.by === me()) return `Waiting for ${label(rival, v)} to answer your escalation…`;
  if (!R.legal.length) return `Nowhere to drop this turn: you pass.${R.rivalLocked ? '' : ` ${label(rival, v)} is choosing…`}`;
  if (myPlan(v)) return R.rivalLocked ? 'Both locked in.' : `Locked in. ${label(rival, v)} is choosing…`;
  const sel = R.hand.find((c) => c.uid === ui.selected);
  const rivalNote = R.rivalLocked ? ` ${label(rival, v)} has locked in.` : '';
  if (sel && ui.target !== null) return `Lock in your ${AGENT[sel.kind].name} for ${cityName(v, ui.target)}.${rivalNote}`;
  if (sel) return `${AGENT[sel.kind].name}: ${AGENT[sel.kind].text} Now pick a city.${rivalNote}`;
  return `Pick an agent from your hand.${rivalNote}`;
}

/** Gentle teaching lines for the first couple of matches. */
function hintText(v) {
  if (meta.matches > 2 || v.phase !== 'plan' || v.roundNo > 1) return '';
  const t = v.round.turn;
  if (v.roundNo === 0 && t === 1) return 'You and your rival both drop an agent in secret. Then the cards flip together.';
  if (v.roundNo === 0 && t === 2) return 'Higher total holds a city. Hold two of the three cities after six drops to win the round.';
  if (v.roundNo === 0 && t === 3) return 'Feeling strong? Escalate doubles the stake: your rival must fold or play on.';
  if (v.roundNo === 0 && t === TURNS) return 'Final turn: the stake doubles when the cards flip. Folding now costs only the current stake.';
  if (v.roundNo === 1 && t === 1) return 'Tap any card on the board to read what it does.';
  return '';
}

function inspectText(v) {
  if (!ui.inspect) return '';
  const all = [...v.round.cities.flatMap((c) => c.sides.flat()), ...v.round.hand];
  const cv = all.find((c) => c.uid === ui.inspect);
  if (!cv) return '';
  if (!cv.kind) {
    const vienna = cv.city !== null && v.round.cities[cv.city].id === 'vienna';
    return vienna ? 'Face-down agent in Vienna: it could be anything.' : `Face-down agent: a Sleeper (power ${AGENT.sleeper.power}) or a Tripwire (springs on the next agent to arrive).`;
  }
  const a = AGENT[cv.kind];
  const extra = [];
  if (cv.power !== null && cv.power !== a.power) extra.push(`power ${cv.power} right now`);
  if (cv.tricks === false && !['heavy', 'sleeper'].includes(cv.kind)) extra.push('tricks switched off here');
  if (cv.id0 && cv.id0 !== cv.kind) extra.push('an Impostor in disguise');
  return `${a.name} (${a.power}): ${a.text}${extra.length ? ` Now: ${extra.join(', ')}.` : ''}`;
}

function scorebarHTML(v, bottom) {
  const top = 1 - bottom;
  const R = v.round;
  const stake = R.stake;
  return `<div class="scorebar">
    <div class="side s-${top}"><span class="who">${esc(label(top, v))}</span><b class="score" data-score="${top}">${v.scores[top]}</b></div>
    <div class="mid">
      <span class="stake${stake > 1 ? ' hot' : ''}" title="Points this round is worth">Stake <b>${stake}</b>${v.phase === 'plan' ? `<small>${stake * 2} at the final flip</small>` : ''}</span>
      <span class="turn">${v.phase === 'plan' ? `Turn ${R.turn} of ${TURNS}` : `Round ${v.roundNo + 1}`} · first to ${v.target}</span>
    </div>
    <div class="side s-${bottom}"><b class="score" data-score="${bottom}">${v.scores[bottom]}</b><span class="who">${esc(label(bottom, v))}</span></div>
  </div>`;
}

function controlsHTML(v) {
  const R = v.round;
  if (v.phase !== 'plan' || ui.mode === 'pass' && ui.seat === null) return `<div class="controls"><p class="status">${esc(statusText(v))}</p></div>`;
  const canEsc = !R.escalated.some(Boolean) && !R.pending;
  const sel = ui.selected && ui.target !== null;
  const lockBtn = myPlan(v)
    ? `<button class="slip" data-action="unlock" ${R.rivalLocked || !R.plan ? 'disabled' : ''}>Take back<kbd>Esc</kbd></button>`
    : `<button class="slip primary${sel ? ' ready' : ''}" data-action="lock" ${sel ? '' : 'disabled'}>Lock in<kbd>Enter</kbd></button>`;
  return `<div class="controls">
    <p class="status">${esc(statusText(v))}</p>
    <div class="btns">
      <button class="slip esc" data-action="escalate" ${canEsc ? '' : 'disabled'}>Escalate<kbd>E</kbd></button>
      <button class="slip" data-action="fold">Fold<kbd>F</kbd></button>
      ${lockBtn}
    </div>
  </div>`;
}

function handHTML(v, disabled) {
  const R = v.round;
  if (ui.mode === 'pass' && ui.seat === null) return '<div class="hand empty" id="hand"></div>';
  const legalUids = new Set(R.legal.map((d) => d.uid));
  return `<div class="hand" id="hand" style="--n:${R.hand.length}" data-n="${R.hand.length}">${R.hand
    .map((cv, i) => cardHTML(cv, i, { selected: ui.selected === cv.uid, disabled: disabled || !!myPlan(v) || !legalUids.has(cv.uid) || v.phase !== 'plan' }))
    .join('')}</div>`;
}

function resultHTML(v, bottom) {
  const res = v.round.result;
  if (!res) return '';
  const R = v.round;
  const over = v.phase === 'match-over';
  const winnerName = res.winner === null ? null : label(res.winner, v);
  let head;
  if (res.folded !== null) head = `${label(res.folded, v)} ${ui.mode !== 'pass' && res.folded === me() ? 'fold' : 'folds'}`;
  else if (res.winner === null) head = 'Dead heat';
  else head = `${winnerName} ${ui.mode !== 'pass' && res.winner === me() ? 'take' : 'takes'} the round`;
  const lines = [];
  if (res.folded !== null) lines.push(`${label(1 - res.folded, v)} ${ui.mode !== 'pass' && 1 - res.folded === me() ? 'score' : 'scores'} ${res.points} (the stake).`);
  else {
    R.cities.forEach((c, ci) => {
      const w = res.cityWinners[ci];
      const t = res.totals[ci];
      lines.push(`<span class="city-line w-${w === null ? 'none' : w === bottom ? 'me' : 'them'}"><b>${esc(CITY[c.id].name)}</b> ${w === null ? 'nobody' : esc(label(w, v))} <small>${t[bottom]} to ${t[1 - bottom]}</small></span>`);
    });
    if (res.winner !== null) lines.push(`<span class="pts">+${res.points} to ${esc(label(res.winner, v))} <small>stake ${res.stake}, doubled on the final flip</small></span>`);
    else lines.push('<span class="pts">Nobody scores.</span>');
    if (res.monaco !== null && res.monaco !== undefined) lines.push(`<span class="pts">+1 Monaco bonus to ${esc(label(res.monaco, v))}</span>`);
  }
  const waiting = ui.mode === 'host' || ui.mode === 'guest' ? v.ready[me()] && !v.ready[1 - me()] : false;
  const btn = over
    ? `<button class="slip primary" data-action="final">Final report<kbd>Enter</kbd></button>`
    : waiting
      ? `<p class="wait"><i class="dots" aria-hidden="true"></i>Waiting for ${esc(label(1 - me(), v))}…</p>`
      : `<button class="slip primary" data-action="next">Next round<kbd>Enter</kbd></button>`;
  const key = `${v.roundNo}:${v.scores.join(',')}`;
  const enter = ui.resultShown !== key;
  ui.resultShown = key;
  return `<div class="result${enter ? ' enter' : ''}" role="dialog" aria-label="Round result">
    <h2>${jitter(head, v.roundNo + 3)}</h2>
    <div class="lines">${lines.map((l) => `<p>${l}</p>`).join('')}</div>
    <p class="tally">${esc(label(bottom, v))} ${v.scores[bottom]} · ${v.scores[1 - bottom]} ${esc(label(1 - bottom, v))}</p>
    ${btn}
  </div>`;
}

function renderPlay({ board = view(), hand = board, revealing = false, bottom = null } = {}) {
  const v = board;
  const b = bottom ?? (ui.mode === 'pass' ? (ui.seat ?? 0) : me());
  const R = v.round;
  const choosing = !!ui.selected && !myPlan(v) && v.phase === 'plan' && !revealing;
  const legalCities = choosing ? R.legal.filter((d) => d.uid === ui.selected).map((d) => d.city) : [];
  let ghost = null;
  if (!revealing && v.phase === 'plan') {
    const mine = myPlan(v);
    const planned = mine && !mine.pass ? mine : ui.selected && ui.target !== null ? { uid: ui.selected, city: ui.target } : null;
    const cv = planned && R.hand.find((c) => c.uid === planned.uid);
    if (cv) ghost = { city: planned.city, cv: { ...cv, owner: b, power: AGENT[cv.kind].power, locked: !!mine } };
  }
  const settled = v.phase !== 'plan' && R.result && R.result.cityWinners;
  const cities = R.cities
    .map((_, ci) => {
      let html = cityHTML(v, ci, b, { ghost, choosing, legalCities });
      if (settled) {
        const w = R.result.cityWinners[ci];
        html = html.replace('class="city ', `class="city ${w === null ? 'won-none' : w === b ? 'won-me' : 'won-them'} `);
      }
      return html;
    })
    .join('');
  const colours = ui.mode === 'pass' ? ['red', 'teal'] : me() === 0 ? ['red', 'teal'] : ['teal', 'red'];
  const caption = revealing ? ui.caption : ui.caption || inspectText(v) || hintText(v);
  const peerGone = ui.net?.peer === 'gone';
  $('#screen').innerHTML = `<div class="play c0-${colours[0]} c1-${colours[1]}${revealing ? ' revealing' : ''}" data-bottom="${b}">
    ${peerGone ? `<p class="banner" role="alert">${ui.mode === 'host' ? 'Your rival lost connection. The game waits for them to come back.' : 'The host lost connection. Waiting for them to come back.'} <button class="link" data-action="title">Leave</button></p>` : ''}
    ${scorebarHTML(v, b)}
    <div class="board${myPlan(v) ? ' locked' : ''}" id="board">${cities}</div>
    <p class="ticker" id="ticker" role="status">${esc(caption)}</p>
    ${revealing ? `<div class="controls"><p class="status">Flip!</p><div class="btns"><button class="slip quiet" data-action="skip">Skip<kbd>Space</kbd></button></div></div>` : controlsHTML(v)}
    ${handHTML(hand, revealing)}
    ${!revealing && v.phase !== 'plan' ? resultHTML(v, b) : ''}
  </div>`;
}

function overHTML() {
  const v = view();
  const bottom = ui.mode === 'pass' ? 0 : me();
  const won = v.winner === bottom;
  const head = ui.mode === 'pass' ? `${v.names[v.winner]} wins` : won ? 'Mission accomplished' : 'Burned';
  const sub = ui.mode === 'pass' ? 'The other spymaster is reassigned to a lighthouse.' : won ? `You beat ${label(1 - bottom, v)} ${v.scores[bottom]} to ${v.scores[1 - bottom]}.` : `${label(1 - bottom, v)} beat you ${v.scores[1 - bottom]} to ${v.scores[bottom]}.`;
  const rounds = v.history
    .map((h, i) => {
      const who = h.winner === null ? 'nobody' : label(h.winner, v);
      const how = h.folded !== null ? `${label(h.folded, v)} folded` : h.winner === null ? 'dead heat' : `${h.cityWinners.filter((w) => w === h.winner).length} of 3 cities`;
      return `<li class="w-${h.winner === null ? 'none' : h.winner === bottom ? 'me' : 'them'}"><span class="n">${i + 1}</span><span class="cities">${h.cities.map((c) => esc(CITY[c].name)).join(', ')}</span><span class="how">${esc(how)}</span><b>${h.winner === null ? '—' : `+${h.points}`} ${esc(who)}</b></li>`;
    })
    .join('');
  const ri = ui.rival ? RIVALS.findIndex((r) => r.id === ui.rival.id) : -1;
  const nextRival = ui.mode === 'solo' && won && ri >= 0 && ri < RIVALS.length - 1 ? RIVALS[ri + 1] : null;
  const rematchWait = (ui.mode === 'host' || ui.mode === 'guest') && v.rematch[me()] && !v.rematch[1 - me()];
  const rivalWants = (ui.mode === 'host' || ui.mode === 'guest') && v.rematch[1 - me()] && !v.rematch[me()];
  return `<div class="over ${won || ui.mode === 'pass' ? 'won' : 'lost'}">
    <div class="dossier">
      <p class="stamp-line">Dossier · ${esc(v.names[0])} vs ${esc(v.names[1])}</p>
      <h2>${jitter(head, 9)}</h2>
      <p class="sub">${esc(sub)}</p>
      <p class="final"><span>${esc(label(bottom, v))}</span><b>${v.scores[bottom]}</b><i>to</i><b>${v.scores[1 - bottom]}</b><span>${esc(label(1 - bottom, v))}</span></p>
      <ol class="rounds">${rounds}</ol>
      ${ui.mode === 'solo' && won && ri === RIVALS.length - 1 ? '<p class="sub">You beat Control. There is nobody left to fool.</p>' : ''}
    </div>
    <div class="actions">
      ${nextRival ? `<button class="slip primary" data-action="rival" data-id="${nextRival.id}">Next rival: ${esc(nextRival.name)}</button>` : ''}
      ${rematchWait ? `<p class="wait"><i class="dots" aria-hidden="true"></i>Waiting for ${esc(label(1 - me(), v))} to accept…</p>` : `<button class="slip ${nextRival ? '' : 'primary'}" data-action="rematch">${rivalWants ? 'Accept rematch' : 'Rematch'}</button>`}
      <button class="slip quiet" data-action="title">Title screen</button>
    </div>
  </div>`;
}

function helpHTML() {
  return `<div class="modal" data-action="close-modal"><div class="sheet" role="dialog" aria-label="How to play" data-stop>
    <h2>${jitter('How to play', 1)}</h2>
    <ol class="rules">
      <li>Three cities are up for grabs. Each turn, you and your rival secretly drop one agent into a city, then both cards flip together.</li>
      <li>After six drops, whoever has the higher total in a city holds it. Hold two of the three to win the round.</li>
      <li>Agents have tricks. Flip tricks fire as the card turns over; the player with initiative (it alternates each turn) goes first. Face-down agents have no tricks, except the Tripwire.</li>
      <li>Escalate once per round, by whoever calls it first, to double the stake. Your rival must fold (giving you the current stake) or play on. You can fold any time. If the round reaches the final flip, the stake doubles again.</li>
      <li>First to 10 points wins the match.</li>
    </ol>
    <h3>Agents</h3>
    <ul class="agents">${AGENTS.map((a) => `<li><span class="art">${agentSVG(a.id)}</span><b>${esc(a.name)} <i>${a.power}</i></b><span>${esc(a.text)}</span></li>`).join('')}</ul>
    <h3>Cities</h3>
    <ul class="cities">${CITIES.map((c) => `<li><b>${esc(c.name)}</b> ${esc(c.rule)}</li>`).join('')}</ul>
    <h3>Keys</h3>
    <p>1–7 pick an agent · A S D pick a city · Enter locks in · Esc takes it back · E escalates · F folds · Space skips a reveal · M sound</p>
    <button class="slip primary" data-action="close-modal">Back to the table</button>
  </div></div>`;
}

function modalHTML() {
  const v = view();
  if (ui.modal === 'help') return helpHTML();
  if (!v) return '';
  const rival = 1 - me();
  if (ui.modal === 'fold') {
    const gets = v.round.stake;
    return `<div class="modal" data-action="close-modal"><div class="sheet small" role="dialog" aria-label="Fold" data-stop>
      <h2>${jitter('Fold?', 2)}</h2>
      <p>${esc(label(rival, v))} ${ui.mode === 'pass' ? 'takes' : 'takes'} ${gets} point${gets === 1 ? '' : 's'} and the round ends.</p>
      <div class="btns"><button class="slip" data-action="confirm-fold">Fold<kbd>F</kbd></button><button class="slip primary" data-action="close-modal">Keep playing<kbd>Esc</kbd></button></div>
    </div></div>`;
  }
  if (ui.modal === 'quit') {
    return `<div class="modal" data-action="close-modal"><div class="sheet small" role="dialog" aria-label="Leave" data-stop>
      <h2>${jitter('Leave the table?', 4)}</h2>
      <p>${ui.mode === 'host' || ui.mode === 'guest' ? 'The online match ends for both of you.' : 'Your match is saved; you can continue it from the title screen.'}</p>
      <div class="btns"><button class="slip" data-action="title">Leave</button><button class="slip primary" data-action="close-modal">Stay</button></div>
    </div></div>`;
  }
  const R = v.round;
  if (v.phase === 'plan' && R.pending && R.pending.by === rival && (ui.mode !== 'pass' || ui.seat === 1 - R.pending.by)) {
    return `<div class="modal hot"><div class="sheet small" role="dialog" aria-label="Escalation">
      <h2>${jitter(`${label(rival, v)} escalates`, 6)}</h2>
      <p>Play on and this round is worth <b>${R.stake * 2}</b>, or <b>${R.stake * 4}</b> if it reaches the final flip. Fold now and ${esc(label(rival, v))} takes <b>${R.stake}</b>.</p>
      <div class="btns"><button class="slip primary" data-action="respond" data-accept="1">Play on<kbd>Enter</kbd></button><button class="slip" data-action="respond" data-accept="0">Fold<kbd>F</kbd></button></div>
    </div></div>`;
  }
  return '';
}

function render() {
  const s = ui.screen;
  if (!$('#top')) {
    app.innerHTML = `<div id="top"></div><main id="screen"></main><div id="modal-root"></div>`;
  }
  $('#top').innerHTML = renderTop();
  homeLink({ parent: $('#top .home-slot') });
  document.body.dataset.screen = s;
  document.body.dataset.flip = ui.mode === 'guest' ? '1' : '0';
  if (s === 'title') $('#screen').innerHTML = titleHTML();
  else if (s === 'rivals') $('#screen').innerHTML = rivalsHTML();
  else if (s === 'lobby') $('#screen').innerHTML = lobbyHTML();
  else if (s === 'cover') $('#screen').innerHTML = coverHTML();
  else if (s === 'over') $('#screen').innerHTML = view() ? overHTML() : '';
  else if (s === 'play' && view()) {
    if (!ui.animating) renderPlay();
  }
  const m = ui.screen === 'play' || ui.modal === 'help' ? modalHTML() : '';
  $('#modal-root').innerHTML = m;
  const focus = $('#modal-root .slip.primary');
  if (focus && document.activeElement?.closest?.('#modal-root') === null) focus.focus({ preventScroll: true });
}

// ── QR code and invite sharing ──────────────────────────────────────────────

async function makeQR() {
  const net = ui.net;
  if (!net) return;
  try {
    const { renderSVG } = await import('https://cdn.jsdelivr.net/npm/uqr@0.1.3/+esm');
    if (ui.net !== net) return;
    net.qr = renderSVG(inviteLink(), { border: 1, whiteColor: '#f0e2c4', blackColor: '#1d1a17' });
    if (ui.screen === 'lobby') render();
  } catch {
    /* the link and code still work */
  }
}

// ── input ───────────────────────────────────────────────────────────────────

function pick(uid) {
  const v = view();
  if (!v || v.phase !== 'plan' || myPlan(v) || ui.animating) return;
  if (!v.round.legal.some((d) => d.uid === uid)) return;
  ui.inspect = null;
  if (ui.selected === uid) {
    ui.selected = null;
    ui.target = null;
  } else {
    ui.selected = uid;
    const cities = v.round.legal.filter((d) => d.uid === uid).map((d) => d.city);
    if (ui.target !== null && !cities.includes(ui.target)) ui.target = null;
    if (cities.length === 1) ui.target = cities[0];
  }
  audio.pick();
  render();
}

function chooseCity(ci) {
  const v = view();
  if (!v || !ui.selected || myPlan(v) || ui.animating) return;
  if (!v.round.legal.some((d) => d.uid === ui.selected && d.city === ci)) return;
  ui.target = ci;
  audio.place();
  render();
}

function lockIn() {
  const v = view();
  if (!v || v.phase !== 'plan' || myPlan(v) || !ui.selected || ui.target === null) return;
  const plan = { a: 'lock', uid: ui.selected, city: ui.target };
  audio.lock();
  ui.selected = null;
  ui.target = null;
  if (ui.mode === 'guest') ui.sentPlan = { uid: plan.uid, city: plan.city, round: v.roundNo, turn: v.round.turn };
  act(plan);
  if (ui.mode === 'guest') render();
}

const actions = {
  rivals: () => {
    ui.screen = 'rivals';
    render();
  },
  rival: (el) => startSolo(el.dataset.id),
  continue: () => {
    const m = saved.get('match', null);
    if (!m) return;
    if (m.mode === 'pass') startPass(m.table);
    else startSolo(m.rival, m.table);
  },
  host: () => startHost(),
  pass: () => startPass(),
  title: () => {
    leaveMatch({ keepSave: true });
    resetMatchUi();
    ui.mode = null;
    ui.screen = 'title';
    render();
  },
  quit: () => {
    ui.modal = 'quit';
    render();
  },
  help: () => {
    ui.modal = 'help';
    render();
  },
  'close-modal': () => {
    ui.modal = null;
    render();
  },
  rename: () => {
    meta.codename = pickCodename(meta.codename);
    saveMeta();
    render();
  },
  mute: () => {
    sfx.toggleMute();
    render();
  },
  music: () => {
    audio.toggleMusic();
    render();
  },
  'copy-link': async () => {
    try {
      await navigator.clipboard.writeText(inviteLink());
      toast('Link copied. Send it to your rival.');
    } catch {
      $('.invite input')?.select();
      toast('Select the link and copy it.');
    }
  },
  'share-link': () => navigator.share?.({ title: 'Dead Drop', text: 'Play Dead Drop with me', url: inviteLink() }).catch(() => {}),
  uncover: () => {
    if (!ui.cover) return;
    ui.seat = ui.cover.seat;
    ui.cover = null;
    ui.screen = 'play';
    ui.view = table.view(ui.seat);
    audio.place();
    render();
  },
  pick: (el) => pick(el.dataset.uid),
  city: (el) => chooseCity(Number(el.dataset.city)),
  inspect: (el) => {
    if (ui.animating) return;
    ui.inspect = ui.inspect === el.dataset.uid ? null : el.dataset.uid;
    ui.caption = '';
    render();
  },
  lock: lockIn,
  unlock: () => {
    ui.sentPlan = null;
    if (act({ a: 'unlock' })) audio.unlock();
  },
  escalate: () => {
    const v = view();
    if (!v || v.phase !== 'plan' || v.round.escalated.some(Boolean) || v.round.pending) return;
    act({ a: 'escalate' });
  },
  fold: () => {
    const v = view();
    if (!v || v.phase !== 'plan') return;
    ui.modal = 'fold';
    render();
  },
  'confirm-fold': () => {
    ui.modal = null;
    act({ a: 'fold' });
    render();
  },
  respond: (el) => {
    act({ a: 'respond', accept: el.dataset.accept === '1' });
    render();
  },
  next: () => {
    ui.caption = '';
    act({ a: 'next' });
    render();
  },
  final: () => {
    ui.screen = 'over';
    render();
  },
  rematch: () => {
    act({ a: 'rematch' });
    if (ui.mode === 'solo' || ui.mode === 'pass') {
      ui.shownSeq = 0;
      ui.view = null;
      ui.screen = 'play';
      recordPlay(SLUG);
      meta.matches++;
      saveMeta();
      onUpdate();
    } else render();
  },
  skip: () => {
    ui.skip = true;
  },
};

document.addEventListener('click', (ev) => {
  if (ui.animating && !ev.target.closest('.top')) {
    ui.skip = true;
    return;
  }
  const el = ev.target.closest('[data-action]');
  if (!el || el.disabled) return;
  if (el.dataset.action === 'close-modal' && ev.target.closest('[data-stop]') && ev.target.closest('[data-action]') !== el) return;
  if (el.classList.contains('modal') && ev.target !== el) return;
  actions[el.dataset.action]?.(el, ev);
});

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('[data-form="join"]');
  if (!form) return;
  ev.preventDefault();
  const code = cleanCode(new FormData(form).get('code'));
  if (code.length < 4) {
    toast('Room codes are six letters and numbers.');
    return;
  }
  startGuest(code);
});

document.addEventListener('keydown', (ev) => {
  if (ev.target.closest?.('input, textarea')) return;
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const k = ev.key;
  if (ui.animating) {
    if (k === ' ' || k === 'Enter' || k === 'Escape') {
      ui.skip = true;
      ev.preventDefault();
    }
    return;
  }
  if (k === 'm' || k === 'M') return actions.mute();
  if (k === '?') return actions.help();
  if (ui.modal) {
    if (k === 'Escape') {
      ev.preventDefault();
      if (ui.modal === 'help' || ui.modal === 'fold' || ui.modal === 'quit') actions['close-modal']();
    }
    if (ui.modal === 'fold' && (k === 'f' || k === 'F' || k === 'Enter')) actions['confirm-fold']();
    return;
  }
  if (ui.screen === 'cover' && (k === 'Enter' || k === ' ')) {
    ev.preventDefault();
    return actions.uncover();
  }
  if (ui.screen !== 'play') return;
  const v = view();
  if (!v) return;
  const R = v.round;
  if (v.phase === 'plan' && R.pending && R.pending.by !== me() && (ui.mode !== 'pass' || ui.seat === 1 - R.pending.by)) {
    if (k === 'Enter') act({ a: 'respond', accept: true });
    if (k === 'f' || k === 'F') act({ a: 'respond', accept: false });
    return;
  }
  if (v.phase !== 'plan') {
    if (k === 'Enter') {
      ev.preventDefault();
      if (v.phase === 'match-over') actions.final();
      else actions.next();
    }
    return;
  }
  if (/^[1-9]$/.test(k) && R.hand[Number(k) - 1]) return pick(R.hand[Number(k) - 1].uid);
  const ci = { a: 0, s: 1, d: 2, A: 0, S: 1, D: 2 }[k];
  if (ci !== undefined) return chooseCity(ci);
  if (k === 'Enter') {
    ev.preventDefault();
    return lockIn();
  }
  if (k === 'Escape' || k === 'Backspace') {
    if (R.plan) return actions.unlock();
    ui.selected = null;
    ui.target = null;
    ui.inspect = null;
    return render();
  }
  if (k === 'e' || k === 'E') return actions.escalate();
  if (k === 'f' || k === 'F') return actions.fold();
});

onHidden(() => audio.music(false));
const resumeMusic = () => {
  if (!document.hidden && (ui.screen === 'play' || ui.screen === 'cover')) audio.music(true);
};
document.addEventListener('visibilitychange', resumeMusic);
window.addEventListener('focus', resumeMusic);

// ── start ───────────────────────────────────────────────────────────────────

function route() {
  const h = new URLSearchParams(location.hash.slice(1));
  const join = cleanCode(h.get('join'));
  const host = cleanCode(h.get('host'));
  if (join) return startGuest(join);
  if (host) {
    const s = saved.get(`host-${host}`, null);
    return startHost({ code: host, resume: s && Date.now() - s.at < 6 * 3600e3 ? s.table : null });
  }
  ui.screen = 'title';
  render();
}
route();

// ── debug hooks (window.__game) ─────────────────────────────────────────────

/**
 * Both seats make a drop for `turns` turns, straight through the table: no animation, and the
 * screen jumps to the result. The computer rival sits back down afterwards.
 */
function quickTurns(turns, rng = Math.random) {
  bot?.stop();
  unwatch?.();
  for (let t = 0; t < turns && table.state.phase === 'plan'; t++) {
    if (table.state.round.pending) table.act(1 - table.state.round.pending.by, { a: 'respond', accept: true });
    for (const seat of [0, 1]) {
      const v = table.view(seat);
      if (!v.round.plan && v.round.legal.length) {
        const d = v.round.legal[Math.floor(rng() * v.round.legal.length)];
        table.act(seat, { a: 'lock', uid: d.uid, city: d.city });
      }
    }
  }
  watch(table);
  ui.shownSeq = table.turnSeq;
  ui.view = latestView();
  if (ui.mode === 'solo') bot = attachBot(table, 1, ui.rival, { hold: () => ui.updating });
  render();
}

markReady({
  ui,
  get table() {
    return table;
  },
  get state() {
    return table?.state;
  },
  get view() {
    return ui.view;
  },
  meta,
  startSolo: (id = 'wren') => startSolo(id),
  startPass: () => startPass(),
  startHost: (code) => startHost({ code }),
  startGuest: (code) => startGuest(code),
  quickTurns,
  /** Finish the round instantly from both seats' first legal drops. */
  finishRound() {
    quickTurns(TURNS);
    onUpdate();
  },
  skipAnimations: (on = true) => {
    ui.skip = on;
  },
  prepareThumbnail() {
    let s = 2;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    startSolo('countess');
    bot?.stop();
    table.state = createTable({ seed: 'thumb-7', cities: ['vienna', 'istanbul', 'monaco'] }).state;
    table.names = [meta.codename, 'The Countess'];
    quickTurns(3, rng);
    bot?.stop();
    table.state.round.stake = 2;
    table.state.round.escalated = [true, false];
    ui.screen = 'play';
    ui.view = table.view(0);
    ui.selected = ui.view.round.legal[0]?.uid ?? null;
    ui.target = ui.view.round.legal[0]?.city ?? null;
    ui.caption = 'Double Agent slips across to Istanbul.';
    render();
  },
});
