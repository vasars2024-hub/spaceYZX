// Bot fill: bots hold empty slots in private rooms and give them up to humans who join.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startGameServer, type GameServer } from '../src/app';
import type { Room } from '../src/game/room';
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
const until = async (fn: () => boolean, ms = 5000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await wait(20);
  }
};

const url = () => `ws://127.0.0.1:${server.port}/ws`;

/** A human client that creates a room, or joins one by code. */
const human = (name: string, onReady: (c: HeadlessBot['core']) => void): HeadlessBot => {
  const c = startHeadlessBot({ url: url(), name, onReady });
  clients.push(c);
  return c;
};

const join = async (name: string, code: string): Promise<HeadlessBot> => {
  const c = human(name, (core) => core.joinRoom(code));
  await until(() => c.core.state === 'room' || c.core.error !== null);
  return c;
};

const count = (room: Room) => {
  const t = { humans: [0, 0], bots: [0, 0] };
  for (const m of room.members.values()) (m.conn ? t.humans : t.bots)[m.team]++;
  return t;
};

describe('bot fill in private rooms', () => {
  it('a bot leaves for each human who joins a full room, from the joining team', async () => {
    const a = human('Host', (core) => core.createRoom('2v2', 'kestrel', 3, 'rookie'));
    await until(() => a.core.state === 'room');
    const room = server.hub.rooms.get(a.core.code)!;
    expect(room.members.size).toBe(4);
    expect([...room.members.values()].filter((m) => m.bot).map((m) => m.bot!.skill.name)).toEqual([
      'rookie',
      'rookie',
      'rookie',
    ]);

    const b = await join('Guest', a.core.code);
    expect(b.core.state).toBe('room');
    expect(room.members.size).toBe(4);
    let t = count(room);
    // the humans are spread over both teams, each team keeps two players
    expect(t.humans).toEqual([1, 1]);
    expect(t.bots).toEqual([1, 1]);

    const c = await join('Third', a.core.code);
    expect(c.core.state).toBe('room');
    const d = await join('Fourth', a.core.code);
    expect(d.core.state).toBe('room');
    t = count(room);
    expect(t.humans).toEqual([2, 2]);
    expect(t.bots).toEqual([0, 0]);

    // a fifth human really is one too many
    const e = await join('Fifth', a.core.code);
    expect(e.core.state).not.toBe('room');
    expect(e.core.error).toMatch(/full/);

    // a human leaving hands the slot back to a bot (of the room's difficulty)
    d.core.leaveRoom();
    await until(() => room.humans.length === 3);
    t = count(room);
    expect(room.members.size).toBe(4);
    expect(t.humans[0] + t.bots[0]).toBe(2);
    expect(t.humans[1] + t.bots[1]).toBe(2);
    expect([...room.members.values()].find((m) => m.bot)!.bot!.skill.name).toBe('rookie');
  }, 20000);

  it('regression: 2 humans + 1 bot in a 2v2 is not full', async () => {
    const a = human('Anna', (core) => core.createRoom('2v2', 'kestrel', 1, 'casual'));
    await until(() => a.core.state === 'room');
    const room = server.hub.rooms.get(a.core.code)!;
    await join('Ben', a.core.code);
    expect(room.humans.length).toBe(2);
    expect(room.members.size).toBe(3); // 2 humans + 1 bot, one free slot
    const c = await join('Cleo', a.core.code);
    expect(c.core.error).toBeNull();
    expect(c.core.state).toBe('room');
    expect(room.humans.length).toBe(3);
    expect(room.members.size).toBe(4);
    // the room is full now, but the bot still gives up its slot to a fourth human
    const d = await join('Dan', a.core.code);
    expect(d.core.error).toBeNull();
    expect(d.core.state).toBe('room');
    expect(room.humans.length).toBe(4);
    expect(room.members.size).toBe(4);
    expect([...room.members.values()].some((m) => m.bot)).toBe(false);
    expect(room.teamCounts()).toEqual([2, 2]);
  }, 20000);

  it('unknown bot difficulties fall back to the default (casual)', async () => {
    const a = human('Picky', (core) => core.createRoom('1v1', 'kestrel', 1, 'godlike'));
    await until(() => a.core.state === 'room');
    const room = server.hub.rooms.get(a.core.code)!;
    const bot = [...room.members.values()].find((m) => m.bot)!;
    expect(bot.bot!.skill.name).toBe('casual');
    expect(room.members.size).toBe(2);
  });
});
