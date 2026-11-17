// Screenshot director: ?shot=<name> stages a reproducible scene from the real game systems
// (a police chase, a timed delivery, a container-yard firefight, the title screen), steps the
// simulation with a fixed timestep, then sets window.__shotReady for the capture tool.
import { game } from './core/game.js';
import { rng, cityRng } from './core/rng.js';
import { landmarks, frontOf } from './world/cityLayout.js';
import { roadX, roadZ, blockCenterX, blockCenterZ, LANE } from './core/config.js';
import { Vehicle } from './entities/vehicle.js';
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
    game.hour = 18.1;
    api.titleCamera();
    api.showTitle();
    simulate(api, 4);
  },

  chase(api) {
    api.newGame();
    game.hour = 18.3;
    const x = roadX(4) - LANE, z = roadZ(1) + 20;
    const car = new Vehicle('sport', x, z, 0, 0xff3b30);
    game.vehicles.push(car);
    enterVehicle(game.player, car);
    missionState.next = 6; startMission(6);
    gotoStep(3); // "lose the cops"
    setWanted(3);
    car.vz = 26;
    rig.yaw = 0; rig.pitch = 0.16;
    for (let k = 0; k < 3; k++) {
      const cop = new Vehicle('police', x + (k % 2 ? LANE * 2 : 0.5), z - 16 - k * 11, 0);
      cop.vz = 24; cop.pursuit = true; cop.siren = true;
      cop.ai = { kind: 'pursuit', i: 4, j: 1, dir: 1, next: 1, cruise: 30, blocked: 0, honkT: 0, stopT: 0 };
      game.vehicles.push(cop);
    }
    for (let k = 0; k < 6; k++) spawnTrafficCar(null, 30, 120);
    simulate(api, 1.6, () => { car.ctl.throttle = 1; car.ctl.steer = 0; input.mouse.dx = 0; });
  },

  mission(api) {
    api.newGame();
    game.hour = 17.4;
    missionState.next = 2; startMission(2);
    gotoStep(2);
    const f = frontOf(2, 6, 'n', 6);
    const car = new Vehicle('cab', roadX(3) + 30, roadZ(6) + LANE, Math.PI / 2);
    game.vehicles.push(car);
    enterVehicle(game.player, car);
    car.vx = 18;
    rig.yaw = Math.PI / 2 - 0.25; rig.pitch = 0.2;
    game.emit('subtitle', { speaker: 'Sal', text: 'Warehouse 7 wants it in ninety seconds or the deal is off. Floor it, kid!', dur: 30 });
    simulate(api, 1.2, () => { car.ctl.throttle = 1; car.ctl.steer = 0; });
    void f;
  },

  combat(api) {
    api.newGame();
    game.hour = 16.8;
    missionState.next = 4; startMission(4);
    const p = game.player;
    giveWeapon(p, 'pistol', 60); p.setWeapon('pistol');
    p.pos.set(blockCenterX(6) - 26, 0.16, blockCenterZ(2) + 6);
    gotoStep(3);
    simulate(api, 0.5);
    rig.yaw = Math.PI / 2 + 0.15; rig.pitch = 0.08;
    p.aiming = true;
    simulate(api, 1.0, (t) => { input.mouse.right = true; if (t > 0.6) { input.mouse.left = true; input.mouse.leftPressed = true; } });
  },
};

export function runShotDirector(name, api) {
  game.shot = name;
  rng.reseed(12345); cityRng.reseed(7);
  (SCENES[name] || SCENES.title)(api);
  api.render();
  window.__shotReady = true;
  // keep rendering the frozen frame so the capture always has pixels
  setInterval(() => api.render(), 200);
  void landmarks;
}
