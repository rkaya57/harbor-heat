// Menus: title screen, pause menu, save/load slots, Iron Pelican shop, controls, stats and settings.
// Keyboard (arrows + Enter) and mouse both work; menus never touch gameplay state directly.
import { game } from '../core/game.js';
import { input, setWantLock } from '../core/input.js';
import { listSlots, latestSave, saveTo } from '../systems/saveGame.js';
import { SHOP, buy } from '../systems/services.js';
import { MISSIONS, missionState } from '../systems/missions.js';
import { sfx, initAudio } from '../audio/soundFx.js';
import { setMasterVolume, setMusicVolume } from '../audio/soundFx.js';
import { drawBigMap } from './hud.js';

const $ = (id) => document.getElementById(id);
let handlers = {};
let current = null; // {nav element, buttons}

const CONTROLS = [
  ['W A S D', 'Move / drive'], ['Mouse', 'Look / aim'], ['Shift', 'Sprint'], ['Space', 'Jump · handbrake'],
  ['Left click', 'Punch / shoot'], ['Right click', 'Aim down sights'], ['1-4 · Q · Wheel', 'Switch weapon'], ['R', 'Reload · next radio station'],
  ['F', 'Enter / exit / steal car'], ['E', 'Use (shop, save, respray)'], ['H', 'Horn'], ['G', 'Police siren (in a cruiser)'],
  ['M', 'Map'], ['Esc / P', 'Pause'],
];

function buildMenu(navId, items) {
  const nav = $(navId);
  nav.innerHTML = '';
  const buttons = items.map((it, i) => {
    const b = document.createElement('button');
    b.textContent = it.label;
    b.disabled = !!it.disabled;
    b.onmouseenter = () => select(i);
    b.onclick = () => { if (!it.disabled) { initAudio(); sfx.click(); it.action(); } };
    nav.appendChild(b);
    return b;
  });
  current = { nav, buttons, items, sel: items.findIndex((x) => !x.disabled) };
  select(current.sel);
}
function select(i) {
  if (!current) return;
  current.sel = i;
  current.buttons.forEach((b, k) => b.classList.toggle('sel', k === i));
}

export function menuKeys() {
  if (!current || game.mode === 'play') return;
  const n = current.items.length;
  let s = current.sel;
  if (input.pressed('ArrowDown') || input.pressed('KeyS')) { do s = (s + 1) % n; while (current.items[s].disabled); select(s); sfx.click?.(); }
  if (input.pressed('ArrowUp') || input.pressed('KeyW')) { do s = (s - 1 + n) % n; while (current.items[s].disabled); select(s); sfx.click?.(); }
  if (input.pressed('Enter') || input.pressed('Space')) current.buttons[current.sel]?.click();
}

export function initMenus(h) { handlers = h; }

export function showTitle() {
  game.mode = 'title';
  setWantLock(false);
  $('title').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('pause').classList.add('hidden');
  const save = latestSave();
  buildMenu('title-menu', [
    { label: save ? 'CONTINUE' : 'CONTINUE', disabled: !save, action: () => handlers.load(save.data) },
    { label: 'NEW GAME', action: () => handlers.newGame() },
    { label: 'LOAD GAME', action: () => showLoad(true) },
    { label: 'CONTROLS', action: () => showPanel('CONTROLS', controlsHtml(), true) },
    { label: 'SETTINGS', action: () => showSettings(true) },
  ]);
}

function controlsHtml() {
  return `<table>${CONTROLS.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
}

function openOverlay(title, body, items) {
  $('pause').classList.remove('hidden');
  $('pause-title').textContent = title;
  $('pause-body').innerHTML = body || '';
  buildMenu('pause-menu', items);
}

function showPanel(title, body, fromTitle) {
  $('title').classList.add('hidden');
  openOverlay(title, body, [{ label: 'BACK', action: () => (fromTitle ? showTitle() : showPause()) }]);
}

export function showPause() {
  game.mode = 'paused';
  setWantLock(false);
  const s = game.stats;
  openOverlay('PAUSED', `<table>
    <tr><td>Story</td><td>${missionState.next}/${MISSIONS.length} jobs${MISSIONS[missionState.next] ? ' · next: ' + MISSIONS[missionState.next].title : ' · complete'}</td></tr>
    <tr><td>Sun Tokens</td><td>${s.tokens}/12</td></tr>
    <tr><td>Cars stolen</td><td>${s.carsStolen}</td></tr>
    <tr><td>Takedowns</td><td>${s.kills}</td></tr>
    <tr><td>Most wanted</td><td>${'★'.repeat(s.bestWanted) || '—'}</td></tr>
    <tr><td>Distance driven</td><td>${(s.distance / 1000).toFixed(1)} km</td></tr></table>`, [
    { label: 'RESUME', action: () => resume() },
    { label: 'MAP', action: () => showMap() },
    { label: 'LOAD GAME', action: () => showLoad(false) },
    { label: 'CONTROLS', action: () => showPanel('CONTROLS', controlsHtml(), false) },
    { label: 'SETTINGS', action: () => showSettings(false) },
    { label: 'QUIT TO TITLE', action: () => handlers.quit() },
  ]);
}

export function resume() {
  $('pause').classList.add('hidden');
  $('bigmap').classList.add('hidden');
  current = null;
  game.mode = 'play';
  setWantLock(true);
}

export function showMap() {
  game.mode = 'map';
  setWantLock(false);
  $('pause').classList.add('hidden');
  $('bigmap').classList.remove('hidden');
  drawBigMap();
}

function showLoad(fromTitle) {
  $('title').classList.add('hidden');
  const items = listSlots().map((s) => ({ label: s.label, disabled: !s.data, action: () => handlers.load(s.data) }));
  items.push({ label: 'BACK', action: () => (fromTitle ? showTitle() : showPause()) });
  openOverlay('LOAD GAME', '', items);
}

export function openSaveMenu() {
  game.mode = 'paused';
  setWantLock(false);
  const items = listSlots().filter((s) => s.slot !== 'auto').map((s) => ({ label: s.label.replace('empty', 'empty — save here'), action: () => { saveTo(s.slot); resume(); } }));
  items.push({ label: 'CANCEL', action: () => resume() });
  openOverlay('CASA REYES', '<p>Rested to full health. Choose a slot to save your progress.</p>', items);
}

export function openShop() {
  game.mode = 'paused';
  setWantLock(false);
  const items = SHOP.map((it) => ({ label: `${it.label} — $${it.price}`, action: () => { buy(it); openShop(); } }));
  items.push({ label: 'LEAVE', action: () => resume() });
  openOverlay('IRON PELICAN ARMS', `<p>"Cash only, no questions." — Cash: <b>$${game.cash}</b></p>`, items);
}

function showSettings(fromTitle) {
  $('title').classList.add('hidden');
  const st = game.settings;
  const pct = (v) => `${Math.round(v * 100)}%`;
  openOverlay('SETTINGS', '<p>Click an option to cycle it.</p>', [
    { label: `MASTER VOLUME: ${pct(st.volume)}`, action: () => { st.volume = st.volume >= 1 ? 0 : Math.round((st.volume + 0.2) * 10) / 10; setMasterVolume(st.volume); showSettings(fromTitle); } },
    { label: `MUSIC & RADIO: ${pct(st.music)}`, action: () => { st.music = st.music >= 1 ? 0 : Math.round((st.music + 0.25) * 100) / 100; setMusicVolume(st.music); showSettings(fromTitle); } },
    { label: `SCREEN SHAKE: ${pct(st.shake)}`, action: () => { st.shake = st.shake >= 1 ? 0 : Math.round((st.shake + 0.5) * 10) / 10; showSettings(fromTitle); } },
    { label: 'BACK', action: () => (fromTitle ? showTitle() : showPause()) },
  ]);
}

export function hideAllScreens() {
  for (const id of ['title', 'pause', 'bigmap']) $(id).classList.add('hidden');
  current = null;
}
