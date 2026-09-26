// "Split Deck" — the competitive map: an asymmetric warship deck (Mirage-style: attackers come
// from Orange's side, defenders hold two sites; sides swap at half time). Three levels:
//
//   A DECK (y 6)    the upper deck under the glass ceiling: A site, the gantry above the atrium,
//                   the deck run along the east side
//   MAIN (y 0)      both spawns, the lanes, the atrium (map centre, glass ceiling at y 14) with
//                   a hole in its floor
//   HOLD (y -5)     the basement: B site in the cargo hold, the pit under the atrium hole, the
//                   stairwell, the passage and the basement corridor
//
// Orange (team 1, south, z ≈ 82..96) pushes: east lane → deck run → A; mid → atrium → gantry
// → A; west lane → basement corridor → B; mid → stairs → B; or drops through the atrium hole
// into the pit. Cyan (team 0, north, z ≈ 4..16) reaches either site in about 5 s (west ramp
// down to B, east ramp up to A) and the atrium through the connector. The connector and the
// mid corridor enter the atrium in opposite corners: both teams reach the hole (and the
// power-up over it) at the same time, but walking straight through mid means going around
// the hole, so the side lanes stay worth taking in Tower mode.
//
// Plan coordinates: x → world x (0..120), plan y → world z (0..100). Rooms are open volumes;
// `shellAround` puts 1 m walls around them (rooms 1 m apart share a wall, a 1 m deep volume
// through it is a doorway). `npm run map -- split-deck` prints the layout report with the
// measured route timings (tools/map/timing.ts); tools/map/test keeps them balanced.
//
// Looks: every light is baked into the vertex colors (no real-time lights): ceiling spots with
// a lit housing, wall sconces, strip lights along lane edges and stair nosings, team-tinted
// accents near each base, amber gate lights, moonlight under the glass. Fixtures are plain
// boxes, merged with the rest of the level (no extra draw calls).
import type { Vec3 } from '../../math/vec3';
import { v3 } from '../../math/vec3';
import { qFromAxisAngle } from '../../math/quat';
import { LevelBuilder, shellAround, type OpenVolume, type SurfaceStyle } from '../builder';
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
const WHITE = 0xd8e6ff;
const AMBER = 0xffb347;
const MOON = 0xa9c4ff;
const HAZARD = 0xd8a21a;
const LAMP = 0xfff1d6; // warm white lamp faces
const SCREEN = 0x46c8ff;
const SITE = 0xc23b3b;

/** Key heights and areas (world coordinates). */
export const SPLIT_DECK = {
  hold: -5, // basement floor
  main: 0,
  deck: 6, // A deck, gantry, deck run
  glass: 14, // glass ceiling over the atrium and the A deck
  cyanSpawn: { x0: 48, x1: 72, z0: 4, z1: 16 },
  orangeSpawn: { x0: 42, x1: 78, z0: 82, z1: 96 },
  atrium: { x0: 44, x1: 76, z0: 36, z1: 62 },
  hole: { x0: 52, x1: 68, z0: 42, z1: 56 },
  pit: { x0: 45, x1: 76, z0: 40, z1: 62 },
  aDeck: { x0: 77, x1: 110, z0: 14, z1: 40 },
  bHold: { x0: 10, x1: 43, z0: 14, z1: 41 },
  /** Cyan's connector (spawn → atrium, north-east corner) */
  connector: { x0: 66, x1: 74 },
  /** Orange's mid corridor (spawn → atrium, south-west corner) */
  mid: { x0: 45, x1: 56 },
  deckRun: { x0: 86, x1: 100 },
  /** basement corridor (west lane → B hold) */
  basement: { x0: 21, x1: 30 },
  towers: [v3(60, 0, 6.5), v3(60, 0, 93.5)] as [Vec3, Vec3],
  powerup: v3(60, 2, 49),
  bombSites: {
    A: { min: v3(84, 6, 18), max: v3(106, 9, 36) },
    B: { min: v3(14, -5, 18), max: v3(38, -2, 38) },
  },
};

// zone surfaces (textures come from the material; colors tint them)
const PLATE: SurfaceStyle = { mat: 'plate' }; // lane floors
const GRATE: SurfaceStyle = { mat: 'grate' }; // gantry, deck run
const SITE_WALL: SurfaceStyle = { mat: 'panel' };
const HOLD_WALL: SurfaceStyle = { mat: 'engine', color: 0x3b3644 };
const HOLD_FLOOR: SurfaceStyle = { mat: 'plate', color: 0x3c4150 };
const HOLD_CEIL: SurfaceStyle = { mat: 'hull', color: 0x2a2f3c };
const SPAWN_A: SurfaceStyle = { mat: 'hull', color: 0x34506a };
const SPAWN_B: SurfaceStyle = { mat: 'hull', color: 0x5a4838 };

type Box6 = [number, number, number, number, number, number];

export const buildSplitDeck = (): LevelDef => {
  const S = SPLIT_DECK;
  const H = S.hold;
  const D = S.deck;
  const G = S.glass;
  const C = S.connector;
  const MC = S.mid;
  const DR = S.deckRun;
  const BC = S.basement;
  const b = new LevelBuilder();
  const box = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material = 'crate',
    extra: Omit<BoxDef, 'c' | 'h' | 'mat'> = {},
  ) => b.box(v3(x0, y0, z0), v3(x1, y1, z1), { mat, ...extra });
  const lights: LightDef[] = [];

  // ======================= rooms (open volumes) =======================
  const vols: OpenVolume[] = [];
  const room = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    o: Omit<OpenVolume, 'min' | 'max'> = {},
  ) => vols.push({ min: v3(x0, y0, z0), max: v3(x1, y1, z1), ...o });
  /** a doorway / window / floor hole: carves, adds no walls of its own */
  const door = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
    room(x0, y0, z0, x1, y1, z1, { walls: false });
  const lane = { floor: PLATE };
  const hold = { floor: HOLD_FLOOR, wall: HOLD_WALL, ceiling: HOLD_CEIL };

  // ---- Cyan (team 0) spawn and its two ramps ----
  const CS = S.cyanSpawn;
  room(CS.x0, 0, CS.z0, CS.x1, 8, CS.z1, { wall: SPAWN_A });
  // west: down a ramp to the hold (B)
  door(47, 0, 9, 48, 3.5, 13);
  room(30, H, 8, 46, 5, 13, lane);
  room(46, 0, 8, 47, 5, 13, lane);
  door(30, H, 13, 36, H + 3.5, 14);
  // east: up a ramp to the A deck
  door(72, 0, 9, 73, 3.5, 13);
  room(73, 0, 8, 86, 11, 13, lane);
  room(86, D, 8, 95, 11, 13, lane);
  door(87, D, 13, 94, D + 4, 14);
  // connector: spawn → the atrium's north-east corner (Mirage's connector)
  door(C.x0 + 1, 0, 16, Math.min(C.x1 - 1, CS.x1), 3.5, 17);
  room(C.x0, 0, 17, C.x1, 5, 35, lane);
  door(C.x0 + 2, 0, 35, C.x1, 4, 36);

  // ---- atrium (glass ceiling) + the gantry strip along its east side ----
  const AT = S.atrium;
  room(AT.x0, 0, AT.z0, AT.x1, G, 41, { lid: false, wall: SITE_WALL });
  room(AT.x0, 0, 41, 84, G, AT.z1, { lid: false, wall: SITE_WALL });
  const HO = S.hole;
  door(HO.x0, -1, HO.z0, HO.x1, 0, HO.z1); // the hole in the atrium floor
  door(77, D, 40, 84, D + 5, 41); // gantry → A deck
  door(76, D + 1.1, 36.5, 77, D + 4, 39.5); // A deck window over the atrium (vault through)
  // ---- the pit under the atrium ----
  const PT = S.pit;
  room(PT.x0, H, PT.z0, PT.x1, -1, PT.z1, hold);

  // ---- A deck (glass ceiling) + the deck run down to the east lane ----
  const AD = S.aDeck;
  room(AD.x0, D, AD.z0, AD.x1, G, AD.z1, { lid: false, wall: SITE_WALL });
  room(DR.x0, D, 41, DR.x1, 12, 65, { floor: GRATE });
  room(DR.x0, 0, 65, DR.x1, 12, 77, { floor: GRATE });
  door(DR.x0 + 2, D, 40, DR.x1 - 2, D + 5, 41);
  door(DR.x0 + 3, 0, 77, DR.x1 - 3, 4.5, 78); // gate: east lane → deck run
  room(79, 0, 78, DR.x1, 5, 86, lane); // east lane
  door(78, 0, 82, 79, 3.5, 86);

  // ---- mid corridor (from Orange spawn into the atrium's south-west corner) ----
  room(MC.x0, 0, 63, MC.x1, 5, 81, lane);
  door(MC.x0 + 1, 0, 62, MC.x0 + 7, 4.5, 63); // gate: mid → atrium
  door(MC.x0 + 2, 0, 81, MC.x1 - 2, 3.5, 82); // mid → Orange spawn
  // ---- stairs: off the mid corridor, down to the stairwell ----
  door(44, 0, 65.5, 45, 3.5, 70);
  room(35, 0, 65, 44, 5, 71, lane);
  room(35, H, 53, 43, 5, 65, { floor: GRATE, wall: HOLD_WALL });
  room(35, H, 42, 43, -1, 53, hold);
  door(36, H, 41, 42, H + 3.5, 42); // stairwell → B hold
  door(43, H, 43, 45, H + 3.5, 51); // stairwell ↔ pit
  // ---- passage + basement corridor (west) ----
  door(34, H, 45, 35, H + 3.5, 49);
  room(BC.x1 + 1, H, 44, 34, -1, 50, hold);
  door(BC.x1, H, 45, BC.x1 + 1, H + 3.5, 49);
  room(BC.x0, H, 42, BC.x1, -1, 65, hold);
  room(BC.x0, H, 65, BC.x1, 5, 77, hold);
  door(BC.x0 + 1, H, 41, BC.x1 - 1, H + 3.5, 42); // basement corridor → B hold
  door(BC.x0 + 1, 0, 77, BC.x1 - 1, 4, 78); // gate: west lane → basement corridor
  room(BC.x0 - 1, 0, 78, 41, 5, 86, lane); // west lane
  door(41, 0, 82, 42, 3.5, 86);

  // ---- B hold (basement, tall) ----
  const BH = S.bHold;
  room(BH.x0, H, BH.z0, BH.x1, 5, BH.z1, hold);

  // ---- Orange (team 1) spawn ----
  const OS = S.orangeSpawn;
  room(OS.x0, 0, OS.z0, OS.x1, 8, OS.z1, { wall: SPAWN_B });

  // ---- windows to space in the outer hull ----
  const windows: Box6[] = [
    [110, D + 2, 17, 111, D + 6.5, 37], // A deck, east hull
    [DR.x1, D + 2, 44, DR.x1 + 1, D + 5, 62], // deck run
    [46, 2.5, 96, 74, 6.5, 97], // Orange spawn, back wall
    [50, 2.5, 3, 70, 6.5, 4], // Cyan spawn, back wall
    [9, -1, 18, 10, 3, 37], // B hold, west hull
  ];
  for (const w of windows) door(...w);

  shellAround(b, vols);

  // glass: the ceiling over the atrium and the A deck (it collides: nobody leaves the ship),
  // hull windows in their openings
  const glass = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
    box(x0, y0, z0, x1, y1, z1, 'skyglass');
  glass(43, G, 35, 76, G + 0.3, 63);
  glass(76, G, 41, 85, G + 0.3, 63);
  glass(76, G, 13, 111, G + 0.3, 41);
  for (const [x0, y0, z0, x1, y1, z1] of windows) {
    if (x1 - x0 < 1.5) glass(x0 + 0.4, y0, z0, x1 - 0.4, y1, z1);
    else glass(x0, y0, z0 + 0.4, x1, y1, z1 - 0.4);
  }

  // ======================= ramps (≤ 27°: full sprint speed) =======================
  const DRX = (DR.x0 + DR.x1) / 2;
  const BCX = (BC.x0 + BC.x1) / 2;
  const ramps: [
    axis: 'x' | 'z',
    from: number,
    to: number,
    y0: number,
    y1: number,
    across: number,
    width: number,
    mat: Material,
  ][] = [
    ['x', 46, 34, 0, H, 10.5, 5, 'plate'], // Cyan → B
    ['x', 74, 86, 0, D, 10.5, 5, 'plate'], // Cyan → A
    ['z', 48, 60, D, 0, 80.5, 7, 'grate'], // atrium ↔ gantry
    ['z', 77, 65, 0, D, DRX, DR.x1 - DR.x0, 'grate'], // east lane ↔ deck run
    ['z', 65, 53, 0, H, 39, 8, 'grate'], // stairs ↔ stairwell
    ['z', 77, 65, 0, H, BCX, BC.x1 - BC.x0, 'plate'], // west lane ↔ basement
  ];
  for (const [axis, from, to, y0, y1, across, width, mat] of ramps) {
    b.ramp(axis, from, to, y0, y1, across, width, { mat });
    // glowing nosings every 2 m (stair edges that read at a glance)
    const n = Math.floor(Math.abs(to - from) / 2);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      slab(
        b,
        axis,
        from + (to - from) * t,
        0.12,
        y0 + (y1 - y0) * t,
        (y1 - y0) / (to - from),
        across,
        width - 0.6,
        {
          mat: 'trim',
          color: 0x6f8aa8,
          noCollide: true,
        },
      );
    }
  }
  // the gantry platform (A deck level) and the fill under its ramp (a wedge too low to crouch
  // into)
  box(77, 0, 41, 84, D, 48, 'grate', { trim: CYAN });
  box(77, 0, 48, 84, 3.9, 52, 'hull');
  box(77, 0, 52, 84, 1.9, 56, 'hull');
  box(77, 0, 56, 84, 0.9, 58, 'hull');
  // kick-rail along the gantry's atrium edge (step over it to drop), railing posts
  box(76.9, D, 41.3, 77.1, D + 0.6, 47.7, 'pillar');
  for (let z = 42; z < 48; z += 2.9)
    box(76.9, D, z, 77.1, D + 1.1, z + 0.12, 'pillar', { noCollide: true });
  box(76.9, D + 1.05, 41.3, 77.1, D + 1.15, 47.7, 'trim', { color: 0x2f6f8a, noCollide: true });

  // ======================= gates (open doorway frames) =======================
  // posts + a header beam around a doorway: the lane narrows, nothing closes; an amber
  // warning lamp on each header
  const frame = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y: number,
    h: number,
    c: number,
  ) => {
    const alongX = x1 - x0 > z1 - z0;
    const t = 0.5;
    if (alongX) {
      box(x0 - t, y, z0, x0, y + h, z1, 'pillar', { trim: c });
      box(x1, y, z0, x1 + t, y + h, z1, 'pillar', { trim: c });
      box(x0 - t, y + h, z0, x1 + t, y + h + 0.5, z1, 'pillar', { trim: c });
    } else {
      box(x0, y, z0 - t, x1, y + h, z0, 'pillar', { trim: c });
      box(x0, y, z1, x1, y + h, z1 + t, 'pillar', { trim: c });
      box(x0, y + h, z0 - t, x1, y + h + 0.5, z1 + t, 'pillar', { trim: c });
    }
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    box(cx - 0.3, y + h - 0.12, cz - 0.3, cx + 0.3, y + h, cz + 0.3, 'trim', {
      color: HAZARD,
      noCollide: true,
    });
    lights.push({ pos: v3(cx, y + h - 0.6, cz), color: AMBER, radius: 6, intensity: 0.9 });
  };
  frame(MC.x0 + 1.5, 61.8, MC.x0 + 6.5, 63.2, 0, 4, ORANGE); // mid → atrium
  frame(DR.x0 + 3.5, 76.8, DR.x1 - 3.5, 78.2, 0, 4, ORANGE); // east lane → deck run
  frame(BC.x0 + 1.5, 76.8, BC.x1 - 1.5, 78.2, 0, 3.5, ORANGE); // west lane → basement
  frame(36, 64.6, 42, 65.4, 0, 4, ORANGE); // stairs
  frame(C.x0 + 2.5, 34.8, C.x1 - 0.5, 36.2, 0, 3.5, CYAN); // connector → atrium

  // ======================= cover =======================
  // Cyan spawn: two crates screen the doors
  box(49, 0, 13.5, 51, 1.2, 15.5, 'crate', { trim: CYAN });
  box(62, 0, 13.5, 64, 1.2, 15.5, 'crate', { trim: CYAN });
  // connector: a console in the middle, a container by the atrium end (tight corner)
  box(C.x0 + 0.1, 0, 24, C.x0 + 3.5, 1.2, 26, 'panel', { trim: CYAN });
  box(C.x0 + 0.1, 0, 30, C.x0 + 2.5, 2.5, 34, 'crate');
  // atrium: containers in the corners, consoles along the hole, a low barrier by the gate
  box(44.1, 0, 44, 46.5, 2.5, 48, 'crate', { trim: WHITE });
  box(73.5, 0, 50, 75.9, 2.5, 55, 'crate');
  box(62, 0, 60, 65, 1.2, 61.5, 'panel');
  box(70, 0, 43, 71.5, 1.2, 46, 'panel', { trim: WHITE });
  box(46, 0, 36.1, 50, 2.5, 38, 'crate');
  box(56, 0, 36.1, 58, 1.2, 38, 'panel');
  // hole bollards (short posts at the corners: the drop stays open)
  for (const [x, z] of [
    [51.6, 41.6],
    [68.4, 41.6],
    [51.6, 56.4],
    [68.4, 56.4],
  ])
    box(x - 0.35, 0, z - 0.35, x + 0.35, 1, z + 0.35, 'pillar', { trim: HAZARD });
  // pit: crates along the walls (the landing under the hole stays clear)
  box(45.1, H, 56, 48.5, H + 2.5, 61.9, 'crate');
  box(71, H, 40.1, 75.9, H + 1.2, 44, 'crate', { trim: AMBER });
  box(70, H, 57, 73, H + 2.5, 61.9, 'crate');
  // A deck (A site): containers, consoles, a stack to climb (or fly) on
  box(82, D, 20, 86, D + 2.5, 24, 'crate', { trim: CYAN });
  box(97, D, 16, 101, D + 1.2, 18, 'panel');
  box(102, D, 26, 107, D + 2.5, 30, 'crate');
  box(102, D + 2.5, 26.5, 105, D + 5, 29.5, 'crate', { trim: WHITE });
  box(86, D, 33, 90, D + 1.2, 34.5, 'panel', { trim: CYAN });
  box(78, D, 14.1, 81, D + 2.5, 17, 'crate');
  // deck run: staggered containers (no line down the whole run)
  box(DR.x0 + 0.1, D, 50, DR.x0 + 4, D + 2.5, 54, 'crate');
  box(DR.x1 - 4, D, 57, DR.x1 - 0.1, D + 2.5, 61, 'crate', { trim: ORANGE });
  box(DR.x1 - 3, D, 43, DR.x1 - 1, D + 1.2, 47, 'panel');
  // mid corridor: staggered cover
  box(MC.x1 - 3, 0, 68, MC.x1 - 0.1, 1.2, 71, 'crate');
  box(MC.x0 + 0.1, 0, 73, MC.x0 + 3, 2.5, 76, 'crate', { trim: ORANGE });
  // stairs landing
  box(35.1, 0, 68.5, 38, 1.2, 70.9, 'panel');
  // west lane
  box(28, 0, 83, 31, 2.5, 85.9, 'crate', { trim: ORANGE });
  box(35, 0, 84, 37, 1.2, 85.9, 'crate');
  // east lane
  box(85, 0, 83.5, 88, 2.5, 85.9, 'crate', { trim: ORANGE });
  box(83, 0, 78.1, 85, 1.2, 80, 'crate');
  // B hold (B site): a container stack, a crate row, consoles, a machinery block
  box(18, H, 22, 24, H + 3, 26, 'crate', { trim: AMBER });
  box(19, H + 3, 22.5, 23, H + 5.5, 25.5, 'crate');
  box(31, H, 29, 35, H + 1.2, 30.5, 'panel', { trim: AMBER });
  box(11, H, 30, 14, H + 2.5, 34, 'crate');
  box(37, H, 20, 41, H + 2.5, 23, 'crate');
  box(29, H, 37, 32, H + 1.2, 40.9, 'crate');
  box(10.1, H, 14.1, 14, H + 2.5, 18, 'engine', { trim: AMBER });
  // passage + basement corridor
  box(BC.x0 + 0.1, H, 52, BC.x0 + 3, H + 2.5, 55, 'crate');
  box(BC.x1 - 3, H, 58, BC.x1 - 0.1, H + 1.2, 61, 'crate');
  // Orange spawn: crates by the doors
  box(45, 0, 86, 47, 1.2, 88, 'crate', { trim: ORANGE });
  box(73, 0, 86, 75, 1.2, 88, 'crate', { trim: ORANGE });

  // ======================= Towers, spawns, Controller homes =======================
  const towers: TowerDef[] = [];
  const spawns: SpawnDef[] = [];
  const homes: Vec3[] = [];
  for (const team of [0, 1] as const) {
    const tp = S.towers[team];
    const tc = team === 0 ? CYAN : ORANGE;
    const mat: Material = team === 0 ? 'teamA' : 'teamB';
    const toward = team === 0 ? 1 : -1; // +z: the map lies south of Cyan, north of Orange
    b.block(v3(tp.x, 3, tp.z), v3(2, 6, 2), { mat, trim: tc });
    towers.push({ team, pos: tp, radius: 1.5, height: 6 });
    homes.push(v3(tp.x, 0.9, tp.z + toward * 4));
    for (const z of [tp.z + toward * 1.5, tp.z + toward * 5.5])
      for (const x of team === 0 ? [51, 55, 65, 69] : [48, 53, 67, 72])
        spawns.push({ pos: v3(x, 0, z), yawDeg: team === 0 ? 180 : 0, team });
  }

  // ======================= fixtures, detail, markings (no collision) =======================
  fixtures(b, lights);
  decorate(b, spawns);

  // ======================= bot waypoint graph =======================
  const wps = waypoints();

  return b.build({
    name: 'Split Deck',
    boundsMin: v3(8, H - 2, 2),
    boundsMax: v3(112, G + 2, 98),
    defaultGravity: v3(0, -1, 0),
    zones: [],
    rails: [],
    pads: [],
    spawns,
    towers,
    controllerHomes: homes,
    waypoints: wps,
    areas: [
      { name: 'Cyan spawn', pos: v3(60, 0, 12), yawDeg: 180 },
      { name: 'Orange spawn', pos: v3(60, 0, 88), yawDeg: 0 },
      { name: 'Atrium', pos: v3(48, 0, 40), yawDeg: 180 },
      { name: 'A site (deck)', pos: v3(93, D, 25), yawDeg: 0 },
      { name: 'B site (hold)', pos: v3(27, H, 28), yawDeg: 0 },
      { name: 'Pit (under the hole)', pos: v3(50, H, 48), yawDeg: -90 },
      { name: 'Deck run', pos: v3(95, D, 60), yawDeg: 0 },
      { name: 'Basement corridor', pos: v3(22.5, H, 55), yawDeg: 0 },
      { name: 'Stairs', pos: v3(40, 0, 68), yawDeg: 0 },
    ],
    fog: { color: 0x060912, near: 45, far: 180 },
    ambient: 0.8,
    lights: [...lights, ...ambientLights()],
    bombSites: [
      { name: 'A', ...S.bombSites.A },
      { name: 'B', ...S.bombSites.B },
    ],
    powerups: [S.powerup],
    sky: {
      moons: [
        { dir: norm(v3(0.3, 0.85, -0.42)), sizeDeg: 7, color: 0xdfe6f5 },
        { dir: norm(v3(-0.5, 0.7, 0.5)), sizeDeg: 3.2, color: 0xf2d2a8 },
        { dir: norm(v3(0.92, 0.3, 0.25)), sizeDeg: 1.8, color: 0xb8c8ff },
      ],
    },
  });
};

const norm = (p: Vec3): Vec3 => {
  const l = Math.hypot(p.x, p.y, p.z) || 1;
  return v3(p.x / l, p.y / l, p.z / l);
};

/**
 * A thin slab lying on a ramp surface: `len` long along `axis` (centred at `at`, where the
 * surface is at height `y` and rises `slope` m per m), `width` across, `thick` thick.
 */
const slab = (
  b: LevelBuilder,
  axis: 'x' | 'z',
  at: number,
  len: number,
  y: number,
  slope: number,
  across: number,
  width: number,
  opts: Omit<BoxDef, 'c' | 'h'>,
  thick = 0.04,
): void => {
  const angle = Math.atan(slope);
  // lift the slab so it sits just on the surface
  const lift = thick / 2 + 0.01;
  const nx = -Math.sin(angle) * lift;
  const ny = Math.cos(angle) * lift;
  if (axis === 'x')
    b.boxes.push({
      c: v3(at + nx, y + ny, across),
      h: v3(len / 2, thick / 2, width / 2),
      q: qFromAxisAngle(v3(0, 0, 1), angle),
      ...opts,
    });
  else
    b.boxes.push({
      c: v3(across, y + ny, at + nx),
      h: v3(width / 2, thick / 2, len / 2),
      q: qFromAxisAngle(v3(1, 0, 0), -angle),
      ...opts,
    });
};

/**
 * Light fixtures as geometry, each with the baked light it casts: ceiling spots (a housing and
 * a bright lamp face, light pool on the floor below), wall sconces, strip lights along lane
 * edges, team accents near the bases, screens on consoles, pipes and vents in the basement.
 */
const fixtures = (b: LevelBuilder, lights: LightDef[]): void => {
  const S = SPLIT_DECK;
  const H = S.hold;
  const D = S.deck;
  const G = S.glass;
  const deco = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material,
    extra: { color?: number; trim?: number } = {},
  ) => b.box(v3(x0, y0, z0), v3(x1, y1, z1), { mat, noCollide: true, ...extra });
  const light = (
    x: number,
    y: number,
    z: number,
    color: number,
    radius: number,
    intensity: number,
  ) => lights.push({ pos: v3(x, y, z), color, radius, intensity });

  /** recessed ceiling spot: housing flush with the ceiling, lamp face, pool of light below */
  const spot = (x: number, ceil: number, z: number, color = LAMP, radius = 8, intensity = 1.15) => {
    deco(x - 0.55, ceil - 0.12, z - 0.55, x + 0.55, ceil, z + 0.55, 'pillar');
    deco(x - 0.32, ceil - 0.16, z - 0.32, x + 0.32, ceil - 0.12, z + 0.32, 'trim', { color });
    light(x, ceil - 1.2, z, color, radius, intensity);
  };
  /** wall sconce on a wall facing +x/-x/+z/-z (`n`): a small lamp throwing light along it */
  const sconce = (x: number, y: number, z: number, n: 'x+' | 'x-' | 'z+' | 'z-', color = LAMP) => {
    const [dx, dz] = n === 'x+' ? [1, 0] : n === 'x-' ? [-1, 0] : n === 'z+' ? [0, 1] : [0, -1];
    const w = 0.35;
    const d = 0.18;
    const x0 = dx === 0 ? x - w : dx > 0 ? x : x - d;
    const x1 = dx === 0 ? x + w : dx > 0 ? x + d : x;
    const z0 = dz === 0 ? z - w : dz > 0 ? z : z - d;
    const z1 = dz === 0 ? z + w : dz > 0 ? z + d : z;
    deco(x0, y - 0.25, z0, x1, y + 0.25, z1, 'hull');
    deco(
      x0 + dx * 0.02,
      y - 0.3,
      z0 + dz * 0.02,
      x1 + dx * 0.02,
      y - 0.25,
      z1 + dz * 0.02,
      'trim',
      { color },
    );
    deco(
      x0 + dx * 0.02,
      y + 0.25,
      z0 + dz * 0.02,
      x1 + dx * 0.02,
      y + 0.3,
      z1 + dz * 0.02,
      'trim',
      { color },
    );
    light(x + dx * 0.8, y, z + dz * 0.8, color, 6, 0.7);
  };
  /** strip light along the foot of a wall (x0..x1 or z0..z1 at the other coordinate) */
  const edgeX = (x0: number, x1: number, y: number, z: number, color: number) =>
    deco(x0, y + 0.02, z - 0.06, x1, y + 0.1, z + 0.06, 'trim', { color });
  const edgeZ = (z0: number, z1: number, y: number, x: number, color: number) =>
    deco(x - 0.06, y + 0.02, z0, x + 0.06, y + 0.1, z1, 'trim', { color });

  const DIM_CYAN = 0x1d6f84;
  const DIM_ORANGE = 0x84501d;
  const DIM = 0x3a5670;

  // ---- spawns: team spots over the spawn pads, accent strips on the walls ----
  for (const x of [53, 67]) spot(x, 8, 10, 0xbff4ff, 9, 1.1);
  for (const x of [50.5, 69.5]) spot(x, 8, 90, 0xffe2c4, 9, 1.1);
  edgeX(48.2, 71.8, 0, 4.15, DIM_CYAN);
  edgeX(42.2, 77.8, 0, 95.85, DIM_ORANGE);
  deco(48.05, 5.5, 5, 48.15, 5.7, 15, 'trim', { color: CYAN });
  deco(71.85, 5.5, 5, 71.95, 5.7, 15, 'trim', { color: CYAN });
  deco(42.05, 5.5, 83, 42.15, 5.7, 95, 'trim', { color: ORANGE });
  deco(77.85, 5.5, 83, 77.95, 5.7, 95, 'trim', { color: ORANGE });
  // ---- Cyan corridors (cyan accents) ----
  spot(41, 5, 10.5, LAMP, 9, 1.0);
  spot(79, 11, 10.5, LAMP, 10, 1.0);
  spot(90.5, 11, 10.5, LAMP, 9, 1.0);
  edgeX(34, 46, H, 8.15, DIM_CYAN);
  edgeX(74, 86, 0, 12.85, DIM_CYAN);
  for (const z of [21, 30]) spot(67, 5, z);
  edgeZ(17.2, 34.8, 0, S.connector.x1 - 0.15, DIM_CYAN);
  sconce(S.connector.x0 + 0.02, 3.2, 20, 'x+', 0xbff4ff);
  // ---- Orange lanes (orange accents), mid corridor, stairs ----
  for (const z of [67, 75]) spot(50.5, 5, z);
  edgeZ(63.2, 80.8, 0, S.mid.x0 + 0.15, DIM);
  edgeZ(63.2, 80.8, 0, S.mid.x1 - 0.15, DIM);
  for (const x of [22, 34]) spot(x, 5, 82);
  for (const x of [84, 97]) spot(x, 5, 82);
  edgeX(17.2, 40.8, 0, 85.85, DIM_ORANGE);
  edgeX(79.2, 101.8, 0, 85.85, DIM_ORANGE);
  sconce(40.95, 3.2, 80, 'x-', 0xffe2c4);
  sconce(79.05, 3.2, 80, 'x+', 0xffe2c4);
  spot(40, 5, 68.5);
  edgeZ(53.2, 64.8, H, 35.15, DIM);
  edgeZ(53.2, 64.8, H, 42.85, DIM);
  // ---- deck run (tall): spots and a strip along the outer wall ----
  for (const z of [48, 58, 70]) spot(95, 12, z, 0xd8e8ff, 10, 1.1);
  edgeZ(41.2, 64.8, D, S.deckRun.x1 - 0.15, DIM);
  // ---- atrium: sconces on the walls under the glass, a rim light round the hole ----
  for (const x of [50, 70]) {
    sconce(x, 4, 36.02, 'z+');
    sconce(x, 4, 61.98, 'z-');
  }
  for (const z of [44, 54]) sconce(44.02, 4, z, 'x+');
  for (const z of [46, 56]) sconce(75.98, 10, z - 8, 'x-', MOON);
  // ---- A deck: sconces on the walls, screens on the consoles ----
  for (const x of [84, 100]) sconce(x, D + 3, 14.02, 'z+', 0xd8e8ff);
  for (const z of [20, 32]) sconce(109.98, D + 3, z, 'x-', 0xd8e8ff);
  deco(86.3, D + 1.2, 33.6, 89.7, D + 1.26, 34.4, 'trim', { color: SCREEN });
  deco(97.3, D + 1.2, 16.4, 100.7, D + 1.26, 17.6, 'trim', { color: SCREEN });
  light(88, D + 1.8, 33.5, SCREEN, 4, 0.6);
  light(99, D + 1.8, 17, SCREEN, 4, 0.6);
  // ---- basement: work lights, pipes along the walls, vents ----
  for (const [x, z] of [
    [17, 19],
    [33, 19],
    [17, 35],
    [33, 35],
  ])
    spot(x, 5, z, 0xffd9a0, 11, 1.05);
  deco(31.3, H + 1.2, 29.4, 34.7, H + 1.26, 30.1, 'trim', { color: 0x6dffb5 });
  light(33, H + 1.8, 29.8, 0x6dffb5, 4, 0.5);
  for (const [x, z] of [
    [48, 44],
    [72, 48],
    [50, 60],
  ])
    spot(x, -1, z, 0xffc38a, 7, 0.9);
  spot(39, -1, 47, 0xffc38a, 7, 0.9);
  spot(31, -1, 47, 0xffc38a, 7, 0.9);
  for (const z of [48, 58]) spot(22.5, -1, z, 0xffc38a, 7, 0.9);
  spot(22.5, 5, 71, LAMP, 8, 0.9);
  // pipes: two runs along the hold's north and west walls, one along the basement corridor
  deco(10.2, H + 3.2, 14.2, 42.8, H + 3.6, 14.6, 'engine');
  deco(10.2, H + 3.9, 14.2, 42.8, H + 4.2, 14.5, 'engine');
  deco(10.2, H + 3.2, 14.2, 10.6, H + 3.6, 40.8, 'engine');
  deco(S.basement.x0 + 0.2, -1.7, 42.2, S.basement.x0 + 0.55, -1.35, 64.8, 'engine');
  // vents with a faint glow in the hold's east wall
  for (const z of [18, 34]) {
    deco(42.8, H + 0.4, z - 1, 43, H + 1.4, z + 1, 'engine');
    deco(42.78, H + 0.6, z - 0.8, 42.8, H + 1.2, z + 0.8, 'trim', { color: 0x5a2a1a });
  }
  // ---- glass ceiling frame: struts across the glass (atrium: along x; A deck: along z) ----
  for (let z = 39.5; z < 62; z += 5.5) deco(43, G - 0.35, z - 0.15, 85, G, z + 0.15, 'pillar');
  deco(59.85, G - 0.4, 35, 60.15, G, 63, 'pillar');
  for (let x = 82; x < 110; x += 5.5) deco(x - 0.15, G - 0.35, 13, x + 0.15, G, 41, 'pillar');
  deco(76, G - 0.4, 26.85, 111, G, 27.15, 'pillar');
};

/** Soft moonlight under the glass and a few fills (fixtures bring their own lights). */
const ambientLights = (): LightDef[] => {
  const S = SPLIT_DECK;
  const H = S.hold;
  const out: LightDef[] = [];
  const l = (
    x: number,
    y: number,
    z: number,
    color: number,
    radius: number,
    intensity: number,
    shaft = false,
  ) => out.push({ pos: v3(x, y, z), color, radius, intensity, shaft });
  // team light on each Tower
  l(60, 7.5, 6.5, CYAN, 12, 1.4, true);
  l(60, 7.5, 93.5, ORANGE, 12, 1.4, true);
  // moonlight under the glass (atrium, gantry, A deck), a moonbeam down through the hole
  for (const [x, z] of [
    [50, 41],
    [70, 41],
    [50, 57],
    [70, 57],
    [80, 50],
  ])
    l(x, 13.2, z, MOON, 20, 0.7);
  l(60, 13, 49, MOON, 22, 0.75, true);
  l(60, H + 3.5, 49, MOON, 9, 0.5); // the moonlit spot on the pit floor
  for (const [x, z] of [
    [84, 20],
    [100, 20],
    [84, 34],
    [100, 34],
  ])
    l(x, 13.2, z, MOON, 18, 0.7);
  return out;
};

/**
 * Markings (no collision): hazard stripes around the hole and at the gates, bomb-site outlines,
 * the power-up pad, floor guide lines, Tower rings and spawn pads.
 */
const decorate = (b: LevelBuilder, spawns: SpawnDef[]): void => {
  const S = SPLIT_DECK;
  const H = S.hold;
  const D = S.deck;
  const deco = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material,
    extra: { color?: number; trim?: number } = {},
  ) => b.box(v3(x0, y0, z0), v3(x1, y1, z1), { mat, noCollide: true, ...extra });
  const strip = (x0: number, y: number, z0: number, x1: number, z1: number, color: number) =>
    deco(x0, y + 0.004, z0, x1, y + 0.02, z1, 'trim', { color });

  // hazard stripes around the hole, and a moonlit ring on the slab edge (seen from the pit)
  const HO = S.hole;
  for (let x = HO.x0; x < HO.x1; x += 2) {
    strip(x, 0, HO.z0 - 0.5, x + 1, HO.z0, HAZARD);
    strip(x, 0, HO.z1, x + 1, HO.z1 + 0.5, HAZARD);
  }
  for (let z = HO.z0; z < HO.z1; z += 2) {
    strip(HO.x0 - 0.5, 0, z, HO.x0, z + 1, HAZARD);
    strip(HO.x1, 0, z, HO.x1 + 0.5, z + 1, HAZARD);
  }
  deco(HO.x0, -0.35, HO.z0 - 0.02, HO.x1, -0.2, HO.z0, 'trim', { color: MOON });
  deco(HO.x0, -0.35, HO.z1, HO.x1, -0.2, HO.z1 + 0.02, 'trim', { color: MOON });
  // power-up pad: a small hovering frame over the hole, a marker on the pit floor below
  const P = S.powerup;
  for (const [dx0, dz0, dx1, dz1] of [
    [-0.8, -0.8, 0.8, -0.65],
    [-0.8, 0.65, 0.8, 0.8],
    [-0.8, -0.65, -0.65, 0.65],
    [0.65, -0.65, 0.8, 0.65],
  ])
    deco(P.x + dx0, P.y - 0.9, P.z + dz0, P.x + dx1, P.y - 0.8, P.z + dz1, 'trim', {
      color: 0x7dffb0,
    });
  deco(P.x - 1.2, H + 0.004, P.z - 1.2, P.x + 1.2, H + 0.02, P.z + 1.2, 'trim', {
    color: 0x2f7a55,
  });
  // bomb sites: a thin red outline on the floor, the letter's plate on a wall
  const outline = (min: Vec3, max: Vec3) => {
    strip(min.x, min.y, min.z, max.x, min.z + 0.15, SITE);
    strip(min.x, min.y, max.z - 0.15, max.x, max.z, SITE);
    strip(min.x, min.y, min.z, min.x + 0.15, max.z, SITE);
    strip(max.x - 0.15, min.y, min.z, max.x, max.z, SITE);
  };
  outline(S.bombSites.A.min, S.bombSites.A.max);
  outline(S.bombSites.B.min, S.bombSites.B.max);
  deco(92, D + 3, 14.02, 95, D + 6, 14.12, 'trim', { color: SITE });
  deco(42.88, H + 3, 26, 42.98, H + 6, 29, 'trim', { color: SITE });
  // floor guide lines toward each spawn's Tower
  strip(S.connector.x0 + 3.85, 0, 17, S.connector.x0 + 4.15, 34, CYAN);
  strip(S.mid.x0 + 5.35, 0, 64, S.mid.x0 + 5.65, 81, ORANGE);
  // hazard stripes at the gates
  for (const [x0, z0, x1, z1] of [
    [S.mid.x0 + 1, 62.2, S.mid.x0 + 7, 62.8],
    [S.deckRun.x0 + 3, 77.2, S.deckRun.x1 - 3, 77.8],
    [S.basement.x0 + 1, 77.2, S.basement.x1 - 1, 77.8],
    [36, 64.8, 42, 65.2],
  ])
    for (let x = x0; x < x1; x += 1) strip(x, 0, z0, Math.min(x1, x + 0.5), z1, HAZARD);
  // Tower rings
  for (const t of S.towers) {
    const tc = t.z < 50 ? CYAN : ORANGE;
    strip(t.x - 2.6, 0, t.z - 2.6, t.x + 2.6, t.z + 2.6, tc);
    deco(t.x - 2.45, 0.006, t.z - 2.45, t.x + 2.45, 0.025, t.z + 2.45, 'floor');
  }
  // spawn pads
  for (const sp of spawns)
    deco(
      sp.pos.x - 0.6,
      sp.pos.y + 0.004,
      sp.pos.z - 0.6,
      sp.pos.x + 0.6,
      sp.pos.y + 0.016,
      sp.pos.z + 0.6,
      'trim',
      {
        color: sp.team === 0 ? 0x0f5c6b : 0x6b3e10,
      },
    );
};

/**
 * Bot waypoints, named (map tools and tests refer to them by name). Links are two-way except
 * the drops through the atrium hole.
 */
const waypoints = (): WaypointDef[] => {
  const S = SPLIT_DECK;
  const YH = S.hold + 1;
  const YD = S.deck + 1;
  const Y0 = 1;
  const C = S.connector;
  const MC = S.mid;
  const DRX = (S.deckRun.x0 + S.deckRun.x1) / 2;
  const BCX = (S.basement.x0 + S.basement.x1) / 2;
  const wps: WaypointDef[] = [];
  const add = (name: string, x: number, y: number, z: number) =>
    wps.push({ pos: v3(x, y, z), links: [], name });
  const idx = (n: string) => {
    const i = wps.findIndex((w) => w.name === n);
    if (i < 0) throw new Error(`waypoint ${n} missing`);
    return i;
  };
  const link = (a: string, c: string, oneWay = false) => {
    wps[idx(a)].links.push(idx(c));
    if (!oneWay) wps[idx(c)].links.push(idx(a));
  };
  // Cyan spawn and its ramps
  add('cTower', 60, Y0, 10.5);
  add('cSpawnW', 50, Y0, 11);
  add('cSpawnE', 70, Y0, 11);
  add('cSpawnN', 66, Y0, 12.5);
  add('cwDoor', 47.5, Y0, 11);
  add('cwRamp', 40, -1.5, 10.5);
  add('cwLow', 32.5, YH, 10.5);
  add('bNDoor', 33, YH, 13.5);
  add('ceDoor', 72.5, Y0, 11);
  add('ceRamp', 80, 4, 10.5);
  add('ceTop', 88.5, YD, 10.5);
  add('aNDoor', 90.5, YD, 13.5);
  // connector
  add('cnDoor', (C.x0 + C.x1) / 2, Y0, 16.5);
  add('cn1', C.x0 + 4.5, Y0, 22);
  add('cn2', C.x0 + 5.5, Y0, 29);
  add('cnGate', C.x0 + 5, Y0, 35.5);
  // atrium ring around the hole
  add('atrNW', 48, Y0, 40);
  add('rimN', 60, Y0, 40.5);
  add('atrNE', 72, Y0, 39.5);
  add('atrW', 48, Y0, 49);
  add('rimW', 51, Y0, 49);
  add('atrE', 72.5, Y0, 49);
  add('rimE', 69, Y0, 49);
  add('atrSW', 48, Y0, 59);
  add('rimS', 60, Y0, 57.5);
  add('atrSE', 74, Y0, 59.5);
  add('midGate', MC.x0 + 4, Y0, 62.5);
  // gantry
  add('gBot', 80.5, Y0, 61);
  add('gRamp', 80.5, 4.6, 54);
  add('gTop', 80.5, YD, 45.5);
  add('gDoor', 80.5, YD, 40.5);
  // pit (drops through the hole land here)
  add('pitC', 60, YH, 49);
  add('pitW', 50, YH, 48);
  add('pitDoor', 44, YH, 47);
  // A deck (A site)
  add('aN', 90.5, YD, 18);
  add('aC', 93, YD, 27);
  add('aW', 80, YD, 19);
  add('aSW', 80.5, YD, 36);
  add('aSE', 97, YD, 36);
  // deck run
  add('drDoor', DRX, YD, 40.5);
  add('dr1', DRX, YD, 49);
  add('drTop', DRX, YD, 63.5);
  add('drRamp', DRX, 4, 71);
  add('drGate', DRX, Y0, 77.5);
  add('oe2', DRX, Y0, 81.5);
  add('oe1', 86, Y0, 81.5);
  add('oeDoor', 78.5, Y0, 84);
  // mid corridor + stairs
  add('mc1', MC.x0 + 5, Y0, 68);
  add('mc2', MC.x0 + 6, Y0, 77.5);
  add('mcDoor', MC.x0 + 5.5, Y0, 81.5);
  add('stDoor', 44.5, Y0, 67.75);
  add('landing', 40.5, Y0, 67.5);
  add('stGate', 39, Y0, 66);
  add('stRamp', 39, -1.5, 59);
  add('stBot', 39, YH, 51);
  add('well', 39, YH, 46.5);
  add('bSDoor', 39, YH, 41.5);
  // passage + basement corridor
  add('psE', 34.5, YH, 47);
  add('psW', S.basement.x1 + 0.5, YH, 47);
  add('bc1', BCX, YH, 47);
  add('bcDoor', BCX, YH, 41.5);
  add('bc2', BCX, YH, 57);
  add('bcLow', BCX, YH, 64);
  add('bcRamp', BCX, -1.5, 71);
  add('bcGate', BCX, Y0, 77.5);
  add('owGate', BCX, Y0, 81.5);
  add('ow1', 33, Y0, 82);
  add('owDoor', 41.5, Y0, 84);
  // B hold (B site)
  add('bN', 33, YH, 17);
  add('bC', 27, YH, 28);
  add('bNE', 39, YH, 27);
  add('bSE', 39, YH, 37);
  add('bSW', BCX, YH, 37);
  add('bW', 15, YH, 28);
  // Orange spawn
  add('oTower', 60, Y0, 89.5);
  for (const [a, c] of [
    ['cTower', 'cSpawnW'],
    ['cTower', 'cwDoor'],
    ['cTower', 'ceDoor'],
    ['cTower', 'cSpawnE'],
    ['cTower', 'cSpawnN'],
    ['cSpawnE', 'cSpawnN'],
    ['cSpawnW', 'cwDoor'],
    ['cwDoor', 'cwRamp'],
    ['cwRamp', 'cwLow'],
    ['cwLow', 'bNDoor'],
    ['bNDoor', 'bN'],
    ['cSpawnE', 'ceDoor'],
    ['ceDoor', 'ceRamp'],
    ['ceRamp', 'ceTop'],
    ['ceTop', 'aNDoor'],
    ['aNDoor', 'aN'],
    ['cSpawnN', 'cnDoor'],
    ['cnDoor', 'cn1'],
    ['cn1', 'cn2'],
    ['cn2', 'cnGate'],
    // atrium
    ['cnGate', 'rimN'],
    ['cnGate', 'atrNE'],
    ['atrNW', 'rimN'],
    ['rimN', 'atrNE'],
    ['atrNE', 'atrE'],
    ['atrE', 'rimE'],
    ['atrE', 'atrSE'],
    ['atrNW', 'atrW'],
    ['atrW', 'rimW'],
    ['atrW', 'atrSW'],
    ['atrSW', 'rimS'],
    ['rimS', 'atrSE'],
    ['atrSW', 'midGate'],
    ['midGate', 'rimS'],
    ['atrSE', 'gBot'],
    ['gBot', 'gRamp'],
    ['gRamp', 'gTop'],
    ['gTop', 'gDoor'],
    ['gDoor', 'aSW'],
    // A deck
    ['aN', 'aC'],
    ['aN', 'aW'],
    ['aW', 'aSW'],
    ['aSW', 'aC'],
    ['aC', 'aSE'],
    ['aN', 'aSE'],
    ['aN', 'drDoor'],
    ['aC', 'drDoor'],
    ['aSE', 'drDoor'],
    // deck run → east lane
    ['drDoor', 'dr1'],
    ['dr1', 'drTop'],
    ['drTop', 'drRamp'],
    ['drRamp', 'drGate'],
    ['drGate', 'oe2'],
    ['drGate', 'oeDoor'],
    ['oe2', 'oe1'],
    ['oe1', 'oeDoor'],
    ['oeDoor', 'oTower'],
    // mid corridor, stairs, stairwell, pit
    ['midGate', 'mc1'],
    ['mc1', 'mc2'],
    ['mc2', 'mcDoor'],
    ['mcDoor', 'oTower'],
    ['mc1', 'stDoor'],
    ['stDoor', 'landing'],
    ['landing', 'stGate'],
    ['stGate', 'stRamp'],
    ['stRamp', 'stBot'],
    ['stBot', 'well'],
    ['well', 'bSDoor'],
    ['bSDoor', 'bSE'],
    ['well', 'pitDoor'],
    ['pitDoor', 'pitW'],
    ['pitW', 'pitC'],
    ['well', 'psE'],
    ['psE', 'psW'],
    ['psW', 'bc1'],
    ['bc1', 'bcDoor'],
    ['bcDoor', 'bSW'],
    ['bc1', 'bc2'],
    ['bc2', 'bcLow'],
    ['bcLow', 'bcRamp'],
    ['bcRamp', 'bcGate'],
    ['bcGate', 'owGate'],
    ['owGate', 'ow1'],
    ['ow1', 'owDoor'],
    ['owDoor', 'bcGate'],
    ['owDoor', 'oTower'],
    // B hold
    ['bN', 'bC'],
    ['bN', 'bNE'],
    ['bNE', 'bSE'],
    ['bSE', 'bC'],
    ['bSW', 'bC'],
    ['bN', 'bSW'],
    ['bSW', 'bW'],
    ['bW', 'bC'],
  ])
    link(a, c);
  // drops through the atrium hole (no way back up without the jetpack)
  link('rimN', 'pitC', true);
  link('rimS', 'pitC', true);
  return wps;
};
