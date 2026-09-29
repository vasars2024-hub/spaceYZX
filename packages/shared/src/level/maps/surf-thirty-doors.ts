// "Thirty Doors" — a stage surf map (docs/movement-map-design/maps/X01-thirty-doors.md): thirty
// sealed rooms, each its own challenge, from gentle to extreme. Built as course data
// (level/course) on MOVEMENT_PROFILE v1.
//
// How a room works: you come out of the last room's door (a portal, marked with this room's
// number) into a speed ring that sets you to the room's level speed (teach 24, medium 27, hard
// 30, extreme 33 m/s — whatever you carried in, every room starts the same), fly through the
// room's gate (its progress gate and split, named "n · NAME" over it), clear the room and leave
// through its own door. A fall anywhere in a room brings you back to its restart bay behind the
// door, whose launch throws you back through the speed ring: the room's start replayed exactly.
// The rooms stand in three floors of ten (5 × 2 cells each, every room heading south at its
// start: floor 1 y 460, floor 2 y 320, floor 3 y 180), each walled in its wing's colour, its
// number in giant glowing digits on its far wall; six wings of five rooms share a look.
//
//   #  room               gimmick                                                  level
//   1  First Light        one long wide straight: hold into the ramp               teach
//   2  The Long Bend      one broad banked quarter turn                            teach
//   3  Crossing           the first transfer between two opposing wide faces       teach
//   4  Stepping Stones    a climbing lip, three big bhop pads, back onto a ramp    teach
//   5  The Grand Surf     two long S-curves joined by a transfer                   teach
//   6  Turnaround         a portal turns you right round onto a parallel ramp      medium
//   7  Keyhole            two transfers, each through a window in a wall           medium
//   8  Scoop Valley       dips and climbs; release off a climb onto a raised catch medium
//   9  Quarter Turns      two turning portals (+90°, −90°), a catch after each     medium
//  10  The Spine          an A-frame: ride one face, cross the ridge, the other    medium
//  11  Slingshot          a booster ring flings you over a long gap                hard
//  12  Red Band           red strips down the lower faces of two bends             hard
//  13  The Coil           a full turn of descending helix, out under its start     hard
//  14  Zigzag             six short faces left and right in turn, red below        hard
//  15  Hall of Windows    three transfers through ever smaller windows             hard
//  16  The Drop           two sixteen-metre high-to-low transfers                  hard
//  17  Bhop Gauntlet      five small swinging bhop pads over a red pool, a lintel  hard
//  18  Tight S            a tight S on one face (45 m bends)                       hard
//  19  Portal Maze        three turning portals that keep where you cross them     hard
//  20  Low Vault          a red cornice over the ridge, a red strip below          hard
//  21  Long Jump          two 30 m transfers off climbing lips onto red-footed faces extreme
//  22  Needle             two transfers through 9 × 7 m windows                    extreme
//  23  The Drain          a half-turn spiral tightening to 30 m round a red core   extreme
//  24  Pillar Garden      four transfers, each between two red posts               extreme
//  25  Switchback         two banked hairpins (34 m), red below, across the back   extreme
//  26  Cannon             two 40 m/s booster rings onto short red-footed bends     extreme
//  27  Chain Reaction     four offset portals, a short catch between each          extreme
//  28  Twin Spines        two tight A-frames back to back                          extreme
//  29  The Gauntlet       needle window, red strip, red posts, red cornice, portal extreme
//  30  The Last Door      a tightening red-strip helix, a needle window, home      extreme
import type {
  CourseData,
  CourseFork,
  CurveEl,
  CurveLeg,
  P2,
  P3,
  SceneryElement,
} from '../course/types';
import { Pen } from '../course/pen';
import { curvePath, curveRidePoint } from '../course/curve';
import { expandCourse } from '../course/expand';
import type { BoxDef } from '../types';

// ---------------------------------------------------------------------------------------------
// Shapes and helpers

/** Face shapes (docs/movement-map-design/maps/README.md): wide and forgiving → short and tight. */
const WIDE = { height: 18, angle: 55 };
const BROAD = { height: 16, angle: 56 };
const STD = { height: 14, angle: 58 };
const MID = { height: 12, angle: 60 };
const TIGHT = { height: 11, angle: 63 };
const SHORT = { height: 9, angle: 65 };

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
// (+ 0: never a negative zero, which JSON would not keep)
const r1 = (x: number): number => Math.round(x * 10) / 10 + 0;
const r3 = (x: number): number => Math.round(x * 1000) / 1000 + 0;
const headingTo = (dx: number, dz: number): number =>
  (((Math.atan2(dx, -dz) / DEG) % 360) + 360) % 360;

/** The last element written (a curve, as its data). */
const lastCurve = (p: Pen): CurveEl => {
  const e = p.route[p.route.length - 1];
  if (e.t !== 'curve') throw new Error('not a curve');
  return e;
};

/**
 * A portal `f` metres on from the release (the pen), its opening's middle 0.8 m over where your
 * body passes flying at `v` m/s with vertical speed `vy` (a ballistic flight): nobody has to
 * brake or dive to meet it. The pen goes on from its exit. Returns the opening's middle.
 */
const portal = (
  p: Pen,
  f: number,
  v: number,
  vy: number,
  exit: P3,
  turn: number,
  size: P2,
  look: { color?: number; glyph?: string; offset?: boolean; vertical?: 'keep' | 'zero' },
): P3 => {
  const t = f / v;
  p.move(0, r1(vy * t - 10 * t * t + 0.9 + 0.8));
  const at = p.relP(f);
  p.airPortal(f, exit, turn, size, look);
  return at;
};

/** A leg run climbing the face gradually from depth `from` to `to` over `len` metres (spines). */
const climb = (from: number, to: number, len: number, drop: number, n = 4): CurveLeg[] =>
  Array.from({ length: n }, (_, k) => ({
    len: r3(len / n),
    drop: r3(drop / n),
    depth: r3(from + ((to - from) * (k + 1)) / n),
  }));

/**
 * An A-frame with a spine crossing (as in Basalt Cathedral): the `first` leg ridden on the
 * `near` face and a gradual climb to the crest, then from the crest on the `far` face — a short
 * stretch just under the crest, a gradual settle down it — and the `rest`. Returns the far half.
 */
const spine = (
  p: Pen,
  o: {
    near: 'left' | 'right';
    far: 'left' | 'right';
    first: CurveLeg;
    rest: CurveLeg[];
    color: number;
    shape?: { height: number; angle: number };
  },
): CurveEl => {
  const g = 0.05;
  const shape = o.shape ?? MID;
  p.curve({
    lead: 12,
    ride: o.near,
    legs: [{ ...o.first, ride: o.near }, ...climb(0.35, 0.04, 30, 30 * g, 10)],
    ...shape,
    side: 'both',
    color: o.color,
  });
  const a = curvePath(lastCurve(p));
  const end = a.at(a.length);
  const legs: CurveLeg[] = [
    straight(8, 8 * g, { depth: 0.04 }),
    ...climb(0.04, 0.12, 12, 12 * g, 3),
    ...climb(0.12, 0.3, 16, 16 * g, 4),
    ...o.rest.map((l, i) => (i ? l : { depth: 0.35, ...l })),
  ];
  const b: CurveEl = {
    t: 'curve',
    at: [r3(end.pos.x), r3(end.pos.y), r3(end.pos.z)],
    heading: r3(headingTo(end.dir.x, end.dir.z)),
    legs,
    ...shape,
    side: 'both',
    ride: o.far,
    lead: 3,
    color: o.color,
    go: 'strafe',
  };
  p.route.push(b);
  const pb = curvePath(b);
  const bEnd = pb.at(pb.length);
  let depth = 0.35;
  for (const l of legs) depth = l.depth ?? depth;
  p.pos = curveRidePoint(b, bEnd, o.far, depth);
  p.heading = r3(headingTo(bEnd.dir.x, bEnd.dir.z));
  return b;
};

/**
 * Under the bhop pads just written: a red pool 14 m below them (a missed hop sends you back),
 * and a low lintel (a solid beam `lintel` m over the pads on two posts) across the last hop.
 */
const redPool = (p: Pen, lintel: number): void => {
  const pads = p.route[p.route.length - 1];
  if (pads.t !== 'jumps') throw new Error('pads');
  const [a, b] = pads.pads.slice(-2).map((q) => q.at);
  const hd = r1(headingTo(b[0] - a[0], b[2] - a[2]));
  const m: P3 = [r1((a[0] + b[0]) / 2), a[1], r1((a[2] + b[2]) / 2)];
  const cs = Math.cos(hd * DEG);
  const sn = Math.sin(hd * DEG);
  const side = (k: number, u: number): P3 => [r1(m[0] + cs * k), r1(m[1] + u), r1(m[2] + sn * k)];
  p.route.push({ t: 'wall', at: side(0, lintel), size: [14, 2.4, 1.2], heading: hd });
  for (const k of [-6, 6])
    p.route.push({ t: 'wall', at: side(k, -8), size: [2, r1(lintel + 8 - 0.6), 1.2], heading: hd });
  const xs = pads.pads.map((q) => q.at[0]);
  const zs = pads.pads.map((q) => q.at[2]);
  p.route.push({
    t: 'red',
    at: [
      r1((Math.min(...xs) + Math.max(...xs)) / 2),
      r1(a[1] - 14),
      r1((Math.min(...zs) + Math.max(...zs)) / 2),
    ],
    size: [
      r1(Math.max(...xs) - Math.min(...xs) + 30),
      1,
      r1(Math.max(...zs) - Math.min(...zs) + 30),
    ],
    heading: 0,
  });
};

/**
 * A red cornice over curve `e`'s ridge from `s0` to `s1` (flat metres along it): red strips
 * 0.3 m over the ridge reaching 2 m out over the riding face (a head-height limit: climb to the
 * ridge and you're back), under a stone overhang in `color`.
 */
const cornice = (
  p: Pen,
  deco: SceneryElement[],
  e: CurveEl,
  s0: number,
  s1: number,
  color: number,
): void => {
  const path = curvePath(e);
  const face = e.side === 'right' ? 1 : -1;
  const n = Math.max(2, Math.round((s1 - s0) / 5));
  let prevTop = -Infinity;
  for (let k = 0; k < n; k++) {
    const a = path.at(s0 + ((s1 - s0) * k) / n);
    const b = path.at(s0 + ((s1 - s0) * (k + 1)) / n);
    const hd = headingTo(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
    const dx = Math.sin(hd * DEG);
    const dz = -Math.cos(hd * DEG);
    // (the face's side: right of the way is (-dz, dx))
    const ox = -dz * face;
    const oz = dx * face;
    const mx = (a.pos.x + b.pos.x) / 2 + ox * 0.75;
    const mz = (a.pos.z + b.pos.z) / 2 + oz * 0.75;
    const chord = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) + 0.1;
    const y = Math.max(a.pos.y, b.pos.y) + 0.3;
    p.route.push({
      t: 'red',
      at: [r1(mx), r3(y), r1(mz)],
      size: [2.5, 1, r3(chord)],
      heading: r3(hd),
    });
    deco.push({
      t: 'block',
      at: [r1(mx - ox * 0.6), r3(Math.max(y, prevTop) + 1.4), r1(mz - oz * 0.6)],
      size: [4.2, 1.6, r3(chord - 0.4)],
      heading: r3(hd),
      color,
      lowDetail: true,
    });
    prevTop = y;
  }
};

/**
 * Two red posts either side of the transfer about to be flown (`f` ahead, `u` up, `s` right of
 * the pen): at its middle, `gap` metres apart across it — thread between them.
 */
const posts = (p: Pen, f: number, u: number, s: number, gap: number): void => {
  const l = Math.hypot(f, s);
  // (across the flight: its right-hand perpendicular, in the pen's frame)
  const [af, as] = [-s / l, f / l];
  for (const k of [-1, 1]) {
    const at = p.relP(f / 2 + (af * k * gap) / 2, s / 2 + (as * k * gap) / 2, u / 2 - 10);
    p.route.push({ t: 'red', at, size: [1.6, 18, 1.6], heading: r1(p.heading) });
  }
};

// ---------------------------------------------------------------------------------------------
// The rooms

/** How hard a room is (the difficulty ramp: every room is harder than the one before). */
export type DoorLevel = 'teach' | 'medium' | 'hard' | 'extreme';

/** A wing: five rooms sharing a look (surf faces, walls, glow, islands). */
interface Wing {
  name: string;
  surf: number[];
  wall: number;
  glow: number;
  island: 'grass' | 'snow' | 'stone' | 'basalt' | 'neon';
}

const WINGS: Wing[] = [
  {
    name: 'Dawn Terraces',
    surf: [0x6fc2a8, 0x66b89f, 0x78c9b0, 0x5fb398, 0x71bfa6],
    wall: 0xd9cfb8,
    glow: 0xfff1c2,
    island: 'grass',
  },
  {
    name: 'Amber Halls',
    surf: [0xe0a458, 0xd89b4f, 0xe6ad62, 0xd4944a, 0xdea25a],
    wall: 0xb98b5e,
    glow: 0xffd28a,
    island: 'stone',
  },
  {
    name: 'Glacier Vaults',
    surf: [0x9fd6ec, 0x96cde4, 0xa8dcf0, 0x8fc6de, 0x9bd2ea],
    wall: 0xdfeef5,
    glow: 0xbff0ff,
    island: 'snow',
  },
  {
    name: 'Neon Foundry',
    surf: [0x8f7cf0, 0x8573e6, 0x9885f6, 0x7f6ddf, 0x8b78ec],
    wall: 0x2a2c3a,
    glow: 0x5ef2e6,
    island: 'neon',
  },
  {
    name: 'Basalt Forge',
    surf: [0x6b7480, 0x737c88, 0x67707c, 0x76808b, 0x6e7783],
    wall: 0x33363c,
    glow: 0xffa040,
    island: 'basalt',
  },
  {
    name: 'Void Crown',
    surf: [0xe8e4f4, 0xdedaee, 0xf0ecfa, 0xd8d3ea, 0xe4e0f2],
    wall: 0x1c1a2a,
    glow: 0xd6b3ff,
    island: 'stone',
  },
];

/** The speed every room of a level starts at (the door's speed ring sets it, m/s). */
export const THIRTY_DOORS_SPEED: Record<DoorLevel, number> = {
  teach: 24,
  medium: 27,
  hard: 30,
  extreme: 33,
};

/** What a room's builder gets: the pen (standing just past the room's gate) and its frame. */
interface Kit {
  p: Pen;
  /** the room's number (1..30) */
  n: number;
  /** its surf colour */
  c: number;
  wing: Wing;
  /** a point in the room's frame: `f` ahead (south), `s` to the right (west), `u` up */
  L: (f: number, s?: number, u?: number) => P3;
  deco: SceneryElement[];
  forks: CourseFork[];
}

export interface DoorRoom {
  n: number;
  name: string;
  /** the idea, in one line */
  idea: string;
  level: DoorLevel;
  /** its door portal's opening [width, height] (the way out, into the next room) */
  door: P2;
  build: (k: Kit) => void;
}

/** Transfers between opposing faces: from a right face across to the right, and back. */
const toLeft = (p: Pen, f = 14, u = -5, s = 9): Pen => p.move(f, u, s);
const toRight = (p: Pen, f = 14, u = -5, s = 9): Pen => p.move(f, u, -s);

export const THIRTY_DOORS_ROOMS: DoorRoom[] = [
  // ---------------------------------------------------------------- teach (1–5)
  {
    n: 1,
    name: 'First Light',
    idea: 'one long wide straight: hold into the ramp and feel it carry you',
    level: 'teach',
    door: [18, 18],
    build: ({ p, c }) => {
      p.move(9, -7).curve({ legs: [straight(140, 10)], ...WIDE, side: 'right', color: c });
    },
  },
  {
    n: 2,
    name: 'The Long Bend',
    idea: 'one broad banked quarter turn: follow the curve round',
    level: 'teach',
    door: [18, 18],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(40, 3), arc(-90, 80, 8), straight(50, 3)],
        ...BROAD,
        side: 'left',
        color: c,
      });
    },
  },
  {
    n: 3,
    name: 'Crossing',
    idea: 'the first transfer: leave one wide face and catch the one across',
    level: 'teach',
    door: [18, 18],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(80, 6)],
        ...WIDE,
        side: 'right',
        color: c,
      });
      toLeft(p, 15).curve({ legs: [straight(90, 6)], ...WIDE, side: 'left', color: c });
    },
  },
  {
    n: 4,
    name: 'Stepping Stones',
    idea: 'a climbing lip, three big bhop pads, back onto a ramp',
    level: 'teach',
    door: [18, 18],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(65, 5), straight(50, -8)],
        ...BROAD,
        side: 'right',
        color: c,
      });
      p.move(15, -2).bhopPads([{ d: 0, size: [10, 14] }, { d: 17 }, { d: 17.5 }], [9, 12]);
      p.move(22, -2).curve({
        legs: [straight(55, 4)],
        ...BROAD,
        side: 'right',
        color: c,
      });
    },
  },
  {
    n: 5,
    name: 'The Grand Surf',
    idea: 'two long S-curves and a transfer between them: everything so far, at speed',
    level: 'teach',
    door: [18, 18],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(20, 2), arc(35, 120, 5), arc(-35, 120, 5), straight(10, 1)],
        ...BROAD,
        side: 'right',
        color: c,
      });
      toLeft(p).curve({
        legs: [arc(-35, 120, 5), arc(35, 120, 5), straight(20, 2)],
        ...BROAD,
        side: 'left',
        color: c,
      });
    },
  },
  // ---------------------------------------------------------------- medium (6–10)
  {
    n: 6,
    name: 'Turnaround',
    idea: 'the first portal inside a room turns you right round onto a ramp beside the first',
    level: 'medium',
    door: [16, 16],
    build: ({ p, c, L, wing }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(90, 6)],
        ...STD,
        side: 'right',
        color: c,
      });
      portal(p, 14, 30, -1.5, L(130, 60, -22), 180, [16, 16], { color: wing.glow, glyph: '↺' });
      p.move(14, -7).curve({
        lead: 12,
        legs: [straight(90, 6)],
        ...STD,
        side: 'left',
        color: c,
      });
    },
  },
  {
    n: 7,
    name: 'Keyhole',
    idea: 'two transfers, each threaded through a window in a wall',
    level: 'medium',
    door: [16, 16],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(70, 5)],
        ...STD,
        side: 'right',
        color: c,
      });
      p.window(10, [16, 11], [28, 22], -5, 4);
      p.move(8, -1, 6).curve({ legs: [straight(60, 4)], ...STD, side: 'left', color: c });
      p.window(10, [14, 10], [26, 20], -5, -4);
      p.move(8, -1, -6).curve({ legs: [straight(60, 4)], ...STD, side: 'right', color: c });
    },
  },
  {
    n: 8,
    name: 'Scoop Valley',
    idea: 'a ramp that dips and climbs twice: release off the last climb up onto a raised catch',
    level: 'medium',
    door: [16, 16],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(40, 4), straight(35, -3), straight(40, 4), straight(35, -4)],
        ...STD,
        side: 'right',
        color: c,
      });
      p.move(20, -4, 10).curve({
        legs: [straight(40, 3), straight(30, -3), straight(30, 3)],
        ...STD,
        side: 'left',
        color: c,
      });
    },
  },
  {
    n: 9,
    name: 'Quarter Turns',
    idea: 'two turning portals: out heading west, then south again, catching a ramp each time',
    level: 'medium',
    door: [16, 16],
    build: ({ p, c, L, wing }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(70, 5)],
        ...STD,
        side: 'right',
        color: c,
      });
      portal(p, 14, 30, -1.5, L(130, -60, -16), 90, [14, 14], { color: wing.glow, glyph: '↱' });
      p.move(14, -7).curve({
        lead: 12,
        legs: [straight(80, 5)],
        ...STD,
        side: 'left',
        color: c,
      });
      portal(p, 14, 30, -1.5, L(190, 20, -30), -90, [14, 14], { color: wing.glow, glyph: '↲' });
      p.move(14, -7).curve({
        lead: 12,
        legs: [straight(60, 4)],
        ...STD,
        side: 'right',
        color: c,
      });
    },
  },
  {
    n: 10,
    name: 'The Spine',
    idea: 'an A-frame: ride one face, cross the ridge, settle down the other',
    level: 'medium',
    door: [16, 16],
    build: ({ p, c }) => {
      p.move(18, -7);
      spine(p, {
        near: 'right',
        far: 'left',
        first: straight(40, 2),
        rest: [arc(-40, 110, 4), arc(40, 110, 4), straight(30, 2)],
        color: c,
        shape: STD,
      });
    },
  },
  // ---------------------------------------------------------------- hard (11–20)
  {
    n: 11,
    name: 'Slingshot',
    idea: 'fly through a booster ring that flings you over a long gap onto a ramp far ahead',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(60, 4)], ...MID, side: 'right', color: c });
      p.move(12, -5).booster(36, 8, true, [10, 10]);
      p.move(47, -4).curve({ lead: 14, legs: [straight(60, 3)], ...BROAD, side: 'left', color: c });
      toRight(p).curve({
        legs: [arc(35, 90, 4), arc(-35, 90, 4), straight(20, 1)],
        ...MID,
        side: 'right',
        color: c,
      });
    },
  },
  {
    n: 12,
    name: 'Red Band',
    idea: 'red strips down the lower faces of two bends: hold your height through them',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(30, 2), arc(40, 100, 5), straight(30, 2)],
        ...MID,
        side: 'right',
        red: 0.62,
        color: c,
      });
      toLeft(p).curve({
        legs: [arc(-40, 100, 5), straight(40, 3)],
        ...MID,
        side: 'left',
        red: 0.62,
        color: c,
      });
    },
  },
  {
    n: 13,
    name: 'The Coil',
    idea: 'a full turn of a descending helix on tight faces, out under its own start',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(25, 2), arc(-180, 55, 7), arc(-180, 55, 7), straight(40, 2)],
        ...TIGHT,
        side: 'left',
        color: c,
      });
    },
  },
  {
    n: 14,
    name: 'Zigzag',
    idea: 'six short faces, left and right in turn, over the mist: one touch each',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(45, 3)], ...MID, side: 'right', color: c });
      p.move(18, -6, 9);
      for (let k = 0; k < 6; k++) {
        const right = k % 2 === 1;
        p.curve({
          lead: k ? 9 : 5,
          legs: [straight(16, 1)],
          ...SHORT,
          side: right ? 'right' : 'left',
          depth: 0.25,
          red: 0.8,
          color: c,
        });
        p.move(20, -7, right ? 5 : -5);
      }
      p.curve({ lead: 9, legs: [straight(50, 3)], ...MID, side: 'left', color: c });
    },
  },
  {
    n: 15,
    name: 'Hall of Windows',
    idea: 'three transfers through three windows, each smaller than the last',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(55, 4)], ...MID, side: 'right', color: c });
      p.window(10, [13, 10], [25, 20], -5, 4);
      p.move(8, -1, 6).curve({ legs: [straight(45, 3)], ...MID, side: 'left', color: c });
      p.window(10, [11, 9], [23, 19], -5, -4);
      p.move(8, -1, -6).curve({ legs: [straight(45, 3)], ...MID, side: 'right', color: c });
      p.window(10, [10, 8], [22, 18], -5, 4);
      p.move(8, -1, 6).curve({ legs: [straight(45, 3)], ...MID, side: 'left', color: c });
    },
  },
  {
    n: 16,
    name: 'The Drop',
    idea: 'two high-to-low transfers: fall sixteen metres onto a wide face and ride it out',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(50, 3)], ...MID, side: 'right', color: c });
      p.move(18, -16, 9).curve({
        lead: 14,
        legs: [straight(60, 3)],
        ...WIDE,
        side: 'left',
        color: c,
      });
      toRight(p).curve({ legs: [straight(40, 2)], ...MID, side: 'right', color: c });
      p.move(18, -16, 9).curve({
        lead: 14,
        legs: [straight(55, 3)],
        ...WIDE,
        side: 'left',
        color: c,
      });
    },
  },
  {
    n: 17,
    name: 'Bhop Gauntlet',
    idea: 'five small bhop pads swinging left and right over a red pool, under a low lintel',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(50, 4), straight(45, -6)],
        ...MID,
        side: 'right',
        color: c,
      });
      p.move(15, -2).bhopPads(
        [
          { d: 0, size: [8, 12] },
          { d: 16.5, turn: -15 },
          { d: 16.5, turn: 22 },
          { d: 16.5, turn: -22 },
          { d: 16.5, turn: 15 },
        ],
        [6, 8],
      );
      redPool(p, 4.2);
      p.move(22, -2).curve({ legs: [straight(60, 4)], ...MID, side: 'right', color: c });
    },
  },
  {
    n: 18,
    name: 'Tight S',
    idea: 'a tight S on one face: into the bend, out against it, and back',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(20, 2), arc(-50, 45, 3), arc(100, 45, 7), arc(-50, 45, 3), straight(30, 2)],
        ...MID,
        side: 'left',
        color: c,
      });
    },
  },
  {
    n: 19,
    name: 'Portal Maze',
    idea: 'three turning portals that keep where you cross them: west, south, east',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c, L, wing }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(45, 3)], ...MID, side: 'right', color: c });
      const look = (glyph: string) => ({ color: wing.glow, glyph, offset: true });
      portal(p, 14, 30, -1.5, L(100, -60, -14), 90, [12, 12], look('◇'));
      p.move(14, -7).curve({ lead: 12, legs: [straight(40, 2)], ...MID, side: 'left', color: c });
      portal(p, 14, 30, -1.5, L(150, 40, -28), -90, [12, 12], look('◈'));
      p.move(14, -7).curve({ lead: 12, legs: [straight(40, 2)], ...MID, side: 'right', color: c });
      portal(p, 14, 30, -1.5, L(240, 60, -42), -90, [12, 12], look('◆'));
      p.move(14, -7).curve({ lead: 12, legs: [straight(40, 2)], ...MID, side: 'left', color: c });
    },
  },
  {
    n: 20,
    name: 'Low Vault',
    idea: 'a red cornice over the ridge and a red strip below: ride the band between them',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c, deco, wing }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(35, 2), arc(50, 90, 5), straight(25, 2)],
        ...MID,
        side: 'right',
        red: 0.72,
        color: c,
      });
      cornice(p, deco, lastCurve(p), 10 + 35, 10 + 35 + (50 * Math.PI * 90) / 180, wing.wall);
      toLeft(p).curve({
        legs: [arc(-50, 90, 5), straight(30, 2)],
        ...MID,
        side: 'left',
        red: 0.72,
        color: c,
      });
      const e = lastCurve(p);
      cornice(p, deco, e, 5, 5 + (50 * Math.PI * 90) / 180, wing.wall);
    },
  },
  // ---------------------------------------------------------------- extreme (21–30)
  {
    n: 21,
    name: 'Long Jump',
    idea: 'two thirty-metre transfers off climbing lips: carry the speed or fall short',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(60, 5), straight(30, -3)],
        ...TIGHT,
        side: 'right',
        color: c,
      });
      // (the catches are red low down: fall short onto a foot and you're back at the door)
      p.move(30, -7, 12).curve({
        legs: [straight(50, 4), straight(25, -3)],
        ...TIGHT,
        side: 'left',
        red: 0.75,
        color: c,
      });
      p.move(32, -7, -12).curve({
        legs: [straight(45, 3)],
        ...TIGHT,
        side: 'right',
        red: 0.75,
        color: c,
      });
    },
  },
  {
    n: 22,
    name: 'Needle',
    idea: 'two transfers through windows barely wider than a body in flight',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(55, 4)],
        ...TIGHT,
        side: 'right',
        color: c,
      });
      p.window(10, [9, 7], [21, 17], -4, 4);
      p.move(8, -1.5, 6).curve({ legs: [straight(45, 3)], ...TIGHT, side: 'left', color: c });
      p.window(10, [9, 7], [21, 17], -4, -4);
      p.move(8, -1.5, -6).curve({ legs: [straight(40, 3)], ...TIGHT, side: 'right', color: c });
    },
  },
  {
    n: 23,
    name: 'The Drain',
    idea: 'a half-turn spiral tightening round a red core, a red strip below the line',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(30, 2), arc(-180, 64, 10, { toRadius: 30 }), straight(40, 2)],
        ...TIGHT,
        side: 'left',
        red: 0.72,
        color: c,
      });
      // the red core at the spiral's heart
      const e = lastCurve(p);
      const path = curvePath(e);
      // (the spiral's end: 10 m lead-in, 30 m straight, then π (30 − 64) / ln(30 / 64) m of spiral)
      const r = path.at(10 + 30 + (Math.PI * (30 - 64)) / Math.log(30 / 64));
      const cx = r.pos.x + r.dir.z * 30;
      const cz = r.pos.z - r.dir.x * 30;
      const low = path.at(path.length).pos.y;
      for (const hd of [0, 45])
        p.route.push({
          t: 'red',
          at: [r1(cx), r1(low - 30), r1(cz)],
          size: [9, 22, 9],
          heading: hd,
        });
    },
  },
  {
    n: 24,
    name: 'Pillar Garden',
    idea: 'four transfers, each threaded between two red posts',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(40, 3)],
        ...TIGHT,
        side: 'right',
        color: c,
      });
      for (let k = 0; k < 4; k++) {
        const right = k % 2 === 1;
        const s = right ? -9 : 9;
        posts(p, 14, -5, s, 10);
        p.move(14, -5, s).curve({
          legs: [straight(32, 2)],
          ...TIGHT,
          side: right ? 'right' : 'left',
          color: c,
        });
      }
    },
  },
  {
    n: 25,
    name: 'Switchback',
    idea: 'two banked hairpins: leave the first across its own back onto the second',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(20, 2), arc(180, 34, 9), straight(15, 1)],
        ...TIGHT,
        side: 'right',
        red: 0.75,
        color: c,
      });
      p.move(14, -5, -9).curve({
        legs: [straight(15, 1), arc(180, 34, 9), straight(25, 1)],
        ...TIGHT,
        side: 'right',
        red: 0.75,
        color: c,
      });
    },
  },
  {
    n: 26,
    name: 'Cannon',
    idea: 'two booster rings fire you far and fast onto short faces bending hard',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(50, 4)],
        ...TIGHT,
        side: 'right',
        color: c,
      });
      p.move(12, -5).booster(40, 8, true, [10, 10]);
      p.move(52, -4).curve({
        lead: 14,
        legs: [straight(10, 1), arc(-50, 60, 4), straight(20, 1)],
        ...SHORT,
        side: 'left',
        red: 0.8,
        color: c,
      });
      toRight(p).curve({ legs: [straight(30, 2)], ...TIGHT, side: 'right', color: c });
      p.move(12, -5).booster(40, 8, true, [10, 10]);
      p.move(52, -4).curve({
        lead: 14,
        legs: [straight(10, 1), arc(50, 60, 4), straight(20, 1)],
        ...SHORT,
        side: 'right',
        red: 0.8,
        color: c,
      });
    },
  },
  {
    n: 27,
    name: 'Chain Reaction',
    idea: 'four portals in a row that keep where you cross them, a short catch between each',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c, L, wing }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(50, 3)],
        ...TIGHT,
        side: 'right',
        color: c,
      });
      const look = (glyph: string) => ({ color: wing.glow, glyph, offset: true });
      portal(p, 14, 32, -1.5, L(100, -60, -10), 90, [10, 10], look('α'));
      p.move(14, -7).curve({ lead: 12, legs: [straight(30, 2)], ...SHORT, side: 'left', color: c });
      portal(p, 14, 32, -1.5, L(150, 60, -20), -90, [10, 10], look('β'));
      p.move(14, -7).curve({
        lead: 12,
        legs: [straight(30, 2)],
        ...SHORT,
        side: 'right',
        color: c,
      });
      portal(p, 14, 32, -1.5, L(230, 60, -30), -90, [10, 10], look('γ'));
      p.move(14, -7).curve({ lead: 12, legs: [straight(30, 2)], ...SHORT, side: 'left', color: c });
      portal(p, 14, 32, -1.5, L(280, -40, -40), 90, [10, 10], look('δ'));
      p.move(14, -7).curve({
        lead: 12,
        legs: [straight(40, 2)],
        ...TIGHT,
        side: 'right',
        color: c,
      });
    },
  },
  {
    n: 28,
    name: 'Twin Spines',
    idea: 'two tight A-frames back to back: cross a ridge, transfer, cross another',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c }) => {
      p.move(18, -7);
      spine(p, {
        near: 'right',
        far: 'left',
        first: straight(30, 2),
        rest: [straight(30, 2)],
        color: c,
        shape: TIGHT,
      });
      toRight(p);
      spine(p, {
        near: 'right',
        far: 'left',
        first: straight(20, 1),
        rest: [arc(-30, 80, 3), straight(30, 2)],
        color: c,
        shape: TIGHT,
      });
    },
  },
  {
    n: 29,
    name: 'The Gauntlet',
    idea: 'a needle window, a red-strip bend, red posts, a red cornice and a portal, in one run',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c, L, wing, deco }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(45, 3)],
        ...TIGHT,
        side: 'right',
        color: c,
      });
      p.window(10, [9, 7], [21, 17], -4, 4);
      p.move(8, -1.5, 6).curve({
        legs: [arc(-45, 60, 4), straight(20, 2)],
        ...TIGHT,
        side: 'left',
        red: 0.7,
        color: c,
      });
      posts(p, 14, -5, -9, 10);
      toRight(p).curve({
        legs: [arc(45, 60, 4), straight(30, 2)],
        ...TIGHT,
        side: 'right',
        red: 0.72,
        color: c,
      });
      cornice(p, deco, lastCurve(p), 5, 5 + (45 * Math.PI * 60) / 180, wing.wall);
      portal(p, 14, 32, -1.5, L(275, -20, -34), -90, [10, 10], {
        color: wing.glow,
        glyph: '✶',
        offset: true,
      });
      p.move(14, -7).curve({ lead: 12, legs: [straight(45, 3)], ...SHORT, side: 'left', color: c });
    },
  },
  {
    n: 30,
    name: 'The Last Door',
    idea: 'a tightening helix with a red strip, a needle window, one last long transfer home',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [
          straight(20, 2),
          arc(-180, 55, 7),
          arc(-180, 55, 7, { toRadius: 45, red: 0.72 }),
          straight(70, 2, { red: false }),
        ],
        ...TIGHT,
        side: 'left',
        color: c,
      });
      p.window(10, [9, 7], [21, 17], -4, -4);
      p.move(8, -1.5, -6).curve({
        legs: [straight(30, 2), straight(25, -3)],
        ...TIGHT,
        side: 'right',
        color: c,
      });
      p.move(30, -7, 12).curve({ legs: [straight(40, 2)], ...WIDE, side: 'left', color: c });
    },
  },
];

// ---------------------------------------------------------------------------------------------
// The building: three floors of ten rooms (5 × 2 cells each), every room heading south

/** Floors (the height every room of it starts at) and the cells of a floor. */
const FLOOR_Y = [460, 320, 180];
const COL_X = [-384, -192, 0, 192, 384];
/** a room's start moved [right (west), ahead (south)] in its cell: it keeps inside it */
const SHIFT: Record<number, [number, number]> = {
  2: [30, 0],
  20: [-40, 0],
  25: [0, 45],
  26: [80, 0],
  27: [15, 0],
};

/** Where room `n` (1..30) starts: its door's exit (room 1: the start platform's far edge). */
const roomAt = (n: number): P3 => {
  const i = n - 1;
  const floor = Math.floor(i / 10);
  const k = i % 10;
  const col = k < 5 ? k : 9 - k;
  const z = k < 5 ? -455 : 20;
  const [s, f] = SHIFT[n] ?? [0, 0];
  return [COL_X[col] - s, FLOOR_Y[floor], z + f];
};

const SKY = {
  top: 0x1b2440,
  horizon: 0x7b6d8e,
  ground: 0x2a2436,
  sun: { dir: [0.4, 0.5, -0.6] as P3, color: 0xffe2b0, sizeDeg: 3 },
  sunLight: 1.0,
  fog: { near: 220, far: 820 },
  ambient: 1.0,
};

const PALETTE = {
  ground: 0xd9d2c0,
  ground2: 0xbdb6a6,
  rock: 0x6c6878,
  rockDark: 0x3a3646,
  edge: 0xfff1c2,
  surf: 0x9fb4c8,
  surfEdge: 0xfff1c2,
  stage: 0x4a4658,
  stageGlow: 0xfff1c2,
  start: 0xfff1c2,
  finish: 0xffd28a,
  portal: 0xd6b3ff,
  pad: 0x5ef2e6,
  arrow: 0xfff1c2,
  cloud: 0x3e3a52,
  danger: 0x4a3060,
  leaf: 0x6fa86a,
  leafDark: 0x4a7a48,
  trunk: 0x4a3a30,
  crystal: 0xbfe9f2,
  water: 0x2a3050,
  accent: 0xffd28a,
  accent2: 0xfff1c2,
  bhop: 0x5ef2e6,
  hazard: 0xe8242c,
  anchor: 0x5ef2e6,
};

/** The course with the first `count` rooms (the game uses all thirty: thirtyDoorsCourse). */
export const buildThirtyDoors = (count = THIRTY_DOORS_ROOMS.length): CourseData => {
  const rooms = THIRTY_DOORS_ROOMS.slice(0, count);
  const deco: SceneryElement[] = [];
  const forks: CourseFork[] = [];
  const first = roomAt(1);
  // (the start platform and its run-up end where room 1 starts)
  const p = new Pen([first[0], first[1] + 8, first[2] - 20], 180);
  p.start([14, 16]);
  p.platform([10, 12], 'strafe');
  rooms.forEach((room, i) => {
    const wing = WINGS[Math.floor((room.n - 1) / 5)];
    const c = wing.surf[(room.n - 1) % 5];
    const label = `${room.n} · ${room.name.toUpperCase()}`;
    // (room 1's bay throws you onto its ramp about as fast as you run off the start)
    if (i === 0)
      p.move(3, -1).gate([24, 20], label, { back: 22, side: -14, up: 8, flightSec: 1.6 });
    else {
      // the door's speed ring: every room starts at its level's speed, whatever came before —
      // and the restart bay (behind the door, 2 m up) throws you back through it: a fall
      // replays the room's start exactly as you first came in
      const exit = p.here();
      const bay = p.relP(-16, 0, 2);
      p.booster(THIRTY_DOORS_SPEED[room.level], 1, true, [16, 8]);
      p.move(6, -0.5).gate([24, 20], label, { at: bay, to: exit, flightSec: 0.8 });
    }
    const o = p.pos;
    const L = (f: number, s = 0, u = 0): P3 => [r1(o.x - s), r1(o.y + u), r1(o.z + f)];
    room.build({ p, n: room.n, c, wing, L, deco, forks });
    // the door: a portal into the next room (the last room: the finish)
    const next = rooms[i + 1];
    if (!next) {
      p.move(8, -2).finishGate([24, 20], 30, 10);
      return;
    }
    const hd = (Math.round(p.heading / 90) * 90) % 360;
    const turn = ((((180 - hd) % 360) + 540) % 360) - 180;
    portal(p, 14, 30, -1.5, roomAt(next.n), turn, room.door, {
      color: WINGS[Math.floor((next.n - 1) / 5)].glow,
      glyph: String(next.n),
      vertical: 'zero',
    });
  });
  const base: Omit<CourseData, 'route' | 'scenery' | 'format'> = {
    name: 'Thirty Doors',
    kind: 'surf',
    mode: 'expert',
    profile: 'MOVEMENT_PROFILE v1',
    parSec: 275,
    palette: PALETTE,
    sky: SKY,
    roomMat: 'panel',
    killY: 60,
    autoFloors: { below: 25, pad: 15 },
    floors: [],
    forks,
  };
  // the rooms' shells, fitted round what is built (nothing clips, the walls keep off the line)
  const bare = p.course({ ...base, autoFloors: undefined, scenery: deco });
  deco.push(...shells(bare, rooms));
  // (a JSON round trip: plain data, and no negative zeros, which JSON would not keep)
  return JSON.parse(JSON.stringify(p.course({ ...base, scenery: deco }))) as CourseData;
};

type Block = Extract<SceneryElement, { t: 'block' }>;
type Bounds = [number, number, number, number, number, number];

/** A scenery block's world bounds (its heading turns it). */
const blockBounds = (b: Block): Bounds => {
  const [w, h, d] = b.size;
  const c = Math.abs(Math.cos((b.heading ?? 0) * DEG));
  const sn = Math.abs(Math.sin((b.heading ?? 0) * DEG));
  const ex = (c * w) / 2 + (sn * d) / 2;
  const ez = (sn * w) / 2 + (c * d) / 2;
  return [b.at[0] - ex, b.at[1], b.at[2] - ez, b.at[0] + ex, b.at[1] + h, b.at[2] + ez];
};

/** A level box's world bounds (course boxes turn about the vertical only; else a safe sphere). */
const boxBounds = (b: BoxDef): Bounds => {
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

const overlaps = (a: Bounds, b: Bounds): boolean =>
  a[0] < b[3] - 0.05 &&
  a[3] > b[0] + 0.05 &&
  a[1] < b[4] - 0.05 &&
  a[4] > b[1] + 0.05 &&
  a[2] < b[5] - 0.05 &&
  a[5] > b[2] + 0.05;

/** 7-segment digits: the segments lit for each (0 top, 1/2 upper left/right, 3 middle, …). */
const SEGMENTS: Record<string, number[]> = {
  0: [0, 1, 2, 4, 5, 6],
  1: [2, 5],
  2: [0, 2, 3, 4, 6],
  3: [0, 2, 3, 5, 6],
  4: [1, 2, 3, 5],
  5: [0, 1, 3, 5, 6],
  6: [0, 1, 3, 4, 5, 6],
  7: [0, 2, 5],
  8: [0, 1, 2, 3, 4, 5, 6],
  9: [0, 1, 2, 3, 5, 6],
};

/**
 * Every room's shell: four tall walls in its wing's colour round everything it holds (26 m
 * clear of its racing line and its restart bay), open to the sky; glowing pilasters up their
 * inner faces and a glowing band along their tops; the room's number in giant glowing digits
 * on its far (south) wall. One flat quad per face (lowDetail). A wall that would cut through
 * anything (a neighbour's wall, another room's ramps) steps in, else is left out. Pure
 * decoration: none of it collides.
 */
const shells = (bare: CourseData, rooms: DoorRoom[]): SceneryElement[] => {
  const def = expandCourse(bare).def;
  const race = def.race!;
  const occ: Bounds[] = def.boxes.map(boxBounds);
  const out: SceneryElement[] = [];
  const put = (parts: Block[]): boolean => {
    const bs = parts.map(blockBounds);
    if (bs.some((b) => occ.some((q) => overlaps(q, b)))) return false;
    // (the parts of one piece may touch each other, never anything else)
    out.push(...parts);
    occ.push(...bs);
    return true;
  };
  const block = (at: P3, size: P3, color: number, glow = false): Block => ({
    t: 'block',
    at: [r1(at[0]), r1(at[1]), r1(at[2])],
    size: [r1(size[0]), r1(size[1]), r1(size[2])],
    color,
    ...(glow ? { mat: 'glow' as const } : {}),
    lowDetail: true,
  });
  for (const room of rooms) {
    const n = room.n;
    const wing = WINGS[Math.floor((n - 1) / 5)];
    // what the room holds: its line (not the next room's door exit), its bay, the start
    const pts = race.line
      .filter((q, i) => q.cp === n || (n === 1 && q.cp === 0 && !race.line[i - 1]?.portal))
      .filter(
        (q, i, a) =>
          !(i === a.length - 1 && i > 0 && race.line.indexOf(a[i - 1]) >= 0 && a[i - 1].portal),
      )
      .map((q) => q.pos);
    pts.push(race.checkpoints[n - 1].respawn);
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    const zs = pts.map((q) => q.z);
    const y0 = Math.min(...ys) - 40;
    const y1 = Math.max(...ys) + 20;
    const H = y1 - y0;
    const T = 2;
    // the room's inside [x0, x1, z0, z1]: each wall as far out as it fits
    const inside = [
      Math.min(...xs) - 26,
      Math.max(...xs) + 26,
      Math.min(...zs) - 26,
      Math.max(...zs) + 26,
    ];
    const walls: { at: P3; inward: [number, number] }[] = [];
    for (const side of ['n', 's', 'w', 'e'] as const) {
      for (let pull = 0; pull <= 12; pull += 4) {
        const [x0, x1, z0, z1] = inside;
        const ns = side === 'n' || side === 's';
        const at: P3 = ns
          ? [(x0 + x1) / 2, y0, side === 'n' ? z0 + pull - T / 2 : z1 - pull + T / 2]
          : [side === 'w' ? x0 + pull - T / 2 : x1 - pull + T / 2, y0, (z0 + z1) / 2];
        const size: P3 = ns ? [x1 - x0 - 0.2, H, T] : [T, H, z1 - z0 + 2 * T];
        const inward: [number, number] =
          side === 'n' ? [0, 1] : side === 's' ? [0, -1] : side === 'w' ? [1, 0] : [-1, 0];
        if (!put([block(at, size, wing.wall)])) continue;
        walls.push({ at, inward });
        // (its glowing top band, just inside it)
        const len = ns ? x1 - x0 - 4 : z1 - z0 - 4;
        const ix = at[0] + inward[0] * 1.4;
        const iz = at[2] + inward[1] * 1.4;
        put([block([ix, y1 - 3, iz], ns ? [len, 0.8, 0.6] : [0.6, 0.8, len], wing.glow, true)]);
        // (pilasters up its inner face, one every ~60 m)
        const k = Math.max(1, Math.round(len / 60));
        for (let j = 1; j < k; j++) {
          const t = -len / 2 + (len * j) / k;
          put([
            block(
              [ix + (ns ? t : 0), y0 + 8, iz + (ns ? 0 : t)],
              ns ? [1.4, H - 14, 0.6] : [0.6, H - 14, 1.4],
              wing.glow,
              true,
            ),
          ]);
        }
        break;
      }
    }
    // the room's number on its south wall, facing the way in
    const south = walls.find((w) => w.inward[1] === -1);
    if (south) {
      const text = String(n);
      const h = Math.min(26, H * 0.4);
      const dw = h * 0.55;
      const t = h * 0.12;
      const gap = dw * 0.5;
      const total = text.length * dw + (text.length - 1) * gap;
      const z = south.at[2] - T / 2 - 1;
      const mid = y0 + H * 0.55;
      const parts: Block[] = [];
      [...text].forEach((ch, i) => {
        // (seen from the north, looking south: east, +x, is on the viewer's left)
        const cx = south.at[0] + total / 2 - dw / 2 - i * (dw + gap);
        for (const s of SEGMENTS[ch] ?? []) {
          const horiz = s === 0 || s === 3 || s === 6;
          const sx = s === 1 || s === 4 ? dw / 2 - t / 2 : s === 2 || s === 5 ? t / 2 - dw / 2 : 0;
          const sy =
            s === 0
              ? h / 2 - t / 2
              : s === 3
                ? 0
                : s === 6
                  ? t / 2 - h / 2
                  : s < 3
                    ? h / 4
                    : -h / 4;
          const size: P3 = horiz ? [dw, t, 0.6] : [t, h / 2 - t, 0.6];
          parts.push(block([cx + sx, mid + sy - size[1] / 2, z], size, wing.glow, true));
        }
      });
      put(parts);
    }
  }
  return out;
};

/** Thirty Doors: thirty sealed rooms, each its own challenge, easy to extreme. */
export const thirtyDoorsCourse = (): CourseData => buildThirtyDoors();
