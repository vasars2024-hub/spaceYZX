// Ranked data: Glicko-2 ratings per mode, match history, leaderboards, profiles, reports and
// anti-grief bans. All rating maths lives in @space-yz/shared (rating/*).
import type { Rating, RankedMode, ModeRatings, TierInfo } from '@space-yz/shared';
import {
  newRating,
  updateTeamMatch,
  applyInactivity,
  globalRating,
  tierFor,
  RANKED_MODES,
  PLACEMENT_GAMES,
} from '@space-yz/shared';
import type { Db } from './db';
import type { MatchResult } from '../game/rules/match';

const DAY = 86_400_000;

export interface StoredRating {
  rating: Rating;
  games: number;
  wins: number;
  lastPlayed: number;
}

export interface LeaderRow {
  position: number;
  playerId: number;
  name: string;
  rating: number;
  games: number;
  tier: TierInfo;
}

export interface Profile {
  id: number;
  name: string;
  modes: Partial<
    Record<
      RankedMode,
      {
        rating: number;
        rd: number;
        games: number;
        wins: number;
        tier: TierInfo;
        position: number | null;
      }
    >
  >;
  global: { rating: number | null; tier: TierInfo; position: number | null };
  recent: {
    mode: string;
    ranked: boolean;
    won: boolean | null;
    delta: number;
    kills: number;
    deaths: number;
    at: number;
  }[];
  bannedUntil: number | null;
  warnings: number;
}

export interface MatchRecordInput {
  mode: string;
  ranked: boolean;
  map: string;
  result: MatchResult;
  names: Record<number, string>;
  /** leavers' account ids (their ratings are updated as losses) */
}

/** Extra weight on placement games (on top of Glicko's own uncertainty). */
export const PLACEMENT_BOOST = 1.2;

/** Escalating ranked bans for grief kicks: 10 min, 1 h, 1 day, then 7 days. */
export const BAN_STEPS_MS = [10 * 60_000, 60 * 60_000, DAY, 7 * DAY];

export class RankedStore {
  constructor(
    private db: Db,
    private now: () => number = Date.now,
  ) {}

  rating(playerId: number, mode: RankedMode): StoredRating {
    const row = this.db
      .prepare(
        'SELECT rating, rd, vol, games, wins, last_played FROM ratings WHERE player_id = ? AND mode = ?',
      )
      .get(playerId, mode) as
      | {
          rating: number;
          rd: number;
          vol: number;
          games: number;
          wins: number;
          last_played: number;
        }
      | undefined;
    if (!row) return { rating: newRating(), games: 0, wins: 0, lastPlayed: this.now() };
    // top tiers slowly decay while inactive (applied when read)
    const days = (this.now() - row.last_played) / DAY;
    const rating = applyInactivity({ rating: row.rating, rd: row.rd, vol: row.vol }, days);
    return { rating, games: row.games, wins: row.wins, lastPlayed: row.last_played };
  }

  private save(playerId: number, mode: RankedMode, r: StoredRating): void {
    this.db
      .prepare(
        `INSERT INTO ratings (player_id, mode, rating, rd, vol, games, wins, last_played)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(player_id, mode) DO UPDATE SET rating = excluded.rating, rd = excluded.rd,
           vol = excluded.vol, games = excluded.games, wins = excluded.wins, last_played = excluded.last_played`,
      )
      .run(
        playerId,
        mode,
        r.rating.rating,
        r.rating.rd,
        r.rating.vol,
        r.games,
        r.wins,
        r.lastPlayed,
      );
  }

  /**
   * Store a finished match. Ranked matches update ratings (placements count more, team kills
   * and leaving cost extra); private matches are only recorded. Returns rating changes by
   * account id.
   */
  recordMatch(input: MatchRecordInput): Map<number, number> {
    const { result } = input;
    const t = this.now();
    const deltas = new Map<number, number>();
    const mode = result.mode;
    this.db.exec('BEGIN');
    try {
      if (input.ranked) {
        // everyone with an account who played or left counts
        const entries: { accountId: number; team: 0 | 1; teamKills: number; left: boolean }[] = [];
        for (const p of result.players)
          if (p.accountId !== null && !p.bot)
            entries.push({
              accountId: p.accountId,
              team: p.team,
              teamKills: p.teamKills,
              left: false,
            });
        for (const l of result.leavers)
          if (l.accountId !== null && !entries.some((e) => e.accountId === l.accountId))
            entries.push({ accountId: l.accountId, team: l.team, teamKills: 0, left: true });
        const teams: [typeof entries, typeof entries] = [
          entries.filter((e) => e.team === 0),
          entries.filter((e) => e.team === 1),
        ];
        if (teams[0].length && teams[1].length) {
          const stored = teams.map((tm) => tm.map((e) => this.rating(e.accountId, mode)));
          const updates = updateTeamMatch({
            teams: [stored[0].map((s) => s.rating), stored[1].map((s) => s.rating)],
            winner: result.winner,
            options: {
              // Glicko-2 already moves new players a lot (high RD); keep the placement boost mild
              placementFactor: PLACEMENT_BOOST,
              placementGamesLeft: [
                stored[0].map((s) => Math.max(0, PLACEMENT_GAMES - s.games)),
                stored[1].map((s) => Math.max(0, PLACEMENT_GAMES - s.games)),
              ],
              teamKills: [teams[0].map((e) => e.teamKills), teams[1].map((e) => e.teamKills)],
              leftEarly: [teams[0].map((e) => e.left), teams[1].map((e) => e.left)],
            },
          });
          for (const side of [0, 1] as const)
            teams[side].forEach((e, i) => {
              const u = updates[side][i];
              const s = stored[side][i];
              this.save(e.accountId, mode, {
                rating: u.rating,
                games: s.games + 1,
                wins: s.wins + (result.winner === side && !e.left ? 1 : 0),
                lastPlayed: t,
              });
              deltas.set(e.accountId, u.delta);
            });
        }
      }
      const m = this.db
        .prepare(
          `INSERT INTO matches (mode, ranked, map, winner, score_a, score_b, reason, duration_sec, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.mode,
          input.ranked ? 1 : 0,
          input.map,
          result.winner,
          result.scores[0],
          result.scores[1],
          result.reason,
          result.durationSec,
          t,
        );
      const matchId = Number(m.lastInsertRowid);
      const ins = this.db.prepare(
        `INSERT INTO match_players (match_id, player_id, name, team, bot, kills, deaths, team_kills, damage, rating_delta, left_early)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const p of result.players)
        ins.run(
          matchId,
          p.accountId,
          input.names[p.id] ?? `Player ${p.id}`,
          p.team,
          p.bot ? 1 : 0,
          p.kills,
          p.deaths,
          p.teamKills,
          p.damage,
          p.accountId !== null ? (deltas.get(p.accountId) ?? 0) : 0,
          0,
        );
      for (const l of result.leavers)
        if (l.accountId !== null)
          ins.run(
            matchId,
            l.accountId,
            'left',
            l.team,
            0,
            0,
            0,
            0,
            0,
            deltas.get(l.accountId) ?? 0,
            1,
          );
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return deltas;
  }

  /** Ranked (placed) players of a mode, best first. */
  private modeRows(
    mode: RankedMode,
  ): { playerId: number; name: string; rating: number; games: number }[] {
    return (
      this.db
        .prepare(
          `SELECT r.player_id AS playerId, p.name AS name, r.rating AS rating, r.rd AS rd, r.vol AS vol,
                  r.games AS games, r.last_played AS lastPlayed
           FROM ratings r JOIN players p ON p.id = r.player_id
           WHERE r.mode = ? AND r.games >= ?`,
        )
        .all(mode, PLACEMENT_GAMES) as {
        playerId: number;
        name: string;
        rating: number;
        rd: number;
        vol: number;
        games: number;
        lastPlayed: number;
      }[]
    )
      .map((r) => ({
        playerId: r.playerId,
        name: r.name,
        games: r.games,
        rating: applyInactivity(
          { rating: r.rating, rd: r.rd, vol: r.vol },
          (this.now() - r.lastPlayed) / DAY,
        ).rating,
      }))
      .sort((a, b) => b.rating - a.rating || a.playerId - b.playerId);
  }

  private globalRows(): { playerId: number; name: string; rating: number; games: number }[] {
    const rows = this.db
      .prepare(
        `SELECT r.player_id AS playerId, p.name AS name, r.mode AS mode, r.rating AS rating, r.rd AS rd, r.games AS games
         FROM ratings r JOIN players p ON p.id = r.player_id`,
      )
      .all() as {
      playerId: number;
      name: string;
      mode: RankedMode;
      rating: number;
      rd: number;
      games: number;
    }[];
    const by = new Map<number, { name: string; modes: ModeRatings }>();
    for (const r of rows) {
      const e = by.get(r.playerId) ?? { name: r.name, modes: {} };
      e.modes[r.mode] = { rating: r.rating, rd: r.rd, games: r.games };
      by.set(r.playerId, e);
    }
    const out: { playerId: number; name: string; rating: number; games: number }[] = [];
    for (const [playerId, e] of by) {
      const games = Object.values(e.modes).reduce((s, m) => s + (m?.games ?? 0), 0);
      const g = globalRating(e.modes);
      if (g !== null && games >= PLACEMENT_GAMES)
        out.push({ playerId, name: e.name, rating: g, games });
    }
    return out.sort((a, b) => b.rating - a.rating || a.playerId - b.playerId);
  }

  leaderboard(which: RankedMode | 'global', limit = 50): LeaderRow[] {
    const rows = which === 'global' ? this.globalRows() : this.modeRows(which);
    return rows.slice(0, limit).map((r, i) => ({
      position: i + 1,
      ...r,
      rating: Math.round(r.rating),
      tier: tierFor(r.rating, { placementDone: true, leaderboardPosition: i + 1 }),
    }));
  }

  profile(playerId: number): Profile | null {
    const p = this.db
      .prepare('SELECT id, name, warnings FROM players WHERE id = ?')
      .get(playerId) as { id: number; name: string; warnings: number } | undefined;
    if (!p) return null;
    const modes: Profile['modes'] = {};
    const mr: ModeRatings = {};
    for (const mode of RANKED_MODES) {
      const s = this.rating(playerId, mode);
      if (s.games === 0) continue;
      const placed = s.games >= PLACEMENT_GAMES;
      const pos = placed
        ? this.modeRows(mode).findIndex((r) => r.playerId === playerId) + 1 || null
        : null;
      modes[mode] = {
        rating: Math.round(s.rating.rating),
        rd: Math.round(s.rating.rd),
        games: s.games,
        wins: s.wins,
        position: pos,
        tier: tierFor(s.rating.rating, {
          placementDone: placed,
          placementGamesPlayed: s.games,
          leaderboardPosition: pos ?? undefined,
        }),
      };
      mr[mode] = { rating: s.rating.rating, rd: s.rating.rd, games: s.games };
    }
    const g = globalRating(mr);
    const totalGames = Object.values(mr).reduce((s, m) => s + (m?.games ?? 0), 0);
    const gPos =
      g !== null ? this.globalRows().findIndex((r) => r.playerId === playerId) + 1 || null : null;
    const recent = (
      this.db
        .prepare(
          `SELECT m.mode AS mode, m.ranked AS ranked, m.winner AS winner, mp.team AS team, mp.rating_delta AS delta,
                  mp.kills AS kills, mp.deaths AS deaths, m.created_at AS at, mp.left_early AS left
           FROM match_players mp JOIN matches m ON m.id = mp.match_id
           WHERE mp.player_id = ? ORDER BY m.id DESC LIMIT 10`,
        )
        .all(playerId) as {
        mode: string;
        ranked: number;
        winner: number | null;
        team: number;
        delta: number;
        kills: number;
        deaths: number;
        at: number;
        left: number;
      }[]
    ).map((r) => ({
      mode: r.mode,
      ranked: !!r.ranked,
      won: r.left ? false : r.winner === null ? null : r.winner === r.team,
      delta: Math.round(r.delta),
      kills: r.kills,
      deaths: r.deaths,
      at: r.at,
    }));
    return {
      id: p.id,
      name: p.name,
      modes,
      global: {
        rating: g === null ? null : Math.round(g),
        position: gPos,
        tier: tierFor(g ?? 0, {
          placementDone: g !== null && totalGames >= PLACEMENT_GAMES,
          placementGamesPlayed: totalGames,
          leaderboardPosition: gPos ?? undefined,
        }),
      },
      recent,
      bannedUntil: this.bannedUntil(playerId),
      warnings: p.warnings,
    };
  }

  // ---------------- anti-grief ----------------

  warn(playerId: number): void {
    this.db.prepare('UPDATE players SET warnings = warnings + 1 WHERE id = ?').run(playerId);
  }

  /** A grief kick: counts as a loss (handled by the match) and starts an escalating ban. */
  griefKick(playerId: number, reason: string): number {
    this.db.prepare('UPDATE players SET grief_kicks = grief_kicks + 1 WHERE id = ?').run(playerId);
    const n = (
      this.db.prepare('SELECT COUNT(*) AS n FROM bans WHERE player_id = ?').get(playerId) as {
        n: number;
      }
    ).n;
    const until = this.now() + BAN_STEPS_MS[Math.min(n, BAN_STEPS_MS.length - 1)];
    this.db
      .prepare('INSERT INTO bans (player_id, until, reason, created_at) VALUES (?, ?, ?, ?)')
      .run(playerId, until, reason, this.now());
    return until;
  }

  bannedUntil(playerId: number): number | null {
    const row = this.db
      .prepare('SELECT MAX(until) AS until FROM bans WHERE player_id = ?')
      .get(playerId) as { until: number | null };
    return row.until !== null && row.until > this.now() ? row.until : null;
  }

  /** Owner-only moderation: lift bans (host dashboard). */
  unban(playerId: number): void {
    this.db
      .prepare('UPDATE bans SET until = ? WHERE player_id = ? AND until > ?')
      .run(this.now(), playerId, this.now());
  }

  report(input: {
    reporterId: number | null;
    reportedId: number | null;
    reportedName: string;
    reason: string;
    room: string;
  }): void {
    this.db
      .prepare(
        'INSERT INTO reports (reporter_id, reported_id, reported_name, reason, room, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        input.reporterId,
        input.reportedId,
        input.reportedName,
        input.reason.slice(0, 200),
        input.room,
        this.now(),
      );
  }

  reports(limit = 100): {
    id: number;
    reportedId: number | null;
    reportedName: string;
    reason: string;
    room: string;
    at: number;
    handled: boolean;
    count: number;
  }[] {
    return (
      this.db
        .prepare(
          `SELECT r.id AS id, r.reported_id AS reportedId, r.reported_name AS reportedName, r.reason AS reason,
                  r.room AS room, r.created_at AS at, r.handled AS handled,
                  (SELECT COUNT(*) FROM reports x WHERE x.reported_id = r.reported_id) AS count
           FROM reports r ORDER BY r.id DESC LIMIT ?`,
        )
        .all(limit) as {
        id: number;
        reportedId: number | null;
        reportedName: string;
        reason: string;
        room: string;
        at: number;
        handled: number;
        count: number;
      }[]
    ).map((r) => ({ ...r, handled: !!r.handled }));
  }

  markHandled(reportId: number): void {
    this.db.prepare('UPDATE reports SET handled = 1 WHERE id = ?').run(reportId);
  }
}
