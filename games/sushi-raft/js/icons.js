// Little drawings for the morning market's upgrades, in the same ink-and-flat-colour style as art.js.
import { INK } from './art.js';

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
function inked(g, fill, lw) {
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = lw;
  g.stroke();
}

/** One upgrade's icon, centred at (x, y), about s across. */
export function drawUpgradeIcon(g, id, x, y, s) {
  const u = s / 40;
  const lw = Math.max(1, s * 0.04);
  g.save();
  g.translate(x, y);
  g.scale(u, u);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const L = lw / u;
  switch (id) {
    case 'board2':
      for (const [dx, dy] of [
        [-4, -4],
        [4, 4],
      ]) {
        rr(g, -15 + dx, -9 + dy, 30, 18, 4);
        inked(g, '#f4e2bd', L);
      }
      g.fillStyle = '#f4896b';
      rr(g, -6, 6, 12, 5, 2);
      g.fill();
      break;
    case 'knife':
      g.beginPath();
      g.moveTo(-16, 4);
      g.lineTo(10, -10);
      g.quadraticCurveTo(15, -10, 12, -5);
      g.lineTo(-12, 8);
      g.closePath();
      inked(g, '#dfe6ea', L);
      rr(g, -20, 5, 10, 6, 2);
      inked(g, '#8a5a3c', L);
      g.strokeStyle = '#ffffff';
      g.lineWidth = L;
      g.beginPath();
      g.moveTo(-6, 1);
      g.lineTo(8, -7);
      g.stroke();
      break;
    case 'cooker':
      rr(g, -14, -6, 28, 20, 8);
      inked(g, '#f7f4ee', L);
      g.beginPath();
      g.ellipse(0, -7, 13, 5, 0, 0, Math.PI * 2);
      inked(g, '#ffffff', L);
      g.fillStyle = '#de4b3a';
      g.beginPath();
      g.arc(0, -9, 2.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.9)';
      for (const [dx, dy, r] of [
        [-5, -16, 3],
        [1, -19, 3.5],
        [6, -15, 2.5],
      ]) {
        g.beginPath();
        g.arc(dx, dy, r, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'sandals':
      for (const dx of [-7, 7]) {
        g.beginPath();
        g.ellipse(dx, 2, 6, 13, dx < 0 ? -0.2 : 0.2, 0, Math.PI * 2);
        inked(g, '#5fb3b7', L);
        g.strokeStyle = '#24335a';
        g.lineWidth = L * 1.6;
        g.beginPath();
        g.moveTo(dx - 5, -2);
        g.lineTo(dx + 5, -2);
        g.stroke();
      }
      break;
    case 'cat':
      // a beckoning cat: round white body, one paw up, a red collar with a bell
      g.beginPath();
      g.ellipse(0, 8, 12, 10, 0, 0, Math.PI * 2);
      inked(g, '#fffaf0', L);
      g.beginPath();
      g.arc(0, -6, 10, 0, Math.PI * 2);
      inked(g, '#fffaf0', L);
      for (const dx of [-7, 7]) {
        g.beginPath();
        g.moveTo(dx - 4, -12);
        g.lineTo(dx, -19);
        g.lineTo(dx + 4, -12);
        inked(g, '#fffaf0', L);
      }
      g.beginPath();
      g.ellipse(13, -6, 4, 6, 0.3, 0, Math.PI * 2);
      inked(g, '#fffaf0', L);
      g.strokeStyle = '#de4b3a';
      g.lineWidth = L * 2;
      g.beginPath();
      g.arc(0, -6, 10, 0.5, Math.PI - 0.5);
      g.stroke();
      g.fillStyle = '#efb23a';
      g.beginPath();
      g.arc(0, 4, 2.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = INK;
      for (const dx of [-4, 4]) {
        g.beginPath();
        g.arc(dx, -7, 1.3, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'jar':
      rr(g, -11, -10, 22, 24, 6);
      inked(g, 'rgba(200,230,240,.85)', L);
      rr(g, -9, -15, 18, 6, 2);
      inked(g, '#c99e64', L);
      g.fillStyle = '#efb23a';
      for (const [dx, dy] of [
        [-4, 9],
        [4, 9],
        [0, 5],
        [-5, 2],
        [5, 1],
      ]) {
        g.beginPath();
        g.ellipse(dx, dy, 4, 2.2, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(42,34,51,.6)';
        g.lineWidth = L * 0.6;
        g.stroke();
      }
      break;
    case 'lanterns':
      for (const [dx, dy] of [
        [-8, 2],
        [8, -2],
      ]) {
        g.beginPath();
        g.ellipse(dx, dy, 8, 9, 0, 0, Math.PI * 2);
        inked(g, '#de4b3a', L);
        g.fillStyle = INK;
        rr(g, dx - 5, dy - 11, 10, 3, 1);
        g.fill();
        rr(g, dx - 5, dy + 8, 10, 3, 1);
        g.fill();
        g.strokeStyle = 'rgba(255,220,150,.8)';
        g.lineWidth = L * 0.7;
        g.beginPath();
        g.ellipse(dx, dy, 7, 2, 0, 0, Math.PI);
        g.stroke();
      }
      break;
    case 'timer':
      g.beginPath();
      g.arc(0, 2, 13, 0, Math.PI * 2);
      inked(g, '#f6cf4a', L);
      g.beginPath();
      g.arc(0, 2, 9, 0, Math.PI * 2);
      inked(g, '#fffaf0', L * 0.8);
      rr(g, -3, -15, 6, 5, 1.5);
      inked(g, '#de4b3a', L);
      g.strokeStyle = INK;
      g.lineWidth = L * 1.2;
      g.beginPath();
      g.moveTo(0, 2);
      g.lineTo(0, -4);
      g.moveTo(0, 2);
      g.lineTo(4, 4);
      g.stroke();
      break;
    default:
      g.beginPath();
      g.arc(0, 0, 12, 0, Math.PI * 2);
      inked(g, '#e8c896', L);
  }
  g.restore();
}
