// Premier: the queue (5v5 with 10, 4v4 / 3v3 after a short wait), the map veto, opening
// hours, and the database migration from the old ladders.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type * as SqliteModule from 'node:sqlite';
import type { VetoView } from '@space-yz/shared';
import { getMap, mapDef } from '@space-yz/shared';
import { createServices, type Services } from '../src/services';
import { migrate, SCHEMA_VERSION } from '../src/services/db';
import { premierMapPool } from '../src/services/queue';
import { parseWindows, scheduleStatus, describeSchedule } from '../src/services/schedule';
import { RankedStore } from '../src/services/ranked';
import type { Conn } from '../src/game/conn';
import { GameHub } from '../src/game/hub';
import type { MatchRules } from '../src/game/rules/match';

interface FakeConn {
  conn: Conn;
  sent: { t: string; [k: string]: unknown }[];
  lastVeto(): VetoView | null | undefined;
}

describe('Premier queue and map veto', () => {
  let s: Services;
  let clock: number;
  let rooms: { opts: Record<string, unknown>; joined: [string, number][] }[];
  let conns: FakeConn[];

  beforeEach(() => {
    clock = new Date(2026, 8, 25, 12, 0).getTime(); // a Friday, noon
    s = createServices({ dbFile: ':memory:', log: () => {}, now: () => clock });
    rooms = [];
    conns = [];
    // a stand-in hub: records the rooms the queue starts
    s.queue.hub = {
      createRoom: (opts: Record<string, unknown>) => {
        const r = { opts, joined: [] as [string, number][], code: `R${rooms.length}` };
        rooms.push(r);
        return r;
      },
      joinRoom: (c: Conn, room: { code: string; joined: [string, number][] }, team: number) => {
        room.joined.push([c.name, team]);
        c.roomCode = room.code;
      },
    } as unknown as GameHub;
    s.queue.rand = () => 0;
    // a fixed pool of 4, so the test sees several bans whatever maps exist
    s.queue.mapPool = () => ['split-deck', 'kestrel', 'orbital-ring', 'map-four'];
    // (these tests are about the queue itself: no players-online rule)
    s.ranked.setThresholds({ premier: 0, 'premier-cs': 0 });
  });
  afterEach(() => s.close());

  const player = (name: string): FakeConn => {
    const id = s.accounts.login(name).account.id;
    const sent: FakeConn['sent'] = [];
    const conn = {
      name,
      accountId: id,
      roomCode: null,
      closed: false,
      rttMs: 20,
      sendJson: (m: { t: string }) => sent.push(m),
    } as unknown as Conn;
    const f: FakeConn = {
      conn,
      sent,
      lastVeto: () => {
        const v = [...sent].reverse().find((m) => m.t === 'veto');
        return v ? (v.data as VetoView | null) : undefined;
      },
    };
    conns.push(f);
    return f;
  };

  it('the veto pool is every competitive map with bomb sites', () => {
    const pool = premierMapPool();
    for (const id of ['split-deck', 'orbital-ring']) expect(pool).toContain(id);
    for (const id of pool) {
      expect(getMap(id).competitive).toBe(true);
      expect(mapDef(id).bombSites?.length).toBeGreaterThan(0);
    }
    expect(pool).not.toContain('training-bay');
    expect(pool).not.toContain('arena');
  });

  it('10 players: teams ban in turns, a timeout bans for you, the last map is played (5v5 Bomb)', () => {
    const ps = Array.from({ length: 10 }, (_, i) => player(`Prem${i}`));
    for (const p of ps) expect(s.queue.set(p.conn, 'premier')).toBeNull();
    s.queue.tick();
    expect(s.queue.size('premier')).toBe(0);
    expect(s.queue.vetoing()).toBe(10);
    const v0 = ps[0].lastVeto()!;
    expect(v0).toBeTruthy();
    expect(v0.teamSize).toBe(5);
    expect(v0.maps).toEqual(['split-deck', 'kestrel', 'orbital-ring', 'map-four']);
    expect(v0.teams[0].length + v0.teams[1].length).toBe(10);
    // queueing again during the veto is refused
    expect(s.queue.set(ps[0].conn, 'duels-1v1')).toMatch(/map veto/);
    const byTeam = (team: 0 | 1) => ps.filter((p) => p.lastVeto()!.yourTeam === team);
    // the wrong team can't ban
    expect(s.queue.ban(byTeam(1)[0].conn, v0.maps[0])).toMatch(/other team/);
    // team 0 bans, then team 1 lets its time run out (a map is banned for it)
    expect(s.queue.ban(byTeam(0)[2].conn, v0.maps[0])).toBeNull();
    let v = ps[0].lastVeto()!;
    expect(v.turn).toBe(1);
    expect(v.banned).toEqual([{ map: v0.maps[0], team: 0, auto: false }]);
    clock += 15_000;
    s.queue.tick();
    v = ps[0].lastVeto()!;
    expect(v.banned[1]).toMatchObject({ team: 1, auto: true });
    // alternate until one map is left
    let turns = 0;
    while (ps[0].lastVeto()!.picked === null && turns++ < 20) {
      const cur = ps[0].lastVeto()!;
      const left = cur.maps.filter((m) => !cur.banned.some((b) => b.map === m));
      expect(s.queue.ban(byTeam(cur.turn)[0].conn, left[0])).toBeNull();
    }
    const done = ps[0].lastVeto()!;
    const left = done.maps.filter((m) => !done.banned.some((b) => b.map === m));
    expect(left).toEqual([done.picked]);
    expect(done.banned.map((b) => b.team)).toEqual(done.banned.map((_, i) => i % 2));
    // the room: 5v5 ranked Bomb with the Boomerang kit on the map left over
    expect(rooms.length).toBe(1);
    expect(rooms[0].opts).toMatchObject({
      mode: '5v5',
      map: done.picked,
      ranked: true,
      objective: 'bomb',
      loadout: 'lethal',
    });
    expect(rooms[0].joined.length).toBe(10);
    expect(s.queue.vetoing()).toBe(0);
  });

  it('8 searching: a 4v4 after 10 s, not before', () => {
    const ps = Array.from({ length: 8 }, (_, i) => player(`Small${i}`));
    for (const p of ps) s.queue.set(p.conn, 'premier');
    s.queue.tick();
    clock += 9_000;
    s.queue.tick();
    expect(s.queue.vetoing()).toBe(0);
    expect(s.queue.size('premier')).toBe(8);
    clock += 1_000;
    s.queue.tick();
    expect(s.queue.vetoing()).toBe(8);
    expect(ps[0].lastVeto()!.teamSize).toBe(4);
    // run the veto out on the timer
    for (let i = 0; i < 10 && rooms.length === 0; i++) {
      clock += 15_000;
      s.queue.tick();
    }
    expect(rooms[0].opts).toMatchObject({ mode: '5v5', teamSize: 4, objective: 'bomb' });
    expect(rooms[0].joined.length).toBe(8);
  });

  it('someone leaving the veto sends the others back to searching', () => {
    const ps = Array.from({ length: 10 }, (_, i) => player(`Dodge${i}`));
    for (const p of ps) s.queue.set(p.conn, 'premier');
    s.queue.tick();
    expect(s.queue.vetoing()).toBe(10);
    s.queue.set(ps[3].conn, null); // walked out
    expect(ps[3].lastVeto()).toBeNull();
    expect(s.queue.vetoing()).toBe(0);
    expect(s.queue.size('premier')).toBe(9);
    expect(ps[0].lastVeto()).toBeNull();
    expect(rooms.length).toBe(0);
  });

  it('Duels start right away on the default map with Tower rules', () => {
    const [a, b] = [player('Duel1'), player('Duel2')];
    s.queue.set(a.conn, 'duels-1v1');
    s.queue.set(b.conn, 'duels-1v1');
    s.queue.tick();
    expect(rooms[0].opts).toMatchObject({ mode: '1v1', ranked: true, objective: 'tower' });
    expect(a.lastVeto()).toBeUndefined();
  });

  it('Premier refuses to queue while closed by its opening hours (Duels stay open)', () => {
    const windows = parseWindows('Fri-Sun 18:00-23:00')!;
    s.ranked.setSchedule({ mode: 'scheduled', windows });
    const p = player('Early');
    expect(s.queue.set(p.conn, 'premier')).toMatch(/closed/);
    expect(s.queue.size('premier')).toBe(0);
    const info = s.ranked.info();
    expect(info.premier.open).toBe(false);
    expect(info.premier.opensInSec).toBe(6 * 3600); // noon -> 18:00
    expect(info.premier.hours).toBe('Fri–Sun 18:00–23:00');
    expect(s.queue.set(p.conn, 'duels-2v2')).toBeNull();
    s.queue.set(p.conn, null);
    // opening time: queueing works; at closing time the queue is dropped
    clock += 6 * 3600_000;
    expect(s.queue.set(p.conn, 'premier')).toBeNull();
    expect(s.ranked.info().premier.closesInSec).toBe(5 * 3600);
    clock += 5 * 3600_000;
    s.queue.tick();
    expect(s.queue.size('premier')).toBe(0);
    expect(p.sent.some((m) => m.t === 'queue' && /closed/.test(String(m.error)))).toBe(true);
    // back to always open
    s.ranked.setSchedule({ mode: 'always', windows });
    expect(s.queue.set(p.conn, 'premier')).toBeNull();
  });
});

describe('Premier rooms', () => {
  it('a ranked Bomb room plays Bomb with the Boomerang kit; 4v4 starts with 4 per team', () => {
    const hub = new GameHub({ log: () => {} });
    const room = hub.createRoom({
      mode: '5v5',
      map: 'split-deck',
      ranked: true,
      objective: 'bomb',
      loadout: 'cs', // ranked never takes the CS kit
      teamSize: 4,
    })!;
    const rules = room.rules as MatchRules;
    expect(rules.ms.objective).toBe('bomb');
    expect(rules.ms.loadout).toBe('lethal');
    expect(rules.ms.rules.teamSize).toBe(4);
    const full = hub.createRoom({
      mode: '5v5',
      map: 'split-deck',
      ranked: true,
      objective: 'bomb',
    })!;
    expect((full.rules as MatchRules).ms.rules.teamSize).toBe(5);
    hub.close();
  });
});

describe('opening hours', () => {
  it('reads the hours the host types and finds the next opening', () => {
    expect(parseWindows('Fri-Sun 18:00-23:00; Wed 20:00-22:00')).toEqual([
      { days: [5, 6, 0], start: '18:00', end: '23:00' },
      { days: [3], start: '20:00', end: '22:00' },
    ]);
    expect(parseWindows('someday 18:00')).toBeNull();
    const s = { mode: 'scheduled' as const, windows: parseWindows('Sat 22:00-02:00')! };
    // Sunday 01:00 is still inside Saturday's late window
    expect(scheduleStatus(s, new Date(2026, 8, 27, 1, 0))).toEqual({
      open: true,
      opensInMs: null,
      closesInMs: 3600_000,
    });
    // Monday noon: next opening is Saturday 22:00
    const mon = scheduleStatus(s, new Date(2026, 8, 28, 12, 0));
    expect(mon.open).toBe(false);
    expect(mon.opensInMs).toBe((5 * 24 + 10) * 3600_000);
    expect(scheduleStatus({ mode: 'always', windows: [] }, new Date()).open).toBe(true);
    expect(scheduleStatus({ mode: 'scheduled', windows: [] }, new Date())).toEqual({
      open: false,
      opensInMs: null,
      closesInMs: null,
    });
    expect(describeSchedule({ mode: 'always', windows: s.windows })).toBe('');
  });
});

describe('migration from the old ladders', () => {
  it('Premier starts from old 5v5 (old scale -500), Duels from the better of 1v1 / 2v2', () => {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof SqliteModule;
    const db: DatabaseSync = new DatabaseSync(':memory:');
    migrate(db, 2); // the database as the old server left it
    const addPlayer = db.prepare(
      'INSERT INTO players (id, name, token_hash, created_at, last_seen) VALUES (?, ?, ?, 0, 0)',
    );
    addPlayer.run(1, 'Vet', 'h1');
    addPlayer.run(2, 'Duelist', 'h2');
    addPlayer.run(3, 'New', 'h3');
    const now = Date.now();
    const addRating = db.prepare(
      'INSERT INTO ratings (player_id, mode, rating, rd, vol, games, wins, last_played) VALUES (?, ?, ?, ?, 0.06, ?, ?, ?)',
    );
    addRating.run(1, '5v5', 1740, 80, 30, 18, now);
    addRating.run(1, '1v1', 1600, 90, 10, 6, now);
    addRating.run(1, 'arena', 1900, 90, 10, 6, now);
    addRating.run(2, '1v1', 1550, 70, 12, 7, now - 1000);
    addRating.run(2, '2v2', 1680, 60, 8, 5, now);
    migrate(db);
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(
      SCHEMA_VERSION,
    );
    const store = new RankedStore(db, () => now);
    // Premier: old 5v5 1740 -> 1240, placement starts over
    const vet = store.rating(1, 'premier');
    expect(vet.rating.rating).toBe(1240);
    expect(vet.rating.rd).toBe(80);
    expect(vet.seasonWins).toBe(0);
    expect(store.profile(1)!.ladders.premier.rating).toBeNull();
    // Duels: the better of 1v1 / 2v2, with the games of both
    expect(store.rating(1, 'duels').rating.rating).toBe(1600);
    const duelist = store.rating(2, 'duels');
    expect(duelist.rating.rating).toBe(1680);
    expect(duelist.rating.rd).toBe(60);
    expect(duelist.games).toBe(20);
    expect(duelist.wins).toBe(12);
    expect(store.rating(2, 'premier').rating.rating).toBe(1000); // no 5v5: fresh start
    // nobody played: defaults
    expect(store.rating(3, 'premier').rating.rating).toBe(1000);
    expect(store.rating(3, 'duels').rating.rating).toBe(1500);
    expect(store.season()).toBe(1);
    // old rows are kept (compatible), just unused
    expect(
      (
        db
          .prepare("SELECT COUNT(*) AS n FROM ratings WHERE mode IN ('1v1','2v2','5v5','arena')")
          .get() as {
          n: number;
        }
      ).n,
    ).toBe(5);
    db.close();
  });
});
