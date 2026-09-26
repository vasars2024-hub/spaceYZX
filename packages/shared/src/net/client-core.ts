// Platform-neutral network client (browser game and headless bots): connection, clock sync,
// input sending, prediction + reconciliation, and a snapshot buffer for interpolation.
import type { Vec3 } from '../math/vec3';
import { v3, sub, len, add, scale } from '../math/vec3';
import type { GameConfig, LoadoutName } from '../config';
import { mergeConfig, defaultConfig } from '../config';
import type { Level } from '../level/level';
import { buildLevel } from '../level/level';
import { mapDef } from '../level/maps/index';
import type { SimContext } from '../sim/context';
import type { PlayerInput } from '../sim/input';
import type { PlayerState, WorldState } from '../sim/state';
import type { SimEvent } from '../sim/events';
import type { Hitbox } from '../sim/hitbox';
import { interpNetPlayer, interpObjectPos, netHitbox, netToBoomerang, netToPlayer } from './interp';
import { createWorld, stepPredict } from '../sim/world';
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
  type RoomMode,
  type RoomPlayerInfo,
  type RtcSignal,
} from './protocol';
import { PROTOCOL_VERSION } from '../version';
import { MAX_REWIND_MS } from './lag-limits';
import { DEFAULT_BOT_SKILL } from '../bots/brain';

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
  'launch',
  'portal',
  'thruster',
  'jetpack',
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
  'twinThrow',
  'powerupPickup',
  'gunReload',
  'gunDraw',
]);

/**
 * Events of your own actions that prediction shows instantly and the server later reports
 * again: the server's copy is dropped when a predicted twin exists (same key, same tick ± a
 * few), so beams, hit markers and deflect sounds play once. Unmatched server events (things
 * prediction didn't see coming) still play.
 */
const echoKey = (e: SimEvent): string | null => {
  switch (e.type) {
    case 'hit':
      return `hit:${e.attacker}:${e.victim}`;
    case 'laserFire':
      return `laserFire:${e.player}`;
    case 'gunFire':
      return `gunFire:${e.player}`;
    case 'deflect':
      return `deflect:${e.player}:${e.boomerang}`;
    case 'recallStart':
    case 'recallGo':
      return `${e.type}:${e.boomerang}`;
    case 'wallHit':
    case 'wallBounce':
      return `${e.type}:${e.boomerang}`;
    case 'grenadeActivate':
    case 'grenadePop':
      return `${e.type}:${e.grenade}`;
    case 'blast':
      return `blast:${e.boomerang}`;
    case 'shieldBreak':
      return `shieldBreak:${e.attacker}:${e.victim}`;
    case 'twinBounce':
    case 'twinEnd':
      return `${e.type}:${e.twin}`;
    default:
      return null;
  }
};
const ECHO_TOLERANCE_TICKS = 4;

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
  queue: { mode: RoomMode | null; waitSec: number; searching: number; error?: string } = {
    mode: null,
    waitSec: 0,
    searching: 0,
  };
  /** why the server took us out of the last room (null = we left ourselves) */
  roomLeftReason: string | null = null;
  // room
  code = '';
  /** the room's mode ('arena': Arena 1v1, its state arrives in `extra` with rules 'arena') */
  mode: RoomMode = 'practice';
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
  private delayQueue: {
    buttons: number;
    view: { x: number; y: number; z: number; w: number };
    /** the server tick other players were drawn at when this input was sampled */
    seen: number;
  }[] = [];
  /** The tick other players were drawn at on the last rendered frame (null: no renderer). */
  shownTick: number | null = null;
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
  /** predicted events the server will echo (see echoKey) */
  private echoes: { key: string; tick: number }[] = [];
  // stats
  bytesIn = 0;
  snapshotsIn = 0;
  corrections = 0;
  lastLead = 0;
  onMessage: (msg: ServerMsg) => void = () => {};
  /** extra message listeners (chat, voice), called after onMessage */
  private listeners = new Set<(msg: ServerMsg) => void>();
  /** power-ups your prediction picked up that the server hasn't taken away yet (id -> tick) */
  predictedPickups = new Map<number, number>();
  /** Debug/test hook: called after each forward prediction step (not for replays). */
  onPredicted: ((world: WorldState, input: PlayerInput) => void) | null = null;

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

  /**
   * Join (mode) or leave (null) the ranked queue. 'arena' = the Arena 1v1 ladder; `loadout`
   * picks its kit ('lethal' Boomerang, 'cs' AK + Deagle; players only meet the same kit).
   */
  queueRanked(mode: RoomMode | null, loadout?: LoadoutName): void {
    this.sendJson(mode ? { t: 'queue', mode, ...(loadout ? { loadout } : {}) } : { t: 'unqueue' });
  }

  /** Create a room ('arena': an Arena 1v1 room — `map` is ignored, bots fill it up to 8). */
  createRoom(
    mode: RoomMode,
    map?: string,
    bots = 0,
    botSkill: string = DEFAULT_BOT_SKILL,
    objective: 'tower' | 'bomb' = 'tower',
    loadout: LoadoutName = 'lethal',
  ): void {
    this.sendJson({ t: 'createRoom', mode, map, bots, botSkill, objective, loadout });
  }

  /**
   * While dead: ask to take over a bot teammate. The server swaps the bodies; your exact own
   * state arrives in the next snapshot with a 'takeover' event, and prediction carries on
   * from the new body.
   */
  takeOver(botId: number): void {
    this.sendJson({ t: 'takeover', target: botId });
  }

  joinRoom(code: string): void {
    this.sendJson({ t: 'joinRoom', code });
  }

  /** Listen to server messages (besides onMessage); returns the unsubscribe function. */
  listen(fn: (msg: ServerMsg) => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  /** Text chat to your team (team = true) or everyone in the room. */
  sendChat(text: string, team: boolean): void {
    this.sendJson({ t: 'chat', text, team });
  }

  /** Voice signaling to another human in the room (relayed by the server). */
  sendRtc(to: number, data: RtcSignal): void {
    this.sendJson({ t: 'rtc', to, data });
  }

  /** Push-to-talk state (so others can show who's talking). */
  sendVoice(on: boolean, all: boolean): void {
    this.sendJson({ t: 'voice', on, all });
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
    this.shownTick = null;
    this.echoes = [];
    this.predictedPickups.clear();
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
    for (const fn of this.listeners) fn(msg);
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
    // a picked-up power-up is gone from the server's list: forget it (and if the server still
    // has it a second later, the prediction was wrong: show it again)
    for (const [id, t] of this.predictedPickups)
      if (!snap.powerups?.some((u) => u.id === id) || snap.tick > t + 60)
        this.predictedPickups.delete(id);
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
    this.echoes = this.echoes.filter((x) => x.tick > snap.tick - 120);
    if (snap.events)
      for (const e of snap.events) {
        const mine = 'player' in e && (e as { player: number }).player === this.localId;
        if (mine && PREDICTED_EVENTS.has(e.type)) continue;
        const key = echoKey(e);
        if (key) {
          const i = this.echoes.findIndex(
            (x) => x.key === key && Math.abs(x.tick - snap.tick) <= ECHO_TOLERANCE_TICKS,
          );
          if (i >= 0) {
            this.echoes.splice(i, 1);
            continue;
          }
        }
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
    // your own grenades: exact private state (flight + fuse) so they predict correctly
    const ownGrenades = snap.own?.grenades;
    w.grenades = snap.grenades
      .filter((g) => !ownGrenades || g.owner !== this.localId)
      .map((g) => ({ ...g }));
    if (ownGrenades)
      w.grenades.push(...ownGrenades.map((g) => ({ ...g, pos: { ...g.pos }, vel: { ...g.vel } })));
    // your own Double-boomerang twins: exact (predicted like your Boomerang); others' twins are
    // only drawn (interpolatedTwin), never simulated here
    w.twins = (snap.own?.twins ?? []).map((t) => JSON.parse(JSON.stringify(t)) as typeof t);
    // power-ups lying around (your own pick-up is predicted)
    w.powerups = (snap.powerups ?? []).map((u) => ({ ...u, pos: { ...u.pos } }));
    for (const z of snap.zones)
      if (w.zones[z.index]) w.zones[z.index] = { override: z.dir, until: z.until };
    return w;
  }

  private reconcile(snap: SnapshotData): void {
    const before = this.localPredicted();
    const w = this.worldFromSnapshot(snap);
    this.pending = this.pending.filter((i) => i.tick > snap.ackInput);
    for (const inp of this.pending) stepPredict(w, this.localId, inp, this.predictCtx(inp));
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
      } else if (dist >= 3) {
        // a teleport (respawn, taking over a bot): draw the eye at the new spot right away,
        // not sliding over from the old one until the next predicted tick
        this.correction = v3();
        const at = { pos: after.pos, up: after.up, eye: eyePos(after, this.config.movement) };
        this.prevLocal = at;
        this.curLocal = at;
      }
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
      // what the player was looking at while choosing this input: the last drawn frame
      const seen = this.shownTick ?? Math.round((this.serverNow() - this.interpTicks) * 4) / 4;
      this.delayQueue.push({ ...sample(), seen });
      while (this.delayQueue.length > this.inputDelay + 1) this.delayQueue.shift();
      const raw = this.delayQueue[0];
      const input: PlayerInput = {
        tick: this.lastSentTick,
        buttons: raw.buttons,
        view: netView(raw.view),
        // how far in the past the others were drawn (incl. any input delay): lag compensation.
        // Rounded like the wire format, so prediction judges hits exactly like the server.
        viewLag: Math.min(63.75, Math.round(Math.max(0, this.lastSentTick - raw.seen) * 4) / 4),
      };
      this.pending.push(input);
      if (this.pending.length > 240) this.pending.shift();
      // resend the last 2 inputs too: cheap insurance against delayed packets
      const recent = this.pending.slice(-3);
      this.sendBinary(encodeInput({ ack: this.lastAck, inputs: recent }));
      if (this.predWorld) {
        const me = this.localPredicted();
        if (me) this.prevLocal = { pos: me.pos, up: me.up, eye: eyePos(me, this.config.movement) };
        stepPredict(this.predWorld, this.localId, input, this.predictCtx(input));
        this.events.push(...this.predWorld.events);
        for (const e of this.predWorld.events) {
          const key = echoKey(e);
          if (key) this.echoes.push({ key, tick: input.tick });
          if (e.type === 'powerupPickup') this.predictedPickups.set(e.id, input.tick);
        }
        this.onPredicted?.(this.predWorld, input);
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

  /**
   * The server tick other players are drawn at right now. Snapped to quarter ticks — the
   * resolution inputs report it in — so the server's lag compensation rewinds to exactly the
   * frame you saw.
   */
  renderTick(): number {
    const t = Math.round((this.serverNow() - this.interpTicks) * 4) / 4;
    this.shownTick = t;
    return t;
  }

  /** Interpolated public state of another player at render time. */
  interpolated(id: number): { np: NetPlayer; pos: Vec3; up: Vec3 } | null {
    return this.playerAt(id, this.renderTick());
  }

  /** Interpolated Boomerang positions of others. */
  interpolatedBoomerang(owner: number): Vec3 | null {
    return this.boomerangAt(owner, this.renderTick());
  }

  /** The two buffered snapshots around a (fractional) server tick, and the blend factor. */
  private around(tick: number): { a: SnapshotData; b: SnapshotData; t: number } | null {
    let a: SnapshotData | null = null;
    let b: SnapshotData | null = null;
    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      const s = this.snapshots[i];
      if (s.tick <= tick) {
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
    const span = b.tick - a.tick;
    return { a, b, t: span > 0 ? Math.max(0, Math.min(1, (tick - a.tick) / span)) : 0 };
  }

  /** Another player's public state as drawn at `tick`. */
  playerAt(id: number, tick: number): { np: NetPlayer; pos: Vec3; up: Vec3 } | null {
    const r = this.around(tick);
    if (!r) return null;
    const pa = r.a.players.get(id);
    const pb = r.b.players.get(id) ?? pa;
    if (!pa || !pb) return null;
    return interpNetPlayer(pa, pb, r.t);
  }

  /** Another player's Boomerang as drawn at `tick`. */
  boomerangAt(owner: number, tick: number): Vec3 | null {
    const r = this.around(tick);
    if (!r) return this.latest?.boomerangs.get(owner)?.pos ?? null;
    const ba = r.a.boomerangs.get(owner);
    const bb = r.b.boomerangs.get(owner) ?? ba;
    if (!ba || !bb) return null;
    return interpObjectPos(ba.pos, bb.pos, r.t);
  }

  /** Interpolated position of another player's grenade (render time). */
  interpolatedGrenade(id: number): Vec3 | null {
    return this.grenadeAt(id, this.renderTick());
  }

  /** Interpolated position of another player's Double-boomerang twin (render time). */
  interpolatedTwin(id: number): Vec3 | null {
    const r = this.around(this.renderTick());
    if (!r) return null;
    const ta = r.a.twins?.find((t) => t.id === id);
    const tb = r.b.twins?.find((t) => t.id === id) ?? ta;
    if (!ta || !tb) return null;
    return interpObjectPos(ta.pos, tb.pos, r.t);
  }

  /** A grenade as drawn at `tick`. */
  private grenadeAt(id: number, tick: number): Vec3 | null {
    const r = this.around(tick);
    if (!r) return null;
    const ga = r.a.grenades.find((g) => g.id === id);
    const gb = r.b.grenades.find((g) => g.id === id) ?? ga;
    if (!ga || !gb) return null;
    return interpObjectPos(ga.pos, gb.pos, r.t);
  }

  /** Hitboxes of the other players as drawn at `tick` (what you aim at). */
  private hitboxesAt(tick: number): Hitbox[] {
    const out: Hitbox[] = [];
    const snap = this.latest;
    if (!snap) return out;
    for (const [id] of snap.players) {
      if (id === this.localId) continue;
      const ip = this.playerAt(id, tick);
      if (ip && ip.np.alive) out.push(netHitbox(id, ip.np, ip.pos, ip.up, this.config));
    }
    return out;
  }

  /**
   * Context for predicting one of your own inputs: your hits are judged against the others
   * as they were drawn when you chose that input — exactly what the server's lag
   * compensation rewinds to — so predicted hit markers match the server's verdict.
   */
  private predictCtx(input: PlayerInput): SimContext {
    const ctx = this.ctx!;
    // the server never rewinds further than MAX_REWIND_MS: neither do we
    const maxLag = MAX_REWIND_MS / (TICK_DT * 1000);
    const seen = input.tick - Math.min(input.viewLag ?? 0, maxLag);
    let boxes: Hitbox[] | null = null;
    return {
      ...ctx,
      rewindHitboxes: (id) => (id === this.localId ? (boxes ??= this.hitboxesAt(seen)) : null),
      rewindPos: (id, kind, objId) =>
        id !== this.localId
          ? null
          : kind === 'boomerang'
            ? this.boomerangAt(objId, seen)
            : this.grenadeAt(objId, seen),
    };
  }
}

// deterministic-enough jitter source for the network simulator (not part of the sim)
let seed = 12345;
const pseudo = (): number => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return seed / 4294967296;
};
