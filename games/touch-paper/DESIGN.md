# Touch Paper

## The hook
A patience game for Bonfire Night. Cards laid out on the patio; one card burns on the fuse.
Tap any uncovered card one rank above or below it (Kings and Aces join) and it loads into
the rack as a shell. Keep chaining up and down to load a long volley, then strike the next
card from the box: the volley goes up over the garden, shell by shell, each bursting in its
suit's colour and scoring one more than the last. The shape of the chain decides which named
shells bloom: three hearts in a row is a Peony, four falling is a Willow, all four colours
is a Crossette. Long volleys of beautiful shells are the whole game.

## Loops
- **Moment:** one tap, a card flies to the rack with a rising note. Strike the box and the
  volley launches.
- **Run (a display, about 10 minutes):** five acts from 7 pm to 9 pm, each a new layout
  (The Bonfire, Twin Rockets, The Catherine Wheel, The Fence, Grand Finale). The crowd wants a
  running total by the end of each act (cumulative "oohs"). Miss it and they drift home.
  From the second act each act has announced conditions (wind, drizzle...). Between acts the
  Shed: pick one of three chemistry cards (colour salts, moulds, sparklers, slow match...).
  Clearing an act's layout fires the Finale: every card left in the box goes up as a rocket.
- **Return:** the Pattern Book (12 named shells to discover), tonight's display (a daily seed,
  the same for everyone), best display on the shelf, and the programme poster at the end:
  the night sky with every shell you fired.

## Rules
- 52 cards, four-colour suits: hearts red (strontium), diamonds gold (sodium), clubs green
  (barium), spades blue (copper).
- The layout is dealt face down; uncovered cards turn face up. The rest go in the box; one is
  struck to start the fuse.
- Play an uncovered card one rank above or below the fuse (K-A wraps). It joins the volley
  and becomes the fuse.
- The top three cards of the box lie face up as your hand. Tap one that follows the fuse to
  add it to the volley (it costs you that strike later); tap one that doesn't to strike it:
  the volley fires and that card becomes the fuse.
- The rack holds ten shells. A full rack fires at once and the chain carries on.
- Every act opens on a fuse that some open card follows.
- The act ends when the layout is cleared (Finale: rocket n of the cards left in the box
  scores 10 × n) or the box is empty and nothing plays.
- Volley score = base × lift. Base: shell n of the volley scores n (1 + 2 + 3 ...). Lift
  starts at 1; each named shell in the volley adds its bonus.
- Named shells (families: only the highest of a family counts):
  - Colour: Peony (3 of one colour, +1), Chrysanthemum (5, +2)
  - Rising: Palm (4 rising in a row, +1), Tourbillion (6 rising, +2)
  - Falling: Willow (4 falling in a row, +1), Waterfall (6 falling, +2)
  - Length: Comet (6 shells, +1), Kamuro (a full rack of 10, +3)
  - Crossette (all four colours, +1), Ring (5+ shells ending on the starting rank, +2),
    Strobe (zigzag of four: up, down, up, +1), Brocade (turns the King-Ace corner, +1)

## Controls
Tap or click a glowing card to play it. Tap a hand card to add it or light it. On desktop
number keys 1-9 play glowing cards left to right, Z X C the hand, S the slow match. Click the
sky or press Enter to hurry a display along (play never waits for the show).

## Look
A back garden on Bonfire Night: blue-black sky hazed with smoke, rooftops and a fence in
silhouette, the bonfire glowing orange at the side and lighting the wet York-stone patio
where the cards lie. Cards are bright card stock with a four-colour deck; the backs are a
two-colour print of a fictional 1960s firework maker (sodium yellow and vermilion, a rocket
starburst, "light the blue touch paper and retire"). Every burst throws its colour across
the garden. Type: Shrikhand for the display names (like hand-lettered firework box names),
Bricolage Grotesque for ranks, numbers and text.

## Sound
All synthesized: a card tick with a rising pentatonic note per shell loaded; a match strike
and fizz when you light; whoosh-and-whistle launches; bursts with a low thump, a crack and a
scatter of crackle; named shells add a glockenspiel figure. A soft bonfire crackle bed.

## The memorable moment
The volley going up: shells launch one after another, faster and higher, each burst +1 more
than the last with its pitch climbing; then the named shells bloom big with their names
lettered across the sky in Shrikhand, the whole garden lit in their colour, and the total
stamps into the crowd's gauge. A long volley should feel like the end of a real display.

## Tuning notes
- `tools/sim.mjs` plays whole shows with the bot (`--free` ignores targets; `--targets`,
  `--finale`, `--window`, `--handplay`, `--handcost` try variants). `tools/layouts.mjs` probes a
  layout's clear rate on its own (`--try file.json` for candidates).
- Plain TriPeaks rules (±1, strike from a blind box) gave random play 59 points against 69 for
  the best bot: only 22% of moves had a choice. Three face-up box cards to strike from took that
  to 62 against 105, and clears from 25% to 58%.
- Even then half the volleys were a single shell and named shells almost never bloomed. Letting
  hand cards join the volley (at the cost of a strike) lifted the mean volley to 3.2 and made a
  named shell bloom in roughly every third volley. Same-rank pairs were tried and dropped
  (92% clears).
- Uncapped volleys made a 19-shell volley worth 2,000 and acts swing tenfold; the ten-tube rack
  caps a volley near 500 and turns a full rack into a moment of its own.
- Layout clear rates for a good bot (skill 0.8): Bonfire 74%, Fence 53%, Twin Rockets 45%,
  Catherine Wheel 45%, Grand Finale 27%. Depth (lines) matters most.
- Targets (cumulative) 150 / 800 / 1,500 / 2,350 / 3,500: bots win 21% (skill 0.3), 53% (0.6)
  and 56% (0.9); the first act passes 88-94%.

## Ideas for later
- "The one that got away": after an act, the longest volley the layout allowed at some point.
- An encore after 9 pm for endless high scores.
- Hand-drawn crowd silhouettes along the fence that cheer on big volleys.
