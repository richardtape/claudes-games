// Dead Drop UI: screens, the four ways to play (computer, pass and play, host, guest), input,
// and the reveal flow that animates each turn's events before re-rendering from the new view.
import { homeLink, markReady, onHidden, recordBest, recordPlay, reducedMotion, store } from '../../../shared/arcade.js';
import { createSfx } from '../../../shared/sfx.js';
import { shake, toast as cgToast } from '../../../shared/juice.js';
import { cleanCode, joinRoom, roomCode } from '../../../shared/net.js';
import { AGENT, AGENTS, CITIES, CITY, CLASSIC_CITIES, CODENAMES, DECK, RIVALS, ROSTER, RULES, SEAT_NAMES, TARGET, TURNS } from './data.js';
import { deckList, rivalsOf, seatCount } from './engine.js';
import { attachBot, createTable, guestSession, hostSession, restoreTable, canRestore } from './session.js';
import { canisterHTML, cardHTML, chipHTML, cityHTML, esc, FAST, faceDownText, playEvents, REVEAL_GUARD_MS, revealTap } from './board.js';
import { agentSVG, citySVG, spySVG } from './art.js';
import { createAudio } from './audio.js';
import { levelFor } from './music.js';
import { countMatch, countWin, meet, migrateMeta } from './meta.js';
import { CLASSIC_SETUP, MIXED_ALL, freeSetup, ladderSetup, network } from './roster.js';
import { cable, DOSSIERS, EPILOGUE, operation, REMARKS, twistText } from './story.js';
import { sightings, unseen } from './counting.js';

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

const meta = migrateMeta(saved.get('meta', {}), { codenames: CODENAMES, rivals: RIVALS.map((r) => r.id), fresh: { codename: pickCodename(), token: randomToken() } });
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
  // The rest of the drop being chosen (cleared with selected and target, by clearPick): an
  // Accomplice's partner (null until chosen, 'alone', or a card's uid), and the face in Casablanca
  // (null for the agent's own face, true face down, false face up).
  partner: null,
  down: null,
  tapShown: null, // the wiretap slips last drawn on the plates (a new one comes in once)
  holdAt: null, // __game.holdAt(kind): the reveal holds once a trick of this kind has played (once)
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
  reelKey: null, // the matchId whose full reel card was last due (it plays once per match)
  holdBoard: false, // a fold is playing out over the board as it stood: render() leaves #screen alone
  free: false, // solo: free play (Mixed from your network, no twist; a win recruits nothing), not the ladder
  rivalsTab: 'ladder', // the rivals screen's switch: ladder | free
  epilogue: false, // a ladder win over Control has just happened: Final report plays the epilogue before the dossier
  recruits: null, // that win's recruits toast, held until the epilogue has gone (flushRecruits)
  holdRival: false, // __game.holdRival(): the computer rival waits, as it does behind a card (a check's steady table)
  introKey: null, // the matchId whose intro (the rival's dossier, tonight's roster) was last due: it plays once per match
  // The unseen strip's sightings this round: { key: `${matchId}:${roundNo}`, seen: Map(`${viewer}:${origin}:${id0}` → n) },
  // n the most cards of that kind from that deck one view has shown (feedSightings).
  sighted: null,
  unseenOpen: null, // the rival seat whose unseen strip is open (U), or null: a planning tool, closed by any reveal or result
  unseenEnter: false, // the strip has just been opened: its next render drops it in (once)
  remark: null, // the computer rival's remark on a round's result, said once: { key: `${matchId}:${roundNo}`, text }
  typeNext: null, // a line just said (say()): the next render types it out in the ticker again
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
const toast = (msg, ms) => cgToast(msg, { className: 'toast', ms });
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
/** A count in words where it reads better ("two strips"); digits past ten. */
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const inWords = (n) => NUMBER_WORDS[n] ?? String(n);
/** "two strips", "one strip": a count in words with its noun. */
const counted = (n, one, many = `${one}s`) => `${inWords(n)} ${n === 1 ? one : many}`;
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** "Two strips win the match": how many strips of film the full reel needs, as a sentence. */
const reelSentence = (reel) => `${capital(counted(reel, 'strip'))} ${reel === 1 ? 'wins' : 'win'} the match`;

/** Forget the drop being chosen: the card, its city, an Accomplice's partner and Casablanca's face. */
function clearPick() {
  ui.selected = null;
  ui.target = null;
  ui.partner = null;
  ui.down = null;
}

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
  if (ui.mode === 'solo' || ui.mode === 'pass') saved.set('match', { mode: ui.mode, rival: ui.rival?.id ?? null, free: ui.mode === 'solo' && ui.free, table: table.toJSON() });
  if (ui.mode === 'host' && ui.net?.code) saved.set(`host-${ui.net.code}`, { table: table.toJSON(), at: Date.now() });
}

/**
 * The one place per-match UI state is cleared: everything a new match (a fresh start or a
 * rematch in any mode) must not inherit from the last one. Add new per-match fields here.
 */
function freshMatchUi() {
  ui.shownSeq = 0;
  ui.view = null;
  clearPick();
  ui.tapShown = null;
  ui.holdAt = null;
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
  ui.reelKey = null;
  ui.holdBoard = false;
  ui.epilogue = false;
  ui.recruits = null;
  ui.introKey = null;
  ui.sighted = null;
  ui.unseenOpen = null;
  ui.unseenEnter = false;
  ui.remark = null;
  cancelDrag();
  clearOverlays();
}

/** Leaving a mode altogether: a fresh match screen, no host view kept, no computer rival. */
function resetMatchUi() {
  freshMatchUi();
  ui.free = false;
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

/** The computer rival waits while an update plays (a reveal, a card, a flash), or while a check holds it. */
const botHold = () => ui.updating || ui.holdRival;

/**
 * Play the computer: `rivalId` on the ladder (its setup: Classic for Wren, then each rival's packs and
 * twist), or in free play (`free`: Mixed from your network, no twist). `resume` is a saved table to
 * continue, which brings its own setup.
 */
function startSolo(rivalId, { free = false, resume = null } = {}) {
  leaveMatch({ keepSave: !!resume });
  resetMatchUi();
  ui.mode = 'solo';
  ui.rival = RIVALS.find((r) => r.id === rivalId) || RIVALS[0];
  ui.free = !!free;
  if (resume) restoreSaved(resume);
  else table = createTable({ names: [meta.codename, ui.rival.name], setup: ui.free ? freeSetup(meta.beaten) : ladderSetup(ui.rival.id), twistSeat: 1 });
  watch(table);
  beginMatch();
  // Seated once the table is up: the round's title card holds the rival (ui.updating) from its
  // very first move, as it does in every later round.
  bot = attachBot(table, 1, ui.rival, { hold: botHold });
}

/** Pass and play on one device: the Classic roster, or `setup` (the sheet's Mixed is MIXED_ALL). */
function startPass({ resume = null, setup = CLASSIC_SETUP } = {}) {
  leaveMatch({ keepSave: !!resume });
  resetMatchUi();
  ui.mode = 'pass';
  ui.rival = null;
  if (resume) restoreSaved(resume);
  else table = createTable({ names: SEAT_NAMES.slice(0, 2), setup });
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
  render(); // the roster switch, while the room opens
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
  // Leaving Control's last result before Final report: the epilogue is skipped, but not the recruits.
  flushRecruits();
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
  // Pass and play: a turn that resolved, or a new round, opens with the device covered (a new round
  // usually comes from the result, which has already covered it; not if it began behind a fold's exit).
  if (ui.mode === 'pass' && table && (table.turnSeq > ui.shownSeq || (ui.view && table.state.roundNo !== ui.view.roundNo))) ui.seat = null;
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
  // reveals it from there instead of jumping to the new view unrevealed. The same goes for a fold
  // that ended the round meanwhile (the rival folded behind the round card): the next pass flashes
  // it, and pulls the folder's agents off the board still on screen. And for a new round that began
  // meanwhile (online, both players ready while a fold's exit played): the next pass opens it.
  const upToDate = () => {
    if (!reread()) return false;
    const newRound = ui.view && v.roundNo !== ui.view.roundNo;
    const foldedBehind = ui.view && ui.view.phase === 'plan' && v.phase !== 'plan' && v.roundNo === ui.view.roundNo;
    if (v.turnSeq <= ui.shownSeq && !foldedBehind && !newRound) return true;
    ui.dirty = true;
    return false;
  };
  const prev = ui.view;
  if (v.turnSeq > ui.shownSeq && prev && v.round.events.length) {
    ui.shownSeq = v.turnSeq;
    clearPick();
    ui.inspect = null;
    const from = ui.mode === 'pass' && ui.prevSpectator ? ui.prevSpectator : prev;
    const shown = v;
    await animateTurn(from, shown);
    if (!reread()) return;
    // The board on screen is now the one the reveal ended on: a fold that arrived during the
    // reveal plays out over it, not over the board from before the turn.
    ui.view = shown;
  }
  ui.shownSeq = Math.max(ui.shownSeq, v.turnSeq);
  // The match opens on its intro, once per match, before round 1's title card and before any drop of
  // mine (a reload mid-turn goes straight to the table): the rival's dossier, solo on the ladder, the
  // first time you meet them; then tonight's roster, unless it is Classic. What a card shows for the
  // first time is met (meta.met) as it shows, never while cards are skipped. Whatever arrives while
  // they are up is read afterwards, as for the round card.
  if (v.phase === 'plan' && v.roundNo === 0 && v.round.turn === 1 && !v.round.plan && ui.introKey !== v.matchId) {
    ui.introKey = v.matchId;
    if (cardsShow()) {
      ui.view = v;
      render();
      const rival = ui.mode === 'solo' && !ui.free ? ui.rival : null;
      if (rival && meet(meta, { rivals: [rival.id] }).rivals.length) {
        saveMeta();
        await dossierCard(rival, v.twist);
        if (!upToDate()) return;
      }
      if (!isClassic(v.roster) && cardsShow()) {
        const fresh = meet(meta, { agents: v.roster }).agents;
        if (fresh.length) saveMeta();
        await rosterCard(v, fresh);
        if (!upToDate()) return;
      }
    }
  }
  // An escalation just landed: flash it once.
  const pend = v.round.pending;
  if (pend && v.phase === 'plan' && ui.flashSeen !== `${v.roundNo}-${pend.by}`) {
    ui.flashSeen = `${v.roundNo}-${pend.by}`;
    ui.view = v;
    render();
    await flashEscalate(v, pend.by);
    if (!upToDate()) return;
    if (pend.by !== me()) remark('escalate');
  }
  // A fold ended the round: the board stays as it stood under the fold's flash, then the folder's
  // agents pull out of it and (if the fold left anyone a strip of film) the strip flies. render()
  // leaves the screen alone meanwhile (ui.holdBoard); ui.view is already the new view, so the
  // escalation prompt goes, and nothing stale is drawn after.
  const folded = v.round.result?.folded;
  if (ui.view && ui.view.phase === 'plan' && v.phase !== 'plan' && folded !== null && folded !== undefined && v.roundNo === ui.view.roundNo) {
    // Everything this plays comes from the round that ended, kept here: after an await, `v` is
    // whatever the latest view is by then.
    const ended = v;
    const { strip } = ended.round.result;
    // Pass and play: the board as both players may see it, drawn from the bottom seat (as a reveal is).
    const spectator = ui.mode === 'pass' && ui.prevSpectator ? ui.prevSpectator : null;
    const board = spectator || ui.view;
    ui.prevSpectator = null;
    ui.view = ended;
    ui.caption = '';
    // As the reveal path does: a pick made in the round that folded must not arm Lock in in the next.
    clearPick();
    ui.inspect = null;
    ui.unseenOpen = null;
    ui.holdBoard = true;
    try {
      renderPlay({ board, still: true, bottom: spectator ? 0 : null });
      render();
      await flashFold(ended, folded);
      if (!upToDate()) return;
      const clock = outsideReveal();
      await exfiltrate(ended, folded, clock);
      if (!upToDate()) return;
      if (strip !== null && strip !== undefined) {
        await flyStrip(ended, strip, clock);
        if (!upToDate()) return;
      }
    } finally {
      ui.holdBoard = false;
      ui.caption = '';
    }
  }
  // The full reel wins the match: its card plays once per match, after the final flip (and the
  // strip's flight) or the fold, and before the result. The board behind it is left as it is.
  if (v.phase === 'match-over' && v.winBy === 'reel' && ui.reelKey !== v.matchId) {
    ui.reelKey = v.matchId;
    ui.view = v;
    await reelCard(v);
    if (!upToDate()) return;
  }
  // A new round opens on its title card, once per round. The new table goes up behind it, and
  // whatever arrived while it showed (a rival locking in, say) is read afterwards.
  const roundKey = `${v.matchId}:${v.roundNo}`;
  if (v.phase === 'plan' && v.round.turn === 1 && ui.roundKey !== roundKey) {
    ui.roundKey = roundKey;
    ui.view = v;
    render();
    const shown = cardsShow();
    await roundCard(v);
    if (!upToDate()) return;
    // The rival opens about half the rounds with a remark (never over a teaching hint).
    if (shown && !hintText(v) && Math.random() < 0.5) remark('start');
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
  if (v.phase !== 'plan') ui.unseenOpen = null;
  // As a round's result comes up, the rival remarks on it, once: its fold, its win or its loss.
  const resultKey = `${v.matchId}:${v.roundNo}`;
  if (v.phase !== 'plan' && v.round.result && ui.remark?.key !== resultKey) {
    const res = v.round.result;
    const them = foe(v);
    const kind = res.folded === them ? 'fold' : res.winner === them ? 'won' : res.winner === me() ? 'lost' : null;
    ui.remark = { key: resultKey, text: kind ? remark(kind) : null };
  }
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
  const next = passActor();
  if (next && next.seat !== ui.seat) {
    ui.seat = null;
    ui.cover = next;
    ui.screen = 'cover';
  }
}

/** Pass and play, while planning: `{ seat, why }` for the seat whose hands the device belongs in next ('turn' or 'escalated'), or null. */
function passActor() {
  const full = table.view(-1).round;
  let actor = null;
  let why = 'turn';
  if (full.pending && !full.locked[full.pending.by]) actor = full.pending.by;
  else if (full.pending) {
    actor = foe(table.view(-1), full.pending.by); // stakes are two-player
    why = 'escalated';
  } else {
    // A tapped mark goes before its wiretapper, so the wiretapper hears the city (two seats tapping
    // each other go in table order).
    const open = allSeats(table.state).filter((s) => !full.locked[s]);
    const waits = (s) => full.taps.some((t) => t.by === s && t.on !== s && !full.locked[t.on] && !full.taps.some((u) => u.by === t.on && u.on === s));
    actor = open.find((s) => !waits(s)) ?? open[0] ?? null;
  }
  return actor === null ? null : { seat: actor, why };
}

async function animateTurn(from, next) {
  // The unseen strip is for planning: the reveal plays over the whole board.
  ui.unseenOpen = null;
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
      stake: (n) => cancelled() || raiseStake(n),
      moment: (kind) => {
        if (cancelled() || ui.holdAt !== kind) return;
        ui.holdAt = null;
        pace({ speed: 1e-4 }); // as holdReveal: a tap or Space speeds it up, then skips it
      },
      reduced: reducedMotion(),
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

/**
 * The Blackmailer raised the stake to `n` mid-reveal: the slip on screen (drawn from the view before
 * the turn) shows it at once and flashes (colour only); the next render draws it from the view.
 */
function raiseStake(n) {
  const slip = $('#screen .scorebar .stake');
  if (!slip) return;
  const b = slip.querySelector('b');
  if (b) b.textContent = String(n);
  const small = slip.querySelector('small');
  if (small) small.textContent = `${n * 2} at the final flip`;
  slip.classList.add('hot', 'blackmail');
}

/** The final flip: every city resolves in turn, then the stake slides to the winner. Reykjavik ticks up its head counts, not power. */
async function finale(e, next, bottom, cancelled) {
  say('The final flip.');
  await wait(500);
  for (let ci = 0; ci < 3; ci++) {
    if (cancelled()) return;
    const sec = $(`#board .city[data-city="${ci}"]`);
    if (!sec) continue;
    sec.classList.add('resolving');
    const city = next.round.cities[ci];
    const totals = city.id === 'reykjavik' ? city.sides.map((side) => side.length) : e.totals[ci];
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
  // Whoever held the film city without winning the round takes a strip of film: it flies home.
  if (e.strip !== null && e.strip !== undefined && !cancelled()) await flyStrip(next, e.strip);
}

/**
 * The escalate and fold flashes are title cards (showCard), so they take every tap and key as a
 * card does: nothing reaches the escalation prompt or the table underneath while one is up.
 * Enter, Space or Escape skip a flash at once, a tap once it has been up for 400 ms; leaving the
 * table takes it down, and with every animation skipped (or a modal up) none shows.
 */
function flashEscalate(v, by) {
  audio.escalate();
  // The story's words under the plain one: escalating is going loud.
  const loud = `${label(by, v)} ${ui.mode !== 'pass' && by === me() ? 'go' : 'goes'} loud: the stake doubles`;
  const html = `<div class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div><p class="big">${jitter('Escalate')}</p><p class="small">${esc(loud)}</p>`;
  const done = showCard(html, `flash esc own-${by}`, ui.skip ? 300 : 1300, { label: `Escalate: ${loud}` });
  if (ui.card) shake(app, 2);
  return done;
}

function flashFold(v, seat) {
  audio.fold();
  // Folding is aborting, in the story.
  const abort = `${label(seat, v)} ${ui.mode !== 'pass' && seat === me() ? 'abort' : 'aborts'} to save the network`;
  return showCard(`<p class="big">${jitter('Fold')}</p><p class="small">${esc(abort)}</p>`, `flash fold own-${seat}`, 1000, { label: `Fold: ${abort}` });
}

/**
 * A clock for what plays outside a reveal (a fold's exit): plain timers, at once with every
 * animation skipped or under reduced motion. A quick wait resolves on the spot rather than on a
 * zero timer, which a hidden tab would hold back. Never a WAAPI .finished, which stalls there.
 */
function outsideReveal() {
  const quick = ui.alwaysSkip || reducedMotion();
  return {
    quick,
    wait: (ms) => (quick ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms))),
    dur: (ms) => (quick ? 1 : ms),
  };
}

/** How long the folder's agents take to lift off the board and fade. */
const EXFIL_MS = 450;

/** A fold: the folder's agents on the board on screen lift off it and fade, and the ticker says so. */
async function exfiltrate(v, seat, clock) {
  say(`${label(seat, v)} ${ui.mode !== 'pass' && seat === me() ? 'pull' : 'pulls'} out of the round.`);
  if (!clock.quick) for (const el of document.querySelectorAll(`#board .row[data-row$="-${seat}"] .chip`)) el.classList.add('exfil');
  await clock.wait(EXFIL_MS);
}

/** How long a strip of film takes to fly from the canister to the scorebar. */
const FLY_MS = 720;

/**
 * The Microfilm changes hands: a frame of film flies from the film city's canister to `seat`'s
 * next empty frame in the scorebar, with the projector's clatter and the news on the ticker; the
 * scorebar's lights come up for it at night. It keeps the clock it is given: the reveal's (wait,
 * dur) at the final flip, so Speed up and Skip work, or plain timers outside a reveal. Under
 * reduced motion nothing flies: the frame just fills.
 */
async function flyStrip(v, seat, clock = { wait, dur }) {
  say(filmLine(v, v.round.result) || '');
  audio.film();
  const frame = $(`.scorebar .side.s-${seat} .reel .fr:not(.got)`);
  const can = $(`#board .city[data-city="${v.round.film}"] .plate .canister`);
  $('.scorebar')?.classList.add('film-in');
  if (frame && can && !reducedMotion()) {
    const a = can.getBoundingClientRect();
    const b = frame.getBoundingClientRect();
    const dx = Math.round(a.left + a.width / 2 - (b.left + b.width / 2));
    const dy = Math.round(a.top + a.height / 2 - (b.top + b.height / 2));
    const el = document.createElement('i');
    el.className = `fr got strip-fly own-${seat}`;
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
    document.body.append(el);
    can.classList.add('sending');
    // Out of the can, up in an arc over the board, turning as it goes, and down into the frame.
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(2.6) rotate(-18deg)`, opacity: 0 },
        { transform: `translate(${dx}px, ${dy - 12}px) scale(2.6) rotate(-14deg)`, opacity: 1, offset: 0.14 },
        { transform: `translate(${Math.round(dx * 0.45)}px, ${Math.round(dy * 0.45) - 72}px) scale(2) rotate(9deg)`, offset: 0.58 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: clock.dur(FLY_MS), easing: 'cubic-bezier(0.3, 0.1, 0.3, 1)', fill: 'both' },
    );
    await clock.wait(FLY_MS);
    el.remove();
  }
  frame?.classList.add('got', 'landed');
  await clock.wait(450);
}

/**
 * The Microfilm's line in a round's result, also the ticker's as the strip flies: who took a
 * strip of film and why, or why nobody did. Null when the match has no Microfilm.
 */
function filmLine(v, res) {
  const film = v.round.film;
  if (film === null || !res) return null;
  const city = cityName(v, film);
  const s = res.strip;
  if (s !== null && s !== undefined) {
    const name = label(s, v);
    const take = `${ui.mode !== 'pass' && s === me() ? 'you take' : `${name} takes`} a strip of film (${v.strips[s]} of ${v.reel})`;
    if (res.winner === null) return `${name} held ${city} in the dead heat: ${take}.`;
    if (res.winner !== s) return `${name} lost the round but held ${city}: ${take}.`;
    return `${name} held ${city}: ${take}.`; // the holder film (a sim switch): the winner takes it
  }
  if (res.folded !== null) return 'A fold: the film stays put.';
  if (res.winner === null || res.cityWinners?.[film] === null) return `Nobody holds ${city}: the film stays put.`;
  return `${label(res.winner, v)} won the round, so the film stays put.`;
}

/** How long the full reel's card stays up (skipped like the round card). */
const REEL_CARD_MS = 1800;

/**
 * The full reel wins the match: the bars come in in the winner's colour, a strip of film runs
 * through the gate with every frame exposed in that colour, "The full reel" lands, and the slip
 * under it says whose it is.
 */
function reelCard(v) {
  const w = v.winner;
  const you = ui.mode !== 'pass' && w === me();
  const name = label(w, v);
  const strips = v.reel === 1 ? 'the strip' : v.reel === 2 ? 'both strips' : `all ${inWords(v.reel)} strips`;
  const whose = ui.mode === 'pass' ? `${name}’s` : you ? 'yours' : 'theirs';
  const line = `${name} ${you ? 'have' : 'has'} ${strips}. The match is ${whose}.`;
  const frames = Array.from({ length: v.reel }, (_, i) => `<i style="--i:${i}">${spySVG()}</i>`).join('');
  const html = `<div class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="filmstrip" aria-hidden="true">${frames}</div>
    <h2 class="big">${jitter('The full reel', 13)}</h2>
    <p class="small">${esc(line)}</p>`;
  const done = showCard(html, `reel-card own-${w}`, REEL_CARD_MS, { label: `The full reel: ${line}` });
  if (ui.card) audio.slam();
  return done;
}

// ── title cards ─────────────────────────────────────────────────────────────

/** How long a round's title card stays up (a tap, Enter, Space or Escape skips it). */
const ROUND_CARD_MS = 2500;
/** How much longer it stays for each city met for the first time with fine print to read. */
const NEW_CITY_MS = 2000;
/** The cable types out from this far into the card, a key every CABLE_KEY_MS. */
const CABLE_DELAY = 350;
const CABLE_KEY_MS = 9;

/** A card put up now would show: showCard shows nothing with every animation skipped or a modal up. */
const cardsShow = () => !ui.alwaysSkip && !ui.modal;

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

/** Take down every overlay a match put up: the title card or flash on screen (one at a time), and a strip of film in flight. */
function clearOverlays() {
  ui.card?.skip();
  for (const el of document.querySelectorAll('.strip-fly')) el.remove();
}

/** The player skips the card on screen (a tap past its guard, or Enter, Space or Escape). */
function skipCard() {
  audio.place();
  ui.card.skip();
}

/**
 * The round's opening credits: "Round N", C's cable typed out on telegram tape, then each city in
 * turn (its skyline, name and rule), sliding in 250 ms apart over the Saul Bass bars. A city met for
 * the first time wears a New stamp, with its fine print under the rule (and the card stays longer).
 * Under reduced motion it stands still.
 */
function roundCard(v) {
  const n = v.roundNo + 1;
  const { film, pot } = v.round;
  const cities = v.round.cities.map((c) => CITY[c.id]);
  // Met as the card shows, so a skipped card leaves them new for the next one.
  const fresh = cardsShow() ? meet(meta, { cities: cities.map((c) => c.id) }).cities : [];
  if (fresh.length) saveMeta();
  const canister = canisterHTML({ label: false });
  const lines = cities
    .map((c, i) => {
      const isNew = fresh.includes(c.id);
      const tag = i === film ? `<span class="film-tag">${canister}Carries the film</span>` : '';
      const stamp = isNew ? '<i class="new-tag">New</i>' : '';
      const note = isNew && c.note ? `<span class="note">${esc(c.note)}</span>` : '';
      return `<div class="line${i === film ? ' film' : ''}${isNew ? ' new' : ''}" style="--i:${i}"><span class="sky" aria-hidden="true">${citySVG(c.id)}</span><div class="name"><h3>${esc(c.name)}</h3>${stamp}${tag}</div><p>${esc(c.rule)}</p>${note}</div>`;
    })
    .join('');
  // Under the credits: any points a dead heat rolled over. (The cable says where the film travels;
  // the card's label says it too.)
  const notes = [];
  const said = [];
  if (film !== null) said.push(`The film travels via ${cities[film].name}.`);
  if (pot > 0) {
    const line = `${pot} point${pot === 1 ? '' : 's'} rolled over into this round’s pot.`;
    notes.push(`<p class="pot-line">${esc(line)}</p>`);
    said.push(line);
  }
  const wire = cable(v);
  const html = `<div class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <h2 class="big">${jitter(`Round ${n}`, n + 4)}</h2>
    <p class="cable">${typedHTML(wire, { delay: CABLE_DELAY, per: CABLE_KEY_MS })}</p>
    <div class="slate">${lines}</div>
    ${notes.length ? `<div class="notes">${notes.join('')}</div>` : ''}`;
  const ms = ROUND_CARD_MS + NEW_CITY_MS * fresh.filter((id) => CITY[id].note).length;
  const done = showCard(html, 'title-card', ms, { label: [`Round ${n}: ${cities.map((c) => c.name).join(', ')}.`, ...said].join(' ') });
  clatter(ui.card, Math.ceil(wire.length / 2), CABLE_KEY_MS * 2, CABLE_DELAY);
  return done;
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

/** How long a rival's dossier stays up (skipped like every card): long enough to read the file. */
const DOSSIER_CARD_MS = 9000;
/** The DOSSIER stamp lands this far into the card (style.css .dossier-stamp), with the slam. */
const STAMP_MS = 560;

/**
 * The first time you meet a rival on the ladder, their file comes up in a manila folder over bars in
 * their colour, and the DOSSIER stamp slams on: the name, the file, the announced twist (`matchTwist`,
 * the twist this match plays: the view's), and what they bring to the table (or that they play Classic).
 */
function dossierCard(rival, matchTwist) {
  const i = RIVALS.findIndex((r) => r.id === rival.id);
  const twist = twistText(rival.id, matchTwist);
  const brings =
    rival.pack.agents.length || rival.pack.cities.length
      ? `<div class="brings"><h3>Brings to the table</h3>${packHTML(rival.pack)}</div>`
      : `<p class="brings">Plays Classic: the original ${DECK.length} agents and ${CLASSIC_CITIES.length} cities.</p>`;
  const html = `<div class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="folder">
      <div class="file-head"><p class="file-no">File ${i + 1} of ${RIVALS.length}</p><i class="dossier-stamp" aria-hidden="true">Dossier</i></div>
      <h2 class="who">${jitter(rival.name, i + 2)}</h2>
      <p class="file">${esc(DOSSIERS[rival.id])}</p>
      ${twist ? `<p class="twist"><i>Twist</i> ${esc(twist)}</p>` : ''}
      ${brings}
    </div>`;
  const done = showCard(html, `dossier-card own-${foe()}`, DOSSIER_CARD_MS, { label: `Dossier: ${rival.name}. ${DOSSIERS[rival.id]}${twist ? ` Twist: ${twist}` : ''}` });
  const card = ui.card;
  if (card) setTimeout(() => ui.card === card && audio.slam(), reducedMotion() ? 0 : STAMP_MS);
  return done;
}

/** How long tonight's roster stays up (skipped like every card). */
const ROSTER_CARD_MS = 6000;
/** How much longer it stays for each agent met for the first time (its text and fine print), up to ROSTER_MAX_MS. */
const NEW_AGENT_MS = 2000;
const ROSTER_MAX_MS = 20000;

/** The Classic 12, in any order (a Mixed draw can come out as exactly those). */
const isClassic = (roster) => roster.length === DECK.length && DECK.every((id) => roster.includes(id));

/**
 * A match that isn't Classic opens on its roster: the agents every player holds tonight, dealt onto
 * the card as small paper cards. Agents met for the first time (`fresh`) wear a New stamp, and their
 * text and fine print follow on slips under the deal.
 */
function rosterCard(v, fresh) {
  const minis = v.roster
    .map((id, i) => {
      const a = AGENT[id];
      const isNew = fresh.includes(id);
      return `<div class="mc${isNew ? ' new' : ''}" style="--i:${i}"><b class="pow">${a.power}</b><span class="art" aria-hidden="true">${agentSVG(id)}</span><span class="nm">${esc(a.name)}</span>${isNew ? '<i class="new-tag">New</i>' : ''}</div>`;
    })
    .join('');
  const news = fresh
    .map((id, i) => {
      const a = AGENT[id];
      return `<div class="news-line" style="--i:${i}"><span class="art" aria-hidden="true">${agentSVG(id)}</span><div class="txt"><h3>${esc(a.name)} <b>${a.power}</b></h3><p>${esc(a.text)}</p>${a.note ? `<p class="note">${esc(a.note)}</p>` : ''}</div></div>`;
    })
    .join('');
  // Every deck deals the roster; a rival's `extra` twist adds one card to theirs.
  const t = v.twist;
  const extra = t?.id === 'extra' ? ` ${v.names?.[t.seat] ?? 'Your rival'} carries one more: an extra ${AGENT[t.kind].name}.` : '';
  const html = `<div class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <h2 class="big">${jitter('Tonight’s roster', 8)}</h2>
    <p class="sub">Every deck at the table holds these ${v.roster.length} agents.${esc(extra)}</p>
    <div class="minis">${minis}</div>
    ${news ? `<div class="news">${news}</div>` : ''}`;
  const named = (ids) => ids.map((id) => AGENT[id].name).join(', ');
  const label = `Tonight’s roster: ${named(v.roster)}.${fresh.length ? ` New to you: ${named(fresh)}.` : ''}`;
  const ms = Math.min(ROSTER_MAX_MS, ROSTER_CARD_MS + NEW_AGENT_MS * fresh.length);
  const done = showCard(html, 'roster-card', ms, { label });
  if (ui.card) audio.drop();
  return done;
}

/** How long the epilogue stays up (skipped like every card), and how it types: a key every EPILOGUE_KEY_MS, a pause between lines. */
const EPILOGUE_MS = 12000;
const EPILOGUE_KEY_MS = 38;
const EPILOGUE_PAUSE_MS = 450;

/**
 * After a ladder win over Control (and again from the rivals screen): C's last cable, typed out line
 * by line on a telegram form over oxblood bars, and signed in red.
 */
function epilogueCard() {
  let at = 500;
  const starts = [];
  const lines = EPILOGUE.map((line, i) => {
    starts.push([at, line.length]);
    const html = `<p class="eline${i === EPILOGUE.length - 1 ? ' sig' : ''}">${typedHTML(line, { delay: at, per: EPILOGUE_KEY_MS })}</p>`;
    at += line.length * EPILOGUE_KEY_MS + EPILOGUE_PAUSE_MS;
    return html;
  }).join('');
  const html = `<div class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="telegram"><p class="form-head" aria-hidden="true"><span>Cable</span><span>Most secret</span></p>${lines}</div>`;
  const done = showCard(html, 'epilogue-card', EPILOGUE_MS, { label: `Epilogue: ${EPILOGUE.join(' ')}` });
  const card = ui.card;
  for (const [t, n] of starts) clatter(card, n, EPILOGUE_KEY_MS, t);
  return done;
}

/**
 * A teleprinter's clatter while a card types: `keys` soft clicks `gap` ms apart, from `delay` ms, for
 * as long as `card` stays up. None under reduced motion (nothing types) or in a hidden tab.
 */
function clatter(card, keys, gap, delay = 0) {
  if (!card || reducedMotion()) return;
  let i = 0;
  const key = () => {
    if (ui.card !== card || document.hidden || i >= keys) return;
    i++;
    sfx.noise({ dur: 0.016, freq: 2800 + (i % 3) * 650, type: 'bandpass', q: 4, vol: 0.05 });
    setTimeout(key, gap);
  };
  setTimeout(key, delay);
}

/**
 * The computer rival's remark of `kind` (REMARKS: start, escalate, fold, won, lost), picked at random
 * and said in the ticker. Solo only, and never during a reveal. Returns the line, or null.
 */
function remark(kind) {
  if (ui.mode !== 'solo' || !ui.rival || ui.animating) return null;
  const lines = REMARKS[ui.rival.id]?.[kind];
  if (!lines?.length) return null;
  const text = lines[Math.floor(Math.random() * lines.length)];
  say(text);
  return text;
}

function say(text) {
  ui.caption = text;
  ui.typeNext = text;
  const el = $('#ticker');
  if (el) {
    el.textContent = text;
    el.classList.remove('typing');
    void el.offsetWidth;
    el.classList.add('typing');
  }
}

/** "Courier", "Courier and Blackmailer", "Prague, Glienicke Bridge and Geneva". */
const andList = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/**
 * What a ladder win added to the network, as the toast says it: "Recruited: Courier and Blackmailer.
 * Tokyo and Macau join your network." Empty when nothing new came in (Wren brings nothing).
 */
function recruitsText(before, after) {
  const agents = after.agents.filter((id) => !before.agents.includes(id)).map((id) => AGENT[id].name);
  const cities = after.cities.filter((id) => !before.cities.includes(id)).map((id) => CITY[id].name);
  const out = [];
  if (agents.length) out.push(`Recruited: ${andList(agents)}.`);
  if (cities.length) out.push(`${andList(cities)} ${cities.length === 1 ? 'joins' : 'join'} your network.`);
  return out.join(' ');
}

/** Show a ladder win's held recruits toast (after the epilogue, or on leaving before it), once. */
function flushRecruits() {
  if (!ui.recruits) return;
  toast(ui.recruits, 6000);
  ui.recruits = null;
}

function finishMatch(v) {
  if (ui.mode === 'solo') {
    const won = v.winner === 0;
    // Only the ladder recruits: a win there adds the rival to your record, and its pack to your network.
    if (won && ui.rival && !ui.free) {
      // Beating Control, the last rival, plays the epilogue at Final report: its recruits toast waits
      // until the card has gone (flushRecruits), rather than running on over the card.
      const ending = ui.rival.id === RIVALS[RIVALS.length - 1].id;
      if (!meta.beaten.includes(ui.rival.id)) {
        const before = network(meta.beaten);
        meta.beaten = RIVALS.map((r) => r.id).filter((id) => id === ui.rival.id || meta.beaten.includes(id));
        const recruits = recruitsText(before, network(meta.beaten));
        if (recruits && ending) ui.recruits = recruits;
        else if (recruits) toast(recruits, 6000);
      }
      if (ending) ui.epilogue = true;
    }
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

/**
 * Text typed out a key at a time (style.css .typed): each character shows `per` ms after the one
 * before, from `delay` ms. Words never break across lines, and the whole line is there at once for
 * screen readers (and under reduced motion, for everyone).
 */
function typedHTML(text, { delay = 0, per = 12 } = {}) {
  let k = 0;
  const words = text.split(' ').map((word) => {
    const keys = [...word].map((ch) => `<i style="--t:${delay + k++ * per}ms">${esc(ch)}</i>`).join('');
    k++; // the space
    return `<span class="word">${keys}</span>`;
  });
  return `<span class="typed" aria-hidden="true">${words.join(' ')}</span><span class="vh">${esc(text)}</span>`;
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
  const against = RIVALS.find((r) => r.id === resume?.rival)?.name || 'the computer';
  const resumeLabel = canResume ? (resume.mode === 'pass' ? 'Continue pass and play' : resume.free ? `Continue free play against ${against}` : `Continue against ${against}`) : '';
  const net = network(meta.beaten);
  const intro = !ui.introDone;
  ui.introDone = true;
  return `<div class="title-screen${intro ? ' intro' : ''}">
    <div class="poster">
      <div class="bars" aria-hidden="true"><i></i><i></i><i></i></div>
      <h1 class="logo" aria-label="Dead Drop">${jitter('Dead', 11)}<br>${jitter('Drop', 5)}</h1>
      <p class="tagline">Winter, 1963. Run a network of agents against rival services: drop in secret, flip together, call the bluff.</p>
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
      <p class="network">Network: <b>${net.agents.length}</b> of ${AGENTS.length} agents · <b>${net.cities.length}</b> of ${CITIES.length} cities</p>
    </nav>
  </div>`;
}

/** The first rival whose win grows the network past Classic (the Magpie): free play opens with it. */
const FIRST_PACK = RIVALS.find((r) => r.pack.agents.length || r.pack.cities.length);
/** The network has grown past Classic, so free play (Mixed from it) has something to mix. */
const freeOpen = () => {
  const net = network(meta.beaten);
  return net.agents.length > DECK.length || net.cities.length > CLASSIC_CITIES.length;
};
/** Who brings agent or city `id` to the ladder (`kind`: agents | cities), or undefined for Classic. */
const recruiter = (kind, id) => RIVALS.find((r) => r.pack[kind].includes(id));

/** A pack's agents and cities as small silhouettes with their names (on a rival's row). */
function packHTML(pack) {
  const agents = pack.agents.map((id) => `<span class="mini mini-agent"><span class="art">${agentSVG(id)}</span>${esc(AGENT[id].name)}</span>`);
  const cities = pack.cities.map((id) => `<span class="mini mini-city"><span class="art">${citySVG(id)}</span>${esc(CITY[id].name)}</span>`);
  return `<span class="pack">${[...agents, ...cities].join('')}</span>`;
}

/** A segmented switch: [id, label, disabled] options, the chosen one pressed. */
function switchHTML(action, options, chosen, label) {
  return `<div class="seg-switch" role="group" aria-label="${esc(label)}">${options
    .map(([id, name, off]) => `<button class="seg" data-action="${action}" data-choice="${id}" aria-pressed="${id === chosen}"${off ? ' disabled' : ''}>${esc(name)}</button>`)
    .join('')}</div>`;
}

function rivalsHTML() {
  const open = freeOpen();
  if (!open) ui.rivalsTab = 'ladder';
  const free = ui.rivalsTab === 'free';
  const next = RIVALS.findIndex((r) => !meta.beaten.includes(r.id));
  const note = free
    ? 'Any rival you’ve beaten, or Agent Wren, on a Mixed roster from your network, with no twist. Wins here recruit nobody.'
    : open
      ? 'Beat each rival in turn. Every win recruits their agents and cities into your network.'
      : `Beat each rival in turn. Every win recruits their agents and cities into your network. Free play opens once you beat ${FIRST_PACK.name}.`;
  const row = (r, i) => {
    const beaten = meta.beaten.includes(r.id);
    if (free) {
      return `<li><button class="rival free" data-action="rival" data-id="${r.id}" data-free="1">
          <span class="rank">${i + 1}</span><span class="who"><b>${esc(r.name)}</b><span class="blurb">Mixed: your network · no twist</span></span>
          <span class="state">Play</span></button></li>`;
    }
    const isOpen = i === 0 || meta.beaten.includes(RIVALS[i - 1].id);
    const met = beaten || meta.met?.rivals?.includes(r.id);
    const twist = twistText(r.id);
    const hasPack = r.pack.agents.length || r.pack.cities.length;
    const extra = !isOpen
      ? ''
      : `${twist ? `<span class="twist"><i>Twist</i> ${esc(twist)}</span>` : ''}${
          !hasPack
            ? `<span class="brings">Plays Classic: the original ${DECK.length} agents and ${CLASSIC_CITIES.length} cities.</span>`
            : met
              ? packHTML(r.pack)
              : `<span class="brings">Brings ${counted(r.pack.agents.length, 'new agent')} and ${counted(r.pack.cities.length, 'new city', 'new cities')}.</span>`
        }`;
    return `<li><button class="rival${beaten ? ' beaten' : ''}${i === next ? ' next' : ''}" data-action="rival" data-id="${r.id}" ${isOpen ? '' : 'disabled'}>
          <span class="rank">${i + 1}</span><span class="who"><b>${esc(r.name)}</b><span class="blurb">${esc(isOpen ? r.blurb : `Beat ${RIVALS[i - 1].name} to unlock.`)}</span>${extra}</span>
          <span class="state">${beaten ? 'Beaten' : isOpen ? 'Play' : 'Locked'}</span></button></li>`;
  };
  const rows = RIVALS.map((r, i) => [r, i]).filter(([r, i]) => !free || i === 0 || meta.beaten.includes(r.id));
  const ending = meta.beaten.includes(RIVALS[RIVALS.length - 1].id);
  return `<div class="rivals-screen">
    <h2 class="cut-h">${jitter('Rival services', 2)}</h2>
    <div class="rivals-head">
      ${switchHTML('rivals-tab', [['ladder', 'Ladder', false], ['free', 'Free play', !open]], ui.rivalsTab, 'Ladder or free play')}
      <p class="seg-note">${esc(note)}</p>
    </div>
    <ol class="rivals">
      ${rows.map(([r, i]) => row(r, i)).join('')}
    </ol>
    ${ending ? '<p class="epilogue-link"><button class="link" data-action="epilogue">Read the epilogue</button></p>' : ''}
    <button class="slip quiet" data-action="title">Back</button>
  </div>`;
}

/**
 * The host's table can still change its roster: nobody has joined, and nothing has been played on it
 * (a host reload in the lobby resumes an untouched table, which may change too).
 */
function lobbyOpen() {
  const S = table?.state;
  return ui.mode === 'host' && !!S && !ui.net?.session?.guest && S.phase === 'plan' && S.roundNo === 0 && S.round.turn === 1 && !S.round.plans.some(Boolean);
}

/** The host's roster switch (Classic first, the default), until a guest joins. */
function lobbyRosterHTML() {
  const mixed = !!table.setup.mixed;
  return `<div class="roster-pick">
      <span class="lbl">Roster</span>
      ${switchHTML('host-roster', [['classic', 'Classic', false], ['mixed', 'Mixed', false]], mixed ? 'mixed' : 'classic', 'Roster')}
      <p class="seg-note">${mixed ? `Mixed: ${ROSTER.size} agents drawn from all ${AGENTS.length}, and all ${CITIES.length} cities.` : `Classic: the original ${DECK.length} agents and ${CLASSIC_CITIES.length} cities. Best for a first match.`}</p>
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
      ${lobbyOpen() ? lobbyRosterHTML() : ''}
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

/** The city id at index `ci` of the view's round. */
const cityId = (v, ci) => v.round.cities[ci]?.id;

/** An Accomplice is selected and its city offers partner drops: the hand asks for a partner (or Drop alone). */
function partnerPrompt(v) {
  if (!ui.selected || ui.target === null || myPlan(v) || v.phase !== 'plan') return false;
  return v.round.legal.some((d) => d.uid === ui.selected && d.city === ui.target && d.partner);
}

/** Casablanca is the target: the drop's face is a choice (Face up / Face down, key V). */
function faceChoice(v) {
  return !!ui.selected && ui.target !== null && !myPlan(v) && v.phase === 'plan' && cityId(v, ui.target) === 'casablanca';
}

/** The face chosen for Casablanca: ui.down, or else the agent's own face (a Sleeper drops face down). */
function planDown(v) {
  const sel = v.round.hand.find((c) => c.uid === ui.selected);
  return ui.down ?? !!(sel && AGENT[sel.kind].faceDown);
}

/** The partner card to send with the drop, or null (none chosen, or Drop alone). */
const partnerUid = (v) => (partnerPrompt(v) && ui.partner && ui.partner !== 'alone' ? ui.partner : null);

/** The seat wiretapping me this turn (it hears the city I lock in), or null. */
function listener(v) {
  const t = (v.round.taps || []).find((x) => x.on === me() && x.by !== me());
  return t ? t.by : null;
}

function statusText(v) {
  const R = v.round;
  const rival = foe(v);
  if (v.phase !== 'plan') return '';
  // Pass and play with no hand uncovered (behind the intro cards, say): the table is nobody's, so the
  // line names the operation and whose turn is next, as the cover will, never a seat's pass.
  if (ui.mode === 'pass' && ui.seat === null) {
    const next = table && passActor();
    return `Operation ${operation(v.matchId, v.roundNo).name}.${next ? ` Pass the device to ${label(next.seat, v)}.` : ''}`;
  }
  if (R.pending && R.pending.by === me()) return `Waiting for ${label(rival, v)} to answer your escalation…`;
  if (!R.legal.length) return `Nowhere to drop this turn: you pass.${R.rivalLocked ? '' : ` ${label(rival, v)} is choosing…`}`;
  const ear = listener(v);
  if (myPlan(v)) return R.rivalLocked ? 'Both locked in.' : ear !== null ? `Locked in. ${label(ear, v)} has heard your city, and is choosing…` : `Locked in. ${label(rival, v)} is choosing…`;
  const sel = R.hand.find((c) => c.uid === ui.selected);
  const rivalNote = R.rivalLocked ? ` ${label(rival, v)} has locked in.` : '';
  const listening = ear !== null ? ` ${label(ear, v)} is listening: they’ll hear which city you pick.` : '';
  // My own wiretap: what it has heard so far.
  const heard = (R.tapped || []).find((t) => t.seat !== me());
  const tapNote = heard ? (heard.city === null ? ` Your tap on ${label(heard.seat, v)} is live.` : ` Your tap: ${label(heard.seat, v)} picked ${cityName(v, heard.city)}.`) : '';
  const notes = `${listening}${tapNote}${rivalNote}`;
  if (sel && ui.target !== null) {
    if (partnerPrompt(v) && ui.partner === null) return `Pick a partner to drop face down with your ${AGENT[sel.kind].name}, or drop it alone.${notes}`;
    const mate = R.hand.find((c) => c.uid === partnerUid(v));
    const company = mate ? ` and ${AGENT[mate.kind].name} (face down)` : partnerPrompt(v) ? ' alone' : '';
    const face = faceChoice(v) ? `, ${planDown(v) ? 'face down' : 'face up'}` : '';
    return `Lock in your ${AGENT[sel.kind].name}${company} for ${cityName(v, ui.target)}${face}.${notes}`;
  }
  if (sel) return `${AGENT[sel.kind].name}: ${AGENT[sel.kind].text} Now pick a city.${notes}`;
  return `Pick an agent from your hand.${notes}`;
}

/** Gentle teaching lines for the first couple of matches. */
function hintText(v) {
  if (meta.matches > 2 || v.phase !== 'plan' || v.roundNo > 1) return '';
  const t = v.round.turn;
  if (v.roundNo === 0 && t === 1) return 'You and your rival both drop an agent in secret. Then the cards flip together, and the First flip token shows whose tricks go first.';
  if (v.roundNo === 0 && t === 2) return 'Higher total holds a city. Hold two of the three cities after six drops to win the round.';
  if (v.roundNo === 0 && t === 3) {
    // "left" once one is spent (an escalation on turn 1 or 2).
    const left = v.tokens[me()];
    const have = left < RULES.tokens ? `${counted(left, 'token')} left for the match` : `${counted(left, 'token')} for the whole match`;
    return `Feeling strong? Escalate doubles the stake.${left > 0 ? ` You have ${have}, so pick your moments.` : ''}`;
  }
  if (v.roundNo === 0 && t === 4 && v.round.film !== null) return `The canister marks the Microfilm. Lose a round but hold that city, and you take a strip of film. ${reelSentence(v.reel)}.`;
  if (v.roundNo === 0 && t === TURNS) return `Final turn: the stake doubles when the cards flip. Fold now and your rival takes only the current stake${v.round.pot > 0 ? ' (and the pot)' : ''}.`;
  if (v.roundNo === 1 && t === 1) return 'Tap any card on the board to read what it does.';
  return '';
}

function inspectText(v) {
  if (!ui.inspect) return '';
  const all = [...v.round.cities.flatMap((c) => c.sides.flat()), ...v.round.hand];
  const cv = all.find((c) => c.uid === ui.inspect);
  if (!cv) return '';
  if (!cv.kind) return faceDownText(v, cv);
  const a = AGENT[cv.kind];
  const extra = [];
  if (cv.power !== null && cv.power !== a.power) extra.push(`power ${cv.power} right now`);
  if (cv.tricks === false && !['heavy', 'sleeper'].includes(cv.kind)) extra.push('tricks switched off here');
  if (cv.id0 && cv.id0 !== cv.kind) extra.push('an Impostor in disguise');
  // Everyone in Havana switches sides, so there "turned" says nothing new.
  if (cv.city !== null && cv.origin !== cv.owner && v.round.cities[cv.city].id !== 'havana') extra.push('a turned asset');
  if (cv.partner) extra.push('dropped as an Accomplice’s partner');
  if (cv.placed) extra.push('placed before the round began');
  return `${a.name} (${a.power}): ${a.text}${extra.length ? ` Now: ${extra.join(', ')}.` : ''}`;
}

/**
 * One side's marks: its escalation tokens (one chit per token it started the match with, spent
 * ones outlined) and, with a reel, its film frames (filled once earned).
 */
function marksHTML(v, seat) {
  const left = v.tokens[seat];
  const chits = Math.max(RULES.tokens, left);
  const tokens = `<span class="tokens" role="img" aria-label="${left} escalation token${left === 1 ? '' : 's'} left" title="Escalation tokens: ${left} of ${chits} left">${Array.from({ length: chits }, (_, i) => `<i class="tk${i < left ? '' : ' spent'}"></i>`).join('')}</span>`;
  const got = v.strips[seat];
  const reel = v.reel > 0 ? `<span class="reel" role="img" aria-label="${got} of ${v.reel} film strips" title="Film strips: ${got} of ${v.reel}. ${reelSentence(v.reel)}.">${Array.from({ length: v.reel }, (_, i) => `<i class="fr${i < got ? ' got' : ''}"></i>`).join('')}</span>` : '';
  return `<span class="marks">${tokens}${reel}</span>`;
}

/** The twist `seat` plays under (a ladder rival's), in words from the match's own twist; null for none. */
const twistOf = (v, seat) => (ui.mode === 'solo' && ui.rival && v.twist && v.twist.seat === seat ? twistText(ui.rival.id, v.twist) : null);

/**
 * Card counting: what this round's views have shown `viewer` of the cards on the table, kept in
 * ui.sighted (reset each round). A card sent home comes back under a new uid, so sightings are
 * counted by kind: for each deck (origin) and kind, the most one view has shown at once. A twist's
 * placed card is face down, but its kind is announced, so it counts as seen.
 */
function feedSightings(v) {
  if (!v || !Number.isInteger(v.seat) || v.seat < 0) return;
  const key = `${v.matchId}:${v.roundNo}`;
  if (ui.sighted?.key !== key) ui.sighted = { key, seen: new Map() };
  const here = new Map();
  const add = (origin, id0) => {
    const k = `${v.seat}:${origin}:${id0}`;
    here.set(k, (here.get(k) || 0) + 1);
  };
  const shown = new Set();
  for (const s of sightings(v)) {
    shown.add(s.uid);
    add(s.origin, s.id0);
  }
  const placed = v.twist?.id === 'placed' ? v.twist.kind : null;
  if (placed) for (const c of v.round.cities) for (const side of c.sides) for (const cv of side) if (cv.placed && !cv.kind && !shown.has(cv.uid)) add(cv.origin, placed);
  for (const [k, n] of here) if (n > (ui.sighted.seen.get(k) || 0)) ui.sighted.seen.set(k, n);
}

/** The agents of `seat`'s deck list `viewer` hasn't seen this round, in list order (the unseen strip). */
function unseenOf(v, seat, viewer) {
  const seen = [];
  if (ui.sighted?.key === `${v.matchId}:${v.roundNo}`) {
    for (const [k, n] of ui.sighted.seen) {
      const [who, origin, id0] = k.split(':');
      if (Number(who) === viewer && Number(origin) === seat) for (let i = 0; i < n; i++) seen.push(id0);
    }
  }
  return unseen(deckList(v, seat), seen);
}

/** A rival's tools under its name: its twist as a stamped chip (a tap reads it out), and the unseen strip's toggle. */
function intelHTML(v, seat, viewer) {
  const twist = twistOf(v, seat);
  const chip = twist ? `<button class="twist-chip" data-action="twist" data-seat="${seat}" aria-label="Twist: ${esc(twist)}" title="${esc(twist)}">Twist</button>` : '';
  const open = ui.unseenOpen === seat;
  const k = unseenOf(v, seat, viewer).length;
  // The button is the 40px target; its paper tab is the face inside it. The open strip hangs from the
  // scorebar (its containing block), over the board.
  return `<span class="intel">${chip}<button class="unseen-btn${open ? ' open' : ''}" data-action="unseen" data-seat="${seat}" aria-expanded="${open}" aria-controls="unseen-${seat}" title="${esc(label(seat, v))}’s agents you haven’t seen this round (U)"><span class="face">Unseen <b>${k}</b><i aria-hidden="true">▾</i><kbd>U</kbd></span></button>${unseenPanelHTML(v, seat, viewer)}</span>`;
}

/** The open unseen strip: the agents `viewer` hasn't seen of `seat`'s deck list this round, and its hand and deck counts. It hangs over the board. */
function unseenPanelHTML(v, seat, viewer) {
  if (ui.unseenOpen !== seat) return '';
  const ids = unseenOf(v, seat, viewer);
  const R = v.round;
  const name = label(seat, v);
  const items = ids.map((id) => `<li class="mini mini-agent"><span class="art">${agentSVG(id)}</span>${esc(AGENT[id].name)}</li>`).join('');
  const enter = ui.unseenEnter;
  ui.unseenEnter = false;
  return `<div class="unseen-panel own-${seat}${enter ? ' enter' : ''}" id="unseen-${seat}" role="region" aria-label="${esc(name)}: agents you haven’t seen this round">
      <p class="unseen-head"><b>Not seen this round</b><span>Hand ${R.handCounts[seat]} · Deck ${R.deckCounts[seat]}</span></p>
      ${ids.length ? `<ul class="unseen-list">${items}</ul>` : `<p class="unseen-none">You’ve seen every agent ${esc(name)} holds this round.</p>`}
    </div>`;
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
  // The pot (points a dead heat rolled over) hangs off the slip's left edge. After a fold the pot
  // holds the folded stake too, which the result explains: the slip shows it only while it's at stake.
  const pot = R.pot > 0 && (v.phase === 'plan' || R.result?.folded === null) ? `<i class="pot" title="The pot: the round’s winner takes it">+${R.pot}</i>` : '';
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
    <div class="side s-${top} has-intel"><span class="tag"><span class="who">${esc(label(top, v))}</span>${token(top)}</span>${marksHTML(v, top)}<b class="score" data-score="${top}">${v.scores[top]}</b>${intelHTML(v, top, bottom)}</div>
    <div class="mid">
      <span class="stake${stake > 1 ? ' hot' : ''}" title="Points this round is worth">${pot}Stake <b>${stake}</b>${stakeNote}</span>
      <span class="turn">${v.phase === 'plan' ? `Turn ${R.turn} of ${TURNS}` : `Round ${v.roundNo + 1}`} · first to ${v.target}</span>
    </div>
    <div class="side s-${bottom}"><b class="score" data-score="${bottom}">${v.scores[bottom]}</b>${marksHTML(v, bottom)}<span class="tag">${token(bottom)}<span class="who">${esc(label(bottom, v))}</span></span></div>
  </div>`;
}

function controlsHTML(v) {
  const R = v.round;
  if (v.phase !== 'plan' || ui.mode === 'pass' && ui.seat === null) return `<div class="controls"><p class="status">${esc(statusText(v))}</p></div>`;
  // Escalating spends a token: with none left the button stays disabled and says so. A round escalates
  // once (a Blackmailer's flip counts), so after that it is disabled and says that instead.
  const left = v.tokens[me()];
  const already = R.escalated.some(Boolean);
  const canEsc = left > 0 && !already && !R.pending;
  const escLabel = already ? 'Escalated this round' : left > 0 ? `Escalate: ${left} token${left === 1 ? '' : 's'} left` : 'Escalate: no tokens left';
  // An Accomplice's drop waits for its partner (or Drop alone) before it can lock in.
  const ask = partnerPrompt(v);
  const sel = ui.selected && ui.target !== null && (!ask || ui.partner !== null);
  const lockBtn = myPlan(v)
    ? `<button class="slip" data-action="unlock" ${R.rivalLocked || !R.plan ? 'disabled' : ''}>Take back<kbd>Esc</kbd></button>`
    : `<button class="slip primary${sel ? ' ready' : ''}" data-action="lock" ${sel ? '' : 'disabled'}>Lock in<kbd>Enter</kbd></button>`;
  // The choices this drop asks for: Casablanca's face (both faces on one slip, the chosen one inked)
  // and the Accomplice's Drop alone.
  const choice = [];
  if (faceChoice(v)) {
    const down = planDown(v);
    choice.push(
      `<button class="slip quiet face" data-action="face" aria-pressed="${down}" aria-label="Face down" title="Face up or face down (V)"><span class="up${down ? '' : ' on'}">Face up</span><span class="dn${down ? ' on' : ''}">Face down</span><kbd>V</kbd></button>`,
    );
  }
  if (ask) choice.push(`<button class="slip quiet alone" data-action="alone" aria-pressed="${ui.partner === 'alone'}">Drop alone</button>`);
  return `<div class="controls">
    <p class="status">${esc(statusText(v))}</p>
    <div class="btns">
      ${choice.length ? `<span class="choice">${choice.join('')}</span>` : ''}
      <button class="slip esc${left > 0 ? '' : ' out'}" data-action="escalate" aria-label="${escLabel}" title="${escLabel}" ${canEsc ? '' : 'disabled'}><span>Escalate</span><small class="left">${left} left</small><kbd>E</kbd></button>
      <button class="slip" data-action="fold">Fold<kbd>F</kbd></button>
      ${lockBtn}
    </div>
  </div>`;
}

function handHTML(v, disabled) {
  const R = v.round;
  if (ui.mode === 'pass' && ui.seat === null) return '<div class="hand empty" id="hand"></div>';
  const legalUids = new Set(R.legal.map((d) => d.uid));
  // While an Accomplice asks for a partner, the cards that can go with it are tapped to choose one.
  const mates = !disabled && partnerPrompt(v) ? new Set(R.legal.filter((d) => d.uid === ui.selected && d.city === ui.target && d.partner).map((d) => d.partner)) : null;
  // Cards a rival has seen (Control's twist), with who saw them.
  const seen = new Map((R.exposed || []).filter((e) => e.by !== me()).map((e) => [e.uid, label(e.by, v)]));
  return `<div class="hand${mates ? ' asking' : ''}" id="hand" style="--n:${R.hand.length}" data-n="${R.hand.length}">${R.hand
    .map((cv, i) =>
      cardHTML(cv, i, {
        selected: ui.selected === cv.uid,
        disabled: disabled || !!myPlan(v) || !legalUids.has(cv.uid) || v.phase !== 'plan',
        candidate: !!mates?.has(cv.uid),
        mate: !!mates?.has(cv.uid) && ui.partner === cv.uid,
        seenBy: seen.get(cv.uid) ?? null,
      }),
    )
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
  // A fold pays the stake (and any pot) to whoever is left; a flip win pays the doubled stake plus
  // the pot; a dead heat rolls the stake and the pot into the next round's pot.
  if (res.folded !== null) lines.push(esc(`${label(res.winner, v)} ${ui.mode !== 'pass' && res.winner === me() ? 'score' : 'scores'} ${res.points} (the stake${res.points > res.stake ? ' and the pot' : ''}).`));
  else {
    const verb = (seat, word) => (ui.mode !== 'pass' && seat === me() ? word : `${word}s`);
    R.cities.forEach((c, ci) => {
      const w = res.cityWinners[ci];
      const t = res.totals[ci];
      // Reykjavik is held on heads, so its line counts agents.
      const n = (s) => c.sides[s].length;
      const power = `${t[bottom]} to ${t[foe(v, bottom)]}`;
      // (A tie on heads goes to the higher total, so then both show.)
      const heads = n(bottom) === n(foe(v, bottom)) ? `${counted(n(bottom), 'agent')} each, ${power}` : `${counted(n(bottom), 'agent')} to ${inWords(n(foe(v, bottom)))}`;
      const score = c.id === 'reykjavik' ? heads : power;
      lines.push(`<span class="city-line w-${w === null ? 'none' : w === bottom ? 'me' : 'them'}"><b>${esc(CITY[c.id].name)}</b> ${w === null ? 'nobody' : esc(label(w, v))} <small>${score}</small></span>`);
    });
    // Geneva's tie went to whoever was behind on points.
    const gi = R.cities.findIndex((c) => c.id === 'geneva');
    const gw = gi >= 0 ? res.cityWinners[gi] : null;
    if (gw !== null && allSeats(v).some((s) => s !== gw && R.cities[gi].sides[s].length && res.totals[gi][s] === res.totals[gi][gw])) {
      lines.push(`<span class="pts">Geneva: tied at ${res.totals[gi][gw]}, so it goes to ${esc(labelLower(gw, v))}, behind in the match.</span>`);
    }
    // A round tied on cities that Zurich decided.
    const zi = R.cities.findIndex((c) => c.id === 'zurich');
    if (res.winner !== null && zi >= 0 && res.cityWinners[zi] === res.winner) {
      const held = (s) => res.cityWinners.filter((w) => w === s).length;
      if (allSeats(v).some((s) => s !== res.winner && held(s) === held(res.winner))) lines.push(`<span class="pts">Tied on cities: Zurich decides, and ${esc(labelLower(res.winner, v))} ${verb(res.winner, 'hold')} it.</span>`);
    }
    // Macau: the round's winner held it, and scores the stake once more per time (in the points above).
    const macau = res.macau ?? null;
    const extra = macau !== null ? res.stake * CITY.macau.times : 0;
    if (res.winner !== null) lines.push(`<span class="pts">+${res.points} to ${esc(label(res.winner, v))} <small>stake ${res.stake}, doubled on the final flip${res.pot > 0 ? `, plus a pot of ${res.pot}` : ''}${extra ? `, plus ${extra} for Macau` : ''}</small></span>`);
    else {
      // The match can end on a dead heat (Monaco's +1, or the reel): then nothing rolls on.
      const points = `${res.carry} point${res.carry === 1 ? '' : 's'}`;
      const carry = res.carry > 0 ? (over ? ` ${points} left on the table.` : ` ${points} ${res.carry === 1 ? 'rolls' : 'roll'} into the next round’s pot.`) : '';
      lines.push(`<span class="pts">Nobody scores.${esc(carry)}</span>`);
    }
    if (res.monaco !== null && res.monaco !== undefined) lines.push(`<span class="pts">+1 Monaco bonus to ${esc(label(res.monaco, v))}</span>`);
    if (macau !== null) lines.push(`<span class="pts">+${extra} Macau: ${esc(label(macau, v))} won the round holding it</span>`);
  }
  // The Microfilm: a frame in the taker's colour beside who took a strip, or the canister (the
  // film stays in it) beside why nobody did.
  const film = filmLine(v, res);
  if (film !== null) {
    const taken = res.strip !== null && res.strip !== undefined;
    const icon = taken ? `<i class="fr got own-${res.strip}" aria-hidden="true"></i>` : canisterHTML({ label: false });
    lines.push(`<span class="pts strip-line${taken ? ' taken' : ''}">${icon}<span>${esc(film)}</span></span>`);
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
  // The rival's remark on the round, said in the ticker as the result came up: the panel covers the ticker, so it says it too.
  const said = ui.remark?.key === `${v.matchId}:${v.roundNo}` ? ui.remark.text : null;
  return `<div class="result${enter ? ' enter' : ''}" role="dialog" aria-label="Round result">
    <h2>${jitter(head, v.roundNo + 3)}</h2>
    <div class="lines">${lines.map((l) => `<p>${l}</p>`).join('')}</div>
    <p class="tally">${esc(label(bottom, v))} ${v.scores[bottom]} · ${v.scores[foe(v, bottom)]} ${esc(label(foe(v, bottom), v))}</p>
    ${said ? `<p class="remark">${esc(said)}</p>` : ''}
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

/**
 * The play screen. During a reveal, `board` is the view the turn is flipped over and `hand` the
 * view after it. `still` draws a board that is playing something out outside a reveal (a fold's
 * exit): no choosing, no ghost, a quiet hand, and only the status line under the ticker.
 */
function renderPlay({ board = view(), hand = board, revealing = false, still = false, bottom = null } = {}) {
  if (ui.drag && (revealing || still || !canDrag())) cancelDrag();
  const v = board;
  const b = bottom ?? (ui.mode === 'pass' ? (ui.seat ?? 0) : me());
  const R = v.round;
  const busy = revealing || still;
  feedSightings(v);
  const choosing = !!ui.selected && !myPlan(v) && v.phase === 'plan' && !busy;
  const legalCities = choosing ? R.legal.filter((d) => d.uid === ui.selected).map((d) => d.city) : [];
  // The drop being chosen, or locked in, as ghosts in its city: face down where it will land face down
  // (Casablanca as chosen), and an Accomplice's partner beside it.
  let ghost = null;
  if (!busy && v.phase === 'plan') {
    const mine = myPlan(v);
    const planned = mine && !mine.pass ? mine : ui.selected && ui.target !== null ? { uid: ui.selected, city: ui.target, partner: partnerUid(v), down: faceChoice(v) ? planDown(v) : undefined } : null;
    const cv = planned && R.hand.find((c) => c.uid === planned.uid);
    if (cv) {
      const id = cityId(v, planned.city);
      const ghostOf = (c, more) => ({ ...c, owner: b, power: AGENT[c.kind].power, locked: !!mine, ...more });
      const cvs = [ghostOf(cv, { faceDown: id === 'casablanca' ? !!planned.down : id === 'vienna' || !!AGENT[cv.kind].faceDown })];
      const mate = planned.partner && R.hand.find((c) => c.uid === planned.partner);
      if (mate) cvs.push(ghostOf(mate, { faceDown: true, partner: true }));
      ghost = { city: planned.city, cvs };
    }
  }
  // A wiretap's slip comes in once, when the mark's city is first heard.
  const tapKey = busy ? null : (R.tapped || []).filter((t) => t.city !== null).map((t) => `${t.seat}@${t.city}`).join(',') || null;
  const tapFresh = !!tapKey && `${v.matchId}:${v.roundNo}:${R.turn}:${tapKey}` !== ui.tapShown;
  if (tapKey) ui.tapShown = `${v.matchId}:${v.roundNo}:${R.turn}:${tapKey}`;
  const settled = v.phase !== 'plan' && R.result && R.result.cityWinners;
  const cities = R.cities
    .map((_, ci) => {
      let html = cityHTML(v, ci, b, { ghost, choosing, legalCities, tapFresh });
      if (settled) {
        const w = R.result.cityWinners[ci];
        html = html.replace('class="city ', `class="city ${w === null ? 'won-none' : w === b ? 'won-me' : 'won-them'} `);
      }
      return html;
    })
    .join('');
  const colours = seatColours(v);
  const caption = busy ? ui.caption : ui.caption || inspectText(v) || hintText(v);
  // A line said just before this render types out again on the new ticker.
  const typing = !!caption && ui.typeNext === caption;
  ui.typeNext = null;
  syncNight();
  $('#screen').innerHTML = `<div class="play ${colours.map((c, s) => `c${s}-${c}`).join(' ')}${revealing ? ' revealing' : ''}" data-bottom="${b}">
    ${peerBannerHTML()}
    ${scorebarHTML(v, b)}
    <div class="board${myPlan(v) ? ' locked' : ''}" id="board">${cities}</div>
    <p class="ticker${typing ? ' typing' : ''}" id="ticker" role="status">${esc(caption)}</p>
    ${revealing ? `<div class="controls"><p class="status">Flip!</p><div class="btns"><button class="slip quiet" data-action="reveal-tap">${revealLabel()}</button></div></div>` : still ? '<div class="controls"><p class="status"></p></div>' : controlsHTML(v)}
    ${handHTML(hand, busy)}
    ${!busy && v.phase !== 'plan' ? resultHTML(v, b) : ''}
  </div>`;
  markDrag();
}

function overHTML() {
  const v = view();
  const bottom = ui.mode === 'pass' ? 0 : me();
  const won = v.winner === bottom;
  const head = ui.mode === 'pass' ? `${v.names[v.winner]} wins` : won ? 'Mission accomplished' : 'Burned';
  const reeled = v.winBy === 'reel';
  const sub = reeled
    ? ui.mode !== 'pass' && won ? 'You took the full reel.' : `${label(v.winner, v)} took the full reel.`
    : ui.mode === 'pass' ? 'The other spymaster is reassigned to a lighthouse.' : won ? `You beat ${label(foe(v, bottom), v)} ${v.scores[bottom]} to ${v.scores[foe(v, bottom)]}.` : `${label(foe(v, bottom), v)} beat you ${v.scores[foe(v, bottom)]} to ${v.scores[bottom]}.`;
  // Each side's strips of film, as frames under its score.
  const reel = (seat) =>
    v.reel > 0
      ? `<span class="reel own-${seat}" role="img" aria-label="${v.strips[seat]} of ${v.reel} film strips">${Array.from({ length: v.reel }, (_, i) => `<i class="fr${i < v.strips[seat] ? ' got' : ''}"></i>`).join('')}</span>`
      : '';
  const rounds = v.history
    .map((h, i) => {
      const who = h.winner === null ? 'nobody' : label(h.winner, v);
      const how = h.folded !== null ? `${label(h.folded, v)} folded` : h.winner === null ? 'dead heat' : `${h.cityWinners.filter((w) => w === h.winner).length} of 3 cities`;
      // A round that gave a strip of film: a frame in the taker's colour, beside the film city.
      const strip = h.strip !== null && h.strip !== undefined && h.film !== null && h.film !== undefined;
      const frame = (ci) => {
        if (!strip || ci !== h.film) return '';
        const said = `${label(h.strip, v)} took a strip of film from ${CITY[h.cities[ci]].name}`;
        return `<i class="fr got own-${h.strip}" role="img" aria-label="${esc(said)}" title="${esc(said)}"></i>`;
      };
      return `<li class="w-${h.winner === null ? 'none' : `${h.winner === bottom ? 'me' : 'them'} own-${h.winner}`}"><span class="n">${i + 1}</span><span class="cities"><span class="op">${esc(operation(v.matchId, i).name)}</span>${h.cities.map((c, ci) => `${esc(CITY[c].name)}${frame(ci)}`).join(', ')}</span><span class="how">${esc(how)}</span><b>${h.winner === null ? '—' : `+${h.points}`} ${esc(who)}</b></li>`;
    })
    .join('');
  const ri = ui.rival ? RIVALS.findIndex((r) => r.id === ui.rival.id) : -1;
  // The ladder goes on to the next rival; free play doesn't climb it.
  const nextRival = ui.mode === 'solo' && !ui.free && won && ri >= 0 && ri < RIVALS.length - 1 ? RIVALS[ri + 1] : null;
  const online = ui.mode === 'host' || ui.mode === 'guest';
  const rematchWait = online && v.rematch[me()] && rivals(v).some((s) => !v.rematch[s]);
  const rivalWants = online && rivals(v).some((s) => v.rematch[s]) && !v.rematch[me()];
  const rivalLeft = online && ui.net?.peer === 'left';
  return `<div class="over ${won || ui.mode === 'pass' ? 'won' : 'lost'}">
    <div class="dossier">
      <p class="stamp-line">Dossier · ${esc(v.names.join(' vs '))}</p>
      <h2>${jitter(head, 9)}</h2>
      <p class="sub">${esc(sub)}</p>
      <p class="final"><span>${esc(label(bottom, v))}</span><span class="score-film"><b>${v.scores[bottom]}</b>${reel(bottom)}</span><i>to</i><span class="score-film"><b>${v.scores[foe(v, bottom)]}</b>${reel(foe(v, bottom))}</span><span>${esc(label(foe(v, bottom), v))}</span></p>
      <ol class="rounds">${rounds}</ol>
      ${ui.mode === 'solo' && !ui.free && won && ri === RIVALS.length - 1 ? '<p class="sub">You beat Control. There is nobody left to fool.</p>' : ''}
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
/** The Rules tab. Its numbers come from the match on screen, or from the defaults off the table. */
function helpRules() {
  const v = ['play', 'cover', 'over'].includes(ui.screen) ? view() : null;
  const reel = v ? v.reel : RULES.reel;
  const target = v ? v.target : TARGET;
  return [
    'You run a station in the winter of 1963. Each round is an operation: a package passes through three dead drops, and holding two of the three gets it.',
    'Three cities are up for grabs. Each turn, you and your rival secretly drop one agent into a city, then both cards flip together.',
    'After six drops, whoever has the higher total in a city holds it. Hold two of the three to win the round.',
    'Agents have tricks. Flip tricks fire as the card turns over: the player holding the First flip token goes first, and the token passes across every turn. Face-down agents have no tricks, except the Tripwire and the Decoy.',
    `Every match deals the same roster of ${ROSTER.size} agents to everyone: the Classic ${DECK.length}, or a Mixed draw. The Agents tab lists tonight’s, with every agent’s fine print.`,
    `Each player has ${counted(RULES.tokens, 'escalation token')} for the whole match. Escalate (once per round, by whoever calls it first) to spend one and double the stake: your rival must fold or play on. You can fold any time; whoever wins the round takes the stake and everything in the pot. If the round reaches the final flip, the stake doubles again.`,
    'A dead heat scores nothing: the stake and the pot roll over into the next round.',
    ...(reel > 0
      ? [
          `One city each round carries the Microfilm (the canister on its plate). Lose the round but hold that city at the end, and you take a strip of film (in a dead heat, whoever holds it does). ${reelSentence(reel)} outright, whatever the score. The round’s winner never takes a strip, so a round that ends in a fold awards none.`,
        ]
      : []),
    reel > 0 ? `First to ${target} points, or the full reel, wins the match.` : `First to ${target} points wins the match.`,
  ];
}
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
  [['V'], 'drops face up or face down, in Casablanca'],
  [['U'], 'lists the rival’s agents you haven’t seen'],
  [['←', '→'], 'switch tabs here'],
  [['M'], 'sound'],
  [['?'], 'help'],
];

/** Help tabs this device shows: touch screens (no hover) have no keyboard, so no Keys tab. */
function helpTabs() {
  const touch = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
  return HELP_TABS.filter(([id]) => id !== 'keys' || !touch);
}

/**
 * Help's Agents or Cities tab (`kind`: agents | cities) in sections: during a match, tonight's (the
 * view's roster or city pool, in order), then the rest of your network, then what isn't recruited yet;
 * off the table, your network and the rest. Empty sections are left out.
 */
function helpSections(kind) {
  const v = ['play', 'cover', 'over'].includes(ui.screen) ? view() : null;
  const tonight = v ? (kind === 'agents' ? v.roster : v.cityPool) : null;
  const all = kind === 'agents' ? AGENTS.map((a) => a.id) : CITIES.map((c) => c.id);
  const net = network(meta.beaten)[kind];
  const out = tonight ? [{ title: kind === 'agents' ? 'Tonight’s roster' : 'Tonight’s cities', ids: tonight }] : [];
  out.push({ title: tonight ? 'In your network' : 'Your network', ids: net.filter((id) => !tonight?.includes(id)) });
  out.push({ title: 'Not yet recruited', ids: all.filter((id) => !net.includes(id) && !tonight?.includes(id)), locked: true });
  return out.filter((sec) => sec.ids.length);
}

/** "Beat The Magpie to recruit." for an agent or city outside your network. */
const recruitLine = (kind, id) => `<span class="recruit">Beat ${esc(recruiter(kind, id)?.name ?? 'a rival')} to recruit.</span>`;
const noteHTML = (note) => (note ? `<span class="note">${esc(note)}</span>` : '');

function agentItemHTML(id, locked) {
  const a = AGENT[id];
  const txt = locked ? `<b>${esc(a.name)}</b>${recruitLine('agents', id)}` : `<b>${esc(a.name)} <i>${a.power}</i></b><span>${esc(a.text)}</span>${noteHTML(a.note)}`;
  return `<li${locked ? ' class="locked"' : ''}><span class="art">${agentSVG(id)}</span><span class="txt">${txt}</span></li>`;
}

function cityItemHTML(id, locked) {
  const c = CITY[id];
  return `<li${locked ? ' class="locked"' : ''}><b>${esc(c.name)}</b> ${locked ? recruitLine('cities', id) : `${esc(c.rule)}${noteHTML(c.note)}`}</li>`;
}

function helpBodyHTML(tab) {
  if (tab === 'agents' || tab === 'cities') {
    const item = tab === 'agents' ? agentItemHTML : cityItemHTML;
    return helpSections(tab)
      .map((sec) => `<section class="help-sec${sec.locked ? ' locked' : ''}"><h3>${esc(sec.title)}</h3><ul class="${tab === 'agents' ? 'agent-list' : 'city-list'}">${sec.ids.map((id) => item(id, !!sec.locked)).join('')}</ul></section>`)
      .join('');
  }
  if (tab === 'keys') return `<ul class="key-list">${HELP_KEYS.map(([keys, text]) => `<li><span class="keys">${keys.map((k) => `<kbd>${esc(k)}</kbd>`).join(' ')}</span> <span>${esc(text)}</span></li>`).join('')}</ul>`;
  return `<ol class="rules">${helpRules().map((r) => `<li>${esc(r)}</li>`).join('')}</ol>`;
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

/** Pass and play's roster sheet, from the title: Classic (the default) or Mixed from everything. */
function passSheetHTML() {
  return `<div class="modal" data-action="close-modal"><div class="sheet small pass-sheet" role="dialog" aria-label="Pass and play" data-stop>
      <h2>${jitter('Pass and play', 3)}</h2>
      <p>Two spymasters, one device: hand it over between turns. Both of you play the same roster of ${ROSTER.size} agents.</p>
      <div class="picks">
        <button class="slip primary" data-action="pass-start" data-choice="classic"><span>Classic</span><small>The original ${DECK.length} agents and ${CLASSIC_CITIES.length} cities. Best for a first match.</small></button>
        <button class="slip" data-action="pass-start" data-choice="mixed"><span>Mixed: all ${AGENTS.length} agents and cities</span><small>Each match draws ${ROSTER.size} of the ${AGENTS.length} agents.</small></button>
      </div>
      <div class="btns"><button class="slip quiet" data-action="close-modal">Back<kbd>Esc</kbd></button></div>
    </div></div>`;
}

function modalHTML() {
  const v = view();
  if (ui.modal === 'help') return helpHTML();
  if (ui.modal === 'pass') return passSheetHTML();
  if (!v) return '';
  const rival = foe(v);
  if (ui.modal === 'fold') {
    // A fold pays the stake into the pot, and the rival takes the lot.
    const gets = v.round.stake + v.round.pot;
    const film = v.round.film;
    return `<div class="modal" data-action="close-modal"><div class="sheet small" role="dialog" aria-label="Fold" data-stop>
      <h2>${jitter('Fold?', 2)}</h2>
      <p>${esc(label(rival, v))} takes ${gets} point${gets === 1 ? '' : 's'} and the round ends.</p>
      ${film !== null ? `<p class="film-note">${canisterHTML({ label: false })}<span>A fold awards no film: nobody takes a strip from ${esc(cityName(v, film))} this round.</span></p>` : ''}
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
      <p>Play on and this round is worth <b>${R.stake * 2}</b>, or <b>${R.stake * 4}</b> if it reaches the final flip${R.pot > 0 ? `, plus the pot of <b>${R.pot}</b>` : ''}. Fold now and ${esc(label(by, v))} takes <b>${R.stake + R.pot}</b>.</p>
      ${R.film !== null ? `<p class="film-note">${canisterHTML({ label: false })}<span>Play on and lose, but hold ${esc(cityName(v, R.film))}, and you still take a strip of film. ${reelSentence(v.reel)}. A fold awards no film.</span></p>` : ''}
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
    // A reveal or a fold's exit draws the table itself until it is done.
    if (!ui.animating && !ui.holdBoard) renderPlay();
  }
  // The cover has Leave too, so its quit modal shows there as well.
  const m = ui.screen === 'play' || ui.screen === 'cover' || ui.modal === 'help' || ui.modal === 'pass' ? modalHTML() : '';
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
  if (ui.selected === uid) clearPick();
  else {
    ui.selected = uid;
    ui.partner = null;
    ui.down = null;
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
  // Another city: the partner and the face are asked afresh.
  if (ui.target !== ci) {
    ui.partner = null;
    ui.down = null;
  }
  ui.target = ci;
  audio.place();
  render();
}

/** While an Accomplice asks for a partner: choose this card to go with it, face down (again: no partner chosen). */
function choosePartner(uid) {
  const v = view();
  if (!v || ui.animating || !partnerPrompt(v)) return;
  if (!v.round.legal.some((d) => d.uid === ui.selected && d.city === ui.target && d.partner === uid)) return;
  ui.partner = ui.partner === uid ? null : uid;
  ui.inspect = null;
  audio.pick();
  render();
}

/** Drop alone: the Accomplice goes without a partner (again: no choice made yet). */
function dropAlone() {
  const v = view();
  if (!v || ui.animating || !partnerPrompt(v)) return;
  ui.partner = ui.partner === 'alone' ? null : 'alone';
  audio.place();
  render();
}

/** Casablanca: turn the drop face up or face down (V). */
function toggleFace() {
  const v = view();
  if (!v || ui.animating || !faceChoice(v)) return;
  ui.down = !planDown(v);
  audio.flip();
  render();
}

function lockIn() {
  const v = view();
  if (!v || v.phase !== 'plan' || myPlan(v) || !ui.selected || ui.target === null) return;
  if (partnerPrompt(v) && ui.partner === null) return; // a partner, or Drop alone, first
  const plan = { a: 'lock', uid: ui.selected, city: ui.target };
  const mate = partnerUid(v);
  if (mate) plan.partner = mate;
  if (faceChoice(v)) plan.down = planDown(v);
  audio.lock();
  clearPick();
  if (ui.mode === 'guest') {
    const { a, ...drop } = plan;
    ui.sentPlan = { ...drop, round: v.roundNo, turn: v.round.turn };
  }
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
  if (ui.screen !== 'play' || ui.modal || ui.card || ui.animating || ui.holdBoard || !v || v.phase !== 'plan' || myPlan(v)) return false;
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
  closeUnseen();
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
  // A card offered as an Accomplice's partner is tapped, not dragged.
  const card = ev.target.closest?.('.hand .card[data-action=pick]:not([disabled])');
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
  if (ui.animating || ui.holdBoard || ui.screen !== 'play' || !v || v.phase === 'plan' || !v.round.result) return;
  const refocus = document.activeElement?.dataset?.action === 'peek';
  ui.peek = !ui.peek;
  audio.place();
  render();
  const panel = $('#screen .result');
  if (refocus) panel?.querySelector('[data-action=peek]')?.focus({ preventScroll: true });
  // The slide plays from here, not from the render, so a rival's move can't restart it.
  if (panel && !reducedMotion()) panel.animate([{ opacity: 0, translate: ui.peek ? '0 24px' : '0 -12px' }, { opacity: 1, translate: '0 0' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
}

/** U, or its button: open the unseen strip for `seat` (the rival across the table), or close it. Planning only. */
function toggleUnseen(seat = foe()) {
  const v = view();
  if (ui.screen !== 'play' || !v || v.phase !== 'plan' || ui.animating || ui.holdBoard) return;
  ui.unseenOpen = ui.unseenOpen === seat ? null : seat;
  ui.unseenEnter = ui.unseenOpen !== null;
  const refocus = document.activeElement?.dataset?.action === 'unseen';
  audio.place();
  render();
  if (refocus) $(`#screen [data-action=unseen][data-seat="${seat}"]`)?.focus({ preventScroll: true });
}

/**
 * Close the unseen strip (an outside tap, Escape). It comes off the screen in place, so it goes even
 * while a reveal draws the table itself. Returns whether it was open.
 */
function closeUnseen() {
  if (ui.unseenOpen === null) return false;
  ui.unseenOpen = null;
  $('#screen .unseen-panel')?.remove();
  for (const b of document.querySelectorAll('#screen [data-action=unseen]')) {
    b.setAttribute('aria-expanded', 'false');
    b.classList.remove('open');
  }
  return true;
}

const actions = {
  rivals: () => {
    ui.screen = 'rivals';
    render();
  },
  rival: (el) => startSolo(el.dataset.id, { free: el.dataset.free === '1' }),
  'rivals-tab': (el) => {
    const tab = el.dataset.choice === 'free' && freeOpen() ? 'free' : 'ladder';
    if (tab === ui.rivalsTab) return;
    ui.rivalsTab = tab;
    audio.place();
    render();
    $(`#screen [data-action=rivals-tab][data-choice=${tab}]`)?.focus({ preventScroll: true });
  },
  // "Read the epilogue" plays C's last cable again.
  epilogue: () => {
    audio.place();
    epilogueCard();
  },
  continue: () => {
    const m = saved.get('match', null);
    if (!m) return;
    // A stale second tab may have written an older save since this tab booted.
    if (!canRestore(m.table)) {
      clearOld('match');
      toast(OLD_SAVE_TOAST);
      return;
    }
    if (m.mode === 'pass') startPass({ resume: m.table });
    else startSolo(m.rival, { free: m.free === true, resume: m.table });
  },
  host: () => startHost(),
  pass: () => {
    ui.modal = 'pass';
    render();
  },
  'pass-start': (el) => startPass({ setup: el.dataset.choice === 'mixed' ? MIXED_ALL : CLASSIC_SETUP }),
  // The host's lobby: deal again with the other roster, while nobody has joined.
  'host-roster': (el) => {
    const mixed = el.dataset.choice === 'mixed';
    if (!lobbyOpen() || !!table.setup.mixed === mixed) return;
    table.restart(mixed ? MIXED_ALL : CLASSIC_SETUP);
    audio.place();
    $(`#screen [data-action=host-roster][data-choice=${el.dataset.choice}]`)?.focus({ preventScroll: true });
  },
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
  partner: (el) => choosePartner(el.dataset.uid),
  alone: dropAlone,
  face: toggleFace,
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
    if (!v || v.phase !== 'plan' || v.round.escalated.some(Boolean) || v.round.pending || v.tokens[me()] < 1) return;
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
  final: async () => {
    // A ladder win over Control: the epilogue plays first, once, then the dossier.
    if (ui.epilogue) {
      ui.epilogue = false;
      const id = view()?.matchId;
      await epilogueCard();
      if (ui.screen !== 'play' || view()?.matchId !== id) return;
    }
    ui.screen = 'over';
    render();
    flushRecruits();
  },
  // Every mode: the new match id reaches onUpdate(), which clears the dossier for the table.
  rematch: () => {
    act({ a: 'rematch' });
    render();
  },
  'reveal-tap': tapReveal,
  peek: togglePeek,
  // The twist chip reads the rival's twist into the ticker.
  twist: (el) => {
    const v = view();
    const text = v && twistOf(v, Number(el.dataset.seat));
    if (!text) return;
    ui.inspect = null;
    audio.place();
    say(text);
    render();
  },
  unseen: (el) => toggleUnseen(Number(el.dataset.seat)),
};

document.addEventListener('click', (ev) => {
  // A title card takes every tap, and does nothing else with it. Past its first 400 ms a tap
  // skips the card; before that it is a stray (the second click of a double-click, or one more
  // tap through the reveal before it) and changes nothing.
  if (ui.card) {
    if (performance.now() - ui.card.at >= REVEAL_GUARD_MS) skipCard();
    return;
  }
  // An open unseen strip closes on a tap anywhere outside it, and the tap goes on to do what it does.
  if (ui.unseenOpen !== null && !ev.target.closest('.unseen-panel, [data-action=unseen]')) closeUnseen();
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
  // An open unseen strip takes Escape and U first (a sheet takes Escape before it).
  if (ui.unseenOpen !== null && !ui.modal && (k === 'Escape' || k === 'u' || k === 'U')) {
    ev.preventDefault();
    closeUnseen();
    return;
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
  // A fold's exit or a strip's flight holds the board: no plan-phase key acts on it. (Enter is
  // kept from pressing a focused button underneath.)
  if (ui.holdBoard) {
    if (k === 'Enter') ev.preventDefault();
    return;
  }
  if (ui.modal) {
    if (k === 'Escape') {
      ev.preventDefault();
      if (ui.modal === 'help' || ui.modal === 'fold' || ui.modal === 'quit' || ui.modal === 'pass') actions['close-modal']();
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
  // U opens the strip, even under the escalation prompt (what the rival may hold bears on the answer).
  if (k === 'u' || k === 'U') return toggleUnseen();
  if (v.phase === 'plan' && R.pending && R.pending.by !== me() && (ui.mode !== 'pass' || ui.seat === foe(v, R.pending.by))) {
    // A key held down through the escalation flash doesn't answer the prompt when the flash goes
    // (nor press its focused Play on).
    if (ev.repeat) return ev.preventDefault();
    if (k === 'Enter') act({ a: 'respond', accept: true });
    if (k === 'f' || k === 'F') act({ a: 'respond', accept: false });
    return;
  }
  if (v.phase !== 'plan') {
    // A fold's exit is still playing over the old board: the result isn't up yet, so Enter (next
    // round) and B (See the board) wait for it, as they do while a card is up.
    if (ui.holdBoard) {
      if (k === 'Enter') ev.preventDefault();
      return;
    }
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
  if (/^[1-9]$/.test(k) && R.hand[Number(k) - 1]) {
    // While an Accomplice asks for a partner, another card's number chooses it as the partner.
    const uid = R.hand[Number(k) - 1].uid;
    return partnerPrompt(v) && uid !== ui.selected ? choosePartner(uid) : pick(uid);
  }
  const ci = { a: 0, s: 1, d: 2, A: 0, S: 1, D: 2 }[k];
  if (ci !== undefined) return chooseCity(ci);
  if (k === 'v' || k === 'V') return toggleFace();
  if (k === 'Enter') {
    ev.preventDefault();
    return lockIn();
  }
  if (k === 'Escape' || k === 'Backspace') {
    if (R.plan) return actions.unlock();
    clearPick();
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

// A match saved by an older build can't be resumed: clear it and say so once, on the title.
const OLD_SAVE_TOAST = 'Your saved match was from an older version of Dead Drop, so it has been cleared.';
let clearedOld = false;
const clearOld = (key) => {
  saved.remove(key);
  clearedOld = true;
};
{
  const m = saved.get('match', null);
  if (m && !canRestore(m.table)) clearOld('match');
}

function route() {
  const h = new URLSearchParams(location.hash.slice(1));
  const join = cleanCode(h.get('join'));
  const host = cleanCode(h.get('host'));
  if (join) return startGuest(join);
  if (host) {
    let s = saved.get(`host-${host}`, null);
    if (s && !canRestore(s.table)) {
      clearOld(`host-${host}`);
      s = null;
    }
    return startHost({ code: host, resume: s && Date.now() - s.at < 6 * 3600e3 ? s.table : null });
  }
  ui.screen = 'title';
  render();
}
route();

// ── debug hooks (window.__game) ─────────────────────────────────────────────

/**
 * Both seats make a drop for `turns` turns, straight through the table: no animation, and the
 * screen jumps to the result. The computer rival sits back down afterwards, if it was seated (a
 * staged table keeps it held).
 */
function quickTurns(turns, rng = Math.random) {
  const seated = !!bot;
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
  if (ui.mode === 'solo' && seated) bot = attachBot(table, 1, ui.rival, { hold: botHold });
  render();
}

/**
 * A solo table set up for a check. It starts through startSolo's own path (with no round card), then
 * deals again, at the same table, from the setup that match plays: `rival`'s ladder setup, or free
 * play against them; `roster` replaces its draw with exactly those agents, and `cities` are round 1's
 * (and join the pool). The kinds in `hand` move to the front of seat 0's hand from its deck, and those
 * in `rivalHand` to the rival's; each hand keeps its size. The rival is held: it makes no move of its
 * own until the check asks (rivalLocks, rivalEscalates, rivalFolds), even after quickTurns or
 * toFinalTurn.
 */
function stage({ rival = 'wren', free = false, roster = null, cities = null, hand = [], rivalHand = [] } = {}) {
  const skip = ui.alwaysSkip;
  ui.alwaysSkip = true;
  try {
    startSolo(rival, { free });
  } finally {
    ui.alwaysSkip = skip;
  }
  bot?.stop();
  bot = null;
  const add = (list, ids) => [...list, ...ids.filter((id) => !list.includes(id))];
  let setup = free ? freeSetup(meta.beaten) : ladderSetup(ui.rival.id);
  if (roster) setup = { ...setup, mixed: false, agents: [...roster], must: [] };
  else if (setup.mixed) setup = { ...setup, agents: add(setup.agents, [...hand, ...rivalHand]), must: add(setup.must, [...hand, ...rivalHand]) };
  if (cities) setup = { ...setup, cities: add(setup.cities, cities) };
  const dealt = createTable({ names: table.names, setup, cities: cities ?? undefined });
  table.setup = dealt.setup;
  table.state = dealt.state;
  const R = table.state.round;
  const deal = (seat, kinds) => {
    if (!kinds.length) return;
    const size = R.hands[seat].length;
    const pool = [...R.hands[seat], ...R.decks[seat]];
    const picked = kinds.map((kind) => {
      const uid = pool.find((u) => R.cards[u].kind === kind);
      if (!uid) throw new Error(`stage: no ${kind} among seat ${seat}'s cards (roster: ${table.state.roster.join(', ')})`);
      pool.splice(pool.indexOf(uid), 1);
      return uid;
    });
    const all = [...picked, ...pool];
    const n = Math.max(size, picked.length);
    R.hands[seat] = all.slice(0, n);
    R.decks[seat] = all.slice(n);
  };
  deal(0, hand);
  deal(1, rivalHand);
  ui.shownSeq = table.turnSeq;
  ui.view = latestView();
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
  startSolo: (id = 'wren', opts = {}) => startSolo(id, opts),
  stage,
  startPass: (opts = {}) => startPass(opts),
  /** Set the rivals you have beaten on the ladder (and save), as ladder wins would: for shots of the network and the ladder. */
  beat(ids = []) {
    meta.beaten = RIVALS.map((r) => r.id).filter((id) => ids.includes(id));
    saveMeta();
    render();
  },
  /** Hold the computer rival (true) as a card does, or let it go (false): it makes no move while held. */
  holdRival(on = true) {
    ui.holdRival = !!on;
  },
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
   * The computer rival locks in its first legal drop now (outside city `avoid`, if it can), through
   * the table as its own lock does, so a step that inspects the table can't be raced by its fold or
   * escalation. Call it while the rival is held (a card or reveal up, or a staged table), or it may
   * already be thinking.
   */
  rivalLocks({ avoid = null } = {}) {
    if (ui.mode !== 'solo' || !table) return false;
    const v = table.view(1);
    // Away from city `avoid` if it can (so it can't spring on, or jam, the drop a check is making there).
    const d = v.round.legal.find((x) => x.city !== avoid) ?? v.round.legal[0];
    return v.phase === 'plan' && !v.round.plan && !!d && table.act(1, { a: 'lock', uid: d.uid, city: d.city });
  },
  /** The computer rival escalates now, through the table as its own escalation does (the flash and prompt follow). */
  rivalEscalates() {
    if (ui.mode !== 'solo' || !table) return false;
    return table.act(1, { a: 'escalate' });
  },
  /** The computer rival folds now, through the table as its own fold does (the flash, its exit and the result follow). */
  rivalFolds() {
    if (ui.mode !== 'solo' || !table) return false;
    return table.act(1, { a: 'fold' });
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
  /**
   * Hold the next reveal still the moment a trick of `kind` has played (its agent still lit, what it
   * did on the board), as holdReveal would; a tap or Space then speeds it up and skips it, as in play.
   * Set before the turn resolves; the hold happens once, and a new match forgets it.
   */
  holdAt(kind) {
    ui.holdAt = kind;
  },
  /** Skip every reveal and title card from now on, for the rest of the session (or play them again). */
  skipAnimations: (on = true) => {
    ui.alwaysSkip = on;
    pace({ skip: on });
    if (on) ui.card?.skip();
  },
  prepareThumbnail() {
    // No intro or round card in the thumbnail: the table is built with every animation skipped (so
    // nothing is met, either).
    const skip = ui.alwaysSkip;
    ui.alwaysSkip = true;
    try {
      let s = 2;
      const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      startSolo('countess');
      bot?.stop();
      // The Countess's own ladder table (a Mixed roster, her twist chip in the scorebar), from a seed
      // whose first turns leave new agents face up on both sides: my Courier, an Accomplice each in
      // Rome, and her Blackmailer.
      table.state = createTable({ seed: 'thumb-14', cities: ['istanbul', 'rome', 'monaco'], setup: ladderSetup('countess'), twistSeat: 1 }).state;
      table.names = [meta.codename, 'The Countess'];
      quickTurns(3, rng);
      bot?.stop();
      table.state.round.stake = 2;
      table.state.round.escalated = [true, false];
      // You have escalated once (a token spent) and hold a strip of film, so both marks show.
      table.state.tokens = [2, 3];
      table.state.strips = [1, 0];
      ui.screen = 'play';
      ui.view = table.view(0);
      ui.selected = ui.view.round.legal[0]?.uid ?? null;
      ui.target = ui.view.round.legal[0]?.city ?? null;
      ui.caption = REMARKS.countess.start[1]; // "The Countess adjusts her pearls."
      ui.initShown = ui.view.round.initiative; // the token at rest, not mid-flip
      render();
    } finally {
      ui.alwaysSkip = skip;
    }
  },
});

if (clearedOld) toast(OLD_SAVE_TOAST);
