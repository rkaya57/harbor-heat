// Save and load: three manual slots (saved at the safehouse) plus an autosave after each mission,
// all in localStorage. Stores progress, money, arsenal, stats, collectibles, time and position.
import { game } from '../core/game.js';
import { SAVE_KEY } from '../core/config.js';
import { missionState, MISSIONS } from './missions.js';

const slotKey = (slot) => `${SAVE_KEY}.${slot}`;

export function snapshot() {
  const p = game.player;
  const at = p.vehicle ? { x: p.vehicle.x, z: p.vehicle.z } : { x: p.pos.x, z: p.pos.z };
  return {
    v: 1, savedAt: Date.now(),
    mission: missionState.next, cash: game.cash, hour: game.hour,
    health: Math.max(30, Math.round(p.health)), armor: Math.round(p.armor),
    inv: p.inv, weapon: p.weapon, stats: game.stats, flags: game.flags, pos: at,
  };
}

export function saveTo(slot) {
  try {
    localStorage.setItem(slotKey(slot), JSON.stringify(snapshot()));
    game.emit('notice', { text: slot === 'auto' ? 'Autosaved' : `Game saved to slot ${slot}` });
    return true;
  } catch { game.emit('notice', { text: 'Could not save (storage blocked)' }); return false; }
}

export function readSlot(slot) {
  try { const s = localStorage.getItem(slotKey(slot)); return s ? JSON.parse(s) : null; } catch { return null; }
}

export function listSlots() {
  return ['auto', 1, 2, 3].map((slot) => {
    const d = readSlot(slot);
    return { slot, data: d, label: d ? `${slot === 'auto' ? 'Autosave' : 'Slot ' + slot} — ${d.mission}/${MISSIONS.length} jobs · $${d.cash} · ${new Date(d.savedAt).toLocaleString()}` : `${slot === 'auto' ? 'Autosave' : 'Slot ' + slot} — empty` };
  });
}

export function latestSave() {
  let best = null;
  for (const s of listSlots()) if (s.data && (!best || s.data.savedAt > best.data.savedAt)) best = s;
  return best;
}

/** Apply a save to the running world (the caller rebuilds/teleports the player). */
export function applySave(d) {
  const p = game.player;
  missionState.next = d.mission; missionState.active = null;
  game.cash = d.cash; game.hour = d.hour ?? 16.5;
  game.stats = { ...game.stats, ...d.stats };
  game.flags = { ...d.flags };
  p.health = d.health; p.armor = d.armor;
  p.inv = d.inv || { fist: { mag: 0, reserve: 0 } };
  p.setWeapon(p.inv[d.weapon] ? d.weapon : 'fist');
  p.pos.set(d.pos.x, 0.2, d.pos.z);
  game.emit('cash', { amount: 0 });
}
