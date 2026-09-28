// The Race ladder: the Race queue (2–8 racers), ratings only from ranked race rooms, server-side
// personal bests (only ever improved), leaderboards, seasons, and the database migration.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type * as SqliteModule from 'node:sqlite';
import { RACE_DEFAULTS, raceMaps, raceTracks, surfMaps } from '@space-yz/shared';
import { createServices, type Services } from '../src/services';
import { migrate, SCHEMA_VERSION } from '../src/services/db';
import { raceTrackPool } from '../src/services/queue';
import { GameHub } from '../src/game/hub';
import { RaceRules, type RaceRecord } from '../src/game/rules/race';
import type { Conn } from '../src/game/conn';
import type { Room } from '../src/game/room';

const TRACK = 'race-sunspire';

/** A finished race: `order` = account ids, first place first; null time = DNF. */
const record = (
  racers: { accountId: number | null; timeMs: number | null; left?: boolean; bot?: boolean }[],
  race = 1,
  track = TRACK,
): RaceRecord => {
  const finished = racers.filter((r) => r.timeMs !== null).length;
  return {
    mode: 'race',
    track,
    parSec: 60,
    race,
    durationSec: 70,
    room: 'RACE1',
    standings: racers.map((r, i) => ({
      id: i + 1,
      place: r.timeMs !== null ? i + 1 : finished + 1,
      timeMs: r.timeMs,
      dnf: r.timeMs === null && !r.left,
      left: !!r.left,
      splitsMs: r.timeMs !== null ? [r.timeMs / 2, r.timeMs] : [],
      respawns: 0,
      surges: 0,
      fuel: 0,
    })),
    racers: racers.map((r, i) => ({
      id: i + 1,
      accountId: r.accountId,
      name: `R${i + 1}`,
      bot: !!r.bot,
    })),
  };
};

describe('Race queue', () => {
  let s: Services;
  let clock: number;
  let rooms: { opts: Record<string, unknown>; joined: string[]; code: string }[];

  beforeEach(() => {
    clock = 1_000_000;
    s = createServices({ dbFile: ':memory:', log: () => {}, now: () => clock });
    rooms = [];
    s.queue.hub = {
      createRoom: (opts: Record<string, unknown>) => {
        const r = { opts, joined: [] as string[], code: `RR${rooms.length}` };
        rooms.push(r);
        return r;
      },
      joinRoom: (c: Conn, room: { code: string; joined: string[] }) => {
        room.joined.push(c.name);
        c.roomCode = room.code;
      },
    } as unknown as GameHub;
    s.queue.rand = () => 0.99;
    s.queue.trackPool = () => ['track-a', 'track-b'];
  });
  afterEach(() => s.close());

  const racer = (name: string): Conn =>
    ({
      name,
      accountId: s.accounts.login(name).account.id,
      roomCode: null,
      closed: false,
      rttMs: 20,
      sendJson: () => {},
    }) as unknown as Conn;

  it('the track pool is every race track, never a surf map', () => {
    expect(raceTrackPool()).toEqual(
      raceMaps()
        .filter((m) => !m.surf)
        .map((m) => m.id),
    );
    expect(raceTrackPool()).toEqual(['race-sunspire', 'race-neon', 'race-ember']);
  });

  it('gathers 2+ racers for 20 s after the 2nd joined, then starts one ranked race room', () => {
    const a = racer('Q1');
    expect(s.queue.set(a, 'race')).toBeNull();
    clock += 60_000;
    s.queue.tick();
    expect(rooms.length).toBe(0); // alone: keeps waiting
    const b = racer('Q2');
    s.queue.set(b, 'race');
    clock += 10_000;
    const c = racer('Q3');
    s.queue.set(c, 'race');
    s.queue.tick();
    expect(rooms.length).toBe(0);
    clock += 10_000; // 20 s since the 2nd racer joined
    s.queue.tick();
    expect(rooms.length).toBe(1);
    expect(rooms[0].opts).toMatchObject({ mode: 'race', ranked: true, map: 'track-b' });
    expect(rooms[0].joined).toEqual(['Q1', 'Q2', 'Q3']);
    expect(s.queue.size('race')).toBe(0);
    expect(s.queue.takeRaceRoster(rooms[0].code)!.map((r) => r.name)).toEqual(['Q1', 'Q2', 'Q3']);
    expect(s.queue.takeRaceRoster(rooms[0].code)).toBeUndefined(); // handed out once
  });

  it('8 racers start at once; the 9th waits for the next race', () => {
    const cs = Array.from({ length: 9 }, (_, i) => racer(`Full${i}`));
    for (const c of cs) s.queue.set(c, 'race');
    s.queue.tick();
    expect(rooms.length).toBe(1);
    expect(rooms[0].joined.length).toBe(8);
    expect(s.queue.size('race')).toBe(1);
  });

  it('a real ranked race room: short lobby, one race, then it closes', () => {
    const hub = new GameHub({ log: () => {} });
    const room = hub.createRoom({ mode: 'race', map: TRACK, ranked: true })!;
    const rules = room.rules as RaceRules;
    expect(rules).toBeInstanceOf(RaceRules);
    expect(rules.st.settings.lobbySec).toBe(RACE_DEFAULTS.rankedLobbySec);
    expect(rules.onFinished).not.toBeNull();
    const casual = hub.createRoom({ mode: 'race', map: TRACK })!;
    expect((casual.rules as RaceRules).st.settings.lobbySec).toBe(RACE_DEFAULTS.lobbySec);
    hub.close();
  });
});

describe('Race ladder and personal bests', () => {
  let s: Services;
  let clock = 2_000_000;
  beforeEach(() => {
    s = createServices({ dbFile: ':memory:', log: () => {}, now: () => clock });
  });
  afterEach(() => s.close());
  const ids = (n: number, p = 'Racer') =>
    Array.from({ length: n }, (_, i) => s.accounts.login(`${p}${i}`).account.id);

  it('only ranked races change the Race rating; placement hides it for 5 races', () => {
    const [a, b, c] = ids(3);
    const priv = s.ranked.recordRace({
      ranked: false,
      record: record([
        { accountId: a, timeMs: 50_000 },
        { accountId: b, timeMs: 55_000 },
      ]),
    });
    expect(priv.get(a)!.delta).toBeNull();
    expect(s.ranked.rating(a, 'race').games).toBe(0);
    const r1 = s.ranked.recordRace({
      ranked: true,
      record: record([
        { accountId: a, timeMs: 50_000 },
        { accountId: b, timeMs: 55_000 },
        { accountId: c, timeMs: null }, // DNF
      ]),
    });
    expect(r1.get(a)!.delta).toBeGreaterThan(0);
    expect(r1.get(c)!.delta).toBeLessThan(0);
    // first race is a placement race (double K): winner of 3 even racers gets +32
    expect(r1.get(a)!.delta).toBeCloseTo(32, 5);
    expect(s.ranked.rating(a, 'race').rating.rating).toBeCloseTo(1032, 5);
    let st = s.ranked.profile(a)!.ladders.race;
    expect(st).toMatchObject({ rating: null, placement: { done: 1, need: 5, unit: 'races' } });
    for (let i = 0; i < 4; i++)
      s.ranked.recordRace({
        ranked: true,
        record: record([
          { accountId: a, timeMs: 50_000 },
          { accountId: b, timeMs: 55_000 },
        ]),
      });
    st = s.ranked.profile(a)!.ladders.race;
    expect(st.placed).toBe(true);
    expect(st.rating).toBeGreaterThan(1000);
    expect(st.rank!.color).toMatch(/^#/);
    expect(s.ranked.profile(a)!.ladders.race.wins).toBe(5);
    // the Race leaderboard lists placed racers by rating
    const board = s.ranked.leaderboard('race');
    expect(board[0].playerId).toBe(a);
    expect(board.some((r) => r.playerId === c)).toBe(false); // 1 race: not placed
    // races don't touch the other ladders
    expect(s.ranked.profile(a)!.ladders.premier.games).toBe(0);
    expect(s.ranked.profile(a)!.recentRaces[0]).toMatchObject({ track: TRACK, ranked: true });
  });

  it('bots never count and never get a best; a racer who left counts as last with a penalty', () => {
    const [a, b, gone] = ids(3, 'L');
    const res = s.ranked.recordRace({
      ranked: true,
      record: record([
        { accountId: null, timeMs: 40_000, bot: true },
        { accountId: a, timeMs: 50_000 },
        { accountId: b, timeMs: 60_000 },
      ]),
      // `gone` was sent in by the queue but never reached the start
      roster: [
        { accountId: a, name: 'L0' },
        { accountId: b, name: 'L1' },
        { accountId: gone, name: 'L2' },
      ],
    });
    expect(res.size).toBe(3);
    expect(res.get(gone)!.delta).toBeLessThan(res.get(b)!.delta!);
    // the leaver pays the leaver penalty on top of losing to both
    const tied = s.ranked.recordRace({
      ranked: true,
      record: record([
        { accountId: ids(1, 'T')[0], timeMs: 50_000 },
        { accountId: ids(1, 'U')[0], timeMs: null },
      ]),
    });
    expect(res.get(gone)!.delta! - [...tied.values()][1].delta!).toBeCloseTo(-10, 0);
    expect(s.ranked.trackLeaderboard(TRACK).map((r) => r.name)).not.toContain('R1');
  });

  it('personal bests are kept per track and only ever improve; track boards list one time each', () => {
    const [a, b] = ids(2, 'PB');
    const run = (acc: number, ms: number, track = TRACK) =>
      s.ranked
        .recordRace({ ranked: false, record: record([{ accountId: acc, timeMs: ms }], 1, track) })
        .get(acc)!;
    expect(run(a, 60_000)).toMatchObject({ newBest: true, bestMs: 60_000 });
    clock += 1000;
    expect(run(a, 65_000)).toMatchObject({ newBest: false, bestMs: 60_000 });
    expect(s.ranked.raceBest(a, TRACK)).toBe(60_000);
    clock += 1000;
    expect(run(a, 58_500)).toMatchObject({ newBest: true, bestMs: 58_500 });
    run(b, 59_000);
    // a DNF never sets a best
    s.ranked.recordRace({ ranked: false, record: record([{ accountId: b, timeMs: null }]) });
    expect(s.ranked.raceBest(b, TRACK)).toBe(59_000);
    const board = s.ranked.trackLeaderboard(TRACK);
    expect(board.map((r) => [r.playerId, r.timeMs])).toEqual([
      [a, 58_500],
      [b, 59_000],
    ]);
    // the profile shows every track (then the surf maps by mode), with your place on it
    const bests = s.ranked.profile(b)!.raceBests;
    expect(bests.map((x) => x.track)).toEqual([...raceTracks(), ...surfMaps()].map((m) => m.id));
    expect(bests.map((x) => x.track).sort()).toEqual(
      raceMaps()
        .map((m) => m.id)
        .sort(),
    );
    for (const x of bests) expect(x.mode).toBe(raceMaps().find((m) => m.id === x.track)!.mode);
    expect(bests.find((x) => x.track === TRACK)).toMatchObject({ timeMs: 59_000, position: 2 });
    const other = raceMaps().find((m) => m.id !== TRACK);
    if (other) expect(bests.find((x) => x.track === other.id)!.timeMs).toBeNull();
  });

  it('a new season pulls Race ratings 40% toward 1000 and restarts its placement', () => {
    const [a, b] = ids(2, 'S');
    for (let i = 0; i < 5; i++)
      s.ranked.recordRace({
        ranked: true,
        record: record([
          { accountId: a, timeMs: 50_000 },
          { accountId: b, timeMs: 51_000 },
        ]),
      });
    const before = s.ranked.rating(a, 'race').rating.rating;
    s.ranked.startNewSeason();
    expect(s.ranked.rating(a, 'race').rating.rating).toBeCloseTo(before + (1000 - before) * 0.4, 6);
    const p = s.ranked.profile(a)!;
    expect(p.ladders.race.rating).toBeNull();
    expect(p.pastSeasons.find((x) => x.ladder === 'race')).toMatchObject({
      season: 1,
      rating: Math.round(before),
    });
    expect(s.ranked.leaderboard('race', 50, 1)[0].playerId).toBe(a);
  });

  it('the hub hook: ranked race rooms rate and tell each racer; private rooms only store', () => {
    const [a, b] = ids(2, 'H');
    const sent: { id: number; msg: { t: string; data?: unknown } }[] = [];
    const member = (id: number) => ({
      accountId: id,
      conn: { sendJson: (msg: { t: string }) => sent.push({ id, msg }) },
    });
    const room = (ranked: boolean) =>
      ({ ranked, code: 'RACE1', humans: [member(a), member(b)] }) as unknown as Room;
    const rec = record([
      { accountId: a, timeMs: 50_000 },
      { accountId: b, timeMs: 52_000 },
    ]);
    s.hub.onRaceEnd!(room(false), rec);
    expect(s.ranked.rating(a, 'race').games).toBe(0);
    const notice = sent.find((x) => x.id === a && x.msg.t === 'raceRating')!.msg.data as {
      delta: number | null;
      newBest: boolean;
    };
    expect(notice).toMatchObject({ delta: null, newBest: true });
    sent.length = 0;
    s.hub.onRaceEnd!(room(true), rec);
    expect(s.ranked.rating(a, 'race').games).toBe(1);
    const n2 = sent.find((x) => x.id === a && x.msg.t === 'raceRating')!.msg.data as {
      delta: number;
    };
    expect(n2.delta).toBeGreaterThan(0);
  });

  it('the API serves the Race board and per-track times', async () => {
    const res = (path: string) => {
      let status = 0;
      let body: unknown = null;
      const r = {
        writeHead: (st: number) => (status = st),
        end: (b: string) => (body = JSON.parse(b)),
      };
      s.api({ url: path, method: 'GET' } as never, r as never);
      return { status, body: body as { rows: unknown[] } };
    };
    expect(res('/api/leaderboard?mode=race').status).toBe(200);
    expect(res(`/api/race-times?track=${TRACK}`).status).toBe(200);
    expect(res('/api/race-times?track=split-deck').status).toBe(400);
    // a removed surf map: no board (never another map's)
    expect(res('/api/race-times?track=surf-aurora').status).toBe(400);
  });

  it('old times on a removed map are ignored: no crash, not listed, no new bests', () => {
    const [a] = ids(1, 'Old');
    // (a best from back when surf-cinder was a map)
    s.db
      .prepare(
        'INSERT INTO race_bests (player_id, track, time_ms, splits, at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(a, 'surf-cinder', 99_000, '[]', clock);
    const p = s.ranked.profile(a)!;
    expect(p.raceBests.some((x) => x.track === 'surf-cinder')).toBe(false);
    // a race record naming a removed map is stored, but sets no personal best
    const n = s.ranked
      .recordRace({
        ranked: false,
        record: record([{ accountId: a, timeMs: 50_000 }], 1, 'surf-aurora'),
      })
      .get(a)!;
    expect(n.newBest).toBe(false);
    expect(s.ranked.raceBest(a, 'surf-aurora')).toBeNull();
    expect(() => s.ranked.profile(a)).not.toThrow();
  });
});

describe('migration 4 (races)', () => {
  it('adds the race tables to an existing database and keeps its data', () => {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof SqliteModule;
    const db: DatabaseSync = new DatabaseSync(':memory:');
    migrate(db, 3);
    db.prepare(
      "INSERT INTO players (id, name, token_hash, created_at, last_seen) VALUES (1, 'Old', 'h', 0, 0)",
    ).run();
    db.prepare(
      "INSERT INTO ratings (player_id, mode, rating, rd, vol, games, wins, last_played) VALUES (1, 'premier', 1234, 80, 0.06, 9, 6, 0)",
    ).run();
    migrate(db);
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(
      SCHEMA_VERSION,
    );
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(4); // (5: accounts & friends)
    for (const t of ['races', 'race_players', 'race_bests'])
      expect(
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(t),
      ).toBeTruthy();
    expect(
      (db.prepare("SELECT rating FROM ratings WHERE mode = 'premier'").get() as { rating: number })
        .rating,
    ).toBe(1234);
    db.close();
  });
});

describe('migrations 7 and 8 (rebuilt race tracks)', () => {
  it('clears the old bests of the three rebuilt tracks and keeps every other best', () => {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof SqliteModule;
    const db: DatabaseSync = new DatabaseSync(':memory:');
    migrate(db, 7);
    db.prepare(
      "INSERT INTO players (id, name, token_hash, created_at, last_seen) VALUES (1, 'Old', 'h', 0, 0)",
    ).run();
    const best = db.prepare(
      "INSERT INTO race_bests (player_id, track, time_ms, splits, at) VALUES (1, ?, 1000, '[]', 0)",
    );
    for (const t of ['race-sunspire', 'race-neon', 'race-ember', 'surf-copper-reef']) best.run(t);
    migrate(db);
    const left = db.prepare('SELECT track FROM race_bests').all() as { track: string }[];
    expect(left.map((r) => r.track)).toEqual(['surf-copper-reef']);
    db.close();
  });
});
