// Sky dome, sun, and the day/night cycle: one function maps the clock to sun direction,
// light colours, fog and the night factor that lights windows, lamps and neon.
import * as THREE from 'three';
import { buildingUniforms } from './buildings.js';
import { waterUniforms } from './terrain.js';

const KEYS = [
  // hour, sky top, sky horizon, sun colour, sun intensity, hemi intensity, fog
  [0, 0x050818, 0x1a1838, 0x6a7fb8, 0.25, 0.35, 0x121428],
  [5.2, 0x0d1230, 0x5a3d5c, 0xff9e6b, 0.4, 0.45, 0x3a2f48],
  [6.5, 0x4a83c4, 0xffb98a, 0xffc48a, 1.6, 0.8, 0xe8b9a0],
  [9, 0x2a7ad6, 0xa6d6f2, 0xfff1d8, 3.0, 0.8, 0xb4d8ec],
  [15, 0x2878d4, 0xb0dcf2, 0xffeccc, 3.1, 0.8, 0xbcdcec],
  [17.6, 0x3d66c0, 0xffa66a, 0xffa860, 2.8, 0.7, 0xf0ac86],
  [19.0, 0x3a2c6e, 0xff6e5a, 0xff7a4a, 1.3, 0.6, 0xc06a6a],
  [20.2, 0x10153a, 0x6a3a6a, 0x8a7ad0, 0.45, 0.4, 0x3a2a4a],
  [24, 0x050818, 0x1a1838, 0x6a7fb8, 0.25, 0.35, 0x121428],
];

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.uniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() }, night: { value: 0 } };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1800, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, uniforms: this.uniforms,
        vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; varying vec3 vD;
          float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
          void main(){
            float y = max(vD.y, 0.0);
            vec3 c = mix(horizon, top, pow(y, 0.55));
            float s = max(dot(vD, normalize(sunDir)), 0.0);
            c += sunCol * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.12);
            vec3 g = floor(vD * 420.0);
            float star = step(0.9975, hash(g)) * night * smoothstep(0.05, 0.4, vD.y);
            c += star * 0.9;
            float cloud = smoothstep(0.55, 0.9, sin(vD.x * 9.0 + vD.z * 4.0) * sin(vD.z * 7.0 - vD.x * 3.0) * 0.5 + 0.5) * smoothstep(0.05, 0.35, vD.y) * (1.0 - smoothstep(0.35, 0.8, vD.y));
            c = mix(c, mix(horizon * 1.15 + 0.1, vec3(0.2,0.2,0.3), night), cloud * 0.35);
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    dome.frustumCulled = false;
    dome.renderOrder = -10;
    scene.add(dome);
    this.dome = dome;

    this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x6b5a48, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = -90; s.right = 90; s.top = 90; s.bottom = -90; s.near = 1; s.far = 500;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);
    scene.fog = new THREE.Fog(0xc2deea, 120, 760);
    this.night = 0;
    this.hour = 16.5;
    this.renderer = renderer;
    // Reflection environment: a tiny copy of the sky dome baked through PMREM. Glass towers, car
    // paint and the water pick up the time-of-day colours; rebaked every ~20 game minutes.
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), dome.material);
    envDome.frustumCulled = false;
    this.envScene.add(envDome);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 16), new THREE.MeshBasicMaterial({ color: 0x8a7a68 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -2;
    this.envScene.add(ground);
    this.envGround = ground;
    this.envHour = -99;
    this.envTarget = null;
  }

  bakeEnvironment() {
    const prev = this.envTarget;
    this.envGround.material.color.setRGB(0.5, 0.44, 0.38).multiplyScalar(1 - this.night * 0.85);
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.45 + 0.35 * (1 - this.night);
    if (prev) prev.dispose();
  }

  sample(hour) {
    let a = KEYS[0], b = KEYS[1];
    for (let i = 0; i < KEYS.length - 1; i++) if (hour >= KEYS[i][0] && hour <= KEYS[i + 1][0]) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    const t = (hour - a[0]) / Math.max(0.001, b[0] - a[0]);
    const c = (i) => new THREE.Color(a[i]).lerp(new THREE.Color(b[i]), t);
    return { top: c(1), horizon: c(2), sun: c(3), sunI: a[4] + (b[4] - a[4]) * t, hemiI: a[5] + (b[5] - a[5]) * t, fog: c(6) };
  }

  update(hour, focus) {
    this.hour = hour;
    const k = this.sample(hour);
    // Sun arcs east→west; at night the "sun" light becomes a cool moon from the other side.
    const day = (hour - 6) / 14;
    const ang = Math.PI * Math.min(Math.max(day, -0.1), 1.1);
    const dir = new THREE.Vector3(Math.cos(ang) * 0.8, Math.max(0.12, Math.sin(ang)), 0.45).normalize();
    const nightF = hour < 5.5 || hour > 20 ? 1 : hour < 7 ? 1 - (hour - 5.5) / 1.5 : hour > 18.5 ? (hour - 18.5) / 1.5 : 0;
    this.night = Math.min(1, Math.max(0, nightF));
    const lightDir = this.night > 0.7 ? new THREE.Vector3(-0.4, 0.8, -0.3).normalize() : dir;
    this.uniforms.top.value.copy(k.top);
    this.uniforms.horizon.value.copy(k.horizon);
    this.uniforms.sunDir.value.copy(dir);
    this.uniforms.sunCol.value.copy(k.sun).multiplyScalar(1 - this.night * 0.9);
    this.uniforms.night.value = this.night;
    this.sun.color.copy(k.sun);
    this.sun.intensity = k.sunI;
    this.hemi.intensity = k.hemiI;
    this.hemi.color.copy(k.top).lerp(new THREE.Color(0xffffff), 0.4);
    this.scene.fog.color.copy(k.fog);
    this.dome.position.copy(focus);
    this.sun.position.set(focus.x + lightDir.x * 200, lightDir.y * 200, focus.z + lightDir.z * 200);
    this.sun.target.position.set(focus.x, 0, focus.z);
    buildingUniforms.uNight.value = this.night;
    waterUniforms.uNight.value = this.night;
    waterUniforms.uSun.value.copy(dir);
    waterUniforms.uSky.value.copy(k.horizon).lerp(k.top, 0.3);
    this.renderer.toneMappingExposure = 1.05 + this.night * 0.15;
    const dh = Math.abs(hour - this.envHour);
    if (dh > 0.33 && dh < 23.67) { this.envHour = hour; this.bakeEnvironment(); }
  }
}
