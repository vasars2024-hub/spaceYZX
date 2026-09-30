// "Thirty Doors" — a stage surf map (docs/movement-map-design/maps/X01-thirty-doors.md): thirty
// sealed rooms, each its own skill test, from gentle to extreme. Built as course data
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
// Every room is a different skill test (the table: THIRTY_DOORS_ROOMS, and the doc). Gaps,
// flights and landings are sized from the measured movement (course/profile.ts, and where the
// profile has no number the real simulation: tools/race's bot flights, noted room by room as
// "sized:"): a flight's length is its speed × its air time, the air time is the fall
// (t = (vy + √(vy² + 2 g h)) / g, g = 20 m/s²), a landing block sits where the steady line
// comes down, and is only as big as the spread between a clean and a sloppy line allows.
// Hard rules kept: no bunny-hop pads, at most two fly-through-a-hole rooms, portals in three
// rooms at most (the doors between rooms apart).
import type { CourseData, CourseFork, CurveEl, CurveLeg, P2, P3, SceneryElement } from '../course/types';
import { Pen } from '../course/pen';
import { expandCourse } from '../course/expand';
import type { BoxDef } from '../types';

// ---------------------------------------------------------------------------------------------
// Shapes and helpers

/** Face shapes: wide and forgiving → short, steep and narrow (height m, angle °). */
const WIDE = { height: 18, angle: 55 };
const BROAD = { height: 16, angle: 56 };
const STD = { height: 14, angle: 58 };
const MID = { height: 12, angle: 60 };
const TIGHT = { height: 10, angle: 63 };
/** a tech-surf wedge: 6 m tall at 66°, a 2.7 m wide face */
const SHORT = { height: 9, angle: 65 };
const WEDGE = { height: 6, angle: 66 };
/** a needle: 5 m tall at 62°, a 2.7 m wide face — land on it or miss it */
const NEEDLE = { height: 5, angle: 62 };

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

/**
 * A lip: the ridge climbs `rise` over `len` at the ramp's end and throws you up (vy ≈ speed ×
 * rise / len). The line rides it half way down the face (where a rider holding the ramp
 * actually is there: the flight after it starts from the line).
 */
const lip = (len: number, rise: number, depth = 0.5): CurveLeg => ({ len, drop: -rise, depth });

const DEG = Math.PI / 180;
// (+ 0: never a negative zero, which JSON would not keep)
const r1 = (x: number): number => Math.round(x * 10) / 10 + 0;

/** gravity (MOVEMENT_PROFILE v1: g = 20 m/s²) */
const G = 20;
/** a standing jump's take-off speed: √(2 g Z), Z = 1.2 m (profile) */
const JUMP_VY = Math.sqrt(2 * G * 1.2);
/**
 * How far (flat metres) a flight at `v` m/s, starting with vertical speed `vy` (+ up), goes
 * before it has come down `drop` metres (negative: up): v × t, t = (vy + √(vy² + 2 g drop)) / g.
 * Every gap below is sized with it from the release the bots measure (tools/race/trace.ts).
 */
const reach = (v: number, vy: number, drop: number): number =>
  r1((v * (vy + Math.sqrt(Math.max(0, vy * vy + 2 * G * drop)))) / G);

/**
 * A portal `f` metres on from the release (the pen), its opening's middle 0.8 m over where your
 * body passes flying at `v` m/s with vertical speed `vy` (a ballistic flight): nobody has to
 * brake or dive to meet it. The pen goes on from its exit.
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
): void => {
  const t = f / v;
  p.move(0, r1(vy * t - 10 * t * t + 0.9 + 0.8));
  p.airPortal(f, exit, turn, size, look);
};

/**
 * A landing block at the pen (its top's middle): land on it and jump on the landing tick (a
 * jump pressed up to 0.15 s early fires on it, one up to 0.1 s late gets the speed back) —
 * miss the tick and the floor's friction (6/s) eats your speed. Not a bhop pad: one block, one
 * jump, a surf ramp after it.
 */
const block = (p: Pen, size: P2): Pen => p.pads([{ d: 0, size }], 'hop', size);

/**
 * A pillar's top at the pen (its middle): a plain square landing where you stop (friction) —
 * for a launch pad set on it (`p.launch(..., back 0)`). The pen stays at its middle.
 */
const pillar = (p: Pen, size: P2): Pen => {
  const at = p.pos;
  p.platform(size, undefined, { centred: true, style: 'plain' });
  p.pos = at;
  return p;
};

/**
 * A V-channel (a halfpipe) from the pen, heading its way, the pen on the west wall's face: a
 * west wall (a `left` face, looking east) and an east wall (a `right` face) whose feet meet
 * 0.3 m apart, dropping at 6 %, with a red ceiling hung inside the V wherever both walls
 * stand. The line rides deep (`depth` 0.55: 6.6 m under the ridges) and crosses the channel
 * twice — west, east, west; the ceiling hangs 3.4 m over the line (1.6 m over your head), so
 * ride higher than 0.45 of the face and it takes you. sized: a crossing is 2 r (1 − depth) + gap
 * = 6.5 m across in 26 m on (14°: a transfer that shallow keeps its speed).
 */
const halfpipe = (p: Pen, color: number): void => {
  const shape = MID;
  const H = shape.height;
  const r = H / Math.tan(shape.angle * DEG);
  const d = 0.55;
  const gap = 0.3;
  const g = 0.06;
  const lat = r1(2 * r * (1 - d) + gap);
  // (the pen at P0, the landing on the west wall; distances below from P0 on)
  const P0 = p.pos;
  const hd = p.heading;
  const ceiling = (from: number, to: number): void => {
    // the channel's middle, and how wide it is at the ceiling's underside (3.4 m over the line)
    const q = new Pen([P0.x, P0.y, P0.z], hd);
    const mid = r * (1 - d) + gap / 2;
    const dc = d - 3.4 / H;
    const w = r1(2 * r + gap - 2 * dc * r - 0.5);
    for (let s = from; s + 5 <= to + 0.01; s += 5.1)
      q.red(s + 2.5, -mid, r1(3.4 - g * s), [w, 0.6, 5], 0);
    p.route.push(...q.route);
  };
  // west wall B: 8 m before P0 to P0 + 60, ridden to P0 + 40
  p.curve({ lead: 8, legs: [straight(60, 60 * g)], ...shape, side: 'left', depth: d, early: 20, color });
  // across to the east wall C (P0 + 10 .. P0 + 112), ridden P0 + 58 .. P0 + 88
  p.move(26, -26 * g, -lat).curve({
    lead: 56,
    legs: [straight(46, 46 * g)],
    ...shape,
    side: 'right',
    depth: d,
    early: 24,
    color,
  });
  // back across to the west wall D (P0 + 62 .. P0 + 140), ridden from P0 + 106
  p.move(26, -26 * g, lat).curve({ lead: 52, legs: [straight(26, 26 * g)], ...shape, side: 'left', depth: d, color });
  ceiling(10, 60);
  ceiling(62, 112);
};

/**
 * A pillar `size` metres square centred on the pen, a booster pad on its middle that throws
 * you straight on (its way, `speed` m/s, `up` m/s up). The pen stays at its middle.
 */
const boostPillar = (p: Pen, size: number, speed = 25, up = 15): Pen => {
  const at = p.pos;
  p.move(-size / 2).booster(speed, up, false, [size - 2, size - 2]);
  p.pos = at;
  return p;
};

/**
 * From a booster pillar (the pen at its middle: 25 m/s on, 15 m/s up, its apex 5.6 m up 19 m
 * on), the next one `side` metres off to the side of where the throw comes down, `drop` metres
 * lower: steer onto it in the air. sized: it stands where the throw comes down to its top,
 * reach(25, 15, drop) on (38 m for a 0 m drop, 44 m for 5 m down).
 */
const padHop = (p: Pen, side: number, drop: number, size: number): Pen =>
  boostPillar(p.move(reach(25, 15, drop), -drop, side), size);

/** A glowing beacon pole (scenery: it never collides) standing on `at`, `h` metres tall. */
const beacon = (deco: SceneryElement[], at: P3, h: number, color: number): void => {
  deco.push({ t: 'block', at, size: [0.8, h, 0.8], color, mat: 'glow' });
};

/**
 * A red ceiling over the line from `a` to `b` (feet points), `clear` metres over the higher
 * one: a flat red slab 12 m wide along the way — ride higher and it takes you.
 */
const ceilingOver = (p: Pen, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, clear: number): void => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const hd = (((Math.atan2(dx, -dz) / DEG) % 360) + 360) % 360;
  p.route.push({
    t: 'red',
    at: [r1((a.x + b.x) / 2), r1(Math.max(a.y, b.y) + clear), r1((a.z + b.z) / 2)],
    size: [12, 0.6, r1(len)],
    heading: r1(hd),
  });
};

/**
 * A red deck with one hole in it, hung across a drop (a trapdoor): the pen at the release, the
 * flight going `f` ahead, `side` right and `drop` down onto the next ramp at `v` m/s leaving
 * with `vy`. The deck hangs `h` metres under the release (its top); the hole is centred where
 * the steady line is half way through it (feet 1.2 m under the top: reach(v, vy, h + 1.2) on
 * from the release, toward the landing), `hole` [across, along] metres. The deck reaches
 * `around` metres past the hole every way (never nearer than 4 m to the release). sized:
 * falling through a 0.6 m deck with a 1.8 m body at a descent slope k = |vy(t)| / v takes
 * (1.8 + 0.6) / k metres along, so the hole's `along` is that plus a window of ±w for the line
 * (w says how hard it is).
 */
const trapdoor = (
  p: Pen,
  o: { f: number; side: number; v: number; vy: number; h: number; hole: P2; around?: number },
): void => {
  const k = reach(o.v, o.vy, o.h + 1.2) / Math.hypot(o.f, o.side);
  const hf = r1(o.f * k);
  const hs = r1(o.side * k);
  const [W, D] = o.hole;
  const A = o.around ?? 10;
  const u = -o.h - 0.6;
  const f0 = Math.max(4, hf - D / 2 - A);
  const f1 = hf + D / 2 + A;
  const sw = W + 2 * A;
  // (before the hole, after it, and either side of it)
  const slab = (fa: number, fb: number, sa: number, sb: number): void => {
    if (fb - fa > 0.5 && sb - sa > 0.5)
      p.red(r1((fa + fb) / 2), r1((sa + sb) / 2), r1(u), [r1(sb - sa), 0.6, r1(fb - fa)]);
  };
  slab(f0, hf - D / 2, hs - sw / 2, hs + sw / 2);
  slab(hf + D / 2, f1, hs - sw / 2, hs + sw / 2);
  slab(hf - D / 2, hf + D / 2, hs - sw / 2, hs - W / 2);
  slab(hf - D / 2, hf + D / 2, hs + W / 2, hs + sw / 2);
};

/** A red floor slab `size` [across, along] its top `down` metres under the pen, centred on it. */
const redFloor = (p: Pen, size: P2, down: number): void => {
  p.red(0, 0, r1(-down - 0.6), [size[0], 0.6, size[1]]);
};

// ---------------------------------------------------------------------------------------------
// The rooms

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
    idea: 'one long wide ramp that banks into a broad turn: hold into it and feel it carry you',
    level: 'teach',
    door: [18, 18],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(60, 5), arc(-60, 90, 7), straight(45, 4)],
        ...WIDE,
        side: 'left',
        color: c,
      });
    },
  },
  {
    n: 2,
    name: 'Stepping Block',
    idea: 'leave the ramp onto a big block, jump the moment you land, catch the next ramp',
    level: 'teach',
    door: [18, 18],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(70, 6)], ...WIDE, side: 'right', color: c });
      // sized: the release is ~31 m/s falling 3 m/s; 6 m down → reach 20 m, the block's middle
      p.move(reach(31, -3, 6), -6, 4);
      block(p, [10, 10]);
      // sized: a jump off the block (6.9 m/s up) at 31 m/s, 8 m down → 40 m
      p.move(reach(31, JUMP_VY, 8) - 2, -8, 6).curve({ legs: [straight(80, 6)], ...WIDE, side: 'left', color: c });
    },
  },
  {
    n: 3,
    name: 'The Lip',
    idea: 'a ramp that climbs into a lip: ride it up and it throws you over a wall',
    level: 'teach',
    door: [18, 18],
    build: ({ p, c, L }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(60, 6), straight(16, -5)],
        ...WIDE,
        side: 'right',
        color: c,
      });
      p.wall(22, 0, [30, 10, 2], -14);
      p.move(45, -8).curve({ lead: 8, legs: [straight(80, 6)], ...WIDE, side: 'left', color: c });
      void L;
    },
  },
  {
    n: 4,
    name: 'Big Air',
    idea: 'a booster ring throws you high: steer in the air onto a ramp off to the side',
    level: 'teach',
    door: [18, 18],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(50, 4)], ...WIDE, side: 'right', color: c });
      p.move(12, -3).booster(26, 12, true, [12, 12]);
      p.move(50, -6, 18).curve({ lead: 10, legs: [straight(80, 6)], ...WIDE, side: 'left', color: c });
    },
  },
  {
    n: 5,
    name: 'Quarter Turn',
    idea: 'a lip throws you up heading south: turn a quarter circle in the air, board a ramp heading east',
    level: 'teach',
    door: [18, 18],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(50, 5), straight(14, -3)],
        ...BROAD,
        side: 'right',
        color: c,
      });
      p.move(22, -8, -22).turn(-90).curve({ lead: 12, legs: [straight(80, 6)], ...BROAD, side: 'left', color: c });
    },
  },
  // ---------------------------------------------------------------- medium (6–10)
  {
    n: 6,
    name: 'Crossways',
    idea: 'ramps set across your path, 25° one way then the other: flick onto each new line',
    level: 'medium',
    door: [16, 16],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(40, 3)], ...STD, side: 'right', color: c });
      p.move(14, -5, 9).turn(25).curve({ legs: [straight(40, 3)], ...STD, side: 'left', color: c });
      p.move(14, -5, -9).turn(-50).curve({ legs: [straight(40, 3)], ...STD, side: 'right', color: c });
      p.move(14, -5, 9).turn(50).curve({ legs: [straight(40, 3)], ...STD, side: 'left', color: c });
      p.move(14, -5, -9).turn(-25).curve({ legs: [straight(40, 3)], ...STD, side: 'right', color: c });
    },
  },
  {
    n: 7,
    name: 'Upsurf',
    idea: 'surf up a climbing ramp, keep your speed to its top and fly onto a raised block',
    level: 'medium',
    door: [16, 16],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(40, 4), straight(40, -12)],
        ...STD,
        side: 'right',
        color: c,
      });
      p.move(16, -1, 3);
      block(p, [7, 7]);
      p.move(reach(24, JUMP_VY, 10) - 2, -10, 6).curve({ legs: [straight(70, 6)], ...STD, side: 'left', color: c });
    },
  },
  {
    n: 8,
    name: 'Pinball',
    idea: 'five short steep faces left, right, left: one touch on each, straight across to the next',
    level: 'medium',
    door: [16, 16],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(40, 3)], ...STD, side: 'right', color: c });
      p.move(18, -6, 7);
      for (let k = 0; k < 5; k++) {
        const right = k % 2 === 1;
        p.curve({ lead: k ? 9 : 5, legs: [straight(16, 1)], ...SHORT, side: right ? 'right' : 'left', depth: 0.25, color: c });
        p.move(20, -7, right ? 5 : -5);
      }
      p.curve({ lead: 9, legs: [straight(50, 4)], ...STD, side: 'right', color: c });
    },
  },
  {
    n: 9,
    name: 'Waterfall',
    idea: 'three long drops: leave each ramp and fall twenty metres onto the next',
    level: 'medium',
    door: [16, 16],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(45, 3)], ...STD, side: 'right', color: c });
      p.move(reach(30, -2, 18), -18, 10).curve({ lead: 10, legs: [straight(45, 3)], ...BROAD, side: 'left', color: c });
      p.move(reach(30, -2, 18), -18, -10).curve({ lead: 10, legs: [straight(45, 3)], ...BROAD, side: 'right', color: c });
      p.move(reach(30, -2, 18), -18, 10).curve({ lead: 10, legs: [straight(45, 3)], ...BROAD, side: 'left', color: c });
    },
  },
  {
    n: 10,
    name: 'Over the Top',
    idea: 'a lip throws you over an A-frame\'s ridge: land on its far face, the one facing away',
    level: 'medium',
    door: [16, 16],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(45, 4), lip(12, 3)],
        ...STD,
        side: 'right',
        color: c,
      });
      // the A-frame's ridge stands 1 m under the release, 10 m to the right: clear it, come down
      // on its right face
      p.move(26, -6, 14).curve({ lead: 12, legs: [straight(60, 5)], ...STD, side: 'both', ride: 'right', color: c });
      p.move(16, -5, 9).curve({ legs: [straight(50, 4)], ...STD, side: 'left', color: c });
    },
  },
  // ---------------------------------------------------------------- hard (11–20)
  {
    n: 11,
    name: 'Pad Pillars',
    idea: 'land on a pillar: its pad throws you straight on, the next pillar stands off to the side — steer onto it',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(45, 3)], ...MID, side: 'right', color: c });
      p.move(reach(32, -2, 5), -5, 3);
      boostPillar(p, 6);
      padHop(p, 7, 2, 5);
      padHop(p, -7, 2, 5);
      pillar(p.move(reach(25, 15, 2), -2, 7), [5, 5]);
      p.launch(36, -10, 1.6, 0, 0);
      p.curve({ lead: 12, legs: [straight(60, 5)], ...MID, side: 'left', color: c });
    },
  },
  {
    n: 12,
    name: 'Halfpipe',
    idea: 'a V-channel under a red ceiling: ride low on one wall, cross to the other and back',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(40, 3)], ...MID, side: 'right', color: c });
      p.move(16, -5, 8);
      halfpipe(p, c);
    },
  },
  {
    n: 13,
    name: 'Round the Post',
    idea: 'a lip throws you up past a red post: curve half a circle round it in the air onto a ramp heading back',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(50, 4), lip(12, 3)],
        ...MID,
        side: 'right',
        color: c,
      });
      p.red(10, 16, -34, [3, 44, 3]);
      p.move(6, -20, 32).turn(180).curve({
        lead: 12,
        legs: [straight(20, 2), arc(-90, 45, 5), straight(30, 3)],
        ...MID,
        side: 'left',
        color: c,
      });
    },
  },
  {
    n: 14,
    name: 'Trapdoor',
    idea: 'fly over a red deck and drop through the one gap in it onto the ramp underneath',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(50, 4)], ...MID, side: 'right', color: c });
      // sized: the release (traced) is 34.4 m/s falling 3.3 m/s; the deck hangs 8 m down, where
      // the line has come 25.6 m (reach) falling 18 m/s: a descent slope of 0.53, so passing the
      // deck takes 4.5 m along — the hole is 9 m along (±2.2 m of window) and 7 m across
      trapdoor(p, { f: 38, side: 8, v: 34.4, vy: -3.3, h: 8, hole: [7, 9] });
      p.move(38, -18, 8).curve({ lead: 12, legs: [straight(60, 5)], ...MID, side: 'left', color: c });
    },
  },
  {
    n: 15,
    name: 'Needlework',
    idea: 'three needle ramps, 2.7 m wide, over a red floor: land on each and ride it',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(40, 3)], ...MID, side: 'right', color: c });
      p.move(20, -7, 5);
      for (let k = 0; k < 3; k++) {
        const right = k % 2 === 1;
        p.curve({ lead: 9, legs: [straight(24, 1.5)], ...NEEDLE, side: right ? 'right' : 'left', depth: 0.3, color: c });
        p.move(22, -7, right ? 5 : -5);
      }
      p.curve({ lead: 9, legs: [straight(50, 4)], ...MID, side: 'right', color: c });
    },
  },
  {
    n: 16,
    name: 'Staircase',
    idea: 'up-transfers: each lip throws you onto a ramp higher than you left — only with your speed kept',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(55, 6), lip(14, 4.5)], ...MID, side: 'right', color: c });
      p.move(33, 1, 6).curve({ lead: 10, legs: [straight(35, 4), lip(14, 4.5)], ...MID, side: 'left', color: c });
      p.move(33, 1, -6).curve({ lead: 10, legs: [straight(20, 2), arc(-70, 40, 5), straight(20, 2)], ...MID, side: 'right', color: c });
    },
  },
  {
    n: 17,
    name: 'Blind Crest',
    idea: 'a crest throws you over a wall; the ramp is hidden far below it — steer by the beacon',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c, wing, deco }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(45, 4), lip(12, 3)], ...MID, side: 'right', color: c });
      p.wall(16, 0, [36, 12, 2], -14);
      p.move(55, -24, 22).turn(40);
      beacon(deco, p.relP(0, -9, -6), 36, wing.glow);
      p.curve({ lead: 12, legs: [straight(60, 5)], ...MID, side: 'right', color: c });
    },
  },
  {
    n: 18,
    name: 'Drop-In',
    idea: 'stop on a small ledge (brake in the air), run off its end and drop onto a steep ramp far below',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(45, 3)], ...MID, side: 'right', color: c });
      p.move(reach(32, -2, 6), -6, 3);
      p.platform([6, 7], 'strafe', { style: 'plain', centred: true });
      p.move(10, -18, 3).curve({ lead: 8, legs: [straight(70, 16)], ...MID, side: 'right', color: c });
    },
  },
  {
    n: 19,
    name: 'Mirror',
    idea: 'a portal turns you right round: come out where you went in, so hit its middle or miss the needle behind it',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c, wing }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(50, 4)], ...MID, side: 'right', color: c });
      const exit = p.relP(-10, -40, -8);
      portal(p, 14, 33, -3, exit, 180, [10, 10], { color: wing.glow, glyph: '↺', offset: true });
      p.move(14, -5).curve({ lead: 10, legs: [straight(30, 3), arc(-90, 35, 4), straight(20, 2)], ...NEEDLE, side: 'right', color: c });
    },
  },
  {
    n: 20,
    name: 'Speed Trap',
    idea: 'pump the scoops to keep your speed: the gap after the lip only carries a rider who kept it',
    level: 'hard',
    door: [14, 14],
    build: ({ p, c }) => {
      p.move(12, -6).curve({
        lead: 10,
        legs: [straight(35, 3.5), straight(20, -2), straight(30, 5), lip(12, 3)],
        ...MID,
        side: 'right',
        color: c,
      });
      p.move(44, -8, 4).curve({ lead: 12, legs: [straight(60, 5)], ...MID, side: 'left', color: c });
    },
  },
  // ---------------------------------------------------------------- extreme (21–30)
  {
    n: 21,
    name: 'Flick Block',
    idea: 'land on a small block over red, jump, and flick a quarter turn in the air onto a ramp to the side',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(45, 4)], ...TIGHT, side: 'right', color: c });
      p.move(reach(34, -3, 6), -6, 3);
      block(p, [5, 5]);
      p.move(22, -6, 26).turn(90).curve({ lead: 12, legs: [straight(60, 5)], ...TIGHT, side: 'right', color: c });
    },
  },
  {
    n: 22,
    name: 'Sky Pillars',
    idea: 'tiny pillars high and low: each pad throws you straight on, the next pillar is off to the side',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(45, 3)], ...TIGHT, side: 'right', color: c });
      p.move(reach(34, -2, 5), -5, 3);
      boostPillar(p, 5);
      padHop(p, 9, -3, 5);
      padHop(p, -9, 5, 5);
      pillar(p.move(reach(25, 15, 2), -2, 8), [5, 5]);
      p.launch(36, -10, 1.6, 0, 0);
      p.curve({ lead: 12, legs: [straight(60, 5)], ...TIGHT, side: 'left', color: c });
    },
  },
  {
    n: 23,
    name: 'Corkscrew',
    idea: 'a steep lip throws you high: turn right round in the air onto a needle behind and below you',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(45, 5), lip(14, 4.5, 0.6)], ...TIGHT, side: 'right', color: c });
      p.move(0, -25, 38).turn(180).curve({ lead: 12, legs: [straight(30, 3)], ...NEEDLE, side: 'left', color: c });
      p.move(18, -6, -6).curve({ lead: 9, legs: [arc(-90, 28, 4), straight(20, 2)], ...TIGHT, side: 'right', color: c });
    },
  },
  {
    n: 24,
    name: 'Pinwheel',
    idea: 'kickers round a square: each lip throws you a quarter turn right onto the next — three turns, half a spiral down',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(40, 4), lip(12, 3)], ...MID, side: 'right', color: c });
      for (let k = 0; k < 2; k++)
        p.move(26, -8, 30).turn(90).curve({ lead: 10, legs: [straight(24, 2.5), lip(12, 3)], ...MID, side: 'right', color: c });
      p.move(26, -8, 30).turn(90).curve({ lead: 10, legs: [straight(50, 4)], ...MID, side: 'right', color: c });
    },
  },
  {
    n: 25,
    name: 'Pinball Tunnel',
    idea: 'six wedges left and right in a tunnel: a red ceiling above, red below — keep a low, tight line',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(40, 3)], ...TIGHT, side: 'right', color: c });
      p.move(18, -6, 6);
      for (let k = 0; k < 6; k++) {
        const right = k % 2 === 1;
        const a = p.pos;
        p.curve({ lead: k ? 9 : 5, legs: [straight(16, 1)], ...WEDGE, side: right ? 'right' : 'left', depth: 0.25, color: c });
        ceilingOver(p, a, p.pos, 4.2);
        p.move(20, -7, right ? 4 : -4);
      }
      p.curve({ lead: 9, legs: [straight(50, 4)], ...TIGHT, side: 'right', color: c });
    },
  },
  {
    n: 26,
    name: 'Freefall',
    idea: 'a 35 m drop onto a needle, then an up-transfer off its lip: only a rider who kept the speed makes it',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(45, 4)], ...TIGHT, side: 'right', color: c });
      p.move(reach(34, -3, 35), -35, 8).curve({ lead: 12, legs: [straight(30, 3), lip(12, 5)], ...NEEDLE, side: 'right', color: c });
      p.move(32, 1, 6).curve({ lead: 10, legs: [straight(50, 4)], ...TIGHT, side: 'right', color: c });
    },
  },
  {
    n: 27,
    name: 'Blind Flick',
    idea: 'over a crest wall onto a hidden ramp crossing your path at 60°: flick onto it by the beacon',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c, wing, deco }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(40, 4), lip(10, 3)], ...TIGHT, side: 'right', color: c });
      p.wall(14, 0, [36, 12, 2], -13);
      p.move(56, -20, 28).turn(60);
      beacon(deco, p.relP(0, -8, -6), 34, wing.glow);
      p.curve({ lead: 12, legs: [straight(30, 3), arc(-60, 28, 4), straight(20, 2)], ...TIGHT, side: 'right', color: c });
    },
  },
  {
    n: 28,
    name: 'Sky Steps',
    idea: 'two small blocks over red, each a quarter turn from the last: land, jump, turn, land, jump, turn',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(45, 4)], ...TIGHT, side: 'right', color: c });
      p.move(reach(34, -3, 6) - 3, -6, 3);
      block(p, [4, 4]);
      p.move(20, -3, -20).turn(-90);
      block(p, [4, 4]);
      p.move(22, -8, 22).turn(90).curve({ lead: 12, legs: [straight(60, 5)], ...TIGHT, side: 'left', color: c });
    },
  },
  {
    n: 29,
    name: 'Portal Relay',
    idea: 'a portal turns you mid-flight over a tiny pillar: brake onto its pad, and it fires you onto a needle',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c, wing }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(45, 4)], ...TIGHT, side: 'right', color: c });
      const exit = p.relP(20, 40, 6);
      portal(p, 14, 34, -3, exit, 90, [8, 8], { color: wing.glow, glyph: '↱', vertical: 'zero' });
      p.move(28, -8);
      pillar(p, [4, 4]);
      p.launch(30, -6, 1.3, 0, 0);
      p.curve({ lead: 12, legs: [straight(40, 4)], ...NEEDLE, side: 'right', color: c });
      p.move(18, -6, 6).curve({ lead: 9, legs: [straight(40, 4)], ...TIGHT, side: 'left', color: c });
    },
  },
  {
    n: 30,
    name: 'The Last Door',
    idea: 'climb onto a tiny block, flick a quarter turn through a gap in a red deck onto a ramp, a needle, home',
    level: 'extreme',
    door: [12, 12],
    build: ({ p, c }) => {
      p.move(12, -6).curve({ lead: 10, legs: [straight(35, 3), straight(30, -8)], ...TIGHT, side: 'right', color: c });
      p.move(16, -1, 3);
      block(p, [4, 4]);
      p.move(26, -22, -30).turn(-90).curve({ lead: 12, legs: [straight(40, 4)], ...TIGHT, side: 'left', color: c });
      p.move(20, -6, -5).curve({ lead: 9, legs: [straight(30, 3)], ...NEEDLE, side: 'right', depth: 0.3, color: c });
      p.move(20, -6, 5).curve({ lead: 9, legs: [straight(40, 4)], ...TIGHT, side: 'left', color: c });
    },
  },
];

// ---------------------------------------------------------------------------------------------
// The building: three floors of ten rooms (5 × 2 cells each), every room heading south

/** Floors (the height every room of it starts at) and the cells of a floor. */
const FLOOR_Y = [460, 320, 180];
const COL_X = [-384, -192, 0, 192, 384];
/** a room's start moved [right (west), ahead (south)] in its cell: it keeps inside it */
const SHIFT: Record<number, [number, number]> = {};

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
