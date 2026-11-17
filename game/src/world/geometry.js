// GeoBuilder: accumulates boxes and quads into one BufferGeometry so a whole road net,
// sidewalk ring or prop kit renders in a single draw call. UVs are in world metres / uvScale.
import * as THREE from 'three';

export class GeoBuilder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = []; }

  quad(a, b, c, d, n, uvs, color) {
    const base = this.pos.length / 3;
    for (const p of [a, b, c, d]) this.pos.push(p[0], p[1], p[2]);
    for (let i = 0; i < 4; i++) this.nrm.push(n[0], n[1], n[2]);
    for (const t of uvs) this.uv.push(t[0], t[1]);
    const cc = color || [1, 1, 1];
    for (let i = 0; i < 4; i++) this.col.push(cc[0], cc[1], cc[2]);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Horizontal quad from (x0,z0) to (x1,z1) at height y; rot rotates the UVs by 90°. */
  flat(x0, z0, x1, z1, y, uvScale = 1, rot = false, color, uvOverride) {
    const u0 = x0 / uvScale, u1 = x1 / uvScale, v0 = z0 / uvScale, v1 = z1 / uvScale;
    let uvs = rot ? [[v0, u0], [v1, u0], [v1, u1], [v0, u1]] : [[u0, v0], [u0, v1], [u1, v1], [u1, v0]];
    if (rot) uvs = [[v0, u0], [v1, u0], [v1, u1], [v0, u1]];
    if (uvOverride) uvs = uvOverride;
    this.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], uvs, color);
  }

  /** Axis-aligned box from its centre-bottom; uvScale tiles textures in metres. */
  box(cx, y0, cz, w, h, d, uvScale = 1, color, skipBottom = true) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    const s = uvScale;
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], [[x0 / s, z0 / s], [x0 / s, z1 / s], [x1 / s, z1 / s], [x1 / s, z0 / s]], color);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[x0 / s, y0 / s], [x1 / s, y0 / s], [x1 / s, y1 / s], [x0 / s, y1 / s]], color);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[x1 / s, y0 / s], [x0 / s, y0 / s], [x0 / s, y1 / s], [x1 / s, y1 / s]], color);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[z1 / s, y0 / s], [z0 / s, y0 / s], [z0 / s, y1 / s], [z1 / s, y1 / s]], color);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[z0 / s, y0 / s], [z1 / s, y0 / s], [z1 / s, y1 / s], [z0 / s, y1 / s]], color);
    if (!skipBottom) this.quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]], color);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Write position/rotation/scale into an InstancedMesh slot. */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function setInstance(mesh, i, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  mesh.setMatrixAt(i, _m);
}
