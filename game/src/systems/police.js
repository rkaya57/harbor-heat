// Wanted level and the Solara Bay PD response: witnessed crimes add heat → 1-5 stars; cruisers
// spawn out of sight and route over the road graph, ram at close range, unload officers who bust
// or shoot; a helicopter joins at 4 stars. Breaking line of sight long enough lets the heat cool.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { lineOfSight } from '../world/collision.js';
import { nearestNode, stepToward, DIRS, lanePoint, validNode } from '../world/cityLayout.js';
import { spawnTrafficCar, driveLane } from './traffic.js';
import { Character } from '../entities/character.js';
import { updateShooter } from './combatAI.js';
import { rng, clamp, angleDiff } from '../core/rng.js';

export const wanted = { level: 0, heat: 0, lostT: 0, seen: false, bustT: 0, spawnT: 0, cooldown: 0 };
const LEVEL_HEAT = [0, 1, 40, 100, 190, 320];
const CRIME_HEAT = { brawl: 10, gunfire: 14, assault: 22, carjack: 16, murder: 45, copHurt: 40, copKill: 90, copcar: 30, explosion: 35, mission: 0 };
const CARS_FOR = [0, 1, 2, 3, 4, 5];
let heli = null;

export function setWanted(level) {
  wanted.level = clamp(level, 0, 5);
  wanted.heat = LEVEL_HEAT[wanted.level];
  wanted.lostT = 0;
  if (wanted.level > game.stats.bestWanted) game.stats.bestWanted = wanted.level;
  game.emit('wanted', { level: wanted.level });
}

function addHeat(n) {
  wanted.heat = Math.min(LEVEL_HEAT[5] + 40, wanted.heat + n);
  let lvl = 0;
  for (let i = 1; i <= 5; i++) if (wanted.heat >= LEVEL_HEAT[i]) lvl = i;
  if (lvl !== wanted.level) {
    wanted.level = lvl;
    if (lvl > game.stats.bestWanted) game.stats.bestWanted = lvl;
    game.emit('wanted', { level: lvl });
  }
  wanted.lostT = 0;
}

function witnessed(x, z) {
  if (wanted.level > 0) return true;
  for (const c of game.peds) {
    if (!c.alive || c.role !== 'cop') continue;
    const d = Math.hypot(c.pos.x - x, c.pos.z - z);
    if (d < 50 && lineOfSight(c.pos.x, c.pos.y + 1.6, c.pos.z, x, 1.2, z)) return true;
  }
  return false;
}

export function initPolice() {
  game.on('crime', (e) => {
    if (game.flags.noPolice) return;
    let heat = CRIME_HEAT[e.type] ?? 10;
    if (e.victim?.role === 'cop') heat = e.type === 'murder' ? CRIME_HEAT.copKill : CRIME_HEAT.copHurt;
    if (witnessed(e.x, e.z)) addHeat(heat);
    else if (!e.quiet && rng.chance(e.type === 'murder' || e.type === 'gunfire' ? 0.45 : 0.15)) setTimeout(() => addHeat(Math.max(1, heat * 0.6)), 2500);
  });
  game.on('hit', (e) => {
    if (e.source === game.player && e.target.role === 'cop' && !game.flags.noPolice) addHeat(e.target.alive ? CRIME_HEAT.copHurt : 0);
    if (e.target.role === 'cop') e.target.angry = true;
  });
  game.on('death', (e) => {
    if (e.source === game.player || e.source === game.player?.vehicle) {
      game.stats.kills++;
      if (!game.flags.noPolice) game.emit('crime', { type: 'murder', x: e.target.pos.x, z: e.target.pos.z, victim: e.target });
    }
  });
  game.on('explosion', (e) => { if (e.source && e.source.lastHitByPlayer) game.emit('crime', { type: 'explosion', x: e.x, z: e.z }); });
}

function spawnCruiser() {
  const v = spawnTrafficCar('police', 75, 170);
  if (!v) return;
  v.pursuit = true;
  v.siren = true;
  v.ai = { kind: 'pursuit', i: 0, j: 0, dir: 0, next: 0, cruise: 30, blocked: 0, honkT: 0, stopT: 0 };
  const n = nearestNode(v.x, v.z);
  Object.assign(v.ai, n);
}

function pursue(v, dt) {
  const p = game.player;
  const tx = p.vehicle ? p.vehicle.x : p.pos.x, tz = p.vehicle ? p.vehicle.z : p.pos.z;
  const d = Math.hypot(tx - v.x, tz - v.z);
  const los = d < 60 && lineOfSight(v.x, 1.4, v.z, tx, 1.2, tz);
  const b = v.ai;
  if (!p.vehicle && d < 16) {
    // pull up and unload
    v.ctl.throttle = v.speed > 1 ? -1 : 0; v.ctl.handbrake = v.speed < 4; v.ctl.steer = 0;
    if (v.absSpeed < 2 && !v.unloaded) unload(v);
    return { los };
  }
  if (los && d < 45) {
    // ram / box in: steer straight at a point slightly ahead of the target
    const lead = p.vehicle ? 0.5 : 0;
    const ax = tx + (p.vehicle ? p.vehicle.vx * lead : 0), az = tz + (p.vehicle ? p.vehicle.vz * lead : 0);
    const err = angleDiff(v.yaw, Math.atan2(ax - v.x, az - v.z));
    v.ctl.steer = clamp(err * 2.5, -1, 1);
    v.ctl.throttle = Math.abs(err) > 1.8 ? -1 : 1;
    v.ctl.handbrake = Math.abs(err) > 0.9 && v.absSpeed > 12;
    const n = nearestNode(v.x, v.z); b.i = n.i; b.j = n.j;
    b.dir = stepToward(b.i, b.j, nearestNode(tx, tz).i, nearestNode(tx, tz).j);
    b.next = b.dir;
  } else {
    // route over the road graph toward the player's junction
    const tn = nearestNode(tx, tz);
    const nextI = b.i + DIRS[b.dir][0], nextJ = b.j + DIRS[b.dir][1];
    if (!validNode(nextI, nextJ)) b.dir = stepToward(b.i, b.j, tn.i, tn.j);
    b.next = stepToward(b.i + DIRS[b.dir][0], b.j + DIRS[b.dir][1], tn.i, tn.j, (b.dir + 2) % 4);
    b.cruise = 26;
    driveLane(v, dt, 1);
    v.ctl.throttle = Math.max(v.ctl.throttle, 0.6);
    void lanePoint;
  }
  // stuck: reverse out
  b.stopT = v.absSpeed < 1 ? b.stopT + dt : 0;
  if (b.stopT > 1.5) { v.ctl.throttle = -1; v.ctl.steer = -v.ctl.steer || 1; if (b.stopT > 3) b.stopT = 0; }
  return { los };
}

function unload(v) {
  v.unloaded = true;
  const crew = [v.driver];
  const extra = new Character('cop', v.x, v.z);
  extra.setWeapon('pistol'); extra.inv = { pistol: { mag: 12, reserve: 48 } };
  game.peds.push(extra);
  crew.push(extra);
  crew.forEach((c, k) => {
    if (!c) return;
    c.vehicle = null;
    c.root.visible = true;
    const s = k ? -1 : 1;
    c.pos.set(v.x + Math.cos(v.yaw) * 1.8 * s, v.y, v.z - Math.sin(v.yaw) * 1.8 * s);
    c.footCop = true; c.keep = true;
    if (c.weapon === 'fist') { c.setWeapon('pistol'); c.inv = { pistol: { mag: 12, reserve: 48 } }; }
  });
  v.driver = null;
  v.ai = null;
  v.siren = true;
  v.ctl.throttle = 0; v.ctl.handbrake = true;
}

function updateFootCop(c, dt) {
  const p = game.player;
  if (wanted.level === 0) {
    c.aiming = false;
    c.drive(dt, 0, 0, 10);
    c.keep = false;
    c.update(dt);
    return false;
  }
  const lethal = wanted.level >= 2 || c.angry || (p.weapon !== 'fist' && p.aiming);
  const res = updateShooter(c, p, dt, { near: lethal ? 6 : 0.8, far: lethal ? 18 : 1.2, skill: 0.35 + wanted.level * 0.08, speed: 5.4, canShoot: lethal });
  c.update(dt);
  // bust: an officer within reach while the player is on foot and not running
  if (!p.vehicle && res.d < 1.9 && p.speed < 2.5 && p.alive) wanted.bustT += dt;
  return res.los;
}

function updateHeli(dt) {
  const p = game.player;
  if (wanted.level >= 4 && !heli) heli = makeHeli();
  if (!heli) return false;
  const g = heli.group;
  const leaving = wanted.level < 3;
  const t = game.time * 0.4;
  const tx = leaving ? g.position.x + 50 : p.pos.x + Math.cos(t) * 30, tz = leaving ? g.position.z + 50 : p.pos.z + Math.sin(t) * 30;
  g.position.x += (tx - g.position.x) * Math.min(1, dt * 0.6);
  g.position.z += (tz - g.position.z) * Math.min(1, dt * 0.6);
  g.position.y += ((leaving ? 120 : 48) - g.position.y) * Math.min(1, dt * 0.5);
  g.lookAt(p.pos.x, g.position.y, p.pos.z);
  heli.rotor.rotation.y += dt * 40;
  heli.tail.rotation.x += dt * 50;
  heli.beam.lookAt(p.pos.x, 0, p.pos.z);
  if (leaving && g.position.y > 110) { game.scene.remove(g); heli = null; return false; }
  game.emit('heli', { x: g.position.x, z: g.position.z });
  return !leaving && lineOfSight(g.position.x, g.position.y - 2, g.position.z, p.pos.x, p.pos.y + 1, p.pos.z);
}

function makeHeli() {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x1a2440, roughness: 0.4, metalness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 });
  const cab = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), body); cab.scale.set(1, 0.9, 1.5); group.add(cab);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 5), white); boom.position.z = -3.6; group.add(boom);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 0.4), body); rotor.position.y = 1.6; group.add(rotor);
  const r2 = rotor.clone(); r2.rotation.y = Math.PI / 2; rotor.add(r2); r2.position.y = 0;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2, 0.3), body); tail.position.set(0.3, 0.3, -6); group.add(tail);
  for (const s of [-1, 1]) { const skid = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3.4), white); skid.position.set(s * 1, -1.5, 0); group.add(skid); }
  const beam = new THREE.Mesh(new THREE.ConeGeometry(4, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xeef6ff, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.geometry.translate(0, -30, 0); beam.geometry.rotateX(-Math.PI / 2);
  const beamHolder = new THREE.Object3D(); beamHolder.add(beam); group.add(beamHolder);
  const p = game.player.pos;
  group.position.set(p.x + 120, 120, p.z + 120);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  game.scene.add(group);
  return { group, rotor, tail, beam: beamHolder };
}

export function clearPolice() {
  setWanted(0);
  wanted.bustT = 0;
  for (const v of game.vehicles) { if (v.pursuit) { v.pursuit = false; v.siren = false; } }
}

export function updatePolice(dt) {
  const p = game.player;
  let seen = false;
  // pursuers
  let cars = 0;
  for (const v of game.vehicles) {
    if (!v.pursuit) continue;
    if (wanted.level === 0) { v.pursuit = false; v.siren = false; if (v.driver && v.driver.alive && v.ai) v.ai.kind = 'traffic'; continue; }
    if (v.wrecked || !v.driver || !v.driver.alive) { if (!v.unloaded) v.pursuit = false; continue; }
    if (v.ai?.kind === 'pursuit') { cars++; if (pursue(v, dt).los) seen = true; }
  }
  for (const c of game.peds) {
    if (c.role !== 'cop' || !c.alive || c.vehicle) continue;
    if (c.footCop || wanted.level > 0) {
      c.footCop = true;
      if (updateFootCop(c, dt)) seen = true;
    } else if (wanted.level === 0 && c.footCop) c.footCop = false;
  }
  if (updateHeli(dt)) seen = true;
  // patrol cars that spot a wanted player join the chase
  if (wanted.level > 0) {
    for (const v of game.vehicles) {
      if (v.type === 'police' && v.ai?.kind === 'traffic' && v.driver?.alive && Math.hypot(v.x - p.pos.x, v.z - p.pos.z) < 60) {
        v.pursuit = true; v.siren = true; v.ai.kind = 'pursuit'; v.ai.cruise = 30;
      }
    }
    wanted.spawnT -= dt;
    if (cars < CARS_FOR[wanted.level] && wanted.spawnT <= 0) { spawnCruiser(); wanted.spawnT = 3.5 - wanted.level * 0.4; }
    wanted.seen = seen;
    if (!seen) {
      wanted.lostT += dt;
      if (wanted.lostT > 9 + wanted.level * 3) {
        wanted.heat = LEVEL_HEAT[wanted.level - 1];
        wanted.level--;
        wanted.lostT = 0;
        game.emit('wanted', { level: wanted.level, cooled: true });
      }
    } else wanted.lostT = Math.max(0, wanted.lostT - dt * 2);
  }
  // busted?
  if (wanted.bustT > 1.6 && p.alive && !p.vehicle) { wanted.bustT = 0; game.emit('busted', {}); }
  wanted.bustT = Math.max(0, wanted.bustT - dt * 0.5);
}
