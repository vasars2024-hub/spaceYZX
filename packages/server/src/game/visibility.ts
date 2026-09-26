// Line-of-sight culling: don't send an enemy's position to a team that can't possibly see it
// (so wall-hack cheats have nothing to show). Vision is shared per team, generous (several
// sample points, a short look-ahead, a close-range bubble) and sticky for a moment so enemies
// never pop in late. Revealed players (Controller pulses, last seconds) are always sent.
import type { SimContext, WorldState, Vec3 } from '@space-yz/shared';
import { eyePos, lineOfSight, madd, len, sub, cross, normalize, v3 } from '@space-yz/shared';

export const VISIBILITY = {
  everyTicks: 8,
  stickyTicks: 20,
  /** look-ahead samples only for players moving faster than this (m/s) */
  fastMps: 1.5, // CS mode moves slower: crouch/walk peeks need the look-ahead too
  alwaysWithinM: 12,
  lookAheadSec: 0.2,
  /** body edge samples sit this far outside the capsule (a shoulder peeking past cover) */
  edgeMarginM: 0.1,
  /**
   * viewers also "look" from this far to their left and right: a peek shows the enemy while
   * the server still has you a step behind the corner (your screen is ahead of the server)
   */
  peekM: 0.6,
};

export class TeamVision {
  /** team -> enemy id -> last tick it was visible */
  private seen: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  /** team -> enemy id -> the viewer / sample point that saw it last (tried first: 1 ray) */
  private hint: [Map<number, [number, number]>, Map<number, [number, number]>] = [
    new Map(),
    new Map(),
  ];
  enabled = true;
  raycasts = 0;

  update(world: WorldState, ctx: SimContext, revealed: readonly number[]): void {
    // each team is re-checked every `everyTicks`, the two teams on alternating ticks
    const phase = world.tick % VISIBILITY.everyTicks;
    const half = Math.floor(VISIBILITY.everyTicks / 2);
    for (const team of [0, 1] as const) {
      if (phase === (team === 0 ? 0 : half)) this.updateTeam(world, ctx, revealed, team);
    }
  }

  /** Re-check both teams now (tests, tools). */
  updateAll(world: WorldState, ctx: SimContext, revealed: readonly number[]): void {
    this.updateTeam(world, ctx, revealed, 0);
    this.updateTeam(world, ctx, revealed, 1);
  }

  private updateTeam(
    world: WorldState,
    ctx: SimContext,
    revealed: readonly number[],
    team: 0 | 1,
  ): void {
    const m = ctx.config.movement;
    const viewers = world.players.filter((p) => p.team === team && p.alive);
    const fast = (v: { vel: Vec3 }) => len(v.vel) > VISIBILITY.fastMps;
    const eyes = viewers.map((v) => {
      const eye = eyePos(v, m);
      return fast(v) ? [eye, madd(eye, v.vel, VISIBILITY.lookAheadSec)] : [eye];
    });
    const seen = this.seen[team];
    const hint = this.hint[team];
    const los = (a: Vec3, b: Vec3) => {
      this.raycasts++;
      return lineOfSight(ctx.level, a, b);
    };
    for (const e of world.players) {
      if (e.team === team) continue;
      if (!e.alive || revealed.includes(e.id)) {
        seen.set(e.id, world.tick);
        continue;
      }
      if (viewers.some((v) => len(sub(v.pos, e.pos)) < VISIBILITY.alwaysWithinM)) {
        seen.set(e.id, world.tick);
        continue;
      }
      const head = eyePos(e, m);
      // the body's centre line (chest, head, knees) …
      const centre: Vec3[] = [madd(e.pos, e.up, 0.1), head, madd(e.pos, e.up, -0.6)];
      if (fast(e)) centre.push(madd(head, e.vel, VISIBILITY.lookAheadSec));
      // … and its left and right edges as seen by each viewer: an enemy holding an angle
      // beside a wall shows a shoulder long before its middle (checked only if the centre fails)
      const edges = (eye: Vec3): Vec3[] => {
        const side = normalize(cross(sub(head, eye), e.up), v3(1, 0, 0));
        const w = m.radius + VISIBILITY.edgeMarginM;
        const out: Vec3[] = [];
        for (const c of [head, centre[0]]) out.push(madd(c, side, w), madd(c, side, -w));
        return out;
      };
      // try what worked last time first (usually a single ray)
      const h = hint.get(e.id);
      let vis = false;
      if (h) {
        const vi = viewers.findIndex((v) => v.id === h[0]);
        const eye = vi >= 0 ? eyes[vi][h[1] & 1] : undefined;
        const pi = h[1] >> 1;
        const pts = eye ? (pi < centre.length ? centre : edges(eye)) : [];
        const p = pts[pi < centre.length ? pi : pi - centre.length];
        if (eye && p && los(eye, p)) vis = true;
      }
      for (let vi = 0; vi < viewers.length && !vis; vi++)
        for (let k = 0; k < eyes[vi].length && !vis; k++) {
          const eye = eyes[vi][k];
          for (let pi = 0; pi < centre.length && !vis; pi++)
            if (los(eye, centre[pi])) {
              vis = true;
              hint.set(e.id, [viewers[vi].id, (pi << 1) | k]);
            }
          if (vis) break;
          const ed = edges(eye);
          for (let j = 0; j < ed.length && !vis; j++)
            if (los(eye, ed[j])) {
              vis = true;
              hint.set(e.id, [viewers[vi].id, ((centre.length + j) << 1) | k]);
            }
        }
      // last: a peek allowance, from beside each viewer's eye to the body's centre line
      for (let vi = 0; vi < viewers.length && !vis; vi++) {
        const eye = eyes[vi][0];
        const side = normalize(cross(sub(head, eye), viewers[vi].up), v3(1, 0, 0));
        for (const s of [VISIBILITY.peekM, -VISIBILITY.peekM]) {
          const from = madd(eye, side, s);
          if (!lineOfSight(ctx.level, eye, from)) continue; // no peeking through the wall beside you
          if (centre.some((c) => los(from, c))) {
            vis = true;
            break;
          }
        }
      }
      if (vis) seen.set(e.id, world.tick);
    }
    // forget players who left
    for (const id of seen.keys())
      if (!world.players.some((p) => p.id === id)) {
        seen.delete(id);
        hint.delete(id);
      }
  }

  /** Can `team` currently see player `id`? (teammates always) */
  visible(team: 0 | 1, id: number, playerTeam: 0 | 1, tick: number): boolean {
    if (!this.enabled || playerTeam === team) return true;
    const t = this.seen[team].get(id);
    return t !== undefined && tick - t <= VISIBILITY.stickyTicks;
  }
}
