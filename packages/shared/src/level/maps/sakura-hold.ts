// "Sakura Hold" — a small cherry-blossom castle compound at dusk, 80 × 80 m (world x = plan x,
// east; world z = plan y, south; ground y 0), for Elimination 1v1–3v3 and small Bomb games.
// Mirror-symmetric north ↔ south across z = 40 (Cyan, team 0, gate north; Orange, team 1, gate
// south) and built the same east ↔ west (except the keep's stairs); bomb site A is in the east
// courtyard, B in the west one.
//
//   GATEHOUSES (x 30..50)       walled spawns: a main gate onto the moat bridge (under a torii),
//        side doors out to the ground along the outer wall
//   MOAT (x 10..70, z 12..68)   a shallow ring of water, 4 m wide, that slows you to a wade
//        (LevelDef.slowZones); bridges at the gates, the wall ramps cross it
//   CASTLE WALLS (x 4..10 / 70..76)  walkable, 4 m up: a ramp at each end from the outer ground,
//        a ramp down over the moat into each site in the middle
//   COURTYARD (x 14..66, z 16..64)  blossom trees (canopies above head height only), stone
//        lanterns, and the SHOJI WALLS: paper screens that stop players, bullets, lasers and
//        sight, but the Boomerang flies straight through them (BoxDef.boomerangPasses)
//   KEEP (x 32..48, z 32..48)   three storeys and a walkable roof: doors east / west, ramps inside
//        (a switchback), windows on every floor; a launch pad at each gate side (40, 29) /
//        (40, 51) throws you up onto the roof
import type { Vec3 } from '../../math/vec3';
import { v3 } from '../../math/vec3';
import { LevelBuilder } from '../builder';
import type {
  BoxDef,
  LaunchPadDef,
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
const PAD = 0xffc15a;

// dusk palette
const BLOSSOM = 0xf4b8c8;
const BLOSSOM_DEEP = 0xe79ab0;
const PLASTER = 0xede3d1;
const TORII = 0xc2372c;
const MOSS = 0x5b7a6a;
const STONE = 0x8c8a80; // wall bases, shoulder height: muted
const STONE_DARK = 0x6f6e68;
const GRAVEL = 0xb9b2a2;
const WOOD = 0x5e4030;
const MOAT_FLOOR = 0x3f5f5a;
const WATER = 0x7fb3c8;
const LANTERN = 0xffc98a;
const HEDGE = 0x4d6b55;
const KEEP_FLOOR = 0x7a5a42;

/** the middle of the map (both mirror lines) */
const MX = 40;
const MZ = 40;

/** Key coordinates (the plan). The south half mirrors the north (z → 80 - z), west the east. */
export const SAKURA_HOLD = {
  center: v3(MX, 0, MZ),
  gate: { x0: 30, x1: 50, z0: 3, z1: 11 },
  moat: { x0: 10, x1: 70, z0: 12, z1: 68, width: 4, depth: 0.35, speedMul: 0.45 },
  courtyard: { x0: 14, x1: 66, z0: 16, z1: 64 },
  keep: { x0: 32, x1: 48, z0: 32, z1: 48, floors: [0, 4, 8], roof: 12 },
  /** walkway height of the castle walls */
  wall: 4,
  /** Towers: Cyan's (north) first (small: the map is made for Elimination and Bomb) */
  towers: [v3(40, 0, 5), v3(40, 0, 75)] as [Vec3, Vec3],
  bombSites: {
    A: { min: v3(55, 0, 33), max: v3(64, 3, 47) },
    B: { min: v3(16, 0, 33), max: v3(25, 3, 47) },
  },
  /** the shoji walls (paper screens): [x0, z0, x1, z1] on the ground, 3 m tall */
  shoji: [
    [50, 26, 60, 26],
    [20, 26, 30, 26],
    [50, 54, 60, 54],
    [20, 54, 30, 54],
    [54, 34, 54, 46],
    [26, 34, 26, 46],
    // short screens in the lanes between the gates and the long walls
    [56, 20, 62, 20],
    [18, 20, 24, 20],
    [56, 60, 62, 60],
    [18, 60, 24, 60],
  ] as [number, number, number, number][],
  /** keep launch pads: north one throws south onto the roof */
  padVel: v3(0, 24, 3),
  powerups: [v3(40, 13, 40)],
};

type Sign = 1 | -1;
const SIGNS: Sign[] = [1, -1];
const mx = (s: Sign, x: number) => (s > 0 ? x : 2 * MX - x);
const mz = (n: Sign, z: number) => (n > 0 ? z : 2 * MZ - z);

export const buildSakuraHold = (): LevelDef => {
  const S = SAKURA_HOLD;
  const W = S.wall;
  const K = S.keep;
  const D = -S.moat.depth;
  const b = new LevelBuilder();
  const lights: LightDef[] = [];

  const box = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material,
    extra: Omit<BoxDef, 'c' | 'h' | 'mat'> = {},
  ) =>
    b.box(
      v3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      v3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
      { mat, ...extra },
    );
  /** the same box in all four quarters (authored in the north-east one: x ≥ 40, z ≤ 40) */
  const quad = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material,
    extra: Omit<BoxDef, 'c' | 'h' | 'mat'> = {},
  ) => {
    for (const n of SIGNS)
      for (const s of SIGNS) box(mx(s, x0), y0, mz(n, z0), mx(s, x1), y1, mz(n, z1), mat, extra);
  };
  /** north and south copies only (things across the east ↔ west middle) */
  const pair = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material,
    extra: Omit<BoxDef, 'c' | 'h' | 'mat'> = {},
  ) => {
    for (const n of SIGNS) box(x0, y0, mz(n, z0), x1, y1, mz(n, z1), mat, extra);
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
  ) => quad(x0, y0, z0, x1, y1, z1, mat, { color, noCollide: true });
  /** a castle wall mass: stone base (muted, up to shoulder height), plaster above */
  const masonry = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    const cut = Math.min(y1, 1.8);
    if (cut > y0) quad(x0, y0, z0, x1, cut, z1, 'rock', { color: STONE });
    if (y1 > cut) quad(x0, Math.max(y0, cut), z0, x1, y1, z1, 'panel', { color: PLASTER });
  };
  const light = (x: number, y: number, z: number, color: number, radius: number, k: number) =>
    lights.push({ pos: v3(x, y, z), color, radius, intensity: k });

  // ======================= ground =======================
  // (floors stop where a floor of another look starts: under the ramps the floor is the ramp's
  // wood, under the keep its floorboards; nothing of one colour cuts into another)
  quad(40, -1, 3, 80, 0, 12, 'sand', { color: GRAVEL }); // outer ground by the gates
  quad(70, -1, 12, 71, 0, 20, 'sand', { color: GRAVEL }); // under the east wall
  quad(75, -1, 12, 76, 0, 20, 'sand', { color: GRAVEL });
  quad(70, -1, 20, 76, 0, 40, 'sand', { color: GRAVEL });
  quad(71, -1, 12, 75, 0, 20, 'wood', { color: WOOD }); // under the wall ramp
  quad(40, -1, 16, 66, 0, 32, 'sand', { color: MOSS }); // courtyard lawn
  quad(48, -1, 32, 66, 0, 38, 'sand', { color: MOSS });
  quad(48, -1, 38, 62, 0, 40, 'sand', { color: MOSS });
  quad(62, -1, 38, 66, 0, 40, 'wood', { color: WOOD }); // under the ramp down into the site
  quad(40, -1, 32, 48, 0, 40, 'wood', { color: KEEP_FLOOR }); // the keep's ground floor
  quad(40, 0, 16, 44, 0.02, 32, 'sand', { color: GRAVEL, noCollide: true }); // gravel path
  // the moat: floor (0.35 m down: you wade in and out) and the water surface
  quad(43, -1.35, 12, 70, D, 16, 'sand', { color: MOAT_FLOOR });
  quad(66, -1.35, 16, 70, D, 40, 'sand', { color: MOAT_FLOOR });
  quad(43, -0.12, 12, 70, -0.1, 16, 'skyglass', { color: WATER, noCollide: true });
  quad(66, -0.12, 16, 70, -0.1, 38, 'skyglass', { color: WATER, noCollide: true });
  // the bridge at the gate (a wooden deck over the water)
  quad(40, -1.35, 12, 43, 0, 16, 'wood', { color: WOOD });

  // ======================= perimeter (tall: nobody climbs out) =======================
  masonry(40, 0, -2, 82, 8, 3);
  masonry(76, 0, 3, 82, 8, 40);

  // ======================= gatehouse =======================
  masonry(50, 0, 3, 51, 5, 5);
  masonry(50, 0, 9, 51, 5, 11);
  quad(50, 3, 5, 51, 5, 9, 'wood', { color: WOOD }); // over the side door
  masonry(41.5, 0, 11, 51, 5, 12);
  quad(40, 3.2, 11, 41.5, 5, 12, 'wood', { color: WOOD }); // over the main gate (3 m wide)
  // screens inside the main gate and the side doors: no line from outside into the spawn
  quad(40, 0, 8.2, 44, 2.4, 8.8, 'wood', { color: WOOD });
  quad(47.2, 0, 3, 47.8, 2.6, 8.4, 'wood', { color: WOOD });
  // a tiled roof over the gatehouse (nobody looks down into it from the walls or the keep)
  quad(40, 5, 3, 51.5, 5.4, 12.5, 'panel', { color: 0x3a3438 });
  // torii over the bridge (posts stand on the deck's edges)
  quad(42.2, 0, 13.7, 42.8, 4.2, 14.3, 'panel', { color: TORII });
  quad(40, 4.2, 13.6, 44.4, 4.6, 14.4, 'panel', { color: TORII });
  quad(40, 4.9, 13.5, 44.9, 5.3, 14.5, 'panel', { color: 0x2a2222 });

  // ======================= east castle wall (walkway y 4) =======================
  // ramp up from the outer ground (z 12 → 20), then the walkway to the middle
  masonry(70, 0, 12, 71, W, 20);
  masonry(75, 0, 12, 76, W, 20);
  // (the walkway's boards reach 0.3 m over the ramp's top, where the ramp slab ends)
  masonry(70, 0, 20.3, 76, W - 0.3, 38);
  // where the ramp down into the site leaves the wall: its wood reaches into the wall a little
  masonry(70.3, 0, 38, 76, W - 0.3, 40);
  quad(70, 0, 38, 70.3, W - 0.3, 40, 'wood', { color: WOOD });
  quad(70, W - 0.3, 20, 76, W, 40, 'wood', { color: WOOD });
  for (const n of SIGNS)
    for (const s of SIGNS) {
      b.ramp('z', mz(n, 12), mz(n, 20), 0, W, mx(s, 73), 4, { mat: 'wood', color: WOOD });
      fillUnder(b, 'z', mz(n, 20), mz(n, 12), W, 0, mx(s, 73), 4);
    }
  // waist-high rail on the courtyard side (open where the ramp goes down into the site)
  quad(70, W, 20, 70.3, W + 0.9, 38, 'wood', { color: WOOD });
  // ramp down over the moat into the site (across the middle line: one per side)
  for (const s of SIGNS) {
    b.ramp('x', mx(s, 70), mx(s, 62), W, 0, MZ, 4, { mat: 'wood', color: WOOD });
    fillUnder(b, 'x', mx(s, 70), mx(s, 62), W, 0, MZ, 4);
  }

  // ======================= the keep =======================
  buildKeep(b, pair);

  // ======================= shoji walls =======================
  for (const [x0, z0, x1, z1] of S.shoji) {
    const alongX = z0 === z1;
    const t = 0.1;
    const p = 0.2; // post half-width: the paper runs between the posts
    if (alongX)
      box(x0 + p, 0, z0 - t, x1 - p, 3, z0 + t, 'paper', { color: PLASTER, boomerangPasses: true });
    else
      box(x0 - t, 0, z0 + p, x0 + t, 3, z1 - p, 'paper', { color: PLASTER, boomerangPasses: true });
    // wooden frame posts at the ends (solid), and a thin lattice painted on the paper
    for (const [px, pz] of [
      [x0, z0],
      [x1, z1],
    ])
      box(px - 0.2, 0, pz - 0.2, px + 0.2, 3.2, pz + 0.2, 'wood', { color: WOOD });
    // lattice: thin strips laid on both faces of the paper (not through it)
    const len = alongX ? x1 - x0 : z1 - z0;
    const lattice = { color: WOOD, noCollide: true };
    for (const f of [-1, 1]) {
      const a = f * t;
      const c = f * (t + 0.02);
      for (let i = 1; i < 5; i++) {
        const u = (len * i) / 5;
        if (alongX) box(x0 + u - 0.04, 0, z0 + a, x0 + u + 0.04, 3, z0 + c, 'wood', lattice);
        else box(x0 + a, 0, z0 + u - 0.04, x0 + c, 3, z0 + u + 0.04, 'wood', lattice);
      }
      if (alongX) box(x0 + p, 1.46, z0 + a, x1 - p, 1.54, z0 + c, 'wood', lattice);
      else box(x0 + a, 1.46, z0 + p, x0 + c, 1.54, z1 - p, 'wood', lattice);
    }
  }

  // ======================= cover: lanterns, shrine =======================
  const lantern = (x: number, z: number) => {
    quad(x - 0.5, 0, z - 0.5, x + 0.5, 1.3, z + 0.5, 'rock', { color: STONE_DARK });
    deco(x - 0.3, 1.3, z - 0.3, x + 0.3, 1.6, z + 0.3, 'trim', LANTERN);
  };
  lantern(56, 36.5); // A site
  lantern(47, 17.5); // by the bridge
  lantern(60, 24.5); // east lane, in front of the paper walls
  // a small shrine behind the site (full cover)
  quad(64.3, 0, 33.5, 65.8, 2.4, 35.5, 'wood', { color: WOOD });
  quad(64.2, 2.4, 33.3, 65.9, 2.8, 35.7, 'panel', { color: TORII });
  // low clipped hedges (waist-high cover) beside the gravel path
  quad(43.5, 0, 24.5, 46.5, 1.1, 25.5, 'leaf', { color: HEDGE });

  // ======================= blossom trees =======================
  const tree = (x: number, z: number, h: number) => {
    // the trunk stands on its petals and ends under the canopy
    quad(x - 0.35, 0.04, z - 0.35, x + 0.35, h - 0.4, z + 0.35, 'wood', { color: WOOD });
    // canopies start above head height (nobody hides in them)
    deco(x - 2.4, h - 0.4, z - 2.1, x + 2.2, h + 1.4, z + 2.3, 'leaf', BLOSSOM);
    deco(x - 1.6, h + 1.4, z - 1.5, x + 1.7, h + 2.3, z + 1.4, 'leaf', BLOSSOM_DEEP);
    deco(x + 0.8, h - 0.2, z - 3, x + 3, h + 0.9, z - 0.8, 'leaf', BLOSSOM);
    // fallen petals
    deco(x - 2.6, 0.01, z - 2.4, x + 2.4, 0.04, z + 2.6, 'leaf', 0xe8b4c0);
  };
  tree(52, 18, 3.6);
  tree(60, 6.5, 3.8);
  tree(64, 29, 3.5);

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
    homes.push(v3(tp.x, 0.9, mz(n, 7.4)));
    for (const z of [4.5, 7.5])
      for (const x of [33.5, 36, 44, 46.5])
        spawns.push({ pos: v3(x, 0, mz(n, z)), yawDeg: team === 0 ? 180 : 0, team });
  }

  // ======================= launch pads: up onto the keep roof =======================
  const launchPads: LaunchPadDef[] = [];
  for (const n of SIGNS)
    launchPads.push({
      min: v3(38.5, 0, Math.min(mz(n, 27.5), mz(n, 30.5))),
      max: v3(41.5, 2.5, Math.max(mz(n, 27.5), mz(n, 30.5))),
      vel: v3(0, S.padVel.y, n * S.padVel.z),
    });

  // ======================= the moat slows you down =======================
  const slowZones: SlowZoneDef[] = [];
  const slow = (x0: number, z0: number, x1: number, z1: number) => {
    for (const n of SIGNS)
      for (const s of SIGNS) {
        const xs = [mx(s, x0), mx(s, x1)];
        const zs = [mz(n, z0), mz(n, z1)];
        slowZones.push({
          min: v3(Math.min(...xs), -1, Math.min(...zs)),
          max: v3(Math.max(...xs), 0.6, Math.max(...zs)),
          speedMul: S.moat.speedMul,
        });
      }
  };
  slow(40, 12, 70, 16);
  slow(66, 16, 70, 40);

  decorate(deco, box, light, launchPads);

  return b.build({
    name: 'Sakura Hold',
    boundsMin: v3(0, -2, 0),
    boundsMax: v3(80, 14, 80),
    defaultGravity: v3(0, -1, 0),
    zones: [],
    rails: [],
    pads: [],
    spawns,
    towers,
    controllerHomes: homes,
    waypoints: waypoints(),
    areas: [
      { name: 'Cyan gate', pos: v3(40, 0, 7.4), yawDeg: 180 },
      { name: 'Orange gate', pos: v3(40, 0, 72.6), yawDeg: 0 },
      { name: 'Courtyard', pos: v3(47, 0, 20.5), yawDeg: 180 },
      { name: 'Keep, ground floor', pos: v3(46, 0, 40), yawDeg: 90 },
      { name: 'Keep roof', pos: v3(40, K.roof, 35), yawDeg: 180 },
      { name: 'East wall', pos: v3(73, W, 24), yawDeg: 180 },
      { name: 'A site', pos: v3(59.5, 0, 40), yawDeg: 90 },
      { name: 'B site', pos: v3(20.5, 0, 40), yawDeg: -90 },
      { name: 'Moat', pos: v3(68, D, 30), yawDeg: 180 },
    ],
    fog: { color: 0xd9aebb, near: 35, far: 140 },
    ambient: 1.05,
    lights,
    bombSites: [
      { name: 'A', ...S.bombSites.A },
      { name: 'B', ...S.bombSites.B },
    ],
    powerups: S.powerups,
    launchPads,
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

type PairFn = (
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  mat: Material,
  extra?: Omit<BoxDef, 'c' | 'h' | 'mat'>,
) => void;

/**
 * The keep: 16 × 16 m, walls 0.6 m, floors at 4 and 8, roof at 12 with a parapet. Ground floor
 * doors east / west; windows on every floor. Stairs: ground → 1st rising east (middle), 1st →
 * 2nd rising west (north and south sides), 2nd → roof rising east (middle), each through a hole.
 */
const buildKeep = (b: LevelBuilder, pair: PairFn): void => {
  const K = SAKURA_HOLD.keep;
  const T = 0.6;
  const wallOpts = { mat: 'panel' as Material, color: PLASTER };
  const baseOpts = { mat: 'rock' as Material, color: STONE };
  const win = (y: number) => [
    { u0: 35, u1: 37, v0: y + 1.2, v1: y + 2.6 },
    { u0: 43, u1: 45, v0: y + 1.2, v1: y + 2.6 },
  ];
  const winZ = (y: number) => [
    { u0: 34.6, u1: 36.6, v0: y + 1.2, v1: y + 2.6 },
    { u0: 43.4, u1: 45.4, v0: y + 1.2, v1: y + 2.6 },
  ];
  const top = K.roof - 0.4;
  for (const z of [K.z0 + T / 2, K.z1 - T / 2]) {
    b.wall('z', z, T, K.x0, K.x1, 0, 1.8, [], baseOpts);
    b.wall('z', z, T, K.x0, K.x1, 1.8, top, [...win(0), ...win(4), ...win(8)], wallOpts);
  }
  for (const x of [K.x0 + T / 2, K.x1 - T / 2]) {
    const door = { u0: 38, u1: 42, v0: 0, v1: 2.8 };
    b.wall('x', x, T, K.z0 + T, K.z1 - T, 0, 1.8, [door], baseOpts);
    b.wall('x', x, T, K.z0 + T, K.z1 - T, 1.8, top, [door, ...winZ(4), ...winZ(8)], wallOpts);
  }
  const floor = { mat: 'wood' as Material, color: KEEP_FLOOR };
  const i0 = K.x0 + T;
  const i1 = K.x1 - T;
  b.wall(
    'y',
    3.8,
    0.4,
    i0,
    i1,
    K.z0 + T,
    K.z1 - T,
    [{ u0: 36, u1: 44, v0: 38.5, v1: 41.5 }],
    floor,
  );
  b.wall(
    'y',
    7.8,
    0.4,
    i0,
    i1,
    K.z0 + T,
    K.z1 - T,
    [
      { u0: 36, u1: 44, v0: 32.6, v1: 36.6 },
      { u0: 36, u1: 44, v0: 43.4, v1: 47.4 },
    ],
    floor,
  );
  // the roof deck: boards like the stairs that come up through its hatch
  b.wall('y', top + 0.2, 0.4, K.x0, K.x1, K.z0, K.z1, [{ u0: 36, u1: 44, v0: 38.5, v1: 41.5 }], {
    mat: 'wood',
    color: KEEP_FLOOR,
  });
  // roof parapet (waist-high) and eaves
  const R = K.roof;
  const para = { mat: 'rock' as Material, color: 0x55504e };
  pair(K.x0, R, K.z0, K.x1, R + 0.9, K.z0 + 0.4, 'rock', para);
  pair(K.x0, R, K.z0 + 0.4, K.x0 + 0.4, R + 0.9, 40, 'rock', para);
  pair(K.x1 - 0.4, R, K.z0 + 0.4, K.x1, R + 0.9, 40, 'rock', para);
  for (const y of [4, 8])
    pair(K.x0 - 1.2, y - 0.3, K.z0 - 1.2, K.x1 + 1.2, y, K.z0, 'panel', {
      color: 0x3a3438,
      noCollide: true,
    });
  // stairs
  b.ramp('x', 36, 44, 0, 4, 40, 3, { mat: 'wood', color: KEEP_FLOOR });
  fillUnder(b, 'x', 44, 36, 4, 0, 40, 3);
  for (const n of SIGNS) {
    // against the north / south wall (no gap to slip into)
    b.ramp('x', 44, 36, 4, 8, mz(n, 34.6), 4, { mat: 'wood', color: KEEP_FLOOR });
    fillUnder(b, 'x', 36, 44, 8, 4, mz(n, 34.6), 4);
  }
  b.ramp('x', 36, 44, 8, 12, 40, 3, { mat: 'wood', color: KEEP_FLOOR });
  fillUnder(b, 'x', 44, 36, 12, 8, 40, 3);
};

/** Markings and light: pad plates, site outlines, lanterns, team banners, far hills. */
const decorate = (
  deco: (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material,
    color: number,
  ) => void,
  box: PairFn,
  light: (x: number, y: number, z: number, color: number, radius: number, k: number) => void,
  pads: LaunchPadDef[],
): void => {
  const S = SAKURA_HOLD;
  const d1 = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material,
    color: number,
  ) => box(x0, y0, z0, x1, y1, z1, mat, { color, noCollide: true });
  for (const p of pads) {
    d1(p.min.x + 0.1, 0.01, p.min.z + 0.1, p.max.x - 0.1, 0.08, p.max.z - 0.1, 'trim', PAD);
    light((p.min.x + p.max.x) / 2, 1, (p.min.z + p.max.z) / 2, PAD, 5, 0.8);
  }
  for (const st of [S.bombSites.A, S.bombSites.B]) {
    const w = 0.12;
    d1(st.min.x, 0.01, st.min.z, st.max.x, 0.05, st.min.z + w, 'trim', SITE);
    d1(st.min.x, 0.01, st.max.z - w, st.max.x, 0.05, st.max.z, 'trim', SITE);
    d1(st.min.x, 0.01, st.min.z, st.min.x + w, 0.05, st.max.z, 'trim', SITE);
    d1(st.max.x - w, 0.01, st.min.z, st.max.x, 0.05, st.max.z, 'trim', SITE);
  }
  // paper lanterns: keep doors, gate, walls, sites
  for (const n of [1, -1] as const) {
    const z = (v: number) => (n > 0 ? v : 80 - v);
    const tc = n > 0 ? CYAN : ORANGE;
    light(40, 3, z(7), tc, 9, 0.6);
    // on the inner face of the gatehouse front wall
    d1(36, 4.2, z(10.9), 44, 4.5, z(11), 'trim', tc);
    for (const x of [8, 72]) light(x, 5.5, z(28), LANTERN, 9, 0.7);
    light(40, 13.5, z(34), LANTERN, 8, 0.6);
  }
  for (const x of [30, 50]) light(x, 3.5, 40, LANTERN, 8, 0.8);
  light(59.5, 2.5, 40, LANTERN, 9, 0.7);
  light(20.5, 2.5, 40, LANTERN, 9, 0.7);
  // far scenery: hills and a pagoda silhouette in the mist
  deco(40, 8, -60, 140, 8.1, 3, 'sand', 0x7a8f86);
  deco(90, 8.1, -80, 130, 26, -40, 'leaf', 0x5d7280);
  deco(60, 8.1, -120, 110, 34, -90, 'leaf', 0x4f6275);
  deco(100, 8.1, -10, 125, 18, 40, 'leaf', 0x687d88);
  // a pagoda: storeys between red eaves
  deco(96, 8.1, -30, 104, 16, -22, 'panel', 0x3b3440);
  deco(94, 16, -32, 106, 17, -20, 'panel', TORII);
  deco(96.5, 17, -29.5, 103.5, 24, -22.5, 'panel', 0x3b3440);
  deco(94, 24, -32, 106, 25, -20, 'panel', TORII);
  deco(97, 25, -29, 103, 30, -23, 'panel', 0x3b3440);
};

/**
 * Solid steps under a ramp (so nobody hides under it): `from` is the high end at `yHigh`,
 * `to` the low end at `yLow`; each step's top stays under the ramp slab.
 */
const fillUnder = (
  b: LevelBuilder,
  axis: 'x' | 'z',
  from: number,
  to: number,
  yHigh: number,
  yLow: number,
  across: number,
  width: number,
  steps = 4,
): void => {
  const run = to - from;
  for (let i = 0; i < steps; i++) {
    const a = from + (run * i) / steps;
    const c = from + (run * (i + 1)) / steps;
    const surf = yHigh + ((yLow - yHigh) * (i + 1)) / steps;
    const top = surf - 0.8;
    if (top <= yLow + 0.1) continue;
    const lo = Math.min(a, c);
    const hi = Math.max(a, c);
    const w0 = across - width / 2;
    const w1 = across + width / 2;
    const opts = { mat: 'wood' as Material, color: 0x4a3326 };
    if (axis === 'z') b.box(v3(w0, yLow, lo), v3(w1, top, hi), opts);
    else b.box(v3(lo, yLow, w0), v3(hi, top, w1), opts);
  }
};

/**
 * Bot waypoints, named. Courtyard, gates and walls are authored in the north-east quarter and
 * mirrored ('bridgeNE'; on x = 40 only N/S, on z = 40 only E/W: 'siteE' = A, 'siteW' = B); the
 * keep's switchback stairs are not mirrored east ↔ west, so its waypoints are placed one by one.
 * Bots keep out of the moat: they cross it on the bridges and the wall ramps.
 */
const waypoints = (): WaypointDef[] => {
  const K = SAKURA_HOLD.keep;
  const W = SAKURA_HOLD.wall;
  const wps: WaypointDef[] = [];
  const onX = new Map<string, boolean>();
  const onZ = new Map<string, boolean>();
  const nameOf = (base: string, n: Sign, s: Sign) =>
    `${base}${onZ.get(base) ? '' : n > 0 ? 'N' : 'S'}${onX.get(base) ? '' : s > 0 ? 'E' : 'W'}`;
  const add = (base: string, x: number, feet: number, z: number, eastWest = true) => {
    onX.set(base, x === MX || !eastWest);
    onZ.set(base, z === MZ);
    for (const n of SIGNS)
      for (const s of SIGNS) {
        if (((x === MX || !eastWest) && s < 0) || (z === MZ && n < 0)) continue;
        wps.push({ pos: v3(mx(s, x), feet + 1, mz(n, z)), links: [], name: nameOf(base, n, s) });
      }
  };
  const idx = (name: string) => {
    const i = wps.findIndex((w) => w.name === name);
    if (i < 0) throw new Error(`waypoint ${name} missing`);
    return i;
  };
  const link = (a: string, c: string) => {
    for (const n of SIGNS)
      for (const s of SIGNS) {
        const i = idx(nameOf(a, n, s));
        const j = idx(nameOf(c, n, s));
        if (i === j) continue;
        if (!wps[i].links.includes(j)) wps[i].links.push(j);
        if (!wps[j].links.includes(i)) wps[j].links.push(i);
      }
  };
  const chain = (...names: string[]) => {
    for (let i = 1; i < names.length; i++) link(names[i - 1], names[i]);
  };

  // gate
  add('tower', MX, 0, 7.4);
  add('gIn', 46, 0, 7.4);
  add('gIn2', 45.5, 0, 10.2);
  add('gFront', 41, 0, 10.4);
  add('bridge', 41, 0, 14);
  add('bridgeIn', 41.5, 0, 18);
  add('sideV', 48.9, 0, 9.4);
  add('sideOut', 53, 0, 6.5);
  add('outer', 62, 0, 8);
  // castle wall
  add('wFoot', 73, 0, 9.5);
  add('wTop', 73, W, 21);
  add('walk', 73, W, 30);
  add('wDown', 73, W, MZ);
  // courtyard
  add('court', MX, 0, 22);
  add('cN', 47, 0, 21);
  add('cNE', 62.5, 0, 22.5);
  add('alley', 50.5, 0, 31);
  add('sEntry', 57, 0, 31);
  add('sE2', 62, 0, 30.5);
  add('site', 59.5, 0, MZ);
  add('kDoor', 50.5, 0, MZ);
  // the keep (x = its own layout; `eastWest` false = north / south copies only)
  add('kInE', 46, 0, MZ, false);
  add('kInW', 34, 0, MZ, false);
  add('kGE', 46, 0, 34.5, false);
  add('kGW', 34, 0, 34.5, false);
  add('k1', 45.6, 4, MZ, false);
  add('k1a', 45.6, 4, 34.6, false);
  add('k2a', 34.4, 8, 34.6, false);
  add('k2', 34.4, 8, MZ, false);
  add('roof', 45.6, K.roof, MZ, false);
  add('roofP', MX, K.roof, 35);

  chain('tower', 'gIn', 'gIn2', 'gFront', 'bridge', 'bridgeIn', 'cN');
  chain('gIn2', 'sideV', 'sideOut', 'outer', 'wFoot', 'wTop', 'walk', 'wDown', 'site');
  chain('bridgeIn', 'court', 'cN', 'alley', 'kDoor');
  chain('alley', 'sEntry', 'site');
  chain('cN', 'cNE', 'sE2', 'site');
  // keep: both doors, ground floor round the stairs, up to the roof
  const keep = (a: string, c: string) => {
    const i = idx(a);
    const j = idx(c);
    if (!wps[i].links.includes(j)) wps[i].links.push(j);
    if (!wps[j].links.includes(i)) wps[j].links.push(i);
  };
  keep('kDoorE', 'kInE');
  keep('kDoorW', 'kInW');
  for (const n of ['N', 'S']) {
    keep('kInE', `kGE${n}`);
    keep(`kGE${n}`, `kGW${n}`);
    keep(`kGW${n}`, 'kInW');
    keep('k1', `k1a${n}`);
    keep(`k1a${n}`, `k2a${n}`);
    keep(`k2a${n}`, 'k2');
    keep('roof', `roofP${n}`);
  }
  keep('kInW', 'k1');
  keep('k2', 'roof');
  return wps;
};
