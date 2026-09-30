// MAP MAKER — what a drag takes along: the grabbed piece's layered "structure". A platform
// brings its rock tiers, the stalactites under it, the trims on its edges and whatever stands on
// or is built into it; its neighbours (side by side) stay, and so does the floor it stands on.
//
// Two pieces are linked when they touch (within 0.05 m) AND are stacked: seen from above, their
// footprints overlap by at least 30 % of the smaller one, or one is embedded in the other (their
// overlap is at least 30 % of the smaller one's volume). A piece much bigger than the grabbed
// one (footprint over 3×) lying below it is what it stands on: the search never climbs into it.
// Plain maths on bounding boxes (a curve's many pieces count as one thing by their key).
import type { Vec3 } from '@space-yz/shared';

export const STRUCTURE = {
  /** touching within this (m) */
  eps: 0.05,
  /** stacked: footprints overlap by this share of the smaller one */
  footprint: 0.3,
  /** embedded: overlap volume at least this share of the smaller one */
  embedded: 0.3,
  /** a piece this many times the grabbed one's footprint, lying below it, is the ground */
  ground: 3,
  /** a group bigger than this (pieces) is too big to drag together */
  cap: 400,
};

export interface StructItem {
  /** the thing it belongs to (a block id, a built-in box's fingerprint) */
  key: string;
  min: Vec3;
  max: Vec3;
}

const ov = (a0: number, a1: number, b0: number, b1: number): number =>
  Math.min(a1, b1) - Math.max(a0, b0);

const area = (b: StructItem): number => (b.max.x - b.min.x) * (b.max.z - b.min.z);
const volume = (b: StructItem): number =>
  (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z);

/** Are these two pieces part of one structure (touching and stacked / embedded)? */
export const linked = (a: StructItem, b: StructItem, eps = STRUCTURE.eps): boolean => {
  const ox = ov(a.min.x, a.max.x, b.min.x, b.max.x);
  const oy = ov(a.min.y, a.max.y, b.min.y, b.max.y);
  const oz = ov(a.min.z, a.max.z, b.min.z, b.max.z);
  if (ox < -eps || oy < -eps || oz < -eps) return false; // not touching
  // stacked: seen from above they overlap enough
  const foot = Math.max(0, ox) * Math.max(0, oz);
  const small = Math.min(area(a), area(b));
  if (small > 1e-6 ? foot >= STRUCTURE.footprint * small : foot > 0) return true;
  // embedded: one sits inside the other (a trim along an edge, a rock in a platform)
  if (ox > 0 && oy > 0 && oz > 0) {
    const v = ox * oy * oz;
    const vs = Math.min(volume(a), volume(b));
    if (vs > 1e-9 && v >= STRUCTURE.embedded * vs) return true;
  }
  return false;
};

/** A thing's overall bounds (all its pieces). */
const boundsOf = (items: StructItem[]): StructItem => {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const it of items) {
    min.x = Math.min(min.x, it.min.x);
    min.y = Math.min(min.y, it.min.y);
    min.z = Math.min(min.z, it.min.z);
    max.x = Math.max(max.x, it.max.x);
    max.y = Math.max(max.y, it.max.y);
    max.z = Math.max(max.z, it.max.z);
  }
  return { key: items[0]?.key ?? '', min, max };
};

/**
 * The structure of the thing `start`: its key and the keys of everything linked to it, on and
 * on (not climbing into the ground under it). `capped`: over STRUCTURE.cap pieces (the caller
 * then moves just the grabbed piece).
 */
export const structureKeys = (
  items: StructItem[],
  start: string,
): { keys: Set<string>; pieces: number; capped: boolean } => {
  const byKey = new Map<string, number[]>();
  items.forEach((it, i) => {
    const l = byKey.get(it.key) ?? [];
    l.push(i);
    byKey.set(it.key, l);
  });
  const whole = new Map<string, StructItem>();
  const thing = (k: string): StructItem => {
    let b = whole.get(k);
    if (!b) whole.set(k, (b = boundsOf((byKey.get(k) ?? []).map((i) => items[i]))));
    return b;
  };
  const grabbed = thing(start);
  const grabbedArea = Math.max(area(grabbed), 1e-6);
  const grabbedMid = (grabbed.min.y + grabbed.max.y) / 2;
  /** too big and below the grabbed piece: what it stands on */
  const ground = (k: string): boolean => {
    const t = thing(k);
    return area(t) > STRUCTURE.ground * grabbedArea && (t.min.y + t.max.y) / 2 < grabbedMid;
  };
  const keys = new Set<string>([start]);
  const queue = [...(byKey.get(start) ?? [])];
  const seen = new Set<number>(queue);
  let pieces = queue.length;
  while (queue.length) {
    const p = items[queue.pop()!];
    for (let i = 0; i < items.length; i++) {
      if (seen.has(i)) continue;
      const it = items[i];
      if (keys.has(it.key)) continue;
      if (!linked(p, it)) continue;
      if (ground(it.key)) {
        // never into the floor (and nothing of it later either)
        for (const j of byKey.get(it.key) ?? []) seen.add(j);
        continue;
      }
      keys.add(it.key);
      for (const j of byKey.get(it.key) ?? []) {
        if (!seen.has(j)) {
          seen.add(j);
          queue.push(j);
          pieces++;
        }
      }
      if (pieces > STRUCTURE.cap) return { keys, pieces, capped: true };
    }
  }
  return { keys, pieces, capped: false };
};
