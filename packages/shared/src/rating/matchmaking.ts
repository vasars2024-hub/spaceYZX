// Ranked queue logic (pure): who plays whom. The server calls findMatches() every few
// seconds with the current queue and the current time; nothing here keeps state.

import type { RankedMode } from './global';

export interface QueueEntry {
  id: string;
  rating: number;
  pingMs: number;
  joinedAtMs: number;
}

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

const DEFAULTS: Required<MatchmakingOptions> = {
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
 * Form as many matches as possible. Longest-waiting players are served first; each builds a
 * group from the closest ratings (similar ping as tie-breaker). A group is valid when its
 * rating spread fits in the widest window of the players involved. Deterministic.
 */
export const findMatches = (
  queue: readonly QueueEntry[],
  nowMs: number,
  mode: RankedMode,
  opts: MatchmakingOptions = {},
): MatchmakingResult => {
  const o = { ...DEFAULTS, ...opts };
  const size = TEAM_SIZE[mode] * 2;
  const windows = new Map(queue.map((p) => [p.id, searchWindow(p, nowMs, o)]));
  const byWait = [...queue].sort((x, y) => x.joinedAtMs - y.joinedAtMs || byId(x.id, y.id));
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
    let lo = anchor.rating;
    let hi = anchor.rating;
    let win = windows.get(anchor.id) ?? o.baseWindow;
    for (const c of candidates) {
      if (group.length === size) break;
      const nLo = Math.min(lo, c.rating);
      const nHi = Math.max(hi, c.rating);
      const nWin = Math.max(win, windows.get(c.id) ?? o.baseWindow);
      if (nHi - nLo > nWin) continue;
      group.push(c);
      lo = nLo;
      hi = nHi;
      win = nWin;
    }
    if (group.length < size) continue;
    for (const p of group) taken.add(p.id);
    const [a, b] = balanceTeams(group);
    matches.push({ teams: [a.map((p) => p.id), b.map((p) => p.id)] });
  }

  return { matches, remaining: queue.filter((p) => !taken.has(p.id)) };
};
