#!/usr/bin/env node
// Scaffolds games/<slug>/ from templates/game/ and gives it the next game number.
//
//   npm run new -- press-run "Press Run" --type word --tagline "A word roguelite" --emoji "🖨️"
//
// --type is required and must be a type no other game has taken (see `npm run types`), so
// every game is a new kind of game. To repeat a type, pass --repeat --reason "..."; that is
// only accepted once every type is taken, or when the reason says Rich asked for it.
//
// The new game.json starts as "draft": true (hidden from the front page). Flip it to false
// when the game is done.
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadGames } from './build-gallery.mjs';
import { typeStatus } from './types.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const tagline = opt('tagline', 'A brand new game.');
const emoji = opt('emoji', '🎮');
const type = opt('type', '');
const reason = opt('reason', '');
const repeat = args.includes('--repeat') && (args.splice(args.indexOf('--repeat'), 1), true);
const [slug, title = slug] = args;

if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error('Usage: npm run new -- <kebab-slug> "<Title>" --type <type-id> [--tagline "..."] [--emoji "🎮"]');
  process.exit(1);
}

const types = typeStatus();
const fail = (msg) => {
  console.error(msg);
  console.error(`\nUntried types: ${types.available.map((t) => t.id).join(', ') || 'none'}\nSee \`npm run types\` for descriptions.`);
  process.exit(1);
};
if (!type) fail('Pick a game type with --type <id>.');
const known = types.types.find((t) => t.id === type);
if (!known) fail(`"${type}" isn't in game-types.json. If this is a genuinely new kind of game, add it there first.`);
const holder = types.taken.find((t) => t.id === type);
if (holder) {
  const who = holder.games.map((g) => g.title).join(', ');
  if (!repeat) fail(`The "${type}" type is taken by ${who}. Each game should be a new type of game.`);
  if (!reason) fail('A repeat needs --reason "..." explaining why.');
  if (types.available.length && !/rich|user|asked/i.test(reason)) {
    fail(`${types.available.length} types are still untried, so repeating "${type}" is only for when Rich asked for it (say so in --reason).`);
  }
  console.warn(`Repeating the "${type}" type (${who}): ${reason}`);
}
const dest = join(root, 'games', slug);
if (existsSync(dest)) {
  console.error(`games/${slug} already exists.`);
  process.exit(1);
}

const number = Math.max(0, ...loadGames({ includeDrafts: true, warn: () => {} }).map((g) => g.number || 0)) + 1;
const d = new Date();
const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const vars = { SLUG: slug, TITLE: title, TAGLINE: tagline, EMOJI: emoji, NUMBER: String(number), DATE: date, TYPE: type };

cpSync(join(root, 'templates/game'), dest, { recursive: true });
for (const f of readdirSync(dest)) {
  const p = join(dest, f);
  const text = readFileSync(p, 'utf8').replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m);
  writeFileSync(p, text);
}
if (holder) {
  const metaPath = join(dest, 'game.json');
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  meta.repeatReason = reason;
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
}
console.log(`Created games/${slug}/ (game #${number}, type: ${known.name}). Open http://localhost:8642/games/${slug}/`);
