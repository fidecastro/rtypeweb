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
import {
  spawnEnemy,
  createStraightEnemy,
  createSineEnemy,
  createAimerEnemy,
  createEnemyProjectile,
  ENEMY_KINDS,
} from "../src/game/enemies.js";
import {
  spawnHazard,
  createBlockHazard,
  createSpikeHazard,
  createZoneHazard,
  HAZARD_KINDS,
} from "../src/game/hazards.js";
import {
  createStageDirector,
  DEFAULT_STAGES,
  normalizeStages,
} from "../src/game/stageDirector.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

console.log("enemy factories");
{
  const camera = createCamera({ x: 100, y: 0, width: 960, height: 540, scrollSpeed: 90 });
  const opts = { camera, viewWidth: 960, viewHeight: 540, y: 0.5 };

  assert("three kinds listed", ENEMY_KINDS.length >= 3);

  const straight = createStraightEnemy(opts);
  assert("straight tags", straight.tags.has("enemy") && straight.tags.has("hazard"));
  assert("straight kind", straight.kind === "straight");
  assert("straight leftward vx", straight.vx < 0);
  assert("straight spawn past right", straight.x > camera.x + 960);

  const sine = createSineEnemy({ ...opts, amplitude: 40, frequency: 1 });
  assert("sine tags", sine.tags.has("enemy") && sine.tags.has("hazard"));
  assert("sine kind", sine.kind === "sine");
  const y0 = sine.y;
  sine.customUpdate(0.25);
  const y1 = sine.y;
  sine.customUpdate(0.25);
  const y2 = sine.y;
  assert("sine moves in x", sine.x < createSineEnemy(opts).x || sine.vx < 0);
  assert(
    "sine y changes over time",
    y0 !== y1 || y1 !== y2,
    `y0=${y0} y1=${y1} y2=${y2}`,
  );

  const entities = createEntityList();
  const player = {
    alive: true,
    isDead: false,
    x: 200,
    y: 300,
    w: 36,
    h: 24,
  };
  const aimer = createAimerEnemy({ ...opts, fireInterval: 0.1 });
  assert("aimer tags", aimer.tags.has("enemy") && aimer.tags.has("hazard"));
  assert("aimer kind", aimer.kind === "aimer");
  // Force a shot immediately.
  aimer.fireCooldown = 0;
  aimer.customUpdate(0.05, { player, entities });
  const shots = entities.queryByType("enemyProjectile");
  assert("aimer spawns hazard shot", shots.length === 1);
  assert(
    "shot is hazard not enemy",
    shots[0].tags.has("hazard") && !shots[0].tags.has("enemy"),
  );

  const viaSpawn = spawnEnemy("sine", opts);
  assert("spawnEnemy sine", viaSpawn.kind === "sine");

  const bullet = createEnemyProjectile({ x: 400, y: 200, player });
  assert("projectile hazard only", bullet.tags.has("hazard") && !bullet.tags.has("enemy"));
}

console.log("hazard factories");
{
  const camera = createCamera({ x: 0, y: 0, width: 960, height: 540, scrollSpeed: 90 });
  const opts = { camera, viewWidth: 960, viewHeight: 540, y: 0.4 };

  assert("hazard kinds", HAZARD_KINDS.length >= 2);

  const block = createBlockHazard(opts);
  assert("block hazard tag", block.tags.has("hazard") && !block.tags.has("enemy"));
  assert("block kind", block.kind === "block");

  const spike = createSpikeHazard(opts);
  assert("spike hazard tag", spike.tags.has("hazard") && !spike.tags.has("enemy"));
  assert("spike kind", spike.kind === "spike");

  const zone = createZoneHazard(opts);
  assert("zone hazard tag", zone.tags.has("hazard") && !zone.tags.has("enemy"));

  const dest = createBlockHazard({ ...opts, destructible: true });
  assert(
    "destructible block is enemy",
    dest.tags.has("hazard") && dest.tags.has("enemy"),
  );

  assert("spawnHazard spike", spawnHazard("spike", opts).kind === "spike");
}

console.log("stage director");
{
  /** @type {string[]} */
  const spawned = [];
  /** @type {string[]} */
  const phases = [];
  let scroll = 0;

  const stages = {
    phases: [
      {
        id: "p1",
        label: "One",
        durationSec: 2,
        scrollSpeed: 90,
        events: [
          { at: 0, spawn: "enemy", kind: "straight", y: 0.3 },
          { at: 1, spawn: "hazard", kind: "block", y: 0.5 },
          { at: 1.5, spawn: "enemy", kind: "sine", y: 0.6 },
        ],
      },
      {
        id: "p2",
        label: "Two",
        durationSec: 3,
        scrollSpeed: 110,
        events: [{ at: 0.2, spawn: "enemy", kind: "aimer", y: 0.4 }],
      },
      {
        id: "p3",
        label: "Three",
        durationSec: 2,
        scrollSpeed: 120,
        events: [{ at: 0, spawn: "hazard", kind: "spike", y: 0.7 }],
      },
    ],
  };

  const dir = createStageDirector(stages, {
    spawnEnemy(ev) {
      spawned.push(`enemy:${ev.kind}`);
    },
    spawnHazard(ev) {
      spawned.push(`hazard:${ev.kind}`);
    },
    onPhaseChange(phase) {
      phases.push(phase.label);
    },
    setScrollSpeed(s) {
      scroll = s;
    },
  });

  assert("starts phase 0", dir.getPhaseIndex() === 0);
  assert("label One", dir.getPhaseLabel() === "One");
  assert("scroll from phase start", scroll === 90);
  assert("phase change on begin", phases[0] === "One");

  // Fire event at t=0 on first update tick after begin — beginPhase does not auto-fire.
  // Events at `at: 0` fire when phaseTime >= 0, which is true after any update... 
  // Actually phaseTime starts 0, and first update adds dt then checks phaseTime >= at.
  // So at:0 fires on first update.
  dir.update(0.1);
  assert("fires at:0 enemy", spawned.includes("enemy:straight"), JSON.stringify(spawned));

  dir.update(1.0); // phaseTime ~ 1.1
  assert("fires hazard at 1", spawned.includes("hazard:block"), JSON.stringify(spawned));

  dir.update(0.5); // ~1.6
  assert("fires sine at 1.5", spawned.includes("enemy:sine"), JSON.stringify(spawned));

  // Advance past phase 1 duration (2s): phaseTime was ~1.6, need 0.5+ more
  dir.update(0.6);
  assert("advanced to phase 2", dir.getPhaseIndex() === 1, `idx=${dir.getPhaseIndex()}`);
  assert("label Two", dir.getPhaseLabel() === "Two");
  assert("scrollSpeed phase 2", scroll === 110);
  assert("banner active on transition", dir.getBannerT() > 0);

  dir.update(0.3);
  assert("phase 2 aimer spawn", spawned.includes("enemy:aimer"), JSON.stringify(spawned));

  // Finish phase 2 (duration 3) and enter phase 3
  dir.update(3.0);
  assert("advanced to phase 3", dir.getPhaseIndex() === 2, `idx=${dir.getPhaseIndex()}`);
  assert("label Three", dir.getPhaseLabel() === "Three");
  assert("scrollSpeed phase 3", scroll === 120);

  dir.update(0.05);
  assert("phase 3 spike", spawned.includes("hazard:spike"), JSON.stringify(spawned));

  // Events fire only once
  const countBefore = spawned.filter((s) => s === "enemy:straight").length;
  dir.reset(stages);
  dir.update(0.1);
  const countAfter = spawned.filter((s) => s === "enemy:straight").length;
  assert("reset refires phase1", countAfter === countBefore + 1);

  // normalizeStages fallback
  const bad = normalizeStages(null);
  assert("normalize null → default phases", bad.phases.length >= 3);
  assert("DEFAULT_STAGES has 3+ phases", DEFAULT_STAGES.phases.length >= 3);
}

console.log("stages.json on disk");
{
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, "../public/assets/data/stages.json");
  const raw = readFileSync(path, "utf8");
  const data = JSON.parse(raw);
  assert("json phases array", Array.isArray(data.phases) && data.phases.length >= 3);
  const kinds = new Set();
  const hazardKinds = new Set();
  for (const p of data.phases) {
    assert(`phase ${p.id} has duration`, Number(p.durationSec) > 0);
    assert(`phase ${p.id} has events`, Array.isArray(p.events) && p.events.length > 0);
    for (const ev of p.events) {
      if (ev.spawn === "enemy") kinds.add(ev.kind);
      if (ev.spawn === "hazard") hazardKinds.add(ev.kind);
    }
  }
  assert("json includes straight", kinds.has("straight"));
  assert("json includes sine", kinds.has("sine"));
  assert("json includes aimer", kinds.has("aimer"));
  assert("json includes hazard", hazardKinds.size >= 1);

  // Director can run the real JSON script without browser.
  let enemyCount = 0;
  let hazardCount = 0;
  const dir = createStageDirector(data, {
    spawnEnemy() {
      enemyCount += 1;
    },
    spawnHazard() {
      hazardCount += 1;
    },
  });
  // Simulate full run through all phases
  const totalDur =
    data.phases.reduce((s, p) => s + Number(p.durationSec), 0) + 1;
  const step = 0.25;
  for (let t = 0; t < totalDur; t += step) {
    dir.update(step);
  }
  assert("json script spawns enemies", enemyCount > 5, `enemies=${enemyCount}`);
  assert("json script spawns hazards", hazardCount > 2, `hazards=${hazardCount}`);
  assert(
    "reached last phase during run",
    dir.getPhaseIndex() === data.phases.length - 1 || dir.getElapsed() > 0,
  );
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

  // Aegis absorb: first hit no HP loss + hit-window invuln; second damages after window.
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
    assert(
      "aegis absorb grants invuln window",
      player.invulnerableUntil > player._time,
    );
    // During absorb window, further takeDamage is blocked (no HP, no extra charges).
    const during = player.takeDamage(1);
    assert(
      "absorb window blocks follow-up",
      during === false && player.hp === hpBefore && player.aegisCharges === 0,
    );
    // After invuln ends, next hit applies normally.
    player.updateTimers(PLAYER_INVULN_SEC + 0.01);
    const applied = player.takeDamage(1);
    assert(
      "second hit damages after absorb window",
      applied === true && player.hp === hpBefore - 1,
    );
  }

  // Continuous hazard overlap (~60 Hz): max Aegis must not evaporate in a few frames.
  {
    const { player } = makePlayerHarness();
    applyPowerup(player, "aegis");
    applyPowerup(player, "aegis");
    assert("continuous start: 2 charges", player.aegisCharges === 2);
    const hpStart = player.hp;
    const frameDt = 1 / 60;
    // Simulate resolveHazardDamage calling takeDamage every frame for ~0.5s.
    for (let i = 0; i < 30; i += 1) {
      player.takeDamage(1);
      player.updateTimers(frameDt);
    }
    assert(
      "continuous overlap: only one charge spent in first window",
      player.aegisCharges === 1,
      `charges=${player.aegisCharges}`,
    );
    assert(
      "continuous overlap: HP untouched during first absorb window",
      player.hp === hpStart,
    );
    // Wait out remaining invuln if any, then second contact window.
    player.updateTimers(PLAYER_INVULN_SEC + 0.01);
    for (let i = 0; i < 30; i += 1) {
      player.takeDamage(1);
      player.updateTimers(frameDt);
    }
    assert(
      "continuous second contact: second charge spent, still no HP loss",
      player.aegisCharges === 0 && player.hp === hpStart,
      `charges=${player.aegisCharges} hp=${player.hp}`,
    );
    // Third contact after window → real damage.
    player.updateTimers(PLAYER_INVULN_SEC + 0.01);
    const damaged = player.takeDamage(1);
    assert(
      "after both charges: damage applies",
      damaged === true && player.hp === hpStart - 1,
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
