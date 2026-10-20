// Train (the CS2 / CS:GO map de_train), rebuilt as a graybox about 3× its real size: our players
// are much faster than CS players (sprint 9 m/s, dash, jetpack), so every distance and every
// corridor width is scaled up the same way. Heights keep the CS differences, × 1.5 at most.
//
// Scale: CS units → metres (1 unit = 0.0254 m), then × TRAIN_SCALE (3) horizontally. The layout
// below is written in real CS units (about 4150 × 3100 of them); a grid cell is 64 units (4.88 m at
// 3×: few enough cells for the bots' route search), so changing TRAIN_SCALE rescales the whole map.
// Result: 65 × 48 cells of 4.88 m = 317 × 234 m, 1492 floor cells (bot waypoints).
//
// North is up (row 0). T spawn in the west, CT spawn in the east; A (the big train yard, the
// "outer" / old bomb site) in the north, B (the "inner" / new site) in the south-east. Callouts:
//   T side   T Spawn, Ivy (north, then east into the yard), T Main → A Main, Popdog (A Main →
//            T Connector), T Connector (Popdog → Upper B Halls), B Halls (the hall out of
//            T spawn), Upper B Halls (one floor up), Lower B Halls
//   A        A Yard with the train cars in rows (the Ivy row, the bomb train row through the
//            A Site, the Main row),
//            Ivy Trains, El Box (the electrical box by A Main), Z (south-east corner), Hell
//            (under Heaven), Heaven (the catwalk over Hell, one floor up), Ladder Room (A → CT,
//            with a suction tube up to Heaven instead of the ladder, and stairs for the bots),
//            Connector (Z → B)
//   B        B Site with its two cars, Upper B (the balcony where Upper B Halls come out)
//   CT       CT Spawn (to Ladder Room), CT B (the hall down to B)
// The trains are long props (car-sized blocks 3.5 m tall) standing in rows with gaps between
// them, the cover of the map. Bomb: T spawn = Orange (attackers), CT spawn = Cyan (defenders).
import type { LevelDef } from '../../types';
import {
  buildGraybox,
  type GrayboxArea,
  type GrayboxLayout,
  type GrayboxProp,
  type GrayboxSign,
} from '../../graybox';

/** How much bigger than the real CS map (horizontally). The one number to change the scale. */
export const TRAIN_SCALE = 3;
/** Real CS height differences × this (the owner's rule: 1.5 at most). */
const V_SCALE = 1.5;
/** One CS unit in metres. */
const UNIT_M = 0.0254;
/** CS units per grid cell (64: about 4.9 m at 3×; keeps the bots' waypoint count low). */
const UNITS_PER_CELL = 64;
/** Metres per grid cell. */
const CELL_M = UNITS_PER_CELL * UNIT_M * TRAIN_SCALE;
/** The map's corner (CS units, as written below) and its extent from there. */
const X0 = 50;
const Y0 = 200;
const W_U = 4150;
const H_U = 3100;

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

/** A train car lying east-west: 3.5 m tall, about 30 m long and 7.5 m wide at this scale. */
const car = (x0: number, y0: number, len = 400): GrayboxProp =>
  prop(x0, y0, x0 + len, y0 + 100, 3.5, 'car');

type Dir = 'n' | 's' | 'e' | 'w';
const STEP: Record<Dir, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const BACK: Record<Dir, Dir> = { n: 's', s: 'n', e: 'w', w: 'e' };
const RIGHT: Record<Dir, Dir> = { n: 'e', e: 's', s: 'w', w: 'n' };

const H_UP = hu(128); // one floor up: Heaven, Upper B Halls, Upper B

const legend: Record<string, GrayboxArea> = {
  O: { n: 'T Spawn', k: 'orange', h: 0 },
  i: { n: 'Ivy', k: 'room', h: 0 },
  m: { n: 'T Main', k: 'room', h: 0 },
  M: { n: 'A Main', k: 'room', h: 0 },
  P: { n: 'Popdog', k: 'room', h: 0 },
  c: { n: 'T Connector', k: 'ramp', r: [0, H_UP], dir: 's', s: 'T Con' },
  b: { n: 'B Halls', k: 'room', h: 0 },
  U: { n: 'Upper B Ramp', k: 'ramp', r: [0, H_UP], dir: 'e', s: 'Upper B' },
  u: { n: 'Upper B Halls', k: 'room', h: H_UP, s: 'Upper B' },
  l: { n: 'Lower B Halls', k: 'room', h: 0, s: 'Lower B' },
  y: { n: 'A Yard', k: 'room', h: 0, s: 'Yard' },
  A: { n: 'A Site', k: 'site', h: 0 },
  n: { n: 'Ivy Trains', k: 'room', h: 0, s: 'Ivy' },
  e: { n: 'El Box', k: 'room', h: 0 },
  Z: { n: 'Z', k: 'room', h: 0 },
  h: { n: 'Hell', k: 'room', h: 0 },
  H: { n: 'Heaven', k: 'room', h: H_UP },
  L: { n: 'Ladder Room', k: 'room', h: 0, s: 'Ladder' },
  R: { n: 'Heaven Stairs', k: 'ramp', r: [0, H_UP], dir: 'n', s: 'Ladder' },
  C: { n: 'Connector', k: 'room', h: 0, s: 'Con' },
  B: { n: 'B Site', k: 'site', h: 0 },
  X: { n: 'Upper B', k: 'room', h: H_UP },
  Y: { n: 'CT Spawn', k: 'cyan', h: 0 },
  k: { n: 'CT B', k: 'room', h: 0 },
};

const ground = paint([
  // ---- T side
  ['O', 150, 1550, 650, 2550],
  ['i', 300, 300, 500, 1550],
  ['i', 300, 300, 1450, 500],
  ['m', 650, 1700, 1100, 1950],
  ['M', 1050, 1300, 1450, 1750],
  ['P', 1250, 1750, 1450, 2100],
  ['P', 1250, 2100, 2050, 2300],
  ['c', 1850, 2300, 2050, 2500],
  ['b', 650, 2400, 950, 3150],
  ['U', 950, 2500, 1400, 2700],
  ['u', 1400, 2500, 2800, 2700],
  ['l', 950, 2950, 2800, 3150],
  // ---- A: the train yard
  ['y', 1450, 300, 3100, 1550],
  ['n', 1450, 300, 2900, 600],
  ['A', 1800, 700, 2700, 1200],
  ['e', 1450, 1150, 1800, 1550],
  ['Z', 2700, 1300, 3300, 1550],
  ['h', 2900, 300, 3100, 1050],
  ['R', 3100, 350, 3350, 900],
  ['L', 3100, 900, 3700, 1250],
  ['C', 3100, 1550, 3300, 2450],
  // ---- B
  ['B', 2800, 2450, 3600, 3150],
  ['X', 2800, 2450, 3050, 2700],
  // ---- CT
  ['Y', 3700, 950, 4100, 1750],
  ['k', 3600, 1750, 3780, 2700],
]);
/** Heaven: the catwalk over Hell, one floor up (an overlay: '.' there is nothing, not wall). */
const upper = paint([['H', 2900, 300, 3100, 1050]]);

const rows = ground;

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
  if (rows[cy]?.[cx] === '.') throw new Error(`Train: sign "${label}" stands in a wall`);
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
  // A: the Ivy row of cars, the bomb train row through the site, the Main row by El Box / Z
  car(1500, 380),
  car(2000, 380),
  car(2500, 380, 350),
  car(1850, 900),
  car(2350, 900, 300),
  car(1850, 1300),
  car(2350, 1300, 250),
  // the El Box, boxes by Z and in Hell
  prop(1550, 1300, 1650, 1400, 2.0, 'wall'),
  prop(2850, 1400, 2950, 1500, 1.6, 'crate'),
  prop(2950, 800, 3050, 900, 1.2, 'crate'),
  // a car along Ivy
  car(700, 330),
  // B: two cars and boxes
  car(3100, 2750),
  car(2900, 3000),
  prop(3450, 2980, 3550, 3080, 1.6, 'crate'),
  prop(2850, 2750, 2950, 2850, 1.2, 'crate'),
  // halls and CT spawn
  prop(750, 2900, 850, 3000, 1.6, 'crate'),
  prop(3850, 1300, 3950, 1400, 1.6, 'crate'),
];

const signs: GrayboxSign[] = [
  // T spawn: which way to each site
  sign(400, 1600, 'w', 'IVY', 'n'),
  sign(600, 1600, 'n', 'A MAIN', 'e'),
  sign(600, 2500, 's', 'B', 'e'),
  // Ivy, A Main, Popdog into A
  sign(1350, 350, 'n', 'A', 'e'),
  sign(1400, 1350, 'n', 'A', 'e'),
  sign(1400, 2250, 's', 'POPDOG'),
  sign(1950, 2350, 'e', 'UPPER B', 's'),
  sign(2300, 350, 'n', 'A SITE'),
  // B halls
  sign(1100, 2550, 'n', 'UPPER B', 'e'),
  sign(1100, 3080, 's', 'LOWER B', 'e'),
  sign(3300, 3100, 's', 'B SITE'),
  // A side toward CT and B
  sign(3200, 1600, 'w', 'CONNECTOR'),
  sign(3400, 1200, 's', 'CT', 'e'),
  sign(3200, 950, 'n', 'HEAVEN'),
  // CT spawn
  sign(3900, 1000, 'n', 'A', 'w'),
  sign(3700, 2650, 's', 'B', 'w'),
];

export const TRAIN_LAYOUT: GrayboxLayout = {
  name: 'Train',
  cellM: CELL_M,
  layers: [
    { name: 'Yard', y: 0, rows: ground },
    { name: 'Heaven (one floor up)', y: H_UP, rows: upper, overlay: true },
  ],
  legend,
  // the ladder from Ladder Room up to Heaven: a suction tube (no ladders in our game)
  links: [['L', 'H', 'tube', true]],
  theme: 'industrial',
  cover: false,
  props,
  signs,
};

export const buildTrain = (): LevelDef => buildGraybox(TRAIN_LAYOUT);
