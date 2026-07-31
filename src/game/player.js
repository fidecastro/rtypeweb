/**
 * Player ship controller: movement, clamp, health/damage, fire cooldown.
 * Enemies/hazards call takeDamage(); scene uses tryFire for projectiles.
 * Power-up state (weapon mode, aegis, surge) is applied via src/game/powerups.js.
 */

import { createEntity } from '../engine/entity.js';
import {
  RAPID_COOLDOWN_FACTOR,
  SURGE_SPEED_FACTOR,
} from './powerups.js';

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
/** Half-angle (radians) for Tri-beam side shots. */
const SPREAD_HALF_ANGLE = (12 * Math.PI) / 180;

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
    /** Accumulated time for invuln / fire / surge (scene advances via updateTimers). */
    _time: 0,
    isDead: false,

    // --- Power-up state (see powerups.js rules) ---
    /** @type {'base' | 'spread' | 'rapid'} */
    weaponMode: 'base',
    /** Absorb charges; next damaging hit consumes one instead of HP (cap in powerups). */
    aegisCharges: 0,
    /** Game time when surge ends; inactive when _time >= surgeUntil. */
    surgeUntil: 0,

    /**
     * @returns {boolean}
     */
    hasSurgeActive() {
      return this._time < this.surgeUntil;
    },

    /**
     * Current move speed (base or surge-boosted).
     * @returns {number}
     */
    getMoveSpeed() {
      return this.hasSurgeActive()
        ? PLAYER_SPEED * SURGE_SPEED_FACTOR
        : PLAYER_SPEED;
    },

    /**
     * Current fire cooldown in seconds (base or Overdrive-reduced).
     * @returns {number}
     */
    getFireCooldown() {
      if (this.weaponMode === 'rapid') {
        return FIRE_COOLDOWN_SEC * RAPID_COOLDOWN_FACTOR;
      }
      return FIRE_COOLDOWN_SEC;
    },

    /**
     * Apply damage, or absorb with Aegis.
     * Contract: returns true only when HP was reduced (or death applied).
     * Aegis absorb: consumes one charge, no HP loss, grants the same
     * PLAYER_INVULN_SEC hit window as a normal hit so continuous hazard
     * overlap burns at most one charge per contact (not per frame), returns false.
     * Empty aegis + invuln: still blocked as before.
     * @param {number} amount
     * @returns {boolean} true if damage was applied
     */
    takeDamage(amount) {
      if (this.isDead || !this.alive) return false;
      const n = Math.floor(Number(amount));
      if (!Number.isFinite(n) || n <= 0) return false;
      if (this._time < this.invulnerableUntil) return false;

      // Aegis: negate hit and grant hit-window invuln so multi-frame overlap
      // does not burn every charge in a few frames (see powerups.js rules).
      if (this.aegisCharges > 0) {
        this.aegisCharges -= 1;
        this.invulnerableUntil = this._time + PLAYER_INVULN_SEC;
        this.color = '#c4b5fd';
        return false;
      }

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
      // Covers both normal-hit flash and Aegis absorb flash.
      if (!this.isDead && this._time >= this.invulnerableUntil) {
        this.color = this.hasSurgeActive() ? '#6ee7b7' : '#4ade80';
      }
    },

    /**
     * Spawn one projectile at (x,y) with velocity (vx, vy).
     * @param {object} entities
     * @param {number} x
     * @param {number} y
     * @param {number} vx
     * @param {number} vy
     * @returns {object}
     */
    _spawnProjectile(entities, x, y, vx, vy) {
      const projectile = createEntity({
        type: 'playerProjectile',
        tags: ['playerProjectile'],
        x,
        y,
        w: PROJECTILE_W,
        h: PROJECTILE_H,
        vx,
        vy,
        color: '#7dd3fc',
        despawnWhenOffscreen: true,
      });
      entities.add(projectile);
      return projectile;
    },

    /**
     * Attempt to spawn projectile(s). Returns primary projectile or null if
     * on cooldown / dead. Under Tri-beam (`spread`), three shots are added;
     * the center shot is returned.
     * @param {object} entities entity list
     * @returns {object | null}
     */
    tryFire(entities) {
      if (this.isDead || !this.alive) return null;
      if (this.fireCooldown > 0) return null;
      if (!input.isDown('fire')) return null;

      this.fireCooldown = this.getFireCooldown();
      const baseX = this.x + this.w;
      const baseY = this.y + this.h / 2 - PROJECTILE_H / 2;

      if (this.weaponMode === 'spread') {
        const cos = Math.cos(SPREAD_HALF_ANGLE);
        const sin = Math.sin(SPREAD_HALF_ANGLE);
        const center = this._spawnProjectile(
          entities,
          baseX,
          baseY,
          PROJECTILE_SPEED,
          0,
        );
        this._spawnProjectile(
          entities,
          baseX,
          baseY,
          PROJECTILE_SPEED * cos,
          -PROJECTILE_SPEED * sin,
        );
        this._spawnProjectile(
          entities,
          baseX,
          baseY,
          PROJECTILE_SPEED * cos,
          PROJECTILE_SPEED * sin,
        );
        return center;
      }

      return this._spawnProjectile(
        entities,
        baseX,
        baseY,
        PROJECTILE_SPEED,
        0,
      );
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
      const speed = this.getMoveSpeed();
      this.vx = mx * speed;
      this.vy = my * speed;
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
