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
