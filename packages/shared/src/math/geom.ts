// Small geometry queries used by hit detection.
import type { Vec3 } from './vec3';
import { sub, dot, add, scale, lenSq } from './vec3';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Closest points between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection). */
export const closestSegSeg = (
  p1: Vec3,
  q1: Vec3,
  p2: Vec3,
  q2: Vec3,
): { s: number; t: number; c1: Vec3; c2: Vec3; distSq: number } => {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s: number;
  let t: number;
  if (a <= 1e-12 && e <= 1e-12) {
    s = 0;
    t = 0;
  } else if (a <= 1e-12) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = dot(d1, r);
    if (e <= 1e-12) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const c1 = add(p1, scale(d1, s));
  const c2 = add(p2, scale(d2, t));
  return { s, t, c1, c2, distSq: lenSq(sub(c1, c2)) };
};

/** Closest point on segment a-b to p, as parameter t and squared distance. */
export const closestPointSeg = (p: Vec3, a: Vec3, b: Vec3): { t: number; distSq: number } => {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 > 1e-12 ? clamp01(dot(sub(p, a), ab) / l2) : 0;
  return { t, distSq: lenSq(sub(add(a, scale(ab, t)), p)) };
};

/**
 * First time t in [0,1] at which a ray origin + dir*t*len comes within `radius` of a sphere
 * center (i.e. segment vs sphere entry). Returns null if it never does.
 */
export const segmentSphereEntry = (
  a: Vec3,
  b: Vec3,
  center: Vec3,
  radius: number,
): number | null => {
  const d = sub(b, a);
  const m = sub(a, center);
  const A = dot(d, d);
  const B = dot(m, d);
  const C = dot(m, m) - radius * radius;
  if (C <= 0) return 0; // already inside
  if (A < 1e-12) return null;
  const disc = B * B - A * C;
  if (disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / A;
  return t >= 0 && t <= 1 ? t : null;
};
