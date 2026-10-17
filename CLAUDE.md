# Claude's Games

A personal arcade of browser games (all single-player so far), public at
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
`npm run types` first and build something whose type no game has claimed yet. When Rich
asks for "the randomizer", `npm run random` picks an untried type for you; tell him the pick
and your concept before building if he asks to hear it first.

## Start of a session

1. Run `npm run types` (taken vs untried game types), read "Games so far" at the bottom,
   and skim `games/press-run/` as the reference implementation (engine/UI split, debug
   hooks, smoke test, simulators).
2. `ls node_modules >/dev/null 2>&1 || npm install` (a fresh clone needs it for checks).
3. `npm start` with `run_in_background: true` → http://localhost:8642/ (safe when it's
   already running; it says so and exits).
4. Glance at `uptime`. This is Rich's working machine (calls, other sessions). Run one
   headless Chrome job or simulator at a time, and if he says it's slow, stop everything you
   started at once (headless Chrome, sims, the dev server) and close your Chrome tabs.

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
11. **Commit** everything in this working repo so `git status` is clean at the end of the
    session (see Git below).

Budget the session: core loop playable within roughly the first third, then feel and
polish, and keep real time for testing and the retrospective.

Git: this working repo is local only: it has no remote and is never pushed (its commits carry
Rich's personal email). Rich wants it clean at the end of every session (2026-10-16): commit
all the session's work locally, with the attribution line, after the deploy. You can also
commit at milestones during the session. Never add a remote or push it. Deploys go through
`.site/` (see Deploying).

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
| `npm run random` | The randomizer: picks one untried type at random |
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
shared/               arcade.js, sfx.js, seq.js, juice.js, rng.js, loop.js, net.js, words.js,
                      words/ (lists + sources)
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
- `sfx.js`: `createSfx(slug)` → `tone`, `noise`, `arp`, `toggleMute`, `now()`; `note(semitones)`.
  Synthesize every sound; no audio files needed. Unlocks on first gesture automatically.
  `tone`/`noise` take `at` (an absolute audio-clock time from `now()`) for sequencing.
- `seq.js`: `createSequencer(sfx, { bpm, steps, onStep(step, at) })` → `start`, `stop`, `bpm`.
  Sixteenth-note steps scheduled ahead on the audio clock (no wobble). Background music:
  stop it when the page is hidden and never start it into a hidden tab (Dead Drop's audio.js).
- `juice.js`: `floatText`, `shake`, `pulse`, `countUp`, `toast`, `sleep`. Restyle via class names.
- `rng.js`: `createRng(seed)` (`int`, `pick`, `shuffle`, `chance`, `weighted`, serializable
  `state`), `hashString`, `dailySeed()` for daily modes.
- `loop.js`: `createLoop({ update(dt), render() })` runs requestAnimationFrame with a capped
  dt and a manual clock for tests (`loop.manual = true`, `loop.advance(seconds, each)`);
  `fixedSteps(DT)` is the fixed-timestep accumulator (`run(dt, step)`, `alpha` for
  interpolation). Expose the loop and an `advance` helper on `window.__game`.
- `words.js`: `loadDictionary()` (168k ENABLE words, validate input) and `loadCommon(n)`
  (frequency-ranked, profanity-filtered: use it for targets, hints, suggestions). See
  `shared/words/README.md`. Never suggest a word that isn't in the common list.
- `net.js`: peer-to-peer rooms (see Multiplayer). `joinRoom({ slug, code, transport })` →
  `send(type, data, peerId?)`, `on(type, cb)`, `onPeerJoin`, `onPeerLeave`, `onError`,
  `peers`, `leave()`. `transport: 'p2p'` (Trystero, lazy-imported) or `'local'`
  (BroadcastChannel between tabs of one browser: tests and `?net=local`). `roomCode()`,
  `cleanCode()`, and `createMemoryPair()` for node:test.

When a game needs something generic (a helper you'd want again), add it to `shared/` and
document it here rather than burying it in the game.

## Picking tech for the game type

- **Word, card, board, puzzle, idle, roguelite UI:** DOM + CSS. Render from state with template
  strings, use `data-action` attributes and one delegated click handler.
- **Arcade/action/physics:** `<canvas>` 2D with `shared/loop.js` (fixed 60 Hz engine steps,
  render with interpolation), scale by `devicePixelRatio`, pause when hidden, pointer events
  with `touch-action: none` on the canvas, virtual buttons on touch. Paint static scenery
  once into its own canvas behind the play canvas instead of copying it every frame (Night
  Stitch: room, lamp and linen), and shake the wrapper so the layers move together.
- **Persistent drawing that accumulates** (trails, paint, embroidery): draw it into an
  offscreen layer incrementally from a history list in the state, so it can be redrawn at
  any size (resize, end-screen poster).
- **3D:** three.js through an import map with an exact pinned version from cdn.jsdelivr.net
  (check the version exists first). Keep draw calls low; test on the phone pass.
- **Physics:** a pinned CDN build of matter-js/planck, or hand-rolled for simple cases.
- **Music:** `shared/seq.js` on `sfx.tone`. Keep it muteable, separately from effects.
- **Data:** download raw sources into their own folder under `shared/<topic>/src/` (or the
  game's `data/src/`), write a processing script in `scripts/`, document sources and licences.
- **Multiplayer** (Rich chose this approach, 2026-10-16; use it for any multiplayer game):
  live peer-to-peer WebRTC through Trystero (an exact pinned CDN build; v0.26.0 was current).
  It finds peers through free public relays, so there is no server, account or key. One player
  opens a room and shares a link or QR code, and 2–6 friends join; the host's browser is
  authoritative. Prefer simultaneous turns (everyone commits secretly, then reveal together)
  over twitch action, since they tolerate lag and dropped peers. Party-style play also works:
  a laptop or TV shows the board and everyone plays on their phone. Always keep the game
  playable solo against bots and on one shared screen, so it never feels broken when a relay
  is down or a strict network (corporate, university, some carriers) blocks the connection.
  Rooms are invite-only: no matchmaking with strangers and no free-text chat, because peers
  see each other's IP addresses. Not a backend (Firebase, Supabase, Cloudflare) unless Rich
  asks. Dead Drop is the worked example:
  - `shared/net.js` carries messages; only join a room when the player picks online play
    (the import and relay sockets are network traffic, and console noise if a relay is down).
  - Host-authoritative: the host's browser owns the engine state and sends each guest
    `viewFor(state, seat)`, a masked view with no rival hand or face-down identities;
    guests send actions. A protocol version in `hello`, a per-browser token so a guest who
    reloads gets their seat back, `nope` for a third browser, and the host saves its table
    per room code so a host reload resumes (`games/dead-drop/js/session.js`).
  - Invite link `#join=CODE`, host URL `#host=CODE`, a typed-code field on the title, and a
    QR code (uqr from jsdelivr, pinned). Show the guest a "can't connect" hint after ~20 s.
  - Trystero 0.26 changed its API: callbacks are properties (`room.onPeerJoin = fn`) and
    `makeAction(name)` returns `{ send(data, { target }), onMessage }`. Read the README of the
    pinned version rather than older examples.
  - Simultaneous-turn games need a turn where nobody can act to resolve itself (Dead Drop
    hung when both seats auto-passed). Test "no one can move" states.

## Testing

- **Unit tests** for rules and scoring in `games/<slug>/test/*.test.mjs` (`node:test`),
  including invariants such as "targets always climb".
- **`npm run check`** catches what errors don't: the DOM audit flags `<button>` or `<a>`
  nested in another (the HTML parser silently splits these and wrecks layout), unlabeled
  buttons and horizontal overflow, and anything requested outside `/claudes-games/` fails.
  It runs `smoke.mjs` twice, at desktop and at phone size (`ctx.phone` is true the second
  time), so every screen the smoke visits gets a phone screenshot and audit. Read the
  screenshots in `.tmp/check/` (`<slug>-NN-*` desktop, `<slug>-phone-NN-*` phone).
- **Multiplayer games export `duo([host, guest], ctx)` from `smoke.mjs`.** `npm run check`
  runs it with two pages in one browser joined over BroadcastChannel (`?net=local`), so the
  check never depends on public relays; `npm run verify-live` runs it again on the live
  site in two separate browsers through the real relays. Assert the guest's view never holds
  the host's secrets.
- **Smoke tests must not depend on timing.** Emulated phones move the mouse slowly, so
  freeze anything the step is not testing (Night Stitch's smoke freezes the moth it loops),
  and wait for screens rather than sleeping a fixed time. Before a screenshot, wait for
  entrance animations to finish (Dead Drop's `settle()`), or shots catch half-faded panels.
- **Real-time games: play a whole run headless** with a bot on the manual clock and
  screenshot the key moments (`games/night-stitch/tools/night-shots.mjs`). The short smoke
  test never reached 2 AM, where the accumulated embroidery had made live moths unreadable.
- **Claude in Chrome** for real play: `tabs_context_mcp`, then navigate to
  `http://localhost:8642/games/<slug>/`. Rich's Chrome window is often behind other windows,
  and then `document.visibilityState` is `hidden` and requestAnimationFrame does not run:
  nothing moves. Check it first; drive canvas games with `__game.loop.manual = true` and
  `__game.advance(seconds)` (works hidden or visible), and dispatch real `PointerEvent`s on
  the canvas to test the actual input path. Evaluations over ~45 s time out, so keep
  each `javascript_tool` call short. Batch steps with `browser_batch`. Set up state
  through `window.__game` with `javascript_tool`; type with `computer` `type`. On layouts that
  change after each click, click via `element.click()` in `javascript_tool` or `find` refs
  rather than fixed coordinates. Right after a reload the first keystrokes can be dropped:
  confirm input landed by reading `__game` state. `read_console_messages` only records after
  its first call, so call it, reload, then read. Don't export GIFs (that downloads a file)
  unless Rich asks. localhost needed no extra extension permission.
- Sound plays through Rich's speakers: a game must not start music in a hidden tab, and
  test runs there should leave the music off.
- That Chrome is Rich's own profile: when you finish, remove your test data (the game's
  `cg:<slug>:` localStorage keys) so his first play starts fresh. Close tabs you opened.

## Balancing

- Simulate before tuning by feel. Press Run's `tools/sim.mjs` scores single rounds for fixed
  builds; `tools/runsim.mjs` plays whole runs, shop included, with bots of different
  vocabulary sizes standing in for skill.
- Bots that always find their best move overestimate humans: aim for bots winning about
  25–55%, and make the opening generous.
- For real-time games, make the bot human-ish before tuning: reaction delay, limited drawing
  or aiming speed, aim noise, misjudged targets and the odd fumbled attempt, all scaled by a
  `skill` parameter (see `games/night-stitch/js/bot.js`). Report results per skill level.
  The same bot doubles as the title-screen demo.
- Probe one variable at a time (each boss/modifier in isolation against a fixed build) to
  find outliers. Press Run's first Minimalist cut scores by two thirds while others did
  nothing.
- Then play it yourself: the sim said one Edition 1 word cleared the round, and playing it
  confirmed that felt too easy.
- Monte Carlo bots (Dead Drop's `bot.js`: fill in hidden cards at random, play each move out
  many times) overrate the move they pick, because the best of many noisy estimates is
  optimistic. Re-score the chosen move with fresh playouts before using the value for
  bets or folds; without that, both bots "knew" they were winning and escalated every round.
- Strictly optimal opponents can be no fun: Dead Drop's bots folded every lost round before
  the final flip, the game's big moment. Make them play on most of the time.
- Mirror decks are fair, but a card that swings rounds by 10+ points makes draws decide
  games. `tools/sim.mjs --set sleeper.power=4` tries a tweak without editing the data.

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
- Chained find-and-replace edits collide when one new value equals another old value
  (tiger's new `eat: 3.4` matched rosy's old one). Key each replacement by its context.
- Input guards ("ignore clicks for 350 ms after this screen opens") must use real time
  (`performance.now()`), not the game clock, or a paused or manual clock blocks input forever.
- Debug helpers that move things must get there the way real input does (Night Stitch's
  `loopAround` once assumed the needle already sat on the circle and silently drew nothing).
- A run that leaves a growing record on screen (here, the sampler) slowly buries the live
  game. Show the record subdued during play and at full strength on the end screen.
- Shared pages can break only when the shelf grows: the second game was the first card under
  "Also on the shelf", and a `.shelf h2` rule turned its title white on a white label. Read
  `index-desktop.png` after every game, not just the new card.
- Two kinds of feedback taught the core rules best: a "close here" glow where finishing a
  loop would catch something, and settled moths twitching inside a faint ring as the needle
  nears. Show rules on the play field rather than in text.
- Re-rendering a screen from a template string restarts its CSS entrance animations, so the
  round result faded in again every time the bot moved. Give entrance animations a one-time
  class (`enter`, `intro`) and play sweeps from the code that runs the moment, not the render.
- Per-letter display type (`jitter()` in Dead Drop) breaks lines inside words because each
  letter is an inline block: wrap every word in a `white-space: nowrap` span.
- Never pulse a button's size forever: Playwright waits for it to stop moving and times out,
  and people find it harder to hit. Pulse colour or brightness instead.
- An async update that awaits an animation must hold a busy flag and re-read the latest state
  afterwards; otherwise a later update renders, then the earlier one resumes and paints its
  stale copy over it (Dead Drop showed round 1's result after round 2 began).
- Parallel work: a subagent drew Dead Drop's 24 silhouettes from a tight spec (function
  names, viewBox, `currentColor` plus one `.ac` accent class, sizes to check, the
  one-Chrome-at-a-time rule) while the engine, net and UI were built. While it worked, a
  Playwright route served placeholder art so screens could be checked early.

## Games so far

| # | Slug | Type | Genre | Look | Notes |
|---|---|---|---|---|---|
| 1 | press-run | word | Word roguelite (Balatro-style Ink × Pressure scoring, shop, bosses) | Letterpress: walnut, maple wood type, gunmetal dingbats, CMY process colours; Alfa Slab One + Libre Caslon | Rich: "SUPER fun". Pure engine + run simulator; daily seeded run; "the one that got away"; broadside poster at the end |
| 2 | night-stitch | drawing | Real-time lasso arcade: steer a needle, cross your own thread to loop moths; 8-hour night with bosses, notions, daily pattern, specimen case | Embroidery by lamplight: indigo night, linen in a beech hoop, DMC floss, cross-stitch numerals and title; IM Fell English | Canvas + shared/loop.js; human-ish bot for sim and title demo; the run stitches a sampler (end screen, PNG save); embroidery fades during play |
| 3 | dead-drop | card-duel | Spy card duel for two: both drop an agent in secret each turn and flip together; three cities with rule twists, escalate/fold stakes, first to 10 | 1960s spy-film titles: mustard field, ink city panels with skylines, paper cards with cut-paper silhouettes, red vs teal; League Gothic (jittered) + Courier Prime | First multiplayer game: online via shared/net.js (Trystero, host-authoritative masked views), pass and play, five Monte Carlo rivals; duo check + live duo in verify-live |
