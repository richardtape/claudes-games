// Sushi Raft's sounds, all synthesized on shared/sfx.js: wood toks, knife taps, the rice cooker's
// little tune, a launch bell and a plop, noms, coins, a rising lantern scale and the Rush gong.
// Music is a gentle koto-ish loop on shared/seq.js that quickens for the Rush and last orders.
import { createSfx, note } from '../../../shared/sfx.js';
import { createSequencer } from '../../../shared/seq.js';
import { store } from '../../../shared/arcade.js';

// The yo scale (D E G A B): bright and harbour-ish; any run of it sounds like a tune.
const YO = [0, 2, 5, 7, 9];
const yo = (i, base = -7) => note(base + YO[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5));

const SPECIES_PITCH = { seal: 0, cat: 3, turtle: -5, penguin: 5, crab: 7, octopus: -2, puffer: 9, walrus: -9 };

export function createAudio(slug) {
  const sfx = createSfx(slug, { volume: 0.55 });
  const saved = store(slug);
  let musicOn = saved.get('music', true);
  let mode = 'calm'; // calm | busy | rush | night

  const pluck = (f, at, vol = 0.07, dur = 0.5) => {
    sfx.tone({ freq: f, type: 'triangle', dur, vol, at, attack: 0.003 });
    sfx.tone({ freq: f * 2.01, type: 'sine', dur: dur * 0.35, vol: vol * 0.35, at, attack: 0.002 });
  };

  // A 64-step (four bar) tune in sixteenths: melody indices into the yo scale, -1 rests.
  const MEL = [
    5, -1, 7, -1, 8, -1, 7, 5, 6, -1, 5, -1, 3, -1, -1, -1,
    4, -1, 5, -1, 7, -1, 5, 4, 3, -1, 2, -1, 3, -1, -1, -1,
    5, -1, 7, -1, 8, -1, 10, -1, 9, -1, 8, 7, 8, -1, -1, -1,
    7, -1, 5, 4, 5, -1, 3, -1, 2, -1, 3, -1, 0, -1, -1, -1,
  ];
  const BASS = [0, 0, 3, 3, 1, 1, 2, 2];
  const seq = createSequencer(sfx, {
    bpm: 92,
    steps: 64,
    onStep(step, at) {
      if (!musicOn) return;
      const bar = Math.floor(step / 8);
      const quiet = mode === 'night' ? 0.6 : 1;
      if (MEL[step] >= 0 && (mode !== 'night' || step % 4 === 0)) pluck(yo(MEL[step], 5), at, 0.05 * quiet, 0.45);
      if (step % 8 === 0) sfx.tone({ freq: yo(BASS[bar], -5 - 12), type: 'sine', dur: 0.7, vol: 0.09 * quiet, at });
      if (mode !== 'night') {
        if (step % 4 === 2) sfx.noise({ dur: 0.04, vol: 0.025, freq: 6000, type: 'highpass', at });
        if (step % 8 === 4) sfx.noise({ dur: 0.05, vol: 0.05, freq: 900, type: 'bandpass', q: 4, at });
      }
      if (mode === 'rush') {
        if (step % 2 === 1) pluck(yo(MEL[(step + 32) % 64] >= 0 ? MEL[(step + 32) % 64] + 5 : 10, 5), at, 0.025, 0.2);
        if (step % 4 === 0) sfx.noise({ dur: 0.06, vol: 0.06, freq: 300, at });
      }
    },
  });

  const audio = {
    sfx,
    get musicOn() {
      return musicOn;
    },
    setMusic(on) {
      musicOn = !!on;
      saved.set('music', musicOn);
    },
    /** Start the loop (never into a hidden tab). */
    music(on, m = mode) {
      mode = m;
      seq.bpm = { calm: 92, busy: 104, rush: 116, night: 72 }[m] || 92;
      if (on && !document.hidden) seq.start();
      else seq.stop();
    },
    get mode() {
      return mode;
    },

    click() {
      sfx.tone({ freq: 660, type: 'triangle', dur: 0.05, vol: 0.07 });
    },
    tap() {
      sfx.noise({ dur: 0.03, vol: 0.06, freq: 1500, type: 'bandpass', q: 3 });
      sfx.tone({ freq: 520, type: 'sine', dur: 0.04, vol: 0.05 });
    },
    take() {
      sfx.tone({ freq: 480, to: 720, type: 'sine', dur: 0.07, vol: 0.09 });
    },
    put() {
      sfx.noise({ dur: 0.04, vol: 0.1, freq: 700, type: 'bandpass', q: 2 });
      sfx.tone({ freq: 240, type: 'triangle', dur: 0.06, vol: 0.08 });
    },
    add() {
      sfx.tone({ freq: 620, to: 880, type: 'triangle', dur: 0.08, vol: 0.08 });
    },
    chop() {
      sfx.noise({ dur: 0.025, vol: 0.09, freq: 2600, type: 'bandpass', q: 4 });
      sfx.tone({ freq: 190, type: 'sine', dur: 0.03, vol: 0.06 });
    },
    sliced() {
      sfx.tone({ freq: 1320, type: 'triangle', dur: 0.12, vol: 0.06 });
    },
    riceStart() {
      sfx.tone({ freq: 300, to: 420, type: 'square', dur: 0.05, vol: 0.04 });
    },
    /** The rice cooker's own little tune. */
    riceDone() {
      [7, 12, 16, 14, 12].forEach((s, i) => sfx.tone({ freq: note(s + 3), type: 'square', dur: 0.13, vol: 0.035, delay: i * 0.13 }));
    },
    cooked() {
      sfx.tone({ freq: 880, type: 'sine', dur: 0.15, vol: 0.07 });
      sfx.tone({ freq: 1320, type: 'sine', dur: 0.2, vol: 0.05, delay: 0.08 });
    },
    burnt() {
      sfx.tone({ freq: 110, type: 'sawtooth', dur: 0.3, vol: 0.06 });
      sfx.noise({ dur: 0.3, vol: 0.06, freq: 2000, type: 'highpass' });
    },
    launch() {
      [1, 1.5, 2.76].forEach((m, i) => sfx.tone({ freq: 1046 * m, type: 'sine', dur: 0.5 - i * 0.12, vol: 0.06 / (i + 1) }));
    },
    plop() {
      sfx.tone({ freq: 520, to: 170, type: 'sine', dur: 0.12, vol: 0.12 });
      sfx.noise({ dur: 0.06, vol: 0.04, freq: 3000, type: 'highpass', delay: 0.02 });
    },
    nom(sp) {
      const p = SPECIES_PITCH[sp] || 0;
      sfx.tone({ freq: note(p + 3), to: note(p - 2), type: 'triangle', dur: 0.08, vol: 0.09 });
      sfx.tone({ freq: note(p + 5), to: note(p), type: 'triangle', dur: 0.08, vol: 0.08, delay: 0.1 });
    },
    coins(n = 3) {
      const k = Math.min(6, Math.max(2, Math.round(n / 3)));
      for (let i = 0; i < k; i++) sfx.tone({ freq: note(19 + (i % 3) * 3), type: 'triangle', dur: 0.09, vol: 0.06, delay: i * 0.055 });
    },
    coin(i = 0) {
      sfx.tone({ freq: note(12 + Math.min(i, 24) * 0.5), type: 'triangle', dur: 0.07, vol: 0.06 });
    },
    love() {
      [0, 4, 7, 12].forEach((s, i) => sfx.tone({ freq: note(s + 15), type: 'sine', dur: 0.2, vol: 0.05, delay: i * 0.06 }));
    },
    huff() {
      sfx.tone({ freq: 210, to: 120, type: 'sawtooth', dur: 0.28, vol: 0.06 });
      sfx.noise({ dur: 0.2, vol: 0.06, freq: 500 });
    },
    lantern(n) {
      pluck(yo(n + 3, 5), sfx.now() ?? undefined, 0.09, 0.8);
    },
    lanternsOut() {
      sfx.tone({ freq: 440, to: 220, type: 'sine', dur: 0.4, vol: 0.06 });
    },
    rush() {
      sfx.tone({ freq: 98, type: 'sine', dur: 2.2, vol: 0.16 });
      sfx.tone({ freq: 147, type: 'sine', dur: 1.8, vol: 0.08 });
      sfx.tone({ freq: 233, type: 'triangle', dur: 1.2, vol: 0.04 });
      sfx.arp([note(5), note(10), note(12), note(17), note(22)], { step: 0.06, type: 'triangle', dur: 0.3, vol: 0.06, delay: 0.1 });
    },
    gull() {
      sfx.tone({ freq: 1100, to: 700, type: 'square', dur: 0.12, vol: 0.035 });
      sfx.tone({ freq: 1200, to: 650, type: 'square', dur: 0.14, vol: 0.035, delay: 0.16 });
    },
    shoo() {
      sfx.noise({ dur: 0.2, vol: 0.12, freq: 600, to: 4000, type: 'bandpass', q: 1.5 });
      sfx.tone({ freq: 1400, to: 2000, type: 'square', dur: 0.08, vol: 0.03 });
    },
    steal() {
      sfx.tone({ freq: 1300, to: 900, type: 'square', dur: 0.1, vol: 0.04 });
      sfx.tone({ freq: 330, to: 220, type: 'triangle', dur: 0.3, vol: 0.07, delay: 0.12 });
    },
    soggy() {
      sfx.tone({ freq: 300, to: 160, type: 'sine', dur: 0.25, vol: 0.06 });
    },
    fail() {
      sfx.tone({ freq: 200, to: 150, type: 'triangle', dur: 0.1, vol: 0.08 });
    },
    nope() {
      sfx.tone({ freq: 330, type: 'triangle', dur: 0.06, vol: 0.06 });
      sfx.tone({ freq: 262, type: 'triangle', dur: 0.08, vol: 0.06, delay: 0.08 });
    },
    buy() {
      sfx.arp([note(7), note(12), note(19)], { step: 0.05, type: 'triangle', dur: 0.15, vol: 0.07 });
    },
    open() {
      [0, 4, 7, 9, 12].forEach((s, i) => pluck(yo(s, 5), undefined, 0.07, 0.6));
      sfx.arp([yo(5, 5), yo(7, 5), yo(9, 5), yo(10, 5)], { step: 0.09, type: 'triangle', dur: 0.4, vol: 0.06 });
    },
    lastOrders() {
      [1, 1.5].forEach((m, i) => sfx.tone({ freq: 784 * m, type: 'sine', dur: 0.8, vol: 0.06, delay: i * 0.25 }));
    },
    stamp() {
      sfx.noise({ dur: 0.12, vol: 0.25, freq: 220, to: 90 });
      sfx.tone({ freq: 90, to: 60, type: 'sine', dur: 0.2, vol: 0.2 });
    },
    sad() {
      [7, 5, 2, 0].forEach((s, i) => sfx.tone({ freq: note(s - 5), type: 'triangle', dur: 0.3, vol: 0.06, delay: i * 0.18 }));
    },
    fanfare() {
      [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => sfx.tone({ freq: note(s + 3), type: 'triangle', dur: 0.35, vol: 0.07, delay: i * 0.08 }));
      sfx.tone({ freq: note(-9), type: 'sine', dur: 1.2, vol: 0.1, delay: 0.5 });
    },
    join() {
      sfx.arp([note(10), note(14), note(17)], { step: 0.07, type: 'sine', dur: 0.25, vol: 0.07 });
    },
  };
  return audio;
}
