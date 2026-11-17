// Screenshot director: ?shot=<name> stages a reproducible scene from the real game systems
// (a beachfront police chase, a timed delivery, a container-yard firefight, the title screen),
// steps the simulation with a fixed timestep, then sets window.__shotReady for the capture tool.
import { game } from './core/game.js';
import { rng, cityRng, clamp } from './core/rng.js';
import { roadX, roadZ, LANE, GRID_Z } from './core/config.js';
import { landmarks } from './world/cityLayout.js';
import { Vehicle } from './entities/vehicle.js';
import { Character } from './entities/character.js';
import { enterVehicle } from './systems/playerControl.js';
import { setWanted } from './systems/police.js';
import { startMission, missionState, gotoStep } from './systems/missions.js';
import { giveWeapon } from './systems/combat.js';
import { spawnTrafficCar } from './systems/traffic.js';
import { rig } from './systems/cameraRig.js';
import { input } from './core/input.js';

const FIXED = 1 / 60;

function simulate(api, seconds, perFrame) {
  const n = Math.round(seconds / FIXED);
  for (let i = 0; i < n; i++) { perFrame?.(i * FIXED); api.step(FIXED); }
}

const SCENES = {
  title(api) {
    game.hour = 17.7;
    api.titleCamera();
    api.showTitle();
    simulate(api, 4);
  },

  chase(api) {
    // Beachfront boulevard at golden hour: the player's sports car flat out with three cruisers
    // on its tail, framed from a low front-quarter camera so the whole pursuit reads.
    api.newGame();
    game.hour = 17.35;
    const z = roadZ(GRID_Z) - LANE, x = roadX(3) - 10; // westbound, into the sun
    const car = new Vehicle('sport', x, z, -Math.PI / 2, 0xff3b30);
    game.vehicles.push(car);
    enterVehicle(game.player, car);
    missionState.next = 6; startMission(6);
    gotoStep(3); // "lose the cops"
    setWanted(3);
    car.vx = -34;
    const lanes = [0, LANE * 2, -0.6];
    const cops = lanes.map((dz, k) => {
      const cop = new Vehicle('police', x + 11 + k * 9, z + dz, -Math.PI / 2);
      cop.vx = -33; cop.pursuit = true; cop.siren = true;
      const d = new Character('cop', cop.x, cop.z); d.vehicle = cop; d.root.visible = false; cop.driver = d; game.peds.push(d);
      game.vehicles.push(cop);
      return cop;
    });
    rig.override = (cam) => {
      cam.position.set(car.x - 10, 1.6, car.z + 6.4);
      cam.lookAt(car.x + 9, 1.3, car.z - 1.4);
      cam.fov = 52; cam.updateProjectionMatrix();
    };
    simulate(api, 1.4, () => {
      car.ctl.throttle = 1; car.ctl.steer = 0;
      cops.forEach((c, k) => { c.ctl.throttle = 1; c.ctl.steer = clamp((c.z - z - lanes[k]) * 0.3, -1, 1); });
    });
  },

  mission(api) {
    api.newGame();
    game.hour = 17.4;
    missionState.next = 2; startMission(2);
    gotoStep(2);
    const car = new Vehicle('cab', roadX(3) + 30, roadZ(6) + LANE, Math.PI / 2);
    game.vehicles.push(car);
    enterVehicle(game.player, car);
    car.vx = 18;
    rig.yaw = Math.PI / 2 - 0.25; rig.pitch = 0.2;
    game.emit('subtitle', { speaker: 'Sal', text: 'Warehouse 7 wants it in ninety seconds or the deal is off. Floor it, kid!', dur: 30 });
    simulate(api, 1.2, () => { car.ctl.throttle = 1; car.ctl.steer = 0; });
  },

  combat(api) {
    // Finale shootout on Kane Marine Quay: Nico (SMG) over-the-shoulder, Gulls and Victor Kane
    // spread along the dock in front of his yacht, tracers and muzzle flashes in the air.
    api.newGame();
    game.hour = 16.9;
    missionState.next = 6; startMission(6);
    const q = landmarks.quay, p = game.player;
    giveWeapon(p, 'smg', 240); p.setWeapon('smg');
    p.pos.set(q.x - 22, 0.16, q.z + 30); // open dock apron east of the container stacks
    gotoStep(2);
    const foes = game.peds.filter((c) => c.enemy && c.alive);
    foes.forEach((e, k) => { e.pos.set(q.x - 13 + (k % 3) * 3.5, 0.16, q.z + 17 - k * 2.6); e.alerted = true; });
    const aimAt = foes[1] || foes[0];
    const face = () => Math.atan2(aimAt.pos.x - p.pos.x, aimAt.pos.z - p.pos.z);
    rig.override = (cam) => {
      const y = face(), fx = Math.sin(y), fz = Math.cos(y);
      cam.position.set(p.pos.x - fx * 3.4 - fz * 1.25, 2.15, p.pos.z - fz * 3.4 + fx * 1.25);
      cam.lookAt(p.pos.x + fx * 20, 1.4, p.pos.z + fz * 20);
      cam.fov = 58; cam.updateProjectionMatrix();
    };
    simulate(api, 1.1, (t) => {
      p.yaw = face(); p.vx = p.vz = 0; p.health = 100; p.hitT = 0; // staged: Nico shrugs off the first rounds
      rig.yaw = p.yaw; rig.pitch = 0.02;
      input.mouse.right = true;
      if (t > 0.5) { input.mouse.left = true; input.mouse.leftPressed = true; }
    });
    document.getElementById('damage-vignette').style.opacity = 0; // hits from the last frame
  },
};

export function runShotDirector(name, api) {
  game.shot = name;
  rng.reseed(12345); cityRng.reseed(7);
  (SCENES[name] || SCENES.title)(api);
  const big = document.getElementById('bigmsg');
  if (big) big.className = ''; // no mission title card over the frame
  api.render();
  window.__shotReady = true;
  // keep rendering the frozen frame so the capture always has pixels
  setInterval(() => api.render(), 200);
  void spawnTrafficCar;
}
