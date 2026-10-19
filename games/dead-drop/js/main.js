// Dead Drop UI: screens, the four ways to play (computer, pass and play, host, guest), input,
// and the reveal flow that animates each turn's events before re-rendering from the new view.
import { homeLink, markReady, onHidden, recordBest, recordPlay, reducedMotion, store } from '../../../shared/arcade.js';
import { createSfx } from '../../../shared/sfx.js';
import { shake, toast as cgToast } from '../../../shared/juice.js';
import { cleanCode, joinRoom, roomCode } from '../../../shared/net.js';
import { AGENT, AGENTS, CITIES, CITY, CODENAMES, RIVALS, SEAT_NAMES, TURNS } from './data.js';
import { rivalsOf, seatCount } from './engine.js';
import { attachBot, createTable, guestSession, hostSession, restoreTable } from './session.js';
import { cardHTML, chipHTML, cityHTML, esc, FAST, playEvents, REVEAL_GUARD_MS, revealTap } from './board.js';
import { agentSVG, citySVG, spySVG } from './art.js';
import { createAudio } from './audio.js';
import { levelFor } from './music.js';
import { countMatch, countWin } from './meta.js';

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
  // Reveal pacing (see wait()): the reveal started at revealAt (performance.now()) and plays at
  // speed 1 or FAST; skip runs the rest of it out at once. alwaysSkip (__game.skipAnimations)
  // skips every reveal for the rest of the session.
  revealAt: 0,
  speed: 1,
  skip: false,
  alwaysSkip: false,
  peek: false, // See the board: the round result shrinks to a strip so the final board shows
  modal: null, // help | fold | quit (the escalation prompt is .modal.hot, drawn from the view; it is not ui.modal)
  helpTab: 'rules', // rules | agents | cities | keys: the help sheet's open tab, kept between openings
  cover: null, // pass and play: { seat, why }
  prevSpectator: null,
  caption: '',
  inspect: null,
  net: null, // online: { role, code, status, room, session, peer: null | 'here' | 'gone' (lost connection) | 'left' (said bye), leftName }
  rival: null,
  flashSeen: null,
  updating: false, // onUpdate() in progress (reveal or flash playing)
  matchDone: false,
  resultShown: null, // round result already shown (its entrance animation plays once)
  sentPlan: null, // guest: the drop we sent, shown until the host's view confirms it
  drag: null, // a card being dragged to a city: null or { uid, ghost, over } (over: the city index under the pointer, or null)
  card: null, // the title card or flash on screen (showCard): null or { el, at, skip(), hold() }
  roundKey: null, // `${matchId}:${roundNo}` of the last round whose title card was due
  finalKey: null, // the same for the last round whose final turn's card was due
  stampLand: false, // the final card has just gone: the ×2 stamp lands on the stake at the next render
  initShown: null, // the seat whose First flip token was last drawn (it flips across when this changes)
};
let table = null;
let bot = null;
let unwatch = null;
let modalShown = ''; // the HTML last put in #modal-root

/**
 * The reveal's clock. wait(ms) resolves after ms / ui.speed, or at once when ui.skip is set or
 * no reveal is running any more (leaveMatch ended it). dur(ms) is the same for a WAAPI duration.
 * After changing ui.speed, ui.skip or ui.animating, call pace(): every wait in flight is
 * re-timed, so a speed-up or a skip lands now rather than when the current beat ends.
 * A quick wait resolves on the spot, with no timer: a hidden tab holds every timer back to about
 * once a second, so a skipped reveal of 30 waits would otherwise take half a minute.
 */
const waits = new Set();
const quick = () => ui.skip || !ui.animating;
const dur = (ms) => (quick() ? 1 : ms / ui.speed);
function arm(w) {
  if (quick()) {
    // Its awaiting code runs as a microtask, after whatever called wait() or pace() returns.
    waits.delete(w);
    w.resolve();
    return;
  }
  w.from = performance.now();
  w.speed = ui.speed;
  w.timer = setTimeout(() => {
    waits.delete(w);
    w.resolve();
  }, w.left / ui.speed);
}
function wait(ms) {
  return new Promise((resolve) => {
    const w = { left: ms, resolve };
    waits.add(w);
    arm(w);
  });
}
function pace({ speed = ui.speed, skip = ui.skip } = {}) {
  ui.speed = speed;
  ui.skip = skip;
  for (const w of waits) {
    clearTimeout(w.timer);
    w.left = Math.max(0, w.left - (performance.now() - w.from) * w.speed);
    arm(w);
  }
}
const toast = (msg) => cgToast(msg, { className: 'toast' });
const view = () => ui.view;
const me = () => (ui.mode === 'pass' ? (ui.seat ?? 0) : ui.mode === 'guest' ? 1 : 0);
const label = (seat, v = view()) => {
  if (!v) return '';
  if (ui.mode !== 'pass' && seat === me()) return 'You';
  return v.names[seat];
};
/** Every seat at the table, for a state or a view. */
const allSeats = (x) => Array.from({ length: seatCount(x) }, (_, s) => s);
/** The other seats, in table order after `seat`. */
const rivals = (v = view(), seat = me()) => rivalsOf(seatCount(v), seat);
/**
 * The other side of a two-player screen. Phase 3 replaces each use with a lane, or a list, per
 * rival; searching for `foe(` finds every two-player assumption in the UI.
 */
const foe = (v = view(), seat = me()) => rivals(v, seat)[0];
/** One colour name per seat: pass and play is by seat; otherwise you are red and rivals take teal, cobalt, plum in order. */
const seatColours = (v = view()) => {
  const all = ['red', 'teal', 'cobalt', 'plum'];
  if (ui.mode === 'pass') return all.slice(0, seatCount(v));
  const out = [];
  out[me()] = 'red';
  rivals(v).forEach((s, i) => (out[s] = all[i + 1]));
  return out;
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

/**
 * The one place per-match UI state is cleared: everything a new match (a fresh start or a
 * rematch in any mode) must not inherit from the last one. Add new per-match fields here.
 */
function freshMatchUi() {
  ui.shownSeq = 0;
  ui.view = null;
  ui.selected = null;
  ui.target = null;
  ui.modal = null;
  ui.cover = null;
  ui.caption = '';
  ui.inspect = null;
  ui.flashSeen = null;
  ui.prevSpectator = null;
  ui.matchDone = false;
  ui.resultShown = null;
  ui.sentPlan = null;
  ui.peek = false;
  ui.speed = 1;
  ui.skip = ui.alwaysSkip;
  ui.roundKey = null;
  ui.finalKey = null;
  ui.stampLand = false;
  ui.initShown = null;
  cancelDrag();
  clearOverlays();
}

/** Leaving a mode altogether: a fresh match screen, no host view kept, no computer rival. */
function resetMatchUi() {
  freshMatchUi();
  ui.remote = null;
  bot?.stop();
  bot = null;
}

/**
 * Rebuild a saved table into `table` (call once ui.mode, ui.rival and ui.net are set). A save
 * from before match ids gets a new id from restoreTable: save it straight back so the id stays
 * the same across reloads, and mark it seen without counting, since it was counted when it began.
 */
function restoreSaved(json) {
  table = restoreTable(json);
  if (json.matchId === table.matchId) return;
  persist();
  const matches = meta.matches;
  countMatch(meta, table.matchId);
  meta.matches = matches;
  saveMeta();
}

/** Count a match the first time this browser sees its id, so reloads and rejoins never recount it. */
function countOnce(id) {
  if (id && countMatch(meta, id)) {
    recordPlay(SLUG);
    saveMeta();
  }
}

function startSolo(rivalId, resume = null) {
  leaveMatch({ keepSave: !!resume });
  resetMatchUi();
  ui.mode = 'solo';
  ui.rival = RIVALS.find((r) => r.id === rivalId) || RIVALS[0];
  if (resume) restoreSaved(resume);
  else table = createTable({ names: [meta.codename, ui.rival.name] });
  watch(table);
  beginMatch();
  // Seated once the table is up: the round's title card holds the rival (ui.updating) from its
  // very first move, as it does in every later round.
  bot = attachBot(table, 1, ui.rival, { hold: () => ui.updating });
}

function startPass(resume = null) {
  leaveMatch({ keepSave: !!resume });
  resetMatchUi();
  ui.mode = 'pass';
  ui.rival = null;
  if (resume) restoreSaved(resume);
  else table = createTable({ names: SEAT_NAMES.slice(0, 2) });
  watch(table);
  ui.seat = null;
  beginMatch();
}

async function startHost({ code = roomCode(), resume = null } = {}) {
  leaveMatch();
  resetMatchUi();
  ui.mode = 'host';
  const net = (ui.net = { role: 'host', code, status: 'connecting', peer: null, leftName: null, error: null, qr: null });
  ui.screen = 'lobby';
  history.replaceState(null, '', `#host=${code}`);
  render();
  if (resume) restoreSaved(resume);
  else table = createTable({ names: [meta.codename, 'Your rival'] });
  table.names[0] = meta.codename;
  watch(table);
  let room;
  try {
    room = await joinRoom({ slug: SLUG, code, transport: NET });
  } catch (err) {
    if (ui.net !== net) return;
    net.status = 'error';
    net.error = 'Couldn’t load the connection library. Check your internet connection and try again.';
    render();
    return;
  }
  // Left (or started over) while the room was opening.
  if (ui.net !== net) return room.leave();
  net.room = room;
  room.onError = (m) => {
    if (ui.net !== net) return;
    net.error = m;
    render();
  };
  net.session = hostSession({
    room,
    table,
    onStatus: (s, name) => {
      if (ui.net !== net) return;
      if (s === 'joined' || s === 'back') {
        net.peer = 'here';
        if (ui.screen === 'lobby') return beginMatch();
        toast(`${name} is back.`);
      } else if (s === 'left') net.peer = 'gone';
      else if (s === 'bye') {
        net.peer = 'left';
        net.leftName = name;
      }
      render();
    },
  });
  net.status = 'waiting';
  render();
  makeQR();
}

async function startGuest(code) {
  leaveMatch();
  resetMatchUi();
  ui.mode = 'guest';
  const net = (ui.net = { role: 'guest', code, status: 'connecting', peer: null, leftName: null, error: null, slow: false });
  ui.screen = 'lobby';
  history.replaceState(null, '', `#join=${code}`);
  render();
  let room;
  try {
    room = await joinRoom({ slug: SLUG, code, transport: NET });
  } catch {
    if (ui.net !== net) return;
    net.status = 'error';
    net.error = 'Couldn’t load the connection library. Check your internet connection and try again.';
    render();
    return;
  }
  // Left (or started over) while the room was opening.
  if (ui.net !== net) return room.leave();
  net.room = room;
  room.onError = (m) => {
    if (ui.net !== net) return;
    net.error = m;
    render();
  };
  net.session = guestSession({
    room,
    name: meta.codename,
    token: meta.token,
    onView: (v) => {
      // A goodbye is still on its way out: views from the old room no longer belong on screen.
      if (ui.net !== net) return;
      ui.remote = v;
      if (ui.screen === 'lobby') beginMatch();
      else onUpdate();
    },
    onStatus: (s, name) => {
      if (ui.net !== net) return;
      if (s === 'joined') {
        net.peer = 'here';
        net.status = 'joined';
        if (ui.screen === 'play') toast(`Back in ${name}’s game.`);
      } else if (s === 'left') net.peer = 'gone';
      else if (s === 'bye') {
        net.peer = 'left';
        net.leftName = name;
      } else if (s === 'full' || s === 'version') net.status = s;
      render();
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

/** Bookkeeping as a match comes on screen: count it (once per match id). */
function matchStarts(id) {
  countOnce(id);
}

/** The first view of a match (a new one or a resumed one) is ready: show the table. */
function beginMatch() {
  ui.screen = 'play';
  matchStarts(latestView()?.matchId);
  onUpdate();
}

/** Stop the current match: bot, network room, saved solo game (unless resuming it). */
function leaveMatch({ keepSave = false } = {}) {
  // A reveal still playing is over. With ui.animating false its waits are zero (wait()), so it
  // runs out (and releases ui.updating) at once even after freshMatchUi() resets ui.skip for the
  // next match, and it neither paints nor sounds (animateTurn).
  if (ui.animating) {
    ui.animating = false;
    pace();
  }
  // Flashes and title cards go with the table; a card's promise resolves, so nothing waits on it.
  clearOverlays();
  bot?.stop();
  bot = null;
  unwatch?.();
  unwatch = null;
  const { room, session } = ui.net || {};
  ui.net = null;
  // Say goodbye before leaving the room, so the other side reads "left the table", not a lost
  // connection. bye() settles within 400 ms even if the message never goes out.
  if (room) Promise.resolve(session?.bye()).finally(() => (session ? session.close() : room.leave()));
  if (!keepSave && (ui.mode === 'solo' || ui.mode === 'pass') && table && table.state.phase === 'match-over') saved.remove('match');
  table = null;
  audio.level(0);
  audio.hush(false);
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

function act(a) {
  if (ui.mode === 'guest') return ui.net?.session?.act(a);
  if (!table) return false;
  if (ui.mode === 'pass') {
    if (a.a === 'next' || a.a === 'rematch') return allSeats(table.state).reduce((ok, s) => table.act(s, a) | ok, 0);
    ui.prevSpectator = table.view(-1);
    return table.act(ui.seat, a);
  }
  if (ui.mode === 'solo' && a.a === 'rematch') return allSeats(table.state).reduce((ok, s) => table.act(s, a) | ok, 0);
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
    await showLatest();
  } finally {
    ui.updating = false;
  }
  render();
  if (ui.dirty) {
    ui.dirty = false;
    onUpdate();
  }
}

/** One pass of onUpdate(): bring the screen up to the latest view, animating what happened. */
async function showLatest() {
  if (ui.mode === 'pass' && table && table.turnSeq > ui.shownSeq) ui.seat = null;
  let v = latestView();
  if (!v) return;
  // A new match id is a rematch (in every mode): leave the dossier for a clean table.
  if (ui.view && v.matchId !== ui.view.matchId) {
    freshMatchUi();
    ui.screen = 'play';
    matchStarts(v.matchId);
  }
  // See the board belongs to one round's result: the next round's opens in full.
  if (ui.view && v.roundNo !== ui.view.roundNo) ui.peek = false;
  const matchId = v.matchId;
  // After every await, read the latest view again. If a new match began meanwhile, stop here
  // without showing it: the next pass (ui.dirty) sees the new id and starts it cleanly.
  const reread = () => {
    v = latestView();
    if (v && v.matchId === matchId) return true;
    if (v) ui.dirty = true;
    return false;
  };
  // After a flash or a title card, stop as well if a turn resolved meanwhile (the rival locked in
  // while it was up; this player can't, since a card or flash takes every tap and key). The board
  // on screen (ui.view) is still the one from before that turn, so the next pass (ui.dirty)
  // reveals it from there instead of jumping to the new view unrevealed.
  const upToDate = () => {
    if (!reread()) return false;
    if (v.turnSeq <= ui.shownSeq) return true;
    ui.dirty = true;
    return false;
  };
  const prev = ui.view;
  if (v.turnSeq > ui.shownSeq && prev && v.round.events.length) {
    ui.shownSeq = v.turnSeq;
    ui.selected = null;
    ui.target = null;
    ui.inspect = null;
    const from = ui.mode === 'pass' && ui.prevSpectator ? ui.prevSpectator : prev;
    await animateTurn(from, v);
    if (!reread()) return;
  }
  ui.shownSeq = Math.max(ui.shownSeq, v.turnSeq);
  // An escalation just landed: flash it once.
  const pend = v.round.pending;
  if (pend && v.phase === 'plan' && ui.flashSeen !== `${v.roundNo}-${pend.by}`) {
    ui.flashSeen = `${v.roundNo}-${pend.by}`;
    ui.view = v;
    render();
    await flashEscalate(v, pend.by);
    if (!upToDate()) return;
  }
  const folded = v.round.result?.folded;
  if (ui.view && ui.view.phase === 'plan' && v.phase !== 'plan' && folded !== null && folded !== undefined && v.roundNo === ui.view.roundNo) {
    ui.view = v;
    render();
    await flashFold(v, folded);
    if (!upToDate()) return;
  }
  // A new round opens on its title card, once per round. The new table goes up behind it, and
  // whatever arrived while it showed (a rival locking in, say) is read afterwards.
  const roundKey = `${v.matchId}:${v.roundNo}`;
  if (v.phase === 'plan' && v.round.turn === 1 && ui.roundKey !== roundKey) {
    ui.roundKey = roundKey;
    ui.view = v;
    render();
    await roundCard(v);
    if (!upToDate()) return;
  }
  // The final turn opens on its own card, once per round: night falls, and the stake doubles on
  // this flip. Under reduced motion there is no card (the night colours and the ×2 stamp carry the
  // news). Whatever arrived while it showed is read afterwards, as for the round card.
  const finalKey = `${v.matchId}:${v.roundNo}`;
  if (v.phase === 'plan' && v.round.turn === TURNS && ui.finalKey !== finalKey) {
    ui.finalKey = finalKey;
    if (!reducedMotion()) {
      ui.view = v;
      render();
      audio.level(levelFor(v)); // the band drops to a heartbeat as night falls
      await finalCard();
      ui.stampLand = true;
      if (!upToDate()) return;
    }
  }
  ui.view = v;
  if (ui.mode === 'pass') passCover(v);
  audio.level(levelFor(v));
  if (v.phase === 'match-over' && !ui.matchDone) {
    ui.matchDone = true;
    finishMatch(v);
  }
  if (v.phase !== 'match-over') ui.matchDone = false;
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
    actor = foe(table.view(-1), full.pending.by); // stakes are two-player
    why = 'escalated';
  } else {
    const first = full.locked.indexOf(false);
    actor = first < 0 ? null : first;
  }
  if (actor !== null && actor !== ui.seat) {
    ui.seat = null;
    ui.cover = { seat: actor, why };
    ui.screen = 'cover';
  }
}

async function animateTurn(from, next) {
  ui.animating = true;
  ui.revealAt = performance.now();
  ui.speed = 1;
  ui.skip = ui.alwaysSkip;
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
  // The final flip: the music falls silent while the last cards land, and the spy chord rings out
  // as they slam down (playEvents asks for it with sound('chord')).
  const final = events.some((e) => e.t === 'round') && from.round.turn === TURNS;
  if (final) audio.hush(true);
  // The reveal owns ui.animating until it ends. Leaving the table clears it early (leaveMatch),
  // and from then on nothing here may paint or sound: the title, or the next table, is up.
  // (onUpdate runs one reveal at a time, so no newer reveal can set it again meanwhile.)
  const cancelled = () => !ui.animating;
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
      wait,
      dur,
      cancelled,
      say: (text) => cancelled() || say(text),
      sound: (what, arg) => cancelled() || (what === 'chord' ? audio.spyChord() : audio[what]?.(arg)),
      shake: (n) => cancelled() || shake(root, n),
      cityName: (ci) => cityName(next, ci),
      cardOf: (uid) => nextOnBoard.get(uid) || null,
      kindOf: (uid) => kinds.get(uid) || known.get(uid)?.kind || null,
      ownerOf: (uid) => (nextOnBoard.get(uid) || known.get(uid))?.owner ?? from.round.cities.flatMap((c) => c.sides.flat()).find((c) => c.uid === uid)?.owner ?? 0,
      finale: (e) => finale(e, next, seatAtBottom, cancelled),
    });
  } catch (err) {
    console.warn('reveal animation skipped', err);
  }
  if (final) {
    // The band comes back for the result (unless the table was left: the next one sets its own).
    if (!cancelled()) audio.level(levelFor(next));
    audio.hush(false);
  }
  ui.animating = false;
  ui.prevSpectator = null;
  ui.caption = '';
}

/** The final flip: every city resolves in turn, then the stake slides to the winner. */
async function finale(e, next, bottom, cancelled) {
  say('The final flip.');
  await wait(500);
  for (let ci = 0; ci < 3; ci++) {
    if (cancelled()) return;
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
      if (cancelled()) return;
    }
    const w = e.cityWinners[ci];
    sec.classList.add(w === null ? 'won-none' : w === bottom ? 'won-me' : 'won-them', 'sweeping');
    if (w === null) audio.nobody();
    // Each flourish takes about 1.2 s, so it plays only at full speed. Sped up, the cities come
    // about 0.45 s apart, and a skipped reveal resolves them all at once: no flourishes piled up.
    else if (!ui.skip && ui.speed === 1) audio.flourish(next.round.cities[ci].id, ui.mode === 'pass' ? w === 0 : w === me());
    say(w === null ? `${cityName(next, ci)}: nobody holds it.` : `${cityName(next, ci)} goes to ${labelLower(w, next)}.`);
    await wait(1000);
    sec.classList.remove('resolving');
  }
  if (cancelled()) return;
  if (e.winner !== null) {
    const mine = ui.mode === 'pass' ? true : e.winner === me();
    (mine ? audio.roundWon : audio.roundLost)();
    shake($('#board'), 2);
  } else audio.nobody();
  await wait(500);
}

/**
 * The escalate and fold flashes are title cards (showCard), so they take every tap and key as a
 * card does: nothing reaches the escalation prompt or the table underneath while one is up.
 * Enter, Space or Escape skip a flash at once, a tap once it has been up for 400 ms; leaving the
 * table takes it down, and with every animation skipped (or a modal up) none shows.
 */
function flashEscalate(v, by) {
  audio.escalate();
  const html = `<div class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div><p class="big">${jitter('Escalate')}</p><p class="small">${esc(label(by, v))} doubled the stake</p>`;
  const done = showCard(html, `flash esc own-${by}`, ui.skip ? 300 : 1300, { label: `Escalate: ${label(by, v)} doubled the stake` });
  if (ui.card) shake(app, 2);
  return done;
}

function flashFold(v, seat) {
  audio.fold();
  const walk = `${label(seat, v)} ${ui.mode !== 'pass' && seat === me() ? 'walk' : 'walks'} away from the round`;
  return showCard(`<p class="big">${jitter('Fold')}</p><p class="small">${esc(walk)}</p>`, `flash fold own-${seat}`, 1000, { label: `Fold: ${walk}` });
}

// ── title cards ─────────────────────────────────────────────────────────────

/** How long a round's title card stays up (a tap, Enter, Space or Escape skips it). */
const ROUND_CARD_MS = 2500;

/**
 * Put up a title card: a full-screen `<div class="cine ${className}" role="dialog">` on #app
 * holding `html`, which takes every tap (the click and key handlers check ui.card first). It
 * resolves when the card goes: after `ms`, or at once when Enter, Space or Escape skips it, or a
 * tap once the card has been up for REVEAL_GUARD_MS (a tap before that, such as the second click
 * of a double-click, is swallowed). It shows nothing and resolves at once with ui.alwaysSkip or while a modal is
 * up. Only one card is ever up: a new one ends the last first (its promise resolves), and leaving
 * the table or starting a match ends it (clearOverlays). The timer is a plain setTimeout, so in a
 * hidden tab a card can outstay `ms` by about a second, but it always ends.
 */
function showCard(html, className, ms, { label = '' } = {}) {
  ui.card?.skip();
  if (ui.alwaysSkip || ui.modal) return Promise.resolve();
  cancelDrag();
  const el = document.createElement('div');
  el.className = `cine ${className}`;
  el.setAttribute('role', 'dialog');
  if (label) el.setAttribute('aria-label', label);
  el.innerHTML = html;
  app.append(el);
  return new Promise((resolve) => {
    const card = { el, at: performance.now(), skip: () => end(), hold: () => clearTimeout(timer) };
    const end = () => {
      clearTimeout(timer);
      el.remove();
      if (ui.card === card) ui.card = null;
      resolve();
    };
    const timer = setTimeout(end, ms);
    ui.card = card;
  });
}

/** Take down every overlay a match put up: the title card or flash on screen (one at a time). */
function clearOverlays() {
  ui.card?.skip();
}

/** The player skips the card on screen (a tap past its guard, or Enter, Space or Escape). */
function skipCard() {
  audio.place();
  ui.card.skip();
}

/**
 * The round's opening credits: "Round N", then each city in turn (its skyline, name and rule),
 * sliding in 250 ms apart over the Saul Bass bars. Under reduced motion it stands still.
 */
function roundCard(v) {
  const n = v.roundNo + 1;
  const cities = v.round.cities.map((c) => CITY[c.id]);
  const lines = cities
    .map((c, i) => `<div class="line" style="--i:${i}"><span class="sky" aria-hidden="true">${citySVG(c.id)}</span><h3>${esc(c.name)}</h3><p>${esc(c.rule)}</p></div>`)
    .join('');
  const html = `<div class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <h2 class="big">${jitter(`Round ${n}`, n + 4)}</h2>
    <div class="slate">${lines}</div>`;
  return showCard(html, 'title-card', ROUND_CARD_MS, { label: `Round ${n}: ${cities.map((c) => c.name).join(', ')}` });
}

/** How long the final turn's card stays up (skipped like the round card). */
const FINAL_CARD_MS = 1200;

/**
 * The final turn's card, as the lights go down: Saul Bass bars slam in from both sides, then
 * "Final drop" lands in a spotlight over the news that the stake doubles. Everything is in by
 * about 0.7 s of its 1.2 s. showLatest never shows it under reduced motion.
 */
function finalCard() {
  const html = `<div class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="beam" aria-hidden="true"></div>
    <h2 class="big">${jitter('Final drop', 11)}</h2>
    <p class="small">The stake doubles on the flip</p>`;
  const done = showCard(html, 'final-card', FINAL_CARD_MS, { label: 'Final drop: the stake doubles on the flip' });
  // The bars slam in with a slam (an effect, so it sounds with the music off as well).
  if (ui.card) audio.slam();
  return done;
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
      // Once per match: reloading a finished match shows its dossier again without a second win.
      if (countWin(meta, v.matchId)) saveMeta();
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
  const others = rivals(v, c.seat).map((s) => v.names[s]).join(', ');
  const why = c.why === 'escalated' ? `${v.names[v.round.pending?.by ?? foe(v, c.seat)]} escalated. You decide: fold, or play on for double.` : `Turn ${v.round.turn} of ${TURNS}. ${others}, no peeking.`;
  return `<div class="cover own-${c.seat}">
    <p class="pass">Pass the device to</p>
    <h2>${jitter(name, c.seat + 2)}</h2>
    <p>${esc(why)}</p>
    <button class="slip primary" data-action="uncover">I’m ${esc(name)}: show my hand<kbd>Enter</kbd></button>
  </div>`;
}

function statusText(v) {
  const R = v.round;
  const rival = foe(v);
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
  if (v.roundNo === 0 && t === 1) return 'You and your rival both drop an agent in secret. Then the cards flip together, and the First flip token shows whose tricks go first.';
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
  // Everyone in Havana switches sides, so there "turned" says nothing new.
  if (cv.city !== null && cv.origin !== cv.owner && v.round.cities[cv.city].id !== 'havana') extra.push('a turned asset');
  return `${a.name} (${a.power}): ${a.text}${extra.length ? ` Now: ${extra.join(', ')}.` : ''}`;
}

function scorebarHTML(v, bottom) {
  const top = foe(v, bottom);
  const R = v.round;
  const stake = R.stake;
  // On the final turn (and after its flip, though not after a fold) a ×2 stamp stands in for the
  // "at the final flip" line. It lands once, at the first render after the final card goes.
  const x2 = R.turn === TURNS && (v.phase === 'plan' || R.result?.folded === null);
  const land = x2 && ui.stampLand;
  if (x2) ui.stampLand = false;
  const stakeNote = x2 ? `<i class="x2-stamp${land ? ' land' : ''}" title="The stake doubles on the final flip">×2</i>` : v.phase === 'plan' ? `<small>${stake * 2} at the final flip</small>` : '';
  // The First flip token sits beside the seat whose flip tricks fire first this turn (during a
  // reveal the board is the view from before it, so the token stays with the turn being flipped).
  // When it changes hands it flips across once (.moved); an empty slot keeps the names still.
  const holder = v.phase === 'plan' ? R.initiative : null;
  const moved = holder !== null && holder !== ui.initShown;
  if (holder !== null) ui.initShown = holder;
  const token = (seat) => {
    if (seat !== holder) return '<i class="ff-slot" aria-hidden="true"></i>';
    const name = label(seat, v);
    const whose = ui.mode !== 'pass' && seat === me() ? 'your' : `${name}’s`;
    return `<span class="first-flip${moved ? ' moved' : ''}" role="img" aria-label="First flip: ${esc(name)}" title="First flip: ${esc(whose)} flip tricks go first this turn">1st</span>`;
  };
  return `<div class="scorebar">
    <div class="side s-${top}"><span class="tag"><span class="who">${esc(label(top, v))}</span>${token(top)}</span><b class="score" data-score="${top}">${v.scores[top]}</b></div>
    <div class="mid">
      <span class="stake${stake > 1 ? ' hot' : ''}" title="Points this round is worth">Stake <b>${stake}</b>${stakeNote}</span>
      <span class="turn">${v.phase === 'plan' ? `Turn ${R.turn} of ${TURNS}` : `Round ${v.roundNo + 1}`} · first to ${v.target}</span>
    </div>
    <div class="side s-${bottom}"><b class="score" data-score="${bottom}">${v.scores[bottom]}</b><span class="tag">${token(bottom)}<span class="who">${esc(label(bottom, v))}</span></span></div>
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
  if (res.folded !== null) lines.push(`${label(res.winner, v)} ${ui.mode !== 'pass' && res.winner === me() ? 'score' : 'scores'} ${res.points} (the stake).`);
  else {
    R.cities.forEach((c, ci) => {
      const w = res.cityWinners[ci];
      const t = res.totals[ci];
      lines.push(`<span class="city-line w-${w === null ? 'none' : w === bottom ? 'me' : 'them'}"><b>${esc(CITY[c.id].name)}</b> ${w === null ? 'nobody' : esc(label(w, v))} <small>${t[bottom]} to ${t[foe(v, bottom)]}</small></span>`);
    });
    if (res.winner !== null) lines.push(`<span class="pts">+${res.points} to ${esc(label(res.winner, v))} <small>stake ${res.stake}, doubled on the final flip</small></span>`);
    else lines.push('<span class="pts">Nobody scores.</span>');
    if (res.monaco !== null && res.monaco !== undefined) lines.push(`<span class="pts">+1 Monaco bonus to ${esc(label(res.monaco, v))}</span>`);
  }
  const waiting = ui.mode === 'host' || ui.mode === 'guest' ? v.ready[me()] && rivals(v).some((s) => !v.ready[s]) : false;
  const btn = over
    ? `<button class="slip primary" data-action="final">Final report<kbd>Enter</kbd></button>`
    : waiting
      ? `<p class="wait"><i class="dots" aria-hidden="true"></i>Waiting for ${esc(label(foe(v), v))}…</p>`
      : `<button class="slip primary" data-action="next">Next round<kbd>Enter</kbd></button>`;
  const key = `${v.roundNo}:${v.scores.join(',')}`;
  const enter = ui.resultShown !== key;
  ui.resultShown = key;
  const peekBtn = `<button class="slip quiet" data-action="peek">${ui.peek ? 'Back to the result' : 'See the board'}<kbd>B</kbd></button>`;
  // See the board: a slim strip pinned to the bottom, with only the heading and the buttons.
  if (ui.peek) {
    return `<div class="result peek" role="dialog" aria-label="Round result">
    <h2>${jitter(head, v.roundNo + 3)}</h2>
    <div class="btns">${peekBtn}${btn}</div>
  </div>`;
  }
  return `<div class="result${enter ? ' enter' : ''}" role="dialog" aria-label="Round result">
    <h2>${jitter(head, v.roundNo + 3)}</h2>
    <div class="lines">${lines.map((l) => `<p>${l}</p>`).join('')}</div>
    <p class="tally">${esc(label(bottom, v))} ${v.scores[bottom]} · ${v.scores[foe(v, bottom)]} ${esc(label(foe(v, bottom), v))}</p>
    <div class="btns">${peekBtn}${btn}</div>
  </div>`;
}

/** Online: the rival lost connection (they may come back) or said goodbye (they won't). */
function peerBannerHTML() {
  const n = ui.net;
  if (n?.peer === 'left') return `<p class="banner" role="alert"><span>${esc(n.leftName || 'Your rival')} left the table.</span> <button class="link" data-action="title">Back to the title</button></p>`;
  if (n?.peer === 'gone') return `<p class="banner" role="alert"><span>${ui.mode === 'host' ? 'Your rival lost connection. The game waits for them to come back.' : 'The host lost connection. Waiting for them to come back.'}</span> <button class="link" data-action="title">Leave</button></p>`;
  return '';
}

/** The reveal's button: a tap speeds the reveal up, the next one skips it (tapReveal). */
const revealLabel = () => `${ui.speed >= FAST ? 'Skip' : 'Speed up'}<kbd>Space</kbd>`;

function renderPlay({ board = view(), hand = board, revealing = false, bottom = null } = {}) {
  if (ui.drag && (revealing || !canDrag())) cancelDrag();
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
  const colours = seatColours(v);
  const caption = revealing ? ui.caption : ui.caption || inspectText(v) || hintText(v);
  syncNight();
  $('#screen').innerHTML = `<div class="play ${colours.map((c, s) => `c${s}-${c}`).join(' ')}${revealing ? ' revealing' : ''}" data-bottom="${b}">
    ${peerBannerHTML()}
    ${scorebarHTML(v, b)}
    <div class="board${myPlan(v) ? ' locked' : ''}" id="board">${cities}</div>
    <p class="ticker" id="ticker" role="status">${esc(caption)}</p>
    ${revealing ? `<div class="controls"><p class="status">Flip!</p><div class="btns"><button class="slip quiet" data-action="reveal-tap">${revealLabel()}</button></div></div>` : controlsHTML(v)}
    ${handHTML(hand, revealing)}
    ${!revealing && v.phase !== 'plan' ? resultHTML(v, b) : ''}
  </div>`;
  markDrag();
}

function overHTML() {
  const v = view();
  const bottom = ui.mode === 'pass' ? 0 : me();
  const won = v.winner === bottom;
  const head = ui.mode === 'pass' ? `${v.names[v.winner]} wins` : won ? 'Mission accomplished' : 'Burned';
  const sub = ui.mode === 'pass' ? 'The other spymaster is reassigned to a lighthouse.' : won ? `You beat ${label(foe(v, bottom), v)} ${v.scores[bottom]} to ${v.scores[foe(v, bottom)]}.` : `${label(foe(v, bottom), v)} beat you ${v.scores[foe(v, bottom)]} to ${v.scores[bottom]}.`;
  const rounds = v.history
    .map((h, i) => {
      const who = h.winner === null ? 'nobody' : label(h.winner, v);
      const how = h.folded !== null ? `${label(h.folded, v)} folded` : h.winner === null ? 'dead heat' : `${h.cityWinners.filter((w) => w === h.winner).length} of 3 cities`;
      return `<li class="w-${h.winner === null ? 'none' : h.winner === bottom ? 'me' : 'them'}"><span class="n">${i + 1}</span><span class="cities">${h.cities.map((c) => esc(CITY[c].name)).join(', ')}</span><span class="how">${esc(how)}</span><b>${h.winner === null ? '—' : `+${h.points}`} ${esc(who)}</b></li>`;
    })
    .join('');
  const ri = ui.rival ? RIVALS.findIndex((r) => r.id === ui.rival.id) : -1;
  const nextRival = ui.mode === 'solo' && won && ri >= 0 && ri < RIVALS.length - 1 ? RIVALS[ri + 1] : null;
  const online = ui.mode === 'host' || ui.mode === 'guest';
  const rematchWait = online && v.rematch[me()] && rivals(v).some((s) => !v.rematch[s]);
  const rivalWants = online && rivals(v).some((s) => v.rematch[s]) && !v.rematch[me()];
  const rivalLeft = online && ui.net?.peer === 'left';
  return `<div class="over ${won || ui.mode === 'pass' ? 'won' : 'lost'}">
    <div class="dossier">
      <p class="stamp-line">Dossier · ${esc(v.names.join(' vs '))}</p>
      <h2>${jitter(head, 9)}</h2>
      <p class="sub">${esc(sub)}</p>
      <p class="final"><span>${esc(label(bottom, v))}</span><b>${v.scores[bottom]}</b><i>to</i><b>${v.scores[foe(v, bottom)]}</b><span>${esc(label(foe(v, bottom), v))}</span></p>
      <ol class="rounds">${rounds}</ol>
      ${ui.mode === 'solo' && won && ri === RIVALS.length - 1 ? '<p class="sub">You beat Control. There is nobody left to fool.</p>' : ''}
    </div>
    <div class="actions">
      ${nextRival ? `<button class="slip primary" data-action="rival" data-id="${nextRival.id}">Next rival: ${esc(nextRival.name)}</button>` : ''}
      ${
        rivalLeft
          ? `<p class="wait">${esc(ui.net.leftName || 'Your rival')} left the table.</p>`
          : rematchWait
            ? `<p class="wait"><i class="dots" aria-hidden="true"></i>Waiting for ${esc(label(foe(v), v))} to accept…</p>`
            : `<button class="slip ${nextRival ? '' : 'primary'}" data-action="rematch">${rivalWants ? 'Accept rematch' : 'Rematch'}</button>`
      }
      <button class="slip quiet" data-action="title">Title screen</button>
    </div>
  </div>`;
}

const HELP_TABS = [
  ['rules', 'Rules'],
  ['agents', 'Agents'],
  ['cities', 'Cities'],
  ['keys', 'Keys'],
];
const HELP_RULES = [
  'Three cities are up for grabs. Each turn, you and your rival secretly drop one agent into a city, then both cards flip together.',
  'After six drops, whoever has the higher total in a city holds it. Hold two of the three to win the round.',
  'Agents have tricks. Flip tricks fire as the card turns over: the player holding the First flip token goes first, and the token passes across every turn. Face-down agents have no tricks, except the Tripwire.',
  'Escalate once per round, by whoever calls it first, to double the stake. Your rival must fold (giving you the current stake) or play on. You can fold any time. If the round reaches the final flip, the stake doubles again.',
  'First to 10 points wins the match.',
];
/** Keys tab: [keys, what they do]. The text reads as one line joined with " · ". */
const HELP_KEYS = [
  [['1–7'], 'pick an agent · or drag a card onto a city'],
  [['A', 'S', 'D'], 'pick a city'],
  [['Enter'], 'locks in'],
  [['Esc'], 'takes it back'],
  [['E'], 'escalates'],
  [['F'], 'folds'],
  [['Space'], 'speeds up a reveal, twice skips it'],
  [['B'], 'shows the board behind a result'],
  [['←', '→'], 'switch tabs here'],
  [['M'], 'sound'],
  [['?'], 'help'],
];

/** Help tabs this device shows: touch screens (no hover) have no keyboard, so no Keys tab. */
function helpTabs() {
  const touch = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
  return HELP_TABS.filter(([id]) => id !== 'keys' || !touch);
}

function helpBodyHTML(tab) {
  if (tab === 'agents') return `<ul class="agent-list">${AGENTS.map((a) => `<li><span class="art">${agentSVG(a.id)}</span><b>${esc(a.name)} <i>${a.power}</i></b><span>${esc(a.text)}</span></li>`).join('')}</ul>`;
  if (tab === 'cities') return `<ul class="city-list">${CITIES.map((c) => `<li><b>${esc(c.name)}</b> ${esc(c.rule)}${c.note ? `<span class="note">${esc(c.note)}</span>` : ''}</li>`).join('')}</ul>`;
  if (tab === 'keys') return `<ul class="key-list">${HELP_KEYS.map(([keys, text]) => `<li><span class="keys">${keys.map((k) => `<kbd>${esc(k)}</kbd>`).join(' ')}</span> <span>${esc(text)}</span></li>`).join('')}</ul>`;
  return `<ol class="rules">${HELP_RULES.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>`;
}

/**
 * The help sheet: a header with the tabs (an ARIA tablist), one scrolling body (the tabpanel)
 * and a footer. Only the body scrolls, so the sheet's cut corners never cross its text.
 */
function helpHTML() {
  const tabs = helpTabs();
  if (!tabs.some(([id]) => id === ui.helpTab)) ui.helpTab = 'rules';
  const tab = ui.helpTab;
  return `<div class="modal" data-action="close-modal"><div class="sheet help" role="dialog" aria-label="How to play" data-stop>
    <header class="sheet-head">
      <h2>${jitter('How to play', 1)}</h2>
      <div class="tabs" role="tablist" aria-label="Help topics">${tabs
        .map(([id, name]) => `<button class="tab" role="tab" id="help-tab-${id}" aria-selected="${id === tab}" aria-controls="help-panel" tabindex="${id === tab ? 0 : -1}" data-action="help-tab" data-tab="${id}">${name}</button>`)
        .join('')}</div>
    </header>
    <div class="sheet-body" id="help-panel" role="tabpanel" aria-labelledby="help-tab-${tab}" tabindex="0">${helpBodyHTML(tab)}</div>
    <footer class="btns"><button class="slip primary" data-action="close-modal">Back to the table</button></footer>
  </div></div>`;
}

/** Open a help tab and keep keyboard focus on it (the re-render replaces the old button). */
function showHelpTab(id) {
  if (!helpTabs().some(([t]) => t === id)) return;
  ui.helpTab = id;
  render();
  $('#modal-root [role=tab][aria-selected=true]')?.focus({ preventScroll: true });
}

/** ← and → step through the tabs this device shows, wrapping round. */
function stepHelpTab(dir) {
  const ids = helpTabs().map(([id]) => id);
  const i = ids.indexOf(ui.helpTab);
  showHelpTab(ids[(i + dir + ids.length) % ids.length]);
}

function modalHTML() {
  const v = view();
  if (ui.modal === 'help') return helpHTML();
  if (!v) return '';
  const rival = foe(v);
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
  if (v.phase === 'plan' && R.pending && R.pending.by !== me() && (ui.mode !== 'pass' || ui.seat === foe(v, R.pending.by))) {
    const by = R.pending.by;
    return `<div class="modal hot"><div class="sheet small" role="dialog" aria-label="Escalation">
      <h2>${jitter(`${label(by, v)} escalates`, 6)}</h2>
      <p>Play on and this round is worth <b>${R.stake * 2}</b>, or <b>${R.stake * 4}</b> if it reaches the final flip. Fold now and ${esc(label(by, v))} takes <b>${R.stake}</b>.</p>
      <div class="btns"><button class="slip primary" data-action="respond" data-accept="1">Play on<kbd>Enter</kbd></button><button class="slip" data-action="respond" data-accept="0">Fold<kbd>F</kbd></button></div>
    </div></div>`;
  }
  return '';
}

/**
 * Night falls on a round's final turn: its planning, its reveal and its result, on the table only
 * (title, cover and dossier stay by day). style.css redefines the colour tokens under
 * body[data-night='1']; the phone's browser bar follows.
 */
const DAY_THEME = document.querySelector('meta[name=theme-color]')?.getAttribute('content') || '#e0a030';
const NIGHT_THEME = '#571914'; // the oxblood glow at the top of the night table
function syncNight() {
  const night = ui.screen === 'play' && ui.view?.round.turn === TURNS ? '1' : '0';
  if (document.body.dataset.night === night) return;
  document.body.dataset.night = night;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', night === '1' ? NIGHT_THEME : DAY_THEME);
}

/** The music each screen plays: the title theme, the lobby bossa, the table's score, or none. */
const SCENE = { title: 'title', rivals: 'title', lobby: 'lobby', cover: 'table', play: 'table', over: null };

function render() {
  const s = ui.screen;
  audio.scene(SCENE[s] ?? null); // a no-op while that piece plays
  if (!$('#top')) {
    app.innerHTML = `<div id="top"></div><main id="screen"></main><div id="modal-root"></div>`;
    modalShown = '';
  }
  $('#top').innerHTML = renderTop();
  homeLink({ parent: $('#top .home-slot') });
  document.body.dataset.screen = s;
  document.body.dataset.flip = ui.mode === 'guest' ? '1' : '0';
  syncNight();
  if (s === 'title') $('#screen').innerHTML = titleHTML();
  else if (s === 'rivals') $('#screen').innerHTML = rivalsHTML();
  else if (s === 'lobby') $('#screen').innerHTML = lobbyHTML();
  else if (s === 'cover') $('#screen').innerHTML = coverHTML();
  else if (s === 'over') $('#screen').innerHTML = view() ? overHTML() : '';
  else if (s === 'play' && view()) {
    if (!ui.animating) renderPlay();
  }
  const m = ui.screen === 'play' || ui.modal === 'help' ? modalHTML() : '';
  // Leave an unchanged modal alone, so a rival's move doesn't scroll the help sheet back up.
  if (m !== modalShown) $('#modal-root').innerHTML = modalShown = m;
  // A new screen, a modal or a reveal ends a drag in progress (the card stays selected).
  if (ui.drag && (!canDrag() || modalShown)) cancelDrag();
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

// Drag to drop: press a playable card and move it 8px, and it lifts out of the hand as a ghost
// that follows the pointer. Let go over a highlighted city to choose it (Lock in still locks);
// let go anywhere else and the card simply stays selected. Picking re-renders the hand under the
// pointer, so the drag listens on document and finds cards by uid, never by a kept DOM node.
const DRAG_PX = 8;
/** The click that follows a drag's release is not a tap on a card: ignored for this long. */
const DRAG_CLICK_MS = 300;
let press = null; // { uid, id, x, y, dx, dy }: a pointer down on a playable card, until it lifts
let dragEndedAt = -Infinity; // performance.now() when the last drag ended

/** A drag may start, or go on: the table is up, nothing covers it, and I still have a drop to make. */
function canDrag() {
  const v = view();
  if (ui.screen !== 'play' || ui.modal || ui.card || ui.animating || !v || v.phase !== 'plan' || myPlan(v)) return false;
  if (ui.mode === 'pass' && ui.seat === null) return false;
  return v.round.legal.length > 0;
}

const handCard = (uid) => $(`#hand .card[data-uid="${CSS.escape(uid)}"]`);

/** The city a drop at (x, y) would choose: a highlighted one under the pointer, or null. */
function cityAt(x, y) {
  const el = document.elementFromPoint(x, y)?.closest('.city.target');
  return el ? Number(el.dataset.city) : null;
}

/** Mark the dragged card in the hand and the city under the pointer (again after each render). */
function markDrag() {
  for (const el of document.querySelectorAll('.drop-over, .card.dragging')) el.classList.remove('drop-over', 'dragging');
  const d = ui.drag;
  if (!d) return;
  handCard(d.uid)?.classList.add('dragging');
  if (d.over !== null) $(`#board .city.target[data-city="${d.over}"]`)?.classList.add('drop-over');
}

/** The press has moved far enough: select the card (unless it is already) and lift a ghost of it. */
function startDrag() {
  const { uid } = press;
  if (ui.selected === uid) audio.pick();
  else pick(uid);
  const card = ui.selected === uid && handCard(uid);
  if (!card) {
    press = null;
    return;
  }
  const ghost = document.createElement('div');
  ghost.className = card.className;
  ghost.classList.remove('sel', 'dragging');
  ghost.classList.add('drag-ghost');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.innerHTML = card.innerHTML;
  // Out of the hand, the ghost keeps the card's size, colours and whatever the hand hides.
  ghost.style.width = `${card.offsetWidth}px`;
  ghost.style.height = `${card.offsetHeight}px`;
  // It shrinks toward the point you hold it by, so the city under it stays in view.
  ghost.style.transformOrigin = `${press.dx}px ${press.dy}px`;
  const cs = getComputedStyle(card);
  for (const prop of ['--me-col', '--them-col']) ghost.style.setProperty(prop, cs.getPropertyValue(prop));
  [...card.children].forEach((el, i) => {
    if (getComputedStyle(el).display === 'none') ghost.children[i].style.display = 'none';
  });
  document.body.append(ghost);
  ui.drag = { uid, ghost, over: null };
  markDrag();
}

function moveDrag(x, y) {
  const d = ui.drag;
  d.ghost.style.translate = `${x - press.dx}px ${y - press.dy}px`;
  const over = cityAt(x, y);
  if (over !== d.over) {
    d.over = over;
    markDrag();
  }
}

/**
 * End a drag without dropping: the ghost goes and the marks clear, the card stays selected, and
 * the click that follows the release is ignored. Also ends a press that has not become a drag.
 */
function cancelDrag() {
  press = null;
  const d = ui.drag;
  if (!d) return;
  ui.drag = null;
  d.ghost.remove();
  dragEndedAt = performance.now();
  markDrag();
}

document.addEventListener('pointerdown', (ev) => {
  // Mid-drag, another press (a second finger, say) leaves the drag alone.
  if (ui.drag || !ev.isPrimary || ev.button !== 0) return;
  const card = ev.target.closest?.('.hand .card:not([disabled])');
  if (!card || !canDrag()) return;
  const r = card.getBoundingClientRect();
  press = { uid: card.dataset.uid, id: ev.pointerId, x: ev.clientX, y: ev.clientY, dx: ev.clientX - r.left, dy: ev.clientY - r.top };
  // A touch is captured by the card it lands on, and picking re-renders that card. Let it go,
  // so the moves reach document from whatever is under the finger.
  if (card.hasPointerCapture(ev.pointerId)) card.releasePointerCapture(ev.pointerId);
});

document.addEventListener('pointermove', (ev) => {
  if (!press || ev.pointerId !== press.id) return;
  // A mouse let go outside the window: the pointerup never came.
  if (ev.pointerType === 'mouse' && !(ev.buttons & 1)) return cancelDrag();
  if (!ui.drag) {
    if (Math.hypot(ev.clientX - press.x, ev.clientY - press.y) < DRAG_PX) return;
    if (!canDrag()) return cancelDrag();
    startDrag();
    if (!ui.drag) return;
  }
  moveDrag(ev.clientX, ev.clientY);
});

document.addEventListener('pointerup', (ev) => {
  if (!press || ev.pointerId !== press.id) return;
  // No drag yet: a plain tap, and the click that follows picks the card.
  if (!ui.drag) return (press = null);
  const ci = cityAt(ev.clientX, ev.clientY);
  cancelDrag();
  if (ci !== null) chooseCity(ci);
});

document.addEventListener('pointercancel', (ev) => {
  if (press && ev.pointerId === press.id) cancelDrag();
});
window.addEventListener('blur', () => cancelDrag());

/**
 * A tap, Space, Enter or Escape during a reveal (revealTap): ignored in its first 400 ms, so a
 * stray tap can't skip the flip; then the reveal plays at FAST; the next one skips the rest.
 */
function tapReveal() {
  if (!ui.animating) return;
  const what = revealTap({ at: ui.revealAt, speed: ui.speed }, performance.now());
  if (what === 'fast') {
    pace({ speed: FAST });
    // CSS animations that start from now on (flips, takedowns) keep pace with the waits.
    $('#screen .play')?.style.setProperty('--pace', String(1 / FAST));
    const btn = $('#screen [data-action=reveal-tap]');
    if (btn) btn.innerHTML = revealLabel();
    audio.pick();
  } else if (what === 'skip') {
    pace({ skip: true });
    audio.place();
  }
}

/** See the board (B): the round result shrinks to a strip at the bottom, or comes back. */
function togglePeek() {
  const v = view();
  if (ui.animating || ui.screen !== 'play' || !v || v.phase === 'plan' || !v.round.result) return;
  const refocus = document.activeElement?.dataset?.action === 'peek';
  ui.peek = !ui.peek;
  audio.place();
  render();
  const panel = $('#screen .result');
  if (refocus) panel?.querySelector('[data-action=peek]')?.focus({ preventScroll: true });
  // The slide plays from here, not from the render, so a rival's move can't restart it.
  if (panel && !reducedMotion()) panel.animate([{ opacity: 0, translate: ui.peek ? '0 24px' : '0 -12px' }, { opacity: 1, translate: '0 0' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
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
  'help-tab': (el) => showHelpTab(el.dataset.tab),
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
  // Every mode: the new match id reaches onUpdate(), which clears the dossier for the table.
  rematch: () => {
    act({ a: 'rematch' });
    render();
  },
  'reveal-tap': tapReveal,
  peek: togglePeek,
};

document.addEventListener('click', (ev) => {
  // A title card takes every tap, and does nothing else with it. Past its first 400 ms a tap
  // skips the card; before that it is a stray (the second click of a double-click, or one more
  // tap through the reveal before it) and changes nothing.
  if (ui.card) {
    if (performance.now() - ui.card.at >= REVEAL_GUARD_MS) skipCard();
    return;
  }
  // During a reveal a click is a tap on it (speed up, then skip), except in the header and
  // inside the help sheet.
  if (ui.animating && !ev.target.closest('.top') && !(ui.modal === 'help' && ev.target.closest('#modal-root'))) {
    tapReveal();
    return;
  }
  // The click that follows a drag's release on its own card is not a tap: it must not toggle the
  // card off. (A quick tap on a city right after a drop still chooses it.)
  if (performance.now() - dragEndedAt < DRAG_CLICK_MS && ev.target.closest('.card')) return;
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
  // A title card takes every key. Enter, Space or Escape skips it; a key held down since before
  // it came up does not.
  if (ui.card) {
    // preventDefault also keeps Enter and Space from pressing a focused button underneath (the
    // escalation prompt's Play on) as the card goes.
    if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Escape') {
      ev.preventDefault();
      if (!ev.repeat) skipCard();
    }
    return;
  }
  if (ev.target.closest?.('input, textarea')) return;
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const k = ev.key;
  // Mid-drag, keys wait for the drop, except Escape, which puts the ghost back (still selected).
  if (ui.drag) {
    if (k === 'Escape') cancelDrag();
    return;
  }
  // The help sheet can be open over a reveal (its button sits in the header).
  if (ui.modal === 'help' && (k === 'ArrowRight' || k === 'ArrowLeft')) {
    ev.preventDefault();
    return stepHelpTab(k === 'ArrowRight' ? 1 : -1);
  }
  if (ui.modal === 'help' && k === 'Escape') {
    ev.preventDefault();
    return actions['close-modal']();
  }
  // During a reveal, Space, Enter and Escape tap it (speed up, then skip). A key held down
  // taps once, and with the help sheet open they belong to the sheet.
  if (ui.animating) {
    if ((k === ' ' || k === 'Enter' || k === 'Escape') && ui.modal !== 'help') {
      ev.preventDefault();
      if (!ev.repeat) tapReveal();
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
  if (v.phase === 'plan' && R.pending && R.pending.by !== me() && (ui.mode !== 'pass' || ui.seat === foe(v, R.pending.by))) {
    // A key held down through the escalation flash doesn't answer the prompt when the flash goes
    // (nor press its focused Play on).
    if (ev.repeat) return ev.preventDefault();
    if (k === 'Enter') act({ a: 'respond', accept: true });
    if (k === 'f' || k === 'F') act({ a: 'respond', accept: false });
    return;
  }
  if (v.phase !== 'plan') {
    if (k === 'Enter') {
      // On a focused See the board / Back to the result button, Enter presses that button.
      if (document.activeElement?.dataset?.action === 'peek') return;
      ev.preventDefault();
      if (v.phase === 'match-over') actions.final();
      else actions.next();
    }
    if (k === 'b' || k === 'B') togglePeek();
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

onHidden(() => audio.pause());
/** Back in front: the screen's piece plays again (from its first bar). */
const resumeMusic = () => {
  if (!document.hidden) audio.resume();
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
    if (table.state.round.pending) table.act(foe(table.state, table.state.round.pending.by), { a: 'respond', accept: true });
    for (const seat of allSeats(table.state)) {
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
  /** The music, for the smoke: notes scheduled per voice, and the piece playing. */
  audio: {
    get played() {
      return audio.played;
    },
    get sceneName() {
      return audio.sceneName;
    },
  },
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
  /** Jump to the round's final turn (both seats drop at random until then), then update as play does. */
  toFinalTurn() {
    // quickTurns seats the rival at once. Hold it (as a reveal does in play) until the update below
    // is under way, so it waits for the final card instead of making its move behind it.
    const held = ui.updating;
    ui.updating = true;
    try {
      quickTurns(TURNS - table.state.round.turn);
    } finally {
      ui.updating = held;
    }
    onUpdate();
  },
  /**
   * The computer rival locks in its first legal drop now, through the table as its own lock does,
   * so a step that inspects the table can't be raced by its fold or escalation. Call it while the
   * rival is held (a card or reveal up), or it may already be thinking.
   */
  rivalLocks() {
    if (ui.mode !== 'solo' || !table) return false;
    const v = table.view(1);
    const d = v.round.legal[0];
    return v.phase === 'plan' && !v.round.plan && !!d && table.act(1, { a: 'lock', uid: d.uid, city: d.city });
  },
  /** The computer rival escalates now, through the table as its own escalation does (the flash and prompt follow). */
  rivalEscalates() {
    if (ui.mode !== 'solo' || !table) return false;
    return table.act(1, { a: 'escalate' });
  },
  /** Leave the table through the Leave button's own action, even mid-reveal (the reveal ends at once, silently). */
  leave: () => actions.title(),
  /** Keep the title card or flash on screen until it is skipped (for a steady screenshot). */
  holdCard: () => ui.card?.hold(),
  /**
   * Freeze a reveal where it is (for a steady screenshot): its waits slow to a crawl (hours, kept
   * under setTimeout's ceiling) until a tap or Space speeds it up to FAST or skips it, as in play.
   */
  holdReveal() {
    if (!ui.animating) return false;
    pace({ speed: 1e-4 });
    return true;
  },
  /** Skip every reveal and title card from now on, for the rest of the session (or play them again). */
  skipAnimations: (on = true) => {
    ui.alwaysSkip = on;
    pace({ skip: on });
    if (on) ui.card?.skip();
  },
  prepareThumbnail() {
    // No round card in the thumbnail: the table is built with every animation skipped.
    const skip = ui.alwaysSkip;
    ui.alwaysSkip = true;
    try {
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
      ui.initShown = ui.view.round.initiative; // the token at rest, not mid-flip
      render();
    } finally {
      ui.alwaysSkip = skip;
    }
  },
});
