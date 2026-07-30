/**
 * Menu: start game + minimal register (DOM form) / show stored identity.
 */

import { loadStoredPlayer, registerPlayer } from '../game/apiClient.js';

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
  const form = document.getElementById('register-form');
  const nickInput = document.getElementById('reg-nickname');
  const emailInput = document.getElementById('reg-email');
  const regStatus = document.getElementById('reg-status');
  const regSubmit = document.getElementById('reg-submit');
  const identityEl = document.getElementById('player-identity');

  /** @type {((e: Event) => void) | null} */
  let onSubmit = null;

  function refreshIdentity() {
    const player = loadStoredPlayer();
    if (identityEl) {
      if (player) {
        identityEl.textContent = `Playing as ${player.nickname}`;
        identityEl.hidden = false;
      } else {
        identityEl.textContent = 'Not registered — scores will not be submitted';
        identityEl.hidden = false;
      }
    }
    return player;
  }

  function showForm(visible) {
    if (form) form.hidden = !visible;
  }

  return {
    enter() {
      refreshIdentity();
      showForm(true);
      if (regStatus) regStatus.textContent = '';
      if (setStatus) setStatus('Menu — register optional, then Space/Enter to start');

      onSubmit = async (e) => {
        e.preventDefault();
        if (!(nickInput instanceof HTMLInputElement) || !(emailInput instanceof HTMLInputElement)) {
          return;
        }
        const nickname = nickInput.value;
        const email = emailInput.value;
        if (regStatus) regStatus.textContent = 'Registering…';
        if (regSubmit instanceof HTMLButtonElement) regSubmit.disabled = true;
        const result = await registerPlayer({ nickname, email });
        if (regSubmit instanceof HTMLButtonElement) regSubmit.disabled = false;
        if (result.ok) {
          if (regStatus) {
            regStatus.textContent = result.created
              ? `Registered as ${result.player.nickname}`
              : `Welcome back, ${result.player.nickname}`;
          }
          refreshIdentity();
        } else {
          if (regStatus) regStatus.textContent = result.error || 'Register failed';
        }
      };

      if (form) {
        form.addEventListener('submit', onSubmit);
      }
    },

    exit() {
      showForm(false);
      if (form && onSubmit) {
        form.removeEventListener('submit', onSubmit);
      }
      onSubmit = null;
    },

    /**
     * @param {number} _dt
     */
    update(_dt) {
      // fire action includes Space and Enter (see input.js).
      // Ignore fire while focus is in a form field so typing Space works.
      const active = document.activeElement;
      const typing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLButtonElement ||
        (active && active.closest && active.closest('#register-form'));

      if (!typing && input.wasPressed('fire')) {
        onStart();
      }
      input.endFrame();
    },

    /**
     * @param {number} _alpha
     */
    render(_alpha) {
      const player = loadStoredPlayer();

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
        ctx.fillText('Register below to submit scores on game over', viewWidth / 2, viewHeight / 2 + 44);
      }

      ctx.restore();
    },
  };
}
