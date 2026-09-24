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
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Open (and migrate) the database. `file` = ':memory:' for tests. */
export const openDb = (file: string): Db => {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new (sqlite().DatabaseSync)(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 2000;');
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
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
  return db;
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
