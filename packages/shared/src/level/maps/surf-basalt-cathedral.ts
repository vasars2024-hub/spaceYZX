// "Basalt Cathedral" — surf map I02 (Intermediate; docs/movement-map-design/maps/I02-basalt-cathedral.md).
// A cathedral carved into volcanic stone round a suspended bronze bell: polished basalt surf
// bands on ash-stone buttresses and galleries, pale light falling through broken vaults.
// Core skill: height management through a helix, over A-frame spines and through windows.
// Built as course data (level/course) on MOVEMENT_PROFILE v1. The spec's transept ran 1.3 km
// north, outside the network range: the route is refolded clockwise round the nave (the bell
// at the helix's axis), one aisle per act, lower each time; the portal brings it back in.
//
//   1 Outer buttress   a long banked left arc south of the nave, the A-frame 1B round the
//                      buttress tower (spine crossing right → left), the clerestory W1  → C1
//   2 Bell descent     a 360° helix round the bell's rod (the second half narrows: red strip
//                      low, red cornice overhead), the great arch W2 (R2a in it), a gentle
//                      S north, a left bend west along the north aisle (G2 under 2B)   → C2
//   3 Transept spines  a bend south down the west aisle, A-frame 3A (left → right), scoop 3B,
//                      tracery W3a (R3a behind it), 3C (right → left), scoop 3D, tracery
//                      W3b, the banked bend 3E east (G3 inside it)                     → C3
//   4 Choir crossing   east along the south aisle: 4A, eight short faces between column
//                      pairs over a red floor, three bhop pads, 4E bending north       → C4
//   5 Rose window      north up the east aisle (the rose stair), the loop 5B / 5C under
//                      itself, the kicker 5D under a red ceiling, the rose W5 and the
//                      turning portal P5 (−90°, level exit); the rose chord leaves 5B at
//                      its quarter turn and flies straight through the rose            → C5
//   6 Bell return      a descending gallery south, the sweep round the bell at crown height
//                      over the red bell frame, W6, 6B, the final curved gallery   → finish
import type {
  CourseData,
  CourseFork,
  CurveEl,
  CurveLeg,
  FloorData,
  P3,
  SceneryElement,
} from '../course/types';
import { Pen } from '../course/pen';
import { curvePath, curveRidePoint } from '../course/curve';

const PALETTE = {
  ground: 0x8e9296,
  ground2: 0x74787d,
  rock: 0x5d6166,
  rockDark: 0x292d33,
  edge: 0xa48b60,
  surf: 0x4a5058,
  surfEdge: 0xd2b27a,
  stage: 0x8e9296,
  stageGlow: 0xe5e2d5,
  start: 0xe5e2d5,
  finish: 0xa48b60,
  portal: 0xd8c08e,
  pad: 0xa48b60,
  arrow: 0xe5e2d5,
  cloud: 0x6e706e,
  danger: 0x8a5234,
  leaf: 0x5d6166,
  leafDark: 0x3a3e44,
  trunk: 0x292d33,
  crystal: 0xe5e2d5,
  water: 0x1e2226,
  accent: 0xa48b60,
  accent2: 0xe5e2d5,
  bhop: 0xa48b60,
  hazard: 0xe8242c,
  anchor: 0xc9a66b,
};

/** Polished basalt bands, a shade apart per act. */
const BASALT = [0x6f7884, 0x737c88, 0x6b7480, 0x76808b, 0x6e7783, 0x727b86];

const MID = { height: 12, angle: 60 };
const TIGHT = { height: 11, angle: 63 };
const SHORT = { height: 9, angle: 65 };
const STD = { height: 14, angle: 58 };
const WIDE = { height: 18, angle: 55 };
/** The A-frames' faces (spine crossings) and their grade through a crossing. */
const SPINE = { height: 12, angle: 60 };
const SPINE_GRADE = 0.05;
/**
 * The portal lifts you to this height for Act 6: the bell sweep runs ≈ 60 m under the helix, so
 * its kill mist is close under the helix too (a fall off the helix resets in ≈ 3 s).
 */
const P5_Y = 330;
/** Act 6's sweep round the bell: its ridge radius (outside the helix's kill mist, §floors). */
const SWEEP_R = 130;

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

/** A leg run climbing the face gradually from depth `from` to `to` over `len` metres (spines). */
const climb = (from: number, to: number, len: number, drop: number, n = 4): CurveLeg[] =>
  Array.from({ length: n }, (_, k) => ({
    len: r3(len / n),
    drop: r3(drop / n),
    depth: Math.round((from + ((to - from) * (k + 1)) / n) * 1000) / 1000,
  }));

const r1 = (x: number): number => Math.round(x * 10) / 10;

/** Where a curve's racing line would be `s` metres (flat) along it, `depth` down its face. */
const rideAt = (e: CurveEl, s: number, depth: number, face?: 'left' | 'right'): P3 => {
  const path = curvePath(e);
  const r = path.at(s < 0 ? path.length + s : s);
  const f = face ?? (e.side === 'both' ? (e.ride ?? 'right') : e.side);
  const q = curveRidePoint(e, r, f, depth);
  return [r1(q.x), r1(q.y), r1(q.z)];
};

const DEG = Math.PI / 180;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;
/** Compass heading → flat unit direction [x, z]. */
const dirOf = (h: number): [number, number] => [Math.sin(h * DEG), -Math.cos(h * DEG)];
const headingTo = (dx: number, dz: number): number =>
  (((Math.atan2(dx, -dz) / DEG) % 360) + 360) % 360;

/** Ash stone (rough structure), basalt (the dark stone), old bronze, pale light. */
const ASH = 0x8e9296;
const BASALT_STONE = 0x3d4249;
/** The nave's arcades: ash stone in shadow (darker than the polished bands, so they lead). */
const ARCADE = 0x5f6368;
const BRONZE = 0xa48b60;
const PALE = 0xe5e2d5;
/** Salvage galleries: a paler, unpolished stone (a way back, not a line). */
const SALVAGE = 0x9a9ea3;

/**
 * A salvage gallery's way back: a launch pad just past (and 7 m under) the gallery's end
 * throws you up onto `to` at `atS` metres along it, in `sec`; and the fork the tests ride
 * (from where a weak transfer leaves the line, along the gallery, the launch, back on).
 */
const salvage = (
  p: Pen,
  forks: CourseFork[],
  gallery: CurveEl,
  to: CurveEl,
  atS: number,
  sec: number,
  name: string,
): void => {
  const end = rideAt(gallery, -1, 0.35);
  const before = rideAt(gallery, -11, 0.35);
  const pad: P3 = [
    r1(end[0] + (end[0] - before[0]) * 1.2),
    r1(end[1] - 7),
    r1(end[2] + (end[2] - before[2]) * 1.2),
  ];
  const back = rideAt(to, atS, 0.35);
  p.branch((b) => b.route.push({ t: 'launch', at: pad, to: back, flightSec: sec }));
  const len = curvePath(gallery).length;
  forks.push({
    name,
    safe: 'a clean transfer onto the main ramp',
    risky: 'fall short onto the lower gallery, ride it round and take its launch back up',
    salvage: true,
    line: [
      ...[0.15, 0.4, 0.6, 0.8].map((k) => ({ at: rideAt(gallery, len * k, 0.35), surf: true })),
      { at: rideAt(gallery, -3, 0.35), surf: true },
      { at: pad },
      { at: back, surf: true },
      { at: rideAt(to, atS + 30, 0.35), surf: true },
    ],
  });
};

/** Bronze darkened (the shaft, the headstock, the clapper). */
const BRONZE_DARK = 0x6b5a3e;

/**
 * The suspended bronze bell over the nave (its crown at the height Act 6 sweeps round it), its
 * headstock with the red bell wheel, the rod it hangs from up through the helix, and the red
 * bell frame far below the sweep (a fall inward from it resets there).
 */
const bell = (
  p: Pen,
  deco: SceneryElement[],
  O: { x: number; z: number },
  sweepY: number,
): void => {
  const at = (y: number): P3 => [r1(O.x), r1(y), r1(O.z)];
  const crown = r1(sweepY - 3);
  const mouth = crown - 34;
  // the bell: stacked octagons, widest at the lip
  const rings: [number, number][] = [
    [31, 2.5],
    [28.5, 8],
    [25.5, 8],
    [21.5, 7],
    [17, 4.5],
    [11, 4],
  ];
  let y = mouth;
  for (const [d, h] of rings) {
    deco.push({ t: 'block', at: at(y), size: [d, h, d], round: true, solid: true, color: BRONZE });
    y += h;
  }
  // the clapper inside the mouth
  deco.push({
    t: 'block',
    at: at(mouth - 12),
    size: [3, 11.9, 3],
    round: true,
    color: BRONZE_DARK,
  });
  deco.push({
    t: 'block',
    at: at(mouth - 16.5),
    size: [7, 4.4, 7],
    round: true,
    color: BRONZE_DARK,
  });
  // the headstock and the rod up through the helix to the vault
  deco.push({ t: 'block', at: at(crown), size: [16, 3, 5], color: BRONZE_DARK });
  deco.push({
    t: 'block',
    at: at(crown + 3),
    size: [4, r1(520 - crown - 3), 4],
    round: true,
    color: BRONZE_DARK,
  });
  // the red bell wheel round the headstock
  for (let k = 0; k < 8; k++) {
    const b = k * 45 + 22.5;
    const [dx, dz] = dirOf(b);
    p.route.push({
      t: 'red',
      at: [r1(O.x + dx * 14), r1(crown + 3.5), r1(O.z + dz * 14)],
      size: [11.8, 1.6, 1.6],
      heading: b,
    });
  }
  // the red bell frame: radial beams far under the sweep's foot
  for (let k = 0; k < 8; k++) {
    const b = k * 45;
    const [dx, dz] = dirOf(b);
    p.route.push({
      t: 'red',
      at: [r1(O.x + dx * 38), r1(mouth + 2), r1(O.z + dz * 38)],
      size: [3, 3, 36],
      heading: b,
    });
  }
};

/**
 * Everything of the route a piece of stone must keep clear of: every ramp (its ridge and its
 * foot), window, gate, anchor, bay, pad, launch, portal and red zone, and the optional lines —
 * as points with the height span they occupy. Returns `free`: the height spans in y0..y1 where
 * a column of radius `r` at (x, z) keeps 12 m (horizontal) clear of all of it (and 12 m above
 * and below what it passes), each at least `min` tall.
 */
const routeKeep = (p: Pen, forks: CourseFork[]) => {
  const keep: { x: number; z: number; lo: number; hi: number }[] = [];
  const add = (x: number, z: number, lo: number, hi: number) => keep.push({ x, z, lo, hi });
  for (const e of p.route) {
    if (e.t === 'curve') {
      const path = curvePath(e);
      const run = e.height / Math.tan((e.angle * Math.PI) / 180);
      const sides = e.side === 'both' ? [-1, 0, 1] : e.side === 'right' ? [0, 1] : [-1, 0];
      for (let s = 0; s <= path.length; s += 3) {
        const r = path.at(s);
        const [rx, rz] = [-r.dir.z, r.dir.x];
        for (const k of sides)
          add(r.pos.x + rx * run * k, r.pos.z + rz * run * k, r.pos.y - e.height, r.pos.y + 3);
      }
    } else if (e.t === 'window') {
      const w = e.wall ?? [e.hole[0] + 8, e.hole[1] + 10];
      add(e.at[0], e.at[2], e.at[1] - w[1] / 2, e.at[1] + w[1]);
    } else if (e.t === 'gate' || e.t === 'anchor' || e.t === 'portal') {
      const h = e.size?.[1] ?? 10;
      add(e.at[0], e.at[2], e.at[1] - 4, e.at[1] + h + 2);
      if ((e.t === 'gate' || e.t === 'anchor') && e.bay)
        for (const [dx, dz] of [
          [0, 0],
          [-9, -9],
          [9, -9],
          [-9, 9],
          [9, 9],
        ])
          add(e.bay[0] + dx, e.bay[2] + dz, e.bay[1] - 4, e.bay[1] + 4);
    } else if (e.t === 'jumps') {
      for (const q of e.pads) add(q.at[0], q.at[2], q.at[1] - 3, q.at[1] + 6);
    } else if (e.t === 'launch' || e.t === 'red' || e.t === 'start' || e.t === 'platform') {
      add(e.at[0], e.at[2], e.at[1] - 4, e.at[1] + 6);
    }
  }
  for (const f of forks) for (const q of f.line) add(q.at[0], q.at[2], q.at[1] - 4, q.at[1] + 6);
  return (
    x: number,
    z: number,
    r: number,
    y0: number,
    y1: number,
    min = 20,
  ): [number, number][] => {
    const cuts = keep
      .filter((q) => Math.hypot(q.x - x, q.z - z) < r + 12)
      .map((q) => [q.lo - 12, q.hi + 12] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    let at = y0;
    for (const [a, b] of cuts) {
      if (a > at && Math.min(a, y1) - at >= min) out.push([at, Math.min(a, y1)]);
      at = Math.max(at, b);
      if (at >= y1) break;
    }
    if (y1 - at >= min) out.push([at, y1]);
    return out;
  };
};

/**
 * The cathedral round the route (scenery; rough ash stone, never polished): the nave's two
 * arcades (the inner one at the nave arch's radius, the outer one at the clerestory's) with
 * their cornices, piers along the transept, the choir and the rose apse, supports under the
 * ramps, pale light shafts from the broken vaults, and the pale mist far below the route.
 */
const cathedral = (
  p: Pen,
  forks: CourseFork[],
  O: { x: number; z: number },
  rIn: number,
  rOut: number,
  avoid: { x: number; z: number; r: number }[],
): SceneryElement[] => {
  const out: SceneryElement[] = [];
  const free = routeKeep(p, forks);
  const clear = (x: number, z: number, r: number) =>
    avoid.every((q) => Math.hypot(q.x - x, q.z - z) > q.r + r + 2);
  // pale light falling from the broken vaults in long columns (see-through)
  const shafts: [number, number][] = [
    [O.x - 135, O.z + 60],
    [O.x + 40, O.z - 140],
    [O.x + 130, O.z + 90],
    [-300, -120],
    [-330, 300],
    [60, 420],
    [360, 60],
    [200, -250],
  ];
  for (const [x, z] of shafts)
    for (const [a, b] of free(x, z, 5, 80, 520, 120)) {
      out.push({
        t: 'block',
        at: [r1(x), r1(a), r1(z)],
        size: [9, r1(b - a), 9],
        mat: 'glass',
        color: PALE,
      });
      avoid.push({ x, z, r: 6.5 });
    }
  /** the columns placed (the supports keep clear of them) */
  const placed: { x: number; z: number; r: number }[] = [];
  // (stone rises out of the mist: nothing starts below its tops)
  const base = 78;
  const column = (x: number, z: number, w: number, y0: number, y1: number) => {
    if (!clear(x, z, w / 2)) return;
    placed.push({ x, z, r: w / 2 });
    for (const [a, b] of free(x, z, w / 2, Math.max(base, y0), y1))
      out.push({
        t: 'block',
        at: [r1(x), r1(a), r1(z)],
        size: [r1(w), r1(b - a), r1(w)],
        round: true,
        color: ARCADE,
      });
  };
  // the nave: two arcades round the bell, a cornice ring on each
  const rings: [number, number, number, number][] = [
    [rIn, 18, 7, 440],
    [rOut, 24, 10, 455],
  ];
  for (const [r, n, w, top] of rings) {
    for (let k = 0; k < n; k++) {
      const b = (k * 360) / n + 7;
      const [dx, dz] = dirOf(b);
      column(O.x + dx * r, O.z + dz * r, w, base, top);
      // the cornice between this pier and the next
      const b2 = b + 180 / n;
      const [ex, ez] = dirOf(b2);
      const chord = 2 * r * Math.sin(Math.PI / n) + w;
      const c = r * Math.cos(Math.PI / n);
      const [cx, cz] = [O.x + ex * c, O.z + ez * c];
      const ends = [-1, -0.75, -0.5, -0.25, 0.25, 0.5, 0.75, 1].map((m) => [
        cx - ez * (chord / 2) * m,
        cz + ex * (chord / 2) * m,
      ]);
      if (
        free(cx, cz, chord / 2, top, top + 7, 7).length &&
        clear(cx, cz, 3) &&
        ends.every(([x, z]) => clear(x, z, 3))
      )
        out.push({
          t: 'block',
          at: [r1(cx), top, r1(cz)],
          size: [r1(chord), 6, 5],
          heading: r3(b2),
          color: ARCADE,
        });
    }
  }
  // supports under the ramps (every ~70 m where nothing passes below)
  for (const e of p.route) {
    if (e.t !== 'curve') continue;
    const path = curvePath(e);
    const run = e.height / Math.tan((e.angle * Math.PI) / 180);
    const side = e.side === 'right' ? 1 : e.side === 'left' ? -1 : 0;
    for (let s = 24; s < path.length - 14; s += 70) {
      const r = path.at(s);
      const x = r.pos.x - r.dir.z * side * run * 0.5;
      const z = r.pos.z + r.dir.x * side * run * 0.5;
      const topY = Math.min(...[-8, -4, 0, 4, 8].map((d) => path.at(s + d).pos.y)) - e.height - 0.5;
      const spans = free(x, z, 2, base, topY - 14, 30);
      const last = spans[spans.length - 1];
      // (only a support that reaches up to just under the ramp)
      const apart = placed.every((q) => Math.hypot(q.x - x, q.z - z) > q.r + 4);
      if (last && last[1] >= topY - 14.5 && clear(x, z, 2) && apart)
        out.push({
          t: 'block',
          at: [r1(x), r1(last[0]), r1(z)],
          size: [4, r1(topY - last[0]), 4],
          round: true,
          color: BASALT_STONE,
        });
    }
  }
  // the nave floor far below (the kill mist over it is the course's floors)
  out.push({ t: 'water', at: [0, 44, 0], size: [1000, 1000], color: 0x22262b });
  return out;
};

/** A bronze lantern hung 5 m over an A-frame's crest where the line crosses it (never solid). */
const crestLantern = (deco: SceneryElement[], far: CurveEl): void => {
  const [x, y, z] = far.at;
  deco.push({
    t: 'block',
    at: [r1(x), r1(y + 5), r1(z)],
    size: [1.2, 1.8, 1.2],
    mat: 'glow',
    color: 0xf2d9a8,
  });
  deco.push({
    t: 'block',
    at: [r1(x), r1(y + 6.8), r1(z)],
    size: [0.2, 12, 0.2],
    color: BRONZE_DARK,
  });
};

/**
 * Kill mist in a disc round the bell's axis under the helix: 19 m strips along x, r ≤ `R0`
 * (and ≤ `north` north of the bell: clear of the lower aisle G2 beyond r 100; Act 6's sweep is
 * at r 125). The red hoist grid lies just over it (a dropped rider touches the red first).
 */
const helixMist = (O: { x: number; z: number }, y: number, R0 = 118, north = 96): FloorData[] => {
  const out: FloorData[] = [];
  const C = 19;
  const n = Math.ceil(R0 / C);
  for (let j = -n; j < n; j++) {
    const far = Math.max(Math.abs(j * C), Math.abs((j + 1) * C));
    // (narrower north of the bell, where the lower aisle G2 runs under the great arch)
    const R = (j + 1) * C < -55 ? north : R0;
    if (far >= R) continue;
    // (as wide as the row can be with every corner inside the disc)
    const hw = Math.sqrt(R * R - far * far);
    out.push({
      y,
      min: [r1(O.x - hw), r1(O.z + j * C)],
      max: [r1(O.x + hw), r1(O.z + (j + 1) * C)],
    });
  }
  return out;
};

const lastCurve = (p: Pen): CurveEl => {
  const e = p.route[p.route.length - 1];
  if (e.t !== 'curve') throw new Error('not a curve');
  return e;
};

/**
 * An A-frame with a spine crossing, built as two curves joined exactly at the crossing (one
 * ridge line, one even grade through it): the `first` leg ridden on the `near` face and a
 * gradual climb to the crest; then, from the crest on, the `far` face — a short stretch just
 * under the crest and a gradual settle down it — and the `rest` (at the usual depth). The racing
 * line goes over the crest diagonally (the first far-face point is 3 m past the crest). Returns
 * the far half (its start is the crossing).
 */
const spineCurve = (
  p: Pen,
  o: {
    near: 'left' | 'right';
    far: 'left' | 'right';
    first: CurveLeg;
    rest: CurveLeg[];
    color: number;
  },
): CurveEl => {
  const g = SPINE_GRADE;
  p.curve({
    lead: 12,
    ride: o.near,
    legs: [{ ...o.first, ride: o.near }, ...climb(0.35, 0.04, 30, 30 * g, 10)],
    ...SPINE,
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
    ...SPINE,
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

export const basaltCathedralCourse = (): CourseData => {
  const p = new Pen([-258, 472, -183], 170);
  const deco: SceneryElement[] = [];
  const forks: CourseFork[] = [];
  p.start([14, 16]);
  p.platform([10, 12], 'strafe');

  // ---- 1 Outer buttress ----
  p.move(12, -8).curve({
    legs: [straight(190, 10), arc(-50, 230, 16), straight(30, 2)],
    ...MID,
    side: 'left',
    color: BASALT[0],
  });
  p.move(4, -2).anchor('Buttress', {}, [14, 12]);
  p.move(15, -5, -9);
  crestLantern(
    deco,
    spineCurve(p, {
      near: 'right',
      far: 'left',
      first: straight(14, 0.7),
      rest: [arc(-120, 50, 7), straight(20, 1)],
      color: BASALT[0],
    }),
  );

  {
    // the south buttress tower 1B's far face bends round (inside the turn, solid)
    const b1 = lastCurve(p);
    const path = curvePath(b1);
    const turnAt = b1.legs.findIndex((l) => l.turn === -120);
    const s = b1.legs.slice(0, turnAt).reduce((a, l) => a + (l.len ?? 0), 0);
    const r = path.at(s);
    const c: P3 = [r1(r.pos.x + r.dir.z * 50), 0, r1(r.pos.z - r.dir.x * 50)];
    deco.push({
      t: 'block',
      at: [c[0], 250, c[2]],
      size: [18, r1(r.pos.y + 30 - 250), 18],
      round: true,
      solid: true,
      color: ASH,
    });
    deco.push({
      t: 'block',
      at: [c[0], r1(r.pos.y + 30), c[2]],
      size: [22, 3, 22],
      round: true,
      color: BRONZE,
    });
  }
  p.window(10, [18, 12], [28, 22], -5, -4);
  p.move(8, -1, -6).curve({ legs: [straight(60, 4)], ...MID, side: 'right', color: BASALT[0] });
  p.move(6, -2).gate([22, 16], 'Nave Arch');

  // ---- 2 Bell descent ----
  p.move(14, -5, 9).curve({
    legs: [
      straight(70, 3),
      arc(-180, 70, 7),
      arc(-180, 70, 7, { toRadius: 60, red: 0.7, depth: 0.4 }),
      straight(80, 2, { red: false }),
    ],
    ...TIGHT,
    side: 'left',
    color: BASALT[1],
  });
  const helix = lastCurve(p);
  const hPath = curvePath(helix);
  /** The helix: where φ 0 is (after the lead-in and the approach), and each half's length. */
  const h0 = 5 + 70;
  const half1 = Math.PI * 70;
  const half2 = hPath.length - 80 - h0 - half1;
  const top = hPath.at(h0);
  /** The bell's axis: the helix's centre (everything round the nave is placed from it). */
  const O = { x: top.pos.x + top.dir.z * 70, z: top.pos.z - top.dir.x * 70 };
  {
    // the red cornice over half 2: a head-height limit over the top band (depth < 0.12), one
    // strip per 7.5°, 0.3 m over the ridge, on the underside of a stone overhang
    let prevTop = -Infinity;
    for (let k = 0; k < 24; k++) {
      const a = hPath.at(h0 + half1 + (half2 * k) / 24);
      const b = hPath.at(h0 + half1 + (half2 * (k + 1)) / 24);
      const flare = [1.5, 0.9, 0.4][k] ?? 0;
      const hd = headingTo(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
      // (centred 0.75 m over the face: from 0.5 m behind the ridge to 2 m over the face)
      const [dx, dz] = dirOf(hd);
      const mx = (a.pos.x + b.pos.x) / 2 + dz * 0.75;
      const mz = (a.pos.z + b.pos.z) / 2 - dx * 0.75;
      const chord = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) + 0.1;
      const y = a.pos.y + 0.3 + flare;
      p.route.push({
        t: 'red',
        at: [r1(mx), r3(y), r1(mz)],
        size: [2.5, 1, r3(chord)],
        heading: r3(hd),
      });
      deco.push({
        t: 'block',
        at: [r1(mx - dz * 0.6), r3(Math.max(y, prevTop) + 1.4), r1(mz + dx * 0.6)],
        size: [4.2, 1.6, r3(chord - 0.4)],
        heading: r3(hd),
        color: ASH,
      });
      prevTop = y;
    }
    // the bell hoist machinery under the helix (red): a fall inward ends here
    // (just over the kill mist under the helix: touch the machinery or the mist, you're back)
    const gy = r1(hPath.at(hPath.length).pos.y - 14);
    for (let k = 0; k < 12; k++) {
      const b = k * 30 + 15;
      const [dx, dz] = dirOf(b);
      p.route.push({
        t: 'red',
        at: [r1(O.x + dx * 42), gy, r1(O.z + dz * 42)],
        size: [1.4, 1, 44],
        heading: b,
      });
    }
    for (let k = 0; k < 12; k++) {
      const b = k * 30;
      const [dx, dz] = dirOf(b);
      p.route.push({
        t: 'red',
        at: [r1(O.x + dx * 30), gy, r1(O.z + dz * 30)],
        size: [15.2, 0.8, 1.2],
        heading: b,
      });
    }
  }
  p.window(14, [20, 14], [32, 26], -5, -4);
  p.move(2, 7).anchor('Great Arch', { back: 14 }, [18, 12]);
  p.move(20, -13, -6);
  // G2, the lower aisle: a weak release through the great arch falls onto it (a long way
  // round, then a launch back up onto 2C)
  const g2 = p.branch((b) => {
    b.move(-10, -22, 11).curve({
      lead: 12,
      legs: [straight(110, 4)],
      ...WIDE,
      side: 'right',
      color: SALVAGE,
    });
    return lastCurve(b);
  });
  p.curve({
    legs: [straight(70, 2), arc(-25, 160, 3), arc(25, 160, 3)],
    ...MID,
    side: 'right',
    color: BASALT[1],
  });
  const b2 = lastCurve(p);
  // (G2's launch throws you back up onto 2B's second bend, from its face side)
  salvage(p, forks, g2, b2, 170, 2.0, 'Lower aisle (G2)');
  p.move(14, -5, 9).curve({
    legs: [straight(10, 1), arc(-90, 100, 6), straight(140, 3)],
    ...MID,
    side: 'left',
    color: BASALT[1],
  });
  p.move(6, -2).gate([22, 16], 'Transept Door');

  // ---- 3 Transept spines (heading south down the west aisle) ----
  p.move(14, -5, -9).curve({
    legs: [straight(40, 2), arc(-90, 100, 8), straight(10, 1)],
    ...MID,
    side: 'right',
    color: BASALT[2],
  });
  p.move(14, -5, 9);
  crestLantern(
    deco,
    spineCurve(p, {
      near: 'left',
      far: 'right',
      first: arc(-20, 120, 3),
      rest: [arc(30, 110, 4)],
      color: BASALT[2],
    }),
  );

  p.move(15, -5, 9).curve({
    legs: [straight(32, 5), straight(30, -4)],
    ...MID,
    side: 'left',
    depth: 0.3,
    color: BASALT[2],
  });
  p.window(12, [9, 7], [21, 17], -2.2, -4);
  p.move(2, 3.5).anchor('Tracery', { back: 8, side: -13, up: 2, flightSec: 0.65 }, [9, 7]);
  p.move(14, -6.7, -6);
  crestLantern(
    deco,
    spineCurve(p, {
      near: 'right',
      far: 'left',
      first: arc(20, 120, 3),
      rest: [arc(-30, 110, 4)],
      color: BASALT[2],
    }),
  );

  p.move(15, -5, -9).curve({
    legs: [straight(32, 5), straight(30, -4)],
    ...MID,
    side: 'right',
    depth: 0.3,
    color: BASALT[2],
  });
  p.window(12, [9, 7], [21, 17], -2.2, 4);
  p.move(16, -3.2, 6);
  // G3, the lower gallery inside the bend: a weak release through the second tracery window
  // falls onto it (round the inside, then a launch back up onto 3E's last straight)
  const g3 = p.branch((b) => {
    b.move(-6, -20, -6).curve({
      lead: 5,
      legs: [straight(10, 1), arc(-90, 80, 4), straight(30, 1)],
      ...WIDE,
      side: 'left',
      color: SALVAGE,
    });
    return lastCurve(b);
  });
  p.curve({
    legs: [straight(15, 1), arc(-90, 100, 10), straight(40, 3)],
    ...STD,
    side: 'left',
    color: BASALT[2],
  });
  salvage(p, forks, g3, lastCurve(p), 195, 1.4, 'Lower gallery (G3)');
  p.move(6, -2).gate([22, 16], 'Spine Merge');

  // ---- 4 Choir crossing (heading east along the south aisle) ----
  p.move(14, -5, -9).curve({
    legs: [straight(80, 4), straight(20, 1)],
    ...MID,
    side: 'right',
    color: BASALT[3],
  });
  p.move(4, -2).anchor('Choir Stall', { flightSec: 0.95, up: 5 }, [14, 12]);
  // K1..K8: short faces alternately right / left between column pairs
  p.move(14, -4, 9);
  const choir: P3[] = [];
  for (let k = 0; k < 8; k++) {
    const right = k % 2 === 1;
    p.curve({
      // (a longer lead-in: a slow or low departure still lands on the face, not its end)
      lead: k ? 9 : 5,
      legs: k === 7 ? [straight(8, 0.5), straight(16, -3)] : [straight(16, 1)],
      ...SHORT,
      side: right ? 'right' : 'left',
      depth: 0.25,
      red: 0.8,
      color: BASALT[3],
    });
    if (k === 7) break;
    const a = p.here();
    p.move(20, -7, right ? 5 : -5);
    choir.push(a, p.here());
  }
  p.move(18, -1, 6).bhopPads([{ d: 0 }, { d: 18.6 }, { d: 19.0, turn: -15 }], [6, 9.5]);
  {
    // (a missed face or pad falls into the kill mist under the choir: back to R4 Choir Stall)
    const pads = p.route[p.route.length - 1];
    if (pads.t !== 'jumps') throw new Error('pads');
    const floorY: number[] = [];
    for (let i = 0; i < choir.length; i += 4)
      floorY.push(r1(Math.min(...choir.slice(i, i + 5).map((q) => q[1])) - 30));
    // a column pair either side of every gap (ash stone, solid, never red), 7 m off the
    // flight, rising out of the mist
    for (let k = 0; k + 1 < choir.length; k += 2) {
      const [a, b] = [choir[k], choir[k + 1]];
      const [mx, mz] = [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2];
      const [dx, dz] = dirOf(90);
      const base = floorY[Math.floor(k / 4)];
      for (const side of [-7, 7])
        deco.push({
          t: 'block',
          at: [r1(mx - dz * side), r1(base), r1(mz + dx * side)],
          size: [4, r1(a[1] + 16 - base), 4],
          round: true,
          solid: true,
          color: ASH,
        });
    }
  }
  p.move(25, -2, -4).curve({
    legs: [straight(120, 3), arc(15, 150, 2), arc(-90, 90, 5), straight(40, 3)],
    ...MID,
    side: 'left',
    color: BASALT[3],
  });
  p.move(6, -2).gate([22, 16], 'Choir Bridge');

  // ---- 5 Rose window (north up the east aisle, the loop, the rose, the portal) ----
  p.move(14, -5, -9).curve({
    legs: [straight(270, 5), arc(-35, 160, 3), arc(35, 160, 3), straight(40, 2)],
    ...STD,
    side: 'right',
    color: BASALT[4],
  });
  // (its bay east of the stair's end, clear of the loop that curls west)
  p.move(4, -2).anchor('Rose Stair', { flightSec: 0.9, back: 24, side: 8, up: 5 }, [14, 12]);
  // 5B: the loop — a quarter turn to face the rose (P1, where the fast line leaves over the
  // outer ridge), then on round under itself
  p.move(14, -5, 9).curve({
    legs: [straight(60, 4), arc(-90, 40, 3), arc(-180, 40, 5), straight(10, 0.5)],
    ...MID,
    side: 'left',
    color: BASALT[4],
  });
  const loop = lastCurve(p);
  /** 5B: flat metres along its ridge at loop angle φ (0 = the quarter turn's start). */
  const loopS = (phi: number): number => 5 + 60 + (phi * Math.PI * 40) / 180;
  p.move(16, -4, 3).curve({
    legs: [arc(-180, 38, 5), straight(10, 0.5)],
    ...MID,
    side: 'left',
    color: BASALT[4],
  });
  // 5D: the kicker under the red tracery ceiling
  p.move(16, -4, 0).curve({
    legs: [straight(10, 0.5), straight(24, -4)],
    ...MID,
    side: 'right',
    color: BASALT[4],
  });
  {
    // the rose's lower tracery: a red ceiling over the kicker (≈ 4 m over a rider's head), so
    // nobody drops onto 5D from the loop above; it stops short of the lip
    const kick = lastCurve(p);
    const a = rideAt(kick, 5, 0.35);
    const b = rideAt(kick, 27, 0.35);
    const hd = headingTo(b[0] - a[0], b[2] - a[2]);
    p.route.push({
      t: 'red',
      at: [r1((a[0] + b[0]) / 2), r1(Math.max(a[1], b[1]) + 6), r1((a[2] + b[2]) / 2)],
      size: [14, 1, 22],
      heading: r3(hd),
    });
  }
  // W5, the rose: broad and high enough for both lines (the kicker's north of its middle, the
  // fast line's flight from P1 south of it), the portal right behind it
  p.window(22, [22, 17], [36, 35], -5, 6);
  const w5 = p.here();
  {
    // the rose: a ring of bronze studs round the (rectangular) opening on the wall's near face
    const [dx, dz] = dirOf(p.heading);
    const [rx, rz] = [-dz, dx];
    const c = [w5[0] - dx * 0.9, w5[1] + 8.5, w5[2] - dz * 0.9];
    for (let k = 0; k < 28; k++) {
      const a = (k * 2 * Math.PI) / 28;
      deco.push({
        t: 'block',
        at: [
          r1(c[0] + rx * 15 * Math.cos(a)),
          r3(c[1] + 15 * Math.sin(a) - 1.4),
          r1(c[2] + rz * 15 * Math.cos(a)),
        ],
        size: [2.8, 2.8, 0.5],
        heading: p.heading,
        mat: 'glow',
        color: BRONZE,
      });
    }
  }
  p.move(0, 8.5);
  /** where P5 puts you: north-west of the bell, so Act 6's sweep is centred on its axis */
  const p5Exit: P3 = [r1(O.x - SWEEP_R + 5), P5_Y, r1(O.z - 258)];
  /** the portal's opening, in the middle */
  const p5Mid = p.relP(4, 0, 0);
  p.airPortal(4, p5Exit, -90, [24, 24], { color: 0xd8c08e, vertical: 'zero' });

  // ---- 6 Bell return ----
  p.move(6, -0.5).gate([24, 20], 'Rose Gallery');
  p.move(12, -6).curve({
    lead: 8,
    legs: [straight(240, 3), arc(-120, SWEEP_R, 5), straight(20, 1)],
    ...WIDE,
    side: 'left',
    depth: 0.5,
    color: BASALT[5],
  });
  {
    // the rose chord: one contact from the setup curve to the window
    const a6 = lastCurve(p);
    bell(p, deco, O, curvePath(a6).at(8 + 240 + (60 * Math.PI * SWEEP_R) / 180).pos.y);
    const fast = rideAt(loop, loopS(82), 0.05);
    forks.push({
      name: 'Rose chord',
      safe: 'follow the loop on round, down under the quarter turn, and kick up off 5D through the rose',
      risky:
        'climb to the top band by φ 80 and leave the loop at the quarter turn: fly straight through the rose',
      line: [
        { at: rideAt(loop, loopS(30), 0.35), surf: true },
        { at: rideAt(loop, loopS(52), 0.25), surf: true },
        { at: rideAt(loop, loopS(70), 0.1), surf: true },
        { at: fast, surf: true },
        { at: [w5[0], r1(fast[1] - 17), fast[2]], air: true },
        { at: [p5Mid[0], r1(fast[1] - 18), fast[2]], portal: true },
        { at: p5Exit },
        { at: rideAt(a6, 30, 0.4), surf: true },
        { at: rideAt(a6, 70, 0.4), surf: true },
      ],
    });
  }
  p.window(12, [16, 9], [24, 17], -4, -3);
  p.move(14, -3, -5).curve({
    legs: [straight(30, 1), arc(-60, 60, 3), straight(20, 1)],
    ...STD,
    side: 'right',
    color: BASALT[5],
  });
  p.move(4, -2).anchor('East Arcade', {}, [14, 12]);
  p.move(15, -5, 9).curve({
    legs: [straight(20, 1), arc(-90, 70, 4), straight(150, 3), arc(-90, 90, 4), straight(160, 4)],
    ...STD,
    side: 'left',
    color: BASALT[5],
  });
  p.move(8, -2).finishGate([24, 20], 30, 10);

  {
    // the cathedral round it all: the nave's arcades at the nave arch's radius (the great arch
    // is in the same ring) and at the clerestory window's
    const c1 = p.route.find((e) => e.t === 'gate');
    const w1 = p.route.find((e) => e.t === 'window');
    if (c1?.t !== 'gate' || w1?.t !== 'window') throw new Error('C1 / W1');
    const rIn = Math.hypot(c1.at[0] - O.x, c1.at[2] - O.z);
    const rOut = Math.hypot(w1.at[0] - O.x, w1.at[2] - O.z);
    const avoid = [{ x: O.x, z: O.z, r: 20 }];
    for (const e of deco)
      if (e.t === 'block' && e.size[0] > 15)
        avoid.push({ x: e.at[0], z: e.at[2], r: e.size[0] / 2 });
    deco.push(...cathedral(p, forks, O, rIn, rOut, avoid));
  }
  // (all of it is stone seen at speed or from afar: one flat quad per face)
  for (const e of deco) if (e.t === 'block') e.lowDetail = true;

  return p.course({
    name: 'Basalt Cathedral',
    kind: 'surf',
    mode: 'intermediate',
    profile: 'MOVEMENT_PROFILE v1',
    parSec: 180,
    palette: PALETTE,
    sky: {
      top: 0x1b1e22,
      horizon: 0x3a3d42,
      ground: 0x292d33,
      sun: { dir: [0.8, 0.45, -0.1], color: 0xf2d9a8, sizeDeg: 2 },
      sunLight: 0xf2dcb0,
      fog: { near: 150, far: 700 },
      ambient: 0.9,
    },
    roomMat: 'rock',
    killY: 60,
    // (kill mist under every stretch of the way, so a fall resets within a few seconds, and a
    // ring of it under the helix: its own is kept narrow by what lies round it)
    floors: [
      ...helixMist(O, r1(hPath.at(hPath.length).pos.y - 20)),
      // (and strips along the map's edges and south of Act 1, beyond the rest: a fall off the
      // outside of an aisle at full speed carries you 50 m out)
      { y: 320, min: [-235, -495], max: [60, -445] },
      { y: 245, min: [-495, 120], max: [-440, 290] },
      { y: 130, min: [468, -470], max: [498, 380] },
      { y: 390, min: [-165, 280], max: [65, 325] },
      // (and the open ground either side of the nave under Act 6's sweep, whose own mist is
      // narrow: a fall off its outside at speed carries you far)
      { y: 250, min: [185, -330], max: [375, 140] },
      { y: 240, min: [-330, -250], max: [-160, 300] },
      // (either side of the choir: south of the south aisle, north of it under Act 1's corner)
      { y: 215, min: [-445, 372], max: [-100, 430] },
      { y: 195, min: [-300, 255], max: [140, 312] },
    ],
    autoFloors: { below: 25, pad: 25 },
    scenery: deco,
    forks,
  });
};
