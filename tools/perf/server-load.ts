// npm run load — server cost per tick and bandwidth per player for each mode, measured with
// headless bot clients over real WebSockets. These numbers feed the host dashboard's
// capacity estimate (packages/server/src/perf-budget.ts).
import { startGameServer } from '../../packages/server/src/app';
import { startHeadlessBot, type HeadlessBot } from '../bots/headless';
import type { GameMode } from '@space-yz/shared';

export interface LoadResult {
  mode: GameMode;
  players: number;
  tickMs: number; // server CPU per room per tick
  kbPerSecPerPlayer: number; // upload per connected player
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const measureMode = async (
  mode: '1v1' | '2v2' | '5v5',
  seconds = 10,
): Promise<LoadResult> => {
  const server = await startGameServer({ port: 0, host: '127.0.0.1', assets: null, log: () => {} });
  const url = `ws://127.0.0.1:${server.port}/ws`;
  const size = mode === '1v1' ? 2 : mode === '2v2' ? 4 : 10;
  const bots: HeadlessBot[] = [];
  try {
    const host = startHeadlessBot({
      url,
      name: 'Load1',
      onReady: (c) => c.createRoom(mode, 'kestrel'),
    });
    bots.push(host);
    while (host.core.state !== 'room') await wait(20);
    for (let i = 1; i < size; i++)
      bots.push(
        startHeadlessBot({ url, name: `Load${i + 1}`, onReady: (c) => c.joinRoom(host.core.code) }),
      );
    while (bots.some((b) => b.core.state !== 'room')) await wait(20);
    const room = server.hub.rooms.get(host.core.code)!;
    await wait(4000); // match start + warm-up
    const b0 = room.bytesOut;
    const ms0 = room.tickMs;
    const t0 = room.ticksRun;
    await wait(seconds * 1000);
    const ticks = room.ticksRun - t0;
    return {
      mode,
      players: size,
      tickMs: (room.tickMs - ms0) / Math.max(1, ticks),
      kbPerSecPerPlayer: (room.bytesOut - b0) / seconds / size / 1024,
    };
  } finally {
    for (const b of bots) b.stop();
    await server.close();
  }
};

if (process.argv[1]?.endsWith('server-load.ts')) {
  const seconds = Number(process.argv[process.argv.indexOf('--seconds') + 1]) || 10;
  for (const mode of ['1v1', '2v2', '5v5'] as const) {
    const r = await measureMode(mode, seconds);
    const rooms = Math.floor(((1000 / 60) * 0.7) / Math.max(0.001, r.tickMs));
    console.log(
      `  ${mode}: ${r.tickMs.toFixed(3)} ms CPU per tick per match · ${r.kbPerSecPerPlayer.toFixed(1)} KB/s upload per player` +
        ` · one CPU core fits ~${rooms} matches`,
    );
  }
}
