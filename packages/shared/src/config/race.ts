// Parkour race numbers (rules/race.ts). Kept out of GameConfig like the Arena's: only the rules
// (server / offline practice) read them; the client shows the race state it is sent. The
// per-racer movement numbers (surge, race jetpack tank, respawn penalty) are movement config.

export const RACE_DEFAULTS = {
  /** lobby: the countdown starts this long after the first racer is in (host can start sooner) */
  lobbySec: 20,
  /** ranked races (the Race queue): everyone arrives together, so a short lobby */
  rankedLobbySec: 8,
  /** 3-2-1: everyone frozen on the start grid */
  countdownSec: 3,
  /** a racer still out when the clock reaches `dnfParMul` × the track's par time: DNF */
  dnfParMul: 2,
  /** once every racer but one is done, the last one gets this long (never past the limit) */
  lastRacerGraceSec: 30,
  /** results screen, then back to the lobby (the next race starts by itself) */
  resultsSec: 12,
  minRacers: 1,
  maxRacers: 8,
} as const;

export type RaceSettings = { -readonly [K in keyof typeof RACE_DEFAULTS]: number };

export const raceSettings = (patch: Partial<RaceSettings> = {}): RaceSettings => ({
  ...RACE_DEFAULTS,
  ...patch,
});
