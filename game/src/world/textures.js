// Procedural canvas textures: asphalt, crossings, sidewalk tile, sand, grass, palm fronds,
// signage and billboards. Everything is drawn here so the game ships no image files.
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';

const r = makeRng(99);
const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function toTex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function noise(ctx, w, h, n, alpha, light = 255) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(r.next() * light);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * r.next()})`;
    ctx.fillRect(r.next() * w, r.next() * h, 1 + r.next() * 2, 1 + r.next() * 2);
  }
}
function memo(name, make) {
  if (!cache.has(name)) cache.set(name, make());
  return cache.get(name);
}

function asphaltBase(ctx, w, h) {
  ctx.fillStyle = '#3a3b40';
  ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 9000, 0.35);
  // tyre polish in each lane
  ctx.fillStyle = 'rgba(20,20,24,0.18)';
  ctx.fillRect(w * 0.12, 0, w * 0.1, h); ctx.fillRect(w * 0.3, 0, w * 0.1, h);
  ctx.fillRect(w * 0.6, 0, w * 0.1, h); ctx.fillRect(w * 0.78, 0, w * 0.1, h);
  // cracks and patches
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(25,25,28,${0.25 + r.next() * 0.2})`;
    ctx.fillRect(r.next() * w, r.next() * h, 10 + r.next() * 40, 8 + r.next() * 30);
  }
}

/** Straight road: u spans the carriageway (14 m), v repeats every 14 m along it. */
export const roadTexture = () => memo('road', () => {
  const [c, ctx] = canvas(256, 256);
  asphaltBase(ctx, 256, 256);
  ctx.fillStyle = '#e8e2cf';
  ctx.fillRect(10, 0, 4, 256); ctx.fillRect(242, 0, 4, 256);           // edge lines
  ctx.fillStyle = '#f2b632';
  ctx.fillRect(123, 0, 4, 256); ctx.fillRect(129, 0, 4, 256);          // double yellow centre
  return toTex(c);
});

/** Intersection pad with zebra crossings on all four sides. */
export const junctionTexture = () => memo('junction', () => {
  const [c, ctx] = canvas(256, 256);
  asphaltBase(ctx, 256, 256);
  ctx.fillStyle = 'rgba(240,236,220,0.92)';
  for (let i = 0; i < 9; i++) {
    const p = 22 + i * 24;
    ctx.fillRect(p, 2, 12, 26); ctx.fillRect(p, 228, 12, 26);
    ctx.fillRect(2, p, 26, 12); ctx.fillRect(228, p, 26, 12);
  }
  ctx.strokeStyle = 'rgba(30,30,30,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(128, 128, 22, 0, Math.PI * 2); ctx.stroke(); // manhole
  return toTex(c, false);
});

export const sidewalkTexture = () => memo('sidewalk', () => {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#c9c0ae';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const v = 190 + Math.floor(r.next() * 25);
    ctx.fillStyle = `rgb(${v},${v - 8},${v - 22})`;
    ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
  }
  noise(ctx, 256, 256, 3000, 0.25, 120);
  return toTex(c);
});

export const plazaTexture = () => memo('plaza', () => {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#d8c7a6';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = 200 + Math.floor(r.next() * 30);
    ctx.fillStyle = (x + y) % 2 ? `rgb(${v},${v - 20},${v - 50})` : `rgb(${v - 30},${v - 45},${v - 70})`;
    ctx.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
  }
  noise(ctx, 256, 256, 2000, 0.2, 100);
  return toTex(c);
});

export const grassTexture = () => memo('grass', () => {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#5f9a3c';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const g = 110 + Math.floor(r.next() * 70);
    ctx.fillStyle = `rgba(${g * 0.55 | 0},${g},${g * 0.35 | 0},0.6)`;
    ctx.fillRect(r.next() * 256, r.next() * 256, 1, 2 + r.next() * 3);
  }
  return toTex(c);
});

export const sandTexture = () => memo('sand', () => {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#ead6a8';
  ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, 14000, 0.22, 255);
  ctx.strokeStyle = 'rgba(190,160,110,0.25)';
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    const y = r.next() * 256;
    ctx.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 4);
    ctx.stroke();
  }
  return toTex(c);
});

export const concreteTexture = () => memo('concrete', () => {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#9d9a94';
  ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, 8000, 0.3);
  ctx.strokeStyle = 'rgba(60,60,60,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 254, 254);
  ctx.fillStyle = 'rgba(240,200,40,0.7)';
  ctx.fillRect(0, 120, 256, 6);
  return toTex(c);
});

export const roofTexture = () => memo('roof', () => {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#7d7871';
  ctx.fillRect(0, 0, 128, 128);
  noise(ctx, 128, 128, 4000, 0.4);
  return toTex(c);
});

/** Palm frond with transparent background (alpha-tested leaves). */
export const frondTexture = () => memo('frond', () => {
  const [c, ctx] = canvas(256, 64);
  ctx.clearRect(0, 0, 256, 64);
  ctx.strokeStyle = '#4c6b22';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 32); ctx.quadraticCurveTo(128, 26, 256, 34); ctx.stroke();
  for (let x = 6; x < 250; x += 5) {
    const len = 26 * Math.sin((x / 256) * Math.PI) + 4;
    const g = 90 + Math.floor(r.next() * 60);
    ctx.strokeStyle = `rgb(${g * 0.45 | 0},${g + 30},${g * 0.25 | 0})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, 31); ctx.lineTo(x + 12, 31 - len); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, 33); ctx.lineTo(x + 12, 33 + len); ctx.stroke();
  }
  return toTex(c, false);
});

/** Neon sign: glowing text on a dark backing, used with an unlit material. */
export function neonTexture(text, color = '#ff4fa3', sub = '') {
  return memo('neon:' + text + color, () => {
    const [c, ctx] = canvas(512, 160);
    ctx.fillStyle = 'rgba(15,10,25,0.92)';
    ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = color; ctx.lineWidth = 5;
    ctx.shadowColor = color; ctx.shadowBlur = 24;
    ctx.strokeRect(10, 10, 492, 140);
    ctx.font = `italic 900 ${sub ? 70 : 84}px Impact, "Arial Black", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(text, 256, sub ? 66 : 82);
    ctx.shadowBlur = 0;
    ctx.fillText(text, 256, sub ? 66 : 82);
    if (sub) {
      ctx.font = '700 30px "Segoe UI", sans-serif';
      ctx.fillStyle = color;
      ctx.fillText(sub, 256, 124);
    }
    return toTex(c, false);
  });
}

/** Billboard adverts for the city's own (fictional) brands. */
const ADS = [
  ['FIZZCO', 'Taste the Tide', '#ff5d73', '#ffe066'],
  ['PELICAN AIR', 'Fly Solara', '#1a8fe3', '#ffffff'],
  ['GULF GOLD', 'Sunscreen SPF 90', '#ffb000', '#3b1f0f'],
  ['NEON NOODLE', 'Open Til 4AM', '#7b2ff7', '#2ff7d6'],
  ['VOLTA MOTORS', 'The All-New Corsair', '#11151c', '#ff6b5a'],
  ['CASA LUNA', 'Luxury Condos', '#f6d5c1', '#9a3b5a'],
];
export const adTexture = (i) => memo('ad' + i, () => {
  const [bg, , fg2, fg] = ADS[i % ADS.length];
  const [c, ctx] = canvas(512, 256);
  const g = ctx.createLinearGradient(0, 0, 512, 256);
  g.addColorStop(0, ADS[i % ADS.length][2]);
  g.addColorStop(1, '#16121f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let k = 0; k < 8; k++) { ctx.beginPath(); ctx.arc(400, 60, 30 + k * 26, 0, Math.PI * 2); ctx.fill(); }
  ctx.font = 'italic 900 78px Impact, "Arial Black", sans-serif';
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.fillText(bg, 28, 120);
  ctx.font = '700 34px "Segoe UI", sans-serif';
  ctx.fillStyle = fg2 === '#ffffff' ? '#fff' : '#fff6e0';
  ctx.fillText(ADS[i % ADS.length][1], 32, 178);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 504, 248);
  return toTex(c, false);
});
export const AD_COUNT = ADS.length;

/** Corrugated metal for containers and warehouses (tinted by material colour). */
export const corrugatedTexture = () => memo('corr', () => {
  const [c, ctx] = canvas(128, 128);
  for (let x = 0; x < 128; x++) {
    const v = 190 + Math.round(Math.sin(x * 0.8) * 40);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, 0, 1, 128);
  }
  noise(ctx, 128, 128, 1500, 0.25, 80);
  return toTex(c, true, false);
});

/** Small number plate / livery decals for cars. */
export function textTexture(text, bg = '#fff', fg = '#111', w = 256, h = 64, font = '800 40px "Segoe UI", sans-serif') {
  return memo('txt:' + text + bg + fg + w + h, () => {
    const [c, ctx] = canvas(w, h);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
    return toTex(c, false);
  });
}

/** Soft round sprite for particles and light glows. */
export const glowTexture = () => memo('glow', () => {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return toTex(c, false);
});

export const smokeTexture = () => memo('smoke', () => {
  const [c, ctx] = canvas(64, 64);
  for (let i = 0; i < 14; i++) {
    const x = 20 + r.next() * 24, y = 20 + r.next() * 24, rad = 10 + r.next() * 14;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  }
  return toTex(c, false);
});
