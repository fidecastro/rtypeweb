/**
 * Playing scene: auto-scrolling world, player ship with weapons/HP,
 * multi-phase enemy waves, phase-end bosses, hazards, score, HUD;
 * death → game-over; final boss → stage clear.
 */

import { createCamera } from '../engine/camera.js';
import { createEntityList } from '../engine/entity.js';
import { aabbOverlap } from '../engine/collision.js';
import { createPlayer, SCORE_ENEMY_KILL } from '../game/player.js';
import { createRunScore } from '../game/score.js';
import { spawnEnemy } from '../game/enemies.js';
import { spawnHazard } from '../game/hazards.js';
import {
  spawnBossForPhase,
  bossScoreFor,
} from '../game/bosses.js';
import {
  createStageDirector,
  DEFAULT_STAGES,
  loadStages,
  DIRECTOR_MODE,
} from '../game/stageDirector.js';

const DEATH_FREEZE_SEC = 0.45;
const CLEAR_FREEZE_SEC = 1.6;
/** Damage dealt by each player projectile hit. */
const PROJECTILE_DAMAGE = 1;

/**
 * @param {object} deps
 * @param {HTMLCanvasElement} deps.canvas
 * @param {CanvasRenderingContext2D} deps.ctx
 * @param {ReturnType<import('../engine/input.js').createInput>} deps.input
 * @param {(payload: { score: number, cleared?: boolean }) => void} deps.onGameOver
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
  /** @type {ReturnType<typeof createStageDirector> | null} */
  let director = null;
  /** @type {string} */
  let phaseLabel = '';
  /** @type {string} */
  let encounterBanner = '';
  let frozen = false;
  let flashT = 0;
  let deathTimer = 0;
  let pendingGameOver = false;
  let pendingStageClear = false;
  let stageCleared = false;
  /** Active boss entity (if any). */
  let activeBoss = null;
  /** True once score for the current boss has been awarded. */
  let bossScoreAwarded = false;
  /** Bump so late stage JSON loads do not rebind an exited / restarted run. */
  let runToken = 0;

  // Debug keys (dev verification).
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

  /**
   * @param {object} ev stage event
   */
  function handleSpawnEnemy(ev) {
    const enemy = spawnEnemy(ev.kind || 'straight', {
      camera,
      viewWidth,
      viewHeight,
      y: ev.y,
      amplitude: ev.amplitude,
      frequency: ev.frequency,
      vx: ev.vx,
      trackSpeed: ev.trackSpeed,
      fireInterval: ev.fireInterval,
    });
    entities.add(enemy);
  }

  /**
   * @param {object} ev stage event
   */
  function handleSpawnHazard(ev) {
    const hazard = spawnHazard(ev.kind || 'block', {
      camera,
      viewWidth,
      viewHeight,
      y: ev.y,
      w: ev.w,
      h: ev.h,
      destructible: !!ev.destructible,
    });
    entities.add(hazard);
  }

  /**
   * Remove trash enemies/hazards and boss shots so the arena is readable.
   * Keeps player, projectiles optional clear of boss hazards.
   * @param {{ clearBossShots?: boolean, clearTrash?: boolean }} [opts]
   */
  function clearArena(opts = {}) {
    const clearBossShots = opts.clearBossShots !== false;
    const clearTrash = opts.clearTrash !== false;
    for (const e of entities.all()) {
      if (!e.alive || e === player) continue;
      if (e.tags?.has('boss')) continue;
      if (e.tags?.has('playerProjectile')) continue;
      if (clearTrash && (e.tags?.has('enemy') || e.type === 'obstacle' || e.type === 'hazardZone')) {
        // Keep only if it's a boss-owned zone we want to clear via clearBossShots.
        if (e.kind === 'bossZone' || e.kind === 'bossShot') {
          if (clearBossShots) e.alive = false;
          continue;
        }
        e.alive = false;
        continue;
      }
      if (clearBossShots && (e.kind === 'bossShot' || e.kind === 'bossZone' || e.kind === 'enemyShot' || e.type === 'enemyProjectile')) {
        e.alive = false;
      }
    }
    entities.prune();
  }

  /**
   * @param {object} phase
   * @param {number} phaseIndex
   * @param {string} bossId
   */
  function handleBossStart(phase, phaseIndex, bossId) {
    // Despawn leftover trash so the fight is readable.
    clearArena({ clearTrash: true, clearBossShots: true });
    bossScoreAwarded = false;
    activeBoss = spawnBossForPhase(phaseIndex, {
      camera,
      viewWidth,
      viewHeight,
      bossId,
    });
    entities.add(activeBoss);
    const name = bossId || activeBoss.kind || 'Boss';
    encounterBanner = `BOSS — ${String(name).toUpperCase()}`;
    phaseLabel = phase?.label || phaseLabel;
    if (setStatus) setStatus(`Boss: ${name}`);
  }

  function handleBossOutro(phase, phaseIndex) {
    clearArena({ clearTrash: false, clearBossShots: true });
    const last = (director?.getPhaseCount?.() ?? 1) - 1;
    if (phaseIndex >= last) {
      encounterBanner = 'STAGE CLEAR';
      if (setStatus) setStatus('Stage clear!');
    } else {
      encounterBanner = 'PHASE CLEAR';
      if (setStatus) setStatus(`Phase clear — ${phase?.label || ''}`);
    }
  }

  function handleStageClear() {
    if (pendingStageClear || pendingGameOver) return;
    pendingStageClear = true;
    stageCleared = true;
    frozen = true;
    flashT = 0;
    deathTimer = CLEAR_FREEZE_SEC;
    encounterBanner = 'STAGE CLEAR';
    if (setStatus) setStatus(`Stage clear — score ${score.get()}`);
  }

  function makeDirector(stagesData) {
    return createStageDirector(stagesData, {
      spawnEnemy: handleSpawnEnemy,
      spawnHazard: handleSpawnHazard,
      onPhaseChange(phase) {
        phaseLabel = phase?.label || phase?.id || '';
        encounterBanner = '';
        activeBoss = null;
        bossScoreAwarded = false;
        if (setStatus && phaseLabel) {
          setStatus(`Phase: ${phaseLabel}`);
        }
      },
      setScrollSpeed(speed) {
        camera.scrollSpeed = speed;
      },
      onBossStart: handleBossStart,
      onBossOutro: handleBossOutro,
      onStageClear: handleStageClear,
    });
  }

  function finishRun(opts = {}) {
    const finalScore = score.get();
    if (runState) runState.lastScore = finalScore;
    const cleared = !!opts.cleared || stageCleared;
    if (setStatus) {
      setStatus(
        cleared
          ? `Stage clear — score ${finalScore}`
          : `Game over — score ${finalScore}`,
      );
    }
    onGameOver({ score: finalScore, cleared });
  }

  function handlePlayerDeath() {
    if (pendingGameOver || pendingStageClear) return;
    pendingGameOver = true;
    frozen = true;
    flashT = 0;
    deathTimer = DEATH_FREEZE_SEC;
    encounterBanner = '';
    if (setStatus) setStatus('Destroyed…');
  }

  /**
   * Multi-hit for entities with numeric `hp`; one-shot otherwise.
   * Bosses use beginDeath() for a short dying animation before notify.
   */
  function resolveProjectileHits() {
    const projectiles = entities.queryByTag('playerProjectile');
    if (projectiles.length === 0) return;

    for (const proj of projectiles) {
      if (!proj.alive) continue;
      for (const e of entities.all()) {
        if (!e.alive || e === proj) continue;
        // Killable targets: tag `enemy` (units, bosses, optional destructible hazards).
        if (!e.tags?.has('enemy')) continue;
        // Ignore targets in dying animation for extra hits (still block projectiles).
        if (e.bossState === 'dying') {
          proj.alive = false;
          break;
        }
        if (!aabbOverlap(proj, e)) continue;

        proj.alive = false;

        const hasHp = typeof e.hp === 'number' && Number.isFinite(e.hp);
        if (hasHp) {
          e.hp = Math.max(0, e.hp - PROJECTILE_DAMAGE);
          // Brief hit flash for multi-hit targets.
          if (e.hp > 0 && e.baseColor) {
            e.color = e.openColor || '#fef08a';
          }
          if (e.hp <= 0) {
            onEntityKilled(e);
          }
        } else {
          e.alive = false;
          score.add(SCORE_ENEMY_KILL);
        }
        break;
      }
    }
  }

  /**
   * @param {object} e
   */
  function onEntityKilled(e) {
    const isBoss = e.tags?.has('boss') || e.type === 'boss';
    if (isBoss) {
      if (!bossScoreAwarded) {
        bossScoreAwarded = true;
        const pts =
          typeof e.scoreValue === 'number' && e.scoreValue > 0
            ? e.scoreValue
            : bossScoreFor(e.kind);
        score.add(pts);
      }
      if (typeof e.beginDeath === 'function') {
        e.beginDeath();
      } else {
        e.alive = false;
      }
      // Notify director once; dying animation continues via customUpdate.
      if (director?.isBossMode?.()) {
        director.notifyBossDefeated();
      }
      activeBoss = e.alive ? e : null;
      return;
    }
    e.alive = false;
    score.add(SCORE_ENEMY_KILL);
  }

  function resolveHazardDamage() {
    if (!player?.alive || player.isDead) return;
    for (const e of entities.all()) {
      if (!e.alive || e === player) continue;
      if (!e.tags?.has('hazard')) continue;
      // Dying bosses no longer deal contact damage.
      if (e.bossState === 'dying' || e.bossState === 'intro') continue;
      if (aabbOverlap(player, e)) {
        const applied = player.takeDamage(1);
        if (applied) {
          e.hit = true;
          if (e.type === 'obstacle' || e.kind === 'block' || e.kind === 'spike') {
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

  function drawBossHud() {
    const boss =
      activeBoss && activeBoss.alive
        ? activeBoss
        : entities.queryByTag('boss')[0];
    if (!boss || !boss.alive) return;
    if (boss.bossState === 'dying') return;

    const maxHp = boss.maxHp || 1;
    const hp = Math.max(0, boss.hp ?? 0);
    const ratio = maxHp > 0 ? hp / maxHp : 0;
    const barW = Math.min(360, viewWidth - 80);
    const barH = 10;
    const x = (viewWidth - barW) / 2;
    const y = 40;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(x - 2, y - 2, barW + 4, barH + 4);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = ratio > 0.33 ? '#e879f9' : '#f87171';
    ctx.fillRect(x, y, barW * ratio, barH);
    ctx.fillStyle = 'rgba(232, 238, 245, 0.85)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const label = String(boss.kind || 'boss').toUpperCase();
    ctx.fillText(`${label}  ${hp}/${maxHp}`, viewWidth / 2, y + barH + 14);
  }

  function drawHud() {
    const hp = player?.hp ?? 0;
    const maxHp = player?.maxHp ?? 0;
    drawHealthBar(hp, maxHp);

    ctx.fillStyle = 'rgba(232, 238, 245, 0.9)';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Score ${score.get()}`, viewWidth - 12, 22);

    // Phase label (center-top); flash brighter while banner is active.
    if (phaseLabel) {
      const banner = director?.getBannerT?.() ?? 0;
      const bright = banner > 0;
      ctx.textAlign = 'center';
      ctx.font = bright
        ? 'bold 16px system-ui, sans-serif'
        : '13px system-ui, sans-serif';
      ctx.fillStyle = bright
        ? 'rgba(250, 204, 21, 0.95)'
        : 'rgba(232, 238, 245, 0.75)';
      const phaseNum = (director?.getPhaseIndex?.() ?? 0) + 1;
      const phaseCount = director?.getPhaseCount?.() ?? 0;
      const suffix = phaseCount > 0 ? ` (${phaseNum}/${phaseCount})` : '';
      ctx.fillText(`${phaseLabel}${suffix}`, viewWidth / 2, 22);
    }

    // Encounter banner (boss intro / phase clear / stage clear).
    if (encounterBanner) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillStyle =
        encounterBanner === 'STAGE CLEAR'
          ? 'rgba(74, 222, 128, 0.95)'
          : encounterBanner === 'PHASE CLEAR'
            ? 'rgba(125, 211, 252, 0.95)'
            : 'rgba(244, 114, 182, 0.95)';
      ctx.fillText(encounterBanner, viewWidth / 2, viewHeight * 0.18);
    }

    if (director?.isBossMode?.() || activeBoss?.alive) {
      drawBossHud();
    }

    ctx.textAlign = 'left';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(232, 238, 245, 0.7)';
    if (pendingGameOver) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('Ship destroyed', 10, 48);
    } else if (pendingStageClear || stageCleared) {
      ctx.fillStyle = '#4ade80';
      ctx.fillText('Stage clear!', 10, 48);
    } else {
      ctx.fillText('WASD/arrows move · Space fire · H dmg · G score · B boss', 10, 48);
    }
  }

  return {
    enter() {
      entities.clear();
      camera.setX(0);
      camera.setY(0);
      camera.scrollSpeed = 90;
      frozen = false;
      flashT = 0;
      deathTimer = 0;
      pendingGameOver = false;
      pendingStageClear = false;
      stageCleared = false;
      phaseLabel = '';
      encounterBanner = '';
      activeBoss = null;
      bossScoreAwarded = false;
      score.reset();
      if (runState) runState.lastScore = 0;
      spawnPlayer();

      const token = ++runToken;
      director = makeDirector(DEFAULT_STAGES);

      // Prefer JSON stages when available; only rebind if still early in this run.
      loadStages().then((stages) => {
        if (token !== runToken) return;
        if (!director || director.getElapsed() > 1.0) return;
        director = makeDirector(stages);
      });

      // Debug: H = take 1 damage, G = +100 score, B = skip to current phase boss.
      onDebugKey = (e) => {
        if (e.repeat || frozen || pendingGameOver || pendingStageClear) return;
        if (e.code === 'KeyH' || e.key === 'h' || e.key === 'H') {
          if (player && !player.isDead) {
            player.takeDamage(1);
            if (player.isDead || player.hp <= 0) handlePlayerDeath();
          }
        } else if (e.code === 'KeyG' || e.key === 'g' || e.key === 'G') {
          score.add(100);
        } else if (e.code === 'KeyB' || e.key === 'b' || e.key === 'B') {
          if (director && typeof director.skipToBoss === 'function') {
            const ok = director.skipToBoss();
            if (ok && setStatus) {
              setStatus(`Debug: boss ${director.getBossId() || ''}`);
            }
          }
        }
      };
      window.addEventListener('keydown', onDebugKey);

      if (setStatus) setStatus('Playing');
    },

    exit() {
      runToken += 1;
      if (onDebugKey) {
        window.removeEventListener('keydown', onDebugKey);
        onDebugKey = null;
      }
      entities.clear();
      player = null;
      director = null;
      phaseLabel = '';
      encounterBanner = '';
      activeBoss = null;
    },

    /**
     * @param {number} dt
     */
    update(dt) {
      if (frozen) {
        flashT += dt;
        if (pendingGameOver || pendingStageClear) {
          deathTimer -= dt;
          if (deathTimer <= 0) {
            finishRun({ cleared: pendingStageClear || stageCleared });
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

      camera.update(dt);

      if (player) {
        player.updateTimers(dt);
        player.tryFire(entities);
      }

      // Stage timeline (spawns enemies/hazards; gates bosses at phase ends).
      if (director) {
        director.update(dt, { camera, player, entities, viewWidth, viewHeight });
      }

      entities.updateAll(dt, { camera, input, player, entities });

      // If boss finished dying animation, drop reference.
      if (activeBoss && !activeBoss.alive) {
        activeBoss = null;
      }

      resolveProjectileHits();
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

      if (
        (pendingStageClear || stageCleared) &&
        Math.floor(flashT * 6) % 2 === 0
      ) {
        ctx.fillStyle = 'rgba(74, 222, 128, 0.12)';
        ctx.fillRect(0, 0, viewWidth, viewHeight);
      }

      drawHud();
      ctx.restore();
    },
  };
}
