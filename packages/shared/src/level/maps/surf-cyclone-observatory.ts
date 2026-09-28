// "Cyclone Observatory" — surf map I03 (Intermediate; docs/movement-map-design/maps/I03-cyclone-observatory.md).
// An observatory built round a stationary storm: silver instrument rings with a cyan ridge light
// circle a cyclone caged in a glass column, at different heights and radii. Core skill: matching
// each ring's turn to the speed you carry (radius sized per ring, never one radius shrunk
// everywhere) and choosing where to leave a spiral. Built as course data (level/course) on
// MOVEMENT_PROFILE v1. Acts 1-3 circle the storm high up, clockwise; Act 4 spirals down round the
// glass; the portal in Act 5 drops you to the storm's base and reverses the rotation (every bend
// after it turns left).
//
//   1 Calibration ring  a broad 85° ring (R 240) round the storm, a tangential step onto a
//                       tighter ring (R 100), a chord release onto a lower third face    → C1
//   2 Narrowing orbit   one spiral ramp: 180° R 170→145, 70° R 145→115, a straight seam, 110°
//                       R 100→75 over a red strip, a climb; release across the instrument
//                       gap onto 2D                                                       → C2
//   3 Sensor comb       a climbing lip, four bhop pads each turned 15° over red sensor glass,
//                       a diagonal hop through the frame S3, a short ramp, a transfer past a
//                       pillar onto Ring V (the outer observatory, 110° R ≈ 290)            → C3
//   4 Open helix        a spoke in, a chord onto a 390° helix round the glass (R 70→48); the
//                       main exit leaves over its end under the lens screen (E2) onto 4T; the
//                       early exit leaves over the ridge at φ ≈ 51° through the amber slot E1
//                       onto R4-hi, which drops you across onto 4T at the merge            → C4
//   5 Counter-rotation  a tight right turn onto the portal's approach, the portal (−90°) down
//                       to the storm's base, a settling straight, a left ring (R 110 round
//                       O), a window with a red lintel, a skim, an opposing catch, a 160° left
//                       ring over a red strip                                               → C5
//   6 Telescope rise    a straight and a broad left turn out to the rim, two rising left
//                       spirals (a weak first climb falls onto 6B-low, whose launch throws you
//                       through the aperture), the finish in the telescope's ring of lights
//
// The spec's own layout (docs/movement-map-design/maps/I03-cyclone-observatory.md "As built")
// was fitted to a slower rider than the measured bots: drops are scaled down (the bots keep
// almost all their speed downhill), stretches lengthened, and the rings' centres solved so the
// helix and Ring V circle the storm.
import type {
  AnchorEl,
  CourseData,
  CourseFork,
  CurveEl,
  CurveLeg,
  GateEl,
  P3,
  SceneryElement,
} from '../course/types';
import { Pen } from '../course/pen';
import { curvePath, curveRidePoint } from '../course/curve';

const PALETTE = {
  ground: 0xaab6be,
  ground2: 0x8d9aa4,
  rock: 0x344a63,
  rockDark: 0x1c2a3b,
  edge: 0x9bdce0,
  surf: 0xaab6be,
  surfEdge: 0x9bdce0,
  stage: 0x344a63,
  stageGlow: 0x9bdce0,
  start: 0x9bdce0,
  finish: 0xdaaa5d,
  portal: 0xdaaa5d,
  pad: 0xdaaa5d,
  arrow: 0xe6f4f5,
  cloud: 0x3d5470,
  danger: 0x4d6a8a,
  leaf: 0x344a63,
  leafDark: 0x243447,
  trunk: 0x1c2a3b,
  crystal: 0x9bdce0,
  water: 0x22364c,
  accent: 0xdaaa5d,
  accent2: 0x9bdce0,
  bhop: 0xdaaa5d,
  hazard: 0xe8242c,
  anchor: 0x9bdce0,
};

/** Instrument silver, pale cyan, warning amber, storm blue (brief). */
const SILVER = 0xaab6be;
const CYAN = 0x9bdce0;
const AMBER = 0xdaaa5d;
const STORM = 0x344a63;
/** The caged cyclone: its glass, its dim bands, the lit well, the far shell. */
const GLASS = 0xb8e4e8;
const STORM_DIM = 0x3d5a7a;
const STORM_MID = 0x55779b;
const WELL = 0x4f9db0;
const SILVER_GLOW = 0xd0dae0;
/** The lens screen: a darker instrument steel, so its amber slot stands out. */
const SCREEN = 0x55677a;
const SHELL = 0x2a3b50;
/** The glass column's radius round O. */
const STORM_R = 28;
/** Salvage rings: a paler, unlit steel (a way back, not a line). */
const SALVAGE = 0x7f8b94;

const MID = { height: 12, angle: 60 };
const STD = { height: 14, angle: 58 };
const BROAD = { height: 16, angle: 56 };
const WIDE = { height: 18, angle: 55 };
const SHORT = { height: 9, angle: 65 };
const HELIX = { height: 8.5, angle: 62 };

const arc = (
  turn: number,
  radius: number,
  drop: number,
  more: Partial<CurveLeg> = {},
): CurveLeg => ({ turn, radius, drop, ...more });
const straight = (len: number, drop: number, more: Partial<CurveLeg> = {}): CurveLeg => ({
  len,
  drop,
  ...more,
});

const DEG = Math.PI / 180;
// (+ 0: never a -0, which a JSON round trip would not keep)
const r1 = (x: number): number => Math.round(x * 10) / 10 + 0;
const r3 = (x: number): number => Math.round(x * 1000) / 1000 + 0;
const dirOf = (h: number): [number, number] => [Math.sin(h * DEG), -Math.cos(h * DEG)];
const headingTo = (dx: number, dz: number): number =>
  (((Math.atan2(dx, -dz) / DEG) % 360) + 360) % 360;

const rideAt = (e: CurveEl, s: number, depth: number): P3 => {
  const path = curvePath(e);
  const r = path.at(s < 0 ? path.length + s : s);
  const face = e.side === 'both' ? (e.ride ?? 'right') : e.side;
  const q = curveRidePoint(e, r, face, depth);
  return [r1(q.x), r1(q.y), r1(q.z)];
};
const lastCurve = (p: Pen): CurveEl => {
  const e = p.route[p.route.length - 1];
  if (e.t !== 'curve') throw new Error('not a curve');
  return e;
};
type CurveOpts = Parameters<Pen['curve']>[0];

/** The storm's axis: the helix is centred on it (the landmark stands there). */
const O = { x: 0, z: 0 };

/** Where the ridge of a curve's leg `i` (the legs as written, lead-in not counted) is centred. */
const legCentre = (e: CurveEl, i: number): { x: number; z: number } => {
  const path = curvePath(e);
  const k = i + (e.lead ? 1 : 0);
  const leg = e.legs[k];
  const r = path.at(path.plans[k].s0 + 1e-6);
  const R = (leg.radius ?? 20) * Math.sign(leg.turn ?? 1);
  return { x: r.pos.x - r.dir.z * R, z: r.pos.z + r.dir.x * R };
};

/**
 * A recovery ring standing round a curve `s` metres along it (its bottom bar under the ramp),
 * its bay `side` (+1 the face's side, -1 the ridge's) of the ramp, back from where its launch
 * throws you back on (`toS`; `bay0`: how far back, aside and up, and how deep on the face).
 */
const ringAnchor = (
  e: CurveEl,
  s: number,
  name: string,
  toS: number,
  shape: { height: number; angle: number },
  side: 1 | -1,
  flightSec = 0.9,
  bay0 = { back: 30, side: 12, up: 6, depth: 0.35 },
): AnchorEl => {
  const path = curvePath(e);
  const rr = path.at(s);
  const run = shape.height / Math.tan(shape.angle * DEG);
  const f = e.side === 'left' ? -1 : 1;
  // (right of the way is (-dir.z, dir.x); the face lies on side f of the ridge)
  const mid: P3 = [
    r1(rr.pos.x - rr.dir.z * run * 0.5 * f),
    r1(rr.pos.y - shape.height - 2.5),
    r1(rr.pos.z + rr.dir.x * run * 0.5 * f),
  ];
  const to = rideAt(e, toS, bay0.depth);
  const h = headingTo(rr.dir.x, rr.dir.z);
  // (the bay lines up with the ramp where its launch lands)
  const td = path.at(toS).dir;
  const [fx, fz] = [td.x, td.z];
  const o = bay0.side * f * side;
  const k = bay0.back;
  const bay: P3 = [r1(to[0] - fx * k - fz * o), r1(to[1] + bay0.up), r1(to[2] - fz * k + fx * o)];
  return {
    t: 'anchor',
    at: mid,
    heading: r3(h),
    size: [18, shape.height + 10],
    name,
    bay,
    bayHeading: r3(headingTo(to[0] - bay[0], to[2] - bay[2])),
    to,
    flightSec,
  };
};

/** Two unknowns, two equations: Newton's method with a numeric Jacobian (plain arithmetic). */
const solve2 = (
  f: (a: number, b: number) => [number, number],
  a0: number,
  b0: number,
): [number, number] => {
  let a = a0;
  let b = b0;
  for (let k = 0; k < 40; k++) {
    const [f1, f2] = f(a, b);
    if (Math.hypot(f1, f2) < 0.005) break;
    const h = 0.25;
    const [g1, g2] = f(a + h, b);
    const [k1, k2] = f(a, b + h);
    const j11 = (g1 - f1) / h;
    const j21 = (g2 - f2) / h;
    const j12 = (k1 - f1) / h;
    const j22 = (k2 - f2) / h;
    const det = j11 * j22 - j12 * j21;
    a -= (j22 * f1 - j12 * f2) / det;
    b -= (-j21 * f1 + j11 * f2) / det;
  }
  return [r3(a), r3(b)];
};

/**
 * The spec's ramp drops are scaled by this (descents only; climbs kept): the bots keep almost
 * all their speed downhill, and the spec's drops made them hit the 50 m/s cap by Act 2.
 */
const DROP = 0.4;
/** The helix's drop over each of its last two turns (its first turn drops only 2 m). */
const HELIX_DROP = 7;
/** Ring V's turn (the rest of the way round to the helix is 4A's, solved). */
const RING_V_TURN = 110;
/**
 * The early helix exit: where it leaves (φ, degrees round the helix from the chord), its flight
 * onto R4-hi (ahead, up), R4-hi's bend and last straight, and how far above 4T's ride height
 * R4-hi ends (its drop is solved for that).
 */
const E1_PHI = 51;
const E1_FLIGHT: [number, number] = [58, -18];
const E1_LEN = 60;
const E1_BEND = -10;
const E1_UP = 15;
/** The lens screen round the helix (its radius) and the early exit's slot in it (its width). */
const SCREEN_R = 78;
const E1_SLOT = 13;
/** The Act 5 portal's facing (a cardinal heading); it turns you −90°. */
const P5_FACING = 0;
const sc = (legs: CurveLeg[]): CurveLeg[] =>
  legs.map((l) => ((l.drop ?? 0) > 0 ? { ...l, drop: r1((l.drop ?? 0) * DROP) } : l));

/** A deterministic 0..1 value per integer (scenery placement). */
const hash = (n: number): number => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * The observatory round the route: the caged cyclone (a glass column round O with a turning
 * storm of dim lit bands inside, a stepped glass dome, the lit well and the silver pressure
 * collar at its base), each orbital level's instruments (theodolite masts on Ring I, armillary
 * hoops shrinking with the orbit, a comb-toothed sensor rail outside Ring V, the lens screen —
 * built with the helix — and the telescope's aperture lights at the finish), storm-blue struts
 * under the rings, and the observatory's outer shell far outside the route. Pure decoration:
 * none of it collides.
 */
const observatory = (
  out: SceneryElement[],
  p: Pen,
  forks: CourseFork[],
  o: { helixTop: number; ringI: CurveEl; orbit: CurveEl; ringV: CurveEl; fin: GateEl },
): void => {
  const colTop = r1(o.helixTop + 6);
  const colBot = 20;
  // the glass column: 20 panes round O
  for (let i = 0; i < 20; i++) {
    const b = i * 18 + 9;
    const [dx, dz] = dirOf(b);
    out.push({
      t: 'block',
      at: [r1(O.x + dx * STORM_R), colBot, r1(O.z + dz * STORM_R)],
      size: [r1(2 * STORM_R * Math.sin(9 * DEG) + 0.05), r1(colTop - colBot), 0.4],
      heading: b,
      mat: 'glass',
      color: GLASS,
    });
  }
  // its stepped dome
  let dy = colTop;
  for (const w of [2 * STORM_R, 2 * STORM_R - 14, 2 * STORM_R - 30]) {
    out.push({
      t: 'block',
      at: [O.x, r1(dy), O.z],
      size: [w, 3, w],
      round: true,
      mat: 'glass',
      color: GLASS,
    });
    dy += 3;
  }
  // the storm: three dim bands turning up the column (its few pale cyan flashes are low in the
  // well and under the dome only, never level with a window or a slot)
  for (let arm = 0; arm < 3; arm++)
    for (let k = 0; k < 30; k++) {
      const u = k / 29;
      const y = colBot + 8 + u * (colTop - colBot - 16);
      const a = arm * 120 + k * 27;
      const r = 7 + 13 * (0.5 + 0.5 * Math.sin(k * 0.45 + arm));
      const [dx, dz] = dirOf(a);
      const flash = (u < 0.12 || u > 0.92) && k % 3 === arm % 3;
      out.push({
        t: 'block',
        at: [r1(O.x + dx * r), r1(y), r1(O.z + dz * r)],
        size: [r1(8 + 6 * hash(arm * 40 + k)), 1.4, 2.4],
        heading: r3(a + 90),
        mat: 'glow',
        color: flash ? CYAN : k % 2 ? STORM_DIM : STORM_MID,
      });
    }
  // the lit well at the bottom, the silver pressure collar round the column's base
  out.push({
    t: 'block',
    at: [O.x, colBot - 3, O.z],
    size: [2 * STORM_R - 2, 2, 2 * STORM_R - 2],
    round: true,
    mat: 'glow',
    color: WELL,
  });
  for (let i = 0; i < 16; i++) {
    const b = i * 22.5;
    const [dx, dz] = dirOf(b);
    out.push({
      t: 'block',
      at: [r1(O.x + dx * 38), colBot, r1(O.z + dz * 38)],
      size: [19, 34, 16],
      heading: b,
      mat: 'plate',
      color: SILVER,
    });
  }
  // (a cyan band round the collar's top: a thin lit plate on each piece)
  for (let i = 0; i < 16; i++) {
    const b = i * 22.5;
    const [dx, dz] = dirOf(b);
    out.push({
      t: 'block',
      at: [r1(O.x + dx * 38), colBot + 34, r1(O.z + dz * 38)],
      size: [19, 0.8, 16],
      heading: b,
      mat: 'glow',
      color: CYAN,
    });
  }

  /** A point `side` metres right of a curve's ridge `sv` along it, `up` above. */
  const at = (e: CurveEl, sv: number, side: number, up: number): P3 => {
    const r = curvePath(e).at(sv);
    return [r1(r.pos.x - r.dir.z * side), r1(r.pos.y + up), r1(r.pos.z + r.dir.x * side)];
  };
  const headAt = (e: CurveEl, sv: number): number => {
    const d = curvePath(e).at(sv).dir;
    return r3(headingTo(d.x, d.z));
  };
  // I: theodolite masts outside Ring I's ridge every 70 m, each with an arm reaching toward
  // the storm and a cyan lamp
  {
    const len = curvePath(o.ringI).length;
    for (let sv = 40; sv < len - 20; sv += 70) {
      const top = at(o.ringI, sv, -7, 6);
      out.push({
        t: 'block',
        at: [top[0], r1(top[1] - 40), top[2]],
        size: [1.6, 40, 1.6],
        round: true,
        mat: 'plate',
        color: SILVER,
      });
      out.push({
        t: 'block',
        at: top,
        size: [12, 1.2, 1.2],
        heading: headAt(o.ringI, sv),
        mat: 'plate',
        color: SILVER,
      });
      out.push({
        t: 'block',
        at: [top[0], r1(top[1] + 1.2), top[2]],
        size: [1.4, 1.4, 1.4],
        mat: 'glow',
        color: CYAN,
      });
    }
  }
  // II: armillary hoops standing round the orbit, smaller as the orbit narrows
  {
    const path = curvePath(o.orbit);
    const run = MID.height / Math.tan(MID.angle * DEG);
    const n = 5;
    for (let k = 0; k < n; k++) {
      const sv = 40 + (k * (path.length - 90)) / (n - 1);
      const r = path.at(sv);
      const w = 30 - k * 3;
      const h = 26 - k * 2.5;
      const mx = r.pos.x - r.dir.z * run * 0.5;
      const mz = r.pos.z + r.dir.x * run * 0.5;
      const y0 = r.pos.y - MID.height - 3;
      const hd = headAt(o.orbit, sv);
      const bar = (x: number, y: number, bw: number, bh: number) =>
        out.push({
          t: 'block',
          at: [r1(mx - r.dir.z * x), r1(y), r1(mz + r.dir.x * x)],
          size: [r1(bw), r1(bh), 0.6],
          heading: hd,
          mat: 'glow',
          color: k % 2 ? CYAN : SILVER_GLOW,
        });
      bar(0, y0 - 0.6, w + 0.6, 0.6);
      bar(0, y0 + h, w + 0.6, 0.6);
      for (const sgn of [-1, 1]) bar((sgn * w) / 2, y0, 0.6, h);
    }
  }
  // III: the comb-toothed sensor rail outside Ring V's ridge
  {
    const len = curvePath(o.ringV).length;
    for (let sv = 20; sv < len - 10; sv += 12) {
      const q = at(o.ringV, sv, -9, -4);
      out.push({
        t: 'block',
        at: q,
        size: [0.8, 0.8, 12.2],
        heading: headAt(o.ringV, sv),
        mat: 'plate',
        color: SILVER,
      });
      out.push({
        t: 'block',
        at: [q[0], r1(q[1] + 0.8), q[2]],
        size: [0.6, 3, 0.6],
        mat: 'glow',
        color: sv % 24 < 12 ? CYAN : SILVER_GLOW,
      });
    }
  }
  // V: the telescope's aperture — a circle of amber instrument lights round the finish gate
  {
    const g = o.fin;
    const [w, h] = g.size;
    const [dx, dz] = dirOf(g.heading);
    const cy = g.at[1] + h / 2;
    const R = (w / 2) * Math.SQRT2 + 3;
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      const x = Math.cos(a) * R;
      out.push({
        t: 'block',
        at: [r1(g.at[0] - dz * x), r1(cy + Math.sin(a) * R), r1(g.at[2] + dx * x)],
        size: [1.4, 1.4, 1.4],
        heading: g.heading,
        mat: 'glow',
        color: AMBER,
      });
    }
  }
  // storm-blue struts under the rings (every 80 m where nothing of the route passes below)
  {
    const curves = p.route.filter((e): e is CurveEl => e.t === 'curve');
    const keep: { x: number; y: number; z: number; e: unknown }[] = [];
    for (const e of curves) {
      const path = curvePath(e);
      for (let sv = 0; sv <= path.length; sv += 6) {
        const r = path.at(sv);
        keep.push({ x: r.pos.x, y: r.pos.y, z: r.pos.z, e });
      }
    }
    for (const e of p.route) {
      if ((e.t === 'gate' || e.t === 'anchor') && e.bay)
        keep.push({ x: e.bay[0], y: e.bay[1], z: e.bay[2], e });
      if (e.t === 'jumps')
        for (const q of e.pads) keep.push({ x: q.at[0], y: q.at[1], z: q.at[2], e });
      if (e.t === 'launch' || e.t === 'window' || e.t === 'red' || e.t === 'portal')
        keep.push({ x: e.at[0], y: e.at[1], z: e.at[2], e });
    }
    for (const f of forks)
      for (const q of f.line) keep.push({ x: q.at[0], y: q.at[1], z: q.at[2], e: f });
    for (const e of curves) {
      if (e.alt) continue;
      const path = curvePath(e);
      const run = e.height / Math.tan((e.angle * Math.PI) / 180);
      const side = e.side === 'right' ? 1 : -1;
      for (let sv = 30; sv < path.length - 20; sv += 80) {
        const r = path.at(sv);
        const x = r.pos.x - r.dir.z * side * run * 0.5;
        const z = r.pos.z + r.dir.x * side * run * 0.5;
        const topY = r.pos.y - e.height - 1;
        const bottom = Math.max(colBot, topY - 90);
        if (Math.hypot(x - O.x, z - O.z) < STORM_R + 22) continue;
        const clear = keep.every(
          (q) =>
            q.e === e || Math.hypot(q.x - x, q.z - z) > 20 || q.y > topY + 20 || q.y < bottom - 5,
        );
        if (!clear) continue;
        out.push({
          t: 'block',
          at: [r1(x), r1(bottom), r1(z)],
          size: [2.4, r1(topY - bottom), 2.4],
          round: true,
          color: STORM,
        });
      }
    }
  }
  // the observatory's outer shell, far outside the route: storm-blue panels with a cyan band
  // near the top (the frame of every view outward)
  for (let i = 0; i < 36; i++) {
    const b = i * 10;
    const [dx, dz] = dirOf(b);
    const R = 590;
    out.push({
      t: 'block',
      at: [r1(O.x + dx * R), -4, r1(O.z + dz * R)],
      size: [r1(2 * R * Math.sin(5 * DEG) + 0.5), 500, 4],
      heading: b,
      color: SHELL,
    });
    out.push({
      t: 'block',
      at: [r1(O.x + dx * (R - 3)), 430, r1(O.z + dz * (R - 3))],
      size: [r1(2 * (R - 3) * Math.sin(5 * DEG)), 2, 0.6],
      heading: b,
      mat: 'glow',
      color: CYAN,
    });
  }
};

export const cycloneObservatoryCourse = (): CourseData => {
  const p = new Pen([-240, 370, 82], 0);
  const deco: SceneryElement[] = [];
  const forks: CourseFork[] = [];
  p.start([14, 16]);
  p.platform([10, 12], 'strafe');

  // ---- 1 Calibration ring ----
  p.move(12, -8).curve({
    legs: sc([straight(50, 4), arc(85, 240, 19), straight(12, 1)]),
    ...STD,
    side: 'right',
  });
  const ringI = lastCurve(p);
  p.move(4, -2).anchor('Ring One', { flightSec: 1.0, up: 5 }, [14, 12]);
  p.move(12, -3).curve({ legs: sc([arc(75, 100, 6), straight(15, 1)]), ...MID, side: 'right' });
  p.move(30, -9).curve({ legs: sc([straight(83, 5), arc(20, 163, 2)]), ...STD, side: 'right' });
  p.move(6, -2).gate([24, 18], 'Calibration Frame', { up: 5 });

  // ---- 2 Narrowing orbit ----
  p.move(14, -4);
  const orbitOpts: CurveOpts = {
    legs: sc([
      straight(15, 1),
      arc(180, 170, 14, { toRadius: 145 }),
      arc(70, 145, 6, { toRadius: 115, red: 0.8 }),
      straight(35, 1),
      arc(110, 100, 5, { toRadius: 75, red: 0.8 }),
      straight(30, -4),
    ]),
    ...MID,
    side: 'right',
  };
  const orbit = lastCurve(new Pen(p.here(), p.heading).curve(orbitOpts));
  {
    // R2a (Seam): a ring on the orbit 30 m before the seam; its bay throws you onto the seam
    const path = curvePath(orbit);
    const sSeam = path.plans[4].s0;
    const rr = path.at(sSeam - 30);
    // (the ring stands round the ramp: its middle over the middle of the face, its bottom bar
    // under the ramp's foot)
    const run = MID.height / Math.tan(MID.angle * DEG);
    const ride: P3 = [
      r1(rr.pos.x - rr.dir.z * run * 0.5),
      r1(rr.pos.y - MID.height - 2.5),
      r1(rr.pos.z + rr.dir.x * run * 0.5),
    ];
    const to = rideAt(orbit, sSeam + 18, 0.35);
    const h = headingTo(rr.dir.x, rr.dir.z);
    const [fx, fz] = dirOf(h);
    const bay: P3 = [r1(to[0] - fx * 30 - fz * 12), r1(to[1] + 6), r1(to[2] - fz * 30 + fx * 12)];
    const a: AnchorEl = {
      t: 'anchor',
      at: ride,
      heading: r3(h),
      size: [18, 24],
      name: 'Seam',
      bay,
      bayHeading: r3(headingTo(to[0] - bay[0], to[2] - bay[2])),
      to,
      flightSec: 0.9,
    };
    p.route.push(a);
  }
  p.curve(orbitOpts);
  const orbitC = lastCurve(p);
  p.move(24, -3).curve({
    legs: sc([straight(15, 1), arc(50, 75, 5), straight(40, 4)]),
    ...STD,
    side: 'right',
  });
  p.move(6, -2).gate([24, 18], 'Orbit Exit', { flightSec: 0.9, up: 4 });

  // ---- 3 Sensor comb ----
  p.move(14, -4).curve({
    legs: sc([arc(35, 150, 4), straight(10, 1), straight(60, -12)]),
    ...MID,
    side: 'right',
  });
  p.move(4, 0).anchor('Comb', { back: 20, flightSec: 0.8, up: 4 }, [14, 12]);
  p.move(14, -1).bhopPads(
    [
      { d: 0, size: [7, 12] },
      { d: 17.5, turn: 15 },
      { d: 17.8, turn: 15 },
      { d: 18.1, turn: 15 },
    ],
    [6, 10],
  );
  {
    // the sensor bed: hatched red sensor glass under the four pads (a missed pad, or a missed
    // diagonal through S3, ends there: back to the Comb)
    const jumps = p.route[p.route.length - 1];
    if (jumps.t !== 'jumps') throw new Error('pads');
    const pads = jumps.pads;
    const a = pads[0].at;
    const b = pads[pads.length - 1].at;
    p.route.push({
      t: 'red',
      at: [r1((a[0] + b[0]) / 2), r1(a[1] - 14), r1((a[2] + b[2]) / 2)],
      size: [30, 1, r1(Math.hypot(b[0] - a[0], b[2] - a[2]) + 16)],
      heading: r3(headingTo(b[0] - a[0], b[2] - a[2])),
    });
  }
  p.turn(25).window(8, [7, 5], [18, 12], 0.3);
  p.move(9, -2.3).curve({ lead: 7, legs: [straight(30, 3)], ...MID, side: 'right' });
  // the pillar the transfer onto Ring V passes (a silver column 5 m left of the straight line:
  // hold the line past it)
  deco.push({
    t: 'block',
    at: p.relP(7.5, -5, -40),
    size: [3, 48, 3],
    heading: r3(p.heading),
    round: true,
    solid: true,
    color: SILVER,
    mat: 'plate',
  });
  p.move(22, -6);
  // Ring V (the outer observatory): its radius solved so its centre is level with O (the comb
  // lies too far round for a lead straight to put it on O: it is centred about 30 m short of it)
  const ringV = (r: number): CurveOpts => ({
    lead: 12,
    legs: sc([straight(10, 1), arc(RING_V_TURN, r, 12), straight(80, 1)]),
    ...BROAD,
    side: 'right',
  });
  const sideOff = (r: number): number => {
    const c = legCentre(lastCurve(new Pen(p.here(), p.heading).curve(ringV(r))), 1);
    const [dx, dz] = dirOf(p.heading);
    return (c.x - O.x) * -dz + (c.z - O.z) * dx;
  };
  const rV = r1(300 - sideOff(300) / (sideOff(301) - sideOff(300)));
  p.curve(ringV(rV));
  const ringVc = lastCurve(p);
  p.move(6, -2).gate([24, 18], 'Sensor Door', { up: 5 });

  // ---- 4 Open helix ----
  p.move(14, -4);
  // the spoke 4A and the chord onto the helix: 4A's turn and the chord's length solved so the
  // helix is centred on O
  const spoke = (turn: number): CurveOpts => ({
    legs: sc([arc(turn, 120, 9), straight(10, 0.5)]),
    ...STD,
    side: 'right',
  });
  const helixOpts = (chord: number): CurveOpts => ({
    // (little drop over the first turn, most over the last two: the early exit E1 leaves high
    // above the main exit E2, so its receiver can run above 4T)
    legs: [
      straight(chord, 2.4),
      arc(150, 70, 2, { toRadius: 62 }),
      arc(120, 62, HELIX_DROP, { toRadius: 55 }),
      arc(120, 55, HELIX_DROP, { toRadius: 48, red: 0.8 }),
      straight(10, -1.5),
    ],
    ...HELIX,
    side: 'right',
  });
  const [turn4, chord] = solve2(
    (t, l) => {
      const g = new Pen(p.here(), p.heading).curve(spoke(t));
      g.move(4, -2).move(12, -3).curve(helixOpts(l));
      const c = legCentre(lastCurve(g), 1);
      return [c.x - O.x, c.z - O.z];
    },
    120,
    110,
  );
  p.curve(spoke(turn4));
  p.move(4, -2).anchor('Helix', { flightSec: 0.9, up: 4 }, [14, 12]);
  p.move(12, -3);
  const helix = lastCurve(new Pen(p.here(), p.heading).curve(helixOpts(chord)));
  const hPath = curvePath(helix);
  const hHead0 = helix.heading;
  /** Where on the helix (flat s) the ridge has turned `phi` degrees from the chord. */
  const hs = (phi: number): number => {
    let lo = hPath.plans[2].s0;
    let hi = hPath.length;
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2;
      const d = hPath.at(mid).dir;
      const turned = (headingTo(d.x, d.z) - hHead0 + 720) % 360;
      // (the helix turns more than 360°: count whole turns from the leg reached)
      const whole = mid > hPath.plans[3].s0 + hPath.plans[3].length * 0.5 && turned < 200 ? 360 : 0;
      if (turned + whole < phi) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  // R4b (Spiral): a ring round the helix at φ 210, its bay inside the helix (beside the glass)
  // throwing you back onto the face at φ 185 (the cadence: the helix and 4T are long)
  p.route.push(
    ringAnchor(helix, hs(210), 'Spiral', hs(185), HELIX, 1, 0.9, {
      back: 18,
      side: 14,
      up: 1,
      depth: 0.4,
    }),
  );
  p.curve(helixOpts(chord));
  // The early exit E1 (the faster line): over the outer ridge at φ E1_PHI, straight out through
  // the slot in the lens screen onto R4-hi, which runs beside 4T (north of it, above it) and
  // hands you across onto 4T at the merge. The main exit E2: over the lip at the helix's end
  // (390°), out under the lens screen onto 4T. E1 leaves about 20° right of E2: R4-hi bends
  // E1_BEND left and 4T the rest of the way right, so both end on one heading, R4-hi about 10 m
  // right of 4T and E1_UP above it: the merge is a same-side step down and across.
  const sE1 = hs(E1_PHI);
  const e1At = rideAt(helix, sE1, 0.05);
  const e1Dir = hPath.at(sE1).dir;
  const e1Head = headingTo(e1Dir.x, e1Dir.z);
  const hEnd = hPath.at(hPath.length).dir;
  const bend4 = (b: number): number =>
    r3(((e1Head + b - headingTo(hEnd.x, hEnd.z) + 540) % 360) - 180);
  const t4Opts = (b: number): CurveOpts => ({
    lead: 12,
    legs: [straight(15, 0.3), arc(bend4(b), 120, 0.5), straight(170, 5.7), straight(30, 0.5)],
    ...STD,
    side: 'left',
  });
  const r4hi = (b: number, drop: number): CurveOpts => ({
    lead: 5,
    legs: [straight(30, drop), arc(b, 150, 1), straight(E1_LEN, 2)],
    ...STD,
    side: 'left',
  });
  const hiPen = (b: number, drop: number): Pen =>
    new Pen(e1At, e1Head).move(E1_FLIGHT[0], E1_FLIGHT[1]).curve(r4hi(b, drop));
  p.move(55, -16);
  const t4Of = (b: number): CurveEl => lastCurve(new Pen(p.here(), p.heading).curve(t4Opts(b)));
  /** R4-hi's end against 4T: how far right of 4T's line, how far above its ride height. */
  const offT4 = (t4: CurveEl, q: Pen): { side: number; up: number; s: number } => {
    const path = curvePath(t4);
    let best = 0;
    let bd = Infinity;
    for (let sv = 0; sv <= path.length; sv += 1) {
      const r = path.at(sv).pos;
      const d = Math.hypot(r.x - q.pos.x, r.z - q.pos.z);
      if (d < bd) {
        bd = d;
        best = sv;
      }
    }
    const r = path.at(best);
    const ride = rideAt(t4, best, 0.35);
    const side = (q.pos.x - r.pos.x) * -r.dir.z + (q.pos.z - r.pos.z) * r.dir.x;
    return { side, up: q.pos.y - ride[1], s: best };
  };
  const bendHi = E1_BEND;
  const upAt = (drop: number): number => offT4(t4Of(bendHi), hiPen(bendHi, drop)).up - E1_UP;
  const hiDrop = r1(2 - upAt(2) / (upAt(3) - upAt(2)));
  p.curve(t4Opts(bendHi));
  const t4 = lastCurve(p);
  const hiEnd = hiPen(bendHi, hiDrop);
  const merge = offT4(t4, hiEnd);
  const hiCurve = p.branch((b) => {
    b.route.push(lastCurve(hiEnd));
    return lastCurve(hiEnd);
  });
  const land = rideAt(t4, merge.s + 34, 0.35);
  forks.push({
    name: 'Early helix exit (E1)',
    safe: 'ride the helix all the way round (390°) and leave over the lip under the lens screen (E2)',
    risky: `climb to the ridge by φ ${E1_PHI - 10}, go over it at φ ${E1_PHI} and fly through the slot in the lens screen onto R4-hi, then across onto 4T at the merge`,
    line: [
      { at: rideAt(helix, hs(E1_PHI - 30), 0.35), surf: true },
      { at: rideAt(helix, hs(E1_PHI - 12), 0.2), surf: true },
      { at: e1At, surf: true },
      { at: rideAt(hiCurve, 14, 0.3), surf: true },
      { at: rideAt(hiCurve, E1_LEN * 0.6, 0.35), surf: true },
      { at: rideAt(hiCurve, -2, 0.35), surf: true },
      { at: land, surf: true },
      { at: rideAt(t4, merge.s + 70, 0.35), surf: true },
    ],
  });
  // the lens screen (level IV): a dark steel wall arc outside the helix's first turn where the
  // early line crosses it (solid), the slot E1 in it (amber rim); the main exit flies out under
  // it onto 4T, through the cyan-lit arch E2
  {
    // (the early line flies from the release toward R4-hi's landing)
    const aim = rideAt(hiCurve, 14, 0.3);
    const [dx, dz] = dirOf(headingTo(aim[0] - e1At[0], aim[2] - e1At[2]));
    const px = e1At[0] - O.x;
    const pz = e1At[2] - O.z;
    const bb = px * dx + pz * dz;
    const t = -bb + Math.sqrt(bb * bb - (px * px + pz * pz - SCREEN_R * SCREEN_R));
    // (traced: the bot's flights cross the screen 0-4° further round than that line)
    const slotBear = headingTo(e1At[0] + dx * t - O.x, e1At[2] + dz * t - O.z) + 2;
    // (leaving the banked ridge lifts you a little: by the screen the early line has fallen
    // about 6.5 m)
    const feet = e1At[1] - 6.5;
    const slotLo = r1(feet - 3.5);
    const slotHi = r1(feet + 9);
    const lo = r1(slotLo - 6);
    const hi = r1(slotHi + 4);
    const half = Math.asin(E1_SLOT / 2 / SCREEN_R) / DEG;
    const piece = (b0: number, b1: number, y0: number, y1: number) => {
      const bm = (b0 + b1) / 2;
      const [ux, uz] = dirOf(bm);
      deco.push({
        t: 'block',
        at: [r1(O.x + ux * (SCREEN_R + 1)), y0, r1(O.z + uz * (SCREEN_R + 1))],
        size: [r1(2 * (SCREEN_R + 1) * Math.sin(((b1 - b0) / 2) * DEG) + 0.4), r1(y1 - y0), 2],
        heading: r3(bm),
        solid: true,
        color: SCREEN,
        mat: 'plate',
      });
    };
    const from = slotBear - 24;
    const to = slotBear + 20;
    for (let b = from; b < slotBear - half - 0.01; b += 6)
      piece(b, Math.min(b + 6, slotBear - half), lo, hi);
    piece(slotBear - half, slotBear + half, lo, slotLo);
    piece(slotBear - half, slotBear + half, slotHi, hi);
    for (let b = slotBear + half; b < to - 0.01; b += 6) piece(b, Math.min(b + 6, to), lo, hi);
    // the slot's amber rim (glow, on both faces: it reads from the helix and from outside)
    const [ux, uz] = dirOf(slotBear);
    for (const d of [SCREEN_R - 1.2, SCREEN_R + 3]) {
      const rim = (x: number, y: number, w: number, h: number) =>
        deco.push({
          t: 'block',
          at: [r1(O.x + ux * d - uz * x), r1(y), r1(O.z + uz * d + ux * x)],
          size: [w, h, 0.4],
          heading: r3(slotBear),
          mat: 'glow',
          color: AMBER,
        });
      rim(0, slotLo - 0.6, E1_SLOT + 1.2, 0.6);
      rim(0, slotHi, E1_SLOT + 1.2, 0.6);
      for (const k of [-1, 1]) rim(k * (E1_SLOT / 2 + 0.3), slotLo, 0.6, slotHi - slotLo);
    }
    // the arch E2: the opening under the screen, its lower edge lit cyan
    for (let b = from; b < to - 0.01; b += 6) {
      const bm = Math.min(b + 3, (b + to) / 2);
      const w = Math.min(6, to - b);
      const [vx, vz] = dirOf(bm);
      deco.push({
        t: 'block',
        at: [r1(O.x + vx * (SCREEN_R + 3)), r1(lo - 0.9), r1(O.z + vz * (SCREEN_R + 3))],
        size: [r1(2 * (SCREEN_R + 3) * Math.sin((w / 2) * DEG)), 0.8, 0.4],
        heading: r3(bm),
        mat: 'glow',
        color: CYAN,
      });
    }
  }
  p.move(6, -2).gate([24, 18], 'Instrument Merge', { up: 5 });

  // ---- 5 Counter-rotation ----
  // 5A turns you onto the portal's approach, 5° off its cardinal facing
  const turn5 = r3((P5_FACING + 5 - p.heading + 720) % 360);
  if (turn5 < 0) throw new Error(`5A would turn ${turn5}°`);
  p.move(14, -4).curve({ legs: sc([arc(turn5, 60, 8), straight(20, 1)]), ...STD, side: 'right' });
  p.move(16, -5).curve({ legs: sc([straight(220, 6)]), ...MID, side: 'right' });
  // the portal turns you −90°: its exit is placed so the reversal ring 5C is centred on O
  const reversal: CurveOpts = {
    lead: 12,
    legs: sc([straight(80, 3), arc(-90, 110, 8), straight(10, 1)]),
    ...STD,
    side: 'left',
  };
  const ghost5 = new Pen([0, 0, 0], P5_FACING - 90).move(14, -4).curve(reversal);
  const c5 = legCentre(lastCurve(ghost5), 1);
  const exit5: P3 = [r1(O.x - c5.x), 122, r1(O.z - c5.z)];
  p.move(4, -3).anchor('Reversal', {}, [14, 12]);
  p.airPortal(18, exit5, -90, [12, 12], { color: 0xdaaa5d });
  p.move(14, -4).curve(reversal);
  p.window(9, [7, 5], [22, 16], -2.5, -4);
  {
    // W5's lintel is red (hatched): leave 5C too high and you touch it (a red beam across the
    // top of the hole just in front of the wall: its top stays open to fall onto)
    const w = p.route[p.route.length - 1];
    if (w.t !== 'window') throw new Error('W5');
    const [dx, dz] = dirOf(w.heading);
    p.route.push({
      t: 'red',
      at: [r1(w.at[0] - dx), r1(w.at[1] + w.hole[1] - 0.9), r1(w.at[2] - dz)],
      size: [w.hole[0] - 0.2, 0.9, 0.6],
      heading: r3(headingTo(dx, dz)),
    });
  }
  p.move(9, -1.5, -4).curve({ lead: 3, legs: sc([arc(-20, 50, 1)]), ...SHORT, side: 'right' });
  p.move(24, -7, 10).curve({
    lead: 12,
    legs: sc([straight(10, 0.5), arc(-160, 125, 18, { red: 0.8 }), straight(90, 2)]),
    ...BROAD,
    side: 'left',
  });
  p.move(6, -2).gate([24, 18], 'Telescope Entry', { up: 5 });

  // ---- 6 Telescope rise ----
  p.move(14, -4).curve({ legs: sc([straight(200, 10)]), ...BROAD, side: 'left' });
  p.move(4, -2).anchor('Telescope', { flightSec: 0.9, up: 4 }, [14, 12]);
  p.move(12, -3).curve({ legs: sc([arc(-120, 165, 16), straight(30, 2)]), ...BROAD, side: 'left' });
  p.move(16, -5).curve({
    legs: sc([arc(-60, 80, -7, { toRadius: 68 }), straight(15, -2)]),
    ...MID,
    side: 'left',
  });
  const rise1 = lastCurve(p);
  p.move(20, -3).curve({
    lead: 8,
    legs: sc([arc(-45, 62, -6, { toRadius: 52 }), straight(35, -1)]),
    ...MID,
    side: 'left',
  });
  {
    // 6B-low: a weak first climb falls short of the second rise and carries on straight onto
    // this lower arc outside it; its launch throws you up through the telescope's aperture (the
    // finish) onto the gallery beyond it — slower than the rise, never a shortcut
    const aperture = new Pen(p.here(), p.heading).move(12, -1);
    const finBay = aperture.relP(30, 0, -10);
    const r1End = curvePath(rise1).at(curvePath(rise1).length).dir;
    const low6 = p.branch((b) => {
      const from = new Pen(rideAt(rise1, -1, 0.35), r3(headingTo(r1End.x, r1End.z)));
      b.pos = from.pos;
      b.heading = from.heading;
      b.move(24, -16, 7).curve({
        legs: [straight(20, 1), arc(-25, 90, 1), straight(15, 1)],
        ...WIDE,
        side: 'left',
        color: SALVAGE,
      });
      return lastCurve(b);
    });
    const end = rideAt(low6, -1, 0.35);
    const before = rideAt(low6, -11, 0.35);
    const pad: P3 = [
      r1(end[0] + (end[0] - before[0]) * 1.2),
      r1(end[1] - 5),
      r1(end[2] + (end[2] - before[2]) * 1.2),
    ];
    p.branch((b) => b.route.push({ t: 'launch', at: pad, to: finBay, flightSec: 1.9 }));
    const mid = aperture.here();
    forks.push({
      name: 'Lower rise (6B-low)',
      safe: 'carry enough speed up the first rise to catch the second one high',
      risky: 'fall short onto the lower arc 6B-low and take its launch up through the aperture',
      salvage: true,
      line: [
        { at: rideAt(rise1, -3, 0.35), surf: true },
        { at: rideAt(low6, 25, 0.35), surf: true },
        { at: rideAt(low6, -3, 0.35), surf: true },
        { at: pad },
        { at: mid, air: true },
        { at: finBay },
      ],
    });
  }

  p.move(12, -1).finishGate([24, 24], 30, 10);
  const fin = p.route[p.route.length - 1];
  if (fin.t !== 'gate') throw new Error('finish');

  observatory(deco, p, forks, {
    helixTop: hPath.at(hPath.plans[2].s0).pos.y,
    ringI,
    orbit: orbitC,
    ringV: ringVc,
    fin,
  });
  // (all of it is structure seen from a distance or at speed: one flat quad per face)
  for (const e of deco) if (e.t === 'block' && e.mat !== 'glass') e.lowDetail = true;

  return p.course({
    name: 'Cyclone Observatory',
    kind: 'surf',
    mode: 'intermediate',
    profile: 'MOVEMENT_PROFILE v1',
    parSec: 180,
    palette: PALETTE,
    sky: {
      top: 0x1e2c3d,
      horizon: 0x344a63,
      ground: 0x1c2a3b,
      fog: { near: 150, far: 700 },
      ambient: 0.9,
    },
    roomMat: 'plate',
    killY: -5,
    floors: [],
    autoFloors: { below: 25, pad: 20 },
    scenery: deco,
    forks,
  });
};
