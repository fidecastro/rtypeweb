/**
 * Game-over stub — Space returns to menu (or restarts playing via callback).
 */

/**
 * @param {object} deps
 * @param {HTMLCanvasElement} deps.canvas
 * @param {CanvasRenderingContext2D} deps.ctx
 * @param {ReturnType<import('../engine/input.js').createInput>} deps.input
 * @param {() => void} deps.onRestart
 * @param {(text: string) => void} [deps.setStatus]
 * @param {number} deps.viewWidth
 * @param {number} deps.viewHeight
 */
export function createGameOverScene({
  canvas,
  ctx,
  input,
  onRestart,
  setStatus,
  viewWidth,
  viewHeight,
}) {
  return {
    enter() {
      if (setStatus) setStatus('Game over — Space to retry');
    },

    /**
     * @param {number} _dt
     */
    update(_dt) {
      if (input.wasPressed('fire')) {
        onRestart();
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

      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Game Over', viewWidth / 2, viewHeight / 2 - 12);

      ctx.fillStyle = 'rgba(232, 238, 245, 0.8)';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText('Press Space to play again', viewWidth / 2, viewHeight / 2 + 28);

      ctx.restore();
    },
  };
}
