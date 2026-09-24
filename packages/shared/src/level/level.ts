// Preprocessed level: boxes with world axes, a uniform spatial grid, rail lengths.
import type { Vec3 } from '../math/vec3';
import { v3, sub, dot, add, scale, len, normalize } from '../math/vec3';
import { qRotate } from '../math/quat';
import type { LevelDef, GravityZoneDef } from './types';

export interface BoxShape {
  index: number;
  c: Vec3;
  h: Vec3;
  ax: Vec3; // world directions of the box's local X/Y/Z
  ay: Vec3;
  az: Vec3;
  rotated: boolean;
  min: Vec3; // world AABB
  max: Vec3;
  collide: boolean;
}

export interface RailShape {
  points: Vec3[];
  cum: number[]; // cumulative length at each point
  length: number;
}

export interface Level {
  def: LevelDef;
  boxes: BoxShape[];
  colliders: number; // count of colliding boxes
  grid: Map<number, number[]>;
  cell: number;
  gridMin: Vec3;
  gridDims: [number, number, number];
  zones: GravityZoneDef[];
  zoneIndex: Map<string, number>;
  rails: RailShape[];
  /** scratch for de-duplicating grid queries */
  stamp: Uint32Array;
  stampId: number;
}

const CELL = 4;

export const buildLevel = (def: LevelDef): Level => {
  const boxes: BoxShape[] = def.boxes.map((b, index) => {
    const rotated = !!b.q && Math.abs(b.q.x) + Math.abs(b.q.y) + Math.abs(b.q.z) > 1e-9;
    const ax = rotated ? qRotate(b.q!, v3(1, 0, 0)) : v3(1, 0, 0);
    const ay = rotated ? qRotate(b.q!, v3(0, 1, 0)) : v3(0, 1, 0);
    const az = rotated ? qRotate(b.q!, v3(0, 0, 1)) : v3(0, 0, 1);
    // world AABB extent = sum |axis_i| * h_i
    const ex = Math.abs(ax.x) * b.h.x + Math.abs(ay.x) * b.h.y + Math.abs(az.x) * b.h.z;
    const ey = Math.abs(ax.y) * b.h.x + Math.abs(ay.y) * b.h.y + Math.abs(az.y) * b.h.z;
    const ez = Math.abs(ax.z) * b.h.x + Math.abs(ay.z) * b.h.y + Math.abs(az.z) * b.h.z;
    return {
      index,
      c: b.c,
      h: b.h,
      ax,
      ay,
      az,
      rotated,
      min: v3(b.c.x - ex, b.c.y - ey, b.c.z - ez),
      max: v3(b.c.x + ex, b.c.y + ey, b.c.z + ez),
      collide: !b.noCollide,
    };
  });

  const gridMin = v3(def.boundsMin.x - CELL, def.boundsMin.y - CELL, def.boundsMin.z - CELL);
  const dims: [number, number, number] = [
    Math.ceil((def.boundsMax.x - gridMin.x) / CELL) + 2,
    Math.ceil((def.boundsMax.y - gridMin.y) / CELL) + 2,
    Math.ceil((def.boundsMax.z - gridMin.z) / CELL) + 2,
  ];
  const grid = new Map<number, number[]>();
  let colliders = 0;
  for (const b of boxes) {
    if (!b.collide) continue;
    colliders++;
    const [x0, y0, z0] = cellOf(gridMin, dims, b.min);
    const [x1, y1, z1] = cellOf(gridMin, dims, b.max);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const k = x + dims[0] * (y + dims[1] * z);
          let list = grid.get(k);
          if (!list) grid.set(k, (list = []));
          list.push(b.index);
        }
  }

  const rails: RailShape[] = def.rails.map((r) => {
    const cum = [0];
    for (let i = 1; i < r.points.length; i++)
      cum.push(cum[i - 1] + len(sub(r.points[i], r.points[i - 1])));
    return { points: r.points, cum, length: cum[cum.length - 1] };
  });

  const zoneIndex = new Map<string, number>();
  def.zones.forEach((z, i) => zoneIndex.set(z.name, i));

  return {
    def,
    boxes,
    colliders,
    grid,
    cell: CELL,
    gridMin,
    gridDims: dims,
    zones: def.zones,
    zoneIndex,
    rails,
    stamp: new Uint32Array(boxes.length),
    stampId: 0,
  };
};

const cellOf = (
  gridMin: Vec3,
  dims: [number, number, number],
  p: Vec3,
): [number, number, number] => [
  Math.max(0, Math.min(dims[0] - 1, Math.floor((p.x - gridMin.x) / CELL))),
  Math.max(0, Math.min(dims[1] - 1, Math.floor((p.y - gridMin.y) / CELL))),
  Math.max(0, Math.min(dims[2] - 1, Math.floor((p.z - gridMin.z) / CELL))),
];

/**
 * Colliding boxes whose AABB overlaps [min,max], in ascending index order (deterministic).
 * The returned array is freshly allocated.
 */
export const queryBoxes = (level: Level, min: Vec3, max: Vec3): number[] => {
  const [x0, y0, z0] = cellOf(level.gridMin, level.gridDims, min);
  const [x1, y1, z1] = cellOf(level.gridMin, level.gridDims, max);
  level.stampId = (level.stampId + 1) >>> 0;
  if (level.stampId === 0) {
    level.stamp.fill(0);
    level.stampId = 1;
  }
  const id = level.stampId;
  const out: number[] = [];
  const d = level.gridDims;
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) {
        const list = level.grid.get(x + d[0] * (y + d[1] * z));
        if (!list) continue;
        for (const i of list) {
          if (level.stamp[i] === id) continue;
          level.stamp[i] = id;
          const b = level.boxes[i];
          if (
            b.max.x < min.x ||
            b.min.x > max.x ||
            b.max.y < min.y ||
            b.min.y > max.y ||
            b.max.z < min.z ||
            b.min.z > max.z
          )
            continue;
          out.push(i);
        }
      }
  out.sort((a, b) => a - b);
  return out;
};

/** Point on a rail at arc-length s (clamped). */
export const railPoint = (rail: RailShape, s: number): Vec3 => {
  const t = Math.max(0, Math.min(rail.length, s));
  for (let i = 1; i < rail.points.length; i++) {
    if (t <= rail.cum[i] || i === rail.points.length - 1) {
      const segLen = rail.cum[i] - rail.cum[i - 1];
      const f = segLen > 0 ? (t - rail.cum[i - 1]) / segLen : 0;
      const a = rail.points[i - 1];
      return add(a, scale(sub(rail.points[i], a), Math.min(1, Math.max(0, f))));
    }
  }
  return rail.points[0];
};

/** Unit tangent of a rail at arc-length s. */
export const railTangent = (rail: RailShape, s: number): Vec3 => {
  for (let i = 1; i < rail.points.length; i++) {
    if (s <= rail.cum[i] || i === rail.points.length - 1)
      return normalize(sub(rail.points[i], rail.points[i - 1]));
  }
  return v3(1, 0, 0);
};

/** Closest arc-length on a rail to point p, and the distance. */
export const railClosest = (rail: RailShape, p: Vec3): { s: number; dist: number } => {
  let best = { s: 0, dist: Infinity };
  for (let i = 1; i < rail.points.length; i++) {
    const a = rail.points[i - 1];
    const ab = sub(rail.points[i], a);
    const l2 = dot(ab, ab);
    const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
    const q = add(a, scale(ab, t));
    const d = len(sub(p, q));
    if (d < best.dist) best = { s: rail.cum[i - 1] + t * Math.sqrt(l2), dist: d };
  }
  return best;
};

export const pointInAabb = (p: Vec3, min: Vec3, max: Vec3): boolean =>
  p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z;
