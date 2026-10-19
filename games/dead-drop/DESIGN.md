# Dead Drop

Two rival spymasters fight over three cities. Every turn both drop one agent card into a city
in secret, then both cards flip at the same moment. After six drops, whoever is stronger in
two of the three cities takes the round. Each player has three escalation tokens a match: spend
one to double the stake (once per round, first come), and the other must fold or play on. One
city each round carries the Microfilm: lose the round but hold that city, and you take a strip
of film. First to 10 points, or two strips, wins.

## The three loops

- **The moment (seconds):** pick an agent, pick a city, lock in. Both cards fly in face down
  and flip together. Tricks fire one by one; city totals tick.
- **The round (about two minutes):** six drops, rising tension. Escalate when you smell a win,
  or bluff, but a token spent now is one you won't have when you're behind. On the final flip
  the stake doubles, so folding before it saves half.
- **The return:** a ladder of five computer spymasters with personalities (cautious, reckless,
  a bluffer), and rematches with a friend.

## Rules

- Each player has the same 12-agent deck, shuffled. Start with 4 cards; draw 1 after each turn.
- Each city holds 3 agents a side. One drop per turn each; if no drop is legal, you pass.
- Flip order: the player holding the **First flip** token (a "1st" coin beside their name; it
  passes across every turn) resolves their flip trick first.
- Face-down agents have no tricks (except Tripwire) and can't be targeted. Their power still
  counts, hidden from the rival until the round ends.
- A city is won by the higher total (you need at least one agent there). Win more cities to
  win the round; if tied, the higher total power across the cities, **leaving Lisbon out**;
  else a dead heat (Stakes below has the full order). Lisbon's lowest total wins it, so
  counting it in the tie-break rewarded losing it. The simulator found leaving it out,
  inverting it or counting it all play alike (`tools/SIMLOG.md` B6), so the clearer rule won
  (`RULES.lisbonTiebreak` in `js/data.js`).
- Stake starts at 1 and doubles on the final flip. Escalation tokens, answers, folds, the pot
  and the Microfilm are under Stakes below.

### Agents (power, trick)

| Agent | Pow | Trick |
|---|---|---|
| Heavy | 6 | none |
| Sleeper | 4 | drops face down (was 5: the simulator showed it swinging rounds by 12 points) |
| Veteran | 3 | +3 while it's your only agent here |
| Double Agent | 3 | flip: moves to the city your rival dropped in this turn |
| Jammer | 3 | rival agents here have no tricks |
| Handler | 2 | your other agents here get +1 |
| Mole | 2 | rival agents here get −1 |
| Getaway | 2 | flip: your weakest other agent here goes back to your hand |
| Lookout | 1 | flip: draw a card |
| Assassin | 1 | flip: take out the strongest face-up rival agent here |
| Tripwire | 0 | drops face down; takes out the next rival agent to arrive here |
| Impostor | 0 | flip: becomes a copy of the agent your rival dropped this turn |

### Cities (three dealt per round)

Lisbon (lowest total wins), Vienna (drops land face down), Istanbul (first agent to arrive
gets +3), Berlin (room for two a side), Havana (everyone switches sides after turn 4),
Monaco (winning it scores +1 point whatever happens), Hong Kong (drop here and draw a card),
Helsinki (closes after turn 3), Moscow (agents can't be taken out or moved), Venice (boats on
odd turns only), Tangier (the strongest agent here is taken out when the round ends).

**Turned assets.** After Havana's switch, a Getaway there can pull a defected rival agent into
your hand. It joins your hand with a "Turned" rubber stamp in the rival's colour, and its
label and the ticker call it "a turned asset". The help's Cities tab
says so under Havana.

### Stakes (Phase 2b-i: the same rules at every table size)

At two seats the answers reduce to Phase 1's "the rival must fold or play on"; the tokens,
the pot, rollover and the Microfilm are new for two players too.

- **Tokens.** Every player starts the match with 3 escalation tokens (`RULES.tokens`), and
  escalating spends one. Tokens left are public. Still at most one escalation a round, by
  whoever calls it first: in Phase 1 the simulator showed per-player escalations made most
  rounds worth 8 and matches 3 rounds long.
- **Answers.** An escalation asks every other seat still in. Each answers once, in secret:
  play on or fold. When the last answer is in, the answers are revealed together
  (`round.called`): every seat that answered fold folds, paying the stake before it doubles,
  then the stake doubles if anyone played on. The escalator may fold while it waits, which
  calls the escalation off (no doubling; the token stays spent).
- **Folds.** Fold any time (a seat that owes an answer folds by answering fold; one that has
  answered waits for the call to settle). A fold pays the current stake into the round's pot
  and pulls your agents off the board (into `gone`); face-down ones stay face down, so nobody
  learns what they were. A seat that has folded drops, draws and passes no more this round.
  When one seat is left in, it takes the pot at once.
- **The flip.** The stake doubles on the final flip, and the round's winner scores stake × 2
  plus the pot. Monaco's +1 lands only at the flip, never on a fold.
- **Dead heat.** Nobody scores. The stake (not doubled) and the pot roll over into the next
  round's pot (`RULES.rollover`), and that round's title card says so.
- **Who wins the round.** The seat holding the most cities. Among seats tied on cities,
  whoever holds Zurich takes it (keyed by the city id `'zurich'` in `roundWinner`; Zurich
  arrives in Phase 2b-ii, so it never fires yet). Then total power across the cities with
  Lisbon left out, among the tied seats only; still level is a dead heat. A folded seat is
  never in the tie.
- **The Microfilm.** One of the round's three cities carries the film. Under the comeback rule
  (Rich, 2026-10-18), whoever holds that city at the end takes a strip of film only if they
  did *not* win the round: a consolation prize. If the winner holds it, nobody takes a strip;
  in a dead heat the holder does; a round that ends in folds never awards one. **A reel of 2:**
  two strips win the match outright, whatever the score, and if a strip and the points target
  land in the same round, the full reel wins. The rule a match uses is saved in it
  (`filmRule`). The spec's original rule (the holder always takes a strip) survives only as a
  sim switch (`rules.film=holder`): there the reel decided 83% of matches and only 24% of
  those were comebacks, because the round's winner usually holds the film city too (B20). A
  film that speeds the leader up was the spec's anti-goal; the comeback film is a counterweight.
- **Why a reel of 2.** Under the comeback rule strips come slowly (about 1.2 a match), so a
  reel of 3 decided only 3.0% of matches and a reel of 4 0.2%; a reel of 2 decided 21.3%,
  94% of them from behind on points (B20). The final check reads 22.3%, 89.1% from behind
  (B23).

**How the rivals bet** (`STAKES` in `js/data.js`, tuned at the bots' own samples,
`tools/SIMLOG.md` B11–B22). First written as escalate 0.45, answer −0.6, they escalated in 94%
of rounds and folded 10% of answers (B12): three tokens cover four or five rounds of one
escalation each, so tokens alone barely bit (B13).

- **The pace: `scarce` 1, `roundPoints` 1.** A rival counts the rounds left as the leader's
  distance to the target (÷ `roundPoints`) and keeps a token for every other one; each token
  short adds a full point to the value it needs, which puts escalating all but out of reach
  (value runs from −1 to 1). A rival holding all three tokens spends its first once the
  leader has 4 points, its second from 6 and its third from 8 (B16). `roundPoints` 1 is
  deliberately low (real rounds average about 2.4 points): it is the pace, not an estimate.
  The threshold alone can't pace them: it only moves escalation to later turns (B14).
- **`escalate` 0.1** (B22). With the pace on, escalations bunch on the first turn a token is
  free, and the threshold barely matters.
- **`answer` −0.29** (B17–B21): play on above it. It trades folds in answer against the
  escalator's win rate, because a fold in answer is the escalator's win.
- **`bluffTurn` 2, and bluffs follow the pace** (B18, B21, B22). Value escalations start on
  turn 2, so a turn-1 escalation would always be a bluff. A rival that bluffed while holding
  its tokens back for value made every early escalation a bluff, a tell anyone could learn
  with tokens public, so a bluff also waits until no token is short.
- **The film when choosing a drop, not when betting.** Playouts score the round and the film;
  `think` ranks drops by round + w × film, with w = `filmWeight` 0.4, or `filmDecisive` 1.5
  once any seat is one strip from the reel. Stake calls use the round alone. `filmWeight` is a
  behaviour setting, not tuned to hit the reel's share (the reel's strips come from losing
  rounds while holding the film city, not from aiming for it: B20, B22).

The final check, 20,000 rounds of Heron against Heron (B23,
`tools/baselines/phase2b1-final.json`):

| Rate | Band | B23 | Phase 1 (B1) |
|---|---|---|---|
| Escalation | 35–60% | 49.4% ±0.7 | 99.0% |
| Won at the flip with the stake doubled | ≤ 40% | 30.2% ±0.6 | 78.0% |
| Escalator won | 55–65% | **66.0% ±0.9** (accepted miss) | 66.8% |
| Answered with a fold | 25–35% | 27.2% ±0.9 | 9.6% |
| Rounds per match | 5–7 | 5.92 ±0.06 | 4.53 |
| The full reel decides | 5–25% | 22.3% ±1.4 (89.1% from behind) | – |
| Seat 0 wins | 45–55% | 49.2% ±1.7 | 49.5% |
| Half-time leader wins | report | 57.2% ±1.8 | 73.9% |

The escalator's 66.0% is one point over its band, more than its margin. The coordinator
accepted it for 2b-i as a known miss (B23): with folds in answer held at 25% or more it can
only fall through weaker wins when called, every neighbouring setting read 65–66 (B22), and
escalation is now selective (49% against 99%), so the escalator wins a little more, as a
selective bettor should. Matches run 5.9 rounds, so the target stays 10.

## Ways to play

- **Computer:** a ladder of five rivals (Monte Carlo bots with personalities).
- **Online:** host opens a room, shares a link or QR code; the host's browser runs the rules
  (`shared/net.js` over Trystero). Invite-only, codenames from a list, no chat. Every match
  carries an id, so Rematch brings both players back to a fresh table and the matches-played
  count takes each match once, however often a player reloads. Leaving says goodbye: the
  other side sees "Agent X left the table".
- **Pass and play:** one device; a cover screen hides each player's choice.

## Controls

Tap or click a card, then a city, or drag a card onto a city (a drag only chooses; Lock in
still commits). Lock in. Keys: 1–7 pick a card, A S D pick a city, Enter locks in, Esc or
Backspace takes it back, E escalates (Escalate shows the tokens left, and with none it is
disabled and E does nothing), F folds, M mutes all sound (the music button turns off just the
music), ? opens help.

During a reveal, Space (or a tap) speeds it up to 3×, and Space again skips it; the first
400 ms ignore taps and keys, so a double-click on Lock in doesn't skip the flip. At a round's
result, B (or "See the board") slides the result down to a strip so the board shows behind
it, and B again brings it back. Enter skips a fold's flash like any card, but while the
folder's agents pull out (the exfiltration), Enter and B wait for the result.

**Help** is a paper sheet with four tabs: Rules, Agents, Cities and Keys (Keys is hidden on
touch screens). ← → switch tabs. The sheet keeps one height, so the tabs don't jump; only its
body scrolls, and its cut corners are sized in px so they never clip the text.

## The round on screen

- **The round title card.** Every round opens on a 2.5 s card: "ROUND N" over mustard bars
  with a thin red and a thin teal one, and three paper slips (skyline, city name, its rule)
  sliding in from alternate sides. Enter, Space or Esc skips it, or a tap after its first
  400 ms. The computer rival waits for it.
- **The First flip token.** A paper coin marked "1st" sits beside the name of whoever's flip
  tricks go first this turn. It spins across (rotation only) when it changes sides; an empty
  slot on the other side keeps both names still.
- **The final turn at night.** Turn six plays after dark (see Look). A 1.2 s "Final drop"
  card opens it: oxblood bars slam in from alternate sides, "FINAL DROP" slams down, a flat
  cone of light flickers on, and "The stake doubles on the flip" types out on a paper slip.
  It skips like the title card and is left out under reduced motion (the night and the stamp
  stay). Once both lock in, everything but the cities, the ticker and the Speed up control
  fades to 35%, so the flip plays in the spotlights.

**The stakes on the table** (Phase 2b-i):

- **The scorebar's marks.** Beside each score, that player's escalation tokens as paper chits
  (skewed, every other one tilted) in their colour, spent ones as outlines; then the reel, one
  ink film frame with sprocket holes per strip it takes, the window filled in the player's
  colour once a strip is earned. On phones the marks share the score's row on the inside, so
  the scorebar is no taller. Escalate reads "N left"; with none left it is drawn like a spent
  chit, "0 left", and disabled.
- **The canister.** The film city's plate carries a film canister seen from above (a cut disc
  with five holes round the hub) and "Film" in its top-left corner: mustard on the ink plate,
  paper at night. On the round's title card the film city's slip has a "Carries the film" tab,
  and ink slips under the slate say "The film travels via Vienna." and, after a dead heat,
  "3 points rolled over into this round's pot." The escalation prompt and the fold sheet count
  the pot and say what the answer means for the film.
- **The pot chit.** While the pot holds points, a mustard "+3" chit hangs off the stake slip's
  left edge (the ×2 stamp keeps the right).
- **The strip flight.** When a round awards a strip, after the cities resolve (on the reveal's
  clock, so Speed up and Skip work) a frame jumps out of the canister at 2.6×, arcs over the
  board turning, and drops into the taker's next frame with a paper flare and a projector
  clatter (four ticks and a blip). At night the scorebar's lights come up for the landing.
  Under reduced motion the frame just fills. The result says where the film went ("You lost
  the round but held Vienna: you take a strip of film (1 of 2).") or why it stayed put: a fold,
  nobody holding the city, or the winner holding it.
- **The exfiltration.** A fold flashes, then, over the board as it stood, the folder's agents
  lift, tilt and fade (0.45 s) while the ticker says "Agent Wren pulls out of the round." It
  runs on plain timers (at once when skipping or under reduced motion), never a WAAPI
  `.finished`, which stalls in a hidden tab.
- **The reel card.** A full reel plays a 1.8 s card after the flip or the fold and before the
  result: bars in the winner's colour, an ink filmstrip running in with one frame per strip,
  the title spy exposed in each in turn, "The full reel" slammed down, and "You have both
  strips. The match is yours."
- **The dossier's strips.** Each side's frames hang under its score on the final line, a round
  that gave a strip gets a small frame in the taker's colour beside its film city, and a reel
  win says so ("You took the full reel.").

## Look

The opening titles of a 1960s spy film: flat cut-paper shapes, hand-cut type (League Gothic,
each letter jittered), dossier typewriter text (Courier Prime). A mustard table; cities are
black cut-paper panels with skyline silhouettes; you are signal red, the rival is petrol teal;
cards are paper with a black silhouette. Colour carries ownership.

**Night** is the same titles after dark: the mustard table turns to ink with an oxblood glow
from the top edge; each city stands in a flat, cut-paper cone of warm light (a city closed
this turn stands in the dark); your hand is edged in warning-lamp red; the stake slip turns
oxblood and a red "×2" rubber stamp lands on it once. After the final flip each cone takes its
holder's colour like a theatre gel, or goes dark if nobody holds the city. The phone's browser
bar turns oxblood too. A rematch or the next round comes back by day.

## Sound

An arranged score, all synthesised: the notes are data in `js/music.js` (pure, tested) and
`js/audio.js` plays them on `shared/seq.js`. Music mutes separately from effects and plays at
0.7 of their level; it never starts in a hidden tab, and stops when the window loses focus.

- **The table:** a 1960s spy-surf piece in E minor at 128 bpm. Intro (bass alone, 4 bars,
  once), then A 8 (the surf hook over a tresillo bass), A2 8 (adds the old spy brass line
  B–C–C#–C), B 8 (the bridge, over a train beat), a 4-bar break of surf toms, and back to A.
  Two riffs and two sets of bridge chords alternate by pass, so it runs about 112 s before it
  repeats, and fills vary the phrase ends.
- **Levels follow the round:** turn 1 is bass and hats; turns 2–4 add drums and the riff;
  turn 5 or a raised stake brings the whole band; the final turn drops it for a heartbeat and
  a ticking clock; between rounds, the break. Changes land on the next bar line, except
  into and out of the final turn, which cut at once.
- **The final flip:** the score cuts to silence for the reveal, and the cards slam down on the
  spy chord (an EmM9 strummed over a pad).
- **City flourishes:** as each city resolves it plays a one-second phrase in its own idiom,
  centred on E: a fado turn (Lisbon), a Third Man zither in 3/4 (Vienna), a Hijaz run
  (Istanbul), Weill oom-pah (Berlin), brass on the tresillo (Havana), a harp glissando into a
  jackpot chord (Monaco), a pipa line (Hong Kong), open fifths and ice pings (Helsinki), a
  brass march (Moscow), a barcarolle (Venice), a double-harmonic descent (Tangier). The
  rival's version plays an octave down on a plain triangle.
- **Elsewhere:** a title theme (the hook with the full band, 120 bpm, opening on the spy
  chord), a lounge bossa nova for the online lobby (132 bpm, down the circle of fifths), and
  victory and defeat cues. Flourishes and cues count as effects, so they play with music off.
- **Effects:** card slides (noise sweeps), flips (click + thud), takedowns (snap), escalate
  (brass stab + heartbeat), a strip of film (a projector clatter: four bandpass ticks and a
  soft blip), the full reel (the slam).

## The memorable moment

**The final drop.** Turn six falls dark: the "Final drop" card slams in, the table goes to ink
and spotlights, the ×2 stamp lands on the stake, and the band drops out to a heartbeat. Both
lock in, the music cuts to silence, the cards slam down on the spy chord, every face-down card
turns over, then the cities resolve one at a time under their spotlights: totals tick up, the
winner's colour sweeps across the city in Saul Bass bars, the cone takes the winner's colour,
the city plays its flourish, and the stake (doubled, plus any pot) slides to the winner's
score. If the loser held the film city, a strip of film then flies from its canister into
their reel.

## Seats and the engine (Phases 2a and 2b-i: the engine plays 2–4)

Every screen still seats two players, but the rules engine, the bots, the table and the
simulator play 2, 3 or 4 seats (`MIN_SEATS`, `MAX_SEATS` and `SEAT_NAMES` in `js/data.js`). Each
rule reduces to the two-player one at two seats:

- **Marks:** "your rival's drop" (Double Agent, Impostor) means your *mark's* drop. The mark of
  seat `s` in round `r` is `(s + 1 + r mod (N − 1)) mod N`, so marks rotate each round and two
  players always mark each other (`markOf`).
- **Rival agents here** (Mole, Jammer, Assassin, Tripwire) means every other seat's agents.
  Moles stack. An arriving agent springs the first armed rival Tripwire in table order after
  its owner; the Assassin takes the strongest face-up agent of any rival (latest arrival on a
  tie, then the later seat in that order).
- **Initiative** for turn `t` of round `r` is `(r + t − 1) mod N`. Drops land, tricks fire and
  cards are drawn in table order from the holder (`turnOrder`).
- **Havana** passes every agent there to the next seat round the table at the end of turn 4
  (the swap, at two), skipping folded seats. A seat whose mark has folded keeps that mark, so its Double
  Agent and Impostor find no drop, as when a mark passes.
- **Scoring:** a city goes to the single highest total among seats with agents there (above
  0); Lisbon to the single lowest. A round goes to the single seat with most cities, else
  Zurich's hook (see Stakes), else the tie-break totals (Lisbon left out) among the tied seats
  only. A match ends when the single leader reaches the target (`leaderOf`, `roundWinner`,
  `matchWinner`), or when a seat fills the reel.
- **Stakes play at every table size** (Phase 2b-i; see Stakes). The two-player pace and target
  don't carry over: simulated at 3 and 4 seats (targets 8 and 7), matches last 4.2 and 3.5
  rounds, escalation runs 73.9% and 68.2%, and the reel decides 6.9% and 5.1% of matches
  (B25, B26). Phase 3 retunes the targets and the pace.
- **Not yet:** online play refuses more than two seats, and no screen shows a third player
  (Phase 3). A seat number outside the table sees as a spectator and can't act.
- **Card uids are opaque.** Every uid is `<seat letter><round>.<4 random base-36 characters>`
  from the state's RNG (`mintUid`), and a card going back to a hand is re-keyed under a fresh
  one (`returnToHand`, the only way back to a hand: Phase 2b-ii's new paths must use it). A
  secret card shows its owner as its `origin`. Why: a Getaway used to send a card home under
  its old uid, so a rival who had seen it face up knew it when it came back face down; and
  re-issuing alone wasn't enough, because the uids were `a0.0`–`a0.11` in deck order, so a
  re-issued `a0.12` would have said "this is the card the Getaway sent home". A fresh uid looks
  like every other uid a rival has never seen.
- **Versions.** The saved state is `v: 2` and the network `PROTOCOL` is 2. A match saved before
  the stakes is dropped with one toast and no Continue; a v1 peer gets the "different version"
  message.
- **Two-player play is guarded by golden replays.** `test/golden/two-player.json` holds
  per-round digests of 24 seeded two-player bot matches (the state, each call's return and the
  views for seats 0, 1 and −1 after every call), and `test/golden/sim-2p.json` a short
  simulator run's summary; `test/golden.test.mjs` replays both. Through Phase 2a they were
  compared call by call with a frozen copy of the Phase 1 engine; Phase 2b-i's tokens changed
  two-player rules, so that copy was retired and both fixtures were re-recorded on the
  finished 2b-i engine (`tools/golden.mjs --record --force`). They are the reference for
  Classic two-player play: Phase 2b-ii's Classic play must keep them.
  `test/golden/v1-table.json` is a table saved by the Phase 1 build, kept to test that an old
  save is dropped.
- **The UI:** mechanics that go over seats use lists (`allSeats`, `rivals`); two-player copy
  and layout go through `foe()` in `js/main.js` (and `rivalsOf(...)[0]` with a note in
  `js/board.js`), so Phase 3 can find every two-player assumption by searching for them.

## Simulation

`tools/sim.mjs` plays bot-vs-bot matches on worker threads and prints every rate with its 95%
margin. `tools/SIMLOG.md` records each run (question, exact command, numbers, decision),
starting from the Phase 1 baseline, Heron against Heron for 20,000 rounds
(`tools/baselines/phase1-heron.json`). Since Phase 2b-i the two-player reference is the stakes'
final check, B23 (`tools/baselines/phase2b1-final.json`). Measure every rule change against it:

```
nice -n 19 node games/dead-drop/tools/sim.mjs --run NAME --rounds 5000 --against games/dead-drop/tools/baselines/phase2b1-final.json
```

Main flags: `--rounds N`, `--a ID --b ID` (rivals, default Heron), `--samples N` (8 is about
twice as fast; confirm stake numbers at the bots' own samples), `--set path=value` (e.g.
`heavy.power=5`, `rules.reel=3`, `stakes.answer=-0.3`), `--variant name:key=value` for A/B
runs, `--probe agents|cities|stakes` (stakes: 2 or 9 tokens, no film, no rollover),
`--ladder`, `--pin city`, `--out FILE`, `--resume`, `--json`. The doc comment at the top of
`tools/sim.mjs` lists them all. Results don't depend on `--workers`.

More seats: `--seats N` (2–4) with `--c ID --d ID` for seats three and four; each match index
rotates the bots one seat, and the report adds each seat's and each bot's share. The first look
at 3 and 4 seats (stake 1, no escalation) is SIMLOG B10 (`tools/baselines/phase2a-seats3.json`,
`phase2a-seats4.json`): every seat inside 1/N ± 5 points. At N seats an agent's "win% when
played" sits near 100/N, not 50. Four seats cost about 4 rounds a second on 4 workers, so batch
those runs.

Skill still tells with the stakes on, a little less than before (B24): Control beats Wren in
79.8% of matches (Phase 1: 85.4%), and no step of the ladder is inverted, but Countess against
Control is within noise (the Countess wins 47.4% ±5.0), so Phase 2b-ii's rival twists must
restore a clear step there.

`tools/think-time.mjs [--rivals heron,control] [--seats 2,3,4] [--positions 30] [--json]`
times a bot's move per seat count. Thinking grows about 2.2× per added seat: Control at 3–4
seats is too slow for a phone (p95 106 and 205 ms on Rich's Mac, which is 3–5× faster than a
phone), so Phase 3 must cap samples by seat count.
