// Inactivity: everyone's RD grows (Glicko-2 "no games" periods); only top tiers also
// lose a few rating points, so nobody can sit on a high rank forever.
// Call it with the rating stored at the player's last match and the total days since then;
// do not feed its output back in (that would decay twice).

import { growRd } from './glicko2';
import type { Rating } from './glicko2';
import { RANK_TIERS, tierThreshold } from './tiers';
import type { RankTiersConfig } from './tiers';

export const RATING_PERIOD_DAYS = 7;

export interface InactivityOptions {
  /** Days without a match before decay starts (default 14). */
  graceDays?: number;
  /** Rating points lost per full week past the grace period (default 10). */
  pointsPerWeek?: number;
  /** Decay applies at/above this rating and never goes below it (default: Star III). */
  floor?: number;
  tiers?: RankTiersConfig;
}

export const applyInactivity = (
  rating: Rating,
  daysInactive: number,
  opts: InactivityOptions = {},
): Rating => {
  const days = Math.max(0, daysInactive);
  const graceDays = opts.graceDays ?? 14;
  const pointsPerWeek = opts.pointsPerWeek ?? 10;
  const floor = opts.floor ?? tierThreshold('Star', 'III', opts.tiers ?? RANK_TIERS);
  const next = growRd(rating, Math.floor(days / RATING_PERIOD_DAYS));
  if (rating.rating < floor) return next;
  const weeks = Math.floor(Math.max(0, days - graceDays) / 7);
  return { ...next, rating: Math.max(floor, rating.rating - weeks * pointsPerWeek) };
};
