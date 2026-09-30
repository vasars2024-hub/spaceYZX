// Practice (free-for-all-teams deathmatch): dead players respawn after a short delay at a
// random spawn of their team. Used offline vs bots and by the balance tool. Rounds and the
// Controller objective live in the match rules (Milestone 5).
import type { SimContext } from '../sim/context';
import type { WorldState } from '../sim/state';
import { respawnPlayer } from '../sim/world';
import { rngInt } from '../math/rng';

export interface PracticeState {
  deadSince: Record<number, number>;
  respawnTicks: number;
}

export const createPractice = (respawnSec = 2.5): PracticeState => ({
  deadSince: {},
  respawnTicks: Math.round(respawnSec * 60),
});

/** Returns ids that respawned this tick. */
export const updatePractice = (st: PracticeState, world: WorldState, ctx: SimContext): number[] => {
  const out: number[] = [];
  for (const p of world.players) {
    if (p.alive) {
      delete st.deadSince[p.id];
      continue;
    }
    st.deadSince[p.id] ??= world.tick;
    if (world.tick - st.deadSince[p.id] >= st.respawnTicks) {
      const spawns = ctx.level.def.spawns.filter((s) => s.team === undefined || s.team === p.team);
      const s = spawns[rngInt(world.rng, spawns.length)] ?? ctx.level.def.spawns[0];
      respawnPlayer(world, p, s.pos, s.yawDeg, ctx.config);
      delete st.deadSince[p.id];
      out.push(p.id);
    }
  }
  return out;
};
