/**
 * Playing scene: auto-scrolling world, player ship with weapons/HP,
 * hazards, power-up pickups, score, HUD; death → game-over with score payload.
 */

import { createCamera } from '../engine/camera.js';
import { createEntity, createEntityList } from '../engine/entity.js';
import { aabbOverlap } from '../engine/collision.js';
import { createPlayer, SCORE_ENEMY_KILL } from '../game/player.js';
import { createRunScore } from '../game/score.js';
import {
  POWERUP_DROP_CHANCE,
  POWERUP_TYPES,
  applyPowerup,
  createPowerupPickup,
  getPowerupHudState,
  randomPowerupType,
} from '../game/powerups.js';

const ENEMY_SPAWN_INTERVAL = 1.6;
const DEATH_FREEZE_SEC = 0.45;
const COLLECT_TOAST_SEC = 1.5;

/**
 * @param {object} deps
 * @param {HTMLCanvasElement} deps.canvas
 * @param {CanvasRenderingContext2D} deps.ctx
 * @param {ReturnType<import('../engine/input.js').createInput>} deps.input
 * @param {(payload: { score: number }) => void} deps.onGameOver
 * @param {(text: string) => void} [deps.setStatus]
 * @param {number} deps.viewWidth
 * @param {number} deps.viewHeight
 * @param {{ lastScore: number }} [deps.runState]
 */
export function createPlayingScene({
  canvas,
  ctx,
  input,
  onGameOver,
  setStatus,
  viewWidth,
  viewHeight,
  runState,
}) {
  const camera = createCamera({
    x: 0,
    y: 0,
    width: viewWidth,
    height: viewHeight,
    scrollSpeed: 90,
  });

  const entities = createEntityList();
  const score = createRunScore();
  /** @type {ReturnType<typeof createPlayer> | null} */
  let player = null;
  /** @type {object | null} */
  let obstacle = null;
  let spawnTimer = 0;
  let frozen = false;
  let flashT = 0;
  let deathTimer = 0;
  let pendingGameOver = false;
  /** @type {string} */
  let collectMessage = '';
  let collectToastTimer = 0;

  // Debug keys (dev verification when enemies not yet awarding score).
  /** @type {((e: KeyboardEvent) => void) | null} */
  let onDebugKey = null;

  function spawnPlayer() {
    player = createPlayer({
      camera,
      input,
      viewWidth,
      viewHeight,
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

  /**
   * @param {import('../game/powerups.js').PowerupTypeId | string} type
   * @param {number} x
   * @param {number} y
   */
  function spawnPowerupAt(type, x, y) {
    entities.add(createPowerupPickup({ type, x, y }));
  }

  /** Force-spawn a power-up slightly ahead of the player (debug / verification). */
  function forceSpawnPowerup(type) {
    if (!player) return;
    const x = player.x + player.w + 40;
    const y = player.y + player.h / 2 - 10;
    spawnPowerupAt(type, x, y);
  }

  function finishRun() {
    const finalScore = score.get();
    if (runState) runState.lastScore = finalScore;
    if (setStatus) setStatus(`Game over — score ${finalScore}`);
    onGameOver({ score: finalScore });
  }

  function handlePlayerDeath() {
    if (pendingGameOver) return;
    pendingGameOver = true;
    frozen = true;
    flashT = 0;
    deathTimer = DEATH_FREEZE_SEC;
    if (setStatus) setStatus('Destroyed…');
  }

  function resolveProjectileHits() {
    const projectiles = entities.queryByTag('playerProjectile');
    if (projectiles.length === 0) return;

    for (const proj of projectiles) {
      if (!proj.alive) continue;
      for (const e of entities.all()) {
        if (!e.alive || e === proj) continue;
        // Killable targets: streaming enemies only (obstacle is solid hazard).
        if (!e.tags?.has('enemy')) continue;
        if (aabbOverlap(proj, e)) {
          const dropX = e.x;
          const dropY = e.y;
          e.alive = false;
          proj.alive = false;
          score.add(SCORE_ENEMY_KILL);
          // Chance to drop a random power-up at the kill position.
          if (Math.random() < POWERUP_DROP_CHANCE) {
            spawnPowerupAt(randomPowerupType(), dropX, dropY);
          }
          break;
        }
      }
    }
  }

  function resolveHazardDamage() {
    if (!player?.alive || player.isDead) return;
    for (const e of entities.all()) {
      if (!e.alive || e === player) continue;
      if (!e.tags?.has('hazard')) continue;
      if (aabbOverlap(player, e)) {
        const applied = player.takeDamage(1);
        if (applied) {
          e.hit = true;
          if (e.type === 'obstacle') {
            e.color = '#fbbf24';
          }
          if (player.isDead || player.hp <= 0) {
            handlePlayerDeath();
          }
        }
        break;
      }
    }
  }

  function resolvePowerupCollect() {
    if (!player?.alive || player.isDead) return;
    const pickups = entities.queryByTag('powerup');
    for (const p of pickups) {
      if (!p.alive) continue;
      if (!aabbOverlap(player, p)) continue;
      const result = applyPowerup(player, p.powerupType);
      p.alive = false;
      if (result.applied && result.label) {
        collectMessage = `GOT ${result.label.toUpperCase()}`;
        collectToastTimer = COLLECT_TOAST_SEC;
      }
      break;
    }
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

  function drawHealthBar(hp, maxHp) {
    const x = 10;
    const y = 12;
    const barW = 120;
    const barH = 12;
    const ratio = maxHp > 0 ? Math.max(0, hp / maxHp) : 0;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(x - 2, y - 2, barW + 4, barH + 4);
    ctx.strokeStyle = 'rgba(232, 238, 245, 0.45)';
    ctx.strokeRect(x - 2, y - 2, barW + 4, barH + 4);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = ratio > 0.35 ? '#4ade80' : '#f87171';
    ctx.fillRect(x, y, barW * ratio, barH);

    ctx.fillStyle = 'rgba(232, 238, 245, 0.9)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`HP ${hp}/${maxHp}`, x + barW + 8, y + 10);
  }

  function drawAegisOrbiter() {
    if (!player?.alive || player.isDead) return;
    const charges = player.aegisCharges ?? 0;
    if (charges <= 0) return;

    const cx = player.x + player.w / 2 - camera.x;
    const cy = player.y + player.h / 2 - camera.y;
    const orbitR = 22;
    const t = player._time ?? 0;
    for (let i = 0; i < charges; i++) {
      const ang = t * 2.4 + (i * Math.PI * 2) / Math.max(charges, 1);
      const ox = cx + Math.cos(ang) * orbitR;
      const oy = cy + Math.sin(ang) * orbitR;
      ctx.fillStyle = POWERUP_TYPES.aegis.color;
      ctx.fillRect(ox - 4, oy - 4, 8, 8);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.strokeRect(ox - 4, oy - 4, 8, 8);
    }
  }

  function drawHud() {
    const hp = player?.hp ?? 0;
    const maxHp = player?.maxHp ?? 0;
    drawHealthBar(hp, maxHp);

    ctx.fillStyle = 'rgba(232, 238, 245, 0.9)';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Score ${score.get()}`, viewWidth - 12, 22);

    // Power-up status under HP bar.
    const hud = getPowerupHudState(player);
    const weaponLabel =
      hud.weapon === 'spread'
        ? 'Tri-beam'
        : hud.weapon === 'rapid'
          ? 'Overdrive'
          : 'Base';
    const parts = [`Wpn: ${weaponLabel}`, `Aegis: ${hud.aegisCharges}`];
    if (hud.surgeRemaining > 0) {
      parts.push(`Surge: ${hud.surgeRemaining.toFixed(1)}s`);
    }
    ctx.textAlign = 'left';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(232, 238, 245, 0.85)';
    ctx.fillText(parts.join('  ·  '), 10, 42);

    if (collectToastTimer > 0 && collectMessage) {
      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(collectMessage, viewWidth / 2, 72);
    }

    ctx.textAlign = 'left';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(232, 238, 245, 0.7)';
    if (pendingGameOver) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('Ship destroyed', 10, 62);
    } else {
      ctx.fillText(
        'WASD/arrows · Space fire · H dmg · G score · 1–4 power-ups',
        10,
        62,
      );
    }
  }

  return {
    enter() {
      entities.clear();
      camera.setX(0);
      camera.setY(0);
      spawnTimer = 0;
      frozen = false;
      flashT = 0;
      deathTimer = 0;
      pendingGameOver = false;
      collectMessage = '';
      collectToastTimer = 0;
      score.reset();
      if (runState) runState.lastScore = 0;
      spawnPlayer();
      spawnObstacle();

      // Scripted demo pickup mid-lane so a run can show collect without RNG.
      spawnPowerupAt(
        'spread',
        camera.x + viewWidth * 0.55,
        viewHeight * 0.5 - 10,
      );

      // Debug: H = damage, G = +100 score, 1–4 = force-spawn power-ups near player.
      onDebugKey = (e) => {
        if (e.repeat || frozen || pendingGameOver) return;
        if (e.code === 'KeyH' || e.key === 'h' || e.key === 'H') {
          if (player && !player.isDead) {
            player.takeDamage(1);
            if (player.isDead || player.hp <= 0) handlePlayerDeath();
          }
        } else if (e.code === 'KeyG' || e.key === 'g' || e.key === 'G') {
          score.add(100);
        } else if (e.key === '1' || e.code === 'Digit1') {
          forceSpawnPowerup('spread');
        } else if (e.key === '2' || e.code === 'Digit2') {
          forceSpawnPowerup('rapid');
        } else if (e.key === '3' || e.code === 'Digit3') {
          forceSpawnPowerup('aegis');
        } else if (e.key === '4' || e.code === 'Digit4') {
          forceSpawnPowerup('surge');
        }
      };
      window.addEventListener('keydown', onDebugKey);

      if (setStatus) setStatus('Playing');
    },

    exit() {
      if (onDebugKey) {
        window.removeEventListener('keydown', onDebugKey);
        onDebugKey = null;
      }
      entities.clear();
      player = null;
      obstacle = null;
      collectMessage = '';
      collectToastTimer = 0;
    },

    /**
     * @param {number} dt
     */
    update(dt) {
      if (frozen) {
        flashT += dt;
        if (pendingGameOver) {
          deathTimer -= dt;
          if (deathTimer <= 0) {
            finishRun();
            input.endFrame();
            return;
          }
        }
        input.endFrame();
        return;
      }

      // Advance invuln flash clock while alive (not only during death freeze).
      if (player && !player.isDead && player._time < player.invulnerableUntil) {
        flashT += dt;
      } else if (!pendingGameOver) {
        flashT = 0;
      }

      if (collectToastTimer > 0) {
        collectToastTimer = Math.max(0, collectToastTimer - dt);
        if (collectToastTimer === 0) collectMessage = '';
      }

      camera.update(dt);

      if (player) {
        player.updateTimers(dt);
        player.tryFire(entities);
      }

      entities.updateAll(dt, { camera, input });

      spawnTimer += dt;
      if (spawnTimer >= ENEMY_SPAWN_INTERVAL) {
        spawnTimer = 0;
        spawnEnemy();
      }

      resolveProjectileHits();
      resolvePowerupCollect();
      resolveHazardDamage();

      input.endFrame();
    },

    /**
     * @param {number} _alpha
     */
    render(_alpha) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dpr = canvas.width / viewWidth;
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#0b1220';
      ctx.fillRect(0, 0, viewWidth, viewHeight);

      drawGrid();
      entities.renderAll(ctx, camera);
      drawAegisOrbiter();

      // Invuln flash: dim ship briefly while invulnerable (color also yellow).
      if (
        player &&
        player.alive &&
        !player.isDead &&
        player._time < player.invulnerableUntil &&
        Math.floor(flashT * 12) % 2 === 0
      ) {
        const sx = player.x - camera.x;
        const sy = player.y - camera.y;
        ctx.fillStyle = 'rgba(250, 204, 21, 0.35)';
        ctx.fillRect(sx - 2, sy - 2, player.w + 4, player.h + 4);
      }

      if (pendingGameOver && Math.floor(flashT * 8) % 2 === 0) {
        ctx.fillStyle = 'rgba(248, 113, 113, 0.14)';
        ctx.fillRect(0, 0, viewWidth, viewHeight);
      }

      drawHud();
      ctx.restore();
    },
  };
}
