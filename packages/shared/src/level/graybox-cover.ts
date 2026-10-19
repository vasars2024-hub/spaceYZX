// Automatic cover for graybox maps (level/graybox.ts): crates, low walls and pillars placed from
// the layout's cells so open areas break into duels (the openness targets, tools/map/openness.ts).
// Deterministic: the same layout always gets the same cover.
//
// How it works:
//   1. Cover only ever stands on a cell CORNER (where four cells meet), inside the square of
//      ±1 m around it. Bots walk the straight lines between cell centres and their waypoints sit
//      on the centres, so a piece there never touches a bot's path: it stays 1 m from every line
//      between two centres and more than 1.3 m from every centre.
//   2. A corner can take cover when its cells are flat, walked upright, of one area, not part of
//      a 1–2 cell passage, not a doorway into another area, not a spawn cell, not under or over
//      another layer, and a lane of at least two cells stays free past the piece on each axis.
//      Corners against a wall get a block pushed flush to the wall.
//   3. Where: a flat (2D) sight model of the layout. Viewers stand on every cell centre, targets
//      on four points per cell, and each target counts the compass directions (8) it is seen
//      from, as the openness report does. Full cover (pillars, stacked crates) goes greedily on
//      the corner that most reduces the spots seen from many directions — first two in each
//      spawn (on its side toward the map centre), two on each bomb site, then the rest of the
//      map — until few spots are seen from everywhere. Waist cover (crates, low walls) follows
//      at the next best corners, and tops up the bomb sites to at least two pieces.
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
  /** a piece stays within this of its cell corner (keeps 1 m from the lines between centres) */
  maxHalf: 1.0,
  /** free strip beside every line between two cell centres: bots walk them (radius 0.4) */
  lineClear: 0.9,
  /** free radius around every cell centre (waypoints) */
  centreClear: 1.3,
  /** a lane at least this many cells wide stays free past every piece, on both axes */
  laneCells: 2,
  /** at least this many cells between two pieces' corners (in x or in y) */
  spacing: 3,
  /** spawn cells nearest the spawn area's centre that get no cover (the builder's 8 spawns) */
  spawnCells: 8,
  /** sightlines the model counts: as tools/map/openness.ts (duel range, nobody next to you) */
  range: 60,
  minSight: 3,
  /** a direction counts once this many viewers in it see a spot */
  perAngle: 2,
  /** "seen from everywhere": 6 or more of the 8 directions */
  wideAngles: 6,
  /** stop adding full cover once the model has at most this share of such spots */
  wideShare: 0.15,
  /** full cover pieces: at most one per this many open cells of an area */
  cellsPerPiece: 6,
  /** cover on a bomb site: at least / at most */
  siteMin: 2,
  siteMax: 4,
  /** full cover in each spawn area */
  spawnPieces: 2,
  /** waist cover: this share of the full cover count, on top */
  waistShare: 0.5,
};

const R = COVER_RULES;
const WALL = '.';
const VOID = '~';
const FLAT = 0.6; // two cells within this height are one floor

/** Deterministic 0..1 noise from integers (the variety of the pieces). */
const hash = (a: number, b: number, c: number, d = 0): number => {
  let h = Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35);
  h ^= Math.imul(c + 0x2545, 0x27d4eb2f) ^ Math.imul(d + 0x1656, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A corner that can take a piece. */
interface Corner {
  id: number;
  l: number;
  /** corner coordinates (cell lines) */
  vx: number;
  vy: number;
  /** area character and floor height */
  c: string;
  h: number;
  /** wall side when the corner is against a wall (the piece is pushed flush to it) */
  wall: 'none' | 'n' | 's' | 'e' | 'w';
  /** the corner is in a spawn area, on its side toward the map centre */
  spawnFront: boolean;
  /** footprint of its full cover piece (metres): x0, z0, x1, z1 */
  foot: [number, number, number, number];
  /** sightline pairs its full piece would block */
  pairs: number[];
}

export const grayboxCover = (lay: GrayboxLayout, cells: GrayboxFloorCell[]): BoxDef[] => {
  if (lay.cover === false || !cells.length) return [];
  const s = lay.cellM;
  const W = lay.layers[0].rows[0].length;
  const H = lay.layers[0].rows.length;
  const nL = lay.layers.length;
  const area = (c: string) => lay.legend[c];
  const at = new Map<string, GrayboxFloorCell>();
  const key = (l: number, x: number, y: number) => `${l},${x},${y}`;
  for (const p of cells) at.set(key(p.l, p.x, p.y), p);
  const cellAt = (l: number, x: number, y: number) => at.get(key(l, x, y));
  const charAt = (l: number, x: number, y: number) => lay.layers[l].rows[y]?.[x] ?? WALL;

  // ---- which cells can hold cover ----------------------------------------------------------
  // cells with another layer's floor straight above or below (a catwalk over a hall)
  const columns = new Map<string, number>();
  for (const p of cells) columns.set(`${p.x},${p.y}`, (columns.get(`${p.x},${p.y}`) ?? 0) + 1);
  // spawn cells: the ones nearest each spawn area's centre (where the builder puts the spawns)
  const spawnCell = new Set<GrayboxFloorCell>();
  const spawnAreas: { c: string; mx: number; my: number }[] = [];
  for (const [c, a] of Object.entries(lay.legend)) {
    if (a.k !== 'cyan' && a.k !== 'orange') continue;
    const r = cells.filter((p) => p.c === c);
    if (!r.length) continue;
    const mx = r.reduce((t, p) => t + p.x, 0) / r.length;
    const my = r.reduce((t, p) => t + p.y, 0) / r.length;
    const d = (p: GrayboxFloorCell) => (p.x - mx) ** 2 + (p.y - my) ** 2;
    const sorted = [...r].sort((p, q) => d(p) - d(q));
    const limit = d(sorted[Math.min(R.spawnCells, sorted.length) - 1]) + 1e-9;
    for (const p of r) if (d(p) <= limit) spawnCell.add(p);
    spawnAreas.push({ c, mx, my });
  }
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
  const coverCell = (p: GrayboxFloorCell | undefined): p is GrayboxFloorCell => {
    if (!p || p.o !== 'up' || p.sloped || lay.layers[p.l].overlay) return false;
    if (spawnCell.has(p) || (columns.get(`${p.x},${p.y}`) ?? 0) > 1) return false;
    // a passage one or two cells wide stays clear
    if (run(p, 1, 0) + run(p, -1, 0) + 1 <= 2 || run(p, 0, 1) + run(p, 0, -1) + 1 <= 2)
      return false;
    // a doorway: a neighbour of another area (or a drop)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const q = cellAt(p.l, p.x + dx, p.y + dy);
      if (q ? q.c !== p.c : charAt(p.l, p.x + dx, p.y + dy) !== WALL) return false;
    }
    return true;
  };

  // ---- the corners -------------------------------------------------------------------------
  const mid = [W / 2, H / 2];
  const Z = Math.min(R.maxHalf, s / 2 - R.lineClear, s / 2 - R.centreClear / Math.SQRT2);
  const corners: Corner[] = [];
  for (let l = 0; l < nL; l++) {
    if (lay.layers[l].overlay) continue;
    for (let vy = 1; vy < H; vy++)
      for (let vx = 1; vx < W; vx++) {
        // the four cells around the corner: nw, ne, sw, se
        const around = [
          [vx - 1, vy - 1],
          [vx, vy - 1],
          [vx - 1, vy],
          [vx, vy],
        ].map(([x, y]) => ({ x, y, p: cellAt(l, x, y), wall: charAt(l, x, y) === WALL }));
        const floor = around.filter((a) => a.p);
        if (floor.length < 2 || around.some((a) => !a.p && !a.wall)) continue;
        if (!floor.every((a) => coverCell(a.p))) continue;
        const p0 = floor[0].p!;
        if (floor.some((a) => a.p!.c !== p0.c || Math.abs(a.p!.h - p0.h) > 0.01)) continue;
        // against a wall: two floor cells side by side (one wall cell: an inner corner, the
        // piece just stands on the corner)
        let wall: Corner['wall'] = 'none';
        if (floor.length === 2) {
          const [a, b] = floor;
          if (a.y === b.y) wall = a.y === vy ? 'n' : 's';
          else if (a.x === b.x) wall = a.x === vx ? 'w' : 'e';
          else continue; // diagonal cells only: no way past
        }
        // a lane of `laneCells` past the piece on each axis (counted from the corner)
        const need = Math.ceil((R.laneCells * s + Z) / s);
        const lane = (dx: number, dy: number) => {
          // the cell rows (or columns) beside the corner that are floor
          const lines = floor.map((a) => (dx ? a.y : a.x)).filter((v, i, xs) => xs.indexOf(v) === i);
          let n = 0;
          for (;;) {
            const k = dx > 0 || dy > 0 ? n : -n - 1;
            const ok = lines.every((v) =>
              dx ? sameFloor(p0, vx + k, v) : sameFloor(p0, v, vy + k),
            );
            if (!ok || n >= need) return n;
            n++;
          }
        };
        if (Math.max(lane(1, 0), lane(-1, 0)) < need || Math.max(lane(0, 1), lane(0, -1)) < need)
          continue;
        const sp = spawnAreas.find((a) => a.c === p0.c);
        const spawnFront =
          !!sp && (vx - 0.5 - sp.mx) * (mid[0] - sp.mx) + (vy - 0.5 - sp.my) * (mid[1] - sp.my) > 0;
        const x = vx * s;
        const z = vy * s;
        // the full piece's footprint (the pieces are sized from the same hash below)
        const half = Z * lerp(0.8, 1, hash(l, vx, vy, 1));
        const foot: Corner['foot'] =
          wall === 'n'
            ? [x - half, z, x + half, z + half * 1.6 > Z ? z + Z : z + half * 1.6]
            : wall === 's'
              ? [x - half, z - Z, x + half, z]
              : wall === 'w'
                ? [x, z - half, x + Z, z + half]
                : wall === 'e'
                  ? [x - Z, z - half, x, z + half]
                  : [x - half, z - half, x + half, z + half];
        corners.push({ id: corners.length, l, vx, vy, c: p0.c, h: p0.h, wall, spawnFront, foot, pairs: [] });
      }
  }
  if (!corners.length) return [];

  // ---- the flat sight model ----------------------------------------------------------------
  // a sight group: a layer plus the overlay layers over it (catwalks look down into its halls)
  const groupOf = (l: number) => {
    while (l > 0 && lay.layers[l].overlay) l--;
    return l;
  };
  const clear: Uint8Array[] = [];
  for (let l = 0; l < nL; l++) clear.push(new Uint8Array(W * H));
  for (const p of cells) clear[groupOf(p.l)][p.y * W + p.x] = 1;
  for (let l = 0; l < nL; l++)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) if (charAt(l, x, y) === VOID) clear[groupOf(l)][y * W + x] = 1;
  // corners touching each cell, per group
  const touching = new Map<number, Corner[]>();
  for (const k of corners)
    for (const [x, y] of [
      [k.vx - 1, k.vy - 1],
      [k.vx, k.vy - 1],
      [k.vx - 1, k.vy],
      [k.vx, k.vy],
    ]) {
      const i = (k.l * H + y) * W + x;
      touching.set(i, [...(touching.get(i) ?? []), k]);
    }
  const viewers = cells.map((p) => ({ x: (p.x + 0.5) * s, z: (p.y + 0.5) * s, g: groupOf(p.l) }));
  const targets: { x: number; z: number; g: number; w: number }[] = [];
  for (const p of cells)
    for (const [ox, oz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      targets.push({
        x: (p.x + 0.5 + ox / 4) * s,
        z: (p.y + 0.5 + oz / 4) * s,
        g: groupOf(p.l),
        // spawns weigh double: nobody should be shot into their spawn
        w: spawnAreas.some((a) => a.c === p.c) ? 2 : 1,
      });
  // segment (ax, az) → (bx, bz) through a box footprint (slab test)
  const crosses = (ax: number, az: number, bx: number, bz: number, f: Corner['foot']) => {
    let t0 = 0;
    let t1 = 1;
    for (const [a, d, lo, hi] of [
      [ax, bx - ax, f[0], f[2]],
      [az, bz - az, f[1], f[3]],
    ]) {
      if (Math.abs(d) < 1e-9) {
        if (a < lo || a > hi) return false;
        continue;
      }
      let u = (lo - a) / d;
      let v = (hi - a) / d;
      if (u > v) [u, v] = [v, u];
      t0 = Math.max(t0, u);
      t1 = Math.min(t1, v);
      if (t0 > t1) return false;
    }
    return true;
  };
  const pairTarget: number[] = [];
  const pairSector: number[] = [];
  const stamp = new Int32Array(corners.length).fill(-1);
  const step = s / 4;
  for (let i = 0; i < viewers.length; i++) {
    const v = viewers[i];
    for (let j = 0; j < targets.length; j++) {
      const t = targets[j];
      if (t.g !== v.g) continue;
      const dx = v.x - t.x;
      const dz = v.z - t.z;
      const d = Math.hypot(dx, dz);
      if (d < R.minSight || d > R.range) continue;
      // walk the line: every cell on it must be open; note the corners it passes
      const n = Math.ceil(d / step);
      const pair = pairTarget.length;
      const near: Corner[] = [];
      let last = -1;
      let seen = true;
      for (let k = 0; k <= n && seen; k++) {
        const cx = Math.floor((t.x + (dx * k) / n) / s);
        const cz = Math.floor((t.z + (dz * k) / n) / s);
        const ci = cz * W + cx;
        if (ci === last) continue;
        last = ci;
        if (cx < 0 || cz < 0 || cx >= W || cz >= H || !clear[v.g][ci]) seen = false;
        for (const c of touching.get(v.g * W * H + ci) ?? [])
          if (stamp[c.id] !== pair) {
            stamp[c.id] = pair;
            near.push(c);
          }
      }
      if (!seen) continue;
      pairTarget.push(j);
      pairSector.push(Math.floor(((Math.atan2(dz, dx) + Math.PI) / (2 * Math.PI)) * 8) % 8);
      for (const c of near) if (crosses(t.x, t.z, v.x, v.z, c.foot)) c.pairs.push(pair);
    }
  }
  const counts = new Int32Array(targets.length * 8);
  for (let p = 0; p < pairTarget.length; p++) counts[pairTarget[p] * 8 + pairSector[p]]++;
  const alive = new Uint8Array(pairTarget.length).fill(1);
  const anglesOf = (j: number, minus?: Int32Array) => {
    let a = 0;
    for (let k = 0; k < 8; k++)
      if (counts[j * 8 + k] - (minus ? minus[j * 8 + k] : 0) >= R.perAngle) a++;
    return a;
  };
  // how bad a spot is: steeply worse the more directions see it
  const badness = (a: number) => Math.max(0, a - 3) ** 2;
  const delta = new Int32Array(targets.length * 8);
  const gainOf = (k: Corner) => {
    const touched: number[] = [];
    let blocked = 0;
    for (const p of k.pairs) {
      if (!alive[p]) continue;
      const j = pairTarget[p];
      if (!delta[j * 8 + pairSector[p]]++) touched.push(j);
      blocked++;
    }
    let gain = blocked * 0.01;
    const done = new Set<number>();
    for (const j of touched) {
      if (done.has(j)) continue;
      done.add(j);
      gain += targets[j].w * (badness(anglesOf(j)) - badness(anglesOf(j, delta)));
    }
    for (const j of touched) for (let q = 0; q < 8; q++) delta[j * 8 + q] = 0;
    return gain;
  };
  const block = (k: Corner) => {
    for (const p of k.pairs)
      if (alive[p]) {
        alive[p] = 0;
        counts[pairTarget[p] * 8 + pairSector[p]]--;
      }
  };
  const wideShare = () => {
    let wide = 0;
    for (let j = 0; j < targets.length; j++) if (anglesOf(j) >= R.wideAngles) wide++;
    return wide / targets.length;
  };

  // ---- choosing the corners ----------------------------------------------------------------
  const openCells = new Map<string, number>();
  for (const p of cells) if (coverCell(p)) openCells.set(p.c, (openCells.get(p.c) ?? 0) + 1);
  const isSite = (c: string) => area(c).k === 'site';
  const isSpawn = (c: string) => spawnAreas.some((a) => a.c === c);
  const fullCap = (c: string) =>
    isSite(c) ? R.siteMax - 1 : Math.max(1, Math.floor((openCells.get(c) ?? 0) / R.cellsPerPiece));
  const chosen: { k: Corner; full: boolean }[] = [];
  const inArea = (c: string) => chosen.filter((q) => q.k.c === c).length;
  const fullIn = (c: string) => chosen.filter((q) => q.full && q.k.c === c).length;
  const free = (k: Corner) =>
    chosen.every(
      (q) =>
        q.k.l !== k.l || Math.max(Math.abs(q.k.vx - k.vx), Math.abs(q.k.vy - k.vy)) >= R.spacing,
    );
  /** the best free corner passing `ok`, by model gain (ties: the first in layout order) */
  const best = (ok: (k: Corner) => boolean) => {
    let top: Corner | null = null;
    let topGain = 0;
    for (const k of corners) {
      if (!free(k) || !ok(k)) continue;
      const g = gainOf(k);
      if (g > topGain + 1e-9) {
        top = k;
        topGain = g;
      }
    }
    return top ? { k: top, gain: topGain } : null;
  };
  const take = (k: Corner, full: boolean) => {
    chosen.push({ k, full });
    if (full) block(k);
  };
  // 1. spawns: full cover on the side toward the map centre (anywhere in the area if none)
  for (const sp of spawnAreas) {
    const front = corners.some((k) => k.c === sp.c && k.spawnFront);
    for (let n = 0; n < R.spawnPieces; n++) {
      const b = best((k) => k.c === sp.c && (k.spawnFront || !front));
      if (b) take(b.k, true);
    }
  }
  // 2. bomb sites: plant cover
  for (const c of Object.keys(lay.legend).filter(isSite))
    for (let n = 0; n < R.siteMin; n++) {
      const b = best((k) => k.c === c);
      if (b) take(b.k, true);
    }
  // 3. the rest of the map, the worst spots first, until few are seen from everywhere
  while (wideShare() > R.wideShare) {
    const b = best((k) => fullIn(k.c) < fullCap(k.c) && (!isSite(k.c) || inArea(k.c) < R.siteMax));
    if (!b || b.gain < 1) break;
    take(b.k, true);
  }
  // 4. waist cover at the next best corners, and every site up to its minimum
  const fullCount = chosen.length;
  for (let n = 0; n < Math.round(fullCount * R.waistShare); n++) {
    const b = best(
      (k) =>
        inArea(k.c) < (isSite(k.c) ? R.siteMax : fullCap(k.c) + 1) && !isSpawn(k.c) && k.wall === 'none',
    );
    if (!b) break;
    take(b.k, false);
  }
  for (const c of Object.keys(lay.legend).filter(isSite))
    while (inArea(c) < R.siteMin) {
      const b = best((k) => k.c === c);
      if (!b) break;
      take(b.k, false);
    }

  // ---- the pieces --------------------------------------------------------------------------
  const boxes: BoxDef[] = [];
  const box = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y0: number,
    tall: number,
    mat: 'crate' | 'pillar',
  ) =>
    boxes.push({
      c: v3((x0 + x1) / 2, y0 + tall / 2, (z0 + z1) / 2),
      h: v3((x1 - x0) / 2, tall / 2, (z1 - z0) / 2),
      mat,
    });
  // in layout order, so the list never depends on the order they were chosen in
  chosen.sort((a, b) => a.k.id - b.k.id);
  for (const { k, full } of chosen) {
    const [x0, z0, x1, z1] = k.foot;
    const r1 = hash(k.l, k.vx, k.vy, 2);
    const r2 = hash(k.l, k.vx, k.vy, 3);
    const r3 = hash(k.l, k.vx, k.vy, 4);
    if (full && (k.wall !== 'none' || r1 < 0.5)) {
      // a pillar (against a wall: a buttress)
      box(x0, z0, x1, z1, k.h, lerp(2.6, 3.4, r2), 'pillar');
    } else if (full) {
      // stacked crates: a big one, a slightly smaller one on top (full cover, 2.5 m and up)
      const low = lerp(1.2, 1.4, r2);
      box(x0, z0, x1, z1, k.h, low, 'crate');
      const shrink = lerp(0.12, 0.25, r3) * (x1 - x0);
      const sx = r1 < 0.75 ? shrink : 0;
      const sz = r1 < 0.75 ? 0 : shrink;
      box(x0 + sx, z0 + sz, x1 - shrink + sx, z1 - shrink + sz, k.h + low, lerp(1.2, 1.4, r3), 'crate');
    } else if (r1 < 0.6) {
      // a crate (waist / crouch cover)
      const half = Math.min(Z, (x1 - x0) / 2) * lerp(0.6, 0.9, r2);
      const x = (x0 + x1) / 2;
      const z = (z0 + z1) / 2;
      box(x - half, z - half, x + half, z + half, k.h, lerp(1.0, 1.4, r3), 'crate');
    } else {
      // a short low wall across the corner's main sightline
      const long = Math.min(1.6, s / 2 - R.lineClear);
      const x = k.vx * s;
      const z = k.vy * s;
      const alongX = k.pairs.length && sightAxis(k, pairTarget, targets, x, z) === 'z';
      if (alongX) box(x - long, z - 0.25, x + long, z + 0.25, k.h, lerp(1.05, 1.2, r3), 'pillar');
      else box(x - 0.25, z - long, x + 0.25, z + long, k.h, lerp(1.05, 1.2, r3), 'pillar');
    }
  }
  return boxes;
};

/** Which way most sightlines through a corner run ('x' or 'z'): a low wall goes across them. */
const sightAxis = (
  k: Corner,
  pairTarget: number[],
  targets: { x: number; z: number }[],
  x: number,
  z: number,
): 'x' | 'z' => {
  let ax = 0;
  let az = 0;
  for (const p of k.pairs) {
    const t = targets[pairTarget[p]];
    ax += Math.abs(t.x - x);
    az += Math.abs(t.z - z);
  }
  return ax >= az ? 'x' : 'z';
};
