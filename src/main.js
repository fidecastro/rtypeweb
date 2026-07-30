/**
 * Title screen / main menu: leaderboard, register, scores, play mount.
 */
import { fetchLeaderboard, registerPlayer } from './api.js';
import { loadPlayer, savePlayer } from './player.js';

const VIEWS = ['home', 'register', 'scores', 'play'];

/** @type {string} */
let currentView = 'home';

function $(id) {
  return document.getElementById(id);
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
      ? `Registered pilot: ${player.nickname} — scores will use this profile.`
      : 'No profile yet — register so a later game-over can attribute your score.';
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

  if (view === 'home') {
    loadAndRenderLeaderboard($('home-leaderboard'));
  } else if (view === 'scores') {
    loadAndRenderLeaderboard($('scores-leaderboard'));
  } else if (view === 'register') {
    prefillRegisterForm();
  } else if (view === 'play') {
    setPlayerBadge();
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

function wireNav() {
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-nav') || 'home';
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

function boot() {
  setPlayerBadge();
  wireNav();
  wireRegister();
  wireScoresRefresh();
  showView(viewFromHash());
  console.log('[rtypeweb] menu shell booted');
}

boot();
