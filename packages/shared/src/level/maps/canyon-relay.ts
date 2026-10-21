// "Canyon Relay" — outdoor desert mesa at sunset, 120 × 100 m (world x = plan x, east; world z =
// plan y, south). Mirror-symmetric north ↔ south across z = 50 (Cyan, team 0, north; Orange,
// team 1, south) and built the same east ↔ west. Bomb site A is in the east basin, B in the
// west basin, both on the middle line. Everything is authored for the north-east quarter
// (x ≥ 60, z ≤ 50) and mirrored into the other three.
//
// Each mesa top is an adobe relay-station pueblo (streets y 0), with an old mine under it
// (y -5) and a rail tunnel under the gorge (y -8.5). North half, east side (west mirrored):
//
//   STATION YARD (x 54..66, z 2..13)   walled court round the Tower; spawn group "station";
//        doors east / west into the tower alleys
//   EAST CAMP (x 83..98, z 2..12.5)     walled caravan camp; spawn group "east camp"; exits:
//        canyon gate (east), market gate (south), the storehouse (west)
//   STOREHOUSE (x 71..83, z 2..15)      covered room between the tower alley and the camp
//   CANTINA (x 71..84, z 15..25)        covered room between the plaza and the market street
//   MARKET STREET (x 84..89, z 13.5..25) and MINE HOUSE (x 89..98): a ramp down to the mine
//   PLAZA (x 49..71, z 16..28)          well in the middle, two stairs down into the mine hall
//   RIM STREET (x 71..89, z 25..30)     behind the rim houses
//   RELAY HOUSE (x 52..68, z 28..36)    covered pass from the plaza to the terrace
//   TERRACE (x 50..70, z 36..42)        the overlook on the gorge: launch pads, the drop onto
//        the relay rock
//   LOOKOUT (x 70..81, z 30..42) and GATEHOUSE (x 81..89, z 30..42): covered rooms on the rim;
//        the gatehouse opens onto the rock bridge (x 83..87)
//   THE GORGE (x 22..98, z 42..58)      deadly (LevelDef.killVolumes); relay rock in the middle
//        (top y -3, the power-up), rock hoodoos between it and the bridges
//   MINE (y -5): hall under the plaza (x 50..70, z 23..31); gallery east under the rim street
//        (z 26..30) to the mine house ramp, then south to the cave mouth into the basin;
//        rail tunnel (x 58..62) down to y -8.5 and under the gorge through the relay rock
//   SLOT CANYON (x 101..116, z 2..33)   from the camp gate, angled rock fins, down a ramp
//        under a rock overhang into the BASIN (x 101..116, z 37..63, y -5): bomb site under a
//        natural arch; entrances: the canyon ramp and the cave mouth, from each half
import type { Vec3 } from '../../math/vec3';
import { v3 } from '../../math/vec3';
import { qFromAxisAngle } from '../../math/quat';
import { LevelBuilder, subtractHoles } from '../builder';
import type {
  BoxDef,
  KillVolumeDef,
  LaunchPadDef,
  LevelDef,
  LightDef,
  Material,
  SizeWallDef,
  SpawnDef,
  TowerDef,
  WaypointDef,
} from '../types';

const CYAN = 0x19e3ff;
const ORANGE = 0xff8a1f;
const SITE = 0xc23b3b;
const PAD = 0xffc15a;

// sunset palette
const SAND = 0xd8b27a;
const ADOBE = 0xc98a5a;
const WOOD = 0x6e4a2c;
const CRATE = 0x8a6238;
const SHADE = 0x3a2a3f;
const CACTUS = 0x5d7a45;
const SHRUB = 0x8a8a52;
const LAMP = 0xffb35c;

/** the middle of the map: x (east ↔ west mirror line) and z (north ↔ south mirror line) */
const MX = 60;
const MZ = 50;

/** Key coordinates (the plan). The south half mirrors the north (z → 100 - z), west the east. */
export const CANYON_RELAY = {
  center: v3(MX, 0, MZ),
  /** street level of the pueblos */
  street: 0,
  /** floor of the mine galleries and the basins (bomb sites) */
  mine: -5,
  basin: -5,
  /** floor of the rail tunnel under the gorge */
  rail: -8.5,
  /** floor of the gorge, far below */
  gorgeFloor: -30,
  /** a body centre below this in the gorge is dead */
  killY: -4,
  gorge: { x0: 22, x1: 98, z0: 42, z1: 58 },
  /** the rail tunnel under the gorge (x) */
  tunnel: { x0: 58, x1: 62 },
  /** the relay rock in the middle of the gorge */
  relay: { x0: 55, x1: 65, z0: 44, z1: 56, top: -3 },
  /** Towers: Cyan's (north) first */
  towers: [v3(60, 0, 9), v3(60, 0, 91)] as [Vec3, Vec3],
  bombSites: {
    A: { min: v3(103, -5, 44), max: v3(114, -2, 56) },
    B: { min: v3(6, -5, 44), max: v3(17, -2, 56) },
  },
  /** on the relay rock, in the middle of the gorge */
  powerups: [v3(60, -1.8, 50)],
  /** launch pad throw (the north-east pad): across the gorge onto the far terrace */
  padVel: v3(-5.4, 11, 15.5),
  /** the pads on the terrace (north-east one) */
  pad: { x0: 66, x1: 69, z0: 38.5, z1: 41.5 },
};

type Sign = 1 | -1;
const SIGNS: Sign[] = [1, -1];
/** x authored for the east half, mirrored to the west (s = -1) */
const mx = (s: Sign, x: number) => (s > 0 ? x : 2 * MX - x);
/** z authored for the north half, mirrored to the south (n = -1) */
const mz = (n: Sign, z: number) => (n > 0 ? z : 2 * MZ - z);

/** Rock strata by height: bands of colour; the ones at shoulder height muted. */
const STRATA: [number, number, number][] = [
  [-40, -11, 0x6b3d33],
  [-11, -5, 0xa35a3c],
  [-5, 0, 0x8c5a44], // the mine, the rail stairs and the basins: muted
  [0, 2.2, 0x94634a], // shoulder height in the streets: muted
  [2.2, 40, 0xc98652],
];

/** building heights: interior walls up to WALL, roof slab up to ROOF; compound walls */
const WALL = 4.5;
const ROOF = 5.5;
const COMPOUND = 6;

export const buildCanyonRelay = (): LevelDef => {
  const C = CANYON_RELAY;
  const MN = C.mine;
  const RL = C.rail;
  const GF = C.gorgeFloor;
  const b = new LevelBuilder();
  const lights: LightDef[] = [];

  /** a box between two corners given in any order */
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
  /** the same box in all four quarters (authored in the north-east one) */
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
  /** a rock mass (x0, z0)–(x1, z1), y0..y1, in all four quarters, cut into strata bands */
  const rock = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) => {
    for (const [lo, hi, color] of STRATA) {
      const a = Math.max(lo, y0);
      const c = Math.min(hi, y1);
      if (c - a > 1e-6) quad(x0, a, z0, x1, c, z1, 'rock', { color });
    }
  };
  /** adobe (walls, solid houses, roofs) */
  const adobe = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) =>
    quad(x0, y0, z0, x1, y1, z1, 'sand', { color: ADOBE });
  /** a sand floor slab (0.5 m thick) with its top at y */
  const floor = (x0: number, z0: number, x1: number, z1: number, y: number) =>
    quad(x0, y - 0.5, z0, x1, y, z1, 'sand', { color: SAND });
  const crate = (x0: number, z0: number, x1: number, z1: number, y0: number, h: number) =>
    quad(x0, y0, z0, x1, y0 + h, z1, 'crate', { color: CRATE });
  /**
   * A wall along x (z0..z1 thick) from xa to xb, y0..y1, with door gaps [a, b] along x; a lintel
   * over each door from `lintel` up.
   */
  const wallX = (
    xa: number,
    xb: number,
    z0: number,
    z1: number,
    y0: number,
    y1: number,
    doors: [number, number][],
    make: typeof adobe,
    lintel?: number,
  ) => {
    let x = xa;
    for (const [d0, d1] of [...doors].sort((p, q) => p[0] - q[0])) {
      if (d0 > x) make(x, z0, d0, z1, y0, y1);
      if (lintel !== undefined) make(d0, z0, d1, z1, lintel, y1);
      x = d1;
    }
    if (xb > x) make(x, z0, xb, z1, y0, y1);
  };
  /** a wall along z (x0..x1 thick) from za to zb, with door gaps along z */
  const wallZ = (
    x0: number,
    x1: number,
    za: number,
    zb: number,
    y0: number,
    y1: number,
    doors: [number, number][],
    make: typeof adobe,
    lintel?: number,
  ) => {
    let z = za;
    for (const [d0, d1] of [...doors].sort((p, q) => p[0] - q[0])) {
      if (d0 > z) make(x0, z, x1, d0, y0, y1);
      if (lintel !== undefined) make(x0, d0, x1, d1, lintel, y1);
      z = d1;
    }
    if (zb > z) make(x0, z, x1, zb, y0, y1);
  };
  /** decoration only (no collision), all four quarters */
  const decoQuad = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material,
    color: number,
  ) => quad(x0, y0, z0, x1, y1, z1, mat, { color, noCollide: true });
  /**
   * An angled rock fin (turned `deg` about the vertical), all four quarters: `len` long, `thick`
   * thick, standing on y0 up to y1. Mirroring flips the angle.
   */
  const fin = (
    cx: number,
    cz: number,
    len: number,
    thick: number,
    deg: number,
    y0: number,
    y1: number,
  ) => {
    for (const [lo, hi, color] of STRATA) {
      const a = Math.max(lo, y0);
      const c = Math.min(hi, y1);
      if (c - a < 1e-6) continue;
      for (const n of SIGNS)
        for (const s of SIGNS) {
          const ang = ((deg * Math.PI) / 180) * s * n;
          b.boxes.push({
            c: v3(mx(s, cx), (a + c) / 2, mz(n, cz)),
            h: v3(len / 2, (c - a) / 2, thick / 2),
            q: qFromAxisAngle(v3(0, 1, 0), ang),
            mat: 'rock',
            color,
          });
        }
    }
  };
  /** a lamp in all four quarters */
  const lamp = (x: number, y: number, z: number, radius: number, k: number, color = LAMP) => {
    for (const n of SIGNS)
      for (const s of SIGNS)
        lights.push({ pos: v3(mx(s, x), y, mz(n, z)), color, radius, intensity: k });
  };
  /** a ramp (sand) with solid steps under it, in all four quarters */
  const ramp = (
    axis: 'x' | 'z',
    from: number,
    to: number,
    yFrom: number,
    yTo: number,
    across: number,
    width: number,
  ) => {
    for (const n of SIGNS)
      for (const s of SIGNS) {
        if (axis === 'z') {
          b.ramp('z', mz(n, from), mz(n, to), yFrom, yTo, mx(s, across), width, {
            mat: 'sand',
            color: SAND,
          });
          fillUnder(b, 'z', mz(n, from), mz(n, to), yFrom, yTo, mx(s, across), width);
        } else {
          b.ramp('x', mx(s, from), mx(s, to), yFrom, yTo, mz(n, across), width, {
            mat: 'sand',
            color: SAND,
          });
          fillUnder(b, 'x', mx(s, from), mx(s, to), yFrom, yTo, mz(n, across), width);
        }
      }
  };

  // ======================= the street slab (y 0), holes over the two mine stairs =============
  const holes = [
    { u0: 63, u1: 66, v0: 16, v1: 22 }, // plaza stair
    { u0: 90, u1: 94, v0: 16, v1: 22 }, // mine house stair
  ];
  for (const r of subtractHoles({ u0: 60, u1: 98, v0: 2, v1: 42 }, holes))
    floor(r.u0, r.v0, r.u1, r.v1, 0);
  // the canyon gate's floor, the slot canyon's floor
  floor(98, 5, 101, 9, 0);
  floor(101, 2, 116, 27, 0);

  // ======================= boundary cliffs (tall: nobody climbs out) ========================
  rock(60, -4, 120, 2, -0.5, 14); // north, behind the station and the camp
  rock(116, 2, 120, MZ, MN - 0.5, 14); // east, along the canyon and the basin
  // between the town and the canyon: the canyon gate (z 5..9) through it
  rock(98, 2, 101, 5, -0.5, 12);
  rock(99, 5, 100.4, 9, 4, 12); // the gate's arch (open to the sky either side of it)
  rock(98, 9, 101, 25, -0.5, 12);
  rock(98, 25, 101, 37, MN - 0.5, 12);
  rock(98, 37, 101, 41, -2, 12); // over the cave mouth
  rock(98, 41, 101, 42, MN - 0.5, 12);
  // the gorge's east end wall, between the gorge and the basin
  rock(98, 42, 101, MZ, GF - 1, 8);

  // ======================= the station yard (Tower) ======================================
  adobe(60, 13, 67, 16, 0, COMPOUND); // south wall (thick: nothing sees in from the plaza)
  wallZ(66, 67, 2, 13, 0, COMPOUND, [[9.5, 12.5]], adobe, 3.5); // east wall, door
  // baffle inside the door: nothing outside sees the spawns
  adobe(63.4, 7.5, 64.2, 13, 0, 2.5);

  // ======================= the storehouse (covered, alley ↔ camp) =========================
  wallZ(71, 72, 2, 15, 0, WALL, [[9.5, 12.5]], adobe, 3.2);
  wallZ(82, 83, 2, 15, 0, WALL, [[3.5, 6.5]], adobe, 3.2);
  adobe(72, 14, 82, 15, 0, WALL);
  adobe(71, 2, 83, 15, WALL, ROOF);
  crate(76, 6, 78.5, 10, 0, 2.5); // a stack in the middle: no line from door to door
  crate(73, 3, 74.5, 4.5, 0, 1.1);

  // ======================= the east camp (spawns) ========================================
  wallX(83, 98, 12.5, 13.5, 0, COMPOUND, [[85, 88]], adobe);
  // baffles: inside the market gate and the canyon gate
  adobe(84, 9.5, 90, 10.3, 0, 2.5);
  adobe(95, 3.5, 96, 10.5, 0, 2.5);
  crate(83.5, 2.5, 85, 3.4, 0, 1.1);

  // ======================= the cantina (covered, plaza ↔ market) ===========================
  adobe(83, 13.5, 84, 16, 0, WALL); // the corner beside the camp gate
  adobe(71, 15, 84, 16, 0, WALL);
  wallZ(71, 72, 16, 25, 0, WALL, [[17, 20]], adobe, 3.2);
  wallZ(83, 84, 16, 25, 0, WALL, [[20.5, 23.5]], adobe, 3.2);
  adobe(71, 24, 84, 25, 0, WALL);
  adobe(71, 15, 84, 25, WALL, ROOF);
  quad(74, 0, 21, 80, 1.1, 22, 'wood', { color: WOOD }); // the bar
  crate(72.5, 22.3, 74, 23.8, 0, 1.1);

  // ======================= the mine house (stair down from the market street) ============
  wallZ(89, 90, 13.5, 25, 0, WALL, [[13.5, 16.5]], adobe, 3.2);
  adobe(95, 13.5, 98, 25, 0, WALL);
  adobe(90, 24, 95, 25, 0, WALL);
  adobe(89, 13.5, 98, 25, WALL, ROOF);
  // railings beside the stair (waist-high)
  quad(94, 0, 16, 94.4, 1.1, 22, 'wood', { color: WOOD });

  // ======================= the plaza, the rim street, the solid rim houses ================
  quad(60, 0, 19, 61.5, 1.1, 22, 'rock', { color: 0x94634a }); // the well (half cover)
  adobe(77, 25, 80, 27, 0, ROOF); // a buttress in the rim street
  adobe(89, 25, 98, 42, 0, ROOF); // solid rim house east

  // ======================= the relay house (covered, plaza ↔ terrace) =====================
  wallX(60, 70, 28, 29, 0, WALL, [[65, 68]], adobe, 3.2);
  adobe(69, 29, 70, 35, 0, WALL);
  wallX(60, 70, 35, 36, 0, WALL, [[61, 64]], adobe, 3.2);
  adobe(60, 28, 70, 36, WALL, ROOF);
  crate(66.5, 31.5, 68.5, 33.5, 0, 1.1);

  // ======================= the lookout and the gatehouse (covered, on the rim) ===========
  wallZ(70, 71, 30, 42, 0, WALL, [[37, 40]], adobe, 3.2);
  wallX(71, 81, 30, 31, 0, WALL, [[73, 76]], adobe, 3.2);
  wallZ(80, 81, 31, 42, 0, WALL, [[33, 36]], adobe, 3.2);
  adobe(71, 41, 80, 42, 0, WALL);
  adobe(70, 30, 81, 42, WALL, ROOF);
  crate(76, 37, 78, 39, 0, 2.5);
  crate(72, 32, 73.5, 33.5, 0, 1.1);
  // gatehouse: north door off the bridge's line, open onto the bridge
  wallX(81, 89, 30, 31, 0, WALL, [[81, 84]], adobe, 3.2);
  adobe(81, 41, 83, 42, 0, WALL);
  adobe(87, 41, 89, 42, 0, WALL);
  adobe(81, 30, 89, 42, WALL, ROOF);
  crate(86.5, 33, 88, 35.5, 0, 1.1);

  // ======================= the mine (y -5) ==============================================
  // the hall under the plaza
  floor(60, 23, 70, 31, MN);
  wallX(60, 71, 22, 23, MN, -0.5, [[63, 66]], rockBox(rock));
  wallZ(70, 71, 23, 31, MN, -0.5, [[26, 30]], rockBox(rock));
  rock(62, 31, 71, 32, MN, -0.5);
  rock(67, 23.5, 68, 24.5, MN, -0.5); // a timber-propped pillar
  crate(66, 29.3, 68.5, 30.8, MN, 1.1); // an ore cart
  // the stair from the plaza into the hall (trench walls beside it)
  ramp('z', 16, 26, 0, MN, 64.5, 3);
  rock(62, 16, 63, 22, MN, -0.5);
  rock(66, 16, 67, 22, MN, -0.5);
  // gallery east (z 26..30) to the mine house stair and on to the cave mouth
  floor(70, 26, 98, 30, MN);
  floor(94, 30, 98, 41, MN);
  floor(98, 37, 101, 41, MN);
  rock(71, 25, 90, 26, MN, -0.5);
  rock(94, 25, 98, 26, MN, -0.5);
  rock(71, 30, 94, 31, MN, -0.5);
  rock(93, 31, 94, 41, MN, -0.5);
  crate(84, 26.3, 86, 27.6, MN, 1.1); // a cart in the gallery
  // the mine house stair
  ramp('z', 16, 26, 0, MN, 92, 4);
  rock(89, 16, 90, 25, MN, -0.5);
  rock(94, 16, 95, 25, MN, -0.5);

  // ======================= the rail tunnel (x 58..62) ====================================
  ramp('z', 31, 38, MN, RL, 61, 2);
  rock(62, 31, 63, 40, RL - 0.5, -0.5);
  rock(60, 38, 62, 40, -5.5, -0.5); // the roof steps down to the tunnel
  floor(60, 38, 62, MZ, RL);
  // the rock face of the gorge's rim (the tunnel through it)
  rock(62, 40, 94, 42, GF, -0.5);
  rock(94, 41, 98, 42, GF, -0.5);
  rock(60, 40, 62, 42, GF, RL - 0.5);
  rock(60, 40, 62, 42, -5.5, -0.5);
  // the rib that carries the tunnel from the rim to the relay rock (its top is deadly)
  rock(60, 42, 63, 44, GF, RL - 0.5);
  rock(62, 42, 63, 44, RL - 0.5, -5);
  rock(60, 42, 62, 44, -5.5, -5);
  // the relay rock (the tunnel runs through its foot)
  const R = C.relay;
  rock(60, R.z0, R.x1, MZ, GF, RL - 0.5);
  rock(62, R.z0, R.x1, MZ, RL - 0.5, -5.5);
  rock(60, R.z0, R.x1, MZ, -5.5, R.top - 0.5);
  floor(60, R.z0, R.x1, MZ, R.top);

  // ======================= the gorge ====================================================
  quad(60, GF - 1, 42, 98, GF, MZ, 'sand', { color: 0xa9825a });
  // hoodoos between the relay rock and the bridges: they cut the long lines along the gorge
  rock(74, 46.5, 78, MZ, GF, 12);
  // the rock bridge (x 83..87), waist-high parapets
  rock(83, 42, 87, MZ, -2, -0.5);
  floor(83, 42, 87, MZ, 0);
  quad(83, 0, 42, 83.4, 1.15, MZ, 'rock', { color: 0xa0705a });
  quad(86.6, 0, 42, 87, 1.15, MZ, 'rock', { color: 0xa0705a });
  rock(83.5, 42, 86.5, 44, GF, -2); // the arch's leg, far down

  // ======================= the slot canyon ===============================================
  fin(110.5, 12, 7, 1.5, 30, 0, 9.5);
  fin(104.5, 21, 7, 1.5, -30, 0, 9.5);
  quad(112, 0, 4, 113.5, 1.2, 5.5, 'rock', { color: 0x94634a }); // half cover
  // the ramp down to the basin, under a rock overhang
  ramp('z', 27, 37, 0, MN, 110, 8);
  rock(101, 27, 106, 37, MN - 0.5, 0);
  rock(114, 27, 116, 37, MN - 0.5, 0);
  rock(101, 33, 116, 37, 0, 12);

  // ======================= the basin (bomb site) ========================================
  floor(101, 37, 116, MZ, MN);
  rock(101, 49, 116, MZ, 4.5, 6.5); // the natural arch overhead
  rock(110, 40, 112.5, 42.5, MN, MN + 2.5); // full cover (outside the site's outline)
  rock(103.5, 45.5, 106, 47.5, MN, MN + 1.2); // half
  rock(101, 47, 102.5, MZ, MN, MN + 2.5); // full, against the west wall

  // ======================= Towers, spawns, Controller homes =======================
  const towers: TowerDef[] = [];
  const spawns: SpawnDef[] = [];
  const homes: Vec3[] = [];
  for (const team of [0, 1] as const) {
    const n: Sign = team === 0 ? 1 : -1;
    const tp = C.towers[team];
    const tc = team === 0 ? CYAN : ORANGE;
    const yaw = team === 0 ? 180 : 0;
    b.block(v3(tp.x, 3, tp.z), v3(2, 6, 2), { mat: team === 0 ? 'teamA' : 'teamB', trim: tc });
    towers.push({ team, pos: tp, radius: 1.5, height: 6 });
    homes.push(v3(tp.x, 0.9, mz(n, 12)));
    for (const s of SIGNS) {
      spawns.push({ pos: v3(mx(s, 62.5), 0, mz(n, 4)), yawDeg: yaw, team, group: 'station' });
      const camp = s > 0 ? 'east camp' : 'west camp';
      for (const [x, z] of [
        [86, 4.5],
        [90.5, 7.5],
        [93, 4.5],
      ])
        spawns.push({ pos: v3(mx(s, x), 0, mz(n, z)), yawDeg: yaw, team, group: camp });
    }
  }

  // ======================= launch pads (terrace → far terrace) =======================
  const launchPads: LaunchPadDef[] = [];
  const P = C.pad;
  for (const n of SIGNS)
    for (const s of SIGNS)
      launchPads.push({
        min: v3(Math.min(mx(s, P.x0), mx(s, P.x1)), 0, Math.min(mz(n, P.z0), mz(n, P.z1))),
        max: v3(Math.max(mx(s, P.x0), mx(s, P.x1)), 2.5, Math.max(mz(n, P.z0), mz(n, P.z1))),
        vel: v3(s * C.padVel.x, C.padVel.y, n * C.padVel.z),
      });

  // ======================= lights: every covered room and the mine ======================
  lamp(64, 3.8, 32, 9, 0.9); // relay house
  lamp(76, 3.8, 9, 10, 0.9); // storehouse
  lamp(77, 3.8, 20, 10, 0.9); // cantina
  lamp(92.5, 3.8, 15, 8, 0.8); // mine house
  lamp(75.5, 3.8, 35, 10, 0.9); // lookout
  lamp(84.5, 3.8, 36, 9, 0.9); // gatehouse
  lamp(64, -1.5, 27, 11, 1.1); // mine hall
  lamp(80, -2.2, 28, 10, 1); // gallery
  lamp(92, -2.2, 28, 8, 0.9);
  lamp(96, -2.2, 35, 8, 0.9);
  lamp(61, -2.5, 35, 7, 0.9); // rail stair
  lamp(61, -6.2, 45, 8, 1); // rail tunnel
  lamp(104, -3, 45, 12, 0.7, 0xffd9a8); // basin shade

  decorate(box, quad, decoQuad, lights, launchPads);

  const kill: KillVolumeDef[] = [
    // the gorge, but not the rail tunnel under it
    { min: v3(C.gorge.x0, GF - 10, C.gorge.z0), max: v3(C.tunnel.x0, C.killY, C.gorge.z1) },
    { min: v3(C.tunnel.x1, GF - 10, C.gorge.z0), max: v3(C.gorge.x1, C.killY, C.gorge.z1) },
    // over the tunnel's rib between each rim and the relay rock
    { min: v3(C.tunnel.x0, -5, C.gorge.z0), max: v3(C.tunnel.x1, C.killY, R.z0) },
    { min: v3(C.tunnel.x0, -5, R.z1), max: v3(C.tunnel.x1, C.killY, C.gorge.z1) },
  ];

  const boundsMin = v3(0, GF - 2, 0);
  const boundsMax = v3(120, 14, 100);
  return b.build({
    name: 'Canyon Relay',
    boundsMin,
    boundsMax,
    defaultGravity: v3(0, -1, 0),
    zones: [],
    rails: [],
    pads: [],
    spawns,
    towers,
    controllerHomes: homes,
    waypoints: waypoints(),
    areas: [
      { name: 'Cyan station', pos: v3(60, 0, 12), yawDeg: 180 },
      { name: 'Orange station', pos: v3(60, 0, 88), yawDeg: 0 },
      { name: 'North plaza', pos: v3(60, 0, 25.5), yawDeg: 180 },
      { name: 'North terrace', pos: v3(63, 0, 38), yawDeg: 180 },
      { name: 'North mine hall', pos: v3(62, MN, 28), yawDeg: 180 },
      { name: 'Rail tunnel', pos: v3(60, RL, 45), yawDeg: 180 },
      { name: 'East bridge', pos: v3(85, 0, 44), yawDeg: 180 },
      { name: 'Relay rock', pos: v3(60, R.top, 48), yawDeg: 180 },
      { name: 'A site (east basin)', pos: v3(108, MN, 44), yawDeg: 180 },
      { name: 'B site (west basin)', pos: v3(12, MN, 44), yawDeg: 180 },
      { name: 'East slot canyon', pos: v3(104, 0, 8), yawDeg: 180 },
      { name: 'East camp (north)', pos: v3(91.5, 0, 11.4), yawDeg: 180 },
    ],
    fog: { color: 0xf2a65a, near: 70, far: 260 },
    ambient: 1.12,
    lights,
    bombSites: [
      { name: 'A', ...C.bombSites.A },
      { name: 'B', ...C.bombSites.B },
    ],
    powerups: C.powerups,
    launchPads,
    killVolumes: kill,
    outdoor: {
      top: 0x8ec6e8,
      horizon: 0xf2a65a,
      ground: 0xc98a55,
      sun: { dir: v3(-0.85, 0.1, 0.3), color: 0xfff1c9, sizeDeg: 5 },
      sunLight: 0xffd9a8,
    },
    sizeWalls: sizeWalls(boundsMin, boundsMax),
  });
};

/** wallX / wallZ piece maker for rock walls (argument order of `adobe`) */
const rockBox =
  (rock: (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) => void) =>
  (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) =>
    rock(x0, z0, x1, z1, y0, y1);

/**
 * Smaller teams play a smaller map (level/size-walls.ts). Outdoors nothing has a ceiling: the
 * jetpack, wall-jumps and a climb get you ~10 m up. So a wall that must really shut a part of
 * the map is a curtain across the whole out-of-map box (sim/world.ts kills anyone more than
 * 20 m outside the bounds): you can't go over, under or round its ends alive.
 *
 * - 3v3 (and smaller): the camps' canyon gates close (a curtain in each gate at x 99.7 / 20.3,
 *   sky-high). The slot canyons stay open from the basins; each site keeps its cave mouths
 *   and canyon ramps.
 * - 1v1 / 2v2: the canyons and basins close: the rest of those curtains (the whole
 *   cross-section of the map at x 99.7 and 20.3). Play stays in the pueblos, the mine and the
 *   gorge crossings. The bomb sites move onto the rock bridges, on the middle line.
 */
const sizeWalls = (boundsMin: Vec3, boundsMax: Vec3): SizeWallDef[] => {
  // the out-of-map box (sim/world.ts): a curtain reaches 1 m past it on every side
  const OUT = 20 + 1;
  const y0 = boundsMin.y - OUT;
  const y1 = boundsMax.y + OUT;
  const z0 = boundsMin.z - OUT;
  const z1 = boundsMax.z + OUT;
  const X = 99.7; // inside the rock between the town and the canyon (x 98..101)
  const mouth = { z0: 4.8, z1: 9.2 }; // the canyon gate (z 5..9), into the rock either side
  /** a 0.4 m panel in the plane x = ±X (both sides) from z0..z1, y0..y1 (north half given) */
  const curtain = (za: number, zb: number, ya: number, yb: number, far = false): BoxDef[] =>
    SIGNS.map((s) => ({
      c: v3(mx(s, X), (ya + yb) / 2, (za + zb) / 2),
      h: v3(0.2, (yb - ya) / 2, (zb - za) / 2),
      ...(far ? { lowDetail: true } : {}),
    }));
  const mouths = SIGNS.flatMap((n) =>
    curtain(
      Math.min(mz(n, mouth.z0), mz(n, mouth.z1)),
      Math.max(mz(n, mouth.z0), mz(n, mouth.z1)),
      y0,
      y1,
    ),
  );
  const rest = [
    ...curtain(z0, mouth.z0, y0, y1, true),
    ...curtain(mouth.z1, mz(-1, mouth.z1), y0, y1, true),
    ...curtain(mz(-1, mouth.z0), z1, y0, y1, true),
  ];
  return [
    { maxTeamSize: 3, boxes: mouths },
    {
      maxTeamSize: 2,
      boxes: rest,
      bombSites: [
        { name: 'A', min: v3(83.4, 0, 40), max: v3(86.6, 3, 60) },
        { name: 'B', min: v3(2 * MX - 86.6, 0, 40), max: v3(2 * MX - 83.4, 3, 60) },
      ],
    },
  ];
};

type BoxFn = (
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  mat: Material,
  extra?: Omit<BoxDef, 'c' | 'h' | 'mat'>,
) => void;

/** Markings, glow, plants and the far scenery (none of it where players fight). */
const decorate = (
  box: BoxFn,
  quad: BoxFn,
  decoQuad: (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material,
    color: number,
  ) => void,
  lights: LightDef[],
  pads: LaunchPadDef[],
): void => {
  const C = CANYON_RELAY;
  const light = (x: number, y: number, z: number, color: number, radius: number, k: number) =>
    lights.push({ pos: v3(x, y, z), color, radius, intensity: k });
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
  // launch pad plates and their glow
  for (const p of pads) {
    deco(
      p.min.x + 0.1,
      p.min.y + 0.01,
      p.min.z + 0.1,
      p.max.x - 0.1,
      p.min.y + 0.08,
      p.max.z - 0.1,
      'trim',
      PAD,
    );
    light((p.min.x + p.max.x) / 2, p.min.y + 1, (p.min.z + p.max.z) / 2, PAD, 5, 0.8);
  }
  // bomb sites: red outlines on the basin floor
  for (const st of [C.bombSites.A, C.bombSites.B]) {
    const y0 = st.min.y + 0.01;
    const y1 = st.min.y + 0.05;
    const w = 0.12;
    deco(st.min.x, y0, st.min.z, st.max.x, y1, st.min.z + w, 'trim', SITE);
    deco(st.min.x, y0, st.max.z - w, st.max.x, y1, st.max.z, 'trim', SITE);
    deco(st.min.x, y0, st.min.z, st.min.x + w, y1, st.max.z, 'trim', SITE);
    deco(st.max.x - w, y0, st.min.z, st.max.x, y1, st.max.z, 'trim', SITE);
  }
  // the relay beacon: a glowing ring on the rock around the power-up
  const R = C.relay;
  quad(62, R.top + 0.01, 48, 62.15, R.top + 0.06, 50, 'trim', { color: 0x7fe9ff, noCollide: true });
  quad(60, R.top + 0.01, 48, 62, R.top + 0.06, 48.15, 'trim', { color: 0x7fe9ff, noCollide: true });
  light(60, R.top + 1.5, 50, 0x7fe9ff, 7, 0.9);
  // mine rails along the tunnel floor
  quad(59.2, C.rail + 0.01, 38, 59.4, C.rail + 0.08, MZ, 'trim', {
    color: 0x5b5048,
    noCollide: true,
  });
  // team banners over the station yards
  for (const n of [1, -1] as const) {
    const tc = n > 0 ? CYAN : ORANGE;
    const z = n > 0 ? 12.95 : 87.05;
    const z2 = n > 0 ? 12.9 : 87.1;
    box(56, 4, Math.min(z, z2), 64, 4.3, Math.max(z, z2), 'trim', { color: tc, noCollide: true });
    light(60, 3, n > 0 ? 7 : 93, tc, 10, 0.6);
  }

  // cacti and shrubs up on the rims and far below in the gorge (never where anyone hides)
  const cactus = (x: number, y: number, z: number, h: number) => {
    decoQuad(x - 0.35, y, z - 0.35, x + 0.35, y + h, z + 0.35, 'leaf', CACTUS);
    decoQuad(x + 0.35, y + h * 0.45, z - 0.25, x + 1.1, y + h * 0.55, z + 0.25, 'leaf', CACTUS);
    decoQuad(x + 0.85, y + h * 0.5, z - 0.25, x + 1.1, y + h * 0.85, z + 0.25, 'leaf', CACTUS);
    decoQuad(x - 1, y + h * 0.3, z - 0.25, x - 0.35, y + h * 0.4, z + 0.25, 'leaf', CACTUS);
    decoQuad(x - 1, y + h * 0.35, z - 0.25, x - 0.75, y + h * 0.65, z + 0.25, 'leaf', CACTUS);
  };
  cactus(70, 14.1, -2, 3.2);
  cactus(118, 14.1, 40, 2.4);
  cactus(79, C.gorgeFloor, 44, 2.8);
  const shrub = (x: number, y: number, z: number, w: number) =>
    decoQuad(x - w, y, z - w, x + w, y + w * 0.9, z + w, 'leaf', SHRUB);
  shrub(85, 14.1, 0, 1.1);
  shrub(117, 14.1, 30, 0.9);
  shrub(99.5, 12.1, 30, 0.8);
  shrub(70, C.gorgeFloor, 44.5, 1.2);
  shrub(92, C.gorgeFloor, 47, 0.9);
  // gorge floor: a dry riverbed and fallen rocks
  decoQuad(65.2, C.gorgeFloor + 0.01, 48.5, 74, C.gorgeFloor + 0.04, MZ, 'sand', 0x8f6a4a);
  decoQuad(78, C.gorgeFloor + 0.01, 48.5, 98, C.gorgeFloor + 0.04, MZ, 'sand', 0x8f6a4a);
  decoQuad(88, C.gorgeFloor, 44.5, 91, C.gorgeFloor + 1.5, 47.5, 'rock', 0x7a4636);

  // far scenery: distant mesas and buttes in the haze, and the plain beyond the cliffs
  decoQuad(60, 14, -60, 200, 14.1, -4, 'sand', 0xc99d68);
  decoQuad(120, 14, -4, 200, 14.1, MZ, 'sand', 0xc99d68);
  decoQuad(80, 14.1, -110, 140, 42, -80, 'rock', 0xa45a3a);
  decoQuad(150, 14.1, -40, 185, 30, 10, 'rock', 0xb86a42);
  decoQuad(170, 14.1, 20, 200, 55, MZ, 'rock', 0x9c5438);
  decoQuad(60, 14.1, -170, 95, 62, -140, 'rock', 0x8e4c34);
  decoQuad(120, 14.1, -150, 135, 80, -135, 'rock', SHADE);
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
  if (yHigh < yLow) {
    [from, to] = [to, from];
    [yHigh, yLow] = [yLow, yHigh];
  }
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
    const opts = { mat: 'rock' as Material, color: 0x94634a };
    if (axis === 'z') b.box(v3(w0, yLow, lo), v3(w1, top, hi), opts);
    else b.box(v3(lo, yLow, w0), v3(hi, top, w1), opts);
  }
};

/**
 * Bot waypoints, named (tests and tools/map refer to them by name). Authored in the north-east
 * quarter at world coordinates and mirrored into the others; names get N/S and E/W suffixes
 * ('campNE'); a waypoint on x = 60 has only N/S ('towerN'), one on z = 50 only E/W ('siteE' =
 * A, 'siteW' = B), one on both neither ('tunnel'). Links are two-way except the drop onto the
 * relay rock.
 */
const waypoints = (): WaypointDef[] => {
  const MN = CANYON_RELAY.mine;
  const RL = CANYON_RELAY.rail;
  const wps: WaypointDef[] = [];
  const onX = new Map<string, boolean>();
  const onZ = new Map<string, boolean>();
  const nameOf = (base: string, n: Sign, s: Sign) =>
    `${base}${onZ.get(base) ? '' : n > 0 ? 'N' : 'S'}${onX.get(base) ? '' : s > 0 ? 'E' : 'W'}`;
  /** a waypoint `feet` + 1 m (body height) */
  const add = (base: string, x: number, feet: number, z: number) => {
    onX.set(base, x === MX);
    onZ.set(base, z === MZ);
    for (const n of SIGNS)
      for (const s of SIGNS) {
        if ((x === MX && s < 0) || (z === MZ && n < 0)) continue;
        wps.push({ pos: v3(mx(s, x), feet + 1, mz(n, z)), links: [], name: nameOf(base, n, s) });
      }
  };
  const idx = (name: string) => {
    const i = wps.findIndex((w) => w.name === name);
    if (i < 0) throw new Error(`waypoint ${name} missing`);
    return i;
  };
  const link = (a: string, c: string, oneWay = false) => {
    for (const n of SIGNS)
      for (const s of SIGNS) {
        const i = idx(nameOf(a, n, s));
        const j = idx(nameOf(c, n, s));
        if (i === j) continue;
        if (!wps[i].links.includes(j)) wps[i].links.push(j);
        if (!oneWay && !wps[j].links.includes(i)) wps[j].links.push(i);
      }
  };
  const chain = (...names: string[]) => {
    for (let i = 1; i < names.length; i++) link(names[i - 1], names[i]);
  };

  // station yard and the tower alley
  add('tower', MX, 0, 11.5);
  add('yard', 62.5, 0, 7.5);
  add('yardS', 62.5, 0, 11.5);
  add('yardIn', 65.1, 0, 6.3);
  add('yardGap', 65.1, 0, 11);
  add('yardDoor', 66.5, 0, 11);
  add('alley', 69, 0, 11);
  add('alleyS', 69, 0, 17.5);
  // storehouse → camp
  add('storeW', 71.5, 0, 11);
  add('store1', 75, 0, 12.5);
  add('store2', 80.5, 0, 11);
  add('store3', 80.5, 0, 5);
  add('storeE', 82.5, 0, 5);
  add('campW', 85, 0, 5);
  add('camp', 91.5, 0, 6);
  add('campS', 91.5, 0, 11.4);
  add('campG', 87, 0, 11.4);
  add('campGate', 86.5, 0, 13.2);
  add('camp3', 97, 0, 11.5);
  add('gateIn', 97, 0, 7);
  add('gate', 98.5, 0, 7);
  // slot canyon, basin, site
  add('cOut', 103, 0, 7);
  add('c1', 104.5, 0, 13.5);
  add('c2', 109.5, 0, 17.5);
  add('c3', 110.5, 0, 24);
  add('cRamp', 110, -2.5, 32);
  add('cBot', 110, MN, 39);
  add('basinN', 104, MN, 40);
  add('basin', 107.5, MN, 44);
  add('site', 107.5, MN, MZ);
  // market street, mine house
  add('mkN', 86.5, 0, 16);
  add('mkM', 86.5, 0, 22);
  add('rimE', 86.5, 0, 27.5);
  add('mhDoor', 89.5, 0, 15);
  add('mhTop', 92, 0, 14.8);
  add('mhRamp', 92, -2.5, 21);
  add('mhBot', 92, MN, 28);
  // plaza, cantina, rim street
  add('plazaC', MX, 0, 25.5);
  add('plazaE', 68.5, 0, 25);
  add('canW', 71.5, 0, 18.5);
  add('can1', 75, 0, 19);
  add('can2', 81, 0, 19);
  add('canE', 83.5, 0, 22);
  add('rimW', 72.5, 0, 27.5);
  add('rimM', 78.5, 0, 28.5);
  // relay house, terrace
  add('rhN', 66.5, 0, 28.5);
  add('rh', 64.5, 0, 32);
  add('rhS', 62.5, 0, 35.5);
  add('terr', 63, 0, 37.2);
  add('terrE', 69.5, 0, 37.2);
  add('edge', MX, 0, 41);
  add('relay', MX, CANYON_RELAY.relay.top, MZ);
  // lookout, gatehouse, bridge
  add('lkW', 70.5, 0, 38.5);
  add('lk', 74.5, 0, 35.5);
  add('lkN', 74.5, 0, 30.5);
  add('lkE', 80.5, 0, 34.5);
  add('gh', 84.5, 0, 36.5);
  add('ghN', 82.5, 0, 30.5);
  add('ghS', 85, 0, 40);
  add('bridge', 85, 0, 44);
  add('bridgeMid', 85, 0, MZ);
  // the mine
  add('plTop', 64.5, 0, 16.4);
  add('plRamp', 64.5, -2.5, 21);
  add('plBot', 64.5, MN, 27.5);
  add('hallC', MX, MN, 27);
  add('hallE', 68.5, MN, 28);
  add('hallDoor', 70.5, MN, 28);
  add('g1W', 74, MN, 28);
  add('g1M', 82, MN, 28.5);
  add('g2N', 96, MN, 28);
  add('g2S', 96, MN, 39);
  add('cave', 98.5, MN, 39);
  add('railTop', MX, MN, 30.5);
  add('railBot', MX, RL, 39);
  add('tunnel', MX, RL, MZ);

  chain('yard', 'yardIn', 'yardGap', 'yardDoor', 'alley', 'alleyS');
  chain('yard', 'yardS', 'tower');
  chain('alley', 'storeW', 'store1', 'store2', 'store3', 'storeE', 'campW', 'camp', 'campS');
  chain('campS', 'campG', 'campGate', 'mkN', 'mkM', 'rimE');
  chain('campS', 'camp3', 'gateIn', 'gate', 'cOut', 'c1', 'c2', 'c3', 'cRamp', 'cBot', 'basin');
  chain('cBot', 'basinN', 'basin', 'site');
  chain('mkN', 'mhDoor', 'mhTop', 'mhRamp', 'mhBot');
  chain('alleyS', 'canW', 'can1', 'can2', 'canE', 'mkM');
  chain('alleyS', 'plazaE', 'plazaC');
  chain('plazaE', 'rimW', 'rimM', 'rimE');
  chain('plazaE', 'rhN', 'rh', 'rhS', 'terr', 'terrE', 'lkW', 'lk', 'lkE', 'gh', 'ghS');
  chain('terr', 'edge');
  link('edge', 'relay', true);
  chain('rimM', 'lkN', 'lk');
  chain('rimE', 'ghN', 'gh');
  link('rimM', 'ghN');
  chain('ghS', 'bridge', 'bridgeMid');
  chain('alleyS', 'plTop', 'plRamp', 'plBot', 'hallE', 'hallDoor', 'g1W', 'g1M', 'mhBot', 'g2N');
  chain('g2N', 'g2S', 'cave', 'basinN');
  chain('plBot', 'hallC', 'railTop', 'railBot', 'tunnel');
  return wps;
};
