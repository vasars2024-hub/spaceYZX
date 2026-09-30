// Tiny 3D vector library for the deterministic simulation.
// Plain {x,y,z} objects keep state JSON-serializable; functions return new vectors.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const ZERO: Readonly<Vec3> = Object.freeze(v3(0, 0, 0));
export const UP: Readonly<Vec3> = Object.freeze(v3(0, 1, 0));

export const clone = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const neg = (a: Vec3): Vec3 => ({ x: -a.x, y: -a.y, z: -a.z });
/** a + b * s */
export const madd = (a: Vec3, b: Vec3, s: number): Vec3 => ({
  x: a.x + b.x * s,
  y: a.y + b.y * s,
  z: a.z + b.z * s,
});
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const lenSq = (a: Vec3): number => a.x * a.x + a.y * a.y + a.z * a.z;
export const len = (a: Vec3): number => Math.sqrt(lenSq(a));
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
export const distSq = (a: Vec3, b: Vec3): number => lenSq(sub(a, b));
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
export const mul = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x * b.x, y: a.y * b.y, z: a.z * b.z });

/** Normalize; returns `fallback` (default zero) for near-zero vectors. */
export const normalize = (a: Vec3, fallback: Vec3 = ZERO): Vec3 => {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : clone(fallback);
};

/** Component of `a` perpendicular to unit `n`. */
export const projectOnPlane = (a: Vec3, n: Vec3): Vec3 => madd(a, n, -dot(a, n));

/** Clamp the length of `a` to `max`. */
export const clampLen = (a: Vec3, max: number): Vec3 => {
  const l = len(a);
  return l > max && l > 0 ? scale(a, max / l) : a;
};

/** Any unit vector perpendicular to unit `n`. */
export const anyPerp = (n: Vec3): Vec3 =>
  Math.abs(n.y) < 0.9 ? normalize(cross(n, UP)) : normalize(cross(n, v3(1, 0, 0)));

export const eq = (a: Vec3, b: Vec3, eps = 1e-9): boolean =>
  Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.z - b.z) <= eps;

/** Rotate `v` around unit `axis` by `angle` radians (Rodrigues). */
export const rotateAxis = (v: Vec3, axis: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = cross(axis, v);
  const d = dot(axis, v) * (1 - c);
  return {
    x: v.x * c + k.x * s + axis.x * d,
    y: v.y * c + k.y * s + axis.y * d,
    z: v.z * c + k.z * s + axis.z * d,
  };
};

/** Angle between two vectors in radians. */
export const angleBetween = (a: Vec3, b: Vec3): number => {
  const d = dot(normalize(a), normalize(b));
  return Math.acos(Math.max(-1, Math.min(1, d)));
};

/**
 * Rotate unit vector `from` toward unit `to` by at most `maxAngle` radians.
 * For (nearly) opposite vectors, rotates around `fallbackAxis`.
 */
export const rotateToward = (from: Vec3, to: Vec3, maxAngle: number, fallbackAxis?: Vec3): Vec3 => {
  const ang = angleBetween(from, to);
  if (ang <= maxAngle || ang < 1e-9) return clone(to);
  let axis = cross(from, to);
  if (lenSq(axis) < 1e-12) axis = fallbackAxis ? projectOnPlane(fallbackAxis, from) : anyPerp(from);
  axis = normalize(axis, anyPerp(from));
  return normalize(rotateAxis(from, axis, maxAngle));
};

export const round = (a: Vec3, decimals = 3): Vec3 => {
  const f = 10 ** decimals;
  return { x: Math.round(a.x * f) / f, y: Math.round(a.y * f) / f, z: Math.round(a.z * f) / f };
};
