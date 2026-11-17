// Traffic: AI drivers that follow right-hand lanes over the road graph, pick turns at junctions,
// brake for cars and people ahead, honk, panic when shot at, plus parked cars and spawn/despawn
// around the player so the streets stay busy without simulating the whole city.
import { game } from '../core/game.js';
import { Vehicle } from '../entities/vehicle.js';
import { Character } from '../entities/character.js';
import { DIRS, lanePoint, validNode, NODES_X, NODES_Z, nodePos } from '../world/cityLayout.js';
import { LANE, ROAD, CELL } from '../core/config.js';
import { rng, clamp, angleDiff } from '../core/rng.js';
import { rig } from './cameraRig.js';

const TRAFFIC_TARGET = 20;
const TYPES = [['sedan', 36], ['cab', 12], ['van', 11], ['pickup', 14], ['sport', 13], ['police', 6]];
function pickType() {
  let r = rng.next() * 92;
  for (const [t, w] of TYPES) { if ((r -= w) <= 0) return t; }
  return 'sedan';
}

export function makeTrafficBrain(i, j, dir) {
  return { kind: 'traffic', i, j, dir, next: chooseTurn(i + DIRS[dir][0], j + DIRS[dir][1], dir), cruise: rng.range(10, 14), blocked: 0, honkT: 0 };
}

function chooseTurn(i, j, dir) {
  const opts = [];
  for (let d = 0; d < 4; d++) {
    if (d === (dir + 2) % 4) continue;
    if (validNode(i + DIRS[d][0], j + DIRS[d][1])) opts.push(d);
  }
  if (!opts.length) return (dir + 2) % 4;
  if (opts.includes(dir) && rng.chance(0.5)) return dir;
  return rng.pick(opts);
}

/** Drive a vehicle along its lane plan. Shared with police patrols when they are not pursuing. */
export function driveLane(v, dt, speedScale = 1) {
  const b = v.ai;
  const a = lanePoint(b.i, b.j, b.dir, 0), e = lanePoint(b.i, b.j, b.dir, 1);
  const sx = e.x - a.x, sz = e.z - a.z;
  const segLen = Math.hypot(sx, sz);
  let t = ((v.x - a.x) * sx + (v.z - a.z) * sz) / (segLen * segLen);
  if (t > 0.93) {
    b.i += DIRS[b.dir][0]; b.j += DIRS[b.dir][1];
    b.dir = b.next;
    b.next = chooseTurn(b.i + DIRS[b.dir][0], b.j + DIRS[b.dir][1], b.dir);
    t = 0;
  }
  const look = 9 / CELL;
  let aim;
  if (t + look <= 1) aim = lanePoint(b.i, b.j, b.dir, t + look);
  else aim = lanePoint(b.i + DIRS[b.dir][0], b.j + DIRS[b.dir][1], b.next, Math.min(0.5, t + look - 1 + 0.06));
  const want = Math.atan2(aim.x - v.x, aim.z - v.z);
  const err = angleDiff(v.yaw, want);
  v.ctl.steer = clamp(err * 2.2, -1, 1);
  const turning = b.next !== b.dir && t > 0.7;
  let target = (turning ? 6.5 : b.cruise) * speedScale;
  if (Math.abs(err) > 0.6) target = Math.min(target, 5);
  // obstacles ahead
  const block = obstacleAhead(v, 14);
  if (block) {
    target = Math.min(target, Math.max(0, (block.d - 5) * 0.9));
    if (block.who === game.player || block.who === game.player?.vehicle) {
      b.honkT -= dt;
      if (b.honkT <= 0 && v.absSpeed < 2) { game.emit('horn', { car: v }); b.honkT = rng.range(2, 4); }
    }
  }
  const spd = v.speed;
  v.ctl.throttle = spd < target - 0.5 ? clamp((target - spd) * 0.4, 0.2, 1) : spd > target + 1 ? -clamp((spd - target) * 0.25, 0.2, 1) : 0;
  v.ctl.handbrake = false;
  b.blocked = v.absSpeed < 0.5 && block ? b.blocked + dt : 0;
}

export function obstacleAhead(v, range) {
  const fx = v.fwdX, fz = v.fwdZ;
  let best = null;
  const test = (who, x, z, w) => {
    const dx = x - v.x, dz = z - v.z;
    const along = dx * fx + dz * fz;
    if (along < 1 || along > range) return;
    const lat = Math.abs(dx * fz - dz * fx);
    if (lat > w) return;
    if (!best || along < best.d) best = { who, d: along };
  };
  for (const o of game.vehicles) if (o !== v) test(o, o.x, o.z, 2.3);
  const p = game.player;
  if (p && !p.vehicle && p.alive) test(p, p.pos.x, p.pos.z, 1.6);
  for (const c of game.peds) if (c.alive && !c.vehicle && c.crossing) test(c, c.pos.x, c.pos.z, 1.5);
  return best;
}

function spawnPoint(minD, maxD) {
  const p = game.player.pos;
  for (let tries = 0; tries < 30; tries++) {
    const i = rng.int(0, NODES_X - 1), j = rng.int(0, NODES_Z - 1), dir = rng.int(0, 3);
    if (!validNode(i + DIRS[dir][0], j + DIRS[dir][1])) continue;
    const t = rng.range(0.2, 0.7);
    const q = lanePoint(i, j, dir, t);
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < minD || d > maxD) continue;
    const vis = ((q.x - p.x) * Math.sin(rig.yaw) + (q.z - p.z) * Math.cos(rig.yaw)) / d;
    if (vis > 0.5 && d < 110) continue; // don't pop in on screen
    if (game.vehicles.some((v) => Math.hypot(v.x - q.x, v.z - q.z) < 9)) continue;
    return { i, j, dir, x: q.x, z: q.z, yaw: Math.atan2(DIRS[dir][0], DIRS[dir][1]) };
  }
  return null;
}

export function spawnTrafficCar(type, minD = 70, maxD = 150) {
  const s = spawnPoint(minD, maxD);
  if (!s) return null;
  const v = new Vehicle(type || pickType(), s.x, s.z, s.yaw);
  v.ai = makeTrafficBrain(s.i, s.j, s.dir);
  const d = new Character(v.type === 'police' ? 'cop' : 'ped', s.x, s.z);
  d.vehicle = v; d.root.visible = false;
  if (v.type === 'police') { d.setWeapon('pistol'); d.inv = { pistol: { mag: 12, reserve: 60 } }; }
  v.driver = d;
  v.vx = Math.sin(s.yaw) * 8; v.vz = Math.cos(s.yaw) * 8;
  game.vehicles.push(v);
  game.peds.push(d);
  return v;
}

export function spawnParkedCars(n) {
  for (let k = 0; k < n; k++) {
    const i = rng.int(0, NODES_X - 1), j = rng.int(0, NODES_Z - 1), dir = rng.int(0, 3);
    if (!validNode(i + DIRS[dir][0], j + DIRS[dir][1])) continue;
    const t = rng.range(0.25, 0.75);
    const a = nodePos(i, j);
    const [dx, dz] = DIRS[dir];
    const off = ROAD / 2 - 1.3;
    const x = a.x + dx * CELL * t - dz * off, z = a.z + dz * CELL * t + dx * off;
    if (game.vehicles.some((v) => Math.hypot(v.x - x, v.z - z) < 7)) continue;
    const type = rng.pick(['sedan', 'sedan', 'sport', 'pickup', 'van', 'cab']);
    const v = new Vehicle(type, x, z, Math.atan2(dx, dz));
    v.parked = true;
    game.vehicles.push(v);
  }
  void LANE;
}

export function despawnVehicle(v) {
  v.dispose();
  game.vehicles.splice(game.vehicles.indexOf(v), 1);
  if (v.driver && v.driver !== game.player) {
    v.driver.dispose();
    const k = game.peds.indexOf(v.driver);
    if (k >= 0) game.peds.splice(k, 1);
  }
}

export function updateTraffic(dt) {
  const p = game.player.pos;
  let moving = 0;
  for (const v of [...game.vehicles]) {
    const d = Math.hypot(v.x - p.x, v.z - p.z);
    v.root.visible = d < 260;
    const keep = v === game.player.vehicle || v.mission || v.pursuit;
    if (!keep && d > 210 && !v.parked) { despawnVehicle(v); continue; }
    if (!keep && v.wrecked && v.burnT < -30 && d > 60) { despawnVehicle(v); continue; }
    if (v.ai && v.ai.kind === 'traffic') {
      moving++;
      if (!v.driver || !v.driver.alive) { v.ai = null; v.ctl.throttle = 0; v.ctl.handbrake = true; continue; }
      if (v.driver.scared > 0) {
        v.driver.scared -= dt;
        driveLane(v, dt, 2.2);
        v.ctl.throttle = 1;
      } else driveLane(v, dt);
      if (v.ai && v.ai.blocked > 9 && d > 60) { despawnVehicle(v); continue; }
    }
  }
  if (moving < TRAFFIC_TARGET && (game.mode === 'play' || game.mode === 'title')) spawnTrafficCar();
}
