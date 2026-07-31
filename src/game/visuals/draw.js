/**
 * Low-level pixel-art style drawing helpers for the canvas 2D path.
 * Prefer integer block fills over smoothed paths for a 16-bit feel.
 */

import { PIXEL } from './palette.js';

/**
 * Disable image smoothing for crisp pixel edges.
 * @param {CanvasRenderingContext2D} ctx
 */
export function enablePixelMode(ctx) {
  ctx.imageSmoothingEnabled = false;
  // Vendor-prefixed fallbacks for older engines.
  // @ts-ignore
  if (ctx.webkitImageSmoothingEnabled !== undefined) {
    // @ts-ignore
    ctx.webkitImageSmoothingEnabled = false;
  }
  // @ts-ignore
  if (ctx.mozImageSmoothingEnabled !== undefined) {
    // @ts-ignore
    ctx.mozImageSmoothingEnabled = false;
  }
}

/**
 * Snap a screen coordinate to the pixel grid.
 * @param {number} n
 * @param {number} [px]
 */
export function snap(n, px = PIXEL) {
  return Math.round(n / px) * px;
}

/**
 * Filled rect snapped to the pixel grid.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {string} color
 */
export function fillBlock(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(snap(x), snap(y), Math.max(PIXEL, Math.round(w)), Math.max(PIXEL, Math.round(h)));
}

/**
 * Draw a small 1-bit-style pattern of PIXEL×PIXEL cells.
 * Pattern rows are strings of chars; non-space / non-`.` paint.
 * Color map: char → fill color; default uses `fallback`.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} ox screen origin x
 * @param {number} oy screen origin y
 * @param {string[]} rows
 * @param {Record<string, string>} colors
 * @param {string} [fallback]
 * @param {number} [cell] cell size in screen px
 */
export function drawPattern(ctx, ox, oy, rows, colors, fallback = '#fff', cell = PIXEL) {
  const x0 = snap(ox, cell);
  const y0 = snap(oy, cell);
  for (let r = 0; r < rows.length; r++) {
    const line = rows[r];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === ' ' || ch === '.' || ch === '0') continue;
      const col = colors[ch] || fallback;
      ctx.fillStyle = col;
      ctx.fillRect(x0 + c * cell, y0 + r * cell, cell, cell);
    }
  }
}

/**
 * Outline rect (1px) for invuln / telegraph emphasis.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {string} color
 */
export function strokeBlock(ctx, x, y, w, h, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(snap(x) + 0.5, snap(y) + 0.5, Math.max(1, Math.round(w) - 1), Math.max(1, Math.round(h) - 1));
}

/**
 * Soft circle approximated with concentric pixel rings (cheap, no path cost issues).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {string} color
 */
export function fillDisk(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  const rr = Math.max(1, Math.round(r));
  // Midpoint-style fill of a disk with axis-aligned spans (no anti-alias).
  for (let dy = -rr; dy <= rr; dy++) {
    const span = Math.floor(Math.sqrt(rr * rr - dy * dy));
    ctx.fillRect(Math.round(cx) - span, Math.round(cy) + dy, span * 2 + 1, 1);
  }
}
