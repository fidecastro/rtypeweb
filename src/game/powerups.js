/**
 * Novel ship power-ups (original designs — not copyrighted R-Type assets).
 *
 * Stacking / replacement rules (source of truth; mirror in README):
 *
 * 1. Weapon modes (`spread` / `rapid`) — mutually exclusive. Collecting one
 *    replaces the other. Default is base (single shot, normal cooldown).
 *    Weapon modes are not timed; they last until replaced or the run ends.
 * 2. Aegis (`aegis`) — independent of weapon mode. Each pickup adds +1 charge,
 *    max AEGIS_MAX_CHARGES (2). Extra pickups at cap do not raise charges.
 *    Charges persist until consumed by a hit or death. On absorb, the charge
 *    is spent and the player gains the same brief invulnerability window as a
 *    normal hit (PLAYER_INVULN_SEC) so continuous hazard overlap = one charge,
 *    not one charge per frame.
 * 3. Surge (`surge`) — independent of weapon and aegis. Collecting while
 *    active refreshes duration to full SURGE_DURATION_SEC; multipliers do
 *    not stack.
 * 4. Death / scene exit — power-up state lives on the player entity; a new
 *    run starts at base (no weapon mode, 0 aegis, no surge).
 * 5. Controls — fire/move inputs unchanged; only rates, projectile patterns,
 *    absorb charges, and move speed change.
 */

import { createEntity } from '../engine/entity.js';

/** @typedef {'spread' | 'rapid' | 'aegis' | 'surge'} PowerupTypeId */

export const SURGE_DURATION_SEC = 12;
export const AEGIS_MAX_CHARGES = 2;
export const RAPID_COOLDOWN_FACTOR = 0.45;
export const SURGE_SPEED_FACTOR = 1.45;
export const POWERUP_DROP_CHANCE = 0.3;
export const POWERUP_SIZE = 20;
/** Mild leftward drift so pickups enter the flight path. */
export const POWERUP_DRIFT_VX = -35;

/**
 * Metadata for each power-up type (HUD labels, pickup colors).
 * @type {Record<PowerupTypeId, { id: PowerupTypeId, label: string, color: string, category: string }>}
 */
export const POWERUP_TYPES = {
  spread: {
    id: 'spread',
    label: 'Tri-beam',
    color: '#38bdf8',
    category: 'weapon',
  },
  rapid: {
    id: 'rapid',
    label: 'Overdrive',
    color: '#fbbf24',
    category: 'weapon',
  },
  aegis: {
    id: 'aegis',
    label: 'Aegis shell',
    color: '#a78bfa',
    category: 'defense',
  },
  surge: {
    id: 'surge',
    label: 'Surge thrusters',
    color: '#34d399',
    category: 'mobility',
  },
};

/** Ordered list of type ids for random drops and debug keys. */
export const POWERUP_TYPE_IDS = /** @type {PowerupTypeId[]} */ (
  Object.keys(POWERUP_TYPES)
);

/**
 * @param {string} type
 * @returns {type is PowerupTypeId}
 */
export function isPowerupType(type) {
  return Object.prototype.hasOwnProperty.call(POWERUP_TYPES, type);
}

/**
 * Pick a random power-up type id (uniform).
 * @param {() => number} [rng] returns [0, 1)
 * @returns {PowerupTypeId}
 */
export function randomPowerupType(rng = Math.random) {
  const i = Math.floor(rng() * POWERUP_TYPE_IDS.length) % POWERUP_TYPE_IDS.length;
  return POWERUP_TYPE_IDS[i];
}

/**
 * Create a drifting pickup entity. Never tags as hazard.
 * @param {object} opts
 * @param {PowerupTypeId} opts.type
 * @param {number} opts.x
 * @param {number} opts.y
 * @param {number} [opts.w]
 * @param {number} [opts.h]
 * @returns {object}
 */
export function createPowerupPickup({ type, x, y, w = POWERUP_SIZE, h = POWERUP_SIZE }) {
  if (!isPowerupType(type)) {
    throw new Error(`Unknown power-up type: ${type}`);
  }
  const meta = POWERUP_TYPES[type];
  return createEntity({
    type: 'powerup',
    tags: ['pickup', 'powerup'],
    powerupType: type,
    x,
    y,
    w,
    h,
    vx: POWERUP_DRIFT_VX,
    vy: 0,
    color: meta.color,
    despawnWhenOffscreen: true,
  });
}

/**
 * Apply a power-up to the player per stack/replace rules.
 * @param {object} player ship entity from createPlayer
 * @param {PowerupTypeId | string} type
 * @returns {{ applied: boolean, label: string }}
 */
export function applyPowerup(player, type) {
  if (!player || player.isDead || !player.alive) {
    return { applied: false, label: '' };
  }
  if (!isPowerupType(type)) {
    return { applied: false, label: '' };
  }

  const meta = POWERUP_TYPES[type];
  const label = meta.label;

  if (type === 'spread' || type === 'rapid') {
    player.weaponMode = type;
    return { applied: true, label };
  }

  if (type === 'aegis') {
    const before = player.aegisCharges ?? 0;
    if (before >= AEGIS_MAX_CHARGES) {
      // At cap: no charge increase (still counts as collect for feedback).
      return { applied: true, label };
    }
    player.aegisCharges = Math.min(AEGIS_MAX_CHARGES, before + 1);
    return { applied: true, label };
  }

  if (type === 'surge') {
    const now = player._time ?? 0;
    player.surgeUntil = now + SURGE_DURATION_SEC;
    return { applied: true, label };
  }

  return { applied: false, label: '' };
}

/**
 * Snapshot for HUD drawing.
 * @param {object | null | undefined} player
 * @returns {{ weapon: 'base' | 'spread' | 'rapid', aegisCharges: number, surgeRemaining: number }}
 */
export function getPowerupHudState(player) {
  if (!player) {
    return { weapon: 'base', aegisCharges: 0, surgeRemaining: 0 };
  }
  const mode = player.weaponMode;
  const weapon =
    mode === 'spread' || mode === 'rapid' ? mode : 'base';
  const aegisCharges = Math.max(0, player.aegisCharges ?? 0);
  const until = player.surgeUntil ?? 0;
  const t = player._time ?? 0;
  const surgeRemaining = Math.max(0, until - t);
  return { weapon, aegisCharges, surgeRemaining };
}
