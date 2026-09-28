// "Ember Spire" — race track 3 (very hard): the forge needle
// (docs/movement-map-design/race/ember-spire.md). An obsidian needle out of a lava lake at dusk,
// bronze-green surf, bone bhop pads, red where it kills. Built as course data on the race movement
// (manual bhop, surf) with the jetpack on: five walled rooms (the big portal in each exit door),
// recovery anchors between them, red ash ceilings where the sky kills, kill floors of ash cloud
// under every stretch.
//
//   1 Rim Road       seven pads curving round two basalt teeth, a tight 120° bend, a flick,
//                    four pads, a bend into the Rim Forge                                → C1
//   2 Chain Bridge   ◆ a launch onto the bridge plates, a burn under the red ash ceiling, the
//                    fuel cell, a burn past a red side wall, surf, a descending chain, two flicks
//                    between the chain posts                                               → C2
//   3 Buttress Wrap  ✦ three 120° wraps of pads round obsidian buttresses (red strips under
//                    them), each ending on a short flick                                   → C3
//   4 Crucible       ▲ a spine crossing onto the pour ledge: the fuel line burns up across the
//                    crucible to the pipe lip (about 1 s of fuel; a dry tank takes the slower
//                    outside curve round it), the forge bars, pads, two bends, the rim steps  → C4
//   5 The Pour       ◐ a helix ≈ 410° down round the needle (the second turn spirals in under
//                    the first; red-hot outer rail, red roofs over the way out), two flicks, the
//                    pour steps (faster: the ice ring skip)                                 → C5
//   6 Quench Run     ▼ a drop-hop chain under the low red ash ceiling, an S of bends, widening
//                    pads, a 17 m gap into the finish                                    → finish
import type {
  CourseData,
  CourseFork,
  CurveEl,
  CurveLeg,
  FloorData,
  JumpsEl,
  P3,
  SceneryElement,
} from '../course/types';
import { Pen } from '../course/pen';
import { expandCourse } from '../course/expand';
import { v3 } from '../../math/vec3';
import { curvePath, curveRidePoint } from '../course/curve';

const PALETTE = {
  ground: 0x3b3540,
  ground2: 0x2a2630,
  rock: 0x2a2630,
  rockDark: 0x1b181f,
  edge: 0xe8e2d6,
  surf: 0x3f8f86,
  surfEdge: 0xc8f0e8,
  stage: 0x3b3540,
  stageGlow: 0x9fe8ff,
  start: 0x7fe3c4,
  finish: 0xe6f4ff,
  portal: 0x5cc8ff,
  pad: 0x5cc8ff,
  arrow: 0xe8e2d6,
  cloud: 0x4a4048,
  danger: 0xff6a1a,
  bhop: 0xd9cbb0,
  hazard: 0xe8242c,
  anchor: 0xbdebff,
  leaf: 0x3f8f86,
  leafDark: 0x2c6e66,
  trunk: 0x2a2630,
  crystal: 0x7fd8ff,
  water: 0xff6a1a,
  accent: 0x3f8f86,
  accent2: 0xe8e2d6,
};

/** Verdigris-bronze surf faces, a shade apart per act. */
const VERDIGRIS = [0x3f8f86, 0x459a8f, 0x37837b, 0x4ba196, 0x3a897f, 0x42948a];
/** Obsidian, basalt, ash, iron; lava (only on what kills) and ice (light, launches, fuel). */
const OBSIDIAN = 0x2a2630;
const BASALT = 0x3b3540;
const ASH = 0x2e2830;
const IRON = 0x4a4550;
const LAVA = 0xff6a1a;
/** Tight faces (very hard): 9 m at 65°. */
const TIGHT = { height: 9, angle: 65 };

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
/** A bend from heading `from` to heading `to` (the short way), or a straight when hardly any. */
const bendTo = (from: number, to: number, radius: number, drop: number): CurveLeg => {
  const turn = r1(((((to - from) % 360) + 540) % 360) - 180);
  const len = (Math.abs(turn) * Math.PI * radius) / 180;
  return Math.abs(turn) < 8
    ? straight(Math.max(20, 8 * Math.abs(drop)), drop)
    : arc(turn, radius, r1(Math.min(drop, 0.3 * len)));
};
const DEG = Math.PI / 180;

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

/** Where a curve's racing line would be `s` metres (flat) along it, `depth` down its face. */
const rideAt = (e: CurveEl, s: number, depth = 0.35): P3 => {
  const path = curvePath(e);
  const r = path.at(s < 0 ? path.length + s : s);
  const face = e.side === 'both' ? (e.ride ?? 'right') : e.side;
  const q = curveRidePoint(e, r, face, depth);
  return [r1(q.x), r1(q.y), r1(q.z)];
};

/**
 * Bhop steps round a circle of radius `R` (turning right; `dir` -1: left), centre to centre
 * `chords`, each `rise` lower: the pen starts on the first pad heading along the circle.
 * `last`: the last chord's arc (turn that much more to head along the circle again).
 */
const wrapSteps = (chords: number[], R: number, dir = 1, rise = 0) => {
  const arcs = chords.map((c) => (2 * Math.asin(c / (2 * R))) / DEG);
  const steps = chords.map((d, k) => ({
    d,
    rise,
    turn: r1((dir * ((k ? arcs[k - 1] : 0) + arcs[k])) / 2),
  }));
  return { steps, last: dir * arcs[arcs.length - 1] };
};

const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const headingTo = (dx: number, dz: number): number =>
  (((Math.atan2(dx, -dz) / DEG) % 360) + 360) % 360;
/** Legs gliding the racing line's depth from `from` to `to` over `len` metres (n steps). */
const climb = (from: number, to: number, len: number, drop: number, n = 4): CurveLeg[] =>
  Array.from({ length: n }, (_, k) => ({
    len: r3(len / n),
    drop: r3(drop / n),
    depth: r3(from + ((to - from) * (k + 1)) / n),
  }));
const SPINE_GRADE = 0.06;
/**
 * An A-frame with a spine crossing (as surf-basalt-cathedral.ts): two curves joined exactly at
 * the crest — the `first` leg on the `near` face and a climb to the crest; then the `far` face,
 * settling down it, and the `rest`. Returns the far half.
 */
const spineCurve = (
  p: Pen,
  o: {
    near: 'left' | 'right';
    far: 'left' | 'right';
    first: CurveLeg;
    rest: CurveLeg[];
    color: number;
    lead?: number;
  },
): CurveEl => {
  const g = SPINE_GRADE;
  p.curve({
    lead: o.lead ?? 12,
    ride: o.near,
    legs: [{ ...o.first, ride: o.near }, ...climb(0.35, 0.04, 30, 30 * g, 10)],
    ...TIGHT,
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
    ...TIGHT,
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

/** A tight curve bending from the pen's heading to `to`, riding the inside face. */
const bendCurve = (p: Pen, to: number, radius: number, drop: number, color: number, lead = 12) => {
  const leg = bendTo(p.heading, to, radius, drop);
  const side: 'left' | 'right' = (leg.turn ?? 0) < 0 ? 'left' : 'right';
  return p.curve({
    lead,
    legs: [straight(10, 1.5), leg, straight(12, 2)],
    ...TIGHT,
    side,
    color,
  });
};

/**
 * Sideways offset for a flight off the last curve onto pads: toward its riding face (+ right),
 * where a rider actually leaves it (a little lower down the face than the racing line), so the
 * flight never cuts back over the ramp's end.
 */
const offFace = (p: Pen, by = 2.5): number => {
  for (let i = p.route.length - 1; i >= 0; i--) {
    const e = p.route[i];
    if (e.t !== 'curve' || e.alt) continue;
    let face = e.side === 'both' ? (e.ride ?? 'right') : e.side;
    if (e.side === 'both') for (const l of e.legs) if (l.ride) face = l.ride;
    return face === 'left' ? -by : by;
  }
  return 0;
};

/**
 * How far below the pen (the racing line's end on a ramp) to put a pad `f` metres on, for a
 * release at `v` m/s: riders leave ≈ 2.4 m under the line, falling ≈ 0.08 v; the pad sits a
 * little under where that arc comes down (never higher: an early arrival clips its edge).
 */
const padDrop = (v: number, f: number): number => {
  const t = (f + 2) / v;
  return -r1(2.4 + 0.08 * v * t + 10 * t * t + 0.8);
};

/**
 * A red block spanning from `a` to `b` (plan view), `w` wide and `h` thick, its bottom `dy`
 * above `a` (a ceiling) or its top `-dy` below (a floor, `dy` < 0).
 */
const redSpan = (p: Pen, a: P3, b: P3, dy: number, w: number, h = 1): void => {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dz);
  const y = dy >= 0 ? a[1] + dy : a[1] + dy - h;
  p.route.push({
    t: 'red',
    at: [r1((a[0] + b[0]) / 2), r1(y), r1((a[2] + b[2]) / 2)],
    size: [w, h, r1(len)],
    heading: r1(headingTo(dx, dz)),
  });
};

/**
 * Kill floors (ash cloud banks, 25 m deep) under the whole racing line, so a fall ends within a
 * couple of seconds: the course is expanded once without them, then every line point (and 14 m
 * to each side of it) gets a floor 18–38 m under it, `size` metres square — never over a lower
 * stretch of the line nor round anything you can stand on (as `autoFloors`, which leaves gaps
 * where stretches stack).
 */
const coverFloors = (draft: CourseData, killY: number): FloorData[] => {
  const { def } = expandCourse({ ...draft, floors: [], autoFloors: undefined });
  // (the racing line, with the flights between its points: where a rider really goes)
  const nodes = def.race!.line;
  const line = nodes.map((n) => n.pos);
  const path: { x: number; y: number; z: number }[] = [];
  nodes.forEach((n, i) => {
    path.push(n.pos);
    const b = nodes[i + 1];
    if (!b || n.portal) return;
    const a = n.pos;
    const k = Math.ceil(Math.hypot(b.pos.x - a.x, b.pos.z - a.z) / 2);
    for (let j = 1; j < k; j++) {
      const t = j / k;
      path.push({
        x: a.x + (b.pos.x - a.x) * t,
        y: Math.min(a.y, b.pos.y) - 2,
        z: a.z + (b.pos.z - a.z) * t,
      });
    }
  });
  // (what you can stand on: a ramp anywhere on its faces, a block on its top)
  const solids = def.boxes
    .filter((b) => !b.noCollide)
    .map((b) => {
      if (b.hull || b.prism !== undefined) {
        const pts = b.hull ?? [v3(b.c.x, b.c.y - b.h.y, b.c.z), v3(b.c.x, b.c.y + b.h.y, b.c.z)];
        const r = b.hull ? 0 : Math.hypot(b.h.x, b.h.z);
        return [
          Math.min(...pts.map((q) => q.x)) - r,
          Math.min(...pts.map((q) => q.y)),
          Math.min(...pts.map((q) => q.z)) - r,
          Math.max(...pts.map((q) => q.x)) + r,
          Math.max(...pts.map((q) => q.y)),
          Math.max(...pts.map((q) => q.z)) + r,
        ];
      }
      const r = Math.hypot(b.h.x, b.h.z);
      const top = b.c.y + b.h.y;
      return [b.c.x - r, top - 0.5, b.c.z - r, b.c.x + r, top, b.c.z + r];
    });
  const floors: FloorData[] = [];
  const probes = [
    [0, 0],
    [14, 0],
    [-14, 0],
    [0, 14],
    [0, -14],
  ];
  const covers = (x: number, y: number, z: number) =>
    floors.some(
      (f) =>
        x > f.min[0] && x < f.max[0] && z > f.min[1] && z < f.max[1] && f.y <= y && f.y >= y - 44,
    );
  const fits = (f: FloorData): boolean => {
    for (const q of path)
      if (q.x > f.min[0] && q.x < f.max[0] && q.z > f.min[1] && q.z < f.max[1])
        if (q.y < f.y + 4) return false;
    for (const a of solids)
      if (a[0] < f.max[0] && a[3] > f.min[0] && a[2] < f.max[1] && a[5] > f.min[1])
        if (a[4] > f.y - 28 && a[1] < f.y + 3) return false;
    return true;
  };
  for (const n of line) {
    const body = n.y + 0.9;
    for (const [dx, dz] of probes) {
      const px = n.x + dx;
      const pz = n.z + dz;
      if (covers(px, body, pz)) continue;
      // (a floor round the point missing one: as big as fits, as close under it as fits)
      search: for (const size of [48, 40, 32, 24, 16])
        for (const drop of [16, 18, 22, 26, 30, 34, 38]) {
          const y = Math.round(n.y - drop);
          if (y < killY + 5) break;
          const h = size / 2;
          const cx = Math.round(px);
          const cz = Math.round(pz);
          const f: FloorData = { y, min: [cx - h, cz - h], max: [cx + h, cz + h] };
          if (fits(f)) {
            floors.push(f);
            break search;
          }
        }
    }
  }
  return floors;
};

/** The needle's axis (the helix of Act 5 winds round it). */
const NEEDLE: [number, number] = [0, 0];

/** Portal pairs: each its own cool colour and mark. */
const GATE = {
  rim: { color: 0x3fe0c8, glyph: '◆' },
  chain: { color: 0xa07cff, glyph: '✦' },
  lift: { color: 0xe6f4ff, glyph: '▲' },
  rimC: { color: 0x9cff5c, glyph: '◐' },
  quench: { color: 0x5c9cff, glyph: '▼', offset: true },
};

const DOOR: [number, number] = [8, 7];
/** A walled checkpoint room with the big portal filling its exit doorway. */
const room = (
  p: Pen,
  name: string,
  exit: P3,
  turn: number,
  look: { color: number; glyph: string; offset?: boolean },
) => {
  // (square to the compass: a room's trigger is its bounding box)
  p.face((Math.round(p.heading / 90) * 90) % 360);
  p.stage([12, 14], undefined, name);
  p.move(0, DOOR[1] / 2 - 1);
  p.airPortal(1.6, exit, turn, DOOR, { ...look, vertical: 'zero' });
};

export const emberSpireCourse = (): CourseData => {
  const deco: SceneryElement[] = [];
  const forks: CourseFork[] = [];
  // ================================ Act 1 Rim Road ================================
  const p = new Pen([-320, 330, 420], 0);
  p.start([14, 16]);
  p.go('jump');
  p.bhopPads(
    [
      { d: 8, size: [5, 8] },
      { d: 10, turn: 10, rise: -1 },
      { d: 10.8, turn: 12, rise: -1 },
      { d: 11.6, turn: 12, rise: -1 },
    ],
    [2.8, 6],
  );
  const rimPads = lastPads(p).pads.map((q) => q.at);
  p.turn(12).move(6.2, -0.5).anchor('Rim Road', { side: -10, up: 6, flightSec: 1.2 }, [8, 8]);
  p.move(6.2, -0.5).bhopPads(
    [{ d: 0 }, { d: 13.1, turn: 12, rise: -1 }, { d: 13.8, turn: 12, rise: -1 }],
    [2.8, 6],
  );
  rimPads.push(...lastPads(p).pads.map((q) => q.at));
  p.move(18, -3.5).curve({
    lead: 12,
    legs: [straight(15, 1.5), arc(-120, 40, 9), straight(20, 2)],
    ...TIGHT,
    side: 'left',
    color: VERDIGRIS[0],
  });
  p.move(4, -2).anchor('Rim Tooth', {}, [12, 10]);
  p.move(10, -4, -8).curve({
    legs: [straight(20, 2), arc(60, 50, 5), straight(20, 2)],
    ...TIGHT,
    side: 'right',
    color: VERDIGRIS[0],
  });
  p.move(4, -2).anchor('Rim Gap', {}, [12, 10]);
  p.move(20, padDrop(30, 20), offFace(p)).bhopPads(
    [
      { d: 0, size: [4, 8] },
      { d: 16, turn: -15, rise: -1 },
      { d: 16.5, turn: -15, rise: -1 },
      { d: 17, turn: -15, rise: -1 },
    ],
    [2.8, 6],
  );
  p.move(17, -4).curve({
    lead: 12,
    legs: [straight(15, 1.5), bendTo(p.heading, 90, 45, 6), straight(15, 1.5)],
    ...TIGHT,
    side: 'right',
    color: VERDIGRIS[0],
  });
  p.move(10, -6.5);
  room(p, 'Chain Bridge', [-420, 290, -446], 0, GATE.rim);

  // ================================ Act 2 Chain Bridge ================================
  p.move(-4).platform([8, 12]);
  p.launch(22, -1, 1.2);
  p.bhopPads(
    [
      { d: 0, size: [5, 10] },
      { d: 12, turn: 10, rise: -1 },
    ],
    [3, 6],
  );
  // gap 1: 20 m of air under the red ash ceiling (7.5 m over the take-off): burn a little
  p.move(12, -1).platform([4, 8], 'jump', { centred: true });
  p.jet(30);
  const bridge: P3[] = [p.here()];
  p.red(10, 0, 7.5, [12, 1, 30]);
  const ceilings = [p.route.length - 1];
  p.move(20, -2);
  p.fuel();
  bridge.push(p.here());
  p.platform([5, 8], 'jump', { centred: true });
  p.move(5, 0).anchor('Fuel Plate', { back: 20, side: -12, up: 2 }, [8, 8]);
  p.move(7, -1).bhopPads(
    [
      { d: 0, size: [4, 7] },
      { d: 11, turn: 20, rise: -1 },
      { d: 11.5, turn: -25, rise: -1 },
    ],
    [2.8, 6],
  );
  // gap 2: 20 m past a red side wall, landing off to the right: steer while you burn
  p.move(12, -1).platform([4, 8], 'jump', { centred: true });
  p.jet(30);
  p.red(10, -4.5, -6, [1, 16, 16], 15);
  p.turn(15).move(20, -2);
  bridge.push(p.here());
  p.platform([5, 8], 'jump', { centred: true });
  p.move(3, 0).anchor('Chain Post', {}, [8, 8]);
  p.move(14, -6).curve({
    lead: 12,
    legs: [straight(15, 3), arc(-70, 45, 10), straight(20, 4)],
    ...TIGHT,
    side: 'left',
    color: VERDIGRIS[1],
  });
  p.move(14, padDrop(31, 14), offFace(p)).bhopPads(
    [
      { d: 0, size: [4, 8] },
      { d: 19, turn: 15, rise: -2 },
    ],
    [2.8, 6],
  );
  p.turn(15).move(9.7, -1).anchor('Chain Steps', { side: -10, up: 6, flightSec: 1.3 }, [8, 8]);
  p.move(9.7, -1).bhopPads([{ d: 0 }, { d: 20, turn: 15, rise: -2 }], [2.8, 6]);
  // the chain posts: a bend and a flick back between them
  p.move(17, -5).curve({
    lead: 12,
    legs: [straight(15, 2), arc(60, 45, 7), straight(20, 3)],
    ...TIGHT,
    side: 'right',
    color: VERDIGRIS[1],
  });
  p.move(4, -2).anchor('Chain Posts', {}, [12, 10]);
  p.move(10, -4, 8).curve({
    legs: [straight(20, 2), bendTo(p.heading, 90, 50, 5), straight(20, 2)],
    ...TIGHT,
    side: 'left',
    color: VERDIGRIS[1],
  });
  p.move(15, padDrop(29, 15), offFace(p)).bhopPads(
    [
      { d: 0, size: [4, 8] },
      { d: 18, turn: -12, rise: -1 },
      { d: 18.5, turn: 12, rise: -1 },
    ],
    [2.8, 6],
  );
  p.move(18, -3);
  room(p, 'Buttress Wrap', [230, 240, -40], 90, GATE.chain);

  // ================================ Act 3 Buttress Wrap ================================
  /** Four pads wrapping 120° round a buttress (`dir` 1: turning right), an anchor after two. */
  const wrap = (dir: number, name: string) => {
    const R = 20;
    const w = wrapSteps([13.7, 13.9, 14.1], R, dir, -1);
    const O = p.rel(0, dir * R);
    // (solid only round the pads: no cutting across the wrap; its foot in the lake is scenery)
    deco.push({
      t: 'block',
      at: [r1(O.x), 40, r1(O.z)],
      size: [26, r1(O.y - 10 - 40), 26],
      round: true,
      color: OBSIDIAN,
      lowDetail: true,
    });
    deco.push({
      t: 'block',
      at: [r1(O.x), r1(O.y - 10), r1(O.z)],
      size: [26, 70, 26],
      round: true,
      color: OBSIDIAN,
      solid: true,
      lowDetail: true,
    });
    p.bhopPads([{ d: 0, size: [3.2, 8] }, w.steps[0]], [2.8, 6]);
    const padsA = lastPads(p).pads;
    p.turn(w.steps[1].turn).move(w.steps[1].d / 2, -0.5);
    p.anchor(name, { side: -dir * 14, up: 6, back: 18, flightSec: 1.1 }, [6, 7]);
    p.move(w.steps[1].d / 2, -0.5).bhopPads([{ d: 0 }, ...w.steps.slice(2)], [2.8, 6]);
    const pads = [...padsA, ...lastPads(p).pads].map((q) => q.at);
    p.turn(w.last / 2);
    // the red floor strip under the arc (a slip off a pad ends at once, and reads)
    for (let k = 1; k < pads.length; k++) redSpan(p, pads[k - 1], pads[k], -7, 5, 0.8);
  };
  /** The short flick off a buttress: a steep bend of `turn` (ending on `to` if given). */
  const flick = (turn: number, run = 8) => {
    const side = turn < 0 ? 'left' : 'right';
    p.move(18, -5).curve({
      lead: 12,
      legs: [straight(8, 2), arc(turn, 28, 5), straight(run, 2)],
      ...TIGHT,
      side,
      color: VERDIGRIS[2],
    });
  };
  // off the forge ledge, a drop-in bend down to the first buttress
  p.move(-4).platform([8, 10], 'jump');
  p.move(10, -6).curve({
    lead: 8,
    legs: [straight(15, 3), arc(-60, 40, 8), straight(15, 3)],
    ...TIGHT,
    side: 'left',
    color: VERDIGRIS[2],
  });
  p.move(16, -10, offFace(p));
  wrap(1, 'First Buttress');
  flick(-60);
  p.move(16, -10, offFace(p));
  wrap(-1, 'Second Buttress');
  flick(60);
  p.move(16, -10, offFace(p));
  wrap(1, 'Third Buttress');
  flick(-50);
  p.move(16, -10).curve({
    legs: [straight(15, 3), bendTo(p.heading, 270, 45, 8), straight(20, 3)],
    ...TIGHT,
    side: 'left',
    color: VERDIGRIS[2],
  });
  p.move(10, -7);
  room(p, 'Crucible', [273, 437, -140], 180, GATE.lift);

  // ================================ Act 4 Crucible ================================
  // ▲ the lift out of C3 out over the crucible's shoulder: drop onto the spine (the speed you
  // bring through the room is kept)
  p.move(14, -5);
  spineCurve(p, {
    near: 'right',
    far: 'left',
    first: straight(8, 1),
    rest: [arc(-30, 60, 4)],
    color: VERDIGRIS[3],
  });
  // the pour ledge on the crucible's west rim: the fuel lift (burn up to the pipe lip)
  // (a slow bay: its launch drops you on the ledge standing)
  p.move(4, -2).anchor('Pour Ledge', { back: 30, side: -12, up: 6, flightSec: 1.8 }, [10, 9]);
  p.move(10, -5);
  const t4C = p.here();
  p.platform([5, 8], 'jump', { centred: true });
  p.jet(80);
  const t4 = p.here();
  p.move(22, 6.6);
  p.platform([6, 8], 'jump', { centred: true });
  const lip = p.here();
  // the pipe's hot face under the lip: come up short and it burns (no climbing over the lip)
  p.red(-8.7, 0, -3.5, [7, 3, 0.6]);
  /** The crucible's axis: halfway across the lift. */
  const LADLE: [number, number] = [r1((t4[0] + lip[0]) / 2), r1((t4[2] + lip[2]) / 2)];
  /** A point `r` from the needle's axis at compass bearing `b`, at height `y`. */
  const around = (r: number, b: number, y: number): P3 => [
    r1(LADLE[0] + Math.sin(b * DEG) * r),
    r1(y),
    r1(LADLE[1] - Math.cos(b * DEG) * r),
  ];
  // the forge bars: a window 5 × 4.5 between red bars, dropping onto the east ledge
  p.move(7, 0.2);
  p.window(0, [5, 4.5], [16, 14], -1.3);
  p.red(-1.2, 0, 4.55, [7, 0.6, 0.6]);
  p.red(-1.2, 0, -0.65, [7, 0.6, 0.6]);
  p.move(2.3, -1).anchor('Forge Bars', { side: -13, up: 2, back: 4, flightSec: 1.1 }, [6, 6]);
  p.move(5, -3.7).bhopPads([{ d: 0, size: [5, 8] }], [5, 8]);
  const winPad = p.here();
  // the molten crucible under the lift (red: fall in and you are back)
  const cruTop = r1(t4C[1] - 8);
  const cruBase = r1(cruTop - 8);
  p.route.push({ t: 'red', at: [LADLE[0], r1(cruTop - 3), LADLE[1]], size: [12, 1, 12] });
  // ---- the dry way (no fuel left): off the pour ledge's south side onto the outside curve
  // round the crucible (red low on its face), and a launch back up onto the east ledge past the forge bars
  {
    const bT = headingTo(t4C[0] - LADLE[0], t4C[2] - LADLE[1]);
    const b0 = bT - 12;
    const land = around(29, b0, t4C[1] - 4);
    // (the take-off: the ledge's edge toward the landing)
    const tx = land[0] - t4C[0];
    const tz = land[2] - t4C[2];
    const tl = Math.hypot(tx, tz);
    const edge: P3 = [r1(t4C[0] + (tx / tl) * 2.2), t4C[1], r1(t4C[2] + (tz / tl) * 2.2)];
    const dry = p.branch((b) => {
      b.pos = { x: land[0], y: land[1], z: land[2] };
      b.heading = r3((b0 - 90 + 360) % 360);
      b.curve({
        lead: 8,
        legs: [arc(-100, 30.5, 7)],
        ...TIGHT,
        side: 'left',
        red: 0.72,
        color: VERDIGRIS[3],
      });
      const c = lastCurve(b);
      b.move(10, -5);
      const pad = b.here();
      b.route.push({ t: 'launch', at: pad, to: winPad, flightSec: 2 });
      return { c, pad };
    });
    forks.push({
      name: 'Dry tank',
      safe: 'burn up across the crucible to the pipe lip (about a second of fuel)',
      risky:
        'with the tank too low for the lift: drop off the pour ledge onto the outside curve round the crucible (red low on its face) and take its launch back up past the forge bars onto the east ledge',
      salvage: true,
      line: [
        { at: t4C },
        { at: edge, jump: true },
        ...Array.from({ length: 14 }, (_, k) => ({ at: rideAt(dry.c, 12 + k * 6), surf: true })),
        { at: rideAt(dry.c, -2), surf: true },
        { at: dry.pad },
        { at: winPad },
      ],
    });
  }
  // round the crucible's north side on four pads, then down its shoulder
  p.bhopPads(
    [
      { d: 12, turn: -15, rise: -1 },
      { d: 12.6, turn: -15, rise: -1 },
      { d: 13.2, turn: -15, rise: -1 },
      { d: 13.8, turn: -15, rise: -1 },
      { d: 14.4, turn: 15, rise: -1 },
    ],
    [2.8, 6],
  );
  p.move(18, -4.5).curve({
    lead: 12,
    legs: [straight(10, 1.5), arc(-80, 45, 8), straight(15, 2)],
    ...TIGHT,
    side: 'left',
    color: VERDIGRIS[3],
  });
  p.move(4, -2).anchor('Crucible Shoulder', {}, [10, 9]);
  p.move(10, -4, -8).curve({
    legs: [straight(15, 2), arc(-50, 45, 5), straight(15, 2)],
    ...TIGHT,
    side: 'right',
    color: VERDIGRIS[3],
  });
  p.move(4, -2).anchor('Crucible Rim', {}, [10, 9]);
  p.move(10, -4, 8).curve({
    legs: [straight(15, 2), bendTo(p.heading, 270, 45, 6), straight(20, 2)],
    ...TIGHT,
    side: 'left',
    color: VERDIGRIS[3],
  });
  // the rim steps down to the forge: brake onto the first, then hop
  p.move(16, padDrop(29, 16), offFace(p)).bhopPads(
    [
      { d: 0, size: [4, 9] },
      { d: 16, turn: -15, rise: -1 },
      { d: 16.5, turn: 15, rise: -1 },
      { d: 17, turn: 15, rise: -1 },
      { d: 17.5, turn: -15, rise: -1 },
    ],
    [2.8, 6],
  );
  p.move(14, -2);
  room(p, 'The Pour', [NEEDLE[0] + 22, 371, NEEDLE[1] - 65.5], 0, GATE.rimC);

  // ================================ Act 5 The Pour ================================
  // ◐ onto the needle's shoulder: a launch onto the helix, ≈ 410° down round the needle — its
  // second turn spirals in under the first (16 m inside it, 17 m lower): a drop off the first
  // turn never lands on the second
  p.move(-4).platform([8, 12]);
  p.launch(14, -4, 0.9);
  p.curve({
    lead: 12,
    legs: [arc(-146, 64, 6)],
    ...TIGHT,
    side: 'right',
    color: VERDIGRIS[4],
  });
  const helixA = lastCurve(p);
  // the red-hot outer rail of the first turn, 4 m outside its foot: no leaving it outward for
  // the way out below (only the ledge's own drop-off)
  {
    const path = curvePath(helixA);
    const run = TIGHT.height / Math.tan((TIGHT.angle * Math.PI) / 180);
    const railAt = (d: number): P3 => {
      const r = path.at(d);
      const q = r.pos;
      // (right of the ridge's way: outward)
      return [
        r1(q.x - r.dir.z * (run + 4)),
        r1(q.y - TIGHT.height - 2),
        r1(q.z + r.dir.x * (run + 4)),
      ];
    };
    for (let d = 14; d < path.length - 4; d += 10)
      redSpan(p, railAt(d), railAt(Math.min(path.length - 4, d + 10)), 0, 0.6, TIGHT.height + 6);
  }
  // (the anchor ring where the first half ends; its bay stands off the helix's outside and
  // throws you back onto the second half 30 m on)
  {
    // (its bay stands outside the helix, 25 m back along it: the throw lands on the second
    // half at the helix's own speed)
    const bay = p.relP(-20, 14, 4);
    p.move(5, -1.2).anchor('Pour', { at: bay, flightSec: 1.1 }, [8, 8]);
  }
  p.move(7, -2.3).curve({
    lead: 5,
    legs: [arc(-204, 62, 9, { toRadius: 46, red: 0.7 }), arc(-45, 46, 3.5, { red: false })],
    ...TIGHT,
    side: 'right',
    color: VERDIGRIS[4],
  });
  // the ash overhang: a red roof over the second turn's last stretch and the flicks out,
  // where they pass under the first turn and the portal's ledge (no dropping in from above)
  const roof = (c: CurveEl, from: number, to = 0) => {
    const len = curvePath(c).length;
    for (let d = from < 0 ? len + from : from; d < len - 2 - to; d += 12)
      redSpan(p, rideAt(c, d), rideAt(c, Math.min(len - 1 - to, d + 12)), 8, 14);
  };
  roof(lastCurve(p), -80);
  p.move(15, -3.5, 12).curve({
    lead: 10,
    legs: [straight(10, 1.5), arc(45, 30, 3), straight(8, 1)],
    ...TIGHT,
    side: 'left',
    color: VERDIGRIS[4],
  });
  const flick1 = lastCurve(p);
  roof(flick1, 0);
  p.move(5, -1.5, -3).anchor('Flick Gap', { side: -6, up: 8, back: 26, flightSec: 1.2 }, [8, 8]);
  p.move(7, -3.5, -5).curve({
    legs: [straight(10, 1.5), arc(-30, 30, 3), straight(8, 1)],
    ...TIGHT,
    side: 'right',
    color: VERDIGRIS[4],
  });
  const flick2 = lastCurve(p);
  roof(flick2, 0);
  redSpan(p, rideAt(flick1, -1), rideAt(flick2, 0), 8, 14);
  // the pour steps: seven pads curving left, away from the needle
  p.move(22, padDrop(29, 22), offFace(p)).bhopPads(
    [
      { d: 0, size: [4, 8] },
      { d: 17, turn: -6, rise: -0.5 },
      { d: 17.3, turn: -13, rise: -0.5 },
      { d: 17.6, turn: -13, rise: -0.5 },
    ],
    [2.8, 6],
  );
  const stepsA = lastPads(p).pads.map((q) => q.at);
  p.turn(-13)
    .move(8.95, -0.25)
    .anchor('Pour Steps', { side: 14, up: 5, back: 24, flightSec: 1.1 }, [6, 6]);
  p.move(8.95, -0.25).bhopPads(
    [{ d: 0 }, { d: 18.2, turn: -13, rise: -0.5 }, { d: 18.5, turn: -13, rise: -0.5 }],
    [2.8, 6],
  );
  const pourSteps = [...stepsA, ...lastPads(p).pads.map((q) => q.at)];
  // ---- the Pour skip (faster line): from the second step a hard hop left into the ice
  // ring: it throws you across the curve straight onto the last step
  {
    const a = pourSteps[1];
    const z = pourSteps[6];
    const dir = headingTo(z[0] - a[0], z[2] - a[2]);
    const ring: P3 = [r1(a[0] + Math.sin(dir * DEG) * 8), a[1], r1(a[2] - Math.cos(dir * DEG) * 8)];
    const D = Math.hypot(z[0] - ring[0], z[2] - ring[2]);
    const T = 2;
    p.branch((b) =>
      b.route.push({
        t: 'booster',
        at: ring,
        heading: r1(dir),
        speed: r1(D / T),
        up: r1((z[1] - (ring[1] + 0.6) + 10 * T * T) / T),
        size: [3.5, 3.5],
        air: true,
        go: 'strafe',
      }),
    );
    forks.push({
      name: 'Pour skip',
      safe: 'hop all seven pour steps round the curve',
      risky:
        'from the second step hop hard left into the ice ring: it throws you across the curve onto the last step',
      line: [
        { at: rideAt(flick2, -14), surf: true },
        { at: rideAt(flick2, -3), surf: true },
        ...pourSteps.slice(0, 2).map((at) => ({ at, hop: true })),
        { at: ring, air: true },
        { at: z, hop: true },
      ],
    });
  }
  p.move(17, -4);
  bendCurve(p, 180, 40, 7, VERDIGRIS[4]);
  p.move(10, -7);
  room(p, 'Quench Run', [420, 160, 400], 90, GATE.quench);

  // ================================ Act 6 Quench Run ================================
  // ▼ down to the lake causeway: a drop-hop chain under the low red ash ceiling
  p.move(-4, -3).platform([10, 16], 'hop');
  const chain = [11, 12, 13, 13.8, 14.6, 15.4, 16.2, 17];
  const ash0 = p.relP(-8);
  p.bhopPads(
    chain.slice(0, 4).map((d, k) => ({ d, rise: -2, turn: k % 2 ? 12 : -12 })),
    [3, 6],
  );
  const ashA = lastPads(p).pads;
  p.move(7.3, -1).anchor('Ash Steps', { side: 12, up: 4, back: 18, flightSec: 1.2 }, [6, 6]);
  p.move(7.3, -1).bhopPads(
    [{ d: 0 }, ...chain.slice(5).map((d, k) => ({ d, rise: -2, turn: k % 2 ? 12 : -12 }))],
    [3, 6],
  );
  // the low red ash ceiling: 5 m over each step's take-off, from pad to pad (the sky kills;
  // no burning over the steps)
  {
    const steps = [ash0, ...ashA.map((q) => q.at), ...lastPads(p).pads.map((q) => q.at)];
    for (let k = 1; k < steps.length; k++) {
      redSpan(p, steps[k - 1], steps[k], 5, 7);
      ceilings.push(p.route.length - 1);
    }
  }
  p.move(17, -4).curve({
    lead: 12,
    legs: [straight(10, 1.5), arc(60, 45, 6), straight(12, 1.5)],
    ...TIGHT,
    side: 'right',
    color: VERDIGRIS[5],
  });
  p.move(4, -2).anchor('Quench Causeway', {}, [10, 9]);
  p.move(10, -4, 8).curve({
    legs: [straight(15, 2), arc(-50, 45, 5), straight(15, 2)],
    ...TIGHT,
    side: 'left',
    color: VERDIGRIS[5],
  });
  p.move(15, -4.5, -6).curve({
    lead: 10,
    legs: [straight(15, 2), bendTo(p.heading, 270, 45, 2), straight(15, 2)],
    ...TIGHT,
    side: 'right',
    color: VERDIGRIS[5],
  });
  p.move(4, -2).anchor('Quench Pool', {}, [10, 9]);
  p.move(12, padDrop(18, 12), offFace(p)).bhopPads(
    [
      { d: 0, size: [4, 8] },
      { d: 14.5, turn: 10, rise: -0.5 },
      { d: 14.8, turn: -10, rise: -0.5 },
      { d: 15.1, turn: -10, rise: -0.5 },
      { d: 15.4, turn: 10, rise: -0.5 },
    ],
    [3.2, 9],
  );
  // the last gap: 17 m of air into the finish room at the quench pool
  p.move(17, -4).finish([14, 16]);

  // ================================ scenery ================================
  // the lava lake (the floor that kills) filling the caldera
  deco.push({ t: 'water', at: [0, 40, 0], size: [980, 980], color: LAVA });
  // the needle: obsidian drums narrowing up to the crucible (solid: it stands in the way of any
  // shortcut across the helix), lava glowing in its seams
  const drums: [number, number, number][] = [
    [40, 120, 110],
    [120, 200, 92],
    [200, 280, 62],
    [280, 360, 34],
    [360, 412, 36],
  ];
  for (const [y0, y1, w] of drums) {
    deco.push({
      t: 'block',
      at: [NEEDLE[0], y0, NEEDLE[1]],
      size: [w, r1(y1 - y0), w],
      round: true,
      color: OBSIDIAN,
      lowDetail: true,
    });
  }
  // the crucible (Act 4): a ring of eight obsidian blocks round the molten mouth (red: it
  // kills) on its own basalt pillar out of the lake
  for (let k = 0; k < 8; k++) {
    const b = k * 45 + 22.5;
    deco.push({
      t: 'block',
      at: around(12.5, b, cruBase),
      size: [11, 8, 7],
      heading: r1(b),
      color: OBSIDIAN,
      lowDetail: true,
    });
  }
  deco.push({
    t: 'water',
    at: [LADLE[0], r1(cruTop - 1.6), LADLE[1]],
    size: [13, 13],
    color: LAVA,
  });
  // the ash band over every red ceiling (the sky that kills reads from afar)
  for (const i of ceilings) {
    const e = p.route[i];
    if (e.t !== 'red') continue;
    deco.push({
      t: 'block',
      at: [e.at[0], r1(e.at[1] + e.size[1] + 2), e.at[2]],
      size: [e.size[0] + 6, 3, e.size[2] + 3],
      heading: e.heading,
      color: ASH,
      lowDetail: true,
    });
  }
  // Act 1: two basalt teeth inside the rim road's curve
  for (const k of [2, 5]) {
    const a = rimPads[k];
    const b = rimPads[k + 1] ?? rimPads[k];
    const h = headingTo(b[0] - a[0], b[2] - a[2]);
    const x = a[0] + Math.cos(h * DEG) * 16;
    const z = a[2] + Math.sin(h * DEG) * 16;
    deco.push({
      t: 'block',
      at: [r1(x), 200, r1(z)],
      size: [10, r1(a[1] - 10 - 200), 10],
      round: true,
      color: BASALT,
      lowDetail: true,
    });
    deco.push({
      t: 'block',
      at: [r1(x), r1(a[1] - 10), r1(z)],
      size: [10, 16, 10],
      round: true,
      color: BASALT,
      solid: true,
      lowDetail: true,
    });
  }
  // the needle's crown: a ring of obsidian round a glowing crucible pool (seen from every act)
  for (let k = 0; k < 8; k++) {
    const b = k * 45 + 22.5;
    deco.push({
      t: 'block',
      at: [r1(NEEDLE[0] + Math.sin(b * DEG) * 15), 412, r1(NEEDLE[1] - Math.cos(b * DEG) * 15)],
      size: [13, 6, 6],
      heading: r1(b),
      color: OBSIDIAN,
      lowDetail: true,
    });
  }
  deco.push({ t: 'water', at: [NEEDLE[0], 416.5, NEEDLE[1]], size: [16, 16], color: LAVA });
  // the crucible's own basalt pillar out of the lake (Act 4 is round its top)
  deco.push({
    t: 'block',
    at: [LADLE[0], 40, LADLE[1]],
    size: [34, r1(cruBase - 40), 34],
    round: true,
    color: BASALT,
    lowDetail: true,
  });
  // the caldera's rim far out round the lake, lava falling off it in a few places
  const routeAt = p.route.flatMap((e) =>
    e.t === 'jumps' ? e.pads.map((q) => q.at) : 'at' in e ? [e.at as P3] : [],
  );
  for (let k = 0; k < 28; k++) {
    const b = k * (360 / 28) + 6;
    const h = 150 + ((k * 37) % 5) * 28;
    const R = 545;
    // (never close over the way: where it runs near the edge, the rim stands back)
    const x = Math.sin(b * DEG) * R;
    const z = -Math.cos(b * DEG) * R;
    if (routeAt.some((q) => Math.hypot(q[0] - x, q[2] - z) < 110)) continue;
    deco.push({
      t: 'block',
      at: [r1(Math.sin(b * DEG) * R), 40, r1(-Math.cos(b * DEG) * R)],
      size: [120, h, 40],
      heading: r1(b),
      color: BASALT,
      lowDetail: true,
    });
    if (k % 4 === 1)
      deco.push({
        t: 'block',
        at: [r1(Math.sin(b * DEG) * (R - 21)), 40, r1(-Math.cos(b * DEG) * (R - 21))],
        size: [10, h - 4, 0.8],
        heading: r1(b),
        color: LAVA,
        mat: 'glow',
        lowDetail: true,
      });
  }
  // Act 2: the chain bridge's plates hang from iron chains
  for (const q of bridge)
    for (const s of [-1, 1])
      deco.push({
        t: 'block',
        at: [r1(q[0] + s * 2.2), r1(q[1] + 0.6), r1(q[2])],
        size: [0.3, 5.6, 0.3],
        color: IRON,
        lowDetail: true,
      });

  const course = p.course({
    name: 'Ember Spire',
    kind: 'race',
    parSec: 210,
    palette: PALETTE,
    sky: {
      top: 0x231626,
      horizon: 0xff7a45,
      ground: 0x2a1a1a,
      sun: { dir: [0.9, 0.06, -0.25], color: 0xff5a3a, sizeDeg: 6 },
      sunLight: 0xffb89a,
      fog: { near: 140, far: 650 },
      ambient: 0.9,
    },
    roomMat: 'rock',
    killY: 40,
    floors: [],
    scenery: [
      ...deco,
      // far off: basalt spires standing in the lake, ash drifting low over it
      {
        t: 'scatter',
        kind: 'spire',
        count: 12,
        seed: 31,
        min: [-360, 40, -360],
        max: [360, 60, 360],
        size: [70, 150],
        clear: 70,
      },
      {
        t: 'scatter',
        kind: 'cloud',
        count: 14,
        seed: 32,
        min: [-360, 70, -360],
        max: [360, 110, 360],
        size: [40, 80],
        clear: 50,
      },
    ],
    forks,
  });
  course.floors = coverFloors(course, course.killY);
  return course;
};
