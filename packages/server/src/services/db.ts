// SQLite storage (Node's built-in node:sqlite — no native modules to install). One file in
// data/, WAL mode, versioned migrations keyed by PRAGMA user_version.
import type { DatabaseSync } from 'node:sqlite';
import type * as SqliteModule from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export type Db = DatabaseSync;

/** Loaded on first use (so the entry point can quiet Node's "experimental" notice first). */
const sqlite = (): typeof SqliteModule =>
  process.getBuiltinModule('node:sqlite') as typeof SqliteModule;

/** Hide Node's one-time "SQLite is an experimental feature" warning (it's stable enough). */
export const quietSqliteWarning = (): void => {
  const orig = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === 'string' ? warning : warning.message;
    if (/SQLite is an experimental feature/.test(text)) return;
    (orig as (w: string | Error, ...r: unknown[]) => void)(warning, ...rest);
  }) as typeof process.emitWarning;
};

/** Migration 3 moves old 5v5 ratings onto Premier's scale by this much. */
export const PREMIER_MIGRATION_SHIFT = -500;

const MIGRATIONS: string[] = [
  // 1: accounts, ratings, matches, reports, bans
  `
  CREATE TABLE players (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    warnings INTEGER NOT NULL DEFAULT 0,
    grief_kicks INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE ratings (
    player_id INTEGER NOT NULL REFERENCES players(id),
    mode TEXT NOT NULL,
    rating REAL NOT NULL,
    rd REAL NOT NULL,
    vol REAL NOT NULL,
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    last_played INTEGER NOT NULL,
    PRIMARY KEY (player_id, mode)
  );
  CREATE INDEX ratings_mode_rating ON ratings(mode, rating DESC);
  CREATE TABLE matches (
    id INTEGER PRIMARY KEY,
    mode TEXT NOT NULL,
    ranked INTEGER NOT NULL,
    map TEXT NOT NULL,
    winner INTEGER,
    score_a INTEGER NOT NULL,
    score_b INTEGER NOT NULL,
    reason TEXT NOT NULL,
    duration_sec INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE match_players (
    match_id INTEGER NOT NULL REFERENCES matches(id),
    player_id INTEGER REFERENCES players(id),
    name TEXT NOT NULL,
    team INTEGER NOT NULL,
    bot INTEGER NOT NULL,
    kills INTEGER NOT NULL,
    deaths INTEGER NOT NULL,
    team_kills INTEGER NOT NULL,
    damage INTEGER NOT NULL,
    rating_delta REAL NOT NULL DEFAULT 0,
    left_early INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX match_players_player ON match_players(player_id);
  CREATE TABLE reports (
    id INTEGER PRIMARY KEY,
    reporter_id INTEGER,
    reported_id INTEGER,
    reported_name TEXT NOT NULL,
    reason TEXT NOT NULL,
    room TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    handled INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE bans (
    id INTEGER PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id),
    until INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX bans_player ON bans(player_id, until);
  `,
  // 2: Arena 1v1 results per player (final place, duels won / lost); null for other modes
  `
  ALTER TABLE match_players ADD COLUMN place INTEGER;
  ALTER TABLE match_players ADD COLUMN duel_wins INTEGER;
  ALTER TABLE match_players ADD COLUMN duel_losses INTEGER;
  `,
  // 3: ranked = Premier + Duels (rating/ladders.ts). The old ladders' rows ('1v1', '2v2', '5v5',
  // 'arena') stay in `ratings` untouched but are no longer read.
  // - Premier starts from the old 5v5 rating, moved from the old scale (a new player was 1500)
  //   to Premier's (a new player is 1000): old - 500. Placement starts over (5 wins).
  // - Duels starts from the better of the old 1v1 / 2v2 ratings (same scale), with the games
  //   and wins of both.
  // - Seasons (Premier): season 1 starts now; season_results archives each finished season.
  // - settings: small server settings (Premier opening hours).
  `
  ALTER TABLE ratings ADD COLUMN season_wins INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE ratings ADD COLUMN season_games INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE matches ADD COLUMN ladder TEXT;
  CREATE TABLE seasons (
    number INTEGER PRIMARY KEY,
    started_at INTEGER NOT NULL
  );
  INSERT INTO seasons (number, started_at) VALUES (1, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
  CREATE TABLE season_results (
    season INTEGER NOT NULL,
    player_id INTEGER NOT NULL REFERENCES players(id),
    ladder TEXT NOT NULL,
    rating REAL NOT NULL,
    games INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    placed INTEGER NOT NULL,
    PRIMARY KEY (season, player_id, ladder)
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  INSERT INTO ratings (player_id, mode, rating, rd, vol, games, wins, last_played)
    SELECT player_id, 'premier', rating + (${PREMIER_MIGRATION_SHIFT}), rd, vol, games, wins, last_played
    FROM ratings WHERE mode = '5v5';
  INSERT INTO ratings (player_id, mode, rating, rd, vol, games, wins, last_played)
    SELECT r.player_id, 'duels', r.rating, r.rd, r.vol,
      (SELECT SUM(x.games) FROM ratings x WHERE x.player_id = r.player_id AND x.mode IN ('1v1', '2v2')),
      (SELECT SUM(x.wins) FROM ratings x WHERE x.player_id = r.player_id AND x.mode IN ('1v1', '2v2')),
      (SELECT MAX(x.last_played) FROM ratings x WHERE x.player_id = r.player_id AND x.mode IN ('1v1', '2v2'))
    FROM ratings r
    WHERE r.mode IN ('1v1', '2v2') AND NOT EXISTS (
      SELECT 1 FROM ratings b WHERE b.player_id = r.player_id AND b.mode IN ('1v1', '2v2')
        AND (b.rating > r.rating OR (b.rating = r.rating AND b.mode < r.mode))
    );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Open (and migrate) the database. `file` = ':memory:' for tests. */
export const openDb = (file: string): Db => {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new (sqlite().DatabaseSync)(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 2000;');
  migrate(db);
  return db;
};

/** Run the migrations the database hasn't had yet, up to version `upTo` (tests stop early). */
export const migrate = (db: Db, upTo = MIGRATIONS.length): void => {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = row.user_version; v < Math.min(upTo, MIGRATIONS.length); v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
};

/** Daily backup: copy the live database into data/backups/ (keeps the last 7). */
export const backupDb = async (db: Db, dir: string, now = new Date()): Promise<string> => {
  const { backup } = sqlite();
  const { readdirSync, rmSync } = await import('node:fs');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `spaceyz-${now.toISOString().slice(0, 10)}.db`);
  await backup(db, file);
  const old = readdirSync(dir)
    .filter((f) => /^spaceyz-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .slice(0, -7);
  for (const f of old) rmSync(path.join(dir, f), { force: true });
  return file;
};
