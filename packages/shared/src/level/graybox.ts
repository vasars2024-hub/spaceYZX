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
//   - ramps are SMOOTH slopes (no steps): the builder gives every grid corner of a ramp a height
//     (straight flights: rising evenly along `dir`; any other shape: by walking distance from the
//     low landing and from the high one) so neighbouring cells always meet edge to edge, flush
//     with the floors at both ends. Straight runs become one solid wedge each; turns and odd
//     shapes become two triangular columns per cell. 30° or less is full sprint speed; a layout
//     that asks for more gets a warning, and one that would be steeper than 45° falls back to
//     stairs (walkable steps no higher than 0.3 m) with a warning
//   - ceiling decks ('down') are walked upside down: their slab hangs at `h` with gravity pointing
//     up below it; gravity areas become zero-G volumes joining their neighbours' heights (only
//     Antipode's double-sided deck still uses them)
//   - links: launch pads, zip-rails (with a slot cut through the walls they cross), portals and
//     suction tubes (the maps' ladders)
//   - sky maps: islands in the open, upright, upside down or walked on a side face, over a void
//   - themes (level/graybox-theme.ts): wall / floor materials and colours per area, trims, door
//     frames, sky, fog and light; props (crates, walls, cars…); painted signs ("A →", "MID")
//   - waypoints sit 1 m off every floor (a column of them in zero-G) and link where a bot can go;
//     huge maps put one on every Nth cell only (`waypointEvery`)
import type { Vec3 } from '../math/vec3';
import { v3 } from '../math/vec3';
import type {
  BoxDef,
  BombSiteDef,
  GravityZoneDef,
  KillVolumeDef,
  LaunchPadDef,
  LevelDef,
  LiftTubeDef,
  Material,
  PortalDef,
  RailDef,
  SizeWallDef,
  SpawnDef,
  TowerDef,
  WaypointDef,
} from './types';
import { coverCutsLink, grayboxCover, type GrayboxFloorCell } from './graybox-cover';
import { wedgeRamp } from './builder';
import { buildLevel } from './level';
import { capsuleOverlaps } from './collision';
import { GRAYBOX_THEMES, mix, pick, shade, themeLights } from './graybox-theme';
import { hasGlyph, paintText, textHeightPx, textWidthPx } from './graybox-signs';

export { GRAYBOX_THEMES } from './graybox-theme';
export type { GrayboxPalette } from './graybox-theme';

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
  /** height span of a ramp [low, high] (built as a smooth slope) */
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
   * room), so any heights around it join; 'stairs': a stand-in ramp between its neighbours
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
 *   tube   — a suction tube (instead of a ladder): sucks you up at the from-area's cell nearest the
 *            target and throws you onto the target (LevelDef.liftTubes); one way
 * Bots ride tubes (a one-way waypoint link from the tube's mouth to its landing), but never pads,
 * rails or portals (bots/brain.ts): their routes must not need those.
 */
export type GrayboxLinkKind =
  'drop' | 'pad' | 'rail' | 'portal' | 'tunnel' | 'jump' | 'jet' | 'tube';
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
  /**
   * per-cell floor heights (m), [row][column] like `rows`; null / absent = the area's height.
   * Upright plain floors only (not ramp or gravity areas). Built smooth: neighbouring cells at
   * most SMOOTH_GAP apart become one tilted surface (each grid corner at the mean of the cells
   * around it), bigger differences stay ledges. Traced CS maps (level/maps/cs/) use it, packed
   * with `unpackHeights`.
   */
  heights?: (number | null)[][];
}

const PACK = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
/**
 * Per-cell heights packed two characters a cell (`..` = none): the height in centimetres over
 * `base` (m), base-64 (PACK). The CS map tracer writes them this way to keep the files small.
 */
export const unpackHeights = (base: number, rows: string[]): (number | null)[][] =>
  rows.map((r) => {
    const out: (number | null)[] = [];
    for (let i = 0; i + 1 < r.length; i += 2) {
      const a = PACK.indexOf(r[i]);
      const b = PACK.indexOf(r[i + 1]);
      out.push(a < 0 || b < 0 ? null : Math.round((base + (a * 64 + b) / 100) * 100) / 100);
    }
    return out;
  });

export interface GrayboxLayout {
  name: string;
  /** metres per cell */
  cellM: number;
  /** lowest first */
  layers: GrayboxLayer[];
  legend: Record<string, GrayboxArea>;
  links?: GrayboxLink[];
  /**
   * areas closed by force fields for small teams: team size → closed area characters. Force
   * fields only ever exist for 1v1 and 2v2: 3v3 and bigger play the FULL map, so a key of 3 or
   * more counts as 2 (several keys that end up the same close all their areas together).
   */
  sizes?: Record<number, string[]>;
  /** open sky around everything (sky maps): no outer walls or ceiling; falls into the void kill */
  sky?: boolean;
  /** the boosted sky-duel jetpack everywhere on the map (LevelDef.skyJetpack) */
  skyJetpack?: boolean;
  /**
   * automatic cover (level/graybox-cover.ts): default on. Areas holding hand-placed props get
   * none (the props are their cover); `false` turns it off everywhere.
   */
  cover?: boolean;
  /**
   * the look: wall / floor materials and colours, sky and light (level/graybox-theme.ts).
   * Absent: the plain graybox look.
   */
  theme?: GrayboxTheme;
  /** hand-placed props: crates, low walls, pillars, cars… (CS-style cover where the map has it) */
  props?: GrayboxProp[];
  /** painted wall signs ("A →", "B SITE", "MID") like CS maps; plus automatic ones unless off */
  signs?: GrayboxSign[];
  /** automatic direction signs toward the bomb sites at junctions: default on */
  autoSigns?: boolean;
  /** bot waypoints on every Nth cell only (huge maps: keeps the bots' route search fast); default 1 */
  waypointEvery?: number;
}

/** A map's look (palettes in level/graybox-theme.ts). */
export type GrayboxTheme =
  | 'desert' // sandstone and plaster, blue doors, bright sun (Dust 2, Mirage)
  | 'italian' // terracotta, ochre plaster, cobbles (Inferno)
  | 'industrial' // concrete, painted steel, warehouse light (Nuke, Train, Cache)
  | 'jungle' // mossy stone ruins, green light (Ancient)
  | 'egypt' // limestone, blue water, gold accents (Anubis)
  | 'canyon' // red rock and sand under open sky (Canyon Relay)
  | 'station' // light hull panels, signage stripes (Antipode)
  | 'city'; // neon street, asphalt, shop fronts (the Shibuya mega map)

/**
 * A hand-placed prop. Position and size in CELLS (fractions allowed): its corner at (x, y) of
 * the grid, w × d cells big, h metres tall, standing on the floor of layer l (default 0) there.
 * Kinds: crate (wooden crates), wall (a low or full wall), pillar, car (a low body with a cabin
 * on top), barrel, stairs (a solid ramp rising along its longer side toward +x / +z).
 */
export interface GrayboxProp {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  l?: number;
  kind?: 'crate' | 'wall' | 'pillar' | 'car' | 'barrel' | 'stairs';
}

/**
 * A painted sign: (x, y) is the WALL cell (in layer l), `face` the side of it the sign is painted
 * on and read from (the open floor cell is its neighbour in direction `face`; n = toward row 0).
 * Arrows are written from the reader's point of view ("A →": A is to the reader's right). Signs
 * read from a ceiling deck ('down') are drawn upside down in the world, so a ceiling walker reads
 * them upright. Text: A–Z, 0–9, ← → ↑ ↓, '-', spaces; '\n' starts a second line.
 */
export interface GrayboxSign {
  x: number;
  y: number;
  l?: number;
  face: 'n' | 's' | 'e' | 'w';
  text: string;
}

/** Build options: where warnings go (default: the console, each message once). */
export interface GrayboxBuildOptions {
  warn?: (message: string) => void;
}

const WALL = '.';
const VOID = '~';
const STEP = 0.3; // stairs fallback: (0.35 m steps on short treads can't be walked up)
const SLAB = 0.5; // thickness of a floor laid over open space (catwalks, decks over a tunnel)
const CLEAR = 3.2; // head room kept open above every floor
const WALL_ABOVE = 10; // walls rise this far above the highest floor
const G = 20; // MOVEMENT gravity (m/s²), for the launch pad arcs
const HANG = 1.82; // a ceiling spawn's feet sit this far under the ceiling (see antipode.ts)
const RAIL_Y = 2.05; // a zip-rail hangs this far over the floor: the rider (railHang 1.1 below it) clears the floor, and it stays in grab reach
const RAIL_H = 3; // glass along deadly drops: higher than any jump or climb (climbMaxHeight 2.6)
const ZERO_G_STEP = 6; // zero-G columns get a waypoint every this many metres up
/** ramps up to this steep keep full sprint speed (sim/movement.ts) */
export const RAMP_MAX_DEG = 30;
/** a ramp steeper than this (MOVEMENT maxWalkableSlopeDeg is 50) is built as stairs instead */
export const RAMP_SMOOTH_LIMIT_DEG = 45;
const TUBE_R = 0.6; // suction tube radius
const TUBE_TOP = 3; // a tube's top stands this far over the floor it brings you to
const SIGN_PX = 0.2; // sign pixel size: 1.4 m letters (two lines: SIGN_PX2)
const SIGN_PX2 = 0.175;
const SIGN_MID = 1.8; // a sign's middle stands this high over the floor (eye height)
const DOOR_H = 3; // door frames and the wall's lower part reach this high over the floor
const MAX_AUTO_SIGNS = 150;
const TURN_GAP = 3.5; // a ceiling deck at most this far over a floor: bots turn over between them
/** per-cell heights: neighbours at most this much apart share one smooth surface (more: a ledge) */
export const SMOOTH_GAP = 1;

const warned = new Set<string>();
const defaultWarn = (m: string) => {
  if (warned.has(m)) return;
  warned.add(m);
  (globalThis as { console?: { warn: (m: string) => void } }).console?.warn(m);
};

interface Cell {
  x: number;
  y: number;
  l: number;
  c: string;
  /** floor height at the cell centre */
  h: number;
  o: GrayboxOrientation;
  /** stairs (the fallback for too steep ramps): rise across the cell along `axis` (signed) */
  rise?: number;
  axis?: 'x' | 'z';
  /** smooth ramps: the height of the cell's corners [nw, ne, sw, se] */
  corners?: [number, number, number, number];
  /** smooth ramps: the diagonal the top is split along ('a': nw–se, 'b': ne–sw) */
  diag?: 'a' | 'b';
  /** smooth ramps: the bottom of its piece */
  base?: number;
  /** zero-G areas: the span the volume covers (top: its open top; = hi under a ceiling deck) */
  zg?: { lo: number; hi: number; top: number };
  /** open space kept above an up floor / below a down floor (size walls fill it) */
  airTop?: number;
  airBottom?: number;
  /** stairs / ramps standing on the column below (nothing under them) */
  onColumn?: boolean;
  /** a prop stands on its middle: no waypoint */
  noWp?: boolean;
}

interface Seg {
  y0: number;
  y1: number;
  mat: Material;
  color?: number;
}

interface Look {
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

/** Greedy rectangles covering a set of cells (indices y·W + x): runs along rows, stacked while equal. */
const rectangles = (idx: number[], W: number) => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const k of idx) {
    const x = k % W;
    const y = (k - x) / W;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const left = new Uint8Array(w * h);
  for (const k of idx) left[(Math.floor(k / W) - y0) * w + (k % W) - x0] = 1;
  const out: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!left[y * w + x]) continue;
      let xe = x;
      while (xe + 1 < w && left[y * w + xe + 1]) xe++;
      let ye = y;
      for (;;) {
        let ok = ye + 1 < h;
        for (let xx = x; ok && xx <= xe; xx++) if (!left[(ye + 1) * w + xx]) ok = false;
        if (!ok) break;
        ye++;
      }
      for (let yy = y; yy <= ye; yy++) for (let xx = x; xx <= xe; xx++) left[yy * w + xx] = 0;
      out.push({ x0: x + x0, y0: y + y0, x1: xe + x0, y1: ye + y0 });
    }
  return out;
};

/** A small binary min-heap of [key, id] pairs (ties: the lower id first, so results never vary). */
const less = (a: [number, number], b: [number, number]) =>
  a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
const heapPush = (h: [number, number][], e: [number, number]) => {
  h.push(e);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!less(e, h[p])) break;
    h[i] = h[p];
    i = p;
  }
  h[i] = e;
};
const heapPop = (h: [number, number][]): [number, number] | undefined => {
  const top = h[0];
  const last = h.pop();
  if (!h.length || !last) return top;
  let i = 0;
  for (;;) {
    const l = 2 * i + 1;
    if (l >= h.length) break;
    const r = l + 1;
    const m = r < h.length && less(h[r], h[l]) ? r : l;
    if (!less(h[m], last)) break;
    h[i] = h[m];
    i = m;
  }
  h[i] = last;
  return top;
};

/** Steepest slope (degrees) of a triangle given as [x, height, z] corners. */
const slopeDeg = (a: number[], b: number[], c: number[]) => {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const wx = c[0] - a[0];
  const wy = c[1] - a[1];
  const wz = c[2] - a[2];
  const nx = uy * wz - uz * wy;
  const ny = uz * wx - ux * wz;
  const nz = ux * wy - uy * wx;
  const l = Math.hypot(nx, ny, nz);
  return l < 1e-12 ? 0 : (Math.acos(Math.min(1, Math.abs(ny) / l)) * 180) / Math.PI;
};
/** A cell top's two triangles for each diagonal (indices into [nw, ne, sw, se]). */
const TRIS: Record<'a' | 'b', [number, number, number][]> = {
  a: [
    [0, 1, 3],
    [0, 3, 2],
  ],
  b: [
    [0, 1, 2],
    [1, 3, 2],
  ],
};
const CORNER_UV: [number, number][] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

export const buildGraybox = (lay: GrayboxLayout, opts: GrayboxBuildOptions = {}): LevelDef => {
  const warn = opts.warn ?? defaultWarn;
  const say = (m: string) => warn(`${lay.name}: ${m}`);
  const pal = lay.theme ? GRAYBOX_THEMES[lay.theme] : undefined;
  const s = lay.cellM;
  const W = lay.layers[0].rows[0].length;
  const H = lay.layers[0].rows.length;
  const nL = lay.layers.length;
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
  const grid: (Cell | undefined)[] = new Array(nL * W * H);
  const cellAt = (l: number, x: number, y: number) =>
    x < 0 || y < 0 || x >= W || y >= H ? undefined : grid[(l * H + y) * W + x];
  const regions = new Map<string, Cell[]>();
  lay.layers.forEach((layer, l) =>
    layer.rows.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c !== WALL && c !== VOID && !area(c))
          throw new Error(`${lay.name}: no legend entry for '${c}'`);
        if (!isFloor(c)) return;
        const a = area(c);
        const cell: Cell = { x, y, l, c, h: span(a, layer.y)[0], o: a.o ?? layer.o ?? 'up' };
        cells.push(cell);
        grid[(l * H + y) * W + x] = cell;
        if (!regions.has(c)) regions.set(c, []);
        regions.get(c)!.push(cell);
      }),
    ),
  );
  const regionOf = (c: string) => regions.get(c) ?? [];
  /** cells whose height comes from their layer's `heights` (looks: by their area, not per cell) */
  const perCell = new Set<Cell>();
  const nbrs = (p: Cell) => {
    const out: Cell[] = [];
    for (const [dx, dy] of DIRS)
      for (let l = 0; l < nL; l++) {
        const q = cellAt(l, p.x + dx, p.y + dy);
        if (q) out.push(q);
      }
    return out;
  };
  const flatH = (q: Cell) => area(q.c).h ?? lay.layers[q.l].y;
  const plain = (q: Cell) => !isSloped(area(q.c)) && !isZeroG(area(q.c));
  // stairs and ramps: height follows the way from the low side to the high side (first the
  // stair-step heights; smooth ramps refine them below)
  const rampSpan = new Map<string, [number, number]>();
  for (const [c, a] of Object.entries(lay.legend)) {
    if (!isSloped(a)) continue;
    const region = regionOf(c);
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
    rampSpan.set(c, [lo, hi]);
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
      for (let qi = 0; qi < q.length; qi++) {
        const p = q[qi];
        for (const [dx, dy] of DIRS) {
          const n = cellAt(p.l, p.x + dx, p.y + dy);
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
        const n = cellAt(p.l, p.x + dx, p.y + dy);
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

  // ---- smooth ramps: a height for every grid corner -----------------------------------------
  const VW = W + 1;
  const vkey = (X: number, Y: number) => Y * VW + X;
  const cornerKeys = (p: Cell) => [
    vkey(p.x, p.y),
    vkey(p.x + 1, p.y),
    vkey(p.x, p.y + 1),
    vkey(p.x + 1, p.y + 1),
  ];
  const cellSlope = (k: number[], d: 'a' | 'b') =>
    Math.max(
      ...TRIS[d].map(([i, j, m]) =>
        slopeDeg(
          [CORNER_UV[i][0] * s, k[i], CORNER_UV[i][1] * s],
          [CORNER_UV[j][0] * s, k[j], CORNER_UV[j][1] * s],
          [CORNER_UV[m][0] * s, k[m], CORNER_UV[m][1] * s],
        ),
      ),
    );
  /** Dijkstra over the corner graph from the seeds: corner → distance (cells) */
  const cornerDistances = (adj: Map<number, [number, number][]>, seeds: Set<number>) => {
    const d = new Map<number, number>();
    const heap: [number, number][] = [];
    for (const v of [...seeds].sort((a, b) => a - b)) {
      d.set(v, 0);
      heapPush(heap, [0, v]);
    }
    while (heap.length) {
      const [dv, v] = heapPop(heap)!;
      if (dv > (d.get(v) ?? Infinity)) continue;
      for (const [u, w] of adj.get(v) ?? []) {
        const nd = dv + w;
        if (nd < (d.get(u) ?? Infinity) - 1e-12) {
          d.set(u, nd);
          heapPush(heap, [nd, u]);
        }
      }
    }
    return d;
  };
  for (const [c, a] of Object.entries(lay.legend)) {
    if (!isSloped(a) || sky) continue;
    const region = regionOf(c);
    const sp = rampSpan.get(c);
    if (!region.length || !sp || sp[0] === sp[1]) continue;
    const [lo, hi] = sp;
    const byLayer = new Map<number, Cell[]>();
    for (const p of region) {
      if (p.o === 'side') continue;
      if (!byLayer.has(p.l)) byLayer.set(p.l, []);
      byLayer.get(p.l)!.push(p);
    }
    const plan: { p: Cell; k: [number, number, number, number]; d: 'a' | 'b' }[] = [];
    let worst = 0;
    for (const part of byLayer.values()) {
      const hv = new Map<number, number>();
      if (a.dir) {
        // a straight flight: rising evenly over the region's extent along `dir`
        const xs = part.map((p) => p.x);
        const ys = part.map((p) => p.y);
        const x0 = Math.min(...xs);
        const x1 = Math.max(...xs);
        const y0 = Math.min(...ys);
        const y1 = Math.max(...ys);
        const n = a.dir === 'e' || a.dir === 'w' ? x1 - x0 + 1 : y1 - y0 + 1;
        const t = (X: number, Y: number) =>
          a.dir === 'e'
            ? (X - x0) / n
            : a.dir === 'w'
              ? (x1 + 1 - X) / n
              : a.dir === 's'
                ? (Y - y0) / n
                : (y1 + 1 - Y) / n;
        for (const p of part) {
          const ks = cornerKeys(p);
          CORNER_UV.forEach(([u, v], i) => hv.set(ks[i], lo + (hi - lo) * t(p.x + u, p.y + v)));
        }
      } else {
        // any shape: corners on the edge to the low landing stand at its height, those on the
        // edge to the high landing at its height, the rest in between by walking distance
        const adj = new Map<number, [number, number][]>();
        const edge = (u: number, v: number, w: number) => {
          if (!adj.has(u)) adj.set(u, []);
          if (!adj.has(v)) adj.set(v, []);
          adj.get(u)!.push([v, w]);
          adj.get(v)!.push([u, w]);
        };
        const loS = new Set<number>();
        const hiS = new Set<number>();
        for (const p of part) {
          const [nw, ne, sw, se] = cornerKeys(p);
          edge(nw, ne, 1);
          edge(sw, se, 1);
          edge(nw, sw, 1);
          edge(ne, se, 1);
          edge(nw, se, Math.SQRT2);
          edge(ne, sw, Math.SQRT2);
          for (const [dx, dy] of DIRS) {
            const side = dx > 0 ? [ne, se] : dx < 0 ? [nw, sw] : dy > 0 ? [sw, se] : [nw, ne];
            for (let l = 0; l < nL; l++) {
              const q = cellAt(l, p.x + dx, p.y + dy);
              if (!q || q.c === c || !plain(q) || q.o !== p.o) continue;
              const hq = flatH(q);
              const set = Math.abs(hq - lo) < 0.6 ? loS : Math.abs(hq - hi) < 0.6 ? hiS : null;
              for (const v of side) set?.add(v);
            }
          }
        }
        // (a corner touching both landings belongs to neither)
        for (const v of [...loS])
          if (hiS.has(v)) {
            loS.delete(v);
            hiS.delete(v);
          }
        if (loS.size && hiS.size) {
          const dL = cornerDistances(adj, loS);
          const dH = cornerDistances(adj, hiS);
          for (const v of adj.keys()) {
            if (loS.has(v)) hv.set(v, lo);
            else if (hiS.has(v)) hv.set(v, hi);
            else {
              const u = dL.get(v);
              const w = dH.get(v);
              if (u !== undefined && w !== undefined && u + w > 0)
                hv.set(v, lo + ((hi - lo) * u) / (u + w));
            }
          }
        }
        // (corners still without a height: the mean of the stair heights of the cells around)
        const sum = new Map<number, [number, number]>();
        for (const p of part)
          for (const k of cornerKeys(p)) {
            if (hv.has(k)) continue;
            const t = sum.get(k) ?? [0, 0];
            sum.set(k, [t[0] + p.h, t[1] + 1]);
          }
        for (const [k, [t, n]] of sum) hv.set(k, t / n);
      }
      for (const p of part) {
        const k = cornerKeys(p).map((v) => hv.get(v)!) as [number, number, number, number];
        const sa = cellSlope(k, 'a');
        const sb = cellSlope(k, 'b');
        const d = sb < sa - 1e-9 ? 'b' : 'a';
        worst = Math.max(worst, Math.min(sa, sb));
        plan.push({ p, k, d });
      }
    }
    if (worst > RAMP_SMOOTH_LIMIT_DEG + 0.5) {
      say(
        `ramp '${c}' (${a.n}) would be ${worst.toFixed(0)}° steep (more than ${RAMP_SMOOTH_LIMIT_DEG}°): built as stairs; give it more cells (30° needs a run of ${((hi - lo) / Math.tan(Math.PI / 6)).toFixed(1)} m)`,
      );
      continue;
    }
    if (worst > RAMP_MAX_DEG + 0.5)
      say(
        `ramp '${c}' (${a.n}) is ${worst.toFixed(1)}° steep (more than ${RAMP_MAX_DEG}°: rise more than tan 30° × run); give it more cells`,
      );
    for (const { p, k, d } of plan) {
      p.corners = k;
      p.diag = d;
      p.h = d === 'a' ? (k[0] + k[3]) / 2 : (k[1] + k[2]) / 2;
      p.rise = undefined;
      p.axis = undefined;
    }
  }

  // ---- per-cell heights (traced maps): one smooth surface over the radar's heights ----------
  // A layer's `heights` sets the floor height of each cell. Every grid corner takes the mean of
  // the cells around it that stand within SMOOTH_GAP of each other (sorted lowest first; a new
  // group starts where a cell stands more than SMOOTH_GAP over the group's lowest), so gentle
  // differences become tilted tops meeting edge to edge (no stairs you feel) and only real
  // ledges stay steps. Flat stretches stay plain flat cells.
  lay.layers.forEach((layer, l) => {
    const hs = layer.heights;
    if (!hs || sky) return;
    const own = (x: number, y: number) => {
      const p = cellAt(l, x, y);
      return p && p.o === 'up' && !p.corners && !p.rise && plain(p) ? p : undefined;
    };
    const mine: Cell[] = [];
    for (const p of cells) {
      if (p.l !== l) continue;
      const v = hs[p.y]?.[p.x];
      if (typeof v !== 'number' || !own(p.x, p.y)) continue;
      p.h = v;
      perCell.add(p);
      mine.push(p);
    }
    const cornerOf = new Map<string, number>(); // `${vertex}|${cell}` → height
    const done = new Set<number>();
    for (const p of mine)
      for (const v of cornerKeys(p)) {
        if (done.has(v)) continue;
        done.add(v);
        const X = v % VW;
        const Y = (v - X) / VW;
        const around = [own(X - 1, Y - 1), own(X, Y - 1), own(X - 1, Y), own(X, Y)].filter(
          (q): q is Cell => !!q,
        );
        around.sort((a, b) => a.h - b.h);
        let g0 = 0;
        for (let i = 1; i <= around.length; i++) {
          if (i < around.length && around[i].h - around[g0].h <= SMOOTH_GAP) continue;
          const grp = around.slice(g0, i);
          const mean = Math.round((grp.reduce((t, q) => t + q.h, 0) / grp.length) * 1000) / 1000;
          for (const q of grp) cornerOf.set(`${v}|${q.y * W + q.x}`, mean);
          g0 = i;
        }
      }
    let steep = 0;
    let worst = 0;
    for (const p of mine) {
      const k = cornerKeys(p).map((v) => cornerOf.get(`${v}|${p.y * W + p.x}`) ?? p.h) as [
        number,
        number,
        number,
        number,
      ];
      if (k.every((u) => Math.abs(u - p.h) < 1e-6)) continue;
      const sa = cellSlope(k, 'a');
      const sb = cellSlope(k, 'b');
      const d = sb < sa - 1e-9 ? 'b' : 'a';
      if (Math.min(sa, sb) > RAMP_MAX_DEG + 0.5) steep++;
      worst = Math.max(worst, Math.min(sa, sb));
      p.corners = k;
      p.diag = d;
      p.h = d === 'a' ? (k[0] + k[3]) / 2 : (k[1] + k[2]) / 2;
    }
    if (steep)
      say(
        `layer '${layer.name}' heights: ${steep} cells; the steepest is ${worst.toFixed(1)}° steep (more than ${RAMP_MAX_DEG}°: smooth the heights there)`,
      );
  });
  const isRamp = (p: Cell) => !!p.corners || !!p.rise;
  const lowY = (p: Cell) => (p.corners ? Math.min(...p.corners) : p.h - Math.abs(p.rise ?? 0) / 2);
  const highY = (p: Cell) => (p.corners ? Math.max(...p.corners) : p.h + Math.abs(p.rise ?? 0) / 2);
  /** a smooth ramp cell's shape: one slope along x or z, flat, or anything else (null) */
  const axisOf = (p: Cell): 'x' | 'z' | 'flat' | null => {
    const [nw, ne, sw, se] = p.corners!;
    const eq = (u: number, v: number) => Math.abs(u - v) < 1e-6;
    if (eq(nw, ne) && eq(sw, se) && eq(nw, sw)) return 'flat';
    if (eq(nw, sw) && eq(ne, se)) return 'x';
    if (eq(nw, ne) && eq(sw, se)) return 'z';
    return null;
  };
  const standY = (p: Cell) => (p.o === 'down' ? p.h : p.h + stepUpOf(p));
  const wpY = (p: Cell) => (p.o === 'down' ? p.h - 1 : standY(p) + 1);
  // zero-G areas: one volume from the lowest neighbouring floor to the highest
  if (!sky)
    for (const [c, a] of Object.entries(lay.legend)) {
      if (!isZeroG(a)) continue;
      const region = regionOf(c);
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
  const firstOfColumn = new Map<string, Cell>();
  for (const p of cells) {
    const k = `${p.c}|${p.x},${p.y}`;
    if (!firstOfColumn.has(k)) firstOfColumn.set(k, p);
  }
  const columnCell = (p: Cell) => !p.zg || firstOfColumn.get(`${p.c}|${p.x},${p.y}`) === p;

  let top = -Infinity;
  let low = Infinity;
  for (const p of cells) {
    top = Math.max(top, p.h);
    low = Math.min(low, p.h);
  }
  for (const l of lay.layers) {
    top = Math.max(top, l.y);
    low = Math.min(low, l.y);
  }
  const bottom = low - 4;
  const wallTop = top + WALL_ABOVE;

  /** areas drawn as shallow water (themes with a water colour) */
  const WATER_AREA = /\b(water|canal|sea|boat)\b/i;
  // ---- looks (level/graybox-theme.ts; unthemed: the plain graybox colours) ------------------
  const colorOf = (c: string, h: number): number => {
    const k = area(c).k;
    if (k === 'cyan') return 0x2f9e98;
    if (k === 'orange') return 0xd77a45;
    if (k === 'site') return 0xb4443f;
    if (k === 'gravity') return 0x7b6bd6;
    return h <= -6 ? 0x3f5a6b : h < -1 ? 0x56717f : h <= 1 ? 0x7d796f : h < 8 ? 0xa3916a : 0xc4aa72;
  };
  const floorLook = (c: string, h: number): Look => {
    if (!pal) return { mat: 'floor', color: colorOf(c, h) };
    const k = area(c).k;
    if (k === 'site') return { mat: pal.site.mat, color: pal.site.color };
    if (pal.water && WATER_AREA.test(area(c).n)) return { mat: pal.water.mat, color: pal.water.color };
    const base = shade(
      pick(h <= -2 ? pal.floor.alt : pal.floor.colors, c),
      1 + Math.max(-8, Math.min(12, h)) * 0.006,
    );
    const color =
      k === 'cyan'
        ? mix(base, 0x2f9e98, 0.35)
        : k === 'orange'
          ? mix(base, 0xd77a45, 0.35)
          : k === 'gravity'
            ? mix(base, 0x7b6bd6, 0.4)
            : base;
    return { mat: pal.floor.mat, color };
  };
  const rampLooks = new Map<string, Look>();
  const rampLook = (c: string): Look => {
    let lk = rampLooks.get(c);
    if (!lk) {
      const [lo, hi] = rampSpan.get(c) ?? [0, 0];
      lk = pal
        ? { mat: pal.ramp.mat, color: pick(pal.ramp.colors, c) }
        : { mat: 'floor', color: colorOf(c, (lo + hi) / 2) };
      rampLooks.set(c, lk);
    }
    return lk;
  };
  const wallMat: Material = pal ? pal.wall.mat : 'hull';
  /** a per-cell-height floor looks like its area (one colour however it tilts) */
  const cellLook = (p: Cell) => floorLook(p.c, area(p.c).h ?? lay.layers[p.l].y);

  const cellsAt: Cell[][] = Array.from({ length: W * H }, () => []);
  for (const p of cells) cellsAt[p.y * W + p.x].push(p);
  const here0 = (x: number, y: number) =>
    x < 0 || y < 0 || x >= W || y >= H ? [] : cellsAt[y * W + x];
  const centroid = (r: Cell[]) => [
    r.reduce((t, p) => t + p.x, 0) / r.length,
    r.reduce((t, p) => t + p.y, 0) / r.length,
  ];
  const nearestTo = (r: Cell[], tx: number, ty: number) =>
    [...r].sort((u, v) => (u.x - tx) ** 2 + (u.y - ty) ** 2 - ((v.x - tx) ** 2 + (v.y - ty) ** 2));

  // ---- links ---------------------------------------------------------------------------------
  const rails: RailDef[] = [];
  const launchPads: LaunchPadDef[] = [];
  const padPlans: { a: Cell; b: Cell; px: number; pz: number; half: number }[] = [];
  const portals: PortalDef[] = [];
  const liftTubes: LiftTubeDef[] = [];
  const tubeEnds: { a: Cell; b: Cell; base: Vec3; land: Vec3 }[] = []; // (bots ride tubes)
  const slots = new Map<number, [number, number][]>(); // rails and tubes cut a slot through walls
  const addSlot = (x: number, y: number, y0: number, y1: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const k = y * W + x;
    slots.set(k, [...(slots.get(k) ?? []), [y0, y1]]);
  };
  const flights = new Set<number>(); // cells a pad, rail or tube carries you over (no guard glass)
  const addFlight = (x: number, y: number) => flights.add(y * W + x);
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
  const walkable = (x: number, y: number) => here0(x, y).length > 0;
  /**
   * The corner of a flat upright cell of `from` nearest the target, against its walls and off
   * the walking line through the cell's middle (bots walk through cell centres): where a pad or
   * a tube stands.
   */
  const deviceSpot = (from: string, to: string, inset: number) => {
    const { src, bs } = ends(from, to);
    const b = bs[0];
    const a = nearestTo(
      src.filter((p) => !isRamp(p) && p.o === 'up' && !p.zg),
      b.x,
      b.y,
    )[0];
    if (!a) return null;
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
    return { a, b, px: cx(a.x) + sx * inset, pz: cz(a.y) + sz * inset };
  };
  // a launch pad: a plate in the corner of the source cell nearest the target, throwing you in an
  // arc onto the target (its speed is worked out once the walls stand: the arc must clear them)
  const pad = (from: string, to: string) => {
    const spot = deviceSpot(from, to, s / 4 + 0.3);
    if (!spot) return; // (pads only on flat upright floors)
    const { a, b, px, pz } = spot;
    const dx = cx(b.x) - px;
    const dz = cz(b.y) - pz;
    for (let i = 0; i <= 20; i++)
      addFlight(Math.floor((px + dx * (i / 20)) / s), Math.floor((pz + dz * (i / 20)) / s));
    padPlans.push({ a, b, px, pz, half: s / 4 - 0.4 });
  };
  // a suction tube: a glass tube in the corner of the source cell nearest the target, from its
  // floor up to TUBE_TOP over the target's floor; it throws you onto the target's nearest cell
  const tube = (from: string, to: string) => {
    const spot = deviceSpot(from, to, s / 2 - TUBE_R - 0.08);
    if (!spot) {
      say(`tube ${from} → ${to}: no flat floor in '${from}' for it`);
      return;
    }
    const { a, b, px, pz } = spot;
    const y0 = standY(a);
    const y1 = Math.max(standY(b), y0) + TUBE_TOP;
    liftTubes.push({
      base: v3(px, y0, pz),
      top: v3(px, y1, pz),
      land: v3(cx(b.x), standY(b), cz(b.y)),
      radius: TUBE_R,
    });
    tubeEnds.push({ a, b, base: v3(px, y0, pz), land: v3(cx(b.x), standY(b), cz(b.y)) });
    // open air up the tube and along the throw
    addSlot(a.x, a.y, y0, y1 + 1.5);
    addFlight(a.x, a.y);
    const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 3));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = Math.floor(a.x + 0.5 + (b.x - a.x) * t);
      const y = Math.floor(a.y + 0.5 + (b.y - a.y) * t);
      const yy = y1 + (standY(b) + 1 - y1) * t;
      addSlot(x, y, yy - 1.5, yy + 1.5);
      addFlight(x, y);
    }
    // (the client draws the tube itself: render/tube-mesh.ts)
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
    if (kind === 'tube') {
      tube(from, to);
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
        const x = Math.floor(a.x + 0.5 + (b.x - a.x) * t);
        const y = Math.floor(a.y + 0.5 + (b.y - a.y) * t);
        const yy = ya + (yb - ya) * t;
        addSlot(x, y, yy - 2.6, yy + 0.8);
        addFlight(x, y);
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
  const smooth: Cell[] = [];
  const rampCeilings: Cell[] = [];
  const segsAt: Seg[][] = Array.from({ length: W * H }, () => []);
  // (a void cell over a lower floor: the drop is deadly, so it gets a roof with a kill volume on it)
  const voidRoofs: { x: number; y: number; top: number }[] = [];
  const voidLayerAt = (x: number, y: number) =>
    lay.layers.findIndex((L, l) => !L.overlay && at(l, x, y) === VOID);
  const surf = (p: Cell) => (p.zg ? p.zg.lo : standY(p));
  /** the underside of an upright floor laid over open space */
  const underside = (p: Cell) => (p.corners ? lowY(p) - SLAB : surf(p) - SLAB);
  // themes: a wall gets the look of the area beside it — its lower part up to door height, a trim
  // strip, then its upper part (so the rooms of a map look different)
  const paintWall = (g: Seg, x: number, y: number): Seg[] => {
    if (!pal || g.mat !== 'hull') return [g];
    let ref: Cell | undefined;
    let refY = Infinity;
    for (const [dx, dy] of DIRS)
      for (const q of here0(x + dx, y + dy)) {
        if (q.o !== 'up' || q.zg) continue;
        const f = q.corners ? lowY(q) : standY(q);
        if (f < g.y0 - 0.1 || f > g.y1 - 1) continue;
        if (f < refY) {
          refY = f;
          ref = q;
        }
      }
    const key = ref?.c ?? '';
    const lower = pick(pal.wall.lower, key);
    if (!ref) return [{ ...g, mat: wallMat, color: lower }];
    const band = refY + DOOR_H;
    if (band < g.y0 + 0.3 || band + 0.25 > g.y1 - 0.3)
      return [{ ...g, mat: wallMat, color: lower }];
    return [
      { y0: g.y0, y1: band, mat: wallMat, color: lower },
      { y0: band, y1: band + 0.25, mat: pal.trim.mat, color: pick(pal.trim.colors, key) },
      { y0: band + 0.25, y1: g.y1, mat: wallMat, color: pick(pal.wall.upper, key) },
    ];
  };
  if (!sky)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        let solid: [number, number][] = [];
        for (const b of bands) if (isSolid(at(b.i, x, y))) solid.push([b.lo, b.hi]);
        const here = cellsAt[k].filter(columnCell).sort((p, q) => surf(p) - surf(q));
        const air: [number, number][] = [...(slots.get(k) ?? [])];
        const floors: Seg[] = [];
        here.forEach((p, i) => {
          const below = here[i - 1];
          const above = here[i + 1];
          const look = perCell.has(p)
            ? cellLook(p)
            : isRamp(p) && pal
              ? rampLook(p.c)
              : floorLook(p.c, p.h);
          if (p.zg) {
            air.push([p.zg.lo, p.zg.top]);
            if (!below) floors.push({ y0: bottom, y1: p.zg.lo, ...look });
            if (!above) floors.push({ y0: p.zg.top, y1: wallTop, mat: 'hull' });
            p.airTop = p.zg.top;
            return;
          }
          if (p.o === 'down' && p.corners) {
            // a smooth ramp walked upside down: the mirror of an upright one, hanging from above
            const topY = highY(p) + 0.25;
            const lowAir = Math.max(lowY(p) - CLEAR, below ? surf(below) + 0.1 : bottom);
            air.push([lowAir, topY]);
            p.airBottom = Math.max(lowAir, p.h - 4);
            p.base = topY;
            smooth.push(p);
            floors.push({ y0: topY, y1: above ? topY + SLAB : wallTop, ...rampLook(p.c) });
            return;
          }
          if (p.o === 'down') {
            const lowAir = Math.max(p.h - CLEAR, below ? surf(below) + 0.1 : bottom);
            air.push([lowAir, p.h]);
            p.airBottom = Math.max(lowAir, p.h - 4);
            floors.push({ y0: p.h, y1: above ? p.h + SLAB : wallTop, ...look });
            return;
          }
          const nextY = above ? (above.o === 'down' ? surf(above) : underside(above)) : wallTop;
          if (p.corners) {
            // a smooth ramp: its piece stands on the column (or hangs as a slab over open space)
            const ax = axisOf(p);
            const base = below ? lowY(p) - SLAB : ax ? lowY(p) : lowY(p) - 0.25;
            p.base = base;
            p.onColumn = !below;
            air.push([base, Math.min(nextY, highY(p) + CLEAR)]);
            // (under a wall, a tunnel: its ceiling follows the slope too, CLEAR over the ramp —
            // a stepped ceiling would stop anyone who jumps down the tunnel dead)
            const ceil = highY(p) + CLEAR;
            if (
              ceil < nextY - 0.3 &&
              solid.some(([s0, s1]) => s0 <= ceil + 0.01 && s1 >= ceil + 0.3)
            )
              rampCeilings.push(p);
            p.airTop = Math.min(nextY, p.h + 4);
            smooth.push(p);
            if (!below)
              floors.push({ y0: bottom, y1: base, ...(perCell.has(p) ? look : rampLook(p.c)) });
            return;
          }
          const rise = Math.abs(p.rise ?? 0);
          air.push([p.h - rise / 2, Math.min(nextY, surf(p) + CLEAR + rise)]);
          p.airTop = Math.min(nextY, surf(p) + 4);
          if (p.rise) {
            stairs.push(p);
            p.onColumn = !below;
            if (!below) floors.push({ y0: bottom, y1: p.h - rise / 2, ...look });
            return;
          }
          floors.push({ y0: below ? p.h - SLAB : bottom, y1: p.h, ...look });
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
        segsAt[k] = pal ? merged.flatMap((g) => paintWall(g, x, y)) : merged;
      }
  // equal blocks of neighbouring columns merge into big boxes
  const byKey = new Map<string, number[]>();
  for (let k = 0; k < W * H; k++)
    for (const g of segsAt[k]) {
      const sk = `${g.y0.toFixed(3)}|${g.y1.toFixed(3)}|${g.mat}|${g.color ?? ''}`;
      if (!byKey.has(sk)) byKey.set(sk, []);
      byKey.get(sk)!.push(k);
    }
  for (const [sk, idx] of byKey) {
    const [y0s, y1s, mat, col] = sk.split('|');
    const y0 = Number(y0s);
    const y1 = Number(y1s);
    for (const r of rectangles(idx, W))
      boxes.push({
        c: v3(((r.x0 + r.x1 + 1) / 2) * s, (y0 + y1) / 2, ((r.y0 + r.y1 + 1) / 2) * s),
        h: v3(((r.x1 - r.x0 + 1) / 2) * s, (y1 - y0) / 2, ((r.y1 - r.y0 + 1) / 2) * s),
        mat: mat as Material,
        ...(col ? { color: Number(col) } : {}),
      });
  }
  // smooth ramps: straight runs standing on the ground become one wedge each (cells of the same
  // slope merged into rectangles); anything else gets two triangular columns per cell, their
  // corners shared with the neighbours (so the surface has no lip or seam anywhere)
  const wedgeGroups = new Map<string, { axis: 'x' | 'z'; a: number; b: number; idx: number[] }>();
  const triColumn = (pts: number[][], base: number, look: Look) => {
    // (hull corners: the bottom triangle 0, 1, 4 and the top triangle 2, 3, 5)
    const bot = pts.map(([x, , z]) => v3(x, base, z));
    const tp = pts.map(([x, h, z]) => v3(x, h, z));
    const hull = [bot[0], bot[1], tp[0], tp[1], bot[2], tp[2]];
    const xs = hull.map((p) => p.x);
    const ys = hull.map((p) => p.y);
    const zs = hull.map((p) => p.z);
    const lo = v3(Math.min(...xs), Math.min(...ys), Math.min(...zs));
    const hi = v3(Math.max(...xs), Math.max(...ys), Math.max(...zs));
    boxes.push({
      c: v3((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2),
      h: v3((hi.x - lo.x) / 2, (hi.y - lo.y) / 2, (hi.z - lo.z) / 2),
      hull,
      ...look,
    });
  };
  for (const p of smooth) {
    const look = perCell.has(p) ? cellLook(p) : rampLook(p.c);
    const ax = axisOf(p);
    const k = p.corners!;
    if (ax === 'flat') {
      if (!p.onColumn)
        boxes.push({
          c: v3(cx(p.x), (p.base! + k[0]) / 2, cz(p.y)),
          h: v3(s / 2, Math.abs(k[0] - p.base!) / 2, s / 2),
          ...look,
        });
      continue;
    }
    if (p.onColumn && ax) {
      const b = ax === 'x' ? k[1] - k[0] : k[2] - k[0];
      const a = k[0] - b * (ax === 'x' ? p.x : p.y);
      const gk = `${ax}|${b.toFixed(5)}|${a.toFixed(5)}|${look.mat}|${look.color ?? ''}`;
      if (!wedgeGroups.has(gk)) wedgeGroups.set(gk, { axis: ax, a, b, idx: [] });
      wedgeGroups.get(gk)!.idx.push(p.y * W + p.x);
      continue;
    }
    const x0 = p.x * s;
    const z0 = p.y * s;
    const pts = CORNER_UV.map(([u, v], i) => [x0 + u * s, k[i], z0 + v * s]);
    for (const tri of TRIS[p.diag!])
      triColumn(
        tri.map((i) => pts[i]),
        p.base!,
        look,
      );
  }
  for (const [gk, g] of wedgeGroups) {
    const [, , , mat, col] = gk.split('|');
    const look: Look = { mat: mat as Material, ...(col ? { color: Number(col) } : {}) };
    for (const r of rectangles(g.idx, W)) {
      if (g.axis === 'x')
        boxes.push(
          wedgeRamp(
            'x',
            r.x0 * s,
            (r.x1 + 1) * s,
            g.a + g.b * r.x0,
            g.a + g.b * (r.x1 + 1),
            ((r.y0 + r.y1 + 1) / 2) * s,
            (r.y1 - r.y0 + 1) * s,
            look,
          ),
        );
      else
        boxes.push(
          wedgeRamp(
            'z',
            r.y0 * s,
            (r.y1 + 1) * s,
            g.a + g.b * r.y0,
            g.a + g.b * (r.y1 + 1),
            ((r.x0 + r.x1 + 1) / 2) * s,
            (r.x1 - r.x0 + 1) * s,
            look,
          ),
        );
    }
  }
  // sloped ceilings of ramps in tunnels: from the wall above down to CLEAR over the ramp
  for (const p of rampCeilings) {
    const ceil = highY(p) + CLEAR;
    const wall = segsAt[p.y * W + p.x].find((g) => Math.abs(g.y0 - ceil) < 0.02);
    if (!wall) continue;
    const k = p.corners!;
    const pts = CORNER_UV.map(([u, v], i) => [(p.x + u) * s, k[i] + CLEAR, (p.y + v) * s]);
    for (const tri of TRIS[p.diag!])
      triColumn(
        tri.map((i) => pts[i]),
        ceil + 0.1,
        { mat: wall.mat, ...(wall.color !== undefined ? { color: wall.color } : {}) },
      );
  }
  // stairs (ramps too steep for a slope): sub-steps no higher than STEP; the last one meets the
  // higher neighbour flush
  for (const p of stairs) {
    const rise = p.rise!;
    const steps = stepsOf(rise);
    const x0 = p.x * s;
    const z0 = p.y * s;
    const base = p.h - Math.abs(rise) / 2;
    const look: Look = pal ? rampLook(p.c) : { mat: 'grate', color: colorOf(p.c, p.h) };
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
        ...look,
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
        zoneCells.push({
          c: p.c,
          x: p.x,
          y: p.y,
          y0: lo,
          y1: highY(p) + 0.5,
          g: v3(0, 1, 0),
          pri: 1,
        });
      }
    }

  // ---- sky islands: blocks in the open, each with its own gravity -------------------------
  if (sky) {
    for (const p of cells) {
      const look = floorLook(p.c, p.h);
      const block = (y0: number, y1: number) =>
        boxes.push({
          c: v3(cx(p.x), (y0 + y1) / 2, cz(p.y)),
          h: v3(s / 2, (y1 - y0) / 2, s / 2),
          ...look,
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
        if (!cellAt(p.l, p.x + (west ? -1 : 1), p.y))
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
          const around = DIRS.map(([dx, dy]) => cellAt(l, x + dx, y + dy)).find(Boolean);
          const h = around?.h ?? layer.y;
          boxes.push({ c: v3(cx(x), h + 1, cz(y)), h: v3(s / 2, 2.5, s / 2), mat: 'pillar' });
        }),
      ),
    );
  }
  // zones: cells of one area with the same span merge into rectangles
  const zones: GravityZoneDef[] = [];
  const zoneGroups = new Map<string, { z: ZoneCell; idx: Set<number> }>();
  for (const z of zoneCells) {
    const k = `${z.c}|${z.y0}|${z.y1}|${z.g.x},${z.g.y},${z.g.z}|${z.pri}`;
    if (!zoneGroups.has(k)) zoneGroups.set(k, { z, idx: new Set() });
    zoneGroups.get(k)!.idx.add(z.y * W + z.x);
  }
  for (const { z, idx } of zoneGroups.values())
    for (const r of rectangles([...idx], W)) {
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
      const there = cellsAt[y * W + x];
      if (!there.length) return !bands.some((b) => isSolid(at(b.i, x, y)));
      // (a void over a lower floor: deadly from up here)
      const vl = voidLayerAt(x, y);
      return vl >= 0 && p.l >= vl && there.every((q) => q.l < vl);
    };
    for (const p of cells) {
      if (p.o !== 'up' || p.zg || jumpers.has(p.c)) continue;
      const y0 = lowY(p);
      const y1 = highY(p) + RAIL_H;
      for (const [dx, dy] of DIRS) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        const inside = nx >= 0 && ny >= 0 && nx < W && ny < H;
        if (!open(nx, ny, p) || (inside && flights.has(ny * W + nx))) continue;
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
  else {
    const voids: number[] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (!cellsAt[y * W + x].length && lay.layers.some((_, l) => at(l, x, y) === VOID))
          voids.push(y * W + x);
    if (voids.length)
      for (const r of rectangles(voids, W))
        killVolumes.push({
          min: v3(r.x0 * s, bottom - 20, r.y0 * s),
          max: v3((r.x1 + 1) * s, bottom + 1, (r.y1 + 1) * s),
        });
  }
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
    // facing the map's middle (yawToView: yaw 0 looks toward −z, +90 toward −x)
    const yaw = (x: number, z: number) =>
      (Math.atan2(-(cx(mid[0]) - x), -(cz(mid[1]) - z)) * 180) / Math.PI;
    const picks = near.slice(0, 8);
    for (let i = 0, n = 0; n < 8; i++, n++) {
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
  const siteAreas: { c: string; name: 'A' | 'B' }[] = [];
  for (const [c, a] of Object.entries(lay.legend)) {
    if (a.k !== 'site') continue;
    const r = regionOf(c);
    if (!r.length) continue;
    const xs = r.map((p) => p.x);
    const ys = r.map((p) => p.y);
    const lo = Math.min(...r.map((p) => p.h));
    const hi = Math.max(...r.map((p) => p.h));
    const down = r[0].o === 'down';
    const name = a.n.trim().startsWith('B') ? 'B' : 'A';
    siteAreas.push({ c, name });
    bombSites.push({
      name,
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
      return [{ a, c, r, p: nearestTo(r, mx, my)[0] }];
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

  // ---- props --------------------------------------------------------------------------------
  const propBoxes: BoxDef[] = [];
  const propAreas = new Set<string>();
  /** cells within a cell of a prop: no automatic cover there */
  const nearProp = new Set<Cell>();
  for (const pr of lay.props ?? []) {
    const l = pr.l ?? 0;
    const floor = cellAt(l, Math.floor(pr.x + pr.w / 2), Math.floor(pr.y + pr.d / 2));
    if (!floor || floor.o !== 'up' || floor.zg) {
      say(`prop at ${pr.x},${pr.y} (layer ${l}) stands on no floor: left out`);
      continue;
    }
    propAreas.add(floor.c);
    let y0 = floor.corners ? lowY(floor) : standY(floor);
    // (on per-cell heights: on the highest floor under it, so it never sinks into a tilted one)
    if (perCell.has(floor))
      for (let yy = Math.floor(pr.y); yy < pr.y + pr.d; yy++)
        for (let xx = Math.floor(pr.x); xx < pr.x + pr.w; xx++) {
          const q = cellAt(l, xx, yy);
          if (q && perCell.has(q) && Math.abs(standY(q) - standY(floor)) < SMOOTH_GAP)
            y0 = Math.max(y0, highY(q));
        }
    const x0 = pr.x * s;
    const z0 = pr.y * s;
    const x1 = (pr.x + pr.w) * s;
    const z1 = (pr.y + pr.d) * s;
    const key = `${pr.x},${pr.y},${l}`;
    const blk = (a: number, b: number, c: number, d: number, f: number, t: number, look: Look) =>
      propBoxes.push({
        c: v3((a + c) / 2, (f + t) / 2, (b + d) / 2),
        h: v3((c - a) / 2, (t - f) / 2, (d - b) / 2),
        ...look,
      });
    const kind = pr.kind ?? 'crate';
    if (kind === 'crate')
      blk(x0, z0, x1, z1, y0, y0 + pr.h, {
        mat: pal?.crate.mat ?? 'crate',
        ...(pal ? { color: pick(pal.crate.colors, key) } : {}),
      });
    else if (kind === 'wall')
      blk(x0, z0, x1, z1, y0, y0 + pr.h, {
        mat: pal ? wallMat : 'pillar',
        ...(pal ? { color: pick(pal.wall.lower, floor.c) } : {}),
      });
    else if (kind === 'pillar')
      blk(x0, z0, x1, z1, y0, y0 + pr.h, {
        mat: pal?.pillar.mat ?? 'pillar',
        ...(pal ? { color: pick(pal.pillar.colors, key) } : {}),
      });
    else if (kind === 'barrel')
      blk(x0, z0, x1, z1, y0, y0 + pr.h, {
        mat: 'plate',
        color: pick(pal?.barrel ?? [0x3f6f9f, 0x8f3f2f], key),
      });
    else if (kind === 'car') {
      // a low body and a cabin set in from both ends along the car's length
      const color = pick(pal?.car ?? [0xb0b0b0, 0x7d2f2a, 0x4f6a7a], key);
      const body = pr.h * 0.55;
      blk(x0, z0, x1, z1, y0, y0 + body, { mat: 'plate', color });
      const alongX = x1 - x0 >= z1 - z0;
      const inset = (alongX ? x1 - x0 : z1 - z0) * 0.22;
      const side = (alongX ? z1 - z0 : x1 - x0) * 0.06;
      const cabin: Look = { mat: 'plate', color: shade(color, 0.7) };
      if (alongX) blk(x0 + inset, z0 + side, x1 - inset, z1 - side, y0 + body, y0 + pr.h, cabin);
      else blk(x0 + side, z0 + inset, x1 - side, z1 - inset, y0 + body, y0 + pr.h, cabin);
    } else {
      // stairs: a solid ramp rising along its longer side toward +x / +z
      const alongX = x1 - x0 >= z1 - z0;
      const run = alongX ? x1 - x0 : z1 - z0;
      if (pr.h > Math.tan(Math.PI / 6) * run + 1e-6)
        say(`stairs prop at ${pr.x},${pr.y} is steeper than 30°`);
      const look: Look = pal ? rampLook(floor.c) : { mat: 'floor', color: 0x9a9284 };
      propBoxes.push(
        alongX
          ? wedgeRamp('x', x0, x1, y0, y0 + pr.h, (z0 + z1) / 2, z1 - z0, look)
          : wedgeRamp('z', z0, z1, y0, y0 + pr.h, (x0 + x1) / 2, x1 - x0, look),
      );
    }
    // its cells and the cells next to it get no automatic cover; a waypoint inside it goes
    for (let yy = Math.floor(pr.y) - 1; yy <= Math.ceil(pr.y + pr.d); yy++)
      for (let xx = Math.floor(pr.x) - 1; xx <= Math.ceil(pr.x + pr.w); xx++) {
        const q = cellAt(l, xx, yy);
        if (!q) continue;
        nearProp.add(q);
        const wx = cx(xx);
        const wz = cz(yy);
        if (
          wx > x0 - 0.45 &&
          wx < x1 + 0.45 &&
          wz > z0 - 0.45 &&
          wz < z1 + 0.45 &&
          standY(q) + 1.8 > y0 &&
          standY(q) < y0 + pr.h
        )
          q.noWp = true;
      }
  }

  // cover next: the waypoints must not link through it (areas with props: the props are cover)
  const floorCells: GrayboxFloorCell[] = cells.map((p) => ({
    x: p.x,
    y: p.y,
    l: p.l,
    c: p.c,
    h: standY(p),
    sloped: isRamp(p) || !!p.zg,
    o: p.o,
    ...(nearProp.has(p) || propAreas.has(p.c) ? { noCover: true } : {}),
  }));
  let cover = lay.cover === false ? [] : grayboxCover(lay, floorCells);
  if (pal)
    cover = cover.map((b) => {
      const key = `${Math.round(b.c.x * 2)},${Math.round(b.c.z * 2)}`;
      return b.mat === 'crate'
        ? { ...b, mat: pal.crate.mat, color: pick(pal.crate.colors, key) }
        : { ...b, mat: pal.pillar.mat, color: pick(pal.pillar.colors, key) };
    });
  // (a spatial index of everything a bot can't walk through, for the link checks)
  const blockAt = new Map<number, BoxDef[]>();
  for (const b of [...cover, ...propBoxes]) {
    const r = b.q ? Math.hypot(b.h.x, b.h.z) : 0;
    const bx0 = Math.max(0, Math.floor((b.c.x - (r || b.h.x) - 0.5) / s));
    const bx1 = Math.min(W - 1, Math.floor((b.c.x + (r || b.h.x) + 0.5) / s));
    const bz0 = Math.max(0, Math.floor((b.c.z - (r || b.h.z) - 0.5) / s));
    const bz1 = Math.min(H - 1, Math.floor((b.c.z + (r || b.h.z) + 0.5) / s));
    for (let zz = bz0; zz <= bz1; zz++)
      for (let xx = bx0; xx <= bx1; xx++) {
        const k = zz * W + xx;
        if (!blockAt.has(k)) blockAt.set(k, []);
        blockAt.get(k)!.push(b);
      }
  }
  const cuts = (a: Vec3, b: Vec3) => {
    if (!blockAt.size) return false;
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) / s));
    const x1 = Math.min(W - 1, Math.floor(Math.max(a.x, b.x) / s));
    const z0 = Math.max(0, Math.floor(Math.min(a.z, b.z) / s));
    const z1 = Math.min(H - 1, Math.floor(Math.max(a.z, b.z) / s));
    let list: BoxDef[] | null = null;
    for (let zz = z0; zz <= z1; zz++)
      for (let xx = x0; xx <= x1; xx++) {
        const here = blockAt.get(zz * W + xx);
        if (!here) continue;
        list ??= [];
        for (const q of here) if (!list.includes(q)) list.push(q);
      }
    return !!list && coverCutsLink(list, a, b);
  };

  // ---- waypoints: every floor cell (zero-G: a column of them), linked where a bot can go ---
  const waypoints: WaypointDef[] = [];
  const wpOf = new Map<Cell, number>();
  const columns = new Map<string, Map<number, number>>(); // zero-G column: height → waypoint
  const addWp = (pos: Vec3, name: string) => waypoints.push({ pos, links: [], name }) - 1;
  const link = (a: number, b: number) => {
    if (a !== b && !waypoints[a].links.includes(b)) waypoints[a].links.push(b);
  };
  const wpPos = (p: Cell) => v3(cx(p.x), wpY(p), cz(p.y));
  const wpName = (p: Cell) => `${p.c}${p.l}:${p.x},${p.y}`;
  // a ramp / stair cell's floor height at its edge toward a neighbour (its centre if beside the climb)
  const edgeH = (p: Cell, q: Cell) => {
    if (p.corners) {
      const [nw, ne, sw, se] = p.corners;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      return dx > 0
        ? (ne + se) / 2
        : dx < 0
          ? (nw + sw) / 2
          : dy > 0
            ? (sw + se) / 2
            : dy < 0
              ? (nw + ne) / 2
              : p.h;
    }
    if (!p.rise) return standY(p);
    const toward = p.axis === 'x' ? Math.sign(q.x - p.x) : Math.sign(q.y - p.y);
    return toward ? p.h + (p.rise / 2) * toward : p.h;
  };
  const canGo = (a: Cell, b: Cell) => {
    if (a.o !== b.o) return false;
    // (along a ramp the slope is what counts, not the centres' heights)
    if ((isRamp(a) || isRamp(b)) && a.o !== 'side' && Math.abs(edgeH(b, a) - edgeH(a, b)) <= 0.6)
      return true;
    const up = a.o === 'down' ? standY(a) - standY(b) : standY(b) - standY(a);
    if (up > 2.6 || up < -14) return false;
    // (a drop must not pass through another floor or a wall laid across the way down)
    if (a.o === 'up' && up < -0.6) {
      const from = standY(b) + 0.3;
      const to = standY(a) + 1.7;
      if (segsAt[b.y * W + b.x].some((g) => g.y0 > from && g.y0 < to)) return false;
      // (nor through a ramp or stair flight over it: those are not in the column's segments)
      if (
        cellsAt[b.y * W + b.x].some(
          (r) => r !== b && r.o === 'up' && !r.zg && highY(r) > from && lowY(r) < to,
        )
      )
        return false;
    }
    return true;
  };
  const N = sky ? 1 : Math.max(1, Math.floor(lay.waypointEvery ?? 1));
  const idOf = new Map<Cell, number>();
  cells.forEach((p, i) => idOf.set(p, i));
  const nbrList = cells.map(nbrs);
  /** the ceiling-deck cells right over an upright floor cell (at most TURN_GAP above it) */
  const turnsWith = (p: Cell): Cell[] =>
    sky || p.o !== 'up' || p.zg
      ? []
      : cellsAt[p.y * W + p.x].filter(
          (q) =>
            q.o === 'down' &&
            !q.zg &&
            q.h > standY(p) + 1.9 &&
            q.h - standY(p) <= TURN_GAP &&
            // (nothing laid across the way between them)
            !segsAt[p.y * W + p.x].some((g) => g.y0 > standY(p) + 0.05 && g.y1 < q.h - 0.05),
        );
  if (N === 1) {
    for (const p of cells)
      if (!p.zg && p.o !== 'side' && !p.noWp) wpOf.set(p, addWp(wpPos(p), wpName(p)));
  } else {
    // huge maps: the floor is cut into N × N blocks; the cells of a block that join on one floor
    // share one waypoint (the cell nearest their middle). Neighbouring blocks link where a bot
    // walks straight from one waypoint to the other; where it can't (a turn, a doorway), the
    // cells of the way between get waypoints of their own.
    const parent = new Map<Cell, Cell>();
    const find = (p: Cell): Cell => {
      let r = p;
      while (parent.get(r) !== r) r = parent.get(r)!;
      let q = p;
      while (parent.get(q) !== r) {
        const n = parent.get(q)!;
        parent.set(q, r);
        q = n;
      }
      return r;
    };
    // (cells beside a zero-G area keep a waypoint of their own: the zero-G columns link to them)
    const single = (p: Cell) => nbrs(p).some((q) => !!q.zg) || turnsWith(p).length > 0;
    const blockOf = (p: Cell) => Math.floor(p.y / N) * W + Math.floor(p.x / N);
    const fine = (u: Cell, v: Cell) => canGo(u, v) && !cuts(wpPos(u), wpPos(v));
    for (const p of cells) if (!p.zg && p.o !== 'side' && !p.noWp) parent.set(p, p);
    for (const p of cells) {
      if (!parent.has(p) || single(p)) continue;
      for (const q of nbrs(p)) {
        if (!parent.has(q) || single(q) || blockOf(q) !== blockOf(p)) continue;
        if (!fine(p, q) || !fine(q, p)) continue;
        const a = find(p);
        const b = find(q);
        if (a !== b) parent.set(b, a);
      }
    }
    const members = new Map<Cell, Cell[]>();
    for (const p of cells) {
      if (!parent.has(p)) continue;
      const r = find(p);
      if (!members.has(r)) members.set(r, []);
      members.get(r)!.push(p);
    }
    const repOf = new Map<Cell, Cell>(); // cell → the cell holding its block's waypoint
    const groupOf = new Map<Cell, Cell[]>(); // waypoint cell → its cells
    for (const list of members.values()) {
      const [mx, my] = centroid(list);
      const rep = nearestTo(list, mx, my)[0];
      wpOf.set(rep, addWp(wpPos(rep), wpName(rep)));
      groupOf.set(rep, list);
      for (const p of list) repOf.set(p, rep);
    }
    const ownWp = (p: Cell) => {
      let i = wpOf.get(p);
      if (i === undefined) {
        i = addWp(wpPos(p), wpName(p));
        wpOf.set(p, i);
      }
      return i;
    };
    /** can a bot walk straight from a to b, every cell on the way in `inside`? */
    const straight = (a: Cell, b: Cell, inside: Set<Cell>): boolean => {
      const ax = cx(a.x);
      const az = cz(a.y);
      const dx = cx(b.x) - ax;
      const dz = cz(b.y) - az;
      let u = a;
      let gx = a.x;
      let gz = a.y;
      const sx = dx > 0 ? 1 : -1;
      const sz = dz > 0 ? 1 : -1;
      let nx = dx ? ((dx > 0 ? gx + 1 : gx) * s - ax) / dx : Infinity;
      let nz = dz ? ((dz > 0 ? gz + 1 : gz) * s - az) / dz : Infinity;
      const ddx = dx ? s / Math.abs(dx) : Infinity;
      const ddz = dz ? s / Math.abs(dz) : Infinity;
      const stepTo = (x: number, y: number): Cell | undefined =>
        here0(x, y).find((q) => inside.has(q) && fine(u, q));
      for (let guard = 4 * N + 8; guard > 0; guard--) {
        if (gx === b.x && gz === b.y) return u === b;
        if (Math.abs(nx - nz) < 1e-9) {
          // (through a corner: both cells beside it must be walkable too)
          const v = stepTo(gx + sx, gz);
          if (!v || !stepTo(gx, gz + sz)) return false;
          u = v;
          gx += sx;
          nx += ddx;
          continue;
        }
        if (nx < nz) {
          gx += sx;
          nx += ddx;
        } else {
          gz += sz;
          nz += ddz;
        }
        const v = stepTo(gx, gz);
        if (!v) return false;
        u = v;
      }
      return false;
    };
    const done = new Set<string>();
    for (const p of cells) {
      const A = repOf.get(p);
      if (!A) continue;
      for (const q of nbrs(p)) {
        const B = repOf.get(q);
        if (!B || A === B || !fine(p, q)) continue;
        const k = `${wpOf.get(A)}>${wpOf.get(B)}`;
        if (done.has(k)) continue;
        done.add(k);
        const inside = new Set([...groupOf.get(A)!, ...groupOf.get(B)!]);
        if (straight(A, B, inside)) {
          link(wpOf.get(A)!, wpOf.get(B)!);
          continue;
        }
        // (no straight walk: waypoints along the way between, cell by cell)
        const prev = new Map<Cell, Cell | null>([[A, null]]);
        const queue = [A];
        for (let qi = 0; qi < queue.length && !prev.has(B); qi++) {
          const u = queue[qi];
          for (const v of nbrs(u))
            if (inside.has(v) && !prev.has(v) && fine(u, v)) {
              prev.set(v, u);
              queue.push(v);
            }
        }
        if (!prev.has(B)) continue;
        const path: Cell[] = [];
        for (let v: Cell | null = B; v; v = prev.get(v) ?? null) path.unshift(v);
        for (let i = 1; i < path.length; i++) link(ownWp(path[i - 1]), ownWp(path[i]));
      }
    }
  }
  const yKey = (y: number) => Number(y.toFixed(3));
  const zgHeights = new Map<string, Set<number>>();
  for (const p of cells) {
    if (!p.zg || !columnCell(p)) continue;
    // at its neighbours' waypoint heights, and every ZERO_G_STEP metres up
    // (the neighbours' heights are the same for every column of the area: worked out once)
    let around = zgHeights.get(p.c);
    if (!around) {
      around = new Set<number>();
      for (const q of regionOf(p.c))
        for (const n of nbrs(q)) if (wpOf.has(n)) around.add(yKey(wpY(n)));
      zgHeights.set(p.c, around);
    }
    const hs = new Set<number>(around);
    const yTop = p.zg.top === p.zg.hi ? p.zg.hi - 1 : p.zg.hi + 1;
    for (let y = p.zg.lo + 1; y < yTop; y += ZERO_G_STEP) hs.add(yKey(y));
    hs.add(yKey(yTop));
    const col = new Map<number, number>();
    const ys = [...hs].filter((y) => y >= p.zg!.lo + 0.9 && y <= yTop + 0.01).sort((a, b) => a - b);
    for (const y of ys) col.set(y, addWp(v3(cx(p.x), y, cz(p.y)), `${p.c}:${p.x},${p.y}@${y}`));
    // (not through another floor laid across the column)
    const between = (a: number, b: number) =>
      cellsAt[p.y * W + p.x].some(
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
  // turn corridors (Antipode): an upright floor with a ceiling deck right over it (the ceiling's
  // gravity reaches down to the floor): a bot gets from one to the other there, both ways
  for (const p of cells) {
    const i = wpOf.get(p);
    if (i === undefined) continue;
    for (const q of turnsWith(p)) {
      const j = wpOf.get(q);
      if (j === undefined) continue;
      link(i, j);
      link(j, i);
    }
  }
  for (const p of cells) {
    if (p.o === 'side') continue;
    for (const q of nbrList[idOf.get(p)!]) {
      if (q.o === 'side') continue;
      const cp = p.zg ? columnOf(p) : undefined;
      const cq = q.zg ? columnOf(q) : undefined;
      if (!p.zg && !q.zg) {
        if (N > 1) continue; // (linked block by block above)
        if (sky && p.c !== q.c) continue; // (islands meet only through jumps)
        const wa = wpOf.get(p);
        const wb = wpOf.get(q);
        if (wa === undefined || wb === undefined) continue;
        if (canGo(p, q) && !cuts(waypoints[wa].pos, waypoints[wb].pos)) link(wa, wb);
      } else if (cp && cq) {
        for (const [y, i] of cp) {
          const j = cq.get(y);
          if (j !== undefined) link(i, j);
        }
      } else if (cp && !q.zg) {
        const i = cp.get(yKey(wpY(q)));
        const j = wpOf.get(q);
        if (i !== undefined && j !== undefined) {
          link(i, j);
          link(j, i);
        }
      }
    }
  }

  // suction tubes: a waypoint in the tube's mouth, linked both ways with its cell's waypoint, and
  // one way on to the landing cell's waypoint (the tube pulls the bot up and throws it there)
  const nearestWp = (cell: Cell, pos: Vec3) => {
    const own = wpOf.get(cell);
    if (own !== undefined) return own;
    let best = -1;
    let bestD = Infinity;
    waypoints.forEach((w, i) => {
      const d = Math.hypot(w.pos.x - pos.x, (w.pos.y - pos.y) * 2, w.pos.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return bestD <= s * (N + 1) ? best : -1;
  };
  for (const { a, b, base, land } of tubeEnds) {
    const from = nearestWp(a, v3(base.x, base.y + 1, base.z));
    const to = nearestWp(b, v3(land.x, land.y + 1, land.z));
    if (from < 0 || to < 0) {
      say(`tube ${a.c} → ${b.c}: no waypoint at its ${from < 0 ? 'mouth' : 'landing'}`);
      continue;
    }
    const mouth = addWp(v3(base.x, base.y + 1, base.z), `tube:${wpName(a)}`);
    link(from, mouth);
    link(mouth, from);
    link(mouth, to);
  }

  // ---- door frames, painted signs ----------------------------------------------------------
  const decor: BoxDef[] = [];
  const wallCovers = (x: number, y: number, y0: number, y1: number) =>
    x >= 0 &&
    y >= 0 &&
    x < W &&
    y < H &&
    segsAt[y * W + x].some((g) => g.y0 <= y0 + 0.01 && g.y1 >= y1 - 0.01);
  /** a wall cell standing from the floor at f up to door height (down: from a ceiling at f down) */
  const isWallAt = (l: number, x: number, y: number, f: number, o: GrayboxOrientation = 'up') =>
    x >= 0 &&
    y >= 0 &&
    x < W &&
    y < H &&
    !cellAt(l, x, y) &&
    bands.some((b) => isSolid(at(b.i, x, y))) &&
    (o === 'down' ? wallCovers(x, y, f - DOOR_H, f) : wallCovers(x, y, f, f + DOOR_H));
  /** where a sign or door frame starts from: the highest point of an upright floor (a ceiling: its lowest) */
  const floorY = (p: Cell) =>
    p.o === 'down' ? (p.corners ? lowY(p) : p.h) : p.corners ? highY(p) : standY(p);
  // door frames (themes): a strip on the wall face at both sides of every doorway between areas
  if (pal && !sky) {
    const jamb = (xm: number, zm: number, nx: number, nz: number, f: number, color: number) =>
      decor.push({
        c: v3(xm + nx * 0.0065, f + DOOR_H / 2, zm + nz * 0.0065),
        h: v3(nx ? 0.0035 : 0.2, DOOR_H / 2, nz ? 0.0035 : 0.2),
        mat: pal.door.mat,
        color,
        noCollide: true,
      });
    for (const p of cells) {
      if (p.o !== 'up' || p.zg) continue;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        const q = cellAt(p.l, p.x + dx, p.y + dy);
        if (!q || q.c === p.c || q.zg || q.o !== 'up') continue;
        if (Math.abs(floorY(p) - floorY(q)) > 0.6) continue;
        const f = Math.max(floorY(p), floorY(q));
        const color = pick(pal.door.colors, [p.c, q.c].sort().join(''));
        // the line between p and q, and the wall cells at either end of it (on both sides)
        for (const side of [-1, 1]) {
          const [ox, oy] = dx ? [0, side] : [side, 0];
          if (!isWallAt(p.l, p.x + ox, p.y + oy, f) || !isWallAt(p.l, q.x + ox, q.y + oy, f))
            continue;
          // (the strips stand on the walls' faces toward the doorway, beside the line)
          if (dx) {
            const zf = side < 0 ? p.y * s : (p.y + 1) * s;
            const lineX = (p.x + 1) * s;
            jamb(lineX - 0.2, zf, 0, -oy, f, color);
            jamb(lineX + 0.2, zf, 0, -oy, f, color);
          } else {
            const xf = side < 0 ? p.x * s : (p.x + 1) * s;
            const lineZ = (p.y + 1) * s;
            jamb(xf, lineZ - 0.2, -ox, 0, f, color);
            jamb(xf, lineZ + 0.2, -ox, 0, f, color);
          }
        }
      }
    }
  }
  const signColor = pal?.sign ?? 0xf2f2ea;
  const FACE: Record<GrayboxSign['face'], [number, number]> = {
    n: [0, -1],
    s: [0, 1],
    e: [1, 0],
    w: [-1, 0],
  };
  const usedFaces = new Set<string>();
  /** paint `text` on the wall cell (wx, wy), on its face toward the floor cell `fl` next to it */
  const paint = (wx: number, wy: number, fl: Cell, text: string): boolean => {
    const dx = fl.x - wx;
    const dy = fl.y - wy;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
    const fk = `${wx},${wy},${fl.l},${dx},${dy}`;
    if (usedFaces.has(fk)) return false;
    const f = floorY(fl);
    // (a ceiling walker stands upside down: "up" for the reader is down in the world, and the
    // reader's right is the other way along the wall)
    const flip = fl.o === 'down' ? -1 : 1;
    const lines = text.split('\n');
    let px = lines.length > 1 ? SIGN_PX2 : SIGN_PX;
    const tall = textHeightPx(lines.length) * px;
    // the text's bottom edge as the reader sees it, and its span in the world
    const y0 = f + flip * Math.max(0.3, SIGN_MID - tall / 2);
    const [s0, s1] = flip > 0 ? [y0, y0 + tall] : [y0 - tall, y0];
    if (!isWallAt(fl.l, wx, wy, f, fl.o) || !wallCovers(wx, wy, s0, s1)) return false;
    // the wall runs on along the reader's right and left: how far (it may hold a long text)
    const right: [number, number] = [-dy * flip, dx * flip];
    const runOf = (dir: number) => {
      let n = 0;
      for (let i = 1; i <= 4; i++) {
        const ax = wx + right[0] * dir * i;
        const ay = wy + right[1] * dir * i;
        const fc = cellAt(fl.l, ax + dx, ay + dy);
        if (!fc || fc.o !== fl.o || Math.abs(floorY(fc) - f) > 0.6) break;
        if (!isWallAt(fl.l, ax, ay, f, fl.o) || !wallCovers(ax, ay, s0, s1)) break;
        n++;
      }
      return n;
    };
    const rn = runOf(1);
    const ln = runOf(-1);
    const widest = Math.max(...lines.map(textWidthPx));
    const room = (rn + ln + 1) * s - 0.4;
    if (widest * px > room) px = Math.max(SIGN_PX2 * 0.98, room / widest);
    const half = (widest * px) / 2;
    // (centred on this cell's face, moved along the wall only as far as it must to fit)
    const lo = -(ln + 0.5) * s + 0.2;
    const hi = (rn + 0.5) * s - 0.2;
    const off = Math.min(Math.max(0, lo + half), hi - half);
    // the face: the line between the wall cell and the floor cell
    const fx = dx > 0 ? (wx + 1) * s : dx < 0 ? wx * s : cx(wx);
    const fz = dy > 0 ? (wy + 1) * s : dy < 0 ? wy * s : cz(wy);
    const centre = v3(fx + right[0] * off, y0, fz + right[1] * off);
    decor.push(
      ...paintText(
        text,
        centre,
        v3(right[0], 0, right[1]),
        v3(dx, 0, dy),
        px,
        signColor,
        0.018,
        flip,
      ),
    );
    usedFaces.add(fk);
    return true;
  };
  for (const sg of lay.signs ?? []) {
    const l = sg.l ?? 0;
    const [dx, dy] = FACE[sg.face];
    const upper = sg.text.toUpperCase();
    const text = [...upper].map((ch) => (ch === '\n' || hasGlyph(ch) ? ch : ' ')).join('');
    if (text !== upper) say(`sign "${sg.text}": characters the font has not got are left blank`);
    // (x, y) is the wall cell; the sign is read from its neighbour in direction `face`
    const fl = cellAt(l, sg.x + dx, sg.y + dy);
    let ok = !cellAt(l, sg.x, sg.y) && !!fl && paint(sg.x, sg.y, fl, text);
    // (a sign placed a cell off: the nearest wall face within 4 cells that has a floor in front,
    // the same facing first)
    for (let r = 1; !ok && r <= 4; r++)
      for (const face of [sg.face, ...(['n', 's', 'e', 'w'] as const).filter((q) => q !== sg.face)])
        for (let oy = -r; !ok && oy <= r; oy++)
          for (let ox = -r; !ok && ox <= r; ox++) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
            const [fx2, fy2] = FACE[face];
            const wx = sg.x + ox;
            const wy = sg.y + oy;
            const f2 = cellAt(l, wx + fx2, wy + fy2);
            if (!cellAt(l, wx, wy) && f2) ok = paint(wx, wy, f2, text);
          }
    if (!ok)
      say(
        `sign "${sg.text}" at ${sg.x},${sg.y} (${sg.face}): no wall there with a floor on its ${sg.face} side`,
      );
  }
  // automatic signs: where you walk into a junction, the wall ahead says which way A and B are
  // (along the shortest walk), one sign per wall face
  if (lay.autoSigns !== false && !sky && siteAreas.length) {
    const ids = idOf;
    const preds: number[][] = cells.map(() => []);
    const succ: Cell[][] = cells.map(() => []);
    for (const p of cells) {
      if (p.o === 'side' || p.zg) continue;
      for (const q of nbrList[ids.get(p)!])
        if (!q.zg && q.o !== 'side' && canGo(p, q)) {
          preds[ids.get(q)!].push(ids.get(p)!);
          succ[ids.get(p)!].push(q);
        }
    }
    const distTo = siteAreas.map(({ c, name }) => {
      const d = new Int32Array(cells.length).fill(-1);
      const q: number[] = [];
      for (const p of regionOf(c)) {
        d[ids.get(p)!] = 0;
        q.push(ids.get(p)!);
      }
      for (let qi = 0; qi < q.length; qi++)
        for (const j of preds[q[qi]])
          if (d[j] < 0) {
            d[j] = d[q[qi]] + 1;
            q.push(j);
          }
      return { name, d };
    });
    const around = new Map<string, Set<string>>();
    for (const p of cells)
      for (const q of succ[ids.get(p)!])
        if (q.c !== p.c) {
          if (!around.has(p.c)) around.set(p.c, new Set());
          around.get(p.c)!.add(q.c);
          if (!around.has(q.c)) around.set(q.c, new Set());
          around.get(q.c)!.add(p.c);
        }
    const spawnish = (c: string) => ['cyan', 'orange'].includes(area(c).k);
    let made = 0;
    for (const [Y, ns] of [...around].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
      const kind = area(Y).k;
      if (kind === 'site' || spawnish(Y) || isZeroG(area(Y))) continue;
      if (ns.size < 3 && ![...ns].some(spawnish)) continue; // (not a junction)
      for (const X of [...ns].sort()) {
        if (made >= MAX_AUTO_SIGNS) break;
        // the middle of the way in from X
        const entries: [Cell, Cell][] = [];
        for (const p of regionOf(X))
          for (const q of succ[ids.get(p)!])
            if (q.c === Y && (q.x !== p.x || q.y !== p.y)) entries.push([p, q]);
        if (!entries.length) continue;
        entries.sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x || a[1].l - b[1].l);
        const [p, q] = entries[Math.floor(entries.length / 2)];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        // walk on into Y to the wall ahead
        let r = q;
        for (let i = 0; i < 6; i++) {
          const n = cellAt(r.l, r.x + dx, r.y + dy);
          if (!n || n.c !== Y) break;
          r = n;
        }
        const lines: string[] = [];
        for (const { name, d } of distTo) {
          if (d[ids.get(q)!] <= 0) continue;
          // follow the shortest walk a few cells: which way does it turn?
          let cur = q;
          let back = false;
          for (let i = 0; i < 6; i++) {
            const dc = d[ids.get(cur)!];
            if (dc <= 0) break;
            const nx = succ[ids.get(cur)!].find((v) => d[ids.get(v)!] === dc - 1);
            if (!nx) break;
            if (i < 2 && nx.c === X) back = true;
            cur = nx;
          }
          if (back) continue;
          const ux = cur.x - q.x;
          const uy = cur.y - q.y;
          // (the reader's right: mirrored for a ceiling walker)
          const side = (ux * -dy + uy * dx) * (r.o === 'down' ? -1 : 1);
          const fwd = ux * dx + uy * dy;
          const arrow =
            Math.abs(side) >= Math.max(1, Math.abs(fwd) * 0.5) ? (side > 0 ? '→' : '←') : '↑';
          lines.push(arrow === '←' ? `← ${name}` : `${name} ${arrow}`);
        }
        if (!lines.length) continue;
        if (paint(r.x + dx, r.y + dy, r, lines.join('\n'))) made++;
      }
    }
  }

  // ---- launch pads: an arc that clears the walls -------------------------------------------
  if (padPlans.length) {
    const lv = buildLevel({
      name: lay.name,
      boundsMin: v3(-1, bottom - 1, -1),
      boundsMax: v3(W * s + 1, wallTop + 2, H * s + 1),
      defaultGravity: v3(0, -1, 0),
      boxes: [...boxes, ...cover, ...propBoxes],
      zones: [],
      rails: [],
      pads: [],
      spawns: [],
      towers: [],
    });
    for (const { a, b, px, pz, half } of padPlans) {
      const dx = cx(b.x) - px;
      const dz = cz(b.y) - pz;
      const y0 = standY(a);
      const dh = standY(b) - y0;
      const clearAt = (T: number) => {
        const vy = (dh + 0.5 * G * T * T) / T;
        for (let i = 2; i <= 18; i++) {
          const t = (T * i) / 20;
          const c = v3(px + (dx * i) / 20, y0 + vy * t - 0.5 * G * t * t + 0.9, pz + (dz * i) / 20);
          if (capsuleOverlaps(lv, { center: c, up: v3(0, 1, 0), halfSeg: 0.45, radius: 0.35 }))
            return false;
        }
        return true;
      };
      const T0 = Math.min(1.6, Math.max(0.7, Math.hypot(dx, dz) / 14));
      let T = T0;
      while (!clearAt(T) && T < 2.4) T += 0.1;
      if (!clearAt(T)) {
        // (no pad whose arc hits something: use a tube there, it cuts its own way)
        say(`pad ${a.c} → ${b.c}: its arc hits a wall or ceiling (cell ${a.x},${a.y}): left out`);
        continue;
      }
      launchPads.push({
        min: v3(px - half, y0, pz - half),
        max: v3(px + half, y0 + 0.6, pz + half),
        vel: v3(dx / T, (dh + 0.5 * G * T * T) / T, dz / T),
        // (fires when the body touches the plate, not only when its centre is inside)
        touch: true,
      });
    }
  }

  // ---- size walls --------------------------------------------------------------------------
  // (only for 1v1 / 2v2: 3v3 and bigger play the full map, so a key of 3 or more counts as 2)
  const sizeWalls: SizeWallDef[] = [];
  const bySize = new Map<number, Set<string>>();
  for (const [n, closed] of Object.entries(lay.sizes ?? {})) {
    const m = Math.min(Number(n), 2);
    if (!bySize.has(m)) bySize.set(m, new Set());
    for (const c of closed) bySize.get(m)!.add(c);
  }
  const sizes = [...bySize].sort((a, b) => b[0] - a[0]);
  const already = new Set<string>();
  for (const [maxTeamSize, closedSet] of sizes) {
    const fresh = [...closedSet].filter((c) => !already.has(c));
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
          const y0 = lowY(p) - 0.2;
          const lid = segsAt[p.y * W + p.x].find((g) => g.y0 > standY(p) + 1);
          field(p, y0, lid ? lid.y0 : wallTop);
        }
      }
    if (wallBoxes.length) sizeWalls.push({ maxTeamSize, boxes: wallBoxes });
  }

  // ---- sky, fog and light (themes) ----------------------------------------------------------
  const lights = pal
    ? themeLights(
        pal,
        named
          .filter(({ p }) => p.o === 'up' && !p.zg)
          .map(({ r, p }) => ({
            x: cx(p.x),
            y:
              standY(p) + Math.min(3, Math.max(1.5, (p.airTop ?? standY(p) + 4) - standY(p) - 0.6)),
            z: cz(p.y),
            size: Math.sqrt(r.length) * s,
          })),
      )
    : [];

  const m = sky ? 30 : 0;
  return {
    name: lay.name,
    boundsMin: v3(-m, bottom - (sky ? 20 : 1), -m),
    boundsMax: v3(W * s + m, wallTop + (sky ? 20 : 1), H * s + m),
    defaultGravity: v3(0, -1, 0),
    boxes: [...boxes, ...cover, ...propBoxes, ...decor],
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
    ...(liftTubes.length ? { liftTubes } : {}),
    ...(killVolumes.length ? { killVolumes } : {}),
    ...(sizeWalls.length ? { sizeWalls } : {}),
    ...(lay.skyJetpack ? { skyJetpack: true } : {}),
    ...(pal?.outdoor ? { outdoor: pal.outdoor } : {}),
    ...(pal?.fog ? { fog: pal.fog } : {}),
    ...(lights.length ? { lights } : {}),
    ambient: pal?.ambient ?? 1,
  };
};
