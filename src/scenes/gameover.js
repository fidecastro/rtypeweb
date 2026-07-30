/**
 * Game-over: final score, optional POST /api/score when registered,
 * Space/Enter retry, Esc/M → menu.
 */

import { loadStoredPlayer, submitScore } from '../game/apiClient.js';

/**
 * @param {object} deps
 * @param {HTMLCanvasElement} deps.canvas
 * @param {CanvasRenderingContext2D} deps.ctx
 * @param {ReturnType<import('../engine/input.js').createInput>} deps.input
 * @param {() => void} deps.onRestart
 * @param {() => void} deps.onMenu
 * @param {() => number} deps.getLastScore
 * @param {(text: string) => void} [deps.setStatus]
 * @param {number} deps.viewWidth
 * @param {number} deps.viewHeight
 */
export function createGameOverScene({
  canvas,
  ctx,
  input,
  onRestart,
  onMenu,
  getLastScore,
  setStatus,
  viewWidth,
  viewHeight,
}) {
  /** @type {string} */
  let submitStatus = '';
  let submittedThisEnter = false;
  /** @type {((e: KeyboardEvent) => void) | null} */
  let onKey = null;

  return {
    enter() {
      submittedThisEnter = false;
      const finalScore = typeof getLastScore === 'function' ? getLastScore() : 0;
      const player = loadStoredPlayer();

      if (!player?.playerId) {
        submitStatus = 'Not registered — score not submitted';
        if (setStatus) {
          setStatus(`Game over — score ${finalScore} (not registered)`);
        }
      } else {
        submitStatus = 'Submitting score…';
        if (setStatus) setStatus(`Game over — score ${finalScore}`);
        if (!submittedThisEnter) {
          submittedThisEnter = true;
          submitScore({ playerId: player.playerId, value: finalScore }).then(
            (result) => {
              if (result.ok) {
                submitStatus = `Score saved as ${player.nickname}`;
              } else {
                submitStatus = `Submit failed: ${result.error}`;
              }
            },
          );
        }
      }

      onKey = (e) => {
        if (e.code === 'Escape' || e.code === 'KeyM' || e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          onMenu();
        }
      };
      window.addEventListener('keydown', onKey);
    },

    exit() {
      if (onKey) {
        window.removeEventListener('keydown', onKey);
        onKey = null;
      }
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
      const finalScore = typeof getLastScore === 'function' ? getLastScore() : 0;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dpr = canvas.width / viewWidth;
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#0b1220';
      ctx.fillRect(0, 0, viewWidth, viewHeight);

      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Game Over', viewWidth / 2, viewHeight / 2 - 48);

      ctx.fillStyle = '#e8eef5';
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillText(`Final score: ${finalScore}`, viewWidth / 2, viewHeight / 2 - 8);

      ctx.fillStyle = 'rgba(232, 238, 245, 0.75)';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(submitStatus, viewWidth / 2, viewHeight / 2 + 28);

      ctx.fillStyle = 'rgba(232, 238, 245, 0.8)';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText('Space / Enter — play again', viewWidth / 2, viewHeight / 2 + 64);
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(232, 238, 245, 0.6)';
      ctx.fillText('Esc / M — menu', viewWidth / 2, viewHeight / 2 + 90);

      ctx.restore();
    },
  };
}
