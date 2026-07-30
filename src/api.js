/**
 * Same-origin API helpers for register + leaderboard.
 *
 * Default base is relative `/api` (Vercel + local-api static+API).
 * Override for split-port local dev via:
 *   localStorage.setItem('rtypeweb.apiBase', 'http://localhost:3000')
 * or ?apiBase=http://localhost:3000 on first load.
 */

const STORAGE_API_BASE = 'rtypeweb.apiBase';

/**
 * Resolve API origin (no trailing slash). Empty string = same origin.
 * @returns {string}
 */
export function getApiBase() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('apiBase');
    if (fromQuery) {
      const cleaned = fromQuery.replace(/\/$/, '');
      localStorage.setItem(STORAGE_API_BASE, cleaned);
      return cleaned;
    }
    const stored = localStorage.getItem(STORAGE_API_BASE);
    if (stored) return stored.replace(/\/$/, '');
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
