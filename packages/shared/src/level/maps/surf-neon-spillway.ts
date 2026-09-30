// "Neon Spillway" — surf map I01 (Intermediate; docs/movement-map-design/maps/I01-neon-spillway.md).
// Stormwater infrastructure under a neon city: wet concrete spillways with cyan ridge lights,
// dark piers, a pump hall with a lit column in the middle. Core skill: keeping speed through
// direction change after direction change, then choosing how early to leave the pump spiral.
// Built as course data (level/course) on MOVEMENT_PROFILE v1. The upper channels (Acts 1–3)
// run round the outside of the map high up; the spiral descends round the pump column; the
// bypass (Act 5) runs low under the flood teeth; the portal lifts you to the outfall (Act 6),
// which crosses the pump hall to the finish.
//
//   1 Street intake     a right-facing ramp bending left round a support pier, an opposing
//                       curve, a broad window, a long banked bend, an opposing bend      → C1
//   2 Double switch     S1 (generous: 110°/−80° bends) and S2 (tight R 50, an earlier
//                       reversal) over a low red strip, a climbing release onto the raised
//                       catch 2E (a weak one falls onto 2E-low and its launch), a broad face → C2
//   3 Flood teeth       a climbing banked U-turn, six bhop pads in three angled pairs
//                       between floodgate teeth over a red sluice, a ramp under a head-height
//                       lintel, a broad descending face                                   → C3
//   4 Pump spiral       a walled approach, a 300° spiral round the pump column; the main line
//                       leaves at its end through the wide low opening E2 onto a long sweep;
//                       the early line leaves over the ridge at φ≈225° through the narrow high
//                       opening E1 onto the far ramp's lead-in; both merge on R4          → C4
//   5 Broken bypass     a banked turn, a vertical scoop, a diagonal window with red bars, a
//                       short heading-correcting contact, a long opposing catch, a wide
//                       U-turn into the turning portal (+90°)                             → C5
//   6 Emergency outfall a settle ramp, two faster sweeping curves (a right sweep, a left
//                       U-turn), a climb, a rising transfer across the hall beside the column
//                       onto a forgiving receiver, the pressure gate
import type {
  AnchorEl,
  CourseData,
  CourseFork,
  CurveEl,
  CurveLeg,
  P3,
  SceneryElement,
  WindowEl,
} from '../course/types';
import { Pen } from '../course/pen';
import { curvePath, curveRidePoint } from '../course/curve';

const PALETTE = {
  ground: 0x68717b,
  ground2: 0x4e5761,
  rock: 0x2a3644,
  rockDark: 0x121d2b,
  edge: 0x53d8e2,
  surf: 0x68717b,
  surfEdge: 0x7fe9f2,
  stage: 0x2a3644,
  stageGlow: 0x53d8e2,
  start: 0x53d8e2,
  finish: 0xf2a65a,
  portal: 0x9a86d8,
  pad: 0xf2a65a,
  arrow: 0xd8f6fa,
  cloud: 0x2b3a4c,
  danger: 0x3b4a78,
  leaf: 0x3a4a5c,
  leafDark: 0x243140,
  trunk: 0x1a2432,
  crystal: 0x53d8e2,
  water: 0x16303c,
  accent: 0x7563a8,
  accent2: 0xf2a65a,
  bhop: 0xf2a65a,
  hazard: 0xe8242c,
  anchor: 0x53d8e2,
};

/** Wet concrete liners, a shade apart per act. */
const CONCRETE = [0x68717b, 0x6e7680, 0x626b75, 0x6b7480, 0x646d78, 0x707983];
/** Salvage ramps: a paler, dry concrete (a way back, not a line). */
const SALVAGE = 0x8a939c;

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
const r1 = (x: number): number => Math.round(x * 10) / 10;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;
/** Compass heading → flat unit direction [x, z]. */
const dirOf = (h: number): [number, number] => [Math.sin(h * DEG), -Math.cos(h * DEG)];
const headingTo = (dx: number, dz: number): number =>
  (((Math.atan2(dx, -dz) / DEG) % 360) + 360) % 360;

/** Where a curve's racing line would be `s` metres (flat) along it, `depth` down its face. */
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

/** Pump hall: its wall's radius, and the spiral's ridge radius. */
const HALL_R = 70;
const HELIX_R = 52;
/** How far R4's lead-in drops from where the early line lands on it to the merge. */
const FORK_LEAD_DROP = 20;
/** How far below the spiral's ridge at the early release E1's hole starts. */
const E1_DROP = 17.5;

/**
 * What holds the channels up and what surrounds them: dark concrete piers under the ramps
 * (every ~70 m, where nothing else of the route passes below), sodium maintenance lamps on
 * some of them, and the city: dark towers round the map with neon kept on their upper floors,
 * far outside the movement corridor. Pure decoration: none of it collides.
 */
const underworks = (p: Pen, forks: CourseFork[], hallTop: number): SceneryElement[] => {
  const out: SceneryElement[] = [];
  const curves = p.route.filter((e): e is CurveEl => e.t === 'curve');
  // everything of the way to keep clear of: ramp ridges, pads, the forks' points
  const keep: { x: number; y: number; z: number; e: unknown }[] = [];
  for (const e of curves) {
    const path = curvePath(e);
    for (let s = 0; s <= path.length; s += 6) {
      const r = path.at(s);
      keep.push({ x: r.pos.x, y: r.pos.y, z: r.pos.z, e });
    }
  }
  for (const e of p.route) {
    if (e.t === 'jumps')
      for (const q of e.pads) keep.push({ x: q.at[0], y: q.at[1], z: q.at[2], e });
    if ((e.t === 'gate' || e.t === 'anchor') && e.bay)
      keep.push({ x: e.bay[0], y: e.bay[1], z: e.bay[2], e });
    if (e.t === 'window' || e.t === 'red' || e.t === 'portal' || e.t === 'launch')
      keep.push({ x: e.at[0], y: e.at[1], z: e.at[2], e });
  }
  for (const f of forks)
    for (const q of f.line) keep.push({ x: q.at[0], y: q.at[1], z: q.at[2], e: f });
  let k = 0;
  for (const e of curves) {
    const path = curvePath(e);
    const run = e.height / Math.tan((e.angle * Math.PI) / 180);
    const side = e.side === 'right' ? 1 : e.side === 'left' ? -1 : 0;
    for (let s = 24; s < path.length - 14; s += 70) {
      const r = path.at(s);
      const rx = -r.dir.z;
      const rz = r.dir.x;
      const x = r.pos.x + rx * side * run * 0.5;
      const z = r.pos.z + rz * side * run * 0.5;
      const low = Math.min(...[-8, -4, 0, 4, 8].map((d) => path.at(s + d).pos.y));
      const topY = low - e.height - 1;
      const bottom = 40;
      const clear = keep.every(
        (q) => q.e === e || Math.hypot(q.x - x, q.z - z) > 24 || q.y > topY + 20 || q.y < bottom,
      );
      if (!clear || topY < bottom + 20) continue;
      out.push({
        t: 'block',
        at: [r1(x), bottom, r1(z)],
        size: [4, r1(topY - bottom), 4],
        round: true,
        color: k % 2 ? 0x243140 : 0x2a3644,
      });
      if (k % 3 === 0)
        out.push({
          t: 'lamp',
          at: [r1(x + rx * 3.4), r1(topY - 6), r1(z + rz * 3.4)],
          color: 0xf2a65a,
        });
      k++;
    }
  }
  // the city: towers round the map well outside the route, neon only near their tops
  const NEON = [0x7563a8, 0x53d8e2, 0x9a86d8, 0xe0609a];
  for (let i = 0; i < 8; i++) {
    // (two along each side of a square 540 m out, jittered)
    const edge = i % 4;
    const t = -260 + Math.floor(i / 4) * 460 + hash(i) * 80;
    const out1 = 540 + hash(i + 50) * 40;
    const [x, z] = [
      [t, -out1],
      [out1, t],
      [-t, out1],
      [-out1, -t],
    ][edge];
    const w = 24 + hash(i + 200) * 10;
    const h = hallTop + 20 + hash(i + 300) * 160;
    const hd = edge * 90;
    out.push({
      t: 'block',
      at: [r1(x), 0, r1(z)],
      size: [r1(w), r1(h), r1(w)],
      heading: hd,
      color: 0x18233a,
    });
    // a neon band or two on the side facing the map, high up
    const [fx, fz] = dirOf(hd + 180);
    const c = NEON[i % NEON.length];
    for (let b = 0; b < 1 + (i % 2); b++)
      out.push({
        t: 'block',
        at: [r1(x + fx * (w / 2 + 0.3)), r1(h - 18 - b * 26), r1(z + fz * (w / 2 + 0.3))],
        size: [r1(w * 0.7), 3, 0.5],
        heading: hd,
        mat: 'glow',
        color: c,
      });
  }
  return out;
};

/** A deterministic 0..1 value per integer (scenery placement). */
const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export const neonSpillwayCourse = (): CourseData => {
  const p = new Pen([-75, 450, -255], 90);
  const deco: SceneryElement[] = [];
  const forks: CourseFork[] = [];
  p.start([14, 16]);
  p.platform([10, 12], 'strafe');

  // ---- 1 Street intake ----
  p.move(12, -8).curve({
    legs: [straight(200, 14), arc(-50, 75, 8), straight(40, 3)],
    ...MID,
    side: 'right',
    color: CONCRETE[0],
  });
  {
    // the support pier the ramp bends round: inside the bend, 22 m in from the ridge
    const a = lastCurve(p);
    const r = curvePath(a).at(5 + 200 + 32.7);
    deco.push({
      t: 'block',
      at: [r1(r.pos.x + r.dir.z * 22), r1(r.pos.y - 150), r1(r.pos.z - r.dir.x * 22)],
      size: [14, 156, 14],
      round: true,
      solid: true,
      color: PALETTE.stage,
    });
    deco.push({
      t: 'lamp',
      at: [r1(r.pos.x + r.dir.z * 12), r1(r.pos.y - 30), r1(r.pos.z - r.dir.x * 12)],
      color: 0xf2a65a,
    });
  }
  p.move(4, -2).anchor('Pier', {}, [14, 12]);
  p.move(15, -5, 9).curve({
    legs: [arc(45, 90, 6), straight(30, 2)],
    ...MID,
    side: 'left',
    color: CONCRETE[0],
  });
  p.window(8, [16, 9], [26, 22], -5, -4.5);
  p.move(8, 0, -4.5).curve({
    legs: [arc(135, 85, 12), straight(70, 4)],
    ...MID,
    side: 'right',
    color: CONCRETE[0],
  });
  p.move(14, -5, 9).curve({
    legs: [arc(-40, 120, 6), straight(60, 3)],
    ...MID,
    side: 'left',
    color: CONCRETE[0],
  });
  p.move(6, -2).gate([22, 16], 'Intake Seal');

  // ---- 2 Double switch ----
  p.move(14, -5, -9).curve({
    legs: [straight(25, 2), arc(110, 80, 9), straight(45, 3)],
    ...MID,
    side: 'right',
    red: 0.78,
    color: CONCRETE[1],
  });
  p.move(15, -5, 9).curve({
    legs: [straight(15, 1), arc(-80, 100, 7), straight(25, 2)],
    ...MID,
    side: 'left',
    red: 0.78,
    color: CONCRETE[1],
  });
  p.move(4, -2).anchor('Switch', {}, [14, 12]);
  p.move(14, -5, -9).curve({
    legs: [arc(55, 50, 6), straight(18, 1)],
    ...MID,
    side: 'right',
    red: 0.78,
    color: CONCRETE[1],
  });
  p.move(13, -4, 8).curve({
    legs: [arc(-55, 50, 6, { red: 0.78 }), straight(20, 1), straight(30, -3)],
    ...MID,
    side: 'left',
    color: CONCRETE[1],
  });
  // the elevated catch 2E; an underpowered release falls short onto 2E-low, a broad salvage
  // ramp under it, whose launch throws you up onto 2F's lower band (slower, never a shortcut)
  const d2 = lastCurve(p);
  const low = p.branch((b) => {
    b.move(12, -24, -14).curve({
      legs: [straight(100, 3), arc(30, 150, 3), straight(60, 2)],
      ...WIDE,
      side: 'right',
      color: SALVAGE,
    });
    return lastCurve(b);
  });
  p.move(16, -2, -9).curve({
    legs: [straight(100, 4), arc(30, 150, 4), straight(40, 2)],
    ...STD,
    side: 'right',
    color: CONCRETE[1],
  });
  p.move(14, -5, 9).curve({
    legs: [arc(30, 160, 4), straight(50, 3)],
    ...STD,
    side: 'left',
    color: CONCRETE[1],
  });
  {
    const f2 = lastCurve(p);
    const end = rideAt(low, -1, 0.35);
    const before = rideAt(low, -11, 0.35);
    const pad: P3 = [
      r1(end[0] + (end[0] - before[0]) * 1.2),
      r1(end[1] - 7),
      r1(end[2] + (end[2] - before[2]) * 1.2),
    ];
    const back = rideAt(f2, 80, 0.35);
    p.branch((b) => b.route.push({ t: 'launch', at: pad, to: back, flightSec: 2.6 }));
    forks.push({
      name: 'Lower catch (2E-low)',
      safe: 'release on the climb with enough speed to catch the raised 2E',
      risky: 'fall short onto the lower salvage ramp and take its launch back up to 2F',
      salvage: true,
      line: [
        { at: rideAt(d2, -2, 0.35), surf: true },
        { at: rideAt(low, 50, 0.35), surf: true },
        ...[90, 120, 145, 170, 200].map((d) => ({ at: rideAt(low, d, 0.35), surf: true })),
        { at: rideAt(low, -3, 0.35), surf: true },
        { at: pad },
        { at: back, surf: true },
        { at: rideAt(f2, -5, 0.35), surf: true },
      ],
    });
  }
  p.move(6, -2).gate([24, 18], 'Switch Merge', { flightSec: 0.9, up: 5, side: 12 });

  // ---- 3 Flood teeth (a climbing U-turn to the right, six pads, a lintel, a broad face) ----
  p.move(14, -5).curve({
    legs: [straight(20, 1), arc(160, 65, -12), straight(20, -2)],
    ...STD,
    side: 'right',
    color: CONCRETE[2],
  });
  p.move(4, 0).anchor('Teeth', { back: 20, flightSec: 0.8, up: 4 }, [14, 12]);
  p.move(10, -3).bhopPads(
    [
      { d: 0 },
      { d: 15.5 },
      { d: 16, turn: 25 },
      { d: 16.4 },
      { d: 16.8, turn: -30, size: [6, 9] },
      { d: 17.2, size: [6, 9] },
    ],
    [6, 8],
  );
  {
    // floodgate teeth either side of the gaps between the pads (painted steel, never red), and
    // the red sluice basin under them
    const jumps = p.route[p.route.length - 1];
    if (jumps.t !== 'jumps') throw new Error('pads');
    const pads = jumps.pads;
    const tooth = (a: P3, b: P3) => {
      const h = headingTo(b[0] - a[0], b[2] - a[2]);
      const [dx, dz] = dirOf(h);
      const m = [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2];
      for (const k of [-1, 1])
        deco.push({
          t: 'block',
          at: [r1(m[0] - dz * 7.5 * k), r1(Math.min(a[1], b[1]) - 8), r1(m[1] + dx * 7.5 * k)],
          size: [3, 14, 5],
          heading: r3(h),
          solid: true,
          color: 0x3a4654,
        });
    };
    tooth(pads[1].at, pads[2].at);
    tooth(pads[2].at, pads[3].at);
    tooth(pads[3].at, pads[4].at);
    const xs = pads.map((q) => q.at[0]);
    const zs = pads.map((q) => q.at[2]);
    const hd = headingTo(xs[5] - xs[0], zs[5] - zs[0]);
    p.route.push({
      t: 'red',
      at: [r1((xs[0] + xs[5]) / 2), r1(pads[0].at[1] - 24), r1((zs[0] + zs[5]) / 2)],
      size: [44, 1, 110],
      heading: r3(hd),
    });
  }
  p.move(16, -1.5, 6).curve({
    legs: [straight(50, 3), arc(-20, 120, 2), straight(30, 2)],
    ...MID,
    side: 'left',
    depth: 0.55,
    color: CONCRETE[2],
  });
  {
    // L3: a head-height lintel across the ramp 45 m along — a stepped hood over the upper band
    // (ride the upper third and you hit it), 2 H clear over the band below
    const c = lastCurve(p);
    const r = curvePath(c).at(5 + 45);
    const [dx, dz] = [r.dir.x, r.dir.z];
    const left = (o: number): [number, number] => [r.pos.x + dz * o, r.pos.z - dx * o];
    const run = MID.height / Math.tan((MID.angle * Math.PI) / 180);
    const face = (d: number) => r.pos.y - MID.height * d;
    const topY = r.pos.y + 2.5;
    const hd = headingTo(dx, dz);
    const piece = (o0: number, o1: number, bottom: number) => {
      const [x, z] = left((o0 + o1) / 2);
      deco.push({
        t: 'block',
        at: [r1(x), r1(bottom), r1(z)],
        size: [r1(o1 - o0), r1(topY - bottom), 2],
        heading: r3(hd),
        solid: true,
        color: 0x3a4654,
      });
    };
    piece(-2, 0.13 * run, r.pos.y + 0.3);
    piece(0.13 * run, 0.26 * run, face(0.13) + 0.3);
    piece(0.26 * run, 0.4 * run, face(0.26) + 0.3);
    piece(0.4 * run, run + 3, face(0.4) + 3.6);
    // (its posts: behind the ridge and beyond the foot, down to the channel)
    piece(-3.5, -2, r.pos.y - 40);
    piece(run + 3, run + 4.5, r.pos.y - 40);
  }
  p.move(15, -6, -9).curve({
    legs: [straight(120, 7), arc(45, 100, 5), straight(60, 3)],
    ...STD,
    side: 'right',
    color: CONCRETE[2],
  });
  p.move(6, -2).gate([22, 16], 'Flood Door', { back: 10, side: -16 });

  // ---- 4 Pump spiral ----
  p.move(14, -5);
  const helixOpts: CurveOpts = {
    legs: [
      straight(150, 2),
      arc(150, HELIX_R, 5),
      arc(80, HELIX_R, 3, { red: 0.8 }),
      arc(70, HELIX_R, 2, { red: 0.8 }),
      straight(20, 1),
    ],
    ...HELIX,
    side: 'right',
    color: CONCRETE[3],
  };
  const helix = lastCurve(new Pen(p.here(), p.heading).curve(helixOpts));
  const hPath = curvePath(helix);
  const s0 = 5 + 150; // where the spiral starts (after the lead-in and the approach)
  const hs = (phi: number) => s0 + phi * DEG * HELIX_R;
  const top = hPath.at(s0);
  const O = { x: top.pos.x - top.dir.z * HELIX_R, z: top.pos.z + top.dir.x * HELIX_R };
  const h0 = helix.heading; // the approach's heading: the hall's frame
  /** A point of the hall at bearing `b` (relative to the approach heading) and radius `r`. */
  const hall = (b: number, r: number): [number, number] => {
    const d = dirOf(h0 - 90 + b);
    return [O.x + d[0] * r, O.z + d[1] * r];
  };
  // R4a (Pump): a ring round the spiral at φ 120 (from beyond its ridge to over the pool, its
  // bottom bar under the ramp), its bay outside the ridge throws you back on at φ 100
  {
    const ride = rideAt(helix, hs(120), 0.35);
    const rr = hPath.at(hs(120));
    // (the ring's middle 6 m in from the ridge: right of the way is inward)
    const mid = [rr.pos.x - rr.dir.z * 6, rr.pos.z + rr.dir.x * 6];
    const to = rideAt(helix, hs(100), 0.35);
    const [fx, fz] = dirOf(h0 + 100);
    // (left of the way (fx, fz) is (fz, -fx): outward)
    const bay: P3 = [r1(to[0] - fx * 26 + fz * 10), r1(to[1] + 5), r1(to[2] - fz * 26 - fx * 10)];
    const a: AnchorEl = {
      t: 'anchor',
      at: [r1(mid[0]), r1(ride[1] - 6.2), r1(mid[1])],
      heading: r3(h0 + 120),
      size: [16, 11],
      name: 'Pump',
      bay,
      bayHeading: r3(headingTo(to[0] - bay[0], to[2] - bay[2])),
      to,
      flightSec: 0.9,
    };
    p.route.push(a);
  }
  p.curve(helixOpts);
  const hEnd = p.here();
  const hEndHeading = p.heading;
  // the main exit E2: where the way on crosses the hall wall
  const wallHit = (from: P3, h: number): number => {
    const [dx, dz] = dirOf(h);
    const px = from[0] - O.x;
    const pz = from[2] - O.z;
    const b = px * dx + pz * dz;
    const c = px * px + pz * pz - HALL_R * HALL_R;
    return -b + Math.sqrt(b * b - c);
  };
  const tE2 = wallHit(hEnd, hEndHeading);
  const e2At: P3 = p.relP(tE2, 0, -15);
  const e2Bearing = headingTo(e2At[0] - O.x, e2At[2] - O.z);
  const e2Panel: WindowEl = {
    t: 'window',
    at: e2At,
    heading: r3(e2Bearing),
    hole: [16, 12],
    wall: [26, 16],
    go: 'strafe',
  };
  p.route.push(e2Panel);
  const panelOf = (w: WindowEl) => ({ bearing: w.heading, at: w.at, hole: w.hole, wall: w.wall! });
  // R4m: the main catch outside the wall, a long left sweep round the north of the hall that
  // brings it alongside the far ramp R4. R4 lies on the early release's flight line (the tangent
  // off the spiral at φ 225): the straight in the sweep is solved so its lead-in does.
  const relP = 225;
  const tangent = hall(relP, HELIX_R);
  const fHead = h0 + relP;
  const [fdx, fdz] = dirOf(fHead);
  const r4mLegs = (l: number): CurveLeg[] => [
    straight(60, 2),
    arc(-135, 100, 3),
    straight(l, 1),
    arc(60, 90, 3),
    straight(80, 2),
  ];
  const e2Drop = 22;
  const r4Side = -11;
  /** Where R4's axis runs, sideways of the early line (m, + = right), for a sweep straight `l`. */
  const offsetFor = (l: number): number => {
    const g = new Pen(p.here(), p.heading);
    g.move(tE2 + 25, -e2Drop).curve({ lead: 16, legs: r4mLegs(l), ...BROAD, side: 'left' });
    g.move(15, -5, r4Side);
    return (g.pos.x - tangent[0]) * -fdz + (g.pos.z - tangent[1]) * fdx;
  };
  let lo = 0;
  let hi = 300;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(offsetFor(mid)) === Math.sign(offsetFor(lo))) lo = mid;
    else hi = mid;
  }
  const sweep = r1(lo);
  p.move(tE2 + 25, -e2Drop).curve({
    lead: 16,
    legs: r4mLegs(sweep),
    ...BROAD,
    side: 'left',
    color: CONCRETE[3],
  });
  // R4: its lead-in starts just outside the wall on the early line
  p.move(15, -5, r4Side);
  const along = (p.pos.x - tangent[0]) * fdx + (p.pos.z - tangent[1]) * fdz;
  const r4Lead = r1(along - (Math.sqrt(HALL_R * HALL_R - HELIX_R * HELIX_R) + 10));
  p.curve({
    lead: r4Lead,
    leadDrop: FORK_LEAD_DROP,
    legs: [straight(60, 3)],
    ...STD,
    side: 'right',
    color: CONCRETE[3],
  });
  const r4 = lastCurve(p);
  // the early exit E1: where the early line (the tangent off the spiral's ridge at φ 225) crosses
  // the wall, a smaller opening (an alternative: no racing line through it)
  const cross = Math.sqrt(HALL_R * HALL_R - HELIX_R * HELIX_R);
  const relY = hPath.at(hs(relP)).pos.y;
  const e1Panel: WindowEl = {
    t: 'window',
    at: [r1(tangent[0] + fdx * cross), r1(relY - E1_DROP), r1(tangent[1] + fdz * cross)],
    heading: r3(headingTo(tangent[0] + fdx * cross - O.x, tangent[1] + fdz * cross - O.z)),
    hole: [9, 11],
    wall: [19, 15],
    alt: true,
  };
  p.route.push(e1Panel);
  forks.push({
    name: 'Early spiral release',
    safe: 'follow the spiral on round to the wide low opening (E2) and the long sweep outside',
    risky:
      'climb to the ridge by φ 215, go over it and fly straight through the high narrow opening (E1) onto the far ramp lead-in',
    line: [
      { at: rideAt(helix, hs(relP - 30), 0.35), surf: true },
      { at: rideAt(helix, hs(relP - 12), 0.2), surf: true },
      { at: rideAt(helix, hs(relP), 0.05), surf: true },
      { at: [e1Panel.at[0], r1(e1Panel.at[1] + 5), e1Panel.at[2]], air: true },
      { at: rideAt(r4, 18, 0.3), surf: true },
      { at: rideAt(r4, 60, 0.35), surf: true },
      { at: rideAt(r4, r4Lead * 0.6, 0.35), surf: true },
      { at: rideAt(r4, r4Lead + 20, 0.35), surf: true },
    ],
  });
  p.move(6, -2).gate([24, 18], 'Pump Exit');

  // ---- 5 Broken bypass (round under the flood teeth, then a wide turn back west) ----
  p.move(14, -5, 9).curve({
    legs: [straight(30, 2), arc(-135, 70, 4), straight(30, 2)],
    ...STD,
    side: 'left',
    color: CONCRETE[4],
  });
  p.move(4, -2).anchor('Bypass', { flightSec: 1.0, up: 6, side: -12, back: 30 }, [14, 12]);
  p.move(15, -5).curve({
    lead: 10,
    legs: [straight(50, 12), straight(45, -6)],
    ...MID,
    side: 'left',
    color: CONCRETE[4],
  });
  {
    // W5: the diagonal window two thirds along the flight to the short contact, a red bar
    // along its top and both sides (it limits how high and wide you may leave the scoop)
    const wh = p.heading - 27.9;
    const at = p.relP(12.5, -6.6, -2.6);
    const hole: [number, number] = [9, 7];
    p.route.push({ t: 'window', at, heading: r3(wh), hole, wall: [21, 17], go: 'strafe' });
    const [dx, dz] = dirOf(wh);
    const L = (x: number, y: number): P3 => [r1(at[0] - dz * x), r1(at[1] + y), r1(at[2] + dx * x)];
    p.route.push({
      t: 'red',
      at: L(0, hole[1] - 1),
      size: [hole[0] - 0.2, 0.9, 0.6],
      heading: r3(wh),
    });
    for (const k of [-1, 1])
      p.route.push({
        t: 'red',
        at: L(k * (hole[0] / 2 - 0.55), 0.1),
        size: [0.9, hole[1] - 1.1, 0.6],
        heading: r3(wh),
      });
  }
  p.move(17, -1.5, -9).curve({
    lead: 3,
    legs: [arc(-25, 40, 1)],
    ...SHORT,
    side: 'right',
    color: CONCRETE[4],
  });
  p.move(26, -7, 12).curve({
    lead: 12,
    legs: [straight(40, 2), arc(-60, 110, 3), straight(40, 2)],
    ...STD,
    side: 'left',
    color: CONCRETE[4],
  });
  p.move(4, -2).anchor('Culvert', {}, [14, 12]);
  p.move(10, -3, -9).curve({
    legs: [arc(175, 100, 7), straight(150, 4)],
    ...STD,
    side: 'right',
    color: CONCRETE[4],
  });
  // ---- 6 Emergency outfall (the portal throws you to the upper spillway, east of the hall) ----
  const act6 = (q: Pen) => {
    q.move(14, -4).curve({
      lead: 12,
      legs: [straight(50, 3)],
      ...STD,
      side: 'left',
      color: CONCRETE[5],
    });
    q.move(6, -2).gate([24, 18], 'Bypass Gate');
    // two faster sweeping curves: a right sweep, then a broad left turn back toward the hall
    q.move(14, -5, -9).curve({
      legs: [arc(90, 80, 5), straight(220, 5)],
      ...STD,
      side: 'right',
      color: CONCRETE[5],
    });
    q.move(4, -2).anchor('Outfall', {}, [14, 12]);
    q.move(15, -5, 9).curve({
      legs: [straight(10, 1), arc(-180, 60, 9), straight(20, 2), straight(60, -10)],
      ...STD,
      side: 'left',
      color: CONCRETE[5],
    });
  };
  // where the portal must put you so the last transfer crosses the hall's south chord: 6B's
  // release 46 m south of the column's line and 40 m east of it (hall frame)
  const ghost = new Pen([0, 0, 0], h0 + 270);
  act6(ghost);
  const [ex, ez] = hall(90, 40);
  const [sx, sz] = dirOf(h0 + 90);
  const exitY = r1(top.pos.y + 80);
  const exit: P3 = [r1(ex + sx * 46 - ghost.pos.x), exitY, r1(ez + sz * 46 - ghost.pos.z)];
  p.move(10, -6).airPortal(12, exit, 90, [12, 12], { color: 0x9a86d8 });
  act6(p);
  p.move(36, -8, 6).curve({
    legs: [straight(190, 8)],
    ...WIDE,
    side: 'left',
    depth: 0.3,
    color: CONCRETE[5],
  });
  p.move(8, -2).finishGate([24, 20], 30, 10);

  // ---- the pump hall ----
  {
    const baseY = r1(hEnd[1] - 60);
    const wallTop = r1(top.pos.y - 9);
    /** The openings in the wall: the window panels (their bearing, bottom, hole, wall). */
    const panels = [panelOf(e2Panel), panelOf(e1Panel)];
    const half = (w: number) => Math.asin(w / 2 / HALL_R) / DEG;
    const inPanel = (b: number) =>
      panels.some((q) => Math.abs(((b - q.bearing + 540) % 360) - 180) < half(q.wall[0]) - 0.5);
    // the wall: flat pieces of at most 12° round the circle, leaving the panels out
    const step = 0.5;
    let from = -1;
    const pieces: [number, number][] = [];
    for (let b = 0; b <= 360; b += step) {
      const open = !inPanel(b) && b < 360;
      if (open && from < 0) from = b;
      if ((!open || b - from >= 12) && from >= 0) {
        pieces.push([from, b]);
        from = open ? b : -1;
      }
    }
    for (const [b0, b1] of pieces) {
      const b = (b0 + b1) / 2;
      const w = 2 * (HALL_R + 1) * Math.sin(((b1 - b0) / 2) * DEG) + 1.2;
      const [dx, dz] = dirOf(b);
      deco.push({
        t: 'block',
        at: [r1(O.x + dx * (HALL_R + 1)), baseY, r1(O.z + dz * (HALL_R + 1))],
        size: [r1(w), r1(wallTop - baseY), 2],
        heading: r3(b),
        solid: true,
        color: PALETTE.stage,
      });
    }
    // round each panel's window: the wall below and above it
    for (const q of panels) {
      const [dx, dz] = dirOf(q.bearing);
      const at: P3 = [r1(O.x + dx * (HALL_R + 1)), baseY, r1(O.z + dz * (HALL_R + 1))];
      const lo = q.at[1] - (q.wall[1] - q.hole[1]) / 2;
      const hi = q.at[1] + q.hole[1] + (q.wall[1] - q.hole[1]) / 2;
      deco.push({
        t: 'block',
        at,
        size: [q.wall[0], r1(lo - baseY), 2],
        heading: r3(q.bearing),
        solid: true,
        color: PALETTE.stage,
      });
      if (wallTop > hi + 0.5)
        deco.push({
          t: 'block',
          at: [at[0], r1(hi), at[2]],
          size: [q.wall[0], r1(wallTop - hi), 2],
          heading: r3(q.bearing),
          solid: true,
          color: PALETTE.stage,
        });
    }
    // the pump column: dark steel drums with cyan light bands every 12 m
    const colTop = top.pos.y + 13;
    for (let y = baseY; y < colTop; y += 12) {
      deco.push({
        t: 'block',
        at: [r1(O.x), r1(y), r1(O.z)],
        size: [28, 11.4, 28],
        round: true,
        solid: true,
        color: 0x1a2432,
      });
      deco.push({
        t: 'block',
        at: [r1(O.x), r1(y + 11.4), r1(O.z)],
        size: [28, 0.6, 28],
        round: true,
        mat: 'glow',
        color: 0x53d8e2,
      });
    }
    // its crown, and sodium maintenance lamps along the top of the hall wall
    const crownY = baseY + Math.ceil((colTop - baseY) / 12) * 12;
    deco.push({
      t: 'block',
      at: [r1(O.x), r1(crownY), r1(O.z)],
      size: [20, 1.6, 20],
      round: true,
      mat: 'glow',
      color: 0x53d8e2,
    });
    for (let b = 15; b < 360; b += 30) {
      // (not under the approach, where it comes in over the wall)
      const over = (h0 - 90 + 360 - Math.acos(HELIX_R / HALL_R) / DEG + 720) % 360;
      if (inPanel(b) || Math.abs(((b - over + 540) % 360) - 180) < 16) continue;
      const [dx, dz] = dirOf(b);
      deco.push({
        t: 'lamp',
        at: [r1(O.x + dx * (HALL_R + 1)), wallTop, r1(O.z + dz * (HALL_R + 1))],
        color: 0xf2a65a,
      });
    }
    // the spray pool at the bottom
    deco.push({ t: 'water', at: [r1(O.x), baseY + 2, r1(O.z)], size: [150, 150], color: 0x16303c });
  }
  // ---- the approach slot: dark walls either side of the approach's last 60 m ----
  {
    const into = hPath.at(s0 - Math.sqrt(HALL_R * HALL_R - HELIX_R * HELIX_R) - 32);
    const [dx, dz] = [into.dir.x, into.dir.z];
    const run = HELIX.height / Math.tan((HELIX.angle * Math.PI) / 180);
    for (const off of [-5, run + 5]) {
      // (right of the way is (-dz, dx): the face side)
      deco.push({
        t: 'block',
        at: [r1(into.pos.x - dz * off), r1(into.pos.y - 16), r1(into.pos.z + dx * off)],
        size: [1.5, 24, 56],
        heading: r3(headingTo(dx, dz)),
        solid: true,
        color: PALETTE.stage,
      });
    }
  }
  deco.push(...underworks(p, forks, top.pos.y));
  // (all of it is dark structure seen from a distance or at speed: one flat quad per face)
  for (const e of deco) if (e.t === 'block') e.lowDetail = true;

  return p.course({
    name: 'Neon Spillway',
    kind: 'surf',
    mode: 'intermediate',
    profile: 'MOVEMENT_PROFILE v1',
    parSec: 180,
    palette: PALETTE,
    sky: {
      top: 0x0a1320,
      horizon: 0x2a2748,
      ground: 0x121d2b,
      fog: { near: 120, far: 600 },
      ambient: 0.8,
    },
    roomMat: 'panel',
    killY: 20,
    floors: [],
    autoFloors: { below: 25, pad: 25 },
    scenery: [...deco],
    forks,
  });
};
