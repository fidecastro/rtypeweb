/**
 * Procedural 16-bit-style sprite drawings for main combat entities.
 * Original pixel art via pattern matrices + block fills (no external PNGs).
 */

import { PALETTE, PIXEL } from './palette.js';
import { drawPattern, fillBlock, strokeBlock, fillDisk } from './draw.js';

/**
 * @param {object} entity
 * @param {object} camera
 */
function screenPos(entity, camera) {
  return camera.worldToScreen(entity.x, entity.y);
}

/**
 * Player R-Type-inspired (original) fighter facing right.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} entity
 * @param {object} camera
 */
export function drawPlayerSprite(ctx, entity, camera) {
  const { x, y } = screenPos(entity, camera);
  const body = entity.color || PALETTE.playerBody;
  // Map flash colors: invuln yellow / aegis purple / surge teal keep readable body.
  const colors = {
    G: body,
    D: PALETTE.playerDark,
    L: PALETTE.playerLight,
    C: PALETTE.playerCockpit,
    E: entity.hasSurgeActive?.() ? PALETTE.playerEngineHot : PALETTE.playerEngine,
    O: PALETTE.playerOutline,
  };
  // 18×12 cells × 2px ≈ 36×24 (PLAYER_W/H)
  const rows = [
    '......OO..........',
    '....OOGGOO........',
    '...OGGGGGGOL......',
    '..OGGGCCCGGGOL....',
    'OEGGGCCCCCGGGGO...',
    'OEGGGCCCCCGGGGGOL.',
    'OEGGGCCCCCGGGGGOL.',
    'OEGGGCCCCCGGGGO...',
    '..OGGGCCCGGGOL....',
    '...OGGGGGGOL......',
    '....OOGGOO........',
    '......OO..........',
  ];
  drawPattern(ctx, x, y, rows, colors, body, PIXEL);

  // Engine pulse bar
  const t = entity._time ?? 0;
  if (Math.floor(t * 16) % 2 === 0) {
    fillBlock(ctx, x - 4, y + entity.h * 0.35, 4, entity.h * 0.3, PALETTE.playerEngineHot);
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} entity
 * @param {object} camera
 */
export function drawStraightEnemy(ctx, entity, camera) {
  const { x, y } = screenPos(entity, camera);
  const colors = {
    B: entity.color || PALETTE.straightBody,
    D: PALETTE.straightDark,
    L: PALETTE.straightLight,
    E: '#f472b6',
  };
  // Facing left (coming from right)
  const rows = [
    '....DDDD........',
    '..DDBBBBD.......',
    '.DBBBBBBBD......',
    'DBBBLLLBBBD.....',
    'DBBLLLELLBBDE...',
    'DBBLLLELLBBDE...',
    'DBBBLLLBBBD.....',
    '.DBBBBBBBD......',
    '..DDBBBBD.......',
    '....DDDD........',
  ];
  drawPattern(ctx, x, y, rows, colors, colors.B, 2);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} entity
 * @param {object} camera
 */
export function drawSineEnemy(ctx, entity, camera) {
  const { x, y } = screenPos(entity, camera);
  const colors = {
    B: entity.color || PALETTE.sineBody,
    D: PALETTE.sineDark,
    L: PALETTE.sineLight,
  };
  const rows = [
    '......DD........',
    '....DDBBDD......',
    '..DDBBBBBBDD....',
    '.DBBBLLLBBBD....',
    'DBBLLLLLLLLBBD..',
    'DBBLLLLLLLLBBD..',
    '.DBBBLLLBBBD....',
    '..DDBBBBBBDD....',
    '....DDBBDD......',
    '......DD........',
  ];
  drawPattern(ctx, x, y, rows, colors, colors.B, 2);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} entity
 * @param {object} camera
 */
export function drawAimerEnemy(ctx, entity, camera) {
  const { x, y } = screenPos(entity, camera);
  const colors = {
    B: entity.color || PALETTE.aimerBody,
    D: PALETTE.aimerDark,
    L: PALETTE.aimerLight,
    E: PALETTE.aimerEye,
  };
  const rows = [
    '.....DDDD.......',
    '...DDBBBBDD.....',
    '..DBBBBBBBBD....',
    '.DBBLLBBLLBBD...',
    'DBBLLEBBELLBBD..',
    'DBBLLEBBELLBBD..',
    '.DBBLLBBLLBBD...',
    '..DBBBBBBBBD....',
    '...DDBBBBDD.....',
    '.....DDDD.......',
  ];
  drawPattern(ctx, x, y, rows, colors, colors.B, 2);
  // Barrel tip left
  fillBlock(ctx, x - 2, y + entity.h / 2 - 2, 4, 4, PALETTE.aimerDark);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} entity
 * @param {object} camera
 */
export function drawPlayerProjectile(ctx, entity, camera) {
  const { x, y } = screenPos(entity, camera);
  fillBlock(ctx, x, y, entity.w, entity.h, PALETTE.playerShot);
  fillBlock(ctx, x + entity.w * 0.25, y + 1, entity.w * 0.55, Math.max(1, entity.h - 2), PALETTE.playerShotCore);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} entity
 * @param {object} camera
 */
export function drawEnemyProjectile(ctx, entity, camera) {
  const { x, y } = screenPos(entity, camera);
  const core =
    entity.kind === 'bossShot' ? PALETTE.bossShotCore : PALETTE.enemyShotCore;
  const body = entity.color || PALETTE.enemyShot;
  fillBlock(ctx, x, y, entity.w, entity.h, body);
  fillBlock(ctx, x + 2, y + 1, Math.max(2, entity.w - 4), Math.max(1, entity.h - 2), core);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} entity
 * @param {object} camera
 */
export function drawPowerupSprite(ctx, entity, camera) {
  const { x, y } = screenPos(entity, camera);
  const body = entity.color || PALETTE.puSpread;
  const t = (entity.x + entity.y) * 0.05;
  const pulse = 0.5 + 0.5 * Math.sin(t * 6 + (entity._spin || 0));

  // Outer frame
  fillBlock(ctx, x, y, entity.w, entity.h, PALETTE.puFrame);
  fillBlock(ctx, x + 2, y + 2, entity.w - 4, entity.h - 4, body);
  fillBlock(ctx, x + 4, y + 4, entity.w - 8, entity.h - 8, pulse > 0.55 ? '#fff' : body);

  // Type glyph
  const id = entity.powerupType;
  ctx.fillStyle = '#0f172a';
  if (id === 'spread') {
    // three dots
    fillBlock(ctx, x + 5, y + entity.h / 2 - 1, 3, 3, '#0f172a');
    fillBlock(ctx, x + 9, y + 5, 3, 3, '#0f172a');
    fillBlock(ctx, x + 9, y + entity.h - 8, 3, 3, '#0f172a');
  } else if (id === 'rapid') {
    fillBlock(ctx, x + 6, y + 5, 8, 3, '#0f172a');
    fillBlock(ctx, x + 8, y + 9, 8, 3, '#0f172a');
    fillBlock(ctx, x + 6, y + 13, 8, 3, '#0f172a');
  } else if (id === 'aegis') {
    fillBlock(ctx, x + 6, y + 5, 8, 10, '#0f172a');
    fillBlock(ctx, x + 8, y + 7, 4, 6, body);
  } else if (id === 'surge') {
    // chevron
    fillBlock(ctx, x + 5, y + 8, 4, 4, '#0f172a');
    fillBlock(ctx, x + 8, y + 5, 4, 4, '#0f172a');
    fillBlock(ctx, x + 11, y + 8, 4, 4, '#0f172a');
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} entity
 * @param {object} camera
 */
export function drawBlockHazard(ctx, entity, camera) {
  const { x, y } = screenPos(entity, camera);
  const body = entity.color || PALETTE.block;
  fillBlock(ctx, x, y, entity.w, entity.h, PALETTE.blockDark);
  fillBlock(ctx, x + 3, y + 3, entity.w - 6, entity.h - 6, body);
  // Panel lines
  for (let i = 8; i < entity.h - 4; i += 10) {
    fillBlock(ctx, x + 6, y + i, entity.w - 12, 2, PALETTE.blockDark);
  }
  fillBlock(ctx, x + 4, y + 4, entity.w * 0.35, 4, PALETTE.blockLight);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} entity
 * @param {object} camera
 */
export function drawSpikeHazard(ctx, entity, camera) {
  const { x, y } = screenPos(entity, camera);
  const body = entity.color || PALETTE.spike;
  // Triangular spike via stepped rows
  const mid = entity.w / 2;
  const steps = Math.max(4, Math.floor(entity.h / 4));
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const half = Math.max(2, mid * (1 - t));
    const yy = y + (entity.h * i) / steps;
    const hh = entity.h / steps + 1;
    fillBlock(ctx, x + mid - half, yy, half * 2, hh, i % 2 === 0 ? body : PALETTE.spikeDark);
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} entity
 * @param {object} camera
 */
export function drawZoneHazard(ctx, entity, camera) {
  const { x, y } = screenPos(entity, camera);
  fillBlock(ctx, x, y, entity.w, entity.h, entity.color || PALETTE.zone);
  strokeBlock(ctx, x, y, entity.w, entity.h, PALETTE.zoneEdge);
  // Scan lines
  for (let i = 4; i < entity.h; i += 8) {
    fillBlock(ctx, x + 2, y + i, entity.w - 4, 1, 'rgba(254, 202, 202, 0.35)');
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} entity
 * @param {object} camera
 */
export function drawHarvesterBoss(ctx, entity, camera) {
  const { x, y } = screenPos(entity, camera);
  const body = entity.color || PALETTE.harvester;
  fillBlock(ctx, x + 8, y + 6, entity.w - 16, entity.h - 12, PALETTE.harvesterDark);
  fillBlock(ctx, x + 12, y + 12, entity.w - 24, entity.h - 24, body);
  // Mandible arms
  fillBlock(ctx, x, y + 10, 14, 12, body);
  fillBlock(ctx, x, y + entity.h - 22, 14, 12, body);
  fillBlock(ctx, x - 6, y + 12, 8, 8, PALETTE.harvesterLight);
  fillBlock(ctx, x - 6, y + entity.h - 20, 8, 8, PALETTE.harvesterLight);
  // Core eye
  fillBlock(ctx, x + entity.w * 0.35, y + entity.h * 0.4, entity.w * 0.3, entity.h * 0.2, PALETTE.harvesterLight);
  fillBlock(ctx, x + entity.w * 0.45, y + entity.h * 0.45, entity.w * 0.12, entity.h * 0.1, '#0f172a');
  // Top/bottom thrusters
  fillBlock(ctx, x + entity.w - 10, y + 16, 12, 10, PALETTE.harvesterDark);
  fillBlock(ctx, x + entity.w - 10, y + entity.h - 26, 12, 10, PALETTE.harvesterDark);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} entity
 * @param {object} camera
 */
export function drawInterceptorBoss(ctx, entity, camera) {
  const { x, y } = screenPos(entity, camera);
  const body = entity.color || PALETTE.interceptor;
  // Tall blade hull
  fillBlock(ctx, x + 8, y + 4, entity.w - 16, entity.h - 8, PALETTE.interceptorDark);
  fillBlock(ctx, x + 12, y + 10, entity.w - 24, entity.h - 20, body);
  // Nose (left)
  fillBlock(ctx, x, y + entity.h * 0.35, 14, entity.h * 0.3, body);
  fillBlock(ctx, x - 4, y + entity.h * 0.42, 8, entity.h * 0.16, PALETTE.interceptorLight);
  // Vertical fin lights
  for (let i = 0; i < 5; i++) {
    fillBlock(
      ctx,
      x + entity.w * 0.4,
      y + 14 + i * (entity.h / 6),
      entity.w * 0.2,
      6,
      i % 2 === 0 ? PALETTE.interceptorLight : body,
    );
  }
  // Engine
  fillBlock(ctx, x + entity.w - 6, y + entity.h * 0.4, 10, entity.h * 0.2, PALETTE.interceptorLight);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} entity
 * @param {object} camera
 */
export function drawOvermindBoss(ctx, entity, camera) {
  const { x, y } = screenPos(entity, camera);
  const body = entity.color || PALETTE.overmind;
  // Shell
  fillBlock(ctx, x + 6, y + 6, entity.w - 12, entity.h - 12, PALETTE.overmindDark);
  fillBlock(ctx, x + 12, y + 12, entity.w - 24, entity.h - 24, body);
  // Inner core
  const inset = Math.floor(entity.w * 0.22);
  fillBlock(
    ctx,
    x + inset,
    y + inset,
    entity.w - inset * 2,
    entity.h - inset * 2,
    entity.bossState === 'fight' ? PALETTE.overmindCore : PALETTE.overmindLight,
  );
  // Core pupil
  fillDisk(
    ctx,
    x + entity.w / 2,
    y + entity.h / 2,
    Math.max(4, entity.w * 0.1),
    '#4c1d95',
  );
  // Side nodes
  fillBlock(ctx, x - 8, y + entity.h * 0.2, 12, 16, PALETTE.overmindDark);
  fillBlock(ctx, x - 8, y + entity.h * 0.65, 12, 16, PALETTE.overmindDark);
  fillBlock(ctx, x + entity.w - 4, y + entity.h * 0.4, 12, 18, PALETTE.overmindDark);
  fillBlock(ctx, x - 4, y + entity.h * 0.25, 6, 8, PALETTE.overmindLight);
  fillBlock(ctx, x - 4, y + entity.h * 0.7, 6, 8, PALETTE.overmindLight);
}

/**
 * Dispatch by entity type / kind. Returns true if drawn.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} entity
 * @param {object} camera
 * @returns {boolean}
 */
export function drawEntitySprite(ctx, entity, camera) {
  if (!entity?.alive) return false;
  const type = entity.type;
  const kind = entity.kind;

  if (type === 'player') {
    drawPlayerSprite(ctx, entity, camera);
    return true;
  }
  if (type === 'playerProjectile') {
    drawPlayerProjectile(ctx, entity, camera);
    return true;
  }
  if (type === 'enemyProjectile' || kind === 'enemyShot' || kind === 'bossShot') {
    drawEnemyProjectile(ctx, entity, camera);
    return true;
  }
  if (type === 'powerup') {
    drawPowerupSprite(ctx, entity, camera);
    return true;
  }
  if (type === 'enemy') {
    if (kind === 'sine') drawSineEnemy(ctx, entity, camera);
    else if (kind === 'aimer') drawAimerEnemy(ctx, entity, camera);
    else drawStraightEnemy(ctx, entity, camera);
    return true;
  }
  if (type === 'boss' || entity.tags?.has?.('boss')) {
    if (kind === 'interceptor') drawInterceptorBoss(ctx, entity, camera);
    else if (kind === 'overmind') drawOvermindBoss(ctx, entity, camera);
    else drawHarvesterBoss(ctx, entity, camera);
    return true;
  }
  if (type === 'obstacle') {
    if (kind === 'spike') drawSpikeHazard(ctx, entity, camera);
    else drawBlockHazard(ctx, entity, camera);
    return true;
  }
  if (type === 'hazardZone' || kind === 'zone' || kind === 'bossZone') {
    drawZoneHazard(ctx, entity, camera);
    return true;
  }
  return false;
}

/**
 * Bind a customRender that draws the sprite for this entity.
 * @param {object} entity
 * @returns {object} same entity
 */
export function attachSpriteRender(entity) {
  entity.customRender = function customRender(ctx, camera) {
    drawEntitySprite(ctx, this, camera);
  };
  return entity;
}
