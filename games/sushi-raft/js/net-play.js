// Online co-op over shared/net.js. The host's browser owns the week (the engine state) and runs
// it; the guest plays Kelp: it sends actions and draws the snapshots the host streams. There are
// no secrets in a co-op kitchen, so the guest sees the whole state.
//
// The handshake follows Dead Drop's: the host announces itself to each newcomer (`host`), the guest
// says hello to that peer only, with its token hashed for this room (roomToken), and the host
// answers `welcome` (the seat) or `nope`. A guest who reloads gets Kelp back by its token; if the
// first guest is gone for good, a newcomer may take the seat.
export const PROTOCOL = 1;
/** Snapshots a second during service. */
export const SNAP_HZ = 15;
/** A guest quiet this long (no message at all) counts as away. */
export const QUIET_MS = 6000;
/** The guest pings this often so the host knows it's there between snapshots. */
export const PING_MS = 2000;

/** A browser's token for one room: SHA-256 of `${token}:${code}`, 16 hex characters. */
export async function roomToken(token, code) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${token}:${code}`));
  return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The host's side. `onAct(act)` gets each guest action ({ type, ... }); `onStatus(s)` hears
 * 'joined' | 'back' | 'away' | 'here' | 'left' | 'bye'. Call `snap(payload)` to send a snapshot.
 */
export function hostSession({ room, onAct, onStatus, now = () => Date.now() }) {
  const S = {
    peer: null, // the guest's peer id while connected
    token: null, // the guest's room token
    here: false, // connected and recently heard
    hidden: false, // the guest's tab is hidden
    heard: 0,
    close() {
      clearInterval(timer);
      room.leave();
    },
    /** Send the latest state to the guest (no-op without one). */
    snap(payload) {
      if (S.peer) room.send('snap', payload, S.peer);
    },
    send(type, data) {
      if (S.peer) room.send(type, data, S.peer);
    },
    get away() {
      return !S.peer || !S.here || S.hidden;
    },
  };
  const heard = (from) => {
    if (from !== S.peer) return false;
    S.heard = now();
    if (!S.here) {
      S.here = true;
      onStatus('here');
    }
    return true;
  };
  room.onPeerJoin = (peerId) => room.send('host', { v: PROTOCOL }, peerId);
  room.on('hello', (data, from) => {
    if (data?.v !== PROTOCOL) return room.send('nope', { why: 'version' }, from);
    // A token hashed for the room: the seat's own guest coming back, or the first guest, or a newcomer
    // when the seat's guest has gone.
    const mine = S.token && data.token === S.token;
    if (S.peer && S.peer !== from && !mine && S.here) return room.send('nope', { why: 'full' }, from);
    const back = !!S.token;
    S.peer = from;
    S.token = data.token;
    S.here = true;
    S.hidden = false;
    S.heard = now();
    room.send('welcome', { v: PROTOCOL, seat: 1 }, from);
    onStatus(back && mine ? 'back' : 'joined');
  });
  room.on('act', (data, from) => {
    if (!heard(from) || !data) return;
    onAct(data);
  });
  room.on('ping', (data, from) => {
    if (!heard(from)) return;
    if (typeof data?.hidden === 'boolean' && data.hidden !== S.hidden) {
      S.hidden = data.hidden;
      onStatus(S.hidden ? 'away' : 'here');
    }
  });
  room.on('bye', (data, from) => {
    if (from !== S.peer) return;
    S.peer = null;
    S.here = false;
    onStatus('bye');
  });
  room.onPeerLeave = (peerId) => {
    if (peerId !== S.peer) return;
    S.peer = null;
    S.here = false;
    onStatus('left');
  };
  const timer = setInterval(() => {
    if (S.peer && S.here && now() - S.heard > QUIET_MS) {
      S.here = false;
      onStatus('away');
    }
  }, 1000);
  return S;
}

/**
 * The guest's side. `onSnap(payload)` gets each snapshot; `onStatus(s)` hears 'welcome' |
 * 'nope:<why>' | 'hostLeft'. `act(type, data)` sends an action; `hidden(bool)` reports the tab.
 */
export function guestSession({ room, token, onSnap, onStatus }) {
  const G = {
    host: null,
    welcomed: false,
    hiddenNow: typeof document !== 'undefined' ? document.hidden : false,
    act(type, data = {}) {
      if (G.host) room.send('act', { type, ...data }, G.host);
    },
    hidden(h) {
      G.hiddenNow = h;
      if (G.host) room.send('ping', { hidden: h }, G.host);
    },
    leave() {
      clearInterval(timer);
      if (G.host) room.send('bye', {}, G.host);
      room.leave();
    },
  };
  room.on('host', (data, from) => {
    if (G.host && G.host !== from) return;
    G.host = from;
    room.send('hello', { v: PROTOCOL, token }, from);
  });
  room.on('welcome', (data, from) => {
    if (from !== G.host || G.welcomed) return;
    G.welcomed = true;
    onStatus('welcome');
  });
  room.on('nope', (data, from) => {
    if (from !== G.host && G.host) return;
    onStatus(`nope:${data?.why || 'full'}`);
  });
  room.on('snap', (data, from) => {
    if (from !== G.host) return;
    onSnap(data);
  });
  room.onPeerLeave = (peerId) => {
    if (peerId !== G.host) return;
    G.host = null;
    G.welcomed = false;
    onStatus('hostLeft');
  };
  const timer = setInterval(() => {
    if (G.host) room.send('ping', { hidden: G.hiddenNow }, G.host);
  }, PING_MS);
  return G;
}
