// The clipping check: boxes (and prisms) that cut through each other where you can see it.
// Two pieces may overlap only when they look the same (same material and colour: the overlap
// is hidden inside one solid); anything else — a wall through a path, a tree through a
// platform, a cloud layer through an island, coplanar faces of different colours fighting —
// is a hit (except the sea's surface on surf maps: whatever stands in the water crosses it).
// Works on any LevelDef (race tracks, surf maps, and the combat maps via tools/map).
import type { Vec3 } from '../../math/vec3';
import { v3, cross, dot, len, normalize, scale, sub } from '../../math/vec3';
import type { BoxShape } from '../level';
import { buildLevel } from '../level';
import type { LevelDef } from '../types';

export interface Overlap {
  /** box indices in LevelDef.boxes */
  a: number;
  b: number;
  /** how deep they cut into each other, metres */
  depth: number;
}

const toWorld = (b: BoxShape, x: number, y: number, z: number): Vec3 =>
  v3(
    b.c.x + b.ax.x * x + b.ay.x * y + b.az.x * z,
    b.c.y + b.ax.y * x + b.ay.y * y + b.az.y * z,
    b.c.z + b.ax.z * x + b.ay.z * y + b.az.z * z,
  );
const dirWorld = (b: BoxShape, x: number, y: number, z: number): Vec3 =>
  v3(
    b.ax.x * x + b.ay.x * y + b.az.x * z,
    b.ax.y * x + b.ay.y * y + b.az.y * z,
    b.ax.z * x + b.ay.z * y + b.az.z * z,
  );

interface Hull {
  verts: Vec3[];
  faces: Vec3[];
  edges: Vec3[];
}

const hullOf = (b: BoxShape): Hull => {
  const { x: hx, y: hy, z: hz } = b.h;
  if (b.hull) {
    // a free-form prism: its corners, its face planes, its triangles' edges
    const h = b.hull;
    const verts = h.v.map((p) => v3(b.c.x + p.x, b.c.y + p.y, b.c.z + p.z));
    const edges: Vec3[] = [];
    for (const t of h.tris)
      for (let k = 0; k < 3; k++) {
        const e = sub(h.v[t[(k + 1) % 3]], h.v[t[k]]);
        if (len(e) > 1e-9) edges.push(normalize(e));
      }
    return { verts, faces: h.n, edges };
  }
  if (b.prism) {
    const r = b.prism.ridge;
    const verts = [
      toWorld(b, -hx, -hy, -hz),
      toWorld(b, -hx, -hy, hz),
      toWorld(b, hx, -hy, -hz),
      toWorld(b, hx, -hy, hz),
      toWorld(b, -hx, hy, r),
      toWorld(b, hx, hy, r),
    ];
    const faces = [
      b.ax,
      b.ay,
      dirWorld(b, 0, b.prism.ly, b.prism.lz),
      dirWorld(b, 0, b.prism.ry, b.prism.rz),
    ];
    const edges = [
      b.ax,
      b.az,
      normalize(dirWorld(b, 0, 2 * hy, r + hz)),
      normalize(dirWorld(b, 0, 2 * hy, r - hz)),
    ];
    return { verts, faces, edges };
  }
  const verts: Vec3[] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) verts.push(toWorld(b, sx * hx, sy * hy, sz * hz));
  return { verts, faces: [b.ax, b.ay, b.az], edges: [b.ax, b.ay, b.az] };
};

const project = (verts: Vec3[], n: Vec3): [number, number] => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of verts) {
    const d = dot(p, n);
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return [lo, hi];
};

/** How deep two convex pieces cut into each other (≤ 0: apart or just touching). */
export const penetration = (a: BoxShape, b: BoxShape): number => {
  const ha = hullOf(a);
  const hb = hullOf(b);
  const axes: Vec3[] = [...ha.faces, ...hb.faces];
  for (const e of ha.edges)
    for (const f of hb.edges) {
      const c = cross(e, f);
      const l = len(c);
      if (l > 1e-6) axes.push(scale(c, 1 / l));
    }
  let best = Infinity;
  for (const n of axes) {
    const [a0, a1] = project(ha.verts, n);
    const [b0, b1] = project(hb.verts, n);
    const o = Math.min(a1, b1) - Math.max(a0, b0);
    if (o < best) best = o;
    if (best <= 0) return best;
  }
  return best;
};

/**
 * Every pair of visible pieces that cut into each other deeper than `tol` and don't look the
 * same (see the top of this file).
 */
export const findOverlaps = (def: LevelDef, tol = 0.02): Overlap[] => {
  const level = buildLevel({ ...def, skyArena: undefined });
  const boxes = level.boxes;
  // (a sea's surface is meant to be crossed: towers and rocks stand in it)
  const look = def.boxes.map((b) =>
    b.noRender || b.mat === 'water' ? null : `${b.mat ?? 'hull'}|${b.color ?? -1}`,
  );
  const order = boxes.map((_, i) => i).filter((i) => look[i] !== null);
  order.sort((i, j) => boxes[i].min.x - boxes[j].min.x);
  const out: Overlap[] = [];
  for (let s = 0; s < order.length; s++) {
    const i = order[s];
    const A = boxes[i];
    for (let t = s + 1; t < order.length; t++) {
      const j = order[t];
      const B = boxes[j];
      if (B.min.x > A.max.x - tol) break;
      if (look[i] === look[j]) continue;
      if (B.min.y > A.max.y - tol || B.max.y < A.min.y + tol) continue;
      if (B.min.z > A.max.z - tol || B.max.z < A.min.z + tol) continue;
      const depth = penetration(A, B);
      if (depth > tol) out.push({ a: Math.min(i, j), b: Math.max(i, j), depth });
    }
  }
  return out;
};

/** A readable line for an overlap (tests and tools). */
export const describeOverlap = (def: LevelDef, o: Overlap): string => {
  const d = (i: number) => {
    const b = def.boxes[i];
    const c = b.c;
    return `#${i} ${b.mat ?? 'hull'} ${(b.color ?? 0).toString(16)}${b.prism !== undefined ? ' prism' : ''} at ${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)} size ${(b.h.x * 2).toFixed(1)}×${(b.h.y * 2).toFixed(1)}×${(b.h.z * 2).toFixed(1)}`;
  };
  return `${d(o.a)}  ×  ${d(o.b)}  (${o.depth.toFixed(2)} m deep)`;
};
