/**
 * Fixed-timestep game loop driven by requestAnimationFrame.
 * Separates update(dt) from render(alpha) and caps spiral-of-death steps.
 */

const DEFAULT_DT = 1 / 60;
const DEFAULT_MAX_STEPS = 5;

/**
 * @param {object} options
 * @param {(dt: number) => void} options.update
 * @param {(alpha: number) => void} options.render
 * @param {number} [options.fixedDt]
 * @param {number} [options.maxSteps]
 */
export function createLoop({
  update,
  render,
  fixedDt = DEFAULT_DT,
  maxSteps = DEFAULT_MAX_STEPS,
}) {
  let running = false;
  let rafId = 0;
  let lastMs = 0;
  let accumulator = 0;

  function frame(nowMs) {
    if (!running) return;

    if (lastMs === 0) lastMs = nowMs;
    let frameDt = (nowMs - lastMs) / 1000;
    lastMs = nowMs;

    // Clamp huge pauses (tab switch) so we don't simulate minutes at once.
    if (frameDt > 0.25) frameDt = 0.25;

    accumulator += frameDt;
    let steps = 0;
    while (accumulator >= fixedDt && steps < maxSteps) {
      update(fixedDt);
      accumulator -= fixedDt;
      steps += 1;
    }
    // Drop leftover time past the cap to avoid spiral of death.
    if (steps === maxSteps) {
      accumulator = 0;
    }

    const alpha = accumulator / fixedDt;
    render(alpha);

    rafId = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastMs = 0;
      accumulator = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
    isRunning() {
      return running;
    },
    get fixedDt() {
      return fixedDt;
    },
  };
}
