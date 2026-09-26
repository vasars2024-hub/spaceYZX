// "Canyon Relay" — the first outdoor map: a desert mesa at sunset, 120 × 100 m (world x = plan x,
// east; world z = plan y, south; camp floors y 0). Mirror-symmetric north ↔ south across z = 50
// (Cyan, team 0, camps north; Orange, team 1, south) and built the same east ↔ west; bomb site A
// is in the east basin, B in the west basin, both on the middle line.
//
//   CAMPS (x 45..75)          walled, open to the sky, Tower in the middle; side gates east/west
//   OUTER PATHS (z 8..14)     from each camp gate out to the slot canyons; a cliff ramp beside each
//        gate climbs onto the mesa
//   MESAS (y 4)               north x 30..90, z 18..42 / south mirrored: rock spire in the middle
//        (y 9, ramps both sides, long laser angle over the gorge), boulders along the edge
//   THE GORGE (z 42..58)      a 34 m drop: falling in kills (LevelDef.killVolumes). Crossings:
//        two launch pads per mesa edge that throw you onto the far mesa (fast, you land in the
//        open), and two narrow rock bridges near the ends (x 83..87 and 33..37)
//   RELAY ROCK (x 55..65)     a pillar in the middle of the gorge, 3 m below the mesas and 2 m out: the power-up
//        sits on it and the collapse closes in on it. Drop down onto it; getting back up takes a
//        jump and a climb
//   SLOT CANYONS (x 6..20 / 100..114)  narrow, winding (angled rock fins, good for Boomerang
//        banks) from the outer paths down into the BASINS (y -3, z 42..58) past the gorge's ends:
//        the bomb sites, under a natural rock arch. A passage links each canyon to each mesa
//
// Everything is authored for the north-east quarter and mirrored into the other three.
import type { Vec3 } from '../../math/vec3';
import { v3 } from '../../math/vec3';
import { qFromAxisAngle } from '../../math/quat';
import { LevelBuilder } from '../builder';
import type {
  BoxDef,
  LaunchPadDef,
  LevelDef,
  LightDef,
  Material,
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
const SAND_DARK = 0xb8945f;
const CLAY = 0xb5653b;
const SHADE = 0x3a2a3f;
const CACTUS = 0x5d7a45;
const SHRUB = 0x8a8a52;

/** the middle of the map: x (east ↔ west mirror line) and z (north ↔ south mirror line) */
const MX = 60;
const MZ = 50;

/** Key coordinates (the plan). The south half mirrors the north (z → 100 - z), west the east. */
export const CANYON_RELAY = {
  center: v3(MX, 0, MZ),
  /** mesa top height */
  mesa: 4,
  /** floor of the basins (bomb sites) */
  basin: -3,
  /** floor of the gorge, far below */
  gorgeFloor: -30,
  /** below this in the gorge you are dead */
  killY: -6,
  gorge: { x0: 22, x1: 98, z0: 42, z1: 58 },
  camp: { x0: 45, x1: 75, z0: 4, z1: 16 },
  /** the relay rock in the middle of the gorge (top y 1) */
  relay: { x0: 55, x1: 65, z0: 44, z1: 56, top: 1 },
  spire: { top: 9 },
  /** Towers: Cyan's (north) first */
  towers: [v3(60, 0, 9), v3(60, 0, 91)] as [Vec3, Vec3],
  bombSites: {
    A: { min: v3(102, -3, 45), max: v3(112, 0, 55) },
    B: { min: v3(8, -3, 45), max: v3(18, 0, 55) },
  },
  /** on the relay rock, in the middle of the gorge */
  powerups: [v3(60, 2.2, 50)],
  /**
   * launch pad throw (the north-east pad): across the gorge and in toward the middle, so it
   * lands in front of the far spire, clear of the far pads
   */
  padVel: v3(-8.33, 12, 22.5),
};

type Sign = 1 | -1;
const SIGNS: Sign[] = [1, -1];
/** x authored for the east half, mirrored to the west (s = -1) */
const mx = (s: Sign, x: number) => (s > 0 ? x : 2 * MX - x);
/** z authored for the north half, mirrored to the south (n = -1) */
const mz = (n: Sign, z: number) => (n > 0 ? z : 2 * MZ - z);

/** Rock strata by height: bands of colour; the ones at shoulder height (floors 0 and 4) muted. */
const STRATA: [number, number, number][] = [
  [-40, -20, 0x6b3d33],
  [-20, -11, 0x96523a],
  [-11, -4, CLAY],
  [-4, 2, 0x94634a], // shoulder height on the ground floors: muted
  [2, 4, 0xc27a4c],
  [4, 6.2, 0xa0705a], // shoulder height on the mesas: muted
  [6.2, 9.5, 0xc98652],
  [9.5, 40, 0xd89a62],
];

export const buildCanyonRelay = (): LevelDef => {
  const C = CANYON_RELAY;
  const M = C.mesa;
  const BY = C.basin;
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
  /** a rock mass in all four quarters, cut into strata bands */
  const rock = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    for (const [lo, hi, color] of STRATA) {
      const a = Math.max(lo, y0);
      const c = Math.min(hi, y1);
      if (c - a > 1e-6) quad(x0, a, z0, x1, c, z1, 'rock', { color });
    }
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
   * thick, standing on y0. Mirroring flips the angle.
   */
  const fin = (cx: number, cz: number, len: number, thick: number, deg: number, y0: number) => {
    for (const [lo, hi, color] of STRATA) {
      const a = Math.max(lo, y0);
      const c = Math.min(hi, 9.5);
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
  const light = (x: number, y: number, z: number, color: number, radius: number, k: number) =>
    lights.push({ pos: v3(x, y, z), color, radius, intensity: k });

  // ======================= floors =======================
  // camp, outer path (and the ramp pocket), canyon: sand, y 0
  quad(60, -1, 4, 77, 0, 16, 'sand', { color: 0xcfae80 });
  quad(77, -1, 4, 100, 0, 18, 'sand', { color: SAND });
  quad(100, -1, 4, 114, 0, 36, 'sand', { color: SAND });
  // basin (bomb site) floor, y -3, from under the canyon ramp to the middle line
  quad(100, BY - 1, 36, 114, BY, MZ, 'sand', { color: SAND_DARK });
  // the gorge's floor far below
  quad(60, GF - 1, 42, 98, GF, MZ, 'sand', { color: 0xa9825a });

  // ======================= the mesa =======================
  rock(60, GF - 1, 18, 92, M - 1, 42);
  quad(60, M - 1, 18, 92, M, 42, 'sand', { color: SAND });

  // ======================= boundary cliffs (tall: nobody climbs out) =======================
  rock(60, -1, -6, 124, 14, 4); // north, behind the camp
  rock(77, -1, 4, 124, 14, 8); // north, along the outer path
  rock(114, BY - 1, 8, 124, 14, MZ); // east, along the canyon and the basin
  // rock between the mesa and the canyon (the passage cuts through it at z 28..32)
  rock(92, -1, 14, 100, 9.5, 28);
  rock(92, GF - 1, 32, 100, 9.5, 42);
  // the gorge's east end wall, between the gorge and the basin
  rock(98, GF - 1, 42, 100, 9.5, MZ);

  // ======================= the camp =======================
  // front wall (5 m above the mesa: nobody climbs in from there), side wall with its gate
  rock(60, 0, 16, 75, 9, 18);
  rock(75, 0, 4, 77, 9, 9);
  rock(75, 0, 13, 77, 9, 18);
  rock(75, 4, 9, 77, 9, 13); // over the gate
  // a low wall inside the gate: no line from the outer path into the camp
  quad(71, 0, 8.5, 72, 2.2, 14.2, 'rock', { color: 0xa0705a });

  // ======================= cliff ramp: outer path → mesa =======================
  // rises west from the pocket beside the canyon rock (x 89) to the landing by the gate (x 79)
  for (const n of SIGNS)
    for (const s of SIGNS) {
      b.ramp('x', mx(s, 89), mx(s, 79), 0, M, mz(n, 16), 4, { mat: 'sand', color: SAND });
      fillUnder(b, 'x', mx(s, 79), mx(s, 89), M, 0, mz(n, 16), 4);
    }
  rock(77, 0, 14, 79, M - 1, 18);
  quad(77, M - 1, 14, 79, M, 18, 'sand', { color: SAND });

  // ======================= passage: canyon → mesa =======================
  for (const n of SIGNS)
    for (const s of SIGNS) {
      b.ramp('x', mx(s, 92), mx(s, 100), M, 0, mz(n, 30), 4, { mat: 'sand', color: SAND });
      fillUnder(b, 'x', mx(s, 92), mx(s, 100), M, 0, mz(n, 30), 4);
    }
  quad(92, -1, 28, 100, 0, 32, 'sand', { color: SAND });

  // ======================= the spire =======================
  const SPT = C.spire.top;
  rock(60, M, 24, 64, SPT - 1, 30);
  quad(60, SPT - 1, 24, 64, SPT, 30, 'sand', { color: SAND });
  for (const s of SIGNS)
    for (const n of SIGNS) {
      b.ramp('x', mx(s, 64), mx(s, 74), SPT, M, mz(n, 27), 3, { mat: 'sand', color: SAND });
      fillUnder(b, 'x', mx(s, 64), mx(s, 74), SPT, M, mz(n, 27), 3);
    }
  // cover up there: a parapet toward the gorge (gap in the middle), corner blocks, a back wall
  quad(61, SPT, 29.4, 63, SPT + 1, 30, 'rock', { color: 0xa0705a });
  quad(63.2, SPT, 24, 64, SPT + 1.4, 25, 'rock', { color: 0xa0705a });
  quad(60, SPT, 24, 62, SPT + 1, 24.5, 'rock', { color: 0xa0705a });

  // ======================= mesa cover =======================
  const boulder = (x0: number, z0: number, x1: number, z1: number, h: number) =>
    rock(x0, M, z0, x1, M + h, z1);
  boulder(79, 36, 82, 39, 2.8); // full
  boulder(64, 39.8, 67, 41.8, 1.2); // half, on the edge
  boulder(75, 39.5, 78, 41.8, 2.6); // full, on the edge
  boulder(88.5, 37, 91.5, 40, 2.8); // beside the bridge
  boulder(82, 25, 85, 27.5, 1.2); // half
  boulder(68, 22.5, 70.5, 24.5, 1.2); // half, beside the spire ramp

  // ======================= bridges (x 83..87) =======================
  rock(83, -2, 42, 87, M - 1, MZ);
  quad(83, M - 1, 42, 87, M, MZ, 'sand', { color: SAND });
  // knee-high rims (step over them only with a jump)
  quad(83, M, 42, 83.4, M + 0.5, MZ, 'rock', { color: 0xa0705a });
  quad(86.6, M, 42, 87, M + 0.5, MZ, 'rock', { color: 0xa0705a });
  // the arch's legs, far down
  rock(83.5, GF, 42, 86.5, -2, 44);

  // ======================= the relay rock =======================
  const R = C.relay;
  rock(60, GF - 1, R.z0, R.x1, R.top - 1, MZ);
  quad(60, R.top - 1, R.z0, R.x1, R.top, MZ, 'sand', { color: SAND });

  // ======================= canyon: fins, dip, basin =======================
  fin(110.5, 19, 8, 1.5, 30, -1); // from the east wall, pointing south-west
  fin(103, 26, 8, 1.5, -30, -1); // from the west wall, screening the passage
  quad(109, 0, 13, 111, 1.2, 14.5, 'rock', { color: 0x94634a }); // half cover
  for (const n of SIGNS)
    for (const s of SIGNS) {
      b.ramp('z', mz(n, 36), mz(n, 42), 0, BY, mx(s, 107), 14, { mat: 'sand', color: SAND });
      fillUnder(b, 'z', mz(n, 36), mz(n, 42), 0, BY, mx(s, 107), 14);
    }
  // the natural arch over the basin
  rock(100, 4.5, 49, 114, 6.5, MZ);
  // site cover
  rock(110, BY, 43.5, 112.5, BY + 2.5, 45.5); // full
  rock(103, BY, 46, 105.5, BY + 1.2, 48); // half
  rock(100, BY, 48, 101.5, BY + 2.5, MZ); // full, against the end wall

  // ======================= outer path cover =======================
  quad(84, 0, 8, 86, 1.2, 9.6, 'rock', { color: 0x94634a }); // half
  rock(95, 0, 12.2, 97.5, 2.6, 14); // full

  // ======================= Towers, spawns, Controller homes =======================
  const towers: TowerDef[] = [];
  const spawns: SpawnDef[] = [];
  const homes: Vec3[] = [];
  for (const team of [0, 1] as const) {
    const n: Sign = team === 0 ? 1 : -1;
    const tp = C.towers[team];
    const tc = team === 0 ? CYAN : ORANGE;
    b.block(v3(tp.x, 3, tp.z), v3(2, 6, 2), { mat: team === 0 ? 'teamA' : 'teamB', trim: tc });
    towers.push({ team, pos: tp, radius: 1.5, height: 6 });
    homes.push(v3(tp.x, 0.9, mz(n, 12.5)));
    for (const z of [7.5, 13.5])
      for (const x of [49.5, 53, 67, 70.5])
        spawns.push({ pos: v3(x, 0, mz(n, z)), yawDeg: team === 0 ? 180 : 0, team });
  }

  // ======================= launch pads (mesa edge → far mesa) =======================
  const launchPads: LaunchPadDef[] = [];
  for (const n of SIGNS)
    for (const s of SIGNS)
      launchPads.push({
        min: v3(Math.min(mx(s, 68.5), mx(s, 71.5)), M, Math.min(mz(n, 37), mz(n, 40))),
        max: v3(Math.max(mx(s, 68.5), mx(s, 71.5)), M + 2.5, Math.max(mz(n, 37), mz(n, 40))),
        vel: v3(s * C.padVel.x, C.padVel.y, n * C.padVel.z),
      });

  decorate(box, quad, decoQuad, light, launchPads);

  return b.build({
    name: 'Canyon Relay',
    boundsMin: v3(0, GF - 2, 0),
    boundsMax: v3(120, 14, 100),
    defaultGravity: v3(0, -1, 0),
    zones: [],
    rails: [],
    pads: [],
    spawns,
    towers,
    controllerHomes: homes,
    waypoints: waypoints(),
    areas: [
      { name: 'Cyan camp', pos: v3(60, 0, 13), yawDeg: 180 },
      { name: 'Orange camp', pos: v3(60, 0, 87), yawDeg: 0 },
      { name: 'North mesa', pos: v3(78, M, 21), yawDeg: 180 },
      { name: 'North spire', pos: v3(62, SPT, 27), yawDeg: 180 },
      { name: 'East bridge', pos: v3(85, M, 44), yawDeg: 180 },
      { name: 'Relay rock', pos: v3(60, R.top, 48), yawDeg: 180 },
      { name: 'A site (east basin)', pos: v3(107, BY, 44), yawDeg: 180 },
      { name: 'B site (west basin)', pos: v3(13, BY, 44), yawDeg: 180 },
      { name: 'East slot canyon', pos: v3(107, 0, 11), yawDeg: 180 },
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
    killVolumes: [
      { min: v3(C.gorge.x0, GF - 10, C.gorge.z0), max: v3(C.gorge.x1, C.killY, C.gorge.z1) },
    ],
    outdoor: {
      top: 0x8ec6e8,
      horizon: 0xf2a65a,
      ground: 0xc98a55,
      sun: { dir: v3(-0.85, 0.1, 0.3), color: 0xfff1c9, sizeDeg: 5 },
      sunLight: 0xffd9a8,
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
  light: (x: number, y: number, z: number, color: number, radius: number, k: number) => void,
  pads: LaunchPadDef[],
): void => {
  const C = CANYON_RELAY;
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
  quad(58, R.top + 0.01, 48, 62, R.top + 0.06, 48.15, 'trim', { color: 0x7fe9ff, noCollide: true });
  quad(61.85, R.top + 0.01, 48, 62, R.top + 0.06, 50, 'trim', { color: 0x7fe9ff, noCollide: true });
  light(60, R.top + 1.5, 50, 0x7fe9ff, 7, 0.9);
  // team banners on the camp walls
  for (const n of [1, -1] as const) {
    const tc = n > 0 ? CYAN : ORANGE;
    const z = n > 0 ? 15.95 : 84.05;
    const z2 = n > 0 ? 15.9 : 84.1;
    box(56, 4, Math.min(z, z2), 64, 4.3, Math.max(z, z2), 'trim', { color: tc, noCollide: true });
    light(60, 3, n > 0 ? 12 : 88, tc, 10, 0.6);
  }

  // cacti and shrubs up on the rims and far below in the gorge (never where anyone hides)
  const cactus = (x: number, y: number, z: number, h: number) => {
    decoQuad(x - 0.35, y, z - 0.35, x + 0.35, y + h, z + 0.35, 'leaf', CACTUS);
    decoQuad(x + 0.35, y + h * 0.45, z - 0.25, x + 1.1, y + h * 0.55, z + 0.25, 'leaf', CACTUS);
    decoQuad(x + 0.85, y + h * 0.5, z - 0.25, x + 1.1, y + h * 0.85, z + 0.25, 'leaf', CACTUS);
    decoQuad(x - 1, y + h * 0.3, z - 0.25, x - 0.35, y + h * 0.4, z + 0.25, 'leaf', CACTUS);
    decoQuad(x - 1, y + h * 0.35, z - 0.25, x - 0.75, y + h * 0.65, z + 0.25, 'leaf', CACTUS);
  };
  cactus(70, 14, -2, 3.2);
  cactus(96, 14, 2, 2.6);
  cactus(119, 14, 20, 3);
  cactus(118, 14, 40, 2.4);
  cactus(96, 9.5, 20, 2.2);
  cactus(78, C.gorgeFloor, 46, 2.8);
  const shrub = (x: number, y: number, z: number, w: number) =>
    decoQuad(x - w, y, z - w, x + w, y + w * 0.9, z + w, 'leaf', SHRUB);
  shrub(85, 14, 1, 1.1);
  shrub(117, 14, 30, 0.9);
  shrub(94, 9.5, 36, 0.8);
  shrub(70, C.gorgeFloor, 44, 1.2);
  shrub(92, C.gorgeFloor, 47, 0.9);
  // gorge floor: a dry riverbed and fallen rocks
  decoQuad(60, C.gorgeFloor + 0.01, 48.5, 98, C.gorgeFloor + 0.04, MZ, 'sand', 0x8f6a4a);
  decoQuad(66, C.gorgeFloor, 43, 70, C.gorgeFloor + 2.2, 46, 'rock', 0x7a4636);
  decoQuad(88, C.gorgeFloor, 44, 91, C.gorgeFloor + 1.5, 47.5, 'rock', 0x7a4636);

  // far scenery: distant mesas and buttes in the haze, and the plain beyond the cliffs
  decoQuad(60, 13.9, -60, 200, 14, 4, 'sand', 0xc99d68);
  decoQuad(114, 13.9, 4, 200, 14, MZ, 'sand', 0xc99d68);
  decoQuad(80, 14, -110, 140, 42, -80, 'rock', 0xa45a3a);
  decoQuad(150, 14, -40, 185, 30, 10, 'rock', 0xb86a42);
  decoQuad(170, 14, 20, 200, 55, MZ, 'rock', 0x9c5438);
  decoQuad(60, 14, -170, 95, 62, -140, 'rock', 0x8e4c34);
  decoQuad(120, 14, -150, 135, 80, -135, 'rock', SHADE);
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
    const opts = { mat: 'rock' as Material, color: 0x94634a };
    if (axis === 'z') b.box(v3(w0, yLow, lo), v3(w1, top, hi), opts);
    else b.box(v3(lo, yLow, w0), v3(hi, top, w1), opts);
  }
};

/**
 * Bot waypoints, named (tests and tools/map refer to them by name). Authored in the north-east
 * quarter at world coordinates and mirrored into the others; names get N/S and E/W suffixes
 * ('mesaNNE'); a waypoint on x = 60 has only N/S ('towerN'), one on z = 50 only E/W ('siteE' =
 * A, 'siteW' = B), one on both neither ('relay'). Links are two-way except the drop onto the
 * relay rock.
 */
const waypoints = (): WaypointDef[] => {
  const M = CANYON_RELAY.mesa;
  const BY = CANYON_RELAY.basin;
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

  // camp and outer path
  add('tower', MX, 0, 12);
  add('sp', 66, 0, 14.5);
  add('gateIn', 72.5, 0, 14.8);
  add('gate', 74, 0, 11);
  add('gateOut', 78.5, 0, 11);
  add('path1', 83, 0, 11);
  add('path2', 90, 0, 11);
  add('path3', 97, 0, 10.5);
  // cliff ramp onto the mesa
  add('rampFoot', 90.5, 0, 16);
  add('rampTop', 80.5, 3.4, 16);
  add('landing', 78, M, 16);
  // the mesa
  add('mesaN', 78, M, 20.5);
  add('mesaNE', 89, M, 21);
  add('spineN', 66, M, 21.5);
  add('midN', MX, M, 21.5);
  add('passTop', 91, M, 30);
  add('mesaMid', 84, M, 34.5);
  add('bridge', 85, M, 40.5);
  add('bridgeMid', 85, M, MZ);
  add('edgeE', 74, M, 34);
  add('spineS', 65, M, 33);
  add('midS', MX, M, 33);
  add('edge', MX, M, 39.5);
  add('relay', MX, CANYON_RELAY.relay.top, MZ);
  // the spire
  add('spireFoot', 75.5, M, 27);
  add('spireRamp', 69, 6.5, 27);
  add('spireTop', 62, CANYON_RELAY.spire.top, 27);
  add('spire', MX, CANYON_RELAY.spire.top, 27);
  // slot canyon, basin, site
  add('passBot', 101.5, 0, 30);
  add('cOut', 107, 0, 10.5);
  add('c1', 103, 0, 19);
  add('c2', 108.5, 0, 24);
  add('c2b', 109, 0, 30);
  add('c3', 104, 0, 31);
  add('cDip', 107, 0, 34.5);
  add('basin', 107, BY, 44);
  add('site', 107, BY, MZ);

  chain('tower', 'sp', 'gateIn', 'gate', 'gateOut', 'path1', 'path2', 'path3', 'cOut');
  chain('path2', 'rampFoot', 'rampTop', 'landing', 'mesaN');
  chain('mesaN', 'spineN', 'midN');
  chain('mesaN', 'mesaNE', 'passTop', 'mesaMid', 'bridge', 'bridgeMid');
  link('mesaNE', 'mesaMid');
  chain('mesaMid', 'edgeE', 'spineS', 'edge');
  link('spineS', 'midS');
  link('edge', 'relay', true);
  chain('mesaN', 'spireFoot', 'edgeE');
  chain('spireFoot', 'spireRamp', 'spireTop', 'spire');
  chain('passTop', 'passBot', 'c3', 'cDip', 'basin', 'site');
  chain('c3', 'c2b', 'c2', 'c1', 'cOut');
  link('c2b', 'cDip');
  return wps;
};
