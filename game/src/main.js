// HARBOR HEAT — boot and main loop. Builds Solara Bay, wires systems in a fixed update order,
// and runs the title → play → pause / wasted / busted flow.
import * as THREE from 'three';
import { game } from './core/game.js';
import { initInput, input, setWantLock, requestLock } from './core/input.js';
import { TIME } from './core/config.js';
import { generateCity, landmarks } from './world/cityLayout.js';
import { buildTerrain, waterUniforms } from './world/terrain.js';
import { buildBuildings } from './world/buildings.js';
import { buildProps, updateProps } from './world/props.js';
import { Sky } from './world/sky.js';
import { resolveVehicleContacts } from './entities/vehicle.js';
import { createPlayer, updatePlayer, exitVehicle } from './systems/playerControl.js';
import { rig, updateCamera } from './systems/cameraRig.js';
import { initEffects, updateEffects } from './systems/effects.js';
import { updateTraffic, spawnParkedCars } from './systems/traffic.js';
import { initPedestrians, updatePedestrians } from './systems/pedestrians.js';
import { initPolice, updatePolice, clearPolice } from './systems/police.js';
import { updateMissions, failActiveMission, missionState } from './systems/missions.js';
import { placeWorldPickups, updatePickups } from './systems/pickups.js';
import { updateServices } from './systems/services.js';
import { saveTo, applySave } from './systems/saveGame.js';
import { initHud, updateHud, bigMessage, flash, clearSubtitles } from './ui/hud.js';
import { initMenus, showTitle, showPause, showMap, resume, menuKeys, hideAllScreens, openSaveMenu, openShop } from './ui/menus.js';
import { initAudio } from './audio/soundFx.js';
import { initAudioDirector, updateAudioDirector } from './audio/audioDirector.js';
import { runShotDirector } from './shots.js';

// ---------- renderer ----------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.15, 2400);
Object.assign(game, { scene, camera, renderer });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// ---------- world ----------
generateCity();
buildTerrain(scene);
buildBuildings(scene);
buildProps(scene);
game.sky = new Sky(scene, renderer);
initInput(canvas);
initEffects(scene);
initPedestrians();
initPolice();
initHud();
initAudioDirector();

game.player = createPlayer(landmarks.safehouse.x - 2, landmarks.safehouse.z);
spawnParkedCars(34);
placeWorldPickups();

// ---------- flow ----------
function resetWorld() {
  const p = game.player;
  if (p.vehicle) exitVehicle(p);
  failActiveMission();
  clearPolice();
  clearSubtitles();
  missionState.next = 0; missionState.active = null; missionState.cooldown = 1.5;
  game.cash = 250;
  game.hour = TIME.startHour;
  game.stats = { kills: 0, carsStolen: 0, distance: 0, missionsDone: 0, tokens: 0, bestWanted: 0 };
  game.flags = {};
  p.alive = true; p.health = p.maxHealth; p.armor = 0; p.deadT = 0;
  p.root.rotation.set(0, 0, 0);
  p.inv = { fist: { mag: 0, reserve: 0 } };
  p.setWeapon('fist');
  p.pos.set(landmarks.safehouse.x - 2, 0.2, landmarks.safehouse.z);
  p.vx = p.vz = 0;
  p.root.visible = true;
}

function startPlay() {
  initAudio();
  hideAllScreens();
  document.getElementById('hud').classList.remove('hidden');
  rig.override = null;
  rig.yaw = Math.PI / 2;
  game.mode = 'play';
  setWantLock(true);
  requestLock();
}

function newGame() {
  resetWorld();
  startPlay();
  game.emit('notice', { text: 'Click to look around. Walk into the <b style="color:#ffd23f">yellow marker</b> to start the story.' });
}

function loadGame(data) {
  resetWorld();
  applySave(data);
  startPlay();
  game.emit('notice', { text: 'Game loaded' });
}

const menuHooks = {};
initMenus({ newGame, load: loadGame, quit: () => { failActiveMission(); titleCamera(); showTitle(); } });
Object.assign(menuHooks, { openSaveMenu, openShop });

game.on('missionPassed', () => { saveTo('auto'); });
game.on('busted', () => endLife('busted'));
let deathT = 0;

function endLife(kind) {
  if (game.mode !== 'play' || deathT > 0) return;
  deathT = 3.6;
  game.timeScale = 0.35;
  bigMessage(kind === 'busted' ? 'BUSTED' : 'WASTED', kind, kind === 'busted' ? 'Bail: 15% of your cash' : 'Hospital bill: $100');
  game.emit(kind, {});
  game.pendingRespawn = kind;
  if (kind === 'busted') { game.player.vx = game.player.vz = 0; }
}

function respawn() {
  const p = game.player, kind = game.pendingRespawn;
  game.pendingRespawn = null;
  game.timeScale = 1;
  if (p.vehicle) exitVehicle(p);
  failActiveMission(kind === 'busted' ? 'You were arrested.' : 'You died.');
  clearPolice();
  const at = kind === 'busted' ? landmarks.precinct : landmarks.hospital;
  p.alive = true; p.health = p.maxHealth; p.deadT = 0; p.root.rotation.set(0, 0, 0);
  p.parts.armL.upper.rotation.z = 0; p.parts.armR.upper.rotation.z = 0;
  p.pos.set(at.x, 0.2, at.z); p.vx = p.vz = 0;
  if (kind === 'busted') { game.addCash(-Math.round(game.cash * 0.15), 'bail'); }
  else game.addCash(-Math.min(100, game.cash), 'hospital');
  game.hour = (game.hour + 4) % 24;
  flash(0.8);
}

// title flyover over the bay at golden hour
function titleCamera() {
  rig.override = (cam, t) => {
    const a = t * 0.035 + 0.6;
    cam.position.set(Math.cos(a) * 260, 95 + Math.sin(t * 0.1) * 10, Math.sin(a) * 260 + 60);
    cam.lookAt(0, 10, 40);
    if (cam.fov !== 55) { cam.fov = 55; cam.updateProjectionMatrix(); }
  };
}

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && game.mode === 'play' && !game.shot) showPause();
});

// ---------- main loop ----------
const clock = new THREE.Clock();
let acc = 0;
export function step(realDt) {
  const dt = Math.min(0.05, realDt) * game.timeScale;
  menuKeys();
  if (game.mode === 'play') {
    if (input.pressed('Escape') || input.pressed('KeyP')) showPause();
    else if (input.pressed('KeyM')) showMap();
  } else if ((game.mode === 'map' && (input.pressed('KeyM') || input.pressed('Escape'))) || (game.mode === 'paused' && input.pressed('KeyP'))) resume();

  const live = game.mode === 'play' || game.mode === 'title';
  if (live) {
    game.time += dt;
    game.hour = (game.hour + dt / TIME.secondsPerHour) % 24;
    const p = game.player;
    if (game.mode === 'play') updatePlayer(p, dt);
    for (const v of game.vehicles) { if (v.parked && !v.driver && v.absSpeed < 0.05 && v.health > 0) { v.root.position.y = v.y; continue; } v.update(dt); }
    resolveVehicleContacts(game.vehicles);
    updateTraffic(dt);
    updatePedestrians(dt);
    if (game.mode === 'play') {
      updatePolice(dt);
      updateMissions(dt);
      updatePickups(dt);
      if (!p.alive || p.health <= 0) { if (p.alive) p.die(null); endLife('wasted'); }
      if (deathT > 0) { deathT -= realDt; if (deathT <= 0) respawn(); }
      const prompt = updateServices(dt, menuHooks);
      updateHud(dt, prompt);
    }
    updateEffects(dt);
  }
  const focus = game.mode === 'title' ? new THREE.Vector3(0, 0, 0) : game.player.pos;
  game.sky.update(game.hour, focus);
  waterUniforms.uTime.value = game.time;
  updateProps(game.time, game.sky.night);
  updateCamera(dt, Math.min(0.05, realDt));
  updateAudioDirector();
  input.endFrame();
}

function frame() {
  requestAnimationFrame(frame);
  if (game.shot) return; // the shot director drives frames itself
  const realDt = clock.getDelta();
  acc += realDt;
  step(realDt);
  renderer.render(scene, camera);
}

// ---------- start ----------
const params = new URLSearchParams(location.search);
if (params.get('shot')) {
  runShotDirector(params.get('shot'), { step, render: () => renderer.render(scene, camera), newGame: () => { resetWorld(); hideAllScreens(); document.getElementById('hud').classList.remove('hidden'); game.mode = 'play'; rig.override = null; }, titleCamera, showTitle });
} else {
  titleCamera();
  showTitle();
  // first interaction unlocks audio for the title theme
  addEventListener('pointerdown', () => initAudio(), { once: true });
  addEventListener('keydown', () => initAudio(), { once: true });
}
requestAnimationFrame(frame);
window.__game = game;
