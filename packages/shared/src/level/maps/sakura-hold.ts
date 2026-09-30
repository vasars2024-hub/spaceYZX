// "Sakura Hold" — a small cherry-blossom castle compound at dusk, 80 × 80 m (world x = plan x,
// east; world z = plan y, south; ground y 0), for Elimination 1v1–3v3 and small Bomb games.
// Mirror-symmetric north ↔ south across z = 40 (Cyan, team 0, north; Orange, team 1, south).
// East and west are different on purpose: A (east) is the tea garden, B (west) the storehouse
// court; both sit on the middle line, so each team is as far from each site as the other.
//
// The compound is a warren (like a small CS wingman map), not an open yard: plastered walls
// 5.2 m tall split it into courts, tiled roofs cover the halls and verandas, and every floor of
// the keep is a room with narrow slits instead of windows. Ground plan (north half; the south
// half mirrors it, docs/maps/sakura-hold.md has the full text plan):
//
//   POSTERN (x 3..13, z 3..10)      Cyan's side spawn ("postern"): nearer B. Exits: south to the
//        postern yard (west lane, wall-walk stairs), east into the north garden
//   GATEHOUSE (x 32..48, z 3..10)   Cyan's main spawn ("gate") with the Tower. Exits: the main
//        gate under the torii into the front court, side doors to the garden and the east yard
//   NORTH GARDEN / EAST YARD        open gardens along the outer wall (blossom trees, lanterns)
//   FRONT COURT (x 32..48, z 11..24) mid: a shrine stone in the middle, the keep steps south
//   TATAMI HALL (x 16..30) / TEA ROOM (x 50..57)  roofed, shoji-screened halls beside the front
//        court; each has a stairwell down into the cellar
//   WEST LANE (x 9..15) + COVERED WALL-WALK (x 3..8, 3 m up, arrow slits)  the B flank
//   TEA CORRIDOR (x 58..63)          roofed shoji zig-zag from the east yard to A
//   MOAT LANE (x 71..77)             the shallow moat: a slow wading flank to A's water gate
//                                    (LevelDef.slowZones)
//   B — STOREHOUSE COURT (x 15..27, z 29..51)  a walk-through kura (storehouse) in the middle;
//        entrances: north / south verandas (roofed engawa), the keep link (east), the
//        wall-walk tower stairs (west)
//   A — TEA GARDEN (x 53..65, z 29..51)  a tea house of paper walls in the middle (the Boomerang
//        flies through, bullets and eyes don't); entrances: north / south verandas, the keep
//        link (west), the water gate (east)
//   KEEP (x 33..47, z 33..47)        three storeys + a walled roof terrace, doors N / S / E / W
//   CELLAR (y -3.2)                  under the keep: stairs from both halls on each side, a
//        storeroom under the keep — the flank / rotation loop between A and B
import type { Vec3 } from '../../math/vec3';
import { v3 } from '../../math/vec3';
import { LevelBuilder } from '../builder';
import type {
  BoxDef,
  LevelDef,
  LightDef,
  Material,
  SlowZoneDef,
  SpawnDef,
  TowerDef,
  WaypointDef,
} from '../types';

const CYAN = 0x19e3ff;
const ORANGE = 0xff8a1f;
const SITE = 0xc23b3b;

// dusk palette
const BLOSSOM = 0xf4b8c8;
const BLOSSOM_DEEP = 0xe79ab0;
const PLASTER = 0xede3d1;
const TORII = 0xc2372c;
const STONE = 0x8c8a80; // wall bases, shoulder height: muted
const STONE_DARK = 0x6f6e68;
const CELLAR_STONE = 0x5f5a52;
const GRAVEL = 0xb9b2a2;
const WOOD = 0x5e4030;
const MOAT_FLOOR = 0x3f5f5a;
const WATER = 0x7fb3c8;
const LANTERN = 0xffc98a;
const HEDGE = 0x4d6b55;
const KEEP_FLOOR = 0x7a5a42;
const TATAMI = 0x9c8a5a;
const TILE = 0x3a3438;
const CRATE = 0x7b5a3c;

/** the map is N × N metres; the plan grid is 1 m */
const N = 80;
/** the middle of the map (the mirror line is z = MZ) */
const MX = 40;
const MZ = 40;
/** plastered walls and the tops of roofs */
const WALL = 5.2;
/** underside of a roof over a hall / veranda */
const CEIL = 4.4;
/** top of a doorway (a lintel fills the wall above it) */
const DOOR = 3;

/** Key coordinates (the plan). The south half mirrors the north (z → 80 - z). */
export const SAKURA_HOLD = {
  center: v3(MX, 0, MZ),
  /** Cyan's two spawn buildings (Orange's mirror them) */
  gatehouse: { x0: 32, x1: 48, z0: 3, z1: 10 },
  postern: { x0: 3, x1: 13, z0: 3, z1: 10 },
  moat: { x0: 71, x1: 77, z0: 13, z1: 67, depth: 0.35, speedMul: 0.45 },
  keep: { x0: 33, x1: 47, z0: 33, z1: 47, floors: [0, 4, 8], roof: 12 },
  /** the covered wall-walk on the west castle wall: its floor height */
  wall: 3,
  cellar: -3.2,
  /** Towers: Cyan's (north) first, inside the gatehouses */
  towers: [v3(40, 0, 5), v3(40, 0, 75)] as [Vec3, Vec3],
  bombSites: {
    A: { min: v3(55, 0, 33), max: v3(63, 3, 47) },
    B: { min: v3(16, 0, 33), max: v3(26, 3, 47) },
  },
  powerups: [v3(40, 13, 40)],
};

type Sign = 1 | -1;
const SIGNS: Sign[] = [1, -1];
const mz = (n: Sign, z: number) => (n > 0 ? z : 2 * MZ - z);

// ============================================================================================
// The ground plan: a 1 m grid, carved out of solid wall. Cell kinds:
//   O outer castle wall (8 m)   # plastered wall mass (5.2 m)   o open ground   r roofed ground
//   d doorway (roofed by a lintel from 3 m)   w moat water   W roofed water (water gate)
//   x built by hand (keep, wall-walk)
// ============================================================================================
type Cell = 'O' | '#' | 'o' | 'r' | 'd' | 'w' | 'W' | 'x';

/** [kind, x0, z0, x1, z1] in the north half (z1 ≤ 40 or symmetric about 40); mirrored south */
const CARVE: [Cell, number, number, number, number][] = [
  // --- Cyan postern (side spawn) and its yard
  ['r', 3, 3, 13, 10],
  ['d', 4, 10, 7, 11],
  ['d', 13, 6, 14, 9],
  ['o', 3, 11, 15, 13],
  // --- north garden
  ['o', 14, 3, 31, 11],
  ['d', 31, 7, 32, 10],
  // --- gatehouse (main spawn)
  ['r', 32, 3, 48, 10],
  ['d', 38, 10, 42, 11],
  ['d', 48, 7, 49, 10],
  // --- front court and the keep steps
  ['o', 32, 11, 48, 24],
  ['o', 37, 24, 43, 33],
  // --- tatami hall
  ['r', 16, 14, 30, 22],
  ['d', 30, 16, 32, 19],
  ['d', 22, 11, 25, 14],
  ['d', 15, 17, 16, 20],
  ['d', 17, 22, 20, 24],
  // --- west lane
  ['o', 9, 13, 15, 29],
  // --- B: storehouse court, its veranda, the kura, the link to the keep
  ['r', 15, 24, 27, 29],
  ['o', 15, 29, 27, 51],
  ['#', 18, 35, 24, 45],
  ['r', 19, 36, 23, 44],
  ['d', 20, 35, 22, 36],
  ['r', 27, 38, 33, 42],
  // --- east yard and the moat bank
  ['o', 49, 3, 77, 11],
  ['o', 70, 11, 77, 13],
  // --- tea room and the tea corridor
  ['r', 50, 14, 57, 22],
  ['d', 48, 16, 50, 19],
  ['d', 57, 17, 58, 20],
  ['d', 59, 11, 62, 12],
  ['r', 58, 12, 63, 24],
  // --- A: tea garden, its veranda, the link to the keep, the water gate
  ['r', 53, 24, 65, 29],
  ['o', 53, 29, 65, 51],
  ['r', 47, 38, 53, 42],
  ['W', 65, 38, 71, 42],
  // --- the moat lane, with two water walls that break its sightline
  ['w', 71, 13, 77, 40],
  ['#', 71, 24, 74, 25],
  ['#', 74, 31, 77, 32],
  // --- by hand: the keep; the wall-walk, its slit wall, tower room and stairs into B
  ['x', 33, 33, 47, 47],
  ['x', 3, 13, 9, 35],
  ['x', 3, 35, 9, 45],
  ['x', 9, 38, 15, 42],
];

/** Stairwells down into the cellar (holes in the ground floor): [x0, z0, x1, z1], north */
const STAIRWELLS: [number, number, number, number][] = [
  [22, 15, 25, 22],
  [52, 15, 55, 22],
];
/** ground under the wall-walk's stairs: the stairs' own wood (the slab dips into it) */
const RAMP_FLOORS: [number, number, number, number][] = [
  [3, 13, 8, 21],
  [9, 38, 15, 42],
];
/** the cellar's stairs run from the hole's north edge (y 0) south to this z (y cellar) */
const STAIR_FOOT = 22.2;

/** Cellar tunnels (y -3.2 .. -1): [x0, z0, x1, z1], north half, mirrored */
const CELLAR: [number, number, number, number][] = [
  [22, 15, 25, 40],
  [52, 15, 55, 40],
  [22, 38, 55, 42],
  [35, 35, 45, 45],
];
/** the part of the map the cellar's solid rock fills (it is only needed near the tunnels) */
const CELLAR_ROCK = { x0: 18, x1: 60, z0: 13, z1: 67 };

/** The ground plan as text rows (z = 0 first), for the docs and for debugging. */
export const sakuraHoldPlan = (): string[] => plan().map((r) => r.join(''));

const plan = (): Cell[][] => {
  const g: Cell[][] = [];
  for (let z = 0; z < N; z++) {
    const row: Cell[] = [];
    for (let x = 0; x < N; x++) row.push(x < 2 || x >= N - 2 || z < 2 || z >= N - 2 ? 'O' : '#');
    g.push(row);
  }
  for (const [k, x0, z0, x1, z1] of CARVE)
    for (let z = z0; z < z1; z++)
      for (let x = x0; x < x1; x++) {
        g[z][x] = k;
        g[N - 1 - z][x] = k;
      }
  return g;
};

interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  k: string;
}

/**
 * Greedy merge of grid cells with the same key into rectangles, on the north half only (rows
 * 0..39) — the caller mirrors them, so the boxes come out exactly mirror-symmetric.
 */
const mergeNorth = (key: (x: number, z: number) => string | null): Rect[] => {
  const H = MZ;
  const used = new Uint8Array(N * H);
  const out: Rect[] = [];
  for (let z = 0; z < H; z++)
    for (let x = 0; x < N; x++) {
      if (used[z * N + x]) continue;
      const k = key(x, z);
      if (k === null) continue;
      let x1 = x;
      while (x1 < N && !used[z * N + x1] && key(x1, z) === k) x1++;
      let z1 = z + 1;
      for (; z1 < H; z1++) {
        let ok = true;
        for (let i = x; i < x1 && ok; i++) ok = !used[z1 * N + i] && key(i, z1) === k;
        if (!ok) break;
      }
      for (let j = z; j < z1; j++) for (let i = x; i < x1; i++) used[j * N + i] = 1;
      out.push({ x0: x, z0: z, x1, z1, k });
    }
  return out;
};

const inRect = (x: number, z: number, [x0, z0, x1, z1]: number[]) =>
  x >= x0 && x < x1 && z >= z0 && z < z1;
const mirrorRect = ([x0, z0, x1, z1]: number[]) => [x0, N - z1, x1, N - z0];

type Extra = Omit<BoxDef, 'c' | 'h' | 'mat'>;

export const buildSakuraHold = (): LevelDef => {
  const S = SAKURA_HOLD;
  const K = S.keep;
  const b = new LevelBuilder();
  const lights: LightDef[] = [];
  const g = plan();
  const seen = new Set<string>();

  /** a box and its north ↔ south twin (once, when the box is its own twin) */
  const box = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material,
    extra: Extra = {},
  ) => {
    const lo = Math.min(z0, z1);
    const hi = Math.max(z0, z1);
    for (const [a, c] of [
      [lo, hi],
      [N - hi, N - lo],
    ]) {
      const k = [x0, y0, a, x1, y1, c, mat, extra.color ?? -1, extra.noCollide ? 1 : 0].join();
      if (seen.has(k)) continue;
      seen.add(k);
      b.box(
        v3(Math.min(x0, x1), Math.min(y0, y1), a),
        v3(Math.max(x0, x1), Math.max(y0, y1), c),
        { mat, ...extra },
      );
    }
  };
  const deco = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material,
    color: number,
  ) => box(x0, y0, z0, x1, y1, z1, mat, { color, noCollide: true });
  /** a wall mass: stone base (muted, up to shoulder height), plaster above */
  const masonry = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) => {
    const cut = Math.min(y1, 1.8);
    if (cut > y0) box(x0, y0, z0, x1, cut, z1, 'rock', { color: STONE });
    if (y1 > cut) box(x0, Math.max(y0, cut), z0, x1, y1, z1, 'panel', { color: PLASTER });
  };
  const light = (x: number, y: number, z: number, color: number, radius: number, k: number) => {
    for (const zz of z === MZ ? [z] : [z, N - z]) lights.push({ pos: v3(x, y, zz), color, radius, intensity: k });
  };
  /** a ramp and its twin, with solid steps under it */
  const ramp = (
    axis: 'x' | 'z',
    from: number,
    to: number,
    yFrom: number,
    yTo: number,
    across: number,
    width: number,
    color = WOOD,
  ) => {
    for (const n of SIGNS) {
      if (axis === 'x') {
        if (n < 0 && across === MZ) continue;
        b.ramp('x', from, to, yFrom, yTo, mz(n, across), width, { mat: 'wood', color });
      } else b.ramp('z', mz(n, from), mz(n, to), yFrom, yTo, across, width, { mat: 'wood', color });
    }
    // steps under it: `hi` end at yHigh
    const [hiAt, loAt, yHigh, yLow] = yTo > yFrom ? [to, from, yTo, yFrom] : [from, to, yFrom, yTo];
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const a = hiAt + ((loAt - hiAt) * i) / steps;
      const c = hiAt + ((loAt - hiAt) * (i + 1)) / steps;
      const top = yHigh + ((yLow - yHigh) * (i + 1)) / steps - 0.8;
      if (top <= yLow + 0.1) continue;
      const w0 = across - width / 2;
      const w1 = across + width / 2;
      if (axis === 'x') box(Math.min(a, c), yLow, w0, Math.max(a, c), top, w1, 'wood', { color: 0x4a3326 });
      else box(w0, yLow, Math.min(a, c), w1, top, Math.max(a, c), 'wood', { color: 0x4a3326 });
    }
  };

  // ======================= ground floor, walls, roofs (from the plan) =======================
  const holes = STAIRWELLS.flatMap((h) => [h, mirrorRect(h)]);
  const inKeep = (x: number, z: number) => x >= K.x0 && x < K.x1 && z >= K.z0 && z < K.z1;
  const floorKey = (x: number, z: number): string | null => {
    const c = g[z][x];
    if (c === 'w' || c === 'W') return 'water';
    if (holes.some((h) => inRect(x, z, h))) return null;
    if (RAMP_FLOORS.some((h) => inRect(x, z, h) || inRect(x, z, mirrorRect(h)))) return 'ramp';
    if (inKeep(x, z)) return 'keep';
    if (c === 'r' || c === 'd') return 'tatami';
    return 'ground';
  };
  const FLOOR: Record<string, [Material, number, number]> = {
    ground: ['sand', GRAVEL, 0],
    tatami: ['wood', TATAMI, 0],
    keep: ['wood', KEEP_FLOOR, 0],
    ramp: ['wood', WOOD, 0],
    water: ['sand', MOAT_FLOOR, -S.moat.depth],
  };
  for (const r of mergeNorth(floorKey)) {
    const [mat, color, top] = FLOOR[r.k];
    box(r.x0, top - 1, r.z0, r.x1, top, r.z1, mat, { color });
    if (r.k === 'water')
      box(r.x0, -0.12, r.z0, r.x1, -0.1, r.z1, 'water', { color: WATER, noCollide: true });
  }
  const wallKey = (x: number, z: number) => {
    const c = g[z][x];
    return c === 'O' || c === '#' ? c : null;
  };
  for (const r of mergeNorth(wallKey)) masonry(r.x0, r.z0, r.x1, r.z1, 0, r.k === 'O' ? 8 : WALL);
  const roofKey = (x: number, z: number) => {
    const c = g[z][x];
    return c === 'r' || c === 'W' ? 'roof' : c === 'd' ? 'door' : null;
  };
  for (const r of mergeNorth(roofKey)) {
    if (r.k === 'roof') box(r.x0, CEIL, r.z0, r.x1, WALL, r.z1, 'panel', { color: TILE });
    else box(r.x0, DOOR, r.z0, r.x1, WALL, r.z1, 'wood', { color: WOOD });
  }

  // ======================= the cellar =======================
  const Y = S.cellar;
  const cellarOpen = (x: number, z: number) =>
    CELLAR.some((t) => inRect(x, z, t) || inRect(x, z, mirrorRect(t)));
  const cellarKey = (x: number, z: number) => {
    const R = CELLAR_ROCK;
    if (x < R.x0 || x >= R.x1 || z < R.z0 || z >= R.z1) return null;
    if (!cellarOpen(x, z)) return 'rock';
    return STAIRWELLS.some((h) => inRect(x, z, [h[0], h[1], h[2], h[3] + 2]) || inRect(x, z, mirrorRect([h[0], h[1], h[2], h[3] + 2])))
      ? 'stair'
      : 'open';
  };
  for (const r of mergeNorth(cellarKey)) {
    if (r.k === 'rock') box(r.x0, Y, r.z0, r.x1, -1, r.z1, 'rock', { color: CELLAR_STONE });
    else if (r.k === 'stair') box(r.x0, Y - 1, r.z0, r.x1, Y, r.z1, 'wood', { color: TATAMI });
    else box(r.x0, Y - 1, r.z0, r.x1, Y, r.z1, 'rock', { color: STONE_DARK });
  }
  // the stairs down from the halls (top at the hole's north edge)
  for (const [x0, z0, x1] of STAIRWELLS)
    ramp('z', z0, STAIR_FOOT, 0, Y, (x0 + x1) / 2, x1 - x0, TATAMI);
  // railings round the stairwells (waist-high), open at the top end
  for (const [x0, z0, x1, z1] of STAIRWELLS) {
    box(x0 - 0.3, 0, z0 + 1.5, x0, 1, z1, 'wood', { color: WOOD });
    box(x1, 0, z0 + 1.5, x1 + 0.3, 1, z1, 'wood', { color: WOOD });
  }
  // storeroom crates under the keep
  box(36, Y, 35.5, 38, Y + 1.1, 37, 'crate', { color: CRATE });
  box(42, Y, 35.5, 44.5, Y + 2.2, 37.2, 'crate', { color: CRATE });

  // ======================= the covered wall-walk (west castle wall) =======================
  const WW = S.wall;
  // stairs up from the postern yard, then the walk to the tower room in the middle
  ramp('z', 13, 21, 0, WW, 5.5, 5, WOOD);
  box(3, 0, 21, 8, WW, 21.5, 'wood', { color: WOOD });
  masonry(3, 21.5, 8, 35, 0, WW - 0.4);
  box(3, WW - 0.4, 21, 8, WW, 35, 'wood', { color: WOOD });
  // tower room (x 3..9, z 35..45) and the stairs down east into B
  masonry(3, 35, 8.5, 45, 0, WW - 0.4);
  box(8.5, 0, 38, 9, WW - 0.4, 42, 'wood', { color: WOOD });
  box(3, WW - 0.4, 35, 9, WW, 45, 'wood', { color: WOOD });
  ramp('x', 15, 9, 0, WW, MZ, 4, WOOD);
  // the stair corridor's side walls reach up to the wall-walk's roof
  // the slit wall between the walk and the west lane: arrow slits at eye height
  const slits = [24.8, 28.8, 32.4];
  for (const n of SIGNS) {
    const z0 = n > 0 ? 13 : N - 35;
    const z1 = n > 0 ? 35 : N - 13;
    const holes = slits.map((z) => {
      const c = mz(n, z);
      return { u0: c - 0.2, u1: c + 0.2, v0: WW + 1, v1: WW + 2 };
    });
    b.wall('x', 8.5, 1, z0, z1, 0, 1.8, [], { mat: 'rock', color: STONE });
    b.wall('x', 8.5, 1, z0, z1, 1.8, WALL, holes, { mat: 'panel', color: PLASTER });
  }
  // the walk's roof (higher than the others: 2.2 m of headroom over the walk)
  box(3, WALL, 13, 9, WALL + 0.8, 35, 'panel', { color: TILE });
  box(3, WALL, 35, 9, WALL + 0.8, 45, 'panel', { color: TILE });
  box(9, WALL, 38, 15, WALL + 0.8, 42, 'panel', { color: TILE });
  // the corridor at the stairs: plaster walls from the ground to its roof
  // (cells x 9..15 z 38..42 are open; the wall masses beside them stop at 5.2 = roof bottom)
  // a pillar in the middle of the tower room breaks the long look down the walk
  box(5, WW, 39, 6.5, WALL, 41, 'wood', { color: WOOD });

  // ======================= the keep =======================
  buildKeep(b, box);

  // ======================= paper screens (shoji) =======================
  /** a paper wall from (x0, z0) to (x1, z1) (one of them equal), posts at both ends, 0.2 thick */
  const shoji = (x0: number, z0: number, x1: number, z1: number, top = CEIL) => {
    const alongX = z0 === z1;
    const t = 0.1;
    const p = 0.4;
    if (alongX) {
      box(x0 + p, 0, z0 - t, x1 - p, top, z0 + t, 'paper', { color: PLASTER, boomerangPasses: true });
      box(x0, 0, z0 - 0.2, x0 + p, top, z0 + 0.2, 'wood', { color: WOOD });
      box(x1 - p, 0, z0 - 0.2, x1, top, z0 + 0.2, 'wood', { color: WOOD });
    } else {
      box(x0 - t, 0, z0 + p, x0 + t, top, z1 - p, 'paper', { color: PLASTER, boomerangPasses: true });
      box(x0 - 0.2, 0, z0, x0 + 0.2, top, z0 + p, 'wood', { color: WOOD });
      box(x0 - 0.2, 0, z1 - p, x0 + 0.2, top, z1, 'wood', { color: WOOD });
    }
    // a lattice rail painted across the paper (on both faces, not through it)
    const len = alongX ? x1 - x0 : z1 - z0;
    if (len > 1.6)
      for (const f of [-1, 1]) {
        const a = f * t;
        const c = f * (t + 0.02);
        if (alongX) deco(x0 + p, 1.46, z0 + a, x1 - p, 1.54, z0 + c, 'wood', WOOD);
        else deco(x0 + a, 1.46, z0 + p, x0 + c, 1.54, z1 - p, 'wood', WOOD);
      }
  };
  // tatami hall: a paper wall splits the front room from the main room (opening in the middle)
  shoji(27.5, 14, 27.5, 16.5);
  shoji(27.5, 19.5, 27.5, 22);
  // tea corridor: a zig-zag of paper walls
  shoji(58, 16, 60.8, 16);
  shoji(60.2, 20, 63, 20);
  // the tea house in A: paper walls all round, doorways west and east, a tiled roof
  const T = { x0: 57, x1: 61, z0: 37, z1: 43 };
  shoji(T.x0, T.z0, T.x1, T.z0);
  shoji(T.x0, T.z0, T.x0, 39);
  shoji(T.x1, T.z0, T.x1, 39);
  box(T.x0 - 0.4, CEIL, T.z0 - 0.4, T.x1 + 0.4, CEIL + 0.5, T.z1 + 0.4, 'panel', { color: TILE });

  // ======================= verandas: posts along the open edge =======================
  for (const x of [18.5, 21.5, 24.5, 55.5, 58.5, 61.5]) box(x - 0.15, 0, 28.7, x + 0.15, CEIL, 29, 'wood', { color: WOOD });

  // ======================= cover =======================
  /** stone lantern: waist-high base, a glowing lamp on it (decoration) */
  const lantern = (x: number, z: number) => {
    box(x - 0.5, 0, z - 0.5, x + 0.5, 1.1, z + 0.5, 'rock', { color: STONE_DARK });
    deco(x - 0.3, 1.1, z - 0.3, x + 0.3, 1.45, z + 0.3, 'trim', LANTERN);
  };
  /** half-height crates only in the open: nothing climbs from them onto the 5.2 m roofs */
  const crate = (x0: number, z0: number, x1: number, z1: number) =>
    box(x0, 0, z0, x1, 1.1, z1, 'crate', { color: CRATE });
  const hedge = (x0: number, z0: number, x1: number, z1: number) =>
    box(x0, 0, z0, x1, 1.1, z1, 'leaf', { color: HEDGE });
  // front court: the shrine stone in the middle (full cover), lanterns, a hedge
  box(38, 0, 18, 42, 2.4, 19.2, 'rock', { color: STONE_DARK });
  box(37.8, 2.4, 17.8, 42.2, 2.7, 19.4, 'panel', { color: TORII });
  lantern(34.5, 14.5);
  lantern(45.5, 14.5);
  hedge(44, 21, 46.5, 22);
  // torii in front of the main gate (the posts collide, the beams are decoration)
  for (const x of [37.2, 42.2]) box(x, 0, 12.7, x + 0.6, 4.2, 13.3, 'panel', { color: TORII });
  deco(36.4, 4.2, 12.6, 43.6, 4.6, 13.4, 'panel', TORII);
  deco(36, 4.8, 12.5, 44, 5.1, 13.5, 'panel', 0x2a2222);
  // torii on the moat bank
  for (const x of [71.2, 76.2]) box(x, 0, 11.7, x + 0.6, 3.6, 12.3, 'panel', { color: TORII });
  deco(70.5, 3.6, 11.6, 77, 3.95, 12.4, 'panel', TORII);
  // north garden, east yard
  lantern(15.5, 4.5);
  lantern(27, 5);
  hedge(22, 7, 25, 8);
  lantern(52, 5);
  lantern(67, 5);
  hedge(63, 8, 66, 9);
  // west lane: a stone well and a woodpile
  box(9.5, 0, 15.5, 11, 1.1, 17, 'rock', { color: STONE_DARK });
  crate(9.5, 22, 11, 24);
  // B: crates in the court and in the kura
  crate(22.8, 30.8, 24.4, 32.4);
  crate(15, 33.4, 16.3, 34.6);
  crate(19, 38, 20.2, 39.4);
  // A: lanterns
  lantern(56.5, 34.5);
  lantern(57.5, 29.8);
  // gatehouse: a screen behind the main gate and beside each side door (no look inside)
  box(37, 0, 8, 43, CEIL, 8.6, 'wood', { color: WOOD });
  box(33.6, 0, 6.4, 34, CEIL, 10, 'wood', { color: WOOD });
  box(46, 0, 6.4, 46.4, CEIL, 10, 'wood', { color: WOOD });
  // postern: screens inside both doors
  box(3, 0, 7.8, 8.2, CEIL, 8.2, 'wood', { color: WOOD });
  box(11, 0, 5.4, 11.4, CEIL, 10, 'wood', { color: WOOD });

  // ======================= blossom trees (canopies above head height) =======================
  const tree = (x: number, z: number, h: number) => {
    box(x - 0.35, 0, z - 0.35, x + 0.35, h - 0.4, z + 0.35, 'wood', { color: WOOD });
    deco(x - 2, h - 0.4, z - 1.8, x + 1.9, h + 1.2, z + 2, 'leaf', BLOSSOM);
    deco(x - 1.4, h + 1.2, z - 1.3, x + 1.5, h + 2, z + 1.2, 'leaf', BLOSSOM_DEEP);
  };
  tree(18, 6, 3.3);
  tree(56.5, 6.5, 3.4);
  tree(72, 7, 3.3);
  tree(61.5, 32.5, 3.2);
  tree(34.5, 21.5, 3.4);

  // ======================= Towers, spawns, Controller homes =======================
  const towers: TowerDef[] = [];
  const spawns: SpawnDef[] = [];
  const homes: Vec3[] = [];
  for (const team of [0, 1] as const) {
    const n: Sign = team === 0 ? 1 : -1;
    const tp = S.towers[team];
    const tc = team === 0 ? CYAN : ORANGE;
    b.block(v3(tp.x, 2, tp.z), v3(2, 4, 2), { mat: team === 0 ? 'teamA' : 'teamB', trim: tc });
    towers.push({ team, pos: tp, radius: 1.5, height: 4 });
    homes.push(v3(tp.x, 0.9, mz(n, 7.2)));
    const yaw = team === 0 ? 180 : 0;
    for (const [x, z] of [
      [34.5, 4.5],
      [36.5, 6.5],
      [43.5, 6.5],
      [45.5, 4.5],
    ])
      spawns.push({ pos: v3(x, 0, mz(n, z)), yawDeg: yaw, team, group: 'gate' });
    for (const [x, z] of [
      [5, 5],
      [7.5, 5],
      [5, 7],
      [9.5, 6.5],
    ])
      spawns.push({ pos: v3(x, 0, mz(n, z)), yawDeg: yaw, team, group: 'postern' });
  }

  // ======================= the moat slows you down =======================
  const slowZones: SlowZoneDef[] = [];
  const M = S.moat;
  for (const [x0, z0, x1, z1] of [
    [M.x0, M.z0, M.x1, MZ],
    [65, 38, 71, MZ],
  ])
    for (const n of SIGNS) {
      const zs = [mz(n, z0), mz(n, z1)];
      slowZones.push({
        min: v3(x0, -1, Math.min(...zs)),
        max: v3(x1, 0.6, Math.max(...zs)),
        speedMul: M.speedMul,
      });
    }

  // ======================= markings and lights =======================
  for (const st of [S.bombSites.A, S.bombSites.B]) {
    const w = 0.12;
    b.box(v3(st.min.x, 0, st.min.z), v3(st.max.x, 0.03, st.min.z + w), { mat: 'trim', color: SITE, noCollide: true });
    b.box(v3(st.min.x, 0, st.max.z - w), v3(st.max.x, 0.03, st.max.z), { mat: 'trim', color: SITE, noCollide: true });
  }
  for (const n of SIGNS) {
    const tc = n > 0 ? CYAN : ORANGE;
    lights.push({ pos: v3(40, 3.4, mz(n, 6)), color: tc, radius: 10, intensity: 0.8 });
    lights.push({ pos: v3(8, 3.4, mz(n, 6)), color: tc, radius: 8, intensity: 0.7 });
  }
  light(23, 3.6, 18, LANTERN, 10, 0.8); // tatami hall
  light(53.5, 3.6, 18, LANTERN, 8, 0.8); // tea room
  light(60.5, 3.6, 16, LANTERN, 7, 0.7); // tea corridor
  light(60.5, 3.6, 22, LANTERN, 7, 0.7);
  light(21, 3.6, 26.5, LANTERN, 9, 0.7); // B veranda
  light(59, 3.6, 26.5, LANTERN, 9, 0.7); // A veranda
  light(21, 3.6, 40, LANTERN, 7, 0.8); // kura
  light(59, 3.6, 40, LANTERN, 6, 0.8); // tea house
  light(30, 3.6, 40, LANTERN, 6, 0.7); // links
  light(50, 3.6, 40, LANTERN, 6, 0.7);
  light(68, 3.4, 40, LANTERN, 6, 0.7); // water gate
  light(40, Y + 2, 40, LANTERN, 10, 0.9); // cellar storeroom
  light(23.5, Y + 2, 30, LANTERN, 8, 0.8); // cellar tunnels
  light(53.5, Y + 2, 30, LANTERN, 8, 0.8);
  light(30, Y + 2, 40, LANTERN, 7, 0.8);
  light(50, Y + 2, 40, LANTERN, 7, 0.8);
  light(5.5, WW + 2, 26, LANTERN, 9, 0.7); // wall-walk
  light(6, WW + 2, 40, LANTERN, 8, 0.8);
  light(40, 2.8, 36, LANTERN, 7, 0.8); // keep floors
  light(40, 6.8, 36, LANTERN, 7, 0.8);
  light(40, 10.8, 36, LANTERN, 7, 0.8);
  light(40, 3.5, 20, LANTERN, 9, 0.6); // front court, gardens, sites
  light(21, 3, 40, LANTERN, 9, 0.5);
  light(59, 3, 34, LANTERN, 8, 0.6);
  light(74, 3, 26, LANTERN, 8, 0.6);
  // far scenery: hills and a pagoda silhouette in the mist
  const far = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: Material, color: number) =>
    b.box(v3(x0, y0, z0), v3(x1, y1, z1), { mat, color, noCollide: true });
  far(90, 8.1, -80, 130, 26, -40, 'leaf', 0x5d7280);
  far(60, 8.1, -120, 110, 34, -90, 'leaf', 0x4f6275);
  far(100, 8.1, -10, 125, 18, 40, 'leaf', 0x687d88);
  far(96, 8.1, -30, 104, 16, -22, 'panel', 0x3b3440);
  far(94, 16, -32, 106, 17, -20, 'panel', TORII);
  far(96.5, 17, -29.5, 103.5, 24, -22.5, 'panel', 0x3b3440);
  far(94, 24, -32, 106, 25, -20, 'panel', TORII);
  far(97, 25, -29, 103, 30, -23, 'panel', 0x3b3440);

  return b.build({
    name: 'Sakura Hold',
    boundsMin: v3(0, -6, 0),
    boundsMax: v3(80, 18, 80),
    defaultGravity: v3(0, -1, 0),
    zones: [],
    rails: [],
    pads: [],
    spawns,
    towers,
    controllerHomes: homes,
    waypoints: waypoints(),
    areas: [
      { name: 'Cyan gatehouse', pos: v3(40, 0, 7.2), yawDeg: 180 },
      { name: 'Cyan postern', pos: v3(7, 0, 6), yawDeg: 180 },
      { name: 'Orange gatehouse', pos: v3(40, 0, 72.8), yawDeg: 0 },
      { name: 'Front court', pos: v3(40, 0, 15), yawDeg: 180 },
      { name: 'Tatami hall', pos: v3(20, 0, 17), yawDeg: 180 },
      { name: 'Tea corridor', pos: v3(60.5, 0, 14), yawDeg: 180 },
      { name: 'Keep, ground floor', pos: v3(45, 0, 35), yawDeg: 180 },
      { name: 'Keep roof', pos: v3(35, K.roof, 35), yawDeg: 180 },
      { name: 'Wall-walk', pos: v3(5.5, S.wall, 24), yawDeg: 180 },
      { name: 'Cellar', pos: v3(40, S.cellar, 40), yawDeg: 90 },
      { name: 'A site', pos: v3(55, 0, 40), yawDeg: 90 },
      { name: 'B site', pos: v3(16.5, 0, 40), yawDeg: -90 },
      { name: 'Moat', pos: v3(74, -S.moat.depth, 16), yawDeg: 180 },
    ],
    fog: { color: 0xd9aebb, near: 35, far: 140 },
    ambient: 1.05,
    lights,
    bombSites: [
      { name: 'A', ...S.bombSites.A },
      { name: 'B', ...S.bombSites.B },
    ],
    powerups: S.powerups,
    slowZones,
    outdoor: {
      top: 0x4f6c9c,
      horizon: 0xd9aebb,
      ground: 0x7d7f95,
      sun: { dir: v3(0.3, 0.06, -0.95), color: 0xffd6b0, sizeDeg: 4 },
      sunLight: 0xffd9d0,
    },
  });
};

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

/**
 * The keep: 14 × 14 m, walls 0.6 m, floors at 4 and 8, a roof terrace at 12 walled up to 16.
 * Ground floor doors N / S / E / W; no windows, only arrow slits too narrow to climb through.
 * Stairs: ground → 1st rising east (middle), 1st → 2nd rising west (north and south walls),
 * 2nd → roof rising east (middle), each through a hole in the floor above.
 */
const buildKeep = (b: LevelBuilder, box: BoxFn): void => {
  const K = SAKURA_HOLD.keep;
  const T = 0.6;
  const top = 16;
  const wallOpts = { mat: 'panel' as Material, color: PLASTER };
  const baseOpts = { mat: 'rock' as Material, color: STONE };
  const slit = (u: number, y: number, w = 0.4) => ({ u0: u - w / 2, u1: u + w / 2, v0: y + 1, v1: y + 2 });
  const door = { u0: 38, u1: 42, v0: 0, v1: DOOR };
  // north / south walls (full width) and east / west walls (between them)
  const nsSlits = [slit(40, 4), slit(36, 8), slit(44, 8), slit(40, 12, 0.6)];
  const ewSlits = [slit(40, 4), slit(36, 8), slit(44, 8), slit(40, 12, 0.6)];
  for (const z of [K.z0 + T / 2, K.z1 - T / 2]) {
    b.wall('z', z, T, K.x0, K.x1, 0, 1.8, [door], baseOpts);
    b.wall('z', z, T, K.x0, K.x1, 1.8, top, [door, ...nsSlits], wallOpts);
  }
  for (const x of [K.x0 + T / 2, K.x1 - T / 2]) {
    b.wall('x', x, T, K.z0 + T, K.z1 - T, 0, 1.8, [door], baseOpts);
    b.wall('x', x, T, K.z0 + T, K.z1 - T, 1.8, top, [door, ...ewSlits], wallOpts);
  }
  const floor = { mat: 'wood' as Material, color: KEEP_FLOOR };
  const i0 = K.x0 + T;
  const i1 = K.x1 - T;
  const j0 = K.z0 + T;
  const j1 = K.z1 - T;
  b.wall('y', 3.8, 0.4, i0, i1, j0, j1, [{ u0: 36, u1: 44, v0: 38.5, v1: 41.5 }], floor);
  b.wall(
    'y',
    7.8,
    0.4,
    i0,
    i1,
    j0,
    j1,
    [
      { u0: 36, u1: 44, v0: j0, v1: j0 + 3 },
      { u0: 36, u1: 44, v0: j1 - 3, v1: j1 },
    ],
    floor,
  );
  b.wall('y', 11.8, 0.4, i0, i1, j0, j1, [{ u0: 36, u1: 44, v0: 38.5, v1: 41.5 }], floor);
  // stairs (each with solid steps under it)
  const stair = (from: number, to: number, y0: number, y1: number, z: number, w: number) => {
    b.ramp('x', from, to, y0, y1, z, w, { mat: 'wood', color: KEEP_FLOOR });
    const hi = y1 > y0 ? to : from;
    const lo = y1 > y0 ? from : to;
    const yh = Math.max(y0, y1);
    const yl = Math.min(y0, y1);
    for (let i = 0; i < 4; i++) {
      const a = hi + ((lo - hi) * i) / 4;
      const c = hi + ((lo - hi) * (i + 1)) / 4;
      const t = yh + ((yl - yh) * (i + 1)) / 4 - 0.8;
      if (t <= yl + 0.1) continue;
      b.box(v3(Math.min(a, c), yl, z - w / 2), v3(Math.max(a, c), t, z + w / 2), {
        mat: 'wood',
        color: 0x4a3326,
      });
    }
  };
  stair(36, 44, 0, 4, 40, 3);
  stair(44, 36, 4, 8, j0 + 1.5, 3);
  stair(44, 36, 4, 8, j1 - 1.5, 3);
  stair(36, 44, 8, 12, 40, 3);
  // eaves between the storeys (decoration, outside the walls)
  for (const y of [8, 12]) {
    box(K.x0 - 1, y - 0.3, K.z0 - 1, K.x1 + 1, y, K.z0, 'panel', { color: TILE, noCollide: true });
    box(K.x0 - 1, y - 0.3, K.z0, K.x0, y, 40, 'panel', { color: TILE, noCollide: true });
    box(K.x1, y - 0.3, K.z0, K.x1 + 1, y, 40, 'panel', { color: TILE, noCollide: true });
  }
};

/**
 * Bot waypoints, named; authored in the north half and mirrored ('N' / 'S' suffix; points on
 * the middle line z = 40 have no suffix and no twin).
 */
const waypoints = (): WaypointDef[] => {
  const K = SAKURA_HOLD.keep;
  const W = SAKURA_HOLD.wall;
  const Y = SAKURA_HOLD.cellar;
  const wps: WaypointDef[] = [];
  const mid = new Set<string>();
  const nameOf = (base: string, n: Sign) => (mid.has(base) ? base : `${base}${n > 0 ? 'N' : 'S'}`);
  const add = (base: string, x: number, feet: number, z: number) => {
    if (z === MZ) mid.add(base);
    for (const n of SIGNS) {
      if (z === MZ && n < 0) continue;
      wps.push({ pos: v3(x, feet + 1, mz(n, z)), links: [], name: nameOf(base, n) });
    }
  };
  const idx = (name: string) => {
    const i = wps.findIndex((w) => w.name === name);
    if (i < 0) throw new Error(`waypoint ${name} missing`);
    return i;
  };
  const link = (a: string, c: string) => {
    for (const n of SIGNS) {
      const i = idx(nameOf(a, n));
      const j = idx(nameOf(c, n));
      if (i === j) continue;
      if (!wps[i].links.includes(j)) wps[i].links.push(j);
      if (!wps[j].links.includes(i)) wps[j].links.push(i);
    }
  };
  const chain = (...names: string[]) => {
    for (let i = 1; i < names.length; i++) link(names[i - 1], names[i]);
  };

  // gatehouse (main spawn)
  add('tower', MX, 0, 7.2);
  add('gW', 35, 0, 5.5);
  add('gE', 45, 0, 5.5);
  add('gNW', 32.9, 0, 5.5);
  add('gNE', 47.1, 0, 5.5);
  add('gSideW', 32.8, 0, 8.6);
  add('gSideE', 47.2, 0, 8.6);
  add('gGateW', 36, 0, 9.3);
  add('gGateE', 44, 0, 9.3);
  add('gate', 40, 0, 9.4);
  add('gateOut', 40, 0, 11.6);
  // postern (side spawn)
  add('pIn', 9.5, 0, 4.5);
  add('pMid', 6, 0, 6);
  add('pSouth', 9.5, 0, 9.1);
  add('pDoorS', 5.5, 0, 9.1);
  add('pNE', 12.2, 0, 4.5);
  add('pDoorE', 12.4, 0, 7.5);
  add('yard', 6, 0, 12);
  add('yardE', 12, 0, 12);
  // north garden
  add('garW', 15.5, 0, 7.5);
  add('garden', 22, 0, 9.5);
  add('garE', 29.5, 0, 8.6);
  add('garS', 23.5, 0, 10.5);
  // front court and keep steps
  add('court', 40, 0, 14.5);
  add('courtW', 34, 0, 17.5);
  add('courtE', 46, 0, 17.5);
  add('courtS', 40, 0, 22.5);
  add('steps', 40, 0, 28);
  add('kDoor', 40, 0, 32);
  // tatami hall
  add('hDoorN', 23.5, 0, 12.5);
  add('hall', 23.5, 0, 14.6);
  add('hallNE', 26.4, 0, 15);
  add('hallMid', 26.4, 0, 18);
  add('hallE', 28.8, 0, 18);
  add('hFront', 31, 0, 17.5);
  add('hallW', 18, 0, 18.5);
  add('hWest', 15.5, 0, 18.5);
  add('hSouth', 18.5, 0, 23);
  add('hStair', 23.5, -0.44, 16);
  // west lane and B veranda
  add('lane', 12, 0, 14);
  add('laneMid', 12, 0, 20.5);
  add('laneS', 12, 0, 27);
  add('bVer', 18.5, 0, 26.5);
  add('bVerE', 25.5, 0, 26.5);
  // B court
  add('bN', 16.9, 0, 30.5);
  add('bNE', 25.8, 0, 30.5);
  add('bW', 17.1, 0, 36);
  add('bE', 25.5, 0, 36);
  add('bKuraN', 21, 0, 34.8);
  add('bKura', 21, 0, MZ);
  add('siteB', 17, 0, MZ);
  add('bEast', 25.5, 0, MZ);
  add('bLink', 30, 0, MZ);
  // wall-walk
  add('wFoot', 5.5, 0, 12.2);
  add('wTop', 5.5, W, 22);
  add('walk', 5.5, W, 30);
  add('wRoom', 5.5, W, 36.5);
  add('wRoomE', 7.8, W, 37.8);
  add('wStairs', 8.7, W, MZ);
  add('wDown', 15.8, 0, MZ);
  // keep
  add('kIn', 40, 0, 34.8);
  add('kInW', 34.5, 0, 36);
  add('kInE', 45.5, 0, 36);
  add('kWDoor', 33.5, 0, MZ);
  add('kEDoor', 46.5, 0, MZ);
  add('kStairW', 35, 0, MZ);
  add('k1Top', 45.3, 4, MZ);
  add('k1E', 45.3, 4, 37.8);
  add('k1a', 45.3, 4, K.z0 + 2.1);
  add('k2a', 34.7, 8, K.z0 + 2.1);
  add('k2W', 34.7, 8, MZ);
  add('roof', 45.3, K.roof, MZ);
  add('roofN', 40, K.roof, 35.5);
  // east yard, moat
  add('eDoor', 49.5, 0, 8.6);
  add('yardEast', 55, 0, 9.5);
  add('tDoorN', 60.5, 0, 10.3);
  add('bank', 70, 0, 9.5);
  add('bankS', 73.5, 0, 12.2);
  add('moat', 75.5, -0.35, 17);
  add('moat2', 75.5, -0.35, 27.5);
  add('moat3', 72.5, -0.35, 29);
  add('moat4', 72.5, -0.35, 35);
  add('mGate', 73.5, -0.35, MZ);
  add('wGate', 68, -0.35, MZ);
  // tea room and tea corridor
  add('tFront', 49, 0, 17.5);
  add('tRoom', 51, 0, 18);
  add('tRoomN', 51, 0, 15);
  add('tTop', 53.5, 0, 14.6);
  add('tStair', 53.5, -0.44, 16);
  add('tRoomNE', 56.2, 0, 15);
  add('tRoomE', 56.3, 0, 18.5);
  add('tCorr', 59, 0, 18.5);
  add('tCorrN', 61.5, 0, 13);
  add('tCorrN2', 61.9, 0, 17.5);
  add('tCorrS', 59, 0, 23);
  add('aVer', 60, 0, 26.5);
  add('aVerW', 54.5, 0, 26.5);
  // A court
  add('aNW', 54.5, 0, 30.5);
  add('aN', 59.5, 0, 34);
  add('aNE', 63.8, 0, 30.5);
  add('aE', 63.3, 0, 35.5);
  add('aW', 54.5, 0, MZ);
  add('aTea', 59, 0, MZ);
  add('siteA', 63.5, 0, MZ);
  add('aLink', 50, 0, MZ);
  // cellar
  add('cStairMid', 23.5, -2, 19.5);
  add('cStairW', 23.5, Y, 23.8);
  add('cW', 23.5, Y, 38);
  add('cWest', 27, Y, MZ);
  add('cRoom', 40, Y, MZ);
  add('cEast', 50, Y, MZ);
  add('cE', 53.5, Y, 38);
  add('cStairE', 53.5, Y, 23.8);
  add('cStairMidE', 53.5, -2, 19.5);

  chain('tower', 'gW', 'gGateW', 'gate', 'gGateE', 'gE', 'tower');
  chain('gW', 'gNW', 'gSideW', 'garE');
  chain('gE', 'gNE', 'gSideE', 'eDoor');
  chain('gate', 'gateOut', 'court');
  chain('pIn', 'pMid');
  chain('pIn', 'pSouth', 'pDoorS', 'yard', 'yardE', 'lane');
  chain('pIn', 'pNE', 'pDoorE', 'garW', 'garden', 'garE');
  chain('garden', 'garS', 'hDoorN', 'hall');
  chain('yard', 'wFoot', 'wTop', 'walk', 'wRoom', 'wRoomE', 'wStairs', 'wDown', 'siteB');
  chain('court', 'courtW', 'hFront', 'hallE', 'hallMid', 'hallNE', 'hall');
  chain('hall', 'hallW', 'hWest', 'laneMid');
  chain('hallW', 'hSouth', 'bVer');
  chain('hall', 'hStair', 'cStairMid', 'cStairW', 'cW', 'cWest', 'cRoom', 'cEast', 'cE');
  chain('cE', 'cStairE', 'cStairMidE', 'tStair', 'tTop');
  chain('court', 'courtE', 'tFront', 'tRoom', 'tRoomN', 'tTop', 'tRoomNE', 'tRoomE', 'tCorr');
  chain('tCorr', 'tCorrS', 'aVer');
  chain('tCorr', 'tCorrN2', 'tCorrN', 'tDoorN', 'yardEast', 'eDoor');
  chain('yardEast', 'bank', 'bankS', 'moat', 'moat2', 'moat3', 'moat4', 'mGate', 'wGate', 'siteA');
  chain('courtW', 'courtS', 'courtE');
  chain('courtS', 'steps', 'kDoor', 'kIn');
  chain('lane', 'laneMid', 'laneS', 'bVer', 'bVerE', 'bNE');
  chain('bVer', 'bN', 'bW', 'siteB');
  chain('bNE', 'bE', 'bEast', 'bLink', 'kWDoor', 'kStairW');
  chain('bN', 'bKuraN', 'bKura');
  chain('kIn', 'kInW', 'kStairW');
  chain('kIn', 'kInE', 'kEDoor', 'aLink', 'aW');
  chain('kStairW', 'k1Top', 'k1E', 'k1a', 'k2a', 'k2W', 'roof', 'roofN');
  chain('aVer', 'aVerW', 'aNW', 'aW');
  chain('aVer', 'aN', 'aE', 'siteA');
  chain('aNW', 'aN');
  chain('aNE', 'aE');
  chain('aW', 'aTea', 'siteA');
  return wps;
};
