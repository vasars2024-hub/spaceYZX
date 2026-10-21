// "Colossus Yard" — the big Brawl map (TDM / FFA with instant respawns, rules/brawl.ts; also the
// offline Deathmatch practice): an orbital drydock at golden-hour sunrise over a planet,
// 240 × 200 m (world x -120..120 east, z -100..100 south; the deck is y 0). Mirror-symmetric
// across x = 0: the west half (x < 0) holds team 0's 16 TDM start spawns, the east half team 1's;
// in FFA and for every respawn all 32 are used. Everything is authored for the west half and
// mirrored (things on the middle line are built once, symmetric about x = 0).
//
//   THE HULL (x -48..48, z -16.6..16.6)  the half-built titan warship: open rib frames every 12 m
//        (x 0, ±12, ±24, ±36, ±48; posts at |z| 16, arches 22 m up), half-plated DECK 1 (y 5:
//        full over x -12..12 and x ±24..±36, side strips elsewhere), DECK 2 (y 10: side galleries
//        at |z| 10..15.4 behind 1 m rails, full across the end bays, cross bridges at x ±21..±25)
//        and the SPINE DECK (y 15, |z| < 3, kick rails) along the whole top — a long-range perch.
//        Ramps: ground → deck 1 in the end bays (x ±36..±46), deck 2 → spine (x ±11..±21, both
//        sides of the spine). The keel hall under it: keel blocks, plating with doors in the end
//        bays, two spawn shelters.
//   SCAFFOLD TOWERS (x ±27..±44, |z| 17.2..23.5)  four stairwells (switchbacks 0 → 5 → 10 → 15,
//        in at the outer end) with gangways into deck 1, deck 2 and across to the spine.
//   CONTAINER YARD (north, z -80..-50)  canyons of stacked containers (1–3 high, 2.6 m each),
//        walkable tops by wedge ramps; the GANTRY CRANE straddles its middle: clad stair legs at
//        x ±24..±40 (z -74.8..-69.2), boom deck at y 16 (z -69.5..-66.5, x -39..39) with a
//        trolley deck in the middle (power-up). Launch pads at x ±49, z -68 throw you onto it.
//   SOUTH YARD (z 50..90)  two HAMMERHEAD CRANES (clad stair masts at x ±54..±70, z 61..67;
//        booms at y 16, z 66.5..69.5, x ±38..±80), a zip-rail between their inner tips (hand
//        height 19.5, z 68, x -41..41: jump for it from a boom's tip), launch pads beyond their
//        outer tips (x ±91), fuel tanks in a bund (x ±95..±111), containers, a pump house.
//   HANGARS (x ±76..±108, |z| < 24)  12 m tall, a big door toward the hull, side and back doors;
//        parked fighters inside as cover, two spawn shelters (site offices) at the back.
//   APRONS  open deck north (z -50..-24) and south (z 24..50) of the hull, and between the hangar
//        doors and the hull ends: movement fights, scattered half cover.
//   FREIGHT LINE (the perimeter band: |z| 91..99, |x| 111..119)  flatcars on the track (half
//        cover) and a zip-rail over it (hand height 4.6: jump for it from a flatcar's top) on each
//        side: north (x -115..115 along z -95, down the west and east bands to z -30) and south
//        (mirrored in z).
//   EDGE  a 1 m plinth with a glass blast screen (3.2 m) all round; the two PIERS (x ±76..±84,
//        z -114..-99) are open at the end (a power-up near each end): off the edge it is a long
//        way down — a kill volume below y -12 (LevelDef.killVolumes).
//   SPAWNS  32 sealed shelters (roofed huts with an open door at each end and a blast screen in
//        front of each door: two ways out, each around either end of its screen; no line of
//        sight reaches the spawn point from outside): perimeter bays along the freight line,
//        hangar offices, the keel hall, container-yard huts, a pump house and the crane bases.
import { v3 } from '../../math/vec3';
import { LevelBuilder, wedgeRamp } from '../builder';
import type {
  BoxDef,
  LaunchPadDef,
  LevelDef,
  LightDef,
  Material,
  RailDef,
  SpawnDef,
  WaypointDef,
} from '../types';

const CYAN = 0x19e3ff;
const ORANGE = 0xff8a1f;
const PAD = 0xffc15a;

// golden-hour drydock palette
const DECK = 0x6d717a;
const BAND = 0x4a4e57;
const EDGE = 0x363b45;
const GLASS = 0x9fd3f0;
const PIER = 0x5b5f68;
const HAZARD = 0xf2c230;
const RIB = 0x9a5b3a;
const PRIMER = 0xa8653f;
const INDECK = 0x7b7f87;
const SPINE = 0x8c9098;
const RAMPC = 0x80858d;
const SCAF = 0xe0a93a;
const SHEET = 0x4a7a86;
const CLAD = 0xd9a126;
const CRANE = 0xf0b429;
const CRANE_DARK = 0x2d3139;
const KEEL = 0x5a4636;
const HANGAR = 0x596069;
const HANGAR_ROOF = 0x3a3e47;
const FIGHTER = 0x3b4350;
const CANOPY = 0x7fc4ff;
const TANK = 0xdcd6c8;
const BUND = 0x77736a;
const SHELTER = 0xc9ced4;
const SHELTER_ROOF = 0x474c56;
const SCREEN = 0x8d939c;
const FLATCAR = 0x7a3b2a;
const LAMP = 0xffd28a;
const CONT = [0xb5452e, 0x2d6d8e, 0x3d7d49, 0xd4862a, 0x8b8e95, 0x6a3e78, 0xc9b27a];

/** Key coordinates (the plan). The east half mirrors the west (x → -x, teams swapped). */
export const COLOSSUS_YARD = {
  halfX: 120,
  halfZ: 100,
  /** the perimeter freight band: |z| 91..99 north / south, |x| 111..119 east / west */
  band: { inner: 91, outer: 99, innerX: 111, outerX: 119 },
  /** hand height of the freight-line zip-rails (you hang 1.1 m under it) */
  freightRailY: 4.6,
  /** below this you are dead (the void under the platform) */
  killY: -12,
  hull: {
    x: 48,
    z: 16.6,
    ribs: [0, 12, 24, 36, 48],
    deck1: 5,
    deck2: 10,
    spine: 15,
    /** half width of the spine deck */
    spineHalf: 3,
  },
  /** scaffold towers (west ones; mirrored): flights x -40..-31, lanes |z| 17.2..23.2 */
  scaffold: { x0: -40, z0: 17.2 },
  /** crane booms: deck height, gantry (north, middle) and hammerheads (south, x ±62) */
  boomY: 16,
  gantry: { cx: 32, cz: -72, x: 39.25, trolley: { x: 6, z0: -76, z1: -61 } },
  hammer: { cx: 62, cz: 64, x0: 38, x1: 80 },
  /** the zip-rail between the hammerheads' inner tips (hand height) */
  craneRail: { y: 19.5, z: 68, x: 41 },
  /** piers (west one; mirrored): open at the north end */
  pier: { x0: -84, x1: -76, z0: -114 },
  hangar: { x0: -108, x1: -76, z: 24, height: 12 },
  /** launch pads: west ones (mirrored) — along the gantry boom, and onto the hammerhead's boom */
  pads: {
    gantry: { pos: v3(-49, 0, -68), vel: v3(9, 27.5, 0) },
    hammer: { pos: v3(-91, 0, 68), vel: v3(9, 27.5, 0) },
  },
  powerups: [v3(0, 16, 0), v3(0, 17, -68.5), v3(-80, 1, -108), v3(80, 1, -108), v3(0, 1, 76)],
};

type Extra = Omit<BoxDef, 'c' | 'h' | 'mat'>;

/** a spawn shelter: centre, which way its doors face (along x or z), and the spawn's facing */
export interface ColossusShelter {
  name: string;
  x: number;
  z: number;
  along: 'x' | 'z';
  yaw: number;
  /** look: wall material and colour */
  mat?: Material;
  color?: number;
  /**
   * bots: how far out to the side the ways round the screens are (default 5.6: far enough that
   * a bot coming from behind a screen is past its end before it turns in), on the -v / +v side
   */
  outA?: number;
  outB?: number;
  /** bots: only this side has waypoints round the screens (the other is a tight corridor) */
  only?: 'a' | 'b';
}

/**
 * The 16 west shelters (mirrored east). Inner room 7 × 4 m, 3 m high, roofed; a 2 m doorway in
 * the middle of each end, and a 4 m blast screen (4.2 m tall) 3.3 m in front of it: out round
 * either end of either screen. No straight line from outside reaches the spawn point.
 */
export const COLOSSUS_SHELTERS: ColossusShelter[] = [
  // perimeter bays along the north / south freight line
  { name: 'N1', x: -98, z: -86, along: 'x', yaw: -90, outB: 5.2 },
  { name: 'N2', x: -60, z: -86, along: 'x', yaw: -90, outB: 5.2 },
  { name: 'N3', x: -22, z: -86, along: 'x', yaw: -90, outB: 5.2 },
  { name: 'S1', x: -98, z: 86, along: 'x', yaw: -90 },
  { name: 'S2', x: -60, z: 86, along: 'x', yaw: -90 },
  { name: 'S3', x: -22, z: 86, along: 'x', yaw: -90 },
  // west band, north and south of the hangar
  { name: 'W1', x: -104, z: -38, along: 'z', yaw: 180 },
  { name: 'W2', x: -104, z: 38, along: 'z', yaw: 0 },
  // hangar site offices (back corners)
  { name: 'H1', x: -99, z: -15, along: 'x', yaw: -90, color: 0xb9c2cc },
  { name: 'H2', x: -99, z: 15, along: 'x', yaw: -90, color: 0xb9c2cc },
  // the keel hall under the hull's end bay
  { name: 'K1', x: -42, z: -10.6, along: 'x', yaw: -90, mat: 'hull', color: PRIMER, only: 'b' },
  { name: 'K2', x: -42, z: 10.6, along: 'x', yaw: -90, mat: 'hull', color: PRIMER, only: 'a' },
  // container-yard huts
  { name: 'C1', x: -62, z: -66.5, along: 'x', yaw: -90, mat: 'crate', color: CONT[1] },
  { name: 'C2', x: -94, z: -55.5, along: 'x', yaw: -90, mat: 'crate', color: CONT[3] },
  // south yard: pump house by the fuel tanks, hut at the hammerhead's base
  { name: 'F1', x: -88, z: 58, along: 'z', yaw: 0 },
  { name: 'F2', x: -62, z: 55, along: 'x', yaw: -90, outB: 5.2 },
];

/** shelter dimensions: inner half length / half width, wall, height, screen gap / half length */
export const SHELTER_SIZE = { L: 3.5, W: 2, T: 0.4, H: 3, door: 1, gap: 3.3, screen: 2, sh: 4.2 };
const SH = SHELTER_SIZE;

/** stair landings' depth (the scaffold towers, the crane masts): bots turn on them */
const STAIR_LANDING = 3.5;

/** containers: [x0, z0, along, stack colours bottom-up] — west half, 12 × 2.5 × 2.6 m each */
const CONTAINERS: [number, number, 'x' | 'z', number[]][] = [
  // north yard, row 1 (z -80..-75)
  [-106, -80, 'x', [0, 3]],
  [-106, -77.5, 'x', [1, 5]],
  [-90, -80, 'x', [2]],
  [-90, -77.5, 'x', [4]],
  [-74, -80, 'x', [5, 0, 2]],
  [-74, -77.5, 'x', [6, 1]],
  [-58, -80, 'x', [3, 6]],
  [-58, -77.5, 'x', [0, 4]],
  [-46, -80, 'z', [2]],
  // row 2 (z -69..-64; the shelter C1 in the third slot, the fourth one is the pad's lane)
  [-104, -69, 'x', [2, 4]],
  [-104, -66.5, 'x', [5]],
  [-88, -69, 'x', [1, 3]],
  [-88, -66.5, 'x', [6, 0]],
  // row 3 (z -58..-53; the shelter C2 in the first slot)
  [-82, -58, 'x', [4, 2]],
  [-82, -55.5, 'x', [5]],
  [-64, -58, 'x', [6, 0]],
  [-64, -55.5, 'x', [3]],
  [-48, -58, 'x', [1]],
  // under the gantry
  [-22, -80, 'x', [2]],
  [-20, -64, 'x', [4, 1]],
  // the aprons' edges
  [-100, -48, 'x', [2]],
  [-62, -46, 'x', [4]],
  [-24, -48, 'x', [2, 0]],
  [-60, 40, 'x', [1]],
  [-24, 44, 'x', [3, 5]],
  // between the hangar door and the hull's end
  [-68, -21, 'z', [0, 2]],
  [-68, 9, 'z', [5]],
  // south yard: columns along z west of the middle, pairs along x near it
  [-51.5, 51, 'z', [0, 5]],
  [-49, 51, 'z', [3]],
  [-51.5, 68, 'z', [1, 6]],
  [-49, 68, 'z', [2]],
  [-40.5, 52, 'z', [4]],
  [-38, 52, 'z', [6, 1]],
  [-40.5, 68, 'z', [5, 3]],
  [-38, 68, 'z', [0]],
  [-80, 72, 'x', [3, 0]],
  [-80, 74.5, 'x', [4]],
  [-28, 54, 'x', [6]],
  [-28, 56.5, 'x', [2, 4]],
  [-30, 76, 'x', [0, 2]],
  [-16, 77, 'x', [5]],
];

/** wedge ramps up onto container tops: [axis, from, to, yFrom, yTo, across, width] (west) */
const CONTAINER_RAMPS: ['x' | 'z', number, number, number, number, number, number][] = [
  // onto row 1's flat pair (x -90..-78) from the canyon
  ['z', -70, -75, 0, 2.6, -84, 3],
  // onto row 3 (x -82..-70, 1-high side) from the north apron, then onto its 2-high neighbour
  ['z', -48, -53, 0, 2.6, -71.5, 3],
  ['x', -77, -82, 2.6, 5.2, -54.25, 2.5],
  // south yard: onto the 1-high one of the pair (x -28..-16) from the east
  ['x', -11, -16, 0, 2.6, 55.25, 2.5],
];

type AddFn = (
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  mat: Material,
  extra?: Extra,
) => void;
type MidFn = (
  hx: number,
  y0: number,
  z0: number,
  y1: number,
  z1: number,
  mat: Material,
  extra?: Extra,
) => void;
type RampFn = (
  axis: 'x' | 'z',
  from: number,
  to: number,
  yFrom: number,
  yTo: number,
  across: number,
  width: number,
  extra: Omit<BoxDef, 'c' | 'h'>,
) => void;
type WedgeFn = (
  axis: 'x' | 'z',
  from: number,
  to: number,
  yFrom: number,
  yTo: number,
  across: number,
  width: number,
  extra: Omit<BoxDef, 'c' | 'h' | 'q' | 'prism'>,
) => void;
type LightFn = (x: number, y: number, z: number, color: number, radius: number, k: number) => void;

interface Kit {
  add: AddFn;
  /** a west-half box and its mirror across x = 0 */
  sym: AddFn;
  /** a box on the middle line, symmetric about x = 0 (half width `hx`) */
  mid: MidFn;
  /** decoration (no collision), mirrored */
  deco: (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material,
    color: number,
  ) => void;
  /** a slab ramp and its mirror */
  rampS: RampFn;
  /** a solid wedge ramp and its mirror */
  wedgeS: WedgeFn;
  /** a light and its mirror */
  light: LightFn;
}

export const buildColossusYard = (): LevelDef => {
  const C = COLOSSUS_YARD;
  const b = new LevelBuilder();
  const lights: LightDef[] = [];

  const add: AddFn = (x0, y0, z0, x1, y1, z1, mat, extra = {}) =>
    void b.box(
      v3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      v3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
      { mat, ...extra },
    );
  const sym: AddFn = (x0, y0, z0, x1, y1, z1, mat, extra = {}) => {
    add(x0, y0, z0, x1, y1, z1, mat, extra);
    add(-x0, y0, z0, -x1, y1, z1, mat, extra);
  };
  const k: Kit = {
    add,
    sym,
    mid: (hx, y0, z0, y1, z1, mat, extra = {}) => add(-hx, y0, z0, hx, y1, z1, mat, extra),
    deco: (x0, y0, z0, x1, y1, z1, mat, color) =>
      sym(x0, y0, z0, x1, y1, z1, mat, { color, noCollide: true }),
    rampS: (axis, from, to, yFrom, yTo, across, width, extra) => {
      b.ramp(axis, from, to, yFrom, yTo, across, width, extra);
      if (axis === 'x') b.ramp(axis, -from, -to, yFrom, yTo, across, width, extra);
      else b.ramp(axis, from, to, yFrom, yTo, -across, width, extra);
    },
    wedgeS: (axis, from, to, yFrom, yTo, across, width, extra) => {
      b.boxes.push(wedgeRamp(axis, from, to, yFrom, yTo, across, width, extra));
      if (axis === 'x') b.boxes.push(wedgeRamp(axis, -from, -to, yFrom, yTo, across, width, extra));
      else b.boxes.push(wedgeRamp(axis, from, to, yFrom, yTo, -across, width, extra));
    },
    light: (x, y, z, color, radius, intensity) => {
      lights.push({ pos: v3(x, y, z), color, radius, intensity });
      if (x !== 0) lights.push({ pos: v3(-x, y, z), color, radius, intensity });
    },
  };

  buildDeck(k);
  buildFreightLine(k);
  buildHull(k);
  buildScaffolds(k);
  buildCranes(k);
  buildHangar(k);
  buildYards(k);
  buildScenery(k);

  // ======================= spawn shelters =======================
  const spawns: SpawnDef[] = [];
  for (const s of COLOSSUS_SHELTERS) {
    buildShelter(k, s);
    spawns.push({ pos: v3(s.x, 0, s.z), yawDeg: s.yaw, team: 0 });
    spawns.push({ pos: v3(-s.x, 0, s.z), yawDeg: s.along === 'x' ? -s.yaw : s.yaw, team: 1 });
    // a team-colour lamp inside each shelter (the west ones cyan, the east ones orange)
    lights.push({ pos: v3(s.x, 2.6, s.z), color: CYAN, radius: 6, intensity: 0.9 });
    lights.push({ pos: v3(-s.x, 2.6, s.z), color: ORANGE, radius: 6, intensity: 0.9 });
  }

  // ======================= launch pads =======================
  // (the volume reaches 1.6 m ahead in the throw's direction: whoever steps on it leaves it
  // through the top, however they came in, so every throw is the same height)
  const launchPads: LaunchPadDef[] = [];
  for (const p of [C.pads.gantry, C.pads.hammer])
    for (const s of [1, -1]) {
      const x = s * p.pos.x;
      const ax = [x - s * 0.8, x + s * 1.6];
      launchPads.push({
        min: v3(Math.min(...ax), 0, p.pos.z - 0.8),
        max: v3(Math.max(...ax), 2.5, p.pos.z + 0.8),
        vel: v3(s * p.vel.x, p.vel.y, p.vel.z),
      });
      const px = [x - s * 1.1, x + s * 1.9];
      add(Math.min(...px), 0, p.pos.z - 1.1, Math.max(...px), 0.08, p.pos.z + 1.1, 'trim', {
        color: PAD,
        noCollide: true,
      });
      lights.push({ pos: v3(x, 1.2, p.pos.z), color: PAD, radius: 6, intensity: 0.9 });
    }

  // ======================= zip-rails =======================
  const R = C.freightRailY;
  const railX = (C.band.innerX + C.band.outerX) / 2;
  const railZ = (C.band.inner + C.band.outer) / 2;
  const rails: RailDef[] = [];
  for (const n of [-1, 1])
    rails.push({
      points: [
        v3(-railX, R, n * 30),
        v3(-railX, R, n * railZ),
        v3(railX, R, n * railZ),
        v3(railX, R, n * 30),
      ],
    });
  const CR = C.craneRail;
  rails.push({ points: [v3(-CR.x, CR.y, CR.z), v3(CR.x, CR.y, CR.z)] });

  return b.build({
    name: 'Colossus Yard',
    boundsMin: v3(-C.halfX - 1, C.killY - 2, C.pier.z0 - 1),
    boundsMax: v3(C.halfX + 1, 26, C.halfZ + 1),
    defaultGravity: v3(0, -1, 0),
    zones: [],
    rails,
    pads: [],
    spawns,
    towers: [],
    waypoints: waypoints(),
    areas: [
      { name: 'West hangar', pos: v3(-84, 0, 0), yawDeg: -90 },
      { name: 'East hangar', pos: v3(84, 0, 0), yawDeg: 90 },
      { name: 'Keel hall', pos: v3(-30, 0, 5), yawDeg: -90 },
      { name: 'Spine deck', pos: v3(-20, C.hull.spine, 0), yawDeg: -90 },
      { name: 'Gantry boom', pos: v3(-20, C.boomY, -68), yawDeg: -90 },
      { name: 'West hammerhead', pos: v3(-50, C.boomY, 68), yawDeg: -90 },
      { name: 'North yard', pos: v3(-66, 0, -72), yawDeg: -90 },
      { name: 'South yard', pos: v3(-30, 0, 66), yawDeg: -90 },
      { name: 'North apron', pos: v3(-30, 0, -36), yawDeg: 180 },
      { name: 'West pier', pos: v3(-80, 0, -104), yawDeg: 0 },
    ],
    fog: { color: 0xf0a860, near: 110, far: 540 },
    // (a faint team tint on each half: the TDM sides, without losing the sunrise)
    sideTint: { neg: 0x1d6a80, pos: 0x86501f, amount: 0.06 },
    ambient: 1.02,
    lights,
    powerups: C.powerups,
    launchPads,
    killVolumes: [{ min: v3(-3000, -2000, -3000), max: v3(3000, C.killY, 3000) }],
    outdoor: {
      top: 0x1d3270,
      horizon: 0xf0a860,
      ground: 0x24406e,
      sun: { dir: v3(0.12, 0.07, -1), color: 0xffe2a6, sizeDeg: 6 },
      sunLight: 0xffc98e,
    },
  });
};

/** The platform: deck, freight band, edge plinth with its glass screen, the two piers. */
const buildDeck = ({ sym, mid, deco }: Kit): void => {
  const C = COLOSSUS_YARD;
  const { inner, outer, innerX, outerX } = C.band;
  const P = C.pier;
  const E = { color: EDGE };
  const G = { color: GLASS, seeThrough: true };
  // main deck (four big plates) and the freight band round it
  sym(-innerX, -2, -inner, 0, 0, 0, 'plate', { color: DECK });
  sym(-innerX, -2, 0, 0, 0, inner, 'plate', { color: DECK });
  for (const n of [-1, 1]) sym(-outerX, -2, n * inner, 0, 0, n * outer, 'grate', { color: BAND });
  sym(-outerX, -2, -inner, -innerX, 0, inner, 'grate', { color: BAND });
  // the edge plinth (1 m up) with a glass blast screen on it; gaps for the piers
  sym(-C.halfX, -2, -outer, -outerX, 1, outer, 'hull', E);
  sym(-C.halfX + 0.35, 1, -outer, -outerX - 0.35, 3.2, outer, 'skyglass', G);
  mid(C.halfX, -2, outer, 1, C.halfZ, 'hull', E);
  mid(C.halfX - 0.35, 1, outer + 0.35, 3.2, C.halfZ - 0.35, 'skyglass', G);
  sym(-C.halfX, -2, -C.halfZ, P.x0, 1, -outer, 'hull', E);
  sym(-C.halfX + 0.35, 1, -C.halfZ + 0.35, P.x0, 3.2, -outer - 0.35, 'skyglass', G);
  mid(-P.x1, -2, -C.halfZ, 1, -outer, 'hull', E);
  mid(-P.x1, 1, -C.halfZ + 0.35, 3.2, -outer - 0.35, 'skyglass', G);
  // the piers: a deck out over the void, curbs and glass on the sides, open at the end
  sym(P.x0, -2, P.z0, P.x1, 0, -outer, 'plate', { color: PIER });
  for (const [a, c] of [
    [P.x0, P.x0 + 0.6],
    [P.x1 - 0.6, P.x1],
  ] as const) {
    sym(a, 0, P.z0 + 0.6, c, 1, -C.halfZ, 'hull', E);
    sym(a + 0.15, 1, P.z0 + 0.6, c - 0.15, 3.2, -C.halfZ, 'skyglass', G);
  }
  // hazard stripes at the pier's open end
  deco(P.x0, 0, P.z0, P.x1, 0.03, P.z0 + 0.6, 'glow', HAZARD);
  // the underside of the platform (far scenery: one quad a face)
  sym(-C.halfX + 4, -9, -C.halfZ + 4, 0, -2, C.halfZ - 4, 'hull', {
    color: 0x2a2e36,
    noCollide: true,
    lowDetail: true,
  });
};

/** The freight line: flatcars on the band, rail gantries holding the zip-rails. */
const buildFreightLine = ({ sym, light }: Kit): void => {
  const C = COLOSSUS_YARD;
  const { inner, outer, innerX, outerX } = C.band;
  const railZ = (inner + outer) / 2;
  const railX = (innerX + outerX) / 2;
  const car = { color: FLATCAR };
  const dark = { color: CRANE_DARK };
  for (const n of [-1, 1]) {
    // flatcars (1.2 m: half cover; the zip-rail riders pass over them)
    for (const x of [-106, -66, -34])
      sym(x, 0, n * (railZ - 1.5), x + 12, 1.2, n * (railZ + 1.5), 'crate', car);
    // rail gantries: a post on the inner edge of the band and an arm over the rail
    for (const x of [-100, -52, -8]) {
      sym(x - 0.25, 0, n * (inner + 0.1), x + 0.25, 5.4, n * (inner + 0.6), 'pillar', dark);
      sym(x - 0.2, 5, n * (inner + 0.6), x + 0.2, 5.4, n * (railZ + 0.6), 'pillar', dark);
      light(x, 4.2, n * (inner + 1), LAMP, 9, 0.6);
    }
    const z = n > 0 ? 48 : -60;
    sym(-railX - 1.5, 0, z, -railX + 1.5, 1.2, z + 12, 'crate', car);
    const zp = n * 50;
    sym(-innerX - 0.6, 0, zp - 0.25, -innerX - 0.1, 5.4, zp + 0.25, 'pillar', dark);
    sym(-railX - 0.6, 5, zp - 0.2, -innerX - 0.6, 5.4, zp + 0.2, 'pillar', dark);
  }
};

/**
 * The titan's hull: ribs, keel blocks, deck 1 (y 5), deck 2 galleries (y 10), the spine
 * (y 15), the ramps between them, side plating and the keel hall.
 */
const buildHull = ({ sym, mid, rampS, wedgeS, light }: Kit): void => {
  const H = COLOSSUS_YARD.hull;
  const Z = H.z;
  const post = 0.6;
  const zi = Z - 2 * post; // 15.4: inner face of the rib posts
  const ribOpt = { color: RIB };
  const deco = { color: RIB, noCollide: true };
  // ribs: posts at |z| 15.4..16.6 up to the arch (y 21..22), a beam under the spine
  for (const x of H.ribs) {
    const put = (y0: number, z0: number, y1: number, z1: number, extra: Extra) =>
      x === 0
        ? mid(post, y0, z0, y1, z1, 'pillar', extra)
        : sym(-x - post, y0, z0, -x + post, y1, z1, 'pillar', extra);
    put(0, -Z, 22, -zi, ribOpt);
    put(0, zi, 22, Z, ribOpt);
    put(21, -zi, 22, zi, ribOpt);
    put(H.spine - 1.6, -H.spineHalf, H.spine - 0.6, H.spineHalf, ribOpt);
    // shoulder gussets under the arch (decoration)
    put(18.5, -zi, 21, -zi + 2.5, deco);
    put(18.5, zi - 2.5, 21, zi, deco);
  }
  // keel blocks along the middle (full cover in the keel hall)
  mid(1.2, 0, -1.5, 2.2, 1.5, 'wood', { color: KEEL });
  for (const x of [12, 24]) sym(-x - 1.2, 0, -1.5, -x + 1.2, 2.2, 1.5, 'wood', { color: KEEL });

  // deck 1 (y 5): full over x -12..12 and the x ±24..±36 bays, side strips elsewhere
  const d1 = { color: INDECK };
  const y1 = H.deck1;
  mid(12, y1 - 0.6, -zi, y1, zi, 'plate', d1);
  for (const n of [-1, 1]) sym(-48, y1 - 0.6, n * 8, -12, y1, n * zi, 'plate', d1);
  sym(-36, y1 - 0.6, -8, -24, y1, 8, 'plate', d1);
  // ground → deck 1: a solid wedge in the end bay's middle, rising toward the middle
  wedgeS('x', -46, -36, 0, y1, 0, 4, { mat: 'plate', color: RAMPC });

  // deck 2 (y 10): side galleries the whole length, cross bridges at x ±21..±25, full across the
  // end bays
  const y2 = H.deck2;
  for (const n of [-1, 1]) mid(48, y2 - 0.6, n * 10, y2, n * zi, 'plate', d1);
  sym(-25, y2 - 0.6, -10, -21, y2, 10, 'plate', d1);
  // (full across the end bays, where the scaffold gangways come in)
  sym(-48, y2 - 0.6, -10, -36, y2, 10, 'plate', d1);
  // railings on the galleries' inner edges (half cover), open where the bridges cross
  const rail = { color: RIB };
  for (const n of [-1, 1]) {
    sym(-36, y2, n * 10, -25, y2 + 1, n * 10.25, 'panel', rail);
    mid(21, y2, n * 10, y2 + 1, n * 10.25, 'panel', rail);
  }
  // deck 2 → spine: ramps both sides of the spine, and a landing at their tops
  const ys = H.spine;
  const sh = H.spineHalf;
  for (const n of [-1, 1]) {
    rampS('x', -21, -11, y2, ys, n * (sh + 2), 4, { mat: 'grate', color: RAMPC });
    // railings along both sides (1 m over the ramp)
    for (const e of [sh + 0.1, sh + 3.9])
      rampS('x', -21, -11, y2 + 1, ys + 1, n * e, 0.2, { mat: 'grate', color: RAMPC });
    sym(-11, ys - 0.6, n * sh, -8, ys, n * (sh + 4), 'grate', { color: RAMPC });
  }
  // the spine deck
  mid(48, ys - 0.6, -sh, ys, sh, 'plate', { color: SPINE });
  // kick rails along the spine's edges (half cover), open where the ramps' landings and the
  // scaffold gangways join it
  const sr = { color: RIB };
  for (const n of [-1, 1]) {
    const e0 = n * (sh - 0.25);
    const e1 = n * sh;
    sym(-48, ys, e0, -30.25, ys + 1, e1, 'panel', sr);
    sym(-28.25, ys, e0, -11, ys + 1, e1, 'panel', sr);
    mid(8, ys, e0, ys + 1, e1, 'panel', sr);
  }
  // half cover on the spine (crates of rivets and plate)
  const crate = { color: 0x7d6a4f };
  sym(-44, ys, -sh + 0.25, -42.5, ys + 1.1, -sh + 1.75, 'crate', crate);
  sym(-36.8, ys, sh - 1.75, -35.3, ys + 1.1, sh - 0.25, 'crate', crate);
  sym(-19, ys, -sh + 0.25, -17.5, ys + 1.1, -sh + 1.75, 'crate', crate);
  sym(-5.5, ys, -0.75, -4, ys + 1.1, 0.75, 'crate', crate);

  // side plating (primer) on the end bays and the x ±12..±24 bays, below deck 2; a ground-floor
  // door in the middle of each plated bay
  const pl = { color: PRIMER };
  for (const [a, c] of [
    [-47.4, -36.6],
    [-23.4, -12.6],
  ] as const) {
    const m = (a + c) / 2;
    for (const n of [-1, 1]) {
      const zz0 = n * 15.7;
      const zz1 = n * 16.3;
      sym(a, 0, zz0, m - 1.75, y1 - 0.6, zz1, 'hull', pl);
      sym(m + 1.75, 0, zz0, c, y1 - 0.6, zz1, 'hull', pl);
      sym(m - 1.75, 3, zz0, m + 1.75, y1 - 0.6, zz1, 'hull', pl);
      sym(a, y1, zz0, c, y2 - 0.6, zz1, 'hull', pl);
    }
  }
  // work lamps: the keel hall, deck 1, the spine
  for (const x of [-42, -30, -18, -6]) light(x, 3.8, 0, LAMP, 11, 0.8);
  for (const x of [-42, -18]) for (const z of [-11.5, 11.5]) light(x, 8.6, z, LAMP, 10, 0.6);
  for (const x of [-36, -12]) light(x, 17, 0, LAMP, 12, 0.7);
};

/**
 * Four scaffold towers beside the hull (switchbacks 0 → 5 → 10 → 15) and their gangways. Each
 * is a stairwell: a wall between the two lanes, sheeting on the outer side and both ends (the
 * west end open below 3 m: the way in), landings 3.5 m deep (bots turn on them).
 */
const buildScaffolds = ({ sym, rampS, wedgeS }: Kit): void => {
  const H = COLOSSUS_YARD.hull;
  const S = COLOSSUS_YARD.scaffold;
  const L = STAIR_LANDING;
  const x0 = S.x0;
  const xa = x0 + 9; // the east end of the flights
  const g = { mat: 'grate' as Material, color: SCAF };
  const sheet = { color: SHEET };
  const zi = H.z - 1.2;
  for (const n of [-1, 1]) {
    const zA = n * (S.z0 + 1.425); // lane A (next to the hull)
    const zB = n * (S.z0 + 4.575); // lane B
    const z0 = n * S.z0;
    const z1 = n * (S.z0 + 6);
    wedgeS('x', x0, xa, 0, H.deck1, zA, 2.85, g);
    sym(xa, H.deck1 - 0.4, z0, xa + L, H.deck1, z1, 'grate', g);
    rampS('x', xa, x0, H.deck1, H.deck2, zB, 2.85, g);
    sym(x0 - L, H.deck2 - 0.4, z0, x0, H.deck2, z1, 'grate', g);
    rampS('x', x0, xa, H.deck2, H.spine, zA, 2.85, g);
    sym(xa, H.spine - 0.4, z0, xa + L, H.spine, z1, 'grate', g);
    // gangways: deck 1 and deck 2 through the hull's side, the spine across the top
    sym(xa + 0.75, H.deck1 - 0.4, n * zi, xa + 2.75, H.deck1, z0, 'grate', g);
    sym(x0 - 2.75, H.deck2 - 0.4, n * zi, x0 - 0.75, H.deck2, z0, 'grate', g);
    sym(xa + 0.75, H.spine - 0.4, n * H.spineHalf, xa + 2.75, H.spine, z0, 'grate', g);
    // (railings along the spine gangway, 15 m up)
    for (const [r0, r1] of [
      [xa + 0.75, xa + 1],
      [xa + 2.5, xa + 2.75],
    ] as const)
      sym(r0, H.spine, n * H.spineHalf, r1, H.spine + 1, z0, 'panel', { color: SCAF });
    // corner posts (outside the landings)
    const top = H.spine + 1.2;
    for (const [px0, px1] of [
      [x0 - L - 0.3, x0 - L],
      [xa + L, xa + L + 0.3],
    ] as const)
      for (const [pz0, pz1] of [
        [S.z0, S.z0 + 0.3],
        [S.z0 + 5.7, S.z0 + 6],
      ] as const)
        sym(px0, 0, n * pz0, px1, top, n * pz1, 'pillar', { color: SCAF });
    sym(x0, 0, n * (S.z0 + 2.85), xa, H.deck2 + 1, n * (S.z0 + 3.15), 'panel', sheet);
    // no way in under the second flight and the first landing (nowhere to get lost or hide)
    sym(x0, 0, n * (S.z0 + 3.15), x0 + 0.3, H.deck2 - 1, z1, 'panel', sheet);
    sym(xa, 0, z0, xa + L, H.deck1 - 0.4, z1, 'panel', sheet);
    sym(x0 - L - 0.6, 0, z1, xa + L + 0.6, top, n * (S.z0 + 6.3), 'panel', sheet);
    sym(x0 - L - 0.6, 3, z0, x0 - L - 0.3, top, z1, 'panel', sheet);
    sym(xa + L + 0.3, 0, z0, xa + L + 0.6, top, z1, 'panel', sheet);
  }
};

/**
 * One stair tower (a crane's leg / mast), west-half coordinates: flights along x between
 * cx-3.75 and cx+3.75, lane A at z cz-2.5..cz-0.15, lane B at z cz+0.15..cz+2.5 (a wall
 * between); 0 → 4 → 8 → 12 → 16 over landings 3.5 m deep, and a top deck at 16 (the boom joins
 * lane B's outer side, z cz+2.5). Clad all round (the west end open below 3 m: the way in).
 */
const stairTower = ({ sym, rampS, wedgeS }: Kit, cx: number, cz: number, top: number): void => {
  const g = { mat: 'grate' as Material, color: CRANE };
  const L = STAIR_LANDING;
  const a0 = cx - 3.75;
  const a1 = cx + 3.75;
  const zA = cz - 1.325;
  const zB = cz + 1.325;
  const step = top / 4;
  wedgeS('x', a0, a1, 0, step, zA, 2.35, g);
  sym(a1, step - 0.4, cz - 2.5, a1 + L, step, cz + 2.5, 'grate', g);
  rampS('x', a1, a0, step, 2 * step, zB, 2.35, g);
  sym(a0 - L, 2 * step - 0.4, cz - 2.5, a0, 2 * step, cz + 2.5, 'grate', g);
  rampS('x', a0, a1, 2 * step, 3 * step, zA, 2.35, g);
  sym(a1, 3 * step - 0.4, cz - 2.5, a1 + L, 3 * step, cz + 2.5, 'grate', g);
  rampS('x', a1, a0, 3 * step, top, zB, 2.35, g);
  // the top deck: lane A whole length, lane B's two ends (the last flight comes up between)
  sym(a0 - L, top - 0.4, cz - 2.5, a1 + L, top, cz, 'grate', g);
  sym(a0 - L, top - 0.4, cz, a0, top, cz + 2.5, 'grate', g);
  sym(a1, top - 0.4, cz, a1 + L, top, cz + 2.5, 'grate', g);
  // corner posts (the tower's frame), outside the landings
  const p = { color: CRANE_DARK };
  for (const [px0, px1] of [
    [a0 - L - 0.3, a0 - L],
    [a1 + L, a1 + L + 0.3],
  ] as const) {
    sym(px0, 0, cz - 2.5, px1, top + 1, cz - 2.2, 'pillar', p);
    sym(px0, 0, cz + 2.2, px1, top, cz + 2.5, 'pillar', p);
  }
  // the wall between the lanes, and the cladding (lane B's side stops under the boom)
  const clad = { color: CLAD };
  const w0 = a0 - L - 0.6;
  const w1 = a1 + L + 0.6;
  sym(a0, 0, cz - 0.15, a1, 3 * step + 1, cz + 0.15, 'panel', p);
  // no way in under the second flight and the first landing
  sym(a0, 0, cz + 0.15, a0 + 0.3, 2 * step - 1, cz + 2.5, 'panel', clad);
  sym(a1, 0, cz - 2.5, a1 + L, step - 0.4, cz + 2.5, 'panel', clad);
  sym(w0, 0, cz - 2.8, w1, top + 1, cz - 2.5, 'panel', clad);
  sym(w0, 0, cz + 2.5, w1, top - 0.6, cz + 2.8, 'panel', clad);
  sym(w0, 3, cz - 2.5, w0 + 0.3, top + 1, cz + 2.5, 'panel', clad);
  sym(w1 - 0.3, 0, cz - 2.5, w1, top + 1, cz + 2.5, 'panel', clad);
};

/** Boom railings (1 m, half cover) along both sides of a boom deck from x0 to x1 (x0 < x1). */
const boomRails = ({ sym }: Kit, x0: number, x1: number, z0: number, z1: number, y: number) => {
  const r = { color: CRANE };
  sym(x0, y, z0, x1, y + 1, z0 + 0.25, 'panel', r);
  sym(x0, y, z1 - 0.25, x1, y + 1, z1, 'panel', r);
};

/** The gantry crane over the north yard and the two south hammerheads. */
const buildCranes = (k: Kit): void => {
  const { sym, mid, deco, light } = k;
  const C = COLOSSUS_YARD;
  const Y = C.boomY;
  const boom = { color: CRANE };
  const dark = { color: CRANE_DARK };
  const girder = { color: CRANE, noCollide: true };
  // ---- the gantry: two stair legs, the boom between them, a trolley deck in the middle
  const G = C.gantry;
  stairTower(k, -G.cx, G.cz, Y);
  const bz0 = G.cz + 2.5;
  const bz1 = G.cz + 5.5;
  const T = G.trolley;
  sym(-G.x, Y - 0.6, bz0, -T.x, Y, bz1, 'grate', boom);
  mid(T.x, Y - 0.6, T.z0, Y, T.z1, 'grate', boom);
  boomRails(k, -G.cx + 7.85, -T.x, bz0, bz1, Y);
  // the trolley deck's railings (open where the boom joins it)
  const r = { color: CRANE };
  mid(T.x, Y, T.z0, Y + 1, T.z0 + 0.25, 'panel', r);
  mid(T.x, Y, T.z1 - 0.25, Y + 1, T.z1, 'panel', r);
  sym(-T.x, Y, T.z0 + 0.25, -T.x + 0.25, Y + 1, bz0, 'panel', r);
  sym(-T.x, Y, bz1, -T.x + 0.25, Y + 1, T.z1 - 0.25, 'panel', r);
  // the trolley: a cab on the deck (full cover) and the hoist hanging under it
  mid(1.5, Y, T.z0 + 1, Y + 2.4, T.z0 + 4, 'panel', dark);
  mid(2.5, Y + 2.4, T.z0 + 0.5, Y + 2.8, T.z0 + 4.5, 'panel', boom);
  mid(0.08, 6, T.z1 - 3.08, Y - 0.6, T.z1 - 2.92, 'pillar', { ...dark, noCollide: true });
  mid(0.9, 5, T.z1 - 3.9, 6, T.z1 - 2.1, 'panel', girder);
  // the legs' cross girders (decoration high over the boom)
  sym(-G.x - 0.6, Y + 4, G.cz - 2.5, -G.cx + 7.85, Y + 5, G.cz - 1.5, 'pillar', girder);
  mid(G.cx - 7.85, Y + 4, G.cz - 2.5, Y + 5, G.cz - 1.5, 'pillar', girder);
  light(-G.cx, Y + 3, G.cz, LAMP, 14, 0.8);
  light(-T.x, Y + 2, (T.z0 + T.z1) / 2, LAMP, 12, 0.7);

  // ---- the hammerheads: one stair mast each, a boom across both sides of it
  const M = C.hammer;
  stairTower(k, -M.cx, M.cz, Y);
  const hz0 = M.cz + 2.5;
  const hz1 = M.cz + 5.5;
  sym(-M.x1, Y - 0.6, hz0, -M.x0, Y, hz1, 'grate', boom);
  boomRails(k, -M.x1 + 3, -M.cx - 7.85, hz0, hz1, Y);
  boomRails(k, -M.cx + 7.85, -M.x0 - 3, hz0, hz1, Y);
  // the operator's cab on the mast top (full cover), the mast's apex and the jib tie
  sym(-M.cx - 2, Y, M.cz - 2.5, -M.cx + 2, Y + 2.4, M.cz - 0.5, 'panel', dark);
  sym(-M.cx - 1, Y + 2.4, M.cz - 1.8, -M.cx + 1, Y + 9, M.cz - 0.2, 'pillar', girder);
  sym(-M.x1 + 2, Y + 9, hz0 + 1, -M.x0 - 2, Y + 9.6, hz1 - 1, 'pillar', girder);
  // the hook block hanging from the outer arm
  deco(-M.x1 + 6, 4, hz0 + 1.42, -M.x1 + 6.16, Y - 0.6, hz0 + 1.58, 'pillar', CRANE_DARK);
  deco(-M.x1 + 5, 3, hz0 + 0.6, -M.x1 + 7.2, 4, hz0 + 2.4, 'panel', CRANE);
  light(-M.cx, Y + 3, M.cz, LAMP, 14, 0.8);
  light(-M.x0 - 2, Y + 1.5, (hz0 + hz1) / 2, LAMP, 10, 0.6);
  light(-M.x1 + 2, Y + 1.5, (hz0 + hz1) / 2, LAMP, 10, 0.6);
};

/** The hangars: walls, roof, doors, parked fighters (cover). */
const buildHangar = ({ sym, deco, light }: Kit): void => {
  const { x0, x1, z: hz, height: ht } = COLOSSUS_YARD.hangar;
  const w = { color: HANGAR };
  const t = 0.8;
  // back wall (a door to the freight line), front wall (the big door), side walls (a door each)
  sym(x0, 0, -hz, x0 + t, ht, -3, 'panel', w);
  sym(x0, 0, 3, x0 + t, ht, hz, 'panel', w);
  sym(x0, 4, -3, x0 + t, ht, 3, 'panel', w);
  sym(x1 - t, 0, -hz, x1, ht, -10, 'panel', w);
  sym(x1 - t, 0, 10, x1, ht, hz, 'panel', w);
  sym(x1 - t, 9, -10, x1, ht, 10, 'panel', w);
  for (const n of [-1, 1]) {
    const za = n * hz;
    const zb = n * (hz - t);
    sym(x0 + t, 0, za, -96, ht, zb, 'panel', w);
    sym(-88, 0, za, x1 - t, ht, zb, 'panel', w);
    sym(-96, 5, za, -88, ht, zb, 'panel', w);
  }
  sym(x0, ht, -hz, x1, ht + 1, hz, 'hull', { color: HANGAR_ROOF });
  // a hazard frame over the big door
  deco(x1, 9, -10, x1 + 0.1, 9.4, 10, 'glow', HAZARD);
  // parked fighters: fuselage (full cover), wings (half cover), canopy, fin, engine
  const fighter = (cx: number, cz: number) => {
    sym(cx - 4, 0, cz - 1.1, cx + 4, 2.2, cz + 1.1, 'hull', { color: FIGHTER });
    sym(cx - 1.5, 0, cz - 5, cx + 1.5, 1.1, cz - 1.1, 'hull', { color: 0x4a5261 });
    sym(cx - 1.5, 0, cz + 1.1, cx + 1.5, 1.1, cz + 5, 'hull', { color: 0x4a5261 });
    sym(cx + 1, 2.2, cz - 0.7, cx + 3, 2.9, cz + 0.7, 'skyglass', { color: CANOPY });
    // (the fin stands 2.2 m over the fuselage's top: full cover for whoever climbs up there)
    sym(cx - 4, 2.2, cz - 0.15, cx - 2.4, 4.4, cz + 0.15, 'hull', { color: FIGHTER });
    sym(cx - 4.6, 0.4, cz - 0.8, cx - 4, 1.8, cz + 0.8, 'engine', {
      color: 0xff9a4a,
      noCollide: true,
    });
  };
  fighter(-84, -12.5);
  fighter(-84, 12.5);
  fighter(-95, 0);
  for (const z of [-12, 0, 12]) light(-86, 11, z, LAMP, 13, 0.8);
};

/** The yards: containers, wedges up onto them, fuel tanks, apron cover. */
const buildYards = ({ sym, mid, wedgeS, light }: Kit): void => {
  const CH = 2.6;
  const C5 = COLOSSUS_YARD.hull.deck1;
  for (const [x0, z0, along, stack] of CONTAINERS) {
    const [dx, dz] = along === 'x' ? [12, 2.5] : [2.5, 12];
    stack.forEach((ci, lv) =>
      sym(x0, lv * CH, z0, x0 + dx, (lv + 1) * CH, z0 + dz, 'crate', { color: CONT[ci] }),
    );
  }
  for (const [axis, from, to, yFrom, yTo, across, width] of CONTAINER_RAMPS)
    wedgeS(axis, from, to, yFrom, yTo, across, width, { mat: 'grate', color: SCAF });
  // under the gantry, on the middle line
  mid(6, 0, -80, CH, -77.5, 'crate', { color: CONT[4] });
  mid(6, CH, -80, 2 * CH, -77.5, 'crate', { color: CONT[0] });
  mid(6, 0, -60, CH, -57.5, 'crate', { color: CONT[2] });
  // the open middle: a container on the south rail yard, a barrier on the north apron, crates on
  // deck 1 (under the spine)
  mid(6, 0, 63, CH, 65.5, 'crate', { color: CONT[3] });
  mid(2, 0, -32.5, 1.1, -31.5, 'crate', { color: 0xd0c24a });
  mid(2, 0, 29.5, 1.1, 30.5, 'crate', { color: 0xd0c24a });
  sym(-4.2, C5, -1.2, -1.8, C5 + 1.1, 1.2, 'crate', { color: 0x7d6a4f });

  // fuel tanks in their bund (south-west), a low bund wall with a gap toward the pump house
  for (const z of [57, 70]) {
    sym(-108, 0, z - 5, -98, 9, z + 5, 'panel', { color: TANK });
    sym(-107.5, 9, z - 4.5, -98.5, 9.6, z + 4.5, 'panel', { color: 0xbfb8a8 });
  }
  const bd = { color: BUND };
  sym(-110.6, 0, 49, -110.2, 1, 78, 'panel', bd);
  sym(-110.2, 0, 49, -95.4, 1, 49.4, 'panel', bd);
  sym(-110.2, 0, 77.6, -95.4, 1, 78, 'panel', bd);
  sym(-95.4, 0, 49, -95, 1, 60, 'panel', bd);
  sym(-95.4, 0, 67, -95, 1, 78, 'panel', bd);
  // a pipe bridge from the tanks to the pump house (over head height)
  sym(-98, 4, 62.6, -91.2, 4.6, 63.4, 'pillar', { color: 0xbfb8a8, noCollide: true });
  light(-96, 6, 63.5, LAMP, 10, 0.6);

  // apron cover: cargo pallets and barriers (half), a tug, a fuel bowser (full)
  const half = (x: number, z: number, sx: number, sz: number, color = 0x8a6b45) =>
    sym(x - sx / 2, 0, z - sz / 2, x + sx / 2, 1.1, z + sz / 2, 'crate', { color });
  half(-12, -36, 2.4, 2.4);
  half(-36, -46, 2.4, 2.4);
  half(-54, -28, 2.4, 2.4);
  half(-22, -29, 4, 1, 0xd0c24a);
  half(-40, -38, 1, 4, 0xd0c24a);
  half(-68, -44, 4, 1, 0xd0c24a);
  half(-14, 36, 2.4, 2.4);
  half(-3, 52, 2.4, 2.4);
  half(-6, -44, 2.4, 2.4);
  half(-32, 42, 2.4, 2.4);
  half(-50, 32, 1, 4, 0xd0c24a);
  half(-24, 29, 4, 1, 0xd0c24a);
  half(-78, 49, 2.4, 2.4);
  // between the hangar door and the hull's end
  half(-60, -6, 3, 2, 0x4f5c6b); // a tug
  sym(-64, 0, 3, -56, 2.6, 5.8, 'crate', { color: 0x9aa3ad }); // a fuel bowser
  sym(-63.5, 2.6, 3.4, -57, 3.2, 5.4, 'crate', { color: 0x7f8891 });
  half(-56, 14, 2.4, 2.4);
  half(-58, -18, 2.4, 2.4);
  // north of the hangar (by W1) and south (by W2)
  half(-80, -34, 2.4, 2.4);
  half(-86, 36, 2.4, 2.4);
  sym(-96, 0, 30, -84, CH, 32.5, 'crate', { color: CONT[2] });
  sym(-96, 0, -32.5, -84, CH, -30, 'crate', { color: CONT[5] });
  // apron flood lights
  for (const z of [-36, 36]) light(-30, 7, z, LAMP, 16, 0.6);
};

/** Far scenery: cloud banks over the planet far below, a sister drydock far off. */
const buildScenery = ({ add, mid }: Kit): void => {
  const far = (color: number) => ({ color, noCollide: true, lowDetail: true });
  // the planet's cloud tops, lit gold by the sunrise (far below the platform)
  mid(520, -170, -520, -160, 520, 'cloud', far(0xf6d3a0));
  add(-460, -140, -380, -200, -128, -180, 'cloud', far(0xffe0b3));
  add(200, -140, -380, 460, -128, -180, 'cloud', far(0xffe0b3));
  add(-420, -150, 160, -160, -138, 420, 'cloud', far(0xe9c9a0));
  add(160, -150, 160, 420, -138, 420, 'cloud', far(0xe9c9a0));
  // a sister drydock far off to the north (a silhouette against the sunrise)
  mid(60, -30, -470, -18, -430, 'hull', far(0x3a3440));
  mid(8, -18, -462, 30, -438, 'hull', far(0x3a3440));
  mid(40, 30, -452, 33, -448, 'hull', far(0x3a3440));
};

/** A spawn shelter (see COLOSSUS_SHELTERS): walls, lintels, roof, the two blast screens. */
const buildShelter = ({ sym }: Kit, s: ColossusShelter): void => {
  const { L, W, T, H, door, gap, screen, sh } = SH;
  const mat = s.mat ?? 'panel';
  const w = { color: s.color ?? SHELTER };
  // (u along the doors' axis, v across it)
  const put = (
    u0: number,
    y0: number,
    v0: number,
    u1: number,
    y1: number,
    v1: number,
    m: Material,
    e: Extra,
  ) =>
    s.along === 'x'
      ? sym(s.x + u0, y0, s.z + v0, s.x + u1, y1, s.z + v1, m, e)
      : sym(s.x + v0, y0, s.z + u0, s.x + v1, y1, s.z + u1, m, e);
  put(-L - T, 0, -W - T, L + T, H, -W, mat, w);
  put(-L - T, 0, W, L + T, H, W + T, mat, w);
  for (const [u0, u1] of [
    [-L - T, -L],
    [L, L + T],
  ]) {
    put(u0, 0, -W, u1, H, -door, mat, w);
    put(u0, 0, door, u1, H, W, mat, w);
  }
  put(-L - T, H, -W - T, L + T, H + 0.4, W + T, 'hull', { color: SHELTER_ROOF });
  const u = L + T + gap;
  put(-u - T, 0, -screen, -u, sh, screen, 'panel', { color: SCREEN });
  put(u, 0, -screen, u + T, sh, screen, 'panel', { color: SCREEN });
};

// ======================= waypoints =======================

/**
 * Bot waypoints (feet + 1), named: authored for the west half and mirrored ('…W' / '…E'); nodes
 * on the middle line have no suffix. Many places come in a north and a south copy ('…N' / '…S',
 * mirrored in z). Links are straight lines a bot can walk (bots never use the launch pads or
 * the zip-rails: every high place has stairs).
 */
const waypoints = (): WaypointDef[] => {
  const wps: WaypointDef[] = [];
  const onMid = new Set<string>();
  const add = (base: string, x: number, feet: number, z: number) => {
    if (x === 0) {
      onMid.add(base);
      wps.push({ pos: v3(0, feet + 1, z), links: [], name: base });
      return;
    }
    wps.push({ pos: v3(x, feet + 1, z), links: [], name: `${base}W` });
    wps.push({ pos: v3(-x, feet + 1, z), links: [], name: `${base}E` });
  };
  /** a north copy at z (< 0) and a south copy at -z */
  const addZ = (base: string, x: number, feet: number, z: number) => {
    add(`${base}N`, x, feet, z);
    add(`${base}S`, x, feet, -z);
  };
  const idx = new Map<string, number>();
  const find = (name: string) => {
    if (idx.size !== wps.length) {
      idx.clear();
      wps.forEach((w, i) => idx.set(w.name!, i));
    }
    const i = idx.get(name);
    if (i === undefined) throw new Error(`waypoint ${name} missing`);
    return i;
  };
  const one = (i: number, j: number) => {
    if (!wps[i].links.includes(j)) wps[i].links.push(j);
    if (!wps[j].links.includes(i)) wps[j].links.push(i);
  };
  const pairs = (a: string, c: string): [string, string][] => {
    const am = onMid.has(a);
    const cm = onMid.has(c);
    if (am && cm) return [[a, c]];
    if (am)
      return [
        [a, `${c}W`],
        [a, `${c}E`],
      ];
    if (cm)
      return [
        [`${a}W`, c],
        [`${a}E`, c],
      ];
    return [
      [`${a}W`, `${c}W`],
      [`${a}E`, `${c}E`],
    ];
  };
  const link = (a: string, c: string) => {
    for (const [p, q] of pairs(a, c)) one(find(p), find(q));
  };
  const chain = (...names: string[]) => {
    for (let i = 1; i < names.length; i++) link(names[i - 1], names[i]);
  };
  /** the same chain in the north and the south copy */
  const chainZ = (...names: string[]) => {
    chain(...names.map((n) => `${n}N`));
    chain(...names.map((n) => `${n}S`));
  };
  /** a mirrored pair linked straight across the middle line */
  const cross = (a: string) => one(find(`${a}W`), find(`${a}E`));

  const H = COLOSSUS_YARD.hull;
  const Y = COLOSSUS_YARD.boomY;

  // ---- shelters: both door gaps, a way out round each end of each screen (no way through:
  // the spawn rooms are left, never crossed)
  // (a0 / a1: the -z (or -x) side of the screens, b0 / b1 the other side)
  for (const s of COLOSSUS_SHELTERS) {
    // (the door gaps' nodes are 2.4 m out from the doors: a bot leaving turns for the way round
    // the screen only once it is through the door)
    const g = SH.L + SH.T + SH.gap - 0.9;
    const outA = s.outA ?? 5.6;
    const outB = s.outB ?? 5.6;
    const at = (u: number, v: number): [number, number] =>
      s.along === 'x' ? [s.x + u, s.z + v] : [s.x + v, s.z + u];
    const n = s.name;
    const put = (name: string, [x, z]: [number, number]) => add(name, x, 0, z);
    put(`${n}g0`, at(-g, 0));
    put(`${n}g1`, at(g, 0));
    for (const [side, v] of [
      ['a', -outA],
      ['b', outB],
    ] as const) {
      if (s.only && s.only !== side) continue;
      put(`${n}${side}0`, at(-g, v));
      put(`${n}${side}1`, at(g, v));
      link(`${n}g0`, `${n}${side}0`);
      link(`${n}g1`, `${n}${side}1`);
    }
  }

  // ---- the freight band (north and south) and the west band; the piers
  const bandX = [-112.3, -97, -88, -72, -60, -46, -34, -22, -11];
  bandX.forEach((x, i) => addZ(`b${i}`, x, 0, -92.3));
  addZ('bM', 0, 0, -92.3);
  chainZ(...bandX.map((_, i) => `b${i}`), 'bM');
  add('pr0', -80, 0, -97.5);
  add('pr1', -80, 0, -104);
  add('pr2', -80, 0, -109);
  chain('b2N', 'pr0', 'pr1', 'pr2');
  link('b3N', 'pr0');
  const westZ = [-78, -62, -46, -30, -15];
  westZ.forEach((z, i) => addZ(`w${i + 1}`, -112.3, 0, z));
  add('w0', -112.3, 0, 0);
  chainZ('b0', 'w1', 'w2', 'w3', 'w4', 'w5');
  link('w5N', 'w0');
  link('w5S', 'w0');
  // perimeter shelters onto the band (round the rail gantries' posts)
  chain('b0N', 'N1a0');
  chain('N1a1', 'b1N');
  chain('N1a1', 'b2N');
  chain('b3N', 'N2a0', 'b4N', 'N2a1');
  chain('b6N', 'N3a0', 'b7N', 'N3a1', 'b8N');
  chain('b0S', 'S1b0');
  chain('S1b1', 'b1S');
  chain('S1b1', 'b2S');
  chain('b3S', 'S2b0', 'b4S', 'S2b1');
  chain('b6S', 'S3b0', 'b7S', 'S3b1', 'b8S');

  // ---- the north container yard
  add('y0a', -109, 0, -81.4);
  add('y0b', -92, 0, -81.4);
  add('y0c', -76, 0, -81.4);
  add('y0d', -60, 0, -81.4);
  add('y0e', -40, 0, -81.4);
  add('y0M', 0, 0, -81.4);
  chain('y0a', 'N1b0', 'N1b1', 'y0b', 'y0c', 'N2b0', 'y0d', 'N2b1', 'y0e', 'N3b0', 'N3b1', 'y0M');
  link('y0a', 'w1N');
  // canyon 1 (z -75..-69), with the wedge onto row 1's flat pair
  add('k1a', -108, 0, -72);
  add('k1b', -92, 0, -72);
  add('rfoot', -84, 0, -69.6);
  add('r1top', -84, 2.6, -77.5);
  add('k1c', -76, 0, -72);
  add('k1d', -60, 0, -72.5);
  add('k1e', -51.5, 0, -72);
  add('k1t', -41.7, 0, -72);
  chain('k1a', 'k1b', 'rfoot', 'k1c', 'k1d', 'k1e');
  chain('rfoot', 'r1top');
  chain('C1a0', 'k1d', 'C1a1');
  chain('y0a', 'k1a', 'w1N');
  link('y0b', 'k1b');
  link('y0d', 'k1d');
  link('y0e', 'k1t');
  // canyon 2 (z -64..-58)
  add('k2a', -107, 0, -61);
  add('k2b', -90, 0, -61);
  add('k2b2', -85, 0, -61);
  add('k2d', -51.5, 0, -61);
  add('k2e', -40, 0, -62.5);
  add('k2f', -24, 0, -59.5);
  add('k2g', -14, 0, -60.2);
  add('k2M', 0, 0, -60.8);
  chain('k2a', 'C2a0', 'C2a1', 'k2b', 'k2b2', 'C1b0', 'C1b1', 'k2d', 'k2e', 'k2f', 'k2g', 'k2M');
  chain('w2N', 'k2a', 'k1a');
  link('k2b', 'k1b');
  link('k1e', 'k2d');
  link('k1t', 'k2e');
  // row 3 and the apron's edge, the wedges onto row 3 (up to 5.2 m)
  add('a3a', -108, 0, -50.5);
  add('a3b', -86, 0, -50.5);
  add('a3r', -71.5, 0, -46.5);
  add('r3a', -71.5, 2.6, -54.2);
  add('r3b', -76.2, 2.6, -54.25);
  add('r3c', -81.9, 5.15, -54.25);
  add('r3top', -81.5, 5.2, -56.75);
  add('a3c', -66, 0, -50.5);
  add('a3d', -50, 0, -51);
  add('a3f', -24, 0, -51.5);
  add('a3M', 0, 0, -52);
  chain('a3a', 'C2b0', 'C2b1', 'a3b', 'a3r', 'a3c', 'a3d', 'a3f', 'a3M');
  chain('a3r', 'r3a', 'r3b', 'r3c', 'r3top');
  chain('w3N', 'a3a', 'k2a');
  link('a3b', 'k2b2');
  link('a3c', 'C1b0');
  link('a3d', 'k2d');
  link('a3f', 'k2f');

  // ---- the gantry: one leg's stairs (lane A at z -73.25, lane B at -70.75), boom, trolley
  add('tw0', -37.5, 0, -73.25);
  add('twT1', -28.05, 4, -73.25);
  add('tw1', -25.75, 4, -73.25);
  add('tw1b', -25.75, 4, -70.75);
  add('twT2', -35.95, 8, -70.75);
  add('tw2', -38.25, 8, -70.75);
  add('tw2b', -38.25, 8, -73.25);
  add('twT3', -28.05, 12, -73.25);
  add('tw3', -25.75, 12, -73.25);
  add('tw3b', -25.75, 12, -70.75);
  add('twT4', -35.95, Y, -70.75);
  add('tw4', -38.25, Y, -70.75);
  add('bm0', -38.25, Y, -68);
  add('bm1', -28, Y, -68);
  add('bm2', -14, Y, -68);
  add('bmM', 0, Y, -67);
  chain('k1t', 'tw0', 'twT1', 'tw1', 'tw1b', 'twT2', 'tw2', 'tw2b', 'twT3', 'tw3', 'tw3b');
  chain('tw3b', 'twT4', 'tw4', 'bm0', 'bm1', 'bm2', 'bmM');

  // ---- the west band side: W1 / W2 shelters, the hangar
  chain('W1a0', 'w3N');
  chain('W1a1', 'w4N');
  chain('W2a0', 'w4S');
  chain('W2a1', 'w3S');
  link('W1a0', 'a3a');
  // the hangar: back door, site offices, fighters, side doors, the big door
  add('hB', -105, 0, 0);
  addZ('hW', -105, 0, -7);
  addZ('hC', -89, 0, -5);
  addZ('hE', -79.5, 0, -19);
  addZ('hD', -92, 0, -21.5);
  addZ('hO', -98, 0, -27);
  add('hF', -79.5, 0, 0);
  chain('w0', 'hB');
  chain('hB', 'hWN', 'H1b0');
  chain('hB', 'hWS', 'H2a0');
  chain('H1b1', 'hCN', 'hF', 'hCS', 'H2a1');
  link('hCN', 'hCS');
  chain('hF', 'hEN', 'hDN', 'H1a1');
  chain('hF', 'hES', 'hDS', 'H2b1');
  chain('H1a0', 'hDN');
  chain('H2b0', 'hDS');
  chain('hDN', 'hON', 'W1b1');
  chain('hDS', 'hOS', 'W2b0');
  link('hON', 'W1b0');

  // ---- between the hangar door and the hull's end
  add('wz0', -72, 0, 0);
  add('wzc', -58, 0, -1);
  addZ('wza', -72, 0, -14);
  addZ('wzb', -70, 0, -26);
  addZ('wzg', -62, 0, -24);
  add('wzdN', -62, 0, -14);
  add('wzdS', -61, 0, 12);
  addZ('kh1', -51, 0, -5);
  add('wf', -47.5, 0, 0);
  chain('hF', 'wz0', 'wzc', 'wf');
  chain('wz0', 'wzaN', 'wzbN', 'wzgN');
  chain('wz0', 'wzaS', 'wzbS', 'wzgS');
  chain('wzgN', 'wzdN', 'kh1N');
  chain('wzgS', 'wzdS', 'kh1S');
  chain('wzc', 'kh1N');
  chain('wzc', 'kh1S');
  chain('kh1N', 'wf', 'kh1S');

  // ---- the hull: keel hall (y 0), deck 1 (5), deck 2 (10), spine (15)
  addZ('kh2', -42, 0, -4.5);
  addZ('kh3', -30, 0, -6);
  addZ('kh4', -18, 0, -6);
  addZ('kh5', -6, 0, -6);
  chainZ('kh1', 'kh2', 'kh3', 'kh4', 'kh5');
  cross('kh5N');
  cross('kh5S');
  link('kh3N', 'kh3S');
  link('kh4N', 'kh4S');
  // the K shelters (in the end bay) and the hull's side openings / doors
  chain('kh2N', 'K1b0');
  chain('kh2N', 'K1b1');
  chain('kh2S', 'K2a0');
  chain('kh2S', 'K2a1');
  addZ('hd2', -42, 0, -15);
  addZ('hx3', -25.6, 0, -19.5);
  addZ('hx3o', -25.2, 0, -26);
  addZ('hx4', -18, 0, -19);
  addZ('hx5', -6, 0, -19);
  chainZ('kh3', 'hx3', 'hx3o');
  chainZ('kh4', 'hx4');
  chainZ('kh5', 'hx5');
  // deck 1: up the wedge in the end bay
  add('d1a', -34, H.deck1, 0);
  addZ('d1b', -29.25, H.deck1, -11.5);
  addZ('d1c', -18, H.deck1, -11.5);
  addZ('d1d', -6, H.deck1, -6);
  addZ('d1e', -42, H.deck1, -11.5);
  chain('wf', 'd1a');
  link('d1a', 'd1bN');
  link('d1a', 'd1bS');
  chainZ('d1e', 'd1b', 'd1c', 'd1d');
  cross('d1dN');
  cross('d1dS');
  link('d1dN', 'd1dS');
  // deck 2: galleries, the cross bridge, the ramps up to the spine
  addZ('d2a', -41.75, H.deck2, -12.7);
  addZ('d2b', -23, H.deck2, -12.7);
  add('d2c', -23, H.deck2, 0);
  addZ('d2d', -6, H.deck2, -12.7);
  addZ('r2f', -22, H.deck2, -5);
  addZ('r2t', -9.5, H.spine, -5);
  chainZ('d2a', 'd2b', 'd2d');
  cross('d2dN');
  cross('d2dS');
  link('d2bN', 'd2c');
  link('d2bS', 'd2c');
  link('d2c', 'r2fN');
  link('d2c', 'r2fS');
  chainZ('r2f', 'r2t');
  // the spine
  add('sp1', -45, H.spine, 0.5);
  add('sp2', -29.25, H.spine, 0);
  add('sp3', -10, H.spine, 0.9);
  add('spM', 0, H.spine, 2);
  chain('sp1', 'sp2', 'sp3', 'spM');
  link('r2tN', 'sp3');
  link('r2tS', 'sp3');
  // the scaffold towers (lane A next to the hull at |z| 18.7, lane B at |z| 21.7)
  // (a node at the top of each flight, then one at the landing's far end: bots turn there)
  addZ('sGo', -45.5, 0, -18.7);
  addZ('sG', -42, 0, -18.7);
  addZ('sT1', -30.8, H.deck1, -18.7);
  addZ('sL5a', -28.8, H.deck1, -18.7);
  addZ('sL5b', -28.8, H.deck1, -21.7);
  addZ('sT2', -40.2, H.deck2, -21.7);
  addZ('sL10b', -42.5, H.deck2, -21.7);
  addZ('sL10a', -42.5, H.deck2, -18.7);
  addZ('sT3', -30.8, H.spine, -18.7);
  addZ('sL15', -28, H.spine, -19.5);
  addZ('gw', -29.25, H.spine, -16.5);
  chainZ('sGo', 'sG', 'sT1', 'sL5a', 'sL5b', 'sT2', 'sL10b', 'sL10a', 'd2a');
  chainZ('sL10a', 'sT3', 'sL15');
  chainZ('sL5a', 'd1b');
  chainZ('sL15', 'gw');
  link('gwN', 'sp2');
  link('gwS', 'sp2');
  chainZ('hd2', 'sG');

  // ---- the north apron
  add('ap1', -88, 0, -40);
  add('ap2', -74, 0, -38);
  add('ap3', -58, 0, -38);
  add('ap4', -46, 0, -30);
  add('ap5', -32, 0, -36);
  add('ap6', -18, 0, -40);
  add('ap7', -8, 0, -28);
  add('apM', 0, 0, -40);
  chain('W1b0', 'ap1', 'ap2', 'ap3', 'ap4', 'ap5', 'ap6', 'apM');
  chain('ap6', 'ap7', 'apM');
  chain('ap5', 'ap7');
  link('a3b', 'ap1');
  link('a3r', 'ap2');
  link('a3d', 'ap4');
  link('a3f', 'ap5');
  link('a3M', 'apM');
  link('ap2', 'wzbN');
  link('ap3', 'wzgN');
  link('ap4', 'sGoN');
  link('ap5', 'hx3oN');
  link('ap6', 'hx4N');
  link('ap7', 'hx5N');

  // ---- the south apron
  add('sa0', -93, 0, 47);
  add('sa1', -86, 0, 44);
  add('sa2', -72, 0, 38);
  add('sa3', -56, 0, 47);
  add('sa8', -55, 0, 35);
  add('sa9', -40, 0, 48);
  add('sa4', -42, 0, 38);
  add('sa5', -30, 0, 34);
  add('sa6', -18, 0, 38);
  add('sa7', -6, 0, 46);
  add('saM', 0, 0, 40);
  chain('W2b1', 'sa1', 'sa2', 'sa3', 'sa9', 'sa5', 'sa6', 'sa7', 'saM');
  chain('sa2', 'sa8', 'sa4', 'sa5');
  chain('sa9', 'sa6', 'saM');
  chain('sa0', 'sa1');
  link('sa2', 'wzbS');
  link('sa8', 'wzgS');
  link('sa4', 'sGoS');
  link('sa5', 'hx3oS');
  link('sa6', 'hx4S');
  link('sa6', 'hx5S');
  link('saM', 'hx5S');

  // ---- the south yard: the pump house, the hammerhead, container columns
  add('s0a', -109, 0, 81.6);
  add('s0b', -84, 0, 81.6);
  add('s0c', -43.5, 0, 81.6);
  add('s0M', 0, 0, 81.6);
  chain('s0a', 'S1a0', 'S1a1', 's0b', 'S2a0', 'S2a1', 's0c', 'S3a0', 'S3a1', 's0M');
  link('s0a', 'w1S');
  // the hammerhead's mast stairs (lane A at z 62.75, lane B at 65.25) and its boom
  add('ht01', -71.5, 0, 59.5);
  add('ht00', -71.3, 0, 62.75);
  add('ht0', -67.5, 0, 62.75);
  add('htT1', -58.05, 4, 62.75);
  add('ht1', -55.75, 4, 62.75);
  add('ht1b', -55.75, 4, 65.25);
  add('htT2', -65.95, 8, 65.25);
  add('ht2', -68.25, 8, 65.25);
  add('ht2b', -68.25, 8, 62.75);
  add('htT3', -58.05, 12, 62.75);
  add('ht3', -55.75, 12, 62.75);
  add('ht3b', -55.75, 12, 65.25);
  add('htT4', -65.95, Y, 65.25);
  add('ht4', -68.25, Y, 65.25);
  add('hb0', -68.25, Y, 68);
  add('hb1', -72, Y, 68);
  add('hb2', -78.5, Y, 68);
  add('hb3', -50, Y, 68);
  add('hb4', -40, Y, 68);
  chain('ht0', 'htT1', 'ht1', 'ht1b', 'htT2', 'ht2', 'ht2b', 'htT3', 'ht3', 'ht3b');
  chain('ht3b', 'htT4', 'ht4', 'hb0', 'hb1', 'hb2');
  chain('hb0', 'hb3', 'hb4');
  // the yard's floor
  add('sy1', -78, 0, 60);
  add('sy2', -84, 0, 68);
  add('sy3', -72, 0, 68);
  add('sy4', -60, 0, 69.5);
  add('sy5', -43.5, 0, 66);
  add('sy6', -43.5, 0, 57);
  add('sy7', -43.5, 0, 76);
  add('sy8', -32, 0, 66);
  add('sy9', -24, 0, 66);
  add('sy11', -22, 0, 62);
  add('syM', 0, 0, 68);
  add('syP', 0, 0, 74);
  add('sy12', -9.5, 0, 55.25);
  add('sy13', -18, 2.6, 55.25);
  add('sy14', -34, 0, 82);
  add('sy15', -52.8, 0, 65.5);
  add('sy16', -52.8, 0, 59.5);
  add('sy17', -52.8, 0, 69.3);
  add('sy18', -12, 0, 61);
  chain('F2b0', 'ht01', 'ht00', 'ht0');
  link('sy1', 'ht01');
  chain('F1b1', 'sy2', 'sy3', 'sy4', 'sy17', 'sy15', 'sy5', 'sy8', 'sy9', 'syM', 'syP');
  chain('F2b1', 'sy16', 'sy15');
  link('sy2', 's0b');
  chain('F1b0', 'sy1', 'F2b0', 'F2b1');
  chain('sy6', 'sy5', 'sy7', 's0c', 'sy14');
  chain('sy1', 'sy3');
  chain('sy9', 'sy11', 'sy18', 'sy12', 'sy13');
  chain('sy8', 'sy14', 'S3a0');
  chain('syP', 's0M');
  // the pump house and the south apron's west end
  chain('F1a0', 'sa0');
  chain('F2a0', 'sa2');
  chain('F2a1', 'sa3');
  chain('sy6', 'sa4');
  chain('sy12', 'sa7');
  return wps;
};
