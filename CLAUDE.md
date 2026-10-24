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
| `npm run drive -- slug [--phone]` | One headless page kept open (run in the background); `curl -s 127.0.0.1:8650 -d "<js>"` evaluates in it and screenshots `.tmp/drive.png`. For playing by hand, one decision at a time |
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

- `arcade.js`: `store(slug)` (`get`, `set`, `remove`, `keys()` to prune old saves), `recordPlay`,
  `recordBest`, `loadStats`, `homeLink`, `markReady`, `reducedMotion`, `onHidden`.
- `sfx.js`: `createSfx(slug)` → `tone`, `noise`, `arp`, `hold`, `toggleMute`, `now()`; `note(semitones)`.
  Synthesize every sound; no audio files needed. Unlocks on first gesture automatically.
  `tone`/`noise` take `at` (an absolute audio-clock time from `now()`) for sequencing. `hold({ kind,
  freq, type, q })` is a sustained sound you steer while it plays (`set({ vol, freq }, ramp)`, `stop()`;
  null before the first gesture): First Light's burner roar and wind (`js/audio.js`).
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
  `cleanCode()`, and for node:test `createMemoryPair()` (two rooms) and `createMemoryHub(n)`
  (`{ rooms, connect, add }`: rooms `peer-0`…, a `send` with a peer id reaches only that room;
  `add()` brings in a room later, for reloads and late arrivals, and `connect()` again meets it).

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
  (check the version exists first; First Light pins 0.170.0, whose API is well known, rather than the
  newest). Keep draw calls low; test on the phone pass. Headless Chrome on Rich's Mac renders WebGL on
  the real GPU (ANGLE Metal), so `npm run check` needs no flags. What worked in First Light: one
  non-indexed, flat-shaded, vertex-coloured terrain mesh whose triangles match the engine's height
  lookup exactly (`groundAt` splits each cell on the same diagonal); `InstancedMesh` for 1,500
  chimneys, trees and other balloons (about 20 draw calls); a shader sky sphere and a far-mountain
  ring that follow the camera; a tiling grain texture on world UVs so low views aren't bare triangles;
  vertex colours converted to linear (`Color.setRGB(r, g, b, SRGBColorSpace)`); a pixel ratio capped at
  1.5 on touch screens and dropped once if frames run slow. `camera.setViewOffset` shifts the picture
  clear of a title card.
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
    reloads gets their seat back (sent to the host alone, which announces itself, and only as a
    hash for the room: see Lessons learned), `nope` for a third browser, and the host saves its
    table per room code so a host reload resumes (`games/dead-drop/js/session.js`).
  - Invite link `#join=CODE`, host URL `#host=CODE`, a typed-code field on the title, and a
    QR code (uqr from jsdelivr, pinned). Show the guest a "can't connect" hint after ~20 s.
  - Trystero 0.26 changed its API: callbacks are properties (`room.onPeerJoin = fn`) and
    `makeAction(name)` returns `{ send(data, { target }), onMessage }`. Read the README of the
    pinned version rather than older examples.
  - Simultaneous-turn games need a turn where nobody can act to resolve itself (Dead Drop
    hung when both seats auto-passed). Test "no one can move" states.
  - Real-time co-op works too when input is tap-to-queue rather than twitch (Sushi Raft,
    2026-10-23): the host runs the engine and streams the whole state at 15 Hz (~5 KB,
    `js/net-play.js`), the guest sends taps, answers its own taps at once (sound and ripple) and
    glides its otters toward each snapshot. Pause online play on `visibilitychange` only:
    `onHidden` also fires on window blur, so a click in the other window would pause the night
    for both. Solo gets a computer partner (the sim's bot) rather than a switch-characters mode.

## Testing

- **Unit tests** for rules and scoring in `games/<slug>/test/*.test.mjs` (`node:test`),
  including invariants such as "targets always climb".
- **`npm run check`** catches what errors don't: the DOM audit flags `<button>` or `<a>`
  nested in another (the HTML parser silently splits these and wrecks layout), unlabeled
  buttons and horizontal overflow, and anything requested outside `/claudes-games/` fails.
  Overflow is measured against the configured viewport: an `isMobile` page zooms out to fit, so
  its `innerWidth` grows with the overflow (until 2026-10-23 the phone audit could never fire).
  It runs `smoke.mjs` twice, at desktop and at phone size (`ctx.phone` is true the second
  time), so every screen the smoke visits gets a phone screenshot and audit. Read the
  screenshots in `.tmp/check/` (`<slug>-NN-*` desktop, `<slug>-phone-NN-*` phone).
- **Multiplayer games export `duo([host, guest], ctx)` from `smoke.mjs`.** `npm run check`
  runs it with two pages in one browser joined over BroadcastChannel (`?net=local`), so the
  check never depends on public relays; `npm run verify-live` runs it again on the live
  site in two separate browsers through the real relays. Assert the guest's view never holds
  the host's secrets. The duo must honour `ctx.live` (no `?net=local`, longer waits): separate
  browsers share no BroadcastChannel, so a duo that always adds `?net=local` passes the check and
  can never connect live (Sushi Raft's first draft).
- **Multiplayer games may export `table(pages, ctx)` and `tablePages = { local, live }`** for
  three players and more. `npm run check` opens `tablePages.local` pages (default 3) in one
  context after the duo (`ctx.shot(name, page)`, `ctx.audit(label, page)`, shots
  `<slug>-table-NN-*`); every page of that context is watched for errors, tabs the smoke opens
  itself included. `npm run verify-live` runs it with `tablePages.live` separate browsers and
  `{ live: true, code }`. Pages of one browser share storage, so on `?net=local` Dead Drop takes
  `token=`, `name=` and `ping=` from the URL as that tab's own (in memory only, never saved;
  ignored without `?net=local`), and `__game.standInMs(ms)` shortens the host's stand-in wait:
  keep it above the guests' ping interval or present guests get covered between pings. The
  default smoke's `shot` and `audit` take a page too, for a tab it opens itself.
- **Debug helpers must not depend on where earlier steps left things.** Night Stitch's
  `loopAround` walked the needle to the circle first, and the thread laid on that walk cut
  across the circle and used up the 900-unit thread, so the smoke's boss loop failed only
  when an earlier real-time step had left the needle far away (2026-10-18, under heavy
  load). Make helpers start from a clean state (it now ties off the thread after the walk),
  and find the root cause by logging state from inside the failing check, not a lookalike
  harness.
- **Smoke tests must not depend on timing.** Emulated phones move the mouse slowly, so
  freeze anything the step is not testing (Night Stitch's smoke freezes the moth it loops;
  Dead Drop's smoke makes the rival lock in at once with `__game.rivalLocks()` and freezes
  cards and reveals with `holdCard()` and `holdReveal()`, because under load the bot moved
  first),
  and wait for screens rather than sleeping a fixed time. Before a screenshot, wait for
  entrance animations to finish (Dead Drop's `settle()`), or shots catch half-faded panels.
- **Play it by hand, one decision at a time** (`npm run drive -- <slug> --phone`, then curl JS that
  holds an input for N seconds on the manual clock and returns a summary; read `.tmp/drive.png`).
  First Light's two hand flights found what the bot and sim never showed: the burner was sluggish,
  the chase camera faced the drift while the cross sat off-screen, the coach box covered the ground
  being aimed at, photos showed mostly the player's own balloon, landing at once earned 870 points
  of leftover propane, and a basket resting against a chimney racked up 16 scrapes and never landed.
- **Real-time games: play a whole run headless** with a bot on the manual clock and
  screenshot the key moments (`games/night-stitch/tools/night-shots.mjs`). The short smoke
  test never reached 2 AM, where the accumulated embroidery had made live moths unreadable.
- **Claude in Chrome** for real play: `tabs_context_mcp`, then navigate to
  `http://localhost:8642/games/<slug>/`. Rich's Chrome window is often behind other windows,
  and then `document.visibilityState` is `hidden` and requestAnimationFrame does not run:
  nothing moves. Check it first; drive canvas games with `__game.loop.manual = true` and
  `__game.advance(seconds)` (works hidden or visible), and dispatch real `PointerEvent`s on
  the canvas to test the actual input path. Evaluations over ~45 s time out, so keep
  each `javascript_tool` call short. A tab hidden for a few minutes runs chained timers only
  about once a minute, so in-page `setTimeout` sleeps and timer-paced bots stall: Dead Drop's
  play (2026-10-19) used `__game.skipAnimations(true)`, made the rival lock at once
  (`rivalLocks()`), clicked synchronously and yielded with a `MessageChannel` round trip,
  which hidden tabs don't throttle. Batch steps with `browser_batch`. Set up state
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
- Golf-style par from bots (Comet Cup): bots that know exactly where a shot ends beat
  people who see only the start of it, even with human-sized aim noise. Set par from a noisy
  bot's mean plus a margin you check by playing (+0.6 strokes there), and keep par in a
  stats field so it can be retuned without regenerating (`tools/bank.mjs --repar`).
- Mirror decks are fair, but a card that swings rounds by 10+ points makes draws decide
  games. `tools/sim.mjs --set sleeper.power=4` tries a tweak without editing the data.
- A sim harness for volume: `games/dead-drop/tools/sim.mjs` (flags in its doc comment, every
  run logged in `tools/SIMLOG.md`) plays batches on worker threads. Seed each match by its
  index and keep the shortest in-order prefix of batches that reaches the volume, so the
  worker count and finish order can't change a result, and a rerun with the same seed replays
  the same deals (a paired comparison). Save a baseline JSON, compare every change
  `--against` it, and print a 95% margin beside every rate.
- Volume: 20,000 rounds gave ±1.0 point on each agent's win rate, 5,000 about ±1.3–2.0, and
  one point of power moves an agent only about a point, so short probes can't rank agents.
- What Dead Drop's baseline taught: escalation was automatic (99% of rounds) and stake 4 was
  reached in 78%, so escalating was not yet a real decision. Cheap bots (8 Monte Carlo
  samples instead of 24, about twice as fast) broadly carry agent and city numbers over, but
  not stake numbers (they fold more): tune agents cheaply and confirm stakes at the bots' own
  samples.
- Bot thinking time grows about 2.2× per added seat (Dead Drop, `tools/think-time.mjs`, p95 on
  Rich's Mac): Heron (24 samples) 16 / 32 / 62 ms at 2 / 3 / 4 seats, Control (80) 49 / 106 /
  205 ms. A phone is 3–5× slower and the budget is about 150 ms a move, so cap samples by seat
  count. Four-seat sims run at about 4 rounds/s on 4 workers: a 5,000-round run takes 20 minutes.
- At N seats an agent's "win% when played" sits near 100/N, not 50, and power separates agents
  more than in a duel (Heavy 36 vs Lookout 26 at three seats): measure N-seat balance at N seats.
- A bot's betting threshold moves *when* it bets and how often the bet wins, not *how often* it
  bets: Dead Drop's escalation threshold from 0.35 to 0.65 cut escalation only from 96% to 88%
  but lifted the escalator's wins from 62.6% to 74.2%, because a higher bar just waits for the
  last turns, when one side nearly always sees a won round (`tools/SIMLOG.md` B14).
- A scarce resource barely bites when the supply covers the game: Dead Drop's three escalation
  tokens a match covered four or five rounds of one escalation each, so they left escalation
  at 94% (98.7% unlimited, B12–B13).
- A pace is the lever on frequency: bots that keep a token for every other round left, counting
  rounds by the leader's distance to the target, escalated in 65% of rounds instead of 79%, and
  the half-time leader won about 6 points less often, since the trailing side still had tokens
  late (B15). If the pace makes value bets impossible early, bluffs must follow it too, or
  every early bet is a bluff a player can learn to call (B21–B22).
- Two rates that share an event trade and can't both move inward: a fold in answer counts as
  the escalator's win, so the answer threshold moved them together (about 0.4 points of one per
  point of the other) and the window holding both in band was about 0.02 wide (B17–B21). Find
  such couplings before setting two bands on them.
- A comeback prize needs a short race: Dead Drop's Microfilm (a strip for holding the film city
  in a round you lose) decided 3% of matches at a reel of 3 and 21% at 2, and its winners came
  from behind on points about 90% of the time (B20, B23).
- Tune each table size at that size: the two-player pace and target gave 3- and 4-seat matches
  of 4.2 and 3.5 rounds (B25–B26).
- Screen, probe, confirm for new content (Dead Drop Phase 2b-ii, `tools/SIMLOG.md` B27–B29): one
  20,000-round screen on Mixed rosters at 8 samples (4 minutes) found no agent outside 44–56%
  and no city outside 55–80%, so nothing needed a probe, and one 20,000-round confirm at the
  bots' own samples (11 minutes) put all 20 agents at 45.9–51.8, all 20 cities at 61.8–75.0 and
  seat 0 at 49.8%. The 8-sample numbers carried over for every agent and 19 of the 20 cities;
  Reykjavik moved by more than the combined margin (68.0 to 64.5). Screen cheaply, but take the
  numbers you publish from the confirm.
- Measure a rival's twist on and off over the same seeds (`--variant notwist:twist=off`,
  B31–B33). Mr Heron's placed Sleeper moved a steady bot's win rate by −5.0, the Countess's
  final-turn tap by −2.4 and Control seeing one card by +1.6 (noise), and the Magpie's extra
  Lookout made her *easier* (+4.1): a 13th, weak card can dilute a deck. Without twists the
  Countess and Control played alike (41.0 against 39.1), so Control's twist had to make the
  whole step. Seeing 1, 2 and 3 cards gave 40.7, 36.0 and 34.6; 3 was taken, a 4.1-point step
  against a 4.2 margin. The ladder reads 70.2 / 63.4 / 43.3 / 38.7 / 34.6 (a steady Heron
  against Wren to Control).
- Content that pays in stakes hides from win rates, because playouts score rounds, not points
  (B29–B30, `tools/points-by-roster.mjs`). On 2b-i's stake knobs the Blackmailer's free
  escalation (no token, no fold in answer) pushed Mixed rounds won at stake 2 or more to 46.5%
  (bar: 40 at most) and folds in answer down to 23.7% (bar: 25 or more), and matches holding one
  ran 4.65 rounds against 5.68 without; its own player took 46.6% of the rounds and 48.1% of the
  points, so it speeds the match for both sides rather than favouring its owner. Macau's holder
  took 61.8% of the rounds but 73.1% of the points. The sim's escalation rate counts token
  escalations only, so Mixed's 49.7% isn't like for like with Classic's. Report points beside
  win rates; retuning the Mixed stakes is a Phase 3 item.
- Confirm stake and reel picks at the bots' own samples. At three seats Dead Drop's 8-sample grid
  put the Microfilm's reel 3–4 points low (target 10: 29.2% of matches at 8 samples, 33.4 at 24;
  target 12 at pace 2: 20.8 against 23.7; B39, B41, B43): the 24-sample bots fold in answer about a
  third less, so more rounds reach the flip and more strips change hands. The 24-sample grid (B45)
  then showed the reel following match length whatever the target or pace, so with a reel of 2
  the reel band (30% at most) and the length band (5 rounds or more) leave a window of about 0.15
  rounds at three seats, little more than a confirm's margin. Two bands that both track one
  quantity can leave no room: check the window before tuning toward it.
- Expected-points scoring at 3–4 seats (Dead Drop Phase 3, B37–B38): a win/lose playout value
  put an ordinary hand below the −0.29 answer threshold whenever two rivals could beat it, so
  bots folded to 62–73% of escalations; scoring a rival's win as −1/(n−1) (plus Monaco at the
  round's worth) brought folds in answer to 29% and 22% and rounds ending in a fold from about a
  third to 6% and 1%. Re-baseline before tuning whenever the bot's value function changes.
- Tune targets and pace on a grid of one variable at a time and confirm at the bots' own samples
  (B39–B45): four seats landed at target 9, pace 1 (5.06 rounds, every band met); three seats
  had no setting inside every band because with a reel of 2 the reel band (≤ 30%) and the length
  band (≥ 5 rounds) leave a window of about 0.15 rounds, and the pace at 2 made escalation
  automatic (99%); the fallback was target 10, pace 1 with the reel at 33% accepted. A per-seat
  reel would meet every band but would make the film decide only 6% of matches.
- A measured round at three seats with quick human-paced play and one stand-in took 158 s
  (ROUND_MINUTES[3] assumes 165 s), so the minutes-a-match estimates in the SIMLOG hold.

- A hindsight line's hit rate depends on the table size more than on skill: Dead Drop's single-change
  got-away (`tools/gotaway.mjs`, B46) exists after 84% of lost flip rounds at two seats, 62% at three
  and 50% at four (fewer turns are yours to change, and a fold blocks the line), at 12 ms p95 a round
  at four seats.

## Big jobs across several sessions

Dead Drop's expansion (2026-10-18 to 10-20, six phases) ran as a team of sessions, and it
worked well enough to reuse:

- **Coordinator, planners and builders.** One coordinator session owns the spec and decisions
  and does no building. Each phase gets a planner (`superpowers:writing-plans`) and a fresh
  builder (`superpowers:subagent-driven-development`). The builder can ask its planner
  questions.
- **One charter, one relay log.** The charter (`docs/superpowers/dead-drop-team.md`) is read
  first by every session. It says "this is not a new game", sets the order and names the
  coordinator. The append-only relay log (`docs/superpowers/dead-drop-relay.md`) passes
  lessons from each phase to the next. `docs/` is never deployed.
- **Builds strictly one at a time; plans drafted ahead.** One working folder, one dev server,
  one Chrome and one shared Mac. The next planner drafts read-only while the current phase
  builds (code read as committed, only its plan file committed) and finalises once that phase
  lands. That saved most of the wait between phases.
- **Pre-approve a decision ladder** for anything a sim might decide while nobody is watching
  (the Microfilm's reel, the Blackmailer's rule), with a stop-and-ask rung, so builds don't
  stall overnight.
- **Session names change after a restart** (the coordinator went from `claudes-games-fc` to
  `claudes-games-5f`). Keep the name in the charter and tell every session.
- **Messages can stall silently.** At 04:12 every session stopped reading messages at once,
  with no delivery notice. An idle session mid-phase that hasn't reported needs a poke in its
  own window. A builder can finalise a stalled planner's draft (twice here).
- **Pausing for a closed lid or a restart:** the coordinator tells the active builder to stop
  its sims (they resume) and subagents, and to leave half-done code uncommitted. The builder
  writes a PAUSED note with the resume step into the relay log. The coordinator checks that
  nothing is running and that git is clean before giving the all-clear.

## Deploying

The repo is `richardtape/claudes-games` (GitHub Pages from `main`, root). `scripts/deploy.mjs`
is modelled on `~/Developer/claudes-space/publish.py`:

- It refuses to deploy if `npm test` or `npm run check` fails (`--skip-checks` exists; avoid it).
- It stages every file git would track, minus dotfiles, `docs/` (specs, plans, the relay log)
  and games with `"draft": true`. That rule is `publishable()` in `scripts/publish-filter.mjs`
  (tested).
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
  relative paths, and a `cd` in one of several Bash calls sent in the same response moves the
  working directory for the others); use absolute paths. macOS `sed -i ''`. For multi-line edits a short
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
  stale copy over it (Dead Drop showed round 1's result after round 2 began). If a whole turn
  resolved behind the awaited card or flash, mark the update dirty and return, so the next
  pass reveals that turn from the board still on screen (`upToDate()` in Dead Drop's
  `showLatest`).
- Parallel work: a subagent drew Dead Drop's 24 silhouettes from a tight spec (function
  names, viewBox, `currentColor` plus one `.ac` accent class, sizes to check, the
  one-Chrome-at-a-time rule) while the engine, net and UI were built. While it worked, a
  Playwright route served placeholder art so screens could be checked early.
- Other sessions can load Rich's machine heavily (Comet Cup's build saw load 140–170 from
  other projects), and an offline generator then crawls: the first 240-hole bank run was
  heading for an hour and was killed with everything still in memory. Make generators
  resumable (append each accepted item to a file as it is made, like
  `games/comet-cup/tools/bank.mjs`), iterate with a small run (`--per 12`), start the full
  build early at `nice -n 19`, and do non-CPU work (copy, CSS, reviews) while it runs.
- Cross-browser determinism for physics replays: a step that uses only `+ - * /` and
  `Math.sqrt` gives bit-identical results in every JS engine, so a stored launch velocity
  replays the same path everywhere. Keep `sin`/`cos`/`pow`/`**` out of the step.
- An exception inside `render()` used to stop requestAnimationFrame for good (the game froze
  with one console error); `shared/loop.js` now asks for the next frame first. Effects that
  start in the future (`t0 > now`) must be skipped, not drawn with a negative radius.
- When a title card sits over a canvas demo, fit the canvas view into the free space beside
  (desktop) or above (phone) the card instead of drawing under it.
- In italic serif faces and in Didones (hairline horizontals) the U+2212 minus reads as a
  dash or vanishes. Draw it (a small bar) or say it in words ("two under par").
- Save logic must key off the game state ("is this hole scored?"), not the screen name: the
  result is recorded while the screen still says `play`, so a reload replayed a finished
  hole. Likewise detect a new match by an id the host stamps on every view, not by the screen:
  Dead Drop's guest sat on the dossier through a rematch. Reset per-match UI in one function
  (`freshMatchUi()`) when the id changes, and count each id once (`countMatch` in
  `js/meta.js`) so reloads and resumes never count a match twice.
- Feel check for gravity games: compare the escape speed of the biggest body with the top
  launch speed. Big worlds were traps until a 70% shot could escape them.
- Generated content needs eyes: a `contact()` debug helper that draws every generated level
  with its solution as miniatures (one `javascript_tool` call, one screenshot) made curating
  the bank quick.
- Size `clip-path` cut corners in px on panels that can grow tall: a % inset grows with the
  element and became a 90px wedge through Dead Drop's help text. `--cut-px` and `--cut-2-px`
  (`games/dead-drop/style.css`) keep every inset at 12px or less; % cuts stay on small slips.
- A clipped element can be a rule written for another screen: Dead Drop's help `.cities`
  grid (240px minimum columns) also matched a `<span class="cities">` on the dossier and pushed
  "+2 Agent Wren" past the clip to "+2 Agen". Name classes by what they are (`.city-list`),
  and read the computed styles before restyling.
- Make skippable waits re-timeable: Dead Drop's reveal `wait()` keeps each pending wait's
  remaining time, and `pace({ speed, skip })` re-arms them all, so Speed up or Skip lands at
  once rather than after the 750 ms wait already running. CSS keeps pace through a `--pace`
  variable and WAAPI through `dur(ms)` (`games/dead-drop/js/main.js`).
- One helper for full-screen interstitials (`showCard(html, cls, ms)` in Dead Drop): one card
  at a time, resolved by its timer or a skip. Keys skip at once, taps only after 400 ms (a
  double-click on Next round skipped the new round's card). It shows nothing when animations
  are skipped or a modal is open, and leaving tears it down and resolves its promise.
- Seat a bot after whatever should hold it is up: `attachBot`'s first `tick()` runs
  synchronously and checks its hold only then, so in round 1 the rival locked in behind the
  title card. Dead Drop's `startSolo` calls `beginMatch()` first, and debug helpers that seat
  a bot (`toFinalTurn()`) hold it themselves. Since Phase 2a, `stop()` also cancels a decision
  in flight: every await in `tick()` goes through a `nap()` that returns once stopped.
- Web Audio: a new GainNode starts at gain 1, so a note that starts exactly on a sample frame
  (sequencer grids often do) leaks one full-volume sample before its envelope: 31% of
  grid-timed hats clicked. `shared/sfx.js` now sets `gain.setValueAtTime(0, 0)` first (the
  `.value` setter can race `currentTime`). When you can't listen, render to an
  `OfflineAudioContext` and compare levels in dBFS with what the game played before.
- Refactor a rules engine against a frozen copy of itself (Dead Drop Phase 2a, 2 → 4 seats):
  copy the old engine and bot into `test/golden/v1/` (imports only changed), drive seeded bot
  matches on old and new side by side, and compare the state, the return value and every
  seat's view as JSON after each call, so a divergence names the step and the first differing
  path (key order counts). Add per-round digests and a whole-sim exactness run, and plant a bug
  once to see it fail. Every task ran the golden test and the engine and bot tasks the
  400-match check before committing, so two-player play never moved.
- When generalising a Monte Carlo bot, keep every RNG call in its old order at the old table
  size (shuffle each rival's pool, fill its hidden cards, deal, then your own deck), or every
  replay diverges. Hot paths that build fresh seat lists per call cost 2× until the lists are
  precomputed and frozen per table size (`rivalSeats(n, seat)` in Dead Drop's engine).
- A test that pins an order must use a case where the wrong order gives a different answer:
  Dead Drop's first Tripwire-order test used seat 0, where table order equals seat order, and
  could never fail. Plant the wrong order once and watch the test catch it.
- A sound counter in a smoke hears the music too. Dead Drop's "no sound after leaving
  mid-reveal" check passed only while an earlier victory cue still held the band silent; under
  load the title theme's spy chord (21 sources) landed in the count. Steps that count effects
  switch the music off with the game's own button and restore what they found. To show a
  flake predates your change, run the old commit in a worktree (`git worktree add`, symlink
  `node_modules`) with the suspected delay inserted.
- Re-issuing a secret card's id doesn't hide it when the id's shape gives it away: Dead Drop's
  uids ran `a0.0`–`a0.11` in deck order, so a Getaway's card re-issued as `a0.12` would still
  have named the card sent home. Mint opaque ids from the state's RNG
  (`<seat><round>.<4 base-36 characters>`) and re-key every card on its way back to a hand in
  one function (`returnToHand`).
- Check that the phone's play screen fits vertically, not only that nothing overflows sideways:
  Dead Drop's smoke measures the scorebar, the cities, the hand and Lock in against
  `innerHeight` (`phoneFits`). Fail first on a missing element: it measures `null`, and
  `null <= 844` is true in JS, so the first version would pass with the hand gone.
- A WAAPI animation's `.finished` doesn't settle in a hidden tab (Rich's Chrome often is), so
  an update that awaits it outside a skippable reveal hangs there. Time those steps with plain
  timers that resolve at once when skipping or under reduced motion (`outsideReveal()` in
  Dead Drop); not a zero timer, since a hidden tab runs timers only about once a second.
- After an `await` in an async UI update, use the state captured before it, not a variable
  re-read since: Enter during Dead Drop's 450 ms fold exit started the next round, the resumed
  code read the new round's view (no result yet) and threw, and pass and play froze. Capture
  what the step plays (`const ended = v`), stop when the round changed (`upToDate()`), and
  ignore action keys while a board is held (`ui.holdBoard`).
- Calibrate a behaviour test on positions where the behaviour can show, and compare it with
  the behaviour turned off rather than an absolute bar. Dead Drop's plan wanted a heavy film
  weight to send the bot into the film city 70% of the time on turn 1, where one drop of six
  barely moves who holds it: a correct build scored 13–17 of 30 at any weight. The kept test
  uses last-turn positions and needs a clear gap over weight 0; with the weighting broken it
  fails at 12 of 31, the same as weight 0.
- When another session commits to the repo while a task runs, build the task's review diff
  from its own commit's parent (`git diff <commit>^ <commit>`), not the base noted before it
  started, or the reviewer reads the other session's files as the task's.
- Freeze the previous engine and compare through a projection when a phase adds state. Dead Drop
  Phase 2b-ii copied the 2b-i engine, bot and data into `test/golden/v2/` and replays Classic
  bot matches on old and new side by side, comparing the state, the returns and the views as
  JSON after `project()` drops every key in `NEW_KEYS` (`test/golden/drive.mjs`). Each new key
  went at the end of its object, or appeared only when set, and joined `NEW_KEYS` in the commit
  that added it, so 15 tasks added rosters, taps, partners and twists while
  `tools/golden.mjs --check --matches 400` stayed identical. Old saves stayed readable without a version bump:
  `upgradeState()` fills each missing field with its Classic default in place, and the restore
  calls it (a bump would have turned away every 2b-i save and changed every golden digest).
- In a simultaneous turn, a rule that fires on arrival must not depend on who moved first. Dead
  Drop's Prague first revealed face-down agents on each arrival, so with the initiative a seat's
  own drop could disarm its Tripwire before the rival's arrival on the same turn sprang it. It
  now reveals once, after every drop of the turn has arrived (`pragueDrops`), and its test plays
  the same drops in two rounds whose initiative differs.
- `side.splice(side.indexOf(x), 1)` with `x` missing removes the *last* element, silently. Dead
  Drop Phase 2b-ii hit it twice: a Double Agent turned before its own flip removed the Turncoat
  from its side, and an Accomplice's Decoy partner that had already taken a Tripwire's hit took
  the Accomplice with it on its own arrival. Check that the card is still there before such a
  splice, and keep a random-play invariant that every card sits in exactly the side its city and
  owner name.
- Random-play property tests can't vouch for a case they never reach: count how often they hit
  each rule. Dead Drop's Mixed seeds made 325 partner drops and 242 Turncoat swaps but almost
  never dropped a turned asset face down after a Getaway sent it home, so an origin leak planted
  there passed them all; a directed test caught it. Give rare cases a directed test, and have
  the reviewer plant the bug.
- Smoke setups must hold on every roster the step can deal. A smoke that ended a match by
  setting the scores to [9, 3] (target 1) could tie at 9 on a Mixed table, where a Blackmailer
  and Macau can pay the trailing side 6 in one round; match endings now use [30, 0], a margin no
  round can close. And when two sources can make the same entry, assert on distinct values: the
  Countess's tap twist plus a Wiretap gave two identical `tapped` entries, and a length check
  flaked about one check run in seven.
- Commit a sim's analysis script as a tool before its numbers go in the log. Dead Drop's B30
  came from a scratch script, so nobody could rerun it until it became
  `tools/points-by-roster.mjs`, with its definitions (what a round's points include, how the ±
  is taken) in its header and in the SIMLOG entry.
- Dispatch on the shape of the RNG state to add entropy without moving a replay: Dead Drop's
  `rnd(state)` keeps mulberry32 when `state.rng` is a number (every seeded match: sims, goldens,
  the daily operation) and runs xoshiro128** when it is an array of four words from
  `crypto.getRandomValues` (real tables, `seed: null`). The goldens stayed identical and the
  save format did not change, because the array is plain JSON.
- Keep a lobby as pure state (`games/dead-drop/js/lobby.js`: seats, size, timer, roster, fill,
  start) and resolve a peer's seat from its token on every use. Dead Drop's session first cached
  the seat index at hello; `start()` drops empty seats and renumbers, so one guest received
  another's hand until the review planted a pre-start leave. Anything keyed by a seat that can
  renumber (last-seen clocks, stand-ins) is keyed by the token instead.
- A stable DOM convention lets new layouts reuse animation code unchanged: Dead Drop's
  `playEvents` finds any seat's row by `data-row="<city>-<seat>"`, so the 3–4 seat lanes above
  each plate took no change to the reveal, the exfiltration or Havana's glide.
- A `return` inside `try` skips code placed after the `finally`. Dead Drop's bot re-ticked after
  its try/finally, so a bot whose turn ended during a nap never heard the rematch and the table
  hung; the re-tick now lives inside the `finally`.
- Several tabs of one window are hidden all but one at a time, so a page that stops pinging when
  `document.hidden` is covered by a stand-in after 30 s and taken back when it comes to the
  front. That is the spec's intent on phones, but a three-tab test in one window sees stand-ins
  constantly: use separate windows (or the `?net=local` `ping=` knob) when the test is about
  something else.
- Live `pgrep -f` matches its own wait loop when the pattern appears in the loop's command line
  (`pgrep -f "tools/sim.mjs"` inside `while pgrep …; do sleep; done` never exits). Test with
  `ps -eo args | grep "[n]ode games/dead-drop/tools/sim.mjs"` (the bracket excludes the grep).
- Keep a turn clock as pure state with an injected `now` (`games/dead-drop/js/clock.js`: arm, left,
  expired, view) and let one session-side `attachClock` arm it from `table.onChange` and act on
  expiry through the same `table.act` calls a player makes. Tests then drive it with a manual
  clock, `__game.clock.expire()` is the real path, and the UI only draws what the view carries.
- Key anything you park across a decision by the decision it belongs to, captured when it was
  armed, not re-read later: Dead Drop parked a drop's remaining time while a call was answered,
  but took its key from `turnSeq` after the turn had already moved, so a Blackmailer flipped as a
  turn resolved handed the next turn three seconds. The review caught it with a planted test.
- Measure the busiest phone layout at 320px as well as 390px, with the longest names in every
  seat: four tags held 390px with 12-character codenames, but 320px needed the titles dropped
  ("Marten" for "Agent Marten") and the hand sized from its card count.
- With three or more peers in a mesh every peer hears every other, so a secret must go to the host
  alone. Dead Drop's guests said hello, token and all, to every peer (at two seats only a
  turned-away third browser could hear it), so at
  three a late spectator collected every guest's token and could take any seat and see its hand.
  Now the host announces itself (`host { v }`) to each newcomer and to a knock (a hello with no
  token), guests say hello only to a peer that announced itself and latch the first welcome, and
  the token on the wire is a per-room hash (SHA-256 of `token:code` through `crypto.subtle`), so one
  heard in one room claims nothing in another. Profiles from before the fix got a new token once
  (`meta.tokenV`), so a token already leaked matches nothing. A hub test wraps every room's
  delivery and asserts only the host's room ever hears a token, through a late spectator, a guest
  reload and a host reload (`createMemoryHub(n).add()`).
- A message that names no turn lands in whatever turn is current when it arrives: a guest's lock
  that reached the host after its turn resolved became the next turn's drop. Stamp actions with
  the round and turn they were made for and drop stale ones at the table (`table.act`).

- A replay must log every action that changes what a later one may do, not only the moves. Dead Drop's
  first "one that got away" design replayed drops alone, but a Blackmailer's call blocks the next turn
  until it is answered, and an escalation decides whether a later Blackmailer escalates at all. The
  round record (`js/replay.js`) keeps each turn's escalations, answers and folds in order, then the
  drops; replaying it matched every flip round (3,768 of 3,768). Prototype a replay against the real
  engine before planning around it: a scratch driver measured fidelity, hit rate and cost in minutes.
- Start a per-round record lazily, at the round's first action, and tie it to the state object it
  began on (a `WeakMap`): Dead Drop's debug `stage()` and the rematch put new states on the table
  without going through `act`, so a snapshot taken when the table was built went stale.
- A hindsight feature that replays with one change must skip, never throw, when the change breaks a
  later action, and guard the whole computation (`lineFor` wraps each seat's line in a try/catch): a
  hand-edited or older save with a malformed record otherwise threw at the round's end, after the
  engine had ended the round, and froze that save on every reload.
- Public per-round summaries leak in quiet ways. Dead Drop's recap first carried every seat's
  got-away (which can name a card in hand) and a fold-ended round's face-down cards (the bluff the
  folder never saw). Keep private lines in their seat's own view, mask anything still face down,
  and send a summary only when its one reader needs it (the case file, at match-over).
- A daily seeded "the same for everyone" must reseed every round, not only the match: one random
  draw during play (a Getaway's re-key) moved every later deal. And independent daily draws clump
  (the Turncoat was featured five days running): walk the schedule from an epoch, each day leaving
  out the day before's (`dailyOperation` in Dead Drop's `js/daily.js`).
- Give a daily its own save slot: Dead Drop's `finishMatch` cleared the one `match` save for every
  solo match, so a finished daily would have deleted a saved ladder match.
- A scripted tutorial is data plus gates, tested by playing its own suggestions and pinning every
  promise ("the Assassin takes out the Veteran", 5 to 0). Walk the script through the real engine
  before writing copy: the planned turn-5 tip (a Handler in Istanbul) would have been jammed by the
  rival's Jammer there. Gate every turn whose later coach lines state facts, or the lines lie as soon
  as a newcomer plays off script.
- Name classes for what they are across features: Dead Drop's lobby guide was planned as `.briefing`,
  which the scripted briefing already used on the play screen and its title slip.
- Offer nothing from Help that leaves a room without the quit sheet: "Play the briefing" from a guest
  lobby left the room silently and stripped `#join=CODE`, so a reload couldn't rejoin.
- A smoke file past a few thousand lines can grow in a sibling module without circular imports: Dead
  Drop's `smoke-return.mjs` exports `returnLoop(page, ctx, h)` and the default smoke passes its helpers
  in `h` (`until`, `idle`, `settle`, `phoneFits`…), so `check.mjs`'s cache-busted import of `smoke.mjs`
  never loads a second copy. A "wiring only" rule for a 4,500-line `main.js` still let it grow by 500
  lines in one phase: split the screens out before the next feature, not after.

- When verify-live's online runs fail, test the relays before the game: a bare Trystero room between two headless
  pages (import the pinned build on any https page, `joinRoom`, wait for `onPeerJoin`). On 2026-10-20 two public
  relays refused every handshake (502, 522) and even the bare room never joined, so the Phase 4 deploy's live duo and
  table failed twice, then passed ten minutes later with no change. Log each page's WebSockets
  (`page.on('websocket')`) to see which relays answer.

- A phone page whose content is wider than the screen doesn't scroll sideways: the browser zooms the
  whole page out, `innerWidth` grows to match, and an audit of `scrollWidth - innerWidth` stays 0. Sushi
  Raft's HUD ("rent 55 (purse 58)") pushed an `auto` grid column to 754px and the phone saw a cropped
  game. Give app grids `grid-template-columns: minmax(0, 1fr)` and let HUD rows shrink (`min-width: 0`,
  `overflow: hidden`). The fixed audit then found Dead Drop's phone title bleeding 35px (its spy and
  poster bars; now `overflow-x: clip` on `.title-screen`), which also cleared the 15–17px it reported
  on the reel card and got-away result, both drawn over that screen.
- A canvas whose box changes with the screen (a side panel that comes and goes) must be resized
  before it is drawn or hit-tested, not in a later `requestAnimationFrame`: the resize cleared the
  frame just drawn (a blank screenshot) and a guest's first tap after the morning landed on the wrong
  tile. Sushi Raft's `syncSize()` compares `clientWidth`/`clientHeight` at the top of every render, in
  the pointer handler and in the debug `tilePoint()`.
- A computer partner needs play-testing that a sim can't do. Sushi Raft's bot made good numbers, but as
  solo's computer Kelp it cooked the coached first dish before the player had tapped, took the only
  board and left the player's queue failing. The partner now waits until the coached dish sails, never
  heads for a station the player has queued (`claimed` in `js/bot.js`), and has no deliberate fumbles
  (they read as wandering to empty counters).
- Kitchen-sim bots: count intentions as supply (an otter already walking to the salmon crate), or two
  otters fetch the same salmon and clog the boards; pick jobs that can be made now, or an otter waits
  on cucumber nobody is bringing while tuna sits on the pass. That one change took the perfect bot
  from 51% to 94% of weeks, so retune the economy after every bot fix.
- A perfect bot that survives less often than a good one is usually spending, not cooking: in one night
  Sushi Raft's skill 1 was best, but a richer bot bought every complex dish at the market. Report
  per-night and per-week numbers separately, and weight orders toward simple dishes as a menu grows.
- Show a tip at the moment a rule changes, in the reader's own role: on a split-kitchen night Sushi
  Raft's computer Kelp stood still (correctly: it waits for fish over the pass), which looked broken
  until the night opened with "you have the fish and the boards: set things on the middle counter".

- A Python edit script that opens the file for writing before its text is final can wipe it: a
  stray trailing comma made `s` a tuple, `open(p, 'w')` truncated `hud.js`, then `write()` threw. Build
  and check the new text first (`assert isinstance(s, str)`), then write; commit milestones early.
- zsh doesn't split unquoted variables into words: `for s in "3 1 0"; do set -- $s` passes one
  argument. Write the calls out.
- Synthetic `PointerEvent`s (and real ones whose pointer is already gone) make `setPointerCapture`
  throw. First Light's burner handler threw before syncing input, so the button did nothing: capture
  last, in a try/catch (`capture()` in `games/first-light/js/main.js`).
- A chase camera hides what matters behind the player's own model. First Light takes photos from the
  basket (`render.photo(from, to)`: own balloon hidden, a 4:3 crop, then the chase view restored),
  swings round to look at a cross when one is in range, and lifts so the sunrise clears the envelope.
- Rewards for what's left over (propane, time, lives) can make quitting at once pay: gate them on
  finishing the objectives (leftover propane counts only once every marker is down).
- Resting contact flickers: count a collision only when moving into the thing (`vn < -0.7`), and
  decide "settled" by clearance with some slack, not by an `onGround` flag that toggles every step.
- A scrolling grid inside a flex-column dialog needs `min-height: 0` and `grid-auto-rows:
  max-content`; otherwise children with `overflow: hidden` (whose minimum size is 0) are squashed and
  the album's captions vanished on the phone.
- Title demos read better already under way: First Light pre-flies its demo balloon 30 s with the bot
  before showing the title, and keeps the demo's sun below the ridge so the real flight's sunrise
  stays a surprise.
- Put an envelope's own fields after the payload spread: `{ id: ++seq, type, ...data }` let a
  payload's `id` replace the sequence number. Sushi Raft's `buy` carried a dish id and its arrivals
  a customer id, and the page's "skip ids at or below the last one" check (`'tuna_nigiri' <= 333` is
  false) then replayed every later event on every frame: from the second night on, each tap drew 60
  ripples a second (a blue haze over the item), its sounds played 60 times over, and the night's
  banner restarted each frame so it showed only once the bad event scrolled out of the 80 kept,
  about 30 s in. The first night was clean because nothing is bought before it, and the headless
  checks never bought anything. Rich found it by playing (2026-10-24). An engine test now asserts that
  event ids rise by exactly one through a bot-played week with purchases; give any event or message
  stream that invariant test.
- Test a prediction by letting it come true: Sushi Raft's `onTheWay()` (which customer each sailing
  plate reaches) is checked by copying bot-night states, playing on with no new input and comparing
  the grabs with the ticks. Turn off in the copy what the prediction deliberately ignores (gulls
  stole the plates and only 112 of 245 ticks came true; without them all did). A hint like the
  station glow is tested the same way: tap every glowing tile in a copy and check that the dish
  moved on. The random nights still never sent two plates of one dish to one customer inside their
  2.2 s of eating, so a planted bug there passed until a directed test covered it.
- Short-lived canvas UI that runs on real time (Sushi Raft's 2.8 s recipe slip) outlives a smoke
  test that skips animations, and showed on the next morning's screen. Clear transient UI when the
  screen changes, then read the next screens' shots.
- Overlays drawn to the scene's design box show its edges on wide screens: the Lantern Rush's orange
  wash stopped at the box and left a light band over the harbour, unnoticed until the menu board sat
  across it. Fill the visible world (`R.world`) instead.

## Games so far

| # | Slug | Type | Genre | Look | Notes |
|---|---|---|---|---|---|
| 1 | press-run | word | Word roguelite (Balatro-style Ink × Pressure scoring, shop, bosses) | Letterpress: walnut, maple wood type, gunmetal dingbats, CMY process colours; Alfa Slab One + Libre Caslon | Rich: "SUPER fun". Pure engine + run simulator; daily seeded run; "the one that got away"; broadside poster at the end |
| 2 | night-stitch | drawing | Real-time lasso arcade: steer a needle, cross your own thread to loop moths; 8-hour night with bosses, notions, daily pattern, specimen case | Embroidery by lamplight: indigo night, linen in a beech hoop, DMC floss, cross-stitch numerals and title; IM Fell English | Canvas + shared/loop.js; human-ish bot for sim and title demo; the run stitches a sampler (end screen, PNG save); embroidery fades during play |
| 3 | dead-drop | card-duel | Spy card duel for two: both drop an agent in secret each turn and flip together; three cities with rule twists, escalate/fold stakes, first to 10 | 1960s spy-film titles: mustard field, ink city panels with skylines, paper cards with cut-paper silhouettes, red vs teal; League Gothic (jittered) + Courier Prime | First multiplayer game: online via shared/net.js (Trystero, host-authoritative masked views), pass and play, five Monte Carlo rivals; duo check + live duo in verify-live. Phase 1 (2026-10-18): the final turn at night ("Final drop" card, spotlights, ×2 stamp); an arranged surf-spy score as data (`js/music.js`) that follows the round, with city flourishes and the spy chord; worker sim harness and 20,000-round baseline (`tools/SIMLOG.md`); online rematch and leaving fixed (match ids, goodbye). Phase 2b-ii (2026-10-19): 20 agents and 20 cities in Classic or Mixed rosters of 12; the ladder's packs and announced twists; a story in cables, dossiers, remarks and an epilogue; unlocks into a network, with free play; card counting (the unseen strip). Classic is byte-identical to 2b-i, checked against a frozen copy of the 2b-i engine. Phase 3 part A (2026-10-20): tables of two to four online (lobby with seats, timer and roster, Start by the host, bots in empty seats, stand-ins after 30 s quiet, up to four spectators, PROTOCOL 4), a solo Table at 3–4 seats and pass and play 2–4; the tag bar, rival lanes, city and tag sheets, seat colours with patterns; answers revealed together, folds mid-round; a 128-bit deal RNG for real tables; the Blackmailer can be refused; targets and pace tuned per seat count (B34–B45); the multi-page `table` check locally and live. Part B (2026-10-20): the turn timer (Off, 30 s, Blitz) on the host's clock with a fuse across the hand and auto-Next; six emotes as paper slips; four tags at 320px, bottom sheets, night at four seats; spectators neutral. Phase 4 (2026-10-20): the return loop: today's operation (one match a day dealt the same for everyone,  Classic plus two featured agents and a city, its own save, the best margin on the title); "the one that  got away" after a lost round, private to its seat, at two to four seats (an action-log replay, B46); the  case file as a manila folder with evidence slips and a PNG poster; a scripted briefing against Agent Wren  with C's coach; four illustrated lines for a friend in the lobby |
| 4 | comet-cup | trajectory | Orbit golf: pull back and launch a comet past planets into a cup; nine plates a course, daily course, par from bots, ace line shown after each hole | Trouvelot astronomical pastels on blue-black paper, engraved plate frame and ticks, gold leaf for the goal; Bodoni Moda + Old Standard TT | Offline hole bank (generator + ace solver + noisy bots for par, `tools/bank.mjs`), deterministic physics, music of the spheres (each planet rings a note), gilded nine-plate sheet with PNG save |
| 5 | sushi-raft | management | Co-op kitchen for two phones: tap stations to queue your otter, plate sushi onto rafts round a canal; a week of five nights with rent, a morning market (dishes, upgrades) and announced twists, the split kitchen passing over the counter | A harbour pier at dusk: hinoki counters, indigo noren, vermilion lanterns, teal canal, bamboo rafts, cute harbour animals; Mochiy Pop One + Zen Maru Gothic | Real-time co-op over shared/net.js with 15 Hz host snapshots; solo with a computer Kelp (the sim's bot); characters and food drawn by a subagent to a signature contract (`js/art.js`); closing time stacks the night's plates by rim colour, stamps the rent and floats the otters home holding paws |
| 6 | first-light | exploration-3d | Hot-air balloon at dawn: steer by height through five veering wind layers; drop markers on three crosses, photograph landmarks, land before the propane runs out; daily flight | Dawn over Cappadocia: low-poly tuff strata (cream, apricot, rose), basalt-capped fairy chimneys, red river, Erciyes on the horizon, striped envelopes; Marcellus + Atkinson Hyperlegible Next | First three.js game (0.170.0, ~20 draw calls); pure engine with node tests; the sunrise turns gold when you climb above the rim and the camera swings to face it; basket photos fill a 12-page album; flight certificate with route map; bot pilot for demo and sim; `npm run drive` for hand play; made for Rich's phone on holiday |
