import test from 'node:test';
import assert from 'node:assert/strict';
import { revealTap, REVEAL_GUARD_MS, REVEAL_SPEED, FAST, tagsHTML, laneHTML, cityHTML, pulledOut, firstFlip, coinHTML } from '../js/board.js';
import * as E from '../js/engine.js';
import { play } from './helpers.mjs';

test('a reveal ignores taps for 400 ms, then speeds up, then skips', () => {
  assert.equal(REVEAL_GUARD_MS, 400);
  assert.equal(FAST, 3);
  assert.equal(revealTap({ at: 1000, speed: 1 }, 1399), 'ignore');
  assert.equal(revealTap({ at: 1000, speed: 1 }, 1400), 'fast');
  assert.equal(revealTap({ at: 1000, speed: 3 }, 1400), 'skip');
});

test('a reveal at a quicker base pace (three and four seats) speeds up by FAST from there, then skips', () => {
  assert.deepEqual(REVEAL_SPEED, { 2: 1, 3: 1.25, 4: 1.5 });
  assert.equal(revealTap({ at: 0, speed: 1.25, base: 1.25 }, 1000), 'fast');
  assert.equal(revealTap({ at: 0, speed: 3.75, base: 1.25 }, 1000), 'skip');
  assert.equal(revealTap({ at: 0, speed: 3, base: 1 }, 1000), 'skip');
  // Fast at two seats is not yet fast at four.
  assert.equal(revealTap({ at: 0, speed: 3, base: 1.5 }, 1000), 'fast');
});

test('the guard holds even once the reveal is already fast', () => {
  // A speed-up can only come after the guard, but a skip within it is still a stray tap.
  assert.equal(revealTap({ at: 1000, speed: 3 }, 1200), 'ignore');
});

test('tags: one per seat from the bottom seat, with marks at three seats and none at two', () => {
  const s3 = E.newMatch({ seed: 2, seats: 3 });
  const html = tagsHTML(E.viewFor(s3, 1), 1, { colours: ['red', 'teal', 'cobalt'], label: (s) => (s === 1 ? 'You' : ['Red', 'Teal', 'Cobalt'][s]), initShown: null });
  assert.deepEqual([...html.matchAll(/data-seat="(\d)"/g)].map((m) => Number(m[1])), [1, 2, 0]);
  assert.equal((html.match(/class="mark /g) || []).length, 3);
  assert.ok(html.includes('data-score="1"'));
  const s2 = E.newMatch({ seed: 2 });
  assert.ok(!tagsHTML(E.viewFor(s2, 0), 0, { colours: ['red', 'teal'], label: String, initShown: null }).includes('class="mark '));
});

test('tags: your own tag is not a button; a spectator (own -1) gets a button for every seat, the bottom one too', () => {
  const s4 = E.newMatch({ seed: 2, seats: 4 });
  const opts = { colours: ['red', 'teal', 'cobalt', 'plum'], label: String, initShown: null };
  const buttons = (html) => [...html.matchAll(/<button class="tag[^"]*" data-action="tag" data-seat="(\d)"/g)].map((m) => Number(m[1]));
  const mine = tagsHTML(E.viewFor(s4, 2), 2, opts);
  assert.deepEqual(buttons(mine), [3, 0, 1]);
  assert.ok(mine.includes('class="tag own-2 s-2') && mine.includes('me" data-seat="2"'));
  const watching = tagsHTML(E.viewFor(s4, -1), 0, { ...opts, own: -1 });
  assert.deepEqual(buttons(watching), [0, 1, 2, 3]);
  assert.ok(!watching.includes(' me"'));
});

test('lanes keep the data-row convention and show rival cards as minis, face-down as backs', () => {
  const s = E.newMatch({ seed: 5, seats: 3, cities: ['monaco', 'zurich', 'hongkong'] });
  play(s, ['heavy', 0], ['sleeper', 0], ['mole', 0]);
  const v = E.viewFor(s, 0);
  const lane = laneHTML(v, 0, 1);
  assert.ok(lane.includes('data-row="0-1"') && lane.includes('class="mini chip own-1 back'));
  assert.equal((laneHTML(v, 0, 2).match(/class="mini chip/g) || []).length, 1);
  const city = cityHTML(v, 0, 0);
  assert.ok(city.indexOf('data-row="0-1"') < city.indexOf('class="plate"') && city.indexOf('class="plate"') < city.indexOf('data-row="0-0"'));
  assert.equal((city.match(/class="total /g) || []).length, 3);
  assert.ok(!cityHTML(E.viewFor(E.newMatch({ seed: 5 }), 0), 0, 0).includes('lane'), 'two seats: no lanes');
});

test('pulledOut: the board before a fold, with the folders taken off it, for the reveal that follows', () => {
  const s = E.newMatch({ seed: 5, seats: 3, cities: ['monaco', 'zurich', 'hongkong'] });
  play(s, ['heavy', 0], ['sleeper', 0], ['mole', 1]);
  const before = E.viewFor(s, 0);
  assert.ok(E.escalate(s, 0));
  assert.ok(E.respond(s, 1, true) && E.respond(s, 2, false));
  const after = E.viewFor(s, 0);
  const shown = pulledOut(before, [2], after, { called: true });
  // Seat 2's agents are off every city, with their totals; seat 1's (and mine) are as they stood.
  assert.deepEqual(shown.round.cities.map((c) => c.sides[2].length), [0, 0, 0]);
  assert.deepEqual(shown.round.cities.map((c) => c.known[2]), [0, 0, 0]);
  assert.deepEqual(shown.round.cities.map((c) => c.sides[1].length), before.round.cities.map((c) => c.sides[1].length));
  assert.deepEqual(shown.round.cities.map((c) => c.sides[0].length), before.round.cities.map((c) => c.sides[0].length));
  assert.ok(before.round.cities[1].sides[2].length === 1, 'seat 2 had an agent in Zurich to pull out');
  assert.deepEqual(shown.round.folded, [false, false, true]);
  assert.equal(shown.round.pending, null);
  // The settled call, and what it did to the stake and the pot.
  assert.deepEqual(shown.round.called, after.round.called);
  assert.equal(shown.round.stake, 2);
  assert.equal(shown.round.pot, 1);
  // Nothing else moves on: still the turn the board was on, and `before` is left as it was.
  assert.equal(shown.round.turn, before.round.turn);
  assert.equal(shown.phase, 'plan');
  assert.equal(before.round.cities[1].sides[2].length, 1);
  assert.deepEqual(before.round.folded, [false, false, false]);
  // A plain fold keeps the stake on screen (it doesn't double), but the pot takes the folded stake.
  const plain = pulledOut(before, [2], { ...after, round: { ...after.round, stake: 9 } });
  assert.equal(plain.round.stake, before.round.stake);
  assert.equal(plain.round.called, before.round.called);
});

test('the First flip coin sits with the first seat still in from the holder (a folded holder flips nothing)', () => {
  const s = E.newMatch({ seed: 5, seats: 3, cities: ['monaco', 'zurich', 'hongkong'] });
  play(s, ['heavy', 0], ['sleeper', 0], ['mole', 1]);
  assert.equal(s.round.initiative, 1);
  assert.equal(firstFlip(E.viewFor(s, 0)), 1);
  assert.ok(E.fold(s, 1));
  const v = E.viewFor(s, 0);
  assert.equal(v.round.initiative, 1, 'the engine keeps the holder; it skips folded seats as it resolves');
  assert.equal(firstFlip(v), 2);
  const label = (x) => ['You', 'Teal', 'Cobalt'][x];
  assert.ok(!coinHTML(v, 1, { label }).includes('first-flip'));
  assert.ok(coinHTML(v, 2, { label }).includes('aria-label="First flip: Cobalt"'));
});
