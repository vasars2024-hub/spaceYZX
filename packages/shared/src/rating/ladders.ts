// The ranked ladders — exactly the ones the owner approved (no new ladders without the owner):
//
//   PREMIER  the flagship: 5v5 Bomb with the Boomerang kit, map veto before the match, one
//            visible rating number (start 1000) in 7 colour bands, hidden until 5 placement
//            wins, seasons (soft reset toward 1000), optional opening hours.
//   DUELS    the side ladder: 1v1 and 2v2 (Tower rules) share ONE Glicko-2 rating, with the
//            space-object tiers (rating/tiers.ts).
//   RACE     parkour races (rules/race.ts): 2–8 racers on a random race track, a pairwise-Elo
//            rating (rating/race.ts, start 1000) shown like Premier (number + colour band),
//            hidden until 5 placement races; seasonal like Premier.
//
// Everything else (server DB, queue, profiles, leaderboards, ranked screen) reads this data, so
// a new ladder is: add its id to LadderId / LADDER_IDS, a LADDERS entry, a case in
// ladderRank(), and its queue(s) / result recording on the server. No new ladders without the
// owner.
import type { MatchObjective } from '../rules/match';
import type { RankedMode } from './global';
import { tierFor } from './tiers';
import { RACE_PLACEMENT_RACES, RACE_START_RATING } from './race';

export type LadderId = 'premier' | 'duels' | 'race';
/** Every ladder, in the order menus and leaderboards show them. */
export const LADDER_IDS: readonly LadderId[] = ['premier', 'duels', 'race'];

/** A ranked queue players can join (one ladder can have several queues). */
export type RankedQueueId = 'premier' | 'duels-1v1' | 'duels-2v2' | 'race';

interface QueueBase {
  id: RankedQueueId;
  ladder: LadderId;
}

/** A team match queue (Premier, Duels): teams balanced by rating. */
export interface TeamQueueDef extends QueueBase {
  kind: 'team';
  /** team size of the room it starts */
  mode: RankedMode;
  objective: MatchObjective;
  /** map veto before the match (else the default match map) */
  veto: boolean;
  /**
   * Few players searching: after the longest waiter has waited `afterSec`, a match may start
   * with `teamSize` players per team instead (same rules, one player fewer per side).
   */
  smaller?: { teamSize: number; afterSec: number };
}

/** A free-for-all queue (Race): gathers a group, everyone for themselves. */
export interface GroupQueueDef extends QueueBase {
  kind: 'race';
  mode: 'race';
  /** a full group starts at once; else once `min` wait, the group starts `gatherSec` later */
  group: { min: number; max: number; gatherSec: number };
}

export type RankedQueueDef = TeamQueueDef | GroupQueueDef;

export const RANKED_QUEUES: readonly RankedQueueDef[] = [
  {
    id: 'premier',
    ladder: 'premier',
    kind: 'team',
    mode: '5v5',
    objective: 'bomb',
    veto: true,
    smaller: { teamSize: 4, afterSec: 90 },
  },
  {
    id: 'duels-1v1',
    ladder: 'duels',
    kind: 'team',
    mode: '1v1',
    objective: 'tower',
    veto: false,
  },
  {
    id: 'duels-2v2',
    ladder: 'duels',
    kind: 'team',
    mode: '2v2',
    objective: 'tower',
    veto: false,
  },
  {
    id: 'race',
    ladder: 'race',
    kind: 'race',
    mode: 'race',
    group: { min: 2, max: 8, gatherSec: 20 },
  },
];

export const rankedQueue = (id: unknown): RankedQueueDef | undefined =>
  RANKED_QUEUES.find((q) => q.id === id);

/** The ladder a ranked room of this mode counts for (null: no ranked queue plays it). */
export const ladderForMode = (mode: string): LadderId | null =>
  RANKED_QUEUES.find((q) => q.mode === mode)?.ladder ?? null;

export interface LadderDef {
  id: LadderId;
  name: string;
  /** rating of a new player */
  startRating: number;
  /**
   * before this many wins / games / races the ladder counts as "placing" (on a seasonal
   * ladder: this season's)
   */
  placement: { count: number; unit: 'wins' | 'games' | 'races' };
  /** placing hides the rating (Premier) or only labels it "Unranked" (Duels) */
  hideWhilePlacing: boolean;
  /** has seasons (soft reset, archived results) */
  seasonal: boolean;
  /** inactivity decay applies at/above this rating (default: rating/decay.ts) */
  decayFloor?: number;
  queues: readonly RankedQueueId[];
}

export const PREMIER_START = 1000;
export const PREMIER_PLACEMENT_WINS = 5;
/** New season: every Premier rating moves this share of the way back to PREMIER_START. */
export const SEASON_PULL = 0.4;
/** Seconds each team has for a map ban (then a random map is banned for it). */
export const VETO_BAN_SEC = 15;

export const LADDERS: Record<LadderId, LadderDef> = {
  premier: {
    id: 'premier',
    name: 'Premier',
    startRating: PREMIER_START,
    placement: { count: PREMIER_PLACEMENT_WINS, unit: 'wins' },
    hideWhilePlacing: true,
    seasonal: true,
    decayFloor: 1800,
    queues: ['premier'],
  },
  duels: {
    id: 'duels',
    name: 'Duels',
    startRating: 1500,
    placement: { count: 5, unit: 'games' },
    hideWhilePlacing: false,
    seasonal: false,
    queues: ['duels-1v1', 'duels-2v2'],
  },
  race: {
    id: 'race',
    name: 'Race',
    startRating: RACE_START_RATING,
    placement: { count: RACE_PLACEMENT_RACES, unit: 'races' },
    hideWhilePlacing: true,
    seasonal: true,
    decayFloor: 1800,
    queues: ['race'],
  },
};

export interface RatingBand {
  /** lowest rating of the band */
  min: number;
  name: string;
  color: string;
}

/** Premier's 7 colour bands (lowest first). The names are the space tiers. */
export const PREMIER_BANDS: readonly RatingBand[] = [
  { min: -Infinity, name: 'Asteroid', color: '#9aa6b8' },
  { min: 1000, name: 'Moon', color: '#8fd3ff' },
  { min: 1200, name: 'Planet', color: '#4f8dff' },
  { min: 1400, name: 'Gas Giant', color: '#a77bff' },
  { min: 1600, name: 'Star', color: '#ff7ad9' },
  { min: 1800, name: 'Supergiant', color: '#ff5a5a' },
  { min: 2000, name: 'Galaxy', color: '#ffd24a' },
];

export const premierBand = (rating: number): RatingBand => {
  let band = PREMIER_BANDS[0];
  for (const b of PREMIER_BANDS) if (rating >= b.min) band = b;
  return band;
};

/** A new season's starting rating: pulled SEASON_PULL of the way back to the start (1000). */
export const seasonResetRating = (rating: number, start = PREMIER_START): number =>
  rating + (start - rating) * SEASON_PULL;

/** How a rating shows up in menus: a label and its colour. */
export interface RankDisplay {
  label: string;
  color: string;
  /** Duels: a top-10 "Galaxy" player */
  top?: boolean;
}

/** The rank shown next to a (placed) rating. */
export const ladderRank = (
  ladder: LadderId,
  rating: number,
  opts: { position?: number; placed?: boolean; placementPlayed?: number } = {},
): RankDisplay => {
  if (ladder === 'premier' || ladder === 'race') {
    // Race uses Premier's number + colour bands (both start at 1000)
    const b = premierBand(rating);
    return { label: b.name, color: b.color };
  }
  const t = tierFor(rating, {
    placementDone: opts.placed ?? true,
    placementGamesPlayed: opts.placementPlayed,
    leaderboardPosition: opts.position,
  });
  return { label: t.label, color: t.color, top: t.isGalaxy };
};
