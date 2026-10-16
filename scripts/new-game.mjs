#!/usr/bin/env node
// Scaffolds games/<slug>/ from templates/game/ and gives it the next game number.
//
//   npm run new -- press-run "Press Run" --tagline "A word roguelite" --emoji "🖨️"
//
// The new game.json starts as "draft": true (hidden from the front page). Flip it to false
// when the game is done.
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadGames } from './build-gallery.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const tagline = opt('tagline', 'A brand new game.');
const emoji = opt('emoji', '🎮');
const [slug, title = slug] = args;

if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error('Usage: npm run new -- <kebab-slug> "<Title>" [--tagline "..."] [--emoji "🎮"]');
  process.exit(1);
}
const dest = join(root, 'games', slug);
if (existsSync(dest)) {
  console.error(`games/${slug} already exists.`);
  process.exit(1);
}

const number = Math.max(0, ...loadGames({ includeDrafts: true, warn: () => {} }).map((g) => g.number || 0)) + 1;
const d = new Date();
const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const vars = { SLUG: slug, TITLE: title, TAGLINE: tagline, EMOJI: emoji, NUMBER: String(number), DATE: date };

cpSync(join(root, 'templates/game'), dest, { recursive: true });
for (const f of readdirSync(dest)) {
  const p = join(dest, f);
  const text = readFileSync(p, 'utf8').replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m);
  writeFileSync(p, text);
}
console.log(`Created games/${slug}/ (game #${number}). Open http://localhost:8642/games/${slug}/`);
