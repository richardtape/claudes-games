// A tiny step sequencer for background music, built on shared/sfx.js. It schedules each step
// a little ahead on the audio clock, so timer jitter never makes the beat wobble.
//
//   const seq = createSequencer(sfx, { bpm: 132, steps: 64, onStep(step, at) {
//     if (step % 4 === 0) sfx.tone({ freq: 82, type: 'triangle', dur: 0.2, vol: 0.1, at });
//   } });
//   seq.start(); seq.stop(); seq.bpm = 150;
//
// Steps are sixteenth notes. Nothing plays (and nothing is scheduled) while sfx is muted or
// before the first user gesture unlocks audio.
export function createSequencer(sfx, { bpm = 120, steps = 16, onStep }) {
  let timer = null;
  let step = 0;
  let next = 0;
  let tempo = bpm;
  const stepDur = () => 60 / tempo / 4;
  function pump() {
    const now = sfx.now();
    if (now === null) {
      next = 0;
      return;
    }
    if (next < now) next = now + 0.06;
    while (next < now + 0.18) {
      onStep(step, next);
      step = (step + 1) % steps;
      next += stepDur();
    }
  }
  return {
    start() {
      if (timer) return;
      step = 0;
      next = 0;
      timer = setInterval(pump, 50);
      pump();
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
    get playing() {
      return !!timer;
    },
    get bpm() {
      return tempo;
    },
    set bpm(v) {
      tempo = v;
    },
  };
}
