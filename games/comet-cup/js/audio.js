// The music of the spheres: every world rings a note of D major pentatonic when the comet
// passes it (big worlds low, small ones high), plus the shot's sound effects.
import { createSfx } from '../../../shared/sfx.js';

// D major pentatonic across two and a half octaves, as semitones from A4.
const SCALE = [-19, -17, -15, -12, -10, -7, -5, -3, 0, 2, 5, 7, 9, 12];
const hz = (semi) => 440 * 2 ** (semi / 12);

/** Note (Hz) for a world of radius r: radius 125 sings lowest, 28 highest. */
export function worldNote(r) {
  const k = Math.max(0, Math.min(1, (125 - r) / 97));
  return hz(SCALE[Math.round(k * (SCALE.length - 1))]);
}

export function createAudio(slug) {
  const sfx = createSfx(slug, { volume: 0.55 });

  /** A glassy bell: a sine, a soft octave and an inharmonic shimmer. */
  function bell(freq, { vol = 0.2, dur = 1.8, at = null, delay = 0 } = {}) {
    sfx.tone({ freq, type: 'sine', dur, vol, attack: 0.004, at, delay });
    sfx.tone({ freq: freq * 2, type: 'sine', dur: dur * 0.55, vol: vol * 0.28, attack: 0.004, at, delay });
    sfx.tone({ freq: freq * 2.76, type: 'sine', dur: dur * 0.3, vol: vol * 0.12, attack: 0.002, at, delay });
  }

  return {
    sfx,
    bell,
    pass(r, close, speed) {
      const vol = 0.05 + 0.2 * close * Math.min(1, speed / 260 + 0.3);
      bell(worldNote(r), { vol, dur: 1.2 + close * 1.4 });
    },
    launch(power) {
      sfx.noise({ dur: 0.22, vol: 0.12 + power * 0.18, freq: 500, to: 2600 + power * 2000, type: 'bandpass', q: 0.8 });
      sfx.tone({ freq: 180 + power * 120, to: 420 + power * 380, type: 'triangle', dur: 0.16, vol: 0.08 });
    },
    bounce(v, rock) {
      const k = Math.min(1, v / 400);
      if (rock) {
        sfx.noise({ dur: 0.06, vol: 0.1 + k * 0.2, freq: 2600, type: 'bandpass', q: 3 });
        sfx.tone({ freq: 880 + k * 300, type: 'triangle', dur: 0.05, vol: 0.06 + k * 0.08 });
      } else {
        sfx.noise({ dur: 0.1, vol: 0.12 + k * 0.25, freq: 420, type: 'lowpass' });
        sfx.tone({ freq: 140 - k * 30, to: 90, type: 'sine', dur: 0.12, vol: 0.12 + k * 0.18 });
      }
    },
    lip() {
      sfx.tone({ freq: 1250, type: 'triangle', dur: 0.04, vol: 0.1 });
      sfx.tone({ freq: 1050, type: 'triangle', dur: 0.05, vol: 0.09, delay: 0.06 });
      sfx.noise({ dur: 0.05, vol: 0.08, freq: 3000, type: 'bandpass', q: 4, delay: 0.03 });
    },
    rest() {
      sfx.tone({ freq: 660, type: 'sine', dur: 0.08, vol: 0.04 });
    },
    sink(notes = []) {
      sfx.noise({ dur: 0.08, vol: 0.18, freq: 320, type: 'lowpass' });
      sfx.tone({ freq: 196, to: 98, type: 'sine', dur: 0.25, vol: 0.2 });
      const chord = [hz(-7), hz(-3), hz(0), hz(5)]; // D F# A D
      chord.forEach((f, i) => bell(f, { vol: 0.13, dur: 2.6, delay: 0.12 + i * 0.05 }));
      // The shot's melody, played back over the chord.
      notes.slice(0, 10).forEach((f, i) => bell(f * 2, { vol: 0.07, dur: 1.2, delay: 0.5 + i * 0.13 }));
    },
    ace(notes = []) {
      const run = notes.length ? notes : [hz(-7), hz(-3), hz(0)];
      run.slice(0, 12).forEach((f, i) => bell(f, { vol: 0.14, dur: 1.5, delay: 0.1 + i * 0.11 }));
      const end = 0.25 + Math.min(12, run.length) * 0.11;
      [hz(-19), hz(-7), hz(-3), hz(0), hz(5), hz(9)].forEach((f, i) => bell(f, { vol: 0.12, dur: 3.2, delay: end + i * 0.06 }));
    },
    burn() {
      sfx.noise({ dur: 0.9, vol: 0.28, freq: 3000, to: 400, type: 'bandpass', q: 0.7 });
      sfx.tone({ freq: 220, to: 55, type: 'sawtooth', dur: 0.7, vol: 0.06 });
    },
    swallow() {
      sfx.tone({ freq: 260, to: 30, type: 'sine', dur: 1.2, vol: 0.3 });
      sfx.tone({ freq: 390, to: 45, type: 'triangle', dur: 1.0, vol: 0.08 });
      sfx.noise({ dur: 1.0, vol: 0.12, freq: 900, to: 80, type: 'lowpass' });
    },
    lost() {
      sfx.tone({ freq: 700, to: 260, type: 'sine', dur: 0.7, vol: 0.12 });
    },
    warp() {
      sfx.tone({ freq: 300, to: 1200, type: 'sine', dur: 0.3, vol: 0.12 });
      sfx.tone({ freq: 450, to: 1800, type: 'triangle', dur: 0.3, vol: 0.05, delay: 0.03 });
    },
    halt() {
      sfx.tone({ freq: 520, to: 440, type: 'sine', dur: 0.4, vol: 0.06 });
    },
    click() {
      sfx.tone({ freq: 900, type: 'triangle', dur: 0.03, vol: 0.05 });
    },
    tick(notch = 5) {
      sfx.tone({ freq: 700 + notch * 90, type: 'sine', dur: 0.02, vol: 0.03 });
    },
  };
}
