// "Orbital Ring" — a station built around a reactor core. Mirror-symmetric north ↔ south
// (Cyan, team 0, spawns north at z < 0; Orange, team 1, south at z > 0); the bomb sites sit on
// the east (A, x > 0) and west (B, x < 0) sides, halfway between the spawns.
//
//   CORE (y 0..14, glass dome)   the reactor room in the middle: a hole in its floor drops into
//        the reactor pit, launch pads in its corners throw you up to the east/west balconies,
//        a zip-rail runs balcony to balcony over the hole, power-ups float over the hole and
//        on both balconies
//   RING (y 0)                   a corridor circling the core, doors into the core on every side
//   BASEMENT RING (y -7)         a second ring under the first, around the reactor pit; the pit's
//        launch pads fire you back up through the hole into the core
//   OUTER CORRIDORS              long corridors from each spawn to both sites, each with a
//        zip-rail along its ceiling (the fast way round), a gate before the site and windows
//        onto the planet
//   STAIRWELLS / TUNNELS         each spawn connector has a stairwell down to the basement ring;
//        each site has two ramps up from the basement ring
//   RIFT PORTALS                 a portal at the back of each site: walk into A's and you come
//        out of B's, and back — the fastest (and loudest) rotation on the map
//
// The objective glitch is on (LevelDef.objectiveGlitch, rules/glitch.ts): Tower mode and Bomb
// mode bleed into each other here. A Controller carrier can plant their Controller at A or B;
// the bomb carrier can win by touching the defenders' Tower.
//
// Coordinates: x → east, z → south, y up. Rooms are open volumes; `shellAround` puts 1 m walls
// around them (rooms 1 m apart share a wall, a 1 m deep volume through it is a doorway).
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

/** Key coordinates (world). The south half mirrors the north half (z → -z). */
export const ORBITAL_RING = {
  /** core room: x, z in [-core, core], y 0..coreH */
  core: 14,
  coreH: 14,
  /** half-size of the hole in the core floor */
  hole: 5,
  ring: { in: 15, out: 23, h: 6 },
  /** basement ring and reactor pit floor */
  basement: -7,
  balcony: 6,
  site: { x0: 38, x1: 62, z: 12, h: 10 },
  spawn: { x: 12, z0: 56, z1: 70, h: 8 },
  /** Towers: Cyan's (north) first */
  towers: [v3(0, 0, -67.5), v3(0, 0, 67.5)] as [Vec3, Vec3],
  bombSites: {
    A: { min: v3(44, 0, -9), max: v3(58, 3, 9) },
    B: { min: v3(-58, 0, -9), max: v3(-44, 3, 9) },
  },
  powerups: [v3(0, 1.5, 0), v3(12.5, 7.5, 0), v3(-12.5, 7.5, 0)],
};

const CORE_WALL: SurfaceStyle = { mat: 'panel', color: 0x5a5f78 };
const RING_FLOOR: SurfaceStyle = { mat: 'plate' };
const RING_WALL: SurfaceStyle = { mat: 'hull', color: 0x3c4658 };
const BASE_FLOOR: SurfaceStyle = { mat: 'plate', color: 0x3c4150 };
const BASE_WALL: SurfaceStyle = { mat: 'engine', color: 0x3b3644 };
const BASE_CEIL: SurfaceStyle = { mat: 'hull', color: 0x2a2f3c };
const OUTER_FLOOR: SurfaceStyle = { mat: 'grate' };
const SITE_WALL: SurfaceStyle = { mat: 'panel' };
const SPAWN_N: SurfaceStyle = { mat: 'hull', color: 0x34506a };
const SPAWN_S: SurfaceStyle = { mat: 'hull', color: 0x5a4838 };

type Sign = 1 | -1;
const SIGNS: Sign[] = [1, -1];
/** north (-1) first: Cyan's half, then Orange's */
const NS: Sign[] = [-1, 1];

export const buildOrbitalRing = (): LevelDef => {
  const O = ORBITAL_RING;
  const C = O.core;
  const RI = O.ring.in;
  const RO = O.ring.out;
  const RH = O.ring.h;
  const BY = O.basement;
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

  // ---- the core (glass dome), the hole, the reactor pit ----
  room(-C, 0, -C, C, O.coreH, C, { lid: false, wall: CORE_WALL });
  door(-O.hole, -1, -O.hole, O.hole, 0, O.hole);
  room(-C, BY, -C, C, -1, C, base);
  for (const s of SIGNS)
    for (const t of SIGNS) {
      // core doors (two per wall, off the middle: no line runs spawn to spawn) + pit doors
      door(s * 6, 0, t * C, s * 10, 4.5, t * (C + 1));
      door(t * C, 0, s * 6, t * (C + 1), 4.5, s * 10);
      door(s * 6, BY, t * C, s * 10, BY + 3.5, t * (C + 1));
      door(t * C, BY, s * 6, t * (C + 1), BY + 3.5, s * 10);
    }

  // ---- the ring and the basement ring (four segments each, overlapping in the corners) ----
  for (const s of SIGNS) {
    room(-RO, 0, s * RI, RO, RH, s * RO, ringStyle);
    room(s * RI, 0, -RO, s * RO, RH, RO, ringStyle);
    room(-RO, BY, s * RI, RO, -1, s * RO, base);
    room(s * RI, BY, -RO, s * RO, -1, RO, base);
  }

  // ---- each spawn side (north: z < 0) ----
  for (const z of NS) {
    const spawnWall = z < 0 ? SPAWN_N : SPAWN_S;
    room(-SP.x, 0, z * SP.z0, SP.x, SP.h, z * SP.z1, { wall: spawnWall });
    // connector: spawn → ring (a pillar near the spawn door blocks the view in)
    room(-4, 0, z * (RO + 1), 4, 5, z * (SP.z0 - 1), ringStyle);
    door(-3, 0, z * RO, 3, 4, z * (RO + 1));
    door(-2, 0, z * (SP.z0 - 1), 2, 4, z * SP.z0);
    for (const x of SIGNS) {
      // stairwell beside the connector, down to the basement ring
      room(x * 5, BY, z * (RO + 1), x * 11, 5, z * 52, ringStyle);
      door(x * 4, 0, z * 46, x * 5, 3.5, z * 51);
      door(x * 6, BY, z * RO, x * 10, BY + 3.5, z * (RO + 1));
      // spawn side door → the long outer corridor to that site
      door(x * SP.x, 0, z * 61, x * (SP.x + 1), 4, z * 65);
      room(x * (SP.x + 1), 0, z * 59, x * 47, 7, z * 67, outer);
      room(x * 39, 0, z * (ST.z + 1), x * 47, 7, z * 67, outer);
      door(x * 40, 0, z * ST.z, x * 46, 4.5, z * (ST.z + 1));
      // windows onto the planet (skyglass fills them below)
      door(x * 22, 2, z * 67, x * 38, 5.5, z * 68);
      door(x * 47, 2, z * 26, x * 48, 5.5, z * 54);
      // tunnel: basement ring → up a ramp into the site
      room(x * (RO + 1), BY, z * 5, x * (ST.x0 - 1), 5, z * 11, ringStyle);
      door(x * RO, BY, z * 6, x * (RO + 1), BY + 3.5, z * 10);
      door(x * (ST.x0 - 1), 0, z * 6, x * ST.x0, 3.5, z * 10);
    }
  }

  // ---- the sites (glass ceilings) and their connectors to the ring ----
  for (const x of SIGNS) {
    room(x * ST.x0, 0, -ST.z, x * ST.x1, ST.h, ST.z, { lid: false, wall: SITE_WALL });
    room(x * (RO + 1), 0, -4, x * (ST.x0 - 1), 5, 4, ringStyle);
    door(x * RO, 0, -3, x * (RO + 1), 4, 3);
    door(x * (ST.x0 - 1), 0, -3, x * ST.x0, 4, 3);
  }

  mirroredShell(b, vols);

  // ======================= glass: core dome, site ceilings, windows =======================
  box(-C - 1, O.coreH, -C - 1, C + 1, O.coreH + 1, C + 1, 'skyglass');
  for (const x of SIGNS) {
    box(x * (ST.x0 - 1), ST.h, -ST.z - 1, x * (ST.x1 + 1), ST.h + 1, ST.z + 1, 'skyglass');
    for (const z of NS) {
      box(x * 22, 2, z * 67, x * 38, 5.5, z * 68, 'skyglass');
      box(x * 47, 2, z * 26, x * 48, 5.5, z * 54, 'skyglass');
    }
  }

  // ======================= core detail =======================
  // four pillars around the hole, floor of the pit to the dome: they cut the door-to-door lines
  for (const s of SIGNS)
    for (const t of SIGNS) box(s * 7, BY, t * 7, s * 9, O.coreH, t * 9, 'pillar', { trim: VIOLET });
  // a knee-high rim around the hole, open in the middle of each side (drops, the pad arcs)
  const H = O.hole;
  for (const s of SIGNS)
    for (const t of SIGNS) {
      box(s * 2.5, 0, t * H, s * (H + 0.3), 1, t * (H + 0.3), 'panel', { trim: VIOLET });
      box(t * H, 0, s * 2.5, t * (H + 0.3), 1, s * (H + 0.3), 'panel', { trim: VIOLET });
    }
  // east/west balconies (grating), a railing with a gap for the zip-rail, two supports each
  for (const x of SIGNS) {
    box(x * 11, BAL - 0.5, -8, x * C, BAL, 8, 'grate', { trim: VIOLET });
    box(x * 11, BAL, -8, x * 11.15, BAL + 1, -1.5, 'pillar');
    box(x * 11, BAL, 1.5, x * 11.15, BAL + 1, 8, 'pillar');
    for (const z of SIGNS) box(x * 12, 0, z * 2.5, x * 13, BAL - 0.5, z * 3.5, 'pillar');
  }
  // the reactor: a glowing core floating in the pit (you fly past it off the pads)
  b.boxes.push({
    c: v3(0, BY + 3.2, 0),
    h: v3(0.9, 0.9, 0.9),
    q: qFromAxisAngle(v3(0.577, 0.577, 0.577), 0.9),
    mat: 'engine',
    trim: TEAL,
    noCollide: true,
  });
  deco(-6, BY + 0.01, -6, 6, BY + 0.05, 6, 'trim', { color: 0x1a4a44 });
  // pit cover: coolant tanks in the corners
  for (const s of SIGNS)
    for (const t of SIGNS)
      box(s * 11, BY, t * 11, s * 13.5, BY + 2.5, t * 13.5, 'engine', { trim: TEAL });

  // ======================= ring cover =======================
  for (const s of SIGNS)
    for (const t of SIGNS) {
      // corner blocks (full), crates along the straights (half)
      box(s * 20.5, 0, t * 20.5, s * 22.5, RH, t * 22.5, 'pillar', { trim: WHITE });
      box(s * 13, 0, t * 20.5, s * 15, 1.2, t * 22.5, 'crate');
      box(t * 20.5, 0, s * 12, t * 22.5, 1.2, s * 14, 'crate');
      // basement: pipes and pumps
      box(s * 20.5, BY, t * 20.5, s * 22.5, -1, t * 22.5, 'engine', { trim: TEAL });
      box(s * 13, BY, t * 20.5, s * 15, BY + 1.2, t * 22.5, 'engine');
      box(t * 20.5, BY, s * 12, t * 22.5, BY + 1.2, s * 14, 'engine');
    }

  // ======================= spawn sides =======================
  for (const z of NS) {
    // connector pillar: nothing in the ring sees through the spawn door
    box(-2.5, 0, z * 48, 2.5, 5, z * 50, 'pillar', { trim: WHITE });
    for (const x of SIGNS) {
      // stairwell: top landing, ramp down, fill under the ramp
      box(x * 5, BY, z * 45, x * 11, 0, z * 52, 'panel');
      b.ramp('z', z * 45, z * 32, 0, BY, x * 8, 6, { mat: 'grate' });
      fillUnder(b, 'z', z * 45, z * 32, 0, BY, x * 8, 6);
      // tunnel ramp up into the site
      b.ramp('x', x * 24.5, x * (ST.x0 - 1), BY, 0, z * 8, 6, { mat: 'grate' });
      fillUnder(b, 'x', x * (ST.x0 - 1), x * 24.5, 0, BY, z * 8, 6);
      // leg 1: a block by the spawn door (no long look into the spawn)
      box(x * 17, 0, z * 61, x * 19, 7, z * 65, 'pillar', { trim: z < 0 ? CYAN : ORANGE });
      // the gate before the site: a 4 m frame
      box(x * 39, 0, z * 22, x * 41, 7, z * 24, 'hull', { trim: HAZARD });
      box(x * 45, 0, z * 22, x * 47, 7, z * 24, 'hull', { trim: HAZARD });
      box(x * 41, 4.5, z * 22, x * 45, 7, z * 24, 'hull', { trim: HAZARD });
      // leg 2 cover (half), staggered
      box(x * 39, 0, z * 34, x * 41, 1.2, z * 37, 'crate');
      box(x * 45, 0, z * 44, x * 47, 1.2, z * 47, 'crate');
    }
  }

  // ======================= sites: cover, portal frames =======================
  for (const x of SIGNS) {
    for (const z of SIGNS) {
      box(x * 48, 0, z * 3.5, x * 52, 2.5, z * 6.5, 'crate', { trim: SITE }); // full
      box(x * 55, 0, z * 4, x * 57, 1.2, z * 6, 'crate'); // half
      box(x * 58, 0, z * 8.5, x * 60, 2.5, z * 11, 'crate'); // full, back corners
      box(x * 38, 0, z * 10.5, x * 40, 1.2, z * 12, 'crate'); // half, by the doors
      // a screen inside each outer-corridor door: no line runs corridor → site → corridor
      box(x * 41, 0, z * 9, x * 45, 2.5, z * 10, 'panel', { trim: SITE });
      // portal frame posts
      box(x * 60.5, 0, z * 2, x * ST.x1, 4.3, z * 3, 'pillar', { trim: TEAL });
    }
    box(x * 60.5, 4.3, -3, x * ST.x1, 5, 3, 'pillar', { trim: TEAL });
  }

  // ======================= Towers, spawns, Controller homes =======================
  const towers: TowerDef[] = [];
  const spawns: SpawnDef[] = [];
  const homes: Vec3[] = [];
  for (const team of [0, 1] as const) {
    const tp = O.towers[team];
    const tc = team === 0 ? CYAN : ORANGE;
    const toward = team === 0 ? 1 : -1; // toward the middle of the map
    b.block(v3(tp.x, 3, tp.z), v3(2, 6, 2), { mat: team === 0 ? 'teamA' : 'teamB', trim: tc });
    towers.push({ team, pos: tp, radius: 1.5, height: 6 });
    homes.push(v3(tp.x, 0.9, tp.z + toward * 5));
    for (const zm of [65, 61])
      for (const x of [-9, -5, 5, 9])
        spawns.push({
          pos: v3(x, 0, (team === 0 ? -1 : 1) * zm),
          yawDeg: team === 0 ? 180 : 0,
          team,
        });
  }

  // ======================= zip-rails, launch pads, portals =======================
  const rails: RailDef[] = [];
  const RAIL_Y = 3.5; // floor + 3.5: jump to grab (as on Kestrel)
  for (const z of NS)
    for (const x of SIGNS)
      rails.push({
        points: [
          v3(x * 21, RAIL_Y, z * 63),
          v3(x * 43, RAIL_Y, z * 63),
          v3(x * 43, RAIL_Y, z * 16),
        ],
      });
  // balcony to balcony over the hole
  rails.push({ points: [v3(-12.5, BAL + RAIL_Y, 0), v3(12.5, BAL + RAIL_Y, 0)] });

  const launchPads: LaunchPadDef[] = [];
  // pit: back up through the hole, out onto the core floor (east pad throws east)
  for (const x of SIGNS)
    launchPads.push({
      min: v3(x > 0 ? -3.5 : 0.5, BY, -1.5),
      max: v3(x > 0 ? -0.5 : 3.5, BY + 2.5, 1.5),
      vel: v3(x * 6.5, 20, 0),
    });
  // core corners: up and along the wall onto that side's balcony
  for (const x of SIGNS)
    for (const z of NS)
      launchPads.push({
        min: v3(Math.min(x * 11.2, x * 13.6), 0, Math.min(z * 11.2, z * 13.6)),
        max: v3(Math.max(x * 11.2, x * 13.6), 2.5, Math.max(z * 11.2, z * 13.6)),
        vel: v3(0, 17, -z * 4.5),
      });

  // rift portals: into the back of one site, out at the back of the other (same heading)
  const portals: PortalDef[] = [];
  for (const x of SIGNS)
    portals.push({
      name: x > 0 ? 'A → B' : 'B → A',
      min: v3(Math.min(x * 60.6, x * ST.x1), 0, -2),
      max: v3(Math.max(x * 60.6, x * ST.x1), 4, 2),
      exit: v3(-x * 57.5, 1, 0),
      color: TEAL,
    });

  // ======================= looks =======================
  decorate(deco, light, launchPads, portals);

  const wps = waypoints();

  return b.build({
    name: 'Orbital Ring',
    boundsMin: v3(-64, BY - 2, -72),
    boundsMax: v3(64, O.coreH + 2, 72),
    defaultGravity: v3(0, -1, 0),
    zones: [],
    rails,
    pads: [],
    spawns,
    towers,
    controllerHomes: homes,
    waypoints: wps,
    areas: [
      { name: 'Cyan spawn', pos: v3(0, 0, -60), yawDeg: 180 },
      { name: 'Orange spawn', pos: v3(0, 0, 60), yawDeg: 0 },
      { name: 'Reactor core', pos: v3(0, 0, -10), yawDeg: 180 },
      { name: 'Reactor pit', pos: v3(0, BY, -8), yawDeg: 180 },
      { name: 'East balcony', pos: v3(12.5, BAL, -5), yawDeg: 180 },
      { name: 'A site', pos: v3(50, 0, 0), yawDeg: 90 },
      { name: 'B site', pos: v3(-50, 0, 0), yawDeg: -90 },
      { name: 'Ring (north)', pos: v3(0, 0, -19), yawDeg: 90 },
      { name: 'Basement ring', pos: v3(0, BY, -19), yawDeg: 90 },
      { name: 'NE outer corridor', pos: v3(43, 0, -45), yawDeg: 180 },
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
    objectiveGlitch: true,
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
 * `shellAround` for a map mirrored across z = 0: builds the north half's walls (volumes cut a
 * little past the middle, so no wall appears there) and mirrors them, so both halves get
 * exactly the same boxes (the greedy merge alone would split them differently).
 */
const mirroredShell = (b: LevelBuilder, vols: OpenVolume[]): void => {
  const north = vols
    .filter((v) => v.min.z < 0)
    .map((v) => ({ ...v, max: v3(v.max.x, v.max.y, Math.min(v.max.z, 2)) }));
  const half = new LevelBuilder();
  shellAround(half, north);
  for (const bx of half.boxes) {
    const min = v3(bx.c.x - bx.h.x, bx.c.y - bx.h.y, bx.c.z - bx.h.z);
    const max = v3(bx.c.x + bx.h.x, bx.c.y + bx.h.y, Math.min(0, bx.c.z + bx.h.z));
    if (max.z - min.z < 1e-6) continue;
    const opts = { mat: bx.mat, ...(bx.color !== undefined ? { color: bx.color } : {}) };
    b.box(min, max, opts);
    b.box(v3(min.x, min.y, -max.z), v3(max.x, max.y, -min.z), opts);
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
  const BY = O.basement;
  const RO = O.ring.out;
  const RI = O.ring.in;
  // the reactor's glow from the pit, up through the hole
  light(0, BY + 3, 0, TEAL, 16, 1.6);
  light(0, 3, 0, TEAL, 12, 0.9, true);
  // the planet's light through the dome
  for (const s of SIGNS) for (const t of SIGNS) light(s * 9, 13, t * 9, PLANET, 18, 0.6);
  // ring: a strip light along the middle of each ceiling, main and basement
  const mid = (RI + RO) / 2;
  for (const s of SIGNS) {
    deco(-RO + 1, O.ring.h - 0.08, s * mid - 0.1, RO - 1, O.ring.h - 0.02, s * mid + 0.1, 'trim', {
      color: WHITE,
    });
    deco(s * mid - 0.1, O.ring.h - 0.08, -RO + 1, s * mid + 0.1, O.ring.h - 0.02, RO - 1, 'trim', {
      color: WHITE,
    });
    deco(-RO + 1, -1.08, s * mid - 0.1, RO - 1, -1.02, s * mid + 0.1, 'trim', { color: AMBER });
    deco(s * mid - 0.1, -1.08, -RO + 1, s * mid + 0.1, -1.02, RO - 1, 'trim', { color: AMBER });
    for (const t of SIGNS) {
      light(s * mid, 4.5, t * 12, WHITE, 10, 0.7);
      light(t * 12, 4.5, s * mid, WHITE, 10, 0.7);
      light(s * mid, BY + 4.5, t * 12, AMBER, 9, 0.7);
      light(t * 12, BY + 4.5, s * mid, AMBER, 9, 0.7);
    }
  }
  // outer corridors: team-tinted near each spawn, white along the long leg; stairwells, tunnels
  for (const z of NS) {
    const tc = z < 0 ? CYAN : ORANGE;
    light(0, 6.5, z * 63, tc, 14, 1.4, true); // over the spawn / Tower
    for (const x of SIGNS) {
      light(x * 25, 5.5, z * 63, tc, 12, 0.9);
      light(x * 43, 5.5, z * 60, WHITE, 12, 0.9);
      light(x * 43, 5.5, z * 40, WHITE, 12, 0.9);
      light(x * 43, 5.5, z * 23, AMBER, 8, 1.1); // the gate
      light(x * 8, 2, z * 40, WHITE, 10, 0.8); // stairwell
      light(x * 30, 2, z * 8, WHITE, 10, 0.8); // tunnel
      // hazard stripes on the gate floor
      for (let i = 0; i < 4; i++)
        deco(x * (41 + i), 0.01, z * 22, x * (41.5 + i), 0.05, z * 24, 'trim', { color: HAZARD });
    }
  }
  // sites: bright work lights, red outlines of the plant area
  for (const s of [O.bombSites.A, O.bombSites.B]) {
    const cx = (s.min.x + s.max.x) / 2;
    light(cx, 8.5, 0, WHITE, 20, 1.1, true);
    const y0 = 0.01;
    const y1 = 0.05;
    const w = 0.12;
    deco(s.min.x, y0, s.min.z, s.max.x, y1, s.min.z + w, 'trim', { color: SITE });
    deco(s.min.x, y0, s.max.z - w, s.max.x, y1, s.max.z, 'trim', { color: SITE });
    deco(s.min.x, y0, s.min.z, s.min.x + w, y1, s.max.z, 'trim', { color: SITE });
    deco(s.max.x - w, y0, s.min.z, s.max.x, y1, s.max.z, 'trim', { color: SITE });
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
  for (const p of portals) light((p.min.x + p.max.x) / 2, 2, 0, p.color, 9, 1.4);
};

/**
 * Bot waypoints, named (tests refer to them by name). Authored for the north-east quarter:
 * x = distance east, z = distance toward the spawn; each is mirrored to the other quarters
 * (a waypoint on an axis exists once per side). Names get N/S and E/W suffixes, e.g. 'gateNE'
 * ('1' in a base name: the ring/core side facing a spawn; '2': the side facing a site).
 * Links are two-way except the drop through the hole.
 */
const waypoints = (): WaypointDef[] => {
  const BY = ORBITAL_RING.basement;
  const Y0 = 1;
  const YB = BY + 1;
  const wps: WaypointDef[] = [];
  const zeroX = new Map<string, boolean>();
  const zeroZ = new Map<string, boolean>();
  const nameOf = (base: string, z: Sign, x: Sign) =>
    `${base}${zeroZ.get(base) ? '' : z < 0 ? 'N' : 'S'}${zeroX.get(base) ? '' : x > 0 ? 'E' : 'W'}`;
  const add = (base: string, x: number, y: number, z: number) => {
    zeroX.set(base, x === 0);
    zeroZ.set(base, z === 0);
    for (const sz of NS)
      for (const sx of SIGNS) {
        if ((x === 0 && sx < 0) || (z === 0 && sz > 0)) continue;
        wps.push({ pos: v3(sx * x, y, sz * z), links: [], name: nameOf(base, sz, sx) });
      }
  };
  const idx = (n: string) => {
    const i = wps.findIndex((w) => w.name === n);
    if (i < 0) throw new Error(`waypoint ${n} missing`);
    return i;
  };
  const link = (a: string, c: string, oneWay = false) => {
    for (const sz of NS)
      for (const sx of SIGNS) {
        const i = idx(nameOf(a, sz, sx));
        const j = idx(nameOf(c, sz, sx));
        if (!wps[i].links.includes(j)) wps[i].links.push(j);
        if (!oneWay && !wps[j].links.includes(i)) wps[j].links.push(i);
      }
  };

  // spawn, connector, stairwell
  add('tower', 0, Y0, 65);
  add('sp', 6, Y0, 63);
  add('spMid', 0, Y0, 60);
  add('spSide', 12.5, Y0, 63);
  add('spGate', 0, Y0, 55.5);
  add('cnA', 3.2, Y0, 53);
  add('cnP', 3.2, Y0, 49);
  add('cnB', 3.2, Y0, 45);
  add('cn1', 0, Y0, 28);
  add('cnGate', 0, Y0, 23.5);
  add('stDoor', 4.5, Y0, 48.5);
  add('stTop', 8, Y0, 48.5);
  add('stEdge', 8, Y0, 45);
  add('stFoot', 8, YB, 31.5);
  add('stBot', 8, YB, 27);
  add('stDoorB', 8, YB, 23.5);
  // outer corridor
  add('l1a', 15.5, Y0, 66);
  add('l1pass', 18, Y0, 66);
  add('l1b', 20.5, Y0, 66);
  add('l1c', 30, Y0, 63);
  add('corner', 43, Y0, 63);
  add('l2a', 43, Y0, 45);
  add('gate', 43, Y0, 23);
  add('l2b', 43, Y0, 16);
  add('aDoor', 43, Y0, 12.5);
  // site
  add('aSide', 41, Y0, 8);
  add('aBack', 55, Y0, 8);
  add('aDoorIn', 46.8, Y0, 11);
  add('aHall', 46.8, Y0, 8);
  add('aFront', 41, Y0, 0);
  add('aC', 50, Y0, 0);
  // site connector
  add('scA', 37.5, Y0, 0);
  add('sc', 30, Y0, 0);
  add('scR', 23.5, Y0, 0);
  // tunnel
  add('tunTop', 37.5, Y0, 8);
  add('tunUp', 36.5, 0.6, 8);
  add('tunLow', 25.5, BY + 1.56, 8);
  add('tunBot', 23.5, YB, 8);
  // ring
  add('ring1', 0, Y0, 19);
  add('ring1a', 8, Y0, 19);
  add('ringC', 19, Y0, 19);
  add('ring2a', 19, Y0, 8);
  add('ring2', 19, Y0, 0);
  // core
  add('cDoor1', 8, Y0, 14.5);
  add('cIn1', 8, Y0, 11.5);
  add('cRim1', 4, Y0, 8);
  add('rim1', 0, Y0, 8);
  add('cDoor2', 14.5, Y0, 8);
  add('cIn2', 11.5, Y0, 8);
  add('cRim2', 8, Y0, 4);
  add('rim2', 8, Y0, 0);
  add('hole', 0, Y0, 3.5);
  // pit
  add('pitDrop', 0, YB, 3.5);
  add('pit1', 0, YB, 8);
  add('pitRim1', 4, YB, 8);
  add('pitIn1', 8, YB, 11.5);
  add('pitDoor1', 8, YB, 14.5);
  add('pitRim2', 8, YB, 4);
  add('pit2', 8, YB, 0);
  add('pitIn2', 11.5, YB, 8);
  add('pitDoor2', 14.5, YB, 8);
  // basement ring
  add('base1', 0, YB, 19);
  add('base1a', 8, YB, 19);
  add('baseC', 19, YB, 19);
  add('base2a', 19, YB, 8);
  add('base2', 19, YB, 0);

  const chain = (...names: string[]) => {
    for (let i = 1; i < names.length; i++) link(names[i - 1], names[i]);
  };
  chain('tower', 'sp', 'spMid', 'tower');
  chain('sp', 'spSide');
  chain(
    'spMid',
    'spGate',
    'cnA',
    'cnP',
    'cnB',
    'cn1',
    'cnGate',
    'ring1',
    'ring1a',
    'ringC',
    'ring2a',
    'ring2',
  );
  chain('cnP', 'stDoor', 'stTop', 'stEdge', 'stFoot', 'stBot', 'stDoorB', 'base1a');
  chain('cnB', 'stDoor');
  // core
  chain('ring1a', 'cDoor1', 'cIn1', 'cRim1', 'rim1');
  chain('cRim1', 'cRim2', 'rim2');
  chain('ring2a', 'cDoor2', 'cIn2', 'cRim2');
  link('rim1', 'hole', true);
  link('hole', 'pitDrop', true);
  // pit
  chain('pitDrop', 'pit1', 'pitRim1', 'pitRim2', 'pit2');
  chain('pitRim1', 'pitIn1', 'pitDoor1', 'base1a');
  chain('pitRim2', 'pitIn2', 'pitDoor2', 'base2a');
  // basement ring, tunnel up into the site
  chain('base1', 'base1a', 'baseC', 'base2a', 'base2');
  chain('base2a', 'tunBot', 'tunLow', 'tunUp', 'tunTop', 'aSide');
  // ring → site connector → site
  chain('ring2', 'scR', 'sc', 'scA', 'aFront', 'aC');
  chain('aFront', 'aSide', 'aHall', 'aBack');
  // outer corridor
  chain(
    'spSide',
    'l1a',
    'l1pass',
    'l1b',
    'l1c',
    'corner',
    'l2a',
    'gate',
    'l2b',
    'aDoor',
    'aDoorIn',
    'aHall',
  );
  return wps;
};
