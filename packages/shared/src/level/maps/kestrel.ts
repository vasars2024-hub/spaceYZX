// "Kestrel" — the competitive map: one mirror-symmetric ship interior used by every mode.
// Team A (cyan) owns the -X half, team B (orange) the +X half. Three main paths join the
// two bases:
//   1. Main hall (normal gravity)            z ∈ [-12, 12]
//   2. Zero-G cargo shaft (north)            z ∈ [18, 54], corridors at z ∈ [26, 34]
//   3. Wall-gravity engine corridor (south)  z ∈ [-40, -28]
// Side connectors at |x| ≈ 25–34 link the main hall to the other two paths.
import type { Vec3 } from '../../math/vec3';
import { v3 } from '../../math/vec3';
import { LevelBuilder, type Face } from '../builder';
import type {
  GravityPadDef,
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
const VIOLET = 0xa46bff;
const WHITE = 0xd8e6ff;

type Hole = { u0: number; u1: number; v0: number; v1: number };
const FULL: Hole = { u0: -1e3, u1: 1e3, v0: -1e3, v1: 1e3 };

export const KESTREL = {
  halfX: 96,
  halfZ: 42,
  baseInner: 72, // |x| where the base rooms start
  towerX: 90,
  hallHalfZ: 12,
  height: 16,
  shaft: { x: 24, z0: 18, z1: 54, y0: -12, y1: 30 },
  north: { z0: 26, z1: 34, h: 6 },
  south: { z0: -40, z1: -28, h: 12 },
};

export const buildKestrel = (): LevelDef => {
  const b = new LevelBuilder();
  const K = KESTREL;
  const H = K.height;

  /** room() that accepts mirrored coordinates and mirrors hole faces too. */
  const room = (
    x0: number,
    x1: number,
    min: Omit<Vec3, 'x'>,
    max: Omit<Vec3, 'x'>,
    holes: Partial<Record<Face, Hole[]>>,
    mats: { floor?: Material; wall?: Material; ceiling?: Material; trim?: number } = {},
  ) => {
    const flip = x0 > x1;
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    const hs: Partial<Record<Face, Hole[]>> = {};
    for (const [k, v] of Object.entries(holes) as [Face, Hole[]][]) {
      let face = k;
      if (flip && k === '-x') face = '+x';
      else if (flip && k === '+x') face = '-x';
      // holes on y/z faces are given in x coordinates for the +X side: mirror them
      const hv =
        flip && (k === '+y' || k === '-y' || k === '+z' || k === '-z')
          ? v.map((h) => ({ u0: -h.u1, u1: -h.u0, v0: h.v0, v1: h.v1 }))
          : v;
      hs[face] = hv;
    }
    b.room(v3(lo, min.y, min.z), v3(hi, max.y, max.z), 1, hs, mats);
  };

  // ---------------- main hall (shared, centre) ----------------
  const connS = (s: number): Hole => ({ u0: s > 0 ? 22 : -28, u1: s > 0 ? 28 : -22, v0: 0, v1: 5 });
  const connN = (s: number): Hole => ({ u0: s > 0 ? 28 : -34, u1: s > 0 ? 34 : -28, v0: 0, v1: 5 });
  b.room(
    v3(-K.baseInner + 1, 0, -K.hallHalfZ),
    v3(K.baseInner - 1, H, K.hallHalfZ),
    1,
    { '-x': [FULL], '+x': [FULL], '+z': [connN(1), connN(-1)], '-z': [connS(1), connS(-1)] },
    { trim: VIOLET },
  );
  // centre: a low vaultable deck (the midpoint of the fastest route)
  b.box(v3(-4, 0, -3), v3(4, 1.2, 3), { mat: 'panel', trim: VIOLET });
  // ceiling zip-rail down the whole hall
  const rails = [{ points: [v3(-56, 13, 0), v3(56, 13, 0)] }];

  // ---------------- south engine corridor (shared) ----------------
  const S = K.south;
  b.room(
    v3(-K.baseInner + 1, 0, S.z0),
    v3(K.baseInner - 1, S.h, S.z1),
    1,
    { '-x': [FULL], '+x': [FULL], '+z': [connS(1), connS(-1)] },
    { wall: 'engine', trim: VIOLET },
  );
  // ---------------- zero-G shaft (shared) ----------------
  const SH = K.shaft;
  const nDoor: Hole = { u0: K.north.z0, u1: K.north.z1, v0: 0, v1: K.north.h };
  b.room(
    v3(-SH.x, SH.y0, SH.z0),
    v3(SH.x, SH.y1, SH.z1),
    1,
    { '-x': [nDoor], '+x': [nDoor] },
    { trim: WHITE },
  );
  // floating containers (hand-placed, mirror pairs + a centre stack)
  b.block(v3(0, 3, 36), v3(4, 3, 8), { mat: 'crate', trim: WHITE });
  b.block(v3(0, 18, 30), v3(6, 2, 3), { mat: 'crate' });
  b.block(v3(0, -6, 44), v3(3, 3, 3), { mat: 'crate' });

  const zones: GravityZoneDef[] = [
    {
      name: 'cargo-shaft',
      min: v3(-SH.x, SH.y0, SH.z0),
      max: v3(SH.x, SH.y1, SH.z1),
      gravity: v3(0, 0, 0),
    },
    {
      name: 'engine-ceiling',
      min: v3(-16, -1, S.z0),
      max: v3(16, S.h + 1, S.z1),
      gravity: v3(0, 1, 0),
      priority: 2,
    },
  ];
  const pads: GravityPadDef[] = [];
  const spawns: SpawnDef[] = [];
  const towers: TowerDef[] = [];
  const homes: Vec3[] = [];

  for (const s of [-1, 1] as const) {
    const team: 0 | 1 = s < 0 ? 0 : 1;
    const tc = s < 0 ? CYAN : ORANGE;
    const teamMat: Material = s < 0 ? 'teamA' : 'teamB';
    const X = (x: number) => s * x;

    // ---- base (spawn bay + Tower) ----
    room(
      X(K.baseInner),
      X(K.halfX),
      { y: 0, z: -K.halfZ },
      { y: H, z: K.halfZ },
      {
        '-x': [
          { u0: -8, u1: 8, v0: 0, v1: 10 },
          { u0: K.north.z0, u1: K.north.z1, v0: 0, v1: K.north.h },
          { u0: S.z0, u1: S.z1, v0: 0, v1: S.h },
        ],
      },
      { trim: tc },
    );
    b.box(v3(X(K.halfX - 0.3), 0, -K.halfZ), v3(X(K.halfX), 4, K.halfZ), {
      mat: teamMat,
      trim: tc,
    });
    // Tower: a solid column with emissive bands (the objective)
    b.block(v3(X(K.towerX), 3, 0), v3(2, 6, 2), { mat: teamMat, trim: tc });
    towers.push({ team, pos: v3(X(K.towerX), 0, 0), radius: 1.5, height: 6 });
    homes.push(v3(X(80), 0.9, 0));
    // base cover
    b.block(v3(X(78), 0.6, -12), v3(1.2, 1.2, 6), { trim: tc });
    b.block(v3(X(78), 0.6, 12), v3(1.2, 1.2, 6), { trim: tc });
    b.block(v3(X(86), 1.5, -22), v3(3, 3, 3), { mat: 'panel', trim: tc });
    b.block(v3(X(86), 1.5, 22), v3(3, 3, 3), { mat: 'panel', trim: tc });
    b.block(v3(X(76), 1.5, 24), v3(2, 3, 2), { mat: 'pillar' });
    b.block(v3(X(76), 1.5, -24), v3(2, 3, 2), { mat: 'pillar' });
    // spawns: 8 per side, facing the centre
    for (const [x, z] of [
      [80, -6],
      [80, 6],
      [84, -14],
      [84, 14],
      [88, -8],
      [88, 8],
      [82, -30],
      [82, 30],
    ] as const) {
      spawns.push({ pos: v3(X(x), 0, z), yawDeg: s < 0 ? -90 : 90, team });
    }

    // ---- main hall, this half ----
    for (const z of [-6, 6]) b.block(v3(X(56), H / 2, z), v3(1.6, H, 1.6), { mat: 'pillar' });
    b.block(v3(X(46), 0.6, 0), v3(1.2, 1.2, 7), { trim: tc }); // waist-high line
    b.block(v3(X(38), 1.5, -8), v3(3, 3, 3), { mat: 'crate' });
    b.block(v3(X(36), 1.5, 9), v3(2.4, 3, 2.4), { mat: 'crate' });
    b.block(v3(X(20), 2, 8), v3(4, 4, 1.2), { mat: 'panel', trim: tc });
    b.block(v3(X(20), 2, -8), v3(4, 4, 1.2), { mat: 'panel', trim: tc });
    b.block(v3(X(14), 0.5, 3), v3(1.4, 1, 1.4));
    b.block(v3(X(64), 1, -7), v3(2, 2, 2));
    b.block(v3(X(64), 1, 7), v3(2, 2, 2));
    // balconies along both long walls, reached by ramps
    for (const z of [-1, 1]) {
      const zc = z * (K.hallHalfZ - 1.75);
      b.box(v3(X(26), 6, zc - 1.75), v3(X(52), 6.6, zc + 1.75), { mat: 'floor', trim: tc });
      b.ramp('x', X(64), X(52), 0, 6.6, zc, 3.5, { mat: 'floor' });
    }

    // ---- north corridor + connector to the hall ----
    room(
      X(SH.x + 1),
      X(K.baseInner - 1),
      { y: 0, z: K.north.z0 },
      { y: K.north.h, z: K.north.z1 },
      { '-x': [FULL], '+x': [FULL], '-z': [{ u0: 28, u1: 34, v0: 0, v1: 5 }] },
      { trim: tc },
    );
    room(
      X(28),
      X(34),
      { y: 0, z: K.hallHalfZ + 1 },
      { y: 5, z: K.north.z0 - 1 },
      { '-z': [FULL], '+z': [FULL] },
      { trim: tc },
    );
    b.block(v3(X(50), 0.6, 32.5), v3(1.2, 1.2, 3), { trim: tc });

    // ---- south connector ----
    room(
      X(22),
      X(28),
      { y: 0, z: S.z1 + 1 },
      { y: 5, z: -K.hallHalfZ - 1 },
      { '-z': [FULL], '+z': [FULL] },
      { trim: tc },
    );
    // engine corridor features: conduits on the -z wall (a floor while gravity pulls into it)
    for (const x of [22, 34, 44])
      b.block(v3(X(x), 8, S.z0 + 0.6), v3(1.2, 4, 1.2), { mat: 'engine', trim: tc });
    b.block(v3(X(58), 1, -30.5), v3(2, 2, 4), { mat: 'crate' });
    // ceiling fins in the centre section (cover while gravity points up)
    b.block(v3(X(8), S.h - 0.75, -38), v3(1.2, 1.5, 3), { mat: 'engine', trim: VIOLET });

    zones.push({
      name: `engine-wall-${s < 0 ? 'a' : 'b'}`,
      min: v3(Math.min(X(16), X(48)), -1, S.z0),
      max: v3(Math.max(X(16), X(48)), S.h + 1, S.z1),
      gravity: v3(0, 0, -1),
      priority: 1,
    });
    // pad on the ceiling near the centre: flips the ceiling section back to a floor
    pads.push({
      min: v3(Math.min(X(12), X(15)), S.h - 2, -36),
      max: v3(Math.max(X(12), X(15)), S.h, -32),
      zone: 'engine-ceiling',
      gravity: v3(0, -1, 0),
      durationSec: 6,
      cooldownSec: 12,
    });
  }

  decorate(b, spawns);

  // ---------------- bot waypoint graph ----------------
  const names: string[] = [];
  const wps: WaypointDef[] = [];
  const add = (n: string, p: Vec3) => {
    names.push(n);
    wps.push({ pos: p, links: [] });
  };
  const link = (a: string, c: string, oneWay = false) => {
    const i = names.indexOf(a);
    const j = names.indexOf(c);
    if (i < 0 || j < 0) throw new Error(`waypoint ${i < 0 ? a : c} missing`);
    wps[i].links.push(j);
    if (!oneWay) wps[j].links.push(i);
  };
  add('M0', v3(0, 2.2, 0));
  add('S0', v3(0, 2, 30));
  add('SC', v3(0, S.h - 1, -34));
  for (const s of [-1, 1] as const) {
    const L = s < 0 ? 'A' : 'B';
    const X = (x: number) => s * x;
    add(`${L}.tower`, v3(X(86), 1, 0));
    add(`${L}.base`, v3(X(80), 1, 0));
    add(`${L}.baseN`, v3(X(82), 1, 30));
    add(`${L}.baseS`, v3(X(82), 1, -34));
    add(`${L}.doorM`, v3(X(68), 1, 0));
    add(`${L}.m1`, v3(X(50), 1, -5));
    add(`${L}.m1n`, v3(X(50), 1, 5));
    add(`${L}.m2`, v3(X(26), 1, -5));
    add(`${L}.m2n`, v3(X(31), 1, 6));
    add(`${L}.mc`, v3(X(10), 1, 0));
    add(`${L}.conN`, v3(X(31), 1, 19));
    add(`${L}.doorN`, v3(X(68), 1, 30));
    add(`${L}.n1`, v3(X(45), 1, 30));
    add(`${L}.n2`, v3(X(31), 1, 30));
    add(`${L}.n3`, v3(X(22), 2, 30));
    add(`${L}.conS`, v3(X(25), 1, -20));
    add(`${L}.doorS`, v3(X(68), 1, -34));
    add(`${L}.s1`, v3(X(54), 1, -34));
    add(`${L}.s2`, v3(X(40), 3, S.z0 + 1));
    add(`${L}.s3`, v3(X(25), 3, S.z0 + 1));
    add(`${L}.s4`, v3(X(12), S.h - 1, -34));
    for (const [a, c] of [
      ['tower', 'base'],
      ['base', 'doorM'],
      ['base', 'baseN'],
      ['base', 'baseS'],
      ['baseN', 'doorN'],
      ['baseS', 'doorS'],
      ['doorM', 'm1'],
      ['m1', 'm2'],
      ['doorM', 'm1n'],
      ['m1n', 'm2n'],
      ['m2', 'mc'],
      ['m2n', 'mc'],
      ['m2', 'conS'],
      ['m2n', 'conN'],
      ['conN', 'n2'],
      ['doorN', 'n1'],
      ['n1', 'n2'],
      ['n2', 'n3'],
      ['doorS', 's1'],
      ['s1', 's2'],
      ['s2', 's3'],
      ['s3', 's4'],
    ])
      link(`${L}.${a}`, `${L}.${c}`);
    link(`${L}.conS`, `${L}.s3`, true); // a drop onto the wall: no way back up
    link(`${L}.mc`, 'M0');
    link(`${L}.n3`, 'S0');
    link(`${L}.s4`, 'SC');
  }

  return b.build({
    name: 'Kestrel',
    boundsMin: v3(-K.halfX - 2, SH.y0 - 2, -K.halfZ - 2),
    boundsMax: v3(K.halfX + 2, SH.y1 + 2, SH.z1 + 2),
    defaultGravity: v3(0, -1, 0),
    zones,
    rails,
    pads,
    spawns,
    towers,
    controllerHomes: homes,
    waypoints: wps,
    areas: [
      { name: 'Cyan base', pos: v3(-80, 0, 0), yawDeg: -90 },
      { name: 'Orange base', pos: v3(80, 0, 0), yawDeg: 90 },
      { name: 'Main hall', pos: v3(-40, 0, 0), yawDeg: -90 },
      { name: 'Cargo shaft', pos: v3(-30, 0, 30), yawDeg: -90 },
      { name: 'Engine corridor', pos: v3(-60, 0, -34), yawDeg: -90 },
    ],
    fog: { color: 0x060912, near: 40, far: 170 },
    ambient: 0.85,
    lights: kestrelLights(),
    sideTint: { neg: 0x1d6a80, pos: 0x86501f, amount: 0.16 },
  });
};

/** Atmospheric lights (mirror pairs). Strip lights add their own small lights automatically. */
const kestrelLights = (): LightDef[] => {
  const K = KESTREL;
  const WARM = 0xffe0b0;
  const COOL = 0xbcd4ff;
  const out: LightDef[] = [];
  for (const s of [-1, 1] as const) {
    const X = (x: number) => s * x;
    const tc = s < 0 ? CYAN : ORANGE;
    // base: team spotlight on the Tower, cool fill lights over the spawns
    out.push({ pos: v3(X(K.towerX), 13, 0), color: tc, radius: 20, intensity: 1.8, shaft: true });
    for (const z of [-22, 22])
      out.push({ pos: v3(X(82), 14, z), color: COOL, radius: 21, intensity: 1.3, shaft: true });
    out.push({ pos: v3(X(80), 3, -36), color: tc, radius: 8, intensity: 0.8 });
    out.push({ pos: v3(X(80), 3, 36), color: tc, radius: 8, intensity: 0.8 });
    // main hall: warm ceiling lamps with light shafts
    for (const x of [8, 24, 40, 56])
      out.push({ pos: v3(X(x), 14.5, 0), color: WARM, radius: 22, intensity: 1.4, shaft: true });
    out.push({ pos: v3(X(66), 9, 0), color: tc, radius: 10, intensity: 0.9 }); // door glow
    // north corridor + connectors
    out.push({ pos: v3(X(48), 5, 30), color: COOL, radius: 11, intensity: 0.9 });
    out.push({ pos: v3(X(31), 4, 19), color: COOL, radius: 8, intensity: 0.7 });
    out.push({ pos: v3(X(25), 4, -20), color: 0xff7a4a, radius: 8, intensity: 0.7 });
    // engine corridor: hot red-orange
    for (const x of [30, 55])
      out.push({ pos: v3(X(x), 9, -34), color: 0xff5a3c, radius: 13, intensity: 1.0 });
    // cargo shaft: violet
    out.push({ pos: v3(X(16), 6, 30), color: VIOLET, radius: 16, intensity: 1.0 });
    out.push({ pos: v3(X(12), 22, 44), color: VIOLET, radius: 16, intensity: 0.9 });
  }
  out.push({ pos: v3(0, 2, -34), color: 0xff5a3c, radius: 12, intensity: 1.0 });
  out.push({ pos: v3(0, -6, 26), color: VIOLET, radius: 14, intensity: 0.9 });
  return out;
};

/**
 * Visual detail only (no collision): ceiling light strips, wall ribs, floor guide lines,
 * team banners, engine vents and pipes, shaft light rings, spawn pads, base windows.
 * Every piece is placed as a mirror pair so the map stays symmetric.
 */
const decorate = (b: LevelBuilder, spawns: SpawnDef[]): void => {
  const K = KESTREL;
  const S = K.south;
  const SH = K.shaft;
  const H = K.height;
  const deco = (
    min: Vec3,
    max: Vec3,
    mat: Material,
    extra: { color?: number; trim?: number } = {},
  ) => b.box(min, max, { mat, noCollide: true, ...extra });
  const LIGHT = 0x9fc4e8;
  for (const s of [-1, 1] as const) {
    const X = (x: number) => s * x;
    const tc = s < 0 ? CYAN : ORANGE;
    const teamMat: Material = s < 0 ? 'teamA' : 'teamB';
    // main hall: ceiling light strips
    for (let x = 6; x < 66; x += 12)
      for (const z of [-4, 4])
        deco(v3(X(x), H - 0.12, z - 0.25), v3(X(x + 8), H - 0.02, z + 0.25), 'trim', {
          color: LIGHT,
        });
    // main hall: wall ribs every 8 m
    for (let x = 4; x < 70; x += 8)
      for (const z of [-1, 1]) {
        const zi = z * K.hallHalfZ;
        deco(v3(X(x) - 0.3, 0, zi - z * 0.35), v3(X(x) + 0.3, H, zi), 'pillar');
      }
    // main hall: team guide lines on the floor, leading home
    for (const z of [-10.6, 10.6])
      deco(v3(X(12), 0.005, z - 0.08), v3(X(66), 0.02, z + 0.08), 'trim', { color: tc });
    // team banner above each base door (hall side)
    deco(v3(X(K.baseInner - 1.15), 10.5, -6), v3(X(K.baseInner - 1), 14.5, 6), teamMat, {
      trim: tc,
    });
    // engine corridor: glowing vents along the outer wall and pipes along the inner one
    for (let x = 18; x < 70; x += 6)
      deco(v3(X(x), 10.4, S.z0 + 0.02), v3(X(x + 3), 11.2, S.z0 + 0.12), 'trim', {
        color: 0xff5a3c,
      });
    deco(v3(X(1), S.h - 1.2, S.z1 - 0.6), v3(X(70), S.h - 0.6, S.z1 - 0.05), 'engine');
    deco(v3(X(1), 0.3, S.z1 - 0.6), v3(X(70), 0.8, S.z1 - 0.05), 'engine');
    // shaft: light rings on the two long walls
    for (const y of [-6, 6, 18])
      deco(v3(X(0.5), y, SH.z1 - 0.12), v3(X(SH.x), y + 0.3, SH.z1 - 0.02), 'trim', {
        color: WHITE,
      });
    for (const y of [-6, 6, 18])
      deco(v3(X(SH.x - 0.12), y, SH.z0), v3(X(SH.x - 0.02), y + 0.3, K.north.z0 - 0.5), 'trim', {
        color: WHITE,
      });
    // bases: window strip on the back wall and a lit floor ring around the Tower
    deco(v3(X(K.halfX - 0.35), 8, -30), v3(X(K.halfX - 0.3), 12, 30), 'glass', {
      color: 0x1a3550,
      trim: tc,
    });
    deco(v3(X(K.towerX - 2.6), 0.005, -2.6), v3(X(K.towerX + 2.6), 0.02, 2.6), 'trim', {
      color: tc,
    });
    deco(v3(X(K.towerX - 2.45), 0.006, -2.45), v3(X(K.towerX + 2.45), 0.025, 2.45), 'floor');
  }
  // spawn pads
  for (const sp of spawns)
    deco(
      v3(sp.pos.x - 0.6, 0.004, sp.pos.z - 0.6),
      v3(sp.pos.x + 0.6, 0.016, sp.pos.z + 0.6),
      'trim',
      {
        color: sp.team === 0 ? 0x0f5c6b : 0x6b3e10,
      },
    );
};
