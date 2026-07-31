/**
 * Per-run score bag. Playing scene and combat systems call add();
 * game-over reads get() for display / submit.
 */

/**
 * @returns {{ add: (points: number) => number, get: () => number, reset: () => void }}
 */
export function createRunScore() {
  let value = 0;

  return {
    /**
     * @param {number} points
     * @returns {number} new total
     */
    add(points) {
      const n = Number(points);
      if (!Number.isFinite(n) || n === 0) return value;
      value = Math.max(0, Math.floor(value + n));
      return value;
    },

    get() {
      return value;
    },

    reset() {
      value = 0;
    },
  };
}
