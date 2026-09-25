// "Kestrel" — the competitive map: one mirror-symmetric warship interior used by every mode.
// Team A (cyan) owns the -X half, team B (orange) the +X half. Three lanes join the bases,
// each with its own gravity and its own heights, plus shortcuts between them:
//
//   MAIN (z ≈ -12..16, normal gravity)   Hangar → Airlock (choke) → Atrium (two levels) →
//        Trench below / Gallery above (drop-downs through the colonnade) → Reactor room (mid:
//        raised core platform, north balcony, zip-rails across)
//   NORTH (z ≈ 20..56, raised)           Hangar → Cargo bay (containers, ramp up to the
//        loading dock, y 3) → Conveyor corridor (y 3) → zero-G Cargo shaft (mid)
//   SOUTH (z ≈ -44..-20, wall gravity)   Hangar → Turbine hall (turbine slalom + gantry) →
//        Engine corridor: walk the wall, then the ceiling (mid), flip pad
//
//   Connectors: Gallery ramps down to the conveyor corridor (north); Trench drops into the
//   engine corridor (south); a crouch vent joins the Atrium and the Turbine hall.
//
// Layout rules (see docs/PLAYING.md and the map report, `npm run map`): mirror-symmetric;
// cover is either half (≤ 1.25 m: vault over, see over while standing) or full (≥ 2 m) —
// nothing in between (no head-glitch spots); no lane sees into a spawn; every lane has one
// choke per base that its defenders reach first.
import type { Vec3 } from '../../math/vec3';
import { v3 } from '../../math/vec3';
import { qFromAxisAngle } from '../../math/quat';
import { LevelBuilder, type Face } from '../builder';
import type {
  GravityPadDef,
  GravityZoneDef,
  LevelDef,
  LightDef,
  Material,
  RailDef,
  SpawnDef,
  TowerDef,
  WaypointDef,
} from '../types';

const CYAN = 0x19e3ff;
const ORANGE = 0xff8a1f;
const VIOLET = 0xa46bff;
const WHITE = 0xd8e6ff;
const ENGINE_RED = 0xff5a3c;

type Hole = { u0: number; u1: number; v0: number; v1: number };
const FULL: Hole = { u0: -1e3, u1: 1e3, v0: -1e3, v1: 1e3 };

/** Key coordinates (the +X half; the -X half is the mirror image). */
export const KESTREL = {
  halfX: 98,
  towerX: 88,
  hangar: { x0: 76, x1: 98, z: 34, h: 16 },
  airlock: { x0: 69, x1: 75, z: 5, h: 6 },
  atrium: { x0: 47, x1: 68, z0: -16, z1: 16, h: 14 },
  trench: { x0: 21, x1: 46, z0: -12, z1: 16, h: 12 },
  /** the upper level of the main lane (gallery, atrium shelf, reactor balcony) */
  upperY: 6,
  reactor: { x: 20, z0: -18, z1: 18, h: 16 },
  cargo: { x0: 51, x1: 75, z0: 20, z1: 42, h: 12, dockY: 3 },
  conveyor: { x0: 27, x1: 50, z0: 32, z1: 40, y0: 3, h: 6 },
  shaft: { x: 26, z0: 20, z1: 56, y0: -12, y1: 30 },
  turbine: { x0: 49, x1: 75, z0: -44, z1: -20, h: 14 },
  south: { x: 48, z0: -40, z1: -28, h: 12 },
};

export const buildKestrel = (): LevelDef => {
  const b = new LevelBuilder();
  const K = KESTREL;
  const U = K.upperY;

  /**
   * room() that takes +X-side coordinates for x0/x1 (pass X(x0), X(x1)) and mirrors the
   * hole faces for the -X side. Holes on ±y/±z faces are given in +X-side x coordinates.
   */
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
      const hv =
        flip && (k === '+y' || k === '-y' || k === '+z' || k === '-z')
          ? v.map((h) => ({ u0: -h.u1, u1: -h.u0, v0: h.v0, v1: h.v1 }))
          : v;
      hs[face] = hv;
    }
    b.room(v3(lo, min.y, min.z), v3(hi, max.y, max.z), 1, hs, mats);
  };

  const zones: GravityZoneDef[] = [];
  const pads: GravityPadDef[] = [];
  const rails: RailDef[] = [];
  const spawns: SpawnDef[] = [];
  const towers: TowerDef[] = [];
  const homes: Vec3[] = [];

  // ================= shared middle: Reactor room, Cargo shaft, Engine corridor =================
  const R = K.reactor;
  // doorways in the reactor's side walls (shared with each Trench): ground + gallery level
  const shaftWindow: Hole = { u0: -8, u1: 8, v0: U + 1, v1: U + 8 };
  const reactorSide: Hole[] = [
    { u0: -6, u1: 4, v0: 0, v1: 9 },
    { u0: 10, u1: 16, v0: U, v1: U + 5 },
  ];
  // the atrium opens into the trench on its south side, the trench into the reactor in the
  // middle: the lane bends, so nothing sees from one base's atrium to the other's
  const trenchEast: Hole[] = [
    { u0: -12, u1: -4, v0: 0, v1: 7 },
    { u0: 8, u1: 16, v0: U, v1: U + 5 },
  ];
  b.room(
    v3(-R.x, 0, R.z0),
    v3(R.x, R.h, R.z1),
    1,
    // + a big opening from the balcony into the zero-G cargo shaft (a view, and a way in)
    { '-x': reactorSide, '+x': reactorSide, '+z': [shaftWindow] },
    { trim: VIOLET },
  );
  // the raised core platform (ramps on the lane sides, climbable on the others)
  b.box(v3(-7, 0, -6), v3(7, 2, 6), { mat: 'panel', trim: VIOLET });
  b.ramp('x', -11, -7, 0, 2, 0, 6, { mat: 'floor' });
  b.ramp('x', 11, 7, 0, 2, 0, 6, { mat: 'floor' });
  // the reactor core: a column from the platform to the ceiling
  b.box(v3(-3, 2, -3.5), v3(3, R.h, 3.5), { mat: 'engine', trim: VIOLET });
  // north balcony (the upper level through mid), with a railing and a gap to drop from
  b.box(v3(-R.x, U - 0.5, 10), v3(R.x, U, R.z1), { mat: 'floor', trim: VIOLET });
  b.box(v3(-R.x, U, 10), v3(-4, U + 0.6, 10.2), { mat: 'pillar' });
  b.box(v3(4, U, 10), v3(R.x, U + 0.6, 10.2), { mat: 'pillar' });
  // control booth in the middle of the balcony: no line runs along the whole upper level
  b.box(v3(-2.5, U, 10.6), v3(2.5, U + 3.5, 14), { mat: 'panel', trim: VIOLET });
  // balcony supports
  for (const x of [-12, 12]) b.box(v3(x - 0.5, 0, 10), v3(x + 0.5, U - 0.5, 11), { mat: 'pillar' });
  // a coolant pump under the balcony: cover on the strip of floor below it
  b.box(v3(-1.5, 0, 14.5), v3(1.5, 2.5, 17.5), { mat: 'engine', trim: VIOLET });
  // chamfered south corners: the reactor reads as an octagonal chamber
  for (const sx of [-1, 1])
    b.boxes.push({
      c: v3(sx * (R.x - 3), R.h / 2, R.z0 + 3),
      h: v3(4.3, R.h / 2, 0.6),
      q: qFromAxisAngle(v3(0, 1, 0), (sx * Math.PI) / 4),
      mat: 'hull',
      trim: VIOLET,
    });

  // ---- Cargo shaft (zero-G) ----
  const SH = K.shaft;
  const CV = K.conveyor;
  const shaftDoor: Hole = { u0: CV.z0, u1: CV.z1, v0: CV.y0, v1: CV.y0 + CV.h };
  b.room(
    v3(-SH.x, SH.y0, SH.z0),
    v3(SH.x, SH.y1, SH.z1),
    1,
    { '-x': [shaftDoor], '+x': [shaftDoor], '-z': [shaftWindow] },
    { trim: WHITE },
  );
  // a container floating right in line with both doors (no straight shot through the shaft)
  b.block(v3(0, CV.y0 + 3, 36), v3(4, 6, 8), { mat: 'crate', trim: WHITE });
  b.block(v3(0, 20, 30), v3(6, 2, 3), { mat: 'crate' });
  b.block(v3(0, -6, 44), v3(3, 3, 3), { mat: 'crate' });
  b.block(v3(0, 12, 46), v3(4, 3, 8), { mat: 'crate', trim: WHITE });
  // a girder across the shaft: push off it, hide behind it
  b.block(v3(0, 14, 36), v3(2 * SH.x, 1, 1), { mat: 'pillar' });
  zones.push({
    name: 'cargo-shaft',
    min: v3(-SH.x, SH.y0, SH.z0),
    max: v3(SH.x, SH.y1, SH.z1),
    gravity: v3(0, 0, 0),
  });

  // ---- Engine corridor (wall gravity, ceiling in the middle) ----
  const S = K.south;
  b.room(
    v3(-S.x, 0, S.z0),
    v3(S.x, S.h, S.z1),
    1,
    { '-x': [FULL], '+x': [FULL], '+z': [connS(1), connS(-1)] },
    { wall: 'engine', trim: VIOLET },
  );
  // a turbine hanging from the ceiling in the middle (cover while the ceiling is the floor),
  // and its machinery base on the floor below (blocks the corridor's long line; cover when
  // the flip pad drops everyone to the floor, with a gap along the inner wall)
  b.block(v3(0, S.h - 1.5, -34), v3(4, 3, 5), { mat: 'engine', trim: VIOLET });
  b.box(v3(-2, 0, S.z0), v3(2, 6, -31), { mat: 'engine', trim: VIOLET });
  zones.push({
    name: 'engine-ceiling',
    min: v3(-16, -1, S.z0),
    max: v3(16, S.h + 1, S.z1),
    gravity: v3(0, 1, 0),
    priority: 2,
  });

  // =============================== each half ===============================
  for (const s of [-1, 1] as const) {
    const team: 0 | 1 = s < 0 ? 0 : 1;
    const tc = s < 0 ? CYAN : ORANGE;
    const teamMat: Material = s < 0 ? 'teamA' : 'teamB';
    const X = (x: number) => s * x;
    /** box from +X-side corners */
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o = {}) =>
      b.box(v3(X(x0), y0, z0), v3(X(x1), y1, z1), { mat: 'crate', ...o });

    // ---------------- Hangar (base): Tower, ready deck, spawns ----------------
    const HG = K.hangar;
    const hangarDoors: Hole[] = [
      { u0: -K.airlock.z, u1: K.airlock.z, v0: 0, v1: K.airlock.h }, // main (airlock)
      { u0: 22, u1: 30, v0: 0, v1: 6 }, // north (cargo bay)
      { u0: -30, u1: -22, v0: 0, v1: 6 }, // south (turbine hall)
    ];
    room(
      X(HG.x0),
      X(HG.x1),
      { y: 0, z: -HG.z },
      { y: HG.h, z: HG.z },
      { '-x': hangarDoors },
      {
        trim: tc,
      },
    );
    box(HG.x1 - 0.3, 0, -HG.z, HG.x1, 4, HG.z, { mat: teamMat, trim: tc });
    // the Tower (the objective)
    b.block(v3(X(K.towerX), 3, 0), v3(2, 6, 2), { mat: teamMat, trim: tc });
    towers.push({ team, pos: v3(X(K.towerX), 0, 0), radius: 1.5, height: 6 });
    homes.push(v3(X(84), 0.9, 0));
    // blast barricade in front of the main door: nothing sees into the hangar from the lanes
    box(80, 0, -8, 81.5, 6, 8, { mat: 'panel', trim: tc });
    // baffles inside the side doors
    box(79, 0, 12, 80, 6, 29.5, { mat: 'panel', trim: tc });
    box(79, 0, -29.5, 80, 6, -12, { mat: 'panel', trim: tc });
    // ready deck along the back wall (spawns up here), ramps down at both ends, railing
    const deckY = 5;
    box(92, deckY - 0.5, -HG.z, HG.x1, deckY, HG.z, { mat: 'floor', trim: tc });
    b.ramp('x', X(92), X(84), deckY, 0, 30, 4, { mat: 'floor' });
    b.ramp('x', X(92), X(84), deckY, 0, -30, 4, { mat: 'floor' });
    box(91.8, deckY, -27.8, 92, deckY + 0.6, 27.8, { mat: 'pillar' }); // (a kick-rail: no chest cover)
    for (const z of [-22, -11, 11, 22])
      box(92, 0, z - 0.4, 92.8, deckY - 0.5, z + 0.4, { mat: 'pillar' });
    // hangar cover
    box(85, 0, 13, 87, 2, 15, { mat: 'crate', trim: tc });
    box(85, 0, -15, 87, 2, -13, { mat: 'crate', trim: tc });
    // spawns: 4 on the ready deck, 4 on the floor behind the barricade
    for (const [x, y, z] of [
      [95, deckY, -6],
      [95, deckY, 6],
      [95, deckY, -16],
      [95, deckY, 16],
      [85, 0, -5],
      [85, 0, 5],
      [90, 0, -12],
      [90, 0, 12],
    ] as const)
      spawns.push({ pos: v3(X(x), y, z), yawDeg: s < 0 ? -90 : 90, team });

    // ---------------- Airlock (the main lane's choke) ----------------
    const AL = K.airlock;
    const airlockDoor: Hole = { u0: -AL.z, u1: AL.z, v0: 0, v1: AL.h };
    room(
      X(AL.x0),
      X(AL.x1),
      { y: 0, z: -AL.z },
      { y: AL.h, z: AL.z },
      {
        '-x': [airlockDoor],
        '+x': [airlockDoor],
      },
      { trim: tc },
    );

    // ---------------- Atrium: two levels, a ramp, a drop, a vent ----------------
    const AT = K.atrium;
    room(
      X(AT.x0),
      X(AT.x1),
      { y: 0, z: AT.z0 },
      { y: AT.h, z: AT.z1 },
      {
        '-x': trenchEast, // down into the trench (south side), onto the gallery (north)
        '+x': [airlockDoor],
        '-z': [{ u0: 50, u1: 53, v0: 0, v1: 1.3 }], // crouch vent to the turbine hall
      },
      { trim: tc },
    );
    // the upper shelf (continues the gallery), its railing, and the ramp down to the airlock
    box(AT.x0, 0, 6, 56, U, AT.z1, { mat: 'panel' });
    box(AT.x0, U, 6, 56, U + 0.6, 6.2, { mat: 'pillar' });
    b.ramp('x', X(56), X(66), U, 0, 13.5, 5, { mat: 'floor' });
    // atrium floor cover: a low console, a crate stack, a pillar
    box(52, 0, 0, 56, 1.2, 2, { mat: 'panel', trim: tc });
    box(60, 0, -14, 63, 3, -11, { mat: 'crate' });

    // crouch vent (Atrium ↔ Turbine hall): slide through it. Its two ends are 7 m apart along a
    // 2 m deep tunnel, so no straight line runs through it (a crouched player can't watch the
    // other room from inside while standing players can't see in)
    room(
      X(50),
      X(63),
      { y: 0, z: -19 },
      { y: 1.3, z: -17 },
      {
        '-z': [{ u0: 60, u1: 63, v0: 0, v1: 1.3 }],
        '+z': [{ u0: 50, u1: 53, v0: 0, v1: 1.3 }],
      },
      { trim: tc },
    );

    // ---------------- Trench (ground) + Gallery (upper) ----------------
    const TR = K.trench;
    room(
      X(TR.x0),
      X(TR.x1),
      { y: 0, z: TR.z0 },
      { y: TR.h, z: TR.z1 },
      {
        '-x': reactorSide,
        '+x': trenchEast,
        '+z': [{ u0: 28, u1: 34, v0: U, v1: U + 5 }], // north connector (gallery level)
        '-z': [{ u0: 30, u1: 36, v0: 0, v1: 5 }], // south connector
      },
      { trim: tc },
    );
    // the gallery: a raised walkway along the north side, a colonnade and a kick-rail on its
    // edge (step over it to drop into the trench)
    box(TR.x0, 0, 4, TR.x1, U, TR.z1, { mat: 'panel' });
    box(TR.x0, U, 4, TR.x1, U + 0.6, 4.2, { mat: 'pillar' });
    for (const x of [26, 32, 38, 44])
      box(x - 0.4, U + 0.6, 4, x + 0.4, TR.h, 4.6, { mat: 'pillar', trim: tc });
    // a bulkhead half across the gallery (pass on the colonnade side)
    box(36, U, 10.5, 37, TR.h, TR.z1, { mat: 'hull', trim: tc });
    // trench cover: staggered so no line runs the whole lane
    box(27, 0, -9, 28.2, 1.2, -5, { mat: 'panel' });
    box(36, 0, -12, 38.5, 2.5, -8.5, { mat: 'crate', trim: tc });
    box(40, 0, -3, 42, 1.2, 0, { mat: 'crate' });
    box(31, 0, 0, 34, 1.2, 1.2, { mat: 'panel' });

    // ---------------- North connector: Gallery ramps down to the conveyor corridor ----------------
    room(
      X(28),
      X(34),
      { y: CV.y0, z: TR.z1 + 1 },
      { y: U + 5, z: CV.z0 - 1 },
      {
        '-z': [{ u0: 28, u1: 34, v0: U, v1: U + 5 }],
        '+z': [{ u0: 28, u1: 34, v0: CV.y0, v1: CV.y0 + 5 }],
      },
      { trim: tc },
    );
    b.ramp('z', TR.z1 + 1, CV.z0 - 1, U, CV.y0, X(31), 6, { mat: 'floor' });

    // ---------------- Cargo bay: containers, loading dock ----------------
    const CB = K.cargo;
    room(
      X(CB.x0),
      X(CB.x1),
      { y: 0, z: CB.z0 },
      { y: CB.h, z: CB.z1 },
      {
        '+x': [{ u0: 22, u1: 30, v0: 0, v1: 6 }],
        '-x': [{ u0: CV.z0, u1: CV.z1, v0: CB.dockY, v1: CB.dockY + CV.h }],
      },
      { trim: tc },
    );
    // loading dock (y 3) along the north wall and the ramp up to it
    box(CB.x0, 0, 32, 70, CB.dockY, CB.z1, { mat: 'floor', trim: tc });
    b.ramp('z', 26, 32, 0, CB.dockY, X(64), 4, { mat: 'floor' });
    // containers: one screens the hangar door, one splits the floor
    box(66, 0, 22.5, 72, 3, 26, { mat: 'crate', trim: tc });
    box(55, 0, 21, 59, 6, 26, { mat: 'crate' });
    box(53, 0, 28, 54.5, 1.2, 31, { mat: 'crate' }); // a step up to the dock
    box(57, CB.dockY, 35, 59, CB.dockY + 2, 37, { mat: 'crate', trim: tc });
    box(66, CB.dockY, 39, 67.2, CB.dockY + 1.2, 42, { mat: 'panel' });

    // ---------------- Conveyor corridor (raised, y 3) ----------------
    room(
      X(CV.x0),
      X(CV.x1),
      { y: CV.y0, z: CV.z0 },
      { y: CV.y0 + CV.h, z: CV.z1 },
      {
        '-x': [shaftDoor],
        '+x': [{ u0: CV.z0, u1: CV.z1, v0: CV.y0, v1: CV.y0 + CV.h }],
        '-z': [{ u0: 28, u1: 34, v0: CV.y0, v1: CV.y0 + 5 }],
      },
      { trim: tc },
    );
    // two offset partitions: the corridor zigzags (no straight shot from the shaft into the bay)
    box(37, CV.y0, CV.z0, 38, CV.y0 + CV.h, 37, { mat: 'hull', trim: tc });
    box(43, CV.y0, 35, 44, CV.y0 + CV.h, CV.z1, { mat: 'hull', trim: tc });
    box(30, CV.y0, 38, 32, CV.y0 + 2, 40, { mat: 'crate' });

    // shaft containers (mirror pairs)
    b.block(v3(X(12), 9, 46), v3(4, 3, 6), { mat: 'crate', trim: WHITE });
    b.block(v3(X(9), -3, 30), v3(3, 3, 3), { mat: 'crate' });
    b.block(v3(X(16), 17, 50), v3(5, 3, 3), { mat: 'crate' });
    b.block(v3(X(7), 24, 40), v3(3, 3, 3), { mat: 'crate', trim: WHITE });
    b.block(v3(X(18), 4, 52), v3(3, 3, 3), { mat: 'crate' });
    b.block(v3(X(14), 0, 25), v3(3, 3, 3), { mat: 'crate' });

    // ---------------- Turbine hall: turbines, gantry ----------------
    const TH = K.turbine;
    room(
      X(TH.x0),
      X(TH.x1),
      { y: 0, z: TH.z0 },
      { y: TH.h, z: TH.z1 },
      {
        '+x': [{ u0: -30, u1: -22, v0: 0, v1: 6 }],
        '-x': [{ u0: S.z0, u1: S.z1, v0: 0, v1: S.h }],
        '+z': [{ u0: 60, u1: 63, v0: 0, v1: 1.3 }], // crouch vent
      },
      { trim: tc },
    );
    box(54, 0, TH.z0, 59, 12, -31, { mat: 'engine', trim: ENGINE_RED });
    box(63, 0, -34, 69, 12, -24, { mat: 'engine', trim: ENGINE_RED });
    // gantry along the north wall (y 5) with its ramp and railing
    box(TH.x0, 4.5, -24, 66, 5, TH.z1, { mat: 'floor', trim: tc });
    b.ramp('x', X(66), X(74), 5, 0, -22, 4, { mat: 'floor' });
    box(TH.x0, 5, -24.2, 62, 5.6, -24, { mat: 'pillar' });
    box(60, 0, -42, 61.2, 1.2, -38, { mat: 'panel' });

    // ---------------- South connector: Trench → engine wall ----------------
    room(
      X(30),
      X(36),
      { y: 0, z: S.z1 + 1 },
      { y: 5, z: TR.z0 - 1 },
      {
        '-z': [FULL],
        '+z': [FULL],
      },
      { trim: tc },
    );

    // engine corridor: coolant tanks on the -z wall (the floor while gravity pulls into it),
    // one hugging its lower edge, one its upper edge — wall-walkers slalom between them and
    // no line runs down the corridor; small conduits for half cover
    box(28, 0, S.z0, 33, 7, S.z0 + 3, { mat: 'engine', trim: ENGINE_RED });
    box(38, 5, S.z0, 43, S.h, S.z0 + 3, { mat: 'engine', trim: ENGINE_RED });
    // a support rib at the corridor mouth along its inner wall (the wall-walkers' ceiling side)
    box(45, 0, S.z1 - 3, 48, S.h, S.z1, { mat: 'hull', trim: tc });
    b.block(v3(X(21), 6, S.z0 + 0.6), v3(1.2, 4, 1.2), { mat: 'engine', trim: tc });
    b.block(v3(X(46), 5, S.z0 + 0.6), v3(1.2, 4, 1.2), { mat: 'engine', trim: tc });
    b.block(v3(X(8), S.h - 0.75, -38), v3(1.2, 1.5, 3), { mat: 'engine', trim: VIOLET });
    zones.push({
      name: `engine-wall-${s < 0 ? 'a' : 'b'}`,
      min: v3(Math.min(X(16), X(S.x)), -1, S.z0),
      max: v3(Math.max(X(16), X(S.x)), S.h + 1, S.z1),
      gravity: v3(0, 0, -1),
      priority: 1,
    });
    // pad on the ceiling near the middle: flips the ceiling section back to a floor
    pads.push({
      min: v3(Math.min(X(12), X(15)), S.h - 2, -36),
      max: v3(Math.max(X(12), X(15)), S.h, -32),
      zone: 'engine-ceiling',
      gravity: v3(0, -1, 0),
      durationSec: 6,
      cooldownSec: 12,
    });

    // zip-rail across the reactor room: from the north balcony over the floor to the south
    rails.push({ points: [v3(X(12), U + 3.5, 15), v3(X(12), U + 3.5, -16)] });
  }

  decorate(b, spawns);

  // ======================= bot waypoint graph =======================
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
  // lane middles: reactor floor (both sides of the platform), shaft, engine ceiling
  add('M0n', v3(0, 1, 9));
  add('M0s', v3(0, 1, -9));
  add('S0', v3(0, 10.5, 31));
  add('SC', v3(0, S.h - 1, -38.5));
  add('rWin', v3(0, U + 2, 16)); // reactor balcony, at the window into the shaft
  for (const s of [-1, 1] as const) {
    const L = s < 0 ? 'A' : 'B';
    const X = (x: number) => s * x;
    const w = (n: string, x: number, y: number, z: number) => add(`${L}.${n}`, v3(X(x), y, z));
    // hangar: around the barricade, through the baffles
    w('tower', 84.5, 1, 0);
    w('base', 84, 1, -4);
    w('bN1', 84, 1, 11);
    w('bN2', 78, 1, 11);
    w('bS1', 84, 1, -11);
    w('bS2', 78, 1, -11);
    w('dIn', 77.5, 1, 0);
    w('baseN', 84, 1, 22);
    w('nCorner', 81, 1, 31.5);
    w('nIn', 77.5, 1, 30.5);
    w('baseS', 84, 1, -22);
    w('sCorner', 81, 1, -31.5);
    w('sIn', 77.5, 1, -30.5);
    // main lane: airlock, atrium, trench, reactor floor
    w('air', 72, 1, 0);
    w('atr', 62, 1, 0);
    w('atrW', 50, 1, -8);
    w('tr1', 43, 1, -8);
    w('tr2', 30, 1, -3);
    w('trS', 33, 1, -10);
    w('rIn', 17, 1, -1);
    w('rN', 12, 1, 7.5);
    w('rS', 12, 1, -8);
    // upper level: atrium ramp, shelf, gallery, reactor balcony
    w('atrRamp', 67, 1, 13.5);
    w('shelf', 55, U + 1, 13.5);
    w('galE', 40, U + 1, 8);
    w('gal', 31, U + 1, 12);
    w('balc', 14, U + 1, 14);
    // north lane: cargo bay, dock, conveyor, shaft door, connector down from the gallery
    w('cbDoor', 73, 1, 27);
    w('cbRamp', 64, 1, 27);
    w('dock', 64, CV.y0 + 1.5, 34.5);
    w('dockW', 53, CV.y0 + 1, 34);
    w('cv1', 47, CV.y0 + 1, 34);
    w('cvMid', 40.5, CV.y0 + 1, 34);
    w('cvMid2', 40.5, CV.y0 + 1, 38.5);
    w('cv2', 34, CV.y0 + 1, 38);
    w('cvN', 31, CV.y0 + 1, 33.5);
    w('shaft', 23, CV.y0 + 2, 33);
    w('conN', 31, U + 1, 18);
    // south lane: turbine slalom, then the wall and the ceiling
    w('thDoor', 73, 1, -26);
    w('th1', 71, 1, -34);
    w('th2', 63, 1, -36);
    w('th3', 61, 1, -30);
    w('th4', 51, 1, -30.5);
    w('s2', 45, 2.5, S.z0 + 1);
    w('s2b', 37, 3, S.z0 + 1);
    w('s2c', 35.5, 9.5, S.z0 + 1);
    w('s3', 25, 9.5, S.z0 + 1);
    w('s4', 12, S.h - 1, -34);
    w('conS', 33, 1, -20);
    w('sConn', 33, 2.5, -30);
    for (const [a, c] of [
      ['tower', 'base'],
      ['base', 'bN1'],
      ['base', 'bS1'],
      ['bN1', 'bN2'],
      ['bS1', 'bS2'],
      ['bN2', 'dIn'],
      ['bS2', 'dIn'],
      ['dIn', 'air'],
      ['bN1', 'baseN'],
      ['baseN', 'nCorner'],
      ['nCorner', 'nIn'],
      ['bS1', 'baseS'],
      ['baseS', 'sCorner'],
      ['sCorner', 'sIn'],
      // main
      ['air', 'atr'],
      ['atr', 'atrW'],
      ['atrW', 'tr1'],
      ['tr1', 'tr2'],
      ['tr2', 'rIn'],
      ['tr2', 'trS'],
      ['rIn', 'rN'],
      ['rIn', 'rS'],
      // upper
      ['atr', 'atrRamp'],
      ['atrRamp', 'shelf'],
      ['shelf', 'galE'],
      ['galE', 'gal'],
      ['gal', 'balc'],
      ['gal', 'conN'],
      // north
      ['nIn', 'cbDoor'],
      ['cbDoor', 'cbRamp'],
      ['cbRamp', 'dock'],
      ['dock', 'dockW'],
      ['dockW', 'cv1'],
      ['cv1', 'cvMid'],
      ['cvMid', 'cvMid2'],
      ['cvMid2', 'cv2'],
      ['cv2', 'shaft'],
      ['cv2', 'cvN'],
      ['cvN', 'conN'],
      // south
      ['sIn', 'thDoor'],
      ['thDoor', 'th1'],
      ['th1', 'th2'],
      ['th2', 'th3'],
      ['th3', 'th4'],
      ['th4', 's2'],
      ['s2', 's2b'],
      ['s2b', 's2c'],
      ['s2c', 's3'],
      ['s3', 's4'],
      ['trS', 'conS'],
    ])
      link(`${L}.${a}`, `${L}.${c}`);
    // the south connector drops you onto the wall: no way back up
    link(`${L}.conS`, `${L}.sConn`, true);
    link(`${L}.sConn`, `${L}.s3`, true);
    link(`${L}.rN`, 'M0n');
    link(`${L}.rS`, 'M0s');
    link(`${L}.shaft`, 'S0');
    link(`${L}.balc`, 'rWin');
    link(`${L}.s4`, 'SC');
  }

  link('rWin', 'S0'); // jump through the window into zero-G (or float out onto the balcony)

  return b.build({
    name: 'Kestrel',
    boundsMin: v3(-K.halfX - 2, SH.y0 - 2, K.turbine.z0 - 2),
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
      { name: 'Cyan hangar', pos: v3(-86, 0, 0), yawDeg: -90 },
      { name: 'Orange hangar', pos: v3(86, 0, 0), yawDeg: 90 },
      { name: 'Atrium', pos: v3(-62, 0, -6), yawDeg: -90 },
      { name: 'Gallery', pos: v3(-40, U, 12), yawDeg: -90 },
      { name: 'Reactor (mid)', pos: v3(-16, 0, -6), yawDeg: -90 },
      { name: 'Cargo bay', pos: v3(-70, 0, 30), yawDeg: -90 },
      { name: 'Cargo shaft', pos: v3(-34, CV.y0, 36), yawDeg: -90 },
      { name: 'Turbine hall', pos: v3(-72, 0, -28), yawDeg: -90 },
      { name: 'Engine corridor', pos: v3(-50, 0, -30), yawDeg: -90 },
    ],
    fog: { color: 0x060912, near: 40, far: 170 },
    ambient: 0.85,
    lights: kestrelLights(),
    sideTint: { neg: 0x1d6a80, pos: 0x86501f, amount: 0.16 },
  });
};

/** South connector hole in the engine corridor's +z wall (x coordinates of one side). */
function connS(s: number): Hole {
  return { u0: s > 0 ? 30 : -36, u1: s > 0 ? 36 : -30, v0: 0, v1: 5 };
}

/** Atmospheric lights (mirror pairs). Strip lights add their own small lights automatically. */
const kestrelLights = (): LightDef[] => {
  const K = KESTREL;
  const WARM = 0xffe0b0;
  const COOL = 0xbcd4ff;
  const out: LightDef[] = [];
  for (const s of [-1, 1] as const) {
    const X = (x: number) => s * x;
    const tc = s < 0 ? CYAN : ORANGE;
    // hangar: team spotlight on the Tower, cool fills over the deck
    out.push({ pos: v3(X(K.towerX), 13, 0), color: tc, radius: 20, intensity: 1.8, shaft: true });
    for (const z of [-20, 20])
      out.push({ pos: v3(X(92), 14, z), color: COOL, radius: 20, intensity: 1.2, shaft: true });
    out.push({ pos: v3(X(78), 4, 27), color: tc, radius: 8, intensity: 0.8 });
    out.push({ pos: v3(X(78), 4, -27), color: tc, radius: 8, intensity: 0.8 });
    // airlock: a red "door" glow
    out.push({ pos: v3(X(72), 5, 0), color: tc, radius: 9, intensity: 1.0 });
    // atrium: warm lamps high up, one over the shelf
    out.push({ pos: v3(X(60), 12.5, -6), color: WARM, radius: 18, intensity: 1.3, shaft: true });
    out.push({ pos: v3(X(51), 11, 11), color: WARM, radius: 12, intensity: 0.9 });
    // trench + gallery
    out.push({ pos: v3(X(34), 10.5, -5), color: WARM, radius: 16, intensity: 1.2, shaft: true });
    out.push({ pos: v3(X(38), 10.5, 11), color: COOL, radius: 11, intensity: 0.9 });
    // connectors
    out.push({ pos: v3(X(31), 9, 24), color: COOL, radius: 8, intensity: 0.7 });
    out.push({ pos: v3(X(33), 4, -20), color: 0xff7a4a, radius: 8, intensity: 0.7 });
    // cargo bay + conveyor
    out.push({ pos: v3(X(62), 10.5, 30), color: COOL, radius: 17, intensity: 1.1, shaft: true });
    out.push({ pos: v3(X(38), 8, 36), color: COOL, radius: 11, intensity: 0.9 });
    // turbine hall: hot red
    out.push({ pos: v3(X(60), 12, -34), color: ENGINE_RED, radius: 16, intensity: 1.2 });
    out.push({ pos: v3(X(57), 8, -22), color: 0xff9a5a, radius: 9, intensity: 0.8 });
    // engine corridor
    out.push({ pos: v3(X(30), 9, -34), color: ENGINE_RED, radius: 13, intensity: 1.0 });
    // reactor room + shaft
    out.push({ pos: v3(X(12), 12, -10), color: WARM, radius: 16, intensity: 1.1, shaft: true });
    out.push({ pos: v3(X(16), 8, 30), color: VIOLET, radius: 16, intensity: 1.0 });
    out.push({ pos: v3(X(12), 22, 48), color: VIOLET, radius: 16, intensity: 0.9 });
  }
  out.push({ pos: v3(0, 6, 0), color: VIOLET, radius: 16, intensity: 1.4 }); // the core
  out.push({ pos: v3(0, 13, 14), color: VIOLET, radius: 12, intensity: 0.8 });
  out.push({ pos: v3(0, 2, -34), color: ENGINE_RED, radius: 12, intensity: 1.0 });
  out.push({ pos: v3(0, -6, 30), color: VIOLET, radius: 14, intensity: 0.9 });
  return out;
};

/**
 * Visual detail only (no collision): light strips, wall ribs, floor guide lines, hazard
 * stripes at chokes, reactor rings, windows to space, spawn pads. Everything is placed as a
 * mirror pair so the map stays symmetric.
 */
const decorate = (b: LevelBuilder, spawns: SpawnDef[]): void => {
  const K = KESTREL;
  const U = K.upperY;
  const S = K.south;
  const SH = K.shaft;
  const deco = (
    min: Vec3,
    max: Vec3,
    mat: Material,
    extra: { color?: number; trim?: number } = {},
  ) => b.box(min, max, { mat, noCollide: true, ...extra });
  const LIGHT = 0x9fc4e8;
  const HAZARD = 0xd8a21a;
  // reactor core: glowing rings
  for (const y of [4, 8, 12])
    deco(v3(-3.12, y, -3.62), v3(3.12, y + 0.25, 3.62), 'trim', { color: VIOLET });
  // reactor room: ceiling strips
  for (const z of [-12, -4])
    deco(v3(-16, K.reactor.h - 0.12, z - 0.25), v3(16, K.reactor.h - 0.02, z + 0.25), 'trim', {
      color: LIGHT,
    });
  for (const s of [-1, 1] as const) {
    const X = (x: number) => s * x;
    const tc = s < 0 ? CYAN : ORANGE;
    const teamMat: Material = s < 0 ? 'teamA' : 'teamB';
    const d = (
      x0: number,
      y0: number,
      z0: number,
      x1: number,
      y1: number,
      z1: number,
      mat: Material,
      extra: { color?: number; trim?: number } = {},
    ) => deco(v3(X(x0), y0, z0), v3(X(x1), y1, z1), mat, extra);
    // hazard stripes across the chokes (airlock mouths)
    for (const x of [68.6, 75.4])
      for (let z = -4.5; z < 5; z += 2)
        d(x - 0.35, 0.004, z, x + 0.35, 0.02, z + 1, 'trim', { color: HAZARD });
    // atrium: wall ribs + windows to space high on the long walls
    for (let x = 49; x < 68; x += 6)
      for (const z of [-1, 1]) d(x - 0.3, 0, z * 16 - z * 0.35, x + 0.3, 14, z * 16, 'pillar');
    for (let x = 52; x < 68; x += 6)
      d(x - 2.2, 9, -15.98, x + 2.2, 12.5, -15.9, 'glass', { color: 0x1a3550, trim: tc });
    // atrium + trench: ceiling light strips
    for (let x = 24; x < 66; x += 10)
      d(x, 11.85, -6.25, x + 6, 11.95, -5.75, 'trim', { color: LIGHT });
    // trench floor guide line toward home
    d(22, 0.005, -10.7, 66, 0.02, -10.55, 'trim', { color: tc });
    // gallery floor strip
    d(22, U + 0.005, 13.9, 55, U + 0.02, 14.05, 'trim', { color: tc });
    // team banner over the airlock (atrium side)
    d(68.1, 7, -4, 68.2, 11, 4, teamMat, { trim: tc });
    // cargo bay: dock edge stripes, windows
    for (let x = 52; x < 70; x += 2)
      d(x, K.cargo.dockY + 0.004, 31.7, x + 1, K.cargo.dockY + 0.02, 32.2, 'trim', {
        color: HAZARD,
      });
    for (let x = 55; x < 75; x += 7)
      d(x - 2.5, 7, 41.9, x + 2.5, 10.5, 41.98, 'glass', { color: 0x1a3550, trim: tc });
    // conveyor: guide rollers on the floor
    for (let x = 29; x < 49; x += 1.5)
      d(x, K.conveyor.y0 + 0.004, 35.85, x + 0.8, K.conveyor.y0 + 0.03, 36.15, 'trim', {
        color: 0x3c5a78,
      });
    // turbine hall: vents on the turbines, pipes along the back wall
    for (const [x0, x1, z0, z1] of [
      [54, 59, -44, -31],
      [63, 69, -34, -24],
    ])
      for (const y of [3, 6])
        d(x0 - 0.05, y, z0 - 0.05, x1 + 0.05, y + 0.3, z1 + 0.05, 'trim', { color: ENGINE_RED });
    d(50, 10.5, -43.9, 74, 11.2, -43.2, 'engine');
    d(50, 2.5, -43.9, 74, 3.1, -43.3, 'engine');
    // engine corridor: glowing vents along the outer wall, pipes along the inner one
    for (let x = 18; x < 47; x += 6)
      d(x, 10.4, S.z0 + 0.02, x + 3, 11.2, S.z0 + 0.12, 'trim', { color: ENGINE_RED });
    d(1, S.h - 1.2, S.z1 - 0.6, 47, S.h - 0.6, S.z1 - 0.05, 'engine');
    d(1, 0.3, S.z1 - 0.6, 47, 0.8, S.z1 - 0.05, 'engine');
    // shaft: light rings on the long walls
    for (const y of [-6, 6, 18])
      d(0.5, y, SH.z1 - 0.12, SH.x, y + 0.3, SH.z1 - 0.02, 'trim', { color: WHITE });
    // hangar: window strip on the back wall, lit ring around the Tower, deck edge light
    d(K.hangar.x1 - 0.35, 8, -26, K.hangar.x1 - 0.3, 12, 26, 'glass', {
      color: 0x1a3550,
      trim: tc,
    });
    d(K.towerX - 2.6, 0.005, -2.6, K.towerX + 2.6, 0.02, 2.6, 'trim', { color: tc });
    d(K.towerX - 2.45, 0.006, -2.45, K.towerX + 2.45, 0.025, 2.45, 'floor');
    d(91.9, 4.6, -27.8, 92.05, 4.8, 27.8, 'trim', { color: tc });
  }
  // spawn pads
  for (const sp of spawns)
    deco(
      v3(sp.pos.x - 0.6, sp.pos.y + 0.004, sp.pos.z - 0.6),
      v3(sp.pos.x + 0.6, sp.pos.y + 0.016, sp.pos.z + 0.6),
      'trim',
      { color: sp.team === 0 ? 0x0f5c6b : 0x6b3e10 },
    );
};
