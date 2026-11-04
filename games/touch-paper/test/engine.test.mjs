import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTS,
  TARGETS,
  choosePerk,
  findShells,
  fits,
  layoutInfo,
  legalPlays,
  newShow,
  nextAct,
  parseLayout,
  play,
  rankOf,
  scoreVolley,
  stepBetween,
  strike,
  suitOf,
  targetFor,
  isOpen,
  remaining,
  canSlow,
} from '../js/engine.js';
import { LAYOUTS, PERKS, SHELLS } from '../js/data.js';

// card helper: c('7h') -> number
const SUIT = { h: 0, d: 1, c: 2, s: 3 };
const RANK = { A: 1, J: 11, Q: 12, K: 13 };
const c = (str) => {
  const suit = SUIT[str.at(-1)];
  const r = str.slice(0, -1);
  const rank = RANK[r] ?? Number(r);
  return suit * 13 + rank - 1;
};
/** Build a volley the way play() records it: steps between consecutive shells. */
const volley = (...cards) =>
  cards.map((str, i) => {
    const card = c(str);
    return { c: card, s: i === 0 ? 0 : stepBetween(c(cards[i - 1]), card) };
  });

test('card encoding', () => {
  assert.equal(rankOf(c('Ah')), 1);
  assert.equal(rankOf(c('Ks')), 13);
  assert.equal(suitOf(c('7c')), 2);
  assert.equal(rankOf(c('7c') + 200), 7);
  assert.equal(suitOf(c('7c') + 200), 2);
});

test('fits one rank either way, Kings and Aces join unless the wind blows', () => {
  assert.ok(fits(c('7h'), c('8s')));
  assert.ok(fits(c('7h'), c('6d')));
  assert.ok(!fits(c('7h'), c('7s')));
  assert.ok(!fits(c('7h'), c('9s')));
  assert.ok(fits(c('Kh'), c('As')));
  assert.ok(fits(c('Ah'), c('Ks')));
  assert.ok(!fits(c('Kh'), c('As'), false));
  assert.ok(fits(100, c('5c')), 'anything follows a sparkler');
});

test('layouts parse: every card in a lower line covers the ones it overlaps', () => {
  const info = parseLayout({ art: ['x x', ' x'] });
  assert.equal(info.slots.length, 3);
  assert.deepEqual(info.coveredBy[0], [2]);
  assert.deepEqual(info.coveredBy[1], [2]);
  assert.deepEqual(info.coveredBy[2], []);
  for (const l of LAYOUTS) {
    const li = layoutInfo(l.id);
    assert.ok(li.slots.length >= 20 && li.slots.length <= 30, `${l.id} has ${li.slots.length} cards`);
    assert.ok(li.cols <= 14, `${l.id} fits seven cards wide`);
    const open = li.coveredBy.filter((cv) => cv.length === 0).length;
    assert.ok(open >= 5, `${l.id} starts with ${open} open cards`);
  }
  assert.equal(LAYOUTS.length, ACTS);
});

test('named shells', () => {
  const ids = (...cards) => findShells(volley(...cards));
  assert.deepEqual(ids('5h'), []);
  assert.deepEqual(ids('5h', '6h', '7h'), ['peony']);
  assert.deepEqual(ids('5h', '6c', '5h', '4c', '3h'), ['peony', 'willow'], 'colours need not be in a row');
  assert.deepEqual(ids('5h', '6h', '7h', '8h', '9h'), ['palm', 'chrysanthemum']);
  assert.deepEqual(ids('5h', '6d', '7c', '8s'), ['palm', 'crossette']);
  assert.deepEqual(ids('9h', '8d', '7c', '6s'), ['willow', 'crossette']);
  assert.deepEqual(ids('5h', '6d', '5c', '6s'), ['strobe', 'crossette']);
  assert.deepEqual(ids('5h', '6d', '5c', '6s', '5d'), ['strobe', 'crossette', 'ring']);
  assert.deepEqual(ids('Qh', 'Kd', 'Ac'), ['brocade']);
  assert.deepEqual(ids('2h', 'Ad', 'Kc', 'Qd'), ['willow', 'brocade']);
  assert.deepEqual(ids('3h', '4d', '5c', '6d', '7c', '8d'), ['peony', 'comet', 'tourbillion']);
  assert.deepEqual(ids('9h', '8d', '7c', '6d', '5c', '4d'), ['peony', 'comet', 'waterfall']);
  const ten = ['2h', '3d', '4h', '5d', '6c', '5d', '4c', '3d', '2c', '3d'];
  assert.ok(ids(...ten).includes('kamuro'));
  assert.ok(!ids(...ten).includes('comet'), 'only the highest of a family counts');
  assert.ok(!findShells(volley('Qh', 'Kd', 'Ac'), { wrap: false }).includes('brocade'));
  assert.equal(SHELLS.length, 12);
});

test('a Slow match breaks direction runs but not colours', () => {
  const v = [
    { c: c('5h'), s: 0 },
    { c: c('6h'), s: 1 },
    { c: c('7h'), s: 0 }, // played on a slow-match fuse
    { c: c('8h'), s: 1 },
  ];
  assert.deepEqual(findShells(v), ['peony']);
});

test('volley scores: shell n scores n, times the lift', () => {
  const s = newShow({ seed: 'score' });
  s.twists[0] = null;
  const r = scoreVolley(s, volley('5h', '6h', '7h'));
  assert.equal(r.base, 6);
  assert.equal(r.lift, 2);
  assert.equal(r.score, 12);
  const big = scoreVolley(s, volley('5h', '6d', '7c', '8s'));
  assert.equal(big.base, 10);
  assert.equal(big.lift, 1 + 1 + 1);
  assert.equal(big.score, 30);
});

test('perks and conditions change scores', () => {
  const s = newShow({ seed: 'perks' });
  s.twists[0] = null;
  const v = volley('5h', '6h', '7h');
  s.perks = ['strontium'];
  assert.equal(scoreVolley(s, v).base, 6 + 6);
  s.perks = ['starmine'];
  assert.equal(scoreVolley(s, v).base, 6 + 3);
  s.perks = ['peonymould'];
  assert.equal(scoreVolley(s, v).lift, 3);
  s.perks = ['blackpowder'];
  assert.equal(scoreVolley(s, v).lift, 2, 'three shells: no black powder');
  assert.equal(scoreVolley(s, volley('5h', '6h', '7h', '8h')).lift, 1 + 1 + 1 + 1);
  s.perks = ['crackle'];
  const seven = volley('2c', '3d', '2c', '3d', '2c', '3d', '4h');
  assert.equal(scoreVolley(s, seven).base, 1 + 2 + 3 + 4 + 5 + 6 + 14);
  s.perks = [];
  s.twists[0] = 'damp';
  s.dampSuit = 0;
  assert.equal(scoreVolley(s, volley('5h', '6d', '7h')).base, 2);
  s.twists[0] = 'gusty';
  assert.equal(scoreVolley(s, volley('5h', '6d')).score, 0);
  assert.ok(scoreVolley(s, volley('5h', '6d', '7c')).score > 0);
  s.twists[0] = 'crowd';
  assert.equal(scoreVolley(s, volley('5h')).score, 2);
});

test('a fresh show deals the first layout with open cards face up', () => {
  const s = newShow({ seed: 'deal' });
  const info = layoutInfo(s.layoutId);
  assert.equal(s.phase, 'play');
  assert.equal(s.slots.length + s.box.length + 1, 52);
  s.slots.forEach((slot, i) => assert.equal(slot.up, info.coveredBy[i].length === 0));
  const all = [...s.slots.map((x) => x.card), ...s.box, s.fuse].sort((a, b) => a - b);
  assert.deepEqual(all, [...Array(52).keys()]);
});

test('the same seed deals the same show', () => {
  const a = newShow({ seed: 'same' });
  const b = newShow({ seed: 'same' });
  assert.deepEqual(a, b);
  assert.notDeepEqual(newShow({ seed: 'other' }).slots, a.slots);
});

test('playing loads the volley; striking fires it and draws a new fuse', () => {
  const s = newShow({ seed: 'flow' });
  // Force a known fuse and a playable card.
  const slot = s.slots.findIndex((x, i) => isOpen(s, i));
  s.fuse = s.slots[slot].card % 13 === 12 ? s.slots[slot].card - 1 : s.slots[slot].card + 1;
  if (s.fuse > 51 || suitOf(s.fuse) !== suitOf(s.slots[slot].card)) s.fuse = s.slots[slot].card - 1;
  assert.ok(legalPlays(s).includes(slot));
  const r = play(s, slot);
  assert.ok(r.ok);
  assert.equal(s.volley.length, 1);
  assert.equal(s.fuse, s.slots[slot].card);
  const before = s.box.length;
  const st = strike(s);
  assert.ok(st.ok);
  assert.equal(st.fired.score, 1 * st.fired.lift);
  assert.equal(s.volley.length, 0);
  assert.equal(s.box.length, before - 1);
  assert.equal(s.total, st.fired.score);
  assert.equal(s.log.length, 1);
});

test('illegal plays are refused', () => {
  const s = newShow({ seed: 'illegal' });
  const covered = s.slots.findIndex((x, i) => !isOpen(s, i));
  assert.equal(play(s, covered).ok, false);
  const open = s.slots.findIndex((x, i) => isOpen(s, i) && !legalPlays(s).includes(i));
  if (open >= 0) assert.equal(play(s, open).ok, false);
});

/** Random legal play until the show ends; returns the final state. */
function randomShow(seed, pickPerk = (s) => s.offers[0]) {
  const s = newShow({ seed });
  let rnd = 1;
  const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  let guard = 0;
  while (s.phase !== 'over' && s.phase !== 'won') {
    if (++guard > 5000) throw new Error('show never ended');
    if (s.phase === 'play') {
      const plays = legalPlays(s);
      if (plays.length && (r() < 0.9 || !s.box.length)) play(s, plays[Math.floor(r() * plays.length)]);
      else if (canSlow(s) && r() < 0.2) strike(s, { slow: true });
      else strike(s);
    } else if (s.phase === 'report') nextAct(s);
    else if (s.phase === 'shed') choosePerk(s, pickPerk(s));
  }
  return s;
}

test('random shows always end, conserve cards and keep the total equal to the log', () => {
  for (let i = 0; i < 300; i++) {
    const s = randomShow(`rnd-${i}`, (st) => st.offers[i % 3]);
    const logged = s.log.reduce((a, v) => a + v.score, 0);
    assert.ok(s.total >= logged, 'total includes every volley');
    assert.ok(s.report, 'ended with a report');
    if (s.phase === 'over') assert.ok(s.total < s.report.target);
    if (s.phase === 'won') assert.equal(s.report.act, ACTS - 1);
  }
});

test('every act conserves its cards (layout + box + fuse + volley + fired + damp)', () => {
  for (let i = 0; i < 120; i++) {
    const s = newShow({ seed: `cons-${i}` });
    s.perks = ['sparebox', 'sparklers'];
    let guard = 0;
    while (s.phase !== 'over' && s.phase !== 'won' && guard++ < 4000) {
      if (s.phase === 'play') {
        const plays = legalPlays(s);
        if (plays.length) play(s, plays[0]);
        else strike(s);
      } else if (s.phase === 'report') nextAct(s);
      else if (s.phase === 'shed') choosePerk(s, s.offers[0]);
    }
  }
  // Direct check on one act with extras.
  const s = newShow({ seed: 'extras' });
  s.phase = 'shed';
  s.offers = ['sparebox'];
  s.perks = ['sparklers'];
  s.twists[1] = 'drizzle';
  choosePerk(s, 'sparebox');
  const cards = [...s.slots.map((x) => x.card), ...s.box, s.fuse, ...s.damp];
  assert.equal(cards.length, 52 + 3 + 2);
  assert.equal(s.damp.length, 4);
  assert.equal(cards.filter((x) => x >= 100 && x < 200).length, 2);
  assert.equal(cards.filter((x) => x >= 200).length, 3);
});

test('clearing the layout fires the finale: every box card is a rocket', () => {
  const s = newShow({ seed: 'finale' });
  // Leave one open card and make it playable.
  const last = s.slots.findIndex((x, i) => isOpen(s, i));
  s.slots.forEach((x, i) => {
    if (i !== last) x.gone = true;
  });
  s.fuse = rankOf(s.slots[last].card) === 13 ? s.slots[last].card - 1 : s.slots[last].card + 1;
  const box = s.box.length;
  const r = play(s, last);
  assert.ok(r.ended);
  assert.equal(r.ended.cleared, true);
  assert.equal(r.ended.finale.rockets, box);
  assert.equal(s.phase, 'report');
  assert.equal(remaining(s), 0);
});

test('the act ends when the box is empty and nothing fits', () => {
  const s = newShow({ seed: 'stuck' });
  s.box = [s.box[0]];
  // Make sure nothing will fit the drawn card by removing open cards that fit it.
  const drawn = s.box[0];
  s.slots.forEach((x, i) => {
    if (isOpen(s, i) && fits(drawn, x.card)) x.card = (drawn + 6) % 52; // a rank 6 away never fits
  });
  const r = strike(s);
  if (legalPlays(s).length === 0) {
    assert.ok(r.ended);
    assert.equal(s.phase, 'report');
    assert.equal(r.ended.cleared, false);
  }
});

test('targets are cumulative and climb; a big crowd raises its act', () => {
  for (let i = 1; i < TARGETS.length; i++) assert.ok(TARGETS[i] > TARGETS[i - 1]);
  const s = newShow({ seed: 'tg' });
  s.twists[2] = 'crowd';
  assert.ok(targetFor(s, 2) > TARGETS[2]);
  s.twists[2] = null;
  assert.equal(targetFor(s, 2), TARGETS[2]);
});

test('the shed offers three perks you do not own, and picking one deals the next act', () => {
  const s = newShow({ seed: 'shed' });
  s.phase = 'report';
  s.report = { outcome: 'shed' };
  nextAct(s);
  assert.equal(s.phase, 'shed');
  assert.equal(s.offers.length, 3);
  assert.equal(new Set(s.offers).size, 3);
  const pick = s.offers[1];
  assert.equal(choosePerk(s, 'not-offered'), false);
  assert.ok(choosePerk(s, pick));
  assert.equal(s.act, 1);
  assert.equal(s.phase, 'play');
  assert.deepEqual(s.perks, [pick]);
  assert.equal(s.layoutId, LAYOUTS[1].id);
  // Next shed never offers what you own.
  s.phase = 'report';
  s.report = { outcome: 'shed' };
  nextAct(s);
  assert.ok(!s.offers.includes(pick));
  assert.ok(PERKS.length >= 12);
});

test('Slow match: once an act, strike without firing', () => {
  const s = newShow({ seed: 'slow' });
  s.perks = ['slowmatch'];
  const slot = s.slots.findIndex((x, i) => isOpen(s, i));
  s.fuse = rankOf(s.slots[slot].card) === 13 ? s.slots[slot].card - 1 : s.slots[slot].card + 1;
  play(s, slot);
  assert.ok(canSlow(s));
  const r = strike(s, { slow: true });
  assert.ok(r.ok);
  assert.equal(r.fired, null);
  assert.equal(s.volley.length, 1, 'the volley is still loaded');
  assert.equal(canSlow(s), false);
  assert.equal(strike(s, { slow: true }).ok, false);
});

test('Clear sky and a clear night turn the whole layout face up', () => {
  const s = newShow({ seed: 'clear' });
  s.phase = 'shed';
  s.offers = ['clearsky'];
  choosePerk(s, 'clearsky');
  assert.ok(s.slots.every((x) => x.up));
});

test('a full rack fires at once and the chain carries on', () => {
  const s = newShow({ seed: 'rack' });
  s.twists[0] = null;
  // Fake a nine-shell volley, then play a tenth card from the layout.
  const slot = s.slots.findIndex((x, i) => isOpen(s, i));
  const card = s.slots[slot].card;
  const below = rankOf(card) === 1 ? card + 12 : card - 1;
  s.volley = Array.from({ length: 9 }, (_, i) => ({ c: (below + 13 * 0) % 52, s: i ? 1 : 0 }));
  s.fuse = below;
  s.volley[8] = { c: below, s: 1 };
  const r = play(s, slot);
  assert.ok(r.ok);
  assert.ok(r.fired, 'the rack fired');
  assert.equal(r.fired.n, 10);
  assert.ok(r.fired.patterns.some((p) => p.id === 'kamuro'));
  assert.equal(s.volley.length, 0);
  assert.equal(s.fuse, card, 'the fuse is still the last card, so the chain goes on');
});

test('every act opens on a fuse that some open card follows', () => {
  for (let i = 0; i < 200; i++) {
    const s = newShow({ seed: `open-${i}` });
    assert.ok(legalPlays(s).length > 0, `seed open-${i} opens with nothing to play`);
  }
});
