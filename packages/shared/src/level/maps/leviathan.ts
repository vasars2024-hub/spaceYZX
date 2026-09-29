// "Leviathan" — the fight inside a dead god: the fossilised skeleton of a colossal space creature
// drifting through a teal nebula, about 120 × 134 m (world x = east, world z = south, ground
// y 0). The creature lies head north (−z) to tail south (+z); its backbone runs along z through
// x = 0 and the map is a mirror image across x = 0 (registry flag `symmetric`): Cyan (team 0)
// camps on the west flank, Orange (team 1) on the east flank. Both bomb sites sit on the mirror
// line, so both teams have the same ways to each.
//
//   SALVAGE CAMPS (|x| 47..58.5, |z| ≤ 11.5)  roofed spawn huts clamped to the flanks. The spawn
//        room (|x| 52..58, |z| ≤ 7) is closed toward the map and opens only at its back corners
//        into the side corridors; three exits: the front door (the Tower stands before it at
//        |x| 41) and a side door onto each porch
//   FLANK LANES (|x| 24..46)  outside the ribcage along the whole body: a blast shield before each
//        camp, scaffolds clamped to rib feet, crates, work lamps; north to the jaw grounds, south
//        to the tail grounds
//   THE RIBS (|z| 4, 12, 20, 28)  a colonnade of tall ivory arches down both sides, hanging from
//        the spine and standing on feet at |x| 23: full cover you can see between (6.6 m gaps)
//   THE NAVE (|x| < 22, |z| < 44)  under the ribs, floored with the fused belly plates; an aisle
//        either side of the backbone with fallen bone and salvage for cover
//   THE HEART (x 0, z 0)  a crystallised heart hanging under the spine, glowing red-violet over
//        the power-up, circled by a salvage ring balcony at y 4 (ramps from east, west, north,
//        south). You can walk under the ring to the power-up
//   THE SPINE (|z| ≤ 22, y 10)  a 6 m walkway along the top of the backbone — the high ground
//        over the whole map, cover only from the vertebra processes (full blades on the middle
//        line, waist-high knobs at the edges); drop off its edge onto the balcony. The neck
//        (z −22..−42) and the tail root (z 22..42) slope down to the ground at 26.6°: the only
//        ways up
//   THE SKULL (|x| ≤ 16, z −67..−45)  bomb site A: a bone cathedral 12 m to its vaulted roof,
//        crystal-filled eye sockets in the face, the foramen (7 m) south where the neck comes
//        down, jaw doors east / west and temporal windows over a waist-high sill (vault in); the
//        lower jaw lies outside on the jaw grounds
//   THE TAIL (z 44..67)  bomb site B: behind the hip bones the tail runs on along the ground as a
//        line of vertebrae, rises at the south edge and coils back north overhead
//
// Falling off the fossil (low rock rims all round, porch rails at the camps) drops you into the
// nebula: a kill volume under the map.
import type { Quat } from '../../math/quat';
import { qFromAxisAngle, qMul, quat } from '../../math/quat';
import type { Vec3 } from '../../math/vec3';
import { v3 } from '../../math/vec3';
import { LevelBuilder, wedgeRamp } from '../builder';
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
const STERNUM = 0x9c8f78; // the fused belly plates the nave stands on
const MATRIX = 0x26343d; // the fossil rock the skeleton is set in
const MATRIX_RIM = 0x34454f;
// bioluminescence
const TEAL = 0x2ef2d0;
const VIOLET = 0xa46bff;
const HEART = 0xd13a7a;
const HEART_VIOLET = 0x8a3cff;
// salvage
const STEEL = 0x56616b;
const STEEL_DARK = 0x353d45;
const HUT = 0x5f6a72;
const RUST = 0x7a5536;
const DRAB = 0x4f5c52;
const TARP = 0x6f5a3c;
const LAMP = 0xffb46a;

/** Walkway height of the spine. */
const SPINE_Y = 10;

/** Key coordinates (the plan). East (+x) is authored, west mirrors it. */
export const LEVIATHAN = {
  spine: {
    y: SPINE_Y,
    /** half width of the walkway */
    halfWidth: 3,
    /** the flat top runs over |z| ≤ flatZ ... */
    flatZ: 22,
    /** ... the neck and the tail root slope down to the ground at |z| = footZ */
    footZ: 42,
    /** vertebra processes on top: full blades on x = 0, half knobs at the edges (|x| 2.1..2.9) */
    bladeZ: [-16, -8, 0, 8, 16],
    knobZ: [-20, -12, -4, 4, 12, 20],
    /** blades down the neck and the tail root */
    slopeBladeZ: [-34, -26, 26, 34],
  },
  /** rib arches (both sides) and where their feet stand */
  ribs: { z: [-28, -20, -12, -4, 4, 12, 20, 28], footX: 23 },
  nave: { x: 22, z0: -44, z1: 44 },
  flank: { x0: 24, x1: 46 },
  heart: { pos: v3(0, 4.6, 0), balconyY: 4, outer: 10, inner: 5 },
  /** Orange's camp (Cyan's mirrors it) and the spawn room inside it */
  camp: { x0: 47, x1: 58.5, z: 11.5, room: { x0: 52, x1: 58, z: 7 }, height: 3.6 },
  skull: { x: 16, z0: -67, z1: -45, roof: 12 },
  tail: { z0: 44, z1: 67 },
  /** Towers: Cyan's (west) first */
  towers: [v3(-41, 0, 0), v3(41, 0, 0)] as [Vec3, Vec3],
  bombSites: {
    A: { min: v3(-9, 0, -62), max: v3(9, 3, -50) },
    B: { min: v3(-11, 0, 47), max: v3(11, 3, 60.5) },
  },
  powerups: [v3(0, 1, 0)],
};

/** Height of the backbone's walking surface at `z` (the flat top, then the neck / tail root). */
export const spineSurfaceY = (z: number): number => {
  const S = LEVIATHAN.spine;
  const a = Math.abs(z);
  if (a <= S.flatZ) return S.y;
  if (a >= S.footZ) return 0;
  return (S.y * (S.footZ - a)) / (S.footZ - S.flatZ);
};

type Extra = Omit<BoxDef, 'c' | 'h' | 'mat'>;

/** Authoring helpers shared by the parts of the map. */
interface Kit {
  b: LevelBuilder;
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
  /** a box and its mirror across x = 0 (one box if it already straddles x = 0 evenly) */
  sym: Kit['box'];
  /** a bone box and its mirror */
  bone: (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => void;
  /** a rotated box */
  obb: (c: Vec3, h: Vec3, q: Quat, mat: Material, extra?: Extra) => void;
  /** a rotated box and its mirror (the mirror of rotation q is (q.x, −q.y, −q.z, q.w)) */
  symObb: Kit['obb'];
  /** a light and its mirror */
  light: (x: number, y: number, z: number, color: number, radius: number, k: number) => void;
}

const rotZ = (a: number) => qFromAxisAngle(v3(0, 0, 1), a);
const rotX = (a: number) => qFromAxisAngle(v3(1, 0, 0), a);
const rotY = (a: number) => qFromAxisAngle(v3(0, 1, 0), a);

export const buildLeviathan = (): LevelDef => {
  const L = LEVIATHAN;
  const b = new LevelBuilder();
  const lights: LightDef[] = [];
  const box: Kit['box'] = (x0, y0, z0, x1, y1, z1, mat, extra = {}) => {
    b.box(
      v3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      v3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
      { mat, ...extra },
    );
  };
  const sym: Kit['sym'] = (x0, y0, z0, x1, y1, z1, mat, extra = {}) => {
    box(x0, y0, z0, x1, y1, z1, mat, extra);
    if (Math.min(x0, x1) !== -Math.max(x0, x1)) box(-x0, y0, z0, -x1, y1, z1, mat, extra);
  };
  const obb: Kit['obb'] = (c, h, q, mat, extra = {}) => {
    b.boxes.push({ c, h, q, mat, ...extra });
  };
  const k: Kit = {
    b,
    box,
    sym,
    bone: (x0, y0, z0, x1, y1, z1) => sym(x0, y0, z0, x1, y1, z1, 'rock', { color: BONE }),
    obb,
    symObb: (c, h, q, mat, extra = {}) => {
      obb(c, h, q, mat, extra);
      if (c.x !== 0) obb(v3(-c.x, c.y, c.z), h, quat(q.x, -q.y, -q.z, q.w), mat, extra);
    },
    light: (x, y, z, color, radius, intensity) => {
      lights.push({ pos: v3(x, y, z), color, radius, intensity });
      if (x !== 0) lights.push({ pos: v3(-x, y, z), color, radius, intensity });
    },
  };

  buildGround(k);
  buildSpine(k);
  for (const z of L.ribs.z) {
    // the rib's centreline tops out just under the spine's walking surface where it hangs
    const surf = Math.min(spineSurfaceY(z - 0.7), spineSurfaceY(z + 0.7));
    ribArch(k, z, Math.min(SPINE_Y - 0.8, surf - 0.75));
  }
  buildHeart(k);
  buildSkull(k);
  buildTail(k);
  buildCover(k);
  buildCamps(k);

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
    homes.push(v3(s * 44.5, 0.9, 0));
    for (const x of [53.5, 56])
      for (const z of [-4.5, -1.5, 1.5, 4.5])
        spawns.push({ pos: v3(s * x, 0, z), yawDeg: team === 0 ? 90 : -90, team });
    // over the front door, along the spawn room's back wall
    box(s * 46.9, 3, -4, s * 47, 3.2, 4, 'trim', { color: tc, noCollide: true });
    box(s * 57.9, 2.9, -6, s * 58, 3.1, 6, 'trim', { color: tc, noCollide: true });
    const tl = (x: number, y: number, z: number, c: number, r: number, i: number) =>
      lights.push({ pos: v3(s * x, y, z), color: c, radius: r, intensity: i });
    tl(55, 2.8, 0, tc, 9, 0.9);
    tl(49.5, 2.8, 0, tc, 8, 0.6);
    tl(45, 3.2, 0, tc, 9, 0.8);
    for (const z of [-9.25, 9.25]) tl(53, 2.8, z, tc, 7, 0.5);
    for (const z of [-13.5, 13.5]) tl(50, 2.6, z, LAMP, 8, 0.6);
  }

  decorate(k);

  // falling off the fossil: into the nebula
  const killVolumes: KillVolumeDef[] = [{ min: v3(-300, -80, -300), max: v3(300, -5, 300) }];

  return b.build({
    name: 'Leviathan',
    boundsMin: v3(-60, -6, -68),
    boundsMax: v3(60, 18, 68),
    defaultGravity: v3(0, -1, 0),
    zones: [],
    rails: [],
    pads: [],
    spawns,
    towers,
    controllerHomes: homes,
    waypoints: waypoints(),
    areas: [
      { name: 'Cyan camp', pos: v3(-49.5, 0, 0), yawDeg: 90 },
      { name: 'Orange camp', pos: v3(49.5, 0, 0), yawDeg: -90 },
      { name: 'West flank', pos: v3(-31, 0, -9), yawDeg: 90 },
      { name: 'Nave, east aisle', pos: v3(12, 0, -24), yawDeg: 180 },
      { name: 'The Heart', pos: v3(0, 0, -7), yawDeg: 180 },
      { name: 'Heart balcony', pos: v3(7, L.heart.balconyY, -7), yawDeg: -90 },
      { name: 'The Spine', pos: v3(0, SPINE_Y, -12), yawDeg: 180 },
      { name: 'The neck', pos: v3(1.5, spineSurfaceY(-30), -30), yawDeg: 0 },
      { name: 'A site (skull)', pos: v3(0, 0, -53), yawDeg: 0 },
      { name: 'Jaw grounds', pos: v3(25, 0, -54), yawDeg: -90 },
      { name: 'B site (tail)', pos: v3(4, 0, 54.5), yawDeg: 180 },
    ],
    fog: { color: 0x14595e, near: 45, far: 190 },
    ambient: 0.82,
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

/** Floors (the belly plates, the fossil rock, the camps' decking) and the rims round the edge. */
const buildGround = (k: Kit): void => {
  const { box, sym } = k;
  box(-22, -1, -44, 22, 0, 44, 'rock', { color: STERNUM });
  sym(22, -1, -44, 46, 0, 44, 'rock', { color: MATRIX });
  box(-34, -1, -67, 34, 0, -44, 'rock', { color: MATRIX }); // jaw grounds and the skull
  box(-34, -1, 44, 34, 0, 67, 'rock', { color: MATRIX }); // tail grounds
  sym(46, -1, -16, 58.5, 0, 16, 'plate', { color: STEEL_DARK }); // the camps' decking
  // low rims along every edge (half cover; beyond them the nebula)
  const rim = { color: MATRIX_RIM };
  sym(16, 0, -67, 34, 1, -66, 'rock', rim); // north, beside the skull's face
  sym(33, 0, -66, 34, 1, -44, 'rock', rim);
  sym(34, 0, -44, 46, 1, -43, 'rock', rim);
  sym(45, 0, -43, 46, 1, -16, 'rock', rim);
  sym(45, 0, 16, 46, 1, 43, 'rock', rim);
  sym(34, 0, 43, 46, 1, 44, 'rock', rim);
  sym(33, 0, 44, 34, 1, 66, 'rock', rim);
  box(-34, 0, 66, 34, 1, 67, 'rock', rim); // south, behind the tail
  // porch rails at the camps
  const rail = { color: STEEL };
  sym(46, 0, -16, 58.5, 1, -15, 'hull', rail);
  sym(46, 0, 15, 58.5, 1, 16, 'hull', rail);
  sym(57.5, 0, -15, 58.5, 1, -11.5, 'hull', rail);
  sym(57.5, 0, 11.5, 58.5, 1, 15, 'hull', rail);
};

/**
 * The backbone: vertebral bodies (bone) with darker discs between them along the flat top
 * (|z| ≤ 22, y 7..10), the neck and the tail root as solid wedges down to the ground, and the
 * processes on top. Work lamps hang under it.
 */
const buildSpine = (k: Kit): void => {
  const { b, sym, bone } = k;
  const S = LEVIATHAN.spine;
  const W = S.halfWidth;
  for (let c = -20; c <= 20; c += 4) {
    const z0 = c === -20 ? -S.flatZ : c - 1.7;
    const z1 = c === 20 ? S.flatZ : c + 1.7;
    bone(-W, 7, z0, W, S.y, z1);
    if (c < 20) sym(-2.8, 7.3, c + 1.7, 2.8, S.y, c + 2.3, 'rock', { color: BONE_DARK });
  }
  // neck (north) and tail root (south): 20 m ramps, 26.6°
  b.boxes.push(wedgeRamp('z', -S.flatZ, -S.footZ, S.y, 0, 0, 2 * W, { mat: 'rock', color: BONE }));
  b.boxes.push(wedgeRamp('z', S.flatZ, S.footZ, S.y, 0, 0, 2 * W, { mat: 'rock', color: BONE }));
  for (const z of S.bladeZ) bone(-0.4, S.y, z - 0.8, 0.4, S.y + 2.4, z + 0.8);
  for (const z of S.knobZ) bone(2.1, S.y, z - 0.6, 2.9, S.y + 1.1, z + 0.6);
  // blades down the neck and the tail root (rooted in the wedge, 2+ m over its surface)
  for (const z of S.slopeBladeZ) {
    const lo = Math.min(spineSurfaceY(z - 0.8), spineSurfaceY(z + 0.8));
    const hi = Math.max(spineSurfaceY(z - 0.8), spineSurfaceY(z + 0.8));
    bone(-0.4, lo - 0.3, z - 0.8, 0.4, hi + 2.2, z + 0.8);
  }
  // teal growths on the knobs' outer sides
  for (const z of [-12, 12])
    sym(2.9, S.y, z - 0.5, 2.98, S.y + 0.7, z + 0.5, 'glow', { color: TEAL, noCollide: true });
  // hanging work lamps under the backbone (cables from the vertebrae)
  for (const z of [-20, 20]) {
    sym(2.45, 5.2, z - 0.05, 2.55, 7, z + 0.05, 'hull', { color: STEEL_DARK, noCollide: true });
    sym(2.25, 4.95, z - 0.25, 2.75, 5.2, z + 0.25, 'trim', { color: LAMP, noCollide: true });
  }
};

/**
 * One pair of ribs (both sides) at `z`: a quarter ellipse from under the spine (x 2.6,
 * centreline height `apex`) out and down to a vertical foot at x 23, drawn as six rotated bone
 * segments overlapping at the joints, standing on a knuckle on the floor.
 */
const ribArch = (k: Kit, z: number, apex: number): void => {
  const A = LEVIATHAN.ribs.footX;
  const B = apex - 3;
  const t0 = Math.asin(2.6 / A);
  const N = 6;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = t0 + ((Math.PI / 2 - t0) * i) / N;
    pts.push([A * Math.sin(t), 3 + B * Math.cos(t)]);
  }
  for (let i = 0; i < N; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    k.symObb(
      v3((x0 + x1) / 2, (y0 + y1) / 2, z),
      v3(len / 2 + (i === 0 ? 0.35 : 0.25), 0.6, 0.7),
      rotZ(Math.atan2(y1 - y0, x1 - x0)),
      'rock',
      { color: BONE },
    );
  }
  k.bone(A - 0.6, 0, z - 0.7, A + 0.6, 3.3, z + 0.7); // foot
  k.bone(A - 1, 0, z - 0.95, A + 1, 0.7, z + 0.95); // knuckle
};

/**
 * The heart: a cluster of red-violet crystal hanging from the spine over the power-up (it
 * glows, it doesn't collide), violet crystals growing from the floor under it, and the salvage
 * ring balcony around it at y 4 with four ramps.
 */
const buildHeart = (k: Kit): void => {
  const { b, sym, obb, light } = k;
  const H = LEVIATHAN.heart;
  const Y = H.balconyY;
  const glow = (color: number): Extra => ({ color, noCollide: true });
  // crystal core: square-sectioned pieces turned 45° about y and tilted about x (so each is its
  // own mirror image), and the aorta up into the vertebra
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
  // crystal spikes jutting north and south
  for (const s of [1, -1])
    obb(v3(0, c.y - 0.2, s * 1.6), v3(0.25, 1.4, 0.25), rotX(s * 0.7), 'glow', glow(HEART));
  sym(-0.35, 6.2, -0.35, 0.35, 7, 0.35, 'glow', glow(HEART));
  // violet crystals growing from the floor round the power-up, and the stain under the heart
  for (const [x, z, h] of [
    [2.6, 0.6, 0.9],
    [2.2, -1.8, 0.6],
    [0.9, 2.7, 0.7],
  ] as const)
    sym(x - 0.25, 0, z - 0.25, x + 0.25, h, z + 0.25, 'glow', glow(HEART_VIOLET));
  sym(-1.6, 0, -1.6, 1.6, 0.02, 1.6, 'glow', glow(0x5a2150));
  // the balcony ring: salvage decking on four posts
  const deck = { color: STEEL };
  sym(-H.outer, Y - 0.6, -H.outer, H.outer, Y, -H.inner, 'plate', deck);
  sym(-H.outer, Y - 0.6, H.inner, H.outer, Y, H.outer, 'plate', deck);
  sym(H.inner, Y - 0.6, -H.inner, H.outer, Y, H.inner, 'plate', deck);
  sym(9, 0, -10, 10, Y - 0.6, -9, 'hull', { color: STEEL_DARK });
  sym(9, 0, 9, 10, Y - 0.6, 10, 'hull', { color: STEEL_DARK });
  // waist-high barricades on its corners
  sym(8, Y, -10, 10, Y + 1.1, -8, 'crate', { color: RUST });
  sym(8, Y, 8, 10, Y + 1.1, 10, 'crate', { color: RUST });
  // ramps up: east / west along x, north / south along z (8 m run, 26.6°)
  const ramp = { mat: 'plate' as Material, color: STEEL };
  b.boxes.push(wedgeRamp('x', 18, H.outer, 0, Y, 0, 4, ramp));
  b.boxes.push(wedgeRamp('x', -18, -H.outer, 0, Y, 0, 4, ramp));
  b.boxes.push(wedgeRamp('z', -18, -H.outer, 0, Y, 0, 4, ramp));
  b.boxes.push(wedgeRamp('z', 18, H.outer, 0, Y, 0, 4, ramp));
  // lamp posts on the ring's outer edge (either side of the east / west ramps)
  for (const z of [-4, 4]) {
    sym(9.6, Y, z - 0.1, 9.8, Y + 2.2, z + 0.1, 'hull', { color: STEEL_DARK });
    sym(9.45, Y + 2.2, z - 0.25, 9.95, Y + 2.4, z + 0.25, 'trim', { color: LAMP, noCollide: true });
  }
  // the heart's light: red-violet, strongest at its core
  light(0, c.y, 0, HEART, 16, 2.1);
  light(0, 1.2, 0, HEART_VIOLET, 9, 1.3);
  light(0, 6.6, 0, HEART, 9, 1.2);
  light(6, 5.5, -1, HEART_VIOLET, 11, 0.9);
  light(0, 5.5, -6, HEART, 11, 0.9);
  light(0, 5.5, 6, HEART, 11, 0.9);
  light(6.5, 1.8, -6.5, HEART_VIOLET, 8, 0.7);
  light(6.5, 1.8, 6.5, HEART_VIOLET, 8, 0.7);
};

/**
 * The skull (site A): a bone hall x −15..15, z −66..−46, 12 m to the vaulted roof. The foramen
 * (7 m wide) south where the neck comes down, jaw doors east / west, temporal windows over a
 * waist-high sill (vault in), crystal-filled eye sockets in the face. Outside, the lower jaw
 * lies on the jaw grounds with its fangs.
 */
const buildSkull = (k: Kit): void => {
  const { b, sym, bone, symObb, light } = k;
  const K = LEVIATHAN.skull;
  const o = { mat: 'rock' as Material, color: BONE };
  const top = K.roof;
  // south wall: the foramen
  b.wall('z', K.z1 - 0.5, 1, -K.x, K.x, 0, top, [{ u0: -3.5, u1: 3.5, v0: 0, v1: 4.5 }], o);
  // north wall (the face): two eye sockets
  const eyes = [
    { u0: -9, u1: -3, v0: 3.5, v1: 8 },
    { u0: 3, u1: 9, v0: 3.5, v1: 8 },
  ];
  b.wall('z', K.z0 + 0.5, 1, -K.x, K.x, 0, top, eyes, o);
  // side walls: a jaw door and a temporal window each
  for (const s of [1, -1])
    b.wall(
      'x',
      s * (K.x - 0.5),
      1,
      K.z0 + 1,
      K.z1 - 1,
      0,
      top,
      [
        { u0: -52, u1: -48, v0: 0, v1: 3.5 },
        { u0: -62, u1: -57, v0: 1.2, v1: 4.2 },
      ],
      o,
    );
  // the cranium: roof and dome steps
  bone(-K.x, top, K.z0, K.x, top + 1, K.z1);
  bone(-13, top + 1, -64, 13, top + 2, -48);
  bone(-9, top + 2, -61, 9, top + 3, -51);
  // the eye sockets: crystal membranes (see-through to the nebula) over teal sills
  sym(3, 3.5, K.z0, 9, 8, K.z0 + 1, 'skyglass', { color: 0x3fd6c4 });
  sym(3, 3.3, K.z0 + 1, 9, 3.5, K.z0 + 1.08, 'glow', { color: TEAL, noCollide: true });
  // vault arches inside (the cathedral's ribs), springing from the side walls at 6 m
  for (const z of [-51, -56, -61]) {
    const A = K.x - 1;
    const B = top - 6;
    const N = 4;
    const pts: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const t = (Math.PI / 2) * (i / N);
      pts.push([A * Math.cos(t), 6 + B * Math.sin(t)]);
    }
    for (let i = 0; i < N; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      symObb(
        v3((x0 + x1) / 2, (y0 + y1) / 2 - 0.2, z),
        v3(len / 2 + 0.3, 0.45, 0.5),
        rotZ(Math.atan2(y1 - y0, x1 - x0)),
        'rock',
        { color: BONE },
      );
    }
  }
  // site A cover: salvage stacks either side of the middle, crates by the walls, a fallen horn,
  // a broken tooth, crates inside the foramen
  sym(3, 0, -58, 5.5, 2.4, -55.5, 'crate', { color: DRAB });
  sym(9.5, 0, -53.5, 11.5, 1.1, -51.5, 'crate', { color: RUST });
  bone(-1.5, 0, -64.5, 1.5, 1.1, -63);
  bone(11, 0, -64.5, 13.5, 2.4, -62);
  sym(6, 0, -48.5, 8, 1.1, -47.2, 'crate', { color: RUST });
  bone(-1.2, 0, -49, 1.2, 2.6, -47.8); // a bone pillar just inside the foramen
  // the lower jaw on the jaw grounds: a long bone with fangs (full cover), a loose vertebra
  bone(18, 0, -64, 19.5, 2.4, -53);
  for (const z of [-62, -58.5, -55]) bone(18.3, 2.4, z - 0.5, 19.2, 3.4, z + 0.5);
  bone(28.5, 0, -60, 31, 1.1, -57.5);
  // violet growths along the inside of the side walls
  for (const z of [-60, -54])
    sym(14.2, 0, z - 0.8, 14.95, 0.5, z + 0.8, 'glow', { color: VIOLET, noCollide: true });
  light(6, 5.5, -64.5, TEAL, 14, 1.2);
  light(0, 9, -56, VIOLET, 18, 1.0);
  light(8, 3, -52, LAMP, 10, 0.8);
  light(4, 3, -60, LAMP, 9, 0.7);
  light(14, 1.2, -57, VIOLET, 6, 0.8);
  light(0, 3.5, -44, TEAL, 10, 0.9);
  light(22, 3.5, -58, TEAL, 12, 0.8);
  light(17, 3, -50, LAMP, 8, 0.7);
};

/**
 * The tail (site B): the hip bones close the nave's south end (gaps beside the tail root and
 * out at the flanks); behind them the tail runs along the ground as vertebrae on the middle
 * line, rises at the south edge (a full column) and coils back north overhead, its tip hanging
 * over the site.
 */
const buildTail = (k: Kit): void => {
  const { sym, bone, obb, light } = k;
  // hip bones (full cover)
  bone(7, 0, 44, 16, 3.2, 45.2);
  bone(8, 3.2, 44.1, 15, 3.8, 45.1);
  // tail vertebrae along the ground
  bone(-1.2, 0, 44.3, 1.2, 2.4, 46.7);
  bone(-1, 0, 48.5, 1, 1.1, 50.5);
  bone(-1, 0, 57, 1, 2.2, 59);
  bone(-1.3, 0, 61.3, 1.3, 5.2, 64.3); // the tail rising
  // the coil: vertebrae on a spiral in the y-z plane, turned about x (their own mirror images)
  const steps = 13;
  for (let i = 0; i <= steps; i++) {
    const phi = ((-20 + (i * 320) / steps) * Math.PI) / 180;
    const r = 7.2 - (i / steps) * 4.2;
    const s = 1.25 - (i / steps) * 0.6;
    obb(
      v3(0, 8.5 + r * Math.sin(phi), 55 + r * Math.cos(phi)),
      v3(s, s * 0.9, s * 0.8),
      rotX(-phi),
      'rock',
      { color: BONE },
    );
  }
  // cover around the site: bone fragments, crates, a tail fin
  bone(6, 0, 50.5, 7.5, 2.4, 53);
  bone(8, 0, 56, 10, 1.1, 57.5);
  sym(5, 0, 57.5, 7, 1.1, 59.5, 'crate', { color: RUST });
  sym(20, 0, 50, 23, 2.4, 52, 'crate', { color: DRAB });
  sym(25, 0, 58, 27, 1.1, 60, 'crate', { color: RUST });
  bone(13.5, 0, 62, 16, 2.4, 64.5);
  // teal growths along the tail
  for (const z of [51.5, 55.5])
    sym(1.2, 0, z - 0.6, 1.9, 0.35, z + 0.6, 'glow', { color: TEAL, noCollide: true });
  light(0, 12, 55, TEAL, 16, 1.2);
  light(0, 3, 53.5, VIOLET, 12, 0.9);
  light(6, 3, 58, LAMP, 9, 0.8);
  light(11.5, 3.5, 47, TEAL, 10, 0.8);
  light(22, 3.5, 56, LAMP, 11, 0.8);
  light(0, 3, 41, TEAL, 9, 0.8);
};

/** Cover in the nave's aisles and the flank lanes; scaffolds clamped to rib feet. */
const buildCover = (k: Kit): void => {
  const { sym, bone } = k;
  const crate = (x0: number, z0: number, x1: number, z1: number, h: number, color = RUST) =>
    sym(x0, 0, z0, x1, h, z1, 'crate', { color });
  const machine = (x0: number, z0: number, x1: number, z1: number, h: number) =>
    sym(x0, 0, z0, x1, h, z1, 'hull', { color: STEEL });
  // aisles (x 3..22): fallen vertebrae, salvage crates, generators
  bone(12, 0, -34, 15.5, 2.4, -31.5);
  bone(8, 0, -39.5, 10.5, 1.1, -37.5);
  crate(6, -27, 8.2, -24.8, 1.1);
  crate(15.5, -28.6, 17.9, -26.2, 2.4, DRAB);
  machine(14.5, -17.5, 17.5, -15.5, 2.2);
  crate(5.5, -13.5, 7.5, -11.5, 1.1);
  crate(15, -9, 17.2, -7, 1.1, DRAB);
  crate(15, 7, 17.2, 9, 1.1, DRAB);
  crate(5.5, 11.5, 7.5, 13.5, 1.1);
  machine(14.5, 15.5, 17.5, 17.5, 2.2);
  crate(15.5, 26.2, 17.9, 28.6, 2.4, DRAB);
  crate(6, 24.8, 8.2, 27, 1.1);
  bone(12, 0, 31.5, 15.5, 2.4, 34);
  bone(8, 0, 37.5, 10.5, 1.1, 39.5);
  // beside the neck and the tail root, and rib stubs inside the feet: they break the lines down
  // the length of the aisles
  crate(3, -36, 5.2, -34, 2.4, DRAB);
  crate(3, 34, 5.2, 36, 2.4, DRAB);
  for (const z of [-28, -12, 12, 28]) bone(18.5, 0, z - 0.7, 21.8, 2.4, z + 0.7);
  // flank lanes (x 24..46): a blast shield before each camp, crates, cable spools
  machine(33.5, -3.5, 34.5, 3.5, 2.6);
  crate(38, -9.5, 40.4, -7.1, 1.1);
  crate(38, 7.1, 40.4, 9.5, 1.1);
  crate(36, -23.4, 38.4, -21, 1.1);
  crate(38.5, -30, 41.5, -27, 2.4, DRAB);
  crate(27.5, -38, 29.9, -35.6, 2.4);
  crate(36, 21, 38.4, 23.4, 1.1);
  crate(38.5, 27, 41.5, 30, 2.4, DRAB);
  crate(27.5, 35.6, 29.9, 38, 2.4);
  // salvage containers midway along the flank lanes
  sym(29.5, 0, -27.5, 33, 2.6, -25, 'hull', { color: STEEL_DARK });
  sym(29.5, 0, 25, 33, 2.6, 27.5, 'hull', { color: STEEL_DARK });
  sym(40, 0, -18.5, 42.4, 1.1, -16.5, 'hull', { color: STEEL_DARK });
  sym(40, 0, 16.5, 42.4, 1.1, 18.5, 'hull', { color: STEEL_DARK });
  // salvage scaffolds against the outside of rib feet: a deck at 3 m on four posts, a work lamp
  for (const z of [-28, -12, 12, 28]) {
    const x0 = 24.3;
    const x1 = 27.1;
    const post = { color: STEEL_DARK };
    for (const x of [x0, x1 - 0.2])
      for (const zz of [z - 1.4, z + 1.2]) sym(x, 0, zz, x + 0.2, 2.8, zz + 0.2, 'hull', post);
    sym(x0, 2.8, z - 1.4, x1, 3, z + 1.4, 'grate', { color: STEEL });
    sym(x1 - 0.4, 3, z - 0.1, x1 - 0.2, 4.6, z + 0.1, 'hull', { ...post, noCollide: true });
    sym(x1 - 0.55, 4.6, z - 0.25, x1 - 0.05, 4.8, z + 0.25, 'trim', {
      color: LAMP,
      noCollide: true,
    });
    k.light(x1 - 0.3, 4.4, z, LAMP, 12, 0.9);
  }
};

/**
 * The salvage camps (Orange's east, Cyan's mirrored): a roofed hut x 47..58.5, z −11.5..11.5,
 * 3.6 m inside. The spawn room (x 52..58, z −7..7) is closed toward the front and opens only at
 * its back corners into the side corridors; they lead to the front corridor and its door
 * (facing the map, the Tower before it) and to a side door onto each porch.
 */
const buildCamps = (k: Kit): void => {
  const { b, sym } = k;
  const C = LEVIATHAN.camp;
  const R = C.room;
  const H = C.height;
  const wall = { mat: 'panel' as Material, color: HUT };
  const door = (u0: number, u1: number) => ({ u0, u1, v0: 0, v1: 2.8 });
  for (const s of [1, -1]) {
    b.wall('x', s * (C.x0 + 0.25), 0.5, -C.z, C.z, 0, H, [door(-1.5, 1.5)], wall); // front
    b.wall('x', s * (C.x1 - 0.25), 0.5, -C.z, C.z, 0, H, [], wall); // back
    // north / south walls, a side door at the front corner of each
    const u0 = s > 0 ? C.x0 + 0.5 : -(C.x1 - 0.5);
    const u1 = s > 0 ? C.x1 - 0.5 : -(C.x0 + 0.5);
    const d = s > 0 ? door(C.x0 + 0.5, C.x0 + 2.5) : door(-(C.x0 + 2.5), -(C.x0 + 0.5));
    for (const n of [1, -1]) b.wall('z', n * (C.z - 0.25), 0.5, u0, u1, 0, H, [d], wall);
  }
  // the spawn room: its front wall is solid; its north / south walls open at the back end
  sym(R.x0 - 0.5, 0, -R.z - 0.5, R.x0, H, R.z + 0.5, 'panel', { color: HUT });
  sym(R.x0, 0, -R.z - 0.5, 55.5, H, -R.z, 'panel', { color: HUT });
  sym(R.x0, 0, R.z, 55.5, H, R.z + 0.5, 'panel', { color: HUT });
  sym(C.x0, H, -C.z, C.x1, H + 0.4, C.z, 'plate', { color: STEEL }); // roof
  // clamps: girders from the roof edge down into the decking; a tarp awning over the door
  for (const z of [-11, 11]) sym(46.4, 0, z - 0.3, 47, 4.4, z + 0.3, 'hull', { color: STEEL_DARK });
  sym(45.4, 2.82, -2.2, 47, 2.95, 2.2, 'panel', { color: TARP, noCollide: true });
};

/** Glow growths by the rib feet, work lamps, the nave's light, site outlines, far rocks. */
const decorate = (k: Kit): void => {
  const { sym, light } = k;
  const L = LEVIATHAN;
  // bioluminescent growths beside the rib feet, alternating teal / violet
  L.ribs.z.forEach((z, i) => {
    const col = i % 2 === 0 ? TEAL : VIOLET;
    const g = { color: col, noCollide: true };
    sym(20.6, 0, z + 1.2, 21.4, 0.55, z + 2.0, 'glow', g);
    sym(21.5, 0, z + 1.4, 21.9, 0.3, z + 1.8, 'glow', g);
    sym(24.2, 0, z - 2.1, 24.8, 0.4, z - 1.5, 'glow', g);
    light(21, 1, z + 1.6, col, 7, 0.9);
  });
  // violet growths on the balcony posts' outer faces
  sym(10, 0.4, -9.8, 10.06, 1.6, -9.2, 'glow', { color: VIOLET, noCollide: true });
  sym(10, 0.4, 9.2, 10.06, 1.6, 9.8, 'glow', { color: VIOLET, noCollide: true });
  // work lamps on poles in the flank lanes and floodlights in the aisles
  const lamp = (x: number, z: number, h: number, r: number) => {
    sym(x - 0.1, 0, z - 0.1, x + 0.1, h, z + 0.1, 'hull', { color: STEEL_DARK });
    sym(x - 0.25, h, z - 0.25, x + 0.25, h + 0.2, z + 0.25, 'trim', {
      color: LAMP,
      noCollide: true,
    });
    light(x - 0.4, h - 0.2, z, LAMP, r, 0.9);
  };
  for (const z of [-36, -20, 20, 36]) lamp(44.1, z, 3.6, 13);
  for (const z of [-30, 30]) lamp(20, z, 2.6, 12);
  // the nave: soft teal high under the ribs, violet over the heart
  for (const z of [-36, -24, -12, 12, 24, 36]) light(12, 7, z, TEAL, 16, 0.6);
  light(0, 11.5, -16, TEAL, 12, 0.6);
  light(0, 11.5, 16, TEAL, 12, 0.6);
  light(0, 11.5, 0, VIOLET, 10, 0.6);
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
 * x = 0 have no suffix. Orange (team 1) camps east: 'towerE' is Orange's Tower, 'spawnE' the
 * middle of its spawn room.
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
  const Y = LEVIATHAN.heart.balconyY;
  const S = SPINE_Y;

  // camp
  add('spawn', 54.75, 0, 0);
  for (const [n, z] of [
    ['N', -1],
    ['S', 1],
  ] as const) {
    add(`spawn${n}`, 56.75, 0, z * 5.5);
    add(`open${n}`, 56.75, 0, z * 7.25);
    add(`cor${n}`, 56.5, 0, z * 9.25);
    add(`corF${n}`, 49.5, 0, z * 9.25);
    add(`door${n}`, 48.5, 0, z * 11.25);
    add(`porch${n}`, 48.5, 0, z * 13.5);
    add(`porchOut${n}`, 43.5, 0, z * 13.5);
    add(`lane${n}`, 40, 0, z * 5);
  }
  add('corF', 49.5, 0, 0);
  add('tower', 44, 0, 0);
  // flank lane
  add('flank', 31, 0, 0);
  add('flankN8', 31, 0, -9);
  add('flankN20', 33.5, 0, -18);
  add('flankN32', 34, 0, -33);
  add('flankN42', 30, 0, -41);
  add('flankS8', 31, 0, 9);
  add('flankS20', 33.5, 0, 18);
  add('flankS32', 34, 0, 33);
  add('flankS42', 30, 0, 41);
  // rib gaps
  for (const z of [0, -8, -16, -24, 8, 16, 24]) add(`gap${z}`, 23, 0, z);
  // nave aisles
  add('aisleN6', 13.5, 0, -5);
  add('aisleN16', 11.5, 0, -13);
  add('aisleN24', 12, 0, -24);
  add('aisleN32', 10, 0, -31);
  add('aisleN40', 13, 0, -41);
  add('aisleS6', 13.5, 0, 5);
  add('aisleS16', 11.5, 0, 13);
  add('aisleS24', 12, 0, 24);
  add('aisleS32', 10, 0, 31);
  add('aisleS40', 13, 0, 41);
  // the heart: under the balcony, the power-up, the balcony and its ramps
  add('heart', 0, 0, 0);
  add('underN', 6.5, 0, -6.5);
  add('underS', 6.5, 0, 6.5);
  add('under', 7, 0, 0);
  add('rampX', 19.5, 0, 0);
  add('rampN', 0, 0, -19.5);
  add('rampS', 0, 0, 19.5);
  add('bal', 7.5, Y, 0);
  add('balN', 7, Y, -7);
  add('balS', 7, Y, 7);
  add('balMidN', 0, Y, -7.5);
  add('balMidS', 0, Y, 7.5);
  // the spine: x = 0 between the blades, x ±1.4 beside them; edge nodes to drop from
  for (const z of [-20, -12, -4, 4, 12, 20]) add(`spine${z}`, 0, S, z);
  for (const z of [-16, -8, 0, 8, 16]) add(`spineB${z}`, 1.4, S, z);
  add('edgeN', 2.6, S, -8);
  add('edgeS', 2.6, S, 8);
  // neck and tail root
  for (const z of [-26, -34, 26, 34]) add(`neck${z}`, 1.5, spineSurfaceY(z), z);
  add('neckFoot', 1.8, 0, -43.2);
  add('tailFoot', 2, 0, 43.1);
  // skull (site A) and the jaw grounds
  add('apron', 0, 0, -43.8);
  add('foramen', 0, 0, -45.5);
  add('skullIn', 4, 0, -49.5);
  add('siteA', 0, 0, -56);
  add('siteAE', 7, 0, -53);
  add('siteAN', 8, 0, -50);
  add('jawIn', 12.5, 0, -50);
  add('jawDoor', 15.5, 0, -50);
  add('jawOut', 20.5, 0, -50);
  add('jaw', 25, 0, -54);
  add('jawN', 25.5, 0, -62);
  add('templeOut', 21.5, 0, -59.5);
  // tail (site B)
  add('hipGap', 5, 0, 44.6);
  add('siteBN', 4, 0, 48);
  add('siteB', 0, 0, 54);
  add('siteBE', 4, 0, 54.5);
  add('siteBS', 3.5, 0, 61);
  add('tailOut', 20, 0, 46.5);
  add('tailOut2', 17.5, 0, 55);
  add('tailOut3', 21, 0, 61.5);

  // camp: spawn room → side corridors → front door (Tower) / porches
  for (const n of ['N', 'S']) {
    chain('spawn', `spawn${n}`, `open${n}`, `cor${n}`, `corF${n}`, 'corF');
    chain(`corF${n}`, `door${n}`, `porch${n}`, `porchOut${n}`);
    link(`porchOut${n}`, `flank${n}8`);
    link(`porchOut${n}`, `lane${n}`);
    link(`porchOut${n}`, `flank${n}20`);
    link(`lane${n}`, `flank${n}8`);
    link(`lane${n}`, 'tower');
  }
  link('corF', 'tower');
  // flank lanes and the rib gaps
  chain('flankN8', 'flankN20', 'flankN32', 'flankN42');
  chain('flankS8', 'flankS20', 'flankS32', 'flankS42');
  link('flank', 'flankN8');
  link('flank', 'flankS8');
  link('flank', 'gap0');
  link('flankN8', 'gap-8');
  link('flankN20', 'gap-16');
  link('flankN20', 'gap-24');
  link('flankS8', 'gap8');
  link('flankS20', 'gap16');
  link('flankS20', 'gap24');
  // aisles
  link('gap0', 'rampX');
  link('gap0', 'aisleN6');
  link('gap0', 'aisleS6');
  link('gap-8', 'aisleN6');
  link('gap-16', 'aisleN16');
  link('gap-24', 'aisleN24');
  link('gap8', 'aisleS6');
  link('gap16', 'aisleS16');
  link('gap24', 'aisleS24');
  chain('aisleN6', 'aisleN16', 'aisleN24', 'aisleN32', 'aisleN40');
  chain('aisleS6', 'aisleS16', 'aisleS24', 'aisleS32', 'aisleS40');
  link('flankN42', 'aisleN40');
  link('flankS42', 'aisleS40');
  // the heart
  link('aisleN6', 'underN');
  link('aisleS6', 'underS');
  chain('underN', 'under', 'underS');
  for (const u of ['underN', 'under', 'underS']) link(u, 'heart');
  link('rampX', 'aisleN6');
  link('rampX', 'aisleS6');
  link('rampX', 'bal');
  chain('bal', 'balN', 'balMidN');
  chain('bal', 'balS', 'balMidS');
  link('rampN', 'balMidN');
  link('rampS', 'balMidS');
  link('rampN', 'aisleN16');
  link('rampS', 'aisleS16');
  // the spine (zigzag round the blades) and the drops onto the balcony (one way)
  for (const [a, c] of [
    [-20, -16],
    [-12, -16],
    [-12, -8],
    [-4, -8],
    [-4, 0],
    [4, 0],
    [4, 8],
    [12, 8],
    [12, 16],
    [20, 16],
  ])
    link(`spine${a}`, `spineB${c}`);
  link('spineB-8', 'edgeN');
  link('spineB8', 'edgeS');
  link('edgeN', 'balN', true);
  link('edgeS', 'balS', true);
  // neck (north) and tail root (south)
  chain('spine-20', 'neck-26', 'neck-34', 'neckFoot', 'apron');
  chain('spine20', 'neck26', 'neck34', 'tailFoot');
  link('neckFoot', 'aisleN40');
  link('tailFoot', 'aisleS40');
  // skull
  chain('apron', 'foramen', 'skullIn', 'siteAN', 'jawIn', 'jawDoor', 'jawOut', 'jaw', 'jawN');
  link('skullIn', 'siteA');
  link('siteA', 'siteAE');
  link('siteAE', 'siteAN');
  link('jawOut', 'flankN42');
  link('jaw', 'flankN42');
  chain('jawN', 'templeOut', 'jaw');
  link('aisleN40', 'apron');
  // tail
  chain('tailFoot', 'hipGap', 'siteBN', 'siteBE', 'siteBS');
  link('siteBN', 'siteB');
  link('siteBE', 'siteB');
  link('aisleS40', 'hipGap');
  link('aisleS40', 'tailOut');
  chain('flankS42', 'tailOut', 'tailOut2', 'tailOut3', 'siteBS');
  link('tailOut2', 'siteBE');
  return wps;
};
