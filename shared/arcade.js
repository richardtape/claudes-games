// Arcade glue every game should use: namespaced storage, stats the front page can show,
// a link home, and the ready signal + debug hook used by `npm run check` and Chrome testing.

const PREFIX = 'cg:';

/** Namespaced localStorage that never throws (private mode, blocked storage, quota). */
export function store(slug) {
  const k = (key) => `${PREFIX}${slug}:${key}`;
  return {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(k(key));
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(k(key), JSON.stringify(value));
      } catch {
        /* storage unavailable: play on without saving */
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(k(key));
      } catch {}
    },
  };
}

/** Stats shown on the arcade front page: { plays, best, bestLabel, lastPlayed }. */
export function loadStats(slug) {
  return store(slug).get('stats', { plays: 0, best: null, bestLabel: '', lastPlayed: null });
}

/** Call once when a game/run starts. */
export function recordPlay(slug) {
  const s = loadStats(slug);
  s.plays = (s.plays || 0) + 1;
  s.lastPlayed = new Date().toISOString();
  store(slug).set('stats', s);
  return s;
}

/**
 * Offer a new score. Keeps it if it beats the stored best.
 * `label` is how the front page shows it, e.g. "12,340 pts" or "Edition 4".
 * Pass { lowerIsBetter: true } for golf-style scores (times, moves).
 */
export function recordBest(slug, value, label = String(value), { lowerIsBetter = false } = {}) {
  const s = loadStats(slug);
  const better = s.best === null || (lowerIsBetter ? value < s.best : value > s.best);
  if (better) {
    s.best = value;
    s.bestLabel = label;
    store(slug).set('stats', s);
  }
  return better;
}

/**
 * Small "back to the arcade" link. Pinned top-left by default; pass `parent` to place it
 * inside your own layout instead. Restyle with the CSS custom properties
 * --cg-home-bg, --cg-home-fg, --cg-home-font.
 */
export function homeLink({ parent = null, label = 'Arcade' } = {}) {
  if (!document.getElementById('cg-home-style')) {
    const style = document.createElement('style');
    style.id = 'cg-home-style';
    style.textContent = `
      .cg-home{display:inline-flex;align-items:center;gap:.35em;padding:.4em .75em;border-radius:999px;
        font:600 13px/1 var(--cg-home-font, system-ui, sans-serif);text-decoration:none;
        color:var(--cg-home-fg,#fff);background:var(--cg-home-bg,rgba(0,0,0,.45));
        backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);z-index:1000}
      .cg-home.cg-fixed{position:fixed;top:max(10px, env(safe-area-inset-top));left:max(10px, env(safe-area-inset-left))}
      .cg-home:hover{filter:brightness(1.15)}
      .cg-home:focus-visible{outline:2px solid currentColor;outline-offset:2px}`;
    document.head.append(style);
  }
  const a = document.createElement('a');
  a.className = 'cg-home' + (parent ? '' : ' cg-fixed');
  a.href = new URL('../', import.meta.url).href; // repo root, wherever it is served
  a.innerHTML = `<span aria-hidden="true">‹</span> ${label}`;
  (parent || document.body).append(a);
  return a;
}

/**
 * Signal that the game is interactive. `debug` becomes window.__game — expose state and
 * cheat/test helpers there (e.g. setHand, skipLevel, prepareThumbnail) so automated checks
 * and Chrome testing can drive the game without pixel-hunting.
 */
export function markReady(debug = {}) {
  window.__game = debug;
  document.documentElement.dataset.ready = '1';
}

export const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Calls `cb` when the tab is hidden or the window loses focus (pause your loop here). */
export function onHidden(cb) {
  document.addEventListener('visibilitychange', () => document.hidden && cb());
  window.addEventListener('blur', cb);
}
