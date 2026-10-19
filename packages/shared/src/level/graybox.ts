// Graybox maps: turns a checked tile-grid layout (the map-design format the redesigned maps are
// planned in) into a playable LevelDef, so a layout can be walked, botted and playtested before
// anyone builds real geometry and lighting for it.
//
// The layout: grid layers (lowest first), one character per cell. '.' is solid wall (nothing, in
// an overlay layer), '~' a deadly drop, every other character a named area (a callout) with a
// floor height. The build goes column by column (one grid cell, all heights):
//   - wall cells of a solid layer fill that layer's height band; the lowest floor of a column is
//     solid down to the bottom, higher floors are slabs, and head room above every floor stays
//     open (so ledges, drops, tunnels under terrain and decks over a hall form by themselves)
//   - ramps become steps no higher than 0.35 m (walkable without jumping, MOVEMENT stepHeight 0.4)
//   - ceiling decks ('down') are walked upside down: their slab hangs at `h` with gravity pointing
//     up below it; gravity areas become zero-G volumes joining their neighbours' heights
//   - links: launch pads, zip-rails (with a slot cut through the walls they cross) and portals
//   - sky maps: islands in the open, upright, upside down or walked on a side face, over a void
//   - waypoints sit 1 m off every floor (a column of them in zero-G) and link where a bot can go
import type { Vec3 } from '../math/vec3';
import { v3 } from '../math/vec3';
import type {
  BoxDef,
  BombSiteDef,
  GravityZoneDef,
  KillVolumeDef,
  LaunchPadDef,
  LevelDef,
  Material,
  PortalDef,
  RailDef,
  SizeWallDef,
  SpawnDef,
  TowerDef,
  WaypointDef,
} from './types';
import { coverCutsLink, grayboxCover } from './graybox-cover';

export type GrayboxKind =
  'cyan' | 'orange' | 'site' | 'room' | 'ramp' | 'gravity' | 'pocket' | 'solid' | 'void';

/** Which way a surface is walked: on top (up), on its underside (down) or on a side face. */
export type GrayboxOrientation = 'up' | 'down' | 'side';

export interface GrayboxArea {
  /** callout name */
  n: string;
  k: GrayboxKind;
  /** floor height (m); default: the layer's height */
  h?: number;
  /** height span of a ramp / stairs [low, high] */
  r?: [number, number];
  /** ramps: the way the floor rises (n = toward row 0); absent = follow the path between neighbours */
  dir?: 'n' | 's' | 'e' | 'w';
  /**
   * how the surface is walked (default: its layer's `o`, else up). 'down': upside down on the
   * underside of a slab at `h` (gravity points up below it); 'side': on a side face of an island
   * (gravity points sideways into it; sky maps)
   */
  o?: GrayboxOrientation;
  /**
   * gravity areas: how the graybox builds them. 'zeroG' (default): a zero-G volume over the
   * area's cells from its lowest neighbour's floor to its highest neighbour's floor (+ head
   * room), so any heights around it join; 'stairs': stand-in stairs between its neighbours
   */
  g?: 'zeroG' | 'stairs';
  /** short label for the minimap / overview (default: `n`) */
  s?: string;
}

/**
 * A link between two areas that are not simply side by side. Physical build:
 *   drop   — adjacent ledge: nothing extra; otherwise a launch pad (a drop chute) from → to
 *   pad    — a launch pad from → to (ballistic arc)
 *   rail   — a zip-rail from → to at hanging height
 *   portal / tunnel — a portal pair (one way: only from → to)
 *   jump / jet — a gap you jump or jetpack across: nothing extra (the layout leaves the gap)
 * Bots never ride pads, rails or portals (bots/brain.ts): their routes must not need them.
 */
export type GrayboxLinkKind = 'drop' | 'pad' | 'rail' | 'portal' | 'tunnel' | 'jump' | 'jet';
export type GrayboxLink = [from: string, to: string, kind: GrayboxLinkKind, oneWay?: boolean];

export interface GrayboxLayer {
  name: string;
  /** the layer's base height (areas without `h` stand at it) */
  y: number;
  rows: string[];
  /**
   * an overlay layer (catwalks, gantries, a tunnel under the terrain): '.' there means nothing,
   * not wall; its floors are slabs. In other layers '.' is solid wall within the layer's band.
   */
  overlay?: boolean;
  /** default orientation of its areas ('down': a ceiling deck walked upside down) */
  o?: GrayboxOrientation;
}

export interface GrayboxLayout {
  name: string;
  /** metres per cell */
  cellM: number;
  /** lowest first */
  layers: GrayboxLayer[];
  legend: Record<string, GrayboxArea>;
  links?: GrayboxLink[];
  /** areas closed by force fields for smaller teams: team size → closed area characters */
  sizes?: Record<number, string[]>;
  /** open sky around everything (sky maps): no outer walls or ceiling; falls into the void kill */
  sky?: boolean;
  /** the boosted sky-duel jetpack everywhere on the map (LevelDef.skyJetpack) */
  skyJetpack?: boolean;
  /** automatic cover (level/graybox-cover.ts): default on */
  cover?: boolean;
}

const WALL = '.';
const VOID = '~';
const STEP = 0.3; // (0.35 m steps on short treads can't be walked up)
const SLAB = 0.5; // thickness of a floor laid over open space (catwalks, decks over a tunnel)
const CLEAR = 3.2; // head room kept open above every floor
const WALL_ABOVE = 10; // walls rise this far above the highest floor
const G = 20; // MOVEMENT gravity (m/s²), for the launch pad arcs
const HANG = 1.82; // a ceiling spawn's feet sit this far under the ceiling (see antipode.ts)
const RAIL_Y = 2.05; // a zip-rail hangs this far over the floor: the rider (railHang 1.1 below it) clears the floor, and it stays in grab reach
const RAIL_H = 3; // glass along deadly drops: higher than any jump or climb (climbMaxHeight 2.6)
const ZERO_G_STEP = 6; // zero-G columns get a waypoint every this many metres up

interface Cell {
  x: number;
  y: number;
  l: number;
  c: string;
  /** floor height at the cell centre */
  h: number;
  o: GrayboxOrientation;
  /** ramps: rise across the cell along `axis` (signed), for the sub-steps */
  rise?: number;
  axis?: 'x' | 'z';
  /** zero-G areas: the span the volume covers (top: its open top; = hi under a ceiling deck) */
  zg?: { lo: number; hi: number; top: number };
  /** open space kept above an up floor / below a down floor (size walls fill it) */
  airTop?: number;
  airBottom?: number;
  /** stairs standing on the column below (their steps start at its top) */
  onColumn?: boolean;
}

interface Seg {
  y0: number;
  y1: number;
  mat: Material;
  color?: number;
}

interface ZoneCell {
  c: string;
  x: number;
  y: number;
  y0: number;
  y1: number;
  g: Vec3;
  pri: number;
}

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Height range of an area, in its layer. */
const span = (a: GrayboxArea, layerY: number): [number, number] =>
  a.r ?? [a.h ?? layerY, a.h ?? layerY];
const isZeroG = (a: GrayboxArea) => a.k === 'gravity' && a.g !== 'stairs';
const isSloped = (a: GrayboxArea) =>
  a.k === 'ramp' || (a.k === 'gravity' && a.g === 'stairs') || (!!a.r && a.k !== 'gravity');
/**
 * How many steps a stair cell is cut into: no step higher than STEP, and an odd count so the
 * cell's centre (where its waypoint stands) is the middle of a step, never a step's edge.
 */
const stepsOf = (rise: number) => {
  const n = Math.max(1, Math.ceil(Math.abs(rise) / STEP));
  return n % 2 ? n : n + 1;
};
/** How much higher the middle step of a stair cell stands than the cell's centre height. */
const stepUpOf = (p: Cell) => (p.rise ? Math.abs(p.rise) / (2 * stepsOf(p.rise)) : 0);

/** Greedy rectangles covering a set of "x,y" cells (runs along rows, stacked while equal). */
const rectangles = (set: Set<string>, W: number, H: number) => {
  const left = new Set(set);
  const out: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!left.has(`${x},${y}`)) continue;
      let x1 = x;
      while (x1 + 1 < W && left.has(`${x1 + 1},${y}`)) x1++;
      let y1 = y;
      for (;;) {
        let ok = y1 + 1 < H;
        for (let xx = x; ok && xx <= x1; xx++) if (!left.has(`${xx},${y1 + 1}`)) ok = false;
        if (!ok) break;
        y1++;
      }
      for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) left.delete(`${xx},${yy}`);
      out.push({ x0: x, y0: y, x1, y1 });
    }
  return out;
};

export const buildGraybox = (lay: GrayboxLayout): LevelDef => {
  const s = lay.cellM;
  const W = lay.layers[0].rows[0].length;
  const H = lay.layers[0].rows.length;
  const sky = !!lay.sky;
  const area = (c: string) => lay.legend[c];
  const at = (l: number, x: number, y: number) => lay.layers[l]?.rows[y]?.[x];
  const isFloor = (c: string | undefined) =>
    !!c && c !== WALL && c !== VOID && !['solid', 'void'].includes(area(c)?.k ?? '');
  const isSolid = (c: string | undefined) => c === WALL || (!!c && area(c)?.k === 'solid');
  const cx = (x: number) => (x + 0.5) * s;
  const cz = (y: number) => (y + 0.5) * s;

  // ---- floor cells and their heights -------------------------------------------------------
  const cells: Cell[] = [];
  const byPos = new Map<string, Cell>();
  const key = (l: number, x: number, y: number) => `${l},${x},${y}`;
  lay.layers.forEach((layer, l) =>
    layer.rows.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c !== WALL && c !== VOID && !area(c))
          throw new Error(`${lay.name}: no legend entry for '${c}'`);
        if (!isFloor(c)) return;
        const a = area(c);
        const cell: Cell = { x, y, l, c, h: span(a, layer.y)[0], o: a.o ?? layer.o ?? 'up' };
        cells.push(cell);
        byPos.set(key(l, x, y), cell);
      }),
    ),
  );
  const nbrs = (p: Cell) => {
    const out: Cell[] = [];
    for (const [dx, dy] of DIRS)
      for (let l = 0; l < lay.layers.length; l++) {
        const q = byPos.get(key(l, p.x + dx, p.y + dy));
        if (q) out.push(q);
      }
    return out;
  };
  const flatH = (q: Cell) => area(q.c).h ?? lay.layers[q.l].y;
  const plain = (q: Cell) => !isSloped(area(q.c)) && !isZeroG(area(q.c));
  // stairs and ramps: height follows the way from the low side to the high side
  for (const [c, a] of Object.entries(lay.legend)) {
    if (!isSloped(a)) continue;
    const region = cells.filter((p) => p.c === c);
    if (!region.length) continue;
    let [lo, hi] = a.r ?? [0, 0];
    if (!a.r) {
      // (stand-in stairs for a gravity area: between its neighbours' floors)
      const hs = region.flatMap((p) =>
        nbrs(p)
          .filter((q) => q.c !== c && plain(q))
          .map(flatH),
      );
      [lo, hi] = hs.length ? [Math.min(...hs), Math.max(...hs)] : [a.h ?? 0, a.h ?? 0];
    }
    for (const p of region) p.h = lo;
    if (lo === hi) continue;
    if (a.dir) {
      // straight flight: height follows the region's extent along the rising direction
      const along = (p: Cell) =>
        a.dir === 'n' ? -p.y : a.dir === 's' ? p.y : a.dir === 'e' ? p.x : -p.x;
      const vals = region.map(along);
      const min = Math.min(...vals);
      const n = Math.max(...vals) - min + 1;
      for (const p of region) {
        p.h = lo + ((hi - lo) * (along(p) - min + 0.5)) / n;
        p.rise = (hi - lo) / n;
        p.axis = a.dir === 'n' || a.dir === 's' ? 'z' : 'x';
        if (a.dir === 'n' || a.dir === 'w') p.rise = -p.rise; // falls toward +x / +z
      }
      continue;
    }
    // any shape (L-shaped stairs): distance from the low side and from the high side
    const touches = (p: Cell, want: number) =>
      nbrs(p).some((q) => q.c !== c && plain(q) && Math.abs(flatH(q) - want) < 0.6);
    const bfs = (seeds: Cell[]) => {
      const d = new Map<Cell, number>(seeds.map((p) => [p, 0]));
      const q = [...seeds];
      while (q.length) {
        const p = q.shift()!;
        for (const [dx, dy] of DIRS) {
          const n = byPos.get(key(p.l, p.x + dx, p.y + dy));
          if (n && n.c === c && !d.has(n)) {
            d.set(n, d.get(p)! + 1);
            q.push(n);
          }
        }
      }
      return d;
    };
    const dLo = bfs(region.filter((p) => touches(p, lo)));
    const dHi = bfs(region.filter((p) => touches(p, hi)));
    for (const p of region) {
      const a0 = dLo.get(p);
      const b0 = dHi.get(p);
      if (a0 === undefined || b0 === undefined) {
        p.h = (lo + hi) / 2;
        continue;
      }
      p.h = lo + ((hi - lo) * (a0 + 0.5)) / (a0 + b0 + 1);
      // the step axis: the way the climb runs here — from the stair cells around it, and from the
      // landings it touches (the low landing pulls the climb away, the high one toward it)
      const elev = (dx: number, dy: number) => {
        const n = byPos.get(key(p.l, p.x + dx, p.y + dy));
        if (n && n.c === c) return (dLo.get(n) ?? a0) - (dHi.get(n) ?? b0);
        const land = nbrs(p).find(
          (q) => q.x === p.x + dx && q.y === p.y + dy && q.c !== c && plain(q),
        );
        if (land && Math.abs(flatH(land) - hi) < 0.6) return a0 - b0 + 2;
        if (land && Math.abs(flatH(land) - lo) < 0.6) return a0 - b0 - 2;
        return a0 - b0;
      };
      const gx = elev(1, 0) - elev(-1, 0);
      const gz = elev(0, 1) - elev(0, -1);
      const best: [number, number] =
        Math.abs(gx) >= Math.abs(gz) ? [Math.sign(gx) || 1, 0] : [0, Math.sign(gz) || 1];
      p.axis = best[0] !== 0 ? 'x' : 'z';
      p.rise = ((hi - lo) / (a0 + b0 + 1)) * (best[0] + best[1]);
    }
  }
  const standY = (p: Cell) => (p.o === 'down' ? p.h : p.h + stepUpOf(p));
  const wpY = (p: Cell) => (p.o === 'down' ? p.h - 1 : standY(p) + 1);
  // zero-G areas: one volume from the lowest neighbouring floor to the highest
  if (!sky)
    for (const [c, a] of Object.entries(lay.legend)) {
      if (!isZeroG(a)) continue;
      const region = cells.filter((p) => p.c === c);
      if (!region.length) continue;
      const ns = region.flatMap((p) => nbrs(p).filter((q) => q.c !== c && !isZeroG(area(q.c))));
      const hs = ns.map(standY);
      if (a.r) hs.push(...a.r);
      if (!hs.length) hs.push(a.h ?? 0);
      let lo = Math.min(...hs);
      const hi = Math.max(...hs);
      const ceiling = ns.some((q) => q.o === 'down' && Math.abs(q.h - hi) < 0.01);
      // (only a ceiling deck around it: the volume hangs under the ceiling)
      if (ceiling && hi - lo < CLEAR) lo = hi - CLEAR;
      for (const p of region) {
        p.h = lo;
        p.zg = { lo, hi, top: ceiling ? hi : hi + CLEAR };
      }
    }
  // (zero-G areas spanning several layers: one column per grid cell)
  const columnCell = (p: Cell) =>
    !p.zg || cells.find((q) => q.c === p.c && q.x === p.x && q.y === p.y) === p;

  const floorHs = cells.map((p) => p.h);
  const top = Math.max(...floorHs, ...lay.layers.map((l) => l.y));
  const bottom = Math.min(...floorHs, ...lay.layers.map((l) => l.y)) - 4;
  const wallTop = top + WALL_ABOVE;

  const colorOf = (c: string, h: number): number => {
    const k = area(c).k;
    if (k === 'cyan') return 0x2f9e98;
    if (k === 'orange') return 0xd77a45;
    if (k === 'site') return 0xb4443f;
    if (k === 'gravity') return 0x7b6bd6;
    return h <= -6 ? 0x3f5a6b : h < -1 ? 0x56717f : h <= 1 ? 0x7d796f : h < 8 ? 0xa3916a : 0xc4aa72;
  };
  const cellsAt = new Map<string, Cell[]>();
  for (const p of cells) {
    const k = `${p.x},${p.y}`;
    cellsAt.set(k, [...(cellsAt.get(k) ?? []), p]);
  }
  const regionOf = (c: string) => cells.filter((p) => p.c === c);
  const centroid = (r: Cell[]) => [
    r.reduce((t, p) => t + p.x, 0) / r.length,
    r.reduce((t, p) => t + p.y, 0) / r.length,
  ];
  const nearestTo = (r: Cell[], tx: number, ty: number) =>
    [...r].sort((u, v) => (u.x - tx) ** 2 + (u.y - ty) ** 2 - ((v.x - tx) ** 2 + (v.y - ty) ** 2));

  // ---- links ---------------------------------------------------------------------------------
  const rails: RailDef[] = [];
  const launchPads: LaunchPadDef[] = [];
  const portals: PortalDef[] = [];
  const slots = new Map<string, [number, number][]>(); // rails cut a slot through walls
  const flights = new Set<string>(); // cells a pad or rail carries you over (no guard glass there)
  const adjacent = (a: string, b: string) =>
    regionOf(a).some((p) => nbrs(p).some((q) => q.c === b));
  const ends = (from: string, to: string) => {
    const src = regionOf(from);
    const dst = regionOf(to);
    if (!src.length || !dst.length)
      throw new Error(`${lay.name}: link ${from} → ${to} names a missing area`);
    const [tx, ty] = centroid(dst);
    const [fx, fy] = centroid(src);
    return { src, a: nearestTo(src, tx, ty)[0], bs: nearestTo(dst, fx, fy) };
  };
  // a launch pad: a plate in the corner of the source cell nearest the target, against its walls
  // and off the walking line through the cell's middle (bots walk through cell centres and
  // never ride pads), throwing you in an arc onto the target
  const walkable = (x: number, y: number) => (cellsAt.get(`${x},${y}`) ?? []).length > 0;
  const pad = (from: string, to: string) => {
    const { src, bs } = ends(from, to);
    const b = bs[0];
    const [tx, ty] = [b.x, b.y];
    const a = nearestTo(
      src.filter((p) => !p.rise && p.o === 'up'),
      tx,
      ty,
    )[0];
    if (!a) return; // (pads only on flat upright floors)
    let best: [number, number] = [1, 1];
    let walls = -1;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const n = [
          walkable(a.x + sx, a.y),
          walkable(a.x, a.y + sz),
          walkable(a.x + sx, a.y + sz),
        ].filter((w) => !w).length;
        if (n > walls) {
          walls = n;
          best = [sx, sz];
        }
      }
    const [sx, sz] = best;
    const px = cx(a.x) + sx * (s / 4 + 0.3);
    const pz = cz(a.y) + sz * (s / 4 + 0.3);
    const half = s / 4 - 0.4;
    const dx = cx(b.x) - px;
    const dz = cz(b.y) - pz;
    const dh = standY(b) - standY(a);
    const T = Math.min(1.6, Math.max(0.7, Math.hypot(dx, dz) / 14));
    for (let i = 0; i <= 20; i++)
      flights.add(
        `${Math.floor((px + dx * (i / 20)) / s)},${Math.floor((pz + dz * (i / 20)) / s)}`,
      );
    launchPads.push({
      min: v3(px - half, standY(a), pz - half),
      max: v3(px + half, standY(a) + 0.6, pz + half),
      vel: v3(dx / T, (dh + 0.5 * G * T * T) / T, dz / T),
      // (fires when the body touches the plate, not only when its centre is inside)
      touch: true,
    });
  };
  for (const [from, to, kind, oneWay] of lay.links ?? []) {
    if (kind === 'jump' || kind === 'jet') continue;
    if (kind === 'drop') {
      if (!adjacent(from, to)) pad(from, to);
      continue;
    }
    if (kind === 'pad') {
      pad(from, to);
      if (!oneWay) pad(to, from);
      continue;
    }
    if (kind === 'rail') {
      const { a, bs } = ends(from, to);
      const b = bs[0];
      const ya = standY(a) + (a.o === 'down' ? -RAIL_Y : RAIL_Y);
      const yb = standY(b) + (b.o === 'down' ? -RAIL_Y : RAIL_Y);
      rails.push({ points: [v3(cx(a.x), ya, cz(a.y)), v3(cx(b.x), yb, cz(b.y))] });
      const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 3));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const k = `${Math.floor(a.x + 0.5 + (b.x - a.x) * t)},${Math.floor(a.y + 0.5 + (b.y - a.y) * t)}`;
        const y = ya + (yb - ya) * t;
        slots.set(k, [...(slots.get(k) ?? []), [y - 2.6, y + 0.8]]);
        flights.add(k);
      }
      continue;
    }
    // portal / tunnel: a portal pair (both ways unless one-way)
    const { a, bs, src } = ends(from, to);
    const door = (p: Cell) => {
      const y0 = p.o === 'down' ? standY(p) - 2.6 : standY(p);
      return {
        min: v3(p.x * s + 1, y0, p.y * s + 1),
        max: v3((p.x + 1) * s - 1, y0 + 2.6, (p.y + 1) * s - 1),
      };
    };
    const exitOf = (p: Cell) => v3(cx(p.x), standY(p) + (p.o === 'down' ? -1 : 1), cz(p.y));
    const [bx, by] = centroid(regionOf(to));
    const exitA = nearestTo(src, bx, by)[1] ?? a;
    portals.push({
      name: `${from}>${to}`,
      ...door(a),
      exit: exitOf(bs[1] ?? bs[0]),
      color: 0xa08cff,
      glyph: to,
    });
    if (!oneWay)
      portals.push({
        name: `${to}>${from}`,
        ...door(bs[0]),
        exit: exitOf(exitA),
        color: 0xa08cff,
        glyph: from,
      });
  }

  // ---- geometry, column by column ----------------------------------------------------------
  const boxes: BoxDef[] = [];
  const zoneCells: ZoneCell[] = [];
  // bands of the solid (non-overlay) layers: '.' there is wall from the band's bottom to its top
  const solidLayers = lay.layers.map((l, i) => ({ l, i })).filter(({ l }) => !l.overlay);
  const bands = solidLayers.map(({ l, i }, j) => {
    const next = solidLayers[j + 1]?.l;
    const hi = !next ? wallTop : next.o === 'down' ? (l.y + next.y) / 2 : next.y - SLAB;
    return { i, lo: bottom, hi };
  });
  for (let j = 1; j < bands.length; j++) bands[j].lo = bands[j - 1].hi;
  const stairs: Cell[] = [];
  const segsAt = new Map<string, Seg[]>();
  // (a void cell over a lower floor: the drop is deadly, so it gets a roof with a kill volume on it)
  const voidRoofs: { x: number; y: number; top: number }[] = [];
  const voidLayerAt = (x: number, y: number) =>
    lay.layers.findIndex((L, l) => !L.overlay && at(l, x, y) === VOID);
  if (!sky)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = `${x},${y}`;
        let solid: [number, number][] = [];
        for (const b of bands) if (isSolid(at(b.i, x, y))) solid.push([b.lo, b.hi]);
        const surf = (p: Cell) => (p.zg ? p.zg.lo : standY(p));
        const here = (cellsAt.get(k) ?? []).filter(columnCell).sort((p, q) => surf(p) - surf(q));
        const air: [number, number][] = [...(slots.get(k) ?? [])];
        const floors: Seg[] = [];
        here.forEach((p, i) => {
          const below = here[i - 1];
          const above = here[i + 1];
          const color = colorOf(p.c, p.h);
          if (p.zg) {
            air.push([p.zg.lo, p.zg.top]);
            if (!below) floors.push({ y0: bottom, y1: p.zg.lo, mat: 'floor', color });
            if (!above) floors.push({ y0: p.zg.top, y1: wallTop, mat: 'hull' });
            p.airTop = p.zg.top;
            return;
          }
          if (p.o === 'down') {
            const lowAir = Math.max(p.h - CLEAR, below ? surf(below) + 0.1 : bottom);
            air.push([lowAir, p.h]);
            p.airBottom = Math.max(lowAir, p.h - 4);
            floors.push({ y0: p.h, y1: above ? p.h + SLAB : wallTop, mat: 'floor', color });
            return;
          }
          const nextY = above ? (above.o === 'down' ? surf(above) : surf(above) - SLAB) : wallTop;
          const rise = Math.abs(p.rise ?? 0);
          air.push([p.h - rise / 2, Math.min(nextY, surf(p) + CLEAR + rise)]);
          p.airTop = Math.min(nextY, surf(p) + 4);
          if (p.rise) {
            stairs.push(p);
            p.onColumn = !below;
            if (!below) floors.push({ y0: bottom, y1: p.h - rise / 2, mat: 'floor', color });
            return;
          }
          floors.push({ y0: below ? p.h - SLAB : bottom, y1: p.h, mat: 'floor', color });
        });
        // walls minus the open space, then the floors
        for (const [a0, a1] of air)
          solid = solid.flatMap(([s0, s1]): [number, number][] =>
            a1 <= s0 || a0 >= s1
              ? [[s0, s1]]
              : (
                  [
                    [s0, a0],
                    [a1, s1],
                  ] as [number, number][]
                ).filter(([u, v]) => v - u > 0.3),
          );
        const voidL = voidLayerAt(x, y);
        const under = voidL < 0 ? [] : here.filter((p) => p.l < voidL && p.o === 'up');
        if (under.length) {
          const roof = Math.max(...under.map((p) => p.airTop ?? surf(p) + 4));
          solid.push([roof, roof + SLAB]);
          voidRoofs.push({ x, y, top: roof + SLAB });
        }
        const segs: Seg[] = [
          ...solid.map(([y0, y1]): Seg => ({ y0, y1, mat: 'hull' })),
          ...floors,
        ].sort((a, b) => a.y0 - b.y0);
        const merged: Seg[] = [];
        for (const g of segs) {
          const last = merged[merged.length - 1];
          if (last && g.y0 <= last.y1 + 0.01) {
            // (a merged block looks like whatever is on top of it)
            if (g.y1 > last.y1 + 0.01 || (g.y1 >= last.y1 - 0.01 && g.mat !== 'hull')) {
              last.mat = g.mat;
              last.color = g.color;
            }
            last.y1 = Math.max(last.y1, g.y1);
          } else merged.push({ ...g });
        }
        segsAt.set(k, merged);
      }
  // equal blocks of neighbouring columns merge into big boxes
  const byKey = new Map<string, Set<string>>();
  for (const [k, segs] of segsAt)
    for (const g of segs) {
      const sk = `${g.y0.toFixed(3)}|${g.y1.toFixed(3)}|${g.mat}|${g.color ?? ''}`;
      if (!byKey.has(sk)) byKey.set(sk, new Set());
      byKey.get(sk)!.add(k);
    }
  for (const [sk, set] of byKey) {
    const [y0s, y1s, mat, col] = sk.split('|');
    const y0 = Number(y0s);
    const y1 = Number(y1s);
    for (const r of rectangles(set, W, H))
      boxes.push({
        c: v3(((r.x0 + r.x1 + 1) / 2) * s, (y0 + y1) / 2, ((r.y0 + r.y1 + 1) / 2) * s),
        h: v3(((r.x1 - r.x0 + 1) / 2) * s, (y1 - y0) / 2, ((r.y1 - r.y0 + 1) / 2) * s),
        mat: mat as Material,
        ...(col ? { color: Number(col) } : {}),
      });
  }
  // stairs: sub-steps no higher than STEP; the last one meets the higher neighbour flush
  for (const p of stairs) {
    const rise = p.rise!;
    const steps = stepsOf(rise);
    const x0 = p.x * s;
    const z0 = p.y * s;
    const base = p.h - Math.abs(rise) / 2;
    for (let i = 0; i < steps; i++) {
      const f0 = i / steps;
      const f1 = (i + 1) / steps;
      const hTop = p.h - rise / 2 + rise * (rise > 0 ? f1 : f0);
      const yBot = p.onColumn ? base : hTop - SLAB;
      const [ax0, ax1, az0, az1] =
        p.axis === 'x'
          ? [x0 + f0 * s, x0 + f1 * s, z0, z0 + s]
          : [x0, x0 + s, z0 + f0 * s, z0 + f1 * s];
      boxes.push({
        c: v3((ax0 + ax1) / 2, (yBot + hTop) / 2, (az0 + az1) / 2),
        h: v3((ax1 - ax0) / 2, Math.max(0.05, (hTop - yBot) / 2), (az1 - az0) / 2),
        mat: 'grate',
        color: colorOf(p.c, p.h),
      });
    }
  }
  // gravity: ceiling decks pull up, zero-G areas float
  if (!sky)
    for (const p of cells) {
      if (p.zg && columnCell(p))
        zoneCells.push({
          c: p.c,
          x: p.x,
          y: p.y,
          y0: p.zg.lo - 0.5,
          y1: p.zg.top + 0.5,
          g: v3(0, 0, 0),
          pri: 2,
        });
      else if (!p.zg && p.o === 'down') {
        const band = bands.find((b) => b.i === p.l);
        const lo = band && band.lo > bottom ? band.lo : p.h - 12;
        zoneCells.push({ c: p.c, x: p.x, y: p.y, y0: lo, y1: p.h + 0.5, g: v3(0, 1, 0), pri: 1 });
      }
    }

  // ---- sky islands: blocks in the open, each with its own gravity -------------------------
  if (sky) {
    for (const p of cells) {
      const color = colorOf(p.c, p.h);
      const block = (y0: number, y1: number) =>
        boxes.push({
          c: v3(cx(p.x), (y0 + y1) / 2, cz(p.y)),
          h: v3(s / 2, (y1 - y0) / 2, s / 2),
          mat: 'floor',
          color,
        });
      if (p.o === 'up') block(p.h - 1.5, p.h);
      else if (p.o === 'down') {
        block(p.h, p.h + 1.5);
        zoneCells.push({
          c: p.c,
          x: p.x,
          y: p.y,
          y0: p.h - 5,
          y1: p.h + 0.2,
          g: v3(0, 1, 0),
          pri: 1,
        });
      } else {
        // side: a tall block walked on its face toward the map's middle line
        block(p.h - 2, p.h + 2);
        const west = cx(p.x) < (W * s) / 2;
        if (!byPos.get(key(p.l, p.x + (west ? -1 : 1), p.y)))
          zoneCells.push({
            c: p.c,
            x: p.x + (west ? -1 : 1),
            y: p.y,
            y0: p.h - 2.5,
            y1: p.h + 2.5,
            g: v3(west ? 1 : -1, 0, 0),
            pri: 1,
          });
      }
    }
    // solid areas (the Fountain): a block standing on the island around it
    lay.layers.forEach((layer, l) =>
      layer.rows.forEach((row, y) =>
        [...row].forEach((c, x) => {
          if (area(c)?.k !== 'solid') return;
          const around = DIRS.map(([dx, dy]) => byPos.get(key(l, x + dx, y + dy))).find(Boolean);
          const h = around?.h ?? layer.y;
          boxes.push({ c: v3(cx(x), h + 1, cz(y)), h: v3(s / 2, 2.5, s / 2), mat: 'pillar' });
        }),
      ),
    );
  }
  // zones: cells of one area with the same span merge into rectangles
  const zones: GravityZoneDef[] = [];
  const zoneGroups = new Map<string, { z: ZoneCell; set: Set<string> }>();
  for (const z of zoneCells) {
    const k = `${z.c}|${z.y0}|${z.y1}|${z.g.x},${z.g.y},${z.g.z}|${z.pri}`;
    if (!zoneGroups.has(k)) zoneGroups.set(k, { z, set: new Set() });
    zoneGroups.get(k)!.set.add(`${z.x},${z.y}`);
  }
  for (const { z, set } of zoneGroups.values())
    for (const r of rectangles(set, W, H)) {
      // (a side island's zone is a 5 m deep slab against its face)
      const x0 = z.g.x > 0 ? (r.x1 + 1) * s - 5 : r.x0 * s;
      const x1 = z.g.x < 0 ? r.x0 * s + 5 : (r.x1 + 1) * s;
      zones.push({
        name: `${z.c}-${zones.length}`,
        min: v3(x0, z.y0, r.y0 * s),
        max: v3(x1, z.y1, (r.y1 + 1) * s),
        gravity: z.g,
        priority: z.pri,
      });
    }
  // guard glass: a see-through wall (RAIL_H) along every edge where a floor meets a deadly drop or
  // the map's edge, so nobody (bots above all) falls off by accident. Areas with a jump link keep
  // their edges open (the jump across is the point).
  if (!sky) {
    const jumpers = new Set(
      (lay.links ?? []).filter((k) => k[2] === 'jump').flatMap((k) => [k[0], k[1]]),
    );
    const open = (x: number, y: number, p: Cell) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return true;
      const there = cellsAt.get(`${x},${y}`) ?? [];
      if (!there.length) return !bands.some((b) => isSolid(at(b.i, x, y)));
      // (a void over a lower floor: deadly from up here)
      const vl = voidLayerAt(x, y);
      return vl >= 0 && p.l >= vl && there.every((q) => q.l < vl);
    };
    for (const p of cells) {
      if (p.o !== 'up' || p.zg || jumpers.has(p.c)) continue;
      const rise = Math.abs(p.rise ?? 0);
      const y0 = p.h - rise / 2;
      const y1 = p.h + rise / 2 + RAIL_H;
      for (const [dx, dy] of DIRS) {
        if (!open(p.x + dx, p.y + dy, p) || flights.has(`${p.x + dx},${p.y + dy}`)) continue;
        // (just outside the cell, in the drop: it touches the floor's side, never cuts into it)
        const ex = dx > 0 ? (p.x + 1) * s : dx < 0 ? p.x * s : cx(p.x);
        const ez = dy > 0 ? (p.y + 1) * s : dy < 0 ? p.y * s : cz(p.y);
        boxes.push({
          c: v3(ex + dx * 0.1, (y0 + y1) / 2, ez + dy * 0.1),
          h: v3(dx ? 0.1 : s / 2, (y1 - y0) / 2, dy ? 0.1 : s / 2),
          mat: 'skyglass',
        });
      }
    }
  }
  // deadly drops: void cells fall into a kill volume (sky maps: the whole sky below)
  const killVolumes: KillVolumeDef[] = [];
  if (sky)
    killVolumes.push({
      min: v3(-60, bottom - 60, -60),
      max: v3(W * s + 60, bottom - 8, H * s + 60),
    });
  else
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (
          !(cellsAt.get(`${x},${y}`) ?? []).length &&
          lay.layers.some((_, l) => at(l, x, y) === VOID)
        )
          killVolumes.push({
            min: v3(x * s, bottom - 20, y * s),
            max: v3((x + 1) * s, bottom + 1, (y + 1) * s),
          });
  for (const r of voidRoofs)
    killVolumes.push({
      min: v3(r.x * s, r.top, r.y * s),
      max: v3((r.x + 1) * s, r.top + 1, (r.y + 1) * s),
    });
  // ceiling: invisible, keeps jetpacks inside the walls
  if (!sky)
    boxes.push({
      c: v3((W * s) / 2, wallTop + 0.5, (H * s) / 2),
      h: v3((W * s) / 2, 0.5, (H * s) / 2),
      mat: 'hull',
      noRender: true,
    });

  // ---- spawns, towers, sites, teleports, callouts ------------------------------------------
  // Towers fit their room (6 m where there is room for it)
  const towerH = (p: Cell) => {
    const room =
      p.o === 'down' ? p.h - (p.airBottom ?? p.h - 6) : (p.airTop ?? standY(p) + 6) - standY(p);
    return Math.max(2.5, Math.min(6, room - 0.3));
  };
  const mid = [(W - 1) / 2, (H - 1) / 2];
  const spawns: SpawnDef[] = [];
  const towers: TowerDef[] = [];
  const homes: Vec3[] = [];
  for (const [team, kind] of [
    [0, 'cyan'],
    [1, 'orange'],
  ] as const) {
    const c = Object.keys(lay.legend).find((k) => lay.legend[k].k === kind);
    if (!c) continue;
    const r = regionOf(c);
    const [mx, my] = centroid(r);
    const near = nearestTo(r, mx, my);
    const far = [...r].sort(
      (a, b) =>
        (b.x - mid[0]) ** 2 + (b.y - mid[1]) ** 2 - ((a.x - mid[0]) ** 2 + (a.y - mid[1]) ** 2),
    );
    const yaw = (x: number, z: number) =>
      (Math.atan2(cx(mid[0]) - x, -(cz(mid[1]) - z)) * 180) / Math.PI;
    const picks = near.slice(0, 8);
    for (let i = 0; spawns.filter((sp) => sp.team === team).length < 8; i++) {
      const p = picks[i % picks.length];
      const off = Math.floor(i / picks.length) * 1.2;
      const x = cx(p.x) + off;
      const z = cz(p.y) + off;
      spawns.push({
        pos: v3(x, p.o === 'down' ? p.h - HANG : standY(p), z),
        yawDeg: yaw(x, z),
        team,
      });
    }
    const t = far[0];
    towers.push(
      t.o === 'down'
        ? {
            team,
            pos: v3(cx(t.x), t.h - towerH(t) - 1, cz(t.y)),
            radius: 1.5,
            height: towerH(t),
            hanging: true,
          }
        : { team, pos: v3(cx(t.x), standY(t), cz(t.y)), radius: 1.5, height: towerH(t) },
    );
    const h0 = near[0];
    homes.push(v3(cx(h0.x), h0.o === 'down' ? h0.h - 1 : standY(h0), cz(h0.y)));
  }
  const bombSites: BombSiteDef[] = [];
  for (const [c, a] of Object.entries(lay.legend)) {
    if (a.k !== 'site') continue;
    const r = regionOf(c);
    if (!r.length) continue;
    const xs = r.map((p) => p.x);
    const ys = r.map((p) => p.y);
    const lo = Math.min(...r.map((p) => p.h));
    const hi = Math.max(...r.map((p) => p.h));
    const down = r[0].o === 'down';
    bombSites.push({
      name: a.n.trim().startsWith('B') ? 'B' : 'A',
      min: v3(Math.min(...xs) * s, down ? lo - 4 : lo - 0.5, Math.min(...ys) * s),
      max: v3((Math.max(...xs) + 1) * s, down ? hi + 0.5 : hi + 4, (Math.max(...ys) + 1) * s),
    });
  }
  const named = Object.entries(lay.legend)
    .filter(([, a]) => !['void', 'solid'].includes(a.k))
    .flatMap(([c, a]) => {
      const r = regionOf(c);
      if (!r.length) return [];
      const [mx, my] = centroid(r);
      return [{ a, p: nearestTo(r, mx, my)[0] }];
    });
  const areas = named.map(({ a, p }) => ({
    name: a.n,
    pos: v3(cx(p.x), p.o === 'down' ? p.h - HANG : p.zg ? p.zg.lo : standY(p), cz(p.y)),
    yawDeg: 0,
  }));
  const callouts = named.map(({ a, p }) => ({
    name: a.n,
    ...(a.s && a.s !== a.n ? { short: a.s } : {}),
    pos: v3(cx(p.x), p.zg ? p.zg.lo : p.h, cz(p.y)),
  }));

  // cover first: the waypoints must not link through it
  const cover =
    lay.cover === false
      ? []
      : grayboxCover(
          lay,
          cells.map((p) => ({
            x: p.x,
            y: p.y,
            l: p.l,
            c: p.c,
            h: standY(p),
            sloped: !!p.rise || !!p.zg,
            o: p.o,
          })),
        );

  // ---- waypoints: every floor cell (zero-G: a column of them), linked where a bot can go ---
  const waypoints: WaypointDef[] = [];
  const wpOf = new Map<Cell, number>();
  const columns = new Map<string, Map<number, number>>(); // zero-G column: height → waypoint
  const addWp = (pos: Vec3, name: string) => waypoints.push({ pos, links: [], name }) - 1;
  const link = (a: number, b: number) => {
    if (a !== b && !waypoints[a].links.includes(b)) waypoints[a].links.push(b);
  };
  for (const p of cells)
    if (!p.zg && p.o !== 'side')
      wpOf.set(p, addWp(v3(cx(p.x), wpY(p), cz(p.y)), `${p.c}${p.l}:${p.x},${p.y}`));
  const yKey = (y: number) => Number(y.toFixed(3));
  for (const p of cells) {
    if (!p.zg || !columnCell(p)) continue;
    // at its neighbours' waypoint heights, and every ZERO_G_STEP metres up
    const hs = new Set<number>();
    for (const q of regionOf(p.c)) for (const n of nbrs(q)) if (wpOf.has(n)) hs.add(yKey(wpY(n)));
    const yTop = p.zg.top === p.zg.hi ? p.zg.hi - 1 : p.zg.hi + 1;
    for (let y = p.zg.lo + 1; y < yTop; y += ZERO_G_STEP) hs.add(yKey(y));
    hs.add(yKey(yTop));
    const col = new Map<number, number>();
    const ys = [...hs].filter((y) => y >= p.zg!.lo + 0.9 && y <= yTop + 0.01).sort((a, b) => a - b);
    for (const y of ys) col.set(y, addWp(v3(cx(p.x), y, cz(p.y)), `${p.c}:${p.x},${p.y}@${y}`));
    // (not through another floor laid across the column)
    const between = (a: number, b: number) =>
      (cellsAt.get(`${p.x},${p.y}`) ?? []).some(
        (q) => !q.zg && standY(q) > a - 1 + 0.05 && standY(q) < b - 1 + 1.9,
      );
    for (let i = 1; i < ys.length; i++) {
      if (between(ys[i - 1], ys[i])) continue;
      link(col.get(ys[i - 1])!, col.get(ys[i])!);
      link(col.get(ys[i])!, col.get(ys[i - 1])!);
    }
    columns.set(`${p.c}|${p.x},${p.y}`, col);
  }
  const columnOf = (p: Cell) => columns.get(`${p.c}|${p.x},${p.y}`);
  // a stair cell's floor height at its edge toward a neighbour (its centre if beside the climb)
  const edgeH = (p: Cell, q: Cell) => {
    if (!p.rise) return standY(p);
    const toward = p.axis === 'x' ? Math.sign(q.x - p.x) : Math.sign(q.y - p.y);
    return toward ? p.h + (p.rise / 2) * toward : p.h;
  };
  const canGo = (a: Cell, b: Cell) => {
    if (a.o !== b.o) return false;
    // (along a flight of stairs the steps are what count, not the centres' heights)
    if ((a.rise || b.rise) && a.o === 'up' && Math.abs(edgeH(b, a) - edgeH(a, b)) <= 0.6)
      return true;
    const up = a.o === 'down' ? standY(a) - standY(b) : standY(b) - standY(a);
    if (up > 2.6 || up < -14) return false;
    // (a drop must not pass through another floor or a wall laid across the way down)
    if (a.o === 'up' && up < -0.6) {
      const from = standY(b) + 0.3;
      const to = standY(a) + 1.7;
      if ((segsAt.get(`${b.x},${b.y}`) ?? []).some((g) => g.y0 > from && g.y0 < to)) return false;
    }
    return true;
  };
  for (const p of cells) {
    if (p.o === 'side') continue;
    for (const q of nbrs(p)) {
      if (q.o === 'side') continue;
      const cp = p.zg ? columnOf(p) : undefined;
      const cq = q.zg ? columnOf(q) : undefined;
      if (!p.zg && !q.zg) {
        if (sky && p.c !== q.c) continue; // (islands meet only through jumps)
        const wa = wpOf.get(p)!;
        const wb = wpOf.get(q)!;
        if (canGo(p, q) && !coverCutsLink(cover, waypoints[wa].pos, waypoints[wb].pos))
          link(wa, wb);
      } else if (cp && cq) {
        for (const [y, i] of cp) {
          const j = cq.get(y);
          if (j !== undefined) link(i, j);
        }
      } else if (cp && !q.zg) {
        const i = cp.get(yKey(wpY(q)));
        if (i !== undefined) {
          link(i, wpOf.get(q)!);
          link(wpOf.get(q)!, i);
        }
      }
    }
  }

  // ---- size walls --------------------------------------------------------------------------
  const sizeWalls: SizeWallDef[] = [];
  const sizes = Object.entries(lay.sizes ?? {})
    .map(([n, closed]) => [Number(n), closed] as const)
    .sort((a, b) => b[0] - a[0]);
  const already = new Set<string>();
  for (const [maxTeamSize, closed] of sizes) {
    const fresh = closed.filter((c) => !already.has(c));
    fresh.forEach((c) => already.add(c));
    const wallBoxes: BoxDef[] = [];
    const field = (p: Cell, y0: number, y1: number) =>
      wallBoxes.push({
        c: v3(cx(p.x), (y0 + y1) / 2, cz(p.y)),
        h: v3(s / 2, (y1 - y0) / 2, s / 2),
        mat: 'forcefield',
      });
    for (const c of fresh)
      for (const p of regionOf(c)) {
        if (!columnCell(p)) continue;
        if (sky) field(p, p.h - 2, p.h + 4);
        else if (p.zg) field(p, p.zg.lo - 0.2, p.zg.top);
        else if (p.o === 'down') field(p, p.airBottom ?? p.h - 4, p.h + 0.2);
        else {
          // (up to whatever closes the column above: nobody jetpacks over the field)
          const y0 = standY(p) - Math.abs(p.rise ?? 0) - 0.2;
          const lid = (segsAt.get(`${p.x},${p.y}`) ?? []).find((g) => g.y0 > standY(p) + 1);
          field(p, y0, lid ? lid.y0 : wallTop);
        }
      }
    if (wallBoxes.length) sizeWalls.push({ maxTeamSize, boxes: wallBoxes });
  }

  const m = sky ? 30 : 0;
  return {
    name: lay.name,
    boundsMin: v3(-m, bottom - (sky ? 20 : 1), -m),
    boundsMax: v3(W * s + m, wallTop + (sky ? 20 : 1), H * s + m),
    defaultGravity: v3(0, -1, 0),
    boxes: [...boxes, ...cover],
    zones,
    rails,
    pads: [],
    spawns,
    towers,
    controllerHomes: homes,
    waypoints,
    areas,
    callouts,
    bombSites,
    launchPads,
    ...(portals.length ? { portals } : {}),
    ...(killVolumes.length ? { killVolumes } : {}),
    ...(sizeWalls.length ? { sizeWalls } : {}),
    ...(lay.skyJetpack ? { skyJetpack: true } : {}),
    ambient: 1,
  };
};
