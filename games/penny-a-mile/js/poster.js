// The company's system map for the end screen: a railway-company map of the whole shire, drawn
// top-down on cream paper, with the track in company red, every station and every town named.
import { W, H, WATER, ROCK, FIELD } from './data.js';
import { PIECES, pieceAt } from './track.js';

export function drawCompanyMap(canvas, s, { title, subtitle, value, rank }) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const pad = 40;
  const top = 92;
  const cell = Math.min((S - pad * 2) / W, (S - top - pad) / H);
  const ox = (S - cell * W) / 2;
  const oy = top;
  const X = (x) => ox + x * cell;
  const Y = (y) => oy + y * cell;

  // Paper.
  ctx.fillStyle = '#f3ebd3';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#2a2620';
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, S - 28, S - 28);
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 20, S - 40, S - 40);

  // Title cartouche.
  ctx.fillStyle = '#2a2620';
  ctx.textAlign = 'center';
  ctx.font = '700 30px "Cabin Condensed", Cabin, sans-serif';
  ctx.fillText(title, S / 2, 56);
  ctx.font = 'italic 500 15px Cabin, sans-serif';
  ctx.fillText(`${subtitle}. Worth ${value}: ${rank}.`, S / 2, 78);

  // Land, woods, fields, crags and water.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const g = s.ground[i];
      if (g === ROCK) {
        // Hill hachures, as on an old survey map.
        ctx.strokeStyle = '#8a7c62';
        ctx.lineWidth = 1;
        const cx = X(x + 0.5);
        const cy = Y(y + 0.62);
        const r = cell * 0.36;
        ctx.beginPath();
        ctx.moveTo(cx - r, cy + r * 0.5);
        ctx.lineTo(cx, cy - r * 0.6);
        ctx.lineTo(cx + r, cy + r * 0.5);
        ctx.stroke();
        continue;
      }
      if (g === WATER) ctx.fillStyle = '#9fc2c9';
      else if (g === FIELD) ctx.fillStyle = '#e8dcae';
      else if (s.trees[i]) ctx.fillStyle = s.trees[i] > 1 ? '#c5d1a2' : '#d6dcb4';
      else continue;
      ctx.fillRect(X(x), Y(y), cell + 0.5, cell + 0.5);
    }
  // Towns as pink blocks.
  ctx.fillStyle = '#d99b8f';
  for (let i = 0; i < W * H; i++) if (s.house[i]) ctx.fillRect(X(i % W) + 1, Y((i / W) | 0) + 1, cell - 2, cell - 2);
  // Industries as hatched squares.
  for (const o of s.industries) {
    ctx.fillStyle = '#b9ab8c';
    ctx.fillRect(X(o.x) + 1, Y(o.y) + 1, o.w * cell - 2, o.h * cell - 2);
    ctx.strokeStyle = '#6f644e';
    ctx.lineWidth = 1;
    ctx.strokeRect(X(o.x) + 1, Y(o.y) + 1, o.w * cell - 2, o.h * cell - 2);
  }
  // Frame of the shire.
  ctx.strokeStyle = '#2a2620';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(X(0), Y(0), W * cell, H * cell);

  // Track: a black line with a red core, the old company-map way.
  for (const [col, lw] of [
    ['#2a2620', Math.max(3, cell * 0.36)],
    ['#b3302a', Math.max(1.6, cell * 0.2)],
  ]) {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const m = s.track[y * W + x];
        if (!m) continue;
        for (let k = 0; k < 6; k++) {
          if (!(m & (1 << k))) continue;
          const [a, b] = PIECES[k];
          for (let j = 0; j <= 6; j++) {
            const p = pieceAt(a, b, j / 6);
            const px = X(x + p[0]);
            const py = Y(y + p[1]);
            if (j === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
        }
      }
    ctx.stroke();
  }

  // Stations and their names.
  ctx.textAlign = 'left';
  for (const st of s.stations) {
    const cx = X(st.x + 0.5);
    const cy = Y(st.y + 0.5);
    ctx.fillStyle = '#fffaf0';
    ctx.strokeStyle = '#2a2620';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(4, cell * 0.42), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.font = '600 11px "Cabin Condensed", Cabin, sans-serif';
  const boxes = [];
  for (const st of s.stations) {
    const cx = X(st.x + 0.5);
    const cy = Y(st.y + 0.5);
    const w = ctx.measureText(st.name).width;
    // Try right, left, above, below; keep the first spot that overlaps nothing.
    const spots = [
      [cx + 8, cy + 4],
      [cx - 8 - w, cy + 4],
      [cx - w / 2, cy - 9],
      [cx - w / 2, cy + 17],
    ];
    let put = spots[0];
    for (const sp of spots) {
      const b = { x: sp[0] - 2, y: sp[1] - 10, w: w + 4, h: 13 };
      if (!boxes.some((o) => b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h)) {
        put = sp;
        break;
      }
    }
    boxes.push({ x: put[0] - 2, y: put[1] - 10, w: w + 4, h: 13 });
    ctx.fillStyle = 'rgba(243,235,211,.85)';
    ctx.fillRect(put[0] - 2, put[1] - 10, w + 4, 13);
    ctx.fillStyle = '#2a2620';
    ctx.fillText(st.name, put[0], put[1]);
  }
  // Town names, larger.
  ctx.textAlign = 'center';
  ctx.font = 'italic 600 15px Cabin, sans-serif';
  for (const t of s.towns) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(243,235,211,.9)';
    ctx.strokeText(t.name, X(t.x + 0.5), Y(t.y) - 8);
    ctx.fillStyle = '#7a2a22';
    ctx.fillText(t.name, X(t.x + 0.5), Y(t.y) - 8);
  }
  // A scale of tiles, and the penny.
  ctx.textAlign = 'left';
  ctx.font = '500 11px Cabin, sans-serif';
  ctx.fillStyle = '#2a2620';
  ctx.fillRect(X(0), Y(H) + 14, cell * 5, 3);
  ctx.fillText('5 tiles', X(0) + cell * 5 + 6, Y(H) + 19);
}
