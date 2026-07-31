/**
 * Layered parallax background — alien invasion / deep space theme.
 * Drawn in screen space using camera.x for scroll offsets (no entities).
 */

import { PALETTE } from './palette.js';
import { fillBlock } from './draw.js';

/** Deterministic pseudo-random in [0,1) from integer seed. */
function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * @param {object} opts
 * @param {number} opts.viewWidth
 * @param {number} opts.viewHeight
 */
export function createParallaxBackground({ viewWidth, viewHeight }) {
  // Precompute star fields (stable, cheap each frame).
  const farStars = [];
  const nearStars = [];
  for (let i = 0; i < 48; i++) {
    farStars.push({
      x: hash01(i * 3 + 1) * viewWidth,
      y: hash01(i * 5 + 2) * viewHeight,
      s: hash01(i * 7 + 3) > 0.7 ? 2 : 1,
    });
  }
  for (let i = 0; i < 28; i++) {
    nearStars.push({
      x: hash01(i * 11 + 9) * viewWidth,
      y: hash01(i * 13 + 4) * viewHeight * 0.85,
      s: hash01(i * 17 + 6) > 0.5 ? 2 : 1,
    });
  }

  // Distant silhouettes (invader hulls / wrecks) as simple block clusters.
  const wrecks = [];
  for (let i = 0; i < 6; i++) {
    wrecks.push({
      x: hash01(i * 19 + 2) * viewWidth * 1.4,
      y: 40 + hash01(i * 23 + 1) * (viewHeight * 0.35),
      w: 40 + hash01(i * 29) * 50,
      h: 16 + hash01(i * 31) * 24,
    });
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ x: number }} camera
   * @param {number} [phaseIndex] optional phase tint
   */
  function render(ctx, camera, phaseIndex = 0) {
    const camX = camera.x || 0;

    // Base void + subtle nebula gradient bands
    ctx.fillStyle = PALETTE.voidDeep;
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    // Nebula wash (phase-tinted)
    const nebulaAlpha = 0.12 + (phaseIndex % 3) * 0.04;
    ctx.fillStyle =
      phaseIndex >= 2
        ? `rgba(124, 58, 237, ${nebulaAlpha})`
        : phaseIndex === 1
          ? `rgba(14, 116, 144, ${nebulaAlpha})`
          : `rgba(88, 28, 135, ${nebulaAlpha})`;
    ctx.fillRect(0, viewHeight * 0.15, viewWidth, viewHeight * 0.45);

    // Far stars — slow scroll
    const farOff = (camX * 0.08) % viewWidth;
    ctx.fillStyle = PALETTE.starDim;
    for (const st of farStars) {
      let sx = st.x - farOff;
      if (sx < 0) sx += viewWidth;
      if (sx > viewWidth) sx -= viewWidth;
      ctx.fillRect(Math.floor(sx), Math.floor(st.y), st.s, st.s);
    }

    // Far mountain / debris ridge
    const ridgeOff = (camX * 0.18) % (viewWidth + 120);
    ctx.fillStyle = PALETTE.mountainFar;
    for (let i = -1; i < 4; i++) {
      const bx = i * 280 - ridgeOff * 0.5;
      drawRidge(ctx, bx, viewHeight * 0.55, 260, 80);
    }

    // Mid wreck silhouettes
    const wreckOff = camX * 0.32;
    ctx.fillStyle = PALETTE.invaderHull;
    for (const w of wrecks) {
      let sx = ((w.x - wreckOff) % (viewWidth + 200) + viewWidth + 200) % (viewWidth + 200) - 80;
      fillBlock(ctx, sx, w.y, w.w, w.h, PALETTE.invaderHull);
      fillBlock(ctx, sx + w.w * 0.2, w.y - 8, w.w * 0.25, 10, PALETTE.invaderGlow);
      // small engine glow
      fillBlock(ctx, sx + w.w - 10, w.y + 4, 8, 6, 'rgba(167, 139, 250, 0.45)');
    }

    // Near stars
    const nearOff = (camX * 0.45) % viewWidth;
    ctx.fillStyle = PALETTE.star;
    for (const st of nearStars) {
      let sx = st.x - nearOff;
      if (sx < 0) sx += viewWidth;
      ctx.fillRect(Math.floor(sx), Math.floor(st.y), st.s, st.s);
    }

    // Near ridge / ground band
    const groundOff = (camX * 0.65) % 160;
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(0, viewHeight - 36, viewWidth, 36);
    ctx.fillStyle = PALETTE.groundEdge;
    for (let gx = -groundOff; gx < viewWidth + 40; gx += 40) {
      fillBlock(ctx, gx, viewHeight - 40, 24, 6, PALETTE.groundEdge);
      fillBlock(ctx, gx + 10, viewHeight - 48, 8, 10, PALETTE.mountainNear);
    }

    // Top ceiling strip (tunnel / orbital ring feel)
    ctx.fillStyle = PALETTE.mountainFar;
    ctx.fillRect(0, 0, viewWidth, 10);
    const ceilOff = (camX * 0.55) % 48;
    ctx.fillStyle = PALETTE.mountainNear;
    for (let cx = -ceilOff; cx < viewWidth; cx += 48) {
      fillBlock(ctx, cx, 8, 20, 6, PALETTE.mountainNear);
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   */
  function drawRidge(ctx, x, y, w, h) {
    // Stepped silhouette
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const hh = h * (0.35 + 0.65 * Math.sin(t * Math.PI));
      ctx.fillRect(x + t * w, y + (h - hh), w / steps + 1, hh);
    }
  }

  return { render };
}
