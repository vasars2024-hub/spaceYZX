// MAP MAKER — curved pieces: the curve types, quick presets, the limits of every setting, and
// the maths behind the drag handles (where a curve ends, and which turn / radius puts its end
// where you drag it). Plain maths: the pieces themselves come from the shared expandCustomBlock.
//
// A curve's centre line (level/custom/compile.ts) starts `radius` to the LEFT of the block's pos
// (to the right for a negative angle), heads forward (-z) and turns right by `angle` around pos.
import type { CustomBlock, CustomShape } from '@space-yz/shared';
import { maxWaveAmplitude } from '@space-yz/shared';
import type { V3 } from './model';

export type Curve = NonNullable<CustomBlock['curve']>;
export type CurveKind = NonNullable<Curve['kind']>;

export const CURVE_KINDS: { id: CurveKind; label: string; desc: string }[] = [
  { id: 'arc', label: 'Arc', desc: 'One steady turn' },
  { id: 'sCurve', label: 'S-curve', desc: 'Turns one way, then back the other way' },
  { id: 'spiral', label: 'Spiral', desc: 'The turn gets tighter (or wider) as it goes' },
  { id: 'wave', label: 'Wave', desc: 'Goes up and down in humps while it turns' },
];

/** Every setting's range: [min, max, step]. */
export const CURVE_LIMITS = {
  angle: [10, 360, 5],
  pipeAngle: [10, 90, 5],
  radius: [2, 100, 0.5],
  endRadius: [2, 200, 0.5],
  rise: [-200, 200, 0.5],
  width: [1, 30, 0.5],
  thickness: [0.1, 4, 0.1],
  height: [0.5, 30, 0.25],
  steepness: [46, 80, 1],
  bank: [-45, 45, 1],
  amplitude: [-12, 12, 0.25],
  waves: [0.5, 6, 0.5],
  segments: [4, 48, 1],
} as const;

/** Which settings a curved shape has. */
export const curveFields = (shape: CustomShape, kind: CurveKind) => ({
  kinds: shape !== 'quarterPipe',
  radius: shape !== 'quarterPipe',
  endRadius: shape !== 'quarterPipe' && kind === 'spiral',
  rise: shape !== 'quarterPipe',
  steepness: shape === 'curveSurf',
  bank: shape === 'curveRamp' || shape === 'curvePlatform',
  wave: shape !== 'quarterPipe' && kind === 'wave',
});

export interface CurvePreset {
  label: string;
  /** which shapes it is offered for */
  shapes: CustomShape[];
  curve: Partial<Curve>;
}

const RAMPS: CustomShape[] = ['curveRamp', 'curvePlatform', 'curveSurf'];

export const CURVE_PRESETS: CurvePreset[] = [
  { label: 'Gentle turn', shapes: RAMPS, curve: { kind: 'arc', angle: 45, radius: 30 } },
  { label: 'Corner', shapes: RAMPS, curve: { kind: 'arc', angle: 90, radius: 12 } },
  { label: 'Hairpin', shapes: RAMPS, curve: { kind: 'arc', angle: 180, radius: 6 } },
  { label: 'S-bend', shapes: RAMPS, curve: { kind: 'sCurve', angle: 120, radius: 14 } },
  {
    label: 'Tight spiral',
    shapes: ['curveRamp', 'curvePlatform'],
    curve: { kind: 'spiral', angle: 360, radius: 14, endRadius: 6, rise: 8 },
  },
  {
    label: 'Helix',
    shapes: ['curveRamp'],
    curve: { kind: 'arc', angle: 360, radius: 10, rise: 8 },
  },
  {
    label: 'Wavy surf',
    shapes: ['curveSurf'],
    curve: { kind: 'wave', angle: 90, radius: 30, amplitude: 2.5, waves: 2 },
  },
  {
    label: 'Dropping surf',
    shapes: ['curveSurf'],
    curve: { kind: 'arc', angle: 90, radius: 24, rise: -12 },
  },
  {
    label: 'Roller coaster',
    shapes: ['curveRamp', 'curvePlatform'],
    curve: { kind: 'wave', angle: 90, radius: 20, amplitude: 3, waves: 2 },
  },
];

/** Apply a preset: its curve settings replace the ones it names (the width etc. stay). */
export const applyPreset = (c: Curve, p: CurvePreset): Curve => {
  const out: Curve = {
    ...c,
    ...p.curve,
    angle: Math.sign(c.angle || 1) * (p.curve.angle ?? Math.abs(c.angle)),
  };
  if (p.curve.kind !== 'spiral') delete out.endRadius;
  if (p.curve.kind !== 'wave') {
    delete out.amplitude;
    delete out.waves;
  }
  if (p.curve.rise === undefined) delete out.rise;
  return out;
};

/** Change the curve's type (filling in sensible settings the new type needs). */
export const setCurveKind = (c: Curve, kind: CurveKind): Curve => {
  const out: Curve = { ...c, kind };
  if (kind === 'spiral') out.endRadius ??= Math.max(2, Math.round(c.radius * 0.5 * 2) / 2);
  else delete out.endRadius;
  if (kind === 'wave') {
    out.amplitude ??= 2;
    out.waves ??= 2;
  } else {
    delete out.amplitude;
    delete out.waves;
  }
  return out;
};

// ---------------------------------------------------------------------------------------------
// the end of the centre line, in the block's own frame (x right, z forward = -z)

const DEG = Math.PI / 180;

/** Where a curve's centre line ends, in the block's frame (x, z), before rise. */
export const curveEndLocal = (c: Curve): [number, number] => {
  const kind = c.kind ?? 'arc';
  const A = Math.abs(c.angle) * DEG;
  const s = c.angle < 0 ? -1 : 1;
  if (kind === 'sCurve') {
    const [x, z] = sEnd(A, c.radius);
    return [s * x, z];
  }
  const r = kind === 'spiral' ? (c.endRadius ?? c.radius) : c.radius;
  return [-s * r * Math.cos(A), -r * Math.sin(A)];
};

/** The S-curve's end for a right turn first (x, z): half the angle each way, same radius. */
const sEnd = (A: number, R: number): [number, number] => {
  const h = A / 2;
  // the middle point (around the first centre, pos)
  const mx = -R * Math.cos(h);
  const mz = -R * Math.sin(h);
  // the second centre is across the middle point; there it turns back the other way
  const cx = 2 * mx;
  const cz = 2 * mz;
  const vx = -mx;
  const vz = -mz;
  // rotate (vx, vz) around (cx, cz) by -h (the other way round)
  const co = Math.cos(-h);
  const si = Math.sin(-h);
  return [cx + vx * co - vz * si, cz + vx * si + vz * co];
};

/** The centre line's start in the block's frame (x, z). */
export const curveStartLocal = (c: Curve): [number, number] => [
  (c.angle < 0 ? 1 : -1) * c.radius,
  0,
];

/**
 * Where to drag the end handle: the new turn (and radius, or end radius for a spiral) that puts
 * the curve's end nearest to `target` (block frame x, z). Keeps the turn's direction (left /
 * right) unless the target is clearly on the other side.
 */
export const solveCurveEnd = (c: Curve, target: [number, number]): Curve => {
  const kind = c.kind ?? 'arc';
  const [tx, tz] = target;
  const [a0, a1] = CURVE_LIMITS.angle;
  const [r0, r1] = CURVE_LIMITS.radius;
  const clampA = (a: number) => Math.max(a0, Math.min(a1, Math.round(a / 5) * 5));
  const clampR = (r: number, max: number = r1) =>
    Math.max(r0, Math.min(max, Math.round(r * 2) / 2));
  if (kind !== 'sCurve') {
    // the end sits at distance r from pos, at angle A round from the start side
    const s = c.angle < 0 ? -1 : 1;
    const r = Math.hypot(tx, tz);
    // angle measured from the start direction (-s x) turning toward -z
    let A = Math.atan2(-tz, -s * tx) / DEG;
    if (A < 0) A += 360;
    const out: Curve = { ...c, angle: s * clampA(A) };
    if (kind === 'spiral') out.endRadius = clampR(r, CURVE_LIMITS.endRadius[1]);
    else out.radius = clampR(r);
    return out;
  }
  // S-curve: the end scales with the radius; try every turn, best radius for each
  const s = c.angle < 0 ? -1 : 1;
  let best: { A: number; R: number; err: number } | null = null;
  for (let A = a0; A <= a1; A += 5) {
    const [ex0, ez] = sEnd(A * DEG, 1);
    const ex = s * ex0;
    const len2 = ex * ex + ez * ez;
    if (len2 < 1e-9) continue;
    const R = clampR((tx * ex + tz * ez) / len2);
    const err = Math.hypot(tx - ex * R, tz - ez * R);
    if (!best || err < best.err - 1e-9) best = { A, R, err };
  }
  return best ? { ...c, angle: s * best.A, radius: best.R } : c;
};

/** Turn a block-frame point (x, y, z) into the world (the block's yaw only). */
export const localToWorld = (pos: V3, yaw: number, p: V3): V3 => {
  const a = yaw * DEG;
  // yaw turns -z (forward) toward +x: x' = x cos a - z sin a, z' = x sin a + z cos a
  const x = p[0] * Math.cos(a) - p[2] * Math.sin(a);
  const z = p[0] * Math.sin(a) + p[2] * Math.cos(a);
  return [pos[0] + x, pos[1] + p[1], pos[2] + z];
};

/** The other way round. */
export const worldToLocal = (pos: V3, yaw: number, p: V3): V3 => {
  const a = -yaw * DEG;
  const dx = p[0] - pos[0];
  const dz = p[2] - pos[2];
  return [dx * Math.cos(a) - dz * Math.sin(a), p[1] - pos[1], dx * Math.sin(a) + dz * Math.cos(a)];
};

/**
 * The block's new pos so the curve still starts where it did after its radius or direction
 * changed (a curve's pos is the centre of its turn, which moves when the radius does).
 */
export const posKeepingStart = (pos: V3, yaw: number, old: Curve, next: Curve): V3 => {
  const [sx0] = curveStartLocal(old);
  const [sx1] = curveStartLocal(next);
  if (sx0 === sx1) return pos;
  const start = localToWorld(pos, yaw, [sx0, 0, 0]);
  const off = localToWorld([0, 0, 0], yaw, [sx1, 0, 0]);
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return [r(start[0] - off[0]), pos[1], r(start[2] - off[2])];
};

/**
 * A wave kept as high as the game allows (a curved surf ramp's humps stay smooth to ride; the
 * game's checker clamps the same way), so the editor shows what will be played.
 */
export const fitWave = <B extends Omit<CustomBlock, 'id'>>(b: B): B => {
  const cv = b.curve;
  if (cv?.kind !== 'wave' || cv.amplitude === undefined) return b;
  const cap = maxWaveAmplitude({ ...b, id: 0 });
  if (Math.abs(cv.amplitude) <= cap) return b;
  return { ...b, curve: { ...cv, amplitude: cv.amplitude < 0 ? -cap : cap } };
};
