// Pedestrians: sidewalk walkers that loop blocks and cross streets, flee gunfire, cower, fight
// back when hit, get knocked down by cars, and drop cash. Spawned and culled around the player.
import { game } from '../core/game.js';
import { Character } from '../entities/character.js';
import { blocks, sidewalkCorners, blockAt } from '../world/cityLayout.js';
import { GRID_X, GRID_Z, LAND, BEACH_Z } from '../core/config.js';
import { rng, angleDiff } from '../core/rng.js';
import { punch } from './combat.js';
import { spawnPickup } from './pickups.js';
import { dust } from './effects.js';

const PED_TARGET = 34;
// For each corner of a block: [neighbour dx, dz, corner index on that block] across both roads.
const CROSS = [[[-1, 0, 1], [0, -1, 3]], [[1, 0, 0], [0, -1, 2]], [[1, 0, 3], [0, 1, 1]], [[-1, 0, 2], [0, 1, 0]]];

function blockOf(bx, bz) { return bx >= 0 && bz >= 0 && bx < GRID_X && bz < GRID_Z ? blocks[bx * GRID_Z + bz] : null; }

export function spawnPed(x, z, b, corner, role = 'ped') {
  const c = new Character(role, x, z, rng.next() * 6.28);
  c.brain = { kind: 'walker', block: b, corner, dirn: rng.chance(0.5) ? 1 : -1, jitter: rng.range(-0.8, 0.8), speed: rng.range(1.2, 1.7), idle: 0 };
  c.brave = rng.chance(0.22);
  c.scared = 0;
  game.peds.push(c);
  return c;
}

function trySpawn() {
  const p = game.player.pos;
  for (let k = 0; k < 12; k++) {
    const b = rng.pick(blocks);
    const corners = sidewalkCorners(b);
    const ci = rng.int(0, 3), cn = corners[(ci + 1) % 4], c0 = corners[ci];
    const t = rng.next();
    const x = c0[0] + (cn[0] - c0[0]) * t, z = c0[1] + (cn[1] - c0[1]) * t;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < 35 || d > 95) continue;
    spawnPed(x, z, b, (ci + 1) % 4);
    return;
  }
  // beachgoers
  const bx = p.x + rng.range(-70, 70), bz = BEACH_Z + rng.range(4, 26);
  if (Math.abs(bz - p.z) < 120 && bx > LAND.minX + 10 && bx < LAND.maxX - 10) {
    const c = spawnPed(bx, bz, null, 0);
    c.brain = { kind: 'beach', tx: bx, tz: bz, idle: rng.range(0, 6), speed: 1.2 };
  }
}

function threatFrom(c, x, z, t) {
  if (!c.alive || c.vehicle || c.role !== 'ped') return;
  if (Math.hypot(c.pos.x - x, c.pos.z - z) > 38) return;
  c.scared = Math.max(c.scared, t);
  c.fleeX = x; c.fleeZ = z;
  if (!c.screamed && rng.chance(0.35)) { c.screamed = true; game.emit('scream', { who: c }); }
}

export function initPedestrians() {
  game.on('shot', (e) => { for (const c of game.peds) threatFrom(c, e.x, e.z, 9); });
  game.on('explosion', (e) => { for (const c of game.peds) threatFrom(c, e.x, e.z, 12); });
  game.on('death', (e) => {
    for (const c of game.peds) threatFrom(c, e.target.pos.x, e.target.pos.z, 7);
    const t = e.target;
    if (t.role === 'ped' || t.role === 'gang') spawnPickup('cash', t.pos.x, t.pos.z, rng.int(8, 45));
    if (t.role === 'cop' && rng.chance(0.5)) spawnPickup('pistol', t.pos.x, t.pos.z, 12);
    if (t.role === 'gang' && t.weapon !== 'fist' && rng.chance(0.6)) spawnPickup(t.weapon, t.pos.x + 0.5, t.pos.z, 20);
  });
  game.on('hit', (e) => {
    const c = e.target;
    if (c.role !== 'ped' || !e.source) return;
    if (c.brave && e.source === game.player && c.alive) { c.brain.kind = 'fight'; c.foe = e.source; }
    else { c.scared = 10; c.fleeX = e.source.pos.x; c.fleeZ = e.source.pos.z; }
  });
}

export function updatePedestrians(dt) {
  const p = game.player.pos;
  let alive = 0;
  for (let i = game.peds.length - 1; i >= 0; i--) {
    const c = game.peds[i];
    if (c.vehicle) continue;
    const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
    if ((d > 140 && !c.keep) || (!c.alive && c.deadT > 25 && d > 30)) {
      c.dispose(); game.peds.splice(i, 1); continue;
    }
    c.root.visible = d < 150;
    if (c.role !== 'ped') continue;
    if (c.alive) alive++;
    if (!c.alive) { c.update(dt); continue; }
    if (!c.brain) { // a driver pulled from a car joins the street
      const b = blockAt(c.pos.x, c.pos.z);
      c.brain = b ? { kind: 'walker', block: b, corner: 0, dirn: 1, speed: 1.5 } : { kind: 'beach', tx: c.pos.x, tz: c.pos.z, idle: 0, speed: 1.3 };
      c.brave = c.brave ?? rng.chance(0.25);
      c.scared = c.scared || 0;
    }
    if (c.brain.kind === 'fight') fight(c, dt);
    else if (c.scared > 0) flee(c, dt);
    else if (c.brain.kind === 'beach') beach(c, dt);
    else walk(c, dt);
    c.update(dt);
  }
  runOver(dt);
  if (alive < PED_TARGET && (game.mode === 'play' || game.mode === 'title')) trySpawn();
}

function walk(c, dt) {
  const b = c.brain;
  if (!b.block) { b.kind = 'beach'; return; }
  const corners = sidewalkCorners(b.block);
  const [tx, tz] = b.crossTo || corners[b.corner];
  const dx = tx - c.pos.x, dz = tz - c.pos.z;
  const d = Math.hypot(dx, dz);
  c.crossing = !!b.crossTo;
  if (d < 0.8) {
    if (b.crossTo) { b.crossTo = null; b.block = b.nextBlock; b.corner = b.nextCorner; return; }
    // at a corner: sometimes cross the street to the neighbouring block
    if (rng.chance(0.3)) {
      const opt = rng.pick(CROSS[b.corner]);
      const nb = blockOf(b.block.bx + opt[0], b.block.bz + opt[1]);
      if (nb) {
        const nc = sidewalkCorners(nb)[opt[2]];
        b.crossTo = nc; b.nextBlock = nb; b.nextCorner = (opt[2] + (b.dirn > 0 ? 1 : 3)) % 4;
        return;
      }
    }
    b.corner = (b.corner + (b.dirn > 0 ? 1 : 3)) % 4;
    return;
  }
  const sp = b.crossTo ? b.speed * 1.4 : b.speed;
  c.drive(dt, (dx / d) * sp, (dz / d) * sp, 10);
  c.faceTo(Math.atan2(dx, dz), dt, 6);
}

function beach(c, dt) {
  const b = c.brain;
  if (b.idle > 0) { b.idle -= dt; c.drive(dt, 0, 0, 10); return; }
  const dx = b.tx - c.pos.x, dz = b.tz - c.pos.z, d = Math.hypot(dx, dz);
  if (d < 1) { b.idle = rng.range(3, 9); b.tx = c.pos.x + rng.range(-20, 20); b.tz = Math.min(LAND.maxZ - 12, Math.max(BEACH_Z + 2, c.pos.z + rng.range(-10, 10))); return; }
  c.drive(dt, dx / d * b.speed, dz / d * b.speed, 10);
  c.faceTo(Math.atan2(dx, dz), dt, 5);
}

function flee(c, dt) {
  c.scared -= dt;
  let dx = c.pos.x - (c.fleeX ?? game.player.pos.x), dz = c.pos.z - (c.fleeZ ?? game.player.pos.z);
  const d = Math.hypot(dx, dz) || 1;
  dx /= d; dz /= d;
  // some cower in place when the danger is close
  if (c.cower || (d < 6 && rng.chance(0.002))) { c.cower = true; c.drive(dt, 0, 0, 20); if (c.scared < 1) c.cower = false; return; }
  c.drive(dt, dx * 5.6, dz * 5.6, 20);
  c.faceTo(Math.atan2(dx, dz), dt, 10);
  if (c.scared <= 0) { const b = blockAt(c.pos.x, c.pos.z); if (b && c.brain.kind === 'walker') { c.brain.block = b; c.brain.crossTo = null; } }
}

function fight(c, dt) {
  const f = c.foe;
  if (!f || !f.alive || f.vehicle) { c.brain.kind = c.brain.block ? 'walker' : 'beach'; c.scared = 4; return; }
  const dx = f.pos.x - c.pos.x, dz = f.pos.z - c.pos.z, d = Math.hypot(dx, dz);
  c.faceTo(Math.atan2(dx, dz), dt, 10);
  if (d > 1.3) c.drive(dt, dx / d * 5, dz / d * 5, 20);
  else { c.drive(dt, 0, 0, 20); if (rng.chance(dt * 2.2)) punch(c); }
  if (d > 30) c.brain.kind = 'walker';
}

/** Cars knock down anyone in their path; speed decides injury. */
function runOver() {
  const all = [game.player, ...game.peds];
  for (const v of game.vehicles) {
    const spd = v.absSpeed;
    if (spd < 3) continue;
    for (const c of all) {
      if (!c || !c.alive || c.vehicle) continue;
      const dx = c.pos.x - v.x, dz = c.pos.z - v.z;
      if (dx * dx + dz * dz > 16) continue;
      const along = dx * v.fwdX + dz * v.fwdZ, lat = dx * v.fwdZ - dz * v.fwdX;
      if (Math.abs(along) > v.spec.len / 2 + 0.3 || Math.abs(lat) > v.spec.wid / 2 + 0.3) continue;
      if ((c._runT || 0) > game.time) continue;
      c._runT = game.time + 0.8;
      const dmg = spd * (c === game.player ? 2.2 : 6);
      const nx = v.vx / spd, nz = v.vz / spd;
      c.vy = Math.min(8, spd * 0.35);
      const killed = c.damage(dmg, v.driver || null, nx, nz);
      c.vx = v.vx * 0.9 + (lat > 0 ? v.fwdZ : -v.fwdZ) * 2; c.vz = v.vz * 0.9;
      c.pos.x += nx * 0.6; c.pos.z += nz * 0.6;
      v.vx *= 0.92; v.vz *= 0.92;
      dust(c.pos.x, c.pos.y + 0.5, c.pos.z, 3);
      game.emit('runOver', { car: v, target: c, killed });
      if (v.driver === game.player) game.emit('crime', { type: killed ? 'murder' : 'assault', x: c.pos.x, z: c.pos.z, victim: c });
      void angleDiff;
    }
  }
}
