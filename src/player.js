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
 * @returns {Player}
 * @throws {Error} if id/nickname missing or storage blocked
 */
export function savePlayer(player) {
  if (!player || typeof player.id !== 'string' || !player.id) {
    throw new Error('Cannot save player: missing id');
  }
  if (typeof player.nickname !== 'string' || !player.nickname) {
    throw new Error('Cannot save player: missing nickname');
  }
  const payload = {
    id: player.id,
    nickname: player.nickname,
    email: player.email ?? '',
    createdAt: player.createdAt,
    updatedAt: player.updatedAt,
  };
  try {
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'localStorage unavailable';
    throw new Error(`Could not save profile (storage blocked): ${msg}`);
  }
  return payload;
}

export function clearPlayer() {
  try {
    localStorage.removeItem(PLAYER_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
