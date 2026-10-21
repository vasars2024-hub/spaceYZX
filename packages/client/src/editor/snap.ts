// MAP MAKER — grid snapping and where a new piece goes when you aim at a surface.
import type { V3 } from './model';

/** The grid sizes you can pick (metres). */
export const GRID_SIZES = [0.25, 0.5, 1, 2] as const;

/** Round to the grid (and to 1 mm, so 0.1 + 0.2 stays 0.3). */
export const snap = (v: number, grid: number): number =>
  grid > 0 ? Math.round(Math.round(v / grid) * grid * 1000) / 1000 : v;

const mm = (v: number): number => Math.round(v * 1000) / 1000;

/** Snap an angle to steps of `step` degrees. */
export const snapAngle = (deg: number, step = 15): number => Math.round(deg / step) * step;

/** The main axis of a normal (0 x, 1 y, 2 z) and which way it points. */
export const mainAxis = (n: V3): { axis: 0 | 1 | 2; sign: 1 | -1 } => {
  const a = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])];
  const axis: 0 | 1 | 2 = a[1] >= a[0] && a[1] >= a[2] ? 1 : a[0] >= a[2] ? 0 : 2;
  return { axis, sign: n[axis] < 0 ? -1 : 1 };
};

/**
 * Where a piece's centre goes when you aim at `hit` on a surface facing `normal`: it sits flush
 * against the surface (on top of a floor, against a wall), and along the surface its edges line
 * up with the grid. `half` = the piece's half size along x, y, z.
 */
export const placeOnSurface = (hit: V3, normal: V3, half: V3, grid: number): V3 => {
  const { axis, sign } = mainAxis(normal);
  const out: V3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    if (i === axis) out[i] = mm(hit[i] + sign * half[i]);
    // the low edge on the grid (so a 3 m block on a 1 m grid covers whole cells)
    else out[i] = mm(snap(hit[i] - half[i], grid) + half[i]);
  }
  return out;
};

/** A point in the air (nothing aimed at): every axis on the grid. */
export const placeInAir = (p: V3, half: V3, grid: number): V3 =>
  [0, 1, 2].map((i) => mm(snap(p[i] - half[i], grid) + half[i])) as V3;

/** Snap a moved position so the piece's low corner stays on the grid. */
export const snapPos = (p: V3, half: V3, grid: number): V3 => placeInAir(p, half, grid);
