// Solara Bay's layout as data: district per block, building footprints, landmarks, the road graph
// that traffic and police route over, and ground height queries. No meshes are made here.
import {
  BLOCK, ROAD, CELL, GRID_X, GRID_Z, SIDEWALK, CURB, X0, Z0, LAND, BEACH_Z, LANE,
  roadX, roadZ, blockCenterX, blockCenterZ, districtOf, PARK_BLOCKS, DISTRICT_NAMES,
} from '../core/config.js';
import { cityRng as R } from '../core/rng.js';

export const PASTELS = [0xf7c6c7, 0xfde2b8, 0xb8ead9, 0xc9e4f6, 0xf9f1d8, 0xe9c9f0, 0xffd6a5, 0xa9e3e0, 0xf4b6a8, 0xfff1c9];
export const GLASS = [0x8fb4c9, 0x6f95ad, 0x9cc2c9, 0xa7b6c4, 0x7aa0b8, 0xb9c8d1];
export const STYLE = { glass: 0, office: 1, deco: 2, house: 3, warehouse: 4 };

export const blocks = [];      // {bx,bz,cx,cz,district,park}
export const buildings = [];   // {x,z,w,d,h,color,style,trim,block}
export const landmarks = {};   // name → {x,z,label,...}

const isPark = (bx, bz) => PARK_BLOCKS.some(([a, b]) => a === bx && b === bz);

function addBuilding(b, x, z, w, d, h, color, style, trim = 0xf4efe6) {
  const bd = { x, z, w, d, h, color, style, trim, block: b };
  buildings.push(bd);
  return bd;
}

function genDowntown(b) {
  const L = BLOCK - SIDEWALK * 2;
  const centre = Math.hypot(b.bx - 3.5, b.bz - 2.6);
  const tall = Math.max(0.25, 1 - centre / 4);
  if (R.chance(0.3)) {
    addBuilding(b, b.cx, b.cz, L - 10, L - 10, 30 + tall * R.range(40, 75), R.pick(GLASS), STYLE.glass, 0xdfe7ec);
    return;
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const w = L / 2 - R.range(3, 6), d = L / 2 - R.range(3, 6);
    const glass = R.chance(0.55);
    const h = glass ? 22 + tall * R.range(25, 70) : 14 + tall * R.range(10, 34);
    addBuilding(b, b.cx + sx * L / 4, b.cz + sz * L / 4, w, d, h, glass ? R.pick(GLASS) : R.pick(PASTELS), glass ? STYLE.glass : STYLE.office);
  }
}

function genMidtown(b) {
  const L = BLOCK - SIDEWALK * 2;
  const n = R.int(2, 3);
  const span = L / n;
  for (let i = 0; i < n; i++) {
    const x = b.cx - L / 2 + span * (i + 0.5);
    addBuilding(b, x, b.cz + R.range(-3, 3), span - 3, L - R.range(6, 14), R.range(12, 30), R.pick(PASTELS), R.chance(0.5) ? STYLE.deco : STYLE.office);
  }
}

function genCoral(b) {
  // Deco hotels front the beach (south side) and the strip; a pool court sits in the middle.
  const L = BLOCK - SIDEWALK * 2;
  const n = 3;
  const span = L / n;
  for (let i = 0; i < n; i++) {
    const x = b.cx - L / 2 + span * (i + 0.5);
    const h = R.range(9, b.bz === 6 ? 24 : 16);
    addBuilding(b, x, b.cz + L / 2 - 9, span - 2.5, 16, h, R.pick(PASTELS), STYLE.deco, 0xffffff);
  }
  addBuilding(b, b.cx - L / 4, b.cz - L / 2 + 8, L / 2 - 4, 14, R.range(7, 12), R.pick(PASTELS), STYLE.deco, 0xffffff);
  addBuilding(b, b.cx + L / 4, b.cz - L / 2 + 8, L / 2 - 4, 14, R.range(7, 12), R.pick(PASTELS), STYLE.deco, 0xffffff);
}

function genPalms(b) {
  const L = BLOCK - SIDEWALK * 2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const w = R.range(11, 15), d = R.range(10, 13);
    addBuilding(b, b.cx + sx * (L / 4 + R.range(-2, 2)), b.cz + sz * (L / 4 + R.range(-1, 2)), w, d, R.range(4.5, 7.5), R.pick(PASTELS), STYLE.house, 0xffffff);
  }
}

function genPort(b) {
  const L = BLOCK - SIDEWALK * 2;
  if ((b.bx + b.bz) % 2 === 0) {
    addBuilding(b, b.cx, b.cz - L / 4, L - 6, L / 2 - 6, R.range(9, 13), R.pick([0x9aa5a8, 0xb5a48a, 0x8c9b8c, 0xa88f7c]), STYLE.warehouse, 0x555b60);
    b.containerYard = { x0: b.cx - L / 2 + 3, x1: b.cx + L / 2 - 3, z0: b.cz + 2, z1: b.cz + L / 2 - 3 };
  } else {
    b.containerYard = { x0: b.cx - L / 2 + 3, x1: b.cx + L / 2 - 3, z0: b.cz - L / 2 + 3, z1: b.cz + L / 2 - 3 };
  }
}

export function generateCity() {
  for (let bx = 0; bx < GRID_X; bx++) {
    for (let bz = 0; bz < GRID_Z; bz++) {
      const b = { bx, bz, cx: blockCenterX(bx), cz: blockCenterZ(bz), district: districtOf(bx, bz), park: isPark(bx, bz) };
      blocks.push(b);
      if (b.park) continue;
      if (b.district === 'downtown') genDowntown(b);
      else if (b.district === 'midtown') genMidtown(b);
      else if (b.district === 'coral') genCoral(b);
      else if (b.district === 'palms') genPalms(b);
      else genPort(b);
    }
  }
  placeLandmarks();
}

/** A point on the sidewalk in front of block (bx,bz) on a given side (n/s/e/w). */
export function frontOf(bx, bz, side, along = 0) {
  const cx = blockCenterX(bx), cz = blockCenterZ(bz), e = BLOCK / 2 - SIDEWALK / 2;
  if (side === 'n') return { x: cx + along, z: cz - e };
  if (side === 's') return { x: cx + along, z: cz + e };
  if (side === 'e') return { x: cx + e, z: cz + along };
  return { x: cx - e, z: cz + along };
}

function placeLandmarks() {
  landmarks.safehouse = { ...frontOf(0, 2, 'e', 8), label: 'Casa Reyes (safehouse)', color: '#3ddc84' };
  landmarks.club = { ...frontOf(4, 5, 'n', 0), label: 'The Tidewater Club', color: '#ffd23f' };
  landmarks.gunshop = { ...frontOf(2, 0, 's', -10), label: 'Iron Pelican Arms', color: '#ff9f43' };
  landmarks.hospital = { ...frontOf(5, 1, 's', 0), label: 'St. Celeste Medical' };
  landmarks.precinct = { ...frontOf(2, 3, 'e', 0), label: 'SBPD Precinct 9' };
  landmarks.garage = { ...frontOf(6, 4, 'w', 0), label: "Sal's Body Shop" };
  landmarks.quay = { x: LAND.maxX - 8, z: blockCenterZ(2), label: 'Kane Marine Quay' };
  landmarks.ferris = { x: blockCenterX(3) + 12, z: BEACH_Z + 26, label: 'Sunset Pier Wheel' };
  landmarks.lighthouse = { x: LAND.minX + 14, z: LAND.maxZ - 16, label: 'Punta Faro Lighthouse' };
}

// ---------- road graph ----------
export const NODES_X = GRID_X + 1, NODES_Z = GRID_Z + 1;
export const nodePos = (i, j) => ({ x: roadX(i), z: roadZ(j) });
export const validNode = (i, j) => i >= 0 && j >= 0 && i < NODES_X && j < NODES_Z;
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // east, south, west, north

export function nearestNode(x, z) {
  const i = Math.max(0, Math.min(NODES_X - 1, Math.round((x - X0) / CELL)));
  const j = Math.max(0, Math.min(NODES_Z - 1, Math.round((z - Z0) / CELL)));
  return { i, j };
}

/** Right-hand lane point for travel from node a toward direction dir, at fraction t of the segment. */
export function lanePoint(i, j, dir, t) {
  const [dx, dz] = DIRS[dir];
  const a = nodePos(i, j);
  // right of travel direction (dx,dz) is (-dz, dx) in this x-east/z-south frame
  return { x: a.x + dx * CELL * t - dz * LANE, z: a.z + dz * CELL * t + dx * LANE };
}

/** Breadth-first next step from node (i,j) toward node (ti,tj). Returns a direction index. */
export function stepToward(i, j, ti, tj, avoidDir = -1) {
  const di = ti - i, dj = tj - j;
  const opts = [];
  if (di > 0) opts.push(0); if (di < 0) opts.push(2);
  if (dj > 0) opts.push(1); if (dj < 0) opts.push(3);
  if (Math.abs(dj) > Math.abs(di)) opts.reverse();
  for (const d of opts) if (d !== avoidDir && validNode(i + DIRS[d][0], j + DIRS[d][1])) return d;
  for (let d = 0; d < 4; d++) if (d !== avoidDir && validNode(i + DIRS[d][0], j + DIRS[d][1])) return d;
  return (avoidDir + 2) % 4;
}

// ---------- ground queries ----------
export function onRoad(x, z) {
  const lx = ((x - X0) % CELL + CELL) % CELL, lz = ((z - Z0) % CELL + CELL) % CELL;
  const inX = x >= X0 - ROAD / 2 && x <= -X0 + ROAD / 2;
  const inZ = z >= Z0 - ROAD / 2 && z <= -Z0 + ROAD / 2;
  return (inX && inZ) && (lx <= ROAD / 2 || lx >= CELL - ROAD / 2 || lz <= ROAD / 2 || lz >= CELL - ROAD / 2);
}

export function groundHeight(x, z) {
  if (z > BEACH_Z) return Math.max(-2.5, -Math.max(0, z - (LAND.maxZ - 22)) * 0.09);
  if (x < X0 - ROAD / 2 || x > -X0 + ROAD / 2 || z < Z0 - ROAD / 2) return 0;
  return onRoad(x, z) ? 0 : CURB;
}

export function blockAt(x, z) {
  const bx = Math.floor((x - X0) / CELL), bz = Math.floor((z - Z0) / CELL);
  if (bx < 0 || bz < 0 || bx >= GRID_X || bz >= GRID_Z) return null;
  return blocks[bx * GRID_Z + bz];
}

export function districtName(x, z) {
  if (z > BEACH_Z - 4) return DISTRICT_NAMES.beach;
  const b = blockAt(x, z);
  if (!b) return x > 0 ? DISTRICT_NAMES.oldport : DISTRICT_NAMES.palms;
  return DISTRICT_NAMES[b.district];
}

/** Sidewalk loop corners of a block, clockwise, used by pedestrians. */
export function sidewalkCorners(b) {
  const e = BLOCK / 2 - SIDEWALK / 2;
  return [[b.cx - e, b.cz - e], [b.cx + e, b.cz - e], [b.cx + e, b.cz + e], [b.cx - e, b.cz + e]];
}
