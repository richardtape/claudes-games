/**
 * The online lobby: pure, DOM-free, plain JSON state. Seats, table size, turn timer and roster setup
 * before the match starts; start() turns the taken seats into the engine's table. Tokens are the
 * per-browser secrets that give a reloading player their seat back; publicLobby() never includes them.
 */
import { MAX_SEATS, MIN_SEATS, RIVALS, TIMERS } from './data.js';
import { CLASSIC_SETUP } from './roster.js';

const EMPTY = () => ({ kind: 'empty' });

export function createLobby({ host, size = MAX_SEATS, timer = 0, setup = CLASSIC_SETUP }) {
  const seats = [{ kind: 'host', name: host.name, token: host.token, here: true }];
  for (let i = 1; i < size; i++) seats.push(EMPTY());
  return { size, timer, setup, started: false, seats };
}

export function seatOf(lobby, token) {
  return lobby.seats.findIndex((s) => s.token !== undefined && s.token === token);
}

export function sit(lobby, { token, name }) {
  const known = seatOf(lobby, token);
  if (known >= 0) {
    lobby.seats[known].here = true;
    return known;
  }
  if (lobby.started) return -1;
  const free = lobby.seats.findIndex((s) => s.kind === 'empty');
  if (free < 0) return -1;
  lobby.seats[free] = { kind: 'guest', name, token, here: true };
  return free;
}

export function away(lobby, token) {
  const i = seatOf(lobby, token);
  if (i < 0) return;
  if (lobby.started) lobby.seats[i].here = false;
  else if (lobby.seats[i].kind === 'guest') lobby.seats[i] = EMPTY();
}

export function taken(lobby) {
  return lobby.seats.filter((s) => s.kind !== 'empty');
}

export function canStart(lobby) {
  return !lobby.started && taken(lobby).length >= 2;
}

export function resize(lobby, size) {
  if (lobby.started || !Number.isInteger(size) || size < MIN_SEATS || size > MAX_SEATS) return false;
  if (size < taken(lobby).length) return false;
  while (lobby.seats.length < size) lobby.seats.push(EMPTY());
  // Shrink by removing empty seats from the end; the host is seat 0 and always taken.
  for (let i = lobby.seats.length - 1; i >= 0 && lobby.seats.length > size; i--) {
    if (lobby.seats[i].kind === 'empty') lobby.seats.splice(i, 1);
  }
  lobby.size = size;
  return true;
}

export function setTimer(lobby, ms) {
  if (lobby.started || !TIMERS.includes(ms)) return false;
  lobby.timer = ms;
  return true;
}

export function setSetup(lobby, setup) {
  if (lobby.started || !setup) return false;
  lobby.setup = setup;
  return true;
}

export function fill(lobby) {
  if (lobby.started) return;
  const used = new Set(lobby.seats.filter((s) => s.kind === 'bot').map((s) => s.rival));
  const pool = RIVALS.filter((r) => !used.has(r.id));
  for (let i = 0; i < lobby.seats.length; i++) {
    if (lobby.seats[i].kind !== 'empty') continue;
    const r = pool.shift();
    if (!r) break;
    lobby.seats[i] = { kind: 'bot', rival: r.id, name: r.name };
  }
}

export function unfill(lobby) {
  if (lobby.started) return;
  lobby.seats = lobby.seats.map((s) => (s.kind === 'bot' ? EMPTY() : s));
}

export function start(lobby) {
  if (!canStart(lobby)) throw new Error('lobby cannot start');
  const seats = taken(lobby);
  lobby.seats = seats;
  lobby.size = seats.length;
  lobby.started = true;
  return {
    seats: seats.length,
    names: seats.map((s) => s.name),
    bots: seats.flatMap((s, seat) => (s.kind === 'bot' ? [{ seat, rival: s.rival }] : [])),
    tokens: seats.map((s) => (s.kind === 'bot' ? null : s.token)),
  };
}

export function publicLobby(lobby) {
  return {
    size: lobby.size,
    timer: lobby.timer,
    roster: lobby.setup && lobby.setup.mixed ? 'mixed' : 'classic',
    started: lobby.started,
    seats: lobby.seats.map((s) => ({ kind: s.kind, name: s.name, here: s.here })),
  };
}
