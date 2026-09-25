// How the Controller & Tower objective reads on screen (pure helpers for markers and the
// match HUD). Map data stores Towers and Controller homes by map *side*; teams swap sides at
// half time, so everything here goes through `sideSwapped`.
import type { LevelDef, Vec3 } from '@space-yz/shared';
import { v3, sub, len, TICK_DT, TICK_RATE } from '@space-yz/shared';

export const TEAM_COLOR = ['#19e3ff', '#ff8a1f'] as const;
export const TEAM_HEX = [0x19e3ff, 0xff8a1f] as const;

/** Which team owns the Tower built on map side `mapSide` this round, and do you attack it? */
export const towerRole = (
  mapSide: 0 | 1,
  sideSwapped: boolean,
  myTeam: 0 | 1,
): { owner: 0 | 1; attack: boolean } => {
  const owner = (mapSide ^ (sideSwapped ? 1 : 0)) as 0 | 1;
  return { owner, attack: owner !== myTeam };
};

/** Where a team's Controller goes back to (same rule as the match rules' home). */
export const controllerHome = (def: LevelDef, team: 0 | 1, sideSwapped: boolean): Vec3 | null => {
  const side = (team ^ (sideSwapped ? 1 : 0)) as 0 | 1;
  const home = def.controllerHomes?.[side];
  if (home) return home;
  const s = def.spawns.find((sp) => sp.team === side) ?? def.spawns[0];
  return s ? v3(s.pos.x, s.pos.y + 0.9, s.pos.z) : null;
};

/** Is a dropped Controller lying at its home (returned), where no countdown applies? */
export const controllerAtHome = (
  def: LevelDef,
  team: 0 | 1,
  sideSwapped: boolean,
  droppedAt: Vec3,
): boolean => {
  const home = controllerHome(def, team, sideSwapped);
  return !!home && len(sub(home, droppedAt)) < 0.75;
};

/**
 * Seconds until a dropped Controller returns to base. The match view's `returnAt` is the tick
 * it was dropped (`droppedTick`); the rules send it home `controllerReturnSec` later.
 */
export const controllerReturnLeft = (returnAt: number, tick: number, returnSec: number): number =>
  Math.max(0, Math.ceil((returnAt + Math.round(returnSec / TICK_DT) - tick) / TICK_RATE));

/** Marker text for a dropped Controller. */
export const controllerText = (mine: boolean, atHome: boolean, secondsLeft: number): string =>
  `◆ ${mine ? 'YOUR' : 'ENEMY'} CONTROLLER ${atHome ? '· AT BASE' : `${secondsLeft}s`}`;
