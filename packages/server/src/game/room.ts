// A Room runs one authoritative match: its own world, 60 Hz steps, input buffers per
// player, bots, rules, and delta-compressed snapshots to every client.
import type {
  BotMemory,
  GameConfig,
  GameMode,
  Level,
  PlayerInput,
  RoomPlayerInfo,
  SimContext,
  SimEvent,
  SnapshotBaseline,
  WorldState,
} from '@space-yz/shared';
import {
  buildLevel,
  createWorld,
  createPlayer,
  addPlayer,
  removePlayer,
  step,
  botThink,
  createBotMemory,
  BOT_SKILLS,
  mapDef,
  encodeSnapshot,
  publicState,
  zoneOverrides,
  netView,
  defaultConfig,
  TICK_DT,
} from '@space-yz/shared';
import type { Conn } from './conn';
import { LagHistory } from './lagcomp';
import { TeamVision } from './visibility';

export interface Member {
  id: number;
  name: string;
  team: 0 | 1;
  conn: Conn | null;
  bot: BotMemory | null;
  inputs: Map<number, PlayerInput>;
  last: PlayerInput | null;
  lastProcessed: number;
  ack: number;
  history: Map<number, SnapshotBaseline>;
  nextSeq: number;
  leads: number[];
  lateInputs: number;
  missedTicks: number;
  newestInput: number;
  ready: boolean;
  accountId: number | null;
  /** extra input delay (ticks) requested for ping equalization (M6) */
  equalizeTicks: number;
  joinedTick: number;
  sentExtra: string;
  /** (fractional) tick of the world this player was looking at with their latest input */
  viewTick: number;
  /** ping equalization: consecutive evaluations wanting a different delay (hysteresis) */
  equalizeVotes: number;
  /** last tick this player pressed anything or moved the mouse (AFK detection) */
  activeTick: number;
}

/** Game rules plug-in (practice respawns, rounds & objective, …). */
export interface Rules {
  readonly name: string;
  setup?(room: Room): void;
  afterStep(room: Room): void;
  /** JSON-able rules state for clients; called every tick, sent when it changes. */
  state?(room: Room): unknown;
  onJoin?(room: Room, m: Member): void;
  onLeave?(room: Room, m: Member): void;
  /** Can this player's inputs move/act right now? (spawn lock etc.) */
  finished?(room: Room): boolean;
  /** Players everyone may see through walls right now (never culled). */
  revealed?(room: Room): readonly number[];
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const makeRoomCode = (rand: () => number = Math.random): string =>
  Array.from({ length: 6 }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join('');

export interface RoomOptions {
  code: string;
  mode: GameMode;
  map: string;
  config?: GameConfig;
  ranked?: boolean;
  seed?: number;
  snapshotEvery?: number;
  /** exact private state is sent every N snapshots (reconciliation rate) */
  privateEvery?: number;
  maxPlayers?: number;
  /** server-side lag compensation (default on) */
  lagComp?: boolean;
  /** don't send enemies a team can't see (default on) */
  losCulling?: boolean;
}

export class Room {
  readonly code: string;
  readonly mode: GameMode;
  readonly map: string;
  readonly ranked: boolean;
  readonly level: Level;
  readonly ctx: SimContext;
  world: WorldState;
  members = new Map<number, Member>();
  rules: Rules | null = null;
  hostId = 0;
  snapshotEvery: number;
  privateEvery: number;
  maxPlayers: number;
  private nextPlayerId = 1;
  private pendingEvents: SimEvent[] = [];
  private tickCounter = 0;
  createdAt = Date.now();
  closed = false;
  onChanged: () => void = () => {};
  onEvents: ((events: SimEvent[]) => void) | null = null;
  /** bytes sent (for bandwidth stats) */
  bytesOut = 0;
  /** CPU time spent in tick() (ms) and ticks run, for the capacity estimate */
  tickMs = 0;
  ticksRun = 0;
  readonly history = new LagHistory();
  readonly vision = new TeamVision();
  /** lag compensation stats: rewinds served, and how far back in total (ticks) */
  rewinds = 0;
  rewindTicksSum = 0;

  constructor(opts: RoomOptions) {
    this.code = opts.code;
    this.mode = opts.mode;
    this.map = opts.map;
    this.ranked = !!opts.ranked;
    const config = opts.config ?? defaultConfig();
    this.level = buildLevel(mapDef(opts.map));
    this.ctx = { level: this.level, config, dt: TICK_DT };
    this.world = createWorld(this.level, opts.seed ?? Math.floor(Math.random() * 1e9));
    this.snapshotEvery = opts.snapshotEvery ?? 1;
    this.privateEvery = opts.privateEvery ?? 3;
    this.maxPlayers = opts.maxPlayers ?? (opts.mode === '1v1' ? 2 : opts.mode === '2v2' ? 4 : 10);
    if (opts.lagComp !== false) {
      this.ctx.rewindHitboxes = (id) => {
        const tick = this.rewindTick(id);
        if (tick === null) return null;
        this.rewinds++;
        this.rewindTicksSum += this.world.tick - tick;
        return this.history.hitboxesAt(tick);
      };
      this.ctx.rewindPos = (id, kind, objId) => {
        const tick = this.rewindTick(id);
        return tick === null ? null : this.history.posAt(kind, objId, tick);
      };
    }
    this.vision.enabled = opts.losCulling !== false;
  }

  /** The (clamped) tick a human player was seeing, or null for bots / no rewind needed. */
  private rewindTick(id: number): number | null {
    const m = this.members.get(id);
    if (!m?.conn) return null;
    const now = this.world.tick;
    const tick = this.history.clampTick(m.viewTick, now);
    return tick >= now - 0.01 ? null : tick;
  }

  get humans(): Member[] {
    return [...this.members.values()].filter((m) => m.conn);
  }

  teamCounts(): [number, number] {
    const c: [number, number] = [0, 0];
    for (const m of this.members.values()) c[m.team]++;
    return c;
  }

  private spawnFor(team: 0 | 1) {
    const spawns = this.level.def.spawns.filter((s) => s.team === undefined || s.team === team);
    return spawns[Math.floor(Math.random() * spawns.length)] ?? this.level.def.spawns[0];
  }

  /** Add a human (conn) or a bot (conn = null). */
  addMember(
    name: string,
    conn: Conn | null,
    opts: { team?: 0 | 1; botSkill?: string; accountId?: number | null } = {},
  ): Member {
    const [a, b] = this.teamCounts();
    const team = opts.team ?? (a <= b ? 0 : 1);
    const id = this.nextPlayerId++;
    const s = this.spawnFor(team);
    addPlayer(this.world, createPlayer(id, team, s.pos, s.yawDeg, this.ctx.config));
    const m: Member = {
      id,
      name,
      team,
      conn,
      bot: conn
        ? null
        : createBotMemory(
            id,
            BOT_SKILLS[(opts.botSkill as keyof typeof BOT_SKILLS) ?? 'normal'] ?? BOT_SKILLS.normal,
            id * 31 + this.world.tick,
          ),
      inputs: new Map(),
      last: null,
      lastProcessed: 0,
      ack: 0,
      history: new Map(),
      nextSeq: 1,
      leads: [],
      lateInputs: 0,
      missedTicks: 0,
      newestInput: 0,
      ready: !conn,
      accountId: opts.accountId ?? null,
      equalizeTicks: 0,
      joinedTick: this.world.tick,
      sentExtra: '',
      viewTick: this.world.tick,
      equalizeVotes: 0,
      activeTick: this.world.tick,
    };
    this.members.set(id, m);
    if (conn && !this.hostId) this.hostId = id;
    this.rules?.onJoin?.(this, m);
    this.onChanged();
    return m;
  }

  removeMember(id: number): void {
    const m = this.members.get(id);
    if (!m) return;
    this.rules?.onLeave?.(this, m);
    this.members.delete(id);
    removePlayer(this.world, id);
    if (this.hostId === id) this.hostId = this.humans[0]?.id ?? 0;
    this.onChanged();
  }

  /** Accept inputs from a client (validated by the caller's decoder). */
  receiveInputs(id: number, ack: number, inputs: PlayerInput[]): void {
    const m = this.members.get(id);
    if (!m) return;
    if (ack > m.ack && ack < m.nextSeq) m.ack = ack;
    const next = this.world.tick + 1;
    for (const inp of inputs) {
      // redundant resends of inputs we already have or already used: ignore quietly
      if (inp.tick <= m.lastProcessed || m.inputs.has(inp.tick)) continue;
      m.newestInput = Math.max(m.newestInput, inp.tick);
      const lead = inp.tick - next;
      m.leads.push(lead);
      if (m.leads.length > 30) m.leads.shift();
      if (inp.tick < next) {
        m.lateInputs++;
        continue; // too late: the server already simulated that tick
      }
      if (inp.tick > next + 120 || m.inputs.size > 180) continue; // client clock off: ignore
      m.inputs.set(inp.tick, {
        tick: inp.tick,
        buttons: inp.buttons,
        view: netView(inp.view),
        viewLag: Math.max(0, Math.min(64, inp.viewLag ?? 0)),
      });
    }
  }

  /** One authoritative 60 Hz step. */
  tick(): void {
    if (this.closed) return;
    const t0 = performance.now();
    this.tickInner();
    this.tickMs += performance.now() - t0;
    this.ticksRun++;
  }

  private tickInner(): void {
    const t = this.world.tick + 1;
    const inputs: Record<number, PlayerInput> = {};
    for (const m of this.members.values()) {
      if (m.bot) {
        const p = this.world.players.find((pp) => pp.id === m.id);
        if (p) inputs[m.id] = botThink(this.world, this.ctx, p, m.bot);
        continue;
      }
      const inp = m.inputs.get(t);
      if (inp) {
        const v = m.last?.view;
        if (
          inp.buttons !== 0 ||
          !v ||
          Math.abs(v.x - inp.view.x) + Math.abs(v.y - inp.view.y) + Math.abs(v.z - inp.view.z) >
            1e-4
        )
          m.activeTick = t;
        m.last = inp;
        m.lastProcessed = t;
        m.viewTick = t - (inp.viewLag ?? 0);
      } else {
        if (m.last) m.missedTicks++;
        m.viewTick += 1;
      }
      for (const k of m.inputs.keys()) if (k <= t) m.inputs.delete(k);
      if (m.last) inputs[m.id] = { tick: t, buttons: m.last.buttons, view: m.last.view };
    }
    step(this.world, inputs, this.ctx);
    this.rules?.afterStep(this);
    // what everyone is shown this tick: recorded for lag compensation, and sent
    const pub = publicState(this.world);
    this.history.record(this.world, this.ctx.config, pub);
    if (this.vision.enabled && this.humans.length)
      this.vision.update(this.world, this.ctx, this.rules?.revealed?.(this) ?? []);
    if (this.world.events.length) {
      this.pendingEvents.push(...this.world.events);
      this.onEvents?.(this.world.events);
    }
    if (++this.tickCounter % this.snapshotEvery === 0) this.sendSnapshots(pub);
  }

  private sendSnapshots(pub: ReturnType<typeof publicState>): void {
    const zones = zoneOverrides(this.world);
    const events = this.pendingEvents;
    this.pendingEvents = [];
    const rulesState = this.rules?.state?.(this);
    const rulesJson = rulesState === undefined ? '' : JSON.stringify(rulesState);
    for (const m of this.members.values()) {
      if (!m.conn) continue;
      const baseline = m.ack && m.history.has(m.ack) ? m.history.get(m.ack)! : null;
      const seq = m.nextSeq++;
      const own = this.world.players.find((p) => p.id === m.id) ?? null;
      // line-of-sight culling: leave out enemies this player's team can't see
      let players = pub.players;
      if (this.vision.enabled) {
        players = new Map();
        for (const [id, np] of pub.players)
          if (this.vision.visible(m.team, id, np.team as 0 | 1, this.world.tick))
            players.set(id, np);
      }
      const ownB = this.world.boomerangs.find((b) => b.owner === m.id) ?? null;
      const sendExtra = rulesJson !== '' && (rulesJson !== m.sentExtra || seq % 60 === 0);
      if (sendExtra) m.sentExtra = rulesJson;
      const bytes = encodeSnapshot(
        {
          seq,
          tick: this.world.tick,
          ackInput: m.lastProcessed,
          lead: m.leads.length ? Math.min(...m.leads) : 0,
          baseline: baseline ? m.ack : 0,
          players,
          boomerangs: pub.boomerangs,
          grenades: this.world.grenades,
          zones,
          own:
            own && seq % this.privateEvery === 0
              ? {
                  player: own,
                  boomerang: ownB,
                  grenades: this.world.grenades.filter((g) => g.owner === m.id),
                }
              : null,
          events,
          extra: sendExtra ? rulesState : null,
        },
        baseline,
      );
      m.history.set(seq, { players, boomerangs: pub.boomerangs });
      if (m.history.size > 90) m.history.delete(seq - 90);
      m.conn.sendBinary(bytes);
      this.bytesOut += bytes.length;
    }
  }

  info(): RoomPlayerInfo[] {
    return [...this.members.values()].map((m) => ({
      id: m.id,
      name: m.name,
      team: m.team,
      ping: m.conn ? Math.round(m.conn.rttMs) : 0,
      bot: !m.conn,
      ready: m.ready,
    }));
  }

  close(): void {
    this.closed = true;
  }
}
