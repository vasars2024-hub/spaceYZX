// "Antipode" — the ship where the other team stands on your sky. One long hollow hull, two decks
// that face each other: Cyan (team 0) lives on the FLOOR deck (y 0, gravity down) at the -x end;
// Orange (team 1) lives on the CEILING deck (y 28, gravity up: they stand upside down) at the +x
// end. Between them, in the middle of the hull, hangs the Seam: a zero-G hall (y 9..19) with a
// well down to each deck, and the Spindle standing through it.
//
// Fair by a half-turn: every box, zone, spawn, Tower, site, waypoint and area has its twin under
// (x, y, z) → (-x, 28 - y, z), teams swapped and gravity turned over. The map is built as its
// lower half (y ≤ 14) plus that half turned over (`imageBox`); only the look changes (cold white
// service light on the floor deck, amber emergency light on the ceiling deck).
//
// Three planes to stand on, and rooms on each (a redesign: the first Antipode was two open decks
// that saw each other whole; now each deck is rooms and corridors under a 6 m roof, and only the
// well in the middle looks across the Seam):
//
//   FLOOR DECK (cyan's; the ceiling deck is the same turned end for end), top view:
//
//     x -60 ....... -47 ...... -34 ...... -22 .. -13 ... 13 .. 22 ...... 36 ...... 42 .... 60
//      |           | N passage |  B lobby  (B door) | north gallery → junction door |  A lobby  |
//      |  BASTION  |           |  HOME HALL        |  THE WELL      | EAST HALL    | (A door)  | engines
//      |  Tower    | S passage |                   |  (Spindle)     |              |           |
//      |           | QUARTERS  | tunnel lobby      | south gallery  | tunnel lobby |           |
//
//   NORTH PLANE (z 25..31, gravity pulls into the north hull wall: a third "deck" standing
//   sideways) — the bomb sites. Site B's room (x -40..-22) and site A's (x 22..40) run up the
//   wall from the floor deck to the ceiling deck: a door from each deck (at its foot a 45°
//   fillet turns you onto the wall), and a side door from the connector (y 12..16) that joins
//   them through the junction hall (x -6..6), itself a floor ↔ ceiling way with a door on
//   each deck. Defenders rotate A ↔ B along the wall.
//
//   SOUTH PLANE (z -31..-25, gravity into the south hull wall) — the flank loop: an H of tunnels.
//   The low bar (y 7..11) joins the floor deck's two tunnel lobbies (x ±28); the high bar
//   (y 17..21) the ceiling deck's; the rung at x 0 joins the bars (floor ↔ ceiling).
//
//   THE SEAM (x ±24, z ±20, y 9..19, zero-G) over the WELL (x ±13, z ±11): jump or jetpack out
//        of the well, drift across (push off the walls, the Spindle, the cargo), and past the
//        middle the other deck's gravity takes you and you fall "up" onto its well floor.
//   THE SPINDLE (core x, z ±4; corner posts out to ±6.2)  a column joining the decks with a
//        2.2 m deep groove down each face: walk into a groove, up its 45° fillet, and its gravity
//        walks you up the column, through the Seam and onto the other deck. Two power-ups float
//        at its middle (y 14) in the ±z grooves.
//   SPAWNS  two detached groups per team, each a closed room with two exits: the BASTION (the
//        Tower, near B's floor door: the home site) and the QUARTERS (south-west, by the tunnel
//        lobby: the flank and the far site).
//
// Why 28 m between the decks: a jump is 1.2 m and a fall of 22 m kills (config), so each deck's
// band of gravity is 8 m and falling out of the Seam onto a deck never hurts.
//
// Layout rules (docs/PLAYING.md): cover is half (≤ 1.25 m) or full (≥ 2 m); no ramps but the
// 45° fillets, each across a gravity bend (45° to either side's gravity); no spawn in view from
// outside its room; no fall longer than 8 m.
//
// The engine has no "up" on a spawn: a ceiling spawn's `pos` is the feet of an UPRIGHT body whose
// head touches the ceiling (y = 28 - 1.82). The ceiling deck's gravity turns the body over in
// 0.3 s — about its middle, so it never moves — and it stands on the ceiling (see the test).
// Towers: the ceiling Tower's `pos.y` is its hanging tip minus 1 m, so its touch volume
// (rules/match.ts: pos.y - 1 .. pos.y + height + 2) is the floor Tower's turned over.
import type { Vec3 } from '../../math/vec3';
import { v3, normalize } from '../../math/vec3';
import { qFromAxisAngle, qIdentity, qMul, qNormalize } from '../../math/quat';
import { MOVEMENT_DEFAULTS } from '../../config/movement';
import { LevelBuilder, wedgeRamp } from '../builder';
import type {
  BombSiteDef,
  BoxDef,
  GravityZoneDef,
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
/** the Seam's glow */
const VIOLET = 0x9a7bff;
/** cold white service light (floor deck) / amber emergency light (ceiling deck) */
const COLD = 0xd6e6ff;
const AMBER = 0xffa33d;
const COLD_DIM = 0x8fb4d8;
const AMBER_DIM = 0xc9803a;
const HAZARD = 0xd8a21a;
const SITE = 0xc23b3b;
const TEAL_DARK = 0x0f5c6b;
// surfaces: the floor deck's cool greys, the ceiling deck's warm browns
const PLATE_LO = 0x55606e;
const PLATE_HI = 0x6b5c4e;
const HULL_LO = 0x384558;
const HULL_HI = 0x4a3d38;
const PANEL_LO = 0x5a6982;
const PANEL_HI = 0x7a6450;
const CRATE_LO = 0x6f7a6a;
const CRATE_HI = 0x8a6440;
const SPINDLE_LO = 0x4a5878;
const SPINDLE_HI = 0x6e5040;
const BULK_LO = 0x2c3646;
const BULK_HI = 0x3d302b;
/** the side planes' walls */
const WALL_N = 0x43506a;
const WALL_S = 0x3b4a5a;

/** Turned over: the lower half's colours → the upper half's. */
const RECOLOR: Record<number, number> = {
  [CYAN]: ORANGE,
  [COLD]: AMBER,
  [COLD_DIM]: AMBER_DIM,
  [TEAL_DARK]: 0x6b3a0f,
  [PLATE_LO]: PLATE_HI,
  [HULL_LO]: HULL_HI,
  [PANEL_LO]: PANEL_HI,
  [CRATE_LO]: CRATE_HI,
  [SPINDLE_LO]: SPINDLE_HI,
  [BULK_LO]: BULK_HI,
};
const REMAT: Partial<Record<Material, Material>> = { teamA: 'teamB' };

type Rect = [x0: number, x1: number, z0: number, z1: number];

/** Key coordinates (the lower half; the upper half is its image, `antipodeImage`). */
export const ANTIPODE = {
  /** floor deck y 0, ceiling deck y = H */
  H: 28,
  halfX: 60,
  /** the main hall's half-width; the side planes lie beyond it */
  halfZ: 24,
  /** gravity bands: the floor deck's up to y0, zero-G y0..y1, the ceiling deck's above y1 */
  seam: { y0: 8, y1: 20 },
  /** the deck rooms' roof (the ceiling deck's rooms: H - roof) */
  roof: 6,
  /** the zero-G hall between the decks: x ±x, z ±z, y y0..H - y0 */
  seamHall: { x: 24, z: 20, y0: 9 },
  /** the well: where the two decks see each other across the Seam */
  well: { x: 13, z: 11 },
  /** side planes: the space between the main hall's wall (z 24..25) and the hull (z 31..32) */
  plane: { z0: 25, z1: 31 },
  /** cyan's bastion (floor deck); orange's is its image on the ceiling */
  bastion: { x0: -59, x1: -47, z: 9 },
  /** cyan's quarters (floor deck, the second spawn room) */
  quarters: { x0: -53, x1: -38, z0: -24, z1: -18 },
  /** cyan's Tower block x -56..-54, z ±1, 4 m (orange's hangs at x 54..56) */
  tower: { x: -55, h: 4 },
  /** the Spindle: core half-size, corner posts out to `post`, fillets `fillet` m */
  spindle: { core: 4, post: 6.2, fillet: 2 },
  /** doors from the floor deck into the side planes (x ranges; y 0..doorH) */
  doors: {
    h: 4,
    /** north: site B's, the junction's, site A's */
    north: [
      [-33, -29],
      [-5, -1],
      [29, 33],
    ] as [number, number][],
    /** south: the tunnel's west and east shafts */
    south: [
      [-30, -26],
      [26, 30],
    ] as [number, number][],
  },
  /** site rooms on the north plane: x ranges (y 0..H) */
  roomB: [-40, -22] as [number, number],
  roomA: [22, 40] as [number, number],
  siteA: { min: v3(24, 8, 26), max: v3(38, 20, 31) },
  siteB: { min: v3(-38, 8, 26), max: v3(-24, 20, 31) },
  powerups: [v3(0, 14, 5), v3(0, 14, -5)],
  /** launch pads on the well floor (x, z; 2 m square) and their throw (m/s up) */
  pads: [
    [-11.5, 9.5],
    [11.5, -9.5],
  ] as [number, number][],
  padSpeed: 19,
};

const H = ANTIPODE.H;
const MID = H / 2;
/** a ceiling spawn / area: the feet of an upright body whose head touches the ceiling */
export const ANTIPODE_HANG = MOVEMENT_DEFAULTS.standHeight + 0.02;
const HANG = ANTIPODE_HANG;

/** The half-turn about the line y = 14, x = 0 (along z): the map's symmetry. */
export const antipodeImage = (p: Vec3): Vec3 => v3(-p.x, H - p.y, p.z);
/** A direction (gravity, facing) under the half-turn. */
export const antipodeImageDir = (d: Vec3): Vec3 => v3(-d.x + 0, -d.y + 0, d.z + 0);
/** The half-turn as a rotation (for turned boxes). */
export const ANTIPODE_TURN = qFromAxisAngle(v3(0, 0, 1), Math.PI);

const imageBox = (b: BoxDef): BoxDef => {
  const out: BoxDef = { ...b, c: antipodeImage(b.c) };
  if (b.q || b.prism !== undefined) out.q = qNormalize(qMul(ANTIPODE_TURN, b.q ?? qIdentity()));
  if (b.mat && REMAT[b.mat]) out.mat = REMAT[b.mat];
  if (b.color !== undefined) out.color = RECOLOR[b.color] ?? b.color;
  if (b.trim !== undefined) out.trim = RECOLOR[b.trim] ?? b.trim;
  return out;
};

/**
 * The solid part of `region` around the open `holes` (rooms, corridors), as few rectangles as
 * a grid merge gives: cut on every edge, then join runs of solid cells, then equal runs.
 */
const carve = (region: Rect, holes: Rect[]): Rect[] => {
  const xs = new Set<number>([region[0], region[1]]);
  const zs = new Set<number>([region[2], region[3]]);
  for (const h of holes) {
    for (const x of [h[0], h[1]]) if (x > region[0] && x < region[1]) xs.add(x);
    for (const z of [h[2], h[3]]) if (z > region[2] && z < region[3]) zs.add(z);
  }
  const X = [...xs].sort((a, b) => a - b);
  const Z = [...zs].sort((a, b) => a - b);
  const open = (i: number, j: number) => {
    const cx = (X[i] + X[i + 1]) / 2;
    const cz = (Z[j] + Z[j + 1]) / 2;
    return holes.some((h) => cx > h[0] && cx < h[1] && cz > h[2] && cz < h[3]);
  };
  // runs along x in each z row, then stack equal runs of neighbouring rows
  const runs: Rect[] = [];
  for (let j = 0; j < Z.length - 1; j++) {
    let i = 0;
    while (i < X.length - 1) {
      if (open(i, j)) {
        i++;
        continue;
      }
      let k = i;
      while (k < X.length - 1 && !open(k, j)) k++;
      runs.push([X[i], X[k], Z[j], Z[j + 1]]);
      i = k;
    }
  }
  const out: Rect[] = [];
  for (const r of runs) {
    const prev = out.find((o) => o[0] === r[0] && o[1] === r[1] && o[3] === r[2]);
    if (prev) prev[3] = r[3];
    else out.push([...r]);
  }
  return out;
};

// ============================ the plan (lower half) ============================

/** The floor deck's rooms and corridors (x0, x1, z0, z1), y 0..roof: everything else is wall. */
export const ANTIPODE_FLOOR: Record<string, Rect> = {
  // cyan's end
  bastion: [-59, -47, -9, 9],
  bastionDoorN: [-50, -47, 9, 11],
  bastionDoorS: [-50, -47, -11, -9],
  passageN: [-50, -34, 11, 15],
  passageS: [-50, -34, -15, -11],
  hallToN: [-36, -32, 7, 11],
  hallToS: [-36, -32, -11, -7],
  lobbyBDoor: [-42, -38, 15, 17],
  lobbyB: [-44, -24, 17, 24],
  hall: [-36, -22, -7, 7],
  hallToLobbyB: [-28, -24, 7, 17],
  quarters: [-53, -38, -24, -18],
  quartersDoorN: [-41, -38, -18, -15],
  quartersDoorE: [-38, -34, -24, -21.5],
  tunnelW: [-34, -22, -24, -18],
  hallToTunnelW: [-28, -24, -18, -7],
  midW: [-22, -13, -2, 2],
  galleryN: [-24, -6, 19, 23],
  junction: [-6, 0, 11, 24],
  galleryS: [-22, -4, -22, -18],
  galleryStoWell: [-8, -4, -18, -11],
  // the middle
  well: [-13, 13, -11, 11],
  // cyan's forward end (under orange's)
  midE: [13, 22, -2, 2],
  hallE: [22, 36, -8, 6],
  hallEToA: [30, 34, 6, 17],
  lobbyA: [24, 42, 17, 24],
  passageNE: [6, 10, 11, 23],
  galleryNE: [6, 26, 19, 23],
  tunnelE: [22, 34, -24, -18],
  hallEToTunnel: [24, 28, -18, -8],
  wellToSE: [4, 8, -18, -11],
  gallerySE: [4, 22, -22, -18],
};

/** The north plane's rooms (x0, x1, y0, y1), z 25..31; everything else is solid. */
const NORTH_PLANE: Rect[] = [
  [-40, -22, 0, 14], // site B's room (its top half is site A's bottom half turned over)
  [22, 40, 0, 14], // site A's room
  [-6, 6, 0, 14], // the junction hall
  [-22, -6, 12, 14], // the connector's arms (y 12..16 with their images)
  [6, 22, 12, 14],
];
/** The south plane's tunnels (x0, x1, y0, y1), z -31..-25. */
const SOUTH_PLANE: Rect[] = [
  [-30, 30, 7, 11], // the low bar (its image: the high bar, y 17..21)
  [-30, -26, 0, 11], // the shafts up from the floor doors
  [26, 30, 0, 11],
  [-2, 2, 11, 14], // the rung (y 11..17 with its image)
];

export const buildAntipode = (): LevelDef => {
  const A = ANTIPODE;
  const lo = new LevelBuilder(); // the lower half: everything with y ≤ 14
  type Opts = Omit<BoxDef, 'c' | 'h'>;
  const box = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    o: Opts = {},
  ) =>
    lo.box(
      v3(x0, y0, z0),
      v3(x1, y1, z1),
      o.mat && o.mat !== 'crate' ? o : { mat: 'crate', color: CRATE_LO, ...o },
    );
  const deco = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material,
    extra: { color?: number; trim?: number } = {},
  ) => lo.box(v3(x0, y0, z0), v3(x1, y1, z1), { mat, noCollide: true, ...extra });
  const push = (b: BoxDef) => lo.boxes.push(b);

  const hull: Opts = { mat: 'hull', color: HULL_LO };
  const bulk: Opts = { mat: 'hull', color: BULK_LO };
  const panel: Opts = { mat: 'panel', color: PANEL_LO };
  const plate = { mat: 'floor' as Material, color: PLATE_LO };

  const L = A.halfX;
  const W = A.halfZ;
  const P = A.plane;
  const R = A.roof;
  const F = ANTIPODE_FLOOR;

  // ============================ the shell ============================
  // the floor plate under everything, with glass panels onto the stars below (the ceiling deck
  // has them overhead)
  const floorWindows = [
    { u0: -31, u1: -27, v0: -3, v1: 3 },
    { u0: 27, u1: 31, v0: -5, v1: -1 },
    { u0: -40, u1: -36, v0: 19, v1: 22 },
  ];
  lo.wall('y', -0.5, 1, -L - 1, L + 1, -P.z1 - 1, P.z1 + 1, floorWindows, {
    mat: 'plate',
    color: PLATE_LO,
  });
  for (const h of floorWindows) box(h.u0, -1, h.v0, h.u1, 0, h.v1, { mat: 'skyglass' });
  // end walls and the hull's long walls (the side planes' floors)
  for (const sx of [-1, 1]) box(sx * L, 0, -P.z1 - 1, sx * (L + 1), MID, P.z1 + 1, hull);
  for (const sz of [-1, 1]) box(-L, 0, sz * P.z1, L, MID, sz * (P.z1 + 1), panel);

  // ============================ the floor deck ============================
  // walls: the deck is solid up to the roof except its rooms and corridors
  const rooms = Object.values(F);
  for (const [x0, x1, z0, z1] of carve([-L, L, -W, W], rooms))
    box(x0, 0, z0, x1, R, z1, { mat: 'hull', color: HULL_LO });
  // the hull between the decks: solid over the rooms (y 6..9) but for the well, and over that
  // (y 9..14) but for the Seam's hall
  const S = A.seamHall;
  const WL = A.well;
  for (const [x0, x1, z0, z1] of carve([-L, L, -W, W], [[-WL.x, WL.x, -WL.z, WL.z]]))
    box(x0, R, z0, x1, S.y0, z1, bulk);
  for (const [x0, x1, z0, z1] of carve([-L, L, -W, W], [[-S.x, S.x, -S.z, S.z]]))
    box(x0, S.y0, z0, x1, MID, z1, bulk);
  // the rooms' ceiling light strips (under the roof) along each room's long axis
  for (const [name, [x0, x1, z0, z1]] of Object.entries(F)) {
    if (name === 'well' || name === 'quarters' || name.includes('Door') || name.startsWith('hallTo'))
      continue;
    if (name.startsWith('gallery')) continue; // (their bulkhead ribs reach the roof)
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    if (x1 - x0 >= z1 - z0) deco(x0 + 1, R - 0.08, cz - 0.15, x1 - 1, R - 0.01, cz + 0.15, 'trim', { color: COLD_DIM });
    else deco(cx - 0.15, R - 0.08, z0 + 1, cx + 0.15, R - 0.01, z1 - 1, 'trim', { color: COLD_DIM });
  }

  // ============================ the side planes ============================
  const D = A.doors;
  const planeZones: GravityZoneDef[] = [];
  for (const s of [1, -1] as const) {
    const side = s > 0 ? 'north' : 'south';
    const Z = (z: number) => s * z;
    const zr = (a: number, b: number): [number, number] => [Math.min(Z(a), Z(b)), Math.max(Z(a), Z(b))];
    const [pz0, pz1] = zr(P.z0, P.z1);
    const [dz0, dz1] = zr(W, P.z0);
    const plan = s > 0 ? NORTH_PLANE : SOUTH_PLANE;
    const doors = s > 0 ? D.north : D.south;
    // solid but for the rooms/tunnels (in the plane's x, y)
    for (const [x0, x1, y0, y1] of carve([-L, L, 0, MID], plan))
      box(x0, y0, pz0, x1, y1, pz1, { mat: 'panel', color: s > 0 ? WALL_N : WALL_S });
    // the main hall's wall, with the deck doors
    lo.wall(
      'z',
      Z(W + 0.5),
      1,
      -L,
      L,
      0,
      MID,
      doors.map(([u0, u1]) => ({ u0, u1, v0: 0, v1: D.h })),
      hull,
    );
    // gravity: the plane pulls into the hull wall
    planeZones.push({
      name: `${side}-plane`,
      min: v3(-L - 1, -1, Math.min(Z(W), Z(P.z1 + 1))),
      max: v3(L + 1, MID, Math.max(Z(W), Z(P.z1 + 1))),
      gravity: v3(0, 0, s),
      priority: 1,
    });
    for (const [u0, u1] of doors) {
      const inRoom = s > 0 && u1 - u0 < 6 && (u0 < -20 || u0 > 20);
      // the fillet (45°) at the foot of the hull wall inside the door: floor → wall; in a site
      // room a little wider than the door
      const fw = inRoom ? 6 : u1 - u0;
      const fc = (u0 + u1) / 2;
      push(wedgeRamp('z', Z(P.z1 - 2), Z(P.z1), 0, 2, fc, fw, plate));
      // a pocket by the door keeps the floor a floor (door height by the door, so a jump
      // there keeps you on the floor; over the fillet only up to its middle)
      const [kz0, kz1] = zr(W, P.z1 - 2.7);
      planeZones.push(
        {
          name: `${side}-door${fc}`,
          min: v3(fc - fw / 2, -1, kz0),
          max: v3(fc + fw / 2, D.h, kz1),
          gravity: v3(0, -1, 0),
          priority: 2,
        },
        {
          name: `${side}-floor${fc}`,
          min: v3(fc - fw / 2, -1, pz0 - (s > 0 ? 1 : 0)),
          max: v3(fc + fw / 2, 1.6, pz1 + (s > 0 ? 0 : 1)),
          gravity: v3(0, -1, 0),
          priority: 2,
        },
      );
      // the door's frame light and hazard stripes across the threshold
      deco(u0 - 0.2, D.h, Z(W) - (s > 0 ? 0.08 : 0), u1 + 0.2, D.h + 0.2, Z(W) + (s > 0 ? 0 : 0.08), 'trim', {
        color: VIOLET,
      });
      for (let x = u0 + 0.25; x < u1 - 0.5; x += 1)
        deco(x, 0.004, dz0 + 0.1, x + 0.5, 0.02, dz1 - 0.1, 'trim', { color: HAZARD });
    }
    // light strips along the hull wall in each room / tunnel (the plane's "ceiling" is the main
    // hall's wall: strips on it)
    for (const [x0, x1, y0, y1] of plan) {
      const ym = (y0 + y1) / 2;
      if (y1 - y0 < 3) continue;
      deco(x0 + 0.5, ym - 0.15, Z(P.z0) - (s > 0 ? 0 : 0.08), x1 - 0.5, ym + 0.15, Z(P.z0) + (s > 0 ? 0.08 : 0), 'trim', {
        color: s > 0 ? COLD : VIOLET,
      });
    }
  }

  // ---------- the site rooms' cover (on the north hull wall: boxes standing out of it) ----------
  // A box on the wall: x0..x1, y0..y1 along the wall, `tall` metres out of it (full ≥ 2, half ≤ 1.25)
  const onWall = (x0: number, x1: number, y0: number, y1: number, tall: number, o: Opts = {}) =>
    box(x0, y0, P.z1 - tall, x1, y1, P.z1, o);
  // site A's lower half (site B's upper half is this turned over) and site B's lower half
  // (site A's upper half): the rooms get different cover top and bottom
  // A lower: a generator block by the door (full), crates across the plant zone
  onWall(35, 38, 1.5, 4.5, 2.4, { mat: 'engine', trim: COLD_DIM });
  onWall(24, 27.5, 4, 6, 2.2, { trim: COLD_DIM });
  onWall(26.5, 29.5, 10.5, 11.7, 1.2);
  onWall(36, 38.5, 10.5, 13, 2.2);
  onWall(23, 24.2, 9.5, 12.5, 1.2, panel);
  // B lower: a pillar pair, a crate stack, a low wall
  onWall(-36.5, -34, 5, 7.5, 2.4, { mat: 'pillar', color: HULL_LO });
  onWall(-28, -25.5, 5, 7.5, 2.4, { mat: 'pillar', color: HULL_LO });
  onWall(-39, -36.5, 10.5, 13, 2.2, { trim: COLD_DIM });
  onWall(-30, -26, 9.5, 10.7, 1.2, panel);
  // the junction hall: a coolant tank each side (walked round)
  onWall(-5.5, -3.5, 6, 9, 2.4, { mat: 'engine', trim: VIOLET });
  onWall(3, 5, 4, 7, 2.2, { mat: 'engine', trim: VIOLET });
  // the south tunnels: ribs (low enough to step over) and conduits (half cover)
  for (const x of [-20, -10, 10, 20])
    box(x - 0.3, 7, -P.z1, x + 0.3, 11, -P.z1 + 0.15, { mat: 'pillar', color: HULL_LO });
  box(-16, 7, -P.z1, -14, 8.2, -P.z1 + 1.2, { mat: 'engine', trim: VIOLET });
  box(14, 9.8, -P.z1, 16, 11, -P.z1 + 1.2, { mat: 'engine', trim: VIOLET });
  // baffles: a bulkhead across half the bar on either side of the rung (staggered, so the bar
  // is never one 60 m lane: you weave round them)
  box(-8.5, 7, -P.z1, -7.5, 9.2, -P.z0 - 0.08, { mat: 'panel', color: WALL_S, trim: VIOLET });
  box(7.5, 8.8, -P.z1, 8.5, 11, -P.z0 - 0.08, { mat: 'panel', color: WALL_S, trim: VIOLET });
  // the site marks: outline painted on the hull wall (the site's twin paints the other half)
  for (const site of [A.siteA, A.siteB]) {
    const y1 = Math.min(site.max.y, MID);
    const zz = P.z1 - 0.02;
    deco(site.min.x, site.min.y, zz, site.max.x, site.min.y + 0.15, P.z1 - 0.004, 'trim', { color: SITE });
    deco(site.min.x, site.min.y, zz, site.min.x + 0.15, y1, P.z1 - 0.004, 'trim', { color: SITE });
    deco(site.max.x - 0.15, site.min.y, zz, site.max.x, y1, P.z1 - 0.004, 'trim', { color: SITE });
  }

  // ============================ the Spindle ============================
  const C = A.spindle.core;
  const PO = A.spindle.post;
  box(-C, 0, -C, C, MID, C, { mat: 'pillar', color: SPINDLE_LO });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      box(sx * C, 0, sz * C, sx * PO, MID, sz * PO, { mat: 'hull', color: HULL_LO, trim: VIOLET });
  // the fillets (45°) at the foot of each groove
  push(wedgeRamp('x', -C - 2, -C, 0, 2, 0, 2 * C, plate));
  push(wedgeRamp('x', C + 2, C, 0, 2, 0, 2 * C, plate));
  push(wedgeRamp('z', C + 2, C, 0, 2, 0, 2 * C, plate));
  push(wedgeRamp('z', -C - 2, -C, 0, 2, 0, 2 * C, plate));
  // light rungs up each groove's face; hazard stripes round the foot of each groove
  for (let y = 3; y < MID; y += 2.5) {
    deco(-C - 0.08, y, -C + 0.6, -C, y + 0.12, C - 0.6, 'trim', { color: COLD_DIM });
    deco(C, y, -C + 0.6, C + 0.08, y + 0.12, C - 0.6, 'trim', { color: COLD_DIM });
    deco(-C + 0.6, y, C, C - 0.6, y + 0.12, C + 0.08, 'trim', { color: COLD_DIM });
    deco(-C + 0.6, y, -C - 0.08, C - 0.6, y + 0.12, -C, 'trim', { color: COLD_DIM });
  }
  for (const sx of [-1, 1])
    for (let z = -C + 0.5; z < C; z += 2) {
      deco(sx * (PO + 0.3), 0.004, z, sx * (PO + 1.0), 0.02, z + 1, 'trim', { color: HAZARD });
      deco(z, 0.004, sx * (PO + 0.3), z + 1, 0.02, sx * (PO + 1.0), 'trim', { color: HAZARD });
    }
  // groove gravity: into the face, from just above the fillet's middle up to the middle (the
  // image does the top half); the lowest part only over the groove itself
  const grooveZones: GravityZoneDef[] = [];
  for (const [name, n] of [
    ['-x', v3(-1, 0, 0)],
    ['+x', v3(1, 0, 0)],
    ['+z', v3(0, 0, 1)],
    ['-z', v3(0, 0, -1)],
  ] as const) {
    // n: the face's outward normal; the zone reaches `depth` out from the face
    const slab = (y0: number, y1: number, depth: number) => {
      const a = n.x !== 0 ? v3(n.x * C, y0, -C) : v3(-C, y0, n.z * C);
      const b = n.x !== 0 ? v3(n.x * (C + depth), y1, C) : v3(C, y1, n.z * (C + depth));
      grooveZones.push({
        name: `spindle${name}-${y0}`,
        min: v3(Math.min(a.x, b.x), y0, Math.min(a.z, b.z)),
        max: v3(Math.max(a.x, b.x), y1, Math.max(a.z, b.z)),
        gravity: v3(-n.x + 0, 0, -n.z + 0),
        priority: 3,
      });
    };
    slab(1.6, 5, PO - C);
    slab(5, MID, 3.5);
  }

  // ============================ cyan's bastion ============================
  const B = A.bastion;
  // blast walls: the doors (north-east and south-east corners) never see the spawns
  box(-52, 0, 3, -51, R, B.z, { mat: 'panel', color: PANEL_LO, trim: CYAN });
  box(-52, 0, -B.z, -51, R, -3, { mat: 'panel', color: PANEL_LO, trim: CYAN });
  // the Tower
  box(A.tower.x - 1, 0, -1, A.tower.x + 1, A.tower.h, 1, { mat: 'teamA', trim: CYAN });
  const spawns: SpawnDef[] = [];
  for (const [x, z] of [
    [-57.5, 4.5],
    [-57.5, 7.5],
    [-57.5, -4.5],
    [-57.5, -7.5],
  ])
    spawns.push({ pos: v3(x, 0, z), yawDeg: -90, team: 0, group: 'bastion' });
  deco(A.tower.x - 2.4, 0.004, -2.4, A.tower.x + 2.4, 0.02, 2.4, 'trim', { color: CYAN });
  deco(A.tower.x - 2.25, 0.006, -2.25, A.tower.x + 2.25, 0.025, 2.25, 'plate', {
    color: PLATE_LO,
  });
  deco(-59, 1.2, -3, -58.94, 4.4, 3, 'teamA', { trim: CYAN });
  // ============================ cyan's quarters ============================
  const Q = A.quarters;
  // a bulkhead hides the bunks at the far end from both doors (round its end to get out:
  // through the door-side half of the room, north to the passage or east to the tunnel lobby)
  box(-47, 0, Q.z0, -46, R, -20.5, { mat: 'panel', color: PANEL_LO, trim: CYAN });
  for (const [x, z] of [
    [-51.8, -23],
    [-51.8, -21.6],
    [-50.2, -23],
    [-50.2, -21.6],
  ])
    spawns.push({ pos: v3(x, 0, z), yawDeg: -90, team: 0, group: 'quarters' });
  // bunks along the back wall (half cover), the team's banner
  box(Q.x0, 0, Q.z0, Q.x0 + 0.5, 1.2, Q.z1 - 1, { mat: 'panel', color: PANEL_LO });
  deco(Q.x0 + 0.5, 1.4, -23.6, Q.x0 + 0.56, 3.8, -20.6, 'teamA', { trim: CYAN });
  for (const sp of spawns)
    deco(sp.pos.x - 0.6, 0.004, sp.pos.z - 0.6, sp.pos.x + 0.6, 0.016, sp.pos.z + 0.6, 'trim', {
      color: TEAL_DARK,
    });

  // ============================ cover on the floor deck ============================
  // home hall: a container across the middle (full), crates, a barrier (half)
  box(-31, 0, 2.5, -27, 2.6, 5, { trim: COLD_DIM });
  box(-35.8, 0, -2.5, -33.8, 2.2, -0.5);
  box(-25.5, 0, -6, -24.3, 1.2, -3);
  // B lobby: crates each side of the site door (full) and a barrier
  box(-43, 0, 20.5, -41, 2.4, 23, { trim: COLD_DIM });
  box(-27, 0, 19, -25, 2.2, 21);
  box(-36.5, 0, 17.5, -34, 1.2, 18.7, panel);
  // tunnel lobby
  box(-25, 0, -23, -23, 2.2, -21);
  box(-33, 0, -19.5, -31, 1.2, -18.3, panel);
  // the well floor: low barriers round the ring
  box(10.3, 0, 6, 11.5, 2.4, 8, { trim: COLD_DIM });
  box(-11.5, 0, -8, -10.3, 2.4, -6, { trim: COLD_DIM });
  // east hall: a container (full), crates
  box(26, 0, 1.5, 30, 2.6, 4, { trim: COLD_DIM });
  box(32, 0, -7, 34.5, 2.2, -4.5);
  box(23, 0, -3.5, 24.2, 1.2, -0.5, panel);
  // A lobby
  box(37, 0, 17.5, 39.5, 2.4, 20, { trim: COLD_DIM });
  box(25.5, 0, 21.5, 27.5, 1.2, 23.5);
  // east tunnel lobby
  box(31, 0, -23.5, 33.5, 2.2, -21.5);
  // the galleries: a bulkhead rib halfway (half the width: you go round it)
  box(-15.5, 0, 19, -14.5, R, 21, { mat: 'panel', color: PANEL_LO });
  box(15.5, 0, 21, 16.5, R, 23, { mat: 'panel', color: PANEL_LO });
  box(-13.5, 0, -22, -12.5, R, -20, { mat: 'panel', color: PANEL_LO });
  box(12.5, 0, -20, 13.5, R, -18, { mat: 'panel', color: PANEL_LO });

  // ============================ the Seam ============================
  // tumbling cargo in the hall (well inside the zero-G band: nobody stands on it)
  const drift = (c: Vec3, size: Vec3, axis: Vec3, deg: number, o: Opts = {}) =>
    push({
      c,
      h: v3(size.x / 2, size.y / 2, size.z / 2),
      q: qFromAxisAngle(normalize(axis), (deg * Math.PI) / 180),
      mat: 'crate',
      color: CRATE_LO,
      ...o,
    });
  drift(v3(-17, 12, -9), v3(3, 2, 2), v3(1, 1, 0.2), 25, { trim: VIOLET });
  drift(v3(-15, 12.2, 13), v3(2.5, 2.5, 2.5), v3(0.3, 1, 0.5), 40);
  drift(v3(15, 11.8, 14), v3(4, 1.4, 2), v3(0, 0.2, 1), 15, { mat: 'pillar', color: HULL_LO });
  drift(v3(17, 12.2, -12), v3(3, 3, 2), v3(1, 0, 1), 30);
  drift(v3(-9, 11.5, 16), v3(2, 2, 2), v3(1, 1, 1), 35, { trim: VIOLET });
  // loose bits drifting with it (decoration: you pass through them)
  const bit = (c: Vec3, size: Vec3, axis: Vec3, deg: number, mat: Material, color: number) =>
    push({
      c,
      h: v3(size.x / 2, size.y / 2, size.z / 2),
      q: qFromAxisAngle(normalize(axis), (deg * Math.PI) / 180),
      mat,
      color,
      noCollide: true,
    });
  bit(v3(-20, 12.5, -16), v3(0.8, 0.4, 1.6), v3(1, 0.3, 0.2), 35, 'crate', CRATE_LO);
  bit(v3(-2, 12, 14), v3(1.8, 0.25, 0.25), v3(0.2, 1, 0.4), 60, 'pillar', HULL_LO);
  bit(v3(10, 10.6, -17), v3(0.7, 0.7, 0.7), v3(1, 1, 0), 20, 'crate', CRATE_LO);
  bit(v3(20, 12.4, 5), v3(1.2, 0.1, 0.8), v3(0.4, 0.2, 1), 50, 'panel', PANEL_LO);
  bit(v3(-10, 10.6, 3), v3(0.9, 0.5, 0.5), v3(1, 0, 0.6), 40, 'crate', CRATE_LO);
  // the Seam's line round the hall (where the halves meet) and round the Spindle's posts
  for (const sz of [-1, 1]) {
    deco(-S.x, MID - 0.1, sz * S.z, S.x, MID, sz * (S.z - 0.08), 'trim', { color: VIOLET });
    deco(sz * S.x, MID - 0.1, -S.z, sz * (S.x - 0.08), MID, S.z, 'trim', { color: VIOLET });
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      deco(sx * PO, MID - 0.1, sz * C, sx * (PO + 0.06), MID, sz * PO, 'trim', { color: VIOLET });
      deco(sx * C, MID - 0.1, sz * PO, sx * PO, MID, sz * (PO + 0.06), 'trim', { color: VIOLET });
    }
  // the launch pads in the well's corners: a throw straight up, through the Seam and onto the
  // other deck's well floor (a pad's landing never hurts)
  for (const [x, z] of A.pads) {
    deco(x - 1, 0.004, z - 1, x + 1, 0.03, z + 1, 'trim', { color: VIOLET });
    deco(x - 1.2, 0.002, z - 1.2, x + 1.2, 0.02, z + 1.2, 'plate', { color: HAZARD });
  }
  // the well's rim: hazard light round the edge of the roof over the deck
  for (const sz of [-1, 1])
    deco(-WL.x, S.y0 - 0.25, sz * WL.z, WL.x, S.y0 - 0.05, sz * (WL.z - 0.08), 'trim', {
      color: HAZARD,
    });

  // ============================ zones ============================
  const lowerZones: GravityZoneDef[] = [
    {
      name: 'floor-deck',
      min: v3(-L - 2, -2, -P.z1 - 2),
      max: v3(L + 2, A.seam.y0, P.z1 + 2),
      gravity: v3(0, -1, 0),
    },
    {
      name: 'seam-low',
      min: v3(-L - 2, A.seam.y0, -P.z1 - 2),
      max: v3(L + 2, MID, P.z1 + 2),
      gravity: v3(0, 0, 0),
    },
    ...planeZones,
    ...grooveZones,
  ];
  const IMAGE_ZONE: Record<string, string> = {
    'floor-deck': 'ceiling-deck',
    'seam-low': 'seam-high',
  };
  const zones: GravityZoneDef[] = [
    ...lowerZones,
    ...lowerZones.map((z) => {
      const a = antipodeImage(z.min);
      const b = antipodeImage(z.max);
      return {
        ...z,
        name: IMAGE_ZONE[z.name] ?? `${z.name}~`,
        min: v3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)),
        max: v3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)),
        gravity: antipodeImageDir(z.gravity),
      };
    }),
  ];

  // ============================ objectives ============================
  const towers: TowerDef[] = [
    { team: 0, pos: v3(A.tower.x, 0, 0), radius: 1.5, height: A.tower.h },
    {
      team: 1,
      pos: v3(-A.tower.x, H - A.tower.h - 1, 0),
      radius: 1.5,
      height: A.tower.h,
      hanging: true,
    },
  ];
  const bombSites: BombSiteDef[] = [
    { name: 'A', min: A.siteA.min, max: A.siteA.max },
    { name: 'B', min: A.siteB.min, max: A.siteB.max },
  ];
  const allSpawns: SpawnDef[] = [
    ...spawns,
    ...spawns.map((s) => ({
      pos: v3(-s.pos.x, H - s.pos.y - HANG, s.pos.z),
      yawDeg: -s.yawDeg,
      team: 1 as const,
      group: s.group,
    })),
  ];
  const lowerAreas: [string, string, Vec3, number][] = [
    ['Cyan bastion', 'Orange bastion', v3(-49, 0, 0), -90],
    ['Cyan quarters', 'Orange quarters', v3(-49, 0, -19.2), -90],
    ['Home hall (floor)', 'Home hall (ceiling)', v3(-24, 0, 0), -90],
    ['Well (floor, west)', 'Well (ceiling, east)', v3(-10, 0, 0), -90],
    ['B lobby (floor)', 'A lobby (ceiling)', v3(-31, 0, 18), 180],
    ['A lobby (floor)', 'B lobby (ceiling)', v3(31, 0, 18), 180],
    ['Tunnel lobby (floor, west)', 'Tunnel lobby (ceiling, east)', v3(-28, 0, -19), 0],
    ['East hall (floor)', 'West hall (ceiling)', v3(29, 0, -2), 90],
  ];

  const out = new LevelBuilder();
  out.boxes = [...lo.boxes, ...lo.boxes.map(imageBox)];
  return out.build({
    name: 'Antipode',
    boundsMin: v3(-L - 2, -2, -P.z1 - 2),
    boundsMax: v3(L + 2, H + 2, P.z1 + 2),
    defaultGravity: v3(0, -1, 0),
    zones,
    rails: [],
    pads: [],
    launchPads: A.pads.flatMap(([x, z]) => {
      const pad: LaunchPadDef = {
        min: v3(x - 1, 0, z - 1),
        max: v3(x + 1, 1.5, z + 1),
        vel: v3(0, A.padSpeed, 0),
      };
      const a = antipodeImage(pad.min);
      const b = antipodeImage(pad.max);
      return [
        pad,
        {
          min: v3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)),
          max: v3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)),
          vel: antipodeImageDir(pad.vel),
        },
      ];
    }),
    spawns: allSpawns,
    towers,
    controllerHomes: [v3(-49, 0.9, 0), v3(49, H - 0.9, 0)],
    waypoints: antipodeWaypoints(),
    bombSites,
    powerups: A.powerups.map((p) => v3(p.x, p.y, p.z)),
    areas: [
      ...lowerAreas.map(([name, , pos, yawDeg]) => ({ name, pos, yawDeg })),
      ...lowerAreas.map(([, name, pos, yawDeg]) => ({
        name,
        pos: v3(-pos.x, H - pos.y - HANG, pos.z),
        yawDeg: -yawDeg,
      })),
    ],
    fog: { color: 0x07080f, near: 45, far: 170 },
    ambient: 0.72,
    lights: antipodeLights(),
    sky: {
      moons: [
        { dir: v3(0.3, -0.8, 0.5), sizeDeg: 7, color: 0x9fb8e8 },
        { dir: v3(-0.6, 0.7, -0.4), sizeDeg: 4, color: 0xe8a070 },
      ],
    },
  });
};

/**
 * The bot graph: the lower half by name, then its image ('~' + name). A link to '~name' joins
 * the halves (up the Spindle's grooves, the site rooms, the junction hall, the tunnels' rung);
 * every link's image is added too.
 */
const antipodeWaypoints = (): WaypointDef[] => {
  const lower: { name: string; pos: Vec3 }[] = [];
  const add = (name: string, x: number, y: number, z: number) =>
    lower.push({ name, pos: v3(x, y, z) });
  /** a floor-deck waypoint (1 m above the floor) */
  const fl = (name: string, x: number, z: number) => add(name, x, 1, z);
  /** on the north / south hull wall (1 m off it) */
  const wn = (name: string, x: number, y: number) => add(name, x, y, 30);
  const ws = (name: string, x: number, y: number) => add(name, x, y, -30);

  // bastion: round the blast walls to the corner doors
  fl('home.spN', -57.5, 6);
  fl('home.spS', -57.5, -6);
  fl('home.tower', -52.5, 0);
  fl('home.inN', -53.5, 7.5);
  fl('home.inS', -53.5, -7.5);
  fl('home.backN', -57.5, 2.5);
  fl('home.backS', -57.5, -2.5);
  fl('home.gapN', -49.5, 2);
  fl('home.gapS', -49.5, -2);
  fl('home.cornerN', -48.5, 7.5);
  fl('home.cornerS', -48.5, -7.5);
  fl('home.doorN', -48.5, 10);
  fl('home.doorS', -48.5, -10);
  // the passages
  fl('pn.w', -48, 13);
  fl('pn.e', -37, 13);
  fl('ps.w', -48, -13);
  fl('ps.e', -37, -13);
  fl('ps.q', -40.5, -13);
  fl('pn.hall', -34, 9);
  fl('ps.hall', -34, -9);
  // quarters
  fl('q.sp', -50, -19.3);
  fl('q.gap', -46.5, -18.8);
  fl('q.mid', -43, -18.9);
  fl('q.n', -39.5, -20.3);
  fl('q.door', -39.5, -16.5);
  fl('q.e', -40, -22.8);
  fl('q.edoor', -36, -22.8);
  // home hall
  fl('hall.nw', -33, 6);
  fl('hall.sw', -34, -6.2);
  fl('hall.c', -30, -1);
  fl('hall.ne', -25, 6);
  fl('hall.se', -26, -2);
  fl('hall.e', -23, 0);
  fl('hall.toB', -26, 12);
  fl('hall.toT', -26, -12);
  // B lobby, the north gallery, the junction corridor
  fl('lobB.door', -40, 16);
  fl('lobB.w', -40, 19.5);
  fl('lobB.c', -33, 20);
  fl('lobB.e', -26, 22.5);
  fl('lobB.s', -26, 17.5);
  fl('galN.w', -20, 21);
  fl('galN.m', -14, 22.2);
  fl('galN.e', -8, 21);
  fl('jc.n', -3, 21);
  fl('jc.m', -3, 16);
  fl('jc.s', -3, 12);
  // tunnel lobby, the south gallery
  fl('tunW.w', -33, -21);
  fl('tunW.c', -27, -19);
  fl('tunW.e', -23.5, -19.5);
  fl('galS.w', -18, -20);
  fl('galS.m', -13, -19);
  fl('galS.e', -6, -20);
  fl('galS.n', -6, -14);
  fl('galS.in', -6, -10);
  // the corridor from the hall to the well, and the well's floor ring
  fl('midW', -18, 0);
  fl('well.w', -11, 0);
  fl('ring.nw', -8.5, 8.5);
  fl('ring.sw', -9.5, -9);
  fl('ring.ne', 9.5, 9);
  fl('ring.se', 8.5, -8.5);
  fl('ring.n', -3, 8.5);
  fl('ring.s', 6, -8.5);
  fl('well.e', 11, 0);
  // the Spindle's four grooves (1 m off each face)
  for (const [k, dx, dz] of [
    ['w', -1, 0],
    ['e', 1, 0],
    ['n', 0, 1],
    ['s', 0, -1],
  ] as const) {
    add(`sp.${k}0`, dx * 9, 1, dz * 8.5);
    add(`sp.${k}1`, dx * 5, 4, dz * 5);
    add(`sp.${k}2`, dx * 5, 8.5, dz * 5);
    add(`sp.${k}3`, dx * 5, 13, dz * 5);
  }
  // cyan's forward end: the east corridor, east hall, A lobby, north-east passage, tunnel lobby
  fl('midE', 18, 0);
  fl('hallE.w', 24, 2);
  fl('hallE.c', 29, -2);
  fl('hallE.ne', 32, 4.5);
  fl('hallE.se', 26, -6.5);
  fl('hallE.e', 35, 0);
  fl('hallE.toA', 32, 12);
  fl('hallE.toT', 26, -12);
  fl('lobA.s', 32, 18);
  fl('lobA.c', 33, 20.5);
  fl('lobA.w', 25.5, 19);
  fl('lobA.e', 40, 22);
  fl('galNE.e', 22, 21);
  fl('galNE.m', 14, 20);
  fl('galNE.w', 8, 21);
  fl('pNE.s', 8, 13);
  fl('tunE.w', 23.5, -20);
  fl('tunE.c', 27, -19);
  fl('tunE.e', 32, -19.5);
  fl('galSE.w', 6, -20);
  fl('galSE.m', 12, -21.5);
  fl('galSE.e', 18, -20);
  fl('galSE.n', 6, -14);
  // the north plane: each door's way in, then up the wall
  for (const [k, x] of [
    ['nB', -31],
    ['nJ', -3],
    ['nA', 31],
  ] as const) {
    fl(`${k}.out`, x, 20.5);
    fl(`${k}.door`, x, 24.5);
    fl(`${k}.in`, x, 27);
    wn(`${k}.w1`, x, 4);
  }
  // site B's room (lower half) and site A's
  for (const [k, sx] of [
    ['nB', -1],
    ['nA', 1],
  ] as const) {
    wn(`${k}.c`, sx * 31, 8.5);
    wn(`${k}.inner`, sx * 25, 8);
    wn(`${k}.outer`, sx * 38.5, 8);
    wn(`${k}.top`, sx * 31, 13);
    wn(`${k}.side`, sx * 25.5, 13);
  }
  // the connector's arms and the junction hall
  wn('arm.w', -14, 13);
  wn('arm.e', 14, 13);
  wn('nJ.c', -1, 9);
  wn('nJ.top', 0, 12.5);
  wn('nJ.wside', -5, 13);
  wn('nJ.eside', 5, 13);
  // the south plane: down the shafts, along the low bar, the rung
  for (const [k, x] of [
    ['sW', -28],
    ['sE', 28],
  ] as const) {
    fl(`${k}.out`, x, -20.5);
    fl(`${k}.door`, x, -24.5);
    fl(`${k}.in`, x, -27);
    ws(`${k}.w1`, x, 4);
    ws(`${k}.w2`, x, 9);
  }
  for (const x of [-20, 20]) ws(`bar.${x}`, x, 9);
  ws('bar.-10', -11, 9);
  ws('bar.10', 11, 9);
  // round the baffles
  ws('bar.-8', -8, 10.2);
  ws('bar.8', 8, 7.8);
  ws('rung.0', 0, 9);
  ws('rung.1', 0, 12.5);

  /** [a, b, one-way?] */
  const links: [string, string, boolean?][] = [
    // bastion
    ['home.spN', 'home.inN'],
    ['home.spS', 'home.inS'],
    ['home.spN', 'home.backN'],
    ['home.spS', 'home.backS'],
    ['home.backN', 'home.backS'],
    ['home.backN', 'home.gapN'],
    ['home.backS', 'home.gapS'],
    ['home.tower', 'home.gapN'],
    ['home.tower', 'home.gapS'],
    ['home.gapN', 'home.gapS'],
    ['home.gapN', 'home.cornerN'],
    ['home.gapS', 'home.cornerS'],
    ['home.cornerN', 'home.doorN'],
    ['home.cornerS', 'home.doorS'],
    ['home.doorN', 'pn.w'],
    ['home.doorS', 'ps.w'],
    // passages
    ['pn.w', 'pn.e'],
    ['pn.e', 'pn.hall'],
    ['ps.e', 'ps.hall'],
    ['pn.e', 'lobB.door'],
    ['pn.hall', 'hall.nw'],
    ['ps.hall', 'hall.sw'],
    ['ps.w', 'ps.q'],
    ['ps.q', 'ps.e'],
    ['ps.q', 'q.door'],
    // quarters
    ['q.sp', 'q.gap'],
    ['q.gap', 'q.mid'],
    ['q.mid', 'q.n'],
    ['q.n', 'q.door'],
    ['q.n', 'q.e'],
    ['q.e', 'q.edoor'],
    ['q.edoor', 'tunW.w'],
    // home hall
    ['hall.nw', 'hall.c'],
    ['hall.sw', 'hall.c'],
    ['hall.nw', 'hall.ne'],
    ['hall.c', 'hall.se'],
    ['hall.ne', 'hall.e'],
    ['hall.se', 'hall.e'],
    ['hall.ne', 'hall.toB'],
    ['hall.se', 'hall.toT'],
    ['hall.toB', 'lobB.s'],
    ['hall.toT', 'tunW.c'],
    ['hall.e', 'midW'],
    // B lobby → site B's door, the north gallery
    ['lobB.door', 'lobB.w'],
    ['lobB.w', 'lobB.c'],
    ['lobB.c', 'lobB.s'],
    ['lobB.c', 'lobB.e'],
    ['lobB.c', 'nB.out'],
    ['lobB.w', 'nB.out'],
    ['lobB.e', 'galN.w'],
    ['galN.w', 'galN.m'],
    ['galN.m', 'galN.e'],
    ['galN.e', 'jc.n'],
    ['jc.n', 'nJ.out'],
    ['jc.n', 'jc.m'],
    ['jc.m', 'jc.s'],
    ['jc.s', 'ring.n'],
    ['jc.s', 'ring.nw'],
    // tunnel lobby, the south gallery
    ['tunW.w', 'tunW.c'],
    ['tunW.c', 'tunW.e'],
    ['tunW.c', 'sW.out'],
    ['tunW.e', 'galS.w'],
    ['galS.w', 'galS.m'],
    ['galS.m', 'galS.e'],
    ['galS.e', 'galS.n'],
    ['galS.n', 'galS.in'],
    ['galS.in', 'ring.sw'],
    // the well
    ['midW', 'well.w'],
    ['well.w', 'ring.nw'],
    ['well.w', 'ring.sw'],
    ['well.w', 'sp.w0'],
    ['ring.nw', 'sp.w0'],
    ['ring.sw', 'sp.w0'],
    ['ring.nw', 'ring.n'],
    ['ring.n', 'sp.n0'],
    ['ring.ne', 'sp.n0'],
    ['ring.sw', 'sp.s0'],
    ['ring.s', 'sp.s0'],
    ['ring.se', 'ring.s'],
    ['ring.ne', 'sp.e0'],
    ['ring.se', 'sp.e0'],
    ['well.e', 'ring.ne'],
    ['well.e', 'ring.se'],
    ['well.e', 'sp.e0'],
    ['well.e', 'midE'],
    ['ring.ne', 'pNE.s'],
    ['ring.s', 'galSE.n'],
    // cyan's forward end
    ['midE', 'hallE.w'],
    ['hallE.w', 'hallE.c'],
    ['hallE.c', 'hallE.ne'],
    ['hallE.c', 'hallE.se'],
    ['hallE.c', 'hallE.e'],
    ['hallE.ne', 'hallE.e'],
    ['hallE.ne', 'hallE.toA'],
    ['hallE.se', 'hallE.toT'],
    ['hallE.toA', 'lobA.s'],
    ['hallE.toT', 'tunE.c'],
    ['lobA.s', 'lobA.c'],
    ['lobA.s', 'lobA.e'],
    ['lobA.c', 'lobA.w'],
    ['lobA.c', 'lobA.e'],
    ['lobA.c', 'nA.out'],
    ['lobA.e', 'nA.out'],
    ['lobA.w', 'galNE.e'],
    ['galNE.e', 'galNE.m'],
    ['galNE.m', 'galNE.w'],
    ['galNE.w', 'pNE.s'],
    ['tunE.w', 'tunE.c'],
    ['tunE.c', 'tunE.e'],
    ['tunE.c', 'sE.out'],
    ['tunE.w', 'galSE.e'],
    ['galSE.e', 'galSE.m'],
    ['galSE.m', 'galSE.w'],
    ['galSE.w', 'galSE.n'],
    // the site rooms (lower halves)
    ['nB.w1', 'nB.c'],
    ['nB.c', 'nB.inner'],
    ['nB.c', 'nB.outer'],
    ['nB.c', 'nB.top'],
    ['nB.inner', 'nB.side'],
    ['nB.top', 'nB.side'],
    ['nB.outer', 'nB.top'],
    ['nA.w1', 'nA.c'],
    ['nA.c', 'nA.inner'],
    ['nA.c', 'nA.outer'],
    ['nA.c', 'nA.top'],
    ['nA.inner', 'nA.side'],
    ['nA.top', 'nA.side'],
    ['nA.outer', 'nA.top'],
    // the connector and the junction hall
    ['nB.side', 'arm.w'],
    ['arm.w', 'nJ.wside'],
    ['nA.side', 'arm.e'],
    ['arm.e', 'nJ.eside'],
    ['nJ.w1', 'nJ.c'],
    ['nJ.c', 'nJ.wside'],
    ['nJ.c', 'nJ.top'],
    ['nJ.wside', 'nJ.top'],
    ['nJ.eside', 'nJ.top'],
    // the south tunnels
    ['sW.w2', 'bar.-20'],
    ['bar.-20', 'bar.-10'],
    ['bar.-10', 'bar.-8'],
    ['bar.-8', 'rung.0'],
    ['rung.0', 'bar.8'],
    ['bar.8', 'bar.10'],
    ['bar.10', 'bar.20'],
    ['bar.20', 'sE.w2'],
    ['rung.0', 'rung.1'],
  ];
  for (const k of ['w', 'e', 'n', 's'])
    links.push([`sp.${k}0`, `sp.${k}1`], [`sp.${k}1`, `sp.${k}2`], [`sp.${k}2`, `sp.${k}3`]);
  for (const k of ['nB', 'nJ', 'nA', 'sW', 'sE'])
    links.push([`${k}.out`, `${k}.door`], [`${k}.door`, `${k}.in`], [`${k}.in`, `${k}.w1`]);
  links.push(['sW.w1', 'sW.w2'], ['sE.w1', 'sE.w2']);
  // across the middle into the other half: up the grooves (the -x face's top half is the +x
  // face's bottom half turned over), up the site rooms, the junction hall and the rung
  links.push(
    ['sp.w3', '~sp.e3'],
    ['sp.e3', '~sp.w3'],
    ['sp.n3', '~sp.n3'],
    ['sp.s3', '~sp.s3'],
    ['nB.top', '~nA.top'],
    ['nA.top', '~nB.top'],
    ['nJ.top', '~nJ.top'],
    ['rung.1', '~rung.1'],
  );

  const all: WaypointDef[] = [
    ...lower.map((w) => ({ name: w.name, pos: w.pos, links: [] as number[] })),
    ...lower.map((w) => ({ name: `~${w.name}`, pos: antipodeImage(w.pos), links: [] as number[] })),
  ];
  const index = new Map(all.map((w, i) => [w.name!, i]));
  const at = (n: string) => {
    const i = index.get(n);
    if (i === undefined) throw new Error(`waypoint ${n} missing`);
    return i;
  };
  const flip = (n: string) => (n.startsWith('~') ? n.slice(1) : `~${n}`);
  const edge = (a: string, b: string) => {
    const i = at(a);
    const j = at(b);
    if (!all[i].links.includes(j)) all[i].links.push(j);
  };
  for (const [a, b, oneWay] of links)
    for (const [p, q] of [
      [a, b],
      [flip(a), flip(b)],
    ]) {
      edge(p, q);
      if (!oneWay) edge(q, p);
    }
  return all;
};

/**
 * Lights: the lower half's (cold white service light on the floor deck, cyan in cyan's rooms,
 * violet in the Seam and the planes) and their images (amber emergency light on the ceiling deck,
 * orange in orange's rooms). Strip lights made of 'trim' boxes add their own.
 */
const antipodeLights = (): LightDef[] => {
  const R = ANTIPODE.roof;
  const lower: LightDef[] = [
    // cyan's bastion and quarters
    { pos: v3(-55, 4.4, 0), color: CYAN, radius: 10, intensity: 1.5 },
    { pos: v3(-57, 4.3, 6), color: COLD, radius: 8, intensity: 0.9 },
    { pos: v3(-57, 4.3, -6), color: COLD, radius: 8, intensity: 0.9 },
    { pos: v3(-49, 4.3, 0), color: CYAN, radius: 8, intensity: 0.8 },
    { pos: v3(-50, 4.3, -21.5), color: CYAN, radius: 8, intensity: 1 },
    { pos: v3(-42, 4.3, -21), color: COLD, radius: 8, intensity: 0.8 },
    // the sites' rooms on the north hull wall, the junction hall
    { pos: v3(-31, 7, 27), color: COLD, radius: 12, intensity: 1.2 },
    { pos: v3(31, 7, 27), color: COLD, radius: 12, intensity: 1.2 },
    { pos: v3(31, 11, 29), color: SITE, radius: 7, intensity: 0.6 },
    { pos: v3(-31, 11, 29), color: SITE, radius: 7, intensity: 0.6 },
    { pos: v3(0, 7, 27), color: VIOLET, radius: 10, intensity: 0.9 },
    { pos: v3(-14, 13, 27), color: COLD_DIM, radius: 8, intensity: 0.7 },
    { pos: v3(14, 13, 27), color: COLD_DIM, radius: 8, intensity: 0.7 },
    // the south tunnels
    { pos: v3(-28, 5, -27), color: VIOLET, radius: 9, intensity: 0.8 },
    { pos: v3(28, 5, -27), color: VIOLET, radius: 9, intensity: 0.8 },
    { pos: v3(-15, 9, -27), color: COLD_DIM, radius: 10, intensity: 0.8 },
    { pos: v3(15, 9, -27), color: COLD_DIM, radius: 10, intensity: 0.8 },
    { pos: v3(0, 12, -27), color: VIOLET, radius: 8, intensity: 0.9 },
    // the well's floor
    { pos: v3(-9, 3, 0), color: VIOLET, radius: 8, intensity: 0.8 },
    { pos: v3(9, 3, 0), color: VIOLET, radius: 8, intensity: 0.8 },
    { pos: v3(0, 3, 8.5), color: VIOLET, radius: 8, intensity: 0.8 },
    { pos: v3(0, 3, -8.5), color: VIOLET, radius: 8, intensity: 0.8 },
    // the Seam's hall
    { pos: v3(-16, 12, 0), color: VIOLET, radius: 16, intensity: 0.8 },
    { pos: v3(16, 12, 6), color: VIOLET, radius: 16, intensity: 0.8 },
    { pos: v3(0, 12, 15), color: VIOLET, radius: 10, intensity: 0.8 },
    { pos: v3(0, 12, -15), color: VIOLET, radius: 10, intensity: 0.8 },
  ];
  // the floor deck's rooms: a service lamp under the roof in each
  for (const [name, [x0, x1, z0, z1]] of Object.entries(ANTIPODE_FLOOR)) {
    if (name === 'well' || name === 'bastion' || name === 'quarters' || name.includes('Door'))
      continue;
    const big = (x1 - x0) * (z1 - z0) > 120;
    lower.push({
      pos: v3((x0 + x1) / 2, R - 0.6, (z0 + z1) / 2),
      color: COLD,
      radius: big ? 12 : 8,
      intensity: big ? 1.1 : 0.8,
      shaft: big,
    });
  }
  // (the images carry no light shafts: a shaft is drawn down to the floor)
  const image = (l: LightDef): LightDef => ({
    pos: antipodeImage(l.pos),
    color: RECOLOR[l.color] ?? l.color,
    radius: l.radius,
    intensity: l.intensity,
  });
  return [...lower, ...lower.map(image)];
};
