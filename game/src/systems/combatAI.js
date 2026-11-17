// Shooter brain shared by police on foot, gang members and mission bosses: close to a preferred
// range, strafe, unstick around walls, aim with lead and skill-based spread, punch when unarmed.
import { game } from '../core/game.js';
import { lineOfSight } from '../world/collision.js';
import { fireWeapon, punch, startReload, updateReload } from './combat.js';
import { rng } from '../core/rng.js';

export function targetPoint(t) {
  if (t.vehicle) return { x: t.vehicle.x, y: t.vehicle.y + 1.0, z: t.vehicle.z, vx: t.vehicle.vx, vz: t.vehicle.vz };
  return { x: t.pos.x, y: t.pos.y + 1.2, z: t.pos.z, vx: t.vx, vz: t.vz };
}

export function updateShooter(c, target, dt, o = {}) {
  const near = o.near ?? 7, far = o.far ?? 16, skill = o.skill ?? 0.5, speed = o.speed ?? 5;
  const tp = targetPoint(target);
  const dx = tp.x - c.pos.x, dz = tp.z - c.pos.z, d = Math.hypot(dx, dz) || 1;
  const ux = dx / d, uz = dz / d;
  const los = d < 70 && lineOfSight(c.pos.x, c.pos.y + 1.5, c.pos.z, tp.x, tp.y, tp.z);
  c.ai = c.ai || { strafe: rng.chance(0.5) ? 1 : -1, strafeT: 0, stuckT: 0, burst: 0, unstick: 0 };
  const ai = c.ai;
  updateReload(c, dt);
  let wx = 0, wz = 0;
  if (ai.unstick > 0) {
    ai.unstick -= dt;
    wx = -uz * ai.strafe * speed; wz = ux * ai.strafe * speed;
  } else if (!los || d > far) {
    wx = ux * speed; wz = uz * speed;
  } else if (d < near) {
    wx = -ux * speed * 0.6 - uz * ai.strafe * 2; wz = -uz * speed * 0.6 + ux * ai.strafe * 2;
  } else {
    ai.strafeT -= dt;
    if (ai.strafeT <= 0) { ai.strafe = -ai.strafe; ai.strafeT = rng.range(1, 2.5); }
    wx = -uz * ai.strafe * 2.2; wz = ux * ai.strafe * 2.2;
  }
  c.drive(dt, wx, wz, 18);
  // stuck on a corner: slide sideways for a moment
  if (Math.hypot(wx, wz) > 1 && c.speed < 0.4) { ai.stuckT += dt; if (ai.stuckT > 0.6) { ai.unstick = 1.2; ai.stuckT = 0; ai.strafe = -ai.strafe; } } else ai.stuckT = 0;
  c.faceTo(Math.atan2(ux, uz), dt, 10);

  const armed = c.weapon !== 'fist';
  c.aiming = armed && los && d < far + 10;
  if (!armed) {
    if (d < 1.5 && rng.chance(dt * 2.5)) punch(c);
    return { d, los };
  }
  if (c.inv?.[c.weapon]?.mag === 0) { if (c.inv[c.weapon].reserve === 0) c.inv[c.weapon].reserve = 60; startReload(c); }
  if (c.aiming && (o.canShoot ?? true)) {
    ai.burst -= dt;
    if (ai.burst <= 0 && c.fireT <= 0) {
      const lead = d / 160;
      const miss = (1 - skill) * (1.2 + (target.vehicle ? 0 : target.speed * 0.25));
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      fireWeapon(c, c.pos.x + fx * 0.5, c.pos.y + 1.42, c.pos.z + fz * 0.5,
        tp.x + tp.vx * lead + rng.range(-miss, miss), tp.y + rng.range(-miss, miss) * 0.6, tp.z + tp.vz * lead + rng.range(-miss, miss), 0.8);
      if (rng.chance(0.25)) ai.burst = rng.range(0.6, 1.4);
    }
  }
  void game;
  return { d, los };
}
