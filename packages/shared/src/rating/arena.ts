// Arena 1v1 ladder (ranked, separate from the normal 1v1 rating).
//
// Rating: per duel. Every duel of an arena match counts as a game against that opponent's
// arena rating (as it was when the match started), and all of a player's duels in the match
// are one Glicko-2 rating period, applied when the match ends. Beating a higher-rated player
// is worth more than beating a lower one, 6 wins out of 8 moves you more than 1 out of 1, and
// the arena's placement (most duel wins) needs no extra points. Placement matches count
// `placementFactor` times; leaving costs `leaverPenalty` on top of the forfeited duel.
//
// Queue: `pickArenaGroup` takes 2–8 waiting players (see ArenaSettings.queue*).
import { DEFAULT_TAU, updateRating, type GameResult, type Rating } from './glicko2';
import type { PlayerRatingUpdate } from './team';
import type { QueueEntry } from './matchmaking';

export interface ArenaRatingPlayer {
  rating: Rating;
  /** placement matches still to play in the arena ladder (>0: this is one) */
  placementGamesLeft: number;
  left: boolean;
}

/** One duel between players[a] and players[b] (indices into the players list). */
export interface ArenaRatingDuel {
  a: number;
  b: number;
  winner: number;
}

export interface ArenaRatingOptions {
  placementFactor?: number;
  leaverPenalty?: number;
  tau?: number;
}

/** New arena ratings, in the order of `players`. Duels with unknown players are ignored. */
export const updateArenaRatings = (
  players: readonly ArenaRatingPlayer[],
  duels: readonly ArenaRatingDuel[],
  opts: ArenaRatingOptions = {},
): PlayerRatingUpdate[] => {
  const factor = opts.placementFactor ?? 1;
  const penalty = opts.leaverPenalty ?? 15;
  return players.map((p, i) => {
    const results: GameResult[] = [];
    for (const d of duels) {
      if (d.a !== i && d.b !== i) continue;
      const opp = players[d.a === i ? d.b : d.a];
      if (!opp || d.a === d.b) continue;
      results.push({ opponent: opp.rating, score: d.winner === i ? 1 : 0 });
    }
    const next = updateRating(p.rating, results, opts.tau ?? DEFAULT_TAU);
    let delta = next.rating - p.rating.rating;
    if (p.placementGamesLeft > 0) delta *= factor;
    if (p.left) delta -= penalty;
    return { rating: { ...next, rating: p.rating.rating + delta }, delta };
  });
};

export interface ArenaGroupOptions {
  minPlayers: number;
  maxPlayers: number;
  /** once `minPlayers` wait, how long to gather more (ms) */
  gatherMs: number;
}

/**
 * The next arena room to start from the queue, or null (keep waiting). A full room starts
 * right away: the longest waiter plus the players nearest their rating. Otherwise, once
 * `minPlayers` are waiting, everyone waiting starts together `gatherMs` after the
 * `minPlayers`-th joined. Pure: call again with the rest until it returns null.
 */
export const pickArenaGroup = (
  entries: readonly QueueEntry[],
  nowMs: number,
  opts: ArenaGroupOptions,
): string[] | null => {
  if (entries.length < Math.max(2, opts.minPlayers)) return null;
  const byJoin = entries
    .slice()
    .sort((a, b) => a.joinedAtMs - b.joinedAtMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (byJoin.length >= opts.maxPlayers) {
    const anchor = byJoin[0];
    const rest = byJoin
      .slice(1)
      .sort(
        (a, b) =>
          Math.abs(a.rating - anchor.rating) - Math.abs(b.rating - anchor.rating) ||
          a.joinedAtMs - b.joinedAtMs ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    return [anchor.id, ...rest.slice(0, opts.maxPlayers - 1).map((e) => e.id)];
  }
  const windowStart = byJoin[Math.max(2, opts.minPlayers) - 1].joinedAtMs;
  return nowMs - windowStart >= opts.gatherMs ? byJoin.map((e) => e.id) : null;
};
