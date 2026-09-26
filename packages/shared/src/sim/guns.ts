// CS mode guns: AK-47 (key 1) and Desert Eagle (key 2). Hitscan with lag compensation (like the
// Laser), a fixed learnable spray pattern per gun plus a Counter-Strike style random cone whose
// size depends on stance, movement speed, being airborne, landing and firing. All numbers live in
// config/guns.ts (spray patterns included).
//
// Determinism: the random part of a shot comes from a hash of (player id, tick, shot index), not
// from world.rng, so the shooter's prediction and the server pick exactly the same bullet path
// even though their rng streams differ (the client only simulates itself).
import type { Vec3 } from '../math/vec3';
import { add, sub, scale, dot, len, madd, normalize, projectOnPlane, clone } from '../math/vec3';
import { qForward, qRight, qUp } from '../math/quat';
import { raycast } from '../level/collision';
import type { CombatConfig } from '../config';
import { GUN_BY_WEAPON, GUN_PATTERN, type GunName } from '../config/guns';
import type { SimContext } from './context';
import { Btn } from './input';
import type { PlayerState, WorldState } from './state';
import { Move } from './state';
import { eyePos } from './movement';
import { rayHitbox, type Hitbox } from './hitbox';
import { applyDamage } from './combat';

const DEG = Math.PI / 180;
const ticks = (sec: number, dt: number): number => Math.max(1, Math.round(sec / dt));

export interface GunDef {
  name: GunName;
  auto: boolean; // hold to keep firing (AK) or one shot per click (Deagle)
  mag: number;
  reserve: number;
  cycleSec: number;
  reloadSec: number;
  body: number;
  head: number;
  legs: number;
  range: number;
  // inaccuracy (mrad)
  spread: number;
  stand: number;
  crouch: number;
  move: number;
  jump: number;
  land: number;
  fire: number;
  recoverStandSec: number;
  recoverCrouchSec: number;
  sprayRecoverSec: number;
  punchDeg: number;
  pattern: readonly (readonly [number, number])[];
}

export const gunDef = (c: CombatConfig, name: GunName): GunDef =>
  name === 'ak'
    ? {
        name,
        auto: true,
        mag: c.akMag,
        reserve: c.akReserve,
        cycleSec: c.akCycleSec,
        reloadSec: c.akReloadSec,
        body: c.akBodyDamage,
        head: c.akHeadDamage,
        legs: c.akLegDamage,
        range: c.akRange,
        spread: c.akSpreadMrad,
        stand: c.akStandMrad,
        crouch: c.akCrouchMrad,
        move: c.akMoveMrad,
        jump: c.akJumpMrad,
        land: c.akLandMrad,
        fire: c.akFireMrad,
        recoverStandSec: c.akRecoverStandSec,
        recoverCrouchSec: c.akRecoverCrouchSec,
        sprayRecoverSec: c.akSprayRecoverSec,
        punchDeg: c.akPunchDeg,
        pattern: GUN_PATTERN.ak,
      }
    : {
        name,
        auto: false,
        mag: c.deagleMag,
        reserve: c.deagleReserve,
        cycleSec: c.deagleCycleSec,
        reloadSec: c.deagleReloadSec,
        body: c.deagleBodyDamage,
        head: c.deagleHeadDamage,
        legs: c.deagleLegDamage,
        range: c.deagleRange,
        spread: c.deagleSpreadMrad,
        stand: c.deagleStandMrad,
        crouch: c.deagleCrouchMrad,
        move: c.deagleMoveMrad,
        jump: c.deagleJumpMrad,
        land: c.deagleLandMrad,
        fire: c.deagleFireMrad,
        recoverStandSec: c.deagleRecoverStandSec,
        recoverCrouchSec: c.deagleRecoverCrouchSec,
        sprayRecoverSec: c.deagleSprayRecoverSec,
        punchDeg: c.deaglePunchDeg,
        pattern: GUN_PATTERN.deagle,
      };

/** The gun in hand (CS mode: weapon 0 = AK, 1 = Deagle). */
export const currentGun = (p: PlayerState): GunName => GUN_BY_WEAPON[p.weapon] ?? 'ak';

/** Magazine and reserve of a gun. */
export const gunAmmo = (p: PlayerState, gun: GunName): { mag: number; reserve: number } =>
  gun === 'ak'
    ? { mag: p.akMag, reserve: p.akReserve }
    : { mag: p.deagleMag, reserve: p.deagleReserve };

const setAmmo = (p: PlayerState, gun: GunName, mag: number, reserve: number): void => {
  if (gun === 'ak') {
    p.akMag = mag;
    p.akReserve = reserve;
  } else {
    p.deagleMag = mag;
    p.deagleReserve = reserve;
  }
};

/** Spray pattern offset [pitch up, yaw right] (degrees) at a (fractional) spray index. */
export const patternAt = (
  pattern: readonly (readonly [number, number])[],
  index: number,
): [number, number] => {
  if (index <= 0 || pattern.length === 0) return [pattern[0]?.[0] ?? 0, pattern[0]?.[1] ?? 0];
  const last = pattern.length - 1;
  if (index >= last) return [pattern[last][0], pattern[last][1]];
  const i = Math.floor(index);
  const f = index - i;
  const a = pattern[i];
  const b = pattern[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
};

/** In the air for accuracy purposes (a zip-rail ride counts as moving, not jumping). */
const airborne = (p: PlayerState): boolean => !p.grounded && p.move !== Move.Rail;

/** The stance part of the stored inaccuracy (mrad): standing, crouching or airborne. */
export const gunBaseMrad = (p: PlayerState, g: GunDef): number =>
  airborne(p) ? g.stand + g.jump : p.crouched ? g.crouch : g.stand;

/**
 * Moving inaccuracy scale 0..1 from horizontal speed: 0 up to 34 % of max speed (walking /
 * counter-strafed to a stop), full at 95 % (CS: RemapValClamped(speed, max·0.34, max·0.95)).
 */
export const gunMoveFactor = (p: PlayerState, ctx: SimContext): number => {
  const c = ctx.config.combat;
  const max = Math.max(1e-3, ctx.config.movement.sprintSpeed);
  const speed = len(projectOnPlane(p.vel, p.up));
  const lo = max * c.gunAccurateSpeedFrac;
  const hi = max * c.gunFullSpeedFrac;
  return Math.max(0, Math.min(1, (speed - lo) / Math.max(1e-6, hi - lo)));
};

/** Inaccuracy right now (mrad), without the gun's fixed spread. */
export const gunInaccuracyMrad = (p: PlayerState, ctx: SimContext, g: GunDef): number =>
  Math.max(p.gunPenalty, gunBaseMrad(p, g)) + gunMoveFactor(p, ctx) * g.move;

/** Size of the random cone right now (degrees, max radius): spread + inaccuracy. */
export const gunConeDeg = (p: PlayerState, ctx: SimContext, gun = currentGun(p)): number => {
  const g = gunDef(ctx.config.combat, gun);
  return ((g.spread + gunInaccuracyMrad(p, ctx, g)) / 1000) * (180 / Math.PI);
};

const mix32 = (x: number): number => {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

/**
 * Deterministic random number in [0, 1) for a shot: the same (player, tick, shot, k) gives the
 * same value on every machine (integer hashing only).
 */
export const gunRandom = (player: number, tick: number, shot: number, k: number): number => {
  let h = mix32(Math.imul(player + 1, 0x9e3779b1));
  h = mix32(h ^ tick);
  h = mix32(h ^ Math.imul(shot + 1, 0x27d4eb2f));
  h = mix32(h ^ Math.imul(k + 1, 0x165667b1));
  return h / 4294967296;
};

/** Direction `fwd` turned by pitch (up) and yaw (right) in radians, in the view's frame. */
const turnDir = (fwd: Vec3, right: Vec3, up: Vec3, pitch: number, yaw: number): Vec3 =>
  normalize(add(add(fwd, scale(right, Math.tan(yaw))), scale(up, Math.tan(pitch))), fwd);

/**
 * Where the next shot of `p` goes (unit direction from the eye) on `tick`: view + spray pattern
 * at the current index + the random cone. Pure (doesn't change the player).
 */
export const shotDirection = (p: PlayerState, ctx: SimContext, tick: number): Vec3 => {
  const g = gunDef(ctx.config.combat, currentGun(p));
  const [pp, py] = patternAt(g.pattern, p.gunSpray);
  // CS: random radius × size at a random angle, once for the inaccuracy, once for the spread
  const inacc = gunInaccuracyMrad(p, ctx, g) / 1000;
  const spread = g.spread / 1000;
  const r1 = gunRandom(p.id, tick, p.gunShots, 0) * inacc;
  const a1 = gunRandom(p.id, tick, p.gunShots, 1) * Math.PI * 2;
  const r2 = gunRandom(p.id, tick, p.gunShots, 2) * spread;
  const a2 = gunRandom(p.id, tick, p.gunShots, 3) * Math.PI * 2;
  const ox = r1 * Math.cos(a1) + r2 * Math.cos(a2);
  const oy = r1 * Math.sin(a1) + r2 * Math.sin(a2);
  return turnDir(qForward(p.view), qRight(p.view), qUp(p.view), pp * DEG + oy, py * DEG + ox);
};

/** Per-tick decay factor that shrinks something to 10 % in `sec` seconds (CS recovery). */
const decay10 = (sec: number, dt: number): number => (sec > 0 ? Math.pow(0.1, dt / sec) : 0);

/**
 * One tick of a living, unfrozen player's guns: switching (1 / 2), reloading (R, or by itself
 * when you pull the trigger on an empty magazine), accuracy recovery and firing (LMB). Called
 * from updateCombat in CS mode.
 */
export const updateGuns = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  buttons: number,
  pressed: number,
  liveHitboxes: () => Hitbox[],
): void => {
  const c = ctx.config.combat;
  const dt = ctx.dt;
  if (p.gunCd > 0) p.gunCd--;
  if (p.gunReload > 0 && --p.gunReload === 0) {
    const gun = currentGun(p);
    const g = gunDef(c, gun);
    const a = gunAmmo(p, gun);
    const take = Math.min(g.mag - a.mag, a.reserve);
    setAmmo(p, gun, a.mag + take, a.reserve - take);
  }

  // --- switch: 1 = AK, 2 = Deagle (cancels a reload; the new gun needs a moment to come up) ---
  const want = pressed & Btn.Slot1 ? 0 : pressed & Btn.Slot2 ? 1 : p.weapon;
  if (want !== p.weapon) {
    p.weapon = want;
    p.gunReload = 0;
    p.gunSpray = 0;
    p.gunCd = Math.max(p.gunCd, ticks(c.gunDrawSec, dt));
    world.events.push({ type: 'gunDraw', player: p.id, gun: currentGun(p) });
  }
  const gun = currentGun(p);
  const g = gunDef(c, gun);

  // --- accuracy: stance base, landing penalty, recovery (CS UpdateAccuracyPenalty) ---
  if (world.events.some((e) => e.type === 'land' && e.player === p.id && e.speed > 2))
    p.gunPenalty += g.land;
  const base = gunBaseMrad(p, g);
  if (p.gunPenalty <= base) p.gunPenalty = base;
  else {
    const k = decay10(p.crouched ? g.recoverCrouchSec : g.recoverStandSec, dt);
    p.gunPenalty = base + (p.gunPenalty - base) * k;
  }
  // the spray slides back toward the first shot once you stop firing
  if (p.gunSpray > 0 && world.tick - p.gunLastShot > ticks(g.cycleSec, dt)) {
    p.gunSpray *= decay10(g.sprayRecoverSec, dt);
    if (p.gunSpray < 0.02) p.gunSpray = 0;
  }

  // --- reload ---
  const ammo = gunAmmo(p, gun);
  const wantReload = pressed & Btn.Recall || (ammo.mag === 0 && buttons & Btn.Fire);
  if (wantReload && p.gunReload === 0 && ammo.mag < g.mag && ammo.reserve > 0) {
    p.gunReload = ticks(g.reloadSec, dt);
    world.events.push({ type: 'gunReload', player: p.id, gun });
  }

  // --- fire ---
  const trigger = g.auto ? buttons & Btn.Fire : pressed & Btn.Fire;
  if (!trigger || p.gunCd > 0 || p.gunReload > 0 || ammo.mag <= 0) return;
  const dir = shotDirection(p, ctx, world.tick);
  setAmmo(p, gun, ammo.mag - 1, ammo.reserve);
  p.gunCd = ticks(g.cycleSec, dt);
  p.gunSpray = Math.min(p.gunSpray + 1, g.pattern.length - 1);
  p.gunPenalty = Math.max(p.gunPenalty, base) + g.fire;
  p.gunLastShot = world.tick;
  p.gunShots++;
  fireBullet(world, ctx, p, g, dir, ctx.rewindHitboxes?.(p.id) ?? liveHitboxes());
};

/** Hitscan: the first player (as the shooter saw them) or wall along `dir`. */
const fireBullet = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  g: GunDef,
  dir: Vec3,
  hitboxes: Hitbox[],
): void => {
  const eye = eyePos(p, ctx.config.movement);
  const wall = raycast(ctx.level, eye, dir, g.range);
  let best = wall ? wall.t : g.range;
  let target: { hb: Hitbox; head: boolean } | null = null;
  for (const hb of hitboxes) {
    if (hb.id === p.id) continue;
    const h = rayHitbox(eye, dir, best, hb);
    if (h && h.dist < best) {
      best = h.dist;
      target = { hb, head: h.head };
    }
  }
  const to = madd(eye, dir, best);
  let hitId = -1;
  let head = false;
  if (target) {
    const victim = world.players.find((q) => q.id === target.hb.id);
    if (victim) {
      hitId = victim.id;
      head = target.head;
      const dmg = head ? g.head : legShot(target.hb, to) ? g.legs : g.body;
      applyDamage(world, ctx, p.id, victim, dmg, g.name, head, to, eye);
    }
  }
  world.events.push({
    type: 'gunFire',
    player: p.id,
    gun: g.name,
    from: eye,
    to,
    hit: hitId,
    head,
    normal: !target && wall ? clone(wall.normal) : null,
  });
};

/** A body hit low on the capsule (below ~0.65 m standing) counts as the legs. */
const legShot = (hb: Hitbox, point: Vec3): boolean => {
  const axis = sub(hb.bodyB, hb.bodyA);
  const l = len(axis);
  if (l < 0.1) return false;
  return dot(sub(point, hb.bodyA), axis) / l < 0.3 * l;
};
