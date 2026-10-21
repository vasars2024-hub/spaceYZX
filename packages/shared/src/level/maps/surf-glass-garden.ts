// "Glass Garden" — surf map B02 (Beginner; docs/movement-map-design/maps/B02-glass-garden.md).
// An overgrown glass conservatory: a great tree has outgrown the building that sheltered it and
// holds the broken roof apart. Glazed irrigation troughs spiral clockwise and inward through the
// halls round it. Core skill: S-curves and height adjustment. Course data (level/course) on
// MOVEMENT_PROFILE v1. The route:
//
//   1 Seed channel     a broad bend round a planter, two raised opposing catches (upward lips),
//                      a banked corner (a shallow drainage channel catches missed catches)  → C1
//   2 Fern weave       two S-curves between fern beds, the second with a shorter transition → C2
//   3 Irrigation steps a climb onto six orchid pads in two phrases over the shallow service
//                      basin (a walkable perimeter beside them), a bend into the atrium     → C3
//   4 Tree atrium      a half circle round the trunk, a drop into the Ω loop round the root
//                      pool, a raised catch under the Trunk Bridge (the Root deck cuts the Ω) → C4
//   5 Petal windows    a forgiving bend, then scoop → petal window twice (red borders; the
//                      catch's lower band behind each window)                           → C5
//   6 Roof bloom       the glass flower portal lifts you onto the roof: a sweep round the
//                      crown, a short transfer and a wide final catch under the open roof → finish
//
// Glass is scenery only (block `mat: 'glass'`: see-through, never collides): nothing you can
// land on, hit or fly through is glass, and no pane stands between a lip and its catch.
import type {
  CourseData,
  CourseFork,
  CurveEl,
  CurveLeg,
  P3,
  RouteElement,
  SceneryElement,
} from '../course/types';
import { Pen } from '../course/pen';
import { curvePath, curveRidePoint } from '../course/curve';
import { expandCourse } from '../course/expand';

/**
 * Palette (brief: fern green #48745A, pale glass #C4E2DE, warm ivory #EEE8D9, orchid #AA83AA as
 * an accent; hazard red only on the petal window borders). Surf faces are glazed celadon (the
 * spec's fallback) with a warm ivory ridge glow; gates are fern; anchors, bays and launch pads
 * pale glass; bhop pads orchid; ribs, bridge and planters ivory.
 */
const PALETTE = {
  ground: 0xeee8d9,
  ground2: 0xd8d0bc,
  rock: 0xa9b39f,
  rockDark: 0x2f4a3a,
  edge: 0x5faf84,
  surf: 0x9db8a5,
  surfEdge: 0xf6f1e4,
  stage: 0x48745a,
  stageGlow: 0xc4e2de,
  start: 0x5faf84,
  finish: 0xf0d9a8,
  portal: 0xaa83aa,
  pad: 0xc4e2de,
  arrow: 0xeee8d9,
  cloud: 0xcfe3d6,
  // (the glow under the garden mist: warm sunlight, never red — red is the petal windows' only)
  danger: 0xf0d9a8,
  leaf: 0x48745a,
  leafDark: 0x2f4a3a,
  trunk: 0x5a4636,
  crystal: 0xc4e2de,
  water: 0x3e6e66,
  accent: 0x48745a,
  accent2: 0xaa83aa,
  bhop: 0xaa83aa,
  hazard: 0xe8242c,
  anchor: 0xc4e2de,
};

/**
 * Glazed celadon troughs, a shade apart per act (so each stretch reads as its own). The spec's
 * warm ivory faces washed out against the gold horizon and the pale mist in screenshots: its
 * darker celadon fallback (#9DB8A5) reads against sky, mist and the dark garden floor alike.
 */
const FACE = [0xa7bda6, 0x9fb9a8, 0x9db8a5, 0xa9bb9f, 0xa3b3ad, 0xb0bc9e];

/** Garden colours. */
const G = {
  bark: 0x5a4636,
  barkGlow: 0xf0d9a8,
  fern: 0x48745a,
  fernDark: 0x2f4a3a,
  moss: 0x5f8a62,
  glass: 0xc4e2de,
  rib: 0xeee8d9,
  orchid: 0xaa83aa,
  stream: 0xd2eef8,
  caustic: 0xc4e2de,
};

/** Face shapes (Beginner: broad faces, 55-58°). */
const BROAD = { height: 16, angle: 56 };
const WIDE = { height: 18, angle: 55 };
const STD = { height: 14, angle: 58 };

/**
 * The spec's drops scaled to Beginner speeds: the steady bot keeps nearly all its energy, so
 * the spec's drops (planned with 20 % losses) ran it at 40-50 m/s. Climbs (lips, scoops) are
 * kept as designed: they make the upward releases.
 */
const DROP_K = 0.35;
const dropK = (d: number): number => (d > 0 ? Math.round(d * DROP_K * 100) / 100 : d);

const arc = (
  turn: number,
  radius: number,
  drop: number,
  more: Partial<CurveLeg> = {},
): CurveLeg => ({
  turn,
  radius,
  drop: dropK(drop),
  ...more,
});
const straight = (len: number, drop: number, more: Partial<CurveLeg> = {}): CurveLeg => ({
  len,
  drop: dropK(drop),
  ...more,
});

const r1 = (x: number): number => Math.round(x * 10) / 10;
const DEG = Math.PI / 180;

/** Where a curve's racing line would be `s` metres (flat) along it, `depth` down its face. */
const rideAt = (e: CurveEl, s: number, depth = 0.35): P3 => {
  const path = curvePath(e);
  const r = path.at(s < 0 ? path.length + s : s);
  const face = e.side === 'both' ? (e.ride ?? 'right') : e.side;
  const q = curveRidePoint(e, r, face, depth);
  return [r1(q.x), r1(q.y), r1(q.z)];
};

/** A ridge point `s` metres along a curve (negative: from its end) and its heading. */
const ridgeAt = (e: CurveEl, s: number) => {
  const path = curvePath(e);
  const r = path.at(s < 0 ? path.length + s : s);
  return { pos: r.pos, hd: Math.atan2(r.dir.x, -r.dir.z) / DEG, dir: r.dir };
};

/** The last element written (a curve, as its data). */
const lastCurve = (p: Pen): CurveEl => {
  const e = p.route[p.route.length - 1];
  if (e.t !== 'curve') throw new Error('not a curve');
  return e;
};

/** A point `f` ahead along heading `hd`, `s` to its right, `u` up from `at`. */
const off = (at: P3, hd: number, f: number, s = 0, u = 0): P3 => {
  const h = hd * DEG;
  return [
    r1(at[0] + Math.sin(h) * f + Math.cos(h) * s),
    r1(at[1] + u),
    r1(at[2] - Math.cos(h) * f + Math.sin(h) * s),
  ];
};
const hdTo = (a: P3, b: P3): number => Math.atan2(b[0] - a[0], -(b[2] - a[2])) / DEG;
const flat = (a: P3, b: P3): number => Math.hypot(b[0] - a[0], b[2] - a[2]);
const at3 = (q: P3, y: number): P3 => [q[0], y, q[2]];

/** A standard restart bay: behind the landing it throws you back onto, on its ridge side. */
const BAY = {};

type Block = Extract<SceneryElement, { t: 'block' }>;
type Bounds = number[];
type P3o = { x: number; y: number; z: number };

const block = (at: P3, size: P3, color: number, more: Partial<Block> = {}): Block => ({
  t: 'block',
  at: [r1(at[0]), r1(at[1]), r1(at[2])],
  size,
  color,
  ...more,
});
/** Far scenery: one quad per face, never collides. */
const far = (at: P3, size: P3, color: number, more: Partial<Block> = {}): Block =>
  block(at, size, color, { lowDetail: true, ...more });
/** A see-through glass pane (scenery: never collides). */
const pane = (at: P3, size: P3, heading = 0): Block =>
  block(at, size, G.glass, { mat: 'glass', heading });

/** A course box's world bounds [x0, y0, z0, x1, y1, z1] (turned about the vertical only). */
const boundsOf = (b: {
  c: P3o;
  h: P3o;
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
      const s = Math.abs(Math.sin(a));
      [hx, hz] = [c * b.h.x + s * b.h.z, s * b.h.x + c * b.h.z];
    }
  }
  return [b.c.x - hx, b.c.y - hy, b.c.z - hz, b.c.x + hx, b.c.y + hy, b.c.z + hz];
};

/** A scenery block's world bounds (its heading turns it). */
const blockBounds = (b: Block): Bounds => {
  const [w, h, d] = b.size;
  const hd = (b.heading ?? 0) * DEG;
  const c = Math.abs(Math.cos(hd));
  const s = Math.abs(Math.sin(hd));
  const ex = b.round ? w * 0.6 : (c * w) / 2 + (s * d) / 2;
  const ez = b.round ? w * 0.6 : (s * w) / 2 + (c * d) / 2;
  return [b.at[0] - ex, b.at[1], b.at[2] - ez, b.at[0] + ex, b.at[1] + h, b.at[2] + ez];
};

const overlaps = (a: Bounds, b: Bounds, pad = 0.05): boolean =>
  a[0] < b[3] - pad &&
  a[3] > b[0] + pad &&
  a[1] < b[4] - pad &&
  a[4] > b[1] + pad &&
  a[2] < b[5] - pad &&
  a[5] > b[2] + pad;

const distTo = (b: Bounds, q: P3o): number =>
  Math.hypot(
    Math.max(b[0] - q.x, 0, q.x - b[3]),
    Math.max(b[1] - q.y, 0, q.y - b[4]),
    Math.max(b[2] - q.z, 0, q.z - b[5]),
  );

/** The course data (pure JSON). */
export const glassGardenCourse = (): CourseData => {
  const p = new Pen([-140, 400, -450], 90);
  const forks: CourseFork[] = [];
  const ramps: Record<string, CurveEl> = {};
  const ramp = (name: string): CurveEl => (ramps[name] = lastCurve(p));
  const here = () => ({ pos: p.here(), heading: p.heading });
  p.start([16, 16]);
  p.platform([10, 12], 'strafe');

  // ---- 1 Seed channel (north side, heading east, then south) ----
  // a shallow drop onto a broad bend round the seed planter; its lip climbs (an upward release)
  p.move(12, -6).curve({
    legs: [straight(110, 5), arc(25, 170, 9), straight(45, -4)],
    ...BROAD,
    side: 'right',
    color: FACE[0],
  });
  ramp('1A');
  p.move(4, 0).anchor('Planter Lip', BAY, [16, 14]);
  // the first raised opposing catch: caught deep (0.45), its ridge above the lip's ridge
  p.move(12, -4, 9).curve({
    legs: [straight(30, 1), arc(-25, 170, 7), straight(45, -4)],
    ...WIDE,
    depth: 0.45,
    side: 'left',
    color: FACE[0],
  });
  ramp('1B');
  // the same the other way, onto the banked corner
  p.move(16, -4, -9).curve({
    legs: [straight(30, 2), arc(90, 130, 11), straight(30, 2)],
    ...BROAD,
    depth: 0.5,
    side: 'right',
    color: FACE[0],
  });
  ramp('1C');
  p.move(6, -2).gate([24, 18], 'Seed Arch', { side: -16 });

  // ---- 2 Fern weave (east side, heading south, drifting west) ----
  // S1: banked +55°, a long straight glimpse, outside −35°
  p.move(12, -4, 2).curve({
    legs: [straight(30, 2), arc(55, 125, 9), straight(85, 4), arc(-35, 125, 6), straight(30, 2)],
    ...BROAD,
    side: 'right',
    color: FACE[1],
  });
  ramp('2A');
  p.move(4, -2).anchor('Fern Bed', BAY, [16, 14]);
  // S2: banked −35°, a shorter transition, outside +55°
  p.move(10, -3, 9).curve({
    legs: [straight(20, 1), arc(-35, 125, 6), straight(45, 2), arc(55, 125, 9), straight(30, 1)],
    ...BROAD,
    side: 'left',
    color: FACE[1],
  });
  ramp('2B');
  p.move(4, -2).anchor('Short Weave', BAY, [16, 14]);
  p.move(10, -3, -9).curve({
    legs: [straight(20, 1), arc(50, 150, 6), straight(60, 3)],
    ...BROAD,
    side: 'right',
    color: FACE[1],
  });
  ramp('2C');
  p.move(6, -2).gate([24, 18], 'Fern Door', { flightSec: 0.85, side: -24, up: 4 });

  // ---- 3 Irrigation steps (south side, heading west, then north into the atrium) ----
  // the climb that slows you to pad speed
  p.move(14, -4, 9).curve({
    legs: [straight(40, 2), straight(80, -8), straight(40, -5)],
    ...STD,
    side: 'left',
    color: FACE[2],
  });
  ramp('3A');
  // two three-hop phrases over the service basin, a +20° turn between them
  p.move(22, -6, 2).bhopPads(
    [{ d: 0, size: [12, 20] }, { d: 16.0 }, { d: 19.3, rise: -1 }],
    [9, 12],
  );
  const pads1 = p.route[p.route.length - 1];
  p.turn(20).move(8.3, 1.2).anchor('Basin', { back: 22, up: 4, flightSec: 0.9 }, [14, 12]);
  p.move(8.3, -1.2).bhopPads([{ d: 0 }, { d: 18.7, rise: -0.5 }, { d: 17.3 }], [9, 12]);
  const pads2 = p.route[p.route.length - 1];
  // the last hop boards the bend into the next greenhouse
  p.move(18, -2, -3).curve({
    legs: [straight(30, 2), arc(70, 170, 10)],
    ...BROAD,
    side: 'right',
    color: FACE[2],
  });
  ramp('3B');
  p.move(4, -2).anchor('Greenhouse Door', BAY, [16, 14]);
  p.move(10, -3, 2).curve({
    legs: [straight(260, 7)],
    ...WIDE,
    side: 'right',
    color: FACE[2],
  });
  ramp('3C');
  p.move(6, -2).gate([24, 18], 'Irrigation Frame', { side: -16 });

  // ---- 4 Tree atrium ----
  // the half circle round the trunk (its face toward it), its lip climbing
  p.move(12, -4, 2).curve({
    legs: [straight(30, 2), arc(180, 125, 18), straight(40, -4)],
    ...BROAD,
    side: 'right',
    color: FACE[3],
  });
  ramp('4A');
  const lip4A = here();
  p.move(4, -2).anchor('Trunk Lip', BAY, [16, 14]);
  // the drop one level down across the atrium's east side into the Ω round the root pool
  p.move(30, -9, 10).curve({
    legs: [
      straight(10, 1),
      arc(90, 60, 4),
      arc(-180, 60, 9),
      arc(90, 60, 4),
      straight(30, 1),
      straight(40, -4),
    ],
    ...WIDE,
    side: 'left',
    color: FACE[3],
  });
  ramp('4B');
  p.move(4, -2).anchor('Root Lip', BAY, [16, 14]);
  // the raised catch: arrive with enough speed
  p.move(12, -1, -9).curve({
    legs: [straight(40, 2)],
    ...WIDE,
    side: 'right',
    color: FACE[3],
  });
  ramp('4C');
  p.move(6, -2).gate([24, 18], 'Trunk Bridge', BAY);
  const gateC4 = p.route[p.route.length - 1];

  // ---- 5 Petal windows (lower layer: east along the south edge, then north) ----
  // the forgiving setup
  p.move(12, -4, -2).curve({
    legs: [straight(10, 1), arc(-90, 70, 8), straight(90, 4)],
    ...WIDE,
    side: 'left',
    color: FACE[4],
  });
  ramp('5A');
  p.move(4, -2).anchor('First Petal', { side: 16 }, [16, 14]);
  // scoop → window 1
  p.move(10, -3, -2).curve({
    legs: [straight(40, 2), straight(70, 10), straight(45, -6)],
    ...BROAD,
    side: 'left',
    color: FACE[4],
  });
  ramp('5S1');
  const lip5S1 = here();
  p.move(26, -7, 2).curve({
    legs: [straight(30, 2), arc(-90, 110, 8), straight(60, 3)],
    ...WIDE,
    side: 'left',
    color: FACE[4],
  });
  ramp('5B');
  p.move(4, -2).anchor('Second Petal', { side: 16 }, [16, 14]);
  // scoop → window 2
  p.move(10, -3, -2).curve({
    legs: [straight(30, 2), straight(70, 8), straight(45, -6)],
    ...BROAD,
    side: 'left',
    color: FACE[4],
  });
  ramp('5S2');
  const lip5S2 = here();
  p.move(26, -7, -2).curve({
    legs: [straight(30, 2), straight(110, 6)],
    ...WIDE,
    side: 'left',
    color: FACE[4],
  });
  ramp('5C');
  p.move(6, -2).gate([24, 18], 'Flower Gate', BAY);

  // ---- 6 Roof bloom ----
  p.move(14, -5, -9).curve({
    legs: [straight(50, 3)],
    ...STD,
    side: 'right',
    color: FACE[5],
  });
  ramp('6P');
  // the glass flower: turns you west and lifts you onto the roof, out level
  const flowerAt = p.relP(18);
  const flowerHd = (Math.round(p.heading / 90) * 90) % 360;
  p.airPortal(18, [-137, 440, -239], -90, [18, 18], {
    color: G.orchid,
    glyph: '✿',
    vertical: 'zero',
  });
  // a long settle, then the sweep round the crown
  p.move(14, -2).curve({
    lead: 12,
    legs: [straight(150, 6), arc(-90, 150, 12)],
    ...WIDE,
    side: 'left',
    color: FACE[5],
  });
  ramp('6A');
  p.move(4, -2).anchor('Crown', { side: 16 }, [16, 14]);
  p.move(10, -3, -2).curve({
    legs: [arc(-90, 150, 12), straight(60, 3)],
    ...WIDE,
    side: 'left',
    color: FACE[5],
  });
  ramp('6B');
  p.move(4, -2).anchor('Sunset', BAY, [16, 14]);
  // the short aerial transfer, the wide final catch under the open roof
  p.move(16, -5, -9).curve({
    legs: [straight(240, 13)],
    ...WIDE,
    side: 'right',
    color: FACE[5],
  });
  ramp('6C');
  p.move(8, -2).finishGate([28, 22], 34, 12);

  // ---- the Root deck (the faster line): 4A's lip → an optional deck along the Ω's neck →
  // back onto the Ω's last straight (it still crosses C4) ----
  {
    const merge = rideAt(ramps['4B'], 400);
    const mhd = ridgeAt(ramps['4B'], 400).hd;
    // the deck's end: where a short flight T(20, −3, +6) off its climbing lip lands on the merge
    // point (nearly along it: a flight across the face would lose its speed)
    const end = off(merge, mhd, -20, -6, 3);
    let deck: CurveEl | null = null;
    p.branch((b) => {
      b.pos = { x: lip4A.pos[0], y: lip4A.pos[1], z: lip4A.pos[2] };
      b.heading = lip4A.heading;
      // (a drop off the lip like the main transfer's: the deck runs level with the Ω)
      b.move(24, -9, -14);
      const start = b.here();
      b.face(hdTo(start, end));
      const len = flat(start, end);
      const drop = r1(start[1] - end[1]);
      b.curve({
        legs: [
          { len: r1(len - 40), drop: r1(drop + 2) },
          { len: 40, drop: -2 },
        ],
        // (a low face: it runs beside the Ω's neck, clear of its face below)
        height: 10,
        angle: 58,
        side: 'right',
        color: FACE[3],
      });
      deck = lastCurve(b);
    });
    const d = deck as unknown as CurveEl;
    ramps['4F'] = d;
    forks.push({
      name: 'Root deck',
      safe: 'ride the Ω loop round the root pool (4B)',
      risky:
        "ride 4A's lip, strafe left off its end onto the Root deck, then right off the deck's lip onto the Ω's last straight",
      line: [
        { at: rideAt(ramps['4A'], -30), surf: true },
        { at: rideAt(ramps['4A'], -2), surf: true },
        { at: rideAt(d, 12), surf: true },
        { at: rideAt(d, 110), surf: true },
        { at: rideAt(d, -2), surf: true },
        { at: rideAt(ramps['4B'], 410), surf: true },
        { at: rideAt(ramps['4B'], -3), surf: true },
      ],
    });
  }

  // ---- the petal windows: a suspended dark leaf wall across each scoop's flight, 12 m past its
  // lip; the clear opening 20 × 12 (6 m under the lip line to 6 m over it); thin hatched red
  // borders on the top and the upper 6 m of each side; the bottom edge is a plain bar. Nothing
  // hangs under the bar: a low (deep-ridden) release clips the bar or passes under it and comes
  // down on the lower band of the catch behind the window, its lower receiving face ----
  const walls: Block[] = [];
  const petalWindow = (lip: { pos: P3; heading: number }) => {
    const hd = lip.heading;
    const hb = off(lip.pos, hd, 12, 0, -6);
    const [hw, hh] = [21.2, 12.6];
    const [ww, wh] = [38, 27];
    const above = wh - hh - 1.2;
    const side = (ww - hw) / 2;
    const wall = (at: P3, size: P3) =>
      walls.push(block(at, size, G.fernDark, { heading: hd, solid: true }));
    wall(off(hb, hd, 0, 0, -1.2), [ww, 1.2, 1]);
    // (the top in two halves either side of a thin midrib slit: the red border's top stays open)
    for (const k of [-1, 1]) wall(off(hb, hd, 0, k * (ww / 4 + 0.3), hh), [ww / 2 - 0.6, above, 1]);
    for (const k of [-1, 1]) wall(off(hb, hd, 0, k * (hw / 2 + side / 2), 0), [side, hh, 1]);
    p.route.push({ t: 'red', at: off(hb, hd, 0, 0, hh - 0.6), size: [hw, 0.6, 1], heading: hd });
    for (const k of [-1, 1])
      p.route.push({
        t: 'red',
        at: off(hb, hd, 0, k * (hw / 2 - 0.3), hh - 6.6),
        size: [0.6, 6, 1],
        heading: hd,
      });
  };
  petalWindow(lip5S1);
  petalWindow(lip5S2);

  // ---- the Basin's walkable perimeter (salvage): a walk right of the pads (3B's face side),
  // lower; its launch boards 3B ----
  const padList = [pads1, pads2].flatMap((e) => (e.t === 'jumps' ? e.pads : []));
  const walk: P3[] = padList.map((q) => off(q.at, q.heading ?? 0, 0, 10, -2.5));
  const walkOut = (() => {
    const h = padList[padList.length - 1].heading ?? 0;
    const w = walk[walk.length - 1];
    // (the walk runs on under the launch pad at its end)
    return { end: off(w, h, 8), edge: off(w, h, 10), board: rideAt(ramps['3B'], 40) };
  })();
  {
    const w = walk[walk.length - 1];
    const { end, edge, board } = walkOut;
    p.branch((b) => {
      for (let i = 1; i < walk.length; i++) {
        // (a hand's breadth past a turned joint: the walk never cuts into the one before)
        const hd = hdTo(walk[i - 1], walk[i]);
        const turned = i > 1 && Math.abs(hd - hdTo(walk[i - 2], walk[i - 1])) > 1;
        const from = turned ? off(walk[i - 1], hd, 0.4) : walk[i - 1];
        b.route.push({ t: 'path', from, to: walk[i], width: 4 });
      }
      b.route.push({ t: 'path', from: w, to: edge, width: 4 });
      b.route.push({ t: 'launch', at: end, to: board, flightSec: 1.1, base: false });
    });
    forks.push({
      name: 'Basin perimeter walk',
      safe: 'bunny-hop the six pads',
      risky: 'walk the basin rim beside them; its launch boards the bend',
      salvage: true,
      line: [
        ...[...walk, end].map((at) => ({ at })),
        { at: board, surf: true },
        { at: rideAt(ramps['3B'], 80), surf: true },
      ],
    });
  }

  // (the finish gate ends the route: branches written after it go before it)
  {
    const fi = p.route.findIndex((e) => e.t === 'gate' && e.finish);
    p.route.push(...p.route.splice(fi, 1));
  }

  const base = {
    name: 'Glass Garden',
    kind: 'surf' as const,
    mode: 'beginner' as const,
    profile: 'MOVEMENT_PROFILE v1',
    parSec: 180,
    palette: PALETTE,
    sky: {
      top: 0x2c5b52,
      horizon: 0xf0d9a8,
      ground: 0x22382c,
      sun: { dir: [-0.8, 0.22, 0.2] as P3, color: 0xffd9a0, sizeDeg: 4 },
      sunLight: 0xffe6c4,
      fog: { near: 220, far: 900 },
      ambient: 1,
    },
    roomMat: 'sand' as const,
    killY: 152,
    floors: [],
    autoFloors: { below: 25, pad: 25 },
  };

  // ---- the shallow drainage channels (fitted to the route above): Act 1's channel under both
  // raised catches, Act 3's service basin under the pads ----
  const solids = expandCourse(p.course({ ...base, scenery: walls }))
    .def.boxes.filter((b) => !b.noCollide)
    .map(boundsOf);
  const water: SceneryElement[] = [];
  const extra: RouteElement[] = [];
  /**
   * A shallow channel over plan bounds `a`, its water 1.5 m under the lowest thing standing
   * over it (anything whose top is more than 15 m under `own` is another layer: ignored).
   */
  const channel = (a: { x0: number; z0: number; x1: number; z1: number }, own: number) => {
    let low = own;
    for (const b of solids)
      if (b[0] < a.x1 && b[3] > a.x0 && b[2] < a.z1 && b[5] > a.z0 && b[4] > own - 15)
        low = Math.min(low, b[1]);
    const y = r1(low - 1.5);
    water.push({
      t: 'water',
      at: [r1((a.x0 + a.x1) / 2), y, r1((a.z0 + a.z1) / 2)],
      size: [r1(a.x1 - a.x0), r1(a.z1 - a.z0)],
      shallow: true,
    });
    return y;
  };
  const areaOf = (pts: P3[], pad: number) => ({
    x0: Math.min(...pts.map((q) => q[0])) - pad,
    z0: Math.min(...pts.map((q) => q[2])) - pad,
    x1: Math.max(...pts.map((q) => q[0])) + pad,
    z1: Math.max(...pts.map((q) => q[2])) + pad,
  });
  const feet = (e: CurveEl, s0: number, s1: number): P3[] => {
    const out: P3[] = [];
    const L = curvePath(e).length;
    const a = s0 < 0 ? L + s0 : s0;
    const b = s1 < 0 ? L + s1 : s1;
    for (let s = a; s <= b + 1e-6; s += 10) out.push(rideAt(e, s, 1));
    return out;
  };
  /** A launch in the water on a ramp's face side,  m from its foot, back onto its face. */
  const bank = (e: CurveEl, s: number, out = 14) => {
    const r = ridgeAt(e, s);
    const foot = rideAt(e, s, 1);
    const k = e.side === 'right' ? 1 : -1;
    const at: P3 = [r1(foot[0] - k * r.dir.z * out), 0, r1(foot[2] + k * r.dir.x * out)];
    const from: P3 = [r1(at[0] - r.dir.x * 12), 0, r1(at[2] - r.dir.z * 12)];
    return { at, from, to: rideAt(e, s + 34, 0.3), later: rideAt(e, s + 90) };
  };
  const drain: { at: P3; from: P3; to: P3; later: P3; name: string }[] = [];
  {
    // D1, the seed drainage channel: under both raised catches, a launch on each catch's
    // face side (where a missed catch comes down)
    const b1 = { ...bank(ramps['1B'], 25), name: 'Seed drainage (first raised catch)' };
    const b2 = { ...bank(ramps['1C'], 20), name: 'Seed drainage (second raised catch)' };
    const pts = [
      ...feet(ramps['1A'], -70, -1),
      ...feet(ramps['1B'], 5, -1),
      ...feet(ramps['1C'], 5, 50),
      b1.at,
      b2.at,
      b1.from,
      b2.from,
    ];
    const own = Math.min(...pts.filter((q) => q[1]).map((q) => q[1]));
    const y = channel(areaOf(pts, 8), own);
    for (const d of [b1, b2])
      drain.push({ ...d, at: at3(d.at, r1(y - 1)), from: at3(d.from, r1(y - 1)) });
  }
  {
    // the service basin under the pads: launches north of the pads and on 3B's face side. It
    // stops short of the first pads, where Acts 4 and 5 pass far below (no slab over C4)
    const b3 = bank(ramps['3B'], 8, 16);
    const pts: P3[] = [...padList.map((q) => q.at), ...feet(ramps['3B'], 5, 30), b3.at];
    const own = Math.min(...padList.map((q) => q.at[1])) - 8;
    const y = channel({ ...areaOf(pts, 16), x1: -208 }, own);
    drain.push({ ...b3, at: at3(b3.at, r1(y - 1)), from: at3(b3.from, r1(y - 1)), name: '' });
    // (in the middle of the basin: a launch up onto the rim walk, the slow way on)
    for (const k of [2, 4]) {
      const q = padList[k];
      const at = at3(off(q.at, q.heading ?? 0, 0, 22), r1(y - 1));
      const to = walk[k + 1];
      extra.push({ t: 'launch', at, to, flightSec: 1.2, base: false, alt: true });
      water.push({ t: 'lamp', at: off(at, hdTo(at, to), -3, 3), color: G.caustic, height: 4 });
      if (k === 2)
        forks.push({
          name: 'Basin launch',
          safe: 'bunny-hop the six pads',
          risky:
            'miss a hop into the basin, wade to the lamp; its launch lifts you onto the rim walk',
          salvage: true,
          line: [
            { at: off(at, q.heading ?? 0, -12) },
            { at },
            ...walk.slice(k + 1).map((w) => ({ at: w })),
            { at: walkOut.end },
            { at: walkOut.board, surf: true },
            { at: rideAt(ramps['3B'], 80), surf: true },
          ],
        });
    }
  }
  for (const d of drain) {
    const sec = r1(Math.min(2.2, Math.max(1.2, flat(d.at, d.to) / 26)));
    extra.push({ t: 'launch', at: d.at, to: d.to, flightSec: sec, base: false, alt: true });
    water.push({ t: 'lamp', at: off(d.at, hdTo(d.at, d.to), -3, 3), color: G.caustic, height: 4 });
    if (d.name)
      forks.push({
        name: d.name,
        safe: 'make the catch',
        risky: 'fall into the shallow drainage, wade to the lamp and take its launch back up',
        salvage: true,
        line: [{ at: d.from }, { at: d.at }, { at: d.to, surf: true }, { at: d.later, surf: true }],
      });
  }
  // (before the finish gate: the route ends with it)
  p.route.splice(p.route.length - 1, 0, ...extra);

  // ---- the garden round it all (fitted to everything built so far) ----
  const floor: SceneryElement = {
    t: 'water',
    at: [0, 150, 0],
    size: [2000, 2000],
    color: 0x2a4a3c,
  };
  const built = expandCourse(
    p.course({ ...base, scenery: [floor, ...water, ...walls], forks }),
  ).def;
  const race = built.race!;
  const scenery = garden({
    ramps,
    boxes: built.boxes,
    line: [
      ...race.line.map((q) => q.pos),
      // (and every optional line: scenery keeps clear of them too)
      ...(race.forks ?? []).flatMap((q) => q.riskyLine.map((n) => n.pos)),
    ],
    gates: p.route.filter((e): e is Extract<RouteElement, { t: 'gate' }> => e.t === 'gate'),
    c4: gateC4,
    flower: { at: flowerAt, heading: flowerHd },
  });

  return p.course({
    ...base,
    scenery: [floor, ...water, ...walls, ...scenery],
    forks,
  });
};

/**
 * The conservatory round the course: the great tree, the root pool, glass walls and the broken
 * glass roof on ivory ribs, fern beds and orchids, the Trunk Bridge, the glass flower round the
 * portal, the irrigation gates' streams, caustic lamps. Nothing is placed where it would cut
 * into anything already there or come near the racing line (every piece is checked). Only the
 * trunk collides. No glass comes within 6 m of the racing line.
 */
const garden = (o: {
  ramps: Record<string, CurveEl>;
  boxes: {
    c: P3o;
    h: P3o;
    q?: { x: number; y: number; z: number; w: number };
    hull?: unknown;
    mat?: string;
    color?: number;
  }[];
  line: P3o[];
  gates: Extract<RouteElement, { t: 'gate' }>[];
  c4: RouteElement;
  flower: { at: P3; heading: number };
}): SceneryElement[] => {
  const out: SceneryElement[] = [];
  const solid = o.boxes.filter((b) => b.mat !== 'water');
  const occ: Bounds[] = solid.map(boundsOf);
  const looks: string[] = solid.map((b) => `${b.mat ?? 'hull'}|${b.color ?? -1}`);
  // the line, sampled every 3 m (flights between far nodes too)
  const line: P3o[] = [];
  for (let i = 0; i < o.line.length; i++) {
    const a = o.line[i];
    const b = o.line[i + 1];
    line.push(a);
    if (!b) break;
    const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 3);
    if (n > 30) continue;
    for (let k = 1; k < n; k++)
      line.push({
        x: a.x + ((b.x - a.x) * k) / n,
        y: a.y + ((b.y - a.y) * k) / n,
        z: a.z + ((b.z - a.z) * k) / n,
      });
  }
  let probes = 0;
  /**
   * Place all these pieces or none; `room`: metres kept from the line; `extra`: the bounds of
   * pieces that are not blocks (trees), checked the same way.
   */
  const put = (parts: SceneryElement[], room = 10, trust = false, extra: Bounds[] = []) => {
    const blocks = parts.filter((q): q is Block => q.t === 'block');
    const bounds = [...blocks.map(blockBounds), ...extra];
    const look = [
      ...blocks.map((q) => `${q.mat ?? 'rock'}|${q.color}`),
      ...extra.map(() => `probe${probes++}`),
    ];
    for (let i = 0; i < bounds.length; i++) {
      const b = bounds[i];
      // (trust: fitted by hand — the exact clipping check vets it, not these boxes' bounds)
      if (!trust && occ.some((q, k) => looks[k] !== look[i] && overlaps(q, b))) return false;
      if (!trust && bounds.some((q, k) => k < i && look[k] !== look[i] && overlaps(q, b)))
        return false;
      // (glass keeps at least 6 m from the line whatever `room` says)
      const keep = blocks[i]?.mat === 'glass' ? Math.max(room, 6) : room;
      if (keep > 0 && line.some((q) => distTo(b, q) < keep)) return false;
    }
    out.push(...parts);
    occ.push(...bounds);
    looks.push(...look);
    return true;
  };
  const R = o.ramps;

  // ---- the great tree: its trunk at the centre of 4A's half circle, through the roof ----
  const a4 = R['4A'];
  const mid = ridgeAt(a4, (a4.lead ?? 0) + 30 + (Math.PI * 125) / 2);
  const T: P3 = [r1(mid.pos.x - mid.dir.z * 125), 150, r1(mid.pos.z + mid.dir.x * 125)];
  {
    const parts: SceneryElement[] = [
      far(T, [36, 340, 36], G.bark, { mat: 'wood', round: true, solid: true }),
      far(T, [58, 26, 58], G.bark, { mat: 'wood', round: true }),
      far(at3(T, 490), [30, 30, 30], G.bark, { mat: 'wood', round: true }),
    ];
    // glowing seams up the bark's eight ridges (warm, never on a usable edge)
    for (let k = 0; k < 8; k++) {
      const hd = k * 45;
      parts.push(
        far(off(T, hd, 22, 0, 40), [1.2, 280, 1.2], G.barkGlow, { mat: 'glow', heading: hd }),
      );
    }
    // roots spreading over the conservatory floor
    for (let k = 0; k < 7; k++) {
      const hd = k * 51 + 20;
      parts.push(far(off(T, hd, 40), [12, 9, 50], G.bark, { mat: 'wood', heading: hd }));
      parts.push(far(off(T, hd, 75), [8, 5, 40], G.bark, { mat: 'wood', heading: hd + 8 }));
    }
    put(parts, 12, true);
    // branches above the roof route, stepping up and out; leaf masses at their tips
    for (let k = 0; k < 8; k++) {
      const hd = k * 45 + 10;
      const br: SceneryElement[] = [];
      let y = 488 + (k % 3) * 6;
      for (const [r0, r, w] of [
        [14, 70, 10],
        [70, 130, 7],
        [130, 185, 5],
      ]) {
        br.push(
          far(at3(off(T, hd, (r0 + r) / 2), y), [w, w, r - r0 + 4], G.bark, {
            mat: 'wood',
            heading: hd,
          }),
        );
        y += w * 0.8;
      }
      const tip = off(T, hd, 190);
      // (resting on the branch's end: leaf masses never cut through the bark)
      br.push(
        far(at3(tip, y + 1), [46, 20, 46], k % 2 ? G.fern : G.moss, {
          mat: 'sand',
          round: true,
          heading: hd,
        }),
      );
      br.push(
        far(at3(tip, y + 21), [30, 12, 30], k % 2 ? G.moss : G.fern, {
          mat: 'sand',
          round: true,
          heading: hd + 20,
        }),
      );
      put(br, 30);
    }
    put([far(at3(T, 520), [120, 40, 120], G.fern, { mat: 'sand', round: true })], 30);
  }

  // ---- the root pool inside the Ω (a round ivory planter rim, dark water, lamps) ----
  {
    const b4 = R['4B'];
    // (the middle of the second arc: its centre 60 m to the left)
    const m = ridgeAt(b4, (b4.lead ?? 0) + 10 + (Math.PI / 2) * 60 + (Math.PI * 60) / 2);
    const P: P3 = [r1(m.pos.x + m.dir.z * 60), 150, r1(m.pos.z - m.dir.x * 60)];
    const top = r1(Math.min(m.pos.y - 70, 240));
    const parts: SceneryElement[] = [
      far(P, [80, r1(top - 150), 80], G.rib, { mat: 'sand', round: true }),
      { t: 'water', at: [P[0], r1(top + 0.3), P[2]], size: [52, 52], color: 0x2e5d57 },
    ];
    for (const k of [0, 120, 240])
      parts.push({ t: 'lamp', at: off(at3(P, top), k, 30), color: G.caustic, height: 4 });
    put(parts, 40);
  }

  // ---- the glass walls of the conservatory: tall panes between ivory ribs round the edge ----
  for (const [hd, cx, cz] of [
    [0, 0, -488],
    [90, 488, 0],
    [180, 0, 488],
    [270, -488, 0],
  ] as [number, number, number][]) {
    for (let k = -7; k <= 7; k++) {
      const c = off([cx, 160, cz], hd, 0, k * 64);
      put([pane(c, [62, 300, 0.4], hd)], 12);
      const rib = off([cx, 150, cz], hd, 0, k * 64 + 32);
      put([far(rib, [2, 330, 2], G.rib, { mat: 'sand', heading: hd })], 8);
    }
    // a cornice along the top
    put([far([cx, 470, cz], [1000, 3, 3], G.rib, { mat: 'sand', heading: hd })], 8);
  }

  // ---- the broken roof: glass panes on ivory rib beams, held apart round the crown (none over
  // the tree: it opens over the roof route) ----
  for (let i = -3; i <= 3; i++)
    for (let j = -3; j <= 3; j++) {
      const c: P3 = [i * 140, 470, j * 140];
      if (Math.hypot(c[0] - T[0], c[2] - T[2]) < 260) continue;
      put([pane(c, [132, 0.4, 132])], 30);
    }
  // (the beams run in the gaps between the panes, broken off round the tree)
  for (let i = -3; i <= 2; i++)
    for (let j = -3; j <= 3; j++)
      for (const hd of [0, 90]) {
        const c: P3 = hd === 0 ? [i * 140 + 70, 471, j * 140] : [j * 140, 471, i * 140 + 70];
        if (Math.hypot(c[0] - T[0], c[2] - T[2]) < 230) continue;
        put([far(c, [2.4, 2, 140], G.rib, { mat: 'sand', heading: hd })], 30);
      }

  // ---- the Trunk Bridge: a glass-walled footbridge on ivory ribs, 26 m over C4 ----
  if (o.c4.t === 'gate') {
    const g = o.c4;
    const y = r1(g.at[1] + g.size[1] + 26);
    const c: P3 = [g.at[0], y, g.at[2]];
    const hd = g.heading + 90;
    const parts: SceneryElement[] = [far(c, [150, 1.2, 5], G.rib, { mat: 'sand', heading: hd })];
    for (const s of [-2.3, 2.3]) {
      parts.push(far(off(c, hd, 0, s, 1.2), [150, 0.3, 0.4], G.rib, { mat: 'sand', heading: hd }));
      parts.push(pane(off(c, hd, 0, s, 1.5), [148, 1.3, 0.2], hd));
    }
    for (const k of [-70, 70])
      parts.push(
        far(off(at3(c, 150), hd, k), [3, r1(y - 150), 3], G.rib, { mat: 'sand', heading: hd }),
      );
    put(parts, 14);
  }

  // ---- the glass flower round the portal: glass petals, an orchid calyx, a fern stem ----
  {
    // (at: the middle of the opening, 18 × 18; its frame reaches about 10.5 m round it)
    const { at, heading } = o.flower;
    const parts: SceneryElement[] = [];
    // tall side petals, two upper petals, all in the frame's plane and clear of the opening
    for (const [s, u, w, h] of [
      [-14.5, -12, 6, 24],
      [14.5, -12, 6, 24],
      [-8, 12, 12, 12],
      [8, 12, 12, 12],
    ])
      parts.push(pane(off(at, heading, 0, s, u), [w, h, 0.4], heading));
    parts.push(far(off(at, heading, 0, 0, -15), [30, 3, 4], G.orchid, { mat: 'glow', heading }));
    put(parts, 7);
    // a fern stem down into the mist (where nothing else stands)
    put([far(at3(at, 150), [3, r1(at[1] - 15 - 150), 3], G.fern, { mat: 'sand' })], 7);
  }

  // ---- the irrigation gates: a glow pipe on the lintel, a thin stream beside each post ----
  for (const e of o.gates) {
    const [w, h] = e.size;
    const parts: SceneryElement[] = [
      far(off(e.at, e.heading, 0, 0, h + 1.5), [w + 2.4, 0.5, 0.5], G.glass, {
        mat: 'glow',
        heading: e.heading,
      }),
    ];
    if (!e.finish)
      for (const k of [-1, 1])
        parts.push(
          far(off(e.at, e.heading, 0, k * (w / 2 + 3), -14), [1.2, h + 15, 0.4], G.stream, {
            mat: 'sand',
            heading: e.heading,
          }),
        );
    put(parts, 1.5);
  }

  // ---- fern beds and planters: dense in the Seed & Fern hall (north, east), sparse in the
  // Irrigation hall (south), orchids in the Petal hall; well under the faces ----
  // (floating planter tubs: the first depth that clears the garden mist and everything else)
  const bedAt = (name: string, every: number, dist: number, kind: 'fern' | 'orchid') => {
    const e = R[name];
    const L = curvePath(e).length;
    const side = e.side === 'right' ? 1 : -1;
    for (let s = 25; s < L - 10; s += every) {
      const r = ridgeAt(e, s);
      for (const k of [side, -side])
        for (const below of [30, 42, 58, 75])
          if (bed(r, k * dist, below, 22 + ((s * 7) % 10), kind)) break;
    }
  };
  const bed = (
    r: { pos: P3o; hd: number },
    side: number,
    below: number,
    w: number,
    kind: 'fern' | 'orchid',
  ): boolean => {
    const c = off([r.pos.x, r.pos.y - below, r.pos.z], r.hd, 0, side);
    const parts: SceneryElement[] = [
      far(at3(c, c[1] - 10), [w, 10, w], G.rib, { mat: 'sand', round: true }),
    ];
    const plants: [number, number, number][] =
      kind === 'fern'
        ? [
            [-11, 0, 30],
            [11, 0, 24],
          ]
        : [
            [0, 0, 9],
            [4, 3, 6],
            [-4, -2, 7],
          ];
    for (const [dx, dz, hh] of plants)
      parts.push(
        kind === 'fern'
          ? { t: 'tree', at: [r1(c[0] + dx), c[1], r1(c[2] + dz)], height: hh, kind: 'broad' }
          : {
              t: 'crystal',
              at: [r1(c[0] + dx), c[1], r1(c[2] + dz)],
              height: hh,
              color: G.orchid,
            },
      );
    parts.push({
      t: 'lamp',
      at: [r1(c[0] + w * 0.3), c[1], r1(c[2] - w * 0.3)],
      color: G.caustic,
      height: 3,
    });
    // (the plants' reach: trees and flowers are not blocks)
    const reach = kind === 'fern' ? 24 : 8;
    const top = kind === 'fern' ? 31 : 10;
    return put(parts, 20, false, [
      [c[0] - reach, c[1], c[2] - reach, c[0] + reach, c[1] + top, c[2] + reach],
    ]);
  };
  bedAt('1A', 90, 45, 'fern');
  bedAt('2A', 110, 50, 'fern');
  bedAt('2B', 110, 50, 'fern');
  bedAt('3C', 130, 55, 'fern');
  bedAt('5B', 120, 50, 'orchid');

  // ---- suspended leaf walls in the Petal hall (dark fern, off the line, orchid-tipped) ----
  for (const name of ['5A', '5C']) {
    const e = R[name];
    const r = ridgeAt(e, 50);
    const side = e.side === 'right' ? 1 : -1;
    const c = off([r.pos.x, r.pos.y - 8, r.pos.z], r.hd, 0, -side * 40);
    put(
      [
        far(c, [22, 26, 1], G.fernDark, { mat: 'sand', heading: r.hd }),
        far(off(c, r.hd, 0, 0, 26), [12, 8, 1], G.fernDark, { mat: 'sand', heading: r.hd }),
        far(off(c, r.hd, 0, 0, 34), [4, 3, 1], G.orchid, { mat: 'glow', heading: r.hd }),
      ],
      14,
    );
  }
  return out;
};
