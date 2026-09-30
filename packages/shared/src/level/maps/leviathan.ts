// "Leviathan" — the fight inside a dead god: the fossilised skeleton of a colossal space creature
// drifting through a teal nebula (world x = east, world z = south, ground y 0). The creature lies
// head north (−z) to tail south (+z); its backbone runs along z through x = 0 and the map is a
// mirror image across x = 0 (registry flag `symmetric`): Cyan (team 0) camps on the west flank,
// Orange (team 1) on the east flank. Both bomb sites sit on the mirror line, so both teams have
// the same ways to each. The head half and the tail half are built on the same plan (mirrored
// north ↔ south, dressed differently), so A and B are the same distance from every camp.
//
// You fight *inside* the body, on three floors — rooms and corridors, not an open hall:
//
//   MARROW (y −4.5)  canals under the ribcage: from each flank a stair pit drops into an elbow and
//        a canal that runs to the marrow chamber under the throat (the loop between the halves),
//        and on through the foramen tunnel that climbs into the skull (or the tail) from below
//   GROUND (y 0)
//     THE HEART (|x| ≤ 10, |z| ≤ 8)  the crystal heart's chamber, 10 m tall, with four doors
//          (the rib halls east / west, the throat north, the gullet south) and a balcony ring
//     RIB HALLS (|x| 11..21, |z| ≤ 8)  between the heart and the flanks, a bone rib across the door
//     RIB GALLERIES (|x| 4..21)  rooms between the ribs, two per quarter (|z| 9..26 and 27..44),
//          fallen ribs and salvage inside, doors into the throat, the flanks and the jaw grounds
//     THE THROAT / THE GULLET (|x| ≤ 3, |z| 9..45)  the mid corridors from the heart to the sites,
//          a vertebra standing in the middle of each
//     SALVAGE FLANKS (|x| 22..32)  three roofed salvage rooms per side joined by offset doors; the
//          middle one holds the team's Tower, the ones either side a stair pit into the marrow
//     JAW GROUNDS / HIP YARDS (|x| 15..32, |z| 45..60)  open to the nebula, walled in by bone
//     THE SKULL (site A, north) / THE TAIL (site B, south) (|x| ≤ 14, |z| 46..66)  bone
//          cathedrals 11 m tall: the throat door, a jaw door on each side, the foramen pit behind
//          the site (the marrow tunnel comes up it) and the brow ledge over the throat door
//     SALVAGE CAMPS (|x| 33..45)  each team's spawns in three roofed huts — the skull camp (north,
//          3 spawns), the heart camp (middle, 2), the tail camp (south, 3) — a vestibule with two
//          doors, the spawn room behind a partition
//   UPPER (y 5.5)
//     THE SPINE  the enclosed walkway on top of the backbone over the throat and the gullet,
//          broken into four segments by vertebra housings; stairs up from the second rib gallery,
//          its ends open onto the heart's balcony ring and the sites' ledges
import type { Quat } from '../../math/quat';
import { qFromAxisAngle, qMul, quat } from '../../math/quat';
import type { Vec3 } from '../../math/vec3';
import { v3 } from '../../math/vec3';
import {
  LevelBuilder,
  shellAround,
  wedgeRamp,
  type OpenVolume,
  type SurfaceStyle,
} from '../builder';
import type {
  BoxDef,
  KillVolumeDef,
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

// the dead god
const BONE = 0xe8dcc4;
const BONE_DARK = 0xb8a88c;
const STERNUM = 0x9c8f78; // the fused belly plates the body's rooms stand on
const MATRIX = 0x26343d; // the fossil rock the skeleton is set in
const MATRIX_RIM = 0x34454f;
const MARROW = 0x5b3a48; // the canals under the ribcage
const MARROW_FLOOR = 0x3e2a33;
// bioluminescence
const TEAL = 0x2ef2d0;
const VIOLET = 0xa46bff;
const HEART = 0xd13a7a;
const HEART_VIOLET = 0x8a3cff;
const CRYSTAL = 0x6b3fa0;
// salvage
const STEEL = 0x56616b;
const STEEL_DARK = 0x353d45;
const HUT = 0x5f6a72;
const RUST = 0x7a5536;
const DRAB = 0x4f5c52;
const TARP = 0x6f5a3c;
const LAMP = 0xffb46a;

/** Floor heights: the marrow canals, the ground, the spine and the balconies / ledges. */
const LOW = -5;
const UP = 5.5;
/** Clear height of a ground-floor room (its roof slab is 1 m over it: the upper floor). */
const ROOM = 4.5;

/**
 * The plan. East (+x) is authored and mirrored to the west; north (−z) is authored in `d` = |z|
 * and mirrored to the south. Every range is [from, to] in metres.
 */
export const LEVIATHAN = {
  floors: { marrow: LOW, ground: 0, upper: UP },
  heart: { x: 10, z: 8, height: 10, balconyY: UP, pos: v3(0, 7.2, 0) },
  ribHall: { x: [11, 21], z: 8 },
  /** the rib galleries, two per quarter */
  galleries: { x: [4, 21], d1: [9, 26], d2: [27, 44] },
  /** the throat (north) and the gullet (south), the spine over them */
  throat: { x: 3, d: [9, 45] },
  spine: { x: 3, y: UP, d: [9, 45], housings: [17, 26, 35] },
  /** the stairs up to the spine, in the second rib gallery */
  stairs: { x: [4, 8], d: [30, 40] },
  flank: { x: [22, 32], m: 8, d1: [9, 26], d2: [27, 44] },
  /** the stair pits from the flanks down into the marrow */
  flankPit: { x: [25, 29], d: [15, 24] },
  jaw: { x: [15, 32], d: [45, 60] },
  /** the skull (north) and the tail (south): bone halls, the site in front of the foramen pit */
  skull: { x: 14, d: [46, 66], height: 11, ledge: { x: 8, d: [46, 49] } },
  foramen: { x: 2.5, d: [55, 64] },
  marrow: {
    chamber: { x: 6, d: [32, 42] },
    tunnel: { x: 2, d: [42, 55] },
    canal: { x: [6, 25], d: [36, 40] },
    elbow: { x: [25, 29], d: [24, 40] },
  },
  /** Orange's camps (Cyan's mirror them): vestibule x 33..36, spawn room x 37..45 */
  camp: {
    x: [33, 45],
    partition: 36,
    side: { d: [17, 31] },
    mid: { z: 6 },
  },
  /** Towers: Cyan's (west) first, in the middle salvage room */
  towers: [v3(-27, 0, 0), v3(27, 0, 0)] as [Vec3, Vec3],
  bombSites: {
    A: { min: v3(-11, 0, -55), max: v3(11, 3, -49.2) },
    B: { min: v3(-11, 0, 49.2), max: v3(11, 3, 55) },
  },
  powerups: [v3(0, 1, 0)],
};

type Extra = Omit<BoxDef, 'c' | 'h' | 'mat'>;
type Box6 = [number, number, number, number, number, number];

const rotX = (a: number) => qFromAxisAngle(v3(1, 0, 0), a);
const rotY = (a: number) => qFromAxisAngle(v3(0, 1, 0), a);
const rotZ = (a: number) => qFromAxisAngle(v3(0, 0, 1), a);

// room looks
const BODY: Omit<OpenVolume, 'min' | 'max'> = {
  floor: { mat: 'rock', color: STERNUM },
  wall: { mat: 'rock', color: BONE },
  ceiling: { mat: 'rock', color: BONE_DARK },
};
const SALVAGE: Omit<OpenVolume, 'min' | 'max'> = {
  floor: { mat: 'plate', color: STEEL_DARK },
  wall: { mat: 'panel', color: HUT },
  ceiling: { mat: 'hull', color: STEEL_DARK },
};
const YARD: Omit<OpenVolume, 'min' | 'max'> = {
  floor: { mat: 'rock', color: MATRIX },
  wall: { mat: 'rock', color: MATRIX_RIM },
  lid: false,
};
const MARROW_ROOM: Omit<OpenVolume, 'min' | 'max'> = {
  floor: { mat: 'rock', color: MARROW_FLOOR },
  wall: { mat: 'rock', color: MARROW },
  ceiling: { mat: 'rock', color: MARROW },
};
const SPINE_ROOM: Omit<OpenVolume, 'min' | 'max'> = {
  floor: { mat: 'rock', color: BONE_DARK } as SurfaceStyle,
  wall: { mat: 'rock', color: BONE },
  ceiling: { mat: 'rock', color: BONE_DARK },
};

/** Authoring helpers. `x` ranges are east (mirrored west), `d` ranges north (mirrored south). */
interface Kit {
  b: LevelBuilder;
  lights: LightDef[];
  /** one box as given */
  box: (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material,
    extra?: Extra,
  ) => void;
  /** a box and its mirror across x = 0 (one box if it straddles x = 0 evenly) */
  sym: Kit['box'];
  /** a box at north distance d0..d1 and its twin south (z = −d and z = +d), each mirrored in x */
  quad: (
    x0: number,
    y0: number,
    d0: number,
    x1: number,
    y1: number,
    d1: number,
    mat: Material,
    extra?: Extra,
  ) => void;
  /** an open volume, mirrored in x and (unless it straddles z = 0) north ↔ south */
  vol: (
    x0: number,
    y0: number,
    d0: number,
    x1: number,
    y1: number,
    d1: number,
    o?: Omit<OpenVolume, 'min' | 'max'>,
  ) => void;
  /** a doorway / window: carves, adds no walls */
  door: (x0: number, y0: number, d0: number, x1: number, y1: number, d1: number) => void;
  obb: (c: Vec3, h: Vec3, q: Quat, mat: Material, extra?: Extra) => void;
  /** a rotated box and its mirror across x = 0 */
  symObb: Kit['obb'];
  /** a light and its mirror in x (and north ↔ south when `both`) */
  light: (x: number, y: number, z: number, color: number, radius: number, k: number) => void;
  lightQ: (x: number, y: number, d: number, color: number, radius: number, k: number) => void;
}

export const buildLeviathan = (): LevelDef => {
  const L = LEVIATHAN;
  const b = new LevelBuilder();
  const lights: LightDef[] = [];
  const vols: OpenVolume[] = [];
  const box: Kit['box'] = (x0, y0, z0, x1, y1, z1, mat, extra = {}) => {
    b.box(
      v3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      v3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
      { mat, ...extra },
    );
  };
  const straddles = (a: number, c: number) => Math.min(a, c) === -Math.max(a, c);
  const sym: Kit['sym'] = (x0, y0, z0, x1, y1, z1, mat, extra = {}) => {
    box(x0, y0, z0, x1, y1, z1, mat, extra);
    if (!straddles(x0, x1)) box(-x0, y0, z0, -x1, y1, z1, mat, extra);
  };
  const quad: Kit['quad'] = (x0, y0, d0, x1, y1, d1, mat, extra = {}) => {
    sym(x0, y0, -d0, x1, y1, -d1, mat, extra);
    if (!straddles(d0, d1)) sym(x0, y0, d0, x1, y1, d1, mat, extra);
  };
  const addVol = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    o: Omit<OpenVolume, 'min' | 'max'>,
  ) =>
    vols.push({
      min: v3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      max: v3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
      ...o,
    });
  const vol: Kit['vol'] = (x0, y0, d0, x1, y1, d1, o = BODY) => {
    for (const sz of straddles(d0, d1) ? [1] : [-1, 1]) {
      addVol(x0, y0, sz * d0, x1, y1, sz * d1, o);
      if (!straddles(x0, x1)) addVol(-x0, y0, sz * d0, -x1, y1, sz * d1, o);
    }
  };
  const obb: Kit['obb'] = (c, h, q, mat, extra = {}) => {
    b.boxes.push({ c, h, q, mat, ...extra });
  };
  const k: Kit = {
    b,
    lights,
    box,
    sym,
    quad,
    vol,
    door: (x0, y0, d0, x1, y1, d1) => vol(x0, y0, d0, x1, y1, d1, { walls: false }),
    obb,
    symObb: (c, h, q, mat, extra = {}) => {
      obb(c, h, q, mat, extra);
      if (c.x !== 0) obb(v3(-c.x, c.y, c.z), h, quat(q.x, -q.y, -q.z, q.w), mat, extra);
    },
    light: (x, y, z, color, radius, intensity) => {
      lights.push({ pos: v3(x, y, z), color, radius, intensity });
      if (x !== 0) lights.push({ pos: v3(-x, y, z), color, radius, intensity });
    },
    lightQ: (x, y, d, color, radius, intensity) => {
      k.light(x, y, -d, color, radius, intensity);
      if (d !== 0) k.light(x, y, d, color, radius, intensity);
    },
  };

  buildRooms(k);
  shellAround(b, vols);
  buildRamps(k);
  buildHeart(k);
  buildSites(k);
  buildCover(k);

  // Towers, spawns, Controller homes, team colour
  const towers: TowerDef[] = [];
  const spawns: SpawnDef[] = [];
  const homes: Vec3[] = [];
  for (const team of [0, 1] as const) {
    const s = team === 0 ? -1 : 1;
    const tp = L.towers[team];
    const tc = team === 0 ? CYAN : ORANGE;
    b.block(v3(tp.x, 2, tp.z), v3(2, 4, 2), { mat: team === 0 ? 'teamA' : 'teamB', trim: tc });
    towers.push({ team, pos: tp, radius: 1.5, height: 4 });
    homes.push(v3(s * 30.5, 0.9, 0));
    const yawDeg = team === 0 ? 90 : -90;
    // the skull camp (north), the heart camp (middle), the tail camp (south): out of view of
    // both vestibule doors
    for (const [group, sz] of [
      ['skull', -1],
      ['tail', 1],
    ] as const)
      for (const [x, d] of [
        [38.5, 29.4],
        [38.5, 18.6],
        [44, 22.2],
      ])
        spawns.push({ pos: v3(s * x, 0, sz * d), yawDeg, team, group });
    for (const z of [-1.2, 1.2])
      spawns.push({ pos: v3(s * 43.5, 0, z), yawDeg, team, group: 'heart' });
    // team colour: strips over the vestibule doors and along the spawn rooms' back walls
    const strip = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
      box(s * x0, y0, z0, s * x1, y1, z1, 'trim', { color: tc, noCollide: true });
    for (const sz of [-1, 1]) {
      strip(44.9, 3.2, sz * 19, 45, 3.4, sz * 29);
      strip(33.9, 3.2, sz * 23, 34, 3.4, sz * 25);
    }
    strip(44.9, 3.2, -4, 45, 3.4, 4);
    const tl = (x: number, y: number, z: number, r: number, i: number) =>
      lights.push({ pos: v3(s * x, y, z), color: tc, radius: r, intensity: i });
    for (const sz of [-1, 1]) {
      tl(41, 3.6, sz * 24, 9, 0.9);
      tl(34.5, 3.6, sz * 24, 7, 0.6);
    }
    tl(41, 3.6, 0, 8, 0.9);
    tl(34.5, 3.6, 0, 7, 0.6);
    tl(29, 3.8, 0, 8, 0.7);
  }

  decorate(k);

  // nothing leads off the fossil, but a fall anywhere below the marrow ends in the nebula
  const killVolumes: KillVolumeDef[] = [{ min: v3(-300, -80, -300), max: v3(300, -12, 300) }];

  return b.build({
    name: 'Leviathan',
    boundsMin: v3(-47, -7, -68),
    boundsMax: v3(47, 13, 68),
    defaultGravity: v3(0, -1, 0),
    zones: [],
    rails: [],
    pads: [],
    spawns,
    towers,
    controllerHomes: homes,
    waypoints: waypoints(),
    areas: [
      { name: 'Cyan heart camp', pos: v3(-41, 0, 0), yawDeg: 90 },
      { name: 'Orange skull camp', pos: v3(41, 0, -24), yawDeg: -90 },
      { name: 'Orange Tower room', pos: v3(29, 0, 4), yawDeg: -90 },
      { name: 'The Heart', pos: v3(0, 0, 5), yawDeg: 180 },
      { name: 'Heart balcony', pos: v3(0, UP, -6.75), yawDeg: 0 },
      { name: 'Rib hall, east', pos: v3(18, 0, 0), yawDeg: -90 },
      { name: 'Rib gallery, north-east', pos: v3(16, 0, -13), yawDeg: 180 },
      { name: 'The throat', pos: v3(0, 0, -20), yawDeg: 180 },
      { name: 'The spine, north', pos: v3(0, UP, -22), yawDeg: 180 },
      { name: 'Marrow chamber, north', pos: v3(0, LOW, -37), yawDeg: 180 },
      { name: 'Jaw grounds, east', pos: v3(24, 0, -52), yawDeg: -90 },
      { name: 'A site (skull)', pos: v3(0, 0, -50), yawDeg: 180 },
      { name: 'B site (tail)', pos: v3(0, 0, 50), yawDeg: 0 },
    ],
    fog: { color: 0x14595e, near: 45, far: 190 },
    ambient: 0.72,
    sideTint: { neg: CYAN, pos: ORANGE, amount: 0.05 },
    lights,
    bombSites: [
      { name: 'A', ...L.bombSites.A },
      { name: 'B', ...L.bombSites.B },
    ],
    powerups: L.powerups,
    killVolumes,
    outdoor: {
      top: 0x040f18,
      horizon: 0x14595e,
      ground: 0x1d1036,
      sun: { dir: v3(-0.42, 0.34, -0.84), color: 0xc9f7ff, sizeDeg: 2.2 },
      sunLight: 0xefe4d0,
      stars: true,
    },
  });
};

/** Every room, corridor, doorway and window as open volumes (walls come from shellAround). */
const buildRooms = (k: Kit): void => {
  const { vol, door } = k;
  const L = LEVIATHAN;
  const G = L.galleries;
  const F = L.flank;
  const K = L.skull;
  const M = L.marrow;
  const C = L.camp;
  const DOOR = 3.5;

  // ---- the heart and the rib halls (straddle z = 0) ----
  vol(-L.heart.x, 0, -L.heart.z, L.heart.x, L.heart.height, L.heart.z);
  vol(L.ribHall.x[0], 0, -8, L.ribHall.x[1], ROOM, 8);
  door(L.heart.x, 0, -2, L.ribHall.x[0], DOOR, 2); // heart ↔ rib hall
  // ---- the salvage flank's middle room (the Tower) and the heart camp ----
  vol(F.x[0], 0, -F.m, F.x[1], ROOM, F.m, SALVAGE);
  vol(C.x[0], 0, -C.mid.z, C.partition, ROOM, C.mid.z, SALVAGE);
  vol(C.partition + 1, 0, -C.mid.z, C.x[1], ROOM, C.mid.z, SALVAGE);
  door(C.partition, 0, -1, C.partition + 1, DOOR, 1);

  // ---- one quarter (north-east), mirrored to the other three ----
  // rib hall doors: into the flank and into the first gallery
  door(L.ribHall.x[1], 0, 3, F.x[0], DOOR, 6);
  door(15, 0, 8, 18, DOOR, 9);
  // the throat, the spine over it (four segments between vertebra housings)
  vol(-L.throat.x, 0, L.throat.d[0], L.throat.x, ROOM, L.throat.d[1]);
  door(-1.5, 0, 8, 1.5, DOOR, 9); // throat ↔ heart
  const S = L.spine;
  const seg = [S.d[0], ...S.housings.flatMap((h) => [h, h + 1]), S.d[1]];
  for (let i = 0; i < seg.length; i += 2)
    vol(-S.x, UP, seg[i], S.x, UP + 3.5, seg[i + 1], SPINE_ROOM);
  door(-2, UP, 8, 2, UP + 3, 9); // spine ↔ heart balcony
  // housings: doors at the sides, then in the middle, then at the sides again
  door(0.6, UP, 17, 3, UP + 3, 18);
  door(-1.2, UP, 26, 1.2, UP + 3, 27);
  door(0.6, UP, 35, 3, UP + 3, 36);
  // the rib galleries
  vol(G.x[0], 0, G.d1[0], G.x[1], ROOM, G.d1[1]);
  vol(G.x[0], 0, G.d2[0], G.x[1], ROOM, G.d2[1]);
  door(3, 0, 12, 4, DOOR, 16.5); // gallery 1 ↔ throat
  door(15, 0, 26, 20, DOOR, 27); // gallery 1 ↔ gallery 2
  door(21, 0, 18, 22, DOOR, 23); // gallery 1 ↔ flank
  door(17, 0, 44, 20, DOOR, 45); // gallery 2 ↔ jaw grounds
  // the stairwell up to the spine (in gallery 2) and its door onto the spine
  vol(L.stairs.x[0], 0, L.stairs.d[0], L.stairs.x[1], 9, 44);
  door(3, UP, 40.5, 4, UP + 3, 44);
  // the salvage flank
  vol(F.x[0], 0, F.d1[0], F.x[1], ROOM, F.d1[1], SALVAGE);
  vol(F.x[0], 0, F.d2[0], F.x[1], ROOM, F.d2[1], SALVAGE);
  door(22, 0, 8, 25, DOOR, 9); // middle ↔ first
  door(29, 0, 26, 32, DOOR, 27); // first ↔ second
  door(25, 0, 44, 29, DOOR, 45); // second ↔ jaw grounds
  // the flank's stair pit down to the marrow
  const P = L.flankPit;
  vol(P.x[0], LOW, P.d[0], P.x[1], 0, P.d[1], MARROW_ROOM);
  // the side camp: vestibule, spawn room; doors into both flank rooms
  const CS = C.side.d;
  vol(C.x[0], 0, CS[0], C.partition, ROOM, CS[1], SALVAGE);
  vol(C.partition + 1, 0, CS[0], C.x[1], ROOM, CS[1], SALVAGE);
  door(C.partition, 0, 23, C.partition + 1, DOOR, 25);
  door(F.x[1], 0, 19, C.x[0], DOOR, 22);
  door(F.x[1], 0, 28, C.x[0], DOOR, 31);
  // heart camp doors (both halves of the mirror in z come from this quarter)
  door(F.x[1], 0, 3, C.x[0], DOOR, 6);
  // the jaw grounds, open to the nebula
  vol(L.jaw.x[0], 0, L.jaw.d[0], L.jaw.x[1], 10, L.jaw.d[1], YARD);
  // the skull: a bone cathedral; the throat door, the spine door over it, a jaw door each side
  vol(-K.x, 0, K.d[0], K.x, K.height, K.d[1]);
  door(-1.5, 0, 45, 1.5, DOOR, 46);
  door(-2, UP, 45, 2, UP + 3, 46);
  door(K.x, 0, 50, L.jaw.x[0], DOOR, 54);
  // the foramen pit behind the site, the tunnel under it, the marrow chamber and canal
  const FO = L.foramen;
  vol(-FO.x, LOW, FO.d[0], FO.x, 0, FO.d[1], MARROW_ROOM);
  vol(-M.tunnel.x, LOW, M.tunnel.d[0], M.tunnel.x, -1, M.tunnel.d[1], MARROW_ROOM);
  vol(-M.chamber.x, LOW, M.chamber.d[0], M.chamber.x, -1, M.chamber.d[1], MARROW_ROOM);
  vol(M.canal.x[0], LOW, M.canal.d[0], M.canal.x[1], -1, M.canal.d[1], MARROW_ROOM);
  vol(M.elbow.x[0], LOW, M.elbow.d[0], M.elbow.x[1], -1, M.elbow.d[1], MARROW_ROOM);
  // windows onto the nebula: the skull's eye sockets, the camps' back walls
  for (const w of WINDOWS) door(...w);
  door(...MID_WINDOW);
};

/** Window openings (east / north quarter; glass goes in them). */
const WINDOWS: Box6[] = [
  [4, 4, 66, 10, 8, 67], // eye sockets (the tail: the vents in its tip)
  [45, 1.4, 21, 46, 3.2, 27], // side camp, back wall
];
const MID_WINDOW: Box6 = [45, 1.4, -2.5, 46, 3.2, 2.5];

/** Ramps: the stairs to the spine, the flank pits and the foramen pits. */
const buildRamps = (k: Kit): void => {
  const { b, quad } = k;
  const L = LEVIATHAN;
  const bone = { mat: 'rock' as Material, color: BONE_DARK };
  const marrow = { mat: 'rock' as Material, color: MARROW_FLOOR };
  for (const sz of [-1, 1]) {
    // the stairs: from the gallery floor up to the landing (10 m run, 28.8°)
    const [x0, x1] = L.stairs.x;
    for (const s of [1, -1]) {
      const cx = (s * (x0 + x1)) / 2;
      b.boxes.push(
        wedgeRamp('z', sz * L.stairs.d[0], sz * L.stairs.d[1], 0, UP, cx, x1 - x0, bone),
      );
      // the flank pit: down to the elbow (9 m, 26.6°)
      const P = L.flankPit;
      b.boxes.push(
        wedgeRamp(
          'z',
          sz * P.d[0],
          sz * P.d[1],
          0,
          LOW,
          (s * (P.x[0] + P.x[1])) / 2,
          P.x[1] - P.x[0],
          marrow,
        ),
      );
    }
    // the foramen: from the tunnel up to the back of the site (9 m, 26.6°)
    const FO = L.foramen;
    b.boxes.push(wedgeRamp('z', sz * FO.d[0], sz * FO.d[1], LOW, 0, 0, 2 * FO.x, marrow));
  }
  // the landing at the top of the stairs (solid bone under it)
  quad(L.stairs.x[0], 0, L.stairs.d[1], L.stairs.x[1], UP, 44, 'rock', { color: BONE_DARK });
  // kick-rails along the flank pits' long sides (half cover; step over them to drop in)
  const P = L.flankPit;
  quad(P.x[0] - 0.5, 0, P.d[0], P.x[0], 1.1, P.d[1], 'hull', { color: STEEL });
  quad(P.x[1], 0, P.d[0], P.x[1] + 0.5, 1.1, P.d[1], 'hull', { color: STEEL });
};

/**
 * The heart: a cluster of red-violet crystal hanging in its chamber over the power-up (it glows,
 * it doesn't collide), crystal columns growing from the floor, and the balcony ring at y 5.5 that
 * the spine opens onto.
 */
const buildHeart = (k: Kit): void => {
  const { sym, quad, obb, light } = k;
  const H = LEVIATHAN.heart;
  const glow = (color: number): Extra => ({ color, noCollide: true });
  const c = H.pos;
  obb(c, v3(1.25, 1.6, 1.25), qMul(rotX(0.32), rotY(Math.PI / 4)), 'glow', glow(HEART));
  obb(
    v3(0, c.y + 0.6, 0.5),
    v3(0.9, 1.1, 0.9),
    qMul(rotX(-0.55), rotY(Math.PI / 4)),
    'glow',
    glow(HEART),
  );
  obb(v3(0, c.y - 1.3, -0.35), v3(0.7, 1.0, 0.7), rotX(0.9), 'glow', glow(HEART));
  for (const s of [1, -1])
    obb(v3(0, c.y - 0.2, s * 1.6), v3(0.25, 1.4, 0.25), rotX(s * 0.7), 'glow', glow(HEART));
  sym(-0.35, 8.9, -0.35, 0.35, H.height, 0.35, 'glow', glow(HEART)); // the aorta
  // violet crystals round the power-up and the stain under the heart
  for (const [x, z, h] of [
    [2.6, 0.6, 0.9],
    [2.2, -1.8, 0.6],
    [0.9, 2.7, 0.7],
  ] as const)
    sym(x - 0.25, 0, z - 0.25, x + 0.25, h, z + 0.25, 'glow', glow(HEART_VIOLET));
  sym(-1.6, 0, -1.6, 1.6, 0.02, 1.6, 'glow', glow(0x5a2150));
  // crystal columns (full cover) in the four quarters
  quad(4.4, 0, 3.4, 5.6, 2.4, 4.6, 'rock', { color: CRYSTAL });
  // the balcony ring: north and south strips, east and west strips, posts in the corners
  const Y = H.balconyY;
  quad(-H.x, Y - 0.5, 5.5, H.x, Y, H.z, 'plate', { color: STEEL });
  sym(7.5, Y - 0.5, -5.5, H.x, Y, 5.5, 'plate', { color: STEEL });
  quad(9.2, 0, 7.2, H.x, Y - 0.5, H.z, 'hull', { color: STEEL_DARK });
  // waist-high salvage on the ring's corners
  quad(9.2, Y, 2, H.x, Y + 1.1, 3.6, 'crate', { color: RUST });
  quad(3, Y, 7.2, 4.6, Y + 1.1, H.z, 'crate', { color: RUST });
  light(0, c.y, 0, HEART, 16, 2.1);
  light(0, 1.2, 0, HEART_VIOLET, 9, 1.3);
  light(0, 9.2, 0, HEART, 9, 1.0);
  light(6, 3, 0, HEART_VIOLET, 10, 0.9);
  k.lightQ(0, 3, 5, HEART, 10, 0.9);
  k.lightQ(8.5, Y + 2, 6.5, HEART_VIOLET, 9, 0.8);
};

/**
 * The skull (site A, north) and the tail (site B, south): the brow ledge over the throat door on
 * two bone pillars, site cover, the eye sockets (glass to the nebula); the tail's coil of
 * vertebrae hanging over its site.
 */
const buildSites = (k: Kit): void => {
  const { sym, quad, box, obb, symObb, light } = k;
  const K = LEVIATHAN.skull;
  const LE = K.ledge;
  const boneX = { color: BONE };
  // the brow ledge (y 5.5) and its pillars
  quad(-LE.x, UP - 0.5, LE.d[0], LE.x, UP, LE.d[1], 'plate', { color: STEEL });
  quad(7, 0, 48, 8, UP - 0.5, 49, 'rock', boneX);
  // a low bone lip along the ledge's edge (half cover), open over the site's middle
  quad(5, UP, 48.6, LE.x, UP + 1.1, 49, 'rock', { color: BONE_DARK });
  // glass in the windows
  for (const sz of [-1, 1]) {
    sym(4, 4, sz * 66.4, 10, 8, sz * 66.6, 'skyglass', { color: 0x3fd6c4 });
    sym(4, 3.8, sz * 65.9, 10, 4, sz * 66, 'glow', { color: TEAL, noCollide: true });
    sym(45.4, 1.4, sz * 21, 45.6, 3.2, sz * 27, 'skyglass', { color: 0x3fd6c4 });
  }
  sym(45.4, 1.4, -2.5, 45.6, 3.2, 2.5, 'skyglass', { color: 0x3fd6c4 });

  // ---- A (skull): salvage stacks and fallen teeth ----
  const skull = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material,
    extra: Extra,
  ) => sym(x0, y0, -z0, x1, y1, -z1, mat, extra);
  skull(4, 0, 52.5, 6.5, 2.4, 54.5, 'crate', { color: DRAB });
  skull(11.5, 0, 49.5, 13.5, 1.1, 51, 'crate', { color: RUST });
  skull(10.5, 0, 58, 12.5, 2.4, 60, 'rock', boneX); // a broken fang
  skull(9, 0, 62.5, 11, 1.1, 64.5, 'rock', boneX);
  // the cathedral's vault: bone arches springing from the side walls
  for (const d of [52, 58, 64]) {
    const A = K.x - 1;
    const B = K.height - 6.5;
    const N = 4;
    const pts: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const t = (Math.PI / 2) * (i / N);
      pts.push([A * Math.cos(t), 6.3 + B * Math.sin(t)]);
    }
    for (let i = 0; i < N; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      symObb(
        v3((x0 + x1) / 2, (y0 + y1) / 2 - 0.35, -d),
        v3(len / 2 + 0.3, 0.3, 0.45),
        rotZ(Math.atan2(y1 - y0, x1 - x0)),
        'rock',
        { color: BONE, noCollide: true },
      );
    }
  }
  light(0, 9, -58, VIOLET, 16, 1.0);
  light(7, 4, -64, TEAL, 12, 1.1);
  light(6, 3, -51, LAMP, 10, 0.8);
  light(0, 3, -47.5, LAMP, 7, 0.7);
  light(0, UP + 2.5, -47.5, TEAL, 9, 0.8);

  // ---- B (tail): a tail fin, crates, the coil overhead ----
  const tail = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: Material,
    extra: Extra,
  ) => sym(x0, y0, z0, x1, y1, z1, mat, extra);
  tail(3.5, 0, 52.5, 6, 2.4, 54.5, 'rock', boneX); // a tail fin
  tail(11.5, 0, 48, 13.5, 1.1, 50, 'crate', { color: RUST });
  tail(9.5, 0, 57, 12, 2.4, 59.5, 'crate', { color: DRAB });
  tail(3.5, 0, 60.5, 5.5, 1.1, 62.5, 'rock', boneX);
  // the coil: vertebrae on a spiral in the y-z plane (their own mirror images), high over the
  // pit, never low enough to stand on
  const steps = 11;
  for (let i = 0; i <= steps; i++) {
    const phi = ((-20 + (i * 320) / steps) * Math.PI) / 180;
    const r = 2.2 - (i / steps) * 1.0;
    const s = 0.75 - (i / steps) * 0.3;
    obb(
      v3(0, 7.8 + r * Math.sin(phi), 59.5 + r * Math.cos(phi)),
      v3(s, s * 0.9, s * 0.8),
      rotX(-phi),
      'rock',
      {
        color: BONE,
        noCollide: true,
      },
    );
  }
  light(0, 9, 58, TEAL, 16, 1.1);
  light(7, 4, 64, VIOLET, 12, 1.0);
  light(6, 3, 51, LAMP, 10, 0.8);
  light(0, 3, 47.5, LAMP, 7, 0.7);
  light(0, UP + 2.5, 47.5, VIOLET, 9, 0.8);
};

/** Cover in the rib halls, galleries, flanks and jaw grounds; lamps and growths. */
const buildCover = (k: Kit): void => {
  const { sym, quad, lightQ } = k;
  const bone = { color: BONE };
  // rib halls: a rib across the heart door (full cover), a crate by each flank door
  sym(13, 0, -2.5, 14, 2.4, 2.5, 'rock', bone);
  quad(18.5, 0, 5.5, 20.5, 1.1, 7.5, 'crate', { color: RUST });
  lightQ(17, 3.8, 0, TEAL, 11, 0.9);
  // the throat / gullet: a vertebra in the middle
  quad(-1.6, 0, 26, 1.6, ROOM, 28, 'rock', { color: BONE_DARK });
  lightQ(0, 3.8, 18, TEAL, 11, 0.8);
  lightQ(0, 3.8, 38, VIOLET, 11, 0.8);
  // the spine: dim teal between the housings
  for (const d of [13, 22, 31, 40]) lightQ(0, UP + 3, d, TEAL, 8, 0.7);
  // gallery 1: a fallen rib across the room, a generator, crates
  quad(4, 0, 17, 12, 2.4, 18, 'rock', bone);
  quad(10, 0, 10, 12, 2.4, 12, 'hull', { color: STEEL });
  quad(18.5, 0, 11, 20.5, 1.1, 13, 'crate', { color: DRAB });
  quad(6, 0, 23, 8, 1.1, 25, 'crate', { color: RUST });
  lightQ(14, 3.8, 14, TEAL, 11, 0.9);
  lightQ(12, 3.8, 22, VIOLET, 10, 0.8);
  // gallery 2: salvage stacks
  quad(11, 0, 34, 13, 2.4, 36, 'crate', { color: DRAB });
  quad(17, 0, 38, 19, 1.1, 40, 'crate', { color: RUST });
  quad(18, 0, 29, 20.5, 2.4, 31, 'rock', bone);
  lightQ(14, 3.8, 35, TEAL, 12, 0.9);
  lightQ(6, 8, 38, LAMP, 9, 0.8);
  // the flank: a salvage container in the second room, a crate in the first
  quad(25, 0, 33, 28, 2.6, 38, 'hull', { color: STEEL_DARK });
  quad(30, 0, 10, 31.5, 1.1, 12, 'crate', { color: RUST });
  lightQ(27, 3.8, 12, LAMP, 11, 0.9);
  lightQ(30, 3.8, 22, LAMP, 10, 0.8);
  lightQ(27, 3.8, 30, LAMP, 10, 0.8);
  lightQ(27, 3.8, 41, LAMP, 10, 0.8);
  lightQ(25, 3.8, 4, LAMP, 10, 0.8);
  // the jaw grounds: the lower jaw with its fangs (full cover), salvage
  quad(19, 0, 55, 20.5, 2.4, 59, 'rock', bone);
  for (const d of [55.8, 58.2]) quad(19.3, 2.4, d - 0.4, 20.2, 3.4, d + 0.4, 'rock', bone);
  quad(27, 0, 49, 29.5, 2.4, 51, 'crate', { color: DRAB });
  quad(22, 0, 56, 24, 1.1, 58, 'crate', { color: RUST });
  quad(25, 2.8, 47.5, 27.4, 2.95, 50.5, 'panel', { color: TARP, noCollide: true });
  lightQ(24, 4, 52, TEAL, 14, 0.9);
  lightQ(29, 3, 57, LAMP, 9, 0.8);
  // the marrow: violet and teal glow
  lightQ(0, -2, 37, VIOLET, 10, 1.0);
  lightQ(0, -2, 49, TEAL, 9, 0.9);
  lightQ(15, -2, 38, VIOLET, 10, 0.9);
  lightQ(27, -2, 34, TEAL, 9, 0.9);
  lightQ(27, -2, 26, VIOLET, 9, 0.9);
  lightQ(27, 1.5, 19.5, TEAL, 9, 0.8);
  lightQ(0, -1.5, 58, TEAL, 9, 0.9);
};

/** Glow growths along the body's walls, the heart camp's awnings, site outlines, far rocks. */
const decorate = (k: Kit): void => {
  const { sym, quad } = k;
  const L = LEVIATHAN;
  const teal = { color: TEAL, noCollide: true };
  const violet = { color: VIOLET, noCollide: true };
  // growths at the foot of the walls (flush against them)
  quad(4, 0, 9.5, 4.6, 0.4, 11, 'glow', teal);
  quad(20.4, 0, 32, 21, 0.5, 34, 'glow', violet);
  quad(2.4, 0, 30, 3, 0.3, 32, 'glow', teal);
  quad(-0.8, LOW, 41.4, 0.8, LOW + 0.3, 42, 'glow', violet);
  quad(6.5, LOW, 39.5, 9, LOW + 0.3, 40, 'glow', teal);
  quad(13.2, 0, 60, 14, 0.5, 62, 'glow', violet);
  quad(15, 0, 45.4, 17, 0.4, 46, 'glow', teal);
  sym(10.4, 0, -1.5, 10.9, 0.01, 1.5, 'glow', { color: HEART_VIOLET, noCollide: true });
  // salvage lamps over the flank doors
  quad(22, 3.6, 3.8, 22.3, 3.8, 5.2, 'trim', { color: LAMP, noCollide: true });
  // site outlines (the west edge is the mirror of the east one)
  for (const st of [L.bombSites.A, L.bombSites.B]) {
    const w = 0.12;
    const o = { color: SITE, noCollide: true };
    sym(st.min.x, 0.01, st.min.z, st.max.x, 0.05, st.min.z + w, 'trim', o);
    sym(st.min.x, 0.01, st.max.z - w, st.max.x, 0.05, st.max.z, 'trim', o);
    sym(st.max.x - w, 0.01, st.min.z + w, st.max.x, 0.05, st.max.z - w, 'trim', o);
  }
  // far scenery: rocks drifting in the nebula
  const far = { color: 0x1f2a33, noCollide: true, lowDetail: true };
  sym(90, -30, -80, 120, -5, -50, 'rock', far);
  sym(70, 10, 110, 95, 32, 135, 'rock', far);
  sym(140, -10, 10, 160, 20, 40, 'rock', far);
};

/**
 * Bot waypoints, named. East (+x) nodes are authored and mirrored: `name` + 'E' / 'W'; nodes on
 * x = 0 have no suffix. North / south twins end in 'N' / 'S' before that suffix. Orange (team 1)
 * camps east: 'towerE' is Orange's Tower, 'campME' its heart camp.
 */
const waypoints = (): WaypointDef[] => {
  const wps: WaypointDef[] = [];
  const central = new Set<string>();
  const add = (name: string, x: number, feet: number, z: number) => {
    if (x === 0) {
      central.add(name);
      wps.push({ pos: v3(0, feet + 1, z), links: [], name });
      return;
    }
    wps.push({ pos: v3(x, feet + 1, z), links: [], name: `${name}E` });
    wps.push({ pos: v3(-x, feet + 1, z), links: [], name: `${name}W` });
  };
  const idx = (name: string) => {
    const i = wps.findIndex((w) => w.name === name);
    if (i < 0) throw new Error(`waypoint ${name} missing`);
    return i;
  };
  const join = (i: number, j: number, oneWay: boolean) => {
    if (!wps[i].links.includes(j)) wps[i].links.push(j);
    if (!oneWay && !wps[j].links.includes(i)) wps[j].links.push(i);
  };
  const sides = (name: string) => (central.has(name) ? [name] : [`${name}E`, `${name}W`]);
  /** link two nodes: east with east, west with west, a central node with both */
  const link = (a: string, c: string, oneWay = false) => {
    const A = sides(a);
    const C = sides(c);
    if (A.length === 2 && C.length === 2) {
      join(idx(A[0]), idx(C[0]), oneWay);
      join(idx(A[1]), idx(C[1]), oneWay);
    } else for (const p of A) for (const q of C) join(idx(p), idx(q), oneWay);
  };
  const chain = (...names: string[]) => {
    for (let i = 1; i < names.length; i++) link(names[i - 1], names[i]);
  };

  // the middle (z = 0)
  add('heart', 0, 0, 0);
  add('heartMid', 6.5, 0, 0);
  add('dHeart', 10.5, 0, 0);
  add('ribC', 18, 0, 0);
  add('tower', 30, 0, 0);
  add('vestM', 34.5, 0, 0);
  add('dInnerM', 36.5, 0, 0);
  add('campM', 41, 0, 0);
  add('balE', 8.75, UP, 0);
  chain('heart', 'heartMid', 'dHeart');
  chain('vestM', 'dInnerM', 'campM');

  for (const [T, sz] of [
    ['N', -1],
    ['S', 1],
  ] as const) {
    const n = (s: string) => `${s}${T}`;
    const at = (name: string, x: number, feet: number, d: number) => add(n(name), x, feet, sz * d);
    // heart and its balcony
    at('heart', 0, 0, 5);
    at('dThrH', 0, 0, 8.5);
    at('bal', 0, UP, 6.75);
    at('balC', 8.75, UP, 6.75);
    at('dSpH', 0, UP, 8.5);
    // rib hall, the Tower room, the heart camp's doors
    at('ribGap', 13.5, 0, 5);
    at('dRibG', 16.5, 0, 8.5);
    at('dRibF', 21.5, 0, 4.5);
    at('fm', 25, 0, 5);
    at('dCampM', 32.5, 0, 4.5);
    at('vestM', 34.5, 0, 4.5);
    at('dFM1', 23.5, 0, 8.5);
    // the flank's first room and its pit
    at('f1w', 23.5, 0, 12);
    at('f1wn', 23.5, 0, 20.5);
    at('f1nw', 23.5, 0, 25);
    at('f1ne', 30.5, 0, 25);
    at('f1e', 30.5, 0, 20.5);
    at('f1se', 30.5, 0, 14);
    at('f1top', 27, 0, 13.5);
    at('dF12', 30.5, 0, 26.5);
    at('dG1F', 21.5, 0, 20.5);
    // side camp
    at('dCampS1', 32.5, 0, 20.5);
    at('dCampS2', 32.5, 0, 29.5);
    at('vestA', 34.5, 0, 29.5);
    at('vestB', 34.5, 0, 20.5);
    at('vest', 34.5, 0, 24);
    at('dInner', 36.5, 0, 24);
    at('camp', 41, 0, 24);
    // the flank's second room
    at('f2s', 30.5, 0, 29.5);
    at('f2e', 30.5, 0, 40);
    at('f2w', 23.5, 0, 31);
    at('f2nw', 23.5, 0, 41);
    at('dF2J', 27, 0, 44.5);
    // jaw grounds
    at('jaw', 24, 0, 52);
    at('dG2J', 18.5, 0, 44.5);
    at('dJaw', 14.5, 0, 52);
    // gallery 1
    at('g1a', 16, 0, 13);
    at('g1b', 16, 0, 22);
    at('g1c', 8, 0, 13.5);
    at('g1d', 9, 0, 21.5);
    at('dThrG1', 3.5, 0, 14.5);
    at('dG12', 17.5, 0, 26.5);
    // gallery 2 and the stairs
    at('g2a', 14, 0, 30);
    at('g2b', 14, 0, 40);
    at('stairBot', 6, 0, 28.5);
    at('stairTop', 6.5, UP, 42.2);
    at('dSpSt', 3.5, UP, 42.2);
    // the throat
    at('thr1', 0, 0, 14.5);
    at('thr2', 0, 0, 20);
    at('thrP', 2.3, 0, 27);
    at('thr3', 0, 0, 34);
    at('thr4', 0, 0, 42);
    at('dSkull', 0, 0, 45.5);
    // the spine
    at('sp1', 0, UP, 13);
    at('dsp1a', 1.8, UP, 15.8);
    at('dsp1b', 1.8, UP, 19.2);
    at('sp2', 0, UP, 22);
    at('dsp2', 0, UP, 26.5);
    at('sp3', 0, UP, 31);
    at('dsp3a', 1.8, UP, 33.8);
    at('dsp3b', 1.8, UP, 37.2);
    at('sp4', 0, UP, 41.5);
    at('dSpSk', 0, UP, 45.5);
    at('ledge', 0, UP, 47.5);
    at('ledgeC', 3, UP, 48.4);
    // the site
    at('skS', 0, 0, 48);
    at('site', 0, 0, 51.5);
    at('siteE', 7.5, 0, 52);
    at('skN', 8, 0, 61);
    at('skNN', 5, 0, 65);
    at('pitTop', 0, 0, 65);
    // the marrow
    at('pitBot', 0, LOW, 53.5);
    at('foramen', 0, LOW, 47);
    at('jun', 0, LOW, 37);
    at('junE', 4, LOW, 38);
    at('canal', 15, LOW, 38);
    at('elbow', 27, LOW, 38);
    at('elbowS', 27, LOW, 30);
    at('pitBotF', 27, LOW, 25.5);

    const c = (...names: string[]) => chain(...names.map(n));
    // heart
    link('heart', n('heart'));
    link('heartMid', n('heart'));
    c(
      'heart',
      'dThrH',
      'thr1',
      'thr2',
      'thrP',
      'thr3',
      'thr4',
      'dSkull',
      'skS',
      'site',
      'siteE',
      'dJaw',
      'jaw',
    );
    link('balE', n('balC'));
    c(
      'balC',
      'bal',
      'dSpH',
      'sp1',
      'dsp1a',
      'dsp1b',
      'sp2',
      'dsp2',
      'sp3',
      'dsp3a',
      'dsp3b',
      'sp4',
      'dSpSk',
      'ledge',
      'ledgeC',
    );
    c('sp4', 'dSpSt', 'stairTop', 'stairBot', 'g2a');
    link(n('ledgeC'), n('siteE'), true); // drop off the brow ledge onto the site
    // rib hall
    link('dHeart', n('ribGap'));
    link('ribC', n('ribGap'));
    link('ribC', n('dRibF'));
    link('ribC', n('dRibG'));
    c('ribGap', 'dRibG', 'g1a');
    c('dRibF', 'fm', 'dFM1', 'f1w', 'f1wn', 'dG1F', 'g1b');
    link('tower', n('fm'));
    link('tower', n('dCampM'));
    c('fm', 'dCampM', 'vestM');
    link('vestM', n('vestM'));
    // flank room 1, the pit, the side camp
    c(
      'f1wn',
      'f1nw',
      'f1ne',
      'dF12',
      'f2s',
      'dCampS2',
      'vestA',
      'vest',
      'vestB',
      'dCampS1',
      'f1e',
      'f1ne',
    );
    c('vest', 'dInner', 'camp');
    c('f1w', 'f1top', 'f1se', 'f1e');
    c(
      'f1top',
      'pitBotF',
      'elbowS',
      'elbow',
      'canal',
      'junE',
      'jun',
      'foramen',
      'pitBot',
      'pitTop',
      'skNN',
      'skN',
      'siteE',
    );
    // flank room 2 and the jaw grounds
    c('f2s', 'f2e', 'dF2J', 'jaw');
    c('f2s', 'f2w', 'f2nw', 'dF2J');
    c('jaw', 'dG2J', 'g2b', 'g2a', 'dG12', 'g1b');
    // gallery 1
    c('g1a', 'g1b', 'g1d', 'dG12');
    c('g1a', 'g1c', 'dThrG1', 'thr1');

  }
  return wps;
};
