#!/usr/bin/env node
/**
 * Lightweight smoke checks for DEV-150 game modules (no browser).
 * Run: node scripts/smoke-game.mjs
 */
import { createRunScore } from "../src/game/score.js";
import {
  createPlayer,
  PLAYER_MAX_HP,
  PLAYER_INVULN_SEC,
  FIRE_COOLDOWN_SEC,
  SCORE_ENEMY_KILL,
} from "../src/game/player.js";
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
  const camera = createCamera({ x: 0, y: 0, width: 960, height: 540, scrollSpeed: 0 });
  const held = { fire: false };
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

  assert("max hp", player.hp === PLAYER_MAX_HP && player.maxHp === PLAYER_MAX_HP);
  assert("not dead", player.isDead === false);

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

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll game smoke checks passed.");
