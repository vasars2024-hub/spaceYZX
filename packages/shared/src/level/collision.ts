// Collision queries against the level's boxes: capsule (character) and rays/sphere-casts.
import type { Vec3 } from '../math/vec3';
import { v3, sub, add, scale, dot, madd, normalize, len } from '../math/vec3';
import type { BoxShape, HullShape, Level } from './level';
import { queryBoxes, nextStamp } from './level';

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

/**
 * Closest point of a prism's cross-section (the triangle (-hz, -hy), (hz, -hy), (ridge, hy) in
 * local (z, y)) to (z, y): Ericson's closest-point-on-triangle, in 2D. Writes into `out`.
 */
const TRI = { z: 0, y: 0 };
const triClosest = (b: BoxShape, z: number, y: number): { z: number; y: number } => {
  const pr = b.prism!;
  const az = -b.h.z,
    ay = -b.h.y;
  const bz = b.h.z,
    by = -b.h.y;
  const cz = pr.ridge,
    cy = b.h.y;
  const abz = bz - az,
    aby = by - ay;
  const acz = cz - az,
    acy = cy - ay;
  const apz = z - az,
    apy = y - ay;
  const d1 = abz * apz + aby * apy;
  const d2 = acz * apz + acy * apy;
  if (d1 <= 0 && d2 <= 0) return set2(az, ay);
  const bpz = z - bz,
    bpy = y - by;
  const d3 = abz * bpz + aby * bpy;
  const d4 = acz * bpz + acy * bpy;
  if (d3 >= 0 && d4 <= d3) return set2(bz, by);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return set2(az + abz * v, ay + aby * v);
  }
  const cpz = z - cz,
    cpy = y - cy;
  const d5 = abz * cpz + aby * cpy;
  const d6 = acz * cpz + acy * cpy;
  if (d6 >= 0 && d5 <= d6) return set2(cz, cy);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return set2(az + acz * w, ay + acy * w);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return set2(bz + (cz - bz) * w, by + (cy - by) * w);
  }
  // inside
  return set2(z, y);
};
const set2 = (z: number, y: number): { z: number; y: number } => {
  TRI.z = z;
  TRI.y = y;
  return TRI;
};

/**
 * Closest point of triangle (a, b, c) to (x, y, z) (Ericson's closest-point-on-triangle, 3D),
 * written into HP; returns the squared distance.
 */
const HP = { x: 0, y: 0, z: 0 };
const triPoint3 = (x: number, y: number, z: number, a: Vec3, b: Vec3, c: Vec3): number => {
  const abx = b.x - a.x,
    aby = b.y - a.y,
    abz = b.z - a.z;
  const acx = c.x - a.x,
    acy = c.y - a.y,
    acz = c.z - a.z;
  const apx = x - a.x,
    apy = y - a.y,
    apz = z - a.z;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  let qx: number, qy: number, qz: number;
  if (d1 <= 0 && d2 <= 0) {
    qx = a.x;
    qy = a.y;
    qz = a.z;
  } else {
    const bpx = x - b.x,
      bpy = y - b.y,
      bpz = z - b.z;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    const cpx = x - c.x,
      cpy = y - c.y,
      cpz = z - c.z;
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    const vc = d1 * d4 - d3 * d2;
    const vb = d5 * d2 - d1 * d6;
    const va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) {
      qx = b.x;
      qy = b.y;
      qz = b.z;
    } else if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const v = d1 / (d1 - d3);
      qx = a.x + abx * v;
      qy = a.y + aby * v;
      qz = a.z + abz * v;
    } else if (d6 >= 0 && d5 <= d6) {
      qx = c.x;
      qy = c.y;
      qz = c.z;
    } else if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const w = d2 / (d2 - d6);
      qx = a.x + acx * w;
      qy = a.y + acy * w;
      qz = a.z + acz * w;
    } else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
      qx = b.x + (c.x - b.x) * w;
      qy = b.y + (c.y - b.y) * w;
      qz = b.z + (c.z - b.z) * w;
    } else {
      const den = 1 / (va + vb + vc);
      const v = vb * den;
      const w = vc * den;
      qx = a.x + abx * v + acx * w;
      qy = a.y + aby * v + acy * w;
      qz = a.z + abz * v + acz * w;
    }
  }
  HP.x = qx;
  HP.y = qy;
  HP.z = qz;
  const ex = x - qx,
    ey = y - qy,
    ez = z - qz;
  return ex * ex + ey * ey + ez * ez;
};

/**
 * Closest point of a free-form prism (its hull, box-local) to a box-local point, written into
 * HQ; returns the squared distance (0 inside). Only faces the point is in front of can hold
 * the closest point of a convex solid, so the others are skipped.
 */
const HQ = { x: 0, y: 0, z: 0 };
const hullClosest = (h: HullShape, x: number, y: number, z: number): number => {
  let best = Infinity;
  for (let i = 0; i < h.tris.length; i++) {
    const n = h.n[i];
    if (n.x * x + n.y * y + n.z * z <= h.d[i]) continue;
    const t = h.tris[i];
    const d = triPoint3(x, y, z, h.v[t[0]], h.v[t[1]], h.v[t[2]]);
    if (d < best) {
      best = d;
      HQ.x = HP.x;
      HQ.y = HP.y;
      HQ.z = HP.z;
    }
  }
  if (best === Infinity) {
    // inside every face plane: inside the solid
    HQ.x = x;
    HQ.y = y;
    HQ.z = z;
    return 0;
  }
  return best;
};

/** Squared distance from a box-local point to the box (or prism). */
const localDistSq = (b: BoxShape, x: number, y: number, z: number): number => {
  if (b.hull) return hullClosest(b.hull, x, y, z);
  const dx = Math.max(Math.abs(x) - b.h.x, 0);
  if (b.prism) {
    const t = triClosest(b, z, y);
    const ez = z - t.z;
    const ey = y - t.y;
    return dx * dx + ez * ez + ey * ey;
  }
  const dy = Math.max(Math.abs(y) - b.h.y, 0);
  const dz = Math.max(Math.abs(z) - b.h.z, 0);
  return dx * dx + dy * dy + dz * dz;
};

/** Closest box-local point of the box (or prism) to a box-local point. */
const localClosest = (b: BoxShape, x: number, y: number, z: number): Vec3 => {
  if (b.hull) {
    hullClosest(b.hull, x, y, z);
    return v3(HQ.x, HQ.y, HQ.z);
  }
  if (b.prism) {
    const t = triClosest(b, z, y);
    return v3(clamp(x, -b.h.x, b.h.x), t.y, t.z);
  }
  return v3(clamp(x, -b.h.x, b.h.x), clamp(y, -b.h.y, b.h.y), clamp(z, -b.h.z, b.h.z));
};

export const closestPointOnBox = (b: BoxShape, p: Vec3): Vec3 => {
  const l = toLocal(b, p);
  return toWorld(b, localClosest(b, l.x, l.y, l.z));
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
  const pBox = toWorld(box, localClosest(box, lx, ly, lz));
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
  const hl = box.hull;
  if (hl) {
    // a free-form prism: out through the nearest face plane (its axes are the world's)
    for (let i = 0; i < hl.n.length; i++) {
      const n = hl.n[i];
      const push = hl.d[i] - Math.min(dot(n, la), dot(n, lb)) + r;
      if (push < best.depth) best = { normal: n, depth: push };
    }
    return best;
  }
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
    // (a prism has no top face: its slanted faces below stand in for it)
    if (pushPos < best.depth && !(box.prism && k === 'y')) best = { normal: axis, depth: pushPos };
    if (pushNeg < best.depth) best = { normal: scale(axis, -1), depth: pushNeg };
  }
  const pr = box.prism;
  if (pr)
    for (const [nz, ny, d] of [
      [pr.lz, pr.ly, pr.ld],
      [pr.rz, pr.ry, pr.rd],
    ]) {
      const push = d - Math.min(nz * la.z + ny * la.y, nz * lb.z + ny * lb.y) + r;
      if (push < best.depth) best = { normal: localDir(box, 0, ny, nz), depth: push };
    }
  return best;
};

/** A box-local direction in world space. */
const localDir = (b: BoxShape, x: number, y: number, z: number): Vec3 =>
  v3(
    b.ax.x * x + b.ay.x * y + b.az.x * z,
    b.ax.y * x + b.ay.y * y + b.az.y * z,
    b.ax.z * x + b.ay.z * y + b.az.z * z,
  );

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
): { center: Vec3; normals: Vec3[]; boxes: number[] } => {
  let center = cap.center;
  const normals: Vec3[] = [];
  /** the box behind each normal */
  const boxes: number[] = [];
  for (let it = 0; it < iterations; it++) {
    const contacts = capsuleContacts(level, { ...cap, center });
    let deepest: Contact | null = null;
    for (const c of contacts)
      if (c.depth > 1e-4 && (!deepest || c.depth > deepest.depth)) deepest = c;
    if (!deepest) break;
    center = madd(center, deepest.normal, deepest.depth + 1e-4);
    normals.push(deepest.normal);
    boxes.push(deepest.box);
  }
  return { center, normals, boxes };
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
  const hl = box.hull;
  if (hl) return rayHull(hl, o, dir, maxDist, radius);
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
  // a prism: clip by its two slanted faces too (Cyrus–Beck)
  const pr = box.prism;
  let slant: Vec3 | null = null;
  if (pr)
    for (const [nz, ny, d0] of [
      [pr.lz, pr.ly, pr.ld],
      [pr.rz, pr.ry, pr.rd],
    ]) {
      const denom = nz * d.z + ny * d.y;
      const num = d0 + radius - (nz * o.z + ny * o.y);
      if (Math.abs(denom) < 1e-12) {
        if (num < 0) return null;
        continue;
      }
      const t = num / denom;
      if (denom < 0) {
        if (t > tmin) {
          tmin = t;
          slant = localDir(box, 0, ny, nz);
        }
      } else if (t < tmax) tmax = t;
      if (tmin > tmax) return null;
    }
  if (tmax < 0 || tmin > maxDist) return null;
  if (tmin < 0) {
    // origin inside: report a zero-distance hit with the ray's reverse as normal
    return { t: 0, normal: scale(dir, -1) };
  }
  if (slant) return { t: tmin, normal: slant };
  const axis = nAxis === 0 ? box.ax : nAxis === 1 ? box.ay : box.az;
  return { t: tmin, normal: scale(axis, nSign) };
};

/** A ray (or a sphere, conservatively) against a free-form prism's face planes (Cyrus�Beck). */
const rayHull = (
  h: HullShape,
  o: Vec3,
  dir: Vec3,
  maxDist: number,
  radius: number,
): { t: number; normal: Vec3 } | null => {
  let tmin = -Infinity;
  let tmax = Infinity;
  let normal: Vec3 | null = null;
  for (let i = 0; i < h.n.length; i++) {
    const n = h.n[i];
    const denom = dot(n, dir);
    const num = h.d[i] + radius - dot(n, o);
    if (Math.abs(denom) < 1e-12) {
      if (num < 0) return null;
      continue;
    }
    const t = num / denom;
    if (denom < 0) {
      if (t > tmin) {
        tmin = t;
        normal = n;
      }
    } else if (t < tmax) tmax = t;
    if (tmin > tmax) return null;
  }
  if (tmax < 0 || tmin > maxDist) return null;
  if (tmin < 0 || !normal) return { t: 0, normal: scale(dir, -1) };
  return { t: tmin, normal };
};

/**
 * Visit the grid cells a ray passes through, nearest first (a 3D DDA, Amanatides & Woo), calling
 * `visit(boxes, tEnter)` for each cell that holds boxes until it returns true. For long rays
 * (sight lines across the map) this touches a few dozen cells instead of every cell of the
 * ray's bounding box. Returns false, having visited nothing, unless the whole ray is inside the
 * grid (the callers then use a bounding-box query instead).
 */
const walkCells = (
  level: Level,
  o: Vec3,
  dir: Vec3,
  maxDist: number,
  visit: (boxes: readonly number[], tEnter: number) => boolean,
): boolean => {
  const g = level.gridMin;
  const [nx, ny, nz] = level.gridDims;
  const s = level.cell;
  const fx = (o.x - g.x) / s;
  const fy = (o.y - g.y) / s;
  const fz = (o.z - g.z) / s;
  const ex = fx + (dir.x * maxDist) / s;
  const ey = fy + (dir.y * maxDist) / s;
  const ez = fz + (dir.z * maxDist) / s;
  // (written so NaN fails too)
  if (!(fx >= 0 && fy >= 0 && fz >= 0 && fx < nx && fy < ny && fz < nz)) return false;
  if (!(ex >= 0 && ey >= 0 && ez >= 0 && ex < nx && ey < ny && ez < nz)) return false;
  let x = Math.floor(fx);
  let y = Math.floor(fy);
  let z = Math.floor(fz);
  const sx = dir.x > 0 ? 1 : dir.x < 0 ? -1 : 0;
  const sy = dir.y > 0 ? 1 : dir.y < 0 ? -1 : 0;
  const sz = dir.z > 0 ? 1 : dir.z < 0 ? -1 : 0;
  // distance along the ray to cross one cell, and to the first cell border, per axis
  const dx = sx !== 0 ? s / Math.abs(dir.x) : Infinity;
  const dy = sy !== 0 ? s / Math.abs(dir.y) : Infinity;
  const dz = sz !== 0 ? s / Math.abs(dir.z) : Infinity;
  let tx = sx > 0 ? (x + 1 - fx) * dx : sx < 0 ? (fx - x) * dx : Infinity;
  let ty = sy > 0 ? (y + 1 - fy) * dy : sy < 0 ? (fy - y) * dy : Infinity;
  let tz = sz > 0 ? (z + 1 - fz) * dz : sz < 0 ? (fz - z) * dz : Infinity;
  let t = 0;
  for (;;) {
    const list = level.grid.get(x + nx * (y + ny * z));
    if (list && visit(list, t)) return true;
    if (tx <= ty && tx <= tz) {
      t = tx;
      x += sx;
      tx += dx;
    } else if (ty <= tz) {
      t = ty;
      y += sy;
      ty += dy;
    } else {
      t = tz;
      z += sz;
      tz += dz;
    }
    if (t > maxDist || x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return true;
  }
};

/** First hit of a ray (or swept sphere) against the level. */
export const raycast = (
  level: Level,
  origin: Vec3,
  dir: Vec3,
  maxDist: number,
  radius = 0,
  /** a Boomerang's flight: skip boxes it flies through (BoxDef.boomerangPasses) */
  boomerang = false,
): RayHit | null => {
  // the nearest hit; on an exact tie the lowest box index (the same answer in any visit order)
  const r: { best: RayHit | null } = { best: null };
  const test = (i: number): void => {
    if (boomerang && level.boxes[i].boomerangPasses) return;
    const best = r.best;
    const h = rayBox(level.boxes[i], origin, dir, best ? best.t : maxDist, radius);
    if (h && (!best || h.t < best.t || (h.t === best.t && i < best.box)))
      r.best = { t: h.t, point: madd(origin, dir, h.t), normal: h.normal, box: i };
  };
  if (radius === 0) {
    const stamp = level.stamp;
    const id = nextStamp(level);
    const walked = walkCells(level, origin, dir, maxDist, (list, tEnter) => {
      // cells come nearest first: nothing in a cell that starts past the best hit can beat it
      if (r.best && tEnter > r.best.t + 1e-6) return true;
      for (const i of list) {
        if (stamp[i] === id) continue;
        stamp[i] = id;
        test(i);
      }
      return false;
    });
    if (walked) {
      // moving blocks are not in the grid: test them on their own
      for (const i of level.moverBoxes) test(i);
      return r.best;
    }
  }
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
  for (const i of queryBoxes(level, mn, mx)) test(i);
  return r.best;
};

/**
 * Is the straight line between two points free of level geometry? Static geometry only: moving
 * blocks never block sight (the server's visibility culling must never hide someone a client
 * can see past a block drawn a moment earlier or later), and neither does see-through glass
 * (BoxDef.seeThrough).
 */
export const lineOfSight = (level: Level, a: Vec3, b: Vec3): boolean => {
  const d = sub(b, a);
  const l = len(d);
  if (l < 1e-6) return true;
  const dir = scale(d, 1 / l);
  // any hit will do: stop at the first one
  const stamp = level.stamp;
  const id = nextStamp(level);
  let blocked = false;
  const walked = walkCells(level, a, dir, l, (list) => {
    for (const i of list) {
      if (stamp[i] === id) continue;
      stamp[i] = id;
      if (!level.boxes[i].seeThrough && rayBox(level.boxes[i], a, dir, l)) return (blocked = true);
    }
    return false;
  });
  if (walked) return !blocked;
  if (!level.moverBoxes.length && !level.seeThrough) return raycast(level, a, dir, l) === null;
  const mn = v3(Math.min(a.x, b.x) - 0.01, Math.min(a.y, b.y) - 0.01, Math.min(a.z, b.z) - 0.01);
  const mx = v3(Math.max(a.x, b.x) + 0.01, Math.max(a.y, b.y) + 0.01, Math.max(a.z, b.z) + 0.01);
  for (const i of queryBoxes(level, mn, mx))
    if (level.boxes[i].mover < 0 && !level.boxes[i].seeThrough && rayBox(level.boxes[i], a, dir, l))
      return false;
  return true;
};

/** Nearest surface point (and outward normal) within `range` of a point. */
export const nearestSurface = (
  level: Level,
  p: Vec3,
  range: number,
  /** skip surfaces whose face normal fails this (e.g. the floor you're standing on) */
  accept?: (normal: Vec3) => boolean,
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
    const fn = faceNormal(box, n);
    if (accept && !accept(fn)) continue;
    best = { point: q, normal: fn, dist: d, box: i };
  }
  return best;
};

/** Snap a direction to the box's nearest face normal (so mag-boots align to faces, not edges). */
export const faceNormal = (box: BoxShape, n: Vec3): Vec3 => {
  if (box.hull) {
    let best = box.hull.n[0];
    let bestDot = -Infinity;
    for (const c of box.hull.n) {
      const d = dot(c, n);
      if (d > bestDot) {
        bestDot = d;
        best = c;
      }
    }
    return normalize(best);
  }
  const cands = [box.ax, box.ay, box.az];
  const pr = box.prism;
  if (pr) {
    // the slanted faces (outward only), then the base and the ends
    const l = localDir(box, 0, pr.ly, pr.lz);
    const r = localDir(box, 0, pr.ry, pr.rz);
    let best = scale(box.ay, -1);
    let bestDot = -dot(box.ay, n);
    for (const c of [l, r, box.ax, scale(box.ax, -1)]) {
      const d = dot(c, n);
      if (d > bestDot) {
        bestDot = d;
        best = c;
      }
    }
    return normalize(best);
  }
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
