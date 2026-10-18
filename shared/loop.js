// Game loop for canvas games, with a manual clock for testing.
//
//   const loop = createLoop({ update(dt) {...}, render() {...} });
//   // update(dt): advance the game by dt seconds of real time (capped at maxDt)
//   // render(): draw the current state
//
// Run fixed engine steps inside update with fixedSteps():
//   const steps = fixedSteps(1 / 60);
//   update(dt) { steps.run(dt, () => engine.step(state)); }   render uses steps.alpha
//
// Testing: requestAnimationFrame does not run in a background tab (Rich's Chrome window is
// often hidden behind others while Claude drives it), and real time makes screenshots of
// fast moments hard. Expose loop.advance via markReady so tests can do:
//   __game.loop.manual = true;      // rAF keeps drawing but stops advancing time
//   __game.advance(2.5);            // run 2.5 s of updates in 1/60 s slices, then draw once
export function createLoop({ update, render, maxDt = 0.1 }) {
  let last = null;
  let manual = false;
  function frame(now) {
    // Ask for the next frame first, so one exception (logged to the console) can't stop the
    // game for good.
    requestAnimationFrame(frame);
    const dt = last === null ? 0 : Math.min(maxDt, (now - last) / 1000);
    last = now;
    if (!manual) update(dt);
    render(dt);
  }
  requestAnimationFrame(frame);
  return {
    get manual() {
      return manual;
    },
    set manual(v) {
      manual = !!v;
    },
    /** Run `seconds` of updates in 1/60 s slices (calling `each(t)` before each), then render. */
    advance(seconds = 1, each = null) {
      const n = Math.round(seconds * 60);
      for (let i = 0; i < n; i++) {
        each?.(i / 60);
        update(1 / 60);
      }
      render(1 / 60);
    },
    /** Forget the last frame time (call after a pause so the next dt is not huge). */
    resync() {
      last = null;
    },
  };
}

/** Fixed-timestep accumulator. run(dt, step) calls step() once per `DT` of accumulated time. */
export function fixedSteps(DT = 1 / 60, maxSteps = 8) {
  let acc = 0;
  return {
    DT,
    run(dt, step) {
      acc += dt;
      let n = 0;
      while (acc >= DT && n < maxSteps) {
        if (step() === false) {
          acc = 0;
          return;
        }
        acc -= DT;
        n++;
      }
      if (n === maxSteps) acc = Math.min(acc, DT); // fell behind: drop the backlog
    },
    /** 0..1 between the last step and the next, for interpolated rendering. */
    get alpha() {
      return acc / DT;
    },
    reset() {
      acc = 0;
    },
  };
}
