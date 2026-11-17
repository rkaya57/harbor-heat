// Static collision: axis-aligned boxes (buildings, walls, props) in a uniform bucket grid,
// with circle push-out for movers and segment casts for bullets, line of sight and the camera.
const CELL = 16;
const boxes = [];
const grid = new Map();
let stamp = 1;

const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;

export function addBox(minX, maxX, minZ, maxZ, height = 30, kind = 'building') {
  const b = { minX, maxX, minZ, maxZ, height, kind, mark: 0 };
  boxes.push(b);
  for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
    for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
      const k = key(cx, cz);
      let list = grid.get(k);
      if (!list) grid.set(k, (list = []));
      list.push(b);
    }
  }
  return b;
}

function each(minX, maxX, minZ, maxZ, fn) {
  stamp++;
  for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
    for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
      const list = grid.get(key(cx, cz));
      if (!list) continue;
      for (const b of list) {
        if (b.mark === stamp) continue;
        b.mark = stamp;
        if (fn(b) === true) return true;
      }
    }
  }
  return false;
}

/** Push a circle out of every box it overlaps. Returns {x, z, nx, nz, hit} with the last contact normal. */
const res = { x: 0, z: 0, nx: 0, nz: 0, hit: false };
export function resolveCircle(x, z, r, y = 0) {
  res.x = x; res.z = z; res.nx = 0; res.nz = 0; res.hit = false;
  each(x - r, x + r, z - r, z + r, (b) => {
    if (y > b.height) return;
    const px = Math.max(b.minX, Math.min(res.x, b.maxX));
    const pz = Math.max(b.minZ, Math.min(res.z, b.maxZ));
    let dx = res.x - px, dz = res.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 > r * r) return;
    if (d2 < 1e-8) {
      // centre inside the box: leave by the nearest face
      const l = res.x - b.minX, rr = b.maxX - res.x, t = res.z - b.minZ, bt = b.maxZ - res.z;
      const m = Math.min(l, rr, t, bt);
      if (m === l) { dx = -1; dz = 0; res.x = b.minX - r; } else if (m === rr) { dx = 1; dz = 0; res.x = b.maxX + r; }
      else if (m === t) { dx = 0; dz = -1; res.z = b.minZ - r; } else { dx = 0; dz = 1; res.z = b.maxZ + r; }
      res.nx = dx; res.nz = dz; res.hit = true;
      return;
    }
    const d = Math.sqrt(d2);
    const push = r - d;
    res.nx = dx / d; res.nz = dz / d;
    res.x += res.nx * push; res.z += res.nz * push;
    res.hit = true;
  });
  return res;
}

/** Ray-march-free segment cast against boxes (slab test). Returns distance fraction 0..1 or 1 when clear. */
export function segmentCast(x0, y0, z0, x1, y1, z1) {
  let best = 1;
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  each(Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1), (b) => {
    let tmin = 0, tmax = best;
    const slabs = [[x0, dx, b.minX, b.maxX], [z0, dz, b.minZ, b.maxZ], [y0, dy, -5, b.height]];
    for (const [o, d, lo, hi] of slabs) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return; continue; }
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return;
    }
    if (tmin < best) best = tmin;
  });
  return best;
}

export function lineOfSight(ax, ay, az, bx, by, bz) {
  return segmentCast(ax, ay, az, bx, by, bz) >= 0.999;
}

export function pointBlocked(x, z, pad = 0) {
  return each(x - pad, x + pad, z - pad, z + pad, (b) => x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad);
}

export const allBoxes = boxes;
