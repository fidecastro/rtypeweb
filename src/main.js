/**
 * Boot: canvas + Input + Game + Loop.
 * Shared runState bridges playing → gameover score handoff.
 */

import { createLoop } from './engine/loop.js';
import { createInput } from './engine/input.js';
import { createGame } from './engine/game.js';
import { createPlayingScene } from './scenes/playing.js';
import { createMenuScene } from './scenes/menu.js';
import { createGameOverScene } from './scenes/gameover.js';

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 540;

const statusEl = document.getElementById('status');
const titleEl = document.getElementById('title');
const canvas = document.getElementById('game');

if (titleEl) {
  titleEl.textContent = 'R-Type Web';
}

/**
 * @param {string} text
 */
function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
  setStatus('Error: missing #game canvas');
  throw new Error('[rtypeweb] #game canvas not found');
}

const ctx = canvas.getContext('2d');
if (!ctx) {
  setStatus('Error: 2D context unavailable');
  throw new Error('[rtypeweb] 2D context unavailable');
}

/**
 * Size the canvas buffer for devicePixelRatio sharpness.
 */
function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(VIEW_WIDTH * dpr);
  canvas.height = Math.floor(VIEW_HEIGHT * dpr);
  canvas.style.width = `${VIEW_WIDTH}px`;
  canvas.style.height = `${VIEW_HEIGHT}px`;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const input = createInput({ target: window, enableTouch: true });

/** Shared across scenes for last-run score. */
const runState = {
  lastScore: 0,
};

/** @type {ReturnType<typeof createGame> | null} */
let game = null;

function goPlaying() {
  game?.invalidateScene('playing');
  game?.setScene('playing');
}

function goMenu() {
  game?.invalidateScene('menu');
  game?.setScene('menu');
}

/**
 * @param {{ score?: number }} [payload]
 */
function goGameOver(payload) {
  if (payload && typeof payload.score === 'number') {
    runState.lastScore = payload.score;
  }
  game?.invalidateScene('gameover');
  game?.setScene('gameover');
}

const sceneDeps = {
  canvas,
  ctx,
  input,
  setStatus,
  viewWidth: VIEW_WIDTH,
  viewHeight: VIEW_HEIGHT,
};

game = createGame({
  initial: 'menu',
  onSceneChange(name) {
    console.log('[rtypeweb] scene →', name);
  },
  scenes: {
    menu: () =>
      createMenuScene({
        ...sceneDeps,
        onStart: goPlaying,
      }),
    playing: () =>
      createPlayingScene({
        ...sceneDeps,
        runState,
        onGameOver: goGameOver,
      }),
    gameover: () =>
      createGameOverScene({
        ...sceneDeps,
        getLastScore: () => runState.lastScore,
        onRestart: goPlaying,
        onMenu: goMenu,
      }),
  },
});

const loop = createLoop({
  update(dt) {
    game?.update(dt);
  },
  render(alpha) {
    game?.render(alpha);
  },
});

loop.start();
setStatus('Menu');
console.log('[rtypeweb] engine booted — scene:', game.getScene());
