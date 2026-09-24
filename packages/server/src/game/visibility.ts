// Line-of-sight culling: don't send an enemy's position to a team that can't possibly see it
// (so wall-hack cheats have nothing to show). Vision is shared per team, generous (several
// sample points, a short look-ahead, a close-range bubble) and sticky for a moment so enemies
// never pop in late. Revealed players (Controller pulses, last seconds) are always sent.
import type { SimContext, WorldState, Vec3 } from '@space-yz/shared';
import { eyePos, lineOfSight, madd, len, sub } from '@space-yz/shared';

export const VISIBILITY = {
  everyTicks: 3,
  stickyTicks: 15,
  alwaysWithinM: 12,
  lookAheadSec: 0.2,
};

export class TeamVision {
  /** team -> enemy id -> last tick it was visible */
  private seen: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  enabled = true;

  update(world: WorldState, ctx: SimContext, revealed: readonly number[]): void {
    if (world.tick % VISIBILITY.everyTicks !== 0) return;
    const m = ctx.config.movement;
    for (const team of [0, 1] as const) {
      const viewers = world.players.filter((p) => p.team === team && p.alive);
      const seen = this.seen[team];
      for (const e of world.players) {
        if (e.team === team) continue;
        if (!e.alive || revealed.includes(e.id)) {
          seen.set(e.id, world.tick);
          continue;
        }
        const points: Vec3[] = [
          eyePos(e, m),
          madd(e.pos, e.up, 0.1),
          madd(e.pos, e.up, -0.6),
          madd(eyePos(e, m), e.vel, VISIBILITY.lookAheadSec),
        ];
        let vis = false;
        for (const v of viewers) {
          if (len(sub(v.pos, e.pos)) < VISIBILITY.alwaysWithinM) {
            vis = true;
            break;
          }
          const eye = eyePos(v, m);
          const eyeAhead = madd(eye, v.vel, VISIBILITY.lookAheadSec);
          if (
            points.some(
              (pt) => lineOfSight(ctx.level, eye, pt) || lineOfSight(ctx.level, eyeAhead, pt),
            )
          ) {
            vis = true;
            break;
          }
        }
        if (vis) seen.set(e.id, world.tick);
      }
      // forget players who left
      for (const id of seen.keys()) if (!world.players.some((p) => p.id === id)) seen.delete(id);
    }
  }

  /** Can `team` currently see player `id`? (teammates always) */
  visible(team: 0 | 1, id: number, playerTeam: 0 | 1, tick: number): boolean {
    if (!this.enabled || playerTeam === team) return true;
    const t = this.seen[team].get(id);
    return t !== undefined && tick - t <= VISIBILITY.stickyTicks;
  }
}
