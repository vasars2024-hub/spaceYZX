// Bots and the charged Gravity Grenade / remote mine (both kits).
// - Grenade: at mid range a bot picks the charge whose predicted landing (the same
//   predictGrenade the players' preview uses) is closest to its target, holds Q that long and
//   lets go. It skips throws that would land on itself or a teammate.
// - Mine: a bot drops its mine on a bomb site, or now and then at a spot on its way (not near a
//   spawn), and sets it off when an enemy walks into the blast while no teammate (nor itself)
//   is in it.
import type { Vec3 } from '../math/vec3';
import { len, sub, madd } from '../math/vec3';
import { rngFloat } from '../math/rng';
import { lineOfSight } from '../level/collision';
import { pointInAabb } from '../level/level';
import { loadoutOf } from '../config/loadout';
import type { SimContext } from '../sim/context';
import { isEnemy, isTeammate } from '../sim/context';
import { Btn } from '../sim/input';
import type { PlayerState, WorldState } from '../sim/state';
import { MineSlot } from '../sim/combat-state';
import { predictGrenade, grenadeChargeTicks } from '../sim/grenade';
import { mineCenter, mineRefusal } from '../sim/mine';
import { hitboxOf, pointHitboxDist } from '../sim/hitbox';
import type { BotMemory } from './brain';

const UTILITY_KEYS = Btn.Grenade | Btn.NadeBounce | Btn.MinePlace | Btn.MineDetonate;

/** Per-bot state for the grenade / mine (in BotMemory.util). */
export interface BotUtilityMemory {
  /** ticks of holding Q still to go (0 = not throwing) */
  nadeHold: number;
}

const planar = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Pick the charge (ticks held) that lands closest to `at`, or null if none lands near / safe. */
const pickCharge = (
  world: WorldState,
  ctx: SimContext,
  self: PlayerState,
  at: Vec3,
): number | null => {
  const full = grenadeChargeTicks(ctx.config.combat, ctx.dt) + 1;
  const safe = ctx.config.combat.grenadeDamageRadius;
  let best: { charge: number; err: number } | null = null;
  for (let charge = 1; charge <= full; charge += 6) {
    const path = predictGrenade(world, ctx, self, self.view, charge, self.nadeBounces);
    const err = len(sub(path.end, at));
    // never on yourself or a teammate
    if (planar(path.end, self.pos) < safe) continue;
    if (
      world.players.some(
        (m) =>
          m.alive &&
          m.id !== self.id &&
          isTeammate(ctx, m, self) &&
          len(sub(m.pos, path.end)) < safe,
      )
    )
      continue;
    if (!best || err < best.err) best = { charge, err };
  }
  return best && best.err < 4 ? best.charge : null;
};

/** Is `pos` on a bomb site? */
const onSite = (ctx: SimContext, pos: Vec3): boolean =>
  (ctx.level.def.bombSites ?? []).some((s) => pointInAabb(pos, s.min, s.max));

/** The grenade / mine keys for this tick (added to the bot's other buttons). */
export const botUtilityButtons = (
  world: WorldState,
  ctx: SimContext,
  self: PlayerState,
  mem: BotMemory,
  buttons: number,
  target: PlayerState | undefined,
  fighting: boolean,
): number => {
  const c = ctx.config.combat;
  const rng = mem.rng;
  const u = (mem.util ??= { nadeHold: 0 });
  let b = buttons & ~UTILITY_KEYS;

  // ---- grenade ----
  if (u.nadeHold > 0) {
    // the throw was cancelled (stunned, killed): forget it
    if (self.nadeCharge === 0) u.nadeHold = 0;
    else {
      u.nadeHold--;
      b |= Btn.Grenade; // keep holding; letting go (nadeHold 0) throws
    }
  } else if (
    loadoutOf(ctx.config).grenade &&
    target &&
    fighting &&
    self.grenadesLeft > 0 &&
    self.nadeCharge === 0 &&
    !(self.prevButtons & Btn.Grenade)
  ) {
    const dist = len(sub(target.pos, self.pos));
    if (dist > 8 && dist < 30 && rngFloat(rng) < mem.skill.grenadeChance) {
      const charge = pickCharge(world, ctx, self, target.pos);
      if (charge !== null) {
        b |= Btn.Grenade; // this press counts as the first tick held
        u.nadeHold = charge - 1;
      }
    }
  }

  // ---- remote mine ----
  if (!(c.mineEnabled > 0)) return b;
  if (self.mineSlot === MineSlot.Ready && !mineRefusal(world, ctx, self)) {
    const nearSpawn = ctx.level.def.spawns.some((s) => len(sub(s.pos, self.pos)) < 14);
    const want = onSite(ctx, self.pos)
      ? !fighting && rngFloat(rng) < 0.02
      : !fighting && !nearSpawn && rngFloat(rng) < 0.0015;
    if (want) b |= Btn.MinePlace;
  } else if (self.mineSlot === MineSlot.Placed && !(self.prevButtons & Btn.MineDetonate)) {
    const m = world.mines.find((x) => x.owner === self.id);
    if (m && world.tick - m.placedTick >= Math.round(c.mineArmSec / ctx.dt)) {
      const center = mineCenter(m);
      const inBlast = (p: PlayerState, r: number) =>
        p.alive &&
        pointHitboxDist(center, hitboxOf(p, ctx.config)) <= r &&
        lineOfSight(ctx.level, center, madd(p.pos, p.up, 0.3));
      const enemyIn = world.players.some(
        (p) => isEnemy(ctx, p, self) && inBlast(p, c.mineRadius * 0.85),
      );
      const friendIn = world.players.some(
        (p) => (p.id === self.id || isTeammate(ctx, p, self)) && inBlast(p, c.mineRadius + 0.5),
      );
      if (enemyIn && !friendIn && rngFloat(rng) < 0.5) b |= Btn.MineDetonate;
    }
  }
  return b;
};
