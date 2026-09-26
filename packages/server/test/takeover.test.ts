// Taking over a bot teammate after dying, over real WebSockets: the server checks the request,
// swaps the bodies between ticks, and the client's prediction lands in the new body.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMatch, len, sub, type SimEvent, type Vec3 } from '@space-yz/shared';
import { startGameServer, type GameServer } from '../src/app';
import type { Room } from '../src/game/room';
import type { MatchRules } from '../src/game/rules/match';
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

/** Record what the server decided for every takeover request (and where the bodies were). */
const spyTakeOver = (room: Room): boolean[] => {
  const results: boolean[] = [];
  const orig = room.takeOver.bind(room);
  room.takeOver = (h, b) => {
    const pos = (id: number) => ({ ...room.world.players.find((p) => p.id === id)!.pos });
    const botBefore = pos(b);
    const r = orig(h, b);
    if (r) swaps.push({ botBefore, humanAfter: pos(h) });
    results.push(r);
    return r;
  };
  return results;
};
const swaps: { botBefore: Vec3; humanAfter: Vec3 }[] = [];

describe('taking over a bot teammate', () => {
  it('swaps bodies (and the Controller) for a dead human, and prediction follows', async () => {
    const a = startHeadlessBot({
      url: url(),
      name: 'Taker',
      onReady: (core) => core.createRoom('2v2', 'kestrel', 3, 'rookie'),
    });
    clients.push(a);
    await until(() => a.core.state === 'room');
    const room = server.hub.rooms.get(a.core.code)!;
    const rules = room.rules as MatchRules;
    const results = spyTakeOver(room);
    const me = a.core.localId;
    const human = room.members.get(me)!;
    const mate = [...room.members.values()].find((m) => m.bot && m.team === human.team)!;
    const enemy = [...room.members.values()].find((m) => m.team !== human.team)!;
    const P = (id: number) => room.world.players.find((p) => p.id === id)!;

    // skip warmup and the spawn lock
    startMatch(rules.ms, room.world, room.ctx);
    rules.ms.phaseEnds = room.world.tick + 1;
    await until(() => rules.ms.phase === 'live');
    // enemies stand still: nobody wins the round while we test
    for (const p of room.world.players) if (p.team !== human.team) p.frozen = true;
    rules.ms.controllers[human.team].carrier = mate.id;

    // alive: no
    a.core.takeOver(mate.id);
    await until(() => results.length === 1);
    expect(results[0]).toBe(false);

    const dead = P(me);
    dead.alive = false;
    dead.hp = 0;
    // an enemy: no
    a.core.takeOver(enemy.id);
    await until(() => results.length === 2);
    expect(results[1]).toBe(false);
    expect(P(enemy.id).alive).toBe(true);

    a.core.drainEvents();
    a.core.takeOver(mate.id);
    await until(() => results.length === 3);
    expect(results[2]).toBe(true);
    expect(P(me).alive).toBe(true);
    expect(swaps[0].humanAfter).toEqual(swaps[0].botBefore);
    expect(P(mate.id).alive).toBe(false);
    expect(rules.ms.controllers[human.team].carrier).toBe(me);
    // the brain stays with the bot's id (now the dead body); the human drives the new one
    expect(room.members.get(mate.id)!.bot).not.toBeNull();
    expect(room.members.get(me)!.bot).toBeNull();

    // the client hears about it and predicts from the new body right away
    const events: SimEvent[] = [];
    await until(() => {
      events.push(...a.core.drainEvents());
      return events.some((e) => e.type === 'takeover');
    });
    expect(events).toContainEqual({ type: 'takeover', player: me, bot: mate.id });
    const pred = a.core.localPredicted()!;
    expect(pred.alive).toBe(true);
    expect(len(sub(pred.pos, P(me).pos))).toBeLessThan(3);

    // the bot's brain can't bring its dead body back, and the new body keeps going
    await wait(300);
    expect(P(mate.id).alive).toBe(false);
    expect(P(me).alive).toBe(true);
    // a second request (now alive) is refused
    a.core.takeOver(mate.id);
    await until(() => results.length === 4);
    expect(results[3]).toBe(false);
  }, 20000);

  it('is not available in practice rooms or during the spawn lock', async () => {
    const a = startHeadlessBot({
      url: url(),
      name: 'Practicer',
      onReady: (core) => core.createRoom('practice', 'kestrel', 3, 'rookie'),
    });
    clients.push(a);
    await until(() => a.core.state === 'room');
    const room = server.hub.rooms.get(a.core.code)!;
    const results = spyTakeOver(room);
    const me = a.core.localId;
    const human = room.members.get(me)!;
    const mate = [...room.members.values()].find((m) => m.bot && m.team === human.team);
    expect(mate).toBeDefined();
    const p = room.world.players.find((q) => q.id === me)!;
    p.alive = false;
    p.hp = 0;
    a.core.takeOver(mate!.id);
    await until(() => results.length === 1);
    expect(results[0]).toBe(false);

    const b = startHeadlessBot({
      url: url(),
      name: 'Locked',
      onReady: (core) => core.createRoom('2v2', 'kestrel', 3, 'rookie'),
    });
    clients.push(b);
    await until(() => b.core.state === 'room');
    const room2 = server.hub.rooms.get(b.core.code)!;
    const rules = room2.rules as MatchRules;
    const results2 = spyTakeOver(room2);
    startMatch(rules.ms, room2.world, room2.ctx);
    expect(rules.ms.phase).toBe('spawnLock');
    const me2 = room2.world.players.find((q) => q.id === b.core.localId)!;
    me2.alive = false;
    me2.hp = 0;
    const mate2 = [...room2.members.values()].find(
      (m) => m.bot && m.team === room2.members.get(b.core.localId)!.team,
    )!;
    b.core.takeOver(mate2.id);
    await until(() => results2.length === 1);
    expect(results2[0]).toBe(false);
  }, 20000);
});
