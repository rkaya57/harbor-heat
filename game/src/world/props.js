// Street furniture and set pieces: palms, street lamps, port containers and gantry cranes,
// beach umbrellas, the Sunset Pier wheel, Punta Faro lighthouse, Kane's yacht, neon and billboards.
import * as THREE from 'three';
import { GeoBuilder, setInstance } from './geometry.js';
import * as T from './textures.js';
import { blocks, buildings, landmarks, STYLE } from './cityLayout.js';
import { addBox } from './collision.js';
import { BLOCK, ROAD, CELL, GRID_X, GRID_Z, SIDEWALK, CURB, X0, Z0, LAND, BEACH_Z, SEA_LEVEL, roadX, roadZ, blockCenterZ } from '../core/config.js';
import { cityRng as R } from '../core/rng.js';

const animated = [];
export const nightMaterials = [];

// ---------- palms ----------
function frondGeometry() {
  const g = new GeoBuilder();
  const n = 8;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + R.range(-0.2, 0.2);
    const ca = Math.cos(a), sa = Math.sin(a);
    const segs = 4, len = 4.6, wid = 0.9;
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs, t1 = (s + 1) / segs;
      const y0 = Math.sin(t0 * 1.6) * 1.0 - t0 * t0 * 2.6, y1 = Math.sin(t1 * 1.6) * 1.0 - t1 * t1 * 2.6;
      const r0 = t0 * len, r1 = t1 * len;
      const px = -sa * wid, pz = ca * wid;
      g.quad([ca * r0 - px, y0, sa * r0 - pz], [ca * r0 + px, y0, sa * r0 + pz], [ca * r1 + px, y1, sa * r1 + pz], [ca * r1 - px, y1, sa * r1 - pz], [0, 1, 0],
        [[t0, 0], [t0, 1], [t1, 1], [t1, 0]]);
    }
  }
  return g.build();
}

function buildPalms(scene, spots) {
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 1, 7, 4);
  trunkGeo.translate(0, 0.5, 0);
  const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x8a6f52, roughness: 1 }), spots.length);
  const fronds = new THREE.InstancedMesh(frondGeometry(), new THREE.MeshStandardMaterial({ map: T.frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }), spots.length);
  spots.forEach(([x, z, y = CURB], i) => {
    const h = R.range(7, 11.5), rx = R.range(-0.12, 0.12), rz = R.range(-0.12, 0.12);
    setInstance(trunk, i, x, y, z, 0, 1, h, 1, rx, rz);
    const tx = x - Math.sin(rz) * h, tz = z + Math.sin(rx) * h;
    setInstance(fronds, i, tx, y + h * Math.cos(rx) * Math.cos(rz), tz, R.range(0, 6.28), 1, 1, 1);
    addBox(x - 0.3, x + 0.3, z - 0.3, z + 0.3, h, 'prop');
  });
  trunk.castShadow = fronds.castShadow = true;
  scene.add(trunk, fronds);
}

// ---------- street lamps ----------
function buildLamps(scene) {
  const spots = [];
  const edge = ROAD / 2 + 0.8;
  for (let j = 0; j <= GRID_Z; j++) for (let i = 0; i < GRID_X; i++) {
    for (let k = 1; k <= 2; k++) {
      const x = roadX(i) + (CELL * k) / 3;
      spots.push([x, roadZ(j) - edge, 0], [x, roadZ(j) + edge, Math.PI]);
    }
  }
  for (let i = 0; i <= GRID_X; i++) for (let j = 0; j < GRID_Z; j++) {
    const z = roadZ(j) + CELL / 2;
    spots.push([roadX(i) - edge, z, -Math.PI / 2], [roadX(i) + edge, z, Math.PI / 2]);
  }
  const usable = spots.filter(([x, z]) => z < -Z0 + ROAD && x > X0 - ROAD && x < -X0 + ROAD && z > Z0 - ROAD);
  const kit = new GeoBuilder();
  kit.box(0, 0, 0, 0.18, 7.2, 0.18, 1);
  kit.box(0, 7.0, 1.0, 0.12, 0.12, 2.1, 1);
  const pole = new THREE.InstancedMesh(kit.build(), new THREE.MeshStandardMaterial({ color: 0x2d3640, metalness: 0.6, roughness: 0.45 }), usable.length);
  const headGeo = new THREE.BoxGeometry(0.5, 0.18, 0.9);
  const headMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffd9a0, emissiveIntensity: 0 });
  nightMaterials.push({ mat: headMat, max: 3.0 });
  const head = new THREE.InstancedMesh(headGeo, headMat, usable.length);
  const glowPos = [];
  usable.forEach(([x, z, ry], i) => {
    setInstance(pole, i, x, CURB, z, ry);
    const hx = x + Math.sin(ry) * 2.0, hz = z + Math.cos(ry) * 2.0;
    setInstance(head, i, hx, CURB + 6.95, hz, ry);
    glowPos.push(hx, CURB + 6.7, hz);
    addBox(x - 0.15, x + 0.15, z - 0.15, z + 0.15, 7, 'prop');
  });
  pole.castShadow = true;
  scene.add(pole, head);
  // Light pools: additive glow sprites under each lamp head, faded in at dusk.
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3));
  const glowMat = new THREE.PointsMaterial({ map: T.glowTexture(), color: 0xffcf8a, size: 9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  nightMaterials.push({ mat: glowMat, max: 0.85, opacity: true });
  scene.add(new THREE.Points(glowGeo, glowMat));
  return usable.length;
}

// ---------- Old Port ----------
const CONTAINER_COLORS = [0xc0392b, 0x2e86c1, 0x27ae60, 0xd35400, 0x7d3c98, 0x1abc9c, 0xb7950b, 0x5d6d7e];
function buildPort(scene) {
  const list = [];
  for (const b of blocks) {
    if (!b.containerYard) continue;
    const y = b.containerYard;
    for (let x = y.x0 + 2; x < y.x1 - 2; x += 3.2) {
      if (R.chance(0.25)) continue;
      for (let z = y.z0 + 3.5; z < y.z1 - 3.5; z += 7.4) {
        if (R.chance(0.2)) continue;
        const stack = R.int(1, 3);
        for (let s = 0; s < stack; s++) list.push([x, CURB + s * 2.6, z, R.pick(CONTAINER_COLORS)]);
        addBox(x - 1.25, x + 1.25, z - 3.05, z + 3.05, CURB + stack * 2.6, 'container');
      }
    }
  }
  const geo = new THREE.BoxGeometry(2.44, 2.59, 6.06);
  geo.translate(0, 1.295, 0);
  const tex = T.corrugatedTexture();
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.25 }), list.length);
  const c = new THREE.Color();
  list.forEach(([x, y, z, col], i) => { setInstance(mesh, i, x, y, z); mesh.setColorAt(i, c.setHex(col)); });
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);

  // Gantry cranes along the east quay.
  const crane = new GeoBuilder();
  const red = [0.86, 0.32, 0.18], white = [0.92, 0.92, 0.9];
  for (const zc of [blockCenterZ(1), blockCenterZ(3), blockCenterZ(5)]) {
    const x = LAND.maxX - 7;
    for (const dz of [-6, 6]) for (const dx of [-4.5, 4.5]) {
      crane.box(x + dx, 0, zc + dz, 1, 28, 1, 1, red);
      addBox(x + dx - 0.6, x + dx + 0.6, zc + dz - 0.6, zc + dz + 0.6, 28, 'prop');
    }
    crane.box(x, 26, zc - 6, 10, 1.4, 1.2, 1, red);
    crane.box(x, 26, zc + 6, 10, 1.4, 1.2, 1, red);
    crane.box(x + 8, 28, zc, 52, 2, 3, 1, red);       // boom over the water and yard
    crane.box(x - 2, 29.6, zc, 6, 3.4, 4, 1, white);   // cab
    crane.box(x + 16, 20, zc, 0.15, 8, 0.15, 1, [0.2, 0.2, 0.2]);
    crane.box(x + 16, 18.5, zc, 2.6, 1.5, 6.4, 1, [0.95, 0.75, 0.1]); // spreader
  }
  const cm = new THREE.Mesh(crane.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }));
  cm.castShadow = true;
  scene.add(cm);
}

// ---------- yacht ----------
function buildYacht(scene) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf7f7f2, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2633, roughness: 0.2, metalness: 0.3 });
  const teak = new THREE.MeshStandardMaterial({ color: 0x9c6b3e, roughness: 0.7 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 3.2, 36), white); hull.position.y = 0.4; g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(4.5, 10, 4, 1), white); bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.scale.set(1, 1, 0.5); bow.position.set(0, 0.6, -22); g.add(bow);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.2, 34), teak); deck.position.y = 2.1; g.add(deck);
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(7, 2.6, 18), white); c1.position.set(0, 3.4, 4); g.add(c1);
  const w1 = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.9, 16), dark); w1.position.set(0, 3.7, 4); g.add(w1);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.2, 10), white); c2.position.set(0, 5.8, 5); g.add(c2);
  const w2 = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.8, 9), dark); w2.position.set(0, 6.0, 5); g.add(w2);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5), dark); mast.position.set(0, 9, 6); g.add(mast);
  const name = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.2), new THREE.MeshBasicMaterial({ map: T.textTexture('SOVEREIGN TIDE', '#f7f7f2', '#1b2633', 512, 80, 'italic 800 52px "Segoe UI", sans-serif') }));
  name.position.set(-4.52, 1.2, 10); name.rotation.y = -Math.PI / 2; g.add(name);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.position.set(LAND.maxX + 7, SEA_LEVEL + 0.3, landmarks.quay.z);
  scene.add(g);
  animated.push((t) => { g.position.y = SEA_LEVEL + 0.3 + Math.sin(t * 0.8) * 0.15; g.rotation.z = Math.sin(t * 0.6) * 0.012; });
  // gangway from the quay
  const plank = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 1.6), teak);
  plank.position.set(LAND.maxX + 1.5, 1.0, landmarks.quay.z + 4);
  plank.rotation.z = -0.18;
  scene.add(plank);
}

// ---------- beach ----------
function buildBeach(scene) {
  const umb = [];
  for (let x = LAND.minX + 30; x < LAND.maxX - 30; x += R.range(9, 16)) {
    if (Math.abs(x - landmarks.ferris.x) < 30) continue;
    umb.push([x, BEACH_Z + R.range(14, 30)]);
  }
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.6);
  poleGeo.translate(0, 1.3, 0);
  const capGeo = new THREE.ConeGeometry(1.8, 0.7, 10, 1, true);
  capGeo.translate(0, 2.7, 0);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0xeeeeee }), umb.length);
  const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), umb.length);
  const towelGeo = new THREE.PlaneGeometry(1, 2);
  towelGeo.rotateX(-Math.PI / 2);
  const towels = new THREE.InstancedMesh(towelGeo, new THREE.MeshStandardMaterial({ roughness: 1 }), umb.length);
  const c = new THREE.Color();
  umb.forEach(([x, z], i) => {
    const y = CURB - Math.max(0, z - (LAND.maxZ - 22)) * 0.09;
    setInstance(poles, i, x, y, z, 0, 1, 1, 1, R.range(-0.1, 0.1));
    setInstance(caps, i, x, y, z, R.next() * 6);
    setInstance(towels, i, x + 1.3, y + 0.03, z + 0.4, R.range(-0.4, 0.4));
    caps.setColorAt(i, c.setHex(R.pick([0xff6b5a, 0x2fd3c4, 0xffc04d, 0xff9ff3, 0x54a0ff])));
    towels.setColorAt(i, c.setHex(R.pick([0xffffff, 0xff6b5a, 0x48dbfb, 0xfeca57])));
  });
  caps.castShadow = true;
  scene.add(poles, caps, towels);

  // Lifeguard towers.
  for (const x of [LAND.minX + 80, 0, LAND.maxX - 70]) {
    const g = new GeoBuilder();
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) g.box(x + dx, 0, BEACH_Z + 20 + dz, 0.15, 3, 0.15, 1, [0.95, 0.95, 0.95]);
    g.box(x, 3, BEACH_Z + 20, 3, 2.4, 3, 1, [0.95, 0.35, 0.3]);
    g.box(x, 5.4, BEACH_Z + 20, 3.6, 0.3, 3.6, 1, [0.98, 0.95, 0.9]);
    const m = new THREE.Mesh(g.build(), new THREE.MeshStandardMaterial({ vertexColors: true }));
    m.castShadow = true;
    scene.add(m);
    addBox(x - 1.5, x + 1.5, BEACH_Z + 18.5, BEACH_Z + 21.5, 6, 'prop');
  }
}

// ---------- Sunset Pier wheel ----------
function buildFerris(scene) {
  const { x, z } = landmarks.ferris;
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  const steel = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 0.4, roughness: 0.4 });
  const R0 = 18;
  for (const s of [-1, 1]) {
    const legA = new THREE.Mesh(new THREE.BoxGeometry(0.6, 22, 0.6), steel); legA.position.set(-5, 10, s * 2.2); legA.rotation.z = 0.25; root.add(legA);
    const legB = legA.clone(); legB.position.x = 5; legB.rotation.z = -0.25; root.add(legB);
  }
  const wheel = new THREE.Group();
  wheel.position.y = R0 + 3;
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff4fa3, emissiveIntensity: 0.2, metalness: 0.4, roughness: 0.4 });
  nightMaterials.push({ mat: ringMat, max: 2.4, base: 0.2 });
  for (const s of [-1.6, 1.6]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R0, 0.25, 6, 48), ringMat);
    ring.position.z = s; wheel.add(ring);
    for (let k = 0; k < 16; k++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.15, R0, 0.15), steel);
      const a = (k / 16) * Math.PI * 2;
      spoke.position.set(Math.cos(a) * R0 / 2, Math.sin(a) * R0 / 2, s);
      spoke.rotation.z = a - Math.PI / 2;
      wheel.add(spoke);
    }
  }
  const gondolas = [];
  const cols = [0xff6b5a, 0x2fd3c4, 0xffc04d, 0x9b59b6];
  for (let k = 0; k < 16; k++) {
    const gd = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2.4), new THREE.MeshStandardMaterial({ color: cols[k % 4], roughness: 0.5 }));
    const a = (k / 16) * Math.PI * 2;
    gd.position.set(Math.cos(a) * R0, Math.sin(a) * R0 - 1.2, 0);
    gd.castShadow = true;
    wheel.add(gd);
    gondolas.push(gd);
  }
  root.add(wheel);
  // the pier deck it stands on
  const deck = new THREE.Mesh(new THREE.BoxGeometry(30, 0.6, 70), new THREE.MeshStandardMaterial({ color: 0x9c7a55, roughness: 0.9 }));
  deck.position.set(0, -0.1, 18);
  deck.receiveShadow = true;
  root.add(deck);
  scene.add(root);
  addBox(x - 6, x + 6, z - 3, z + 3, 40, 'prop');
  animated.push((t) => {
    wheel.rotation.z = t * 0.06;
    for (const gd of gondolas) gd.rotation.z = -wheel.rotation.z;
  });
}

// ---------- Punta Faro lighthouse ----------
function buildLighthouse(scene, state) {
  const { x, z } = landmarks.lighthouse;
  const stripes = document.createElement('canvas');
  stripes.width = 8; stripes.height = 64;
  const ctx = stripes.getContext('2d');
  for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#c0392b' : '#f5f3ee'; ctx.fillRect(0, i * 8, 8, 8); }
  const tex = new THREE.CanvasTexture(stripes);
  tex.colorSpace = THREE.SRGBColorSpace;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 26, 20), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  tower.position.set(x, 13, z);
  tower.castShadow = true;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xfff2a0, emissiveIntensity: 0.4 });
  nightMaterials.push({ mat: lampMat, max: 4, base: 0.4 });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 2.4, 12), lampMat);
  lamp.position.set(x, 27.4, z);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.4, 12), new THREE.MeshStandardMaterial({ color: 0x2c3e50 }));
  cap.position.set(x, 29.8, z);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff4c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  nightMaterials.push({ mat: beamMat, max: 0.18, opacity: true });
  const beamGeo = new THREE.ConeGeometry(9, 140, 16, 1, true);
  beamGeo.translate(0, -70, 0);
  beamGeo.rotateZ(Math.PI / 2);
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(x, 27.4, z);
  scene.add(tower, lamp, cap, beam);
  addBox(x - 3, x + 3, z - 3, z + 3, 30, 'prop');
  animated.push((t) => { beam.rotation.y = t * 0.6; });
}

// ---------- signage ----------
const HOTEL_NAMES = [['FLAMINGO', '#ff4fa3'], ['SEABREEZE', '#2fd3c4'], ['PALMA ROSA', '#ff9f43'], ['THE CORAL', '#ff6b5a'], ['AZUL', '#4fa3ff'], ['STARLITE', '#ffd23f'], ['LA BRISA', '#a29bfe'], ['MARISOL', '#55efc4']];
function buildSigns(scene) {
  const signs = [];
  let n = 0;
  for (const b of buildings) {
    if (b.style !== STYLE.deco || b.block.district !== 'coral' || b.d < 15) continue;
    const [name, col] = HOTEL_NAMES[n++ % HOTEL_NAMES.length];
    signs.push({ tex: T.neonTexture(name, col, 'HOTEL'), x: b.x, y: CURB + Math.min(b.h - 2.5, 9), z: b.z + b.d / 2 + 0.15, w: Math.min(b.w * 0.75, 11), ry: 0 });
  }
  const L = (bx, bz) => buildings.find((b) => b.block.bx === bx && b.block.bz === bz);
  const lm = [
    [4, 5, 'TIDEWATER', '#ffd23f', 'CLUB · LIVE MUSIC', 'n'],
    [2, 0, 'IRON PELICAN', '#ff9f43', 'ARMS & AMMO', 's'],
    [5, 1, 'ST. CELESTE', '#ff6b6b', 'MEDICAL CENTER', 's'],
    [2, 3, 'SBPD', '#4fa3ff', 'PRECINCT 9', 'e'],
    [6, 4, "SAL'S", '#2fd3c4', 'BODY SHOP', 'w'],
    [0, 2, 'CASA REYES', '#55efc4', '', 'e'],
  ];
  for (const [bx, bz, name, col, sub, side] of lm) {
    const cand = buildings.filter((b) => b.block.bx === bx && b.block.bz === bz);
    if (!cand.length) continue;
    const pick = (fn) => cand.reduce((a, b) => (fn(b) > fn(a) ? b : a));
    const b = side === 'n' ? pick((q) => -q.z) : side === 's' ? pick((q) => q.z) : side === 'e' ? pick((q) => q.x) : pick((q) => -q.x);
    const y = CURB + Math.min(b.h - 1.6, 7.5);
    const w = Math.min(10, (side === 'n' || side === 's' ? b.w : b.d) * 0.8);
    if (side === 'n') signs.push({ tex: T.neonTexture(name, col, sub), x: b.x, y, z: b.z - b.d / 2 - 0.15, w, ry: Math.PI });
    if (side === 's') signs.push({ tex: T.neonTexture(name, col, sub), x: b.x, y, z: b.z + b.d / 2 + 0.15, w, ry: 0 });
    if (side === 'e') signs.push({ tex: T.neonTexture(name, col, sub), x: b.x + b.w / 2 + 0.15, y, z: b.z, w, ry: Math.PI / 2 });
    if (side === 'w') signs.push({ tex: T.neonTexture(name, col, sub), x: b.x - b.w / 2 - 0.15, y, z: b.z, w, ry: -Math.PI / 2 });
  }
  void L;
  for (const s of signs) {
    const mat = new THREE.MeshBasicMaterial({ map: s.tex, toneMapped: false, color: 0xbbbbbb });
    nightMaterials.push({ mat, basic: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.w * 0.3125), mat);
    m.position.set(s.x, s.y, s.z);
    m.rotation.y = s.ry;
    scene.add(m);
  }

  // Rooftop billboards on midtown and downtown roofs.
  let k = 0;
  const frame = new THREE.MeshStandardMaterial({ color: 0x30363d, metalness: 0.5, roughness: 0.5 });
  for (const b of buildings) {
    if (b.style === STYLE.house || b.style === STYLE.warehouse || b.h > 40 || b.h < 12 || !R.chance(0.28)) continue;
    const g = new THREE.Group();
    const w = Math.min(14, b.w * 0.9);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), new THREE.MeshStandardMaterial({ map: T.adTexture(k++), emissive: 0xffffff, emissiveMap: T.adTexture(k - 1), emissiveIntensity: 0.15 }));
    nightMaterials.push({ mat: board.material, max: 0.9, base: 0.15 });
    board.position.y = w / 4 + 2.2;
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, w / 2 + 0.4, 0.3), frame);
    back.position.set(0, w / 4 + 2.2, -0.2);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), frame);
    leg.position.y = 1.2;
    g.add(board, back, leg);
    const face = R.int(0, 3);
    g.rotation.y = face * Math.PI / 2;
    g.position.set(b.x + Math.sin(g.rotation.y) * b.d * 0.3, CURB + b.h + 0.9, b.z + Math.cos(g.rotation.y) * b.d * 0.3);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
  }
}

// ---------- parks ----------
function buildParks(scene, palmSpots) {
  for (const b of blocks) {
    if (!b.park) continue;
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.4, 0.9, 32), new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.7 }));
    basin.position.set(b.cx, CURB + 0.45, b.cz);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(5.6, 32), new THREE.MeshStandardMaterial({ color: 0x3ec1d3, roughness: 0.1, metalness: 0.2 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(b.cx, CURB + 0.8, b.cz);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 2.6, 12), basin.material);
    spout.position.set(b.cx, CURB + 1.3, b.cz);
    basin.castShadow = spout.castShadow = true;
    scene.add(basin, pool, spout);
    addBox(b.cx - 5, b.cx + 5, b.cz - 5, b.cz + 5, 1.2, 'prop');
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      palmSpots.push([b.cx + Math.cos(a) * 17, b.cz + Math.sin(a) * 17]);
    }
  }
}

export function buildProps(scene) {
  const palmSpots = [];
  // Palms line Palm Heights yards, the Coral Strip promenade and the beach.
  for (const b of blocks) {
    if (b.district === 'palms') for (let k = 0; k < 6; k++) palmSpots.push([b.cx + R.range(-24, 24), b.cz + R.range(-24, 24)]);
    if (b.district === 'coral') for (let k = -2; k <= 2; k++) palmSpots.push([b.cx + k * 12, b.cz + BLOCK / 2 - SIDEWALK / 2 + 0.6]);
  }
  for (let x = LAND.minX + 20; x < LAND.maxX - 20; x += 14) palmSpots.push([x + R.range(-2, 2), BEACH_Z + R.range(2, 6), CURB]);
  // keep palms off building footprints
  const clear = palmSpots.filter(([x, z]) => !buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + 1.2 && Math.abs(z - b.z) < b.d / 2 + 1.2));
  buildParks(scene, clear);
  buildPalms(scene, clear);
  const lampCount = buildLamps(scene);
  buildPort(scene);
  buildYacht(scene);
  buildBeach(scene);
  buildFerris(scene);
  buildLighthouse(scene);
  buildSigns(scene);
  return { palms: clear.length, lamps: lampCount };
}

/** Per-frame: animate set pieces and fade night-only lighting. */
export function updateProps(t, night) {
  for (const fn of animated) fn(t);
  for (const n of nightMaterials) {
    if (n.basic) n.mat.color.setScalar(0.75 + night * 0.25);
    else if (n.opacity) n.mat.opacity = n.max * night;
    else n.mat.emissiveIntensity = (n.base || 0) + (n.max - (n.base || 0)) * night;
  }
}
