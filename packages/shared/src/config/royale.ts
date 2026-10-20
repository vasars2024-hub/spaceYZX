// Royale numbers (rules/royale.ts: the free-for-all elimination mode on the big royale maps —
// one life, a shrinking zone, last player standing wins). All tunable. Kept out of GameConfig
// like the Brawl's and the Arena's: only the rules (server / offline practice) read them, the
// client just shows the Royale state it is sent.

export const ROYALE_DEFAULTS = {
  /** players in a round (5–10 in the menus; the rules cope with 2 and up) */
  minPlayers: 2,
  maxPlayers: 10,
  /** everyone stands frozen at their spawn this long before the fight starts */
  countdownSec: 5,
  /**
   * A match is a series of rounds with the same players: the first to win this many rounds
   * wins the match.
   */
  winsToWin: 3,
  /** between rounds: the round's placings and everyone's round wins, then the next round */
  roundResultsSec: 7,
  /** the match results screen (final standings), then the room goes back to its lobby */
  resultsSec: 12,
  /**
   * Each later round is quicker: every zone wait / shrink time is multiplied by this once per
   * round already played (round 1 × 1, round 2 × 0.85, round 3 × 0.72, …) but never below
   * `minRoundTimeFactor` (so round 5 and later all play at × 0.52 → × 0.5).
   */
  roundTimeFactor: 0.85,
  minRoundTimeFactor: 0.5,
  /**
   * ...and the first circle starts a little smaller: the starting radius × this per round
   * already played (round 2 × 0.92, round 3 × 0.85, …), never below `minRoundRadiusFactor`.
   */
  roundRadiusFactor: 0.92,
  minRoundRadiusFactor: 0.6,
  /** lobby (online rooms, waiting for players): the dead are back after this */
  lobbyRespawnSec: 2.5,
  /** host pressed start, or the room filled up: the round starts this long after */
  startDelaySec: 3,
  /**
   * Spawns: the round's spawn points are the set of `players` points with the largest smallest
   * gap between any two. Every set at least this good (fraction of the best gap) may be picked
   * by the seeded roll, so rounds don't always use the very same spots.
   */
  spawnSlack: 0.9,
  /**
   * Zone timing is written for a map whose zone starts at this radius (a ~1 km map). Other maps
   * scale every wait / shrink time by sqrt(radius / refRadius), kept within the two limits below
   * (a small map gets shorter stages, but never silly short ones).
   */
  refRadiusM: 500,
  minTimeScale: 0.4,
  maxTimeScale: 1.25,
  /** zone damage is dealt in pulses this far apart (damage per second × the pulse) */
  zonePulseSec: 0.5,
  /**
   * Location flashes: every alive player is shown to everyone (minimap, world marker, compass)
   * for this long...
   */
  flashSec: 1.5,
  /**
   * ...every `flashMaxSec` seconds with `flashMaxAlive` (or more) players alive, down to every
   * `flashMinSec` seconds with 2 alive, in a straight line between (rules/royale.ts
   * flashIntervalSec explains why).
   */
  flashMaxSec: 45,
  flashMinSec: 10,
  flashMaxAlive: 10,
} as const;

export type RoyaleSettings = { -readonly [K in keyof typeof ROYALE_DEFAULTS]: number };

export const royaleSettings = (patch: Partial<RoyaleSettings> = {}): RoyaleSettings => ({
  ...ROYALE_DEFAULTS,
  ...patch,
});

/**
 * One zone stage: the zone holds still for `waitSec` (the next circle is already shown), then
 * closes in to `radius` (a fraction of the starting radius) over `shrinkSec`. Outside the zone
 * you lose `dps` HP per second (100 HP in all) — more each stage. Times are for a map at
 * `refRadiusM`; other maps scale them (see above).
 *
 * At the reference size the whole plan runs 7 min 45 s until the zone is gone; a 10-player
 * first round usually ends a minute or two before that, so it lasts ~6–8 minutes. Later rounds
 * of a match run quicker (`roundTimeFactor`) on a smaller first circle (`roundRadiusFactor`).
 */
export interface RoyaleStageDef {
  waitSec: number;
  shrinkSec: number;
  radius: number;
  dps: number;
}

export const ROYALE_STAGES: readonly RoyaleStageDef[] = [
  { waitSec: 60, shrinkSec: 60, radius: 0.6, dps: 1 },
  { waitSec: 50, shrinkSec: 50, radius: 0.36, dps: 2 },
  { waitSec: 40, shrinkSec: 40, radius: 0.2, dps: 4 },
  { waitSec: 30, shrinkSec: 35, radius: 0.1, dps: 7 },
  { waitSec: 25, shrinkSec: 30, radius: 0.04, dps: 10 },
  // the last circle closes completely: nobody can hide in it forever
  { waitSec: 20, shrinkSec: 25, radius: 0, dps: 15 },
];
