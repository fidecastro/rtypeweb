/**
 * Multi-phase boss factories for phase-end encounters.
 * Bosses use tags `enemy` + `hazard` + `boss`; multi-hit via numeric `hp`.
 * Shots / zones are `hazard` only (not scoreable). Placeholder colored rects.
 */

import { createEntity } from '../engine/entity.js';
import { createEnemyProjectile } from './enemies.js';

/** Boss ids keyed from stages.json / DEFAULT_STAGES. */
export const BOSS_KINDS = ['harvester', 'interceptor', 'overmind'];

/** Score awards by boss kind (≫ SCORE_ENEMY_KILL). */
export const BOSS_SCORES = {
  harvester: 2000,
  interceptor: 3500,
  overmind: 5000,
};

/** Default HP per boss (multi-hit). */
export const BOSS_HP = {
  harvester: 24,
  interceptor: 32,
  overmind: 40,
};

const BOSS_SHOT_SPEED = 210;
const INTRO_SEC = 1.0;
const DYING_SEC = 0.55;

/**
 * @param {string | undefined} kind
 * @returns {number}
 */
export function bossScoreFor(kind) {
  const k = String(kind || '').toLowerCase();
  return BOSS_SCORES[k] ?? 2000;
}

/**
 * @param {string | undefined} kind
 * @returns {number}
 */
export function bossHpFor(kind) {
  const k = String(kind || '').toLowerCase();
  return BOSS_HP[k] ?? 24;
}

/**
 * Map phase index / stage boss id → factory kind.
 * @param {string | number | undefined} idOrIndex
 * @returns {string}
 */
export function resolveBossKind(idOrIndex) {
  if (typeof idOrIndex === 'number' && Number.isFinite(idOrIndex)) {
    return BOSS_KINDS[Math.max(0, Math.min(BOSS_KINDS.length - 1, idOrIndex))] || 'harvester';
  }
  const k = String(idOrIndex || 'harvester').toLowerCase();
  if (BOSS_KINDS.includes(k)) return k;
  return 'harvester';
}

/**
 * Boss projectile (hazard only).
 * @param {object} opts
 * @param {number} opts.x
 * @param {number} opts.y
 * @param {number} [opts.vx]
 * @param {number} [opts.vy]
 * @param {number} [opts.w]
 * @param {number} [opts.h]
 * @param {string} [opts.color]
 * @returns {object}
 */
export function createBossProjectile(opts) {
  return createEntity({
    type: 'enemyProjectile',
    kind: 'bossShot',
    tags: ['hazard'],
    x: opts.x,
    y: opts.y,
    w: opts.w ?? 14,
    h: opts.h ?? 8,
    vx: opts.vx ?? -BOSS_SHOT_SPEED,
    vy: opts.vy ?? 0,
    color: opts.color ?? '#f472b6',
    despawnWhenOffscreen: true,
  });
}

/**
 * Temporary damaging zone (hazard only, timed).
 * @param {object} opts
 * @param {number} opts.x
 * @param {number} opts.y
 * @param {number} [opts.w]
 * @param {number} [opts.h]
 * @param {number} [opts.life] seconds
 * @returns {object}
 */
export function createBossZone(opts) {
  const life = opts.life ?? 1.4;
  return createEntity({
    type: 'hazardZone',
    kind: 'bossZone',
    tags: ['hazard'],
    x: opts.x,
    y: opts.y,
    w: opts.w ?? 40,
    h: opts.h ?? 100,
    vx: opts.vx ?? -30,
    vy: 0,
    color: 'rgba(192, 132, 252, 0.55)',
    despawnWhenOffscreen: true,
    _life: life,
    customUpdate(dt) {
      this._life -= dt;
      this.x += this.vx * dt;
      if (this._life <= 0) this.alive = false;
      // Pulse alpha via color for readability.
      const a = 0.35 + 0.25 * Math.sin(this._life * 10);
      this.color = `rgba(192, 132, 252, ${a.toFixed(2)})`;
    },
  });
}

/**
 * Shared HP-phase helpers: 3 combat phases at 100/66/33% HP.
 * @param {object} boss
 * @returns {1 | 2 | 3}
 */
function combatPhaseFromHp(boss) {
  const max = boss.maxHp || 1;
  const ratio = boss.hp / max;
  if (ratio <= 1 / 3) return 3;
  if (ratio <= 2 / 3) return 2;
  return 1;
}

/**
 * Clamp boss into camera view band (right half preferred).
 * @param {object} boss
 * @param {object} camera
 * @param {number} viewHeight
 * @param {number} [minFracX]
 * @param {number} [maxFracX]
 */
function clampBossInView(boss, camera, viewHeight, minFracX = 0.55, maxFracX = 0.92) {
  const pad = 4;
  const minX = camera.x + camera.width * minFracX;
  const maxX = camera.x + camera.width * maxFracX - boss.w;
  const minY = pad;
  const maxY = viewHeight - boss.h - pad;
  if (boss.x < minX) boss.x = minX;
  if (boss.x > maxX) boss.x = maxX;
  if (boss.y < minY) boss.y = minY;
  if (boss.y > maxY) boss.y = maxY;
}

/**
 * Phase-1 boss: Harvester — large magenta block, volleys + charge.
 * @param {object} opts
 * @param {object} opts.camera
 * @param {number} opts.viewWidth
 * @param {number} opts.viewHeight
 * @param {number} [opts.hp]
 * @returns {object}
 */
export function createHarvesterBoss(opts) {
  const camera = opts.camera;
  const viewHeight = opts.viewHeight;
  const viewWidth = opts.viewWidth;
  const w = 72;
  const h = 88;
  const maxHp = opts.hp ?? BOSS_HP.harvester;
  const homeX = camera.x + viewWidth * 0.72;

  return createEntity({
    type: 'boss',
    kind: 'harvester',
    tags: ['enemy', 'hazard', 'boss'],
    x: homeX,
    y: viewHeight * 0.5 - h / 2,
    w,
    h,
    vx: 0,
    vy: 0,
    color: '#c026d3',
    baseColor: '#c026d3',
    openColor: '#f0abfc',
    telegraphColor: '#fbbf24',
    despawnWhenOffscreen: false,
    maxHp,
    hp: maxHp,
    scoreValue: BOSS_SCORES.harvester,
    bossState: 'intro',
    combatPhase: 1,
    stateT: 0,
    introT: INTRO_SEC,
    dyingT: 0,
    fireCd: 0.8,
    chargeT: 0,
    charging: false,
    sineT: 0,
    baseY: viewHeight * 0.5 - h / 2,
    homeX,

    customUpdate(dt, ctx) {
      this.stateT += dt;
      this.combatPhase = combatPhaseFromHp(this);

      if (this.bossState === 'intro') {
        this.introT -= dt;
        // Slide in from the right.
        const target = this.homeX;
        this.x += (target - this.x) * Math.min(1, dt * 3);
        this.color =
          Math.floor(this.stateT * 8) % 2 === 0 ? this.telegraphColor : this.baseColor;
        if (this.introT <= 0) {
          this.bossState = 'fight';
          this.color = this.baseColor;
          this.fireCd = 0.4;
        }
        clampBossInView(this, camera, viewHeight);
        return;
      }

      if (this.bossState === 'dying') {
        this.dyingT -= dt;
        this.color =
          Math.floor(this.stateT * 16) % 2 === 0 ? '#fef08a' : '#c026d3';
        if (this.dyingT <= 0) {
          this.alive = false;
        }
        return;
      }

      // Fight: always damageable; telegraphs via color.
      const phase = this.combatPhase;
      this.sineT += dt;

      if (this.charging) {
        this.chargeT -= dt;
        this.x += this.vx * dt;
        this.color = this.telegraphColor;
        if (this.chargeT <= 0) {
          this.charging = false;
          this.vx = 0;
          this.x = this.homeX;
          this.color = this.openColor;
          this.fireCd = 0.9;
        }
        clampBossInView(this, camera, viewHeight, 0.25, 0.95);
        return;
      }

      // Vertical track / sine by phase.
      const player = ctx?.player;
      if (phase === 1) {
        if (player && player.alive && !player.isDead) {
          const ty = player.y + player.h / 2 - this.h / 2;
          this.y += Math.sign(ty - this.y) * Math.min(Math.abs(ty - this.y), 70 * dt);
        }
      } else {
        const amp = phase === 2 ? 55 : 70;
        this.y = this.baseY + Math.sin(this.sineT * 1.4) * amp;
      }

      // Phase 3: occasional charge left then return.
      if (phase === 3 && this.fireCd <= 0.05 && Math.sin(this.sineT * 0.7) > 0.92) {
        this.charging = true;
        this.chargeT = 0.85;
        this.vx = -220;
        this.color = this.telegraphColor;
        clampBossInView(this, camera, viewHeight);
        return;
      }

      this.fireCd -= dt;
      // Wind-up flash before volley.
      if (this.fireCd < 0.35 && this.fireCd > 0) {
        this.color = this.telegraphColor;
      } else if (this.fireCd <= 0) {
        this.color = this.openColor;
        const interval = phase === 1 ? 1.6 : phase === 2 ? 1.15 : 0.9;
        this.fireCd = interval;
        if (ctx?.entities) {
          const n = phase === 1 ? 2 : phase === 2 ? 3 : 4;
          const spread = phase === 1 ? 28 : 36;
          for (let i = 0; i < n; i++) {
            const oy = (i - (n - 1) / 2) * spread;
            ctx.entities.add(
              createBossProjectile({
                x: this.x - 16,
                y: this.y + this.h / 2 - 4 + oy,
                vx: -BOSS_SHOT_SPEED - (phase - 1) * 20,
                vy: oy * 0.35,
                color: '#e879f9',
              }),
            );
          }
        }
      } else {
        this.color = this.baseColor;
      }

      this.x = this.homeX;
      clampBossInView(this, camera, viewHeight);
    },

    /** Call when hp reaches 0 from combat resolution. */
    beginDeath() {
      if (this.bossState === 'dying') return;
      this.bossState = 'dying';
      this.dyingT = DYING_SEC;
      this.vx = 0;
      this.vy = 0;
      this.charging = false;
    },
  });
}

/**
 * Phase-2 boss: Interceptor — tall cyan core, aimed / spread / ring shots.
 * @param {object} opts
 * @param {object} opts.camera
 * @param {number} opts.viewWidth
 * @param {number} opts.viewHeight
 * @param {number} [opts.hp]
 * @returns {object}
 */
export function createInterceptorBoss(opts) {
  const camera = opts.camera;
  const viewHeight = opts.viewHeight;
  const viewWidth = opts.viewWidth;
  const w = 48;
  const h = 110;
  const maxHp = opts.hp ?? BOSS_HP.interceptor;
  const homeX = camera.x + viewWidth * 0.78;

  return createEntity({
    type: 'boss',
    kind: 'interceptor',
    tags: ['enemy', 'hazard', 'boss'],
    x: homeX,
    y: viewHeight * 0.5 - h / 2,
    w,
    h,
    vx: 0,
    vy: 0,
    color: '#06b6d4',
    baseColor: '#06b6d4',
    openColor: '#a5f3fc',
    telegraphColor: '#fbbf24',
    despawnWhenOffscreen: false,
    maxHp,
    hp: maxHp,
    scoreValue: BOSS_SCORES.interceptor,
    bossState: 'intro',
    combatPhase: 1,
    stateT: 0,
    introT: INTRO_SEC,
    dyingT: 0,
    fireCd: 0.7,
    dashT: 0,
    dashing: false,
    sweepDir: 1,
    homeX,

    customUpdate(dt, ctx) {
      this.stateT += dt;
      this.combatPhase = combatPhaseFromHp(this);
      const phase = this.combatPhase;

      if (this.bossState === 'intro') {
        this.introT -= dt;
        this.x += (this.homeX - this.x) * Math.min(1, dt * 3);
        this.color =
          Math.floor(this.stateT * 8) % 2 === 0 ? this.telegraphColor : this.baseColor;
        if (this.introT <= 0) {
          this.bossState = 'fight';
          this.color = this.baseColor;
        }
        clampBossInView(this, camera, viewHeight);
        return;
      }

      if (this.bossState === 'dying') {
        this.dyingT -= dt;
        this.color =
          Math.floor(this.stateT * 16) % 2 === 0 ? '#ecfeff' : '#06b6d4';
        if (this.dyingT <= 0) this.alive = false;
        return;
      }

      // Pre-dash telegraph + vertical dash.
      if (this.dashing) {
        this.dashT -= dt;
        this.y += this.vy * dt;
        this.w = 56;
        this.color = this.telegraphColor;
        if (this.dashT <= 0) {
          this.dashing = false;
          this.vy = 0;
          this.w = 48;
          this.color = this.openColor;
          this.fireCd = 0.5;
        }
        clampBossInView(this, camera, viewHeight, 0.5, 0.95);
        return;
      }

      // Vertical sweep.
      const speed = phase === 1 ? 95 : phase === 2 ? 120 : 150;
      this.y += this.sweepDir * speed * dt;
      if (this.y <= 8) {
        this.y = 8;
        this.sweepDir = 1;
      } else if (this.y + this.h >= viewHeight - 8) {
        this.y = viewHeight - 8 - this.h;
        this.sweepDir = -1;
      }

      // Occasional dash telegraph (phase 2+).
      if (phase >= 2 && this.fireCd < 0.2 && Math.random() < dt * 0.35) {
        this.dashing = true;
        this.dashT = 0.45;
        this.vy = this.sweepDir * 280;
        this.color = this.telegraphColor;
        this.w = 60;
        clampBossInView(this, camera, viewHeight);
        return;
      }

      this.fireCd -= dt;
      if (this.fireCd < 0.3 && this.fireCd > 0) {
        this.color = this.telegraphColor;
      } else if (this.fireCd <= 0) {
        this.color = this.openColor;
        this.fireCd = phase === 1 ? 1.25 : phase === 2 ? 1.0 : 0.75;
        if (ctx?.entities) {
          const player = ctx.player;
          if (phase === 1) {
            // Aimed shot (reuse aimer-style projectile).
            ctx.entities.add(
              createEnemyProjectile({
                x: this.x - 14,
                y: this.y + this.h / 2 - 3,
                player,
              }),
            );
          } else if (phase === 2) {
            // Dual-angle spread.
            for (const ang of [-0.35, 0.35]) {
              const sp = BOSS_SHOT_SPEED;
              ctx.entities.add(
                createBossProjectile({
                  x: this.x - 14,
                  y: this.y + this.h / 2 - 4,
                  vx: -Math.cos(ang) * sp,
                  vy: Math.sin(ang) * sp,
                  color: '#22d3ee',
                }),
              );
            }
          } else {
            // Ring / cross of bolts.
            const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, -Math.PI / 4];
            for (const a of angles) {
              const sp = BOSS_SHOT_SPEED * 0.95;
              ctx.entities.add(
                createBossProjectile({
                  x: this.x + this.w / 2 - 6,
                  y: this.y + this.h / 2 - 4,
                  vx: Math.cos(a) * sp,
                  vy: Math.sin(a) * sp,
                  w: 10,
                  h: 10,
                  color: '#67e8f9',
                }),
              );
            }
          }
        }
      } else {
        this.color = this.baseColor;
      }

      this.x = this.homeX;
      clampBossInView(this, camera, viewHeight);
    },

    beginDeath() {
      if (this.bossState === 'dying') return;
      this.bossState = 'dying';
      this.dyingT = DYING_SEC;
      this.dashing = false;
      this.vx = 0;
      this.vy = 0;
    },
  });
}

/**
 * Phase-3 boss: Overmind — largest, core + shell visual, zones + barrages.
 * @param {object} opts
 * @param {object} opts.camera
 * @param {number} opts.viewWidth
 * @param {number} opts.viewHeight
 * @param {number} [opts.hp]
 * @returns {object}
 */
export function createOvermindBoss(opts) {
  const camera = opts.camera;
  const viewHeight = opts.viewHeight;
  const viewWidth = opts.viewWidth;
  const w = 96;
  const h = 96;
  const maxHp = opts.hp ?? BOSS_HP.overmind;
  const cx0 = camera.x + viewWidth * 0.74;
  const cy0 = viewHeight * 0.5;

  return createEntity({
    type: 'boss',
    kind: 'overmind',
    tags: ['enemy', 'hazard', 'boss'],
    x: cx0 - w / 2,
    y: cy0 - h / 2,
    w,
    h,
    vx: 0,
    vy: 0,
    color: '#7c3aed',
    baseColor: '#7c3aed',
    openColor: '#c4b5fd',
    telegraphColor: '#fbbf24',
    coreColor: '#f5d0fe',
    despawnWhenOffscreen: false,
    maxHp,
    hp: maxHp,
    scoreValue: BOSS_SCORES.overmind,
    bossState: 'intro',
    combatPhase: 1,
    stateT: 0,
    introT: INTRO_SEC + 0.2,
    dyingT: 0,
    fireCd: 1.0,
    orbitT: 0,
    orbitR: 28,
    contactScale: 1,
    homeCx: cx0,
    homeCy: cy0,

    customUpdate(dt, ctx) {
      this.stateT += dt;
      this.orbitT += dt;
      this.combatPhase = combatPhaseFromHp(this);
      const phase = this.combatPhase;

      if (this.bossState === 'intro') {
        this.introT -= dt;
        this.color =
          Math.floor(this.stateT * 8) % 2 === 0 ? this.telegraphColor : this.baseColor;
        if (this.introT <= 0) {
          this.bossState = 'fight';
          this.color = this.baseColor;
        }
        return;
      }

      if (this.bossState === 'dying') {
        this.dyingT -= dt;
        this.color =
          Math.floor(this.stateT * 18) % 2 === 0 ? '#fef9c3' : '#7c3aed';
        if (this.dyingT <= 0) this.alive = false;
        return;
      }

      // Slow orbit / figure motion in right half.
      const r = phase === 3 ? this.orbitR + 12 : this.orbitR;
      const ox = Math.cos(this.orbitT * 0.7) * r;
      const oy = Math.sin(this.orbitT * 1.1) * (r * 1.6);
      this.x = this.homeCx + ox - this.w / 2;
      this.y = this.homeCy + oy - this.h / 2;

      // Enrage: larger hurtbox visual in phase 3.
      if (phase === 3) {
        this.contactScale = 1.15;
        this.w = 96 * 1.08;
        this.h = 96 * 1.08;
      } else {
        this.contactScale = 1;
        this.w = 96;
        this.h = 96;
      }

      this.fireCd -= dt;
      if (this.fireCd < 0.4 && this.fireCd > 0) {
        this.color = this.telegraphColor;
      } else if (this.fireCd <= 0) {
        this.color = this.openColor;
        const interval = phase === 1 ? 1.7 : phase === 2 ? 1.2 : 0.85;
        this.fireCd = interval;
        if (ctx?.entities) {
          if (phase === 1) {
            // Zone pulses.
            const zy = [0.25, 0.55, 0.8][Math.floor(this.orbitT * 3) % 3];
            ctx.entities.add(
              createBossZone({
                x: camera.x + viewWidth * 0.35,
                y: viewHeight * zy - 50,
                w: 48,
                h: 110,
                life: 1.6,
                vx: -40,
              }),
            );
          } else if (phase === 2) {
            // Alternating high/low barrages + spiral-ish.
            const high = Math.floor(this.orbitT * 2) % 2 === 0;
            for (let i = 0; i < 5; i++) {
              const t = i / 4;
              ctx.entities.add(
                createBossProjectile({
                  x: this.x - 10,
                  y: high
                    ? viewHeight * 0.15 + t * 40
                    : viewHeight * 0.75 - t * 40,
                  vx: -BOSS_SHOT_SPEED - i * 8,
                  vy: high ? 40 : -40,
                  color: '#a78bfa',
                }),
              );
            }
          } else {
            // Enrage: denser spiral.
            for (let i = 0; i < 8; i++) {
              const a = this.orbitT * 3 + (i / 8) * Math.PI * 2;
              const sp = BOSS_SHOT_SPEED * 0.9;
              ctx.entities.add(
                createBossProjectile({
                  x: this.x + this.w / 2 - 6,
                  y: this.y + this.h / 2 - 4,
                  vx: Math.cos(a) * sp,
                  vy: Math.sin(a) * sp,
                  w: 11,
                  h: 11,
                  color: '#ddd6fe',
                }),
              );
            }
          }
        }
      } else {
        // Core brightens ("open") shortly after each volley.
        this.color = this.fireCd > 0.85 ? this.openColor : this.baseColor;
      }

      clampBossInView(this, camera, viewHeight, 0.5, 0.95);
    },

    customRender(ctx2d, cam) {
      if (!this.alive) return;
      const { x, y } = cam.worldToScreen(this.x, this.y);
      // Shell.
      ctx2d.fillStyle = this.color;
      ctx2d.fillRect(x, y, this.w, this.h);
      // Inner core (readable multi-segment placeholder).
      const inset = 18;
      ctx2d.fillStyle = this.bossState === 'fight' ? this.coreColor : '#e9d5ff';
      ctx2d.fillRect(x + inset, y + inset, this.w - inset * 2, this.h - inset * 2);
      // Side nodes.
      ctx2d.fillStyle = '#4c1d95';
      ctx2d.fillRect(x - 8, y + this.h * 0.2, 12, 16);
      ctx2d.fillRect(x - 8, y + this.h * 0.65, 12, 16);
      ctx2d.fillRect(x + this.w - 4, y + this.h * 0.4, 12, 18);
    },

    beginDeath() {
      if (this.bossState === 'dying') return;
      this.bossState = 'dying';
      this.dyingT = DYING_SEC + 0.15;
      this.vx = 0;
      this.vy = 0;
    },
  });
}

/**
 * Create a boss by kind name.
 * @param {string} kind
 * @param {object} opts camera, viewWidth, viewHeight, hp?
 * @returns {object}
 */
export function createBoss(kind, opts) {
  const k = resolveBossKind(kind);
  if (k === 'interceptor') return createInterceptorBoss(opts);
  if (k === 'overmind') return createOvermindBoss(opts);
  return createHarvesterBoss(opts);
}

/**
 * Spawn the boss for a stage phase index (0-based).
 * @param {number} phaseIndex
 * @param {object} opts
 * @param {string} [opts.bossId] override kind from stage data
 * @returns {object}
 */
export function spawnBossForPhase(phaseIndex, opts) {
  const kind = opts.bossId
    ? resolveBossKind(opts.bossId)
    : resolveBossKind(phaseIndex);
  return createBoss(kind, opts);
}
