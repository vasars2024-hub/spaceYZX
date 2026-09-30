import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServices, type Services } from '../src/services';
import { hashToken } from '../src/services/accounts';
import { BAN_STEPS_MS } from '../src/services/ranked';
import type { MatchResult } from '../src/game/rules/match';
import { MatchRules, RANKED_START_DELAY_SEC } from '../src/game/rules/match';
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
    const rows = s.db.prepare('SELECT token_hash FROM sessions').all() as { token_hash: string }[];
    expect(rows.some((r) => r.token_hash === a.token)).toBe(false);
    expect(rows.some((r) => r.token_hash === hashToken(a.token))).toBe(true);
    // a bad token just makes a new account
    expect(s.accounts.login('Mallory', 'syz_not-a-real-token-000000').created).toBe(true);
  });

  it('Duels: wins raise the rating, losses lower it; placements move more', () => {
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
    for (let i = 0; i < 7; i++)
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
    expect(p.ladders.duels.games).toBe(9);
    expect(p.ladders.duels.placed).toBe(true);
    expect(p.ladders.duels.rating).toBeGreaterThan(1500);
    expect(p.ladders.duels.rank!.label).toMatch(/Asteroid|Moon|Planet|Gas Giant|Star|Supergiant/);
    expect(p.ladders.premier.games).toBe(0); // 1v1 never touches Premier
    expect(p.recent[0]).toMatchObject({ mode: '1v1', ladder: 'duels', ranked: true });
  });

  it('Duels: 1v1 and 2v2 share one rating', () => {
    const [a, b, c, d] = ['DA', 'DB', 'DC', 'DD'].map((n) => s.accounts.login(n).account.id);
    s.ranked.recordMatch({
      mode: '1v1',
      ranked: true,
      map: 'split-deck',
      result: result([a], [b], 0),
      names: {},
    });
    const after1v1 = s.ranked.rating(a, 'duels');
    expect(after1v1.games).toBe(1);
    s.ranked.recordMatch({
      mode: '2v2',
      ranked: true,
      map: 'split-deck',
      result: result([a, c], [b, d], 0),
      names: {},
    });
    const after2v2 = s.ranked.rating(a, 'duels');
    expect(after2v2.games).toBe(2);
    expect(after2v2.wins).toBe(2);
    expect(after2v2.rating.rating).toBeGreaterThan(after1v1.rating.rating);
    expect(s.ranked.rating(c, 'duels').games).toBe(1);
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
    expect(s.ranked.rating(a, 'duels').games).toBe(0);
    expect(s.ranked.profile(a)!.recent.length).toBe(1);
    expect(s.ranked.profile(a)!.recent[0].ladder).toBeNull();
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

  it('leaderboards list placed Duels players best first; there is no global board', () => {
    const board = s.ranked.leaderboard('duels');
    expect(board.length).toBeGreaterThanOrEqual(1);
    expect(board[0].name).toBe('Winner');
    expect(board[0].position).toBe(1);
    expect(board[0].rank.label).toMatch(/Asteroid|Moon|Planet|Gas Giant|Star|Supergiant|Galaxy/);
    for (let i = 1; i < board.length; i++)
      expect(board[i - 1].rating).toBeGreaterThanOrEqual(board[i].rating);
  });

  let premierWinner = 0;

  it('Premier: the rating stays hidden until 5 wins, then shows as a number with its band', () => {
    const win = ['P1', 'P2', 'P3', 'P4', 'P5'].map((n) => s.accounts.login(n).account.id);
    const lose = ['L1', 'L2', 'L3', 'L4', 'L5'].map((n) => s.accounts.login(n).account.id);
    premierWinner = win[0];
    const fresh = s.ranked.profile(win[0])!.ladders.premier;
    expect(fresh).toMatchObject({
      rating: null,
      rank: null,
      placed: false,
      placement: { done: 0, need: 5, unit: 'wins' },
    });
    const play = () =>
      s.ranked.recordMatch({
        mode: '5v5',
        ranked: true,
        map: 'orbital-ring',
        result: result(win, lose, 0),
        names: {},
      });
    for (let i = 0; i < 4; i++) play();
    let p = s.ranked.profile(win[0])!.ladders.premier;
    expect(p.rating).toBeNull();
    expect(p.placement.done).toBe(4);
    expect(s.ranked.leaderboard('premier').some((r) => r.playerId === win[0])).toBe(false);
    play();
    p = s.ranked.profile(win[0])!.ladders.premier;
    expect(p.placed).toBe(true);
    expect(p.rating).toBeGreaterThan(1000);
    expect(p.rank!.color).toMatch(/^#/);
    expect(p.position).toBeGreaterThanOrEqual(1);
    // five losses: still placing (it takes wins), rating still hidden
    expect(s.ranked.profile(lose[0])!.ladders.premier).toMatchObject({
      rating: null,
      placement: { done: 0 },
    });
    expect(s.ranked.profile(win[0])!.recent[0].ladder).toBe('premier');
    expect(s.ranked.profile(win[0])!.ladders.duels.games).toBe(0);
  });

  it('a new season pulls Premier 40% toward 1000, restarts placement and archives the season', () => {
    const p1 = premierWinner;
    const before = s.ranked.rating(p1, 'premier').rating.rating;
    expect(s.ranked.season()).toBe(1);
    const r = s.ranked.startNewSeason();
    expect(r.season).toBe(2);
    expect(s.ranked.season()).toBe(2);
    const after = s.ranked.rating(p1, 'premier');
    expect(after.rating.rating).toBeCloseTo(before + (1000 - before) * 0.4, 6);
    expect(after.seasonWins).toBe(0);
    const prof = s.ranked.profile(p1)!;
    expect(prof.season).toBe(2);
    expect(prof.ladders.premier.rating).toBeNull(); // placement again
    expect(prof.ladders.premier.placement.done).toBe(0);
    expect(prof.pastSeasons[0]).toMatchObject({ season: 1, rating: Math.round(before) });
    // season 1's final standings stay on the leaderboard; season 2 starts empty
    expect(s.ranked.leaderboard('premier', 50, 1).some((x) => x.playerId === p1)).toBe(true);
    expect(s.ranked.leaderboard('premier').some((x) => x.playerId === p1)).toBe(false);
    // Duels has no seasons
    expect(s.ranked.leaderboard('duels')[0].name).toBe('Winner');
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

  it('one account searches once: a second tab gets a clear message instead of waiting forever', () => {
    const id = s.accounts.login('Twin').account.id;
    const sent: unknown[] = [];
    const tab = () =>
      ({
        accountId: id,
        roomCode: null,
        closed: false,
        rttMs: 0,
        sendJson: (m: unknown) => sent.push(m),
      }) as unknown as Conn;
    const a = tab();
    const b = tab();
    expect(s.queue.set(a, 'duels-1v1')).toBeNull();
    expect(s.queue.set(b, 'duels-1v1')).toMatch(/another tab/);
    expect(s.queue.size('duels-1v1')).toBe(1);
    s.queue.set(a, null);
    expect(s.queue.set(b, 'duels-1v1')).toBeNull(); // fine once the first tab stops searching
    s.queue.set(b, null);
    // the removed ladders' queues are gone
    for (const old of ['1v1', '2v2', '5v5', 'arena'])
      expect(s.queue.set(a, old)).toMatch(/Unknown/);
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
    // (ranked rooms warm up longer: the versus screen)
    for (let i = 0; i < 60 * (RANKED_START_DELAY_SEC + 1); i++) room.tick();
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

  it('two players queueing Duels 1v1 land in the same ranked room on opposite teams', async () => {
    const url = `ws://127.0.0.1:${server.port}/ws`;
    const mk = (name: string) => {
      const b = startHeadlessBot({ url, name, onReady: (core) => core.queueRanked('duels-1v1') });
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
    const lb = (await (await fetch(`${base}/api/leaderboard?mode=premier`)).json()) as {
      rows: unknown[];
      season: number;
    };
    expect(Array.isArray(lb.rows)).toBe(true);
    expect(lb.season).toBe(1);
    expect((await fetch(`${base}/api/leaderboard?mode=duels`)).status).toBe(200);
    for (const gone of ['global', '1v1', '5v5', 'arena', '9v9'])
      expect((await fetch(`${base}/api/leaderboard?mode=${gone}`)).status).toBe(400);
    const info = (await (await fetch(`${base}/api/ranked`)).json()) as {
      season: number;
      premier: { open: boolean };
    };
    expect(info).toMatchObject({ season: 1, premier: { open: true } });
    const p = await fetch(`${base}/api/profile?id=1`);
    expect(p.status).toBe(200);
    const body = (await p.json()) as { name: string; warnings?: number };
    expect(body.warnings).toBeUndefined();
    expect((await fetch(`${base}/api/profile?id=999`)).status).toBe(404);
  });
});
