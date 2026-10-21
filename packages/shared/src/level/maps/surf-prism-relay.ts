// "Prism Relay" — surf map I04 (Intermediate; docs/movement-map-design/maps/I04-prism-relay.md).
// A light-routing facility: dark optical chambers, pearl surf faces with ice-blue ridge strips,
// suspended glass prisms and a thin beam of light that runs through every portal. Core skill:
// carrying momentum through portals that turn the world under you (every momentum portal keeps
// your speed, your vertical speed and where you crossed its opening). Built as course data
// (level/course) on MOVEMENT_PROFILE v1. The portals fold the route into three floors inside
// the network range (upper: Acts 1–2, middle: Acts 3–4, lower: Acts 4–6):
//
//   1 Input lens     two broad curves into ○ (no turn), a quarter bend into ◎ (no turn): its
//                    exit lands you on 1D by where you crossed it (a white salvage 1D-low
//                    under a far-right crossing)                                        → C1
//   2 Quarter turn   an S-curve into ▷ (+90°) across a short gap onto a curved receiver, a
//                    reverse bend into ◁ (−90°, a longer catch from higher over 2E)     → C2
//   3 Lens feet      a climb to a lip, seven prism pads over a red pool with a low lintel,
//                    a diagonal face, a diagonal window, a long left bend              → C3
//   4 Split spectrum the long route (4B, ◇, 4C, ◈, 4D) or the high line (4A's ridge band,
//                    the climbing 4H, the small blue ◆, 4E, a diagonal catch); both merge
//                    on 4M                                                               → C4
//   5 Relay chain    a long loop into ↱ (+90°), the brief face 5B bending onto the
//                    diagonal, window W5, ↰ (−90°, out at 62°), 5C, the red core to bend
//                    round onto the wide 5D                                            → C5
//   6 Output beam    a 180° sweep round the Output Prism, a rising transfer, the broad
//                    finish portal ✦ up into the calm glass chamber                    → F
import type {
  CourseData,
  CourseFork,
  CurveEl,
  CurveLeg,
  P3,
  PortalEl,
  RouteElement,
  SceneryElement,
} from '../course/types';
import { Pen } from '../course/pen';
import { curvePath, curveRidePoint } from '../course/curve';
import { expandCourse } from '../course/expand';

/** Palette (brief: charcoal #171B25, pearl #D7DCE4, ice blue #7ACFE0, spectral accents). */
const PALETTE = {
  ground: 0xd7dce4,
  ground2: 0xb7bfcc,
  rock: 0x2a3040,
  rockDark: 0x171b25,
  edge: 0x7acfe0,
  surf: 0xd7dce4,
  surfEdge: 0x7acfe0,
  stage: 0x262c3a,
  stageGlow: 0x7acfe0,
  start: 0x7acfe0,
  finish: 0xd7dce4,
  portal: 0xd7dce4,
  pad: 0x7acfe0,
  arrow: 0xd7dce4,
  cloud: 0x202634,
  danger: 0x2c3550,
  leaf: 0x3a4254,
  leafDark: 0x252b38,
  trunk: 0x1e2330,
  crystal: 0xbfe9f2,
  water: 0x1c2433,
  accent: 0x7acfe0,
  accent2: 0xd7dce4,
  bhop: 0xa8e4ee,
  hazard: 0xe8242c,
  anchor: 0x7acfe0,
};

/** Pearl faces, a shade apart per act. */
const PEARL = [0xd7dce4, 0xcdd3de, 0xc4cbd8, 0xd2d7e1, 0xc9d0dc, 0xdce0e8];

/** Portal groups: colour + a mark per portal (shown over the way in and over the exit). */
const INPUT = 0xf2b35c;
const QUARTER = 0x9a86f0;
const SPECTRUM = 0xd46fd6;
/** The high spectrum portal (the optional line): its own spectral blue, never mistaken for ◇ */
const HIGH = 0x5aa2ff;
const RELAY = 0x7fdc9e;
const OUTPUT = 0xd7dce4;
/** Salvage receivers (a safe lower catch): bright pearl white, never near red. */
const SALVAGE = 0xeef1f5;

/** Face shapes (README): Intermediate. */
const SHORT = { height: 9, angle: 65 };
const MID = { height: 12, angle: 60 };
const STD = { height: 14, angle: 58 };
const BROAD = { height: 16, angle: 56 };
const WIDE = { height: 18, angle: 55 };

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

// (+ 0: never a negative zero, which JSON would not keep)
const r1 = (x: number): number => Math.round(x * 10) / 10 + 0;

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

/** A standard restart bay: behind the landing it throws you back onto, on its ridge side. */
const BAY = {};

/**
 * A portal `f` metres on from the release (the pen), its opening's middle 0.8 m over where your
 * body passes flying at `v` m/s with vertical speed `vy` (a ballistic flight): nobody has to
 * brake or dive to meet it. The pen goes on from its exit. `from`: the pen is already this far
 * [ahead, up] from the release (an anchor ring on the way).
 */
const portal = (
  p: Pen,
  f: number,
  v: number,
  vy: number,
  exit: P3,
  turn: number,
  size: [number, number],
  look: { color?: number; glyph?: string; offset?: boolean; vertical?: 'keep' | 'zero' },
  from: [number, number] = [0, 0],
): P3 => {
  const t = (f + from[0]) / v;
  p.move(0, r1(vy * t - 10 * t * t + 0.9 + 0.8 - from[1]));
  const at = p.relP(f);
  p.airPortal(f, exit, turn, size, look);
  return at;
};

/** Drop scale (spec drops → measured bot speeds). */
const K = 0.5;
const d = (x: number): number => r1(x * K);

/** The portal exits (feet): where each portal puts you — the layout of the building. */
const EXIT = {
  P1: [30, 452, -462] as P3,
  P2: [330, 452, -468] as P3,
  P3: [260, 420, -210] as P3,
  P4: [400, 360, -440] as P3,
  P5a: [160, 310, -10] as P3,
  P5b: [-330, 230, 450] as P3,
  P6: [-309, 246, 435] as P3,
  P7: [-120, 215, -200] as P3,
  P8: [-250, 195, -20] as P3,
  PF: [0, 440, 60] as P3,
};

/** The course data (pure JSON). */
export const prismRelayCourse = (): CourseData => {
  const p = new Pen([-450, 470, -430], 90);
  const forks: CourseFork[] = [];
  const deco: SceneryElement[] = [];
  const ramps: Record<string, CurveEl> = {};
  const ramp = (name: string): CurveEl => (ramps[name] = lastCurve(p));
  /**
   * A wider lower receiver under a portal's exit catch (a small exit error lands on it) and a
   * launch pad past its end throwing you back onto the receiver above: a salvage fork.
   */
  const salvage = (o: {
    from: P3;
    heading: number;
    move: P3;
    side: 'left' | 'right';
    legs: CurveLeg[];
    board: CurveEl;
    s: number;
    flightSec: number;
    name: string;
    risky: string;
  }): void => {
    const low = p.branch((b) => {
      b.pos = { x: o.from[0], y: o.from[1], z: o.from[2] };
      b.face(o.heading);
      b.move(o.move[0], o.move[1], o.move[2]).curve({
        lead: 10,
        legs: o.legs,
        ...WIDE,
        side: o.side,
        color: SALVAGE,
      });
      return lastCurve(b);
    });
    const end = rideAt(low, -1);
    const before = rideAt(low, -11);
    const dx = (end[0] - before[0]) / 10;
    const dz = (end[2] - before[2]) / 10;
    const pad: P3 = [r1(end[0] + dx * 12), r1(end[1] - 6), r1(end[2] + dz * 12)];
    const to = rideAt(o.board, o.s);
    p.branch((b) => b.route.push({ t: 'launch', at: pad, to, flightSec: o.flightSec }));
    forks.push({
      name: o.name,
      safe: 'catch the receiver after the portal',
      risky: o.risky,
      salvage: true,
      line: [
        { at: rideAt(low, 14), surf: true },
        { at: rideAt(low, -12), surf: true },
        { at: pad },
        { at: to, surf: true },
        { at: rideAt(o.board, o.s + 30), surf: true },
      ],
    });
  };

  p.start([14, 16]);
  p.platform([10, 12], 'strafe');

  // ---- 1 Input lens ----
  p.move(12, -8).curve({
    legs: [straight(70, d(6)), arc(60, 110, d(10)), straight(30, d(2))],
    ...STD,
    side: 'right',
    color: PEARL[0],
  });
  ramp('1A');
  p.move(4, -2).anchor('Collimator', BAY, [14, 12]);
  p.move(10, -3, 9).curve({
    legs: [arc(-60, 120, d(8)), straight(30, d(3))],
    ...STD,
    side: 'left',
    color: PEARL[0],
  });
  ramp('1B');
  portal(p, 14, 34, -1.5, EXIT.P1, 0, [12, 12], { color: INPUT, glyph: '○', offset: true });
  p.move(14, -7).curve({
    lead: 12,
    legs: [straight(40, d(3)), arc(90, 90, d(9)), straight(20, d(2))],
    ...BROAD,
    side: 'right',
    color: PEARL[0],
  });
  ramp('1C');
  portal(p, 14, 34, -2, EXIT.P2, 0, [12, 12], { color: INPUT, glyph: '◎', offset: true });
  p.move(14, -7, -3.5).curve({
    lead: 12,
    depth: 0.3,
    legs: [straight(110, d(7))],
    ...WIDE,
    side: 'right',
    color: PEARL[0],
  });
  ramp('1D');
  // 1D-low: a crossing far right in P2 comes out past 1D's foot, onto this
  salvage({
    from: EXIT.P2,
    heading: 180,
    move: [14, -21, 15],
    side: 'right',
    legs: [straight(45, 2)],
    board: ramps['1D'],
    s: 105,
    flightSec: 1.4,
    name: '1D-low (Input salvage)',
    risky:
      "come out of ◎ too far right: past 1D's foot onto the white 1D-low, its launch throws you back up",
  });
  p.move(6, -2).gate([24, 18], 'Input Collar', BAY);

  // ---- 2 Quarter turn ----
  p.move(14, -5, 9).curve({
    legs: [arc(-50, 100, d(7)), straight(30, d(2))],
    ...STD,
    side: 'left',
    color: PEARL[1],
  });
  ramp('2A');
  p.move(14, -5, -9).curve({
    legs: [arc(50, 100, d(7)), straight(130, d(5))],
    ...STD,
    side: 'right',
    color: PEARL[1],
  });
  ramp('2B');
  portal(p, 14, 34, -2, EXIT.P3, 90, [12, 12], { color: QUARTER, glyph: '▷', offset: true });
  p.move(16, -8).curve({
    lead: 12,
    legs: [straight(110, d(4)), arc(-45, 110, d(7)), straight(30, d(2))],
    ...STD,
    side: 'left',
    color: PEARL[1],
  });
  ramp('2C');
  p.move(4, -2).anchor('Mirror', BAY, [14, 12]);
  p.move(10, -3, -9).curve({
    legs: [arc(45, 110, d(7)), straight(90, d(4))],
    ...STD,
    side: 'right',
    color: PEARL[1],
  });
  ramp('2D');
  portal(p, 14, 34, -2, EXIT.P4, -90, [12, 12], { color: QUARTER, glyph: '◁', offset: true });
  p.move(30, -20).curve({
    lead: 16,
    legs: [arc(-12, 200, d(3)), straight(190, d(8))],
    ...BROAD,
    side: 'left',
    color: PEARL[1],
  });
  ramp('2E');
  // 2E-low: a short or low P4 exit falls past 2E's foot onto this
  salvage({
    from: EXIT.P4,
    heading: 180,
    move: [30, -36, -24],
    side: 'left',
    legs: [straight(60, 2)],
    board: ramps['2E'],
    s: 150,
    flightSec: 1.7,
    name: '2E-low (Quarter salvage)',
    risky:
      "come out of ◁ low or left: past 2E's foot onto the white 2E-low, its launch throws you back up",
  });
  p.move(6, -2).gate([24, 18], 'Quarter-Turn Merge', { flightSec: 0.9, up: 6 });

  // ---- 3 Lens feet ----
  p.move(14, -5, -9).curve({
    legs: [arc(12, 150, d(2)), straight(100, d(5)), straight(80, -15)],
    ...STD,
    side: 'right',
    color: PEARL[2],
  });
  ramp('3A');
  p.move(4, -1).anchor('Prism Feet', { back: 20, side: 12, flightSec: 0.8, up: 4 }, [14, 12]);
  p.move(15, -1).bhopPads(
    [
      { d: 0, size: [8, 11] },
      { d: 18.5, turn: -15 },
      { d: 18.8, turn: 22 },
      { d: 19.1, turn: -22 },
      { d: 19.4, turn: 18 },
      { d: 19.6, turn: -14 },
      { d: 19.8, turn: 11 },
    ],
    [7, 9],
  );
  const pads = p.route[p.route.length - 1];
  // L3: a low opening (a solid lintel 4.2 m over the pads, two posts) on the hop F6 → F7
  if (pads.t === 'jumps') {
    const [a, b] = pads.pads.slice(-2).map((q) => q.at);
    const hd = r1((Math.atan2(b[0] - a[0], -(b[2] - a[2])) * 180) / Math.PI);
    const m: P3 = [r1((a[0] + b[0]) / 2), a[1], r1((a[2] + b[2]) / 2)];
    const c = Math.cos((hd * Math.PI) / 180);
    const sn = Math.sin((hd * Math.PI) / 180);
    const side = (k: number, u: number): P3 => [r1(m[0] + c * k), r1(m[1] + u), r1(m[2] + sn * k)];
    p.route.push({ t: 'wall', at: side(0, 4.2), size: [14, 2.4, 1.2], heading: hd });
    for (const k of [-6, 6])
      p.route.push({ t: 'wall', at: side(k, -8), size: [2, 11.6, 1.2], heading: hd });
    // the refraction pool: a red basin 14 m under the prism feet (a missed hop sends you back)
    const xs = pads.pads.map((q) => q.at[0]);
    const zs = pads.pads.map((q) => q.at[2]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    p.route.push({
      t: 'red',
      at: [r1(cx), r1(a[1] - 14), r1(cz)],
      size: [
        r1(Math.max(...xs) - Math.min(...xs) + 34),
        1,
        r1(Math.max(...zs) - Math.min(...zs) + 30),
      ],
      heading: 0,
    });
  }
  p.move(22, -2).curve({
    legs: [straight(20, 1), arc(45, 70, d(5)), straight(120, d(7))],
    ...MID,
    side: 'right',
    color: PEARL[2],
  });
  ramp('3B');
  p.move(15, -4.6, 5).turn(20).window(0, [9, 6.2], [21, 16]).turn(-20).move(12, -2.4, 4);
  p.curve({
    lead: 6,
    legs: [arc(45, 130, d(7)), straight(250, d(10))],
    ...STD,
    side: 'left',
    color: PEARL[2],
  });
  ramp('3C');
  p.move(6, -2).gate([22, 16], 'Lens Frame', BAY);

  // ---- 4 Split spectrum ----
  p.move(14, -5, -9).curve({
    legs: [straight(250, d(16)), straight(30, -2)],
    ...STD,
    side: 'right',
    color: PEARL[3],
  });
  ramp('4A');
  const lip4A = { pos: p.pos, heading: p.heading };
  p.move(26, -7, 16).curve({
    lead: 8,
    legs: [straight(85, d(7))],
    ...BROAD,
    side: 'left',
    color: PEARL[3],
  });
  ramp('4B');
  p.move(4, -2).anchor('Prism Bend', BAY, [14, 12]);
  portal(
    p,
    10,
    34,
    -1,
    EXIT.P5a,
    -90,
    [12, 12],
    { color: SPECTRUM, glyph: '◇', offset: true },
    [4, -2],
  );
  p.move(14, -7).curve({
    lead: 12,
    legs: [straight(40, d(2)), arc(-90, 80, d(9)), straight(40, d(2))],
    ...BROAD,
    side: 'left',
    color: PEARL[3],
  });
  ramp('4C');
  portal(p, 14, 34, -2, EXIT.P5b, -90, [12, 12], { color: SPECTRUM, glyph: '◈', offset: true });
  p.move(14, -7).curve({
    lead: 12,
    legs: [straight(85, d(6))],
    ...BROAD,
    side: 'left',
    color: PEARL[3],
  });
  ramp('4D');
  p.move(15, -5, -9).curve({
    lead: 12,
    legs: [straight(320, d(14))],
    ...STD,
    side: 'right',
    color: PEARL[3],
  });
  ramp('4M');
  // the high spectrum line (optional, faster): 4A's ridge band straight on, 4H, P6, 4E, T4e
  let p6At: P3 = [0, 0, 0];
  const high = p.branch((b) => {
    b.pos = lip4A.pos;
    b.heading = lip4A.heading;
    b.move(14, -1).curve({
      lead: 6,
      legs: [straight(70, -7)],
      ...SHORT,
      side: 'right',
      color: PEARL[3],
    });
    const h4 = lastCurve(b);
    p6At = portal(b, 10, 32, 2.5, EXIT.P6, 90, [9, 9], { color: HIGH, glyph: '◆', offset: true });
    b.move(14, -4).curve({
      lead: 12,
      legs: [straight(175, d(7)), arc(-20, 120, 1), straight(15, 0.5)],
      ...STD,
      side: 'left',
      color: PEARL[3],
    });
    return { h4, e4: lastCurve(b) };
  });
  // (the diagonal catch: 4M's upper band about 45 m on from 4E's end, 17 m to the left)
  const catchS = r1(rideAt(ramps['4M'], 0)[2] - (rideAt(high.e4, -1)[2] - 45));
  forks.push({
    name: 'High spectrum',
    safe: 'transfer right onto 4B and take the two magenta portals (◇, ◈) round the long way',
    risky:
      "hold 4A's ridge band straight onto the climbing 4H, fly the small ◆ portal, catch 4M diagonally",
    line: [
      { at: rideAt(ramps['4A'], -40, 0.12), surf: true },
      { at: rideAt(high.h4, 20, 0.3), surf: true },
      { at: rideAt(high.h4, -1, 0.3), surf: true },
      { at: p6At, portal: true },
      { at: EXIT.P6, air: true },
      { at: rideAt(high.e4, 40), surf: true },
      { at: rideAt(high.e4, 175), surf: true },
      { at: rideAt(high.e4, 200), surf: true },
      { at: rideAt(high.e4, -1), surf: true },
      { at: rideAt(ramps['4M'], catchS, 0.3), surf: true },
      { at: rideAt(ramps['4M'], catchS + 50), surf: true },
    ],
  });
  p.move(6, -2).gate([24, 18], 'Spectrum Merge', BAY);

  // ---- 5 Relay chain ----
  p.move(14, -5, 9).curve({
    legs: [straight(150, d(9)), arc(-45, 120, d(7)), straight(30, d(2))],
    ...STD,
    side: 'left',
    color: PEARL[4],
  });
  ramp('5A1');
  p.move(4, -2).anchor('Relay', BAY, [14, 12]);
  p.move(10, -3, -9).curve({
    legs: [arc(135, 120, d(15)), straight(60, d(2)), straight(20, -1)],
    ...STD,
    side: 'right',
    color: PEARL[4],
  });
  ramp('5A2');
  portal(p, 14, 34, 1.5, EXIT.P7, 90, [12, 12], { color: RELAY, glyph: '↱', offset: true });
  // the brief receiving face: it bends you onto the diagonal (152°)
  p.move(14, -5).curve({
    lead: 10,
    legs: [straight(8, 0.5), arc(-28, 50, 1.5), straight(6, 0.3)],
    ...STD,
    side: 'left',
    color: PEARL[4],
  });
  ramp('5B');
  // the diagonal window on the way into P8 (P8 faces south: you cross it 28° off, and its −90°
  // turn sends you out at 62°, onto the curving 5C)
  p.window(14, [9, 7.5], [27, 20], -6);
  p.move(-14, 6);
  portal(p, 28, 33, -1, EXIT.P8, -90, [12, 12], { color: RELAY, glyph: '↰', offset: true });
  p.face(62);
  p.anchor('Core', { flightSec: 0.9, up: 6, side: 0 }, [12, 12]);
  p.move(14, -7).curve({
    lead: 12,
    legs: [arc(28, 120, 2), straight(170, d(5)), straight(25, -2)],
    ...STD,
    side: 'right',
    color: PEARL[4],
  });
  ramp('5C');
  // the red core: straight on off 5C's lip you hit it; bend right at once and pass south of it
  p.red(21, -5, -36, [16, 60, 16]);
  p.move(44, -18, 22).curve({
    lead: 10,
    legs: [straight(150, d(5))],
    ...WIDE,
    side: 'left',
    color: PEARL[4],
  });
  ramp('5D');
  p.move(6, -2).gate([24, 18], 'Output Entry', { flightSec: 1.0, up: 7 });

  // ---- 6 Output beam ----
  p.move(14, -5, -9).curve({
    legs: [straight(60, d(2)), arc(180, 95, d(18)), straight(60, d(1)), straight(40, -8)],
    ...STD,
    side: 'right',
    color: PEARL[5],
  });
  ramp('6A');
  p.move(28, -4, 8).curve({
    lead: 10,
    legs: [straight(70, d(2)), arc(-90, 110, d(8)), straight(120, d(3))],
    ...WIDE,
    side: 'left',
    color: PEARL[5],
  });
  ramp('6B');
  portal(p, 14, 34, -1, EXIT.PF, 0, [16, 16], { color: OUTPUT, glyph: '✦' });
  p.move(8, -2).finishGate([24, 20], 30, 18);

  const base: Omit<CourseData, 'route' | 'scenery' | 'format'> = {
    name: 'Prism Relay',
    kind: 'surf',
    mode: 'intermediate',
    profile: 'MOVEMENT_PROFILE v1',
    parSec: 180,
    palette: PALETTE,
    sky: {
      top: 0x0a0d14,
      horizon: 0x171b25,
      ground: 0x0e1119,
      stars: true,
      fog: { near: 140, far: 650 },
      ambient: 0.95,
    },
    roomMat: 'panel',
    killY: 100,
    autoFloors: { below: 25, pad: 30 },
    floors: [],
    forks,
  };
  // ---- the facility round the route (fitted to what is built: nothing clips, glass keeps clear
  // of the racing line) ----
  const built = expandCourse(p.course({ ...base, scenery: deco })).def;
  deco.push(...optics({ route: p.route, ramps, built }));
  return p.course({ ...base, scenery: deco });
};

type Block = Extract<SceneryElement, { t: 'block' }>;
type Bounds = number[];
const DEG = Math.PI / 180;

/** A point `f` ahead along heading `hd`, `s` to its right, `u` up from `at`. */
const off = (at: P3, hd: number, f: number, s = 0, u = 0): P3 => [
  r1(at[0] + Math.sin(hd * DEG) * f + Math.cos(hd * DEG) * s),
  r1(at[1] + u),
  r1(at[2] - Math.cos(hd * DEG) * f + Math.sin(hd * DEG) * s),
];

/** A scenery block's world bounds [x0, y0, z0, x1, y1, z1] (its heading turns it). */
const blockBounds = (b: Block): Bounds => {
  const [w, h, dd] = b.size;
  const c = Math.abs(Math.cos((b.heading ?? 0) * DEG));
  const sn = Math.abs(Math.sin((b.heading ?? 0) * DEG));
  const ex = b.round ? w * 0.6 : (c * w) / 2 + (sn * dd) / 2;
  const ez = b.round ? w * 0.6 : (sn * w) / 2 + (c * dd) / 2;
  return [b.at[0] - ex, b.at[1], b.at[2] - ez, b.at[0] + ex, b.at[1] + h, b.at[2] + ez];
};

/** A level box's world bounds (course boxes turn about the vertical only; else a safe sphere). */
const boxBounds = (b: {
  c: { x: number; y: number; z: number };
  h: { x: number; y: number; z: number };
  q?: { x: number; y: number; z: number; w: number };
  hull?: unknown;
}): Bounds => {
  let [hx, hy, hz] = [b.h.x, b.h.y, b.h.z];
  if (b.q && !b.hull) {
    if (Math.abs(b.q.x) > 1e-6 || Math.abs(b.q.z) > 1e-6) {
      const r = Math.hypot(hx, hy, hz);
      [hx, hy, hz] = [r, r, r];
    } else {
      const a = 2 * Math.atan2(b.q.y, b.q.w);
      const c = Math.abs(Math.cos(a));
      const sn = Math.abs(Math.sin(a));
      [hx, hz] = [c * b.h.x + sn * b.h.z, sn * b.h.x + c * b.h.z];
    }
  }
  return [b.c.x - hx, b.c.y - hy, b.c.z - hz, b.c.x + hx, b.c.y + hy, b.c.z + hz];
};

const overlaps = (a: Bounds, b: Bounds, pad = 0.05): boolean =>
  a[0] < b[3] - pad &&
  a[3] > b[0] + pad &&
  a[1] < b[4] - pad &&
  a[4] > b[1] + pad &&
  a[2] < b[5] - pad &&
  a[5] > b[2] + pad;

const distTo = (b: Bounds, q: { x: number; y: number; z: number }): number =>
  Math.hypot(
    Math.max(b[0] - q.x, 0, q.x - b[3]),
    Math.max(b[1] - q.y, 0, q.y - b[4]),
    Math.max(b[2] - q.z, 0, q.z - b[5]),
  );

/** Scenery colours: glass prisms, the beam, charcoal structure. */
const OPTIC = {
  glass: 0xbfe9f2,
  glassWarm: 0xe6dcf2,
  beam: 0x7acfe0,
  steel: 0x1f2430,
  pearl: 0xd7dce4,
};

/**
 * The facility: the suspended glass prisms (Input over the start, Central over the red core,
 * Output inside the last sweep, and one over the calm finish chamber), the thin ice-blue beam
 * into every portal and out of every exit, collars in each portal's colour round its frame and
 * its exit. Pure decoration: none of it collides.
 */
const optics = (o: {
  route: RouteElement[];
  ramps: Record<string, CurveEl>;
  built: ReturnType<typeof expandCourse>['def'];
}): SceneryElement[] => {
  const out: SceneryElement[] = [];
  const kept = o.built.boxes.filter((b) => b.mat !== 'water');
  const occ: Bounds[] = kept.map(boxBounds);
  const looks: string[] = kept.map((b) => `${b.mat ?? 'hull'}|${b.color ?? -1}`);
  // the racing line and the forks, sampled every 3 m (flights between far nodes too)
  const race = o.built.race!;
  const line: { x: number; y: number; z: number }[] = [];
  for (const ns of [race.line, ...(race.forks ?? []).map((f) => f.riskyLine)])
    for (let i = 0; i < ns.length; i++) {
      const a = ns[i].pos;
      const b = ns[i + 1]?.pos;
      line.push(a);
      if (!b || ns[i].portal) continue;
      const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 3);
      if (n > 30) continue;
      for (let k = 1; k < n; k++)
        line.push({
          x: a.x + ((b.x - a.x) * k) / n,
          y: a.y + ((b.y - a.y) * k) / n,
          z: a.z + ((b.z - a.z) * k) / n,
        });
    }
  const look = (b: Block) => `${b.mat === 'glass' ? 'skyglass' : (b.mat ?? 'rock')}|${b.color}`;
  /** Place all these blocks or none; `room`: metres kept from the line. */
  const put = (parts: Block[], room: number): boolean => {
    const bs = parts.map(blockBounds);
    for (let i = 0; i < bs.length; i++) {
      if (occ.some((q, k) => looks[k] !== look(parts[i]) && overlaps(q, bs[i]))) return false;
      if (room > 0 && line.some((q) => distTo(bs[i], q) < room)) return false;
    }
    // (glass draws its own edges; everything else is one flat quad per face)
    for (const b of parts) out.push(b.mat === 'glass' ? b : { ...b, lowDetail: true });
    occ.push(...bs);
    looks.push(...parts.map(look));
    return true;
  };
  const block = (at: P3, size: P3, color: number, more: Partial<Block> = {}): Block => ({
    t: 'block',
    at,
    size,
    color,
    ...more,
  });

  /** A suspended glass prism (a diamond column with pointed ends), its bottom tip at `at`. */
  const prism = (at: P3, w: number, h: number, color = OPTIC.glass): boolean => {
    const g = { mat: 'glass' as const, heading: 45 };
    const up = (u: number): P3 => off(at, 0, 0, 0, u);
    const parts: Block[] = [
      block(at, [w * 0.25, w * 0.4, w * 0.25], color, g),
      block(up(w * 0.4), [w * 0.6, w * 0.4, w * 0.6], color, g),
      block(up(w * 0.8), [w, h, w], color, g),
      block(up(w * 0.8 + h), [w * 0.6, w * 0.4, w * 0.6], color, g),
      block(up(w * 1.2 + h), [w * 0.25, w * 0.4, w * 0.25], color, g),
    ];
    // (its light: a glow bead under the tip, a halo of short bars round its waist)
    const beads: Block[] = [
      block(up(-2.2), [1.4, 1.4, 1.4], OPTIC.beam, { mat: 'glow', heading: 45 }),
    ];
    const mid = up(w * 0.8 + h / 2);
    for (let a = 0; a < 360; a += 30)
      beads.push(
        block(off(mid, a, w * 0.95), [2.4, 0.3, 0.3], OPTIC.beam, {
          mat: 'glow',
          heading: a + 90,
        }),
      );
    return put(parts, 8) && put(beads, 6);
  };

  // ---- the prisms ----
  const start = o.route.find((e) => e.t === 'start');
  if (start?.t === 'start') prism(off(start.at, start.heading, 105, -28, 24), 16, 40);
  const core = o.route.find((e) => e.t === 'red' && e.size[1] >= 40);
  if (core?.t === 'red') prism(off(core.at, 0, 0, 0, core.size[1] + 22), 14, 44, OPTIC.glassWarm);
  {
    const e = o.ramps['6A'];
    const r = curvePath(e).at((e.lead ?? 0) + 60 + 0.01);
    // (the sweep's centre: 95 m to the right of the ridge where it starts turning)
    const c: P3 = [r1(r.pos.x - r.dir.z * 95), r1(r.pos.y - 10), r1(r.pos.z + r.dir.x * 95)];
    prism(c, 18, 50);
  }
  const fin = o.route.find((e) => e.t === 'gate' && e.finish);
  if (fin?.t === 'gate') {
    prism(off(fin.at, fin.heading, 60, 0, 30), 12, 30, OPTIC.glassWarm);
    // the calm chamber: four tall glass walls round the finish, a pearl sill under each
    const c = off(fin.at, fin.heading, 30, 0, -21);
    for (const [f, s, hd] of [
      [48, 0, fin.heading],
      [-62, 0, fin.heading],
      [-7, 46, fin.heading + 90],
      [-7, -46, fin.heading + 90],
    ] as const) {
      const at = off(c, fin.heading, f, s);
      const w = hd === fin.heading ? 92 : 110;
      put([block(at, [w, 56, 0.4], OPTIC.glass, { mat: 'glass', heading: hd })], 8);
      put(
        [block(off(at, 0, 0, 0, -1.2), [w, 1.2, 1.2], OPTIC.pearl, { mat: 'panel', heading: hd })],
        8,
      );
    }
  }

  // ---- the beam into every portal and out of every exit; collars in the portal's colour ----
  for (const e of o.route) {
    if (e.t !== 'portal') continue;
    const pe: PortalEl = e;
    const [w, h] = pe.size ?? [10, 10];
    const hd = pe.heading;
    const col = pe.color ?? OPTIC.pearl;
    const mid = off(pe.at, hd, 0, 0, h / 2);
    const glow = (at: P3, size: P3, heading: number, color = OPTIC.beam): Block =>
      block(at, size, color, { mat: 'glow', heading });
    // (the beam: ice blue, near the top of the opening, 26 m in; out of the exit, 28 m on)
    put([glow(off(mid, hd, -14, 0, h / 2 - 1.2), [0.3, 0.3, 26], hd)], 0);
    const outHd = hd + (pe.turn ?? 0);
    put([glow(off(pe.exit, outHd, 16, 0, h / 2 + 0.5), [0.3, 0.3, 28], outHd)], 0);
    // (a collar: four bars in the portal's colour, 2.6 m outside the frame, 1.5 m behind it)
    const L = (s: number, u: number): P3 => off(pe.at, hd, 1.5, s, u);
    put(
      [
        glow(L(0, -2.4), [w + 5.6, 0.5, 0.5], hd, col),
        glow(L(0, h + 2), [w + 5.6, 0.5, 0.5], hd, col),
        glow(L(-(w / 2 + 2.6), -2.4), [0.5, h + 4.9, 0.5], hd, col),
        glow(L(w / 2 + 2.6, -2.4), [0.5, h + 4.9, 0.5], hd, col),
      ],
      1.5,
    );
    // (a thin ring of the same colour round the exit, as big as the opening: you came out of
    // that colour)
    const X = (s: number, u: number): P3 => off(pe.exit, outHd, -1, s, u);
    put(
      [
        glow(X(0, -h / 2 - 0.6), [w + 1.6, 0.25, 0.25], outHd, col),
        glow(X(0, h / 2 + 1.2), [w + 1.6, 0.25, 0.25], outHd, col),
        glow(X(-(w / 2 + 0.8), -h / 2 - 0.6), [0.25, h + 2, 0.25], outHd, col),
        glow(X(w / 2 + 0.8, -h / 2 - 0.6), [0.25, h + 2, 0.25], outHd, col),
      ],
      0,
    );
  }
  return out;
};
