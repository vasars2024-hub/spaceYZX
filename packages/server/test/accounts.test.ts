// Accounts: password hashing, usernames, securing a guest (progress kept), logging in on other
// devices (sessions / token rotation, log out everywhere), login limits, recovery codes and
// profile edits.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checkUsername,
  cleanTitle,
  isOffensive,
  NAME_CHANGE_COOLDOWN_MS,
  passwordProblem,
  usernameKey,
} from '@space-yz/shared';
import { createServices, type Services } from '../src/services';
import { hashToken } from '../src/services/accounts';
import {
  hashPassword,
  hashRecoveryCode,
  newRecoveryCode,
  normalizeRecoveryCode,
  verifyPassword,
} from '../src/services/passwords';
import { Limiter, LOGIN_LIMIT } from '../src/services/limiter';
import { migrate, SCHEMA_VERSION } from '../src/services/db';
import type { MatchResult } from '../src/game/rules/match';
import type * as SqliteModule from 'node:sqlite';

const CHEAP = { logN: 10, r: 8, p: 1 };

const match = (a: number, b: number, winner: 0 | 1): MatchResult => ({
  mode: '1v1',
  objective: 'tower',
  winner,
  reason: 'first to 5',
  scores: winner === 0 ? [5, 2] : [2, 5],
  rounds: 7,
  durationSec: 200,
  players: [
    { id: 1, accountId: a, team: 0, bot: false, kills: 4, deaths: 2, teamKills: 0, damage: 400 },
    { id: 2, accountId: b, team: 1, bot: false, kills: 2, deaths: 4, teamKills: 0, damage: 200 },
  ],
  leavers: [],
});

describe('password hashing (scrypt)', () => {
  it('hashes with a per-user salt and verifies (real cost)', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).toMatch(/^scrypt\$15\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b); // different salts
    expect(a).not.toContain('correct');
    expect(await verifyPassword('correct horse battery', a)).toBe(true);
    expect(await verifyPassword('correct horse batterY', a)).toBe(false);
    expect(await verifyPassword('', a)).toBe(false);
  });

  it('refuses malformed or absurd stored hashes', async () => {
    expect(await verifyPassword('x', 'plain')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$30$8$1$AAAA$AAAA')).toBe(false);
    const h = await hashPassword('password123', CHEAP);
    expect(await verifyPassword('password123', h.replace(/\$[^$]+$/, '$AAAA'))).toBe(false);
  });

  it('recovery codes: random, typed loosely, stored hashed', () => {
    const c = newRecoveryCode();
    expect(c).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);
    expect(newRecoveryCode()).not.toBe(c);
    expect(normalizeRecoveryCode(` ${c.toLowerCase()} `)).toBe(c.replace(/-/g, ''));
    expect(hashRecoveryCode(c.toLowerCase().replace(/-/g, ' '))).toBe(hashRecoveryCode(c));
  });
});

describe('username, password and title rules', () => {
  it('usernames: 3–16 nickname characters with a letter', () => {
    expect(checkUsername('Ace')).toMatchObject({ ok: true, name: 'Ace', key: 'ace' });
    expect(checkUsername('  Star   Pilot  ')).toMatchObject({ ok: true, name: 'Star Pilot' });
    expect(checkUsername('ab').ok).toBe(false);
    expect(checkUsername('a'.repeat(17)).ok).toBe(false);
    expect(checkUsername('bad<name>').ok).toBe(false);
    expect(checkUsername('12345').ok).toBe(false);
    expect(checkUsername(42).ok).toBe(false);
    expect(usernameKey('ÄCE Pilot')).toBe(usernameKey('äce pilot'));
  });

  it('reserved and offensive names are blocked', () => {
    for (const n of ['Admin', 'moderator', 'Bot 3', 'Pilot1234', 'Server', 'L3THAL RECOIL'])
      expect(checkUsername(n).ok, n).toBe(false);
    expect(checkUsername('lethalrecoil').ok).toBe(false);
    expect(checkUsername('Sh1tLord').ok).toBe(false);
    expect(isOffensive('f.u.c.k')).toBe(true);
    // ordinary names that merely contain letters of a filtered word stay allowed
    expect(checkUsername('Grapefruit').ok).toBe(true);
    expect(checkUsername('Peacock').ok).toBe(true);
  });

  it('passwords: 8+ characters, not trivially guessable', () => {
    expect(passwordProblem('short')).toBeTruthy();
    expect(passwordProblem('aaaaaaaaaa')).toBeTruthy();
    expect(passwordProblem('password')).toBeTruthy();
    expect(passwordProblem('x'.repeat(200))).toBeTruthy();
    expect(passwordProblem('blue-rocket-42')).toBeNull();
  });

  it('titles: short, cleaned, filtered', () => {
    expect(cleanTitle('  Sky   duelist ')).toBe('Sky duelist');
    expect(cleanTitle('')).toBe('');
    expect(cleanTitle('x'.repeat(33))).toBeNull();
    expect(cleanTitle('bitch please')).toBeNull();
    expect(cleanTitle(`a${String.fromCharCode(0x202e)}b`)).toBe('ab');
  });
});

describe('login limits', () => {
  it('locks after 5 failures in 5 minutes, then backs off', () => {
    let t = 0;
    const l = new Limiter(LOGIN_LIMIT, () => t);
    for (let i = 0; i < 4; i++) expect(l.hit('k')).toBe(0);
    expect(l.hit('k')).toBe(5 * 60_000);
    expect(l.lockedFor('k')).toBe(5 * 60_000);
    t += 5 * 60_000 + 1;
    expect(l.lockedFor('k')).toBe(0);
    for (let i = 0; i < 4; i++) l.hit('k');
    expect(l.hit('k')).toBe(10 * 60_000); // doubled
    expect(l.lockedFor('other')).toBe(0);
  });
});

describe('accounts', () => {
  let s: Services;
  let clock = 1_700_000_000_000;
  beforeAll(() => {
    s = createServices({ dbFile: ':memory:', log: () => {}, now: () => clock, scrypt: CHEAP });
  });
  afterAll(() => s.close());

  it('guests: a token per device, stored only as a hash', () => {
    const g = s.accounts.login('Guesty');
    expect(g.created).toBe(true);
    expect(g.account.secured).toBe(false);
    const rows = s.db.prepare('SELECT token_hash, player_id FROM sessions').all() as {
      token_hash: string;
      player_id: number;
    }[];
    expect(rows.some((r) => r.token_hash === hashToken(g.token))).toBe(true);
    expect(rows.some((r) => r.token_hash === g.token)).toBe(false);
    expect(s.accounts.login('Guesty 2', g.token).account.id).toBe(g.account.id);
  });

  it('securing a guest keeps its progress and rotates the token', async () => {
    const g = s.accounts.login('Rookie');
    const foe = s.accounts.login('Foe').account.id;
    const id = g.account.id;
    s.ranked.recordMatch({
      mode: '1v1',
      ranked: true,
      map: 'kestrel',
      result: match(id, foe, 0),
      names: {},
    });
    const before = s.ranked.profile(id)!;
    expect(before.ladders.duels.games).toBe(1);
    const r = await s.accounts.register(id, 'StarPilot', 'blue-rocket-42', '10.0.0.1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.account.id).toBe(id);
    expect(r.account.name).toBe('StarPilot');
    expect(r.recoveryCode).toMatch(/^[A-Z2-9-]{23}$/);
    expect(r.token).not.toBe(g.token);
    // the same account, every match still there
    const after = s.ranked.profile(id)!;
    expect(after.ladders.duels).toEqual(before.ladders.duels);
    expect(after.recent.length).toBe(1);
    // the old guest token no longer logs in (a fresh guest instead)
    const old = s.accounts.login('Rookie', g.token);
    expect(old.created).toBe(true);
    expect(old.account.id).not.toBe(id);
    // the new one does, and the hello's nickname can't rename a secured account
    const back = s.accounts.login('Renamed', r.token);
    expect(back.account.id).toBe(id);
    expect(back.account.name).toBe('StarPilot');
    // stored: a scrypt hash and a hashed recovery code, never the secrets
    const row = s.db
      .prepare('SELECT pass_hash, recovery_hash, username_key FROM players WHERE id = ?')
      .get(id) as { pass_hash: string; recovery_hash: string; username_key: string };
    expect(row.pass_hash.startsWith('scrypt$')).toBe(true);
    expect(row.pass_hash).not.toContain('blue-rocket');
    expect(row.recovery_hash).toBe(hashRecoveryCode(r.recoveryCode!));
    expect(row.username_key).toBe('starpilot');
    // secured twice: no
    expect((await s.accounts.register(id, 'Other', 'blue-rocket-42', '10.0.0.1')).ok).toBe(false);
  });

  it('usernames are unique ignoring case; guests cannot pose as them', async () => {
    const g = s.accounts.login('Copycat');
    const r = await s.accounts.register(g.account.id, 'STARPILOT', 'another-pass-1', '10.0.0.2');
    expect(r).toMatchObject({ ok: false, error: 'That username is taken.' });
    const bad = await s.accounts.register(g.account.id, 'Admin', 'another-pass-1', '10.0.0.2');
    expect(bad.ok).toBe(false);
    const imposter = s.accounts.login('starpilot');
    expect(imposter.account.name).toMatch(/^Pilot\d+$/);
  });

  it('log in on another device: a new session each time; log out everywhere ends them', async () => {
    const wrong = await s.accounts.passwordLogin('StarPilot', 'nope-nope-nope', '10.0.1.1');
    expect(wrong).toEqual({ ok: false, error: 'Wrong username or password.' });
    const ghost = await s.accounts.passwordLogin('NoSuchUser', 'nope-nope-nope', '10.0.1.1');
    expect(ghost).toEqual(wrong); // never says whether the username exists
    const a = await s.accounts.passwordLogin('starpilot', 'blue-rocket-42', '10.0.1.2');
    const b = await s.accounts.passwordLogin('StarPilot', 'blue-rocket-42', '10.0.1.3');
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.token).not.toBe(b.token);
    expect(s.accounts.login('x', a.token).account.id).toBe(a.account.id);
    expect(s.accounts.login('x', b.token).account.id).toBe(a.account.id);
    // one device logs out
    s.accounts.revokeSession(a.token);
    expect(s.accounts.byToken(a.token)).toBeNull();
    expect(s.accounts.byToken(b.token)?.id).toBe(a.account.id);
    // everywhere
    s.accounts.revokeAll(a.account.id);
    expect(s.accounts.byToken(b.token)).toBeNull();
    expect(s.accounts.sessionCount(a.account.id)).toBe(0);
  });

  it('failed logins lock the username and the address, even for the right password', async () => {
    const g = s.accounts.login('Locky');
    expect((await s.accounts.register(g.account.id, 'Locky', 'locky-pass-1', '10.0.2.1')).ok).toBe(
      true,
    );
    for (let i = 0; i < 5; i++)
      await s.accounts.passwordLogin('Locky', `wrong-${i}-pass`, `10.0.3.${i}`); // 5 addresses
    const r = await s.accounts.passwordLogin('Locky', 'locky-pass-1', '10.0.4.1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Too many attempts/);
    // one address guessing many names gets locked too
    for (let i = 0; i < 5; i++)
      await s.accounts.passwordLogin(`Someone${i}`, 'whatever-pw', '10.0.5.5');
    const r2 = await s.accounts.passwordLogin('StarPilot', 'blue-rocket-42', '10.0.5.5');
    expect(r2.ok).toBe(false);
    // after the lock time it works again
    clock += 6 * 60_000;
    expect((await s.accounts.passwordLogin('Locky', 'locky-pass-1', '10.0.4.1')).ok).toBe(true);
  });

  it('change password needs the old one and logs every device out', async () => {
    const a = await s.accounts.passwordLogin('StarPilot', 'blue-rocket-42', '10.0.6.1');
    if (!a.ok) throw new Error('login');
    const bad = await s.accounts.changePassword(
      a.account.id,
      'wrong-old-pw',
      'new-pass-777',
      '10.0.6.1',
    );
    expect(bad).toMatchObject({ ok: false, error: 'Wrong password.' });
    const weak = await s.accounts.changePassword(
      a.account.id,
      'blue-rocket-42',
      'short',
      '10.0.6.1',
    );
    expect(weak.ok).toBe(false);
    const ok = await s.accounts.changePassword(
      a.account.id,
      'blue-rocket-42',
      'new-pass-777',
      '10.0.6.1',
    );
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(s.accounts.byToken(a.token)).toBeNull(); // rotated
    expect(s.accounts.byToken(ok.token)?.id).toBe(a.account.id);
    expect((await s.accounts.passwordLogin('StarPilot', 'blue-rocket-42', '10.0.6.2')).ok).toBe(
      false,
    );
    expect((await s.accounts.passwordLogin('StarPilot', 'new-pass-777', '10.0.6.2')).ok).toBe(true);
  });

  it('a recovery code resets the password once', async () => {
    const g = s.accounts.login('Forgetful');
    const reg = await s.accounts.register(g.account.id, 'Forgetful', 'first-pass-1', '10.0.7.1');
    if (!reg.ok) throw new Error('register');
    const code = reg.recoveryCode!;
    const wrong = await s.accounts.recover(
      'Forgetful',
      'AAAAA-AAAAA-AAAAA-AAAAA',
      'second-pass-2',
      '10.0.7.2',
    );
    expect(wrong.ok).toBe(false);
    const r = await s.accounts.recover(
      'forgetful',
      code.toLowerCase(),
      'second-pass-2',
      '10.0.7.3',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.account.id).toBe(g.account.id);
    expect(r.recoveryCode).toBeTruthy();
    expect(r.recoveryCode).not.toBe(code);
    expect(s.accounts.byToken(reg.token)).toBeNull(); // everyone logged out
    expect((await s.accounts.passwordLogin('Forgetful', 'second-pass-2', '10.0.7.4')).ok).toBe(
      true,
    );
    // the same code again: refused
    const again = await s.accounts.recover('Forgetful', code, 'third-pass-3', '10.0.7.5');
    expect(again.ok).toBe(false);
    // the new code works
    const next = await s.accounts.recover('Forgetful', r.recoveryCode!, 'third-pass-3', '10.0.7.6');
    expect(next.ok).toBe(true);
  });

  it('profile edits are validated; name changes have a cooldown', async () => {
    const id = s.accounts.idByUsername('Forgetful')!;
    expect(s.accounts.editProfile(id, { avatar: 3, banner: 5, title: 'Sky duelist' })).toEqual({
      ok: true,
    });
    expect(s.accounts.me(id)).toMatchObject({ avatar: 3, banner: 5, title: 'Sky duelist' });
    expect(s.accounts.editProfile(id, { avatar: 16 }).ok).toBe(false);
    expect(s.accounts.editProfile(id, { avatar: 1.5 }).ok).toBe(false);
    expect(s.accounts.editProfile(id, { banner: -1 }).ok).toBe(false);
    expect(s.accounts.editProfile(id, { title: 'x'.repeat(40) }).ok).toBe(false);
    expect(s.accounts.editProfile(id, { title: 'total bitch' }).ok).toBe(false);
    // name: taken / reserved / fine, then the cooldown
    expect(s.accounts.editProfile(id, { name: 'starpilot' })).toMatchObject({ ok: false });
    expect(s.accounts.editProfile(id, { name: 'Moderator' })).toMatchObject({ ok: false });
    expect(s.accounts.editProfile(id, { name: 'Rememberer' })).toEqual({ ok: true });
    expect(s.accounts.me(id)).toMatchObject({ name: 'Rememberer', secured: true });
    expect(s.accounts.me(id)!.nameChangeAt).toBe(clock + NAME_CHANGE_COOLDOWN_MS);
    expect(s.accounts.idByUsername('rememberer')).toBe(id);
    expect(s.accounts.idByUsername('Forgetful')).toBeNull();
    // a different capitalisation is free, a new name waits 7 days
    expect(s.accounts.editProfile(id, { name: 'REMEMBERER' })).toEqual({ ok: true });
    const soon = s.accounts.editProfile(id, { name: 'Another' });
    expect(soon.ok).toBe(false);
    clock += NAME_CHANGE_COOLDOWN_MS + 1;
    expect(s.accounts.editProfile(id, { name: 'Another' })).toEqual({ ok: true });
    // login follows the username
    expect((await s.accounts.passwordLogin('another', 'third-pass-3', '10.0.8.1')).ok).toBe(true);
  });
});

describe('migration 5', () => {
  it('moves old login tokens into sessions', () => {
    // a database from before accounts, with an old-style player
    const raw = openDbAt4();
    raw
      .prepare(
        "INSERT INTO players (id, name, token_hash, created_at, last_seen) VALUES (7, 'Old', ?, 1, 2)",
      )
      .run(hashToken('syz_abcdefghijklmnopqrstuvwxyz0123'));
    migrate(raw);
    const s = raw
      .prepare('SELECT player_id FROM sessions WHERE token_hash = ?')
      .get(hashToken('syz_abcdefghijklmnopqrstuvwxyz0123')) as { player_id: number };
    expect(s.player_id).toBe(7);
    const p = raw.prepare('SELECT token_hash, avatar, title FROM players WHERE id = 7').get() as {
      token_hash: string;
      avatar: number;
      title: string;
    };
    expect(p).toEqual({ token_hash: 'moved:7', avatar: 0, title: '' });
    expect(SCHEMA_VERSION).toBe(8);
    raw.close();
  });
});

/** An in-memory database migrated only up to version 4 (before accounts). */
const openDbAt4 = () => {
  const sqlite = process.getBuiltinModule('node:sqlite') as typeof SqliteModule;
  const db = new sqlite.DatabaseSync(':memory:');
  migrate(db, 4);
  return db;
};
