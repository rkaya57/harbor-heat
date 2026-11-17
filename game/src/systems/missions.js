// Story missions: "Harbor Heat", seven jobs for Mari Vega against harbour boss Victor Kane.
// A small step runner (go to, steal, deliver against the clock, fight, lose the cops, dialogue)
// drives objectives, markers, enemies, rewards, failure and retry.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { landmarks, frontOf } from '../world/cityLayout.js';
import { Character } from '../entities/character.js';
import { Vehicle } from '../entities/vehicle.js';
import { giveWeapon } from './combat.js';
import { updateShooter } from './combatAI.js';
import { wanted, setWanted } from './police.js';
import { spawnPickup } from './pickups.js';
import { lineOfSight } from '../world/collision.js';
import { blockCenterX, blockCenterZ, LAND } from '../core/config.js';
import { rng } from '../core/rng.js';

// ---------------- markers ----------------
let beam = null, ring = null;
function makeMarker() {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 40, 24, 1, true), mat);
  beam.geometry.translate(0, 20, 0);
  ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.12, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  game.scene.add(beam, ring);
}
function showMarker(x, z, color = 0xffd23f, radius = 2.2) {
  if (!beam) makeMarker();
  beam.visible = ring.visible = x !== null;
  if (x === null) return;
  beam.position.set(x, 0, z); ring.position.set(x, 0.4, z);
  beam.material.color.setHex(color); ring.material.color.setHex(color);
  beam.scale.set(radius / 2.2, 1, radius / 2.2); ring.scale.setScalar(radius / 2.2);
}

// ---------------- helpers ----------------
const say = (speaker, text, dur) => game.emit('subtitle', { speaker, text, dur: dur ?? Math.max(2.6, text.length * 0.055) });
const near = (x, z, r) => { const p = game.player; const px = p.vehicle ? p.vehicle.x : p.pos.x, pz = p.vehicle ? p.vehicle.z : p.pos.z; return Math.hypot(px - x, pz - z) < r; };

function spawnEnemy(ctx, role, x, z, weapon = 'fist', hp, ammo = 60) {
  const e = new Character(role, x, z, rng.next() * 6.28);
  if (hp) { e.maxHealth = hp; e.health = hp; }
  if (weapon !== 'fist') { e.inv = { fist: { mag: 0, reserve: 0 } }; giveWeapon(e, weapon, ammo); e.setWeapon(weapon); }
  e.keep = true; e.enemy = true; e.alerted = false;
  e.home = { x, z };
  game.peds.push(e);
  ctx.enemies.push(e);
  return e;
}

function updateEnemies(ctx, dt, skill = 0.45) {
  const p = game.player;
  let alive = 0;
  for (const e of ctx.enemies) {
    if (!e.alive) { e.update(dt); continue; }
    alive++;
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
    if (!e.alerted && (d < 26 || e.health < e.maxHealth) && (d < 10 || lineOfSight(e.pos.x, e.pos.y + 1.6, e.pos.z, p.pos.x, p.pos.y + 1.4, p.pos.z))) {
      e.alerted = true;
      for (const o of ctx.enemies) if (Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) < 30) o.alerted = true;
      if (!ctx.shouted) { ctx.shouted = true; game.emit('enemyAlert', {}); }
    }
    if (e.alerted && p.alive) updateShooter(e, p, dt, { near: e.weapon === 'fist' ? 0.9 : 6, far: e.weapon === 'fist' ? 1.3 : 20, skill, speed: e.role === 'boss' ? 3.6 : 4.8 });
    else { e.drive(dt, 0, 0, 10); e.aiming = false; }
    e.update(dt);
  }
  return alive;
}

function clearCtx(ctx) {
  for (const e of ctx.enemies) { e.keep = false; e.enemy = false; if (e.alive) { e.alerted = false; e.role = 'ped'; e.brain = null; e.scared = 8; } }
  ctx.enemies.length = 0;
  for (const v of ctx.vehicles) v.mission = null;
  ctx.vehicles.length = 0;
}

// ---------------- step factories ----------------
const goTo = (where, text, o = {}) => ({
  text, marker: where, radius: o.radius ?? 3,
  update() {
    const p = game.player;
    if (o.onFoot && p.vehicle) return;
    if (o.inCar && !p.vehicle) return;
    if (o.car && p.vehicle !== o.car()) return;
    if (near(where().x, where().z, (o.radius ?? 3) + (p.vehicle ? 2 : 0))) return 'done';
  },
});

const talk = (lines) => ({
  text: null,
  enter(ctx) { ctx.talkT = 0; ctx.line = 0; },
  update(ctx, dt) {
    ctx.talkT -= dt;
    if (ctx.talkT > 0) return;
    if (ctx.line >= lines.length) return 'done';
    const [who, txt] = lines[ctx.line++];
    const dur = Math.max(2.4, txt.length * 0.052);
    say(who, txt, dur);
    ctx.talkT = dur + 0.25;
  },
});

const stealAny = (text) => ({ text, update() { if (game.player.vehicle) return 'done'; } });

const timed = (seconds, step) => ({
  ...step,
  enter(ctx) { ctx.timer = seconds; step.enter?.(ctx); },
  update(ctx, dt) {
    ctx.timer -= dt;
    game.emit('timer', { t: ctx.timer });
    if (ctx.timer <= 0) return 'fail:Too slow.';
    const r = step.update(ctx, dt);
    if (r) game.emit('timer', { t: null });
    return r;
  },
});

const loseCops = (text) => ({
  text,
  update() { if (wanted.level === 0) return 'done'; },
});

// ---------------- the story ----------------
const L = () => landmarks;
export const MISSIONS = [
  {
    id: 'homecoming', title: 'Homecoming', giver: () => L().safehouse, reward: 200,
    steps: [
      talk([
        ['Nico', 'Six years away and Solara Bay still smells like salt and sunscreen.'],
        ['Nico', "Dad's boat yard is a Kane Marine lot now. Mari said to come by the club."],
      ]),
      goTo(() => L().club, 'Go to <b>The Tidewater Club</b> on the Coral Strip.'),
      talk([
        ['Mari', 'Nico Reyes. You look like a man who sold his last good shirt.'],
        ['Nico', 'Kane took the yard. Took everything Dad built on that quay.'],
        ['Mari', 'Kane takes everything. His Gulls lean on every bar on this strip.'],
        ['Mari', "Work for me and we'll take some of it back. Start small. Be useful."],
      ]),
    ],
  },
  {
    id: 'wheels', title: 'Four Wheels and a Favor', giver: () => L().club, reward: 300,
    steps: [
      talk([['Mari', "Sal at the Old Port needs a clean ride for a job. Any car. Don't scratch it."]]),
      stealAny('Get a car. Walk up to one and press <b>F</b> to take it.'),
      goTo(() => L().garage, "Drive it to <b>Sal's Body Shop</b> in the Old Port.", { inCar: true, radius: 5 }),
      talk([
        ['Sal', "Not bad. Mari's boy has taste. Leave it with me."],
        ['Sal', 'If the cops ever get hot on you, roll in here. I repaint, they forget.'],
      ]),
    ],
  },
  {
    id: 'rush', title: 'Rush Order', giver: () => L().garage, reward: 400,
    steps: [
      talk([['Sal', 'Package at the Starlite on the Coral Strip. Warehouse 7 wants it in ninety seconds or the deal is off.']]),
      goTo(() => frontOf(2, 6, 'n', 6), 'Pick up the package at the <b>Coral Strip</b>.', { radius: 3 }),
      timed(95, goTo(() => frontOf(7, 3, 'w', 0), 'Deliver the package to the <b>Old Port warehouse</b>. Hurry!', { radius: 4 })),
      talk([['Sal', 'Ninety seconds flat. You drive like your father sailed.']]),
    ],
  },
  {
    id: 'pressure', title: 'Pressure Point', giver: () => L().club, reward: 350,
    steps: [
      talk([
        ['Mari', 'Tommy Brine owes me eight grand and keeps buying rounds for Kane\'s crew.'],
        ['Mari', 'He drinks behind the bar on Vista Midtown. Remind him who he owes.'],
      ]),
      goTo(() => frontOf(4, 0, 's', 0), 'Find <b>Tommy Brine</b> in Vista Midtown.', { radius: 6 }),
      {
        text: 'Beat up <b>Tommy Brine</b>.',
        enter(ctx) {
          const f = frontOf(4, 0, 's', 4);
          const t = spawnEnemy(ctx, 'gang', f.x, f.z, 'fist', 140);
          t.alerted = true; ctx.tommy = t;
          say('Tommy', 'Mari sent a kid? I\'ll send him back in a bag!');
        },
        marker: null,
        update(ctx, dt) {
          updateEnemies(ctx, dt);
          const t = ctx.tommy;
          ctx.markerAt = t.pos;
          if (t.health < 45 || !t.alive) {
            if (t.alive) { t.alerted = false; t.role = 'ped'; t.scared = 12; t.brain = null; }
            spawnPickup('cash', t.pos.x + 1, t.pos.z, 500);
            say('Tommy', 'Okay! Okay! Take it, it\'s all there!');
            return 'done';
          }
        },
      },
      talk([['Mari', 'Word travels fast on the strip. Nobody laughs at my tab anymore.']]),
    ],
  },
  {
    id: 'gulls', title: 'Gull Hunting', giver: () => L().club, reward: 600,
    steps: [
      talk([
        ['Mari', 'Kane keeps his ledgers in a container yard at the Old Port. Gulls guard it.'],
        ['Mari', 'Take this. Nine millimetre, clean. Hold right mouse to aim.'],
      ]),
      { text: null, update() { giveWeapon(game.player, 'pistol', 60); game.player.setWeapon('pistol'); game.emit('notice', { text: 'Received: PISTOL' }); return 'done'; } },
      goTo(() => ({ x: blockCenterX(6), z: blockCenterZ(2) }), 'Go to the <b>Old Port container yard</b>.', { radius: 26 }),
      {
        text: 'Take out the <b>Gulls</b> guarding the yard.',
        enter(ctx) {
          const cx = blockCenterX(6), cz = blockCenterZ(2);
          for (let k = 0; k < 6; k++) spawnEnemy(ctx, 'gang', cx + rng.range(-20, 20), cz + rng.range(-20, 20), k % 2 ? 'pistol' : (k === 0 ? 'smg' : 'fist'));
        },
        update(ctx, dt) {
          const left = updateEnemies(ctx, dt, 0.4);
          ctx.objExtra = ` (${left} left)`;
          if (left === 0) return 'done';
        },
      },
      goTo(() => ({ x: blockCenterX(6) + 4, z: blockCenterZ(2) - 2 }), 'Grab <b>Kane\'s ledger</b>.', { radius: 2, onFoot: true }),
      talk([['Nico', 'Shipping manifests... half these containers never went through customs. Kane, you dirty old crab.']]),
    ],
  },
  {
    id: 'cargo', title: 'Hot Cargo', giver: () => L().club, reward: 1000,
    steps: [
      talk([
        ['Mari', 'The ledger says an armoured Kane Marine van moves cash downtown tonight.'],
        ['Mari', 'Take the van. Every cop in the bay will be on you. Get it to Sal.'],
      ]),
      {
        text: 'Steal the <b>armoured van</b> downtown.',
        enter(ctx) {
          const f = frontOf(4, 3, 'n', 0);
          const v = new Vehicle('armored', f.x - 3, f.z - 5.5, Math.PI / 2, 0x4f6152);
          v.mission = 'target'; v.parked = true;
          game.vehicles.push(v);
          ctx.vehicles.push(v); ctx.van = v;
          for (let k = 0; k < 2; k++) spawnEnemy(ctx, 'gang', f.x + rng.range(-5, 5), f.z + rng.range(-1, 1), 'pistol');
        },
        update(ctx, dt) {
          updateEnemies(ctx, dt);
          ctx.markerAt = { x: ctx.van.x, z: ctx.van.z };
          if (ctx.van.wrecked) return 'fail:The van was destroyed.';
          if (game.player.vehicle === ctx.van) { setWanted(3); say('Radio', 'All units: armoured vehicle stolen, downtown. Pursue and stop.'); return 'done'; }
        },
      },
      {
        ...goTo(() => L().garage, "Take the van to <b>Sal's Body Shop</b>.", { inCar: true, radius: 6 }),
        update(ctx) {
          if (ctx.van.wrecked) return 'fail:The van was destroyed.';
          if (game.player.vehicle !== ctx.van) { ctx.objOverride = 'Get back in the <b>van</b>!'; ctx.markerAt = { x: ctx.van.x, z: ctx.van.z }; return; }
          ctx.objOverride = null; ctx.markerAt = null;
          if (near(L().garage.x, L().garage.z, 8)) { setWanted(0); return 'done'; }
        },
      },
      { text: null, update() { giveWeapon(game.player, 'smg', 120); game.emit('notice', { text: 'Received: SMG' }); return 'done'; } },
      talk([['Sal', 'Two million in bonds, and a bonus. Kane will feel this one.'], ['Mari', 'He already does. He wants to meet you. At his yacht.']]),
    ],
  },
  {
    id: 'lastcall', title: 'Last Call at the Quay', giver: () => L().club, reward: 5000,
    steps: [
      talk([
        ['Mari', 'Kane thinks he can buy you. The Sovereign Tide is docked at his quay.'],
        ['Nico', "He took Dad's yard. I'm taking back the quay."],
      ]),
      goTo(() => ({ x: L().quay.x - 18, z: L().quay.z }), 'Go to <b>Kane Marine Quay</b>.', { radius: 14 }),
      {
        text: 'Kill <b>Victor Kane</b> and his guards.',
        enter(ctx) {
          const q = L().quay;
          ctx.kane = spawnEnemy(ctx, 'boss', q.x - 2, q.z + 4, 'smg', 320, 400);
          for (let k = 0; k < 6; k++) spawnEnemy(ctx, 'gang', q.x - rng.range(2, 18), q.z + rng.range(-24, 24), k % 3 === 0 ? 'shotgun' : 'pistol');
          say('Kane', 'The dock rat\'s son! You should have stayed gone, boy.');
        },
        update(ctx, dt) {
          const left = updateEnemies(ctx, dt, 0.5);
          ctx.objExtra = ctx.kane.alive ? '' : ` (${left} guards left)`;
          ctx.markerAt = ctx.kane.alive ? ctx.kane.pos : null;
          if (!ctx.kane.alive && !ctx.kaneDown) { ctx.kaneDown = true; say('Nico', 'That was for Dad.'); setWanted(Math.max(wanted.level, 3)); }
          if (!ctx.kane.alive && left === 0) return 'done';
        },
      },
      loseCops('The whole bay heard that. <b>Lose the cops.</b>'),
      talk([
        ['Mari', 'Kane Marine is finished. The quay is yours, Nico. Your father would be proud.'],
        ['Nico', 'Solara Bay is still hot. But tonight it feels like home.'],
      ]),
    ],
  },
];

// ---------------- runner ----------------
const ctx = { enemies: [], vehicles: [] };
export const missionState = { next: 0, active: null, step: 0, cooldown: 0 };

export function startMission(i) {
  const m = MISSIONS[i];
  missionState.active = m; missionState.step = 0;
  Object.assign(ctx, { timer: 0, objExtra: '', objOverride: null, markerAt: null, shouted: false });
  game.emit('missionStart', { title: m.title, index: i });
  enterStep();
}

/** Jump the active mission to a step (used by the screenshot director and retries). */
export function gotoStep(n) { missionState.step = n; enterStep(); }

function enterStep() {
  const s = missionState.active.steps[missionState.step];
  ctx.markerAt = null; ctx.objExtra = ''; ctx.objOverride = null;
  s.enter?.(ctx);
}

function finish(ok, reason) {
  const m = missionState.active;
  clearCtx(ctx);
  game.emit('timer', { t: null });
  showMarker(null);
  missionState.active = null;
  if (ok) {
    missionState.next = Math.max(missionState.next, MISSIONS.indexOf(m) + 1);
    game.stats.missionsDone = missionState.next;
    game.addCash(m.reward, 'mission');
    game.emit('missionPassed', { title: m.title, reward: m.reward, last: missionState.next >= MISSIONS.length });
  } else {
    game.emit('missionFailed', { title: m.title, reason });
  }
  missionState.cooldown = 4;
}

export function failActiveMission(reason) { if (missionState.active) finish(false, reason); }

export function updateMissions(dt) {
  const m = missionState.active;
  if (!m) {
    missionState.cooldown -= dt;
    const nm = MISSIONS[missionState.next];
    if (!nm) { showMarker(null); return; }
    const g = nm.giver();
    showMarker(g.x, g.z, 0xffd23f, 2);
    if (missionState.cooldown <= 0 && game.player.alive && near(g.x, g.z, 2.6) && game.mode === 'play') startMission(missionState.next);
    return;
  }
  const s = m.steps[missionState.step];
  const r = s.update?.(ctx, dt);
  // keep the objective line and marker current
  const where = ctx.markerAt || (s.marker ? s.marker() : null);
  showMarker(where ? where.x : null, where ? where.z : 0, ctx.enemies.some((e) => e.alive && e.alerted) && !s.marker ? 0xff4040 : 0xffd23f, s.radius ?? 2.2);
  const text = ctx.objOverride || (s.text ? s.text + (ctx.objExtra || '') : null);
  if (text !== ctx._lastText) { ctx._lastText = text; game.emit('objective', { title: m.title, text }); }
  if (r === 'done') {
    missionState.step++;
    if (missionState.step >= m.steps.length) finish(true);
    else enterStep();
  } else if (typeof r === 'string' && r.startsWith('fail')) finish(false, r.slice(5));
}

/** Map and minimap blips: the active target or the next mission's giver. */
export function missionBlips() {
  const out = [];
  if (missionState.active) {
    const s = missionState.active.steps[missionState.step];
    const w = ctx.markerAt || (s.marker ? s.marker() : null);
    if (w) out.push({ x: w.x, z: w.z, color: '#ffd23f', kind: 'target' });
    for (const e of ctx.enemies) if (e.alive) out.push({ x: e.pos.x, z: e.pos.z, color: '#ff4040', kind: 'enemy' });
  } else if (MISSIONS[missionState.next]) {
    const g = MISSIONS[missionState.next].giver();
    out.push({ x: g.x, z: g.z, color: '#ffd23f', kind: 'mission', label: MISSIONS[missionState.next].title });
  }
  return out;
}
void LAND;
