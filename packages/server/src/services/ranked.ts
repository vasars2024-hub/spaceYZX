// Ranked data: the ladders (Premier, Premier CS, Duels, Race — shared rating/ladders.ts;
// Glicko-2 for the match ladders, pairwise Elo for Race), seasons, when each ranked queue is
// open (Premier's opening hours + players-online thresholds), match and race history, race
// personal bests, leaderboards, profiles, reports and anti-grief bans. All rating maths lives
// in @space-yz/shared (rating/*).
//
// A ladder's ratings are rows of `ratings` with mode = the ladder id: profile() /
// leaderboard() / startNewSeason() pick every ladder up from LADDER_IDS.
import type {
  FormResult,
  LadderId,
  RankDisplay,
  RaceRatingNotice,
  RankedQueueId,
  Rating,
} from '@space-yz/shared';
import {
  applyInactivity,
  DEFAULT_RD,
  DEFAULT_VOL,
  LADDER_IDS,
  LADDERS,
  ladderForMode,
  ladderRank,
  raceMaps,
  RANKED_QUEUE_IDS,
  rankedQueue,
  seasonResetRating,
  updateRaceRatings,
  updateTeamMatch,
} from '@space-yz/shared';
import type { Db } from './db';
import type { MatchResult } from '../game/rules/match';
import type { ArenaResult } from '../game/rules/arena';
import type { RaceRecord } from '../game/rules/race';
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
  placement: { done: number; need: number; unit: 'wins' | 'games' | 'races' };
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
  /** finished seasons of the seasonal ladders, newest first (rating only if placed) */
  pastSeasons: {
    season: number;
    ladder: LadderId;
    rating: number | null;
    rank: RankDisplay | null;
  }[];
  /** your best time on every race track (null: no finish yet), with your place on its board */
  raceBests: { track: string; timeMs: number | null; position: number | null; at: number }[];
  /** your last races (online race rooms) */
  recentRaces: {
    track: string;
    ranked: boolean;
    place: number;
    racers: number;
    timeMs: number | null;
    delta: number;
    at: number;
  }[];
  recent: {
    /** for the match detail (/api/match?id=) */
    matchId: number;
    /** 'tower', 'bomb', 'elim'… (null: arena / not recorded) */
    objective: string | null;
    map: string;
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
  /** the ladder a ranked match counts for (default: from the mode, see ladderForMode) */
  ladder?: LadderId | null;
  /**
   * rating change multiplier per account (a wide-gap full-team party stack earns less:
   * rating/ladders.ts stackMultiplier); missing = 1
   */
  scale?: ReadonlyMap<number, number>;
}

/**
 * Players online at which each ranked queue opens (0 = no player-count rule). Premier and
 * Premier CS need a crowd; Duels and Race are always open. The host can change them.
 */
export const DEFAULT_THRESHOLDS: Record<RankedQueueId, number> = {
  premier: 20,
  'premier-cs': 35,
  'duels-1v1': 0,
  'duels-2v2': 0,
  race: 0,
};

/** Whether a ranked queue is open now, and why. */
export interface QueueOpenStatus {
  open: boolean;
  /** opens at this many players online (0 = no such rule) */
  threshold: number;
  online: number;
  /** Premier's opening hours: open now by the hours (null: no hours for this queue / set) */
  byHours: boolean | null;
}

/** Extra weight on placement games (on top of Glicko's own uncertainty). */
export const PLACEMENT_BOOST = 1.2;

/** Escalating ranked bans for grief kicks: 10 min, 1 h, 1 day, then 7 days. */
export const BAN_STEPS_MS = [10 * 60_000, 60 * 60_000, DAY, 7 * DAY];

const SCHEDULE_KEY = 'premier_schedule';
const THRESHOLDS_KEY = 'queue_thresholds';

const newLadderRating = (ladder: LadderId): Rating => ({
  rating: LADDERS[ladder].startRating,
  rd: DEFAULT_RD,
  vol: DEFAULT_VOL,
});

/** The `ratings` column placement counts: this season's wins / games, or all-time games. */
const placementCol = (ladder: LadderId): 'season_wins' | 'season_games' | 'games' =>
  LADDERS[ladder].placement.unit === 'wins'
    ? 'season_wins'
    : LADDERS[ladder].seasonal
      ? 'season_games'
      : 'games';

/** Placement progress on a ladder. */
const placementOf = (ladder: LadderId, s: StoredRating) => {
  const p = LADDERS[ladder].placement;
  const col = placementCol(ladder);
  const done =
    col === 'season_wins' ? s.seasonWins : col === 'season_games' ? s.seasonGames : s.games;
  return { done: Math.min(done, p.count), need: p.count, unit: p.unit, placed: done >= p.count };
};

/** One racer's line as recordRace() stores it. */
interface RaceLine {
  accountId: number | null;
  name: string;
  bot: boolean;
  place: number;
  timeMs: number | null;
  splitsMs: number[];
  dnf: boolean;
  left: boolean;
  respawns: number;
}

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
    const ladder = input.ranked ? (input.ladder ?? ladderForMode(result.mode)) : null;
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
              // a wide-gap full stack earns (and loses) less
              const k = input.scale?.get(e.accountId) ?? 1;
              if (k !== 1) {
                u.delta *= k;
                u.rating = { ...u.rating, rating: s.rating.rating + u.delta };
              }
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
          `INSERT INTO matches (mode, ranked, map, winner, score_a, score_b, reason, duration_sec, created_at, ladder, objective)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          result.objective ?? null,
        );
      const matchId = Number(m.lastInsertRowid);
      const ins = this.db.prepare(
        `INSERT INTO match_players (match_id, player_id, name, team, bot, kills, deaths, team_kills, damage, rating_delta, left_early)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      // shooting stats + time played (profiles), kills per weapon (favourite weapon); a
      // free-for-all (Brawl FFA) also stores each player's final place (1st counts as a win)
      const insStats = this.db.prepare(
        `INSERT INTO match_players (match_id, player_id, name, team, bot, kills, deaths, team_kills, damage, rating_delta, left_early,
           throws, throw_hits, laser_shots, laser_hits, gun_shots, gun_hits, headshots, play_sec, place)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const weapon = this.db.prepare(
        `INSERT INTO weapon_kills (player_id, weapon, kills) VALUES (?, ?, ?)
         ON CONFLICT(player_id, weapon) DO UPDATE SET kills = kills + excluded.kills`,
      );

      for (const p of result.players) {
        const st = p.stats;
        if (st) {
          insStats.run(
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
            st.throws,
            st.throwHits,
            st.laserShots,
            st.laserHits,
            st.gunShots,
            st.gunHits,
            st.headshots,
            st.playSec,
            p.place ?? null,
          );
          if (p.accountId !== null && !p.bot)
            for (const [w, n] of Object.entries(st.weaponKills))
              if (n > 0) weapon.run(p.accountId, w, n);
          continue;
        }
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
      }
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
    const col = `r.${placementCol(ladder)}`;
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

  /**
   * Read-only: a player's line on the ranked versus screen (rating/versus.ts) — the standing,
   * the full rating (for the odds, never sent while hidden) and the last 5 ranked results on
   * this ladder, newest first.
   */
  versusLine(
    playerId: number,
    ladder: LadderId,
  ): { rating: Rating; standing: LadderStanding; form: FormResult[] } {
    const standing = this.standing(playerId, ladder);
    const rating = this.rating(playerId, ladder).rating;
    let form: FormResult[];
    if (ladder === 'race')
      form = (
        this.db
          .prepare(
            `SELECT rp.place AS place FROM race_players rp JOIN races r ON r.id = rp.race_id
             WHERE rp.player_id = ? AND r.ranked = 1 ORDER BY r.id DESC LIMIT 5`,
          )
          .all(playerId) as { place: number }[]
      ).map((r) => (r.place === 1 ? 'W' : 'L'));
    else
      form = (
        this.db
          .prepare(
            `SELECT m.winner AS winner, mp.team AS team, mp.left_early AS left
             FROM match_players mp JOIN matches m ON m.id = mp.match_id
             WHERE mp.player_id = ? AND m.ranked = 1 AND m.ladder = ? ORDER BY m.id DESC LIMIT 5`,
          )
          .all(playerId, ladder) as { winner: number | null; team: number; left: number }[]
      ).map((r) => (r.left ? 'L' : r.winner === null ? 'D' : r.winner === r.team ? 'W' : 'L'));
    return { rating, standing, form };
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
          `SELECT season, ladder, rating, placed FROM season_results
           WHERE player_id = ? ORDER BY season DESC, ladder DESC`,
        )
        .all(playerId) as { season: number; ladder: string; rating: number; placed: number }[]
    )
      .filter((r) => (LADDER_IDS as readonly string[]).includes(r.ladder))
      .map((r) => ({
        season: r.season,
        ladder: r.ladder as LadderId,
        rating: r.placed ? Math.round(r.rating) : null,
        rank: r.placed ? ladderRank(r.ladder as LadderId, r.rating) : null,
      }));
    const recent = (
      this.db
        .prepare(
          `SELECT m.id AS matchId, m.objective AS objective, m.map AS map,
                  m.mode AS mode, m.ranked AS ranked, m.ladder AS ladder, m.winner AS winner, mp.team AS team,
                  mp.rating_delta AS delta, mp.kills AS kills, mp.deaths AS deaths, m.created_at AS at,
                  mp.left_early AS left, mp.place AS place
           FROM match_players mp JOIN matches m ON m.id = mp.match_id
           WHERE mp.player_id = ? ORDER BY m.id DESC LIMIT 10`,
        )
        .all(playerId) as {
        matchId: number;
        objective: string | null;
        map: string;
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
      matchId: r.matchId,
      objective: r.objective,
      map: r.map,
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
      raceBests: this.raceBests(playerId),
      recentRaces: this.recentRaces(playerId),
      bannedUntil: this.bannedUntil(playerId),
      warnings: p.warnings,
    };
  }

  // ---------------- races ----------------

  /**
   * Store a finished race from an online race room (rules/race.ts). Every finish may set a
   * personal best (race_bests: only ever improved). Ranked races (the Race queue) also update
   * the Race ladder (rating/race.ts: pairwise Elo, placement races count double, leaving =
   * last + a penalty). `roster`: the accounts the queue put in the room — any of them missing
   * from the results left before the start, and counts as a leaver. Returns what to tell each
   * account (RaceRatingNotice).
   */
  recordRace(input: {
    ranked: boolean;
    record: RaceRecord;
    roster?: { accountId: number; name: string }[];
  }): Map<number, RaceRatingNotice> {
    const { record } = input;
    const t = this.now();
    const out = new Map<number, RaceRatingNotice>();
    const who = new Map(record.racers.map((r) => [r.id, r]));
    const lines: RaceLine[] = record.standings.map((s) => {
      const w = who.get(s.id);
      return {
        accountId: w?.bot ? null : (w?.accountId ?? null),
        name: w?.name ?? `Racer ${s.id}`,
        bot: !!w?.bot,
        place: s.place,
        timeMs: s.timeMs,
        splitsMs: s.splitsMs,
        dnf: s.dnf,
        left: s.left,
        respawns: s.respawns,
      };
    });
    // queued racers who never made it to the start: leavers, sharing the last place
    const maxPlace = Math.max(0, ...lines.map((l) => l.place));
    const last = lines.some((l) => l.dnf || l.left) ? maxPlace : maxPlace + 1;
    for (const r of input.roster ?? [])
      if (!lines.some((l) => l.accountId === r.accountId))
        lines.push({
          accountId: r.accountId,
          name: r.name,
          bot: false,
          place: last,
          timeMs: null,
          splitsMs: [],
          dnf: true,
          left: true,
          respawns: 0,
        });
    // one line per account (a racer who somehow appears twice counts once)
    const rated = lines.filter(
      (l, i) => l.accountId !== null && lines.findIndex((x) => x.accountId === l.accountId) === i,
    );
    const deltas = new Map<number, number>();
    this.db.exec('BEGIN');
    try {
      if (input.ranked && rated.length >= 2) {
        const stored = rated.map((l) => this.rating(l.accountId!, 'race'));
        const updates = updateRaceRatings(
          rated.map((l, i) => ({
            rating: stored[i].rating.rating,
            races: placementOf('race', stored[i]).done,
            place: l.place,
            left: l.left,
          })),
        );
        rated.forEach((l, i) => {
          const s = stored[i];
          const won = l.place === 1 && !l.dnf && !l.left ? 1 : 0;
          this.save(l.accountId!, 'race', {
            rating: { ...s.rating, rating: updates[i].rating },
            games: s.games + 1,
            wins: s.wins + won,
            seasonGames: s.seasonGames + 1,
            seasonWins: s.seasonWins + won,
            lastPlayed: t,
          });
          deltas.set(l.accountId!, updates[i].delta);
        });
      }
      const race = this.db
        .prepare(
          'INSERT INTO races (track, ranked, room, duration_sec, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(record.track, input.ranked ? 1 : 0, record.room, Math.round(record.durationSec), t);
      const raceId = Number(race.lastInsertRowid);
      const ins = this.db.prepare(
        `INSERT INTO race_players (race_id, player_id, name, bot, place, time_ms, dnf, left_early, respawns, rating_delta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const l of lines)
        ins.run(
          raceId,
          l.accountId,
          l.name,
          l.bot ? 1 : 0,
          l.place,
          l.timeMs,
          l.dnf ? 1 : 0,
          l.left ? 1 : 0,
          l.respawns,
          l.accountId !== null ? (deltas.get(l.accountId) ?? 0) : 0,
        );
      for (const l of rated) {
        const prev = this.raceBest(l.accountId!, record.track);
        const newBest = l.timeMs !== null && l.timeMs > 0 && (prev === null || l.timeMs < prev);
        if (newBest)
          this.db
            .prepare(
              `INSERT INTO race_bests (player_id, track, time_ms, splits, at) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(player_id, track) DO UPDATE SET time_ms = excluded.time_ms,
                 splits = excluded.splits, at = excluded.at`,
            )
            .run(l.accountId!, record.track, l.timeMs!, JSON.stringify(l.splitsMs), t);
        const st = this.standing(l.accountId!, 'race');
        const d = deltas.get(l.accountId!);
        out.set(l.accountId!, {
          race: record.race,
          track: record.track,
          delta: d === undefined ? null : d,
          rating: st.rating,
          placement: { done: st.placement.done, need: st.placement.need },
          timeMs: l.timeMs,
          newBest,
          bestMs: newBest ? l.timeMs : prev,
        });
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return out;
  }

  /** A player's best time on a track (ms), or null. */
  raceBest(playerId: number, track: string): number | null {
    const row = this.db
      .prepare('SELECT time_ms FROM race_bests WHERE player_id = ? AND track = ?')
      .get(playerId, track) as { time_ms: number } | undefined;
    return row?.time_ms ?? null;
  }

  /** A player's best on every race track, with their place on the track's board. */
  raceBests(playerId: number): Profile['raceBests'] {
    return raceMaps().map((m) => {
      const row = this.db
        .prepare('SELECT time_ms, at FROM race_bests WHERE player_id = ? AND track = ?')
        .get(playerId, m.id) as { time_ms: number; at: number } | undefined;
      if (!row) return { track: m.id, timeMs: null, position: null, at: 0 };
      const faster = (
        this.db
          .prepare(
            `SELECT COUNT(*) AS n FROM race_bests
             WHERE track = ? AND (time_ms < ? OR (time_ms = ? AND (at < ? OR (at = ? AND player_id < ?))))`,
          )
          .get(m.id, row.time_ms, row.time_ms, row.at, row.at, playerId) as { n: number }
      ).n;
      return { track: m.id, timeMs: row.time_ms, position: faster + 1, at: row.at };
    });
  }

  /** Fastest times on a track: one entry per player (their best), fastest first. */
  trackLeaderboard(
    track: string,
    limit = 50,
  ): { position: number; playerId: number; name: string; timeMs: number; at: number }[] {
    return (
      this.db
        .prepare(
          `SELECT b.player_id AS playerId, p.name AS name, b.time_ms AS timeMs, b.at AS at
           FROM race_bests b JOIN players p ON p.id = b.player_id
           WHERE b.track = ? ORDER BY b.time_ms ASC, b.at ASC, b.player_id ASC LIMIT ?`,
        )
        .all(track, limit) as { playerId: number; name: string; timeMs: number; at: number }[]
    ).map((r, i) => ({ position: i + 1, ...r }));
  }

  private recentRaces(playerId: number): Profile['recentRaces'] {
    return (
      this.db
        .prepare(
          `SELECT r.track AS track, r.ranked AS ranked, rp.place AS place, rp.time_ms AS timeMs,
                  rp.rating_delta AS delta, r.created_at AS at,
                  (SELECT COUNT(*) FROM race_players x WHERE x.race_id = r.id) AS racers
           FROM race_players rp JOIN races r ON r.id = rp.race_id
           WHERE rp.player_id = ? ORDER BY r.id DESC LIMIT 10`,
        )
        .all(playerId) as {
        track: string;
        ranked: number;
        place: number;
        timeMs: number | null;
        delta: number;
        at: number;
        racers: number;
      }[]
    ).map((r) => ({ ...r, ranked: !!r.ranked, delta: Math.round(r.delta) }));
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
        const placedCol = placementCol(ladder);
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
        for (const r of rows) upd.run(seasonResetRating(r.rating, def.startRating), r.id, ladder);
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

  /** Players online at which each ranked queue opens (0 = no player-count rule). */
  thresholds(): Record<RankedQueueId, number> {
    const out = { ...DEFAULT_THRESHOLDS };
    try {
      const v = JSON.parse(this.setting(THRESHOLDS_KEY) ?? 'null') as Record<string, unknown>;
      if (v && typeof v === 'object')
        for (const id of RANKED_QUEUE_IDS) {
          const n = Number(v[id]);
          if (Number.isInteger(n) && n >= 0 && n <= 10_000) out[id] = n;
        }
    } catch {
      /* fall back to the defaults */
    }
    return out;
  }

  /** Change some thresholds (the host dashboard). */
  setThresholds(patch: Partial<Record<RankedQueueId, number>>): void {
    const cur = this.thresholds();
    for (const id of RANKED_QUEUE_IDS) {
      const n = Number(patch[id]);
      if (patch[id] !== undefined && Number.isInteger(n) && n >= 0 && n <= 10_000) cur[id] = n;
    }
    this.setSetting(THRESHOLDS_KEY, JSON.stringify(cur));
  }

  /**
   * Is this ranked queue open with `online` players connected? Two rules can open a queue:
   * enough players online (its threshold; 0 = no such rule) and, for Premier and Premier CS,
   * the opening hours (when the host set some). With both rules set it is open when EITHER
   * holds (a crowd outside the hours, or the hours even with few players); with one rule, that
   * rule decides; with none, it is always open.
   */
  queueOpen(id: RankedQueueId, online: number): QueueOpenStatus {
    const threshold = this.thresholds()[id] ?? 0;
    const q = rankedQueue(id);
    const hoursRule = !!q && q.kind === 'team' && q.veto && this.schedule().mode === 'scheduled';
    const byHours = hoursRule ? this.premierStatus().open : null;
    const byCount = threshold > 0 ? online >= threshold : null;
    const open = byCount === null && byHours === null ? true : byCount === true || byHours === true;
    return { open, threshold, online, byHours };
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
