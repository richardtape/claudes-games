# Press Run

## The hook
Balatro's scoring loop with a word-game brain. Every word is a little slot-machine pull: the
platen slams, tiles tick up Ink one by one, dingbats wiggle and multiply Pressure, and a big
number stamps down. Between rounds you build an engine of dingbats, inks and word-length
levels, and the targets keep climbing until your build breaks. "One more run" comes from
almost-builds, the missed word ("the one that got away"), and the broadside poster of your run.

## Rules
- Hand of 8 wood-type tiles drawn from your case (57 tiles to start). Words need 3+ letters.
  Qu is one tile worth two letters. Blanks are wild (not Q).
- Score = Ink × Pressure. Base Ink/Pressure come from word length (see `LENGTHS` in data.js);
  each tile adds its Ink (doubled Scrabble values); then dingbats apply left to right.
- Each round: 4 prints, 3 redraws (discard tiles from the stick, draw replacements).
- Each edition: morning deadline (×1), evening (×1.5), and an Editor (boss, ×2) with a rule.
  The edition's editor is shown from its first round so you can prepare.
- Win by clearing edition 6. Endless mode continues after.
- Payday after each round: base $3/$4/$5 + $1 per unused print + $1 interest per $5 held (max $5).
- The Foundry (shop): 2 dingbats, 2 supplies (inks, new tiles, blank, shredder), 1 word-length
  upgrade; restock for $3 (+$1 each time). Sell dingbats for half.

## Controls
Type letters (Q types Qu; the following U is swallowed), Backspace, Enter = print,
Shift+Enter = redraw stick tiles, Esc = clear, Space = shuffle. Tap tiles on touch.
Click/Enter during the press animation fast-forwards it.

## Look and sound
Letterpress shop: walnut type-case background, maple wood-type tiles with grain, gunmetal
dingbat blocks, a steel composing stick, a paper proof sheet with an SVG roughness filter for
inked words. Process colours carry meaning: cyan = Ink, magenta = Pressure, yellow = money.
Type: Alfa Slab One (wood type, numbers), Libre Caslon Text (rules text).
The memorable moment is the press: ink roller sweep, platen slam with screen shake, then
per-tile scoring ticks rising in pitch. All sound is synthesized (shared/sfx.js).

## Tuning notes
- Targets (data.js `EDITION_BASE`): 300, 650, 1400, 3000, 6400, 13500 (×1 / ×1.5 / ×2).
  Each edition's first deadline is above the previous boss (tested).
- Calibrated with tools/runsim.mjs (bots of 4k/10k/25k-word vocabularies playing whole runs):
  win rates ~25% / 53% / 56%. Bots always find their best word, humans won't, so real
  players should land around editions 3–5 at first and win once they learn synergies.
- tools/sim.mjs: per-round score distributions for fixed builds.
- Editors were evened out with a probe (see git history): Minimalist was 4 letters max and cut
  scores by 2/3, now 5 max (−32%); Cramped −1 tile; Censor bans two letters; Smudger costs
  Pressure per vowel instead of zeroing vowel Ink (which did almost nothing).
- Hands get a soft vowel fix on draw: 2+ vowels (if hand ≥ 6) and at least 3 consonants,
  only swapping newly drawn tiles.

## Ideas for later
- Tile "editions" (foil/holo) and consumable one-shot cards (e.g. "Reprint": replay last word).
- Ante-skip tags, more editors, a daily leaderboard export.
- Drag to reorder tiles in the stick.
