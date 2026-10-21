// The ranked ladders — exactly the ones the owner approved (no new ladders without the owner):
//
//   PREMIER     the flagship: Bomb with the Boomerang kit, map veto before the match, one
//               visible rating number (start 1000) in 7 colour bands, hidden until 5 placement
//               wins, seasons (soft reset toward 1000), optional opening hours. 3v3 by default;
//               the queue forms 4v4 or 5v5 when enough players search (one rating for all).
//   PREMIER CS  the same with the CS kit (AK + Deagle): before each match the players vote the
//               mode (Bomb or Elimination), then ban maps like Premier. Its own rating.
//   DUELS       the side ladder: 1v1 and 2v2 (Tower rules) share ONE Glicko-2 rating, with the
//               space-object tiers (rating/tiers.ts).
//   RACE     parkour races (rules/race.ts): 2–8 racers on a random race track, a pairwise-Elo
//            rating (rating/race.ts, start 1000) shown like Premier (number + colour band),
//            hidden until 5 placement races; seasonal like Premier.
//
// Everything else (server DB, queue, profiles, leaderboards, ranked screen) reads this data, so
// a new ladder is: add its id to LadderId / LADDER_IDS, a LADDERS entry, a case in
// ladderRank(), and its queue(s) / result recording on the server. No new ladders without the
// owner.
import type { MatchObjective } from '../rules/match';
import type { LoadoutName } from '../config/loadout';
import type { RankedMode } from './global';
import { tierFor } from './tiers';
import { RACE_PLACEMENT_RACES, RACE_START_RATING } from './race';

export type LadderId = 'premier' | 'premier-cs' | 'duels' | 'race';
/** Every ladder, in the order menus and leaderboards show them. */
export const LADDER_IDS: readonly LadderId[] = ['premier', 'premier-cs', 'duels', 'race'];

/** A ranked queue players can join (one ladder can have several queues). */
export type RankedQueueId = 'premier' | 'premier-cs' | 'duels-1v1' | 'duels-2v2' | 'race';
/** Every ranked queue, in menu order. */
export const RANKED_QUEUE_IDS: readonly RankedQueueId[] = [
  'premier',
  'premier-cs',
  'duels-1v1',
  'duels-2v2',
  'race',
];

interface QueueBase {
  id: RankedQueueId;
  ladder: LadderId;
}

/** A team match queue (Premier, Premier CS, Duels): teams balanced by rating. */
export interface TeamQueueDef extends QueueBase {
  kind: 'team';
  /** team size of the room it starts (the biggest, when `sizes` scale it) */
  mode: RankedMode;
  /** the objective (Premier CS: the default before the vote) */
  objective: MatchObjective;
  /** the weapons: the Boomerang kit ('lethal') or the CS kit ('cs') */
  loadout: LoadoutName;
  /** map veto before the match (else the default match map) */
  veto: boolean;
  /**
   * Premier CS: before the map veto the players vote the mode (majority; a tie is decided at
   * random). The veto's map pool is the same for every option.
   */
  modeVote?: readonly MatchObjective[];
  /**
   * Team sizes this queue forms, biggest first, and how long the longest waiter must have
   * waited before each may start (so a bigger match gets a moment to fill). Without it: `mode`.
   */
  sizes?: readonly { teamSize: number; afterSec: number }[];
  /** biggest party that may queue (default: the biggest team size) */
  maxParty?: number;
}

/** A free-for-all queue (Race): gathers a group, everyone for themselves. */
export interface GroupQueueDef extends QueueBase {
  kind: 'race';
  mode: 'race';
  /** a full group starts at once; else once `min` wait, the group starts `gatherSec` later */
  group: { min: number; max: number; gatherSec: number };
}

export type RankedQueueDef = TeamQueueDef | GroupQueueDef;

/**
 * Premier / Premier CS team sizes: 5v5 as soon as 10 are searching, 4v4 once the longest
 * waiter has waited 10 s (8–9 searching), else the default 3v3 after 20 s (6–7 searching).
 */
export const PREMIER_SIZES: readonly { teamSize: number; afterSec: number }[] = [
  { teamSize: 5, afterSec: 0 },
  { teamSize: 4, afterSec: 10 },
  { teamSize: 3, afterSec: 20 },
];

/** Premier CS: the modes players vote between before the map veto. */
export const PREMIER_CS_MODES: readonly MatchObjective[] = ['bomb', 'elim'];

export const RANKED_QUEUES: readonly RankedQueueDef[] = [
  {
    id: 'premier',
    ladder: 'premier',
    kind: 'team',
    mode: '5v5',
    objective: 'bomb',
    loadout: 'lethal',
    veto: true,
    sizes: PREMIER_SIZES,
  },
  {
    id: 'premier-cs',
    ladder: 'premier-cs',
    kind: 'team',
    mode: '5v5',
    objective: 'bomb',
    loadout: 'cs',
    veto: true,
    modeVote: PREMIER_CS_MODES,
    sizes: PREMIER_SIZES,
  },
  {
    id: 'duels-1v1',
    ladder: 'duels',
    kind: 'team',
    mode: '1v1',
    objective: 'tower',
    loadout: 'lethal',
    veto: false,
    maxParty: 1,
  },
  {
    id: 'duels-2v2',
    ladder: 'duels',
    kind: 'team',
    mode: '2v2',
    objective: 'tower',
    loadout: 'lethal',
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

const MODE_TEAM_SIZE: Record<RankedMode, number> = { '1v1': 1, '2v2': 2, '5v5': 5 };

/** Team sizes a team queue can form, biggest first. */
export const queueTeamSizes = (q: TeamQueueDef): number[] =>
  q.sizes?.map((s) => s.teamSize) ?? [MODE_TEAM_SIZE[q.mode]];

/** Biggest party that may search this queue (Race and Duels 1v1: solo only). */
export const queueMaxParty = (q: RankedQueueDef): number =>
  q.kind === 'race' ? 1 : (q.maxParty ?? Math.max(...queueTeamSizes(q)));

/**
 * With `searching` players in a team queue, the biggest team size that could start now
 * ("5v5 ready"), or null (not enough yet for the smallest).
 */
export const formableTeamSize = (q: RankedQueueDef, searching: number): number | null =>
  q.kind === 'team' ? (queueTeamSizes(q).find((n) => searching >= n * 2) ?? null) : null;

export const rankedQueue = (id: unknown): RankedQueueDef | undefined =>
  RANKED_QUEUES.find((q) => q.id === id);

/**
 * The ladder a ranked room of this mode counts for, as a fallback (null: no ranked queue plays
 * it). Rooms know their real ladder (Room.ladder, roomJoined.ladder): Premier and Premier CS
 * share room modes, and Premier also plays 3v3 / 4v4.
 */
export const ladderForMode = (mode: string): LadderId | null =>
  mode === '3v3' ? 'premier' : (RANKED_QUEUES.find((q) => q.mode === mode)?.ladder ?? null);

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
/** Premier CS: seconds for the mode vote before the map veto. */
export const MODE_VOTE_SEC = 10;

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
  // the same number, bands, placement and seasons as Premier; its own rating
  'premier-cs': {
    id: 'premier-cs',
    name: 'Premier CS',
    startRating: PREMIER_START,
    placement: { count: PREMIER_PLACEMENT_WINS, unit: 'wins' },
    hideWhilePlacing: true,
    seasonal: true,
    decayFloor: 1800,
    queues: ['premier-cs'],
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
  if (ladder === 'premier' || ladder === 'premier-cs' || ladder === 'race') {
    // Premier CS and Race use Premier's number + colour bands (all start at 1000)
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

// ------------------------------------------------------------------------------------------
// Parties in ranked (server services/party.ts): a party searches as one unit, on one team.

/** A party's matchmaking rating: weighted toward its best player (0.6 × max + 0.4 × mean). */
export const partyRating = (ratings: readonly number[]): number => {
  if (!ratings.length) return 0;
  const max = Math.max(...ratings);
  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  return 0.6 * max + 0.4 * mean;
};

/** Parties smaller than a full team must be within this rating gap to queue ranked. */
export const PARTY_GAP_LIMIT = 600;
/** A full-team stack whose ratings spread more than this earns reduced rating… */
export const STACK_SPREAD = 400;
/** …this share of the normal rating change (gains and losses alike). */
export const STACK_PENALTY = 0.75;

/** Highest minus lowest rating (0 for a solo player). */
export const ratingSpread = (ratings: readonly number[]): number =>
  ratings.length ? Math.max(...ratings) - Math.min(...ratings) : 0;

/**
 * May a party with these ladder ratings search this queue? Too big for the queue: no. Within
 * PARTY_GAP_LIMIT: yes. A wider gap: only as a full team of a size the queue forms (it then
 * plays only at that size: partyOnlySize). Returns an error message, or null.
 */
export const partyQueueProblem = (q: RankedQueueDef, ratings: readonly number[]): string | null => {
  const n = ratings.length;
  if (n <= 1) return null;
  const max = queueMaxParty(q);
  if (n > max)
    return max === 1
      ? 'This queue is solo only — leave your party to search it.'
      : `Parties of up to ${max} can search this queue.`;
  if (ratingSpread(ratings) <= PARTY_GAP_LIMIT) return null;
  if (q.kind === 'team' && queueTeamSizes(q).includes(n)) return null;
  return `Your party's ratings are more than ${PARTY_GAP_LIMIT} apart: only a full team may search with a gap like that.`;
};

/** A wide-gap party only plays as a full team of its own size (null: any size). */
export const partyOnlySize = (ratings: readonly number[]): number | null =>
  ratings.length > 1 && ratingSpread(ratings) > PARTY_GAP_LIMIT ? ratings.length : null;

/** Rating change multiplier for the members of a party: STACK_PENALTY for a wide full stack. */
export const stackMultiplier = (ratings: readonly number[], teamSize: number): number =>
  ratings.length >= 2 && ratings.length === teamSize && ratingSpread(ratings) > STACK_SPREAD
    ? STACK_PENALTY
    : 1;
