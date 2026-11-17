// Audio director: maps gameplay events to sound effects, feeds the engine/siren/surf loops, and
// picks the music — title theme, the car radio station, or the pursuit layer on foot.
import { game } from '../core/game.js';
import { sfx, updateAudioLoops, audio } from './soundFx.js';
import { playSong, STATIONS, songName } from './music.js';
import { wanted } from '../systems/police.js';
import { BEACH_Z } from '../core/config.js';

let station = 0;
let radioOn = true;
export let heliPos = null;

export function initAudioDirector() {
  const g = (n, f) => game.on(n, (e) => { if (audio.ready) f(e); });
  g('shot', (e) => sfx.shot(e.weapon, e.x, e.z));
  g('impact', (e) => { const p = game.player; if (p && !e.flesh && Math.hypot(e.x - p.pos.x, e.z - p.pos.z) < 4) sfx.whiz(); });
  g('punchHit', () => sfx.punch());
  g('swing', () => sfx.swing());
  g('crash', (e) => sfx.crash(e.force, e.x, e.z));
  g('explosion', (e) => sfx.explosion(e.x, e.z));
  g('horn', (e) => sfx.horn(e.car.x, e.car.z));
  g('scream', (e) => sfx.scream(e.who.pos.x, e.who.pos.z));
  g('pickup', (e) => (e.type === 'cash' ? sfx.cash() : e.type === 'token' ? sfx.sting('token') : sfx.pickup()));
  g('cash', (e) => { if (e.reason === 'mission') sfx.cash(); });
  g('reload', (e) => { if (e.who === game.player) sfx.reload(); });
  g('dryfire', (e) => { if (e.who === game.player) sfx.dry(); });
  g('wanted', (e) => sfx.star(!e.cooled));
  g('jump', () => sfx.jump());
  g('enterCar', () => { sfx.door(); });
  g('exitCar', () => sfx.door());
  g('missionStart', () => sfx.sting('start'));
  g('missionPassed', () => sfx.sting('passed'));
  g('missionFailed', () => sfx.sting('failed'));
  g('wasted', () => sfx.sting('wasted'));
  g('busted', () => sfx.sting('busted'));
  g('deny', () => sfx.deny());
  g('buy', () => sfx.cash());
  g('respray', () => sfx.cash());
  g('heli', (e) => { heliPos = e; });
  game.on('radioNext', () => {
    station = (station + 1) % STATIONS.length;
    radioOn = STATIONS[station] !== 'off';
    game.emit('radio', { name: radioOn ? songName(STATIONS[station]) : '' });
  });
  game.on('enterCar', () => {
    if (game.player.vehicle?.type === 'police') { station = 2; radioOn = false; }
    else { station = Math.floor(Math.random() * 2); radioOn = true; }
    game.emit('radio', { name: radioOn ? songName(STATIONS[station]) : '' });
  });
}

/** Called every frame. */
export function updateAudioDirector() {
  if (!audio.ready) return;
  const p = game.player;
  const paused = game.mode !== 'play';
  let sirenD = 999, heliD = 999;
  const px = p ? p.pos.x : 0, pz = p ? p.pos.z : 0;
  for (const v of game.vehicles) if (v.siren && v !== p?.vehicle) sirenD = Math.min(sirenD, Math.hypot(v.x - px, v.z - pz));
  if (p?.vehicle?.siren) sirenD = 15;
  if (heliPos && wanted.level >= 3) heliD = Math.hypot(heliPos.x - px, heliPos.z - pz);
  updateAudioLoops({ car: p?.vehicle, sirenD, heliD, beachD: Math.abs(pz - (BEACH_Z + 30)), paused: paused && game.mode !== 'title', night: game.sky?.night > 0.5 });
  // music choice
  let song = null;
  if (game.mode === 'title') song = 'title';
  else if (p?.vehicle && radioOn) song = STATIONS[station];
  else if (!p?.vehicle && wanted.level >= 2) song = 'chase';
  if (game.mode === 'paused' || game.mode === 'map') song = song === 'title' ? song : null;
  playSong(song);
}
