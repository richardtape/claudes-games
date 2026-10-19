# Dead Drop

Two rival spymasters fight over three cities. Every turn both drop one agent card into a city
in secret, then both cards flip at the same moment. After six drops, whoever is stronger in
two of the three cities takes the round. Either player can escalate (double the stake) at any
time (once per round, first come), and the other must fold or play on. First to 10 points wins.

## The three loops

- **The moment (seconds):** pick an agent, pick a city, lock in. Both cards fly in face down
  and flip together. Tricks fire one by one; city totals tick.
- **The round (about two minutes):** six drops, rising tension. Escalate when you smell a win,
  or bluff. On the final flip the stake doubles, so folding before it saves half.
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
  else a draw. Lisbon's lowest total wins it, so counting it in the tie-break rewarded losing
  it. The simulator found leaving it out, inverting it or counting it all play alike
  (`tools/SIMLOG.md` B6), so the clearer rule won (`RULES.lisbonTiebreak` in `js/data.js`).
- Stake starts at 1. One escalation per round, by whoever calls it first: the rival must fold
  (lose the current stake) or play on (stake doubles). Fold any time to lose the current
  stake. If the round goes to the end, the stake doubles on the final flip (max 4 points).
  The simulator showed per-player escalations made most rounds worth 8 and matches 3 rounds
  long; one escalation per round gives about 3 points a round and 5-round matches.

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
Backspace takes it back, E escalates, F folds, M mutes all sound (the music button turns off
just the music), ? opens help.

During a reveal, Space (or a tap) speeds it up to 3×, and Space again skips it; the first
400 ms ignore taps and keys, so a double-click on Lock in doesn't skip the flip. At a round's
result, B (or "See the board") slides the result down to a strip so the board shows behind
it, and B again brings it back.

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
  (brass stab + heartbeat).

## The memorable moment

**The final drop.** Turn six falls dark: the "Final drop" card slams in, the table goes to ink
and spotlights, the ×2 stamp lands on the stake, and the band drops out to a heartbeat. Both
lock in, the music cuts to silence, the cards slam down on the spy chord, every face-down card
turns over, then the cities resolve one at a time under their spotlights: totals tick up, the
winner's colour sweeps across the city in Saul Bass bars, the cone takes the winner's colour,
the city plays its flourish, and the stake (doubled) slides to the winner's score.

## Seats (Phase 2a: the engine plays 2–4)

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
- **Havana** passes every agent there one seat along at the end of turn 4 (the swap, at two).
- **Scoring:** a city goes to the single highest total among seats with agents there (above
  0); Lisbon to the single lowest. A round goes to the single seat with most cities, else the
  tie-break totals (Lisbon left out) among the tied seats only. A match ends when the single
  leader reaches the target (`leaderOf`, `roundWinner`, `matchWinner`).
- **Not yet:** stakes stay two-player (at 3–4 seats escalate, respond and fold refuse, and the
  bots never call; Phase 2b-i adds stakes for every table size). Online play refuses more than
  two seats, and no screen shows a third player (Phase 3). A seat number outside the table sees
  as a spectator and can't act.
- **Two-player play is guarded by golden replays.** `test/golden/v1/` is a frozen copy of the
  Phase 1 engine and bot. `test/golden.test.mjs` and `tools/golden.mjs --check --matches 400`
  play seeded two-player bot matches on both and compare the state, the events and the views
  for seats 0, 1 and −1 after every call. They stop matching at Phase 2b-i's first two-player
  rule change (tokens), which retires or re-records them.
- **The UI:** mechanics that go over seats use lists (`allSeats`, `rivals`); two-player copy
  and layout go through `foe()` in `js/main.js` (and `rivalsOf(...)[0]` with a note in
  `js/board.js`), so Phase 3 can find every two-player assumption by searching for them.

## Simulation

`tools/sim.mjs` plays bot-vs-bot matches on worker threads and prints every rate with its 95%
margin. `tools/SIMLOG.md` records each run (question, exact command, numbers, decision),
starting from the Phase 1 baseline, Heron against Heron for 20,000 rounds
(`tools/baselines/phase1-heron.json`). Measure every rule change against it:

```
nice -n 19 node games/dead-drop/tools/sim.mjs --run NAME --rounds 5000 --against games/dead-drop/tools/baselines/phase1-heron.json
```

Main flags: `--rounds N`, `--a ID --b ID` (rivals, default Heron), `--samples N` (8 is about
twice as fast; confirm stake numbers at the bots' own samples), `--set path=value` (e.g.
`heavy.power=5`, `rules.lisbonTiebreak=invert`), `--variant name:key=value` for A/B runs,
`--probe agents|cities`, `--ladder`, `--pin city`, `--out FILE`, `--resume`, `--json`. The doc
comment at the top of `tools/sim.mjs` lists them all. Results don't depend on `--workers`.

More seats: `--seats N` (2–4) with `--c ID --d ID` for seats three and four; each match index
rotates the bots one seat, and the report adds each seat's and each bot's share. The first look
at 3 and 4 seats (stake 1, no escalation) is SIMLOG B10 (`tools/baselines/phase2a-seats3.json`,
`phase2a-seats4.json`): every seat inside 1/N ± 5 points. At N seats an agent's "win% when
played" sits near 100/N, not 50. Four seats cost about 4 rounds a second on 4 workers, so batch
those runs.

`tools/think-time.mjs [--rivals heron,control] [--seats 2,3,4] [--positions 30] [--json]`
times a bot's move per seat count. Thinking grows about 2.2× per added seat: Control at 3–4
seats is too slow for a phone (p95 106 and 205 ms on Rich's Mac, which is 3–5× faster than a
phone), so Phase 3 must cap samples by seat count.
