// Scenery for the race tracks (race-cliffline.ts, race-canopy.ts): low-poly trees, boulders and
// rock masses made of a few boxes each (merged into the level mesh: no extra draw calls), placed
// with a deterministic hash (the server and every client build the same map). Scenery never
// collides unless it says so, and `clearOf` keeps it off the racing lines.
import type { Vec3 } from '../../math/vec3';
import { v3 } from '../../math/vec3';
import { qFromAxisAngle } from '../../math/quat';
import type { LevelBuilder } from '../builder';
import type { Material } from '../types';

/** Deterministic 0..1 from an integer. */
export const hash01 = (n: number): number => {
  let x = Math.imul((n | 0) ^ 0x2545f491, 0x9e3779b1);
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967295;
};

const yaw = (deg: number) => ({ q: qFromAxisAngle(v3(0, 1, 0), (deg * Math.PI) / 180) });

/** Is (x, z) at least `r` metres (horizontally) from every point of every line? */
export const clearOf = (lines: readonly Vec3[][], x: number, z: number, r: number): boolean => {
  for (const line of lines)
    for (let i = 0; i < line.length; i++) {
      const a = line[i];
      const b = line[i + 1] ?? a;
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const l2 = abx * abx + abz * abz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / l2)) : 0;
      const dx = a.x + abx * t - x;
      const dz = a.z + abz * t - z;
      if (dx * dx + dz * dz < r * r) return false;
    }
  return true;
};

/** A pine: trunk and three stacked, turned tiers (no collision). */
export const pine = (
  b: LevelBuilder,
  x: number,
  y: number,
  z: number,
  h: number,
  colors: { trunk: number; needles: number; needlesLight: number; snow?: number },
  seed: number,
): void => {
  const turn = hash01(seed) * 90;
  b.block(v3(x, y + h * 0.15, z), v3(h * 0.08, h * 0.3, h * 0.08), {
    mat: 'wood',
    color: colors.trunk,
    noCollide: true,
  });
  for (let i = 0; i < 3; i++) {
    const w = h * (0.52 - i * 0.14);
    const cy = y + h * (0.32 + i * 0.22);
    b.block(v3(x, cy, z), v3(w, h * 0.22, w), {
      ...yaw(turn + i * 45),
      mat: 'leaf',
      color: i === 1 ? colors.needlesLight : colors.needles,
      noCollide: true,
    });
  }
  if (colors.snow !== undefined)
    b.block(v3(x, y + h * 0.9, z), v3(h * 0.12, h * 0.08, h * 0.12), {
      ...yaw(turn),
      mat: 'sand',
      color: colors.snow,
      noCollide: true,
    });
};

/** A broad jungle tree: a tall trunk, two branch arms and a layered crown (no collision). */
export const jungleTree = (
  b: LevelBuilder,
  x: number,
  y: number,
  z: number,
  h: number,
  colors: { bark: number; leaves: number; leavesDark: number },
  seed: number,
): void => {
  const turn = hash01(seed) * 90;
  const t = Math.max(0.5, h * 0.06);
  b.block(v3(x, y + h * 0.4, z), v3(t * 2, h * 0.8, t * 2), {
    ...yaw(turn),
    mat: 'wood',
    color: colors.bark,
    noCollide: true,
  });
  const crown = h * 0.36;
  b.block(v3(x, y + h * 0.8, z), v3(crown * 2, h * 0.16, crown * 2), {
    ...yaw(turn + 20),
    mat: 'leaf',
    color: colors.leavesDark,
    noCollide: true,
  });
  b.block(v3(x, y + h * 0.93, z), v3(crown * 1.4, h * 0.14, crown * 1.4), {
    ...yaw(turn + 55),
    mat: 'leaf',
    color: colors.leaves,
    noCollide: true,
  });
};

/** A boulder: two turned boxes. */
export const boulder = (
  b: LevelBuilder,
  x: number,
  y: number,
  z: number,
  size: number,
  color: number,
  seed: number,
  collide = false,
  mat: Material = 'rock',
): void => {
  const turn = hash01(seed) * 90;
  b.block(v3(x, y + size * 0.35, z), v3(size, size * 0.7, size * 0.85), {
    ...yaw(turn),
    mat,
    color,
    noCollide: !collide,
  });
  b.block(v3(x, y + size * 0.6, z), v3(size * 0.7, size * 0.5, size * 0.7), {
    ...yaw(turn + 40),
    mat,
    color,
    noCollide: !collide,
  });
};

/** A stepped rock massif (a mountain seen from afar): tiers shrinking upwards, snow on top. */
export const massif = (
  b: LevelBuilder,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  colors: { rock: number; rockDark: number; cap?: number },
  seed: number,
): void => {
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const k = 1 - i / tiers;
    const hh = h / tiers;
    b.block(v3(x, y + hh * (i + 0.5), z), v3(w * k, hh, w * k * (0.8 + hash01(seed + i) * 0.4)), {
      ...yaw(hash01(seed * 7 + i) * 50 - 25),
      mat: 'rock',
      color: i % 2 ? colors.rockDark : colors.rock,
      noCollide: true,
    });
  }
  if (colors.cap !== undefined)
    b.block(v3(x, y + h + 0.6, z), v3(w * 0.3, 1.8, w * 0.3), {
      ...yaw(hash01(seed * 11) * 40),
      mat: 'sand',
      color: colors.cap,
      noCollide: true,
    });
};
