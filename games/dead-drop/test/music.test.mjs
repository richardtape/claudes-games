import test from 'node:test';
import assert from 'node:assert/strict';
import { BPM, FORM, sectionAt, levelFor, tableNotes, titleNotes, lobbyNotes, FLOURISH, phraseNotes, CUES } from '../js/music.js';
import { CITIES } from '../js/data.js';

const bar = (b, level, rand = () => 0.99) => Array.from({ length: 16 }, (_, s) => tableNotes(b, s, level, rand)).flat();
const voices = (notes) => [...new Set(notes.map((n) => n.voice))].sort();
const end = (notes) => Math.max(...notes.map((n) => n.t + n.dur));

test('the form: a 4-bar intro once, then a 28-bar cycle', () => {
  assert.deepEqual(FORM, [['intro', 4], ['A', 8], ['A2', 8], ['B', 8], ['break', 4]]);
  assert.deepEqual(sectionAt(0), { id: 'intro', bar: 0, pass: 0 });
  assert.deepEqual(sectionAt(4), { id: 'A', bar: 0, pass: 0 });
  assert.deepEqual(sectionAt(31), { id: 'break', bar: 3, pass: 0 });
  assert.deepEqual(sectionAt(32), { id: 'A', bar: 0, pass: 1 });
});

test('nothing repeats for about 90 seconds: the second pass differs, the third repeats the first', () => {
  let differs = false;
  for (let b = 4; b < 32; b++) {
    assert.deepEqual(bar(b, 2), bar(b + 56, 2), `bar ${b}`);
    if (JSON.stringify(bar(b, 2)) !== JSON.stringify(bar(b + 28, 2))) differs = true;
  }
  assert.ok(differs);
  assert.ok(((4 + 56) * 16 * 60) / BPM / 4 >= 88);
});

test('the music follows the round', () => {
  const v = (turn, stake = 1, phase = 'plan') => ({ phase, round: { turn, stake } });
  assert.deepEqual([v(1), v(3), v(5), v(2, 2), v(6), v(4, 1, 'round-over')].map(levelFor), [0, 1, 2, 2, 'final', 'break']);
  for (let b = 0; b < 60; b++) {
    assert.ok(voices(bar(b, 0)).every((x) => ['bass', 'hat'].includes(x)), `level 0, bar ${b}`);
    assert.ok(voices(bar(b, 'final')).every((x) => ['heart', 'tick'].includes(x)), `final, bar ${b}`);
  }
  assert.deepEqual(voices(bar(0, 2)), ['bass'], 'the intro is bass alone');
  assert.ok(voices(bar(12, 2)).includes('brass') && !voices(bar(12, 1)).includes('brass'), 'brass in A2 from level 2');
});

test('random fills touch only the last bar of a phrase', () => {
  assert.deepEqual(bar(4, 1, () => 0), bar(4, 1, () => 0.99));
  assert.notDeepEqual(bar(7, 1, () => 0), bar(7, 1, () => 0.99));
});

test('a one-bar flourish for every city, Vienna in 3', () => {
  for (const c of CITIES) {
    assert.ok(FLOURISH[c.id], c.id);
    const notes = phraseNotes(FLOURISH[c.id]);
    assert.ok(notes.length >= 3 && end(notes) <= 1.2, `${c.id}: ${end(notes)} s`);
  }
  assert.equal(FLOURISH.vienna.beats, 3);
});

test('cues: spy chord, short victory and defeat, bossa clave in the lobby', () => {
  assert.deepEqual(CUES.spyChord, [0, 3, 7, 11, 14]);
  for (const k of ['victory', 'defeat']) assert.ok(end(phraseNotes(CUES[k])) <= 3, k);
  const rim = [...Array(16).keys()].filter((s) => lobbyNotes(0, s, () => 0.99).some((n) => n.voice === 'rim'));
  assert.deepEqual(rim, [0, 3, 6, 10, 13]);
  assert.ok([...Array(16).keys()].some((s) => titleNotes(0, s, () => 0.99).length));
});
