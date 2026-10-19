// Split Deck, redesigned (the 2026 map rework): a graybox built from the checked tile layout
// (level/graybox.ts) so the new layout can be walked, botted and playtested before it gets real
// geometry. 4 m cells; Cyan (defenders in Bomb) spawn north, Orange south.
//   - A Deck (high, +6): reached by A Long (east ramp), A Short (from Mid Hall) and Cyan Ramp
//   - B Hold (low, -5): reached by B Tunnels, Keel Vent (from Mid Hall) and Cyan Stairs
//   - Mid Hall is the open middle, the Catwalk (+4) crosses over it from Cat Stairs
// Keel Vent is a gravity lift in the design; the graybox builds it as stairs for now.
import type { LevelDef } from '../types';
import { buildGraybox, type GrayboxLayout } from '../graybox';

export const SPLIT_DECK_LAYOUT: GrayboxLayout = {
  name: 'Split Deck (graybox)',
  cellM: 4,
  layers: [
    {
      name: 'Ground',
      y: 0,
      rows: [
        '.........CCCCCCCC.........',
        '.........CCCCCCCC.........',
        '..wwwwwwwCCCCCCCCeeeeeee..',
        '..w......CCCCCCCC......e..',
        '..w.........mm.........e..',
        '..w.........mm.........e..',
        'BBBBBBBB....mm....AAAAAAAA',
        'BBBBBBBB..MMMMMM..AAAAAAAA',
        'BBBBBBBB..MMMMMMSSAAAAAAAA',
        'BBBBBBBB..MMMMMM..AAAAAAAA',
        'BBBBBBBB..MMMMMM..AAAAAAAA',
        'BBBBBBBBkkMMMMMM..AAAAAAAA',
        '...tt.....MMMMMM.......aa.',
        '...tt.....MMMMMM.......aa.',
        '...tt.......xxKK.......aa.',
        '..uuuuu.....xx.........aa.',
        '..uuuuuzzzzzxx.........aa.',
        '..uuuuu.....xx.........aa.',
        '.....qq.....xx.........aa.',
        '.....qq.....xx.........aa.',
        '.....qqqqOOOOOOOOyyyyyyyy.',
        '.........OOOOOOOOyyyyyy...',
        '.........OOOOOOOO.........',
        '.........OOOOOOOO.........',
      ],
    },
    {
      name: 'Catwalk',
      y: 4,
      overlay: true,
      rows: [
        ...Array(8).fill('..........................'),
        ...Array(6).fill('..............WW..........'),
        ...Array(10).fill('..........................'),
      ],
    },
  ],
  legend: {
    C: { n: 'Cyan Spawn', k: 'cyan', h: 2 },
    O: { n: 'Orange Spawn', k: 'orange', h: 0 },
    A: { n: 'A Deck', k: 'site', h: 6 },
    B: { n: 'B Hold', k: 'site', h: -5 },
    M: { n: 'Mid Hall', k: 'room', h: 0 },
    m: { n: 'Mid Doors', k: 'ramp', r: [0, 2], dir: 'n' },
    S: { n: 'A Short', k: 'ramp', r: [0, 6], dir: 'e' },
    W: { n: 'Catwalk', k: 'room', h: 4 },
    K: { n: 'Cat Stairs', k: 'ramp', r: [0, 4], dir: 'e' },
    k: { n: 'Keel Vent', k: 'gravity', r: [-5, 0], dir: 'e' },
    e: { n: 'Cyan Ramp', k: 'ramp', r: [2, 6] },
    w: { n: 'Cyan Stairs', k: 'ramp', r: [-5, 2] },
    x: { n: 'Lower Mid', k: 'room', h: 0 },
    z: { n: 'Mid Link', k: 'room', h: 0 },
    t: { n: 'B Tunnels', k: 'ramp', r: [-5, 0], dir: 's' },
    u: { n: 'Tunnel Room', k: 'room', h: 0 },
    q: { n: 'Outer Tunnels', k: 'room', h: 0 },
    a: { n: 'A Long', k: 'ramp', r: [0, 6], dir: 'n' },
    y: { n: 'Long Yard', k: 'room', h: 0 },
  },
  // 3v3 and smaller: the east long route and the mid crossings close (layout sizes.mjs)
  sizes: { 3: ['y', 'a', 'm', 'z', 'k', 'K', 'W'] },
};

export const buildSplitDeckGraybox = (): LevelDef => buildGraybox(SPLIT_DECK_LAYOUT);
