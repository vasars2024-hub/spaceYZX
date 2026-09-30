// MAP MAKER — connecting pieces: while you drag a piece, it jumps flush against a piece it comes
// close to (face to face, no gap and no overlap) and lines its edges up with it, so platforms
// sit side by side and a ramp meets a platform's edge. Plain maths, no Three.js.
//
// Only faces that are parallel count: two pieces turned the same way (or by a quarter turn) snap
// in their shared frame; anything else keeps the grid.
import type { BoxDef, Quat, Vec3 } from '@space-yz/shared';
import { qConj, qMul, qRotate } from '@space-yz/shared';

/** Pieces closer than this (m) snap together. */
export const CONNECT_DIST = 0.6;

type V3 = [number, number, number];

const AXES: Vec3[] = [
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: 1 },
];

/**
 * How `b`'s own axes lie in the frame `q` (the moving piece's): for each of b's axes, the frame
 * axis it runs along — or null when some axis is not parallel to one (faces not parallel).
 */
const axisMap = (q: Quat | undefined, b: BoxDef): number[] | null => {
  const rel = q ? (b.q ? qMul(qConj(q), b.q) : qConj(q)) : b.q;
  if (!rel) return [0, 1, 2];
  const out: number[] = [];
  for (const a of AXES) {
    const v = qRotate(rel, a);
    const c = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)];
    const i = c.indexOf(Math.max(...c));
    if (c[i] < 0.999) return null;
    out.push(i);
  }
  return out;
};

/** A box's extent in the frame `q` (its axes must be parallel to the frame's: axisMap). */
const frameBox = (q: Quat | undefined, b: BoxDef, map: number[]): { min: V3; max: V3 } => {
  const c = q ? qRotate(qConj(q), b.c) : b.c;
  const half: V3 = [0, 0, 0];
  const h = [b.h.x, b.h.y, b.h.z];
  map.forEach((axis, i) => (half[axis] = h[i]));
  const cc: V3 = [c.x, c.y, c.z];
  return {
    min: [cc[0] - half[0], cc[1] - half[1], cc[2] - half[2]],
    max: [cc[0] + half[0], cc[1] + half[1], cc[2] + half[2]],
  };
};

const overlap = (a0: number, a1: number, b0: number, b1: number): number =>
  Math.min(a1, b1) - Math.max(a0, b0);

export interface ConnectResult {
  /** extra move (world, m) that makes the group sit flush */
  shift: V3;
  /** which of `others` it connected to (-1: none) */
  hit: number;
}

/**
 * The magnet: `moving` = the dragged pieces where they would go now, `others` = pieces nearby.
 * Finds the closest face-to-face contact within `dist` (parallel faces only), moves the group so
 * it touches exactly, and lines up matching edges (bottoms, tops, sides) that are within `dist`.
 */
export const connectSnap = (
  moving: BoxDef[],
  others: BoxDef[],
  dist = CONNECT_DIST,
): ConnectResult => {
  let best: { gap: number; shift: V3; hit: number; q: Quat | undefined } | null = null;
  for (const m of moving) {
    const q = m.q;
    const mb = frameBox(q, m, [0, 1, 2]);
    others.forEach((o, oi) => {
      const map = axisMap(q, o);
      if (!map) return;
      const ob = frameBox(q, o, map);
      for (let a = 0; a < 3; a++) {
        const [b, c] = [0, 1, 2].filter((x) => x !== a);
        // they must face each other: overlapping across the other two axes
        if (overlap(mb.min[b], mb.max[b], ob.min[b], ob.max[b]) <= 1e-3) continue;
        if (overlap(mb.min[c], mb.max[c], ob.min[c], ob.max[c]) <= 1e-3) continue;
        // the gap on either side (negative: they overlap by that much)
        const sides: [number, number][] = [
          [ob.min[a] - mb.max[a], 1], // m before o: move + to touch
          [mb.min[a] - ob.max[a], -1], // m after o: move - to touch
        ];
        for (const [gap, sign] of sides) {
          if (Math.abs(gap) > dist) continue;
          // (overlapping deeper than half its size: not this side)
          if (gap < 0 && -gap > (mb.max[a] - mb.min[a]) / 2) continue;
          if (best && Math.abs(gap) >= Math.abs(best.gap)) continue;
          const shift: V3 = [0, 0, 0];
          shift[a] = sign * gap;
          // line up matching edges on the other axes
          for (const e of [b, c]) {
            const lo = ob.min[e] - mb.min[e];
            const hi = ob.max[e] - mb.max[e];
            const pick = Math.abs(lo) <= Math.abs(hi) ? lo : hi;
            if (Math.abs(pick) <= dist) shift[e] = pick;
          }
          best = { gap, shift, hit: oi, q };
        }
      }
    });
  }
  if (!best) return { shift: [0, 0, 0], hit: -1 };
  const found = best as { gap: number; shift: V3; hit: number; q: Quat | undefined };
  const q = found.q;
  const s = { x: found.shift[0], y: found.shift[1], z: found.shift[2] };
  const w = q ? qRotate(q, s) : s;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { shift: [r(w.x), r(w.y), r(w.z)], hit: found.hit };
};
