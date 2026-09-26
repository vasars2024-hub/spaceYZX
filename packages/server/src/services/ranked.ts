// Ranked data: the ladders (Premier + Duels, shared rating/ladders.ts) with Glicko-2 ratings,
// Premier seasons and opening hours, match history, leaderboards, profiles, reports and
// anti-grief bans. All rating maths lives in @space-yz/shared (rating/*).
//
// A ladder's ratings are rows of `ratings` with mode = the ladder id. Adding a ladder (the
// planned 'race' rank) needs no new table: record its results with save() under its id, and
// profile() / leaderboard() pick it up from LADDER_IDS.
import type { LadderId, RankDisplay, Rating } from '@space-yz/shared';
import {
  applyInactivity,
  DEFAULT_RD,
  DEFAULT_VOL,
  LADDER_IDS,
  LADDERS,
  ladderForMode,
  ladderRank,
  seasonResetRating,
  updateTeamMatch,
} from '@space-yz/shared';
import type { Db } from './db';
import type { MatchResult } from '../game/rules/match';
import type { ArenaResult } from '../game/rules/arena';
import {
  DEFAULT_SCHEDULE,
  describeSchedule,
  scheduleStatus,
  type PremierSchedule,
  type ScheduleStatus,
} from './schedule';

const DAY = 86_400_000;

export interface StoredRating {
  rating: Rating;
  /** all-time games / wins on this ladder */
  games: number;
  wins: number;
  /** this season (seasonal ladders; the others count all-time here too) */
  seasonGames: number;
  seasonWins: number;
  lastPlayed: number;
}

export interface LeaderRow {
  position: number;
  playerId: number;
  name: string;
  rating: number;
  games: number;
  wins: number;
  rank: RankDisplay;
}

/** One ladder in a profile. */
export interface LadderStanding {
  ladder: LadderId;
  name: string;
  /** null while placing on a ladder that hides it (Premier) */
  rating: number | null;
  games: number;
  wins: number;
  placed: boolean;
  /** placement progress, e.g. 2 of 5 wins */
  placement: { done: number; need: number; unit: 'wins' | 'games' };
  /** null while the rating is hidden */
  rank: RankDisplay | null;
  position: number | null;
}

export interface Profile {
  id: number;
  name: string;
  /** current season number (Premier) */
  season: number;
  /** every ladder (rating/ladders.ts), in LADDER_IDS order */
  ladders: Record<LadderId, LadderStanding>;
  /** Premier's finished seasons, newest first (rating only if placed that season) */
  pastSeasons: { season: number; rating: number | null; rank: RankDisplay | null }[];
  recent: {
    mode: string;
    /** the ladder a ranked match counted for (null: casual, or an old removed ladder) */
    ladder: LadderId | null;
    ranked: boolean;
    /** arena: placed first */
    won: boolean | null;
    /** arena: final place (1 = won the arena), else null */
    place: number | null;
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
}

/** Extra weight on placement games (on top of Glicko's own uncertainty). */
export const PLACEMENT_BOOST = 1.2;

/** Escalating ranked bans for grief kicks: 10 min, 1 h, 1 day, then 7 days. */
export const BAN_STEPS_MS = [10 * 60_000, 60 * 60_000, DAY, 7 * DAY];

const SCHEDULE_KEY = 'premier_schedule';

const newLadderRating = (ladder: LadderId): Rating => ({
  rating: LADDERS[ladder].startRating,
  rd: DEFAULT_RD,
  vol: DEFAULT_VOL,
});

/** Placement progress on a ladder. */
const placementOf = (ladder: LadderId, s: StoredRating) => {
  const p = LADDERS[ladder].placement;
  const done = p.unit === 'wins' ? s.seasonWins : s.games;
  return { done: Math.min(done, p.count), need: p.count, unit: p.unit, placed: done >= p.count };
};

export class RankedStore {
  constructor(
    private db: Db,
    private now: () => number = Date.now,
  ) {}

  // ---------------- ratings ----------------

  rating(playerId: number, ladder: LadderId): StoredRating {
    const row = this.db
      .prepare(
        `SELECT rating, rd, vol, games, wins, season_games, season_wins, last_played
         FROM ratings WHERE player_id = ? AND mode = ?`,
      )
      .get(playerId, ladder) as
      | {
          rating: number;
          rd: number;
          vol: number;
          games: number;
          wins: number;
          season_games: number;
          season_wins: number;
          last_played: number;
        }
      | undefined;
    if (!row)
      return {
        rating: newLadderRating(ladder),
        games: 0,
        wins: 0,
        seasonGames: 0,
        seasonWins: 0,
        lastPlayed: this.now(),
      };
    // top ratings slowly decay while inactive (applied when read)
    const days = (this.now() - row.last_played) / DAY;
    const rating = applyInactivity({ rating: row.rating, rd: row.rd, vol: row.vol }, days, {
      floor: LADDERS[ladder].decayFloor,
    });
    return {
      rating,
      games: row.games,
      wins: row.wins,
      seasonGames: row.season_games,
      seasonWins: row.season_wins,
      lastPlayed: row.last_played,
    };
  }

  /** Is this player past placement on the ladder? */
  placed(playerId: number, ladder: LadderId): boolean {
    return placementOf(ladder, this.rating(playerId, ladder)).placed;
  }

  save(playerId: number, ladder: LadderId, r: StoredRating): void {
    this.db
      .prepare(
        `INSERT INTO ratings (player_id, mode, rating, rd, vol, games, wins, last_played, season_games, season_wins)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(player_id, mode) DO UPDATE SET rating = excluded.rating, rd = excluded.rd,
           vol = excluded.vol, games = excluded.games, wins = excluded.wins, last_played = excluded.last_played,
           season_games = excluded.season_games, season_wins = excluded.season_wins`,
      )
      .run(
        playerId,
        ladder,
        r.rating.rating,
        r.rating.rd,
        r.rating.vol,
        r.games,
        r.wins,
        r.lastPlayed,
        r.seasonGames,
        r.seasonWins,
      );
  }

  /**
   * Store a finished match. Ranked matches update the ladder of their team size (5v5 Premier,
   * 1v1 / 2v2 Duels): placements count more, team kills and leaving cost extra. Private
   * matches are only recorded. Returns rating changes by account id.
   */
  recordMatch(input: MatchRecordInput): Map<number, number> {
    const { result } = input;
    const t = this.now();
    const deltas = new Map<number, number>();
    const ladder = input.ranked ? ladderForMode(result.mode) : null;
    this.db.exec('BEGIN');
    try {
      if (ladder) {
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
          const stored = teams.map((tm) => tm.map((e) => this.rating(e.accountId, ladder)));
          const left = (s: StoredRating) => {
            const p = placementOf(ladder, s);
            return Math.max(0, p.need - p.done);
          };
          const updates = updateTeamMatch({
            teams: [stored[0].map((s) => s.rating), stored[1].map((s) => s.rating)],
            winner: result.winner,
            options: {
              // Glicko-2 already moves new players a lot (high RD); keep the placement boost mild
              placementFactor: PLACEMENT_BOOST,
              placementGamesLeft: [stored[0].map(left), stored[1].map(left)],
              teamKills: [teams[0].map((e) => e.teamKills), teams[1].map((e) => e.teamKills)],
              leftEarly: [teams[0].map((e) => e.left), teams[1].map((e) => e.left)],
            },
          });
          for (const side of [0, 1] as const)
            teams[side].forEach((e, i) => {
              const u = updates[side][i];
              const s = stored[side][i];
              const won = result.winner === side && !e.left ? 1 : 0;
              this.save(e.accountId, ladder, {
                rating: u.rating,
                games: s.games + 1,
                wins: s.wins + won,
                seasonGames: s.seasonGames + 1,
                seasonWins: s.seasonWins + won,
                lastPlayed: t,
              });
              deltas.set(e.accountId, u.delta);
            });
        }
      }
      const m = this.db
        .prepare(
          `INSERT INTO matches (mode, ranked, map, winner, score_a, score_b, reason, duration_sec, created_at, ladder)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          ladder,
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

  /**
   * Store a finished Arena 1v1 match (casual only: the Arena has no ranked queue any more).
   * Kept in the match history with each player's place and duels.
   */
  recordArena(input: { map: string; result: ArenaResult }): void {
    const { result } = input;
    const t = this.now();
    this.db.exec('BEGIN');
    try {
      const top = result.standings[0];
      const m = this.db
        .prepare(
          `INSERT INTO matches (mode, ranked, map, winner, score_a, score_b, reason, duration_sec, created_at)
           VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'arena',
          input.map,
          null,
          top?.wins ?? 0,
          top?.losses ?? 0,
          result.reason,
          result.durationSec,
          t,
        );
      const matchId = Number(m.lastInsertRowid);
      const ins = this.db.prepare(
        `INSERT INTO match_players (match_id, player_id, name, team, bot, kills, deaths, team_kills, damage, rating_delta, left_early, place, duel_wins, duel_losses)
         VALUES (?, ?, ?, 0, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?)`,
      );
      for (const r of result.standings)
        ins.run(
          matchId,
          r.accountId,
          r.name,
          r.bot ? 1 : 0,
          r.kills,
          r.deaths,
          r.damage,
          r.left ? 1 : 0,
          r.place,
          r.wins,
          r.losses,
        );
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  // ---------------- leaderboards & profiles ----------------

  /** Placed players of a ladder (current season), best first. */
  private ladderRows(ladder: LadderId): {
    playerId: number;
    name: string;
    rating: number;
    games: number;
    wins: number;
  }[] {
    const p = LADDERS[ladder].placement;
    const col = p.unit === 'wins' ? 'r.season_wins' : 'r.games';
    return (
      this.db
        .prepare(
          `SELECT r.player_id AS playerId, p.name AS name, r.rating AS rating, r.rd AS rd, r.vol AS vol,
                  r.games AS games, r.wins AS wins, r.last_played AS lastPlayed
           FROM ratings r JOIN players p ON p.id = r.player_id
           WHERE r.mode = ? AND ${col} >= ?`,
        )
        .all(ladder, p.count) as {
        playerId: number;
        name: string;
        rating: number;
        rd: number;
        vol: number;
        games: number;
        wins: number;
        lastPlayed: number;
      }[]
    )
      .map((r) => ({
        playerId: r.playerId,
        name: r.name,
        games: r.games,
        wins: r.wins,
        rating: applyInactivity(
          { rating: r.rating, rd: r.rd, vol: r.vol },
          (this.now() - r.lastPlayed) / DAY,
          { floor: LADDERS[ladder].decayFloor },
        ).rating,
      }))
      .sort((a, b) => b.rating - a.rating || a.playerId - b.playerId);
  }

  /** A finished season's final standings (placed players only). */
  private seasonRows(ladder: LadderId, season: number) {
    return this.db
      .prepare(
        `SELECT s.player_id AS playerId, p.name AS name, s.rating AS rating, s.games AS games, s.wins AS wins
         FROM season_results s JOIN players p ON p.id = s.player_id
         WHERE s.ladder = ? AND s.season = ? AND s.placed = 1
         ORDER BY s.rating DESC, s.player_id ASC`,
      )
      .all(ladder, season) as {
      playerId: number;
      name: string;
      rating: number;
      games: number;
      wins: number;
    }[];
  }

  /** Leaderboard of a ladder; `season` = a finished season's final standings (seasonal ladders). */
  leaderboard(ladder: LadderId, limit = 50, season?: number): LeaderRow[] {
    const rows =
      season !== undefined && season !== this.season()
        ? this.seasonRows(ladder, season)
        : this.ladderRows(ladder);
    return rows.slice(0, limit).map((r, i) => ({
      position: i + 1,
      ...r,
      rating: Math.round(r.rating),
      rank: ladderRank(ladder, r.rating, { position: i + 1 }),
    }));
  }

  private standing(playerId: number, ladder: LadderId): LadderStanding {
    const def = LADDERS[ladder];
    const s = this.rating(playerId, ladder);
    const p = placementOf(ladder, s);
    const position = p.placed
      ? this.ladderRows(ladder).findIndex((r) => r.playerId === playerId) + 1 || null
      : null;
    const hidden = def.hideWhilePlacing && !p.placed;
    return {
      ladder,
      name: def.name,
      rating: hidden ? null : Math.round(s.rating.rating),
      games: s.games,
      wins: s.wins,
      placed: p.placed,
      placement: { done: p.done, need: p.need, unit: p.unit },
      rank: hidden
        ? null
        : ladderRank(ladder, s.rating.rating, {
            placed: p.placed,
            placementPlayed: p.done,
            position: position ?? undefined,
          }),
      position,
    };
  }

  profile(playerId: number): Profile | null {
    const p = this.db
      .prepare('SELECT id, name, warnings FROM players WHERE id = ?')
      .get(playerId) as { id: number; name: string; warnings: number } | undefined;
    if (!p) return null;
    const ladders = Object.fromEntries(
      LADDER_IDS.map((l) => [l, this.standing(playerId, l)]),
    ) as Record<LadderId, LadderStanding>;
    const pastSeasons = (
      this.db
        .prepare(
          `SELECT season, rating, placed FROM season_results
           WHERE player_id = ? AND ladder = 'premier' ORDER BY season DESC`,
        )
        .all(playerId) as { season: number; rating: number; placed: number }[]
    ).map((r) => ({
      season: r.season,
      rating: r.placed ? Math.round(r.rating) : null,
      rank: r.placed ? ladderRank('premier', r.rating) : null,
    }));
    const recent = (
      this.db
        .prepare(
          `SELECT m.mode AS mode, m.ranked AS ranked, m.ladder AS ladder, m.winner AS winner, mp.team AS team,
                  mp.rating_delta AS delta, mp.kills AS kills, mp.deaths AS deaths, m.created_at AS at,
                  mp.left_early AS left, mp.place AS place
           FROM match_players mp JOIN matches m ON m.id = mp.match_id
           WHERE mp.player_id = ? ORDER BY m.id DESC LIMIT 10`,
        )
        .all(playerId) as {
        mode: string;
        ranked: number;
        ladder: string | null;
        winner: number | null;
        team: number;
        delta: number;
        kills: number;
        deaths: number;
        at: number;
        left: number;
        place: number | null;
      }[]
    ).map((r) => ({
      mode: r.mode,
      ladder: (LADDER_IDS as readonly string[]).includes(r.ladder ?? '')
        ? (r.ladder as LadderId)
        : null,
      ranked: !!r.ranked,
      won: r.left
        ? false
        : r.place !== null
          ? r.place === 1
          : r.winner === null
            ? null
            : r.winner === r.team,
      place: r.place ?? null,
      delta: Math.round(r.delta),
      kills: r.kills,
      deaths: r.deaths,
      at: r.at,
    }));
    return {
      id: p.id,
      name: p.name,
      season: this.season(),
      ladders,
      pastSeasons,
      recent,
      bannedUntil: this.bannedUntil(playerId),
      warnings: p.warnings,
    };
  }

  // ---------------- seasons ----------------

  season(): number {
    const row = this.db.prepare('SELECT MAX(number) AS n FROM seasons').get() as {
      n: number | null;
    };
    return row.n ?? 1;
  }

  /**
   * Start a new season: archive every seasonal ladder's final ratings (season_results), pull
   * each rating 40% toward the start (rating/ladders.ts seasonResetRating) and start placement
   * over. Returns the new season number and how many ratings were reset.
   */
  startNewSeason(): { season: number; players: number } {
    const old = this.season();
    let players = 0;
    this.db.exec('BEGIN');
    try {
      for (const ladder of LADDER_IDS) {
        const def = LADDERS[ladder];
        if (!def.seasonal) continue;
        const placedCol = def.placement.unit === 'wins' ? 'season_wins' : 'games';
        this.db
          .prepare(
            `INSERT OR REPLACE INTO season_results (season, player_id, ladder, rating, games, wins, placed)
             SELECT ?, player_id, mode, rating, season_games, season_wins, CASE WHEN ${placedCol} >= ? THEN 1 ELSE 0 END
             FROM ratings WHERE mode = ? AND season_games > 0`,
          )
          .run(old, def.placement.count, ladder);
        const rows = this.db
          .prepare('SELECT player_id AS id, rating FROM ratings WHERE mode = ?')
          .all(ladder) as { id: number; rating: number }[];
        const upd = this.db.prepare(
          'UPDATE ratings SET rating = ?, season_wins = 0, season_games = 0 WHERE player_id = ? AND mode = ?',
        );
        for (const r of rows) upd.run(seasonResetRating(r.rating), r.id, ladder);
        players += rows.length;
      }
      this.db
        .prepare('INSERT INTO seasons (number, started_at) VALUES (?, ?)')
        .run(old + 1, this.now());
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return { season: old + 1, players };
  }

  // ---------------- settings: Premier opening hours ----------------

  private setting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      { value: string } | undefined;
    return row?.value ?? null;
  }

  private setSetting(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  schedule(): PremierSchedule {
    try {
      const v = JSON.parse(this.setting(SCHEDULE_KEY) ?? 'null') as PremierSchedule | null;
      if (v && (v.mode === 'always' || v.mode === 'scheduled') && Array.isArray(v.windows))
        return v;
    } catch {
      /* fall back to the default */
    }
    return DEFAULT_SCHEDULE;
  }

  setSchedule(s: PremierSchedule): void {
    this.setSetting(SCHEDULE_KEY, JSON.stringify(s));
  }

  premierStatus(): ScheduleStatus {
    return scheduleStatus(this.schedule(), new Date(this.now()));
  }

  /** What every client needs to know about ranked right now (protocol RankedInfo). */
  info(): {
    season: number;
    premier: {
      open: boolean;
      opensInSec: number | null;
      closesInSec: number | null;
      hours: string;
    };
  } {
    const st = this.premierStatus();
    const sec = (ms: number | null) => (ms === null ? null : Math.ceil(ms / 1000));
    return {
      season: this.season(),
      premier: {
        open: st.open,
        opensInSec: sec(st.opensInMs),
        closesInSec: sec(st.closesInMs),
        hours: describeSchedule(this.schedule()),
      },
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
