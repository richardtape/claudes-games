// Who runs the rules and how each player sees them.
//
// A table owns the authoritative match (solo, pass-and-play, or the host's browser online)
// and turns player actions into engine calls. attachBot() lets a computer rival sit at a
// seat. hostSession()/guestSession() carry the same actions and views over a shared/net.js
// room: the guest only ever receives viewFor(state, 1), so it can't see the host's cards.
// Tables seat 2-4 players; online play (hostSession) stays two seats until Phase 3. A table plays a
// setup (roster.js: Classic, Mixed or a ladder rival's) and keeps it for rematches and saves.
import * as E from './engine.js';
import { think, estimateLocked, stakeCall } from './bot.js';
import { createRng } from '../../../shared/rng.js';
import { CODENAMES, SEAT_NAMES } from './data.js';
import { CLASSIC_SETUP, matchOptions } from './roster.js';

/** 3: Phase 2b-ii (rosters, 20 agents and cities, partner and face-down drops). Older guests are turned away. */
export const PROTOCOL = 3;

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
 * rng, so a Classic table deals as before; a twist (a ladder rival's) belongs to `twistSeat`.
 */
export function createTable({ seed = randomSeed(), target, cities, seats = 2, names = SEAT_NAMES.slice(0, seats), setup = CLASSIC_SETUP, twistSeat = 1 } = {}) {
  if (names.length !== seats) throw new Error('names must have one entry per seat');
  const none = () => Array(seats).fill(false);
  const listeners = new Set();
  /** A match of the table's setup (the seed also draws a Mixed roster). Round 1 deals `cities`, if given. */
  const newMatch = (matchSeed, matchTarget, matchCities) =>
    E.newMatch({ seed: matchSeed, target: matchTarget, cities: matchCities, seats, ...matchOptions(table.setup, createRng(`${matchSeed}:setup`), twistSeat) });
  const table = {
    setup,
    state: null,
    names: names.slice(),
    ready: none(),
    rematch: none(),
    matchId: newMatchId(),
    seq: 0,
    turnSeq: 0,
    /** A new match of `setup` (seed, roster, match id) at this table, keeping its listeners: the host's lobby before anyone joins. */
    restart(next = table.setup) {
      table.setup = next;
      table.state = newMatch(randomSeed(), table.state.target);
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
    view(seat) {
      return { ...E.viewFor(table.state, seat), names: table.names.slice(), ready: table.ready.slice(), rematch: table.rematch.slice(), seq: table.seq, turnSeq: table.turnSeq, matchId: table.matchId };
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
              table.state = newMatch(randomSeed(), S.target);
            }
          }
          break;
      }
      if (ok && E.ready(table.state)) resolved = !!E.resolveTurn(table.state);
      if (ok) table.touch(resolved);
      return ok;
    },
    toJSON() {
      return { state: table.state, names: table.names, ready: table.ready, rematch: table.rematch, seq: table.seq, turnSeq: table.turnSeq, matchId: table.matchId, setup: table.setup };
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
 * resumes as Classic. The twist keeps its seat for rematches.
 */
export function restoreTable(saved) {
  if (!canRestore(saved)) throw new Error('a table saved by an older version of Dead Drop');
  E.upgradeState(saved.state);
  const table = createTable({ seed: 1, seats: saved.state.scores.length, twistSeat: saved.state.twist?.seat ?? 1 });
  const setup = isSetup(saved.setup) ? saved.setup : CLASSIC_SETUP;
  Object.assign(table, { setup, state: saved.state, names: saved.names, ready: saved.ready, rematch: saved.rematch, seq: saved.seq, turnSeq: saved.turnSeq });
  if (typeof saved.matchId === 'string' && /^[a-z0-9]{8}$/.test(saved.matchId)) table.matchId = saved.matchId;
  return table;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** How long a wiretapping bot waits for its mark to lock in before choosing without the city. */
export const TAP_WAIT_MS = 6000;

/**
 * Does `seat` (whose view this is) wiretap a mark this turn that hasn't locked in yet (a folded or
 * passing mark counts as locked), and that isn't wiretapping `seat` back (they'd wait for each other)?
 * Entries are per seat, so a `tap` twist and a Wiretap on the same mark count once.
 */
function waitingOnMark(view, seat) {
  const V = view.round;
  if (!V.tapped?.length) return false;
  for (const e of V.tapped) {
    if (V.locked[e.seat]) continue;
    let back = false;
    for (const t of V.taps) if (t.by === e.seat && t.on === seat) back = true;
    if (!back) return true;
  }
  return false;
}

/**
 * Seat a computer rival. `pace` scales its thinking pauses (0 in tests). `hold()` can return
 * true to make it wait (e.g. while the UI is still animating a reveal). A bot that wiretaps its
 * mark waits up to `tapWait` ms for the mark to lock in, so it hears the city before it chooses.
 */
export function attachBot(table, seat, rival, { pace = 1, rng = createRng(Date.now()), hold = () => false, tapWait = TAP_WAIT_MS } = {}) {
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
          const view = table.view(seat);
          const value = view.round.plan ? estimateLocked(view, Math.max(6, rival.samples >> 1), rng) : think(view, { samples: rival.samples, noise: rival.noise, rng }).value;
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
          if (owed()) {
            // The escalation's own tick() found this one busy, and a return skips the re-tick below:
            // tick again once this one has returned (the finally clears `busy` first) to answer it.
            setTimeout(tick, 0);
            return;
          }
          const view = table.view(seat);
          const thought = think(view, { samples: rival.samples, noise: rival.noise, rng });
          const call = stakeCall(view, thought.value, rival, rng);
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
    }
    // The table may have changed while we were thinking.
    if (!stopped && table.seq !== seqAtStart) setTimeout(tick, 0);
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

/**
 * Host side of an online match: the table lives here; seat 1 belongs to whoever says hello
 * first (and to them again if they reconnect with the same token).
 */
export function hostSession({ room, table, onStatus = () => {} }) {
  if (E.seatCount(table.state) > 2) throw new Error('online play seats two players until Phase 3');
  let guest = null;
  let said = false; // the guest said bye: its later peer-leave is not a lost connection
  const sendView = () => guest && room.peers.has(guest.peerId) && room.send('view', table.view(1), guest.peerId);
  room.on('hello', (d, peerId) => {
    if (!d || d.v !== PROTOCOL) return room.send('nope', { why: 'version' }, peerId);
    const returning = guest && guest.token === d.token;
    if (guest && !returning && room.peers.has(guest.peerId)) return room.send('nope', { why: 'full' }, peerId);
    guest = { peerId, token: d.token, name: d.name };
    said = false;
    table.names[1] = CODENAMES.includes(d.name) ? d.name : 'Agent ?';
    room.send('welcome', { name: table.names[0] }, peerId);
    onStatus(returning ? 'back' : 'joined', table.names[1]);
    table.touch();
  });
  room.on('act', (a, peerId) => {
    if (guest && peerId === guest.peerId) table.act(1, a);
  });
  room.on('bye', (d, peerId) => {
    if (!guest || peerId !== guest.peerId || said) return;
    said = true;
    onStatus('bye', table.names[1]);
  });
  room.onPeerLeave = (id) => {
    if (guest && id === guest.peerId && !said) onStatus('left', table.names[1]);
  };
  const off = table.onChange(sendView);
  return {
    get guest() {
      return guest;
    },
    /** Tell the guest we're leaving, if they're still here. Settles within 400 ms (at once with nobody to tell). */
    bye() {
      return guest && room.peers.has(guest.peerId) ? settleWithin(() => room.send('bye', {}, guest.peerId)) : Promise.resolve();
    },
    close() {
      off();
      room.leave();
    },
  };
}

/** Guest side: forwards actions to the host and hands every view it receives to onView. */
export function guestSession({ room, name, token, onView, onStatus = () => {} }) {
  let hostId = null;
  let said = false;
  let hostName;
  const hello = (id) => room.send('hello', { v: PROTOCOL, name, token }, id);
  room.onPeerJoin = hello;
  for (const id of room.peers) hello(id);
  room.on('welcome', (d, id) => {
    hostId = id;
    said = false;
    hostName = CODENAMES.includes(d?.name) ? d.name : 'Agent ?';
    onStatus('joined', hostName);
  });
  room.on('nope', (d) => onStatus(d?.why === 'version' ? 'version' : 'full'));
  room.on('view', (v, id) => {
    if (id === hostId) onView(v);
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
    /** Tell the host we're leaving, if they're still here. Settles within 400 ms (at once with nobody to tell). */
    bye() {
      return hostId && room.peers.has(hostId) ? settleWithin(() => room.send('bye', {}, hostId)) : Promise.resolve();
    },
    act(a) {
      if (hostId) room.send('act', a, hostId);
      return !!hostId;
    },
    close() {
      room.leave();
    },
  };
}
