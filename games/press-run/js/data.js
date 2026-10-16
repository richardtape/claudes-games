// All the tunable content for Press Run: tiles, word lengths, inks, dingbats, editors, economy.

export const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
export const RARE = new Set(['j', 'k', 'qu', 'x', 'z']);

/** Ink each tile adds when scored (Scrabble values, doubled). Blank = '?'. */
export const LETTER_INK = {
  a: 2, b: 6, c: 6, d: 4, e: 2, f: 8, g: 4, h: 8, i: 2, j: 16, k: 10, l: 2, m: 6,
  n: 2, o: 2, p: 6, qu: 16, r: 2, s: 2, t: 2, u: 2, v: 8, w: 8, x: 16, y: 8, z: 20, '?': 0,
};

/** The case you start every run with (57 tiles). */
export const STARTING_CASE = {
  e: 6, a: 5, i: 4, o: 4, u: 2,
  r: 3, t: 3, n: 3, s: 3, l: 3, d: 2,
  c: 2, h: 2, m: 2, p: 2, g: 1, b: 1, f: 1, y: 1, w: 1,
  k: 1, v: 1, x: 1, z: 1, j: 1, qu: 1,
};

/** Base Ink and Pressure for a word by letter count (9 = nine or more), and what each level adds. */
export const LENGTHS = {
  3: { ink: 10, pressure: 1, step: { ink: 10, pressure: 1 } },
  4: { ink: 20, pressure: 2, step: { ink: 15, pressure: 1 } },
  5: { ink: 35, pressure: 3, step: { ink: 20, pressure: 2 } },
  6: { ink: 50, pressure: 4, step: { ink: 25, pressure: 2 } },
  7: { ink: 70, pressure: 6, step: { ink: 30, pressure: 3 } },
  8: { ink: 90, pressure: 8, step: { ink: 35, pressure: 3 } },
  9: { ink: 120, pressure: 10, step: { ink: 40, pressure: 4 } },
};
export const MIN_WORD = 3;
export const lengthKey = (n) => Math.min(Math.max(n, MIN_WORD), 9);
export const lengthLabel = (k) => (k >= 9 ? '9+ letters' : `${k} letters`);

export const BASE_HAND = 8;
export const BASE_PRINTS = 4;
export const BASE_REDRAWS = 3;
export const DINGBAT_SLOTS = 5;
export const START_MONEY = 4;
export const EDITIONS_TO_WIN = 6;

/** Round targets. Each edition has a small deadline, a big deadline and an editor (boss). */
const EDITION_BASE = [300, 650, 1400, 3000, 6400, 13500];
export const ROUND_MULT = [1, 1.5, 2];
export const ROUND_NAMES = ['Morning edition', 'Evening edition', 'The Editor'];
export const ROUND_REWARD = [3, 4, 5];
export function roundTarget(edition, roundIndex) {
  const base =
    edition <= EDITION_BASE.length
      ? EDITION_BASE[edition - 1]
      : EDITION_BASE[EDITION_BASE.length - 1] * 2.2 ** (edition - EDITION_BASE.length);
  const raw = base * ROUND_MULT[roundIndex];
  const mag = 10 ** Math.max(1, Math.floor(Math.log10(raw)) - 1);
  return Math.round(raw / mag) * mag;
}

/** Special inks a tile can carry. */
export const INKS = {
  cyan: { name: 'Cyan ink', text: '+20 Ink when scored' },
  magenta: { name: 'Magenta ink', text: '+4 Pressure when scored' },
  gold: { name: 'Gold leaf', text: '×1.5 Pressure when scored' },
  emboss: { name: 'Emboss', text: 'Scores twice' },
};

/*
 * Dingbats are the run-defining modifiers (jokers). Hooks, all optional:
 *   onTile(ctx, tile, i)  -> effect     when a tile is scored (runs again on retriggers)
 *   retrigger(ctx, tile, i) -> n        extra times tile i scores
 *   onWord(ctx, self)     -> effect     after all tiles, left to right across the rack
 *   afterPrint(ctx, self, run)          update counters after a print (scaling dingbats)
 *   onRedraw(self)                      update counters after a redraw
 *   money(ctx)            -> dollars    earned when printing
 *   roundEnd()            -> dollars    earned when a round is cleared
 *   passive: { hand, prints, redraws }  changes round limits
 * An effect is { ink: +n } | { pressure: +n } | { xPressure: n }.
 * `text(self)` may read self.counter so scaling dingbats show their current value.
 */
export const DINGBATS = [
  // ── common ──────────────────────────────────────────────
  { id: 'fleuron', glyph: '❦', name: 'Fleuron', rarity: 'common', cost: 4,
    text: () => '+4 Pressure',
    onWord: () => ({ pressure: 4 }) },
  { id: 'manicule', glyph: '☞', name: 'Manicule', rarity: 'common', cost: 4,
    text: () => '+40 Ink',
    onWord: () => ({ ink: 40 }) },
  { id: 'pencil', glyph: '✎', name: 'Pencil', rarity: 'common', cost: 5,
    text: () => 'Each vowel scored gives +2 Pressure',
    onTile: (ctx, t) => (VOWELS.has(t.letter) ? { pressure: 2 } : null) },
  { id: 'spark', glyph: '✦', name: 'Spark', rarity: 'common', cost: 5,
    text: () => 'Each consonant scored gives +6 Ink',
    onTile: (ctx, t) => (!VOWELS.has(t.letter) ? { ink: 6 } : null) },
  { id: 'scissors', glyph: '✂', name: 'Scissors', rarity: 'common', cost: 4,
    text: () => 'Words of 4 letters or fewer: +8 Pressure',
    onWord: (ctx) => (ctx.len <= 4 ? { pressure: 8 } : null) },
  { id: 'longarm', glyph: '➹', name: 'Long Arm', rarity: 'common', cost: 5,
    text: () => '+3 Pressure for each letter beyond 4',
    onWord: (ctx) => (ctx.len > 4 ? { pressure: 3 * (ctx.len - 4) } : null) },
  { id: 'envelope', glyph: '✉', name: 'Envelope', rarity: 'common', cost: 4,
    text: () => 'Words ending in S: +6 Pressure',
    onWord: (ctx) => (ctx.word.endsWith('s') ? { pressure: 6 } : null) },
  { id: 'sunrise', glyph: '☀', name: 'Sunrise', rarity: 'common', cost: 4,
    text: () => 'Words starting with a vowel: +80 Ink',
    onWord: (ctx) => (VOWELS.has(ctx.word[0]) ? { ink: 80 } : null) },
  { id: 'anchor', glyph: '⚓', name: 'Anchor', rarity: 'common', cost: 5,
    text: () => '+25 Ink for each redraw you have left',
    onWord: (ctx) => (ctx.redrawsLeft > 0 ? { ink: 25 * ctx.redrawsLeft } : null) },
  { id: 'blossom', glyph: '✿', name: 'Blossom', rarity: 'common', cost: 5,
    text: () => 'Words with a double letter, like LL or EE: +10 Pressure',
    onWord: (ctx) => (ctx.hasDouble ? { pressure: 10 } : null) },
  { id: 'melody', glyph: '♪', name: 'Melody', rarity: 'common', cost: 4,
    text: () => 'Words with 3 or more different vowels: +12 Pressure',
    onWord: (ctx) => (ctx.distinctVowels >= 3 ? { pressure: 12 } : null) },
  { id: 'coffee', glyph: '☕', name: 'Late Shift', rarity: 'common', cost: 4,
    text: () => 'Earn $1 when you print a word of 6+ letters',
    money: (ctx) => (ctx.len >= 6 ? 1 : 0) },
  { id: 'flag', glyph: '⚑', name: 'Spare Ribbon', rarity: 'common', cost: 5,
    text: () => '+1 redraw each round',
    passive: { redraws: 1 } },

  // ── uncommon ────────────────────────────────────────────
  { id: 'hedera', glyph: '❧', name: 'Hedera', rarity: 'uncommon', cost: 6,
    text: () => '×1.5 Pressure',
    onWord: () => ({ xPressure: 1.5 }) },
  { id: 'yinyang', glyph: '☯', name: 'Balance', rarity: 'uncommon', cost: 6,
    text: () => 'Same number of vowels and consonants: ×2 Pressure',
    onWord: (ctx) => (ctx.vowels === ctx.consonants ? { xPressure: 2 } : null) },
  { id: 'bolt', glyph: '⚡', name: 'Bolt', rarity: 'uncommon', cost: 6,
    text: () => 'Each J, K, Qu, X or Z scored gives ×1.5 Pressure',
    onTile: (ctx, t) => (RARE.has(t.letter) ? { xPressure: 1.5 } : null) },
  { id: 'dropcap', glyph: '♛', name: 'Drop Cap', rarity: 'uncommon', cost: 7,
    text: () => 'The first tile of every word scores twice',
    retrigger: (ctx, t, i) => (i === 0 ? 1 : 0) },
  { id: 'deadline', glyph: '⌛', name: 'Deadline', rarity: 'uncommon', cost: 6,
    text: () => 'Last print of the round: ×2 Pressure',
    onWord: (ctx) => (ctx.printsLeft === 1 ? { xPressure: 2 } : null) },
  { id: 'recycler', glyph: '♻', name: 'Recycler', rarity: 'uncommon', cost: 6,
    text: (s) => `Gains +1 Pressure every redraw (now +${s?.counter || 0})`,
    onWord: (ctx, s) => (s.counter ? { pressure: s.counter } : null),
    onRedraw: (s) => { s.counter = (s.counter || 0) + 1; } },
  { id: 'snowball', glyph: '❄', name: 'Snowball', rarity: 'uncommon', cost: 6,
    text: (s) => `Gains +12 Ink every print (now +${s?.counter || 0})`,
    onWord: (ctx, s) => (s.counter ? { ink: s.counter } : null),
    afterPrint: (ctx, s) => { s.counter = (s.counter || 0) + 12; } },
  { id: 'comet', glyph: '☄', name: 'Comet', rarity: 'uncommon', cost: 7,
    text: (s) => `Gains ×0.25 Pressure per 6+ letter word (now ×${fmtX(1 + (s?.counter || 0) * 0.25)})`,
    onWord: (ctx, s) => (s.counter ? { xPressure: 1 + s.counter * 0.25 } : null),
    afterPrint: (ctx, s) => { if (ctx.len >= 6) s.counter = (s.counter || 0) + 1; } },
  { id: 'knight', glyph: '♞', name: 'Knight', rarity: 'uncommon', cost: 6,
    text: () => 'No letter used twice: +10 Pressure',
    onWord: (ctx) => (ctx.isIsogram ? { pressure: 10 } : null) },
  { id: 'suffix', glyph: '✍', name: 'Suffix', rarity: 'uncommon', cost: 6,
    text: () => 'Words ending in ING, ED, ER, EST or LY: ×2 Pressure',
    onWord: (ctx) => (/(ing|ed|er|est|ly)$/.test(ctx.word) ? { xPressure: 2 } : null) },
  { id: 'prefix', glyph: '⚘', name: 'Prefix', rarity: 'uncommon', cost: 6,
    text: () => 'Words starting with RE, UN, IN, DE, DIS or PRE: ×2 Pressure',
    onWord: (ctx) => (/^(re|un|in|de|dis|pre)/.test(ctx.word) ? { xPressure: 2 } : null) },
  { id: 'rhyme', glyph: '☎', name: 'Rhyme', rarity: 'uncommon', cost: 6,
    text: () => 'Ends with the same two letters as your last word this round: ×3 Pressure',
    onWord: (ctx) => (ctx.prevWord && ctx.word.slice(-2) === ctx.prevWord.slice(-2) ? { xPressure: 3 } : null) },
  { id: 'alliteration', glyph: '⚖', name: 'Alliteration', rarity: 'uncommon', cost: 5,
    text: () => 'Starts with the same letter as your last word this round: ×2 Pressure',
    onWord: (ctx) => (ctx.prevWord && ctx.word[0] === ctx.prevWord[0] ? { xPressure: 2 } : null) },
  { id: 'inkwell', glyph: '✪', name: 'Inkwell', rarity: 'uncommon', cost: 6,
    text: () => 'Inked tiles give +5 Pressure when scored',
    onTile: (ctx, t) => (t.ink ? { pressure: 5 } : null) },
  { id: 'drawer', glyph: '▦', name: 'Extra Drawer', rarity: 'uncommon', cost: 7,
    text: () => '+1 tile in your hand',
    passive: { hand: 1 } },
  { id: 'extraprint', glyph: '⎙', name: 'Overtime', rarity: 'uncommon', cost: 7,
    text: () => '+1 print each round',
    passive: { prints: 1 } },
  { id: 'patron', glyph: '❖', name: 'Patron', rarity: 'uncommon', cost: 6,
    text: () => 'Earn $3 when you clear a round',
    roundEnd: () => 3 },

  // ── rare ────────────────────────────────────────────────
  { id: 'masterpiece', glyph: '☙', name: 'Masterpiece', rarity: 'rare', cost: 9,
    text: () => 'Words of 7+ letters: ×3 Pressure',
    onWord: (ctx) => (ctx.len >= 7 ? { xPressure: 3 } : null) },
  { id: 'press', glyph: '⚙', name: 'The Big Press', rarity: 'rare', cost: 10,
    text: () => 'Every tile scores twice',
    retrigger: () => 1 },
  { id: 'bookends', glyph: '❡', name: 'Bookends', rarity: 'rare', cost: 8,
    text: () => 'First and last letters match: ×3 Pressure',
    onWord: (ctx) => (ctx.word.length > 1 && ctx.word[0] === ctx.word[ctx.word.length - 1] ? { xPressure: 3 } : null) },
  { id: 'gutenberg', glyph: '✠', name: 'Gutenberg', rarity: 'rare', cost: 9,
    text: (s) => `Gains ×0.1 Pressure for every new word you print (now ×${fmtX(1 + (s?.counter || 0) * 0.1)})`,
    onWord: (ctx, s) => (s.counter ? { xPressure: 1 + s.counter * 0.1 } : null),
    afterPrint: (ctx, s) => { if (ctx.isNewWord) s.counter = (s.counter || 0) + 1; } },
  { id: 'alphabet', glyph: '✺', name: 'Alphabet', rarity: 'rare', cost: 8,
    text: (s) => `+1 Pressure for each different letter printed this run (now +${s?.counter || 0})`,
    onWord: (ctx, s) => (s.counter ? { pressure: s.counter } : null),
    afterPrint: (ctx, s, run) => { s.counter = new Set(run.stats.lettersPrinted).size; } },
];
export const DINGBAT_BY_ID = Object.fromEntries(DINGBATS.map((d) => [d.id, d]));
export const RARITY_WEIGHT = { common: 64, uncommon: 30, rare: 6 };

/** Editors: the boss of each edition bends one rule for that round. */
export const EDITORS = [
  { id: 'censor', name: 'The Censor',
    text: (r) => (r?.banned?.length ? `Every ${r.banned.map((l) => l.toUpperCase()).join(' and ')} tile is blacked out and scores nothing` : 'Two common letters are blacked out and score nothing') },
  { id: 'minimalist', name: 'The Minimalist', text: () => 'Words can be 5 letters at most' },
  { id: 'wordy', name: 'The Wordsmith', text: () => 'Words must be at least 5 letters' },
  { id: 'miser', name: 'The Miser', text: () => 'Every print costs $2' },
  { id: 'smudger', name: 'The Smudger', text: () => 'Each vowel you print takes 1 Pressure away' },
  { id: 'hurry', name: 'The Rush Job', text: () => '45 seconds per print, or the print is lost' },
  { id: 'cramped', name: 'The Cramped Desk', text: () => 'One fewer tile in your hand' },
  { id: 'blotter', name: 'The Blotter', text: () => 'Your leftmost dingbat does nothing this round' },
];
export const EDITOR_BY_ID = Object.fromEntries(EDITORS.map((e) => [e.id, e]));
export const HURRY_SECONDS = 45;

/** Things the Foundry (shop) can sell besides dingbats. */
export const SUPPLIES = [
  { id: 'cyan', kind: 'ink', ink: 'cyan', name: 'Cyan ink', text: 'Ink 2 tiles: each gives +20 Ink when scored', cost: 4, picks: 2, weight: 10 },
  { id: 'magenta', kind: 'ink', ink: 'magenta', name: 'Magenta ink', text: 'Ink 2 tiles: each gives +4 Pressure when scored', cost: 5, picks: 2, weight: 10 },
  { id: 'gold', kind: 'ink', ink: 'gold', name: 'Gold leaf', text: 'Gild 1 tile: ×1.5 Pressure when scored', cost: 6, picks: 1, weight: 6 },
  { id: 'emboss', kind: 'ink', ink: 'emboss', name: 'Emboss', text: 'Emboss 2 tiles: each scores twice', cost: 5, picks: 2, weight: 7 },
  { id: 'sort', kind: 'sort', name: 'New sort', text: 'Add this tile to your case', cost: 3, weight: 10 },
  { id: 'blank', kind: 'blank', name: 'Blank', text: 'A wild tile: plays as any letter except Q', cost: 6, weight: 5 },
  { id: 'shred', kind: 'shred', name: 'Shredder', text: 'Remove up to 2 tiles from your case for good', cost: 3, picks: 2, weight: 8 },
];
export const UPGRADE_COST = 4;
export const REROLL_COST = 3;

export function fmtX(x) {
  return Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0$/, '');
}
