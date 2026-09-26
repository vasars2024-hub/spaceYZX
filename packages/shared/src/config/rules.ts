// Match structure per mode (build plan: "Match structure"). All tunable.

export interface ModeRules {
  roundSec: number;
  firstTo: number;
  maxRounds: number;
  carrierRevealEverySec: number;
  teamSize: number;
}

export const MODE_RULES: Record<'1v1' | '2v2' | '5v5', ModeRules> = {
  '1v1': { roundSec: 60, firstTo: 5, maxRounds: 9, carrierRevealEverySec: 5, teamSize: 1 },
  '2v2': { roundSec: 80, firstTo: 6, maxRounds: 11, carrierRevealEverySec: 5, teamSize: 2 },
  '5v5': { roundSec: 110, firstTo: 5, maxRounds: 9, carrierRevealEverySec: 5, teamSize: 5 },
};

export const RULES_DEFAULTS = {
  spawnLockSec: 5,
  resultsSec: 5,
  matchResultsSec: 12,
  carrierRevealSec: 1,
  // 1: both teams always see who carries each Controller (through walls); 0: pulses only
  carrierAlwaysRevealed: 1,
  lastSecondsRevealAll: 20,
  // Overtime when the timer runs out: the Tower switches off and the ship collapses into space
  // from the outside in; a safe zone around the middle shrinks and anyone outside it too long
  // dies. No draws: if it still isn't decided, alive players, then HP, then who's nearer the
  // middle, then a seeded coin flip.
  collapseShrinkSec: 25,
  collapseMaxSec: 35,
  collapseMinRadius: 6,
  collapseOutsideSec: 3,
  // ...or, by a seeded roll, the sky duel instead: everyone alive is teleported to a floating
  // arena above the clouds (level/sky-arena.ts; maps without one always collapse) with a
  // sped-up jetpack (movement skyJetpack*). Fall more than skyFallKillDepth metres below its
  // floor and you're out. It lasts skyOvertimeSec in total; still undecided: alive players,
  // then HP, then who's nearer the arena's middle, then a seeded coin flip.
  skyOvertimeChance: 0.25,
  skyOvertimeSec: 20,
  skyFallKillDepth: 6,
  // Bomb mode (see rules/bomb.ts). The fuse leaves defenders a full retake: regroup + travel
  // (the slowest route on the map, checked by a test) + the defuse + a margin for a fight.
  bombRoundSec: 100,
  bombPlantSec: 3,
  bombFuseSec: 35,
  bombDefuseSec: 7,
  bombUseRadius: 2, // how close a defender must be to defuse
  bombPickupRadius: 1.6,
  bombKillRadius: 10,
  bombDamageRadius: 20,
  controllerPickupSec: 0.5,
  controllerPickupRadius: 1.6,
  controllerReturnSec: 8,
  towerTouchRadius: 2.2,
  suddenDeathTowerScale: 2,
  // Power-ups (rules/powerups.ts; lethal loadout only, never in CS mode): at most
  // powerupsPerRound per live round, the first powerupFirstSec after the round goes live,
  // the next powerupSecondSec in (at a free spawn point: waits while all are taken)
  powerupsPerRound: 2,
  powerupFirstSec: 10,
  powerupSecondSec: 45,
  // bots that aren't busy walk to a power-up this close (metres) when they hold none
  powerupBotSeekRadius: 30,
  hardCapMin: 20, // longest match: 5v5, 9 rounds × (110 s + ~10 s between) ≈ 18 min
  warmupRespawnSec: 2,
} as const;

export type RulesConfig = { -readonly [K in keyof typeof RULES_DEFAULTS]: number };
