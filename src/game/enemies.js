/**
 * Enemy factories: distinct movement / attack patterns for the side-scroller.
 * All killable units use tags `enemy` + `hazard` (score on kill, damage on contact).
 * Enemy projectiles use tag `hazard` only (not scoreable / not killable as enemies).
 */

import { createEntity } from '../engine/entity.js';

export const ENEMY_KINDS = ['straight', 'sine', 'aimer'];

/** Default leftward speed (world units / sec). */
export const STRAIGHT_VX = -55;
export const SINE_VX = -50;
export const AIMER_VX = -35;
export const AIMER_TRACK_SPEED = 90;
export const AIMER_FIRE_INTERVAL = 1.35;
export const ENEMY_SHOT_SPEED = 200;

/**
 * Resolve spawn Y from config: fraction of view height (0–1) or absolute pixels.
 * @param {number | undefined} y
 * @param {number} viewHeight
 * @param {number} h entity height
 */
export function resolveSpawnY(y, viewHeight, h) {
  const fallback = viewHeight * 0.5 - h / 2;
  if (y == null || !Number.isFinite(Number(y))) return fallback;
  const n = Number(y);
  // Treat values in [0, 1] as fractions of view height (center of entity).
  if (n >= 0 && n <= 1) {
    return Math.max(0, Math.min(viewHeight - h, n * viewHeight - h / 2));
  }
  return Math.max(0, Math.min(viewHeight - h, n));
}

/**
 * World X just past the right edge of the camera view.
 * @param {{ x: number, width?: number }} camera
 * @param {number} viewWidth
 * @param {number} [margin]
 */
export function spawnXAtRight(camera, viewWidth, margin = 24) {
  const w = camera.width ?? viewWidth;
  return camera.x + w + margin;
}

/**
 * @param {object} opts
 * @param {object} opts.camera
 * @param {number} opts.viewWidth
 * @param {number} opts.viewHeight
 * @param {number} [opts.y] fraction 0–1 or absolute Y
 * @param {number} [opts.vx]
 * @param {number} [opts.w]
 * @param {number} [opts.h]
 * @returns {object}
 */
export function createStraightEnemy(opts) {
  const w = opts.w ?? 28;
  const h = opts.h ?? 28;
  const y = resolveSpawnY(opts.y, opts.viewHeight, h);
  return createEntity({
    type: 'enemy',
    kind: 'straight',
    tags: ['enemy', 'hazard'],
    x: spawnXAtRight(opts.camera, opts.viewWidth),
    y,
    w,
    h,
    vx: opts.vx ?? STRAIGHT_VX,
    vy: 0,
    color: '#c084fc',
    despawnWhenOffscreen: true,
  });
}

/**
 * Leftward flight with vertical sine wave.
 * @param {object} opts
 * @param {object} opts.camera
 * @param {number} opts.viewWidth
 * @param {number} opts.viewHeight
 * @param {number} [opts.y]
 * @param {number} [opts.vx]
 * @param {number} [opts.amplitude] pixels peak offset from base Y
 * @param {number} [opts.frequency] full cycles per second
 * @param {number} [opts.w]
 * @param {number} [opts.h]
 * @returns {object}
 */
export function createSineEnemy(opts) {
  const w = opts.w ?? 26;
  const h = opts.h ?? 26;
  const baseY = resolveSpawnY(opts.y, opts.viewHeight, h);
  const amplitude = opts.amplitude ?? 48;
  const frequency = opts.frequency ?? 0.55;
  const viewHeight = opts.viewHeight;

  return createEntity({
    type: 'enemy',
    kind: 'sine',
    tags: ['enemy', 'hazard'],
    x: spawnXAtRight(opts.camera, opts.viewWidth),
    y: baseY,
    w,
    h,
    vx: opts.vx ?? SINE_VX,
    vy: 0,
    color: '#67e8f9',
    despawnWhenOffscreen: true,
    baseY,
    amplitude,
    frequency,
    _sineT: 0,

    customUpdate(dt) {
      this._sineT += dt;
      this.x += this.vx * dt;
      const wave = Math.sin(this._sineT * this.frequency * Math.PI * 2) * this.amplitude;
      this.y = this.baseY + wave;
      // Soft clamp so sine enemies stay in the play band.
      const pad = 4;
      if (this.y < pad) this.y = pad;
      if (this.y + this.h > viewHeight - pad) this.y = viewHeight - pad - this.h;
    },
  });
}

/**
 * Tracks player Y and fires short-lived hazard projectiles (not tagged enemy).
 * @param {object} opts
 * @param {object} opts.camera
 * @param {number} opts.viewWidth
 * @param {number} opts.viewHeight
 * @param {number} [opts.y]
 * @param {number} [opts.vx]
 * @param {number} [opts.trackSpeed]
 * @param {number} [opts.fireInterval]
 * @param {number} [opts.w]
 * @param {number} [opts.h]
 * @returns {object}
 */
export function createAimerEnemy(opts) {
  const w = opts.w ?? 30;
  const h = opts.h ?? 24;
  const y = resolveSpawnY(opts.y, opts.viewHeight, h);
  const trackSpeed = opts.trackSpeed ?? AIMER_TRACK_SPEED;
  const fireInterval = opts.fireInterval ?? AIMER_FIRE_INTERVAL;
  const viewHeight = opts.viewHeight;

  return createEntity({
    type: 'enemy',
    kind: 'aimer',
    tags: ['enemy', 'hazard'],
    x: spawnXAtRight(opts.camera, opts.viewWidth),
    y,
    w,
    h,
    vx: opts.vx ?? AIMER_VX,
    vy: 0,
    color: '#fb923c',
    despawnWhenOffscreen: true,
    trackSpeed,
    fireInterval,
    fireCooldown: fireInterval * 0.4,

    customUpdate(dt, ctx) {
      this.x += this.vx * dt;

      const player = ctx?.player;
      if (player && player.alive && !player.isDead) {
        const targetY = player.y + player.h / 2 - this.h / 2;
        const dy = targetY - this.y;
        const step = this.trackSpeed * dt;
        if (Math.abs(dy) <= step) {
          this.y = targetY;
        } else {
          this.y += Math.sign(dy) * step;
        }
      }

      const pad = 4;
      if (this.y < pad) this.y = pad;
      if (this.y + this.h > viewHeight - pad) this.y = viewHeight - pad - this.h;

      this.fireCooldown -= dt;
      if (this.fireCooldown > 0) return;
      if (!ctx?.entities) return;

      this.fireCooldown = this.fireInterval;
      const shot = createEnemyProjectile({
        x: this.x - 12,
        y: this.y + this.h / 2 - 3,
        player,
      });
      ctx.entities.add(shot);
    },
  });
}

/**
 * Enemy shot: hazard only (damages player, not killable for score).
 * @param {object} opts
 * @param {number} opts.x
 * @param {number} opts.y
 * @param {object} [opts.player] if present, aim roughly toward player
 * @returns {object}
 */
export function createEnemyProjectile(opts) {
  let vx = -ENEMY_SHOT_SPEED;
  let vy = 0;
  const player = opts.player;
  if (player && player.alive) {
    const cx = opts.x;
    const cy = opts.y + 3;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    const dx = px - cx;
    const dy = py - cy;
    const len = Math.hypot(dx, dy) || 1;
    // Prefer leftward pressure; still bias toward player.
    vx = (dx / len) * ENEMY_SHOT_SPEED;
    vy = (dy / len) * ENEMY_SHOT_SPEED;
    // Ensure shots do not sit still if player is to the right.
    if (vx > -40) vx = -Math.max(ENEMY_SHOT_SPEED * 0.55, Math.abs(vx));
  }

  return createEntity({
    type: 'enemyProjectile',
    kind: 'enemyShot',
    tags: ['hazard'],
    x: opts.x,
    y: opts.y,
    w: 12,
    h: 6,
    vx,
    vy,
    color: '#fb7185',
    despawnWhenOffscreen: true,
  });
}

/**
 * Spawn an enemy by kind name.
 * @param {string} kind
 * @param {object} opts camera, viewWidth, viewHeight, y, amplitude, …
 * @returns {object}
 */
export function spawnEnemy(kind, opts) {
  const k = String(kind || 'straight').toLowerCase();
  if (k === 'sine') return createSineEnemy(opts);
  if (k === 'aimer') return createAimerEnemy(opts);
  return createStraightEnemy(opts);
}
