/**
 * Axis-aligned bounding box helpers.
 * No physics solver — overlap queries for demo and later combat.
 */

/**
 * @param {{ x: number, y: number, w: number, h: number }} a
 * @param {{ x: number, y: number, w: number, h: number }} b
 * @returns {boolean}
 */
export function aabbOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/**
 * True if entity `e` is fully outside bounds (for off-screen despawn).
 * @param {{ x: number, y: number, w: number, h: number }} e
 * @param {{ x: number, y: number, w: number, h: number }} bounds
 */
export function fullyOutside(e, bounds) {
  return (
    e.x + e.w < bounds.x ||
    e.x > bounds.x + bounds.w ||
    e.y + e.h < bounds.y ||
    e.y > bounds.y + bounds.h
  );
}

/**
 * Pairwise overlap among entities, optional type filter.
 * @param {Iterable<{ alive?: boolean, type?: string, x: number, y: number, w: number, h: number }>} list
 * @param {(a: object, b: object) => boolean} [filter] return true to test pair
 * @returns {Array<[object, object]>}
 */
export function collidePairs(list, filter) {
  const arr = [...list].filter((e) => e.alive !== false);
  /** @type {Array<[object, object]>} */
  const hits = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i];
      const b = arr[j];
      if (filter && !filter(a, b)) continue;
      if (aabbOverlap(a, b)) hits.push([a, b]);
    }
  }
  return hits;
}
