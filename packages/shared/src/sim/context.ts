import type { Level } from '../level/level';
import type { GameConfig } from '../config';

export interface SimContext {
  level: Level;
  config: GameConfig;
  dt: number; // seconds per tick (1/60)
}

export const secToTicks = (sec: number, dt: number): number => Math.max(0, Math.round(sec / dt));
