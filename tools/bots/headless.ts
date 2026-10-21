// Headless bot clients: join a server over WebSocket and play with the shared bot brains.
// Used by integration tests and the load test. Usage:
//   npx tsx tools/bots/headless.ts --url ws://localhost:7777/ws --bots 4 --room ABC123
import {
  NetCore,
  botThink,
  createBotMemory,
  BOT_SKILLS,
  type BotMemory,
  type GameMode,
  type SocketLike,
} from '@space-yz/shared';

export interface HeadlessBot {
  core: NetCore;
  mem: BotMemory | null;
  stop(): void;
}

export const startHeadlessBot = (opts: {
  url: string;
  name: string;
  skill?: keyof typeof BOT_SKILLS;
  onReady?: (core: NetCore) => void;
  sim?: { delayMs: number; jitterMs: number; lossPct: number };
}): HeadlessBot => {
  const core = new NetCore({
    url: opts.url,
    name: opts.name,
    now: () => performance.now(),
    createSocket: (u) => new WebSocket(u) as unknown as SocketLike,
    sim: opts.sim,
    schedule: (fn, ms) => void setTimeout(fn, ms),
  });
  const bot: HeadlessBot = { core, mem: null, stop: () => {} };
  core.onMessage = (msg) => {
    if (msg.t === 'welcome') opts.onReady?.(core);
  };
  core.connect();
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    if (core.state !== 'room') return;
    core.update(dt, () => {
      const w = core.predWorld;
      const me = core.localPredicted();
      if (!w || !me || !core.ctx) return { buttons: 0, view: { x: 0, y: 0, z: 0, w: 1 } };
      bot.mem ??= createBotMemory(core.localId, BOT_SKILLS[opts.skill ?? 'normal'], core.localId);
      const inp = botThink(w, core.ctx, me, bot.mem);
      return { buttons: inp.buttons, view: inp.view };
    });
  }, 8);
  const pinger = setInterval(() => core.pingServer(), 500);
  bot.stop = () => {
    clearInterval(timer);
    clearInterval(pinger);
    core.close();
  };
  return bot;
};

const arg = (name: string, def: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const main = (): void => {
  const url = arg('url', 'ws://localhost:7777/ws');
  const count = Number(arg('bots', '2'));
  const room = arg('room', '');
  const mode = arg('mode', '1v1') as GameMode;
  let code = room;
  const bots: HeadlessBot[] = [];
  const spawn = (i: number): void => {
    bots.push(
      startHeadlessBot({
        url,
        name: `Headless${i + 1}`,
        onReady: (core) => {
          if (!code && i === 0) {
            core.onMessage = (msg) => {
              if (msg.t === 'roomJoined') {
                code = msg.code;
                console.log(`Room ${code} created — other bots joining`);
                for (let k = 1; k < count; k++) spawn(k);
              }
            };
            core.createRoom(mode);
          } else core.joinRoom(code);
        },
      }),
    );
  };
  spawn(0);
  if (room) for (let k = 1; k < count; k++) spawn(k);
  setInterval(() => {
    const s = bots.map(
      (b) =>
        `${b.core.name}: ${b.core.state} snaps=${b.core.snapshotsIn} rtt=${Math.round(b.core.rttMs)}`,
    );
    console.log(s.join(' | '));
  }, 3000);
};

if (process.argv[1] && /bots[\\/]headless\.ts$/.test(process.argv[1])) main();
