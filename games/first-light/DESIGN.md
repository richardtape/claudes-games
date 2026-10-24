# First Light

**Type:** exploration-3d. **Verb:** choose your height. A hot-air balloon cannot steer; the wind
blows a different way at each height, so you steer by climbing and sinking into the layer that
goes where you want. Made for a phone held upright, one thumb, flights of about four minutes.

## Hook

Dawn over a valley of fairy chimneys. You lift off in the blue half-dark among dozens of other
balloons. Climb past the valley rim and the sun breaks the horizon beside a snowy volcano: the
whole sky of balloons turns gold at once. Then read the winds, drop weighted markers on crosses
laid out in the fields, photograph the landmarks, and land gently before the propane runs out.

## Rules

- **Burner** (hold): heats the envelope. Heat answers with a lag of a few seconds, so you
  anticipate. Propane runs down while it burns.
- **Vent** (hold): spills hot air for a faster descent.
- **Wind ladder:** five wind layers, veering with height (direction turns clockwise as you
  climb, faster higher up). Near the ground the wind drops off (friction), so the surface is calm.
  Other balloons and drifting seeds show the winds; the ladder on the right shows each layer's
  direction relative to the camera.
- **Targets:** three crosses per flight, each takes one marker. Drop within 150 m of a cross; the
  marker keeps the balloon's drift as it falls. Score by distance: 1000 at 3 m or closer, then 15
  points a metre, nothing past about 70 m.
- **Photos:** a landmark in range and in frame lights the camera. The shot is the real view,
  kept in the album. 12 album pages: 9 places and 3 special shots (the sunrise, Mount Erciyes from
  above 300 m, a sky full of balloons).
- **Landing:** touch down gently on open ground. Soft, firm, bump or crash; leftover propane
  scores too. With the tank empty the balloon slowly sinks, so every flight ends on the ground.
- **First light:** seeing the sun from the sky before it reaches the valley floor scores a bonus.
  It rises whether or not you climb.

## Loops

- **Moment:** hold, and a second later the balloon answers; seeds stream past in another layer.
- **Run:** one dawn flight (about 4 minutes): three crosses further out, propane running down,
  a landing.
- **Return:** today's flight (same winds, launch field and crosses for everyone, `dailySeed`),
  free flights on random winds, the album (12 pages), best flight score on the shelf.

## Controls

- Touch: big Burner button bottom right (hold), Vent bottom left (hold), Drop and Camera appear
  above Burner when they can be used. Drag the sky to look around.
- Keyboard: Space or Up arrow to burn, Down arrow or V to vent, D to drop, P for a photo, Left and
  Right arrows to look around, M to mute.

## Look

Dawn in Cappadocia. Low-poly, flat-shaded terrain banded like tuff strata (cream, apricot, rose),
dark basalt caps on the chimneys, vineyards and apricot orchards on the valley floor, a red river,
the snow cone of Erciyes on the eastern horizon. Fog matches the horizon colour.

| Token | Hex | Meaning |
|---|---|---|
| Pre-dawn indigo | `#1f2350` | sky and UI ink before sunrise |
| Lavender haze | `#a197c9` | shade, distance, inactive |
| Tuff apricot | `#f1bc8f` | rock in the sun |
| Rose strata | `#d98e98` | ridges, warmth |
| Sun gold | `#ffcc55` | the sun, targets, anything worth points |
| Basalt | `#43373f` | caps, outlines |

Balloon envelopes in saturated stripes (red, yellow, cobalt, green, white). The player's balloon
is cobalt and gold so it never gets lost among the others.

Type: **Marcellus** (flared Roman capitals, like the inscriptions in the cave churches) for
titles, landmark names and the certificate; **Atkinson Hyperlegible Next** for everything you
read in a hurry (HUD, buttons, help), because it holds up on a phone in bright sun.

UI chrome: a basket rim. Buttons are padded suede on wicker (warm brown with a stitched edge),
quiet so the sky stays the star. End screen: a flight certificate (balloon pilots give
passengers one after a first flight) with the route drawn on a map of the valley, the scores
counted out line by line, and the flight's photos as prints.

## Sound

All synthesized. The burner roar (filtered noise with a low rumble, swelling with the valve),
basket creaks, wind hiss that rises with speed, distant birds, a soft marker whistle and thud, a
shutter click, a cork pop on the certificate. Music: a quiet drone with a ney-like flute phrase in
a Hicaz-flavoured mode, swelling into a chord at first light. Music and effects mute separately.

## The memorable moment

**First light.** The sun's limb clears the ridge beside Erciyes; a gold bloom washes the screen,
the directional light ramps up over two and a half seconds, the sky warms from lavender to gold,
every envelope lights up, the rock turns from grey to apricot, and the music swells into its
chord while "First light" is set in Marcellus across the sky. It is earned by climbing (seeing
the sun from the sky), and it teaches the burner as the first thing you do.

## Structure in code

- `js/terrain.js`: the fixed valley (height grid, strata colours, chimneys, fields, river,
  landmarks), pure.
- `js/engine.js`: flight state, balloon physics, wind layers, markers, photos, landing, scoring,
  events; pure, serializable, fixed 60 Hz steps.
- `js/winds.js`: the day's wind layers, launch field and crosses from a seed.
- `js/bot.js`: a human-ish pilot (reaction delay, altitude misjudgement, drop timing noise):
  title-screen demo, daily check, simulator.
- `js/render.js`: three.js scene. `js/hud.js`: wind ladder, minimap, labels. `js/audio.js`.
- `tools/sim.mjs`: flights by bot skill, to tune propane, heat rates, wind speeds and scoring.

## Tuning (2026-10-24)

From `tools/sim.mjs --n 60` (bot pilots at three skills) and two hand-flown flights on a phone-sized
page (`npm run drive -- first-light --phone`):

- **Burner:** the first numbers (burn 0.06 heat/s, hot cooling 0.05) needed an 8 s burn for 28 m:
  sluggish. Now 0.095 and 0.032, lift 15 m/s per unit heat: an 8 s burn from the field reaches about
  90 m in 20 s, and a 3 s vent still sinks for a long time (you must burn to stop it: real, and tense).
- **Pacing:** crosses sit on a random climb-and-sink route at 38–52 s, 82–100 s and 125–145 s, and
  layer speeds are 3.0 / 5.0 / 6.8 / 8.6 / 10.6 m/s (±15%). Hand flights reached a cross every 60–90 s;
  a full flight runs about 4–5 minutes. Propane 1.35% per second of burn leaves 10–40% at landing.
- **Markers:** 1000 within 3 m, 12 fewer a metre, at least 50 for any marker within 150 m. Hand drops
  landed 27–71 m out (713, 180 points); bot medians 12–22 m. A good approach is low and lined up with
  the dashed ring well before the cross.
- **Bot:** reaches about 2 of 3 crosses at every skill and lands outside the valley in about 30% of
  flights: its planning is crude (drift in straight lines, no lookahead past one cross). It flies the
  title demo and checks the pacing; it does not set par. Players get a warning near the edge.
- **Exploits closed:** leftover propane only scores once all three markers are down (landing at once
  scored 870 for nothing); a basket resting against a chimney no longer racks up scrapes.
