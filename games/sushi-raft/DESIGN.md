# Sushi Raft

## The hook
Two sea otters, Pebble and Kelp, run a tiny sushi bar on a harbour pier. Plates go out on little
bamboo rafts that drift round a canal past a row of hungry harbour folk: a seal, a penguin, a crab
who claps, a pufferfish who puffs up as it loses patience. Each player has one otter on their own
phone. You tap stations and your otter scampers off to do them, so it's Diner Dash with two cooks
and a lot of "can you pass me the salmon?". Five evenings make a week, and rent is due every night.

## The three loops
- **The moment (seconds):** tap a station and your otter runs to it. The board slices, the rice is
  patted onto the plate, the plate is launched with a bell and a splash, and a customer reaches
  out and grabs it with a nom.
- **The run (a week, ~15 minutes):** five evenings of about two and a half minutes each, with
  rising rent. The morning market sits between evenings. One purse pays for new dishes (dearer
  plates, but more steps) and for kitchen upgrades, and the rest is kept back for rent.
  Tomorrow's twist is announced at the market so you can plan for it. Friday is the Lantern
  Festival: a crowd, and the walrus who orders a platter.
- **The return:** the Regulars book. Each species has a favourite dish, and serving it earns a
  heart; five hearts befriend them, and that persists between weeks. There's also the best
  week's takings on the shelf, a daily "Today's tide" week (the same customers and twists for
  everyone) and harder summers once you've survived a week.

## Rules
- **Kitchen:** a 6×6 grid of floor and stations. Tap a station to queue it for your otter (up to
  4 taps, shown as numbered paw pins). The otter walks there and uses it. Tap your otter to
  clear its queue.
- **Carrying:** an otter carries one thing, either an ingredient or a plate (which can hold a dish in
  progress).
- **Stations:**
  - Crate: take a raw ingredient. Nori goes straight onto a plate you're holding.
  - Board: slice. The otter has to stay while it works.
  - Pan and fryer: cook unattended, and burn if left too long.
  - Rice cooker: has a few servings. Tap it when it's empty to cook more.
  - Plates: take a clean plate.
  - Counter: put things down, and combine an ingredient with a plate.
  - Dock: launch a finished plate onto the next free raft.
  - Bin: throw something away.
- **Dishes** are exact sets of components on a plate. Salmon nigiri is rice plus sliced salmon;
  the dragon roll is rice, nori, fried shrimp, sliced avocado and sliced tuna. Plate rim colours
  show the price (kaiten-zushi style).
- **Customers** sit along the far side of the canal and show 1–3 dishes in a bubble with a
  patience ring. They grab any passing raft carrying a dish they want, eat it (and get some
  patience back), stack the plate and pay when they've finished: the plate prices plus a tip of
  up to 50% for patience left. If patience runs out, they leave and pay only for what they ate.
- **Lanterns:** every plate eaten lights a lantern on the string above the bar. Five lit lanterns
  start a Lantern Rush: everything paid in the next 12 s is doubled. A customer leaving in a huff
  puts the lanterns out.
- **Rent:** taken from the purse after each evening. If the purse can't cover it, the pier closes
  and the week ends. The score is the coins taken over the week.
- **Split kitchens:** some layouts have a counter down the middle. Each otter reaches only its
  own side, and things are passed over the counter. Solo play routes each tap to the otter that
  can reach it.

## Controls
- **Touch or mouse:** tap stations, tap your otter to clear its queue, tap gulls to shoo them.
- **Solo:** with a computer Kelp (the kitchen bot at skill 0.72 plays otter 1; your taps go to
  Pebble), or running both otters: a tap goes to the otter that can reach the station; when both
  can, it goes to the selected otter (tap an otter to select it, or press Tab).
- **Keyboard:** arrow keys move a cursor around the kitchen and Space or Enter queues the tile.
  Tab switches otter, P pauses, M mutes.

## Reading aids (added 2026-10-24)
Three small helps that keep the kitchen readable mid-evening, the same solo and online:
- **The glow:** once your otter is idle with something in its paws, the stations where a tap
  moves it toward a dish light up (lantern light on the top, a ring and halo in the otter's
  colour): the board for raw fish, the plate stack or a waiting plate for a slice, whatever a plate
  still needs, the dock for a finished dish, the bin for burnt food. In the split kitchen, when the
  next step is on the other side, the empty pass counters glow. `nextStops()` in the engine uses the
  same tests as the otter's own actions, and a test taps every glowing station on random bot nights
  to check that each one moves the dish on. Off during Monday's coached dish.
- **The ticks:** a dish already sailing to a customer (or waiting at the dock) fades in their
  bubble, with a canal-teal tick. `onTheWay()` walks the rafts along the far lane in order and
  knows that a customer who is walking in or eating can't grab (a test plays on with no new plates
  and checks that every tick comes true; gulls are left out of the prediction).
- **The recipes:** a hinoki menu board on two posts in the harbour, left of the pier, wherever the
  screen has room: each dish on its rim-coloured plate, its name and its parts, with a vermilion
  count of how many the bar is still waiting for. On a phone (no room) you tap a bubble and the
  recipe shows on a paper slip for about three seconds; a hint says so once.

## Online
The host's browser is authoritative (`js/net-play.js`): it sends a snapshot of the state about
15 times a second, and the guest sends taps. A guest that reloads gets their otter back by token.
The day pauses for both when either tab is hidden. If the partner drops, the host can carry on
with both otters. Invites go by link, QR code or a typed code. Solo and one shared screen always
work.

## Look and sound
- **Materials:** a harbour pier at dusk. Hinoki counter wood, an indigo noren with a wave crest,
  vermilion paper lanterns, teal canal water, bamboo rafts, white rice and coloured plate rims.
- **Time on the sky:** the sky moves from sunset to night as the evening runs, and the moon
  rises. That sky is the day's clock.
- **Type:** Mochiy Pop One for the display face and numbers, Zen Maru Gothic for the body text.
- **Palette:** hinoki `#e8c896`, indigo `#24335a`, canal teal `#2f8b96`, lantern vermilion
  `#de4b3a`, rice `#fbf6ea`, nori `#1e3a2b`, with dusk-sky gradients. The salmon colour is only
  ever used on food.
- **Characters** are round and front-facing (a 3/4 view), with blinks, whisker twitches and mood
  faces.
- **Sound:** wood "tok" for taps, a knife rhythm, the rice cooker's little 5-note jingle, a
  frying sizzle, a launch bell with a plop, a pitched nom, coin clinks, and a rising pentatonic
  note per lantern with a gong for the Rush. The music is a gentle koto-like loop that speeds up
  in the last 20 s.

## The memorable moment
**Closing time.** The lanterns glow and each plate eaten that evening flies onto a tower sorted
by rim colour, counting the coins up with clinks that rise in pitch. Then rent is stamped in red
with a hanko seal, and the two otters float on their backs in the harbour holding paws under the
moon. The end-of-week poster is that scene with the week's tower.

## Tuning notes
`tools/sim.mjs` plays whole weeks with the kitchen bot (`js/bot.js`) running both otters; shop policy
"balanced" buys one dish a morning, then upgrades, keeping half of tonight's rent. Flags: `--weeks`,
`--skill`, `--summer`, `--rent 1.2` (scale rent), `--greedy` (buy everything).

- First pass: even a fast bot served only ~12 plates a night. A finished slice sat on the only board
  and blocked all slicing, and plates holding only rice filled the island. The bot now clears blocked
  stations, sends raw things parked on counters to their station, and counts an otter already walking
  to a crate as supply (or both otters fetched the same salmon).
- Jobs go to a dish that can be made now (its parts ready, on their way, or preppable by this otter).
  Before that, the split kitchen's assembler waited on cucumber nobody was bringing while tuna sat
  on the pass, and once fixed the bot got much stronger (skill 1 from 51% to 94% of weeks), so the
  rent was retuned after it.
- The menu grows by purchase, and with even ordering every complex dish took an equal share of
  orders: a greedy bot that bought them all did worse than a slow one. Orders are now weighted by
  how many parts a dish has (2: 1, 3: 0.8, 4: 0.55, 5: 0.4), so new dishes are specials, not the norm.
- The opening is generous: patience ×1.5 on Monday, ×1.25 on Tuesday, ×1.1 on Wednesday. The canal
  runs 1.45 tiles a second (a lap in ~10 s): at 1.15 the far seat waited 9 s for a plate.
- Rent is 17, 33, 52, 81, 119. Survival over 200 weeks of summer 1 at bot skill 0.4 / 0.6 / 0.8 / 1.0:
  44% / 79% / 94% / 95%, with Friday the decider (the 0.4 bot fails it about half the time). The step
  is steep: rent ×1.15 gave 16% / 41% / 74% / 90%. The bot doesn't queue taps ahead, and people do
  once they get it, but a learning couple will be slower than the bot on Monday.
- Summers: rent +12% and patience −5% a summer. Summer 2: 1% / 28% / 51% / 73%; summer 3: 0% / 1% /
  15% / 27%. (+20% rent and −7% patience made summer 2 a wall: 0% / 6% / 21% / 43%.)
- Twists on Wednesday (25 nights each) all land within about 10 coins of a plain night, except the
  school trip, which brings six extra guests and pays more.
- The computer Kelp (solo) is the same bot at skill 0.62 without fumbles, never heads for a station
  the player has queued, and waits during the coached first dish. In play-testing it otherwise made
  the first dish itself before the player had tapped anything.
- A snapshot is about 4.8 KB at the festival's busiest: ~70 KB/s to the guest at 15 Hz.

## Ideas for later
- Dirty-dish nights (limited plates and a sink).
- Three or four otters.
