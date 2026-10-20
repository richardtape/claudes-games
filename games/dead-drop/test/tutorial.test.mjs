import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { TUTORIAL, tutorialTable, arrange, coachFor, gateAllows, canLock, afterFor, attachScript } from '../js/tutorial.js';
import { START_HAND, TURNS } from '../js/data.js';

const until = (fn, ms = 4000) => new Promise((res, rej) => { const t0 = Date.now(); const tick = () => (fn() ? res() : Date.now() - t0 > ms ? rej(new Error('timed out')) : setTimeout(tick, 10)); tick(); });
const uidOf = (view, kind) => view.round.hand.find((c) => c.kind === kind)?.uid;
const names = ['You', 'Agent Wren'];
const totals = (t) => [0, 1, 2].map((ci) => E.cityTotals(t.state, ci));

test('the briefing table deals the script’s hands, no Microfilm, no timer, and the suggested drops win 5-0', async () => {
  const t = tutorialTable({ names });
  assert.deepEqual(t.view(0).round.hand.map((c) => c.kind), TUTORIAL.decks[0].slice(0, START_HAND));
  assert.deepEqual(t.view(1).round.hand.map((c) => c.kind), TUTORIAL.decks[1].slice(0, START_HAND));
  assert.deepEqual(t.state.round.cities.map((c) => c.id), TUTORIAL.cities);
  assert.equal(t.state.round.film, null);
  assert.equal(t.state.reel, 0);
  assert.equal(t.timer, 0);
  const wren = attachScript(t, 1, TUTORIAL.rival);
  for (let turn = 1; turn <= TURNS; turn++) {
    const v = t.view(0);
    assert.equal(v.round.turn, turn);
    const coach = coachFor(v);
    assert.ok(coach && coach.suggest, `turn ${turn} has a coach line and a suggestion`);
    if (turn === 4 || turn === 5) {
      const off = v.round.hand.find((c) => c.kind !== TUTORIAL.turns[turn - 1].suggest[0]);
      assert.equal(gateAllows(v, coach.gate, { uid: off.uid }), false, `turn ${turn} holds back the ${off.kind}`);
      assert.equal(gateAllows(v, coach.gate, { city: 0 }), false, `turn ${turn} holds back Istanbul`);
    }
    if (turn === 5) assert.equal(canLock(v, coach.gate), true, 'turn 5 locks without escalating');
    if (turn === 4) {
      assert.equal(canLock(v, coach.gate), false, 'turn 4 waits for the escalation');
      assert.ok(t.act(0, { a: 'escalate' }));
      await until(() => !t.state.round.pending);
      assert.deepEqual([t.state.round.stake, t.state.round.called.answers[1]], [2, 'on'], 'Wren plays on');
      assert.equal(canLock(t.view(0), coach.gate), true);
    }
    const [kind, city] = TUTORIAL.turns[turn - 1].suggest;
    const uid = uidOf(t.view(0), kind);
    assert.ok(uid, `turn ${turn}: the ${kind} is in hand`);
    assert.deepEqual(coach.suggest, { uid, city });
    assert.ok(gateAllows(t.view(0), coach.gate, { uid, city }));
    assert.ok(t.act(0, { a: 'lock', uid, city }), `turn ${turn}: ${kind} to city ${city} is legal`);
    await until(() => t.state.phase !== 'plan' || t.state.round.turn === turn + 1);
    const ev = t.state.round.events;
    if (turn === 1) assert.deepEqual(totals(t)[0], [9, 0], 'Istanbul 9 to nothing');
    if (turn === 2) assert.ok(ev.some((e) => e.t === 'out' && e.kind === 'veteran' && e.cause === 'assassin'), 'the Assassin takes out the Veteran');
    if (turn === 3) {
      assert.ok(ev.some((e) => e.t === 'draw' && e.seat === 1 && e.why === 'lookout'), 'Wren’s Lookout drew');
      assert.deepEqual(totals(t)[2], [4, 1], 'Berlin 4 to 1');
    }
    if (turn === 5) assert.deepEqual(totals(t)[1], [4, 6], 'Monaco 4 to 6');
    if (turn === 6) assert.deepEqual([totals(t)[1], totals(t)[2], totals(t)[0]], [[7, 6], [4, 1], [9, 6]]);
  }
  const res = t.state.round.result;
  assert.equal(res.winner, 0);
  assert.deepEqual(res.cityWinners, [0, 0, 0]);
  assert.equal(res.points, 4, 'stake 2, doubled at the final flip');
  assert.equal(res.monaco, 0);
  assert.deepEqual(t.state.scores, [5, 0]);
  assert.equal(t.timer, 0);
  assert.equal(t.clock, null);
  wren.stop();
});

test('the gates: turns 1–5 allow one card and one city (turn 4 locks only once escalated), turn 6 anything', () => {
  const t = tutorialTable({ names });
  const v = t.view(0);
  const g1 = coachFor(v).gate;
  assert.equal(gateAllows(v, g1, { uid: uidOf(v, 'heavy') }), true);
  assert.equal(gateAllows(v, g1, { uid: uidOf(v, 'assassin') }), false);
  assert.equal(gateAllows(v, g1, { city: 1 }), false);
  assert.equal(gateAllows(v, { escalate: true }, { uid: uidOf(v, 'mole'), city: 2 }), true, 'an escalate gate alone lets any drop through');
  assert.equal(gateAllows(v, null, { uid: uidOf(v, 'mole'), city: 2 }), true);
  // Turn 4: escalate, and the Mole to Berlin (the Mole is in the opening hand, so this view can try it).
  const g4 = TUTORIAL.turns[3].gate;
  assert.deepEqual(g4, { escalate: true, card: 'mole', city: 2 });
  assert.equal(gateAllows(v, g4, { uid: uidOf(v, 'mole') }), true);
  assert.equal(gateAllows(v, g4, { city: 2 }), true);
  assert.equal(gateAllows(v, g4, { uid: uidOf(v, 'mole'), city: 2 }), true);
  assert.equal(gateAllows(v, g4, { uid: uidOf(v, 'heavy') }), false, 'turn 4 holds back every card but the Mole');
  assert.equal(gateAllows(v, g4, { city: 0 }), false, 'and every city but Berlin');
  assert.equal(gateAllows(v, g4, { uid: uidOf(v, 'mole'), city: 1 }), false);
  assert.equal(canLock(v, g4), false, 'turn 4 locks only once escalated');
  assert.ok(t.act(0, { a: 'escalate' }));
  assert.equal(canLock(t.view(0), g4), true);
  // Turn 5: the Jammer to Monaco. Turn 6 is free.
  assert.deepEqual(TUTORIAL.turns[4].gate, { card: 'jammer', city: 1 });
  assert.equal(canLock(v, TUTORIAL.turns[4].gate), true);
  assert.equal(TUTORIAL.turns[5].gate, null);
  assert.equal(afterFor(6), null);
  assert.equal(typeof afterFor(1), 'string');
});

test('TUTORIAL is consistent, and arrange throws on a missing kind', () => {
  assert.equal(TUTORIAL.turns.length, TURNS);
  assert.deepEqual(TUTORIAL.turns.map((x) => x.title), ['The drop', 'The flip trick', 'The face-down card', 'Escalate', 'Read the board', 'The final flip']);
  assert.ok(TUTORIAL.turns.every((x) => x.text.length <= 220));
  assert.ok(TUTORIAL.turns[3].text.endsWith('Then drop the Mole in Berlin: rival agents there get −1.'));
  assert.ok(TUTORIAL.turns[4].text.endsWith('Shore it up with the Jammer.'));
  assert.ok(Object.isFrozen(TUTORIAL) && Object.isFrozen(TUTORIAL.turns[0]) && Object.isFrozen(TUTORIAL.decks[0]));
  const t = tutorialTable({ names });
  assert.throws(() => arrange(t.state, 0, ['heavy', 'nonesuch']));
});

test('attachScript: locks its drop, answers play on, presses Next, never escalates', async () => {
  const t = tutorialTable({ names });
  const wren = attachScript(t, 1, TUTORIAL.rival);
  await until(() => t.state.round.plans[1]);
  assert.equal(t.state.round.cards[t.state.round.plans[1].uid].kind, 'veteran');
  assert.equal(t.state.round.plans[1].city, 1);
  assert.ok(t.act(0, { a: 'escalate' }), 'we may escalate; Wren is owed a call');
  await until(() => !t.state.round.pending);
  assert.equal(t.state.round.called.answers[1], 'on');
  assert.equal(t.state.round.folded[1], false);
  assert.ok(t.act(0, { a: 'lock', uid: uidOf(t.view(0), 'heavy'), city: 0 }));
  await until(() => t.state.round.turn === 2);
  assert.equal(t.state.tokens[1], 3, 'Wren never escalates');
  wren.stop();
});

test('attachScript presses Next at round-over and does nothing at match-over', async () => {
  const t = tutorialTable({ names });
  const wren = attachScript(t, 1, TUTORIAL.rival);
  for (let turn = 1; turn <= TURNS; turn++) {
    const [kind, city] = TUTORIAL.turns[turn - 1].suggest;
    t.act(0, { a: 'lock', uid: uidOf(t.view(0), kind), city });
    await until(() => t.state.phase !== 'plan' || t.state.round.turn === turn + 1);
  }
  await until(() => t.state.phase === 'round-over' || t.state.phase === 'match-over');
  if (t.state.phase === 'round-over') {
    await until(() => t.ready[1]);
    assert.equal(t.ready[0], false);
  }
  wren.stop();
});

test('attachScript falls back to its first legal drop when the kind is not in hand', async () => {
  const t = tutorialTable({ names });
  const first = E.legalDrops(t.state, 1)[0];
  const wren = attachScript(t, 1, [['impostor', 2]]);
  await until(() => t.state.round.plans[1]);
  assert.equal(t.state.round.plans[1].uid, first.uid);
  assert.equal(t.state.round.plans[1].city, first.city);
  wren.stop();
});

test('a lock after stop() never lands', async () => {
  const t = tutorialTable({ names });
  let held = true;
  const wren = attachScript(t, 1, TUTORIAL.rival, { hold: () => held });
  await new Promise((r) => setTimeout(r, 30));
  wren.stop();
  held = false;
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(t.state.round.plans[1], null);
});
