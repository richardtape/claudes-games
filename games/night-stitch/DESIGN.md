# Night Stitch

## The hook
Pokémon Ranger's capture loop, done as embroidery. You steer a needle around a hoop and its
thread trails behind it, a fixed length like Snake's tail. Cross your own thread and the loop
cinches shut: every moth inside is stitched into the linen, one pluck at a time, and the more
moths in one loop the bigger the multiplier. Moths that settle chew holes in the fabric, and the
fabric is your health bar. Survive from 10 PM to dawn and the run leaves you a finished sampler
covered in the moths you caught.

The memorable moment: **the cinch.** The loop flashes, tightens with a zip, and the moths
inside flip one by one into satin-stitch embroidery with music-box notes climbing the scale,
then the loop total lands with a shake sized to the catch. A grand loop of 8+ moths gets a
chord and a stitched banner.

## Rules
- Hoop of radius 500 engine units, centre (0,0). The needle stays inside the hoop.
- The thread is a polyline trailing the needle with a maximum length (900 units at start).
  The oldest end pulls through as you move.
- **Loop:** when the needle crosses (or comes within a few units of) an older part of its own
  thread, the enclosed polygon closes. Everything whose centre is inside is caught: moths,
  beetles, holes (darned) and boss tallies. The thread then restarts from the needle.
  Loops smaller than a minimum area are ignored.
- **Score:** loop score = (sum of base points) × (moths in the loop). Gilded (rare) moths are
  worth ×5. Darned holes +5 each. At dawn: +50 per % of fabric left.
- **Moths** fly in from the dark in little flights of 1-4 (so loops can catch several),
  flutter toward a landing spot and settle to eat. A settled moth grows a hole under it until
  the hole is full, then flies off to start another. Catching a moth that is eating darns its
  hole too. Moths startle and take off if the needle comes close (they twitch and show a red
  dashed ring as you near), so loop them from a distance.
- Loops that catch nothing (no moth, no hole) are ignored and the thread carries on.
- **Carpet beetles** crawl across the linen. If one touches your thread it snaps there and
  you lose the older part.
- **Fabric:** holes eat into it (LOSS_AREA of open hole tears it). At 0% the linen splits
  through its biggest holes and the night is over.
- **The night:** 8 hours (10 PM to 6 AM), 40 s each. Each hour adds species and pace.
  Midnight brings the Atlas Moth (3 loops, wingbeat gusts snap nearby thread); 2 AM a swarm;
  4 AM the Death's-head Hawkmoth (3 loops, flees the needle, the others eat faster while it's
  here). The clock shows what's coming.
- **Notions:** at each chime pick 1 of 3 sewing notions (longer thread, lavender sachet,
  beeswax...), each a permanent upgrade for the night.
- **Return:** best score, daily pattern (seeded by date), specimen case collecting every
  species and its gilded variant.

## Controls
Mouse or trackpad: move (no button needed). Touch: drag; lifting and touching again
re-threads at the new spot. Keyboard: arrows/WASD steer. P or Esc pauses, M mutes.
1/2/3 or click to pick a notion. Enter/Space on buttons.

## Look and sound
- Palette: night room indigo `#171c3a`, lamp amber `#f4b860`, linen oatmeal `#dcd0b4`,
  beech hoop `#c48c52`, threads (DMC-ish floss) madder `#b5362f`, indigo `#33478c`,
  sage `#6c8d5c`, plum `#7a3a62`, gold `#e1a83a`. Gold thread = score; madder = danger.
- Type: IM Fell English for all text (the sampler era); everything numeric and titular is
  cross-stitched from a 5×7 bitmap alphabet drawn as X stitches (canvas and SVG).
- Only light is the lamp: the hoop sits in a warm pool, moths approach as silhouettes from
  the dark and gain colour as they enter the light.
- UI: buttons are woven sew-in labels with a stitched inner border; panels have pinked
  (zig-zag) edges.
- Sound: music-box plucks (pentatonic) per caught moth, a zip on the cinch, a twang on snap,
  clock chimes on the hour, a quiet tick-tock that speeds up as the fabric weakens, a warm
  swell and birdsong at dawn.

## Tuning notes
`node games/night-stitch/tools/sim.mjs [nights] [skills]` plays whole nights with
`js/bot.js`, a deliberately human-ish bot (reaction 0.3-1.0 s, tracing 420-940 units/s, aim
noise, misjudged clusters, 4-26% of loops falling short). Final numbers (80 nights each):

| bot skill | dawn | where nights end | mean score |
|---|---|---|---|
| 0.3 (first-timer) | 5% | mostly 2-4 AM; 90% see the Atlas | 19k |
| 0.45 | 51% | 4-5 AM | 39k |
| 0.6 | 78% | 4-5 AM | 43k |
| 0.8 | ~99% | | 44k |

- First pass: bots of every skill reached dawn ~100% with untouched fabric. Arrivals never
  outpaced looping. Fixed with a much steeper pace (every 2.0 s at 10 PM to 0.5 s at 5 AM,
  caps 8 to 36), faster eating (clothes 4.2/s), `hunger` multipliers in the last three hours,
  and LOSS_AREA 46000 -> 28000.
- 4 AM was a wall (the Death's-head aura at 1.6x killed most runs); softened to 1.35x.
  Midnight hurt weak players because Atlas gusts startled eaters off half-done holes; gusts
  now only push fliers and snap thread.
- Stronger bots score *less* than middling ones: they catch moths early in small loops.
  Waiting for clusters (risking the linen) is the scoring skill. Kept on purpose.
- Early loops caught one moth each (moths landed scattered); flights of 1-4 that settle near
  each other made multipliers happen in the first minute.
- Visual tuning: by 2 AM the sampler drowned the live moths. In play the embroidery draws at
  50% (fresh stitches start vivid and settle over 2 s); the end screen shows it at 100%.
  Open holes draw above the embroidery. Live moths get a darker shadow and outline.

## Ideas for later
- Chains: quick successive loops build a small bonus.
- A thread-colour picker per night, or notions that change the floss (gold thread already
  scores; silver could slow moths it touches).
- Daily leaderboard export (share the sampler PNG with the score).
- Real-human tuning data: log loops per minute and fabric at each chime from Rich's runs.
