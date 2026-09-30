// Friends and profiles: requests (accept / decline / cancel / remove), limits, blocking, online
// status, invites and joining a friend's room, accounts over the WebSocket, and the public
// JSON API (profiles, match details, search) never leaking secrets.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ServerMsg, SocialState, SocketLike } from '@space-yz/shared';
import { FRIENDS_MAX, NetCore, PROTOCOL_VERSION } from '@space-yz/shared';
import { createServices, type Services } from '../src/services';
import { startGameServer, type GameServer } from '../src/app';
import type { MatchResult } from '../src/game/rules/match';

const CHEAP = { logN: 10, r: 8, p: 1 };

describe('friends (store)', () => {
  let s: Services;
  let clock = 1_700_000_000_000;
  const acct = (n: string) => s.accounts.login(n).account.id;
  beforeAll(() => {
    s = createServices({ dbFile: ':memory:', log: () => {}, now: () => clock, scrypt: CHEAP });
  });
  afterAll(() => s.close());

  it('request → accept → friends both ways; remove ends it', () => {
    const a = acct('Alpha');
    const b = acct('Bravo');
    expect(s.social.op(a, 'request', { id: b })).toEqual({ ok: true });
    expect(s.social.state(b).incoming.map((r) => r.id)).toEqual([a]);
    expect(s.social.state(a).outgoing.map((r) => r.id)).toEqual([b]);
    expect(s.social.op(b, 'accept', { id: a })).toEqual({ ok: true });
    expect(s.social.state(a).friends.map((f) => f.id)).toEqual([b]);
    expect(s.social.state(b).friends.map((f) => f.id)).toEqual([a]);
    expect(s.social.state(a).friends[0].presence.state).toBe('offline');
    expect(s.social.state(a).outgoing).toEqual([]);
    expect(s.social.op(a, 'request', { id: b }).ok).toBe(false); // already friends
    expect(s.social.op(b, 'remove', { id: a })).toEqual({ ok: true });
    expect(s.social.state(a).friends).toEqual([]);
  });

  it('decline, cancel, crossing requests, self, unknown players', () => {
    const a = acct('Charlie');
    const b = acct('Delta');
    s.social.op(a, 'request', { id: b });
    s.social.op(b, 'decline', { id: a });
    expect(s.social.state(a).outgoing).toEqual([]);
    s.social.op(a, 'request', { id: b });
    s.social.op(a, 'cancel', { id: b });
    expect(s.social.state(b).incoming).toEqual([]);
    // both ask: that's a yes
    s.social.op(a, 'request', { id: b });
    expect(s.social.op(b, 'request', { id: a })).toEqual({ ok: true });
    expect(s.social.areFriends(a, b)).toBe(true);
    expect(s.social.op(a, 'request', { id: a }).ok).toBe(false);
    expect(s.social.op(a, 'request', { id: 999999 }).ok).toBe(false);
  });

  it('by username (ignoring case)', async () => {
    const a = acct('Echo');
    const g = s.accounts.login('Foxy');
    await s.accounts.register(g.account.id, 'Foxtrot', 'foxtrot-pass-1', '1.1.1.1');
    expect(s.social.op(a, 'request', { name: 'FOXTROT' })).toEqual({ ok: true });
    expect(s.social.state(a).outgoing[0].name).toBe('Foxtrot');
    expect(s.social.state(g.account.id).incoming[0].id).toBe(a);
  });

  it(`at most ${FRIENDS_MAX} friends, and requests are rate limited`, () => {
    const a = acct('Popular');
    const t = clock;
    const ins = s.db.prepare('INSERT INTO friends (player_id, friend_id, since) VALUES (?, ?, ?)');
    for (let i = 0; i < FRIENDS_MAX; i++) {
      const f = acct(`Fan${i}`);
      ins.run(a, f, t);
      ins.run(f, a, t);
    }
    const late = acct('Latecomer');
    expect(s.social.op(a, 'request', { id: late }).ok).toBe(false);
    s.social.op(late, 'request', { id: a });
    expect(s.social.op(a, 'accept', { id: late })).toMatchObject({ ok: false });
    // spam: 20 requests, then a wait
    const spammer = acct('Spammer');
    let refused = 0;
    for (let i = 0; i < 25; i++)
      if (!s.social.op(spammer, 'request', { id: acct(`Target${i}`) }).ok) refused++;
    expect(refused).toBe(5);
    clock += 11 * 60_000;
    expect(s.social.op(spammer, 'request', { id: acct('Target99') }).ok).toBe(true);
  });

  it('blocking ends the friendship and hides their requests', () => {
    const a = acct('Golf');
    const b = acct('Hotel');
    s.social.op(a, 'request', { id: b });
    s.social.op(b, 'accept', { id: a });
    expect(s.social.op(a, 'block', { id: b })).toEqual({ ok: true });
    expect(s.social.areFriends(a, b)).toBe(false);
    expect(s.social.state(a).blocked.map((x) => x.id)).toEqual([b]);
    // their request "works" for them but never reaches you
    expect(s.social.op(b, 'request', { id: a })).toEqual({ ok: true });
    expect(s.social.state(a).incoming).toEqual([]);
    expect(s.social.op(a, 'request', { id: b }).ok).toBe(false); // unblock first
    s.social.op(a, 'unblock', { id: b });
    expect(s.social.state(a).blocked).toEqual([]);
  });
});

// ------------------------------------------------------------------------------------------
// Over the network

interface Client {
  core: NetCore;
  got: ServerMsg[];
  social: () => SocialState | null;
  stop(): void;
}

describe('friends, accounts and profiles online', () => {
  let s: Services;
  let server: GameServer;
  let clients: Client[] = [];
  const base = () => `http://127.0.0.1:${server.port}`;

  beforeAll(async () => {
    s = createServices({ dbFile: ':memory:', log: () => {}, scrypt: CHEAP });
    server = await startGameServer({
      port: 0,
      host: '127.0.0.1',
      assets: null,
      log: () => {},
      services: s.hub,
      api: s.api,
    });
    s.queue.start(server.hub);
  });
  afterEach(() => {
    for (const c of clients) c.stop();
    clients = [];
  });
  afterAll(async () => {
    await server.close();
    s.close();
  });

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn: () => boolean, ms = 5000) => {
    const t0 = Date.now();
    while (!fn()) {
      if (Date.now() - t0 > ms) throw new Error('timeout');
      await wait(20);
    }
  };

  const connect = async (name: string, token?: string): Promise<Client> => {
    const got: ServerMsg[] = [];
    const core = new NetCore({
      url: `ws://127.0.0.1:${server.port}/ws`,
      name,
      token,
      now: () => performance.now(),
      createSocket: (u) => new WebSocket(u) as unknown as SocketLike,
    });
    core.listen((m) => got.push(m));
    core.connect();
    const c: Client = {
      core,
      got,
      social: () => {
        for (let i = got.length - 1; i >= 0; i--) {
          const m = got[i];
          if (m.t === 'social') return m.data;
        }
        return null;
      },
      stop: () => core.close(),
    };
    clients.push(c);
    await until(() => got.some((m) => m.t === 'me') && got.some((m) => m.t === 'social'));
    return c;
  };
  const idOf = (c: Client) => {
    const me = [...c.got].reverse().find((m) => m.t === 'me' || (m.t === 'welcome' && m.me));
    return me?.t === 'me' ? me.data.id : me?.t === 'welcome' ? me.me!.id : -1;
  };
  const last = <T extends ServerMsg['t']>(c: Client, t: T) =>
    [...c.got].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined;

  it('secure, log out, log in on another device over the WebSocket', async () => {
    const a = await connect('Wanderer');
    const guestToken = a.core.token!;
    const id = idOf(a);
    a.core.sendJson({
      t: 'account',
      op: 'register',
      username: 'Wanderer',
      password: 'wander-pass-1',
    });
    await until(() => !!last(a, 'accountResult'));
    const res = last(a, 'accountResult')!;
    expect(res).toMatchObject({ op: 'register', ok: true });
    expect(res.recoveryCode).toBeTruthy();
    // a new token for this device came with a welcome
    await until(() => a.core.token !== guestToken);
    const w = last(a, 'welcome')!;
    expect(w.me).toMatchObject({ id, name: 'Wanderer', secured: true });
    // nothing sent back contains the password
    expect(JSON.stringify(a.got)).not.toContain('wander-pass-1');
    // another device logs in: same account, its own token
    const b = await connect('Someone');
    b.got.length = 0;
    b.core.sendJson({ t: 'account', op: 'login', username: 'wanderer', password: 'bad-password' });
    await until(() => !!last(b, 'accountResult'));
    expect(last(b, 'accountResult')).toMatchObject({
      ok: false,
      error: 'Wrong username or password.',
    });
    b.got.length = 0;
    b.core.sendJson({ t: 'account', op: 'login', username: 'wanderer', password: 'wander-pass-1' });
    await until(() => !!last(b, 'accountResult'));
    expect(last(b, 'accountResult')).toMatchObject({ ok: true });
    expect(last(b, 'welcome')!.me!.id).toBe(id);
    expect(b.core.token).not.toBe(a.core.token);
    expect(b.core.name).toBe('Wanderer');
    // log out everywhere: both connections lose the account
    a.got.length = 0;
    b.core.sendJson({ t: 'account', op: 'logoutAll' });
    await until(() => !!last(a, 'accountResult') && !!last(b, 'accountResult'));
    expect(last(a, 'accountResult')).toMatchObject({ op: 'logout', ok: true });
    expect(s.accounts.sessionCount(id)).toBe(0);
    // an old token now makes a fresh guest
    const c = await connect('Wanderer', a.core.token);
    expect(idOf(c)).not.toBe(id);
    expect(c.core.name).not.toBe('Wanderer'); // guests can't pose as the username
  });

  it('online status, invites and joining a friend', async () => {
    const a = await connect('Juliet');
    const b = await connect('Kilo');
    const [ia, ib] = [idOf(a), idOf(b)];
    a.core.sendJson({ t: 'friend', op: 'request', id: ib });
    await until(() => b.got.some((m) => m.t === 'socialNotice' && m.data.kind === 'request'));
    b.core.sendJson({ t: 'friend', op: 'accept', id: ia });
    await until(() => a.social()?.friends.some((f) => f.id === ib) ?? false);
    expect(a.social()!.friends[0].presence.state).toBe('menu');
    // Kilo opens a room: Juliet sees it (joinable)
    b.core.createRoom('2v2', 'kestrel', 0, 'normal', 'tower', 'lethal');
    await until(() => a.social()?.friends[0].presence.state === 'room', 6000);
    const p = a.social()!.friends[0].presence;
    expect(p).toMatchObject({ mode: '2v2', map: 'kestrel', joinable: true, objective: 'tower' });
    // Kilo invites Juliet: a toast with the room
    b.core.sendJson({ t: 'invite', id: ia });
    await until(() => a.got.some((m) => m.t === 'socialNotice' && m.data.kind === 'invite'));
    const inv = [...a.got].reverse().find((m) => m.t === 'socialNotice');
    expect(inv?.t === 'socialNotice' && inv.data.room?.code).toBe(b.core.code);
    // Juliet joins through the friend (no code needed)
    a.core.sendJson({ t: 'joinFriend', id: ib });
    await until(() => a.core.state === 'room');
    expect(a.core.code).toBe(b.core.code);
    // the room roster names each human's account (profiles from the scoreboard)
    await until(() => a.core.roster.length === 2);
    expect(a.core.roster.map((r) => r.accountId).sort()).toEqual([ia, ib].sort());
    // strangers can't join through a friend, and nobody can be invited to by a non-friend
    const c = await connect('Lima');
    c.core.sendJson({ t: 'joinFriend', id: ib });
    await until(() => !!last(c, 'socialResult'));
    expect(last(c, 'socialResult')).toMatchObject({ ok: false });
    // going offline shows
    b.stop();
    await until(() => a.social()?.friends[0].presence.state === 'offline', 6000);
  });

  it('a blocked player’s chat never arrives', async () => {
    const a = await connect('Mike');
    const b = await connect('November');
    a.core.sendJson({ t: 'friend', op: 'block', id: idOf(b) });
    await until(() => (a.social()?.blocked.length ?? 0) === 1);
    b.core.createRoom('2v2', 'kestrel', 0, 'normal', 'tower', 'lethal');
    await until(() => b.core.state === 'room');
    a.core.joinRoom(b.core.code);
    await until(() => a.core.state === 'room');
    await until(() => b.core.roster.length === 2);
    b.core.sendChat('hello there', false);
    a.core.sendChat('hi back', false);
    await until(() => b.got.some((m) => m.t === 'chat' && m.text === 'hi back'));
    await wait(200);
    expect(a.got.some((m) => m.t === 'chat' && m.text === 'hello there')).toBe(false);
  });

  it('profile edits over the WebSocket; account ops wait outside rooms', async () => {
    const a = await connect('Oscar');
    a.core.sendJson({ t: 'editProfile', avatar: 7, banner: 2, title: 'Rail rider' });
    await until(() => !!last(a, 'accountResult'));
    expect(last(a, 'accountResult')).toMatchObject({ op: 'editProfile', ok: true });
    expect(last(a, 'me')!.data).toMatchObject({ avatar: 7, banner: 2, title: 'Rail rider' });
    a.got.length = 0;
    a.core.sendJson({ t: 'editProfile', avatar: 99 });
    await until(() => !!last(a, 'accountResult'));
    expect(last(a, 'accountResult')).toMatchObject({ ok: false });
    a.core.createRoom('practice', 'kestrel', 0, 'normal', 'tower', 'lethal');
    await until(() => a.core.state === 'room');
    a.got.length = 0;
    a.core.sendJson({ t: 'account', op: 'register', username: 'Oscar', password: 'oscar-pass-1' });
    await until(() => !!last(a, 'accountResult'));
    expect(last(a, 'accountResult')).toMatchObject({ ok: false, error: 'Leave your room first.' });
  });

  it('the public API: profiles with stats, match details, search — no secrets', async () => {
    const g = s.accounts.login('Papa');
    const reg = await s.accounts.register(g.account.id, 'Papa', 'papa-pass-12', '9.9.9.9');
    if (!reg.ok) throw new Error('register');
    const foe = s.accounts.login('Quebec').account.id;
    const result: MatchResult = {
      mode: '1v1',
      objective: 'bomb',
      winner: 0,
      reason: 'first to 5',
      scores: [5, 3],
      rounds: 8,
      durationSec: 300,
      players: [
        {
          id: 1,
          accountId: g.account.id,
          team: 0,
          bot: false,
          kills: 6,
          deaths: 3,
          teamKills: 0,
          damage: 610,
          stats: {
            throws: 20,
            throwHits: 8,
            laserShots: 4,
            laserHits: 1,
            gunShots: 0,
            gunHits: 0,
            headshots: 2,
            weaponKills: { boomerang: 5, laser: 1 },
            playSec: 290,
          },
        },
        {
          id: 2,
          accountId: foe,
          team: 1,
          bot: false,
          kills: 3,
          deaths: 6,
          teamKills: 0,
          damage: 300,
        },
      ],
      leavers: [],
    };
    s.ranked.recordMatch({ mode: '1v1', ranked: false, map: 'kestrel', result, names: {} });
    const res = await fetch(`${base()}/api/profile?id=${g.account.id}`);
    const text = await res.text();
    const p = JSON.parse(text) as {
      card: { name: string; secured: boolean };
      stats: {
        kd: number;
        boomerangAcc: number;
        laserAcc: number;
        headshots: number;
        favWeapon: { weapon: string };
        playtimeSec: number;
        byMode: Record<string, { games: number; wins: number }>;
      };
      recent: { matchId: number }[];
    };
    expect(p.card).toMatchObject({ name: 'Papa', secured: true });
    expect(p.stats).toMatchObject({
      kd: 2,
      boomerangAcc: 40,
      laserAcc: 25,
      headshots: 2,
      favWeapon: { weapon: 'boomerang' },
      playtimeSec: 290,
    });
    expect(p.stats.byMode.bomb).toEqual({ games: 1, wins: 1 });
    const m = (await (await fetch(`${base()}/api/match?id=${p.recent[0].matchId}`)).json()) as {
      players: { name: string; kills: number }[];
    };
    expect(m.players.map((x) => [x.name, x.kills])).toEqual([
      ['Papa', 6],
      ['Quebec', 3],
    ]);
    const search = await (await fetch(`${base()}/api/players?q=pap`)).text();
    expect(JSON.parse(search).rows[0]).toMatchObject({ id: g.account.id, name: 'Papa' });
    // no password hash, recovery code, token or session anywhere
    for (const body of [text, search, JSON.stringify(m)]) {
      expect(body).not.toMatch(/scrypt\$|pass_hash|recovery|token|session/i);
      expect(body).not.toMatch(/[0-9a-f]{64}/);
      expect(body).not.toContain(reg.token);
    }
    expect((await fetch(`${base()}/api/match?id=999999`)).status).toBe(404);
  });

  it('hello still works for old clients without an account message', async () => {
    const got: string[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    ws.onmessage = (e) => got.push(String(e.data));
    await new Promise((r) => (ws.onopen = r));
    ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name: 'Plain' }));
    await until(() => got.some((x) => x.includes('"welcome"')));
    ws.close();
  });
});
