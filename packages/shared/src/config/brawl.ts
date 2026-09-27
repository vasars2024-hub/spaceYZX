// Brawl numbers (rules/brawl.ts: quick drop-in TDM / FFA with instant respawns). All tunable.
// Kept out of GameConfig like the Arena's: only the rules (server / offline practice) read them,
// the client just shows the Brawl state it is sent.

export const BRAWL_DEFAULTS = {
  /** a dead player is back this long after dying */
  respawnSec: 2,
  /** spawn protection after every (re)spawn: shown as the shield, ends early when you attack */
  protectSec: 1.5,
  /** FFA: the first player to this many kills wins */
  ffaKills: 20,
  /** TDM: the first team to this many kills wins */
  tdmKills: 50,
  /** the match timer: most kills when it runs out wins (equal: a draw) */
  timeLimitSec: 300,
  /** the results screen, then the next Brawl starts on the next map */
  resultsSec: 10,
  /**
   * Safe spawns: a spawn point an enemy can see counts as this many metres nearer to the
   * enemies (so an out-of-sight spawn beats a slightly farther one in plain view)
   */
  seenPenaltyM: 30,
  /** distances beyond this count the same (every far enough spawn is equally safe) */
  safeFarM: 45,
  /** another player standing this close to a spawn point blocks it */
  occupiedM: 1.6,
  /** spawn choice: any point within this many metres of the best score may be picked */
  spawnSlackM: 6,
  /** power-ups: a new cycle every this many seconds (one appears `powerupFirstSec` into it) */
  powerupCycleSec: 30,
} as const;

export type BrawlSettings = { -readonly [K in keyof typeof BRAWL_DEFAULTS]: number };

export const brawlSettings = (patch: Partial<BrawlSettings> = {}): BrawlSettings => ({
  ...BRAWL_DEFAULTS,
  ...patch,
});

/** Public Brawl rooms (server quick play): how big they get and how many bots keep them busy. */
export const PUBLIC_BRAWL = {
  /** most humans (and players) in one public room */
  maxPlayers: 10,
  /** bots top a public room up to this many players and leave as humans join */
  fillTo: 8,
  /** the bots' difficulty in public rooms */
  botSkill: 'casual',
  /** at most this many public rooms per playlist (TDM / FFA) */
  maxRooms: 20,
} as const;
