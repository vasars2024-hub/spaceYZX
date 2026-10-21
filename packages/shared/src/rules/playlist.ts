// Map playlists for casual rooms and practice (owner request): a room can queue several maps.
// When a match ends the room moves straight on to the next queued map (same players, teams,
// mode and bots) after a short results card, and after the last map it goes back to the room's
// warm-up (or starts the list again with "loop"). With "vote" instead, the results card shows
// 3–4 maps (queued ones first, then other maps of the mode) and the players pick the next one:
// most votes wins, a tie is broken by a seeded pick (the same seed always gives the same map).
// Pure data + functions (no clocks, no randomness of its own): the server's match rules and the
// offline practice both run it. Never used by ranked rooms.
import type { LevelDef } from '../level/types';
import type { MapInfo } from '../level/maps/index';
import { MAPS, mapDef } from '../level/maps/index';
import type { MatchObjective } from './match';
import { rngFromSeed, rngInt, rngShuffle } from '../math/rng';

/** What happens after a match: the next queued map ('playlist') or a map vote ('vote'). */
export type NextMapMode = 'playlist' | 'vote';
export const NEXT_MAP_MODES: readonly NextMapMode[] = ['playlist', 'vote'];

export const PLAYLIST_RULES = {
  /** most maps one playlist can hold */
  maxMaps: 8,
  /** the results card before the next queued map loads (seconds) */
  nextCardSec: 8,
  /** how long the map vote stays open (seconds) */
  voteSec: 15,
  /** maps offered in a vote (fewer when the mode has fewer maps) */
  voteChoices: 4,
  /** once every player has voted, the vote closes this soon (seconds) */
  allVotedSec: 2,
  /** on the new map: warm-up countdown before the match starts (time to load the map) */
  startDelaySec: 5,
};

/** The playlist choices a room (or a practice game) is created with. */
export interface PlaylistSettings {
  /** the maps in the order they are played (the first is played first) */
  maps: string[];
  /** after the last map, start again from the first one (playlist mode) */
  loop?: boolean;
  /** 'vote': a map vote after every match instead of the queue order */
  next?: NextMapMode;
}

/** A map vote on the results screen. */
export interface MapVote {
  /** the maps offered, in the order shown */
  choices: string[];
  /** player id → the map they picked (a player can change their mind until it closes) */
  votes: Record<number, string>;
  /** breaks ties (and decides when nobody voted) */
  seed: number;
}

export interface PlaylistState {
  maps: string[];
  /**
   * index in `maps` of the map being played (a voted map that isn't in the list keeps the index
   * of the last queued map played)
   */
  at: number;
  loop: boolean;
  next: NextMapMode;
  /** after a match: the map that loads when the card runs out (playlist mode) */
  pending: string | null;
  /** after a match: the open map vote (vote mode) */
  vote: MapVote | null;
  /** tick at which the results card / vote ends (0 = nothing coming) */
  endsAt: number;
}

/** What clients are told (inside the match rules state). */
export interface PlaylistView {
  maps: string[];
  at: number;
  loop: boolean;
  next: NextMapMode;
  /** the map that loads after this match (null: back to warm-up, or a vote decides) */
  upcoming: string | null;
  vote: { choices: string[]; votes: Record<number, string> } | null;
  /** tick the results card / vote ends at (0 = no next map coming) */
  endsAt: number;
}

/**
 * A playlist from the creator's choices: unknown and repeated maps are dropped (`valid` says
 * which ids are allowed), at most PLAYLIST_RULES.maxMaps. Null when fewer than one map is left.
 */
export const createPlaylist = (
  settings: PlaylistSettings,
  valid: (id: string) => boolean = () => true,
): PlaylistState | null => {
  const maps: string[] = [];
  for (const id of settings.maps) {
    if (typeof id !== 'string' || maps.includes(id) || !valid(id)) continue;
    maps.push(id);
    if (maps.length >= PLAYLIST_RULES.maxMaps) break;
  }
  if (!maps.length) return null;
  return {
    maps,
    at: 0,
    loop: !!settings.loop,
    next: settings.next === 'vote' ? 'vote' : 'playlist',
    pending: null,
    vote: null,
    endsAt: 0,
  };
};

/**
 * Playlist mode: the map after the one being played, or null after the last one (no loop).
 * With loop the list starts again (a one-map loop replays that map).
 */
export const upcomingMap = (pl: PlaylistState): string | null => {
  const i = pl.at + 1;
  if (i < pl.maps.length) return pl.maps[i];
  return pl.loop ? pl.maps[0] : null;
};

const supports = (def: LevelDef, objective: MatchObjective): boolean =>
  objective === 'tower'
    ? def.towers.length > 0
    : objective === 'bomb'
      ? (def.bombSites?.length ?? 0) > 0
      : true;

/**
 * The maps of a mode, for the vote: competitive maps in rotation that have what the objective
 * needs (Towers / bomb sites; Elimination plays anywhere). Same rule as the menus' map lists.
 */
export const objectiveMapPool = (
  objective: MatchObjective,
  maps: readonly MapInfo[] = MAPS,
  defOf: (id: string) => LevelDef = mapDef,
): string[] => {
  const comp = maps.filter((m) => m.competitive && !m.retired && !m.arena && !m.race);
  const ok = comp.filter((m) => supports(defOf(m.id), objective));
  return (ok.length ? ok : comp).map((m) => m.id);
};

/**
 * The maps a vote offers after playing `current`: the queued maps still to come first (in
 * playlist order, wrapping round with loop), then other maps of the mode in a seeded order —
 * never `current`, up to PLAYLIST_RULES.voteChoices.
 */
export const voteChoices = (
  pl: PlaylistState,
  current: string,
  pool: readonly string[],
  seed: number,
): string[] => {
  const out: string[] = [];
  const add = (id: string) => {
    if (out.length < PLAYLIST_RULES.voteChoices && id !== current && !out.includes(id))
      out.push(id);
  };
  // queued maps after the current one, then (loop) the ones before it
  const after = pl.maps.slice(pl.at + 1);
  const before = pl.loop ? pl.maps.slice(0, pl.at) : [];
  for (const id of [...after, ...before]) add(id);
  for (const id of rngShuffle(rngFromSeed(seed), pool)) add(id);
  return out;
};

/** A player's vote (only for a map on offer); false = not counted. */
export const castVote = (vote: MapVote, playerId: number, map: string): boolean => {
  if (!vote.choices.includes(map)) return false;
  vote.votes[playerId] = map;
  return true;
};

/** Votes per offered map, in the order shown. */
export const voteCounts = (vote: MapVote): number[] =>
  vote.choices.map((c) => Object.values(vote.votes).filter((v) => v === c).length);

/**
 * The vote's winner: the map with the most votes; a tie (or no votes at all) is broken by a
 * pick among the tied maps seeded with `vote.seed` (deterministic).
 */
export const tallyVote = (vote: MapVote): string => {
  const counts = voteCounts(vote);
  const best = Math.max(0, ...counts);
  const tied = vote.choices.filter((_, i) => counts[i] === best);
  return tied[rngInt(rngFromSeed(vote.seed), tied.length)] ?? vote.choices[0];
};

/**
 * A match just ended on `current` at `tick`: decide what comes next. Playlist mode: the next
 * queued map (none after the last one without loop). Vote mode: a vote opens (a single possible
 * map is picked straight away). Returns true when a next map is coming: the results card then
 * lasts until `pl.endsAt`.
 */
export const playlistMatchEnded = (
  pl: PlaylistState,
  current: string,
  pool: readonly string[],
  tick: number,
  seed: number,
): boolean => {
  pl.pending = null;
  pl.vote = null;
  pl.endsAt = 0;
  if (pl.next === 'playlist') {
    const next = upcomingMap(pl);
    if (next === null) return false;
    pl.pending = next;
    pl.endsAt = tick + Math.round(PLAYLIST_RULES.nextCardSec * 60);
    return true;
  }
  const choices = voteChoices(pl, current, pool, seed);
  if (choices.length <= 1) {
    // nothing to choose from: the only other map, or this one again
    pl.pending = choices[0] ?? current;
    pl.endsAt = tick + Math.round(PLAYLIST_RULES.nextCardSec * 60);
    return true;
  }
  pl.vote = { choices, votes: {}, seed: seed >>> 0 };
  pl.endsAt = tick + Math.round(PLAYLIST_RULES.voteSec * 60);
  return true;
};

/**
 * A vote from player `playerId`. When all `voters` have voted the vote closes soon (at `tick` +
 * PLAYLIST_RULES.allVotedSec). False: no vote open, or not a map on offer.
 */
export const playlistVote = (
  pl: PlaylistState,
  playerId: number,
  map: string,
  voters: readonly number[],
  tick: number,
): boolean => {
  if (!pl.vote || !castVote(pl.vote, playerId, map)) return false;
  if (voters.length && voters.every((id) => pl.vote!.votes[id] !== undefined))
    pl.endsAt = Math.min(pl.endsAt, tick + Math.round(PLAYLIST_RULES.allVotedSec * 60));
  return true;
};

/** The host skips the wait: the results card / vote ends now. False: nothing to skip. */
export const playlistSkip = (pl: PlaylistState, tick: number): boolean => {
  if (!pl.endsAt) return false;
  pl.endsAt = Math.min(pl.endsAt, tick);
  return true;
};

/**
 * The results card / vote is over (`tick` reached `pl.endsAt`): the map to load now, and the
 * playlist moves on to it. Null: nothing is coming (or not yet).
 */
export const playlistAdvance = (pl: PlaylistState, tick: number): string | null => {
  if (!pl.endsAt || tick < pl.endsAt) return null;
  const map = pl.vote ? tallyVote(pl.vote) : pl.pending;
  pl.pending = null;
  pl.vote = null;
  pl.endsAt = 0;
  if (map === null) return null;
  // (a voted map outside the list: the queued maps still to come stay where they are)
  const i = pl.maps.indexOf(map);
  if (i >= 0) pl.at = i;
  return map;
};

export const playlistView = (pl: PlaylistState): PlaylistView => ({
  maps: pl.maps,
  at: pl.at,
  loop: pl.loop,
  next: pl.next,
  upcoming: pl.pending,
  vote: pl.vote ? { choices: pl.vote.choices, votes: pl.vote.votes } : null,
  endsAt: pl.endsAt,
});

/** A seed for a vote from the room and the match number (any stable numbers will do). */
export const voteSeed = (key: string, n: number): number => {
  let h = 2166136261 ^ n;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
};
