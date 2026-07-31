/**
 * Same-origin API helpers for register + leaderboard.
 *
 * Default base is relative `/api` (Vercel + local-api static+API).
 * Optional override for split-port local dev only — hosts are allowlisted to
 * loopback (localhost / 127.0.0.1 / ::1). Arbitrary remote `?apiBase=` values
 * are rejected and never persisted.
 *
 *   localStorage.setItem('rtypeweb.apiBase', 'http://localhost:3000')
 *   or ?apiBase=http://localhost:3000
 */

const STORAGE_API_BASE = 'rtypeweb.apiBase';

/**
 * Accept only loopback HTTP(S) origins for the optional API base override.
 * @param {string} raw
 * @returns {string | null} cleaned origin (no trailing slash) or null
 */
export function sanitizeApiBase(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase();
  const allowed =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '::1';
  if (!allowed) return null;

  // Origin only — no path/query that could confuse path joins.
  return url.origin;
}

/**
 * Resolve API origin (no trailing slash). Empty string = same origin.
 * @returns {string}
 */
export function getApiBase() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('apiBase');
    if (fromQuery != null && fromQuery !== '') {
      const cleaned = sanitizeApiBase(fromQuery);
      if (cleaned) {
        localStorage.setItem(STORAGE_API_BASE, cleaned);
        return cleaned;
      }
      // Reject poison / invalid query: clear any sticky bad value, use same-origin.
      try {
        localStorage.removeItem(STORAGE_API_BASE);
      } catch {
        /* ignore */
      }
      return '';
    }

    const stored = localStorage.getItem(STORAGE_API_BASE);
    if (stored) {
      const cleaned = sanitizeApiBase(stored);
      if (cleaned) return cleaned;
      // Stale non-allowlisted value (e.g. from an older build) — drop it.
      localStorage.removeItem(STORAGE_API_BASE);
    }
  } catch {
    /* private mode / blocked storage */
  }
  return '';
}

/**
 * @param {string} path - e.g. "/api/leaderboard"
 * @param {RequestInit} [init]
 */
export async function apiFetch(path, init = {}) {
  const base = getApiBase();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(init.headers || {});
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...init, headers });
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text, code: 'INVALID_JSON' };
    }
  }
  return { ok: res.ok, status: res.status, data };
}

/** @returns {Promise<{ ok: boolean, status: number, data: any }>} */
export function fetchLeaderboard() {
  return apiFetch('/api/leaderboard', { method: 'GET' });
}

/**
 * @param {{ nickname: string, email: string }} body
 */
export function registerPlayer(body) {
  return apiFetch('/api/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * POST /api/score — body uses API field playerId (stored identity is player.id).
 * @param {{ playerId: string, value: number }} body
 * @returns {Promise<{ ok: boolean, status: number, data: any }>}
 */
export function submitScore(body) {
  return apiFetch('/api/score', {
    method: 'POST',
    body: JSON.stringify({
      playerId: body.playerId,
      value: body.value,
    }),
  });
}
