/**
 * Web Audio manager for menu + combat SFX and looping music.
 * Procedural 8/16-bit-style one-shots and patterns (no external files required).
 * Unlocks on first user gesture; mute persisted in localStorage.
 * All public methods are safe no-ops if AudioContext is unavailable or muted.
 */

export const MUTE_STORAGE_KEY = 'rtypeweb.audio.muted';

/** @typedef {'shot' | 'hit' | 'explosion' | 'death' | 'powerup' | 'ui_select' | 'ui_confirm' | 'boss_alert'} SfxName */
/** @typedef {'menu' | 'stage'} MusicTrack */

const MASTER_GAIN = 0.7;
const MUSIC_GAIN = 0.28;
const SFX_GAIN = 0.5;

/** Min ms between plays for spammy SFX (name → ms). */
const THROTTLE_MS = {
  explosion: 100,
  shot: 45,
  hit: 50,
};

/**
 * @returns {boolean}
 */
function readMutedFromStorage() {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * @param {boolean} muted
 */
function writeMutedToStorage(muted) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Quota / private mode — ignore.
  }
}

/**
 * Create the shared audio API (singleton via createAudio / getAudio).
 * @returns {AudioApi}
 */
export function createAudio() {
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let masterGain = null;
  /** @type {GainNode | null} */
  let sfxGain = null;
  /** @type {GainNode | null} */
  let musicGain = null;

  let unlocked = false;
  let muted = readMutedFromStorage();
  let loadStarted = false;
  let ready = false;
  /** @type {MusicTrack | null} */
  let currentTrack = null;
  /** @type {MusicTrack | null} */
  let pendingTrack = null;
  /** @type {number | null} */
  let musicTimer = null;
  /** @type {OscillatorNode[]} */
  let musicOscs = [];
  /** @type {Record<string, number>} */
  const lastPlayAt = {};
  let warnedUnavailable = false;

  function warnOnce(msg) {
    if (warnedUnavailable) return;
    warnedUnavailable = true;
    console.warn('[rtypeweb/audio]', msg);
  }

  /**
   * @returns {typeof AudioContext | null}
   */
  function AudioContextCtor() {
    if (typeof window === 'undefined') return null;
    return (
      window.AudioContext ||
      /** @type {typeof AudioContext | undefined} */ (window.webkitAudioContext) ||
      null
    );
  }

  function ensureContext() {
    if (ctx) return ctx;
    const Ctor = AudioContextCtor();
    if (!Ctor) {
      warnOnce('AudioContext unavailable — audio disabled');
      return null;
    }
    try {
      ctx = new Ctor();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : MASTER_GAIN;
      masterGain.connect(ctx.destination);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = SFX_GAIN;
      sfxGain.connect(masterGain);

      musicGain = ctx.createGain();
      musicGain.gain.value = MUSIC_GAIN;
      musicGain.connect(masterGain);
      return ctx;
    } catch (err) {
      warnOnce(
        `Failed to create AudioContext: ${err instanceof Error ? err.message : String(err)}`,
      );
      ctx = null;
      return null;
    }
  }

  function applyMasterMute() {
    if (!masterGain || !ctx) return;
    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(muted ? 0 : MASTER_GAIN, now + 0.04);
  }

  /**
   * Schedule a short tone into the SFX bus.
   * @param {number} freq
   * @param {number} duration
   * @param {{ type?: OscillatorType, gain?: number, slideTo?: number, delay?: number }} [opts]
   */
  function tone(freq, duration, opts = {}) {
    if (!ctx || !sfxGain || muted || !unlocked) return;
    const type = opts.type || 'square';
    const peak = opts.gain ?? 0.35;
    const delay = opts.delay ?? 0;
    const t0 = ctx.currentTime + delay;

    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (typeof opts.slideTo === 'number') {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(20, opts.slideTo),
          t0 + duration,
        );
      }
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(g);
      g.connect(sfxGain);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    } catch {
      // Ignore individual voice failures.
    }
  }

  /**
   * Noise burst via buffer (for explosions).
   * @param {number} duration
   * @param {number} [peak]
   */
  function noiseBurst(duration, peak = 0.4) {
    if (!ctx || !sfxGain || muted || !unlocked) return;
    try {
      const sampleRate = ctx.sampleRate;
      const len = Math.max(1, Math.floor(sampleRate * duration));
      const buffer = ctx.createBuffer(1, len, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const env = 1 - i / len;
        data[i] = (Math.random() * 2 - 1) * env * env;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g = ctx.createGain();
      const t0 = ctx.currentTime;
      g.gain.setValueAtTime(peak, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      // Lowpass for less harsh noise.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;
      src.connect(filter);
      filter.connect(g);
      g.connect(sfxGain);
      src.start(t0);
      src.stop(t0 + duration + 0.02);
    } catch {
      // ignore
    }
  }

  /**
   * @param {SfxName | string} name
   */
  function playProceduralSfx(name) {
    switch (name) {
      case 'shot':
        tone(880, 0.06, { type: 'square', gain: 0.18, slideTo: 440 });
        break;
      case 'hit':
        tone(220, 0.05, { type: 'triangle', gain: 0.22 });
        tone(110, 0.07, { type: 'square', gain: 0.12, delay: 0.02 });
        break;
      case 'explosion':
        noiseBurst(0.28, 0.45);
        tone(160, 0.22, { type: 'sawtooth', gain: 0.2, slideTo: 40 });
        break;
      case 'death':
        tone(400, 0.15, { type: 'square', gain: 0.3, slideTo: 80 });
        noiseBurst(0.35, 0.35);
        tone(100, 0.4, { type: 'sawtooth', gain: 0.18, slideTo: 30, delay: 0.08 });
        break;
      case 'powerup':
        tone(523.25, 0.08, { type: 'square', gain: 0.22 });
        tone(659.25, 0.08, { type: 'square', gain: 0.22, delay: 0.07 });
        tone(783.99, 0.12, { type: 'square', gain: 0.25, delay: 0.14 });
        break;
      case 'ui_select':
        tone(660, 0.04, { type: 'square', gain: 0.15 });
        break;
      case 'ui_confirm':
        tone(523.25, 0.06, { type: 'square', gain: 0.18 });
        tone(783.99, 0.1, { type: 'square', gain: 0.2, delay: 0.05 });
        break;
      case 'boss_alert':
        tone(220, 0.12, { type: 'square', gain: 0.28 });
        tone(185, 0.12, { type: 'square', gain: 0.28, delay: 0.14 });
        tone(220, 0.12, { type: 'square', gain: 0.28, delay: 0.28 });
        tone(165, 0.2, { type: 'sawtooth', gain: 0.22, delay: 0.42 });
        break;
      default:
        break;
    }
  }

  function clearMusicVoices() {
    if (musicTimer != null) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
    for (const osc of musicOscs) {
      try {
        osc.stop();
      } catch {
        // already stopped
      }
    }
    musicOscs = [];
  }

  /**
   * Simple looping arpeggio pattern (menu or stage).
   * @param {MusicTrack} track
   */
  function startMusicLoop(track) {
    if (!ctx || !musicGain || !unlocked) return;
    clearMusicVoices();
    currentTrack = track;

    // Note sequences (Hz) — chiptune-ish.
    const menuNotes = [196, 246.94, 293.66, 392, 293.66, 246.94];
    const stageNotes = [130.81, 164.81, 196, 246.94, 196, 164.81, 146.83, 174.61];
    const notes = track === 'stage' ? stageNotes : menuNotes;
    const stepMs = track === 'stage' ? 140 : 180;
    const peak = track === 'stage' ? 0.12 : 0.1;
    const type = /** @type {OscillatorType} */ (track === 'stage' ? 'square' : 'triangle');

    let step = 0;

    const playStep = () => {
      if (!ctx || !musicGain || muted || !unlocked || currentTrack !== track) return;
      try {
        const freq = notes[step % notes.length];
        step += 1;
        const t0 = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        // Soft bass underlay every 4th step.
        if (step % 4 === 0) {
          const bass = ctx.createOscillator();
          const bg = ctx.createGain();
          bass.type = 'triangle';
          bass.frequency.setValueAtTime(freq / 2, t0);
          bg.gain.setValueAtTime(0.0001, t0);
          bg.gain.exponentialRampToValueAtTime(peak * 0.7, t0 + 0.02);
          bg.gain.exponentialRampToValueAtTime(0.0001, t0 + stepMs / 1000);
          bass.connect(bg);
          bg.connect(musicGain);
          bass.start(t0);
          bass.stop(t0 + stepMs / 1000 + 0.02);
          musicOscs.push(bass);
        }
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + (stepMs / 1000) * 0.85);
        osc.connect(g);
        g.connect(musicGain);
        osc.start(t0);
        osc.stop(t0 + stepMs / 1000 + 0.02);
        musicOscs.push(osc);
        // Prune finished refs opportunistically.
        if (musicOscs.length > 32) {
          musicOscs = musicOscs.slice(-16);
        }
      } catch {
        // ignore step failure
      }
    };

    playStep();
    musicTimer = setInterval(playStep, stepMs);
  }

  /**
   * @returns {Promise<void>}
   */
  async function load() {
    if (loadStarted) return;
    loadStarted = true;
    // Procedural path: no fetches. Mark ready once context exists.
    const c = ensureContext();
    ready = !!c;
    if (!ready) {
      warnOnce('Audio load skipped — no context');
    }
  }

  /**
   * Unlock / resume on a user gesture. Idempotent.
   * @returns {Promise<boolean>}
   */
  async function unlockFromGesture() {
    try {
      const c = ensureContext();
      if (!c) return false;
      if (c.state === 'suspended') {
        await c.resume();
      }
      unlocked = c.state === 'running' || c.state === 'suspended';
      // Treat suspended-after-resume-attempt as unlocked for further calls.
      if (c.state === 'running') unlocked = true;
      await load();
      if (unlocked && pendingTrack && !muted) {
        const track = pendingTrack;
        pendingTrack = null;
        startMusicLoop(track);
      } else if (unlocked && currentTrack && !muted && musicTimer == null) {
        startMusicLoop(currentTrack);
      }
      return unlocked;
    } catch (err) {
      warnOnce(
        `Unlock failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /**
   * @param {SfxName | string} name
   * @param {{ force?: boolean }} [opts]
   */
  function playSfx(name, opts = {}) {
    if (muted || !unlocked) return;
    if (!ensureContext()) return;

    const throttle = THROTTLE_MS[name];
    if (throttle && !opts.force) {
      const now = performance.now();
      const last = lastPlayAt[name] || 0;
      if (now - last < throttle) return;
      lastPlayAt[name] = now;
    }

    playProceduralSfx(name);
  }

  /**
   * @param {MusicTrack | string} track
   */
  function playMusic(track) {
    const t = track === 'stage' ? 'stage' : 'menu';
    if (!unlocked) {
      pendingTrack = t;
      currentTrack = t;
      return;
    }
    if (!ensureContext()) return;
    if (muted) {
      currentTrack = t;
      pendingTrack = t;
      return;
    }
    if (currentTrack === t && musicTimer != null) return;
    startMusicLoop(t);
  }

  function stopMusic() {
    pendingTrack = null;
    currentTrack = null;
    clearMusicVoices();
  }

  /**
   * @param {boolean} next
   */
  function setMuted(next) {
    muted = !!next;
    writeMutedToStorage(muted);
    applyMasterMute();
    if (muted) {
      clearMusicVoices();
      // Keep currentTrack so unmute can restore.
    } else if (unlocked && currentTrack) {
      startMusicLoop(currentTrack);
    }
  }

  /**
   * @returns {boolean}
   */
  function isMuted() {
    return muted;
  }

  /**
   * @returns {boolean}
   */
  function isUnlocked() {
    return unlocked;
  }

  /**
   * @returns {boolean}
   */
  function isReady() {
    return ready;
  }

  return {
    unlockFromGesture,
    load,
    playSfx,
    playMusic,
    stopMusic,
    setMuted,
    isMuted,
    isUnlocked,
    isReady,
    /** @deprecated alias */
    getMuted: isMuted,
  };
}

/**
 * @typedef {ReturnType<typeof createAudio>} AudioApi
 */

/** @type {AudioApi | null} */
let singleton = null;

/**
 * Shared audio instance for shell + scenes.
 * @returns {AudioApi}
 */
export function getAudio() {
  if (!singleton) singleton = createAudio();
  return singleton;
}

/**
 * Test helper: replace or clear singleton.
 * @param {AudioApi | null} [instance]
 */
export function __setAudioForTests(instance = null) {
  singleton = instance;
}
