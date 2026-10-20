// Ancient (CS2's de_ancient), rebuilt as a graybox at about 3× its horizontal size (our players
// sprint 9 m/s and have a dash and a jetpack, so a CS-sized map would be over in seconds).
//
// SCALE: every position below is written in CS units (1 unit = 1 inch = 0.0254 m) as read off the
// CS radar, then multiplied by SCALE. Change SCALE (one number) and the whole map grows or shrinks;
// (test/cs-maps-3.test.ts checks no wall rounds away after a change.)
// CELL_M is the grid cell size. At SCALE 3 and 6 m cells: 4350 × 4150 units → 331 × 316 m,
// 55 × 53 cells (6 m cells keep the bots' waypoint graph small enough to search fast; walls
// between rooms are at least one cell). Heights are in metres (CS height differences × about
// 1.5), every slope is a smooth ramp (straight run, gentle: the steepest is 14°).
//
// Orientation as on the CS radar: north (row 0) = CT side, south = T side, A in the west, B east.
// Callouts (legend names):
//   T Spawn (orange, attackers) — south middle
//   Red Room → T Ramp (down) → Water (shallow, the low middle) → Mid (up) → Top Mid → CT Mid → CT
//   Top Mid → Donut Entrance → Donut (round room, pillar in the middle) → Donut Ramp → A Site
//   T Spawn → A Main (west, then north) → A Main Ramp → Elbow → A Site (Triple boxes on it)
//   CT Spawn → Temple → A Site
//   T Spawn → Lane (east) → B Ramp → B Main → B Long → B Site
//   Water → Cave → B Short (up) → B Site
//   CT Spawn → Ruins → B Pillar (steps by the big pillar) → B Site
//   CT Spawn (cyan, defenders) — north middle, raised like the real one
// No gravity areas, no pads or tubes needed: everything is walked.
import type { LevelDef } from '../../types';
import {
  buildGraybox,
  type GrayboxLayout,
  type GrayboxProp,
  type GrayboxSign,
} from '../../graybox';

/** our map = SCALE × the CS map's horizontal size */
const SCALE = 3;
/** metres per grid cell */
const CELL_M = 6;
const M_PER_UNIT = 0.0254 * SCALE;
/** the map's size in CS units (x: west → east, z: north → south) */
const MAP_W = 4350;
const MAP_H = 4150;

// ---- a small painter: rectangles in CS units → the tile grid ---------------------------------
const cellOf = (u: number) => Math.round((u * M_PER_UNIT) / CELL_M);
const cellF = (u: number) => (u * M_PER_UNIT) / CELL_M;
type Rect = [c: string, x0: number, z0: number, x1: number, z1: number];
/** paints the rectangles in order (later ones over earlier ones) onto solid wall ('.') */
const paint = (rects: Rect[]): string[] => {
  const g = Array.from({ length: cellOf(MAP_H) }, () => Array<string>(cellOf(MAP_W)).fill('.'));
  for (const [c, x0, z0, x1, z1] of rects)
    for (let y = cellOf(z0); y < cellOf(z1); y++)
      for (let x = cellOf(x0); x < cellOf(x1); x++) g[y][x] = c;
  return g.map((r) => r.join(''));
};
type Face = 'n' | 'e' | 's' | 'w';
const COMPASS: Face[] = ['n', 'e', 's', 'w'];
const STEP: Record<Face, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
/** a prop by its corners in CS units, h metres tall */
const prop = (
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  h: number,
  kind: GrayboxProp['kind'],
): GrayboxProp => ({
  x: cellF(x0),
  y: cellF(z0),
  w: cellF(x1 - x0),
  d: cellF(z1 - z0),
  h,
  kind,
});
/**
 * A painted sign: standing at (x, z) (CS units) and looking `wall`-ward, on the first wall there.
 * `toward`: the compass way the sign points; the arrow is worked out from the way you look.
 */
const signOn =
  (rows: string[]) =>
  (x: number, z: number, wall: Face, label: string, toward?: Face): GrayboxSign => {
    let cx = Math.floor(cellF(x));
    let cy = Math.floor(cellF(z));
    const [dx, dy] = STEP[wall];
    for (;;) {
      const c = rows[cy + dy]?.[cx + dx];
      if (c === undefined) throw new Error(`Ancient: no wall for sign "${label}"`);
      if (c === '.') break;
      cx += dx;
      cy += dy;
    }
    const turn = toward ? (COMPASS.indexOf(toward) - COMPASS.indexOf(wall) + 4) % 4 : -1;
    const text =
      turn === 0
        ? `${label} ↑`
        : turn === 1
          ? `${label} →`
          : turn === 2
            ? `${label} ↓`
            : turn === 3
              ? `← ${label}`
              : label;
    return { x: cx + dx, y: cy + dy, face: COMPASS[(COMPASS.indexOf(wall) + 2) % 4], text };
  };

// ---- the layout (CS units) ---------------------------------------------------------------------
const GROUND: Rect[] = [
  // CT side
  ['C', 2300, 200, 3100, 800], // CT Spawn
  ['p', 1500, 380, 2200, 800], // Temple
  ['p', 2200, 500, 2300, 680], // (Temple ↔ CT door)
  ['p', 1420, 500, 1500, 650], // (Temple ↔ A door)
  ['k', 2350, 800, 2650, 1050], // CT Mid
  ['u', 3150, 250, 3750, 750], // Ruins
  ['u', 3100, 350, 3150, 600], // (Ruins ↔ CT door)
  // A
  ['A', 400, 450, 1420, 1550], // A Site
  ['e', 450, 1650, 1250, 2000], // Elbow
  ['e', 850, 1550, 1250, 1650], // (Elbow ↔ A Site opening)
  ['R', 500, 2000, 850, 2450], // A Main Ramp
  ['a', 500, 2450, 850, 3500], // A Main
  ['a', 500, 3500, 1420, 3850], // A Main (leg from T)
  ['a', 1420, 3550, 1500, 3800], // (A Main ↔ T door)
  // Donut
  ['E', 1420, 1200, 1580, 1450], // Donut Ramp (A side)
  ['d', 1580, 1100, 1850, 1550], // Donut
  ['D', 1850, 1200, 1950, 1450], // Donut Entrance (mid side)
  // Mid
  ['o', 1950, 1050, 2650, 1650], // Top Mid
  ['m', 2000, 1650, 2600, 1950], // Mid
  ['w', 1950, 1950, 2650, 2650], // Water
  ['t', 2050, 2650, 2350, 3000], // T Ramp
  ['r', 1950, 3000, 2450, 3380], // Red Room
  ['r', 2100, 3380, 2300, 3450], // (Red Room ↔ T door)
  // T
  ['T', 1500, 3450, 2700, 4050], // T Spawn
  // B
  ['l', 2780, 3350, 3950, 3750], // Lane
  ['l', 2700, 3500, 2780, 3700], // (Lane ↔ T door)
  ['g', 3550, 2900, 3950, 3350], // B Ramp
  ['b', 3550, 2300, 3950, 2900], // B Main
  ['L', 3550, 1850, 3950, 2300], // B Long
  ['v', 2650, 2150, 3400, 2450], // Cave
  ['S', 3150, 1850, 3400, 2150], // B Short
  ['B', 3150, 850, 4200, 1850], // B Site
  ['P', 3350, 750, 3650, 850], // B Pillar
];

const rows = paint(GROUND);
const sign = signOn(rows);

export const ANCIENT_LAYOUT: GrayboxLayout = {
  name: 'Ancient',
  cellM: CELL_M,
  theme: 'jungle',
  layers: [{ name: 'Ground', y: 0, rows }],
  legend: {
    C: { n: 'CT Spawn', k: 'cyan', h: 3, s: 'CT' },
    T: { n: 'T Spawn', k: 'orange', h: 0, s: 'T' },
    A: { n: 'A Site', k: 'site', h: 3 },
    B: { n: 'B Site', k: 'site', h: 1.5 },
    p: { n: 'Temple', k: 'room', h: 3 },
    k: { n: 'CT Mid', k: 'ramp', r: [0, 3], dir: 'n' },
    u: { n: 'Ruins', k: 'room', h: 3 },
    P: { n: 'B Pillar', k: 'ramp', r: [1.5, 3], dir: 'n', s: 'Pillar' },
    e: { n: 'Elbow', k: 'room', h: 3 },
    R: { n: 'A Main Ramp', k: 'ramp', r: [0, 3], dir: 'n' },
    a: { n: 'A Main', k: 'room', h: 0 },
    E: { n: 'Donut Ramp', k: 'ramp', r: [1.5, 3], dir: 'w' },
    d: { n: 'Donut', k: 'room', h: 1.5 },
    D: { n: 'Donut Entrance', k: 'ramp', r: [0, 1.5], dir: 'w' },
    o: { n: 'Top Mid', k: 'room', h: 0 },
    m: { n: 'Mid', k: 'ramp', r: [-2, 0], dir: 'n' },
    w: { n: 'Water', k: 'room', h: -2 },
    t: { n: 'T Ramp', k: 'ramp', r: [-2, 0], dir: 's' },
    r: { n: 'Red Room', k: 'room', h: 0 },
    l: { n: 'Lane', k: 'room', h: 0 },
    g: { n: 'B Ramp', k: 'ramp', r: [0, 1.5], dir: 'n' },
    b: { n: 'B Main', k: 'room', h: 1.5 },
    L: { n: 'B Long', k: 'room', h: 1.5, s: 'Long' },
    v: { n: 'Cave', k: 'room', h: -2 },
    S: { n: 'B Short', k: 'ramp', r: [-2, 1.5], dir: 'n', s: 'Short' },
  },
  // the hand-placed cover below is the map's cover (no automatic crates)
  cover: false,
  props: [
    // A Site: Triple (three boxes in a row), the default box, a broken wall by Donut
    prop(600, 1150, 740, 1260, 1.4, 'crate'),
    prop(740, 1150, 880, 1260, 2.4, 'crate'),
    prop(880, 1150, 1020, 1260, 1.4, 'crate'),
    prop(1000, 750, 1150, 880, 2.4, 'crate'),
    prop(1200, 1300, 1260, 1480, 1.6, 'wall'),
    prop(500, 600, 580, 680, 6, 'pillar'),
    // Elbow: a statue at the turn
    prop(520, 1720, 600, 1800, 4, 'pillar'),
    // Temple: two rows of columns
    prop(1650, 470, 1720, 540, 6, 'pillar'),
    prop(1900, 470, 1970, 540, 6, 'pillar'),
    prop(1650, 640, 1720, 710, 6, 'pillar'),
    prop(1900, 640, 1970, 710, 6, 'pillar'),
    // Donut: the pillar in the middle of the round room
    prop(1660, 1260, 1770, 1390, 6, 'pillar'),
    // Top Mid: the low wall and a box
    prop(2150, 1250, 2350, 1310, 1.4, 'wall'),
    prop(2480, 1450, 2580, 1550, 1.6, 'crate'),
    // Water: rocks in the shallow water
    prop(2050, 2100, 2160, 2200, 1.2, 'crate'),
    prop(2450, 2400, 2560, 2500, 1.6, 'crate'),
    // Cave: a fallen block
    prop(2850, 2180, 2950, 2260, 1.4, 'crate'),
    // B Site: the big pillar, boxes
    prop(3700, 1150, 3850, 1300, 6, 'pillar'),
    prop(3300, 1400, 3440, 1520, 1.6, 'crate'),
    prop(3950, 1000, 4090, 1120, 2.4, 'crate'),
    prop(3900, 1600, 4040, 1720, 1.4, 'crate'),
    // B Main: a box half way up
    prop(3830, 2450, 3930, 2550, 1.6, 'crate'),
    // Lane: low walls
    prop(3150, 3400, 3250, 3480, 1.4, 'wall'),
    // CT Spawn: statues; Ruins: broken columns
    prop(2500, 300, 2580, 380, 5, 'pillar'),
    prop(2850, 300, 2930, 380, 5, 'pillar'),
    prop(3350, 400, 3450, 500, 2.4, 'pillar'),
    prop(3550, 550, 3640, 640, 1.4, 'wall'),
    // T Spawn: the statue, a few boxes
    prop(2050, 3850, 2150, 3950, 5, 'pillar'),
    prop(1650, 3550, 1780, 3660, 1.6, 'crate'),
    prop(2500, 3850, 2630, 3960, 1.6, 'crate'),
  ],
  signs: [
    sign(1700, 3700, 'w', 'A', 'w'),
    sign(2200, 3500, 'n', 'MID'),
    sign(2550, 3600, 'e', 'B', 'e'),
    sign(900, 3700, 'w', 'A', 'n'),
    sign(700, 2600, 'w', 'A', 'n'),
    sign(900, 1800, 's', 'A SITE', 'n'),
    sign(2200, 3200, 'n', 'MID', 'n'),
    sign(2300, 2300, 'e', 'CAVE', 'e'),
    sign(2000, 1350, 'w', 'DONUT', 'w'),
    sign(2300, 1100, 'n', 'CT', 'n'),
    sign(1700, 1150, 'n', 'A', 'w'),
    sign(3000, 2300, 's', 'B', 'e'),
    sign(3300, 3550, 's', 'B', 'e'),
    sign(3750, 3100, 'e', 'B', 'n'),
    sign(3750, 2000, 'e', 'B SITE', 'n'),
    sign(2700, 600, 'w', 'A', 'w'),
    sign(2700, 600, 'e', 'B', 'e'),
    sign(2500, 750, 's', 'MID', 's'),
    sign(1850, 600, 'n', 'TEMPLE'),
    sign(3450, 300, 'n', 'RUINS'),
  ],
};

export const buildAncient = (): LevelDef => buildGraybox(ANCIENT_LAYOUT);
