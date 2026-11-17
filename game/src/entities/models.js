// Procedural model factories: jointed low-poly people (with outfits per role) and cars by type
// (sedan, sport, van, pickup, cab, police cruiser, armoured van). Geometry and materials are shared.
import * as THREE from 'three';
import { textTexture } from '../world/textures.js';
import { rng } from '../core/rng.js';

const mats = new Map();
export function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts }));
  return mats.get(k);
}
const box = (w, h, d, y = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, y, 0); return g; };
const G = {
  torso: box(0.5, 0.62, 0.28, 0.31),
  chest: box(0.52, 0.2, 0.3, 0.52),
  head: box(0.26, 0.3, 0.28, 0.15),
  hair: box(0.28, 0.1, 0.3, 0.31),
  cap: box(0.3, 0.08, 0.36, 0.33),
  limbU: box(0.14, 0.34, 0.14, -0.17),
  limbL: box(0.12, 0.34, 0.12, -0.17),
  legU: box(0.18, 0.46, 0.2, -0.23),
  legL: box(0.15, 0.46, 0.16, -0.23),
  shoe: box(0.17, 0.1, 0.28, -0.05),
  hand: box(0.1, 0.1, 0.1, -0.05),
  pistol: box(0.06, 0.12, 0.3, 0),
  smg: box(0.07, 0.16, 0.5, 0),
  shotgun: box(0.07, 0.1, 0.8, 0),
  vest: box(0.54, 0.4, 0.32, 0.36),
  badge: box(0.08, 0.08, 0.02, 0),
};

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

function limb(parent, upperGeo, lowerGeo, material, x, y, len = 0.34) {
  const upper = new THREE.Mesh(upperGeo, material);
  upper.position.set(x, y, 0);
  const lower = new THREE.Mesh(lowerGeo, material);
  lower.position.y = -len;
  upper.add(lower);
  parent.add(upper);
  return { upper, lower };
}

/** A jointed person. Returns {root, parts} where parts holds pivots the animator drives. */
export function makeHuman(role = 'ped', seedPick = rng) {
  const o = { ...(OUTFITS[role] || {}) };
  const skin = mat(o.skin ?? seedPick.pick(SKIN));
  const shirt = mat(o.shirt ?? seedPick.pick(SHIRT));
  const pants = mat(o.pants ?? seedPick.pick(PANTS));
  const shoeM = mat(o.shoe ?? 0x222222);
  const sleeve = o.jacket ? mat(o.jacket) : shirt;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.98;
  root.add(body);
  const torso = new THREE.Mesh(G.torso, o.jacket ? mat(o.jacket) : shirt);
  body.add(torso);
  if (o.jacket) { const inner = new THREE.Mesh(box(0.2, 0.5, 0.02, 0.33), shirt); inner.position.z = 0.15; body.add(inner); }
  if (o.vest) { const v = new THREE.Mesh(G.vest, mat(o.vest)); body.add(v); const b = new THREE.Mesh(G.badge, mat(0xffd700, { metalness: 0.8, roughness: 0.3 })); b.position.set(0.14, 0.48, 0.17); body.add(b); }
  const neck = new THREE.Group();
  neck.position.y = 0.64;
  body.add(neck);
  const head = new THREE.Mesh(G.head, skin);
  neck.add(head);
  const hair = new THREE.Mesh(o.cap ? G.cap : G.hair, mat(o.cap ?? o.hair ?? seedPick.pick(HAIR)));
  neck.add(hair);
  if (o.cap) { const brim = new THREE.Mesh(box(0.26, 0.03, 0.14, 0.3), mat(o.cap)); brim.position.z = 0.2; neck.add(brim); }
  const armL = limb(body, G.limbU, G.limbL, sleeve, -0.33, 0.58);
  const armR = limb(body, G.limbU, G.limbL, sleeve, 0.33, 0.58);
  for (const a of [armL, armR]) { const h = new THREE.Mesh(G.hand, skin); h.position.y = -0.34; a.lower.add(h); }
  const legL = limb(root, G.legU, G.legL, pants, -0.13, 0.98, 0.46);
  const legR = limb(root, G.legU, G.legL, pants, 0.13, 0.98, 0.46);
  for (const l of [legL, legR]) { const s = new THREE.Mesh(G.shoe, shoeM); s.position.set(0, -0.46, 0.04); l.lower.add(s); }
  const gunHolder = new THREE.Group();
  gunHolder.position.set(0, -0.36, 0.06);
  armR.lower.add(gunHolder);
  root.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return { root, parts: { body, neck, armL, armR, legL, legR, gunHolder, gun: null } };
}

const gunMat = mat(0x1d1f22, { metalness: 0.7, roughness: 0.35 });
export function setHeldWeapon(parts, weaponId) {
  if (parts.gun) { parts.gunHolder.remove(parts.gun); parts.gun = null; }
  const geo = weaponId === 'pistol' ? G.pistol : weaponId === 'smg' ? G.smg : weaponId === 'shotgun' ? G.shotgun : null;
  if (!geo) return;
  const g = new THREE.Mesh(geo, gunMat);
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

const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.28, 14);
wheelGeo.rotateZ(Math.PI / 2);
const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8);
hubGeo.rotateZ(Math.PI / 2);
const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2a38, roughness: 0.08, metalness: 0.6 });
const tyreMat = mat(0x151515, { roughness: 0.9 });
const hubMat = mat(0xc8ccd0, { metalness: 0.8, roughness: 0.3 });
const chromeMat = mat(0xdddddd, { metalness: 0.9, roughness: 0.2 });
const blackMat = mat(0x111111, { roughness: 0.6 });

export function makeCar(type = 'sedan', color) {
  const t = CAR_TYPES[type];
  const paint = new THREE.MeshStandardMaterial({ color: color ?? rng.pick(t.colors), roughness: 0.28, metalness: 0.45 });
  const root = new THREE.Group();
  const body = new THREE.Group(); // rolls/pitches on its springs
  root.add(body);
  const L = t.len, W = t.wid, H = t.hgt, base = 0.32;
  const lower = new THREE.Mesh(box(W, H, L, base + H / 2), paint);
  body.add(lower);
  const skirt = new THREE.Mesh(box(W + 0.04, 0.16, L - 1.6, base + 0.08), blackMat);
  body.add(skirt);
  const [cw, ch, cl, cz] = t.cab;
  const cabin = new THREE.Mesh(box(cw, ch, cl, base + H + ch / 2), glassMat);
  cabin.position.z = cz;
  body.add(cabin);
  const roof = new THREE.Mesh(box(cw + 0.02, 0.08, cl * 0.82, base + H + ch + 0.02), paint);
  roof.position.z = cz;
  body.add(roof);
  for (const s of [-1, 1]) { // pillars give the glass house a frame
    const p = new THREE.Mesh(box(0.08, ch, 0.1, base + H + ch / 2), paint);
    p.position.set(s * cw / 2, 0, cz + cl / 2 - 0.05);
    body.add(p);
  }
  if (type === 'pickup') {
    const bed = new THREE.Mesh(box(W - 0.1, 0.35, L * 0.4, base + H + 0.17), paint);
    bed.position.z = -L * 0.28;
    const inner = new THREE.Mesh(box(W - 0.3, 0.36, L * 0.38, base + H + 0.2), blackMat);
    inner.position.z = -L * 0.28;
    body.add(bed, inner);
  }
  if (type === 'van' || type === 'armored') {
    const back = new THREE.Mesh(box(W, 0.02, L * 0.6, base + H + 0.01), paint);
    back.position.z = -L * 0.18;
    body.add(back);
  }
  // bumpers, grille, lights
  const front = new THREE.Mesh(box(W + 0.05, 0.22, 0.2, base + 0.18), type === 'sport' ? blackMat : chromeMat);
  front.position.z = L / 2;
  const rear = front.clone();
  rear.position.z = -L / 2;
  body.add(front, rear);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfffbe6, emissive: 0xfff2cc, emissiveIntensity: 0.4 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x8a0000, emissive: 0xff1a1a, emissiveIntensity: 0.5 });
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(box(0.42, 0.14, 0.06, base + H - 0.16), headMat);
    hl.position.set(s * (W / 2 - 0.3), 0, L / 2 + 0.01);
    const tl = new THREE.Mesh(box(0.42, 0.14, 0.06, base + H - 0.16), tailMat);
    tl.position.set(s * (W / 2 - 0.3), 0, -L / 2 - 0.01);
    body.add(hl, tl);
  }
  // plate
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.13), new THREE.MeshBasicMaterial({ map: textTexture('SB ' + Math.floor(rng.next() * 9000 + 1000), '#f3f3f3', '#123') }));
  plate.position.set(0, base + 0.2, -L / 2 - 0.12);
  plate.rotation.y = Math.PI;
  body.add(plate);

  let lightbar = null;
  if (type === 'police') {
    const doorMat = mat(0xf4f4f4, { roughness: 0.3, metalness: 0.3 });
    for (const s of [-1, 1]) {
      const d = new THREE.Mesh(box(0.02, H * 0.7, L * 0.42, base + H * 0.5), doorMat);
      d.position.set(s * (W / 2 + 0.01), 0, 0);
      body.add(d);
      const logo = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.34), new THREE.MeshBasicMaterial({ map: textTexture('SBPD', '#f4f4f4', '#1d3a7a'), transparent: false }));
      logo.position.set(s * (W / 2 + 0.03), base + H * 0.55, 0);
      logo.rotation.y = s * Math.PI / 2;
      body.add(logo);
    }
    const red = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff0000, emissiveIntensity: 0 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x000055, emissive: 0x1e5bff, emissiveIntensity: 0 });
    const lr = new THREE.Mesh(box(0.6, 0.14, 0.3, base + H + ch + 0.1), red);
    lr.position.set(-0.33, 0, cz);
    const lb = new THREE.Mesh(box(0.6, 0.14, 0.3, base + H + ch + 0.1), blue);
    lb.position.set(0.33, 0, cz);
    body.add(lr, lb);
    lightbar = { red, blue };
  }
  if (type === 'cab') {
    const sign = new THREE.Mesh(box(0.8, 0.22, 0.3, base + H + ch + 0.14), new THREE.MeshBasicMaterial({ map: textTexture('TAXI', '#ffd400', '#111') }));
    sign.position.z = cz;
    body.add(sign);
    const checker = new THREE.Mesh(box(W + 0.02, 0.1, L * 0.5, base + H * 0.55), blackMat);
    body.add(checker);
  }

  const wheels = [];
  const wb = L / 2 - 0.85;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (W / 2 - 0.12), 0.37, sz * wb);
    const tyre = new THREE.Mesh(wheelGeo, tyreMat);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    tyre.add(hub);
    pivot.add(tyre);
    root.add(pivot);
    wheels.push({ pivot, tyre, front: sz > 0 });
  }
  root.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return { root, body, wheels, paint, headMat, tailMat, lightbar, spec: t, type };
}
