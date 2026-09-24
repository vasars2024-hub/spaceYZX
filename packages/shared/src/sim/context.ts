import type { Hitbox } from './hitbox';
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
}

export const secToTicks = (sec: number, dt: number): number => Math.max(0, Math.round(sec / dt));
