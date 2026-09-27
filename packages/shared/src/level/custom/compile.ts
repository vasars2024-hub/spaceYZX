// Player-made maps (the Map Maker, types.ts) → the game's LevelDef. Pure and deterministic: the
// server and every client compile the same doc into the same level.
//
//   expandCustomBlock   one block → its boxes (curves → straight pieces, materials → the game's)
//   compileCustomMap    a whole doc → a LevelDef (a map of its own, or an edit of a built-in map)
//   applyCustomPatch    an edit (doc.patch) on top of an already-built built-in map
//   levelToCustomMap    any built-in map → a doc (start a new map from a copy)
//
// Block frames: a block's local -z is its front (yaw 0 faces north, -z; yaw 90 faces east, +x),
// +x its right, +y up. Rotation = yaw (around +y), then pitch (around the block's own x:
// positive lifts the front), then roll (around its own z: positive lifts the right side).
// Spawn and gate `yaw` use the same compass headings.
import type { Vec3 } from '../../math/vec3';
import { v3, add, sub, scale, cross, normalize, madd, UP } from '../../math/vec3';
import type { Quat } from '../../math/quat';
import { qFromAxisAngle, qMul, qNormalize, qRotate, qFromBasis, qConj } from '../../math/quat';
import { TICK_RATE } from '../../sim/constants';
import { headingDir, headingYaw } from '../course/expand';
import { MAPS, mapDef, mapDefForSize } from '../maps/index';
import { MATERIAL_COLORS } from '../materials';
import { moverTimeline, timelineAt } from '../movers';
import type {
  BoxDef,
  KillVolumeDef,
  LaunchPadDef,
  LevelDef,
  Material,
  MoverDef,
  OutdoorSkyDef,
  PortalDef,
  RaceDef,
  RaceGateDef,
  RaceLineNode,
  SpawnDef,
} from '../types';
import type {
  BoxFingerprint,
  CustomBlock,
  CustomGate,
  CustomMapDoc,
  CustomMaterial,
  CustomMover,
  CustomPortal,
  CustomShape,
  CustomSky,
} from './types';
import { CUSTOM_MAP_LIMITS, CUSTOM_MAP_VERSION } from './types';

const DEG = Math.PI / 180;

/** Each material's own colour (a block without `color`). */
export const CUSTOM_MATERIAL_COLORS: Record<CustomMaterial, number> = {
  concrete: 0x8c9099,
  metal: 0x5d6b88,
  wood: 0x8a5a3a,
  rock: 0xb5653b,
  sand: 0xd8b27a,
  grass: 0x5e9e48,
  ice: 0xbfe8f7,
  glass: 0x9fd0ff,
  neon: 0x38e8ff,
  killpaint: 0xff1e1e,
};

/** The game material each Map Maker material is drawn with. */
const MAT_OF: Record<CustomMaterial, Material> = {
  concrete: 'panel',
  metal: 'plate',
  wood: 'wood',
  rock: 'rock',
  sand: 'sand',
  grass: 'leaf', // (flat colour + baked light)
  ice: 'paper', // (flat colour + baked light, tinted icy)
  glass: 'skyglass', // see-through, collides like a wall (edges drawn with `trim`)
  neon: 'glow', // full-bright colour
  killpaint: 'glow',
};

/** Edge colour of glass blocks (so a floating glass platform can be seen). */
const GLASS_EDGE = 0xd8f2ff;

/** Kill paint: the slab is at most this thick (m). */
const PAINT_MAX_THICK = 0.3;
/** Quarter pipes: thickness of the curved wall (m). */
const PIPE_THICK = 0.5;
/** Cylinders: spokes (a union of N boxes turned 180/N° apart is a regular 2N-gon). */
const CYL_SPOKES = 6;
/** The player's body (config/movement.ts): the kill volume above kill paint reaches the centre. */
const BODY_HALF = 0.9;
const BODY_RADIUS = 0.4;

const p3 = (a: readonly [number, number, number]): Vec3 => v3(a[0], a[1], a[2]);

/** A block's rotation (yaw, pitch, roll in degrees; undefined = none). */
export const customBlockQuat = (rot?: readonly [number, number, number]): Quat | undefined => {
  if (!rot || (rot[0] === 0 && rot[1] === 0 && rot[2] === 0)) return undefined;
  const yaw = qFromAxisAngle(UP, -rot[0] * DEG);
  const pitch = qFromAxisAngle(v3(1, 0, 0), rot[1] * DEG);
  const roll = qFromAxisAngle(v3(0, 0, 1), rot[2] * DEG);
  return qNormalize(qMul(qMul(yaw, pitch), roll));
};

/** Is this shape built along an arc (several pieces)? */
export const isCurveShape = (s: CustomShape): boolean =>
  s === 'curveSurf' || s === 'curveRamp' || s === 'curvePlatform' || s === 'quarterPipe';

const clampInt = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, Math.round(v)));

/** How far round a curve turns (degrees, signed; quarter pipes: 10..90, default 90). */
const curveAngle = (b: CustomBlock): number => {
  if (b.shape === 'quarterPipe') return Math.max(10, Math.min(90, Math.abs(b.curve?.angle ?? 90)));
  return b.curve?.angle ?? 90;
};

/** Straight pieces a curve is built from. */
const curveSegments = (b: CustomBlock): number => {
  if (b.curve?.segments !== undefined) return clampInt(b.curve.segments, 4, 48);
  if (b.shape === 'quarterPipe') return 8;
  // (a curved surf ramp that climbs, drops or waves needs short pieces: each tilted piece's
  // face shifts a little sideways against the next one's, more the more it turns per piece)
  const hilly = b.shape === 'curveSurf' && (b.curve?.kind === 'wave' || !!b.curve?.rise);
  const turn = Math.ceil(Math.abs(curveAngle(b)) / (hilly ? 3 : 10));
  // a wave needs pieces for its humps too (12 per full wave)
  const waves = b.curve?.kind === 'wave' ? Math.ceil((b.curve.waves ?? 1) * 12) : 0;
  return clampInt(Math.max(turn, waves), 4, 48);
};

/** The biggest wave amplitude anyone may set (m). */
export const WAVE_AMPLITUDE_MAX = 12;
/** Ramps and walkways: a wave never climbs steeper than you can walk (config: 50°). */
const WALK_WAVE_MAX_SLOPE = 50;
/** Curved surf ramps: a wave never climbs steeper than this, however fine its pieces (°). */
const SURF_WAVE_MAX_SLOPE = 30;
/** Curved surf ramps: the biggest step (m) a join may leave on the faces. */
const SURF_MAX_STEP = 0.06;

/** Length of a curve's centre line, measured flat (m). */
const curveLength = (b: CustomBlock): number => {
  const cv = b.curve;
  const r0 = cv?.radius ?? 10;
  const r = cv?.kind === 'spiral' ? (r0 + (cv.endRadius ?? r0)) / 2 : r0;
  return r * Math.abs(curveAngle(b)) * DEG;
};

/**
 * The largest |amplitude| a wave on this block may have (m). The wave (plus `rise`) may climb
 * at most: on ramps and walkways the walkable slope (so the steps its joins leave stay well
 * under the 0.4 m step-up); on a curved surf ramp whatever keeps its joins' steps under
 * SURF_MAX_STEP — each tilted piece's face shifts sideways against the next by about
 * 0.7 × height × sin(slope) × (turn per piece), on top of up to ~0.35 × (turn per piece) from the
 * turn itself (measured; tests/custom-curves) — so more segments or a lower ramp allow a
 * bigger wave. 0 when `rise` alone is that steep. The checker clamps to it and the editor's
 * slider stops at it.
 */
export const maxWaveAmplitude = (b: CustomBlock): number => {
  let maxSlope = WALK_WAVE_MAX_SLOPE * DEG;
  if (b.shape === 'curveSurf') {
    const perPiece = (Math.abs(curveAngle(b)) * DEG) / curveSegments(b);
    const sin = perPiece > 0 ? (SURF_MAX_STEP / perPiece - 0.35) / (0.7 * b.size[1]) : 1;
    maxSlope = Math.min(SURF_WAVE_MAX_SLOPE * DEG, Math.asin(Math.max(0, Math.min(1, sin))));
  }
  const room = Math.tan(maxSlope) * curveLength(b) - Math.abs(b.curve?.rise ?? 0);
  // the steepest point of a sine wave: amplitude × 2π × waves / length
  const amp = room / (2 * Math.PI * (b.curve?.waves ?? 1));
  return Math.max(0, Math.min(WAVE_AMPLITUDE_MAX, Math.floor(amp * 100) / 100));
};

/** Boxes one block expands into (what counts toward CUSTOM_MAP_LIMITS.maxPieces). */
export const blockPieceCount = (b: CustomBlock): number =>
  isCurveShape(b.shape) ? curveSegments(b) : b.shape === 'cylinder' ? CYL_SPOKES : 1;

/** One piece in the block's own frame (centre relative to the block's pos). */
interface Piece {
  c: Vec3;
  h: Vec3;
  q?: Quat;
  prism?: number;
  surf?: boolean;
}

/** Surf prisms have their ridge along local x: turn it to run along the block's z. */
const RIDGE_ALONG_Z = qFromAxisAngle(UP, Math.PI / 2);

const localPieces = (b: CustomBlock): Piece[] => {
  const [sx, sy, sz] = b.size;
  switch (b.shape) {
    case 'box':
      return [{ c: v3(), h: v3(sx / 2, sy / 2, sz / 2) }];
    case 'killpaint':
      return [{ c: v3(), h: v3(sx / 2, Math.min(sy, PAINT_MAX_THICK) / 2, sz / 2) }];
    case 'wedge':
      // a right-angle wedge: the ridge (the high end) at local +z, the slope facing -z
      return [{ c: v3(), h: v3(sx / 2, sy / 2, sz / 2), prism: 1 }];
    case 'surf':
      // an A-frame: the ridge runs along the block's z (its length), faces sloping to ±x
      return [{ c: v3(), h: v3(sz / 2, sy / 2, sx / 2), q: RIDGE_ALONG_Z, prism: 0, surf: true }];
    case 'surfSide':
      // one sloped face, toward the block's +x (right); the back (-x) is vertical
      return [{ c: v3(), h: v3(sz / 2, sy / 2, sx / 2), q: RIDGE_ALONG_Z, prism: -1, surf: true }];
    case 'cylinder': {
      const r = sx / 2;
      const a = Math.PI / (2 * CYL_SPOKES);
      const h = v3(r * Math.cos(a), sy / 2, r * Math.sin(a));
      const out: Piece[] = [];
      for (let j = 0; j < CYL_SPOKES; j++)
        out.push({
          c: v3(),
          h,
          ...(j ? { q: qFromAxisAngle(UP, (j * Math.PI) / CYL_SPOKES) } : {}),
        });
      return out;
    }
    case 'quarterPipe':
      return pipePieces(b);
    default:
      return arcPieces(b);
  }
};

/** The steepness of curved surf faces when none is given (degrees). */
const SURF_STEEPNESS = 55;
/** Curved surf faces are never flatter than this (steeper than the walkable slope, 50°). */
const SURF_MIN_STEEPNESS = 46;
/** Extra overlap (m) where two pieces of a curve meet. */
const JOINT_OVERLAP = 0.02;

/** A point of a curve's centre line: where (block frame; y = height above pos) at 0..1. */
const curvePoint = (b: CustomBlock, u: number): Vec3 => {
  const cv = b.curve;
  const r0 = cv?.radius ?? 10;
  const ang = curveAngle(b);
  const s = ang < 0 ? -1 : 1;
  const A = Math.abs(ang) * DEG;
  const kind = cv?.kind ?? 'arc';
  // a turn around pos: starts `r` to the left (right for a left turn) heading forward (-z)
  const onArc = (r: number, a: number): Vec3 => v3(-s * r * Math.cos(a), 0, -r * Math.sin(a));
  let p: Vec3;
  if (kind === 'sCurve') {
    // half the turn, then the same shape turned half round about the middle point: it turns
    // back and ends heading the way it started
    const half = (t: number): Vec3 => onArc(r0, (A / 2) * t);
    if (u <= 0.5) p = half(u * 2);
    else {
      const m = half(1);
      const q = half(2 - u * 2);
      p = v3(2 * m.x - q.x, 0, 2 * m.z - q.z);
    }
  } else if (kind === 'spiral') {
    const r1 = cv?.endRadius ?? r0;
    p = onArc(r0 + (r1 - r0) * u, A * u);
  } else p = onArc(r0, A * u);
  let y = (cv?.rise ?? 0) * u;
  if (kind === 'wave') y += (cv?.amplitude ?? 0) * Math.sin(2 * Math.PI * (cv?.waves ?? 1) * u);
  p.y = y;
  return p;
};

/** Signed horizontal turn (radians, + = right) from direction a to direction b. */
const turnAngle = (a: Vec3, b: Vec3): number =>
  Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);

/**
 * Curves (curveSurf, curveRamp, curvePlatform): straight pieces between points of the centre
 * line (curvePoint: an arc, an S, a spiral or a wave, rising or dropping `rise`). Where two
 * pieces meet, each reaches past the joint just far enough for their outer edges to meet on the
 * joint's bisector (plus a little overlap), so there are no gaps; on the inside they overlap.
 * The track's top (a surf ramp's base) runs through the centre line.
 */
const arcPieces = (b: CustomBlock): Piece[] => {
  const cv = b.curve;
  const w = b.size[0];
  const n = curveSegments(b);
  const surf = b.shape === 'curveSurf';
  const bank = surf ? 0 : Math.max(-45, Math.min(45, cv?.bank ?? 0)) * DEG;
  const turnSign = curveAngle(b) < 0 ? -1 : 1;
  // a surf ramp: its faces' steepness sets its width from its height (size x is not used)
  const height = b.size[1];
  const steep = Math.max(SURF_MIN_STEEPNESS, Math.min(80, cv?.steepness ?? SURF_STEEPNESS));
  const width = surf ? (2 * height) / Math.tan(steep * DEG) : w;
  const pts: Vec3[] = [];
  for (let k = 0; k <= n; k++) pts.push(curvePoint(b, k / n));
  const dirs: Vec3[] = [];
  const runs: number[] = [];
  for (let k = 0; k < n; k++) {
    const d = v3(pts[k + 1].x - pts[k].x, 0, pts[k + 1].z - pts[k].z);
    const run = Math.sqrt(d.x * d.x + d.z * d.z);
    runs.push(run);
    dirs.push(run > 1e-9 ? v3(d.x / run, 0, d.z / run) : v3(0, 0, -1));
  }
  // turn at each inner joint (joint k is between piece k - 1 and piece k)
  const turns: number[] = [0];
  for (let k = 1; k < n; k++) turns.push(turnAngle(dirs[k - 1], dirs[k]));
  turns.push(0);
  const pitches: number[] = [];
  for (let k = 0; k < n; k++) pitches.push(Math.atan2(pts[k + 1].y - pts[k].y, runs[k]));
  const halfW = (width / 2) * Math.cos(bank);
  // (where the slope changes, the pieces' square ends open a V above the joint: reach over it,
  // up to a surf ramp's ridge or through the slab's thickness)
  const deep = surf ? height : b.size[1];
  const ext = (k: number): number =>
    k === 0 || k === n
      ? 0
      : halfW * Math.tan(Math.abs(turns[k]) / 2) +
        deep * Math.tan(Math.abs(pitches[k] - pitches[k - 1]) / 2) +
        JOINT_OVERLAP;
  const out: Piece[] = [];
  for (let k = 0; k < n; k++) {
    const h = dirs[k];
    const e0 = ext(k);
    const e1 = ext(k + 1);
    const pitch = pitches[k];
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const f = v3(h.x * cp, sp, h.z * cp);
    const u0 = v3(-h.x * sp, cp, -h.z * sp);
    const len = (runs[k] + e0 + e1) / cp;
    // the middle of the piece's top (base, for surf) line
    const mid = madd(
      v3(
        (pts[k].x + pts[k + 1].x) / 2,
        (pts[k].y + pts[k + 1].y) / 2,
        (pts[k].z + pts[k + 1].z) / 2,
      ),
      f,
      (e1 - e0) / 2 / cp,
    );
    if (surf) {
      out.push({
        c: madd(mid, u0, height / 2),
        h: v3(len / 2, height / 2, width / 2),
        q: qFromBasis(cross(u0, f), u0),
        prism: 0,
        surf: true,
      });
      continue;
    }
    // bank: lean the top toward the inside of this piece's turn
    let u = u0;
    if (bank !== 0) {
      // (an S-curve's bank swings smoothly from one side to the other through its middle)
      const side = cv?.kind === 'sCurve' ? Math.cos((Math.PI * (k + 0.5)) / n) : 1;
      const lean = turnSign * side * bank;
      const right = cross(f, u0);
      u = normalize(add(scale(u0, Math.cos(lean)), scale(right, Math.sin(lean))));
    }
    const thick = b.size[1];
    out.push({
      c: madd(mid, u, -thick / 2),
      h: v3(w / 2, thick / 2, len / 2),
      q: qFromBasis(f, u),
    });
  }
  return out;
};

/**
 * A quarter pipe: flat at the block's pos, curving up in front of it (toward -z) to vertical
 * (or `angle` degrees) with radius = its height (size y), size x wide. The pieces sit behind
 * the riding surface and overlap there, so it is smooth to ride.
 */
const pipePieces = (b: CustomBlock): Piece[] => {
  const w = b.size[0];
  const R = b.size[1];
  const total = curveAngle(b) * DEG;
  const n = curveSegments(b);
  const d = total / n;
  const half = (R + PIPE_THICK) * Math.tan(d / 2);
  const out: Piece[] = [];
  for (let k = 0; k < n; k++) {
    const th = (k + 0.5) * d;
    const surf = v3(0, R - R * Math.cos(th), -R * Math.sin(th));
    const along = v3(0, Math.sin(th), -Math.cos(th));
    const inward = v3(0, Math.cos(th), Math.sin(th));
    out.push({
      c: madd(surf, inward, -PIPE_THICK / 2),
      h: v3(w / 2, PIPE_THICK / 2, half),
      q: qFromBasis(along, inward),
    });
  }
  return out;
};

const round6 = (x: number): number => {
  const r = Math.round(x * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};

/**
 * One block → the boxes the game builds for it (in world space). The editor draws exactly
 * these, so what you see is what you play.
 */
export const expandCustomBlock = (b: CustomBlock): BoxDef[] => {
  const q = customBlockQuat(b.rot);
  const pos = p3(b.pos);
  const mat = b.shape === 'killpaint' ? 'killpaint' : b.mat;
  const color =
    mat === 'killpaint'
      ? CUSTOM_MATERIAL_COLORS.killpaint
      : (b.color ?? CUSTOM_MATERIAL_COLORS[mat]);
  return localPieces(b).map((p) => {
    const c = q ? add(pos, qRotate(q, p.c)) : add(pos, p.c);
    const pq = q ? (p.q ? qNormalize(qMul(q, p.q)) : q) : p.q;
    const box: BoxDef = { c, h: p.h, mat: MAT_OF[mat], color };
    if (pq) box.q = pq;
    if (p.prism !== undefined) box.prism = p.prism;
    if (p.surf) box.surf = true;
    if (mat === 'glass') {
      box.trim = GLASS_EDGE;
      box.seeThrough = true;
    }
    if (b.noCollide && mat !== 'killpaint') box.noCollide = true;
    return box;
  });
};

/** World AABB of a box (rotated boxes: of the rotated box). */
export const boxAabb = (b: BoxDef): { min: Vec3; max: Vec3 } => {
  if (!b.q) return { min: sub(b.c, b.h), max: add(b.c, b.h) };
  const ax = qRotate(b.q, v3(1, 0, 0));
  const ay = qRotate(b.q, v3(0, 1, 0));
  const az = qRotate(b.q, v3(0, 0, 1));
  const e = v3(
    Math.abs(ax.x) * b.h.x + Math.abs(ay.x) * b.h.y + Math.abs(az.x) * b.h.z,
    Math.abs(ax.y) * b.h.x + Math.abs(ay.y) * b.h.y + Math.abs(az.y) * b.h.z,
    Math.abs(ax.z) * b.h.x + Math.abs(ay.z) * b.h.y + Math.abs(az.z) * b.h.z,
  );
  return { min: sub(b.c, e), max: add(b.c, e) };
};

/**
 * The deadly volume of a kill-paint slab: the body centre of anyone standing on it, leaning on
 * its sides or touching it from below is inside.
 */
export const killpaintVolume = (b: BoxDef): KillVolumeDef => {
  const { min, max } = boxAabb(b);
  const side = BODY_RADIUS + 0.05;
  return {
    min: v3(min.x - side, min.y - BODY_HALF - 0.05, min.z - side),
    max: v3(max.x + side, max.y + BODY_HALF + 0.15, max.z + side),
  };
};

/** The sky presets: sky, fog, ambient light. */
export const customSkyLook = (
  sky: CustomSky,
): Pick<LevelDef, 'outdoor' | 'sky' | 'fog' | 'ambient'> => {
  const outdoor = (
    o: OutdoorSkyDef,
    fog: [number, number],
    ambient: number,
  ): Pick<LevelDef, 'outdoor' | 'fog' | 'ambient'> => ({
    outdoor: o,
    fog: { color: o.horizon, near: fog[0], far: fog[1] },
    ambient,
  });
  switch (sky) {
    case 'sunset':
      return outdoor(
        {
          top: 0x5a8fd8,
          horizon: 0xffc9a2,
          ground: 0xf5d8c8,
          sun: { dir: normalize(v3(0.8, 0.14, 0.3)), color: 0xffd08a, sizeDeg: 4.5 },
          sunLight: 0xffe6c8,
        },
        [140, 560],
        1.05,
      );
    case 'night':
      return outdoor(
        {
          top: 0x060a1c,
          horizon: 0x2a1d5a,
          ground: 0x120a2a,
          sun: { dir: normalize(v3(-0.4, 0.42, -0.6)), color: 0xf2f0ff, sizeDeg: 5 },
          sunLight: 0xb8c4ff,
          stars: true,
        },
        [120, 520],
        0.85,
      );
    case 'aurora':
      return outdoor(
        {
          top: 0x071a2e,
          horizon: 0x1f5a6a,
          ground: 0x0a1a2a,
          sun: { dir: normalize(v3(0.3, 0.5, -0.8)), color: 0xe8f4ff, sizeDeg: 4 },
          sunLight: 0xa8e8ff,
          stars: true,
        },
        [140, 540],
        0.95,
      );
    case 'space':
      return {
        sky: {
          moons: [
            { dir: normalize(v3(0.3, 0.85, -0.42)), sizeDeg: 7, color: 0xdfe6f5 },
            { dir: normalize(v3(-0.5, 0.7, 0.5)), sizeDeg: 3.2, color: 0xf2d2a8 },
          ],
        },
        fog: { color: 0x060912, near: 120, far: 520 },
        ambient: 0.9,
      };
    default:
      return outdoor(
        {
          top: 0x4f8ee0,
          horizon: 0xcfe4f7,
          ground: 0xe2ecf4,
          sun: { dir: normalize(v3(0.45, 0.7, 0.3)), color: 0xfff2d0, sizeDeg: 4 },
          sunLight: 0xfff6e8,
        },
        [160, 620],
        1.05,
      );
  }
};

/**
 * Where a mover's block is (its centre) `tSec` seconds after the map starts — exactly what
 * the game does by tick (tick = tSec × 60): wait `delay` at point 1, travel to point 2 at
 * `speed`, wait, ..., travel from the last point back to point 1, repeat.
 */
export const customMoverOffset = (mover: CustomMover, tSec: number): [number, number, number] => {
  const at = timelineAt(
    moverTimeline(mover.points.map(p3), mover.speed, mover.delay),
    tSec * TICK_RATE,
  );
  return [at.x, at.y, at.z];
};

/**
 * A built-in box's name for edits (types.ts BoxFingerprint): centre and half extents rounded
 * to 1 cm, "x,y,z|hx,hy,hz".
 */
export const boxFingerprint = (b: BoxDef): BoxFingerprint => {
  const f = (x: number): string => {
    const r = Math.round(x * 100) / 100;
    return String(r === 0 ? 0 : r);
  };
  return `${f(b.c.x)},${f(b.c.y)},${f(b.c.z)}|${f(b.h.x)},${f(b.h.y)},${f(b.h.z)}`;
};

/** The built-in map's own boxes (no size walls, no sky duel arena), for the editor. */
export const baseBoxesForEditor = (mapId: string): { fingerprint: string; box: BoxDef }[] =>
  mapDef(mapId).boxes.map((box) => ({ fingerprint: boxFingerprint(box), box }));

// ---------------------------------------------------------------------------------------------
// compiling a doc

interface Parts {
  boxes: BoxDef[];
  movers: MoverDef[];
  /** kill paint that stays put */
  kills: KillVolumeDef[];
  portals: PortalDef[];
  launchPads: LaunchPadDef[];
  /** AABB of every block (with movers' whole paths); null = no blocks */
  min: Vec3 | null;
  max: Vec3 | null;
  /** feet position on top of the first solid block (a spawn when the doc has none) */
  firstTop: Vec3 | null;
}

const grow = (parts: Parts, min: Vec3, max: Vec3): void => {
  if (!parts.min || !parts.max) {
    parts.min = v3(min.x, min.y, min.z);
    parts.max = v3(max.x, max.y, max.z);
    return;
  }
  parts.min = v3(
    Math.min(parts.min.x, min.x),
    Math.min(parts.min.y, min.y),
    Math.min(parts.min.z, min.z),
  );
  parts.max = v3(
    Math.max(parts.max.x, max.x),
    Math.max(parts.max.y, max.y),
    Math.max(parts.max.z, max.z),
  );
};

/** A portal's volume and the unit vector of its thinnest axis. */
const portalBox = (pos: Vec3, size: Vec3): { min: Vec3; max: Vec3 } => ({
  min: sub(pos, scale(size, 0.5)),
  max: add(pos, scale(size, 0.5)),
});

/**
 * The portal entries of one Map Maker portal: one way, or both ways (the return portal stands at
 * `to`, as big as the first; each exit is 1 m past the far portal's thinnest side, on the side
 * you travel on, so nothing bounces straight back).
 */
export const customPortalDefs = (p: CustomPortal, i: number): PortalDef[] => {
  const pos = p3(p.from.pos);
  const size = p3(p.from.size);
  const to = p3(p.to);
  const color = p.color ?? 0x8a5cff;
  const a = portalBox(pos, size);
  if (!p.twoWay) return [{ name: `portal ${i + 1}`, ...a, exit: to, color }];
  const k: 'x' | 'y' | 'z' =
    size.x <= size.y && size.x <= size.z ? 'x' : size.z <= size.y ? 'z' : 'y';
  const dir = v3();
  dir[k] = to[k] - pos[k] < 0 ? -1 : 1;
  const out = size[k] / 2 + 1;
  return [
    { name: `portal ${i + 1}`, ...a, exit: madd(to, dir, out), color },
    { name: `portal ${i + 1} back`, ...portalBox(to, size), exit: madd(pos, dir, -out), color },
  ];
};

const compileParts = (doc: CustomMapDoc, boxBase: number): Parts => {
  const parts: Parts = {
    boxes: [],
    movers: [],
    kills: [],
    portals: [],
    launchPads: [],
    min: null,
    max: null,
    firstTop: null,
  };
  const moverOf = new Map<number, CustomMover>();
  for (const m of doc.movers) moverOf.set(m.block, m);
  for (const b of doc.blocks) {
    const boxes = expandCustomBlock(b);
    const first = boxBase + parts.boxes.length;
    parts.boxes.push(...boxes);
    const mv = moverOf.get(b.id);
    const pos = p3(b.pos);
    const path = mv ? mv.points.map((p) => sub(p3(p), pos)) : [v3()];
    const paint = b.shape === 'killpaint' || b.mat === 'killpaint';
    const kills = paint ? boxes.map(killpaintVolume) : [];
    let top = -Infinity;
    for (const box of boxes) {
      const bb = boxAabb(box);
      top = Math.max(top, bb.max.y);
      for (const o of path) grow(parts, add(bb.min, o), add(bb.max, o));
    }
    if (!parts.firstTop && !paint && !b.noCollide && boxes.length)
      parts.firstTop = v3(b.pos[0], top + 0.05, b.pos[2]);
    if (mv) {
      parts.movers.push({
        boxes: boxes.map((_, i) => first + i),
        path,
        speed: mv.speed,
        delay: mv.delay,
        ...(kills.length ? { killVolumes: kills } : {}),
      });
    } else parts.kills.push(...kills);
  }
  doc.portals.forEach((p, i) => parts.portals.push(...customPortalDefs(p, i)));
  for (const lp of doc.launchPads) {
    const pos = p3(lp.pos);
    const half = scale(p3(lp.size), 0.5);
    parts.launchPads.push({ min: sub(pos, half), max: add(pos, half), vel: p3(lp.vel) });
  }
  return parts;
};

/** A gate's volume, and where you come back in it (its floor, the middle). */
const gateDef = (g: CustomGate): RaceGateDef => {
  const pos = p3(g.pos);
  const half = scale(p3(g.size), 0.5);
  return {
    min: sub(pos, half),
    max: add(pos, half),
    respawn: v3(pos.x, pos.y - half.y + 0.05, pos.z),
    yawDeg: headingYaw(g.yaw),
    ...(g.name ? { name: g.name } : {}),
  };
};

/** Eight start slots (2 rows of 4) inside the start volume, facing its yaw. */
const startGrid = (g: CustomGate): SpawnDef[] => {
  const gate = gateDef(g);
  const f = headingDir(g.yaw);
  const r = headingDir(g.yaw + 90);
  const across = Math.min(1.6, Math.max(0.5, (Math.min(g.size[0], g.size[2]) - 1) / 4));
  const out: SpawnDef[] = [];
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 4; col++) {
      const p = madd(madd(gate.respawn, r, (col - 1.5) * across), f, -row * across);
      p.x = Math.max(gate.min.x + 0.4, Math.min(gate.max.x - 0.4, p.x));
      p.z = Math.max(gate.min.z + 0.4, Math.min(gate.max.z - 0.4, p.z));
      out.push({ pos: p, yawDeg: gate.yawDeg });
    }
  return out;
};

/** The race: gates in order, a start grid and a simple racing line through the gates. */
const raceDef = (
  race: NonNullable<CustomMapDoc['race']>,
  lowest: number,
  extraKills: KillVolumeDef[],
): RaceDef => {
  const start = gateDef(race.start);
  const checkpoints = race.checkpoints.map(gateDef);
  const finish = gateDef(race.finish);
  const line: RaceLineNode[] = [
    { pos: start.respawn, cp: 0 },
    ...checkpoints.map((g, i) => ({ pos: g.respawn, cp: i })),
    { pos: finish.respawn, cp: checkpoints.length },
  ];
  let length = 0;
  for (let i = 1; i < line.length; i++) {
    const d = sub(line[i].pos, line[i - 1].pos);
    length += Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
  }
  const surf = !!race.surf;
  return {
    parSec: Math.max(20, Math.round(length / 7 + 10)),
    start: { respawn: start.respawn, yawDeg: start.yawDeg },
    grid: startGrid(race.start),
    checkpoints,
    finish,
    killY: race.killY ?? lowest - 30,
    ...(extraKills.length ? { killVolumes: extraKills } : {}),
    line,
    forks: [],
    ...(surf ? { surf: true, noJetpack: true, noSurge: true } : {}),
  };
};

const toSpawn = (s: CustomMapDoc['spawns'][number]): SpawnDef => ({
  pos: p3(s.pos),
  yawDeg: headingYaw(s.yaw),
  ...(s.team !== undefined ? { team: s.team } : {}),
});

/**
 * A doc → the level everyone plays. An edit of a built-in map (doc.patch) starts from that map
 * at full size (rooms that play fewer per team use applyCustomPatch on mapDefForSize).
 */
export const compileCustomMap = (doc: CustomMapDoc): LevelDef => {
  if (doc.patch) return applyCustomPatch(mapDefForSize(doc.base), doc);
  const parts = compileParts(doc, 0);
  const pts: Vec3[] = [];
  if (parts.min && parts.max) pts.push(parts.min, parts.max);
  for (const s of doc.spawns) pts.push(p3(s.pos));
  if (doc.race)
    for (const g of [doc.race.start, doc.race.finish, ...doc.race.checkpoints]) {
      const d = gateDef(g);
      pts.push(d.min, d.max);
    }
  for (const p of parts.portals) pts.push(p.min, p.max, p.exit);
  for (const p of parts.launchPads) pts.push(p.min, p.max);
  const lo = v3(-20, -20, -20);
  const hi = v3(20, 20, 20);
  if (pts.length) {
    lo.x = lo.y = lo.z = Infinity;
    hi.x = hi.y = hi.z = -Infinity;
    for (const p of pts) {
      lo.x = Math.min(lo.x, p.x);
      lo.y = Math.min(lo.y, p.y);
      lo.z = Math.min(lo.z, p.z);
      hi.x = Math.max(hi.x, p.x);
      hi.y = Math.max(hi.y, p.y);
      hi.z = Math.max(hi.z, p.z);
    }
  }
  const lowest = parts.min ? parts.min.y : lo.y;
  const race = doc.race ? raceDef(doc.race, lowest, parts.kills) : undefined;
  // the map's box: roomy around everything (leaving it kills, like falling off)
  const boundsMin = v3(
    lo.x - 40,
    Math.min(lo.y - 40, race ? race.killY - 10 : Infinity),
    lo.z - 40,
  );
  const boundsMax = v3(hi.x + 40, hi.y + 80, hi.z + 40);
  let spawns: SpawnDef[];
  if (race) spawns = race.grid;
  else if (doc.spawns.length) spawns = doc.spawns.map(toSpawn);
  else spawns = [{ pos: parts.firstTop ?? v3(0, 0, 0), yawDeg: 0 }];
  const def: LevelDef = {
    name: doc.name,
    boundsMin,
    boundsMax,
    defaultGravity: v3(0, -1, 0),
    boxes: parts.boxes,
    zones: [],
    rails: [],
    pads: [],
    spawns,
    towers: [],
    ...customSkyLook(doc.sky),
  };
  if (parts.launchPads.length) def.launchPads = parts.launchPads;
  if (parts.portals.length) def.portals = parts.portals;
  // (in a race kill paint sends you back to your checkpoint: race.killVolumes)
  if (!race && parts.kills.length) def.killVolumes = parts.kills;
  if (race) def.race = race;
  if (parts.movers.length) def.movers = parts.movers;
  return def;
};

/**
 * An edit of a built-in map (doc.patch) applied on top of that map as already built (any team
 * size): its removed boxes, portals and launch pads go; the doc's blocks, movers, portals, pads
 * and kill paint are added; spawns and the race replace the map's own only when the doc has
 * them. Everything else of the map stays. Without a patch the def is returned as it is.
 */
export const applyCustomPatch = (def: LevelDef, doc: CustomMapDoc): LevelDef => {
  const patch = doc.patch;
  if (!patch) return def;
  const removed = new Set(patch.removed);
  const noPortals = new Set(patch.removedPortals ?? []);
  const noPads = new Set(patch.removedLaunchPads ?? []);
  const boxes = removed.size
    ? def.boxes.filter((b) => !removed.has(boxFingerprint(b)))
    : def.boxes.slice();
  const parts = compileParts(doc, boxes.length);
  const out: LevelDef = { ...def, boxes: [...boxes, ...parts.boxes] };
  const portals = (def.portals ?? []).filter((_, i) => !noPortals.has(i)).concat(parts.portals);
  if (def.portals || portals.length) out.portals = portals;
  const pads = (def.launchPads ?? []).filter((_, i) => !noPads.has(i)).concat(parts.launchPads);
  if (def.launchPads || pads.length) out.launchPads = pads;
  if (parts.movers.length) out.movers = [...(def.movers ?? []), ...parts.movers];
  if (doc.spawns.length) out.spawns = doc.spawns.map(toSpawn);
  // grow the map's box around the new blocks (leaving it kills)
  if (parts.min && parts.max) {
    out.boundsMin = v3(
      Math.min(def.boundsMin.x, parts.min.x - 20),
      Math.min(def.boundsMin.y, parts.min.y - 20),
      Math.min(def.boundsMin.z, parts.min.z - 20),
    );
    out.boundsMax = v3(
      Math.max(def.boundsMax.x, parts.max.x + 20),
      Math.max(def.boundsMax.y, parts.max.y + 40),
      Math.max(def.boundsMax.z, parts.max.z + 20),
    );
  }
  const baseRace = def.race;
  if (doc.race) {
    const lowest = Math.min(parts.min?.y ?? Infinity, out.boundsMin.y + 30);
    const r = raceDef(doc.race, lowest, []);
    const kills = [...(baseRace?.killVolumes ?? []), ...parts.kills];
    out.race = {
      ...(baseRace ?? {}),
      ...r,
      // the map's own racing line still fits when the gates are the same count
      line:
        baseRace && baseRace.checkpoints.length === r.checkpoints.length ? baseRace.line : r.line,
      killY: doc.race.killY ?? baseRace?.killY ?? r.killY,
      ...(kills.length ? { killVolumes: kills } : {}),
      ...(baseRace && !doc.race.surf
        ? { surf: baseRace.surf, noJetpack: baseRace.noJetpack, noSurge: baseRace.noSurge }
        : {}),
    };
    if (!doc.spawns.length) out.spawns = r.grid;
  } else if (baseRace && parts.kills.length) {
    out.race = { ...baseRace, killVolumes: [...(baseRace.killVolumes ?? []), ...parts.kills] };
  }
  if (!out.race && parts.kills.length)
    out.killVolumes = [...(def.killVolumes ?? []), ...parts.kills];
  return out;
};

// ---------------------------------------------------------------------------------------------
// a built-in map → a doc

/** The closest Map Maker material to a game material. */
const CUSTOM_OF: Record<Material, CustomMaterial> = {
  hull: 'metal',
  floor: 'concrete',
  plate: 'metal',
  grate: 'metal',
  panel: 'concrete',
  crate: 'wood',
  pillar: 'concrete',
  glass: 'glass',
  skyglass: 'glass',
  engine: 'metal',
  teamA: 'concrete',
  teamB: 'concrete',
  trim: 'neon',
  rock: 'rock',
  sand: 'sand',
  wood: 'wood',
  paper: 'concrete',
  leaf: 'grass',
  forcefield: 'neon',
  cloud: 'ice',
  glow: 'neon',
  hazard: 'killpaint',
  water: 'ice',
};

/** A rotation → [yaw, pitch, roll] in degrees (customBlockQuat's inverse). */
const quatToRot = (q: Quat): [number, number, number] => {
  const f = qRotate(q, v3(0, 0, -1));
  const r = qRotate(q, v3(1, 0, 0));
  const u = qRotate(q, v3(0, 1, 0));
  const pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));
  let yaw: number;
  let roll: number;
  if (Math.abs(f.y) < 0.99999) {
    yaw = Math.atan2(f.x, -f.z);
    roll = Math.atan2(r.y, u.y);
  } else {
    // straight up or down: put it all in the yaw
    yaw = Math.atan2(r.z, r.x);
    roll = 0;
  }
  return [round6(yaw / DEG), round6(pitch / DEG), round6(roll / DEG)];
};

const isIdentity = (q?: Quat): boolean =>
  !q || Math.abs(q.x) + Math.abs(q.y) + Math.abs(q.z) < 1e-9;

const Y180 = qFromAxisAngle(UP, Math.PI);
const clampCoord = (x: number): number =>
  round6(Math.max(-CUSTOM_MAP_LIMITS.maxCoord, Math.min(CUSTOM_MAP_LIMITS.maxCoord, x)));
const vec = (p: Vec3): [number, number, number] => [
  clampCoord(p.x),
  clampCoord(p.y),
  clampCoord(p.z),
];
const sizeOne = (x: number): number =>
  round6(Math.max(0.1, Math.min(2 * CUSTOM_MAP_LIMITS.maxCoord, x)));
const sizeOf = (x: number, y: number, z: number): [number, number, number] => [
  sizeOne(x),
  sizeOne(y),
  sizeOne(z),
];
const inRange = (p: Vec3): boolean =>
  Math.abs(p.x) <= CUSTOM_MAP_LIMITS.maxCoord &&
  Math.abs(p.y) <= CUSTOM_MAP_LIMITS.maxCoord &&
  Math.abs(p.z) <= CUSTOM_MAP_LIMITS.maxCoord;

/** One built-in box → a block (null: it can't be expressed, e.g. out of range). */
const boxToBlock = (b: BoxDef, id: number): CustomBlock | null => {
  // (a free-form prism, BoxDef.hull: no block shape holds it; as a box it would be a solid lump)
  if (b.hull || !inRange(b.c)) return null;
  // (far scenery reaching past the network's ±500 m can't be sent)
  const bb = boxAabb(b);
  if (Math.max(-bb.min.x, -bb.min.y, -bb.min.z, bb.max.x, bb.max.y, bb.max.z) > 500) return null;
  let q = b.q && !isIdentity(b.q) ? b.q : undefined;
  let shape: CustomShape = 'box';
  let size: [number, number, number] = sizeOf(b.h.x * 2, b.h.y * 2, b.h.z * 2);
  if (b.prism !== undefined) {
    const pr = Math.max(-1, Math.min(1, b.prism));
    if (b.surf && (Math.abs(pr) < 1e-6 || Math.abs(Math.abs(pr) - 1) < 1e-6)) {
      // surf / surfSide: the ridge runs along the block's z (undo RIDGE_ALONG_Z)
      let bq = q ?? { x: 0, y: 0, z: 0, w: 1 };
      if (pr > 0.5) bq = qMul(bq, Y180); // one-sided with its face the other way: turn it round
      q = qNormalize(qMul(bq, qConj(RIDGE_ALONG_Z)));
      shape = Math.abs(pr) < 1e-6 ? 'surf' : 'surfSide';
      size = sizeOf(b.h.z * 2, b.h.y * 2, b.h.x * 2);
    } else if (!b.surf && Math.abs(Math.abs(pr) - 1) < 1e-6) {
      // a walkable wedge rising along its +z
      if (pr < 0) q = qNormalize(qMul(q ?? { x: 0, y: 0, z: 0, w: 1 }, Y180));
      shape = 'wedge';
    }
  }
  const mat = CUSTOM_OF[b.mat ?? 'hull'];
  const block: CustomBlock = {
    id,
    shape,
    pos: vec(b.c),
    size,
    mat,
    color: b.color ?? MATERIAL_COLORS[b.mat ?? 'hull'],
  };
  if (q && !isIdentity(q)) block.rot = quatToRot(q);
  if (b.noCollide) block.noCollide = true;
  return block;
};

const gateOf = (g: RaceGateDef): CustomGate => ({
  pos: vec(v3((g.min.x + g.max.x) / 2, (g.min.y + g.max.y) / 2, (g.min.z + g.max.z) / 2)),
  size: sizeOf(g.max.x - g.min.x, g.max.y - g.min.y, g.max.z - g.min.z),
  yaw: round6(-g.yawDeg),
  ...(g.name ? { name: g.name.slice(0, CUSTOM_MAP_LIMITS.nameLength) } : {}),
});

/**
 * Any built-in map → a Map Maker doc to start a new map from: its boxes (surf ramps and wedges
 * keep their shape, the rest become boxes; decoration stays see-only), portals, launch pads,
 * spawns and race gates. What a doc can't hold (Towers, gravity zones, zip-rails, bomb sites,
 * kill volumes, curved surf ramps' free-form prisms...) is left out.
 */
export const levelToCustomMap = (def: LevelDef, baseId: string, name: string): CustomMapDoc => {
  const blocks: CustomBlock[] = [];
  for (const b of def.boxes) {
    if (blocks.length >= CUSTOM_MAP_LIMITS.maxPieces) break;
    const block = boxToBlock(b, blocks.length + 1);
    if (block) blocks.push(block);
  }
  const doc: CustomMapDoc = {
    v: CUSTOM_MAP_VERSION,
    name: name.slice(0, CUSTOM_MAP_LIMITS.nameLength),
    base: baseId,
    sky: !def.outdoor ? 'space' : def.outdoor.stars ? 'night' : 'day',
    blocks,
    movers: [],
    spawns: def.spawns
      .filter((s) => inRange(s.pos))
      .map((s) => ({
        pos: vec(s.pos),
        yaw: round6(-s.yawDeg),
        ...(s.team !== undefined ? { team: s.team } : {}),
      })),
    portals: (def.portals ?? [])
      .filter((p) => inRange(p.exit) && inRange(p.min) && inRange(p.max))
      .slice(0, CUSTOM_MAP_LIMITS.portals)
      .map((p) => ({
        from: {
          pos: vec(v3((p.min.x + p.max.x) / 2, (p.min.y + p.max.y) / 2, (p.min.z + p.max.z) / 2)),
          size: sizeOf(p.max.x - p.min.x, p.max.y - p.min.y, p.max.z - p.min.z),
        },
        to: vec(p.exit),
        color: p.color,
      })),
    launchPads: (def.launchPads ?? [])
      .filter((p) => inRange(p.min) && inRange(p.max))
      .map((p) => ({
        pos: vec(v3((p.min.x + p.max.x) / 2, (p.min.y + p.max.y) / 2, (p.min.z + p.max.z) / 2)),
        size: sizeOf(p.max.x - p.min.x, p.max.y - p.min.y, p.max.z - p.min.z),
        vel: [round6(p.vel.x), round6(p.vel.y), round6(p.vel.z)],
      })),
  };
  const r = def.race;
  if (r) {
    // the start: a volume around the grid
    const pts = r.grid.length ? r.grid.map((g) => g.pos) : [r.start.respawn];
    const lo = v3(Infinity, Infinity, Infinity);
    const hi = v3(-Infinity, -Infinity, -Infinity);
    for (const p of pts) {
      lo.x = Math.min(lo.x, p.x - 1.5);
      lo.y = Math.min(lo.y, p.y);
      lo.z = Math.min(lo.z, p.z - 1.5);
      hi.x = Math.max(hi.x, p.x + 1.5);
      hi.y = Math.max(hi.y, p.y + 3);
      hi.z = Math.max(hi.z, p.z + 1.5);
    }
    const start = gateOf({ min: lo, max: hi, respawn: r.start.respawn, yawDeg: r.start.yawDeg });
    doc.race = {
      start,
      checkpoints: r.checkpoints.slice(0, CUSTOM_MAP_LIMITS.checkpoints).map(gateOf),
      finish: gateOf(r.finish),
      killY: clampCoord(r.killY),
      ...(r.surf ? { surf: true } : {}),
    };
  }
  return doc;
};

/** Is `id` a built-in map? */
export const isBuiltInMap = (id: string): boolean => MAPS.some((m) => m.id === id);
