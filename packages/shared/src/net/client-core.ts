// Platform-neutral network client (browser game and headless bots): connection, clock sync,
// input sending, prediction + reconciliation, and a snapshot buffer for interpolation.
import type { Vec3 } from '../math/vec3';
import { v3, lerp, sub, len, add, scale, normalize } from '../math/vec3';
import { qSlerp } from '../math/quat';
import type { GameConfig } from '../config';
import { mergeConfig, defaultConfig } from '../config';
import type { Level } from '../level/level';
import { buildLevel } from '../level/level';
import { mapDef } from '../level/maps/index';
import type { SimContext } from '../sim/context';
import type { PlayerInput } from '../sim/input';
import type { PlayerState, WorldState } from '../sim/state';
import type { BoomerangState } from '../sim/combat-state';
import type { SimEvent } from '../sim/events';
import { createWorld, createPlayer, newBoomerang, stepPredict } from '../sim/world';
import { eyePos } from '../sim/movement';
import { TICK_DT } from '../sim/constants';
import {
  decodeSnapshot,
  encodeInput,
  netView,
  parseJson,
  MSG_SNAPSHOT,
  type ClientMsg,
  type ServerMsg,
  type SnapshotData,
  type SnapshotBaseline,
  type NetPlayer,
  type NetBoomerang,
  type GameMode,
  type RoomPlayerInfo,
} from './protocol';
import { PROTOCOL_VERSION } from '../version';

export interface SocketLike {
  binaryType: string;
  readyState: number;
  send(data: string | ArrayBufferLike | Uint8Array): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface NetCoreOptions {
  url: string;
  name: string;
  token?: string;
  now: () => number; // ms
  createSocket: (url: string) => SocketLike;
  /** extra ticks of input lead to ask for (ping equalization, M6) */
  interpTicks?: number;
  /** Network simulator (dev): delay/jitter applied to outgoing and incoming messages. */
  sim?: { delayMs: number; jitterMs: number; lossPct: number };
  schedule?: (fn: () => void, ms: number) => void;
}

const PREDICTED_EVENTS = new Set([
  'jump',
  'land',
  'slide',
  'wallJump',
  'mantle',
  'railGrab',
  'railRelease',
  'thruster',
  'pushOff',
  'mag',
  'dash',
  'throw',
  'windupStart',
  'windupReady',
  'windupCancel',
  'slash',
  'laserWarn',
  'grenadeThrow',
  'catch',
  'pickup',
]);

export class NetCore {
  ws: SocketLike | null = null;
  state: 'connecting' | 'lobby' | 'room' | 'closed' = 'connecting';
  name = '';
  token: string | undefined;
  account: unknown = null;
  error: string | null = null;
  /** messages from the server to show the player (drained by the UI) */
  notices: string[] = [];
  /** ranked queue status */
  queue: { mode: GameMode | null; waitSec: number; searching: number; error?: string } = {
    mode: null,
    waitSec: 0,
    searching: 0,
  };
  /** why the server took us out of the last room (null = we left ourselves) */
  roomLeftReason: string | null = null;
  // room
  code = '';
  mode: GameMode = 'practice';
  map = '';
  ranked = false;
  level: Level | null = null;
  ctx: SimContext | null = null;
  config: GameConfig = defaultConfig();
  localId = 0;
  roster: RoomPlayerInfo[] = [];
  hostId = 0;
  extra: unknown = null;
  // snapshots
  private bySeq = new Map<number, SnapshotData>();
  snapshots: SnapshotData[] = [];
  latest: SnapshotData | null = null;
  private lastAck = 0;
  // clock
  rttMs = 0;
  jitterMs = 0;
  private offsets: { t: number; off: number }[] = [];
  clientTick = 0; // fractional: next tick to simulate is floor(clientTick)+1
  private lastSentTick = 0;
  dilation = 1;
  targetLead = 2;
  private lastJump = -1e9;
  private lastUpdateAt = 0;
  /** Ping equalization: sampled inputs are applied this many ticks later (server-assigned). */
  inputDelay = 0;
  private delayQueue: { buttons: number; view: { x: number; y: number; z: number; w: number } }[] =
    [];
  /** FIFO ordering for the network simulator (TCP never reorders). */
  private simLast = { in: 0, out: 0 };
  interpTicks: number;
  // prediction
  predWorld: WorldState | null = null;
  pending: PlayerInput[] = [];
  prevLocal: { pos: Vec3; up: Vec3; eye: Vec3 } | null = null;
  curLocal: { pos: Vec3; up: Vec3; eye: Vec3 } | null = null;
  correction = v3();
  // events
  private events: SimEvent[] = [];
  // stats
  bytesIn = 0;
  snapshotsIn = 0;
  corrections = 0;
  lastLead = 0;
  onMessage: (msg: ServerMsg) => void = () => {};

  private opts: NetCoreOptions;

  constructor(opts: NetCoreOptions) {
    this.opts = opts;
    this.name = opts.name;
    this.token = opts.token;
    this.interpTicks = opts.interpTicks ?? 4;
  }

  connect(): void {
    const ws = this.opts.createSocket(this.opts.url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.sendJson({ t: 'hello', v: PROTOCOL_VERSION, name: this.name, token: this.token });
      // measure the round trip right away: the clock sync on joining a room needs it
      this.pingServer();
    };
    ws.onmessage = (ev) => this.delayed(() => this.onData(ev.data), true);
    ws.onclose = () => {
      this.state = 'closed';
    };
    ws.onerror = () => {
      this.error ??= 'Could not connect to the server.';
    };
  }

  close(): void {
    this.state = 'closed';
    this.ws?.close();
  }

  /** Apply the network simulator (if enabled). */
  private delayed(fn: () => void, incoming: boolean): void {
    const sim = this.opts.sim;
    if (!sim || (sim.delayMs <= 0 && sim.jitterMs <= 0 && sim.lossPct <= 0) || !this.opts.schedule)
      return fn();
    let d = sim.delayMs / 2 + (pseudo() - 0.5) * 2 * sim.jitterMs;
    // TCP never drops: a "lost" packet is retransmitted about one RTT later (head-of-line stall)
    if (pseudo() * 100 < sim.lossPct) d += Math.max(40, sim.delayMs);
    // ...and never reorders: nothing arrives before what was sent earlier
    const now = this.opts.now();
    const key = incoming ? 'in' : 'out';
    const at = Math.max(now + Math.max(0, d), this.simLast[key]);
    this.simLast[key] = at;
    this.opts.schedule(fn, at - now);
  }

  /** Change nickname (the server answers with a new welcome). */
  rename(name: string): void {
    this.name = name;
    this.sendJson({ t: 'hello', v: PROTOCOL_VERSION, name, token: this.token });
  }

  sendJson(msg: ClientMsg): void {
    const text = JSON.stringify(msg);
    this.delayed(() => {
      if (this.ws && this.ws.readyState === 1) this.ws.send(text);
    }, false);
  }

  private sendBinary(bytes: Uint8Array): void {
    this.delayed(() => {
      if (this.ws && this.ws.readyState === 1) this.ws.send(bytes);
    }, false);
  }

  /** Join (mode) or leave (null) the ranked queue. */
  queueRanked(mode: GameMode | null): void {
    this.sendJson(mode ? { t: 'queue', mode } : { t: 'unqueue' });
  }

  createRoom(mode: GameMode, map?: string, bots = 0, botSkill = 'normal'): void {
    this.sendJson({ t: 'createRoom', mode, map, bots, botSkill });
  }

  joinRoom(code: string): void {
    this.sendJson({ t: 'joinRoom', code });
  }

  leaveRoom(): void {
    this.sendJson({ t: 'leaveRoom' });
    this.resetRoom();
    this.state = 'lobby';
  }

  private resetRoom(): void {
    this.level = null;
    this.ctx = null;
    this.predWorld = null;
    this.snapshots = [];
    this.bySeq.clear();
    this.latest = null;
    this.pending = [];
    this.lastAck = 0;
    this.inputDelay = 0;
    this.delayQueue = [];
  }

  private onData(data: unknown): void {
    if (typeof data === 'string') {
      const msg = parseJson<ServerMsg>(data, 1 << 20);
      if (msg) this.onJson(msg);
      return;
    }
    const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : (data as Uint8Array);
    this.bytesIn += buf.length;
    if (buf[0] === MSG_SNAPSHOT && this.ctx) this.onSnapshot(buf);
  }

  private onJson(msg: ServerMsg): void {
    switch (msg.t) {
      case 'sping':
        this.sendJson({ t: 'spong', s: msg.s });
        return;
      case 'pong': {
        const rtt = this.opts.now() - msg.c;
        if (rtt >= 0 && rtt < 5000) {
          this.jitterMs = this.jitterMs * 0.85 + Math.abs(rtt - this.rttMs) * 0.15;
          this.rttMs = this.rttMs === 0 ? rtt : this.rttMs * 0.8 + rtt * 0.2;
        }
        break;
      }
      case 'welcome':
        this.name = msg.name;
        this.account = msg.account ?? null;
        if (msg.token) this.token = msg.token;
        this.state = 'lobby';
        break;
      case 'roomJoined': {
        this.resetRoom();
        this.roomLeftReason = null;
        this.queue = { mode: null, waitSec: 0, searching: 0 };
        this.code = msg.code;
        this.mode = msg.mode;
        this.map = msg.map;
        this.ranked = msg.ranked;
        this.localId = msg.playerId;
        this.config = mergeConfig(defaultConfig(), msg.config);
        this.level = buildLevel(mapDef(msg.map));
        this.ctx = { level: this.level, config: this.config, dt: TICK_DT };
        const rttTicks = this.rttMs / (TICK_DT * 1000);
        this.clientTick = msg.tick + rttTicks + 6;
        this.lastSentTick = Math.floor(this.clientTick);
        this.state = 'room';
        break;
      }
      case 'notice':
        this.notices.push(msg.msg);
        if (this.notices.length > 20) this.notices.shift();
        break;
      case 'profile':
        this.account = msg.data;
        break;
      case 'queue':
        this.queue = {
          mode: msg.mode,
          waitSec: msg.waitSec,
          searching: msg.searching,
          error: msg.error,
        };
        break;
      case 'roomLeft':
        this.resetRoom();
        this.roomLeftReason = msg.reason;
        this.state = 'lobby';
        break;
      case 'netcfg':
        this.inputDelay = Math.max(0, Math.min(3, Math.floor(msg.inputDelay)));
        break;
      case 'room':
        this.roster = msg.players;
        this.hostId = msg.hostId;
        break;
      case 'error':
        this.error = msg.msg;
        break;
      case 'kicked':
        this.error = msg.reason;
        this.state = 'closed';
        break;
    }
    this.onMessage(msg);
  }

  pingServer(): void {
    this.sendJson({ t: 'ping', c: this.opts.now() });
  }

  // ---------------------------------------------------------------------------------------
  // snapshots, clock, reconciliation

  private onSnapshot(buf: Uint8Array): void {
    const snap = decodeSnapshot(buf, (seq): SnapshotBaseline | null => {
      const s = this.bySeq.get(seq);
      return s ? { players: s.players, boomerangs: s.boomerangs } : null;
    });
    this.snapshotsIn++;
    this.bySeq.set(snap.seq, snap);
    if (this.bySeq.size > 120) this.bySeq.delete(snap.seq - 120);
    this.snapshots.push(snap);
    if (this.snapshots.length > 90) this.snapshots.shift();
    this.latest = snap;
    this.lastAck = snap.seq;
    if (snap.extra !== null && snap.extra !== undefined) this.extra = snap.extra;
    // clock: best (least delayed) offset over the last ~2 s
    const now = this.opts.now();
    const off = snap.tick - now / (TICK_DT * 1000);
    this.offsets.push({ t: now, off });
    while (this.offsets.length && now - this.offsets[0].t > 2000) this.offsets.shift();
    // interpolation delay follows network jitter (slowly), unless fixed by the caller
    if (this.opts.interpTicks === undefined) {
      const want = Math.max(3, Math.min(8, 3 + Math.ceil(this.jitterMs / (TICK_DT * 1000))));
      this.interpTicks += Math.max(-0.02, Math.min(0.02, want - this.interpTicks));
    }
    // lead feedback -> time dilation
    this.lastLead = snap.lead;
    const err = this.targetLead + Math.ceil(this.jitterMs / (TICK_DT * 1000)) - snap.lead;
    if (err > 8 && now - this.lastJump > 500) {
      // far behind (inputs arriving late): jump ahead once, then fine-tune with dilation
      this.clientTick += err - 2;
      this.lastJump = now;
      this.dilation = 1;
    } else if (err < -60 && now - this.lastJump > 500) {
      // hugely ahead (e.g. after a stall): step back; drop inputs we will re-issue
      this.clientTick += err + 2;
      this.lastSentTick = Math.floor(this.clientTick);
      this.pending = this.pending.filter((i) => i.tick <= this.lastSentTick);
      this.lastJump = now;
      this.dilation = 1;
    } else this.dilation = 1 + Math.max(-0.15, Math.min(0.12, err * 0.03));
    // server events (skip ones we already predicted for ourselves)
    if (snap.events)
      for (const e of snap.events) {
        const mine = 'player' in e && (e as { player: number }).player === this.localId;
        if (mine && PREDICTED_EVENTS.has(e.type)) continue;
        this.events.push(e);
      }
    if (snap.own) this.reconcile(snap);
  }

  /** Server tick "now" (fractional), from the least-delayed recent snapshot. */
  serverNow(): number {
    if (!this.offsets.length) return this.latest?.tick ?? 0;
    let best = -Infinity;
    for (const o of this.offsets) best = Math.max(best, o.off);
    return this.opts.now() / (TICK_DT * 1000) + best;
  }

  private worldFromSnapshot(snap: SnapshotData): WorldState {
    const ctx = this.ctx!;
    const w = createWorld(ctx.level, 1);
    w.tick = snap.tick;
    for (const [id, np] of snap.players) {
      if (snap.own && id === this.localId) {
        w.players.push(snap.own.player);
        continue;
      }
      w.players.push(netToPlayer(id, np, this.config));
    }
    for (const [owner, nb] of snap.boomerangs) {
      if (snap.own && owner === this.localId && snap.own.boomerang)
        w.boomerangs.push(snap.own.boomerang);
      else w.boomerangs.push(netToBoomerang(owner, nb));
    }
    w.grenades = snap.grenades.map((g) => ({ ...g }));
    for (const z of snap.zones)
      if (w.zones[z.index]) w.zones[z.index] = { override: z.dir, until: z.until };
    return w;
  }

  private reconcile(snap: SnapshotData): void {
    const before = this.localPredicted();
    const w = this.worldFromSnapshot(snap);
    this.pending = this.pending.filter((i) => i.tick > snap.ackInput);
    for (const inp of this.pending) stepPredict(w, this.localId, inp, this.ctx!);
    // predicted events from replay are duplicates of ones we already showed: drop them
    w.events = [];
    this.predWorld = w;
    const after = this.localPredicted();
    if (before && after) {
      const d = sub(before.pos, after.pos);
      const dist = len(d);
      if (dist > 0.01 && dist < 3) {
        this.correction = add(this.correction, d); // render-smooth the snap
        this.corrections++;
      } else if (dist >= 3) this.correction = v3();
    }
  }

  localPredicted(): PlayerState | undefined {
    return this.predWorld?.players.find((p) => p.id === this.localId);
  }

  /**
   * Advance prediction by real time. `sample` provides the input for each new tick.
   * Returns the fractional progress into the current tick (for render interpolation).
   */
  update(
    frameDtSec: number,
    sample: () => { buttons: number; view: { x: number; y: number; z: number; w: number } },
  ): number {
    if (this.state !== 'room' || !this.ctx) return 0;
    // use the real clock, not the (possibly capped) frame time: slow PCs must not fall behind
    const now = this.opts.now();
    const realDt = this.lastUpdateAt ? Math.min(1, (now - this.lastUpdateAt) / 1000) : frameDtSec;
    this.lastUpdateAt = now;
    this.clientTick += realDt * 60 * this.dilation;
    let steps = 0;
    while (Math.floor(this.clientTick) > this.lastSentTick && steps < 30) {
      steps++;
      this.lastSentTick++;
      this.delayQueue.push(sample());
      while (this.delayQueue.length > this.inputDelay + 1) this.delayQueue.shift();
      const raw = this.delayQueue[0];
      const input: PlayerInput = {
        tick: this.lastSentTick,
        buttons: raw.buttons,
        view: netView(raw.view),
        // others are drawn at serverNow - interpTicks: tell the server for lag compensation
        viewLag: Math.max(0, this.lastSentTick - (this.serverNow() - this.interpTicks)),
      };
      this.pending.push(input);
      if (this.pending.length > 240) this.pending.shift();
      // resend the last 2 inputs too: cheap insurance against delayed packets
      const recent = this.pending.slice(-3);
      this.sendBinary(encodeInput({ ack: this.lastAck, inputs: recent }));
      if (this.predWorld) {
        const me = this.localPredicted();
        if (me) this.prevLocal = { pos: me.pos, up: me.up, eye: eyePos(me, this.config.movement) };
        stepPredict(this.predWorld, this.localId, input, this.ctx);
        this.events.push(...this.predWorld.events);
        const me2 = this.localPredicted();
        if (me2)
          this.curLocal = { pos: me2.pos, up: me2.up, eye: eyePos(me2, this.config.movement) };
      }
    }
    if (steps === 30) this.lastSentTick = Math.floor(this.clientTick);
    // decay render correction (~100 ms)
    this.correction = scale(this.correction, Math.pow(0.001, frameDtSec / 1));
    if (len(this.correction) < 0.002) this.correction = v3();
    return this.clientTick - Math.floor(this.clientTick);
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Interpolated public state of another player at render time. */
  interpolated(id: number): { np: NetPlayer; pos: Vec3; up: Vec3 } | null {
    const renderTick = this.serverNow() - this.interpTicks;
    let a: SnapshotData | null = null;
    let b: SnapshotData | null = null;
    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      const s = this.snapshots[i];
      if (s.tick <= renderTick) {
        a = s;
        b = this.snapshots[i + 1] ?? s;
        break;
      }
    }
    if (!a) {
      a = this.snapshots[0] ?? null;
      b = a;
    }
    if (!a || !b) return null;
    const pa = a.players.get(id);
    const pb = b.players.get(id) ?? pa;
    if (!pa || !pb) return null;
    const span = b.tick - a.tick;
    const t = span > 0 ? Math.max(0, Math.min(1, (renderTick - a.tick) / span)) : 0;
    const teleport = len(sub(pa.pos, pb.pos)) > 6;
    const pos = teleport ? pb.pos : lerp(pa.pos, pb.pos, t);
    const up = normalize(lerp(pa.up, pb.up, t), pb.up);
    const np = { ...(t < 0.5 ? pa : pb), view: qSlerp(pa.view, pb.view, t) };
    return { np, pos, up };
  }

  /** Interpolated Boomerang positions of others. */
  interpolatedBoomerang(owner: number): Vec3 | null {
    const renderTick = this.serverNow() - this.interpTicks;
    let a: SnapshotData | null = null;
    let b: SnapshotData | null = null;
    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      const s = this.snapshots[i];
      if (s.tick <= renderTick) {
        a = s;
        b = this.snapshots[i + 1] ?? s;
        break;
      }
    }
    if (!a || !b) return this.latest?.boomerangs.get(owner)?.pos ?? null;
    const ba = a.boomerangs.get(owner);
    const bb = b.boomerangs.get(owner) ?? ba;
    if (!ba || !bb) return null;
    const span = b.tick - a.tick;
    const t = span > 0 ? Math.max(0, Math.min(1, (renderTick - a.tick) / span)) : 0;
    if (len(sub(ba.pos, bb.pos)) > 8) return bb.pos;
    return lerp(ba.pos, bb.pos, t);
  }
}

export const netToPlayer = (id: number, np: NetPlayer, config: GameConfig): PlayerState => {
  const p = createPlayer(id, np.team as 0 | 1, v3(), 0, config);
  Object.assign(p, {
    alive: np.alive,
    hp: np.hp,
    pos: np.pos,
    vel: np.vel,
    up: np.up,
    view: np.view,
    move: np.move,
    crouched: np.crouched,
    grounded: np.grounded,
    windup: np.windup,
    windupHeld: np.windupHeld,
    aiming: np.aiming,
    laserWarn: np.laserWarn,
    laserCharges: np.laserCharges,
    slashTicks: np.slashTicks,
    mag: np.magOn ? v3(0, 1, 0) : null,
    grenadesLeft: np.grenadesLeft,
    kills: np.kills,
    deaths: np.deaths,
    teamKills: np.teamKills,
    frozen: np.frozen,
    dashTicks: np.dashTicks,
  });
  return p;
};

export const netToBoomerang = (owner: number, nb: NetBoomerang): BoomerangState => {
  const b = newBoomerang(owner, nb.pos);
  Object.assign(b, {
    phase: nb.phase,
    controller: nb.controller,
    pos: nb.pos,
    vel: nb.vel,
    windup: nb.windup,
    recallLethal: nb.recallLethal,
    recallFrom: nb.phase >= 4 ? nb.recallFrom : null,
    recallTo: nb.phase >= 4 ? nb.recallTo : null,
    steerLeft: nb.steerLeft,
    throwId: nb.throwId,
    t: nb.t,
  });
  return b;
};

// deterministic-enough jitter source for the network simulator (not part of the sim)
let seed = 12345;
const pseudo = (): number => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return seed / 4294967296;
};
