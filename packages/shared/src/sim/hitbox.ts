// Player hitboxes: an honest head sphere + a body capsule, oriented along the body's up.
import type { Vec3 } from '../math/vec3';
import { madd, sub, dot, normalize, len } from '../math/vec3';
import { closestSegSeg, closestPointSeg, segmentSphereEntry } from '../math/geom';
import type { GameConfig } from '../config';
import type { PlayerState } from './state';
import { Move } from './state';
import { eyePos, feetPos } from './movement';

export interface Hitbox {
  id: number;
  team: 0 | 1;
  head: Vec3;
  bodyA: Vec3; // bottom of the body capsule's core segment
  bodyB: Vec3; // top
  headR: number;
  bodyR: number;
}

export const hitboxOf = (p: PlayerState, cfg: GameConfig): Hitbox => {
  const c = cfg.combat;
  const feet = feetPos(p, cfg.movement);
  const eye = eyePos(p, cfg.movement);
  const head = madd(eye, p.up, 0.02);
  const top =
    p.move === Move.Slide
      ? c.bodyTopSlide
      : p.crouched
        ? cfg.movement.crouchHeight - 0.35
        : c.bodyTop;
  const a = madd(feet, p.up, c.bodyBottom + c.bodyRadius);
  const b = madd(feet, p.up, Math.max(c.bodyBottom + c.bodyRadius, top - c.bodyRadius));
  return {
    id: p.id,
    team: p.team,
    head,
    bodyA: a,
    bodyB: b,
    headR: c.headRadius,
    bodyR: c.bodyRadius,
  };
};

/** Chest point (target for homing/catching). */
export const chestOf = (hb: Hitbox): Vec3 => madd(hb.bodyB, sub(hb.bodyA, hb.bodyB), 0.2);

export interface HitResult {
  t: number; // 0..1 along the swept segment
  head: boolean;
  point: Vec3;
}

/**
 * Sphere of radius r swept from a to b vs a hitbox. Head is checked first (a head hit wins
 * when both are touched in the same step).
 */
export const sweepHitbox = (a: Vec3, b: Vec3, r: number, hb: Hitbox): HitResult | null => {
  const headT = segmentSphereEntry(a, b, hb.head, hb.headR + r);
  if (headT !== null) return { t: headT, head: true, point: hb.head };
  const res = closestSegSeg(a, b, hb.bodyA, hb.bodyB);
  const rr = hb.bodyR + r;
  if (res.distSq <= rr * rr) return { t: res.s, head: false, point: res.c2 };
  return null;
};

/** Ray (origin, unit dir, maxDist) vs hitbox: distance of first hit or null. */
export const rayHitbox = (
  origin: Vec3,
  dir: Vec3,
  maxDist: number,
  hb: Hitbox,
): { dist: number; head: boolean } | null => {
  const end = madd(origin, dir, maxDist);
  const hT = segmentSphereEntry(origin, end, hb.head, hb.headR);
  const res = closestSegSeg(origin, end, hb.bodyA, hb.bodyB);
  let bodyDist: number | null = null;
  if (res.distSq <= hb.bodyR * hb.bodyR) {
    // back off along the ray to the capsule surface (approximate entry)
    const along = res.s * maxDist;
    const perp = Math.sqrt(res.distSq);
    bodyDist = Math.max(0, along - Math.sqrt(Math.max(0, hb.bodyR * hb.bodyR - perp * perp)));
  }
  const headDist = hT !== null ? hT * maxDist : null;
  if (headDist !== null && (bodyDist === null || headDist <= bodyDist + 0.05))
    return { dist: headDist, head: true };
  if (bodyDist !== null) return { dist: bodyDist, head: false };
  return null;
};

/** Distance from a point to the hitbox surface (<= 0 inside). */
export const pointHitboxDist = (p: Vec3, hb: Hitbox): number => {
  const dh = len(sub(p, hb.head)) - hb.headR;
  const cb = closestPointSeg(p, hb.bodyA, hb.bodyB);
  const db = Math.sqrt(cb.distSq) - hb.bodyR;
  return Math.min(dh, db);
};

/** Is direction `to` (from origin) within `coneDeg` of unit `forward`? */
export const inCone = (origin: Vec3, forward: Vec3, target: Vec3, coneDeg: number): boolean => {
  const d = normalize(sub(target, origin));
  return dot(d, forward) >= Math.cos((coneDeg * Math.PI) / 180);
};
