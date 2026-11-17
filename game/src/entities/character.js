// Character: one class for the player, pedestrians, police and gangs. Movement with collision,
// health and armour, weapons held, death, and the procedural animator (walk, run, aim, punch, fall).
import * as THREE from 'three';
import { makeHuman, setHeldWeapon } from './models.js';
import { resolveCircle } from '../world/collision.js';
import { groundHeight } from '../world/cityLayout.js';
import { game } from '../core/game.js';
import { damp, dampAngle } from '../core/rng.js';

export class Character {
  constructor(role, x, z, yaw = 0) {
    this.role = role;
    const m = makeHuman(role);
    this.root = m.root;
    this.parts = m.parts;
    this.pos = new THREE.Vector3(x, groundHeight(x, z), z);
    this.yaw = yaw;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.radius = 0.42;
    this.maxHealth = role === 'boss' ? 300 : role === 'player' ? 100 : role === 'cop' ? 90 : 60;
    this.health = this.maxHealth;
    this.armor = 0;
    this.alive = true;
    this.vehicle = null;
    this.weapon = 'fist';
    this.aiming = false;
    this.phase = Math.random() * 6;
    this.punchT = 0; this.hitT = 0; this.deadT = 0; this.fireT = 0; this.flinch = 0;
    this.speed = 0;
    this.grounded = true;
    this.root.position.copy(this.pos);
    game.scene.add(this.root);
  }

  setWeapon(id) { this.weapon = id; setHeldWeapon(this.parts, id); }

  /** Steer toward a desired planar velocity (wx, wz in m/s) with acceleration `acc`. */
  drive(dt, wx, wz, acc = 22) {
    this.vx = damp(this.vx, wx, acc / 4, dt);
    this.vz = damp(this.vz, wz, acc / 4, dt);
  }

  faceTo(yaw, dt, rate = 12) { this.yaw = dampAngle(this.yaw, yaw, rate, dt); }

  update(dt) {
    if (this.vehicle) return;
    if (!this.alive) { this.animateDead(dt); return; }
    let x = this.pos.x + this.vx * dt, z = this.pos.z + this.vz * dt;
    const r = resolveCircle(x, z, this.radius, this.pos.y + 0.5);
    x = r.x; z = r.z;
    if (r.hit) { const vn = this.vx * r.nx + this.vz * r.nz; if (vn < 0) { this.vx -= vn * r.nx; this.vz -= vn * r.nz; } }
    const gh = groundHeight(x, z);
    this.vy -= 22 * dt;
    let y = this.pos.y + this.vy * dt;
    if (y <= gh) { y = gh; this.vy = 0; this.grounded = true; } else if (y > gh + 0.05) this.grounded = false;
    if (gh - this.pos.y > 0 && gh - this.pos.y < 0.3) y = gh; // step up curbs
    this.pos.set(x, y, z);
    this.speed = Math.hypot(this.vx, this.vz);
    this.punchT = Math.max(0, this.punchT - dt);
    this.hitT = Math.max(0, this.hitT - dt);
    this.fireT = Math.max(0, this.fireT - dt);
    this.flinch = Math.max(0, this.flinch - dt * 4);
    this.animate(dt);
  }

  animate(dt) {
    const p = this.parts;
    const run = Math.min(1, this.speed / 6.5);
    this.phase += dt * (2 + this.speed * 1.55);
    const s = Math.sin(this.phase);
    const amp = this.speed > 0.3 ? 0.35 + run * 0.55 : 0;
    p.legL.upper.rotation.x = damp(p.legL.upper.rotation.x, s * amp, 18, dt);
    p.legR.upper.rotation.x = damp(p.legR.upper.rotation.x, -s * amp, 18, dt);
    p.legL.lower.rotation.x = damp(p.legL.lower.rotation.x, Math.max(0, -s) * amp * 1.3, 18, dt);
    p.legR.lower.rotation.x = damp(p.legR.lower.rotation.x, Math.max(0, s) * amp * 1.3, 18, dt);
    p.body.position.y = 0.98 + Math.abs(Math.cos(this.phase)) * 0.05 * (amp > 0 ? 1 : 0);
    p.body.rotation.x = damp(p.body.rotation.x, run * 0.18 - this.flinch * 0.3, 10, dt);
    const armed = this.weapon !== 'fist';
    if (this.aiming && armed) {
      p.armR.upper.rotation.x = damp(p.armR.upper.rotation.x, -Math.PI / 2 + (this.fireT > 0.05 ? -0.15 : 0), 25, dt);
      p.armR.lower.rotation.x = damp(p.armR.lower.rotation.x, 0, 25, dt);
      p.armL.upper.rotation.x = damp(p.armL.upper.rotation.x, this.weapon === 'pistol' ? -1.3 : -1.45, 25, dt);
      p.armL.upper.rotation.z = damp(p.armL.upper.rotation.z, -0.55, 25, dt);
      p.armL.lower.rotation.x = damp(p.armL.lower.rotation.x, -0.3, 25, dt);
    } else if (this.punchT > 0) {
      const k = this.punchT / 0.35;
      const jab = Math.sin(k * Math.PI);
      p.armR.upper.rotation.x = -1.5 * jab;
      p.armR.lower.rotation.x = -0.2;
      p.armL.upper.rotation.x = -0.9; p.armL.lower.rotation.x = -1.4; p.armL.upper.rotation.z = 0;
      p.body.rotation.y = -0.4 * jab;
    } else {
      p.armR.upper.rotation.x = damp(p.armR.upper.rotation.x, -s * amp * 0.9 + (armed ? -0.2 : 0), 14, dt);
      p.armL.upper.rotation.x = damp(p.armL.upper.rotation.x, s * amp * 0.9, 14, dt);
      p.armL.upper.rotation.z = damp(p.armL.upper.rotation.z, 0, 14, dt);
      p.armR.lower.rotation.x = damp(p.armR.lower.rotation.x, -0.3 - run * 0.9, 14, dt);
      p.armL.lower.rotation.x = damp(p.armL.lower.rotation.x, -0.3 - run * 0.9, 14, dt);
      p.body.rotation.y = damp(p.body.rotation.y, 0, 10, dt);
    }
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }

  animateDead(dt) {
    this.deadT += dt;
    const k = Math.min(1, this.deadT / 0.5);
    this.root.rotation.x = -Math.PI / 2 * (k * k);
    this.root.position.set(this.pos.x, this.pos.y + 0.18 * k, this.pos.z);
    this.root.rotation.y = this.yaw;
    const p = this.parts;
    p.armL.upper.rotation.z = -1.2 * k; p.armR.upper.rotation.z = 1.2 * k;
    // slide out the remaining momentum
    this.pos.x += this.vx * dt; this.pos.z += this.vz * dt;
    this.vx *= Math.exp(-4 * dt); this.vz *= Math.exp(-4 * dt);
  }

  /** Apply damage; armour soaks 60% first. Returns true if this hit killed. */
  damage(amount, source = null, dirX = 0, dirZ = 0) {
    if (!this.alive) return false;
    if (this.armor > 0) { const soak = Math.min(this.armor, amount * 0.6); this.armor -= soak; amount -= soak; }
    this.health -= amount;
    this.hitT = 0.25; this.flinch = 1;
    this.vx += dirX * 2.5; this.vz += dirZ * 2.5;
    game.emit('hit', { target: this, source, amount });
    if (this.health <= 0) { this.die(source, dirX, dirZ); return true; }
    return false;
  }

  die(source, dirX = 0, dirZ = 0) {
    this.alive = false;
    this.health = 0;
    this.aiming = false;
    this.vx = dirX * 4; this.vz = dirZ * 4;
    game.emit('death', { target: this, source });
  }

  dispose() {
    game.scene.remove(this.root);
  }
}
