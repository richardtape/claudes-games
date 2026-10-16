// Shared English word lists for word games (built by `npm run words`, see shared/words/README.md).
//
//   const dict = await loadDictionary();   // Set of 168k valid words (ENABLE) — validate input
//   const common = await loadCommon(20000); // most frequent first, profanity removed — pick targets/hints
//
// Lists are lowercase a–z. Fetching needs the page served over http (npm start), not file://.

const cache = new Map();

async function fetchList(name) {
  if (!cache.has(name)) {
    const url = new URL(`./words/${name}.txt`, import.meta.url);
    cache.set(
      name,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`Could not load word list ${url} (HTTP ${r.status})`);
        return r.text();
      }).then(parseWordList),
    );
  }
  return cache.get(name);
}

export function parseWordList(text) {
  return text.split('\n').filter(Boolean);
}

/** Every valid word as a Set (2–15 letters). */
export async function loadDictionary() {
  return new Set(await fetchList('dictionary'));
}

/** Common words ranked by frequency, optionally only the first `limit`, filtered by length. */
export async function loadCommon(limit = Infinity, { min = 2, max = 15 } = {}) {
  const words = await fetchList('common');
  const out = [];
  for (const w of words) {
    if (w.length >= min && w.length <= max) out.push(w);
    if (out.length >= limit) break;
  }
  return out;
}
