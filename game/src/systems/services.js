// City services: the safehouse (save + heal), Iron Pelican Arms (buy guns, ammo, armour),
// Sal's Body Shop (respray + repair clears the wanted level), and respawn after WASTED/BUSTED.
import { game } from '../core/game.js';
import { input } from '../core/input.js';
import { landmarks } from '../world/cityLayout.js';
import { wanted, clearPolice } from './police.js';
import { WEAPONS, giveWeapon } from './combat.js';

export const SHOP = [
  { id: 'pistol', label: 'Pistol + 48 rounds', price: 120, ammo: 48 },
  { id: 'smg', label: 'SMG + 120 rounds', price: 450, ammo: 120 },
  { id: 'shotgun', label: 'Shotgun + 24 shells', price: 380, ammo: 24 },
  { id: 'armor', label: 'Body armour', price: 200 },
];

export function buy(item) {
  if (game.cash < item.price) { game.emit('notice', { text: 'Not enough cash' }); game.emit('deny', {}); return false; }
  game.addCash(-item.price, 'shop');
  if (item.id === 'armor') game.player.armor = 100;
  else { giveWeapon(game.player, item.id, item.ammo); game.player.setWeapon(item.id); }
  game.emit('notice', { text: `Bought ${item.label}` });
  game.emit('buy', {});
  return true;
}

let resprayT = 0;
export function updateServices(dt, ui) {
  const p = game.player;
  let prompt = '';
  const close = (lm, r) => Math.hypot((p.vehicle ? p.vehicle.x : p.pos.x) - lm.x, (p.vehicle ? p.vehicle.z : p.pos.z) - lm.z) < r;
  if (!p.vehicle && close(landmarks.safehouse, 3)) {
    prompt = '<kbd>E</kbd> Save game & rest';
    if (input.pressed('KeyE')) { p.health = p.maxHealth; ui.openSaveMenu(); }
  } else if (!p.vehicle && close(landmarks.gunshop, 3.5)) {
    prompt = '<kbd>E</kbd> Shop at Iron Pelican Arms';
    if (input.pressed('KeyE')) ui.openShop();
  } else if (p.vehicle && close(landmarks.garage, 6)) {
    if (resprayT <= 0 && (wanted.level > 0 || p.vehicle.health < p.vehicle.spec.hp)) {
      const cost = wanted.level > 0 ? 100 + wanted.level * 50 : 60;
      prompt = `<kbd>E</kbd> Sal's respray & repair — $${cost}`;
      if (input.pressed('KeyE')) {
        if (game.cash >= cost) {
          game.addCash(-cost, 'respray');
          const v = p.vehicle;
          v.health = v.spec.hp;
          v.model.paint.color.setHSL(Math.random(), 0.6, 0.45);
          clearPolice();
          resprayT = 6;
          game.emit('notice', { text: 'Fresh paint. The cops lost your description.', big: true });
          game.emit('respray', {});
        } else game.emit('notice', { text: 'Sal wants cash up front.' });
      }
    }
  }
  resprayT -= dt;
  return prompt;
}
void WEAPONS;
