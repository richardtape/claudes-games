// Computer spymasters. A bot only ever sees viewFor(state, seat): it fills in what it can't
// see at random (determinize), plays every legal drop out to the end of the round many times
// with a quick heuristic policy (Monte Carlo), and picks the drop that does best. Each playout
// scores the round and the Microfilm, and drops are ranked by round + weight × film, so a bot
// chases the film city (harder when anyone is one strip from the reel). Its bets use the round
// alone: it spends escalation tokens on strong hands, paced so it keeps tokens back for the rounds
// ahead (its bluffs keep the same pace and never spend its last token), answers any call it owes at
// any table size, and folds late and only sometimes, all blurred by the rival's personality
// (STAKES in data.js).
//
// Phase 2b-ii content: a face-down card is only what it can be (couldBe), a `seen` twist's cards are
// known, a wiretapped mark's locked city binds its first drop in every playout (constraints), and the
// drops weighed leave out all but an Accomplice's strongest partner and Casablanca's weaker face-down
// drops (candidates, quickDrop), with fewer samples each where those remain (think).
import * as E from './engine.js';
import { AGENT, CLASSIC_CITIES, DECK, STAKES, TURNS } from './data.js';
import { createRng } from '../../../shared/rng.js';

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// What a face-down card can be: shared predicates, so couldBe never allocates in the bots' hot path.
const ANYTHING = () => true;
const FACE_DOWN = (kind) => !!AGENT[kind].faceDown;
const ONLY = {};
const onlyKind = (kind) => ONLY[kind] || (ONLY[kind] = (k) => k === kind);
/** determinize fills the most constrained face-down cards first: a placed card, then a natural face-down agent, then anything. */
const rankOf = (ok) => (ok === ANYTHING ? 2 : ok === FACE_DOWN ? 1 : 0);

/**
 * What the face-down card `cv` in city `cityId` can be, as a predicate on agent kinds: only the twist's
 * kind when a `placed` twist put it there (wherever that is); anything in Vienna or Casablanca, or as an
 * Accomplice's partner; otherwise only an agent that drops face down by nature (Sleeper, Tripwire, Decoy).
 */
export function couldBe(cv, cityId, view) {
  if (cv.placed && view.twist?.kind) return onlyKind(view.twist.kind);
  if (cityId === 'vienna' || cityId === 'casablanca' || cv.partner) return ANYTHING;
  return FACE_DOWN;
}

/** The first card in `pile` that `ok` accepts (or else the first card), taken out of the pile. */
function takeFrom(pile, ok) {
  const i = pile.findIndex(ok);
  return pile.splice(i >= 0 ? i : 0, 1)[0];
}

/** The card view with this uid in a list, or null. */
const findCard = (list, uid) => list.find((cv) => cv.uid === uid) ?? null;

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
/**
 * Classic content: the original 12 agents and 11 cities, no twist. A temporary gate: determinize uses it
 * to keep 2b-i's turned-asset gap in Classic (a seat's own card in a rival's hand after Havana plus a
 * Getaway is never placed) only so the frozen 2b-i comparison in test/golden stays identical; Mixed play
 * gets the correct fill. The gate and the gap go the next time the goldens are re-recorded (Phase 3).
 */
const classicView = (view) => !view.twist && sameList(view.roster, DECK) && sameList(view.cityPool, CLASSIC_CITIES);

/**
 * A full engine state (state v2: tokens, pot, folds and the Microfilm included) consistent with
 * `view`, with every unseen card filled in at random. Each seat's cards come from deckList (the
 * match's roster); a face-down card is only what it can be (couldBe); the cards a `seen` twist has
 * shown this seat (`view.round.exposed`) keep their kinds. This seat's own cards it can't see (turned
 * assets a rival's Getaway sent to its hand) go into rivals' hands, except on Classic content, where
 * classicView keeps 2b-i's gap (they are never placed) only so the frozen 2b-i comparison in test/golden
 * stays identical, until the goldens are next re-recorded (Phase 3).
 */
export function determinize(view, rng) {
  const seat = view.seat;
  const n = E.seatCount(view);
  const rivals = E.rivalsOf(n, seat);
  const V = view.round;
  const cards = {};
  const pool = {};
  for (let s = 0; s < n; s++) pool[s] = E.deckList(view, s);
  const forget = (origin, id0) => {
    const i = pool[origin].indexOf(id0);
    if (i >= 0) pool[origin].splice(i, 1);
  };
  const put = (cv, kind = cv.kind, id0 = cv.id0) => {
    cards[cv.uid] = {
      uid: cv.uid, kind, id0, owner: cv.owner, origin: cv.origin, city: cv.city, turn: cv.turn,
      faceDown: cv.faceDown, hidden: cv.hidden, bonus: cv.bonus,
    };
  };
  // Cards in `gone` with no kind are a folded rival's face-down agents, withdrawn unseen.
  const known = [...V.cities.flatMap((c) => c.sides.flat()), ...V.gone.flat(), ...V.hand];
  for (const cv of known) if (cv.kind) forget(cv.origin, cv.id0);
  // My own deck: known contents, unknown order.
  for (const kind of V.myDeck) forget(seat, kind);
  // Cards known to sit in a rival's hand, ahead of its invented ones: { [rival]: [{ uid, kind, origin }] }.
  let ahead = null;
  // A `seen` twist's cards this view doesn't show (only the watcher's view has any): face down on the
  // board or withdrawn, they keep their kinds; otherwise they sit in their owner's hand (the watcher's
  // mark). Their kinds come out of the pools before the shuffles.
  let seen = null;
  if (V.exposed?.length) {
    seen = {};
    ahead = {};
    for (const e of V.exposed) {
      const cv = findCard(known, e.uid);
      if (cv?.kind) continue;
      seen[e.uid] = e.kind;
      if (cv) forget(cv.origin, e.kind);
      else {
        const owner = E.markOf(n, e.by, V.no);
        (ahead[owner] ??= []).push({ uid: e.uid, kind: e.kind, origin: owner });
        forget(owner, e.kind);
      }
    }
  }
  // Whatever of this seat's own cards is still unaccounted for went to a rival's hand (a turned asset
  // its Getaway sent home), or lies face down on a rival's side under that rival's origin: either way a
  // rival's hand holds one more card than its own unseen ones. The first rival with room takes it.
  // Classic content skips this and keeps 2b-i's gap (the card is never placed) only so the frozen 2b-i
  // comparison in test/golden stays identical; Mixed play gets the correct fill. This gate and the gap
  // go the next time the goldens are re-recorded (Phase 3).
  if (pool[seat].length && !classicView(view)) {
    ahead ??= {};
    pool[seat].forEach((kind, i) => {
      const r = rivals.find((x) => (ahead[x]?.length ?? 0) < V.handCounts[x]);
      if (r !== undefined) (ahead[r] ??= []).push({ uid: `?t${i}`, kind, origin: seat });
    });
  }

  // Each rival's unseen cards are shuffled on their own, and its face-down board cards come
  // out of that pool, then its face-down cards withdrawn by a fold (any kind).
  const unknown = {};
  for (const rival of rivals) {
    const secretOnBoard = V.cities.flatMap((c) => c.sides[rival].filter((cv) => !cv.kind));
    const pile = (unknown[rival] = shuffleInPlace(pool[rival].slice(), rng));
    // The most constrained cards first, so a scarce kind goes where nothing else can.
    const order = secretOnBoard.slice().sort((a, b) => rankOf(couldBe(a, V.cities[a.city].id, view)) - rankOf(couldBe(b, V.cities[b.city].id, view)));
    for (const cv of order) {
      const city = V.cities[cv.city];
      const kind = seen?.[cv.uid] ?? takeFrom(pile, couldBe(cv, city.id, view));
      put(cv, kind, kind);
      if (city.id === 'istanbul' && cv.turn === city.first) cards[cv.uid].bonus = 3;
    }
    for (const cv of V.gone[rival]) {
      if (cv.kind) continue;
      const kind = seen?.[cv.uid] ?? takeFrom(pile, ANYTHING);
      put(cv, kind, kind);
    }
  }
  for (const cv of known) if (cv.kind) put(cv);

  const fresh = (prefix, kinds, owner) =>
    kinds.map((kind, i) => {
      const uid = `${prefix}${i}`;
      cards[uid] = { uid, kind, id0: kind, owner, origin: owner, city: null, turn: 0, faceDown: false, hidden: false, bonus: 0 };
      return uid;
    });
  const hands = [];
  const decks = [];
  for (const rival of rivals) {
    const first = ahead?.[rival];
    if (first) {
      for (const { uid, kind, origin } of first) cards[uid] = { uid, kind, id0: kind, owner: rival, origin, city: null, turn: 0, faceDown: false, hidden: false, bonus: 0 };
      hands[rival] = [...first.map((c) => c.uid), ...fresh(`?h${rival}.`, unknown[rival].splice(0, V.handCounts[rival] - first.length), rival)];
    } else hands[rival] = fresh(`?h${rival}.`, unknown[rival].splice(0, V.handCounts[rival]), rival);
    decks[rival] = fresh(`?d${rival}.`, unknown[rival].splice(0, V.deckCounts[rival]), rival);
  }
  decks[seat] = fresh('?m', shuffleInPlace(V.myDeck.slice(), rng), seat);
  hands[seat] = V.hand.map((cv) => cv.uid);
  // A folded seat passes for the rest of the round, as the engine's withdraw left it.
  const plans = V.folded.map((out) => (out ? { pass: true } : null));
  if (V.plan) plans[seat] = V.plan;
  return {
    v: E.STATE_VERSION,
    seed: 'sim',
    rng: Math.floor(rng.next() * 2 ** 32),
    target: view.target,
    scores: view.scores.slice(),
    tokens: view.tokens.slice(),
    carry: 0,
    strips: view.strips.slice(),
    reel: view.reel,
    filmRule: view.filmRule,
    roundNo: view.roundNo,
    phase: 'plan',
    history: [],
    winner: null,
    winBy: null,
    round: {
      no: V.no,
      cities: V.cities.map((c) => ({ id: c.id, sides: c.sides.map((side) => side.map((cv) => cv.uid)), first: c.first })),
      film: V.film,
      cards,
      hands,
      decks,
      gone: V.gone.map((g) => g.map((cv) => cv.uid)),
      turn: V.turn,
      initiative: V.initiative,
      plans,
      stake: V.stake,
      pot: V.pot,
      escalated: V.escalated.slice(),
      // A call still waiting for answers is left out: the playout plays the round as if it settled with everyone on.
      pending: null,
      called: V.called ? { by: V.called.by, answers: V.called.answers.slice() } : null,
      folded: V.folded.slice(),
      taps: [],
      exposed: [],
      events: [],
      result: null,
    },
  };
}

/**
 * Does quickDrop consider legal drop `d`? Not outside `only` (a city index, or null); an Accomplice's
 * partner drop only with its strongest partner (`top`, or `second` for the hand's strongest card
 * itself); Casablanca's face-down drop only for an agent that drops face down by nature.
 */
function considered(R, d, only, top, second) {
  if (only !== null && d.city !== only) return false;
  if (d.partner !== undefined && d.partner !== (d.uid === top ? second : top)) return false;
  return d.down !== true || !!AGENT[R.cards[d.uid].kind].faceDown;
}

/** Is any of the `rivals`' agents in `city` face down (`down` true) or face up (false)? */
function rivalAgent(R, city, rivals, down) {
  for (const r of rivals) for (const u of city.sides[r]) if (R.cards[u].faceDown === down) return true;
  return false;
}

/** Does `seat` have a face-up agent of power 3 or more in a city other than `here` (and not Moscow, which a Courier can't move it out of)? */
function strongElsewhere(state, seat, here) {
  const R = state.round;
  for (let ci = 0; ci < R.cities.length; ci++) {
    if (ci === here || R.cities[ci].id === 'moscow') continue;
    for (const u of R.cities[ci].sides[seat]) if (!R.cards[u].faceDown && E.powerOf(state, u) >= 3) return true;
  }
  return false;
}

/**
 * Quick playout policy: strong cards where they swing a city, with plenty of randomness. It considers
 * every legal drop but an Accomplice's partner drops with anyone other than its strongest partner (base
 * power, ties first in hand) and Casablanca's face-down drops of agents that don't drop face down by
 * nature. With `only` (a city index) where some considered drop goes, it keeps to that city (a
 * wiretapped mark's locked city). One rng draw for the random branch, one to pick there or one per
 * considered drop.
 */
export function quickDrop(state, seat, rng, only = null) {
  const legal = E.legalDrops(state, seat);
  if (!legal.length) return { pass: true };
  const rivals = E.rivalSeats(E.seatCount(state), seat);
  const R = state.round;
  // Classic needs no filter: no Accomplice, no Casablanca, no wiretap.
  let top = null;
  let second = null;
  for (const u of R.hands[seat]) {
    if (!AGENT[R.cards[u].kind].partner) continue;
    let tp = -1;
    let sp = -1;
    for (const p of R.hands[seat]) {
      const pw = AGENT[R.cards[p].kind].power;
      if (pw > tp) {
        second = top;
        sp = tp;
        top = p;
        tp = pw;
      } else if (pw > sp) {
        second = p;
        sp = pw;
      }
    }
    break;
  }
  const cities = R.cities;
  let filter = top !== null || cities[0].id === 'casablanca' || cities[1].id === 'casablanca' || cities[2].id === 'casablanca';
  if (only !== null) {
    let any = false;
    for (const d of legal) if (considered(R, d, only, top, second)) any = true;
    if (any) filter = true;
    else only = null;
  }
  if (rng.next() < 0.25) {
    if (!filter) return legal[Math.floor(rng.next() * legal.length)];
    let count = 0;
    for (const d of legal) if (considered(R, d, only, top, second)) count++;
    let k = Math.floor(rng.next() * count);
    for (const d of legal) if (considered(R, d, only, top, second) && k-- === 0) return d;
  }
  // Each city's totals, worked out once, the first time a drop there needs them.
  let t0 = null;
  let t1 = null;
  let t2 = null;
  let best = null;
  let bestV = -Infinity;
  for (const d of legal) {
    if (filter && !considered(R, d, only, top, second)) continue;
    const kind = R.cards[d.uid].kind;
    const ci = d.city;
    const city = cities[ci];
    const cid = city.id;
    const pow = AGENT[kind].power;
    let totals = ci === 0 ? t0 : ci === 1 ? t1 : t2;
    if (totals === null) {
      totals = E.cityTotals(state, ci);
      if (ci === 0) t0 = totals;
      else if (ci === 1) t1 = totals;
      else t2 = totals;
    }
    const mine = totals[seat];
    let theirs = -Infinity;
    for (const r of rivals) if (totals[r] > theirs) theirs = totals[r];
    // Reykjavik counts agents, not power: any agent is worth 2 there.
    let v = cid === 'lisbon' ? 3 - pow : cid === 'reykjavik' ? 2 : pow;
    const gap = theirs - mine;
    if (gap > 0 && gap < pow + 2) v += 2; // this drop could swing the city
    if (gap < -7) v -= 3; // already safe here
    const ours = city.sides[seat].length;
    switch (kind) {
      case 'assassin':
        for (const r of rivals)
          if (city.sides[r].length) {
            v += 3;
            break;
          }
        break;
      case 'veteran':
        if (!ours) v += 3;
        break;
      // Phase 2b-ii's agents.
      case 'turncoat':
        if (rivalAgent(R, city, rivals, false)) v += 3;
        break;
      case 'interrogator':
        if (rivalAgent(R, city, rivals, true)) v += 2;
        break;
      case 'courier':
        if (E.capacityOf(cid) - ours >= 2 && strongElsewhere(state, seat, ci)) v += 2;
        break;
      case 'bodyguard':
        if (ours) v += 2;
        break;
      case 'decoy':
        if (ours) v += 1;
        break;
      case 'blackmailer':
        if (!R.escalated.includes(true)) v += 1;
        break;
      case 'wiretap':
        if (R.turn < TURNS) v += 1;
        break;
    }
    if (ci === R.film) v += 1; // the Microfilm's city
    // Phase 2b-ii's cities.
    if (cid === 'reykjavik') {
      for (const r of rivals)
        if (city.sides[r].length > ours) {
          v += 2;
          break;
        }
    } else if (cid === 'tokyo' && R.turn >= 5) v += 1;
    // An Accomplice's partner adds what an agent of its own is worth here: 3 − power in Lisbon, 2 in
    // Reykjavik (agents count there, not power), its base power anywhere else.
    if (d.partner !== undefined) {
      const pp = AGENT[R.cards[d.partner].kind].power;
      v += cid === 'lisbon' ? 3 - pp : cid === 'reykjavik' ? 2 : pp;
    }
    v += rng.next() * 3;
    if (v > bestV) {
      bestV = v;
      best = d;
    }
  }
  return best;
}

/**
 * Plays the rest of the round from `state` (mutated) and scores it for `seat`: +1 if `seat` won,
 * 0 for a dead heat, −1 if anyone else won. filmScore reads the same finished state for the film.
 * `bind` (constraints, or null): each wiretapped mark's first quick drop goes to the city it locked.
 */
function playout(state, seat, firstDrop, rng, bind = null) {
  const n = E.seatCount(state);
  E.lock(state, seat, firstDrop);
  let first = bind !== null;
  while (state.phase === 'plan') {
    for (let s = 0; s < n; s++) if (!state.round.plans[s]) E.lock(state, s, quickDrop(state, s, rng, first && bind[s] !== undefined ? bind[s] : null));
    first = false;
    if (!E.resolveTurn(state)) break;
  }
  const res = state.round.result;
  if (!res || res.winner === null) return 0;
  return res.winner === seat ? 1 : -1;
}

/** The Microfilm after a playout: +1 if `seat` took the round's strip, −1 if a rival did, 0 if nobody did. */
function filmScore(state, seat) {
  const strip = state.round.result?.strip ?? null;
  return strip === null ? 0 : strip === seat ? 1 : -1;
}

/** The city each mark this seat wiretaps has locked this turn: { [seat]: city index }, from `view.round.tapped`. */
export function constraints(view) {
  const out = {};
  for (const e of view.round.tapped ?? []) if (e.city !== null) out[e.seat] = e.city;
  return out;
}

/** constraints(view), or null when there are none (no wiretap, or no mark locked yet). */
function bindOf(view) {
  const tapped = view.round.tapped;
  if (!tapped?.length) return null;
  for (const e of tapped) if (e.city !== null) return constraints(view);
  return null;
}

/** Partner drops think() weighs per Accomplice, city and face (think-time bar, fallback 1: 2 → 1). */
const PARTNERS = 1;
/** Casablanca's face-down drops think() weighs: an agent that drops face down by nature, or one this strong (fallback 1). */
const DOWN_POWER = 3;

/**
 * The drops think() weighs: every legal drop, except that of an Accomplice's partner drops it keeps,
 * per Accomplice, city and face (`down`), only the PARTNERS with the strongest partners (base power,
 * ties first in hand), and of Casablanca's face-down drops only those of agents that drop face down by
 * nature or have a power of DOWN_POWER or more. `legal` itself when it has neither kind of drop.
 */
export function candidates(view) {
  const legal = view.round.legal;
  let trim = false;
  for (const d of legal)
    if (d.partner !== undefined || d.down === true) {
      trim = true;
      break;
    }
  if (!trim) return legal;
  const kind = {};
  for (const cv of view.round.hand) kind[cv.uid] = cv.kind;
  const downOk = (d) => d.down !== true || !!AGENT[kind[d.uid]].faceDown || AGENT[kind[d.uid]].power >= DOWN_POWER;
  // Legal lists each group's partners in hand order, so a stable sort keeps ties first in hand.
  const groups = new Map();
  for (const d of legal) {
    if (d.partner === undefined || !downOk(d)) continue;
    const key = `${d.uid}|${d.city}|${d.down ? 1 : 0}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  const keep = new Set();
  for (const group of groups.values()) for (const d of group.sort((a, b) => AGENT[kind[b.partner]].power - AGENT[kind[a.partner]].power).slice(0, PARTNERS)) keep.add(d);
  return legal.filter((d) => (d.partner === undefined ? downOk(d) : keep.has(d)));
}

/** What the film is worth against the round when choosing a drop: decisive when any seat is one strip from the reel. */
export const filmWeightFor = (view) => (view.reel > 0 && view.strips.some((x) => x >= view.reel - 1) ? STAKES.filmDecisive : STAKES.filmWeight);

/**
 * Mean round and film scores over `samples` fresh playouts of `drop` (null: the seat's locked
 * plan, or a quick drop, or a pass).
 */
function rescore(view, samples, rng, drop, bind = bindOf(view)) {
  let round = 0;
  let film = 0;
  for (let k = 0; k < samples; k++) {
    const s = determinize(view, rng);
    const plan = drop || s.round.plans[view.seat] || (E.legalDrops(s, view.seat).length ? quickDrop(s, view.seat, rng) : { pass: true });
    s.round.plans[view.seat] = null;
    round += playout(s, view.seat, plan, rng, bind);
    film += filmScore(s, view.seat);
  }
  return { value: round / samples, film: film / samples };
}

/**
 * Evaluate every candidate drop (candidates) for the seat whose view this is. Returns { drop, value,
 * film, ranked }: value ≈ P(win) − P(lose) for the round and film ≈ P(this seat takes the strip) −
 * P(a rival does), both from a fresh re-score of the chosen drop. Drops are ranked by round + w × film
 * (w from filmWeightFor) plus the rival's noise; stake calls use `value`, the round alone. `drop` keeps
 * the top drop's `partner` and `down` when it has them.
 */
export function think(view, { samples = 20, noise = 0, rng = createRng(Date.now()) } = {}) {
  const legal = candidates(view);
  const bind = bindOf(view);
  if (!legal.length) return { drop: { pass: true }, ...rescore(view, samples, rng, null, bind), ranked: [] };
  // Think-time bar (fallback 2): with partner or face-down candidates, every candidate gets the share of
  // `samples` its plain drops (no partner, no `down: true`) make up, never more than `samples` and never
  // fewer than 6, so the position costs about what its plain drops would. Classic positions keep `samples`.
  let plain = 0;
  for (const d of legal) if (d.partner === undefined && d.down !== true) plain++;
  const each = plain === legal.length ? samples : Math.min(samples, Math.max(6, Math.round((samples * plain) / legal.length)));
  const totals = legal.map(() => 0);
  const films = legal.map(() => 0);
  for (let k = 0; k < each; k++) {
    const base = determinize(view, rng);
    const json = JSON.stringify(base);
    for (let i = 0; i < legal.length; i++) {
      const s = JSON.parse(json);
      s.round.plans[view.seat] = null;
      totals[i] += playout(s, view.seat, legal[i], rng, bind);
      films[i] += filmScore(s, view.seat);
    }
  }
  const w = filmWeightFor(view);
  const ranked = legal
    .map((d, i) => {
      const value = totals[i] / each;
      const film = films[i] / each;
      return { ...d, value, film, score: value + w * film + (rng.next() - 0.5) * 2 * noise };
    })
    .sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const drop = { uid: top.uid, city: top.city };
  if (top.partner !== undefined) drop.partner = top.partner;
  if (top.down !== undefined) drop.down = top.down;
  // The best of many noisy estimates is optimistic, so score the chosen drop again with fresh
  // playouts before using it for fold/escalate calls.
  return { drop, ...rescore(view, samples, rng, drop, bind), ranked };
}

/** Value of the round (alone, no film) as it stands for a seat that has already locked (or must pass). */
export function estimateLocked(view, samples = 20, rng = createRng(Date.now())) {
  return rescore(view, samples, rng, null).value;
}

/**
 * Stake decisions for a rival personality at any table size, given value ≈ P(win) − P(lose) for
 * the round: 'escalate', 'accept' or 'fold' (answering a call this seat owes), 'fold', or null.
 * Strictly, folding is right whenever the round is worth less than −stake; real players (and
 * fun rivals) play on much more often, so the thresholds lean towards seeing the final flip.
 * A seat with no tokens never escalates, a bluff never spends the last token nor one the pace is
 * keeping back, and only a seat that still owes an answer answers.
 */
export function stakeCall(view, value, rival, rng) {
  const V = view.round;
  const seat = view.seat;
  if (!Number.isInteger(seat) || seat < 0 || seat >= view.scores.length || V.folded[seat]) return null;
  const v = value + (rng.next() - 0.5) * 2 * (rival.noise ?? 0);
  const nerve = rival.nerve ?? 0;
  if (V.pending) return V.pending.from.includes(seat) && V.pending.mine === null ? (v > STAKES.answer - nerve ? 'accept' : 'fold') : null;
  // Folding before the final flip saves half, but rivals who always bail rob the player of the
  // reveal, so they only sometimes cut their losses, and only late.
  if (V.turn >= 5 && v < STAKES.lateFold - nerve && rng.next() < STAKES.lateFoldChance) return 'fold';
  const tokens = view.tokens[seat];
  if (view.phase !== 'plan' || V.escalated.some(Boolean) || tokens < 1) return null;
  // Spend a token on a strong hand, a stronger one when tokens are short of one every other round left.
  const roundsLeft = Math.max(1, Math.ceil((view.target - Math.max(...view.scores)) / STAKES.roundPoints));
  const short = Math.max(0, Math.ceil(roundsLeft / 2) - tokens);
  if (V.turn >= 2 && v > STAKES.escalate - nerve + short * STAKES.scarce) return 'escalate';
  // Bluffs keep to the same pace: a rival that bluffed while holding its tokens back for value would
  // make every early escalation a bluff, a tell anyone could learn.
  if (short === 0 && V.turn >= STAKES.bluffTurn && v < 0 && tokens > 1 && rng.next() < (rival.bluff ?? 0) / 3) return 'escalate';
  return null;
}
