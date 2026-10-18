// Courses: nine plates from the bank, easy to hard, chosen by a seed (the daily seed gives
// everyone the same course that day).
import { BANK } from './bank.js';
import { createRng } from '../../../shared/rng.js';
import { STARS } from './gen.js';

// The cup's world is named after the star in the plate's title (labelled on the chart).
for (const h of BANK) h.star ??= STARS.find((s) => h.name.includes(s)) || null;

export const LAYOUT = [1, 1, 2, 2, 2, 3, 3, 3, 4];
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

export function buildCourse(seed, bank = BANK) {
  const rng = createRng(`course:${seed}`);
  const used = new Set();
  return LAYOUT.map((tier) => {
    const pool = bank.filter((h) => h.tier === tier && !used.has(h.id));
    const h = rng.pick(pool);
    used.add(h.id);
    return h;
  });
}

export const coursePar = (holes) => holes.reduce((s, h) => s + h.par, 0);

export function holeById(id, bank = BANK) {
  return bank.find((h) => h.id === id) || null;
}
