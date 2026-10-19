#!/usr/bin/env node
// Deploy the arcade to GitHub Pages at https://richardtape.github.io/claudes-games/
//
//   npm run deploy                  test, check, stage, scan, commit, push
//   npm run deploy -- --dry-run     everything except commit and push; lists what would change
//   npm run deploy -- --setup       first time only: create the GitHub repo and the .site checkout
//   npm run deploy -- --skip-checks skip `npm test` and `npm run check` (not recommended)
//
// Modelled on claudes-space/publish.py. The working repo is never pushed: its commits carry the
// local git identity. Instead .site/ holds a separate checkout of the public repo, wiped (except
// .git) and restaged on every run with:
//   - every file git would track here (so .gitignore applies), minus dotfiles and draft games,
//     (docs/ (specs, plans, relay log) never deploys),
//   - .nojekyll so GitHub Pages serves files as-is.
// Every staged file has the home folder shortened to ~ and is scanned for private keys, tokens,
// home paths and the patterns in .publish-deny (local only, one per line; deploy refuses to run
// without it). Any hit stops the deploy before anything is committed. Commits use the GitHub
// no-reply address, so no personal email reaches the public history.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishable } from './publish-filter.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, '.site');
const REPO = 'richardtape/claudes-games';
const REMOTE = `git@github.com:${REPO}.git`;
const SITE_URL = 'https://richardtape.github.io/claudes-games/';
const NOREPLY = '116946+richardtape@users.noreply.github.com';
const CO_AUTHOR = 'Claude Opus 5.5 <noreply@anthropic.com>';
const MAX_FILE = 50 * 1024 * 1024;
const MAX_SITE = 900 * 1024 * 1024;
const SECRETS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, 'a private key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/g, 'a GitHub token'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/g, 'an Anthropic API key'],
  [/\bsk-[A-Za-z0-9]{32,}/g, 'an API key'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'an AWS access key'],
  [/\/Users\/[A-Za-z0-9._-]+/g, 'a home folder path'],
];

class DeployError extends Error {}

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

function run(cmd, cmdArgs, { cwd = ROOT, capture = false, check = true, env, input } = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd, encoding: 'utf8', stdio: capture || input ? 'pipe' : 'inherit', env, input });
  if (check && r.status !== 0) {
    const detail = capture ? (r.stderr || r.stdout || '').trim() : '';
    throw new DeployError(`\`${cmd} ${cmdArgs.join(' ')}\` failed${detail ? `: ${detail}` : ''}`);
  }
  return r;
}

const patterns = (file) =>
  existsSync(file)
    ? readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    : [];

// ── what goes out ───────────────────────────────────────────────────────────
function draftSlugs() {
  const out = new Set();
  for (const d of readdirSync(join(ROOT, 'games'), { withFileTypes: true })) {
    const meta = join(ROOT, 'games', d.name, 'game.json');
    if (!d.isDirectory() || !existsSync(meta)) continue;
    try {
      if (JSON.parse(readFileSync(meta, 'utf8')).draft) out.add(d.name);
    } catch {
      out.add(d.name); // unreadable metadata: don't publish it
    }
  }
  return out;
}

function filesToPublish() {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  const drafts = draftSlugs();
  return listed.filter((rel) => {
    if (!publishable(rel, drafts)) return false;
    const abs = join(ROOT, rel);
    return existsSync(abs) && !lstatSync(abs).isSymbolicLink();
  });
}

// ── staging and scanning ────────────────────────────────────────────────────
function clearSite(dest) {
  for (const name of readdirSync(dest)) if (name !== '.git') rmSync(join(dest, name), { recursive: true, force: true });
}

/** Build the public copy in `dest`. Throws DeployError if anything shouldn't go out. */
function stage(dest = SITE) {
  const home = homedir();
  clearSite(dest);
  let total = 0;
  const files = filesToPublish();
  for (const rel of files) {
    const src = join(ROOT, rel);
    const size = statSync(src).size;
    if (size > MAX_FILE) throw new DeployError(`${rel} is ${(size / 1e6).toFixed(0)} MB, over the 50 MB limit`);
    const out = join(dest, rel);
    mkdirSync(dirname(out), { recursive: true });
    const buf = readFileSync(src);
    const text = buf.toString('utf8');
    if (!text.includes('�') && text.includes(home)) writeFileSync(out, text.split(home).join('~'));
    else cpSync(src, out);
    total += size;
  }
  if (total > MAX_SITE) throw new DeployError(`the site would be ${(total / 1e6).toFixed(0)} MB, over GitHub Pages' limit`);
  writeFileSync(join(dest, '.nojekyll'), '');

  const deny = patterns(join(ROOT, '.publish-deny'));
  const problems = [];
  const walk = (dir) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (d.name === '.git') continue;
      const p = join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else {
        const text = readFileSync(p).toString('latin1'); // any encoding; ASCII survives as-is
        const rel = p.slice(dest.length + 1);
        for (const [rx, what] of SECRETS) for (const m of text.matchAll(rx)) problems.push(`${rel}: ${what} (${m[0].slice(0, 40)})`);
        const low = text.toLowerCase();
        for (const pat of deny) if (low.includes(pat.toLowerCase())) problems.push(`${rel}: a pattern from .publish-deny (${pat.slice(0, 3)}…)`);
      }
    }
  };
  walk(dest);
  if (problems.length) throw new DeployError(`found things that shouldn't be public:\n  ${problems.slice(0, 40).join('\n  ')}`);
  return { count: files.length, total };
}

// ── git and GitHub ──────────────────────────────────────────────────────────
const repoExists = () => run('gh', ['repo', 'view', REPO, '--json', 'name'], { capture: true, check: false }).status === 0;

function ensureCheckout() {
  if (!existsSync(join(SITE, '.git'))) {
    if (!repoExists()) throw new DeployError(`${REPO} doesn't exist yet. Run: npm run deploy -- --setup`);
    const hasMain = run('git', ['ls-remote', '--heads', REMOTE, 'main'], { capture: true, check: false });
    if (hasMain.status === 0 && hasMain.stdout.trim()) run('git', ['clone', '-q', REMOTE, SITE]);
    else {
      mkdirSync(SITE, { recursive: true });
      run('git', ['init', '-q', '-b', 'main'], { cwd: SITE });
      run('git', ['remote', 'add', 'origin', REMOTE], { cwd: SITE });
    }
  }
  run('git', ['config', 'user.email', NOREPLY], { cwd: SITE });
  run('git', ['config', 'user.name', 'richardtape'], { cwd: SITE });
  run('git', ['fetch', '-q', 'origin'], { cwd: SITE, capture: true, check: false });
  if (run('git', ['rev-parse', '--verify', '-q', 'origin/main'], { cwd: SITE, capture: true, check: false }).status === 0) {
    run('git', ['reset', '-q', '--hard', 'origin/main'], { cwd: SITE }); // contents are regenerated anyway
  }
}

function ensurePages() {
  if (run('gh', ['api', `repos/${REPO}/pages`], { capture: true, check: false }).status === 0) return;
  run('gh', ['api', '-X', 'POST', `repos/${REPO}/pages`, '-f', 'source[branch]=main', '-f', 'source[path]=/'], { capture: true });
  console.log('switched on GitHub Pages');
}

function commitMessage(changed) {
  const games = [...new Set(changed.map((p) => p.match(/^games\/([^/]+)\//)?.[1]).filter(Boolean))];
  const subject = games.length ? `Deploy ${games.join(', ')}` : "Update Claude's Games";
  return `${subject}\n\n${changed.length} file(s) changed. Generated by scripts/deploy.mjs from the local workspace.\n\nCo-Authored-By: ${CO_AUTHOR}\n`;
}

// ── main ────────────────────────────────────────────────────────────────────
try {
  if (args.has('--setup')) {
    if (!repoExists()) {
      run('gh', ['repo', 'create', REPO, '--public', '--homepage', SITE_URL, '--description', 'A shelf of small browser games, a new one made by Claude each visit. Deployed by scripts/deploy.mjs.']);
      console.log(`created ${REPO}`);
    }
    ensureCheckout();
    console.log('ready: run `npm run deploy` (the first push also switches GitHub Pages on)');
    process.exit(0);
  }
  if (!patterns(join(ROOT, '.publish-deny')).length) {
    throw new DeployError('.publish-deny is missing or empty. It lists personal details (such as email addresses) that must never be published, one per line. Ask Rich before recreating it.');
  }
  if (!args.has('--skip-checks')) {
    console.log('running tests and the headless check first…');
    run('npm', ['test', '--silent'], { capture: true });
    run('npm', ['run', 'check', '--silent'], { capture: true });
    console.log('tests and check passed');
  }
  if (dryRun && !existsSync(join(SITE, '.git'))) {
    const tmp = mkdtempSync(join(tmpdir(), 'cg-deploy-'));
    const { count, total } = stage(tmp);
    rmSync(tmp, { recursive: true, force: true });
    console.log(`dry run: ${count} files (${(total / 1e6).toFixed(1)} MB), all checks passed (no .site checkout yet)`);
    process.exit(0);
  }
  ensureCheckout();
  const { count, total } = stage();
  run('git', ['add', '-A'], { cwd: SITE });
  const changed = run('git', ['status', '--porcelain'], { cwd: SITE, capture: true }).stdout.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, ''));
  console.log(`staged ${count} files (${(total / 1e6).toFixed(1)} MB); ${changed.length} changed`);
  if (dryRun) {
    changed.slice(0, 40).forEach((l) => console.log(`  ${l}`));
    run('git', ['reset', '-q'], { cwd: SITE });
    console.log('dry run: nothing committed');
    process.exit(0);
  }
  if (!changed.length) {
    console.log('nothing to deploy; the site is up to date');
    process.exit(0);
  }
  const env = { ...process.env, GIT_AUTHOR_EMAIL: NOREPLY, GIT_COMMITTER_EMAIL: NOREPLY, GIT_AUTHOR_NAME: 'richardtape', GIT_COMMITTER_NAME: 'richardtape' };
  run('git', ['commit', '-q', '-F', '-'], { cwd: SITE, env, input: commitMessage(changed) });
  run('git', ['push', '-q', '-u', 'origin', 'main'], { cwd: SITE });
  ensurePages();
  console.log(`deployed: ${SITE_URL} (GitHub Pages usually updates within a minute or two)`);
  console.log('once it has built, confirm it with: npm run verify-live');
} catch (e) {
  if (!(e instanceof DeployError)) throw e;
  console.error(`deploy stopped: ${e.message}`);
  process.exit(1);
}
