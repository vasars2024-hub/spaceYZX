// Minimap routes (the red-and-white guide line to your objective): a walking route through the
// level you are actually playing, worked out from the level itself, so new maps, Map Maker edits
// and player-made maps need nothing extra.
//   1. The map's bot waypoints (hand-placed, they know the gravity lanes, drops and zero-G), each
//      link re-checked against the current geometry: a node now inside a block or with its floor
//      gone, or a link walled off at knee, chest and head height, is dropped (a Map Maker edit).
//   2. Where they don't lead there (a player-made map has none; an edit cut the way), a walking
//      grid built from the level's boxes: standable tops with head room, steps and ramps up,
//      drops down (one way), walls in between blocking. Normal gravity only.
// Both are built once per level (cached) and searched with A*. Pure: no Three.js, no DOM.
import type { Level, Vec3 } from '@space-yz/shared';
import {
  add,
  capsuleOverlaps,
  len,
  lenSq,
  madd,
  normalize,
  pointInAabb,
  raycast,
  scale,
  sub,
  v3,
} from '@space-yz/shared';

export interface NavGraph {
  /** feet positions */
  nodes: Vec3[];
  /** outgoing links per node (drops are one way) */
  links: number[][];
  /** where the graph came from */
  kind: 'waypoints' | 'grid';
}

const UP = v3(0, 1, 0);

/** The body's up at a point (from the level's gravity zones; zero-G and no gravity: world up). */
export const upAt = (level: Level, p: Vec3): Vec3 => {
  let best = -1;
  let pri = -Infinity;
  for (let i = 0; i < level.zones.length; i++) {
    const z = level.zones[i];
    const zp = z.priority ?? 0;
    if (zp >= pri && pointInAabb(p, z.min, z.max)) {
      best = i;
      pri = zp;
    }
  }
  const g = best >= 0 ? level.zones[best].gravity : level.def.defaultGravity;
  return lenSq(g) < 1e-6 ? UP : normalize(scale(g, -1));
};

const zeroGAt = (level: Level, p: Vec3): boolean => {
  let best = -1;
  let pri = -Infinity;
  for (let i = 0; i < level.zones.length; i++) {
    const z = level.zones[i];
    const zp = z.priority ?? 0;
    if (zp >= pri && pointInAabb(p, z.min, z.max)) {
      best = i;
      pri = zp;
    }
  }
  const g = best >= 0 ? level.zones[best].gravity : level.def.defaultGravity;
  return lenSq(g) < 1e-6;
};

/** A standing body with its feet at `feet` (up `up`) fits there. */
const bodyFits = (level: Level, feet: Vec3, up: Vec3): boolean =>
  !capsuleOverlaps(level, { center: madd(feet, up, 0.95), up, halfSeg: 0.45, radius: 0.35 }, 0.05);

/** Something solid in the way between two points (every box, glass included). */
const blocked = (level: Level, a: Vec3, b: Vec3): boolean => {
  const d = sub(b, a);
  const l = len(d);
  if (l < 1e-4) return false;
  const hit = raycast(level, a, scale(d, 1 / l), l);
  return !!hit && hit.t < l - 0.05;
};

// ------------------------------------------------------------------------------------------
// 1. the map's waypoints, checked against the level as it is

const fromWaypoints = (level: Level): NavGraph | null => {
  const wps = level.def.waypoints;
  if (!wps?.length) return null;
  const ups = wps.map((w) => upAt(level, madd(w.pos, UP, 0.9)));
  const ok = wps.map((w, i) => {
    const up = ups[i];
    // (zero-G nodes float: no floor needed, only room)
    if (zeroGAt(level, madd(w.pos, up, 0.9))) return true;
    // the floor is still there (within a step) and the body still fits
    const floor = raycast(level, madd(w.pos, up, 0.5), scale(up, -1), 3);
    return !!floor && bodyFits(level, madd(w.pos, up, 0.05), up);
  });
  const links = wps.map((w, i) => {
    if (!ok[i]) return [];
    return w.links.filter((j) => {
      if (!ok[j]) return false;
      const a = w.pos;
      const b = wps[j].pos;
      // walled off at knee, chest and head height alike: a new wall (hand-made links may
      // climb a step, vault a rail or drop off a ledge, so one clear height keeps them)
      return [0.5, 1, 1.6].some(
        (hgt) => !blocked(level, madd(a, ups[i], hgt), madd(b, ups[j], hgt)),
      );
    });
  });
  return { nodes: wps.map((w) => w.pos), links, kind: 'waypoints' };
};

// ------------------------------------------------------------------------------------------
// 2. a walking grid from the level's boxes (normal gravity)

/** Grid cell size: 1.5 m, coarser on huge maps (at most ~40k columns). */
const cellSize = (level: Level): number => {
  const { boundsMin: lo, boundsMax: hi } = level.def;
  const area = Math.max(1, (hi.x - lo.x) * (hi.z - lo.z));
  return Math.max(1.5, Math.sqrt(area / 40000));
};

const fromGrid = (level: Level): NavGraph => {
  const { boundsMin: lo, boundsMax: hi } = level.def;
  const cs = cellSize(level);
  const nx = Math.max(1, Math.ceil((hi.x - lo.x) / cs));
  const nz = Math.max(1, Math.ceil((hi.z - lo.z) / cs));
  const cols: number[][] = Array.from({ length: nx * nz }, () => []);
  const nodes: Vec3[] = [];
  const down = v3(0, -1, 0);
  // standable surfaces per column: every colliding box's top over the column's middle
  for (let bi = 0; bi < level.boxes.length; bi++) {
    const b = level.boxes[bi];
    if (!b.collide || b.mover >= 0) continue;
    const i0 = Math.max(0, Math.floor((b.min.x - lo.x) / cs));
    const i1 = Math.min(nx - 1, Math.floor((b.max.x - lo.x) / cs));
    const k0 = Math.max(0, Math.floor((b.min.z - lo.z) / cs));
    const k1 = Math.min(nz - 1, Math.floor((b.max.z - lo.z) / cs));
    for (let i = i0; i <= i1; i++)
      for (let k = k0; k <= k1; k++) {
        const x = lo.x + (i + 0.5) * cs;
        const z = lo.z + (k + 0.5) * cs;
        const hit = raycast(level, v3(x, b.max.y + 0.05, z), down, b.max.y - b.min.y + 0.1);
        if (!hit || hit.box !== bi || hit.normal.y < 0.7) continue;
        const col = cols[i + k * nx];
        const y = hit.point.y;
        if (col.some((n) => Math.abs(nodes[n].y - y) < 0.4)) continue;
        const feet = v3(x, y, z);
        if (!bodyFits(level, madd(feet, UP, 0.05), UP)) continue;
        col.push(nodes.length);
        nodes.push(feet);
      }
  }
  const links: number[][] = nodes.map(() => []);
  for (let i = 0; i < nx; i++)
    for (let k = 0; k < nz; k++)
      for (const a of cols[i + k * nx])
        for (let di = -1; di <= 1; di++)
          for (let dk = -1; dk <= 1; dk++) {
            if (!di && !dk) continue;
            const ii = i + di;
            const kk = k + dk;
            if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
            for (const b of cols[ii + kk * nx]) {
              const dy = nodes[b].y - nodes[a].y;
              // steps and ramps up (a little more across a diagonal), drops down to 8 m
              if (dy > 1.1 * Math.hypot(di, dk) || dy < -8) continue;
              const hgt = Math.max(0, dy) + 0.6;
              if (blocked(level, madd(nodes[a], UP, hgt), madd(nodes[b], UP, hgt))) continue;
              links[a].push(b);
            }
          }
  return { nodes, links, kind: 'grid' };
};

// ------------------------------------------------------------------------------------------
// the graphs of a level (cached) and the search

const cache = new WeakMap<Level, { wp: NavGraph | null; grid?: NavGraph }>();

const graphsOf = (level: Level) => {
  let c = cache.get(level);
  if (!c) cache.set(level, (c = { wp: fromWaypoints(level) }));
  return c;
};

/** The grid of a level (built the first time a route needs it). */
const gridOf = (level: Level): NavGraph => {
  const c = graphsOf(level);
  return (c.grid ??= fromGrid(level));
};

/**
 * The node a body at `pos` (feet) goes to first: the nearest within `maxDist` with a clear line
 * to it, else simply the nearest within twice that; -1 when nothing is that close.
 */
export const nearestNode = (level: Level, g: NavGraph, pos: Vec3, maxDist = 14): number => {
  const order: [number, number][] = [];
  const far = maxDist * maxDist * 4;
  for (let i = 0; i < g.nodes.length; i++) {
    const d = lenSq(sub(g.nodes[i], pos));
    if (d < far) order.push([d, i]);
  }
  order.sort((a, b) => a[0] - b[0]);
  for (const [d, i] of order.slice(0, 12)) {
    if (d > maxDist * maxDist) break;
    const up = upAt(level, madd(g.nodes[i], UP, 0.9));
    if (!blocked(level, add(pos, scale(up, 0.9)), madd(g.nodes[i], up, 0.9))) return i;
  }
  return order.length ? order[0][1] : -1;
};

/** A* from node `a` to node `b`: the node indices in order, or [] when there's no way. */
export const searchGraph = (g: NavGraph, a: number, b: number): number[] => {
  const n = g.nodes.length;
  const gs = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const f = new Float64Array(n).fill(Infinity);
  const h = (i: number) => len(sub(g.nodes[i], g.nodes[b]));
  // the open list: a binary heap of [f, node] (the walking grid of a big map has tens of
  // thousands of nodes); a node may sit in it more than once, the stale copies are skipped
  const open: [number, number][] = [];
  const push = (v: number) => {
    open.push([f[v], v]);
    let i = open.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (open[p][0] <= open[i][0]) break;
      [open[p], open[i]] = [open[i], open[p]];
      i = p;
    }
  };
  const pop = (): number => {
    const top = open[0][1];
    const last = open.pop()!;
    if (open.length) {
      open[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < open.length && open[l][0] < open[m][0]) m = l;
        if (r < open.length && open[r][0] < open[m][0]) m = r;
        if (m === i) break;
        [open[m], open[i]] = [open[i], open[m]];
        i = m;
      }
    }
    return top;
  };
  gs[a] = 0;
  f[a] = h(a);
  push(a);
  while (open.length) {
    const u = pop();
    if (u === b) break;
    if (closed[u]) continue;
    closed[u] = 1;
    for (const v of g.links[u]) {
      if (closed[v]) continue;
      const d = gs[u] + len(sub(g.nodes[u], g.nodes[v]));
      if (d < gs[v]) {
        gs[v] = d;
        prev[v] = u;
        f[v] = d + h(v);
        push(v);
      }
    }
  }
  if (gs[b] === Infinity) return [];
  const out: number[] = [];
  for (let v = b; v >= 0; v = prev[v]) out.unshift(v);
  return out;
};

export interface Route {
  /** feet positions from you to the goal */
  points: Vec3[];
  /** metres along it */
  length: number;
  kind: NavGraph['kind'];
}

const routeOn = (level: Level, g: NavGraph, from: Vec3, to: Vec3): Route | null => {
  const a = nearestNode(level, g, from);
  const b = nearestNode(level, g, to, 20);
  if (a < 0 || b < 0) return null;
  const path = a === b ? [a] : searchGraph(g, a, b);
  if (!path.length) return null;
  const pts = path.map((i) => g.nodes[i]);
  // don't walk back to a node behind you when the next one is nearer
  if (pts.length > 1 && len(sub(pts[1], from)) < len(sub(pts[1], pts[0]))) pts.shift();
  const points = [from, ...pts, to];
  let length = 0;
  for (let i = 1; i < points.length; i++) length += len(sub(points[i], points[i - 1]));
  return { points, length, kind: g.kind };
};

/**
 * The walking route from `from` to `to` (feet positions) in this level: over the map's checked
 * waypoints if they lead there, else over the walking grid. Null when neither does.
 */
export const findRoute = (level: Level, from: Vec3, to: Vec3): Route | null => {
  const c = graphsOf(level);
  if (c.wp) {
    const r = routeOn(level, c.wp, from, to);
    if (r) return r;
  }
  // (the grid knows only normal gravity)
  if (level.zones.length && level.def.waypoints?.length) return null;
  return routeOn(level, gridOf(level), from, to);
};
