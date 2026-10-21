// Public profiles: looks (avatar, banner, title), join date and lifetime stats built from the
// match / race history (no levels). Also the match detail (every player's line). Only public
// facts leave here: never tokens, password hashes, recovery codes or moderation data.
import type { PlayerCard } from '@space-yz/shared';
import type { Db } from './db';

/** Wins / games by mode family. */
export type ModeKey = 'tower' | 'bomb' | 'elim' | 'brawl' | 'arena' | 'race' | 'other';

export interface ProfileStats {
  matches: number;
  kills: number;
  deaths: number;
  /** kills / deaths (deaths 0: kills) */
  kd: number;
  damage: number;
  headshots: number;
  /** hit rates in % (null: never used) */
  boomerangAcc: number | null;
  laserAcc: number | null;
  gunAcc: number | null;
  favWeapon: { weapon: string; kills: number } | null;
  playtimeSec: number;
  byMode: Partial<Record<ModeKey, { games: number; wins: number }>>;
}

export interface ProfileCard extends PlayerCard {
  title: string;
  joined: number;
}

export interface MatchDetail {
  id: number;
  mode: string;
  objective: string | null;
  map: string;
  ranked: boolean;
  ladder: string | null;
  winner: number | null;
  scores: [number, number];
  reason: string;
  durationSec: number;
  at: number;
  players: {
    accountId: number | null;
    name: string;
    avatar: number | null;
    team: number;
    bot: boolean;
    kills: number;
    deaths: number;
    teamKills: number;
    damage: number;
    headshots: number | null;
    place: number | null;
    left: boolean;
    delta: number;
  }[];
}

const pct = (hits: number | null, shots: number | null): number | null =>
  shots ? Math.round((1000 * (hits ?? 0)) / shots) / 10 : null;

export class ProfileStore {
  constructor(private db: Db) {}

  card(id: number): ProfileCard | null {
    const r = this.db
      .prepare(
        `SELECT id, name, avatar, banner, title, created_at AS joined, pass_hash IS NOT NULL AS secured
         FROM players WHERE id = ?`,
      )
      .get(id) as
      | {
          id: number;
          name: string;
          avatar: number;
          banner: number;
          title: string;
          joined: number;
          secured: number;
        }
      | undefined;
    return r ? { ...r, secured: !!r.secured } : null;
  }

  stats(id: number): ProfileStats {
    const t = this.db
      .prepare(
        `SELECT COUNT(*) AS matches, SUM(mp.kills) AS kills, SUM(mp.deaths) AS deaths,
                SUM(mp.damage) AS damage, SUM(mp.headshots) AS headshots,
                SUM(mp.throws) AS throws, SUM(mp.throw_hits) AS throwHits,
                SUM(mp.laser_shots) AS laserShots, SUM(mp.laser_hits) AS laserHits,
                SUM(mp.gun_shots) AS gunShots, SUM(mp.gun_hits) AS gunHits,
                SUM(CASE WHEN mp.left_early = 1 THEN 0 ELSE COALESCE(mp.play_sec, m.duration_sec) END) AS playSec
         FROM match_players mp JOIN matches m ON m.id = mp.match_id
         WHERE mp.player_id = ?`,
      )
      .get(id) as Record<string, number | null>;
    const modes = this.db
      .prepare(
        `SELECT CASE
                  WHEN m.mode = 'arena' THEN 'arena'
                  WHEN m.mode LIKE 'brawl%' THEN 'brawl'
                  WHEN m.objective IN ('tower', 'bomb', 'elim', 'brawl') THEN m.objective
                  ELSE 'other' END AS kind,
                COUNT(*) AS games,
                SUM(CASE
                      WHEN mp.left_early = 1 THEN 0
                      WHEN mp.place IS NOT NULL THEN mp.place = 1
                      WHEN m.winner IS NULL THEN 0
                      ELSE m.winner = mp.team END) AS wins
         FROM match_players mp JOIN matches m ON m.id = mp.match_id
         WHERE mp.player_id = ? GROUP BY kind`,
      )
      .all(id) as { kind: ModeKey; games: number; wins: number }[];
    const race = this.db
      .prepare(
        `SELECT COUNT(*) AS games,
                SUM(rp.place = 1 AND rp.dnf = 0 AND rp.left_early = 0) AS wins,
                SUM(CASE WHEN rp.left_early = 1 THEN 0 ELSE r.duration_sec END) AS sec
         FROM race_players rp JOIN races r ON r.id = rp.race_id WHERE rp.player_id = ?`,
      )
      .get(id) as { games: number; wins: number | null; sec: number | null };
    const fav = this.db
      .prepare(
        'SELECT weapon, kills FROM weapon_kills WHERE player_id = ? ORDER BY kills DESC, weapon LIMIT 1',
      )
      .get(id) as { weapon: string; kills: number } | undefined;
    const byMode: ProfileStats['byMode'] = {};
    for (const m of modes) byMode[m.kind] = { games: m.games, wins: m.wins ?? 0 };
    if (race.games) byMode.race = { games: race.games, wins: race.wins ?? 0 };
    const kills = t.kills ?? 0;
    const deaths = t.deaths ?? 0;
    return {
      matches: (t.matches ?? 0) + race.games,
      kills,
      deaths,
      kd: Math.round((100 * kills) / Math.max(1, deaths)) / 100,
      damage: t.damage ?? 0,
      headshots: t.headshots ?? 0,
      boomerangAcc: pct(t.throwHits, t.throws),
      laserAcc: pct(t.laserHits, t.laserShots),
      gunAcc: pct(t.gunHits, t.gunShots),
      favWeapon: fav && fav.kills > 0 ? fav : null,
      playtimeSec: (t.playSec ?? 0) + (race.sec ?? 0),
      byMode,
    };
  }

  /** One recorded match with every player's line (bots and guests included). */
  match(id: number): MatchDetail | null {
    const m = this.db
      .prepare(
        `SELECT id, mode, objective, map, ranked, ladder, winner, score_a AS a, score_b AS b, reason,
                duration_sec AS durationSec, created_at AS at FROM matches WHERE id = ?`,
      )
      .get(id) as
      | {
          id: number;
          mode: string;
          objective: string | null;
          map: string;
          ranked: number;
          ladder: string | null;
          winner: number | null;
          a: number;
          b: number;
          reason: string;
          durationSec: number;
          at: number;
        }
      | undefined;
    if (!m) return null;
    const rows = this.db
      .prepare(
        `SELECT mp.player_id AS accountId, COALESCE(p.name, mp.name) AS name, p.avatar AS avatar,
                mp.name AS matchName, mp.team AS team, mp.bot AS bot, mp.kills AS kills,
                mp.deaths AS deaths, mp.team_kills AS teamKills, mp.damage AS damage,
                mp.headshots AS headshots, mp.place AS place, mp.left_early AS left,
                mp.rating_delta AS delta
         FROM match_players mp LEFT JOIN players p ON p.id = mp.player_id
         WHERE mp.match_id = ? ORDER BY mp.team, mp.place, mp.kills DESC`,
      )
      .all(id) as {
      accountId: number | null;
      name: string;
      avatar: number | null;
      matchName: string;
      team: number;
      bot: number;
      kills: number;
      deaths: number;
      teamKills: number;
      damage: number;
      headshots: number | null;
      place: number | null;
      left: number;
      delta: number;
    }[];
    return {
      id: m.id,
      mode: m.mode,
      objective: m.objective,
      map: m.map,
      ranked: !!m.ranked,
      ladder: m.ladder,
      winner: m.winner,
      scores: [m.a, m.b],
      reason: m.reason,
      durationSec: m.durationSec,
      at: m.at,
      players: rows.map((r) => ({
        accountId: r.bot ? null : r.accountId,
        // leavers were stored as 'left': show who it was
        name: r.left && r.matchName === 'left' ? r.name : r.bot ? r.matchName : r.name,
        avatar: r.bot ? null : r.avatar,
        team: r.team,
        bot: !!r.bot,
        kills: r.kills,
        deaths: r.deaths,
        teamKills: r.teamKills,
        damage: r.damage,
        headshots: r.headshots,
        place: r.place,
        left: !!r.left,
        delta: m.ranked ? Math.round(r.delta) : 0,
      })),
    };
  }
}
