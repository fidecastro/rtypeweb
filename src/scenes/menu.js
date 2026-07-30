/**
 * Minimal menu stub — Enter / Space starts playing.
 */

/**
 * @param {object} deps
 * @param {HTMLCanvasElement} deps.canvas
 * @param {CanvasRenderingContext2D} deps.ctx
 * @param {ReturnType<import('../engine/input.js').createInput>} deps.input
 * @param {() => void} deps.onStart
 * @param {(text: string) => void} [deps.setStatus]
 * @param {number} deps.viewWidth
 * @param {number} deps.viewHeight
 */
export function createMenuScene({
  canvas,
  ctx,
  input,
  onStart,
  setStatus,
  viewWidth,
  viewHeight,
}) {
  return {
    enter() {
      if (setStatus) setStatus('Menu — press Enter or Space');
    },

    /**
     * @param {number} _dt
     */
    update(_dt) {
      // fire action includes Space and Enter (see input.js).
      if (input.wasPressed('fire')) {
        onStart();
      }
      input.endFrame();
    },

    /**
     * @param {number} _alpha
     */
    render(_alpha) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dpr = canvas.width / viewWidth;
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#0b1220';
      ctx.fillRect(0, 0, viewWidth, viewHeight);

      ctx.fillStyle = '#e8eef5';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('R-Type Web', viewWidth / 2, viewHeight / 2 - 24);

      ctx.font = '16px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(232, 238, 245, 0.8)';
      ctx.fillText('Press Enter or Space to start', viewWidth / 2, viewHeight / 2 + 16);
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(232, 238, 245, 0.55)';
      ctx.fillText(
        'WASD / arrows move · dodge obstacles',
        viewWidth / 2,
        viewHeight / 2 + 44,
      );

      ctx.restore();
    },
  };
}
