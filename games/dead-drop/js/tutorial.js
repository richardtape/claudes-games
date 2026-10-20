// The briefing as data: one scripted round against Agent Wren (set decks, six lessons with
// gates), the table that deals it, and a scripted rival. Pure: no DOM. The script was walked
// through the engine: if a promise in a lesson stops holding, fix the script (deck order or
// Wren's moves), never the lesson.
import { createTable } from './session.js';
import { CLASSIC_SETUP } from './roster.js';
import { START_HAND } from './data.js';
import { legalDrops } from './engine.js';

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.values(o).forEach(deepFreeze);
  }
  return o;
};

export const TUTORIAL = deepFreeze({
  seed: 'briefing',
  cities: ['istanbul', 'monaco', 'berlin'],
  decks: [
    ['heavy', 'assassin', 'sleeper', 'mole', 'jammer', 'veteran', 'handler', 'lookout', 'getaway', 'double', 'tripwire', 'impostor'],
    ['veteran', 'handler', 'lookout', 'jammer', 'heavy', 'mole', 'sleeper', 'double', 'getaway', 'assassin', 'tripwire', 'impostor'],
  ],
  rival: [['veteran', 1], ['handler', 0], ['lookout', 2], ['jammer', 0], ['heavy', 1], ['mole', 2]],
  turns: [
    {
      title: 'The drop',
      text: 'Each turn you drop one agent into a city, in secret, and so does Wren. The Heavy is all muscle: 6 power, no tricks. Send it to Istanbul, where the first to arrive gets +3.',
      suggest: ['heavy', 0],
      gate: { card: 'heavy', city: 0 },
      after: 'Both drops flipped together. Wren’s Veteran stands alone in Monaco: 3, and +3 while it’s alone.',
    },
    {
      title: 'The flip trick',
      text: 'Tricks fire as a card flips. The Assassin takes out the strongest face-up rival agent in its city. Wren’s Veteran is in Monaco.',
      suggest: ['assassin', 1],
      gate: { card: 'assassin', city: 1 },
      after: 'The Veteran is gone. Flip tricks fire in First flip order, which passes across each turn.',
    },
    {
      title: 'The face-down card',
      text: 'The Sleeper drops face down: Wren sees a card, not its power, until the round ends. Put it in Berlin, where there’s room for two a side.',
      suggest: ['sleeper', 2],
      gate: { card: 'sleeper', city: 2 },
      after: 'Wren’s Lookout drew a card as it flipped. You lead in Istanbul and Berlin.',
    },
    {
      title: 'Escalate',
      text: 'You lead in two cities. Escalate: spend one of your three tokens to double the stake. Wren must fold or play on. Then drop the Mole in Berlin: rival agents there get −1.',
      suggest: ['mole', 2],
      gate: { escalate: true, card: 'mole', city: 2 },
      after: 'Wren played on: the round is worth 2, and 4 at the final flip.',
    },
    {
      title: 'Read the board',
      text: 'Wren’s Jammer in Istanbul turns off your tricks there, so a Handler would be wasted. Monaco is thin: your Assassin stands alone. Shore it up with the Jammer.',
      suggest: ['jammer', 1],
      gate: { card: 'jammer', city: 1 },
      after: 'Wren’s Heavy lands in Monaco: 6 against your 4. One more agent there would take it back.',
    },
    {
      title: 'The final flip',
      text: 'The last drop. The stake doubles on this flip, and every face-down card turns over. Monaco has room for one more.',
      suggest: ['veteran', 1],
      gate: null,
      after: null,
    },
  ],
  end: {
    title: 'That’s a round.',
    won: 'You took it.',
    lost: 'Wren took this one.',
    text: 'A match is first to 10 points, or two strips of the Microfilm. Agent Wren is waiting on the ladder, and the computer rivals get harder from there.',
  },
});

/** Reorder `seat`'s hand and deck to `kinds` (one card of each, by id0): the first START_HAND are the hand, the rest the deck. */
export function arrange(state, seat, kinds) {
  const R = state.round;
  const pool = [...R.hands[seat], ...R.decks[seat]];
  const picked = kinds.map((kind) => {
    const uid = pool.find((u) => R.cards[u].id0 === kind);
    if (!uid) throw new Error(`arrange: no ${kind} for seat ${seat}`);
    pool.splice(pool.indexOf(uid), 1);
    return uid;
  });
  R.hands[seat] = picked.slice(0, START_HAND);
  R.decks[seat] = [...picked.slice(START_HAND), ...pool];
}

/** The briefing's table: a Classic two-seat match with both decks arranged, no Microfilm, no timer. */
export function tutorialTable({ names }) {
  const table = createTable({ seed: TUTORIAL.seed, cities: TUTORIAL.cities, names, setup: CLASSIC_SETUP, timer: 0 });
  TUTORIAL.decks.forEach((kinds, seat) => arrange(table.state, seat, kinds));
  table.state.reel = 0;
  table.state.round.film = null;
  return table;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A scripted rival: locks `moves[turn - 1]` ([kind, city]) each turn (its first legal drop if the kind
 * isn't in hand or the drop is refused), answers a call with play on, presses Next, never escalates or
 * folds. Waits while `hold()` (120 ms polls). `stop()` ends it.
 */
export function attachScript(table, seat, moves, { hold = () => false } = {}) {
  let busy = false;
  let stopped = false;
  async function tick() {
    if (busy || stopped) return;
    busy = true;
    const seqAtStart = table.seq;
    try {
      while (!stopped && hold()) await sleep(120);
      if (stopped) return;
      const S = table.state;
      if (S.phase === 'round-over') {
        if (!table.ready[seat]) table.act(seat, { a: 'next' });
      } else if (S.phase === 'plan') {
        const R = S.round;
        if (R.folded?.[seat]) return;
        if (R.pending) {
          if (R.pending.from.includes(seat) && R.pending.calls[seat] === null) table.act(seat, { a: 'respond', accept: true });
        } else if (!R.plans[seat]) {
          const [kind, city] = moves[R.turn - 1] ?? [];
          const uid = R.hands[seat].find((u) => R.cards[u].kind === kind);
          if (!(uid && table.act(seat, { a: 'lock', uid, city }))) {
            const first = legal(table, seat);
            if (first) table.act(seat, { a: 'lock', ...first });
          }
        }
      }
    } finally {
      busy = false;
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

function legal(table, seat) {
  return legalDrops(table.state, seat)[0] ?? null;
}

/** The coach's line for the turn on screen: { title, text, suggest: { uid, city } | null, gate }, or null outside planning. */
export function coachFor(view) {
  if (view.phase !== 'plan' || !view.round) return null;
  const T = TUTORIAL.turns[view.round.turn - 1];
  if (!T) return null;
  const [kind, city] = T.suggest;
  const uid = view.round.hand.find((c) => c.kind === kind)?.uid;
  return { title: T.title, text: T.text, suggest: uid ? { uid, city } : null, gate: T.gate };
}

/**
 * May this pick be made? A gate's `card` and `city` allow only that card and city (each checked when given); a gate
 * that also escalates (turn 4) holds the drop the same way, and its Lock in waits for the escalation (canLock).
 */
export function gateAllows(view, gate, { uid = null, city = null } = {}) {
  if (!gate) return true;
  if (uid !== null && gate.card !== undefined) {
    const card = view.round.hand.find((c) => c.uid === uid);
    if (!card || card.kind !== gate.card) return false;
  }
  if (city !== null && gate.city !== undefined && city !== gate.city) return false;
  return true;
}

/** Locking waits for the escalation on an escalate gate. */
export function canLock(view, gate) {
  return !(gate?.escalate && !view.round.escalated[view.seat]);
}

export const afterFor = (turn) => TUTORIAL.turns[turn - 1]?.after ?? null;
