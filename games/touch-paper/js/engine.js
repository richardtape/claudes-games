// Touch Paper rules engine: pure, DOM-free, deterministic from a seed.
//
// Cards are numbers. 0-51 are the pack (suit = c / 13 | 0, rank = c % 13 + 1, Ace = 1,
// King = 13). 200-251 are a spare pack (the Spare box perk). 100+ are sparklers (wild fuses).
//
//   const s = newShow({ seed: 'abc' });   // phase 'play', act 0 dealt
//   legalPlays(s)                          // layout slots that fit the fuse
//   play(s, slot)                          // load that card into the volley
//   strike(s)                              // fire the volley, draw a new fuse
//   s.phase === 'report' → nextAct(s) → 'shed' (choosePerk) | 'won' | 'over'
import { createRng, hashString } from '../../../shared/rng.js';
import { LAYOUTS, PERKS, SHELLS, SHELL, TWISTS } from './data.js';

export const VERSION = 1;
export const ACTS = 5;
/** Cumulative crowd targets: the show total needed by the end of each act. */
export let TARGETS = [150, 800, 1500, 2350, 3500];
/** Finale: rocket n (of the cards left in the box when the layout is cleared) scores n × this. */
export let FINALE_ROCKET = 10;
export const CROWD_EXTRA = 0.3; // 'A big crowd' raises that act's step by this fraction
/** How many cards on top of the box lie face up to choose from when you strike. */
export let WINDOW = 3;

export function tune({ targets, finale, window, handPlay } = {}) {
  if (handPlay !== undefined) HAND_PLAY = handPlay;
  if (targets) TARGETS = targets;
  if (finale) FINALE_ROCKET = finale;
  if (window) WINDOW = window;
}

// ---------- cards ----------
export const isWild = (c) => c >= 100 && c < 200;
export const baseCard = (c) => (c >= 200 ? c - 200 : c);
export const rankOf = (c) => (isWild(c) ? 0 : (baseCard(c) % 13) + 1);
export const suitOf = (c) => (isWild(c) ? -1 : Math.floor(baseCard(c) / 13));

/** +1 if b is one above a, -1 if one below, 0 if it doesn't follow. Wraps K-A unless `wrap` is false. */
export function stepBetween(a, b, wrap = true) {
  const ra = rankOf(a);
  const rb = rankOf(b);
  if (!ra || !rb) return 0;
  if (rb === ra + 1 || (wrap && ra === 13 && rb === 1)) return 1;
  if (rb === ra - 1 || (wrap && ra === 1 && rb === 13)) return -1;
  return 0;
}

export function fits(fuse, card, wrap = true) {
  if (isWild(fuse)) return !isWild(card);
  return stepBetween(fuse, card, wrap) !== 0;
}

// ---------- layouts ----------
/** Parse a layout's art into slot positions (col, row in half-card units) and cover lists. */
export function parseLayout(layout) {
  const slots = [];
  layout.art.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) if (line[col] === 'x') slots.push({ col, row });
  });
  const coveredBy = slots.map((a) =>
    slots
      .map((b, j) => (b.row === a.row + 1 && Math.abs(b.col - a.col) <= 1 ? j : -1))
      .filter((j) => j >= 0),
  );
  const cols = Math.max(...slots.map((s) => s.col)) + 2;
  const rows = Math.max(...slots.map((s) => s.row)) + 2;
  return { slots, coveredBy, cols, rows };
}
const PARSED = new Map(LAYOUTS.map((l) => [l.id, parseLayout(l)]));
export const layoutInfo = (id) => PARSED.get(id);
/** For tools/layouts.mjs: probe a candidate layout without adding it to data.js. */
export const registerLayout = (id, info) => PARSED.set(id, info);

// ---------- show setup ----------
function rngFor(seed, ...parts) {
  return createRng(hashString([seed, ...parts].join('|')));
}

export function newShow({ seed = String(Date.now()), daily = false } = {}) {
  const rng = rngFor(seed, 'twists');
  const pool = rng.shuffle(TWISTS.map((t) => t.id));
  const twists = [null, ...pool.slice(0, ACTS - 1)];
  const dampSuit = rng.int(0, 3);
  const state = {
    v: VERSION,
    seed: String(seed),
    daily,
    act: 0,
    phase: 'play',
    total: 0,
    actScore: 0,
    perks: [],
    offers: [],
    twists,
    dampSuit,
    layoutId: null,
    slots: [], // { card, gone, up }
    box: [],
    fuse: null,
    volley: [], // { c, s }: s = step from the previous shell (+1 / -1), 0 when it starts the chain
    slowUsed: false,
    damp: [], // cards lost to drizzle this act (shown in the report)
    log: [], // every fired volley: { act, cards, patterns, score }
    found: {}, // shell id -> count this show
    stats: { volleys: 0, shells: 0, cleared: 0, finales: 0, best: null },
    report: null,
    seq: 0, // counts actions, for the UI
  };
  deal(state);
  return state;
}

export const twistOf = (state, act = state.act) => state.twists[act];
export const has = (state, perk) => state.perks.includes(perk);
export const wraps = (state) => twistOf(state) !== 'wind';

/** Target for the end of act `act` (cumulative). */
export function targetFor(state, act = state.act) {
  const prev = act > 0 ? TARGETS[act - 1] : 0;
  const step = TARGETS[act] - prev;
  const extra = state.twists[act] === 'crowd' ? Math.round(step * CROWD_EXTRA) : 0;
  return TARGETS[act] + extra;
}

function deal(state) {
  const layout = LAYOUTS[state.act];
  const info = layoutInfo(layout.id);
  const rng = rngFor(state.seed, 'deal', state.act);
  const deck = rng.shuffle([...Array(52).keys()]);
  const n = info.slots.length;
  state.layoutId = layout.id;
  state.slots = deck.slice(0, n).map((card) => ({ card, gone: false, up: false }));
  let box = deck.slice(n);
  const extras = rngFor(state.seed, 'extras', state.act);
  state.damp = [];
  if (twistOf(state) === 'drizzle') state.damp = box.splice(box.length - 4, 4);
  if (has(state, 'sparebox')) {
    const spare = extras.shuffle([...Array(52).keys()]).slice(0, 3).map((c) => c + 200);
    for (const c of spare) box.splice(extras.int(0, box.length), 0, c);
  }
  if (has(state, 'sparklers')) {
    for (const c of [100, 101]) box.splice(extras.int(1, box.length), 0, c);
  }
  state.box = box;
  state.volley = [];
  state.actScore = 0;
  state.slowUsed = false;
  state.report = null;
  state.phase = 'play';
  refreshFaces(state);
  // Open on a fuse that something follows: the first card in the box that fits an open card.
  const open = state.slots.filter((s, i) => isOpen(state, i, info)).map((s) => s.card);
  const k = box.findIndex((c) => !isWild(c) && open.some((o) => fits(c, o, wraps(state))));
  state.fuse = box.splice(Math.max(0, k), 1)[0];
}

/** Cards turn face up once nothing covers them (or always, on a clear night / Clear sky). */
function refreshFaces(state) {
  const info = layoutInfo(state.layoutId);
  const allUp = has(state, 'clearsky') || twistOf(state) === 'clear';
  const flipped = [];
  state.slots.forEach((s, i) => {
    if (s.gone || s.up) return;
    if (allUp || isOpen(state, i, info)) {
      s.up = true;
      flipped.push(i);
    }
  });
  return flipped;
}

export function isOpen(state, i, info = layoutInfo(state.layoutId)) {
  return !state.slots[i].gone && info.coveredBy[i].every((j) => state.slots[j].gone);
}

export function legalPlays(state) {
  if (state.phase !== 'play') return [];
  const wrap = wraps(state);
  const out = [];
  state.slots.forEach((s, i) => {
    if (!s.gone && isOpen(state, i) && fits(state.fuse, s.card, wrap)) out.push(i);
  });
  return out;
}

export const remaining = (state) => state.slots.filter((s) => !s.gone).length;

// ---------- play ----------
export function play(state, slot) {
  if (state.phase !== 'play') return { ok: false, reason: 'not playing' };
  const s = state.slots[slot];
  if (!s || s.gone || !isOpen(state, slot)) return { ok: false, reason: 'covered' };
  if (!fits(state.fuse, s.card, wraps(state))) return { ok: false, reason: 'does not follow' };
  const prev = state.volley.length ? state.volley[state.volley.length - 1].c : null;
  const step = prev !== null && prev === state.fuse ? stepBetween(prev, s.card, wraps(state)) : 0;
  s.gone = true;
  state.volley.push({ c: s.card, s: step });
  state.fuse = s.card;
  state.seq++;
  const flipped = refreshFaces(state);
  const out = { ok: true, card: s.card, slot, flipped, position: state.volley.length };
  if (state.volley.length >= RACK) out.fired = fire(state, { full: true });
  const ended = checkEnd(state);
  if (ended) out.ended = ended;
  return out;
}

/** Hand cards: the top WINDOW cards of the box, face up. */
export const hand = (state) => state.box.slice(0, Math.min(WINDOW, state.box.length));
export let HAND_PLAY = true;

/** Hand cards that would follow the fuse as a shell. */
export function legalHandPlays(state) {
  if (state.phase !== 'play' || !HAND_PLAY) return [];
  const wrap = wraps(state);
  return hand(state)
    .map((c, k) => (!isWild(c) && fits(state.fuse, c, wrap) ? k : -1))
    .filter((k) => k >= 0);
}

/** Play a hand card into the volley as a shell (it costs you that strike later). */
export function playHand(state, k) {
  if (!legalHandPlays(state).includes(k)) return { ok: false, reason: 'does not follow' };
  const card = state.box[k];
  const prev = state.volley.length ? state.volley[state.volley.length - 1].c : null;
  const step = prev !== null && prev === state.fuse ? stepBetween(prev, card, wraps(state)) : 0;
  state.box.splice(k, 1);
  state.volley.push({ c: card, s: step, hand: true });
  state.fuse = card;
  state.seq++;
  const out = { ok: true, card, hand: k, flipped: [], position: state.volley.length };
  if (state.volley.length >= RACK) out.fired = fire(state, { full: true });
  const ended = checkEnd(state);
  if (ended) out.ended = ended;
  return out;
}

/** Strike the next card from the box. Fires the volley unless `slow` (Slow match, once an act). */
export function strike(state, { slow = false, pick = 0 } = {}) {
  if (state.phase !== 'play') return { ok: false, reason: 'not playing' };
  if (!state.box.length) return { ok: false, reason: 'box empty' };
  if (pick < 0 || pick >= Math.min(WINDOW, state.box.length)) return { ok: false, reason: 'not in reach' };
  if (slow && (!has(state, 'slowmatch') || state.slowUsed || !state.volley.length)) {
    return { ok: false, reason: 'no slow match' };
  }
  const out = { ok: true, fired: null, slow };
  if (slow) state.slowUsed = true;
  else out.fired = fire(state);
  state.fuse = state.box.splice(pick, 1)[0];
  out.drawn = state.fuse;
  state.seq++;
  const ended = checkEnd(state);
  if (ended) out.ended = ended;
  return out;
}

export function canSlow(state) {
  return state.phase === 'play' && has(state, 'slowmatch') && !state.slowUsed && state.volley.length > 0 && state.box.length > 0;
}

/** True when the act can still go on (a card fits, or the box has cards). */
export function canMove(state) {
  return state.box.length > 0 || legalPlays(state).length > 0;
}

function checkEnd(state) {
  const cleared = remaining(state) === 0;
  if (!cleared && canMove(state)) return null;
  const fired = fire(state);
  const rockets = cleared ? state.box.length : 0;
  const each = FINALE_ROCKET * (has(state, 'showman') ? 2 : 1);
  // Rocket n of the finale scores n × each: the more you saved, the bigger the barrage.
  const finale = { rockets, each, points: (each * rockets * (rockets + 1)) / 2 };
  state.actScore += finale.points;
  state.total += finale.points;
  state.stats.finales = (state.stats.finales || 0) + finale.points;
  if (cleared) state.stats.cleared++;
  const target = targetFor(state);
  const passed = state.total >= target;
  const outcome = !passed ? 'over' : state.act === ACTS - 1 ? 'won' : 'shed';
  state.report = {
    act: state.act,
    cleared,
    left: remaining(state),
    fired,
    finale,
    actScore: state.actScore,
    total: state.total,
    target,
    passed,
    outcome,
  };
  state.phase = 'report';
  return state.report;
}

// ---------- scoring ----------
export const RUN_BIG = 6; // Tourbillion / Waterfall: this many rising or falling in a row
export const COMET = 6;
/** The rack holds this many shells; a full rack fires at once and the chain carries on. */
export const RACK = 10;
export const KAMURO = RACK;

/** Named shells found in a volley (highest of each family), in Pattern Book order. */
export function findShells(volley, { wrap = true } = {}) {
  const n = volley.length;
  const hits = new Set();
  if (!n) return [];
  const suits = volley.map((v) => suitOf(v.c));
  const ranks = volley.map((v) => rankOf(v.c));
  // colours: the most shells of any one colour
  const counts = [0, 0, 0, 0];
  for (const su of suits) if (su >= 0) counts[su]++;
  const most = Math.max(...counts);
  if (most >= 5) hits.add('chrysanthemum');
  else if (most >= 3) hits.add('peony');
  // rising / falling runs: consecutive steps of the same sign (steps live on shells 1..n-1)
  let up = 0;
  let down = 0;
  let bestUp = 0;
  let bestDown = 0;
  let zig = 0;
  let bestZig = 0;
  for (let i = 1; i < n; i++) {
    const s = volley[i].s;
    up = s === 1 ? up + 1 : 0;
    down = s === -1 ? down + 1 : 0;
    bestUp = Math.max(bestUp, up);
    bestDown = Math.max(bestDown, down);
    const prev = i > 1 ? volley[i - 1].s : 0;
    zig = s !== 0 && prev !== 0 && s === -prev ? zig + 1 : s !== 0 ? 1 : 0;
    bestZig = Math.max(bestZig, zig);
    if (wrap && s !== 0 && ((ranks[i - 1] === 13 && ranks[i] === 1) || (ranks[i - 1] === 1 && ranks[i] === 13))) {
      hits.add('brocade');
    }
  }
  if (bestUp >= RUN_BIG - 1) hits.add('tourbillion');
  else if (bestUp >= 3) hits.add('palm');
  if (bestDown >= RUN_BIG - 1) hits.add('waterfall');
  else if (bestDown >= 3) hits.add('willow');
  if (bestZig >= 3) hits.add('strobe');
  if (counts.every((x) => x > 0)) hits.add('crossette');
  if (n >= 5 && ranks[0] === ranks[n - 1]) hits.add('ring');
  if (n >= KAMURO) hits.add('kamuro');
  else if (n >= COMET) hits.add('comet');
  return SHELLS.filter((s) => hits.has(s.id)).map((s) => s.id);
}

/** Score a volley under the state's perks and the act's conditions (does not change state). */
export function scoreVolley(state, volley = state.volley) {
  const n = volley.length;
  const twist = twistOf(state);
  const shells = volley.map((v, i) => {
    const suit = suitOf(v.c);
    let pts = i + 1;
    if (has(state, 'starmine')) pts += 1;
    const salt = PERKS.find((p) => p.suit === suit);
    if (salt && has(state, salt.id)) pts += 2;
    if (has(state, 'crackle') && i >= 6) pts *= 2;
    if (twist === 'damp' && suit === state.dampSuit) pts = 0;
    return { c: v.c, pts };
  });
  const base = shells.reduce((a, s) => a + s.pts, 0);
  const patterns = findShells(volley, { wrap: wraps(state) }).map((id) => {
    let bonus = SHELL[id].bonus;
    const fam = SHELL[id].family;
    if (fam === 'colour' && has(state, 'peonymould')) bonus += 1;
    if ((fam === 'rise' || fam === 'fall') && has(state, 'willowmould')) bonus += 1;
    return { id, bonus };
  });
  const extras = [];
  if (has(state, 'blackpowder') && n >= 4) extras.push({ id: 'blackpowder', bonus: 1 });
  if (twist === 'crowd' && n > 0) extras.push({ id: 'crowd', bonus: 1 });
  const lift = 1 + [...patterns, ...extras].reduce((a, p) => a + p.bonus, 0);
  const dud = twist === 'gusty' && n <= 2;
  const score = dud ? 0 : base * lift;
  return { shells, base, patterns, extras, lift, dud, score, n };
}

function fire(state, { full = false } = {}) {
  if (!state.volley.length) return null;
  const result = scoreVolley(state);
  const cards = state.volley.map((v) => v.c);
  state.actScore += result.score;
  state.total += result.score;
  state.stats.volleys++;
  state.stats.shells += cards.length;
  if (!result.dud) for (const p of result.patterns) state.found[p.id] = (state.found[p.id] || 0) + 1;
  const entry = { act: state.act, cards, patterns: result.patterns.map((p) => p.id), score: result.score };
  state.log.push(entry);
  const best = state.stats.best;
  if (!best || result.score > best.score) state.stats.best = { ...entry };
  state.volley = [];
  return { ...result, cards, full };
}

/** Score a line of shells as the rack would fire it (a full rack fires and the chain goes on). */
export function scoreChain(state, shells) {
  let total = 0;
  for (let i = 0; i < shells.length; i += RACK) {
    const part = shells.slice(i, i + RACK);
    if (i > 0) part[0] = { ...part[0], s: 0 };
    total += scoreVolley(state, part).score;
  }
  return total;
}

// ---------- between acts ----------
export function nextAct(state) {
  if (state.phase !== 'report') return false;
  const { outcome } = state.report;
  if (outcome === 'over' || outcome === 'won') {
    state.phase = outcome;
    return true;
  }
  const rng = rngFor(state.seed, 'shed', state.act);
  const pool = PERKS.filter((p) => !state.perks.includes(p.id)).map((p) => p.id);
  state.offers = rng.shuffle(pool).slice(0, 3);
  state.phase = 'shed';
  return true;
}

export function choosePerk(state, id) {
  if (state.phase !== 'shed') return false;
  if (id !== null && !state.offers.includes(id)) return false;
  if (id) state.perks.push(id);
  state.offers = [];
  state.act++;
  deal(state);
  return true;
}

/** Fill in fields a newer version added (none yet), so old saves keep working. */
export function upgradeState(state) {
  if (!state || state.v !== VERSION) return null;
  return state;
}
