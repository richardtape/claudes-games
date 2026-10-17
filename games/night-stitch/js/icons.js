// Notion icons as 9x9 cross-stitch charts: each letter is a floss colour, '.' is bare linen.

const P = {
  w: '#c48c52', W: '#8f5d30', r: '#b5362f', s: '#c9ced8', S: '#7d8494', k: '#3a3e48', p: '#8a6bb8',
  g: '#6c8d5c', y: '#e1a83a', o: '#c9822b', c: '#a5523a', d: '#6e3322', e: '#f0e6cc', b: '#33478c',
};

const CHARTS = {
  spool: ['.WWWWWWW.', '..wwwww..', '...rrr...', '..rrrrr..', '..rrrrr..', '..rrrrr..', '...rrr...', '..wwwww..', '.WWWWWWW.'],
  needle: ['........s', '.......s.', '......S..', '.....s...', '....S....', '...s.....', '..k......', '.r.......', 'r.r.r....'],
  lavender: ['....p....', '...ppp...', '....p....', '...ppp...', '....p....', '...pgp...', '....g....', '....g....', '...ggg...'],
  beeswax: ['.........', '..yyyyy..', '.yyyyyyy.', '.yoyyyoy.', '.yyyyyyy.', '.yyoyyoy.', '.yyyyyyy.', '..yyyyy..', '.........'],
  thimble: ['...sss...', '..sSsSs..', '..sssss..', '..sSsSs..', '.sssssss.', '.sSsSsSs.', '.sssssss.', 'SSSSSSSSS', '.........'],
  gold: ['.WWWWWWW.', '..wwwww..', '...yyy...', '..yyoyy..', '..yyyyy..', '..yoyyy..', '...yyy...', '..wwwww..', '.WWWWWWW.'],
  cedar: ['.........', '.ccccccc.', '.cdcccdc.', '.ccdcccc.', '.cccdccc.', '.cdcccdc.', '.ccccdcc.', '.ccccccc.', '.........'],
  mushroom: ['..wwwww..', '.wwwwwww.', 'wwwwwwwww', 'WWWWWWWWW', '....w....', '....w....', '....w....', '...WWW...', '...WWW...'],
  wick: ['....y....', '...yoy...', '...yoy...', '....y....', '....k....', '..eeeee..', '..eeeee..', '..eeeee..', '..eeeee..'],
  pins: ['.b...y...', '..s.s..b.', '...s..s..', '.rrrrrrr.', 'rrrrrrrrr', 'rrgrrrgrr', 'rrrrrrrrr', '.rrrrrrr.', '.........'],
};

export function notionIcon(id, cell = 5) {
  const chart = CHARTS[id];
  if (!chart) return '';
  const n = chart.length;
  const size = n * cell;
  const inset = cell * 0.14;
  const byColor = {};
  chart.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      const x0 = c * cell + inset;
      const y0 = r * cell + inset;
      const x1 = (c + 1) * cell - inset;
      const y1 = (r + 1) * cell - inset;
      byColor[ch] = (byColor[ch] || '') + `M${x0} ${y1}L${x1} ${y0}M${x0} ${y0}L${x1} ${y1}`;
    }
  });
  const paths = Object.entries(byColor)
    .map(([ch, d]) => `<path d="${d}" stroke="${P[ch]}" stroke-width="${(cell * 0.32).toFixed(2)}" stroke-linecap="round" fill="none"/>`)
    .join('');
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${paths}</svg>`;
}
