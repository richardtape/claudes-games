// The single-change replay (js/replay.js): a round's record replays exactly as played, and "the one that
// got away" finds the one drop that would have won a lost round. Every case is dealt with setHand, so it is
// certain; each test checks the round as played first, so a failing setup is a setup error.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { RULES } from '../js/data.js';
import { canStart, newRecord, noteAct, recordTurn, noteEvents, replayRound, gotAway, gotAwayText } from '../js/replay.js';
import { give, mixed, setHand } from './helpers.mjs';

/** Play turns on `s` as the table would. Each turn: { acts: [[seat, a], …], drops: [[kind, city] | null per seat] }. */
function played(s, ...turns) {
  assert.ok(canStart(s));
  const rec = newRecord(s, { match: 'test0001', round: s.roundNo });
  for (const { acts = [], drops } of turns) {
    for (const [seat, a] of acts) {
      const ok = a.a === 'escalate' ? E.escalate(s, seat) : a.a === 'respond' ? E.respond(s, seat, a.accept) : E.fold(s, seat);
      assert.ok(ok, `seat ${seat}: ${a.a}`);
      noteAct(rec, seat, a);
    }
    if (s.phase !== 'plan') break;
    drops.forEach((mv, seat) => {
      if (s.round.plans[seat]) return;
      if (!mv) return void assert.ok(E.lock(s, seat, { pass: true }));
      assert.ok(E.lock(s, seat, { uid: give(s, seat, mv[0]), city: mv[1] }), `seat ${seat}: ${mv[0]} to ${mv[1]}`);
    });
    assert.ok(E.ready(s));
    recordTurn(rec, s);
    noteEvents(rec, E.resolveTurn(s));
  }
  return rec;
}

/** The record replayed as played ends where the round did. */
function asPlayed(rec, s) {
  const again = replayRound(rec);
  assert.ok(again, 'the record replays');
  assert.deepEqual(again.round.result, s.round.result);
  assert.deepEqual(again.scores, s.scores);
  return again;
}

/** The uid of seat's own card of this kind in the record's starting deal. */
const startUid = (rec, seat, kind) => Object.values(rec.start.round.cards).find((c) => c.origin === seat && c.id0 === kind).uid;

const CITIES = ['moscow', 'monaco', 'berlin'];

/**
 * The late swing: seat 0 holds its Heavy for the last turn and drops it in Moscow, which it holds anyway, and
 * loses Berlin 6 to 7; the Heavy in Berlin would have held it and the round.
 */
function lateSwing(s = E.newMatch({ seed: 3, cities: CITIES })) {
  setHand(s, 0, ['sleeper', 'veteran', 'handler', 'mole', 'jammer', 'heavy']);
  setHand(s, 1, ['heavy', 'sleeper', 'handler', 'veteran', 'jammer', 'mole']);
  return s;
}
const LATE_SWING = [
  [['sleeper', 0], ['heavy', 1]],
  [['veteran', 2], ['sleeper', 2]],
  [['handler', 1], ['handler', 2]],
  [['mole', 1], ['veteran', 0]],
  [['jammer', 0], ['jammer', 1]],
  [['heavy', 0], ['mole', 1]],
];

test('a clean round can start a record, and its start is a deep copy without history', () => {
  const s = E.newMatch({ seed: 3, cities: CITIES });
  assert.ok(canStart(s));
  const rec = newRecord(s, { match: 'test0001', round: 0 });
  assert.deepEqual(Object.keys(rec), ['match', 'round', 'start', 'turns', 'open', 'events']);
  assert.deepEqual(rec.start.history, []);
  assert.deepEqual(rec.start.round, s.round);
  assert.notEqual(rec.start.round, s.round);
  // Not clean: a seat locked in, an escalation, a later turn, the round over.
  const locked = E.newMatch({ seed: 3, cities: CITIES });
  E.lock(locked, 0, E.legalDrops(locked, 0)[0]);
  assert.equal(canStart(locked), false);
  const raised = E.newMatch({ seed: 3, cities: CITIES });
  E.escalate(raised, 0);
  assert.equal(canStart(raised), false, 'pending and escalated');
  E.respond(raised, 1, true);
  assert.equal(canStart(raised), false, 'escalated');
  const later = E.newMatch({ seed: 3, cities: CITIES });
  E.lock(later, 0, E.legalDrops(later, 0)[0]);
  E.lock(later, 1, E.legalDrops(later, 1)[0]);
  E.resolveTurn(later);
  assert.equal(canStart(later), false);
  const over = E.newMatch({ seed: 3, cities: CITIES });
  E.fold(over, 0);
  assert.equal(canStart(over), false);
});

test('noteAct keeps escalations, answers (as booleans) and folds only, in order', () => {
  const rec = newRecord(E.newMatch({ seed: 3, cities: CITIES }), { match: 'test0001', round: 0 });
  noteAct(rec, 1, { a: 'escalate' });
  noteAct(rec, 0, { a: 'respond', accept: 1 });
  noteAct(rec, 0, { a: 'lock', uid: 'a0.0000', city: 0 });
  noteAct(rec, 0, { a: 'next' });
  noteAct(rec, 1, { a: 'fold' });
  assert.deepEqual(rec.open, [{ seat: 1, a: 'escalate' }, { seat: 0, a: 'respond', accept: true }, { seat: 1, a: 'fold' }]);
});

test('as played: a six-turn Classic round with an escalation answered play on replays to the same result and scores', () => {
  const s = lateSwing();
  const rec = played(s, ...LATE_SWING.map((drops, i) => ({ acts: i === 2 ? [[1, { a: 'escalate' }], [0, { a: 'respond', accept: true }]] : [], drops })));
  assert.equal(s.phase, 'round-over');
  assert.equal(s.round.stake, 2);
  assert.equal(s.round.result.winner, 1);
  assert.deepEqual(rec.turns.map((T) => T.turn), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(rec.turns[2].acts, [{ seat: 1, a: 'escalate' }, { seat: 0, a: 'respond', accept: true }]);
  assert.deepEqual(rec.open, []);
  assert.ok(rec.events.some((e) => e.t === 'round'), 'the events of every turn, the flip included');
  assert.equal(rec.events.filter((e) => e.t === 'drop').length, 12);
  asPlayed(rec, s);
  assert.deepEqual(rec.start.round.cards, lateSwing().round.cards, 'the record starts from the deal');
});

test('the Blackmailer’s call: answered at the top of the next turn, it replays; an alternative that keeps it shut is skipped', () => {
  assert.equal(RULES.blackmailer, 'answer');
  const s = mixed(CITIES, { seed: 7 });
  setHand(s, 0, ['heavy', 'sleeper', 'veteran', 'handler', 'mole', 'jammer']);
  setHand(s, 1, ['heavy', 'blackmailer', 'veteran', 'handler', 'mole', 'jammer']);
  const rec = played(
    s,
    { drops: [['heavy', 0], ['heavy', 1]] },
    { drops: [['sleeper', 2], ['blackmailer', 1]] },
    { acts: [[0, { a: 'respond', accept: true }]], drops: [['veteran', 1], ['veteran', 2]] },
    { drops: [['handler', 0], ['handler', 1]] },
    { drops: [['mole', 2], ['mole', 0]] },
    { drops: [['jammer', 1], ['jammer', 0]] },
  );
  assert.deepEqual(s.round.called, { by: 1, answers: ['on', null] });
  assert.equal(s.round.stake, 2);
  assert.deepEqual(rec.turns[2].acts, [{ seat: 0, a: 'respond', accept: true }], 'the answer is turn 3’s act');
  asPlayed(rec, s);
  // Seat 0's Jammer in Monaco on turn 1 jams the Blackmailer there: no call opens, so turn 3's answer is refused.
  const jammer = startUid(rec, 0, 'jammer');
  assert.equal(replayRound(rec, { turn: 1, seat: 0, plan: { uid: jammer, city: 1 } }), null);
  // The control: the same Jammer in Moscow leaves the Blackmailer free, and the round replays to its end.
  const free = replayRound(rec, { turn: 1, seat: 0, plan: { uid: jammer, city: 0 } });
  assert.ok(free && free.phase === 'round-over' && free.round.called?.by === 1);
  for (const seat of [0, 1]) assert.doesNotThrow(() => gotAway(rec, seat));
});

test('a late swing: the held-back Heavy in Berlin instead of Moscow would have won; the winner has no line', () => {
  const s = lateSwing();
  const rec = played(s, ...LATE_SWING.map((drops) => ({ drops })));
  assert.equal(s.round.result.winner, 1);
  assert.deepEqual(s.round.result.cityWinners, [0, 1, 1]);
  assert.deepEqual(s.round.result.totals[2], [6, 7], 'Berlin lost by one');
  asPlayed(rec, s);
  const g = gotAway(rec, 0);
  const heavy = startUid(rec, 0, 'heavy');
  assert.deepEqual(g, { turn: 6, was: { uid: heavy, city: 0, kind: 'heavy' }, instead: { uid: heavy, city: 2, kind: 'heavy' }, held: 2 });
  assert.equal(gotAwayText(g, CITIES), 'Turn 6: Heavy to Berlin instead of Moscow would have won the round.');
  assert.equal(gotAway(rec, 1), null);
  // The record is left as it was: the same line again.
  assert.deepEqual(gotAway(rec, 0), g);
  asPlayed(rec, s);
});

test('a line needs the round as played to replay to its result (when given), else none', () => {
  const s = lateSwing();
  const rec = played(s, ...LATE_SWING.map((drops) => ({ drops })));
  assert.ok(gotAway(rec, 0, { result: s.round.result }));
  assert.equal(gotAway(rec, 0, { result: { ...s.round.result, points: 9 } }), null);
});

test('no line: a round ended by a fold, a dead heat, a three-seat round with a fold in answer', () => {
  // A fold on turn 3.
  const f = lateSwing();
  const rf = played(f, ...LATE_SWING.slice(0, 2).map((drops) => ({ drops })), { acts: [[1, { a: 'fold' }]], drops: LATE_SWING[2] });
  assert.equal(f.round.result.folded, 1);
  for (const seat of [0, 1]) assert.equal(gotAway(rf, seat), null);

  // A dead heat: mirror hands, mirror drops.
  const d = E.newMatch({ seed: 3, cities: CITIES });
  const hand = ['heavy', 'sleeper', 'veteran', 'handler', 'mole', 'jammer'];
  setHand(d, 0, hand);
  setHand(d, 1, hand);
  const mirror = [['heavy', 0], ['sleeper', 1], ['veteran', 2], ['handler', 0], ['mole', 1], ['jammer', 2]];
  const rd = played(d, ...mirror.map((mv) => ({ drops: [mv, mv] })));
  assert.equal(d.round.result.winner, null);
  asPlayed(rd, d);
  for (const seat of [0, 1]) assert.equal(gotAway(rd, seat), null);

  // Three seats: seat 2 folds in answer to seat 1's escalation, and seat 0 loses at the flip.
  const deal = () => {
    const s = E.newMatch({ seed: 11, seats: 3, cities: CITIES });
    setHand(s, 0, ['lookout', 'mole', 'handler', 'jammer', 'sleeper', 'heavy']);
    setHand(s, 1, ['heavy', 'sleeper', 'veteran', 'handler', 'jammer', 'mole']);
    setHand(s, 2, ['handler', 'veteran', 'mole', 'jammer', 'heavy', 'sleeper']);
    return s;
  };
  const by = [
    [['lookout', 0], ['mole', 2], ['handler', 0], ['jammer', 1], ['sleeper', 2], ['heavy', 1]],
    [['heavy', 1], ['sleeper', 1], ['veteran', 2], ['handler', 1], ['jammer', 0], ['mole', 0]],
    [['handler', 2], ['veteran', 1], ['mole', 1], ['jammer', 2], ['heavy', 0], ['sleeper', 0]],
  ];
  const turns = (acts) => by[0].map((_, i) => ({ acts: acts[i] ?? [], drops: by.map((moves) => moves[i]) }));
  const a = deal();
  const ra = played(a, ...turns({ 1: [[1, { a: 'escalate' }], [2, { a: 'respond', accept: false }], [0, { a: 'respond', accept: true }]] }));
  assert.deepEqual(a.round.folded, [false, false, true]);
  assert.equal(a.round.result.folded, null, 'the round went to the flip');
  assert.equal(a.round.result.winner, 1);
  asPlayed(ra, a);
  assert.equal(gotAway(ra, 0), null, 'a seat folded: its agents left unrevealed');

  // The same deal with nobody folding: seat 0 still loses; a line, if any, names seat 0's own cards.
  const b = deal();
  const rb = played(b, ...turns({}));
  assert.equal(b.round.result.winner, 1);
  asPlayed(rb, b);
  for (const seat of [0, 2]) {
    let g;
    assert.doesNotThrow(() => (g = gotAway(rb, seat)));
    if (!g) continue;
    for (const uid of [g.was.uid, g.instead.uid, g.instead.partner].filter(Boolean)) assert.equal(rb.start.round.cards[uid]?.owner, seat, `${uid} is seat ${seat}’s`);
  }
});

test('a broken alternative is skipped: a Lookout’s draw played later', () => {
  const s = E.newMatch({ seed: 3, cities: CITIES });
  setHand(s, 0, ['lookout', 'heavy', 'sleeper', 'veteran']);
  setHand(s, 1, ['heavy', 'sleeper', 'veteran', 'handler', 'mole', 'jammer']);
  const drawn = s.round.cards[s.round.decks[0][0]].kind;
  assert.equal(drawn, 'impostor', 'the Lookout draws the Impostor (the setup)');
  const rec = played(
    s,
    { drops: [['lookout', 0], ['heavy', 1]] },
    { drops: [['heavy', 1], ['sleeper', 2]] },
    { drops: [['sleeper', 2], ['veteran', 0]] },
    { drops: [[drawn, 0], ['handler', 1]] },
    { drops: [['veteran', 1], ['mole', 1]] },
    { drops: [['mole', 1], ['jammer', 0]] },
  );
  assert.ok(rec.events.some((e) => e.t === 'draw' && e.why === 'lookout' && e.seat === 0));
  asPlayed(rec, s);
  for (const seat of [0, 1]) assert.doesNotThrow(() => gotAway(rec, seat));
  // The Heavy on turn 1 instead: no Lookout draw. (The swap rule plays the Lookout on turn 2.)
  const out = replayRound(rec, { turn: 1, seat: 0, plan: { uid: startUid(rec, 0, 'heavy'), city: 0 } });
  assert.ok(out === null || typeof out.phase === 'string');
});

test('a broken alternative is skipped: a rival Getaway’s returned card, played on the last turn', () => {
  const s = E.newMatch({ seed: 3, cities: CITIES });
  setHand(s, 0, ['heavy', 'sleeper', 'veteran', 'handler', 'jammer', 'mole']);
  setHand(s, 1, ['heavy', 'lookout', 'veteran', 'handler', 'getaway', 'sleeper']);
  const lookout = startUid({ start: s }, 1, 'lookout');
  const rec = played(
    s,
    { drops: [['heavy', 0], ['heavy', 1]] },
    { drops: [['sleeper', 1], ['lookout', 1]] },
    { drops: [['veteran', 2], ['veteran', 0]] },
    { drops: [['handler', 2], ['handler', 2]] },
    { drops: [['mole', 0], ['getaway', 1]] },
    { drops: [['jammer', 1], ['lookout', 2]] },
  );
  const back = rec.turns[5].plans[1].uid;
  assert.notEqual(back, lookout, 'the Getaway sent the Lookout home under a fresh uid, and seat 1 played it');
  assert.ok(!(back in rec.start.round.cards));
  asPlayed(rec, s);
  for (const seat of [0, 1]) assert.doesNotThrow(() => gotAway(rec, seat));
  // Seat 0's Jammer in Monaco on turn 5 jams the Getaway: the Lookout stays out, so seat 1's last drop is refused.
  assert.equal(replayRound(rec, { turn: 5, seat: 0, plan: { uid: startUid(rec, 0, 'jammer'), city: 1 } }), null);
  // The control: the Jammer in Moscow instead leaves the Getaway working, and the round replays to its end.
  const free = replayRound(rec, { turn: 5, seat: 0, plan: { uid: startUid(rec, 0, 'jammer'), city: 0 } });
  assert.ok(free && free.phase === 'round-over');
  assert.equal(free.round.cards[back].city, 2, 'the Lookout came home and went to Berlin');
});

test('the swap rule: a later plan naming the alternative’s card plays the card that was dropped instead', () => {
  const s = E.newMatch({ seed: 3, cities: CITIES });
  setHand(s, 0, ['heavy', 'mole', 'sleeper', 'veteran', 'handler', 'jammer']);
  setHand(s, 1, ['heavy', 'sleeper', 'veteran', 'handler', 'jammer', 'mole']);
  const rec = played(
    s,
    { drops: [['heavy', 0], ['heavy', 1]] },
    { drops: [['mole', 2], ['sleeper', 1]] },
    { drops: [['sleeper', 1], ['veteran', 2]] },
    { drops: [['veteran', 0], ['handler', 1]] },
    { drops: [['handler', 1], ['jammer', 0]] },
    { drops: [['jammer', 2], ['mole', 0]] },
  );
  asPlayed(rec, s);
  const heavy = startUid(rec, 0, 'heavy');
  const mole = startUid(rec, 0, 'mole');
  const out = replayRound(rec, { turn: 1, seat: 0, plan: { uid: mole, city: 0 } });
  assert.ok(out && out.phase !== 'plan');
  assert.deepEqual([out.round.cards[mole].city, out.round.cards[mole].turn], [0, 1]);
  assert.deepEqual([out.round.cards[heavy].city, out.round.cards[heavy].turn], [2, 2], 'the Heavy went where the Mole went on turn 2');
  // An alternative that never applies (no such turn) is refused, never ignored quietly.
  assert.equal(replayRound(rec, { turn: 7, seat: 0, plan: { uid: mole, city: 0 } }), null);
});

test('ranking: on the latest winning turn, the same card to another city beats another card', () => {
  const s = E.newMatch({ seed: 3, cities: CITIES });
  setHand(s, 0, ['sleeper', 'veteran', 'handler', 'jammer', 'lookout', 'heavy', 'mole']);
  setHand(s, 1, ['heavy', 'handler', 'veteran', 'sleeper', 'jammer', 'mole']);
  const rec = played(
    s,
    { drops: [['sleeper', 2], ['heavy', 1]] },
    { drops: [['veteran', 0], ['handler', 2]] },
    { drops: [['handler', 1], ['veteran', 2]] },
    { drops: [['jammer', 1], ['sleeper', 1]] },
    { drops: [['lookout', 0], ['jammer', 0]] },
    { drops: [['heavy', 0], ['mole', 1]] },
  );
  assert.equal(s.round.result.winner, 1);
  asPlayed(rec, s);
  // On turn 6 the Mole in Berlin wins too (another card, another city), but the Heavy moved is the line.
  const mole = startUid(rec, 0, 'mole');
  assert.ok(s.round.hands[0].includes(mole), 'the Mole was held all round');
  const moled = replayRound(rec, { turn: 6, seat: 0, plan: { uid: mole, city: 2 } });
  assert.equal(moled.round.result.winner, 0, 'the setup: the Mole in Berlin wins');
  const g = gotAway(rec, 0);
  assert.equal(g.turn, 6);
  assert.equal(g.instead.uid, g.was.uid);
  assert.notEqual(g.instead.city, g.was.city);
  assert.equal(g.instead.kind, 'heavy');
  // Two cities for the Heavy win it (Monaco and Berlin), each holding two: legalDrops order picks Monaco.
  assert.deepEqual([g.instead.city, g.held], [1, 2]);
});

test('the sentence: city only, card only, both, Casablanca’s face, a partner', () => {
  const ids = ['istanbul', 'monaco', 'berlin'];
  assert.equal(gotAwayText({ turn: 4, was: { kind: 'heavy', city: 1 }, instead: { kind: 'heavy', city: 2 } }, ['istanbul', 'monaco', 'tangier']), 'Turn 4: Heavy to Tangier instead of Monaco would have won the round.');
  assert.equal(gotAwayText({ turn: 2, was: { kind: 'heavy', city: 0 }, instead: { kind: 'mole', city: 0 } }, ids), 'Turn 2: the Mole to Istanbul instead of the Heavy would have won the round.');
  assert.equal(gotAwayText({ turn: 2, was: { kind: 'heavy', city: 0 }, instead: { kind: 'sleeper', city: 2 } }, ids), 'Turn 2: the Sleeper to Berlin instead of the Heavy to Istanbul would have won the round.');
  const casa = ['istanbul', 'casablanca', 'berlin'];
  assert.equal(gotAwayText({ turn: 2, was: { kind: 'heavy', city: 0 }, instead: { kind: 'sleeper', city: 1, down: false } }, casa), 'Turn 2: the Sleeper face up in Casablanca instead of the Heavy to Istanbul would have won the round.');
  assert.equal(gotAwayText({ turn: 5, was: { kind: 'sleeper', city: 1, down: true }, instead: { kind: 'sleeper', city: 1, down: false } }, casa), 'Turn 5: Sleeper face up in Casablanca instead of face down would have won the round.');
  assert.equal(gotAwayText({ turn: 5, was: { kind: 'heavy', city: 1, down: true }, instead: { kind: 'heavy', city: 2 } }, casa), 'Turn 5: Heavy to Berlin instead of face down in Casablanca would have won the round.');
  const rome = ['istanbul', 'rome', 'berlin'];
  assert.equal(gotAwayText({ turn: 3, was: { kind: 'heavy', city: 1 }, instead: { kind: 'accomplice', partnerKind: 'mole', city: 1 } }, rome), 'Turn 3: the Accomplice with the Mole to Rome instead of the Heavy would have won the round.');
  assert.equal(gotAwayText({ turn: 3, was: { kind: 'accomplice', city: 1 }, instead: { kind: 'accomplice', partnerKind: 'mole', city: 1 } }, rome), 'Turn 3: the Accomplice with the Mole to Rome instead of the Accomplice alone would have won the round.');
  assert.equal(gotAwayText({ turn: 1, was: { kind: 'double', city: 0 }, instead: { kind: 'double', city: 1 } }, ['berlin', 'hongkong', 'glienicke']), 'Turn 1: Double Agent to Hong Kong instead of Berlin would have won the round.');
});
