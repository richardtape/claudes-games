#!/usr/bin/env node
// Clear rate and score of each layout on its own (no conditions, no chemistry), for shaping
// the difficulty curve. Candidates can be tried without editing data.js:
//
//   node games/touch-paper/tools/layouts.mjs [--n 600] [--skills 0.5,0.9] [--try path.json]
//
// --try reads [{ id, name, art: [...] }, ...] and probes those instead.
import { readFileSync } from 'node:fs';
import { newShow, play, playHand, strike, parseLayout } from '../js/engine.js';
import * as engine from '../js/engine.js';
import { chooseMove } from '../js/bot.js';
import { LAYOUTS } from '../js/data.js';
import { createRng } from '../../../shared/rng.js';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const N = Number(opt('n', 600));
const skills = opt('skills', '0.5,0.9').split(',').map(Number);
const layouts = opt('try') ? JSON.parse(readFileSync(opt('try'), 'utf8')) : LAYOUTS;

for (const layout of layouts) {
  const info = parseLayout(layout);
  const open = info.coveredBy.filter((c) => !c.length).length;
  const row = [`${layout.name.padEnd(22)} ${String(info.slots.length).padStart(2)} cards, ${info.rows - 1} lines, ${open} open:`];
  for (const skill of skills) {
    let clear = 0;
    let score = 0;
    let finale = 0;
    for (let i = 0; i < N; i++) {
      const s = newShow({ seed: `lay-${i}` });
      s.twists = [null, null, null, null, null];
      // Deal this layout by hand (same rules as deal()).
      const rng = createRng(`lay-deal-${i}`);
      const deck = rng.shuffle([...Array(52).keys()]);
      const n = info.slots.length;
      s.layoutId = `try-${layout.id}`;
      s.slots = deck.slice(0, n).map((card) => ({ card, gone: false, up: false }));
      s.box = deck.slice(n);
      s.fuse = s.box.shift();
      s.volley = [];
      registerTry(s.layoutId, info);
      s.slots.forEach((x, k) => (x.up = info.coveredBy[k].length === 0));
      const r = createRng(`lay-bot-${i}-${skill}`);
      const rnd = () => r.next();
      let guard = 0;
      while (s.phase === 'play' && guard++ < 500) {
        const m = chooseMove(s, { skill, rng: rnd });
        if (m.kind === 'play') play(s, m.slot);
        else if (m.kind === 'hand') playHand(s, m.k);
        else strike(s, { pick: m.pick || 0 });
      }
      clear += s.report.cleared ? 1 : 0;
      score += s.report.actScore;
      finale += s.report.finale.points;
    }
    row.push(`skill ${skill}: clear ${((100 * clear) / N).toFixed(0).padStart(3)}%  score ${(score / N).toFixed(0).padStart(4)} (finale ${(finale / N).toFixed(0)})`);
  }
  console.log(row.join('   '));
}

function registerTry(id, info) {
  engine.registerLayout(id, info);
}
