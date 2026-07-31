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
  DIRECTOR_MODE,
} from "../src/game/stageDirector.js";
import {
  createBoss,
  spawnBossForPhase,
  bossScoreFor,
  bossHpFor,
  BOSS_KINDS,
  BOSS_SCORES,
  createBossProjectile,
} from "../src/game/bosses.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { aabbOverlap } from "../src/engine/collision.js";
import {
  createAudio,
  getAudio,
  MUTE_STORAGE_KEY,
  __setAudioForTests,
} from "../src/audio.js";
import { createGameOverScene } from "../src/scenes/gameover.js";
import {
  DEFAULT_PORTAL_BASE,
  HANDOFF_QUERY_KEYS,
  PORTAL_BASE_STORAGE_KEY,
  applyPortalHandoff,
  readHandoffParams,
  resolvePortalBase,
  sanitizePortalBase,
  stripHandoffParams,
  verifyPortalToken,
} from "../src/portalHandoff.js";

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

console.log("stage director (no bosses — legacy advance)");
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
  assert("mode wave", dir.getMode() === DIRECTOR_MODE.WAVE);

  dir.update(0.1);
  assert("fires at:0 enemy", spawned.includes("enemy:straight"), JSON.stringify(spawned));

  dir.update(1.0); // phaseTime ~ 1.1
  assert("fires hazard at 1", spawned.includes("hazard:block"), JSON.stringify(spawned));

  dir.update(0.5); // ~1.6
  assert("fires sine at 1.5", spawned.includes("enemy:sine"), JSON.stringify(spawned));

  // Advance past phase 1 duration (2s): no boss → auto-advance
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

console.log("boss factories + multi-hit");
{
  const camera = createCamera({ x: 0, y: 0, width: 960, height: 540, scrollSpeed: 0 });
  const opts = { camera, viewWidth: 960, viewHeight: 540 };

  assert("three boss kinds", BOSS_KINDS.length >= 3);

  for (const kind of BOSS_KINDS) {
    const boss = createBoss(kind, opts);
    assert(
      `${kind} tags`,
      boss.tags.has("enemy") && boss.tags.has("hazard") && boss.tags.has("boss"),
    );
    assert(`${kind} has hp`, typeof boss.hp === "number" && boss.hp === bossHpFor(kind));
    assert(`${kind} maxHp`, boss.maxHp === boss.hp);
    assert(`${kind} score ≫ trash`, bossScoreFor(kind) > SCORE_ENEMY_KILL * 5);
    assert(`${kind} score constant`, BOSS_SCORES[kind] === bossScoreFor(kind));
  }

  const harvester = createBoss("harvester", { ...opts, hp: 5 });
  assert("custom hp", harvester.hp === 5);

  // Simulated multi-hit: N hits kill only after HP depleted.
  const entities = createEntityList();
  const target = createBoss("harvester", { ...opts, hp: 4 });
  entities.add(target);
  let hits = 0;
  while (target.hp > 0 && hits < 20) {
    target.hp -= 1;
    hits += 1;
  }
  assert("multi-hit needs hp hits", hits === 4);
  assert("hp depleted", target.hp === 0);
  if (typeof target.beginDeath === "function") target.beginDeath();
  assert("dying state", target.bossState === "dying");

  // Projectile-style resolution helper (mirrors playing scene logic).
  function resolveHit(proj, e) {
    if (!aabbOverlap(proj, e)) return false;
    proj.alive = false;
    if (typeof e.hp === "number") {
      e.hp = Math.max(0, e.hp - 1);
      if (e.hp <= 0 && typeof e.beginDeath === "function") e.beginDeath();
      return true;
    }
    e.alive = false;
    return true;
  }

  const boss2 = createBoss("interceptor", { ...opts, hp: 3 });
  for (let i = 0; i < 3; i++) {
    const proj = {
      alive: true,
      x: boss2.x + 2,
      y: boss2.y + 2,
      w: 12,
      h: 4,
    };
    resolveHit(proj, boss2);
  }
  assert("3 projectiles kill hp=3 boss", boss2.hp === 0 && boss2.bossState === "dying");

  const viaPhase = spawnBossForPhase(2, opts);
  assert("spawnBossForPhase 2 → overmind", viaPhase.kind === "overmind");

  const shot = createBossProjectile({ x: 100, y: 100, vx: -200 });
  assert("boss shot hazard only", shot.tags.has("hazard") && !shot.tags.has("enemy"));

  // Boss score is substantial vs trash kill.
  const s = createRunScore();
  s.add(bossScoreFor("harvester"));
  assert("boss score substantial", s.get() >= 2000 && s.get() > SCORE_ENEMY_KILL);
}

console.log("stage director boss gate");
{
  /** @type {string[]} */
  const bosses = [];
  /** @type {string[]} */
  const outros = [];
  let cleared = 0;
  let scroll = 90;
  /** @type {string[]} */
  const spawned = [];

  const stages = {
    phases: [
      {
        id: "p1",
        label: "One",
        durationSec: 1.5,
        scrollSpeed: 90,
        boss: "harvester",
        events: [{ at: 0, spawn: "enemy", kind: "straight", y: 0.3 }],
      },
      {
        id: "p2",
        label: "Two",
        durationSec: 1.0,
        scrollSpeed: 110,
        boss: "interceptor",
        events: [{ at: 0.1, spawn: "enemy", kind: "aimer", y: 0.4 }],
      },
      {
        id: "p3",
        label: "Three",
        durationSec: 1.0,
        scrollSpeed: 120,
        boss: "overmind",
        events: [{ at: 0, spawn: "hazard", kind: "spike", y: 0.5 }],
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
    setScrollSpeed(s) {
      scroll = s;
    },
    onBossStart(phase, index, bossId) {
      bosses.push(`${index}:${bossId}`);
    },
    onBossOutro(phase, index) {
      outros.push(`${index}`);
    },
    onStageClear() {
      cleared += 1;
    },
  });

  dir.update(0.2);
  assert("wave spawns before boss", spawned.includes("enemy:straight"));
  assert("still wave mode", dir.getMode() === DIRECTOR_MODE.WAVE);

  // Reach phase duration → boss mode, do not advance phase.
  dir.update(1.5);
  assert("entered boss mode", dir.getMode() === DIRECTOR_MODE.BOSS, `mode=${dir.getMode()}`);
  assert("still phase 0 during boss", dir.getPhaseIndex() === 0);
  assert("boss start fired", bosses.includes("0:harvester"), JSON.stringify(bosses));
  assert("scroll frozen for boss", scroll === 0);

  // Time during boss does not advance phase / re-fire.
  const spawnCount = spawned.length;
  dir.update(5);
  assert("boss mode freezes waves", dir.getMode() === DIRECTOR_MODE.BOSS);
  assert("no extra spawns in boss", spawned.length === spawnCount);
  assert("still phase 0", dir.getPhaseIndex() === 0);

  // Defeat boss → outro → next phase.
  const ok = dir.notifyBossDefeated();
  assert("notifyBossDefeated accepted", ok === true);
  assert("outro mode", dir.getMode() === DIRECTOR_MODE.OUTRO);
  assert("outro recorded", outros.includes("0"), JSON.stringify(outros));

  dir.update(1.5);
  assert("advanced after boss", dir.getPhaseIndex() === 1, `idx=${dir.getPhaseIndex()}`);
  assert("wave after boss", dir.getMode() === DIRECTOR_MODE.WAVE);
  assert("scroll restored phase 2", scroll === 110);

  // skipToBoss debug path
  const skipped = dir.skipToBoss();
  assert("skipToBoss works", skipped === true && dir.getMode() === DIRECTOR_MODE.BOSS);
  assert("boss 2 start", bosses.includes("1:interceptor"), JSON.stringify(bosses));
  dir.notifyBossDefeated();
  dir.update(1.5);
  assert("phase 3 after boss 2", dir.getPhaseIndex() === 2);

  dir.skipToBoss();
  assert("final boss mode", dir.getMode() === DIRECTOR_MODE.BOSS && dir.getBossId() === "overmind");
  dir.notifyBossDefeated();
  dir.update(1.5);
  assert("stage cleared", dir.isCleared() === true, `mode=${dir.getMode()}`);
  assert("onStageClear once", cleared === 1);
  assert("finished", dir.isFinished() === true);

  // DEFAULT_STAGES annotate bosses.
  assert(
    "default phase bosses",
    DEFAULT_STAGES.phases.every((p) => typeof p.boss === "string" && p.boss.length > 0),
  );
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
  const bossIds = new Set();
  for (const p of data.phases) {
    assert(`phase ${p.id} has duration`, Number(p.durationSec) > 0);
    assert(`phase ${p.id} has events`, Array.isArray(p.events) && p.events.length > 0);
    assert(`phase ${p.id} has boss`, typeof p.boss === "string" && p.boss.length > 0);
    bossIds.add(p.boss);
    for (const ev of p.events) {
      if (ev.spawn === "enemy") kinds.add(ev.kind);
      if (ev.spawn === "hazard") hazardKinds.add(ev.kind);
    }
  }
  assert("json includes straight", kinds.has("straight"));
  assert("json includes sine", kinds.has("sine"));
  assert("json includes aimer", kinds.has("aimer"));
  assert("json includes hazard", hazardKinds.size >= 1);
  assert("json has 3 bosses", bossIds.size >= 3, [...bossIds].join(","));

  // Director can run the real JSON script without browser.
  // Bosses gate phase ends — defeat each to advance.
  let enemyCount = 0;
  let hazardCount = 0;
  let bossStarts = 0;
  let stageClears = 0;
  const dir = createStageDirector(data, {
    spawnEnemy() {
      enemyCount += 1;
    },
    spawnHazard() {
      hazardCount += 1;
    },
    onBossStart() {
      bossStarts += 1;
    },
    onStageClear() {
      stageClears += 1;
    },
  });

  const step = 0.25;
  // Run phase 1 body until boss, then clear; repeat for all phases.
  for (let phase = 0; phase < data.phases.length; phase++) {
    const dur = Number(data.phases[phase].durationSec) + 0.5;
    for (let t = 0; t < dur; t += step) {
      dir.update(step);
      if (dir.isBossMode()) break;
    }
    assert(
      `phase ${phase} reaches boss`,
      dir.isBossMode(),
      `mode=${dir.getMode()} idx=${dir.getPhaseIndex()}`,
    );
    dir.notifyBossDefeated();
    // Drain outro into next phase or clear.
    for (let t = 0; t < 2.0; t += step) {
      dir.update(step);
    }
  }

  assert("json script spawns enemies", enemyCount > 5, `enemies=${enemyCount}`);
  assert("json script spawns hazards", hazardCount > 2, `hazards=${hazardCount}`);
  assert("json bosses started", bossStarts === data.phases.length, `starts=${bossStarts}`);
  assert("json stage cleared", stageClears === 1 && dir.isCleared());
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

console.log("visuals (sprites / parallax / fx)");
{
  const {
    PALETTE,
    PIXEL,
  } = await import("../src/game/visuals/palette.js");
  const {
    enablePixelMode,
    fillBlock,
    drawPattern,
    snap,
  } = await import("../src/game/visuals/draw.js");
  const {
    attachSpriteRender,
    drawEntitySprite,
    drawPlayerSprite,
  } = await import("../src/game/visuals/sprites.js");
  const { createParallaxBackground } = await import(
    "../src/game/visuals/background.js"
  );
  const { createFxSystem } = await import("../src/game/visuals/fx.js");

  assert("palette has player + enemy colors", !!PALETTE.playerBody && !!PALETTE.straightBody);
  assert("palette has boss colors", !!PALETTE.harvester && !!PALETTE.overmindCore);
  assert("pixel scale is positive even int", PIXEL >= 2 && PIXEL % 1 === 0);
  assert("snap rounds to grid", snap(5, 2) === 6 || snap(5, 2) === 4);

  // Minimal canvas-like context (records draw ops; no browser).
  /** @type {string[]} */
  const ops = [];
  const fakeCtx = {
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    imageSmoothingEnabled: true,
    fillRect(x, y, w, h) {
      ops.push(`fr:${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}`);
    },
    strokeRect() {
      ops.push("sr");
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    setTransform() {},
    fillText() {},
  };

  enablePixelMode(fakeCtx);
  assert("pixel mode disables smoothing", fakeCtx.imageSmoothingEnabled === false);

  fillBlock(fakeCtx, 10, 10, 8, 8, "#fff");
  assert("fillBlock draws", ops.some((o) => o.startsWith("fr:")));

  ops.length = 0;
  drawPattern(fakeCtx, 0, 0, ["XX", "X."], { X: "#f00" }, "#f00", 2);
  assert("drawPattern paints cells", ops.length === 3, `ops=${ops.length}`);

  const camera = createCamera({ x: 0, y: 0, width: 960, height: 540, scrollSpeed: 0 });
  const { player, entities } = makePlayerHarness();
  assert("player has customRender", typeof player.customRender === "function");
  ops.length = 0;
  player.customRender(fakeCtx, camera);
  assert("player sprite draws blocks", ops.length > 5, `ops=${ops.length}`);

  const straight = createStraightEnemy({
    camera,
    viewWidth: 960,
    viewHeight: 540,
    y: 0.5,
  });
  assert("straight has customRender", typeof straight.customRender === "function");
  ops.length = 0;
  straight.customRender(fakeCtx, camera);
  assert("straight sprite draws", ops.length > 3);

  const sine = createSineEnemy({ camera, viewWidth: 960, viewHeight: 540, y: 0.4 });
  assert("sine has customRender", typeof sine.customRender === "function");

  const aimer = createAimerEnemy({ camera, viewWidth: 960, viewHeight: 540, y: 0.4 });
  assert("aimer has customRender", typeof aimer.customRender === "function");

  const pu = createPowerupPickup({ type: "spread", x: 100, y: 100 });
  assert("powerup has customRender", typeof pu.customRender === "function");
  ops.length = 0;
  pu.customRender(fakeCtx, camera);
  assert("powerup sprite draws", ops.length > 2);

  for (const kind of BOSS_KINDS) {
    const boss = createBoss(kind, { camera, viewWidth: 960, viewHeight: 540 });
    assert(`${kind} boss customRender`, typeof boss.customRender === "function");
    ops.length = 0;
    boss.customRender(fakeCtx, camera);
    assert(`${kind} boss draws multi-block art`, ops.length > 4, `ops=${ops.length}`);
  }

  const block = createBlockHazard({ camera, viewWidth: 960, viewHeight: 540, y: 0.5 });
  assert("block hazard customRender", typeof block.customRender === "function");

  const shot = createEnemyProjectile({ x: 50, y: 50 });
  assert("enemy shot customRender", typeof shot.customRender === "function");

  const proj = attachSpriteRender(
    { type: "playerProjectile", x: 0, y: 0, w: 12, h: 4, alive: true, color: "#7dd3fc" },
  );
  assert("attachSpriteRender sets customRender", typeof proj.customRender === "function");
  assert("drawEntitySprite player", drawEntitySprite(fakeCtx, player, camera) === true);

  // Parallax background renders without throw.
  const bg = createParallaxBackground({ viewWidth: 960, viewHeight: 540 });
  ops.length = 0;
  bg.render(fakeCtx, camera, 0);
  assert("parallax draws layers", ops.length > 10, `ops=${ops.length}`);
  bg.render(fakeCtx, { x: 400 }, 2);
  assert("parallax accepts phase tint", true);

  // FX system: spawn, update, cap, shake.
  const fx = createFxSystem();
  fx.spawnExplosion(100, 100, { big: false });
  fx.spawnMuzzleFlash(50, 50);
  fx.spawnHitSpark(60, 60);
  fx.spawnCollectBurst(70, 70);
  fx.shake(4, 0.2);
  fx.flashScreen("rgba(255,255,255,0.2)", 0.1);
  let st = fx.stats();
  assert("fx has particles after spawn", st.particles > 0, `p=${st.particles}`);
  assert("fx has flashes", st.flashes > 0);
  assert("fx shake active", st.shakeT > 0);
  assert("fx screen flash active", st.screenFlashT > 0);

  // Cap: flood particles
  for (let i = 0; i < 200; i++) {
    fx.spawnSparks(i, i, { count: 2, life: 1 });
  }
  st = fx.stats();
  assert("fx particle cap held", st.particles <= 96, `p=${st.particles}`);

  fx.update(0.05);
  const off = fx.getShakeOffset();
  assert(
    "shake offset finite",
    Number.isFinite(off.x) && Number.isFinite(off.y),
  );
  ops.length = 0;
  fx.render(fakeCtx, camera);
  assert("fx render draws", ops.length > 0);
  fx.renderScreen(fakeCtx, 960, 540);
  fx.clear();
  st = fx.stats();
  assert("fx clear empties", st.particles === 0 && st.flashes === 0 && st.shakeT === 0);

  // Fired projectile also has sprite render (player path).
  const heldFire = { fire: true, left: false, right: false, up: false, down: false };
  const inputFire = {
    isDown(a) {
      return !!heldFire[a];
    },
    wasPressed() {
      return false;
    },
    endFrame() {},
  };
  const p2 = createPlayer({
    camera,
    input: inputFire,
    viewWidth: 960,
    viewHeight: 540,
  });
  const list = createEntityList();
  list.add(p2);
  const bullet = p2.tryFire(list);
  assert("player bullet has customRender", !!bullet && typeof bullet.customRender === "function");

  // Silence unused in case tree-shaking analyzers complain in editors.
  assert("drawPlayerSprite is fn", typeof drawPlayerSprite === "function");
  assert("entities list ok", entities.length >= 1);
}

console.log("audio manager (graceful degrade in Node)");
{
  __setAudioForTests(null);
  const a = createAudio();
  assert("API methods present", typeof a.playSfx === "function" && typeof a.playMusic === "function");
  assert("default unmuted or storage", typeof a.isMuted() === "boolean");
  // No AudioContext in Node — all calls must no-op without throw.
  let threw = false;
  try {
    a.playSfx("shot");
    a.playSfx("explosion");
    a.playSfx("hit");
    a.playSfx("death");
    a.playSfx("powerup");
    a.playSfx("ui_select");
    a.playSfx("ui_confirm");
    a.playSfx("boss_alert");
    a.playMusic("menu");
    a.playMusic("stage");
    a.stopMusic();
    a.setMuted(true);
    a.setMuted(false);
  } catch {
    threw = true;
  }
  assert("play/stop no-throw without context", threw === false);
  assert("mute storage key", MUTE_STORAGE_KEY === "rtypeweb.audio.muted");

  // In-memory mute flip (localStorage may be absent in Node).
  a.setMuted(true);
  assert("setMuted true", a.isMuted() === true);
  a.setMuted(false);
  assert("setMuted false", a.isMuted() === false);

  // Singleton helper returns a usable instance.
  __setAudioForTests(null);
  const shared = getAudio();
  assert("getAudio singleton", shared === getAudio());
  shared.playSfx("shot");
  __setAudioForTests(null);
}

console.log("game-over score submit seams");
await (async () => {
  // Minimal canvas / input / window stubs for Node (no browser).
  if (typeof globalThis.window === "undefined") {
    globalThis.window = /** @type {any} */ (globalThis);
  }
  const win = /** @type {any} */ (globalThis.window);
  const origAdd = typeof win.addEventListener === "function" ? win.addEventListener.bind(win) : null;
  const origRemove =
    typeof win.removeEventListener === "function" ? win.removeEventListener.bind(win) : null;
  win.addEventListener = () => {};
  win.removeEventListener = () => {};

  const canvas = { width: 960, height: 540 };
  const ctx = {
    save() {},
    restore() {},
    setTransform() {},
    scale() {},
    fillRect() {},
    fillText() {},
    fillStyle: "",
    font: "",
    textAlign: "",
  };
  const input = {
    wasPressed() {
      return false;
    },
    endFrame() {},
  };

  // Unregistered: no submit, clear status, menu leaves immediately.
  {
    let menuCalls = 0;
    let submitCalls = 0;
    const scene = createGameOverScene({
      canvas: /** @type {any} */ (canvas),
      ctx: /** @type {any} */ (ctx),
      input,
      onRestart() {},
      onMenu() {
        menuCalls += 1;
      },
      getLastScore: () => 1200,
      getCleared: () => false,
      viewWidth: 960,
      viewHeight: 540,
      loadPlayer: () => null,
      submitScore: async () => {
        submitCalls += 1;
        return { ok: true, status: 201, data: {} };
      },
    });
    scene.enter();
    assert(
      "unregistered status",
      scene._test.getSubmitStatus() === "Not registered — score not submitted",
    );
    scene._test.leaveToMenu();
    assert("unregistered menu immediate", menuCalls === 1);
    assert("unregistered no submit", submitCalls === 0);
    scene.exit();
  }

  // Registered success + await submit before menu (race fix).
  {
    let menuCalls = 0;
    /** @type {() => void} */
    let resolveSubmit = () => {};
    const gate = new Promise((r) => {
      resolveSubmit = r;
    });
    const scene = createGameOverScene({
      canvas: /** @type {any} */ (canvas),
      ctx: /** @type {any} */ (ctx),
      input,
      onRestart() {},
      onMenu() {
        menuCalls += 1;
      },
      getLastScore: () => 9999,
      getCleared: () => true,
      viewWidth: 960,
      viewHeight: 540,
      loadPlayer: () => ({ id: "player-1", nickname: "Ace" }),
      submitScore: async ({ playerId, value }) => {
        assert("submit playerId", playerId === "player-1");
        assert("submit value", value === 9999);
        await gate;
        return { ok: true, status: 201, data: { id: "s1" } };
      },
    });
    scene.enter();
    assert(
      "submitting status",
      scene._test.getSubmitStatus() === "Submitting score…",
    );
    const inflight = scene._test.getSubmitInflight();
    assert("submit inflight promise", !!inflight);
    scene._test.leaveToMenu();
    assert("menu deferred while submit inflight", menuCalls === 0);
    assert(
      "waiting hint while leaving",
      scene._test.getSubmitStatus().includes("returning"),
    );
    resolveSubmit();
    await inflight;
    // leaveToMenu's .then(go) runs after the same settlement.
    await Promise.resolve();
    assert("menu after submit settles", menuCalls === 1);
    assert(
      "saved status",
      scene._test.getSubmitStatus() === "Score saved as Ace",
    );
    scene.exit();
  }

  // Network / throw path surfaces Submit failed.
  {
    const scene = createGameOverScene({
      canvas: /** @type {any} */ (canvas),
      ctx: /** @type {any} */ (ctx),
      input,
      onRestart() {},
      onMenu() {},
      getLastScore: () => 10,
      viewWidth: 960,
      viewHeight: 540,
      loadPlayer: () => ({ id: "p2", nickname: "Bolt" }),
      submitScore: async () => {
        throw new Error("fetch failed");
      },
    });
    scene.enter();
    const inflight = scene._test.getSubmitInflight();
    await inflight;
    await Promise.resolve();
    assert(
      "network error status",
      scene._test.getSubmitStatus() === "Submit failed: fetch failed",
      scene._test.getSubmitStatus(),
    );
    scene.exit();
  }

  // API error body path.
  {
    const scene = createGameOverScene({
      canvas: /** @type {any} */ (canvas),
      ctx: /** @type {any} */ (ctx),
      input,
      onRestart() {},
      onMenu() {},
      getLastScore: () => 10,
      viewWidth: 960,
      viewHeight: 540,
      loadPlayer: () => ({ id: "p3", nickname: "Cy" }),
      submitScore: async () => ({
        ok: false,
        status: 404,
        data: { error: "Player not found", code: "PLAYER_NOT_FOUND" },
      }),
    });
    scene.enter();
    const inflight = scene._test.getSubmitInflight();
    await inflight;
    await Promise.resolve();
    assert(
      "API error status",
      scene._test.getSubmitStatus() === "Submit failed: Player not found",
      scene._test.getSubmitStatus(),
    );
    scene.exit();
  }

  if (origAdd) win.addEventListener = origAdd;
  if (origRemove) win.removeEventListener = origRemove;
})();

console.log("portal handoff helpers");
await (async () => {
  // Parse: no token → null (standalone visit).
  assert("no token → null", readHandoffParams("") === null);
  assert("empty search → null", readHandoffParams("?") === null);
  assert(
    "unrelated params only → null",
    readHandoffParams("?apiBase=http://localhost:3000") === null,
  );

  const parsed = readHandoffParams(
    "?portalToken=tok123&portalPlayerId=id-1&portalNickname=Ace&portalEmail=a%40b.co&portalBase=http://localhost:4000&apiBase=http://localhost:3000",
  );
  assert("token present", !!parsed && parsed.token === "tok123");
  assert("playerId from query", parsed.playerId === "id-1");
  assert("nickname from query", parsed.nickname === "Ace");
  assert("email decoded", parsed.email === "a@b.co");
  assert("portalBase from query", parsed.portalBase === "http://localhost:4000");

  // sanitizePortalBase: http(s) only; non-loopback HTTPS allowed.
  assert("sanitize https prod", sanitizePortalBase("https://webgamesportal.vercel.app/") === "https://webgamesportal.vercel.app");
  assert("sanitize localhost", sanitizePortalBase("http://localhost:3000") === "http://localhost:3000");
  assert("sanitize rejects ftp", sanitizePortalBase("ftp://evil") === null);
  assert("sanitize rejects empty", sanitizePortalBase("  ") === null);
  assert("sanitize rejects garbage", sanitizePortalBase("not a url") === null);

  // resolvePortalBase: query → storage → default
  {
    /** @type {Record<string, string>} */
    const store = {};
    const storage = {
      getItem(k) {
        return store[k] ?? null;
      },
      setItem(k, v) {
        store[k] = String(v);
      },
      removeItem(k) {
        delete store[k];
      },
    };
    assert(
      "default portal base",
      resolvePortalBase({ search: "", storage }) === DEFAULT_PORTAL_BASE,
    );
    assert(
      "query portalBase wins + persists",
      resolvePortalBase({
        search: "?portalBase=http://127.0.0.1:3000",
        storage,
      }) === "http://127.0.0.1:3000",
    );
    assert(
      "stored after query",
      store[PORTAL_BASE_STORAGE_KEY] === "http://127.0.0.1:3000",
    );
    assert(
      "storage used when no query",
      resolvePortalBase({ search: "", storage }) === "http://127.0.0.1:3000",
    );
  }

  // Strip preserves hash + non-handoff params.
  {
    const cleaned = stripHandoffParams(
      "/?portalToken=secret&apiBase=http://localhost:3000&portalPlayerId=x#/play",
    );
    const cleanedUrl = new URL(cleaned, "http://x");
    assert(
      "strip removes portalToken",
      !cleaned.includes("portalToken") && !cleaned.includes("secret"),
    );
    assert(
      "strip keeps apiBase",
      cleanedUrl.searchParams.get("apiBase") === "http://localhost:3000",
    );
    assert("strip keeps hash", cleaned.includes("#/play"));
    for (const key of HANDOFF_QUERY_KEYS) {
      assert(
        `strip removes ${key}`,
        !cleanedUrl.searchParams.has(key),
      );
    }
  }

  // applyPortalHandoff: skipped without token
  {
    const result = await applyPortalHandoff({
      search: "?apiBase=http://localhost:3000",
      fetchImpl: async () => {
        throw new Error("fetch should not run");
      },
      savePlayerFn: () => {
        throw new Error("save should not run");
      },
    });
    assert("no token → skipped", result === "skipped");
  }

  // Applied path: mock verify → savePlayer shape
  {
    /** @type {object | null} */
    let saved = null;
    /** @type {string | null} */
    let fetchUrl = null;
    const loc = {
      pathname: "/",
      search:
        "?portalToken=good-token&portalPlayerId=forged&portalNickname=Forged&portalEmail=forged@x.com",
      hash: "#/",
    };
    let replaced = "";
    const hist = {
      replaceState(_s, _t, url) {
        replaced = String(url);
      },
    };
    const result = await applyPortalHandoff({
      search: loc.search,
      storage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
      fetchImpl: async (url) => {
        fetchUrl = String(url);
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              valid: true,
              player: {
                id: "verified-id",
                nickname: "VerifiedAce",
                email: "ace@portal.test",
              },
              exp: 9999999999,
              iat: 1,
            });
          },
        };
      },
      savePlayerFn: (p) => {
        saved = p;
        return p;
      },
      location: /** @type {any} */ (loc),
      history: /** @type {any} */ (hist),
    });
    assert("applied result", result === "applied");
    assert(
      "saved verified id not query id",
      !!saved &&
        saved.id === "verified-id" &&
        saved.nickname === "VerifiedAce" &&
        saved.email === "ace@portal.test",
    );
    assert(
      "verify URL uses portal + token",
      !!fetchUrl &&
        fetchUrl.startsWith(`${DEFAULT_PORTAL_BASE}/api/auth/verify?token=`) &&
        fetchUrl.includes(encodeURIComponent("good-token")),
    );
    assert(
      "URL stripped after apply",
      replaced !== "" && !replaced.includes("portalToken"),
    );
  }

  // Failed path: 401 — do not save; still strip URL
  {
    let saveCalls = 0;
    let replaced = "";
    const loc = {
      pathname: "/",
      search: "?portalToken=bad&portalPlayerId=forged-id&portalNickname=Hacker",
      hash: "",
    };
    const result = await applyPortalHandoff({
      search: loc.search,
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        async text() {
          return JSON.stringify({
            error: "Invalid token",
            code: "INVALID_TOKEN",
          });
        },
      }),
      savePlayerFn: () => {
        saveCalls += 1;
        return {};
      },
      location: /** @type {any} */ (loc),
      history: {
        replaceState(_s, _t, url) {
          replaced = String(url);
        },
      },
    });
    assert("failed result", result === "failed");
    assert("failed does not save", saveCalls === 0);
    assert(
      "failed still strips token",
      replaced !== "" && !replaced.includes("portalToken"),
    );
  }

  // Network error → failed
  {
    const result = await applyPortalHandoff({
      search: "?portalToken=x",
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
      savePlayerFn: () => {
        throw new Error("should not save");
      },
      history: { replaceState() {} },
      location: { pathname: "/", search: "?portalToken=x", hash: "" },
    });
    assert("network → failed", result === "failed");
  }

  // verifyPortalToken unit shape
  {
    const ok = await verifyPortalToken("t", "https://portal.example", async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          valid: true,
          player: { id: "i", nickname: "n", email: "e@e.com" },
        });
      },
    }));
    assert("verify ok shape", ok.ok === true && ok.player.id === "i");

    const bad = await verifyPortalToken("t", "https://portal.example", async () => ({
      ok: false,
      status: 401,
      async text() {
        return JSON.stringify({ error: "gone", code: "TOKEN_EXPIRED" });
      },
    }));
    assert(
      "verify fail code",
      bad.ok === false && bad.code === "TOKEN_EXPIRED",
    );
  }
})();

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll game smoke checks passed.");
