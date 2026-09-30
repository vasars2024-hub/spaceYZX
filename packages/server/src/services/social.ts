// Friends: requests (accept / decline / cancel), the friends list with where each friend is
// right now (menu, a room, a match, ranked) and room invites / joining a friend; blocking (a
// blocked player's requests, invites, chat and voice never reach you). Presence is checked
// every couple of seconds and only changed friends lists are sent.
import type {
  FriendOp,
  PlayerCard,
  Presence,
  ServerMsg,
  SocialNotice,
  SocialState,
} from '@space-yz/shared';
import { FRIENDS_MAX } from '@space-yz/shared';
import type { Db } from './db';
import type { Accounts } from './accounts';
import type { GameHub } from '../game/hub';
import type { Conn } from '../game/conn';
import type { Room } from '../game/room';
import { MatchRules } from '../game/rules/match';
import { Limiter } from './limiter';

/** Pending requests one player may have sent. */
export const MAX_OUTGOING = 100;
const PRESENCE_EVERY_MS = 2000;

type Result = { ok: true } | { ok: false; error: string };

export class Social {
  /** logged-in connections by account */
  readonly online = new Map<number, Set<Conn>>();
  /** online accounts' block lists (for chat / voice filtering) */
  private blockCache = new Map<number, Set<number>>();
  private lastPresence = new Map<number, string>();
  private timer: NodeJS.Timeout | null = null;
  /** friend requests: 20 per 10 minutes per account; invites: 10 per minute */
  readonly requestLimit: Limiter;
  readonly inviteLimit: Limiter;

  constructor(
    private db: Db,
    private accounts: Accounts,
    private hub: () => GameHub | null,
    private now: () => number = Date.now,
  ) {
    this.requestLimit = new Limiter(
      { max: 20, windowMs: 10 * 60_000, lockMs: 10 * 60_000, maxLockMs: 60 * 60_000 },
      now,
    );
    this.inviteLimit = new Limiter(
      { max: 10, windowMs: 60_000, lockMs: 60_000, maxLockMs: 10 * 60_000 },
      now,
    );
  }

  // ---------------- connections ----------------

  /** A connection is now logged in as conn.accountId. */
  connect(conn: Conn): void {
    const id = conn.accountId;
    if (id === null) return;
    let set = this.online.get(id);
    if (!set) this.online.set(id, (set = new Set()));
    set.add(conn);
    if (!this.blockCache.has(id)) this.blockCache.set(id, new Set(this.blockedIds(id)));
    this.start();
  }

  /** A connection logged out / switched account / closed. */
  disconnect(conn: Conn, id: number | null = conn.accountId): void {
    if (id === null) return;
    const set = this.online.get(id);
    if (!set) return;
    set.delete(conn);
    if (!set.size) {
      this.online.delete(id);
      this.blockCache.delete(id);
    }
  }

  private send(id: number, msg: ServerMsg): void {
    for (const c of this.online.get(id) ?? []) c.sendJson(msg);
  }

  /** Send a player their friends list now. */
  push(id: number): void {
    if (this.online.has(id)) this.send(id, { t: 'social', data: this.state(id) });
  }

  /** A player's name / looks changed: their online friends get fresh lists. */
  touch(id: number): void {
    for (const f of this.friendIds(id)) this.push(f);
    for (const f of this.requestPeers(id)) this.push(f);
  }

  private start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), PRESENCE_EVERY_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Presence changed for someone: send their online friends fresh lists (once each). */
  tick(): void {
    const dirty = new Set<number>();
    const ids = new Set([...this.lastPresence.keys(), ...this.online.keys()]);
    for (const id of ids) {
      const p = this.online.has(id) ? JSON.stringify(this.presence(id)) : '';
      if ((this.lastPresence.get(id) ?? '') === p) continue;
      if (p) this.lastPresence.set(id, p);
      else this.lastPresence.delete(id);
      for (const f of this.friendIds(id)) if (this.online.has(f)) dirty.add(f);
    }
    for (const id of dirty) this.push(id);
  }

  // ---------------- queries ----------------

  friendIds(id: number): number[] {
    return (
      this.db.prepare('SELECT friend_id AS f FROM friends WHERE player_id = ?').all(id) as {
        f: number;
      }[]
    ).map((r) => r.f);
  }

  private requestPeers(id: number): number[] {
    return (
      this.db
        .prepare(
          'SELECT to_id AS p FROM friend_requests WHERE from_id = ? UNION SELECT from_id FROM friend_requests WHERE to_id = ?',
        )
        .all(id, id) as { p: number }[]
    ).map((r) => r.p);
  }

  private blockedIds(id: number): number[] {
    return (
      this.db.prepare('SELECT blocked_id AS b FROM blocks WHERE player_id = ?').all(id) as {
        b: number;
      }[]
    ).map((r) => r.b);
  }

  areFriends(a: number, b: number): boolean {
    return !!this.db
      .prepare('SELECT 1 FROM friends WHERE player_id = ? AND friend_id = ?')
      .get(a, b);
  }

  /** Has `who` blocked `other`? */
  hasBlocked(who: number, other: number): boolean {
    const cached = this.blockCache.get(who);
    if (cached) return cached.has(other);
    return !!this.db
      .prepare('SELECT 1 FROM blocks WHERE player_id = ? AND blocked_id = ?')
      .get(who, other);
  }

  /** Should `to` not get chat / voice from `from`? */
  blocks(to: Conn, from: Conn): boolean {
    if (to.accountId === null || from.accountId === null) return false;
    return this.blockCache.get(to.accountId)?.has(from.accountId) ?? false;
  }

  private count(id: number): number {
    return (
      this.db.prepare('SELECT COUNT(*) AS n FROM friends WHERE player_id = ?').get(id) as {
        n: number;
      }
    ).n;
  }

  /** Where a player is right now. */
  presence(id: number): Presence {
    const conns = [...(this.online.get(id) ?? [])];
    if (!conns.length) {
      const r = this.db.prepare('SELECT last_seen FROM players WHERE id = ?').get(id) as
        { last_seen: number } | undefined;
      return { state: 'offline', lastSeen: r?.last_seen };
    }
    const hub = this.hub();
    const room = conns
      .map((c) => (c.roomCode ? hub?.rooms.get(c.roomCode) : undefined))
      .find((r): r is Room => !!r);
    if (!room) return { state: 'menu' };
    const rules = room.rules;
    const match = rules instanceof MatchRules ? rules : null;
    const base = {
      mode: room.mode,
      objective: match?.ms.objective,
      map: room.map,
      players: room.humans.length,
      maxPlayers: room.maxPlayers,
    };
    if (room.ranked) return { state: 'ranked', ...base, joinable: false };
    const inMatch = !!match && match.ms.phase !== 'warmup';
    return { state: inMatch ? 'match' : 'room', ...base, joinable: room.hasRoomForHuman() };
  }

  /** Your friends (online first), requests both ways and who you blocked. */
  state(id: number): SocialState {
    const friends = this.db
      .prepare(
        `SELECT p.id AS id, p.name AS name, p.avatar AS avatar, p.banner AS banner,
                p.pass_hash IS NOT NULL AS secured, f.since AS since
         FROM friends f JOIN players p ON p.id = f.friend_id WHERE f.player_id = ?`,
      )
      .all(id) as (Omit<PlayerCard, 'secured'> & { secured: number; since: number })[];
    const reqs = (sql: string) =>
      (
        this.db.prepare(sql).all(id) as (Omit<PlayerCard, 'secured'> & {
          secured: number;
          at: number;
        })[]
      ).map((r) => ({ ...r, secured: !!r.secured }));
    const cardCols =
      'p.id AS id, p.name AS name, p.avatar AS avatar, p.banner AS banner, p.pass_hash IS NOT NULL AS secured';
    const rank = (p: Presence) =>
      p.state === 'offline' ? 3 : p.state === 'menu' ? 1 : p.joinable ? 0 : 2;
    const list = friends
      .map((f) => ({ ...f, secured: !!f.secured, presence: this.presence(f.id) }))
      .sort(
        (a, b) =>
          rank(a.presence) - rank(b.presence) ||
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      );
    return {
      friends: list,
      incoming: reqs(
        `SELECT ${cardCols}, r.created_at AS at FROM friend_requests r JOIN players p ON p.id = r.from_id
         WHERE r.to_id = ? ORDER BY r.created_at DESC`,
      ),
      outgoing: reqs(
        `SELECT ${cardCols}, r.created_at AS at FROM friend_requests r JOIN players p ON p.id = r.to_id
         WHERE r.from_id = ? ORDER BY r.created_at DESC`,
      ),
      blocked: (
        this.db
          .prepare(
            `SELECT ${cardCols} FROM blocks b JOIN players p ON p.id = b.blocked_id WHERE b.player_id = ?`,
          )
          .all(id) as (Omit<PlayerCard, 'secured'> & { secured: number })[]
      ).map((r) => ({ ...r, secured: !!r.secured })),
      max: FRIENDS_MAX,
    };
  }

  // ---------------- friend operations ----------------

  notify(to: number, notice: SocialNotice): void {
    this.send(to, { t: 'socialNotice', data: notice });
  }

  /** Who a request is for: an account id, or an exact name (a username, else a unique name). */
  resolve(target: { id?: unknown; name?: unknown }): number | null {
    if (typeof target.id === 'number' && Number.isInteger(target.id))
      return this.accounts.byId(target.id) ? target.id : null;
    if (typeof target.name === 'string' && target.name.length <= 32) {
      const u = this.accounts.idByUsername(target.name);
      if (u !== null) return u;
      const rows = this.db
        .prepare('SELECT id FROM players WHERE name = ? LIMIT 2')
        .all(target.name.trim()) as { id: number }[];
      return rows.length === 1 ? rows[0].id : null;
    }
    return null;
  }

  /** Run one friend operation for account `me`. */
  op(me: number, op: FriendOp, target: { id?: unknown; name?: unknown }): Result {
    const other = this.resolve(target);
    if (other === null)
      return { ok: false, error: 'No player with that name — pick them from the search.' };
    if (other === me) return { ok: false, error: "That's you!" };
    switch (op) {
      case 'request':
        return this.request(me, other);
      case 'accept':
        return this.accept(me, other);
      case 'decline':
      case 'cancel': {
        const [from, to] = op === 'decline' ? [other, me] : [me, other];
        this.db
          .prepare('DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?')
          .run(from, to);
        this.push(me);
        this.push(other);
        return { ok: true };
      }
      case 'remove':
        this.unfriend(me, other);
        this.push(me);
        this.push(other);
        return { ok: true };
      case 'block':
        this.unfriend(me, other);
        this.db
          .prepare(
            'DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)',
          )
          .run(me, other, other, me);
        this.db
          .prepare(
            'INSERT OR IGNORE INTO blocks (player_id, blocked_id, created_at) VALUES (?, ?, ?)',
          )
          .run(me, other, this.now());
        this.blockCache.get(me)?.add(other);
        this.push(me);
        this.push(other);
        return { ok: true };
      case 'unblock':
        this.db.prepare('DELETE FROM blocks WHERE player_id = ? AND blocked_id = ?').run(me, other);
        this.blockCache.get(me)?.delete(other);
        this.push(me);
        return { ok: true };
      default:
        return { ok: false, error: 'Unknown action.' };
    }
  }

  private unfriend(a: number, b: number): void {
    this.db
      .prepare(
        'DELETE FROM friends WHERE (player_id = ? AND friend_id = ?) OR (player_id = ? AND friend_id = ?)',
      )
      .run(a, b, b, a);
  }

  private request(me: number, other: number): Result {
    if (this.hasBlocked(me, other)) return { ok: false, error: 'Unblock them first.' };
    if (this.areFriends(me, other)) return { ok: false, error: 'You are already friends.' };
    // they asked you already: that's a yes
    if (
      this.db
        .prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?')
        .get(other, me)
    )
      return this.accept(me, other);
    if (this.count(me) >= FRIENDS_MAX)
      return { ok: false, error: `Your friends list is full (${FRIENDS_MAX}).` };
    const wait = this.requestLimit.lockedFor(`req:${me}`);
    if (wait) return { ok: false, error: 'Too many friend requests — try again later.' };
    const outgoing = (
      this.db.prepare('SELECT COUNT(*) AS n FROM friend_requests WHERE from_id = ?').get(me) as {
        n: number;
      }
    ).n;
    if (outgoing >= MAX_OUTGOING)
      return { ok: false, error: 'Too many requests waiting for an answer.' };
    this.requestLimit.hit(`req:${me}`);
    // blocked by them: looks sent, but they never see it
    if (this.hasBlocked(other, me)) return { ok: true };
    const res = this.db
      .prepare(
        'INSERT OR IGNORE INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)',
      )
      .run(me, other, this.now());
    if (Number(res.changes) === 1) {
      const card = this.accounts.cards([me]).get(me);
      if (card) this.notify(other, { kind: 'request', from: card });
    }
    this.push(me);
    this.push(other);
    return { ok: true };
  }

  private accept(me: number, other: number): Result {
    const req = this.db
      .prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?')
      .get(other, me);
    if (!req) return { ok: false, error: 'That request is gone.' };
    if (this.count(me) >= FRIENDS_MAX)
      return { ok: false, error: `Your friends list is full (${FRIENDS_MAX}).` };
    if (this.count(other) >= FRIENDS_MAX)
      return { ok: false, error: 'Their friends list is full.' };
    const t = this.now();
    this.db
      .prepare(
        'DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)',
      )
      .run(me, other, other, me);
    const ins = this.db.prepare(
      'INSERT OR IGNORE INTO friends (player_id, friend_id, since) VALUES (?, ?, ?)',
    );
    ins.run(me, other, t);
    ins.run(other, me, t);
    const card = this.accounts.cards([me]).get(me);
    if (card) this.notify(other, { kind: 'accepted', from: card });
    this.push(me);
    this.push(other);
    return { ok: true };
  }

  // ---------------- invites & joining ----------------

  /** Invite a friend to your room: they get a toast with a Join button. */
  invite(conn: Conn, friend: number): Result {
    const me = conn.accountId;
    if (me === null) return { ok: false, error: 'No account.' };
    const room = conn.roomCode ? this.hub()?.rooms.get(conn.roomCode) : undefined;
    if (!room) return { ok: false, error: 'Create or join a room first.' };
    if (room.ranked) return { ok: false, error: "Friends can't join a ranked match." };
    if (!this.areFriends(me, friend)) return { ok: false, error: 'You can only invite friends.' };
    if (!this.online.has(friend)) return { ok: false, error: 'They are offline.' };
    if (this.inviteLimit.lockedFor(`inv:${me}`))
      return { ok: false, error: 'Too many invites — wait a moment.' };
    this.inviteLimit.hit(`inv:${me}`);
    if (this.hasBlocked(friend, me)) return { ok: true };
    const card = this.accounts.cards([me]).get(me);
    if (card)
      this.notify(friend, {
        kind: 'invite',
        from: card,
        room: { code: room.code, mode: room.mode, map: room.map },
      });
    return { ok: true };
  }

  /** The room to join to be with a friend, or why not. */
  friendRoom(conn: Conn, friend: number): Room | string {
    const me = conn.accountId;
    if (me === null || !this.areFriends(me, friend)) return 'You can only join friends.';
    const conns = [...(this.online.get(friend) ?? [])];
    if (!conns.length) return 'They are offline.';
    const hub = this.hub();
    const room = conns
      .map((c) => (c.roomCode ? hub?.rooms.get(c.roomCode) : undefined))
      .find((r): r is Room => !!r);
    if (!room) return 'They are not in a room.';
    if (room.ranked) return 'They are in a ranked match.';
    if (conn.roomCode === room.code) return 'You are already in their room.';
    if (!room.hasRoomForHuman()) return 'Their room is full.';
    return room;
  }
}
