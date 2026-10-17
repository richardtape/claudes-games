// Tiny WebAudio synth: sound effects with zero asset files.
//
//   const sfx = createSfx('my-game');
//   sfx.tone({ freq: 660, to: 990, type: 'square', dur: 0.08 });
//   sfx.noise({ dur: 0.15, freq: 800 });            // thud / whoosh / hit
//   sfx.arp([523, 659, 784], { step: 0.06 });       // little fanfare
//   sfx.tone({ freq: 110, at: sfx.now() + 0.5 });    // on the audio clock (see shared/seq.js)
//   muteButton.onclick = () => sfx.toggleMute();
//
// The AudioContext is created lazily and unlocked on the first pointer/key press, so calls
// made before any user gesture are silently dropped instead of logging warnings.
import { store } from './arcade.js';

export function createSfx(slug, { volume = 0.5 } = {}) {
  const saved = store(slug);
  let muted = saved.get('muted', false);
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let unlocked = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  const unlock = () => {
    unlocked = true;
    ensure();
  };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });

  const ready = () => unlocked && !muted && ensure();

  function env(gain, t0, attack, dur, vol) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  /**
   * One oscillator note. `to` glides the pitch. Types: sine, square, sawtooth, triangle.
   * `at` is an absolute audio-clock time (from now()) for sequencers; otherwise `delay` seconds.
   */
  function tone({ freq = 440, to = null, type = 'sine', dur = 0.12, vol = 0.25, attack = 0.005, delay = 0, at = null } = {}) {
    if (!ready()) return;
    const t0 = at ?? ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    env(g, t0, attack, dur, vol);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Filtered white noise: thuds (low freq), hiss/whoosh (high freq, `to` sweeps the filter). */
  function noise({ dur = 0.15, vol = 0.3, freq = 1200, to = null, q = 1, type = 'lowpass', delay = 0, attack = 0.002, at = null } = {}) {
    if (!ready()) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = at ?? ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ctx.createGain();
    env(g, t0, attack, dur, vol);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** Play a sequence of frequencies, `step` seconds apart. */
  function arp(freqs, { step = 0.07, type = 'triangle', dur = 0.14, vol = 0.2, delay = 0 } = {}) {
    freqs.forEach((f, i) => tone({ freq: f, type, dur, vol, delay: delay + i * step }));
  }

  function setMuted(m) {
    muted = !!m;
    saved.set('muted', muted);
    if (master) master.gain.value = muted ? 0 : volume;
  }

  return {
    tone,
    noise,
    arp,
    setMuted,
    toggleMute: () => (setMuted(!muted), muted),
    /** Audio-clock time in seconds, or null before the first gesture / while muted. */
    now: () => (ready() ? ctx.currentTime : null),
    get muted() {
      return muted;
    },
  };
}

/** Semitone helper: note(0) = A4 (440Hz), note(3) = C5, note(-12) = A3. */
export const note = (semitones, base = 440) => base * 2 ** (semitones / 12);
