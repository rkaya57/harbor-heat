// Vehicle: arcade bicycle-model car physics (engine, brakes, tyre grip, handbrake drift),
// building and car-to-car collisions, damage → smoke → fire → explosion, and visual suspension.
import * as THREE from 'three';
import { makeCar } from './models.js';
import { resolveCircle } from '../world/collision.js';
import { groundHeight } from '../world/cityLayout.js';
import { game } from '../core/game.js';
import { clamp, damp } from '../core/rng.js';

export class Vehicle {
  constructor(type, x, z, yaw = 0, color) {
    const m = makeCar(type, color);
    Object.assign(this, { model: m, root: m.root, spec: m.spec, type });
    this.x = x; this.z = z; this.y = 0; this.yaw = yaw;
    this.vx = 0; this.vz = 0; this.yawRate = 0;
    this.steer = 0;
    this.ctl = { throttle: 0, steer: 0, handbrake: false };
    this.health = m.spec.hp;
    this.driver = null;        // Character or null
    this.ai = null;            // traffic/police brain
    this.siren = false;
    this.fire = 0; this.wrecked = false; this.burnT = 0;
    this.roll = 0; this.pitch = 0; this.wheelSpin = 0;
    this.lastImpact = 0;
    this.skid = 0;
    this.mission = null;       // tag set by missions
    this.root.position.set(x, 0, z);
    this.root.rotation.y = yaw;
    game.scene.add(this.root);
  }

  get fwdX() { return Math.sin(this.yaw); }
  get fwdZ() { return Math.cos(this.yaw); }
  get speed() { return this.vx * this.fwdX + this.vz * this.fwdZ; }
  get absSpeed() { return Math.hypot(this.vx, this.vz); }

  update(dt) {
    const s = this.spec;
    const c = this.wrecked ? { throttle: 0, steer: 0, handbrake: true } : this.ctl;
    const fx = this.fwdX, fz = this.fwdZ, rx = fz, rz = -fx;
    let vf = this.vx * fx + this.vz * fz;
    let vr = this.vx * rx + this.vz * rz;

    // engine and brakes
    if (c.throttle > 0) {
      if (vf < -0.5) vf += 30 * c.throttle * dt;
      else vf += s.accel * c.throttle * Math.max(0.15, 1 - vf / s.top) * dt;
    } else if (c.throttle < 0) {
      if (vf > 0.5) vf -= 32 * -c.throttle * dt;
      else vf = Math.max(-12, vf - 9 * -c.throttle * dt);
    }
    vf -= vf * (c.throttle === 0 ? 0.35 : 0.08) * dt + Math.sign(vf) * Math.min(Math.abs(vf), 0.6 * dt);
    if (c.handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 9 * dt);

    // steering eases in and narrows with speed
    const maxSteer = 0.62 / (1 + Math.abs(vf) * 0.045);
    this.steer = damp(this.steer, c.steer * maxSteer, 9, dt);
    const wheelbase = s.len * 0.62;
    let yawRate = (vf * Math.tan(this.steer)) / wheelbase;
    if (c.handbrake && Math.abs(vf) > 6) yawRate *= 1.55;
    this.yawRate = yawRate;
    this.yaw += yawRate * dt;

    // lateral grip: the handbrake lets the rear slide out
    const grip = c.handbrake ? s.grip * 0.18 : s.grip;
    const vrOld = vr;
    vr *= Math.exp(-grip * dt);
    this.skid = Math.min(1, Math.abs(vrOld) / 6);

    const nfx = Math.sin(this.yaw), nfz = Math.cos(this.yaw);
    this.vx = nfx * vf + nfz * vr;
    this.vz = nfz * vf - nfx * vr;

    // integrate + collide (two circles along the body)
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.collideStatic();
    const gh = groundHeight(this.x, this.z);
    this.y = damp(this.y, gh, 14, dt);

    // fire and wreck
    if (this.health <= 0 && !this.wrecked) {
      this.fire += dt;
      if (this.fire > 4.5) this.explode();
    }
    if (this.wrecked) { this.burnT -= dt; }

    this.animate(dt, vf, vr);
  }

  collideStatic() {
    const s = this.spec;
    const off = s.len * 0.3, r = s.wid * 0.52;
    for (const k of [1, -1]) {
      const cx = this.x + this.fwdX * off * k, cz = this.z + this.fwdZ * off * k;
      const res = resolveCircle(cx, cz, r, this.y + 0.5);
      if (!res.hit) continue;
      const dx = res.x - cx, dz = res.z - cz;
      this.x += dx; this.z += dz;
      // use the net push as the contact normal: wedged between two boxes, the last box's own
      // normal can point sideways and leave the car pinned at full speed
      const dl = Math.hypot(dx, dz);
      const nx = dl > 1e-6 ? dx / dl : res.nx, nz = dl > 1e-6 ? dz / dl : res.nz;
      const vn = this.vx * nx + this.vz * nz;
      if (vn < 0) {
        this.vx -= vn * nx * 1.35; this.vz -= vn * nz * 1.35;
        this.vx *= 0.92; this.vz *= 0.92;
        this.yaw += k * (this.fwdX * nz - this.fwdZ * nx) * Math.min(0.08, -vn * 0.01);
        this.impact(-vn, res.x, res.z);
      }
    }
  }

  impact(force, px, pz) {
    if (force < 4 || game.time - this.lastImpact < 0.15) return;
    this.lastImpact = game.time;
    this.damage(Math.max(0, force - 6) * 1.6 / this.spec.mass);
    game.emit('crash', { vehicle: this, force, x: px, z: pz });
  }

  damage(n) {
    if (this.wrecked) return;
    this.health -= n;
  }

  explode() {
    if (this.wrecked) return;
    this.wrecked = true;
    this.health = 0;
    this.burnT = 12;
    this.vx *= 0.3; this.vz *= 0.3;
    const burnt = new THREE.MeshStandardMaterial({ color: 0x1e1b19, roughness: 1 });
    this.root.traverse((o) => { if (o.isMesh && o.material === this.model.paint) o.material = burnt; });
    this.model.headMat.emissiveIntensity = 0; this.model.tailMat.emissiveIntensity = 0;
    game.emit('explosion', { x: this.x, y: this.y + 1, z: this.z, radius: 8, source: this, vehicle: this });
  }

  animate(dt, vf, vr) {
    const s = this.spec;
    // body roll from lateral load, pitch from acceleration
    const lat = this.yawRate * vf;
    this.roll = damp(this.roll, clamp(-lat * 0.012, -0.12, 0.12), 6, dt);
    const acc = (vf - (this._lastVf ?? vf)) / Math.max(dt, 1e-3);
    this._lastVf = vf;
    this.pitch = damp(this.pitch, clamp(-acc * 0.006, -0.06, 0.06), 5, dt);
    const b = this.model.body;
    b.rotation.z = this.roll;
    b.rotation.x = this.pitch;
    this.wheelSpin += vf * dt / 0.37;
    for (const w of this.model.wheels) {
      w.tyre.rotation.x = this.wheelSpin;
      if (w.front) w.pivot.rotation.y = this.steer;
    }
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.yaw;
    // lights: brake lights flare, police strobe
    if (!this.wrecked) {
      this.model.tailMat.emissiveIntensity = this.ctl.throttle < 0 && vf > 0.5 ? 2.2 : 0.5;
      this.model.headMat.emissiveIntensity = 0.4 + (game.sky ? game.sky.night * 2.6 : 0);
    }
    if (this.model.lightbar) {
      const on = this.siren ? (Math.floor(game.time * 6) % 2) : -1;
      this.model.lightbar.red.emissiveIntensity = on === 0 ? 7 : on === 1 ? 0.6 : 0;
      this.model.lightbar.blue.emissiveIntensity = on === 1 ? 7 : on === 0 ? 0.6 : 0;
    }
    void vr; void s;
  }

  dispose() { game.scene.remove(this.root); }
}

/** Car-vs-car contacts (two circles per car) with mass-weighted impulses and damage. */
export function resolveVehicleContacts(list) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      const dx0 = b.x - a.x, dz0 = b.z - a.z;
      if (dx0 * dx0 + dz0 * dz0 > 49) continue;
      for (const ka of [1, -1]) for (const kb of [1, -1]) {
        const ax = a.x + a.fwdX * a.spec.len * 0.27 * ka, az = a.z + a.fwdZ * a.spec.len * 0.27 * ka;
        const bx = b.x + b.fwdX * b.spec.len * 0.27 * kb, bz = b.z + b.fwdZ * b.spec.len * 0.27 * kb;
        const rr = a.spec.wid * 0.55 + b.spec.wid * 0.55;
        let dx = bx - ax, dz = bz - az;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        dx /= d; dz /= d;
        const pen = rr - d;
        const ma = a.spec.mass, mb = b.spec.mass, tot = ma + mb;
        a.x -= dx * pen * (mb / tot); a.z -= dz * pen * (mb / tot);
        b.x += dx * pen * (ma / tot); b.z += dz * pen * (ma / tot);
        const rel = (b.vx - a.vx) * dx + (b.vz - a.vz) * dz;
        if (rel < 0) {
          const jimp = -(1.3) * rel / (1 / ma + 1 / mb);
          a.vx -= (jimp / ma) * dx; a.vz -= (jimp / ma) * dz;
          b.vx += (jimp / mb) * dx; b.vz += (jimp / mb) * dz;
          a.impact(-rel, (ax + bx) / 2, (az + bz) / 2);
          b.impact(-rel, (ax + bx) / 2, (az + bz) / 2);
          game.emit('carHit', { a, b, force: -rel });
        }
      }
    }
  }
}
