/**
 * Playing demo scene: auto-scrolling world, placeholder player, test obstacle,
 * optional streaming enemy, collision → game-over hook.
 */

import { createCamera } from '../engine/camera.js';
import { createEntity, createEntityList } from '../engine/entity.js';
import { aabbOverlap } from '../engine/collision.js';

const PLAYER_SPEED = 220;
const PLAYER_W = 36;
const PLAYER_H = 24;
const ENEMY_SPAWN_INTERVAL = 1.6;

/**
 * @param {object} deps
 * @param {HTMLCanvasElement} deps.canvas
 * @param {CanvasRenderingContext2D} deps.ctx
 * @param {ReturnType<import('../engine/input.js').createInput>} deps.input
 * @param {() => void} deps.onGameOver
 * @param {(text: string) => void} [deps.setStatus]
 * @param {number} deps.viewWidth
 * @param {number} deps.viewHeight
 */
export function createPlayingScene({
  canvas,
  ctx,
  input,
  onGameOver,
  setStatus,
  viewWidth,
  viewHeight,
}) {
  const camera = createCamera({
    x: 0,
    y: 0,
    width: viewWidth,
    height: viewHeight,
    scrollSpeed: 90,
  });

  const entities = createEntityList();
  /** @type {object | null} */
  let player = null;
  /** @type {object | null} */
  let obstacle = null;
  let spawnTimer = 0;
  let collided = false;
  let frozen = false;
  let flashT = 0;

  function spawnPlayer() {
    player = createEntity({
      type: 'player',
      tags: ['player'],
      x: camera.x + viewWidth * 0.22,
      y: viewHeight * 0.5 - PLAYER_H / 2,
      w: PLAYER_W,
      h: PLAYER_H,
      color: '#4ade80',
      despawnWhenOffscreen: false,
      customUpdate(dt) {
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
    entities.add(player);
  }

  function spawnObstacle() {
    obstacle = createEntity({
      type: 'obstacle',
      tags: ['hazard'],
      x: camera.x + viewWidth * 0.72,
      y: viewHeight * 0.42,
      w: 48,
      h: 80,
      color: '#f87171',
      despawnWhenOffscreen: false,
      hit: false,
    });
    entities.add(obstacle);
  }

  function spawnEnemy() {
    const y = 40 + Math.random() * (viewHeight - 80);
    entities.add(
      createEntity({
        type: 'enemy',
        tags: ['hazard', 'enemy'],
        x: camera.x + viewWidth + 20,
        y,
        w: 28,
        h: 28,
        vx: -40,
        color: '#c084fc',
        despawnWhenOffscreen: true,
      }),
    );
  }

  function drawGrid() {
    const step = 64;
    const startX = Math.floor(camera.x / step) * step;
    const endX = camera.x + camera.width + step;
    ctx.strokeStyle = 'rgba(80, 120, 160, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let wx = startX; wx <= endX; wx += step) {
      const sx = wx - camera.x;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, camera.height);
    }
    for (let wy = 0; wy <= camera.height; wy += step) {
      ctx.moveTo(0, wy);
      ctx.lineTo(camera.width, wy);
    }
    ctx.stroke();
  }

  function drawHud() {
    ctx.fillStyle = 'rgba(232, 238, 245, 0.85)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`camera.x ${camera.x.toFixed(0)}`, 10, 18);
    ctx.fillText(`entities ${entities.length}`, 10, 34);
    if (collided) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('COLLISION — game over (R to restart later)', 10, 50);
    } else {
      ctx.fillText('WASD / arrows move · dodge red obstacle', 10, 50);
    }
  }

  return {
    enter() {
      entities.clear();
      camera.setX(0);
      camera.setY(0);
      spawnTimer = 0;
      collided = false;
      frozen = false;
      flashT = 0;
      spawnPlayer();
      spawnObstacle();
      if (setStatus) setStatus('Playing');
    },

    exit() {
      entities.clear();
      player = null;
      obstacle = null;
    },

    /**
     * @param {number} dt
     */
    update(dt) {
      if (frozen) {
        flashT += dt;
        input.endFrame();
        return;
      }

      camera.update(dt);

      // Keep obstacle roughly in view for the collision demo until hit.
      if (obstacle?.alive && !obstacle.hit) {
        // Static in world space; camera scroll makes it move left on screen.
      }

      entities.updateAll(dt, { camera, input });

      spawnTimer += dt;
      if (spawnTimer >= ENEMY_SPAWN_INTERVAL) {
        spawnTimer = 0;
        spawnEnemy();
      }

      // Player vs hazards (obstacle + enemies).
      if (player?.alive) {
        for (const e of entities.all()) {
          if (!e.alive || e === player) continue;
          if (!e.tags?.has('hazard')) continue;
          if (aabbOverlap(player, e)) {
            collided = true;
            e.hit = true;
            e.color = '#fbbf24';
            player.color = '#facc15';
            frozen = true;
            if (setStatus) setStatus('Game over — collision');
            onGameOver();
            break;
          }
        }
      }

      input.endFrame();
    },

    /**
     * @param {number} _alpha
     */
    render(_alpha) {
      // Clear full canvas buffer (already in logical space if ctx is scaled).
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dpr = canvas.width / viewWidth;
      ctx.scale(dpr, dpr);

      // Debug-friendly clear each frame.
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(0, 0, viewWidth, viewHeight);

      drawGrid();
      entities.renderAll(ctx, camera);

      if (collided && Math.floor(flashT * 8) % 2 === 0) {
        ctx.fillStyle = 'rgba(248, 113, 113, 0.12)';
        ctx.fillRect(0, 0, viewWidth, viewHeight);
      }

      drawHud();
      ctx.restore();
    },
  };
}
