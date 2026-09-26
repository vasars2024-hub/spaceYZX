// Premier map veto (pure; the server owns the state and the clock). The two teams take turns
// banning a map from the pool until one is left: that map is played. Any player of the team
// whose turn it is can ban (first click counts). When a turn's time runs out, a random map is
// banned for that team (the caller passes the random number).

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
  /** players per team (5, or 4 when few are searching) */
  teamSize: number;
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
