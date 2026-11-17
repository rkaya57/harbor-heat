// Procedural music: a look-ahead step sequencer with synth drums, bass, pads and arpeggios.
// Original songs for the title screen, two in-car radio stations and a chase layer.
import { audio } from './soundFx.js';

const N = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz
// chords as MIDI roots + intervals
const SONGS = {
  title: { name: 'Main Theme', bpm: 92, chords: [[57, [0, 3, 7, 10]], [53, [0, 4, 7, 11]], [48, [0, 4, 7, 9]], [55, [0, 4, 7, 10]]], kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', arp: true, lead: [0, 0, 7, 0, 12, 0, 10, 0], swing: 0.06 },
  coral: { name: 'CORAL FM 88.1 — "Neon Undertow"', bpm: 104, chords: [[50, [0, 3, 7, 10]], [55, [0, 4, 7, 10]], [48, [0, 4, 7, 11]], [57, [0, 3, 7, 10]]], kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', arp: true, lead: [12, 0, 15, 0, 19, 17, 15, 0], swing: 0 },
  bass: { name: 'BAY BASS 101 — "Malecón Nights"', bpm: 120, chords: [[53, [0, 3, 7]], [49, [0, 4, 7]], [56, [0, 4, 7]], [51, [0, 4, 7]]], kick: 'x...x...x...x...', snare: '....x..x....x...', hat: '..x...x...x...xx', arp: false, lead: [0, 3, 0, 7, 0, 10, 7, 3], swing: 0.1, conga: true },
  chase: { name: 'Pursuit', bpm: 140, chords: [[52, [0, 3, 7]], [52, [0, 3, 7]], [48, [0, 4, 7]], [50, [0, 4, 7]]], kick: 'x..x..x.x..x..x.', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx', arp: true, lead: [0, 0, 12, 0, 0, 10, 0, 7], swing: 0 },
};
export const STATIONS = ['coral', 'bass', 'off'];

const seq = { song: null, step: 0, nextT: 0, timer: null, gain: null, target: null };

function out() {
  if (!seq.gain) { seq.gain = audio.ctx.createGain(); seq.gain.gain.value = 1; seq.gain.connect(audio.music); }
  return seq.gain;
}

function env(node, t, a, peak, dur) {
  node.gain.setValueAtTime(0.0001, t);
  node.gain.exponentialRampToValueAtTime(peak, t + a);
  node.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function kick(t) {
  const c = audio.ctx, o = c.createOscillator(), g = c.createGain();
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  env(g, t, 0.003, 0.9, 0.3);
  o.connect(g); g.connect(out()); o.start(t); o.stop(t + 0.32);
}
function noiseHit(t, freq, type, dur, peak) {
  const c = audio.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = audio.noise; f.type = type; f.frequency.value = freq;
  env(g, t, 0.002, peak, dur);
  s.connect(f); f.connect(g); g.connect(out()); s.start(t, Math.random()); s.stop(t + dur + 0.02);
}
function synth(t, freq, dur, type, peak, cutoff, detune = 0) {
  const c = audio.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
  o.type = type; o.frequency.value = freq; o.detune.value = detune;
  f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(cutoff * 0.4, t + dur);
  env(g, t, Math.min(0.02, dur / 4), peak, dur);
  o.connect(f); f.connect(g); g.connect(out()); o.start(t); o.stop(t + dur + 0.05);
}

function schedule(song, step, t) {
  const s = SONGS[song];
  const i = step % 16, bar = Math.floor(step / 16) % s.chords.length;
  const [root, iv] = s.chords[bar];
  const sx = (i % 2) * s.swing * (60 / s.bpm);
  t += sx;
  if (s.kick[i] === 'x') kick(t);
  if (s.snare[i] === 'x') { noiseHit(t, 1800, 'bandpass', 0.18, 0.35); synth(t, 190, 0.08, 'triangle', 0.15, 2000); }
  if (s.hat[i] === 'x') noiseHit(t, 8000, 'highpass', i % 4 === 2 ? 0.09 : 0.04, 0.12);
  if (s.conga && (i === 3 || i === 6 || i === 11 || i === 14)) synth(t, N(root + 24 + (i % 3) * 5), 0.12, 'sine', 0.18, 3000);
  const stepDur = 60 / s.bpm / 4;
  // bass: root on eighths, octave pops
  if (i % 2 === 0) synth(t, N(root - 12 + (i % 8 === 6 ? 12 : 0)), stepDur * 1.8, 'sawtooth', 0.22, 700);
  // pad on the bar
  if (i === 0) for (const k of iv) { synth(t, N(root + 12 + k), stepDur * 16, 'sawtooth', 0.035, 1500, -8); synth(t, N(root + 12 + k), stepDur * 16, 'sawtooth', 0.035, 1500, 8); }
  if (s.arp) synth(t, N(root + 24 + iv[i % iv.length] + (i >= 8 ? 12 : 0)), stepDur * 0.9, 'square', 0.035, 2600);
  if (i % 2 === 0 && s.lead[(i / 2) | 0] && bar % 2 === 1) synth(t, N(root + 24 + s.lead[(i / 2) | 0]), stepDur * 2.2, 'triangle', 0.08, 3500);
}

function tick() {
  if (!audio.ctx || !seq.song) return;
  const s = SONGS[seq.song];
  const stepDur = 60 / s.bpm / 4;
  while (seq.nextT < audio.ctx.currentTime + 0.12) {
    schedule(seq.song, seq.step, seq.nextT);
    seq.step++;
    seq.nextT += stepDur;
  }
}

/** Switch song (or null for silence) with a short fade. Returns the display name. */
export function playSong(name) {
  if (!audio.ready) return '';
  if (name === seq.pending) return name ? SONGS[name].name : '';
  seq.pending = name;
  const g = out();
  const t = audio.ctx.currentTime;
  g.gain.setTargetAtTime(0.0001, t, 0.15);
  clearInterval(seq.timer);
  seq.song = null;
  if (!name || !SONGS[name]) return '';
  setTimeout(() => {
    if (seq.pending !== name) return;
    seq.song = name; seq.step = 0; seq.nextT = audio.ctx.currentTime + 0.05;
    g.gain.setTargetAtTime(1, audio.ctx.currentTime, 0.2);
    seq.timer = setInterval(tick, 25);
  }, 250);
  return SONGS[name].name;
}
export const songName = (n) => (SONGS[n] ? SONGS[n].name : '');
