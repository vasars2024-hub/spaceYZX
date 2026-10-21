// A real game server (GameHub + rooms) and real network clients (NetCore) in one process,
// joined by virtual links and driven by a virtual clock. Each client runs a frame loop like
// the browser: update() (samples an input per new tick) and then "render", which reads the
// other players' interpolated positions — the positions the player sees and aims at.
import {
  NetCore,
  LevelBuilder,
  registerMap,
  netToPlayer,
  hitboxOf,
  lerp,
  v3,
  type GameConfig,
  type GameMode,
  type Hitbox,
  type Quat,
  type SimEvent,
  type Vec3,
} from '@space-yz/shared';
import { GameHub } from '../../packages/server/src/game/hub';
import type { Room } from '../../packages/server/src/game/room';
import { VirtualTime } from './virtual-time';
import { connectVirtual, type LinkOptions } from './virtual-net';

/** An empty, flat hall (no cover): every miss or hit is down to the netcode alone. */
export const ARENA = 'netcheck-arena';
registerMap({
  id: ARENA,
  name: 'Netcheck Arena',
  competitive: false,
  build: () => {
    const b = new LevelBuilder();
    b.room(v3(-60, 0, -40), v3(60, 20, 40), 1);
    return b.build({
      name: 'Netcheck Arena',
      boundsMin: v3(-62, -2, -42),
      boundsMax: v3(62, 22, 42),
      defaultGravity: v3(0, -1, 0),
      zones: [],
      rails: [],
      pads: [],
      spawns: [
        { pos: v3(-20, 0, 0), yawDeg: -90, team: 0 },
        { pos: v3(20, 0, 0), yawDeg: 90, team: 1 },
      ],
      towers: [],
    });
  },
});

/** What a client showed on its last rendered frame. */
export interface Shown {
  /** server tick the other players were drawn at */
  renderTick: number;
  hitboxes: Map<number, Hitbox>;
  /** other players' Boomerangs as drawn (by owner) */
  boomerangs: Map<number, Vec3>;
  /** grenades as drawn (by id), and for how many frames each has been on screen */
  grenades: Map<number, Vec3>;
  grenadeAge: Map<number, number>;
}

export interface TickSample {
  buttons: number;
  view: Quat;
}

export interface VClient {
  name: string;
  core: NetCore;
  /** the last rendered frame (null before the first) */
  shown: Shown | null;
  /**
   * For every input tick: what was on screen when that tick's input was sampled (inputs
   * can be delayed a few ticks by ping equalization — this follows them).
   */
  seenAt: Map<number, Shown>;
  sample: (c: VClient) => TickSample;
  setLink(link: LinkOptions): void;
  stop(): void;
}

export interface HarnessOptions {
  config?: GameConfig;
  lagComp?: boolean;
  equalizeMaxMs?: number;
}

export class Harness {
  readonly vt = new VirtualTime().install();
  readonly hub: GameHub;
  readonly clients: VClient[] = [];
  /** called after every server tick of every room (world.events = that tick's events) */
  onServerTick: ((room: Room, events: SimEvent[]) => void) | null = null;
  private nextIp = 1;

  constructor(opts: HarnessOptions = {}) {
    this.hub = new GameHub({
      config: opts.config ? () => structuredClone(opts.config!) : undefined,
      lagComp: opts.lagComp,
      equalizeMaxMs: opts.equalizeMaxMs,
      log: () => {},
    });
  }

  /** Create a room directly on the server (like the browser's "create room"). */
  createRoom(mode: GameMode = 'practice', map = ARENA): Room {
    const room = this.hub.createRoom({ mode, map })!;
    const tick = room.tick.bind(room);
    room.tick = () => {
      tick();
      this.onServerTick?.(room, room.world.events);
    };
    return room;
  }

  addClient(
    name: string,
    link: LinkOptions,
    sample: (c: VClient) => TickSample,
    opts: { fps?: number; roomCode?: string } = {},
  ): VClient {
    const ip = `10.0.0.${this.nextIp++}`;
    let setLink: (l: LinkOptions) => void = () => {};
    const core = new NetCore({
      url: 'virtual',
      name,
      now: () => performance.now(),
      createSocket: () => {
        const c = connectVirtual(this.hub, { seed: this.nextIp * 7919, ...link }, ip);
        setLink = c.setLink;
        return c.socket;
      },
    });
    const client: VClient = {
      name,
      core,
      shown: null,
      seenAt: new Map(),
      sample,
      setLink: (l) => setLink(l),
      stop: () => {},
    };
    core.onMessage = (msg) => {
      if (msg.t === 'welcome' && opts.roomCode) core.joinRoom(opts.roomCode);
    };
    core.connect();
    // mirror of NetCore's input-delay queue, so we know which frame each tick's input saw
    const queue: Shown[] = [];
    const empty: Shown = {
      renderTick: 0,
      hitboxes: new Map(),
      boomerangs: new Map(),
      grenades: new Map(),
      grenadeAge: new Map(),
    };
    const frameMs = 1000 / (opts.fps ?? 120);
    let last = performance.now();
    const frame = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (core.state !== 'room' || !core.ctx) return;
      core.update(dt, () => {
        queue.push(client.shown ?? empty);
        while (queue.length > core.inputDelay + 1) queue.shift();
        client.seenAt.set(coreTick(core), queue[0]);
        if (client.seenAt.size > 600) client.seenAt.delete(coreTick(core) - 600);
        return client.sample(client);
      });
      client.shown = render(core, client.shown);
    }, frameMs);
    const ping = setInterval(() => core.pingServer(), 1000);
    client.stop = () => {
      clearInterval(frame);
      clearInterval(ping);
      core.close();
    };
    this.clients.push(client);
    return client;
  }

  /** Advance virtual time. */
  run(ms: number): void {
    this.vt.advance(ms);
  }

  /** Run until `done()` or the time limit; returns whether it finished. */
  runUntil(done: () => boolean, maxMs: number, stepMs = 5): boolean {
    for (let t = 0; t < maxMs; t += stepMs) {
      if (done()) return true;
      this.vt.advance(stepMs);
    }
    return done();
  }

  dispose(): void {
    for (const c of this.clients) c.stop();
    this.hub.close();
    this.vt.uninstall();
  }
}

/** The tick whose input is being sampled right now (NetCore increments before sampling). */
const coreTick = (core: NetCore): number =>
  (core as unknown as { lastSentTick: number }).lastSentTick;

/** What the renderer draws this frame: others, their Boomerangs and grenades, interpolated. */
const render = (core: NetCore, prev: Shown | null): Shown => {
  const shown: Shown = {
    renderTick: core.renderTick(),
    hitboxes: new Map(),
    boomerangs: new Map(),
    grenades: new Map(),
    grenadeAge: new Map(),
  };
  const snap = core.latest;
  if (!snap) return shown;
  // grenades: interpolated between the two snapshots around the render tick (like the game)
  const ss = core.snapshots;
  let a = ss[0];
  let b = ss[0];
  for (let i = ss.length - 1; i >= 0; i--)
    if (ss[i].tick <= shown.renderTick) {
      a = ss[i];
      b = ss[i + 1] ?? ss[i];
      break;
    }
  if (a && b) {
    const t = b.tick > a.tick ? Math.min(1, (shown.renderTick - a.tick) / (b.tick - a.tick)) : 0;
    for (const ga of a.grenades) {
      if (ga.phase !== 0) continue;
      const gb = b.grenades.find((g) => g.id === ga.id) ?? ga;
      shown.grenades.set(ga.id, lerp(ga.pos, gb.pos, t));
      shown.grenadeAge.set(ga.id, (prev?.grenadeAge.get(ga.id) ?? 0) + 1);
    }
  }
  for (const [id] of snap.players) {
    if (id === core.localId) continue;
    const ip = core.interpolated(id);
    if (!ip || !ip.np.alive) continue;
    const p = netToPlayer(id, ip.np, core.config);
    p.pos = ip.pos;
    p.up = ip.up;
    shown.hitboxes.set(id, hitboxOf(p, core.config));
    const bp = core.interpolatedBoomerang(id);
    if (bp) shown.boomerangs.set(id, bp);
  }
  return shown;
};
