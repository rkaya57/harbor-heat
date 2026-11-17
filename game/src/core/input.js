// Keyboard and mouse state with pointer lock. Gameplay reads intents, never raw events.
const keys = new Set();
const pressed = new Set();
const mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, wheel: 0, locked: false };
let canvasEl = null;
let wantLock = false;

export function initInput(canvas) {
  canvasEl = canvas;
  addEventListener('keydown', (e) => {
    if (!keys.has(e.code)) pressed.add(e.code);
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); mouse.left = mouse.right = false; });
  addEventListener('mousemove', (e) => {
    if (!mouse.locked) return;
    mouse.dx += e.movementX;
    mouse.dy += e.movementY;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (wantLock && !mouse.locked) { requestLock(); return; }
    if (e.button === 0) { mouse.left = true; mouse.leftPressed = true; }
    if (e.button === 2) mouse.right = true;
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  });
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('wheel', (e) => { mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
  document.addEventListener('pointerlockchange', () => { mouse.locked = document.pointerLockElement === canvasEl; });
}

export function requestLock() {
  if (!canvasEl || mouse.locked) return;
  try { const p = canvasEl.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* not allowed yet */ }
}
export function setWantLock(v) {
  wantLock = v;
  if (!v && document.pointerLockElement) document.exitPointerLock();
}

export const input = {
  down: (code) => keys.has(code),
  pressed: (code) => pressed.has(code),
  axis(neg, pos) { return (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0); },
  mouse,
  // Synthetic presses let the screenshot director and bot tests drive the game through the same path.
  inject(code, held = false) { pressed.add(code); if (held) keys.add(code); },
  release(code) { keys.delete(code); },
  endFrame() { pressed.clear(); mouse.dx = 0; mouse.dy = 0; mouse.leftPressed = false; mouse.wheel = 0; },
};
