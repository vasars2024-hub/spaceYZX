// Power-up rules: when and where power-ups appear during a live round (Tower and Bomb
// objectives, lethal loadout only — never in CS mode), and which one. The pick-up itself and
// what they do are simulation (sim/powerups.ts, sim/combat.ts).
//
// Per live round: the first one `powerupFirstSec` after the round goes live, the next one
// `powerupSecondSec` in, at most `powerupsPerRound`. Each goes to a free power-up point of the
// map (LevelDef.powerups; a later one waits while every point is taken). Which point and which
// power-up come from the world's seeded RNG.
import type { Vec3 } from '../math/vec3';
import { len, sub, clone } from '../math/vec3';
import { rngFloat, rngInt } from '../math/rng';
import { loadoutOf } from '../config/loadout';
import type { SimContext } from '../sim/context';
import type { WorldState } from '../sim/state';
import { Powerup } from '../sim/combat-state';
import { spawnPowerup } from '../sim/powerups';

const secTicks = (s: number, dt: number) => Math.round(s / dt);

/** Does this match get power-ups at all (map has points, loadout allows them)? */
export const powerupsEnabled = (ctx: SimContext): boolean =>
  loadoutOf(ctx.config).powerups && (ctx.level.def.powerups?.length ?? 0) > 0;

/**
 * One live tick: spawn the round's next power-up when it's due. `liveSince` = the tick the
 * round went live, `spawned` = how many this round already had. Returns the new count.
 */
export const updateRoundPowerups = (
  world: WorldState,
  ctx: SimContext,
  liveSince: number,
  spawned: number,
): number => {
  const r = ctx.config.rules;
  if (spawned >= r.powerupsPerRound || !powerupsEnabled(ctx)) return spawned;
  const dueSec = spawned === 0 ? r.powerupFirstSec : r.powerupSecondSec;
  if (world.tick - liveSince < secTicks(dueSec, ctx.dt)) return spawned;
  const free = (ctx.level.def.powerups ?? []).filter(
    (pt) => !world.powerups.some((u) => len(sub(u.pos, pt)) < 0.5),
  );
  if (!free.length) return spawned;
  const pos = free.length === 1 ? free[0] : free[rngInt(world.rng, free.length)];
  const kind = rngFloat(world.rng) < 0.5 ? Powerup.Freeze : Powerup.Double;
  spawnPowerup(world, pos, kind);
  return spawned + 1;
};

/**
 * Bots: a power-up worth walking to for this player (the nearest one within
 * `powerupBotSeekRadius` while they hold none), else null.
 */
export const botPowerupGoal = (world: WorldState, ctx: SimContext, id: number): Vec3 | null => {
  const p = world.players.find((q) => q.id === id);
  if (!p || !p.alive || p.powerup !== Powerup.None || !world.powerups.length) return null;
  let best: Vec3 | null = null;
  let bestD = ctx.config.rules.powerupBotSeekRadius;
  for (const u of world.powerups) {
    const d = len(sub(u.pos, p.pos));
    if (d <= bestD) {
      bestD = d;
      best = u.pos;
    }
  }
  return best ? clone(best) : null;
};
