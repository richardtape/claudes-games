// Dead Drop sounds, all synthesised on shared/sfx.js: paper slides and flips, a slam when the
// cards land, tricks, a brass stab and heartbeat for escalations, and the arranged score of
// js/music.js played on shared/seq.js. Three pieces: a title theme, a lobby bossa and the table's
// spy-surf piece, whose band grows as the round heats up (levelFor), drops to a heartbeat on the
// final turn and falls silent while the last cards land (hush), until the spy chord rings out.
// Each city won plays its flourish; the match ends on a victory or defeat cue.
import { createSequencer } from '../../../shared/seq.js';
import { note } from '../../../shared/sfx.js';
import { store } from '../../../shared/arcade.js';
import { BPM, CUES, FLOURISH, LOBBY_BPM, MUSIC_VOL, TITLE_BPM, VOL, lobbyNotes, phraseNotes, tableNotes, titleNotes } from './music.js';

const E3 = -17; // semitones from A4

/** The pieces: their tempo, and the Notes that start on one step (bars count from the piece's start). */
const SCENES = {
  title: { bpm: TITLE_BPM, notes: (bar, step) => titleNotes(bar, step, Math.random) },
  lobby: { bpm: LOBBY_BPM, notes: (bar, step) => lobbyNotes(bar, step, Math.random) },
  table: { bpm: BPM, notes: (bar, step, level) => tableNotes(bar, step, level, Math.random) },
};

// Cues (city flourishes, victory, defeat) stand in for the effects they replaced and play while
// the band is hushed or held, so they sit at effect level: VOL × CUE rather than × MUSIC_VOL
// (measured offline: a flourish then peaks about as loud as the old city twang).
const CUE = 1.3;

export const VOICES = ['bass', 'riff', 'brass', 'keys', 'hat', 'kick', 'snare', 'rim', 'heart', 'tick'];

/**
 * The band, 8-bit style: one function per voice, playing one note as (semi, at, dur, vol). `semi`
 * is semitones from A4 (null or undefined for an unpitched drum), `at` an audio-clock time and
 * `dur` seconds. Also `twang` (the surf guitar) and `tri` (a plain triangle, for the losing side
 * of a flourish). The gains inside balance the voices against each other, set from offline
 * renders: filtered noise carries far less energy than an oscillator at the same `vol`, so the
 * drums need more of it to sit level with the bass, and a small knock or click lets the low
 * drums (kick, heart) come through laptop and phone speakers.
 */
export function createVoices(sfx) {
  const twang = (semi, at, dur, vol) => {
    sfx.tone({ freq: note(semi), type: 'square', dur, vol, at, attack: 0.002 });
    sfx.tone({ freq: note(semi) * 2.01, type: 'triangle', dur: dur * 0.6, vol: vol * 0.5, at });
  };
  return {
    twang,
    tri: (semi, at, dur, vol) => sfx.tone({ freq: note(semi), type: 'triangle', dur: Math.max(dur, 0.06), vol, at }),
    bass: (semi, at, dur, vol) => sfx.tone({ freq: note(semi), type: 'triangle', dur: Math.max(dur, 0.06), vol, at }),
    riff: (semi, at, dur, vol) => twang(semi, at, dur, vol * 1.2),
    // Three detuned sawtooths, a section of trombones.
    brass(semi, at, dur, vol) {
      for (const d of [0.994, 1, 1.006]) sfx.tone({ freq: note(semi) * d, type: 'sawtooth', dur: Math.max(dur, 0.08), vol: vol * 0.6, at, attack: 0.02 });
    },
    // Soft electric-piano chord tones: a triangle with a faint bell an octave up.
    keys(semi, at, dur, vol) {
      sfx.tone({ freq: note(semi), type: 'triangle', dur: Math.max(dur, 0.1), vol, at, attack: 0.012 });
      sfx.tone({ freq: note(semi + 12), type: 'sine', dur: Math.min(dur, 0.3), vol: vol * 0.3, at, attack: 0.004 });
    },
    hat: (_, at, dur, vol) => sfx.noise({ dur: Math.max(dur, 0.03), freq: 7000, type: 'highpass', vol: vol * 2, at }),
    kick(_, at, dur, vol) {
      sfx.tone({ freq: 90, to: 40, type: 'sine', dur, vol, at, attack: 0.002 });
      sfx.noise({ dur: 0.012, freq: 1500, vol: vol * 0.5, at });
    },
    snare(semi, at, dur, vol) {
      if (semi === null || semi === undefined) {
        sfx.noise({ dur: Math.max(dur, 0.06), freq: 1800, type: 'bandpass', q: 0.7, vol: vol * 5, at });
        sfx.tone({ freq: 190, to: 110, type: 'triangle', dur: Math.min(Math.max(dur, 0.04), 0.07), vol: vol * 1.2, at, attack: 0.002 });
        return;
      }
      // A surf tom: a falling triangle and a breath of skin.
      sfx.tone({ freq: note(semi), to: note(semi) * 0.7, type: 'triangle', dur, vol: vol * 1.6, at, attack: 0.002 });
      sfx.noise({ dur: 0.05, freq: 900, vol: vol * 0.6, at });
    },
    // The clave: a knock of bandpassed noise with a wooden pitch in it.
    rim(_, at, dur, vol) {
      sfx.noise({ dur: 0.03, freq: 3000, type: 'bandpass', q: 2, vol: vol * 4, at });
      sfx.tone({ freq: 2200, type: 'triangle', dur: 0.035, vol: vol * 1.5, at, attack: 0.001 });
    },
    // Today's heartbeat thump (a falling sine), with a knock that small speakers can carry.
    heart(semi, at, dur, vol) {
      sfx.tone({ freq: note(semi), to: note(semi) * 0.67, type: 'sine', dur, vol, at });
      sfx.noise({ dur: 0.06, freq: 320, vol: vol * 1.2, at });
    },
    tick: (semi, at, dur, vol) => sfx.tone({ freq: note(semi), type: 'square', dur: 0.02, vol: vol * 1.6, at }),
  };
}

export function createAudio(sfx, slug) {
  const saved = store(slug);
  const voice = createVoices(sfx);
  let musicOn = saved.get('music', true);
  let sceneName = null; // 'title' | 'lobby' | 'table' | null
  let away = false; // the window is in the background (pause()) until resume()
  let level = 0; // the table band's level (levelFor), as it plays
  let wantLevel = 0; // the level asked for: it lands on the next bar line (night falls at once)
  let hushed = false; // the bars run on, but no notes play
  let holdUntil = 0; // audio-clock time a cue holds the band until
  let pos = 0; // sixteenths since the piece began: runs on through hushes and every pass of the form
  const played = Object.fromEntries(VOICES.map((v) => [v, 0])); // notes scheduled, per voice
  const play = (name, semi, at, dur, vol, synth = voice[name]) => {
    played[name]++;
    synth(semi, at, dur, vol);
  };

  const seq = createSequencer(sfx, {
    bpm: BPM,
    steps: 16, // the sequencer's own count is unused: pos is the bar counter
    onStep(_, at) {
      const piece = SCENES[sceneName];
      if (!piece) return;
      const bar = Math.floor(pos / 16);
      const step = pos % 16;
      pos++;
      if (step === 0) level = wantLevel;
      if (hushed || at < holdUntil) return;
      const secs = 15 / seq.bpm; // a step's length: Note durations are in steps
      for (const n of piece.notes(bar, step, level)) play(n.voice, n.semi, at, n.dur * secs, n.vol * MUSIC_VOL);
    },
  });

  // Never play into a hidden tab (a window behind others counts as hidden) or a window in the
  // background. A piece that (re)starts always starts from its first bar.
  const sync = () => {
    if (!SCENES[sceneName] || !musicOn || away || document.hidden) return seq.stop();
    if (seq.playing) return;
    pos = 0;
    level = wantLevel;
    seq.start();
  };

  /** Play a phrase (a flourish or cue) now, at effect level. `synth` replaces pitched voices. */
  function cue(phrase, { shift = 0, gain = 1, synth = null, holdBand = false } = {}) {
    const t0 = sfx.now();
    if (t0 === null) return;
    const at = t0 + 0.03;
    const notes = phraseNotes(phrase);
    for (const n of notes) {
      const drum = n.semi === null;
      play(n.voice, drum ? null : n.semi + shift, at + n.t, n.dur, VOL[n.voice] * CUE * gain, !drum && synth ? synth : voice[n.voice]);
    }
    if (holdBand) holdUntil = at + Math.max(...notes.map((n) => n.t + n.dur));
  }

  return {
    /** Switch the piece ('title' | 'lobby' | 'table' | null): from its first bar, at its tempo. The same piece again is a no-op while it plays. */
    scene(name) {
      if (name !== sceneName) {
        sceneName = name;
        seq.stop();
        if (SCENES[name]) seq.bpm = SCENES[name].bpm;
      }
      sync();
    },
    get sceneName() {
      return sceneName;
    },
    /** The window went to the background: stop the music, keeping the piece. */
    pause() {
      away = true;
      sync();
    },
    /** The window is back: the current piece plays again from its first bar. */
    resume() {
      away = false;
      sync();
    },
    /** The table band's level (levelFor): it changes on the next bar line, except into and out of the final turn. */
    level(l) {
      wantLevel = l;
      if (l === 'final' || level === 'final' || !seq.playing) level = l;
    },
    /** Hushed, the bars run on but nothing plays. */
    hush(on) {
      hushed = !!on;
    },
    played,
    get musicOn() {
      return musicOn;
    },
    toggleMusic() {
      musicOn = !musicOn;
      saved.set('music', musicOn);
      sync();
      return musicOn;
    },
    /** The final flip: the spy chord (E minor-major 9) strummed on the surf guitar over a sawtooth pad. */
    spyChord() {
      const t0 = sfx.now();
      if (t0 === null) return;
      const at = t0 + 0.05;
      CUES.spyChord.forEach((s, i) => {
        voice.twang(E3 + s, at + i * 0.028, 1.6, 0.045);
        sfx.tone({ freq: note(E3 + s), type: 'sawtooth', dur: 1.6, vol: 0.016, at, attack: 0.3 });
      });
      sfx.tone({ freq: note(E3 - 12), type: 'sawtooth', dur: 1.6, vol: 0.03, at, attack: 0.2 });
    },
    /** A city won: its flourish. The other side's win plays an octave down, on a triangle, softer. */
    flourish(cityId, mine) {
      const phrase = FLOURISH[cityId];
      if (phrase) cue(phrase, mine ? {} : { shift: -12, gain: 0.7, synth: voice.tri });
    },
    victory: () => cue(CUES.victory, { holdBand: true }),
    defeat: () => cue(CUES.defeat, { holdBand: true }),
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
    nobody: () => sfx.tone({ freq: 196, to: 185, type: 'triangle', dur: 0.3, vol: 0.1 }),
    roundWon: () => sfx.arp([note(-5), note(-1), note(2), note(7)], { step: 0.09, type: 'square', vol: 0.09, dur: 0.25 }),
    roundLost: () => sfx.arp([note(2), note(-2), note(-5), note(-9)], { step: 0.12, type: 'triangle', vol: 0.12, dur: 0.3 }),
    fold: () => sfx.tone({ freq: 392, to: 130, type: 'sawtooth', dur: 0.5, vol: 0.08 }),
  };
}
