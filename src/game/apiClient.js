/**
 * Client helpers for player registration, score submit, and localStorage identity.
 * Uses same-origin /api/* (works on Vercel and npm run api when static is co-hosted).
 */

const STORAGE_KEY = 'rtypeweb.player';

/**
 * @typedef {{ playerId: string, nickname: string, email?: string }} StoredPlayer
 */

/**
 * @returns {StoredPlayer | null}
 */
export function loadStoredPlayer() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    const playerId = typeof data.playerId === 'string' ? data.playerId.trim() : '';
    const nickname = typeof data.nickname === 'string' ? data.nickname.trim() : '';
    if (!playerId || !nickname) return null;
    /** @type {StoredPlayer} */
    const out = { playerId, nickname };
    if (typeof data.email === 'string') out.email = data.email;
    return out;
  } catch {
    return null;
  }
}

/**
 * @param {StoredPlayer} player
 */
export function saveStoredPlayer(player) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      playerId: player.playerId,
      nickname: player.nickname,
      email: player.email ?? undefined,
    }),
  );
}

export function clearStoredPlayer() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * @param {Response} res
 */
async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * POST /api/register — store identity on success.
 * @param {{ nickname: string, email: string }} opts
 * @returns {Promise<{ ok: true, player: StoredPlayer, created: boolean } | { ok: false, error: string, code?: string, status: number }>}
 */
export async function registerPlayer({ nickname, email }) {
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname, email }),
    });
    const body = await parseJsonSafe(res);
    if (!res.ok) {
      return {
        ok: false,
        error: (body && body.error) || res.statusText || 'Register failed',
        code: body?.code,
        status: res.status,
      };
    }
    const playerId = body?.id;
    const nick = body?.nickname ?? nickname;
    if (typeof playerId !== 'string' || !playerId) {
      return { ok: false, error: 'Invalid register response', status: res.status };
    }
    /** @type {StoredPlayer} */
    const player = {
      playerId,
      nickname: nick,
      email: body?.email ?? email,
    };
    saveStoredPlayer(player);
    return { ok: true, player, created: res.status === 201 };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error',
      status: 0,
    };
  }
}

/**
 * POST /api/score — non-blocking caller should not await before UI navigation.
 * @param {{ playerId: string, value: number }} opts
 * @returns {Promise<{ ok: true, score: object } | { ok: false, error: string, code?: string, status: number }>}
 */
export async function submitScore({ playerId, value }) {
  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId, value }),
    });
    const body = await parseJsonSafe(res);
    if (!res.ok) {
      return {
        ok: false,
        error: (body && body.error) || res.statusText || 'Score submit failed',
        code: body?.code,
        status: res.status,
      };
    }
    return { ok: true, score: body };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error',
      status: 0,
    };
  }
}
