# Comet Cup

Orbit golf on a nineteenth-century astronomical plate. Pull back, let go, and a comet curls
around planets drawn in pastel on blue-black paper until it drops into a gilded cup on a far
world. Every planet sings a note as the comet passes it, so every shot plays a melody.

Type: `trajectory` (set angle and power, then watch physics play out).

## Hook

The moment you let go, you're no longer in control: you watch your comet bend around a world
you aimed past on purpose, hear the planets ring one after another, and see it roll, slow,
wobble at the lip and drop. Every hole can be aced, and after you hole out the plate shows
the ace line you could have taken. That's "the one that got away", and the reason to play
tomorrow's course.

## Rules

- A course is nine holes ("plates"), each with a par of 2 to 5. Lowest total wins.
- The comet sits on the tee. Pull back from anywhere on the plate to aim (like a slingshot);
  the dotted line shows the first part of the flight only. Let go to launch.
- Every planet pulls the comet: the bigger the planet, the further its pull reaches. The comet
  bounces off planets and rolls to a stop on them; the next stroke starts wherever it rests.
- The cup is a notch on one planet's surface. The comet drops in if it reaches the cup slowly
  enough; too fast and it lips out.
- Each launch is one exposure of the plate (12 seconds). If the comet is still flying when the
  exposure ends, it stops where it is and you shoot from there.
- Hazards cost a penalty stroke and put you back where you shot from: flying into a sun,
  falling into a dark star (black hole), or leaving the plate.
- Later plates add asteroid rocks (no pull, very bouncy), nebulae (thick dust that slows the
  comet down), wormhole pairs (in one, out the other at the same speed) and dark stars.
- A hole ends at par + 4 strokes ("picked up") so a bad hole never drags on.

## Structure and loops

- **Moment:** aim with a live preview, release, watch and listen. Sinking is a big reward.
- **Run:** nine plates, rising in difficulty (tiers 1 to 4), about ten minutes. Scorecard
  across the top; birdies and aces are announced.
- **Return:** a daily course (same nine plates for everyone that day), a random course any
  time, best score against par on the shelf, aces logged in the observatory book.

The holes come from a bank generated offline (`tools/bank.mjs`): a generator builds holes from
archetypes per tier, a solver searches for an ace (stored as the "ace line"), and noisy bots
play each hole to set par. Holes that are trivial, unsolvable or bot-hostile are discarded.

## Controls

- Pointer/touch: press anywhere on the plate, pull back, release to launch. Pull back to the
  start to cancel. Tap during flight to fast-forward.
- Keyboard: ←/→ turn the aim (Shift for fine), ↑/↓ power, Space or Enter launches; during
  flight Space fast-forwards. N next hole, M mute, P pause, ? help.

## Look

Étienne Léopold Trouvelot's astronomical pastels (1870s–80s): soft chalk planets on dark
blue-black paper, with the engraved captions of a scientific plate.

- Paper `#141c33` with grain and a vignette; engraved double-rule frame with degree ticks.
- Chalk cream `#eadfc4` for type, the comet, the dotted aim and the chalk trail.
- Planet pastels: rose `#d99a8f`, ochre `#d6b26e`, verdigris `#8dbaa8`, lavender `#a89dcc`,
  slate `#86a3c9`. Planets are only ever pastels.
- Meaning: gold leaf `#e9c35b` is the goal (cup, gilded path, under-par numbers), sun orange
  `#f2a65a` with a hot glow is danger, violet `#8a5fd1` is a dark star, teal `#6fd3c4` is a
  wormhole.
- Type: Bodoni Moda (title, big numerals, the result word) and Old Standard TT (captions, UI,
  italic figure labels), both period-correct for scientific printing.
- On a portrait phone the plate turns 90 degrees (space has no "down"), so it fills the
  screen.

## Sound

The music of the spheres: each planet has a note from a pentatonic scale (big worlds low,
small worlds high) and rings like a glass bell when the comet passes close; closer passes
ring louder. Launch is a soft "thwip", landing a wooden tock, rolling a quiet rumble, the
lip-out a rattle. Sinking is a bell chord; an ace replays the melody of the shot. Suns hiss,
dark stars swallow with a falling tone, wormholes phase.

## The memorable moment

**The drop.** As a slow comet nears the cup, time slows down. It drops in with a gold
ripple, the chalk path from tee to cup turns to gold leaf while the notes it passed play back
as an arpeggio, and the result word (Birdie, Par, Ace...) is set in big Bodoni across the
plate. At the end of the course the nine gilded plates form one sheet worth screenshotting.

## Tuning notes

- Physics (`PHYS` in `js/engine.js`): pull = g · density · r² (so every world has the same
  surface gravity and big worlds reach further), g = 950, top launch speed 680. The first
  build used 560 and the giant worlds were traps: escaping needed almost full power. At 680 a
  70% shot escapes the biggest world (r 110) and a 35% shot the smallest.
- The dotted aim shows ~0.8 s of flight (100 steps). Half a second was too little to learn
  from; much more would give the shots away.
- Holes: `tools/bank.mjs` builds 40 per tier from archetypes (`js/gen.js`): plain, blocker,
  far side, binary, rock belt, ring wall, sun, dark star, wormholes, nebula. Each must be
  aced by the solver (coarse 1° × 5% grid, then fine search around the nearest misses) and
  must not be a gimme (ace rate on the grid under 0.7–1.4% by tier). Par = round(casual bot
  mean + 0.6), clamped 2–5, which gives tiers 1–4 average pars of 3.0, 3.4, 3.6 and 4.0
  (about 31 a course). The bots know the physics exactly and make par 70–80% of the time
  even when casual (`tools/sim.mjs`); a person sees only the dotted start, and Claude's
  first plays ran about half a stroke over the bot average, hence the +0.6.
- Tier 1 always has the cup facing the tee and one world in between; the first plate of
  every course is tier 1.
- Every ace line replays bit-for-bit in any browser (the flight step avoids trig), and
  `test/bank.test.mjs` replays all of them.
- Any change to `PHYS` can break stored ace lines, so tune physics before building the bank.
  `test/bank.test.mjs` catches it: widening the cup's lip (36 → 46) to make putts friendlier
  broke one ace line, so the lip stayed at 36.
