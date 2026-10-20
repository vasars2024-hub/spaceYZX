// Teleport slash (melee remodel): hold E with the sword out (the Boomerang in hand) for
// `teleportChargeSec`, then let go. You dash `teleportDistance` metres straight ahead along the
// floor (the level part of where you look), stopping at walls, and every enemy whose body comes
// within `teleportKillRadius` of the path dies. A quick tap of E is still the normal slash
// (combat.ts), which fires the moment E goes down, so deflects keep their timing.
//
// Why "release to fire" (not "fires by itself at 1 s"): you choose the moment, e.g. wait at a
// corner fully charged and go when the enemy steps into the line. Held too long
// (`teleportHoldSec` after it's ready) the charge fades without a cooldown.
//
// Charging is visible to everyone (`meleeCharge` is in the public snapshot: the sword glows)
// and slows you to `teleportChargeMoveScale` of sprint speed. Not in CS modes
// (LoadoutDef.teleportSlash). Judged by the server like the slash: against the hitboxes the
// attacker saw (lag compensation); the client predicts the dash with this same code.
import type { Vec3 } from '../math/vec3';
import { add, sub, scale, dot, madd, normalize, clone, projectOnPlane } from '../math/vec3';
import { qForward, qUp } from '../math/quat';
import { closestSegSeg } from '../math/geom';
import { capsuleOverlaps, lineOfSight } from '../level/collision';
import { loadoutOf } from '../config/loadout';
import type { SimContext } from './context';
import { isEnemy } from './context';
import { Btn } from './input';
import type { PlayerState, WorldState } from './state';
import { Move } from './state';
import type { BoomerangState } from './combat-state';
import { Phase } from './combat-state';
import { capsuleOf } from './movement';
import type { Hitbox } from './hitbox';
import { applyDamage } from './combat';

const ticks = (sec: number, dt: number): number => Math.max(1, Math.round(sec / dt));

/** How far the dash path advances per collision test (metres). */
const PATH_STEP = 0.1;
/** The path starts a hair above where you stand, so resting on the floor never counts as a wall. */
const PATH_HOVER = 0.02;
/**
 * Heights the body may rise per path step (metres): enough for the steepest walkable slope
 * (0.12 m per 0.1 m is 50°) and, now and then, a kerb up to the step height.
 */
const PATH_LIFTS = [0, 0.06, 0.12];

/**
 * The level direction of your view: the forward vector with its up/down part removed. Looking
 * straight up or down still gives the way you face (the camera's own up vector tells it).
 */
export const teleportDir = (p: PlayerState): Vec3 => {
  const fwd = qForward(p.view);
  const flat = sub(fwd, scale(qUp(p.view), dot(fwd, p.up)));
  return normalize(projectOnPlane(flat, p.up), projectOnPlane(fwd, p.up));
};

/**
 * Where the dash ends: the body (capsule) slides `dist` metres along `dir` in small steps and
 * stops at the last spot where it doesn't overlap the level, so it can never pass through a
 * wall, however thin. It follows ramps up and may step up kerbs, but never rises more in total
 * than a walkable slope plus one step (no climbing cliffs).
 */
export const teleportPath = (ctx: SimContext, p: PlayerState, dir: Vec3, dist: number): Vec3 => {
  const m = ctx.config.movement;
  const lifts = [...PATH_LIFTS, m.stepHeight];
  const slope = Math.tan(m.maxWalkableSlopeDeg * (Math.PI / 180));
  const free = (c: Vec3): boolean => !capsuleOverlaps(ctx.level, capsuleOf(p, m, c));
  let at = madd(p.pos, p.up, PATH_HOVER);
  if (!free(at)) at = clone(p.pos);
  let rise = 0;
  let moved = 0;
  const steps = Math.ceil(dist / PATH_STEP - 1e-9);
  for (let i = 1; i <= steps; i++) {
    const stepLen = Math.min(PATH_STEP, dist - moved);
    const ahead = madd(at, dir, stepLen);
    let next: Vec3 | null = null;
    for (const h of lifts) {
      if (rise + h > (moved + stepLen) * slope + m.stepHeight + 1e-9) break;
      const c = madd(ahead, p.up, h);
      if (free(c)) {
        next = c;
        rise += h;
        break;
      }
    }
    if (!next) break; // a wall: stop here
    at = next;
    moved += stepLen;
  }
  return at;
};

/** Stop charging (released early, fired, cancelled). */
const endCharge = (world: WorldState, ctx: SimContext, p: PlayerState, quiet: boolean): void => {
  const tap = ticks(ctx.config.combat.teleportTapSec, ctx.dt);
  if (!quiet && p.meleeCharge >= tap) world.events.push({ type: 'meleeCancel', player: p.id });
  p.meleeCharge = 0;
  if (p.windup === 0 && p.speedCap === chargeSpeed(ctx)) p.speedCap = 0;
};

const chargeSpeed = (ctx: SimContext): number =>
  ctx.config.movement.sprintSpeed * ctx.config.combat.teleportChargeMoveScale;

/** Fire: dash along the path and cut down everyone on it. */
const fireTeleport = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  boxes: readonly Hitbox[],
): void => {
  const c = ctx.config.combat;
  const dir = teleportDir(p);
  const from = clone(p.pos);
  const to = teleportPath(ctx, p, dir, c.teleportDistance);
  p.pos = to;
  // keep falling / rising as before, but the level speed is now a short glide out of the dash
  p.vel = add(scale(p.up, dot(p.vel, p.up)), scale(dir, c.teleportExitSpeed));
  p.mantle = null;
  p.rail = null;
  if (p.move === Move.Mantle || p.move === Move.Rail) p.move = Move.Air;
  p.teleportCd = ticks(c.teleportCooldownSec, ctx.dt);
  world.events.push({ type: 'teleportSlash', player: p.id, from, to: clone(to) });
  const throwId = world.nextId++; // groups the multi-kill
  const r2 = c.teleportKillRadius * c.teleportKillRadius;
  for (const hb of boxes) {
    if (hb.id === p.id) continue;
    const victim = world.players.find((q) => q.id === hb.id);
    if (!victim?.alive) continue;
    if (!c.teleportFriendlyFire && !isEnemy(ctx, p, victim)) continue;
    // the path against their body's centre line, feet to head
    const near = closestSegSeg(from, to, hb.bodyA, hb.head);
    if (near.distSq > r2) continue;
    // not through a wall beside the path
    if (!lineOfSight(ctx.level, near.c1, near.c2)) continue;
    applyDamage(
      world,
      ctx,
      p.id,
      victim,
      c.teleportDamage,
      'teleportSlash',
      false,
      near.c2,
      from,
      throwId,
    );
  }
};

/**
 * One tick of the teleport slash for one player (from updateCombat, before anything else that
 * player does). `b` = their Boomerang (the sword is out while it's in hand), `stunned` = hit by a
 * Freeze this tick, `boxes` = hitboxes as this player saw them.
 */
export const updateTeleportSlash = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  buttons: number,
  pressed: number,
  b: BoomerangState | undefined,
  stunned: boolean,
  boxes: () => readonly Hitbox[],
): void => {
  const c = ctx.config.combat;
  if (p.teleportCd > 0) p.teleportCd--;
  const can =
    loadoutOf(ctx.config).teleportSlash &&
    p.alive &&
    !p.frozen &&
    !stunned &&
    b?.phase === Phase.Held &&
    p.windup === 0;
  if (p.meleeCharge > 0) {
    if (!can) return endCharge(world, ctx, p, !p.alive);
    const full = ticks(c.teleportChargeSec, ctx.dt);
    if (!(buttons & Btn.Melee)) {
      // let go: fire if it was fully charged, else it was just a slash
      if (p.meleeCharge >= full) {
        endCharge(world, ctx, p, true);
        fireTeleport(world, ctx, p, boxes());
      } else endCharge(world, ctx, p, false);
      return;
    }
    if (p.meleeCharge >= full + ticks(c.teleportHoldSec, ctx.dt))
      return endCharge(world, ctx, p, false); // held too long: it fades
    p.meleeCharge++;
    if (p.meleeCharge === ticks(c.teleportTapSec, ctx.dt))
      world.events.push({ type: 'meleeCharge', player: p.id });
    if (p.meleeCharge === full) world.events.push({ type: 'meleeReady', player: p.id });
    if (
      p.meleeCharge >= ticks(c.teleportTapSec, ctx.dt) &&
      (p.speedCap === 0 || p.speedCap > chargeSpeed(ctx))
    )
      p.speedCap = chargeSpeed(ctx);
  } else if (can && pressed & Btn.Melee && p.teleportCd === 0) {
    p.meleeCharge = 1;
  }
};
