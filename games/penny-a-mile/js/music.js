// A ragtime loop for the layout, in the spirit of Transport Tycoon's soundtrack: stride bass, honky
// -tonk chord stabs and a syncopated tune over a 16-bar progression (about 34 s at 112 bpm).
// Played on shared/seq.js; quiet, muteable on its own, and silent in a hidden tab.
import { createSequencer } from '../../../shared/seq.js';

const BPM = 112;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// Chords as MIDI notes: root for the bass, and the chord tones.
const CH = {
  C: { root: 48, tones: [60, 64, 67] },
  A7: { root: 45, tones: [61, 64, 67] },
  D7: { root: 50, tones: [60, 62, 66] },
  G7: { root: 43, tones: [59, 62, 65] },
  C7: { root: 48, tones: [58, 64, 67] },
  F: { root: 41, tones: [60, 65, 69] },
  Fm: { root: 41, tones: [60, 65, 68] },
};
// Sixteen bars: A A' then the bridge.
const BARS = ['C', 'A7', 'D7', 'G7', 'C', 'A7', 'D7', 'G7', 'F', 'F', 'C', 'C', 'D7', 'D7', 'G7', 'C'];
// Melody rhythms within a bar (sixteenth-note steps); the syncopation is the ragtime.
const RHYTHM = [
  [0, 3, 6, 8, 11, 14],
  [0, 2, 3, 6, 10, 12],
  [0, 3, 6, 9, 12],
  [0, 6, 8, 14],
];
const SHAPE = [
  [0, 1, 2, 3, 2, 1],
  [3, 2, 1, 2, 0, 1],
  [1, 2, 3, 4, 3],
  [2, 1, 0, 0],
];

/** The tune as notes: [step, midi, lengthInSteps]. */
function compose() {
  const notes = [];
  BARS.forEach((name, b) => {
    const ch = CH[name];
    const last = b === BARS.length - 1;
    const half = b === 7;
    const pick = last ? 3 : half ? 3 : [0, 1, 2, 1, 0, 2, 1, 3, 1, 0, 2, 1, 0, 2, 1, 3][b];
    const rhythm = RHYTHM[pick];
    const shape = SHAPE[pick];
    // Melody tones an octave above the chord, with the octave on top.
    const pool = [...ch.tones.map((t) => t + 12), ch.tones[0] + 24];
    rhythm.forEach((st, i) => {
      const len = (rhythm[i + 1] ?? 16) - st;
      const n = pool[Math.min(pool.length - 1, shape[i] ?? 0)];
      notes.push([b * 16 + st, n, len]);
    });
  });
  return notes;
}

export function createMusic(sfx, saved) {
  let on = saved.get('music', true);
  const tune = new Map();
  for (const [st, n, len] of compose()) tune.set(st, [n, len]);
  const seq = createSequencer(sfx, {
    bpm: BPM,
    steps: BARS.length * 16,
    onStep(step, at) {
      const bar = Math.floor(step / 16);
      const beat = step % 16;
      const ch = CH[BARS[bar]];
      const sx = 15 / BPM; // a sixteenth, in seconds
      // Stride: low root on 1, a fifth on 3, chord stabs on 2 and 4.
      if (beat === 0 || beat === 8) {
        const n = beat === 0 ? ch.root : ch.root + 7;
        sfx.tone({ freq: midi(n), type: 'triangle', dur: sx * 3.5, vol: 0.045, at });
      }
      if (beat === 4 || beat === 12) {
        for (const t of ch.tones) sfx.tone({ freq: midi(t), type: 'square', dur: sx * 1.4, vol: 0.007, at });
        for (const t of ch.tones) sfx.tone({ freq: midi(t), type: 'triangle', dur: sx * 1.6, vol: 0.013, at });
      }
      const m = tune.get(step);
      if (m) {
        const [n, len] = m;
        // A bright piano-ish voice: triangle plus a quiet detuned square.
        sfx.tone({ freq: midi(n), type: 'triangle', dur: Math.min(0.6, sx * len * 0.95), vol: 0.036, at });
        sfx.tone({ freq: midi(n) * 1.004, type: 'square', dur: Math.min(0.25, sx * len * 0.6), vol: 0.005, at });
      }
    },
  });
  return {
    /** Plays when it should (on the layout, page visible, music on); otherwise stops. */
    sync(want) {
      if (want && on) {
        if (!seq.playing && sfx.now() !== null) seq.start();
      } else if (seq.playing) seq.stop();
    },
    toggle() {
      on = !on;
      saved.set('music', on);
      if (!on) seq.stop();
      return on;
    },
    get on() {
      return on;
    },
  };
}
