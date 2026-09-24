import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLACEMENT_GAMES } from '@space-yz/shared';
import { createServices, type Services } from '../src/services';
import { hashToken } from '../src/services/accounts';
import { BAN_STEPS_MS } from '../src/services/ranked';
import type { MatchResult } from '../src/game/rules/match';
import { MatchRules } from '../src/game/rules/match';
import { Room } from '../src/game/room';
import type { Conn } from '../src/game/conn';
import { startGameServer, type GameServer } from '../src/app';
import { startHeadlessBot, type HeadlessBot } from '../../../tools/bots/headless';

const result = (
  a: number[],
  b: number[],
  winner: 0 | 1 | null,
  extra: Partial<MatchResult> = {},
): MatchResult => ({
  mode: a.length === 1 ? '1v1' : a.length === 2 ? '2v2' : '5v5',
  winner,
  reason: 'first to 5',
  scores: winner === 0 ? [5, 2] : [2, 5],
  rounds: 7,
  durationSec: 200,
  players: [...a.map((id) => [id, 0] as const), ...b.map((id) => [id, 1] as const)].map(
    ([id, team], i) => ({
      id: i + 1,
      accountId: id,
      team,
      bot: false,
      kills: 3,
      deaths: 2,
      teamKills: 0,
      damage: 300,
    }),
  ),
  leavers: [],
  ...extra,
});

describe('accounts & ranked store', () => {
  let s: Services;
  let clock = 1_000_000_000_000;
  beforeAll(() => {
    s = createServices({ dbFile: ':memory:', log: () => {}, now: () => clock });
  });
  afterAll(() => s.close());

  it('creates accounts with a secret token and stores only its hash', () => {
    const a = s.accounts.login('Alice');
    expect(a.created).toBe(true);
    expect(a.token).toMatch(/^syz_/);
    const again = s.accounts.login('Alice2', a.token);
    expect(again.created).toBe(false);
    expect(again.account.id).toBe(a.account.id);
    expect(again.account.name).toBe('Alice2');
    const rows = s.db.prepare('SELECT token_hash FROM players').all() as { token_hash: string }[];
    expect(rows.some((r) => r.token_hash === a.token)).toBe(false);
    expect(rows.some((r) => r.token_hash === hashToken(a.token))).toBe(true);
    // a bad token just makes a new account
    expect(s.accounts.login('Mallory', 'syz_not-a-real-token-000000').created).toBe(true);
  });

  it('ranked wins raise the rating, losses lower it; placements move more', () => {
    const w = s.accounts.login('Winner').account.id;
    const l = s.accounts.login('Loser').account.id;
    const d1 = s.ranked.recordMatch({
      mode: '1v1',
      ranked: true,
      map: 'kestrel',
      result: result([w], [l], 0),
      names: {},
    });
    expect(d1.get(w)!).toBeGreaterThan(0);
    expect(d1.get(l)!).toBeLessThan(0);
    for (let i = 0; i < PLACEMENT_GAMES + 2; i++)
      s.ranked.recordMatch({
        mode: '1v1',
        ranked: true,
        map: 'kestrel',
        result: result([w], [l], 0),
        names: {},
      });
    const late = s.ranked.recordMatch({
      mode: '1v1',
      ranked: true,
      map: 'kestrel',
      result: result([w], [l], 0),
      names: {},
    });
    expect(Math.abs(late.get(w)!)).toBeLessThan(Math.abs(d1.get(w)!));
    const p = s.ranked.profile(w)!;
    expect(p.modes['1v1']!.games).toBe(PLACEMENT_GAMES + 4);
    expect(p.modes['1v1']!.tier.isRanked).toBe(true);
    expect(p.recent.length).toBeGreaterThan(0);
  });

  it('private matches are recorded but never change ratings', () => {
    const a = s.accounts.login('PrivA').account.id;
    const b = s.accounts.login('PrivB').account.id;
    const d = s.ranked.recordMatch({
      mode: '1v1',
      ranked: false,
      map: 'kestrel',
      result: result([a], [b], 0),
      names: {},
    });
    expect(d.size).toBe(0);
    expect(s.ranked.rating(a, '1v1').games).toBe(0);
    expect(s.ranked.profile(a)!.recent.length).toBe(1);
  });

  it('team kills and leaving cost extra rating', () => {
    const ids = ['A', 'B', 'C', 'D'].map((n) => s.accounts.login(`TK${n}`).account.id);
    const base = s.ranked.recordMatch({
      mode: '2v2',
      ranked: true,
      map: 'kestrel',
      result: result([ids[0], ids[1]], [ids[2], ids[3]], 1),
      names: {},
    });
    const ids2 = ['E', 'F', 'G', 'H'].map((n) => s.accounts.login(`TK${n}`).account.id);
    const r = result([ids2[0], ids2[1]], [ids2[2], ids2[3]], 1);
    r.players[0].teamKills = 2;
    const tk = s.ranked.recordMatch({
      mode: '2v2',
      ranked: true,
      map: 'kestrel',
      result: r,
      names: {},
    });
    expect(tk.get(ids2[0])!).toBeLessThan(base.get(ids[0])! - 5);
    // a leaver on the winning side still loses rating
    const ids3 = ['I', 'J', 'K', 'L'].map((n) => s.accounts.login(`TK${n}`).account.id);
    const r3 = result([ids3[0]], [ids3[2], ids3[3]], 0, {
      leavers: [{ accountId: ids3[1], team: 0 }],
    });
    r3.mode = '2v2';
    const lv = s.ranked.recordMatch({
      mode: '2v2',
      ranked: true,
      map: 'kestrel',
      result: r3,
      names: {},
    });
    expect(lv.get(ids3[1])!).toBeLessThan(0);
    expect(lv.get(ids3[0])!).toBeGreaterThan(0);
  });

  it('leaderboards list placed players best first, with space-object tiers', () => {
    const board = s.ranked.leaderboard('1v1');
    expect(board.length).toBeGreaterThanOrEqual(2);
    expect(board[0].rating).toBeGreaterThanOrEqual(board[1].rating);
    expect(board[0].position).toBe(1);
    expect(board[0].tier.label).toMatch(/Asteroid|Moon|Planet|Gas Giant|Star|Supergiant|Galaxy/);
    const global = s.ranked.leaderboard('global');
    expect(global[0].name).toBe('Winner');
  });

  it('grief kicks start escalating ranked bans', () => {
    const id = s.accounts.login('Griefer').account.id;
    const u1 = s.ranked.griefKick(id, 'tk');
    expect(u1 - clock).toBe(BAN_STEPS_MS[0]);
    expect(s.ranked.bannedUntil(id)).toBe(u1);
    const u2 = s.ranked.griefKick(id, 'tk');
    expect(u2 - clock).toBe(BAN_STEPS_MS[1]);
    clock += BAN_STEPS_MS[1] + 1;
    expect(s.ranked.bannedUntil(id)).toBeNull();
  });

  it('stores reports for the host to review', () => {
    s.ranked.report({
      reporterId: 1,
      reportedId: 2,
      reportedName: 'Bob',
      reason: 'aimbot?',
      room: 'ABC123',
    });
    const r = s.ranked.reports();
    expect(r[0]).toMatchObject({ reportedName: 'Bob', reason: 'aimbot?', handled: false });
  });
});

describe('anti-grief in matches', () => {
  it('warns, then kicks a team killer', () => {
    const room = new Room({ code: 'GRF', mode: '2v2', map: 'kestrel', seed: 2 });
    const rules = new MatchRules('2v2');
    room.rules = rules;
    const fake = { rttMs: 0, sendBinary: () => {}, sendJson: () => {} } as unknown as Conn;
    const g = room.addMember('G', fake, { team: 0 });
    const mate = room.addMember('M', null, { team: 0 });
    room.addMember('E1', null, { team: 1 });
    room.addMember('E2', null, { team: 1 });
    const actions: string[] = [];
    rules.onGrief = (_r, m, action) => {
      actions.push(`${m.name}:${action}`);
      if (action === 'kick') room.removeMember(m.id);
    };
    for (let i = 0; i < 60 * 9; i++) room.tick();
    expect(rules.ms.phase).toBe('live');
    const tk = () => {
      room.world.events = [];
      room.world.events.push({
        type: 'kill',
        attacker: g.id,
        victim: mate.id,
        kind: 'slash',
        teamKill: true,
        pos: { x: 0, y: 0, z: 0 },
        src: { x: 0, y: 0, z: 0 },
        throwId: 0,
      });
      rules.afterStep(room);
    };
    tk();
    tk();
    expect(actions).toEqual(['G:warn']);
    tk();
    expect(actions).toEqual(['G:warn', 'G:kick']);
    expect(rules.leavers.length).toBe(1);
  });
});

describe('ranked forfeits', () => {
  it('when a whole team leaves a ranked match, the other team wins and the leaver counts', async () => {
    const room = new Room({ code: 'FF1', mode: '1v1', map: 'kestrel', ranked: true, seed: 3 });
    const rules = new MatchRules('1v1');
    room.rules = rules;
    const fake = () => ({ rttMs: 0, sendBinary: () => {}, sendJson: () => {} }) as unknown as Conn;
    const a = room.addMember('A', fake(), { team: 0, accountId: 11 });
    room.addMember('B', fake(), { team: 1, accountId: 12 });
    let res: MatchResult | null = null;
    rules.onResult = (_r, x) => (res = x);
    for (let i = 0; i < 60 * 4; i++) room.tick();
    expect(rules.ms.phase).toBe('spawnLock');
    room.removeMember(a.id);
    await Promise.resolve();
    expect(res).not.toBeNull();
    expect(res!.winner).toBe(1);
    expect(res!.reason).toBe('forfeit');
    expect(res!.leavers).toEqual([{ accountId: 11, team: 0 }]);
    expect(res!.players.map((p) => p.accountId)).toEqual([12]);
  });
});

describe('ranked queue over WebSocket', () => {
  let server: GameServer;
  let services: Services;
  const bots: HeadlessBot[] = [];
  beforeAll(async () => {
    services = createServices({ dbFile: ':memory:', log: () => {} });
    server = await startGameServer({
      port: 0,
      host: '127.0.0.1',
      assets: null,
      log: () => {},
      services: services.hub,
      api: services.api,
    });
    services.queue.start(server.hub);
  });
  afterAll(async () => {
    for (const b of bots) b.stop();
    await server.close();
    services.close();
  });

  it('two players queueing 1v1 land in the same ranked room on opposite teams', async () => {
    const url = `ws://127.0.0.1:${server.port}/ws`;
    const mk = (name: string) => {
      const b = startHeadlessBot({ url, name, onReady: (core) => core.queueRanked('1v1') });
      bots.push(b);
      return b;
    };
    const a = mk('Queuer1');
    const b = mk('Queuer2');
    const t0 = Date.now();
    while (!(a.core.state === 'room' && b.core.state === 'room') && Date.now() - t0 < 8000)
      await new Promise((r) => setTimeout(r, 50));
    expect(a.core.state).toBe('room');
    expect(a.core.code).toBe(b.core.code);
    expect(a.core.ranked).toBe(true);
    const room = server.hub.rooms.get(a.core.code)!;
    expect(room.teamCounts()).toEqual([1, 1]);
    // tokens were issued and profiles sent
    expect(a.core.token).toMatch(/^syz_/);
    expect(a.core.account).not.toBeNull();
  }, 15000);

  it('serves leaderboards and profiles over the JSON API', async () => {
    const base = `http://127.0.0.1:${server.port}`;
    const lb = (await (await fetch(`${base}/api/leaderboard?mode=global`)).json()) as {
      rows: unknown[];
    };
    expect(Array.isArray(lb.rows)).toBe(true);
    expect((await fetch(`${base}/api/leaderboard?mode=9v9`)).status).toBe(400);
    const p = await fetch(`${base}/api/profile?id=1`);
    expect(p.status).toBe(200);
    const body = (await p.json()) as { name: string; warnings?: number };
    expect(body.warnings).toBeUndefined();
    expect((await fetch(`${base}/api/profile?id=999`)).status).toBe(404);
  });
});
