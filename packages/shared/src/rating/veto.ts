// Premier / Premier CS map veto (pure; the server owns the state and the clock). The two teams
// take turns banning a map from the pool until one is left: that map is played. Any player of
// the team whose turn it is can ban (first click counts). When a turn's time runs out, a random
// map is banned for that team (the caller passes the random number).
import type { MatchObjective } from '../rules/match';
import type { LadderId } from './ladders';

export interface VetoBan {
  map: string;
  team: 0 | 1;
  /** banned by the timer, not by a player */
  auto: boolean;
}

export interface VetoState {
  /** the map pool, in menu order */
  maps: string[];
  banned: VetoBan[];
  /** team whose turn it is */
  turn: 0 | 1;
  /** when the current turn runs out (ms, the caller's clock) */
  turnEndsMs: number;
  banMs: number;
  /** the map left over (null while banning) */
  picked: string | null;
}

/** What a player sees of the veto. */
export interface VetoView {
  maps: string[];
  banned: VetoBan[];
  turn: 0 | 1;
  yourTeam: 0 | 1;
  /** seconds left in this turn */
  secondsLeft: number;
  picked: string | null;
  /** player names per team */
  teams: [string[], string[]];
  /** players per team (3 by default, 4 or 5 when enough are searching) */
  teamSize: number;
  /** the ladder (Premier or Premier CS) */
  ladder?: LadderId;
  /** 'vote': Premier CS's mode vote runs first; 'ban': the map veto */
  phase?: 'vote' | 'ban';
  /** Premier CS: the mode vote (stays, with its result, during the bans) */
  vote?: ModeVoteView;
  /** the mode that will be played (Premier: Bomb; Premier CS: the vote's result) */
  mode?: MatchObjective;
}

export const vetoRemaining = (v: VetoState): string[] =>
  v.maps.filter((m) => !v.banned.some((b) => b.map === m));

export const createVeto = (
  maps: readonly string[],
  nowMs: number,
  opts: { banMs: number; firstTeam?: 0 | 1 },
): VetoState => {
  const pool = [...new Set(maps)];
  return {
    maps: pool,
    banned: [],
    turn: opts.firstTeam ?? 0,
    turnEndsMs: nowMs + opts.banMs,
    banMs: opts.banMs,
    picked: pool.length <= 1 ? (pool[0] ?? null) : null,
  };
};

const applyBan = (v: VetoState, map: string, auto: boolean, nowMs: number): void => {
  v.banned.push({ map, team: v.turn, auto });
  const left = vetoRemaining(v);
  if (left.length <= 1) {
    v.picked = left[0] ?? null;
    return;
  }
  v.turn = v.turn === 0 ? 1 : 0;
  v.turnEndsMs = nowMs + v.banMs;
};

/** A player of `team` bans `map`. Returns an error message, or null when it counted. */
export const vetoBan = (v: VetoState, team: 0 | 1, map: string, nowMs: number): string | null => {
  if (v.picked !== null) return 'The map is already decided.';
  if (team !== v.turn) return "It's the other team's turn.";
  if (!vetoRemaining(v).includes(map)) return 'That map is not in the veto.';
  applyBan(v, map, false, nowMs);
  return null;
};

/**
 * Advance the clock: when the turn ran out, ban a random remaining map for that team.
 * `rand` returns a number in [0, 1). Returns true when something changed.
 */
export const vetoTick = (v: VetoState, nowMs: number, rand: () => number): boolean => {
  if (v.picked !== null || nowMs < v.turnEndsMs) return false;
  const left = vetoRemaining(v);
  const pick = left[Math.min(left.length - 1, Math.floor(rand() * left.length))];
  applyBan(v, pick, true, nowMs);
  return true;
};

// ------------------------------------------------------------------------------------------
// Premier CS mode vote (before the map veto): every player votes a mode (Bomb or
// Elimination). It ends when everyone voted or the time runs out; the most votes win, a tie
// (or nobody voting) is decided at random (the caller passes the random number).

export interface ModeVoteState {
  options: MatchObjective[];
  /** vote per player key (the server uses account ids) */
  votes: Record<string, MatchObjective>;
  /** when the vote closes (ms, the caller's clock) */
  endsMs: number;
  /** the mode played (null while voting) */
  result: MatchObjective | null;
}

export const createModeVote = (
  options: readonly MatchObjective[],
  nowMs: number,
  voteMs: number,
): ModeVoteState => ({
  options: [...new Set(options)],
  votes: {},
  endsMs: nowMs + voteMs,
  result: options.length === 1 ? options[0] : null,
});

/** Votes per option, in option order. */
export const modeVoteCounts = (v: ModeVoteState): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const o of v.options) out[o] = 0;
  for (const m of Object.values(v.votes)) if (m in out) out[m]++;
  return out;
};

/** A player votes (they may change their vote until it closes). Error message, or null. */
export const castModeVote = (v: ModeVoteState, voter: string, mode: string): string | null => {
  if (v.result !== null) return 'The mode is already decided.';
  if (!v.options.includes(mode as MatchObjective)) return 'That mode is not in the vote.';
  v.votes[voter] = mode as MatchObjective;
  return null;
};

/**
 * Close the vote when everyone (`voters`) voted or the time ran out: the most votes win, a tie
 * is broken by `rand` in [0, 1). Returns true when the vote just closed.
 */
export const modeVoteTick = (
  v: ModeVoteState,
  nowMs: number,
  voters: number,
  rand: () => number,
): boolean => {
  if (v.result !== null) return false;
  if (nowMs < v.endsMs && Object.keys(v.votes).length < voters) return false;
  const counts = modeVoteCounts(v);
  const top = Math.max(...Object.values(counts));
  const best = v.options.filter((o) => counts[o] === top);
  v.result = best[Math.min(best.length - 1, Math.floor(rand() * best.length))];
  return true;
};

/** What a player sees of the mode vote (VetoView.vote). */
export interface ModeVoteView {
  options: MatchObjective[];
  counts: Record<string, number>;
  /** your vote (null: not yet) */
  yours: MatchObjective | null;
  secondsLeft: number;
  result: MatchObjective | null;
}
