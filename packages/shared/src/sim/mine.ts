// Remote mine: one per player per round (per life in respawn modes, since a respawn hands out
// a fresh one). The place key drops it on the ground at your feet (only while you stand on the
// ground); the detonate key sets it off later from anywhere. Everyone whose body is within
// combat.mineRadius of it, in line of sight (no damage through walls), loses
// combat.mineDamageFrac of their max health — teammates and you too (friendly fire is on, as for
// grenades). Rules:
// - a mine whose owner dies (or leaves) fizzles harmlessly;
// - Tower mode (combat.mineTowerBan): not on a Tower (inside / on top of its touch volume);
// - Bomb mode: the plant's radio shockwave switches every mine off for the rest of the round,
//   and nobody can place one after it (jamMines, called by rules/bomb.ts).
// Enemies only see a mine up close: the server leaves it out of their snapshots further than
// combat.mineSeeRadius away (packages/server/src/game/room.ts, `mineVisibleTo`).
import type { Vec3 } from '../math/vec3';
import { clone, len, madd, sub } from '../math/vec3';
import { lineOfSight } from '../level/collision';
import type { SimContext } from './context';
import { isTeammate } from './context';
import type { PlayerInput } from './input';
import { Btn } from './input';
import type { PlayerState, WorldState } from './state';
import type { MineState } from './combat-state';
import { MineSlot } from './combat-state';
import { feetPos, eyePos } from './movement';
import { chestOf, hitboxOf, pointHitboxDist } from './hitbox';
import { applyDamage } from './combat';

const ticks = (sec: number, dt: number): number => Math.max(1, Math.round(sec / dt));

/** The blast's centre: a little above the floor it lies on. */
export const mineCenter = (m: MineState): Vec3 => madd(m.pos, m.up, 0.3);

/** Is `p` standing in (or on top of) a Tower's touch volume (rules/match.ts touch check)? */
export const onTower = (ctx: SimContext, p: PlayerState): boolean => {
  for (const t of ctx.level.def.towers ?? []) {
    const reach = t.radius + ctx.config.rules.towerTouchRadius;
    const dy = p.pos.y - t.pos.y;
    if (Math.hypot(p.pos.x - t.pos.x, p.pos.z - t.pos.z) <= reach && dy >= -1 && dy <= t.height + 2)
      return true;
  }
  return false;
};

/** Why `p` can't place their mine right now (null = they can). */
export const mineRefusal = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
): 'air' | 'tower' | 'jammed' | null => {
  if (world.minesJammed) return 'jammed';
  if (!p.grounded) return 'air';
  if (ctx.config.combat.mineTowerBan > 0 && onTower(ctx, p)) return 'tower';
  return null;
};

const fizzle = (world: WorldState, m: MineState): void => {
  world.events.push({ type: 'mineFizzle', player: m.owner, mine: m.id, pos: clone(m.pos) });
  const owner = world.players.find((p) => p.id === m.owner);
  if (owner && owner.mineSlot === MineSlot.Placed) owner.mineSlot = MineSlot.Used;
};

/** Set off `m` (owned by `p`). Prediction (`only`): judged for that player only. */
const blast = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  m: MineState,
  only: number | undefined,
): void => {
  const c = ctx.config.combat;
  const center = mineCenter(m);
  world.mines = world.mines.filter((x) => x.id !== m.id);
  p.mineSlot = MineSlot.Used;
  world.events.push({ type: 'mineBlast', player: p.id, mine: m.id, pos: clone(center) });
  const dmg = Math.round(c.maxHp * c.mineDamageFrac);
  for (const v of world.players) {
    if (!v.alive || (only !== undefined && v.id !== only)) continue;
    const hb = hitboxOf(v, ctx.config);
    if (pointHitboxDist(center, hb) > c.mineRadius) continue;
    // no damage through walls: the blast must reach the body or the head
    if (!lineOfSight(ctx.level, center, chestOf(hb)) && !lineOfSight(ctx.level, center, hb.head))
      continue;
    applyDamage(world, ctx, p.id, v, dmg, 'mine', false, clone(v.pos), clone(center));
  }
};

/**
 * The mine keys for everyone who can act this tick, and mines whose owner is gone. Runs after
 * updateCombat (world.ts step / stepPredict). Prediction (`only`): just that player.
 */
export const updateMines = (
  world: WorldState,
  ctx: SimContext,
  inputs: Record<number, PlayerInput>,
  prevButtons: Record<number, number>,
  only?: number,
): void => {
  const c = ctx.config.combat;
  // a dead (or departed) owner's mine fizzles (the server decides; snapshots tell the client)
  if (only === undefined && world.mines.length) {
    const keep: MineState[] = [];
    for (const m of world.mines) {
      const owner = world.players.find((p) => p.id === m.owner);
      if (owner && owner.alive) keep.push(m);
      else fizzle(world, m);
    }
    world.mines = keep;
  }
  if (!(c.mineEnabled > 0)) return;
  for (const p of world.players) {
    if (only !== undefined && p.id !== only) continue;
    if (!p.alive || p.frozen || p.stun > 0) continue;
    const buttons = inputs[p.id]?.buttons ?? 0;
    const pressed = buttons & ~(prevButtons[p.id] ?? 0);
    if (pressed & Btn.MinePlace && p.mineSlot === MineSlot.Ready) {
      const why = mineRefusal(world, ctx, p);
      if (why) world.events.push({ type: 'mineRefused', player: p.id, reason: why });
      else {
        const m: MineState = {
          id: world.nextId++,
          owner: p.id,
          pos: feetPos(p, ctx.config.movement),
          up: clone(p.up),
          placedTick: world.tick,
        };
        world.mines.push(m);
        p.mineSlot = MineSlot.Placed;
        world.events.push({ type: 'minePlace', player: p.id, mine: m.id, pos: clone(m.pos) });
      }
    }
    if (pressed & Btn.MineDetonate && p.mineSlot === MineSlot.Placed) {
      const m = world.mines.find((x) => x.owner === p.id);
      if (m && world.tick - m.placedTick >= ticks(c.mineArmSec, ctx.dt))
        blast(world, ctx, p, m, only);
    }
  }
};

/**
 * Bomb mode: the bomb was just planted at `from`. Its radio shockwave switches every remote
 * mine off (they fizzle harmlessly) and nobody can place one for the rest of the round.
 */
export const jamMines = (world: WorldState, from: Vec3): void => {
  world.events.push({ type: 'mineJam', pos: clone(from) });
  for (const m of world.mines) fizzle(world, m);
  world.mines = [];
  world.minesJammed = true;
};

/** A new round: no mines lying around, the jam is over (everyone's slot comes with respawn). */
export const resetMines = (world: WorldState): void => {
  world.mines = [];
  world.minesJammed = false;
};

/**
 * Server culling: does `viewer` get told about mine `m`? Its owner and the owner's teammates
 * always; anyone else only within combat.mineSeeRadius with a clear line from their eyes, so
 * a wall-hack has nothing to show from further away.
 */
export const mineVisibleTo = (
  ctx: SimContext,
  m: MineState,
  owner: PlayerState | undefined,
  viewer: PlayerState | undefined,
): boolean => {
  if (!viewer) return false;
  if (m.owner === viewer.id) return true;
  if (owner && isTeammate(ctx, owner, viewer)) return true;
  if (!viewer.alive) return false;
  const eye = eyePos(viewer, ctx.config.movement);
  const top = madd(m.pos, m.up, 0.15);
  return (
    len(sub(top, eye)) <= ctx.config.combat.mineSeeRadius && lineOfSight(ctx.level, eye, top)
  );
};
