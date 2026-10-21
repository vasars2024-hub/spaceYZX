// The WebSocket side of accounts, profiles and friends (protocol 'account', 'editProfile',
// 'friend', 'social', 'invite', 'joinFriend'). Auth runs over the game connection (HTTPS/WSS
// in production): the hello's token picks the account; 'account' messages secure it, log in,
// change the password… and answer with 'accountResult' plus a new 'welcome' (new token) when
// the session changed. Passwords never appear in logs or replies.
import type { AccountOp, ClientMsg, FriendOp } from '@space-yz/shared';
import type { GameHub } from '../game/hub';
import type { Conn } from '../game/conn';
import type { Account, Accounts, AuthResult } from './accounts';
import type { RankedStore } from './ranked';
import type { RankedQueue } from './queue';
import type { Social } from './social';

const ACCOUNT_OPS: readonly AccountOp[] = [
  'register',
  'login',
  'logout',
  'logoutAll',
  'password',
  'recover',
  'recoveryCode',
];
const FRIEND_OPS: readonly FriendOp[] = [
  'request',
  'accept',
  'decline',
  'cancel',
  'remove',
  'block',
  'unblock',
];

export const accountHandler = (d: {
  accounts: Accounts;
  ranked: RankedStore;
  queue: RankedQueue;
  social: Social;
  log: (msg: string) => void;
}) => {
  const { accounts, ranked, queue, social, log } = d;
  /** each connection's session token (to log that one device out) */
  const sessionOf = new WeakMap<Conn, string>();
  /** a password check is running for this connection */
  const busy = new WeakSet<Conn>();

  const welcome = (conn: Conn, token?: string): void => {
    const id = conn.accountId;
    if (id === null) return;
    conn.sendJson({
      t: 'welcome',
      name: conn.name,
      account: ranked.profile(id),
      token,
      me: accounts.me(id) ?? undefined,
    });
    conn.sendJson({ t: 'social', data: social.state(id) });
  };

  /** This connection is now `account` (logged in / recovered). */
  const switchTo = (conn: Conn, account: Account, token: string): void => {
    queue.remove(conn);
    social.disconnect(conn);
    conn.accountId = account.id;
    conn.name = account.name;
    sessionOf.set(conn, token);
    social.connect(conn);
    welcome(conn, token);
  };

  /** This connection has no account any more (the client says hello again as a guest). */
  const drop = (conn: Conn, why: string | null): void => {
    queue.remove(conn);
    social.disconnect(conn);
    conn.accountId = null;
    sessionOf.delete(conn);
    if (why) conn.sendJson({ t: 'notice', msg: why });
    conn.sendJson({ t: 'accountResult', op: 'logout', ok: true });
  };

  /** The account's other devices are logged out (their sessions were revoked). */
  const dropOthers = (id: number, except: Conn, why: string): void => {
    for (const c of [...(social.online.get(id) ?? [])]) if (c !== except) drop(c, why);
  };

  const onAccount = (conn: Conn, msg: Extract<ClientMsg, { t: 'account' }>): void => {
    const op = msg.op;
    const reply = (ok: boolean, error?: string, recoveryCode?: string) =>
      conn.sendJson({ t: 'accountResult', op, ok, error, recoveryCode });
    if (!ACCOUNT_OPS.includes(op)) return conn.strike('account');
    if (conn.roomCode) return reply(false, 'Leave your room first.');
    if (busy.has(conn)) return reply(false, 'One moment…');
    const id = conn.accountId;
    const needsAccount = op !== 'login' && op !== 'recover';
    if (needsAccount && id === null) return reply(false, 'Not logged in.');
    const s = (v: unknown) => (typeof v === 'string' ? v : undefined);
    const run = async (): Promise<void> => {
      let r: AuthResult;
      switch (op) {
        case 'register':
          r = await accounts.register(id!, s(msg.username), s(msg.password), conn.ip);
          if (conn.closed) return;
          if (!r.ok) return reply(false, r.error);
          log(`Account secured: ${r.account.name} (#${r.account.id})`);
          dropOthers(
            id!,
            conn,
            'This account was secured on another device: log in with its username.',
          );
          conn.name = r.account.name;
          sessionOf.set(conn, r.token);
          welcome(conn, r.token);
          social.touch(id!);
          return reply(true, undefined, r.recoveryCode);
        case 'login':
        case 'recover':
          r =
            op === 'login'
              ? await accounts.passwordLogin(s(msg.username), s(msg.password), conn.ip)
              : await accounts.recover(s(msg.username), s(msg.code), s(msg.password), conn.ip);
          if (conn.closed) return;
          if (!r.ok) return reply(false, r.error);
          if (op === 'recover') {
            log(`Account recovered: ${r.account.name} (#${r.account.id})`);
            dropOthers(r.account.id, conn, 'Your password was reset: log in again.');
          }
          switchTo(conn, r.account, r.token);
          return reply(true, undefined, r.recoveryCode);
        case 'password':
          r = await accounts.changePassword(id!, s(msg.oldPassword), s(msg.password), conn.ip);
          if (conn.closed) return;
          if (!r.ok) return reply(false, r.error);
          dropOthers(id!, conn, 'Your password was changed on another device: log in again.');
          sessionOf.set(conn, r.token);
          welcome(conn, r.token);
          return reply(true);
        case 'recoveryCode':
          r = await accounts.renewRecoveryCode(id!, s(msg.password), conn.ip);
          if (conn.closed) return;
          return r.ok ? reply(true, undefined, r.recoveryCode) : reply(false, r.error);
        case 'logout': {
          const token = sessionOf.get(conn);
          if (token) accounts.revokeSession(token);
          return drop(conn, null);
        }
        case 'logoutAll':
          accounts.revokeAll(id!);
          dropOthers(id!, conn, 'You were logged out everywhere.');
          return drop(conn, null);
      }
    };
    busy.add(conn);
    run()
      .catch((err: unknown) => {
        log(`account ${op} failed: ${String(err)}`);
        reply(false, 'Something went wrong — try again.');
      })
      .finally(() => busy.delete(conn));
  };

  const onEdit = (conn: Conn, msg: Extract<ClientMsg, { t: 'editProfile' }>): void => {
    const reply = (ok: boolean, error?: string) =>
      conn.sendJson({ t: 'accountResult', op: 'editProfile', ok, error });
    const id = conn.accountId;
    if (id === null) return reply(false, 'Not logged in.');
    if (msg.name !== undefined && msg.name !== conn.name && conn.roomCode)
      return reply(false, 'Leave your room to change your name.');
    const r = accounts.editProfile(id, {
      name: msg.name,
      avatar: msg.avatar,
      banner: msg.banner,
      title: msg.title,
    });
    if (!r.ok) return reply(false, r.error);
    const me = accounts.me(id);
    if (me)
      for (const c of social.online.get(id) ?? [conn]) {
        if (!c.roomCode) c.name = me.name;
        c.sendJson({ t: 'me', data: me });
      }
    social.touch(id);
    reply(true);
  };

  const handle = (hub: GameHub, conn: Conn, msg: ClientMsg): void => {
    if (msg.t === 'account') return onAccount(conn, msg);
    if (msg.t === 'editProfile') return onEdit(conn, msg);
    if (msg.t !== 'friend' && msg.t !== 'social' && msg.t !== 'invite' && msg.t !== 'joinFriend')
      return;
    const id = conn.accountId;
    const op = msg.t === 'friend' ? msg.op : msg.t === 'social' ? null : msg.t;
    const reply = (ok: boolean, error?: string) => {
      if (op) conn.sendJson({ t: 'socialResult', op, ok, error });
    };
    if (id === null) return reply(false, 'Not logged in.');
    switch (msg.t) {
      case 'social':
        conn.sendJson({ t: 'social', data: social.state(id) });
        return;
      case 'friend': {
        if (!FRIEND_OPS.includes(msg.op)) return conn.strike('friend');
        const r = social.op(id, msg.op, { id: msg.id, name: msg.name });
        return r.ok ? reply(true) : reply(false, r.error);
      }
      case 'invite': {
        const r = social.invite(conn, Number(msg.id));
        return r.ok ? reply(true) : reply(false, r.error);
      }
      case 'joinFriend': {
        const room = social.friendRoom(conn, Number(msg.id));
        if (typeof room === 'string') return reply(false, room);
        queue.remove(conn);
        hub.joinRoom(conn, room);
        return reply(true);
      }
    }
  };

  return { handle, sessionOf };
};
