// Still pictures: long-exposure "photographs" of each named shell for the Pattern Book, and
// the end-of-night programme poster (the sky with every volley you fired, and the acts).
import { createRng } from '../../../shared/rng.js';
import { ACT_TIMES, LAYOUTS, SHELL } from './data.js';
import { suitOf } from './engine.js';
import { COLOURS, SUIT_COLOUR } from './sky.js';

const TAU = Math.PI * 2;
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;

/** Draw one burst as a long exposure: every star's path as a fading line. */
export function exposure(ctx, x, y, kind, col, scale, rng) {
  const stars = [];
  const sp = 120 * scale;
  const add = (vx, vy, o = {}) => stars.push({ vx, vy, col: o.col || col, life: o.life ?? 1.1, drag: o.drag ?? 1.6, grav: o.grav ?? 60, w: o.w ?? 1.3, spin: o.spin || 0 });
  switch (kind) {
    case 'willow':
    case 'kamuro':
    case 'waterfall':
    case 'brocade': {
      const n = kind === 'kamuro' ? 110 : 70;
      for (let i = 0; i < n; i++) {
        const a = rng.next() * TAU;
        const v = sp * (0.6 + rng.next() * 0.4) * (kind === 'kamuro' ? 1.2 : 1);
        if (kind === 'waterfall') add((i / n - 0.5) * sp * 3.2, rng.next() * 10, { col: COLOURS.glitter, life: 2.2, drag: 1.4, grav: 70 });
        else add(Math.cos(a) * v, Math.sin(a) * v, { col: COLOURS.glitter, life: kind === 'brocade' ? 1.5 : 2.5, drag: 2.2, grav: 28 });
      }
      break;
    }
    case 'palm':
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + ((i - 4) / 9) * Math.PI * 1.7;
        add(Math.cos(a) * sp * 1.1, Math.sin(a) * sp * 1.1, { life: 2, drag: 1.1, grav: 70, w: 2.6 });
      }
      break;
    case 'ring': {
      const tilt = 0.45;
      for (let i = 0; i < 44; i++) {
        const a = (i / 44) * TAU;
        add(Math.cos(a) * sp, Math.sin(a) * sp * tilt, { life: 1.3, drag: 1.5, grav: 25, w: 1.6 });
      }
      break;
    }
    case 'crossette':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        for (let j = 0; j < 4; j++) {
          const b = (j / 4) * TAU + Math.PI / 4;
          add(Math.cos(a) * sp * 0.8 + Math.cos(b) * sp * 0.45, Math.sin(a) * sp * 0.8 + Math.sin(b) * sp * 0.45, { life: 1.2, w: 1.4 });
        }
      }
      break;
    case 'strobe':
      for (let i = 0; i < 50; i++) {
        const a = rng.next() * TAU;
        const v = sp * (0.3 + rng.next() * 0.7);
        add(Math.cos(a) * v, Math.sin(a) * v, { col: COLOURS.white, life: 1.6, drag: 2.6, grav: 14, w: 1.2, spin: -1 });
      }
      break;
    case 'tourbillion':
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        add(Math.cos(a) * sp * 0.9, Math.sin(a) * sp * 0.9 - sp * 0.3, { life: 1.8, drag: 0.5, grav: 30, w: 2, spin: 4 });
      }
      break;
    case 'comet':
    case 'chrysanthemum':
    case 'peony':
    default: {
      const n = kind === 'shell' ? 36 : 64;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rng.next() * 0.2;
        const v = sp * Math.sqrt(1 - (rng.next() * 0.9) ** 2);
        add(Math.cos(a) * v, Math.sin(a) * v, { life: kind === 'shell' ? 0.9 : 1.2, w: kind === 'shell' ? 1.1 : 1.4 });
      }
      if (kind === 'comet') for (let i = 0; i < 6; i++) add(Math.cos(i) * sp * 1.4, Math.sin(i) * sp * 1.4, { col: COLOURS.glitter, life: 1.8, drag: 0.9, w: 2.4 });
    }
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const dt = 1 / 30;
  for (const s of stars) {
    let px = x;
    let py = y;
    let vx = s.vx;
    let vy = s.vy;
    const steps = Math.round(s.life / dt);
    for (let k = 0; k < steps; k++) {
      const d = Math.exp(-s.drag * dt);
      vx *= d;
      vy = vy * d + s.grav * dt;
      if (s.spin > 0) {
        const a = s.spin * dt;
        [vx, vy] = [vx * Math.cos(a) - vy * Math.sin(a), vx * Math.sin(a) + vy * Math.cos(a) - 30 * dt];
      }
      const nx = px + vx * dt;
      const ny = py + vy * dt;
      const t = k / steps;
      const alpha = s.spin < 0 ? (k % 3 === 0 ? 0.9 : 0) : (1 - t) ** 1.3 * 0.85;
      if (alpha > 0.02) {
        ctx.strokeStyle = rgba(t < 0.15 ? [255, 250, 235] : s.col, alpha.toFixed(3));
        ctx.lineWidth = s.w * (1 - t * 0.5);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(nx, ny);
        ctx.stroke();
      }
      px = nx;
      py = ny;
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

const KIND_COLOUR = {
  peony: 'red',
  chrysanthemum: 'green',
  palm: 'gold',
  tourbillion: 'blue',
  willow: 'glitter',
  waterfall: 'glitter',
  strobe: 'white',
  brocade: 'glitter',
  crossette: 'blue',
  ring: 'red',
  comet: 'gold',
  kamuro: 'glitter',
};

export function drawSpecimen(canvas, id, seen) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  ctx.fillStyle = '#0a0f1e';
  ctx.fillRect(0, 0, w, h);
  const rng = createRng(`spec-${id}`);
  const y = id === 'waterfall' ? h * 0.2 : id === 'palm' || id === 'willow' || id === 'kamuro' || id === 'brocade' ? h * 0.34 : h * 0.46;
  // unseen shells show only a faint grey ghost of their shape
  const col = seen ? COLOURS[KIND_COLOUR[id]] || COLOURS.gold : [70, 74, 92];
  exposure(ctx, w / 2, y, id, col, id === 'waterfall' ? 0.42 : 0.62, rng);
}

// ---------- the programme poster ----------
export async function drawProgramme(canvas, state, { won, date = new Date() }) {
  try {
    await Promise.all([document.fonts.load('64px "Shrikhand"'), document.fonts.load('600 24px "Bricolage Grotesque"')]);
  } catch {
    /* fonts unavailable: fall back */
  }
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const SKY_H = 520;
  const rng = createRng(`programme-${state.seed}`);
  // sky
  const g = ctx.createLinearGradient(0, 0, 0, SKY_H);
  g.addColorStop(0, '#060b18');
  g.addColorStop(0.7, '#141a35');
  g.addColorStop(1, '#3e2a33');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, SKY_H);
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(230,232,255,${(0.15 + rng.next() * 0.4).toFixed(2)})`;
    ctx.fillRect(rng.next() * W, rng.next() ** 1.5 * SKY_H * 0.8, 1.2, 1.2);
  }
  // every volley: shells as small bursts, named shells as big ones
  const log = state.log;
  const maxBursts = 140;
  const shells = [];
  for (const v of log) {
    for (const c of v.cards) shells.push({ kind: 'shell', col: COLOURS[SUIT_COLOUR[suitOf(c)]] || COLOURS.gold, size: 0.22 });
    for (const id of v.patterns) shells.push({ kind: id, col: COLOURS[KIND_COLOUR[id]] || COLOURS.gold, size: 0.42 });
  }
  const step = Math.max(1, Math.ceil(shells.length / maxBursts));
  shells.forEach((s, i) => {
    if (s.kind === 'shell' && i % step) return;
    const x = 60 + rng.next() * (W - 120);
    const y = 70 + rng.next() * (SKY_H - 260);
    exposure(ctx, x, y, s.kind, s.col, s.size, rng);
  });
  // rooftops and fence
  ctx.fillStyle = '#0c0d18';
  ctx.beginPath();
  ctx.moveTo(0, SKY_H);
  let x = -10;
  while (x < W + 40) {
    const w = 80 + rng.next() * 60;
    ctx.lineTo(x, SKY_H - 70);
    ctx.lineTo(x + w / 2, SKY_H - 98 - rng.next() * 14);
    ctx.lineTo(x + w, SKY_H - 70);
    x += w;
  }
  ctx.lineTo(W, SKY_H);
  ctx.fill();
  ctx.fillStyle = '#16120f';
  for (let px = 0; px < W; px += 16) ctx.fillRect(px, SKY_H - 34 - (px % 32 ? 0 : 3), 12, 40);
  // bonfire glow
  const fire = ctx.createRadialGradient(110, SKY_H, 4, 110, SKY_H, 260);
  fire.addColorStop(0, 'rgba(255,140,50,0.75)');
  fire.addColorStop(0.3, 'rgba(255,100,40,0.25)');
  fire.addColorStop(1, 'rgba(255,100,40,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = fire;
  ctx.fillRect(0, SKY_H - 260, 400, 260);
  ctx.globalCompositeOperation = 'source-over';

  // the printed label
  ctx.fillStyle = '#f5c42c';
  ctx.fillRect(0, SKY_H, W, H - SKY_H);
  ctx.strokeStyle = '#1c1712';
  ctx.lineWidth = 6;
  ctx.strokeRect(22, SKY_H + 22, W - 44, H - SKY_H - 44);
  ctx.lineWidth = 2;
  ctx.strokeRect(32, SKY_H + 32, W - 64, H - SKY_H - 64);
  // title, misregistered in red over black
  ctx.textAlign = 'center';
  ctx.font = '88px "Shrikhand", Georgia, serif';
  ctx.fillStyle = '#1c1712';
  ctx.fillText('Touch Paper', W / 2 + 4, SKY_H + 124);
  ctx.fillStyle = '#d42a20';
  ctx.fillText('Touch Paper', W / 2, SKY_H + 120);
  ctx.font = '600 24px "Bricolage Grotesque", system-ui, sans-serif';
  ctx.fillStyle = '#1c1712';
  const day = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  ctx.fillText(`${state.daily ? 'Tonight’s display' : 'A display in five acts'}, ${day}`, W / 2, SKY_H + 162);
  // acts
  const acts = [0, 1, 2, 3, 4];
  const rowY = SKY_H + 210;
  ctx.font = '600 26px "Bricolage Grotesque", system-ui, sans-serif';
  acts.forEach((a, k) => {
    const y = rowY + k * 42;
    const played = state.log.some((v) => v.act === a) || (state.report && state.report.act >= a);
    const score = state.log.filter((v) => v.act === a).reduce((s, v) => s + v.score, 0);
    ctx.textAlign = 'left';
    ctx.fillStyle = played ? '#1c1712' : 'rgba(28,23,18,0.35)';
    ctx.fillText(`${ACT_TIMES[a]} pm  ${LAYOUTS[a].name}`, 80, y);
    ctx.textAlign = 'right';
    ctx.fillText(played ? score.toLocaleString('en-GB') : 'rained off', W - 80, y);
    ctx.strokeStyle = 'rgba(28,23,18,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.moveTo(80, y + 10);
    ctx.lineTo(W - 80, y + 10);
    ctx.stroke();
    ctx.setLineDash([]);
  });
  const finale = state.stats.finales || 0;
  const totY = rowY + 5 * 42 + 20;
  ctx.textAlign = 'left';
  ctx.font = '600 22px "Bricolage Grotesque", system-ui, sans-serif';
  ctx.fillStyle = '#1c1712';
  ctx.fillText(`Finales ${finale.toLocaleString('en-GB')} · ${state.stats.cleared} layout${state.stats.cleared === 1 ? '' : 's'} cleared`, 80, totY);
  ctx.textAlign = 'right';
  ctx.font = '56px "Shrikhand", Georgia, serif';
  ctx.fillStyle = '#d42a20';
  ctx.fillText(`${state.total.toLocaleString('en-GB')}`, W - 80, totY + 14);
  ctx.font = '600 20px "Bricolage Grotesque", system-ui, sans-serif';
  ctx.fillStyle = '#1c1712';
  ctx.fillText('oohs', W - 80, totY + 40);
  // best volley and the named shells of the night
  const best = state.stats.best;
  ctx.textAlign = 'left';
  ctx.font = '600 21px "Bricolage Grotesque", system-ui, sans-serif';
  const found = Object.keys(state.found);
  const names = found.map((id) => SHELL[id].name);
  const bestLine = best ? `Best volley: ${best.cards.length} shells for ${best.score.toLocaleString('en-GB')}${best.patterns.length ? ` (${best.patterns.map((p) => SHELL[p].name).join(', ')})` : ''}` : 'No volleys tonight';
  const y2 = wrapText(ctx, bestLine, 80, totY + 70, W - 160, 28);
  const y3 = wrapText(ctx, names.length ? `Named shells: ${names.join(', ')}` : 'No named shells tonight', 80, y2 + 34, W - 160, 28);
  ctx.textAlign = 'center';
  ctx.font = '600 16px "Bricolage Grotesque", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(28,23,18,0.75)';
  if (y3 < H - 84) ctx.fillText(won ? 'The crowd stayed to the very end.' : 'The crowd went home early. There’s always next year.', W / 2, H - 50);
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = w;
      y += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
  return y;
}
