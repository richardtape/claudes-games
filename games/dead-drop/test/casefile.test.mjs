import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { recapOf, highlights, posterData } from '../js/casefile.js';
import { play, setHand } from './helpers.mjs';

test('a recap names the take-outs with who did them, and every agent left on the board', () => {
  const s = E.newMatch({ seed: 31, cities: ['monaco', 'berlin', 'tangier'] });
  setHand(s, 0, ['assassin', 'heavy', 'mole', 'veteran']);
  setHand(s, 1, ['veteran', 'tripwire', 'jammer', 'handler']);
  const events = [];
  const played = (...mv) => events.push(...play(s, ...mv));
  played(['heavy', 0], ['veteran', 0]);
  played(['assassin', 0], ['tripwire', 1]); // my Assassin takes out the Veteran in Monaco
  played(['mole', 1], ['jammer', 2]); // my Mole walks into the Tripwire in Berlin
  for (let t = 4; t <= 6 && s.phase === 'plan'; t++) played(null, null);
  // As played: the Assassin's trick, then its out; the Mole's out after the Tripwire's.
  assert.ok(events.some((e) => e.t === 'trick' && e.kind === 'assassin'), 'the Assassin played');
  assert.ok(events.some((e) => e.t === 'out' && e.kind === 'veteran' && e.cause === 'assassin'), 'the Veteran went out to it');
  assert.ok(events.some((e) => e.t === 'tripwire'), 'the Tripwire sprang');
  assert.ok(events.some((e) => e.t === 'out' && e.kind === 'mole' && e.cause === 'tripwire'), 'the Mole went out to it');
  const r = recapOf(s, events);
  assert.equal(r.no, 0);
  const byMe = r.outs.find((o) => o.victim === 'veteran');
  assert.deepEqual([byMe.owner, byMe.cause, byMe.city, byMe.by], [1, 'assassin', 'monaco', { kind: 'assassin', owner: 0 }]);
  assert.equal(byMe.power, 3);
  const wired = r.outs.find((o) => o.victim === 'mole');
  assert.deepEqual([wired.owner, wired.cause, wired.by], [0, 'tripwire', { kind: 'tripwire', owner: 1 }]);
  assert.ok(r.board[0][0].some((c) => c.kind === 'heavy' && c.owner === 0 && c.power === 6));
  assert.deepEqual([r.winner, r.cityWinners.length, r.escalated], [s.round.result.winner, 3, [false, false]]);
  assert.equal(recapOf(s, null).outs, null);
});

test('a take-out by Tangier has no one to thank', () => {
  const o = recapOf(
    (() => { const s = E.newMatch({ seed: 5 }); for (let t = 1; t <= 6; t++) play(s, null, null); return s; })(),
    [{ t: 'out', uid: 'x', city: 2, owner: 1, kind: 'mole', cause: 'tangier' }],
  );
  assert.equal(o.outs[0].by, null);
});

test('highlights: the best takedown, escalations won, the MVP by cities held, the biggest round; nothing from nothing', () => {
  const recap = [
    { no: 0, winner: 0, points: 2, escalated: [true, false], cityWinners: [0, 1, null], outs: [{ victim: 'heavy', owner: 1, power: 6, cause: 'assassin', city: 'monaco', by: { kind: 'assassin', owner: 0 } }], board: [[[{ kind: 'assassin', owner: 0, power: 1 }, { kind: 'mole', owner: 0, power: 2 }], []], [[], [{ kind: 'heavy', owner: 1, power: 6 }]], [[], []]] },
    { no: 1, winner: 1, points: 4, escalated: [true, false], cityWinners: [1, 1, 0], outs: [{ victim: 'mole', owner: 1, power: 2, cause: 'tripwire', city: 'berlin', by: { kind: 'tripwire', owner: 0 } }], board: [[[], []], [[], []], [[{ kind: 'mole', owner: 0, power: 2 }], []]] },
    { no: 2, winner: 0, points: 5, escalated: [false, true], cityWinners: [0, null, 0], outs: [], board: [[[{ kind: 'mole', owner: 0, power: 2 }], []], [[], []], [[{ kind: 'veteran', owner: 0, power: 6 }], []]] },
  ];
  const h = highlights(recap, 0);
  assert.deepEqual(h.takedown, { round: 0, by: 'assassin', victim: 'heavy', power: 6, city: 'monaco' });
  assert.deepEqual(h.escalations, { called: 2, won: 1 });
  assert.deepEqual(h.mvp, { kind: 'mole', held: 3, power: 6 });
  assert.deepEqual(h.biggest, { round: 2, points: 5 });
  assert.deepEqual(highlights([], 0), { takedown: null, escalations: { called: 0, won: 0 }, mvp: null, biggest: null });
  assert.deepEqual(highlights(undefined, 1), highlights([], 1));
  // Rounds without a record (outs: null) still count for everything else.
  const bare = highlights(recap.map((r) => ({ ...r, outs: null })), 0);
  assert.equal(bare.takedown, null);
  assert.deepEqual([bare.escalations, bare.mvp, bare.biggest], [h.escalations, h.mvp, h.biggest]);
  // Own agents never count as a takedown, and later rounds win ties.
  const tie = [
    { no: 0, winner: 0, points: 1, escalated: [false, false], cityWinners: [], outs: [{ victim: 'mole', owner: 1, power: 2, cause: 'assassin', city: 'a', by: { kind: 'assassin', owner: 0 } }, { victim: 'heavy', owner: 0, power: 6, cause: 'tripwire', city: 'a', by: { kind: 'tripwire', owner: 0 } }], board: [] },
    { no: 1, winner: 0, points: 1, escalated: [false, false], cityWinners: [], outs: [{ victim: 'mole', owner: 1, power: 2, cause: 'tripwire', city: 'b', by: { kind: 'tripwire', owner: 0 } }], board: [] },
  ];
  assert.deepEqual(highlights(tie, 0).takedown, { round: 1, by: 'tripwire', victim: 'mole', power: 2, city: 'b' });
});

const label = (v) => (s) => v.names[s];
test('posterData draws from a view with or without a recap', () => {
  const s = E.newMatch({ seed: 32 });
  const recaps = [];
  for (let r = 0; r < 2; r++) { for (let t = 1; t <= 6; t++) play(s, null, null); recaps.push(recapOf(s, null)); if (s.phase === 'round-over') E.nextRound(s); }
  const v = { ...E.viewFor(s, 0), names: ['Agent Fox', 'Agent Wren'], matchId: 'abcd1234' };
  const p = posterData(v, 1, { label: label(v) });
  assert.equal(p.rounds.length, v.history.length);
  assert.deepEqual(p.order, [1, 0]);
  assert.ok(p.rounds.every((r) => typeof r.operation === 'string' && r.cities.length === 3 && r.missed === null));
  assert.deepEqual(p.highlights, highlights([], 1), 'no recap: no highlights, no crash');
  const withRecap = posterData({ ...v, recap: recaps, missed: [] }, 0, { label: label(v) });
  assert.equal(withRecap.focus, 0);
  assert.ok(withRecap.highlights);
});

test('posterData at three seats: order from the focus seat, three scores', () => {
  const s = E.newMatch({ seed: 33, seats: 3 });
  for (let t = 1; t <= 6; t++) play(s, null, null, null);
  const v = { ...E.viewFor(s, 2), names: ['A', 'B', 'C'], matchId: 'abcd1234' };
  const p = posterData(v, 2, { label: label(v) });
  assert.deepEqual(p.order, [2, 0, 1]);
  assert.equal(p.scores.length, 3);
  assert.equal(p.rounds.length, v.history.length);
  assert.ok(p.rounds.length >= 1);
});

test('posterData gives a seat its own got-away for the round from view.missed', () => {
  const s = E.newMatch({ seed: 32 });
  for (let t = 1; t <= 6; t++) play(s, null, null);
  const g = { turn: 2, was: { uid: 'u', city: 0, kind: 'mole' }, instead: { uid: 'w', city: 1, kind: 'heavy' }, held: [] };
  const v = { ...E.viewFor(s, 0), names: ['A', 'B'], matchId: 'abcd1234', missed: [{ no: 0, ...g }] };
  assert.deepEqual(posterData(v, 0, { label: label(v) }).rounds[0].missed, { no: 0, ...g });
});

test('a fold leaves the winner’s face-down agent unnamed on the board, and the MVP never names it', () => {
  const s = E.newMatch({ seed: 34, cities: ['monaco', 'berlin', 'tangier'] });
  setHand(s, 0, ['heavy', 'mole', 'lookout', 'handler']);
  setHand(s, 1, ['sleeper', 'veteran', 'jammer', 'handler']);
  play(s, ['heavy', 0], ['sleeper', 1]);
  assert.ok(E.fold(s, 0));
  assert.equal(s.round.result.folded, 0);
  const r = recapOf(s, null);
  const cards = r.board.flatMap((c) => c[1]);
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0], { kind: null, owner: 1, power: null });
  assert.ok(JSON.stringify(r).indexOf('sleeper') < 0, 'the identity is nowhere in the recap');
  const wonCities = r.board.map(() => 1);
  assert.equal(highlights([{ ...r, winner: 1, cityWinners: wonCities }], 1).mvp, null);
});

test('a three-seat take-out by an Assassin later sent home by its own Getaway still names its seat', () => {
  const s = E.newMatch({ seed: 41, seats: 3, cities: ['monaco', 'berlin', 'tangier'] });
  setHand(s, 0, ['heavy', 'mole', 'veteran', 'lookout']);
  setHand(s, 1, ['assassin', 'getaway', 'mole', 'veteran']);
  setHand(s, 2, ['veteran', 'mole', 'lookout', 'handler']);
  const events = [];
  const played = (...mv) => events.push(...play(s, ...mv));
  played(['heavy', 0], ['mole', 1], ['veteran', 2]);
  played(null, ['assassin', 0], null);
  played(null, ['getaway', 0], null);
  for (let t = 4; t <= 6 && s.phase === 'plan'; t++) played(null, null, null);
  const trick = events.find((e) => e.t === 'trick' && e.kind === 'assassin');
  assert.equal(s.round.cards[trick.uid], undefined, 'the Assassin was sent home and re-keyed');
  const out = recapOf(s, events).outs.find((o) => o.cause === 'assassin');
  assert.deepEqual([out.victim, out.owner, out.by], ['heavy', 0, { kind: 'assassin', owner: 1 }]);
});

test('a take-out is credited to the seat that dropped the killer, even after Glienicke Bridge sends it across', () => {
  const s = E.newMatch({ seed: 43, cities: ['glienicke', 'berlin', 'tangier'] });
  setHand(s, 0, ['assassin', 'heavy', 'mole', 'veteran']);
  setHand(s, 1, ['veteran', 'jammer', 'mole', 'handler']);
  const events = [];
  const played = (...mv) => events.push(...play(s, ...mv));
  played(['heavy', 1], ['veteran', 0]);
  played(['assassin', 0], ['jammer', 1]); // my Assassin takes out the Veteran on the bridge
  played(['mole', 2], ['mole', 2]); // after turn 3 the Assassin, my only agent there, crosses to seat 1
  for (let t = 4; t <= 6 && s.phase === 'plan'; t++) played(null, null);
  const trick = events.find((e) => e.t === 'trick' && e.kind === 'assassin');
  assert.ok(events.some((e) => e.t === 'bridge' && e.moves.some((m) => m.uid === trick.uid && m.to === 1)), 'the Assassin crossed');
  assert.equal(s.round.cards[trick.uid].owner, 1, 'it ends the round on seat 1');
  const out = recapOf(s, events).outs.find((o) => o.cause === 'assassin');
  assert.deepEqual([out.victim, out.owner, out.by], ['veteran', 1, { kind: 'assassin', owner: 0 }]);
  // With no drop event to read (a hand-built list), the owner at the round's end is all there is.
  const bare = recapOf(s, events.filter((e) => e.t !== 'drop')).outs.find((o) => o.cause === 'assassin');
  assert.deepEqual(bare.by, { kind: 'assassin', owner: 1 });
});

test('two Assassins in one turn: each take-out is credited by its target, whatever the event order', () => {
  const s = E.newMatch({ seed: 42, seats: 3, cities: ['monaco', 'berlin', 'tangier'] });
  setHand(s, 0, ['assassin', 'mole', 'veteran', 'lookout']);
  setHand(s, 1, ['assassin', 'mole', 'heavy', 'veteran']);
  setHand(s, 2, ['mole', 'heavy', 'lookout', 'handler']);
  const events = [];
  const played = (...mv) => events.push(...play(s, ...mv));
  played(null, null, ['mole', 0]);
  played(null, null, ['heavy', 1]);
  played(['assassin', 0], ['assassin', 1], null);
  for (let t = 4; t <= 6 && s.phase === 'plan'; t++) played(null, null, null);
  const tricks = events.filter((e) => e.t === 'trick' && e.kind === 'assassin');
  const outs = events.filter((e) => e.t === 'out' && e.cause === 'assassin');
  assert.equal(tricks.length, 2);
  assert.equal(outs.length, 2);
  const shuffled = [...events.filter((e) => e.t !== 'trick' && e.t !== 'out'), tricks[0], tricks[1], outs[0], outs[1]];
  const by = (r, kind) => r.outs.find((o) => o.victim === kind).by;
  const r = recapOf(s, shuffled);
  assert.deepEqual(by(r, 'mole'), { kind: 'assassin', owner: 0 });
  assert.deepEqual(by(r, 'heavy'), { kind: 'assassin', owner: 1 }, 'not the nearest preceding Assassin');
});

test('posterData words how as the end screen does today', () => {
  const s = E.newMatch({ seed: 35 });
  for (let t = 1; t <= 6; t++) play(s, null, null);
  const v = { ...E.viewFor(s, 0), names: ['Agent Fox', 'Agent Wren'], matchId: 'abcd1234' };
  const h = (o) => ({ ...v.history[0], ...o });
  const how = (o) => posterData({ ...v, history: [h(o)] }, 0, { label: (x) => v.names[x] }).rounds[0].how;
  assert.equal(how({ folded: 1, winner: 0 }), 'Agent Wren folded');
  assert.equal(how({ folded: null, winner: null }), 'dead heat');
  assert.equal(how({ folded: null, winner: 0, cityWinners: [0, 0, 1] }), '2 of 3 cities');
});
