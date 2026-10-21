// Nuke (CS2 classic) rebuilt as a graybox (level/graybox.ts) at about 3× its real size: our
// players sprint at 9 m/s, dash and jetpack, so CS distances would feel tiny.
//
// Scale: one grid cell = 64 CS units; CS units → metres × 0.0254, then × SCALE (3) across, so a
// cell is 64 × 0.0254 × 3 ≈ 4.88 m and the map is 62 × 43 cells ≈ 302 × 210 m. Heights: CS
// height differences × VSCALE (1.0): B sits 315 units (8 m) under A, Heaven 200 units (5 m) over it.
// North (row 0) is up on the CS radar. Orange = T (attackers), Cyan = CT (defenders).
//
// Nuke is vertical: A Site is the reactor building's upper floor and B Site lies right under it.
// Three layers: the lower level (B, -8 m), the upper level (A, Outside, the spawns, 0 m) and the
// catwalks (Heaven, Rafters, +5 m) over Hell and A.
//
// Callouts:
//   T side (west): T Spawn, Garage (north, to Outside), Lobby (east)
//   Outside (north yard): Silo (two tanks), Container, Secret Top (east end), Main and Mini (the
//     doors from Outside into A)
//   Lobby → Squeaky and Hut (into A from the west), Lobby → Ramp Room → Ramp (down east to B)
//   A Site (upper): Hut, Squeaky, Main, Mini, Rafters (catwalk over A), Heaven (CT catwalk) over
//     Hell, Heaven Stairs from CT Spawn, Heaven Tube (suction tube from Hell up to Heaven: no
//     ladders in our game)
//   Vents: a duct off A's south side ending in an open shaft: a drop into B (one way); the Vents
//     Tube in a notch by its foot sucks you back up into the duct
//   B Site (lower): Toxic (west, foot of the Ramp), Decon and Window (east rooms), Double Doors
//     (north-east) → Secret (lower hall) → Secret Ramp up to Outside's east end
//   CT Spawn (east): Heaven Stairs and Hell to A, north to Outside / Secret, Vents drop to B
// Bots walk every route: B ↔ the upper level by the Ramp and Secret (tubes are not for bots).
// Built from rectangles by a generator; edit the rows by hand from here on.
import type { LevelDef } from '../../types';
import { buildGraybox, type GrayboxLayout } from '../../graybox';

/** horizontal scale against the real map */
export const NUKE_SCALE = 3;
/** CS units per grid cell */
const UNITS_PER_CELL = 64;
/** height scale against the real map (CS height differences) */
const VSCALE = 1;
const CS_UNIT_M = 0.0254;
/** a CS height (units above A Site) in metres */
const z = (u: number) => Number((u * CS_UNIT_M * VSCALE).toFixed(2));
/** the B level */
const B = z(-315);

export const NUKE_LAYOUT: GrayboxLayout = {
  name: 'Nuke',
  cellM: UNITS_PER_CELL * CS_UNIT_M * NUKE_SCALE,
  theme: 'industrial',
  cover: false,
  layers: [
    {
      name: 'Lower (B)',
      y: B,
      rows: [
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '...............................................qqq............',
        '...............................................qqq............',
        '...............................................qqq............',
        '...............................................qqq............',
        '...............................................qqq............',
        '...............................................qqq............',
        '...............................................qqq............',
        '.......................................dddd....qqq............',
        '.......................................ddddsssssss............',
        '.......................................ddddsssssss............',
        '.......................................dddd...................',
        '...............................BBBBBBBBBBBB...................',
        '...............................BBBBBBBBBBBB...................',
        '...............................BBBBBBBBBBBBDDDD...............',
        '...............................BBBBBBBBBBBBDDDD...............',
        '...............................BBBBBBBBBBBBDDDD...............',
        '...............................BBBBBBBBBBBBDDDD...............',
        '...............................BBBBBBBBBBBBDDDD...............',
        '...........................XXXXBBBBBBBBBBBBDDDD...............',
        '...........................XXXXBBBBBBBBBBBB...................',
        '...........................XXXXBBBBBBBBBBBBwww................',
        '...........................XXXXBBBBBBBBBBBBwww................',
        '.....................PPPPPPXXXXBBBBBBBBBBBBwww................',
        '.....................PPPPPPXXXX......u........................',
        '.....................PPPPPPXXXX...............................',
        '.....................PPPPPPXXXX...............................',
        '...........................XXXX...............................',
        '..............................................................',
        '..............................................................',
      ],
    },
    {
      name: 'Upper (A, Outside)',
      y: 0,
      rows: [
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '.............OOOOOOOOOSSS####SSSSSSSSSOOOOOOOOOOOOOOOOOOO.....',
        '.............OOOOOOOOOSS######SSS###SSOOOOOOOOOOOOOOOOOOO.....',
        '.............OOOOOOOOOSS######SSS###SSOOOOOOOOOOOOOOOOOOO.....',
        '.............OOOOOOOOOSS######SSS###SSOOkkkkkkkOOOOOOOOOO.....',
        '....GGGGGGGGGOOOOOOOOOSSS####SSSSSSSSSOOkkkkkkkOOOOOOOOOO.....',
        '....GGGGGGGGGOOOOOOOOOSSSSSSSSSSSSSSSSOOkkkkkkkOOOOOOOOOO.....',
        '....GGGGGGGGGOOOOOOOOOSSSSSSSSSSSSSSSSOOkkkkkkkQQQQQQQQQQ.....',
        '....GGGGGGGGGOOOOOOOOOOOOOOOOOOOOOOOOOOOkkkkkkkQQQQQQQQQQ.....',
        '....GGGGGGGGGOOOOOOOOOOOOOOOOOOOOOOOOOOOkkkkkkkQQQQQQQQQQ.....',
        '....GGGGGGGGGOOOOOOOOOOOOOOOOOOOOOOOOOOOkkkkkkkQQQQQQQQQQ.....',
        '....GGGGGGGGGOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOQQQQQQQQQQ.....',
        '....GGGGGGGGG................MMMMM...iiii...........CCCC......',
        '.....GGG.....................MMMMM...iiii...........CCCC......',
        '.....GGG.....................MMMMM...iiii...........CCCC......',
        '.....GGG.....................MMMMM...iiii...........CCCC......',
        '.....GGG.....................MMMMM...iiii...........CCCC......',
        '.....GGG.....................MMMMM...iiii...........CCCC......',
        '.....GGG.....................MMMMM...iiii...........CCCC......',
        '.....GGG.....................MMMMM...iiii...........CCCC......',
        '.....GGG....................AAAAAAAAAAAAAAAEEEE....CCCCCCCCC..',
        '.....GGG..........yyyyyyyyyyAAAAAAAAAAAAAAAEEEE....CCCCCCCCC..',
        '..TTTTTTTT........yyyyyyyyyyAAAAAAAAAAAAAAAEEEEWWWWCCCCCCCCC..',
        '..TTTTTTTT........yy........AAAAAAAAAAAAAAAEEEEWWWWCCCCCCCCC..',
        '..TTTTTTTT........yy........AAAAAAAAAAAAAAAEEEEWWWWCCCCCCCCC..',
        '..TTTTTTTT.LLLLLLLLL........AAAAAAAAAAAAAAAEEEE....CCCCCCCCC..',
        '..TTTTTTTT.LLLLLLLLL...HHHHHAAAAAAAAAAAAAAAEEEEl...CCCCCCCCC..',
        '..TTTTTTTTLLLLLLLLLL...HHHHHAAAAAAAAAAAAAAAEEEE....CCCCCCCCC..',
        '..TTTTTTTTLLLLLLLLLLHHHHHHHHAAAAAAAAAAAAAAAEEEEEEEECCCCCCCCC..',
        '..TTTTTTTTLLLLLLLLLLHHHHHHHHAAAAAAAAAAAAAAAEEEEEEEECCCCCCCCC..',
        '..TTTTTTTTLLLLLLLLLLHHHHHHHHAAAAAAAAAAAAAAAEEEEEEEE...........',
        '..TTTTTTTT.LLLLLLLLL...HHHHHAAAAAAAAAAAAAAA...................',
        '..TTTTTTTT.LLLLLLLLL................Z.........................',
        '..TTTTTTTT....rrrrrrr...............Z.........................',
        '..............rrrrrrr...............o.........................',
        '..............rrrrrrr................o........................',
        '..............rrrrrrr.........................................',
        '..............rrrrrrr.........................................',
        '..............rrrrrrr.........................................',
        '..............................................................',
        '..............................................................',
      ],
    },
    {
      name: 'Catwalks',
      y: z(200),
      overlay: true,
      rows: [
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '...........................................VVVV...............',
        '...........................................VVVV...............',
        '...........................................VVVV...............',
        '...........................................VVVV...............',
        '...........................................VVVV...............',
        '.....................................FFFFFFVVVV...............',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
        '..............................................................',
      ],
    },
  ],
  legend: {
    // lower level
    B: { n: 'B Site', k: 'site', h: B, s: 'B' },
    X: { n: 'Toxic', k: 'room', h: B },
    P: { n: 'Ramp', k: 'ramp', r: [B, 0], dir: 'w' },
    D: { n: 'Decon', k: 'room', h: B },
    w: { n: 'Window', k: 'room', h: B },
    d: { n: 'Double Doors', k: 'room', h: B, s: 'Doors' },
    s: { n: 'Secret', k: 'room', h: B },
    q: { n: 'Secret Ramp', k: 'ramp', r: [B, 0], dir: 'n', s: 'Secret' },
    u: { n: 'Vents Tube', k: 'room', h: B, s: 'Vents' },
    // upper level
    O: { n: 'Outside', k: 'room', h: 0 },
    S: { n: 'Silo', k: 'room', h: 0 },
    '#': { n: 'Silo Tank', k: 'solid' },
    k: { n: 'Container', k: 'room', h: 0 },
    Q: { n: 'Secret Top', k: 'room', h: 0, s: 'Secret' },
    G: { n: 'Garage', k: 'room', h: 0 },
    T: { n: 'T Spawn', k: 'orange', h: 0 },
    L: { n: 'Lobby', k: 'room', h: 0 },
    y: { n: 'Squeaky', k: 'room', h: 0 },
    H: { n: 'Hut', k: 'room', h: 0 },
    A: { n: 'A Site', k: 'site', h: 0, s: 'A' },
    M: { n: 'Main', k: 'room', h: 0 },
    i: { n: 'Mini', k: 'room', h: 0 },
    E: { n: 'Hell', k: 'room', h: 0 },
    l: { n: 'Heaven Tube', k: 'room', h: 0, s: 'Tube' },
    W: { n: 'Heaven Stairs', k: 'ramp', r: [0, z(200)], dir: 'w', s: 'Stairs' },
    C: { n: 'CT Spawn', k: 'cyan', h: 0 },
    r: { n: 'Ramp Room', k: 'room', h: 0, s: 'Ramp' },
    Z: { n: 'Vents', k: 'room', h: 0 },
    o: { n: 'Vent Shaft', k: 'void' },
    // catwalks
    V: { n: 'Heaven', k: 'room', h: z(200) },
    F: { n: 'Rafters', k: 'room', h: z(200) },
  },
  links: [
    // suction tubes instead of the real map's ladders (one way, up); bots never use them
    ['u', 'Z', 'tube', true],
    ['l', 'V', 'tube', true],
  ],
  props: [
    { x: 41.549, y: 7.774, w: 0.902, d: 0.451, h: 2.6, l: 1, kind: 'crate' },
    { x: 44.774, y: 10.549, w: 0.451, d: 0.902, h: 2.6, l: 1, kind: 'crate' },
    { x: 6.815, y: 9.631, w: 0.369, d: 0.738, h: 1.8, l: 1, kind: 'car' },
    { x: 16.856, y: 5.856, w: 0.287, d: 0.287, h: 1.3, l: 1, kind: 'crate' },
    { x: 50.856, y: 4.856, w: 0.287, d: 0.287, h: 1.3, l: 1, kind: 'crate' },
    { x: 33.815, y: 28.815, w: 0.369, d: 0.369, h: 1.4, l: 1, kind: 'crate' },
    { x: 34.856, y: 30.856, w: 0.287, d: 0.287, h: 2.2, l: 1, kind: 'crate' },
    { x: 29.856, y: 23.856, w: 0.287, d: 0.287, h: 1.2, l: 1, kind: 'crate' },
    { x: 38.856, y: 17.856, w: 0.287, d: 0.287, h: 1.2, l: 1, kind: 'crate' },
    { x: 28.856, y: 30.856, w: 0.287, d: 0.287, h: 1.2, l: 1, kind: 'crate' },
    { x: 40.836, y: 30.897, w: 0.328, d: 0.205, h: 1, l: 1, kind: 'wall' },
    { x: 14.856, y: 30.856, w: 0.287, d: 0.287, h: 1.2, l: 1, kind: 'crate' },
    { x: 33.815, y: 28.815, w: 0.369, d: 0.369, h: 1.6, kind: 'crate' },
    { x: 37.815, y: 32.856, w: 0.369, d: 0.287, h: 1.2, kind: 'crate' },
    { x: 39.856, y: 26.856, w: 0.287, d: 0.287, h: 2, kind: 'crate' },
    { x: 27.897, y: 34.897, w: 0.205, d: 0.205, h: 1.1, kind: 'barrel' },
    { x: 28.897, y: 37.897, w: 0.205, d: 0.205, h: 1.1, kind: 'barrel' },
    { x: 44.856, y: 29.897, w: 0.287, d: 0.205, h: 1, kind: 'wall' },
  ],
  signs: [
    { x: 10, y: 24, l: 1, face: 'w', text: 'OUTSIDE ↑' },
    { x: 10, y: 34, l: 1, face: 'w', text: 'LOBBY →' },
    { x: 4, y: 20, l: 1, face: 'e', text: 'T SPAWN ↓' },
    { x: 13, y: 14, l: 1, face: 'w', text: 'GARAGE' },
    { x: 15, y: 26, l: 1, face: 's', text: 'A ↑' },
    { x: 20, y: 33, l: 1, face: 'w', text: 'HUT →' },
    { x: 12, y: 35, l: 1, face: 'n', text: 'RAMP ↓' },
    { x: 17, y: 41, l: 1, face: 'n', text: 'B ↓' },
    { x: 24, y: 22, l: 1, face: 's', text: 'SQUEAKY' },
    { x: 25, y: 27, l: 1, face: 's', text: 'HUT' },
    { x: 28, y: 18, l: 1, face: 'e', text: 'MAIN' },
    { x: 36, y: 18, l: 1, face: 'e', text: 'MINI' },
    { x: 28, y: 14, l: 1, face: 'n', text: 'A ↓' },
    { x: 57, y: 12, l: 1, face: 'w', text: 'SECRET ↓' },
    { x: 30, y: 2, l: 1, face: 's', text: 'SILO' },
    { x: 35, y: 21, l: 1, face: 's', text: 'A SITE' },
    { x: 35, y: 34, l: 1, face: 'e', text: 'VENTS' },
    { x: 55, y: 32, l: 1, face: 'n', text: 'A ←' },
    { x: 51, y: 21, l: 1, face: 's', text: 'HEAVEN ←' },
    { x: 51, y: 15, l: 1, face: 'e', text: 'OUTSIDE ↑' },
    { x: 46, y: 14, l: 1, face: 'n', text: 'SECRET ↓' },
    { x: 28, y: 31, face: 's', text: 'TOXIC' },
    { x: 35, y: 37, face: 'n', text: 'B SITE' },
    { x: 44, y: 26, face: 's', text: 'DECON' },
    { x: 44, y: 37, face: 'n', text: 'WINDOW' },
    { x: 41, y: 20, face: 's', text: 'SECRET →' },
    { x: 48, y: 24, face: 'n', text: 'SECRET ↑' },
  ],
};

export const buildNuke = (): LevelDef => buildGraybox(NUKE_LAYOUT);
