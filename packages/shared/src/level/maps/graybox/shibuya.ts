// Shibuya: the royale mega map (free-for-all elimination for 5–10 players, LevelDef.royale) — a
// graybox remodel of Shibuya, Tokyo, about 1 km across (160 × 160 cells of 6 m = 960 m, ten
// times a normal map). It is built by level/graybox.ts like every other graybox map, but the
// tile grid is too big to type by hand, so this file PAINTS it: every district below is a few
// plain commands ("a street here", "a row of shops there", "a deck on top") that fill the four
// layer grids, and the grids are then handed to buildGraybox.
//
// The four layers (lowest first):
//   0  Underground (−6 m): the metro concourse under the crossing and the station, and the
//      Shibuya River channel (−4 m), open to the sky where no street bridges it
//   1  Street (0 m): the city at street level; '.' there is a building up to 7.5 m
//   2  Upper (8 m): the JR viaduct, the station platforms, Mark City, Miyashita Park's roof, the
//      Ginza line, the garage roof and the whole Dogenzaka hill west of the crossing (its streets
//      are 8 m up); '.' there makes a building rise to 15.5 m
//   3  Sky (16 m): Shibuya Sky on top of Scramble Square and a few high roofs; '.' there makes a
//      tower rise to the map's full height
// ' ' (open air) in a layer means nothing there: a street's sky, the river's open channel, a
// stairwell.
//
// Districts (north is row 0): Udagawacho back alleys (NW) and the Udagawa parking lot, Jinnan and
// NHK Plaza (N), Miyashita Park on its long low building beside the JR viaduct (N), Aoyama /
// Hikarie with the covered arcade and a garage with a roof deck (E), the Scramble Crossing in the
// middle with Hachikō Square and Shibuya Station east of it (Scramble Square + Shibuya Sky on the
// station's corner), Center Gai and Bunkamura-dori going west, Dogenzaka climbing west onto the
// hill (Shinsen, Dogenzaka Upper, Maruyama-cho), Mark City (a long covered walkway at 8 m from the
// hill to the station platforms), Route 246 across the south, Sakuragaoka and its parking lot
// (SW), Shibuya Bridge (S), Higashi and the Shibuya River (Shibuya Stream) down to Ebisu Gate (SE).
//
// Ways up: smooth stairs / ramps (bots walk them) to every main level, plus a few suction tubes
// onto high roofs (one way, players only) and two jump pads out of the river.
//
// The network sends positions within ±512 m, so the built level is moved to be centred on the
// origin (shiftLevel below). Royale data: 11 fixed spawn points, one per outer district, all
// about 250 m or more apart; the zone shrinks toward the Scramble Crossing.
import { v3, type Vec3 } from '../../../math/vec3';
import type { LevelDef, SpawnDef } from '../../types';
import {
  buildGraybox,
  type GrayboxArea,
  type GrayboxLayout,
  type GrayboxLink,
  type GrayboxProp,
  type GrayboxSign,
} from '../../graybox';

/** cells across (both ways) */
const N = 160;
/** metres per cell */
const CELL = 6;
/** the built level is moved by this much (x and z) so the map is centred on the origin */
const HALF = (N * CELL) / 2;

const WALL = '.';
const AIR = ' ';
const METRO = 0;
const STREET = 1;
const UPPER = 2;
const SKY = 3;
const LAYER_Y = [-6, 0, 8, 16];

// ---- the legend: every named area -----------------------------------------------------------
const room = (n: string, h?: number, s?: string): GrayboxArea => ({
  n,
  k: 'room',
  ...(h !== undefined ? { h } : {}),
  ...(s ? { s } : {}),
});
const ramp = (n: string, r: [number, number], dir: 'n' | 's' | 'e' | 'w'): GrayboxArea => ({
  n,
  k: 'ramp',
  r,
  dir,
});

const LEGEND: Record<string, GrayboxArea> = {
  [AIR]: { n: 'Open air', k: 'void' },
  // street level (0 m)
  X: room('Scramble Crossing', undefined, 'Scramble'),
  H: room('Hachiko Square', undefined, 'Hachiko'),
  C: room('Center Gai'),
  c: room('Center Gai Shops', undefined, 'CG Shops'),
  B: room('Bunkamura-dori', undefined, 'Bunkamura'),
  u: room('Udagawa Alleys', undefined, 'Udagawa'),
  U: room('Udagawa Shops'),
  P: room('Udagawa Parking', undefined, 'Parking'),
  I: room('Inokashira-dori', undefined, 'Inokashira'),
  K: room('Koen-dori'),
  N: room('Jinnan'),
  n: room('Jinnan Shops'),
  Y: { n: 'NHK Plaza', k: 'cyan' },
  j: room('Miyashita-dori'),
  W: room('Miyashita Shops'),
  S: room('Station Concourse', undefined, 'Station'),
  Q: room('Scramble Square Lobby', undefined, 'Sq. Lobby'),
  r: room('South Exit'),
  M: room('Meiji-dori'),
  R: room('Route 246', undefined, '246'),
  E: room('Aoyama'),
  e: room('Aoyama Shops'),
  A: room('Hikarie Arcade', undefined, 'Arcade'),
  q: room('Aoyama Parking'),
  a: room('Garage'),
  f: room('Dogenzaka South', undefined, 'Dogen. S'),
  t: room('Dogenzaka South Shops'),
  g: room('Shibuya Bridge', undefined, 'Bridge'),
  z: room('Bridge Shops'),
  G: room('Sakuragaoka'),
  s: room('Sakuragaoka Shops'),
  p: room('Sakuragaoka Parking'),
  o: room('Higashi'),
  i: room('Higashi Shops'),
  O: { n: 'Ebisu Gate', k: 'orange' },
  // the hill and the decks (8 m)
  F: room('Shinsen', 8),
  L: room('Dogenzaka Upper', 8, 'Dogen. Up'),
  l: room('Maruyama-cho', 8, 'Maruyama'),
  h: room('Hill Shops', 8),
  V: room('JR Viaduct', 8, 'Viaduct'),
  T: room('Station Platforms', 8, 'Platforms'),
  Z: room('Mark City', 8),
  J: room('Miyashita Park', 8, 'Miyashita'),
  b: room('Ginza Line', 8),
  k: room('Garage Roof', 8),
  // high up (16 m)
  y: room('Shibuya Sky', 16, 'Sky'),
  // underground
  m: room('Metro Concourse', -6, 'Metro'),
  w: room('Shibuya River', -4, 'River'),
  // roofs reached by suction tubes only (players; bots stay off them)
  '{': room('QFRONT Roof', 16),
  '}': room('109 Roof', 16),
  '[': room('Udagawa Roof', 8),
  ']': room('Hikarie Terrace', 16),
  '(': room('Sakuragaoka Roof', 8),
  ')': room('Higashi Roof', 8),
  // tube mouths: one-cell nooks off a street (a bot walking past never steps in)
  ',': room('Tube QFRONT'),
  ':': room('Tube 109'),
  ';': room('Tube Udagawa'),
  _: room('Tube Hikarie'),
  '`': room('Tube Sakuragaoka'),
  '|': room('Tube Higashi'),
  // river bays with a jump pad back up to the street
  '@': room('River Pad North', -4),
  '/': room('River Pad South', -4),
  // stairs and ramps (each flight its own area: its height runs along `dir`)
  D: ramp('Dogenzaka', [0, 8], 'w'),
  '1': ramp('Shinsen Slope', [0, 8], 'w'),
  '0': ramp('Shinsen Stairs', [0, 8], 's'),
  '2': ramp('Love Hotel Hill', [0, 8], 'n'),
  '3': ramp('Hachiko Stairs', [0, 8], 'e'),
  '4': ramp('South Exit Stairs', [0, 8], 'n'),
  '5': ramp('Ginza Stairs', [0, 8], 'w'),
  '6': ramp('Miyashita North Stairs', [0, 8], 's'),
  '7': ramp('Miyashita South Stairs', [0, 8], 'n'),
  '8': ramp('Garage Ramp', [0, 8], 'n'),
  '9': ramp('Sky Stairs', [8, 16], 'n'),
  '=': ramp('Viaduct North Stairs', [0, 8], 's'),
  '-': ramp('Viaduct South Stairs', [0, 8], 'n'),
  '!': ramp('Metro Station Stairs', [-6, 0], 'n'),
  '#': ramp('Metro Crossing SW', [-6, 0], 'n'),
  $: ramp('Metro Crossing NE', [-6, 0], 'n'),
  '%': ramp('Metro Meiji-dori', [-6, 0], 's'),
  '&': ramp('Metro Bridge', [-6, 0], 's'),
  '^': ramp('Metro Dogenzaka', [-6, 0], 'w'),
  '?': ramp('River Tunnel', [-6, -4], 's'),
  '*': ramp('River Stairs South', [-4, 0], 's'),
  '+': ramp('River Stairs East', [-4, 0], 'e'),
};

// ---- the painter --------------------------------------------------------------------------------
const fill = (c: string) => Array.from({ length: N }, () => Array<string>(N).fill(c));
// (default: buildings 15.5 m tall everywhere; the districts carve the city out of them)
const grid: string[][][] = [fill(WALL), fill(WALL), fill(WALL), fill(AIR)];
const props: GrayboxProp[] = [];
const signs: GrayboxSign[] = [];

const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N;
const set = (l: number, x: number, y: number, c: string) => {
  if (inside(x, y)) grid[l][y][x] = c;
};
const at = (l: number, x: number, y: number) => (inside(x, y) ? grid[l][y][x] : WALL);
/** every cell of the rectangle x0..x1 × y0..y1 (inclusive) */
const each = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  f: (x: number, y: number) => void,
) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) f(x, y);
};
const paint = (l: number, x0: number, y0: number, x1: number, y1: number, c: string) =>
  each(x0, y0, x1, y1, (x, y) => set(l, x, y, c));

/** a street / plaza at street level, open to the sky */
const street = (x0: number, y0: number, x1: number, y1: number, c: string) => {
  paint(STREET, x0, y0, x1, y1, c);
  paint(UPPER, x0, y0, x1, y1, AIR);
  paint(SKY, x0, y0, x1, y1, AIR);
};
type Height = 'low' | 'mid' | 'tall';
/** a solid building: low 7.5 m, mid 15.5 m, tall up to the map's top */
const building = (x0: number, y0: number, x1: number, y1: number, height: Height = 'mid') => {
  paint(STREET, x0, y0, x1, y1, WALL);
  paint(UPPER, x0, y0, x1, y1, height === 'low' ? AIR : WALL);
  paint(SKY, x0, y0, x1, y1, height === 'tall' ? WALL : AIR);
};
/** a ground floor you can walk into (roofed at 7.5 m; the building above stays as it is) */
const groundFloor = (x0: number, y0: number, x1: number, y1: number, c: string, h: Height) => {
  paint(STREET, x0, y0, x1, y1, c);
  paint(UPPER, x0, y0, x1, y1, WALL);
  paint(SKY, x0, y0, x1, y1, h === 'tall' ? WALL : AIR);
};
/** a deck 8 m up (upper layer), open to the sky or roofed */
const deck = (x0: number, y0: number, x1: number, y1: number, c: string, roofed = false) => {
  paint(UPPER, x0, y0, x1, y1, c);
  paint(SKY, x0, y0, x1, y1, roofed ? WALL : AIR);
};
/** the hill: solid ground up to 8 m, its streets in the upper layer */
const hillStreet = (x0: number, y0: number, x1: number, y1: number, c: string) => {
  paint(STREET, x0, y0, x1, y1, WALL);
  deck(x0, y0, x1, y1, c);
};
/** stairs at street level (open to the sky above them) */
const stairs = (x0: number, y0: number, x1: number, y1: number, c: string) =>
  street(x0, y0, x1, y1, c);
/** an underground floor; `open` = a hole in the street over it (stairwell, river channel) */
const under = (x0: number, y0: number, x1: number, y1: number, c: string, open = false) => {
  paint(METRO, x0, y0, x1, y1, c);
  if (open) street(x0, y0, x1, y1, AIR);
};

/** a small deterministic hash (layout variety without any randomness) */
const hash = (a: number, b: number, seed: number) => {
  let h = Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x79b9, 0xc2b2ae35) ^ seed;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 13)) >>> 0;
};

// props: centred on a cell CORNER (the bots walk the lines through the cell centres, so a prop
// there never sits on a waypoint or cuts the way from one cell to the next), on one flat floor
const flat = (l: number, x: number, y: number) => {
  const c = at(l, x, y);
  const a = LEGEND[c];
  return c !== WALL && !!a && a.k !== 'void' && a.k !== 'ramp' && !a.r ? c : null;
};
const heightOf = (l: number, c: string) => LEGEND[c].h ?? LAYER_Y[l];
// (checked once everything is painted: later districts may change the floor under a prop)
const pending: (() => void)[] = [];
const prop = (
  l: number,
  X: number,
  Y: number,
  w: number,
  d: number,
  h: number,
  kind: GrayboxProp['kind'],
) => pending.push(() => placeProp(l, X, Y, w, d, h, kind));
const placeProp = (
  l: number,
  X: number,
  Y: number,
  w: number,
  d: number,
  h: number,
  kind: GrayboxProp['kind'],
): boolean => {
  const x0 = X - w / 2;
  const y0 = Y - d / 2;
  const x1 = X + w / 2;
  const y1 = Y + d / 2;
  let ref: number | null = null;
  for (let cy = Math.floor(y0); cy <= Math.floor(y1 - 1e-6); cy++)
    for (let cx = Math.floor(x0); cx <= Math.floor(x1 - 1e-6); cx++) {
      const c = flat(l, cx, cy);
      if (!c) return false;
      const fh = heightOf(l, c);
      if (ref !== null && Math.abs(fh - ref) > 0.01) return false;
      ref = fh;
      // never on a cell's centre (its waypoint)
      if (Math.abs(cx + 0.5 - X) < w / 2 + 0.1 && Math.abs(cy + 0.5 - Y) < d / 2 + 0.1)
        return false;
    }
  // (not on another prop)
  if (props.some((p) => p.l === l && p.x < x1 && p.x + p.w > x0 && p.y < y1 && p.y + p.d > y0))
    return false;
  props.push({ x: x0, y: y0, w, d, h, l, kind });
  return true;
};
// the CS-style cover pieces (sizes in cells: 1 cell = 6 m)
const car = (l: number, X: number, Y: number, alongX: boolean) =>
  alongX ? prop(l, X, Y, 0.75, 0.32, 1.5, 'car') : prop(l, X, Y, 0.32, 0.75, 1.5, 'car');
const kiosk = (l: number, X: number, Y: number) => prop(l, X, Y, 0.3, 0.3, 2.4, 'crate');
const vending = (l: number, X: number, Y: number) => prop(l, X, Y, 0.2, 0.15, 1.9, 'crate');
const planter = (l: number, X: number, Y: number) => prop(l, X, Y, 0.35, 0.35, 0.9, 'barrel');
const barrier = (l: number, X: number, Y: number, alongX: boolean) =>
  alongX ? prop(l, X, Y, 0.6, 0.06, 1.1, 'wall') : prop(l, X, Y, 0.06, 0.6, 1.1, 'wall');
const crate = (l: number, X: number, Y: number) => prop(l, X, Y, 0.25, 0.25, 1.3, 'crate');
const pillar = (l: number, X: number, Y: number, h = 4) => prop(l, X, Y, 0.15, 0.15, h, 'pillar');

/** a painted sign on the wall nearest floor cell (x, y) of layer l (looking along the floor) */
const sign = (l: number, x: number, y: number, text: string) => {
  const sides: [number, number, GrayboxSign['face']][] = [
    [0, -1, 's'],
    [1, 0, 'w'],
    [0, 1, 'n'],
    [-1, 0, 'e'],
  ];
  for (let k = 1; k <= 8; k++)
    for (const [dx, dy, face] of sides) {
      // (only across floor of this layer: never through a hole or round a corner)
      let open = true;
      for (let j = 0; j < k && open; j++) open = !!flat(l, x + dx * j, y + dy * j);
      if (open && at(l, x + dx * k, y + dy * k) === WALL) {
        signs.push({ x: x + dx * k, y: y + dy * k, l, face, text });
        return;
      }
    }
};

interface District {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** the street lines run every `step` cells from (px, py) */
  px: number;
  py: number;
  step: number;
  street: string;
  shop: string;
  /** 1: at street level; 2: up on the hill */
  level: 1 | 2;
  seed: number;
}
const mod = (a: number, n: number) => ((a % n) + n) % n;
/**
 * A district: 1-cell streets every `step` cells, the blocks between them shops you can walk
 * through (two doors), solid buildings of mixed heights, or a small open square.
 */
const district = (o: District) => {
  const line = (x: number, y: number) => mod(x - o.px, o.step) === 0 || mod(y - o.py, o.step) === 0;
  const floorAt = (x0: number, y0: number, x1: number, y1: number, c: string) =>
    o.level === 1 ? street(x0, y0, x1, y1, c) : hillStreet(x0, y0, x1, y1, c);
  each(o.x0, o.y0, o.x1, o.y1, (x, y) => {
    if (line(x, y)) floorAt(x, y, x, y, o.street);
  });
  for (let bx = o.px + Math.floor((o.x0 - o.px) / o.step) * o.step; bx <= o.x1; bx += o.step)
    for (let by = o.py + Math.floor((o.y0 - o.py) / o.step) * o.step; by <= o.y1; by += o.step) {
      const x0 = Math.max(o.x0, bx + 1);
      const y0 = Math.max(o.y0, by + 1);
      const x1 = Math.min(o.x1, bx + o.step - 1);
      const y1 = Math.min(o.y1, by + o.step - 1);
      if (x1 < x0 || y1 < y0) continue;
      const r = hash(bx, by, o.seed) % 20;
      const tall = r % 4 === 0;
      if (o.level === 1) building(x0, y0, x1, y1, tall ? 'tall' : r === 7 ? 'low' : 'mid');
      else {
        paint(STREET, x0, y0, x1, y1, WALL);
        paint(UPPER, x0, y0, x1, y1, WALL);
        paint(SKY, x0, y0, x1, y1, tall ? WALL : AIR);
      }
      const big = x1 - x0 >= 2 && y1 - y0 >= 2;
      if (big && r < 9) {
        // a shop: the block's inside, a door in the middle of two opposite sides
        const [ix0, iy0, ix1, iy1] = [x0 + 1, y0 + 1, x1 - 1, y1 - 1];
        const mx = (x0 + x1) >> 1;
        const my = (y0 + y1) >> 1;
        const doors: [number, number][] =
          r % 2
            ? [
                [mx, y0],
                [mx, y1],
              ]
            : [
                [x0, my],
                [x1, my],
              ];
        const shopAt = (x: number, y: number) => {
          if (o.level === 1) set(STREET, x, y, o.shop);
          else set(UPPER, x, y, o.shop);
        };
        each(ix0, iy0, ix1, iy1, shopAt);
        for (const [x, y] of doors) shopAt(x, y);
        if (o.level === 2) paint(SKY, x0, y0, x1, y1, WALL); // (a roof over a hill shop)
        // counters and shelves
        const l = o.level === 1 ? STREET : UPPER;
        if (ix1 > ix0 && iy1 > iy0) crate(l, ix0 + 1, iy0 + 1);
        if (ix1 - ix0 >= 2 && iy1 - iy0 >= 2) crate(l, ix1, iy1);
      } else if (big && r >= 17 && o.level === 1) {
        // a small open square with a kiosk and planters
        street(x0, y0, x1, y1, o.street);
        kiosk(STREET, x0 + 1, y0 + 1);
        planter(STREET, x1, y1);
      }
    }
};

// ---- 1. the city's districts ---------------------------------------------------------------
// the edge: a ring of towers
building(0, 0, N - 1, 1, 'tall');
building(0, N - 2, N - 1, N - 1, 'tall');
building(0, 0, 1, N - 1, 'tall');
building(N - 2, 0, N - 1, N - 1, 'tall');

// Udagawacho (NW): back alleys every 7 cells
district({
  x0: 2,
  y0: 2,
  x1: 63,
  y1: 68,
  px: 2,
  py: 2,
  step: 7,
  street: 'u',
  shop: 'U',
  level: 1,
  seed: 1,
});
// Jinnan (N), between Inokashira-dori and the JR viaduct
district({
  x0: 67,
  y0: 2,
  x1: 95,
  y1: 55,
  px: 2,
  py: 2,
  step: 7,
  street: 'N',
  shop: 'n',
  level: 1,
  seed: 2,
});
// Aoyama / Hikarie (E)
district({
  x0: 115,
  y0: 2,
  x1: 157,
  y1: 103,
  px: 115,
  py: 2,
  step: 7,
  street: 'E',
  shop: 'e',
  level: 1,
  seed: 3,
});
// Dogenzaka South: between Mark City and Route 246
district({
  x0: 36,
  y0: 89,
  x1: 69,
  y1: 103,
  px: 36,
  py: 92,
  step: 6,
  street: 'f',
  shop: 't',
  level: 1,
  seed: 4,
});
// Sakuragaoka (SW), Shibuya Bridge (S), Higashi (SE)
district({
  x0: 2,
  y0: 108,
  x1: 59,
  y1: 157,
  px: 2,
  py: 108,
  step: 7,
  street: 'G',
  shop: 's',
  level: 1,
  seed: 5,
});
district({
  x0: 60,
  y0: 108,
  x1: 95,
  y1: 157,
  px: 60,
  py: 108,
  step: 7,
  street: 'g',
  shop: 'z',
  level: 1,
  seed: 6,
});
district({
  x0: 99,
  y0: 108,
  x1: 111,
  y1: 157,
  px: 99,
  py: 108,
  step: 6,
  street: 'o',
  shop: 'i',
  level: 1,
  seed: 7,
});
district({
  x0: 119,
  y0: 108,
  x1: 157,
  y1: 157,
  px: 122,
  py: 108,
  step: 7,
  street: 'o',
  shop: 'i',
  level: 1,
  seed: 8,
});

// ---- 2. the main streets --------------------------------------------------------------------
street(2, 104, 157, 107, 'R'); // Route 246
street(112, 2, 114, 157, 'M'); // Meiji-dori
street(110, 56, 111, 103, 'M'); // (wider beside the station)
street(64, 2, 66, 65, 'I'); // Inokashira-dori
street(76, 2, 78, 65, 'K'); // Koen-dori
street(64, 66, 83, 85, 'X'); // the Scramble Crossing
street(84, 64, 89, 82, 'H'); // Hachikō Square ...
street(84, 56, 95, 63, 'H'); // ... wrapping round the station's north-west corner
street(96, 58, 98, 59, 'H'); // (under the viaduct to Miyashita-dori)
street(99, 2, 111, 61, 'j'); // Miyashita-dori
street(40, 69, 63, 70, 'C'); // Center Gai
street(40, 74, 63, 75, 'B'); // Bunkamura-dori
street(36, 80, 63, 83, 'D'); // Dogenzaka climbs west
stairs(36, 69, 39, 70, '1'); // Shinsen Slope (Center Gai's west end up onto the hill)
street(70, 86, 72, 103, 'g'); // from the crossing south to Route 246 (under Mark City)
street(84, 101, 111, 103, 'r'); // the station's South Exit
street(80, 2, 92, 8, 'Y'); // NHK Plaza (the team modes' cyan spawn)
street(67, 56, 75, 57, 'N'); // (Jinnan's south street)
street(79, 56, 83, 61, 'N');
// the east bank (Shibuya Stream promenade) and the riverside street
street(115, 104, 115, 157, 'o');
street(119, 108, 119, 157, 'o');
street(143, 145, 156, 156, 'O'); // Ebisu Gate (the team modes' orange spawn)
// under the viaduct: underpasses
street(96, 23, 98, 23, 'N');
street(96, 44, 98, 44, 'N');
street(96, 104, 98, 107, 'R');
street(96, 129, 98, 129, 'g');
street(96, 2, 98, 2, 'N');
street(96, 157, 98, 157, 'g');

// ---- 3. Center Gai: shop fronts both sides, open through to the alleys behind -----------------
for (let x = 40; x <= 60; x += 4) {
  // north side (rows 66–68): a 3-wide shop, its door on Center Gai, every other one open at the back
  building(x, 66, x + 3, 68);
  groundFloor(x, 67, x + 2, 67, 'c', 'mid');
  set(STREET, x + 1, 68, 'c');
  if ((x / 4) % 2) set(STREET, x + 1, 66, 'c');
  // between Center Gai and Bunkamura-dori (rows 71–73): doors on both streets
  building(x, 71, x + 3, 73, x === 52 ? 'tall' : 'mid');
  groundFloor(x, 72, x + 2, 72, 'c', 'mid');
  set(STREET, x + 1, 71, 'c');
  set(STREET, x + 1, 73, 'c');
  // between Bunkamura-dori and Dogenzaka (rows 76–79): doors on Bunkamura-dori
  if (x < 56) {
    building(x, 76, x + 3, 79);
    groundFloor(x, 77, x + 2, 78, 'c', 'mid');
    set(STREET, x + 1, 76, 'c');
  }
}
// Shibuya 109: the tall wedge where Bunkamura-dori and Dogenzaka meet
building(56, 76, 63, 79, 'tall');
groundFloor(58, 77, 62, 78, 'c', 'tall');
set(STREET, 60, 76, 'c');
set(STREET, 61, 76, 'c');
set(STREET, 63, 77, 'c');
paint(SKY, 56, 76, 63, 79, '}'); // its roof (tube)
// tube mouths are one-cell nooks off a street (open to the sky, walls on three sides), so a bot
// walking past never steps in
street(57, 76, 57, 76, ':');
// the block south of Dogenzaka (rows 84–85) stays solid; Mark City runs over rows 86–87

// QFRONT (Tsutaya / Starbucks) facing the crossing from the north, a high roof overlooking it
building(67, 58, 75, 65, 'mid');
groundFloor(68, 59, 73, 64, 'c', 'mid');
paint(STREET, 70, 65, 72, 65, 'c'); // (the glass front opens onto the crossing)
set(STREET, 67, 61, 'c'); // (side door to Inokashira-dori)
paint(SKY, 67, 58, 75, 65, '{');
street(75, 61, 75, 61, ','); // tube mouth (off Koen-dori)
// Starbucks' window counters
crate(STREET, 70, 61);
crate(STREET, 73, 63);

// ---- 4. Udagawa: parking lot, a low roof row with a tube ------------------------------------
street(45, 17, 57, 28, 'P');
for (let y = 18; y <= 28; y += 2)
  for (let x = 46; x <= 57; x += 2) if (!(y === 22 || y === 23)) car(STREET, x, y, false);
building(17, 24, 22, 29, 'low');
deck(17, 25, 21, 28, '[');
street(22, 26, 22, 26, ';');

// ---- 5. Shibuya Station, Scramble Square and Shibuya Sky ----------------------------------------
building(90, 64, 109, 100, 'mid');
paint(STREET, 91, 65, 108, 99, 'S');
paint(STREET, 90, 68, 90, 74, 'S'); // west doors (Hachikō)
paint(STREET, 91, 64, 95, 64, 'S'); // north door
paint(STREET, 92, 100, 94, 100, 'S'); // south door
paint(STREET, 109, 80, 109, 84, 'S'); // east door (Meiji-dori)
// the concourse's columns
for (const x of [94, 98, 102, 106]) for (const y of [69, 75, 81, 87, 93]) set(STREET, x, y, WALL);
// the platforms over it, roofed in the middle, the JR viaduct running through
deck(90, 64, 109, 100, 'T');
paint(SKY, 91, 84, 108, 92, WALL);
// (platform buildings on the deck: cover up there)
for (const [x, y] of [
  [93, 70],
  [93, 71],
  [100, 94],
  [101, 94],
  [106, 80],
  [106, 81],
  [92, 96],
])
  set(UPPER, x, y, WALL);
// Scramble Square: the tower on the station's north-east corner, its lobby at street level and
// Shibuya Sky (16 m) on its roof
building(101, 65, 108, 74, 'mid');
paint(STREET, 102, 66, 107, 73, 'Q');
paint(STREET, 104, 74, 105, 74, 'Q'); // to the concourse
paint(STREET, 108, 69, 109, 70, 'Q'); // to Meiji-dori
paint(SKY, 101, 65, 108, 74, 'y');
for (const [x0, y0] of [
  [101, 65],
  [107, 65],
  [107, 73],
])
  paint(SKY, x0, y0, x0 + 1, y0 + 1, WALL); // (the tower's crown corners: cover on the deck)
deck(103, 75, 104, 78, '9'); // Sky Stairs up from the platforms
// stairs up to the platforms
stairs(86, 77, 89, 78, '3'); // from Hachikō Square
stairs(105, 101, 106, 103, '4'); // from the South Exit
// the JR viaduct (north and south of the station)
deck(96, 7, 98, 63, 'V');
deck(96, 101, 98, 152, 'V');
stairs(96, 3, 98, 6, '='); // north end down to the city edge street
stairs(96, 153, 98, 156, '-'); // south end
// the Ginza line comes in from the east over Meiji-dori at 8 m
deck(110, 68, 131, 69, 'b');
stairs(132, 68, 135, 69, '5');
street(136, 66, 136, 71, 'E');

// ---- 6. Miyashita Park: a long low building, shops inside, the park on its roof --------------
building(100, 12, 107, 50, 'mid');
paint(STREET, 101, 13, 106, 49, 'W');
for (const y of [19, 25, 31, 37, 43]) {
  paint(STREET, 101, y, 102, y, WALL);
  paint(STREET, 105, y, 106, y, WALL);
}
for (const y of [20, 30, 40]) set(STREET, 100, y, 'W');
for (const y of [25, 35, 45]) set(STREET, 107, y, 'W');
deck(100, 12, 107, 50, 'J');
deck(99, 30, 99, 33, 'J'); // (a footbridge from the JR viaduct)
stairs(102, 8, 105, 11, '6');
stairs(102, 51, 105, 54, '7');
// the shops on the far side of Miyashita-dori
building(109, 4, 111, 20);
building(109, 26, 111, 46);

// ---- 7. Aoyama: Hikarie, the covered arcade, the parking lot and the garage -------------------
building(116, 73, 121, 78, 'tall'); // Hikarie
groundFloor(117, 74, 119, 77, 'e', 'tall');
set(STREET, 118, 73, 'e');
set(STREET, 116, 76, 'e');
paint(SKY, 116, 73, 121, 78, ']'); // its terrace (tube)
street(121, 75, 121, 75, '_'); // tube mouth
// the covered arcade: a roofed shopping street with shops along it (in the blocks either side)
groundFloor(116, 86, 156, 86, 'A', 'mid');
for (let bx = 116; bx <= 151; bx += 7) {
  building(bx, 80, bx + 5, 85);
  groundFloor(bx, 84, bx + 1, 85, 'e', 'mid');
  groundFloor(bx + 3, 84, bx + 4, 85, 'e', 'mid');
  building(bx, 87, bx + 5, 92);
  groundFloor(bx, 87, bx + 1, 88, 'e', 'mid');
  groundFloor(bx + 3, 87, bx + 4, 88, 'e', 'mid');
}
street(137, 24, 149, 36, 'q');
for (let y = 25; y <= 36; y += 3) for (let x = 138; x <= 149; x += 2) car(STREET, x, y, false);
// the garage: parking inside, a roof deck, a ramp up the outside
building(144, 38, 149, 43, 'low');
paint(STREET, 146, 40, 148, 42, 'a');
set(STREET, 149, 41, 'a');
deck(144, 38, 149, 39, 'k');
deck(146, 40, 149, 43, 'k');
stairs(144, 40, 145, 43, '8');
car(STREET, 147, 41, false);
car(STREET, 148, 42, false);

// ---- 8. the Dogenzaka hill (8 m up, west of the crossing) ---------------------------------------
paint(STREET, 2, 40, 35, 99, WALL);
district({
  x0: 2,
  y0: 40,
  x1: 35,
  y1: 67,
  px: 2,
  py: 40,
  step: 6,
  street: 'F',
  shop: 'h',
  level: 2,
  seed: 9,
});
district({
  x0: 2,
  y0: 68,
  x1: 35,
  y1: 85,
  px: 2,
  py: 40,
  step: 6,
  street: 'L',
  shop: 'h',
  level: 2,
  seed: 10,
});
district({
  x0: 2,
  y0: 86,
  x1: 35,
  y1: 99,
  px: 2,
  py: 40,
  step: 4,
  street: 'l',
  shop: 'h',
  level: 2,
  seed: 11,
});
hillStreet(2, 80, 35, 83, 'L'); // Dogenzaka Upper: the top of the slope
hillStreet(26, 69, 35, 70, 'L'); // the top of Shinsen Slope
hillStreet(14, 40, 15, 99, 'F'); // the hill road north–south
hillStreet(14, 68, 15, 99, 'L');
hillStreet(14, 86, 15, 99, 'l');
hillStreet(20, 86, 21, 99, 'l');
hillStreet(28, 84, 35, 87, 'L'); // Mark City's west gate
stairs(14, 38, 15, 41, '0'); // up from the Udagawa alleys
stairs(20, 100, 21, 103, '2'); // up from Route 246
// Mark City: a covered walkway 8 m up from the hill to the station platforms, open where it
// passes over the crossing (a balcony over it)
deck(36, 86, 89, 87, 'Z', true);

// ---- 9. underground: the metro concourse and the Shibuya River ----------------------------------
under(52, 90, 118, 91, 'm'); // the main concourse, east–west
under(92, 87, 107, 98, 'm'); // the hall under the station
under(80, 71, 85, 72, 'm'); // under the crossing's north-east corner ...
under(84, 73, 85, 89, 'm'); // ... down to the concourse
under(65, 83, 66, 89, 'm'); // under the crossing's south-west corner
under(116, 92, 118, 95, 'm'); // to the river
under(80, 68, 81, 70, '$', true);
under(65, 80, 66, 82, '#', true);
under(99, 84, 100, 86, '!', true);
// (the station stairwell opens under the platform deck)
paint(UPPER, 99, 84, 100, 86, 'T');
paint(SKY, 99, 84, 100, 86, WALL);
under(111, 92, 112, 94, '%', true);
under(71, 92, 72, 94, '&', true);
building(49, 89, 53, 91); // (the block the Dogenzaka stairwell is dug into)
under(49, 90, 51, 91, '^', true);
street(48, 89, 48, 92, 'f');
// the river: a channel 4 m down from the station south to Ebisu, bridged by the streets
under(116, 96, 118, 99, '?');
under(116, 100, 118, 156, 'w', true);
for (const y of [104, 105, 106, 107]) street(116, y, 118, y, 'R'); // Route 246's bridge
for (const y of [122, 136, 150]) street(116, y, 118, y, 'o');
under(116, 153, 118, 156, '*', true); // stairs up at the south end
street(116, 157, 118, 157, 'o');
under(119, 127, 121, 128, '+', true); // stairs up the east bank
street(122, 127, 122, 128, 'o');
under(115, 113, 115, 113, '@', true); // jump-pad bays
under(119, 142, 119, 142, '/', true);

// ---- 10. Sakuragaoka and Higashi: parking, roofs with tubes -------------------------------------
street(38, 123, 50, 135, 'p');
for (let y = 124; y <= 135; y += 3) for (let x = 39; x <= 50; x += 2) car(STREET, x, y, false);
building(24, 116, 29, 121, 'low');
deck(24, 117, 28, 121, '(');
street(29, 119, 29, 119, '`');
building(123, 116, 128, 121, 'low');
deck(123, 116, 127, 120, ')');
street(128, 118, 128, 118, '|');

// ---- 11. cover and signs --------------------------------------------------------------------------
// the crossing: barriers along the kerbs, a police box, planters at the corners
for (let x = 66; x <= 82; x += 3) {
  barrier(STREET, x, 68, true);
  barrier(STREET, x, 84, true);
}
for (let y = 70; y <= 82; y += 3) {
  barrier(STREET, 66, y, false);
  barrier(STREET, 82, y, false);
}
kiosk(STREET, 70, 79); // police box
planter(STREET, 78, 72);
planter(STREET, 70, 72);
planter(STREET, 78, 79);
// Hachikō: the statue, the old green train car, trees
pillar(STREET, 87, 70, 2.5);
prop(STREET, 86, 66, 0.75, 0.35, 2.6, 'car');
for (const [x, y] of [
  [85, 74],
  [88, 74],
  [85, 81],
  [88, 61],
  [92, 58],
])
  pillar(STREET, x, y);
// Center Gai and Bunkamura-dori: kiosks, vending machines, barriers down the middle
for (let x = 41; x <= 63; x += 3) {
  if (x % 2) vending(STREET, x, 70);
  else kiosk(STREET, x, 70);
  if (x % 2) barrier(STREET, x, 75, true);
}
// the wide streets: parked cars and taxis
for (let x = 4; x <= 156; x += 5) {
  car(STREET, x, 105, true);
  if (x % 2) car(STREET, x + 2, 107, true);
}
for (let y = 4; y <= 156; y += 6) car(STREET, 113, y, false);
for (let y = 4; y <= 64; y += 7) {
  car(STREET, 65, y, false);
  car(STREET, 77, y + 3, false);
}
// Miyashita-dori and the station's south exit
for (let y = 4; y <= 60; y += 5) car(STREET, 110, y, false);
for (let x = 86; x <= 110; x += 4) planter(STREET, x, 102);
// the station concourse: ticket gates, kiosks
for (let x = 92; x <= 107; x += 3) barrier(STREET, x, 72, true);
for (const [x, y] of [
  [96, 78],
  [104, 84],
  [96, 90],
  [100, 96],
])
  kiosk(STREET, x, y);
// up on the platforms and the viaduct: trains standing at the platforms, benches, crates
for (let y = 66; y <= 96; y += 6) prop(UPPER, 97, y + 1.5, 0.5, 3, 3.5, 'wall');
for (let y = 10; y <= 150; y += 14)
  if (y < 62 || y > 102) prop(UPPER, 97, y + 1.5, 0.5, 3, 3.5, 'wall');
for (const [x, y] of [
  [92, 67],
  [103, 82],
  [107, 97],
  [92, 88],
])
  crate(UPPER, x, y);
// Miyashita Park's roof: planters, a skate box, benches
for (let y = 15; y <= 48; y += 5) {
  planter(UPPER, 101, y);
  planter(UPPER, 107, y + 2);
}
for (const y of [22, 34, 44]) prop(UPPER, 104, y, 0.6, 0.6, 1.2, 'crate');
// Shibuya Sky, Mark City, the Ginza line, the garage roof
crate(SKY, 104, 68);
crate(SKY, 106, 71);
for (let x = 40; x <= 88; x += 6) crate(UPPER, x, 87);
for (let x = 112; x <= 130; x += 6) crate(UPPER, x, 69);
car(UPPER, 145, 39, true);
car(UPPER, 148, 42, false);
// the hill: vending machines and planters along its streets
for (let x = 4; x <= 34; x += 5) {
  vending(UPPER, x, 81);
  planter(UPPER, x + 2, 83);
}
// the metro: columns in the hall, and the river: debris
for (const x of [94, 98, 102, 106]) for (const y of [90, 95]) pillar(METRO, x, y, 4.5);
for (let y = 102; y <= 154; y += 6) crate(METRO, 117, y);

// district names on the walls (the builder paints them where it has signs)
const SIGNS: [number, number, number, string][] = [
  [STREET, 64, 67, 'SCRAMBLE'],
  [STREET, 83, 84, 'SCRAMBLE'],
  [STREET, 84, 76, 'HACHIKO'],
  [STREET, 40, 69, 'CENTER GAI'],
  [STREET, 63, 69, 'CENTER GAI'],
  [STREET, 40, 74, 'BUNKAMURA-DORI'],
  [STREET, 62, 80, 'DOGENZAKA'],
  [UPPER, 35, 82, 'DOGENZAKA'],
  [STREET, 91, 76, 'SHIBUYA STATION'],
  [STREET, 85, 64, 'SHIBUYA STATION'],
  [UPPER, 100, 75, 'SHIBUYA SKY ↑'],
  [STREET, 104, 72, 'SCRAMBLE SQUARE'],
  [UPPER, 36, 86, 'MARK CITY'],
  [UPPER, 102, 13, 'MIYASHITA PARK'],
  [STREET, 104, 55, 'MIYASHITA PARK ↑'],
  [STREET, 9, 9, 'UDAGAWA'],
  [STREET, 46, 17, 'P'],
  [STREET, 85, 3, 'NHK'],
  [STREET, 72, 9, 'JINNAN'],
  [UPPER, 14, 46, 'SHINSEN'],
  [UPPER, 20, 94, 'MARUYAMA-CHO'],
  [STREET, 9, 115, 'SAKURAGAOKA'],
  [STREET, 38, 124, 'P'],
  [STREET, 72, 108, 'SHIBUYA BRIDGE'],
  [METRO, 116, 103, 'SHIBUYA STREAM'],
  [STREET, 115, 120, 'SHIBUYA STREAM'],
  [STREET, 150, 150, 'EBISU'],
  [METRO, 95, 90, 'METRO'],
  [METRO, 70, 90, 'METRO'],
  [STREET, 50, 105, 'ROUTE 246'],
  [STREET, 113, 30, 'MEIJI-DORI'],
  [STREET, 122, 76, 'HIKARIE'],
  [STREET, 120, 86, 'ARCADE'],
  [STREET, 140, 30, 'P'],
  [UPPER, 120, 68, 'GINZA LINE'],
  [STREET, 59, 77, '109'],
  [STREET, 136, 9, 'AOYAMA'],
  [STREET, 120, 140, 'HIGASHI'],
];
for (const [l, x, y, text] of SIGNS) sign(l, x, y, text);
for (const place of pending) place();

// ---- the layout -------------------------------------------------------------------------------
const tubes: GrayboxLink[] = [
  [',', '{', 'tube', true],
  [':', '}', 'tube', true],
  [';', '[', 'tube', true],
  ['_', ']', 'tube', true],
  ['`', '(', 'tube', true],
  ['|', ')', 'tube', true],
];
const pads: GrayboxLink[] = [
  ['@', 'o', 'pad', true],
  ['/', 'o', 'pad', true],
];

export const SHIBUYA_LAYOUT: GrayboxLayout = {
  name: 'Shibuya',
  cellM: CELL,
  layers: [
    { name: 'Underground (−6 m)', y: LAYER_Y[0], rows: grid[METRO].map((r) => r.join('')) },
    { name: 'Street (0 m)', y: LAYER_Y[1], rows: grid[STREET].map((r) => r.join('')) },
    { name: 'Upper (8 m)', y: LAYER_Y[2], rows: grid[UPPER].map((r) => r.join('')) },
    { name: 'Sky (16 m)', y: LAYER_Y[3], rows: grid[SKY].map((r) => r.join('')) },
  ],
  legend: LEGEND,
  links: [...tubes, ...pads],
  theme: 'city',
  props,
  signs,
  autoSigns: false,
  cover: false,
  waypointEvery: 2,
};

// ---- royale data ---------------------------------------------------------------------------------
/**
 * The royale spawn points: one in each outer district (cell x, y, layer), each about 250 m or
 * more from the others; the round uses as many as there are players, as far apart as possible.
 */
export const SHIBUYA_ROYALE_SPOTS: { name: string; x: number; y: number; l: number }[] = [
  { name: 'Udagawacho', x: 12, y: 9, l: STREET },
  { name: 'Udagawa North', x: 58, y: 9, l: STREET },
  { name: 'Miyashita Park', x: 104, y: 25, l: UPPER },
  { name: 'Aoyama', x: 146, y: 9, l: STREET },
  { name: 'Shinsen', x: 32, y: 52, l: UPPER },
  { name: 'Hikarie', x: 129, y: 58, l: STREET },
  { name: 'Maruyama-cho', x: 14, y: 96, l: UPPER },
  { name: 'Route 246 East', x: 146, y: 105, l: STREET },
  { name: 'Sakuragaoka', x: 30, y: 143, l: STREET },
  { name: 'Shibuya Bridge', x: 74, y: 146, l: STREET },
  { name: 'Shibuya Stream', x: 117, y: 140, l: METRO },
];
/** the zone's centre: the middle of the Scramble Crossing (cell corner 74, 76) */
const CENTER = v3(74 * CELL - HALF, 0, 76 * CELL - HALF);

const spotPos = (s: { x: number; y: number; l: number }): Vec3 => {
  const c = at(s.l, s.x, s.y);
  return v3((s.x + 0.5) * CELL - HALF, heightOf(s.l, c), (s.y + 0.5) * CELL - HALF);
};

// vectors that are directions or sizes, not places: shiftLevel leaves them alone
const NOT_PLACES = new Set(['h', 'gravity', 'vel', 'dir', 'defaultGravity', 'normal', 'up']);
/**
 * The level moved by (dx, 0, dz): every position in it (box centres, spawns, waypoints, zones,
 * pads, callouts...), but not sizes or directions.
 */
export const shiftLevel = (def: LevelDef, dx: number, dz: number): LevelDef => {
  const walk = (v: unknown, key: string): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (!v || typeof v !== 'object') return v;
    const o = v as Record<string, unknown>;
    const ks = Object.keys(o);
    if (ks.length === 3 && ['x', 'y', 'z'].every((k) => typeof o[k] === 'number'))
      return NOT_PLACES.has(key)
        ? { ...o }
        : { x: (o.x as number) + dx, y: o.y, z: (o.z as number) + dz };
    const out: Record<string, unknown> = {};
    for (const k of ks) out[k] = walk(o[k], k);
    return out;
  };
  return walk(def, '') as LevelDef;
};

export const buildShibuya = (): LevelDef => {
  const def = shiftLevel(buildGraybox(SHIBUYA_LAYOUT), -HALF, -HALF);
  const spawns: SpawnDef[] = SHIBUYA_ROYALE_SPOTS.map((s) => {
    const pos = spotPos(s);
    // (facing the crossing)
    const yawDeg = (Math.atan2(CENTER.x - pos.x, -(CENTER.z - pos.z)) * 180) / Math.PI;
    return { pos, yawDeg };
  });
  // the zone starts big enough to cover the whole city, corners included
  const radius = Math.ceil(Math.hypot(HALF + Math.abs(CENTER.x), HALF + Math.abs(CENTER.z)));
  return { ...def, royale: { spawns, center: CENTER, radius } };
};
