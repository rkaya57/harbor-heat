// The shared game state every system reads, plus a tiny event bus. Gameplay emits events
// ('shot', 'hit', 'explosion', 'crime', 'cash', 'carjack', 'mission'…); audio, HUD, police
// and effects listen. Nothing here renders.
const listeners = new Map();

export const game = {
  scene: null, camera: null, renderer: null, sky: null,
  mode: 'title',            // title | play | paused | map | cutscene | dead
  time: 0,                  // seconds of game time
  hour: 16.5,
  timeScale: 1,
  player: null,
  vehicles: [],
  peds: [],                 // every non-player character, cops and gang included
  pickups: [],
  cash: 250,
  stats: { kills: 0, carsStolen: 0, distance: 0, missionsDone: 0, tokens: 0, bestWanted: 0 },
  flags: {},
  shot: null,               // screenshot scene name when ?shot= is set
  settings: { volume: 0.8, music: 0.55, shake: 1 },

  on(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
  emit(name, data) { const l = listeners.get(name); if (l) for (const fn of l) fn(data); },
  addCash(n, reason) { this.cash = Math.max(0, Math.round(this.cash + n)); this.emit('cash', { amount: n, reason }); },
};
