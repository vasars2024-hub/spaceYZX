// Team matches: each player is rated individually against one virtual opponent that
// stands for the whole enemy team (average rating, root-mean-square RD).

import { DEFAULT_TAU, DEFAULT_VOL, updateRating } from './glicko2';
import type { Rating } from './glicko2';

export const PLACEMENT_GAMES = 5;
export const DEFAULT_PLACEMENT_FACTOR = 1.6;
export const DEFAULT_TEAM_KILL_PENALTY = 8;
export const DEFAULT_LEAVER_PENALTY = 15;

/** Per-player values, indexed like `teams`: [team 0 players, team 1 players]. */
export type PerPlayer<T> = [T[], T[]];

export interface TeamMatchOptions {
  tau?: number;
  /** Placement games the player still has in this mode (>0 = placement match). */
  placementGamesLeft?: PerPlayer<number>;
  /** Rating delta multiplier during placements. */
  placementFactor?: number;
  /** Number of team kills per player. */
  teamKills?: PerPlayer<number>;
  /** Rating points lost per team kill. */
  teamKillPenalty?: number;
  /** Player left before the end: counts as a loss plus `leaverPenalty`. */
  leftEarly?: PerPlayer<boolean>;
  leaverPenalty?: number;
}

export interface TeamMatchInput {
  teams: [Rating[], Rating[]];
  /** Winning team index, or null for a draw. */
  winner: 0 | 1 | null;
  options?: TeamMatchOptions;
}

export interface PlayerRatingUpdate {
  rating: Rating;
  /** New rating minus old rating (public scale), penalties included. */
  delta: number;
}

/** One virtual opponent for a team: mean rating, root-mean-square RD. */
export const virtualOpponent = (team: readonly Rating[]): Rating => {
  if (team.length === 0) throw new Error('virtualOpponent: empty team');
  let r = 0;
  let rd2 = 0;
  for (const p of team) {
    r += p.rating;
    rd2 += p.rd * p.rd;
  }
  return { rating: r / team.length, rd: Math.sqrt(rd2 / team.length), vol: DEFAULT_VOL };
};

export const updateTeamMatch = ({
  teams,
  winner,
  options = {},
}: TeamMatchInput): [PlayerRatingUpdate[], PlayerRatingUpdate[]] => {
  const tau = options.tau ?? DEFAULT_TAU;
  const placementFactor = options.placementFactor ?? DEFAULT_PLACEMENT_FACTOR;
  const tkPenalty = options.teamKillPenalty ?? DEFAULT_TEAM_KILL_PENALTY;
  const leaverPenalty = options.leaverPenalty ?? DEFAULT_LEAVER_PENALTY;
  const opponents = [virtualOpponent(teams[1]), virtualOpponent(teams[0])];

  const updateTeam = (t: 0 | 1): PlayerRatingUpdate[] =>
    teams[t].map((player, i) => {
      const left = options.leftEarly?.[t]?.[i] ?? false;
      const score = left ? 0 : winner === null ? 0.5 : winner === t ? 1 : 0;
      const next = updateRating(player, [{ opponent: opponents[t], score }], tau);
      let delta = next.rating - player.rating;
      if ((options.placementGamesLeft?.[t]?.[i] ?? 0) > 0) delta *= placementFactor;
      delta -= (options.teamKills?.[t]?.[i] ?? 0) * tkPenalty;
      if (left) delta -= leaverPenalty;
      return { rating: { ...next, rating: player.rating + delta }, delta };
    });

  return [updateTeam(0), updateTeam(1)];
};
