// "Antipode" — the ship where the other team stands on your sky. One long hollow hull, two decks
// that face each other: Cyan (team 0) lives on the FLOOR deck (y 0, gravity down) and spawns at
// the -x end; Orange (team 1) lives on the CEILING deck (y 28, gravity up: they stand upside
// down) and spawns at the +x end. Between them hangs the Seam, a zero-G band (y 8..20).
//
// Fair by a half-turn: every box, zone, spawn, Tower, site, waypoint and area has its twin under
// (x, y, z) → (-x, 28 - y, z), teams swapped and gravity turned over. The map is built as its
// lower half (y ≤ 14) plus that half turned over (`imageBox`); only the look changes (cold white
// service light on the floor deck, amber emergency light on the ceiling deck).
//
//   plan (top view of the floor deck; the ceiling deck is the same turned end for end)
//
//     x -60 ....... -43 ....... -22 ...... -6 .. 6 ...... 22 ....... 43 ........ 60
//      | CYAN BASTION | yard      | gantry  |SPIN-| gantry  | approach  |  SITE A   |
//      | spawns, Tower| container | G (6.5) |DLE  | G (6.5) | N catwalk | (the Hold)|
//      | blast wall   | S catwalk |         |     |         |           |           |
//      north stairwell floor door x -33..-28 (z 24) · south stairwell floor door x 28..33 (z -24)
//
//   BASTION (x -60..-43, z ±14, 5 m, roofed)  8 spawns and the Tower behind a blast wall; two
//        front doors into a vestibule; nothing outside sees in (the roof hides it from the sky)
//   THE SEAM (y 8..20, zero-G)  drift across; past it the other deck's gravity takes you and you
//        fall "up" onto it (1.5 m onto the other deck's gantry, 8 m onto its floor: no damage).
//        Tumbling cargo hangs in it (cover, something to push off).
//   LAUNCH GANTRIES (x ±11..17, z 9..15, top 6.5; ramps from x ±29.2)  a plain jump off the top
//        carries you into the Seam; each stands right under one of the other deck's gantries
//   THE SPINDLE (core x, z ±4; corner posts out to ±6.2)  a column joining the decks with a
//        2.2 m deep groove down each face: walk into a groove, up its 45° fillet, and its gravity
//        (zones pointing into the face) walks you up the column, through the Seam and onto the
//        other deck. The slow, covered way (the groove's walls hide you from the sides). ±z
//        grooves: both teams'; -x groove: cyan's floor ↔ site B; +x: site A ↔ orange's ceiling.
//        Two power-ups float at its middle (y 14) in the ±z grooves.
//   HULL STAIRWELLS (corridors z 25..31 north / -31..-25 south, x ±36)  in by a floor door, up a
//        fillet onto the outer wall (gravity pulls into it), diagonally up the wall, onto the
//        corridor's ceiling and out of a ceiling door at the other end. North: cyan's yard
//        (floor, x -30) ↔ orange's yard (ceiling, x +30); south: site A (floor, x +30) ↔ site B
//        (ceiling, x -30). A window from each into the Seam.
//   SITES  A on the floor deck in orange's half (x 46..56), B on the ceiling deck in cyan's half
//        (x -56..-46): each hangs right over the other team's bastion.
//   LOOK  lamp masts light the floor deck's lanes cold white (the ceiling's hang down, amber);
//        glass panels in each deck and windows in the hull look out on the stars.
//
// Why 28 m between the decks: a jump is 1.2 m and a fall of 22 m kills (config), so each deck's
// band of gravity is 8 m — the Seam's edge is a jump off a gantry (or a jetpack burn off the
// floor) above you, and falling out of it onto a deck never hurts more than a scratch.
//
// Layout rules (docs/PLAYING.md): cover is half (≤ 1.25 m) or full (≥ 2 m); ramps ≤ 30° (the
// fillets are 45°, but each sits across a gravity bend: 45° to either side's gravity); no spawn
// in view from outside its bastion; no fall longer than 8 m (the Seam's edge to a deck).
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

/** Turned over: the lower half's colours → the upper half's. */
const RECOLOR: Record<number, number> = {
  [CYAN]: ORANGE,
  [COLD]: AMBER,
  [COLD_DIM]: AMBER_DIM,
  [PLATE_LO]: PLATE_HI,
  [HULL_LO]: HULL_HI,
  [PANEL_LO]: PANEL_HI,
  [CRATE_LO]: CRATE_HI,
  [SPINDLE_LO]: SPINDLE_HI,
};
const REMAT: Partial<Record<Material, Material>> = { teamA: 'teamB' };

/** Key coordinates (the lower half; the upper half is its image, `antipodeImage`). */
export const ANTIPODE = {
  /** floor deck y 0, ceiling deck y = H */
  H: 28,
  halfX: 60,
  halfZ: 24,
  /** the zero-G band */
  seam: { y0: 8, y1: 20 },
  /** cyan's bastion (interior, floor deck); orange's is its image on the ceiling */
  bastion: { x0: -60, x1: -44, z: 13, h: 5, blastX: -48 },
  /** cyan's Tower block x -53..-51, z ±1, 4 m (orange's hangs at x 51..53) */
  tower: { x: -52, h: 4 },
  /** the Spindle: core half-size, corner posts out to `post`, fillets `fillet` m */
  spindle: { core: 4, post: 6.2, fillet: 2 },
  /** launch gantries: x ±(x0..x1), z z0..z1, deck at `top` (the ceiling's hang at H - top) */
  gantry: { x0: 11, x1: 17, z0: 9, z1: 15, top: 6.5, rampX: 29.2 },
  /** hull stairwells: corridor z 25..31 (north; south turned round), x ±36; doors x 28..33 */
  stair: { x: 36, z0: 25, z1: 31, doorX0: 28, doorX1: 33, doorH: 4 },
  siteA: { min: v3(46, 0, -7), max: v3(56, 3, 7) },
  siteB: { min: v3(-56, 25, -7), max: v3(-46, 28, 7) },
  powerups: [v3(0, 14, 5), v3(0, 14, -5)],
};

const H = ANTIPODE.H;
const MID = H / 2;
/** a ceiling spawn / area: the feet of an upright body whose head touches the ceiling */
export const ANTIPODE_HANG = MOVEMENT_DEFAULTS.standHeight + 0.02;
const HANG = ANTIPODE_HANG;
/** the floor deck's lamp masts (x, z) and the height of their lamps */
const LAMPS: [number, number][] = [
  [-35.5, 17],
  [-34, -11],
  [-21, 16],
  [-21, -15],
  [-8, 15.5],
  [-8, -15.5],
  [8, 15.5],
  [8, -15.5],
  [21, 15],
  [21, -15],
  [34, 15],
  [34, -15],
];
const LAMP_Y = 6.8;

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

type Opts = Omit<BoxDef, 'c' | 'h'>;
type Hole = { u0: number; u1: number; v0: number; v1: number };

export const buildAntipode = (): LevelDef => {
  const A = ANTIPODE;
  const lo = new LevelBuilder(); // the lower half: everything with y ≤ 14
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
  const panel: Opts = { mat: 'panel', color: PANEL_LO };
  const plate = { mat: 'floor' as Material, color: PLATE_LO };

  // ============================ the shell ============================
  const L = A.halfX;
  const W = A.halfZ;
  // the floor deck, with glass panels onto the stars below (the sky deck has them overhead)
  const floorWindows: Hole[] = [
    { u0: -27, u1: -21, v0: 16, v1: 20 },
    { u0: 37, u1: 43, v0: -19, v1: -15 },
    { u0: -3, u1: 3, v0: -20, v1: -16 },
  ];
  lo.wall('y', -0.5, 1, -L - 1, L + 1, -W - 1, W + 1, floorWindows, {
    mat: 'plate',
    color: PLATE_LO,
  });
  for (const h of floorWindows) box(h.u0, -1, h.v0, h.u1, 0, h.v1, { mat: 'skyglass' });
  // end walls: a big window to space over each end (above the bastion / the Hold)
  const endWindow: Hole = { u0: -9, u1: 9, v0: 8.5, v1: 12.5 };
  for (const sx of [-1, 1]) {
    lo.wall('x', sx * (L + 0.5), 1, -W - 1, W + 1, 0, MID, [endWindow], hull);
    box(sx * (L + 0.4), endWindow.v0, endWindow.u0, sx * (L + 0.6), endWindow.v1, endWindow.u1, {
      mat: 'skyglass',
    });
  }
  // long walls: a stairwell door at deck level, a window from the stairwell into the Seam, and
  // windows to space beyond the stairwells (north; the south wall is turned round)
  const S = A.stair;
  for (const sz of [-1, 1]) {
    const sx = -sz; // north: floor door at -x; south: at +x
    const lx = (a: number, b: number) => ({
      u0: Math.min(sx * a, sx * b),
      u1: Math.max(sx * a, sx * b),
    });
    const space: Hole[] = [
      { u0: -58, u1: -41, v0: 9, v1: 12.5 },
      { u0: 41, u1: 58, v0: 9, v1: 12.5 },
    ];
    const holes: Hole[] = [
      { ...lx(S.doorX0, S.doorX1), v0: 0, v1: S.doorH },
      { ...lx(5, 11), v0: 9, v1: 12.5 },
      ...space,
    ];
    lo.wall('z', sz * (W + 0.5), 1, -L, L, 0, MID, holes, hull);
    for (const h of space)
      box(h.u0, h.v0, sz * (W + 0.4), h.u1, h.v1, sz * (W + 0.6), { mat: 'skyglass' });
    // the stairwell door's frame light
    const d = lx(S.doorX0, S.doorX1);
    deco(d.u0 - 0.2, S.doorH, sz * W, d.u1 + 0.2, S.doorH + 0.2, sz * (W - 0.08), 'trim', {
      color: VIOLET,
    });
  }

  // ============================ hull stairwells ============================
  // north (s = 1): floor door at x -33..-28; south (s = -1): the same turned round (x, z → -x, -z)
  const stairZones: GravityZoneDef[] = [];
  for (const s of [1, -1] as const) {
    const P = (x: number) => -s * x; // the floor-door end is at P(30.5) (= -30.5 north)
    const Z = (z: number) => s * z;
    const bx = (
      x0: number,
      y0: number,
      z0: number,
      x1: number,
      y1: number,
      z1: number,
      o: Opts = {},
    ) => box(P(x0), y0, Z(z0), P(x1), y1, Z(z1), o);
    // corridor shell: floor, outer wall, end walls (its ceiling is the floor's image)
    box(-S.x - 1, -1, Z(S.z0), S.x + 1, 0, Z(S.z1 + 1), plate);
    box(-S.x - 1, 0, Z(S.z1), S.x + 1, MID, Z(S.z1 + 1), panel);
    for (const ex of [-1, 1]) box(ex * S.x, 0, Z(S.z0), ex * (S.x + 1), MID, Z(S.z1), panel);
    // the fillet at the foot of the outer wall by the floor door (45°: floor → wall)
    push(wedgeRamp('z', Z(S.z1 - 2), Z(S.z1), 0, 2, P(30.5), 11, plate));
    // on the outer wall (the floor while you walk it): structural ribs (low enough to step
    // over), a coolant tank (full cover) and a conduit (half cover) off the walking line
    for (const x of [-24, -12, 0, 12, 24])
      bx(x - 0.3, 0, S.z1 - 0.15, x + 0.3, MID, S.z1, { mat: 'pillar', color: HULL_LO });
    bx(-21, 1.5, S.z1 - 2.2, -17, 4.5, S.z1, { mat: 'engine', trim: VIOLET });
    bx(-15, 11, S.z1 - 1.2, -13, 13.5, S.z1, { mat: 'engine', color: SPINDLE_LO });
    bx(-6, 5, S.z1 - 2.2, -2, 8, S.z1, { mat: 'engine', trim: VIOLET });
    // gravity: the whole corridor pulls into the outer wall; a pocket by the floor door keeps
    // the floor a floor (its image by the ceiling door keeps the ceiling one)
    const z0 = Math.min(Z(W), Z(S.z1));
    const z1 = Math.max(Z(W), Z(S.z1));
    const side = s > 0 ? 'north' : 'south';
    stairZones.push(
      {
        name: `${side}-stair-wall`,
        min: v3(-S.x, -1, z0),
        max: v3(S.x, MID, z1),
        gravity: v3(0, 0, s),
        priority: 1,
      },
      // (door height by the door, so a jump there keeps you on the floor; over the fillet only
      // up to its middle, where the wall takes over)
      {
        name: `${side}-stair-door`,
        min: v3(Math.min(P(S.x), P(25)), -1, Math.min(Z(W), Z(S.z1 - 2.7))),
        max: v3(Math.max(P(S.x), P(25)), S.doorH, Math.max(Z(W), Z(S.z1 - 2.7))),
        gravity: v3(0, -1, 0),
        priority: 2,
      },
      {
        name: `${side}-stair-floor`,
        min: v3(Math.min(P(S.x), P(25)), -1, z0),
        max: v3(Math.max(P(S.x), P(25)), 1.6, z1),
        gravity: v3(0, -1, 0),
        priority: 2,
      },
    );
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
  const bw: Opts = { mat: 'hull', color: HULL_LO, trim: CYAN };
  box(B.x0, B.h, -B.z - 1, B.x1 + 1, B.h + 1, B.z + 1, bw); // roof
  for (const sz of [-1, 1]) box(B.x0, 0, sz * B.z, B.x1 + 1, B.h, sz * (B.z + 1), bw);
  const doors: Hole[] = [
    { u0: 6, u1: 10, v0: 0, v1: 3.5 },
    { u0: -10, u1: -6, v0: 0, v1: 3.5 },
  ];
  lo.wall('x', B.x1 + 0.5, 1, -B.z, B.z, 0, B.h, doors, bw);
  // the blast wall: the front doors open into a vestibule; round its ends into the bastion
  box(B.blastX, 0, -10, B.blastX + 1, B.h, 10, { mat: 'panel', color: PANEL_LO, trim: CYAN });
  // the Tower
  box(A.tower.x - 1, 0, -1, A.tower.x + 1, A.tower.h, 1, { mat: 'teamA', trim: CYAN });
  const spawns: SpawnDef[] = [];
  for (const [x, z] of [
    [-57.5, -3],
    [-57.5, 3],
    [-55, -3],
    [-55, 3],
    [-57.5, -9],
    [-57.5, 9],
    [-55, -9],
    [-55, 9],
  ])
    spawns.push({ pos: v3(x, 0, z), yawDeg: -90, team: 0 });
  // inside: light strips under the roof, the Tower's ring, spawn pads, a banner
  for (const z of [-8, 0, 8])
    deco(-59, B.h - 0.1, z - 0.2, -49, B.h - 0.02, z + 0.2, 'trim', { color: COLD });
  deco(A.tower.x - 2.4, 0.004, -2.4, A.tower.x + 2.4, 0.02, 2.4, 'trim', { color: CYAN });
  deco(A.tower.x - 2.25, 0.006, -2.25, A.tower.x + 2.25, 0.025, 2.25, 'plate', {
    color: PLATE_LO,
  });
  deco(B.blastX - 0.06, 1.2, -4, B.blastX, 4, 4, 'teamA', { trim: CYAN });
  for (const sp of spawns)
    deco(sp.pos.x - 0.6, 0.004, sp.pos.z - 0.6, sp.pos.x + 0.6, 0.016, sp.pos.z + 0.6, 'trim', {
      color: 0x0f5c6b,
    });
  // outside: the team's banner between the doors, a light over each door, hazard stripes
  // across the thresholds
  deco(B.x1 + 1, 1, -3, B.x1 + 1.06, 4.4, 3, 'teamA', { trim: CYAN });
  for (const sz of [-1, 1]) {
    deco(B.x1 + 1, 3.6, sz * 10.2, B.x1 + 1.08, 3.8, sz * 5.8, 'trim', { color: CYAN });
    for (let z = 6.25; z < 10; z += 1.5)
      deco(B.x1 + 1.1, 0.004, sz * z, B.x1 + 1.8, 0.02, sz * (z + 0.75), 'trim', {
        color: HAZARD,
      });
  }

  // ============================ the floor deck ============================
  // cyan's yard: a container across the middle, crates, a container by the gantry ramp
  box(-37, 0, -3, -33, 2.6, 3, { trim: COLD_DIM });
  box(-40, 0, 14, -38.8, 1.2, 17);
  box(-30, 0, -16, -27, 2.4, -13, { trim: COLD_DIM });
  box(-27, 0, 3, -24, 2.6, 7);
  box(-22, 0, -6, -21.2, 1.2, -1, panel);
  box(-17, 0, -14, -14, 2.4, -11, { trim: COLD_DIM });
  // catwalks (y 3.5) along the long walls, a ramp at the outer end
  const catwalk = (x0: number, x1: number, sz: number, rampFrom: number) => {
    box(x0, 3.2, sz * W, x1, 3.5, sz * (W - 5), { mat: 'grate', color: PANEL_LO });
    for (const x of [x0 + 0.5, (x0 + x1) / 2, x1 - 0.5])
      box(x - 0.25, 0, sz * (W - 5.5), x + 0.25, 3.2, sz * (W - 5), {
        mat: 'pillar',
        color: HULL_LO,
      });
    const rampTo = rampFrom < x0 ? x0 : x1;
    push(wedgeRamp('x', rampFrom, rampTo, 0, 3.5, sz * (W - 1.5), 3, plate));
    deco(x0, 3.5, sz * (W - 5.08), x1, 3.52, sz * (W - 4.92), 'trim', { color: HAZARD });
  };
  catwalk(-40, -22, -1, -46.5);
  // the launch gantries (one each side of the Spindle; the ceiling's hang right above them)
  const G = A.gantry;
  for (const sx of [-1, 1]) {
    const gx0 = sx < 0 ? -G.x1 : G.x0;
    const gx1 = sx < 0 ? -G.x0 : G.x1;
    box(gx0, G.top - 0.3, G.z0, gx1, G.top, G.z1, {
      mat: 'grate',
      color: PANEL_LO,
      trim: COLD_DIM,
    });
    for (const x of [gx0, gx1 - 0.5])
      for (const z of [G.z0, G.z1 - 0.5])
        box(x, 0, z, x + 0.5, G.top - 0.3, z + 0.5, { mat: 'pillar', color: HULL_LO });
    const edge = sx < 0 ? gx0 : gx1;
    push(wedgeRamp('x', sx * G.rampX, edge, 0, G.top, (G.z0 + G.z1) / 2, 3, plate));
    // the launch mark on its deck: jump here
    deco(gx0 + 1.5, G.top + 0.004, G.z0 + 1.5, gx1 - 1.5, G.top + 0.02, G.z1 - 1.5, 'trim', {
      color: VIOLET,
    });
  }
  // orange's half of the floor: barricades, the north catwalk, the approach to A
  box(21.2, 0, 1.5, 22, 1.2, 7, panel);
  box(24, 0, -8, 27, 2.6, -4);
  box(14, 0, -15, 17, 2.4, -12, { trim: COLD_DIM });
  box(34, 0, 2, 37, 2.4, 6, { trim: COLD_DIM });
  box(29, 0, -13, 30.2, 1.2, -10);
  catwalk(22, 40, 1, 46.5);
  // SITE A (the Hold): containers round it, crates on it, a generator against the end wall
  box(48, 0, 9, 51, 2.6, 13, { trim: COLD_DIM });
  box(53, 0, -13, 57, 2.6, -9.5, { trim: COLD_DIM });
  box(47, 0, -3, 48.2, 1.2, 0);
  box(54, 0, 2, 55.2, 1.2, 5);
  box(43.5, 0, -6, 44.3, 1.2, -1, panel);
  box(58, 0, -4, L, 2.4, 4, { mat: 'engine', trim: COLD });
  const SA = A.siteA;
  for (const [x0, z0, x1, z1] of [
    [SA.min.x, SA.min.z, SA.max.x, SA.min.z + 0.12],
    [SA.min.x, SA.max.z - 0.12, SA.max.x, SA.max.z],
    [SA.min.x, SA.min.z, SA.min.x + 0.12, SA.max.z],
    [SA.max.x - 0.12, SA.min.z, SA.max.x, SA.max.z],
  ])
    deco(x0, 0.004, z0, x1, 0.02, z1, 'trim', { color: SITE });
  // a guide line toward home, light strips high on the long walls at each end
  deco(-42, 0.004, -0.15, -38, 0.02, 0.15, 'trim', { color: CYAN });
  for (const sz of [-1, 1])
    for (const [x0, x1] of [
      [-58, -41],
      [41, 58],
    ])
      deco(x0, 7.2, sz * (W - 0.1), x1, 7.45, sz * W, 'trim', { color: COLD });

  // ============================ the Seam ============================
  // tumbling cargo (well inside the band: nobody stands on it)
  const drift = (c: Vec3, size: Vec3, axis: Vec3, deg: number, o: Opts = {}) =>
    push({
      c,
      h: v3(size.x / 2, size.y / 2, size.z / 2),
      q: qFromAxisAngle(normalize(axis), (deg * Math.PI) / 180),
      mat: 'crate',
      color: CRATE_LO,
      ...o,
    });
  drift(v3(-24, 11, -6), v3(3, 2, 2), v3(1, 1, 0.2), 25, { trim: VIOLET });
  drift(v3(-36, 11.2, 13), v3(2.5, 2.5, 2.5), v3(0.3, 1, 0.5), 40);
  drift(v3(-7, 11.2, 19), v3(4, 1.4, 2), v3(0, 0.2, 1), 15, { mat: 'pillar', color: HULL_LO });
  drift(v3(21, 11.2, -11), v3(3, 3, 2), v3(1, 0, 1), 30);
  drift(v3(33, 10.5, 6), v3(2, 2, 2), v3(1, 1, 1), 35, { trim: VIOLET });
  drift(v3(-16, 11.5, -17), v3(2, 3, 1.5), v3(1, -0.4, 0.2), 50);
  drift(v3(44, 11, -15), v3(2, 2, 3), v3(0.2, 1, -0.6), 20);
  drift(v3(-47, 11, -4), v3(2, 2, 2), v3(1, 0.5, 0), 30);
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
  bit(v3(-30, 12.5, -14), v3(0.8, 0.4, 1.6), v3(1, 0.3, 0.2), 35, 'crate', CRATE_LO);
  bit(v3(-2, 12, 13), v3(1.8, 0.25, 0.25), v3(0.2, 1, 0.4), 60, 'pillar', HULL_LO);
  bit(v3(10, 9.6, -18), v3(0.7, 0.7, 0.7), v3(1, 1, 0), 20, 'crate', CRATE_LO);
  bit(v3(28, 12.4, 16), v3(1.2, 0.1, 0.8), v3(0.4, 0.2, 1), 50, 'panel', PANEL_LO);
  bit(v3(-44, 12, 18), v3(0.6, 0.6, 1.2), v3(0, 1, 1), 25, 'crate', CRATE_LO);
  bit(v3(40, 10, -2), v3(2, 0.2, 0.2), v3(0, 0.3, 1), 70, 'pillar', HULL_LO);
  bit(v3(-18, 9.6, 3), v3(0.9, 0.5, 0.5), v3(1, 0, 0.6), 40, 'crate', CRATE_LO);
  bit(v3(52, 12.6, 18), v3(1, 0.1, 1.4), v3(1, 0.5, 0.2), 30, 'panel', PANEL_LO);
  // the Seam's line round the hull (where the halves meet) and round the Spindle's posts
  deco(-L, MID - 0.1, -W, L, MID, -W + 0.08, 'trim', { color: VIOLET });
  deco(-L, MID - 0.1, W - 0.08, L, MID, W, 'trim', { color: VIOLET });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      deco(sx * PO, MID - 0.1, sz * C, sx * (PO + 0.06), MID, sz * PO, 'trim', { color: VIOLET });
      deco(sx * C, MID - 0.1, sz * PO, sx * PO, MID, sz * (PO + 0.06), 'trim', { color: VIOLET });
    }

  // the floor deck's lamp masts (their lamps light the lanes; the ceiling's hang down)
  for (const [x, z] of LAMPS) {
    box(x - 0.2, 0, z - 0.2, x + 0.2, LAMP_Y - 0.4, z + 0.2, { mat: 'pillar', color: HULL_LO });
    deco(x - 0.45, LAMP_Y - 0.4, z - 0.45, x + 0.45, LAMP_Y - 0.1, z + 0.45, 'trim', {
      color: COLD,
    });
  }

  // ============================ zones ============================
  const lowerZones: GravityZoneDef[] = [
    {
      name: 'floor-deck',
      min: v3(-L - 2, -2, -S.z1 - 2),
      max: v3(L + 2, A.seam.y0, S.z1 + 2),
      gravity: v3(0, -1, 0),
    },
    {
      name: 'seam-low',
      min: v3(-L - 2, A.seam.y0, -S.z1 - 2),
      max: v3(L + 2, MID, S.z1 + 2),
      gravity: v3(0, 0, 0),
    },
    ...stairZones,
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
    })),
  ];
  const lowerAreas: [string, string, Vec3, number][] = [
    ['Cyan bastion', 'Orange bastion', v3(-50, 0, 6), -90],
    ['Cyan yard', 'Orange yard', v3(-38, 0, -9), -90],
    ['Launch gantry (floor, west)', 'Launch gantry (ceiling, east)', v3(-14, G.top, 12), -90],
    ['Spindle foot (floor, west)', 'Spindle foot (ceiling, east)', v3(-10, 0, 0), -90],
    ['North stairwell (floor door)', 'North stairwell (ceiling door)', v3(-30.5, 0, 21), 180],
    ['Site A', 'Site B', v3(51, 0, 0), 90],
    ['Floor deck, east', 'Ceiling deck, west', v3(30, 0, 0), 90],
  ];

  const out = new LevelBuilder();
  out.boxes = [...lo.boxes, ...lo.boxes.map(imageBox)];
  return out.build({
    name: 'Antipode',
    boundsMin: v3(-L - 2, -2, -S.z1 - 2),
    boundsMax: v3(L + 2, H + 2, S.z1 + 2),
    defaultGravity: v3(0, -1, 0),
    zones,
    rails: [],
    pads: [],
    spawns: allSpawns,
    towers,
    controllerHomes: [v3(-49.5, 0.9, 0), v3(49.5, H - 0.9, 0)],
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
    ambient: 0.78,
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
 * the halves (up the Spindle's grooves, across the stairwells' walls); every link's image is
 * added too.
 */
const antipodeWaypoints = (): WaypointDef[] => {
  const G = ANTIPODE.gantry;
  const lower: { name: string; pos: Vec3 }[] = [];
  const add = (name: string, x: number, y: number, z: number) =>
    lower.push({ name, pos: v3(x, y, z) });
  // bastion
  add('home.spN', -56.25, 1, 6.5);
  add('home.spS', -56.25, 1, -6.5);
  add('home.tower', -49.5, 1, 0);
  // round the blast wall's ends (it hides the spawns from the doors), then along the vestibule
  add('home.inN', -51, 1, 11.8);
  add('home.inS', -51, 1, -11.8);
  add('home.gapN', -47.5, 1, 11.8);
  add('home.gapS', -47.5, 1, -11.8);
  add('home.vestN', -45.4, 1, 11.4);
  add('home.vestS', -45.4, 1, -11.4);
  add('home.frontN', -45.4, 1, 8);
  add('home.frontS', -45.4, 1, -8);
  add('home.doorN', -41, 1, 8);
  add('home.doorS', -41, 1, -8);
  // yard, south catwalk
  add('yard.n', -38, 1, 9);
  add('yard.s', -38, 1, -9);
  add('yard.c', -29, 1, 0);
  add('yard.sw', -34, 1, -18);
  add('yard.se', -24, 1, -16);
  add('cat.foot', -48.5, 1, -22.5);
  add('cat.w', -38.5, 4.5, -21.5);
  add('cat.e', -22.3, 4.5, -21.5);
  add('cat.drop', -19, 1, -21.5);
  // west gantry, the forward area
  add('g1.foot', -31, 1, 12);
  add('g1.mid', -21, 5.4, 12);
  add('g1.top', -14.5, G.top + 1, 12);
  add('g1.under', -14, 1, 12);
  add('fwd.n', -22, 1, 17.5);
  add('fwd.c', -18, 1, 1);
  add('fwd.s', -19, 1, -10);
  // the Spindle's floor ring and its four grooves (1 m off each face)
  add('ring.nw', -9.5, 1, 9.5);
  add('ring.sw', -9.5, 1, -9.5);
  add('ring.ne', 9.5, 1, 9.5);
  add('ring.se', 9.5, 1, -9.5);
  for (const [k, dx, dz] of [
    ['w', -1, 0],
    ['e', 1, 0],
    ['n', 0, 1],
    ['s', 0, -1],
  ] as const) {
    add(`sp.${k}0`, dx * 10, 1, dz * 10);
    add(`sp.${k}1`, dx * 5, 4, dz * 5);
    add(`sp.${k}2`, dx * 5, 8.5, dz * 5);
    add(`sp.${k}3`, dx * 5, 13, dz * 5);
  }
  // east gantry, orange's half of the floor
  add('g2.foot', 31, 1, 12);
  add('g2.mid', 21, 5.4, 12);
  add('g2.top', 14.5, G.top + 1, 12);
  add('g2.under', 14, 1, 12);
  add('east.c', 19, 1, 0);
  add('east.s', 19, 1, -9);
  add('east.n', 21, 1, 17.5);
  add('ncat.drop', 19, 1, 21.5);
  add('app.c', 30, 1, 0);
  add('app.n', 36, 1, 10);
  add('app.s', 36, 1, -8);
  add('ncat.foot', 48.5, 1, 22.5);
  add('ncat.e', 38.5, 4.5, 21.5);
  add('ncat.w', 22.3, 4.5, 21.5);
  // site A
  add('site.c', 51, 1, 0);
  add('site.nw', 45, 1, 7.5);
  add('site.sw', 45.5, 1, -9);
  add('site.ne', 55, 1, 8.5);
  add('site.se', 51, 1, -11);
  add('site.n', 46, 1, 17);
  // stairwells: the hall side of the door, the doorway, the corridor, then the outer wall
  for (const [k, s] of [
    ['n', 1],
    ['s', -1],
  ] as const) {
    const P = (x: number) => -s * x;
    add(`${k}.out`, P(30.5), 1, s * 20.5);
    add(`${k}.door`, P(30.5), 1, s * 24.5);
    add(`${k}.in`, P(30.5), 1, s * 27);
    add(`${k}.w1`, P(30.5), 4, s * 30);
    add(`${k}.w2`, P(22), 7, s * 30);
    add(`${k}.w3`, P(12), 9.5, s * 30);
    add(`${k}.w4`, P(3), 12.5, s * 30);
  }
  /** [a, b, one-way?] */
  const links: [string, string, boolean?][] = [
    // bastion
    ['home.spN', 'home.spS'],
    ['home.spN', 'home.tower'],
    ['home.spS', 'home.tower'],
    ['home.spN', 'home.inN'],
    ['home.spS', 'home.inS'],
    ['home.tower', 'home.inN'],
    ['home.tower', 'home.inS'],
    ['home.inN', 'home.gapN'],
    ['home.inS', 'home.gapS'],
    ['home.gapN', 'home.vestN'],
    ['home.gapS', 'home.vestS'],
    ['home.vestN', 'home.frontN'],
    ['home.vestS', 'home.frontS'],
    ['home.frontN', 'home.doorN'],
    ['home.frontS', 'home.doorS'],
    // yard and the south catwalk
    ['home.doorN', 'yard.n'],
    ['home.doorS', 'yard.s'],
    ['yard.n', 'yard.c'],
    ['yard.s', 'yard.c'],
    ['yard.s', 'yard.sw'],
    ['yard.s', 'cat.foot'],
    ['yard.sw', 'yard.se'],
    ['yard.se', 'yard.c'],
    ['cat.foot', 'cat.w'],
    ['cat.w', 'cat.e'],
    ['cat.e', 'cat.drop', true],
    ['cat.drop', 'yard.se'],
    ['cat.drop', 'fwd.s'],
    ['yard.n', 'n.out'],
    ['yard.n', 'g1.foot'],
    ['g1.foot', 'n.out'],
    // west gantry, forward
    ['g1.foot', 'g1.mid'],
    ['g1.mid', 'g1.top'],
    ['yard.c', 'fwd.c'],
    ['fwd.c', 'g1.under'],
    ['fwd.c', 'fwd.s'],
    ['fwd.c', 'sp.w0'],
    ['g1.under', 'fwd.n'],
    ['fwd.n', 'n.out'],
    ['yard.se', 'fwd.s'],
    ['g1.under', 'ring.nw'],
    ['g1.under', 'sp.w0'],
    ['fwd.s', 'ring.sw'],
    ['fwd.s', 'sp.w0'],
    // the Spindle's floor ring
    ['ring.nw', 'sp.w0'],
    ['ring.nw', 'sp.n0'],
    ['ring.sw', 'sp.w0'],
    ['ring.sw', 'sp.s0'],
    ['ring.ne', 'sp.n0'],
    ['ring.ne', 'sp.e0'],
    ['ring.se', 'sp.s0'],
    ['ring.se', 'sp.e0'],
    // east of the Spindle
    ['sp.e0', 'east.c'],
    ['ring.ne', 'g2.under'],
    ['ring.se', 'east.s'],
    ['east.c', 'east.s'],
    ['east.c', 'g2.under'],
    ['g2.under', 'east.n'],
    ['east.n', 'g2.foot'],
    ['g2.foot', 'g2.mid'],
    ['g2.mid', 'g2.top'],
    ['east.c', 'app.c'],
    ['east.s', 'app.s'],
    ['east.s', 's.out'],
    ['g2.foot', 'app.n'],
    ['app.c', 'app.n'],
    ['app.c', 'app.s'],
    ['app.s', 's.out'],
    // the north catwalk
    ['app.n', 'site.n'],
    ['site.n', 'ncat.foot'],
    ['ncat.foot', 'ncat.e'],
    ['ncat.e', 'ncat.w'],
    ['ncat.w', 'ncat.drop', true],
    ['ncat.drop', 'east.n'],
    // site A
    ['app.n', 'site.nw'],
    ['app.s', 'site.sw'],
    ['site.nw', 'site.c'],
    ['site.sw', 'site.c'],
    ['site.nw', 'site.ne'],
    ['site.sw', 'site.se'],
    ['site.c', 'site.ne'],
    ['site.c', 'site.se'],
  ];
  for (const k of ['w', 'e', 'n', 's'])
    links.push([`sp.${k}0`, `sp.${k}1`], [`sp.${k}1`, `sp.${k}2`], [`sp.${k}2`, `sp.${k}3`]);
  for (const k of ['n', 's'])
    links.push(
      [`${k}.out`, `${k}.door`],
      [`${k}.door`, `${k}.in`],
      [`${k}.in`, `${k}.w1`],
      [`${k}.w1`, `${k}.w2`],
      [`${k}.w2`, `${k}.w3`],
      [`${k}.w3`, `${k}.w4`],
      // across the middle of the wall into the other half
      [`${k}.w4`, `~${k}.w4`],
    );
  // up the grooves: the -x face's top half is the +x face's bottom half turned over
  links.push(['sp.w3', '~sp.e3'], ['sp.e3', '~sp.w3'], ['sp.n3', '~sp.n3'], ['sp.s3', '~sp.s3']);

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
 * Lights: the lower half's (cold white service light on the floor deck, cyan in cyan's bastion,
 * violet in the Seam) and their images (amber emergency light on the ceiling deck, orange in
 * orange's bastion). Strip lights made of 'trim' boxes add their own.
 */
const antipodeLights = (): LightDef[] => {
  const lower: LightDef[] = [
    // cyan's bastion: the Tower, cool fills, the vestibule
    { pos: v3(-52, 4.4, 0), color: CYAN, radius: 10, intensity: 1.5 },
    { pos: v3(-57, 4.3, 8), color: COLD, radius: 9, intensity: 0.9 },
    { pos: v3(-57, 4.3, -8), color: COLD, radius: 9, intensity: 0.9 },
    { pos: v3(-45.5, 4, 0), color: CYAN, radius: 8, intensity: 0.8 },
    // site A
    { pos: v3(51, 6.5, 0), color: COLD, radius: 14, intensity: 1.3, shaft: true },
    { pos: v3(46, 4, 16), color: SITE, radius: 7, intensity: 0.6 },
    // the Spindle's foot
    { pos: v3(-8, 3, 0), color: VIOLET, radius: 8, intensity: 0.8 },
    { pos: v3(8, 3, 0), color: VIOLET, radius: 8, intensity: 0.8 },
    { pos: v3(0, 3, 8), color: VIOLET, radius: 8, intensity: 0.8 },
    { pos: v3(0, 3, -8), color: VIOLET, radius: 8, intensity: 0.8 },
    // the Seam
    { pos: v3(-26, 12, 0), color: VIOLET, radius: 20, intensity: 0.7 },
    { pos: v3(26, 12, 4), color: VIOLET, radius: 20, intensity: 0.7 },
    { pos: v3(0, 12, 14), color: VIOLET, radius: 12, intensity: 0.8 },
    { pos: v3(0, 12, -14), color: VIOLET, radius: 12, intensity: 0.8 },
    // the stairwells
    { pos: v3(-24, 6, 28), color: COLD_DIM, radius: 14, intensity: 0.9 },
    { pos: v3(-8, 11, 28), color: VIOLET, radius: 10, intensity: 0.8 },
    { pos: v3(24, 6, -28), color: COLD_DIM, radius: 14, intensity: 0.9 },
    { pos: v3(8, 11, -28), color: VIOLET, radius: 10, intensity: 0.8 },
  ];
  // the floor deck's service lamps (on their masts) over the lanes
  for (const [x, z] of LAMPS)
    lower.push({ pos: v3(x, LAMP_Y, z), color: COLD, radius: 18, intensity: 1.1, shaft: true });
  // (the images carry no light shafts: a shaft is drawn down to the floor)
  const image = (l: LightDef): LightDef => ({
    pos: antipodeImage(l.pos),
    color: RECOLOR[l.color] ?? l.color,
    radius: l.radius,
    intensity: l.intensity,
  });
  return [...lower, ...lower.map(image)];
};
