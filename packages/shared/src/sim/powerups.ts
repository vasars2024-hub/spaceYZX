// Power-ups: pick-ups floating at the map's power-up points (LevelDef.powerups). The match
// rules decide when one appears (rules/powerups.ts); walking or flying into it picks it up.
// You hold one at a time and can't pick up another while you do. What they do lives in
// sim/combat.ts: Freeze (hits also stun the victim) and Double boomerang (Quick Throws split).
//
// Lethal loadout only (config/loadout.ts `powerups`): CS mode never has any.
import type { Vec3 } from '../math/vec3';
import { clone, madd } from '../math/vec3';
import { closestPointSeg } from '../math/geom';
import { loadoutOf } from '../config/loadout';
import type { SimContext } from './context';
import type { PlayerState, WorldState } from './state';
import { Powerup, type PowerupPickup } from './combat-state';
import { feetPos } from './movement';

/** Charges a freshly picked up power-up has. */
export const powerupCharges = (ctx: SimContext, kind: 1 | 2): number =>
  kind === Powerup.Freeze ? ctx.config.combat.freezeCharges : ctx.config.combat.doubleCharges;

/** Is this pick-up within reach of the player's body (the line from feet to head)? */
export const touchesPowerup = (p: PlayerState, pos: Vec3, ctx: SimContext): boolean => {
  const m = ctx.config.movement;
  const feet = feetPos(p, m);
  const head = madd(feet, p.up, p.crouched ? m.crouchHeight : m.standHeight);
  const r = ctx.config.combat.powerupPickupRadius;
  return closestPointSeg(pos, feet, head).distSq <= r * r;
};

/**
 * Pick-ups: every living, unlocked player who holds no power-up takes one they touch (players
 * in id order within the world's list, so it's the same everywhere). `only`: client prediction
 * (just the local player).
 */
export const updatePowerupPickups = (world: WorldState, ctx: SimContext, only?: number): void => {
  if (!world.powerups.length || !loadoutOf(ctx.config).powerups) return;
  for (const p of world.players) {
    if (only !== undefined && p.id !== only) continue;
    if (!p.alive || p.frozen || p.powerup !== Powerup.None) continue;
    const i = world.powerups.findIndex((u) => touchesPowerup(p, u.pos, ctx));
    if (i < 0) continue;
    const u = world.powerups[i];
    world.powerups.splice(i, 1);
    p.powerup = u.kind;
    p.powerupCharges = powerupCharges(ctx, u.kind);
    world.events.push({
      type: 'powerupPickup',
      player: p.id,
      id: u.id,
      kind: u.kind,
      pos: clone(u.pos),
    });
  }
};

/** Put a power-up of `kind` at `pos` (the match rules call this). */
export const spawnPowerup = (world: WorldState, pos: Vec3, kind: 1 | 2): PowerupPickup => {
  const u: PowerupPickup = { id: world.nextId++, kind, pos: clone(pos), spawnTick: world.tick };
  world.powerups.push(u);
  world.events.push({ type: 'powerupSpawn', id: u.id, kind, pos: clone(pos) });
  return u;
};

/** Round over: no power-ups lying around, no twins in the air, nobody stunned. */
export const clearPowerups = (world: WorldState): void => {
  world.powerups = [];
  world.twins = [];
  for (const p of world.players) p.stun = 0;
};
