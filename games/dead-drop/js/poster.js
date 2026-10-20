// The case file as a poster: a 1200 × 1600 canvas drawn from the same data as the end screen (posterData, with the
// label, sub and labels main.js adds), saved as a PNG. DOM and canvas only: it reads no main.js state. Silhouettes are
// Images made from the art's SVG text; one that fails to load leaves its slip's text alone. Fonts are awaited first.
import { CITY } from './data.js';
import { evidenceSlips } from './loop-ui.js';

export const POSTER_W = 1200;
export const POSTER_H = 1600;
const DISPLAY = '"League Gothic", Oswald, Impact, "Arial Narrow", sans-serif';
const TYPE = '"Courier Prime", "Courier New", ui-monospace, monospace';
const DEG = Math.PI / 180;

/** A colour from style.css's :root (the poster keeps the screen's inks), or `fallback` off the page. */
const cssVar = (name, fallback) => {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
};

/**
 * An <img> of an art SVG (agentSVG's text): `currentColor` becomes `color`, the `.ac` accent shapes `accent`, drawn at
 * `size` px square (so the vector is rasterised at the size it's drawn). Rejects when the image fails to load.
 */
export function svgImage(svg, { color = '#1d1a17', accent = color, size = 192 } = {}) {
  return new Promise((resolve, reject) => {
    const text = String(svg)
      .replace(/currentColor/g, color)
      .replace(/<svg\b([^>]*)>/, `<svg$1 width="${size}" height="${size}"><style>.ac{fill:${accent}}</style>`);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('the silhouette did not load'));
    img.src = `data:image/svg+xml;utf8,${encodeURIComponent(text)}`;
  });
}

/** Both faces, loaded and ready (they're on the page already, but a poster drawn before the screen paints waits for them). */
async function fontsReady() {
  try {
    await Promise.all([document.fonts.load(`220px ${DISPLAY}`), document.fonts.load(`700 26px ${TYPE}`), document.fonts.load(`26px ${TYPE}`)]);
    await document.fonts.ready;
  } catch {
    // Fallback faces draw the same poster, a little plainer.
  }
}

/** A small seeded generator, so a match's poster comes out the same every time it's saved. */
function seeded(text) {
  let s = 7;
  for (const ch of String(text)) s = (s * 31 + ch.charCodeAt(0)) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Greedy word wrap of `text` into lines no wider than `maxW` in the current font. */
function wrap(g, text, maxW) {
  const lines = [];
  let line = '';
  // Split on plain spaces only, so a no-break space holds "round 3" together.
  for (const word of String(text).split(/ +/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > maxW) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** `text` cut to fit `maxW` in the current font, ending in an ellipsis when it had to be. */
function clip(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && g.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

const setSpacing = (g, px) => {
  if ('letterSpacing' in g) g.letterSpacing = `${px}px`;
};

/**
 * Hand-cut type: each letter of `text` nudged and tilted a little (as main.js's jitter() does on screen), from `x` on
 * the baseline `y`. Returns the width it took.
 */
function cutText(g, text, x, y, size, rnd, { spacing = 0 } = {}) {
  let at = x;
  for (const ch of text) {
    const w = g.measureText(ch).width;
    const r = (rnd() - 0.5) * 7 * DEG;
    const dy = (rnd() - 0.5) * 0.12 * size;
    g.save();
    g.translate(at + w / 2, y + dy);
    g.rotate(r);
    g.fillText(ch, -w / 2, 0);
    g.restore();
    at += w + spacing;
  }
  return at - x - spacing;
}
const cutWidth = (g, text, spacing = 0) => [...text].reduce((w, ch) => w + g.measureText(ch).width + spacing, 0) - spacing;

/** One film frame (the screen's .fr): ink with sprocket holes along both edges, its window in `fill` once earned. */
function frame(g, x, y, s, fill, perf) {
  g.fillStyle = '#1d1a17';
  g.fillRect(x, y, s, s);
  g.fillStyle = perf;
  const hole = Math.max(2, s * 0.12);
  for (let hx = x + s * 0.08; hx < x + s - hole; hx += hole * 2) {
    g.fillRect(hx, y + s * 0.06, hole, hole * 0.9);
    g.fillRect(hx, y + s - s * 0.06 - hole * 0.9, hole, hole * 0.9);
  }
  g.fillStyle = fill ?? 'rgba(240, 226, 196, 0.16)';
  g.fillRect(x + s * 0.12, y + s * 0.26, s * 0.76, s * 0.48);
}

/** A seat's strips of film as a row of frames centred on `cx`, its top at `y`. */
function reelRow(g, data, seat, cx, y, s, colour, perf) {
  if (!(data.reel > 0)) return 0;
  const gap = Math.round(s * 0.12);
  const w = data.reel * s + (data.reel - 1) * gap;
  for (let i = 0; i < data.reel; i++) frame(g, cx - w / 2 + i * (s + gap), y, s, i < data.strips[seat] ? colour : null, perf);
  return s;
}

/** A path through `pts` ([x, y, ...]). */
function poly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
}

/**
 * The case file as a poster (1200 × 1600): the folder in manila on the mustard table, over Saul Bass bars in the
 * winner's colour; the typed label; the stamp (Closed or Burned) rotated −6° in signal red; the heading in cut type;
 * the score in League Gothic at 220px (two seats) or at a size that fits every seat (three and four), with film
 * frames; the round strip as rows; the evidence slips with their silhouettes (or their text alone when an image
 * fails: `breakArt` makes every image fail, for a check); the names and date at the foot; and the game and its
 * address small at the bottom edge. `colours` is each seat's ink, by seat. The canvas carries `dataset.stamp` and
 * `dataset.folder` ("x,y": a pixel of solid stamp ink and one of bare folder) for a check.
 */
export async function drawPoster(data, { colours = [], agentSVG = () => '', breakArt = false } = {}) {
  await fontsReady();
  const ink = cssVar('--ink', '#1d1a17');
  const paper = cssVar('--paper', '#f0e2c4');
  const paper2 = cssVar('--paper-2', '#cdb98f');
  const manila = cssVar('--manila', '#e9d39c');
  const mustard = cssVar('--mustard', '#e0a030');
  const red = cssVar('--red', '#c8321f');
  const slipPaper = '#f7efd9';
  const perf = 'rgba(240, 226, 196, 0.72)';
  const colour = (s) => colours[s] ?? [red, '#1e6a6e', '#2c4f9e', '#6b2a5a'][s] ?? ink;
  const name = (s) => data.labels?.[s] ?? data.names[s];
  const closed = data.neutral || data.won;

  const canvas = document.createElement('canvas');
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  const g = canvas.getContext('2d');
  g.textBaseline = 'alphabetic';

  // The silhouettes, loaded together; one that fails is null, and its slip says its text alone.
  const slips = evidenceSlips(data, { neutral: !!data.neutral });
  const arts = await Promise.all(
    slips.map((e) =>
      e.art
        ? svgImage(breakArt ? '<svg' : agentSVG(e.art), { color: ink, accent: e.accent === null ? paper2 : colour(e.accent), size: 180 }).catch(() => null)
        : Promise.resolve(null),
    ),
  );

  // Painted twice when the match is short: the first pass finds the room to spare, the second shares it between the
  // gaps (above the score, above the rounds, above the slips and under them), so a short file doesn't leave a hole.
  // Each pass seeds its own jitter, so both draw the same letters.
  let spots;
  const paint = (gap) => {
    const rnd = seeded(`${data.matchId ?? ''}:${data.title}`);
    // ── the table: mustard, its grain, and the bars running behind the folder ──
    g.fillStyle = mustard;
    g.fillRect(0, 0, POSTER_W, POSTER_H);
    const glow = g.createRadialGradient(240, 160, 0, 240, 160, 900);
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, POSTER_W, POSTER_H);
    const shade = g.createRadialGradient(1020, 1380, 0, 1020, 1380, 900);
    shade.addColorStop(0, 'rgba(120, 70, 0, 0.18)');
    shade.addColorStop(1, 'rgba(120, 70, 0, 0)');
    g.fillStyle = shade;
    g.fillRect(0, 0, POSTER_W, POSTER_H);
    const barColour = data.winner === null || data.winner === undefined ? ink : colour(data.winner);
    g.save();
    g.translate(POSTER_W / 2, POSTER_H / 2);
    g.rotate(-14 * DEG);
    for (const [y, h, c] of [
      [-760, 120, ink],
      [-610, 54, barColour],
      [420, 150, barColour],
      [600, 46, ink],
      [690, 26, paper],
    ]) {
      g.fillStyle = c;
      g.fillRect(-1100, y, 2200, h);
    }
    g.restore();

    // ── the folder: manila, its tab, a hand-cut edge and a crease under the tab ──
    const fx0 = 70;
    const fx1 = 1130;
    const fy0 = 104;
    const fy1 = 1496;
    const folder = [fx0, fy0, 352, fy0, 386, fy0 - 40, 676, fy0 - 40, 708, fy0, fx1, fy0 + 5, fx1 - 7, fy1, fx0 + 5, fy1 - 12];
    g.save();
    g.translate(0, 18);
    poly(g, folder);
    g.fillStyle = 'rgba(0, 0, 0, 0.2)';
    g.fill();
    g.restore();
    poly(g, folder);
    g.fillStyle = manila;
    g.fill();
    // Paper grain: faint specks, a few units either way.
    g.save();
    poly(g, folder);
    g.clip();
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(120, 80, 20, 0.05)' : 'rgba(255, 255, 255, 0.07)';
      g.fillRect(fx0 + rnd() * (fx1 - fx0), fy0 - 40 + rnd() * (fy1 - fy0 + 40), 1 + rnd() * 2.5, 1 + rnd() * 2.5);
    }
    g.fillStyle = 'rgba(80, 50, 10, 0.07)';
    g.fillRect(fx0, fy0 + 22, fx1 - fx0, 3);
    g.restore();
    const folderSpot = [fx0 + 22, Math.round((fy0 + fy1) / 2)];

    const px = 128;
    const xr = 1072;
    const width = xr - px;
    let y = fy0 + 46;

    // ── the label: typed on a paper strip stuck to the folder ──
    let labelSize = 26;
    g.font = `700 ${labelSize}px ${TYPE}`;
    while (labelSize > 18 && g.measureText(data.label ?? '').width > width - 36) {
      labelSize -= 1;
      g.font = `700 ${labelSize}px ${TYPE}`;
    }
    const labelLines = wrap(g, data.label ?? '', width - 36).slice(0, 2);
    const labelW = Math.max(...labelLines.map((l) => g.measureText(l).width), 0) + 36;
    const labelH = labelLines.length * (labelSize + 8) + 22;
    g.save();
    g.translate(px - 18, y);
    g.rotate(-0.5 * DEG);
    g.fillStyle = 'rgba(0, 0, 0, 0.12)';
    g.fillRect(3, 4, labelW, labelH);
    g.fillStyle = slipPaper;
    g.fillRect(0, 0, labelW, labelH);
    g.fillStyle = ink;
    labelLines.forEach((l, i) => g.fillText(l, 18, 14 + labelSize + i * (labelSize + 8) - 4));
    g.restore();
    y += labelH + 30;

    // ── the stamp's size, so the heading keeps clear of it ──
    const stampText = closed ? 'CLOSED' : 'BURNED';
    const stampSize = 116;
    g.font = `${stampSize}px ${DISPLAY}`;
    const stampTextW = cutWidth(g, stampText, 12);
    const stampW = stampTextW + 64;
    const stampH = stampSize * 0.86 + 44;

    // ── the heading, in cut type, red when the file is closed ──
    const headW = width - stampW - 24;
    let headSize = 124;
    let headLines;
    for (;;) {
      g.font = `${headSize}px ${DISPLAY}`;
      headLines = wrap(g, data.title.toUpperCase(), headW);
      const widest = Math.max(...headLines.map((l) => cutWidth(g, l, 1)));
      if ((widest <= headW && headLines.length <= 2) || headSize <= 84) break;
      headSize -= 6;
    }
    const headTop = y;
    g.fillStyle = closed ? red : ink;
    headLines.forEach((l, i) => cutText(g, l, px, y + headSize * 0.8 + i * headSize * 0.9, headSize, rnd, { spacing: 1 }));
    y += headSize * 0.8 + (headLines.length - 1) * headSize * 0.9 + 28;
    // The stamp beside the heading, centred on it; a one-line heading makes room under it for the stamp's tilt.
    const stampCx = xr - stampW / 2 + 6;
    const reach = stampH / 2 + Math.sin(6 * DEG) * (stampW / 2) + 4;
    const stampCy = headTop + Math.max(reach - 14, (y - 28 - headTop) / 2);
    y = Math.max(y, stampCy + reach + 18);

    // ── the sub, typed, and the coda under it ──
    g.font = `26px ${TYPE}`;
    g.fillStyle = ink;
    for (const text of [data.sub, data.coda].filter(Boolean)) {
      // The last two words keep together, so no line is a lone "2.".
      for (const l of wrap(g, text.replace(/ (\S+)$/, '\u00a0$1'), width)) {
        y += 32;
        g.fillText(l, px, y);
      }
      y += 6;
    }
    y += 28 + gap;

    // ── the score: every seat's score in cut type over its film frames ──
    const n = data.order.length;
    if (n === 2) {
      const [a, b] = data.order;
      let size = 220;
      const nameFont = (s) => `700 ${Math.round(s * 0.16)}px ${TYPE}`;
      const measure = () => {
        g.font = nameFont(size);
        const na = g.measureText(name(a)).width;
        const nb = g.measureText(name(b)).width;
        const to = g.measureText('to').width;
        g.font = `${size}px ${DISPLAY}`;
        const sa = cutWidth(g, String(data.scores[a]), 4);
        const sb = cutWidth(g, String(data.scores[b]), 4);
        return { na, nb, to, sa, sb, gap: size * 0.12, total: na + sa + to + sb + nb + size * 0.12 * 4 };
      };
      let m = measure();
      while (m.total > width && size > 120) {
        size -= 10;
        m = measure();
      }
      const base = y + size * 0.78;
      const frameS = Math.round(size * 0.2);
      let x = px;
      g.fillStyle = ink;
      g.font = nameFont(size);
      g.fillText(clip(g, name(a), m.na), x, base);
      x += m.na + m.gap;
      g.font = `${size}px ${DISPLAY}`;
      g.fillStyle = colour(a);
      cutText(g, String(data.scores[a]), x, base, size, rnd, { spacing: 4 });
      reelRow(g, data, a, x + m.sa / 2, base + size * 0.1, frameS, colour(a), perf);
      x += m.sa + m.gap;
      g.fillStyle = ink;
      g.font = nameFont(size);
      g.fillText('to', x, base);
      x += m.to + m.gap;
      g.font = `${size}px ${DISPLAY}`;
      g.fillStyle = colour(b);
      cutText(g, String(data.scores[b]), x, base, size, rnd, { spacing: 4 });
      reelRow(g, data, b, x + m.sb / 2, base + size * 0.1, frameS, colour(b), perf);
      x += m.sb + m.gap;
      g.fillStyle = ink;
      g.font = nameFont(size);
      g.fillText(name(b), x, base);
      y = base + size * 0.1 + (data.reel > 0 ? frameS : 0) + 30 + gap;
    } else {
      const gap = 22;
      const colW = (width - gap * (n - 1)) / n;
      const size = n === 3 ? 190 : 150;
      const frameS = n === 3 ? 34 : 28;
      data.order.forEach((s, i) => {
        const x = px + i * (colW + gap);
        const lead = s === data.winner;
        g.fillStyle = colour(s);
        g.fillRect(x, y, colW, lead ? 16 : 8);
        g.fillStyle = ink;
        g.font = `700 26px ${TYPE}`;
        g.fillText(clip(g, name(s), colW), x, y + 52);
        g.font = `${size}px ${DISPLAY}`;
        g.fillStyle = colour(s);
        const base = y + 60 + size * 0.8;
        const sw = cutText(g, String(data.scores[s]), x, base, size, rnd, { spacing: 3 });
        reelRow(g, data, s, x + Math.max(sw, data.reel * frameS * 1.12) / 2, base + 18, frameS, colour(s), perf);
      });
      y += 60 + size * 0.8 + 18 + (data.reel > 0 ? frameS : 0) + 30 + gap;
    }

    // ── the evidence: measured first, filed from the foot up ──
    const footY = fy1 - 44;
    const slipW = (width - 26) / 2;
    const artBox = 84;
    g.font = `20px ${TYPE}`;
    const slipBoxes = slips.map((e, i) => {
      const hasArt = !!arts[i] || !e.art;
      const textX = hasArt ? artBox + 32 : 22;
      const lines = wrap(g, e.text.replace(/ round (\d+)\.$/, ' round\u00a0$1.'), slipW - textX - 16);
      const h = Math.max(112, (e.lead ? 36 : 4) + lines.length * 25 + 30);
      return { e, img: arts[i], hasArt, textX, lines, h };
    });
    const rowsOfSlips = [];
    for (let i = 0; i < slipBoxes.length; i += 2) rowsOfSlips.push(slipBoxes.slice(i, i + 2));
    const slipRowH = rowsOfSlips.map((r) => Math.max(...r.map((b) => b.h)));
    const evH = slipRowH.reduce((t, h) => t + h + 18, 0);
    const evTop = footY - 44 - evH - gap;

    // ── the round strip: one row a round in the winner's colour (operation and points, then cities and how), scaled
    // to the room left; past about seven rounds a row keeps its first line only.
    const rounds = data.rounds;
    const room = evTop - 22 - y;
    const rowH = Math.max(18, Math.min(56, room / Math.max(1, rounds.length)));
    const k = Math.min(1, rowH / 56);
    const two = rowH >= 40;
    const spare = room - rowH * rounds.length;
    rounds.forEach((r, i) => {
      const top = y + i * rowH;
      const line1 = top + (two ? 27 : 30) * k;
      const line2 = top + 49 * k;
      g.fillStyle = r.winner === null ? paper2 : colour(r.winner);
      g.fillRect(px, top + 3 * k, 12, rowH - 9 * k);
      g.fillStyle = ink;
      g.font = `${Math.round(40 * k)}px ${DISPLAY}`;
      g.fillText(String(r.no), px + 28, top + (two ? 36 : 32) * k);
      const left = px + 28 + Math.round(46 * k);
      // The right side first, so the left knows how far it may run.
      g.textAlign = 'right';
      g.font = `${Math.round(32 * k)}px ${DISPLAY}`;
      const pts = r.winner === null ? 'nobody' : `+${r.points} ${name(r.winner)}`;
      g.fillText(pts, xr, line1);
      const ptsW = g.measureText(pts).width;
      g.font = `${Math.round(19 * k)}px ${TYPE}`;
      if (two) g.fillText(r.how, xr, line2);
      const howW = two ? g.measureText(r.how).width : 0;
      g.textAlign = 'left';
      g.font = `${Math.round(30 * k)}px ${DISPLAY}`;
      setSpacing(g, 1);
      g.fillText(clip(g, r.operation, xr - ptsW - 28 - left), left, line1);
      setSpacing(g, 0);
      if (two) {
        // The cities, with a film frame beside the one a strip of film came from; cut short with an ellipsis.
        g.font = `${Math.round(19 * k)}px ${TYPE}`;
        const limit = xr - howW - 28;
        const fs = Math.round(17 * k);
        const strip = r.strip !== null && r.strip !== undefined && r.film !== null && r.film !== undefined;
        let x = left;
        for (let ci = 0; ci < r.cities.length; ci++) {
          const word = `${CITY[r.cities[ci]]?.name ?? r.cities[ci]}${ci < r.cities.length - 1 && !(strip && ci === r.film) ? ',' : ''}`;
          const extra = strip && ci === r.film ? fs + 8 + (ci < r.cities.length - 1 ? g.measureText(',').width : 0) : 0;
          if (x + g.measureText(word).width + extra > limit) {
            g.fillText('…', x, line2);
            break;
          }
          g.fillStyle = ink;
          g.fillText(word, x, line2);
          x += g.measureText(word).width;
          if (strip && ci === r.film) {
            frame(g, x + 5, line2 - fs + 2, fs, colour(r.strip), perf);
            x += fs + 8;
            g.fillStyle = ink;
            if (ci < r.cities.length - 1) {
              g.fillText(',', x - 2, line2);
              x += g.measureText(',').width - 2;
            }
          }
          x += g.measureText(' ').width;
        }
      }
      g.fillStyle = 'rgba(29, 26, 23, 0.14)';
      g.fillRect(px + 28, top + rowH - 2, width - 28, 1.5);
    });

    // ── the evidence slips: paper, taped on, each a little crooked ──
    let sy = evTop;
    rowsOfSlips.forEach((row, ri) => {
      row.forEach((b, ci) => {
        const sx = px + ci * (slipW + 26);
        const tilt = ((ri * 2 + ci) % 2 ? 0.7 : -0.6) * DEG;
        g.save();
        g.translate(sx + slipW / 2, sy + b.h / 2);
        g.rotate(tilt);
        g.translate(-slipW / 2, -b.h / 2);
        g.fillStyle = 'rgba(0, 0, 0, 0.14)';
        g.fillRect(4, 6, slipW, b.h);
        g.fillStyle = slipPaper;
        g.fillRect(0, 0, slipW, b.h);
        // The tape that holds it to the folder.
        g.save();
        g.translate(slipW / 2, 2);
        g.rotate(-2.5 * DEG);
        g.fillStyle = 'rgba(255, 250, 232, 0.62)';
        g.fillRect(-46, -12, 92, 24);
        g.restore();
        if (b.img) {
          g.drawImage(b.img, 18, (b.h - artBox) / 2, artBox, artBox);
          if (b.e.kind === 'takedown') {
            // Struck through in red: this one was taken out.
            g.strokeStyle = red;
            g.lineWidth = 6;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(22, (b.h + artBox) / 2 - 8);
            g.lineTo(18 + artBox - 4, (b.h - artBox) / 2 + 8);
            g.stroke();
          }
        } else if (!b.e.art) {
          const glyph = b.e.kind === 'biggest' ? `+${data.highlights.biggest.points}` : '×2';
          g.fillStyle = b.e.kind === 'escalations quiet' ? paper2 : red;
          g.font = `${b.e.kind === 'biggest' ? 64 : 58}px ${DISPLAY}`;
          g.textAlign = 'center';
          g.fillText(glyph, 18 + artBox / 2, b.h / 2 + 22);
          g.textAlign = 'left';
        }
        // A slip with no lead ("You never went loud.") centres its line.
        let ty = b.e.lead ? 20 : (b.h - (b.lines.length - 1) * 25) / 2 - 15;
        g.fillStyle = ink;
        if (b.e.lead) {
          g.font = `30px ${DISPLAY}`;
          setSpacing(g, 1);
          g.fillText(b.e.lead, b.textX, ty + 26);
          setSpacing(g, 0);
          ty += 36;
        }
        g.font = `20px ${TYPE}`;
        b.lines.forEach((l, li) => g.fillText(l, b.textX, ty + 22 + li * 25));
        g.restore();
      });
      sy += slipRowH[ri] + 18;
    });

    // ── the foot: every seat with its colour, and the date ──
    g.fillStyle = 'rgba(29, 26, 23, 0.3)';
    g.fillRect(px, footY - 32, width, 2);
    g.font = `22px ${TYPE}`;
    g.textAlign = 'right';
    g.fillStyle = ink;
    g.fillText(data.date ?? '', xr, footY);
    const dateW = g.measureText(data.date ?? '').width;
    g.textAlign = 'left';
    let nameSize = 22;
    const namesW = () => data.order.reduce((t, s) => t + 30 + g.measureText(data.names[s]).width + 26, 0);
    g.font = `700 ${nameSize}px ${TYPE}`;
    while (nameSize > 14 && namesW() > width - dateW - 30) {
      nameSize -= 1;
      g.font = `700 ${nameSize}px ${TYPE}`;
    }
    let fx = px;
    for (const s of data.order) {
      g.fillStyle = colour(s);
      g.fillRect(fx, footY - nameSize * 0.78, 20, 20);
      g.fillStyle = ink;
      g.fillText(data.names[s], fx + 30, footY);
      fx += 30 + g.measureText(data.names[s]).width + 26;
    }

    // ── the bottom edge: the game and where to find it ──
    // On an ink slip of its own, so it reads over the bars.
    const credit = 'Dead Drop · richardtape.github.io/claudes-games';
    g.font = `700 22px ${TYPE}`;
    setSpacing(g, 1);
    const creditW = g.measureText(credit).width + 44;
    g.save();
    g.translate(POSTER_W / 2, POSTER_H - 48);
    g.rotate(0.6 * DEG);
    g.fillStyle = ink;
    g.fillRect(-creditW / 2, -24, creditW, 44);
    g.fillStyle = paper;
    g.textAlign = 'center';
    g.fillText(credit, 0, 7);
    g.restore();
    setSpacing(g, 0);
    g.textAlign = 'left';

    // ── the stamp, last: rotated −6°, inked in signal red over whatever it lands on ──
    const st = document.createElement('canvas');
    st.width = Math.ceil(stampW + 40);
    st.height = Math.ceil(stampH + 40);
    const sg = st.getContext('2d');
    sg.translate(20, 20);
    sg.strokeStyle = red;
    sg.lineWidth = 9;
    sg.strokeRect(4.5, 4.5, stampW - 9, stampH - 9);
    sg.lineWidth = 3;
    sg.strokeRect(16, 16, stampW - 32, stampH - 32);
    sg.fillStyle = red;
    sg.font = `${stampSize}px ${DISPLAY}`;
    cutText(sg, stampText, (stampW - stampTextW) / 2, stampH / 2 + stampSize * 0.36, stampSize * 0.4, seeded(stampText), { spacing: 12 });
    // Worn ink: specks where the rubber didn't take (kept off the outer rule, which a check reads).
    sg.globalCompositeOperation = 'destination-out';
    const wear = seeded(`${stampText}:wear`);
    for (let i = 0; i < 260; i++) {
      sg.fillStyle = `rgba(0, 0, 0, ${0.25 + wear() * 0.5})`;
      sg.beginPath();
      sg.arc(16 + wear() * (stampW - 32), 16 + wear() * (stampH - 32), 0.6 + wear() * 2.2, 0, Math.PI * 2);
      sg.fill();
    }
    g.save();
    g.translate(stampCx, stampCy);
    g.rotate(-6 * DEG);
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.92;
    g.drawImage(st, -stampW / 2 - 20, -stampH / 2 - 20);
    g.restore();
    // A point in the middle of the outer rule's left side, turned with the stamp.
    const lx = -stampW / 2 + 4.5;
    spots = { stamp: [stampCx + lx * Math.cos(-6 * DEG), stampCy + lx * Math.sin(-6 * DEG)].map(Math.round), folder: folderSpot };
    return spare;
  };
  const spare = paint(0);
  if (spare > 8) {
    g.clearRect(0, 0, POSTER_W, POSTER_H);
    paint(Math.min(80, spare / 4));
  }
  canvas.dataset.stamp = spots.stamp.join(',');
  canvas.dataset.folder = spots.folder.join(',');
  return canvas;
}

/**
 * Draw the poster and download it as `dead-drop-<matchId>.png` (as Comet Cup's saveSheet does): 'saved', or 'failed'
 * when the drawing threw or the browser gave no picture (toBlob's null).
 */
export async function savePoster(data, opts) {
  let canvas;
  try {
    canvas = await drawPoster(data, opts);
  } catch {
    return 'failed';
  }
  const blob = await new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, 'image/png');
    } catch {
      resolve(null);
    }
  });
  if (!blob) return 'failed';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `dead-drop-${data.matchId ?? 'case-file'}.png`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'saved';
}
