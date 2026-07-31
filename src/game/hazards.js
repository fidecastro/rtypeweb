/**
 * Environmental hazards / terrain dangers for the side-scroller.
 * Contact damage uses tag `hazard` (playing scene → player.takeDamage).
 * Killable units for score use tag `enemy` only when destructible.
 */

import { createEntity } from '../engine/entity.js';
import { resolveSpawnY, spawnXAtRight } from './enemies.js';
import { attachSpriteRender } from './visuals/sprites.js';

export const HAZARD_KINDS = ['block', 'spike', 'zone'];

/**
 * Solid-ish obstacle block (contact damage, not shot-destructible by default).
 * @param {object} opts
 * @param {object} opts.camera
 * @param {number} opts.viewWidth
 * @param {number} opts.viewHeight
 * @param {number} [opts.y] fraction 0–1 or absolute
 * @param {number} [opts.w]
 * @param {number} [opts.h]
 * @param {boolean} [opts.destructible] if true, tag enemy so shots clear it + score
 * @returns {object}
 */
export function createBlockHazard(opts) {
  const w = opts.w ?? 48;
  const h = opts.h ?? 80;
  const y = resolveSpawnY(opts.y, opts.viewHeight, h);
  const destructible = !!opts.destructible;
  const tags = destructible ? ['hazard', 'enemy'] : ['hazard'];

  return attachSpriteRender(
    createEntity({
      type: 'obstacle',
      kind: 'block',
      tags,
      x: spawnXAtRight(opts.camera, opts.viewWidth, 8),
      y,
      w,
      h,
      vx: 0,
      vy: 0,
      color: destructible ? '#fbbf24' : '#f87171',
      // Scroll with world: stay fixed in world X (camera moves past).
      despawnWhenOffscreen: true,
      hit: false,
      destructible,
    }),
  );
}

/**
 * Spike / narrow damaging protrusion.
 * @param {object} opts
 * @param {object} opts.camera
 * @param {number} opts.viewWidth
 * @param {number} opts.viewHeight
 * @param {number} [opts.y]
 * @param {number} [opts.w]
 * @param {number} [opts.h]
 * @param {boolean} [opts.destructible]
 * @returns {object}
 */
export function createSpikeHazard(opts) {
  const w = opts.w ?? 22;
  const h = opts.h ?? 56;
  const y = resolveSpawnY(opts.y, opts.viewHeight, h);
  const destructible = !!opts.destructible;
  const tags = destructible ? ['hazard', 'enemy'] : ['hazard'];

  return attachSpriteRender(
    createEntity({
      type: 'obstacle',
      kind: 'spike',
      tags,
      x: spawnXAtRight(opts.camera, opts.viewWidth, 8),
      y,
      w,
      h,
      vx: 0,
      vy: 0,
      color: destructible ? '#fde047' : '#e11d48',
      despawnWhenOffscreen: true,
      hit: false,
      destructible,
    }),
  );
}

/**
 * Wider damaging zone (thin vertical slab / field).
 * @param {object} opts
 * @param {object} opts.camera
 * @param {number} opts.viewWidth
 * @param {number} opts.viewHeight
 * @param {number} [opts.y]
 * @param {number} [opts.w]
 * @param {number} [opts.h]
 * @returns {object}
 */
export function createZoneHazard(opts) {
  const w = opts.w ?? 36;
  const h = opts.h ?? 120;
  const y = resolveSpawnY(opts.y, opts.viewHeight, h);

  return attachSpriteRender(
    createEntity({
      type: 'hazardZone',
      kind: 'zone',
      tags: ['hazard'],
      x: spawnXAtRight(opts.camera, opts.viewWidth, 8),
      y,
      w,
      h,
      vx: 0,
      vy: 0,
      color: 'rgba(248, 113, 113, 0.55)',
      despawnWhenOffscreen: true,
      hit: false,
    }),
  );
}

/**
 * Spawn a hazard by kind name.
 * @param {string} kind
 * @param {object} opts
 * @returns {object}
 */
export function spawnHazard(kind, opts) {
  const k = String(kind || 'block').toLowerCase();
  if (k === 'spike') return createSpikeHazard(opts);
  if (k === 'zone') return createZoneHazard(opts);
  return createBlockHazard(opts);
}
