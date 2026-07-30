/**
 * Camera / world scroll for the horizontal side-scroller.
 *
 * ## Scroll / facing convention (R-Type-style rightward advance)
 *
 * | Concept | Choice |
 * |--------|--------|
 * | Player faces / advances | **+X (right)** on the world axis |
 * | World / camera scroll | Camera’s left edge increases as the player advances; content streams in from the **right**, exits left |
 * | Brief “right-to-left scrolling playfield” | Read as **background/content moving left on screen** while the ship fights toward the right (standard horizontal shmup). **Do not** reverse player facing or camera direction. |
 * | Coordinates | **Top-left origin** (canvas 2D). Screen: `screenX = worldX - camera.x`, `screenY = worldY - camera.y`. |
 *
 * Demo default: constant auto-scroll to the right; player free within the view band.
 */

/**
 * @param {object} options
 * @param {number} [options.x]
 * @param {number} [options.y]
 * @param {number} options.width
 * @param {number} options.height
 * @param {number} [options.scrollSpeed] world units per second along +X
 */
export function createCamera({
  x = 0,
  y = 0,
  width,
  height,
  scrollSpeed = 80,
}) {
  return {
    x,
    y,
    width,
    height,
    /** Auto-scroll speed in world units / second (+X). */
    scrollSpeed,

    /**
     * Advance camera for auto-scroll (classic shmup).
     * @param {number} dt
     */
    update(dt) {
      this.x += this.scrollSpeed * dt;
    },

    /**
     * Optional follow with left dead-zone (not used by default demo).
     * @param {{ x: number, y?: number, w?: number }} target
     * @param {{ deadZoneLeft?: number, lookAhead?: number }} [opts]
     */
    follow(target, opts = {}) {
      const deadZoneLeft = opts.deadZoneLeft ?? this.width * 0.25;
      const lookAhead = opts.lookAhead ?? 0;
      const desired = target.x - deadZoneLeft + lookAhead;
      if (desired > this.x) this.x = desired;
    },

    /** @param {number} x */
    setX(x) {
      this.x = x;
    },

    /** @param {number} y */
    setY(y) {
      this.y = y;
    },

    /**
     * @param {number} worldX
     * @param {number} worldY
     */
    worldToScreen(worldX, worldY) {
      return {
        x: worldX - this.x,
        y: worldY - this.y,
      };
    },

    /**
     * @param {number} screenX
     * @param {number} screenY
     */
    screenToWorld(screenX, screenY) {
      return {
        x: screenX + this.x,
        y: screenY + this.y,
      };
    },

    /**
     * Visible world AABB (optionally expanded by margin for despawn).
     * @param {number} [margin]
     */
    viewBounds(margin = 0) {
      return {
        x: this.x - margin,
        y: this.y - margin,
        w: this.width + margin * 2,
        h: this.height + margin * 2,
      };
    },
  };
}
