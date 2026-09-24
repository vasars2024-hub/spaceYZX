// Lag compensation: a short history of hitboxes and projectile positions, so shots and
// deflects are judged against what the shooter actually saw (capped, so high-ping players
// can't shoot far into the past).
import type { GameConfig, Hitbox, Vec3, WorldState } from '@space-yz/shared';
import { hitboxOf, lerp, isFlying, TICK_DT } from '@space-yz/shared';

export const LAG_COMP = {
  /** the most network latency a shot is compensated for (the build plan's ~175 ms cap) */
  maxLatencyMs: 175,
  /**
   * Every client also draws other players ~4–8 ticks in the past for smooth interpolation;
   * that part is always compensated (up to this much) on top of the latency cap.
   */
  interpAllowanceMs: 100,
  /** history kept: enough for the largest allowed rewind */
  historyMs: 300,
};

/** Largest total rewind (latency cap + interpolation allowance). */
export const MAX_REWIND_MS = LAG_COMP.maxLatencyMs + LAG_COMP.interpAllowanceMs;

interface Frame {
  tick: number;
  hitboxes: Hitbox[];
  boomerangs: Map<number, Vec3>;
  grenades: Map<number, Vec3>;
}

const lerpHitbox = (a: Hitbox, b: Hitbox, t: number): Hitbox => ({
  ...a,
  head: lerp(a.head, b.head, t),
  bodyA: lerp(a.bodyA, b.bodyA, t),
  bodyB: lerp(a.bodyB, b.bodyB, t),
});

export class LagHistory {
  private frames: Frame[] = [];
  readonly maxFrames: number;
  readonly maxRewindTicks: number;

  constructor(opts: { historyMs?: number; maxRewindMs?: number } = {}) {
    const tickMs = TICK_DT * 1000;
    this.maxFrames = Math.ceil((opts.historyMs ?? LAG_COMP.historyMs) / tickMs) + 1;
    this.maxRewindTicks = (opts.maxRewindMs ?? MAX_REWIND_MS) / tickMs;
  }

  /** Call after every authoritative step. */
  record(world: WorldState, cfg: GameConfig): void {
    const boomerangs = new Map<number, Vec3>();
    for (const b of world.boomerangs) if (isFlying(b)) boomerangs.set(b.id, { ...b.pos });
    const grenades = new Map<number, Vec3>();
    for (const g of world.grenades) if (g.phase === 0) grenades.set(g.id, { ...g.pos });
    this.frames.push({
      tick: world.tick,
      hitboxes: world.players.filter((p) => p.alive).map((p) => hitboxOf(p, cfg)),
      boomerangs,
      grenades,
    });
    while (this.frames.length > this.maxFrames) this.frames.shift();
  }

  get newestTick(): number {
    return this.frames.length ? this.frames[this.frames.length - 1].tick : -1;
  }

  /** Clamp a requested view tick to the allowed window before `nowTick`. */
  clampTick(viewTick: number, nowTick: number): number {
    return Math.max(viewTick, nowTick - this.maxRewindTicks);
  }

  /** The two recorded frames around `tick` and the blend factor. */
  private around(tick: number): { a: Frame; b: Frame; t: number } | null {
    const f = this.frames;
    if (!f.length) return null;
    if (tick <= f[0].tick) return { a: f[0], b: f[0], t: 0 };
    for (let i = f.length - 1; i >= 0; i--) {
      if (f[i].tick <= tick) {
        const a = f[i];
        const b = f[i + 1] ?? a;
        const span = b.tick - a.tick;
        return { a, b, t: span > 0 ? (tick - a.tick) / span : 0 };
      }
    }
    return null;
  }

  /** Hitboxes as they were at (fractional) `tick`; players missing from either frame are skipped. */
  hitboxesAt(tick: number): Hitbox[] | null {
    const r = this.around(tick);
    if (!r) return null;
    const out: Hitbox[] = [];
    for (const ha of r.a.hitboxes) {
      const hb = r.b.hitboxes.find((x) => x.id === ha.id);
      out.push(hb ? lerpHitbox(ha, hb, r.t) : ha);
    }
    return out;
  }

  posAt(kind: 'boomerang' | 'grenade', id: number, tick: number): Vec3 | null {
    const r = this.around(tick);
    if (!r) return null;
    const pa = (kind === 'boomerang' ? r.a.boomerangs : r.a.grenades).get(id);
    const pb = (kind === 'boomerang' ? r.b.boomerangs : r.b.grenades).get(id);
    if (pa && pb) return lerp(pa, pb, r.t);
    return pa ?? pb ?? null;
  }
}
