// Mirage (CS2 classic), rebuilt as a graybox layout (level/graybox.ts) at about 3× its real
// horizontal size: our players sprint, dash and jetpack, so CS distances would feel tiny.
//
// Scale: one grid cell = CS_UNITS_PER_CELL Counter-Strike units. CS units →
// metres: 1 unit = 0.0254 m, then × SCALE. Heights keep CS's small differences, × HEIGHT_SCALE.
// Change SCALE / HEIGHT_SCALE below to retune the whole map; the grid stays the same (props are
// sized in metres on grid corners: after a big change, check them with test/cs-maps-1.test.ts).
// Lanes are 2–5 cells wide and the map has about 1300 floor cells (bot waypoints) to keep the
// bots' route search fast.
//
// North is row 0 (as on the CS radar): T Spawn in the east, CT Spawn in the west, A in the south,
// B in the north-west. Callouts (legend names):
//   T side:   T Spawn, T Ramp, Palace Alley, Palace, Palace Stairs, T Apartments, Apartments,
//             B Apartments, Top Mid
//   A:        A Ramp, A Site (Firebox, Triple, Default, Ticket booth box),
//             Ninja (the corner by the Palace exit), Stairs (up to Jungle), Jungle, Connector,
//             CT, Ticket Booth
//   Mid:      Mid (slopes down west toward Window), Window (the raised room at its west end,
//             with Chair), Catwalk Stairs, Catwalk (Short), Underpass (under the Catwalk, roofed
//             by the main level; its ladder up to Ladder Room is a suction tube), Underpass
//             Stairs, Ladder Room, CT Stairs
//   B:        B Site (Van, Bench, B boxes), B Short, Short, Market, Market Window, Kitchen
// Two solid layers: the Underpass below, the main level above it (the main level's walls are
// the Underpass's roof; the Catwalk crosses over it).
// Bomb: T Spawn attacks (orange), CT Spawn defends (cyan).
import type { LevelDef } from '../../types';
import {
  buildGraybox,
  type GrayboxLayout,
  type GrayboxProp,
  type GrayboxSign,
} from '../../graybox';

/** horizontal scale against real CS2 Mirage (owner's choice: about 3×) */
const SCALE = 3;
/** vertical scale of CS's height differences (kept small, like CS) */
const HEIGHT_SCALE = 1.5;
/** CS units per grid cell */
const CS_UNITS_PER_CELL = 64;
/** metres per CS unit */
const UNIT_M = 0.0254;

/** metres per grid cell (64 units × 0.0254 × 3 = 4.88 m) */
export const MIRAGE_CELL_M = CS_UNITS_PER_CELL * UNIT_M * SCALE;
/** a CS height (units, relative to A Ramp's top) in metres */
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
  l = 1,
): GrayboxProp => ({
  x: x - w / MIRAGE_CELL_M / 2,
  y: y - d / MIRAGE_CELL_M / 2,
  w: w / MIRAGE_CELL_M,
  d: d / MIRAGE_CELL_M,
  h: ht,
  l,
  kind,
});

const props: GrayboxProp[] = [
  // A site: Firebox, Triple, Default, the Ticket booth box, the box in Ninja
  prop(34, 46, 3.4, 3.4, 2),
  prop(28, 49, 3.6, 3.6, 2.4),
  prop(31, 46, 2.6, 2.6, 1.3),
  prop(19, 48, 3, 3, 2.6),
  prop(35, 51, 2.4, 2.4, 1.3),
  // Palace pillars
  prop(49, 50, 1.2, 1.2, 3.2, 'pillar'),
  prop(52, 50, 1.2, 1.2, 3.2, 'pillar'),
  prop(55, 50, 1.2, 1.2, 3.2, 'pillar'),
  // Mid: boxes at Top Mid, Chair in Window, a box in Jungle
  prop(46, 28, 3, 3, 1.4),
  prop(23, 26, 1.4, 1.4, 1),
  prop(25, 38, 2.6, 2.6, 1.3),
  // B site: Van, Bench (by Market Window), the B boxes
  prop(10, 5, 2.4, 3.6, 2.2, 'car'),
  prop(8, 11, 3.4, 1, 0.6, 'wall'),
  prop(5, 8, 3.6, 3.6, 2.4),
  // Market and Kitchen tables, CT Spawn, T Spawn
  prop(9, 17, 2.6, 2.6, 1),
  prop(4, 17, 2.4, 2.4, 1),
  prop(9, 33, 3, 3, 1.4),
  prop(52, 24, 3, 3, 1.4),
  prop(53, 29, 3, 3, 1.4),
];

// painted signs: on the wall cell (x, y) of the main level, on its face toward the floor beside it
const signs: GrayboxSign[] = [
  { x: 48, y: 22, l: 1, face: 'e', text: '← MID' },
  { x: 52, y: 32, l: 1, face: 'n', text: 'A RAMP →' },
  { x: 53, y: 32, l: 1, face: 'n', text: '← PALACE' },
  { x: 53, y: 19, l: 1, face: 's', text: '← B APPS' },
  { x: 30, y: 9, l: 1, face: 's', text: '← B SHORT' },
  { x: 30, y: 32, l: 1, face: 'w', text: 'A →' },
  { x: 29, y: 2, l: 1, face: 's', text: '← B' },
  { x: 7, y: 2, l: 1, face: 's', text: 'B SITE' },
  { x: 28, y: 52, l: 1, face: 'n', text: 'A SITE' },
  { x: 9, y: 37, l: 1, face: 'n', text: 'CT' },
  { x: 57, y: 26, l: 1, face: 'w', text: 'T SPAWN' },
  { x: 4, y: 31, l: 1, face: 'e', text: 'B →' },
  { x: 14, y: 42, l: 1, face: 'e', text: '← A' },
];

export const MIRAGE_LAYOUT: GrayboxLayout = {
  name: 'Mirage',
  cellM: MIRAGE_CELL_M,
  theme: 'desert',
  cover: false,
  props,
  signs,
  layers: [
    {
      name: 'Underpass',
      y: h(-140),
      rows: [
        // ROWS0-START
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '......................UUUUUUUUUUUUUUU......................',
        '......................UUUUUUUUUUUUUUU......................',
        '......................UUUUUUUUUUUUUUU......................',
        '..................................vvv......................',
        '..................................vvv......................',
        '..................................vvv......................',
        '..................................vvv......................',
        '..................................vvv......................',
        '..................................vvv......................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '...........................................................',
        // ROWS0-END
      ],
    },
    {
      name: 'Mirage',
      y: 0,
      rows: [
        // ROWS1-START
        '...........................................................',
        '...........................................................',
        '...........................................................',
        '..BBBBBBBBBBbbbaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa......',
        '..BBBBBBBBBBbbbaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa......',
        '..BBBBBBBBBB.......................................aa......',
        '..BBBBBBBBBB.......................................aa......',
        '..BBBBBBBBBB.......................................aa......',
        '..BBBBBBBBBB.......................................aa......',
        '..BBBBBBBBBB.......................................aa......',
        '..BBBBBBBBBBrrrssssssssssssssccc...................aa......',
        '..BBBBBBBBBBrrrssssssssssssssccc...................aa......',
        '..BBBBBBBBBB......LL.........ccc...................aa......',
        '....K...ww........LL.........ccc...................hh......',
        '....K...ww........LL.........ccc...................hh......',
        '..KKKKMMMMMM......LL.........ccc...................hh......',
        '..KKKKMMMMMM......LL.........ccc...................hh......',
        '..KKKKMMMMMM......LL.........ccc...................hh......',
        '..KKKKMMMMMM......LL.........ccc...................hh......',
        '..KKKKMMMMMM......LL.........ccc...................hh......',
        '........MM.......LLLL........ccc.................TTTTTTTT..',
        '........MM.......LLLL........ccc.................TTTTTTTT..',
        '........MM.......LLLL........ccc.................TTTTTTTT..',
        '........MM.......LLLL........qqq.................TTTTTTTT..',
        '........MM.......LLLLWWWWW...qqq.................TTTTTTTT..',
        '........MM.......LLLLWWWWW...qqq...........QQQQQQTTTTTTTT..',
        '........MM.......LLLLWWWWWmmmmmmmmmmmmmmmmmQQQQQQTTTTTTTT..',
        '........MM.......LLLLWWWWWmmmmmmmmmmmmmmmmmQQQQQQTTTTTTTT..',
        '........MM.......eeee.....mmmmmmmmmmmmmmmmmQQQQQQTTTTTTTT..',
        '.....CCCCCCCCC...eeee.....mmmmmmmmmmmmmmmmmQQQQQQTTTTTTTT..',
        '.....CCCCCCCCC...eeee.....nnnn.............QQQQQQTTTTTTTT..',
        '.....CCCCCCCCC...eeee.....nnnn...................TTTTTTTT..',
        '.....CCCCCCCCC...eeee.....nnnn...................RRR..ppp..',
        '.....CCCCCCCCCXXXXXXXX....nnnn...................RRR..ppp..',
        '.....CCCCCCCCCXXXXXXXX....nnnn...................RRR..ppp..',
        '.....CCCCCCCCCXXXXXXXX....nnnn...................RRR..ppp..',
        '.....CCCCCCCCCXXXXXXXXJJJJJJJJ...................RRR..ppp..',
        '..............XXXXXXXXJJJJJJJJ...................RRR..ppp..',
        '..............XXXXXXXXJJJJJJJJ...................RRR..ppp..',
        '..............XXXXXXXXJJJJJJJJ...................RRR..ppp..',
        '...............ttttt..JJJJJJJJ...................RRR..ppp..',
        '...............ttttt..JJJJJJJJ...................RRR..ppp..',
        '...............ttttt....SSSS.....................RRR..ppp..',
        '...............ttttt....SSSS.....................RRR..ppp..',
        '...............ttttt..AAAAAAAAAAAAAAYYYYYYYYYYYYYRRR..ppp..',
        '...............ttttt..AAAAAAAAAAAAAAYYYYYYYYYYYYYRRR..ppp..',
        '................AAAAAAAAAAAAAAAAAAAAYYYYYYYYYYYYYRRR..ppp..',
        '................AAAAAAAAAAAAAAAAAAAA..................ppp..',
        '................AAAAAAAAAAAAAAAAAAAAooooooooooPPPPPPPPPPP..',
        '................AAAAAAAAAAAAAAAAANNNooooooooooPPPPPPPPPPP..',
        '................AAAAAAAAAAAAAAAAANNNooooooooooPPPPPPPPPPP..',
        '................AAAAAAAAAAAAAAAAANNNooooooooooPPPPPPPPPPP..',
        '...........................................................',
        // ROWS1-END
      ],
    },
  ],
  legend: {
    T: { n: 'T Spawn', k: 'orange', h: h(60) },
    R: { n: 'T Ramp', k: 'ramp', r: [h(0), h(60)], dir: 'n' },
    Y: { n: 'A Ramp', k: 'ramp', r: [h(-40), h(0)], dir: 'e' },
    p: { n: 'Palace Alley', k: 'room', h: h(60), s: 'Alley' },
    P: { n: 'Palace', k: 'room', h: h(60) },
    o: { n: 'Palace Stairs', k: 'ramp', r: [h(-40), h(60)], dir: 'e', s: 'Palace St' },
    A: { n: 'A Site', k: 'site', h: h(-40), s: 'A' },
    N: { n: 'Ninja', k: 'room', h: h(-40) },
    S: { n: 'Stairs', k: 'ramp', r: [h(-40), h(20)], dir: 'n' },
    J: { n: 'Jungle', k: 'room', h: h(20) },
    n: { n: 'Connector', k: 'ramp', r: [h(-30), h(20)], dir: 's', s: 'Con' },
    X: { n: 'CT', k: 'room', h: h(20) },
    t: { n: 'Ticket Booth', k: 'ramp', r: [h(-40), h(20)], dir: 'n', s: 'Ticket' },
    C: { n: 'CT Spawn', k: 'cyan', h: h(20) },
    e: { n: 'CT Stairs', k: 'ramp', r: [h(20), h(60)], dir: 'n' },
    Q: { n: 'Top Mid', k: 'room', h: h(60) },
    m: { n: 'Mid', k: 'ramp', r: [h(-40), h(60)], dir: 'e' },
    W: { n: 'Window', k: 'room', h: h(60) },
    L: { n: 'Ladder Room', k: 'room', h: h(60), s: 'Ladder' },
    q: { n: 'Catwalk Stairs', k: 'ramp', r: [h(-10), h(60)], dir: 'n', s: 'Cat Stairs' },
    c: { n: 'Catwalk', k: 'room', h: h(60) },
    s: { n: 'Short', k: 'room', h: h(60) },
    r: { n: 'B Short', k: 'ramp', r: [h(20), h(60)], dir: 'e' },
    U: { n: 'Underpass', k: 'room', h: h(-140), s: 'Under' },
    v: { n: 'Underpass Stairs', k: 'ramp', r: [h(-140), h(16)], dir: 's', s: 'Under St' },
    h: { n: 'T Apartments', k: 'ramp', r: [h(60), h(100)], dir: 'n', s: 'T Apps' },
    a: { n: 'Apartments', k: 'room', h: h(100), s: 'Apps' },
    b: { n: 'B Apartments', k: 'ramp', r: [h(20), h(100)], dir: 'e', s: 'B Apps' },
    B: { n: 'B Site', k: 'site', h: h(20), s: 'B' },
    M: { n: 'Market', k: 'room', h: h(20) },
    w: { n: 'Market Window', k: 'room', h: h(50), s: 'Mkt Window' },
    K: { n: 'Kitchen', k: 'room', h: h(20) },
  },
  // the ladder from the Underpass up into Ladder Room: a suction tube (bots walk round by Mid)
  links: [['U', 'L', 'tube', true]],
};

export const buildMirage = (): LevelDef => buildGraybox(MIRAGE_LAYOUT);
