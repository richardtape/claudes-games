// The instruments drawn over the view: the wind ladder (one dial per layer, its arrow relative to
// where you look, the ground under you and your height), the minimap (heading-up, with crosses,
// landmarks and your track), labels pinned to crosses and places, and the top-down valley map the
// certificate reuses.
import { getTerrain, HALF, STRATA, valleyInfo, VALLEYS, SPECIALS } from './terrain.js';
import { dropTarget } from './engine.js';
import { layerWind } from './winds.js';

const LADDER_MAX = 480;

// ---------------------------------------------------------------- the valley map image

let mapImage = null;
/** A top-down painting of the play area (512 px square), made once. */
export function valleyMap() {
  if (mapImage) return mapImage;
  const T = getTerrain();
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const m = (2 * HALF) / S;
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const x = -HALF + (i + 0.5) * m;
      const z = -HALF + (j + 0.5) * m;
      const h = T.groundAt(x, z);
      const hx = T.groundAt(x + 6, z) - T.groundAt(x - 6, z);
      const hz = T.groundAt(x, z + 6) - T.groundAt(x, z - 6);
      const shade = Math.max(0.55, Math.min(1.25, 1 + (-hx * 0.8 - hz * 0.6) / 12));
      let col;
      if (valleyInfo('main', x, z).d < 16) col = [176, 106, 82];
      else {
        const slope = Math.hypot(hx, hz) / 12;
        if (slope > 0.35) {
          const s = STRATA[Math.floor(h / 11) % STRATA.length];
          col = [s[0] * 255, s[1] * 255, s[2] * 255];
        } else {
          let floor = false;
          for (const v of VALLEYS) if (valleyInfo(v.id, x, z).d < v.w + 18) floor = true;
          col = floor && h < 100 ? [168, 170, 104] : [205, 186, 140];
        }
      }
      const k = (j * S + i) * 4;
      img.data[k] = Math.min(255, col[0] * shade);
      img.data[k + 1] = Math.min(255, col[1] * shade);
      img.data[k + 2] = Math.min(255, col[2] * shade);
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // Chimneys as dots, the town as a smudge.
  g.fillStyle = 'rgba(67, 55, 63, 0.55)';
  for (const ch of T.chimneys) {
    if (Math.abs(ch.x) > HALF || Math.abs(ch.z) > HALF) continue;
    g.fillRect((ch.x + HALF) / m - 0.8, (ch.z + HALF) / m - 0.8, 1.6, 1.6);
  }
  g.fillStyle = 'rgba(240, 228, 206, 0.9)';
  for (const h of T.town) g.fillRect((h.x + HALF) / m - 1.5, (h.z + HALF) / m - 1.5, 3, 3);
  mapImage = c;
  return c;
}

// ---------------------------------------------------------------- minimap

export function drawMinimap(canvas, { flight, yaw, album, radius = 900 }) {
  const T = getTerrain();
  const g = canvas.getContext('2d');
  const S = canvas.width;
  const b = flight.b;
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#c3ad86';
  g.fillRect(0, 0, S, S);
  const k = S / 2 / radius; // px per metre
  g.translate(S / 2, S / 2);
  g.rotate(-yaw);
  g.translate(-b.x * k, -b.z * k);
  const map = valleyMap();
  g.drawImage(map, -HALF * k, -HALF * k, 2 * HALF * k, 2 * HALF * k);
  // The edge of the valley.
  g.strokeStyle = 'rgba(31, 35, 80, 0.6)';
  g.setLineDash([6, 6]);
  g.lineWidth = 2;
  g.strokeRect(-HALF * k, -HALF * k, 2 * HALF * k, 2 * HALF * k);
  g.setLineDash([]);
  // Track.
  g.strokeStyle = 'rgba(40, 73, 168, 0.85)';
  g.lineWidth = 3;
  g.beginPath();
  flight.track.forEach(([x, , z], i) => (i ? g.lineTo(x * k, z * k) : g.moveTo(x * k, z * k)));
  g.lineTo(b.x * k, b.z * k);
  g.stroke();
  // Where you'll drift in the next 90 s if you hold this height.
  if (flight.phase === 'flying') {
    let x = b.x;
    let z = b.z;
    g.strokeStyle = 'rgba(255, 204, 85, 0.95)';
    g.lineWidth = 4;
    g.setLineDash([2, 7]);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x * k, z * k);
    const w = layerWind(flight.layers, b.y);
    for (let t = 0; t < 90; t += 3) {
      x += w.x * 3;
      z += w.z * 3;
      g.lineTo(x * k, z * k);
    }
    g.stroke();
    g.setLineDash([]);
    g.lineCap = 'butt';
  }
  // Landmarks.
  for (const m of T.landmarks) {
    const got = album?.[m.id];
    g.fillStyle = got ? '#2c2430' : 'rgba(255,255,255,0.95)';
    g.strokeStyle = '#2c2430';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(m.x * k, m.z * k, 5.5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  // Crosses.
  for (const c of flight.crosses) {
    const x = c.x * k;
    const z = c.z * k;
    g.globalAlpha = c.dropped ? 0.45 : 1;
    g.fillStyle = c.color;
    g.strokeStyle = '#1f2350';
    g.lineWidth = 2;
    g.fillRect(x - 9, z - 2.5, 18, 5);
    g.fillRect(x - 2.5, z - 9, 5, 18);
    g.strokeRect(x - 9, z - 2.5, 18, 5);
    g.strokeRect(x - 2.5, z - 9, 5, 18);
    g.globalAlpha = 1;
  }
  g.restore();
  // Off-map crosses as pips on the rim.
  for (const c of flight.crosses) {
    if (c.dropped) continue;
    const dx = c.x - b.x;
    const dz = c.z - b.z;
    const d = Math.hypot(dx, dz);
    if (d * k < S / 2 - 14) continue;
    const a = Math.atan2(dx, -dz) - yaw;
    const r = S / 2 - 12;
    const px = S / 2 + Math.sin(a) * r;
    const py = S / 2 - Math.cos(a) * r;
    g.save();
    g.translate(px, py);
    g.rotate(a);
    g.fillStyle = c.color;
    g.strokeStyle = '#1f2350';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(8, 6);
    g.lineTo(-8, 6);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
  // You, pointing the way you drift (relative to the view).
  const head = Math.atan2(b.vx, -b.vz) - yaw;
  g.save();
  g.translate(S / 2, S / 2);
  g.rotate(Math.hypot(b.vx, b.vz) > 0.2 ? head : 0);
  g.fillStyle = '#ffc845';
  g.strokeStyle = '#1f2350';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(0, -12);
  g.lineTo(8, 9);
  g.lineTo(0, 4);
  g.lineTo(-8, 9);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
  // North.
  const na = -yaw;
  const nx = S / 2 + Math.sin(na) * (S / 2 - 16);
  const ny = S / 2 - Math.cos(na) * (S / 2 - 16);
  g.fillStyle = 'rgba(251, 247, 239, 0.9)';
  g.beginPath();
  g.arc(nx, ny, 13, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1f2350';
  g.font = '800 20px "Atkinson Hyperlegible Next", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('N', nx, ny + 1);
  // Rim.
  g.strokeStyle = 'rgba(31, 35, 80, 0.9)';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2);
  g.stroke();
}

// ---------------------------------------------------------------- wind ladder

/** The layer whose wind heads most nearly towards (gx, gz) from the balloon, or -1. */
export function bestLayer(flight, gx, gz) {
  const b = flight.b;
  const dx = gx - b.x;
  const dz = gz - b.z;
  const d = Math.hypot(dx, dz) || 1;
  let best = -1;
  let bestDot = 0.5;
  flight.layers.forEach((l, i) => {
    const dot = (l.vx * dx + l.vz * dz) / (d * l.speed);
    if (dot > bestDot) {
      bestDot = dot;
      best = i;
    }
  });
  return best;
}

export function drawLadder(canvas, { flight, yaw, goal }) {
  const T = getTerrain();
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const b = flight.b;
  g.clearRect(0, 0, W, H);
  const top = 92;
  const bot = H - 26;
  const Y = (alt) => bot - (Math.max(0, Math.min(LADDER_MAX, alt)) / LADDER_MAX) * (bot - top);
  // Strip.
  g.fillStyle = 'rgba(31, 35, 80, 0.6)';
  roundRect(g, 2, 2, W - 4, H - 4, 30);
  g.fill();
  // Ground under you.
  const gr = T.groundAt(b.x, b.z);
  g.save();
  roundRect(g, 2, 2, W - 4, H - 4, 30);
  g.clip();
  g.fillStyle = 'rgba(193, 150, 108, 0.9)';
  g.fillRect(0, Y(gr), W, H);
  g.restore();
  // Height above the ground.
  g.fillStyle = '#fbf7ef';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = '800 38px "Atkinson Hyperlegible Next", system-ui, sans-serif';
  g.fillText(`${Math.max(0, Math.round(b.y - gr))}`, W / 2, 48);
  g.font = '600 21px "Atkinson Hyperlegible Next", system-ui, sans-serif';
  g.fillStyle = 'rgba(251,247,239,0.75)';
  g.fillText('m up', W / 2, 74);
  const cx = W * 0.6;
  // The column joining the layers.
  g.strokeStyle = 'rgba(251,247,239,0.25)';
  g.lineWidth = 3;
  g.setLineDash([6, 8]);
  g.beginPath();
  g.moveTo(cx, Y(flight.layers[0].y));
  g.lineTo(cx, Y(flight.layers.at(-1).y));
  g.stroke();
  g.setLineDash([]);
  // One dial per layer: its arrow is that layer's wind, and up the screen is the way you look.
  const hi = goal ? bestLayer(flight, goal.x, goal.z) : -1;
  const R = Math.min(32, (W - 44) / 2.4);
  flight.layers.forEach((l, i) => {
    const y = Y(l.y);
    const best = i === hi;
    g.fillStyle = best ? '#ffcc55' : 'rgba(251,247,239,0.16)';
    g.strokeStyle = best ? '#fff3d0' : 'rgba(251,247,239,0.55)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, y, R, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    const len = R * (0.95 + Math.min(0.75, l.speed / 14));
    arrow(g, cx, y, l.dir - yaw, len, best ? '#1f2350' : '#fbf7ef', 6);
  });
  // You: a marker on the left and a hairline across, so you can see which layer you are in.
  const yy = Y(b.y);
  g.strokeStyle = 'rgba(255, 204, 85, 0.85)';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(24, yy);
  g.lineTo(W - 8, yy);
  g.stroke();
  g.fillStyle = '#ffcc55';
  g.strokeStyle = '#1f2350';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(5, yy - 14);
  g.lineTo(28, yy);
  g.lineTo(5, yy + 14);
  g.closePath();
  g.fill();
  g.stroke();
  // Climbing or sinking.
  if (Math.abs(b.vy) > 0.25) {
    const len = Math.min(64, Math.abs(b.vy) * 14);
    const dir = b.vy > 0 ? -1 : 1;
    g.strokeStyle = b.vy > 0 ? '#ffcc55' : '#c9c0ef';
    g.fillStyle = g.strokeStyle;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(14, yy + dir * 19);
    g.lineTo(14, yy + dir * (19 + len));
    g.stroke();
    g.beginPath();
    g.moveTo(14, yy + dir * (28 + len));
    g.lineTo(6, yy + dir * (15 + len));
    g.lineTo(22, yy + dir * (15 + len));
    g.closePath();
    g.fill();
  }
}

function arrow(g, x, y, ang, len, color, width) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, len / 2);
  g.lineTo(0, -len / 2 + width);
  g.stroke();
  g.beginPath();
  g.moveTo(0, -len / 2 - width * 0.8);
  g.lineTo(width * 1.5, -len / 2 + width * 1.6);
  g.lineTo(-width * 1.5, -len / 2 + width * 1.6);
  g.closePath();
  g.fill();
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ---------------------------------------------------------------- labels

export function createLabels(root) {
  const pool = new Map();
  function el(key, cls) {
    let e = pool.get(key);
    if (!e) {
      e = document.createElement('div');
      root.append(e);
      pool.set(key, e);
    }
    if (e._cls !== cls) {
      e.className = `label ${cls}`;
      e._cls = cls;
    }
    return e;
  }
  /** items: [{ key, cls, html, x, y, show }] in CSS px. */
  function update(items) {
    const seen = new Set();
    for (const it of items) {
      const e = el(it.key, it.cls);
      seen.add(it.key);
      if (e._html !== it.html) {
        e.innerHTML = it.html;
        e._html = it.html;
      }
      e.style.transform = `translate(${Math.round(it.x)}px, ${Math.round(it.y)}px)`;
      e.hidden = !it.show;
    }
    for (const [k, e] of pool) if (!seen.has(k)) e.hidden = true;
  }
  return { update, clear: () => update([]) };
}

/** Labels for crosses (always) and nearby landmarks, projected through the renderer. */
export function labelItems(render, flight, album, W, H) {
  const T = getTerrain();
  const items = [];
  const b = flight.b;
  const active = dropTarget(flight);
  for (const c of flight.crosses) {
    const d = Math.hypot(c.x - b.x, c.z - b.z);
    const p = render.project(c.x, c.y + (c.dropped ? 6 : 40), c.z);
    const done = c.result ? `${c.result.d.toFixed(1)} m` : c.dropped ? 'falling…' : `${d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'}`;
    let x = p.x;
    let y = p.y;
    let edge = false;
    if (!p.front || x < 60 || x > W - 110 || y < 90 || y > H - 150) {
      if (c.dropped) continue;
      // Pin to the screen edge in the cross's direction.
      edge = true;
      let nx = p.nx;
      let ny = p.ny;
      if (!p.front) {
        nx = -nx;
        ny = -ny;
      }
      const s = 1 / Math.max(Math.abs(nx) / 0.7, Math.abs(ny) / 0.62, 1e-3);
      x = Math.max(70, Math.min(W - 120, (nx * s * 0.5 + 0.5) * W));
      y = Math.max(100, Math.min(H - 160, (-ny * s * 0.5 + 0.5) * H));
    }
    items.push({
      key: `c${c.id}`,
      cls: `cross${edge ? ' edge' : ''}${c === active ? ' active' : ''}${c.dropped ? ' done' : ''}`,
      html: `<i style="--c:${c.color}"></i><span>${done}</span>`,
      x,
      y,
      show: true,
    });
  }
  for (const m of T.landmarks) {
    const d = Math.hypot(m.x - b.x, m.z - b.z);
    if (d > 900) continue;
    const p = render.project(m.subject.x, m.subject.y + 24, m.subject.z);
    if (!p.front) continue;
    if (p.x < 40 || p.x > W - 110 || p.y < 90 || p.y > H - 120) continue;
    items.push({ key: `l${m.id}`, cls: `place${album?.[m.id] ? ' got' : ''}`, html: `<span>${m.name}</span>`, x: p.x, y: p.y, show: true });
  }
  return items;
}

export { SPECIALS };
