// Ground surfaces: road net, junctions, raised sidewalks with curbs, lots and parks, Sunset Beach,
// the seawall and quay edge, and the animated bay water.
import * as THREE from 'three';
import { GeoBuilder } from './geometry.js';
import * as T from './textures.js';
import { blocks } from './cityLayout.js';
import { addBox } from './collision.js';
import {
  BLOCK, ROAD, CELL, GRID_X, GRID_Z, SIDEWALK, CURB, X0, Z0, LAND, BEACH_Z, SEA_LEVEL, roadX, roadZ,
} from '../core/config.js';

export const waterUniforms = { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0.3, 0.6, 0.4) }, uSky: { value: new THREE.Color(0x8ac6e6) }, uNight: { value: 0 } };

function mesh(geo, mat, receive = true) {
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = receive;
  return m;
}

export function buildTerrain(scene) {
  const xMax = -X0, zMax = -Z0;

  // Base land slab under everything (concrete), so gaps never show water.
  const base = new GeoBuilder();
  base.box((LAND.minX + LAND.maxX) / 2, -3, (LAND.minZ + BEACH_Z) / 2, LAND.maxX - LAND.minX, 3, BEACH_Z - LAND.minZ, 6);
  scene.add(mesh(base.build(), new THREE.MeshStandardMaterial({ map: T.concreteTexture(), color: 0x8f8a82, roughness: 0.95 })));

  // Straight road segments.
  const road = new GeoBuilder();
  for (let j = 0; j <= GRID_Z; j++) {
    const z = roadZ(j);
    for (let i = 0; i < GRID_X; i++) {
      const xa = roadX(i) + ROAD / 2, xb = roadX(i + 1) - ROAD / 2;
      // run along x: u across (z), v along (x)
      road.quad([xa, 0.01, z - ROAD / 2], [xa, 0.01, z + ROAD / 2], [xb, 0.01, z + ROAD / 2], [xb, 0.01, z - ROAD / 2], [0, 1, 0],
        [[0, xa / ROAD], [1, xa / ROAD], [1, xb / ROAD], [0, xb / ROAD]]);
    }
  }
  for (let i = 0; i <= GRID_X; i++) {
    const x = roadX(i);
    for (let j = 0; j < GRID_Z; j++) {
      const za = roadZ(j) + ROAD / 2, zb = roadZ(j + 1) - ROAD / 2;
      road.quad([x - ROAD / 2, 0.01, za], [x - ROAD / 2, 0.01, zb], [x + ROAD / 2, 0.01, zb], [x + ROAD / 2, 0.01, za], [0, 1, 0],
        [[0, za / ROAD], [0, zb / ROAD], [1, zb / ROAD], [1, za / ROAD]]);
    }
  }
  scene.add(mesh(road.build(), new THREE.MeshStandardMaterial({ map: T.roadTexture(), roughness: 0.92 })));

  const junction = new GeoBuilder();
  for (let i = 0; i <= GRID_X; i++) for (let j = 0; j <= GRID_Z; j++) {
    const x = roadX(i), z = roadZ(j);
    junction.flat(x - ROAD / 2, z - ROAD / 2, x + ROAD / 2, z + ROAD / 2, 0.012, 1, false, null, [[0, 0], [0, 1], [1, 1], [1, 0]]);
  }
  scene.add(mesh(junction.build(), new THREE.MeshStandardMaterial({ map: T.junctionTexture(), roughness: 0.92 })));

  // Outer ring road shoulder (between the last road and the seawall).
  const shoulder = new GeoBuilder();
  shoulder.flat(LAND.minX, LAND.minZ, LAND.maxX, Z0 - ROAD / 2, 0.005, 4);
  shoulder.flat(LAND.minX, Z0 - ROAD / 2, X0 - ROAD / 2, BEACH_Z, 0.005, 4);
  shoulder.flat(xMax + ROAD / 2, Z0 - ROAD / 2, LAND.maxX, BEACH_Z, 0.005, 4);
  shoulder.flat(X0 - ROAD / 2, zMax + ROAD / 2, xMax + ROAD / 2, BEACH_Z, CURB, 4);
  scene.add(mesh(shoulder.build(), new THREE.MeshStandardMaterial({ map: T.sidewalkTexture(), color: 0xd8d0c0, roughness: 0.9 })));

  // Sidewalk slabs with curbs, then lots on top.
  const walk = new GeoBuilder();
  const grass = new GeoBuilder();
  const plaza = new GeoBuilder();
  const yard = new GeoBuilder();
  for (const b of blocks) {
    walk.box(b.cx, 0, b.cz, BLOCK, CURB, BLOCK, 2);
    const inner = BLOCK - SIDEWALK * 2;
    const x0 = b.cx - inner / 2, x1 = b.cx + inner / 2, z0 = b.cz - inner / 2, z1 = b.cz + inner / 2;
    if (b.park) grass.flat(x0, z0, x1, z1, CURB + 0.01, 6);
    else if (b.district === 'palms') grass.flat(x0, z0, x1, z1, CURB + 0.01, 6);
    else if (b.district === 'oldport') yard.flat(x0, z0, x1, z1, CURB + 0.01, 8);
    else plaza.flat(x0, z0, x1, z1, CURB + 0.01, 8);
  }
  scene.add(mesh(walk.build(), new THREE.MeshStandardMaterial({ map: T.sidewalkTexture(), roughness: 0.88 })));
  scene.add(mesh(grass.build(), new THREE.MeshStandardMaterial({ map: T.grassTexture(), roughness: 1 })));
  scene.add(mesh(plaza.build(), new THREE.MeshStandardMaterial({ map: T.plazaTexture(), roughness: 0.8 })));
  scene.add(mesh(yard.build(), new THREE.MeshStandardMaterial({ map: T.concreteTexture(), roughness: 0.95 })));

  // Sunset Beach: a sand ramp that slides under the water.
  const sandGeo = new THREE.PlaneGeometry(LAND.maxX - LAND.minX + 40, LAND.maxZ - BEACH_Z + 40, 60, 24);
  sandGeo.rotateX(-Math.PI / 2);
  const p = sandGeo.attributes.position;
  const cz = (BEACH_Z + LAND.maxZ + 40) / 2;
  for (let k = 0; k < p.count; k++) {
    const z = p.getZ(k) + cz;
    const x = p.getX(k);
    const depth = Math.max(0, z - (LAND.maxZ - 22)) * 0.09;
    p.setY(k, CURB - depth + Math.sin(x * 0.07) * 0.08 * Math.min(1, depth));
  }
  sandGeo.computeVertexNormals();
  const sandUv = sandGeo.attributes.uv;
  for (let k = 0; k < sandUv.count; k++) sandUv.setXY(k, sandUv.getX(k) * 40, sandUv.getY(k) * 6);
  const sand = mesh(sandGeo, new THREE.MeshStandardMaterial({ map: T.sandTexture(), roughness: 1 }));
  sand.position.set((LAND.minX + LAND.maxX) / 2, 0, cz);
  scene.add(sand);

  // Seawall + rail on the north, west and east edges; the east edge is the Old Port quay.
  const wall = new GeoBuilder();
  const rail = new GeoBuilder();
  const t = 1.2;
  wall.box((LAND.minX + LAND.maxX) / 2, -4, LAND.minZ - t / 2, LAND.maxX - LAND.minX + t * 2, 4.4, t, 3);
  wall.box(LAND.minX - t / 2, -4, (LAND.minZ + BEACH_Z) / 2, t, 4.4, BEACH_Z - LAND.minZ, 3);
  wall.box(LAND.maxX + t / 2, -4, (LAND.minZ + BEACH_Z) / 2, t, 4.4, BEACH_Z - LAND.minZ, 3);
  rail.box((LAND.minX + LAND.maxX) / 2, 0.9, LAND.minZ + 0.1, LAND.maxX - LAND.minX, 0.12, 0.12, 1);
  rail.box(LAND.minX + 0.1, 0.9, (LAND.minZ + BEACH_Z) / 2, 0.12, 0.12, BEACH_Z - LAND.minZ, 1);
  for (let x = LAND.minX; x < LAND.maxX; x += 3) rail.box(x, 0, LAND.minZ + 0.1, 0.1, 0.95, 0.1, 1);
  for (let z = LAND.minZ; z < BEACH_Z; z += 3) rail.box(LAND.minX + 0.1, 0, z, 0.1, 0.95, 0.1, 1);
  for (let z = LAND.minZ + 4; z < BEACH_Z; z += 9) wall.box(LAND.maxX - 0.8, 0, z, 0.7, 0.8, 0.7, 1); // bollards
  scene.add(mesh(wall.build(), new THREE.MeshStandardMaterial({ map: T.concreteTexture(), color: 0xb7b0a2, roughness: 0.95 })));
  const railMesh = mesh(rail.build(), new THREE.MeshStandardMaterial({ color: 0x2b3a46, roughness: 0.4, metalness: 0.6 }));
  railMesh.castShadow = true;
  scene.add(railMesh);
  addBox(LAND.minX - 50, LAND.maxX + 50, LAND.minZ - 50, LAND.minZ, 3, 'wall');
  addBox(LAND.minX - 50, LAND.minX, LAND.minZ - 50, LAND.maxZ + 50, 3, 'wall');
  addBox(LAND.maxX, LAND.maxX + 50, LAND.minZ - 50, LAND.maxZ + 50, 3, 'wall');
  addBox(LAND.minX - 50, LAND.maxX + 50, LAND.maxZ - 6, LAND.maxZ + 50, 3, 'wall');

  buildWater(scene);
}

function buildWater(scene) {
  const geo = new THREE.PlaneGeometry(4000, 4000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...waterUniforms, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } },
    fog: true,
    vertexShader: `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSun; uniform vec3 uSky; uniform float uNight; varying vec3 vW;
      #include <fog_pars_fragment>
      float h(vec2 p){ return sin(p.x*0.21+uTime*0.9)*0.5 + sin(p.y*0.17-uTime*0.7)*0.5 + sin((p.x+p.y)*0.53+uTime*1.7)*0.25 + sin((p.x-p.y)*1.31-uTime*2.3)*0.12; }
      void main(){
        vec2 p = vW.xz; float e = 0.6;
        vec3 n = normalize(vec3(h(p-vec2(e,0.))-h(p+vec2(e,0.)), 2.6, h(p-vec2(0.,e))-h(p+vec2(0.,e))));
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 deep = mix(vec3(0.02,0.24,0.32), vec3(0.01,0.03,0.07), uNight);
        vec3 shallow = mix(vec3(0.1,0.62,0.66), vec3(0.02,0.07,0.12), uNight);
        float shore = smoothstep(${(BEACH_Z + 60).toFixed(1)}, ${(BEACH_Z + 30).toFixed(1)}, vW.z) * step(${(LAND.minX).toFixed(1)}, vW.x) * step(vW.x, ${(LAND.maxX).toFixed(1)});
        vec3 col = mix(deep, shallow, 0.35 + shore * 0.5);
        col = mix(col, uSky, fres * 0.75);
        vec3 r = reflect(-v, n);
        float spec = pow(max(dot(r, normalize(uSun)), 0.0), 220.0);
        col += vec3(1.0,0.85,0.6) * spec * 2.5 * (1.0 - uNight);
        float foam = smoothstep(0.85, 1.0, h(p*1.7)) * 0.25;
        col += foam;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const water = new THREE.Mesh(geo, mat);
  water.position.y = SEA_LEVEL;
  scene.add(water);
  return water;
}
