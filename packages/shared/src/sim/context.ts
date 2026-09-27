import type { Hitbox } from './hitbox';
import type { Vec3 } from '../math/vec3';
import type { Level } from '../level/level';
import type { GameConfig } from '../config';

export interface SimContext {
  level: Level;
  config: GameConfig;
  dt: number; // seconds per tick (1/60)
  /**
   * Server lag compensation: hitboxes as the given shooter saw them (rewound). When absent,
   * current positions are used (offline / client prediction).
   */
  rewindHitboxes?: (shooterId: number) => Hitbox[] | null;
  /**
   * Server lag compensation for projectiles: where `viewerId` saw a Boomerang/grenade (null =
   * no history). Used to be a little generous with deflects and grenade shots.
   */
  rewindPos?: (viewerId: number, kind: 'boomerang' | 'grenade', id: number) => Vec3 | null;
  /** Client prediction: emit hit events but never change health (the server decides). */
  noDamage?: boolean;
  /**
   * Free-for-all (Brawl FFA, rules/brawl.ts): everyone else is an enemy whatever their `team`
   * (damage, freezes, blasts, throw previews, bots). Team modes leave it off.
   */
  ffa?: boolean;
}

/** Are `a` and `b` two different players on the same side? Never in a free-for-all. */
export const isTeammate = (
  ctx: Pick<SimContext, 'ffa'>,
  a: { id: number; team: number },
  b: { id: number; team: number },
): boolean => a.id !== b.id && !ctx.ffa && a.team === b.team;

/** Are `a` and `b` enemies (two different players not on the same side)? */
export const isEnemy = (
  ctx: Pick<SimContext, 'ffa'>,
  a: { id: number; team: number },
  b: { id: number; team: number },
): boolean => a.id !== b.id && (!!ctx.ffa || a.team !== b.team);

export const secToTicks = (sec: number, dt: number): number => Math.max(0, Math.round(sec / dt));
