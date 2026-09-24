// Match structure per mode (build plan: "Match structure"). All tunable.

export interface ModeRules {
  roundSec: number;
  firstTo: number;
  maxRounds: number;
  carrierRevealEverySec: number;
  teamSize: number;
}

export const MODE_RULES: Record<'1v1' | '2v2' | '5v5', ModeRules> = {
  '1v1': { roundSec: 40, firstTo: 5, maxRounds: 8, carrierRevealEverySec: 5, teamSize: 1 },
  '2v2': { roundSec: 60, firstTo: 6, maxRounds: 11, carrierRevealEverySec: 5, teamSize: 2 },
  '5v5': { roundSec: 90, firstTo: 5, maxRounds: 9, carrierRevealEverySec: 5, teamSize: 5 },
};

export const RULES_DEFAULTS = {
  spawnLockSec: 5,
  resultsSec: 5,
  matchResultsSec: 12,
  carrierRevealSec: 1,
  lastSecondsRevealAll: 10,
  controllerPickupSec: 0.5,
  controllerPickupRadius: 1.6,
  controllerReturnSec: 8,
  towerTouchRadius: 2.2,
  suddenDeathTowerScale: 2,
  hardCapMin: 15,
  warmupRespawnSec: 2,
} as const;

export type RulesConfig = { -readonly [K in keyof typeof RULES_DEFAULTS]: number };
