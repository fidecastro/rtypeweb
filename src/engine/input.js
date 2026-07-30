/**
 * Keyboard (and optional touch) input abstraction.
 * Actions: up, down, left, right, fire.
 * Call endFrame() after each update to clear wasPressed edges.
 */

const ACTION_KEYS = {
  up: new Set(['ArrowUp', 'KeyW', 'w', 'W']),
  down: new Set(['ArrowDown', 'KeyS', 's', 'S']),
  left: new Set(['ArrowLeft', 'KeyA', 'a', 'A']),
  right: new Set(['ArrowRight', 'KeyD', 'd', 'D']),
  fire: new Set(['Space', ' ']),
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
]);

/**
 * @param {object} [options]
 * @param {HTMLElement | Window | Document} [options.target]
 * @param {boolean} [options.enableTouch]
 */
export function createInput({ target = window, enableTouch = true } = {}) {
  /** @type {Record<string, boolean>} */
  const down = {
    up: false,
    down: false,
    left: false,
    right: false,
    fire: false,
  };
  /** @type {Record<string, boolean>} */
  const pressed = {
    up: false,
    down: false,
    left: false,
    right: false,
    fire: false,
  };

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
      if (!down[action]) pressed[action] = true;
      down[action] = true;
    } else {
      down[action] = false;
    }
  }

  /**
   * @param {TouchEvent} e
   */
  function syncTouchActions(e) {
    if (!enableTouch) return;
    e.preventDefault();

    // Rebuild from active touches on the document/viewport.
    // Left half of viewport = steer (relative to center of left half);
    // right half = fire.
    down.up = false;
    down.down = false;
    down.left = false;
    down.right = false;
    // fire held while any right-half touch is active
    let fireHeld = false;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const halfW = w / 2;

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
        if (dx < -dead) down.left = true;
        if (dx > dead) down.right = true;
        if (dy < -dead) down.up = true;
        if (dy > dead) down.down = true;
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

    if (fireHeld && !down.fire) pressed.fire = true;
    down.fire = fireHeld;
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
      return !!down[action];
    },
    /**
     * @param {string} action
     */
    wasPressed(action) {
      return !!pressed[action];
    },
    /** Clear edge-triggered presses after update. */
    endFrame() {
      for (const k of Object.keys(pressed)) {
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
