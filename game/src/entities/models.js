// Procedural model factories: jointed low-poly people (outfits per role) and cars by type
// (sedan, sport, van, pickup, cab, police cruiser, armoured van). Parts that move together are
// merged into one vertex-coloured mesh, so a car is ~9 draw calls and a person ~10.
import * as THREE from 'three';
import { textTexture } from '../world/textures.js';
import { GeoBuilder } from '../world/geometry.js';
import { rng } from '../core/rng.js';

const mats = new Map();
export function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts }));
  return mats.get(k);
}
const rgb = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });

const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x6b4226];
const HAIR = [0x1b1b1b, 0x3b2a20, 0x6a4e2e, 0xc9a24a, 0x9a3b2a, 0xdddddd];
const SHIRT = [0xff6b5a, 0x2fd3c4, 0xffffff, 0xffc04d, 0x6c5ce7, 0x74b9ff, 0xfd79a8, 0x00b894, 0xe17055, 0xdfe6e9];
const PANTS = [0x2d3436, 0x34495e, 0xc8b28a, 0x1e3799, 0x7f8c8d, 0xf5f6fa];

export const OUTFITS = {
  player: { skin: 0xc68642, hair: 0x1b1b1b, shirt: 0xf5f0e6, jacket: 0x2f3e57, pants: 0x3b3f45, shoe: 0xffffff },
  cop: { shirt: 0x2a4a8a, pants: 0x1c2a44, shoe: 0x111111, cap: 0x1c2a44, vest: 0x1a1a1a },
  gang: { shirt: 0x8e2b2b, pants: 0x202020, shoe: 0x222222, cap: 0x101010 },
  boss: { shirt: 0xf4f1ea, jacket: 0xdad3c2, pants: 0xdad3c2, shoe: 0x6b3e1e, skin: 0xe0ac69, hair: 0x9a9a9a },
  ally: { skin: 0x8d5524, hair: 0x1b1b1b, shirt: 0xff4fa3, pants: 0x111111, shoe: 0x111111 },
};

function part(build, parent, x, y, z = 0) {
  const g = new GeoBuilder();
  build(g);
  const m = new THREE.Mesh(g.build(), skinMat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** A jointed person. Returns {root, parts}; parts holds the pivots the animator drives. */
export function makeHuman(role = 'ped', pick = rng) {
  const o = { ...(OUTFITS[role] || {}) };
  const skin = rgb(o.skin ?? pick.pick(SKIN));
  const shirt = rgb(o.shirt ?? pick.pick(SHIRT));
  const pants = rgb(o.pants ?? pick.pick(PANTS));
  const shoe = rgb(o.shoe ?? 0x222222);
  const sleeve = o.jacket ? rgb(o.jacket) : shirt;
  const hair = rgb(o.cap ?? o.hair ?? pick.pick(HAIR));
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.98;
  root.add(body);
  part((g) => {
    g.box(0, 0, 0, 0.5, 0.62, 0.28, 1, o.jacket ? rgb(o.jacket) : shirt);
    g.box(0, 0.42, 0, 0.53, 0.2, 0.3, 1, o.jacket ? rgb(o.jacket) : shirt);
    if (o.jacket) g.box(0, 0.08, 0.13, 0.2, 0.5, 0.04, 1, shirt);
    if (o.vest) { g.box(0, 0.16, 0, 0.55, 0.42, 0.33, 1, rgb(o.vest)); g.box(0.14, 0.44, 0.17, 0.08, 0.08, 0.02, 1, rgb(0xffd700)); }
    g.box(0, -0.06, 0, 0.51, 0.08, 0.29, 1, rgb(0x222222)); // belt
  }, body, 0, 0);
  const neck = new THREE.Group();
  neck.position.y = 0.64;
  body.add(neck);
  part((g) => {
    g.box(0, 0, 0, 0.26, 0.3, 0.28, 1, skin);
    g.box(0, 0.26, -0.01, 0.28, o.cap ? 0.08 : 0.1, 0.3, 1, hair);
    if (o.cap) g.box(0, 0.27, 0.2, 0.26, 0.03, 0.14, 1, hair);
    g.box(-0.06, 0.16, 0.141, 0.04, 0.04, 0.01, 1, rgb(0x111111));
    g.box(0.06, 0.16, 0.141, 0.04, 0.04, 0.01, 1, rgb(0x111111));
  }, neck, 0, 0);
  const limb = (x, y, upperLen, w, colU, colL, end) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const upper = part((g) => g.box(0, -upperLen, 0, w, upperLen, w, 1, colU), pivot, 0, 0);
    upper.position.set(0, 0, 0);
    const lower = new THREE.Group();
    lower.position.y = -upperLen;
    pivot.add(lower);
    part((g) => { g.box(0, -upperLen, 0, w * 0.85, upperLen, w * 0.85, 1, colL); end(g); }, lower, 0, 0);
    return { upper: pivot, lower };
  };
  const armL = limb(-0.33, 0.58, 0.34, 0.14, sleeve, sleeve, (g) => g.box(0, -0.44, 0, 0.1, 0.1, 0.1, 1, skin));
  const armR = limb(0.33, 0.58, 0.34, 0.14, sleeve, sleeve, (g) => g.box(0, -0.44, 0, 0.1, 0.1, 0.1, 1, skin));
  body.add(armL.upper, armR.upper);
  const legL = limb(-0.13, 0.98, 0.46, 0.19, pants, pants, (g) => g.box(0, -0.52, 0.04, 0.17, 0.1, 0.28, 1, shoe));
  const legR = limb(0.13, 0.98, 0.46, 0.19, pants, pants, (g) => g.box(0, -0.52, 0.04, 0.17, 0.1, 0.28, 1, shoe));
  root.add(legL.upper, legR.upper);
  const gunHolder = new THREE.Group();
  gunHolder.position.set(0, -0.36, 0.06);
  armR.lower.add(gunHolder);
  return { root, parts: { body, neck, armL, armR, legL, legR, gunHolder, gun: null } };
}

const gunMat = mat(0x1d1f22, { metalness: 0.7, roughness: 0.35 });
const GUNS = { pistol: [0.06, 0.12, 0.3], smg: [0.07, 0.16, 0.5], shotgun: [0.07, 0.1, 0.8] };
export function setHeldWeapon(parts, weaponId) {
  if (parts.gun) { parts.gunHolder.remove(parts.gun); parts.gun = null; }
  const s = GUNS[weaponId];
  if (!s) return;
  const g = new THREE.Mesh(new THREE.BoxGeometry(...s), gunMat);
  g.rotation.x = Math.PI / 2;
  g.position.z = 0.1;
  parts.gunHolder.add(g);
  parts.gun = g;
}

// ---------------- vehicles ----------------
export const CAR_TYPES = {
  sedan: { len: 4.5, wid: 1.9, hgt: 0.62, cab: [1.7, 0.56, 2.2, -0.15], accel: 13, top: 38, grip: 7.5, mass: 1.0, hp: 100, colors: [0x2e86de, 0xe8e8e8, 0x222f3e, 0xc0392b, 0x16a085, 0xd4a373, 0x8e44ad] },
  sport: { len: 4.6, wid: 2.0, hgt: 0.5, cab: [1.6, 0.44, 1.6, 0.35], accel: 20, top: 54, grip: 9, mass: 0.9, hp: 85, colors: [0xff3b30, 0xffcc00, 0x00d2d3, 0xff6b81, 0x111111, 0xf8f8f8] },
  van: { len: 5.0, wid: 2.1, hgt: 1.5, cab: [1.9, 0.5, 1.0, -1.9], accel: 9, top: 30, grip: 6, mass: 1.6, hp: 140, colors: [0xffffff, 0xdcdde1, 0x40739e, 0xe1b12c] },
  pickup: { len: 5.1, wid: 2.0, hgt: 0.75, cab: [1.8, 0.6, 1.7, -0.6], accel: 12, top: 36, grip: 7, mass: 1.3, hp: 120, colors: [0x6d4c41, 0x2c3e50, 0xb33939, 0xf0f0f0, 0x218c74] },
  cab: { len: 4.6, wid: 1.9, hgt: 0.62, cab: [1.7, 0.56, 2.2, -0.15], accel: 13, top: 37, grip: 7.5, mass: 1.0, hp: 100, colors: [0xffc312] },
  police: { len: 4.8, wid: 2.0, hgt: 0.62, cab: [1.75, 0.56, 2.3, -0.15], accel: 18, top: 50, grip: 8.5, mass: 1.15, hp: 140, colors: [0x14161a] },
  armored: { len: 5.6, wid: 2.3, hgt: 1.7, cab: [2.1, 0.55, 1.2, -2.1], accel: 9, top: 32, grip: 6.5, mass: 2.2, hp: 260, colors: [0x5d6d5f] },
};

const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.55 });
const BLACK = [0.06, 0.06, 0.07], CHROME = [0.8, 0.8, 0.82], GLASS = [0.07, 0.12, 0.17], WHITE = [0.95, 0.95, 0.95];

function wheelGeometry() {
  const tyre = new THREE.CylinderGeometry(0.37, 0.37, 0.28, 14);
  const hub = new THREE.CylinderGeometry(0.21, 0.21, 0.3, 8);
  const merged = new THREE.BufferGeometry();
  const parts = [[tyre, [0.08, 0.08, 0.08]], [hub, [0.78, 0.8, 0.82]]];
  const pos = [], nrm = [], col = [], idx = [];
  for (const [g, c] of parts) {
    const base = pos.length / 3;
    const ng = g.toNonIndexed();
    const p = ng.attributes.position.array, n = ng.attributes.normal.array;
    for (let i = 0; i < p.length; i += 3) { pos.push(p[i + 1], p[i], p[i + 2]); nrm.push(n[i + 1], n[i], n[i + 2]); col.push(...c); idx.push(base + i / 3); }
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // swapping x/y mirrors the winding; flip the index order to keep faces outward
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  merged.setIndex(idx);
  return merged;
}
const WHEEL = wheelGeometry();
const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 });
const plateMats = new Map();

export function makeCar(type = 'sedan', color) {
  const t = CAR_TYPES[type];
  const paint = new THREE.MeshStandardMaterial({ color: color ?? rng.pick(t.colors), roughness: 0.32, metalness: 0.22 });
  const root = new THREE.Group();
  const body = new THREE.Group(); // rolls/pitches on its springs
  root.add(body);
  const L = t.len, W = t.wid, H = t.hgt, base = 0.32;
  const [cw, ch, cl, cz] = t.cab;
  const top = base + H;

  // painted shell
  const p = new GeoBuilder();
  p.box(0, base, 0, W, H, L, 1, WHITE);
  p.box(0, top + ch, cz, cw + 0.02, 0.08, cl * 0.82, 1, WHITE);
  for (const s of [-1, 1]) { p.box(s * cw / 2, top, cz + cl / 2 - 0.05, 0.08, ch, 0.1, 1, WHITE); p.box(s * cw / 2, top, cz - cl / 2 + 0.05, 0.08, ch, 0.1, 1, WHITE); }
  if (type === 'sport') p.box(0, top, -L / 2 + 0.3, W - 0.2, 0.1, 0.4, 1, WHITE); // spoiler deck
  if (type === 'pickup') { p.box(0, top, -L * 0.28, W - 0.1, 0.35, L * 0.4, 1, WHITE); }
  const doors = type === 'police'; // white door panels go on the trim mesh (paint would tint them black)
  if (type === 'cab') for (const s of [-1, 1]) p.box(s * (W / 2 + 0.005), base + H * 0.3, 0, 0.02, 0.12, L * 0.8, 1, [0.05, 0.05, 0.05]);
  paint.vertexColors = true; // white shell tinted by the paint colour; decals keep their own tone
  body.add(new THREE.Mesh(p.build(), paint));

  // glass, rubber, chrome trim
  const k = new GeoBuilder();
  k.box(0, top, cz, cw, ch, cl, 1, GLASS);
  k.box(0, base, 0, W + 0.04, 0.16, L - 1.6, 1, BLACK);
  k.box(0, base + 0.08, L / 2, W + 0.05, 0.22, 0.2, 1, type === 'sport' ? BLACK : CHROME);
  k.box(0, base + 0.08, -L / 2, W + 0.05, 0.22, 0.2, 1, type === 'sport' ? BLACK : CHROME);
  k.box(0, base + 0.3, L / 2 + 0.01, W * 0.4, 0.16, 0.04, 1, BLACK); // grille
  for (const s of [-1, 1]) k.box(s * (W / 2 + 0.05), top - 0.05, cz + cl / 2 - 0.2, 0.12, 0.1, 0.18, 1, BLACK); // mirrors
  if (type === 'pickup') k.box(0, top + 0.03, -L * 0.28, W - 0.3, 0.33, L * 0.38, 1, BLACK);
  if (type === 'sport') for (const s of [-1, 1]) k.box(s * (W / 2 - 0.15), top + 0.1, -L / 2 + 0.3, 0.06, 0.25, 0.06, 1, BLACK);
  if (doors) for (const s of [-1, 1]) k.box(s * (W / 2 + 0.01), base + H * 0.12, 0, 0.03, H * 0.76, L * 0.44, 1, [0.92, 0.92, 0.9]);
  if (type === 'armored') for (let i = -2; i <= 2; i++) k.box(0, top - 0.6, i * 0.9 - 0.6, W + 0.03, 0.08, 0.1, 1, BLACK);
  const trim = new THREE.Mesh(k.build(), trimMat);
  body.add(trim);

  // lamps (own materials so brake lights and headlights can glow per car)
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfffbe6, emissive: 0xfff2cc, emissiveIntensity: 0.4 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x8a0000, emissive: 0xff1a1a, emissiveIntensity: 0.5 });
  const hl = new GeoBuilder(), tl = new GeoBuilder();
  for (const s of [-1, 1]) {
    hl.box(s * (W / 2 - 0.3), top - 0.23, L / 2 + 0.01, 0.42, 0.14, 0.06);
    tl.box(s * (W / 2 - 0.3), top - 0.23, -L / 2 - 0.01, 0.42, 0.14, 0.06);
  }
  body.add(new THREE.Mesh(hl.build(), headMat), new THREE.Mesh(tl.build(), tailMat));

  // number plate
  const num = 'SB ' + Math.floor(rng.next() * 9000 + 1000);
  if (!plateMats.has(num)) plateMats.set(num, new THREE.MeshBasicMaterial({ map: textTexture(num, '#f3f3f3', '#123') }));
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.13), plateMats.get(num));
  plate.position.set(0, base + 0.2, -L / 2 - 0.12);
  plate.rotation.y = Math.PI;
  body.add(plate);

  let lightbar = null;
  if (type === 'police') {
    const logo = new THREE.MeshBasicMaterial({ map: textTexture('SBPD', '#f4f4f4', '#1d3a7a') });
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.34), logo);
      m.position.set(s * (W / 2 + 0.03), base + H * 0.55, 0);
      m.rotation.y = s * Math.PI / 2;
      body.add(m);
    }
    const red = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff0000, emissiveIntensity: 0 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x000055, emissive: 0x1e5bff, emissiveIntensity: 0 });
    const lr = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.36), red);
    lr.position.set(-0.33, top + ch + 0.17, cz);
    const lb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.36), blue);
    lb.position.set(0.33, top + ch + 0.17, cz);
    body.add(lr, lb);
    lightbar = { red, blue };
  }
  if (type === 'cab') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.3), new THREE.MeshBasicMaterial({ map: textTexture('TAXI', '#ffd400', '#111') }));
    sign.position.set(0, top + ch + 0.2, cz);
    body.add(sign);
  }

  const wheels = [];
  const wb = L / 2 - 0.85;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (W / 2 - 0.12), 0.37, sz * wb);
    const tyre = new THREE.Mesh(WHEEL, wheelMat);
    pivot.add(tyre);
    root.add(pivot);
    wheels.push({ pivot, tyre, front: sz > 0 });
  }
  root.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return { root, body, wheels, paint, headMat, tailMat, lightbar, spec: t, type };
}

/** Cheap shadow LOD: only actors near the camera focus cast shadows (halves the shadow pass). */
export function setCastShadow(root, on) {
  if (root.userData.shadowOn === on) return;
  root.userData.shadowOn = on;
  if (!root.userData.meshes) { const list = []; root.traverse((m) => { if (m.isMesh) list.push(m); }); root.userData.meshes = list; }
  for (const m of root.userData.meshes) m.castShadow = on;
}
