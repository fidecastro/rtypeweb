/**
 * Lightweight combat VFX: particles, explosions, muzzle flashes, screen feel.
 * Cap counts so mid-combat stays smooth on typical laptop browsers.
 */

import { PALETTE } from './palette.js';
import { fillBlock, fillDisk } from './draw.js';

/** Hard caps for performance. */
const MAX_PARTICLES = 96;
const MAX_FLASHES = 8;

/**
 * Create a reusable effects layer for the playing scene.
 */
export function createFxSystem() {
  /** @type {object[]} */
  const particles = [];
  /** @type {object[]} */
  const flashes = [];
  /** Screen shake residual (seconds, magnitude). */
  let shakeT = 0;
  let shakeMag = 0;
  /** Full-screen flash residual. */
  let screenFlashT = 0;
  let screenFlashColor = 'rgba(255,255,255,0.2)';

  /**
   * @param {object} p
   */
  function addParticle(p) {
    if (particles.length >= MAX_PARTICLES) {
      // Drop oldest
      particles.shift();
    }
    particles.push(p);
  }

  /**
   * Burst of sparks / debris at world position.
   * @param {number} x
   * @param {number} y
   * @param {object} [opts]
   * @param {number} [opts.count]
   * @param {string} [opts.color]
   * @param {number} [opts.speed]
   * @param {number} [opts.life]
   * @param {number} [opts.size]
   */
  function spawnSparks(x, y, opts = {}) {
    const count = opts.count ?? 8;
    const speed = opts.speed ?? 140;
    const life = opts.life ?? 0.35;
    const size = opts.size ?? 3;
    const color = opts.color ?? PALETTE.spark;
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const sp = speed * (0.45 + Math.random() * 0.7);
      addParticle({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life,
        maxLife: life,
        size: size + (Math.random() > 0.5 ? 1 : 0),
        color,
      });
    }
  }

  /**
   * Explosion ring + debris (enemy / boss death).
   * @param {number} x
   * @param {number} y
   * @param {object} [opts]
   * @param {number} [opts.radius]
   * @param {boolean} [opts.big]
   */
  function spawnExplosion(x, y, opts = {}) {
    const big = !!opts.big;
    const radius = opts.radius ?? (big ? 28 : 16);
    addParticle({
      kind: 'boom',
      x,
      y,
      vx: 0,
      vy: 0,
      life: big ? 0.55 : 0.38,
      maxLife: big ? 0.55 : 0.38,
      size: radius,
      color: PALETTE.explodeYellow,
      color2: PALETTE.explodeOrange,
    });
    spawnSparks(x, y, {
      count: big ? 14 : 8,
      speed: big ? 200 : 150,
      life: big ? 0.45 : 0.3,
      color: PALETTE.explodeYellow,
      size: big ? 4 : 3,
    });
    // Secondary darker debris
    spawnSparks(x, y, {
      count: big ? 8 : 4,
      speed: big ? 120 : 90,
      life: 0.4,
      color: PALETTE.explodeRed,
      size: 2,
    });
  }

  /**
   * Brief muzzle flash at gun tip (screen-readable, short life).
   * @param {number} x
   * @param {number} y
   */
  function spawnMuzzleFlash(x, y) {
    if (flashes.length >= MAX_FLASHES) flashes.shift();
    flashes.push({
      x,
      y,
      life: 0.07,
      maxLife: 0.07,
      size: 10,
    });
    spawnSparks(x, y, {
      count: 3,
      speed: 80,
      life: 0.12,
      color: PALETTE.muzzle,
      size: 2,
    });
  }

  /**
   * Hit spark when a projectile lands.
   * @param {number} x
   * @param {number} y
   */
  function spawnHitSpark(x, y) {
    spawnSparks(x, y, {
      count: 5,
      speed: 110,
      life: 0.22,
      color: PALETTE.sparkHot,
      size: 2,
    });
  }

  /**
   * Collect pulse at pickup.
   * @param {number} x
   * @param {number} y
   * @param {string} [color]
   */
  function spawnCollectBurst(x, y, color = PALETTE.collectGlow) {
    spawnSparks(x, y, {
      count: 10,
      speed: 100,
      life: 0.4,
      color,
      size: 3,
    });
  }

  /**
   * @param {number} magnitude pixels
   * @param {number} duration seconds
   */
  function shake(magnitude = 4, duration = 0.18) {
    shakeMag = Math.max(shakeMag, magnitude);
    shakeT = Math.max(shakeT, duration);
  }

  /**
   * @param {string} color rgba
   * @param {number} duration
   */
  function flashScreen(color = 'rgba(255,255,255,0.18)', duration = 0.12) {
    screenFlashColor = color;
    screenFlashT = Math.max(screenFlashT, duration);
  }

  /**
   * @param {number} dt
   */
  function update(dt) {
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt);
      if (shakeT === 0) shakeMag = 0;
    }
    if (screenFlashT > 0) {
      screenFlashT = Math.max(0, screenFlashT - dt);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      if (p.kind !== 'boom') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // Light drag
        p.vx *= 1 - Math.min(1, 3 * dt);
        p.vy *= 1 - Math.min(1, 3 * dt);
      }
    }

    for (let i = flashes.length - 1; i >= 0; i--) {
      flashes[i].life -= dt;
      if (flashes[i].life <= 0) flashes.splice(i, 1);
    }
  }

  /**
   * Current camera shake offset (screen space).
   * @returns {{ x: number, y: number }}
   */
  function getShakeOffset() {
    if (shakeT <= 0 || shakeMag <= 0) return { x: 0, y: 0 };
    const falloff = shakeT > 0.05 ? 1 : shakeT / 0.05;
    const m = shakeMag * falloff;
    return {
      x: (Math.random() * 2 - 1) * m,
      y: (Math.random() * 2 - 1) * m,
    };
  }

  /**
   * Draw world-space particles (call after camera transform / with world→screen).
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ worldToScreen: (x:number,y:number)=>{x:number,y:number} }} camera
   */
  function render(ctx, camera) {
    for (const p of particles) {
      const { x, y } = camera.worldToScreen(p.x, p.y);
      const t = p.life / p.maxLife;
      if (p.kind === 'boom') {
        const r = p.size * (1.15 - t * 0.4);
        fillDisk(ctx, x, y, r, p.color2 || PALETTE.explodeOrange);
        fillDisk(ctx, x, y, r * 0.55, p.color || PALETTE.explodeYellow);
        if (t > 0.5) {
          fillDisk(ctx, x, y, r * 0.25, PALETTE.sparkHot);
        }
      } else {
        const s = Math.max(1, Math.round(p.size * (0.5 + t * 0.5)));
        fillBlock(ctx, x - s / 2, y - s / 2, s, s, p.color);
      }
    }

    for (const f of flashes) {
      const { x, y } = camera.worldToScreen(f.x, f.y);
      const t = f.life / f.maxLife;
      const s = f.size * (0.6 + t * 0.6);
      fillDisk(ctx, x, y, s, PALETTE.muzzle);
      fillDisk(ctx, x, y, s * 0.45, PALETTE.muzzleCore);
    }
  }

  /**
   * Screen-space overlay (flash). Call in screen space after world draw.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} viewWidth
   * @param {number} viewHeight
   */
  function renderScreen(ctx, viewWidth, viewHeight) {
    if (screenFlashT > 0) {
      ctx.fillStyle = screenFlashColor;
      ctx.fillRect(0, 0, viewWidth, viewHeight);
    }
  }

  function clear() {
    particles.length = 0;
    flashes.length = 0;
    shakeT = 0;
    shakeMag = 0;
    screenFlashT = 0;
  }

  /**
   * Diagnostics for smoke tests.
   */
  function stats() {
    return {
      particles: particles.length,
      flashes: flashes.length,
      shakeT,
      screenFlashT,
    };
  }

  return {
    spawnSparks,
    spawnExplosion,
    spawnMuzzleFlash,
    spawnHitSpark,
    spawnCollectBurst,
    shake,
    flashScreen,
    update,
    getShakeOffset,
    render,
    renderScreen,
    clear,
    stats,
  };
}
