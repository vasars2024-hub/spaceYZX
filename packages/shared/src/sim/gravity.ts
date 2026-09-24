// Gravity: level zones (with pad overrides) -> a gravity vector at any point.
import type { Vec3 } from '../math/vec3';
import { v3, scale, lenSq } from '../math/vec3';
import { pointInAabb } from '../level/level';
import type { SimContext } from './context';
import type { WorldState } from './state';

/** Gravity direction (unit or zero) at point p, before scaling by g. */
export const gravityDirAt = (ctx: SimContext, world: WorldState, p: Vec3): Vec3 => {
  const zones = ctx.level.zones;
  let best = -1;
  let bestPri = -Infinity;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const pri = z.priority ?? 0;
    if (pri >= bestPri && pointInAabb(p, z.min, z.max)) {
      best = i;
      bestPri = pri;
    }
  }
  if (best < 0) return ctx.level.def.defaultGravity;
  const rt = world.zones[best];
  if (rt && rt.override) return rt.override;
  return zones[best].gravity;
};

/** Gravity vector (m/s²) at point p. */
export const gravityAt = (ctx: SimContext, world: WorldState, p: Vec3): Vec3 =>
  scale(gravityDirAt(ctx, world, p), ctx.config.movement.gravity);

export const isZeroG = (g: Vec3): boolean => lenSq(g) < 1e-6;

/** Advance gravity-pad triggers and expire zone overrides. */
export const updateGravityPads = (ctx: SimContext, world: WorldState): void => {
  for (const z of world.zones) {
    if (z.override && world.tick >= z.until) z.override = null;
  }
  const pads = ctx.level.def.pads;
  for (let i = 0; i < pads.length; i++) {
    if (world.tick < world.padReadyAt[i]) continue;
    const pad = pads[i];
    for (const p of world.players) {
      if (!p.alive || !pointInAabb(p.pos, pad.min, pad.max)) continue;
      const zi = ctx.level.zoneIndex.get(pad.zone);
      if (zi === undefined) break;
      const durTicks = Math.round(pad.durationSec / ctx.dt);
      world.zones[zi] = {
        override: v3(pad.gravity.x, pad.gravity.y, pad.gravity.z),
        until: world.tick + durTicks,
      };
      world.padReadyAt[i] = world.tick + Math.round(pad.cooldownSec / ctx.dt) + durTicks;
      world.events.push({ type: 'padFlip', pad: i, zone: zi });
      break;
    }
  }
};
