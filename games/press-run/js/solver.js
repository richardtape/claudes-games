// Finds the best-scoring words for a hand. Used for "the one that got away", for spotting a
// stuck hand, and by tools/sim.mjs for balancing.
import { lengthProblem, scorePlay } from './engine.js';

const QU = 26;
const idx = (c) => c.charCodeAt(0) - 97;
const INK_RANK = { gold: 4, emboss: 3, magenta: 2, cyan: 1 };

/** Precompute letter counts for a word list. Words with a Q not followed by U are dropped. */
export function prepareCandidates(words, { min = 3, max = 10 } = {}) {
  const out = [];
  for (const word of words) {
    if (word.length < min || word.length > max) continue;
    const counts = new Map();
    let ok = true;
    for (let i = 0; i < word.length; i++) {
      let k;
      if (word[i] === 'q') {
        if (word[i + 1] !== 'u') {
          ok = false;
          break;
        }
        k = QU;
        i++;
      } else k = idx(word[i]);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    if (ok) out.push({ word, counts: [...counts] });
  }
  return out;
}

function tokenize(word) {
  const t = [];
  for (let i = 0; i < word.length; i++) {
    if (word[i] === 'q') {
      t.push('qu');
      i++;
    } else t.push(word[i]);
  }
  return t;
}

/** Words formable from `tiles` (array of {uid, letter, ink}). Returns [{word, uids, letters}]. */
export function formable(tiles, candidates) {
  const have = new Array(27).fill(0);
  let blanks = 0;
  for (const t of tiles) {
    if (t.letter === '?') blanks++;
    else have[t.letter === 'qu' ? QU : idx(t.letter)]++;
  }
  const out = [];
  for (const c of candidates) {
    let need = 0;
    let ok = true;
    for (const [k, n] of c.counts) {
      const short = n - have[k];
      if (short > 0) {
        if (k === QU) {
          ok = false;
          break;
        }
        need += short;
        if (need > blanks) {
          ok = false;
          break;
        }
      }
    }
    if (ok) out.push(c.word);
  }
  return out.map((word) => assign(tiles, word));
}

/** Choose concrete tiles for a word, preferring inked tiles. */
function assign(tiles, word) {
  const pool = tiles.slice().sort((a, b) => (INK_RANK[b.ink] || 0) - (INK_RANK[a.ink] || 0));
  const used = new Set();
  const uids = [];
  const letters = tokenize(word);
  for (const l of letters) {
    let t = pool.find((x) => !used.has(x.uid) && x.letter === l);
    if (!t) t = pool.find((x) => !used.has(x.uid) && x.letter === '?');
    used.add(t.uid);
    uids.push(t.uid);
  }
  return { word, uids, letters };
}

/** Top `limit` plays for the current hand, scored with the run's dingbats and levels. */
export function bestPlays(run, tiles, candidates, { limit = 5 } = {}) {
  const plays = formable(tiles, candidates).filter((p) => !lengthProblem(run, p.word.length));
  const scored = plays.map((p) => ({ ...p, score: scorePlay(run, p.uids, p.letters).score }));
  scored.sort((a, b) => b.score - a.score || b.word.length - a.word.length);
  return scored.slice(0, limit);
}
