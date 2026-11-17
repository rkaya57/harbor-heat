// Buildings: one instanced box mesh whose shader paints windows, floor bands, storefronts and
// roof gravel per style in world space, plus cornices, hip roofs and rooftop clutter.
import * as THREE from 'three';
import { buildings, STYLE } from './cityLayout.js';
import { addBox } from './collision.js';
import { setInstance } from './geometry.js';
import { CURB } from '../core/config.js';
import { cityRng as R } from '../core/rng.js';

export const buildingUniforms = { uNight: { value: 0 }, uTime: { value: 0 } };

function facadeMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = buildingUniforms.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aStyle; varying vec3 vWP; varying vec3 vWN; varying vec2 vStyle;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 hhW = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        vWP = hhW.xyz; vWN = normalize(mat3(instanceMatrix) * objectNormal); vStyle = aStyle;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight; varying vec3 vWP; varying vec3 vWN; varying vec2 vStyle;
        float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float hhWin = 0.0; float hhLit = 0.0;
        vec3 hhN = normalize(vWN);
        float st = vStyle.x;
        if (abs(hhN.y) < 0.5) {
          float along = abs(hhN.x) > 0.5 ? vWP.z : vWP.x;
          vec2 f = vec2(along, vWP.y - ${CURB.toFixed(2)});
          vec2 cs = st < 0.5 ? vec2(2.4, 3.7) : st < 1.5 ? vec2(3.3, 3.7) : st < 2.5 ? vec2(3.0, 3.4) : st < 3.5 ? vec2(3.6, 3.2) : vec2(5.0, 3.0);
          vec2 id = floor(f / cs); vec2 c = fract(f / cs);
          float rnd = hh(id + vStyle.y * 17.0);
          if (st < 0.5) {
            hhWin = step(0.05, c.x) * step(c.x, 0.95) * step(0.1, c.y) * step(c.y, 0.95);
          } else if (st < 1.5) {
            hhWin = step(0.18, c.x) * step(c.x, 0.82) * step(0.28, c.y) * step(c.y, 0.86);
            diffuseColor.rgb *= 1.0 - 0.18 * step(c.y, 0.1);
          } else if (st < 2.5) {
            hhWin = step(0.22, c.x) * step(c.x, 0.78) * step(0.3, c.y) * step(c.y, 0.8);
            float band = step(0.9, c.y);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), band * 0.75);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.82, step(c.x, 0.06));
          } else if (st < 3.5) {
            hhWin = step(0.3, c.x) * step(c.x, 0.7) * step(0.35, c.y) * step(c.y, 0.8) * step(0.35, rnd);
            if (f.y < 2.6 && abs(c.x - 0.5) < 0.16 && rnd > 0.75) { hhWin = 0.0; diffuseColor.rgb = vec3(0.35, 0.2, 0.12); }
          } else {
            hhWin = step(0.82, c.y) * step(0.1, c.x) * step(c.x, 0.9) * step(2.0, f.y);
            diffuseColor.rgb *= 0.86 + 0.14 * sin(along * 6.283);
            if (f.y < 4.6 && abs(fract(along / 14.0) - 0.5) < 0.17) diffuseColor.rgb = vec3(0.32, 0.34, 0.36) * (0.8 + 0.2 * step(0.5, fract(f.y * 2.0)));
          }
          if (st < 2.5 && f.y < 3.6) {
            float sf = step(0.08, fract(along / 6.0)) * step(0.5, f.y) * step(f.y, 3.1);
            hhWin = sf; rnd = 0.9;
            diffuseColor.rgb *= step(3.1, f.y) * 0.25 + 0.75;
          }
          vec3 glassDay = mix(vec3(0.13, 0.2, 0.27), vec3(0.42, 0.58, 0.68), rnd * 0.55 + clamp(vWP.y / 120.0, 0.0, 0.4));
          if (st < 0.5) glassDay = mix(glassDay, vec3(0.55, 0.72, 0.82), 0.35);
          vec3 glassNight = vec3(0.04, 0.05, 0.08);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(glassDay, glassNight, uNight), hhWin);
          hhLit = hhWin * step(0.45, rnd) * uNight;
          diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 4.0, f.y));
        } else if (hhN.y > 0.5) {
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.5, vec3(0.42, 0.41, 0.4), 0.7) * (0.9 + 0.1 * hh(floor(vWP.xz * 2.0)));
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.12, hhWin);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += hhLit * vec3(1.0, 0.78, 0.45) * 1.25;`);
  };
  return mat;
}

export function buildBuildings(scene) {
  const n = buildings.length;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const style = new Float32Array(n * 2);
  const mesh = new THREE.InstancedMesh(geo, facadeMaterial(), n);
  const col = new THREE.Color();
  buildings.forEach((b, i) => {
    setInstance(mesh, i, b.x, CURB, b.z, 0, b.w, b.h, b.d);
    mesh.setColorAt(i, col.setHex(b.color));
    style[i * 2] = b.style; style[i * 2 + 1] = R.next();
    addBox(b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2, b.h + CURB);
  });
  geo.setAttribute('aStyle', new THREE.InstancedBufferAttribute(style, 2));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  // Cornices and parapets in each building's trim colour; deco gets a mid band and roof fin.
  const trims = [];
  for (const b of buildings) {
    if (b.style === STYLE.house) continue;
    trims.push([b.x, CURB + b.h, b.z, b.w + 0.7, 0.9, b.d + 0.7, b.trim]);
    if (b.style === STYLE.deco) {
      trims.push([b.x, CURB + 3.6, b.z, b.w + 0.5, 0.45, b.d + 0.5, b.trim]);
      if (b.h > 12) trims.push([b.x, CURB + b.h + 0.9, b.z, Math.min(6, b.w * 0.4), R.range(2.5, 5), 1.2, b.trim]);
    }
    if (b.style === STYLE.glass) trims.push([b.x, CURB + b.h + 0.9, b.z, b.w * 0.6, R.range(2, 4), b.d * 0.6, 0x8a929a]);
  }
  const trimMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), trims.length);
  trims.forEach((t, i) => { setInstance(trimMesh, i, t[0], t[1], t[2], 0, t[3], t[4], t[5]); trimMesh.setColorAt(i, col.setHex(t[6])); });
  trimMesh.castShadow = true;
  scene.add(trimMesh);

  // Terracotta hip roofs for Palm Heights houses.
  const houses = buildings.filter((b) => b.style === STYLE.house);
  const roofGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.translate(0, 0.5, 0);
  const roofMesh = new THREE.InstancedMesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0xc8643b, roughness: 0.75, flatShading: true }), houses.length);
  houses.forEach((b, i) => setInstance(roofMesh, i, b.x, CURB + b.h, b.z, 0, b.w + 1.2, 2.8, b.d + 1.2));
  roofMesh.castShadow = true;
  scene.add(roofMesh);

  // Rooftop AC units and water tanks.
  const clutter = [];
  for (const b of buildings) {
    if (b.style === STYLE.house || b.style === STYLE.warehouse) continue;
    const k = R.int(1, 4);
    for (let i = 0; i < k; i++) clutter.push([b.x + R.range(-b.w / 3, b.w / 3), CURB + b.h, b.z + R.range(-b.d / 3, b.d / 3), R.range(1.2, 2.6), R.range(0.9, 1.6), R.range(1.2, 2.2)]);
  }
  const clutterMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xb9bcbf, roughness: 0.5, metalness: 0.3 }), clutter.length);
  clutter.forEach((c, i) => setInstance(clutterMesh, i, c[0], c[1], c[2], 0, c[3], c[4], c[5]));
  clutterMesh.castShadow = true;
  scene.add(clutterMesh);

  // Awnings over storefront doors on deco and office ground floors.
  const awn = [];
  for (const b of buildings) {
    if (b.style !== STYLE.deco && b.style !== STYLE.office) continue;
    for (const s of [-1, 1]) awn.push([b.x, CURB + 3.2, b.z + s * (b.d / 2 + 0.9), b.w * 0.8, 0.25, 1.8, R.pick([0xff6b5a, 0x2fd3c4, 0xffc04d, 0xffffff, 0x3a6ea5])]);
  }
  const awnMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), awn.length);
  awn.forEach((a, i) => { setInstance(awnMesh, i, a[0], a[1], a[2], 0, a[3], a[4], a[5]); awnMesh.setColorAt(i, col.setHex(a[6])); });
  awnMesh.castShadow = true;
  scene.add(awnMesh);
  return mesh;
}
