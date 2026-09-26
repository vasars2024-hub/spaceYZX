// Map devices a player triggers by moving into them: launch pads and portals (LevelDef
// launchPads / portals). Stateless (no cooldowns to keep in the world): a pad keeps setting its
// throw while you are inside it, and a portal's exit lies outside every portal, so nothing
// bounces back. Runs after movement, on the server and in the client's prediction alike.
import { v3, clone, dot, len } from '../math/vec3';
import { pointInAabb } from '../level/level';
import type { SimContext } from './context';
import type { PlayerState, WorldState } from './state';
import { Move } from './state';

export const updateDevices = (world: WorldState, ctx: SimContext, p: PlayerState): void => {
  if (!p.alive || p.frozen || p.rail || p.mantle) return;
  const def = ctx.level.def;
  const pads = def.launchPads;
  if (pads)
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pointInAabb(p.pos, pad.min, pad.max)) continue;
      const speed = len(pad.vel);
      // a fresh launch (not the ticks after it while still inside the volume)
      if (dot(p.vel, pad.vel) < 0.9 * speed * speed)
        world.events.push({ type: 'launch', player: p.id, pad: i });
      p.vel = v3(pad.vel.x, pad.vel.y, pad.vel.z);
      p.grounded = false;
      p.coyote = 0;
      p.jumpBuffer = 0;
      if (p.move !== Move.Float) p.move = Move.Air;
      break;
    }
  const portals = def.portals;
  if (portals)
    for (let i = 0; i < portals.length; i++) {
      const pt = portals[i];
      if (!pointInAabb(p.pos, pt.min, pt.max)) continue;
      const from = clone(p.pos);
      p.pos = clone(pt.exit);
      world.events.push({ type: 'portal', player: p.id, portal: i, from, to: clone(pt.exit) });
      break;
    }
};
