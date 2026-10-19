// Dead Drop's score, as data: a 1960s spy-surf piece in E minor for the table, a title theme,
// a lounge bossa for the lobby, a one-bar flourish for each city, and the victory, defeat and
// spy-chord cues. Pure: nothing here makes a sound. js/audio.js plays it on shared/seq.js.
//
// Pitch: semitones from A4, as sfx `note()` takes them (E2 = −29, E3 = −17, E4 = −5). The data
// is written as note names ("E2", "Bb3", "D#4") and converted when the module loads.
//
// Step music (tableNotes, titleNotes, lobbyNotes) returns the Notes that start on one sixteenth
// step: Note = { voice, semi?, dur, vol }, with `dur` in STEPS (seconds = dur × 15 / bpm).
// Drums have no semi, except toms (a snare with a semi: the tom's pitch) and the final turn's
// heart and tick. Voices: bass (triangle), riff (the surf guitar), brass (one Note per chord
// tone), hat, kick, snare, heart, tick; the lobby adds rim (the clave) and keys (soft triangle
// chords). Phrases (FLOURISH, CUES) are { bpm, beats, voice, notes: [[beat, semi, beats, voice?]] }
// (semi null for drums, voice defaulting to the phrase's); phraseNotes() times them in SECONDS.
// VOL is each voice's level; play everything at MUSIC_VOL of it.
//
// Form at 128 bpm: intro (bass alone, 4 bars, once), then A 8, A2 8 (adds brass), B 8, break 4
// (drums and bass), and back to A. Pass p (each trip round those 28 bars) plays riff p % 2 and
// B chords p % 2, so nothing repeats for 4 + 56 bars (about 112 s), and fills vary the repeats.
// A is | Em | Em | C | B7 | twice. The bass drives a 3+3+2 tresillo, climbs E G A Bb B in its
// second bar and walks B7 down B A G F# D# into E. Riff 0 is the hook (B, E, G, F# E D# E: the
// minor-major D# is the spy colour); riff 1 tremolo-picks a second line. A2's brass vamps the old
// spy line B–C–C#–C over E. B, the bridge, is Am Am Em Em F F B7 B7, or G G Bb Bb C C B7 B7 on
// odd passes: roots A never uses (A, F, G, Bb), over a snare train beat. The break is the
// intro's bass under surf toms.
import { TURNS } from './data.js';

export const BPM = 128;
export const TITLE_BPM = 120;
export const LOBBY_BPM = 132;
export const MUSIC_VOL = 0.7;
export const FORM = [['intro', 4], ['A', 8], ['A2', 8], ['B', 8], ['break', 4]];
export const VOL = { bass: 0.11, riff: 0.045, brass: 0.032, keys: 0.028, hat: 0.026, kick: 0.16, snare: 0.07, rim: 0.05, heart: 0.22, tick: 0.04 };

// ---------------------------------------------------------------------------------- notation
const PC = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
const ACC = { '#': 1, b: -1, '': 0 };
function pitch(name) {
  const m = /^([A-G])(#|b|)(\d)$/.exec(name);
  if (!m) throw new Error(`music.js: bad note "${name}"`);
  return PC[m[1]] + ACC[m[2]] + (m[3] - 4) * 12;
}
const E2 = pitch('E2');

/** One bar of sixteenths, "E2:3 z:2 G4~4 A4" → [[step, semi, dur, k]]. ":n" holds n steps
 *  (default 1), "~n" tremolo-picks the note on each of n steps (a little softer), z rests. */
function measure(text, shift = 0) {
  const out = [];
  let step = 0;
  for (const tok of text.trim().split(/\s+/)) {
    const [, name, mark, n] = /^([^:~]+)([:~]?)(\d*)$/.exec(tok);
    const len = Number(n || 1);
    if (name !== 'z') {
      const semi = pitch(name) + shift;
      if (mark === '~') for (let i = 0; i < len; i++) out.push([step + i, semi, 1, 0.75]);
      else out.push([step, semi, len, 1]);
    }
    step += len;
  }
  if (step !== 16) throw new Error(`music.js: a bar of ${step} steps: "${text}"`);
  return out;
}

// Brass voicings sit low, like trombones; the lobby's keys play rootless jazz voicings.
const CHORD = Object.fromEntries(
  Object.entries({
    Em: 'E3 G3 B3', 'Em+': 'E3 G3 C4', Em6: 'E3 G3 C#4', EmM7: 'E3 G3 B3 D#4', EmM9: 'E3 G3 B3 D#4 F#4',
    C: 'E3 G3 C4', B7: 'D#3 A3 B3', Am: 'E3 A3 C4', F: 'F3 A3 C4', G: 'D3 G3 B3', Bb: 'D3 F3 Bb3',
    Em9: 'G3 B3 D4 F#4', Am7: 'G3 C4 E4', D9: 'F#3 C4 E4', Gmaj7: 'F#3 A3 B3 D4',
    Cmaj7: 'E3 G3 B3 D4', 'F#m7b5': 'E3 A3 C4', B7b9: 'A3 C4 D#4 F#4',
  }).map(([k, v]) => [k, v.split(' ').map(pitch)]),
);
const ROOT = { Em: 'E2', Am: 'A2', C: 'C3', F: 'F2', G: 'G2', Bb: 'Bb2', B7: 'B2' };

// ---------------------------------------------------------------------------------- the table
const drive = (chord) => measure('E2:3 E2:3 E2:2 B2:2 E3:2 B2:2 E2:2', pitch(ROOT[chord]) - E2);
const CLIMB = measure('E2:3 E2:3 E2:2 G2:2 A2:2 Bb2:2 B2:2');
const TURN = measure('B2:3 B2:3 B2:2 A2:2 G2:2 F#2:2 D#2:2');
const PICKUP = measure('E2:3 E2:3 E2:2 B2 Bb2 A2 G2 F#2:2 D#2:2');
const RUN_IN = [drive('Em'), CLIMB, drive('Em'), PICKUP]; // the intro, and the break's bass
const BASS_A = [drive('Em'), CLIMB, drive('C'), TURN, drive('Em'), CLIMB, drive('C'), TURN];

const HOOK = ['B3:3 E4:3 G4:2 F#4:2 E4:2 D#4:2 E4:2', 'z:2 E4 E4 G4:2 A4:2 Bb4:2 A4:2 G4:2 F#4:2'];
const SHIMMER = ['B3~2 E4~2 G4~2 B4~4 Bb4~2 A4~2 G4~2', 'F#4~2 G4~2 E4~6 z:4 B3:2'];
const RIFF_A = [
  [...HOOK, 'C5:3 B4:3 G4:2 E4:4 z:2 G4 B4', 'A4:3 G4:3 F#4:2 D#4:6 z:2',
    ...HOOK, 'C5:3 B4:3 G4:2 E4:2 F#4:2 G4:2 A4:2', 'B4:6 A4 G4 F#4:2 D#4:2 B3:4'],
  [...SHIMMER, 'E4~4 G4~2 C5~2 B4~4 G4~2 E4~2', 'F#4~2 G4~2 F#4~4 D#4~6 z:2',
    ...SHIMMER, 'C5~4 B4~4 G4~4 E4~4', 'B4~4 A4~4 F#4~4 D#4:2 B3:2'],
].map((bars) => bars.map((t) => measure(t)));

const VAMP = [[0, 'Em6', 3], [6, 'Em+', 2]]; // [step, chord, steps]
const C_HITS = [[0, 'C', 2], [12, 'C', 1], [14, 'C', 2]];
const tutti = (c) => [[0, c, 2], [3, c, 2], [6, c, 2]]; // the whole band on the tresillo
const BRASS_A2 = [[[0, 'Em', 3], [6, 'Em+', 2]], VAMP, C_HITS, tutti('B7'), [[0, 'EmM7', 2], [6, 'Em+', 2]], VAMP, C_HITS, [[0, 'B7', 6], [10, 'B7', 2]]];

const BRIDGE = [
  {
    chords: ['Am', 'Am', 'Em', 'Em', 'F', 'F', 'B7', 'B7'],
    riff: ['A3:4 C4:4 E4:6 z:2', 'D4:2 C4:2 B3:2 C4:2 A3:8', 'G3:4 B3:4 E4:6 z:2', 'F#4:2 E4:2 D#4:2 E4:2 B3:8',
      'F4:4 E4:2 F4:2 A4:6 z:2', 'G4:2 F4:2 E4:2 D4:2 C4:8', 'B3:4 D#4:4 F#4:4 A4:4', 'B4:6 A4:2 F#4:2 D#4:2 z:4'],
  },
  {
    chords: ['G', 'G', 'Bb', 'Bb', 'C', 'C', 'B7', 'B7'],
    riff: ['B3:4 D4:4 G4~6 z:2', 'F#4:2 G4:2 A4:2 G4:2 D4~8', 'D4:4 F4:4 Bb4~6 z:2', 'A4:2 Bb4:2 C5:2 Bb4:2 F4~8',
      'E4:4 G4:4 B4~6 z:2', 'D5:2 C5:2 B4:2 G4:2 E4~8', 'B3:4 D#4:4 F#4:4 A4:4', 'B4:6 A4:2 F#4:2 D#4:2 z:4'],
  },
].map(({ chords, riff }) => ({
  bass: chords.map((c, i) => (i === 7 ? TURN : drive(c))),
  riff: riff.map((t) => measure(t)),
  brass: chords.map((c, i) => (i === 7 ? tutti(c) : i % 2 ? [[6, c, 2], [10, c, 2]] : [[0, c, 4]])),
}));

// Drum grids, one character per sixteenth: x hit, o softer, g ghost, O open hat, L and H low
// and high toms (the snare voice with a pitch).
const HIT = { x: { k: 1 }, o: { k: 0.6 }, g: { k: 0.3 }, O: { k: 1, dur: 2 }, L: { k: 1, dur: 1.5, semi: -17 }, H: { k: 0.6, dur: 1.5, semi: -10 } };
const DRUM_DUR = { kick: 1.5, snare: 1, hat: 0.3, rim: 0.3 };
const KIT = {
  A: { kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'o.x.o.x.o.x.o.x.' },
  A2: { kick: 'x.....x.x.....x.', snare: '....x..g....x...', hat: 'o.x.o.x.o.x.o.x.' },
  B: { kick: 'x.......x.......', snare: 'g.g.x.g.g.g.x.g.', hat: '..o...o...o...o.' },
  break: { kick: 'x.......x.......', snare: 'L.HHL.HHL.HHL.HH', hat: '..O...O...O...O.' },
};

/** Parts, bar by bar, → bars[b][step] = the frozen Notes that start there. */
function compile({ bass = [], riff = [], brass = [], keys = [], kit = {}, swell = [], riffVol = 1 }) {
  const n = Math.max(bass.length, riff.length, brass.length, keys.length);
  return Array.from({ length: n }, (_, b) => {
    const steps = Array.from({ length: 16 }, () => []);
    const add = (s, note) => steps[s].push(Object.freeze(note));
    for (const [s, semi, dur] of bass[b] ?? []) add(s, { voice: 'bass', semi, dur, vol: VOL.bass * (swell[b] ?? 1) });
    for (const [s, semi, dur, k] of riff[b] ?? []) add(s, { voice: 'riff', semi, dur, vol: VOL.riff * k * riffVol });
    for (const [voice, hits] of [['brass', brass[b]], ['keys', keys[b]]])
      for (const [s, chord, dur] of hits ?? []) for (const semi of CHORD[chord]) add(s, { voice, semi, dur, vol: VOL[voice] });
    for (const [voice, grid] of Object.entries(kit))
      [...grid].forEach((c, s) => {
        const h = HIT[c];
        if (h) add(s, { voice, ...(h.semi !== undefined && { semi: h.semi }), dur: h.dur ?? DRUM_DUR[voice], vol: VOL[voice] * h.k });
      });
    return steps;
  });
}

const TABLE = [0, 1].map((v) => ({
  intro: compile({ bass: RUN_IN, swell: [0.7, 0.8, 0.9, 1] }),
  A: compile({ bass: BASS_A, riff: RIFF_A[v], kit: KIT.A }),
  A2: compile({ bass: BASS_A, riff: RIFF_A[v], brass: BRASS_A2, kit: KIT.A2 }),
  B: compile({ ...BRIDGE[v], kit: KIT.B }),
  break: compile({ bass: RUN_IN, kit: KIT.break }),
}));

// A note sounds only if both its section and the round's level allow its voice.
const ALL = ['bass', 'riff', 'brass', 'hat', 'kick', 'snare'];
const SECTION_VOICES = { intro: ['bass'], A: ['bass', 'riff', 'hat', 'kick', 'snare'], A2: ALL, B: ALL, break: ['bass', 'hat', 'kick', 'snare'] };
const LEVEL_VOICES = { 0: ['bass', 'hat'], 1: ['bass', 'hat', 'kick', 'snare', 'riff'], 2: ALL, break: ['bass', 'kick', 'hat'] };

const INTRO = FORM[0][1];
const CYCLE = FORM.slice(1).reduce((n, [, len]) => n + len, 0);

/** Where bar `bar` (counted from the start of the table music) falls in the form. */
export function sectionAt(bar) {
  if (bar < INTRO) return { id: 'intro', bar, pass: 0 };
  const pass = Math.floor((bar - INTRO) / CYCLE);
  let b = (bar - INTRO) % CYCLE;
  for (const [id, len] of FORM.slice(1)) {
    if (b < len) return { id, bar: b, pass };
    b -= len;
  }
}

/** How much of the band plays: 0 bass and hats (turn 1), 1 adds drums and riff (turns 2–4),
 *  2 adds brass (turn 5, or once the stake is raised), 'final' (turn 6), 'break' between turns. */
export function levelFor(view) {
  if (view.phase !== 'plan') return 'break';
  const { turn, stake } = view.round;
  if (turn >= TURNS) return 'final';
  if (turn >= TURNS - 1 || stake > 1) return 2;
  return turn >= 2 ? 1 : 0;
}

// The final turn: a heartbeat, lub-dub twice a bar, over a clock going tick, tock on the beats.
function finalNotes(step) {
  const out = [];
  if (step % 8 === 0) out.push({ voice: 'heart', semi: -34, dur: 1.5, vol: VOL.heart });
  if (step % 8 === 3) out.push({ voice: 'heart', semi: -36, dur: 1.5, vol: VOL.heart * 0.7 });
  if (step % 4 === 0) out.push({ voice: 'tick', semi: step % 8 ? 15 : 20, dur: 0.2, vol: VOL.tick });
  return out;
}

// Only the last bar of each 4-bar phrase consults rand: each draw below 0.35 lifts a riff note
// an octave or adds a tom to the fill (steps 13–15, high to low).
const FILL = { 13: -5, 14: -10, 15: -17 };
function withFill(notes, step, rand) {
  const out = notes.map((n) => (n.voice === 'riff' && rand() < 0.35 ? { ...n, semi: n.semi + 12, vol: n.vol * 0.8 } : n));
  if (step in FILL && rand() < 0.35) out.push({ voice: 'snare', semi: FILL[step], dur: 1.5, vol: VOL.snare * (0.6 + (step - 13) * 0.2) });
  return out;
}

/** The Notes starting on `step` (0–15) of table bar `bar` at a levelFor() level. */
export function tableNotes(bar, step, level, rand = () => 1) {
  if (level === 'final') return finalNotes(step);
  const { id, bar: b, pass } = sectionAt(bar);
  const notes = TABLE[pass % 2][id][b][step];
  const ok = (n) => SECTION_VOICES[id].includes(n.voice) && LEVEL_VOICES[level].includes(n.voice);
  return (b % 4 === 3 ? withFill(notes, step, rand) : notes).filter(ok);
}

// ---------------------------------------------------------------------------------- title and lobby
const wrap = (bar) => ((bar % 8) + 8) % 8;

// The title theme is A2's hook with the full band, opening on the spy chord. 8 bars at 120 bpm.
const TITLE = compile({ bass: BASS_A, riff: RIFF_A[0], brass: [[[0, 'EmM9', 3], [6, 'Em+', 2]], ...BRASS_A2.slice(1)], kit: KIT.A });
export function titleNotes(bar, step, rand = () => 1) {
  const b = wrap(bar);
  return b % 4 === 3 ? withFill(TITLE[b][step], step, rand) : TITLE[b][step].slice();
}

// The lobby: a lounge bossa, 8 bars at 132 bpm, down the circle of fifths to B7 and home.
// [chord, root, melody]. The bass rocks root and fifth; the rim plays the clave.
const LOBBY_SHEET = [
  ['Em9', 'E2', 'z:2 B4:2 D5:2 F#5:4 E5:2 D5:4'],
  ['Em9', 'E2', 'B4:12 z:4'],
  ['Am7', 'A2', 'z:2 C5:2 E5:2 G5:4 F#5:2 E5:4'],
  ['D9', 'D3', 'C5:12 z:4'],
  ['Gmaj7', 'G2', 'z:2 B4:2 D5:2 F#5:4 E5:2 D5:4'],
  ['Cmaj7', 'C3', 'B4:12 z:4'],
  ['F#m7b5', 'F#2', 'z:2 A4:2 C5:2 E5:4 D5:2 C5:2 A4:2'],
  ['B7b9', 'B2', 'D#5:6 C5:2 B4:8'],
];
const LOBBY = compile({
  bass: LOBBY_SHEET.map(([c, r]) => measure(c.includes('b5') ? 'E2:6 Bb2:2 Bb2:6 E2:2' : 'E2:6 B2:2 B2:6 E2:2', pitch(r) - E2)),
  keys: LOBBY_SHEET.map(([c]) => [[0, c, 6], [6, c, 4], [10, c, 6]]),
  riff: LOBBY_SHEET.map(([, , tune]) => measure(tune)),
  riffVol: 0.6,
  kit: { rim: 'x..x..x...x..x..', hat: 'g.o.g.o.g.o.g.o.' },
});
export function lobbyNotes(bar, step, rand = () => 1) {
  const b = wrap(bar);
  const notes = LOBBY[b][step].slice();
  if (b % 4 === 3 && step >= 14 && rand() < 0.35) notes.push({ voice: 'rim', dur: 0.3, vol: VOL.rim * 0.4 });
  return notes;
}

// ---------------------------------------------------------------------------------- phrases
/** [[beat, "E4" | "E3+B3" (a chord) | "-" (a drum), beats, voice?]] → a phrase. */
function phrase(bpm, beats, voice, list) {
  const notes = list.flatMap(([at, names, len, v]) => names.split('+').map((n) => [at, n === '-' ? null : pitch(n), len, ...(v ? [v] : [])]));
  return { bpm, beats, voice, notes };
}
const run = (from, names, gap, len, voice) => names.split(' ').map((n, i) => [from + i * gap, n, len, voice]);

/** A phrase's notes timed in seconds: [{ t, semi, dur, voice }]. */
export function phraseNotes({ bpm, notes, voice = 'riff' }) {
  const beat = 60 / bpm;
  return notes.map(([at, semi, len, v = voice]) => ({ t: at * beat, semi, dur: len * beat, voice: v }));
}

// One bar per city, played when you win it. All centre on E, so they sit over the score.
export const FLOURISH = {
  // Fado: the Portuguese guitar turns down to E over the viola's bass.
  lisbon: phrase(220, 4, 'riff', [...run(0, 'B4 C5', 0.25, 0.25), [0.5, 'B4', 0.5], ...run(1, 'G4 A4 G4 F#4', 0.25, 0.25),
    [2, 'E4', 0.5], [2.5, 'D#4', 0.5], [3, 'E4', 0.9], [0, 'E3', 1.5, 'bass'], [2, 'B2', 1.5, 'bass']]),
  // A Viennese waltz in 3/4: oom-pah-pah under a zither line, as in The Third Man.
  vienna: phrase(180, 3, 'riff', [[0, 'B4', 1], ...run(1, 'E5 D#5 E5 G5', 0.5, 0.45),
    [0, 'E3', 0.9, 'bass'], [1, 'G3+B3', 0.45, 'keys'], [2, 'G3+B3', 0.45, 'keys']]),
  // Hijaz on E (E F G# A B C D): a run up and back over a drone.
  istanbul: phrase(220, 4, 'riff', [...run(0, 'E4 F4 G#4 A4 B4 C5 D5 E5 D5 C5 B4 A4 G#4 F4', 0.25, 0.25), [3.5, 'E4', 0.5], [0, 'E3', 4, 'bass']]),
  // Weill cabaret: oom-pah with a sour sixth chord on the piano and a sly muted trumpet.
  berlin: phrase(216, 4, 'brass', [[0, 'B4', 0.75], [0.75, 'C5', 0.25], [1, 'B4', 0.5], [1.5, 'A#4', 0.5], [2, 'B4', 0.75], [2.75, 'G4', 0.25],
    [3, 'E4', 0.9], [0, 'E2', 0.5, 'bass'], [2, 'B2', 0.5, 'bass'], [1, 'G3+C#4+E4', 0.4, 'keys'], [3, 'G3+C#4+E4', 0.4, 'keys']]),
  // Mambo: brass hits on the tresillo (3+3+2), a piano montuno between, the tumbao under.
  havana: phrase(210, 4, 'brass', [[0, 'E4+G4+B4+D5', 0.35], [1.5, 'E4+G4+B4+D5', 0.35], [3, 'E4+G4+B4+E5', 0.6],
    ...run(0.5, 'B4 G4', 0.5, 0.25, 'keys'), ...run(2, 'B4 G4', 0.5, 0.25, 'keys'), [0, 'E2', 0.5, 'bass'], [1.5, 'B2', 1, 'bass'], [3, 'E3', 0.6, 'bass']]),
  // Monte Carlo: a harp glissando up E major pentatonic, then the jackpot, an E 6/9 chord.
  monaco: phrase(240, 4, 'keys', [...run(0, 'E4 F#4 G#4 B4 C#5 E5 F#5 G#5 B5 C#6 E6', 0.125, 0.25), [1.5, 'E5+G#5+B5+C#6+F#6', 2], [1.5, 'E3', 2, 'bass']]),
  // Pentatonic (E G A B D), plucked like a pipa, ending in a tremolo.
  hongkong: phrase(220, 4, 'riff', [...run(0, 'B4 D5', 0.25, 0.25), [0.5, 'E5', 0.5], ...run(1, 'D5 B4', 0.25, 0.25), [1.5, 'A4', 0.5],
    ...run(2, 'G4 A4 B4 D5', 0.25, 0.25), ...run(3, 'E5 E5 E5 E5 E5 E5', 0.125, 0.125), [0, 'E3', 2, 'bass']]),
  // Cold open fifths in the horns, stacking up to E B F# C#, with ice on top.
  helsinki: phrase(240, 4, 'brass', [[0, 'E3+B3', 1.5], [1.5, 'D3+A3', 0.5], [2, 'E3+B3+F#4+C#5', 1.8], [0, 'B5', 0.5, 'keys'], [2, 'F#6', 1.5, 'keys']]),
  // A minor folk march: the band's tune, oom-pah bass, a snare ruff into the last note.
  moscow: phrase(210, 4, 'brass', [[0, 'E4', 0.75], [0.75, 'E4', 0.25], [1, 'G4', 0.5], [1.5, 'B4', 0.5], [2, 'A4', 0.5], [2.5, 'F#4', 0.5], [3, 'E4', 0.75],
    ...run(0, 'E2 B2 E2 E2', 1, 0.4, 'bass'), ...run(0, '- - -', 1, 0.2, 'snare'), ...run(2.75, '- -', 0.125, 0.1, 'snare'), [3, '-', 0.3, 'snare']]),
  // A barcarolle in 6/8 (beats are eighths): the gondola rocks, the tune sighs.
  venice: phrase(330, 6, 'riff', [[0, 'B4', 2], [2, 'C5', 1], [3, 'B4', 2], [5, 'G4', 0.9],
    [0, 'E3', 0.9, 'bass'], [3, 'B2', 0.9, 'bass'], ...run(1, 'B3 G4', 1, 0.9, 'keys'), ...run(4, 'B3 G4', 1, 0.9, 'keys')]),
  // Double harmonic on E (E F G# A B C D#), swaying down over a tambourine.
  tangier: phrase(220, 4, 'riff', [[0, 'E5', 0.5], ...run(0.5, 'D#5 C5', 0.25, 0.25), [1, 'B4', 1], ...run(2, 'C5 B4 G#4 F4', 0.25, 0.25), [3, 'E4', 0.75],
    ...[0, 0.75, 1.5, 2, 2.5, 3].map((b) => [b, '-', 0.25, 'hat'])]),
};

export const CUES = {
  // The hook's opening climbs to B, a snare roll, then E major 6/9: the agent comes home.
  victory: phrase(160, 6, 'riff', [...run(0, 'B3 E4 G4', 0.5, 0.5), ...run(1.5, 'F#4 G4', 0.25, 0.25), [2, 'B4', 1], ...run(2.5, '- - - -', 0.125, 0.1, 'snare'),
    [3, 'E5', 3], [3, 'E3+G#3+B3+C#4+F#4', 3, 'brass'], [3, 'E2', 3, 'bass'], [3, '-', 0.5, 'kick']]),
  // A chromatic slide down to a half-diminished chord over low E: the line goes dead.
  defeat: phrase(112, 4.5, 'riff', [...run(0, 'B3 Bb3 A3', 0.5, 0.5), [1.5, 'G3', 1], [2.5, 'E3+G3+Bb3+D4', 2, 'brass'], [2.5, 'E2', 2, 'bass']]),
  // E minor-major 9 (E G B D# F#), the spy chord, in semitones above E.
  spyChord: [0, 3, 7, 11, 14],
};
