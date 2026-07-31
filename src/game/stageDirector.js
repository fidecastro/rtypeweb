/**
 * Multi-phase stage / wave director driven by JSON timeline scripts.
 * Advances phase timers, fires spawn events once at `at` seconds, notifies UI.
 * Gates phase ends on boss encounters when a phase declares a `boss` id.
 */

/** Minimal offline / smoke fallback when stages.json is unavailable. */
export const DEFAULT_STAGES = {
  phases: [
    {
      id: 'phase-1',
      label: 'Approach',
      durationSec: 20,
      scrollSpeed: 90,
      boss: 'harvester',
      events: [
        { at: 0.5, spawn: 'hazard', kind: 'block', y: 0.35 },
        { at: 2, spawn: 'enemy', kind: 'straight', y: 0.3 },
        { at: 4, spawn: 'enemy', kind: 'straight', y: 0.65 },
        { at: 7, spawn: 'enemy', kind: 'sine', y: 0.5, amplitude: 40 },
        { at: 11, spawn: 'hazard', kind: 'spike', y: 0.7 },
        { at: 14, spawn: 'enemy', kind: 'straight', y: 0.4 },
      ],
    },
    {
      id: 'phase-2',
      label: 'Intercept',
      durationSec: 24,
      scrollSpeed: 105,
      boss: 'interceptor',
      events: [
        { at: 1, spawn: 'enemy', kind: 'sine', y: 0.25, amplitude: 50 },
        { at: 2, spawn: 'enemy', kind: 'sine', y: 0.7, amplitude: 45 },
        { at: 4, spawn: 'hazard', kind: 'zone', y: 0.5 },
        { at: 6, spawn: 'enemy', kind: 'aimer', y: 0.5 },
        { at: 9, spawn: 'enemy', kind: 'straight', y: 0.35 },
        { at: 11, spawn: 'hazard', kind: 'block', y: 0.2 },
        { at: 13, spawn: 'enemy', kind: 'sine', y: 0.55, amplitude: 55 },
        { at: 16, spawn: 'enemy', kind: 'aimer', y: 0.4 },
        { at: 19, spawn: 'hazard', kind: 'spike', y: 0.75 },
      ],
    },
    {
      id: 'phase-3',
      label: 'Assault',
      durationSec: 28,
      scrollSpeed: 120,
      boss: 'overmind',
      events: [
        { at: 0.5, spawn: 'enemy', kind: 'aimer', y: 0.3 },
        { at: 1.5, spawn: 'enemy', kind: 'aimer', y: 0.7 },
        { at: 3, spawn: 'hazard', kind: 'block', y: 0.45 },
        { at: 4, spawn: 'enemy', kind: 'sine', y: 0.5, amplitude: 60 },
        { at: 6, spawn: 'enemy', kind: 'straight', y: 0.2 },
        { at: 7, spawn: 'enemy', kind: 'straight', y: 0.8 },
        { at: 9, spawn: 'hazard', kind: 'spike', y: 0.15 },
        { at: 10, spawn: 'hazard', kind: 'spike', y: 0.85 },
        { at: 12, spawn: 'enemy', kind: 'aimer', y: 0.5 },
        { at: 14, spawn: 'enemy', kind: 'sine', y: 0.35, amplitude: 50 },
        { at: 16, spawn: 'hazard', kind: 'zone', y: 0.55 },
        { at: 18, spawn: 'enemy', kind: 'straight', y: 0.45 },
        { at: 20, spawn: 'enemy', kind: 'aimer', y: 0.6 },
        { at: 22, spawn: 'enemy', kind: 'sine', y: 0.5, amplitude: 70 },
      ],
    },
  ],
};

const STAGES_URL = '/public/assets/data/stages.json';

/** Director encounter modes. */
export const DIRECTOR_MODE = {
  WAVE: 'wave',
  BOSS: 'boss',
  OUTRO: 'outro',
  CLEARED: 'cleared',
};

/**
 * Validate / normalize stages payload; fall back to DEFAULT_STAGES if unusable.
 * @param {unknown} data
 * @returns {typeof DEFAULT_STAGES}
 */
export function normalizeStages(data) {
  if (!data || typeof data !== 'object') return structuredClone(DEFAULT_STAGES);
  const phases = /** @type {{ phases?: unknown }} */ (data).phases;
  if (!Array.isArray(phases) || phases.length === 0) {
    return structuredClone(DEFAULT_STAGES);
  }
  return /** @type {typeof DEFAULT_STAGES} */ (data);
}

/**
 * Load stages JSON from the static asset path; offline fallback on failure.
 * @param {string} [url]
 * @returns {Promise<typeof DEFAULT_STAGES>}
 */
export async function loadStages(url = STAGES_URL) {
  try {
    if (typeof fetch !== 'function') {
      return structuredClone(DEFAULT_STAGES);
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`stages HTTP ${res.status}`);
    const data = await res.json();
    return normalizeStages(data);
  } catch {
    return structuredClone(DEFAULT_STAGES);
  }
}

/**
 * Timeline director for multi-phase runs with optional phase-end bosses.
 *
 * @param {typeof DEFAULT_STAGES} stagesData
 * @param {object} hooks
 * @param {(ev: object, ctx: object) => void} hooks.spawnEnemy
 * @param {(ev: object, ctx: object) => void} hooks.spawnHazard
 * @param {(phase: object, index: number) => void} [hooks.onPhaseChange]
 * @param {(speed: number) => void} [hooks.setScrollSpeed]
 * @param {(phase: object, index: number, bossId: string) => void} [hooks.onBossStart]
 * @param {(phase: object, index: number) => void} [hooks.onBossOutro]
 * @param {() => void} [hooks.onStageClear]
 */
export function createStageDirector(stagesData, hooks) {
  let stages = normalizeStages(stagesData);
  let phaseIndex = 0;
  let phaseTime = 0;
  let totalTime = 0;
  /** @type {Set<number>} */
  let fired = new Set();
  /** Seconds remaining for phase-label banner flash. */
  let bannerT = 0;
  let finished = false;
  /** @type {string} */
  let mode = DIRECTOR_MODE.WAVE;
  /** Outro countdown after boss defeat. */
  let outroT = 0;
  /** Scroll speed to restore after a boss (from next phase or last known). */
  let savedScrollSpeed = 90;

  function currentPhase() {
    return stages.phases[phaseIndex] ?? null;
  }

  function phaseBossId(phase) {
    if (!phase) return '';
    const b = phase.boss;
    if (b == null || b === false || b === '') return '';
    return String(b);
  }

  function beginPhase(index) {
    phaseIndex = index;
    phaseTime = 0;
    fired = new Set();
    finished = false;
    mode = DIRECTOR_MODE.WAVE;
    outroT = 0;
    const phase = currentPhase();
    bannerT = 2.0;
    if (phase) {
      if (phase.scrollSpeed != null) {
        savedScrollSpeed = Number(phase.scrollSpeed) || 90;
        if (typeof hooks.setScrollSpeed === 'function') {
          hooks.setScrollSpeed(savedScrollSpeed);
        }
      }
      if (typeof hooks.onPhaseChange === 'function') {
        hooks.onPhaseChange(phase, phaseIndex);
      }
    }
  }

  function fireEvent(ev, ctx) {
    if (!ev || typeof ev !== 'object') return;
    const spawn = ev.spawn;
    if (spawn === 'enemy' && typeof hooks.spawnEnemy === 'function') {
      hooks.spawnEnemy(ev, ctx);
    } else if (spawn === 'hazard' && typeof hooks.spawnHazard === 'function') {
      hooks.spawnHazard(ev, ctx);
    }
  }

  function enterBossMode() {
    const phase = currentPhase();
    if (!phase) return false;
    const bossId = phaseBossId(phase);
    if (!bossId) return false;
    mode = DIRECTOR_MODE.BOSS;
    const duration = Number(phase.durationSec ?? 30);
    phaseTime = duration;
    bannerT = 2.2;
    // Freeze scroll during boss for a stable arena.
    if (typeof hooks.setScrollSpeed === 'function') {
      hooks.setScrollSpeed(0);
    }
    if (typeof hooks.onBossStart === 'function') {
      hooks.onBossStart(phase, phaseIndex, bossId);
    }
    return true;
  }

  function advanceOrClear() {
    if (phaseIndex < stages.phases.length - 1) {
      beginPhase(phaseIndex + 1);
      return;
    }
    // Final boss (or final phase without boss) complete → stage clear.
    mode = DIRECTOR_MODE.CLEARED;
    finished = true;
    bannerT = 2.5;
    if (typeof hooks.setScrollSpeed === 'function') {
      hooks.setScrollSpeed(0);
    }
    if (typeof hooks.onStageClear === 'function') {
      hooks.onStageClear();
    }
  }

  beginPhase(0);

  return {
    /**
     * Replace script and restart from phase 0 (e.g. after async JSON load).
     * @param {typeof DEFAULT_STAGES} [data]
     */
    reset(data) {
      if (data) stages = normalizeStages(data);
      totalTime = 0;
      beginPhase(0);
    },

    /**
     * @param {number} dt
     * @param {object} [ctx] passed to spawn hooks (camera, player, entities, …)
     */
    update(dt, ctx = {}) {
      if (!stages.phases.length || finished) return;

      const t = Number(dt);
      if (!Number.isFinite(t) || t <= 0) return;

      totalTime += t;
      if (bannerT > 0) bannerT = Math.max(0, bannerT - t);

      // Outro: short pause after boss defeat, then next phase or clear.
      if (mode === DIRECTOR_MODE.OUTRO) {
        outroT -= t;
        if (outroT <= 0) {
          advanceOrClear();
        }
        return;
      }

      // Boss fight: freeze wave timeline (no events, no phase advance).
      if (mode === DIRECTOR_MODE.BOSS) {
        return;
      }

      if (mode === DIRECTOR_MODE.CLEARED) {
        return;
      }

      // Wave mode.
      phaseTime += t;

      const phase = currentPhase();
      if (!phase) return;

      const events = Array.isArray(phase.events) ? phase.events : [];
      for (let i = 0; i < events.length; i++) {
        if (fired.has(i)) continue;
        const ev = events[i];
        const at = Number(ev?.at ?? 0);
        if (phaseTime + 1e-9 >= at) {
          fired.add(i);
          fireEvent(ev, ctx);
        }
      }

      const duration = Number(phase.durationSec ?? 30);
      if (phaseTime < duration) return;

      // Phase body complete.
      if (phaseBossId(phase)) {
        enterBossMode();
        return;
      }

      if (phaseIndex < stages.phases.length - 1) {
        beginPhase(phaseIndex + 1);
        return;
      }

      // Last phase with no boss: loop timeline (legacy continuous-run behavior).
      phaseTime = 0;
      fired = new Set();
      bannerT = 1.2;
      if (typeof hooks.onPhaseChange === 'function') {
        hooks.onPhaseChange(phase, phaseIndex);
      }
    },

    /**
     * Playing scene calls this when the active boss is defeated.
     * Starts outro, then advances phase or clears the stage.
     * @returns {boolean} true if a boss outro was accepted
     */
    notifyBossDefeated() {
      if (mode !== DIRECTOR_MODE.BOSS) return false;
      mode = DIRECTOR_MODE.OUTRO;
      outroT = 1.4;
      bannerT = 2.0;
      const phase = currentPhase();
      if (typeof hooks.onBossOutro === 'function' && phase) {
        hooks.onBossOutro(phase, phaseIndex);
      }
      return true;
    },

    /**
     * Debug / smoke: jump immediately to the current phase's boss (if any).
     * @returns {boolean}
     */
    skipToBoss() {
      if (finished || mode === DIRECTOR_MODE.CLEARED) return false;
      if (mode === DIRECTOR_MODE.BOSS) return true;
      if (mode === DIRECTOR_MODE.OUTRO) return false;
      const phase = currentPhase();
      if (!phaseBossId(phase)) return false;
      // Stop further wave events; enter boss now.
      const duration = Number(phase.durationSec ?? 30);
      phaseTime = duration;
      return enterBossMode();
    },

    /**
     * Debug: jump to a phase index and immediately start its boss.
     * @param {number} index
     * @returns {boolean}
     */
    skipToPhaseBoss(index) {
      if (finished) return false;
      const i = Math.floor(Number(index));
      if (!Number.isFinite(i) || i < 0 || i >= stages.phases.length) return false;
      beginPhase(i);
      return this.skipToBoss();
    },

    getMode() {
      return mode;
    },

    isBossMode() {
      return mode === DIRECTOR_MODE.BOSS;
    },

    isCleared() {
      return mode === DIRECTOR_MODE.CLEARED || finished;
    },

    getBossId() {
      return phaseBossId(currentPhase());
    },

    getPhaseIndex() {
      return phaseIndex;
    },

    getPhaseLabel() {
      return currentPhase()?.label ?? '';
    },

    getPhaseId() {
      return currentPhase()?.id ?? '';
    },

    /** Remaining banner flash time (seconds). */
    getBannerT() {
      return bannerT;
    },

    getPhaseTime() {
      return phaseTime;
    },

    getElapsed() {
      return totalTime;
    },

    getPhaseCount() {
      return stages.phases.length;
    },

    isFinished() {
      return finished;
    },
  };
}
