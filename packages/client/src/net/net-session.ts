// Online session: your player is predicted (instant), others are interpolated ~4 ticks behind.
import type {
  GameConfig,
  Level,
  NetCore,
  PlayerState,
  SimContext,
  SimEvent,
  Vec3,
  WorldState,
  BoomerangState,
  GrenadeState,
  PowerupPickup,
} from '@space-yz/shared';
import {
  lerp,
  add,
  normalize,
  netToBoomerang,
  newBoomerang,
  Phase,
  canTakeOver as canTakeOverInSim,
} from '@space-yz/shared';
import type { MatchInfo, RenderPlayer, Session, TickInput } from '../game/session';

export class NetSession implements Session {
  alpha = 0;
  constructor(public core: NetCore) {}

  get level(): Level {
    return this.core.level!;
  }
  get config(): GameConfig {
    return this.core.config;
  }
  get localId(): number {
    return this.core.localId;
  }
  get ctx(): SimContext {
    return this.core.ctx!;
  }

  update(frameDt: number, sample: () => TickInput): void {
    this.alpha = this.core.update(frameDt, sample);
  }

  local(): PlayerState | undefined {
    return this.core.localPredicted();
  }

  localEye(): Vec3 | undefined {
    const a = this.core.prevLocal;
    const b = this.core.curLocal;
    if (!b) return this.local()?.pos;
    const e = a ? lerp(a.eye, b.eye, this.alpha) : b.eye;
    return add(e, this.core.correction);
  }

  localUp(): Vec3 | undefined {
    const a = this.core.prevLocal;
    const b = this.core.curLocal;
    if (!b) return this.local()?.up;
    return a ? normalize(lerp(a.up, b.up, this.alpha), b.up) : b.up;
  }

  others(): RenderPlayer[] {
    const snap = this.core.latest;
    if (!snap) return [];
    const names = this.names();
    const carriers = this.carriers();
    const revealed = this.revealed();
    const out: RenderPlayer[] = [];
    for (const [id] of snap.players) {
      if (id === this.localId) continue;
      const ip = this.core.interpolated(id);
      if (!ip) continue;
      const np = ip.np;
      out.push({
        id,
        team: np.team as 0 | 1,
        name: names[id] ?? `Player ${id}`,
        pos: ip.pos,
        up: ip.up,
        view: np.view,
        vel: np.vel,
        crouched: np.crouched,
        alive: np.alive,
        move: np.move,
        hp: np.hp,
        windup: np.windup,
        aiming: np.aiming,
        laserWarn: np.laserWarn,
        slashTicks: np.slashTicks,
        weapon: np.weapon,
        stun: np.stun,
        shield: np.shield,
        powerup: np.powerup,
        carrier: carriers.has(id),
        revealed: revealed.has(id),
      });
    }
    return out;
  }

  /** Rules state helpers (M5 fills `extra` with match info). */
  carriers(): Set<number> {
    const x = this.core.extra as { carriers?: number[] } | null;
    return new Set(x?.carriers ?? []);
  }
  revealed(): Set<number> {
    const x = this.core.extra as { revealed?: number[] } | null;
    return new Set(x?.revealed ?? []);
  }

  match(): MatchInfo | null {
    const x = this.core.extra as (MatchInfo & { rules?: string }) | null;
    return x && x.rules === 'match' ? x : null;
  }

  tickNow(): number {
    return this.core.serverNow();
  }

  canStart(): boolean {
    return !this.core.ranked && this.core.hostId === this.localId;
  }

  startMatch(): void {
    this.core.sendJson({ t: 'startMatch' });
  }

  report(playerId: number, reason: string): void {
    this.core.sendJson({ t: 'report', player: playerId, reason });
  }

  canTakeOver(id: number): boolean {
    const w = this.core.predWorld;
    const bot = this.core.roster.find((p) => p.id === id)?.bot ?? false;
    return !!w && bot && this.match()?.phase === 'live' && canTakeOverInSim(w, this.localId, id);
  }

  takeOver(id: number): void {
    this.core.takeOver(id);
  }

  pings(): Record<number, number> {
    const out: Record<number, number> = {};
    for (const p of this.core.roster) out[p.id] = p.ping;
    return out;
  }

  boomerangs(): BoomerangState[] {
    const snap = this.core.latest;
    const out: BoomerangState[] = [];
    const mine = this.core.predWorld?.boomerangs.find((b) => b.owner === this.localId);
    if (mine) out.push(mine);
    if (!snap) return out;
    for (const [owner, nb] of snap.boomerangs) {
      if (owner === this.localId) continue;
      const b = netToBoomerang(owner, nb);
      const p = this.core.interpolatedBoomerang(owner);
      if (p && b.phase !== Phase.Held) b.pos = p;
      if (b.phase === Phase.Held) {
        // held Boomerangs follow their owner's rendered hand
        const ip = this.core.interpolated(owner);
        if (ip) b.pos = ip.pos;
      }
      out.push(b);
    }
    return out;
  }

  /**
   * Grenades as drawn: your own where your prediction has them (now), everyone else's
   * interpolated like the players around them — the same moment the server's lag
   * compensation rewinds to when you shoot one.
   */
  grenades(): GrenadeState[] {
    const me = this.localId;
    const out: GrenadeState[] = (this.core.predWorld?.grenades ?? []).filter(
      (g) => g.owner === me && g.phase !== 2,
    );
    for (const g of this.core.latest?.grenades ?? []) {
      if (g.owner === me) continue;
      out.push({ ...g, pos: this.core.interpolatedGrenade(g.id) ?? g.pos });
    }
    return out;
  }

  /** Twins as drawn: your own predicted (now), everyone else's interpolated. */
  twins(): BoomerangState[] {
    const me = this.localId;
    const out: BoomerangState[] = (this.core.predWorld?.twins ?? []).filter((t) => t.owner === me);
    for (const t of this.core.latest?.twins ?? []) {
      if (t.owner === me) continue;
      const pos = this.core.interpolatedTwin(t.id);
      if (!pos) continue;
      out.push({ ...newBoomerang(t.owner, pos), id: t.id, phase: Phase.Out });
    }
    return out;
  }

  /** Power-ups lying around (minus one your prediction just picked up). */
  powerups(): PowerupPickup[] {
    return (this.core.latest?.powerups ?? []).filter((u) => !this.core.predictedPickups.has(u.id));
  }

  world(): WorldState {
    return this.core.predWorld!;
  }

  drainEvents(): SimEvent[] {
    return this.core.drainEvents();
  }

  names(): Record<number, string> {
    const out: Record<number, string> = {};
    for (const p of this.core.roster) out[p.id] = p.name;
    return out;
  }

  teams(): Record<number, 0 | 1> {
    const out: Record<number, 0 | 1> = {};
    for (const p of this.core.roster) out[p.id] = p.team;
    return out;
  }

  dispose(): void {
    this.core.leaveRoom();
  }
}
