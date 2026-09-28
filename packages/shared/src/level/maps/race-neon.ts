// "Neon Drift" — race track 2 (hard): the night interchange. A maglev interchange floating over
// storm clouds at night: violet guideways (curved surf ramps), lime bhop pads, billboard drums
// and glass billboards, parked maglev cars, red laser gantries, and the Drift Tower (six lit
// legs, three magenta halos) the fourth act spirals round. Rebuilt to the revamp plan
// (docs/movement-map-design/race/REVAMP.md §3.2; as built: race/neon-drift.md), on
// MOVEMENT_PROFILE v1; no jetpack. Five station gantries (C1–C5, walled rooms) each hold a metro
// line's portal (A–E, colour + letter) in their exit doorway; recovery anchors between them.
//
//   1 Platform 1       six bhop pads wrapping left round a billboard drum, a banked guideway
//                      (90° right), an opposing flick, three pads into               → C1 (A)
//   2 Flyover          an S-curve, two flicks between parallel flyovers (the second under a
//                      red laser gantry), a bend, four pads into                      → C2 (B)
//   3 Billboard Alley  a drop-hop zigzag between three billboards (faster line: the booster
//                      ring over the low one), a guideway, a framed window with red bars and
//                      a laser, a flick, a 16 m speed gap under lasers onto the roof   → C3 (C)
//   4 Drift Tower      a 280° descending helix round the tower (red strip low on its second
//                      half; faster line: over the ridge onto the core deck, three hops and
//                      the express portal X), a long catch, two more guideways        → C4 (D)
//   5 Rail Yard        a drop-in guideway, eight bhop pads weaving between parked maglev cars
//                      over the red live rails, a short-face redirect, a flick to the far
//                      guideway, a bend, three pads into                              → C5 (E)
//   6 Terminal Run     a fast bend, an A-frame spin (left, right, left), five widening pads
//                      curving round, a 17 m gap under lasers into the finish gantry
import type {
  CourseData,
  CourseFork,
  CurveEl,
  CurveLeg,
  P3,
  SceneryElement,
} from '../course/types';
import type { HopStep } from '../course/pen';
import { Pen } from '../course/pen';
import { curvePath, curveRidePoint } from '../course/curve';
import { v3 } from '../../math/vec3';

const PALETTE = {
  ground: 0x3a4058,
  ground2: 0x2c3146,
  rock: 0x1c2032,
  rockDark: 0x12141f,
  edge: 0x3ff0ff,
  surf: 0x5b4bd6,
  surfEdge: 0x3ff0ff,
  stage: 0x2c3146,
  stageGlow: 0xbff8ff,
  start: 0x3ff0ff,
  finish: 0xe8fbff,
  portal: 0xff4fd8,
  pad: 0xffc23c,
  arrow: 0xe8fbff,
  cloud: 0x2a2450,
  danger: 0x6a3cff,
  bhop: 0xb6ff3b,
  hazard: 0xe8242c,
  anchor: 0xd8fcff,
  leaf: 0x2c3146,
  leafDark: 0x1c2032,
  trunk: 0x12141f,
  crystal: 0x7af9ff,
  water: 0x1a2a6a,
  accent: 0xff4fd8,
  accent2: 0x3ff0ff,
};

/** Violet guideway faces, a shade apart per act. */
const VIOLET = [0x5b4bd6, 0x6452e0, 0x5344c8, 0x6a5ae6, 0x4e40bd, 0x7060ea];

/** The metro lines: each room's exit portal, its colour and its letter. */
const LINE = {
  A: { color: 0xff4fd8, glyph: 'A' },
  B: { color: 0x2ee6a6, glyph: 'B' },
  C: { color: 0x4fb8ff, glyph: 'C' },
  D: { color: 0xc8a8ff, glyph: 'D' },
  E: { color: 0xf4f4ff, glyph: 'E' },
  X: { color: 0x6c7bff, glyph: 'X' },
};

/** Steel of the structure, sodium lamps, the billboards' screen tints. */
const STEEL = 0x2c3146;
const STEEL_DARK = 0x1c2032;
const SODIUM = 0xffb347;
const SCREENS = [0xff4fd8, 0x3ff0ff, 0x8a7bff];

const MID = { height: 12, angle: 60 };
const TIGHT = { height: 11, angle: 63 };
const SHORT = { height: 9, angle: 65 };
const SPINE = { height: 12, angle: 60 };

/** The Drift Tower's axis (x, z), the helix's ridge radius round it, its legs' ring. */
const TOWER: [number, number] = [0, 0];
const HELIX_R = 55;
/** Where the helix starts turning along its ramp (its lead-in and approach straight). */
const HELIX_S0 = 12 + 10;
const LEG_R = 24;
/** * The kill height: just under the lowest part of the route (y 330), so a fall that misses every * cloud sea still ends within ≈ 3.5 s (from the highest point, y 441, a 123 m drop). */ const KILL_Y = 318;

const DEG = Math.PI / 180;
const r1 = (x: number): number => Math.round(x * 10) / 10 + 0;
const r3 = (x: number): number => Math.round(x * 1000) / 1000 + 0;
const headingTo = (dx: number, dz: number): number =>
  (((Math.atan2(dx, -dz) / DEG) % 360) + 360) % 360;
/** Compass heading → flat unit direction [x, z]. */
const dirOf = (h: number): [number, number] => [Math.sin(h * DEG), -Math.cos(h * DEG)];

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
/** The pads of the last hop chain written. */
const lastPads = (p: Pen): P3[] => {
  const e = p.route[p.route.length - 1];
  if (e.t !== 'jumps') throw new Error('not pads');
  return e.pads.map((q) => q.at);
};

/**
 * Bhop steps round a circle of radius `R` (right, or `dir` -1 left), centre to centre `chords`,
 * each `rise` lower: the pen starts on a pad heading along the circle.
 */
const wrap = (chords: number[], R: number, dir: 1 | -1, rise = -1): HopStep[] => {
  const arcs = chords.map((c) => (2 * Math.asin(c / (2 * R)) * 180) / Math.PI);
  return chords.map((d, k) => ({
    d,
    rise,
    turn: r1((dir * ((k ? arcs[k - 1] : 0) + arcs[k])) / 2),
  }));
};

/**
 * Surf-to-bhop: leaving the last ramp with a hop (a jump pressed on the way down fires on the
 * landing tick, so the first pad keeps the ramp's speed).
 */
const hopOff = (p: Pen): void => {
  for (let i = p.route.length - 1; i >= 0; i--) {
    const e = p.route[i];
    if (e.t === 'curve') {
      e.go = 'hop';
      return;
    }
    if (e.t !== 'anchor') return;
  }
};
/** The turn (degrees, -180..180) from heading `from` to heading `to`. */
const turnTo = (from: number, to: number): number => r1(((((to - from) % 360) + 540) % 360) - 180);

/** A leg run climbing the face gradually from depth `from` to `to` over `len` metres (spines). */
const climb = (from: number, to: number, len: number, drop: number, n = 4): CurveLeg[] =>
  Array.from({ length: n }, (_, k) => ({
    len: r3(len / n),
    drop: r3(drop / n),
    depth: Math.round((from + ((to - from) * (k + 1)) / n) * 1000) / 1000,
  }));

/** Portal openings in the rooms' exit doorways. */
const DOOR: [number, number] = [8, 7];

/**
 * A station gantry (a walled checkpoint room) entered at the pen, with its metro line's portal
 * filling the exit doorway: the opening's bottom 1 m under the floor, just past the door, so
 * running out of the room takes you through it. You come out at `exit` (feet) heading
 * `heading`, level (horizontal speed kept). The room wears its line's colour along its walls.
 */
const station = (
  p: Pen,
  deco: SceneryElement[],
  name: string,
  exit: P3,
  heading: number,
  line: { color: number; glyph: string },
): void => {
  const w = 12;
  const d = 14;
  const c = p.rel(d / 2);
  p.stage([w, d], undefined, name);
  // the line's colour in a band along both walls, above the windows
  for (const s of [-1, 1]) {
    const at = [
      c.x + p.right.x * s * (w / 2 + 0.1),
      c.y + 4.9,
      c.z + p.right.z * s * (w / 2 + 0.1),
    ];
    deco.push({
      t: 'block',
      at: [r1(at[0]), r1(at[1]), r1(at[2])],
      size: [0.1, 0.45, d - 0.6],
      heading: p.heading,
      mat: 'glow',
      color: line.color,
      lowDetail: true,
    });
  }
  // a sodium lamp at the entry
  const l = p.rel(-1.5, w / 2 + 1.2);
  deco.push({ t: 'lamp', at: [r1(l.x), r1(l.y - 0.1), r1(l.z)], color: SODIUM });
  p.move(0, DOOR[1] / 2 - 1);
  const through = (Math.round(p.heading / 90) * 90) % 360;
  p.airPortal(1.6, exit, turnTo(through, heading), DOOR, { ...line, vertical: 'zero' });
};

/**
 * An A-frame spine: the first curve ridden on `faces[0]`, then at every crossing a new curve
 * joined exactly to the last (one ridge line, one grade through it): a gradual climb to the
 * crest on the near face, then the far face just under the crest and a gradual settle down it
 * (surf-basalt-cathedral.ts `spineCurve`, with more than one crossing). `parts[k]` are the legs
 * ridden on `faces[k]` (at the usual depth).
 */
const spine = (
  p: Pen,
  faces: ('left' | 'right')[],
  parts: CurveLeg[][],
  color: number,
  grade = 0.05,
): void => {
  const g = grade;
  p.curve({
    lead: 12,
    ride: faces[0],
    legs: [
      ...parts[0].map((l, i) => (i ? l : { ...l, ride: faces[0] })),
      ...climb(0.35, 0.04, 30, 30 * g, 10),
    ],
    ...SPINE,
    side: 'both',
    color,
  });
  for (let k = 1; k < faces.length; k++) {
    const prev = lastCurve(p);
    const a = curvePath(prev);
    const end = a.at(a.length);
    const last = k === faces.length - 1;
    const legs: CurveLeg[] = [
      straight(8, 8 * g, { depth: 0.04 }),
      ...climb(0.04, 0.12, 12, 12 * g, 3),
      ...climb(0.12, 0.3, 16, 16 * g, 4),
      ...parts[k].map((l, i) => (i ? l : { depth: 0.35, ...l })),
      ...(last ? [] : climb(0.35, 0.04, 30, 30 * g, 10)),
    ];
    const b: CurveEl = {
      t: 'curve',
      at: [r3(end.pos.x), r3(end.pos.y), r3(end.pos.z)],
      heading: r3(headingTo(end.dir.x, end.dir.z)),
      legs,
      ...SPINE,
      side: 'both',
      ride: faces[k],
      lead: 3,
      color,
      go: 'strafe',
    };
    p.route.push(b);
    const pb = curvePath(b);
    const bEnd = pb.at(pb.length);
    let depth = 0.35;
    for (const l of legs) depth = l.depth ?? depth;
    p.pos = curveRidePoint(b, bEnd, faces[k], depth);
    p.heading = r3(headingTo(bEnd.dir.x, bEnd.dir.z));
  }
};

/**
 * A round billboard drum (the wall a curved hop chain wraps round): a solid 16-sided steel
 * core of apothem `R` round `c`, lit glass screens a little outside it (see-through, never
 * colliding) and glowing rims at the top and bottom.
 */
const drum = (deco: SceneryElement[], c: [number, number], y0: number, y1: number, R: number) => {
  const n = 16;
  const side = 2 * R * Math.tan(Math.PI / n);
  for (let k = 0; k < n; k++) {
    const b = (k * 360) / n;
    const [dx, dz] = dirOf(b);
    const at = (r: number, y: number): P3 => [r1(c[0] + dx * r), r1(y), r1(c[1] + dz * r)];
    deco.push({
      t: 'block',
      at: at(R - 0.5, y0),
      size: [r1(side + 0.1), r1(y1 - y0), 1],
      heading: b,
      mat: 'panel',
      color: STEEL_DARK,
      solid: true,
      lowDetail: true,
    });
    // screens: two bands of lit glass, alternating tints
    for (const [lo, hi] of [
      [y1 - 16, y1 - 2],
      [y1 - 34, y1 - 20],
    ])
      deco.push({
        t: 'block',
        at: at(R + 0.4, lo),
        size: [r1(side * 0.86), hi - lo, 0.2],
        heading: b,
        mat: 'glass',
        color: SCREENS[(k + (lo > y1 - 18 ? 0 : 1)) % 2],
      });
    for (const y of [y1 - 1.2, y1 - 18.5, y1 - 36])
      deco.push({
        t: 'block',
        at: at(R + 0.25, y),
        size: [r1(side * 0.98), 0.5, 0.3],
        heading: b,
        mat: 'glow',
        color: SCREENS[2],
        lowDetail: true,
      });
  }
};

/**
 * A flat billboard (bottom middle at `at`, `len` along `heading`, `h` tall): a solid steel back
 * with a lit glass screen on each face and a glowing frame.
 */
const billboard = (
  deco: SceneryElement[],
  at: P3,
  heading: number,
  len: number,
  h: number,
  tint: number,
) => {
  // (a board lies along `heading`: its long side is the block's depth)
  deco.push({
    t: 'block',
    at,
    size: [1, h, len],
    heading,
    mat: 'panel',
    color: STEEL_DARK,
    solid: true,
    lowDetail: true,
  });
  const [fx, fz] = dirOf(heading + 90);
  for (const s of [-1, 1]) {
    deco.push({
      t: 'block',
      at: [r1(at[0] + fx * s * 0.7), r1(at[1] + 1), r1(at[2] + fz * s * 0.7)],
      size: [0.2, h - 2, len - 1.2],
      heading,
      mat: 'glass',
      color: tint,
    });
    for (const y of [0.3, h - 0.5])
      deco.push({
        t: 'block',
        at: [r1(at[0] + fx * s * 0.62), r1(at[1] + y), r1(at[2] + fz * s * 0.62)],
        size: [0.2, 0.3, len - 0.4],
        heading,
        mat: 'glow',
        color: tint,
        lowDetail: true,
      });
    // the lit picture behind the glass: bands of light in the upper half
    for (let k = 0; k < 3 && h - 3 - k * 1.6 > h / 2; k++)
      deco.push({
        t: 'block',
        at: [r3(at[0] + fx * s * 0.56), r1(at[1] + h - 3 - k * 1.6), r3(at[2] + fz * s * 0.56)],
        size: [0.06, 0.5, r1((len - 3) * (1 - k * 0.2))],
        heading,
        mat: 'glow',
        color: k === 1 ? SCREENS[2] : tint,
        lowDetail: true,
      });
  }
};

/** A red laser bar across the way (a red zone), with its two emitter posts beyond the ends. */
const laser = (p: Pen, deco: SceneryElement[], at: P3, heading: number, len: number) => {
  // (a bar across `heading`: bottom middle at `at`)
  p.route.push({ t: 'red', at, size: [len, 0.6, 0.6], heading: r3(heading) });
  const [rx, rz] = dirOf(heading + 90);
  for (const s of [-1, 1]) {
    const x = at[0] + rx * s * (len / 2 + 1.2);
    const z = at[2] + rz * s * (len / 2 + 1.2);
    deco.push({
      t: 'block',
      at: [r1(x), r1(at[1] - 5.4), r1(z)],
      size: [1.4, 5, 1.4],
      heading,
      mat: 'panel',
      color: STEEL,
      lowDetail: true,
    });
    deco.push({
      t: 'block',
      at: [r1(x), r1(at[1] - 0.2), r1(z)],
      size: [1.6, 1, 1.6],
      heading,
      mat: 'glow',
      color: PALETTE.hazard,
      lowDetail: true,
    });
  }
};

/** A parked maglev car (solid): bottom middle at `at`, lying along `heading`. */
const maglev = (deco: SceneryElement[], at: P3, heading: number, len: number) => {
  deco.push({
    t: 'block',
    at,
    size: [3, 3.4, len],
    heading,
    mat: 'plate',
    color: 0x3a4058,
    solid: true,
    lowDetail: true,
  });
  const [rx, rz] = dirOf(heading + 90);
  for (const s of [-1, 1])
    deco.push({
      t: 'block',
      at: [r1(at[0] + rx * s * 1.58), r1(at[1] + 1.8), r1(at[2] + rz * s * 1.58)],
      size: [0.12, 0.8, len - 2],
      heading,
      mat: 'glow',
      color: 0x3ff0ff,
      lowDetail: true,
    });
  // (it floats: a glowing guide under it)
  deco.push({
    t: 'block',
    at: [at[0], r1(at[1] - 1.4), at[2]],
    size: [1.8, 0.6, len - 3],
    heading,
    mat: 'glow',
    color: 0x6c7bff,
    lowDetail: true,
  });
};

/** The Drift Tower: six lit legs round its core, glass between them up top, three halos. */
const tower = (deco: SceneryElement[], helixTop: number, deckY: number) => {
  const [ox, oz] = TOWER;
  const base = KILL_Y + 1;
  const top = 452;
  for (let k = 0; k < 6; k++) {
    const b = k * 60 + 30;
    const [dx, dz] = dirOf(b);
    deco.push({
      t: 'block',
      at: [r1(ox + dx * LEG_R), base, r1(oz + dz * LEG_R)],
      size: [5, top - base, 5],
      round: true,
      color: STEEL,
      lowDetail: true,
    });
    // glass between the legs above the helix
    const [mx, mz] = dirOf(b + 30);
    const span = 2 * LEG_R * Math.sin(30 * DEG) - 7;
    deco.push({
      t: 'block',
      at: [r1(ox + mx * LEG_R * 0.866), r1(helixTop + 14), r1(oz + mz * LEG_R * 0.866)],
      size: [r1(span), r1(top - helixTop - 16), 0.3],
      heading: b + 30,
      mat: 'glass',
      color: k % 2 ? 0xff4fd8 : 0x8a7bff,
    });
  }
  // lit rings round the legs every 24 m (not at the core deck: the express line passes there)
  for (let y = base + 20; y < top; y += 24) {
    if (Math.abs(y - deckY) < 10) continue;
    for (let k = 0; k < 12; k++) {
      const b = k * 30 + 15;
      const [dx, dz] = dirOf(b);
      deco.push({
        t: 'block',
        at: [r1(ox + dx * (LEG_R + 2.8)), y, r1(oz + dz * (LEG_R + 2.8))],
        size: [r1(2 * (LEG_R + 2.8) * Math.tan(15 * DEG) + 0.2), 0.6, 0.4],
        heading: b,
        mat: 'glow',
        color: 0x8a7bff,
        lowDetail: true,
      });
    }
  }
  // the crown and its three magenta halos
  deco.push({
    t: 'block',
    at: [ox, top, oz],
    size: [60, 2, 60],
    round: true,
    color: STEEL_DARK,
    lowDetail: true,
  });
  [
    [456, 34],
    [464, 44],
    [472, 54],
  ].forEach(([y, R]) => {
    const n = 24;
    for (let k = 0; k < n; k++) {
      const b = (k * 360) / n;
      const [dx, dz] = dirOf(b);
      deco.push({
        t: 'block',
        at: [r1(ox + dx * R), y, r1(oz + dz * R)],
        size: [r1(2 * R * Math.tan(Math.PI / n) + 0.1), 1, 1],
        heading: b,
        mat: 'glow',
        color: 0xff4fd8,
        lowDetail: true,
      });
    }
  });
  // the core deck's rim at the express line's height
  for (let k = 0; k < 16; k++) {
    const b = (k * 360) / 16;
    const [dx, dz] = dirOf(b);
    deco.push({
      t: 'block',
      at: [r1(ox + dx * 32), r1(deckY - 3), r1(oz + dz * 32)],
      size: [r1(2 * 32 * Math.tan(Math.PI / 16) + 0.1), 0.4, 0.6],
      heading: b,
      mat: 'glow',
      color: LINE.X.color,
      lowDetail: true,
    });
  }
};

/** The city far outside the route: dark towers with neon near their tops (all under y 480). */
const city = (deco: SceneryElement[]) => {
  const NEON = [0xff4fd8, 0x3ff0ff, 0x8a7bff, 0x2ee6a6];
  for (let i = 0; i < 14; i++) {
    const b = i * (360 / 14) + ((i * 37) % 11);
    const R = 560 + ((i * 53) % 70);
    const [dx, dz] = dirOf(b);
    const w = 26 + ((i * 17) % 14);
    const h = 80 + ((i * 71) % 80);
    const at: P3 = [r1(dx * R), KILL_Y + 1, r1(dz * R)];
    deco.push({ t: 'block', at, size: [w, h, w], heading: b, color: 0x141830, lowDetail: true });
    const c = NEON[i % NEON.length];
    for (let k = 0; k < 2; k++)
      deco.push({
        t: 'block',
        at: [
          r1(at[0] - dx * (w / 2 + 0.3)),
          r1(KILL_Y + 1 + h - 16 - k * 28),
          r1(at[2] - dz * (w / 2 + 0.3)),
        ],
        size: [r1(w * 0.7), 3, 0.5],
        heading: b,
        mat: 'glow',
        color: c,
        lowDetail: true,
      });
  }
};

/** A sodium lamp `f` ahead, `s` to the side of the pen, `u` up (on a landing's rim). */
const lamp = (p: Pen, deco: SceneryElement[], f: number, s: number, u = 0) => {
  const q = p.rel(f, s, u);
  deco.push({ t: 'lamp', at: [r1(q.x), r1(q.y), r1(q.z)], color: SODIUM });
};

/** The course data (pure JSON). */
export const neonDriftCourse = (): CourseData => {
  const deco: SceneryElement[] = [];
  const forks: CourseFork[] = [];
  const p = new Pen([-380, 430, 250], 90);

  // ---- Act 1 Platform 1: a hop chain wrapping left round a billboard drum ----
  p.start([10, 16]);
  lamp(p, deco, -2, 6);
  p.go('jump');
  {
    const c = p.rel(9, -23);
    p.bhopPads(
      [{ d: 9, rise: -1, size: [6, 8] }, ...wrap([10.5, 11.5, 12.5, 13.5, 14.5], 23, -1)],
      [4.5, 7],
    );
    const ys = lastPads(p).map((q) => q[1]);
    drum(deco, [c.x, c.z], Math.min(...ys) - 26, Math.max(...ys) + 16, 17.5);
  }
  p.turn(-15);
  p.move(7, -1).anchor('Drum', { back: 16, side: 12, up: 5, flightSec: 1.0 }, [10, 9]);
  p.move(11, -2.5).curve({
    lead: 8,
    legs: [straight(65, 3), arc(90, 60, 7), straight(80, 3)],
    ...MID,
    side: 'right',
    color: VIOLET[0],
  });
  p.move(4, -2).anchor('Signal Box', {}, [12, 12]);
  p.move(14, -5, 9).curve({
    legs: [straight(60, 2), arc(-45, 80, 4), straight(130, 4)],
    ...MID,
    side: 'left',
    color: VIOLET[0],
  });
  {
    const t = turnTo(p.heading, 0);
    hopOff(p);
    p.move(16, -3).bhopPads(
      [
        { d: 0, size: [5, 8] },
        { d: 15, rise: -1, turn: r1(t / 3) },
        { d: 15.5, rise: -1, turn: r1(t / 3) },
        { d: 16, rise: -1, turn: r1(t / 3) },
      ],
      [4.5, 7],
    );
  }
  p.move(14.5, -1);
  station(p, deco, 'Platform 2', [-330, 440, -330], 90, LINE.A);

  // ---- Act 2 Flyover: an S-curve, two flicks between parallel flyovers under a laser ----
  p.move(11, -6).curve({
    lead: 12,
    legs: [straight(55, 3), arc(60, 45, 5), arc(-60, 45, 5), straight(55, 3)],
    ...MID,
    side: 'left',
    color: VIOLET[1],
  });
  p.move(4, -2).anchor('Flyover', {}, [12, 12]);
  p.move(14, -5, -9).curve({
    legs: [straight(50, 2), arc(25, 120, 2), straight(40, 2)],
    ...MID,
    side: 'right',
    color: VIOLET[1],
  });
  {
    // the laser gantry over the second transfer: 3.6 m over its middle (a high release hits it)
    const a = p.pos;
    const b = p.rel(14, 9, -5);
    const h = headingTo(b.x - a.x, b.z - a.z);
    laser(p, deco, [r1((a.x + b.x) / 2), r1((a.y + b.y) / 2 + 3.6), r1((a.z + b.z) / 2)], h, 20);
  }
  p.move(14, -5, 9).curve({
    legs: [straight(30, 1), arc(-75, 70, 5), straight(50, 2)],
    ...MID,
    side: 'left',
    color: VIOLET[1],
  });
  p.move(4, -2).anchor('Crossover', {}, [12, 12]);
  p.move(14, -5, -9).curve({
    legs: [straight(30, 1), arc(40, 90, 3), straight(90, 3)],
    ...MID,
    side: 'right',
    color: VIOLET[1],
  });
  {
    const t = turnTo(p.heading, 90);
    hopOff(p);
    p.move(16, -3).bhopPads(
      [
        { d: 0, size: [5, 8] },
        { d: 16, rise: -1, turn: r1(t / 3) },
        { d: 16.5, rise: -1, turn: r1(t / 3) },
        { d: 17, rise: -1, turn: r1(t / 3) },
      ],
      [4.5, 7],
    );
  }
  p.move(15, -1);
  station(p, deco, 'Junction', [420, 440, -330], 180, LINE.B);

  // ---- Act 3 Billboard Alley: a drop-hop zigzag between billboards, a framed window ----
  p.move(10, -3).bhopPads(
    [
      { d: 0, size: [6, 8] },
      { d: 13, turn: 25, rise: -2 },
      { d: 13.5, turn: -50, rise: -2 },
      { d: 14, turn: 50, rise: -2 },
      { d: 14.5, turn: -50, rise: -2 },
    ],
    [4, 6.5],
  );
  const zig1 = lastPads(p);
  p.turn(50)
    .move(7.5, -1)
    .anchor('Billboards', { back: 6, side: 15, up: 3, flightSec: 0.9 }, [4.5, 7]);
  p.move(7.5, -1).bhopPads(
    [
      { d: 0 },
      { d: 15, turn: -50, rise: -2 },
      { d: 15.5, turn: 50, rise: -2 },
      { d: 16, turn: -50, rise: -2 },
      { d: 16.5, turn: 50, rise: -2 },
      { d: 17, turn: -25, rise: -2 },
    ],
    [4, 6.5],
  );
  {
    const pads = [...zig1, ...lastPads(p)];
    // three billboards, each between two pads on the same side of the zigzag: from the first
    // you can't see the second until you have turned onto the pad between them. The second is
    // a low one: a booster ring floats over its top (the billboard skip, a faster line)
    [
      [1, 3],
      [4, 6],
      [7, 9],
    ].forEach(([i, j], k) => {
      const a = pads[i];
      const b = pads[j];
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const lo = Math.min(a[1], b[1]);
      const h = k === 1 ? pads[5][1] + 0.3 - (lo - 6) : Math.abs(a[1] - b[1]) + 13;
      billboard(
        deco,
        [r1((a[0] + b[0]) / 2), r1(lo - 6), r1((a[2] + b[2]) / 2)],
        r3(headingTo(b[0] - a[0], b[2] - a[2])),
        r1(len - 13),
        r1(h),
        SCREENS[k % 2],
      );
    });
    // the billboard skip: from pad 5 hop sideways up through the booster ring over the low
    // billboard; it throws you along the alley onto pad 8 (two landings fewer)
    const a = pads[4];
    const b = pads[6];
    const ring: P3 = [r1((a[0] + b[0]) / 2), r1(pads[5][1] + 1.7), r1((a[2] + b[2]) / 2)];
    const land = pads[8];
    const dist = Math.hypot(land[0] - ring[0], land[2] - ring[2]);
    const speed = 28;
    const t = dist / speed;
    const up = r1((land[1] - (ring[1] + 0.9) + 10 * t * t) / t);
    p.branch((q) => {
      q.route.push({
        t: 'booster',
        at: ring,
        heading: r3(headingTo(land[0] - ring[0], land[2] - ring[2])),
        speed,
        up,
        size: [5, 4],
        air: true,
      });
    });
    const mid = (u: P3, v: P3, dy: number): P3 => [
      r1((u[0] + v[0]) / 2),
      r1((u[1] + v[1]) / 2 + dy),
      r1((u[2] + v[2]) / 2),
    ];
    forks.push({
      name: 'Billboard skip',
      safe: 'hop the zigzag round the low billboard (pads 6 and 7)',
      risky: 'from pad 5 hop sideways up through the booster ring over the low billboard',
      line: [
        { at: mid(pads[4], pads[5], 1.5), air: true },
        { at: pads[5], hop: true },
        { at: [ring[0], r1(pads[5][1] + 1.2), ring[2]] },
        { at: land, hop: true },
        { at: pads[9], hop: true },
      ],
    });
  }
  p.move(8, -1).anchor('Alley End', { up: 6, flightSec: 1.1 }, [10, 9]);
  p.move(10, -1).curve({
    lead: 8,
    legs: [straight(45, 3), arc(35, 80, 4), straight(55, 3)],
    ...MID,
    side: 'right',
    color: VIOLET[2],
  });
  {
    // the framed window: a billboard frame with red bars up its sides and a laser across it at
    // 4.5 m (a high flight hits it; the gap over the laser is for show)
    const hole: [number, number] = [5.5, 7.5];
    p.window(8, hole, [18, 17], -3, 4.5);
    const w = p.route[p.route.length - 1];
    if (w.t !== 'window') throw new Error('window');
    const [dx, dz] = dirOf(w.heading + 90);
    const L = (x: number, y: number): P3 => [
      r1(w.at[0] + dx * x),
      r1(w.at[1] + y),
      r1(w.at[2] + dz * x),
    ];
    p.route.push({
      t: 'red',
      at: L(0, 4.5),
      size: [hole[0] - 0.1, 0.5, 0.5],
      heading: w.heading,
    });
    for (const k of [-1, 1])
      p.route.push({
        t: 'red',
        at: L(k * (hole[0] / 2 - 0.3), 0.05),
        size: [0.5, 4.4, 0.5],
        heading: w.heading,
      });
  }
  p.move(6, -1.5, 4.5).curve({
    legs: [straight(60, 2), arc(-40, 80, 4), straight(60, 2)],
    ...MID,
    side: 'left',
    color: VIOLET[2],
  });
  p.move(4, -2).anchor('Roofline', {}, [12, 12]);
  p.move(14, -5, -9).curve({
    legs: [straight(80, 3), arc(turnTo(p.heading, 180), 90, 3), straight(60, 1)],
    early: 3,
    ...MID,
    side: 'right',
    color: VIOLET[2],
  });
  {
    // the 16 m speed gap onto the station roof, under a laser ceiling (keep low)
    const a = p.pos;
    for (const f of [5, 10, 15]) {
      const q = p.rel(f, 0, 0);
      laser(p, deco, [r1(q.x), r1(a.y + 4.6 - f * 0.12), r1(q.z)], p.heading, 14);
    }
  }
  p.move(16, -4).platform([10, 9]);
  station(p, deco, 'Interchange', [0, 0, 0], 90, LINE.C);

  // ---- Act 4 Drift Tower: an approach, a 300° descending helix round the tower, a long catch ----
  const helixOpts: Parameters<Pen['curve']>[0] = {
    lead: 12,
    legs: [straight(10, 1), arc(140, HELIX_R, 19), arc(140, HELIX_R, 19, { red: 0.75 })],
    ...TIGHT,
    side: 'left',
    color: VIOLET[3],
  };
  const approach = (q: Pen) => {
    q.move(11, -6).curve(helixOpts);
  };
  {
    // (C3's exit is solved so the helix's centre is the tower's axis)
    const exit: P3 = [-100, 440, -60];
    const g = new Pen(exit, 90);
    approach(g);
    const r = curvePath(lastCurve(g)).at(HELIX_S0);
    // (right of the way is (-dir.z, dir.x))
    const cx = r.pos.x - r.dir.z * HELIX_R;
    const cz = r.pos.z + r.dir.x * HELIX_R;
    const portal = p.route[p.route.length - 1];
    if (portal.t !== 'portal') throw new Error('portal');
    portal.exit = [r1(exit[0] + TOWER[0] - cx), exit[1], r1(exit[2] + TOWER[1] - cz)];
    p.pos = v3(portal.exit[0], portal.exit[1], portal.exit[2]);
  }
  approach(p);
  const helix = lastCurve(p);
  p.move(4, -2).anchor('Helix Foot', {}, [12, 12]);
  {
    // the catch circles on round the tower, outside the helix
    const land = p.rel(14, -9, -5);
    const rc = Math.hypot(land.x - TOWER[0], land.z - TOWER[1]) + (12 / Math.tan(60 * DEG)) * 0.35;
    p.move(14, -5, -9).curve({
      legs: [straight(30, 15), arc(120, r1(rc), 8), straight(130, 4)],
      ...MID,
      side: 'right',
      color: VIOLET[3],
    });
  }
  const catchCurve = lastCurve(p);
  p.move(4, -2).anchor('Halo Stair', {}, [12, 12]);
  p.move(14, -5, 9).curve({
    legs: [straight(20, 1), arc(turnTo(p.heading, 20), 45, 4), straight(55, 2)],
    ...MID,
    side: 'left',
    color: VIOLET[3],
  });
  p.move(4, -2).anchor('Gantry Steps', {}, [12, 12]);
  p.move(14, -5, -9).curve({
    legs: [straight(40, 1), arc(turnTo(p.heading, 0), 80, 3), straight(50, 2)],
    ...MID,
    side: 'right',
    color: VIOLET[3],
  });
  p.move(16, -4).platform([10, 9]);
  station(p, deco, 'Halo', [350, 430, 400], 270, LINE.D);
  // the core-deck express (a faster line): over the helix's ridge at φ 185 onto the tower's
  // core deck, three hops round inside the helix and the express portal X, which puts you on the
  // catch's last straight
  let deckY: number;
  let helixTop: number;
  {
    const path = curvePath(helix);
    const s = (phi: number) => HELIX_S0 + phi * DEG * HELIX_R;
    helixTop = path.at(0).pos.y;
    // (the helix is a circle round the tower: φ degrees on from its start, clockwise)
    const b0 = (() => {
      const r = path.at(s(0));
      return headingTo(r.pos.x - TOWER[0], r.pos.z - TOWER[1]);
    })();
    const bearing = (phi: number) => b0 + phi;
    const inner = (phi: number, R: number, y: number): P3 => {
      const [dx, dz] = dirOf(bearing(phi));
      return [r1(TOWER[0] + dx * R), r1(y), r1(TOWER[1] + dz * R)];
    };
    const PADS = [197, 214, 231];
    const rel = path.at(s(185)).pos.y;
    const pads = PADS.map((phi, k) => inner(phi, 40, rel - 6 - k));
    deckY = pads[0][1];
    // the express portal X, a hop on (its opening faces the nearest compass heading)
    const px = inner(250, 40, pads[2][1] + 1);
    const hop = headingTo(px[0] - pads[2][0], px[2] - pads[2][2]);
    const ph = (Math.round(hop / 90) * 90) % 360;
    // where it puts you: over the catch's last straight, heading along it
    const cp = curvePath(catchCurve);
    const at = cp.at(cp.length - 60);
    const onto = rideAt(catchCurve, cp.length - 60, 0.35);
    const exit: P3 = [onto[0], r1(onto[1] + 4), onto[2]];
    const outHeading = headingTo(at.dir.x, at.dir.z);
    {
      // (off the racing line: `alt`, like a branch's pieces)
      p.route.push({
        t: 'jumps',
        pads: pads.map((at, k) => ({
          at,
          size: [4.5, 6] as [number, number],
          heading: r3(bearing(PADS[k]) + 90),
        })),
        go: 'hop',
        style: 'bhop',
        alt: true,
      });
      p.route.push({
        t: 'portal',
        at: [px[0], r1(px[1] - 1), px[2]],
        heading: ph,
        exit,
        size: [7, 7],
        air: true,
        turn: turnTo(ph, outHeading),
        vertical: 'zero',
        color: LINE.X.color,
        glyph: LINE.X.glyph,
        alt: true,
      });
    }
    const [hx, hz] = dirOf(hop);
    forks.push({
      name: 'Core-deck express',
      safe: 'ride the helix round to its foot and the long catch round the tower',
      risky:
        'climb to the helix ridge by φ 185, drop over it onto the core deck, three hops and the express portal X',
      line: [
        { at: rideAt(helix, s(155), 0.35), surf: true },
        { at: rideAt(helix, s(173), 0.15), surf: true },
        { at: rideAt(helix, s(185), 0.03), surf: true },
        ...pads.map((at) => ({ at, hop: true })),
        { at: [px[0], r1(px[1] + 2.5), px[2]], portal: true },
        { at: [r1(px[0] + hx * 3), r1(px[1] + 1.5), r1(px[2] + hz * 3)] },
        { at: onto, surf: true },
        { at: rideAt(catchCurve, cp.length - 30, 0.35), surf: true },
      ],
    });
  }

  // ---- Act 5 Rail Yard: a hop chain between parked maglev cars over the live rails ----
  p.move(11, -6).curve({
    lead: 12,
    legs: [straight(90, 5), arc(20, 100, 3), straight(50, 2)],
    ...MID,
    side: 'right',
    color: VIOLET[4],
  });
  p.move(4, -2).anchor('Yard Throat', {}, [12, 12]);
  hopOff(p);
  p.move(17, -6).bhopPads(
    [
      { d: 0, size: [5, 8] },
      { d: 18, turn: 17.5, rise: -1 },
      { d: 18.5, turn: -35, rise: -1 },
      { d: 19, turn: 35, rise: -1 },
    ],
    [5, 8],
  );
  const yard1 = lastPads(p);
  p.turn(-35)
    .move(9.75, -0.5)
    .anchor('Live Rails', { back: 16, side: 12, up: 2.5, flightSec: 0.7 }, [10, 9]);
  p.move(9.75, -0.5).bhopPads(
    [
      { d: 0 },
      { d: 18.5, turn: 35, rise: -1 },
      { d: 19, turn: -35, rise: -1 },
      { d: 19.5, turn: 17.5, rise: -1 },
    ],
    [5, 8],
  );
  {
    const pads = [...yard1, ...lastPads(p)];
    // two rows of parked cars either side of the zigzag, one opposite every hop's middle (the
    // chain weaves between them); the live rails (red) 10 m under the pads
    const first = pads[0];
    const last = pads[pads.length - 1];
    const ah = headingTo(last[0] - first[0], last[2] - first[2]);
    const [ax, az] = dirOf(ah);
    const lats = pads.map((q) => (q[0] - first[0]) * -az + (q[2] - first[2]) * ax);
    const lo = Math.min(...lats) - 6.5;
    const hi = Math.max(...lats) + 6.5;
    // (no car where the Live Rails restart bay stands)
    const bays = p.route.flatMap((e) => (e.t === 'anchor' && e.bay ? [e.bay] : []));
    for (let i = 1; i + 1 < pads.length; i++) {
      const a = pads[i];
      const b = pads[i + 1];
      const along = ((a[0] + b[0]) / 2 - first[0]) * ax + ((a[2] + b[2]) / 2 - first[2]) * az;
      for (const l of [lo, hi]) {
        const at: P3 = [
          r1(first[0] + ax * along - az * l),
          r1(Math.min(a[1], b[1]) - 1.5),
          r1(first[2] + az * along + ax * l),
        ];
        if (bays.some((q) => Math.hypot(q[0] - at[0], q[2] - at[2]) < 13)) continue;
        maglev(deco, at, r3(ah), 10);
      }
    }
    for (let i = 0; i + 1 < pads.length; i++) {
      const a = pads[i];
      const b = pads[i + 1];
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      p.route.push({
        t: 'red',
        at: [r1((a[0] + b[0]) / 2), r1(Math.min(a[1], b[1]) - 10), r1((a[2] + b[2]) / 2)],
        size: [16, 0.6, r1(len + 4)],
        heading: r3(headingTo(b[0] - a[0], b[2] - a[2])),
      });
    }
  }
  p.move(18, -2).curve({
    lead: 10,
    legs: [arc(-25, 50, 1)],
    ...SHORT,
    side: 'right',
    color: VIOLET[4],
  });
  p.move(18, -11, 10).curve({
    lead: 12,
    legs: [straight(60, 3), arc(turnTo(p.heading, 250), 90, 4), straight(70, 2)],
    ...MID,
    side: 'left',
    color: VIOLET[4],
  });
  p.move(4, -2).anchor('Car Shed', {}, [12, 12]);
  p.move(14, -5, -9).curve({
    legs: [straight(100, 3), arc(turnTo(p.heading, 270), 90, 3), straight(60, 2)],
    ...MID,
    side: 'right',
    color: VIOLET[4],
  });
  hopOff(p);
  p.move(15, -5).bhopPads(
    [
      { d: 0, size: [6, 9] },
      { d: 15, rise: -1 },
      { d: 15, rise: -1 },
    ],
    [4.5, 7.5],
  );
  p.move(13.5, -1);
  station(p, deco, 'Terminal', [-330, 405, 260], 45, LINE.E);

  // ---- Act 6 Terminal Run: a fast bend, a spine spin, widening pads, the last gap ----
  p.move(11, -6).curve({
    lead: 12,
    legs: [straight(80, 5), arc(45, 40, 4), straight(80, 3)],
    ...MID,
    side: 'right',
    color: VIOLET[5],
  });
  p.move(4, -2).anchor('Last Train', {}, [12, 12]);
  p.move(14, -5, 9);
  spine(
    p,
    ['left', 'right', 'left'],
    [[straight(60, 1)], [straight(60, 1)], [straight(70, 1)]],
    VIOLET[5],
  );
  p.move(4, -2).anchor('Halo Gate', {}, [12, 12]);
  hopOff(p);
  p.move(16, -3).bhopPads(
    [
      { d: 0, size: [5, 8] },
      { d: 15, turn: r1(turnTo(p.heading, 0) / 5), rise: -1 },
      { d: 15.5, turn: r1(turnTo(p.heading, 0) / 5), rise: -1 },
      { d: 16, turn: r1(turnTo(p.heading, 0) / 5), rise: -1 },
      { d: 16.5, turn: r1(turnTo(p.heading, 0) / 5), rise: -1 },
      { d: 17, turn: r1(turnTo(p.heading, 0) / 5), rise: -1 },
    ],
    [4.5, 7.5],
  );
  {
    // the last gap (17 m) into the finish gantry, under a laser ceiling
    const a = p.pos;
    for (const f of [7, 13]) {
      const q = p.rel(f + 3.75, 0, 0);
      laser(p, deco, [r1(q.x), r1(a.y + 4.3), r1(q.z)], p.heading, 12);
    }
  }
  p.move(17 + 3.75, -5).finish([14, 16]);
  tower(deco, helixTop, deckY);
  city(deco);
  // the storm far below the clouds (a dark sheet; it stands in for the engine's flat danger glow at
  // the kill height, which the lowest cloud seas would cut through)
  deco.push({ t: 'water', at: [0, KILL_Y - 16, 0], size: [1200, 1200], color: 0x120a30 });
  return p.course({
    name: 'Neon Drift',
    kind: 'race',
    parSec: 180,
    palette: PALETTE,
    sky: {
      top: 0x070b1c,
      horizon: 0x2b1e5c,
      ground: 0x0b0a22,
      sun: { dir: [-0.45, 0.55, -0.7], color: 0xf2f0ff, sizeDeg: 6 },
      sunLight: 0xb8c4ff,
      stars: true,
      fog: { near: 160, far: 700 },
      ambient: 0.8,
    },
    roomMat: 'panel',
    jetpack: false,
    killY: KILL_Y,
    // (under the tower approach: its own floor would reach under the helix and the catch)
    // (two patches where a fall thrown far out takes longest: off the helix's east side and
    // off the first bend of Act 2; nothing of the route runs under them)
    floors: [
      { y: 392, min: [68, 3], max: [150, 80] },
      { y: 400, min: [-240, -290], max: [-150, -190] },
    ],
    autoFloors: { below: 22, pad: 25 },
    scenery: deco,
    forks,
  });
};
