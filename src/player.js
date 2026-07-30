/**
 * Client player identity for later game-over score attribution.
 * Shape matches register response: { id, nickname, email, ... }
 */

export const PLAYER_STORAGE_KEY = 'rtypeweb.player';

/**
 * @typedef {{ id: string, nickname: string, email?: string, createdAt?: string, updatedAt?: string }} Player
 */

/**
 * @returns {Player | null}
 */
export function loadPlayer() {
  try {
    const raw = localStorage.getItem(PLAYER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.nickname !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persist at least id + nickname (and email when present).
 * @param {Player} player
 */
export function savePlayer(player) {
  const payload = {
    id: player.id,
    nickname: player.nickname,
    email: player.email ?? '',
    createdAt: player.createdAt,
    updatedAt: player.updatedAt,
  };
  localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(payload));
  return payload;
}

export function clearPlayer() {
  localStorage.removeItem(PLAYER_STORAGE_KEY);
}
