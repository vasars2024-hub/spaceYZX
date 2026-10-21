// Head landing ("stomp"): coming down with your feet onto another living player's head.
//
// Players don't collide with each other (bodies pass through), so this is its own check after
// everyone has moved this tick: were your feet above their head at the start of the tick and
// at (or a little into) it now, while you were falling, with your body centre right over theirs?
//   - Boomerang modes ('lethal' loadout): a teammate's head launches you forward the way you
//     look; an enemy's head kills them on the spot (a 'stomp' kill, credited to you) and you
//     bounce up a little.
//   - CS modes ('cs' loadout): anyone's head throws you straight up (team boosts), never a kill.
// The head landing never hurts (you never touch the floor on it, so no fall damage), and the
// same pair can't stomp again for a moment (stompCooldownSec). Races have none.
//
// Numbers: config/movement.ts (stomp*). The server runs it for everybody; the client predicts
// only its own bounce (others where the server last described them), the server decides kills.
import type { Vec3 } from '../math/vec3';
import { clone, dot, len, madd, normalize, projectOnPlane, scale, sub } from '../math/vec3';
import { qForward } from '../math/quat';
import { capsuleOverlaps } from '../level/collision';
import { configLoadout } from '../config/loadout';
import type { SimContext } from './context';
import { isTeammate, secToTicks } from './context';
import type { PlayerState, WorldState } from './state';
import { Move } from './state';
import { applyDamage } from './combat';
import { bodyHeight, capsuleOf } from './movement';

/** Where a player's feet and head top were at the start of the tick (before anyone moved). */
export interface StompStart {
  feet: Vec3;
  top: Vec3;
}

const feetOf = (p: PlayerState, ctx: SimContext): Vec3 =>
  madd(p.pos, p.up, -bodyHeight(p, ctx.config.movement) / 2);
const topOf = (p: PlayerState, ctx: SimContext): Vec3 =>
  madd(p.pos, p.up, bodyHeight(p, ctx.config.movement) / 2);

/** Remember everyone's feet and head before the tick's movement (pass it to updateStomps). */
export const stompStart = (world: WorldState, ctx: SimContext): Map<number, StompStart> => {
  const out = new Map<number, StompStart>();
  for (const p of world.players) out.set(p.id, { feet: feetOf(p, ctx), top: topOf(p, ctx) });
  return out;
};

/** how far into a head your feet may already be at the start of the tick (m) */
const START_SLACK = 0.1;
/** deeper than this into a body after the tick is not a head landing (a teleport, a portal) */
const MAX_DEPTH = 1;

/** The player `a` lands on this tick, or null. */
const landingTarget = (
  world: WorldState,
  ctx: SimContext,
  a: PlayerState,
  start: Map<number, StompStart>,
): { b: PlayerState; depth: number } | null => {
  const m = ctx.config.movement;
  const a0 = start.get(a.id);
  if (!a0 || a.grounded || a.move !== Move.Air || a.frozen) return null;
  const aFeet = feetOf(a, ctx);
  let best: { b: PlayerState; depth: number; side: number } | null = null;
  for (const b of world.players) {
    if (b.id === a.id || !b.alive || b.frozen) continue;
    const b0 = start.get(b.id);
    if (!b0) continue;
    if (a.stompCd > 0 && a.stompOn === b.id) continue;
    const up = b.up;
    // both standing the same way up (not someone on a wall or the ceiling deck)
    if (dot(a.up, up) < 0.9) continue;
    // falling onto them (their own speed doesn't matter: a jump into your feet counts too)
    if (dot(a.vel, up) > -m.stompMinFallSpeed) continue;
    // right over them, sideways
    const side = len(projectOnPlane(sub(a.pos, b.pos), up));
    if (side > m.stompReach) continue;
    // feet above their head at the start of the tick, at or into it now
    if (dot(sub(a0.feet, b0.top), up) < -START_SLACK) continue;
    const now = dot(sub(aFeet, topOf(b, ctx)), up);
    if (now > 0 || now < -MAX_DEPTH) continue;
    // the most central one if two heads are under you
    if (!best || side < best.side) best = { b, depth: -now, side };
  }
  return best ? { b: best.b, depth: best.depth } : null;
};

/**
 * Head landings for this tick (after everyone moved). `start` = stompStart() from before the
 * movement. `only`: client prediction, just your own landings.
 */
export const updateStomps = (
  world: WorldState,
  ctx: SimContext,
  start: Map<number, StompStart>,
  only?: number,
): void => {
  if (ctx.level.def.race) return;
  const m = ctx.config.movement;
  const cs = configLoadout(ctx.config) === 'cs';
  for (const a of world.players) {
    if (only !== undefined && a.id !== only) continue;
    if (a.stompCd > 0) a.stompCd--;
    if (!a.alive) continue;
    const hit = landingTarget(world, ctx, a, start);
    if (!hit) continue;
    const { b, depth } = hit;
    const up = b.up;
    // stand the feet on the head (unless that would push you into the level)
    const lifted = madd(a.pos, up, depth);
    if (!capsuleOverlaps(ctx.level, capsuleOf(a, m, lifted))) a.pos = lifted;
    const pos = clone(topOf(b, ctx));
    const planar = projectOnPlane(a.vel, up);
    a.stompOn = b.id;
    a.stompCd = secToTicks(m.stompCooldownSec, ctx.dt);
    if (cs) {
      // CS: straight up, sideways speed kept as it was
      a.vel = madd(planar, up, m.stompCsUp);
      world.events.push({ type: 'stomp', player: a.id, target: b.id, kind: 'up', pos });
    } else if (isTeammate(ctx, a, b)) {
      // a teammate's head: thrown forward the way you look (never slower than you already were)
      const look = normalize(projectOnPlane(qForward(a.view), up));
      const dir = len(look) > 0.5 ? look : normalize(planar);
      const speed = Math.max(m.stompTeamForward, len(planar));
      a.vel = madd(scale(dir, len(dir) > 0.5 ? speed : 0), up, m.stompTeamUp);
      world.events.push({ type: 'stomp', player: a.id, target: b.id, kind: 'boost', pos });
    } else {
      // an enemy's head: they die (a 'stomp' kill), you bounce up a little
      a.vel = madd(planar, up, m.stompKillBounce);
      world.events.push({ type: 'stomp', player: a.id, target: b.id, kind: 'kill', pos });
      applyDamage(world, ctx, a.id, b, 9999, 'stomp', false, clone(pos), clone(a.pos));
    }
    a.grounded = false;
    a.move = Move.Air;
  }
};
