// Night Stitch sounds, all synthesized on shared/sfx.js: music-box plucks for caught moths,
// a zip for the cinch, a twang when thread snaps, a chiming clock, a quiet tick-tock.
import { createSfx, note } from '../../../shared/sfx.js';

// Major pentatonic from C5 upward, so any run of plucks sounds like a tune.
const PENTA = [0, 2, 4, 7, 9];
const pent = (i) => note(3 + PENTA[i % 5] + 12 * Math.floor(i / 5));

export function createAudio(slug) {
  const sfx = createSfx(slug, { volume: 0.55 });

  function pluck(i, { vol = 0.16, gilded = false } = {}) {
    const f = pent(i);
    sfx.tone({ freq: f, type: 'sine', dur: 0.55, vol });
    sfx.tone({ freq: f * 2, type: 'triangle', dur: 0.18, vol: vol * 0.35 });
    sfx.tone({ freq: f * 3.01, type: 'sine', dur: 0.08, vol: vol * 0.25 });
    if (gilded) sfx.arp([f * 2, f * 2.5, f * 3], { step: 0.05, type: 'sine', dur: 0.3, vol: vol * 0.5, delay: 0.04 });
  }

  return {
    sfx,
    pluck,
    /** The thread pulled tight. Bigger loops zip longer. */
    cinch(n) {
      const d = 0.09 + Math.min(0.12, n * 0.015);
      sfx.noise({ dur: d, vol: 0.16, freq: 1800, to: 6500, type: 'bandpass', q: 2.5 });
      sfx.tone({ freq: 300, to: 600, type: 'triangle', dur: d, vol: 0.05 });
    },
    grand() {
      [0, 4, 7, 12].forEach((s) => sfx.tone({ freq: note(3 + s), type: 'triangle', dur: 1.1, vol: 0.09, delay: 0.05 }));
      sfx.tone({ freq: note(3 - 12), type: 'sine', dur: 1.2, vol: 0.12 });
    },
    darn() {
      sfx.noise({ dur: 0.07, vol: 0.08, freq: 3000, type: 'highpass' });
      sfx.tone({ freq: note(-2), type: 'sine', dur: 0.2, vol: 0.06, delay: 0.03 });
    },
    snap() {
      sfx.tone({ freq: 330, to: 70, type: 'sawtooth', dur: 0.22, vol: 0.11 });
      sfx.noise({ dur: 0.05, vol: 0.22, freq: 4000, type: 'highpass' });
    },
    wax() {
      sfx.tone({ freq: 180, to: 140, type: 'sine', dur: 0.14, vol: 0.14 });
      sfx.noise({ dur: 0.08, vol: 0.06, freq: 700 });
    },
    startle() {
      for (let i = 0; i < 3; i++) sfx.noise({ dur: 0.035, vol: 0.05, freq: 2600 + i * 400, type: 'bandpass', q: 3, delay: i * 0.03 });
    },
    holeDone() {
      sfx.noise({ dur: 0.12, vol: 0.12, freq: 380, to: 160 });
    },
    arrive(boss) {
      if (!boss) return;
      sfx.tone({ freq: note(-33), type: 'sawtooth', dur: 1.6, vol: 0.05, attack: 0.3 });
      sfx.tone({ freq: note(-26), type: 'triangle', dur: 1.6, vol: 0.06, attack: 0.3 });
    },
    swarm() {
      for (let i = 0; i < 10; i++) sfx.noise({ dur: 0.05, vol: 0.04, freq: 2000 + (i % 4) * 500, type: 'bandpass', q: 4, delay: i * 0.05 });
    },
    windup() {
      sfx.noise({ dur: 1.0, vol: 0.08, freq: 200, to: 900, attack: 0.6 });
    },
    gust() {
      sfx.noise({ dur: 0.45, vol: 0.22, freq: 1400, to: 180 });
      sfx.tone({ freq: 90, to: 50, type: 'sine', dur: 0.4, vol: 0.12 });
    },
    bossHit(hp) {
      sfx.tone({ freq: note(-9 + (3 - hp) * 4), type: 'square', dur: 0.12, vol: 0.06 });
    },
    /** Clock chime for the hour: a short Westminster-ish phrase on bells. */
    chime() {
      const phrase = [7, 3, 5, -2];
      phrase.forEach((s, i) => bell(note(s), i * 0.32, 0.12));
    },
    tick(tock) {
      sfx.noise({ dur: 0.02, vol: tock ? 0.035 : 0.045, freq: tock ? 2400 : 3200, type: 'bandpass', q: 6 });
    },
    click() {
      sfx.tone({ freq: 880, type: 'triangle', dur: 0.05, vol: 0.08 });
    },
    pick() {
      sfx.arp([note(3), note(10), note(15)], { step: 0.07, type: 'triangle', dur: 0.25, vol: 0.12 });
    },
    over() {
      sfx.noise({ dur: 0.6, vol: 0.2, freq: 2500, to: 200 });
      sfx.arp([note(0), note(-4), note(-7), note(-12)], { step: 0.18, type: 'triangle', dur: 0.5, vol: 0.12, delay: 0.3 });
    },
    dawn() {
      [0, 4, 7, 11, 14].forEach((s, i) => sfx.tone({ freq: note(-9 + s), type: 'sine', dur: 2.4, vol: 0.06, attack: 0.4, delay: i * 0.12 }));
      // Birdsong.
      for (let i = 0; i < 7; i++) {
        const f = 2200 + (i % 3) * 400;
        sfx.tone({ freq: f, to: f * 1.4, type: 'sine', dur: 0.08, vol: 0.05, delay: 1.0 + i * 0.13 + (i > 3 ? 0.4 : 0) });
      }
    },
  };

  function bell(f, delay, vol) {
    sfx.tone({ freq: f, type: 'sine', dur: 1.6, vol, delay });
    sfx.tone({ freq: f * 2.76, type: 'sine', dur: 0.7, vol: vol * 0.3, delay });
    sfx.tone({ freq: f * 5.4, type: 'sine', dur: 0.3, vol: vol * 0.15, delay });
  }
}
