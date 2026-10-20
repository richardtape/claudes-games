// Peer-to-peer rooms for multiplayer games (see CLAUDE.md, "Multiplayer"). No server: browsers
// find each other through Trystero's public relays, then talk directly over WebRTC.
//
//   const room = await joinRoom({ slug: 'dead-drop', code });            // real play (Trystero)
//   const room = await joinRoom({ slug, code, transport: 'local' });     // same browser, any tabs
//   room.onPeerJoin = (peerId) => room.send('hello', { name }, peerId);
//   room.on('hello', (data, peerId) => ...);
//   room.onPeerLeave = (peerId) => ...;   room.onError = (message) => ...;   room.leave();
//
// Only call joinRoom when the player chooses to play online: the Trystero import and relay
// connections are network traffic (and console noise when a relay is down).
// createMemoryPair() gives two connected rooms for node:test, createMemoryHub(n) any number.

export const TRYSTERO_URL = 'https://cdn.jsdelivr.net/npm/trystero@0.26.0/+esm';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

/** A short room code without look-alike characters (no I/1, O/0, L, U). */
export function roomCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

export const cleanCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

/** The room object every transport returns. */
function makeRoom(selfId) {
  const handlers = new Map();
  const room = {
    selfId,
    onPeerJoin: () => {},
    onPeerLeave: () => {},
    onError: () => {},
    peers: new Set(),
    on(type, cb) {
      handlers.set(type, cb);
      return room;
    },
    send() {},
    leave() {},
    _deliver(type, data, from) {
      handlers.get(type)?.(data, from);
    },
    _join(id) {
      if (room.peers.has(id)) return;
      room.peers.add(id);
      room.onPeerJoin(id);
    },
    _leave(id) {
      if (!room.peers.delete(id)) return;
      room.onPeerLeave(id);
    },
  };
  return room;
}

export async function joinRoom({ slug, code, transport = 'p2p', appId = `claudes-games/${slug}/v1` }) {
  if (transport === 'local') return localRoom(slug, code);
  const trystero = await import(TRYSTERO_URL);
  const room = makeRoom(trystero.selfId);
  const t = trystero.joinRoom({ appId }, code, {
    onJoinError: (details) => room.onError(details?.error?.message || String(details?.error || 'could not connect')),
  });
  const msg = t.makeAction('msg');
  msg.onMessage = (packet, { peerId }) => room._deliver(packet.type, packet.data, peerId);
  t.onPeerJoin = (id) => room._join(id);
  t.onPeerLeave = (id) => room._leave(id);
  room.send = (type, data, to) => msg.send({ type, data }, to ? { target: to } : undefined);
  room.leave = () => t.leave();
  return room;
}

/** BroadcastChannel transport: every tab of this browser that opens the same code is a peer. */
function localRoom(slug, code) {
  const room = makeRoom(randomId());
  const ch = new BroadcastChannel(`cg-net:${slug}:${code}`);
  const post = (m) => ch.postMessage({ ...m, from: room.selfId });
  ch.onmessage = ({ data: m }) => {
    if (m.from === room.selfId || (m.to && m.to !== room.selfId)) return;
    if (m.kind === 'hello') {
      post({ kind: 'here', to: m.from });
      room._join(m.from);
    } else if (m.kind === 'here') room._join(m.from);
    else if (m.kind === 'bye') room._leave(m.from);
    else if (m.kind === 'msg') {
      room._join(m.from);
      room._deliver(m.type, m.data, m.from);
    }
  };
  room.send = (type, data, to) => post({ kind: 'msg', type, data, to });
  const bye = () => post({ kind: 'bye' });
  room.leave = () => {
    bye();
    ch.close();
    if (typeof removeEventListener === 'function') removeEventListener('pagehide', bye);
  };
  if (typeof addEventListener === 'function') addEventListener('pagehide', bye);
  queueMicrotask(() => post({ kind: 'hello' }));
  return room;
}

/** Two rooms wired to each other, delivering asynchronously like a network. For tests. */
export function createMemoryPair() {
  const a = makeRoom('peer-a');
  const b = makeRoom('peer-b');
  const link = (from, to) => {
    from.send = (type, data) => {
      const copy = JSON.parse(JSON.stringify(data ?? null));
      setTimeout(() => to._deliver(type, copy, from.selfId), 0);
    };
    from.leave = () => setTimeout(() => to._leave(from.selfId), 0);
  };
  link(a, b);
  link(b, a);
  /** Call after both sides have set their handlers. */
  const connect = () => setTimeout(() => (a._join(b.selfId), b._join(a.selfId)), 0);
  return { a, b, connect };
}

/**
 * `n` rooms (`peer-0` … `peer-${n-1}`) wired to each other, delivering asynchronously like
 * createMemoryPair. `send(type, data, to)` reaches that peer only, or every other room without `to`;
 * `leave()` tells every other room (onPeerLeave), and a room that has left sends and hears nothing.
 * For tests of three or more players.
 */
export function createMemoryHub(n) {
  const rooms = Array.from({ length: n }, (_, i) => makeRoom(`peer-${i}`));
  const gone = new Set();
  const later = (fn) => setTimeout(fn, 0);
  for (const from of rooms) {
    from.send = (type, data, to) => {
      if (gone.has(from)) return;
      const copy = JSON.stringify(data ?? null);
      for (const room of rooms) {
        if (room === from || (to && room.selfId !== to)) continue;
        later(() => gone.has(room) || room._deliver(type, JSON.parse(copy), from.selfId));
      }
    };
    from.leave = () => {
      if (gone.has(from)) return;
      gone.add(from);
      later(() => rooms.forEach((room) => room !== from && !gone.has(room) && room._leave(from.selfId)));
    };
  }
  /** Call after every room has set its handlers. */
  const connect = () =>
    later(() => {
      for (const a of rooms) for (const b of rooms) if (a !== b && !gone.has(a) && !gone.has(b)) a._join(b.selfId);
    });
  return { rooms, connect };
}
