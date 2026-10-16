// Game-feel helpers ("juice"): floating numbers, screen shake, count-ups, toasts.
// Each injects a small default style once; restyle with your own CSS on the class names
// (cg-float, cg-shake, cg-toast) or pass extra classes.
//
//   floatText(tileEl, '+20', { className: 'ink' });
//   shake(boardEl, 2);
//   countUp(scoreEl, 120, 480, { ms: 600 });
//   toast('Saved!');
import { reducedMotion } from './arcade.js';

const CSS = `
.cg-fx-layer{position:fixed;inset:0;pointer-events:none;z-index:1000;overflow:hidden}
.cg-float{position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font-weight:800;font-size:22px;
  text-shadow:0 2px 0 rgba(0,0,0,.45);animation:cg-float .9s ease-out forwards}
@keyframes cg-float{0%{opacity:0;transform:translate(-50%,-20%) scale(.8)}15%{opacity:1;transform:translate(-50%,-70%) scale(1.1)}
  100%{opacity:0;transform:translate(-50%,-190%) scale(1)}}
.cg-shake{animation:cg-shake .28s linear}
@keyframes cg-shake{20%{transform:translate(calc(-4px*var(--cg-s,1)),calc(2px*var(--cg-s,1)))}
  40%{transform:translate(calc(4px*var(--cg-s,1)),calc(-2px*var(--cg-s,1)))}
  60%{transform:translate(calc(-3px*var(--cg-s,1)),calc(1px*var(--cg-s,1)))}
  80%{transform:translate(calc(2px*var(--cg-s,1)),calc(-1px*var(--cg-s,1)))}}
.cg-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:1001;padding:10px 16px;border-radius:8px;
  background:#fff;color:#111;font:15px/1.3 system-ui,sans-serif;box-shadow:0 10px 24px rgba(0,0,0,.45);animation:cg-in .2s ease}
@keyframes cg-in{from{opacity:0}}
@media (prefers-reduced-motion: reduce){.cg-float,.cg-shake,.cg-toast{animation-duration:.01ms}}`;

let layer = null;
function ensure() {
  if (!document.getElementById('cg-juice-style')) {
    const s = document.createElement('style');
    s.id = 'cg-juice-style';
    s.textContent = CSS;
    document.head.prepend(s); // prepend so game CSS wins
  }
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.className = 'cg-fx-layer';
    document.body.append(layer);
  }
  return layer;
}

/** Text that pops up from an element (or {x, y} viewport point) and fades away. */
export function floatText(target, text, { className = '', ms = 1300 } = {}) {
  if (!target) return null;
  const root = ensure();
  let x;
  let y;
  if (target instanceof Element) {
    const r = target.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top;
  } else ({ x, y } = target);
  const el = document.createElement('div');
  el.className = `cg-float ${className}`.trim();
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  root.append(el);
  setTimeout(() => el.remove(), ms);
  return el;
}

/** Shake an element. strength 1 = subtle, 3 = big hit. Skipped under reduced motion. */
export function shake(el, strength = 1) {
  if (!el || reducedMotion()) return;
  ensure();
  el.classList.remove('cg-shake');
  void el.offsetWidth; // restart the animation
  el.style.setProperty('--cg-s', strength);
  el.classList.add('cg-shake');
}

/** Briefly re-trigger a CSS class (e.g. a "bump" scale) on an element. */
export function pulse(el, className = 'bump', ms = 90) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  setTimeout(() => el.classList.remove(className), ms);
}

/** Animate a number in an element's text from `from` to `to` with ease-out. */
export function countUp(el, from, to, { ms = 600, format = (n) => Math.round(n).toLocaleString('en-US') } = {}) {
  if (!el) return;
  if (reducedMotion() || ms <= 1) {
    el.textContent = format(to);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = format(from + (to - from) * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

let toastTimer = 0;
/** One short status message at the bottom of the screen (replaces any current one). */
export function toast(message, { ms = 2200, className = '' } = {}) {
  ensure();
  document.querySelector('.cg-toast')?.remove();
  const t = document.createElement('div');
  t.className = `cg-toast ${className}`.trim();
  t.setAttribute('role', 'status');
  t.textContent = message;
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
  return t;
}

/** Promise that resolves after `ms` (resolves immediately when `skip()` returns true). */
export const sleep = (ms, skip = () => false) => new Promise((r) => setTimeout(r, skip() ? 0 : ms));
