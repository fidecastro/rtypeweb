/**
 * Title screen / main menu: leaderboard, register, scores, play (engine mount).
 * Engine wiring: runState, combat playing scene, game-over score submit.
 * Audio unlocks on first user gesture; mute persists via localStorage.
 */
import { fetchLeaderboard, registerPlayer } from './api.js';
import { loadPlayer, savePlayer } from './player.js';
import { applyPortalHandoff } from './portalHandoff.js';
import { createLoop } from './engine/loop.js';
import { createInput } from './engine/input.js';
import { createGame } from './engine/game.js';
import { createPlayingScene } from './scenes/playing.js';
import { createMenuScene } from './scenes/menu.js';
import { createGameOverScene } from './scenes/gameover.js';
import { getAudio } from './audio.js';

const audio = getAudio();

const VIEWS = ['home', 'register', 'scores', 'play'];
const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 540;

/** Shared across playing → gameover for last-run score / clear flag. */
const runState = {
  lastScore: 0,
  lastCleared: false,
};

/** @type {string} */
let currentView = 'home';

/** @type {{ game: ReturnType<typeof createGame>, loop: ReturnType<typeof createLoop> } | null} */
let engine = null;

function $(id) {
  return document.getElementById(id);
}

/**
 * @param {string} text
 */
function setStatus(text) {
  const statusEl = $('status');
  if (statusEl) statusEl.textContent = text;
}

function setPlayerBadge() {
  const badge = $('player-badge');
  if (!badge) return;
  const player = loadPlayer();
  if (player) {
    badge.hidden = false;
    badge.textContent = `Playing as ${player.nickname}`;
  } else {
    badge.hidden = true;
    badge.textContent = '';
  }
  const playHint = $('play-player-hint');
  if (playHint) {
    playHint.textContent = player
      ? `Registered pilot: ${player.nickname} — game-over scores submit for this profile.`
      : 'No profile yet — register so game over can attribute and submit your score.';
  }
}

/**
 * Lazily boot the side-scrolling engine into #game once.
 * @returns {boolean}
 */
function ensureEngine() {
  if (engine) return true;

  const canvas = $('game');
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
    setStatus('Error: missing #game canvas');
    console.error('[rtypeweb] #game canvas not found');
    return false;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    setStatus('Error: 2D context unavailable');
    console.error('[rtypeweb] 2D context unavailable');
    return false;
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(VIEW_WIDTH * dpr);
    canvas.height = Math.floor(VIEW_HEIGHT * dpr);
    canvas.style.width = `${VIEW_WIDTH}px`;
    canvas.style.height = `${VIEW_HEIGHT}px`;
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const input = createInput({ target: window, enableTouch: true });

  /** @type {ReturnType<typeof createGame> | null} */
  let game = null;

  function goPlaying() {
    game?.invalidateScene('playing');
    game?.setScene('playing');
  }

  /**
   * Leave the play view for the shell title screen (menu path).
   */
  function goShellMenu() {
    showView('home');
  }

  /**
   * @param {{ score?: number, cleared?: boolean }} [payload]
   */
  function goGameOver(payload) {
    if (payload && typeof payload.score === 'number') {
      runState.lastScore = payload.score;
    }
    runState.lastCleared = !!(payload && payload.cleared);
    game?.invalidateScene('gameover');
    game?.setScene('gameover');
  }

  const sceneDeps = {
    canvas,
    ctx,
    input,
    setStatus,
    viewWidth: VIEW_WIDTH,
    viewHeight: VIEW_HEIGHT,
  };

  game = createGame({
    initial: 'playing',
    onSceneChange(name) {
      console.log('[rtypeweb] scene →', name);
    },
    scenes: {
      menu: () =>
        createMenuScene({
          ...sceneDeps,
          onStart: goPlaying,
        }),
      playing: () =>
        createPlayingScene({
          ...sceneDeps,
          runState,
          onGameOver: goGameOver,
        }),
      gameover: () =>
        createGameOverScene({
          ...sceneDeps,
          getLastScore: () => runState.lastScore,
          getCleared: () => runState.lastCleared,
          onRestart: goPlaying,
          onMenu: goShellMenu,
        }),
    },
  });

  const loop = createLoop({
    update(dt) {
      game?.update(dt);
    },
    render(alpha) {
      game?.render(alpha);
    },
  });

  engine = { game, loop };
  console.log('[rtypeweb] engine ready — scene:', game.getScene());
  return true;
}

function startPlay() {
  if (!ensureEngine() || !engine) return;
  // Fresh run whenever the Play view is entered (incl. return from title).
  engine.game.invalidateScene('playing');
  engine.game.setScene('playing');
  if (!engine.loop.isRunning()) {
    engine.loop.start();
  }
  setStatus('Playing');
  setPlayerBadge();
}

function stopPlay() {
  if (engine?.loop.isRunning()) {
    engine.loop.stop();
  }
}

/**
 * @param {string} view
 */
function showView(view) {
  if (!VIEWS.includes(view)) view = 'home';
  currentView = view;

  for (const name of VIEWS) {
    const el = document.querySelector(`[data-view="${name}"]`);
    if (!el) continue;
    const active = name === view;
    el.classList.toggle('is-active', active);
    if (active) {
      el.removeAttribute('hidden');
    } else {
      el.setAttribute('hidden', '');
    }
  }

  document.querySelectorAll('[data-nav]').forEach((btn) => {
    const isCurrent = btn.getAttribute('data-nav') === view;
    if (isCurrent) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });

  if (view === 'play') {
    // Stage music is started by the playing scene after unlock.
    startPlay();
  } else {
    stopPlay();
    // Shell views: restore menu music when unlocked and not muted.
    if (audio.isUnlocked() && !audio.isMuted()) {
      audio.playMusic('menu');
    } else if (!audio.isUnlocked()) {
      // Queue intent so unlock starts the right track.
      audio.playMusic('menu');
    }
  }

  if (view === 'home') {
    loadAndRenderLeaderboard($('home-leaderboard'));
  } else if (view === 'scores') {
    loadAndRenderLeaderboard($('scores-leaderboard'));
  } else if (view === 'register') {
    prefillRegisterForm();
  }

  const nextHash = view === 'home' ? '#/' : `#/${view}`;
  if (location.hash !== nextHash) {
    history.replaceState(null, '', nextHash);
  }
}

function viewFromHash() {
  const raw = (location.hash || '#/').replace(/^#\/?/, '').split('?')[0];
  if (!raw || raw === '') return 'home';
  if (VIEWS.includes(raw)) return raw;
  return 'home';
}

/**
 * @param {HTMLElement | null} container
 * @param {{ scores?: Array<{ rank?: number, nickname: string, value: number }> }} data
 */
function renderLeaderboardList(container, data) {
  if (!container) return;
  const scores = Array.isArray(data?.scores) ? data.scores : [];

  if (scores.length === 0) {
    container.innerHTML =
      '<p class="state-msg is-empty">No scores yet — be the first!</p>';
    return;
  }

  const rows = scores
    .slice(0, 10)
    .map((s, i) => {
      const rank = s.rank ?? i + 1;
      const nick = escapeHtml(String(s.nickname ?? '—'));
      const value = Number(s.value);
      const scoreText = Number.isFinite(value) ? String(value) : '—';
      return `<tr>
        <td class="col-rank">${rank}</td>
        <td class="col-nick">${nick}</td>
        <td class="col-score">${scoreText}</td>
      </tr>`;
    })
    .join('');

  container.innerHTML = `
    <table class="leaderboard-table">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th>Pilot</th>
          <th class="col-score">Score</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * @param {HTMLElement | null} container
 */
async function loadAndRenderLeaderboard(container) {
  if (!container) return;
  container.innerHTML = '<p class="state-msg">Loading…</p>';

  try {
    const { ok, status, data } = await fetchLeaderboard();
    if (!ok) {
      const msg =
        (data && data.error) ||
        `Could not load leaderboard (${status}). Menu still works.`;
      container.innerHTML = `<p class="state-msg is-error">${escapeHtml(msg)}</p>`;
      return;
    }
    renderLeaderboardList(container, data || { scores: [] });
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : 'Network error loading leaderboard. Menu still works.';
    container.innerHTML = `<p class="state-msg is-error">${escapeHtml(msg)}</p>`;
  }
}

function prefillRegisterForm() {
  const player = loadPlayer();
  const nick = /** @type {HTMLInputElement | null} */ ($('reg-nickname'));
  const email = /** @type {HTMLInputElement | null} */ ($('reg-email'));
  if (player && nick && !nick.value) nick.value = player.nickname;
  if (player && email && !email.value && player.email) email.value = player.email;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function updateMuteButton() {
  const btn = $('mute-toggle');
  if (!btn) return;
  const muted = audio.isMuted();
  btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  btn.textContent = muted ? 'Sound: Off' : 'Sound: On';
}

/**
 * Unlock audio on the first user gesture (autoplay policy).
 * @returns {Promise<void>}
 */
async function ensureAudioUnlocked() {
  await audio.unlockFromGesture();
  // If still on a shell view after unlock, ensure menu music is running.
  if (currentView !== 'play' && !audio.isMuted()) {
    audio.playMusic('menu');
  }
}

function wireAudioUnlock() {
  let armed = true;
  const onGesture = () => {
    if (!armed) return;
    armed = false;
    window.removeEventListener('pointerdown', onGesture, true);
    window.removeEventListener('keydown', onGesture, true);
    // Resume AudioContext on the same user-gesture stack.
    void ensureAudioUnlocked();
  };
  window.addEventListener('pointerdown', onGesture, true);
  window.addEventListener('keydown', onGesture, true);
}

function wireMuteToggle() {
  const btn = $('mute-toggle');
  if (!btn) return;
  updateMuteButton();
  btn.addEventListener('click', async () => {
    await ensureAudioUnlocked();
    audio.setMuted(!audio.isMuted());
    updateMuteButton();
    // Resume correct track after unmute.
    if (!audio.isMuted()) {
      if (currentView === 'play') {
        audio.playMusic('stage');
      } else {
        audio.playMusic('menu');
      }
    }
  });
}

function wireNav() {
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await ensureAudioUnlocked();
      const view = btn.getAttribute('data-nav') || 'home';
      if (view === 'play') {
        audio.playSfx('ui_confirm');
      } else {
        audio.playSfx('ui_select');
      }
      showView(view);
    });
  });

  window.addEventListener('hashchange', () => {
    showView(viewFromHash());
  });
}

function wireRegister() {
  const form = /** @type {HTMLFormElement | null} */ ($('register-form'));
  const status = $('register-status');
  const submitBtn = /** @type {HTMLButtonElement | null} */ ($('register-submit'));
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!status) return;

    const nickInput = /** @type {HTMLInputElement} */ ($('reg-nickname'));
    const emailInput = /** @type {HTMLInputElement} */ ($('reg-email'));
    const nickname = (nickInput?.value || '').trim();
    const email = (emailInput?.value || '').trim();

    status.className = 'form-status';
    if (!nickname || nickname.length > 32) {
      status.classList.add('is-error');
      status.textContent = 'Nickname must be 1–32 characters.';
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      status.classList.add('is-error');
      status.textContent = 'Enter a valid email address.';
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    status.textContent = 'Saving…';

    try {
      const { ok, status: httpStatus, data } = await registerPlayer({ nickname, email });
      if (!ok) {
        status.classList.add('is-error');
        status.textContent =
          (data && data.error) ||
          `Registration failed (${httpStatus}).`;
        return;
      }
      savePlayer({
        id: data.id,
        nickname: data.nickname,
        email: data.email,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });
      status.classList.add('is-ok');
      status.textContent =
        httpStatus === 201
          ? `Registered as ${data.nickname}. Profile saved.`
          : `Welcome back, ${data.nickname}. Profile loaded.`;
      setPlayerBadge();
      await ensureAudioUnlocked();
      audio.playSfx('ui_confirm');
    } catch (err) {
      status.classList.add('is-error');
      status.textContent =
        err instanceof Error
          ? err.message
          : 'Network error — could not reach register API.';
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function wireScoresRefresh() {
  const btn = $('scores-refresh');
  if (!btn) return;
  btn.addEventListener('click', () => {
    loadAndRenderLeaderboard($('scores-leaderboard'));
  });
}

async function boot() {
  wireAudioUnlock();
  wireMuteToggle();
  wireNav();
  wireRegister();
  wireScoresRefresh();

  // Portal handoff before first badge/view — never blocks menu on failure.
  let handoffResult = 'skipped';
  try {
    handoffResult = await applyPortalHandoff();
  } catch (err) {
    console.warn('[rtypeweb] portal handoff error', err);
    handoffResult = 'failed';
  }

  setPlayerBadge();

  if (handoffResult === 'applied') {
    const player = loadPlayer();
    setStatus(
      player
        ? `Signed in via portal as ${player.nickname}`
        : 'Signed in via portal',
    );
  } else if (handoffResult === 'failed') {
    setStatus('Portal sign-in could not be verified — register or try again from the portal.');
  }

  // Queue menu music intent (starts after first gesture unlock).
  audio.playMusic('menu');
  showView(viewFromHash());
  console.log('[rtypeweb] menu shell booted', { handoff: handoffResult });
}

void boot();
