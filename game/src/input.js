// Keyboard and pointer input. Held keys steer Vane; one-shot presses (gadgets,
// pause, mute, confirm) are queued as bit flags and taken once by the loop, so
// a press between two frames is never lost and never counted twice.
// Movement: WASD or arrows. Shift sneaks, Space sprints. 1 throws a coin at
// the mouse, 2 drops smoke, 3 sends the nightingale, R douses a lantern,
// M mutes, P or Esc pauses.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_COIN = 8;
export const ACTION_SMOKE = 16;
export const ACTION_DECOY = 32;
export const ACTION_DOUSE = 64;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const SNEAK = new Set(['ShiftLeft', 'ShiftRight']);
const SPRINT = new Set(['Space']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const COIN = new Set(['Digit1']);
const SMOKE = new Set(['Digit2']);
const DECOY = new Set(['Digit3']);
const DOUSE = new Set(['KeyR']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseSeen = false;

  function press(code) {
    if (LEFT.has(code) || RIGHT.has(code) || UP.has(code) || DOWN.has(code)) held.add(code);
    else if (SNEAK.has(code)) held.add(code);
    else if (SPRINT.has(code)) held.add(code);
    else if (CONFIRM.has(code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(code)) actions |= ACTION_PAUSE;
    else if (MUTE.has(code)) actions |= ACTION_MUTE;
    else if (COIN.has(code)) actions |= ACTION_COIN;
    else if (SMOKE.has(code)) actions |= ACTION_SMOKE;
    else if (DECOY.has(code)) actions |= ACTION_DECOY;
    else if (DOUSE.has(code)) actions |= ACTION_DOUSE;
    else return false;
    return true;
  }

  window.addEventListener('keydown', (event) => {
    if (press(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => held.clear());
  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseSeen = true;
  });
  target.addEventListener('pointerdown', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseSeen = true;
    actions |= ACTION_CONFIRM;
  });

  function has(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    /** Movement vector, -1..1 on each axis, from the held keys. */
    move() {
      const x = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
      const y = (has(DOWN) ? 1 : 0) - (has(UP) ? 1 : 0);
      return { x, y };
    },
    sneak() { return has(SNEAK); },
    sprint() { return has(SPRINT); },
    /** The mouse position in CSS pixels over the canvas, or null. */
    mouse() { return mouseSeen ? { x: mouseX, y: mouseY } : null; },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
