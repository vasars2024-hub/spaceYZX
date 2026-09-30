// Curved surf ramps (course element `curve`, ./types.ts CurveEl): a ridge line that bends,
// spirals, drops and climbs smoothly, built as free-form prisms (BoxDef.hull) whose neighbours
// share the exact corners of their joint — the faces meet edge to edge, so there is no lip, no
// gap and no seam to catch on (tests: packages/shared/test/surf-collision.test.ts).
//
// The ridge is a turtle path: from `at` heading `heading`, each leg a straight (`len`) or an arc
// (`turn` degrees at `radius`, a spiral when `toRadius` differs), all measured flat. Its height
// drops `drop` per leg; between legs the heights join with matching slopes (a cubic Hermite
// through the leg ends), so a drop followed by a climb is a smooth vertical scoop. Each cross
// section is the ramp's profile at right angles to the ridge: `side` 'right' is a wedge whose
// face falls to the right of the way (a vertical back under the ridge), 'left' the mirror,
// 'both' an A-frame. A curve turning toward its face holds you in the turn like a banked track.
//
// Pieces are short enough that neighbouring faces differ by at most CURVE_MAX_TURN degrees:
// velocity is clipped at every joint (the sim's contact rule), so a polygonal curve costs about
// turn × piece-turn × sin²(face) / 2 of your speed — at 1° pieces well under 2 % per 90°.
import type { Vec3 } from '../../math/vec3';
import { v3, add, sub, scale, madd, normalize, cross, dot, UP } from '../../math/vec3';
import type { BoxDef, RaceLineNode } from '../types';
import type { CurveEl, CurveLeg } from './types';

const DEG = Math.PI / 180;

/** The largest turn between neighbouring pieces (degrees). */
export const CURVE_MAX_TURN = 1;
/** The longest piece (metres, along the ridge; straight pieces join flush, so they may be long). */
export const CURVE_MAX_PIECE = 10;
/** The largest change of the ridge's slope between neighbouring pieces (degrees). */
export const CURVE_MAX_PITCH = 1;
/** Racing-line points along a curve: about this far apart (metres). */
export const CURVE_LINE_STEP = 3;

/** Snap to 1 mm (neighbouring pieces then share bit-identical corners). */
const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const snap = (v: Vec3): Vec3 => v3(r3(v.x), r3(v.y), r3(v.z));

/** A point of the ridge: where, which way (unit, flat), how steep (dy per flat metre). */
export interface RidgePoint {
  pos: Vec3;
  dir: Vec3;
  grade: number;
  /** flat distance from the start */
  s: number;
  /** the leg it is on */
  leg: number;
}

interface LegPlan {
  leg: CurveLeg;
  s0: number;
  length: number;
  /** curvature (1/m, + = right) at the leg's start and end (spirals change it linearly) */
  k0: number;
  k1: number;
}

/** A leg's flat length and curvature. */
const planLeg = (leg: CurveLeg, s0: number): LegPlan => {
  if (leg.turn !== undefined && leg.turn !== 0) {
    const r0 = Math.max(1, leg.radius ?? 20);
    const r1 = Math.max(1, leg.toRadius ?? r0);
    const a = Math.abs(leg.turn) * DEG;
    // (a spiral's radius changes linearly along it: it turns ∫ ds / r = L ln(r1 / r0) / (r1 - r0))
    const length = Math.abs(r1 - r0) < 1e-6 ? a * r0 : (a * (r1 - r0)) / Math.log(r1 / r0);
    const sign = leg.turn > 0 ? 1 : -1;
    return { leg, s0, length, k0: sign / r0, k1: sign / r1 };
  }
  return { leg, s0, length: Math.max(0.1, leg.len ?? 10), k0: 0, k1: 0 };
};

/**
 * The ridge path of a curve: `at(s)` for flat distance s (0..length), plus the leg ends. Pure
 * and deterministic (the same numbers on the server and every client).
 */
export const curvePath = (e: Pick<CurveEl, 'at' | 'heading' | 'legs'>) => {
  const plans: LegPlan[] = [];
  let s = 0;
  for (const leg of e.legs) {
    const p = planLeg(leg, s);
    plans.push(p);
    s += p.length;
  }
  const length = s;
  // heights at the leg ends and the slopes there (the mean of the legs meeting at a joint)
  const ys = [e.at[1]];
  for (const p of plans) ys.push(ys[ys.length - 1] - (p.leg.drop ?? 0));
  const legSlope = plans.map((p, i) => (ys[i + 1] - ys[i]) / p.length);
  const knotSlope = ys.map((_, i) =>
    i === 0
      ? legSlope[0]
      : i === plans.length
        ? legSlope[i - 1]
        : (legSlope[i - 1] + legSlope[i]) / 2,
  );
  // integrate the heading along the flat path in small fixed steps (exact per step)
  const STEP = 0.25;
  const steps = Math.max(1, Math.ceil(length / STEP));
  const h = length / steps;
  const xs: number[] = [e.at[0]];
  const zs: number[] = [e.at[2]];
  const hs: number[] = [e.heading * DEG];
  let x = e.at[0];
  let z = e.at[2];
  let head = e.heading * DEG;
  let li = 0;
  for (let i = 0; i < steps; i++) {
    const sm = (i + 0.5) * h;
    while (li < plans.length - 1 && sm > plans[li].s0 + plans[li].length) li++;
    const p = plans[li];
    const u = Math.max(0, Math.min(1, (sm - p.s0) / p.length));
    // a spiral: the radius (not the curvature) changes linearly with the distance
    const k = p.k0 === 0 ? 0 : 1 / (1 / p.k0 + (1 / p.k1 - 1 / p.k0) * u);
    const mid = head + (k * h) / 2;
    x += Math.sin(mid) * h;
    z -= Math.cos(mid) * h;
    head += k * h;
    xs.push(x);
    zs.push(z);
    hs.push(head);
  }
  const legAt = (sv: number): number => {
    let i = 0;
    while (i < plans.length - 1 && sv > plans[i].s0 + plans[i].length - 1e-9) i++;
    return i;
  };
  /** height and slope at flat distance sv (cubic Hermite per leg) */
  const heightAt = (sv: number): [number, number] => {
    const i = legAt(sv);
    const p = plans[i];
    const t = Math.max(0, Math.min(1, (sv - p.s0) / p.length));
    const y0 = ys[i];
    const y1 = ys[i + 1];
    const m0 = knotSlope[i] * p.length;
    const m1 = knotSlope[i + 1] * p.length;
    const t2 = t * t;
    const t3 = t2 * t;
    const y =
      (2 * t3 - 3 * t2 + 1) * y0 +
      (t3 - 2 * t2 + t) * m0 +
      (-2 * t3 + 3 * t2) * y1 +
      (t3 - t2) * m1;
    const dy =
      (6 * t2 - 6 * t) * y0 +
      (3 * t2 - 4 * t + 1) * m0 +
      (-6 * t2 + 6 * t) * y1 +
      (3 * t2 - 2 * t) * m1;
    return [y, dy / p.length];
  };
  const at = (sv: number): RidgePoint => {
    const c = Math.max(0, Math.min(length, sv));
    const f = c / h;
    const i = Math.min(steps - 1, Math.floor(f));
    const u = f - i;
    // (between two integration points: along the step, heading interpolated)
    const hd = hs[i] + (hs[i + 1] - hs[i]) * u;
    const px = xs[i] + (xs[i + 1] - xs[i]) * u;
    const pz = zs[i] + (zs[i + 1] - zs[i]) * u;
    const [y, grade] = heightAt(c);
    return {
      pos: v3(px, y, pz),
      dir: v3(Math.sin(hd), 0, -Math.cos(hd)),
      grade,
      s: c,
      leg: legAt(c),
    };
  };
  return { at, length, plans };
};

/** The ramp's frame at a ridge point: along the ridge (3D), up (at right angles), right. */
export const curveFrame = (r: RidgePoint) => {
  const T = normalize(add(r.dir, v3(0, r.grade, 0)));
  const up = normalize(sub(UP, scale(T, dot(UP, T))));
  const right = cross(T, up);
  return { T, up, right };
};

/** The profile's corners at a ridge point: [base-left, base-right, ridge]. */
const section = (e: CurveEl, r: RidgePoint): [Vec3, Vec3, Vec3] => {
  const { up, right } = curveFrame(r);
  const run = e.height / Math.tan(e.angle * DEG);
  const base = madd(r.pos, up, -e.height);
  if (e.side === 'right') return [base, madd(base, right, run), r.pos];
  if (e.side === 'left') return [madd(base, right, -run), base, r.pos];
  return [madd(base, right, -run), madd(base, right, run), r.pos];
};

/** Where the racing line rides at a ridge point: `depth` down the face `face`, just off it. */
export const curveRidePoint = (
  e: CurveEl,
  r: RidgePoint,
  face: 'left' | 'right',
  depth: number,
): Vec3 => {
  const { up, right } = curveFrame(r);
  const run = e.height / Math.tan(e.angle * DEG);
  const s = face === 'right' ? 1 : -1;
  const foot = madd(madd(r.pos, up, -e.height), right, s * run);
  const p = add(r.pos, scale(sub(foot, r.pos), depth));
  const n = normalize(add(scale(up, run), scale(right, s * e.height)));
  return madd(p, n, 0.05);
};

/** The face the line rides on leg `i` (the latest `ride` set so far, else the element's). */
const faceOn = (e: CurveEl, i: number): 'left' | 'right' => {
  if (e.side !== 'both') return e.side;
  let f = e.ride ?? 'right';
  for (let k = 0; k <= i && k < e.legs.length; k++) f = e.legs[k].ride ?? f;
  return f;
};
const depthOn = (e: CurveEl, i: number): number => {
  let d = e.depth ?? 0.35;
  for (let k = 0; k <= i && k < e.legs.length; k++) d = e.legs[k].depth ?? d;
  return d;
};

export interface BuiltCurve {
  /** the ramp pieces (surf), then the red strip's pieces (kill), if any */
  boxes: BoxDef[];
  /** racing line points on the face (surf nodes), in order */
  nodes: RaceLineNode[];
  /** where the ridge ends, which way */
  end: RidgePoint;
}

/**
 * Build a curve: the pieces (joints at every sample, sharing their corners), the red strip and
 * the racing line. `color` / `trim` / `hazard` are the colours to draw with; `cp` the line's
 * checkpoint section.
 */
export const buildCurve = (
  e: CurveEl,
  look: { color: number; trim: number; hazard: number },
  cp: number,
): BuiltCurve => {
  const path = curvePath(e);
  // the samples: every leg cut finely enough for its turn, its length and its slope changes
  const ss: number[] = [0];
  for (const p of path.plans) {
    // (a spiral turns fastest at its tight end: cut for that)
    const turn = (Math.max(Math.abs(p.k0), Math.abs(p.k1)) * p.length) / DEG;
    const a = path.at(p.s0);
    const b = path.at(p.s0 + p.length);
    const dp = Math.abs(Math.atan(b.grade) - Math.atan(a.grade)) / DEG;
    // (a slope that changes inside a leg: judged from both ends and the middle)
    const m = path.at(p.s0 + p.length / 2);
    const dm = Math.max(
      Math.abs(Math.atan(m.grade) - Math.atan(a.grade)),
      Math.abs(Math.atan(b.grade) - Math.atan(m.grade)),
    );
    const n = Math.max(
      1,
      Math.ceil(turn / CURVE_MAX_TURN),
      Math.ceil(p.length / CURVE_MAX_PIECE),
      Math.ceil(Math.max(dp, (2 * dm) / DEG) / CURVE_MAX_PITCH),
    );
    for (let k = 1; k <= n; k++) ss.push(p.s0 + (p.length * k) / n);
  }
  const pts = ss.map((s) => path.at(s));
  const secs = pts.map((r) => section(e, r).map(snap) as [Vec3, Vec3, Vec3]);
  const boxes: BoxDef[] = [];
  const piece = (a: Vec3[], b: Vec3[], extra: Partial<BoxDef>): BoxDef => {
    const hull = [a[0], a[1], b[0], b[1], a[2], b[2]];
    const lo = v3(Infinity, Infinity, Infinity);
    const hi = v3(-Infinity, -Infinity, -Infinity);
    for (const p of hull) {
      lo.x = Math.min(lo.x, p.x);
      lo.y = Math.min(lo.y, p.y);
      lo.z = Math.min(lo.z, p.z);
      hi.x = Math.max(hi.x, p.x);
      hi.y = Math.max(hi.y, p.y);
      hi.z = Math.max(hi.z, p.z);
    }
    return {
      c: snap(scale(add(lo, hi), 0.5)),
      h: snap(scale(sub(hi, lo), 0.5)),
      hull,
      ...extra,
    };
  };
  for (let i = 0; i + 1 < secs.length; i++)
    boxes.push(
      piece(secs[i], secs[i + 1], { surf: true, mat: 'rock', color: look.color, trim: look.trim }),
    );
  // the red strip: a thin sliver lying on the riding face from depth `red` down to the foot,
  // on the legs that have one
  const redOn = (leg: number): number | null => {
    const r = e.legs[leg]?.red ?? e.red;
    return r === undefined || r === false || r >= 1 ? null : r;
  };
  const sliver = (r: RidgePoint, depth: number): Vec3[] => {
    const face = faceOn(e, r.leg);
    const { up, right } = curveFrame(r);
    const run = e.height / Math.tan(e.angle * DEG);
    const s = face === 'right' ? 1 : -1;
    const foot = madd(madd(r.pos, up, -e.height), right, s * run);
    const n = normalize(add(scale(up, run), scale(right, s * e.height)));
    const top = add(r.pos, scale(sub(foot, r.pos), depth));
    // [base-left, base-right, ridge] of the sliver: the foot on the face, the foot and the
    // strip's top lifted 2 cm off it (never inside the ramp)
    const lifted = madd(foot, n, 0.02);
    const pair = s > 0 ? [foot, lifted] : [lifted, foot];
    return [pair[0], pair[1], madd(top, n, 0.02)].map(snap);
  };
  for (let i = 0; i + 1 < pts.length; i++) {
    const leg = path.at((ss[i] + ss[i + 1]) / 2).leg;
    const depth = redOn(leg);
    if (depth === null) continue;
    boxes.push(
      piece(sliver(pts[i], depth), sliver(pts[i + 1], depth), {
        kill: true,
        mat: 'hazard',
        color: look.hazard,
      }),
    );
  }
  // the racing line: evenly along the ridge, on the face it rides (a spine crossing goes over
  // the ridge where the face changes)
  const nodes: RaceLineNode[] = [];
  const startS = Math.min(path.length, e.lead ?? 0);
  const endS = Math.max(startS, path.length - (e.early ?? 0));
  const n = Math.max(2, Math.ceil((endS - startS) / CURVE_LINE_STEP));
  let lastFace = faceOn(e, 0);
  for (let k = 0; k <= n; k++) {
    const r = path.at(startS + ((endS - startS) * k) / n);
    const face = faceOn(e, r.leg);
    if (face !== lastFace) {
      // up and over the ridge
      nodes.push({ pos: snap(madd(r.pos, UP, 0.3)), cp, strafe: true, surf: true });
      lastFace = face;
    }
    nodes.push({
      pos: snap(curveRidePoint(e, r, face, depthOn(e, r.leg))),
      cp,
      strafe: true,
      surf: true,
    });
  }
  return { boxes, nodes, end: path.at(path.length) };
};

/** How long a curve's ridge is (flat metres) and where it ends (tools, the pen). */
export const curveEnd = (e: Pick<CurveEl, 'at' | 'heading' | 'legs'>): RidgePoint => {
  const p = curvePath(e);
  return p.at(p.length);
};

/** The total turn of a curve (degrees, + = right). */
export const curveTurn = (e: Pick<CurveEl, 'legs'>): number =>
  e.legs.reduce((a, l) => a + (l.turn ?? 0), 0);
