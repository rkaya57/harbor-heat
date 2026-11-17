// Third-person camera rig: mouse orbit, over-the-shoulder aim zoom, chase cam that recentres behind
// the car and widens FOV with speed, wall avoidance, and trauma-based screen shake.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { input } from '../core/input.js';
import { segmentCast } from '../world/collision.js';
import { clamp, damp, dampAngle } from '../core/rng.js';

export const rig = {
  yaw: Math.PI, pitch: 0.22, dist: 5.2, fov: 62, idle: 0, trauma: 0, t: 0,
  pos: new THREE.Vector3(), look: new THREE.Vector3(), override: null,
  sensitivity: 0.0022,
};

export function addTrauma(a) { rig.trauma = Math.min(1, rig.trauma + a * game.settings.shake); }

export function camForward() { return { x: Math.sin(rig.yaw), z: Math.cos(rig.yaw) }; }

const _dir = new THREE.Vector3();
export function aimRay() {
  game.camera.getWorldDirection(_dir);
  return { ox: game.camera.position.x, oy: game.camera.position.y, oz: game.camera.position.z, dx: _dir.x, dy: _dir.y, dz: _dir.z };
}

export function updateCamera(dt, realDt) {
  const cam = game.camera;
  const p = game.player;
  rig.t += realDt;
  if (rig.override) { // scripted shots (title flyover, cutscenes, screenshots)
    rig.override(cam, rig.t);
    return;
  }
  const m = input.mouse;
  if (m.dx || m.dy) rig.idle = 0; else rig.idle += realDt;
  rig.yaw -= m.dx * rig.sensitivity;
  rig.pitch = clamp(rig.pitch + m.dy * rig.sensitivity, -0.5, 1.05);

  const v = p.vehicle;
  let tx, ty, tz, dist, height, fov, side = 0;
  if (v) {
    const spd = v.absSpeed;
    // recentre behind the car when the mouse rests and the car is moving
    if (rig.idle > 1.0 && spd > 3) {
      const heading = v.speed >= -1 ? v.yaw : v.yaw + Math.PI;
      rig.yaw = dampAngle(rig.yaw, heading, 2.6, realDt);
      rig.pitch = damp(rig.pitch, 0.2, 2, realDt);
    }
    tx = v.x; ty = v.y + 1.6; tz = v.z;
    dist = 6.8 + v.spec.len * 0.45 + spd * 0.05;
    height = 0;
    fov = 64 + Math.min(18, spd * 0.4);
  } else {
    tx = p.pos.x; ty = p.pos.y + 1.55; tz = p.pos.z;
    const aiming = p.aiming;
    dist = aiming ? 2.4 : 4.6;
    side = aiming ? 0.75 : 0.3;
    fov = aiming ? 52 : 64 + Math.min(6, p.speed);
    height = 0;
  }
  rig.dist = damp(rig.dist, dist, 7, realDt);
  rig.fov = damp(rig.fov, fov, 5, realDt);
  rig.side = damp(rig.side ?? 0, side, 9, realDt);
  const fx = Math.sin(rig.yaw), fz = Math.cos(rig.yaw);
  const rx = -fz, rz = fx;
  const cp = Math.cos(rig.pitch), sp = Math.sin(rig.pitch);
  const lx = tx + rx * rig.side, lz = tz + rz * rig.side;
  let cx = lx - fx * rig.dist * cp, cy = ty + rig.dist * sp + height, cz = lz - fz * rig.dist * cp;
  const hit = segmentCast(lx, ty, lz, cx, cy, cz);
  if (hit < 1) { const k = Math.max(0.1, hit - 0.06); cx = lx + (cx - lx) * k; cy = ty + (cy - ty) * k; cz = lz + (cz - lz) * k; }
  cy = Math.max(cy, 0.4);
  rig.pos.set(cx, cy, cz);
  rig.look.set(lx + fx * 10, ty + 0.25 - Math.tan(rig.pitch) * 10 * 0.9, lz + fz * 10);

  // trauma shake: summed sines, decays in real time so hit-stop never freezes it off-centre
  rig.trauma = Math.max(0, rig.trauma - realDt * 1.4);
  const sh = rig.trauma * rig.trauma;
  const T = rig.t * 32;
  cam.position.set(cx + Math.sin(T * 1.7) * sh * 0.35, cy + Math.sin(T * 2.3) * sh * 0.3, cz + Math.sin(T * 1.3) * sh * 0.35);
  cam.lookAt(rig.look);
  cam.rotateZ(Math.sin(T * 1.1) * sh * 0.04);
  if (Math.abs(cam.fov - rig.fov) > 0.05) { cam.fov = rig.fov; cam.updateProjectionMatrix(); }
}
