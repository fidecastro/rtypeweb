/**
 * Keyboard (and optional touch) input abstraction.
 * Actions: up, down, left, right, fire.
 * Call endFrame() after each update to clear wasPressed edges.
 *
 * Keyboard and touch contribute independently and are OR-composited so a
 * hybrid device does not wipe held keys on touch events (or vice versa).
 */

const ACTION_KEYS = {
  up: new Set(['ArrowUp', 'KeyW', 'w', 'W']),
  down: new Set(['ArrowDown', 'KeyS', 's', 'S']),
  left: new Set(['ArrowLeft', 'KeyA', 'a', 'A']),
  right: new Set(['ArrowRight', 'KeyD', 'd', 'D']),
  fire: new Set(['Space', ' ', 'Enter']),
};

const GAME_KEY_CODES = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'Space',
  'Enter',
]);

const ACTIONS = ['up', 'down', 'left', 'right', 'fire'];

/**
 * @returns {Record<string, boolean>}
 */
function emptyActions() {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    fire: false,
  };
}

/**
 * @param {object} [options]
 * @param {HTMLElement | Window | Document} [options.target]
 * @param {boolean} [options.enableTouch]
 */
export function createInput({ target = window, enableTouch = true } = {}) {
  /** Keyboard contribution (not overwritten by touch). */
  const keyDown = emptyActions();
  /** Touch contribution (rebuilt from active touches only). */
  const touchDown = emptyActions();
  /** Edge-triggered presses this frame (either source). */
  const pressed = emptyActions();

  /** @type {Map<number, { x: number, y: number, side: 'left' | 'right' }>} */
  const touches = new Map();

  /**
   * @param {string} key
   * @returns {string | null}
   */
  function actionForKey(key) {
    for (const [action, keys] of Object.entries(ACTION_KEYS)) {
      if (keys.has(key)) return action;
    }
    return null;
  }

  /**
   * @param {string} action
   */
  function isActionDown(action) {
    return !!(keyDown[action] || touchDown[action]);
  }

  /**
   * @param {KeyboardEvent} e
   * @param {boolean} isDown
   */
  function onKey(e, isDown) {
    if (GAME_KEY_CODES.has(e.code) || actionForKey(e.key)) {
      e.preventDefault();
    }
    const action = actionForKey(e.code) || actionForKey(e.key);
    if (!action) return;
    if (isDown) {
      if (!isActionDown(action)) pressed[action] = true;
      keyDown[action] = true;
    } else {
      keyDown[action] = false;
    }
  }

  /**
   * @param {TouchEvent} e
   */
  function syncTouchActions(e) {
    if (!enableTouch) return;
    e.preventDefault();

    // Rebuild touch contribution only — keyboard flags stay intact.
    for (const a of ACTIONS) {
      touchDown[a] = false;
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    const halfW = w / 2;
    let fireHeld = false;

    for (const t of e.touches) {
      const x = t.clientX;
      const y = t.clientY;
      if (x >= halfW) {
        fireHeld = true;
      } else {
        // Steer from center of left half
        const cx = halfW / 2;
        const cy = h / 2;
        const dx = x - cx;
        const dy = y - cy;
        const dead = 24;
        if (dx < -dead) touchDown.left = true;
        if (dx > dead) touchDown.right = true;
        if (dy < -dead) touchDown.up = true;
        if (dy > dead) touchDown.down = true;
      }
      touches.set(t.identifier, {
        x,
        y,
        side: x >= halfW ? 'right' : 'left',
      });
    }

    // Clear stale touch ids
    const active = new Set([...e.touches].map((t) => t.identifier));
    for (const id of touches.keys()) {
      if (!active.has(id)) touches.delete(id);
    }

    if (fireHeld && !isActionDown('fire')) pressed.fire = true;
    touchDown.fire = fireHeld;
  }

  /**
   * @param {KeyboardEvent} e
   */
  function onKeyDown(e) {
    onKey(e, true);
  }

  /**
   * @param {KeyboardEvent} e
   */
  function onKeyUp(e) {
    onKey(e, false);
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);

  if (enableTouch) {
    const touchOpts = { passive: false };
    target.addEventListener('touchstart', syncTouchActions, touchOpts);
    target.addEventListener('touchmove', syncTouchActions, touchOpts);
    target.addEventListener('touchend', syncTouchActions, touchOpts);
    target.addEventListener('touchcancel', syncTouchActions, touchOpts);
  }

  return {
    /**
     * @param {string} action
     */
    isDown(action) {
      return isActionDown(action);
    },
    /**
     * @param {string} action
     */
    wasPressed(action) {
      return !!pressed[action];
    },
    /** Clear edge-triggered presses after update. */
    endFrame() {
      for (const k of ACTIONS) {
        pressed[k] = false;
      }
    },
    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      if (enableTouch) {
        target.removeEventListener('touchstart', syncTouchActions);
        target.removeEventListener('touchmove', syncTouchActions);
        target.removeEventListener('touchend', syncTouchActions);
        target.removeEventListener('touchcancel', syncTouchActions);
      }
    },
  };
}
