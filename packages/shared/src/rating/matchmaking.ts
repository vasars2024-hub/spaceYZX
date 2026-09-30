// Ranked queue logic (pure): who plays whom. The server calls findMatches() every few
// seconds with the current queue and the current time; nothing here keeps state.
//
// An entry is a solo player or a party (`size` players searching as one unit, rated by the
// party rating, always on one team — ladders.ts partyRating).

import type { RankedMode } from './global';

export interface QueueEntry {
  id: string;
  rating: number;
  pingMs: number;
  joinedAtMs: number;
  /** players in this entry (a party; default 1). They always play on the same team. */
  size?: number;
  /** a wide-gap full-team party: only matched at this team size (ladders.ts partyOnlySize) */
  onlySize?: number | null;
}

const sizeOf = (e: QueueEntry): number => Math.max(1, e.size ?? 1);

export interface MatchmakingOptions {
  /** Starting rating window (± points). */
  baseWindow?: number;
  /** Window growth per `widenEveryMs` waited. */
  widenBy?: number;
  widenEveryMs?: number;
  /** Largest window (± points). */
  maxWindow?: number;
  /**
   * Candidates whose rating distance falls in the same bucket of this size are ordered
   * by ping difference first (so similar-ping players are preferred among similar ratings).
   */
  ratingBucket?: number;
  /** Players per team (default: the mode's size; Premier may start 4v4 when few search). */
  teamSize?: number;
}

export interface FoundMatch {
  teams: [string[], string[]];
}

export interface MatchmakingResult {
  matches: FoundMatch[];
  /** Players still waiting, in their original queue order. */
  remaining: QueueEntry[];
}

export const TEAM_SIZE: Record<RankedMode, number> = { '1v1': 1, '2v2': 2, '5v5': 5 };

const DEFAULTS: Required<Omit<MatchmakingOptions, 'teamSize'>> = {
  baseWindow: 100,
  widenBy: 50,
  widenEveryMs: 10_000,
  maxWindow: 1000,
  ratingBucket: 50,
};

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** ± rating window for one player after waiting until `nowMs`. */
export const searchWindow = (
  entry: QueueEntry,
  nowMs: number,
  opts: MatchmakingOptions = {},
): number => {
  const o = { ...DEFAULTS, ...opts };
  const waited = Math.max(0, nowMs - entry.joinedAtMs);
  return Math.min(o.maxWindow, o.baseWindow + Math.floor(waited / o.widenEveryMs) * o.widenBy);
};

const teamSum = (team: readonly QueueEntry[]): number => team.reduce((s, p) => s + p.rating, 0);

/** Snake draft by rating, then greedy best swaps to minimize the team average difference. */
export const balanceTeams = (players: readonly QueueEntry[]): [QueueEntry[], QueueEntry[]] => {
  const sorted = [...players].sort((a, b) => b.rating - a.rating || byId(a.id, b.id));
  const a: QueueEntry[] = [];
  const b: QueueEntry[] = [];
  sorted.forEach((p, i) => (i % 4 === 0 || i % 4 === 3 ? a : b).push(p));
  for (let iter = 0; iter < 100; iter++) {
    const diff = teamSum(a) - teamSum(b);
    let best = Math.abs(diff);
    let bi = -1;
    let bj = -1;
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b.length; j++) {
        const d = Math.abs(diff - 2 * (a[i].rating - b[j].rating));
        if (d < best - 1e-9) {
          best = d;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi < 0) break;
    const tmp = a[bi];
    a[bi] = b[bj];
    b[bj] = tmp;
  }
  const order = (t: QueueEntry[]) => t.sort((x, y) => y.rating - x.rating || byId(x.id, y.id));
  return [order(a), order(b)];
};

/**
 * Split whole entries (parties stay together) into two teams of `teamSize` players with the
 * closest total rating (each entry weighs its rating × its size). Null: no exact split exists.
 * Tries every split (a match has at most 10 entries), deterministic.
 */
export const splitParties = (
  entries: readonly QueueEntry[],
  teamSize: number,
): [QueueEntry[], QueueEntry[]] | null => {
  const list = [...entries].sort((a, b) => b.rating - a.rating || byId(a.id, b.id));
  const n = list.length;
  const total = list.reduce((s, e) => s + e.rating * sizeOf(e), 0);
  let best: number | null = null;
  let bestDiff = Infinity;
  // the first entry is always on team A (halves the search, and A/B are symmetric)
  for (let mask = 1; mask < 1 << n; mask += 2) {
    let players = 0;
    let sum = 0;
    for (let i = 0; i < n; i++)
      if (mask & (1 << i)) {
        players += sizeOf(list[i]);
        sum += list[i].rating * sizeOf(list[i]);
      }
    if (players !== teamSize) continue;
    const diff = Math.abs(total - 2 * sum);
    if (diff < bestDiff - 1e-9) {
      bestDiff = diff;
      best = mask;
    }
  }
  if (best === null) return null;
  const a = list.filter((_, i) => best! & (1 << i));
  const b = list.filter((_, i) => !(best! & (1 << i)));
  return [a, b];
};

/**
 * Form as many matches as possible. Longest-waiting players are served first; each builds a
 * group from the closest ratings (similar ping as tie-breaker). A group is valid when its
 * rating spread fits in the widest window of the players involved (and, with parties, when it
 * splits into two full teams without breaking a party). Deterministic.
 */
export const findMatches = (
  queue: readonly QueueEntry[],
  nowMs: number,
  mode: RankedMode,
  opts: MatchmakingOptions = {},
): MatchmakingResult => {
  const o = { ...DEFAULTS, ...opts };
  const teamSize = opts.teamSize ?? TEAM_SIZE[mode];
  const size = teamSize * 2;
  // a party bigger than a team, or one that only plays at another size, sits this one out
  const fits = (p: QueueEntry) =>
    sizeOf(p) <= teamSize &&
    (p.onlySize === undefined || p.onlySize === null || p.onlySize === teamSize);
  const windows = new Map(queue.map((p) => [p.id, searchWindow(p, nowMs, o)]));
  const byWait = [...queue]
    .filter(fits)
    .sort((x, y) => x.joinedAtMs - y.joinedAtMs || byId(x.id, y.id));
  const taken = new Set<string>();
  const matches: FoundMatch[] = [];

  for (const anchor of byWait) {
    if (taken.has(anchor.id)) continue;
    const bucket = (p: QueueEntry) =>
      Math.floor(Math.abs(p.rating - anchor.rating) / o.ratingBucket);
    const candidates = byWait
      .filter((p) => p.id !== anchor.id && !taken.has(p.id))
      .sort(
        (x, y) =>
          bucket(x) - bucket(y) ||
          Math.abs(x.pingMs - anchor.pingMs) - Math.abs(y.pingMs - anchor.pingMs) ||
          Math.abs(x.rating - anchor.rating) - Math.abs(y.rating - anchor.rating) ||
          byId(x.id, y.id),
      );
    const group = [anchor];
    let players = sizeOf(anchor);
    let lo = anchor.rating;
    let hi = anchor.rating;
    let win = windows.get(anchor.id) ?? o.baseWindow;
    for (const c of candidates) {
      if (players === size) break;
      if (players + sizeOf(c) > size) continue;
      const nLo = Math.min(lo, c.rating);
      const nHi = Math.max(hi, c.rating);
      const nWin = Math.max(win, windows.get(c.id) ?? o.baseWindow);
      if (nHi - nLo > nWin) continue;
      group.push(c);
      players += sizeOf(c);
      lo = nLo;
      hi = nHi;
      win = nWin;
    }
    if (players < size) continue;
    const solo = group.every((p) => sizeOf(p) === 1);
    const teams = solo ? balanceTeams(group) : splitParties(group, teamSize);
    if (!teams) continue;
    for (const p of group) taken.add(p.id);
    const [a, b] = teams;
    matches.push({ teams: [a.map((p) => p.id), b.map((p) => p.id)] });
  }

  return { matches, remaining: queue.filter((p) => !taken.has(p.id)) };
};

export interface GroupOptions {
  minPlayers: number;
  maxPlayers: number;
  /** once `minPlayers` wait, how long to gather more (ms) */
  gatherMs: number;
}

/**
 * The next free-for-all group (the Race queue) to start, or null (keep waiting). A full group
 * starts right away: the longest waiter plus the players nearest their rating. Otherwise, once
 * `minPlayers` are waiting, everyone waiting starts together `gatherMs` after the
 * `minPlayers`-th joined. Pure: call again with the rest until it returns null.
 */
export const pickGroup = (
  entries: readonly QueueEntry[],
  nowMs: number,
  opts: GroupOptions,
): string[] | null => {
  const min = Math.max(2, opts.minPlayers);
  if (entries.length < min) return null;
  const byJoin = [...entries].sort((a, b) => a.joinedAtMs - b.joinedAtMs || byId(a.id, b.id));
  if (byJoin.length >= opts.maxPlayers) {
    const anchor = byJoin[0];
    const rest = byJoin
      .slice(1)
      .sort(
        (a, b) =>
          Math.abs(a.rating - anchor.rating) - Math.abs(b.rating - anchor.rating) ||
          a.joinedAtMs - b.joinedAtMs ||
          byId(a.id, b.id),
      );
    return [anchor.id, ...rest.slice(0, opts.maxPlayers - 1).map((e) => e.id)];
  }
  return nowMs - byJoin[min - 1].joinedAtMs >= opts.gatherMs ? byJoin.map((e) => e.id) : null;
};
