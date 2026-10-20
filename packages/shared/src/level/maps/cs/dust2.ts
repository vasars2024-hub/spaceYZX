// Dust 2 (CS2 classic), rebuilt as a graybox layout (level/graybox.ts) at about 3× its real
// horizontal size: our players sprint, dash and jetpack, so CS distances would feel tiny.
//
// Scale: one grid cell = CS_UNITS_PER_CELL Counter-Strike units. CS units →
// metres: 1 unit = 0.0254 m, then × SCALE. Heights keep CS's small differences, × HEIGHT_SCALE.
// Change SCALE / HEIGHT_SCALE below to retune the whole map; the grid stays the same (props are
// sized in metres on grid corners: after a big change, check them with test/cs-maps-1.test.ts).
// Lanes are 2–5 cells wide and the map has about 1300 floor cells (bot waypoints) to keep the
// bots' route search fast.
//
// North is row 0 (as on the CS radar). Callouts (legend names):
//   T side (south):  T Spawn, Outside Long, Suicide, Top Mid, T Ramp, Outside Tunnels
//   A (north-east):  Long Doors, Blue, Long A, Pit, Pit Ramp, A Ramp, A Site (Goose in the
//                    north-east corner, Default boxes in the middle, Car at the top of long),
//                    Short, Short Stairs, CT Ramp (from CT Spawn)
//   Mid:             Mid, Lower Mid, Xbox, Catwalk Stairs, Catwalk (a ledge above Lower Mid),
//                    Mid Doors, CT Mid
//   B (north-west):  Upper Tunnels, Tunnel Ramp, Lower Tunnels, Tunnel Stairs, B Site (Back Plat,
//                    Plat Steps, Car by the tunnel exit, big box), B Doors, B Window
//   CT Spawn between A and B at the top. Bomb: T Spawn attacks (orange), CT Spawn defends (cyan).
// Dust 2 has no bridges (Catwalk is a ledge you can drop from), so one solid layer is enough.
import type { LevelDef } from '../../types';
import {
  buildGraybox,
  type GrayboxLayout,
  type GrayboxProp,
  type GrayboxSign,
} from '../../graybox';

/** horizontal scale against real CS2 Dust 2 (owner's choice: about 3×) */
const SCALE = 3;
/** vertical scale of CS's height differences (kept small, like CS) */
const HEIGHT_SCALE = 1.5;
/** CS units per grid cell */
const CS_UNITS_PER_CELL = 64;
/** metres per CS unit */
const UNIT_M = 0.0254;

/** metres per grid cell (64 units × 0.0254 × 3 = 4.88 m) */
export const DUST2_CELL_M = CS_UNITS_PER_CELL * UNIT_M * SCALE;
/** a CS height (units, relative to Long A) in metres */
const h = (units: number) => Math.round(units * UNIT_M * HEIGHT_SCALE * 100) / 100;

/**
 * A prop centred on the grid corner (x, y) (where four cells meet), `w` × `d` metres, `ht` tall.
 * Props stand between cell centres, clear of the lines bots walk between them.
 */
const prop = (
  x: number,
  y: number,
  w: number,
  d: number,
  ht: number,
  kind: GrayboxProp['kind'] = 'crate',
): GrayboxProp => ({
  x: x - w / DUST2_CELL_M / 2,
  y: y - d / DUST2_CELL_M / 2,
  w: w / DUST2_CELL_M,
  d: d / DUST2_CELL_M,
  h: ht,
  kind,
});

const props: GrayboxProp[] = [
  // A site: Default (the stacked boxes), the box beside it, CT-side boxes, barrels by Short
  prop(51, 11, 3.6, 3.6, 2.6),
  prop(53, 13, 2.6, 2.6, 1.3),
  prop(48, 8, 3, 3, 1.4),
  prop(48, 14, 1.6, 1.6, 1.2, 'barrel'),
  // Goose: the box in the north-east corner
  prop(57, 6, 3, 3, 1.8),
  // Car at the top of Long A, the box at the long corner, Blue, the box down in Pit
  prop(58, 22, 2.2, 3.6, 1.5, 'car'),
  prop(58, 30, 2.6, 2.6, 1.3),
  prop(50, 40, 3, 3, 2.4),
  prop(60, 13, 2.6, 2.6, 1.4),
  // Mid: Xbox, a crate at Top Mid
  prop(31, 34, 3.4, 3.4, 1.6),
  prop(30, 46, 2.4, 2.4, 1.2),
  // B site: Car by the tunnel exit, the big box (double stack), boxes by the doors, a box on
  // Back Plat, the low box at the tunnel exit
  prop(6, 11, 2.2, 3.6, 1.5, 'car'),
  prop(9, 7, 3.6, 3.6, 2.6),
  prop(13, 6, 3, 3, 1.4),
  prop(5, 4, 2.6, 2.6, 1.3),
  prop(10, 11, 2.4, 2.4, 1.2),
  // CT Spawn, T Spawn, Outside Tunnels
  prop(36, 6, 3, 3, 1.4),
  prop(27, 59, 3, 3, 1.4),
  prop(38, 60, 3, 3, 1.4),
  prop(14, 40, 3, 3, 1.4),
];

// painted signs: on the wall cell (x, y), on its face toward the floor next to it
const signs: GrayboxSign[] = [
  { x: 40, y: 56, face: 's', text: 'LONG →' },
  { x: 33, y: 56, face: 's', text: 'MID' },
  { x: 25, y: 56, face: 's', text: '← B' },
  { x: 9, y: 37, face: 's', text: '← B' },
  { x: 9, y: 20, face: 'w', text: '← B' },
  { x: 26, y: 30, face: 'e', text: 'B →' },
  { x: 26, y: 23, face: 'e', text: 'CT' },
  { x: 37, y: 25, face: 'w', text: '← SHORT' },
  { x: 46, y: 39, face: 's', text: 'LONG' },
  { x: 61, y: 28, face: 'w', text: '← A' },
  { x: 50, y: 5, face: 's', text: 'A SITE' },
  { x: 10, y: 2, face: 's', text: 'B SITE' },
  { x: 35, y: 2, face: 's', text: 'CT' },
  { x: 32, y: 62, face: 'n', text: 'T SPAWN' },
  { x: 25, y: 12, face: 'e', text: 'B →' },
];

export const DUST2_LAYOUT: GrayboxLayout = {
  name: 'Dust 2',
  cellM: DUST2_CELL_M,
  theme: 'desert',
  cover: false,
  props,
  signs,
  layers: [
    {
      name: 'Dust 2',
      y: 0,
      rows: [
        // ROWS-START
        '................................................................',
        '................................................................',
        '................................................................',
        '....PPPPjBBBBBB...............CCCCCCCCCCC.......................',
        '....PPPPjBBBBBB...............CCCCCCCCCCC...............gg......',
        '....BBBBBBBBBBB...............CCCCCCCCCCC...............gg......',
        '....BBBBBBBBBBB...............CCCCCCCCCCCXXXXXAAAAAAAAAAgg......',
        '....BBBBBBBBBBBeeeeeeeeeeeee..CCCCCCCCCCCXXXXXAAAAAAAAAAgg......',
        '....BBBBBBBBBBBeeeeeeeeeeeee..CCCCCCCCCCCXXXXXAAAAAAAAAA........',
        '....BBBBBBBBBBB...eee.....MMMMMMCCCCCCCCCXXXXXAAAAAAAAAA........',
        '....BBBBBBBBBBB...eee.....MMMMMM..............AAAAAAAAAA........',
        '....BBBBBBBBBBBWWWeee.....MMMMMM..............AAAAAAAAAA..pppp..',
        '....BBBBBBBBBBBWWWeee.....MMMMMM...........KKKAAAAAAAAAA..pppp..',
        '......UUU.........eee.....MMMMMM..sssssssssKKKAAAAAAAAAA..pppp..',
        '......UUU.................MMMMMM..sssssssssKKKAAAAAAAAAA..pppp..',
        '......UUU.................MMMMMM..sssssssssKKKAAAAAAAAAA..pppp..',
        '......UUU.................MMMMMM..sssssssss.........RRRR..pppp..',
        '......UUU.................MMMMMM..sssssssss.........RRRR....qq..',
        '......UUU.................MMMMMM..ccc...............RRRR....qq..',
        '......UUU.................MMMMMM..ccc...............RRRR....qq..',
        '......UUU.................MMMMMM..ccc...............LLLLLLLLL...',
        '......UUU.................MMMMMM..ccc...................LLLLL...',
        '......UUU..................DD.....ccc...................LLLLL...',
        '......UUU..................DD.....ccc...................LLLLL...',
        '......UUU..................DD.....ccc...................LLLLL...',
        '......UUU..................mmmmmmmccc...................LLLLL...',
        '......UUU..................mmmmmmmccc...................LLLLL...',
        '......UUUlllNNNNNNNNNNNNNNNmmmmmmmccc...................LLLLL...',
        '......UUUlllNNNNNNNNNNNNNNNmmmmmmmccc...................LLLLL...',
        '......UUU..................mmmmmmmccc...................LLLLL...',
        '......UUU..................mmmmmmmccc...................LLLLL...',
        '......UUU..................mmmmmmmccc...................LLLLL...',
        '......UUU..................mmxxx...cc...................LLLLL...',
        '......uuu..................mmxxxkkkcc...................LLLLL...',
        '......uuu..................mmxxxkkkcc...................LLLLL...',
        '......uuu..................mmxxxkkkcc...................LLLLL...',
        '......uuu..................mmxxx...cc...................LLLLL...',
        '......uuu..................mmmmm........................LLLLL...',
        '......OOOOOOOOOOOOOOOO.....rrrrr........................LLLLL...',
        '......OOOOOOOOOOOOOOOO.....rrrrr................bbbbbbbbbbb.....',
        '......OOOOOOOOOOOOOOOO.....rrrrr..........ooooddbbbbbbbbbbb.....',
        '......OOOOOOOOOOOOOOOO.....rrrrr..........ooooddbbbbbbbbbbb.....',
        '....................YYYY...rrrrr..........oooo..................',
        '....................YYYY...rrrrr..........oooo..................',
        '....................YYYY...QQQQQQ.........oooo..................',
        '....................YYYY...QQQQQQ.........oooo..................',
        '....................YYYY...QQQQQQ.........oooo..................',
        '....................YYYY...QQQQQQ.........oooo..................',
        '....................YYYY....SSSS..........oooo..................',
        '....................YYYY....SSSS..........oooo..................',
        '....................YYYY....SSSS..........oooo..................',
        '....................YYYY....SSSS..........oooo..................',
        '....................YYYY....SSSS..........oooo..................',
        '....................YYYY....SSSS..........oooo..................',
        '....................YYYY....SSSS..........oooo..................',
        '....................YYYY....SSSS..........oooo..................',
        '....................YYYY....SSSS..........oooo..................',
        '......................TTTTTTTTTTTTTTTTTTTTTT....................',
        '......................TTTTTTTTTTTTTTTTTTTTTT....................',
        '......................TTTTTTTTTTTTTTTTTTTTTT....................',
        '......................TTTTTTTTTTTTTTTTTTTTTT....................',
        '......................TTTTTTTTTTTTTTTTTTTTTT....................',
        '................................................................',
        // ROWS-END
      ],
    },
  ],
  legend: {
    T: { n: 'T Spawn', k: 'orange', h: h(80) },
    o: { n: 'Outside Long', k: 'ramp', r: [h(0), h(80)], dir: 's' },
    d: { n: 'Long Doors', k: 'room', h: h(0) },
    b: { n: 'Blue', k: 'room', h: h(0) },
    L: { n: 'Long A', k: 'room', h: h(0), s: 'Long' },
    p: { n: 'Pit', k: 'room', h: h(-80) },
    q: { n: 'Pit Ramp', k: 'ramp', r: [h(-80), h(0)], dir: 's' },
    R: { n: 'A Ramp', k: 'ramp', r: [h(0), h(100)], dir: 'n' },
    A: { n: 'A Site', k: 'site', h: h(100), s: 'A' },
    g: { n: 'Goose', k: 'room', h: h(100) },
    X: { n: 'CT Ramp', k: 'ramp', r: [h(0), h(100)], dir: 'e' },
    C: { n: 'CT Spawn', k: 'cyan', h: h(0) },
    s: { n: 'Short', k: 'room', h: h(40) },
    K: { n: 'Short Stairs', k: 'ramp', r: [h(40), h(100)], dir: 'e' },
    c: { n: 'Catwalk', k: 'room', h: h(40) },
    k: { n: 'Catwalk Stairs', k: 'ramp', r: [h(-60), h(40)], dir: 'e', s: 'Cat Stairs' },
    m: { n: 'Lower Mid', k: 'room', h: h(-60) },
    x: { n: 'Xbox', k: 'room', h: h(-60) },
    r: { n: 'Mid', k: 'ramp', r: [h(-60), h(40)], dir: 's' },
    Q: { n: 'Top Mid', k: 'room', h: h(40) },
    S: { n: 'Suicide', k: 'ramp', r: [h(40), h(80)], dir: 's' },
    D: { n: 'Mid Doors', k: 'room', h: h(-60) },
    M: { n: 'CT Mid', k: 'ramp', r: [h(-60), h(0)], dir: 'n' },
    e: { n: 'B Doors', k: 'room', h: h(0) },
    W: { n: 'B Window', k: 'room', h: h(30), s: 'Window' },
    B: { n: 'B Site', k: 'site', h: h(0), s: 'B' },
    P: { n: 'Back Plat', k: 'room', h: h(40), s: 'Plat' },
    j: { n: 'Plat Steps', k: 'ramp', r: [h(0), h(40)], dir: 'w' },
    U: { n: 'Upper Tunnels', k: 'room', h: h(0), s: 'Upper Tuns' },
    u: { n: 'Tunnel Ramp', k: 'ramp', r: [h(0), h(40)], dir: 's' },
    l: { n: 'Tunnel Stairs', k: 'ramp', r: [h(-60), h(0)], dir: 'w' },
    N: { n: 'Lower Tunnels', k: 'room', h: h(-60), s: 'Lower Tuns' },
    O: { n: 'Outside Tunnels', k: 'room', h: h(40), s: 'Out Tuns' },
    Y: { n: 'T Ramp', k: 'ramp', r: [h(40), h(80)], dir: 's' },
  },
};

export const buildDust2 = (): LevelDef => buildGraybox(DUST2_LAYOUT);
