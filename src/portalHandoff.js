/**
 * Portal auth handoff: consume query token from the web games portal,
 * verify against the portal, and persist identity into rtypeweb.player.
 *
 * Contract (portal DEV-158):
 *   ?portalToken=&portalPlayerId=&portalNickname=&portalEmail=
 *   GET {portalBase}/api/auth/verify?token=…
 *   Success player → savePlayer({ id, nickname, email })
 *
 * Do not trust query identity alone — always use the verify response.
 */

import { savePlayer } from './player.js';

/** Production portal origin (no trailing slash). Override via ?portalBase= or localStorage. */
export const DEFAULT_PORTAL_BASE = 'https://webgamesportal.vercel.app';

export const PORTAL_BASE_STORAGE_KEY = 'rtypeweb.portalBase';

/** Query keys stripped after handoff is consumed (success or failure). */
export const HANDOFF_QUERY_KEYS = [
  'portalToken',
  'portalPlayerId',
  'portalNickname',
  'portalEmail',
  'portalBase',
];

/**
 * Accept only http(s) origins for portal verify. Unlike apiBase, non-loopback
 * HTTPS is allowed so production portal verify works from the game origin.
 * @param {string | null | undefined} raw
 * @returns {string | null} cleaned origin (no trailing slash) or null
 */
export function sanitizePortalBase(raw) {
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
  if (!url.hostname) return null;

  return url.origin;
}

/**
 * Read handoff params from a query string (or location.search).
 * Returns null when portalToken is absent (standalone visit).
 *
 * @param {string} [search] - e.g. "?portalToken=…&portalPlayerId=…" or location.search
 * @returns {{ token: string, playerId: string | null, nickname: string | null, email: string | null, portalBase: string | null } | null}
 */
export function readHandoffParams(search) {
  const raw =
    search != null
      ? String(search)
      : typeof location !== 'undefined'
        ? location.search
        : '';
  const q = new URLSearchParams(
    raw.startsWith('?') ? raw.slice(1) : raw,
  );

  const token = q.get('portalToken');
  if (token == null || String(token).trim() === '') {
    return null;
  }

  return {
    token: String(token).trim(),
    playerId: q.get('portalPlayerId'),
    nickname: q.get('portalNickname'),
    email: q.get('portalEmail'),
    portalBase: q.get('portalBase'),
  };
}

/**
 * Pure helper: strip handoff keys from path+search+hash (or absolute URL),
 * preserving hash and unrelated query params (e.g. apiBase).
 *
 * @param {string} href - e.g. `${pathname}${search}${hash}` or full URL
 * @returns {string} cleaned path+search+hash (or absolute URL if input was absolute)
 */
export function stripHandoffParams(href) {
  const input = String(href ?? '');
  const dummy = 'http://rtypeweb.local';
  let url;
  try {
    url = new URL(input, dummy);
  } catch {
    return input;
  }

  for (const key of HANDOFF_QUERY_KEYS) {
    url.searchParams.delete(key);
  }

  const search = url.searchParams.toString();
  const searchOut = search ? `?${search}` : '';
  const hashOut = url.hash || '';

  const isAbsolute =
    /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(input) || input.startsWith('//');
  if (isAbsolute) {
    return `${url.origin}${url.pathname}${searchOut}${hashOut}`;
  }

  // Relative / path-like: keep pathname (URL normalizes bare "?…" to "/").
  if (input.startsWith('?') || input.startsWith('#')) {
    return `${searchOut}${hashOut}`;
  }
  return `${url.pathname}${searchOut}${hashOut}` || '/';
}

/**
 * Resolve portal origin: query override → stored → production default.
 * Persists a valid query override into localStorage.
 *
 * @param {{ search?: string, storage?: Storage | null, locationHref?: string }} [opts]
 * @returns {string} origin without trailing slash
 */
export function resolvePortalBase(opts = {}) {
  const search =
    opts.search != null
      ? opts.search
      : typeof location !== 'undefined'
        ? location.search
        : '';

  let storage = opts.storage;
  if (storage === undefined) {
    try {
      storage = typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      storage = null;
    }
  }

  const params = new URLSearchParams(
    String(search).startsWith('?') ? String(search).slice(1) : String(search),
  );
  const fromQuery = params.get('portalBase');
  if (fromQuery != null && fromQuery !== '') {
    const cleaned = sanitizePortalBase(fromQuery);
    if (cleaned) {
      try {
        storage?.setItem(PORTAL_BASE_STORAGE_KEY, cleaned);
      } catch {
        /* private mode */
      }
      return cleaned;
    }
    // Invalid override — drop sticky bad value
    try {
      storage?.removeItem(PORTAL_BASE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  try {
    const stored = storage?.getItem(PORTAL_BASE_STORAGE_KEY);
    if (stored) {
      const cleaned = sanitizePortalBase(stored);
      if (cleaned) return cleaned;
      storage?.removeItem(PORTAL_BASE_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }

  return DEFAULT_PORTAL_BASE;
}

/**
 * GET {portalBase}/api/auth/verify?token=…
 * @param {string} token
 * @param {string} portalBase
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ ok: true, player: { id: string, nickname: string, email?: string }, exp?: number, iat?: number } | { ok: false, error: string, code?: string, status?: number }>}
 */
export async function verifyPortalToken(token, portalBase, fetchImpl = fetch) {
  const base = sanitizePortalBase(portalBase) || DEFAULT_PORTAL_BASE;
  const url = `${base}/api/auth/verify?token=${encodeURIComponent(token)}`;

  let res;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      // Handoff is bearer/query token — no portal cookies required.
      credentials: 'omit',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return { ok: false, error: msg, code: 'NETWORK_ERROR' };
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      return {
        ok: false,
        error: 'Invalid JSON from portal verify',
        code: 'INVALID_JSON',
        status: res.status,
      };
    }
  }

  if (!res.ok) {
    return {
      ok: false,
      error:
        (data && typeof data.error === 'string' && data.error) ||
        `Portal verify failed (${res.status})`,
      code: (data && data.code) || 'VERIFY_FAILED',
      status: res.status,
    };
  }

  const player = data && data.player;
  if (
    !player ||
    typeof player.id !== 'string' ||
    !player.id ||
    typeof player.nickname !== 'string' ||
    !player.nickname
  ) {
    return {
      ok: false,
      error: 'Portal verify response missing player',
      code: 'INVALID_RESPONSE',
      status: res.status,
    };
  }

  return {
    ok: true,
    player: {
      id: player.id,
      nickname: player.nickname,
      email: typeof player.email === 'string' ? player.email : '',
    },
    exp: data.exp,
    iat: data.iat,
  };
}

/**
 * Apply history.replaceState to drop handoff query keys; keep hash + other params.
 * @param {{ location?: Location, history?: History }} [env]
 */
export function stripHandoffFromLocation(env = {}) {
  const loc =
    env.location ||
    (typeof location !== 'undefined' ? location : null);
  const hist =
    env.history ||
    (typeof history !== 'undefined' ? history : null);
  if (!loc || !hist || typeof hist.replaceState !== 'function') return;

  try {
    const cleaned = stripHandoffParams(
      `${loc.pathname}${loc.search}${loc.hash}`,
    );
    hist.replaceState(null, '', cleaned);
  } catch {
    /* ignore */
  }
}

/**
 * Consume portal handoff on boot.
 *
 * @param {{
 *   search?: string,
 *   storage?: Storage | null,
 *   fetchImpl?: typeof fetch,
 *   savePlayerFn?: typeof savePlayer,
 *   location?: Location,
 *   history?: History,
 * }} [deps]
 * @returns {Promise<'applied' | 'skipped' | 'failed'>}
 */
export async function applyPortalHandoff(deps = {}) {
  const search =
    deps.search != null
      ? deps.search
      : typeof location !== 'undefined'
        ? location.search
        : '';

  const handoff = readHandoffParams(search);
  if (!handoff) {
    return 'skipped';
  }

  const portalBase = resolvePortalBase({
    search,
    storage: deps.storage,
  });

  const fetchImpl = deps.fetchImpl || fetch;
  const save = deps.savePlayerFn || savePlayer;

  let result;
  try {
    result = await verifyPortalToken(handoff.token, portalBase, fetchImpl);
  } catch (err) {
    // Never block boot on portal outage.
    stripHandoffFromLocation({
      location: deps.location,
      history: deps.history,
    });
    return 'failed';
  }

  // Always strip tokens from the URL after attempt (success or fail).
  stripHandoffFromLocation({
    location: deps.location,
    history: deps.history,
  });

  if (!result.ok) {
    return 'failed';
  }

  try {
    save({
      id: result.player.id,
      nickname: result.player.nickname,
      email: result.player.email ?? '',
    });
  } catch {
    return 'failed';
  }

  return 'applied';
}
