import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { sightings, unseen } from '../js/counting.js';
import { mixed, play, uidOf } from './helpers.mjs';

test('unseen: the list minus one copy per sighting, in list order', () => {
  const list = ['heavy', 'lookout', 'lookout', 'mole'];
  assert.deepEqual(unseen(list, ['lookout', 'heavy']), ['lookout', 'mole']);
  assert.deepEqual(unseen(list, ['lookout', 'lookout']), ['heavy', 'mole']);
  assert.deepEqual(unseen(list, []), list);
  assert.deepEqual(list, ['heavy', 'lookout', 'lookout', 'mole'], 'the list is not changed');
});

test('unseen: a sighting of a kind not in the list changes nothing, and sightings never go below none', () => {
  assert.deepEqual(unseen(['heavy', 'mole'], ['jammer']), ['heavy', 'mole']);
  assert.deepEqual(unseen(['heavy', 'mole'], ['jammer', 'mole', 'mole', 'mole']), ['heavy']);
  assert.deepEqual(unseen(['lookout'], ['lookout', 'lookout']), []);
});

test("sightings of a played-out match: a rival's face-up board card and a taken-out card, never a face-down rival card", () => {
  const s = mixed(['monaco', 'zurich', 'hongkong']);
  play(s, ['veteran', 2], ['mole', 1]);
  play(s, ['assassin', 1], ['heavy', 0]); // the Assassin takes the Mole out
  play(s, ['handler', 2], ['sleeper', 2]); // the rival's Sleeper goes down face down
  const heavy = uidOf(s, 1, 'heavy');
  const mole = uidOf(s, 1, 'mole');
  const sleeper = uidOf(s, 1, 'sleeper');
  assert.ok(s.round.gone[1].includes(mole), 'the Mole was taken out');
  assert.ok(s.round.cards[sleeper].faceDown, 'the Sleeper is face down');
  assert.ok(s.round.events.some((e) => e.uid === sleeper), "this turn's events hold the Sleeper's drop");

  const seen = sightings(E.viewFor(s, 0));
  assert.deepEqual(seen.find((x) => x.uid === heavy), { uid: heavy, origin: 1, id0: 'heavy' });
  assert.deepEqual(seen.find((x) => x.uid === mole), { uid: mole, origin: 1, id0: 'mole' });
  assert.ok(!seen.some((x) => x.uid === sleeper));
  for (const x of seen) {
    const c = s.round.cards[x.uid];
    assert.ok(!(c.faceDown && c.owner !== 0), `${x.uid} is a face-down rival card`);
    assert.equal(x.id0, c.id0);
  }
  assert.equal(new Set(seen.map((x) => x.uid)).size, seen.length, 'each card once');

  // The rival's strip: its deck list minus what seat 0 has seen of it.
  const rival = unseen(E.deckList(s, 1), seen.filter((x) => x.origin === 1).map((x) => x.id0));
  assert.ok(!rival.includes('heavy') && !rival.includes('mole') && rival.includes('sleeper'));
  assert.equal(rival.length, E.deckList(s, 1).length - 2);

  // The rival sees seat 0's three face-up agents, and a spectator sees no hand.
  const theirs = sightings(E.viewFor(s, 1)).filter((x) => x.origin === 0).map((x) => x.id0).sort();
  assert.deepEqual(theirs, ['assassin', 'handler', 'veteran']);
  const watched = sightings(E.viewFor(s, -1));
  const hands = s.round.hands.flat();
  assert.ok(hands.length > 0);
  for (const x of watched) {
    assert.ok(!hands.includes(x.uid), `${x.uid} is in a hand`);
    assert.ok(!s.round.cards[x.uid].faceDown, `${x.uid} is face down`);
  }
  assert.deepEqual(watched.map((x) => x.id0).sort(), ['assassin', 'handler', 'heavy', 'mole', 'veteran']);
});

test("sightings: your hand's turned assets, not your own cards; drop and reveal events with a kind", () => {
  const card = (uid, owner, origin, id0, faceDown = false) => ({ uid, owner, origin, id0, kind: id0, faceDown });
  const view = {
    seat: 0,
    round: {
      cities: [{ sides: [[card('a1', 0, 0, 'heavy')], [card('b1', 1, 1, null, true)]] }],
      gone: [[], [card('b2', 1, 1, 'mole')]],
      hand: [card('a2', 0, 0, 'lookout'), card('a3', 0, 1, 'jammer')],
      events: [
        { t: 'drop', seat: 1, uid: 'b1', city: 0, kind: null, faceDown: true },
        { t: 'drop', seat: 1, uid: 'b9', city: 0, kind: 'veteran', faceDown: false },
        { t: 'reveal', uid: 'b2', kind: 'mole' },
        { t: 'draw', seat: 0, uid: 'a2', why: 'turn' },
        { t: 'out', uid: 'b2', city: 0, owner: 1, kind: 'mole', cause: 'assassin' },
      ],
    },
  };
  assert.deepEqual(sightings(view), [
    { uid: 'a1', origin: 0, id0: 'heavy' },
    { uid: 'b2', origin: 1, id0: 'mole' },
    { uid: 'a3', origin: 1, id0: 'jammer' },
    { uid: 'b9', origin: 1, id0: 'veteran' },
  ]);
});
