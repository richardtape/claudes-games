// The lab report's picture: the run as a streak plate. Every kind of germ you destroyed grows as
// colonies along the streaks, in its stain; bosses are the big ones in the middle.
import { CELLS, GERMS, STRAINS, fmtTime } from './data.js';
import { STAIN } from './render.js';

const TAU = Math.PI * 2;

export function drawPlate(canvas, run, px = 520) {
  const d = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = canvas.height = px * d;
  const c = canvas.getContext('2d');
  c.setTransform(d, 0, 0, d, 0, 0);
  c.clearRect(0, 0, px, px);
  const cx = px / 2, cy = px / 2, R = px * 0.46;
  let q = (typeof run.seed === 'number' ? run.seed : run.stats.kills * 977 + 13) % 2147483647 || 7;
  const rr = () => ((q = (q * 16807) % 2147483647) / 2147483647);

  // the dish
  c.fillStyle = 'rgba(40,60,90,0.18)';
  c.beginPath(); c.arc(cx + 4, cy + 7, R + 6, 0, TAU); c.fill();
  c.fillStyle = '#f7fbfc';
  c.beginPath(); c.arc(cx, cy, R + 6, 0, TAU); c.fill();
  const agar = c.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
  agar.addColorStop(0, '#f6ecc0'); agar.addColorStop(1, '#e6d08a');
  c.fillStyle = agar;
  c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(150,120,40,0.35)'; c.lineWidth = 1.5; c.stroke();

  // streaks: four zigzags, each thinner than the last, like a real streak plate
  const kinds = Object.entries(run.stats.byKind).filter(([k]) => !GERMS[k].boss).sort((a, b) => b[1] - a[1]);
  const total = kinds.reduce((s, [, n]) => s + n, 0) || 1;
  const pts = [];
  for (let sIdx = 0; sIdx < 4; sIdx++) {
    const a0 = -2.4 + sIdx * 1.45;
    const rows = 7 - sIdx;
    for (let i = 0; i < rows; i++) {
      const t = i / rows;
      const ra = R * (0.9 - t * 0.42);
      const span = 0.62 - t * 0.2;
      for (let j = 0; j <= 14; j++) {
        const u = i % 2 ? 1 - j / 14 : j / 14;
        const a = a0 + (u - 0.5) * span * 2;
        pts.push({ x: cx + Math.cos(a) * ra, y: cy + Math.sin(a) * ra, w: 1 - sIdx * 0.22 });
      }
    }
  }
  c.strokeStyle = 'rgba(190,150,60,0.25)'; c.lineWidth = 5; c.lineJoin = 'round';
  c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
  const colonies = Math.min(900, 120 + Math.round(Math.sqrt(run.stats.kills) * 16));
  c.globalCompositeOperation = 'multiply';
  for (let i = 0; i < colonies; i++) {
    let pick = rr() * total, kind = kinds[0]?.[0];
    for (const [k, n] of kinds) if ((pick -= n) < 0) { kind = k; break; }
    if (!kind) break;
    const p = pts[Math.floor(rr() ** 1.6 * pts.length)];
    const st = STAIN[GERMS[kind].gram];
    const r = (1.2 + GERMS[kind].r * 0.22 * rr()) * (0.6 + p.w * 0.6);
    const x = p.x + (rr() - 0.5) * 9, y = p.y + (rr() - 0.5) * 9;
    if (Math.hypot(x - cx, y - cy) > R - 5) continue;
    c.fillStyle = st.fill; c.globalAlpha = 0.72;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  // bosses beaten sit in the middle with a gilt rim
  run.stats.bosses.forEach((k, i) => {
    const a = -Math.PI / 2 + i * (TAU / 3);
    const x = cx + Math.cos(a) * R * 0.17, y = cy + Math.sin(a) * R * 0.17 + 4;
    const st = STAIN[GERMS[k].gram];
    c.fillStyle = '#d9a21e'; c.beginPath(); c.arc(x, y, R * 0.105, 0, TAU); c.fill();
    c.fillStyle = st.fill; c.beginPath(); c.arc(x, y, R * 0.085, 0, TAU); c.fill();
    c.fillStyle = st.light; c.globalAlpha = 0.6; c.beginPath(); c.arc(x - 4, y - 4, R * 0.035, 0, TAU); c.fill(); c.globalAlpha = 1;
  });
  // glass glint
  c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.arc(cx, cy, R + 2, -2.5, -1.9); c.stroke();
  c.beginPath(); c.arc(cx, cy, R + 2, -1.75, -1.6); c.stroke();
  // the label, marker on the lid
  c.save();
  c.translate(cx, cy + R * 0.62);
  c.rotate(-0.04);
  c.fillStyle = 'rgba(255,255,255,0.88)';
  c.beginPath(); c.roundRect(-px * 0.27, -22, px * 0.54, 46, 4); c.fill();
  c.fillStyle = '#1d1a2b'; c.textAlign = 'center';
  c.font = `600 ${px * 0.036}px DynaPuff, system-ui, sans-serif`;
  c.fillText(`${CELLS[run.cell].name}, strain ${STRAINS[run.strain]}`, 0, -3);
  c.font = `500 ${px * 0.028}px "Instrument Sans", system-ui, sans-serif`;
  c.fillText(`${fmtTime(run.t)} on the slide, ${run.stats.kills.toLocaleString('en-US')} germs${run.daily ? `, ${run.daily}` : ''}`, 0, 15);
  c.restore();
}
