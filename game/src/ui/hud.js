// HUD: rotating circular minimap with blips, full-screen map, health/armour, cash, weapon and ammo,
// wanted stars, clock, speedometer, objective line, subtitles, notification feed and big messages.
import { game } from '../core/game.js';
import { blocks, buildings, landmarks, districtName, STYLE } from '../world/cityLayout.js';
import { BLOCK, ROAD, GRID_X, GRID_Z, LAND, BEACH_Z, X0, Z0, roadX, roadZ } from '../core/config.js';
import { WEAPONS } from '../systems/combat.js';
import { wanted } from '../systems/police.js';
import { rig } from '../systems/cameraRig.js';
import { missionBlips } from '../systems/missions.js';

const $ = (id) => document.getElementById(id);
const S = 1.6; // map pixels per metre
const PAD = 60;
let mapImg = null;
const mapW = Math.ceil((LAND.maxX - LAND.minX + PAD * 2) * S), mapH = Math.ceil((LAND.maxZ - LAND.minZ + PAD * 2) * S);
const toMap = (x, z) => [(x - LAND.minX + PAD) * S, (z - LAND.minZ + PAD) * S];

function renderMapImage() {
  const c = document.createElement('canvas');
  c.width = mapW; c.height = mapH;
  const g = c.getContext('2d');
  g.fillStyle = '#1b4d6e'; g.fillRect(0, 0, mapW, mapH);
  const [lx, lz] = toMap(LAND.minX, LAND.minZ), [hx, hz] = toMap(LAND.maxX, BEACH_Z);
  g.fillStyle = '#4a4e57'; g.fillRect(lx, lz, hx - lx, hz - lz);
  const [, bz1] = toMap(0, LAND.maxZ - 20);
  g.fillStyle = '#d9c38f'; g.fillRect(lx, hz, hx - lx, bz1 - hz);
  for (const b of blocks) {
    const [x, z] = toMap(b.cx - BLOCK / 2, b.cz - BLOCK / 2);
    g.fillStyle = '#8d8a84'; g.fillRect(x, z, BLOCK * S, BLOCK * S);
    g.fillStyle = b.park || b.district === 'palms' ? '#5d8f45' : b.district === 'oldport' ? '#6f7178' : b.district === 'coral' ? '#b79d84' : '#7c7a80';
    g.fillRect(x + 4 * S, z + 4 * S, (BLOCK - 8) * S, (BLOCK - 8) * S);
  }
  for (const b of buildings) {
    const [x, z] = toMap(b.x - b.w / 2, b.z - b.d / 2);
    g.fillStyle = b.style === STYLE.glass ? '#3d5468' : b.style === STYLE.house ? '#b8624a' : b.style === STYLE.warehouse ? '#585c63' : '#5c5966';
    g.fillRect(x, z, b.w * S, b.d * S);
  }
  g.fillStyle = '#c9ccd2';
  for (let i = 0; i <= GRID_X; i++) { const [x, z0] = toMap(roadX(i) - ROAD / 2, Z0 - ROAD / 2); g.fillRect(x, z0, ROAD * S, (GRID_Z * 78 + ROAD) * S); }
  for (let j = 0; j <= GRID_Z; j++) { const [x0, z] = toMap(X0 - ROAD / 2, roadZ(j) - ROAD / 2); g.fillRect(x0, z, (GRID_X * 78 + ROAD) * S, ROAD * S); }
  mapImg = c;
}

// District names live only on the pause-screen map; on the minimap they would cover the streets.
const MAP_LABELS = [
  ['PALM HEIGHTS', () => [roadX(1), roadZ(2) + 40]], ['DOWNTOWN SOLARA', () => [roadX(4), roadZ(3) - 40]],
  ['VISTA MIDTOWN', () => [roadX(4), roadZ(0) + 40]], ['CORAL STRIP', () => [roadX(3), roadZ(6) - 40]],
  ['OLD PORT', () => [roadX(7), roadZ(3) + 40]], ['SUNSET BEACH', () => [0, BEACH_Z + 30]], ['SOLARA BAY', () => [0, LAND.minZ - 30]],
];

const statics = () => [
  { ...landmarks.safehouse, color: '#3ddc84', kind: 'safehouse' },
  { ...landmarks.gunshop, color: '#ff9f43', kind: 'shop' },
  { ...landmarks.garage, color: '#2fd3c4', kind: 'garage' },
  { ...landmarks.hospital, color: '#ff6b6b', kind: 'hospital' },
];

function playerXZ() { const p = game.player; return p.vehicle ? [p.vehicle.x, p.vehicle.z, p.vehicle.yaw] : [p.pos.x, p.pos.z, p.yaw]; }

function blipList() {
  const list = [...statics(), ...missionBlips()];
  for (const v of game.vehicles) if (v.pursuit && !v.wrecked) list.push({ x: v.x, z: v.z, color: Math.floor(game.time * 4) % 2 ? '#ff3b3b' : '#3b7bff', kind: 'cop', small: true });
  for (const c of game.peds) if (c.role === 'cop' && c.alive && !c.vehicle && wanted.level > 0) list.push({ x: c.pos.x, z: c.pos.z, color: '#3b7bff', kind: 'cop', small: true, tiny: true });
  return list;
}

function drawBlip(g, x, y, b, r = 6) {
  g.beginPath();
  g.fillStyle = b.color;
  g.strokeStyle = '#111';
  g.lineWidth = 2;
  if (b.kind === 'mission' || b.kind === 'target') {
    g.arc(x, y, r + 2, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#111'; g.font = '800 11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(b.kind === 'mission' ? 'M' : '!', x, y + 1);
  } else if (b.small) { g.arc(x, y, b.tiny ? 3 : 4.5, 0, Math.PI * 2); g.fill(); g.stroke(); }
  else { g.rect(x - r + 1, y - r + 1, r * 2 - 2, r * 2 - 2); g.fill(); g.stroke(); }
}

function drawArrow(g, x, y, ang, size = 9) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.beginPath(); g.moveTo(0, -size); g.lineTo(size * 0.7, size * 0.8); g.lineTo(0, size * 0.35); g.lineTo(-size * 0.7, size * 0.8); g.closePath();
  g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 2; g.fill(); g.stroke();
  g.restore();
}

function drawMinimap() {
  const cv = $('minimap'), g = cv.getContext('2d'), W = cv.width, R = W / 2;
  const [px, pz, pyaw] = playerXZ();
  const speed = game.player.vehicle ? game.player.vehicle.absSpeed : 0;
  const zoom = 1.25 - Math.min(0.55, speed * 0.015);
  const rot = -Math.PI / 2 - Math.atan2(Math.cos(rig.yaw), Math.sin(rig.yaw));
  g.save();
  g.clearRect(0, 0, W, W);
  g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#1b4d6e'; g.fillRect(0, 0, W, W);
  g.translate(R, R); g.rotate(rot); g.scale(zoom, zoom);
  const [mx, mz] = toMap(px, pz);
  g.drawImage(mapImg, -mx, -mz);
  g.restore();
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (const b of blipList()) {
    let dx = (b.x - px) * S * zoom, dz = (b.z - pz) * S * zoom;
    let x = dx * cr - dz * sr, y = dx * sr + dz * cr;
    const d = Math.hypot(x, y);
    if (d > R - 10) { if (b.small) continue; x *= (R - 10) / d; y *= (R - 10) / d; }
    drawBlip(g, R + x, R + y, b);
  }
  // player arrow points along the player's heading relative to the map rotation
  const heading = Math.atan2(Math.cos(pyaw), Math.sin(pyaw)) + rot + Math.PI / 2;
  drawArrow(g, R, R, heading);
  // north marker
  const nx = Math.cos(rot - Math.PI / 2) * (R - 2), ny = Math.sin(rot - Math.PI / 2) * (R - 2);
  const n = $('minimap-north');
  n.style.left = `${R + nx - 9}px`; n.style.top = `${R + ny - 9}px`;
  if (wanted.level > 0) { // red/blue edge pulse when hunted
    g.beginPath(); g.arc(R, R, R - 3, 0, Math.PI * 2);
    g.strokeStyle = Math.floor(game.time * 3) % 2 ? 'rgba(255,50,50,0.8)' : 'rgba(60,120,255,0.8)';
    g.lineWidth = 5; g.stroke();
  }
}

export function drawBigMap() {
  const cv = $('bigmap-canvas'), g = cv.getContext('2d');
  const sc = Math.min(cv.width / mapW, cv.height / mapH);
  g.fillStyle = '#0d2233'; g.fillRect(0, 0, cv.width, cv.height);
  const ox = (cv.width - mapW * sc) / 2, oy = (cv.height - mapH * sc) / 2;
  g.drawImage(mapImg, ox, oy, mapW * sc, mapH * sc);
  const at = (x, z) => { const [mx, mz] = toMap(x, z); return [ox + mx * sc, oy + mz * sc]; };
  g.font = '700 16px "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const [t, pos] of MAP_LABELS) { const [x, y] = at(...pos()); g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 4; g.strokeText(t, x, y); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillText(t, x, y); }
  for (const p of game.pickups) if (p.type === 'token' && !p.hidden) { const [x, y] = at(p.x, p.z); drawBlip(g, x, y, { color: '#2fd3c4', small: true }); }
  for (const b of blipList()) { const [x, y] = at(b.x, b.z); drawBlip(g, x, y, b, 7); if (b.label) { g.fillStyle = '#ffd23f'; g.font = '700 14px sans-serif'; g.fillText(b.label, x, y - 16); } }
  const [px, pz, pyaw] = playerXZ();
  const [x, y] = at(px, pz);
  drawArrow(g, x, y, Math.PI - pyaw, 12);
}

// ---------- event-driven panels ----------
const subs = [];
let subT = 0, bigT = 0, lastDistrict = '', districtT = 0, hitT = 0, timerVal = null;
function feed(text) {
  const d = document.createElement('div');
  d.innerHTML = text;
  $('feed').prepend(d);
  setTimeout(() => d.remove(), 4200);
  while ($('feed').children.length > 4) $('feed').lastChild.remove();
}
export function bigMessage(text, cls, sub = '') {
  const el = $('bigmsg');
  el.className = '';
  el.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
  void el.offsetWidth;
  el.className = `show ${cls}`;
  bigT = 3.2;
}
export function flash(alpha = 0.6) {
  const f = $('flash');
  f.style.transition = 'none'; f.style.opacity = alpha;
  requestAnimationFrame(() => { f.style.transition = 'opacity .5s'; f.style.opacity = 0; });
}

export function initHud() {
  renderMapImage();
  game.on('cash', (e) => { const c = $('cash'); c.classList.remove('bump'); void c.offsetWidth; if (e.amount) c.classList.add('bump'); if (e.amount > 0 && e.reason !== 'mission') feed(`<b style="color:#7dffa0">+$${e.amount}</b>`); });
  game.on('notice', (e) => { feed(e.text); if (e.big) flash(0.15); });
  game.on('subtitle', (e) => { subs.push(e); });
  game.on('objective', (e) => { $('objective').innerHTML = e.text ? `<span class="mname">${e.title}</span>${e.text}` : ''; });
  game.on('missionStart', (e) => bigMessage(e.title.toUpperCase(), 'passed', 'Mission'));
  game.on('missionPassed', (e) => { bigMessage('MISSION PASSED', 'passed', `+$${e.reward}${e.last ? ' · THE END — Solara Bay is yours to roam' : ''}`); $('objective').innerHTML = ''; });
  game.on('missionFailed', (e) => { bigMessage('MISSION FAILED', 'failed', e.reason || ''); $('objective').innerHTML = ''; });
  game.on('timer', (e) => { timerVal = e.t; });
  game.on('hitmark', () => { hitT = 0.2; const h = $('hitmark'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); });
  game.on('wanted', (e) => { if (e.cooled) feed(e.level ? `Heat cooling… ${e.level} star${e.level > 1 ? 's' : ''}` : 'You lost the cops.'); });
  game.on('radio', (e) => { $('radio').textContent = e.name ? `♪ ${e.name}` : 'Radio off'; });
}

const fmtHour = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

export function updateHud(dt, prompt) {
  const p = game.player;
  $('hp-fill').style.width = `${Math.max(0, p.health / p.maxHealth) * 100}%`;
  $('hp-fill').parentElement.classList.toggle('low', p.health < 30);
  $('ar-fill').style.width = `${p.armor}%`;
  $('ar-fill').parentElement.style.opacity = p.armor > 0 ? 1 : 0.35;
  $('cash').textContent = `$${game.cash.toLocaleString('en-US')}`;
  $('clock').textContent = fmtHour(game.hour);
  const w = WEAPONS[p.weapon];
  $('weapon-name').textContent = w.name;
  const slot = p.inv?.[p.weapon];
  $('ammo').textContent = w.melee ? '' : p.reloadT > 0 ? 'RELOADING' : `${slot?.mag ?? 0} / ${slot?.reserve ?? 0}`;
  let stars = '';
  for (let i = 1; i <= 5; i++) stars += `<span class="${i <= wanted.level ? 'on' : ''}">★</span>`;
  $('stars').innerHTML = stars;
  $('stars').classList.toggle('flash', wanted.level > 0 && !wanted.seen);
  const v = p.vehicle;
  $('speedo').classList.toggle('on', !!v);
  if (v) { $('speed').textContent = Math.round(v.absSpeed * 3.6); $('car-hp').firstElementChild.style.width = `${Math.max(0, v.health / v.spec.hp) * 100}%`; }
  const ch = $('crosshair');
  ch.classList.toggle('on', !v && p.aiming);
  $('damage-vignette').style.opacity = Math.max(0, (p.hitT || 0) * 3 + (p.health < 30 ? 0.35 + Math.sin(game.time * 6) * 0.15 : 0));
  $('prompt').innerHTML = prompt || '';
  $('timer').textContent = timerVal === null ? '' : `${Math.floor(timerVal / 60)}:${String(Math.max(0, Math.floor(timerVal % 60))).padStart(2, '0')}`;
  // district name pops up when it changes
  const [px, pz] = playerXZ();
  const dn = districtName(px, pz);
  if (dn !== lastDistrict) { lastDistrict = dn; districtT = 4; }
  districtT -= dt;
  $('district').textContent = districtT > 0 ? dn : '';
  // subtitles
  subT -= dt;
  if (subT <= 0) {
    const s = subs.shift();
    if (s) { $('subtitle').innerHTML = `<b>${s.speaker}:</b> ${s.text}`; subT = s.dur; game.emit('subtitleShown', s); }
    else $('subtitle').innerHTML = '';
  }
  bigT -= dt;
  hitT -= dt;
  drawMinimap();
}

export function clearSubtitles() { subs.length = 0; subT = 0; $('subtitle').innerHTML = ''; }
