import test from 'node:test';
import assert from 'node:assert/strict';
import { ADJECTIVES, NOUNS, PACKAGES, operation, cable, twistText, DOSSIERS, REMARKS, EPILOGUE } from '../js/story.js';
import { RIVALS, TWISTS } from '../js/data.js';

test('word lists: enough of each, no repeats', () => {
  for (const [list, n] of [[ADJECTIVES, 40], [NOUNS, 40], [PACKAGES, 20]]) {
    assert.ok(list.length >= n);
    assert.equal(new Set(list.map((w) => w.toUpperCase())).size, list.length);
  }
  assert.ok([...ADJECTIVES, ...NOUNS].every((w) => /^[A-Za-z]+$/.test(w)));
  assert.ok(PACKAGES.every((p) => p.length <= 28));
});

test('operations: the same for every player of a match, varied across matches', () => {
  assert.deepEqual(operation('abcd1234', 2), operation('abcd1234', 2));
  const names = new Set(Array.from({ length: 50 }, (_, i) => operation(`m${i}`, 0).name));
  assert.ok(names.size >= 40);
});

test('the cable', () => {
  const view = { matchId: 'abcd1234', roundNo: 0, round: { cities: [{ id: 'lisbon' }, { id: 'vienna' }, { id: 'havana' }], film: 1 } };
  const { name, package: pkg } = operation('abcd1234', 0);
  assert.equal(cable(view), `OPERATION ${name.toUpperCase()}. PACKAGE: ${pkg.toUpperCase()}. SITES: LISBON, VIENNA, HAVANA. THE FILM TRAVELS VIA VIENNA. — C`);
  assert.ok(!cable({ ...view, round: { ...view.round, film: null } }).includes('FILM'));
});

test('every rival has a dossier and remarks; twists read from the data', () => {
  for (const r of RIVALS) {
    assert.ok(DOSSIERS[r.id]);
    for (const k of ['start', 'escalate', 'fold', 'won', 'lost']) assert.ok(REMARKS[r.id][k].length >= 2 && REMARKS[r.id][k].every((l) => l.length <= 60), `${r.id} ${k}`);
  }
  assert.equal(twistText('wren'), null);
  assert.match(twistText('magpie'), /Lookout/);
  const was = TWISTS.magpie.kind;
  TWISTS.magpie.kind = 'jammer';
  try { assert.match(twistText('magpie'), /Jammer/); } finally { TWISTS.magpie.kind = was; }
  // A match's own twist (the view's, seat and all) wins over the data.
  assert.match(twistText('control'), /sees three cards in your hand/);
  assert.equal(twistText('control', { seat: 1, id: 'seen', count: 1 }), 'Each round, Control sees one card in your hand.');
  assert.equal(twistText('control', null), null);
  assert.ok(EPILOGUE.join(' ').includes('C'));
});
