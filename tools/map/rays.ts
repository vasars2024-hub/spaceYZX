// Fast ray queries for map analysis. Same answers as the game's `raycast` / `lineOfSight`
// (packages/shared/src/level/collision.ts) — it uses the same per-box ray test — but walks a
// fine uniform grid cell by cell (3D DDA) and stops at the first hit, instead of gathering
// every box in the ray's bounding box. Analysis casts millions of long rays, so this matters.
import { rayBox, type Level, type Vec3 } from '@space-yz/shared';

export interface FastHit {
  t: number; // distance along the (unit) direction
  box: number; // index into level.boxes
}

export class RayIndex {
  readonly level: Level;
  private readonly cell: number;
  private readonly x0: number;
  private readonly y0: number;
  private readonly z0: number;
  private readonly nx: number;
  private readonly ny: number;
  private readonly nz: number;
  private readonly start: Int32Array; // CSR: boxes of cell k are items[start[k] .. start[k+1])
  private readonly items: Int32Array;
  private readonly stamp: Uint32Array;
  private stampId = 0;
  /** number of rays cast (for performance reports) */
  rays = 0;

  constructor(level: Level, cell = 2) {
    this.level = level;
    this.cell = cell;
    const def = level.def;
    let mnx = def.boundsMin.x,
      mny = def.boundsMin.y,
      mnz = def.boundsMin.z;
    let mxx = def.boundsMax.x,
      mxy = def.boundsMax.y,
      mxz = def.boundsMax.z;
    for (const b of level.boxes) {
      if (!b.collide) continue;
      mnx = Math.min(mnx, b.min.x);
      mny = Math.min(mny, b.min.y);
      mnz = Math.min(mnz, b.min.z);
      mxx = Math.max(mxx, b.max.x);
      mxy = Math.max(mxy, b.max.y);
      mxz = Math.max(mxz, b.max.z);
    }
    this.x0 = mnx - cell;
    this.y0 = mny - cell;
    this.z0 = mnz - cell;
    this.nx = Math.ceil((mxx + cell - this.x0) / cell) + 1;
    this.ny = Math.ceil((mxy + cell - this.y0) / cell) + 1;
    this.nz = Math.ceil((mxz + cell - this.z0) / cell) + 1;
    const n = this.nx * this.ny * this.nz;
    const pad = 0.01;
    const range = (b: { min: Vec3; max: Vec3 }) => [
      this.clampCell(Math.floor((b.min.x - pad - this.x0) / cell), this.nx),
      this.clampCell(Math.floor((b.max.x + pad - this.x0) / cell), this.nx),
      this.clampCell(Math.floor((b.min.y - pad - this.y0) / cell), this.ny),
      this.clampCell(Math.floor((b.max.y + pad - this.y0) / cell), this.ny),
      this.clampCell(Math.floor((b.min.z - pad - this.z0) / cell), this.nz),
      this.clampCell(Math.floor((b.max.z + pad - this.z0) / cell), this.nz),
    ];
    const counts = new Int32Array(n + 1);
    const forCells = (b: { min: Vec3; max: Vec3 }, fn: (k: number) => void) => {
      const [ax, bx, ay, by, az, bz] = range(b);
      for (let z = az; z <= bz; z++)
        for (let y = ay; y <= by; y++)
          for (let x = ax; x <= bx; x++) fn(x + this.nx * (y + this.ny * z));
    };
    for (const b of level.boxes) if (b.collide) forCells(b, (k) => counts[k + 1]++);
    for (let k = 0; k < n; k++) counts[k + 1] += counts[k];
    this.start = counts;
    this.items = new Int32Array(counts[n]);
    const fill = counts.slice(0, n);
    for (const b of level.boxes)
      if (b.collide) forCells(b, (k) => (this.items[fill[k]++] = b.index));
    this.stamp = new Uint32Array(level.boxes.length);
  }

  private clampCell(i: number, n: number): number {
    return i < 0 ? 0 : i >= n ? n - 1 : i;
  }

  /** First hit of a ray (unit `dir`) within maxDist, like the game's `raycast` (radius 0). */
  raycast(o: Vec3, dir: Vec3, maxDist: number): FastHit | null {
    this.rays++;
    const cell = this.cell;
    const gx0 = this.x0,
      gy0 = this.y0,
      gz0 = this.z0;
    const gx1 = gx0 + this.nx * cell,
      gy1 = gy0 + this.ny * cell,
      gz1 = gz0 + this.nz * cell;
    // clip the ray to the grid
    let t0 = 0,
      t1 = maxDist;
    const clip = (oc: number, dc: number, lo: number, hi: number): boolean => {
      if (Math.abs(dc) < 1e-12) return oc >= lo && oc <= hi;
      let ta = (lo - oc) / dc,
        tb = (hi - oc) / dc;
      if (ta > tb) {
        const s = ta;
        ta = tb;
        tb = s;
      }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      return t0 <= t1;
    };
    if (!clip(o.x, dir.x, gx0, gx1) || !clip(o.y, dir.y, gy0, gy1) || !clip(o.z, dir.z, gz0, gz1))
      return null;
    const px = o.x + dir.x * t0,
      py = o.y + dir.y * t0,
      pz = o.z + dir.z * t0;
    let ix = this.clampCell(Math.floor((px - gx0) / cell), this.nx);
    let iy = this.clampCell(Math.floor((py - gy0) / cell), this.ny);
    let iz = this.clampCell(Math.floor((pz - gz0) / cell), this.nz);
    const sx = dir.x > 0 ? 1 : dir.x < 0 ? -1 : 0;
    const sy = dir.y > 0 ? 1 : dir.y < 0 ? -1 : 0;
    const sz = dir.z > 0 ? 1 : dir.z < 0 ? -1 : 0;
    let tmx =
      sx > 0
        ? (gx0 + (ix + 1) * cell - o.x) / dir.x
        : sx < 0
          ? (gx0 + ix * cell - o.x) / dir.x
          : Infinity;
    let tmy =
      sy > 0
        ? (gy0 + (iy + 1) * cell - o.y) / dir.y
        : sy < 0
          ? (gy0 + iy * cell - o.y) / dir.y
          : Infinity;
    let tmz =
      sz > 0
        ? (gz0 + (iz + 1) * cell - o.z) / dir.z
        : sz < 0
          ? (gz0 + iz * cell - o.z) / dir.z
          : Infinity;
    const tdx = sx !== 0 ? Math.abs(cell / dir.x) : Infinity;
    const tdy = sy !== 0 ? Math.abs(cell / dir.y) : Infinity;
    const tdz = sz !== 0 ? Math.abs(cell / dir.z) : Infinity;

    this.stampId = (this.stampId + 1) >>> 0;
    if (this.stampId === 0) {
      this.stamp.fill(0);
      this.stampId = 1;
    }
    const id = this.stampId;
    const boxes = this.level.boxes;
    let bestT = Infinity;
    let bestBox = -1;
    for (;;) {
      const k = ix + this.nx * (iy + this.ny * iz);
      for (let j = this.start[k], e = this.start[k + 1]; j < e; j++) {
        const i = this.items[j];
        if (this.stamp[i] === id) continue;
        this.stamp[i] = id;
        const b = boxes[i];
        const limit = bestBox >= 0 ? bestT : maxDist;
        const t = b.rotated ? rotatedHit(b, o, dir, limit) : aabbHit(b, o, dir, limit);
        if (t !== null && (bestBox < 0 || t < bestT)) {
          bestT = t;
          bestBox = i;
        }
      }
      const tNext = tmx < tmy ? (tmx < tmz ? tmx : tmz) : tmy < tmz ? tmy : tmz;
      if (bestBox >= 0 && bestT <= tNext) break;
      if (tNext > t1) break;
      if (tmx <= tmy && tmx <= tmz) {
        ix += sx;
        if (ix < 0 || ix >= this.nx) break;
        tmx += tdx;
      } else if (tmy <= tmz) {
        iy += sy;
        if (iy < 0 || iy >= this.ny) break;
        tmy += tdy;
      } else {
        iz += sz;
        if (iz < 0 || iz >= this.nz) break;
        tmz += tdz;
      }
    }
    return bestBox >= 0 ? { t: bestT, box: bestBox } : null;
  }

  /** Straight line between two points free of level geometry? (like the game's lineOfSight) */
  los(a: Vec3, b: Vec3): boolean {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      dz = b.z - a.z;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 1e-6) return true;
    return this.raycast(a, { x: dx / l, y: dy / l, z: dz / l }, l) === null;
  }

  /** Distance to the first hit (maxDist when nothing is hit). */
  distance(o: Vec3, dir: Vec3, maxDist: number): number {
    const h = this.raycast(o, dir, maxDist);
    return h ? h.t : maxDist;
  }
}

type Box = Level['boxes'][number];

const rotatedHit = (b: Box, o: Vec3, dir: Vec3, maxDist: number): number | null => {
  const h = rayBox(b, o, dir, maxDist, 0);
  return h ? h.t : null;
};

/**
 * The game's rayBox() for an axis-aligned box, without allocations. Mirrors its arithmetic
 * exactly (local coordinates are o - c, the direction is unchanged), so results are identical.
 */
const aabbHit = (b: Box, o: Vec3, dir: Vec3, maxDist: number): number | null => {
  let tmin = -Infinity,
    tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const oc = i === 0 ? o.x - b.c.x : i === 1 ? o.y - b.c.y : o.z - b.c.z;
    const dc = i === 0 ? dir.x : i === 1 ? dir.y : dir.z;
    const h = i === 0 ? b.h.x : i === 1 ? b.h.y : b.h.z;
    if (Math.abs(dc) < 1e-12) {
      if (oc < -h || oc > h) return null;
      continue;
    }
    let ta = (-h - oc) / dc;
    let tb = (h - oc) / dc;
    if (ta > tb) {
      const s = ta;
      ta = tb;
      tb = s;
    }
    if (ta > tmin) tmin = ta;
    if (tb < tmax) tmax = tb;
    if (tmin > tmax) return null;
  }
  if (tmax < 0 || tmin > maxDist) return null;
  return tmin < 0 ? 0 : tmin;
};

/** Distance along unit `dir` from `o` to where the ray leaves box `b` (0 if it never enters). */
export const rayBoxExit = (b: Box, o: Vec3, dir: Vec3): number => {
  const d = { x: o.x - b.c.x, y: o.y - b.c.y, z: o.z - b.c.z };
  const axes = [b.ax, b.ay, b.az];
  const hs = [b.h.x, b.h.y, b.h.z];
  let tmin = -Infinity,
    tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const a = axes[i];
    const oc = d.x * a.x + d.y * a.y + d.z * a.z;
    const dc = dir.x * a.x + dir.y * a.y + dir.z * a.z;
    const h = hs[i];
    if (Math.abs(dc) < 1e-12) {
      if (oc < -h || oc > h) return 0;
      continue;
    }
    let ta = (-h - oc) / dc;
    let tb = (h - oc) / dc;
    if (ta > tb) {
      const s = ta;
      ta = tb;
      tb = s;
    }
    if (ta > tmin) tmin = ta;
    if (tb < tmax) tmax = tb;
  }
  return tmin > tmax || tmax < 0 ? 0 : tmax;
};
