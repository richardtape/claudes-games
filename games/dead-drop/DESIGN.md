# Dead Drop

Winter, 1963. You run a network of agents against rival services. Two rival spymasters fight
over three cities. Every turn both drop one agent card into a city in secret, then both cards
flip at the same moment. After six drops, whoever is stronger in two of the three cities takes
the round. Each player has three escalation tokens a match: spend one to double the stake (once
per round, first come), and the other must fold or play on. One city each round carries the
Microfilm: lose the round but hold that city, and you take a strip of film. First to 10 points,
or two strips, wins.

Since Phase 2b-ii the game has 20 agents and 20 cities. A match deals one roster of 12 agents to
everyone: Classic (the original 12 agents and 11 cities) or Mixed. A ladder of five rival services
each brings new agents and cities and an announced rule twist, and what a rival brings joins your
network when you beat it. Rounds are operations in a story told by cables from C.

## The three loops

- **The moment (seconds):** pick an agent, pick a city, lock in. Both cards fly in face down
  and flip together. Tricks fire one by one; city totals tick.
- **The round (about two minutes):** six drops, rising tension. Escalate when you smell a win,
  or bluff, but a token spent now is one you won't have when you're behind. On the final flip
  the stake doubles, so folding before it saves half.
- **The return:** a ladder of five rival services with personalities (cautious, reckless, a
  bluffer), each with a dossier, an announced rule twist and a pack of new agents and cities.
  Beating one recruits its pack into your network ("Network: 14 of 20 agents · 13 of 20 cities"),
  the network opens free play on Mixed rosters, and beating Control reveals who signed the cables.
  Rematches with a friend.

## Rules

- Each player has the same 12-agent deck, shuffled: the match's roster (Classic or Mixed, below).
  Start with 4 cards; draw 1 after each turn.
- Each city holds 3 agents a side. One drop per turn each; if no drop is legal, you pass.
- Flip order: the player holding the **First flip** token (a "1st" coin beside their name; it
  passes across every turn) resolves their flip trick first.
- Face-down agents have no tricks (except the Tripwire and the Decoy) and can't be targeted.
  Their power still counts, hidden from the rival until the round ends.
- A city is won by the higher total (you need at least one agent there). Win more cities to
  win the round; if tied, the higher total power across the cities, **leaving Lisbon out**;
  else a dead heat (Stakes below has the full order). Lisbon's lowest total wins it, so
  counting it in the tie-break rewarded losing it. The simulator found leaving it out,
  inverting it or counting it all play alike (`tools/SIMLOG.md` B6), so the clearer rule won
  (`RULES.lisbonTiebreak` in `js/data.js`).
- Stake starts at 1 and doubles on the final flip. Escalation tokens, answers, folds, the pot
  and the Microfilm are under Stakes below.

### Rosters: Classic and Mixed (Phase 2b-ii)

Every match deals one roster of 12 agents to every seat (mirror decks stay fair) and three cities a
round from its pool, at every table size. The state keeps `roster`, `cityPool` and `twist`;
`js/roster.js` makes them from a setup and `newMatch` takes them.

- **Classic:** the original 12 agents (`DECK`) and 11 cities (`CLASSIC_CITIES`), no twist. It is
  Agent Wren's table and the online and pass-and-play default, so a friend arriving by link meets a
  game they can learn in a minute. Classic plays exactly as Phase 2b-i left it (see Seats and the
  engine).
- **Mixed:** 12 drawn from a pool of agents (`drawRoster`), always with the Heavy (`ROSTER.always`)
  and never without a takedown: the draw is redone, up to 50 times, while it holds neither the
  Assassin nor the Tripwire, and then the Assassin is forced in. Online and pass and play's Mixed
  (`MIXED_ALL`) draws from all 20 agents and deals all 20 cities; the ladder and free play draw from
  smaller pools (The ladder and the story).
- **Tonight's roster.** A match whose roster isn't the Classic 12 (in any order) opens on a
  "Tonight's roster" card, and Help's Agents tab lists tonight's roster first.

### The Classic agents (power, trick)

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

### The Classic cities (three dealt per round)

Lisbon (lowest total wins), Vienna (drops land face down), Istanbul (first agent to arrive
gets +3), Berlin (room for two a side), Havana (everyone switches sides after turn 4),
Monaco (winning it scores +1 point whatever happens), Hong Kong (drop here and draw a card),
Helsinki (closes after turn 3), Moscow (agents can't be taken out or moved), Venice (boats on
odd turns only), Tangier (the strongest agent here is taken out when the round ends).

**Turned assets.** After Havana's switch, a Getaway there can pull a defected rival agent into
your hand. It joins your hand with a "Turned" rubber stamp in the rival's colour, and its
label and the ticker call it "a turned asset". The help's Cities tab
says so under Havana.

### The new agents (Phase 2b-ii)

The powers are the spec's. They were checked on Mixed rosters by screen, probe and confirm
(`tools/SIMLOG.md` B28, B29): every agent wins 44–56% of the rounds it is played in, so none
changed. The last column is the confirm, B29 (20,098 rounds, Heron against Heron at 24 samples).

| Agent | Pow | Trick | Brought by | Win% when played (B29) |
|---|---|---|---|---|
| Wiretap | 1 | flip: next turn, you hear which city your rival picks once they lock in | The Countess | 46.0 ±1.3 |
| Interrogator | 2 | flip: every face-down rival agent here turns face up | Control | 46.6 ±1.1 |
| Bodyguard | 2 | your other agents here can't be taken out or turned | Mr Heron | 46.8 ±1.0 |
| Accomplice | 1 | drops with a partner: a second card from your hand, face down | The Countess | 49.1 ±0.9 |
| Turncoat | 0 | flip: swaps sides with the weakest face-up rival agent here | Control | 47.9 ±1.0 |
| Courier | 2 | flip: your strongest face-up agent in another city moves here | The Magpie | 45.9 ±1.0 |
| Blackmailer | 2 | flip: escalates for free if nobody has yet; no folding in answer | The Magpie | 46.7 ±1.2 |
| Decoy | 0 | drops face down; takes the hit for your next agent here to be taken out or turned | Mr Heron | 47.8 ±1.4 |

The Classic 12 stay in band on Mixed too (the Lookout 46.7 to the Heavy 51.8). The readings below
are the plan's Decision 4 and the rulings made while building it. Each is also stated plainly in the
agent's `note` in `js/data.js`, which Help shows, so nobody has to guess (the numbered decisions
cited in this file are the plan's, `docs/superpowers/plans/2026-10-18-dead-drop-phase-2b2.md`):

- **Tricks while face down.** Only the Tripwire and the Decoy keep their tricks face down, and both
  lose them when jammed or in Vienna. Every other trick does nothing face down (a Blackmailer
  dropped face down in Casablanca doesn't escalate).
- **The Bodyguard and the Decoy cover the same four things:** the Assassin, the Tripwire, Tangier
  and the Turncoat. They don't cover Havana's switch or Glienicke Bridge's crossing, which are city
  rules.
  - A guarded agent isn't a valid target: the Assassin, the Turncoat and Tangier take the strongest
    (or weakest) agent they *can*.
  - A guarded arrival doesn't spring a rival Tripwire, which stays armed.
  - The Bodyguard doesn't guard itself, and it is checked before the Decoy, so a guarded agent never
    uses a Decoy up. The Bodyguard itself is unguarded, so a face-down Decoy can take a hit for it.
  - The Decoy covers only while face down, and only once: it turns face up and goes in the other
    agent's place (`stand()` in the engine). Once revealed (by an Interrogator, Prague, Havana or an
    earlier hit) its cover is blown, and dropped face up in Casablanca it has no trick at all.
  - **Tangier.** At the round's end a face-down Decoy in Tangier stays face down until Tangier
    strikes, so it can stand in for Tangier's victim; Decoys that weren't needed then turn over.
- **The Accomplice.**
  - The partner is optional ("Drop alone"), so one free place or no other card in hand is never a
    dead end. A partner drop needs two free places on your side.
  - The partner drop is part of how the Accomplice drops, like a Sleeper landing face down, so it
    works in Vienna and when jammed.
  - The partner lands face down, flagged `partner` for everyone (rings on its chip). Its tricks are
    off, except a Tripwire's or a Decoy's, and only the Accomplice flips.
  - Both are placed before either arrives, and the Accomplice arrives first, so a face-down Decoy
    partner can take a rival Tripwire's hit meant for its Accomplice. When the Accomplice is first
    into Istanbul, both get the +3.
  - Hong Kong draws once per drop action, keyed on the Accomplice: an Accomplice taken out on
    arrival draws nothing, even if its partner landed.
  - A partner sent home comes back unflagged, under a new uid.
- **The Turncoat.** Ties go to the latest arrival, then the later seat in the owner's table order
  (as the Assassin's do). Nothing happens in Moscow. A Decoy that takes the hit turns face up first
  and is the one that swaps. The two cards trade places and owners, keeping their origin, turn and
  bonus. An agent turned before its own flip loses that flip: a turned agent firing for its new
  owner would be a windfall nobody could read.
- **The Courier.** Its move is an arrival: it goes through `arrive()`, like the Double Agent's, so
  Tripwires, Prague and Tokyo all apply, and the moved agent's bonus resets. Ties go to the latest
  arrival, then the lowest city index. It never moves an agent out of Moscow (into Moscow is
  allowed), never a face-down agent, and only with room.
- **The Blackmailer.** It fires only if nobody has escalated this round. Then it doubles the stake
  and records `called = { by, answers, free: true }`, with "on" for every active rival. No token is
  spent, nobody is asked, nobody can fold in answer, and it uses up the round's one escalation. It
  is an internal `freeEscalation(state, seat)`, not an option on `escalate`: `escalate` is a
  planning action (a token, an open `pending` call, answers to wait for) that the UI, the bot, the
  session's `act` and the sim all drive, while the Blackmailer fires inside the flip, where nobody
  can answer. An option would also have opened a path for a guest's `{ a: 'escalate', free: true }`
  through `table.act`. The two share `escalated` and the doubling, and nothing else.
- **The Wiretap.** It taps your mark (`markOf`) for the next turn. It shows the mark's *current*
  locked city: taking it back clears it until they lock in again, and a pass or a fold shows
  nothing. On the final turn there is no next turn, so it taps nothing.
- **The Interrogator.** Revealed agents keep `hidden`, so one that dropped face down still has no
  tricks, and a revealed Tripwire is disarmed. It works in Moscow: a reveal isn't a take-out or a
  move.

### The new cities (Phase 2b-ii)

The knobs are as first written (Rome's `factor` 2, Tokyo's `bonus` 3, Macau's `times` 1, Glienicke
Bridge's `turn` 3): on Mixed every city's winner takes the round 55–80% of the time (B28, B29). The
last column is B29.

| City | Rule | Brought by | Winner took the round (B29) |
|---|---|---|---|
| Reykjavik | Most agents holds it, not most power | Mr Heron | 64.5 ±2.0 |
| Casablanca | Drop here face up or face down: your choice | The Countess | 68.5 ±1.9 |
| Rome | Each side's strongest agent here counts double | The Countess | 67.2 ±2.0 |
| Tokyo | The last agents to arrive here get +3 | The Magpie | 66.7 ±1.9 |
| Zurich | A round tied on cities goes to whoever holds Zurich | Mr Heron | 70.9 ±1.9 |
| Macau | Win the round holding Macau to score the stake once more | The Magpie | 62.2 ±2.1 |
| Glienicke Bridge | After turn 3, each side's strongest agent here crosses over | Control | 63.0 ±2.1 |
| Prague | Each arrival turns every other face-down agent here face up | Control | 61.8 ±2.1 |
| Geneva | A tie here goes to whoever is behind in the match | Control | 65.3 ±2.0 |

The Classic 11 stay in band on Mixed (Havana 63.5 to Lisbon 75.0). The readings, also in each city's
note:

- **Reykjavik.** Most agents wins, face-down ones included. A tie on agents goes to the single
  higher total among those seats; a tie there leaves it to nobody.
- **Casablanca** offers both faces for every drop there, Sleepers and Tripwires too (the plan's
  `down` is true or false; an Accomplice's partner drops are paired the same way, and the partner
  itself is always face down). A face-down drop has no tricks, except a Tripwire's or a Decoy's; a Tripwire
  or a Decoy dropped face up has none, since both work only face down.
- **Rome.** Each side's single strongest agent counts twice. A player's known totals double only
  what that player can see.
- **Tokyo.** Of the agents still there, every one with the latest arrival turn gets +3: drops on the
  same turn all count (as Istanbul's "first" does), and so do a Courier and the agent it brings. Mr
  Heron's placed card (turn 0) never does. Decision 4 said "the latest turn with an arrival there";
  the ruling took "the latest turn among the agents still there", which is what the card says and
  needs no per-city record.
- **Zurich.** Among seats tied on cities, whoever holds Zurich takes the round, before the tie-break
  totals (`roundWinner`, there since 2b-i).
- **Macau.** If the round's winner holds Macau, they score `stake` (the stake before the final
  doubling) × `times` more, at the flip only: a fold scores nothing extra, and its result has no
  `macau` key. `result.macau` names the winner who scored it.
- **Glienicke Bridge.** At the end of turn 3, each active seat's strongest agent there crosses to
  the next active seat round the table; with two, they swap. Face-down agents count, and they cross
  face up (keeping `hidden`, their origin and their bonus). Ties go to the latest arrival, then the
  last in side order. Every crossing is worked out first, then made. A Bodyguard or a Decoy doesn't
  stop it.
- **Prague.** An arrival turns every *other* face-down agent there face up, after any Tripwire check
  (a Tripwire still springs first). Revealed cards keep `hidden`. A turn's drops reveal once, after
  every drop of the turn has arrived, so initiative can't let a seat's own drop disarm its Tripwire
  before a rival's arrival on the same turn: a lone newcomer keeps its face until the next arrival,
  and two arrivals on one turn reveal each other. An Accomplice and its partner count as two
  arrivals, so the partner turns face up. A Courier's or a Double Agent's move during the flips
  reveals on its own arrival.
- **Geneva.** A tie on the top total goes to the tied seat with the single lowest score; equal
  scores leave the city to nobody. A 0–0 tie holds nothing, as in every city (a city needs a total
  above 0).

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
  arrived in Phase 2b-ii). Then total power across the cities with
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

## The ladder and the story (Phase 2b-ii)

Rival *k* (0 = Agent Wren … 4 = Control) plays a roster of 12 drawn from Classic plus the packs of
rivals 1 to *k*, always with its own pack's two agents, the Heavy, and the card a placed twist
needs. Its city pool is Classic plus the same packs, and round 1 always deals one of its own cities
("featured"), so you meet what it brings (`ladderSetup` in `js/roster.js`). Every player meets the
same content at the same rung, and the simulator can play it.

| Rival | Samples | Brings: agents | Brings: cities | Twist, as announced (`TWISTS`) | A steady Heron wins: twist on / off (B31, B33) |
|---|---|---|---|---|---|
| Agent Wren | 6 | — | — | none: plays Classic | 70.2 / 70.2 |
| The Magpie | 12 | Courier, Blackmailer | Tokyo, Macau | "The Magpie carries a thirteenth agent: an extra Lookout." | 63.4 / 59.3 |
| Mr Heron | 24 | Bodyguard, Decoy | Reykjavik, Zurich | "Mr Heron starts every round with a Sleeper already in place, face down." | 43.3 / 48.2 |
| The Countess | 40 | Wiretap, Accomplice | Casablanca, Rome | "On the final turn the Countess hears which city you pick the moment you lock in." | 38.7 / 41.0 |
| Control | 80 | Interrogator, Turncoat | Prague, Glienicke Bridge, Geneva | "Each round, Control sees three cards in your hand." | 34.6 / 39.1 |

Heron (24 samples, no twist) stands in for a steady player; each rung is 5,000 rounds, about ±3 on
each rate.

- **The twists.** Each is announced on the rival's row, its dossier and a Twist chip at the table.
  `twistText` builds the sentences from `TWISTS` and the agents' names, so tuning changes the words.
  - *Extra* (`{ id: 'extra', kind: 'lookout' }`): a 13th agent in the rival's deck only (`deckList`
    adds it for the twist's seat). The text says "extra", not "second", because a Mixed draw may
    hold no other Lookout. It makes the Magpie a little *easier* (Heron +4.1 ±3.9 with it; a 13th,
    weak card may dilute her deck, untested). Her step still holds; if it should bite, the next
    notch is `magpie.kind` jammer.
  - *Placed* (`{ id: 'placed', kind: 'sleeper' }`): every round, before turn 1, Mr Heron's Sleeper
    is taken from his deck (or from his hand, which then takes the deck's top card) and put face
    down in one of the three cities at random, at turn 0, flagged `placed` for everyone (a pin on
    its chip). It doesn't arrive: no Istanbul bonus, no Tripwire, and Tokyo never counts it. A
    roster without the kind places nothing and draws nothing. It is the strongest twist (Heron −5.0
    ±4.4).
  - *Tap* (`{ id: 'tap', from: 6 }`): a built-in Wiretap on the Countess's mark from turn 6, the
    final turn, so she hears your city as you lock it in.
  - *Seen* (`{ id: 'seen', count: 3 }`): each round Control sees three cards of its mark's hand,
    drawn at random from cards it hasn't seen (fewer if the hand runs out), listed in
    `round.exposed` for the watcher and the card's owner (a "Seen" stamp). A seen card that goes
    home under a new uid is forgotten.
- **Tuning the ladder** (B31–B33). At each rung a steady player's win rate must fall by more than
  the two margins combined, with Control at 20% or more. Wren to the Magpie falls 6.9 (against 4.1),
  the Magpie to Heron 20.1 (4.2), Heron to the Countess 4.6 (4.3). Without twists the Countess and
  Control play alike (41.0 and 39.1), as in 2b-i's ladder (B24), so Control's twist has to make the
  whole step. Seeing one card it was *easier* than the Countess (40.7), two gave a 2.7-point step
  (36.0), and three a 4.1-point step against a 4.2 margin (34.6). Three was taken as the closest
  after the two retunes the plan allowed, a near miss by 0.1 flagged to the coordinator. Two is the
  fallback if three seen cards of a four-card opening hand is too strong to announce.
- **Dossiers** (`DOSSIERS` in `js/story.js`): two or three sentences each in a dry 1960s file voice,
  each hinting at its twist (the Magpie "always carries one agent more than the paperwork shows").
  Control's never says who Control is.
- **Remarks** (`REMARKS`): a few one-line remarks per rival (60 characters at most) for the start of
  a round, its own escalation and fold, and the rounds it wins and loses, such as "The Countess
  adjusts her pearls." and "A one-word cable from Control: LOUDER."
- **The epilogue** (`EPILOGUE`): after a ladder win over Control, five typed lines signed by C:
  Control was never a rival but C, your own chief, who signed every cable you read, and the winter
  was a test.

### The story: operations and cables

- **Operations.** Each round is an operation. `operation(matchId, roundNo)` seeds
  `createRng('op:<matchId>:<roundNo>')` and picks an adjective (48), a noun (48) and a package (27)
  from curated lists: nothing silly or violent, no agent, city, rival, seat or codename names, and
  never "film" (the Microfilm is its own mechanic). Reseeding per round repeats a package in about a
  third of five-round matches (a per-match shuffle indexed by round would fix it).
- **Cables from the match id** (Decision 5). `cable(view)` writes "OPERATION GILDED NOCTURNE.
  PACKAGE: A ROCKET FUEL FORMULA. SITES: HONG KONG, GLIENICKE BRIDGE, ROME. THE FILM TRAVELS VIA
  HONG KONG. — C" (the film sentence only when the round carries the film). Every view already
  carries the match id, which is random per match, so guests read the same cable, a resumed match
  reads the same names, the engine stores nothing new, and nothing derived from the deal seed
  reaches a guest.
- **Captions.** Buttons keep their plain labels (Escalate, Fold); the flashes carry the story under
  them: "Agent Wren goes loud: the stake doubles" ("You go loud…") and "Red aborts to save the
  network". The final dossier's round rows open with each round's operation name.
- **The title** reads "Winter, 1963. Run a network of agents against rival services: drop in secret,
  flip together, call the bluff." Help's Rules tab opens with the story.

### Unlocks, the network and free play

- **Your network** is Classic plus the packs of the rivals you've beaten on the ladder
  (`network(meta.beaten)`). The title shows the real counts, "Network: 12 of 20 agents · 11 of 20
  cities" at first. A ladder win adds the rival to `meta.beaten` (in ladder order), and when the
  network grows a 6-second toast names the recruits: "Recruited: Courier and Blackmailer. Tokyo and
  Macau join your network."
- **The rivals screen** ("Rival services") has a Ladder / Free play switch. Each open ladder row
  carries the rival's twist on a red stamp and, once you have met or beaten the rival, its pack as
  mini silhouettes with names; before that, "Brings two new agents and two new cities." Wren's row
  reads "Plays Classic: the original 12 agents and 11 cities." Once Control is beaten, "Read the
  epilogue" plays the epilogue again.
- **Free play** (Decision 3) opens once your network has grown past Classic, that is, once you've
  beaten the Magpie (until then the switch says "Free play opens once you beat The Magpie."). It
  plays Wren or any rival you've beaten on a Mixed roster from your network, with no twist ("Mixed:
  your network · no twist"), and its wins unlock nothing. The saved match carries `free`, so
  Continue reads "Continue free play against The Magpie".
- **Online and pass and play aren't gated by unlocks.** The host's lobby has a Roster switch,
  Classic (the default) or Mixed (all 20 agents and cities); it re-deals the untouched table
  (`table.restart(setup)`) and goes away when a guest joins. Pass and play opens a sheet with
  Classic ("Best for a first match.") and "Mixed: all 20 agents and cities". Meeting an agent online
  doesn't unlock it for solo play; only beating rivals does.
- **First meetings** (`meta.met`, `meet()` in `js/meta.js`). Classic counts as met (Decision 7), so
  the intros are only for the 8 new agents and 9 new cities, plus each rival's dossier (all five
  rivals, Wren included). A rival is met at its dossier (on the ladder only), agents just before the
  roster card, and cities as the round card shows them. With cards skipped nothing is met, so a
  skipped intro stays new for next time.
- **Help** follows the roster. During a match the Agents tab lists "Tonight's roster", then "In your
  network", then "Not yet recruited" (dark silhouettes, "Beat {rival} to recruit."), every recruited
  agent with its note; off the table, "Your network" and "Not yet recruited". The Cities tab splits
  the same way over tonight's city pool. The Rules tab says the roster is shared, and the Keys tab
  gains V and U.

## Card counting (Phase 2b-ii)

Counting lives in the UI (Decision 9): `js/counting.js` is pure and reads views, and the table
remembers what it saw for the round only, since decks are reshuffled every round. The engine keeps
no new history.

- **Sightings** (`sightings(view)`): every card whose kind the view shows (the board, `gone`, turned
  assets in your hand, and this turn's drop and reveal events), by origin and kind. A rival's
  face-down card never counts, since its kind is masked.
- **Per round, by origin and kind.** The table keeps, for each viewer, the most cards of each origin
  and kind that any one view has shown at once, so a card sent home under a new uid and dropped
  again counts once (the Magpie's two Lookouts). Mr Heron's placed card counts as seen under the
  twist's kind, since the twist announces it. Sightings are kept per viewer, so in pass and play one
  seat's face-down cards never count for the other. The count is cautious: if a Lookout is shown,
  goes home, and the other Lookout is shown while the first is out of view, it still counts one.
- **The unseen strip** (spec 2.7): `unseen(deckList(view, seat), seen)` lists the rival's agents not
  yet seen this round. An "Unseen k ▾" paper tab sits on the rival's side of the scorebar (with a U
  key hint on desktop); U or the tab opens a paper sheet that hangs from the scorebar over the top
  of the board, so the layout never moves. It lists the unseen agents as mini chips under "Not seen
  this round · Hand h · Deck d". It is a planning tool: it opens only while planning, closes for the
  reveal and the result, takes U and Escape before a reveal's keys, opens over the escalation
  prompt's veil (so it can be read for the decision), and closes on an outside tap (which still does
  what it does) or a drag.

## Ways to play

- **Computer:** a ladder of five rival services (Monte Carlo bots with personalities, packs and
  twists), and free play against the rivals you've beaten.
- **Online:** host opens a room, shares a link or QR code; the host's browser runs the rules
  (`shared/net.js` over Trystero). Invite-only, codenames from a list, no chat. Every match
  carries an id, so Rematch brings both players back to a fresh table and the matches-played
  count takes each match once, however often a player reloads. Leaving says goodbye: the
  other side sees "Agent X left the table". The host picks the roster in the lobby (Classic by
  default). Online stays two seats until Phase 3.
- **Pass and play:** one device; a sheet picks Classic or Mixed, and a cover screen hides each
  player's choice (a wiretapped mark plays before its wiretapper).
- Online and pass and play have the roster card, the cable, New stamps and the unseen strip, but no
  twist chip or remarks.

## Controls

Tap or click a card, then a city, or drag a card onto a city (a drag only chooses; Lock in
still commits). Lock in. Keys: 1–7 pick a card, A S D pick a city, Enter locks in, Esc or
Backspace takes it back, E escalates (Escalate shows the tokens left, and with none it is
disabled and E does nothing), F folds, M mutes all sound (the music button turns off just the
music), ? opens help.

After you pick an Accomplice and a city, tap a card (or press its number) to drop it as the partner,
or press Drop alone. In Casablanca, V (or the face slip) turns the drop face up or face down. U
opens and closes the unseen strip. In solo play the rival's Twist chip puts its twist in the ticker.

During a reveal, Space (or a tap) speeds it up to 3×, and Space again skips it; the first
400 ms ignore taps and keys, so a double-click on Lock in doesn't skip the flip. At a round's
result, B (or "See the board") slides the result down to a strip so the board shows behind
it, and B again brings it back. Enter skips a fold's flash like any card, but while the
folder's agents pull out (the exfiltration), Enter and B wait for the result.

**Help** is a paper sheet with four tabs: Rules, Agents, Cities and Keys (Keys is hidden on
touch screens). ← → switch tabs. The sheet keeps one height, so the tabs don't jump; only its
body scrolls, and its cut corners are sized in px so they never clip the text.

## The round on screen

- **The match intro** (Phase 2b-ii). Once per match id, and only before your turn-1 drop (a reload
  after it goes straight to the round card), one card at a time, each skippable, with the rival
  waiting behind them:
  - **The dossier card**, the first time you meet a rival on the ladder (not in free play): a manila
    folder over bars in the rival's colour, "File 2 of 5", a red DOSSIER rubber stamp that lands at
    0.56 s on the slam, the rival's jittered name and dossier, the red Twist stamp with its twist,
    and "Brings to the table" with its pack in ink silhouettes (Wren's: "Plays Classic: the original
    12 agents and 11 cities."). 9 s.
  - **The roster card**, for any roster that isn't the Classic 12 (the ladder past Wren, free play,
    online or pass and play Mixed): "Tonight's roster", "Every deck at the table holds these 12
    agents." on an ink slip (plus "The Magpie carries one more: an extra Lookout." with her twist),
    and 12 mini paper cards dealt in one after another. Agents new to you wear a red New stamp and
    band and get a slip under the deal with their art, power, text and note. 6 s, or 9 s with new
    agents.
- **The round title card.** Every round opens on a card: "ROUND N" over mustard bars with a thin red
  and a thin teal one, then C's cable typed onto telegram tape above the slate (Courier Prime, each
  line a pasted paper strip, 9 ms a key from 0.35 s, over a soft teleprinter clatter; still under
  reduced motion), and three paper slips (skyline, city name, its rule) sliding in from alternate
  sides. A city met for the first time wears a red New stamp, with its note on a row under the rule.
  The card stays 2.5 s, plus 2 s for each new city with a note (`ROUND_CARD_MS`, `NEW_CITY_MS`).
  Enter, Space or Esc skips it, or a tap after its first 400 ms. The computer rival waits for it.
  Reading cards that outgrow a short screen scroll (Control's round 1 with three new cities fits a
  390×844 phone).
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
  with five holes round the hub) and "Film" in its top-left corner: mustard on the ink plate, paper
  at night. On the round's title card the film city's slip has a "Carries the film" tab and the
  cable says "THE FILM TRAVELS VIA VIENNA."; after a dead heat an ink slip under the slate says "3
  points rolled over into this round's pot." The escalation prompt and the fold sheet count the pot
  and say what the answer means for the film.
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

**The new content on the table** (Phase 2b-ii):

- **The partner prompt.** After an Accomplice and a city: "Pick a partner to drop face down with
  your Accomplice, or drop it alone." The other cards become candidates (a colour pulse), a "Drop
  alone" slip toggles, and Lock in waits for a choice. The chosen card is hatched with a "Partner"
  stamp, and the ghost in the city shows both chips. Dragging an Accomplice onto a city leads to the
  same prompt.
- **Casablanca's face.** One slip shows both faces with the chosen one inked (face down is hatched);
  V or a tap flips it, and it starts on the agent's own face. Ghosts land face down wherever the
  drop will (Vienna, a Sleeper, Tripwire or Decoy, or the choice).
- **Badges.** Partner chips carry linked rings and placed chips a pin, on their backs too, since
  both facts are public. Rome turns down a mustard "×2" corner on each side's strongest agent the
  viewer knows. Reykjavik's totals show the head count beside a small cut-out figure. Inspecting a
  face-down card says what it can be ("Mr Heron placed this Sleeper before the round began.", a
  partner, "could be anything" in Vienna or Casablanca).
- **Taps.** The wiretapper sees a "Tapped" slip (headphones, in the mark's colour) on the plate of
  the city its mark locked, and a note ("Your tap on X is live.", then "Your tap: X picked
  Lisbon."). The mark reads "{name} is listening: they'll hear which city you pick." while choosing,
  and "Locked in. {name} has heard your city, and is choosing…" after.
- **Seen.** Each card Control has seen wears a "Seen" stamp in the rival's colour.
- **The tricks** play on the reveal's clock, each with its own sound of about 0.3 s: the
  Interrogator stays lit while the cards it reveals flip; the Turncoat's two chips trade places and
  colours; the Courier's agent glides in; "{name}'s Blackmailer: the stake doubles to N." flashes the stake
  slip; the Wiretap says who is tapped next turn; a Decoy flips, says "A Decoy takes the hit for
  {Kind}." and goes; the bridge's crossers leave and land face up in the next seat's row; Prague's
  reveals take one line a batch. Under reduced motion nothing glides.
- **Result lines.** "+S Macau: {name} won the round holding it"; "Tied on cities: Zurich decides,
  and {name} holds it."; "Geneva: tied at N, so it goes to {name}, behind in the match."; Reykjavik
  counts agents in words ("one agent to three", "two agents each, 5 to 3").
- **Long rules** (the Wiretap's, the Decoy's) set smaller, so every card's text fits.
- **The tools row.** Under the rival's name and score sit, in solo play, a red stamped Twist chip
  (tapping it puts the twist in the ticker) and, everywhere, the Unseen tab (Card counting). It
  makes the scorebar about 24px taller; the phone still fits the scorebar, the cities, the hand and
  Lock in.
- **Remarks.** In solo play the rival speaks in the ticker: after about half the round cards (never
  when a teaching hint is due), after its own escalation, and once a round as the result comes up
  (its fold, its win or its loss; nothing on a dead heat), never during a reveal. The result panel
  covers the ticker, so it repeats the remark in italics in the rival's colour.
- **The epilogue card.** After a ladder win over Control, Final report plays it before the dossier:
  an oxblood-barred telegram form ("Cable", "Most secret" in red) with the lines typed at 38 ms a
  key, 450 ms between lines, over a teleprinter clatter, signed "— C" in red League Gothic. 12 s,
  skippable.
- **The thumbnail** is the Countess's own ladder table: your Courier, an Accomplice each in Rome
  with its ×2 corners, her Blackmailer and Mole, the Twist chip and "Unseen 9" on her side, and "The
  Countess adjusts her pearls." in the ticker.

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

**The new art** (Phase 2b-ii) is cut in the same hand: flat polygons, seeded jitter, holes cut as
reversed subpaths, one small accent. Agents: a crouched Wiretap with a coiled line and an alligator
clip, an Interrogator behind an angle-poise lamp facing an empty chair, a bare-headed Bodyguard with
an earpiece and a raised palm, two Accomplice fedoras in profile, a Turncoat whose coat swings out
in the accent colour, a striding Courier with a briefcase on a chain, a gloved Blackmailer holding
up a photograph, and a Decoy's coat and hat on a tripod. Cities: Hallgrimskirkja, the Hassan II
minaret over a medina, the Colosseum and St Peter's, Tokyo Tower and a pagoda, the Grossmünster
under the Alps, St Paul's in Macau with the Guia lighthouse, the bridge's steel truss with a barrier
boom, the Old Town Bridge Tower and the castle, and Geneva's Jet d'Eau. Each city has one landmark
above the 60% line. The dossier card's folder is manila (`--manila`, shared with the final dossier's
folder).

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
  jackpot chord (Monaco), a pipa line (Hong Kong), open fifths and ice pings (Helsinki), a brass
  march (Moscow), a barcarolle (Venice), a double-harmonic descent (Tangier); and since Phase 2b-ii
  a hymn in open fifths over a drone (Reykjavik), a maqam run on an oud-like guitar (Casablanca), a
  tarantella in mandolin tremolo (Rome), a koto line in the in scale (Tokyo), an alphorn call with a
  yodel leap and a cowbell (Zurich), a Portuguese turn with a pentatonic answer and a gong (Macau),
  a lone bugle over a muffled snare (Glienicke Bridge), a harpsichord turn (Prague) and a music-box
  chime (Geneva). The rival's version plays an octave down on a plain triangle.
- **Elsewhere:** a title theme (the hook with the full band, 120 bpm, opening on the spy
  chord), a lounge bossa nova for the online lobby (132 bpm, down the circle of fifths), and
  victory and defeat cues. Flourishes and cues count as effects, so they play with music off.
- **Effects:** card slides (noise sweeps), flips (click + thud), takedowns (snap), escalate
  (brass stab + heartbeat), a strip of film (a projector clatter: four bandpass ticks and a soft
  blip), the full reel (the slam). The new tricks (Phase 2b-ii), each about 0.3 s and at the old
  tricks' levels: the Wiretap's click and mains hum, the Interrogator's switch and bulb ping, the
  Turncoat's swelling reversed sweep, the Courier's three muffled steps, the Blackmailer's shutter,
  the Decoy's hollow thud. A soft teleprinter clatter runs under the cable and the epilogue, and the
  dossier's stamp lands on the slam.

## The memorable moment

**The final drop.** Turn six falls dark: the "Final drop" card slams in, the table goes to ink
and spotlights, the ×2 stamp lands on the stake, and the band drops out to a heartbeat. Both
lock in, the music cuts to silence, the cards slam down on the spy chord, every face-down card
turns over, then the cities resolve one at a time under their spotlights: totals tick up, the
winner's colour sweeps across the city in Saul Bass bars, the cone takes the winner's colour,
the city plays its flourish, and the stake (doubled, plus any pot) slides to the winner's
score. If the loser held the film city, a strip of film then flies from its canister into
their reel.

## Seats and the engine (Phases 2a to 2b-ii: the engine plays 2–4)

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
- **The new rules at N seats** (Phase 2b-ii; Phase 3 puts them on screen). A Wiretap and the
  Countess's tap hear the tapper's *mark*: `round.taps` lists `{ by, on }` for everyone, and
  `round.tapped` gives the tapper its mark's locked city. Control's twist sees its mark's hand
  (`round.exposed`, shown to the watcher and to the card's current owner). Glienicke Bridge passes
  each active seat's strongest agent to the next active seat (0→1, 1→2, 2→0 at three). "Rival
  agents" for the Bodyguard, the Decoy, the Turncoat and the Interrogator means every other seat's.
  The bot and the sim resolve a chain of taps (A taps B, B taps C) in waves; a three-way tap cycle
  waits the full tap wait at every seat (Phase 3).
- **No card changes owner while face down** (Decision 11), so nothing on the board is re-keyed: the
  Turncoat swaps with a face-up rival (a Decoy it hits turns over first), Glienicke's crossers cross
  face up, and Havana already turns its defectors over. The cross-view property test checks that
  every face-down rival card's uid starts with its owner's letter, in Mixed random play at 2–4
  seats; if a later rule moves a face-down card between owners, it fails, and that move must re-key.
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
  from the state's RNG (`mintUid`), and a card going back to a hand is re-keyed under a fresh one
  (`returnToHand`, the only way back to a hand; Phase 2b-ii's paths use it, and it also clears
  `partner`, `placed` and any seen entry for the old uid). A secret card shows its owner as its
  `origin`. Why: a Getaway used to send a card home under its old uid, so a rival who had seen it face up knew it when it came back face down; and
  re-issuing alone wasn't enough, because the uids were `a0.0`–`a0.11` in deck order, so a
  re-issued `a0.12` would have said "this is the card the Getaway sent home". A fresh uid looks
  like every other uid a rival has never seen.
- **Versions.** The saved state is `v: 2` and the network `PROTOCOL` is 3 (Phase 2b-ii; Phase 3
  takes 4): a 2b-i guest would crash on agents it doesn't know, so it gets the "different version"
  message, as a v1 peer does. Phase 2b-ii added `roster`, `cityPool` and `twist` to the state,
  `taps` and `exposed` to the round, and `partner` and `placed` to cards without bumping `v`
  (Decision 6): `E.upgradeState(state)` fills every missing field with its Classic default, in
  place, and `restoreTable` calls it, so a match a 2b-i build saved mid-round resumes, finishes and
  rematches as Classic with no toast (the smoke resumes `test/golden/v2-table.json`). A bump would
  have turned every 2b-i save away and changed every golden digest for no rules change. `canRestore`
  also requires `round` to be an object and `reel` a number, so a v2 save `upgradeState` couldn't
  complete is refused. A match saved before the stakes is dropped with one toast and no Continue.
- **Tables carry a setup** (Phase 2b-ii). `createTable({ …, setup = CLASSIC_SETUP, twistSeat = 1 })`
  deals every match of the table, rematches included, from `table.setup` through `matchOptions` (a
  Mixed roster is drawn from `createRng('<seed>:setup')`, so a Classic table's deals are unchanged),
  and the table saves its setup (a missing or malformed one restores as Classic).
  `table.restart(setup)` re-deals an untouched table for the lobby's roster switch; call it from the
  lobby only. The `lock` action passes `{ uid, city }` plus a string `partner` and a boolean `down`,
  and nothing else, to the engine. Real tables seed from crypto (`randomSeed()`, 16 hex characters)
  instead of `Date.now()`; that stops the cheap guess, but the deal RNG still has 32 bits of state,
  which Phase 3 must widen for online play.
- **Two-player play is guarded by golden replays.** `test/golden/two-player.json` holds
  per-round digests of 24 seeded two-player bot matches (the state, each call's return and the
  views for seats 0, 1 and −1 after every call), and `test/golden/sim-2p.json` a short
  simulator run's summary; `test/golden.test.mjs` replays both. Through Phase 2a they were
  compared call by call with a frozen copy of the Phase 1 engine; Phase 2b-i's tokens changed
  two-player rules, so that copy was retired and both fixtures were re-recorded on the
  finished 2b-i engine (`tools/golden.mjs --record --force`). They are the reference for Classic
  two-player play, and Phase 2b-ii kept them. `test/golden/v1-table.json` is a table saved by the
  Phase 1 build, kept to test that an old save is dropped, and `test/golden/v2-table.json` one saved
  by the 2b-i build, kept to test that it resumes.
- **Classic is frozen** (Phase 2b-ii, Decision 10). A frozen copy of the 2b-i engine, bot and data
  sits in `test/golden/v2/`, and `test/golden.test.mjs` replays seeded Classic two-player bot
  matches on it and on the live modules side by side, comparing the state, each call's return and
  the views for seats 0, 1 and −1 after every call, as JSON, through `project()` in
  `test/golden/drive.mjs`. That drops every key this phase added (`NEW_KEYS`: roster, cityPool,
  twist, taps, tapped, exposed, macau, partner, partnerOf, placed, down, free), so the phase could
  add state without losing the reference. A new key only ever goes at the end of an object or
  appears only when set, and each one joined `NEW_KEYS` in the commit that added it.
  `node games/dead-drop/tools/golden.mjs --check --matches 400` runs the long version
  ("identical: 400 matches, 45113 steps" after every engine and bot task). The sim fixture's check
  compares every Classic agent and city exactly and requires the new ones to have played 0. Classic
  is byte-identical to 2b-i.
- **The UI:** mechanics that go over seats use lists (`allSeats`, `rivals`); two-player copy
  and layout go through `foe()` in `js/main.js` (and `rivalsOf(...)[0]` with a note in
  `js/board.js`), so Phase 3 can find every two-player assumption by searching for them.

## The bot and the new content (Phase 2b-ii)

- **What a face-down card can be** (`couldBe(cv, cityId, view)` in `js/bot.js`): a placed card can
  only be the twist's kind; one in Vienna or Casablanca, or a partner, can be anything; any other
  can only be a natural face-down agent (Sleeper, Tripwire, Decoy). `determinize` builds each seat's
  pool from `deckList` (the roster, plus an extra twist's card), fills the most constrained
  face-down cards first (placed, then natural, then anything), and puts the cards it has seen
  (`round.exposed`) in their owner's hand under their real uids before inventing the rest.
- **Taps.** `constraints(view)` turns the bot's `tapped` entries into `{ seat: city }`, and every
  playout's first drop for a tapped mark goes to the city it locked (`quickDrop`'s `only`), in
  `think` and in the stake calls' `estimateLocked`. A live bot with a tap on its mark waits for it
  to lock (`attachBot`'s `tapWait`, `TAP_WAIT_MS` 6 s), unless the mark is tapping it back, the turn
  moves on, or it owes an answer to a call: an open call has to be answered anyway, so it ends the
  wait. The sim plays the same order: seats waiting on an unlocked mark think after it locks.
- **Candidates** (`candidates(view)`). The legal list keeps one partner drop per Accomplice, city
  and face (the strongest partner), and Casablanca's face-down drops only for natural face-down
  agents or base power 3 or more. When any partner or face-down candidate remains, `think` gives
  each candidate `min(samples, max(6, round(samples × plain / candidates)))` playouts; `rescore`,
  whose value sets stake calls, keeps the full samples. `think`'s drop keeps the top candidate's
  `partner` and `down`.
- **Think time** (`tools/think-time.mjs --roster classic|mixed`, 30 positions at two seats, ms on
  Rich's Mac):

  | Roster | Rival (samples) | Mean | p95 | 2b-i mean (B23) |
  |---|---|---|---|---|
  | Mixed | Heron (24) | 13.24 | 25.69 | |
  | Mixed | Control (80) | 36.92 | 61.98 | |
  | Classic | Heron (24) | 9.62 | 14.72 | 9.87 |
  | Classic | Control (80) | 29.76 | 48.66 | 30.79 |

  Mixed runs about 1.25× Classic at p95 (Heron 1.26× warm, Control 1.27×, against a 1.25× bar; the
  first rival a run times is cold, Heron 1.75×), accepted as noise after both trims above. Mixed
  positions hold barely more candidates (11.6 against 11.0), but each playout costs about 25% more:
  more flips, longer legal lists, Rome, Tokyo, the bridge. Classic means stayed within 2b-i's. Phase
  3's samples cap by seat count must allow for Mixed ≈ 1.25×.
- **The Classic-parity gate** in `determinize` (temporary). Since 2b-i, a seat's own card in a
  rival's hand (after Havana or Glienicke Bridge and a Getaway) was never placed in its playouts.
  Phase 2b-ii fills it for every roster and pool except exact Classic (roster `DECK`, pool
  `CLASSIC_CITIES`, no twist), where the gap stays so the frozen 2b-i comparison holds (12 of the
  400 golden matches would diverge). The gate is commented "2b-i parity; remove when the goldens are
  re-recorded" (Phase 3). At three or more seats, a rival's card held by another rival isn't placed
  either.

## Simulation

`tools/sim.mjs` plays bot-vs-bot matches on worker threads and prints every rate with its 95%
margin. `tools/SIMLOG.md` records each run (question, exact command, numbers, decision),
starting from the Phase 1 baseline, Heron against Heron for 20,000 rounds
(`tools/baselines/phase1-heron.json`). Since Phase 2b-i the two-player reference for Classic is the
stakes' final check, B23 (`tools/baselines/phase2b1-final.json`); for Mixed rosters it is B29
(`tools/baselines/phase2b2-final.json`). Measure every rule change against the one it touches:

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
restore a clear step there. With each rival's own setup and twist, every step but that one now
clears its margin, and that one misses by 0.1 (B31–B33, The ladder and the story).

**Rosters and the ladder** (Phase 2b-ii, `SIM_VERSION` 4):

- `--roster classic|mixed`: Mixed draws a roster of 12 from all 20 agents for each match and deals
  all 20 cities.
- `--with ID` (repeatable) forces an agent into every Mixed roster.
- `--setup RIVAL` plays that rival's ladder setup: its pool, its pack's agents always in, its cities
  featured in round 1 and its twist on bot B's seat. `--twist off` plays it without the twist but
  keeps the twist's forced card in the roster, so `--variant notwist:twist=off` is a paired
  comparison.
- `--set control.count=2`: a twisted rival's id edits its twist.
- `--probe agents|cities` covers what the base can deal, forcing each probed agent into Mixed
  rosters. Reports add an "in roster" column when rosters vary and leave out agents and cities never
  dealt.

```
nice -n 19 node games/dead-drop/tools/sim.mjs --run NAME --a heron --b countess --setup countess --rounds 5000 --variant notwist:twist=off --workers 4
```

New content was tuned the cheap way (spec 2.8): screen everything in one 20,000-round Mixed run at 8
samples (B28: no agent or city outside its band, so nothing to probe), then confirm once with 20,000
rounds at the bots' own samples (B29: agents 45.9–51.8, cities 61.8–75.0, seat 0 49.8% ±1.6). Every
agent's number and 19 of 20 cities' carried over from 8 samples; Reykjavik moved by more than the
margins (68.0 to 64.5). The ladder runs (B31–B33) are 5,000 rounds a rung; Control's 80 samples run
at about 13 rounds/s on 4 workers.

Playouts score rounds, not points, so content that pays in stakes can read average in win rates
while it moves points. `tools/points-by-roster.mjs --from FILE [--rounds N]` replays a saved run
match by match and reports points per round with and without each agent in the roster or each city
dealt, each one's share of the rounds and of the points, and rounds per match by roster (B30; the
definitions are in its header). What it showed, on 2b-i's stake knobs: **Mixed stakes run hot.**
46.5% of Mixed rounds are won at stake 2 or more (2b-i's bar is 40) and 23.7% of answers are folds
(bar: 25 or more), because the Blackmailer doubles the stake without a token and without a fold in
answer; matches holding one run 4.65 rounds (5.68 without). Its player takes 46.6% of the rounds and
48.1% of the points, so it speeds matches rather than favouring its owner. Macau's holder takes
61.8% of the rounds but 73.1% of the points: the bots score it like any other city. Phase 3 retunes
the stakes; the lever is the Blackmailer's rule (a token, or folds allowed), not its power.

`tools/golden.mjs --check [--matches 400]` replays Classic against the frozen 2b-i modules in
`test/golden/v2/`. `tools/art-sheet.mjs [--shot]` writes `.tmp/dead-drop-art.html` (and, with
`--shot`, screenshots it): all 20 agents and 20 cities at every size, by day and by night.

`tools/think-time.mjs [--rivals heron,control] [--seats 2,3,4] [--positions 30] [--json]`
times a bot's move per seat count (`--roster classic|mixed` times Mixed positions too: The bot and
the new content). Thinking grows about 2.2× per added seat: Control at 3–4
seats is too slow for a phone (p95 106 and 205 ms on Rich's Mac, which is 3–5× faster than a
phone), so Phase 3 must cap samples by seat count.
