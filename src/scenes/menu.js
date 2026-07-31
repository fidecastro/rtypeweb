/**
 * In-engine menu stub (optional). Registration lives in the shell Register view.
 * Press Space/Enter to start a run when this scene is active.
 */

import { loadPlayer } from '../player.js';
import { getAudio } from '../audio.js';

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
  const audio = getAudio();

  return {
    enter() {
      const player = loadPlayer();
      if (setStatus) {
        setStatus(
          player
            ? `Menu — playing as ${player.nickname}`
            : 'Menu — register in shell for score submit',
        );
      }
    },

    exit() {},

    /**
     * @param {number} _dt
     */
    update(_dt) {
      if (input.wasPressed('fire')) {
        audio.playSfx('ui_confirm');
        onStart();
      }
      input.endFrame();
    },

    /**
     * @param {number} _alpha
     */
    render(_alpha) {
      const player = loadPlayer();

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dpr = canvas.width / viewWidth;
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#0b1220';
      ctx.fillRect(0, 0, viewWidth, viewHeight);

      ctx.fillStyle = '#e8eef5';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('R-Type Web', viewWidth / 2, viewHeight / 2 - 56);

      ctx.font = '16px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(232, 238, 245, 0.8)';
      ctx.fillText('Press Enter or Space to start', viewWidth / 2, viewHeight / 2 - 16);

      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(232, 238, 245, 0.55)';
      ctx.fillText(
        'WASD / arrows move · Space fire · dodge hazards',
        viewWidth / 2,
        viewHeight / 2 + 12,
      );

      if (player) {
        ctx.fillStyle = '#4ade80';
        ctx.font = '14px system-ui, sans-serif';
        ctx.fillText(`Registered: ${player.nickname}`, viewWidth / 2, viewHeight / 2 + 44);
      } else {
        ctx.fillStyle = 'rgba(232, 238, 245, 0.45)';
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillText(
          'Use Register in the menu to submit scores on game over',
          viewWidth / 2,
          viewHeight / 2 + 44,
        );
      }

      ctx.restore();
    },
  };
}
