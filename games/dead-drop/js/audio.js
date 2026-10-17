// Dead Drop sounds, all synthesised on shared/sfx.js: paper slides and flips, a slam when the
// cards land, tricks, a brass stab and heartbeat for escalations, surf-guitar twangs for cities,
// and a quiet surf-spy bass loop (shared/seq.js) that tightens on the final turn.
import { createSequencer } from '../../../shared/seq.js';
import { note } from '../../../shared/sfx.js';
import { store } from '../../../shared/arcade.js';

// E minor, spy-movie chromatics. Semitones from A4.
const E2 = -29;

export function createAudio(sfx, slug) {
  const saved = store(slug);
  let musicOn = saved.get('music', true);
  let tension = 0; // 0 calm, 1 final turn / escalated
  let wanted = false;

  const twang = (semi, at, { vol = 0.07, dur = 0.22, delay = 0 } = {}) => {
    sfx.tone({ freq: note(semi), type: 'square', dur, vol, at, delay, attack: 0.002 });
    sfx.tone({ freq: note(semi) * 2.01, type: 'triangle', dur: dur * 0.6, vol: vol * 0.5, at, delay });
  };

  // 4 bars of sixteenths: bass pulses on E with the chromatic B–C–C#–C line over it.
  const LINE = [7, 8, 9, 8]; // B, C, C#, C (semitones above E3)
  const seq = createSequencer(sfx, {
    bpm: 128,
    steps: 64,
    onStep(step, at) {
      const bar = Math.floor(step / 16);
      const s = step % 16;
      if (s % 2 === 0) sfx.tone({ freq: note(E2 + (s === 14 ? 3 : 0)), type: 'triangle', dur: 0.16, vol: 0.11, at });
      if (s === 0 || s === 8) twang(E2 + 12 + LINE[(bar * 2 + s / 8) % 4], at, { vol: 0.045, dur: 0.5 });
      if (s % 4 === 2) sfx.noise({ dur: 0.04, freq: 7000, type: 'highpass', vol: 0.025, at });
      if (tension && (s === 0 || s === 3)) sfx.tone({ freq: 55, to: 38, type: 'sine', dur: 0.16, vol: 0.22, at });
      if (bar === 3 && s === 12) twang(E2 + 24 + 7, at, { vol: 0.05, dur: 0.3 });
    },
  });
  // Never play into a hidden tab (a window behind others counts as hidden).
  const sync = () => (wanted && musicOn && !document.hidden ? seq.start() : seq.stop());

  return {
    music(on) {
      wanted = on;
      sync();
    },
    get musicOn() {
      return musicOn;
    },
    toggleMusic() {
      musicOn = !musicOn;
      saved.set('music', musicOn);
      sync();
      return musicOn;
    },
    tension(level) {
      tension = level;
      seq.bpm = level ? 140 : 128;
    },
    pick: () => sfx.tone({ freq: 740, to: 880, type: 'triangle', dur: 0.06, vol: 0.12 }),
    place: () => sfx.noise({ dur: 0.08, freq: 1800, type: 'bandpass', q: 1.2, vol: 0.2 }),
    lock: () => {
      sfx.tone({ freq: 220, type: 'square', dur: 0.05, vol: 0.08 });
      sfx.noise({ dur: 0.06, freq: 900, vol: 0.25, delay: 0.02 });
    },
    unlock: () => sfx.tone({ freq: 330, to: 220, type: 'triangle', dur: 0.08, vol: 0.1 }),
    drop: () => sfx.noise({ dur: 0.36, freq: 3200, to: 500, type: 'bandpass', q: 0.7, vol: 0.22 }),
    slam: () => {
      sfx.noise({ dur: 0.22, freq: 220, vol: 0.55 });
      sfx.tone({ freq: 90, to: 40, type: 'sine', dur: 0.25, vol: 0.45 });
    },
    flip: () => {
      sfx.noise({ dur: 0.05, freq: 4200, type: 'highpass', vol: 0.18 });
      sfx.tone({ freq: 1200, to: 700, type: 'square', dur: 0.03, vol: 0.04 });
    },
    out(why) {
      if (why === 'tripwire') sfx.tone({ freq: 2093, type: 'sine', dur: 0.4, vol: 0.12 });
      sfx.noise({ dur: 0.12, freq: 5000, to: 900, type: 'bandpass', vol: 0.3 });
      sfx.tone({ freq: 160, to: 60, type: 'sawtooth', dur: 0.22, vol: 0.12, delay: 0.03 });
    },
    trick(kind) {
      if (kind === 'assassin') sfx.noise({ dur: 0.25, freq: 6000, to: 1500, type: 'highpass', vol: 0.12 });
      else if (kind === 'lookout') sfx.arp([note(7), note(12)], { step: 0.07, type: 'triangle', vol: 0.1 });
      else if (kind === 'impostor') sfx.tone({ freq: 300, to: 900, type: 'sine', dur: 0.3, vol: 0.12 });
      else if (kind === 'double') sfx.noise({ dur: 0.3, freq: 800, to: 3000, type: 'bandpass', vol: 0.14 });
      else if (kind === 'getaway') {
        sfx.tone({ freq: 110, to: 330, type: 'sawtooth', dur: 0.35, vol: 0.08 });
        sfx.tone({ freq: 660, type: 'square', dur: 0.08, vol: 0.06, delay: 0.32 });
        sfx.tone({ freq: 660, type: 'square', dur: 0.08, vol: 0.06, delay: 0.44 });
      } else if (kind === 'tripwire') sfx.tone({ freq: 1760, type: 'triangle', dur: 0.5, vol: 0.12 });
    },
    swap: () => sfx.noise({ dur: 0.6, freq: 400, to: 2400, type: 'bandpass', vol: 0.18 }),
    escalate() {
      for (const s of [-17, -14, -11, -7]) sfx.tone({ freq: note(s), type: 'sawtooth', dur: 0.7, vol: 0.07, attack: 0.02 });
      sfx.noise({ dur: 0.5, freq: 600, vol: 0.2 });
      this.heartbeat(0.8);
    },
    heartbeat(delay = 0) {
      for (const d of [0, 0.22, 0.9, 1.12]) sfx.tone({ freq: 60, to: 40, type: 'sine', dur: 0.18, vol: 0.4, delay: delay + d });
    },
    tick: (i = 0) => sfx.tone({ freq: 1400 + i * 40, type: 'square', dur: 0.02, vol: 0.04 }),
    city(mine) {
      const base = mine ? [0, 4, 7, 12] : [12, 8, 5, 0];
      base.forEach((s, i) => twang(E2 + 24 + s, null, { vol: 0.08, dur: 0.3, delay: i * 0.07 }));
    },
    nobody: () => sfx.tone({ freq: 196, to: 185, type: 'triangle', dur: 0.3, vol: 0.1 }),
    roundWon: () => sfx.arp([note(-5), note(-1), note(2), note(7)], { step: 0.09, type: 'square', vol: 0.09, dur: 0.25 }),
    roundLost: () => sfx.arp([note(2), note(-2), note(-5), note(-9)], { step: 0.12, type: 'triangle', vol: 0.12, dur: 0.3 }),
    fold: () => sfx.tone({ freq: 392, to: 130, type: 'sawtooth', dur: 0.5, vol: 0.08 }),
    victory: () => sfx.arp([note(-12), note(-5), note(0), note(4), note(7), note(12)], { step: 0.11, type: 'square', vol: 0.1, dur: 0.35 }),
    defeat: () => sfx.arp([note(-5), note(-8), note(-12), note(-17)], { step: 0.2, type: 'triangle', vol: 0.12, dur: 0.5 }),
  };
}
