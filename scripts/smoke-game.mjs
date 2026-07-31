#!/usr/bin/env node
/**
 * Lightweight smoke checks for game modules (no browser).
 * Run: node scripts/smoke-game.mjs
 */
import { createRunScore } from "../src/game/score.js";
import {
  createPlayer,
  PLAYER_MAX_HP,
  PLAYER_INVULN_SEC,
  PLAYER_SPEED,
  FIRE_COOLDOWN_SEC,
  SCORE_ENEMY_KILL,
} from "../src/game/player.js";
import {
  AEGIS_MAX_CHARGES,
  RAPID_COOLDOWN_FACTOR,
  SURGE_DURATION_SEC,
  SURGE_SPEED_FACTOR,
  applyPowerup,
  createPowerupPickup,
  getPowerupHudState,
} from "../src/game/powerups.js";
import { createEntityList } from "../src/engine/entity.js";
import { createCamera } from "../src/engine/camera.js";

let failed = 0;

/**
 * @param {string} name
 * @param {boolean} cond
 * @param {string} [detail]
 */
function assert(name, cond, detail = "") {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/**
 * @returns {{ camera: object, input: object, held: Record<string, boolean>, entities: object, player: object }}
 */
function makePlayerHarness() {
  const camera = createCamera({ x: 0, y: 0, width: 960, height: 540, scrollSpeed: 0 });
  const held = { fire: false, left: false, right: false, up: false, down: false };
  const input = {
    isDown(a) {
      return !!held[a];
    },
    wasPressed() {
      return false;
    },
    endFrame() {},
  };
  const entities = createEntityList();
  const player = createPlayer({
    camera,
    input,
    viewWidth: 960,
    viewHeight: 540,
  });
  entities.add(player);
  return { camera, input, held, entities, player };
}

console.log("score API");
{
  const s = createRunScore();
  assert("starts at 0", s.get() === 0);
  s.add(100);
  assert("add 100", s.get() === 100);
  s.add(50);
  assert("add 50 → 150", s.get() === 150);
  s.add(-10);
  assert("negative reduces but floor 0", s.get() === 140);
  s.add(1.7);
  assert("floors points", s.get() === 141);
  s.reset();
  assert("reset", s.get() === 0);
  s.add(SCORE_ENEMY_KILL);
  assert("enemy kill constant", s.get() === 100);
}

console.log("player damage / fire");
{
  const { held, entities, player } = makePlayerHarness();

  assert("max hp", player.hp === PLAYER_MAX_HP && player.maxHp === PLAYER_MAX_HP);
  assert("not dead", player.isDead === false);
  assert("default weapon base", player.weaponMode === "base");
  assert("default no aegis", player.aegisCharges === 0);

  const ok1 = player.takeDamage(1);
  assert("takeDamage applies", ok1 === true && player.hp === PLAYER_MAX_HP - 1);

  const blocked = player.takeDamage(1);
  assert("invuln blocks second hit", blocked === false && player.hp === PLAYER_MAX_HP - 1);

  player.updateTimers(PLAYER_INVULN_SEC + 0.01);
  const ok2 = player.takeDamage(1);
  assert("after invuln damage works", ok2 === true && player.hp === PLAYER_MAX_HP - 2);

  held.fire = true;
  const p1 = player.tryFire(entities);
  assert("fires projectile", !!p1 && p1.type === "playerProjectile");
  const p2 = player.tryFire(entities);
  assert("cooldown blocks double fire", p2 === null);
  player.updateTimers(FIRE_COOLDOWN_SEC + 0.01);
  const p3 = player.tryFire(entities);
  assert("fires after cooldown", !!p3);

  player.updateTimers(PLAYER_INVULN_SEC + 0.01);
  player.takeDamage(99);
  assert("lethal damage", player.isDead === true && player.hp === 0);
  assert("dead no fire", player.tryFire(entities) === null);
}

console.log("powerups");
{
  // Weapon mode replacement: rapid then spread → spread only.
  {
    const { player } = makePlayerHarness();
    const r1 = applyPowerup(player, "rapid");
    assert("apply rapid", r1.applied === true && player.weaponMode === "rapid");
    assert("rapid cooldown factor", player.getFireCooldown() === FIRE_COOLDOWN_SEC * RAPID_COOLDOWN_FACTOR);
    const r2 = applyPowerup(player, "spread");
    assert("spread replaces rapid", r2.applied === true && player.weaponMode === "spread");
    assert(
      "spread uses base cooldown",
      player.getFireCooldown() === FIRE_COOLDOWN_SEC,
    );
    const hud = getPowerupHudState(player);
    assert("hud weapon spread", hud.weapon === "spread");
  }

  // Aegis charges cap at 2; third does not exceed.
  {
    const { player } = makePlayerHarness();
    applyPowerup(player, "aegis");
    applyPowerup(player, "aegis");
    assert("aegis two charges", player.aegisCharges === AEGIS_MAX_CHARGES);
    applyPowerup(player, "aegis");
    assert("aegis cap holds", player.aegisCharges === AEGIS_MAX_CHARGES);
    const hud = getPowerupHudState(player);
    assert("hud aegis 2", hud.aegisCharges === 2);
  }

  // Aegis absorb: first hit no HP loss; second damages (after clearing any flash).
  {
    const { player } = makePlayerHarness();
    applyPowerup(player, "aegis");
    assert("aegis one charge", player.aegisCharges === 1);
    const hpBefore = player.hp;
    const absorbed = player.takeDamage(1);
    assert(
      "aegis absorbs (no damage flag)",
      absorbed === false && player.hp === hpBefore && player.aegisCharges === 0,
    );
    // Absorb does not grant invuln — next hit applies immediately.
    const applied = player.takeDamage(1);
    assert(
      "second hit damages after absorb",
      applied === true && player.hp === hpBefore - 1,
    );
  }

  // Surge: elevated speed within window; base after duration.
  {
    const { player } = makePlayerHarness();
    assert("base move speed", player.getMoveSpeed() === PLAYER_SPEED);
    applyPowerup(player, "surge");
    assert(
      "surge speed elevated",
      player.hasSurgeActive() === true &&
        player.getMoveSpeed() === PLAYER_SPEED * SURGE_SPEED_FACTOR,
    );
    player.updateTimers(SURGE_DURATION_SEC / 2);
    assert("surge still active mid-window", player.hasSurgeActive() === true);
    // Refresh: re-apply mid-window → full duration again.
    const midTime = player._time;
    applyPowerup(player, "surge");
    assert(
      "surge refresh extends",
      player.surgeUntil === midTime + SURGE_DURATION_SEC,
    );
    player.updateTimers(SURGE_DURATION_SEC + 0.01);
    assert(
      "surge ends → base speed",
      player.hasSurgeActive() === false && player.getMoveSpeed() === PLAYER_SPEED,
    );
    const hud = getPowerupHudState(player);
    assert("hud surge remaining 0", hud.surgeRemaining === 0);
  }

  // Tri-beam: tryFire under spread with fire held → 3 projectiles.
  {
    const { held, entities, player } = makePlayerHarness();
    applyPowerup(player, "spread");
    held.fire = true;
    const before = entities.queryByTag("playerProjectile").length;
    const primary = player.tryFire(entities);
    const after = entities.queryByTag("playerProjectile");
    assert("spread returns primary", !!primary && primary.type === "playerProjectile");
    assert(
      "spread spawns 3 projectiles",
      after.length === before + 3,
      `got ${after.length - before}`,
    );
    const hasUp = after.some((p) => p.vy < 0);
    const hasDown = after.some((p) => p.vy > 0);
    const hasCenter = after.some((p) => p.vy === 0 && p.vx > 0);
    assert("spread has angled shots", hasUp && hasDown && hasCenter);
  }

  // Pickup factory tags (must not be hazard).
  {
    const p = createPowerupPickup({ type: "aegis", x: 10, y: 20 });
    assert("pickup type powerup", p.type === "powerup" && p.powerupType === "aegis");
    assert("pickup tags", p.tags.has("pickup") && p.tags.has("powerup"));
    assert("pickup not hazard", !p.tags.has("hazard"));
  }

  // Weapon + aegis + surge can coexist.
  {
    const { player } = makePlayerHarness();
    applyPowerup(player, "rapid");
    applyPowerup(player, "aegis");
    applyPowerup(player, "surge");
    assert(
      "independent stacks",
      player.weaponMode === "rapid" &&
        player.aegisCharges === 1 &&
        player.hasSurgeActive() === true,
    );
  }
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll game smoke checks passed.");
