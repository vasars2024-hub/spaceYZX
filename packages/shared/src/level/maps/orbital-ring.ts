// "Orbital Ring" — a station built around a reactor core, laid out on the owner's 120 × 120 m
// plan (world x = plan x, east; world z = plan y, south; main floor y 0). Mirror-symmetric
// north ↔ south across z = 60 (Cyan, team 0, spawns north; Orange, team 1, south) and built the
// same east ↔ west; bomb site A is east, B west, halfway between the spawns.
//
//   REACTOR CORE (centre 60, 60)  an octagonal platform (radius 12) under a glass dome (radius
//        14, top y 16). A hole (radius 6) in its middle drops into the reactor pit (y -8); the
//        pit's two launch pads fire you back up through the hole, past the power-ups floating
//        over it. Launch pads beside the east / west balconies (y 6) throw you up onto them; a
//        zip-rail runs balcony to balcony over the hole
//   RING (y 0)                    an octagonal corridor round the core (radius 20.5..27.5), open
//        to the core on its four straight sides, walled (with a door) on the diagonals
//   BASEMENT RING (y -4)          a second, wider ring (radius 33.5..38.5) under the spokes:
//        eight stairwells from the ring (two beside each spoke), four ramped tunnels to the pit
//   SPOKES                        6 m corridors: north / south from the spawns to the ring,
//        east / west from the ring to the sites, each with a gate in the ring's wall
//   OUTER CORRIDORS               the long way round: from each spawn's side door along the
//        station's edge into the sites, with a zip-rail, a gate, a tight corner and windows
//        onto the planet
//   RIFT PORTALS                  at the back of each site: walk into A's and you come out of
//        B's (and back) — the fastest rotation on the map, and the loudest
//
// Rooms are open volumes; `shellAround` puts 1 m walls around them (rooms 1 m apart share a
// wall, a 1 m deep volume through it is a doorway). The octagons are the square rooms with
// their corners cut off by 45° walls.
import type { Vec3 } from '../../math/vec3';
import { v3 } from '../../math/vec3';
import { qFromAxisAngle } from '../../math/quat';
import { LevelBuilder, shellAround, type OpenVolume, type SurfaceStyle } from '../builder';
import type {
  BoxDef,
  LaunchPadDef,
  LevelDef,
  LightDef,
  Material,
  PortalDef,
  RailDef,
  SpawnDef,
  TowerDef,
  WaypointDef,
} from '../types';

const CYAN = 0x19e3ff;
const ORANGE = 0xff8a1f;
const VIOLET = 0xa46bff;
const TEAL = 0x3dffd0;
const WHITE = 0xd8e6ff;
const AMBER = 0xffb347;
const HAZARD = 0xd8a21a;
const SITE = 0xc23b3b;
const PLANET = 0x7fb2ff;

/** the middle of the map (x and z): the reactor core; also the north ↔ south mirror line */
const MID = 60;

/** Key coordinates (world = the plan). The south half mirrors the north half (z → 120 - z). */
export const ORBITAL_RING = {
  center: v3(MID, 0, MID),
  /** octagons around the centre, given by their apothem (centre → middle of a side) */
  core: 12,
  hole: 6,
  dome: { r: 14, top: 16 },
  ring: { in: 20.5, out: 27.5, h: 6 },
  basement: { y: -4, in: 33.5, out: 38.5 },
  pit: { y: -8, r: 10 },
  balcony: 6,
  spawn: { x0: 46, x1: 74, z0: 4, z1: 18, h: 8 },
  site: { x0: 98, x1: 118, z0: 42, z1: 78, h: 10 },
  /** Towers: Cyan's (north) first */
  towers: [v3(60, 0, 9), v3(60, 0, 111)] as [Vec3, Vec3],
  bombSites: {
    A: { min: v3(103, 0, 52), max: v3(115, 3, 68) },
    B: { min: v3(5, 0, 52), max: v3(17, 3, 68) },
  },
  /** floating over the hole, either side of the middle */
  powerups: [v3(56, 1.5, 60), v3(64, 1.5, 60)],
};

const CORE_FLOOR: SurfaceStyle = { mat: 'plate', color: 0x4a4e66 };
const DOME_GLASS: SurfaceStyle = { mat: 'skyglass' };
const RING_FLOOR: SurfaceStyle = { mat: 'plate' };
const RING_WALL: SurfaceStyle = { mat: 'hull', color: 0x3c4658 };
const BASE_FLOOR: SurfaceStyle = { mat: 'plate', color: 0x3c4150 };
const BASE_WALL: SurfaceStyle = { mat: 'engine', color: 0x3b3644 };
const BASE_CEIL: SurfaceStyle = { mat: 'hull', color: 0x2a2f3c };
const OUTER_FLOOR: SurfaceStyle = { mat: 'grate' };
const SITE_WALL: SurfaceStyle = { mat: 'panel' };
const SPAWN_WALL: SurfaceStyle = { mat: 'hull', color: 0x34506a };

type Sign = 1 | -1;
const SIGNS: Sign[] = [1, -1];
/** north (1) first: Cyan's half, then Orange's */
const NS: Sign[] = [1, -1];
/** x authored for the east half, mirrored to the west (s = -1) */
const mx = (s: Sign, x: number) => (s > 0 ? x : 2 * MID - x);
/** z authored for the north half, mirrored to the south (s = -1) */
const mz = (s: Sign, z: number) => (s > 0 ? z : 2 * MID - z);
/** tan 22.5°: half a regular octagon's side per metre of apothem */
const OCT = Math.SQRT2 - 1;
const DIAG = Math.SQRT1_2;

export const buildOrbitalRing = (): LevelDef => {
  const O = ORBITAL_RING;
  const RH = O.ring.h;
  const BY = O.basement.y;
  const PY = O.pit.y;
  const BAL = O.balcony;
  const ST = O.site;
  const SP = O.spawn;
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
    mat: Material = 'crate',
    extra: Omit<BoxDef, 'c' | 'h' | 'mat'> = {},
  ) =>
    b.box(
      v3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      v3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
      { mat, ...extra },
    );
  /** decoration only (no collision) */
  const deco = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material,
    extra: Omit<BoxDef, 'c' | 'h' | 'mat'> = {},
  ) => box(x0, y0, z0, x1, y1, z1, mat, { noCollide: true, ...extra });
  const light = (
    x: number,
    y: number,
    z: number,
    color: number,
    radius: number,
    intensity: number,
    shaft = false,
  ) => lights.push({ pos: v3(x, y, z), color, radius, intensity, shaft });

  /**
   * A box turned about the vertical, on one side of an octagon around the centre: side `k`
   * (0..7) faces the direction k × 45° from east (odd k: the diagonals). `radial` is the
   * distance of its middle from the centre, `along` its offset along the side.
   */
  const side = (
    k: number,
    radial: number,
    along: number,
    halfAlong: number,
    halfAcross: number,
    y0: number,
    y1: number,
    mat: Material,
    extra: Omit<BoxDef, 'c' | 'h' | 'mat' | 'q'> = {},
  ) => {
    const a = (k * Math.PI) / 4;
    const nx = Math.cos(a);
    const nz = Math.sin(a);
    // along the side: (-nz, nx); a turn of θ about +y maps +x to (cos θ, -sin θ)
    b.boxes.push({
      c: v3(MID + nx * radial - nz * along, (y0 + y1) / 2, MID + nz * radial + nx * along),
      h: v3(halfAlong, (y1 - y0) / 2, halfAcross),
      q: qFromAxisAngle(v3(0, 1, 0), Math.atan2(-nx, -nz)),
      mat,
      ...extra,
    });
  };
  /**
   * Cut the four corners of a square room (half-size `apothem`) into an octagon: a wall `t`
   * thick on each diagonal, reaching exactly into the square's walls.
   */
  const chamfer = (
    apothem: number,
    t: number,
    y0: number,
    y1: number,
    mat: Material,
    extra: Omit<BoxDef, 'c' | 'h' | 'mat' | 'q'> = {},
  ) => {
    for (const k of [1, 3, 5, 7])
      side(k, apothem + t / 2, 0, apothem * OCT, t / 2, y0, y1, mat, extra);
  };

  // ======================= open volumes =======================
  const vols: OpenVolume[] = [];
  const room = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    o: Omit<OpenVolume, 'min' | 'max'> = {},
  ) =>
    vols.push({
      min: v3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      max: v3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
      ...o,
    });
  /** a doorway / window / floor hole: carves, adds no walls of its own */
  const door = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
    room(x0, y0, z0, x1, y1, z1, { walls: false });
  const ringStyle = { floor: RING_FLOOR, wall: RING_WALL };
  const base = { floor: BASE_FLOOR, wall: BASE_WALL, ceiling: BASE_CEIL };
  const outer = { floor: OUTER_FLOOR, wall: RING_WALL };
  const D = O.dome.r;
  const RO = O.ring.out;
  const PR = O.pit.r;
  const H = O.hole;
  const BI = O.basement.in;
  const BO = O.basement.out;
  const lo = (r: number) => MID - r;
  const hi = (r: number) => MID + r;

  // Only the north half and the rooms across the middle are listed: `mirroredShell` builds
  // the south half's walls from them. East and west are both listed.
  // ---- the core: dome first (its floor style wins), the ring hall, the hole, the pit ----
  room(lo(D), 0, lo(D), hi(D), O.dome.top, hi(D), {
    lid: false,
    floor: CORE_FLOOR,
    wall: DOME_GLASS,
  });
  room(lo(RO), 0, lo(RO), hi(RO), RH, hi(RO), ringStyle);
  door(lo(H), -1, lo(H), hi(H), 0, hi(H));
  room(lo(PR), PY, lo(PR), hi(PR), -1, hi(PR), base);
  // pit tunnels: flat out of the pit, a ramp up, on to the basement ring
  room(58, PY, 36, 62, -1, lo(PR), base);
  room(58, BY, lo(BO) + 5, 62, -1, 36, base);
  for (const s of SIGNS) {
    room(mx(s, hi(PR)), PY, 58, mx(s, 84), -1, 62, base);
    room(mx(s, 84), BY, 58, mx(s, hi(BI)), -1, 62, base);
  }

  // ---- the basement ring (a square ring; its outer corners are cut) ----
  room(lo(BO), BY, lo(BO), hi(BO), -1, lo(BI), base);
  for (const s of SIGNS) room(mx(s, hi(BI)), BY, lo(BO), mx(s, hi(BO)), -1, hi(BO), base);

  // ---- stairwells ring → basement ring, two beside each spoke ----
  for (const s of SIGNS) {
    // beside the north spoke (the ramp runs away from it)
    room(mx(s, 64), BY, 27.5, mx(s, 76), 3, lo(RO) - 1, ringStyle);
    door(mx(s, 64), 0, lo(RO) - 1, mx(s, 66.5), 3, lo(RO));
    door(mx(s, 74), BY, lo(BI), mx(s, 76), -1, lo(BI) + 1);
    // beside the east / west spoke, north side
    room(mx(s, hi(RO) + 1), BY, 44, mx(s, hi(BI) - 1), 3, 56, ringStyle);
    door(mx(s, hi(RO)), 0, 53.5, mx(s, hi(RO) + 1), 3, 56);
    door(mx(s, hi(BI) - 1), BY, 44, mx(s, hi(BI)), -1, 46);
  }

  // ---- the spawn (north) and its spoke to the ring ----
  room(SP.x0, 0, SP.z0, SP.x1, SP.h, SP.z1, { wall: SPAWN_WALL });
  door(58.5, 0, SP.z1, 61.5, 4, SP.z1 + 1);
  room(57, 0, SP.z1 + 1, 63, 5, lo(RO) - 1, ringStyle);
  door(58, 0, lo(RO) - 1, 62, 4.5, lo(RO));

  for (const s of SIGNS) {
    // ---- east / west spoke: ring → site ----
    room(mx(s, hi(RO) + 1), 0, 57, mx(s, ST.x0 - 1), 5, 63, ringStyle);
    door(mx(s, hi(RO)), 0, 58, mx(s, hi(RO) + 1), 4.5, 62);
    door(mx(s, ST.x0 - 1), 0, 57, mx(s, ST.x0), 4.5, 63);
    // ---- the site (glass ceiling) ----
    room(mx(s, ST.x0), 0, ST.z0, mx(s, ST.x1), ST.h, ST.z1, { lid: false, wall: SITE_WALL });
    // ---- outer corridor: spawn side door, along the north edge, down into the site ----
    door(mx(s, SP.x1), 0, 9.5, mx(s, SP.x1 + 1), 4, 12.5);
    room(mx(s, SP.x1 + 1), 0, 8, mx(s, 110), 6, 14, outer);
    room(mx(s, 104), 0, 8, mx(s, 110), 6, ST.z0 - 1, outer);
    door(mx(s, 105), 0, ST.z0 - 1, mx(s, 109), 4.5, ST.z0);
    // windows onto the planet (skyglass fills them below)
    door(mx(s, 78), 2, 7, mx(s, 100), 5.5, 8);
    door(mx(s, 110), 2, 16, mx(s, 111), 5.5, 38);
  }

  mirroredShell(b, vols);

  // ======================= octagons: cut corners =======================
  const ringWall = { color: RING_WALL.color };
  chamfer(RO, 1, 0, RH, 'hull', ringWall);
  chamfer(D, 1, RH, O.dome.top, 'skyglass');
  chamfer(PR, 1, PY, -1, 'engine', { color: BASE_WALL.color });
  // the hole: floor fills its square's corners
  chamfer(H, H * Math.SQRT2 - H + 0.01, -1, 0, 'plate', { color: CORE_FLOOR.color });
  // basement ring: short 45° walls across its outer corners
  for (const k of [1, 3, 5, 7])
    side(k, (BI + BO) * DIAG + 0.5, 0, 3.6, 0.5, BY, -1, 'engine', { color: BASE_WALL.color });

  // ======================= glass: dome, site ceilings, windows =======================
  box(lo(D) - 1, O.dome.top, lo(D) - 1, hi(D) + 1, O.dome.top + 1, hi(D) + 1, 'skyglass');
  for (const s of SIGNS) {
    box(mx(s, ST.x0 - 1), ST.h, ST.z0 - 1, mx(s, ST.x1 + 1), ST.h + 1, ST.z1 + 1, 'skyglass');
    for (const n of NS) {
      box(mx(s, 78), 2, mz(n, 7), mx(s, 100), 5.5, mz(n, 8), 'skyglass');
      box(mx(s, 110), 2, mz(n, 16), mx(s, 111), 5.5, mz(n, 38), 'skyglass');
    }
  }

  // ======================= core detail =======================
  // the ring's inner edge: walls on the diagonals (a 4 m door in each), pillars at the corners
  for (const k of [1, 3, 5, 7])
    for (const a of [-5.25, 5.25])
      side(k, O.ring.in - 0.5, a, 3.25, 0.5, 0, RH, 'panel', {
        color: 0x5a5f78,
        trim: VIOLET,
      });
  const vx = (O.ring.in - 0.5) * OCT;
  const va = O.ring.in - 0.5;
  for (const [px, pz] of [
    [vx, va],
    [va, vx],
  ])
    for (const s of SIGNS)
      for (const n of NS)
        box(
          mx(s, MID + px - 0.8),
          0,
          mz(n, MID - pz - 0.8),
          mx(s, MID + px + 0.8),
          RH,
          mz(n, MID - pz + 0.8),
          'pillar',
          { trim: WHITE },
        );
  // a knee-high rim on the hole's diagonal sides (the straight sides are open: drop in there)
  for (const k of [1, 3, 5, 7])
    side(k, H + 0.15, 0, H * OCT, 0.15, 0, 1, 'panel', { trim: VIOLET });
  for (const n of NS) {
    // coolant pumps north / south of the hole: no line runs spoke to spoke over it
    box(57, 0, mz(n, 48.5), 63, 3, mz(n, 50), 'engine', { trim: TEAL });
  }
  for (const s of SIGNS) {
    // east / west: a console bank under each balcony (blocks the site-to-site line)
    box(mx(s, 71), 0, 57, mx(s, 74), 3, 63, 'engine', { trim: TEAL });
    // the balcony (grating) and its two posts
    box(mx(s, 71), BAL - 0.5, 54.5, mx(s, 74), BAL, 65.5, 'grate', { trim: VIOLET });
    for (const n of NS) box(mx(s, 73), 0, mz(n, 54.5), mx(s, 74), BAL - 0.5, mz(n, 55.5), 'pillar');
  }
  // the reactor: a glowing core floating in the pit (you fly past it off the pads)
  b.boxes.push({
    c: v3(MID, PY + 3.2, MID),
    h: v3(0.9, 0.9, 0.9),
    q: qFromAxisAngle(v3(0.577, 0.577, 0.577), 0.9),
    mat: 'engine',
    trim: TEAL,
    noCollide: true,
  });
  deco(lo(H), PY + 0.01, lo(H), hi(H), PY + 0.05, hi(H), 'trim', { color: 0x1a4a44 });
  // the core platform's edge: an octagon of trim on the floor
  for (let k = 0; k < 8; k++)
    side(k, O.core, 0, O.core * OCT, 0.08, 0.01, 0.05, 'trim', { color: VIOLET, noCollide: true });

  // ======================= ring and basement cover =======================
  for (const k of [1, 3, 5, 7]) {
    // half-height crates against the outer wall of each diagonal leg
    for (const a of [-7, 7]) side(k, 26.2, a, 1, 1, 0, 1.2, 'crate');
  }
  for (const s of SIGNS)
    for (const n of NS) {
      box(mx(s, 80), BY, mz(n, lo(BO)), mx(s, 82), BY + 1.2, mz(n, lo(BO) + 1.5), 'engine');
      box(mx(s, hi(BO) - 1.5), BY, mz(n, 40), mx(s, hi(BO)), BY + 1.2, mz(n, 42), 'engine');
    }

  // ======================= ramps: stairwells and pit tunnels =======================
  for (const s of SIGNS)
    for (const n of NS) {
      // beside the north / south spoke: landing, ramp down along x, fill under it
      box(mx(s, 64), BY, mz(n, 27.5), mx(s, 66), 0, mz(n, 31.5), 'panel');
      b.ramp('x', mx(s, 66), mx(s, 74), 0, BY, mz(n, 29.5), 4, { mat: 'grate' });
      fillUnder(b, 'x', mx(s, 66), mx(s, 74), 0, BY, mz(n, 29.5), 4);
      // beside the east / west spoke: the same turned along z
      box(mx(s, 88.5), BY, mz(n, 54), mx(s, 92.5), 0, mz(n, 56), 'panel');
      b.ramp('z', mz(n, 54), mz(n, 46), 0, BY, mx(s, 90.5), 4, { mat: 'grate' });
      fillUnder(b, 'z', mz(n, 54), mz(n, 46), 0, BY, mx(s, 90.5), 4);
    }
  for (const n of NS) {
    b.ramp('z', mz(n, 36), mz(n, 46), BY, PY, MID, 4, { mat: 'grate' });
    fillUnder(b, 'z', mz(n, 36), mz(n, 46), BY, PY, MID, 4);
  }
  for (const s of SIGNS) {
    b.ramp('x', mx(s, 84), mx(s, 74), BY, PY, MID, 4, { mat: 'grate' });
    fillUnder(b, 'x', mx(s, 84), mx(s, 74), BY, PY, MID, 4);
  }

  // ======================= spawns: screens =======================
  for (const n of NS) {
    const tc = n > 0 ? CYAN : ORANGE;
    // a screen inside each side door (the outer corridors run straight at it); the spoke
    // needs none: the spoke door and the ring gate only line up on the middle of the spawn
    for (const s of SIGNS)
      box(mx(s, 70), 0, mz(n, 8), mx(s, 71), 4, mz(n, 14), 'pillar', { trim: tc });
  }

  // ======================= outer corridors =======================
  for (const s of SIGNS)
    for (const n of NS) {
      const X = (x: number) => mx(s, x);
      const Z = (z: number) => mz(n, z);
      // the gate on the long leg: a 3 m frame
      box(X(90), 0, Z(8), X(92), RH, Z(9.5), 'hull', { trim: HAZARD });
      box(X(90), 0, Z(12.5), X(92), RH, Z(14), 'hull', { trim: HAZARD });
      box(X(90), 4.5, Z(9.5), X(92), RH, Z(12.5), 'hull', { trim: HAZARD });
      // a pillar tightening the corner
      box(X(107.5), 0, Z(8), X(110), RH, Z(10.5), 'pillar', { trim: WHITE });
      // the gate on the leg down to the site
      box(X(104), 0, Z(27), X(105.5), RH, Z(29), 'hull', { trim: HAZARD });
      box(X(108.5), 0, Z(27), X(110), RH, Z(29), 'hull', { trim: HAZARD });
      box(X(105.5), 4.5, Z(27), X(108.5), RH, Z(29), 'hull', { trim: HAZARD });
      // half-height cover, staggered
      box(X(81), 0, Z(8), X(83), 1.2, Z(10), 'crate');
      box(X(96), 0, Z(12), X(98), 1.2, Z(14), 'crate');
      box(X(104), 0, Z(19), X(106), 1.2, Z(21), 'crate');
      box(X(108), 0, Z(34), X(110), 1.2, Z(36), 'crate');
    }

  // ======================= sites: cover, portal frames =======================
  for (const s of SIGNS) {
    const X = (x: number) => mx(s, x);
    for (const n of NS) {
      const Z = (z: number) => mz(n, z);
      box(X(101), 0, Z(49), X(104), 2.5, Z(52), 'crate', { trim: SITE }); // full
      box(X(113), 0, Z(51), X(115), 1.2, Z(53), 'crate'); // half
      box(X(114), 0, Z(44), X(117), 2.5, Z(47), 'crate', { trim: SITE }); // full, back corner
      // a screen inside the outer corridor's door: no line runs corridor → site → corridor
      box(X(105), 0, Z(44.5), X(109), 2.5, Z(45.5), 'panel', { trim: SITE });
      // portal frame posts
      box(X(116.5), 0, Z(57), X(ST.x1), 4.3, Z(58), 'pillar', { trim: TEAL });
    }
    box(X(116.5), 4.3, 57, X(ST.x1), 5, 63, 'pillar', { trim: TEAL });
  }

  // ======================= Towers, spawns, Controller homes =======================
  const towers: TowerDef[] = [];
  const spawns: SpawnDef[] = [];
  const homes: Vec3[] = [];
  for (const team of [0, 1] as const) {
    const n: Sign = team === 0 ? 1 : -1;
    const tp = O.towers[team];
    const tc = team === 0 ? CYAN : ORANGE;
    b.block(v3(tp.x, 3, tp.z), v3(2, 6, 2), { mat: team === 0 ? 'teamA' : 'teamB', trim: tc });
    towers.push({ team, pos: tp, radius: 1.5, height: 6 });
    homes.push(v3(tp.x, 0.9, mz(n, 12.5)));
    for (const z of [7.5, 13])
      for (const x of [51.5, 55, 65, 68.5])
        spawns.push({ pos: v3(x, 0, mz(n, z)), yawDeg: team === 0 ? 180 : 0, team });
  }

  // ======================= zip-rails, launch pads, portals =======================
  const RAIL_Y = 3.5; // floor + 3.5: jump to grab (as on Kestrel)
  const rails: RailDef[] = [
    // balcony to balcony over the hole
    { points: [v3(72.5, BAL + RAIL_Y, MID), v3(47.5, BAL + RAIL_Y, MID)] },
  ];
  // along each outer corridor's long leg, spawn end to the corner
  for (const n of NS)
    for (const s of SIGNS)
      rails.push({
        points: [v3(mx(s, 79), RAIL_Y, mz(n, 11)), v3(mx(s, 103), RAIL_Y, mz(n, 11))],
      });

  const launchPads: LaunchPadDef[] = [];
  // pit: up through the hole and out onto the core floor (the west pad throws east)
  for (const s of SIGNS)
    launchPads.push({
      min: v3(s > 0 ? 56.5 : 60.5, PY, 58.5),
      max: v3(s > 0 ? 59.5 : 63.5, PY + 2.5, 61.5),
      vel: v3(s * 6.5, 20, 0),
    });
  // core: beside each balcony, up and outward onto it
  for (const s of SIGNS)
    for (const n of NS)
      launchPads.push({
        min: v3(Math.min(mx(s, 68), mx(s, 70)), 0, Math.min(mz(n, 54.5), mz(n, 56.5))),
        max: v3(Math.max(mx(s, 68), mx(s, 70)), 2.5, Math.max(mz(n, 54.5), mz(n, 56.5))),
        vel: v3(s * 2.5, 18, 0),
      });

  // rift portals: into the back of one site, out at the back of the other (same heading)
  const portals: PortalDef[] = [];
  for (const s of SIGNS)
    portals.push({
      name: s > 0 ? 'A → B' : 'B → A',
      min: v3(Math.min(mx(s, 116.6), mx(s, ST.x1)), 0, 58),
      max: v3(Math.max(mx(s, 116.6), mx(s, ST.x1)), 4, 62),
      exit: v3(mx(-s as Sign, 114.5), 1, MID),
      color: TEAL,
    });

  // ======================= looks =======================
  decorate(deco, light, launchPads, portals);

  return b.build({
    name: 'Orbital Ring',
    boundsMin: v3(0, PY - 2, 0),
    boundsMax: v3(120, O.dome.top + 2, 120),
    defaultGravity: v3(0, -1, 0),
    zones: [],
    rails,
    pads: [],
    spawns,
    towers,
    controllerHomes: homes,
    waypoints: waypoints(),
    areas: [
      { name: 'Cyan spawn', pos: v3(60, 0, 16.5), yawDeg: 180 },
      { name: 'Orange spawn', pos: v3(60, 0, 103.5), yawDeg: 0 },
      { name: 'Reactor core', pos: v3(60, 0, 44), yawDeg: 180 },
      { name: 'Reactor pit', pos: v3(60, PY, 52), yawDeg: 180 },
      { name: 'East balcony', pos: v3(72.5, BAL, 60), yawDeg: 90 },
      { name: 'A site', pos: v3(101, 0, 60), yawDeg: -90 },
      { name: 'B site', pos: v3(19, 0, 60), yawDeg: 90 },
      { name: 'Ring (north)', pos: v3(60, 0, 36), yawDeg: -90 },
      { name: 'Basement ring', pos: v3(60, BY, 24), yawDeg: -90 },
      { name: 'NE outer corridor', pos: v3(80, 0, 11), yawDeg: -90 },
    ],
    fog: { color: 0x070a16, near: 45, far: 170 },
    ambient: 0.8,
    lights,
    bombSites: [
      { name: 'A', ...O.bombSites.A },
      { name: 'B', ...O.bombSites.B },
    ],
    powerups: O.powerups,
    launchPads,
    portals,
    sky: {
      moons: [
        // the planet the station orbits, filling the dome
        { dir: norm(v3(0.25, 0.8, 0.45)), sizeDeg: 34, color: PLANET },
        { dir: norm(v3(-0.6, 0.5, -0.6)), sizeDeg: 4, color: 0xdfe6f5 },
        { dir: norm(v3(0.9, 0.2, -0.35)), sizeDeg: 1.6, color: 0xf2d2a8 },
      ],
    },
  });
};

/**
 * `shellAround` for a map mirrored across z = 60: builds the north half's walls (volumes cut a
 * little past the middle, so no wall appears there) and mirrors them, so both halves get
 * exactly the same boxes (the greedy merge alone would split them differently).
 */
const mirroredShell = (b: LevelBuilder, vols: OpenVolume[]): void => {
  const north = vols
    .filter((v) => v.min.z < MID)
    .map((v) => ({ ...v, max: v3(v.max.x, v.max.y, Math.min(v.max.z, MID + 2)) }));
  const half = new LevelBuilder();
  shellAround(half, north);
  for (const bx of half.boxes) {
    const min = v3(bx.c.x - bx.h.x, bx.c.y - bx.h.y, bx.c.z - bx.h.z);
    const max = v3(bx.c.x + bx.h.x, bx.c.y + bx.h.y, Math.min(MID, bx.c.z + bx.h.z));
    if (max.z - min.z < 1e-6) continue;
    const opts = { mat: bx.mat, ...(bx.color !== undefined ? { color: bx.color } : {}) };
    b.box(min, max, opts);
    b.box(v3(min.x, min.y, 2 * MID - max.z), v3(max.x, max.y, 2 * MID - min.z), opts);
  }
};

const norm = (p: Vec3): Vec3 => {
  const l = Math.hypot(p.x, p.y, p.z) || 1;
  return v3(p.x / l, p.y / l, p.z / l);
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
    // the ramp is lowest over this step at its far end
    const surf = yHigh + ((yLow - yHigh) * (i + 1)) / steps;
    const top = surf - 0.8;
    if (top <= yLow + 0.1) continue;
    const lo = Math.min(a, c);
    const hi = Math.max(a, c);
    const w0 = across - width / 2;
    const w1 = across + width / 2;
    if (axis === 'z') b.box(v3(w0, yLow, lo), v3(w1, top, hi), { mat: 'panel' });
    else b.box(v3(lo, yLow, w0), v3(hi, top, w1), { mat: 'panel' });
  }
};

/** Markings and light: strip lights, site outlines, pad plates, portal glow, gate stripes. */
const decorate = (
  deco: (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material,
    extra?: Omit<BoxDef, 'c' | 'h' | 'mat'>,
  ) => void,
  light: (
    x: number,
    y: number,
    z: number,
    color: number,
    radius: number,
    intensity: number,
    shaft?: boolean,
  ) => void,
  pads: LaunchPadDef[],
  portals: PortalDef[],
): void => {
  const O = ORBITAL_RING;
  const BY = O.basement.y;
  const PY = O.pit.y;
  const RH = O.ring.h;
  // the reactor's glow from the pit, up through the hole
  light(MID, PY + 3, MID, TEAL, 16, 1.6);
  light(MID, 3, MID, TEAL, 12, 0.9, true);
  // moonlight through the dome
  for (const s of SIGNS) for (const n of NS) light(mx(s, 69), 14, mz(n, 51), PLANET, 18, 0.6);
  // ring: lights round the octagon; basement ring: amber lights along each side
  const mid = (O.ring.in + O.ring.out) / 2;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    light(MID + Math.cos(a) * mid, RH - 1.5, MID + Math.sin(a) * mid, WHITE, 11, 0.7);
  }
  const bm = (O.basement.in + O.basement.out) / 2;
  for (const s of SIGNS)
    for (const t of [-18, 0, 18]) {
      light(MID + t, BY + 2.5, mz(s, MID - bm), AMBER, 9, 0.7);
      light(mx(s, MID + bm), BY + 2.5, MID + t, AMBER, 9, 0.7);
    }
  for (const s of SIGNS) {
    // strip lights along the basement ring's ceiling
    deco(
      MID - bm + 1,
      -1.08,
      mz(s, MID - bm) - 0.1,
      MID + bm - 1,
      -1.02,
      mz(s, MID - bm) + 0.1,
      'trim',
      {
        color: AMBER,
      },
    );
    deco(
      mx(s, MID + bm) - 0.1,
      -1.08,
      MID - bm + 1,
      mx(s, MID + bm) + 0.1,
      -1.02,
      MID + bm - 1,
      'trim',
      {
        color: AMBER,
      },
    );
  }
  // spawns, spokes, outer corridors, stairwells, pit tunnels
  for (const n of NS) {
    const tc = n > 0 ? CYAN : ORANGE;
    light(MID, 7, mz(n, 11), tc, 14, 1.4, true); // over the spawn / Tower
    light(MID, 4.5, mz(n, 25), WHITE, 10, 0.8); // spoke
    light(MID, 3.5, mz(n, 31), AMBER, 7, 1.1); // spoke gate
    light(MID, BY + 2.5, mz(n, 36), AMBER, 8, 0.8); // pit tunnel
    for (const s of SIGNS) {
      light(mx(s, 80), 5, mz(n, 11), tc, 12, 0.9);
      light(mx(s, 96), 5, mz(n, 11), WHITE, 12, 0.9);
      light(mx(s, 91), 4, mz(n, 11), AMBER, 8, 1.1); // the gate
      light(mx(s, 107), 5, mz(n, 20), WHITE, 12, 0.9);
      light(mx(s, 107), 4, mz(n, 28), AMBER, 8, 1.1); // the gate
      light(mx(s, 107), 5, mz(n, 37), WHITE, 12, 0.9);
      light(mx(s, 70), 1.5, mz(n, 29.5), WHITE, 9, 0.8); // stairwell
      light(mx(s, 90.5), 1.5, mz(n, 50), WHITE, 9, 0.8); // stairwell
      // hazard stripes on the gate floors
      for (let i = 0; i < 3; i++) {
        deco(mx(s, 90), 0.01, mz(n, 9.5 + i), mx(s, 92), 0.05, mz(n, 10 + i), 'trim', {
          color: HAZARD,
        });
        deco(mx(s, 105.5 + i), 0.01, mz(n, 27), mx(s, 106 + i), 0.05, mz(n, 29), 'trim', {
          color: HAZARD,
        });
      }
    }
    for (let i = 0; i < 4; i++)
      deco(58 + i, 0.01, mz(n, 31.5), 58.5 + i, 0.05, mz(n, 32.5), 'trim', { color: HAZARD });
  }
  for (const s of SIGNS) {
    light(mx(s, 92.5), 4.5, MID, WHITE, 10, 0.8); // spoke
    light(mx(s, 88), 3.5, MID, AMBER, 7, 1.1); // spoke gate
    light(mx(s, 78), BY + 2.5, MID, AMBER, 8, 0.8); // pit tunnel
    // (placed symmetrically about z = 60, like everything else)
    for (let i = 0; i < 3; i++)
      deco(mx(s, 87.5), 0.01, 58.5 + i * 1.25, mx(s, 88.5), 0.05, 59 + i * 1.25, 'trim', {
        color: HAZARD,
      });
  }
  // sites: bright work lights, red outlines of the plant area
  for (const st of [O.bombSites.A, O.bombSites.B]) {
    const cx = (st.min.x + st.max.x) / 2;
    light(cx, 8.5, MID, WHITE, 20, 1.1, true);
    const y0 = 0.01;
    const y1 = 0.05;
    const w = 0.12;
    deco(st.min.x, y0, st.min.z, st.max.x, y1, st.min.z + w, 'trim', { color: SITE });
    deco(st.min.x, y0, st.max.z - w, st.max.x, y1, st.max.z, 'trim', { color: SITE });
    deco(st.min.x, y0, st.min.z, st.min.x + w, y1, st.max.z, 'trim', { color: SITE });
    deco(st.max.x - w, y0, st.min.z, st.max.x, y1, st.max.z, 'trim', { color: SITE });
  }
  // launch pad plates
  for (const p of pads) {
    deco(
      p.min.x + 0.1,
      p.min.y + 0.01,
      p.min.z + 0.1,
      p.max.x - 0.1,
      p.min.y + 0.08,
      p.max.z - 0.1,
      'trim',
      {
        color: AMBER,
      },
    );
    light((p.min.x + p.max.x) / 2, p.min.y + 1, (p.min.z + p.max.z) / 2, AMBER, 5, 0.9);
  }
  // portal glow
  for (const p of portals) light((p.min.x + p.max.x) / 2, 2, MID, p.color, 9, 1.4);
};

/**
 * Bot waypoints, named (tests and tools/map refer to them by name). Authored for the north-east
 * quarter as (east of the middle, north of the middle) offsets and mirrored to the other
 * quarters (a waypoint on an axis exists once per side). Names get N/S and E/W suffixes, e.g.
 * 'ringANE' (x = 0: only N/S, e.g. 'towerN'; z = 0: only E/W, e.g. 'aCE' = A site).
 * Links are two-way except the drop through the hole.
 */
const waypoints = (): WaypointDef[] => {
  const BY = ORBITAL_RING.basement.y;
  const PY = ORBITAL_RING.pit.y;
  const Y0 = 1;
  const YB = BY + 1;
  const YP = PY + 1;
  const wps: WaypointDef[] = [];
  const zeroX = new Map<string, boolean>();
  const zeroZ = new Map<string, boolean>();
  const nameOf = (base: string, n: Sign, s: Sign) =>
    `${base}${zeroZ.get(base) ? '' : n > 0 ? 'N' : 'S'}${zeroX.get(base) ? '' : s > 0 ? 'E' : 'W'}`;
  const add = (base: string, east: number, y: number, north: number) => {
    zeroX.set(base, east === 0);
    zeroZ.set(base, north === 0);
    for (const n of NS)
      for (const s of SIGNS) {
        if ((east === 0 && s < 0) || (north === 0 && n < 0)) continue;
        wps.push({
          pos: v3(MID + s * east, y, MID - n * north),
          links: [],
          name: nameOf(base, n, s),
        });
      }
  };
  const idx = (name: string) => {
    const i = wps.findIndex((w) => w.name === name);
    if (i < 0) throw new Error(`waypoint ${name} missing`);
    return i;
  };
  const link = (a: string, c: string, oneWay = false) => {
    for (const n of NS)
      for (const s of SIGNS) {
        const i = idx(nameOf(a, n, s));
        const j = idx(nameOf(c, n, s));
        if (!wps[i].links.includes(j)) wps[i].links.push(j);
        if (!oneWay && !wps[j].links.includes(i)) wps[j].links.push(i);
      }
  };
  const chain = (...names: string[]) => {
    for (let i = 1; i < names.length; i++) link(names[i - 1], names[i]);
  };
  // the ring's centre line on the octagon: a corner point on each side of the axes
  const rc = 24 * (Math.SQRT2 - 1);

  // spawn and spoke
  add('tower', 0, Y0, 48);
  add('sp', 6, Y0, 49);
  add('spDoor', 0, Y0, 43);
  add('sp1', 0, Y0, 39.5);
  add('spk', 0, Y0, 34);
  add('gate', 0, Y0, 28);
  // spawn side door and the outer corridor
  add('spAround', 10.5, Y0, 44);
  add('spIn', 12.5, Y0, 48.5);
  add('sideDoor', 14.5, Y0, 49);
  add('o1', 20, Y0, 49);
  add('oGate', 31, Y0, 49);
  add('o2', 39, Y0, 49);
  add('oCorner', 46, Y0, 48);
  add('oLeg1', 47, Y0, 42);
  add('oGate2', 47, Y0, 32);
  add('oLeg2', 47, Y0, 23);
  add('aNDoor', 47, Y0, 18.5);
  add('aNe', 51, Y0, 16);
  add('aN2', 51, Y0, 12);
  // the site and its spoke
  add('aC', 48, Y0, 0);
  add('aIn', 40.5, Y0, 0);
  add('aDoor', 37.5, Y0, 0);
  add('siteSpk', 32.5, Y0, 0);
  add('siteGate', 28, Y0, 0);
  // ring
  add('ring1', 0, Y0, 24);
  add('ringA', rc, Y0, 24);
  add('ringD', 24 * Math.SQRT1_2, Y0, 24 * Math.SQRT1_2);
  add('ringB', 24, Y0, rc);
  add('ring2', 24, Y0, 0);
  // core
  add('c1', 0, Y0, 17);
  // straight across the core, spoke gate to spoke gate
  add('cN', 6, Y0, 18);
  add('cE', 18, Y0, 6);
  add('c1a', 6, Y0, 14);
  add('cD', 12.5, Y0, 12.5);
  add('c2a', 14.5, Y0, 7);
  add('c2', 17, Y0, 0);
  add('cRimD', 5.5, Y0, 6.5);
  add('cRim1', 0, Y0, 8.5);
  add('cRim2', 8.5, Y0, 0);
  add('hole', 0, Y0, 4);
  // pit and its tunnels
  add('pitDrop', 0, YP, 4);
  add('pit1', 0, YP, 8);
  add('pitD', 5, YP, 5);
  add('pit2', 8, YP, 0);
  add('tunN', 0, YP, 12.5);
  add('tunTopN', 0, YB, 25);
  add('tunE', 12.5, YP, 0);
  add('tunTopE', 25, YB, 0);
  // basement ring
  add('base1', 0, YB, 36);
  add('baseSt', 15, YB, 36);
  add('baseC', 35, YB, 35);
  add('baseStE', 36, YB, 15);
  add('base2', 36, YB, 0);
  // stairwells beside the north / south spokes ('st') and the east / west spokes ('se')
  add('stDoor', 5.25, Y0, 28);
  add('stTop', 5, Y0, 30.5);
  add('stBot', 15, YB, 30.5);
  add('stDoorB', 15, YB, 33);
  add('seDoor', 28, Y0, 5.25);
  add('seTop', 30.5, Y0, 5);
  add('seBot', 30.5, YB, 15);
  add('seDoorB', 33, YB, 15);

  // spawn → spoke → ring → the east spoke → A
  chain('tower', 'spDoor', 'sp1', 'spk', 'gate', 'ring1');
  chain('ring1', 'ringA', 'ringD', 'ringB', 'ring2', 'siteGate', 'siteSpk', 'aDoor', 'aIn', 'aC');
  // the outer corridor into A
  chain('tower', 'sp', 'spAround', 'spIn', 'sideDoor', 'o1', 'oGate', 'o2', 'oCorner', 'oLeg1');
  chain('oLeg1', 'oGate2', 'oLeg2', 'aNDoor', 'aNe', 'aN2', 'aC');
  // core
  chain('ring1', 'c1', 'c1a', 'cD', 'ringD');
  chain('cD', 'c2a', 'c2', 'ring2');
  chain('c1a', 'cRimD', 'cRim1');
  chain('gate', 'cN', 'cE', 'siteGate');
  chain('c1', 'cN', 'cRimD');
  link('cE', 'c2a');
  chain('c2a', 'cRimD', 'cRim2');
  link('cRim1', 'hole', true);
  link('hole', 'pitDrop', true);
  // pit, tunnels, basement ring
  chain('pitDrop', 'pit1', 'pitD', 'pit2');
  chain('pit1', 'tunN', 'tunTopN', 'base1');
  chain('pit2', 'tunE', 'tunTopE', 'base2');
  chain('base1', 'baseSt', 'baseC', 'baseStE', 'base2');
  // stairwells
  chain('ring1', 'stDoor', 'ringA');
  chain('stDoor', 'stTop', 'stBot', 'stDoorB', 'baseSt');
  chain('ring2', 'seDoor', 'ringB');
  chain('seDoor', 'seTop', 'seBot', 'seDoorB', 'baseStE');
  return wps;
};
