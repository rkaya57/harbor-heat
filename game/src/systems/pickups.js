// Pickups: dropped cash, health, armour, weapons and the twelve hidden Sun Tokens.
// Bob and spin in the world, collected by walking (or driving) through them.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { giveWeapon, WEAPONS } from './combat.js';
import { groundHeight } from '../world/cityLayout.js';
import { pointBlocked } from '../world/collision.js';
import { glowTexture } from '../world/textures.js';
import { blockCenterX, blockCenterZ, LAND, BEACH_Z, roadX, roadZ } from '../core/config.js';

const LOOK = {
  cash: [0x5be37d, 0.5, 0.25, 0.32], health: [0xff4d4d, 0.5, 0.5, 0.18], armor: [0x3aa0ff, 0.55, 0.6, 0.2],
  pistol: [0xffc04d, 0.5, 0.2, 0.15], smg: [0xffc04d, 0.7, 0.24, 0.15], shotgun: [0xffc04d, 0.9, 0.18, 0.15], token: [0xffd23f, 0.9, 0.9, 0.12],
};

export const TOKEN_SPOTS = [
  [blockCenterX(0) - 20, blockCenterZ(0) - 20], [blockCenterX(3), blockCenterZ(2)], [blockCenterX(7) + 22, blockCenterZ(6) - 4],
  [LAND.minX + 16, LAND.maxZ - 30], [blockCenterX(5), BEACH_Z + 40], [roadX(8) + 12, roadZ(0) - 4],
  [blockCenterX(1), blockCenterZ(4) + 6], [blockCenterX(6) - 20, blockCenterZ(0)], [blockCenterX(4) + 26, blockCenterZ(3) + 26],
  [roadX(0) - 12, blockCenterZ(5)], [blockCenterX(2) - 26, blockCenterZ(6) + 26], [blockCenterX(7), blockCenterZ(3) + 24],
];

function makeMesh(type) {
  const [col, w, h, d] = LOOK[type] || LOOK.cash;
  const g = new THREE.Group();
  let m;
  if (type === 'token') {
    m = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, d, 24), new THREE.MeshStandardMaterial({ color: col, emissive: 0xff9a1a, emissiveIntensity: 0.9, metalness: 0.8, roughness: 0.25 }));
    m.rotation.x = Math.PI / 2;
  } else if (type === 'health') {
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6 });
    m = new THREE.Group();
    m.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.16), mat), new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), mat));
  } else {
    m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.4 }));
  }
  g.add(m);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(1.8, 1.8, 1);
  g.add(halo);
  return g;
}

export function spawnPickup(type, x, z, amount = 0, extra = {}) {
  const mesh = makeMesh(type);
  const y = groundHeight(x, z) + 0.75;
  mesh.position.set(x, y, z);
  game.scene.add(mesh);
  const p = { type, x, z, y, amount, mesh, t: Math.random() * 6, life: extra.permanent ? Infinity : 60, ...extra };
  game.pickups.push(p);
  return p;
}

/** Nudge a spot outward in a spiral until it is clear of buildings and props. */
function freeSpot(x, z) {
  for (let r = 0; r < 30; r += 1.5) {
    for (let a = 0; a < 8; a++) {
      const px = x + Math.cos(a * Math.PI / 4) * r, pz = z + Math.sin(a * Math.PI / 4) * r;
      if (!pointBlocked(px, pz, 1.2)) return [px, pz];
    }
  }
  return [x, z];
}

export function placeWorldPickups(collected = []) {
  TOKEN_SPOTS.forEach(([x0, z0], i) => { const [x, z] = freeSpot(x0, z0); if (!collected.includes(i)) spawnPickup('token', x, z, 500, { permanent: true, tokenId: i }); });
  const fixed = [['health', blockCenterX(5), blockCenterZ(1) + 28], ['armor', blockCenterX(2) + 28, blockCenterZ(3)], ['pistol', blockCenterX(1) + 2, blockCenterZ(2) - 28],
    ['health', blockCenterX(0) + 28, blockCenterZ(5)], ['smg', blockCenterX(7) - 4, blockCenterZ(5) + 2], ['shotgun', blockCenterX(4), blockCenterZ(6) - 28], ['health', blockCenterX(6) + 28, blockCenterZ(1)]];
  for (const [t, x0, z0] of fixed) { const [x, z] = freeSpot(x0, z0); spawnPickup(t, x, z, t === 'smg' ? 60 : t === 'shotgun' ? 16 : t === 'pistol' ? 36 : 0, { permanent: true, respawn: 90 }); }
}

export function updatePickups(dt) {
  const pl = game.player;
  for (let i = game.pickups.length - 1; i >= 0; i--) {
    const p = game.pickups[i];
    p.t += dt;
    if (p.hidden) { p.hiddenT -= dt; if (p.hiddenT <= 0) { p.hidden = false; p.mesh.visible = true; } continue; }
    p.life -= dt;
    p.mesh.rotation.y = p.t * 2;
    p.mesh.position.y = p.y + Math.sin(p.t * 3) * 0.15;
    if (p.life <= 0) { remove(i); continue; }
    if (!pl.alive) continue;
    const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
    const reach = pl.vehicle ? 2.6 : 1.3;
    if (d > reach || (pl.vehicle && !['cash', 'token'].includes(p.type))) continue;
    collect(p);
    if (p.respawn) { p.hidden = true; p.hiddenT = p.respawn; p.mesh.visible = false; }
    else remove(i);
  }
}

function collect(p) {
  const pl = game.player;
  if (p.type === 'cash') { game.addCash(p.amount, 'pickup'); }
  else if (p.type === 'health') { pl.health = Math.min(pl.maxHealth, pl.health + 50); game.emit('notice', { text: '+50 Health' }); }
  else if (p.type === 'armor') { pl.armor = 100; game.emit('notice', { text: 'Body armour equipped' }); }
  else if (p.type === 'token') {
    game.stats.tokens++;
    game.flags.tokens = [...(game.flags.tokens || []), p.tokenId];
    game.addCash(p.amount, 'token');
    game.emit('notice', { text: `Sun Token ${game.stats.tokens}/12 found!`, big: true });
  } else if (WEAPONS[p.type]) {
    const had = !!pl.inv[p.type];
    giveWeapon(pl, p.type, p.amount || 24);
    if (!had || pl.weapon === 'fist') pl.setWeapon(p.type);
    game.emit('notice', { text: `${WEAPONS[p.type].name} +${p.amount || 24}` });
  }
  game.emit('pickup', { type: p.type });
}

function remove(i) {
  game.scene.remove(game.pickups[i].mesh);
  game.pickups.splice(i, 1);
}
