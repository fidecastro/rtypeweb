/**
 * Player ship controller: movement, clamp, health/damage, fire cooldown.
 * Enemies/hazards call takeDamage(); scene uses tryFire for projectiles.
 */

import { createEntity } from '../engine/entity.js';

export const PLAYER_SPEED = 220;
export const PLAYER_W = 36;
export const PLAYER_H = 24;
export const PLAYER_MAX_HP = 3;
/** Seconds of invulnerability after a hit. */
export const PLAYER_INVULN_SEC = 0.75;
/** Minimum seconds between shots. */
export const FIRE_COOLDOWN_SEC = 0.2;
export const PROJECTILE_SPEED = 420;
export const PROJECTILE_W = 12;
export const PROJECTILE_H = 4;
/** Score awarded when a player projectile kills an enemy. */
export const SCORE_ENEMY_KILL = 100;

/**
 * @param {object} opts
 * @param {object} opts.camera
 * @param {ReturnType<import('../engine/input.js').createInput>} opts.input
 * @param {number} opts.viewWidth
 * @param {number} opts.viewHeight
 * @param {number} [opts.maxHp]
 * @returns {object} player entity with controller fields/methods
 */
export function createPlayer({
  camera,
  input,
  viewWidth,
  viewHeight,
  maxHp = PLAYER_MAX_HP,
}) {
  const player = createEntity({
    type: 'player',
    tags: ['player'],
    x: camera.x + viewWidth * 0.22,
    y: viewHeight * 0.5 - PLAYER_H / 2,
    w: PLAYER_W,
    h: PLAYER_H,
    color: '#4ade80',
    despawnWhenOffscreen: false,
    maxHp,
    hp: maxHp,
    /** Game time (seconds) until which player ignores damage. */
    invulnerableUntil: 0,
    fireCooldown: 0,
    /** Accumulated time for invuln / fire (scene advances via updateTimers). */
    _time: 0,
    isDead: false,

    /**
     * @param {number} amount
     * @returns {boolean} true if damage was applied
     */
    takeDamage(amount) {
      if (this.isDead || !this.alive) return false;
      const n = Math.floor(Number(amount));
      if (!Number.isFinite(n) || n <= 0) return false;
      if (this._time < this.invulnerableUntil) return false;

      this.hp = Math.max(0, this.hp - n);
      this.invulnerableUntil = this._time + PLAYER_INVULN_SEC;
      this.color = '#facc15';

      if (this.hp <= 0) {
        this.hp = 0;
        this.isDead = true;
        this.alive = false;
      }
      return true;
    },

    /**
     * @param {number} amount
     */
    heal(amount) {
      if (this.isDead) return;
      const n = Math.floor(Number(amount));
      if (!Number.isFinite(n) || n <= 0) return;
      this.hp = Math.min(this.maxHp, this.hp + n);
    },

    /**
     * @param {number} dt
     */
    updateTimers(dt) {
      this._time += dt;
      if (this.fireCooldown > 0) {
        this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      }
      // Restore ship color when invuln ends (unless dead).
      if (!this.isDead && this._time >= this.invulnerableUntil) {
        this.color = '#4ade80';
      }
    },

    /**
     * Attempt to spawn a projectile. Returns entity or null if on cooldown / dead.
     * @param {object} entities entity list
     * @returns {object | null}
     */
    tryFire(entities) {
      if (this.isDead || !this.alive) return null;
      if (this.fireCooldown > 0) return null;
      if (!input.isDown('fire')) return null;

      this.fireCooldown = FIRE_COOLDOWN_SEC;
      const projectile = createEntity({
        type: 'playerProjectile',
        tags: ['playerProjectile'],
        x: this.x + this.w,
        y: this.y + this.h / 2 - PROJECTILE_H / 2,
        w: PROJECTILE_W,
        h: PROJECTILE_H,
        vx: PROJECTILE_SPEED,
        color: '#7dd3fc',
        despawnWhenOffscreen: true,
      });
      entities.add(projectile);
      return projectile;
    },

    customUpdate(dt) {
      if (this.isDead) return;

      let mx = 0;
      let my = 0;
      if (input.isDown('left')) mx -= 1;
      if (input.isDown('right')) mx += 1;
      if (input.isDown('up')) my -= 1;
      if (input.isDown('down')) my += 1;
      if (mx !== 0 && my !== 0) {
        const inv = 1 / Math.SQRT2;
        mx *= inv;
        my *= inv;
      }
      this.vx = mx * PLAYER_SPEED;
      this.vy = my * PLAYER_SPEED;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Clamp to current camera view band (classic shmup free-flight).
      const pad = 4;
      const minX = camera.x + pad;
      const maxX = camera.x + camera.width - this.w - pad;
      const minY = camera.y + pad;
      const maxY = camera.y + camera.height - this.h - pad;
      if (this.x < minX) this.x = minX;
      if (this.x > maxX) this.x = maxX;
      if (this.y < minY) this.y = minY;
      if (this.y > maxY) this.y = maxY;
    },
  });

  return player;
}
