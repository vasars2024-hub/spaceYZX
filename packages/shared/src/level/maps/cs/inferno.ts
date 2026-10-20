// Inferno (CS2 classic) rebuilt as a graybox (level/graybox.ts) at about 3× its real size: our
// players sprint at 9 m/s, dash and jetpack, so CS distances would feel tiny.
//
// Scale: one grid cell = 64 CS units; CS units → metres × 0.0254, then × SCALE (3)
// across, so a cell is 64 × 0.0254 × 3 ≈ 4.88 m and the map is 68 × 58 cells ≈ 332 × 283 m.
// Heights: CS height differences × VSCALE (1.5), floors given in CS units through z().
// North (row 0) is up on the CS radar. Orange = T (attackers), Cyan = CT (defenders).
//
// Callouts (radar positions):
//   T side (south-west): T Spawn, T Ramp (up east), Second Mid (alley + ramp into Mid), T Apps
//   Apartments (south, upper floor, +9 m): Apartments Stairs, Apartments, Boiler (+ Boiler
//     Stairs down to Short), Balcony (drop onto Short / A)
//   Mid: Mid, Mid Ramp, Top Mid, Arch (north to Arch Side), Short (east to A)
//   A (east): A Site with Truck, Library (north-west room, door onto A), Arch Side, CT (from CT
//     Spawn), Graveyard (east, drop into Pit), Pit (sunken, Pit Ramp up to A)
//   Banana (centre-west, rises north): Lower Banana, Banana, Top Banana with Car and Logs
//   B (north): B Site with Dark, New Box, Fountain, Coffins; Church (north), Construction (east,
//     toward CT), CT Path (Construction → CT Spawn)
//   CT Spawn (north-east): CT Path to B, Arch Side to Mid, CT to A
// Built from rectangles by a generator; edit the rows by hand from here on.
import type { LevelDef } from '../../types';
import { buildGraybox, type GrayboxLayout } from '../../graybox';

/** horizontal scale against the real map */
export const INFERNO_SCALE = 3;
/** CS units per grid cell */
const UNITS_PER_CELL = 64;
/** height scale against the real map (CS height differences) */
const VSCALE = 1.5;
const CS_UNIT_M = 0.0254;
/** a CS height (units above T Spawn) in metres */
const z = (u: number) => Number((u * CS_UNIT_M * VSCALE).toFixed(2));

export const INFERNO_LAYOUT: GrayboxLayout = {
  name: 'Inferno',
  cellM: UNITS_PER_CELL * CS_UNIT_M * INFERNO_SCALE,
  theme: 'italian',
  cover: false,
  layers: [
    {
      name: 'Town',
      y: 0,
      rows: [
        '....................................................................',
        '....................................................................',
        '........................hhhhh.......................................',
        '........................hhhhh.......................................',
        '........................hhhhh.......................................',
        '.........................hhh........................................',
        '....................dddBBBBBBoooo...................................',
        '....................dddBBBBBBoooo...................................',
        '....................dddBBBBBBoooo...................................',
        '....................BBBBBBBBBooookkkkkkkkkkk........................',
        '....................BBBnnnBBBBBBBkkkkkkkkkkk........................',
        '....................BBBnnnBBBBBBBkkkkkkkkkkk........................',
        '....................BBBnnnBBBBBBBkkkkkkkkkkk........................',
        '....................BBBBBBfffBBBBkkkkkkkkkkk........................',
        '....................BBBBBBfffBBBBkkkkkkkkkkk........................',
        '....................BBBBBBfffBBBB.......KKKK........................',
        '....................BBBBBBBBBBBBB.......KKKK........................',
        '....................BBBBBBBBBBBBB.......KKKK........................',
        '....................BBBBBBBBBBBBB.......KKKK........................',
        '....................BBBBBBBBBBBBB.......KKKK........................',
        '....................ccqqll..............KKKK........................',
        '....................ccqqll................xxxxxxxxxxxxxxZZZZZZZZZZ..',
        '....................ccqqll................xxxxxxxxxxxxxxZZZZZZZZZZ..',
        '....................qqqqqq................xxxxxxxxxxxxxxZZZZZZZZZZ..',
        '....................qqqqqq................xxxxxxxxxxxxxxZZZZZZZZZZ..',
        '....................qqqqqq..............................ZZZZZZZZZZ..',
        '....................qqqqqq.......................vvvvvvvZZZZZZZZZZ..',
        '....................qqqqqq.......................vvvvvvvZZZZZZZZZZ..',
        '.....................bbbb........................vvvvvvvZZZZZZZZZZ..',
        '.....................bbbb........................vvvvvvv...CCCCC....',
        '.....................bbbb........................vvvvv.....CCCCC....',
        '.....................bbbb.....................vvvvvv.......CCCCC....',
        '.....................bbbb.....................vvvvvv.......CCCCC....',
        '.....................bbbb.....................vvvvvv.......CCCCC....',
        '.....................bbbb.....................vvvvvvyyyyyy.CCCCC....',
        '.....................bbbb.....................vvvvvvyyyyyy.CCCCC....',
        '.....................bbbb...................RRRRR...yyyyyy.CCCCC....',
        '.....................jjjjj..................RRRRR...yyyyyy.CCCCC....',
        '.....................jjjjj..................RRRRR...yyyyyy.CCCCC....',
        '.....................jjjjj..................ttttt.......yy.CCCCC....',
        '.....................jjjjj..................ttttt.......AAAAAzzzzgg.',
        '.....................jjjjj..................ttttt.......AAAAAzzzzgg.',
        '.....................jjjjjmmmmmmmmmmmmmMMMMttttttsssssssAAAAAAAAAgg.',
        '............rrrrrrrrrjjjjjmmmmmmmmmmmmmMMMMttttttsssssssAAAAAAAAAgg.',
        '....TTTTTTTTrrrrrrrrrjjjjjmmmmmmmmmmmmmMMMMttttttsssssssAAAAAAAAAgg.',
        '....TTTTTTTTrrrrrrrrrjjjjjmmmmmmmmmmmmmMMMMttttttsssssssAAAAAAAAAgg.',
        '....TTTTTTTTrrrrrrrrrjjjjj.EEE.............ttttttsssssssAAAAAAAAAgg.',
        '....TTTTTTTT...............EEE...................sssssssAAAAAAAAAgg.',
        '....TTTTTTTT...............EEE...................sssssssAAAAAAAAAgg.',
        '....TTTTTTTT...............EEE...................QQQ.YYYY....III.gg.',
        '....TTTTTTTTeeeeeeeeeeeeeeeeee...aaaaaaa.........QQQ.YYYY....III.gg.',
        '....TTTTTTTTeeeeeeeeeeeeeeeeee...aaaaaaa.........QQQ.YYYY....III.gg.',
        '....TTTTTTTT.....................aaaaaaa........LLLLLYYYY.iiiiiiiii.',
        '.........ppppppppppppppPPPPPaaaaaaaaaaaaa.aaaaaaLLLLLYYYY.iiiiiiiii.',
        '.........ppppppppppppppPPPPPaaaaaaaaaaaaaaaaaaaaLLLLL.....iiiiiiiii.',
        '................................................LLLLL.....iiiiiiiii.',
        '................................................LLLLL...............',
        '....................................................................',
      ],
    },
  ],
  legend: {
    T: { n: 'T Spawn', k: 'orange', h: 0 },
    r: { n: 'T Ramp', k: 'ramp', r: [0, z(60)], dir: 'e' },
    e: { n: 'Second Mid', k: 'room', h: 0, s: '2nd Mid' },
    E: { n: 'Second Mid Ramp', k: 'ramp', r: [0, z(60)], dir: 'n', s: '2nd Mid' },
    p: { n: 'T Apps', k: 'room', h: 0 },
    P: { n: 'Apartments Stairs', k: 'ramp', r: [0, z(240)], dir: 'e', s: 'Apps Stairs' },
    a: { n: 'Apartments', k: 'room', h: z(240), s: 'Apps' },
    L: { n: 'Boiler', k: 'room', h: z(240) },
    Q: { n: 'Boiler Stairs', k: 'ramp', r: [z(110), z(240)], dir: 's', s: 'Boiler' },
    Y: { n: 'Balcony', k: 'room', h: z(240) },
    j: { n: 'Lower Banana', k: 'room', h: z(60), s: 'Low Banana' },
    b: { n: 'Banana', k: 'ramp', r: [z(60), z(150)], dir: 'n' },
    q: { n: 'Top Banana', k: 'room', h: z(150), s: 'Top Ban' },
    c: { n: 'Car', k: 'room', h: z(150) },
    l: { n: 'Logs', k: 'room', h: z(150) },
    B: { n: 'B Site', k: 'site', h: z(150), s: 'B' },
    d: { n: 'Dark', k: 'room', h: z(150) },
    n: { n: 'New Box', k: 'room', h: z(150) },
    f: { n: 'Fountain', k: 'room', h: z(150) },
    o: { n: 'Coffins', k: 'room', h: z(150) },
    h: { n: 'Church', k: 'room', h: z(150) },
    k: { n: 'Construction', k: 'room', h: z(150), s: 'Constr.' },
    K: { n: 'CT Path Ramp', k: 'ramp', r: [z(110), z(150)], dir: 'n', s: 'CT Path' },
    x: { n: 'CT Path', k: 'room', h: z(110) },
    m: { n: 'Mid', k: 'room', h: z(60) },
    M: { n: 'Mid Ramp', k: 'ramp', r: [z(60), z(110)], dir: 'e', s: 'Mid' },
    t: { n: 'Top Mid', k: 'room', h: z(110) },
    R: { n: 'Arch', k: 'room', h: z(110) },
    v: { n: 'Arch Side', k: 'room', h: z(110) },
    y: { n: 'Library', k: 'room', h: z(110), s: 'Lib' },
    Z: { n: 'CT Spawn', k: 'cyan', h: z(110) },
    C: { n: 'CT', k: 'room', h: z(110) },
    s: { n: 'Short', k: 'room', h: z(110) },
    A: { n: 'A Site', k: 'site', h: z(110), s: 'A' },
    z: { n: 'Truck', k: 'room', h: z(110) },
    g: { n: 'Graveyard', k: 'room', h: z(110), s: 'Grave' },
    I: { n: 'Pit Ramp', k: 'ramp', r: [z(-20), z(110)], dir: 'n', s: 'Pit' },
    i: { n: 'Pit', k: 'room', h: z(-20) },
  },
  props: [
    { x: 58.815, y: 44.815, w: 0.369, d: 0.369, h: 1.4, kind: 'crate' },
    { x: 59.856, y: 43.856, w: 0.287, d: 0.287, h: 2.2, kind: 'crate' },
    { x: 62.631, y: 40.815, w: 0.738, d: 0.369, h: 2.4, kind: 'car' },
    { x: 56.856, y: 40.856, w: 0.287, d: 0.287, h: 1.2, kind: 'crate' },
    { x: 61.836, y: 46.856, w: 0.328, d: 0.287, h: 1, kind: 'crate' },
    { x: 65.949, y: 42.836, w: 0.103, d: 0.328, h: 0.9, kind: 'wall' },
    { x: 65.949, y: 45.836, w: 0.103, d: 0.328, h: 0.9, kind: 'wall' },
    { x: 65.949, y: 48.836, w: 0.103, d: 0.328, h: 0.9, kind: 'wall' },
    { x: 60.836, y: 53.836, w: 0.328, d: 0.328, h: 1.4, kind: 'crate' },
    { x: 26.733, y: 13.733, w: 0.533, d: 0.533, h: 1, kind: 'wall' },
    { x: 23.836, y: 10.836, w: 0.328, d: 0.328, h: 1.6, kind: 'crate' },
    { x: 30.754, y: 6.897, w: 0.492, d: 0.205, h: 1.1, kind: 'crate' },
    { x: 30.754, y: 8.897, w: 0.492, d: 0.205, h: 1.1, kind: 'crate' },
    { x: 20.856, y: 6.856, w: 0.287, d: 0.287, h: 1.3, kind: 'crate' },
    { x: 27.856, y: 10.856, w: 0.287, d: 0.287, h: 1.2, kind: 'crate' },
    { x: 20.856, y: 20.754, w: 0.287, d: 0.492, h: 1.5, kind: 'car' },
    { x: 24.815, y: 20.897, w: 0.369, d: 0.205, h: 1, kind: 'wall' },
    { x: 22.815, y: 23.938, w: 0.369, d: 0.123, h: 1, kind: 'wall' },
    { x: 35.938, y: 9.938, w: 0.123, d: 0.123, h: 4, kind: 'pillar' },
    { x: 40.938, y: 9.938, w: 0.123, d: 0.123, h: 4, kind: 'pillar' },
    { x: 38.815, y: 12.877, w: 0.369, d: 0.246, h: 1.2, kind: 'crate' },
    { x: 31.856, y: 42.856, w: 0.287, d: 0.287, h: 1.2, kind: 'crate' },
    { x: 45.836, y: 42.897, w: 0.328, d: 0.205, h: 1, kind: 'wall' },
  ],
  signs: [
    { x: 12, y: 42, face: 's', text: 'BANANA →' },
    { x: 12, y: 47, face: 'n', text: 'MID →' },
    { x: 12, y: 49, face: 's', text: 'MID →' },
    { x: 8, y: 53, face: 'n', text: 'APPS →' },
    { x: 20, y: 40, face: 'e', text: 'B ↑' },
    { x: 26, y: 38, face: 'w', text: 'BANANA ↑' },
    { x: 26, y: 41, face: 's', text: 'MID →' },
    { x: 19, y: 26, face: 'e', text: 'B SITE' },
    { x: 31, y: 20, face: 'n', text: 'BANANA ↓' },
    { x: 44, y: 12, face: 'w', text: 'CT →' },
    { x: 26, y: 1, face: 's', text: 'CHURCH' },
    { x: 49, y: 40, face: 'w', text: 'ARCH ↑' },
    { x: 47, y: 47, face: 'n', text: 'A →' },
    { x: 46, y: 30, face: 's', text: 'CT ↑' },
    { x: 54, y: 33, face: 's', text: 'LIBRARY' },
    { x: 55, y: 41, face: 's', text: 'A →' },
    { x: 65, y: 20, face: 's', text: 'B ←' },
    { x: 64, y: 33, face: 'w', text: 'A ↓' },
    { x: 29, y: 52, face: 's', text: 'APPS' },
    { x: 50, y: 57, face: 'n', text: 'BOILER' },
    { x: 57, y: 51, face: 'w', text: 'BALCONY' },
    { x: 57, y: 54, face: 'e', text: 'PIT' },
    { x: 67, y: 45, face: 'w', text: 'GRAVEYARD' },
    { x: 35, y: 46, face: 'n', text: 'SECOND MID' },
  ],
};

export const buildInferno = (): LevelDef => buildGraybox(INFERNO_LAYOUT);
