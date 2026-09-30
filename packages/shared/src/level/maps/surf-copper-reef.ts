// "Copper Reef" — surf map B01 (Beginner; docs/movement-map-design/maps/B01-copper-reef.md).
// An abandoned coastal waterworks: copper spillways winding round pale limestone towers over a
// turquoise inlet, a lighthouse on its rock in the middle. Core skill: following curves and
// choosing contact height. Built as course data (level/course) on MOVEMENT_PROFILE v1. The route
// runs clockwise round the reef — north side, east side, south side — winds into the lighthouse
// coil, and the lens portal throws it out to the west side for the last two acts.
//
//   1 Intake          a broad left-facing ramp round the intake tower, a small gap to an
//                     opposing face, a lower wider catch curving on                   → C1
//   2 Twin channels   a left bend, a straight setup, a right bend; a support column stands
//                     in the transfer gap (no inside line yet), a wide receiver       → C2
//   3 Service crossing  a low ramp onto four staggered bhop pads (a walkway beside them),
//                     the last hop boards a broad face, a second hop phrase           → C3
//   4 Lighthouse coil a descending 270° helix round the lighthouse, a red strip low in its
//                     middle, out of its end onto two offset receivers                → C4
//   5 Lens passage    a portal in a brass lens turns you 90°, a settling ramp, a shallow
//                     scoop, a modest elevated transfer (a lower ramp catches weak ones) → C5
//   6 Outfall         two sweeping curves toward the sea, an opposing transfer, the finish
import type {
  CourseData,
  CourseFork,
  CurveEl,
  CurveLeg,
  P3,
  SceneryElement,
} from '../course/types';
import { Pen } from '../course/pen';
import { curvePath, curveRidePoint } from '../course/curve';

/** Palette (brief: oxidized turquoise #287F82, aged copper #A96C45, limestone #DED8C9, deep water #102F3C). */
const PALETTE = {
  ground: 0xded8c9,
  ground2: 0xcbc3b0,
  rock: 0xb9b19e,
  rockDark: 0x6f6a5f,
  edge: 0x62d6c8,
  surf: 0xa96c45,
  surfEdge: 0x7ff2e2,
  stage: 0xb08d57,
  stageGlow: 0xc8ffe6,
  start: 0x6de0b8,
  finish: 0xf2c46b,
  portal: 0x7ff2e2,
  pad: 0xf2c46b,
  arrow: 0xf7f1e3,
  cloud: 0xdfe9ea,
  danger: 0xe8242c,
  leaf: 0x3f7a6a,
  leafDark: 0x2c5a4f,
  trunk: 0x5a4a3c,
  crystal: 0x9ff5ff,
  water: 0x1d5f66,
  accent: 0x287f82,
  accent2: 0xffc46b,
  bhop: 0x287f82,
  hazard: 0xe8242c,
  anchor: 0xc8ffe6,
};

/** Spillway liners: aged copper, a shade apart per act (so each stretch reads as its own). */
const COPPER = [0xa96c45, 0xb07a52, 0x9c6440, 0xa9744a, 0xb3704a, 0xa06a48];

/** Face shapes (Beginner: broad faces, 55-60°). */
const BROAD = { height: 16, angle: 56 };
const WIDE = { height: 18, angle: 55 };
const STD = { height: 14, angle: 58 };

const arc = (
  turn: number,
  radius: number,
  drop: number,
  more: Partial<CurveLeg> = {},
): CurveLeg => ({
  turn,
  radius,
  drop,
  ...more,
});
const straight = (len: number, drop: number, more: Partial<CurveLeg> = {}): CurveLeg => ({
  len,
  drop,
  ...more,
});

/** A standard restart bay: behind the landing it throws you back onto, on its ridge side. */
const BAY = {};

const r1 = (x: number): number => Math.round(x * 10) / 10;

/** Where a curve's racing line would be `s` metres (flat) along it, `depth` down its face. */
const rideAt = (e: CurveEl, s: number, depth: number): P3 => {
  const path = curvePath(e);
  const r = path.at(s < 0 ? path.length + s : s);
  const face = e.side === 'both' ? (e.ride ?? 'right') : e.side;
  const q = curveRidePoint(e, r, face, depth);
  return [r1(q.x), r1(q.y), r1(q.z)];
};

/** The last element written (a curve, as its data). */
const lastCurve = (p: Pen): CurveEl => {
  const e = p.route[p.route.length - 1];
  if (e.t !== 'curve') throw new Error('not a curve');
  return e;
};

/**
 * The waterworks round the route: limestone piers holding the spillways up out of the sea
 * (every ~70 m, where nothing else passes below), warm maintenance lamps on some of them, and
 * rocks in the inlet. Pure decoration: none of it collides.
 */
const waterworks = (p: Pen): SceneryElement[] => {
  const out: SceneryElement[] = [];
  // every curve's ridge, sampled (to keep piers clear of anything below them)
  const curves = p.route.filter((e): e is CurveEl => e.t === 'curve');
  const samples: { x: number; y: number; z: number; e: CurveEl }[] = [];
  for (const e of curves) {
    const path = curvePath(e);
    for (let s = 0; s <= path.length; s += 6) {
      const r = path.at(s);
      samples.push({ x: r.pos.x, y: r.pos.y, z: r.pos.z, e });
    }
  }
  let k = 0;
  for (const e of curves) {
    const path = curvePath(e);
    for (let s = 20; s < path.length - 10; s += 70) {
      const r = path.at(s);
      // under the middle of the ramp's base, down to the sea
      const run = e.height / Math.tan((e.angle * Math.PI) / 180);
      const side = e.side === 'right' ? 1 : e.side === 'left' ? -1 : 0;
      const rx = -r.dir.z;
      const rz = r.dir.x;
      const x = r.pos.x + rx * side * run * 0.5;
      const z = r.pos.z + rz * side * run * 0.5;
      // (under the lowest point of the ramp's base round it: a scoop dips)
      const low = Math.min(...[-8, -4, 0, 4, 8].map((d) => path.at(s + d).pos.y));
      const top = low - e.height - 1;
      // (nothing else of the route may pass under it, near it)
      const clear = samples.every(
        (q) => q.e === e || Math.hypot(q.x - x, q.z - z) > 26 || q.y > top + 20,
      );
      if (!clear || top < 20) continue;
      out.push({
        t: 'block',
        at: [r1(x), 0, r1(z)],
        size: [4.5, r1(top), 4.5],
        round: true,
        color: k % 2 ? PALETTE.ground : PALETTE.ground2,
      });
      if (k % 2 === 0)
        out.push({ t: 'lamp', at: [r1(x + rx * 3.8), r1(top - 7), r1(z + rz * 3.8)] });
      k++;
    }
  }
  out.push({
    t: 'scatter',
    kind: 'island',
    count: 14,
    seed: 71,
    min: [-470, 3, -470],
    max: [470, 3, 470],
    size: [14, 34],
    clear: 30,
    style: 'stone',
  });
  return out;
};

/** The course data (pure JSON). */
export const copperReefCourse = (): CourseData => {
  const p = new Pen([-320, 362, -440], 90);
  const deco: SceneryElement[] = [];
  const forks: CourseFork[] = [];
  p.start([16, 16]);
  p.platform([10, 12], 'strafe');

  // ---- 1 Intake (the upper ring's north side, heading east, turning south) ----
  // a short drop onto a broad left-facing ramp that follows a shallow right curve round the
  // intake tower (the tower stands inside the curve)
  p.move(12, -6).curve({
    legs: [straight(240, 8), arc(45, 260, 8)],
    ...BROAD,
    side: 'left',
    color: COPPER[0],
  });
  deco.push({
    t: 'block',
    at: p.relP(-150, 70, -90),
    size: [22, 150, 22],
    round: true,
    color: PALETTE.ground,
  });
  p.move(4, -2).anchor('Intake Gap', BAY, [16, 14]);
  // a small gap to the opposing face; the second catch is lower and wider, curving on
  p.move(14, -6, -9).curve({
    legs: [straight(40, 2), arc(45, 260, 8)],
    ...WIDE,
    side: 'right',
    color: COPPER[0],
  });
  p.move(6, -2).gate([24, 18], 'Intake Arch', BAY);

  // ---- 2 Twin channels (the east side, heading south, turning west) ----
  // a left bend (its face on the inside of the bend)
  p.move(14, -5, 9).curve({
    legs: [straight(60, 3), arc(-25, 200, 5)],
    ...STD,
    side: 'left',
    color: COPPER[1],
  });
  p.move(4, -2).anchor('Splitter', BAY, [16, 14]);
  // the straight setup: two spillways side by side
  p.move(14, -5, -9).curve({
    legs: [straight(95, 3)],
    ...STD,
    side: 'right',
    color: COPPER[1],
  });
  p.move(14, -5, 9).curve({
    legs: [straight(95, 3)],
    ...STD,
    side: 'left',
    color: COPPER[1],
  });
  p.move(4, -2).anchor('Twin Sluice', BAY, [16, 14]);
  // the right bend: a broad face on the inside of the bend, it carries you round
  p.move(10, -5, -9).curve({
    legs: [straight(20, 1), arc(115, 160, 14)],
    ...BROAD,
    side: 'right',
    color: COPPER[1],
  });
  const bend = lastCurve(p);
  // the wide receiving ramp
  p.move(16, -5, 9).curve({
    legs: [straight(160, 6)],
    ...WIDE,
    side: 'left',
    color: COPPER[1],
  });
  const receiver = lastCurve(p);
  {
    // the support column: in the gap between the bend's end and the receiver, standing up out
    // of the water to just under the ramps
    const a = rideAt(bend, -10, 1);
    const b = rideAt(receiver, 10, 1);
    const top = r1(Math.min(a[1], b[1]) - 16);
    deco.push({
      t: 'block',
      at: [r1((a[0] + b[0]) / 2), 0, r1((a[2] + b[2]) / 2)],
      size: [7, top, 7],
      round: true,
      solid: true,
      color: PALETTE.ground,
    });
  }
  p.move(6, -2).gate([24, 18], 'Splitter Bridge', BAY);

  // ---- 3 Service crossing (the south side, heading west, turning north) ----
  // a low ramp, then four staggered bhop pads (left, right, left) over the service basin
  p.move(14, -5, -9).curve({
    legs: [straight(100, 4), arc(45, 200, 5)],
    ...STD,
    side: 'right',
    color: COPPER[2],
  });
  p.move(26, -7, -3).bhopPads(
    [
      { d: 0, size: [10, 20] },
      { d: 20, turn: -14 },
      { d: 18, turn: 24 },
      { d: 18, turn: -22 },
    ],
    [9, 12],
  );
  const pads = p.route[p.route.length - 1];
  // the last hop boards a broad surf face
  p.move(16, -2, 3).curve({
    legs: [straight(100, 4), arc(57, 210, 7)],
    ...BROAD,
    side: 'left',
    color: COPPER[2],
  });
  const face3 = lastCurve(p);
  // the service walkway: a narrow walk beside the pads, a little lower (a missed hop lands on
  // it), to a landing past the last pad whose launch pad boards the broad face: the slow way
  if (pads.t === 'jumps') {
    const walk: P3[] = pads.pads.map((q) => {
      const h = ((q.heading ?? 0) * Math.PI) / 180;
      // 10 m to the left of each pad, 2.5 m lower
      return [r1(q.at[0] - Math.cos(h) * 10), r1(q.at[1] - 2.5), r1(q.at[2] - Math.sin(h) * 10)];
    });
    const last = pads.pads[pads.pads.length - 1];
    const h = ((last.heading ?? 0) * Math.PI) / 180;
    const w = walk[walk.length - 1];
    const end: P3 = [r1(w[0] + Math.sin(h) * 10), w[1], r1(w[2] - Math.cos(h) * 10)];
    // (the walk stops at the edge of the launch pad's own landing)
    const edge: P3 = [r1(w[0] + Math.sin(h) * 6.1), w[1], r1(w[2] - Math.cos(h) * 6.1)];
    const board = rideAt(face3, 24, 0.35);
    p.branch((b) => {
      for (let i = 1; i < walk.length; i++)
        b.route.push({ t: 'path', from: walk[i - 1], to: walk[i], width: 3 });
      b.route.push({ t: 'path', from: walk[walk.length - 1], to: edge, width: 3 });
      // (the launch pad sits on a landing of its own at the end of the walk)
      b.route.push({ t: 'launch', at: end, to: board, flightSec: 1.1 });
    });
    forks.push({
      name: 'Service walkway',
      safe: 'bunny-hop the four pads',
      risky: 'walk the maintenance walkway beside them; its launch boards the broad face',
      salvage: true,
      line: [
        ...[...walk, end].map((at) => ({ at })),
        { at: board, surf: true },
        { at: rideAt(face3, 60, 0.35), surf: true },
      ],
    });
  }
  p.move(4, -2).anchor('Service Walk', { back: 32 }, [16, 14]);
  // a second hop phrase: the pads step down (a jump's apex is only 1.2 m: raised pads
  // would have to come much closer)
  p.move(24, -8, -4).bhopPads(
    [
      { d: 0, size: [10, 20] },
      { d: 20, turn: 12, rise: -1.5 },
      { d: 19, turn: -12, rise: -2 },
    ],
    [9, 12],
  );
  p.move(10, 1).gate([22, 16], 'Service Arch', BAY);

  // ---- 4 Lighthouse coil (the west side, heading north, turning in to the lighthouse) ----
  p.move(14, -6).curve({
    legs: [straight(120, 4), arc(90, 90, 6)],
    ...STD,
    side: 'right',
    color: COPPER[3],
  });
  p.move(4, -2).anchor('Coil Stair', BAY, [16, 14]);
  p.move(14, -5, 9).curve({
    legs: [straight(190, 6)],
    ...STD,
    side: 'left',
    color: COPPER[3],
  });
  p.move(4, -2).anchor('Lamp Room', BAY, [16, 14]);
  // the helix: 270° down round the lighthouse, turning left, its face toward the tower; a red
  // strip marks the lowest unusable edge in the middle
  p.move(10, -5, 9).curve({
    legs: [arc(-90, 64, 10), arc(-100, 64, 12, { red: 0.74 }), arc(-80, 64, 10)],
    height: 16,
    angle: 60,
    side: 'left',
    color: COPPER[3],
  });
  const coil = lastCurve(p);
  // out of the coil onto two offset receivers: a broad low catch, then the
  // second offset one across a short gap
  p.move(22, -6, 6).curve({
    legs: [straight(120, 5)],
    ...WIDE,
    side: 'right',
    color: COPPER[3],
  });
  p.move(14, -5, 9).curve({
    legs: [straight(100, 4)],
    ...STD,
    side: 'left',
    color: COPPER[3],
  });
  p.move(6, -2).gate([24, 18], 'Lighthouse Window', BAY);

  // ---- 5 Lens passage (the portal throws you to the lower ring's north side, heading west) ----
  p.move(14, -5, -9).curve({
    legs: [straight(70, 3)],
    ...STD,
    side: 'right',
    color: COPPER[4],
  });
  p.move(4, -2).anchor('Lens', BAY, [16, 14]);
  const exit: P3 = [360, 196, -390];
  p.airPortal(18, exit, 90, [16, 16]);
  // a generous settling ramp and a shallow scoop
  p.move(14, -4).curve({
    lead: 12,
    legs: [straight(250, 3), straight(80, 9), straight(80, -6)],
    ...WIDE,
    side: 'left',
    color: COPPER[4],
  });
  const scoop = lastCurve(p);
  p.move(4, -1).anchor('Scoop', BAY, [16, 14]);
  // a lower salvage ramp (off the racing line) catches underpowered departures below the
  // elevated transfer; a launch at its end throws you back up onto the receiver (extra travel,
  // never a shortcut)
  const salvage = p.branch((b) => {
    b.move(12, -16).curve({
      legs: [straight(70, 4)],
      ...BROAD,
      side: 'right',
      color: COPPER[4],
    });
    return lastCurve(b);
  });
  // a modest elevated transfer (up onto the receiver)
  p.move(12, 1, -9).curve({
    legs: [straight(60, 3), arc(-90, 240, 12), straight(80, 3)],
    ...STD,
    side: 'right',
    color: COPPER[4],
  });
  const raised = lastCurve(p);
  {
    // (the landing a few metres past the salvage ramp's end, below its line)
    const end = rideAt(salvage, -1, 0.35);
    const before = rideAt(salvage, -11, 0.35);
    const pad: P3 = [
      r1(end[0] + (end[0] - before[0]) * 1.2),
      r1(end[1] - 7),
      r1(end[2] + (end[2] - before[2]) * 1.2),
    ];
    const back = rideAt(raised, 140, 0.35);
    p.branch((b) => b.route.push({ t: 'launch', at: pad, to: back, flightSec: 2.2 }));
    forks.push({
      name: 'Lower salvage ramp',
      safe: 'make the elevated transfer',
      risky: 'fall short onto the lower salvage ramp and take the launch back up',
      salvage: true,
      line: [
        { at: rideAt(scoop, -2, 0.35), surf: true },
        { at: rideAt(salvage, 14, 0.35), surf: true },
        { at: rideAt(salvage, 50, 0.35), surf: true },
        { at: pad },
        { at: back, surf: true },
        { at: rideAt(raised, 180, 0.35), surf: true },
      ],
    });
  }
  p.move(6, -2).gate([24, 18], 'Lens Outfall', BAY);

  // ---- 6 Outfall (from the west side round through the middle of the reef, down toward the
  // sea: two long sweeping curves, a familiar opposing transfer, the finish below the route) ----
  p.move(14, -6, 9).curve({
    legs: [straight(40, 3), arc(-90, 210, 16)],
    ...BROAD,
    side: 'left',
    color: COPPER[5],
  });
  p.move(4, -2).anchor('Outfall', BAY, [16, 14]);
  p.move(10, -6, -9).curve({
    legs: [straight(200, 10)],
    ...BROAD,
    side: 'right',
    color: COPPER[5],
  });
  p.move(16, -6, 9).curve({
    legs: [straight(60, 4), arc(-90, 200, 14)],
    ...WIDE,
    side: 'left',
    color: COPPER[5],
  });
  p.move(16, -6, -9).curve({
    legs: [straight(150, 12)],
    ...WIDE,
    side: 'right',
    color: COPPER[5],
  });
  p.move(8, -2).finishGate([24, 20], 34, 12);

  // the lighthouse stands in the middle of the coil, its beam over the sea
  {
    // (a left turn: the centre is to the left of its start)
    const h = (coil.heading * Math.PI) / 180;
    const c: P3 = [r1(coil.at[0] - Math.cos(h) * 64), 0, r1(coil.at[2] - Math.sin(h) * 64)];
    deco.push({ t: 'lighthouse', at: c, height: r1(coil.at[1] + 70), heading: 200 });
  }
  deco.push(...waterworks(p));
  return p.course({
    name: 'Copper Reef',
    kind: 'surf',
    mode: 'beginner',
    profile: 'MOVEMENT_PROFILE v1',
    parSec: 180,
    palette: PALETTE,
    sky: {
      top: 0x1c4652,
      horizon: 0x9cc4bd,
      ground: 0x102f3c,
      sun: { dir: [-0.5, 0.35, 0.6], color: 0xffe2b0, sizeDeg: 3 },
      sunLight: 0xffe6c4,
      fog: { near: 180, far: 820 },
      ambient: 1,
    },
    roomMat: 'sand',
    killY: 4,
    floors: [],
    scenery: [{ t: 'water', at: [0, 2, 0], size: [2000, 2000] }, ...deco],
    forks,
  });
};
