// "Afterglow" — a night market that never closes: the promenade deck of an orbital city under a
// skyglass dome, the planet's night side and the lower city's lights below the south glass.
// 88 × 80 m of streets (x -44..44, z -40..40; world z = south) between the two spawn arcades
// (x ±45..54), street level y 0. Mirror-symmetric across x = 0: Cyan (team 0) spawns west,
// Orange (team 1) east; everything below is given for the east (Orange) half.
//
// Low ambient light and bright neon: the alleys are dark, the plaza glows.
//
//   SPAWN ARCADE (x 45..54, z -21..21, roofed)  the spawn room (x 47.6..54, z -13..13, the Tower
//        in it) opens north and south into wings; three doors out through the facade (x 44):
//        north (z -19.5..-15.5), middle (z -2..2) and south (z 15.5..19.5), none in line with
//        the spawn room
//   SPAWN STREET (x 36..44)  in front of the arcade, joins the three lanes near each spawn
//   NORTH: LANTERN ALLEY (x 15..44, z -40..-32)  dark and narrow, strung with paper lanterns;
//        two PAPER SCREENS across half of it (a chicane): the Boomerang flies straight through
//        them (BoxDef.boomerangPasses), players, bullets and sight don't. It ends at the arcade's
//        side door and the side passage (x 15..18) down to the promenade
//   A: THE ARCADE HALL (x -14..14, z -40..-20, 6 m)  cabinets (full cover), pinball tables and
//        the prize counter (half cover); doors east / west (from the alleys) and two in front
//        (x ±4..8) onto the plaza's promenade
//   MIDDLE: MARKET STREET (x 14..44, z -15..-1)  a noodle stall island, stall counters with
//        awnings (awning hops up to the roofs), fire-escape stairs up to the rooftops; it meets
//        the plaza at the NIGHT MARKET GATE (x 14.4..15.6): two pillars, three ways past them
//   THE KOI PLAZA (x -11..11, z -13..5, sunk to y -1.2)  a dry fountain (low cover) round a
//        holo-projector (full cover) with two holographic koi circling it; steps in on every
//        side (a smooth ramp under each flight), and its 1.2 m edge can be vaulted anywhere
//   ROOFTOPS (y 4.5)  north shops (x 18..36, z -32..-15) and south shops (x 18..36, z -1..15);
//        fire escapes from the market street, awning hops; the south roofs lead up a ramp
//        onto the station
//   SOUTH: RAIL STREET (x 12..44, z 15..40)  under the monorail, along the south glass (the view)
//   THE MONORAIL (y 8, deck z 15..20)  straight across the map from spawn street to spawn
//        street (a buffer stop at each end), stairs up beside each spawn street (x 36..40), and a
//        zip-rail along it on each side (y 11.5) into the station
//   B: THE STATION (x -12..12, z 10..26, platform y 8)  under a canopy, a train standing in it
//        (x -6..6: doors open on both sides, ends shut, so the monorail's long line stops at
//        it); reached along the monorail, by the stairs from the rail street (x 12..28) and by
//        the ramp from the south rooftops (x 12..19); the concourse under it opens from the plaza
//        to the rail street
//
// No lane sees into a spawn (afterglow.test.ts checks every standing spot); cover is half
// (≤ 1.1 m) or full (≥ 2.2 m); ramps ≤ 28°. Bots walk every part of it (waypoints below).
import type { Vec3 } from '../../math/vec3';
import { v3 } from '../../math/vec3';
import { qFromAxisAngle } from '../../math/quat';
import { LevelBuilder, subtractHoles, wedgeRamp } from '../builder';
import type {
  BoxDef,
  LevelDef,
  LightDef,
  Material,
  RailDef,
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
const FACADE = 0x2b2939;
const FACADE_WARM = 0x3a2c3a;
const SHOP = 0x363041;
const ROOF = 0x24222d;
const METAL = 0x3d4252;
const DECK = 0x474d5e;
const PLATFORM = 0x55526a;
const PILLAR = 0x2c2f3e;
const WOOD = 0x5b3b2b;
const WOOD_LIGHT = 0x8a5a3a;
const PAPER = 0xf2dcc0;
const CARPET = 0x2a1c44;
const CABINET = 0x1b1a28;
const SPAWN_FLOOR = 0x2a2c38;
const DARK = 0x131119;
const PUDDLE = 0x7a6ab8;
const KOI = 0xffa8d8;
const RAILS = 0x9aa6c8;
const AWNING_PINK = 0xb52a66;
const AWNING_TEAL = 0x1d8a80;
const AWNING_AMBER = 0xb8701c;
const AWNING_VIOLET = 0x5f3aa6;
const CITY = 0x120f1c;

/** Key coordinates (the east / Orange half; the west half is its mirror image, x → -x). */
export const AFTERGLOW = {
  /** the streets end at the spawn arcades' facades (x ±44) */
  halfX: 44,
  north: -40,
  south: 40,
  dome: 20,
  roof: 4.5,
  /** the monorail deck and the station platform */
  rail: 8,
  plaza: { x: 11, z0: -13, z1: 5, y: -1.2 },
  fountain: { x: 4, z0: -8, z1: 0, top: -0.3 },
  spawn: { x0: 45, x1: 54, z0: -21, z1: 21, h: 5 },
  /** the spawn room (Tower and spawns) inside the arcade */
  spawnRoom: { x0: 47.6, x1: 54, z0: -13, z1: 13 },
  /** the arcade's doors out onto the spawn street (z ranges in its facade at x 44..45) */
  doors: [
    [-19.5, -15.5],
    [-2, 2],
    [15.5, 19.5],
  ] as [number, number][],
  arcade: { x: 14, z0: -40, z1: -20, h: 6 },
  alley: { x0: 15, x1: 44, z0: -40, z1: -32 },
  northShops: { x0: 18, x1: 36, z0: -32, z1: -15 },
  southShops: { x0: 18, x1: 36, z0: -1, z1: 15 },
  market: { z0: -15, z1: -1 },
  station: { x: 12, z0: 10, z1: 26 },
  deck: { x0: 12, x1: 44, z0: 15, z1: 20 },
  /** the train standing in the station (walls 0.2 m; doors on both sides, y 8..10.4) */
  car: { x: 6, z0: 15.4, z1: 19.6, door: 1.2, side0: 3.4, side1: 4.8, doorTop: 10.4 },
  /** Towers: Cyan's (west) first */
  towers: [v3(-51, 0, 0), v3(51, 0, 0)] as [Vec3, Vec3],
  bombSites: {
    A: { min: v3(-7, 0, -36), max: v3(7, 3, -24) },
    B: { min: v3(-8, 8, 10.5), max: v3(8, 11, 25.5) },
  },
  /** paper screens across the lantern alley (east half): [x, z0, z1], 3 m tall */
  screens: [
    [31, -36.5, -32],
    [23, -40, -35.5],
  ] as [number, number, number][],
  /** zip-rails along the monorail (east half), 3.5 m over the deck */
  railY: 11.5,
  railX: [13, 41] as [number, number],
  railZ: 17.5,
  powerups: [v3(0, -0.2, -1.8)],
};

type Sign = 1 | -1;
const SIGNS: Sign[] = [1, -1];
type Extra = Omit<BoxDef, 'c' | 'h' | 'mat'>;
type Hole = { u0: number; u1: number; v0: number; v1: number };
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
  /**
   * A wall slab with rectangular holes: `axis` is its thin axis ('x': it spans z and y, holes
   * given in z / y; 'z': it spans x and y, holes in x / y). Paired unless `put` says otherwise.
   */
  const holed = (
    axis: 'x' | 'z',
    t0: number,
    t1: number,
    u0: number,
    u1: number,
    v0: number,
    v1: number,
    holes: Hole[],
    mat: Material,
    extra: Extra = {},
    put: BoxFn = pair,
  ) => {
    for (const r of subtractHoles({ u0, u1, v0, v1 }, holes)) {
      if (r.u1 - r.u0 < 1e-3 || r.v1 - r.v0 < 1e-3) continue;
      if (axis === 'x') put(t0, r.v0, r.u0, t1, r.v1, r.u1, mat, extra);
      else put(r.u0, r.v0, t0, r.u1, r.v1, t1, mat, extra);
    }
  };

  // ======================= floors =======================
  // (one look per area; floors of different looks only meet edge to edge)
  box(-15, -1.2, -40, 15, 0, -19, 'floor', { color: CARPET }); // the arcade hall
  pair(15, -1.2, -40, 45, 0, -19, 'plate', { color: STREET });
  box(-45, -1.2, -19, 45, 0, -13, 'plate', { color: STREET });
  pair(11, -1.2, -13, 45, 0, 5, 'plate', { color: STREET });
  box(-45, -1.2, 5, 45, 0, 40, 'plate', { color: STREET });
  // the Koi Plaza, sunk 1.2 m
  box(-11, -2.2, -13, 11, -1.2, 5, 'floor', { color: PLAZA_TILE });
  // puddles on the wet street (a sheen of glass over the asphalt)
  const puddle = (x0: number, z0: number, x1: number, z1: number) =>
    deco(x0, 0.002, z0, x1, 0.012, z1, 'skyglass', PUDDLE);
  puddle(26, -37.5, 29, -35);
  puddle(30, -10, 33.5, -6.5);
  puddle(14.6, 1, 16.8, 4);
  puddle(36.5, 22, 40, 25.5);
  puddle(19.5, 16.5, 22.5, 19);

  // ======================= the dome =======================
  // north: the tenements' facade (12 m), glass above; south: a low sill and the great window
  // over the planet; the skyglass roof over everything
  box(-45, 0, -41, 45, 12, -40, 'panel', { color: FACADE });
  box(-45, 12, -41, 45, S.dome, -40, 'skyglass');
  box(-45, 0, 40, 45, 0.6, 41, 'panel', { color: FACADE });
  box(-45, 0.6, 40, 45, S.dome, 41, 'skyglass');
  box(-45, S.dome, -41, 45, S.dome + 0.5, 41, 'skyglass');

  // ======================= spawn arcades =======================
  const towers: TowerDef[] = [];
  const spawns: SpawnDef[] = [];
  const homes: Vec3[] = [];
  const SP = S.spawn;
  for (const s of SIGNS) {
    const team = s > 0 ? 1 : 0;
    const tc = team === 1 ? ORANGE : CYAN;
    const teamMat: Material = team === 1 ? 'teamB' : 'teamA';
    const one: BoxFn = (x0, y0, z0, x1, y1, z1, mat, extra = {}) =>
      box(s * x0, y0, z0, s * x1, y1, z1, mat, extra);
    const lit = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
      one(x0, y0, z0, x1, y1, z1, 'trim', { color: tc, noCollide: true });
    // the facade up to the dome, with the three doors
    holed(
      'x',
      44,
      45,
      S.north,
      S.south,
      0,
      S.dome,
      S.doors.map(([z0, z1]) => ({ u0: z0, u1: z1, v0: 0, v1: 3.4 })),
      'panel',
      { color: FACADE_WARM },
      one,
    );
    one(45, -1.2, -22, 55, 0, 22, 'floor', { color: SPAWN_FLOOR });
    one(54, 0, -22, 55, 5.5, 22, 'hull', { color: FACADE });
    one(45, 0, -22, 54, 5.5, -21, 'hull', { color: FACADE });
    one(45, 0, 21, 54, 5.5, 22, 'hull', { color: FACADE });
    one(45, SP.h, -21, 54, SP.h + 0.5, 21, 'hull', { color: DARK });
    // the spawn room: solid toward the doors (west), open to the wings at its east end
    one(47, 0, -13.6, 47.6, SP.h, 13.6, teamMat);
    for (const n of [1, -1]) {
      one(47.6, 0, n * 13, 50.5, SP.h, n * 13.6, teamMat);
      one(50.5, 3.4, n * 13, 54, SP.h, n * 13.6, teamMat);
    }
    // Tower, spawns, Controller home
    const tp = S.towers[team];
    b.block(v3(tp.x, 2, 0), v3(2, 4, 2), { mat: teamMat, trim: tc });
    towers.push({ team, pos: tp, radius: 1.5, height: 4 });
    homes.push(v3(s * 48.8, 0.9, 0));
    for (const z of [-10.5, -6.5, 6.5, 10.5])
      // (facing the room's opening on their side: the way out)
      for (const x of [49.2, 52.6])
        spawns.push({ pos: v3(s * x, 0, z), yawDeg: z < 0 ? 0 : 180, team });
    // team light: strips under the ceiling, door frames on the street side
    lit(48.5, SP.h - 0.12, -0.08, 53.5, SP.h, 0.08);
    for (const z of [-17.5, 17.5]) lit(46, SP.h - 0.12, z - 0.08, 53.5, SP.h, z + 0.08);
    for (const [z0, z1] of S.doors) lit(43.85, 3.4, z0 - 0.4, 44, 3.6, z1 + 0.4);
    for (const z of [-8.5, 8.5])
      lights.push({ pos: v3(s * 51, 4, z), color: tc, radius: 9, intensity: 0.9 });
    lights.push({ pos: v3(s * 46, 4, 0), color: tc, radius: 7, intensity: 0.6 });
    for (const z of [-17.5, 0, 17.5])
      lights.push({ pos: v3(s * 42.5, 3.6, z), color: tc, radius: 6, intensity: 0.7 });
    // the arcade's facade: team-coloured neon blades up to the dome, a band along it
    for (const z of [-30, -9, 9, 30]) lit(43.85, 5, z - 0.12, 44, 15, z + 0.12);
    lit(43.85, 6.2, -24, 44, 6.5, 24);
    // a train tunnel where the monorail ends
    one(43.9, 8, 15.3, 44, 12, 19.7, 'glow', { color: DARK, noCollide: true });
  }

  // ======================= A: the arcade hall =======================
  const AR = S.arcade;
  const ARCADE_WALL = { color: 0x30263f };
  holed(
    'x',
    14,
    15,
    AR.z0,
    -19,
    0,
    AR.h + 0.5,
    [{ u0: -38, u1: -33, v0: 0, v1: 3.4 }],
    'panel',
    ARCADE_WALL,
  );
  holed(
    'z',
    -20,
    -19,
    -14,
    14,
    0,
    AR.h + 0.5,
    [
      { u0: -8, u1: -4, v0: 0, v1: 3.4 },
      { u0: 4, u1: 8, v0: 0, v1: 3.4 },
    ],
    'panel',
    ARCADE_WALL,
    box,
  );
  box(-14, AR.h, AR.z0, 14, AR.h + 0.5, -20, 'hull', { color: DARK });
  buildArcadeInside(kit);

  // ======================= lantern alley: paper screens, lanterns =======================
  for (const [x, z0, z1] of S.screens) {
    const t = 0.1;
    const p = 0.4; // posts: 0.4 m square at the ends
    pair(x - t, 0, z0 + p, x + t, 3, z1 - p, 'paper', { color: PAPER, boomerangPasses: true });
    for (const z of [z0, z1 - p]) pair(x - 0.2, 0, z, x + 0.2, 3.2, z + p, 'wood', { color: WOOD });
    // lattice on both faces of the paper
    for (const f of [-1, 1]) {
      const a = x + f * t;
      const c = x + f * (t + 0.03);
      for (let i = 1; i < 4; i++) {
        const u = z0 + p + ((z1 - z0 - 2 * p) * i) / 4;
        deco(Math.min(a, c), 0, u - 0.04, Math.max(a, c), 3, u + 0.04, 'wood', WOOD);
      }
      deco(Math.min(a, c), 1.46, z0 + p, Math.max(a, c), 1.54, z1 - p, 'wood', WOOD);
    }
  }
  // lantern strings across the alley
  for (const x of [19, 27, 35]) {
    deco(x - 0.03, 4.5, -40, x + 0.03, 4.56, -32, 'hull', DARK);
    for (const [i, z] of [-38, -36, -34].entries())
      deco(x - 0.22, 3.9, z - 0.22, x + 0.22, 4.5, z + 0.22, 'trim', i === 1 ? PINK : AMBER);
  }

  // ======================= shops, rooftops, fire escapes =======================
  const NS = S.northShops;
  const SS = S.southShops;
  const R = S.roof;
  const shop = (x0: number, z0: number, x1: number, z1: number) => {
    pair(x0, 0, z0, x1, R - 0.1, z1, 'panel', { color: SHOP });
    pair(x0, R - 0.1, z0, x1, R, z1, 'plate', { color: ROOF });
  };
  shop(NS.x0, NS.z0, NS.x1, NS.z1);
  shop(SS.x0, SS.z0, SS.x1, SS.z1);
  shop(12, 10, SS.x0, SS.z1); // the station's ticket office block (the ramp stands on it)
  // parapets (waist-high), open over the awnings, at the fire escapes and toward the monorail
  const para = { color: SHOP };
  pair(NS.x0, R, NS.z0, NS.x1, R + 0.9, NS.z0 + 0.3, 'panel', para);
  pair(NS.x0, R, NS.z0 + 0.3, NS.x0 + 0.3, R + 0.9, NS.z1, 'panel', para);
  pair(NS.x1 - 0.3, R, NS.z0 + 0.3, NS.x1, R + 0.9, NS.z1 - 0.3, 'panel', para);
  pair(24.5, R, NS.z1 - 0.3, 33.5, R + 0.9, NS.z1, 'panel', para);
  pair(24.5, R, SS.z0, 33.5, R + 0.9, SS.z0 + 0.3, 'panel', para);
  pair(SS.x0, R, SS.z0, SS.x0 + 0.3, R + 0.9, 10, 'panel', para);
  pair(SS.x1 - 0.3, R, SS.z0, SS.x1, R + 0.9, 5, 'panel', para);
  // roof clutter: water tanks and a stair hut (full cover), low air-con boxes
  pair(21, R, -29, 23.5, R + 2.6, -26.5, 'hull', { color: METAL });
  pair(30, R, -27, 33, R + 2.4, -24.5, 'panel', { color: FACADE_WARM });
  pair(29, R, -30.8, 31.2, R + 0.6, -29.3, 'hull', { color: PILLAR });
  pair(29, R, 5, 31.2, R + 0.6, 6.5, 'hull', { color: PILLAR });
  pair(22, R, 0.5, 24.5, R + 2.6, 3, 'hull', { color: METAL });
  // fire escapes: a stair along the facade and a landing tower at the top
  const FE = { mat: 'grate' as Material, color: METAL };
  for (const z of [-13.75, -2.25]) {
    for (const s of SIGNS) push(wedgeRamp('x', s * 25, s * 33.5, 0, R, z, 2.5, FE));
    pair(33.5, 0, z - 1.25, 36, R, z + 1.25, 'grate', { color: METAL });
  }
  // stall counters with awnings on the market street faces (the awning hop: counter, awning,
  // roof)
  pair(19, 0, -15, 24, 1.1, -14, 'wood', { color: WOOD_LIGHT });
  pair(18.5, 3, -15, 24.5, 3.2, -12.8, 'panel', { color: AWNING_PINK });
  pair(19, 0, -2, 24, 1.1, -1, 'wood', { color: WOOD_LIGHT });
  pair(18.5, 3, -3.2, 24.5, 3.2, -1, 'panel', { color: AWNING_TEAL });
  // the noodle stall island in the market street: a kitchen (full cover) with counters at its
  // ends (half cover) under one awning
  pair(19, 0, -10.4, 23, 3, -5.6, 'wood', { color: WOOD });
  pair(18, 0, -9.6, 19, 1.1, -6.4, 'wood', { color: WOOD_LIGHT });
  pair(23, 0, -9.6, 24, 1.1, -6.4, 'wood', { color: WOOD_LIGHT });
  pair(18, 3, -10.6, 24, 3.2, -5.4, 'panel', { color: AWNING_AMBER });
  deco(18, 2.85, -10.6, 24, 3, -10.45, 'trim', AMBER); // the awning's lit edges
  deco(18, 2.85, -5.55, 24, 3, -5.4, 'trim', AMBER);
  deco(19.2, 1.6, -10.45, 22.8, 2.4, -10.4, 'glow', 0xffd9a0); // the kitchen's lit hatches
  deco(19.2, 1.6, -5.6, 22.8, 2.4, -5.55, 'glow', 0xffd9a0);
  // the night market's gate where the market street meets the plaza: two pillars (full cover)
  // under a lit sign beam
  for (const [z0, z1] of [
    [-15.4, -10.2],
    [-5.8, -0.6],
  ])
    pair(14.4, 0, z0, 15.6, 4.2, z1, 'pillar', { color: PILLAR });
  deco(14.4, 4.2, -15.4, 15.6, 4.8, -0.6, 'hull', DARK);
  deco(14.3, 4.3, -12, 14.4, 4.7, -4, 'trim', PINK);
  deco(15.6, 4.3, -12, 15.7, 4.7, -4, 'trim', AMBER);
  deco(14.3, 0.4, -11.9, 14.4, 3.8, -11.7, 'trim', TEAL);
  deco(14.3, 0.4, -4.3, 14.4, 3.8, -4.1, 'trim', TEAL);
  // vending machines (full cover), their fronts lit
  const vending = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    front: 'x-' | 'x+' | 'z-',
    color: number,
  ) => {
    pair(x0, 0, z0, x1, 2.2, z1, 'hull', { color: 0x2a2436 });
    if (front === 'x+') deco(x1, 0.4, z0 + 0.1, x1 + 0.05, 2, z1 - 0.1, 'glow', color);
    else if (front === 'x-') deco(x0 - 0.05, 0.4, z0 + 0.1, x0, 2, z1 - 0.1, 'glow', color);
    else deco(x0 + 0.1, 0.4, z0 - 0.05, x1 - 0.1, 2, z0, 'glow', color);
  };
  vending(36, -24, 36.9, -22.8, 'x+', TEAL);
  vending(36, -22.6, 36.9, -21.4, 'x+', PINK);
  vending(17.1, 2, 18, 3.2, 'x-', VIOLET);
  vending(17.1, 3.4, 18, 4.6, 'x-', AMBER);

  // ======================= the Koi Plaza =======================
  buildPlaza(kit);

  // ======================= the monorail and the station (B) =======================
  const D = S.deck;
  const Y = S.rail;
  const X = S.station.x;
  box(-X, Y - 0.6, S.station.z0, X, Y, S.station.z1, 'plate', { color: PLATFORM });
  pair(D.x0, Y - 0.6, D.z0, D.x1, Y, D.z1, 'grate', { color: DECK });
  // railings (half cover) along the deck, open where the stairs from the spawn street arrive
  const RAIL = { color: METAL };
  pair(D.x0, Y, D.z0, 36, Y + 1, D.z0 + 0.12, 'grate', RAIL);
  pair(40, Y, D.z0, D.x1, Y + 1, D.z0 + 0.12, 'grate', RAIL);
  pair(D.x0, Y, D.z1 - 0.12, D.x1, Y + 1, D.z1, 'grate', RAIL);
  deco(D.x0, Y + 1, D.z1 - 0.12, D.x1, Y + 1.04, D.z1, 'glow', PINK);
  // the buffer stop at the end of the line (full cover)
  pair(42.5, Y, 16, 43.5, Y + 2.2, 19, 'hull', { color: 0x5a2230 });
  deco(42.4, Y + 1.6, 16.2, 42.5, Y + 2, 18.8, 'trim', 0xff3030);
  // the running rails (painted, flush) and a lit strip under the deck
  for (const z of [16.6, 18.4]) {
    decoMid(-X, Y, z - 0.06, X, Y + 0.02, z + 0.06, 'glow', RAILS);
    deco(D.x0, Y, z - 0.06, 42.5, Y + 0.02, z + 0.06, 'glow', RAILS);
  }
  deco(D.x0 + 1, Y - 0.72, 15.6, D.x1 - 1, Y - 0.6, 15.8, 'trim', TEAL);
  // deck pillars in the rail street
  for (const x of [24, 33]) pair(x - 0.5, 0, 17, x + 0.5, Y - 0.6, 18, 'pillar', { color: PILLAR });
  // stairs: from the spawn street up to the deck, from the rail street up to the station's
  // south platform, from the south rooftops up to its north platform
  const STAIR = { mat: 'grate' as Material, color: METAL };
  for (const s of SIGNS) {
    push(wedgeRamp('z', -1, D.z0, 0, Y, s * 38, 4, STAIR));
    push(wedgeRamp('x', s * X, s * 28, Y, 0, 23.5, 4, STAIR));
    push(wedgeRamp('x', s * X, s * 19, Y, R, 12.5, 4, STAIR));
  }
  buildStation(kit);
  const rails: RailDef[] = SIGNS.map((s) => ({
    points: [v3(s * S.railX[0], S.railY, S.railZ), v3(s * S.railX[1], S.railY, S.railZ)],
  }));
  // catenary masts at the rails' ends (by the deck's south railing)
  for (const x of S.railX) {
    pair(x - 0.15, Y, D.z1 - 0.42, x + 0.15, S.railY + 0.3, D.z1 - 0.12, 'pillar', {
      color: PILLAR,
    });
    deco(x - 0.04, S.railY + 0.2, S.railZ, x + 0.04, S.railY + 0.28, D.z1 - 0.42, 'hull', DARK);
  }

  // ======================= rail street and the overlook =======================
  // the planter in the middle (full cover) and stalls along the glass
  box(-4, 0, 25.4, 4, 2.4, 34.5, 'panel', { color: FACADE });
  decoMid(-4, 2.4, 25.4, 4, 2.55, 34.5, 'leaf', 0x2f5a4a);
  decoMid(-4.05, 0.3, 25.35, 4.05, 0.42, 25.4, 'trim', TEAL);
  // a viewing scope on its plinth at the window (full cover)
  box(-1, 0, 38.6, 1, 2.4, 40, 'hull', { color: METAL });
  decoMid(-0.6, 2.4, 38.9, 0.6, 2.9, 39.7, 'trim', TEAL);
  decoMid(-4.05, 0.3, 34.5, 4.05, 0.42, 34.55, 'trim', TEAL);
  pair(18, 0, 37, 24, 3, 39, 'wood', { color: WOOD });
  pair(18, 0, 36, 24, 1.1, 37, 'wood', { color: WOOD_LIGHT });
  pair(17.5, 3, 35, 24.5, 3.2, 39.5, 'panel', { color: AWNING_VIOLET });
  deco(17.5, 2.85, 35, 24.5, 3, 35.15, 'trim', VIOLET);
  vending(30, 38.9, 31.2, 39.9, 'z-', PINK);
  vending(31.4, 38.9, 32.6, 39.9, 'z-', TEAL);
  pair(8, 0, 38.8, 11, 0.5, 39.5, 'wood', { color: WOOD });
  pair(36.5, 0, 38.8, 39.5, 0.5, 39.5, 'wood', { color: WOOD });
  // crates (full cover: they break the long lines along the street)
  pair(33.5, 0, 25.6, 35.5, 2.2, 28.4, 'crate', { color: 0x4a3a2c });
  pair(14, 0, 34, 16, 2.2, 37, 'crate', { color: 0x4a3a2c });
  pair(41, 0, 27, 43.5, 2.2, 30, 'crate', { color: 0x4a3a2c });
  pair(41, 0, -28, 43.5, 2.2, -25, 'crate', { color: 0x4a3a2c });
  // lantern strings from posts at the glass to the deck's edge
  for (const x of [20.5, 28.5, 36.5]) {
    pair(x - 0.1, 0, 39.6, x + 0.1, 6, 39.9, 'pillar', { color: PILLAR });
    deco(x - 0.03, 5.9, 20, x + 0.03, 5.96, 39.6, 'hull', DARK);
    for (const [i, z] of [23, 27, 31].entries())
      deco(x - 0.22, 5.3, z - 0.22, x + 0.22, 5.9, z + 0.22, 'trim', i === 1 ? PINK : AMBER);
  }

  decorate(kit);
  scenery(kit);

  return b.build({
    name: 'Afterglow',
    boundsMin: v3(-56, -3, -42),
    boundsMax: v3(56, 21, 42),
    defaultGravity: v3(0, -1, 0),
    zones: [],
    rails,
    pads: [],
    spawns,
    towers,
    controllerHomes: homes,
    waypoints: waypoints(),
    areas: [
      { name: 'Cyan spawn', pos: v3(-50.9, 0, -4), yawDeg: -90 },
      { name: 'Orange spawn', pos: v3(50.9, 0, -4), yawDeg: 90 },
      { name: 'A: arcade hall', pos: v3(0, 0, -30), yawDeg: 180 },
      { name: 'B: station', pos: v3(0, S.rail, 14), yawDeg: 180 },
      { name: 'Koi Plaza', pos: v3(7, S.plaza.y, -4), yawDeg: 90 },
      { name: 'Lantern Alley', pos: v3(38, 0, -36), yawDeg: 90 },
      { name: 'Market Street', pos: v3(30, 0, -8), yawDeg: 90 },
      { name: 'Rail Street', pos: v3(30, 0, 30), yawDeg: 90 },
      { name: 'Monorail', pos: v3(38, S.rail, 17.5), yawDeg: 90 },
      { name: 'North rooftops', pos: v3(27, S.roof, -24), yawDeg: 90 },
      { name: 'South rooftops', pos: v3(27, S.roof, 8), yawDeg: 90 },
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

/** The arcade hall's inside: cabinets (full cover), pinball tables and the prize counter. */
const buildArcadeInside = ({ box, pair, deco, decoMid, light }: Kit): void => {
  const CAB = { color: CABINET };
  // a cabinet bank along each side wall, south of the side door (screens face the hall)
  pair(12.8, 0, -31, 14, 2.2, -22.5, 'hull', CAB);
  deco(12.75, 1.1, -30.8, 12.8, 1.9, -22.7, 'glow', TEAL);
  // free-standing cabinets (back to back) in the hall
  pair(8.2, 0, -30.5, 9.4, 2.2, -26.5, 'hull', CAB);
  deco(8.15, 1.1, -30.3, 8.2, 1.9, -26.7, 'glow', PINK);
  deco(9.4, 1.1, -30.3, 9.45, 1.9, -26.7, 'glow', VIOLET);
  // claw machines, and a token booth inside each side door (full cover: no line straight
  // through the hall from door to door)
  pair(3.5, 0, -35.3, 5.1, 2.2, -32.8, 'hull', CAB);
  deco(3.6, 2.2, -35.2, 5, 2.3, -32.9, 'trim', PINK);
  pair(9, 0, -38, 11, 2.4, -35.8, 'panel', { color: 0x3b2450 });
  deco(9.1, 1.2, -35.8, 10.9, 2.2, -35.75, 'glow', TEAL);
  // pinball tables (half cover) by the front doors
  pair(1.2, 0, -26.5, 2.4, 1.1, -24.3, 'hull', { color: 0x3b2450 });
  deco(1.25, 1.1, -26.4, 2.35, 1.15, -24.4, 'glow', AMBER);
  // the prize counter (half cover) and the prize shelves behind it
  box(-3.5, 0, -38, 3.5, 1.1, -37.2, 'wood', { color: WOOD_LIGHT });
  box(-5, 0, -40, 5, 2.6, -39.2, 'crate', { color: 0x5a3a60 });
  decoMid(-3.5, 1.1, -38, 3.5, 1.16, -37.2, 'trim', AMBER);
  // the dance machine at the back of the site: a stage (a step) and its screen wall
  box(-1.8, 0, -35.3, 1.8, 0.25, -33.3, 'hull', { color: 0x3a2a55 });
  box(-1.8, 0, -35.8, 1.8, 2.4, -35.3, 'hull', CAB);
  decoMid(-1.6, 0.8, -35.3, 1.6, 2.2, -35.25, 'glow', VIOLET);
  decoMid(-1.6, 0.25, -35.1, 1.6, 0.28, -33.5, 'glow', PINK);
  // site A marking
  const A = AFTERGLOW.bombSites.A;
  const w = 0.12;
  decoMid(A.min.x, 0, A.min.z, A.max.x, 0.03, A.min.z + w, 'trim', SITE);
  decoMid(A.min.x, 0, A.max.z - w, A.max.x, 0.03, A.max.z, 'trim', SITE);
  deco(A.max.x - w, 0, A.min.z + w, A.max.x, 0.03, A.max.z - w, 'trim', SITE);
  // neon under the ceiling, a sign over the front doors
  deco(6.9, 5.85, -39.5, 7.1, 6, -20.5, 'trim', VIOLET);
  decoMid(-0.1, 5.85, -39.5, 0.1, 6, -20.5, 'trim', PINK);
  decoMid(-9, 4.2, -19, 9, 5.2, -18.85, 'trim', VIOLET);
  deco(8.2, 0.2, -19, 8.35, 3.6, -18.85, 'trim', PINK);
  deco(3.65, 0.2, -19, 3.8, 3.6, -18.85, 'trim', PINK);
  // a big sign on the roof
  box(-8, 6.5, -21, 8, 9.5, -20.6, 'hull', { color: DARK });
  decoMid(-7.6, 7, -20.6, 7.6, 9, -20.45, 'trim', PINK);
  light(0, 4.5, -30, VIOLET, 14, 1);
  light(9, 4, -25, PINK, 8, 0.8);
  light(9, 3.5, -36, TEAL, 7, 0.7);
};

/** The sunken Koi Plaza: steps, the dry fountain, its projector and the holographic koi. */
const buildPlaza = ({ box, pair, deco, decoMid, light, push }: Kit): void => {
  const P = AFTERGLOW.plaza;
  const TILE = { color: PLAZA_TILE };
  // steps down (0.3 m each): two north, two south, one each side. You walk on a smooth ramp
  // under them (invisible, 27°: no stumbling up 0.3 m steps), the steps are the look
  const steps = { ...TILE, noCollide: true };
  for (const [k, top] of [-0.3, -0.6, -0.9].entries()) {
    const d = 0.8 * (k + 1);
    pair(3, P.y, P.z0, 7, top, P.z0 + d, 'floor', steps);
    pair(3, P.y, P.z1 - d, 7, top, P.z1, 'floor', steps);
    pair(P.x - d, P.y, -7, P.x, top, -1, 'floor', steps);
  }
  const ramp = { mat: 'floor' as Material, noRender: true };
  for (const s of SIGNS) {
    push(wedgeRamp('z', P.z0 + 2.4, P.z0, P.y, 0, s * 5, 4, ramp));
    push(wedgeRamp('z', P.z1 - 2.4, P.z1, P.y, 0, s * 5, 4, ramp));
    push(wedgeRamp('x', s * (P.x - 2.4), s * P.x, P.y, 0, -4, 6, ramp));
  }
  // a lit lip round the pit
  decoMid(-P.x, 0, P.z0 - 0.15, P.x, 0.03, P.z0, 'trim', TEAL);
  decoMid(-P.x, 0, P.z1, P.x, 0.03, P.z1 + 0.15, 'trim', TEAL);
  deco(P.x, 0, P.z0, P.x + 0.15, 0.03, P.z1, 'trim', PINK);
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
  const r = 2.7;
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
  // lantern poles at the plaza's corners, strings of lanterns across it
  for (const z of [P.z0 - 1, P.z1 + 1]) {
    pair(12.3, 0, z - 0.15, 12.6, 6.4, z + 0.15, 'pillar', { color: PILLAR });
    decoMid(-12.3, 6, z - 0.03, 12.3, 6.06, z + 0.03, 'hull', DARK);
    for (const [i, x] of [-8, -2.5, 2.5, 8].entries())
      decoMid(x - 0.25, 5.3, z - 0.25, x + 0.25, 6, z + 0.25, 'trim', i % 3 === 0 ? AMBER : PINK);
  }
  light(0, 6, cz, TEAL, 16, 1.3);
  light(7, 3, cz, PINK, 9, 0.8);
  light(0, 2, P.z0 + 1, VIOLET, 8, 0.6);
};

/** The station: canopy, pillars, platform cover (site B), and the concourse under it. */
const buildStation = ({ box, pair, deco, decoMid, light }: Kit): void => {
  const Y = AFTERGLOW.rail;
  const X = AFTERGLOW.station.x;
  const Z0 = AFTERGLOW.station.z0;
  const Z1 = AFTERGLOW.station.z1;
  const RAIL = { color: METAL };
  // platform edge railings (north over the promenade, south over the overlook)
  box(-X, Y, Z0, X, Y + 1, Z0 + 0.12, 'grate', RAIL);
  box(-X, Y, Z1 - 0.12, X, Y + 1, Z1, 'grate', RAIL);
  // yellow safety lines along the track
  decoMid(-X, Y, 14.6, X, Y + 0.02, 15, 'glow', 0xe8c040);
  decoMid(-X, Y, 20, X, Y + 0.02, 20.4, 'glow', 0xe8c040);
  // canopy on four pillars
  box(-X, 12.5, Z0, X, 13, Z1, 'hull', { color: DARK });
  for (const z of [11.2, 24.8])
    pair(5.6, Y, z - 0.4, 6.4, 12.5, z + 0.4, 'pillar', { color: PILLAR });
  decoMid(-9.2, 12.35, Z0 + 0.2, 9.2, 12.5, Z0 + 0.4, 'trim', TEAL);
  decoMid(-11.5, 12.35, Z1 - 0.4, 11.5, 12.5, Z1 - 0.2, 'trim', PINK);
  decoMid(-8, 12.6, Z0 - 0.15, 8, 12.9, Z0, 'trim', AMBER); // the station's name board
  // the train standing at the platform (x -6..6 on the track): doors open on both sides, its
  // ends shut (the monorail's long line stops at it), roofed by the canopy
  const C = AFTERGLOW.car;
  const body = { color: 0xd9d3ea };
  const doors = [
    { u0: -C.door, u1: C.door, v0: Y, v1: C.doorTop },
    { u0: C.side0, u1: C.side1, v0: Y, v1: C.doorTop },
    { u0: -C.side1, u1: -C.side0, v0: Y, v1: C.doorTop },
  ];
  for (const [z0, z1] of [
    [C.z0, C.z0 + 0.2],
    [C.z1 - 0.2, C.z1],
  ])
    for (const r of subtractHoles({ u0: -C.x, u1: C.x, v0: Y, v1: 12.5 }, doors))
      box(r.u0, r.v0, z0, r.u1, r.v1, z1, 'panel', body);
  pair(C.x - 0.2, Y, C.z0 + 0.2, C.x, 12.5, C.z1 - 0.2, 'panel', body);
  // lit window bands outside, a stripe, the headlight at each end; seats inside (half cover)
  for (const [z0, z1] of [
    [C.z0 - 0.05, C.z0],
    [C.z1, C.z1 + 0.05],
  ]) {
    decoMid(-C.x + 0.2, C.doorTop + 0.3, z0, C.x - 0.2, C.doorTop + 1.3, z1, 'glow', 0xfff0d8);
    decoMid(-C.x, 12.1, z0, C.x, 12.3, z1, 'glow', VIOLET);
  }
  deco(C.x, Y + 1.2, 16.8, C.x + 0.05, Y + 2.2, 18.2, 'trim', 0xfff0d8);
  pair(1.6, Y, C.z0 + 0.2, 3.1, Y + 0.5, C.z0 + 0.8, 'wood', { color: AWNING_VIOLET });
  pair(1.6, Y, C.z1 - 0.8, 3.1, Y + 0.5, C.z1 - 0.2, 'wood', { color: AWNING_VIOLET });
  decoMid(-5.5, 12.35, 17.4, 5.5, 12.5, 17.6, 'trim', 0xe8e0ff);
  // north platform: a timetable pylon (full cover), benches (half), a ticket machine pillar
  // (full)
  box(-1.5, Y, 12, 1.5, 12.5, 12.4, 'panel', { color: DARK });
  decoMid(-1.3, Y + 0.9, 12.4, 1.3, Y + 2.2, 12.45, 'glow', AMBER);
  decoMid(-1.3, Y + 0.9, 11.95, 1.3, Y + 2.2, 12, 'glow', TEAL);
  pair(3, Y, 12.2, 5.5, Y + 0.55, 12.9, 'wood', { color: WOOD });
  pair(9.5, Y, 10.3, 10.7, 12.5, 11.1, 'hull', { color: 0x2a2436 });
  deco(9.6, Y + 0.6, 11.1, 10.6, Y + 1.9, 11.15, 'glow', TEAL);
  // south platform: a kiosk (full cover, up to the canopy), benches
  box(-2, Y, 22, 2, 12.5, 24.5, 'panel', { color: FACADE_WARM });
  decoMid(-2.05, Y + 2.3, 21.95, 2.05, Y + 2.6, 22, 'trim', PINK);
  pair(5, Y, 23.4, 7.5, Y + 0.55, 24.1, 'wood', { color: WOOD });
  // site B marking (broken where the track runs through)
  const B = AFTERGLOW.bombSites.B;
  const w = 0.12;
  decoMid(B.min.x, Y, B.min.z, B.max.x, Y + 0.03, B.min.z + w, 'trim', SITE);
  decoMid(B.min.x, Y, B.max.z - w, B.max.x, Y + 0.03, B.max.z, 'trim', SITE);
  deco(B.max.x - w, Y, B.min.z + w, B.max.x, Y + 0.03, 14.6, 'trim', SITE);
  deco(B.max.x - w, Y, 20.4, B.max.x, Y + 0.03, B.max.z - w, 'trim', SITE);
  // the concourse under the platform: the station's core (ticket hall and lifts, up to the
  // platform), ticket machine banks (full cover) and pillars
  box(-3, 0, 15, 3, Y - 0.6, 21.5, 'panel', { color: FACADE_WARM });
  decoMid(-3.05, 2.4, 14.95, 3.05, 2.7, 15, 'trim', TEAL);
  decoMid(-3.05, 2.4, 21.5, 3.05, 2.7, 21.55, 'trim', TEAL);
  pair(3, 0, 11, 7.5, 2.2, 12, 'hull', { color: 0x2a2436 });
  deco(3.2, 0.5, 10.95, 7.3, 1.9, 11, 'glow', AMBER);
  for (const z of [13, 23])
    pair(7.5, 0, z - 0.5, 8.5, Y - 0.6, z + 0.5, 'pillar', { color: PILLAR });
  deco(4, Y - 0.72, 11, 11, Y - 0.6, 11.2, 'trim', VIOLET);
  deco(4, Y - 0.72, 24.8, 11, Y - 0.6, 25, 'trim', VIOLET);
  light(0, 12, 12.5, 0xcfd8ff, 10, 0.8);
  light(0, 12, 23, 0xcfd8ff, 10, 0.8);
  light(0, 6.5, 18, VIOLET, 12, 0.8);
};

/** Neon, lanterns and signs on the facades; accent lights across the market. */
const decorate = ({ pair, deco, light }: Kit): void => {
  const R = AFTERGLOW.roof;
  // the tenements over the alley (north facade): lit windows and blade signs
  for (const [i, x] of [18, 23, 28, 33, 38].entries()) {
    deco(x - 1, 6, -40, x + 1, 7.4, -39.95, 'glow', i % 2 ? 0x6a4a88 : 0x8a6a40);
    deco(x - 1, 9, -40, x + 1, 10.4, -39.95, 'glow', i % 2 ? 0x8a6a40 : 0x4a6a88);
  }
  for (const [x, c] of [
    [21, PINK],
    [30, TEAL],
    [40, VIOLET],
  ] as [number, number][])
    deco(x - 0.08, 3.4, -40, x + 0.08, 5.8, -39.2, 'trim', c);
  // shopfronts along the alley (the north shops' backs): shutters and signs
  for (const x of [20.5, 26, 33.5]) {
    deco(x - 1.4, 0, -32.05, x + 1.4, 2.6, -32, 'hull', 0x2a2733);
    deco(x - 1.4, 2.8, -32.12, x + 1.4, 3.1, -32, 'trim', x > 30 ? AMBER : PINK);
  }
  // market street faces: signs over the counters, lit panels on the fire escape towers
  deco(19, 3.4, -15, 24, 3.9, -14.9, 'trim', PINK);
  deco(19, 3.4, -1.1, 24, 3.9, -1, 'trim', TEAL);
  deco(33.7, 1, -12.5, 35.8, 3.5, -12.4, 'trim', VIOLET);
  deco(33.7, 1, -3.6, 35.8, 3.5, -3.5, 'trim', AMBER);
  // the shops' fronts on the plaza side (west faces)
  deco(17.9, 2.2, -30, 18, 2.5, -17, 'trim', AMBER);
  deco(17.85, 3.2, 6, 18, 4.2, 9, 'trim', PINK);
  // spawn street faces (east faces of the shops)
  deco(36, 2.8, -30, 36.12, 3.1, -25, 'trim', TEAL);
  // accent lights: alley (dark but for the lanterns), market, rooftops, rail street, overlook
  light(24, 3, -36, AMBER, 7, 0.6);
  light(38, 3, -36, VIOLET, 7, 0.5);
  light(28, 4, -8, PINK, 11, 0.9);
  light(19, 2.6, -8, AMBER, 7, 0.8);
  light(40, 4, -8, TEAL, 8, 0.6);
  light(15.5, 3, 3, VIOLET, 8, 0.7);
  light(27, 7, -24, PINK, 11, 0.7);
  light(27, 7, 6, VIOLET, 11, 0.7);
  light(28, 5.5, 25, AMBER, 11, 0.8);
  light(16, 5, 25, TEAL, 8, 0.6);
  light(38, 5, 30, VIOLET, 9, 0.6);
  light(21, 2.6, 34, VIOLET, 7, 0.8);
  light(30, 2, 37, PINK, 7, 0.6);
  light(28, 10.5, 17.5, TEAL, 10, 0.6);
  light(0, 3, 36, 0x6a88ff, 12, 0.6); // the planet's glow through the window
  light(0, 3, -16, PINK, 9, 0.8); // the arcade's front
  // a lantern tower on the south shops' roof, a billboard on the north roof
  pair(33, R, 10, 34.4, R + 2.6, 11.4, 'panel', { color: FACADE_WARM });
  deco(32.95, R + 1.2, 10, 33, R + 2.4, 11.4, 'trim', AMBER);
  pair(25, R, -31.4, 31, R + 3.2, -31, 'hull', { color: DARK });
  deco(25.3, R + 1, -31, 30.7, R + 2.9, -30.9, 'trim', TEAL);
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
  const R = AFTERGLOW.roof;
  const Y = AFTERGLOW.rail;
  const P = AFTERGLOW.plaza.y;
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

  // spawn arcade
  add('tower', 48.8, 0, 0);
  add('roomN', 51, 0, -8.5);
  add('roomS', 51, 0, 8.5);
  add('openN', 52.2, 0, -13.3);
  add('openS', 52.2, 0, 13.3);
  add('wingN', 52, 0, -17.5);
  add('wingS', 52, 0, 17.5);
  add('wingNW', 46, 0, -17.5);
  add('wingSW', 46, 0, 17.5);
  add('corM', 46, 0, 0);
  add('doorN', 44.5, 0, -17.5);
  add('doorM', 44.5, 0, 0);
  add('doorS', 44.5, 0, 17.5);
  // spawn street
  add('stN', 41, 0, -17.5);
  add('stM', 42, 0, 0);
  add('stS', 41, 0, 17.5);
  add('stNN', 38.5, 0, -27);
  add('stMk', 40, 0, -8);
  add('stSS', 40, 0, 28);
  // lantern alley, side passage
  add('alHead', 40, 0, -36);
  add('al1', 33, 0, -38.2);
  add('al2', 27, 0, -36);
  add('al3', 21, 0, -33.8);
  add('alEnd', 16.5, 0, -35.5);
  add('aDoor', 14.5, 0, -35.5);
  add('psTop', 16.5, 0, -30);
  add('psBot', 16.5, 0, -17);
  // the arcade hall (A)
  add('aIn', 11.8, 0, -35);
  add('aNE', 10.8, 0, -32.5);
  add('aMid', 6.5, 0, -31.5);
  add('siteA', 0, 0, -28);
  add('aBack', 0, 0, -32.3);
  add('aFront', 0, 0, -22.5);
  add('aInS', 6, 0, -22.2);
  add('aDoorS', 6, 0, -19.5);
  // promenade and the Koi Plaza
  add('prom', 6, 0, -16);
  add('promW', 13.5, 0, -16.5);
  add('pNE', 5, P, -9.5);
  add('pN', 0, P, -10.4);
  add('pE', 6.5, P, -4);
  add('pSE', 5, P, 1.6);
  add('pS', 0, P, 2.4);
  add('basin', 0, P, -1.9);
  add('ringN', 12.8, 0, -12);
  add('gate', 12.8, 0, -8);
  add('ring', 12.8, 0, -2.5);
  add('plazaSE', 15.5, 0, 2);
  add('promS', 5, 0, 7.5);
  // market street, fire escapes, rooftops
  add('mkNW', 16.5, 0, -16.3);
  add('mkGate', 16.8, 0, -8);
  add('mkN', 18.5, 0, -12.2);
  add('mkS', 18.5, 0, -3.8);
  add('mkSW', 16.6, 0, 0.2);
  add('mkC', 29.5, 0, -8);
  add('feNfoot', 24.6, 0, -13.4);
  add('feNtop', 34.7, R, -13.75);
  add('roofN1', 34, R, -18);
  add('roofN2', 27, R, -25);
  add('roofN3', 21, R, -19);
  add('feSfoot', 24.6, 0, -2.6);
  add('feStop', 34.7, R, -2.25);
  add('roofS1', 33, R, 2);
  add('roofS2', 33, R, 8);
  add('roofS3', 25, R, 9);
  add('rampFoot', 20.5, R, 12.5);
  // monorail, station (B), concourse, rail street
  add('dsFoot', 38, 0, -2.8);
  add('dsMid', 38, R, 8);
  add('dsHi', 38, 7, 13);
  add('dsTop', 38, Y, 17.5);
  add('deckE', 41.5, Y, 17.5);
  add('deck1', 28, Y, 17.5);
  add('deckW', 14, Y, 17.5);
  add('bTrack', 9, Y, 17.5);
  add('siteB', 0, Y, 17.5);
  add('bN', 9.5, Y, 12.8);
  add('bNC', 0, Y, 14);
  add('bS', 6.5, Y, 21.8);
  add('bSC', 0, Y, 21);
  add('ssTop', 10.5, Y, 23.5);
  add('ssFoot', 29.5, 0, 23.5);
  add('concN', 5, 0, 13.5);
  add('concE', 7, 0, 17.5);
  add('conc', 0, 0, 13.5);
  add('rsD3', 15, 0, 16.2);
  add('rsD2', 28, 0, 16.2);
  add('rsD1', 35, 0, 16.2);
  add('rsS', 20, 0, 31);
  add('rsSE', 32, 0, 32);
  add('ovE', 6.5, 0, 31);
  add('ovE2', 5.5, 0, 36);
  add('ovC', 0, 0, 37.5);

  // spawn arcade: room → wings → doors; the corridor behind the facade joins the doors
  chain('tower', 'roomN', 'openN', 'wingN', 'wingNW', 'doorN', 'stN');
  chain('tower', 'roomS', 'openS', 'wingS', 'wingSW', 'doorS', 'stS');
  chain('wingNW', 'corM', 'wingSW');
  chain('corM', 'doorM', 'stM');
  // spawn street
  chain('alHead', 'stNN', 'stN', 'stMk', 'stM');
  chain('stMk', 'dsFoot', 'stM');
  chain('stS', 'stSS');
  // north lane: the alley's chicane to the arcade's side door and the side passage
  chain('alHead', 'al1', 'al2', 'al3', 'alEnd', 'aDoor', 'aIn');
  chain('alEnd', 'psTop', 'psBot', 'promW', 'prom');
  // the arcade
  chain('aIn', 'aNE', 'aMid', 'siteA', 'aFront');
  chain('aFront', 'aInS', 'aDoorS', 'prom');
  chain('aMid', 'aBack', 'siteA');
  link('aMid', 'aInS');
  // plaza and promenade
  chain('prom', 'pNE', 'pN');
  chain('pNE', 'pE', 'pSE', 'pS', 'basin');
  link('pE', 'ring');
  link('pSE', 'promS');
  chain('promW', 'ringN', 'gate', 'ring', 'plazaSE', 'promS');
  // market street and the fire escapes up to the rooftops
  chain('psBot', 'mkNW', 'mkN', 'mkGate', 'gate');
  link('mkGate', 'mkS');
  chain('stMk', 'mkC');
  chain('mkN', 'feNfoot', 'mkC', 'feSfoot', 'mkS', 'mkSW', 'plazaSE');
  chain('feNfoot', 'feNtop', 'roofN1', 'roofN2', 'roofN3', 'roofN1');
  chain('feSfoot', 'feStop', 'roofS1', 'roofS2', 'roofS3', 'rampFoot', 'bN');
  // the monorail: stairs from the spawn street (level with the south roofs halfway up)
  chain('dsFoot', 'dsMid', 'dsHi', 'dsTop', 'deck1', 'deckW', 'bTrack');
  link('dsMid', 'roofS2');
  link('dsTop', 'deckE');
  // the station
  chain('bN', 'bNC', 'siteB');
  link('bN', 'bTrack');
  chain('bTrack', 'bS', 'bSC', 'siteB');
  chain('bS', 'ssTop', 'ssFoot');
  // concourse and rail street
  chain('promS', 'conc', 'concN', 'concE', 'rsD3', 'rsD2', 'rsD1', 'stS');
  chain('rsD2', 'ssFoot', 'rsSE', 'stSS');
  chain('concE', 'ovE', 'ovE2', 'ovC');
  chain('ovE', 'rsS', 'rsSE');
  return wps;
};
