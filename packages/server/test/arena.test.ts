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
    services.queue.arenaGatherMs = 1500;
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

  it('queueing arena with several players starts one ranked arena room for all of them', async () => {
    const names = ['Q1', 'Q2', 'Q3'];
    const qs = names.map((n) => bot(`Arena${n}`, (core) => core.queueRanked('arena')));
    await until(() => qs.every((b) => b.core.state === 'room'), 10000);
    const code = qs[0].core.code;
    for (const b of qs) {
      expect(b.core.code).toBe(code);
      expect(b.core.mode).toBe('arena');
      expect(b.core.ranked).toBe(true);
    }
    const room = server.hub.rooms.get(code)!;
    expect(room.rules).toBeInstanceOf(ArenaRules);
    expect(room.humans.length).toBe(3);
    // a different kit queues separately: one player alone never starts
    const cs = bot('ArenaCS', (core) => core.queueRanked('arena', 'cs'));
    await wait(2500);
    expect(cs.core.state).toBe('lobby');
    expect(cs.core.queue.mode).toBe('arena');
    cs.core.queueRanked(null);
    // unknown queue names are refused
    const bad = bot('ArenaBad', (core) => core.queueRanked('practice'));
    await until(() => !!bad.core.queue.error);
    expect(bad.core.queue.error).toMatch(/Unknown mode/);
  }, 20000);

  it('a ranked arena rates each duel on the arena ladder, apart from 1v1', async () => {
    const pair = ['R1', 'R2'].map((n) => bot(`Arena${n}`, (core) => core.queueRanked('arena')));
    await until(() => pair.every((b) => b.core.state === 'room'), 10000);
    const room = server.hub.rooms.get(pair[0].core.code)!;
    const rules = room.rules as ArenaRules;
    // a short arena: one round
    Object.assign(rules.st.settings, {
      matchMin: 0.02,
      duelSec: 3,
      breakSec: 0.5,
      afterDuelSec: 0.2,
    });
    let result: ArenaResult | null = null;
    const record = rules.onResult!;
    rules.onResult = (r, x) => {
      result = x;
      record(r, x);
    };
    await until(() => result !== null, 15000);
    const res = result as unknown as ArenaResult;
    expect(res.duels.length).toBe(1);
    expect(res.standings[0].place).toBe(1);
    expect(res.standings[0].wins).toBe(1);
    const ids = res.standings.map((s) => s.accountId!);
    const winner = ids[0];
    const loser = ids[1];
    const w = services.ranked.rating(winner, 'arena');
    const l = services.ranked.rating(loser, 'arena');
    expect(w.games).toBe(1);
    expect(w.wins).toBe(1);
    expect(w.rating.rating).toBeGreaterThan(1500);
    expect(l.rating.rating).toBeLessThan(1500);
    // the normal 1v1 ladder is untouched
    expect(services.ranked.rating(winner, '1v1').games).toBe(0);
    const profile = services.ranked.profile(winner)!;
    expect(profile.modes.arena?.games).toBe(1);
    expect(profile.modes['1v1']).toBeUndefined();
    expect(profile.global.rating).toBeNull(); // the arena isn't part of the global rank
    expect(profile.recent[0]).toMatchObject({ mode: 'arena', ranked: true, won: true, place: 1 });
    // the leaderboard API knows the arena ladder
    const lb = await fetch(`http://127.0.0.1:${server.port}/api/leaderboard?mode=arena`);
    expect(lb.status).toBe(200);
    // the room closes after the results screen (12 s): not waited for here
  }, 30000);
});
