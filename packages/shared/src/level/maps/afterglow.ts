// "Afterglow" — a night market that never closes: the promenade deck of an orbital city under a
// skyglass dome, the planet's night side below the south glass. A dense market *district*:
// tenement blocks (9 m, you never get on top of them) with narrow lit alleys between them,
// shops you walk through, an upper floor (teahouse, monorail, station) and a metro level under
// the streets. Mirror-symmetric across x = 0: Cyan (team 0) west, Orange (team 1) east;
// everything below is given for the east (Orange) half.
//
// Three floors: street (y 0; the Koi Plaza sunk to -1.2), upper (y 4.5) and metro (y -5).
// The layout is painted on a 2 m grid (see `plan()` below: one grid per floor), so every wall is
// a full-height block and every doorway a gap in it; cover, stairs and neon are placed by hand.
//
//   BASE (x 44..54, roofed): three detached spawn groups, each sheltered, each with 2+ exits
//     north yard  (x 46..54, z -34..-20)  → Lantern Alley (via the base corridor), → Tower hall
//     metro platform (y -5, x 44..54, z 8..14) → the metro tunnel, → up the ramp to the Tower hall
//     south yard  (x 46..54, z 20..34)    → Rail Street (via the base corridor), → Tower hall
//     Tower hall (x 44..54, z -10..8, the Tower at x 51) → Market Street
//   NORTH LANE → A
//     Lantern Alley (x 28..44, z -40..-36): dark, paper screens across it (the Boomerang flies
//     through them, nothing else does); it turns south (x 24..28) into Arcade Lane (z -30..-26)
//     and A's side door. The Noodle Bar (x 30..42, z -34..-24) is a walk-through shop from the
//     alley (front door) to the alley's corner (side door) and Noodle Row (back door) → market
//   A: THE ARCADE HALL (x -12..12, z -40..-24, indoors, 4 m ceiling): side doors east and west,
//     the front door (x -2..2) up the short Arcade Row from the Koi Plaza
//   MID
//     Market Street (x 24..44, z -8..-4) from the Tower hall, the jog (x 24..28) and the covered
//     Lantern Passage (under the teahouse) to the plaza's east mouth (x 12..14, z -12..-8)
//     THE KOI PLAZA (x -12..12, z -16..2; basin x -8..8, z -14..0 sunk 1.2 m): a dry fountain
//     round a holo-projector with two koi of light; four mouths (A north, B south, east, west)
//     The Teahouse (upper, x 14..24, z -16..-8) and its balcony over the plaza (x 12..14):
//     stairs up from Market Street and from Arcade Lane (an upper connector mid ↔ A)
//     Pachinko parlour (x 28..42, z -2..12): walk-through from Market Street to the Tram Street,
//     with a stair down to the metro
//   SOUTH LANE → B
//     Rail Street (x 14..44, z 36..40) along the south glass; the Stair Alley (x 28..32) north
//     to the Tram Street (x 14..34, z 14..20) and the South Alley (x 14..18) to the Foyer
//     The monorail stair (x 34..38, z 26..36) up into the covered monorail track (upper,
//     x 10..42, z 22..26) that runs into the station
//   B: THE STATION (upper, x -10..10, z 18..30, enclosed): a train standing in it (doors open
//     both sides, ends shut); entrances: the track from the east, from the west, and the
//     station stair (x -2..2) up from the Foyer (the ticket hall, x -12..12, z 4..8)
//   METRO (y -5): the base platforms, a tunnel under the Tram Street (a loop flank from side to
//     side), a stair up into the pachinko parlour, and the metro hall under the station
//     (x -12..12, z 18..30) with its stairs up to the Foyer
//
// No lane sees into a spawn (afterglow.test.ts checks every standing spot); cover is half
// (≤ 1.25 m) or full (≥ 2 m); ramps ≤ 27°. Bots walk every part of it (waypoints below).
import type { Vec3 } from '../../math/vec3';
import { v3 } from '../../math/vec3';
import { qFromAxisAngle } from '../../math/quat';
import { LevelBuilder, wedgeRamp } from '../builder';
import type {
  BoxDef,
  LevelDef,
  LightDef,
  Material,
  SpawnDef,
  TowerDef,
  WaypointDef,
} from '../types';

const CYAN = 0x19e3ff;
const ORANGE = 0xff8a1f;
// neon
const PINK = 0xff3fa4;
const VIOLET = 0xa46bff;
const TEAL = 0x2ef2d0;
const AMBER = 0xffb347;
const SITE = 0xff4f6a;
// surfaces (dark, cool, a little wet)
const STREET = 0x1d1b27;
const PLAZA_TILE = 0x2d2839;
const BASIN = 0x1c3440;
const STONE = 0x4a4452;
const FACADES = [0x2b2939, 0x3a2c3a, 0x363041, 0x2f2a3d];
const FACADE = FACADES[0];
const FACADE_WARM = FACADES[1];
const CEILING = 0x3b3848;
const ROOF = 0x1a1822;
const METAL = 0x3d4252;
const PILLAR = 0x2c2f3e;
const WOOD = 0x5b3b2b;
const WOOD_LIGHT = 0x8a5a3a;
const PAPER = 0xf2dcc0;
const CARPET = 0x2a1c44;
const CABINET = 0x1b1a28;
const DARK = 0x131119;
const PUDDLE = 0x7a6ab8;
const KOI = 0xffa8d8;
const RAILS = 0x9aa6c8;
const AWNING_PINK = 0xb52a66;
const AWNING_TEAL = 0x1d8a80;
const AWNING_AMBER = 0xb8701c;
const AWNING_VIOLET = 0x5f3aa6;
const CITY = 0x120f1c;
const TUNNEL = 0x2b3440;
const METRO_FLOOR = 0x262a36;

/** Key coordinates (the east / Orange half; the west half is its mirror image, x → -x). */
export const AFTERGLOW = {
  /** the streets end at the base facades (x ±44) */
  halfX: 44,
  north: -40,
  south: 40,
  dome: 20,
  /** the blocks' tops (nobody gets up there) */
  block: 9,
  /** the upper floor (teahouse, monorail, station) */
  up: 4.5,
  /** the metro level */
  metro: -5,
  plaza: { x: 12, z0: -16, z1: 2, y: -1.2, basin: { x: 8, z0: -14, z1: 0 } },
  fountain: { x: 3.5, z0: -10, z1: -3.5, top: -0.3 },
  /** the three spawn groups' rooms (east half; y = their floor) */
  spawnAreas: {
    north: { x0: 46, x1: 54, z0: -34, z1: -20, y: 0 },
    metro: { x0: 44, x1: 54, z0: 8, z1: 14, y: -5 },
    south: { x0: 46, x1: 54, z0: 20, z1: 34, y: 0 },
  },
  arcade: { x: 12, z0: -40, z1: -24 },
  station: { x: 10, z0: 18, z1: 30 },
  /** the monorail track (upper floor) */
  track: { x0: 10, x1: 42, z0: 22, z1: 26 },
  /** the train standing in the station (upper floor) */
  car: { x: 6, z0: 22.3, z1: 25.7, door: 1.2, side0: 3.2, side1: 4.6, top: 7.4 },
  /** Towers: Cyan's (west) first */
  towers: [v3(-51, 0, 0), v3(51, 0, 0)] as [Vec3, Vec3],
  bombSites: {
    A: { min: v3(-7, 0, -38), max: v3(7, 3, -28.5) },
    B: { min: v3(-8, 4.5, 18.5), max: v3(8, 7.5, 29.9) },
  },
  /** paper screens across Lantern Alley (east half): [x, z0, z1], 3 m tall */
  screens: [
    [40, -38, -36],
    [32, -40, -38],
  ] as [number, number, number][],
  powerups: [v3(0, -0.2, -1.2)],
};

type Sign = 1 | -1;
const SIGNS: Sign[] = [1, -1];
type Extra = Omit<BoxDef, 'c' | 'h' | 'mat'>;
type BoxFn = (
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  mat: Material,
  extra?: Extra,
) => void;
type DecoFn = (
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  mat: Material,
  color: number,
) => void;
type LightFn = (x: number, y: number, z: number, color: number, radius: number, k: number) => void;

interface Kit {
  /** one box */
  box: BoxFn;
  /** the box (authored in the east half) and its mirror image */
  pair: BoxFn;
  /** paired decoration (no collision) */
  deco: DecoFn;
  /** decoration across the middle (authored symmetric about x = 0) */
  decoMid: DecoFn;
  /** a light (and its mirror image unless on x = 0) */
  light: LightFn;
  /** a ready-made box (rotated ones: ramps, koi) */
  push: (b: BoxDef) => void;
}

// ======================= the plan: three floors on a 2 m grid =======================
// East half only: column c covers x 2c..2c+2 (c 0..27, x 0..56), row r covers z -42+2r..-40+2r
// (r 0..41). The west half is the mirror image.
//
// street (y 0): '#' block (solid up to the upper floor), '.' floor, 'p' the plaza's sunk basin,
//   'd' a stairwell down to the metro (no street floor), 's' a stairwell up (no ceiling), 'g' the
//   south glass
// upper (y 4.5): ' ' open air (a block under it grows to full height), '#' solid, '.' floor
//   under a roof, 'o' floor in the open, 's' stairwell air under a roof
// metro (y -5): ' ' rock (walls only where it borders the metro), '.' floor, 'd' ramp well
const COLS = 28;
const ROWS = 42;
const X0 = 0;
const Z0 = -42;
const CELL = 2;
type Layer = string[][];
interface Plan {
  street: Layer;
  upper: Layer;
  metro: Layer;
}

const layer = (fill: string): Layer =>
  Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => fill));

/** paint the cells inside x0..x1 × z0..z1 (east-half world coordinates, multiples of 2) */
const paint = (l: Layer, x0: number, z0: number, x1: number, z1: number, ch: string) => {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const cx = X0 + c * CELL;
      const cz = Z0 + r * CELL;
      if (cx >= x0 && cx + CELL <= x1 && cz >= z0 && cz + CELL <= z1) l[r][c] = ch;
    }
};

export const afterglowPlan = (): Plan => {
  const G = layer('#');
  const U = layer(' ');
  const M = layer(' ');
  const g = (x0: number, z0: number, x1: number, z1: number, ch = '.') =>
    paint(G, x0, z0, x1, z1, ch);
  const u = (x0: number, z0: number, x1: number, z1: number, ch: string) =>
    paint(U, x0, z0, x1, z1, ch);
  const m = (x0: number, z0: number, x1: number, z1: number, ch = '.') =>
    paint(M, x0, z0, x1, z1, ch);

  // ---- street level ----
  g(0, -40, 12, -24); // A: the arcade hall
  g(12, -30, 14, -28); // its side door
  g(0, -24, 2, -16); // Arcade Row: the front door up from the plaza
  g(14, -30, 24, -26); // Arcade Lane
  g(24, -40, 28, -26); // the alley's corner
  g(28, -40, 44, -36); // Lantern Alley
  g(44, -40, 54, -36); // base: north corridor
  g(52, -36, 54, -34); // … its inner door
  g(46, -34, 54, -20); // north spawn yard
  g(50, -20, 52, -10); // north link
  g(44, -10, 54, -2); // Tower hall
  g(48, -2, 54, 8);
  g(44, -2, 48, 8, 'd'); // the ramp down to the metro platform
  g(50, 8, 52, 20); // south link
  g(46, 20, 54, 34); // south spawn yard
  g(52, 34, 54, 36);
  g(44, 36, 54, 40); // base: south corridor
  g(30, -34, 42, -24); // the Noodle Bar
  g(36, -36, 38, -34); // front door (alley)
  g(28, -32, 30, -30); // side door (the alley's corner)
  g(32, -24, 34, -22); // back door
  g(30, -22, 34, -8); // Noodle Row
  g(24, -8, 44, -4); // Market Street
  g(24, -12, 28, -8); // the jog
  g(14, -12, 24, -8); // Lantern Passage (under the teahouse)
  g(12, -12, 14, -8); // the plaza's east mouth
  g(14, -8, 24, -4, 's'); // stair up to the teahouse balcony
  g(18, -26, 22, -16, 's'); // stair up to the teahouse from Arcade Lane
  g(0, -16, 12, 2); // the Koi Plaza
  g(0, -14, 8, 0, 'p'); // … its sunk basin
  g(0, 2, 2, 4); // south mouth
  g(0, 4, 12, 8); // the Foyer (ticket hall)
  g(12, 4, 14, 8); // its east door
  g(0, 8, 2, 18, 's'); // the station stair
  g(6, 8, 10, 18, 'd'); // the metro stairs
  g(14, 4, 18, 20); // South Alley
  g(14, 14, 34, 20); // Tram Street
  g(28, -2, 42, 12); // the pachinko parlour
  g(36, -4, 38, -2); // front door (market)
  g(30, 12, 32, 14); // back door (Tram Street)
  g(30, 2, 40, 6, 'd'); // its stair down to the metro
  g(28, 20, 32, 36); // Stair Alley (under the monorail)
  g(34, 26, 38, 36, 's'); // the monorail stair
  g(14, 36, 44, 40); // Rail Street
  g(0, 40, 56, 42, 'g'); // the south glass

  // ---- upper level ----
  u(0, -40, 14, -24, '#'); // roofs over the arcade hall
  u(44, -42, 56, 42, '#'); // … the base
  u(28, -36, 42, -22, '#'); // … the Noodle Bar
  u(28, -4, 42, 14, '#'); // … the pachinko parlour
  u(0, 4, 14, 8, '#'); // … the Foyer
  u(6, 8, 10, 18, '#'); // … the metro stairs
  u(14, -16, 24, -8, '.'); // the Teahouse
  u(12, -16, 14, 0, 'o'); // its balcony over the plaza
  u(24, -16, 26, -8, '#'); // its east wall (over the jog)
  u(14, -8, 24, -4, 's');
  u(18, -26, 22, -16, 's');
  u(0, 8, 2, 18, 's');
  u(0, 18, 10, 30, '.'); // B: the station
  u(10, 20, 44, 22, '#'); // the monorail track's walls
  u(10, 26, 44, 28, '#');
  u(10, 22, 42, 26, '.'); // the track (covered)
  u(18, 22, 24, 26, 'o'); // … open to the dome for a stretch
  u(34, 26, 38, 36, 's'); // the monorail stair

  // ---- metro ----
  m(44, -2, 48, 8, 'd'); // the ramp from the Tower hall
  m(44, 8, 54, 14); // the metro platform (spawns)
  m(52, 14, 54, 20); // its way out, round a corner
  m(30, 18, 52, 22); // the tunnel, east
  m(28, 2, 30, 22); // … the kink (and the pachinko stair's foot)
  m(30, 2, 40, 6, 'd'); // the pachinko stair
  m(12, 20, 28, 24); // the tunnel, west
  m(0, 18, 12, 30); // the metro hall under the station
  m(6, 8, 10, 18, 'd'); // its stairs up to the Foyer
  return { street: G, upper: U, metro: M };
};

/** Greedy rectangles over the cells where `want` holds: [c0, r0, c1, r1] (inclusive). */
const rects = (want: (c: number, r: number) => boolean): [number, number, number, number][] => {
  const used = layer('');
  const out: [number, number, number, number][] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (used[r][c] || !want(c, r)) continue;
      let c1 = c;
      while (c1 + 1 < COLS && !used[r][c1 + 1] && want(c1 + 1, r)) c1++;
      let r1 = r;
      const rowOk = (rr: number) => {
        for (let cc = c; cc <= c1; cc++) if (used[rr][cc] || !want(cc, rr)) return false;
        return true;
      };
      while (r1 + 1 < ROWS && rowOk(r1 + 1)) r1++;
      for (let rr = r; rr <= r1; rr++) for (let cc = c; cc <= c1; cc++) used[rr][cc] = 'x';
      out.push([c, r, c1, r1]);
    }
  return out;
};

export const buildAfterglow = (): LevelDef => {
  const S = AFTERGLOW;
  const b = new LevelBuilder();
  const lights: LightDef[] = [];

  const box: BoxFn = (x0, y0, z0, x1, y1, z1, mat, extra = {}) => {
    b.box(
      v3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      v3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
      { mat, ...extra },
    );
  };
  const pair: BoxFn = (x0, y0, z0, x1, y1, z1, mat, extra = {}) => {
    for (const s of SIGNS) box(s * x0, y0, z0, s * x1, y1, z1, mat, extra);
  };
  const deco: DecoFn = (x0, y0, z0, x1, y1, z1, mat, color) =>
    pair(x0, y0, z0, x1, y1, z1, mat, { color, noCollide: true });
  const decoMid: DecoFn = (x0, y0, z0, x1, y1, z1, mat, color) =>
    box(x0, y0, z0, x1, y1, z1, mat, { color, noCollide: true });
  const light: LightFn = (x, y, z, color, radius, k) => {
    for (const s of x === 0 ? [1] : SIGNS)
      lights.push({ pos: v3(s * x, y, z), color, radius, intensity: k });
  };
  const push = (bx: BoxDef) => {
    b.boxes.push(bx);
  };
  const kit: Kit = { box, pair, deco, decoMid, light, push };

  // ======================= the grid: blocks, floors, ceilings =======================
  const P = afterglowPlan();
  const G = (c: number, r: number) => P.street[r][c];
  const U = (c: number, r: number) => P.upper[r][c];
  const Mw = (c: number, r: number) => {
    const cc = c < 0 ? -c - 1 : c; // the mirror half
    if (cc >= COLS || r < 0 || r >= ROWS) return false;
    return P.metro[r][cc] !== ' ';
  };
  const walkG = (c: number, r: number) => G(c, r) !== '#' && G(c, r) !== 'g';
  const B = S.block;
  const UP = S.up;
  // [y0, y1, look] per cell
  type Look = 'wall' | 'slab' | 'basin' | 'ceil' | 'roof' | 'mfloor' | 'rock';
  const pieces: [number, number, Look, (c: number, r: number) => boolean][] = [
    [0, B, 'wall', (c, r) => G(c, r) === '#' && (U(c, r) === '#' || U(c, r) === ' ')],
    [0, UP, 'wall', (c, r) => G(c, r) === '#' && (U(c, r) === '.' || U(c, r) === 'o')],
    [UP - 0.5, B, 'wall', (c, r) => walkG(c, r) && U(c, r) === '#'],
    [UP - 0.5, UP, 'ceil', (c, r) => walkG(c, r) && (U(c, r) === '.' || U(c, r) === 'o')],
    [B - 0.5, B, 'roof', (c, r) => U(c, r) === '.' || U(c, r) === 's'],
    [-1.2, 0, 'slab', (c, r) => G(c, r) !== 'p' && G(c, r) !== 'd'],
    [-2.2, -1.2, 'basin', (c, r) => G(c, r) === 'p'],
    [S.metro - 1, S.metro, 'mfloor', (c, r) => Mw(c, r)],
    [
      S.metro,
      -1.2,
      'rock',
      (c, r) => {
        if (Mw(c, r)) return false;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) if (Mw(c + dc, r + dr)) return true;
        return false;
      },
    ],
  ];
  for (const [y0, y1, look, want] of pieces)
    for (const [c0, r0, c1, r1] of rects(want)) {
      const x0 = X0 + c0 * CELL;
      const x1 = X0 + (c1 + 1) * CELL;
      const z0 = Z0 + r0 * CELL;
      const z1 = Z0 + (r1 + 1) * CELL;
      if (look === 'wall') {
        const color = FACADES[(((x0 * 7 + z0 * 13 + x1 * 3 + z1 * 5) % 4) + 4) % 4];
        pair(x0, y0, z0, x1, y1, z1, 'panel', { color });
      } else if (look === 'slab') pair(x0, y0, z0, x1, y1, z1, 'plate', { color: STREET });
      else if (look === 'basin') pair(x0, y0, z0, x1, y1, z1, 'floor', { color: PLAZA_TILE });
      else if (look === 'ceil') pair(x0, y0, z0, x1, y1, z1, 'plate', { color: CEILING });
      else if (look === 'roof') pair(x0, y0, z0, x1, y1, z1, 'hull', { color: ROOF });
      else if (look === 'mfloor') pair(x0, y0, z0, x1, y1, z1, 'floor', { color: METRO_FLOOR });
      else pair(x0, y0, z0, x1, y1, z1, 'panel', { color: TUNNEL });
    }

  // ======================= the dome =======================
  // north: the tenements' facade, glass above; south: a low sill and the great window over the
  // planet; the skyglass roof over everything
  box(-56, B, -42, 56, 12, -40, 'panel', { color: FACADE });
  box(-56, 12, -42, 56, S.dome, -40, 'skyglass');
  pair(0, 0, 40, 56, 0.6, 42, 'panel', { color: FACADE });
  box(-56, 0.6, 40, 56, S.dome, 42, 'skyglass');
  pair(54, B, -40, 56, S.dome, 40, 'panel', { color: FACADE });
  box(-56, S.dome, -42, 56, S.dome + 0.5, 42, 'skyglass');

  // ======================= the stairs =======================
  const STAIR = { mat: 'grate' as Material, color: METAL };
  const STEP = { mat: 'floor' as Material, color: 0x3a3548 };
  push(wedgeRamp('z', 8, 18, 0, UP, 0, 4, STEP)); // the station stair
  for (const s of SIGNS) {
    push(wedgeRamp('z', -2, 8, 0, S.metro, s * 46, 4, STEP)); // Tower hall → metro platform
    push(wedgeRamp('x', s * 40, s * 30, 0, S.metro, 4, 4, STEP)); // pachinko → metro
    push(wedgeRamp('z', 8, 18, 0, S.metro, s * 8, 4, STEP)); // Foyer → metro hall
    push(wedgeRamp('z', -26, -16, 0, UP, s * 20, 4, STAIR)); // Arcade Lane → teahouse
    push(wedgeRamp('x', s * 24, s * 14, 0, UP, -6, 4, STAIR)); // market → teahouse balcony
    push(wedgeRamp('z', 36, 26, 0, UP, s * 36, 4, STAIR)); // Rail Street → monorail
  }
  // railings (half cover) where a floor ends at a stairwell or a drop
  const RAIL = { color: METAL };
  pair(48, 0, -2, 48.3, 1, 8, 'grate', RAIL); // the Tower hall's ramp well
  pair(30, 0, 1.7, 40, 1, 2, 'grate', RAIL); // the pachinko stair's well
  pair(30, 0, 6, 40, 1, 6.3, 'grate', RAIL);
  pair(12, UP, -16, 12.2, UP + 1, 0, 'grate', RAIL); // the teahouse balcony

  // ======================= bases: spawns, Tower =======================
  const towers: TowerDef[] = [];
  const spawns: SpawnDef[] = [];
  const homes: Vec3[] = [];
  for (const s of SIGNS) {
    const team = s > 0 ? 1 : 0;
    const tc = team === 1 ? ORANGE : CYAN;
    const teamMat: Material = team === 1 ? 'teamB' : 'teamA';
    const one: BoxFn = (x0, y0, z0, x1, y1, z1, mat, extra = {}) =>
      box(s * x0, y0, z0, s * x1, y1, z1, mat, extra);
    const lit = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
      one(x0, y0, z0, x1, y1, z1, 'trim', { color: tc, noCollide: true });
    const tp = S.towers[team];
    b.block(v3(tp.x, 2, 0), v3(2, 4, 2), { mat: teamMat, trim: tc });
    towers.push({ team, pos: tp, radius: 1.5, height: 4 });
    homes.push(v3(s * 48.8, 0.9, -6));
    // three groups: the north yard (toward A), the metro platform (the flank), the south yard
    // (toward B); facing their way out
    const put = (group: string, x: number, y: number, z: number, yaw: number) =>
      spawns.push({ pos: v3(s * x, y, z), yawDeg: s > 0 ? yaw : -yaw, team, group });
    put('north', 48.5, 0, -30, 180);
    put('north', 52, 0, -27, 180);
    put('north', 48.5, 0, -23.5, 180);
    put('metro', 50, S.metro, 10.5, -90);
    put('metro', 50.5, S.metro, 13, -90);
    put('south', 48.5, 0, 30, 0);
    put('south', 52, 0, 27, 0);
    put('south', 48.5, 0, 23.5, 0);
    // team light: strips under the ceilings, door frames
    for (const z of [-27, 4, 27]) lit(46.5, UP - 0.62, z - 0.08, 53.5, UP - 0.5, z + 0.08);
    lit(44.5, S.metro + 3.5, 10.9, 53.5, S.metro + 3.6, 11.1);
    for (const z of [-38, 38]) lit(43.94, 4, z - 2, 44, 4.2, z + 2);
    lit(43.94, 4, -8, 44, 4.2, -4);
    for (const z of [-27, 27, 0])
      lights.push({ pos: v3(s * 50, 3.4, z), color: tc, radius: 10, intensity: 0.9 });
    lights.push({ pos: v3(s * 49, S.metro + 3, 11), color: tc, radius: 9, intensity: 0.8 });
    lights.push({ pos: v3(s * 49, 3, -38), color: tc, radius: 7, intensity: 0.6 });
    lights.push({ pos: v3(s * 49, 3, 38), color: tc, radius: 7, intensity: 0.6 });
    // crates in the yards (full cover), a bench on the platform (half)
    one(46.2, 0, -33.8, 47.8, 2.2, -32.2, 'crate', { color: 0x4a3a2c });
    one(46.2, 0, 32.2, 47.8, 2.2, 33.8, 'crate', { color: 0x4a3a2c });
    one(52.5, S.metro, 8.3, 53.7, S.metro + 0.5, 9.7, 'wood', { color: WOOD });
  }

  buildArcade(kit);
  buildAlley(kit);
  buildMarket(kit);
  buildPlaza(kit);
  buildSouth(kit);
  buildStation(kit);
  buildMetro(kit);
  scenery(kit);

  return b.build({
    name: 'Afterglow',
    boundsMin: v3(-56, -7, -42),
    boundsMax: v3(56, 21, 42),
    defaultGravity: v3(0, -1, 0),
    zones: [],
    rails: [],
    pads: [],
    spawns,
    towers,
    controllerHomes: homes,
    waypoints: waypoints(),
    areas: [
      { name: 'Cyan spawn (north)', pos: v3(-50, 0, -27), yawDeg: 180 },
      { name: 'Orange spawn (north)', pos: v3(50, 0, -27), yawDeg: 180 },
      { name: 'Orange metro platform', pos: v3(50, S.metro, 11), yawDeg: 90 },
      { name: 'A: arcade hall', pos: v3(0, 0, -30), yawDeg: 180 },
      { name: 'B: station', pos: v3(0, UP, 20), yawDeg: 180 },
      { name: 'Koi Plaza', pos: v3(10, 0, -6), yawDeg: 90 },
      { name: 'Lantern Alley', pos: v3(40, 0, -38), yawDeg: 90 },
      { name: 'Market Street', pos: v3(34, 0, -6), yawDeg: 90 },
      { name: 'Teahouse', pos: v3(18, UP, -12), yawDeg: 90 },
      { name: 'Pachinko parlour', pos: v3(40, 0, 9), yawDeg: 90 },
      { name: 'Rail Street', pos: v3(30, 0, 38), yawDeg: 90 },
      { name: 'Monorail', pos: v3(30, UP, 24), yawDeg: 90 },
      { name: 'Metro hall', pos: v3(8, S.metro, 24), yawDeg: 90 },
    ],
    fog: { color: 0x0d0918, near: 60, far: 280 },
    ambient: 0.45,
    lights,
    bombSites: [
      { name: 'A', ...S.bombSites.A },
      { name: 'B', ...S.bombSites.B },
    ],
    powerups: S.powerups,
    sky: {
      moons: [
        // the planet's night side, filling the view below the south glass
        { dir: norm(v3(0, -0.34, 1)), sizeDeg: 78, color: 0x2a3a6a },
        { dir: norm(v3(0.45, 0.8, -0.35)), sizeDeg: 5, color: 0xdfe0f0 },
        { dir: norm(v3(-0.7, 0.55, 0.4)), sizeDeg: 2.2, color: 0xf2c8a8 },
      ],
    },
  });
};

const norm = (p: Vec3): Vec3 => {
  const l = Math.hypot(p.x, p.y, p.z) || 1;
  return v3(p.x / l, p.y / l, p.z / l);
};

/** A glowing sign on a wall face: `face` is the wall's outward normal axis and side. */
const sign = (
  deco: DecoFn,
  face: 'x+' | 'x-' | 'z+' | 'z-',
  at: number,
  u0: number,
  u1: number,
  y0: number,
  y1: number,
  color: number,
  mat: Material = 'trim',
) => {
  const t = 0.06;
  if (face === 'x+') deco(at, y0, u0, at + t, y1, u1, mat, color);
  else if (face === 'x-') deco(at - t, y0, u0, at, y1, u1, mat, color);
  else if (face === 'z+') deco(u0, y0, at, u1, y1, at + t, mat, color);
  else deco(u0, y0, at - t, u1, y1, at, mat, color);
};

/** Vending machines (full cover), their fronts lit. */
const vending = (
  { pair, deco }: Kit,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  front: 'x-' | 'x+' | 'z-' | 'z+',
  color: number,
) => {
  pair(x0, 0, z0, x1, 2.2, z1, 'hull', { color: 0x2a2436 });
  if (front === 'x+') deco(x1, 0.4, z0 + 0.1, x1 + 0.05, 2, z1 - 0.1, 'glow', color);
  else if (front === 'x-') deco(x0 - 0.05, 0.4, z0 + 0.1, x0, 2, z1 - 0.1, 'glow', color);
  else if (front === 'z-') deco(x0 + 0.1, 0.4, z0 - 0.05, x1 - 0.1, 2, z0, 'glow', color);
  else deco(x0 + 0.1, 0.4, z1, x1 - 0.1, 2, z1 + 0.05, 'glow', color);
};

/** A: the arcade hall. Cabinets (full cover), pinball tables and the prize counter (half). */
const buildArcade = ({ box, pair, deco, decoMid, light }: Kit): void => {
  const CAB = { color: CABINET };
  decoMid(-12, 0, -40, 12, 0.01, -24, 'floor', CARPET);
  // a kiosk just inside the front door, up to the ceiling: no line from the plaza (or the
  // station stair behind it) straight across the hall
  box(-1.5, 0, -27.6, 1.5, 4, -26.4, 'panel', { color: 0x3b2450 });
  decoMid(-1.4, 1.2, -27.65, 1.4, 2.2, -27.6, 'glow', TEAL);
  // cabinet banks (back to back) either side of the site
  pair(8, 0, -37, 9.2, 2.2, -32.5, 'hull', CAB);
  deco(7.95, 1.1, -36.8, 8, 1.9, -32.7, 'glow', PINK);
  deco(9.2, 1.1, -36.8, 9.25, 1.9, -32.7, 'glow', VIOLET);
  // claw machines just inside the side doors (full cover: no line from door to door across
  // the site; you step in and turn left or right round them)
  pair(9.6, 0, -30.8, 10.8, 2.2, -27.2, 'hull', CAB);
  deco(9.7, 2.2, -30.7, 10.7, 2.3, -27.3, 'trim', PINK);
  // pinball tables (half cover)
  pair(3.5, 0, -31, 4.7, 1.1, -28.8, 'hull', { color: 0x3b2450 });
  deco(3.55, 1.1, -30.9, 4.65, 1.15, -28.9, 'glow', AMBER);
  pair(4.5, 0, -38.5, 5.7, 1.1, -36.3, 'hull', { color: 0x3b2450 });
  // the prize counter (half cover) and the prize shelves behind it
  box(-2.5, 0, -38, 2.5, 1.1, -37.2, 'wood', { color: WOOD_LIGHT });
  box(-3.5, 0, -40, 3.5, 2.6, -39.2, 'crate', { color: 0x5a3a60 });
  decoMid(-2.5, 1.1, -38, 2.5, 1.16, -37.2, 'trim', AMBER);
  // site A marking
  const A = AFTERGLOW.bombSites.A;
  const w = 0.12;
  decoMid(A.min.x, 0.01, A.min.z, A.max.x, 0.03, A.min.z + w, 'trim', SITE);
  decoMid(A.min.x, 0.01, A.max.z - w, A.max.x, 0.03, A.max.z, 'trim', SITE);
  deco(A.max.x - w, 0.01, A.min.z + w, A.max.x, 0.03, A.max.z - w, 'trim', SITE);
  // neon under the ceiling, signs over the doors
  deco(6.9, 3.85, -39.5, 7.1, 4, -24.5, 'trim', VIOLET);
  decoMid(-0.1, 3.85, -39.5, 0.1, 4, -27.8, 'trim', PINK);
  sign(deco, 'x+', 14, -30, -28, 4.2, 4.6, PINK);
  sign(deco, 'x-', 2, -22, -18, 1, 3.6, PINK);
  light(0, 3.2, -32, VIOLET, 13, 1);
  light(9, 3.2, -30, PINK, 8, 0.8);
  light(6, 3.2, -26, TEAL, 7, 0.6);
  light(0, 3, -20, PINK, 7, 0.7); // Arcade Row
};

/** Lantern Alley, its paper screens, the Noodle Bar and Arcade Lane. */
const buildAlley = (kit: Kit): void => {
  const { pair, deco, light } = kit;
  for (const [x, z0, z1] of AFTERGLOW.screens) {
    const t = 0.1;
    const p = 0.4; // posts: 0.4 m square at the ends
    const lo = Math.min(z0, z1);
    const hi = Math.max(z0, z1);
    pair(x - t, 0, lo + (lo === -40 ? 0 : p), x + t, 3, hi - (hi === -36 ? 0 : p), 'paper', {
      color: PAPER,
      boomerangPasses: true,
    });
    const post = lo === -40 ? hi - p : lo;
    pair(x - 0.2, 0, post, x + 0.2, 3.2, post + p, 'wood', { color: WOOD });
    const p0 = lo === -40 ? lo : lo + p;
    const p1 = lo === -40 ? hi - p : hi;
    for (const f of [-1, 1]) {
      const a = x + f * t;
      const c = x + f * (t + 0.03);
      deco(Math.min(a, c), 1.46, p0, Math.max(a, c), 1.54, p1, 'wood', WOOD);
    }
  }
  // lantern strings across the alley
  for (const x of [30, 35, 41]) {
    deco(x - 0.03, 4.5, -40, x + 0.03, 4.56, -36, 'hull', DARK);
    for (const [i, z] of [-39, -37].entries())
      deco(x - 0.22, 3.9, z - 0.22, x + 0.22, 4.5, z + 0.22, 'trim', i === 1 ? PINK : AMBER);
  }
  // crates in the alley's corner (full) and a stack of boxes (half)
  pair(24.2, 0, -39.8, 26, 2.2, -38, 'crate', { color: 0x4a3a2c });
  pair(26.4, 0, -31.5, 27.8, 1.1, -29.5, 'crate', { color: 0x4a3a2c });
  // shutters and signs on the alley's shopfronts
  sign(deco, 'z-', -36, 29, 35, 2.8, 3.1, AMBER);
  sign(deco, 'z-', -36, 40.6, 43.4, 2.8, 3.1, PINK);
  sign(deco, 'z+', -40, 30, 34, 5, 7, 0x8a6a40, 'glow');
  sign(deco, 'z+', -40, 37, 41, 5, 7, 0x4a6a88, 'glow');
  // the Noodle Bar: its counter (half) and kitchen (full)
  pair(33, 0, -30.5, 39, 1.1, -29.5, 'wood', { color: WOOD_LIGHT });
  pair(30.2, 0, -34, 33.4, 2.4, -32.5, 'wood', { color: WOOD });
  deco(30.3, 1.6, -32.5, 33.3, 2.3, -32.45, 'glow', 0xffd9a0);
  pair(30.2, 0, -27, 31.4, 0.5, -25, 'wood', { color: WOOD }); // stools (a step)
  pair(40.5, 0, -27.5, 41.8, 2.2, -24.2, 'hull', { color: 0x2a2436 }); // a fridge (full)
  deco(40.45, 0.4, -27.4, 40.5, 2, -24.3, 'glow', TEAL);
  // paper lanterns under the ceiling
  for (const x of [32, 36, 40]) deco(x - 0.25, 3.3, -28.25, x + 0.25, 3.9, -27.75, 'trim', AMBER);
  // Arcade Lane: a stall (half) against the north wall, vending machines
  pair(15, 0, -30, 18, 1.1, -29, 'wood', { color: WOOD_LIGHT });
  pair(14.5, 3, -30, 18.5, 3.2, -28.8, 'panel', { color: AWNING_PINK });
  vending(kit, 22.8, -28.4, 24, -27.2, 'x-', TEAL);
  light(26, 3, -38, AMBER, 7, 0.6);
  light(40, 3, -38, VIOLET, 7, 0.5);
  light(36, 3.2, -29, AMBER, 9, 0.9);
  light(19, 3, -28, PINK, 8, 0.7);
  light(26, 3, -30, TEAL, 6, 0.5);
};

/** Market Street, the jog, Noodle Row, the teahouse and the pachinko parlour. */
const buildMarket = (kit: Kit): void => {
  const { pair, deco, light } = kit;
  const UP = AFTERGLOW.up;
  // Market Street: a noodle stall (full) with its counter (half), an awning, vending machines
  pair(38, 0, -8, 40, 2.4, -6.8, 'wood', { color: WOOD });
  pair(38, 0, -6.8, 40, 1.1, -6.2, 'wood', { color: WOOD_LIGHT });
  pair(37.5, 2.9, -8, 40.5, 3.1, -5.6, 'panel', { color: AWNING_AMBER });
  deco(37.5, 2.75, -5.75, 40.5, 2.9, -5.6, 'trim', AMBER);
  vending(kit, 28.8, -5.2, 30, -4, 'z-', PINK);
  // Noodle Row: crates (half / full)
  pair(30.2, 0, -19, 31.6, 2.2, -17.4, 'crate', { color: 0x4a3a2c });
  pair(32.4, 0, -13, 33.8, 1.1, -11.6, 'crate', { color: 0x4a3a2c });
  // the jog and the Lantern Passage: a stall (half), lanterns
  pair(24.2, 0, -11.8, 25.4, 1.1, -10.2, 'wood', { color: WOOD_LIGHT });
  for (const x of [16, 19, 22]) deco(x - 0.25, 3.3, -10.25, x + 0.25, 3.9, -9.75, 'trim', PINK);
  // signs
  sign(deco, 'z+', -8, 40.5, 43.5, 3, 3.5, TEAL);
  sign(deco, 'z-', -4, 36, 38, 4.2, 4.8, VIOLET);
  sign(deco, 'z+', -8, 34.5, 37.5, 5, 7.5, PINK, 'glow');
  sign(deco, 'x-', 28, -12, -8.5, 5.5, 8, AMBER, 'glow');
  // the teahouse: low tables (half), a counter (full), paper lanterns
  pair(16, UP, -15.5, 17.4, UP + 0.6, -14.1, 'wood', { color: WOOD });
  pair(20, UP, -12.5, 21.4, UP + 0.6, -11.1, 'wood', { color: WOOD });
  pair(22, UP, -15.8, 23.8, UP + 2.2, -13.5, 'wood', { color: WOOD_LIGHT });
  for (const x of [15.5, 19, 22.5])
    deco(x - 0.3, UP + 2.9, -12.3, x + 0.3, UP + 3.6, -11.7, 'trim', AMBER);
  sign(deco, 'x-', 12, -14, -2, UP + 0.8, UP + 0.95, PINK); // the balcony's lit edge
  // the pachinko parlour: rows of machines (full) with aisles between, a cash desk (half)
  for (const z of [-1, 9.5]) pair(30, 0, z, 36, 2.2, z + 1, 'hull', { color: CABINET });
  deco(30.1, 0.8, 10.5, 35.9, 1.9, 10.55, 'glow', PINK);
  deco(30.1, 0.8, 0, 35.9, 1.9, 0.05, 'glow', AMBER);
  pair(39, 0, 8, 41.8, 1.1, 9, 'wood', { color: WOOD_LIGHT });
  for (const x of [32, 38]) deco(x - 2, 3.85, 7.9, x + 2, 4, 8.1, 'trim', VIOLET);
  light(34, 3, -6, PINK, 10, 0.9);
  light(32, 3, -15, AMBER, 7, 0.6);
  light(19, 3.2, -10, AMBER, 8, 0.8);
  light(19, UP + 3, -12, AMBER, 9, 0.9);
  light(13, UP + 2, -8, PINK, 6, 0.6);
  light(33, 3.2, 4, PINK, 10, 0.9);
  light(38, 3.2, 10, VIOLET, 7, 0.7);
  light(26, 3, -10, TEAL, 6, 0.6);
};

/** The sunken Koi Plaza: steps, the dry fountain, its projector and the holographic koi. */
const buildPlaza = ({ box, pair, deco, decoMid, light, push }: Kit): void => {
  const P = AFTERGLOW.plaza;
  const K = P.basin;
  const TILE = { color: PLAZA_TILE };
  // steps down (0.3 m each) on the north, south and east sides of the basin. You walk on a
  // smooth ramp under them (invisible, 27°: no stumbling up 0.3 m steps); the steps are the look
  const steps = { ...TILE, noCollide: true };
  for (const [k, top] of [-0.3, -0.6, -0.9].entries()) {
    const d = 0.8 * (k + 1);
    pair(2, P.y, K.z0, 6, top, K.z0 + d, 'floor', steps);
    pair(2, P.y, K.z1 - d, 6, top, K.z1, 'floor', steps);
    pair(K.x - d, P.y, -9, K.x, top, -5, 'floor', steps);
  }
  const ramp = { mat: 'floor' as Material, noRender: true };
  for (const s of SIGNS) {
    push(wedgeRamp('z', K.z0 + 2.4, K.z0, P.y, 0, s * 4, 4, ramp));
    push(wedgeRamp('z', K.z1 - 2.4, K.z1, P.y, 0, s * 4, 4, ramp));
    push(wedgeRamp('x', s * (K.x - 2.4), s * K.x, P.y, 0, -7, 4, ramp));
  }
  // a lit lip round the pit
  decoMid(-K.x, 0, K.z0 - 0.15, K.x, 0.03, K.z0, 'trim', TEAL);
  decoMid(-K.x, 0, K.z1, K.x, 0.03, K.z1 + 0.15, 'trim', TEAL);
  deco(K.x, 0, K.z0, K.x + 0.15, 0.03, K.z1, 'trim', PINK);
  // the dry fountain: a stone basin (0.9 m: low cover)
  const F = AFTERGLOW.fountain;
  const st = { color: STONE };
  box(-F.x, P.y, F.z0, F.x, F.top, F.z0 + 0.5, 'rock', st);
  box(-F.x, P.y, F.z1 - 0.5, F.x, F.top, F.z1, 'rock', st);
  pair(F.x - 0.5, P.y, F.z0 + 0.5, F.x, F.top, F.z1 - 0.5, 'rock', st);
  decoMid(-F.x + 0.5, P.y, F.z0 + 0.5, F.x - 0.5, P.y + 0.04, F.z1 - 0.5, 'floor', BASIN);
  // the projector in the middle (full cover) and its emitter
  const cz = (F.z0 + F.z1) / 2;
  box(-0.7, P.y + 0.04, cz - 0.7, 0.7, 2.6, cz + 0.7, 'pillar', { color: PILLAR });
  decoMid(-0.8, 2.6, cz - 0.8, 0.8, 2.8, cz + 0.8, 'trim', TEAL);
  // two koi of light circling the projector (mirror images, both heading south)
  const r = 2.4;
  for (const s of SIGNS) {
    const seg = (deg: number, half: Vec3, y: number): BoxDef => {
      const phi = (deg * Math.PI) / 180;
      return {
        c: v3(s * r * Math.cos(phi), y, cz + r * Math.sin(phi)),
        h: half,
        q: qFromAxisAngle(v3(0, 1, 0), s * (-phi - Math.PI / 2)),
        mat: 'glow',
        color: KOI,
        noCollide: true,
      };
    };
    // angle on the circle, half length, half height, half width (head first)
    const body: [number, number, number, number][] = [
      [40, 0.3, 0.16, 0.2],
      [28, 0.33, 0.2, 0.24],
      [16, 0.33, 0.19, 0.22],
      [4, 0.33, 0.16, 0.18],
      [-8, 0.32, 0.12, 0.13],
      [-19, 0.3, 0.08, 0.09],
    ];
    body.forEach(([a, l, hh, w], i) => push(seg(a, v3(l, hh, w), 1 + 0.06 * Math.sin(i * 1.3))));
    push(seg(-29, v3(0.32, 0.03, 0.36), 1.05)); // tail fin
    push(seg(30, v3(0.16, 0.025, 0.5), 0.95)); // pectoral fins
  }
  // planters on the rim (half cover) and a vending pair by the south mouth
  pair(9, 0, 0.2, 11.8, 1.1, 1.8, 'panel', { color: FACADE_WARM });
  deco(9, 1.1, 0.2, 11.8, 1.2, 1.8, 'leaf', 0x2f5a4a);
  pair(9, 0, -15.8, 11.8, 1.1, -14.6, 'panel', { color: FACADE_WARM });
  deco(9, 1.1, -15.8, 11.8, 1.2, -14.6, 'leaf', 0x2f5a4a);
  // lantern strings across the plaza
  for (const z of [-15, 1]) {
    decoMid(-12, 6, z - 0.03, 12, 6.06, z + 0.03, 'hull', DARK);
    for (const [i, x] of [-8, -2.5, 2.5, 8].entries())
      decoMid(x - 0.25, 5.3, z - 0.25, x + 0.25, 6, z + 0.25, 'trim', i % 3 === 0 ? AMBER : PINK);
  }
  // shopfront signs round the plaza
  sign(deco, 'z+', -16, 4, 10, 2.8, 3.2, AMBER);
  sign(deco, 'z-', 2, 4, 10, 2.8, 3.2, TEAL);
  sign(decoMid, 'z-', 2, -6, 6, 5, 7.5, VIOLET, 'glow');
  sign(decoMid, 'z+', -16, -8, 8, 6.5, 8, PINK, 'glow');
  light(0, 6, cz, TEAL, 15, 1.3);
  light(8, 3, cz, PINK, 8, 0.8);
  light(0, 2, P.z0 + 2, VIOLET, 8, 0.6);
  light(0, 3, 0, AMBER, 7, 0.6);
};

/** The south: Foyer, South Alley, Tram Street, Stair Alley, Rail Street and the glass. */
const buildSouth = (kit: Kit): void => {
  const { box, pair, deco, decoMid, light } = kit;
  // the Foyer: ticket machines (full) by the station stair, a turnstile row (half)
  pair(3, 0, 4.2, 5.8, 2.2, 5.4, 'hull', { color: 0x2a2436 });
  deco(3.1, 0.5, 5.4, 5.7, 1.9, 5.45, 'glow', AMBER);
  pair(10.2, 0, 6.6, 11.8, 1.1, 7.8, 'hull', { color: METAL });
  sign(decoMid, 'z-', 8, -1.8, 1.8, 3.2, 3.8, TEAL);
  sign(deco, 'z-', 8, 6.2, 9.8, 3.2, 3.6, VIOLET);
  // South Alley and Tram Street: stalls (half), crates (full), an awning
  pair(14.2, 0, 9, 15.6, 2.2, 10.6, 'crate', { color: 0x4a3a2c });
  pair(20, 0, 14.2, 24, 1.1, 15.2, 'wood', { color: WOOD_LIGHT });
  pair(19.5, 2.9, 14, 24.5, 3.1, 16, 'panel', { color: AWNING_TEAL });
  deco(19.5, 2.75, 15.85, 24.5, 2.9, 16, 'trim', TEAL);
  pair(26, 0, 18.4, 27.4, 2.2, 19.8, 'crate', { color: 0x4a3a2c });
  vending(kit, 32.8, 14.2, 34, 15.4, 'x-', PINK);
  // Stair Alley: a stack (half)
  pair(28.2, 0, 30, 29.6, 1.1, 31.6, 'crate', { color: 0x4a3a2c });
  // Rail Street: a stall with an awning (full kitchen, half counter), vending, a viewing scope
  pair(20, 0, 38.6, 24, 2.4, 40, 'wood', { color: WOOD });
  pair(20, 0, 38, 24, 1.1, 38.6, 'wood', { color: WOOD_LIGHT });
  pair(19.5, 2.9, 37.6, 24.5, 3.1, 40, 'panel', { color: AWNING_VIOLET });
  deco(19.5, 2.75, 37.6, 24.5, 2.9, 37.75, 'trim', VIOLET);
  vending(kit, 39, 38.8, 40.2, 40, 'z-', TEAL);
  pair(14.2, 0, 38.4, 15.4, 2.2, 40, 'hull', { color: METAL }); // the scope at the dead end
  deco(14.4, 2.2, 38.7, 15.2, 2.6, 39.7, 'trim', TEAL);
  pair(30.2, 0, 36.2, 31.6, 2.2, 37.6, 'crate', { color: 0x4a3a2c });
  // lantern strings over Rail Street, signs
  for (const x of [18, 27, 42]) {
    deco(x - 0.03, 5.9, 36.2, x + 0.03, 5.96, 40, 'hull', DARK);
    deco(x - 0.22, 5.3, 37.8, x + 0.22, 5.9, 38.2, 'trim', x === 27 ? PINK : AMBER);
  }
  sign(deco, 'z+', 36, 16, 26, 5, 7.5, PINK, 'glow');
  sign(deco, 'z-', 20, 20, 26, 5, 7.5, VIOLET, 'glow');
  sign(deco, 'x-', 18, 5, 12, 3, 3.4, AMBER);
  // puddles on the wet street (a sheen of glass over the asphalt)
  const puddle = (x0: number, z0: number, x1: number, z1: number) =>
    deco(x0, 0.002, z0, x1, 0.012, z1, 'skyglass', PUDDLE);
  puddle(33, 37, 36.5, 39);
  puddle(15, 16, 17, 19);
  puddle(26, -7.5, 29, -5);
  puddle(35, -39.5, 37.5, -37);
  box(-0.8, 0, 4.1, 0.8, 0.02, 7.9, 'trim', { color: TEAL, noCollide: true });
  light(6, 3.2, 6, TEAL, 9, 0.8);
  light(16, 3, 10, AMBER, 7, 0.6);
  light(24, 3, 17, TEAL, 9, 0.8);
  light(30, 3, 28, VIOLET, 7, 0.6);
  light(22, 2.6, 37, VIOLET, 8, 0.8);
  light(36, 3, 38, PINK, 8, 0.6);
  light(0, 3, 13, 0xcfd8ff, 6, 0.7); // the station stair
  light(0, 3, 38, 0x6a88ff, 12, 0.6); // the planet's glow through the window
};

/** B: the station on the upper floor, the train in it and the covered monorail track. */
const buildStation = ({ box, pair, deco, decoMid, light }: Kit): void => {
  const Y = AFTERGLOW.up;
  const T = AFTERGLOW.track;
  // yellow safety lines along the track, the running rails
  decoMid(-10, Y, T.z0 - 0.4, 10, Y + 0.02, T.z0, 'glow', 0xe8c040);
  decoMid(-10, Y, T.z1, 10, Y + 0.02, T.z1 + 0.4, 'glow', 0xe8c040);
  for (const z of [23.1, 24.9]) {
    deco(6, Y, z - 0.06, 42, Y + 0.015, z + 0.06, 'glow', RAILS);
  }
  // the train standing at the platform: doors open on both sides, its ends shut (the track's
  // long line stops at it), a roof
  const C = AFTERGLOW.car;
  const body = { color: 0xd9d3ea };
  const doorsAt = [-C.side1, -C.side0, -C.door, C.door, C.side0, C.side1];
  for (const [z0, z1] of [
    [C.z0, C.z0 + 0.2],
    [C.z1 - 0.2, C.z1],
  ]) {
    // wall pieces between the doors (x -6..6), a lintel over the doors
    const xs = [-C.x, ...doorsAt, C.x];
    for (let i = 0; i < xs.length - 1; i += 2)
      box(xs[i], Y, z0, xs[i + 1], C.top, z1, 'panel', body);
    for (let i = 1; i < xs.length - 1; i += 2)
      box(xs[i], Y + 2.4, z0, xs[i + 1], C.top, z1, 'panel', body);
  }
  pair(C.x - 0.2, Y, C.z0 + 0.2, C.x, C.top, C.z1 - 0.2, 'panel', body);
  box(-C.x, C.top, C.z0, C.x, C.top + 0.2, C.z1, 'panel', { color: 0xb8b0cc });
  for (const [z0, z1] of [
    [C.z0 - 0.05, C.z0],
    [C.z1, C.z1 + 0.05],
  ])
    decoMid(-C.x + 0.2, Y + 2.5, z0, C.x - 0.2, Y + 2.8, z1, 'glow', VIOLET);
  deco(C.x, Y + 1.2, 23.6, C.x + 0.05, Y + 2.2, 24.4, 'trim', 0xfff0d8);
  // north platform: a timetable pylon (full), benches (half); south platform: a kiosk (full)
  box(-1.5, Y, 20, 1.5, Y + 2.4, 20.5, 'panel', { color: DARK });
  decoMid(-1.3, Y + 0.9, 20.5, 1.3, Y + 2.2, 20.55, 'glow', AMBER);
  decoMid(-1.3, Y + 0.9, 19.95, 1.3, Y + 2.2, 20, 'glow', TEAL);
  pair(5, Y, 19.2, 7.5, Y + 0.55, 19.9, 'wood', { color: WOOD });
  box(-2, Y, 27.4, 2, Y + 2.4, 29.4, 'panel', { color: FACADE_WARM });
  decoMid(-2.05, Y + 1.6, 27.35, 2.05, Y + 1.9, 27.4, 'trim', PINK);
  pair(8.2, Y, 28.4, 9.8, Y + 0.55, 29.2, 'wood', { color: WOOD });
  pair(8.6, Y, 18.4, 9.8, Y + 2.2, 19.6, 'hull', { color: 0x2a2436 }); // ticket machine
  deco(8.55, Y + 0.6, 18.5, 8.6, Y + 1.9, 19.5, 'glow', TEAL);
  // site B marking
  const Bs = AFTERGLOW.bombSites.B;
  const w = 0.12;
  decoMid(Bs.min.x, Y, Bs.min.z, Bs.max.x, Y + 0.03, Bs.min.z + w, 'trim', SITE);
  decoMid(Bs.min.x, Y, Bs.max.z - w, Bs.max.x, Y + 0.03, Bs.max.z, 'trim', SITE);
  deco(Bs.max.x - w, Y, Bs.min.z + w, Bs.max.x, Y + 0.03, T.z0 - 0.4, 'trim', SITE);
  deco(Bs.max.x - w, Y, T.z1 + 0.4, Bs.max.x, Y + 0.03, Bs.max.z - w, 'trim', SITE);
  // the station's name board and ceiling strips
  sign(decoMid, 'z+', 18, -6, 6, Y + 2.8, Y + 3.3, AMBER);
  for (const z of [20, 28]) decoMid(-8, 8.35, z - 0.1, 8, 8.5, z + 0.1, 'trim', 0xe8e0ff);
  // the track: a maintenance cart (full cover) and a signal box (half) break its long line
  pair(27, Y, 22, 29.5, Y + 2.2, 23.8, 'hull', { color: 0x5a2230 });
  deco(26.95, Y + 1.4, 22.2, 27, Y + 1.9, 23.6, 'trim', 0xff3030);
  pair(14, Y, 24.8, 15.4, Y + 1.1, 26, 'hull', { color: METAL });
  pair(40.8, Y, 22, 42, Y + 2.2, 26, 'hull', { color: 0x5a2230 }); // the buffer stop
  deco(40.75, Y + 1.6, 22.2, 40.8, Y + 2, 25.8, 'trim', 0xff3030);
  for (const x of [13, 21, 33, 39]) deco(x - 1, 8.35, 23.9, x + 1, 8.5, 24.1, 'trim', TEAL);
  light(0, 7.8, 20, 0xcfd8ff, 10, 0.8);
  light(0, 7.8, 28, 0xcfd8ff, 10, 0.8);
  light(0, 6.5, 24, VIOLET, 8, 0.7);
  light(14, 7.5, 24, TEAL, 7, 0.6);
  light(30, 7.5, 24, PINK, 8, 0.6);
  light(38, 7.5, 24, TEAL, 7, 0.6);
  light(36, 6, 31, AMBER, 7, 0.6); // the monorail stair
};

/** The metro: platform lights, the tunnel, the hall under the station. */
const buildMetro = ({ pair, deco, decoMid, box, light }: Kit): void => {
  const Y = AFTERGLOW.metro;
  // the metro hall: pillars (full), benches (half)
  for (const [x, z] of [
    [4, 22.5],
    [4, 26.5],
  ] as [number, number][])
    pair(x - 0.5, Y, z - 0.5, x + 0.5, -1.2, z + 0.5, 'pillar', { color: PILLAR });
  pair(8.5, Y, 27.5, 11, Y + 0.55, 28.3, 'wood', { color: WOOD });
  box(-1.5, Y, 28.6, 1.5, Y + 2.2, 30, 'hull', { color: 0x2a2436 }); // a map board (full)
  decoMid(-1.4, Y + 0.6, 28.55, 1.4, Y + 2, 28.6, 'glow', TEAL);
  decoMid(-12, Y + 3.5, 23.9, 12, Y + 3.6, 24.1, 'trim', 0xe8e0ff);
  // the tunnel: service crates (half) and a cable drum (full)
  pair(20, Y, 20.2, 21.4, Y + 1.1, 21.4, 'crate', { color: 0x4a3a2c });
  pair(38, Y, 20.4, 39.4, Y + 2.2, 21.8, 'crate', { color: 0x4a3a2c });
  deco(12, Y + 3.5, 21.9, 28, Y + 3.6, 22.1, 'trim', TEAL);
  deco(30, Y + 3.5, 19.9, 52, Y + 3.6, 20.1, 'trim', TEAL);
  deco(28.9, Y + 3.5, 4, 29.1, Y + 3.6, 20, 'trim', AMBER);
  light(6, Y + 3, 24, 0xcfd8ff, 10, 0.9);
  light(0, Y + 3, 20, VIOLET, 8, 0.7);
  light(20, Y + 3, 22, TEAL, 8, 0.7);
  light(29, Y + 3, 12, AMBER, 8, 0.7);
  light(40, Y + 3, 20, TEAL, 8, 0.7);
  light(35, -2, 4, PINK, 7, 0.6); // the pachinko stair
  light(8, -2, 13, 0xcfd8ff, 6, 0.6); // the Foyer's stairs
  light(46, -2, 3, 0xcfd8ff, 6, 0.6); // the Tower hall's ramp
};

/** Beyond the glass: the city's towers north, its lower tiers and their lights far below. */
const scenery = ({ box, pair }: Kit): void => {
  // unlit, flat-shaded silhouettes (dark bodies, lit windows): the city far outside the dome
  const far = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number) =>
    pair(x0, y0, z0, x1, y1, z1, 'glow', { color: c, noCollide: true, lowDetail: true });
  const farMid = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    c: number,
  ) => box(x0, y0, z0, x1, y1, z1, 'glow', { color: c, noCollide: true, lowDetail: true });
  /** a tower: body, a lit window stripe up its face toward the dome, a lit band near the top */
  const tower = (
    x: number,
    z0: number,
    z1: number,
    w: number,
    y0: number,
    top: number,
    c: number,
  ) => {
    const face = z0 > 0 ? z0 : z1; // the face toward the market
    const out = z0 > 0 ? -0.1 : 0.1;
    far(x - w / 2, y0, z0, x + w / 2, top, z1, CITY);
    for (const dx of [-w / 4, w / 4])
      far(x + dx - 0.3, y0 + 3, face, x + dx + 0.3, top - 3, face + out, c);
    far(x - w / 2, top - 2, face, x + w / 2, top - 1.5, face + out, AMBER);
  };
  // north: towers of the orbital city beyond the tenements
  tower(18, -67, -57, 10, -20, 46, TEAL);
  tower(44, -82, -68, 14, -20, 62, PINK);
  tower(72, -64, -52, 12, -20, 38, TEAL);
  tower(6, -101, -89, 12, -20, 70, VIOLET);
  // south, below the window: the lower city. Its first tier (y -9), lit streets between blocks
  farMid(-90, -12, 52, 90, -9, 80, CITY);
  for (const [z, c] of [
    [56, AMBER],
    [66, PINK],
  ] as [number, number][])
    farMid(-88, -9, z - 0.4, 88, -8.9, z + 0.4, c);
  for (const x of [15, 40]) far(x - 0.4, -8.9, 53, x + 0.4, -8.8, 79, TEAL);
  for (const [x0, z0, x1, z1, top, c] of [
    [4, 57.5, 12, 65, -2, AMBER],
    [18, 57, 26, 64, 1, PINK],
    [28, 68, 37, 78, -4, TEAL],
    [43, 57, 52, 64, 2, VIOLET],
    [55, 68, 68, 78, 0, AMBER],
  ] as [number, number, number, number, number, number][]) {
    far(x0, -9, z0, x1, top, z1, CITY);
    for (const y of [top - 2.2, top - 4.4]) far(x0 + 0.5, y, z0 - 0.1, x1 - 0.5, y + 0.5, z0, c);
  }
  // the second tier (y -27) and its skyline, rising past the window
  farMid(-140, -30, 95, 140, -27, 160, CITY);
  for (const z of [105, 141]) farMid(-138, -27, z - 0.8, 138, -26.9, z + 0.8, AMBER);
  for (const x of [25, 60, 100]) far(x - 0.8, -26.9, 96, x + 0.8, -26.8, 159, PINK);
  farMid(-0.8, -26.9, 96, 0.8, -26.8, 159, AMBER);
  tower(12, 112, 124, 12, -26.8, 18, AMBER);
  tower(42, 125, 137, 12, -26.8, 26, PINK);
  tower(78, 110, 120, 9, -26.8, 10, TEAL);
  tower(115, 120, 134, 14, -26.8, 32, VIOLET);
};

/**
 * Bot waypoints, named: authored in the east half and mirrored ('stairE' / 'stairW'); points on
 * x = 0 have no suffix.
 */
const waypoints = (): WaypointDef[] => {
  const wps: WaypointDef[] = [];
  const mid = new Set<string>();
  const nameOf = (base: string, s: Sign) => (mid.has(base) ? base : `${base}${s > 0 ? 'E' : 'W'}`);
  const add = (base: string, x: number, feet: number, z: number) => {
    if (x === 0) {
      mid.add(base);
      wps.push({ pos: v3(0, feet + 1, z), links: [], name: base });
      return;
    }
    for (const s of SIGNS)
      wps.push({ pos: v3(s * x, feet + 1, z), links: [], name: nameOf(base, s) });
  };
  const idx = (name: string) => {
    const i = wps.findIndex((w) => w.name === name);
    if (i < 0) throw new Error(`waypoint ${name} missing`);
    return i;
  };
  const link = (a: string, c: string) => {
    for (const s of SIGNS) {
      const i = idx(nameOf(a, s));
      const j = idx(nameOf(c, s));
      if (i === j) continue;
      if (!wps[i].links.includes(j)) wps[i].links.push(j);
      if (!wps[j].links.includes(i)) wps[j].links.push(i);
    }
  };
  const chain = (...names: string[]) => {
    for (let i = 1; i < names.length; i++) link(names[i - 1], names[i]);
  };
  const UP = AFTERGLOW.up;
  const M = AFTERGLOW.metro;
  const P = AFTERGLOW.plaza.y;
  // ---- the base: Tower hall, the two yards, the corridors, the metro platform ----
  add('tower', 48.8, 0, -3);
  add('hallN', 51, 0, -6);
  add('hallW', 45.5, 0, -6);
  add('hallSW', 49.3, 0, 2.5);
  add('hallS', 51, 0, 5);
  add('nLink', 51, 0, -15);
  add('nYardS', 51, 0, -21);
  add('nYard', 50, 0, -27);
  add('nYardN', 53, 0, -33);
  add('nCorrE', 53, 0, -38);
  add('nCorrW', 45, 0, -38);
  add('sLink', 51, 0, 14);
  add('sYardN', 51, 0, 21);
  add('sYard', 50, 0, 27);
  add('sYardS', 53, 0, 33);
  add('sCorrE', 53, 0, 38);
  add('sCorrW', 45, 0, 38);
  add('rampTop', 46, 0, -3);
  add('rampMid', 46, M / 2, 3);
  add('rampBot', 46, M, 9.5);
  add('plat', 49, M, 11);
  add('platIn', 53, M, 12);
  add('platOut', 53, M, 17);
  chain('tower', 'hallN', 'nLink', 'nYardS', 'nYard', 'nYardN', 'nCorrE', 'nCorrW');
  chain('hallN', 'hallW', 'rampTop', 'tower', 'hallSW', 'hallS', 'sLink', 'sYardN', 'sYard');
  chain('sYard', 'sYardS', 'sCorrE', 'sCorrW');
  chain('rampTop', 'rampMid', 'rampBot', 'plat', 'platIn', 'platOut');
  // ---- north: Lantern Alley, the Noodle Bar, the alley's corner, Arcade Lane, Noodle Row ----
  add('alE', 43, 0, -39.2);
  add('alG', 37.5, 0, -39.2);
  add('alD', 37, 0, -37);
  add('al4', 32, 0, -37);
  add('cornerN', 26, 0, -36.5);
  add('cornerM', 25.5, 0, -32.5);
  add('cornerS', 25.5, 0, -26.8);
  add('nbN', 37, 0, -33);
  add('nbSide', 29, 0, -31.5);
  add('nbW', 31.5, 0, -30.5);
  add('nbS', 32.5, 0, -26);
  add('row1', 33, 0, -21);
  add('row2', 32, 0, -15);
  add('row3', 31, 0, -9.5);
  add('lane1', 18, 0, -27.5);
  add('tsNBot', 20, 0, -26.8);
  add('tsNMid', 20, UP / 2, -21);
  add('tsNTop', 20, UP, -15);
  chain('nCorrW', 'alE', 'alG', 'alD', 'al4', 'cornerN', 'cornerM', 'cornerS', 'tsNBot', 'lane1');
  chain('alD', 'nbN', 'nbW', 'nbS', 'row1', 'row2', 'row3');
  chain('cornerM', 'nbSide', 'nbW');
  chain('tsNBot', 'tsNMid', 'tsNTop');
  // ---- A: the arcade hall and Arcade Row ----
  add('aSide', 13, 0, -29);
  add('aIn', 11.4, 0, -29);
  add('aEs', 11.2, 0, -31.6);
  add('aEn', 11, 0, -25);
  add('aK', 3, 0, -25.5);
  add('aK2', 2.8, 0, -29.3);
  add('siteA', 0, 0, -32);
  add('aFront', 0, 0, -23);
  add('row', 0, 0, -19);
  chain('lane1', 'aSide', 'aIn', 'aEs', 'siteA', 'aK2', 'aK', 'aEn', 'aIn');
  chain('aK', 'aFront', 'row');
  // ---- mid: Market Street, the jog, Lantern Passage, the teahouse, the pachinko parlour ----
  add('mE', 42.5, 0, -5.5);
  add('m3', 37, 0, -5);
  add('mC', 32, 0, -5.5);
  add('m2', 26, 0, -6);
  add('jog', 26.5, 0, -9.5);
  add('pas', 19, 0, -9.5);
  add('mouth', 13, 0, -10);
  add('tsMid', 19, UP / 2, -6);
  add('balc', 13, UP, -6);
  add('balcN', 13, UP, -14.5);
  add('th', 18.5, UP, -10);
  chain('hallW', 'mE', 'm3', 'mC', 'm2', 'jog', 'pas', 'mouth');
  chain('row3', 'mC');
  chain('m2', 'tsMid', 'balc', 'th', 'tsNTop');
  chain('balcN', 'th');
  add('pachF', 37, 0, -3);
  add('pk0', 37.5, 0, -1);
  add('pk1', 41, 0, 0.5);
  add('pkE', 41, 0, 4);
  add('pk2', 41, 0, 7);
  add('pk2b', 37.5, 0, 7.5);
  add('pk3', 37.5, 0, 11.2);
  add('pkB', 31, 0, 11.3);
  add('pkStair', 35, M / 2, 4);
  chain('m3', 'pachF', 'pk0', 'pk1', 'pkE', 'pk2', 'pk2b', 'pk3', 'pkB');
  chain('pkE', 'pkStair');
  // ---- the Koi Plaza ----
  add('pN', 0, 0, -15);
  add('pNE', 5, 0, -15);
  add('pNEr', 10, 0, -13.5);
  add('pE', 10, 0, -7);
  add('pSEr', 10, 0, -0.5);
  add('pSE', 5, 0, 1.2);
  add('pS', 0, 0, 1);
  add('bN', 4.5, P, -11);
  add('basinN', 0, P, -11);
  add('bE', 5, P, -7);
  add('bS', 4.5, P, -2.5);
  add('basin', 0, P, -1.5);
  chain('row', 'pN', 'pNE', 'pNEr', 'pE', 'pSEr', 'pSE', 'pS');
  chain('mouth', 'pE', 'bE');
  chain('pNE', 'bN', 'bE', 'bS', 'pSE');
  chain('bN', 'basinN');
  chain('bS', 'basin');
  // ---- south: the Foyer, South Alley, Tram Street, Stair Alley, Rail Street ----
  add('sMouth', 0, 0, 3);
  add('foyerC', 0, 0, 6);
  add('foyerE', 8, 0, 6);
  add('foyerDoor', 13, 0, 6);
  add('sa1', 16, 0, 6);
  add('sa2', 16.5, 0, 12);
  add('tr1', 16, 0, 17);
  add('tr2', 24, 0, 17);
  add('tr3', 31, 0, 17);
  add('stA1', 30, 0, 21.5);
  add('stA2', 31, 0, 28);
  add('stA3', 29, 0, 34.5);
  add('rsC', 29, 0, 38.5);
  add('rsW', 17, 0, 37);
  add('monoBot', 36, 0, 37);
  add('rsFar', 42, 0, 38);
  chain('pS', 'sMouth', 'foyerC', 'foyerE', 'foyerDoor', 'sa1', 'sa2', 'tr1', 'tr2', 'tr3');
  chain('pkB', 'tr3', 'stA1', 'stA2', 'stA3', 'rsC', 'monoBot', 'rsFar', 'sCorrW');
  chain('rsC', 'rsW');
  // ---- B: the station, the monorail track and its stair ----
  add('stMid', 0, UP / 2, 13);
  add('stTop', 0, UP, 19);
  add('stNE', 8, UP, 21);
  add('siteB', 0, UP, 21.2);
  add('stSE', 8, UP, 27);
  add('trk4', 11, UP, 23);
  add('trk3', 20, UP, 24);
  add('trk2', 26, UP, 25);
  add('trk1', 31, UP, 25);
  add('monoTop', 36, UP, 25);
  add('monoMid', 36, UP / 2, 31);
  chain('foyerC', 'stMid', 'stTop', 'stNE', 'siteB');
  chain('stNE', 'trk4', 'stSE');
  chain('trk4', 'trk3', 'trk2', 'trk1', 'monoTop', 'monoMid', 'monoBot');
  // ---- the metro: the Foyer's stairs, the hall under the station, the tunnel, the kink ----
  add('mhMid', 8, M / 2, 13);
  add('mhBot', 8, M, 19.5);
  add('mhC', 0, M, 20.5);
  add('mhS', 0, M, 25);
  add('tW2', 14, M, 22);
  add('tW1', 24, M, 22);
  add('kinkS', 29, M, 20.5);
  add('kinkN', 29, M, 4);
  add('tE1', 34, M, 19.5);
  add('tE2', 44, M, 19.5);
  add('tE3', 51, M, 19.5);
  chain('foyerE', 'mhMid', 'mhBot', 'mhC', 'mhS');
  chain('mhBot', 'tW2', 'tW1', 'kinkS', 'tE1', 'tE2', 'tE3', 'platOut');
  chain('kinkS', 'kinkN', 'pkStair');
  return wps;
};
