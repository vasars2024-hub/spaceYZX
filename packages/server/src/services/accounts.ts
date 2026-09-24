// Accounts without passwords: a player picks a nickname and gets a random secret token that
// stays in their browser. The server stores only a SHA-256 hash of it. The token doubles as
// the "login code" for moving an account to another PC.
import { createHash, randomBytes } from 'node:crypto';
import { sanitizeName } from '@space-yz/shared';
import type { Db } from './db';

export interface Account {
  id: number;
  name: string;
  createdAt: number;
}

export const hashToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export const newToken = (): string => `syz_${randomBytes(24).toString('base64url')}`;

const TOKEN_RE = /^syz_[A-Za-z0-9_-]{20,64}$/;

export class Accounts {
  constructor(
    private db: Db,
    private now: () => number = Date.now,
  ) {}

  /**
   * Log in with a token (existing account) or create a new account. An unknown or malformed
   * token creates a fresh account rather than failing, so a lost token never locks anyone out
   * of playing.
   */
  login(name: string, token?: string): { account: Account; token: string; created: boolean } {
    const clean = sanitizeName(name);
    const t = this.now();
    if (token && TOKEN_RE.test(token)) {
      const row = this.db
        .prepare('SELECT id, name, created_at FROM players WHERE token_hash = ?')
        .get(hashToken(token)) as { id: number; name: string; created_at: number } | undefined;
      if (row) {
        this.db
          .prepare('UPDATE players SET name = ?, last_seen = ? WHERE id = ?')
          .run(clean, t, row.id);
        return {
          account: { id: row.id, name: clean, createdAt: row.created_at },
          token,
          created: false,
        };
      }
    }
    const fresh = newToken();
    const res = this.db
      .prepare('INSERT INTO players (name, token_hash, created_at, last_seen) VALUES (?, ?, ?, ?)')
      .run(clean, hashToken(fresh), t, t);
    return {
      account: { id: Number(res.lastInsertRowid), name: clean, createdAt: t },
      token: fresh,
      created: true,
    };
  }

  byId(id: number): Account | null {
    const row = this.db.prepare('SELECT id, name, created_at FROM players WHERE id = ?').get(id) as
      { id: number; name: string; created_at: number } | undefined;
    return row ? { id: row.id, name: row.name, createdAt: row.created_at } : null;
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM players').get() as { n: number }).n;
  }
}
