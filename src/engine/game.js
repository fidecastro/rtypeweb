/**
 * Scene / state machine for menu → playing → gameover hooks.
 * Scenes implement optional enter / exit / update / render.
 *
 * Factories are resolved once and cached. Call invalidateScene(name) before
 * setScene(name) to force a fresh factory instance (e.g. restart). setScene
 * always re-enters after invalidate even when already on that scene.
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
  /** Names dropped via invalidateScene — next setScene re-resolves even if current. */
  /** @type {Set<string>} */
  const pendingReenter = new Set();

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
      const forceReenter = pendingReenter.has(name);
      if (currentName === name && current && !forceReenter) return;
      pendingReenter.delete(name);
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

    /**
     * Drop a cached scene so the next setScene re-runs the factory.
     * If name is the current scene, the next setScene(name) will re-enter.
     * @param {string} name
     */
    invalidateScene(name) {
      delete resolved[name];
      pendingReenter.add(name);
    },
  };

  game.setScene(initial);
  return game;
}
