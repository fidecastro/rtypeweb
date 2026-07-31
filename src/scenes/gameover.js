/**
 * Game-over: final score, optional POST /api/score when registered,
 * Space/Enter retry, Esc/M → shell title menu.
 *
 * Registered players: submit is awaited before returning to the title menu so
 * home's leaderboard refetch sees the new score. Network failures surface a
 * clear status (parity with register / leaderboard). Unregistered play is
 * allowed — score is not submitted.
 */

import { submitScore as defaultSubmitScore } from '../api.js';
import { loadPlayer as defaultLoadPlayer } from '../player.js';

/**
 * @param {object} deps
 * @param {HTMLCanvasElement} deps.canvas
 * @param {CanvasRenderingContext2D} deps.ctx
 * @param {ReturnType<import('../engine/input.js').createInput>} deps.input
 * @param {() => void} deps.onRestart
 * @param {() => void} deps.onMenu
 * @param {() => number} deps.getLastScore
 * @param {() => boolean} [deps.getCleared]
 * @param {(text: string) => void} [deps.setStatus]
 * @param {number} deps.viewWidth
 * @param {number} deps.viewHeight
 * @param {typeof defaultSubmitScore} [deps.submitScore] inject for tests
 * @param {typeof defaultLoadPlayer} [deps.loadPlayer] inject for tests
 */
export function createGameOverScene({
  canvas,
  ctx,
  input,
  onRestart,
  onMenu,
  getLastScore,
  getCleared,
  setStatus,
  viewWidth,
  viewHeight,
  submitScore = defaultSubmitScore,
  loadPlayer = defaultLoadPlayer,
}) {
  /** @type {string} */
  let submitStatus = '';
  let submittedThisEnter = false;
  /** In-flight score POST (or null when none / already settled). */
  /** @type {Promise<void> | null} */
  let submitInflight = null;
  let leavingToMenu = false;
  /** @type {((e: KeyboardEvent) => void) | null} */
  let onKey = null;

  /**
   * Return to shell title only after any in-flight submit settles so home
   * refetch can include the new score.
   */
  function leaveToMenu() {
    if (leavingToMenu) return;
    leavingToMenu = true;

    const go = () => {
      if (typeof onMenu === 'function') onMenu();
    };

    if (submitInflight) {
      if (submitStatus === 'Submitting score…') {
        submitStatus = 'Submitting score… (returning when saved)';
      }
      submitInflight.then(go, go);
      return;
    }
    go();
  }

  return {
    enter() {
      submittedThisEnter = false;
      submitInflight = null;
      leavingToMenu = false;
      const finalScore = typeof getLastScore === 'function' ? getLastScore() : 0;
      const cleared = typeof getCleared === 'function' ? !!getCleared() : false;
      const player = loadPlayer();
      const outcomeLabel = cleared ? 'Stage clear' : 'Game over';

      if (!player?.id) {
        submitStatus = 'Not registered — score not submitted';
        if (setStatus) {
          setStatus(`${outcomeLabel} — score ${finalScore} (not registered)`);
        }
      } else {
        submitStatus = 'Submitting score…';
        if (setStatus) setStatus(`${outcomeLabel} — score ${finalScore}`);
        if (!submittedThisEnter) {
          submittedThisEnter = true;
          // API contract: playerId; storage shape: player.id (DEV-148).
          submitInflight = Promise.resolve()
            .then(() => submitScore({ playerId: player.id, value: finalScore }))
            .then((result) => {
              if (result.ok) {
                submitStatus = `Score saved as ${player.nickname}`;
              } else {
                const err =
                  (result.data && result.data.error) ||
                  result.status ||
                  'unknown error';
                submitStatus = `Submit failed: ${err}`;
              }
            })
            .catch((err) => {
              const msg =
                err instanceof Error
                  ? err.message
                  : 'Network error — could not reach score API.';
              submitStatus = `Submit failed: ${msg}`;
            })
            .finally(() => {
              submitInflight = null;
            });
        }
      }

      onKey = (e) => {
        if (e.code === 'Escape' || e.code === 'KeyM' || e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          leaveToMenu();
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
      const cleared = typeof getCleared === 'function' ? !!getCleared() : false;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dpr = canvas.width / viewWidth;
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#0b1220';
      ctx.fillRect(0, 0, viewWidth, viewHeight);

      ctx.fillStyle = cleared ? '#4ade80' : '#f87171';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        cleared ? 'Stage Clear' : 'Game Over',
        viewWidth / 2,
        viewHeight / 2 - 48,
      );

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
      ctx.fillText('Esc / M — title menu', viewWidth / 2, viewHeight / 2 + 90);

      ctx.restore();
    },

    /** @internal exposed for smoke tests */
    _test: {
      getSubmitStatus: () => submitStatus,
      leaveToMenu,
      getSubmitInflight: () => submitInflight,
    },
  };
}
