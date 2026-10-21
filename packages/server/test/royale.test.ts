// Royale rooms: only on maps with royale data, free-for-all, bot fill starts the match, and a
// player who is out of the round is sent everyone (spectating) despite line-of-sight culling.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NetCore, RoyaleView } from '@space-yz/shared';
import { applyDamage, registerMap } from '@space-yz/shared';
import { startGameServer, type GameServer } from '../src/app';
import type { Room } from '../src/game/room';
import { RoyaleRules } from '../src/game/rules/royale';
import { startHeadlessBot, type HeadlessBot } from '../../../tools/bots/headless';
import { ROYALE_TEST_MAP, royaleTestMapInfo } from '../../shared/test/royale-map';

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
const until = async (fn: () => boolean, ms = 10000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await wait(20);
  }
};

const client = (name: string, onReady: (c: NetCore) => void): HeadlessBot => {
  const c = startHeadlessBot({ url: `ws://127.0.0.1:${server.port}/ws`, name, onReady });
  clients.push(c);
  return c;
};

const royaleOf = (extra: unknown): RoyaleView | null => {
  const x = extra as (RoyaleView & { rules?: string }) | null;
  return x?.rules === 'royale' ? x : null;
};

describe('Royale rooms', () => {
  it('accept Shibuya, the shipped Royale map', async () => {
    const c = client('Ann', (core) => core.createRoom('royale', 'shibuya', 0, 'rookie'));
    await until(() => c.core.error !== null || c.core.state === 'room');
    expect(c.core.error).toBeNull();
    expect(c.core.state).toBe('room');
    expect(c.core.map).toBe('shibuya');
    const room = server.hub.rooms.get(c.core.code)!;
    expect(room.rules).toBeInstanceOf(RoyaleRules);
    expect(room.level.def.royale?.spawns.length).toBeGreaterThanOrEqual(10);
  });

  it('a bot-filled room starts by itself; the dead see everyone', async () => {
    registerMap(royaleTestMapInfo());
    const c = client('Ben', (core) => core.createRoom('royale', ROYALE_TEST_MAP, 4, 'rookie'));
    await until(() => c.core.state === 'room');
    expect(c.core.mode).toBe('royale');
    expect(c.core.map).toBe(ROYALE_TEST_MAP);
    expect(c.core.ctx?.ffa).toBe(true);
    const room: Room = server.hub.rooms.get(c.core.code)!;
    expect(room.rules).toBeInstanceOf(RoyaleRules);
    expect(room.ranked).toBe(false);
    expect(room.members.size).toBe(5);
    // full (bot fill): the match starts after a short delay
    await until(() => royaleOf(c.core.extra)?.phase === 'countdown');
    const v = royaleOf(c.core.extra)!;
    expect(v.round).toBe(1);
    expect(v.entrants).toBe(5);
    expect(v.zone?.stages.length).toBeGreaterThan(0);
    // every other player is shown as an enemy
    expect(c.core.roster.filter((p) => p.id !== c.core.localId).every((p) => p.team === 1)).toBe(
      true,
    );
    await until(() => royaleOf(c.core.extra)?.phase === 'live');
    // out of the round: everyone still in it is sent to you (you spectate them)
    const rules = room.rules as RoyaleRules;
    const me = room.world.players.find((p) => p.id === c.core.localId)!;
    expect(rules.seesAll(room, me.id)).toBe(false);
    applyDamage(room.world, room.ctx, me.id, me, 9999, 'world', false, me.pos, me.pos);
    expect(rules.seesAll(room, me.id)).toBe(true);
    await until(() => {
      const alive = room.world.players.filter((p) => p.alive && p.id !== me.id).length;
      return (c.core.latest?.players.size ?? 0) - 1 >= alive && alive > 0;
    });
    await until(() => royaleOf(c.core.extra)?.out.some((o) => o.id === me.id) ?? false);
    expect(royaleOf(c.core.extra)!.out.find((o) => o.id === me.id)!.place).toBe(5);
  }, 30_000);
});
