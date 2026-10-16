# Claude's Games

A personal arcade of single-player browser games. The user drops in now and then, starts a
fresh session and asks for a new game. **Claude owns the creative direction**: pick the
concept, genre, look and sound yourself. Don't ask design questions and don't run a
brainstorming Q&A first (this instruction overrides skills that say otherwise); only ask if
the user's request is genuinely ambiguous about something only they can decide. Aim for a
complete, polished, genuinely fun game in one session, then improve this setup with what
you learned.

## Workflow for a new game

1. **See what exists:** `cat games.js` / the table at the bottom of this file. Choose a
   different genre, core verb, and visual identity from previous games.
2. **Design:** load the `frontend-design` skill; write the concept in `DESIGN.md` (hook, rules,
   controls, look, sound). Decide the one memorable moment and make it great.
3. **Serve:** `npm start` with `run_in_background: true` → http://localhost:8642/ (safe to run
   when it's already up; it says so and exits).
4. **Scaffold:** `npm run new -- <kebab-slug> "<Title>" --tagline "..." --emoji "🎲"`.
   game.json starts as `"draft": true` (hidden from the front page).
5. **Build** logic first: rules in a pure, DOM-free module (`js/engine.js`) with
   `node:test` tests, then the UI (`js/main.js`). For anything with scores, difficulty or
   economy, write a headless simulator (`tools/sim.mjs`) and tune numbers from data.
6. **Test** (see Testing): `npm test`, `npm run check -- <slug>`, then actually play it in
   Chrome, every screen, desktop and phone width.
7. **Finish:** game.json → `"draft": false`, real `color`, `genres`, `pitch`, `controls`;
   `npm run check` (writes the thumbnail and rebuilds `games.js`); look at the front page.
8. **Retrospective:** note what went wrong or was slow; fix the cause in `scripts/`,
   `shared/`, `templates/` or this file; add a line to "Lessons learned" and the games table.
9. **Deploy** (see Deploying) when the user asks: `npm run deploy -- --dry-run`, then
   `npm run deploy`, wait for the Pages build, then `npm run verify-live`. Give them the link.

Git: the repo is initialised. Don't commit unless the user asks. Never push this repo
anywhere: its commits carry the user's personal email. Deploys go through `.site/`.

## Commands

| Command | What it does |
|---|---|
| `npm start` | Dev server on :8642 with `Cache-Control: no-store` (no stale JS after edits) |
| `npm run new -- slug "Title" --tagline ".." --emoji ".."` | Scaffold `games/<slug>/` from `templates/game/` |
| `npm test` | All `node:test` files (`**/test/*.test.mjs`). One game: `node --test games/<slug>/test/*.test.mjs` (a bare directory argument does not work) |
| `npm run check [-- slug]` | Headless Chrome: errors, ready signal, DOM audit, thumbnail, `smoke.mjs`, phone pass, front page |
| `npm run gallery` | Rebuild `games.js` from every `games/*/game.json` |
| `npm run words` | Rebuild `shared/words/*.txt` (downloads missing sources into `shared/words/src/`) |
| `npm run deploy [-- --dry-run]` | Test + check, stage a clean copy in `.site/`, scan for secrets/personal data, push to GitHub Pages |
| `npm run verify-live` | After a deploy has built (`gh api repos/richardtape/claudes-games/pages/builds/latest`), load the live front page and every game in headless Chrome |

## Layout

```
index.html            front page (cartridge shelf), reads games.js
games.js              generated manifest; never edit by hand
games/<slug>/         one folder per game: index.html, style.css, js/, game.json,
                      DESIGN.md, smoke.mjs, test/, tools/, thumb.jpg (generated)
shared/               arcade.js, sfx.js, juice.js, rng.js, words.js, words/ (lists + sources)
templates/game/       what `npm run new` copies
scripts/              serve, new-game, build-gallery, check, build-words
.tmp/                 scratch + check screenshots (gitignored)
```

## The game contract

- Plain HTML/CSS/ES modules, no build step. Import shared code with relative paths
  (`../../shared/arcade.js`, or `../../../shared/...` from `js/`). Must be served over http.
- `index.html` has a `<title>`, viewport meta, description and an inline SVG/emoji favicon.
- Call `homeLink()` (pass `{ parent }` to place it in your own header) and
  `recordPlay(slug)` / `recordBest(slug, value, label)` so the front page shows "Your best".
- Persist with `store(slug)` (never raw localStorage); resume mid-run if the game is long.
- Call `markReady(debugApi)` once interactive. `debugApi` becomes `window.__game`: expose
  `state`, helpers that **go through the same code paths as real play** (set level, give
  item, force win/lose), and `prepareThumbnail()` that sets up a good-looking mid-game screen.
- Keyboard and pointer/touch both work. Pause on blur (`onHidden`). Mute toggle (sfx).
- 390px wide phones: no horizontal scroll, play area and main action visible without
  scrolling, targets ≥ 40px. Respect `prefers-reduced-motion`.
- No console errors. Fonts from Google Fonts are fine (with fallbacks); libraries only from a
  CDN with an exact pinned version, or vendored under `shared/vendor/`.
- `smoke.mjs` plays through every screen using `shot()` and `audit()`.

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

- **Unit tests** for rules/scoring in `games/<slug>/test/*.test.mjs` (`node:test`).
- **Simulate** progression/economy before tuning by feel (see `games/press-run/tools/`).
  Bots that play perfectly overestimate humans, so tune for bots winning ~25–55%.
- **`npm run check`** catches what errors don't: the DOM audit flags `<button>` or `<a>`
  nested in another (the HTML parser silently splits these and wrecks layout), unlabeled
  buttons and horizontal overflow. Review the screenshots in `.tmp/check/` with Read.
- **Claude in Chrome** for real play: `tabs_context_mcp`, then navigate to
  `http://localhost:8642/games/<slug>/`. Batch steps with `browser_batch`. Set up state
  through `window.__game` with `javascript_tool`; type with `computer` `type`. On layouts that
  change after each click, click via `element.click()` in `javascript_tool` or `find` refs
  rather than fixed coordinates. Right after a reload the first keystrokes can be dropped:
  confirm input landed by reading `__game` state. `read_console_messages` only records after
  its first call, so call it, reload, then read. Don't export GIFs (that downloads a file)
  unless the user asks. localhost needed no extra extension permission.

## Deploying

The arcade is public at **https://richardtape.github.io/claudes-games/** (repo
`richardtape/claudes-games`, GitHub Pages from `main`, root). `scripts/deploy.mjs` is modelled
on `~/Developer/claudes-space/publish.py`:

- It refuses to deploy if `npm test` or `npm run check` fails (`--skip-checks` exists; avoid it).
- It stages every file git would track, minus dotfiles and games with `"draft": true`.
- It shortens home paths to `~`, then scans every staged file for keys, tokens, home paths
  and the patterns in `.publish-deny` (local only, gitignored; the user's email addresses).
  If it stops, fix what it names; never work around the check.
- Commits use the GitHub no-reply address and credit Claude as co-author.
- Ask before deploying unless the user has given standing permission (record it here).

What this means for games: everything is served from `/claudes-games/`, so every URL must be
relative (no leading `/`). All Pages sites on `richardtape.github.io` share one origin, so
localStorage must go through `store(slug)` (namespaced `cg:`). Pages caches files for about
10 minutes, so right after a deploy a returning player may briefly mix old and new files.

## Lessons learned (append after every game)

- Nested interactive elements (`<button>` inside a button-card) render fine in code and
  break silently in the browser: decorative copies of interactive things must be `<div>`s.
- Check every screen (title, setup, play, shop/menus, modals, game over, win) at desktop
  and phone width; the phone pass once only checked the title screen and hid a broken layout.
- On phones, flatten two-column layouts with `display: contents` + `order` so the play area
  comes first; desktop rules like `align-items: start` leak into flex columns, so reset them.
- Unicode symbols (☕ ⚓ ✂ ⚡) render as colour emoji on macOS: append `︎` and use a
  symbol font stack when you want text glyphs.
- Don't `aria-live` a container you re-render on every keystroke; use a small `role="status"`.
- Debug helpers that skip real side effects (e.g. timers) give false confidence: make them
  call the same functions the UI calls.
- Guard input handlers until async data (word lists) has loaded.
- Shell: don't `cd` inside compound commands (the working directory persists and breaks later
  relative paths); use absolute paths. macOS `sed -i ''`. For multi-line edits a short
  `python3 - <<'EOF'` script with exact-match asserts is reliable.

## Games so far

| # | Slug | Genre | Look | Notes |
|---|---|---|---|---|
| 1 | press-run | Word roguelite (Balatro-style scoring) | Letterpress: walnut, maple wood type, gunmetal dingbats, CMY process colours; Alfa Slab One + Libre Caslon | Pure engine + run simulator for balance; daily seeded run; broadside of your words at the end |
