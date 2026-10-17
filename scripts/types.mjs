#!/usr/bin/env node
// Which game types are taken and which are still untried.
//   npm run types            human-readable list
//   npm run types -- --json  machine-readable { taken, available }
//   npm run random           pick one untried type at random (same as -- --random)
// The catalogue is game-types.json; a type is taken when any game's game.json names it
// (drafts included, so a game in progress holds its type).
import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadGames } from './build-gallery.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function typeStatus() {
  const { types } = JSON.parse(readFileSync(join(root, 'game-types.json'), 'utf8'));
  const games = loadGames({ includeDrafts: true, warn: () => {} });
  const byType = new Map();
  for (const g of games) {
    if (!g.type) continue;
    byType.set(g.type, [...(byType.get(g.type) || []), g]);
  }
  const unknown = [...byType.keys()].filter((id) => !types.some((t) => t.id === id));
  return {
    types,
    taken: types.filter((t) => byType.has(t.id)).map((t) => ({ ...t, games: byType.get(t.id) })),
    available: types.filter((t) => !byType.has(t.id)),
    unknown,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = typeStatus();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ taken: s.taken.map((t) => ({ id: t.id, games: t.games.map((g) => g.slug) })), available: s.available.map((t) => t.id) }, null, 2));
    process.exit(0);
  }
  if (process.argv.includes('--random')) {
    if (!s.available.length) {
      console.log('Every type is taken: invent a new type, or repeat the one whose last game is oldest (see CLAUDE.md).');
      process.exit(0);
    }
    const t = s.available[randomInt(s.available.length)];
    console.log(`Random pick from ${s.available.length} untried types:\n`);
    console.log(`  ${t.id}: ${t.name}. ${t.about}\n  e.g. ${t.examples}\n`);
    console.log(`Scaffold: npm run new -- <slug> "<Title>" --type ${t.id} --tagline "..." --emoji "..."`);
    process.exit(0);
  }
  const pad =Math.max(...s.types.map((t) => t.id.length)) + 2;
  console.log(`Game types: ${s.taken.length} of ${s.types.length} taken\n`);
  console.log('Taken:');
  for (const t of s.taken) console.log(`  ${t.id.padEnd(pad)}${t.name}: ${t.games.map((g) => `${g.title} (#${g.number})`).join(', ')}`);
  console.log(`\nAvailable (pick one, or add a genuinely new type to game-types.json):`);
  for (const t of s.available) console.log(`  ${t.id.padEnd(pad)}${t.name}. ${t.about} e.g. ${t.examples}`);
  if (s.unknown.length) console.log(`\n! games use types missing from game-types.json: ${s.unknown.join(', ')}`);
}
