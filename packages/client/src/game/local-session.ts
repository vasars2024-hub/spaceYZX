// Offline session: the full simulation runs in the browser (movement playground, practice).
import type {
  GameConfig,
  Level,
  LevelDef,
  PlayerState,
  PlayerInput,
  SimEvent,
  Vec3,
  WorldState,
  SimContext,
  MatchState,
} from '@space-yz/shared';
import {
  buildLevel,
  createWorld,
  createPlayer,
  addPlayer,
  step,
  eyePos,
  lerp,
  clone,
  normalize,
  respawnPlayer,
  matchView,
  startMatch,
  canTakeOverInMatch,
  takeOverInMatch,
  TICK_DT,
} from '@space-yz/shared';
import type { MatchInfo, RenderPlayer, Session, TickInput } from './session';

export interface LocalSessionOptions {
  levelDef: LevelDef;
  config: GameConfig;
  seed?: number;
  /** Extra per-tick logic (bots, rules) run before stepping; returns their inputs. */
  extraInputs?: (world: WorldState, ctx: SimContext) => Record<number, PlayerInput>;
  afterStep?: (world: WorldState, ctx: SimContext) => void;
  setup?: (world: WorldState, ctx: SimContext) => void;
  names?: Record<number, string>;
  /** Offline match vs bots: rules state updated by `afterStep`. */
  match?: MatchState;
}

interface Snap {
  pos: Vec3;
  up: Vec3;
  eye: Vec3;
}

export class LocalSession implements Session {
  readonly level: Level;
  readonly config: GameConfig;
  readonly localId = 1;
  alpha = 0;
  ctx: SimContext;
  private w: WorldState;
  private acc = 0;
  private events: SimEvent[] = [];
  private prev = new Map<number, Snap>();
  private cur = new Map<number, Snap>();

  constructor(private opts: LocalSessionOptions) {
    this.level = buildLevel(opts.levelDef);
    this.config = opts.config;
    this.ctx = { level: this.level, config: this.config, dt: TICK_DT };
    this.w = createWorld(this.level, opts.seed ?? 1);
    const spawn =
      opts.levelDef.spawns.find((s) => s.team === undefined || s.team === 0) ??
      opts.levelDef.spawns[0];
    addPlayer(this.w, createPlayer(this.localId, 0, spawn.pos, spawn.yawDeg, this.config));
    opts.setup?.(this.w, this.ctx);
    this.snapshot(this.cur);
    this.snapshot(this.prev);
  }

  private snapshot(into: Map<number, Snap>, ids?: number[]): void {
    if (!ids) into.clear();
    for (const p of this.w.players)
      if (!ids || ids.includes(p.id))
        into.set(p.id, {
          pos: clone(p.pos),
          up: clone(p.up),
          eye: eyePos(p, this.config.movement),
        });
  }

  update(frameDt: number, sample: () => TickInput): void {
    this.acc += Math.min(frameDt, 0.25);
    let ticks = 0;
    while (this.acc >= TICK_DT && ticks < 8) {
      this.acc -= TICK_DT;
      ticks++;
      const input = sample();
      const inputs: Record<number, PlayerInput> = this.opts.extraInputs?.(this.w, this.ctx) ?? {};
      inputs[this.localId] = { tick: this.w.tick + 1, buttons: input.buttons, view: input.view };
      const [p, c] = [this.cur, this.prev];
      this.prev = p;
      this.cur = c;
      step(this.w, inputs, this.ctx);
      this.opts.afterStep?.(this.w, this.ctx);
      this.events.push(...this.w.events);
      this.snapshot(this.cur);
    }
    if (ticks === 8) this.acc = 0; // way behind (tab was hidden): don't spiral
    this.alpha = this.acc / TICK_DT;
  }

  local(): PlayerState | undefined {
    return this.w.players.find((p) => p.id === this.localId);
  }

  private interp(id: number, key: keyof Snap): Vec3 | undefined {
    const a = this.prev.get(id);
    const b = this.cur.get(id);
    if (!b) return undefined;
    if (!a) return b[key];
    // don't smear teleports
    const d =
      Math.abs(a.pos.x - b.pos.x) + Math.abs(a.pos.y - b.pos.y) + Math.abs(a.pos.z - b.pos.z);
    if (d > 5) return b[key];
    return lerp(a[key], b[key], this.alpha);
  }

  localEye(): Vec3 | undefined {
    return this.interp(this.localId, 'eye');
  }

  localUp(): Vec3 | undefined {
    const u = this.interp(this.localId, 'up');
    return u ? normalize(u) : undefined;
  }

  others(): RenderPlayer[] {
    const names = this.names();
    const m = this.opts.match;
    const carriers = new Set<number>(
      m ? m.controllers.map((c) => c.carrier).filter((id): id is number => id !== null) : [],
    );
    const revealed = new Set<number>(m?.revealed ?? []);
    return this.w.players
      .filter((p) => p.id !== this.localId)
      .map((p) => ({
        id: p.id,
        team: p.team,
        name: names[p.id] ?? `Bot ${p.id}`,
        pos: this.interp(p.id, 'pos') ?? p.pos,
        up: normalize(this.interp(p.id, 'up') ?? p.up),
        view: p.view,
        vel: p.vel,
        crouched: p.crouched,
        alive: p.alive,
        move: p.move,
        hp: p.hp,
        windup: p.windup,
        aiming: p.aiming,
        laserWarn: p.laserWarn,
        slashTicks: p.slashTicks,
        weapon: p.weapon,
        stun: p.stun,
        shield: p.shield,
        powerup: p.powerup,
        carrier: carriers.has(p.id),
        revealed: revealed.has(p.id),
      }));
  }

  match(): MatchInfo | null {
    const ms = this.opts.match;
    if (!ms) return null;
    return {
      ...matchView(ms),
      startAt: 0,
      stats: this.w.players.map((p) => ({
        id: p.id,
        team: p.team,
        kills: p.kills,
        deaths: p.deaths,
        teamKills: p.teamKills,
        damage: Math.round(p.damageDealt),
      })),
    };
  }

  tickNow(): number {
    return this.w.tick;
  }

  restartMatch(): void {
    if (this.opts.match) startMatch(this.opts.match, this.w, this.ctx);
  }

  boomerangs() {
    return this.w.boomerangs;
  }

  grenades() {
    return this.w.grenades;
  }

  twins() {
    return this.w.twins;
  }

  powerups() {
    return this.w.powerups;
  }

  world(): WorldState {
    return this.w;
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  names(): Record<number, string> {
    return this.opts.names ?? {};
  }

  // offline everyone else is a bot
  canTakeOver(id: number): boolean {
    const ms = this.opts.match;
    return !!ms && canTakeOverInMatch(ms, this.w, this.localId, id);
  }

  takeOver(id: number): void {
    const ms = this.opts.match;
    const n = this.w.events.length;
    if (!ms || !takeOverInMatch(ms, this.w, this.localId, id)) return;
    // between ticks: step() would clear the takeover event before anyone saw it
    this.events.push(...this.w.events.slice(n));
    // both bodies jumped: don't draw them sliding from the old spots
    this.snapshot(this.cur, [this.localId, id]);
    this.snapshot(this.prev, [this.localId, id]);
  }

  teleport(areaIndex: number): void {
    const a = this.opts.levelDef.areas?.[areaIndex];
    const p = this.local();
    if (!a || !p) return;
    respawnPlayer(this.w, p, a.pos, a.yawDeg, this.config);
    this.snapshot(this.cur);
    this.snapshot(this.prev);
  }

  respawn(): void {
    const s = this.opts.levelDef.spawns[0];
    const p = this.local();
    if (!p) return;
    respawnPlayer(this.w, p, s.pos, s.yawDeg, this.config);
    this.snapshot(this.cur);
    this.snapshot(this.prev);
  }

  dispose(): void {}
}
