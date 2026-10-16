// Seeded randomness so runs can be replayed, shared ("seed: PLUM-42") and offered as daily puzzles.
//
//   const rng = createRng('2026-10-15');   // or a number
//   rng.next()  rng.int(1, 6)  rng.pick(arr)  rng.shuffle(arr)  rng.chance(0.25)

/** Hash any string to a 32-bit seed. */
export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function createRng(seed = Date.now()) {
  let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  const next = () => {
    // mulberry32
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    /** Integer in [min, max] inclusive. */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** Shuffles a copy. */
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    /** Pick by weight: weighted([{w:3, v:'a'}, ...], x => x.w). */
    weighted(items, weightOf) {
      const total = items.reduce((s, it) => s + weightOf(it), 0);
      let r = next() * total;
      for (const it of items) if ((r -= weightOf(it)) < 0) return it;
      return items[items.length - 1];
    },
    /** Serializable position so a saved game can resume the same sequence. */
    get state() {
      return a;
    },
    set state(v) {
      a = v >>> 0;
    },
  };
  return rng;
}

/** Local-date seed string for daily modes, e.g. "2026-10-15". */
export function dailySeed(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
