// Effects: pooled GPU particles (sparks, fire, muzzle flash, smoke, dust, blood), bullet tracers,
// explosion light, skid marks and ground decals. Listens to gameplay events; owns no gameplay.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { glowTexture, smokeTexture } from '../world/textures.js';
import { rng } from '../core/rng.js';
import { addTrauma } from './cameraRig.js';

class ParticlePool {
  constructor(scene, cap, tex, additive) {
    this.cap = cap; this.n = 0;
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3);
    this.c = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.size = new Float32Array(cap); this.grow = new Float32Array(cap); this.alpha = new Float32Array(cap);
    this.grav = new Float32Array(cap); this.drag = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA); if (gl_FragColor.a < 0.01) discard; }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, grow = 0, grav = 0, drag = 0) {
    const i = this.n < this.cap ? this.n++ : Math.floor(Math.random() * this.cap);
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3); this.c.set([r, g, b], i * 3);
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grow[i] = grow; this.grav[i] = grav; this.drag[i] = drag; this.alpha[i] = 1;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const l = --this.n;
        if (i !== l) {
          for (const arr of [this.p, this.v, this.c]) { arr[i * 3] = arr[l * 3]; arr[i * 3 + 1] = arr[l * 3 + 1]; arr[i * 3 + 2] = arr[l * 3 + 2]; }
          for (const arr of [this.life, this.max, this.size, this.grow, this.alpha, this.grav, this.drag]) arr[i] = arr[l];
        }
        i--; continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= k; this.v[i * 3 + 1] = this.v[i * 3 + 1] * k - this.grav[i] * dt; this.v[i * 3 + 2] *= k;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.max[i];
      this.alpha[i] = Math.min(1, t * 2.2);
    }
    this.geo.setDrawRange(0, this.n);
    for (const a of ['position', 'color', 'size', 'alpha']) this.geo.attributes[a].needsUpdate = true;
  }
}

let glow, smoke, tracers, tracerGeo, tracerData = [], boom, skids, skidI = 0, decals, decalI = 0;
const SKIDS = 400, DECALS = 80, TRACERS = 48;

export function initEffects(scene) {
  glow = new ParticlePool(scene, 1600, glowTexture(), true);
  smoke = new ParticlePool(scene, 900, smokeTexture(), false);
  tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRACERS * 6), 3).setUsage(THREE.DynamicDrawUsage));
  tracerGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRACERS * 6), 3).setUsage(THREE.DynamicDrawUsage));
  tracers = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  tracers.frustumCulled = false;
  scene.add(tracers);
  boom = new THREE.PointLight(0xffa040, 0, 40, 1.6);
  scene.add(boom);

  const skidGeo = new THREE.PlaneGeometry(0.32, 0.9);
  skidGeo.rotateX(-Math.PI / 2);
  skids = new THREE.InstancedMesh(skidGeo, new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.45, depthWrite: false }), SKIDS);
  skids.count = 0;
  skids.frustumCulled = false;
  scene.add(skids);
  const decalGeo = new THREE.CircleGeometry(1, 12);
  decalGeo.rotateX(-Math.PI / 2);
  decals = new THREE.InstancedMesh(decalGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }), DECALS);
  decals.count = 0;
  decals.frustumCulled = false;
  scene.add(decals);

  game.on('shot', (e) => muzzle(e.x, e.y, e.z, e.dx, e.dy, e.dz));
  game.on('impact', (e) => impact(e));
  game.on('explosion', (e) => explosion(e.x, e.y, e.z));
  game.on('crash', (e) => { if (e.force > 7) sparks(e.x, 0.6, e.z, 10, 6); if (e.vehicle.driver === game.player) addTrauma(Math.min(0.6, e.force * 0.03)); });
  game.on('death', (e) => decal(e.target.pos.x, e.target.pos.y + 0.03, e.target.pos.z, 0x7a0a0a, 0.9 + Math.random() * 0.5));
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
function decal(x, y, z, color, size) {
  _q.setFromEuler(_e.set(0, Math.random() * 6, 0));
  _m.compose(_v.set(x, y, z), _q, _s.set(size, 1, size));
  decals.setMatrixAt(decalI, _m);
  decals.setColorAt(decalI, new THREE.Color(color));
  decalI = (decalI + 1) % DECALS;
  decals.count = Math.min(DECALS, decals.count + 1);
  decals.instanceMatrix.needsUpdate = true;
  if (decals.instanceColor) decals.instanceColor.needsUpdate = true;
}

export function skidMark(x, y, z, yaw) {
  _q.setFromEuler(_e.set(0, yaw, 0));
  _m.compose(_v.set(x, y + 0.02, z), _q, _s.set(1, 1, 1));
  skids.setMatrixAt(skidI, _m);
  skidI = (skidI + 1) % SKIDS;
  skids.count = Math.min(SKIDS, skids.count + 1);
  skids.instanceMatrix.needsUpdate = true;
}

export function sparks(x, y, z, n = 8, speed = 8) {
  for (let i = 0; i < n; i++) glow.spawn(x, y, z, rng.range(-1, 1) * speed, rng.range(0.2, 1) * speed, rng.range(-1, 1) * speed, rng.range(0.15, 0.4), 0.18, 1, 0.75, 0.3, -0.2, 18, 2);
}
export function dust(x, y, z, n = 2, color = [0.75, 0.7, 0.62]) {
  for (let i = 0; i < n; i++) smoke.spawn(x + rng.range(-0.3, 0.3), y, z + rng.range(-0.3, 0.3), rng.range(-0.6, 0.6), rng.range(0.3, 1), rng.range(-0.6, 0.6), rng.range(0.6, 1.2), 0.9, color[0], color[1], color[2], 2.2, -0.2, 1.5);
}
export function carSmoke(x, y, z, heavy) {
  const c = heavy ? 0.12 : 0.55;
  smoke.spawn(x, y, z, rng.range(-0.4, 0.4), rng.range(1.5, 2.5), rng.range(-0.4, 0.4), rng.range(1.2, 2.2), 1.2, c, c, c, 2.4, -0.3, 0.6);
}
export function fire(x, y, z) {
  glow.spawn(x + rng.range(-0.5, 0.5), y, z + rng.range(-0.5, 0.5), rng.range(-0.3, 0.3), rng.range(2, 4), rng.range(-0.3, 0.3), rng.range(0.3, 0.6), 1.3, 1, rng.range(0.35, 0.6), 0.1, -1.4, 0, 1);
  if (rng.chance(0.3)) carSmoke(x, y + 1, z, true);
}

function muzzle(x, y, z, dx, dy, dz) {
  glow.spawn(x + dx * 0.2, y + dy * 0.2, z + dz * 0.2, dx * 2, dy * 2, dz * 2, 0.05, 0.9, 1, 0.8, 0.4);
  glow.spawn(x, y, z, 0, 0, 0, 0.04, 0.5, 1, 1, 0.8);
  boom.position.set(x, y, z);
  boom.intensity = Math.max(boom.intensity, 6);
  boom.color.setHex(0xffb060);
}

function impact(e) {
  tracer(e.x0, e.y0, e.z0, e.x, e.y, e.z);
  if (e.flesh) {
    for (let i = 0; i < 6; i++) smoke.spawn(e.x, e.y, e.z, rng.range(-1.5, 1.5), rng.range(0, 2), rng.range(-1.5, 1.5), 0.4, 0.35, 0.55, 0.02, 0.02, 0.6, 6, 2);
  } else {
    sparks(e.x, e.y, e.z, e.metal ? 7 : 3, 4);
    dust(e.x, e.y, e.z, 1, [0.6, 0.58, 0.55]);
  }
}

function tracer(x0, y0, z0, x1, y1, z1) {
  tracerData.push({ a: [x0, y0, z0], b: [x1, y1, z1], t: 0.07 });
  if (tracerData.length > TRACERS) tracerData.shift();
}

function explosion(x, y, z) {
  for (let i = 0; i < 60; i++) {
    const a = rng.next() * Math.PI * 2, s = rng.range(2, 14);
    glow.spawn(x, y, z, Math.cos(a) * s, rng.range(1, 10), Math.sin(a) * s, rng.range(0.3, 0.9), rng.range(1.2, 2.6), 1, rng.range(0.4, 0.8), 0.15, 1.5, 6, 2.5);
  }
  for (let i = 0; i < 30; i++) smoke.spawn(x + rng.range(-2, 2), y + rng.range(0, 2), z + rng.range(-2, 2), rng.range(-3, 3), rng.range(2, 6), rng.range(-3, 3), rng.range(1.5, 3.5), 2.5, 0.12, 0.11, 0.1, 3, -0.5, 1.2);
  sparks(x, y, z, 30, 16);
  boom.position.set(x, y + 2, z);
  boom.intensity = 60;
  boom.color.setHex(0xff8a30);
  decal(x, 0.03, z, 0x141210, 3.5);
  const p = game.player;
  if (p) {
    const d = Math.hypot(p.pos.x - x, p.pos.z - z);
    addTrauma(Math.max(0, 1 - d / 45));
  }
}

export function updateEffects(dt) {
  glow.update(dt);
  smoke.update(dt);
  boom.intensity *= Math.exp(-dt * 9);
  const pos = tracerGeo.attributes.position.array, col = tracerGeo.attributes.color.array;
  pos.fill(0); col.fill(0);
  tracerData = tracerData.filter((t) => (t.t -= dt) > 0);
  tracerData.forEach((t, i) => {
    pos.set(t.a, i * 6); pos.set(t.b, i * 6 + 3);
    const k = t.t / 0.07;
    col.set([1 * k, 0.85 * k, 0.5 * k, 0.6 * k, 0.4 * k, 0.2 * k], i * 6);
  });
  tracerGeo.attributes.position.needsUpdate = true;
  tracerGeo.attributes.color.needsUpdate = true;
  tracerGeo.setDrawRange(0, tracerData.length * 2);
  // burning and smoking vehicles
  for (const v of game.vehicles) {
    if (v.wrecked && v.burnT > 0) { fire(v.x, v.y + 1.1, v.z); }
    else if (v.health < v.spec.hp * 0.25 && !v.wrecked) {
      if (v.health <= 0) fire(v.x + v.fwdX * v.spec.len * 0.35, v.y + 1.1, v.z + v.fwdZ * v.spec.len * 0.35);
      else if (Math.random() < 0.3) carSmoke(v.x + v.fwdX * v.spec.len * 0.4, v.y + 1.1, v.z + v.fwdZ * v.spec.len * 0.4, v.health < v.spec.hp * 0.1);
    }
    if (v.skid > 0.45 && v.absSpeed > 6 && !v.wrecked) {
      v._skidT = (v._skidT || 0) - dt;
      if (v._skidT <= 0) {
        v._skidT = 0.04;
        for (const s of [-1, 1]) {
          const bx = v.x - v.fwdX * v.spec.len * 0.32 + v.fwdZ * s * v.spec.wid * 0.42;
          const bz = v.z - v.fwdZ * v.spec.len * 0.32 - v.fwdX * s * v.spec.wid * 0.42;
          skidMark(bx, v.y, bz, Math.atan2(v.vx, v.vz));
          if (Math.random() < 0.5) dust(bx, v.y + 0.2, bz, 1, [0.85, 0.85, 0.85]);
        }
      }
    }
  }
}
