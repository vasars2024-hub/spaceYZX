// Quaternion helpers. Convention: rotate(q, v) applies q to v; the camera looks down
// its local -Z axis with +Y up and +X right (same as Three.js).

import type { Vec3 } from './vec3';
import { cross, dot, normalize, v3, anyPerp, lenSq } from './vec3';

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const quat = (x = 0, y = 0, z = 0, w = 1): Quat => ({ x, y, z, w });
export const qIdentity = (): Quat => quat(0, 0, 0, 1);

export const qNormalize = (q: Quat): Quat => {
  const l = Math.hypot(q.x, q.y, q.z, q.w);
  return l > 1e-12 ? quat(q.x / l, q.y / l, q.z / l, q.w / l) : qIdentity();
};

export const qFromAxisAngle = (axis: Vec3, angle: number): Quat => {
  const h = angle / 2;
  const s = Math.sin(h);
  return quat(axis.x * s, axis.y * s, axis.z * s, Math.cos(h));
};

/** a * b: apply b first, then a. */
export const qMul = (a: Quat, b: Quat): Quat =>
  quat(
    a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  );

export const qConj = (q: Quat): Quat => quat(-q.x, -q.y, -q.z, q.w);

export const qRotate = (q: Quat, v: Vec3): Vec3 => {
  // v' = v + 2w(u×v) + 2u×(u×v)
  const u = v3(q.x, q.y, q.z);
  const t = cross(u, v);
  const t2 = v3(t.x * 2, t.y * 2, t.z * 2);
  const c = cross(u, t2);
  return v3(v.x + q.w * t2.x + c.x, v.y + q.w * t2.y + c.y, v.z + q.w * t2.z + c.z);
};

/** Shortest rotation taking unit `a` to unit `b`. */
export const qFromUnitVectors = (a: Vec3, b: Vec3, fallbackAxis?: Vec3): Quat => {
  const d = dot(a, b);
  if (d < -0.999999) {
    let axis = fallbackAxis ?? anyPerp(a);
    axis = normalize(v3(axis.x, axis.y, axis.z));
    if (lenSq(axis) < 1e-9) axis = anyPerp(a);
    return qFromAxisAngle(axis, Math.PI);
  }
  const c = cross(a, b);
  return qNormalize(quat(c.x, c.y, c.z, 1 + d));
};

export const qSlerp = (a: Quat, b: Quat, t: number): Quat => {
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let bx = b.x,
    by = b.y,
    bz = b.z,
    bw = b.w;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (cos > 0.9995) {
    return qNormalize(
      quat(a.x + (bx - a.x) * t, a.y + (by - a.y) * t, a.z + (bz - a.z) * t, a.w + (bw - a.w) * t),
    );
  }
  const theta = Math.acos(cos);
  const s = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / s;
  const wb = Math.sin(t * theta) / s;
  return quat(a.x * wa + bx * wb, a.y * wa + by * wb, a.z * wa + bz * wb, a.w * wa + bw * wb);
};

export const FORWARD_LOCAL = Object.freeze(v3(0, 0, -1));
export const RIGHT_LOCAL = Object.freeze(v3(1, 0, 0));
export const UP_LOCAL = Object.freeze(v3(0, 1, 0));

export const qForward = (q: Quat): Vec3 => qRotate(q, FORWARD_LOCAL);
export const qRight = (q: Quat): Vec3 => qRotate(q, RIGHT_LOCAL);
export const qUp = (q: Quat): Vec3 => qRotate(q, UP_LOCAL);

/**
 * Build a view quaternion from yaw/pitch relative to a frame defined by `up`
 * (yaw 0 looks toward `refForward`, which must be perpendicular to `up`).
 */
export const qFromYawPitch = (yaw: number, pitch: number, up: Vec3, refForward: Vec3): Quat => {
  const base = qFromBasis(refForward, up);
  const qYaw = qFromAxisAngle(v3(0, 1, 0), yaw);
  const qPitch = qFromAxisAngle(v3(1, 0, 0), pitch);
  return qNormalize(qMul(base, qMul(qYaw, qPitch)));
};

/** Quaternion whose local -Z maps to `forward` and +Y to `up` (orthonormal inputs). */
export const qFromBasis = (forward: Vec3, up: Vec3): Quat => {
  const f = normalize(forward);
  const r = normalize(cross(f, up), anyPerp(f));
  const u = cross(r, f);
  // Rotation matrix columns: X = r, Y = u, Z = -f
  const m00 = r.x,
    m01 = u.x,
    m02 = -f.x;
  const m10 = r.y,
    m11 = u.y,
    m12 = -f.y;
  const m20 = r.z,
    m21 = u.z,
    m22 = -f.z;
  const trace = m00 + m11 + m22;
  let q: Quat;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    q = quat((m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s);
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = quat(0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s);
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = quat((m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s);
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = quat((m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s);
  }
  return qNormalize(q);
};
