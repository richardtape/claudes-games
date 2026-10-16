import { homeLink, markReady, recordBest, recordPlay, store } from '../../shared/arcade.js';
import { createSfx } from '../../shared/sfx.js';
// Also available: ../../shared/juice.js (floatText, shake, countUp, toast, pulse),
// ../../shared/rng.js (seeded RNG, dailySeed), ../../shared/words.js (word lists).

const SLUG = '{{SLUG}}';
const sfx = createSfx(SLUG);
const saved = store(SLUG);

// All game state lives here so window.__game.state shows everything.
const state = {
  playing: false,
  score: 0,
};

function start() {
  state.playing = true;
  state.score = 0;
  recordPlay(SLUG);
}

function gameOver() {
  state.playing = false;
  recordBest(SLUG, state.score, `${state.score.toLocaleString()} pts`);
}

homeLink();

markReady({
  state,
  sfx,
  start,
  gameOver,
  // Add test/cheat helpers that go through the same code paths as real play, e.g.
  // setLevel(n), win(), spawn(kind), and prepareThumbnail() to put the game in a
  // good-looking mid-game state for `npm run check` (thumbnail + phone layout check).
});
