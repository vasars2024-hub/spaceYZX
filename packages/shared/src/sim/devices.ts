// Map devices a player triggers by moving into them: launch pads, suction tubes and portals
// (LevelDef launchPads / liftTubes / portals). A pad keeps setting its throw while you are inside
// it, and a portal's exit lies outside every portal, so nothing bounces back. A portal may turn
// you (PortalDef.turn): velocity and view turned about the vertical, speed kept; one that keeps
// your offset (PortalDef.offset) puts you as far off its exit as you went in off its opening's
// middle, turned the same way, and one may level you out (PortalDef.vertical 'zero': vertical
// speed dropped). A suction tube pulls you up its middle line (PlayerState.tube; movement
// leaves you alone meanwhile) and throws you onto its landing spot; a short cooldown
// (PlayerState.tubeCd) keeps it from pulling you in again right away.
// Pad and tube flights never cause fall damage (PlayerState.padFlight, judged in world.ts):
// the flight only ends after you have stood on the ground for `padSettleSec`.
// Runs after movement, on the server and in the client's prediction alike.
import type { Vec3 } from '../math/vec3';
import { v3, add, clone, dot, len, madd, rotateAxis, scale, sub, UP } from '../math/vec3';
import { qFromAxisAngle, qMul, qNormalize } from '../math/quat';
import { pointInAabb } from '../level/level';
import type { SimContext } from './context';
import type { LiftTubeDef } from '../level/types';
import type { PlayerState, WorldState } from './state';
import { Move } from './state';
import { bodyHeight, feetPos } from './movement';

/**
 * Does the player's body (its capsule, plus the ground check's few cm) touch the box `min..max`?
 * Points along the capsule's axis, each within its radius of the box.
 */
const bodyTouches = (p: PlayerState, ctx: SimContext, min: Vec3, max: Vec3): boolean => {
  const m = ctx.config.movement;
  const h = p.crouched ? m.crouchHeight : m.standHeight;
  const half = Math.max(0, h / 2 - m.radius);
  const reach = m.radius + 0.06;
  for (let k = 0; k <= 8; k++) {
    const c = madd(p.pos, p.up, half * (k / 4 - 1));
    const dx = Math.max(min.x - c.x, 0, c.x - max.x);
    const dy = Math.max(min.y - c.y, 0, c.y - max.y);
    const dz = Math.max(min.z - c.z, 0, c.z - max.z);
    if (dx * dx + dy * dy + dz * dz <= reach * reach) return true;
  }
  return false;
};

const ticksOf = (sec: number, dt: number): number => Math.max(1, Math.round(sec / dt));

/** A tube's middle line: unit direction base → top and its length. */
const tubeAxis = (t: LiftTubeDef): { axis: Vec3; length: number } => {
  const d = sub(t.top, t.base);
  const length = len(d);
  return { axis: length > 1e-6 ? scale(d, 1 / length) : v3(0, 1, 0), length };
};

/** How far below `base` a tube's mouth still pulls you in (m). */
const MOUTH_BELOW = 0.3;

/** Is any part of the player's body (feet to head) inside tube `t`'s cylinder? */
const inTube = (p: PlayerState, ctx: SimContext, t: LiftTubeDef): boolean => {
  const { axis, length } = tubeAxis(t);
  const feet = feetPos(p, ctx.config.movement);
  const h = bodyHeight(p, ctx.config.movement);
  const r2 = t.radius * t.radius;
  for (let k = 0; k <= 6; k++) {
    const rel = sub(madd(feet, p.up, (h * k) / 6), t.base);
    const along = dot(rel, axis);
    if (along < -MOUTH_BELOW || along > length) continue;
    const off = madd(rel, axis, -along);
    if (dot(off, off) <= r2) return true;
  }
  return false;
};

/** Put the player's feet at `feet` (keeping their body height). */
const placeFeet = (p: PlayerState, ctx: SimContext, feet: Vec3): void => {
  p.pos = madd(feet, p.up, bodyHeight(p, ctx.config.movement) / 2);
};

/**
 * The throw out of the top of a tube: a ballistic arc from `top` to `land` (feet), rising
 * `tubeArcHeight` above the higher of the two.
 */
export const tubeThrowVelocity = (t: LiftTubeDef, ctx: SimContext): Vec3 => {
  const m = ctx.config.movement;
  const g = Math.max(1e-3, m.gravity);
  const apex = Math.max(t.top.y, t.land.y) + Math.max(0.05, m.tubeArcHeight);
  const vy = Math.sqrt(2 * g * (apex - t.top.y));
  const time = vy / g + Math.sqrt((2 * (apex - t.land.y)) / g);
  return v3((t.land.x - t.top.x) / time, vy, (t.land.z - t.top.z) / time);
};

/** The player is airborne on a device's flight (a pad's or a tube's throw). */
const startFlight = (p: PlayerState): void => {
  p.padFlight = true; // (its landing never hurts)
  p.padSettle = 0;
  p.grounded = false;
  p.coyote = 0;
  p.jumpBuffer = 0;
  if (p.move !== Move.Float) p.move = Move.Air;
};

/** One tick riding up tube `i`: pulled onto its middle line and up, thrown out at the top. */
const rideTube = (world: WorldState, ctx: SimContext, p: PlayerState, i: number): void => {
  const t = ctx.level.def.liftTubes?.[i];
  if (!t) {
    p.tube = -1;
    return;
  }
  const m = ctx.config.movement;
  const dt = ctx.dt;
  const { axis, length } = tubeAxis(t);
  const rel = sub(feetPos(p, m), t.base);
  let along = dot(rel, axis);
  let off = madd(rel, axis, -along);
  // sideways: drawn onto the middle line at tubeCenterSpeed (never out of the side)
  const offLen = len(off);
  const pull = m.tubeCenterSpeed * dt;
  off = offLen <= pull ? v3() : scale(off, (offLen - pull) / offLen);
  // along: speeding up to tubeSpeed (a faster entry is slowed to it)
  const was = dot(p.vel, axis);
  const speed =
    was >= m.tubeSpeed ? m.tubeSpeed : Math.min(m.tubeSpeed, Math.max(0, was) + m.tubeAccel * dt);
  along += speed * dt;
  if (along < length) {
    placeFeet(p, ctx, add(madd(t.base, axis, along), off));
    p.vel = scale(axis, speed);
    p.grounded = false;
    p.move = Move.Air;
    return;
  }
  // the top: thrown in an arc onto the landing spot
  placeFeet(p, ctx, clone(t.top));
  p.vel = tubeThrowVelocity(t, ctx);
  p.tube = -1;
  p.tubeCd = ticksOf(m.tubeCooldownSec, dt);
  startFlight(p);
  world.events.push({ type: 'tubeExit', player: p.id, tube: i });
};

/**
 * Pad / tube flights end once you have stood on the ground for `padSettleSec` (so a brush with
 * a ledge on the way, or a landing on a pad that throws you again, never ends one early).
 */
const settleFlight = (ctx: SimContext, p: PlayerState): void => {
  if (!p.padFlight) return;
  if (!p.grounded) {
    p.padSettle = 0;
    return;
  }
  // (the tick you land on always counts as still flying)
  if (p.padSettle >= ticksOf(ctx.config.combat.padSettleSec, ctx.dt)) {
    p.padFlight = false;
    p.padSettle = 0;
  } else p.padSettle++;
};

export const updateDevices = (world: WorldState, ctx: SimContext, p: PlayerState): void => {
  settleFlight(ctx, p);
  if (p.tubeCd > 0) p.tubeCd--;
  if (!p.alive || p.frozen || p.rail || p.mantle) return;
  if (p.tube >= 0) {
    rideTube(world, ctx, p, p.tube);
    return;
  }
  const def = ctx.level.def;
  const tubes = def.liftTubes;
  if (tubes && p.tubeCd === 0)
    for (let i = 0; i < tubes.length; i++) {
      if (!inTube(p, ctx, tubes[i])) continue;
      // pulled in: no control of your own until the throw at the top (sim/movement.ts)
      p.tube = i;
      p.jetOn = false;
      p.jetHold = -1;
      p.dashTicks = 0;
      p.coyote = 0;
      p.jumpBuffer = 0;
      world.events.push({ type: 'tubeEnter', player: p.id, tube: i });
      rideTube(world, ctx, p, i);
      return;
    }
  const pads = def.launchPads;
  if (pads)
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      const inside = pad.touch
        ? bodyTouches(p, ctx, pad.min, pad.max)
        : pointInAabb(p.pos, pad.min, pad.max);
      if (!inside) continue;
      const speed = len(pad.vel);
      // a fresh launch (not the ticks after it while still inside the volume)
      if (dot(p.vel, pad.vel) < 0.9 * speed * speed)
        world.events.push({ type: 'launch', player: p.id, pad: i });
      p.vel = v3(pad.vel.x, pad.vel.y, pad.vel.z);
      startFlight(p);
      break;
    }
  const portals = def.portals;
  if (portals)
    for (let i = 0; i < portals.length; i++) {
      const pt = portals[i];
      if (!pointInAabb(p.pos, pt.min, pt.max)) continue;
      const from = clone(p.pos);
      const turn = pt.turn ?? 0;
      // (a compass turn to the right is a negative rotation about +y)
      const a = (-turn * Math.PI) / 180;
      p.pos = clone(pt.exit);
      if (pt.offset && pt.dir) {
        // across and up from the opening's middle (not along the way through), turned with you
        const mid = scale(add(pt.min, pt.max), 0.5);
        let off = sub(from, mid);
        off = madd(off, pt.dir, -dot(off, pt.dir));
        p.pos = add(pt.exit, rotateAxis(off, UP, a));
      }
      if (pt.vertical === 'zero') p.vel = v3(p.vel.x, 0, p.vel.z);
      if (turn !== 0) {
        p.vel = rotateAxis(p.vel, UP, a);
        p.view = qNormalize(qMul(qFromAxisAngle(UP, a), p.view));
        p.portalYaw = (((p.portalYaw + turn) % 360) + 360) % 360;
        world.events.push({
          type: 'portal',
          player: p.id,
          portal: i,
          from,
          to: clone(p.pos),
          turn,
        });
      } else world.events.push({ type: 'portal', player: p.id, portal: i, from, to: clone(p.pos) });
      break;
    }
};
