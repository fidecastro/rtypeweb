/**
 * Scene / state machine for menu → playing → gameover hooks.
 * Scenes implement optional enter / exit / update / render.
 */

/**
 * @typedef {object} Scene
 * @property {() => void} [enter]
 * @property {() => void} [exit]
 * @property {(dt: number) => void} [update]
 * @property {(alpha: number) => void} [render]
 */

/**
 * @param {object} options
 * @param {Record<string, Scene | (() => Scene)>} options.scenes
 * @param {string} [options.initial]
 * @param {(name: string) => void} [options.onSceneChange]
 */
export function createGame({ scenes, initial = 'menu', onSceneChange }) {
  /** @type {string | null} */
  let currentName = null;
  /** @type {Scene | null} */
  let current = null;
  /** @type {Record<string, Scene>} */
  const resolved = {};

  /**
   * @param {string} name
   * @returns {Scene}
   */
  function resolve(name) {
    if (resolved[name]) return resolved[name];
    const def = scenes[name];
    if (!def) {
      throw new Error(`[game] unknown scene: ${name}`);
    }
    const scene = typeof def === 'function' ? def() : def;
    resolved[name] = scene;
    return scene;
  }

  const game = {
    /**
     * @param {string} name
     */
    setScene(name) {
      if (currentName === name && current) return;
      if (current?.exit) current.exit();
      currentName = name;
      current = resolve(name);
      if (current.enter) current.enter();
      if (onSceneChange) onSceneChange(name);
    },

    getScene() {
      return currentName;
    },

    /**
     * @param {number} dt
     */
    update(dt) {
      if (current?.update) current.update(dt);
    },

    /**
     * @param {number} alpha
     */
    render(alpha) {
      if (current?.render) current.render(alpha);
    },

    /** Force re-create a scene factory on next enter (optional). */
    invalidateScene(name) {
      delete resolved[name];
    },
  };

  game.setScene(initial);
  return game;
}
