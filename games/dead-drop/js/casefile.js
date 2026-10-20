// The case file's data (pure, no DOM): a recap of each round, the highlights a seat takes from them, and
// everything the end screen and its poster draw. Reads engine states and views, never main.js.
import { AGENT } from './data.js';
import { powerOf } from './engine.js';
import { operation } from './story.js';

/**
 * What happened in the round that has just ended (`state.round.result` is set). `events` is the round's
 * turn events in order (the record's, see replay.js) or null when the round had no record, which leaves `outs` null.
 */
export function recapOf(state, events = null) {
  const R = state.round;
  const res = R.result;
  // The killer's seat is the one that dropped it (its drop event): a Glienicke crossing or a Turncoat may have changed
  // its owner by the round's end. Without a drop event, its owner now. A card sent home (the Getaway) is re-keyed, so
  // its uid is gone from the round's cards; the seat it was minted for is the uid's first letter (engine mintUid),
  // which is its owner at that moment.
  const ownerOf = (t, before) => {
    if (!t) return null;
    const dropped = before.findLast((x) => x.t === 'drop' && x.uid === t.uid)?.seat;
    if (Number.isInteger(dropped)) return dropped;
    const owner = R.cards[t.uid]?.owner;
    if (Number.isInteger(owner)) return owner;
    const seat = 'abcd'.indexOf(String(t.uid)[0]);
    return seat >= 0 ? seat : null;
  };
  const outs = events
    ? events.flatMap((e, i) => {
        if (e.t !== 'out') return [];
        const before = events.slice(0, i);
        const last = (pred) => before.findLast(pred);
        let by = null;
        if (e.cause === 'assassin') {
          const t = last((x) => x.t === 'trick' && x.kind === 'assassin' && x.target === e.uid) ?? last((x) => x.t === 'trick' && x.kind === 'assassin');
          const owner = ownerOf(t, before);
          if (owner !== null) by = { kind: 'assassin', owner };
        } else if (e.cause === 'tripwire') {
          const t = last((x) => x.t === 'tripwire' && x.victim === e.uid) ?? last((x) => x.t === 'tripwire');
          const owner = ownerOf(t, before);
          if (owner !== null) by = { kind: 'tripwire', owner };
        }
        return [{ victim: e.kind, owner: e.owner, power: AGENT[e.kind].power, cause: e.cause, city: R.cities[e.city].id, by }];
      })
    : null;
  return {
    no: R.no,
    winner: res.winner,
    points: res.points,
    folded: res.folded,
    stake: res.stake,
    escalated: R.escalated.slice(),
    cityWinners: res.cityWinners ? res.cityWinners.slice() : [],
    strip: res.strip ?? null,
    outs,
    board: R.cities.map((c) => c.sides.map((side) => side.map((uid) => {
      const c = R.cards[uid];
      // A card still face down at the end (a fold ends the round before the flip) stays unnamed: the folder never saw it.
      return c.faceDown ? { kind: null, owner: c.owner, power: null } : { kind: c.kind, owner: c.owner, power: powerOf(state, uid) };
    }))),
  };
}

/** What `seat` takes from the match: its best takedown, its escalations, its most useful agent, its biggest round. */
export function highlights(recap, seat) {
  const rounds = Array.isArray(recap) ? recap : [];
  let takedown = null;
  const called = rounds.filter((r) => r.escalated?.[seat]);
  const held = new Map();
  let biggest = null;
  for (const r of rounds) {
    for (const o of r.outs ?? []) {
      if (o.by?.owner === seat && o.owner !== seat && (!takedown || o.power >= takedown.power)) takedown = { round: r.no, by: o.by.kind, victim: o.victim, power: o.power, city: o.city };
    }
    (r.cityWinners ?? []).forEach((w, ci) => {
      if (w !== seat) return;
      for (const c of r.board?.[ci]?.[seat] ?? []) {
        if (c.kind === null) continue;
        const h = held.get(c.kind) ?? { kind: c.kind, held: 0, power: 0 };
        h.held++;
        h.power += c.power;
        held.set(c.kind, h);
      }
    });
    if (r.winner === seat && (!biggest || r.points > biggest.points)) biggest = { round: r.no, points: r.points };
  }
  const mvp = [...held.values()].sort((a, b) => b.held - a.held || b.power - a.power)[0] ?? null;
  return {
    takedown,
    escalations: { called: called.length, won: called.filter((r) => r.winner === seat).length },
    mvp: mvp && { kind: mvp.kind, held: mvp.held, power: mvp.power },
    biggest,
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Everything the case file draws, from a match-over view. `focus` is the seat at the bottom (or the winner on a neutral screen). */
export function posterData(view, focus, { label = (s) => view.names[s], neutral = false } = {}) {
  const n = view.scores.length;
  const won = view.winner === focus;
  const d = new Date();
  const rounds = view.history.map((h, i) => ({
    no: i + 1,
    operation: operation(view.matchId, i).name,
    cities: h.cities.slice(),
    winner: h.winner,
    points: h.points,
    how: h.folded !== null ? `${label(h.folded)} folded` : h.winner === null ? 'dead heat' : `${h.cityWinners.filter((w) => w === h.winner).length} of 3 cities`,
    strip: h.strip ?? null,
    film: h.film ?? null,
    missed: (view.missed ?? []).find((m) => m.no === h.no) ?? null,
  }));
  return {
    title: neutral && view.winner !== null ? `${label(view.winner)} wins` : won ? 'Mission accomplished' : 'Burned',
    names: view.names.slice(),
    order: Array.from({ length: n }, (_, i) => (focus + i) % n),
    scores: view.scores.slice(),
    strips: view.strips.slice(),
    reel: view.reel,
    winner: view.winner,
    won,
    by: view.winBy,
    rounds,
    highlights: highlights(view.recap, focus),
    focus,
    date: `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
  };
}
