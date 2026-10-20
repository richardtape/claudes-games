// Who runs the rules and how each player sees them.
//
// A table owns the authoritative match (solo, pass-and-play, or the host's browser online)
// and turns player actions into engine calls. attachBot() lets a computer rival sit at a
// seat. hostSession()/guestSession() carry the same actions and views over a shared/net.js
// room: each guest only ever receives viewFor(state, itsSeat), a spectator viewFor(state, -1), so
// nobody sees another's cards. Tables seat 2-4 players, online too (the lobby: lobby.js). A table
// plays a setup (roster.js: Classic, Mixed or a ladder rival's) and keeps it for rematches and saves.
import * as E from './engine.js';
import { think, estimateLocked, stakeCall } from './bot.js';
import { createRng } from '../../../shared/rng.js';
import { CODENAMES, EMOTES, MAX_SEATS, RIVALS, SEAT_NAMES, STAND_IN, samplesFor, targetFor } from './data.js';
import { away, fill as fillSeats, publicLobby, resize, seatOf, setSetup, setTimer, sit, start as startLobby, unfill } from './lobby.js';
import { CLASSIC_SETUP, matchOptions } from './roster.js';

/** 4: Phase 3 (tables of 2-4 online: the lobby, spectators, stand-ins, emotes). Older guests are turned away. */
export const PROTOCOL = 4;
/** A guest pings the host this often while its tab is visible. */
export const PING_MS = 10000;
/** A guest seat quiet this long (no hello, ping or action) gets the stand-in. */
export const STANDIN_MS = 30000;
/** One emote per seat this often at most. */
export const EMOTE_GAP_MS = 3000;
/** Browsers that may watch a table beside its players. */
export const MAX_SPECTATORS = 4;

/** A match seed: 16 lowercase hex characters from the platform's cryptographic random source. */
export function randomSeed() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 8 lowercase base-36 characters; not derived from the match seed, so rematches and equal seeds differ. */
const newMatchId = () => Array.from({ length: 8 }, () => Math.floor(Math.random() * 36).toString(36)).join('');

/** Resolve after the send settles or after `ms`, whichever is first; never rejects. */
const settleWithin = (fn, ms = 400) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    const done = () => (clearTimeout(timer), resolve());
    try {
      Promise.resolve(fn()).then(done, done);
    } catch {
      done();
    }
  });

/**
 * A table for `seats` players playing `setup`. Its roster is drawn from `${seed}:setup`, apart from the deal's
 * rng, so a Classic table deals as before; a twist (a ladder rival's) belongs to `twistSeat`. `timer` is the
 * turn timer in ms (0: off). `standIn` and `here` (per seat) are kept by an online host's session: who is
 * played by the stand-in, and whose player is connected (the host and bots always are).
 */
export function createTable({ seed = null, seats = 2, target = targetFor(seats), cities, names = SEAT_NAMES.slice(0, seats), setup = CLASSIC_SETUP, twistSeat = 1, timer = 0 } = {}) {
  if (names.length !== seats) throw new Error('names must have one entry per seat');
  const none = () => Array(seats).fill(false);
  const listeners = new Set();
  const emoters = new Set();
  /** A match of the table's setup (the seed also draws a Mixed roster). Round 1 deals `cities`, if given. */
  const newMatch = (matchSeed, matchTarget, matchCities) =>
    E.newMatch({ seed: matchSeed, target: matchTarget, cities: matchCities, seats, ...matchOptions(table.setup, createRng(matchSeed === null ? randomSeed() : `${matchSeed}:setup`), twistSeat) });
  const table = {
    setup,
    state: null,
    names: names.slice(),
    ready: none(),
    rematch: none(),
    matchId: newMatchId(),
    seq: 0,
    turnSeq: 0,
    standIn: none(),
    here: Array(seats).fill(true),
    timer,
    /** A new match of `setup` (seed, roster, match id) at this table, keeping its listeners: the host's lobby before anyone joins. */
    restart(next = table.setup) {
      table.setup = next;
      table.state = newMatch(null, table.state.target);
      table.ready = none();
      table.rematch = none();
      table.matchId = newMatchId();
      table.touch();
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    touch(resolved = false) {
      table.seq++;
      if (resolved) table.turnSeq++;
      for (const cb of [...listeners]) cb(table);
    },
    onEmote(cb) {
      emoters.add(cb);
      return () => emoters.delete(cb);
    },
    /** `seat` says EMOTES[i] (an index: no free text). False for a bad index or a seat outside the table. */
    emote(seat, i) {
      if (!Number.isInteger(seat) || seat < 0 || seat >= E.seatCount(table.state)) return false;
      if (!Number.isInteger(i) || i < 0 || i >= EMOTES.length) return false;
      for (const cb of [...emoters]) cb({ seat, i });
      return true;
    },
    view(seat) {
      return {
        ...E.viewFor(table.state, seat),
        names: table.names.slice(),
        ready: table.ready.slice(),
        rematch: table.rematch.slice(),
        seq: table.seq,
        turnSeq: table.turnSeq,
        matchId: table.matchId,
        standIn: table.standIn.slice(),
        here: table.here.slice(),
        timer: table.timer,
      };
    },
    /** Apply one player action; returns whether it did anything. */
    act(seat, a) {
      const S = table.state;
      if (!Number.isInteger(seat) || seat < 0 || seat >= E.seatCount(S)) return false;
      let ok = false;
      let resolved = false;
      switch (a?.a) {
        case 'lock': {
          // Only these fields of an action (a guest's, over the wire) reach the engine, which checks the drop against legalDrops.
          const drop = a.pass ? { pass: true } : { uid: a.uid, city: a.city };
          if (!a.pass && typeof a.partner === 'string') drop.partner = a.partner;
          if (!a.pass && typeof a.down === 'boolean') drop.down = a.down;
          ok = E.lock(S, seat, drop);
          break;
        }
        case 'unlock':
          ok = E.unlock(S, seat);
          break;
        case 'escalate':
          ok = E.escalate(S, seat);
          break;
        case 'respond':
          ok = E.respond(S, seat, !!a.accept);
          break;
        case 'fold':
          ok = E.fold(S, seat);
          break;
        case 'next':
          if (S.phase === 'round-over' && !table.ready[seat]) {
            table.ready[seat] = true;
            ok = true;
            if (table.ready.every(Boolean)) {
              table.ready = none();
              E.nextRound(S);
            }
          }
          break;
        case 'rematch':
          if (S.phase === 'match-over' && !table.rematch[seat]) {
            table.rematch[seat] = true;
            ok = true;
            if (table.rematch.every(Boolean)) {
              table.rematch = none();
              table.matchId = newMatchId();
              table.state = newMatch(null, S.target);
            }
          }
          break;
      }
      if (ok && E.ready(table.state)) resolved = !!E.resolveTurn(table.state);
      if (ok) table.touch(resolved);
      return ok;
    },
    toJSON() {
      return { state: table.state, names: table.names, ready: table.ready, rematch: table.rematch, seq: table.seq, turnSeq: table.turnSeq, matchId: table.matchId, setup: table.setup, standIn: table.standIn, here: table.here, timer: table.timer };
    },
  };
  table.state = newMatch(seed, target, cities);
  return table;
}

/**
 * Only a table saved at the current state version can be resumed, and only one that upgradeState can
 * complete: it defaults what this version added (roster, pool, twist), but can't invent the tokens, the
 * reel or the round.
 */
export const canRestore = (saved) => {
  const s = saved?.state;
  return s?.v === E.STATE_VERSION && Array.isArray(s.tokens) && typeof s.reel === 'number' && !!s.round && typeof s.round === 'object' && !Array.isArray(s.round);
};

/** A saved setup a rematch can deal from: the lists newMatch and drawRoster read. */
const isSetup = (s) => !!s && typeof s === 'object' && Array.isArray(s.agents) && Array.isArray(s.cities) && Array.isArray(s.must);

/**
 * Rebuild a table saved with toJSON() (the host's browser resumes after a reload). A 2b-i save (no setup)
 * resumes as Classic. The twist keeps its seat for rematches. A save from before Phase 3 has no stand-ins,
 * everyone here and no timer.
 */
export function restoreTable(saved) {
  if (!canRestore(saved)) throw new Error('a table saved by an older version of Dead Drop');
  E.upgradeState(saved.state);
  const n = saved.state.scores.length;
  const table = createTable({ seed: 1, seats: n, twistSeat: saved.state.twist?.seat ?? 1 });
  const setup = isSetup(saved.setup) ? saved.setup : CLASSIC_SETUP;
  Object.assign(table, { setup, state: saved.state, names: saved.names, ready: saved.ready, rematch: saved.rematch, seq: saved.seq, turnSeq: saved.turnSeq });
  if (typeof saved.matchId === 'string' && /^[a-z0-9]{8}$/.test(saved.matchId)) table.matchId = saved.matchId;
  const flags = (a, fallback) => (Array.isArray(a) && a.length === n && a.every((x) => typeof x === 'boolean') ? a.slice() : Array(n).fill(fallback));
  table.standIn = flags(saved.standIn, false);
  table.here = flags(saved.here, true);
  table.timer = Number.isInteger(saved.timer) && saved.timer >= 0 ? saved.timer : 0;
  return table;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** How long a wiretapping bot waits for its mark to lock in before choosing without the city. */
export const TAP_WAIT_MS = 6000;

/**
 * Does `seat` (whose view this is) wiretap a mark this turn that hasn't locked in yet (a folded or
 * passing mark counts as locked) and that it should wait for? Not a mark wiretapping `seat` back (two
 * seats would wait for each other), and not when following the wiretaps on from the mark, through
 * unlocked seats, comes back round to `seat` (a ring of three or four) and `seat` is the ring's first in
 * initiative order: that seat chooses at once, so the ring unwinds. Each mark counts once (a `tap`
 * twist and a Wiretap on the same mark).
 */
function waitingOnMark(view, seat) {
  const V = view.round;
  if (!V.tapped?.length) return false;
  const marks = new Set();
  for (const e of V.tapped) {
    if (marks.has(e.seat)) continue;
    marks.add(e.seat);
    if (V.locked[e.seat]) continue;
    if (V.taps.some((t) => t.by === e.seat && t.on === seat)) continue;
    const ring = ringBack(V, e.seat, seat);
    if (ring && E.turnOrder(E.seatCount(view), V.initiative).find((s) => ring.includes(s)) === seat) continue;
    return true;
  }
  return false;
}

/** The seats of a chain of this turn's wiretaps from `from` through unlocked seats back to `to` (`to` first), or null. */
function ringBack(V, from, to) {
  const path = [to];
  const visit = (s) => {
    if (V.locked[s] || path.includes(s)) return false;
    path.push(s);
    for (const t of V.taps) if (t.by === s && (t.on === to || visit(t.on))) return true;
    path.pop();
    return false;
  };
  return visit(from) ? path : null;
}

/**
 * Seat a computer rival. `pace` scales its thinking pauses (0 in tests). `hold()` can return
 * true to make it wait (e.g. while the UI is still animating a reveal). A bot that wiretaps its
 * mark waits up to `tapWait` ms for the mark to lock in, so it hears the city before it chooses.
 */
export function attachBot(table, seat, rival, { pace = 1, rng = createRng(Date.now()), hold = () => false, tapWait = TAP_WAIT_MS, stakes = true } = {}) {
  const samples = samplesFor(rival, E.seatCount(table.state));
  let busy = false;
  let stopped = false;
  const wait = (ms) => (pace ? sleep(ms * pace * (0.75 + rng.next() * 0.5)) : sleep(0));

  /** Wait, then report whether the bot was stopped meanwhile (a stopped bot never finishes its move). */
  const nap = async (ms) => {
    await wait(ms);
    return stopped;
  };

  async function tick() {
    if (busy || stopped) return;
    busy = true;
    const seqAtStart = table.seq;
    try {
      while (!stopped && hold()) await sleep(120);
      if (stopped) return;
      const S = table.state;
      if (S.phase === 'match-over') {
        if (table.rematch.some((r, s) => r && s !== seat) && !table.rematch[seat]) {
          if (await nap(600)) return;
          table.act(seat, { a: 'rematch' });
        }
      } else if (S.phase === 'round-over') {
        if (!table.ready[seat]) {
          if (await nap(300)) return;
          table.act(seat, { a: 'next' });
        }
      } else if (S.phase === 'plan') {
        const R = S.round;
        if (R.folded?.[seat]) return;
        if (R.pending) {
          // Only a seat that is owed an answer acts; everyone else waits for the call to resolve.
          if (!R.pending.from.includes(seat) || R.pending.calls[seat] !== null) return;
          if (await nap(900)) return;
          if (!stakes) {
            table.act(seat, { a: 'respond', accept: true });
            return;
          }
          const view = table.view(seat);
          const value = view.round.plan ? estimateLocked(view, Math.max(6, samples >> 1), rng) : think(view, { samples, noise: rival.noise, rng }).value;
          table.act(seat, { a: 'respond', accept: stakeCall(table.view(seat), value, rival, rng) === 'accept' });
        } else if (!R.plans[seat]) {
          const turn = R.turn;
          const roundNo = S.roundNo;
          if (await nap(500)) return;
          const moved = () => table.state.phase !== 'plan' || table.state.round.turn !== turn || table.state.roundNo !== roundNo;
          if (moved()) return;
          const owed = () => {
            const P = table.state.round.pending;
            return !!P && P.from.includes(seat) && P.calls[seat] === null;
          };
          // Wiretapping: wait for the mark to lock in, in 150 ms steps, until it does, the turn moves on,
          // a call needs this seat's answer, the bot is stopped, or tapWait runs out.
          const giveUp = Date.now() + tapWait;
          while (!stopped && !owed() && Date.now() < giveUp && waitingOnMark(table.view(seat), seat)) {
            await sleep(150);
            if (moved()) return;
          }
          if (stopped) return;
          // The escalation's own tick() found this one busy: the finally ticks again (the table has
          // changed since this one began) to answer it.
          if (owed()) return;
          const view = table.view(seat);
          const thought = think(view, { samples, noise: rival.noise, rng });
          const call = stakes ? stakeCall(view, thought.value, rival, rng) : 'play';
          if (await nap(700)) return;
          if (table.state.phase !== 'plan' || table.state.round.turn !== turn) return;
          if (call === 'fold') {
            table.act(seat, { a: 'fold' });
            return;
          }
          if (call === 'escalate') {
            table.act(seat, { a: 'escalate' });
            if (await nap(500)) return;
          }
          table.act(seat, { a: 'lock', ...thought.drop });
        }
      }
    } finally {
      busy = false;
      // The table may have changed while we were thinking: look again, after an early return too (a
      // turn that ended under the bot, while everyone else asked for a rematch, would wait for ever).
      if (!stopped && table.seq !== seqAtStart) setTimeout(tick, 0);
    }
  }
  const off = table.onChange(() => tick());
  tick();
  return {
    poke: tick,
    stop() {
      stopped = true;
      off();
    },
  };
}

/** A per-browser token: 16 lowercase hex characters. A hello without one is ignored. */
const TOKEN = /^[0-9a-f]{16}$/;

/** The rival who covers a quiet guest's seat. */
const STAND_IN_RIVAL = RIVALS.find((r) => r.id === STAND_IN);
if (!STAND_IN_RIVAL) throw new Error(`STAND_IN names no rival: ${STAND_IN}`);

/**
 * Host side of an online table of 2-4 seats. One session covers the lobby and the match: each
 * guest says hello with its per-browser token and sits (lobby.js), or watches once the seats are
 * taken or the match has begun (up to MAX_SPECTATORS). start() deals the table from the lobby and
 * seats its computer rivals. A seated guest only ever receives its own view; a spectator, view(-1).
 * A guest seat quiet for `standInMs` (no hello, ping or action) gets the stand-in (STAND_IN, stakes
 * off), at once if its player said bye, until its token comes back. Passing `table` with its
 * started `lobby` resumes a saved host: the bots sit again and every guest seat starts quiet.
 * Tests pass `now` and call tick() themselves; otherwise tick() runs every 5 s until close().
 */
export function hostSession({ room, lobby, makeTable, table = null, onStatus = () => {}, onEmote = () => {}, now = null, standInMs = STANDIN_MS, hold = () => false }) {
  if (table && !lobby.started) throw new Error('a resumed table needs its started lobby');
  const clock = now ?? Date.now;
  /**
   * Everyone who said hello: peer id → { key: their lobby token }, one peer per token. Seats renumber
   * when the lobby starts or shrinks, so a peer's seat is looked up from its token on every use.
   */
  const conns = new Map();
  /** When each seat's player was last heard from, by lobby token (`#seat` for a restored seat with none). */
  const lastSeen = new Map();
  const lastEmote = []; // by seat: emotes need a table, and a table's seats never renumber
  const covers = []; // the stand-in at each covered seat
  const bots = []; // the lobby's computer rivals
  const offs = [];
  let closed = false;

  const hostKey = lobby.seats[0]?.token;
  const nameOf = (seat) => (table ? table.names[seat] : lobby.seats[seat]?.name);
  const isGuest = (seat) => lobby.seats[seat]?.kind === 'guest';
  const seenKey = (seat) => lobby.seats[seat].token ?? `#${seat}`;
  /** The seat a peer plays now, or -1 (watching, or not here). */
  const seatOfPeer = (peerId) => (conns.has(peerId) ? seatOf(lobby, conns.get(peerId).key) : -1);
  const live = () => [...conns.keys()].filter((id) => room.peers.has(id));
  const broadcast = (type, data) => live().forEach((id) => room.send(type, data, id));
  /** The lobby to everyone here, each with the seat they hold in it now (-1 watching): closing an empty seat moves those after it. */
  function sendLobby() {
    const L = publicLobby(lobby);
    live().forEach((id) => room.send('lobby', { ...L, seat: seatOfPeer(id) }, id));
  }
  function sendViews() {
    if (!table) return;
    const views = new Map();
    for (const id of live()) {
      const seat = seatOfPeer(id);
      if (!views.has(seat)) views.set(seat, table.view(seat));
      room.send('view', views.get(seat), id);
    }
  }
  const relayEmote = (e) => {
    broadcast('emote', { seat: e.seat, i: e.i });
    onEmote(e);
  };
  const seatBot = (seat, id) => (bots[seat] = attachBot(table, seat, RIVALS.find((r) => r.id === id), { hold }));

  /** The table goes up: the lobby's seats are its seats; bots and the host are here, guests as the lobby says. */
  function setTable(t) {
    if (E.seatCount(t.state) !== lobby.seats.length) throw new Error('the table and the lobby seat different numbers of players');
    table = t;
    table.standIn = lobby.seats.map(() => false);
    table.here = lobby.seats.map((s) => s.kind !== 'guest' || !!s.here);
    lobby.seats.forEach((s, seat) => isGuest(seat) && !lastSeen.has(seenKey(seat)) && lastSeen.set(seenKey(seat), clock()));
    offs.push(table.onChange(sendViews), table.onEmote(relayEmote));
  }

  /** The stand-in takes a guest seat. Returns whether it sat down (and the views went out). */
  function cover(seat) {
    if (!table || covers[seat] || !isGuest(seat)) return false;
    table.standIn[seat] = true;
    covers[seat] = attachBot(table, seat, STAND_IN_RIVAL, { stakes: false, hold });
    onStatus('standin', nameOf(seat));
    table.touch();
    return true;
  }

  /** A covered or away seat is its player's again (the stand-in's lock, if any, stands). */
  function giveBack(seat) {
    covers[seat]?.stop();
    covers[seat] = null;
    table.standIn[seat] = false;
    table.here[seat] = true;
    lobby.seats[seat].here = true;
  }

  /** A ping or an action from a seated guest: the clock restarts, and a covered or away seat comes back. */
  function heard(seat) {
    lastSeen.set(seenKey(seat), clock());
    if (!table || (!covers[seat] && table.here[seat])) return;
    giveBack(seat);
    onStatus('back', nameOf(seat));
    table.touch();
  }

  /** A restored guest seat whose token the save didn't keep goes to the first newcomer. */
  function claim(key, name) {
    const seat = lobby.seats.findIndex((s) => s.kind === 'guest' && !s.token);
    if (seat >= 0) Object.assign(lobby.seats[seat], { token: key, name, here: true });
    return seat;
  }

  function spectate(peerId, key, name) {
    const again = conns.get(peerId)?.key === key; // a repeated hello: welcomed again, not announced again
    const watching = live().filter((id) => id !== peerId && seatOfPeer(id) < 0).length;
    if (watching >= MAX_SPECTATORS) return room.send('nope', { why: 'full' }, peerId);
    conns.set(peerId, { key });
    room.send('welcome', { name: nameOf(0), seat: -1, lobby: publicLobby(lobby) }, peerId);
    if (table) room.send('view', table.view(-1), peerId);
    if (!again) onStatus('watching', name);
  }

  function emoteAs(seat, i) {
    if (!table) return false;
    const t = clock();
    if (t - (lastEmote[seat] ?? -Infinity) < EMOTE_GAP_MS || !table.emote(seat, i)) return false;
    lastEmote[seat] = t;
    return true;
  }

  room.on('hello', (d, peerId) => {
    if (closed) return;
    if (!d || d.v !== PROTOCOL) return room.send('nope', { why: 'version' }, peerId);
    if (typeof d.token !== 'string' || !TOKEN.test(d.token)) return;
    const name = CODENAMES.includes(d.name) ? d.name : 'Agent ?';
    // A second tab of the host's own browser shares its token: it sits under a key of its own, never at seat 0.
    const key = d.token === hostKey ? `tab:${d.token}` : d.token;
    const known = seatOf(lobby, key);
    const holder = known >= 0 ? [...conns].find(([, c]) => c.key === key)?.[0] : undefined;
    const wasAway = known >= 0 && !!table && (!!covers[known] || !table.here[known]);
    let seat = sit(lobby, { token: key, name });
    if (seat < 0 && lobby.started) seat = claim(key, name);
    if (seat < 0) return spectate(peerId, key, name);
    for (const [id, c] of conns) if (c.key === key && id !== peerId) conns.delete(id);
    conns.set(peerId, { key });
    lastSeen.set(key, clock());
    lobby.seats[seat].name = name;
    room.send('welcome', { name: nameOf(0), seat, lobby: publicLobby(lobby) }, peerId);
    if (table) {
      giveBack(seat);
      table.names[seat] = name;
      table.touch(); // every view, this seat's included
    } else sendLobby();
    if (known < 0) onStatus('joined', name);
    else if (wasAway || (holder !== undefined && holder !== peerId)) onStatus('back', name);
  });
  room.on('ping', (d, peerId) => {
    const seat = closed ? -1 : seatOfPeer(peerId);
    if (seat >= 0) heard(seat);
  });
  room.on('act', (a, peerId) => {
    const seat = closed ? -1 : seatOfPeer(peerId);
    if (seat < 0) return;
    heard(seat);
    table?.act(seat, a);
  });
  room.on('emote', (d, peerId) => {
    const seat = closed ? -1 : seatOfPeer(peerId);
    if (seat >= 0) emoteAs(seat, d?.i);
  });

  /**
   * A peer has gone: said goodbye ('bye') or lost ('left'). A spectator is forgotten. A seated player is
   * away (before the start their seat is free again); after a goodbye a match in play gets the stand-in at
   * once, and the leave that follows it finds nobody to report.
   */
  function depart(peerId, status) {
    const c = conns.get(peerId);
    if (closed || !c) return;
    const seat = seatOfPeer(peerId);
    conns.delete(peerId);
    if (seat < 0) return;
    const name = nameOf(seat);
    if (table) {
      table.here[seat] = false;
      lastSeen.set(c.key, clock());
    }
    away(lobby, c.key);
    onStatus(status, name);
    if (!table) sendLobby();
    else if (status !== 'bye' || !cover(seat)) table.touch();
  }
  room.on('bye', (d, peerId) => depart(peerId, 'bye'));
  room.onPeerLeave = (id) => depart(id, 'left');

  /** Seat the stand-in at every guest seat that has been quiet for standInMs. */
  function tick() {
    if (closed || !table) return;
    const t = clock();
    lobby.seats.forEach((s, seat) => isGuest(seat) && !covers[seat] && t - (lastSeen.get(seenKey(seat)) ?? t) >= standInMs && cover(seat));
  }

  if (table) {
    // A saved host resumes: its bots sit again, and every guest seat is quiet until its player says hello.
    const saved = table;
    table = null;
    setTable(saved);
    lobby.seats.forEach((s, seat) => {
      if (s.kind === 'bot') seatBot(seat, s.rival);
      if (s.kind !== 'guest') return;
      s.here = false;
      table.here[seat] = false;
      lastSeen.set(seenKey(seat), clock());
    });
  }
  const ticker = now ? null : setInterval(tick, 5000);
  ticker?.unref?.();

  return {
    get table() {
      return table;
    },
    get lobby() {
      return lobby;
    },
    /** Deal the table from the lobby (two seats taken at least), seat its bots, and send every view. */
    start() {
      const S = startLobby(lobby);
      setTable(makeTable(S));
      for (const { seat, rival } of S.bots) seatBot(seat, rival);
      sendLobby();
      sendViews();
      return table;
    },
    /** Change the lobby before the start ({ size, timer, setup, fill }) and tell everyone. Returns whether every change applied. */
    setLobby({ size, timer, setup, fill } = {}) {
      let ok = !lobby.started;
      if (size !== undefined) ok = resize(lobby, size) && ok;
      if (timer !== undefined) ok = setTimer(lobby, timer) && ok;
      if (setup !== undefined) ok = setSetup(lobby, setup) && ok;
      if (fill === true) fillSeats(lobby);
      else if (fill === false) unfill(lobby);
      sendLobby();
      return ok;
    },
    /** The host's own emote (EMOTES index), rate-limited like everyone's. */
    emote: (i) => emoteAs(0, i),
    tick,
    setStandInMs(ms) {
      standInMs = ms;
    },
    /** Tell everyone still here we're leaving. Settles within 400 ms (at once with nobody to tell). */
    bye() {
      const ids = live();
      return ids.length ? settleWithin(() => Promise.all(ids.map((id) => room.send('bye', {}, id)))) : Promise.resolve();
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(ticker);
      offs.forEach((off) => off());
      [...covers, ...bots].forEach((b) => b?.stop());
      room.leave();
    },
    /** The host's save: the lobby (with its tokens: never send it) and the table. */
    toJSON() {
      return { lobby, table: table ? table.toJSON() : null };
    },
  };
}

/**
 * Guest side: forwards actions and emotes to the host and hands every view, lobby and emote it
 * receives to its callbacks. `seat` is null until welcomed, -1 while watching. It pings the host
 * every `pingMs` while `visible()`, so a quiet tab gets the stand-in.
 */
export function guestSession({ room, name, token, onView, onLobby = () => {}, onEmote = () => {}, onStatus = () => {}, visible = () => true, pingMs = PING_MS }) {
  let hostId = null;
  let said = false;
  let hostName;
  let seat = null;
  const hello = (id) => room.send('hello', { v: PROTOCOL, name, token }, id);
  const ping = () => hostId && room.peers.has(hostId) && visible() && room.send('ping', {}, hostId);
  const pinger = setInterval(ping, pingMs);
  pinger?.unref?.();
  room.onPeerJoin = hello;
  for (const id of room.peers) hello(id);
  room.on('welcome', (d, id) => {
    hostId = id;
    said = false;
    hostName = CODENAMES.includes(d?.name) ? d.name : 'Agent ?';
    seat = Number.isInteger(d?.seat) && d.seat >= -1 && d.seat < MAX_SEATS ? d.seat : 1;
    ping();
    onStatus(seat === -1 ? 'watching' : 'joined', hostName);
    onLobby(d?.lobby ?? null);
  });
  room.on('nope', (d) => onStatus(d?.why === 'version' ? 'version' : 'full'));
  room.on('lobby', (d, id) => {
    if (id !== hostId) return;
    if (Number.isInteger(d?.seat) && d.seat >= -1 && d.seat < MAX_SEATS) seat = d.seat;
    onLobby(d);
  });
  room.on('view', (v, id) => {
    if (id === hostId) onView(v);
  });
  room.on('emote', (d, id) => {
    if (id === hostId && Number.isInteger(d?.seat) && Number.isInteger(d?.i) && d.i >= 0 && d.i < EMOTES.length) onEmote({ seat: d.seat, i: d.i });
  });
  room.on('bye', (d, id) => {
    if (id !== hostId || said) return;
    said = true;
    onStatus('bye', hostName);
  });
  room.onPeerLeave = (id) => {
    if (id === hostId && !said) onStatus('left');
  };
  return {
    get seat() {
      return seat;
    },
    /** Tell the host we're leaving, if they're still here. Settles within 400 ms (at once with nobody to tell). */
    bye() {
      return hostId && room.peers.has(hostId) ? settleWithin(() => room.send('bye', {}, hostId)) : Promise.resolve();
    },
    act(a) {
      if (!hostId || seat === -1) return false;
      room.send('act', a, hostId);
      return true;
    },
    /** Send an emote (an EMOTES index); the host echoes it to everyone, this guest included. */
    emote(i) {
      if (!hostId || seat === null || seat < 0) return false;
      room.send('emote', { i }, hostId);
      return true;
    },
    close() {
      clearInterval(pinger);
      room.leave();
    },
  };
}
