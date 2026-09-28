// MAP MAKER — what the mouse points at: a ray against the pieces of the map (boxes, turned boxes,
// surf-ramp prisms and curved ramps' free-form prisms, exactly as level/collision.ts shapes
// them). Plain maths, no Three.js.
import type { BoxDef, Vec3 } from '@space-yz/shared';
import { hullShape, qConj, qRotate } from '@space-yz/shared';

export interface RayHit {
  t: number;
  /** world-space normal of the face hit */
  n: Vec3;
}

/** A piece's axis-aligned bounds (min, max), for a quick first test. */
export const boxBounds = (b: BoxDef): { min: Vec3; max: Vec3 } => {
  if (!b.q) return { min: sub(b.c, b.h), max: add(b.c, b.h) };
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const p = qRotate(b.q, { x: sx * b.h.x, y: sy * b.h.y, z: sz * b.h.z });
        min.x = Math.min(min.x, b.c.x + p.x);
        min.y = Math.min(min.y, b.c.y + p.y);
        min.z = Math.min(min.z, b.c.z + p.z);
        max.x = Math.max(max.x, b.c.x + p.x);
        max.y = Math.max(max.y, b.c.y + p.y);
        max.z = Math.max(max.z, b.c.z + p.z);
      }
  return { min, max };
};

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

/** Ray (origin o, direction d) against an axis-aligned box: entry distance or null. */
export const rayAabb = (o: Vec3, d: Vec3, min: Vec3, max: Vec3, maxT = Infinity): number | null => {
  let t0 = 0;
  let t1 = maxT;
  for (const k of ['x', 'y', 'z'] as const) {
    if (Math.abs(d[k]) < 1e-12) {
      if (o[k] < min[k] || o[k] > max[k]) return null;
      continue;
    }
    const inv = 1 / d[k];
    let a = (min[k] - o[k]) * inv;
    let b = (max[k] - o[k]) * inv;
    if (a > b) [a, b] = [b, a];
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return null;
  }
  return t0;
};

/** The planes (outward normal n, offset w: inside where n·p <= w) of a piece in its own space. */
const localPlanes = (b: BoxDef): { n: Vec3; w: number }[] => {
  const { x: hx, y: hy, z: hz } = b.h;
  const planes = [
    { n: { x: 1, y: 0, z: 0 }, w: hx },
    { n: { x: -1, y: 0, z: 0 }, w: hx },
    { n: { x: 0, y: -1, z: 0 }, w: hy },
  ];
  if (b.prism === undefined) {
    planes.push(
      { n: { x: 0, y: 1, z: 0 }, w: hy },
      { n: { x: 0, y: 0, z: 1 }, w: hz },
      { n: { x: 0, y: 0, z: -1 }, w: hz },
    );
    return planes;
  }
  // a prism: the top shrinks to a ridge along x at z = r; two slanted sides
  const r = Math.max(-1, Math.min(1, b.prism)) * hz;
  for (const s of [1, -1]) {
    const side = s > 0 ? hz - r : r + hz;
    const l = Math.hypot(2 * hy, side) || 1;
    const n = { x: 0, y: side / l, z: (s * 2 * hy) / l };
    planes.push({ n, w: n.y * hy + n.z * r });
  }
  return planes;
};

const hullCache = new WeakMap<BoxDef, { n: Vec3; w: number }[]>();

/** A free-form prism's face planes relative to its centre (world axes; cached per box). */
const hullPlanes = (b: BoxDef): { n: Vec3; w: number }[] => {
  let out = hullCache.get(b);
  if (!out) {
    const s = hullShape(b.hull!.map((p) => sub(p, b.c)));
    out = s.n.map((n, i) => ({ n, w: s.d[i] }));
    hullCache.set(b, out);
  }
  return out;
};

/**
 * Ray against one piece (a box, a turned box, a prism or a free-form prism). Starting inside
 * does not count.
 */
export const rayPiece = (o: Vec3, d: Vec3, b: BoxDef, maxT = Infinity): RayHit | null => {
  const inv = b.q && !b.hull ? qConj(b.q) : null;
  const lo = sub(o, b.c);
  const po = inv ? qRotate(inv, lo) : lo;
  const pd = inv ? qRotate(inv, d) : d;
  let tIn = -Infinity;
  let tOut = Infinity;
  let nIn: Vec3 | null = null;
  for (const p of b.hull ? hullPlanes(b) : localPlanes(b)) {
    const denom = p.n.x * pd.x + p.n.y * pd.y + p.n.z * pd.z;
    const distv = p.w - (p.n.x * po.x + p.n.y * po.y + p.n.z * po.z);
    if (Math.abs(denom) < 1e-12) {
      if (distv < 0) return null;
      continue;
    }
    const t = distv / denom;
    if (denom < 0) {
      if (t > tIn) {
        tIn = t;
        nIn = p.n;
      }
    } else if (t < tOut) tOut = t;
    if (tIn > tOut) return null;
  }
  if (!nIn || tIn < 0 || tIn > maxT) return null;
  return { t: tIn, n: inv ? qRotate(b.q!, nIn) : nIn };
};

/**
 * The nearest piece a ray hits: `pieces[i]` with its bounds precomputed. Returns the index, the
 * distance and the face normal.
 */
export const pickNearest = (
  o: Vec3,
  d: Vec3,
  pieces: { box: BoxDef; min: Vec3; max: Vec3 }[],
  maxT = 2000,
  skip?: (i: number) => boolean,
): { i: number; t: number; n: Vec3 } | null => {
  let best: { i: number; t: number; n: Vec3 } | null = null;
  let far = maxT;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const ta = rayAabb(o, d, p.min, p.max, far);
    if (ta === null) continue;
    if (skip?.(i)) continue;
    const hit = rayPiece(o, d, p.box, far);
    if (hit && hit.t < far) {
      far = hit.t;
      best = { i, t: hit.t, n: hit.n };
    }
  }
  return best;
};
