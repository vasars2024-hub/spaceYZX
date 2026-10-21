// Lossy quantization for network snapshots: bounded floats, positions, velocities, unit vectors
// (octahedral), quaternions (smallest-three) and angles.
// Every quantizer maps a value to small unsigned ints (quantize*, *ToInts) and back (dequantize*,
// *FromInts), so the delta coder can compare and diff the ints exactly. Dequantized values
// re-quantize to the same ints, so a decoded value is a stable baseline. snap*() = what the
// receiver sees.

import type { Quat } from '../../math/quat';
import type { Vec3 } from '../../math/vec3';
import type { BitReader, BitWriter } from './bits';
import { CodecError } from './bits';

const checkBits = (bits: number, min: number, max: number, what: string): void => {
  if (!Number.isInteger(bits) || bits < min || bits > max) {
    throw new CodecError('range', `${what} bits ${bits} must be an integer in ${min}..${max}`);
  }
};

const clamp01 = (t: number): number => (t > 0 ? (t < 1 ? t : 1) : 0); // NaN -> 0
const signNZ = (v: number): number => (v >= 0 ? 1 : -1);

// Symmetric grid on [-lim, lim] with 2^bits - 1 levels (the top code is unused) so that 0 is
// exact: identity rotations and axis-aligned vectors survive quantization unchanged.
const symSteps = (bits: number): number => 2 ** bits - 2;
const symToGrid = (v: number, lim: number, bits: number): number =>
  clamp01((v + lim) / (2 * lim)) * symSteps(bits);
const symDequant = (q: number, lim: number, bits: number): number => {
  const steps = symSteps(bits);
  // (2q - steps) is an exact integer, so q and steps - q decode to exact negatives.
  return Math.min(lim, (lim * (2 * q - steps)) / steps);
};

// ---------------------------------------------------------------------------------------------
// Bounded floats: [min, max] mapped onto 0..2^bits-1 (both ends exact). Out-of-range values clamp;
// NaN maps to min.

export const quantizeFloat = (v: number, min: number, max: number, bits: number): number => {
  checkBits(bits, 1, 32, 'float');
  if (!(max > min) || !Number.isFinite(min) || !Number.isFinite(max)) {
    throw new CodecError('range', `invalid float range [${min}, ${max}]`);
  }
  return Math.round(clamp01((v - min) / (max - min)) * (2 ** bits - 1));
};

export const dequantizeFloat = (q: number, min: number, max: number, bits: number): number =>
  min + (max - min) * (q / (2 ** bits - 1));

/** The value the receiver will see: dequantize(quantize(v)). */
export const snapFloat = (v: number, min: number, max: number, bits: number): number =>
  dequantizeFloat(quantizeFloat(v, min, max, bits), min, max, bits);

export const writeQFloat = (
  w: BitWriter,
  v: number,
  min: number,
  max: number,
  bits: number,
): void => w.writeUint(quantizeFloat(v, min, max, bits), bits);

export const readQFloat = (r: BitReader, min: number, max: number, bits: number): number =>
  dequantizeFloat(r.readUint(bits), min, max, bits);

// ---------------------------------------------------------------------------------------------
// Fixed-point axes: value = min + q * step, q in 0..2^bits-1. With a power-of-two step, zero and
// every grid point are exact doubles (no drift, velocity 0 is exactly 0).

export interface AxisFormat {
  readonly min: number;
  readonly step: number;
  readonly bits: number;
}

export interface Vec3Format {
  readonly x: AxisFormat;
  readonly y: AxisFormat;
  readonly z: AxisFormat;
}

/** Axis covering [min, max) with 2^bits steps of (max-min)/2^bits. */
export const axisFormat = (min: number, max: number, bits: number): AxisFormat => {
  checkBits(bits, 1, 32, 'axis');
  if (!(max > min) || !Number.isFinite(min) || !Number.isFinite(max)) {
    throw new CodecError('range', `invalid axis range [${min}, ${max}]`);
  }
  return Object.freeze({ min, step: (max - min) / 2 ** bits, bits });
};

export const uniformVec3Format = (min: number, max: number, bits: number): Vec3Format => {
  const a = axisFormat(min, max, bits);
  return Object.freeze({ x: a, y: a, z: a });
};

/** Map box ±256 m, 17 bits per axis, exact 1/256 m resolution (51 bits per position). */
export const DEFAULT_POS_FORMAT: Vec3Format = uniformVec3Format(-256, 256, 17);
/** ±64 m/s, 13 bits per axis, exact 1/64 m/s resolution (39 bits per velocity). */
export const DEFAULT_VEL_FORMAT: Vec3Format = uniformVec3Format(-64, 64, 13);

export const quantizeAxis = (v: number, a: AxisFormat): number => {
  const q = Math.round((v - a.min) / a.step);
  const top = 2 ** a.bits - 1;
  return q > 0 ? (q < top ? q : top) : 0; // NaN -> 0
};

export const dequantizeAxis = (q: number, a: AxisFormat): number => a.min + q * a.step;

export const vec3ToInts = (v: Vec3, f: Vec3Format): [number, number, number] => [
  quantizeAxis(v.x, f.x),
  quantizeAxis(v.y, f.y),
  quantizeAxis(v.z, f.z),
];

export const vec3FromInts = (q: readonly number[], f: Vec3Format): Vec3 => ({
  x: dequantizeAxis(q[0], f.x),
  y: dequantizeAxis(q[1], f.y),
  z: dequantizeAxis(q[2], f.z),
});

export const snapVec3 = (v: Vec3, f: Vec3Format): Vec3 => vec3FromInts(vec3ToInts(v, f), f);

export const writeVec3Q = (w: BitWriter, v: Vec3, f: Vec3Format): void => {
  const q = vec3ToInts(v, f);
  w.writeUint(q[0], f.x.bits);
  w.writeUint(q[1], f.y.bits);
  w.writeUint(q[2], f.z.bits);
};

export const readVec3Q = (r: BitReader, f: Vec3Format): Vec3 =>
  vec3FromInts([r.readUint(f.x.bits), r.readUint(f.y.bits), r.readUint(f.z.bits)], f);

export const writePos = (w: BitWriter, v: Vec3, f: Vec3Format = DEFAULT_POS_FORMAT): void =>
  writeVec3Q(w, v, f);
export const readPos = (r: BitReader, f: Vec3Format = DEFAULT_POS_FORMAT): Vec3 => readVec3Q(r, f);
export const writeVel = (w: BitWriter, v: Vec3, f: Vec3Format = DEFAULT_VEL_FORMAT): void =>
  writeVec3Q(w, v, f);
export const readVel = (r: BitReader, f: Vec3Format = DEFAULT_VEL_FORMAT): Vec3 => readVec3Q(r, f);

// ---------------------------------------------------------------------------------------------
// Unit vectors: octahedral mapping, two components of `bits` each. The encoder tries the 4
// neighbouring grid points and keeps the one closest to the input ("precise" oct encoding).
// Points on the square's border have twins that decode to the same vector ((1, y) ~ (1, -y),
// (x, 1) ~ (-x, 1), all corners ~ -Z); they are canonicalized so re-encoding a decoded vector
// always gives the same ints (the delta coder relies on this).

export const DEFAULT_UNIT_BITS = 12;

export const octFromInts = (q: readonly number[], bits = DEFAULT_UNIT_BITS): Vec3 => {
  let px = symDequant(q[0], 1, bits);
  let py = symDequant(q[1], 1, bits);
  const pz = 1 - Math.abs(px) - Math.abs(py);
  if (pz < 0) {
    const ox = px;
    px = (1 - Math.abs(py)) * signNZ(ox);
    py = (1 - Math.abs(ox)) * signNZ(py);
  }
  const l = Math.sqrt(px * px + py * py + pz * pz);
  return { x: px / l, y: py / l, z: pz / l };
};

/** Non-unit input is normalized; zero/non-finite input encodes +Z. */
export const octToInts = (v: Vec3, bits = DEFAULT_UNIT_BITS): [number, number] => {
  checkBits(bits, 2, 30, 'unit');
  let x = v.x;
  let y = v.y;
  let z = v.z;
  const l1 = Math.abs(x) + Math.abs(y) + Math.abs(z);
  if (!(l1 > 1e-30) || !Number.isFinite(l1)) {
    x = 0;
    y = 0;
    z = 1;
  } else {
    x /= l1;
    y /= l1;
    z /= l1;
  }
  let px = x;
  let py = y;
  if (z < 0) {
    px = (1 - Math.abs(y)) * signNZ(x);
    py = (1 - Math.abs(x)) * signNZ(y);
  }
  const steps = symSteps(bits);
  const x0 = Math.floor(symToGrid(px, 1, bits));
  const y0 = Math.floor(symToGrid(py, 1, bits));
  let bx = x0;
  let by = y0;
  let bestDot = -Infinity;
  for (let m = 0; m < 4; m++) {
    const qx = Math.min(x0 + (m & 1), steps);
    const qy = Math.min(y0 + (m >> 1), steps);
    const d = octFromInts([qx, qy], bits);
    const dp = d.x * x + d.y * y + d.z * z;
    if (dp > bestDot) {
      bestDot = dp;
      bx = qx;
      by = qy;
    }
  }
  if (bx === 0 || bx === steps) by = Math.max(by, steps - by);
  if (by === 0 || by === steps) bx = Math.max(bx, steps - bx);
  return [bx, by];
};

export const snapUnit = (v: Vec3, bits = DEFAULT_UNIT_BITS): Vec3 =>
  octFromInts(octToInts(v, bits), bits);

export const writeUnit = (w: BitWriter, v: Vec3, bits = DEFAULT_UNIT_BITS): void => {
  const q = octToInts(v, bits);
  w.writeUint(q[0], bits);
  w.writeUint(q[1], bits);
};

export const readUnit = (r: BitReader, bits = DEFAULT_UNIT_BITS): Vec3 =>
  octFromInts([r.readUint(bits), r.readUint(bits)], bits);

// ---------------------------------------------------------------------------------------------
// Quaternions: smallest three. 2 bits for the index of the "big" component (rebuilt from the
// unit norm; made positive, since q and -q are the same rotation), then the other three in
// [-1/√2, 1/√2]. The encoder tries the largest index (and, near ties, the runner-up) with the 8
// floor/ceil grid combinations and keeps the closest rotation (max error ≈ 0.15° at 10 bits).
// A decoded quaternion is exactly on the grid, so re-encoding it finds the same ints again (the
// delta coder relies on this); exact duplicates across indices are resolved deterministically.

export const DEFAULT_QUAT_BITS = 10;
export const MAX_QUAT_BITS = 12;
const QMAX = Math.SQRT1_2;

const len4 = (a: number, b: number, c: number, d: number): number =>
  Math.sqrt(a * a + b * b + c * c + d * d);

export const quatFromInts = (q: readonly number[], bits = DEFAULT_QUAT_BITS): Quat => {
  const idx = q[0];
  const a = symDequant(q[1], QMAX, bits);
  const b = symDequant(q[2], QMAX, bits);
  const c = symDequant(q[3], QMAX, bits);
  const big = Math.sqrt(Math.max(0, 1 - a * a - b * b - c * c));
  const out = [0, 0, 0, 0];
  const rest = [a, b, c];
  let j = 0;
  for (let i = 0; i < 4; i++) out[i] = i === idx ? big : rest[j++];
  const l = len4(out[0], out[1], out[2], out[3]);
  return { x: out[0] / l, y: out[1] / l, z: out[2] / l, w: out[3] / l };
};

type QuatInts = [number, number, number, number];

const lexLess = (a: QuatInts, b: QuatInts): boolean => {
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
};

const qAbsDot = (a: Quat, b: Quat): number =>
  Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);

/** Returns [bigIndex, a, b, c]. Zero/non-finite input encodes identity. */
export const quatToInts = (q: Quat, bits = DEFAULT_QUAT_BITS): QuatInts => {
  checkBits(bits, 2, MAX_QUAT_BITS, 'quat');
  const l = len4(q.x, q.y, q.z, q.w);
  const ok = l > 1e-30 && Number.isFinite(l);
  const src: Quat = ok
    ? { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l }
    : { x: 0, y: 0, z: 0, w: 1 };
  const c = [src.x, src.y, src.z, src.w];
  const maxAbs = Math.max(...c.map(Math.abs));
  const steps = symSteps(bits);
  // Near-tie window: other indices are only used when their component is (after decoding) this
  // close to the largest one. Keeps the index stable (cheap deltas) away from ties.
  const tie = Math.max(0.01, (8 * QMAX) / steps);
  const cands: { ints: QuatInts; d: Quat }[] = [];
  let best = -1;
  let bestDot = -Infinity;
  for (let idx = 0; idx < 4; idx++) {
    if (Math.abs(c[idx]) < maxAbs - 2 * tie) continue;
    const sign = c[idx] < 0 ? -1 : 1;
    const lo = c
      .filter((_, i) => i !== idx)
      .map((v) => Math.floor(symToGrid(v * sign, QMAX, bits)));
    for (let m = 0; m < 8; m++) {
      const ints: QuatInts = [
        idx,
        Math.min(lo[0] + (m & 1), steps),
        Math.min(lo[1] + ((m >> 1) & 1), steps),
        Math.min(lo[2] + ((m >> 2) & 1), steps),
      ];
      const a = symDequant(ints[1], QMAX, bits);
      const b = symDequant(ints[2], QMAX, bits);
      const e = symDequant(ints[3], QMAX, bits);
      // Skip points whose three components alone exceed unit length (they only decode after
      // renormalization) and points whose rebuilt component is not (nearly) the largest. Both
      // tests only use the decoded value, so a decoded quaternion passes them again.
      if (a * a + b * b + e * e > 1) continue;
      const big = Math.sqrt(1 - a * a - b * b - e * e);
      if (big < Math.max(Math.abs(a), Math.abs(b), Math.abs(e)) - tie) continue;
      const d = quatFromInts(ints, bits);
      const dp = qAbsDot(d, src);
      cands.push({ ints, d });
      if (dp > bestDot) {
        bestDot = dp;
        best = cands.length - 1;
      }
    }
  }
  // Candidates that decode to the same rotation up to float noise (exact duplicates, e.g. at 90°
  // turns) resolve to the lexicographically smallest ints, independent of the order they were
  // tried in. Distinct grid points are always much further apart than this tolerance.
  const tol = 1e-14;
  const bestD = cands[best].d;
  let pick = cands[best].ints;
  for (const cand of cands) {
    if (1 - qAbsDot(cand.d, bestD) < tol && lexLess(cand.ints, pick)) pick = cand.ints;
  }
  return pick;
};

export const snapQuat = (q: Quat, bits = DEFAULT_QUAT_BITS): Quat =>
  quatFromInts(quatToInts(q, bits), bits);

export const writeQuat = (w: BitWriter, q: Quat, bits = DEFAULT_QUAT_BITS): void => {
  const t = quatToInts(q, bits);
  w.writeUint(t[0], 2);
  w.writeUint(t[1], bits);
  w.writeUint(t[2], bits);
  w.writeUint(t[3], bits);
};

export const readQuat = (r: BitReader, bits = DEFAULT_QUAT_BITS): Quat =>
  quatFromInts([r.readUint(2), r.readUint(bits), r.readUint(bits), r.readUint(bits)], bits);

// ---------------------------------------------------------------------------------------------
// Angles: wrapped to a full turn, 2^bits steps. Decodes into [-π, π).

export const DEFAULT_ANGLE_BITS = 12;
const TAU = Math.PI * 2;

export const quantizeAngle = (rad: number, bits = DEFAULT_ANGLE_BITS): number => {
  checkBits(bits, 1, 32, 'angle');
  const turns = rad / TAU;
  if (!Number.isFinite(turns)) return 0;
  const n = 2 ** bits;
  return Math.round((turns - Math.floor(turns)) * n) % n;
};

export const dequantizeAngle = (q: number, bits = DEFAULT_ANGLE_BITS): number => {
  const n = 2 ** bits;
  return ((q >= n / 2 ? q - n : q) / n) * TAU;
};

export const snapAngle = (rad: number, bits = DEFAULT_ANGLE_BITS): number =>
  dequantizeAngle(quantizeAngle(rad, bits), bits);

export const writeAngle = (w: BitWriter, rad: number, bits = DEFAULT_ANGLE_BITS): void =>
  w.writeUint(quantizeAngle(rad, bits), bits);

export const readAngle = (r: BitReader, bits = DEFAULT_ANGLE_BITS): number =>
  dequantizeAngle(r.readUint(bits), bits);
