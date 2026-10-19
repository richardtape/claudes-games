import test from 'node:test';
import assert from 'node:assert/strict';
import { publishable } from '../publish-filter.mjs';

const none = new Set();

test('docs/ never deploys', () => {
  assert.equal(publishable('docs/superpowers/plans/x.md', none), false);
  assert.equal(publishable('docs/README.md', none), false);
});

test('dotfiles and dot-folders stay local', () => {
  assert.equal(publishable('.tmp/a.png', none), false);
  assert.equal(publishable('games/dead-drop/.hidden', none), false);
});

test('draft games stay local, others pass', () => {
  assert.equal(publishable('games/wip/index.html', new Set(['wip'])), false);
  assert.equal(publishable('games/dead-drop/index.html', none), true);
  assert.equal(publishable('games/dead-drop/index.html', new Set(['wip'])), true);
});

test('ordinary files pass', () => {
  assert.equal(publishable('index.html', none), true);
  assert.equal(publishable('shared/docs.js', none), true);
});
