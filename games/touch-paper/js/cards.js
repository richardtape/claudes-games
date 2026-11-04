// Card faces and backs as HTML. Suits are an inline SVG sprite (no emoji fallbacks).
import { RANKS } from './data.js';
import { isWild, rankOf, suitOf } from './engine.js';

const PATHS = [
  // hearts
  '<path d="M50 90C22 68 5 51 5 31 5 15 17 5 30 5c9 0 16 5 20 13 4-8 11-13 20-13 13 0 25 10 25 26 0 20-17 37-45 59z"/>',
  // diamonds
  '<path d="M50 3l37 47-37 47-37-47z"/>',
  // clubs
  '<circle cx="50" cy="28" r="19"/><circle cx="27" cy="57" r="19"/><circle cx="73" cy="57" r="19"/><path d="M45 52c0 20-4 32-14 43h38c-10-11-14-23-14-43z"/>',
  // spades
  '<path d="M50 4c12 20 42 34 42 57 0 14-11 23-22 23-7 0-13-4-16-9 1 9 5 15 13 20H33c8-5 12-11 13-20-3 5-9 9-16 9-11 0-22-9-22-23C8 38 38 24 50 4z"/>',
];

export function suitSprite() {
  if (document.getElementById('tp-suits')) return;
  const div = document.createElement('div');
  div.innerHTML = `<svg id="tp-suits" width="0" height="0" style="position:absolute" aria-hidden="true">
    ${PATHS.map((p, i) => `<symbol id="suit-${i}" viewBox="0 0 100 100">${p}</symbol>`).join('')}
    <symbol id="sparkler" viewBox="0 0 100 100"><path d="M48 96l4-58" stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"/>
      <g stroke="currentColor" stroke-width="3" stroke-linecap="round">${Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const r1 = 8;
        const r2 = i % 2 ? 22 : 32;
        return `<line x1="${52 + Math.cos(a) * r1}" y1="${30 + Math.sin(a) * r1}" x2="${52 + Math.cos(a) * r2}" y2="${30 + Math.sin(a) * r2}"/>`;
      }).join('')}</g></symbol>
  </svg>`;
  document.body.prepend(div.firstElementChild);
}

export const pip = (suit, cls = 'pip') => `<svg class="${cls}" aria-hidden="true"><use href="#suit-${suit}"/></svg>`;

export function cardName(c) {
  if (isWild(c)) return 'Sparkler (anything follows it)';
  const r = rankOf(c);
  const names = { 1: 'Ace', 11: 'Jack', 12: 'Queen', 13: 'King' };
  return `${names[r] || r} of ${['hearts', 'diamonds', 'clubs', 'spades'][suitOf(c)]}`;
}

/** The face of a card (inner HTML for a .card element). */
export function faceHTML(c) {
  if (isWild(c)) {
    return `<div class="face wild"><svg class="spark-art" aria-hidden="true"><use href="#sparkler"/></svg><span class="wild-label">Sparkler</span></div>`;
  }
  const s = suitOf(c);
  const r = RANKS[rankOf(c) - 1];
  return `<div class="face s${s}${c >= 200 ? ' spare' : ''}"><span class="rank">${r}</span>${pip(s, 'pip')}${pip(s, 'pip big')}</div>`;
}

export const backHTML = () => `<div class="back"><span class="roundel"></span></div>`;

/** A small shell tube for the rack. */
export function tubeHTML(c, i) {
  const s = suitOf(c);
  const r = RANKS[rankOf(c) - 1];
  return `<div class="tube s${s}" style="--i:${i}"><span class="t-rank">${r}</span>${pip(s, 't-pip')}</div>`;
}
