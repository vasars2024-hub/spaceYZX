// Collision queries against the level's boxes: capsule (character) and rays/sphere-casts.
import type { Vec3 } from '../math/vec3';
import { v3, sub, add, scale, dot, madd, normalize, len } from '../math/vec3';
import type { BoxShape, Level } from './level';
import { queryBoxes } from './level';

/** World point -> box-local coordinates. */
export const toLocal = (b: BoxShape, p: Vec3): Vec3 => {
  const d = sub(p, b.c);
  return v3(dot(d, b.ax), dot(d, b.ay), dot(d, b.az));
};

/** Box-local -> world. */
export const toWorld = (b: BoxShape, l: Vec3): Vec3 =>
  v3(
    b.c.x + b.ax.x * l.x + b.ay.x * l.y + b.az.x * l.z,
    b.c.y + b.ax.y * l.x + b.ay.y * l.y + b.az.y * l.z,
    b.c.z + b.ax.z * l.x + b.ay.z * l.y + b.az.z * l.z,
  );

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Squared distance from a box-local point to the box. */
const localDistSq = (b: BoxShape, x: number, y: number, z: number): number => {
  const dx = Math.max(Math.abs(x) - b.h.x, 0);
  const dy = Math.max(Math.abs(y) - b.h.y, 0);
  const dz = Math.max(Math.abs(z) - b.h.z, 0);
  return dx * dx + dy * dy + dz * dz;
};

export const closestPointOnBox = (b: BoxShape, p: Vec3): Vec3 => {
  const l = toLocal(b, p);
  return toWorld(
    b,
    v3(clamp(l.x, -b.h.x, b.h.x), clamp(l.y, -b.h.y, b.h.y), clamp(l.z, -b.h.z, b.h.z)),
  );
};

export interface SegBoxResult {
  t: number; // parameter on segment [0,1]
  pSeg: Vec3;
  pBox: Vec3;
  distSq: number;
}

/** Closest points between segment a→b and a box (golden-section search on a convex function). */
export const segmentBoxClosest = (box: BoxShape, a: Vec3, b: Vec3): SegBoxResult => {
  const la = toLocal(box, a);
  const lb = toLocal(box, b);
  const dx = lb.x - la.x,
    dy = lb.y - la.y,
    dz = lb.z - la.z;
  const f = (t: number): number => localDistSq(box, la.x + dx * t, la.y + dy * t, la.z + dz * t);
  let lo = 0,
    hi = 1;
  const g = 0.6180339887498949;
  let x1 = hi - g * (hi - lo),
    x2 = lo + g * (hi - lo);
  let f1 = f(x1),
    f2 = f(x2);
  for (let i = 0; i < 22; i++) {
    if (f1 <= f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - g * (hi - lo);
      f1 = f(x1);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + g * (hi - lo);
      f2 = f(x2);
    }
  }
  let t = (lo + hi) / 2;
  let best = f(t);
  const f0 = f(0);
  const fe = f(1);
  if (f0 < best) {
    best = f0;
    t = 0;
  }
  if (fe < best) {
    best = fe;
    t = 1;
  }
  const lx = la.x + dx * t,
    ly = la.y + dy * t,
    lz = la.z + dz * t;
  const pSeg = toWorld(box, v3(lx, ly, lz));
  const pBox = toWorld(
    box,
    v3(clamp(lx, -box.h.x, box.h.x), clamp(ly, -box.h.y, box.h.y), clamp(lz, -box.h.z, box.h.z)),
  );
  return { t, pSeg, pBox, distSq: best };
};

export interface Contact {
  box: number;
  normal: Vec3; // points out of the box, toward the capsule
  depth: number; // positive = penetrating
}

/**
 * Minimum translation to push a capsule (segment a-b, radius r) fully out of a box along one of
 * the box's face axes. Used when the core segment is inside the box.
 */
const satPush = (box: BoxShape, a: Vec3, b: Vec3, r: number): { normal: Vec3; depth: number } => {
  const la = toLocal(box, a);
  const lb = toLocal(box, b);
  let best = { normal: box.ay, depth: Infinity };
  const axes: [keyof Vec3, Vec3][] = [
    ['x', box.ax],
    ['y', box.ay],
    ['z', box.az],
  ];
  for (const [k, axis] of axes) {
    const smin = Math.min(la[k], lb[k]) - r;
    const smax = Math.max(la[k], lb[k]) + r;
    const h = box.h[k];
    const pushPos = h - smin; // move +axis so capsule min reaches box max
    const pushNeg = smax + h; // move -axis
    if (pushPos < best.depth) best = { normal: axis, depth: pushPos };
    if (pushNeg < best.depth) best = { normal: scale(axis, -1), depth: pushNeg };
  }
  return best;
};

export interface Capsule {
  center: Vec3;
  up: Vec3; // unit axis
  halfSeg: number; // half the length of the core segment
  radius: number;
}

export const capsuleEnds = (c: Capsule): [Vec3, Vec3] => [
  madd(c.center, c.up, -c.halfSeg),
  madd(c.center, c.up, c.halfSeg),
];

const capsuleAabb = (c: Capsule, pad: number): [Vec3, Vec3] => {
  const [a, b] = capsuleEnds(c);
  const r = c.radius + pad;
  return [
    v3(Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.min(a.z, b.z) - r),
    v3(Math.max(a.x, b.x) + r, Math.max(a.y, b.y) + r, Math.max(a.z, b.z) + r),
  ];
};

/** Contacts of a capsule against the level, including near-contacts within `slop`. */
export const capsuleContacts = (level: Level, cap: Capsule, slop = 0): Contact[] => {
  const [mn, mx] = capsuleAabb(cap, slop);
  const [a, b] = capsuleEnds(cap);
  const out: Contact[] = [];
  const r = cap.radius;
  for (const i of queryBoxes(level, mn, mx)) {
    const box = level.boxes[i];
    const res = segmentBoxClosest(box, a, b);
    if (res.distSq >= (r + slop) * (r + slop)) continue;
    const d = Math.sqrt(res.distSq);
    if (d > 1e-5) {
      out.push({ box: i, normal: scale(sub(res.pSeg, res.pBox), 1 / d), depth: r - d });
    } else {
      const s = satPush(box, a, b, r);
      out.push({ box: i, normal: s.normal, depth: s.depth });
    }
  }
  return out;
};

/** True if the capsule penetrates any box by more than `tolerance`. */
export const capsuleOverlaps = (level: Level, cap: Capsule, tolerance = 0.005): boolean => {
  for (const c of capsuleContacts(level, cap)) if (c.depth > tolerance) return true;
  return false;
};

/**
 * Push a capsule out of the level. Resolves the deepest contact first, several iterations.
 * Returns the corrected center and every contact normal encountered.
 */
export const depenetrate = (
  level: Level,
  cap: Capsule,
  iterations = 5,
): { center: Vec3; normals: Vec3[] } => {
  let center = cap.center;
  const normals: Vec3[] = [];
  for (let it = 0; it < iterations; it++) {
    const contacts = capsuleContacts(level, { ...cap, center });
    let deepest: Contact | null = null;
    for (const c of contacts)
      if (c.depth > 1e-4 && (!deepest || c.depth > deepest.depth)) deepest = c;
    if (!deepest) break;
    center = madd(center, deepest.normal, deepest.depth + 1e-4);
    normals.push(deepest.normal);
  }
  return { center, normals };
};

export interface RayHit {
  t: number; // distance along the ray
  point: Vec3;
  normal: Vec3;
  box: number;
}

/** Ray (or sphere of `radius`, conservatively) against one box. Returns entry distance or null. */
export const rayBox = (
  box: BoxShape,
  origin: Vec3,
  dir: Vec3,
  maxDist: number,
  radius = 0,
): { t: number; normal: Vec3 } | null => {
  const o = toLocal(box, origin);
  const d = v3(dot(dir, box.ax), dot(dir, box.ay), dot(dir, box.az));
  let tmin = -Infinity,
    tmax = Infinity;
  let nAxis = -1,
    nSign = 1;
  const keys: (keyof Vec3)[] = ['x', 'y', 'z'];
  for (let i = 0; i < 3; i++) {
    const k = keys[i];
    const h = box.h[k] + radius;
    if (Math.abs(d[k]) < 1e-12) {
      if (o[k] < -h || o[k] > h) return null;
      continue;
    }
    let t1 = (-h - o[k]) / d[k];
    let t2 = (h - o[k]) / d[k];
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nAxis = i;
      nSign = sign;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0 || tmin > maxDist) return null;
  if (tmin < 0) {
    // origin inside: report a zero-distance hit with the ray's reverse as normal
    return { t: 0, normal: scale(dir, -1) };
  }
  const axis = nAxis === 0 ? box.ax : nAxis === 1 ? box.ay : box.az;
  return { t: tmin, normal: scale(axis, nSign) };
};

/** First hit of a ray (or swept sphere) against the level. */
export const raycast = (
  level: Level,
  origin: Vec3,
  dir: Vec3,
  maxDist: number,
  radius = 0,
): RayHit | null => {
  const end = madd(origin, dir, maxDist);
  const pad = radius + 0.01;
  const mn = v3(
    Math.min(origin.x, end.x) - pad,
    Math.min(origin.y, end.y) - pad,
    Math.min(origin.z, end.z) - pad,
  );
  const mx = v3(
    Math.max(origin.x, end.x) + pad,
    Math.max(origin.y, end.y) + pad,
    Math.max(origin.z, end.z) + pad,
  );
  let best: RayHit | null = null;
  for (const i of queryBoxes(level, mn, mx)) {
    const h = rayBox(level.boxes[i], origin, dir, best ? best.t : maxDist, radius);
    if (h && (!best || h.t < best.t))
      best = { t: h.t, point: madd(origin, dir, h.t), normal: h.normal, box: i };
  }
  return best;
};

/** Is the straight line between two points free of level geometry? */
export const lineOfSight = (level: Level, a: Vec3, b: Vec3): boolean => {
  const d = sub(b, a);
  const l = len(d);
  if (l < 1e-6) return true;
  return raycast(level, a, scale(d, 1 / l), l) === null;
};

/** Nearest surface point (and outward normal) within `range` of a point. */
export const nearestSurface = (
  level: Level,
  p: Vec3,
  range: number,
): { point: Vec3; normal: Vec3; dist: number; box: number } | null => {
  const mn = v3(p.x - range, p.y - range, p.z - range);
  const mx = v3(p.x + range, p.y + range, p.z + range);
  let best: { point: Vec3; normal: Vec3; dist: number; box: number } | null = null;
  for (const i of queryBoxes(level, mn, mx)) {
    const box = level.boxes[i];
    const q = closestPointOnBox(box, p);
    const d = len(sub(p, q));
    if (d > range || (best && d >= best.dist)) continue;
    let n: Vec3;
    if (d > 1e-5) n = scale(sub(p, q), 1 / d);
    else n = satPush(box, p, p, 0).normal;
    best = { point: q, normal: faceNormal(box, n), dist: d, box: i };
  }
  return best;
};

/** Snap a direction to the box's nearest face normal (so mag-boots align to faces, not edges). */
export const faceNormal = (box: BoxShape, n: Vec3): Vec3 => {
  const cands = [box.ax, box.ay, box.az];
  let best = box.ay;
  let bestDot = -Infinity;
  for (const a of cands) {
    const d = dot(a, n);
    if (d > bestDot) {
      bestDot = d;
      best = a;
    }
    if (-d > bestDot) {
      bestDot = -d;
      best = scale(a, -1);
    }
  }
  return normalize(best);
};

export { add };
