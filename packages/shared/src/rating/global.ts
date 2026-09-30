// Team sizes. (The file name is historical: the old "global rank" average of several ladders
// is gone — ranked is Premier + Duels, see rating/ladders.ts.)

/** Team sizes a ranked queue can start (Premier 5v5, Duels 1v1 / 2v2). */
export type RankedMode = '1v1' | '2v2' | '5v5';
export const RANKED_MODES: readonly RankedMode[] = ['1v1', '2v2', '5v5'];

/**
 * Every team size a match can be played at: the ranked ones plus 3v3, which is casual only
 * (online rooms and practice vs bots).
 */
export type TeamMode = RankedMode | '3v3';
export const TEAM_MODES: readonly TeamMode[] = ['1v1', '2v2', '3v3', '5v5'];
