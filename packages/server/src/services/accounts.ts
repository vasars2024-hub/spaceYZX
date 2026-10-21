// Accounts. Everyone starts as a guest: a nickname and a random secret token that stays in the
// browser (the server stores only a SHA-256 hash of it, one `sessions` row per device). A guest
// can secure the account with a username + password (all progress stays: it is the same
// account) and then log in on any device. Sessions are the tokens: logging in, changing the
// password or recovering the account gives this device a new token, and "log out everywhere"
// deletes them all.
//
// Passwords: scrypt with a per-user salt (passwords.ts), checked off the game loop, constant-time
// compare, never logged, never sent back, never stored in plain text. Failed logins are limited
// per address and per username (limiter.ts) and never say whether the username exists.
// Recovery (no e-mail yet): a one-time recovery code shown when the account is secured; code +
// username set a new password (and a new code).
import { createHash, randomBytes } from 'node:crypto';
import type { MeInfo, PlayerCard } from '@space-yz/shared';
import {
  NAME_CHANGE_COOLDOWN_MS,
  checkUsername,
  cleanTitle,
  passwordProblem,
  sanitizeName,
  usernameKey,
  validAvatar,
  validBanner,
} from '@space-yz/shared';
import type { Db } from './db';
import {
  DEFAULT_COST,
  dummyHash,
  hashPassword,
  hashRecoveryCode,
  newRecoveryCode,
  sameHash,
  verifyPassword,
  type ScryptCost,
} from './passwords';
import { LOGIN_LIMIT, Limiter, waitText } from './limiter';

export interface Account {
  id: number;
  name: string;
  createdAt: number;
  secured: boolean;
}

export const hashToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export const newToken = (): string => `syz_${randomBytes(24).toString('base64url')}`;

const TOKEN_RE = /^syz_[A-Za-z0-9_-]{20,64}$/;
/** Devices one account may stay logged in on (the oldest session goes first). */
export const MAX_SESSIONS = 20;
const WRONG_LOGIN = 'Wrong username or password.';

interface PlayerRow {
  id: number;
  name: string;
  created_at: number;
  username_key: string | null;
  pass_hash: string | null;
  recovery_hash: string | null;
  name_changed_at: number | null;
  avatar: number;
  banner: number;
  title: string;
  admin: number;
}

const COLS =
  'id, name, created_at, username_key, pass_hash, recovery_hash, name_changed_at, avatar, banner, title, admin';

export type AuthResult =
  | { ok: true; account: Account; token: string; recoveryCode?: string }
  | { ok: false; error: string };

export class Accounts {
  private cost: ScryptCost;
  /** failed logins / recoveries: per address and per username */
  readonly loginLimit: Limiter;
  /** sign-ups (securing a guest account) per address */
  readonly signupLimit: Limiter;

  constructor(
    private db: Db,
    private now: () => number = Date.now,
    opts: { cost?: ScryptCost } = {},
  ) {
    this.cost = opts.cost ?? DEFAULT_COST;
    this.loginLimit = new Limiter(LOGIN_LIMIT, now);
    this.signupLimit = new Limiter(
      { max: 5, windowMs: 3600_000, lockMs: 3600_000, maxLockMs: 6 * 3600_000 },
      now,
    );
  }

  private row(id: number): PlayerRow | undefined {
    return this.db.prepare(`SELECT ${COLS} FROM players WHERE id = ?`).get(id) as
      PlayerRow | undefined;
  }

  private rowByUsername(username: string): PlayerRow | undefined {
    return this.db
      .prepare(`SELECT ${COLS} FROM players WHERE username_key = ?`)
      .get(usernameKey(username)) as PlayerRow | undefined;
  }

  private toAccount(r: PlayerRow): Account {
    return { id: r.id, name: r.name, createdAt: r.created_at, secured: r.pass_hash !== null };
  }

  // ---------------- sessions ----------------

  /** A new session (token) for this account; the token itself is only returned, never stored. */
  newSession(playerId: number): string {
    const token = newToken();
    const t = this.now();
    this.db
      .prepare(
        'INSERT INTO sessions (token_hash, player_id, created_at, last_seen) VALUES (?, ?, ?, ?)',
      )
      .run(hashToken(token), playerId, t, t);
    this.db
      .prepare(
        `DELETE FROM sessions WHERE player_id = ? AND token_hash NOT IN (
           SELECT token_hash FROM sessions WHERE player_id = ? ORDER BY last_seen DESC, created_at DESC LIMIT ?)`,
      )
      .run(playerId, playerId, MAX_SESSIONS);
    return token;
  }

  /** End one session (log out this device). */
  revokeSession(token: string): void {
    if (TOKEN_RE.test(token))
      this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }

  /** End every session of an account ("log out everywhere"). */
  revokeAll(playerId: number): void {
    this.db.prepare('DELETE FROM sessions WHERE player_id = ?').run(playerId);
  }

  sessionCount(playerId: number): number {
    return (
      this.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE player_id = ?').get(playerId) as {
        n: number;
      }
    ).n;
  }

  /** The account a token belongs to (null: unknown / revoked / malformed). */
  byToken(token: string | undefined): PlayerRow | null {
    if (!token || !TOKEN_RE.test(token)) return null;
    const s = this.db
      .prepare('SELECT player_id FROM sessions WHERE token_hash = ?')
      .get(hashToken(token)) as { player_id: number } | undefined;
    return s ? (this.row(s.player_id) ?? null) : null;
  }

  // ---------------- guests (hello) ----------------

  /** Is this nickname some secured account's username (other than `self`)? */
  private nameTaken(name: string, self: number | null): boolean {
    const r = this.db
      .prepare('SELECT id FROM players WHERE username_key = ?')
      .get(usernameKey(name)) as { id: number } | undefined;
    return !!r && r.id !== self;
  }

  /** A guest's nickname: nobody may pose as a secured account. */
  private guestName(name: string, id: number | null): string {
    const clean = sanitizeName(name);
    return this.nameTaken(clean, id) ? `Pilot${1000 + ((id ?? 0) % 9000)}` : clean;
  }

  /**
   * Log in with a token (existing account) or create a new guest account. An unknown or
   * malformed token creates a fresh account rather than failing, so a lost token never locks
   * anyone out of playing. A secured account keeps its username as its name (the hello's
   * nickname only renames guests).
   */
  login(name: string, token?: string): { account: Account; token: string; created: boolean } {
    const t = this.now();
    const row = this.byToken(token);
    if (row && token) {
      const secured = row.pass_hash !== null;
      const newName = secured ? row.name : this.guestName(name, row.id);
      this.db
        .prepare('UPDATE players SET name = ?, last_seen = ? WHERE id = ?')
        .run(newName, t, row.id);
      this.db
        .prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?')
        .run(t, hashToken(token));
      return {
        account: { id: row.id, name: newName, createdAt: row.created_at, secured },
        token,
        created: false,
      };
    }
    const wanted = sanitizeName(name);
    const res = this.db
      .prepare('INSERT INTO players (name, token_hash, created_at, last_seen) VALUES (?, ?, ?, ?)')
      .run(wanted, `none:${randomBytes(12).toString('hex')}`, t, t);
    const id = Number(res.lastInsertRowid);
    const clean = this.guestName(wanted, id);
    if (clean !== wanted)
      this.db.prepare('UPDATE players SET name = ? WHERE id = ?').run(clean, id);
    return {
      account: { id, name: clean, createdAt: t, secured: false },
      token: this.newSession(id),
      created: true,
    };
  }

  byId(id: number): Account | null {
    const r = this.row(id);
    return r ? this.toAccount(r) : null;
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM players').get() as { n: number }).n;
  }

  /** Your own account as the client sees it. */
  me(id: number): MeInfo | null {
    const r = this.row(id);
    if (!r) return null;
    const secured = r.pass_hash !== null;
    const next = r.name_changed_at === null ? 0 : r.name_changed_at + NAME_CHANGE_COOLDOWN_MS;
    return {
      id: r.id,
      name: r.name,
      secured,
      avatar: r.avatar,
      banner: r.banner,
      title: r.title,
      createdAt: r.created_at,
      nameChangeAt: secured && next > this.now() ? next : null,
      ...(r.admin ? { admin: true } : {}),
    };
  }

  // ---------------- admins (host dashboard) ----------------

  /** May this account publish official edits of the built-in maps? */
  isAdmin(id: number | null): boolean {
    return id !== null && !!this.row(id)?.admin;
  }

  /**
   * Make a secured account an admin (or not). Guests can't be: anyone holding a guest's browser
   * token would be one.
   */
  setAdmin(id: number, on: boolean): { ok: true } | { ok: false; error: string } {
    const r = this.row(id);
    if (!r) return { ok: false, error: 'No such account.' };
    if (on && r.pass_hash === null)
      return { ok: false, error: 'Only a secured account (username + password) can be an admin.' };
    this.db.prepare('UPDATE players SET admin = ? WHERE id = ?').run(on ? 1 : 0, id);
    return { ok: true };
  }

  /**
   * Accounts for the host dashboard: the admins first, then secured accounts matching `q`
   * (name, or all of them when empty), most recently seen first.
   */
  listForHost(
    q = '',
    limit = 50,
  ): { id: number; name: string; secured: boolean; admin: boolean; lastSeen: number }[] {
    const like = q
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N} _\-.]/gu, '')
      .trim()
      .slice(0, 16)
      .replace(/[%_\\]/g, (c) => `\\${c}`);
    const rows = this.db
      .prepare(
        `SELECT id, name, pass_hash IS NOT NULL AS secured, admin, last_seen FROM players
         WHERE admin = 1 OR (pass_hash IS NOT NULL AND name LIKE ? ESCAPE '\\')
         ORDER BY admin DESC, last_seen DESC LIMIT ?`,
      )
      .all(`%${like}%`, Math.max(1, Math.min(200, limit))) as {
      id: number;
      name: string;
      secured: number;
      admin: number;
      last_seen: number;
    }[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      secured: !!r.secured,
      admin: !!r.admin,
      lastSeen: r.last_seen,
    }));
  }

  /** Name + looks for lists (friends, requests, search). */
  cards(ids: number[]): Map<number, PlayerCard> {
    const out = new Map<number, PlayerCard>();
    const stmt = this.db.prepare(
      'SELECT id, name, avatar, banner, pass_hash IS NOT NULL AS secured FROM players WHERE id = ?',
    );
    for (const id of new Set(ids)) {
      const r = stmt.get(id) as
        { id: number; name: string; avatar: number; banner: number; secured: number } | undefined;
      if (r)
        out.set(id, {
          id: r.id,
          name: r.name,
          avatar: r.avatar,
          banner: r.banner,
          secured: !!r.secured,
        });
    }
    return out;
  }

  /** Players whose name starts with (then contains) `q`, secured accounts first. */
  search(q: string, limit = 20): PlayerCard[] {
    const clean = q
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N} _\-.]/gu, '')
      .trim()
      .slice(0, 16);
    if (clean.length < 2) return [];
    const like = clean.replace(/[%_\\]/g, (c) => `\\${c}`);
    const rows = this.db
      .prepare(
        `SELECT id FROM players
         WHERE name LIKE ? ESCAPE '\\'
         ORDER BY (name LIKE ? ESCAPE '\\') DESC, (pass_hash IS NOT NULL) DESC, last_seen DESC
         LIMIT ?`,
      )
      .all(`%${like}%`, `${like}%`, Math.max(1, Math.min(50, limit))) as { id: number }[];
    const cards = this.cards(rows.map((r) => r.id));
    return rows.flatMap((r) => (cards.has(r.id) ? [cards.get(r.id)!] : []));
  }

  /** The account id of a secured account's username (exact, ignoring case), or null. */
  idByUsername(name: string): number | null {
    return this.rowByUsername(name)?.id ?? null;
  }

  // ---------------- securing, logging in, passwords ----------------

  /**
   * Secure a guest account: username + password. Everything the guest played stays (same
   * account id). Returns a new token for this device (older ones are logged out) and the
   * recovery code to show once.
   */
  async register(
    playerId: number,
    username: unknown,
    password: unknown,
    ip: string,
  ): Promise<AuthResult> {
    const r = this.row(playerId);
    if (!r) return { ok: false, error: 'No account.' };
    if (r.pass_hash !== null) return { ok: false, error: 'This account is already secured.' };
    const u = checkUsername(username);
    if (!u.ok) return u;
    const pw = passwordProblem(password);
    if (pw) return { ok: false, error: pw };
    const wait = this.signupLimit.lockedFor(`ip:${ip}`);
    if (wait) return { ok: false, error: `Too many new accounts from here. ${waitText(wait)}` };
    if (this.rowByUsername(u.name)) return { ok: false, error: 'That username is taken.' };
    const hash = await hashPassword(password as string, this.cost);
    const code = newRecoveryCode();
    try {
      const res = this.db
        .prepare(
          `UPDATE players SET name = ?, username_key = ?, pass_hash = ?, recovery_hash = ?, secured_at = ?
           WHERE id = ? AND pass_hash IS NULL`,
        )
        .run(u.name, u.key, hash, hashRecoveryCode(code), this.now(), playerId);
      if (Number(res.changes) !== 1)
        return { ok: false, error: 'This account is already secured.' };
    } catch {
      // the unique index: someone took the name while we were hashing
      return { ok: false, error: 'That username is taken.' };
    }
    this.signupLimit.hit(`ip:${ip}`);
    this.revokeAll(playerId);
    const token = this.newSession(playerId);
    return { ok: true, account: this.byId(playerId)!, token, recoveryCode: code };
  }

  /** Is a login from this address / for this username locked right now? (ms, 0 = no) */
  private loginLocked(ip: string, username: string): number {
    return Math.max(
      this.loginLimit.lockedFor(`ip:${ip}`),
      this.loginLimit.lockedFor(`user:${usernameKey(username)}`),
    );
  }

  private loginFailed(ip: string, username: string): void {
    this.loginLimit.hit(`ip:${ip}`);
    this.loginLimit.hit(`user:${usernameKey(username)}`);
  }

  /**
   * Log in with username + password: a new session for this device. A failure never says
   * whether the username exists (same message, same work).
   */
  async passwordLogin(username: unknown, password: unknown, ip: string): Promise<AuthResult> {
    if (typeof username !== 'string' || typeof password !== 'string' || password.length > 1024)
      return { ok: false, error: WRONG_LOGIN };
    const locked = this.loginLocked(ip, username);
    if (locked) return { ok: false, error: `Too many attempts. ${waitText(locked)}` };
    const r = username.length <= 64 ? this.rowByUsername(username) : undefined;
    const good = await verifyPassword(password, r?.pass_hash ?? (await dummyHash(this.cost)));
    if (!r || !r.pass_hash || !good) {
      this.loginFailed(ip, username);
      return { ok: false, error: WRONG_LOGIN };
    }
    this.loginLimit.clear(`user:${usernameKey(username)}`);
    this.loginLimit.clear(`ip:${ip}`);
    this.db.prepare('UPDATE players SET last_seen = ? WHERE id = ?').run(this.now(), r.id);
    return { ok: true, account: this.toAccount(r), token: this.newSession(r.id) };
  }

  /** Check the password of a logged-in account (password change, new recovery code). */
  private async checkOwnPassword(
    r: PlayerRow,
    password: unknown,
    ip: string,
  ): Promise<string | null> {
    if (!r.pass_hash) return 'Secure your account first.';
    const locked = this.loginLocked(ip, r.name);
    if (locked) return `Too many attempts. ${waitText(locked)}`;
    if (
      typeof password !== 'string' ||
      password.length > 1024 ||
      !(await verifyPassword(password, r.pass_hash))
    ) {
      this.loginFailed(ip, r.name);
      return 'Wrong password.';
    }
    return null;
  }

  /** Change the password (needs the old one). Every device is logged out; this one gets a new token. */
  async changePassword(
    playerId: number,
    oldPassword: unknown,
    newPassword: unknown,
    ip: string,
  ): Promise<AuthResult> {
    const r = this.row(playerId);
    if (!r) return { ok: false, error: 'No account.' };
    const pw = passwordProblem(newPassword);
    if (pw) return { ok: false, error: pw };
    const bad = await this.checkOwnPassword(r, oldPassword, ip);
    if (bad) return { ok: false, error: bad };
    const hash = await hashPassword(newPassword as string, this.cost);
    this.db.prepare('UPDATE players SET pass_hash = ? WHERE id = ?').run(hash, playerId);
    this.revokeAll(playerId);
    return { ok: true, account: this.toAccount(r), token: this.newSession(playerId) };
  }

  /** A new recovery code (the old one stops working); needs the password. */
  async renewRecoveryCode(playerId: number, password: unknown, ip: string): Promise<AuthResult> {
    const r = this.row(playerId);
    if (!r) return { ok: false, error: 'No account.' };
    const bad = await this.checkOwnPassword(r, password, ip);
    if (bad) return { ok: false, error: bad };
    const code = newRecoveryCode();
    this.db
      .prepare('UPDATE players SET recovery_hash = ? WHERE id = ?')
      .run(hashRecoveryCode(code), playerId);
    return { ok: true, account: this.toAccount(r), token: '', recoveryCode: code };
  }

  /**
   * Forgot the password: username + recovery code set a new password. The code works once (a
   * new one is returned to show), every device is logged out and this one is logged in.
   */
  async recover(
    username: unknown,
    code: unknown,
    newPassword: unknown,
    ip: string,
  ): Promise<AuthResult> {
    const pw = passwordProblem(newPassword);
    if (pw) return { ok: false, error: pw };
    if (typeof username !== 'string' || typeof code !== 'string' || code.length > 64)
      return { ok: false, error: 'Wrong username or recovery code.' };
    const locked = this.loginLocked(ip, username);
    if (locked) return { ok: false, error: `Too many attempts. ${waitText(locked)}` };
    const r = username.length <= 64 ? this.rowByUsername(username) : undefined;
    const given = hashRecoveryCode(code);
    if (!r?.recovery_hash || !r.pass_hash || !sameHash(given, r.recovery_hash)) {
      this.loginFailed(ip, username);
      return { ok: false, error: 'Wrong username or recovery code.' };
    }
    const hash = await hashPassword(newPassword as string, this.cost);
    const fresh = newRecoveryCode();
    // only if the code is still the one we checked (two resets at once: one wins)
    const res = this.db
      .prepare(
        'UPDATE players SET pass_hash = ?, recovery_hash = ? WHERE id = ? AND recovery_hash = ?',
      )
      .run(hash, hashRecoveryCode(fresh), r.id, r.recovery_hash);
    if (Number(res.changes) !== 1) return { ok: false, error: 'Wrong username or recovery code.' };
    this.loginLimit.clear(`user:${usernameKey(username)}`);
    this.revokeAll(r.id);
    return {
      ok: true,
      account: this.toAccount(r),
      token: this.newSession(r.id),
      recoveryCode: fresh,
    };
  }

  // ---------------- profile ----------------

  /**
   * Edit your profile. `name`: a secured account's display name is its username (unique,
   * changes once per 7 days; a different capitalisation is free); a guest's is a nickname.
   */
  editProfile(
    playerId: number,
    patch: { name?: unknown; avatar?: unknown; banner?: unknown; title?: unknown },
  ): { ok: true } | { ok: false; error: string } {
    const r = this.row(playerId);
    if (!r) return { ok: false, error: 'No account.' };
    const sets: string[] = [];
    const vals: (string | number | null)[] = [];
    if (patch.avatar !== undefined) {
      if (!validAvatar(patch.avatar)) return { ok: false, error: 'Unknown avatar.' };
      sets.push('avatar = ?');
      vals.push(patch.avatar);
    }
    if (patch.banner !== undefined) {
      if (!validBanner(patch.banner)) return { ok: false, error: 'Unknown banner colour.' };
      sets.push('banner = ?');
      vals.push(patch.banner);
    }
    if (patch.title !== undefined) {
      const t = cleanTitle(patch.title);
      if (t === null) return { ok: false, error: 'That title is not allowed (32 characters max).' };
      sets.push('title = ?');
      vals.push(t);
    }
    if (patch.name !== undefined && patch.name !== r.name) {
      if (r.pass_hash !== null) {
        const u = checkUsername(patch.name);
        if (!u.ok) return u;
        if (u.key !== r.username_key) {
          const next = (r.name_changed_at ?? -Infinity) + NAME_CHANGE_COOLDOWN_MS;
          if (next > this.now())
            return {
              ok: false,
              error: `You can change your name again on ${new Date(next).toISOString().slice(0, 10)}.`,
            };
          if (this.rowByUsername(u.name)) return { ok: false, error: 'That username is taken.' };
          sets.push('username_key = ?', 'name_changed_at = ?');
          vals.push(u.key, this.now());
        }
        sets.push('name = ?');
        vals.push(u.name);
      } else {
        sets.push('name = ?');
        vals.push(this.guestName(String(patch.name), playerId));
      }
    }
    if (!sets.length) return { ok: true };
    try {
      this.db.prepare(`UPDATE players SET ${sets.join(', ')} WHERE id = ?`).run(...vals, playerId);
    } catch {
      return { ok: false, error: 'That username is taken.' };
    }
    return { ok: true };
  }
}
