// Synthesised sound effects with WebAudio: gunshots per weapon, punches, crashes, explosions,
// horn, screams, pickups and UI stings, plus continuous engine, tyre, siren, helicopter and surf loops.
import { game } from '../core/game.js';

export const audio = { ctx: null, master: null, sfx: null, music: null, noise: null, ready: false };

export function initAudio() {
  if (audio.ctx) { if (audio.ctx.state === 'suspended') audio.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = new AC();
  audio.ctx = ctx;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  comp.connect(ctx.destination);
  audio.master = ctx.createGain(); audio.master.gain.value = game.settings.volume; audio.master.connect(comp);
  audio.sfx = ctx.createGain(); audio.sfx.gain.value = 0.9; audio.sfx.connect(audio.master);
  audio.music = ctx.createGain(); audio.music.gain.value = game.settings.music; audio.music.connect(audio.master);
  const len = ctx.sampleRate * 2;
  audio.noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = audio.noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  // shared reverb-ish echo for open-air shots
  audio.echo = ctx.createDelay(1); audio.echo.delayTime.value = 0.13;
  const fb = ctx.createGain(); fb.gain.value = 0.28;
  const eg = ctx.createGain(); eg.gain.value = 0.35;
  audio.echo.connect(fb); fb.connect(audio.echo); audio.echo.connect(eg); eg.connect(audio.sfx);
  startLoops();
  audio.ready = true;
}

const now = () => audio.ctx.currentTime;

function noiseBurst({ dur = 0.2, freq = 1000, q = 1, type = 'lowpass', gain = 0.5, attack = 0.002, out = audio.sfx, echo = 0, sweep = 0 }) {
  const c = audio.ctx, t = now();
  const src = c.createBufferSource(); src.buffer = audio.noise; src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(out);
  if (echo) { const e = c.createGain(); e.gain.value = echo; g.connect(e); e.connect(audio.echo); }
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}

function tone({ freq = 440, to = null, dur = 0.2, type = 'sine', gain = 0.3, attack = 0.005, out = audio.sfx, delay = 0 }) {
  const c = audio.ctx, t = now() + delay;
  const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.05);
}

/** Volume falloff from the listener (the player). */
function att(x, z, range = 120) {
  const p = game.player;
  if (!p || x === undefined) return 1;
  const px = p.vehicle ? p.vehicle.x : p.pos.x, pz = p.vehicle ? p.vehicle.z : p.pos.z;
  const d = Math.hypot(x - px, z - pz);
  return Math.max(0, 1 - d / range) ** 1.5;
}

export const sfx = {
  shot(weapon, x, z) {
    const a = att(x, z, 220); if (a < 0.02) return;
    if (weapon === 'shotgun') { noiseBurst({ dur: 0.45, freq: 1800, gain: 0.9 * a, echo: 0.6, sweep: 0.15 }); tone({ freq: 90, to: 40, dur: 0.25, gain: 0.6 * a }); }
    else if (weapon === 'smg') { noiseBurst({ dur: 0.12, freq: 3200, gain: 0.45 * a, echo: 0.3, sweep: 0.3 }); tone({ freq: 160, to: 60, dur: 0.08, gain: 0.3 * a }); }
    else { noiseBurst({ dur: 0.26, freq: 2600, gain: 0.7 * a, echo: 0.5, sweep: 0.2 }); tone({ freq: 140, to: 50, dur: 0.14, gain: 0.45 * a }); }
  },
  whiz() { noiseBurst({ dur: 0.12, freq: 4000, type: 'bandpass', q: 6, gain: 0.15, sweep: 0.4 }); },
  punch() { noiseBurst({ dur: 0.09, freq: 600, gain: 0.6 }); tone({ freq: 120, to: 60, dur: 0.1, gain: 0.5 }); },
  swing() { noiseBurst({ dur: 0.12, freq: 1500, type: 'bandpass', q: 2, gain: 0.12, sweep: 0.5 }); },
  crash(force, x, z) { const a = att(x, z) * Math.min(1, force / 20); noiseBurst({ dur: 0.35, freq: 900, gain: 0.8 * a, sweep: 0.3 }); tone({ freq: 70, to: 35, dur: 0.3, type: 'triangle', gain: 0.5 * a }); if (force > 12) noiseBurst({ dur: 0.6, freq: 5000, type: 'highpass', gain: 0.15 * a }); },
  explosion(x, z) { const a = att(x, z, 300); noiseBurst({ dur: 1.8, freq: 700, gain: 1.2 * a, attack: 0.01, sweep: 0.08, echo: 0.6 }); tone({ freq: 60, to: 22, dur: 1.4, gain: 0.9 * a }); },
  horn(x, z) { const a = att(x, z, 90); tone({ freq: 392, dur: 0.45, type: 'sawtooth', gain: 0.08 * a }); tone({ freq: 494, dur: 0.45, type: 'sawtooth', gain: 0.07 * a }); },
  scream(x, z) { const a = att(x, z, 60); const f = 500 + Math.random() * 400; tone({ freq: f, to: f * 1.4, dur: 0.5, type: 'sawtooth', gain: 0.05 * a }); tone({ freq: f * 2.01, to: f * 2.6, dur: 0.5, type: 'triangle', gain: 0.03 * a }); },
  pickup() { tone({ freq: 880, dur: 0.12, type: 'triangle', gain: 0.25 }); tone({ freq: 1320, dur: 0.18, type: 'triangle', gain: 0.2, delay: 0.07 }); },
  cash() { for (let k = 0; k < 3; k++) tone({ freq: 1600 + k * 400, dur: 0.08, type: 'square', gain: 0.06, delay: k * 0.05 }); },
  click() { tone({ freq: 1200, dur: 0.04, type: 'square', gain: 0.06 }); },
  deny() { tone({ freq: 200, dur: 0.18, type: 'square', gain: 0.1 }); },
  reload() { noiseBurst({ dur: 0.05, freq: 3000, type: 'bandpass', q: 3, gain: 0.25 }); setTimeout(() => audio.ctx && noiseBurst({ dur: 0.06, freq: 2200, type: 'bandpass', q: 3, gain: 0.3 }), 350); },
  dry() { tone({ freq: 2400, dur: 0.03, type: 'square', gain: 0.08 }); },
  star(up) { tone({ freq: up ? 660 : 520, to: up ? 990 : 330, dur: 0.25, type: 'square', gain: 0.07 }); },
  jump() { noiseBurst({ dur: 0.08, freq: 400, gain: 0.12 }); },
  door() { noiseBurst({ dur: 0.15, freq: 300, gain: 0.35 }); tone({ freq: 90, dur: 0.1, gain: 0.25 }); },
  sting(kind) {
    const seqs = { passed: [523, 659, 784, 1047], failed: [392, 330, 262], wasted: [196, 165, 131, 98], busted: [440, 349, 294], token: [784, 988, 1175, 1568], start: [392, 523, 659] };
    (seqs[kind] || seqs.start).forEach((f, i) => { tone({ freq: f, dur: 0.5, type: 'triangle', gain: 0.18, delay: i * 0.14, out: audio.sfx }); tone({ freq: f / 2, dur: 0.6, type: 'sawtooth', gain: 0.05, delay: i * 0.14 }); });
  },
};

// ---------- continuous loops ----------
const loops = {};
function loopOsc(type, freq, gain, filterFreq) {
  const c = audio.ctx;
  const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
  const g = c.createGain(); g.gain.value = 0;
  o.connect(f); f.connect(g); g.connect(audio.sfx); o.start();
  return { o, f, g, base: gain };
}
function loopNoise(freq, type = 'bandpass', q = 1) {
  const c = audio.ctx;
  const s = c.createBufferSource(); s.buffer = audio.noise; s.loop = true;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.value = 0;
  s.connect(f); f.connect(g); g.connect(audio.sfx); s.start();
  return { s, f, g };
}
function startLoops() {
  loops.eng1 = loopOsc('sawtooth', 50, 0.12, 600);
  loops.eng2 = loopOsc('square', 25, 0.08, 400);
  loops.tyre = loopNoise(1800, 'bandpass', 2);
  loops.wind = loopNoise(500, 'lowpass', 0.5);
  loops.siren = loopOsc('square', 700, 0.06, 2400);
  loops.heli = loopNoise(120, 'lowpass', 1);
  loops.surf = loopNoise(600, 'lowpass', 0.3);
  loops.city = loopNoise(250, 'lowpass', 0.4);
}

const setG = (l, v, rate = 0.08) => l.g.gain.setTargetAtTime(v, now(), rate);

export function updateAudioLoops(state) {
  if (!audio.ready) return;
  const t = now();
  const { car, sirenD, heliD, beachD, paused, night } = state;
  if (paused) { for (const k in loops) setG(loops[k], 0); return; }
  if (car) {
    const spd = Math.abs(car.speed);
    const gear = Math.min(4, Math.floor(spd / 11));
    const rpm = 0.25 + ((spd - gear * 11) / 11) * 0.75 + (car.ctl.throttle > 0 ? 0.1 : 0);
    const f = 38 + gear * 6 + rpm * 70;
    loops.eng1.o.frequency.setTargetAtTime(f, t, 0.05);
    loops.eng2.o.frequency.setTargetAtTime(f / 2, t, 0.05);
    loops.eng1.f.frequency.setTargetAtTime(400 + rpm * 1400 * (car.ctl.throttle > 0 ? 1 : 0.5), t, 0.05);
    setG(loops.eng1, car.wrecked ? 0 : 0.11 + rpm * 0.06);
    setG(loops.eng2, car.wrecked ? 0 : 0.07);
    setG(loops.tyre, car.skid > 0.45 && spd > 6 ? 0.09 * car.skid : 0, 0.05);
    setG(loops.wind, Math.min(0.12, spd * 0.003));
  } else { setG(loops.eng1, 0); setG(loops.eng2, 0); setG(loops.tyre, 0); setG(loops.wind, 0); }
  // two-tone wail, louder as the nearest siren closes in
  const sv = sirenD < 140 ? (1 - sirenD / 140) ** 1.4 * 0.07 : 0;
  loops.siren.o.frequency.setTargetAtTime(Math.sin(t * 5.2) > 0 ? 960 : 720, t, 0.02);
  setG(loops.siren, sv);
  setG(loops.heli, heliD < 160 ? (1 - heliD / 160) * 0.25 : 0);
  loops.heli.f.frequency.setTargetAtTime(90 + Math.abs(Math.sin(t * 22)) * 140, t, 0.01);
  setG(loops.surf, beachD < 80 ? (1 - beachD / 80) * (0.05 + Math.sin(t * 0.7) * 0.025) : 0, 0.4);
  setG(loops.city, 0.018 + (night ? 0 : 0.01), 0.5);
}

export function setMasterVolume(v) { if (audio.master) audio.master.gain.value = v; }
export function setMusicVolume(v) { if (audio.music) audio.music.gain.value = v; }
