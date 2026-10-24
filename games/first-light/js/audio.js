// First Light's sounds, all synthesized on shared/sfx.js: the burner's roar (noise with a low
// rumble, held while the valve is open), the vent's flutter, basket creaks, birds near the
// ground, the marker's whistle and thud, a shutter, and the cork at the end. Music is a quiet
// drone with a ney-like flute in a Hicaz-flavoured mode, swelling into a chord at first light.
import { createSfx, note } from '../../../shared/sfx.js';
import { createSequencer } from '../../../shared/seq.js';
import { store } from '../../../shared/arcade.js';

// Hicaz on D: D Eb F# G A Bb C D (semitones from D).
const HICAZ = [0, 1, 4, 5, 7, 8, 10];
const D3 = -19; // semitones from A4
const hz = (i, base = D3 + 12) => note(base + HICAZ[((i % 7) + 7) % 7] + 12 * Math.floor(i / 7));

// Eight bars of ney, in eighth-note steps (index into Hicaz from D4, -1 rest, '_' hold).
const NEY = [
  4, '_', '_', '_', 3, '_', 2, '_', 3, '_', '_', '_', -1, -1, -1, -1,
  2, '_', 1, '_', 2, '_', '_', 3, 2, '_', '_', '_', -1, -1, -1, -1,
  4, '_', 5, '_', 4, '_', 3, '_', 4, '_', '_', '_', 2, '_', -1, -1,
  3, '_', 2, '_', 1, '_', '_', '_', 0, '_', '_', '_', '_', '_', -1, -1,
];

export function createAudio(slug) {
  const sfx = createSfx(slug, { volume: 0.6 });
  const saved = store(slug);
  let musicOn = saved.get('music', true);
  let lit = false;
  let burner = null;
  let rumble = null;
  let hiss = null;
  let vent = null;
  let wind = null;
  let burnLevel = 0;

  function ensureHolds() {
    if (burner) return true;
    burner = sfx.hold({ kind: 'noise', type: 'lowpass', freq: 520, q: 0.8 });
    if (!burner) return false;
    rumble = sfx.hold({ kind: 'sine', freq: 52 });
    hiss = sfx.hold({ kind: 'noise', type: 'bandpass', freq: 2600, q: 0.9 });
    vent = sfx.hold({ kind: 'noise', type: 'highpass', freq: 1900, q: 0.7 });
    wind = sfx.hold({ kind: 'noise', type: 'bandpass', freq: 700, q: 0.5 });
    return true;
  }

  const ney = (f, at, dur) => {
    sfx.tone({ freq: f, type: 'sine', dur, vol: 0.05, attack: 0.18, at });
    sfx.tone({ freq: f * 2.003, type: 'sine', dur: dur * 0.8, vol: 0.012, attack: 0.25, at });
    sfx.noise({ dur: 0.35, vol: 0.012, freq: f * 3, type: 'bandpass', q: 5, attack: 0.08, at });
  };

  const seq = createSequencer(sfx, {
    bpm: 66,
    steps: 128, // sixteenths: 8 bars
    onStep(step, at) {
      if (!musicOn) return;
      const bar = Math.floor(step / 16);
      // Drone: D and A, long and low, every two bars.
      if (step % 32 === 0) {
        sfx.tone({ freq: hz(0, D3 - 12), type: 'triangle', dur: 7, vol: 0.05, attack: 1.5, at });
        sfx.tone({ freq: hz(4, D3 - 12), type: 'sine', dur: 7, vol: 0.03, attack: 2, at });
      }
      // The ney plays on eighths; holds extend the note.
      if (step % 2 === 0) {
        const i = (step / 2) % NEY.length;
        const v = NEY[i];
        if (typeof v === 'number' && v >= 0 && (lit || bar % 4 < 2)) {
          let len = 1;
          while (NEY[(i + len) % NEY.length] === '_') len++;
          ney(hz(v), at, len * (60 / 66 / 2) * 0.95);
        }
      }
      // After first light, a soft plucked saz on the off-beats.
      if (lit && step % 8 === 4) {
        const f = hz([0, 4, 2, 4][bar % 4], D3);
        sfx.tone({ freq: f, type: 'triangle', dur: 0.5, vol: 0.035, attack: 0.004, at });
        sfx.tone({ freq: f * 2, type: 'sine', dur: 0.25, vol: 0.012, attack: 0.003, at });
      }
    },
  });

  return {
    sfx,
    get musicOn() {
      return musicOn;
    },
    setMusic(on) {
      musicOn = !!on;
      saved.set('music', musicOn);
      if (!musicOn) seq.stop();
    },
    startMusic() {
      if (musicOn && !document.hidden) seq.start();
    },
    stopMusic() {
      seq.stop();
    },
    setLit(v) {
      lit = v;
    },
    /** Call every frame: the held sounds follow the balloon. */
    update({ burning = false, venting = false, alt = 0, vy = 0, playing = true }) {
      if (!ensureHolds()) return;
      const want = playing && burning ? 1 : 0;
      if (want && burnLevel === 0) sfx.noise({ dur: 0.35, vol: 0.32, freq: 260, attack: 0.01 });
      burnLevel = want;
      burner.set({ vol: want * 0.42 }, want ? 0.05 : 0.25);
      rumble.set({ vol: want * 0.22 }, want ? 0.08 : 0.3);
      hiss.set({ vol: want * 0.06 }, 0.1);
      vent.set({ vol: playing && venting ? 0.08 + 0.04 * Math.sin(performance.now() / 60) : 0 }, 0.08);
      const breeze = playing ? 0.015 + Math.min(0.04, alt / 9000) + Math.min(0.03, Math.abs(vy) * 0.008) : 0;
      wind.set({ vol: breeze, freq: 600 + alt }, 0.4);
    },
    silence() {
      if (!burner) return;
      for (const h of [burner, rumble, hiss, vent, wind]) h.set({ vol: 0 }, 0.15);
      burnLevel = 0;
    },
    liftoff() {
      sfx.arp([hz(0, D3 + 12), hz(2, D3 + 12), hz(4, D3 + 12)], { step: 0.12, type: 'sine', dur: 0.6, vol: 0.08 });
    },
    firstLight() {
      const t = sfx.now();
      if (t === null) return;
      for (const [i, oct, v] of [[0, -12, 0.06], [4, -12, 0.05], [0, 0, 0.05], [2, 0, 0.045], [4, 0, 0.04], [0, 12, 0.03]]) {
        sfx.tone({ freq: hz(i, D3 + oct), type: 'triangle', dur: 5.5, vol: v, attack: 1.4, at: t + 0.05 });
      }
      [0, 2, 4, 6, 7, 9, 11].forEach((i, k) => sfx.tone({ freq: hz(i, D3 + 24), type: 'sine', dur: 1.6, vol: 0.03, attack: 0.01, at: t + 0.9 + k * 0.16 }));
    },
    creak() {
      sfx.tone({ freq: 190 + Math.random() * 60, to: 140, type: 'sawtooth', dur: 0.16, vol: 0.02 });
    },
    birds() {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const f = 2600 + Math.random() * 1200;
        sfx.tone({ freq: f, to: f * 1.25, type: 'sine', dur: 0.07, vol: 0.025, delay: k * 0.11 });
      }
    },
    drop() {
      sfx.tone({ freq: 1250, to: 420, type: 'sine', dur: 1.4, vol: 0.05 });
    },
    thud(points) {
      sfx.noise({ dur: 0.22, vol: 0.35, freq: 220 });
      if (points >= 1000) sfx.arp([hz(0, D3 + 24), hz(2, D3 + 24), hz(4, D3 + 24), hz(0, D3 + 36)], { step: 0.09, type: 'triangle', dur: 0.4, vol: 0.12, delay: 0.15 });
      else if (points >= 600) sfx.arp([hz(0, D3 + 24), hz(4, D3 + 24)], { step: 0.1, type: 'triangle', dur: 0.35, vol: 0.1, delay: 0.15 });
      else if (points > 0) sfx.tone({ freq: hz(2, D3 + 24), type: 'triangle', dur: 0.3, vol: 0.08, delay: 0.15 });
    },
    shutter() {
      sfx.noise({ dur: 0.03, vol: 0.25, freq: 5000, type: 'highpass' });
      sfx.noise({ dur: 0.05, vol: 0.18, freq: 3000, type: 'highpass', delay: 0.07 });
    },
    scrape() {
      sfx.noise({ dur: 0.4, vol: 0.2, freq: 900, to: 300, type: 'bandpass', q: 2 });
      sfx.tone({ freq: 150, to: 110, type: 'sawtooth', dur: 0.25, vol: 0.04 });
    },
    bump() {
      sfx.noise({ dur: 0.25, vol: 0.4, freq: 180 });
      sfx.tone({ freq: 120, to: 80, type: 'sawtooth', dur: 0.2, vol: 0.05 });
    },
    touch() {
      sfx.noise({ dur: 0.18, vol: 0.18, freq: 300 });
    },
    lowFuel() {
      sfx.arp([hz(4, D3 + 12), hz(1, D3 + 12)], { step: 0.18, type: 'triangle', dur: 0.3, vol: 0.08 });
    },
    landed() {
      sfx.noise({ dur: 0.5, vol: 0.3, freq: 250 });
    },
    cork() {
      sfx.noise({ dur: 0.05, vol: 0.4, freq: 1800, type: 'bandpass', q: 1.5 });
      sfx.tone({ freq: 420, to: 980, type: 'sine', dur: 0.09, vol: 0.12 });
      sfx.noise({ dur: 1.6, vol: 0.05, freq: 6000, type: 'highpass', delay: 0.08, attack: 0.05 });
    },
    tick() {
      sfx.tone({ freq: 1600, type: 'sine', dur: 0.03, vol: 0.03 });
    },
    chime() {
      sfx.arp([hz(0, D3 + 24), hz(2, D3 + 24), hz(4, D3 + 24)], { step: 0.07, type: 'triangle', dur: 0.3, vol: 0.09 });
    },
  };
}
