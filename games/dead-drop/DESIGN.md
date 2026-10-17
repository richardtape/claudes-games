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
- Flip order: the player with **initiative** (alternates every turn, shown on screen) resolves
  their flip trick first.
- Face-down agents have no tricks (except Tripwire) and can't be targeted. Their power still
  counts, hidden from the rival until the round ends.
- A city is won by the higher total (you need at least one agent there). Win more cities to
  win the round; if tied, the higher total power across all cities; else a draw.
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

## Ways to play

- **Computer:** a ladder of five rivals (Monte Carlo bots with personalities).
- **Online:** host opens a room, shares a link or QR code; the host's browser runs the rules
  (`shared/net.js` over Trystero). Invite-only, codenames from a list, no chat.
- **Pass and play:** one device; a cover screen hides each player's choice.

## Controls

Tap or click a card, then a city (or drag it). Lock in. Keys: 1–5 pick a card, A S D pick a
city, Enter locks in, Backspace takes it back, E escalates, F folds, M mutes.

## Look

The opening titles of a 1960s spy film: flat cut-paper shapes, hand-cut type (League Gothic,
each letter jittered), dossier typewriter text (Courier Prime). A mustard table; cities are
black cut-paper panels with skyline silhouettes; you are signal red, the rival is petrol teal;
cards are paper with a black silhouette. Colour carries ownership.

## Sound

Synthesised surf-spy bass loop (muteable), card slides (noise sweeps), flips (click + thud),
takedowns (snap), escalate (brass stab + heartbeat), city won (twangy arpeggio).

## The memorable moment

**The final flip.** Turn six locks, both cards slam down, every face-down card turns over, then
the cities resolve one at a time: totals tick up, the winner's colour sweeps across the city
in Saul Bass bars, and the stake (doubled) slides to the winner's score.
