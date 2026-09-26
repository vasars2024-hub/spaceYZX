// Helpers for authoring levels in code from simple blocks.
import type { Vec3 } from '../math/vec3';
import { v3 } from '../math/vec3';
import { qFromAxisAngle } from '../math/quat';
import type { BoxDef, LevelDef, Material } from './types';

type Opts = Omit<BoxDef, 'c' | 'h'>;

export class LevelBuilder {
  boxes: BoxDef[] = [];

  /** Axis-aligned box from min/max corners. */
  box(min: Vec3, max: Vec3, opts: Opts = {}): this {
    this.boxes.push({
      c: v3((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2),
      h: v3(Math.abs(max.x - min.x) / 2, Math.abs(max.y - min.y) / 2, Math.abs(max.z - min.z) / 2),
      mat: 'hull',
      ...opts,
    });
    return this;
  }

  /** Box from center + full size. */
  block(c: Vec3, size: Vec3, opts: Opts = {}): this {
    this.boxes.push({ c, h: v3(size.x / 2, size.y / 2, size.z / 2), mat: 'crate', ...opts });
    return this;
  }

  /**
   * A ramp slab rising from (x0,y0) to (x1,y1) along one horizontal axis, `width` wide,
   * centred on `across` for the other axis.
   */
  ramp(
    axis: 'x' | 'z',
    from: number,
    to: number,
    yFrom: number,
    yTo: number,
    across: number,
    width: number,
    opts: Opts = {},
  ): this {
    if (to < from) {
      // always build from low coordinate to high so the slab offset is on the right side
      [from, to] = [to, from];
      [yFrom, yTo] = [yTo, yFrom];
    }
    const thick = 0.6;
    const run = to - from;
    const rise = yTo - yFrom;
    const length = Math.hypot(run, rise);
    const angle = Math.atan2(rise, run);
    const midAlong = (from + to) / 2;
    const midY = (yFrom + yTo) / 2;
    // slab centre sits half a thickness below the walking surface
    const nx = -Math.sin(angle) * (thick / 2);
    const ny = Math.cos(angle) * (thick / 2);
    if (axis === 'x') {
      this.boxes.push({
        c: v3(midAlong - nx, midY - ny, across),
        h: v3(length / 2, thick / 2, width / 2),
        q: qFromAxisAngle(v3(0, 0, 1), angle),
        mat: 'floor',
        ...opts,
      });
    } else {
      // along z: rotate around x. Positive angle around x tilts +z downward, so negate.
      this.boxes.push({
        c: v3(across, midY - ny, midAlong - nx),
        h: v3(width / 2, thick / 2, length / 2),
        q: qFromAxisAngle(v3(1, 0, 0), -angle),
        mat: 'floor',
        ...opts,
      });
    }
    return this;
  }

  /**
   * A wall panel (axis-aligned slab) spanning [a,b] with optional rectangular holes.
   * `normalAxis` is the thin axis; holes are given in the other two axes' coordinates.
   */
  wall(
    normalAxis: 'x' | 'y' | 'z',
    at: number,
    thickness: number,
    uMin: number,
    uMax: number,
    vMin: number,
    vMax: number,
    holes: { u0: number; u1: number; v0: number; v1: number }[] = [],
    opts: Opts = {},
  ): this {
    // u/v axes: for x-normal: u=z, v=y; y-normal: u=x, v=z; z-normal: u=x, v=y
    const rects = subtractHoles({ u0: uMin, u1: uMax, v0: vMin, v1: vMax }, holes);
    for (const r of rects) {
      if (r.u1 - r.u0 < 1e-3 || r.v1 - r.v0 < 1e-3) continue;
      const t0 = at - thickness / 2;
      const t1 = at + thickness / 2;
      let min: Vec3, max: Vec3;
      if (normalAxis === 'x') {
        min = v3(t0, r.v0, r.u0);
        max = v3(t1, r.v1, r.u1);
      } else if (normalAxis === 'y') {
        min = v3(r.u0, t0, r.v0);
        max = v3(r.u1, t1, r.v1);
      } else {
        min = v3(r.u0, r.v0, t0);
        max = v3(r.u1, r.v1, t1);
      }
      this.box(min, max, opts);
    }
    return this;
  }

  /**
   * Hollow room: floor, ceiling and 4 walls around the inner volume [min,max], with holes.
   * Hole keys: '+x','-x','+y','-y','+z','-z'.
   */
  room(
    min: Vec3,
    max: Vec3,
    t: number,
    holes: Partial<Record<Face, { u0: number; u1: number; v0: number; v1: number }[]>> = {},
    mats: { floor?: Material; wall?: Material; ceiling?: Material; trim?: number } = {},
  ): this {
    const fo = { mat: mats.floor ?? ('floor' as Material) };
    const wo = { mat: mats.wall ?? ('hull' as Material), trim: mats.trim };
    const co = { mat: mats.ceiling ?? ('hull' as Material) };
    this.wall('y', min.y - t / 2, t, min.x - t, max.x + t, min.z - t, max.z + t, holes['-y'], fo);
    this.wall('y', max.y + t / 2, t, min.x - t, max.x + t, min.z - t, max.z + t, holes['+y'], co);
    this.wall('x', min.x - t / 2, t, min.z, max.z, min.y, max.y, holes['-x'], wo);
    this.wall('x', max.x + t / 2, t, min.z, max.z, min.y, max.y, holes['+x'], wo);
    this.wall('z', min.z - t / 2, t, min.x - t, max.x + t, min.y, max.y, holes['-z'], wo);
    this.wall('z', max.z + t / 2, t, min.x - t, max.x + t, min.y, max.y, holes['+z'], wo);
    return this;
  }

  build(rest: Omit<LevelDef, 'boxes'>): LevelDef {
    return { ...rest, boxes: this.boxes };
  }
}

export type Face = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

/** Look of one kind of generated surface. */
export interface SurfaceStyle {
  mat: Material;
  color?: number;
}

/** An open volume for `shellAround` (a room, a doorway, a hole in a floor...). */
export interface OpenVolume {
  min: Vec3;
  max: Vec3;
  /** false: no ceiling slab (a glass lid or open sky goes there instead) */
  lid?: boolean;
  /** false: only carves (doorways, windows, floor holes): it adds no walls of its own */
  walls?: boolean;
  /** surfaces of the slabs around it (defaults: 'floor' floor, 'hull' walls and ceiling) */
  floor?: SurfaceStyle;
  wall?: SurfaceStyle;
  ceiling?: SurfaceStyle;
}

/**
 * Solid walls, floors and ceilings `t` thick around a set of open volumes: everything within
 * `t` of a volume that is not inside any volume. Volumes that touch or overlap open into each
 * other; volumes 1 wall apart get one shared wall (no doubled, z-fighting faces), and a thin
 * volume across that wall is a doorway. The solid is split on the volumes' own coordinates and
 * merged greedily into few boxes (one style per box: the floor of the room above wins, then
 * the ceiling of the room below, then the wall of the first room it borders).
 */
export const shellAround = (b: LevelBuilder, vols: OpenVolume[], t = 1): void => {
  const grown = vols.map((v) =>
    v.walls === false
      ? null
      : {
          min: v3(v.min.x - t, v.min.y - t, v.min.z - t),
          max: v3(v.max.x + t, v.lid === false ? v.max.y : v.max.y + t, v.max.z + t),
        },
  );
  const coords = (k: 'x' | 'y' | 'z'): number[] => {
    const s = new Set<number>();
    for (const v of vols) s.add(v.min[k]).add(v.max[k]);
    for (const g of grown) if (g) s.add(g.min[k]).add(g.max[k]);
    return [...s].sort((a, c) => a - c);
  };
  const xs = coords('x');
  const ys = coords('y');
  const zs = coords('z');
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const nz = zs.length - 1;
  const inBox = (min: Vec3, max: Vec3, x: number, y: number, z: number) =>
    x > min.x && x < max.x && y > min.y && y < max.y && z > min.z && z < max.z;
  // cell style: 0 = open/outside, else 1 + index into `styles`
  const styles: SurfaceStyle[] = [];
  const styleId = (st: SurfaceStyle): number => {
    let i = styles.findIndex((o) => o.mat === st.mat && o.color === st.color);
    if (i < 0) i = styles.push(st) - 1;
    return 1 + i;
  };
  const FLOOR: SurfaceStyle = { mat: 'floor' };
  const HULL: SurfaceStyle = { mat: 'hull' };
  const cells = new Int16Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) {
    const z = (zs[k] + zs[k + 1]) / 2;
    for (let j = 0; j < ny; j++) {
      const y = (ys[j] + ys[j + 1]) / 2;
      for (let i = 0; i < nx; i++) {
        const x = (xs[i] + xs[i + 1]) / 2;
        if (vols.some((v) => inBox(v.min, v.max, x, y, z))) continue;
        let wall: OpenVolume | null = null;
        let floor: OpenVolume | null = null;
        let ceiling: OpenVolume | null = null;
        vols.forEach((v, vi) => {
          const g = grown[vi];
          if (!g || !inBox(g.min, g.max, x, y, z)) return;
          wall ??= v;
          if (x <= v.min.x || x >= v.max.x || z <= v.min.z || z >= v.max.z) return;
          if (y < v.min.y && (!floor || v.min.y < floor.min.y)) floor = v;
          else if (y > v.max.y && (!ceiling || v.max.y > ceiling.max.y)) ceiling = v;
        });
        if (!wall) continue;
        const f = floor as OpenVolume | null;
        const c = ceiling as OpenVolume | null;
        const w = wall as OpenVolume;
        cells[at(i, j, k)] = styleId(
          f ? (f.floor ?? FLOOR) : c ? (c.ceiling ?? HULL) : (w.wall ?? HULL),
        );
      }
    }
  }
  // greedy merge: grow each box along x, then z, then y over cells of the same style
  const done = new Uint8Array(cells.length);
  const same = (i: number, j: number, k: number, m: number) =>
    cells[at(i, j, k)] === m && !done[at(i, j, k)];
  for (let j = 0; j < ny; j++)
    for (let k = 0; k < nz; k++)
      for (let i = 0; i < nx; i++) {
        const m = cells[at(i, j, k)];
        if (m === 0 || done[at(i, j, k)]) continue;
        let i1 = i + 1;
        while (i1 < nx && same(i1, j, k, m)) i1++;
        let k1 = k + 1;
        const rowOk = (kk: number, jj: number) => {
          for (let ii = i; ii < i1; ii++) if (!same(ii, jj, kk, m)) return false;
          return true;
        };
        while (k1 < nz && rowOk(k1, j)) k1++;
        let j1 = j + 1;
        const slabOk = (jj: number) => {
          for (let kk = k; kk < k1; kk++) if (!rowOk(kk, jj)) return false;
          return true;
        };
        while (j1 < ny && slabOk(j1)) j1++;
        for (let jj = j; jj < j1; jj++)
          for (let kk = k; kk < k1; kk++) for (let ii = i; ii < i1; ii++) done[at(ii, jj, kk)] = 1;
        const st = styles[m - 1];
        b.box(v3(xs[i], ys[j], zs[k]), v3(xs[i1], ys[j1], zs[k1]), {
          mat: st.mat,
          ...(st.color !== undefined ? { color: st.color } : {}),
        });
      }
};

interface Rect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/** Split a rectangle into pieces that avoid the given holes. */
export const subtractHoles = (rect: Rect, holes: Rect[]): Rect[] => {
  let pieces: Rect[] = [rect];
  for (const h of holes) {
    const next: Rect[] = [];
    for (const r of pieces) {
      const iu0 = Math.max(r.u0, h.u0),
        iu1 = Math.min(r.u1, h.u1);
      const iv0 = Math.max(r.v0, h.v0),
        iv1 = Math.min(r.v1, h.v1);
      if (iu0 >= iu1 || iv0 >= iv1) {
        next.push(r);
        continue;
      }
      // left, right full-height strips; bottom, top middle strips
      if (r.u0 < iu0) next.push({ u0: r.u0, u1: iu0, v0: r.v0, v1: r.v1 });
      if (iu1 < r.u1) next.push({ u0: iu1, u1: r.u1, v0: r.v0, v1: r.v1 });
      if (r.v0 < iv0) next.push({ u0: iu0, u1: iu1, v0: r.v0, v1: iv0 });
      if (iv1 < r.v1) next.push({ u0: iu0, u1: iu1, v0: iv1, v1: r.v1 });
    }
    pieces = next;
  }
  return pieces;
};

/** Mirror a level half across the plane x = 0 (swap teams). Used by symmetric maps. */
export const mirrorX = (p: Vec3): Vec3 => v3(-p.x, p.y, p.z);
