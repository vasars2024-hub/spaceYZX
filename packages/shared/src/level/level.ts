// Preprocessed level: boxes with world axes, a uniform spatial grid, rail lengths.
import type { Vec3 } from '../math/vec3';
import { v3, sub, dot, add, scale, len, normalize } from '../math/vec3';
import { qRotate } from '../math/quat';
import type { LevelDef, GravityZoneDef, KillVolumeDef } from './types';
import type { MoverTimeline } from './movers';
import { moverTimeline, timelineAt } from './movers';

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
  /** the Boomerang flies through it (BoxDef.boomerangPasses) */
  boomerangPasses: boolean;
  /**
   * a triangular prism (BoxDef.prism): its two slanted faces in local (z, y) — outward unit
   * normals and plane offsets (inside: nz·z + ny·y <= d) — and the ridge's local z; null = a box
   */
  prism: PrismShape | null;
  /** a surf ramp (BoxDef.surf): never ground, no wall-jumps off it */
  surf: boolean;
  /** sight passes through it (BoxDef.seeThrough) */
  seeThrough: boolean;
  /** index into Level.movers of the mover carrying it (-1: it never moves) */
  mover: number;
}

/**
 * A moving block (LevelDef.movers) as built: its boxes are kept out of the grid and tested on
 * their own (queryBoxes, raycast) wherever setLevelTick last put them.
 */
export interface LevelMover {
  timeline: MoverTimeline;
  /** box indices it carries */
  boxes: number[];
  /** each box's authored centre and AABB (the offset is added to these) */
  baseC: Vec3[];
  baseMin: Vec3[];
  baseMax: Vec3[];
  /** its offset at Level.moverTick */
  offset: Vec3;
  /** deadly volumes riding along (at the authored place) */
  killVolumes: KillVolumeDef[];
}

export interface PrismShape {
  /** local z of the ridge (local y = +h.y) */
  ridge: number;
  /** the -z side's slanted face */
  lz: number;
  ly: number;
  ld: number;
  /** the +z side's slanted face */
  rz: number;
  ry: number;
  rd: number;
}

/** The slanted faces of a prism with half extents `h` and ridge at `prism` × h.z. */
export const prismShape = (h: Vec3, prism: number): PrismShape => {
  const ridge = Math.max(-1, Math.min(1, prism)) * h.z;
  // left face: (-hz, -hy) → (ridge, hy); right face: (hz, -hy) → (ridge, hy)
  const ll = Math.hypot(2 * h.y, ridge + h.z) || 1;
  const lz = (-2 * h.y) / ll;
  const ly = (ridge + h.z) / ll;
  const rl = Math.hypot(2 * h.y, h.z - ridge) || 1;
  const rz = (2 * h.y) / rl;
  const ry = (h.z - ridge) / rl;
  return {
    ridge,
    lz,
    ly,
    ld: lz * -h.z + ly * -h.y,
    rz,
    ry,
    rd: rz * h.z + ry * -h.y,
  };
};

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
  /** moving blocks (empty on most maps) */
  movers: LevelMover[];
  /** colliding boxes carried by movers, ascending (never in the grid) */
  moverBoxes: number[];
  /** the tick the movers were last placed at (setLevelTick; NaN = never) */
  moverTick: number;
  /** some box is see-through (lineOfSight skips those) */
  seeThrough: boolean;
  /** scratch for de-duplicating grid queries */
  stamp: Uint32Array;
  stampId: number;
}

const CELL = 4;

export const buildLevel = (def: LevelDef): Level => {
  // the sky duel arena (if any) collides like the rest, after the ship's own boxes
  const defs = def.skyArena ? [...def.boxes, ...def.skyArena.boxes] : def.boxes;
  const boxes: BoxShape[] = defs.map((b, index) => {
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
      boomerangPasses: !!b.boomerangPasses,
      prism: b.prism !== undefined ? prismShape(b.h, b.prism) : null,
      surf: !!b.surf,
      seeThrough: !!b.seeThrough,
      mover: -1,
    };
  });

  // moving blocks: their boxes get centres of their own (moved in place by setLevelTick)
  const movers: LevelMover[] = [];
  for (const m of def.movers ?? []) {
    const mi = movers.length;
    const ids = m.boxes.filter((i) => i >= 0 && i < def.boxes.length && boxes[i].mover < 0);
    for (const i of ids) boxes[i].mover = mi;
    movers.push({
      timeline: moverTimeline(m.path, m.speed, m.delay),
      boxes: ids,
      baseC: ids.map((i) => v3(boxes[i].c.x, boxes[i].c.y, boxes[i].c.z)),
      baseMin: ids.map((i) => v3(boxes[i].min.x, boxes[i].min.y, boxes[i].min.z)),
      baseMax: ids.map((i) => v3(boxes[i].max.x, boxes[i].max.y, boxes[i].max.z)),
      offset: v3(),
      killVolumes: m.killVolumes ?? [],
    });
    for (const i of ids) {
      const b = boxes[i];
      b.c = v3(b.c.x, b.c.y, b.c.z);
      b.min = v3(b.min.x, b.min.y, b.min.z);
      b.max = v3(b.max.x, b.max.y, b.max.z);
    }
  }
  const moverBoxes = boxes.filter((b) => b.mover >= 0 && b.collide).map((b) => b.index);

  // the grid covers the bounds and every colliding box (the sky arena floats far above them)
  const lo = v3(def.boundsMin.x, def.boundsMin.y, def.boundsMin.z);
  const hi = v3(def.boundsMax.x, def.boundsMax.y, def.boundsMax.z);
  for (const b of boxes) {
    if (!b.collide || b.mover >= 0) continue;
    lo.x = Math.min(lo.x, b.min.x);
    lo.y = Math.min(lo.y, b.min.y);
    lo.z = Math.min(lo.z, b.min.z);
    hi.x = Math.max(hi.x, b.max.x);
    hi.y = Math.max(hi.y, b.max.y);
    hi.z = Math.max(hi.z, b.max.z);
  }
  const gridMin = v3(lo.x - CELL, lo.y - CELL, lo.z - CELL);
  const dims: [number, number, number] = [
    Math.ceil((hi.x - gridMin.x) / CELL) + 2,
    Math.ceil((hi.y - gridMin.y) / CELL) + 2,
    Math.ceil((hi.z - gridMin.z) / CELL) + 2,
  ];
  const grid = new Map<number, number[]>();
  let colliders = 0;
  for (const b of boxes) {
    if (!b.collide) continue;
    colliders++;
    if (b.mover >= 0) continue;
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

  const level: Level = {
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
    movers,
    moverBoxes,
    moverTick: NaN,
    seeThrough: boxes.some((b) => b.seeThrough),
    stamp: new Uint32Array(boxes.length),
    stampId: 0,
  };
  if (movers.length) setLevelTick(level, 0);
  return level;
};

/**
 * Put the moving blocks where they are at world tick `tick` (level/movers.ts). The sim calls it
 * at the start of every step (sim/world.ts), so collisions and hits during a tick see that
 * tick's positions on the server and in the client's prediction alike. Cheap when nothing moves.
 */
export const setLevelTick = (level: Level, tick: number): void => {
  if (!level.movers.length || level.moverTick === tick) return;
  level.moverTick = tick;
  for (const m of level.movers) {
    const o = timelineAt(m.timeline, tick, m.offset);
    for (let k = 0; k < m.boxes.length; k++) {
      const b = level.boxes[m.boxes[k]];
      const c = m.baseC[k];
      const lo = m.baseMin[k];
      const hi = m.baseMax[k];
      b.c.x = c.x + o.x;
      b.c.y = c.y + o.y;
      b.c.z = c.z + o.z;
      b.min.x = lo.x + o.x;
      b.min.y = lo.y + o.y;
      b.min.z = lo.z + o.z;
      b.max.x = hi.x + o.x;
      b.max.y = hi.y + o.y;
      b.max.z = hi.z + o.z;
    }
  }
};

/** A fresh id for `level.stamp` (marks boxes already visited by one query). */
export const nextStamp = (level: Level): number => {
  level.stampId = (level.stampId + 1) >>> 0;
  if (level.stampId === 0) {
    level.stamp.fill(0);
    level.stampId = 1;
  }
  return level.stampId;
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
  const id = nextStamp(level);
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
  // moving blocks live outside the grid
  for (const i of level.moverBoxes) {
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
