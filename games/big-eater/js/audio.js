// Big Eater sounds, all synthesized: wet pops pitched by stain, a low glomp that climbs with the
// gulp chain, and a bubbling lab groove that thickens with the culture.
import { createSequencer } from '../../../shared/seq.js';
import { createSfx, note } from '../../../shared/sfx.js';

const POP = { p: 440, n: 587, v: 880, s: 330 };
// A minor pentatonic for the gulp chain
const PENTA = [0, 3, 5, 7, 10];
const pent = (i) => note(-9 + PENTA[i % 5] + 12 * Math.floor(i / 5));

export function createAudio(slug, saved) {
  const sfx = createSfx(slug, { volume: 0.5 });
  const last = {};
  const ok = (key, gap) => {
    const now = performance.now();
    if (now - (last[key] || 0) < gap) return false;
    last[key] = now;
    return true;
  };
  let xpRun = 0;
  let musicOn = saved.get('music', true);
  let heat = 0; // 0..1 how thick the culture is

  // 32 steps: bass on a four-chord loop, bubbles on top
  const ROOTS = [-21, -21, -24, -19];
  const seq = createSequencer(sfx, {
    bpm: 104, steps: 64,
    onStep(step, at) {
      const bar = Math.floor(step / 16), i = step % 16;
      const root = ROOTS[bar];
      if (i % 4 === 0) sfx.tone({ freq: note(root), type: 'triangle', dur: 0.22, vol: 0.11, at });
      if (i === 6 || i === 14) sfx.tone({ freq: note(root + 7), type: 'triangle', dur: 0.12, vol: 0.07, at });
      if (i % 4 === 2) sfx.noise({ dur: 0.03, vol: 0.035 + heat * 0.03, freq: 5000, type: 'highpass', at });
      // bubbles: a seeded-looking pattern that fills in as the heat rises
      const h = (step * 7 + bar * 13) % 16;
      if (h < 2 + heat * 7) {
        const f = note(root + 24 + PENTA[(step * 3 + bar) % 5]);
        sfx.tone({ freq: f, to: f * 1.5, type: 'sine', dur: 0.07, vol: 0.035 + heat * 0.02, at });
      }
      if (heat > 0.55 && i % 8 === 4) sfx.noise({ dur: 0.09, vol: 0.06, freq: 1800, type: 'bandpass', q: 1.5, at });
      if (heat > 0.8 && i % 2 === 1) sfx.tone({ freq: note(root + 12), type: 'square', dur: 0.05, vol: 0.018, at });
    },
  });

  return {
    sfx,
    get musicOn() { return musicOn; },
    setHeat(v) { heat = Math.max(0, Math.min(1, v)); },
    music(on) {
      if (on && musicOn && !document.hidden) seq.start();
      else seq.stop();
    },
    toggleMusic(playing) {
      musicOn = !musicOn;
      saved.set('music', musicOn);
      if (musicOn && playing && !document.hidden) seq.start();
      else seq.stop();
      return musicOn;
    },
    get musicPlaying() { return seq.playing; },
    pop(gram, big) {
      if (!ok('pop', big ? 0 : 38)) return;
      const f = POP[gram] * (0.88 + Math.random() * 0.24) * (big ? 0.5 : 1);
      sfx.tone({ freq: f, to: f * 0.45, type: 'sine', dur: big ? 0.16 : 0.06, vol: big ? 0.16 : 0.07 });
      sfx.noise({ dur: 0.03, vol: big ? 0.12 : 0.04, freq: 2400, type: 'bandpass', q: 1.2 });
    },
    gulp(chain, boss) {
      if (!boss && !ok('gulp', 30)) return;
      sfx.tone({ freq: boss ? 150 : 210, to: boss ? 38 : 72, type: 'sine', dur: boss ? 0.7 : 0.13, vol: boss ? 0.5 : 0.24 });
      sfx.tone({ freq: pent(Math.min(14, chain - 1)), type: 'triangle', dur: 0.1, vol: 0.09, delay: 0.04 });
      if (boss) {
        sfx.noise({ dur: 0.8, vol: 0.3, freq: 900, to: 90 });
        sfx.arp([262, 330, 392, 523, 659, 784].map((f) => f), { step: 0.07, dur: 0.3, vol: 0.14, delay: 0.75 });
      }
    },
    hurt() {
      sfx.noise({ dur: 0.18, vol: 0.3, freq: 420, to: 120 });
      sfx.tone({ freq: 150, to: 62, type: 'sawtooth', dur: 0.2, vol: 0.12 });
    },
    xp() {
      if (!ok('xp', 45)) return;
      xpRun = performance.now() - (last.xpAt || 0) < 400 ? Math.min(12, xpRun + 1) : 0;
      last.xpAt = performance.now();
      sfx.tone({ freq: note(3 + xpRun), type: 'sine', dur: 0.05, vol: 0.045 });
    },
    level() { sfx.arp([523, 659, 784, 1047], { step: 0.06, dur: 0.22, vol: 0.15 }); },
    pick() { sfx.tone({ freq: 660, to: 990, type: 'triangle', dur: 0.1, vol: 0.14 }); },
    evo() { sfx.arp([392, 523, 659, 784, 1047, 1319], { step: 0.055, dur: 0.4, vol: 0.16 }); sfx.noise({ dur: 0.5, vol: 0.1, freq: 3000, to: 9000, type: 'bandpass' }); },
    burst() {
      sfx.noise({ dur: 0.7, vol: 0.42, freq: 300, to: 5000, type: 'bandpass', q: 0.8 });
      sfx.tone({ freq: 90, to: 36, type: 'sine', dur: 0.6, vol: 0.4 });
    },
    burstReady() { sfx.arp([784, 1175], { step: 0.08, dur: 0.18, vol: 0.1, type: 'sine' }); },
    fire(w) {
      if (w === 'antibody' && ok('ab', 110)) sfx.tone({ freq: 1100, to: 1500, type: 'sine', dur: 0.04, vol: 0.025 });
      else if (w === 'lysozyme' && ok('ly', 90)) sfx.noise({ dur: 0.06, vol: 0.05, freq: 3500, type: 'highpass' });
      else if (w === 'cytokine') sfx.tone({ freq: 240, to: 110, type: 'sine', dur: 0.22, vol: 0.08 });
      else if (w === 'net' && ok('net', 90)) sfx.noise({ dur: 0.1, vol: 0.07, freq: 900, to: 2600, type: 'bandpass', q: 2 });
      else if (w === 'interferon' && ok('zap', 60)) sfx.tone({ freq: 1500, to: 380, type: 'square', dur: 0.07, vol: 0.035 });
    },
    toxin(big) { if (ok('tox', 80)) sfx.tone({ freq: big ? 300 : 520, to: big ? 180 : 360, type: 'square', dur: 0.09, vol: 0.05 }); },
    wave() { sfx.tone({ freq: 392, type: 'sine', dur: 0.12, vol: 0.07 }); sfx.tone({ freq: 523, type: 'sine', dur: 0.16, vol: 0.07, delay: 0.1 }); },
    boss() {
      for (let i = 0; i < 3; i++) { sfx.tone({ freq: 98, type: 'sawtooth', dur: 0.32, vol: 0.13, delay: i * 0.42 }); sfx.tone({ freq: 147, type: 'square', dur: 0.32, vol: 0.05, delay: i * 0.42 }); }
    },
    bossDown() { sfx.noise({ dur: 0.9, vol: 0.35, freq: 1200, to: 80 }); sfx.arp([523, 659, 784, 1047, 1319], { step: 0.08, dur: 0.35, vol: 0.15, delay: 0.2 }); },
    telegraph() { sfx.tone({ freq: 200, to: 620, type: 'square', dur: 0.8, vol: 0.06 }); },
    charge() { sfx.noise({ dur: 0.5, vol: 0.22, freq: 2400, to: 300 }); },
    pickup(kind) { sfx.arp(kind === 'sugar' ? [659, 880] : [523, 784, 1047, 1568], { step: 0.05, dur: 0.14, vol: 0.12, type: 'sine' }); },
    dead() { sfx.tone({ freq: 330, to: 40, type: 'sawtooth', dur: 0.9, vol: 0.2 }); sfx.noise({ dur: 0.9, vol: 0.3, freq: 2000, to: 80 }); },
    won() { sfx.arp([523, 659, 784, 1047, 784, 1047, 1319, 1568], { step: 0.11, dur: 0.4, vol: 0.16 }); },
    ui() { sfx.tone({ freq: 520, type: 'sine', dur: 0.05, vol: 0.08 }); },
  };
}
