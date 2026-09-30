import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ArenaView, NetCore } from '@space-yz/shared';
import { createServices, type Services } from '../src/services';
import { startGameServer, type GameServer } from '../src/app';
import { ArenaRules, type ArenaResult } from '../src/game/rules/arena';
import { startHeadlessBot, type HeadlessBot } from '../../../tools/bots/headless';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean, ms = 8000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await wait(20);
  }
};
const arenaOf = (extra: unknown): ArenaView | null => {
  const x = extra as (ArenaView & { rules?: string }) | null;
  return x?.rules === 'arena' ? x : null;
};

describe('Arena 1v1 over WebSocket', () => {
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
  const url = () => `ws://127.0.0.1:${server.port}/ws`;
  const bot = (name: string, onReady: (core: NetCore) => void) => {
    const b = startHeadlessBot({ url: url(), name, onReady });
    bots.push(b);
    return b;
  };

  it('a private arena room: bots fill it, pits are paired, each client sees only its pit', async () => {
    const host = bot('ArenaHost', (core) =>
      core.createRoom('arena', 'split-deck', 5, 'casual', 'tower', 'cs'),
    );
    await until(() => host.core.state === 'room');
    expect(host.core.mode).toBe('arena');
    expect(host.core.map).toBe('arena'); // the arena picks its own map
    const room = server.hub.rooms.get(host.core.code)!;
    expect(room.rules).toBeInstanceOf(ArenaRules);
    expect(room.maxPlayers).toBe(8);
    expect(room.members.size).toBe(6);
    const rules = room.rules as ArenaRules;
    expect(rules.loadout).toBe('cs'); // CS kit
    expect(room.ctx.config.combat.loadout).toBe(1);
    // the host starts it now (3 s) instead of waiting out the warmup
    await until(() => arenaOf(host.core.extra) !== null);
    host.core.sendJson({ t: 'startMatch' });
    await until(() => arenaOf(host.core.extra)?.phase === 'break', 6000);
    const v = arenaOf(host.core.extra)!;
    expect(v.duels.length).toBe(3);
    const mine = v.duels.find((d) => d.ids.includes(host.core.localId))!;
    expect(mine).toBeDefined();
    // snapshots carry only the players of your own pit (you + your opponent)
    await wait(300);
    const ids = [...host.core.latest!.players.keys()];
    expect(ids).toContain(host.core.localId);
    for (const id of ids) expect(mine.ids).toContain(id);
    // teams follow the duel sides
    const side = mine.ids.indexOf(host.core.localId);
    expect(room.members.get(host.core.localId)!.team).toBe(side);
  }, 20000);

  it('the Arena has no ranked queue any more (it stays a casual room mode)', async () => {
    const q = bot('ArenaQ', (core) => core.sendJson({ t: 'queue', mode: 'arena' as never }));
    await until(() => !!q.core.queue.error);
    expect(q.core.queue.error).toMatch(/Unknown ranked queue/);
    expect(q.core.queue.mode).toBeNull();
    expect(q.core.state).toBe('lobby');
  });

  it('a finished arena is recorded in the match history without any rating', () => {
    const a = services.accounts.login('ArenaHist1').account.id;
    const b = services.accounts.login('ArenaHist2').account.id;
    const row = (id: number, accountId: number, place: number) => ({
      id,
      accountId,
      name: `P${id}`,
      bot: false,
      place,
      wins: place === 1 ? 1 : 0,
      losses: place === 1 ? 0 : 1,
      kills: 1,
      deaths: 1,
      damage: 100,
      left: false,
    });
    const result: ArenaResult = {
      mode: 'arena',
      loadout: 'lethal',
      reason: 'time',
      rounds: 1,
      durationSec: 60,
      standings: [row(1, a, 1), row(2, b, 2)],
      duels: [{ round: 1, a: 1, b: 2, winner: 1, reason: 'kill' as never }],
    };
    services.ranked.recordArena({ map: 'arena', result });
    const p = services.ranked.profile(a)!;
    expect(p.recent[0]).toMatchObject({ mode: 'arena', ranked: false, won: true, place: 1 });
    expect(p.ladders.duels.games).toBe(0);
    expect(p.ladders.premier.games).toBe(0);
  });
});
