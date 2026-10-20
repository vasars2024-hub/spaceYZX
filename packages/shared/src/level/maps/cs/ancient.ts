// Ancient (CS2's de_ancient), rebuilt as a graybox at about 3× its horizontal size (our players
// sprint 9 m/s and have a dash and a jetpack, so a CS-sized map would be over in seconds).
//
// SCALE: the layout is drawn on a grid of 64 × 64 CS units per cell (1 unit = 1 inch = 0.0254 m),
// laid out as on the CS radar, with corridors and sites about as many cells wide as in CS. SCALE
// (one number) turns a cell into metres: at SCALE 3 a cell is 4.88 m, so the 62 × 56 cell grid is
// 302 × 273 m. Change SCALE and the whole map grows or shrinks (the grid stays the same). Heights
// are in metres (CS height differences × about 1.5); every slope is a smooth ramp (straight run,
// gentle: the steepest is 9°).
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
/** CS units per grid cell (the layout below is drawn in these cells) */
const CELL_UNITS = 64;
/** metres per grid cell: 64 CS units (inches) × SCALE */
const CELL_M = CELL_UNITS * 0.0254 * SCALE;
/** the grid: 62 × 56 cells (west → east, north → south) */
const GRID_W = 62;
const GRID_H = 56;

// ---- a small painter: rectangles of cells → the tile grid ------------------------------------
/** an area's rectangle: cells x0 ≤ x < x1, z0 ≤ z < z1 (z: rows, north → south) */
type Rect = [c: string, x0: number, z0: number, x1: number, z1: number];
/** paints the rectangles in order (later ones over earlier ones) onto solid wall ('.') */
const paint = (rects: Rect[]): string[] => {
  const g = Array.from({ length: GRID_H }, () => Array<string>(GRID_W).fill('.'));
  for (const [c, x0, z0, x1, z1] of rects)
    for (let y = z0; y < z1; y++) for (let x = x0; x < x1; x++) g[y][x] = c;
  return g.map((r) => r.join(''));
};
type Face = 'n' | 'e' | 's' | 'w';
const COMPASS: Face[] = ['n', 'e', 's', 'w'];
const STEP: Record<Face, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
/** a prop by its corners in cells (fractions allowed), h metres tall */
const prop = (
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  h: number,
  kind: GrayboxProp['kind'],
): GrayboxProp => ({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, h, kind });
/**
 * A painted sign: standing at cell (x, z) and looking `wall`-ward, on the first wall there.
 * `toward`: the compass way the sign points; the arrow is worked out from the way you look.
 */
const signOn =
  (rows: string[]) =>
  (x: number, z: number, wall: Face, label: string, toward?: Face): GrayboxSign => {
    let cx = Math.floor(x);
    let cy = Math.floor(z);
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

// ---- the layout (cells of 64 CS units) ---------------------------------------------------------
const GROUND: Rect[] = [
  // CT side
  ['C', 36, 4, 46, 10], // CT Spawn
  ['p', 25, 5, 34, 10], // Temple
  ['p', 34, 6, 36, 8], // (Temple ↔ CT door)
  ['p', 21, 8, 25, 10], // (Temple ↔ A door)
  ['k', 37, 10, 41, 15], // CT Mid
  ['u', 48, 4, 57, 9], // Ruins
  ['u', 46, 5, 48, 7], // (Ruins ↔ CT door)
  // A
  ['A', 8, 8, 21, 20], // A Site
  ['e', 9, 21, 19, 25], // Elbow
  ['e', 14, 20, 19, 21], // (Elbow ↔ A Site opening)
  ['R', 9, 25, 13, 30], // A Main Ramp
  ['a', 9, 30, 13, 48], // A Main
  ['a', 9, 48, 23, 52], // A Main (leg from T)
  ['a', 23, 49, 25, 51], // (A Main ↔ T door)
  // Donut
  ['E', 21, 15, 23, 18], // Donut Ramp (A side)
  ['d', 23, 13, 27, 19], // Donut
  ['D', 27, 15, 31, 18], // Donut Entrance (mid side)
  // Mid
  ['o', 31, 15, 41, 22], // Top Mid
  ['m', 32, 22, 40, 26], // Mid
  ['w', 31, 26, 40, 34], // Water
  ['t', 33, 34, 37, 40], // T Ramp
  ['r', 31, 40, 37, 45], // Red Room
  ['r', 33, 45, 35, 47], // (Red Room ↔ T door)
  // T
  ['T', 25, 47, 38, 54], // T Spawn
  // B
  ['l', 40, 48, 57, 52], // Lane
  ['l', 38, 49, 40, 51], // (Lane ↔ T door)
  ['g', 53, 37, 57, 48], // B Ramp
  ['b', 53, 27, 57, 37], // B Main
  ['L', 53, 22, 57, 27], // B Long
  ['v', 40, 28, 51, 32], // Cave
  ['S', 48, 22, 51, 28], // B Short
  ['B', 47, 11, 60, 22], // B Site
  ['P', 51, 9, 55, 11], // B Pillar
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
    // A Site: Triple (three boxes in a row), the default box, a broken wall, a statue
    prop(11, 13, 12.5, 14.5, 1.4, 'crate'),
    prop(12.5, 13, 14, 14.5, 2.4, 'crate'),
    prop(14, 13, 15.5, 14.5, 1.4, 'crate'),
    prop(17, 10, 18.8, 11.8, 2.4, 'crate'),
    prop(18, 15, 18.8, 17.5, 1.6, 'wall'),
    prop(9, 9, 10, 10, 6, 'pillar'),
    // Elbow: a statue at the turn
    prop(9.2, 21.2, 10.2, 22.2, 4, 'pillar'),
    // Temple: two rows of columns
    prop(27, 5.4, 27.8, 6.2, 6, 'pillar'),
    prop(31, 5.4, 31.8, 6.2, 6, 'pillar'),
    prop(27, 8.6, 27.8, 9.4, 6, 'pillar'),
    prop(31, 8.6, 31.8, 9.4, 6, 'pillar'),
    // Donut: the pillar in the middle of the round room
    prop(24.2, 15.2, 25.8, 16.8, 6, 'pillar'),
    // Top Mid: the low wall and a box
    prop(33, 18, 36, 18.6, 1.4, 'wall'),
    prop(38.5, 19.5, 39.8, 20.8, 1.6, 'crate'),
    // Water: rocks in the shallow water
    prop(32, 27.5, 33.3, 28.7, 1.2, 'crate'),
    prop(37, 31, 38.3, 32.2, 1.6, 'crate'),
    // Cave: a fallen block
    prop(44, 28.2, 45.3, 29.2, 1.4, 'crate'),
    // B Site: the big pillar, boxes
    prop(54, 14, 56, 16, 6, 'pillar'),
    prop(48.3, 17.5, 49.8, 19, 1.6, 'crate'),
    prop(57, 12, 58.5, 13.5, 2.4, 'crate'),
    prop(57.5, 19, 59, 20.3, 1.4, 'crate'),
    // B Main: a box half way up
    prop(55.7, 30, 56.9, 31.2, 1.6, 'crate'),
    // Lane: a low wall
    prop(45, 48.2, 46.5, 49, 1.4, 'wall'),
    // CT Spawn: statues; Ruins: broken columns
    prop(37, 4.4, 38, 5.4, 5, 'pillar'),
    prop(44, 4.4, 45, 5.4, 5, 'pillar'),
    prop(50, 5, 51.2, 6.2, 2.4, 'pillar'),
    prop(55.5, 5, 56.6, 6.4, 1.4, 'wall'),
    // T Spawn: the statue, a few boxes
    prop(30.5, 51, 31.7, 52.2, 5, 'pillar'),
    prop(26, 52.2, 27.5, 53.6, 1.6, 'crate'),
    prop(35, 51.5, 36.5, 52.8, 1.6, 'crate'),
  ],
  signs: [
    sign(26, 52, 'w', 'A', 'w'),
    sign(31, 47.5, 'n', 'MID', 'e'),
    sign(37, 52, 'e', 'B', 'e'),
    sign(12, 50, 'w', 'A', 'n'),
    sign(10, 38, 'w', 'A', 'n'),
    sign(16, 23, 's', 'A SITE', 'n'),
    sign(32, 42, 'n', 'MID', 'e'),
    sign(38, 33, 'e', 'CAVE', 'n'),
    sign(33, 15.5, 'n', 'DONUT', 'w'),
    sign(36, 15.5, 'n', 'CT', 'e'),
    sign(24, 13.5, 'n', 'A', 'w'),
    sign(46, 30, 's', 'B', 'e'),
    sign(50, 50, 's', 'B', 'e'),
    sign(55, 42, 'e', 'B', 'n'),
    sign(55, 24, 'e', 'B SITE', 'n'),
    sign(38, 4.5, 'n', 'A', 'w'),
    sign(43, 4.5, 'n', 'B', 'e'),
    sign(41, 9.5, 's', 'MID', 'w'),
    sign(29, 5.5, 'n', 'TEMPLE'),
    sign(52, 4.5, 'n', 'RUINS'),
  ],
};

export const buildAncient = (): LevelDef => buildGraybox(ANCIENT_LAYOUT);
