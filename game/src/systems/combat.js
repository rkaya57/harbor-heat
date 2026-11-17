// Combat: weapon table, ammo and reloads, hitscan shooting with spread and pellets against
// people (headshots), cars (oriented boxes) and buildings, and melee punches with knockback.
import { game } from '../core/game.js';
import { segmentCast } from '../world/collision.js';
import { rng } from '../core/rng.js';

export const WEAPONS = {
  fist: { name: 'FISTS', melee: true, dmg: 14, rate: 0.42, range: 1.8 },
  pistol: { name: 'PISTOL', dmg: 34, rate: 0.2, mag: 12, spread: 0.01, range: 120, reload: 1.1, pellets: 1, price: 40 },
  smg: { name: 'SMG', dmg: 16, rate: 0.075, mag: 30, spread: 0.032, range: 90, reload: 1.5, pellets: 1, auto: true, price: 90 },
  shotgun: { name: 'SHOTGUN', dmg: 12, rate: 0.8, mag: 6, spread: 0.085, range: 40, reload: 2.0, pellets: 8, price: 70 },
};
export const WEAPON_ORDER = ['fist', 'pistol', 'smg', 'shotgun'];

export function giveWeapon(ch, id, rounds) {
  ch.inv = ch.inv || { fist: { mag: 0, reserve: 0 } };
  if (!ch.inv[id]) ch.inv[id] = { mag: 0, reserve: 0 };
  const w = WEAPONS[id];
  ch.inv[id].reserve += rounds;
  if (ch.inv[id].mag === 0) { const take = Math.min(w.mag, ch.inv[id].reserve); ch.inv[id].mag = take; ch.inv[id].reserve -= take; }
}

export function startReload(ch) {
  const w = WEAPONS[ch.weapon], slot = ch.inv?.[ch.weapon];
  if (w.melee || !slot || slot.reserve <= 0 || slot.mag >= w.mag || ch.reloadT > 0) return false;
  ch.reloadT = w.reload;
  game.emit('reload', { who: ch });
  return true;
}

export function updateReload(ch, dt) {
  if (!(ch.reloadT > 0)) return;
  ch.reloadT -= dt;
  if (ch.reloadT <= 0) {
    const w = WEAPONS[ch.weapon], slot = ch.inv[ch.weapon];
    const take = Math.min(w.mag - slot.mag, slot.reserve);
    slot.mag += take; slot.reserve -= take;
  }
}

/** Ray against an upright person approximated as a vertical cylinder. Returns t or Infinity. */
function rayPerson(ox, oy, oz, dx, dy, dz, c, maxT) {
  const px = c.pos.x - ox, pz = c.pos.z - oz;
  const hl = dx * dx + dz * dz;
  if (hl < 1e-6) return Infinity;
  const t = (px * dx + pz * dz) / hl;
  if (t < 0 || t > maxT) return Infinity;
  const qx = ox + dx * t - c.pos.x, qz = oz + dz * t - c.pos.z;
  if (qx * qx + qz * qz > 0.2) return Infinity;
  const y = oy + dy * t - c.pos.y;
  if (y < 0 || y > 1.85) return Infinity;
  return t;
}

/** Ray against a car's oriented bounding box. */
function rayCar(ox, oy, oz, dx, dy, dz, v, maxT) {
  const c = Math.cos(-v.yaw), s = Math.sin(-v.yaw);
  const lx = ox - v.x, lz = oz - v.z;
  const o = [lx * c - lz * s, oy - v.y, lx * s + lz * c];
  const d = [dx * c - dz * s, dy, dx * s + dz * c];
  const h = [v.spec.wid / 2, 0.3, v.spec.len / 2];
  const H = [v.spec.wid / 2, 0.32 + v.spec.hgt + 0.6, v.spec.len / 2];
  let t0 = 0, t1 = maxT;
  const lo = [-h[0], 0.25, -h[2]];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > H[k]) return Infinity; continue; }
    let a = (lo[k] - o[k]) / d[k], b = (H[k] - o[k]) / d[k];
    if (a > b) { const tmp = a; a = b; b = tmp; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return Infinity;
  }
  return t0;
}

/** Trace one bullet from a muzzle. Returns what it hit. */
export function traceBullet(shooter, ox, oy, oz, dx, dy, dz, range) {
  const wall = segmentCast(ox, oy, oz, ox + dx * range, oy + dy * range, oz + dz * range) * range;
  let best = Math.min(wall, oy + dy * range < 0 && dy < 0 ? -oy / dy : Infinity);
  let target = null, car = null;
  const all = game.player ? [game.player, ...game.peds] : game.peds;
  for (const c of all) {
    if (c === shooter || !c.alive || c.vehicle) continue;
    const t = rayPerson(ox, oy, oz, dx, dy, dz, c, best);
    if (t < best) { best = t; target = c; car = null; }
  }
  for (const v of game.vehicles) {
    if (shooter && shooter.vehicle === v) continue;
    if ((v.x - ox) ** 2 + (v.z - oz) ** 2 > (range + 6) ** 2) continue;
    const t = rayCar(ox, oy, oz, dx, dy, dz, v, best);
    if (t < best) { best = t; car = v; target = null; }
  }
  if (!isFinite(best)) best = range;
  return { t: best, x: ox + dx * best, y: oy + dy * best, z: oz + dz * best, target, car };
}

/**
 * Fire the shooter's current weapon from muzzle (mx,my,mz) toward the aim point (ax,ay,az).
 * Consumes ammo, applies damage, emits 'shot' and 'impact'. Returns false if it could not fire.
 */
export function fireWeapon(shooter, mx, my, mz, ax, ay, az, accuracy = 1) {
  const w = WEAPONS[shooter.weapon];
  if (!w || w.melee || shooter.fireT > 0 || shooter.reloadT > 0) return false;
  const slot = shooter.inv?.[shooter.weapon];
  if (slot && slot.mag <= 0) { if (!startReload(shooter)) game.emit('dryfire', { who: shooter }); return false; }
  if (slot) slot.mag--;
  shooter.fireT = w.rate;
  let dx = ax - mx, dy = ay - my, dz = az - mz;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  game.emit('shot', { who: shooter, weapon: shooter.weapon, x: mx, y: my, z: mz, dx, dy, dz });
  let hitAny = false;
  for (let p = 0; p < (w.pellets || 1); p++) {
    const sp = w.spread / accuracy;
    const ex = dx + rng.range(-sp, sp), ey = dy + rng.range(-sp, sp) * 0.7, ez = dz + rng.range(-sp, sp);
    const l = Math.hypot(ex, ey, ez);
    const h = traceBullet(shooter, mx, my, mz, ex / l, ey / l, ez / l, w.range);
    game.emit('impact', { x0: mx, y0: my, z0: mz, x: h.x, y: h.y, z: h.z, flesh: !!h.target, metal: !!h.car });
    if (h.target) {
      const head = h.y - h.target.pos.y > 1.55;
      const falloff = 1 - Math.min(0.5, h.t / w.range * 0.6);
      h.target.damage(w.dmg * falloff * (head ? 2.2 : 1), shooter, ex / l, ez / l);
      hitAny = true;
      if (head) game.emit('headshot', { target: h.target, source: shooter });
    } else if (h.car) {
      h.car.damage(w.dmg * 0.35);
      if (h.car.driver && h.car.driver !== game.player && shooter === game.player && h.car.driver.role !== 'cop') h.car.driver.scared = 6;
      game.emit('carShot', { car: h.car, source: shooter });
      hitAny = true;
    }
  }
  if (hitAny && shooter === game.player) game.emit('hitmark', {});
  return true;
}

/** Punch whoever is in front of the attacker. */
export function punch(attacker) {
  if (attacker.punchT > 0) return false;
  attacker.punchT = 0.35;
  game.emit('swing', { who: attacker });
  const fx = Math.sin(attacker.yaw), fz = Math.cos(attacker.yaw);
  const all = game.player ? [game.player, ...game.peds] : game.peds;
  let hit = null, bestD = WEAPONS.fist.range;
  for (const c of all) {
    if (c === attacker || !c.alive || c.vehicle) continue;
    const dx = c.pos.x - attacker.pos.x, dz = c.pos.z - attacker.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD || d < 0.01) continue;
    if ((dx * fx + dz * fz) / d < 0.5) continue;
    bestD = d; hit = c;
  }
  if (hit) {
    setTimeout(() => {
      if (!hit.alive) return;
      hit.damage(WEAPONS.fist.dmg * (attacker.role === 'player' ? 1 : 0.7), attacker, fx, fz);
      hit.vx += fx * 3; hit.vz += fz * 3;
      game.emit('punchHit', { who: attacker, target: hit });
    }, 110);
  }
  return true;
}
