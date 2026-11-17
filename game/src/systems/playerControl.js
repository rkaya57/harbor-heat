// Player controller: on-foot movement relative to the camera, sprint/jump, aim and shoot, punch,
// weapon wheel, entering/exiting and carjacking cars, and driving input. Emits crimes for police.
import { game } from '../core/game.js';
import { input } from '../core/input.js';
import { rig, aimRay, addTrauma } from './cameraRig.js';
import { WEAPONS, WEAPON_ORDER, fireWeapon, punch, startReload, updateReload, traceBullet } from './combat.js';
import { PLAYER } from '../core/config.js';
import { Character } from '../entities/character.js';

export function createPlayer(x, z) {
  const p = new Character('player', x, z, Math.PI);
  p.maxHealth = PLAYER.maxHealth;
  p.health = p.maxHealth;
  p.inv = { fist: { mag: 0, reserve: 0 } };
  p.isPlayer = true;
  p.enterT = 0;
  return p;
}

function nearestCar(p, maxD = 4.2) {
  let best = null, bd = maxD;
  for (const v of game.vehicles) {
    if (v.wrecked) continue;
    const d = Math.hypot(v.x - p.pos.x, v.z - p.pos.z) - v.spec.len * 0.3;
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

export function enterVehicle(p, v) {
  if (v.driver && v.driver !== p) {
    const victim = v.driver;
    victim.vehicle = null;
    victim.pos.set(v.x + Math.cos(v.yaw) * 1.9, v.y, v.z - Math.sin(v.yaw) * 1.9);
    victim.root.visible = true;
    victim.scared = 10;
    victim.damage(5, p, Math.cos(v.yaw), -Math.sin(v.yaw));
    v.ai = null;
    game.emit('carjack', { player: p, car: v, victim });
    game.emit('crime', { type: v.type === 'police' ? 'copcar' : 'carjack', x: v.x, z: v.z });
  } else if (v.type === 'police' || v.mission === 'locked') {
    game.emit('crime', { type: 'copcar', x: v.x, z: v.z });
  }
  if (!v._stolen) { v._stolen = true; game.stats.carsStolen++; }
  v.driver = p;
  v.ai = null;
  p.vehicle = v;
  p.aiming = false;
  p.root.visible = false;
  rig.yaw = v.yaw;
  game.emit('enterCar', { car: v });
}

export function exitVehicle(p) {
  const v = p.vehicle;
  if (!v) return;
  const fast = v.absSpeed > 9;
  v.driver = null;
  v.ctl.throttle = 0; v.ctl.steer = 0; v.ctl.handbrake = !fast;
  p.vehicle = null;
  p.root.visible = true;
  const sx = Math.cos(v.yaw), sz = -Math.sin(v.yaw); // the car's left side
  p.pos.set(v.x + sx * (v.spec.wid / 2 + 0.7), v.y, v.z + sz * (v.spec.wid / 2 + 0.7));
  p.vx = v.vx * 0.5; p.vz = v.vz * 0.5;
  p.yaw = v.yaw;
  if (fast) { p.damage(Math.min(30, v.absSpeed), null); addTrauma(0.5); }
  v.siren = false;
  game.emit('exitCar', { car: v });
}

export function updatePlayer(p, dt) {
  if (!p.alive) { p.update(dt); return; }
  if (input.pressed('KeyF') || input.pressed('Enter')) {
    if (p.vehicle) exitVehicle(p);
    else { const v = nearestCar(p); if (v) enterVehicle(p, v); }
  }
  if (p.vehicle) { driveInput(p, dt); return; }
  footInput(p, dt);
  p.update(dt);
}

function driveInput(p, dt) {
  const v = p.vehicle;
  v.ctl.throttle = input.axis('KeyS', 'KeyW') || input.axis('ArrowDown', 'ArrowUp');
  v.ctl.steer = input.axis('KeyD', 'KeyA') || input.axis('ArrowRight', 'ArrowLeft');
  v.ctl.handbrake = input.down('Space');
  if (input.pressed('KeyH')) game.emit('horn', { car: v });
  if (input.pressed('KeyG') && v.type === 'police') v.siren = !v.siren;
  if (input.pressed('KeyR')) game.emit('radioNext', {});
  p.pos.set(v.x, v.y, v.z);
  game.stats.distance += v.absSpeed * dt;
}

function footInput(p, dt) {
  // weapon selection
  const owned = WEAPON_ORDER.filter((id) => id === 'fist' || p.inv[id]);
  let idx = owned.indexOf(p.weapon);
  if (input.mouse.wheel) idx = (idx + input.mouse.wheel + owned.length) % owned.length;
  if (input.pressed('KeyQ')) idx = (idx + 1) % owned.length;
  for (let k = 1; k <= 4; k++) if (input.pressed('Digit' + k) && owned.includes(WEAPON_ORDER[k - 1])) idx = owned.indexOf(WEAPON_ORDER[k - 1]);
  if (owned[idx] !== p.weapon) { p.setWeapon(owned[idx]); p.reloadT = 0; game.emit('weaponSwap', { id: p.weapon }); }
  if (input.pressed('KeyR')) startReload(p);
  updateReload(p, dt);

  const f = input.axis('KeyS', 'KeyW'), s = input.axis('KeyA', 'KeyD');
  const fx = Math.sin(rig.yaw), fz = Math.cos(rig.yaw), rx = -fz, rz = fx;
  let wx = fx * f + rx * s, wz = fz * f + rz * s;
  const l = Math.hypot(wx, wz);
  if (l > 1) { wx /= l; wz /= l; }
  const armed = WEAPONS[p.weapon] && !WEAPONS[p.weapon].melee;
  p.aiming = input.mouse.right && armed;
  const sprint = input.down('ShiftLeft') && !p.aiming;
  const speed = p.aiming ? 2.6 : sprint ? PLAYER.run : PLAYER.walk;
  p.drive(dt, wx * speed, wz * speed, PLAYER.accel);
  if (p.aiming || (input.mouse.left && armed)) p.faceTo(rig.yaw, dt, 22);
  else if (l > 0.1) p.faceTo(Math.atan2(wx, wz), dt, 12);
  if (input.pressed('Space') && p.grounded) { p.vy = 6.2; game.emit('jump', {}); }

  // attack
  const w = WEAPONS[p.weapon];
  const wants = w.auto ? input.mouse.left : input.mouse.leftPressed;
  if (wants) {
    if (w.melee) { if (punch(p)) game.emit('crime', { type: 'brawl', x: p.pos.x, z: p.pos.z, quiet: true }); }
    else {
      const r = aimRay();
      const aim = traceBullet(p, r.ox + r.dx * 2.5, r.oy + r.dy * 2.5, r.oz + r.dz * 2.5, r.dx, r.dy, r.dz, 160);
      const mx = p.pos.x + fx * 0.55 - fz * 0.28, mz = p.pos.z + fz * 0.55 + fx * 0.28;
      if (fireWeapon(p, mx, p.pos.y + 1.42, mz, aim.x, aim.y, aim.z, p.aiming ? 1.6 : 0.8)) {
        addTrauma(p.weapon === 'shotgun' ? 0.32 : 0.1);
        rig.pitch -= p.weapon === 'shotgun' ? 0.03 : 0.008;
        game.emit('crime', { type: 'gunfire', x: p.pos.x, z: p.pos.z });
      }
    }
  }
}
