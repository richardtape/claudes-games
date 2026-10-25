// Every sound in Penny a Mile, synthesised on shared/sfx.js. Rate-limited so a busy network
// doesn't turn into a din: the coin, the whistle and the chuff each have their own budget.
export function createAudio(sfx) {
  const last = {};
  const ok = (k, ms) => {
    const t = performance.now();
    if (last[k] && t - last[k] < ms) return false;
    last[k] = t;
    return true;
  };

  return {
    /** A coin's ting; bigger sums ring a little higher and brighter. */
    coin(amount) {
      if (!ok('coin', 90)) return;
      const lift = Math.min(7, Math.log2(1 + amount / 400));
      const f = 1318 * 2 ** (lift / 12);
      sfx.tone({ freq: f, type: 'triangle', dur: 0.16, vol: 0.12 });
      sfx.tone({ freq: f * 2.01, type: 'sine', dur: 0.22, vol: 0.05, delay: 0.012 });
      if (amount > 3000) sfx.tone({ freq: f * 1.5, type: 'triangle', dur: 0.2, vol: 0.07, delay: 0.07 });
    },
    whistle() {
      if (!ok('whistle', 2600)) return;
      for (const [f, d, len] of [
        [880, 0, 0.18],
        [1046, 0.22, 0.32],
      ]) {
        sfx.tone({ freq: f, to: f * 1.01, type: 'square', dur: len, vol: 0.025, delay: d, attack: 0.03 });
        sfx.tone({ freq: f * 1.5, type: 'sine', dur: len, vol: 0.03, delay: d, attack: 0.03 });
      }
      sfx.noise({ dur: 0.5, vol: 0.04, freq: 3200, type: 'bandpass', q: 2.5, attack: 0.03 });
    },
    /** A soft chuff, for when engines are moving on screen. */
    chuff(n) {
      if (!ok('chuff', 330)) return;
      sfx.noise({ dur: 0.12, vol: 0.018 * Math.min(3, n), freq: 900, to: 300, type: 'lowpass', attack: 0.004 });
    },
    build(pieces) {
      // A ratchet of rail clips, then the thud of the last length dropping in.
      const n = Math.min(8, 2 + Math.round(pieces / 4));
      for (let k = 0; k < n; k++) sfx.noise({ dur: 0.03, vol: 0.12, freq: 2600 - k * 120, type: 'bandpass', q: 3, delay: k * 0.045 });
      sfx.tone({ freq: 140, to: 80, type: 'sine', dur: 0.2, vol: 0.18, delay: n * 0.045 });
      sfx.noise({ dur: 0.12, vol: 0.12, freq: 500, delay: n * 0.045 });
    },
    station() {
      sfx.tone({ freq: 660, type: 'triangle', dur: 0.12, vol: 0.08 });
      sfx.tone({ freq: 990, type: 'triangle', dur: 0.2, vol: 0.06, delay: 0.08 });
    },
    bulldoze() {
      sfx.noise({ dur: 0.28, vol: 0.18, freq: 700, to: 200 });
      sfx.noise({ dur: 0.08, vol: 0.12, freq: 2400, type: 'bandpass', q: 2, delay: 0.05 });
    },
    nope() {
      sfx.tone({ freq: 196, to: 165, type: 'sawtooth', dur: 0.16, vol: 0.05 });
    },
    click() {
      sfx.tone({ freq: 1500, type: 'square', dur: 0.025, vol: 0.03 });
    },
    tap() {
      sfx.noise({ dur: 0.03, vol: 0.06, freq: 3000, type: 'bandpass', q: 4 });
    },
    news() {
      if (!ok('news', 400)) return;
      sfx.noise({ dur: 0.16, vol: 0.06, freq: 4200, to: 2400, type: 'bandpass', q: 1.2 });
      sfx.tone({ freq: 1568, type: 'sine', dur: 0.18, vol: 0.04, delay: 0.1 });
    },
    cheer() {
      // A crowd swells (band-passed noise in several voices), then the band's two notes.
      for (let k = 0; k < 4; k++) sfx.noise({ dur: 1.3, vol: 0.05, freq: 900 + k * 500, type: 'bandpass', q: 1.5, attack: 0.25, delay: k * 0.05 });
      sfx.arp([523, 659, 784, 1046], { step: 0.11, type: 'square', dur: 0.2, vol: 0.035, delay: 0.25 });
    },
    fanfare() {
      sfx.arp([392, 523, 659, 784], { step: 0.09, type: 'triangle', dur: 0.3, vol: 0.1 });
      sfx.arp([196, 262, 330, 392], { step: 0.09, type: 'sawtooth', dur: 0.32, vol: 0.025 });
    },
    brass() {
      // A brass-band chord for a new locomotive.
      for (const f of [262, 330, 392, 523]) sfx.tone({ freq: f, type: 'sawtooth', dur: 1.1, vol: 0.03, attack: 0.08 });
      sfx.tone({ freq: 131, type: 'triangle', dur: 1.1, vol: 0.08, attack: 0.05 });
    },
    warn() {
      sfx.tone({ freq: 440, type: 'square', dur: 0.12, vol: 0.05 });
      sfx.tone({ freq: 349, type: 'square', dur: 0.2, vol: 0.05, delay: 0.14 });
    },
    pen() {
      for (let k = 0; k < 3; k++) sfx.noise({ dur: 0.05 + Math.random() * 0.04, vol: 0.05, freq: 5200 + Math.random() * 1500, type: 'bandpass', q: 6, delay: k * 0.07 });
    },
    tick(i = 0) {
      sfx.tone({ freq: 1760 + i * 40, type: 'triangle', dur: 0.08, vol: 0.06 });
    },
    needle() {
      sfx.tone({ freq: 220, to: 660, type: 'sawtooth', dur: 1.4, vol: 0.025, attack: 0.1 });
    },
    stamp(pass) {
      sfx.noise({ dur: 0.22, vol: 0.32, freq: 380, to: 120 });
      sfx.tone({ freq: 90, to: 50, type: 'sine', dur: 0.3, vol: 0.3 });
      if (pass) sfx.arp([523, 659, 784, 1046], { step: 0.1, type: 'triangle', dur: 0.32, vol: 0.09, delay: 0.25 });
      else sfx.arp([392, 349, 311, 262], { step: 0.16, type: 'triangle', dur: 0.4, vol: 0.08, delay: 0.25 });
    },
  };
}
