// Anubis (CS2's de_anubis), rebuilt as a graybox at about 3× its horizontal size (our players
// sprint 9 m/s and have a dash and a jetpack, so a CS-sized map would be over in seconds).
//
// SCALE: the layout is drawn on a grid of 64 × 64 CS units per cell (1 unit = 1 inch = 0.0254 m),
// laid out as on the CS radar, with corridors and sites about as many cells wide as in CS. SCALE
// (one number) turns a cell into metres: at SCALE 3 a cell is 4.88 m, so the 61 × 58 cell grid is
// 297 × 283 m. Change SCALE and the whole map grows or shrinks (the grid stays the same). Heights
// are in metres (CS height differences × about 1.5); every slope is a smooth ramp (straight run,
// gentle: the steepest is 15°, the B Heaven stairs).
//
// Orientation: north (row 0) = CT side, south = T side, B in the west, A in the east.
// Callouts (legend names):
//   T Spawn (orange, attackers) — south middle
//   T Spawn → Mid → Canal Stairs (down) → Canal (shallow water) → Water → Water Stairs → CT Spawn
//   Bridge: over the Water, joins Camera (west) and Connector (east) — you can drop into the Water
//   Connector → Walkway Steps → Walkway (raised ledge along A) → A Site
//   T Spawn → Street (east) → A Main → A Main Stairs → A Site (Pillars on it)
//   Street → Palace Stairs → Palace (indoor, raised) → A Site
//   CT Spawn → A CT → A Site; A CT → Heaven Ramp → A Heaven (overlooks A) → Heaven Stairs → A Site
//   T Spawn → B Main (west, then north) → B Site (the big Pillar in the middle)
//   Water → B Connector (up) → B Site
//   CT Spawn → B CT → Camera → Camera Steps → B Site
//   CT Spawn → Ruins → Ruins Steps → B Site; Ruins → B Heaven Stairs → B Heaven (overlooks B)
//   CT Spawn (cyan, defenders) — north middle
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
/** the grid: 61 × 58 cells (west → east, north → south) */
const GRID_W = 61;
const GRID_H = 58;

// ---- a small painter: rectangles of cells → the tile grid ------------------------------------
/** an area's rectangle: cells x0 ≤ x < x1, z0 ≤ z < z1 (z: rows, north → south) */
type Rect = [c: string, x0: number, z0: number, x1: number, z1: number];
/** paints the rectangles in order (later ones over earlier ones) onto `fill` (wall or nothing) */
const paint = (rects: Rect[], fill = '.'): string[] => {
  const g = Array.from({ length: GRID_H }, () => Array<string>(GRID_W).fill(fill));
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
      if (c === undefined) throw new Error(`Anubis: no wall for sign "${label}"`);
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
  ['C', 27, 4, 38, 9], // CT Spawn
  ['Q', 31, 9, 35, 13], // Water Stairs
  ['x', 27, 9, 30, 17], // B CT
  ['X', 38, 5, 50, 8], // A CT
  ['X', 48, 8, 51, 16], // A CT (down to the site)
  ['J', 50, 5, 55, 8], // Heaven Ramp
  ['h', 55, 5, 59, 16], // A Heaven
  ['u', 5, 5, 15, 10], // Ruins
  ['u', 15, 5, 27, 8], // Ruins (path to CT)
  ['v', 9, 10, 13, 16], // Ruins Steps
  ['k', 17, 8, 21, 10], // B Heaven Stairs
  ['H', 16, 10, 21, 16], // B Heaven
  // mid
  ['W', 31, 13, 35, 28], // Water
  ['w', 31, 28, 35, 40], // Canal
  ['q', 31, 40, 35, 44], // Canal Stairs
  ['m', 29, 44, 37, 48], // Mid
  ['m', 32, 48, 34, 49], // (Mid ↔ T door)
  ['c', 25, 17, 31, 23], // Camera
  ['j', 21, 19, 25, 22], // Camera Steps
  ['o', 35, 19, 41, 22], // Connector
  ['K', 41, 19, 44, 22], // Walkway Steps
  // B
  ['B', 8, 16, 21, 27], // B Site
  ['n', 21, 24, 31, 27], // B Connector
  ['b', 10, 27, 13, 48], // B Main
  ['b', 10, 48, 26, 52], // B Main (leg from T)
  ['b', 26, 49, 27, 51], // (B Main ↔ T door)
  // A
  ['A', 44, 16, 58, 27], // A Site
  ['I', 56, 16, 58, 20], // Heaven Stairs
  ['L', 44, 17, 47, 26], // Walkway
  ['r', 52, 27, 55, 31], // A Main Stairs
  ['a', 52, 31, 55, 52], // A Main
  ['p', 43, 30, 47, 47], // Palace
  ['p', 44, 27, 46, 30], // (Palace ↔ A door)
  ['z', 43, 47, 47, 52], // Palace Stairs
  ['s', 40, 52, 55, 55], // Street
  ['s', 39, 53, 40, 55], // (Street ↔ T door)
  // T
  ['T', 27, 49, 39, 56], // T Spawn
];

const rows = paint(GROUND);
const bridgeRows = paint([['g', 31, 19, 35, 22]]);
const sign = signOn(rows);

export const ANUBIS_LAYOUT: GrayboxLayout = {
  name: 'Anubis',
  cellM: CELL_M,
  theme: 'egypt',
  layers: [
    { name: 'Ground', y: 0, rows },
    // the bridge over the Water at the top of mid (the Water runs on under it)
    { name: 'Bridge', y: 1.5, overlay: true, rows: bridgeRows },
  ],
  legend: {
    C: { n: 'CT Spawn', k: 'cyan', h: 1.5, s: 'CT' },
    T: { n: 'T Spawn', k: 'orange', h: 0, s: 'T' },
    A: { n: 'A Site', k: 'site', h: 1.5 },
    B: { n: 'B Site', k: 'site', h: 0 },
    Q: { n: 'Water Stairs', k: 'ramp', r: [-2, 1.5], dir: 'n' },
    x: { n: 'B CT', k: 'room', h: 1.5 },
    X: { n: 'A CT', k: 'room', h: 1.5 },
    J: { n: 'Heaven Ramp', k: 'ramp', r: [1.5, 4], dir: 'e' },
    h: { n: 'A Heaven', k: 'room', h: 4, s: 'Heaven' },
    I: { n: 'Heaven Stairs', k: 'ramp', r: [1.5, 4], dir: 'n' },
    u: { n: 'Ruins', k: 'room', h: 1.5 },
    v: { n: 'Ruins Steps', k: 'ramp', r: [0, 1.5], dir: 'n' },
    k: { n: 'B Heaven Stairs', k: 'ramp', r: [1.5, 4], dir: 's' },
    H: { n: 'B Heaven', k: 'room', h: 4 },
    W: { n: 'Water', k: 'room', h: -2 },
    w: { n: 'Canal', k: 'room', h: -2 },
    q: { n: 'Canal Stairs', k: 'ramp', r: [-2, 0], dir: 's' },
    m: { n: 'Mid', k: 'room', h: 0 },
    g: { n: 'Bridge', k: 'room', h: 1.5 },
    c: { n: 'Camera', k: 'room', h: 1.5 },
    j: { n: 'Camera Steps', k: 'ramp', r: [0, 1.5], dir: 'e' },
    o: { n: 'Connector', k: 'room', h: 1.5 },
    K: { n: 'Walkway Steps', k: 'ramp', r: [1.5, 3], dir: 'e' },
    L: { n: 'Walkway', k: 'room', h: 3 },
    n: { n: 'B Connector', k: 'ramp', r: [-2, 0], dir: 'w' },
    b: { n: 'B Main', k: 'room', h: 0 },
    r: { n: 'A Main Stairs', k: 'ramp', r: [0, 1.5], dir: 'n' },
    a: { n: 'A Main', k: 'room', h: 0 },
    p: { n: 'Palace', k: 'room', h: 1.5 },
    z: { n: 'Palace Stairs', k: 'ramp', r: [0, 1.5], dir: 'n' },
    s: { n: 'Street', k: 'room', h: 0 },
  },
  // the hand-placed cover below is the map's cover (no automatic crates)
  cover: false,
  props: [
    // A Site: the Pillars (two rows of columns), boxes
    prop(49, 18, 49.8, 18.8, 6, 'pillar'),
    prop(53, 18, 53.8, 18.8, 6, 'pillar'),
    prop(49, 22.5, 49.8, 23.3, 6, 'pillar'),
    prop(53, 22.5, 53.8, 23.3, 6, 'pillar'),
    prop(55.5, 24, 57, 25.3, 1.6, 'crate'),
    prop(48, 24.5, 49.4, 25.8, 2.4, 'crate'),
    // A Heaven: a box
    prop(57.8, 10, 58.9, 11.2, 1.2, 'crate'),
    // B Site: the big Pillar, boxes, a low wall
    prop(13, 20, 15, 22, 6, 'pillar'),
    prop(9, 24.5, 10.4, 25.8, 1.6, 'crate'),
    prop(18, 21, 19.4, 22.3, 2.4, 'crate'),
    prop(14, 24.8, 16, 25.4, 1.4, 'wall'),
    // B Heaven: its low wall over the site
    prop(16.5, 15.2, 19.5, 15.8, 1.2, 'wall'),
    // Camera: a box
    prop(25.3, 17.3, 26.5, 18.5, 1.6, 'crate'),
    // Mid: blocks by the canal stairs
    prop(29.3, 44.3, 30.6, 45.5, 1.6, 'crate'),
    prop(35.2, 45.8, 36.5, 46.9, 1.4, 'crate'),
    // Canal: stones in the shallow water
    prop(31.3, 33, 32.3, 34, 1.2, 'crate'),
    prop(33.5, 30, 34.5, 31, 1.2, 'crate'),
    // Palace: columns inside
    prop(43.4, 33, 44.1, 33.7, 6, 'pillar'),
    prop(45.9, 33, 46.6, 33.7, 6, 'pillar'),
    prop(43.4, 41, 44.1, 41.7, 6, 'pillar'),
    prop(45.9, 41, 46.6, 41.7, 6, 'pillar'),
    // A Main and Street: boxes
    prop(53.8, 40, 54.9, 41.2, 1.6, 'crate'),
    prop(47, 52.2, 48.4, 53.4, 1.6, 'crate'),
    // B Main: a box
    prop(11.8, 36, 12.9, 37.2, 1.6, 'crate'),
    // CT Spawn: the Anubis statues
    prop(28, 4.4, 29, 5.4, 6, 'pillar'),
    prop(35.5, 4.4, 36.5, 5.4, 6, 'pillar'),
    // Ruins: broken columns
    prop(6, 6, 7.2, 7.2, 2.4, 'pillar'),
    prop(5.5, 8.3, 7, 8.9, 1.4, 'wall'),
    // T Spawn: the statue, a box
    prop(32.4, 53, 33.6, 54.2, 5, 'pillar'),
    prop(28, 54.2, 29.4, 55.4, 1.6, 'crate'),
  ],
  signs: [
    sign(35, 49.5, 'n', 'MID', 'w'),
    sign(28, 52, 'w', 'B', 'w'),
    sign(38, 51, 'e', 'A', 'e'),
    sign(30, 44.5, 'n', 'CANAL', 'e'),
    sign(29.5, 46, 'w', 'B', 'w'),
    sign(12, 50, 'w', 'B', 'n'),
    sign(11, 35, 'w', 'B SITE', 'n'),
    sign(48, 52.5, 'n', 'PALACE', 'w'),
    sign(53, 53, 'e', 'A', 'n'),
    sign(52.5, 35, 'e', 'A SITE', 'n'),
    sign(32, 30, 'w', 'B', 'n'),
    sign(33, 30, 'e', 'A', 'n'),
    sign(33, 16, 'e', 'BRIDGE', 's'),
    sign(37, 19.5, 'n', 'A', 'e'),
    sign(30, 17.5, 'n', 'B', 'w'),
    sign(30, 4.5, 'n', 'B', 'w'),
    sign(34, 4.5, 'n', 'A', 'e'),
    sign(36, 8.5, 's', 'MID', 'w'),
    sign(28, 12, 'w', 'CAMERA', 's'),
    sign(49.5, 10, 'w', 'A', 's'),
    sign(57, 5.5, 'n', 'HEAVEN'),
  ],
};

export const buildAnubis = (): LevelDef => buildGraybox(ANUBIS_LAYOUT);
