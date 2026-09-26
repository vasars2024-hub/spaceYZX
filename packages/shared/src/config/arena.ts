// Arena 1v1 numbers (rules/arena.ts, the ranked arena queue and ladder). All tunable.
// Kept out of GameConfig: only the rules (server / offline practice) read them, the client just
// shows the arena state it is sent.

export const ARENA_DEFAULTS = {
  /** the whole arena match: no new duel round starts after this (the running one finishes) */
  matchMin: 8,
  /** one duel: first kill wins; at the end of this, more HP wins, then a seeded coin flip */
  duelSec: 45,
  /** between rounds: everyone stands frozen in their next pit ("Next: vs … in 3") */
  breakSec: 3,
  /** a decided duel: the winner stands a moment, then both wait (spectate) for the round end */
  afterDuelSec: 1.5,
  /** warmup: the first round starts this long after 2+ players are in (host can start sooner) */
  warmupSec: 10,
  /** host pressed start / ranked room: first round this long after */
  startSec: 3,
  warmupRespawnSec: 2,
  /** final standings screen */
  resultsSec: 12,
  minPlayers: 2,
  maxPlayers: 8,
  // pairing (min-cost matching over the ladder): lower cost wins
  /** cost per earlier duel the two already fought this match */
  repeatCost: 10,
  /** extra cost to face last round's opponent straight again */
  rematchCost: 40,
  /** cost per ladder step between the two, squared (keeps duels near your ladder position) */
  ladderGapCost: 1,
  // ranked queue
  /** once 2 players are waiting, gather more for this long (8 start at once) */
  queueGatherSec: 15,
  /** with more than 8 waiting: the ones nearest the longest waiter's rating go first */
  queueMaxPlayers: 8,
  // ranked ladder (rating/arena.ts)
  /** rating points a leaver loses on top of forfeiting the duel */
  leaverPenalty: 15,
} as const;

export type ArenaSettings = { -readonly [K in keyof typeof ARENA_DEFAULTS]: number };

export const arenaSettings = (patch: Partial<ArenaSettings> = {}): ArenaSettings => ({
  ...ARENA_DEFAULTS,
  ...patch,
});
