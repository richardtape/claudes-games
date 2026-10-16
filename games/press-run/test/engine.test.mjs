import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { prepareCandidates, bestPlays } from '../js/solver.js';
import { roundTarget } from '../js/data.js';

const DICT = new Set(['cat', 'cats', 'quit', 'quilt', 'tea', 'eat', 'ate', 'teas', 'seat', 'east', 'zebra', 'zebras', 'add', 'aaa']);

/** A run sitting in a round with a hand we control. */
function rigged(letters, { dingbats = [], editor = null, inks = {} } = {}) {
  const run = E.createRun('TEST-0001');
  E.chooseStarter(run, run.starter[0]);
  run.dingbats = dingbats.map((id, i) => ({ uid: 9000 + i, id, counter: 0 }));
  const uids = letters.map((l, i) => E.addTile(run, l, inks[i] || null));
  run.round.hand = uids;
  run.round.editor = editor;
  return { run, uids };
}

test('a new run has a 57-tile case and offers 3 starter dingbats', () => {
  const run = E.createRun('SEED-1234');
  assert.equal(run.caseIds.length, 57);
  assert.equal(run.starter.length, 3);
  assert.equal(run.phase, 'starter');
});

test('choosing a starter deals a hand with at least two vowels', () => {
  for (let s = 0; s < 40; s++) {
    const run = E.createRun(`V-${s}`);
    assert.ok(E.chooseStarter(run, run.starter[1]));
    assert.equal(run.phase, 'round');
    assert.equal(run.round.hand.length, 8);
    const vowels = E.handTiles(run).filter((t) => 'aeiou'.includes(t.letter)).length;
    assert.ok(vowels >= 2, `seed ${s} dealt ${vowels} vowels`);
  }
});

test('checkWord accepts dictionary words and rejects the rest', () => {
  const { run, uids } = rigged(['c', 'a', 't', 's']);
  assert.equal(E.checkWord(run, uids.slice(0, 3), [], DICT).ok, true);
  assert.equal(E.checkWord(run, [uids[1], uids[0], uids[2]], [], DICT).ok, false);
  assert.equal(E.checkWord(run, uids.slice(0, 2), [], DICT).reason, 'At least 3 letters');
});

test('the Qu tile spells two letters', () => {
  const { run, uids } = rigged(['qu', 'i', 't']);
  const chk = E.checkWord(run, uids, [], DICT);
  assert.equal(chk.ok, true);
  assert.equal(chk.word, 'quit');
  const res = E.scorePlay(run, uids, chk.letters);
  assert.equal(res.ctx.len, 4); // counts as a 4-letter word
});

test('a blank finds a letter that makes a word, or uses the one assigned', () => {
  const { run, uids } = rigged(['c', '?', 't']);
  const auto = E.checkWord(run, uids, [], DICT);
  assert.equal(auto.ok, true);
  assert.equal(auto.word, 'cat');
  assert.equal(E.checkWord(run, uids, [undefined, 'o'], DICT).ok, false); // "cot" not in test dict
});

test('base score: 3 letters = 10 Ink × 1 Pressure plus tile ink', () => {
  const { run, uids } = rigged(['c', 'a', 't']);
  const res = E.scorePlay(run, uids, ['c', 'a', 't']);
  // c=6, a=2, t=2 -> 10 + 10 = 20 ink, x1
  assert.equal(res.ink, 20);
  assert.equal(res.pressure, 1);
  assert.equal(res.score, 20);
  assert.equal(res.steps.at(-1).kind, 'total');
});

test('dingbats, inks and retriggers apply in order', () => {
  const { run, uids } = rigged(['c', 'a', 't'], { dingbats: ['fleuron', 'hedera'], inks: { 1: 'emboss', 2: 'cyan' } });
  const res = E.scorePlay(run, uids, ['c', 'a', 't']);
  // ink: 10 base + c6 + a2 + a2 (emboss) + t2 + 20 cyan = 42
  // pressure: 1 + 4 (fleuron) = 5, then x1.5 (hedera) = 7.5
  assert.equal(res.ink, 42);
  assert.equal(res.pressure, 7.5);
  assert.equal(res.score, 315);
});

test('the Censor blacks out the banned letter', () => {
  const { run, uids } = rigged(['c', 'a', 't'], { editor: 'censor' });
  run.round.banned = ['c'];
  const res = E.scorePlay(run, uids, ['c', 'a', 't']);
  assert.equal(res.ink, 14); // c scores nothing
  assert.ok(res.steps.some((s) => s.debuffed));
});

test('The Minimalist and The Wordsmith limit word length', () => {
  const a = rigged(['z', 'e', 'b', 'r', 'a', 's'], { editor: 'minimalist' });
  assert.equal(E.checkWord(a.run, a.uids, [], DICT).ok, false);
  const b = rigged(['c', 'a', 't'], { editor: 'wordy' });
  assert.equal(E.checkWord(b.run, b.uids, [], DICT).ok, false);
});

test('printing scores, spends a print, refills the hand and can clear the round', () => {
  const { run, uids } = rigged(['c', 'a', 't', 's']);
  run.round.target = 30;
  const before = run.round.printsLeft;
  const out = E.print(run, uids, [], DICT);
  assert.equal(out.ok, true);
  assert.equal(run.round.printsLeft, before - 1);
  assert.ok(run.round.score >= 30);
  assert.equal(run.phase, 'cleared');
  assert.ok(run.round.payout.total >= 3);
  const money = run.money;
  E.collect(run);
  assert.equal(run.money, money + run.round.payout.total);
  assert.equal(run.phase, 'shop');
  assert.ok(run.shop.offers.length >= 4);
});

test('running out of prints below target ends the run', () => {
  const { run, uids } = rigged(['c', 'a', 't']);
  run.round.target = 10_000;
  run.round.printsLeft = 1;
  E.print(run, uids, [], DICT);
  assert.equal(run.phase, 'over');
});

test('redraw replaces tiles and feeds the Recycler', () => {
  const { run, uids } = rigged(['c', 'a', 't'], { dingbats: ['recycler'] });
  run.round.bag = E.createRun('BAG').caseIds.map((id) => E.addTile(run, 'e'));
  const left = run.round.redrawsLeft;
  E.redraw(run, [uids[0]]);
  assert.equal(run.round.redrawsLeft, left - 1);
  assert.ok(!run.round.hand.includes(uids[0]));
  assert.equal(run.dingbats[0].counter, 1);
});

test('shop: buying costs money, sold items cannot be rebought, selling refunds half', () => {
  const { run } = rigged(['c', 'a', 't']);
  run.phase = 'cleared';
  run.round.payout = { lines: [], total: 0 };
  run.money = 100;
  E.collect(run);
  const i = run.shop.offers.findIndex((o) => o.type === 'dingbat');
  const cost = run.shop.offers[i].cost;
  assert.equal(E.buy(run, i).ok, true);
  assert.equal(run.money, 100 - cost);
  assert.equal(E.buy(run, i).ok, false);
  const inst = run.dingbats.at(-1);
  E.sell(run, inst.uid);
  assert.equal(run.money, 100 - cost + Math.max(1, Math.floor(cost / 2)));
  const rc = run.shop.rerollCost;
  E.reroll(run);
  assert.equal(run.shop.rerollCost, rc + 1);
});

test('a saved run resumes deterministically', () => {
  const a = E.createRun('SAVE-0001');
  E.chooseStarter(a, a.starter[0]);
  const b = JSON.parse(JSON.stringify(a));
  E.redraw(a, a.round.hand.slice(0, 3));
  E.redraw(b, b.round.hand.slice(0, 3));
  assert.deepEqual(a.round.hand, b.round.hand);
});

test('targets climb every round and edition', () => {
  let prev = 0;
  for (let e = 1; e <= 8; e++)
    for (let r = 0; r < 3; r++) {
      const t = roundTarget(e, r);
      assert.ok(t > prev, `edition ${e} round ${r}: ${t} <= ${prev}`);
      prev = t;
    }
});

test('solver finds the best formable word', () => {
  const { run } = rigged(['z', 'e', 'b', 'r', 'a', 't', 's', 'c']);
  const plays = bestPlays(run, E.handTiles(run), prepareCandidates([...DICT]));
  assert.equal(plays[0].word, 'zebras');
});
