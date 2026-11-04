// Every sound in Touch Paper, synthesized on shared/sfx.js.
import { createSfx, note } from '../../../shared/sfx.js';

// C major pentatonic, climbing with each shell loaded.
const PENTA = [0, 2, 4, 7, 9];
const pent = (i) => note(PENTA[i % 5] + 12 * Math.floor(i / 5) + 3 - 12); // from C4

export function createAudio(slug) {
  const sfx = createSfx(slug, { volume: 0.55 });
  let bed = null;
  let bedOn = false;
  let popTimer = 0;

  return {
    sfx,
    /** A card laid on the fuse; `n` is its place in the volley (1-based). */
    load(n, { hand = false } = {}) {
      sfx.noise({ dur: 0.04, vol: 0.18, freq: 3200, type: 'highpass' });
      sfx.tone({ freq: pent(n + 4), type: 'triangle', dur: 0.22, vol: 0.16 });
      sfx.tone({ freq: pent(n + 4) * 2, type: 'sine', dur: 0.12, vol: 0.05, delay: 0.01 });
      if (hand) sfx.tone({ freq: pent(n + 6), type: 'sine', dur: 0.15, vol: 0.06, delay: 0.05 });
    },
    flip() {
      sfx.noise({ dur: 0.05, vol: 0.08, freq: 2400, type: 'bandpass', q: 2 });
    },
    nope() {
      sfx.tone({ freq: 160, to: 120, type: 'square', dur: 0.09, vol: 0.06 });
    },
    /** Match strike and fizz. */
    strike() {
      sfx.noise({ dur: 0.12, vol: 0.32, freq: 2200, to: 6000, type: 'bandpass', q: 1.5 });
      sfx.noise({ dur: 0.5, vol: 0.12, freq: 5000, type: 'highpass', delay: 0.08, attack: 0.04 });
    },
    /** A rocket leaving: whoosh (and sometimes a whistle). */
    launch(i = 0, { whistle = false } = {}) {
      const v = 0.12 + Math.min(0.08, i * 0.01);
      sfx.noise({ dur: 0.5, vol: v, freq: 500, to: 2600, type: 'bandpass', q: 0.8, attack: 0.05 });
      if (whistle) sfx.tone({ freq: 900, to: 2400, type: 'sine', dur: 0.7, vol: 0.05, attack: 0.08 });
    },
    /** A shell bursting: thump, crack, and a scatter of crackle. `size` 1 normal, 2+ big. */
    burst(i = 0, { size = 1, crackle = 8 } = {}) {
      const s = Math.min(3, size);
      sfx.tone({ freq: 110 - s * 12, to: 38, type: 'sine', dur: 0.35 + s * 0.12, vol: 0.22 + s * 0.08 });
      sfx.noise({ dur: 0.35 + s * 0.15, vol: 0.2 + s * 0.08, freq: 1800, to: 240, type: 'lowpass' });
      // the shell's own note, climbing with its place in the volley
      sfx.tone({ freq: pent(i + 6), type: 'sine', dur: 0.5, vol: 0.05, delay: 0.02 });
      for (let k = 0; k < crackle * s; k++) {
        sfx.noise({ dur: 0.012, vol: 0.05 + Math.random() * 0.05, freq: 4000 + Math.random() * 4000, type: 'highpass', delay: 0.25 + Math.random() * (0.6 + s * 0.3) });
      }
    },
    /** A named shell blooming: a glockenspiel figure. */
    named(rank = 0) {
      const base = 12 + rank * 2;
      [0, 4, 7, 12].forEach((st, k) => {
        sfx.tone({ freq: note(base + st), type: 'triangle', dur: 0.5, vol: 0.12, delay: k * 0.07 });
        sfx.tone({ freq: note(base + st + 12), type: 'sine', dur: 0.35, vol: 0.04, delay: k * 0.07 });
      });
    },
    /** The crowd's "ooh" for a big volley (a soft vowel swell). */
    ooh(size = 1) {
      const v = Math.min(0.09, 0.03 * size);
      sfx.noise({ dur: 0.9, vol: v, freq: 420, to: 330, type: 'bandpass', q: 6, attack: 0.25 });
      sfx.noise({ dur: 0.9, vol: v * 0.7, freq: 900, to: 700, type: 'bandpass', q: 7, attack: 0.25 });
    },
    stamp() {
      sfx.tone({ freq: 90, to: 50, type: 'sine', dur: 0.2, vol: 0.3 });
      sfx.noise({ dur: 0.08, vol: 0.2, freq: 900, type: 'lowpass' });
    },
    fanfare() {
      sfx.arp([note(3), note(7), note(10), note(15)], { step: 0.11, type: 'triangle', dur: 0.4, vol: 0.14 });
    },
    sad() {
      sfx.arp([note(0), note(-2), note(-5)], { step: 0.18, type: 'triangle', dur: 0.5, vol: 0.12 });
    },
    pick() {
      sfx.tone({ freq: 660, to: 990, type: 'triangle', dur: 0.1, vol: 0.1 });
    },
    /** The bonfire's crackle under everything; only while the page is visible. */
    bonfire(on) {
      if (on === bedOn) return;
      bedOn = on;
      if (on) {
        bed = sfx.hold({ kind: 'noise', freq: 380, q: 0.7 });
        bed?.set({ vol: 0.035 }, 1.2);
        const pop = () => {
          if (!bedOn) return;
          if (Math.random() < 0.7) sfx.noise({ dur: 0.02 + Math.random() * 0.03, vol: 0.03 + Math.random() * 0.06, freq: 1200 + Math.random() * 3000, type: 'bandpass', q: 3 });
          popTimer = setTimeout(pop, 120 + Math.random() * 600);
        };
        pop();
      } else {
        clearTimeout(popTimer);
        bed?.stop(0.4);
        bed = null;
      }
    },
    get bedOn() {
      return bedOn;
    },
  };
}
