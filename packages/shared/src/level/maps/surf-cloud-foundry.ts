// "Cloud Foundry" — surf map B03 (Beginner; docs/movement-map-design/maps/B03-cloud-foundry.md).
// An industrial weather station above the clouds: blue-gray steel ramps inside porcelain
// chambers round a huge stopped turbine. Core skill: vertical scoops (a descent turned into a
// controlled climb whose lip throws you gently upward) and broad aerial catches (meeting the
// receiving ramp along its tangent). Built as course data (level/course) on MOVEMENT_PROFILE v1.
// The route spirals round the turbine anticlockwise (Acts 1-5), one chamber lower per act, and
// the portal carries it to the south side for the last half circle (Act 6, clockwise):
//
//   1 Pressure intake  a bend west beside the rotor hub, two scoops onto wide receivers (the
//                      second shifted sideways), a broad left curve under the intake gantry → C1
//   2 Turbine skirts   two quarter circles round the turbine drum with an aligned crossing
//                      between them, a descent and a scoop lip, an upward transfer     → C2
//   3 Condenser path   a climbing arc, a low release onto seven oval bhop pads (two offset),
//                      a white crouch walkway beside them, the last hop boards a broad face → C3
//   4 Cloud bell       a big scoop through the chamber door, up through the bell opening, a
//                      wide half circle round the bell's far wall, out through a lower
//                      opening (a white lower catch under the first one)               → C4
//   5 Upper ducts      a duct into a lifting portal (same heading, 40 m higher), a broad
//                      S-curve over red vents, a diagonal catch                        → C5
//   6 Sky exhaust      half round the turbine's flared shell, a final scoop lip into the
//                      finish funnel: the lower mouth loops round the red-crowned exhaust
//                      collar, the upper deck (the faster line) runs straight past it
//
// The spec's own layout didn't fit the network range (|x|, |z| < 490) and its speeds were
// fitted to a slower rider than the measured bots: this is its route re-laid and re-timed
// (docs/movement-map-design/maps/B03-cloud-foundry.md, "As built").
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

/** Palette (brief: porcelain #E5E8E6, blue-gray steel #657786, amber #D5A45A, sky #91BDD2). */
const PALETTE = {
  ground: 0xe5e8e6,
  ground2: 0xcfd5d6,
  rock: 0x8c9aa6,
  rockDark: 0x4c5966,
  edge: 0xd5a45a,
  surf: 0x657786,
  surfEdge: 0xf2f4f1,
  stage: 0x7d8c99,
  stageGlow: 0xffe0a8,
  start: 0x91bdd2,
  finish: 0xd5a45a,
  portal: 0xffc870,
  pad: 0xd5a45a,
  arrow: 0xf7f4ea,
  cloud: 0xeef1ef,
  // (the glow under the cloud layer: sky blue, not red — red means the pressure vents only)
  danger: 0x91bdd2,
  leaf: 0x7d8c99,
  leafDark: 0x4c5966,
  trunk: 0x57636e,
  crystal: 0xbfe3f2,
  water: 0x8fb4c4,
  accent: 0x657786,
  accent2: 0xd5a45a,
  bhop: 0xd5a45a,
  hazard: 0xe8242c,
  anchor: 0x91bdd2,
};

/** Surf faces: blue-gray steel, a shade apart per act (darker than the vapor behind them). */
const STEEL = [0x657786, 0x5e7080, 0x6a7b88, 0x5a6b7b, 0x62768a, 0x687a84];
/** Safe lower catches and the walkway: porcelain white (never near red). */
const WHITE = 0xe5e8e6;

/** Face shapes (Beginner: broad faces, 55-60°). */
const BROAD = { height: 16, angle: 56 };
const WIDE = { height: 18, angle: 55 };
const STD = { height: 14, angle: 58 };

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

/** A standard restart bay: behind the landing it throws you back onto, on its ridge side. */
const BAY = {};

const r1 = (x: number): number => Math.round(x * 10) / 10;

/** Where a curve's racing line would be `s` metres (flat) along it, `depth` down its face. */
const rideAt = (e: CurveEl, s: number, depth = 0.35): P3 => {
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

/** The centre of a curve's arc leg `leg` (its ridge circle), flat [x, z]. */
const arcCentre = (e: CurveEl, leg: number): [number, number] => {
  const path = curvePath(e);
  let s = 0;
  for (let i = 0; i < leg; i++) {
    const l = e.legs[i];
    s += l.len ?? (Math.abs(l.turn ?? 0) * Math.PI * (l.radius ?? 20)) / 180;
  }
  const l = e.legs[leg];
  const r = path.at(s + 0.01);
  const sign = (l.turn ?? 0) > 0 ? 1 : -1;
  // (right of the way is (-dir.z, dir.x))
  return [
    r1(r.pos.x + -r.dir.z * sign * (l.radius ?? 20)),
    r1(r.pos.z + r.dir.x * sign * (l.radius ?? 20)),
  ];
};

/** The course data (pure JSON). */
export const cloudFoundryCourse = (): CourseData => {
  const p = new Pen([443, 470, -61], 0);
  const deco: SceneryElement[] = [];
  const forks: CourseFork[] = [];
  p.start([16, 16]);
  p.platform([10, 12], 'strafe');

  // ---- 1 Pressure intake (the north side, heading west, turning south) ----
  // a drop onto a broad ramp that bends west beside the rotor hub, dives into scoop S1 and
  // climbs 6 m to its lip
  p.move(12, -6).curve({
    legs: [straight(30, 3), arc(-90, 100, 5), straight(70, 8), straight(60, -6)],
    ...BROAD,
    side: 'right',
    color: STEEL[0],
  });
  p.move(4, 0).anchor('Scoop Lip', BAY, [16, 14]);
  // straight ahead onto the wide receiver 1B (scoop S2)
  p.move(16, -5).curve({
    lead: 15,
    legs: [straight(30, 2), straight(70, 8), straight(60, -5)],
    ...WIDE,
    side: 'right',
    color: STEEL[0],
  });
  p.move(4, 0).anchor('Second Lip', BAY, [16, 14]);
  // the receiver shifted 6 m sideways: a broad left curve under the intake gantry
  p.move(18, -5, 6).curve({
    lead: 15,
    legs: [straight(20, 1), arc(-90, 150, 6), straight(30, 1)],
    ...WIDE,
    side: 'left',
    color: STEEL[0],
  });
  const c1c = lastCurve(p);
  p.move(6, -2).gate([24, 18], 'Intake Gantry', { side: 14, up: 8 });

  // ---- 2 Turbine skirts (round the drum: west side south, south side east, then north-east) ----
  p.move(12, -3, -2).curve({
    legs: [straight(40, 2), arc(-90, 170, 6)],
    ...BROAD,
    side: 'left',
    color: STEEL[1],
  });
  const skirt = lastCurve(p);
  // (the turbine's axis: the centre of the skirt quarter)
  const [ox, oz] = arcCentre(skirt, 2);
  p.move(4, -1).anchor('Skirt Gap', BAY, [16, 14]);
  // a 30 m crossing; the second quarter's tangent is 15° left of the flight: align in the air
  p.move(26, -9, -4)
    .turn(-15)
    .curve({
      legs: [arc(-60, 170, 4), straight(150, 14), straight(50, -7)],
      ...WIDE,
      side: 'left',
      color: STEEL[1],
    });
  p.move(4, 0).anchor('Turbine Lip', BAY, [16, 14]);
  // a modest upward transfer off the lip onto the wide 2C
  p.move(16, -3, -9).curve({
    lead: 15,
    legs: [straight(160, 4)],
    ...WIDE,
    side: 'right',
    color: STEEL[1],
  });
  p.move(6, -2).gate([24, 18], 'Turbine Seal', { side: 4, flightSec: 0.75, up: 4 });

  // ---- 3 Condenser path (west along the north side through the condenser hall) ----
  // a climbing banked arc trades speed for height; its lip releases low onto the pads
  p.move(14, -4, 9).curve({
    legs: [straight(40, 4), arc(-105, 80, -10), straight(30, -7)],
    ...STD,
    side: 'left',
    color: STEEL[2],
  });
  p.move(22, -6.5, -2).bhopPads(
    [{ d: 0, size: [12, 20] }, { d: 15.2 }, { d: 15.6, turn: -15 }, { d: 15.9, turn: 15 }],
    [9, 12],
  );
  const padsA = p.route[p.route.length - 1];
  // (the recovery ring hangs mid-hop between P4 and P5)
  p.move(8.15, 1.2).anchor('Condenser', { back: 16, up: 4, flightSec: 0.75 }, [10, 12]);
  p.move(8.15, -1.2).bhopPads([{ d: 0 }, { d: 16.7, turn: 15 }, { d: 17.1, turn: -15 }], [9, 12]);
  const padsB = p.route[p.route.length - 1];
  // the last hop boards the broad 3B: a long descent, a scoop, the bend south
  p.move(24, -2, 3).curve({
    lead: 15,
    legs: [straight(240, 8), straight(60, -5), arc(-90, 110, 6), straight(30, 1)],
    ...BROAD,
    side: 'left',
    color: STEEL[2],
  });
  const face3 = lastCurve(p);
  // the condenser walkway: white grating 12 m to the left of the pads and 2.5 m lower (a missed
  // hop lands on it), a low pipe across it between P3 and P4 (crouch under it: standing you
  // don't fit, a jump doesn't clear it), a launch pad at its end boarding 3B: the slow way
  if (padsA.t === 'jumps' && padsB.t === 'jumps') {
    const pads = [...padsA.pads, ...padsB.pads];
    const p1 = pads[0].at;
    const z0 = r1(p1[2] + 12);
    const y0 = r1(p1[1] - 2.5);
    const walk: P3[] = pads.map((q) => [q.at[0], y0, z0]);
    const last = walk[walk.length - 1];
    const edge: P3 = [r1(last[0] - 10.1), y0, z0];
    const end: P3 = [r1(last[0] - 14), y0, z0];
    const board = rideAt(face3, 45);
    p.branch((b) => {
      // (it starts beside P1: a short jump down from its side)
      for (let i = 1; i < walk.length; i++)
        b.route.push({ t: 'path', from: walk[i - 1], to: walk[i], width: 3 });
      b.route.push({ t: 'path', from: last, to: edge, width: 3 });
      b.route.push({ t: 'launch', at: end, to: board, flightSec: 1.4 });
    });
    // the low pipe: its bottom 1.4 m over the grating (standing 1.8 m: blocked; crouched 1.1 m)
    const px = r1((pads[2].at[0] + pads[3].at[0]) / 2);
    deco.push({
      t: 'block',
      at: [px, r1(y0 + 1.4), z0],
      size: [5, 1, 1],
      heading: 270,
      color: PALETTE.pad,
      mat: 'trim',
      solid: true,
    });
    forks.push({
      name: 'Condenser walkway',
      safe: 'bunny-hop the seven pads',
      risky: 'walk the white grating beside them (crouch under the low pipe); its launch boards 3B',
      salvage: true,
      // (from past the pipe: bots don't crouch; the pipe has its own test)
      line: [
        ...walk.slice(3).map((at) => ({ at })),
        { at: end },
        { at: board, surf: true },
        { at: rideAt(face3, 100), surf: true },
      ],
    });
  }
  p.move(6, -2).gate([24, 18], 'Condenser Door', BAY);

  // ---- 4 Cloud bell (south down the west side into the bell chamber, round the bell) ----
  // the big scoop: down through the chamber door, 10 m up to the lip
  p.move(14, -5, -9).curve({
    legs: [straight(120, 2), straight(180, 8), straight(60, 2), straight(60, -10)],
    ...BROAD,
    side: 'right',
    color: STEEL[3],
  });
  const scoop4 = lastCurve(p);
  const lip4 = p.here();
  const head4 = p.heading;
  // up through the bell opening W4a
  p.window(10, [16, 10], [40, 30], -3.5, 2);
  // (the ring just past the opening, before 4C starts; its bay past the wall)
  p.move(2, 3.9, 0.4).anchor('Bell Skirt', { back: 14, side: 14 }, [16, 14]);
  // a wide half circle round the bell's far wall
  p.move(22, -7.9, 3.6).curve({
    lead: 20,
    legs: [straight(30, 1), arc(-180, 80, 4), straight(30, 0.5)],
    ...WIDE,
    side: 'left',
    color: STEEL[3],
  });
  const bell = lastCurve(p);
  // the white lower catch 4L: below and inside 4C's first straight (a release too weak for 4C
  // falls past its foot onto it); a launch past its end throws you back out onto 4C's face
  {
    const low = p.branch((b) => {
      b.pos = { x: lip4[0], y: lip4[1], z: lip4[2] };
      b.face(head4);
      b.move(20, -33, -7).curve({
        lead: 10,
        legs: [straight(40, 2)],
        ...WIDE,
        side: 'left',
        color: WHITE,
      });
      return lastCurve(b);
    });
    const end = rideAt(low, -1);
    const before = rideAt(low, -11);
    // (12 m on, 2 m further in: the launch flies back out onto 4C from its face side)
    const dx = (end[0] - before[0]) / 10;
    const dz = (end[2] - before[2]) / 10;
    const pad: P3 = [r1(end[0] + dx * 12 + dz * 2), r1(end[1] - 6), r1(end[2] + dz * 12 - dx * 2)];
    const back = rideAt(bell, 110);
    p.branch((b) => b.route.push({ t: 'launch', at: pad, to: back, flightSec: 1.8 }));
    forks.push({
      name: 'Bell lower catch',
      safe: 'fly through the bell opening onto 4C',
      risky: 'fall short onto the white lower catch and take the launch back up onto 4C',
      salvage: true,
      line: [
        { at: rideAt(low, 15), surf: true },
        { at: rideAt(low, 45), surf: true },
        { at: pad },
        { at: back, surf: true },
        { at: rideAt(bell, 170), surf: true },
      ],
    });
    // pressure vents on the bell floor, far below every line
    const [bx, bz] = arcCentre(bell, 2);
    for (const [dx, dz] of [
      [-18, -10],
      [16, -14],
      [0, 20],
    ])
      p.route.push({
        t: 'red',
        at: [r1(bx + dx), r1(end[1] - 45), r1(bz + dz)],
        size: [24, 6, 24],
        heading: 0,
      });
  }
  // out through the second, lower opening W4b
  p.window(12, [16, 10], [40, 28], -4.5, -3);
  p.move(22, -5.5, -3).curve({
    lead: 15,
    legs: [straight(280, 4)],
    ...WIDE,
    side: 'right',
    color: STEEL[3],
  });
  p.move(6, -2).gate([24, 18], 'Bell Exit', BAY);

  // ---- 5 Upper ducts (a duct north, the portal lifts you into the higher chamber) ----
  p.move(14, -4, 9).curve({
    legs: [straight(30, 1), arc(-15, 250, 4), arc(15, 250, 4), straight(30, 1)],
    ...BROAD,
    side: 'left',
    color: STEEL[4],
  });
  {
    // (the opening a little lower and further on: you fly into it at speed)
    p.move(0, -5);
    const o = p.relP(30);
    p.airPortal(30, [r1(ox - 405), r1(o[1] + 40), r1(oz + 430)], 0, [16, 16]);
  }
  p.move(1, 0).anchor('Upper Duct', BAY, [16, 14]);
  // a broad S-curve: bend A right, bend B left (red vents in the trough inside it)
  p.move(13, -4).curve({
    lead: 12,
    legs: [straight(20, 0.5), arc(90, 100, 3), straight(60, 1)],
    ...WIDE,
    side: 'right',
    color: STEEL[4],
  });
  p.move(4, -1).anchor('S-Bend', BAY, [16, 14]);
  p.move(14, -4, 9).curve({
    legs: [straight(10, 0.3), arc(-110, 90, 3), straight(40, 1)],
    ...BROAD,
    side: 'left',
    color: STEEL[4],
  });
  const bendB = lastCurve(p);
  // the diagonal catch: the flight runs 20° left of 5D's tangent
  p.move(22, -7, -8).curve({
    lead: 20,
    legs: [straight(20, 0.5), arc(20, 200, 1.5), straight(20, 0.5)],
    ...WIDE,
    side: 'right',
    color: STEEL[4],
  });
  // pressure vents in the trough inside bend B, far below it (a fall inside the bend)
  {
    const [cx, cz] = arcCentre(bendB, 2);
    const DEG = Math.PI / 180;
    const yOff = rideAt(bendB, 15 + 20 * DEG * 90)[1];
    for (const bearing of [160, 125, 90])
      p.route.push({
        t: 'red',
        at: [
          r1(cx + 72 * Math.sin(bearing * DEG)),
          r1(yOff - 40),
          r1(cz - 72 * Math.cos(bearing * DEG)),
        ],
        size: [10, 2, 34],
        heading: bearing - 90,
      });
  }
  p.move(6, -2).gate([30, 18], 'Exhaust Collar', { side: -14 });

  // ---- 6 Sky exhaust (half round the turbine's flared shell, south to the finish funnel) ----
  p.move(12, -4, 2).curve({
    legs: [straight(10, 0.5), arc(180, 200, 10), straight(50, -7)],
    ...BROAD,
    side: 'right',
    color: STEEL[5],
  });
  const shell = lastCurve(p);
  p.move(4, 0).anchor('Exhaust Lip', { back: 18, side: -14 }, [16, 14]);
  // the funnel's upper deck 6H (the faster line): steer 20 m right off the lip onto it; it runs
  // straight past the exhaust collar while the lower mouth loops round it
  const deck = p.branch((b) => {
    b.move(16, -4, 20).curve({
      legs: [straight(325, 18)],
      ...STD,
      side: 'left',
      color: STEEL[5],
    });
    return lastCurve(b);
  });
  forks.push({
    name: 'Upper deck',
    safe: 'fly straight off the last lip into the lower mouth and loop round the exhaust collar',
    risky: 'steer 20 m right in the air onto the upper deck, straight to the finish',
    line: [
      { at: rideAt(shell, -30), surf: true },
      { at: rideAt(shell, -1), surf: true },
      { at: rideAt(deck, 5), surf: true },
      { at: rideAt(deck, 150), surf: true },
      { at: rideAt(deck, -3), surf: true },
    ],
  });
  p.move(26, -6.5, 2).curve({
    lead: 15,
    legs: [
      straight(20, 0.5),
      arc(-90, 70, 2),
      straight(40, 1),
      arc(180, 70, 4),
      straight(40, 1),
      arc(-90, 70, 2),
      straight(20, 0.5),
    ],
    ...WIDE,
    side: 'right',
    color: STEEL[5],
  });
  const mouth = lastCurve(p);
  // the exhaust collar inside the lower mouth's loop, its crown a red pressure vent
  {
    const [kx, kz] = arcCentre(mouth, 4);
    const top = r1(rideAt(mouth, 150)[1] + 0.35 * WIDE.height - WIDE.height - 8);
    deco.push({
      t: 'block',
      at: [kx, 252, kz],
      size: [80, r1(top - 252), 80],
      round: true,
      solid: true,
      color: PALETTE.rock,
      mat: 'plate',
    });
    p.route.push({ t: 'red', at: [kx, r1(top + 0.05), kz], size: [50, 2, 50], heading: 0 });
  }
  p.move(8, 2, 8).finishGate([36, 26], 34, 12);

  // ---- the building round the route (scenery: none of it collides unless marked solid) ----
  /** A point beside a curve's ridge: `s` metres along it, `side` to the right, `up` above. */
  const beside = (e: CurveEl, s: number, side: number, up: number): P3 => {
    const path = curvePath(e);
    const r = path.at(s < 0 ? path.length + s : s);
    return [r1(r.pos.x - r.dir.z * side), r1(r.pos.y + up), r1(r.pos.z + r.dir.x * side)];
  };
  const headingAt = (e: CurveEl, s: number): number => {
    const path = curvePath(e);
    const d = path.at(s < 0 ? path.length + s : s).dir;
    return r1(((((Math.atan2(d.x, -d.z) * 180) / Math.PI) % 360) + 360) % 360);
  };
  // the stationary turbine: a porcelain drum, a steel shell flaring out under it and sinking
  // into vapor, a stopped five-blade rotor with amber tips on top
  deco.push({ t: 'block', at: [ox, 340, oz], size: [80, 100, 80], round: true, color: WHITE });
  deco.push({
    t: 'block',
    at: [ox, 305, oz],
    size: [112, 35, 112],
    round: true,
    color: PALETTE.surf,
    mat: 'plate',
  });
  deco.push({
    t: 'block',
    at: [ox, 440, oz],
    size: [22, 12, 22],
    round: true,
    color: PALETTE.surf,
  });
  for (let k = 0; k < 5; k++) {
    const h = 20 + k * 72;
    const dx = Math.sin((h * Math.PI) / 180);
    const dz = -Math.cos((h * Math.PI) / 180);
    deco.push({
      t: 'block',
      at: [r1(ox + dx * 76), 444, r1(oz + dz * 76)],
      size: [8, 2.5, 120],
      heading: h,
      color: WHITE,
      mat: 'panel',
    });
    deco.push({
      t: 'block',
      at: [r1(ox + dx * 142.6), 443.8, r1(oz + dz * 142.6)],
      size: [8.4, 3, 13],
      heading: h,
      color: PALETTE.pad,
      mat: 'glow',
    });
  }
  // the intake gantry: a steel bridge carrying the intake duct over 1C's last straight
  {
    const h = headingAt(c1c, -40);
    const run = WIDE.height / Math.tan((WIDE.angle * Math.PI) / 180);
    const mid = beside(c1c, -40, -run / 2, 9);
    deco.push({ t: 'block', at: mid, size: [52, 3, 8], heading: h, color: PALETTE.surf });
    deco.push({
      t: 'block',
      at: [mid[0], r1(mid[1] + 3), mid[2]],
      size: [52, 7, 5],
      heading: h,
      color: WHITE,
      mat: 'panel',
    });
    for (const side of [-24, 24])
      deco.push({
        t: 'lamp',
        at: beside(c1c, -40, -run / 2 + side, 19),
        color: 0xffc46b,
      });
  }
  // the chamber door on 4A: a porcelain wall with a tall doorway round the whole face
  {
    const s = 90;
    const h = headingAt(scoop4, s);
    const run = BROAD.height / Math.tan((BROAD.angle * Math.PI) / 180);
    for (const side of [-24, run + 22])
      deco.push({
        t: 'block',
        at: beside(scoop4, s, side, -BROAD.height - 20),
        size: [22, 70, 3],
        heading: h,
        color: WHITE,
        mat: 'panel',
      });
    deco.push({
      t: 'block',
      at: beside(scoop4, s, run / 2, 12),
      size: [60, 18, 3],
      heading: h,
      color: WHITE,
      mat: 'panel',
    });
    deco.push({
      t: 'block',
      at: beside(scoop4, s, run / 2, 10.5),
      size: [30, 1, 3.4],
      heading: h,
      color: PALETTE.pad,
      mat: 'glow',
    });
  }
  // the cloud bell: a steel skirt round the bell chamber (open where you fly in and out), its
  // crown of vapor over it (background)
  {
    const [bx, bz] = arcCentre(bell, 2);
    const yRim = r1(rideAt(bell, 60)[1] - 34);
    for (let b = 0; b < 360; b += 24) {
      // (the openings: in from the north-west, out to the north-east)
      if ((b >= 280 && b <= 340) || (b >= 20 && b <= 80)) continue;
      const a = (b * Math.PI) / 180;
      deco.push({
        t: 'block',
        at: [r1(bx + Math.sin(a) * 100), yRim, r1(bz - Math.cos(a) * 100)],
        size: [40, 26, 2.5],
        heading: b,
        color: b % 48 ? PALETTE.surf : PALETTE.rock,
        mat: 'plate',
      });
    }
    for (const [dx, dz, y, w] of [
      [0, 0, 110, 110],
      [-30, 20, 122, 80],
      [25, -20, 130, 60],
    ])
      deco.push({ t: 'cloud', at: [r1(bx + dx), r1(yRim + y), r1(bz + dz)], size: [w, w] });
  }
  // the condensate pool far under the pads
  if (padsA.t === 'jumps' && padsB.t === 'jumps') {
    const a = padsA.pads[0].at;
    const b = padsB.pads[padsB.pads.length - 1].at;
    deco.push({
      t: 'water',
      at: [r1((a[0] + b[0]) / 2), r1(a[1] - 18), r1((a[2] + b[2]) / 2 + 6)],
      size: [r1(Math.abs(a[0] - b[0]) + 40), 44],
      color: 0x9fc6d6,
    });
  }
  // the cloud layer far under the route (its tops just above the kill height): loose heaps of
  // cheap cloud, not a kill floor — the kill height does the killing
  deco.push({
    t: 'scatter',
    kind: 'cloud',
    count: 130,
    seed: 23,
    min: [-480, 222, -480],
    max: [480, 245, 480],
    size: [60, 100],
  });
  // (render budget: everything built of big plain faces is drawn as one flat quad per face —
  // the turbine, the bell, the collar, the gantry and the door are never seen up close enough
  // for the tiling to show; the low pipe stays a lit strip)
  for (const e of deco) if (e.t === 'block' && e.mat !== 'trim') e.lowDetail = true;
  return p.course({
    name: 'Cloud Foundry',
    kind: 'surf',
    mode: 'beginner',
    profile: 'MOVEMENT_PROFILE v1',
    parSec: 180,
    palette: PALETTE,
    sky: {
      top: 0x5f93b3,
      horizon: 0xd9e6ea,
      ground: 0xe5e8e6,
      sun: { dir: [0.4, 0.55, -0.5], color: 0xfff1d6, sizeDeg: 3 },
      sunLight: 0xfff0dc,
      fog: { near: 200, far: 900 },
      ambient: 1.1,
    },
    roomMat: 'plate',
    // (fall below the route into the cloud layer and you are back at your anchor)
    killY: 250,
    floors: [],
    scenery: deco,
    forks,
  });
};
