// Cache (the CS2 / CS:GO map de_cache), rebuilt as a graybox about 3× its real size: our players
// are much faster than CS players (sprint 9 m/s, dash, jetpack), so every distance and every
// corridor width is scaled up the same way. Heights keep the CS differences, × 1.5 at most.
//
// Scale: CS units → metres (1 unit = 0.0254 m), then × CACHE_SCALE (3) horizontally. The layout
// below is written in real CS units (about 3700 × 3400 of them); a grid cell is 64 units (4.88 m at
// 3×: few enough cells for the bots' route search), so changing CACHE_SCALE rescales the whole map.
// Result: 58 × 53 cells of 4.88 m = 283 × 258 m, 1401 floor cells (bot waypoints).
//
// North is up (row 0). T spawn in the west, CT spawn in the east, A in the north, B in the
// south, Mid between them running west → east. Callouts:
//   T side   T Spawn, A Main (long hall north then east), T Mid, B Main (south then east),
//            T Connector (T Mid → B Main)
//   A        Forklift (A Main exit), A Site with the Truck, Quad (stacked boxes by Squeaky),
//            Highway (the boxes on the east side), CT (the passage A → CT spawn)
//   Mid      Mid, Squeaky Hall → Squeaky (the door into Quad), White Box (end of mid),
//            Z Connector (White Box → CT / A), Garage (White Box → CT spawn / Checkers),
//            Boost (the ledge on the south side of mid), Vents (Boost → B site)
//   B        B Site, Headshot (raised ledge by the B Main exit), Heaven (raised ledge over the
//            site, stairs from Checkers), Checkers (B → Garage), Sun Room (B → CT spawn)
//   CT       CT Spawn
// Bomb: T spawn = Orange (attackers), CT spawn = Cyan (defenders).
// Cache has no ladders, so it has no suction tubes; every route is walked.
import type { LevelDef } from '../../types';
import {
  buildGraybox,
  type GrayboxArea,
  type GrayboxLayout,
  type GrayboxProp,
  type GrayboxSign,
} from '../../graybox';

/** How much bigger than the real CS map (horizontally). The one number to change the scale. */
export const CACHE_SCALE = 3;
/** Real CS height differences × this (the owner's rule: 1.5 at most). */
const V_SCALE = 1.5;
/** One CS unit in metres. */
const UNIT_M = 0.0254;
/** CS units per grid cell (64: about 4.9 m at 3×; keeps the bots' waypoint count low). */
const UNITS_PER_CELL = 64;
/** Metres per grid cell. */
const CELL_M = UNITS_PER_CELL * UNIT_M * CACHE_SCALE;
/** The map's corner (CS units, as written below) and its extent from there (west → east, north → south). */
const X0 = 100;
const Y0 = 250;
const W_U = 3700;
const H_U = 3400;

/** CS units → grid cells. */
const cell = (u: number) => Math.round(u / UNITS_PER_CELL);
/** CS units of height → metres in our map. */
const hu = (u: number) => Math.round(u * UNIT_M * V_SCALE * 100) / 100;

/** An area rectangle in CS units: [legend char, west, north, east, south]. Later ones win. */
type Rect = [c: string, x0: number, y0: number, x1: number, y1: number];

const paint = (rects: Rect[]): string[] => {
  const grid = Array.from({ length: cell(H_U) }, () => Array<string>(cell(W_U)).fill('.'));
  for (const [c, x0, y0, x1, y1] of rects)
    for (let y = cell(y0 - Y0); y < cell(y1 - Y0); y++)
      for (let x = cell(x0 - X0); x < cell(x1 - X0); x++) grid[y][x] = c;
  return grid.map((r) => r.join(''));
};

/** A prop in CS units (corner to corner), `h` metres tall (props keep human-size heights). */
const prop = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  h: number,
  kind: GrayboxProp['kind'],
): GrayboxProp => {
  const k = 1 / UNITS_PER_CELL;
  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    x: r((x0 - X0) * k),
    y: r((y0 - Y0) * k),
    w: r((x1 - x0) * k),
    d: r((y1 - y0) * k),
    h,
    kind,
  };
};

type Dir = 'n' | 's' | 'e' | 'w';
const STEP: Record<Dir, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const BACK: Record<Dir, Dir> = { n: 's', s: 'n', e: 'w', w: 'e' };
const RIGHT: Record<Dir, Dir> = { n: 'e', e: 's', s: 'w', w: 'n' };

const H_T = hu(48); // T spawn stands a little higher than the middle of the map
const H_BOOST = hu(32); // Boost ledge and the vent duct
const H_HEADSHOT = hu(30); // the Headshot ledge (vaulted onto)
const H_HEAVEN = hu(96); // B Heaven

const legend: Record<string, GrayboxArea> = {
  O: { n: 'T Spawn', k: 'orange', h: H_T },
  m: { n: 'A Main', k: 'room', h: 0 },
  a: { n: 'A Main Ramp', k: 'ramp', r: [0, H_T], dir: 's', s: 'A Main' },
  f: { n: 'Forklift', k: 'room', h: 0 },
  A: { n: 'A Site', k: 'site', h: 0 },
  u: { n: 'Quad', k: 'room', h: 0 },
  h: { n: 'Highway', k: 'room', h: 0 },
  C: { n: 'CT', k: 'room', h: 0 },
  t: { n: 'T Mid', k: 'ramp', r: [0, H_T], dir: 'w' },
  M: { n: 'Mid', k: 'room', h: 0 },
  q: { n: 'Squeaky Hall', k: 'room', h: 0, s: 'Squeaky' },
  Q: { n: 'Squeaky', k: 'room', h: 0 },
  w: { n: 'White Box', k: 'room', h: 0 },
  z: { n: 'Z Connector', k: 'room', h: 0, s: 'Z' },
  g: { n: 'Garage', k: 'room', h: 0 },
  x: { n: 'Boost', k: 'room', h: H_BOOST },
  v: { n: 'Vents', k: 'room', h: H_BOOST },
  T: { n: 'T Connector', k: 'room', h: 0, s: 'T Con' },
  c: { n: 'B Main Ramp', k: 'ramp', r: [0, H_T], dir: 'n', s: 'B Main' },
  b: { n: 'B Main', k: 'room', h: 0 },
  B: { n: 'B Site', k: 'site', h: 0 },
  s: { n: 'Headshot', k: 'room', h: H_HEADSHOT },
  e: { n: 'Heaven', k: 'room', h: H_HEAVEN },
  E: { n: 'Heaven Stairs', k: 'ramp', r: [0, H_HEAVEN], dir: 's', s: 'Heaven' },
  k: { n: 'Checkers', k: 'room', h: 0 },
  r: { n: 'Sun Room', k: 'room', h: 0 },
  Y: { n: 'CT Spawn', k: 'cyan', h: 0 },
};

const rows = paint([
  // ---- T side
  ['O', 300, 1550, 850, 2250],
  ['m', 450, 400, 1950, 650], // A Main, the long east-west part
  ['m', 450, 650, 750, 1200], // A Main, north out of T spawn
  ['a', 450, 1200, 750, 1550],
  ['t', 850, 1760, 1300, 1960],
  ['c', 450, 2250, 750, 2600],
  ['b', 450, 2600, 750, 2800],
  ['b', 450, 2800, 1950, 3030],
  ['T', 1350, 1960, 1550, 2800],
  // ---- A
  ['A', 1950, 300, 2950, 1150],
  ['f', 1950, 300, 2250, 700],
  ['u', 1950, 900, 2300, 1150],
  ['h', 2950, 300, 3300, 1150],
  ['C', 3100, 1150, 3420, 1500],
  // ---- Mid
  ['M', 1300, 1760, 2650, 1960],
  ['q', 1500, 1100, 1700, 1760],
  ['Q', 1700, 1000, 1950, 1150],
  ['w', 2650, 1700, 3000, 2050],
  ['z', 2700, 1330, 2850, 1760],
  ['z', 2700, 1330, 3100, 1470],
  ['g', 3000, 1750, 3400, 2300],
  ['x', 2250, 1960, 2550, 2150],
  ['v', 2400, 2150, 2520, 2800],
  // ---- B
  ['B', 1950, 2800, 2800, 3550],
  ['s', 1950, 3250, 2250, 3550],
  ['k', 2650, 2620, 3250, 2800],
  ['k', 3050, 2300, 3250, 2800],
  ['e', 2800, 2850, 3050, 3200],
  ['E', 3050, 2800, 3250, 3200],
  ['r', 2800, 3300, 3350, 3550],
  ['r', 3350, 2600, 3550, 3550],
  // ---- CT
  ['Y', 3400, 1400, 3750, 2600],
]);

/**
 * A painted sign for a reader standing at (x, y) (CS units) and looking `wall`-ward: it goes on
 * the first wall that way, on the face toward the reader. `toward`: the way the arrow points on
 * the map, drawn → or ← as the reader facing the wall sees it.
 */
const sign = (x: number, y: number, wall: Dir, label: string, toward?: Dir): GrayboxSign => {
  const [dx, dy] = STEP[wall];
  const k = 1 / UNITS_PER_CELL;
  let cx = Math.floor((x - X0) * k);
  let cy = Math.floor((y - Y0) * k);
  // (a spot right at a wall's edge may fall into the wall cell: step back out of it)
  for (let i = 0; i < 3 && rows[cy]?.[cx] === '.'; i++) {
    cx -= dx;
    cy -= dy;
  }
  if (rows[cy]?.[cx] === '.') throw new Error(`Cache: sign "${label}" stands in a wall`);
  while ((rows[cy + dy]?.[cx + dx] ?? '.') !== '.') {
    cx += dx;
    cy += dy;
  }
  const text = !toward
    ? label
    : toward === RIGHT[wall]
      ? `${label} →`
      : toward === BACK[RIGHT[wall]]
        ? `← ${label}`
        : label;
  return { x: cx + dx, y: cy + dy, face: BACK[wall], text };
};

const props: GrayboxProp[] = [
  // A site: the Truck in the middle, the Forklift at the A Main exit, the Quad stack
  prop(2380, 620, 2520, 1000, 3.2, 'car'),
  prop(2020, 430, 2120, 580, 2.2, 'car'),
  prop(2020, 960, 2120, 1060, 2.4, 'crate'),
  prop(2120, 960, 2220, 1060, 2.4, 'crate'),
  prop(2020, 1060, 2120, 1120, 1.2, 'crate'),
  // A default boxes and the Highway boxes
  prop(2700, 420, 2830, 520, 1.6, 'crate'),
  prop(2800, 980, 2900, 1080, 1.2, 'crate'),
  prop(3080, 450, 3220, 590, 2.4, 'crate'),
  prop(3150, 760, 3250, 900, 1.6, 'crate'),
  prop(3100, 1000, 3200, 1100, 1.2, 'crate'),
  // A Main and Mid
  prop(1150, 420, 1250, 520, 1.6, 'crate'),
  prop(1800, 1880, 1950, 1960, 1.2, 'wall'),
  // the White Box at the end of mid, the car in Garage
  prop(2760, 1780, 2900, 1920, 2.4, 'crate'),
  prop(3120, 1900, 3240, 2120, 1.6, 'car'),
  // B site boxes, the Headshot box, Checkers and Sun Room cover
  prop(2320, 3050, 2460, 3190, 1.6, 'crate'),
  prop(2460, 3080, 2560, 3180, 1.2, 'crate'),
  prop(2500, 3380, 2640, 3520, 2.4, 'crate'),
  prop(2040, 3330, 2140, 3430, 1.2, 'crate'),
  prop(2900, 2640, 3000, 2720, 1.2, 'crate'),
  prop(2950, 3330, 3090, 3470, 1.6, 'crate'),
  // B Main and CT spawn
  prop(1300, 2830, 1420, 2950, 1.6, 'crate'),
  prop(3600, 1900, 3740, 2040, 1.6, 'crate'),
];

const signs: GrayboxSign[] = [
  // T spawn: which way to each site
  sign(870, 1550, 'e', 'A MAIN', 'n'),
  sign(870, 2200, 'e', 'B', 's'),
  // A Main and Squeaky into A, the sites
  sign(1850, 400, 'n', 'A', 'e'),
  sign(1600, 1680, 'w', 'A', 'n'),
  sign(2600, 320, 'n', 'A SITE'),
  sign(2400, 3580, 's', 'B SITE'),
  // Mid
  sign(1400, 1780, 'n', 'SQUEAKY', 'e'),
  sign(2000, 1980, 's', 'MID'),
  sign(2300, 2100, 's', 'VENTS', 'e'),
  sign(2950, 1720, 'n', 'Z', 'w'),
  sign(2950, 2030, 's', 'GARAGE', 'e'),
  // B
  sign(1850, 2780, 'n', 'B', 'e'),
  sign(1500, 2100, 'e', 'B', 's'),
  sign(2700, 2620, 'n', 'GARAGE', 'e'),
  sign(3450, 3580, 's', 'SUN ROOM'),
  // CT spawn
  sign(3600, 1380, 'n', 'A', 'w'),
  sign(3600, 2580, 's', 'B', 'w'),
];

export const CACHE_LAYOUT: GrayboxLayout = {
  name: 'Cache',
  cellM: CELL_M,
  layers: [{ name: 'Cache', y: 0, rows }],
  legend,
  theme: 'industrial',
  cover: false,
  props,
  signs,
};

export const buildCache = (): LevelDef => buildGraybox(CACHE_LAYOUT);
