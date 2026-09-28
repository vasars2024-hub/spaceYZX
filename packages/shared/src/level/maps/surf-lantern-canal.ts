// "Lantern Canal" — surf map B04 (Beginner; docs/movement-map-design/maps/B04-lantern-canal.md).
// A compact canal town at dusk, built as a bowl: the outer quay ring is the highest terrace, the
// canals step down inward through lock gates to the festival square in the middle, where a
// great paper lantern hangs over the finish. Core skill: reading bends and portal exits. Course
// data (level/course) on MOVEMENT_PROFILE v1. The route is a spiral:
//
//   1 Outer quay     up the west quay, round the north-west corner under the high Quay Bridge,
//                    along the north quay, a first bank-to-bank transfer, round the north-east
//                    corner                                                          → C1
//   2 Covered docks  down the east side through covered storage bays: a transfer under a tie
//                    beam, a climb, a rising transfer out into the open dock          → C2
//   3 Ferry stones   west along the south side: four ferry stones round a moored ferry, a
//                    short bank under a footbridge, three more stones, north up the west side
//                    (dockside paths beside both phrases catch a lost rhythm)         → C3
//   4 Lantern court  a 180° curve round the fountain, a release across the court over its red
//                    basin, the second ring south and east                           → C4
//   5 Twin doors     the lock ramp into Door A (turns you north, lifts you to the upper town),
//                    a settling ramp; Door B on the balcony (optional: strafe left off the
//                    lip into it) cuts the bend canal onto the merge ramp            → C5
//   6 Festival run   three broad curves and two graceful transfers into the festival square,
//                    through the arcade, under the paper lantern                     → finish
//
// Every canal under the banks is shallow water (a floor you land on and wade in): launch pads
// in the canal throw you back onto the bank above (the slow bank route). Red, hatched sluices
// (deep water) send you back to the latest anchor.
import type {
  CourseData,
  CourseFork,
  CurveEl,
  CurveLeg,
  LaunchEl,
  P3,
  RedEl,
  RouteElement,
  SceneryElement,
} from '../course/types';
import { Pen } from '../course/pen';
import { curvePath, curveRidePoint } from '../course/curve';
import { expandCourse } from '../course/expand';

/**
 * Palette (brief: midnight indigo #242F52, lantern amber #F2B85E, weathered timber #725545,
 * soft teal #518C91; paper white #F4EEDC; hazard red only on red zones). Amber stays on
 * lanterns and windows, never on a usable edge; every usable ridge carries the cool teal line.
 */
const PALETTE = {
  ground: 0x9a8a78,
  ground2: 0x7d6f63,
  rock: 0x5c5a6e,
  rockDark: 0x2e3450,
  edge: 0x6fc9c9,
  surf: 0x725545,
  surfEdge: 0x7fe0da,
  stage: 0x6a4d3e,
  stageGlow: 0x8fe3dc,
  start: 0x7fe0da,
  finish: 0xf2b85e,
  portal: 0x62b8bc,
  pad: 0x7fe0da,
  arrow: 0xf4eedc,
  cloud: 0x3a4466,
  danger: 0xe8242c,
  leaf: 0x3f6a5a,
  leafDark: 0x2c4a44,
  trunk: 0x4a3a30,
  crystal: 0xf4eedc,
  water: 0x2a3760,
  accent: 0x518c91,
  accent2: 0xf2b85e,
  bhop: 0xc9d3d6,
  hazard: 0xe8242c,
  anchor: 0x7fe0da,
};

/** Bank timber, a shade apart per act (so each stretch reads as its own). */
const TIMBER = [0x7a5a48, 0x725545, 0x6c5244, 0x7d5c47, 0x77573f, 0x815f4a];

/** Door colours and marks: the two portal pairs differ in colour, mark and frame. */
const DOOR_A = { color: 0x62b8bc, glyph: '☾' };
const DOOR_B = { color: 0xf4eedc, glyph: '◆' };

/** Face shapes (Beginner: broad faces, 55-58°). */
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

const r1 = (x: number): number => Math.round(x * 10) / 10;
const DEG = Math.PI / 180;

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

/** A standard restart bay: behind the landing it throws you back onto, on its ridge side. */
const BAY = {};

/** A point. */
type P3o = { x: number; y: number; z: number };

/** Plan-view bounds. */
interface Area {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** One stretch of shallow canal: its plan bounds and its water surface. */
interface Canal extends Area {
  /** water surface (the floor is 1 m under it) */
  y: number;
  /** the ramp above it (index in the route) */
  ramp: number;
}

/**
 * The shallow canals: under every bank, from its foot out over the water between the banks,
 * one level per bank (under the lowest thing standing over it; lock steps between banks). Each
 * is a few axis-aligned stretches following the bank; a stretch is left out where a lower part
 * of the route passes under it. `solids`: every colliding box of the course (world bounds).
 */
const planCanals = (route: RouteElement[], solids: number[][]): Canal[] => {
  const out: Canal[] = [];
  route.forEach((e, i) => {
    const stretches: { a: Area; low: number }[] = [];
    let group: { x: number; z: number; foot: number }[] = [];
    let startDir = 0;
    const flush = (W = 17) => {
      if (!group.length) return;
      const a = {
        x0: Math.min(...group.map((q) => q.x)) - W,
        z0: Math.min(...group.map((q) => q.z)) - W,
        x1: Math.max(...group.map((q) => q.x)) + W,
        z1: Math.max(...group.map((q) => q.z)) + W,
      };
      stretches.push({ a, low: Math.min(...group.map((q) => q.foot)) });
      group = [];
    };
    if (e.t === 'jumps' && !e.alt) {
      // the ferry basin: round the stones, below their rock bodies
      group = e.pads.map((q) => ({ x: q.at[0], z: q.at[2], foot: q.at[1] - 8 }));
      flush(20);
    }
    if (e.t !== 'curve' || e.alt) {
      if (stretches.length) addLevels(stretches, i);
      return;
    }
    const path = curvePath(e);
    const face = e.side === 'both' ? (e.ride ?? 'right') : e.side;
    for (let s = e.lead ?? 0; s <= path.length + 1e-6; s += 12) {
      const r = path.at(Math.min(s, path.length));
      const foot = curveRidePoint(e, r, face, 1);
      const ox = face === 'right' ? -r.dir.z : r.dir.z;
      const oz = face === 'right' ? r.dir.x : -r.dir.x;
      const hd = Math.atan2(r.dir.x, -r.dir.z) / DEG;
      const turned = Math.abs(((hd - startDir + 540) % 360) - 180) > 18;
      if (group.length && (group.length >= 9 || turned)) flush();
      if (!group.length) startDir = hd;
      group.push({ x: foot.x + ox * 7, z: foot.z + oz * 7, foot: foot.y });
    }
    flush();
    addLevels(stretches, i);
  });
  return out;

  /**
   * Each stretch: under everything standing over it (not reaching far below the bank), and
   * never above the stretch before it (the canal only steps down, lock by lock).
   */
  function addLevels(stretches: { a: Area; low: number }[], i: number): void {
    let level = Infinity;
    for (const { a, low: own } of stretches) {
      let low = own;
      let deep = false;
      for (const b of solids) {
        if (!(b[0] < a.x1 && b[3] > a.x0 && b[2] < a.z1 && b[5] > a.z0)) continue;
        if (b[1] < own - 24) deep = true;
        else low = Math.min(low, b[1]);
      }
      if (deep) continue;
      level = Math.min(level, low);
      out.push({ ...a, y: r1(level - 1.5), ramp: i });
    }
  }
};

/**
 * A box's world bounds [x0, y0, z0, x1, y1, z1]: course boxes turn about the vertical only
 * (anything else: a safe sphere bound).
 */
const boundsOf = (b: {
  c: P3o;
  h: P3o;
  q?: { x: number; y: number; z: number; w: number };
  hull?: unknown;
}): number[] => {
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

type Block = Extract<SceneryElement, { t: 'block' }>;
type Bounds = number[];

/** A scenery block's world bounds [x0, y0, z0, x1, y1, z1] (its heading turns it). */
const blockBounds = (b: Block): Bounds => {
  const [w, h, d] = b.size;
  const hd = (b.heading ?? 0) * DEG;
  const c = Math.abs(Math.cos(hd));
  const s = Math.abs(Math.sin(hd));
  const ex = b.round ? w * 0.6 : (c * w) / 2 + (s * d) / 2;
  const ez = b.round ? w * 0.6 : (s * w) / 2 + (c * d) / 2;
  return [b.at[0] - ex, b.at[1], b.at[2] - ez, b.at[0] + ex, b.at[1] + h, b.at[2] + ez];
};

/** Two bounds overlap (more than a touch)? */
const overlaps = (a: Bounds, b: Bounds, pad = 0.05): boolean =>
  a[0] < b[3] - pad &&
  a[3] > b[0] + pad &&
  a[1] < b[4] - pad &&
  a[4] > b[1] + pad &&
  a[2] < b[5] - pad &&
  a[5] > b[2] + pad;

/** The distance from a point to bounds. */
const distTo = (b: Bounds, q: P3o): number =>
  Math.hypot(
    Math.max(b[0] - q.x, 0, q.x - b[3]),
    Math.max(b[1] - q.y, 0, q.y - b[4]),
    Math.max(b[2] - q.z, 0, q.z - b[5]),
  );

/** A point `f` ahead along heading `hd`, `s` to its right, `u` up from `at`. */
const off = (at: P3, hd: number, f: number, s = 0, u = 0): P3 => {
  const h = hd * DEG;
  return [
    r1(at[0] + Math.sin(h) * f + Math.cos(h) * s),
    r1(at[1] + u),
    r1(at[2] - Math.cos(h) * f + Math.sin(h) * s),
  ];
};

/** Colours of the town (timber houses, dark roofs, lit paper windows, stone). */
const TOWN = {
  timber: 0x6a4d3e,
  timberDark: 0x4a372e,
  roof: 0x262a3e,
  window: 0xf2b85e,
  stone: 0x55566a,
  paper: 0xf6dca8,
  paperDim: 0xe9c486,
};

const block = (at: P3, size: P3, color: number, more: Partial<Block> = {}): Block => ({
  t: 'block',
  at: [r1(at[0]), r1(at[1]), r1(at[2])],
  size,
  color,
  ...more,
});

/**
 * The town round the canals, fitted to the built course: nothing is placed where it would cut
 * into anything already there or come near the racing line (every piece is checked). Pure
 * decoration (only the tie beam, the footbridge and the fountain collide).
 */
const town = (o: {
  ramps: Record<string, CurveEl>;
  route: RouteElement[];
  boxes: {
    c: P3o;
    h: P3o;
    q?: { x: number; y: number; z: number; w: number };
    hull?: unknown;
    mat?: string;
    color?: number;
  }[];
  line: P3o[];
  canals: Canal[];
}): SceneryElement[] => {
  const out: SceneryElement[] = [];
  // everything already there, with its look (pieces that look the same may overlap)
  const solid = o.boxes.filter((b) => b.mat !== 'water');
  const occ: Bounds[] = solid.map(boundsOf);
  const looks: string[] = solid.map((b) => `${b.mat ?? 'hull'}|${b.color ?? -1}`);
  let isles = 0;
  // the line, sampled every 3 m (flights between far nodes too)
  const line: P3o[] = [];
  for (let i = 0; i < o.line.length; i++) {
    const a = o.line[i];
    const b = o.line[i + 1];
    line.push(a);
    if (!b) break;
    const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 3);
    if (n > 20) continue;
    for (let k = 1; k < n; k++)
      line.push({
        x: a.x + ((b.x - a.x) * k) / n,
        y: a.y + ((b.y - a.y) * k) / n,
        z: a.z + ((b.z - a.z) * k) / n,
      });
  }
  /** Place all these pieces or none; `room`: metres kept from the line; `extra`: more bounds. */
  const put = (parts: SceneryElement[], room = 10, extra: Bounds[] = []): boolean => {
    const blocks = parts.filter((q): q is Block => q.t === 'block');
    const bounds = [...blocks.map(blockBounds), ...extra];
    const look = [
      ...blocks.map((q) => `${q.mat ?? 'rock'}|${q.color}`),
      ...extra.map(() => `isle${isles++}`),
    ];
    for (let i = 0; i < bounds.length; i++) {
      const b = bounds[i];
      if (occ.some((q, k) => looks[k] !== look[i] && overlaps(q, b))) return false;
      if (room > 0 && line.some((q) => distTo(b, q) < room)) return false;
    }
    out.push(...parts);
    occ.push(...bounds);
    looks.push(...look);
    return true;
  };
  /** The highest thing under a footprint (the ground a post stands on), else the valley. */
  const groundUnder = (x0: number, z0: number, x1: number, z1: number, below: number): number => {
    let g = 150;
    for (const q of occ)
      if (q[0] < x1 && q[3] > x0 && q[2] < z1 && q[5] > z0 && q[4] <= below) g = Math.max(g, q[4]);
    return g;
  };
  /** A timber post standing on whatever is under it, up to `top`. */
  const post = (x: number, z: number, top: number, w: number, color: number): Block | null => {
    const g = groundUnder(x - w, z - w, x + w, z + w, top - 2);
    if (top - g < 1) return null;
    return block([x, g, z], [w, r1(top - g), w], color, { round: true, mat: 'wood' });
  };
  const R = o.ramps;
  const ridge = (e: CurveEl, s: number) => {
    const path = curvePath(e);
    return path.at(s < 0 ? path.length + s : s);
  };
  const hdOf = (d: { x: number; z: number }): number => r1(Math.atan2(d.x, -d.z) / DEG);

  // ---- the high Quay Bridge over the north-west corner of the outer quay ----
  {
    const e = R['1A'];
    const r = ridge(e, (e.lead ?? 0) + 130 + (Math.PI / 2) * 150 * 0.5);
    const hd = hdOf(r.dir);
    // across the corridor: from behind the ridge out over the canal (the face is on the right)
    const c = off([r.pos.x, r.pos.y + 22, r.pos.z], hd, 0, 12);
    const parts: SceneryElement[] = [block(c, [96, 3, 10], TOWN.stone, { heading: hd })];
    for (const s of [-4.6, 4.6])
      parts.push(block(off(c, hd, s, 0, 3), [96, 1.2, 0.8], TOWN.stone, { heading: hd }));
    for (const k of [-36, -12, 12, 36])
      for (const s of [-4.6, 4.6]) parts.push({ t: 'lantern', at: off(c, hd, s, k, 4.2) });
    for (const k of [-44, 44]) {
      const q = off(c, hd, 0, k);
      const m = post(q[0], q[2], c[1], 8, TOWN.stone);
      if (m) parts.push({ ...m, mat: 'rock' });
    }
    put(parts, 6);
  }

  // ---- the covered docks: the tie beam over the second transfer, roofs over the banks ----
  {
    const e = R['2A'];
    const r = ridge(e, -0.1);
    const hd = hdOf(r.dir);
    const c = off([r.pos.x, r.pos.y + 4.5, r.pos.z], hd, 8, 4.5);
    put([block(c, [50, 2, 1.5], TOWN.timberDark, { heading: hd, mat: 'wood', solid: true })], 5);
  }

  for (const name of ['2A', '2B']) {
    const e = R[name];
    const L = curvePath(e).length;
    const side = e.side === 'right' ? 1 : -1;
    for (let s = 14; s < L - 10; s += 26) {
      const r = ridge(e, s);
      const hd = hdOf(r.dir);
      // over the face and the water between the banks
      const c = off([r.pos.x, r.pos.y + 11, r.pos.z], hd, 0, side * 12);
      const parts: SceneryElement[] = [
        block(c, [46, 1.2, 26], TOWN.roof, { heading: hd, mat: 'wood' }),
      ];
      for (const k of [-23, 23]) {
        const q = off(c, hd, 0, k);
        const m = post(q[0], q[2], c[1], 1.4, TOWN.timber);
        if (m) parts.push(m);
      }
      put(parts, 7);
    }
  }
  // ---- the moored ferry inside the first stones' curve, the footbridge over 3B ----
  const stones = o.route.filter((e) => e.t === 'jumps' && !e.alt);
  if (stones[0]?.t === 'jumps') {
    const [a, b] = [stones[0].pads[1], stones[0].pads[2]];
    const hd = hdOf({ x: b.at[0] - a.at[0], z: b.at[2] - a.at[2] });
    const m: P3 = [(a.at[0] + b.at[0]) / 2, 0, (a.at[2] + b.at[2]) / 2];
    const c = off(m, hd, 0, 30);
    const cn = o.canals.find(
      (q) => c[0] > q.x0 + 8 && c[0] < q.x1 - 8 && c[2] > q.z0 + 8 && c[2] < q.z1 - 8,
    );
    const y0 = cn ? cn.y - 1 : 150;
    put(
      [
        block([c[0], y0, c[2]], [12, 7, 46], TOWN.timberDark, { heading: hd, mat: 'wood' }),
        block([c[0], y0 + 7, c[2]], [8, 4, 14], TOWN.timber, { heading: hd, mat: 'wood' }),
        block([c[0], y0 + 11, c[2]], [9, 0.8, 15], TOWN.roof, { heading: hd }),
      ],
      6,
    );
  }
  {
    const e = R['3B'];
    const r = ridge(e, 35);
    const hd = hdOf(r.dir);
    const c = off([r.pos.x, r.pos.y + 6.5, r.pos.z], hd, 0, 8);
    const parts: SceneryElement[] = [
      block(c, [44, 1, 4], TOWN.timber, { heading: hd, mat: 'wood', solid: true }),
    ];
    for (const s of [-1.8, 1.8])
      parts.push(
        block(off(c, hd, s, 0, 1), [44, 1, 0.3], TOWN.timberDark, { heading: hd, mat: 'wood' }),
      );
    put(parts, 5);
  }

  // ---- the fountain in the lantern court (inside the 180°, left of the rider all the way) ----
  {
    const e = R['4A'];
    const r = ridge(e, (e.lead ?? 0) + 50);
    const hd = hdOf(r.dir);
    const c = off([r.pos.x, 0, r.pos.z], hd, 0, 60);
    const cn = o.canals
      .filter((q) => c[0] > q.x0 && c[0] < q.x1 && c[2] > q.z0 && c[2] < q.z1)
      .sort((u, v) => v.y - u.y)[0];
    const y0 = cn ? cn.y - 1 : r1(r.pos.y - 40);
    const parts: SceneryElement[] = [];
    if (!cn)
      parts.push({ t: 'island', at: [c[0], y0, c[2]], size: [34, 34], depth: 30, style: 'stone' });
    parts.push(block([c[0], y0, c[2]], [6, 16, 6], TOWN.stone, { round: true, solid: true }));
    parts.push(block([c[0], y0 + 16, c[2]], [3, 2, 3], TOWN.window, { round: true, mat: 'glow' }));
    for (const k of [0, 90, 180, 270])
      parts.push(
        block(off([c[0], y0, c[2]], k, 9), [12, 1.2, 1.2], TOWN.stone, { heading: k + 90 }),
      );
    put(parts, 8, cn ? [] : [[c[0] - 25, y0 - 80, c[2] - 25, c[0] + 25, y0, c[2] + 25]]);
  }

  // ---- the doors: a round moon gate round Door A, a pointed ogee door round Door B ----
  for (const e of o.route) {
    if (e.t !== 'portal') continue;
    const [w, h] = e.size ?? [16, 16];
    const hd = e.heading;
    const parts: SceneryElement[] = [];
    if (!e.alt) {
      // a stepped ring, 12.8 m round the opening's middle, a little behind the frame
      const mid = off(e.at, hd, 2.6, 0, h / 2);
      for (let a = 0; a < 360; a += 22.5) {
        const x = Math.cos(a * DEG) * 12.8;
        const y = Math.sin(a * DEG) * 12.8;
        parts.push(
          block(off(mid, hd, 0, x, y - 1.1), [2.2, 2.2, 1.2], DOOR_A.color, {
            heading: hd,
            mat: 'glow',
          }),
        );
      }
    } else {
      // tall posts and a pointed arch over the lintel
      const glow = { heading: hd, mat: 'glow' as const };
      for (const k of [-1, 1]) {
        parts.push(
          block(off(e.at, hd, 2.6, k * (w / 2 + 2)), [1.6, h + 2, 1.2], DOOR_B.color, glow),
        );
        for (let i = 0; i < 4; i++)
          parts.push(
            block(
              off(e.at, hd, 2.6, k * (w / 2 + 1 - i * 2.4), h + 2 + i * 1.6),
              [2, 1.6, 1.2],
              DOOR_B.color,
              glow,
            ),
          );
      }
      parts.push(block(off(e.at, hd, 2.6, 0, h + 2 + 6.4), [1.6, 2.4, 1.2], DOOR_B.color, glow));
      // the balcony it stands on and the corner house under it
      const bal = off(e.at, hd, 0, -3, -1.6);
      parts.push(block(bal, [12, 0.8, 8], TOWN.timber, { heading: hd, mat: 'wood' }));
      // (standing on the canal or terrace under it, up to the balcony)
      const foot = off(bal, hd, 9);
      const g = groundUnder(foot[0] - 9, foot[2] - 9, foot[0] + 9, foot[2] + 9, bal[1] - 3);
      const tall = r1(Math.min(14, bal[1] - 0.8 - g));
      const house: P3 = [foot[0], r1(bal[1] - 0.8 - tall), foot[2]];
      parts.push(block(house, [16, tall, 12], TOWN.timber, { heading: hd, mat: 'wood' }));
      for (const k of tall > 7 ? [-4, 4] : [])
        parts.push(
          block(off(house, hd, -6.14, k, tall - 5), [2, 2.4, 0.12], TOWN.window, {
            heading: hd,
            mat: 'glow',
          }),
        );
    }
    put(parts, 0);
  }

  // ---- the open arcade over the last of 6C, into the festival square ----
  {
    const e = R['6C'];
    const L = curvePath(e).length;
    const side = e.side === 'right' ? 1 : -1;
    for (let s = L - 50; s < L; s += 16) {
      const r = ridge(e, s);
      const hd = hdOf(r.dir);
      const c = off([r.pos.x, r.pos.y + 9, r.pos.z], hd, 0, side * 6);
      const parts: SceneryElement[] = [
        block(c, [44, 1, 16], TOWN.roof, { heading: hd, mat: 'wood' }),
      ];
      for (const k of [-21, 21]) {
        const q = off(c, hd, 0, k);
        const m = post(q[0], q[2], c[1], 1.6, TOWN.timber);
        if (m) parts.push(m);
      }
      put(parts, 7);
    }
  }

  // ---- the landmark: the great paper lantern over the finish, hung from four timber masts ----
  const fin = o.route.find((e) => e.t === 'gate' && e.finish);
  if (fin?.t === 'gate') {
    const cx = fin.at[0];
    const cz = fin.at[2];
    const yb = fin.at[1] + fin.size[1] + 18;
    const tiers = [10, 16, 20, 22, 22, 20, 16, 10];
    const parts: SceneryElement[] = [];
    let y = yb;
    parts.push(
      block([cx, y - 1.2, cz], [8, 1.2, 8], TOWN.timberDark, { round: true, mat: 'wood' }),
    );
    tiers.forEach((w, i) => {
      parts.push(
        block([cx, y, cz], [w, 3, w], i % 2 ? TOWN.paper : TOWN.paperDim, {
          round: true,
          mat: 'glow',
        }),
      );
      y += 3;
    });
    parts.push(block([cx, y, cz], [8, 1.2, 8], TOWN.timberDark, { round: true, mat: 'wood' }));
    const yf = y + 1.2 + 8;
    parts.push(block([cx, y + 1.2, cz], [0.5, 8, 0.5], TOWN.timberDark, { mat: 'wood' }));
    // the tassel under it (amber, never red)
    parts.push(block([cx, yb - 1.2 - 4, cz], [0.8, 4, 0.8], TOWN.window, { mat: 'glow' }));
    for (const hd of [0, 90])
      parts.push(
        block([cx, yf, cz], [84, 1.4, 1.4], TOWN.timberDark, { heading: hd, mat: 'wood' }),
      );
    for (const [dx, dz] of [
      [41, 0],
      [-41, 0],
      [0, 41],
      [0, -41],
    ]) {
      const m = post(cx + dx, cz + dz, yf, 2.2, TOWN.timber);
      if (m) parts.push(m);
    }
    put(parts, 4);
  }

  // ---- gate lanterns (warm, on top of the arch: never on a usable edge) ----
  for (const e of o.route) {
    if (e.t !== 'gate' || e.finish) continue;
    const [w, h] = e.size;
    for (const k of [-1, 1])
      out.push({ t: 'lantern', at: off(e.at, e.heading, 0, k * (w / 2 + 0.6), h + 1.3) });
  }

  // ---- timber houses on stone terraces along the canals, their windows lit ----
  let n = 0;
  for (const [name, e] of Object.entries(R)) {
    const path = curvePath(e);
    const side = e.side === 'right' ? 1 : -1;
    for (let s = 20; s < path.length - 10 && n < 46; s += 44) {
      const r = path.at(s);
      const hd = hdOf(r.dir);
      const k = (name.charCodeAt(0) * 7 + Math.round(s)) % 3;
      const spots: [number, number, number, number][] = [
        [-side * (30 + k * 4), 14, 12, 9],
        [side * (44 + k * 3), 12, 14, 11],
      ];
      for (const [dist, w, d, hh] of spots) {
        const c = off([r.pos.x, r.pos.y - 14 - k * 3, r.pos.z], hd, 0, dist);
        const parts: SceneryElement[] = [
          { t: 'island', at: c, size: [w + 6, d + 6], depth: 14, style: 'stone', heading: hd },
          block(c, [w, hh, d], TOWN.timber, { heading: hd, mat: 'wood' }),
          block(off(c, hd, 0, 0, hh), [w + 1.6, 1.4, d + 1.6], TOWN.roof, { heading: hd }),
          block(off(c, hd, 0, 0, hh + 1.4), [w * 0.6, 1.6, d + 1.6], TOWN.roof, { heading: hd }),
        ];
        for (const f of [-1, 1])
          for (const x of [-w / 4, w / 4])
            for (const y of [2.5, 6.2])
              if (y < hh - 1.5)
                parts.push(
                  block(off(c, hd, f * (d / 2 + 0.14), x, y), [2, 1.8, 0.12], TOWN.window, {
                    heading: hd,
                    mat: 'glow',
                  }),
                );
        const ext = Math.max(w, d) * 0.72 + 5;
        const isle: Bounds = [
          c[0] - ext,
          c[1] - 40,
          c[2] - ext,
          c[0] + ext,
          c[1] + 0.1,
          c[2] + ext,
        ];
        if (put(parts, 14, [isle])) n++;
      }
    }
  }
  return out;
};

/** The course data (pure JSON). */
export const lanternCanalCourse = (): CourseData => {
  const p = new Pen([-330, 400, -100], 0);
  const forks: CourseFork[] = [];
  const ramps: Record<string, CurveEl> = {};
  const ramp = (name: string): CurveEl => (ramps[name] = lastCurve(p));
  p.start([16, 16]);
  p.platform([10, 12], 'strafe');

  // ---- 1 Outer quay (up the west quay, round the north-west corner, east along the north) ----
  p.move(12, -6).curve({
    legs: [straight(130, 3.5), arc(90, 150, 6), straight(250, 6)],
    ...BROAD,
    side: 'right',
    color: TIMBER[0],
  });
  ramp('1A');
  p.move(4, -2).anchor('Bridge Pier', BAY, [16, 14]);
  // the first bank-to-bank transfer; a broad outside bend round the north-east corner
  p.move(11, -3, 9).curve({
    legs: [straight(200, 5), arc(90, 150, 6), straight(20, 1)],
    ...WIDE,
    side: 'left',
    color: TIMBER[0],
  });
  ramp('1B');
  p.move(6, -2).gate([24, 18], 'Quay Bridge', BAY);

  // ---- 2 Covered docks (south down the east side) ----
  p.move(14, -5, -9).curve({
    legs: [straight(10, 0.5), arc(40, 220, 5), straight(40, 2)],
    ...STD,
    side: 'right',
    color: TIMBER[1],
  });
  ramp('2A');
  p.move(4, -2).anchor('Beam Bay', BAY, [16, 14]);
  // under the tie beam (generous clearance), then a climb to the lip
  p.move(11, -3, 9).curve({
    legs: [straight(20, 0.5), arc(-40, 220, 5), straight(20, 1), straight(60, -8)],
    ...STD,
    side: 'left',
    color: TIMBER[1],
  });
  ramp('2B');
  p.move(4, -1).anchor('Open Dock', BAY, [16, 14]);
  // the rising transfer out of the roof into the open dock (the dock lock below is red)
  p.move(12, -1, -9).curve({
    legs: [straight(30, 1), arc(90, 120, 7)],
    ...WIDE,
    side: 'right',
    color: TIMBER[1],
  });
  ramp('2C');
  p.move(6, -2).gate([24, 18], 'Dock Gate', { flightSec: 1.1, up: 10 });

  // ---- 3 Ferry stones (west along the south side, then north up the west side) ----
  p.move(14, -5, 9).curve({
    legs: [straight(200, 5.5), arc(-30, 150, 2.5), straight(70, -10)],
    ...STD,
    side: 'left',
    color: TIMBER[2],
  });
  ramp('3A');
  p.move(4, -1).anchor('Ferry Steps', BAY, [16, 14]);
  // four ferry stones curving round the moored ferry
  p.move(20, -5, -3).bhopPads(
    [
      { d: 0, size: [10, 20] },
      { d: 20, turn: 15, rise: -1 },
      { d: 20.5, turn: 15, rise: -1 },
      { d: 21, turn: 15, rise: -1 },
    ],
    [9, 12],
  );
  const stones1 = p.route[p.route.length - 1];
  p.move(16, -2, -3).curve({
    legs: [straight(40, 2.5), arc(30, 120, 2.5), straight(40, -5)],
    ...BROAD,
    side: 'right',
    color: TIMBER[2],
  });
  ramp('3B');
  p.move(4, -1).anchor('Ferry Walk', BAY, [16, 14]);
  p.move(18, -4, 3).bhopPads(
    [
      { d: 0, size: [10, 18] },
      { d: 19.5, turn: 20, rise: -1 },
      { d: 20, turn: 20, rise: -1 },
    ],
    [9, 14],
  );
  const stones2 = p.route[p.route.length - 1];
  p.move(16, -2, 3).curve({
    legs: [straight(180, 9.5), straight(40, 1.5)],
    ...BROAD,
    side: 'left',
    color: TIMBER[2],
  });
  ramp('3C');
  // the dockside paths: a walk beside each phrase of stones (quay side, lower), a launch at its
  // end boards the next bank — the slow way for a lost rhythm
  const dockside = (
    stones: RouteElement,
    side: number,
    board: CurveEl,
    s: number,
    name: string,
  ): void => {
    if (stones.t !== 'jumps') return;
    const walk: P3[] = stones.pads.map((q) => {
      const h = (q.heading ?? 0) * DEG;
      return [
        r1(q.at[0] + Math.cos(h) * 11 * side),
        r1(q.at[1] - 2.5),
        r1(q.at[2] + Math.sin(h) * 11 * side),
      ];
    });
    const w = walk[walk.length - 1];
    const to = rideAt(board, s, 0.35);
    // (the launch pad on the way from the walk's end to the landing: walked straight over)
    const dx = to[0] - w[0];
    const dz = to[2] - w[2];
    const dl = Math.hypot(dx, dz);
    const end: P3 = [r1(w[0] + (dx / dl) * 10), w[1], r1(w[2] + (dz / dl) * 10)];
    const edge: P3 = [r1(w[0] + (dx / dl) * 6.1), w[1], r1(w[2] + (dz / dl) * 6.1)];
    p.branch((b) => {
      for (let i = 1; i < walk.length; i++)
        b.route.push({ t: 'path', from: walk[i - 1], to: walk[i], width: 3 });
      // (a hand's breadth past the joint: the turned walk never cuts into the one before)
      const w0: P3 = [r1(w[0] + (dx / dl) * 0.4), w[1], r1(w[2] + (dz / dl) * 0.4)];
      b.route.push({ t: 'path', from: w0, to: edge, width: 3 });
      b.route.push({ t: 'launch', at: end, to, flightSec: 1.1 });
    });
    forks.push({
      name,
      safe: 'hop the ferry stones',
      risky: 'walk the dockside path beside them; its launch boards the next bank',
      salvage: true,
      line: [
        ...[...walk, end].map((at) => ({ at })),
        { at: to, surf: true },
        { at: rideAt(board, s + 40, 0.35), surf: true },
      ],
    });
  };
  dockside(stones1, 1, ramps['3B'], 26, 'Dockside path (first stones)');
  dockside(stones2, -1, ramps['3C'], 34, 'Dockside path (second stones)');
  p.move(6, -2).gate([22, 16], 'Ferry Arch', BAY);

  // ---- 4 Lantern court (a 180° round the fountain, across the court, the second ring) ----
  p.move(8, -3, -9).curve({
    legs: [straight(50, 2), arc(180, 60, 8.5), straight(15, -2)],
    ...WIDE,
    side: 'right',
    color: TIMBER[3],
  });
  ramp('4A');
  p.move(4, -0.5).anchor('Pavilion', BAY, [18, 16]);
  const crossFrom = p.here();
  // the crossing: over the fountain's red basin onto the broad lower catch of 4B
  p.move(36, -10.5, 6).curve({
    legs: [straight(170, 4), arc(-85, 90, 5.5), straight(50, 1)],
    ...BROAD,
    side: 'left',
    color: TIMBER[3],
  });
  ramp('4B');
  p.move(4, -2).anchor('Colonnade', BAY, [16, 14]);
  p.move(10, -3, -9).curve({
    legs: [straight(40, 1), arc(25, 150, 3), arc(-25, 150, 3), straight(60, 2)],
    ...STD,
    side: 'right',
    color: TIMBER[3],
  });
  ramp('4C');
  p.move(6, -2).gate([24, 18], 'Fountain Exit', BAY);

  // ---- 5 Twin doors ----
  // the lock ramp into Door A (the teal moon gate): it turns you north and lifts you 60 m to
  // the upper town, coming out level
  p.move(14, -5, 9).curve({
    legs: [straight(130, 4)],
    ...STD,
    side: 'left',
    color: TIMBER[4],
  });
  ramp('5L');
  p.move(4, -2).anchor('Door A', BAY, [16, 14]);
  const doorAAt = p.relP(18);
  const doorAExit: P3 = p.relP(-20, -40, 60);
  p.airPortal(18, doorAExit, -90, [16, 16], { ...DOOR_A, vertical: 'zero' });
  // a long settling ramp (Door B on its balcony ahead-left), climbing to a lip
  p.move(14, -5).curve({
    lead: 14,
    legs: [straight(190, 2), arc(15, 300, 1), straight(60, 3.5), straight(60, -7)],
    ...WIDE,
    side: 'right',
    color: TIMBER[4],
  });
  ramp('5A');
  const lip = { pos: p.pos, heading: p.heading };
  p.move(4, -1).anchor('Balcony', BAY, [18, 16]);
  // main: the bend round the corner house, then the merge ramp
  p.move(12, -1, 9).curve({
    legs: [straight(20, 0.5), arc(-105, 90, 6), straight(70, 2)],
    ...WIDE,
    side: 'left',
    color: TIMBER[4],
  });
  ramp('5B');
  p.move(18, -6, -13).curve({
    lead: 50,
    legs: [straight(140, 4)],
    ...WIDE,
    side: 'right',
    color: TIMBER[4],
  });
  ramp('5C');
  // Door B (optional, the paper-white ogee door on the balcony): best from 5A's upper band,
  // strafe left off the lip into it; it turns you -85° and puts you out level over 5C's lead-in
  const doorBExit = rideAt(ramps['5C'], 14, 0.3);
  doorBExit[1] = r1(doorBExit[1] + 2.5);
  let doorBAt: P3 = [0, 0, 0];
  p.branch((b) => {
    b.pos = lip.pos;
    b.heading = lip.heading;
    b.move(0, -1.3, -12);
    doorBAt = b.relP(32);
    b.airPortal(32, doorBExit, -85, [16, 16], { ...DOOR_B, vertical: 'zero' });
  });
  forks.push({
    name: 'Door B (balcony door)',
    safe: 'ride the bend canal round the corner house (5B) onto the merge ramp',
    risky: "hold 5A's upper band, strafe left off the lip through the balcony door",
    line: [
      { at: rideAt(ramps['5A'], -30, 0.2), surf: true },
      { at: rideAt(ramps['5A'], -2, 0.15), surf: true },
      { at: doorBAt, portal: true },
      { at: doorBExit, air: true },
      { at: rideAt(ramps['5C'], 40, 0.35), surf: true },
      { at: rideAt(ramps['5C'], 70, 0.35), surf: true },
    ],
  });
  p.move(6, -2).gate([24, 18], 'Twin-Door Merge', BAY);

  // ---- 6 Festival run (three broad curves into the festival square) ----
  p.move(14, -5, 9).curve({
    legs: [straight(30, 1), arc(-90, 130, 8.5), straight(20, 1)],
    ...BROAD,
    side: 'left',
    color: TIMBER[5],
  });
  ramp('6A');
  p.move(4, -2).anchor('Lantern Street', BAY, [16, 14]);
  p.move(11, -3, -9).curve({
    legs: [straight(30, 1), arc(-90, 120, 7), straight(40, 1)],
    ...WIDE,
    side: 'right',
    color: TIMBER[5],
  });
  ramp('6B');
  p.move(4, -2).anchor('Arcade', BAY, [16, 14]);
  // the graceful one: longer, over the festival sluice
  p.move(20, -6, 12).curve({
    legs: [straight(20, 1), arc(60, 110, 5), straight(80, 2.5)],
    ...WIDE,
    side: 'left',
    color: TIMBER[5],
  });
  ramp('6C');
  p.move(8, -2).finishGate([24, 20], 30, 10);

  const base = {
    name: 'Lantern Canal',
    kind: 'surf' as const,
    mode: 'beginner' as const,
    profile: 'MOVEMENT_PROFILE v1',
    parSec: 180,
    palette: PALETTE,
    sky: {
      top: 0x0e1430,
      horizon: 0x242f52,
      ground: 0x151c38,
      sun: { dir: [0.45, 0.16, 0.7] as P3, color: 0xf2b85e, sizeDeg: 2.5 },
      sunLight: 0xd8c2a0,
      stars: true,
      fog: { near: 150, far: 700 },
      ambient: 0.95,
    },
    roomMat: 'wood' as const,
    killY: 152,
    floors: [],
  };

  // ---- the canals, the sluices and the bank routes (fitted to the route built above) ----
  const solids = expandCourse(p.course({ ...base, scenery: [] }))
    .def.boxes.filter((b) => !b.noCollide)
    .map(boundsOf);
  const canals = planCanals(p.route, solids);
  const levelAt = (x: number, z: number, near: number): Canal | undefined =>
    canals
      .filter((c) => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1)
      .sort((a, b) => Math.abs(a.y - near) - Math.abs(b.y - near))[0];
  const extra: RouteElement[] = [];
  const scenery: SceneryElement[] = [];
  for (const c of canals)
    scenery.push({
      t: 'water',
      at: [r1((c.x0 + c.x1) / 2), c.y, r1((c.z0 + c.z1) / 2)],
      size: [r1(c.x1 - c.x0), r1(c.z1 - c.z0)],
      shallow: true,
    });
  /** A red sluice (deep water) on the canal floor round `mid`: [width x, depth z]. */
  const sluice = (at: P3, size: [number, number]): void => {
    const c = levelAt(at[0], at[2], at[1] - 20);
    if (!c) return;
    // (inside its own canal stretch: never into a neighbour's floor)
    let x0 = Math.max(c.x0 + 0.5, at[0] - size[0] / 2);
    let x1 = Math.min(c.x1 - 0.5, at[0] + size[0] / 2);
    let z0 = Math.max(c.z0 + 0.5, at[2] - size[1] / 2);
    let z1 = Math.min(c.z1 - 0.5, at[2] + size[1] / 2);
    // (and clear of any higher stretch of canal over it: cut back the side that loses least)
    for (const o of canals) {
      if (o.y <= c.y || !(o.x0 < x1 && o.x1 > x0 && o.z0 < z1 && o.z1 > z0)) continue;
      const cuts = [
        { k: 'x0', v: o.x1 + 0.5, loss: o.x1 + 0.5 - x0 },
        { k: 'x1', v: o.x0 - 0.5, loss: x1 - (o.x0 - 0.5) },
        { k: 'z0', v: o.z1 + 0.5, loss: o.z1 + 0.5 - z0 },
        { k: 'z1', v: o.z0 - 0.5, loss: z1 - (o.z0 - 0.5) },
      ].sort((u, w) => u.loss - w.loss)[0];
      if (cuts.k === 'x0') x0 = cuts.v;
      else if (cuts.k === 'x1') x1 = cuts.v;
      else if (cuts.k === 'z0') z0 = cuts.v;
      else z1 = cuts.v;
    }
    if (x1 - x0 < 8 || z1 - z0 < 8) return;
    const red: RedEl = {
      t: 'red',
      at: [r1((x0 + x1) / 2), r1(c.y - 1), r1((z0 + z1) / 2)],
      size: [r1(x1 - x0), 1.3, r1(z1 - z0)],
      heading: 0,
    };
    extra.push(red);
  };
  const mid = (a: P3, b: P3): P3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  // DS1: the dock lock under the rising transfer
  sluice(mid(rideAt(ramps['2B'], -1, 0.35), rideAt(ramps['2C'], 8, 0.35)), [30, 40]);
  // the fountain's deep central basin under the court crossing
  sluice(mid(crossFrom, rideAt(ramps['4B'], 8, 0.35)), [44, 26]);
  // DS2: the lock chamber under the lock ramp, up to Door A
  sluice(mid(rideAt(ramps['5L'], 30, 0.6), doorAAt), [150, 30]);
  // DS3: the festival sluice under the graceful transfer
  sluice(mid(rideAt(ramps['6B'], -1, 0.35), rideAt(ramps['6C'], 8, 0.35)), [36, 30]);

  // bank routes: launch pads in the canal throwing you back onto the bank above, ahead
  const reds = extra.filter((r): r is RedEl => r.t === 'red');
  const clearOfRed = (x: number, z: number): boolean =>
    reds.every(
      (r) => Math.abs(x - r.at[0]) > r.size[0] / 2 + 4 || Math.abs(z - r.at[2]) > r.size[2] / 2 + 4,
    );
  const bankForks: Record<string, string> = {
    '1B': 'Quay canal bank route',
    '2A': 'Dock water bank route',
    '4B': 'Court plaza bank route',
    '5B': 'Bend canal bank route',
    '6A': 'Festival canal bank route',
  };
  for (const [name, e] of Object.entries(ramps)) {
    const path = curvePath(e);
    const L = path.length - (e.lead ?? 0);
    const face = e.side === 'left' ? -1 : 1;
    const at = L > 260 ? [0.2, 0.6] : [0.3];
    at.forEach((k, n) => {
      const s = (e.lead ?? 0) + L * k;
      const r = path.at(s);
      const foot = curveRidePoint(e, r, face > 0 ? 'right' : 'left', 1);
      const ox = face * -r.dir.z;
      const oz = face * r.dir.x;
      // (well out from the foot: the throw comes in over the face, never under the bank)
      const x = foot.x + ox * 14;
      const z = foot.z + oz * 14;
      const c = levelAt(x, z, foot.y);
      if (!c || !clearOfRed(x, z) || s + 40 > path.length) return;
      const pad: P3 = [r1(x), r1(c.y - 1), r1(z)];
      const to = rideAt(e, s + 34, 0.3);
      const launch: LaunchEl = {
        t: 'launch',
        at: pad,
        to,
        flightSec: 1.4,
        base: false,
        alt: true,
      };
      extra.push(launch);
      scenery.push({
        t: 'lamp',
        at: [r1(x + ox * 3), r1(c.y - 1), r1(z + oz * 3)],
        color: 0x7fe0da,
        height: 4,
      });
      if (n === 0 && bankForks[name])
        forks.push({
          name: bankForks[name],
          safe: 'make the transfer',
          risky: 'fall into the shallow canal, wade to the lamp and take its launch back up',
          salvage: true,
          line: [
            { at: [r1(x - r.dir.x * 12), r1(c.y - 1), r1(z - r.dir.z * 12)] },
            { at: pad },
            { at: to, surf: true },
            { at: rideAt(e, s + 90 < path.length ? s + 90 : -2, 0.35), surf: true },
          ],
        });
    });
  }
  // (before the finish gate: the route ends with it)
  p.route.splice(p.route.length - 1, 0, ...extra);

  // ---- the town round it all (fitted to everything built so far) ----
  const valley: SceneryElement = { t: 'water', at: [0, 150, 0], size: [2000, 2000] };
  const built = expandCourse(p.course({ ...base, scenery: [valley, ...scenery], forks })).def;
  const race = built.race!;
  scenery.push(
    ...town({
      ramps,
      route: p.route,
      boxes: built.boxes,
      line: [
        ...race.line.map((q) => q.pos),
        ...(race.forks ?? [])
          .filter((q) => q.name.startsWith('Door'))
          .flatMap((q) => q.riskyLine.map((n) => n.pos)),
      ],
      canals,
    }),
  );

  return p.course({
    ...base,
    scenery: [valley, ...scenery],
    forks,
  });
};
