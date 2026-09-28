// The Race ladder (parkour races, rules/race.ts): its own rating, separate from every combat
// ladder. Pure functions only — the server's Race queue and ranked store (services/queue.ts,
// services/ranked.ts recordRace) apply them to ranked races; rating/ladders.ts lists the ladder.
//
// Rating: multiplayer Elo from the finishing order. Every pair of racers in a race is one
// game (ahead = a win, same place = a draw: DNFs all tie for last), and a racer's change is
// K × the average of (result − expected) over their opponents — so beating all 7 of an
// 8-racer field moves you about as much as beating one opponent in a 1v1 race, not 7 times as
// much. New racers start at 1000; their first `placementRaces` races count double (K ×
// placementMul). Leaving a race counts as a DNF plus `leaverPenalty`. A solo time trial
// doesn't change the rating.
//
// Personal bests: the fastest finish per track with its splits (for split times on the HUD
// and a PB ghost), kept per player.

export const RACE_START_RATING = 1000;
export const RACE_PLACEMENT_RACES = 5;
/** rating points for a full win over the field (Elo K) */
export const RACE_K = 32;
export const RACE_PLACEMENT_MUL = 2;
export const RACE_LEAVER_PENALTY = 10;

export interface RaceRatingPlayer {
  /** current Race rating (RACE_START_RATING for a newcomer) */
  rating: number;
  /** races already rated (under RACE_PLACEMENT_RACES: placement) */
  races: number;
  /** 1 = first; equal places are a tie (every DNF shares the last place) */
  place: number;
  /** left the race before the end */
  left?: boolean;
}

export interface RaceRatingOptions {
  k?: number;
  placementRaces?: number;
  placementMul?: number;
  leaverPenalty?: number;
}

export interface RaceRatingUpdate {
  rating: number;
  /** new − old (penalties included) */
  delta: number;
  /** this race was one of the racer's placement races */
  placement: boolean;
}

/** Elo expectation that a racer rated `a` finishes ahead of one rated `b`. */
export const raceExpected = (a: number, b: number): number => 1 / (1 + 10 ** ((b - a) / 400));

/** New Race ratings after one race, in the order of `players`. */
export const updateRaceRatings = (
  players: readonly RaceRatingPlayer[],
  opts: RaceRatingOptions = {},
): RaceRatingUpdate[] => {
  const k = opts.k ?? RACE_K;
  const placementRaces = opts.placementRaces ?? RACE_PLACEMENT_RACES;
  const mul = opts.placementMul ?? RACE_PLACEMENT_MUL;
  const penalty = opts.leaverPenalty ?? RACE_LEAVER_PENALTY;
  const n = players.length;
  return players.map((p, i) => {
    const placement = p.races < placementRaces;
    let sum = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const o = players[j];
      const score = p.place < o.place ? 1 : p.place > o.place ? 0 : 0.5;
      sum += score - raceExpected(p.rating, o.rating);
    }
    let delta = n > 1 ? (k * (placement ? mul : 1) * sum) / (n - 1) : 0;
    if (p.left) delta -= penalty;
    delta = Math.round(delta * 10) / 10;
    return { rating: p.rating + delta, delta, placement };
  });
};

/**
 * Ratings in, places from a race's standings (rules/race.ts RaceResult.standings order) out:
 * the input for updateRaceRatings. `ratingOf(id)` gives each racer's rating and races played.
 */
export const raceRatingPlayers = (
  standings: readonly { id: number; place: number; left: boolean }[],
  ratingOf: (id: number) => { rating: number; races: number },
): RaceRatingPlayer[] =>
  standings.map((s) => ({ ...ratingOf(s.id), place: s.place, left: s.left }));

// ------------------------------------------------------------------------------------------
// Personal bests

/**
 * Layout revision of each track whose course was rebuilt (a track not listed is revision 1).
 * Bests and ghosts set on an older revision are dropped: they were raced on another track.
 * Raise a track's number whenever its course changes enough that old times mean nothing.
 */
export const TRACK_REVISIONS: Readonly<Record<string, number>> = {
  // the 2026-09 revamp (docs/movement-map-design/race/REVAMP.md)
  'race-sunspire': 2,
  'race-neon': 2,
  'race-ember': 2,
};

export const trackRevision = (track: string): number => TRACK_REVISIONS[track] ?? 1;

export interface RacePersonalBest {
  /** map id of the track */
  track: string;
  timeMs: number;
  /** time at each gate (ms from GO; the last one is the finish) */
  splitsMs: number[];
  /** when it was set (ms since 1970; 0 = unknown) */
  at: number;
  /** the track's layout revision it was set on (missing = 1; see TRACK_REVISIONS) */
  rev?: number;
}

export type RacePersonalBests = Record<string, RacePersonalBest>;

/** The bests without those set on an older layout of their track. */
export const currentBests = (pbs: Readonly<RacePersonalBests>): RacePersonalBests => {
  const out: RacePersonalBests = {};
  for (const [track, pb] of Object.entries(pbs))
    if ((pb.rev ?? 1) === trackRevision(track)) out[track] = pb;
  return out;
};

/**
 * Record a finished run: returns the updated bests (a new object) and whether it was a new
 * personal best on that track (and the old one).
 */
export const updatePersonalBest = (
  pbs: Readonly<RacePersonalBests>,
  track: string,
  timeMs: number,
  splitsMs: readonly number[],
  at = 0,
): { pbs: RacePersonalBests; improved: boolean; previous: RacePersonalBest | null } => {
  const rev = trackRevision(track);
  const old = pbs[track];
  const previous = old && (old.rev ?? 1) === rev ? old : null;
  if (!(timeMs > 0) || (previous && previous.timeMs <= timeMs))
    return { pbs: { ...pbs }, improved: false, previous };
  return {
    pbs: { ...pbs, [track]: { track, timeMs, splitsMs: splitsMs.slice(), at, rev } },
    improved: true,
    previous,
  };
};

/**
 * Your split at gate `i` against your personal best (ms; negative = faster, green), or null
 * when there is no best to compare with.
 */
export const splitDelta = (
  pb: Pick<RacePersonalBest, 'splitsMs'> | null | undefined,
  i: number,
  ms: number,
): number | null => {
  const ref = pb?.splitsMs[i];
  return ref === undefined ? null : ms - ref;
};

/** "1:23.45" (race clock). */
export const formatRaceTime = (ms: number): string => {
  const t = Math.max(0, Math.round(ms / 10));
  const cs = t % 100;
  const s = Math.floor(t / 100) % 60;
  const m = Math.floor(t / 6000);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};

/** "+1.23" / "−0.45" (a split against a personal best). */
export const formatSplitDelta = (ms: number): string => {
  const s = Math.abs(ms) / 1000;
  return `${ms <= 0 ? '−' : '+'}${s.toFixed(2)}`;
};
