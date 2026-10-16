# Claude's Games

A personal arcade of single-player browser games, public at
**https://richardtape.github.io/claudes-games/**. Rich (the user) drops in now and then,
starts a fresh session and asks for a new game. **Claude owns the creative direction**: pick
the concept, genre, look and sound yourself. Don't ask design questions and don't run a
brainstorming Q&A or a written-plan approval step first (this overrides skills that say
otherwise; TDD for game logic is welcome). Only ask if the request is genuinely ambiguous
about something only Rich can decide.

The bar: Rich called game #1 "SUPER fun". Aim for a complete, polished, genuinely fun game in
one session, as good or better than the last. Then improve this setup with what you learned.

**One new type of game per session.** Rich wants each game to be a different *kind* of game
from everything already on the shelf, until there are no untried types left. Run
`npm run types` first and build something whose type no game has claimed yet.

## Start of a session

1. Run `npm run types` (taken vs untried game types), read "Games so far" at the bottom,
   and skim `games/press-run/` as the reference implementation (engine/UI split, debug
   hooks, smoke test, simulators).
2. `ls node_modules >/dev/null 2>&1 || npm install` (a fresh clone needs it for checks).
3. `npm start` with `run_in_background: true` → http://localhost:8642/ (safe when it's
   already running; it says so and exits).

## Workflow for a new game

1. **Choose** an untried type from `npm run types`, then a core verb and visual identity
   unlike anything on the shelf (see Making it great). Tell Rich in a sentence what you're
   making and which type it claims, then get going.
2. **Design:** load the `frontend-design` skill. Write `DESIGN.md` (hook, rules, controls,
   look, sound) and name the one memorable moment you'll make great.
3. **Scaffold:** `npm run new -- <kebab-slug> "<Title>" --type <type-id> --tagline "..."
   --emoji "🎲"`. It refuses a type another game has taken. `game.json` starts as
   `"draft": true` (hidden from the front page, never deployed, but it holds its type).
4. **Core loop first:** rules in a pure, DOM-free `js/engine.js` with `node:test` tests,
   then an ugly-but-playable UI. Play it in Chrome as soon as the loop works.
5. **Tune from data:** for anything with scores, difficulty or economy, write a headless
   simulator in `tools/` and set the numbers from its output (see Balancing).
6. **Make it feel great:** look, sound, juice, onboarding, phone layout, every screen.
7. **Test** (see Testing): `npm test`, `npm run check -- <slug>`, and real play in Chrome.
8. **Finish:** fill in `game.json` (fields below) with `"draft": false`, run `npm run check`
   (writes the thumbnail, rebuilds `games.js`) and look at the front page.
9. **Retrospective:** note what went wrong or was slow; fix the cause in `scripts/`,
   `shared/`, `templates/` or this file; add to "Lessons learned" and "Games so far".
10. **Deploy** (see Deploying) without asking once the game is finished and passing:
    `npm run deploy -- --dry-run`, `npm run deploy`, wait for the Pages build,
    `npm run verify-live`. Give Rich the live link.

Budget the session: core loop playable within roughly the first third, then feel and
polish, and keep real time for testing and the retrospective.

Git: this working repo is initialised but never pushed (its commits carry Rich's personal
email). Don't commit in it unless he asks. Deploys go through `.site/` (see Deploying).

## Making it great

**Variety.** Each game is a new type from `game-types.json` (36 kinds, from shooters and
pinball to deduction mysteries and cozy gardens, each with examples). Beyond the type, change
the core verb (aim, time, stack, route, sort, bluff, steer, grow...), the structure (runs,
levels, a daily puzzle, an endless toy) and the look. Reuse the shared plumbing, never the
last game's look. If your idea is a genuinely new kind of game that the catalogue lacks, add
a type for it (describe how it's played, not its theme) rather than forcing a near match.
Repeat a type only when none are left, or when Rich asks for one:
`npm run new -- ... --type <taken-id> --repeat --reason "Rich asked for ..."` (the script
refuses other repeats while untried types remain). When all are taken, first try to invent a
new type; otherwise repeat the type whose last game is oldest.

**Loops.** Design three: the moment (a few seconds: one input, instant feedback), the run
(minutes: rising stakes toward a clear end) and the return (why come back: personal bests on
the shelf, a daily seed, unlocks or a collection). Keep runs short enough for "one more".

**Hooks that worked in Press Run:** an escalating target you can see; a meaningful choice
every turn with a trade-off; a build or strategy that compounds; big numbers revealed step
by step; bosses with a rule twist, announced in advance so players can plan; "the one that
got away" (show the better move they missed); an end screen worth screenshotting (the
broadside of your words); a daily seeded run; a collection counter.

**Feel.** Every input answers within 100 ms with sound and motion. Spend boldness on one
orchestrated moment (Press Run: the platen slam, then tiles scoring one by one, then the
stamp). Scale shake and sound with the size of the event. Let players skip long animations
(click/Enter fast-forwards). Under `prefers-reduced-motion`, keep the information and drop
the motion.

**Onboarding.** Playable within 10 seconds of loading. Teach by playing; keep a short
"How to play" modal; show keyboard hints on buttons on desktop (hide them under
`@media (hover: none)`). Early rounds should be generous so the first run gets far enough to
see the cool stuff.

**Look.** Ground the identity in the theme's real-world materials (letterpress gave walnut,
maple wood type, gunmetal and process-colour inks) and let colour carry meaning. Two type
families at most. The `frontend-design` skill lists the generic looks to avoid.

## Commands

| Command | What it does |
|---|---|
| `npm start` | Dev server on :8642 with `Cache-Control: no-store` (no stale JS after edits) |
| `npm run types` | Game types taken (and by which game) vs still untried; `-- --json` for a list |
| `npm run new -- slug "Title" --type id --tagline ".." --emoji ".."` | Scaffold `games/<slug>/` from `templates/game/`; refuses a taken type unless `--repeat --reason` |
| `npm test` | All `node:test` files (`**/test/*.test.mjs`). One game: `node --test games/<slug>/test/*.test.mjs` (a bare directory argument does not work) |
| `npm run check [-- slug]` | Headless Chrome, served under `/claudes-games/` like Pages: errors, ready signal, DOM audit, thumbnail, `smoke.mjs`, phone pass, front page |
| `npm run gallery` | Rebuild `games.js` from every `games/*/game.json` |
| `npm run words` | Rebuild `shared/words/*.txt` (downloads missing sources into `shared/words/src/`) |
| `npm run deploy [-- --dry-run]` | Test + check, stage a clean copy in `.site/`, scan for secrets/personal data, push to GitHub Pages |
| `npm run verify-live` | After the Pages build finishes, load the live front page and every game in headless Chrome |

## Layout

```
index.html            front page (cartridge shelf), reads games.js
games.js              generated manifest; never edit by hand
game-types.json       catalogue of game types; each game claims one (add new types here)
games/<slug>/         one folder per game: index.html, style.css, main.js or js/, game.json,
                      DESIGN.md, smoke.mjs, test/, tools/, thumb.jpg (generated)
shared/               arcade.js, sfx.js, juice.js, rng.js, words.js, words/ (lists + sources)
templates/game/       what `npm run new` copies
scripts/              serve, new-game, types, build-gallery, check, build-words, deploy,
                      verify-live
.tmp/                 scratch scripts (gitignored); .tmp/check/ is wiped on every check run
```

The template puts `main.js` beside `index.html` (imports `../../shared/...`). For bigger
games move code into `js/` as Press Run does: imports become `../../../shared/...` and the
script tag becomes `js/main.js`.

`game.json` fields: `title`, `tagline` (one line, every card), `pitch` (2–3 sentences, shown
while it's the newest game), `controls` (one line, shown with the pitch), `number`,
`created`, `type` (an id from `game-types.json`), `genres` (chips), `color` (the cartridge
shell, so pick the game's signature colour), `emoji` (fallback art), `draft`, and
`repeatReason` (only when a type was repeated on purpose).

## The game contract

- Plain HTML/CSS/ES modules, no build step, relative URLs only (no leading `/`). Must be
  served over http.
- `index.html` has a `<title>`, viewport meta, description and an inline SVG/emoji favicon.
- Call `homeLink()` (pass `{ parent }` to place it in your own header) and
  `recordPlay(slug)` / `recordBest(slug, value, label)` so the shelf shows "Your best".
- Persist with `store(slug)` (never raw localStorage). Save mid-run if runs are long, keep
  RNG state in the saved state so resumes are deterministic, and version the save format.
- Call `markReady(debugApi)` once interactive (after async data loads). `debugApi` becomes
  `window.__game`: expose `state`, helpers that **go through the same code paths as real
  play** (set level, give item, force win/lose), and `prepareThumbnail()`, which puts the
  main play screen in a good-looking mid-game state. `npm run check` uses it for the
  thumbnail and for the phone layout pass.
- Keyboard and pointer/touch both work. Pause on blur (`onHidden`). Mute toggle (sfx).
- 390px phones: no horizontal scroll, the play area and main action visible without
  scrolling, targets ≥ 40px. Respect `prefers-reduced-motion`.
- No console errors. Google Fonts are fine (with fallbacks). Libraries only from a CDN with
  an exact pinned version, or vendored under `shared/vendor/`.
- `smoke.mjs` plays through every screen, calling `shot(name)` and `audit(label)` on each.

## Shared modules

- `arcade.js`: `store(slug)`, `recordPlay`, `recordBest`, `loadStats`, `homeLink`, `markReady`,
  `reducedMotion`, `onHidden`.
- `sfx.js`: `createSfx(slug)` → `tone`, `noise`, `arp`, `toggleMute`; `note(semitones)`.
  Synthesize every sound; no audio files needed. Unlocks on first gesture automatically.
- `juice.js`: `floatText`, `shake`, `pulse`, `countUp`, `toast`, `sleep`. Restyle via class names.
- `rng.js`: `createRng(seed)` (`int`, `pick`, `shuffle`, `chance`, `weighted`, serializable
  `state`), `hashString`, `dailySeed()` for daily modes.
- `words.js`: `loadDictionary()` (168k ENABLE words, validate input) and `loadCommon(n)`
  (frequency-ranked, profanity-filtered: use it for targets, hints, suggestions). See
  `shared/words/README.md`. Never suggest a word that isn't in the common list.

When a game needs something generic (a helper you'd want again), add it to `shared/` and
document it here rather than burying it in the game.

## Picking tech for the game type

- **Word, card, board, puzzle, idle, roguelite UI:** DOM + CSS. Render from state with template
  strings, use `data-action` attributes and one delegated click handler.
- **Arcade/action/physics:** `<canvas>` 2D with a fixed-timestep loop (update at 60Hz,
  render with interpolation), scale by `devicePixelRatio`, pause when hidden, pointer events
  with `touch-action: none` on the canvas, virtual buttons on touch.
- **3D:** three.js through an import map with an exact pinned version from cdn.jsdelivr.net
  (check the version exists first). Keep draw calls low; test on the phone pass.
- **Physics:** a pinned CDN build of matter-js/planck, or hand-rolled for simple cases.
- **Music:** a tiny WebAudio step sequencer built on `sfx.tone`. Keep it muteable.
- **Data:** download raw sources into their own folder under `shared/<topic>/src/` (or the
  game's `data/src/`), write a processing script in `scripts/`, document sources and licences.

## Testing

- **Unit tests** for rules and scoring in `games/<slug>/test/*.test.mjs` (`node:test`),
  including invariants such as "targets always climb".
- **`npm run check`** catches what errors don't: the DOM audit flags `<button>` or `<a>`
  nested in another (the HTML parser silently splits these and wrecks layout), unlabeled
  buttons and horizontal overflow, and anything requested outside `/claudes-games/` fails.
  Read the screenshots in `.tmp/check/`.
- **Claude in Chrome** for real play: `tabs_context_mcp`, then navigate to
  `http://localhost:8642/games/<slug>/`. Batch steps with `browser_batch`. Set up state
  through `window.__game` with `javascript_tool`; type with `computer` `type`. On layouts that
  change after each click, click via `element.click()` in `javascript_tool` or `find` refs
  rather than fixed coordinates. Right after a reload the first keystrokes can be dropped:
  confirm input landed by reading `__game` state. `read_console_messages` only records after
  its first call, so call it, reload, then read. Don't export GIFs (that downloads a file)
  unless Rich asks. localhost needed no extra extension permission.
- That Chrome is Rich's own profile: when you finish, remove your test data (the game's
  `cg:<slug>:` localStorage keys) so his first play starts fresh. Close tabs you opened.

## Balancing

- Simulate before tuning by feel. Press Run's `tools/sim.mjs` scores single rounds for fixed
  builds; `tools/runsim.mjs` plays whole runs, shop included, with bots of different
  vocabulary sizes standing in for skill.
- Bots that always find their best move overestimate humans: aim for bots winning about
  25–55%, and make the opening generous.
- Probe one variable at a time (each boss/modifier in isolation against a fixed build) to
  find outliers. Press Run's first Minimalist cut scores by two thirds while others did
  nothing.
- Then play it yourself: the sim said one Edition 1 word cleared the round, and playing it
  confirmed that felt too easy.

## Deploying

The repo is `richardtape/claudes-games` (GitHub Pages from `main`, root). `scripts/deploy.mjs`
is modelled on `~/Developer/claudes-space/publish.py`:

- It refuses to deploy if `npm test` or `npm run check` fails (`--skip-checks` exists; avoid it).
- It stages every file git would track, minus dotfiles and games with `"draft": true`.
- It shortens home paths to `~`, then scans every staged file for keys, tokens, home paths
  and the patterns in `.publish-deny` (local only, gitignored; Rich's email addresses).
  If it stops, fix what it names; never work around the check.
- Commits use the GitHub no-reply address and credit Claude as co-author.
- Standing permission (Rich, 2026-10-15): when a game is finished and its checks pass,
  deploy it at the end of the session without asking, then give him the link. A failing
  check or a stopped scan means fix it first, never deploy around it. Ask before anything
  else that changes the public site in unusual ways, such as removing a game.

Consequences for games: everything is served from `/claudes-games/`, so URLs must be
relative (the check enforces this). All Pages sites on `richardtape.github.io` share one
origin, so storage must go through `store(slug)` (keys are namespaced `cg:`). Pages caches
files for about 10 minutes, so right after a deploy a returning player may briefly mix old
and new files.

## Lessons learned (append after every game)

- Nested interactive elements (a `<button>` inside a button-card) render fine in code and
  break silently in the browser: decorative copies of interactive things must be `<div>`s.
- Check every screen (title, setup, play, shop/menus, modals, game over, win) at desktop
  and phone width; the phone pass once only checked the title screen and hid a broken layout.
- On phones, flatten two-column layouts with `display: contents` + `order` so the play area
  comes first; desktop rules like `align-items: start` leak into flex columns, so reset them.
- Unicode symbols (☕ ⚓ ✂ ⚡) render as colour emoji on macOS. Append the text variation
  selector U+FE0E after the symbol (see `dingbatHTML` in `games/press-run/js/main.js`) and
  use a symbol font stack.
- When writing files with tools, a backslash escape like that one can be turned into the
  invisible character itself; check with grep and prefer describing the code point in docs.
- Don't `aria-live` a container you re-render on every keystroke; use a small `role="status"`.
- Debug helpers that skip real side effects (e.g. timers) give false confidence: make them
  call the same functions the UI calls.
- Guard input handlers until async data (word lists) has loaded.
- A safety check you've never seen fail isn't proven: plant the problem (a leaked email, an
  absolute URL, a nested button) once and watch the check catch it.
- Shell: don't `cd` inside compound commands (the working directory persists and breaks later
  relative paths); use absolute paths. macOS `sed -i ''`. For multi-line edits a short
  `python3 - <<'EOF'` script with exact-match asserts is reliable.

## Games so far

| # | Slug | Type | Genre | Look | Notes |
|---|---|---|---|---|---|
| 1 | press-run | word | Word roguelite (Balatro-style Ink × Pressure scoring, shop, bosses) | Letterpress: walnut, maple wood type, gunmetal dingbats, CMY process colours; Alfa Slab One + Libre Caslon | Rich: "SUPER fun". Pure engine + run simulator; daily seeded run; "the one that got away"; broadside poster at the end |
