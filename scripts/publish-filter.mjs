// Which repo-relative paths may go on the public site. Pure, so it can be tested.
// Existence and symlink checks stay in deploy.mjs.
export function publishable(rel, drafts) {
  const parts = rel.split('/');
  if (parts.some((p) => p.startsWith('.'))) return false; // dotfiles and dot-folders stay local
  if (parts[0] === 'docs') return false; // specs, plans, relay log
  if (parts[0] === 'games' && drafts.has(parts[1])) return false; // draft games
  return true;
}
