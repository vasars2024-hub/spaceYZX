// Lag compensation: a short history of what every client is shown (the same network-rounded
// public state the snapshots carry), so shots and deflects are judged against exactly what the
// shooter had on screen — interpolated with the same code the client draws with. Capped, so
// high-ping players can't shoot far into the past.
import type { GameConfig, Hitbox, NetPlayer, Vec3, WorldState } from '@space-yz/shared';
import {
  TICK_DT,
  MAX_REWIND_MS,
  LAG_COMP,
  publicState,
  snapGrenadePos,
  interpNetPlayer,
  interpObjectPos,
  netHitbox,
} from '@space-yz/shared';

export { LAG_COMP, MAX_REWIND_MS } from '@space-yz/shared';

interface Frame {
  tick: number;
  /** public player state, rounded exactly like the snapshots */
  players: Map<number, NetPlayer>;
  /** Boomerang positions by id (= owner), as sent */
  boomerangs: Map<number, Vec3>;
  /** flying grenades, as sent */
  grenades: Map<number, Vec3>;
}

export class LagHistory {
  private frames: Frame[] = [];
  private config: GameConfig | null = null;
  /** rewound hitboxes are asked for many times per tick (every flying Boomerang): cache */
  private cache: { tick: number; boxes: Hitbox[] | null } | null = null;
  readonly maxFrames: number;
  readonly maxRewindTicks: number;

  constructor(opts: { historyMs?: number; maxRewindMs?: number } = {}) {
    const tickMs = TICK_DT * 1000;
    this.maxFrames = Math.ceil((opts.historyMs ?? LAG_COMP.historyMs) / tickMs) + 1;
    this.maxRewindTicks = (opts.maxRewindMs ?? MAX_REWIND_MS) / tickMs;
  }

  /**
   * Call after every authoritative step. `pub` = the public state being sent this tick (pass
   * it when already computed, to save the work).
   */
  record(world: WorldState, cfg: GameConfig, pub = publicState(world)): void {
    this.config = cfg;
    this.cache = null;
    const boomerangs = new Map<number, Vec3>();
    for (const [owner, nb] of pub.boomerangs) boomerangs.set(owner, nb.pos);
    const grenades = new Map<number, Vec3>();
    for (const g of world.grenades) if (g.phase === 0) grenades.set(g.id, snapGrenadePos(g.pos));
    this.frames.push({ tick: world.tick, players: pub.players, boomerangs, grenades });
    while (this.frames.length > this.maxFrames) this.frames.shift();
  }

  get newestTick(): number {
    return this.frames.length ? this.frames[this.frames.length - 1].tick : -1;
  }

  /** Clamp a requested view tick to the allowed window before `nowTick`. */
  clampTick(viewTick: number, nowTick: number): number {
    return Math.max(viewTick, nowTick - this.maxRewindTicks);
  }

  /** The two recorded frames around `tick` and the blend factor (like the client's buffer). */
  private around(tick: number): { a: Frame; b: Frame; t: number } | null {
    const f = this.frames;
    if (!f.length) return null;
    if (tick <= f[0].tick) return { a: f[0], b: f[0], t: 0 };
    for (let i = f.length - 1; i >= 0; i--) {
      if (f[i].tick <= tick) {
        const a = f[i];
        const b = f[i + 1] ?? a;
        const span = b.tick - a.tick;
        return { a, b, t: span > 0 ? Math.max(0, Math.min(1, (tick - a.tick) / span)) : 0 };
      }
    }
    return null;
  }

  /** Hitboxes of the players alive (as drawn) at (fractional) `tick`. */
  hitboxesAt(tick: number): Hitbox[] | null {
    if (this.cache?.tick === tick) return this.cache.boxes;
    const r = this.around(tick);
    let boxes: Hitbox[] | null = null;
    if (r && this.config) {
      boxes = [];
      for (const [id, pa] of r.a.players) {
        const ip = interpNetPlayer(pa, r.b.players.get(id) ?? pa, r.t);
        if (ip.np.alive) boxes.push(netHitbox(id, ip.np, ip.pos, ip.up, this.config));
      }
    }
    this.cache = { tick, boxes };
    return boxes;
  }

  /** Where a Boomerang (by id) or a flying grenade was drawn at `tick`. */
  posAt(kind: 'boomerang' | 'grenade', id: number, tick: number): Vec3 | null {
    const r = this.around(tick);
    if (!r) return null;
    const pa = (kind === 'boomerang' ? r.a.boomerangs : r.a.grenades).get(id);
    const pb = (kind === 'boomerang' ? r.b.boomerangs : r.b.grenades).get(id);
    if (pa && pb) return interpObjectPos(pa, pb, r.t);
    return pa ?? pb ?? null;
  }
}
