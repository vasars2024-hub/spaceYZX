// Automatic cover for graybox maps (level/graybox.ts): crates, low walls, pillars and short
// partition walls placed from the layout's cells, so open areas break into separate duels (the
// openness targets, tools/map/openness.ts). Deterministic: the same layout always gets the same
// cover (no randomness; the variety of the pieces comes from a hash of their grid position).
//
// How it works:
//   1. Cover stands on cell CORNERS (where four cells meet). Bots walk the straight lines between
//      cell centres and their waypoints sit on the centres, so a piece stays at least 0.9 m from
//      every such line it runs beside and at least 1.3 m from every centre. A corner piece is a
//      block of up to 2 × 2 m; a partition is a wall along the cell line from one corner to the
//      next one or two (up to 1.4 m thick). A partition crosses the links between the cells on
//      either side of it: the builder drops those (coverCutsLink below).
//   2. A corner can take cover when its cells are flat, walked upright, of one area and height,
//      not part of a 1–2 cell wide passage, not a doorway into another area or onto stairs, not
//      a spawn, Tower, pad, portal or zip-rail cell and with no other floor above or below them.
//      Past every piece a lane of at least two cells stays free on each axis, and two pieces
//      stand at least two cells apart. Corners against a straight wall get a block standing
//      just off the wall; inner corners of a wall get nothing.
//   3. Where: a flat (2D) sight model of the layout. Viewers stand on every cell centre, targets
//      on four points per cell, and each target counts the compass directions (8) it is seen
//      from, as the openness report does. Full cover goes greedily where it most reduces the
//      spots seen from many directions: first two pieces in each spawn area where they block
//      the most sightlines from outside into it, two on each bomb site, then the rest of the map
//      until few spots are seen from everywhere. Waist cover (crates, low walls) follows at the
//      next best corners and tops up each bomb site to at least two pieces.
import type { Vec3 } from '../math/vec3';
import { v3 } from '../math/vec3';
import type { BoxDef } from './types';
import type { GrayboxLayout } from './graybox';

/** One walkable floor cell of a built graybox (what cover is placed from). */
export interface GrayboxFloorCell {
  /** grid column / row and layer index */
  x: number;
  y: number;
  l: number;
  /** area character */
  c: string;
  /** floor height at the cell centre (m) */
  h: number;
  /** the cell is part of a ramp / stairs (no cover on it) */
  sloped: boolean;
  /** walked upside down / on a side: no cover (for now) */
  o: 'up' | 'down' | 'side';
}

/** The numbers of the cover rules (metres unless said otherwise). */
export const COVER_RULES = {
  /** a corner piece stays within this of its corner */
  maxHalf: 1.0,
  /** free strip beside every line between two cell centres: bots walk them (radius 0.4) */
  lineClear: 0.9,
  /** free radius around every cell centre (waypoints) */
  centreClear: 1.3,
  /** a lane at least this many cells wide stays free past every piece, on both axes; two
   *  pieces stand at least this far apart */
  laneCells: 2,
  /** no cover on a floor with another floor less than this above or below it (the tallest
   *  piece is 3.4 m) */
  stackGap: 4.5,
  /** two pieces stand at least this many cells apart */
  pieceGap: 0.5,
  /** spawn cells nearest the spawn area's centre that get no cover (the builder's 8 spawns) */
  spawnCells: 8,
  /** partitions span up to this many cell edges */
  maxSpan: 2,
  /** sightlines the model counts: as tools/map/openness.ts (duel range, nobody next to you) */
  range: 60,
  minSight: 3,
  /** a direction counts once this many viewers in it see a spot */
  perAngle: 2,
  /** "seen from everywhere": this many of the 8 directions */
  wideAngles: 6,
  /** stop adding full cover once the model has at most this share of such spots */
  wideShare: 0.18,
  /** ...or once no piece gains the model this much (badness points) */
  minGain: 1,
  /** full cover: at most one piece per this many open cells of an area */
  cellsPerPiece: 6,
  /** pieces on a bomb site: at least / at most */
  siteMin: 2,
  siteMax: 4,
  /** full cover pieces in each spawn area */
  spawnPieces: 2,
  /** waist cover: this share of the full cover count, on top */
  waistShare: 0.5,
};

const R = COVER_RULES;
const WALL = '.';
const VOID = '~';
const FLAT = 0.6; // neighbours within this height are one floor
const EDGE = 0.05; // a piece by a wall stays this far off it (no faces fighting)
const PLAYER_RADIUS = 0.4;

/** Deterministic 0..1 noise from integers (the variety of the pieces). */
const hash = (a: number, b: number, c: number, d = 0): number => {
  let h = Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35);
  h ^= Math.imul(c + 0x2545, 0x27d4eb2f) ^ Math.imul(d + 0x1656, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A footprint on the floor (metres): x0, z0, x1, z1. */
type Foot = [number, number, number, number];

/** A place a piece can stand. */
interface Spot {
  id: number;
  l: number;
  /** first corner (cell lines), and the span along `axis` (0: a corner piece) */
  vx: number;
  vy: number;
  span: number;
  axis: 'x' | 'z';
  /** area character and floor height */
  c: string;
  h: number;
  /** a corner piece against a wall: which side the wall is on */
  wall: 'none' | 'n' | 's' | 'e' | 'w';
  /** footprint of its full cover piece */
  foot: Foot;
  /** one of its floor cells */
  ref: GrayboxFloorCell;
  /** sightline pairs that piece blocks */
  pairs: number[];
}

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export const grayboxCover = (lay: GrayboxLayout, cells: GrayboxFloorCell[]): BoxDef[] => {
  if (lay.cover === false || !cells.length) return [];
  const s = lay.cellM;
  const W = lay.layers[0].rows[0].length;
  const H = lay.layers[0].rows.length;
  const nL = lay.layers.length;
  const grid: (GrayboxFloorCell | undefined)[] = new Array(nL * W * H);
  for (const p of cells) grid[(p.l * H + p.y) * W + p.x] = p;
  const cellAt = (l: number, x: number, y: number) =>
    x < 0 || y < 0 || x >= W || y >= H ? undefined : grid[(l * H + y) * W + x];
  const charAt = (l: number, x: number, y: number) => lay.layers[l].rows[y]?.[x] ?? WALL;
  const regionOf = (c: string) => cells.filter((p) => p.c === c);
  const centreOf = (r: GrayboxFloorCell[]) => [
    r.reduce((t, p) => t + p.x, 0) / r.length,
    r.reduce((t, p) => t + p.y, 0) / r.length,
  ];
  const nearest = (r: GrayboxFloorCell[], tx: number, ty: number) =>
    [...r].sort((u, v) => (u.x - tx) ** 2 + (u.y - ty) ** 2 - ((v.x - tx) ** 2 + (v.y - ty) ** 2));

  // ---- which cells can hold cover ----------------------------------------------------------
  // a cell with another layer's floor less than `stackGap` above or below it gets no cover (a
  // deck higher over a hall leaves room for the tallest piece, 3.4 m)
  const column = new Map<number, GrayboxFloorCell[]>();
  for (const p of cells) column.set(p.y * W + p.x, [...(column.get(p.y * W + p.x) ?? []), p]);
  const stackedTight = (p: GrayboxFloorCell) =>
    column.get(p.y * W + p.x)!.some((q) => q !== p && Math.abs(q.h - p.h) < R.stackGap);
  // cells the builder puts something on: the spawns (the cells nearest each spawn area's
  // centre), each team's Tower (the spawn area's cell farthest from the map's middle), the ends
  // of pads, rails and portals (the two cells of each end nearest the other end) and the cells
  // a zip-rail passes over
  const busy = new Set<GrayboxFloorCell>();
  const spawnAreas: string[] = [];
  const middle = [(W - 1) / 2, (H - 1) / 2];
  for (const [c, a] of Object.entries(lay.legend)) {
    if (a.k !== 'cyan' && a.k !== 'orange') continue;
    const r = regionOf(c);
    if (!r.length) continue;
    spawnAreas.push(c);
    const [mx, my] = centreOf(r);
    // (the same picks as the builder's: the cells come in its order)
    for (const p of nearest(r, mx, my).slice(0, R.spawnCells)) busy.add(p);
    const far = (p: GrayboxFloorCell) => (p.x - middle[0]) ** 2 + (p.y - middle[1]) ** 2;
    const farthest = Math.max(...r.map(far));
    for (const p of r) if (far(p) >= farthest - 1e-9) busy.add(p);
  }
  for (const [from, to, kind] of lay.links ?? []) {
    if (kind === 'jump' || kind === 'jet') continue;
    const a = regionOf(from);
    const b = regionOf(to);
    if (!a.length || !b.length) continue;
    const [ax, ay] = centreOf(a);
    const [bx, by] = centreOf(b);
    const ea = nearest(a, bx, by).slice(0, 2);
    const eb = nearest(b, ax, ay).slice(0, 2);
    for (const p of [...ea, ...eb]) busy.add(p);
    if (kind === 'rail')
      for (let i = 0; i <= 40; i++) {
        const x = Math.floor(ea[0].x + 0.5 + ((eb[0].x - ea[0].x) * i) / 40);
        const y = Math.floor(ea[0].y + 0.5 + ((eb[0].y - ea[0].y) * i) / 40);
        for (let l = 0; l < nL; l++) {
          const p = cellAt(l, x, y);
          if (p) busy.add(p);
        }
      }
  }
  const isSpawn = (c: string) => spawnAreas.includes(c);
  // one floor with p (a bot walks across): same layer, no ledge between
  const sameFloor = (p: GrayboxFloorCell, x: number, y: number) => {
    const q = cellAt(p.l, x, y);
    return !!q && (q.sloped || Math.abs(q.h - p.h) <= FLAT);
  };
  const run = (p: GrayboxFloorCell, dx: number, dy: number) => {
    let n = 0;
    while (sameFloor(p, p.x + dx * (n + 1), p.y + dy * (n + 1))) n++;
    return n;
  };
  const coverCell = (p: GrayboxFloorCell) => {
    if (p.o !== 'up' || p.sloped || lay.layers[p.l].overlay) return false;
    if (busy.has(p) || stackedTight(p)) return false;
    // a passage one or two cells wide stays clear
    if (run(p, 1, 0) + run(p, -1, 0) < 2 || run(p, 0, 1) + run(p, 0, -1) < 2) return false;
    // the top or foot of stairs
    return DIRS.every(([dx, dy]) => !cellAt(p.l, p.x + dx, p.y + dy)?.sloped);
  };
  const okAt = new Set(cells.filter(coverCell));

  // ---- corners and partitions --------------------------------------------------------------
  const Z = Math.min(R.maxHalf, s / 2 - R.lineClear, s / 2 - R.centreClear / Math.SQRT2);
  const T = Math.min(Z, s / 2 - R.centreClear); // half thickness of a partition
  if (Z < 0.4) return []; // cells too small for cover
  interface Corner {
    c: string;
    h: number;
    wall: Spot['wall'];
    floor: GrayboxFloorCell[];
  }
  const cornerAt = (l: number, vx: number, vy: number): Corner | null => {
    const around = [
      [vx - 1, vy - 1],
      [vx, vy - 1],
      [vx - 1, vy],
      [vx, vy],
    ].map(([x, y]) => cellAt(l, x, y));
    // the floor: the cells at the height of the first (or else the second) floor cell around;
    // the others must be no floor at that height (a wall, a drop, a ledge up or down), and no
    // stairs
    if (around.some((p) => p?.sloped)) return null;
    const heights = around.filter((p) => !!p).map((p) => p!.h);
    let floor: GrayboxFloorCell[] = [];
    for (const h of heights) {
      floor = around.filter((p): p is GrayboxFloorCell => !!p && Math.abs(p.h - h) <= FLAT);
      if (floor.length === 2 || floor.length === 4) break;
    }
    // (three floor cells, an inner corner of a wall: no piece fits without touching the wall)
    if (floor.length !== 2 && floor.length !== 4) return null;
    if (!floor.every((p) => okAt.has(p))) return null;
    const p0 = floor[0];
    if (floor.some((p) => Math.abs(p.h - p0.h) > 0.01)) return null;
    // (on the line between two areas: it counts as the area most of its cells are in)
    const share = (c: string) => floor.filter((p) => p.c === c).length;
    const c = floor.reduce((m, p) => (share(p.c) > share(m) ? p.c : m), p0.c);
    // against a wall: two floor cells side by side
    let wall: Spot['wall'] = 'none';
    if (floor.length === 2) {
      const [a, b] = floor;
      if (a.y === b.y) wall = a.y === vy ? 'n' : 's';
      else if (a.x === b.x) wall = a.x === vx ? 'w' : 'e';
      else return null; // diagonal cells: no way past
    }
    return { c, h: p0.h, wall, floor };
  };
  // free floor (m) from a footprint's face to the first wall, ledge, drop or other piece, along
  // (dx, dy)
  const laneFrom = (
    l: number,
    f: Foot,
    ref: GrayboxFloorCell,
    dx: number,
    dy: number,
    others: Foot[],
  ) => {
    const cap = R.laneCells * s * 2;
    let free = Math.min(cap, wallLane(l, f, ref, dx, dy));
    for (const o of others) {
      // (a piece beside the lane, not in it)
      if (dx ? o[3] <= f[1] || o[1] >= f[3] : o[2] <= f[0] || o[0] >= f[2]) continue;
      const d = dx > 0 ? o[0] - f[2] : dx < 0 ? f[0] - o[2] : dy > 0 ? o[1] - f[3] : f[1] - o[3];
      if (d >= 0) free = Math.min(free, d);
    }
    return free;
  };
  const wallLane = (l: number, f: Foot, ref: GrayboxFloorCell, dx: number, dy: number) => {
    const e = 1e-6;
    const fwd = dx + dy > 0;
    // the cell rows (or columns) beside the face that are floor
    const lo = Math.floor((dx ? f[1] : f[0]) / s + e);
    const hi = Math.floor((dx ? f[3] : f[2]) / s - e);
    const face = dx > 0 ? f[2] : dx < 0 ? f[0] : dy > 0 ? f[3] : f[1];
    let k = Math.floor(face / s + (fwd ? e : -e));
    const lines: number[] = [];
    for (let v = lo; v <= hi; v++) if (dx ? cellAt(l, k, v) : cellAt(l, v, k)) lines.push(v);
    if (!lines.length) return 0;
    let free = fwd ? (k + 1) * s - face : face - k * s;
    for (;;) {
      k += fwd ? 1 : -1;
      if (!lines.every((v) => (dx ? sameFloor(ref, k, v) : sameFloor(ref, v, k)))) return free;
      free += s;
      if (free >= R.laneCells * s * 2) return free;
    }
  };
  const lanesOk = (l: number, f: Foot, ref: GrayboxFloorCell, others: Foot[] = []) => {
    const need = R.laneCells * s - 1e-6;
    const lane = (dx: number, dy: number) => laneFrom(l, f, ref, dx, dy, others);
    return Math.max(lane(1, 0), lane(-1, 0)) >= need && Math.max(lane(0, 1), lane(0, -1)) >= need;
  };
  const spots: Spot[] = [];
  const addSpot = (l: number, vx: number, vy: number, span: number, axis: 'x' | 'z') => {
    const k = cornerAt(l, vx, vy);
    if (!k) return;
    const x = vx * s;
    const z = vy * s;
    let foot: Foot;
    if (span === 0) {
      const half = Z * lerp(0.8, 1, hash(l, vx, vy, 1));
      foot =
        k.wall === 'n'
          ? [x - half, z + EDGE, x + half, z + Z]
          : k.wall === 's'
            ? [x - half, z - Z, x + half, z - EDGE]
            : k.wall === 'w'
              ? [x + EDGE, z - half, x + Z, z + half]
              : k.wall === 'e'
                ? [x - Z, z - half, x - EDGE, z + half]
                : [x - half, z - half, x + half, z + half];
    } else {
      // a partition: every corner along it free-standing (four floor cells)
      if (k.wall !== 'none') return;
      for (let i = 1; i <= span; i++) {
        const q = axis === 'x' ? cornerAt(l, vx + i, vy) : cornerAt(l, vx, vy + i);
        if (!q || q.wall !== 'none' || Math.abs(q.h - k.h) > 0.01) return;
      }
      const t = T * lerp(0.6, 1, hash(l, vx, vy, 5 + span));
      foot =
        axis === 'x'
          ? [x - Z, z - t, x + span * s + Z, z + t]
          : [x - t, z - Z, x + t, z + span * s + Z];
    }
    if (!lanesOk(l, foot, k.floor[0])) return;
    const ref = k.floor[0];
    spots.push({
      id: spots.length,
      l,
      vx,
      vy,
      span,
      axis,
      c: k.c,
      h: k.h,
      wall: k.wall,
      foot,
      ref,
      pairs: [],
    });
  };
  for (let l = 0; l < nL; l++) {
    if (lay.layers[l].overlay) continue;
    for (let vy = 1; vy < H; vy++)
      for (let vx = 1; vx < W; vx++) {
        addSpot(l, vx, vy, 0, 'x');
        for (let n = 1; n <= R.maxSpan; n++) {
          addSpot(l, vx, vy, n, 'x');
          addSpot(l, vx, vy, n, 'z');
        }
      }
  }
  if (!spots.length) return [];

  // ---- the flat sight model ----------------------------------------------------------------
  // a sight group: a layer plus the overlay layers over it (catwalks look down into its halls)
  const groupOf = (l: number) => {
    while (l > 0 && lay.layers[l].overlay) l--;
    return l;
  };
  // where sight passes: floors and drops (sky maps: everywhere, there are no walls)
  const clear = new Uint8Array(nL * W * H).fill(lay.sky ? 1 : 0);
  for (const p of cells) clear[(groupOf(p.l) * H + p.y) * W + p.x] = 1;
  for (let l = 0; l < nL; l++)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (charAt(l, x, y) === VOID) clear[(groupOf(l) * H + y) * W + x] = 1;
  // the spots whose footprint touches each cell
  const touching: Spot[][] = Array.from({ length: nL * W * H }, () => []);
  for (const k of spots)
    for (let y = Math.floor(k.foot[1] / s); y <= Math.floor(k.foot[3] / s); y++)
      for (let x = Math.floor(k.foot[0] / s); x <= Math.floor(k.foot[2] / s); x++)
        if (x >= 0 && y >= 0 && x < W && y < H) touching[(k.l * H + y) * W + x].push(k);
  // everyone stands on a cell centre; a sightline between two of them is two pairs (each one
  // the target of the other), pairs 2u and 2u + 1 of line u
  const points = cells.map((p) => ({
    x: (p.x + 0.5) * s,
    z: (p.y + 0.5) * s,
    g: groupOf(p.l),
    c: p.c,
  }));
  const pairTarget: number[] = [];
  const pairSector: number[] = [];
  /** the pair is a shot from outside a spawn area into it */
  const pairIntoSpawn: boolean[] = [];
  const stamp = new Int32Array(spots.length).fill(-1);
  let tries = 0;
  const near: Spot[] = [];
  const range2 = R.range * R.range;
  const min2 = R.minSight * R.minSight;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const base = a.g * W * H;
    for (let j = i + 1; j < points.length; j++) {
      const b = points[j];
      if (a.g !== b.g) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < min2 || d2 > range2) continue;
      // walk the cells on the line (grid traversal): all must be open; note the spots passed
      tries++;
      near.length = 0;
      let cx = Math.floor(a.x / s);
      let cz = Math.floor(a.z / s);
      const ex = Math.floor(b.x / s);
      const ez = Math.floor(b.z / s);
      const sx = dx > 0 ? 1 : -1;
      const sz = dz > 0 ? 1 : -1;
      const ddx = dx ? s / Math.abs(dx) : Infinity;
      const ddz = dz ? s / Math.abs(dz) : Infinity;
      let nx = dx ? ((dx > 0 ? cx + 1 : cx) * s - a.x) / dx : Infinity;
      let nz = dz ? ((dz > 0 ? cz + 1 : cz) * s - a.z) / dz : Infinity;
      let seen = true;
      for (let guard = W + H + 2; guard > 0; guard--) {
        const ci = base + cz * W + cx;
        if (cx < 0 || cz < 0 || cx >= W || cz >= H || !clear[ci]) {
          seen = false;
          break;
        }
        for (const q of touching[ci])
          if (stamp[q.id] !== tries) {
            stamp[q.id] = tries;
            near.push(q);
          }
        if (cx === ex && cz === ez) break;
        // (through a cell corner exactly: both neighbours must be open)
        if (
          Math.abs(nx - nz) < 1e-9 &&
          (!clear[base + cz * W + cx + sx] || !clear[base + (cz + sz) * W + cx])
        ) {
          seen = false;
          break;
        }
        if (nx < nz) {
          cx += sx;
          nx += ddx;
        } else {
          cz += sz;
          nz += ddz;
        }
      }
      if (!seen) continue;
      const u = pairTarget.length / 2;
      // the direction the shot comes from, seen from the target (as tools/map/openness.ts)
      const sector = Math.floor(((Math.atan2(dz, dx) + Math.PI) / (2 * Math.PI)) * 8) % 8;
      pairTarget.push(i, j);
      pairSector.push(sector, (sector + 4) % 8);
      pairIntoSpawn.push(isSpawn(a.c) && b.c !== a.c, isSpawn(b.c) && a.c !== b.c);
      // the spots whose footprint the line crosses (separating axes: x, z and the line's normal)
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      const z0 = Math.min(a.z, b.z);
      const z1 = Math.max(a.z, b.z);
      const ndx = Math.abs(dz);
      const ndz = Math.abs(dx);
      const off = dz * a.x - dx * a.z;
      for (const q of near) {
        const f = q.foot;
        if (f[0] > x1 || f[2] < x0 || f[1] > z1 || f[3] < z0) continue;
        const reach = (ndx * (f[2] - f[0]) + ndz * (f[3] - f[1])) / 2;
        if (Math.abs(dz * (f[0] + f[2]) * 0.5 - dx * (f[1] + f[3]) * 0.5 - off) <= reach)
          q.pairs.push(u);
      }
    }
  }
  const targets = points;
  const counts = new Int32Array(targets.length * 8);
  for (let p = 0; p < pairTarget.length; p++) counts[pairTarget[p] * 8 + pairSector[p]]++;
  const alive = new Uint8Array(pairTarget.length).fill(1);
  const delta = new Int32Array(targets.length * 8);
  const anglesOf = (j: number, minus: boolean) => {
    let a = 0;
    for (let k = 0; k < 8; k++)
      if (counts[j * 8 + k] - (minus ? delta[j * 8 + k] : 0) >= R.perAngle) a++;
    return a;
  };
  // how bad a spot is: steeply worse the more directions see it
  const badness = (a: number) => Math.max(0, a - 3) ** 2;
  const seenAt = new Int32Array(targets.length).fill(-1);
  let evals = 0;
  /**
   * Model gain of a spot's full piece: how much less badness (spawn targets count double), plus
   * a little per sightline it blocks. `spawn`: only shots from outside into a spawn count.
   */
  const gainOf = (k: Spot, spawn = false) => {
    evals++;
    const touched: number[] = [];
    let blocked = 0;
    let into = 0;
    for (const u of k.pairs)
      for (let p = 2 * u; p <= 2 * u + 1; p++) {
        if (!alive[p]) continue;
        const j = pairTarget[p];
        delta[j * 8 + pairSector[p]]++;
        if (seenAt[j] !== evals) {
          seenAt[j] = evals;
          touched.push(j);
        }
        blocked++;
        if (pairIntoSpawn[p]) into++;
      }
    let gain = blocked * 0.01;
    for (const j of touched) {
      const w = isSpawn(targets[j].c) ? 2 : 1;
      gain += w * (badness(anglesOf(j, false)) - badness(anglesOf(j, true)));
      for (let q = 0; q < 8; q++) delta[j * 8 + q] = 0;
    }
    return spawn ? into + gain * 0.01 : gain;
  };
  const block = (k: Spot) => {
    for (const u of k.pairs)
      for (let p = 2 * u; p <= 2 * u + 1; p++)
        if (alive[p]) {
          alive[p] = 0;
          counts[pairTarget[p] * 8 + pairSector[p]]--;
        }
  };
  const wideShare = () => {
    let wide = 0;
    for (let j = 0; j < targets.length; j++) if (anglesOf(j, false) >= R.wideAngles) wide++;
    return wide / targets.length;
  };

  // ---- choosing the spots ------------------------------------------------------------------
  const openCells = new Map<string, number>();
  for (const p of okAt) openCells.set(p.c, (openCells.get(p.c) ?? 0) + 1);
  const isSite = (c: string) => lay.legend[c].k === 'site';
  const sites = Object.keys(lay.legend).filter(isSite);
  const fullCap = (c: string) =>
    isSite(c) ? R.siteMax - 1 : Math.max(1, Math.floor((openCells.get(c) ?? 0) / R.cellsPerPiece));
  const chosen: { k: Spot; full: boolean }[] = [];
  const inArea = (c: string, full?: boolean) =>
    chosen.filter((q) => q.k.c === c && (full === undefined || q.full === full)).length;
  // two pieces stand a lane apart
  // two pieces stand at least a cell apart, and every piece keeps its lanes past the others
  const apart = (a: Foot, b: Foot) => Math.max(a[0] - b[2], b[0] - a[2], a[1] - b[3], b[1] - a[3]);
  const free = (k: Spot) => {
    const close = chosen.filter(
      ({ k: q }) => q.l === k.l && apart(q.foot, k.foot) < R.laneCells * s * 2,
    );
    if (close.some(({ k: q }) => apart(q.foot, k.foot) < R.pieceGap * s - 1e-6)) return false;
    const feet = [...close.map(({ k: q }) => q.foot), k.foot];
    if (!lanesOk(k.l, k.foot, k.ref, feet.slice(0, -1))) return false;
    return close.every(({ k: q }) =>
      lanesOk(
        q.l,
        q.foot,
        q.ref,
        feet.filter((f) => f !== q.foot),
      ),
    );
  };
  /** the free spot passing `ok` with the best model gain (ties: the first in layout order) */
  // (lazy: a spot's gain only shrinks as cover goes in, so the last known gain is an upper
  // bound and most spots need no new look)
  const known = [
    new Float64Array(spots.length).fill(Infinity),
    new Float64Array(spots.length).fill(Infinity),
  ];
  const best = (ok: (k: Spot) => boolean, spawn = false) => {
    const last = known[spawn ? 1 : 0];
    const order = spots.filter(ok).sort((p, q) => last[q.id] - last[p.id] || p.id - q.id);
    let top: Spot | null = null;
    let topGain = 0;
    for (const k of order) {
      if (last[k.id] < topGain - 1e-9 || (top && last[k.id] <= topGain + 1e-9 && k.id > top.id))
        break;
      if (!free(k)) continue;
      const g = gainOf(k, spawn);
      last[k.id] = g;
      if (g > topGain + 1e-9 || (top && Math.abs(g - topGain) <= 1e-9 && k.id < top.id)) {
        top = k;
        topGain = g;
      }
    }
    return top && topGain > 1e-9 ? { k: top, gain: topGain } : null;
  };
  const take = (k: Spot, full: boolean) => {
    chosen.push({ k, full });
    if (full) block(k);
  };
  // 1. spawns: full cover where it blocks the most shots from outside into the spawn
  for (const c of spawnAreas)
    for (let n = 0; n < R.spawnPieces; n++) {
      const b = best((k) => k.c === c, true);
      if (b) take(b.k, true);
    }
  // 2. bomb sites: plant cover
  for (const c of sites)
    for (let n = 0; n < R.siteMin; n++) {
      const b = best((k) => k.c === c);
      if (b) take(b.k, true);
    }
  // 3. the rest of the map, worst spots first, until few are seen from everywhere
  while (wideShare() > R.wideShare) {
    const b = best(
      (k) => inArea(k.c, true) < fullCap(k.c) && (!isSite(k.c) || inArea(k.c) < R.siteMax),
    );
    if (!b || b.gain < R.minGain) {
      break;
    }
    take(b.k, true);
  }
  // 4. waist cover (corner pieces only) at the next best corners; every site up to its minimum
  const waist = Math.round(chosen.length * R.waistShare);
  for (let n = 0; n < waist; n++) {
    const b = best(
      (k) =>
        k.span === 0 &&
        k.wall === 'none' &&
        !isSpawn(k.c) &&
        inArea(k.c) < (isSite(k.c) ? R.siteMax : fullCap(k.c) + 1),
    );
    if (!b) break;
    take(b.k, false);
  }
  for (const c of sites)
    while (inArea(c) < R.siteMin) {
      const b = best((k) => k.c === c && k.span === 0);
      if (!b) break;
      take(b.k, false);
    }

  // ---- the pieces --------------------------------------------------------------------------
  const boxes: BoxDef[] = [];
  const box = (f: Foot, y0: number, tall: number, mat: 'crate' | 'pillar') =>
    boxes.push({
      c: v3((f[0] + f[2]) / 2, y0 + tall / 2, (f[1] + f[3]) / 2),
      h: v3((f[2] - f[0]) / 2, tall / 2, (f[3] - f[1]) / 2),
      mat,
    });
  // in layout order, so the list never depends on the order they were chosen in
  chosen.sort((a, b) => a.k.id - b.k.id);
  for (const { k, full } of chosen) {
    const f = k.foot;
    const [x0, z0, x1, z1] = f;
    const r1 = hash(k.l, k.vx, k.vy, 2);
    const r2 = hash(k.l, k.vx, k.vy, 3);
    const r3 = hash(k.l, k.vx, k.vy, 4);
    if (k.span > 0) {
      // a partition: a concrete wall, or a wall of crates two high
      if (r1 < 0.5) box(f, k.h, lerp(2.6, 3.4, r2), 'pillar');
      else {
        const low = lerp(1.2, 1.4, r2);
        box(f, k.h, low, 'crate');
        // the top row a little shorter at one end
        const cut = lerp(0.5, 1.5, r3);
        const top: Foot =
          k.axis === 'x'
            ? r3 < 0.5
              ? [x0 + cut, z0, x1, z1]
              : [x0, z0, x1 - cut, z1]
            : r3 < 0.5
              ? [x0, z0 + cut, x1, z1]
              : [x0, z0, x1, z1 - cut];
        box(top, k.h + low, lerp(1.2, 1.4, r3), 'crate');
      }
    } else if (full && (k.wall !== 'none' || r1 < 0.5)) {
      // a pillar (against a wall: a buttress)
      box(f, k.h, lerp(2.6, 3.4, r2), 'pillar');
    } else if (full) {
      // stacked crates: a big one, a slightly smaller one on top (full cover, 2.5 m and up)
      const low = lerp(1.2, 1.4, r2);
      box(f, k.h, low, 'crate');
      const cut = lerp(0.12, 0.25, r3) * (x1 - x0);
      const top: Foot = r1 < 0.75 ? [x0 + cut, z0, x1, z1 - cut] : [x0, z0 + cut, x1 - cut, z1];
      box(top, k.h + low, lerp(1.2, 1.4, r3), 'crate');
    } else if (r1 < 0.6 || k.wall !== 'none') {
      // a crate (waist / crouch cover)
      const half = (Math.min(x1 - x0, z1 - z0) / 2) * lerp(0.6, 0.9, r2);
      const x = (x0 + x1) / 2;
      const z = (z0 + z1) / 2;
      box([x - half, z - half, x + half, z + half], k.h, lerp(1.0, 1.4, r3), 'crate');
    } else {
      // a short low wall across the corner's main sightline
      const long = Math.min(1.6, s / 2 - R.lineClear);
      const x = k.vx * s;
      const z = k.vy * s;
      let ax = 0;
      let az = 0;
      for (const u of k.pairs) {
        const t = targets[pairTarget[2 * u]];
        ax += Math.abs(t.x - x);
        az += Math.abs(t.z - z);
      }
      // (sightlines mostly along x: the wall runs along z, and the other way round)
      const foot: Foot =
        ax >= az
          ? [x - 0.25, z - long, x + 0.25, z + long]
          : [x - long, z - 0.25, x + long, z + 0.25];
      box(foot, k.h, lerp(1.05, 1.2, r3), 'pillar');
    }
  }
  return boxes;
};

/** Does the segment a → b (on the floor plan) cross a footprint? (slab test) */
const crosses = (ax: number, az: number, bx: number, bz: number, f: Foot): boolean => {
  let t0 = 0;
  let t1 = 1;
  for (const [p, d, lo, hi] of [
    [ax, bx - ax, f[0], f[2]],
    [az, bz - az, f[1], f[3]],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return false;
      continue;
    }
    const u = (lo - p) / d;
    const v = (hi - p) / d;
    t0 = Math.max(t0, Math.min(u, v));
    t1 = Math.min(t1, Math.max(u, v));
    if (t0 > t1) return false;
  }
  return true;
};

/**
 * Does cover stand in the way of a bot walking from waypoint a to waypoint b (both 1 m above
 * the floor)? The builder drops such links: a partition crosses the links between the cells on
 * either side of it.
 */
export const coverCutsLink = (cover: BoxDef[], a: Vec3, b: Vec3): boolean =>
  cover.some((q) => {
    // the body (knee to head) against the box, grown by the body's radius
    const feet = Math.min(a.y, b.y) - 1;
    if (q.c.y - q.h.y > feet + 1.8 || q.c.y + q.h.y < feet + 0.45) return false;
    const r = PLAYER_RADIUS;
    return crosses(a.x, a.z, b.x, b.z, [
      q.c.x - q.h.x - r,
      q.c.z - q.h.z - r,
      q.c.x + q.h.x + r,
      q.c.z + q.h.z + r,
    ]);
  });
