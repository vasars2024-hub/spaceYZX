// Global (headline) rank: the three mode ratings combined, weighted by games played.

export type RankedMode = '1v1' | '2v2' | '5v5';
export const RANKED_MODES: readonly RankedMode[] = ['1v1', '2v2', '5v5'];

export interface ModeRating {
  rating: number;
  rd: number;
  games: number;
}

export type ModeRatings = Partial<Record<RankedMode, ModeRating>>;

/** Small prior added to each played mode so one extra game doesn't swing the weights. */
export const GLOBAL_WEIGHT_PRIOR = 1;

const weightedModes = (modes: ModeRatings): { m: ModeRating; w: number }[] => {
  const out: { m: ModeRating; w: number }[] = [];
  for (const mode of RANKED_MODES) {
    const m = modes[mode];
    if (m && m.games >= 1) out.push({ m, w: m.games + GLOBAL_WEIGHT_PRIOR });
  }
  return out;
};

/** Weighted average rating (weight = games + 1); modes with 0 games ignored; null if none. */
export const globalRating = (modes: ModeRatings): number | null => {
  const list = weightedModes(modes);
  if (list.length === 0) return null;
  let sum = 0;
  let wSum = 0;
  for (const { m, w } of list) {
    sum += m.rating * w;
    wSum += w;
  }
  return sum / wSum;
};

/** Weighted root-mean-square RD with the same weights as `globalRating`; null if no games. */
export const globalRd = (modes: ModeRatings): number | null => {
  const list = weightedModes(modes);
  if (list.length === 0) return null;
  let sum = 0;
  let wSum = 0;
  for (const { m, w } of list) {
    sum += m.rd * m.rd * w;
    wSum += w;
  }
  return Math.sqrt(sum / wSum);
};
