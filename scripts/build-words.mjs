#!/usr/bin/env node
// Rebuilds the shared word lists in shared/words/ from the raw sources in shared/words/src/.
//
//   dictionary.txt  every ENABLE word (2-15 letters), alphabetical. Use it to VALIDATE player input.
//   common.txt      ENABLE words ranked by real-world frequency (most common first), with
//                   profanity/slurs removed. Use it to PICK target words, hints and suggestions.
//
// Usage: npm run words
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => join(root, 'shared/words/src', f);
const out = (f) => join(root, 'shared/words', f);

// Raw sources are gitignored; download any that are missing.
const SOURCES = {
  'enable1.txt': 'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt',
  'count_1w.txt': 'https://norvig.com/ngrams/count_1w.txt',
  'blocklist-ldnoobw.txt': 'https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en',
};
mkdirSync(join(root, 'shared/words/src'), { recursive: true });
for (const [file, url] of Object.entries(SOURCES)) {
  if (existsSync(src(file))) continue;
  console.log(`downloading ${file} from ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  writeFileSync(src(file), await res.text());
}

const lines = (f) => readFileSync(src(f), 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

const enable = lines('enable1.txt')
  .map((w) => w.toLowerCase())
  .filter((w) => /^[a-z]{2,15}$/.test(w));
const enableSet = new Set(enable);

const blockRoots = lines('blocklist-ldnoobw.txt')
  .map((w) => w.toLowerCase())
  .filter((w) => /^[a-z]+$/.test(w));
const blocked = new Set();
for (const b of blockRoots) {
  for (const suffix of ['', 's', 'es', 'ed', 'er', 'ers', 'ing', 'y', 'ies']) blocked.add(b + suffix);
}

const common = [];
const seen = new Set();
for (const line of lines('count_1w.txt')) {
  const [word] = line.split('\t');
  if (!enableSet.has(word) || blocked.has(word) || seen.has(word)) continue;
  seen.add(word);
  common.push(word);
}

writeFileSync(out('dictionary.txt'), enable.join('\n') + '\n');
writeFileSync(out('common.txt'), common.join('\n') + '\n');

console.log(`dictionary.txt  ${enable.length.toLocaleString()} words`);
console.log(`common.txt      ${common.length.toLocaleString()} words (frequency-ranked, ${blocked.size} blocked forms)`);
