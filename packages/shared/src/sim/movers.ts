// Moving blocks (LevelDef.movers, level/movers.ts) in the sim: once per tick the level's movers
// jump to that tick's place, whoever stood on one comes along, and after moving a player can be
// crushed by one or touch the kill paint riding on one. Runs on the server (step) and in the
// client's prediction (stepPredict) with the same tick numbers, so both agree.
import type { Vec3 } from '../math/vec3';
import { add, sub, dot, clone } from '../math/vec3';
import { capsuleContacts } from '../level/collision';
import { pointInAabb, setLevelTick } from '../level/level';
import type { SimContext } from './context';
import type { PlayerState, WorldState } from './state';
import { capsuleOf } from './movement';
import { applyDamage } from './combat';
import { sendRacerBack } from './race';

/** How close (m) your body must be to a moving block's top to ride it. */
const RIDE_REACH = 0.08;
/** A contact whose normal is at least this much "up" (along your body) is something you stand on. */
const RIDE_UP = 0.3;
/** Moving up off the block faster than this (m/s, along your up): you jumped off it. */
const RIDE_LEAVE = 1.5;
/** Pushed this deep into a moving block (m) after moving: crushed. */
const CRUSH_DEPTH = 0.3;

/**
 * Move the level's movers from the previous tick to `world.tick` (already advanced) and carry
 * whoever stood on one by its whole move (up, down and sideways). `only`: just that player (the
 * client's prediction). No-op on maps without movers.
 */
export const updateMovers = (world: WorldState, ctx: SimContext, only?: number): void => {
  const level = ctx.level;
  if (!level.movers.length) return;
  // where everything stood last tick: who is riding what
  setLevelTick(level, world.tick - 1);
  const m = ctx.config.movement;
  const riders: { p: PlayerState; mover: number }[] = [];
  for (const p of world.players) {
    if ((only !== undefined && p.id !== only) || !p.alive || p.rail || p.mantle) continue;
    let mover = -1;
    let best = -Infinity;
    for (const c of capsuleContacts(level, capsuleOf(p, m), RIDE_REACH)) {
      const mi = level.boxes[c.box].mover;
      if (mi < 0) continue;
      const up = dot(c.normal, p.up);
      if (up > RIDE_UP && up > best) {
        best = up;
        mover = mi;
      }
    }
    if (mover >= 0) riders.push({ p, mover });
  }
  const before: Vec3[] = level.movers.map((mv) => clone(mv.offset));
  setLevelTick(level, world.tick);
  for (const { p, mover } of riders) {
    const delta = sub(level.movers[mover].offset, before[mover]);
    // jumping off (your velocity is your own, relative to the block: carrying moves you)
    if (dot(p.vel, p.up) > RIDE_LEAVE) continue;
    p.pos = add(p.pos, delta);
  }
};

/**
 * After a player moved: kill paint riding on a moving block, and being crushed by one (pushed
 * deep into it, e.g. pinned under it against the floor). Outside a race you die; in a race you
 * go back to your last checkpoint. `predict`: the client's prediction (race falls only; deaths
 * are the server's call).
 */
export const moverHazards = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  predict = false,
): void => {
  const level = ctx.level;
  if (!level.movers.length || !p.alive) return;
  const race = !!level.def.race;
  if (predict && !race) return;
  let hit = false;
  for (const mv of level.movers) {
    if (!mv.killVolumes.length) continue;
    const at = sub(p.pos, mv.offset);
    if (mv.killVolumes.some((k) => pointInAabb(at, k.min, k.max))) {
      hit = true;
      break;
    }
  }
  if (!hit)
    for (const c of capsuleContacts(level, capsuleOf(p, ctx.config.movement)))
      if (c.depth > CRUSH_DEPTH && level.boxes[c.box].mover >= 0) {
        hit = true;
        break;
      }
  if (!hit) return;
  if (race) {
    if (p.racePenalty === 0) sendRacerBack(world, ctx, p, 'fall');
    return;
  }
  applyDamage(world, ctx, p.id, p, 9999, 'world', false, clone(p.pos), clone(p.pos));
};
