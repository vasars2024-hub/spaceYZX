// Visible rank tiers, named after space objects in order of size. Edit RANK_TIERS to
// rename tiers, move thresholds or change colors; the functions below read only this data.

export type Division = 'III' | 'II' | 'I';
export const DIVISIONS: readonly Division[] = ['III', 'II', 'I'];

export interface TierDef {
  name: string;
  /** Hex color used for badges and names. */
  color: string;
  /** Minimum rating for each division, lowest (III) first. */
  thresholds: { III: number; II: number; I: number };
}

export interface RankTiersConfig {
  /** Placement games per mode before a visible rank is shown. */
  placementGames: number;
  unranked: { name: string; color: string };
  /** Top tier: the best `topN` players on the leaderboard with rating >= top division I. */
  galaxy: { name: string; color: string; topN: number };
  /** Lowest tier first. Ratings below the first threshold still get the lowest division. */
  tiers: TierDef[];
}

// Evenly spaced: 1000 (Asteroid III) + 75 per division -> Supergiant I at 2275.
export const RANK_TIERS: RankTiersConfig = {
  placementGames: 5,
  unranked: { name: 'Unranked', color: '#6b7280' },
  galaxy: { name: 'Galaxy', color: '#b36bff', topN: 10 },
  tiers: [
    { name: 'Asteroid', color: '#8c7b6b', thresholds: { III: 1000, II: 1075, I: 1150 } },
    { name: 'Moon', color: '#c9ced6', thresholds: { III: 1225, II: 1300, I: 1375 } },
    { name: 'Planet', color: '#3f9be0', thresholds: { III: 1450, II: 1525, I: 1600 } },
    { name: 'Gas Giant', color: '#e0a15a', thresholds: { III: 1675, II: 1750, I: 1825 } },
    { name: 'Star', color: '#f7d84a', thresholds: { III: 1900, II: 1975, I: 2050 } },
    { name: 'Supergiant', color: '#ff5a3d', thresholds: { III: 2125, II: 2200, I: 2275 } },
  ],
};

export interface TierInfo {
  /** Tier name, 'Galaxy', or 'Unranked'. */
  tier: string;
  /** Division, or null for Galaxy / Unranked. */
  division: Division | null;
  /** Display text, e.g. 'Gas Giant II', 'Galaxy', 'Unranked (placements: 2/5)'. */
  label: string;
  color: string;
  isGalaxy: boolean;
  isRanked: boolean;
}

export interface TierOptions {
  /** 1-based position on the leaderboard of this mode (or global). */
  leaderboardPosition?: number;
  placementDone: boolean;
  /** Placement games played so far (only used for the 'Unranked' label). */
  placementGamesPlayed?: number;
}

/** Minimum rating of a tier division; throws for unknown tier names. */
export const tierThreshold = (
  tierName: string,
  division: Division,
  config: RankTiersConfig = RANK_TIERS,
): number => {
  const t = config.tiers.find((d) => d.name === tierName);
  if (!t) throw new Error(`tierThreshold: unknown tier '${tierName}'`);
  return t.thresholds[division];
};

/** Rating needed (besides a top-N spot) to be Galaxy: the highest tier's division I. */
export const galaxyThreshold = (config: RankTiersConfig = RANK_TIERS): number =>
  config.tiers[config.tiers.length - 1].thresholds.I;

export const tierFor = (
  rating: number,
  opts: TierOptions,
  config: RankTiersConfig = RANK_TIERS,
): TierInfo => {
  if (!opts.placementDone) {
    const played = Math.min(opts.placementGamesPlayed ?? 0, config.placementGames);
    const { name, color } = config.unranked;
    return {
      tier: name,
      division: null,
      label: `${name} (placements: ${played}/${config.placementGames})`,
      color,
      isGalaxy: false,
      isRanked: false,
    };
  }
  const pos = opts.leaderboardPosition;
  if (pos !== undefined && pos >= 1 && pos <= config.galaxy.topN) {
    if (rating >= galaxyThreshold(config)) {
      const { name, color } = config.galaxy;
      return { tier: name, division: null, label: name, color, isGalaxy: true, isRanked: true };
    }
  }
  let tier = config.tiers[0];
  let division: Division = 'III';
  for (const t of config.tiers) {
    for (const d of DIVISIONS) {
      if (rating >= t.thresholds[d]) {
        tier = t;
        division = d;
      }
    }
  }
  return {
    tier: tier.name,
    division,
    label: `${tier.name} ${division}`,
    color: tier.color,
    isGalaxy: false,
    isRanked: true,
  };
};
