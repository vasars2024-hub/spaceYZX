// "Sunspire" — race track 1 (medium): the Sun Clock (docs/movement-map-design/race/sunspire.md).
// A sky observatory temple at sunrise: limestone terraces and colonnades ringing a colossal gold-
// capped gnomon over a sea of pink clouds. Built as course data (level/course) on the race
// movement (manual Source-style bunny hops, surf ramps), no jetpack. Five walled checkpoint rooms,
// each with its big portal filling the exit doorway; recovery anchors (fly-through rings with an
// open restart bay and launch pad) between them; red zones where the sky kills.
//
//   1 Dawn Terrace     four bhop pads round the first shrine, a broad lapis bend, two flicks → C1
//   2 Hour Rings       ✦ out of C1: a launch through two gold hour rings, a descending chain,
//                      a lapis channel whose scoop throws you up under a red lintel, a second
//                      chain, a bend into the ring shrine                                   → C2
//   3 Colonnade Wrap   ◎ out of C2: a launch onto nine pads wrapping 186° round the tholos
//                      (columns hide the pad after next), a speed gap onto a lapis ramp, two
//                      flicks, a chain to the Sun Gate. Faster: the Sun Door ring through the
//                      tholos. Salvage: the reflecting pool's launch back                   → C3
//   4 Upper Gallery    ☀ the Sun Gate lifts you 60 m: an S-curve with two flicks along the
//                      gallery, the sun window, a lapis run onto six pads on the outer ledge.
//                      Salvage: a lower catch ramp under the first flick                   → C4
//   5 Gnomon Descent   ◆ a 240° descending helix round the buttress (a red strip low on its
//                      face), a behind-the-wall chain round the buttress over a red floor, a
//                      launch arc under the red sun shade, two lower-terrace ramps           → C5
//   6 The Dial         ◐ the Dial Gate: two sweeping curves round the gnomon, seven hour-mark pads
//                      round its foot, a speed gap into the finish room. Faster: the hour skip.
//                      Salvage: the dial pool's launch back                            → finish
import type {
  CourseData,
  CourseFork,
  CurveEl,
  CurveLeg,
  JumpsEl,
  P3,
  SceneryElement,
} from '../course/types';
import { Pen } from '../course/pen';
import { curvePath, curveRidePoint } from '../course/curve';

/** Palette (revamp plan §3.1): limestone, sandstone, gold edges, lapis faces, verdigris bhop tops. */
const PALETTE = {
  ground: 0xe8dcc2,
  ground2: 0xd2c3a3,
  rock: 0xb89868,
  rockDark: 0x8a6f4c,
  edge: 0xf2c14e,
  surf: 0x2f5da8,
  surfEdge: 0xf2c14e,
  stage: 0xe8dcc2,
  stageGlow: 0xffe3a0,
  start: 0x8fe0b0,
  finish: 0xffe27a,
  portal: 0xffc83a,
  pad: 0xfff1c9,
  arrow: 0xfff6dc,
  cloud: 0xfff0ea,
  danger: 0xe8242c,
  bhop: 0x3e9c8c,
  hazard: 0xe8242c,
  anchor: 0x9fe3ff,
  leaf: 0x86c25e,
  leafDark: 0x5f9c47,
  trunk: 0x7a5634,
  crystal: 0xfff1c9,
  water: 0x7fc8e8,
  accent: 0x2f5da8,
  accent2: 0xf2c14e,
};

const GOLD = 0xf2c14e;
const SANDSTONE = 0xb89868;
const LIMESTONE = 0xe8dcc2;
const LIMESTONE2 = 0xd2c3a3;
const BRONZE = 0x9c7a50;

/** Lapis surf faces, a shade apart per act. */
const LAPIS = [0x2f5da8, 0x3566b3, 0x2a549b, 0x3a6fbd, 0x2d5aa2, 0x3468b0];

/** Face shape (medium: 14 m faces at 58°; the helix 12 m at 60°). */
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

const r1 = (x: number): number => Math.round(x * 10) / 10;
const DEG = Math.PI / 180;

/** A bend from heading `from` to heading `to` (the short way), or a straight when hardly any. */
const bendTo = (from: number, to: number, radius: number, drop: number): CurveLeg => {
  const turn = r1(((((to - from) % 360) + 540) % 360) - 180);
  return Math.abs(turn) < 2
    ? straight(Math.max(20, 8 * Math.abs(drop)), drop)
    : arc(turn, radius, drop);
};

/** Where a curve's racing line would be `s` metres (flat) along it, `depth` down its face. */
const rideAt = (e: CurveEl, s: number, depth = 0.35): P3 => {
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
const lastPads = (p: Pen): JumpsEl => {
  const e = p.route[p.route.length - 1];
  if (e.t !== 'jumps') throw new Error('not pads');
  return e;
};

/**
 * Bhop steps round a circle of radius `R` (turning right; `dir` -1: left), centre to centre
 * `chords`: the pen starts on the first pad heading along the circle. `last`: the last chord's
 * arc (turn that much more to head along the circle again).
 */
const wrapSteps = (chords: number[], R: number, dir = 1) => {
  const arcs = chords.map((c) => (2 * Math.asin(c / (2 * R))) / DEG);
  const steps = chords.map((d, k) => ({
    d,
    turn: r1((dir * ((k ? arcs[k - 1] : 0) + arcs[k])) / 2),
  }));
  return { steps, last: dir * arcs[arcs.length - 1] };
};

/** Portal pairs: each its own colour and mark (shown over the portal and over its exit). */
const GATE = {
  dawn: { color: 0xff9fb8, glyph: '✦' },
  ring: { color: 0xb08cff, glyph: '◎' },
  sun: { color: 0xffc83a, glyph: '☀' },
  gallery: { color: 0x4fe0a8, glyph: '◆' },
  dial: { color: 0x3f6fe0, glyph: '◐' },
};

/** Portal openings in the rooms' exit doorways. */
const DOOR: [number, number] = [8, 7];

/**
 * A walled checkpoint room entered at the pen, with the big portal filling its exit doorway:
 * the opening's bottom 1 m under the floor, just past the door, so running out of the room
 * takes you through it. You come out at `exit` (feet) turned `turn`, level.
 */
const room = (
  p: Pen,
  name: string,
  exit: P3,
  turn: number,
  look: { color: number; glyph: string },
): void => {
  p.stage([12, 14], undefined, name);
  p.move(0, DOOR[1] / 2 - 1);
  p.airPortal(1.6, exit, turn, DOOR, { ...look, vertical: 'zero' });
};

/** Horizontal distance from (x, z) to the segment a–b (plan view). */
const segDist = (x: number, z: number, a: P3, b: P3): number => {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / l2)) : 0;
  return Math.hypot(x - a[0] - dx * t, z - a[2] - dz * t);
};

/** A point `r` from centre `c` at compass bearing `b` (degrees), at height `y`. */
const polar = (c: P3, r: number, b: number, y = c[1]): P3 => [
  r1(c[0] + Math.sin(b * DEG) * r),
  r1(y),
  r1(c[2] - Math.cos(b * DEG) * r),
];

/** A column of limestone drums (eight-sided) with a gold capital, standing on `at`. */
const column = (
  out: SceneryElement[],
  at: P3,
  width: number,
  height: number,
  solid = false,
): void => {
  out.push({
    t: 'block',
    at,
    size: [width, height, width],
    round: true,
    color: LIMESTONE,
    solid,
    lowDetail: !solid,
  });
  out.push({
    t: 'block',
    at: [at[0], r1(at[1] + height), at[2]],
    size: [width * 1.35, 0.8, width * 1.35],
    color: GOLD,
    mat: 'sand',
    lowDetail: true,
  });
};

/** A flat horizontal ring of `n` beams (radius `R` to their middles), e.g. an hour ring. */
const beamRing = (
  out: SceneryElement[],
  c: P3,
  R: number,
  n: number,
  size: [number, number],
  color: number,
  mat: 'sand' | 'glow' | 'rock' = 'sand',
): void => {
  const len = 2 * R * Math.tan(Math.PI / n) + size[0] * 0.2;
  for (let k = 0; k < n; k++) {
    const b = (360 / n) * k;
    out.push({
      t: 'block',
      at: polar(c, R, b),
      size: [len, size[1], size[0]],
      heading: r1(b),
      color,
      mat,
      lowDetail: true,
    });
  }
};

/** The course data (pure JSON). */
export const sunspireCourse = (): CourseData => {
  const deco: SceneryElement[] = [];
  const forks: CourseFork[] = [];
  /** points of the racing line's flights that scenery keeps clear of */
  const keepClear: [P3, P3, number][] = [];

  // ================================ Act 1 Dawn Terrace ================================
  // start on the east terrace facing the gnomon; four pads curving right round the first shrine
  const p = new Pen([380, 380, 150], 270);
  p.start([14, 16]);
  p.go('jump');
  p.bhopPads(
    [{ d: 8.8 }, { d: 9.5, turn: 15 }, { d: 10.3, turn: 15 }, { d: 11, turn: 15 }],
    [7, 9],
  );
  const dawnPads = lastPads(p);
  // the last hop boards a broad lapis bend (70° right, R 120, banked)
  p.move(17, -2.5).curve({
    lead: 10,
    legs: [straight(30, 1), arc(70, 120, 3.5), straight(40, 1)],
    ...STD,
    side: 'right',
    color: LAPIS[0],
  });
  p.move(4, -2).anchor('Dawn Stair', {}, [14, 12]);
  // an opposing transfer, then a flick back
  p.move(10, -4, 9).curve({
    legs: [straight(40, 1), arc(-45, 140, 2), straight(30, 1)],
    ...STD,
    side: 'left',
    color: LAPIS[0],
  });
  p.move(12, -4, -9).curve({
    legs: [straight(20, 0.5), bendTo(p.heading, 0, 140, 1.5), straight(40, 1)],
    ...STD,
    side: 'right',
    color: LAPIS[0],
  });
  p.move(10, -5);
  room(p, 'Hour Rings', [110, 330, 30], 0, GATE.dawn);

  // ================================ Act 2 Hour Rings ================================
  // ✦ out of the East Shrine onto its step: a launch through two gold hour rings round the gnomon
  p.move(-4).platform([10, 14]);
  p.launch(26, 6, 1.3);
  const ring1 = p.here();
  p.booster(21, 5, true, [7, 7]);
  p.move(21, -5).booster(19, 4, true, [7, 7]);
  const ring2 = p.here();
  // a descending chain (-2 m steps, ±25°)
  p.move(22, -6).bhopPads(
    [
      { d: 0, size: [8, 12] },
      { d: 15, turn: -25, rise: -2 },
    ],
    [7, 8],
  );
  p.move(7.5, 0).anchor('Ring Steps', { flightSec: 1.7 }, [10, 9]);
  p.move(8, -2).bhopPads(
    [
      { d: 0, turn: 25 },
      { d: 16, turn: -25, rise: -2 },
    ],
    [7, 8],
  );
  // the lapis channel: a left bend, then a scoop that throws you up onto the raised terrace,
  // under the red lintel (ride the lower half of the face at the release)
  p.move(18, -2.5).curve({
    lead: 12,
    legs: [straight(40, 1), arc(-65, 90, 3), straight(60, 1.5), straight(35, -9)],
    ...STD,
    side: 'left',
    color: LAPIS[1],
  });
  p.red(3, 0, 4.6, [12, 1.2, 1.6]);
  const lintel = p.relP(3, 0, 4.6);
  const lintelHeading = p.heading;
  p.move(4, -1).platform([8, 8], 'hop');
  p.move(4, 0).anchor('Scoop Terrace', { back: 18, side: -16, up: 6, flightSec: 1.3 }, [10, 9]);
  p.move(4, -1).bhopPads(
    [
      { d: 0, size: [7, 9] },
      { d: 12.5, turn: -10, rise: -1 },
      { d: 13, turn: -10, rise: -1 },
      { d: 13.5, turn: -10, rise: -1 },
    ],
    [7, 8],
  );
  p.move(15, -3).curve({
    lead: 8,
    legs: [straight(40, 1), bendTo(p.heading, 270, 70, 2), straight(50, 1)],
    ...STD,
    side: 'left',
    color: LAPIS[1],
  });
  p.move(10, -5);
  room(p, 'Colonnade', [-86, 300, 329], 0, GATE.ring);

  // ================================ Act 3 Colonnade Wrap ================================
  // ◎ out of the Ring Shrine: a launch onto nine pads wrapping round the tholos (in its
  // reflecting pool), the inner colonnade hiding the pad after next
  p.move(-4).platform([10, 12]);
  const act3Launch = p.relP(-2.5);
  const act3Standing = p.relP(-6);
  p.launch(16, -2, 1.16);
  const O3 = p.relP(0, 29);
  const wrap = wrapSteps([11, 11.5, 11.9, 12.4, 12.8, 13.3, 13.7, 14.1], 29);
  p.bhopPads([{ d: 0, size: [8, 10] }, ...wrap.steps.slice(0, 4)], [7, 8]);
  const wrapA = lastPads(p);
  p.turn(wrap.steps[4].turn!).move(wrap.steps[4].d / 2);
  p.anchor('Tholos', { back: 22, side: -9, up: 5, flightSec: 1.1 }, [9, 8]);
  p.move(wrap.steps[4].d / 2).bhopPads([{ d: 0 }, ...wrap.steps.slice(5)], [7, 8]);
  const wrapB = lastPads(p);
  const wrapPads = [...wrapA.pads, ...wrapB.pads];
  p.turn(wrap.last / 2);
  // the speed gap: 19 m of air, 3 m down onto the lapis ramp (too slow and you drop in the pool)
  p.move(19, -3).curve({
    lead: 7,
    legs: [straight(30, 1), bendTo(p.heading, 90, 120, 2), straight(40, 1)],
    ...STD,
    side: 'left',
    color: LAPIS[2],
  });
  const act3Ramp = lastCurve(p);
  p.move(4, -2).anchor('Sun Steps', {}, [12, 12]);
  p.move(10, -4, -9).curve({
    legs: [straight(55, 1), arc(40, 110, 3), straight(55, 1)],
    ...STD,
    side: 'right',
    color: LAPIS[2],
  });
  p.move(12, -4, 9).curve({
    legs: [straight(30, 1), bendTo(p.heading, 90, 110, 2), straight(50, 1)],
    ...STD,
    side: 'left',
    color: LAPIS[2],
  });
  p.move(8, -3).anchor('Gate Steps', { flightSec: 1.5 }, [10, 9]);
  p.move(8, -3).bhopPads(
    [
      { d: 0, size: [8, 12] },
      { d: 15, turn: 12, rise: -1 },
      { d: 15.5, turn: -12, rise: -1 },
      { d: 16, turn: -12, rise: -1 },
      { d: 16, turn: 12, rise: -1 },
    ],
    [7, 9],
  );
  p.move(12, -1);
  room(p, 'Upper Gallery', [-400, 360, -290], 90, GATE.sun);

  // ---- the Sun Door (faster line): from the third pad, a hard inward hop into a gold booster
  // ring hung between two columns throws you through the tholos' door straight to the ninth pad
  const pad3 = wrapPads[2].at;
  const pad9 = wrapPads[8].at;
  const toNine = Math.atan2(pad9[0] - pad3[0], -(pad9[2] - pad3[2])) / DEG;
  const doorRing: P3 = [
    r1(pad3[0] + Math.sin(toNine * DEG) * 8),
    pad3[1],
    r1(pad3[2] - Math.cos(toNine * DEG) * 8),
  ];
  {
    const D = Math.hypot(pad9[0] - doorRing[0], pad9[2] - doorRing[2]);
    const T = 1.3;
    p.branch((b) =>
      b.route.push({
        t: 'booster',
        at: doorRing,
        heading: r1(toNine),
        speed: r1(D / T),
        up: r1((pad9[1] - (doorRing[1] + 0.6) + 10 * T * T) / T),
        size: [5, 5],
        air: true,
        go: 'strafe',
      }),
    );
  }
  forks.push({
    name: 'Sun Door',
    safe: 'bunny-hop the whole wrap round the tholos (pads 4–8)',
    risky:
      'from the third pad hop hard left into the gold ring between the columns: it throws you through the tholos door straight onto the ninth pad',
    line: [
      { at: act3Standing },
      { at: act3Launch },
      ...wrapPads.slice(0, 3).map((q) => ({ at: q.at, hop: true })),
      { at: doorRing, air: true },
      { at: pad9, hop: true },
      { at: rideAt(act3Ramp, 14), surf: true },
      { at: rideAt(act3Ramp, 60), surf: true },
    ],
  });

  // ---- the reflecting pool (salvage): fall off the wrap and wade to the lamp; its launch
  // throws you back onto the sixth pad
  const pool3Y = r1(wrapPads[0].at[1] - 16);
  deco.push({ t: 'water', at: [O3[0], pool3Y, O3[2]], size: [70, 70], shallow: true });
  const pad6 = wrapPads[5].at;
  const bearingOf = (c: P3, q: P3): number => Math.atan2(q[0] - c[0], -(q[2] - c[2])) / DEG;
  // (the launch stands in the pool between the inner columns and the pads, under the fourth
  // pad: its flight to the sixth gives you the wrap's speed back)
  const poolLaunch = polar(O3, 24, bearingOf(O3, wrapPads[3].at), r1(pool3Y - 1));
  const toSix = Math.atan2(pad6[0] - poolLaunch[0], -(pad6[2] - poolLaunch[2]));
  const poolStart: P3 = [
    r1(poolLaunch[0] - Math.sin(toSix) * 4),
    poolLaunch[1],
    r1(poolLaunch[2] + Math.cos(toSix) * 4),
  ];
  p.branch((b) =>
    b.route.push({ t: 'launch', at: poolLaunch, to: pad6, flightSec: 1.4, base: false }),
  );
  deco.push({
    t: 'lamp',
    at: [
      r1(poolLaunch[0] - Math.cos(toSix) * 2.4),
      poolLaunch[1],
      r1(poolLaunch[2] - Math.sin(toSix) * 2.4),
    ],
  });
  forks.push({
    name: 'Reflecting pool',
    safe: 'stay on the wrap',
    risky:
      'fall into the reflecting pool, wade to the lamp; its launch pad throws you onto the sixth pad',
    salvage: true,
    line: [
      { at: poolStart },
      { at: poolLaunch },
      ...wrapPads.slice(5).map((q) => ({ at: q.at, hop: true })),
      { at: rideAt(act3Ramp, 14), surf: true },
      { at: rideAt(act3Ramp, 60), surf: true },
    ],
  });

  // ================================ Act 4 Upper Gallery ================================
  // ☀ the Sun Gate lifts you 60 m onto the upper gallery: an S-curve with two flicks
  p.move(11, -6).curve({
    lead: 12,
    legs: [straight(60, 1), arc(-25, 150, 2), straight(40, 1)],
    ...STD,
    side: 'left',
    color: LAPIS[3],
  });
  const galleryA = lastCurve(p);
  p.move(4, -2).anchor('Gallery Stair', {}, [12, 12]);
  p.move(10, -4, -9).curve({
    legs: [straight(40, 1), arc(40, 130, 2), straight(40, 1)],
    ...STD,
    side: 'right',
    color: LAPIS[3],
  });
  const galleryB = lastCurve(p);
  p.move(14, -5, 9).curve({
    legs: [straight(30, 1), arc(-15, 150, 1), straight(70, 1)],
    ...STD,
    side: 'left',
    color: LAPIS[3],
  });
  const galleryC = lastCurve(p);
  // the sun window: a wall across the way with an 8 × 7 hole, the transfer through it
  p.window(12, [8, 7], [20, 17], -5);
  const sunWindow = p.here();
  const sunHeading = p.heading;
  p.move(7, -2.5).anchor('Sun Window', { back: 7, side: 14, up: 12, flightSec: 1.1 }, [10, 9]);
  p.move(7, -2).curve({
    lead: 6,
    legs: [straight(90, 2)],
    ...STD,
    side: 'left',
    color: LAPIS[3],
  });
  // surf-to-bhop onto six pads along the gallery's outer ledge
  p.move(16, -6).bhopPads(
    [
      { d: 0, size: [8, 12] },
      { d: 15, turn: 8, rise: -1.5 },
      { d: 15, turn: 8, rise: -1.5 },
      { d: 15.5, turn: 8, rise: -1.5 },
      { d: 15.5, turn: 8, rise: -1.5 },
      { d: 16, turn: r1(180 - p.heading - 32), rise: -1.5 },
    ],
    [7, 10],
  );
  const ledgePads = lastPads(p);
  p.move(11, -1.5);
  room(p, 'Gnomon Descent', [-80, 330, -300], 180, GATE.gallery);

  // ---- the lower catch ramp (salvage): a short first flick drops onto a wide low ramp under
  // it; the launch at its end throws you back up onto the third ramp
  {
    const aEnd = rideAt(galleryA, -1);
    const catchRamp = p.branch((b) => {
      b.pos = { x: aEnd[0], y: aEnd[1], z: aEnd[2] };
      b.heading = galleryA.heading - 25;
      b.move(12, -15, 2).curve({
        legs: [straight(30, 1)],
        height: 16,
        angle: 55,
        side: 'right',
        color: LAPIS[3],
      });
      return lastCurve(b);
    });
    const end = rideAt(catchRamp, -1);
    const before = rideAt(catchRamp, -11);
    // (the landing past its end, a little to the right: clear of the S-curve above)
    const fx = (end[0] - before[0]) / 10;
    const fz = (end[2] - before[2]) / 10;
    const pad: P3 = [r1(end[0] + fx * 9 - fz * 4), r1(end[1] - 6), r1(end[2] + fz * 9 + fx * 4)];
    const back = rideAt(galleryB, 75);
    p.branch((b) => b.route.push({ t: 'launch', at: pad, to: back, flightSec: 1.5 }));
    forks.push({
      name: 'Lower catch ramp',
      safe: 'make the first flick onto the gallery S-curve',
      risky: 'fall short onto the wide lower ramp and take its launch back up onto the third ramp',
      salvage: true,
      line: [
        { at: rideAt(catchRamp, 10), surf: true },
        { at: rideAt(catchRamp, 30), surf: true },
        { at: pad },
        { at: back, surf: true },
        { at: rideAt(galleryB, 110), surf: true },
      ],
    });
  }

  // ================================ Act 5 Gnomon Descent ================================
  // ◆ a 240° descending helix round the buttress, a red strip low on its face
  p.move(11, -6).curve({
    lead: 12,
    legs: [arc(-80, 70, 9), arc(-90, 70, 11, { red: 0.75 }), arc(-70, 70, 9)],
    height: 12,
    angle: 60,
    side: 'left',
    color: LAPIS[4],
  });
  const helix = lastCurve(p);
  // the buttress stands in the middle of the helix
  const H: P3 = (() => {
    const h = helix.heading * DEG;
    // (the arcs start after the 12 m lead-in; the centre is 70 m to their left)
    const x = helix.at[0] + Math.sin(h) * 12 - Math.cos(h) * 70;
    const z = helix.at[2] - Math.cos(h) * 12 - Math.sin(h) * 70;
    return [r1(x), helix.at[1], r1(z)];
  })();
  p.move(4, -2).anchor('Buttress', {}, [12, 12]);
  // out onto a behind-the-wall chain curving left round the buttress (-1 m steps)
  p.move(12, -5, -5).bhopPads(
    [
      { d: 0, size: [8, 12] },
      ...wrapSteps([16, 16, 16.5, 16.5, 17], 54, -1).steps.map((s) => ({ ...s, rise: -1 })),
    ],
    [7, 9],
  );
  const buttressPads = lastPads(p);
  // a launch arc under the red sun shade, out from the buttress down to the lower terrace
  // (turning 30° out of the wrap: the arc lands clear of the helix above)
  p.turn(30);
  // (the last hop flies into the launch ring: it throws you out along the arc; the shade hangs
  // 11.5 m over the ring from just past it, over the rising half of the arc)
  p.move(10, -0.5).booster(26, 8, true, [7, 7]);
  p.route.push({ t: 'red', at: p.relP(16, 0, 11.5), size: [10, 0.6, 24], heading: r1(p.heading) });
  p.move(41, -12);
  p.curve({
    lead: 12,
    legs: [straight(30, 1), bendTo(p.heading, 90, 90, 3), straight(70, 1)],
    ...STD,
    side: 'right',
    color: LAPIS[4],
  });
  p.move(4, -2).anchor('Lower Terrace', {}, [12, 12]);
  p.move(10, -4, 9).curve({
    legs: [straight(30, 1), bendTo(p.heading, 90, 110, 2), straight(60, 1)],
    ...STD,
    side: 'left',
    color: LAPIS[4],
  });
  p.move(10, -5);
  room(p, 'The Dial', [71.5, 250, 229], 180, GATE.dial);

  // ================================ Act 6 The Dial ================================
  // ◐ the Dial Gate: two sweeping curves round the gnomon
  p.move(11, -6).curve({
    lead: 12,
    legs: [straight(40, 1), arc(80, 120, 9)],
    ...STD,
    side: 'right',
    color: LAPIS[5],
  });
  p.move(4, -2).anchor('Dial Rim', {}, [12, 12]);
  p.move(10, -4, 9).curve({
    legs: [straight(70, 1), arc(30, 140, 2), straight(70, 1)],
    ...STD,
    side: 'left',
    color: LAPIS[5],
  });
  const dialRamp = lastCurve(p);
  p.move(8, -3).anchor('Hour Marks', { flightSec: 1.6 }, [10, 9]);
  p.move(8, -3);
  // the gnomon stands at the centre of the hour marks' circle
  const G = p.relP(0, 58);
  p.bhopPads(
    [
      { d: 0, size: [8, 12] },
      ...wrapSteps([13, 13.5, 14, 14.5, 15, 15], 58).steps.map((s) => ({ ...s, rise: -1 })),
    ],
    [7, 10],
  );
  const hourPads = lastPads(p).pads;
  // the speed gap into the finish room at the gnomon's foot
  p.turn(90);
  p.move(16, -3);
  // ---- the hour skip (faster line): carry the channel's speed and fly straight past the first
  // hour mark onto the second
  forks.push({
    name: 'Hour skip',
    safe: 'land on the first hour mark',
    risky: 'leave the rim channel at full speed and fly straight onto the second hour mark',
    line: [
      { at: rideAt(dialRamp, -30), surf: true },
      { at: rideAt(dialRamp, -1), surf: true },
      ...hourPads.slice(1, 4).map((q) => ({ at: q.at, hop: true })),
    ],
  });
  // ---- the dial pool (salvage) under the hour marks, its launch back onto the fourth mark
  const pool6Y = r1(hourPads[3].at[1] - 9);
  const poolC: P3 = polar(G, 58, bearingOf(G, hourPads[2].at));
  deco.push({ t: 'water', at: [poolC[0], pool6Y, poolC[2]], size: [56, 56], shallow: true });
  // (the launch under the inside of the second mark: its flight to the fourth gives the speed back)
  const dialLaunch = polar(G, 50, bearingOf(G, hourPads[1].at), r1(pool6Y - 1));
  const toFour = Math.atan2(
    hourPads[3].at[0] - dialLaunch[0],
    -(hourPads[3].at[2] - dialLaunch[2]),
  );
  const dialStart: P3 = [
    r1(dialLaunch[0] - Math.sin(toFour) * 4),
    dialLaunch[1],
    r1(dialLaunch[2] + Math.cos(toFour) * 4),
  ];
  p.branch((b) =>
    b.route.push({ t: 'launch', at: dialLaunch, to: hourPads[3].at, flightSec: 1.5, base: false }),
  );
  deco.push({
    t: 'lamp',
    at: [
      r1(dialLaunch[0] + Math.cos(toFour) * 2.4),
      dialLaunch[1],
      r1(dialLaunch[2] + Math.sin(toFour) * 2.4),
    ],
  });
  forks.push({
    name: 'Dial pool',
    safe: 'stay on the hour marks',
    risky:
      'fall into the dial pool, wade to the lamp; its launch throws you back onto the fourth mark',
    salvage: true,
    line: [
      { at: dialStart },
      { at: dialLaunch },
      ...hourPads.slice(3).map((q) => ({ at: q.at, hop: true })),
    ],
  });
  p.finish([14, 16]);

  // ================================ Scenery ================================
  // the flights scenery keeps clear of: the racing line's route points and every bay's launch
  for (const e of p.route) {
    if (e.t === 'jumps')
      e.pads.forEach((q, k) => {
        keepClear.push([q.at, q.at, 7]);
        if (k) keepClear.push([e.pads[k - 1].at, q.at, 4]);
      });
    if ((e.t === 'anchor' || e.t === 'gate') && e.bay && e.to) {
      keepClear.push([e.bay, e.bay, 7], [e.bay, e.to, 3]);
      keepClear.push([e.at, e.at, Math.max(...(e.size ?? [10, 10])) / 2 + 2]);
    }
    if (e.t === 'launch') keepClear.push([e.at, e.to, 4]);
    if (e.t === 'booster' || e.t === 'window' || e.t === 'portal' || e.t === 'red')
      keepClear.push([e.at, e.at, 12]);
    if (e.t === 'platform' || e.t === 'start' || e.t === 'stage' || e.t === 'finish') {
      const [w, d] = e.size ?? [14, 16];
      keepClear.push([e.at, e.at, Math.hypot(w, d) / 2 + 3]);
    }
    if (e.t === 'curve') {
      const path = curvePath(e);
      let last = path.at(0).pos;
      for (let t = 4; t <= path.length + 3.9; t += 4) {
        const q = path.at(Math.min(t, path.length)).pos;
        keepClear.push([[last.x, last.y, last.z], [q.x, q.y, q.z], 13]);
        last = q;
      }
    }
  }
  const clearOf = (x: number, z: number, r: number): boolean =>
    keepClear.every(([a, b, k]) => segDist(x, z, a, b) > r + k);

  // ---- the Sunspire: a 250 m limestone gnomon on the dial plaza, gold-capped, three gold hour
  // rings round its shaft (seen from every act)
  const plazaY = 170;
  deco.push({
    t: 'block',
    at: [G[0], plazaY - 6, G[2]],
    size: [300, 6, 300],
    round: true,
    color: LIMESTONE2,
    lowDetail: true,
  });
  beamRing(deco, [G[0], plazaY, G[2]], 120, 24, [3, 0.4], GOLD, 'glow');
  for (let h = 0; h < 12; h++)
    deco.push({
      t: 'block',
      at: polar(G, 108, h * 30, plazaY),
      size: [2.4, 0.5, 9],
      heading: h * 30,
      color: GOLD,
      mat: 'sand',
      lowDetail: true,
    });
  // (the shaft in tapering drums, square and turned 45° each, stepping in)
  let y = plazaY;
  const drums: [number, number][] = [
    [44, 20],
    [32, 80],
    [27, 70],
    [22, 60],
    [17, 48],
  ];
  drums.forEach(([w, h], i) => {
    deco.push({
      t: 'block',
      at: [G[0], y, G[2]],
      size: [w, h, w],
      heading: i % 2 ? 45 : 0,
      // (bronze sandstone: dark enough to stand out against the peach haze from every act)
      color: i ? BRONZE : SANDSTONE,
      lowDetail: true,
    });
    deco.push({
      t: 'block',
      at: [G[0], r1(y + h), G[2]],
      size: [w + 2, 1.2, w + 2],
      heading: i % 2 ? 45 : 0,
      color: GOLD,
      mat: 'sand',
      lowDetail: true,
    });
    y += h + 1.2;
  });
  // the gold cap: a stepped pyramid with a glowing tip
  for (let k = 0; k < 5; k++)
    deco.push({
      t: 'block',
      at: [G[0], y + k * 3, G[2]],
      size: [18 - k * 3.2, 3, 18 - k * 3.2],
      heading: k * 22.5,
      color: GOLD,
      mat: 'sand',
      lowDetail: true,
    });
  deco.push({
    t: 'block',
    at: [G[0], y + 15, G[2]],
    size: [2, 5, 2],
    color: 0xfff1c9,
    mat: 'glow',
    lowDetail: true,
  });
  for (const [ry, rr] of [
    [310, 23],
    [360, 19],
    [415, 16],
  ] as const)
    beamRing(deco, [G[0], ry, G[2]], rr, 12, [2.4, 2], GOLD, 'sand');
  // four buttress fins at its foot
  for (const b of [0, 90, 180, 270]) {
    const f = polar(G, 35, b, plazaY);
    deco.push({
      t: 'block',
      at: f,
      size: [4, 19.9, 22],
      heading: b,
      color: SANDSTONE,
      lowDetail: true,
    });
  }

  // ---- Act 1: the east terrace under the start, the first shrine inside the pads' curve
  {
    const s = p.route[0];
    if (s.t === 'start') {
      deco.push({
        t: 'block',
        at: [s.at[0] + 4, s.at[1] - 40, s.at[2]],
        size: [26, 24, 26],
        color: SANDSTONE,
        lowDetail: true,
      });
      deco.push({
        t: 'block',
        at: [s.at[0] + 4, s.at[1] - 16, s.at[2]],
        size: [28, 1.6, 28],
        color: LIMESTONE2,
        lowDetail: true,
      });
      deco.push({
        t: 'waterfall',
        at: [s.at[0] + 18, s.at[1] - 14.4, s.at[2] + 6],
        heading: 90,
        width: 4,
        drop: 30,
      });
    }
    // the shrine: a small temple (solid: it is the wall the chain curves round)
    const a = dawnPads.pads[1].at;
    const b = dawnPads.pads[3].at;
    const sh: P3 = [r1((a[0] + b[0]) / 2 + 5), r1(a[1] - 6), r1((a[2] + b[2]) / 2 - 11)];
    deco.push({ t: 'block', at: sh, size: [8, 10, 8], heading: 30, color: LIMESTONE, solid: true });
    deco.push({
      t: 'block',
      at: [sh[0], sh[1] + 10, sh[2]],
      size: [10, 1.2, 10],
      heading: 30,
      color: GOLD,
      mat: 'sand',
      lowDetail: true,
    });
    deco.push({
      t: 'block',
      at: [sh[0], sh[1] + 11.2, sh[2]],
      size: [6, 3, 6],
      heading: 75,
      color: GOLD,
      mat: 'sand',
      lowDetail: true,
    });
    deco.push({
      t: 'block',
      at: [sh[0], sh[1] - 10, sh[2]],
      size: [12, 10, 12],
      heading: 30,
      color: SANDSTONE,
      lowDetail: true,
    });
  }
  deco.push({
    t: 'island',
    at: [410, 372, 118],
    size: [14, 16],
    depth: 12,
    style: 'grass',
    heading: 20,
  });
  deco.push({ t: 'tree', at: [412, 372, 114], height: 7 });
  deco.push({ t: 'tree', at: [406, 372, 124], height: 5, kind: 'pine' });
  deco.push({ t: 'waterfall', at: [417, 372, 118], heading: 90, width: 3, drop: 20 });

  // ---- Act 2: gold hoops round the two booster rings (the hour rings)
  for (const at of [ring1, ring2])
    for (const [dx, h] of [
      [-5.5, 9.8],
      [5.5, 9.8],
    ] as const)
      deco.push({
        t: 'block',
        at: [r1(at[0] + dx), r1(at[1] - 2), at[2]],
        size: [0.8, h, 0.8],
        color: GOLD,
        mat: 'sand',
        lowDetail: true,
      });
  for (const at of [ring1, ring2])
    deco.push({
      t: 'block',
      at: [at[0], r1(at[1] + 7.8), at[2]],
      size: [12, 0.8, 0.8],
      color: GOLD,
      mat: 'sand',
      lowDetail: true,
    });
  // the lintel's gold posts (the red bar spans between them)
  for (const s of [-1, 1]) {
    const h = lintelHeading * DEG;
    const x = lintel[0] + Math.cos(h) * 7 * s;
    const z = lintel[2] + Math.sin(h) * 7 * s;
    deco.push({
      t: 'block',
      at: [r1(x), r1(lintel[1] - 12), r1(z)],
      size: [1.6, 13.8, 1.6],
      color: GOLD,
      mat: 'sand',
      lowDetail: true,
    });
  }

  // ---- Act 3: the tholos in its pool — a round cella with a dome, the inner colonnade (solid:
  // the columns hide the pad after next), an outer colonnade framing the wrap
  {
    const floor = r1(pool3Y - 1);
    const cellaR = 10;
    const top = r1(pad3[1] + 14);
    // (the cella: sixteen wall panels; the Sun Door's line passes through two of them)
    const doorLine: [P3, P3] = [pad3, pad9];
    for (let k = 0; k < 16; k++) {
      const b = k * 22.5 + 11.25;
      const at = polar(O3, cellaR, b, floor);
      const door = segDist(at[0], at[2], doorLine[0], doorLine[1]) < 3.5;
      const w = 2 * cellaR * Math.tan((11.25 * Math.PI) / 180) + 0.1;
      if (door) {
        // a door: two jambs and the wall over its 7 m opening
        deco.push({
          t: 'block',
          at: [at[0], r1(pad3[1] + 8.5), at[2]],
          size: [w, r1(top - pad3[1] - 8.5), 1.2],
          heading: r1(b),
          color: LIMESTONE,
          lowDetail: true,
        });
        deco.push({
          t: 'block',
          at: [at[0], r1(pad3[1] + 8.1), at[2]],
          size: [r1(w - 0.8), 0.4, 1.2],
          heading: r1(b),
          color: GOLD,
          mat: 'glow',
          lowDetail: true,
        });
        deco.push({
          t: 'block',
          at,
          size: [w, r1(pad3[1] - 1 - floor), 1.2],
          heading: r1(b),
          color: LIMESTONE,
          lowDetail: true,
        });
      } else
        deco.push({
          t: 'block',
          at,
          size: [w, r1(top - floor), 1.2],
          heading: r1(b),
          color: LIMESTONE,
          lowDetail: true,
        });
    }
    // the dome: stacked octagons, gold on top
    for (let k = 0; k < 4; k++)
      deco.push({
        t: 'block',
        at: [O3[0], r1(top + k * 2), O3[2]],
        size: [22 - k * 5, 2, 22 - k * 5],
        round: true,
        color: k === 3 ? GOLD : LIMESTONE2,
        lowDetail: true,
      });
    // the inner colonnade (solid), leaving the Sun Door's line open
    for (let k = 0; k < 16; k++) {
      const at = polar(O3, 20.5, k * 22.5, r1(floor + 0.05));
      if (segDist(at[0], at[2], doorLine[0], doorLine[1]) < 4.5) continue;
      if (segDist(at[0], at[2], pad3, doorRing) < 4.5) continue;
      column(deco, at, 2.4, r1(pad3[1] + 13 - floor));
      // (solid: the drum itself)
      const last = deco[deco.length - 2];
      if (last.t === 'block') {
        last.solid = true;
        delete last.lowDetail;
      }
    }
    // the outer colonnade: open columns round the wrap, never in a flight
    for (let k = 0; k < 30; k++) {
      const at = polar(O3, 39, k * 12, r1(floor + 0.05));
      if (!clearOf(at[0], at[2], 1.5)) continue;
      column(deco, at, 2, r1(pad3[1] + 11 - floor));
    }
    // the gold booster ring's hoop
    deco.push({
      t: 'block',
      at: [doorRing[0], r1(doorRing[1] + 5.6), doorRing[2]],
      size: [6.4, 0.6, 0.6],
      heading: r1(toNine + 90),
      color: GOLD,
      mat: 'sand',
      lowDetail: true,
    });
  }

  // ---- Act 4: the gallery's colonnade along the outer side of the S-curve, a sun disc round
  // the sun window
  for (const e of [galleryA, galleryB, galleryC]) {
    const path = curvePath(e);
    for (let s = 10; s < path.length - 5; s += 24) {
      const r = path.at(s);
      const side = e.side === 'right' ? -1 : 1;
      // (on the ridge side: beside the back of the ramp)
      const x = r.pos.x - r.dir.z * side * 7;
      const z = r.pos.z + r.dir.x * side * 7;
      if (!clearOf(x, z, 1.5)) continue;
      column(deco, [r1(x), r1(r.pos.y - 26), r1(z)], 2.2, 32);
    }
  }
  {
    const h = sunHeading * DEG;
    for (let k = 0; k < 12; k++) {
      const a = k * 30 * DEG;
      const cx = sunWindow[0] + Math.cos(h) * Math.cos(a) * 9.5;
      const cz = sunWindow[2] + Math.sin(h) * Math.cos(a) * 9.5;
      const cy = sunWindow[1] + 3.5 + Math.sin(a) * 7.5;
      // (just in front of the wall's face, toward the way in)
      deco.push({
        t: 'block',
        at: [r1(cx - Math.sin(h) * 0.9), r1(cy), r1(cz + Math.cos(h) * 0.9)],
        size: [1.6, 1.6, 0.3],
        heading: r1(sunHeading),
        color: GOLD,
        mat: 'glow',
        lowDetail: true,
      });
    }
  }
  for (const q of ledgePads.pads.filter((_, k) => k % 2 === 1))
    deco.push({ t: 'lamp', at: [r1(q.at[0] + 4.6), q.at[1], q.at[2]] });

  // ---- Act 5: the buttress pier and its fins (solid: the chain curves round behind them)
  {
    deco.push({
      t: 'block',
      at: [H[0], H[1] - 130, H[2]],
      size: [26, 120, 26],
      round: true,
      color: LIMESTONE2,
      lowDetail: true,
    });
    deco.push({
      t: 'block',
      at: [H[0], H[1] - 10, H[2]],
      size: [30, 2, 30],
      round: true,
      color: GOLD,
      mat: 'sand',
      lowDetail: true,
    });
    deco.push({
      t: 'block',
      at: [H[0], H[1] - 8, H[2]],
      size: [18, 26, 18],
      round: true,
      color: LIMESTONE,
      lowDetail: true,
    });
    const pads = buttressPads.pads;
    for (let k = 1; k < pads.length; k++) {
      const a = pads[k - 1].at;
      const b = pads[k].at;
      const bear = Math.atan2((a[0] + b[0]) / 2 - H[0], -((a[2] + b[2]) / 2 - H[2])) / DEG;
      const at = polar(H, 37, bear, r1(b[1] - 6));
      deco.push({
        t: 'block',
        at,
        size: [1.6, 16, 14],
        heading: r1(bear),
        color: LIMESTONE,
        solid: true,
      });
      deco.push({
        t: 'block',
        at: [at[0], r1(at[1] + 16), at[2]],
        size: [2.2, 0.8, 14.6],
        heading: r1(bear),
        color: GOLD,
        mat: 'sand',
        lowDetail: true,
      });
      // the red floor under the chain
      const mid: P3 = [r1((a[0] + b[0]) / 2), r1(Math.min(a[1], b[1]) - 9), r1((a[2] + b[2]) / 2)];
      p.route.splice(p.route.length - 1, 0, {
        t: 'red',
        at: mid,
        size: [6, 0.8, 8],
        heading: r1(Math.atan2(b[0] - a[0], -(b[2] - a[2])) / DEG),
      });
    }
  }

  // ---- far background: floating garden islands and sunrise clouds
  deco.push(
    {
      t: 'scatter',
      kind: 'island',
      count: 12,
      seed: 11,
      min: [-470, 150, -470],
      max: [470, 330, 470],
      size: [18, 40],
      clear: 60,
    },
    {
      t: 'scatter',
      kind: 'cloud',
      count: 15,
      seed: 12,
      min: [-470, 120, -470],
      max: [470, 260, 470],
      size: [40, 80],
      clear: 40,
    },
  );

  return p.course({
    name: 'Sunspire',
    kind: 'race',
    parSec: 180,
    palette: PALETTE,
    sky: {
      top: 0x4f86d9,
      horizon: 0xffd2a8,
      ground: 0xf5d8c8,
      sun: { dir: [0.9, 0.12, 0.2], color: 0xffd08a, sizeDeg: 4.5 },
      sunLight: 0xffe6c8,
      fog: { near: 200, far: 950 },
      ambient: 1,
    },
    roomMat: 'sand',
    jetpack: false,
    killY: 100,
    floors: [],
    autoFloors: { below: 22, pad: 20 },
    scenery: deco,
    forks,
  });
};
