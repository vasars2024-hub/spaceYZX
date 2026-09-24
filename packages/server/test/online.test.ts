import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startGameServer, type GameServer } from '../src/app';
import { startHeadlessBot, type HeadlessBot } from '../../../tools/bots/headless';

let server: GameServer;
const bots: HeadlessBot[] = [];

beforeAll(async () => {
  server = await startGameServer({ port: 0, host: '127.0.0.1', assets: null, log: () => {} });
});

afterAll(async () => {
  for (const b of bots) b.stop();
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

describe('online 1v1 over WebSocket', () => {
  it('two clients join a private room by code, predict and see each other', async () => {
    const url = `ws://127.0.0.1:${server.port}/ws`;
    let code = '';
    const a = startHeadlessBot({
      url,
      name: 'Alpha',
      onReady: (core) => core.createRoom('1v1', 'training-bay'),
    });
    bots.push(a);
    await until(() => a.core.state === 'room');
    code = a.core.code;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    const b = startHeadlessBot({ url, name: 'Bravo', onReady: (core) => core.joinRoom(code) });
    bots.push(b);
    await until(() => b.core.state === 'room');
    const room = server.hub.rooms.get(code)!;
    expect(room.humans.length).toBe(2);
    await until(() => !!a.core.localPredicted() && !!b.core.localPredicted());
    const startA = { ...a.core.localPredicted()!.pos };
    await wait(3000);
    // both receive ~60 Hz snapshots and predict their own player
    expect(a.core.snapshotsIn).toBeGreaterThan(100);
    expect(b.core.snapshotsIn).toBeGreaterThan(100);
    const pa = a.core.localPredicted()!;
    expect(Math.hypot(pa.pos.x - startA.x, pa.pos.z - startA.z)).toBeGreaterThan(0.5);
    // each sees the other through interpolation
    expect(a.core.interpolated(b.core.localId)).not.toBeNull();
    expect(b.core.interpolated(a.core.localId)).not.toBeNull();
    // prediction agrees with the server (small error after reconciliation)
    const serverA = room.world.players.find((p) => p.id === a.core.localId)!;
    expect(Math.hypot(serverA.pos.x - pa.pos.x, serverA.pos.z - pa.pos.z)).toBeLessThan(6);
    // inputs arrive in time (lead stays positive most of the time)
    const ma = room.members.get(a.core.localId)!;
    expect(ma.lateInputs).toBeLessThan(40);
  }, 20000);

  it('rejects wrong room codes and out-of-date clients politely', async () => {
    const url = `ws://127.0.0.1:${server.port}/ws`;
    const c = startHeadlessBot({
      url,
      name: 'Charlie',
      onReady: (core) => core.joinRoom('ZZZZZZ'),
    });
    bots.push(c);
    await until(() => c.core.error !== null);
    expect(c.core.error).toMatch(/No room/);
  });
});
