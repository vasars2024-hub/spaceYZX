// Gravity Grenade: charging the throw, the bounce count, the flight and the lineup preview.
//
// Hold the grenade key (Q) to charge: a quick tap lobs it softly (grenadeMinCharge of the full
// speed), holding for grenadeChargeSec throws it at full speed; letting go throws. Middle mouse
// cycles how many times the next grenade bounces (0 = it goes off on the first thing it hits,
// then 1, 2, 3, back to 0). It goes off on the impact after that many bounces, when it stops
// rolling, when it touches a player, or after grenadeMaxFuseSec at the latest; then it pulls
// players in and pops (sim/combat.ts updateGrenades).
//
// Nothing here is random, and the preview runs this very code: the same spot, view, charge and
// bounce count always land on exactly the same spot, so players can learn lineups.
import type { Vec3 } from '../math/vec3';
import { add, clone, dot, len, madd, normalize, scale } from '../math/vec3';
import type { Quat } from '../math/quat';
import { qForward } from '../math/quat';
import { raycast } from '../level/collision';
import { loadoutOf } from '../config/loadout';
import type { CombatConfig } from '../config';
import type { SimContext } from './context';
import { Btn } from './input';
import type { PlayerState, WorldState } from './state';
import type { GrenadeState } from './combat-state';
import { eyePos } from './movement';
import { gravityAt } from './gravity';

const ticks = (sec: number, dt: number): number => Math.max(1, Math.round(sec / dt));

/** Ticks of holding Q that reach full strength. */
export const grenadeChargeTicks = (c: CombatConfig, dt: number): number =>
  ticks(c.grenadeChargeSec, dt);

/**
 * How far the charge has got, 0..1, after holding Q for `charge` ticks (1 = the press tick:
 * a tap). The HUD's charge bar shows this.
 */
export const grenadeCharge01 = (c: CombatConfig, dt: number, charge: number): number =>
  Math.max(0, Math.min(1, (charge - 1) / grenadeChargeTicks(c, dt)));

/** Throw speed as a fraction of full: grenadeMinCharge for a tap, 1 when fully charged. */
export const grenadeStrength = (c: CombatConfig, dt: number, charge: number): number =>
  c.grenadeMinCharge + (1 - c.grenadeMinCharge) * grenadeCharge01(c, dt, charge);

/** Where a grenade thrown now leaves the hand, and how fast. */
export const grenadeLaunch = (
  p: PlayerState,
  view: Quat,
  charge: number,
  ctx: SimContext,
): { pos: Vec3; vel: Vec3 } => {
  const c = ctx.config.combat;
  const eye = eyePos(p, ctx.config.movement);
  const fwd = qForward(view);
  const speed = c.grenadeSpeed * grenadeStrength(c, ctx.dt, charge);
  return {
    pos: madd(eye, fwd, 0.5),
    vel: add(
      scale(normalize(madd(fwd, p.up, c.grenadeUpTilt)), speed),
      scale(p.vel, c.grenadeInheritVel),
    ),
  };
};

/**
 * What one tick of flight did: flew freely, bounced (a bounce used up), hit something with no
 * bounces left ('impact'), rolled / slid along a surface ('roll'), or rolled to a stop ('rest').
 */
export type GrenadeStep = 'fly' | 'bounce' | 'impact' | 'roll' | 'rest';

/** One tick of a flying grenade (gravity, walls, bounces). Shared by the sim and the preview. */
export const grenadeFlightStep = (
  ctx: SimContext,
  world: WorldState,
  g: GrenadeState,
): GrenadeStep => {
  const c = ctx.config.combat;
  const dt = ctx.dt;
  g.vel = madd(g.vel, gravityAt(ctx, world, g.pos), dt);
  const speed = len(g.vel);
  if (speed < 1e-6) return 'fly';
  const hit = raycast(ctx.level, g.pos, scale(g.vel, 1 / speed), speed * dt, c.grenadeRadius);
  if (!hit) {
    g.pos = madd(g.pos, g.vel, dt);
    return 'fly';
  }
  g.pos = madd(hit.point, hit.normal, 0.02);
  const vn = dot(g.vel, hit.normal); // negative: moving into the surface
  if (-vn < c.grenadeBounceMinSpeed) {
    // a soft touch: it rolls / slides along (doesn't count as a bounce) and soon stops
    g.vel = scale(madd(g.vel, hit.normal, -vn), c.grenadeRollFriction);
    return len(g.vel) < c.grenadeRestSpeed ? 'rest' : 'roll';
  }
  if (g.bounces <= 0) return 'impact';
  g.bounces--;
  // bounce: the part into the surface comes back weaker, the part along it slows down
  const along = madd(g.vel, hit.normal, -vn);
  g.vel = madd(scale(along, c.grenadeBounceFriction), hit.normal, -vn * c.grenadeRestitution);
  return 'bounce';
};

/** Has this flying grenade reached the end of its fuse? */
export const grenadeFuseOut = (ctx: SimContext, g: GrenadeState): boolean =>
  g.t >= ticks(ctx.config.combat.grenadeMaxFuseSec, ctx.dt);

/**
 * Q (hold to charge, let go to throw) and middle mouse (bounce count) for one player this
 * tick. Called from updateCombat for players who can act.
 */
export const updateGrenadeInput = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  buttons: number,
  pressed: number,
): void => {
  const c = ctx.config.combat;
  if (!loadoutOf(ctx.config).grenade) {
    p.nadeCharge = 0;
    return;
  }
  if (pressed & Btn.NadeBounce) p.nadeBounces = (p.nadeBounces + 1) % (c.grenadeMaxBounces + 1);
  // lineup practice: a new grenade once the last one is gone
  if (
    c.grenadeRefill > 0 &&
    p.grenadesLeft <= 0 &&
    p.nadeCharge === 0 &&
    !world.grenades.some((g) => g.owner === p.id)
  )
    p.grenadesLeft = c.grenadesPerRound;
  if (p.nadeCharge > 0) {
    if (buttons & Btn.Grenade) {
      // still holding: charge up (it stays at full once there)
      p.nadeCharge = Math.min(p.nadeCharge + 1, grenadeChargeTicks(c, ctx.dt) + 1);
      return;
    }
    // let go: throw
    const charge = p.nadeCharge;
    p.nadeCharge = 0;
    if (p.grenadesLeft <= 0) return;
    p.grenadesLeft--;
    const { pos, vel } = grenadeLaunch(p, p.view, charge, ctx);
    const g: GrenadeState = {
      id: world.nextId++,
      owner: p.id,
      pos,
      vel,
      phase: 0,
      t: 0,
      bounces: p.nadeBounces,
    };
    world.grenades.push(g);
    world.events.push({ type: 'grenadeThrow', player: p.id, grenade: g.id });
  } else if (pressed & Btn.Grenade && p.grenadesLeft > 0) p.nadeCharge = 1;
};

/** The path a grenade thrown right now would fly (the lineup preview). */
export interface GrenadePath {
  /** its position every tick, from the hand to where it goes off */
  points: Vec3[];
  /** where it bounces */
  bounces: Vec3[];
  /** where it goes off */
  end: Vec3;
  /** why it goes off there: its last impact, rolled to a stop, or the fuse ran out */
  cause: 'impact' | 'rest' | 'fuse';
  /** ticks of flight */
  ticks: number;
}

/**
 * Fly a grenade thrown by `p` looking along `view` with this charge (ticks held) and bounce
 * count, exactly as the sim will (same steps, same order), until it goes off. Players touching
 * it are not foreseen (nobody knows where they will be).
 */
export const predictGrenade = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  view: Quat,
  charge: number = Math.max(1, p.nadeCharge),
  bounces: number = p.nadeBounces,
): GrenadePath => {
  const { pos, vel } = grenadeLaunch(p, view, charge, ctx);
  const g: GrenadeState = { id: 0, owner: p.id, pos, vel, phase: 0, t: 0, bounces };
  const points: Vec3[] = [clone(pos)];
  const bouncePts: Vec3[] = [];
  for (;;) {
    // (the sim counts the tick first, like updateGrenades)
    g.t++;
    const r = grenadeFlightStep(ctx, world, g);
    points.push(clone(g.pos));
    if (r === 'bounce') bouncePts.push(clone(g.pos));
    const cause =
      r === 'impact' ? 'impact' : r === 'rest' ? 'rest' : grenadeFuseOut(ctx, g) ? 'fuse' : null;
    if (cause) return { points, bounces: bouncePts, end: clone(g.pos), cause, ticks: g.t };
  }
};
