/**
 * Shared 16-bit-inspired palette for sprites, backgrounds, and VFX.
 * Original art — not copyrighted R-Type assets. Keep colors cohesive
 * and high-contrast for combat readability.
 */

export const PALETTE = {
  // Sky / void
  voidDeep: '#05080f',
  void: '#0b1220',
  voidMid: '#101a2c',
  nebula: '#1a1040',
  fog: '#162033',
  star: '#d4e4f7',
  starDim: '#6b7f99',
  mountainFar: '#1e2d4a',
  mountainNear: '#2a3f66',
  ground: '#0f172a',
  groundEdge: '#334155',
  invaderGlow: '#7c3aed',
  invaderHull: '#4c1d95',

  // Player ship
  playerBody: '#4ade80',
  playerDark: '#166534',
  playerMid: '#22c55e',
  playerLight: '#bbf7d0',
  playerCockpit: '#7dd3fc',
  playerEngine: '#38bdf8',
  playerEngineHot: '#f0f9ff',
  playerOutline: '#052e16',

  // Enemies
  straightBody: '#c084fc',
  straightDark: '#6b21a8',
  straightLight: '#e9d5ff',
  sineBody: '#67e8f9',
  sineDark: '#0e7490',
  sineLight: '#cffafe',
  aimerBody: '#fb923c',
  aimerDark: '#c2410c',
  aimerLight: '#fed7aa',
  aimerEye: '#fef08a',

  // Projectiles
  playerShot: '#7dd3fc',
  playerShotCore: '#e0f2fe',
  enemyShot: '#fb7185',
  enemyShotCore: '#fecdd3',
  bossShot: '#f0abfc',
  bossShotCore: '#fdf4ff',

  // Bosses
  harvester: '#c026d3',
  harvesterDark: '#701a75',
  harvesterLight: '#f0abfc',
  interceptor: '#06b6d4',
  interceptorDark: '#0e7490',
  interceptorLight: '#a5f3fc',
  overmind: '#7c3aed',
  overmindDark: '#4c1d95',
  overmindLight: '#c4b5fd',
  overmindCore: '#f5d0fe',
  telegraph: '#fbbf24',

  // Hazards
  block: '#f87171',
  blockDark: '#991b1b',
  blockLight: '#fecaca',
  spike: '#e11d48',
  spikeDark: '#881337',
  zone: 'rgba(248, 113, 113, 0.4)',
  zoneEdge: 'rgba(252, 165, 165, 0.7)',

  // Power-ups (match POWERUP_TYPES colors)
  puSpread: '#38bdf8',
  puRapid: '#fbbf24',
  puAegis: '#a78bfa',
  puSurge: '#34d399',
  puFrame: '#e2e8f0',

  // VFX
  spark: '#fde68a',
  sparkHot: '#fff7ed',
  explodeOrange: '#f97316',
  explodeYellow: '#fbbf24',
  explodeRed: '#ef4444',
  muzzle: '#fef9c3',
  muzzleCore: '#ffffff',
  hitFlash: 'rgba(250, 204, 21, 0.35)',
  collectGlow: '#fde68a',
};

/** Pixel block size for sprite-like drawings (screen units). */
export const PIXEL = 2;
