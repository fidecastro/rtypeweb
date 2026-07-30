/**
 * Minimal entity model + list (spawn / update / render / despawn).
 * Not a full ECS — enough for player, enemies, and bosses to plug in later.
 */

import { fullyOutside } from './collision.js';

let nextId = 1;

/**
 * @param {object} [props]
 * @returns {object}
 */
export function createEntity(props = {}) {
  const e = {
    id: props.id ?? nextId++,
    x: props.x ?? 0,
    y: props.y ?? 0,
    w: props.w ?? 16,
    h: props.h ?? 16,
    vx: props.vx ?? 0,
    vy: props.vy ?? 0,
    alive: props.alive !== false,
    type: props.type ?? 'entity',
    tags: props.tags ? new Set(props.tags) : new Set(),
    color: props.color ?? '#9ecbff',
    /** If true, kill when fully outside camera view (player should stay false). */
    despawnWhenOffscreen: props.despawnWhenOffscreen ?? false,
    ...props,
  };
  // Ensure tags is a Set even if spread overwrote with array.
  if (!(e.tags instanceof Set)) {
    e.tags = new Set(e.tags || []);
  }
  return e;
}

/**
 * Default motion + optional custom update hook on entity.customUpdate.
 * @param {object} entity
 * @param {number} dt
 * @param {object} ctx
 */
export function updateEntity(entity, dt, ctx) {
  if (!entity.alive) return;
  if (typeof entity.customUpdate === 'function') {
    entity.customUpdate(dt, ctx);
  } else {
    entity.x += entity.vx * dt;
    entity.y += entity.vy * dt;
  }
}

/**
 * Draw entity as a filled rect in world space via camera.
 * @param {object} entity
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ worldToScreen: (x: number, y: number) => { x: number, y: number } }} camera
 */
export function renderEntity(entity, ctx, camera) {
  if (!entity.alive) return;
  const { x, y } = camera.worldToScreen(entity.x, entity.y);
  ctx.fillStyle = entity.color;
  ctx.fillRect(x, y, entity.w, entity.h);
}

/**
 * Entity collection with spawn / prune / query helpers.
 */
export function createEntityList() {
  /** @type {object[]} */
  const items = [];

  return {
    /**
     * @param {object} entity
     */
    add(entity) {
      items.push(entity);
      return entity;
    },

    /**
     * @param {object | number} entityOrId
     */
    markDead(entityOrId) {
      const id = typeof entityOrId === 'number' ? entityOrId : entityOrId.id;
      for (const e of items) {
        if (e.id === id) {
          e.alive = false;
          break;
        }
      }
    },

    /**
     * @param {number} dt
     * @param {object} ctx must include camera for off-screen despawn
     */
    updateAll(dt, ctx) {
      for (const e of items) {
        if (!e.alive) continue;
        updateEntity(e, dt, ctx);
      }

      const camera = ctx?.camera;
      if (camera) {
        const bounds = camera.viewBounds(32);
        for (const e of items) {
          if (!e.alive || !e.despawnWhenOffscreen) continue;
          if (fullyOutside(e, bounds)) {
            e.alive = false;
          }
        }
      }

      this.prune();
    },

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {object} camera
     */
    renderAll(ctx, camera) {
      for (const e of items) {
        if (!e.alive) continue;
        if (typeof e.customRender === 'function') {
          e.customRender(ctx, camera);
        } else {
          renderEntity(e, ctx, camera);
        }
      }
    },

    prune() {
      for (let i = items.length - 1; i >= 0; i--) {
        if (!items[i].alive) items.splice(i, 1);
      }
    },

    /**
     * @param {string} type
     */
    queryByType(type) {
      return items.filter((e) => e.alive && e.type === type);
    },

    /**
     * @param {string} tag
     */
    queryByTag(tag) {
      return items.filter((e) => e.alive && e.tags?.has(tag));
    },

    /**
     * @returns {readonly object[]}
     */
    all() {
      return items;
    },

    clear() {
      items.length = 0;
    },

    get length() {
      return items.length;
    },
  };
}
