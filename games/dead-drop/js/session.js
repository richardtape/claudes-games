// Who runs the rules and how each player sees them.
//
// A table owns the authoritative match (solo, pass-and-play, or the host's browser online)
// and turns player actions into engine calls. attachBot() lets a computer rival sit at a
// seat. hostSession()/guestSession() carry the same actions and views over a shared/net.js
// room: the guest only ever receives viewFor(state, 1), so it can't see the host's cards.
// Tables seat 2-4 players; online play (hostSession) stays two seats until Phase 3.
import * as E from './engine.js';
import { think, estimateLocked, stakeCall } from './bot.js';
import { createRng } from '../../../shared/rng.js';
import { CODENAMES, SEAT_NAMES } from './data.js';

export const PROTOCOL = 1;

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

export function createTable({ seed = Date.now(), target, cities, seats = 2, names = SEAT_NAMES.slice(0, seats) } = {}) {
  if (names.length !== seats) throw new Error('names must have one entry per seat');
  const none = () => Array(seats).fill(false);
  const listeners = new Set();
  const table = {
    state: E.newMatch({ seed, target, cities, seats }),
    names: names.slice(),
    ready: none(),
    rematch: none(),
    matchId: newMatchId(),
    seq: 0,
    turnSeq: 0,
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
        case 'lock':
          ok = E.lock(S, seat, a.pass ? { pass: true } : { uid: a.uid, city: a.city });
          break;
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
              table.state = E.newMatch({ seed: Date.now() + Math.floor(Math.random() * 1e6), target: S.target, seats });
            }
          }
          break;
      }
      if (ok && E.ready(table.state)) resolved = !!E.resolveTurn(table.state);
      if (ok) table.touch(resolved);
      return ok;
    },
    toJSON() {
      return { state: table.state, names: table.names, ready: table.ready, rematch: table.rematch, seq: table.seq, turnSeq: table.turnSeq, matchId: table.matchId };
    },
  };
  return table;
}

/** Rebuild a table saved with toJSON() (the host's browser resumes after a reload). */
export function restoreTable(saved) {
  const table = createTable({ seed: 1, seats: saved.state.scores.length });
  Object.assign(table, { state: saved.state, names: saved.names, ready: saved.ready, rematch: saved.rematch, seq: saved.seq, turnSeq: saved.turnSeq });
  if (typeof saved.matchId === 'string' && /^[a-z0-9]{8}$/.test(saved.matchId)) table.matchId = saved.matchId;
  return table;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Seat a computer rival. `pace` scales its thinking pauses (0 in tests). `hold()` can return
 * true to make it wait (e.g. while the UI is still animating a reveal).
 */
export function attachBot(table, seat, rival, { pace = 1, rng = createRng(Date.now()), hold = () => false } = {}) {
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
        if (R.pending && R.pending.by !== seat) {
          if (await nap(900)) return;
          const view = table.view(seat);
          const value = view.round.plan ? estimateLocked(view, Math.max(6, rival.samples >> 1), rng) : think(view, { samples: rival.samples, noise: rival.noise, rng }).value;
          table.act(seat, { a: 'respond', accept: stakeCall(table.view(seat), value, rival, rng) === 'accept' });
        } else if (!R.plans[seat]) {
          const turn = R.turn;
          const roundNo = S.roundNo;
          if (await nap(500)) return;
          if (table.state.phase !== 'plan' || table.state.round.turn !== turn || table.state.roundNo !== roundNo) return;
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
