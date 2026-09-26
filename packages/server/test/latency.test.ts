// Bot matches over real WebSockets at different simulated pings: prediction must stay
// correct (few corrections), inputs must arrive in time, hits must register, and lag
// compensation must stay inside its cap.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startGameServer, type GameServer } from '../src/app';
import { startHeadlessBot, type HeadlessBot } from '../../../tools/bots/headless';
import { MAX_REWIND_MS } from '../src/game/lagcomp';

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
const until = async (fn: () => boolean, ms = 8000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await wait(20);
  }
};

describe.each([20, 80, 150, 200])('bots at %i ms ping', (pingMs) => {
  it('predict cleanly, send inputs in time and register hits', async () => {
    const url = `ws://127.0.0.1:${server.port}/ws`;
    const sim = { delayMs: pingMs, jitterMs: pingMs * 0.05, lossPct: 0 };
    const a = startHeadlessBot({
      url,
      name: 'A',
      skill: 'hard',
      sim,
      onReady: (core) => core.createRoom('practice', 'training-bay'),
    });
    bots.push(a);
    await until(() => a.core.state === 'room');
    const b = startHeadlessBot({
      url,
      name: 'B',
      skill: 'hard',
      sim,
      onReady: (core) => core.joinRoom(a.core.code),
    });
    bots.push(b);
    await until(() => b.core.state === 'room' && !!b.core.localPredicted());
    const room = server.hub.rooms.get(a.core.code)!;
    await wait(1500); // clock sync settles
    let hits = 0;
    let shots = 0;
    let pulls = 0;
    room.onEvents = (ev) => {
      for (const e of ev) {
        if (e.type === 'hit') hits++;
        if (e.type === 'laserFire' || e.type === 'throw') shots++;
        if (e.type === 'grenadeActivate') pulls++;
      }
    };
    const t0 = room.world.tick;
    const c0 = a.core.corrections + b.core.corrections;
    const lateNow = () => [...room.members.values()].reduce((s, m) => s + m.lateInputs, 0);
    const late0 = lateNow();
    await wait(7000);
    const ticks = room.world.tick - t0;
    const corrections = a.core.corrections + b.core.corrections - c0;
    const late = lateNow() - late0;
    const avgRewind = room.rewinds ? room.rewindTicksSum / room.rewinds : 0;
    process.stderr.write(
      `ping ${pingMs} ms: ${ticks} ticks, corrections ${corrections}, grenade pulls ${pulls}, late inputs ${late}, shots ${shots}, hits ${hits}, ` +
        `rewinds ${room.rewinds} (avg ${(avgRewind * 16.7).toFixed(0)} ms), ` +
        `interp ${a.core.interpTicks.toFixed(1)} ticks, down ${(a.core.bytesIn / 7 / 1024).toFixed(1)} KB/s\n`,
    );
    expect(ticks).toBeGreaterThan(350);
    // reconciliation should be rare: well under one correction per second per client
    // (other players' grenade pulls are predicted too)
    expect(corrections).toBeLessThan(14);
    // inputs arrive before the server needs them (after the first second of clock sync)
    expect(late).toBeLessThan(ticks * 0.05);
    // bots fight: with enough shots, some must register (exact hit registration under lag
    // is tested deterministically in lagcomp.test.ts)
    if (shots >= 30) expect(hits).toBeGreaterThan(0);
    expect(avgRewind * (1000 / 60)).toBeLessThanOrEqual(MAX_REWIND_MS + 1);
    a.stop();
    b.stop();
  }, 25000);
});
