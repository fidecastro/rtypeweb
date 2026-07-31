/**
 * Multi-phase stage / wave director driven by JSON timeline scripts.
 * Advances phase timers, fires spawn events once at `at` seconds, notifies UI.
 */

/** Minimal offline / smoke fallback when stages.json is unavailable. */
export const DEFAULT_STAGES = {
  phases: [
    {
      id: 'phase-1',
      label: 'Approach',
      durationSec: 20,
      scrollSpeed: 90,
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
 * Timeline director for multi-phase runs.
 *
 * @param {typeof DEFAULT_STAGES} stagesData
 * @param {object} hooks
 * @param {(ev: object, ctx: object) => void} hooks.spawnEnemy
 * @param {(ev: object, ctx: object) => void} hooks.spawnHazard
 * @param {(phase: object, index: number) => void} [hooks.onPhaseChange]
 * @param {(speed: number) => void} [hooks.setScrollSpeed]
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

  function currentPhase() {
    return stages.phases[phaseIndex] ?? null;
  }

  function beginPhase(index) {
    phaseIndex = index;
    phaseTime = 0;
    fired = new Set();
    finished = false;
    const phase = currentPhase();
    bannerT = 2.0;
    if (phase) {
      if (typeof hooks.onPhaseChange === 'function') {
        hooks.onPhaseChange(phase, phaseIndex);
      }
      if (
        phase.scrollSpeed != null &&
        typeof hooks.setScrollSpeed === 'function'
      ) {
        hooks.setScrollSpeed(Number(phase.scrollSpeed) || 90);
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
      phaseTime += t;
      if (bannerT > 0) bannerT = Math.max(0, bannerT - t);

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

      if (phaseIndex < stages.phases.length - 1) {
        beginPhase(phaseIndex + 1);
        return;
      }

      // Last phase complete: loop its timeline so a continuous run never idles.
      phaseTime = 0;
      fired = new Set();
      bannerT = 1.2;
      if (typeof hooks.onPhaseChange === 'function') {
        hooks.onPhaseChange(phase, phaseIndex);
      }
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
  };
}
