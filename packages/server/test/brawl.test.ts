// Public Brawl rooms (one-click Play): quick play joins the fullest public room with a free slot
// or opens a new one, bots keep public rooms at 8 players and leave as humans come, and the
// room moves on to the next map of the rotation after the results.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BrawlView, NetCore } from '@space-yz/shared';
import { PUBLIC_BRAWL, brawlMaps, nextBrawlMap } from '@space-yz/shared';
import { startGameServer, type GameServer } from '../src/app';
import type { Room } from '../src/game/room';
import { BrawlRules } from '../src/game/rules/brawl';
import { startHeadlessBot, type HeadlessBot } from '../../../tools/bots/headless';

let server: GameServer;
const clients: HeadlessBot[] = [];

beforeAll(async () => {
  server = await startGameServer({ port: 0, host: '127.0.0.1', assets: null, log: () => {} });
});

afterAll(async () => {
  for (const c of clients) c.stop();
  await server.close();
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean, ms = 8000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await wait(20);
  }
};

const url = () => `ws://127.0.0.1:${server.port}/ws`;

const client = (name: string, onReady: (c: NetCore) => void): HeadlessBot => {
  const c = startHeadlessBot({ url: url(), name, onReady });
  clients.push(c);
  return c;
};

/** A player pressing Play (TDM unless `ffa`). */
const quick = async (name: string, ffa = false): Promise<HeadlessBot> => {
  const c = client(name, (core) => core.quickPlay(ffa ? 'brawl-ffa' : 'brawl'));
  await until(() => c.core.state === 'room' || c.core.error !== null);
  return c;
};

const roomOf = (c: HeadlessBot): Room => server.hub.rooms.get(c.core.code)!;
const count = (room: Room) => ({
  humans: room.humans.length,
  bots: room.members.size - room.humans.length,
});
const brawlOf = (extra: unknown): BrawlView | null => {
  const x = extra as (BrawlView & { rules?: string }) | null;
  return x?.rules === 'brawl' ? x : null;
};

describe('quick play: public Brawl rooms', () => {
  it('opens a public room filled with bots; the next player joins the same room', async () => {
    const a = await quick('Ann');
    expect(a.core.error).toBeNull();
    expect(a.core.mode).toBe('brawl');
    expect(a.core.isPublic).toBe(true);
    const r1 = roomOf(a);
    expect(r1.isPublic).toBe(true);
    expect(r1.rules).toBeInstanceOf(BrawlRules);
    expect(r1.ranked).toBe(false);
    expect(r1.ctx.ffa).toBeFalsy();
    expect(r1.maxPlayers).toBe(PUBLIC_BRAWL.maxPlayers);
    expect(count(r1)).toEqual({ humans: 1, bots: PUBLIC_BRAWL.fillTo - 1 });
    await until(() => brawlOf(a.core.extra) !== null);
    expect(brawlOf(a.core.extra)!.variant).toBe('tdm');

    // a second player: the same room, a bot gives up its slot
    const b = await quick('Ben');
    expect(b.core.code).toBe(a.core.code);
    expect(count(r1)).toEqual({ humans: 2, bots: PUBLIC_BRAWL.fillTo - 2 });
    // the humans are spread over both teams
    expect(new Set(r1.humans.map((m) => m.team)).size).toBe(2);
    // leaving hands the slot back to a bot
    b.core.leaveRoom();
    await until(() => r1.humans.length === 1);
    expect(count(r1)).toEqual({ humans: 1, bots: PUBLIC_BRAWL.fillTo - 1 });
    a.core.leaveRoom();
    await until(() => !server.hub.rooms.has(r1.code));
  }, 30000);

  it('picks the fullest room with space, and opens a new one when all are full', async () => {
    const a = await quick('Cat');
    const r1 = roomOf(a);
    r1.maxPlayers = 1; // (full)
    const b = await quick('Dan');
    const r2 = roomOf(b);
    expect(r2.code).not.toBe(r1.code);
    expect(r2.isPublic).toBe(true);
    expect(count(r2)).toEqual({ humans: 1, bots: PUBLIC_BRAWL.fillTo - 1 });
    const c = await quick('Eve');
    expect(c.core.code).toBe(r2.code);
    r1.maxPlayers = PUBLIC_BRAWL.maxPlayers; // room again, but r2 has more people
    const d = await quick('Fay');
    expect(d.core.code).toBe(r2.code);
    expect(count(r2)).toEqual({ humans: 3, bots: PUBLIC_BRAWL.fillTo - 3 });
    expect(count(r1).humans).toBe(1);
    // the dashboard sees them
    const st = server.hub.publicBrawlStatus();
    expect(st.brawl.rooms).toBeGreaterThanOrEqual(2);
    expect(st.brawl.humans).toBeGreaterThanOrEqual(4);
    // past fillTo humans, no bots are left and the room grows up to its cap
    for (const m of [...r2.members.values()]) if (m.bot) r2.removeMember(m.id);
    expect(r2.members.size).toBe(3);
    for (const x of [a, b, c, d]) x.core.leaveRoom();
    await until(() => !server.hub.rooms.has(r1.code) && !server.hub.rooms.has(r2.code));
  }, 30000);

  it('FFA is its own playlist: the sim runs free-for-all, everyone else is drawn as an enemy', async () => {
    const t = await quick('Gus');
    const f = await quick('Hal', true);
    expect(f.core.mode).toBe('brawl-ffa');
    expect(f.core.code).not.toBe(t.core.code);
    const room = roomOf(f);
    expect(room.ctx.ffa).toBe(true);
    expect(room.vision.ffa).toBe(true);
    expect(f.core.ctx?.ffa).toBe(true);
    await until(() => f.core.roster.length === PUBLIC_BRAWL.fillTo && !!f.core.latest);
    // this client sees itself as team 0 and everyone else as team 1
    for (const p of f.core.roster) expect(p.team).toBe(p.id === f.core.localId ? 0 : 1);
    for (const [id, np] of f.core.latest!.players)
      expect(np.team).toBe(id === f.core.localId ? 0 : 1);
    await until(() => brawlOf(f.core.extra) !== null);
    expect(brawlOf(f.core.extra)!.target).toBe(20);
    t.core.leaveRoom();
    f.core.leaveRoom();
  }, 30000);

  it('after the results the room moves on to the next map, keeping its players', async () => {
    const a = await quick('Ivy');
    const room = roomOf(a);
    const rules = room.rules as BrawlRules;
    const first = room.map;
    const id = a.core.localId;
    const size = room.members.size;
    // the match ends and its results are over
    rules.st.scores = [rules.st.settings.tdmKills, 0];
    await until(() => rules.st.phase === 'end');
    rules.st.phaseEnds = room.world.tick + 2;
    await until(() => room.map !== first);
    expect(room.map).toBe(nextBrawlMap(first));
    expect(rules.st.phase).toBe('live');
    expect(rules.st.matchNo).toBe(2);
    expect(room.members.size).toBe(size);
    // the client was told: the new map, the same room and player id
    await until(() => a.core.map === room.map && !!a.core.predWorld);
    expect(a.core.code).toBe(room.code);
    expect(a.core.localId).toBe(id);
    expect(a.core.state).toBe('room');
    await until(() => brawlOf(a.core.extra)?.matchNo === 2);
    a.core.leaveRoom();
  }, 30000);

  it('private Brawl rooms: created like any room, only on rotation maps, never ranked', async () => {
    const a = client('Jon', (core) => core.createRoom('brawl-ffa', 'arena', 3, 'rookie'));
    await until(() => a.core.state === 'room');
    const room = roomOf(a);
    expect(room.isPublic).toBe(false);
    expect(room.map).not.toBe('arena');
    expect(brawlMaps().map((m) => m.id)).toContain(room.map);
    expect(room.ctx.ffa).toBe(true);
    expect(room.members.size).toBe(4);
    a.core.leaveRoom();
  }, 30000);
});
