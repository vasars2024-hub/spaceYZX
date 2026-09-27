// Map devices a player triggers by moving into them: launch pads and portals (LevelDef
// launchPads / portals). Stateless (no cooldowns to keep in the world): a pad keeps setting its
// throw while you are inside it, and a portal's exit lies outside every portal, so nothing
// bounces back. A portal may turn you (PortalDef.turn): velocity and view turned about the
// vertical, speed kept; one that keeps your offset (PortalDef.offset) puts you as far off its exit
// as you went in off its opening's middle, turned the same way, and one may level you out
// (PortalDef.vertical 'zero': vertical speed dropped). Runs after movement, on the server and in the client's prediction alike.
import { v3, add, clone, dot, len, madd, rotateAxis, scale, sub, UP } from '../math/vec3';
import { qFromAxisAngle, qMul, qNormalize } from '../math/quat';
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
      p.padFlight = true; // (its landing never hurts)
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
      const turn = pt.turn ?? 0;
      // (a compass turn to the right is a negative rotation about +y)
      const a = (-turn * Math.PI) / 180;
      p.pos = clone(pt.exit);
      if (pt.offset && pt.dir) {
        // across and up from the opening's middle (not along the way through), turned with you
        const mid = scale(add(pt.min, pt.max), 0.5);
        let off = sub(from, mid);
        off = madd(off, pt.dir, -dot(off, pt.dir));
        p.pos = add(pt.exit, rotateAxis(off, UP, a));
      }
      if (pt.vertical === 'zero') p.vel = v3(p.vel.x, 0, p.vel.z);
      if (turn !== 0) {
        p.vel = rotateAxis(p.vel, UP, a);
        p.view = qNormalize(qMul(qFromAxisAngle(UP, a), p.view));
        p.portalYaw = (((p.portalYaw + turn) % 360) + 360) % 360;
        world.events.push({
          type: 'portal',
          player: p.id,
          portal: i,
          from,
          to: clone(p.pos),
          turn,
        });
      } else world.events.push({ type: 'portal', player: p.id, portal: i, from, to: clone(p.pos) });
      break;
    }
};
