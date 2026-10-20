// Anubis (CS2's de_anubis), rebuilt as a graybox at about 3× its horizontal size (our players
// sprint 9 m/s and have a dash and a jetpack, so a CS-sized map would be over in seconds).
//
// SCALE: every position below is written in CS units (1 unit = 1 inch = 0.0254 m) as read off the
// CS radar, then multiplied by SCALE. Change SCALE (one number) and the whole map grows or shrinks;
// (test/cs-maps-3.test.ts checks no wall rounds away after a change.)
// CELL_M is the grid cell size. At SCALE 3 and 6 m cells: 4150 × 4400 units → 316 × 335 m,
// 53 × 56 cells (6 m cells keep the bots' waypoint graph small enough to search fast; walls
// between rooms are at least one cell). Heights are in metres (CS height differences × about
// 1.5), every slope is a smooth ramp (straight run, gentle: the steepest is 23°, B Heaven).
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
//   Canal → B Connector (up) → B Site
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
/** metres per grid cell */
const CELL_M = 6;
const M_PER_UNIT = 0.0254 * SCALE;
/** the map's size in CS units (x: west → east, z: north → south) */
const MAP_W = 4150;
const MAP_H = 4400;

// ---- a small painter: rectangles in CS units → the tile grid ---------------------------------
const cellOf = (u: number) => Math.round((u * M_PER_UNIT) / CELL_M);
const cellF = (u: number) => (u * M_PER_UNIT) / CELL_M;
type Rect = [c: string, x0: number, z0: number, x1: number, z1: number];
/** paints the rectangles in order (later ones over earlier ones) onto `fill` (wall or nothing) */
const paint = (rects: Rect[], fill = '.'): string[] => {
  const g = Array.from({ length: cellOf(MAP_H) }, () => Array<string>(cellOf(MAP_W)).fill(fill));
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

// ---- the layout (CS units) ---------------------------------------------------------------------
const GROUND: Rect[] = [
  // CT side
  ['C', 1700, 200, 2500, 750], // CT Spawn
  ['Q', 1950, 750, 2250, 1000], // Water Stairs
  ['x', 1700, 750, 1900, 1150], // B CT
  ['X', 2500, 300, 3250, 550], // A CT
  ['X', 3050, 550, 3250, 1100], // A CT (down to the site)
  ['J', 3250, 300, 3650, 550], // Heaven Ramp
  ['h', 3650, 300, 3950, 1100], // A Heaven
  ['u', 300, 300, 1000, 800], // Ruins
  ['u', 1000, 350, 1700, 600], // Ruins (path to CT)
  ['v', 500, 800, 800, 1050], // Ruins Steps
  ['k', 1180, 600, 1400, 700], // B Heaven Stairs
  ['H', 1130, 700, 1400, 1050], // B Heaven
  // mid
  ['W', 1950, 1000, 2250, 1900], // Water
  ['w', 1950, 1900, 2250, 3100], // Canal
  ['q', 1950, 3100, 2250, 3350], // Canal Stairs
  ['m', 1750, 3350, 2450, 3680], // Mid
  ['m', 1950, 3680, 2250, 3750], // (Mid ↔ T door)
  ['c', 1550, 1150, 1950, 1600], // Camera
  ['j', 1400, 1250, 1550, 1500], // Camera Steps
  ['o', 2250, 1300, 2650, 1500], // Connector
  ['K', 2650, 1300, 2850, 1500], // Walkway Steps
  // B
  ['B', 400, 1050, 1400, 2500], // B Site
  ['n', 1400, 2250, 1950, 2500], // B Connector
  ['b', 600, 2500, 1000, 3700], // B Main
  ['b', 600, 3700, 1520, 4050], // B Main (leg from T)
  ['b', 1520, 3800, 1600, 4000], // (B Main ↔ T door)
  // A
  ['A', 2850, 1100, 3900, 2200], // A Site
  ['I', 3700, 1100, 3950, 1300], // Heaven Stairs
  ['L', 2850, 1150, 3050, 1900], // Walkway
  ['r', 3200, 2200, 3600, 2450], // A Main Stairs
  ['a', 3200, 2450, 3600, 3750], // A Main
  ['p', 2700, 2250, 3100, 3500], // Palace
  ['p', 2900, 2200, 3050, 2250], // (Palace ↔ A door)
  ['z', 2750, 3500, 3050, 3750], // Palace Stairs
  ['s', 2680, 3750, 3500, 4100], // Street
  ['s', 2600, 3800, 2680, 4000], // (Street ↔ T door)
  // T
  ['T', 1600, 3750, 2600, 4300], // T Spawn
];

const rows = paint(GROUND);
const bridgeRows = paint([['g', 1950, 1300, 2250, 1500]], '.');
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
    prop(3250, 1350, 3330, 1430, 6, 'pillar'),
    prop(3500, 1350, 3580, 1430, 6, 'pillar'),
    prop(3250, 1700, 3330, 1780, 6, 'pillar'),
    prop(3500, 1700, 3580, 1780, 6, 'pillar'),
    prop(3650, 1900, 3790, 2020, 1.6, 'crate'),
    prop(3150, 2000, 3290, 2120, 2.4, 'crate'),
    // A Heaven: a low wall at its edge
    prop(3700, 950, 3900, 1010, 1.2, 'wall'),
    // B Site: the big Pillar, boxes, a low wall
    prop(800, 1600, 1000, 1800, 6, 'pillar'),
    prop(500, 2200, 640, 2320, 1.6, 'crate'),
    prop(1150, 1900, 1290, 2020, 2.4, 'crate'),
    prop(550, 1200, 750, 1260, 1.4, 'wall'),
    // B Heaven: its low wall
    prop(1180, 950, 1380, 1010, 1.2, 'wall'),
    // Camera: a box
    prop(1600, 1250, 1700, 1350, 1.6, 'crate'),
    // Mid: blocks by the canal stairs
    prop(1800, 3400, 1920, 3500, 1.6, 'crate'),
    prop(2300, 3550, 2420, 3650, 1.4, 'crate'),
    // Canal: stones in the shallow water
    prop(2000, 2500, 2100, 2580, 1.2, 'crate'),
    prop(2120, 2100, 2220, 2180, 1.2, 'crate'),
    // Palace: columns inside
    prop(2780, 2600, 2850, 2670, 6, 'pillar'),
    prop(2950, 2600, 3020, 2670, 6, 'pillar'),
    prop(2780, 3100, 2850, 3170, 6, 'pillar'),
    prop(2950, 3100, 3020, 3170, 6, 'pillar'),
    // A Main and Street: boxes
    prop(3450, 2900, 3570, 3010, 1.6, 'crate'),
    prop(3200, 3850, 3340, 3970, 1.6, 'crate'),
    // B Main: a box
    prop(850, 3000, 970, 3110, 1.6, 'crate'),
    // CT Spawn: the Anubis statues
    prop(1850, 300, 1940, 390, 6, 'pillar'),
    prop(2260, 300, 2350, 390, 6, 'pillar'),
    // Ruins: broken columns
    prop(450, 450, 540, 540, 2.4, 'pillar'),
    prop(800, 600, 880, 680, 1.4, 'wall'),
    // T Spawn: the statue, boxes
    prop(2050, 4100, 2150, 4200, 5, 'pillar'),
    prop(1700, 3850, 1830, 3960, 1.6, 'crate'),
  ],
  signs: [
    sign(2100, 3850, 'n', 'MID', 'n'),
    sign(1800, 3950, 'w', 'B', 'w'),
    sign(2450, 3950, 'e', 'A', 'e'),
    sign(2100, 3500, 'n', 'CANAL', 'n'),
    sign(1850, 3500, 'w', 'B', 'w'),
    sign(800, 3850, 'w', 'B', 'n'),
    sign(800, 2700, 'w', 'B SITE', 'n'),
    sign(3000, 3900, 's', 'PALACE', 'n'),
    sign(3350, 3900, 'e', 'A', 'n'),
    sign(3400, 2600, 'e', 'A SITE', 'n'),
    sign(2100, 2300, 'w', 'B', 'w'),
    sign(2100, 2300, 'e', 'A', 'n'),
    sign(2100, 1700, 'e', 'BRIDGE', 'n'),
    sign(2450, 1400, 'n', 'A', 'e'),
    sign(1750, 1400, 'n', 'B', 'w'),
    sign(2100, 500, 'w', 'B', 'w'),
    sign(2100, 500, 'e', 'A', 'e'),
    sign(2100, 650, 's', 'MID', 's'),
    sign(1750, 900, 'w', 'CAMERA', 's'),
    sign(3150, 800, 'w', 'A', 's'),
    sign(3800, 500, 'n', 'HEAVEN'),
  ],
};

export const buildAnubis = (): LevelDef => buildGraybox(ANUBIS_LAYOUT);
