// A 5x7 cross-stitch alphabet. Every '#' is one X stitch. Used for the title, the score and
// the inscription on the finished sampler, as SVG (DOM) or straight onto a canvas.

const G = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ':': ['.', '.', '#', '.', '#', '.', '.'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  ',': ['.', '.', '.', '.', '.', '#', '#'],
  "'": ['#', '#', '.', '.', '.', '.', '.'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '-': ['...', '...', '...', '###', '...', '...', '...'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '×': ['.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '♥': ['.....', '.#.#.', '#####', '#####', '.###.', '..#..', '.....'],
  ' ': ['..', '..', '..', '..', '..', '..', '..'],
};

const glyph = (ch) => G[ch] || G[ch.toUpperCase()] || G[' '];

/** Cells for a line of text: { cols, rows: 7, cells: [[col, row], ...] } with 1 blank column between glyphs. */
export function layout(text) {
  const cells = [];
  let col = 0;
  for (const ch of String(text)) {
    const g = glyph(ch);
    g.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === '#') cells.push([col + c, r]);
    });
    col += g[0].length + 1;
  }
  return { cols: Math.max(0, col - 1), rows: 7, cells };
}

/**
 * Inline SVG of stitched text. `cell` is the px size of one stitch. `shade` is the darker
 * under-stroke colour (the first leg of each X), `color` the top leg.
 */
export function stitchSVG(text, { cell = 6, color = '#e1a83a', shade = null, label = text, className = '' } = {}) {
  const { cols, rows, cells } = layout(text);
  const w = cols * cell;
  const h = rows * cell;
  const inset = cell * 0.16;
  const sw = (cell * 0.3).toFixed(2);
  const under = shade || color;
  let a = '';
  let b = '';
  for (const [c, r] of cells) {
    const x0 = (c * cell + inset).toFixed(1);
    const y0 = (r * cell + inset).toFixed(1);
    const x1 = ((c + 1) * cell - inset).toFixed(1);
    const y1 = ((r + 1) * cell - inset).toFixed(1);
    a += `M${x0} ${y1}L${x1} ${y0}`;
    b += `M${x0} ${y0}L${x1} ${y1}`;
  }
  return `<svg class="stitched ${className}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${String(label).replace(/"/g, '&quot;')}"><path d="${a}" stroke="${under}" stroke-width="${sw}" stroke-linecap="round" fill="none"/><path d="${b}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" fill="none"/></svg>`;
}

/** Draw stitched text centred on (x, y) on a canvas. Returns its width. */
export function stitchCanvas(ctx, text, x, y, cell, color, { shade = null, align = 'center' } = {}) {
  const { cols, rows, cells } = layout(text);
  const w = cols * cell;
  const ox = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const oy = y - (rows * cell) / 2;
  const inset = cell * 0.16;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = cell * 0.3;
  for (const [pass, col] of [
    [0, shade || color],
    [1, color],
  ]) {
    ctx.strokeStyle = col;
    ctx.beginPath();
    for (const [c, r] of cells) {
      const x0 = ox + c * cell + inset;
      const y0 = oy + r * cell + inset;
      const x1 = ox + (c + 1) * cell - inset;
      const y1 = oy + (r + 1) * cell - inset;
      if (pass === 0) {
        ctx.moveTo(x0, y1);
        ctx.lineTo(x1, y0);
      } else {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
  return w;
}
