// Bomb mode (Counter-Strike style): one team attacks, one defends. An attacker carries the bomb,
// plants it in site A or B by holding Use (G) for `bombPlantSec`, and it goes off
// `bombFuseSec` later unless a defender holds Use next to it for `bombDefuseSec`.
//   Attackers win: the bomb explodes, or every defender is dead.
//   Defenders win: the bomb is defused, the round timer runs out with no plant, or every
//   attacker is dead before the plant (after a plant they still have to defuse it).
// Deterministic; runs inside updateMatch for matches whose objective is 'bomb'.
import type { Vec3 } from '../math/vec3';
import { v3, clone, sub, len } from '../math/vec3';
import { rngInt } from '../math/rng';
import type { SimContext } from '../sim/context';
import type { WorldState, PlayerState } from '../sim/state';
import type { BombSiteDef } from '../level/types';
import { Btn } from '../sim/input';
import { applyDamage } from '../sim/combat';

export interface BombState {
  /** who carries it (null = lying at `pos`, or planted) */
  carrier: number | null;
  pos: Vec3;
  /** planted: the site and the tick it explodes */
  planted: { site: 'A' | 'B'; tick: number; explodeAt: number; by: number } | null;
  /** someone holding Use to plant / defuse: who, and for how many ticks so far */
  plant: { player: number; ticks: number } | null;
  defuse: { player: number; ticks: number } | null;
  exploded: boolean;
  defused: boolean;
}

const secTicks = (s: number, dt: number) => Math.round(s / dt);

/** The team attacking right now: whoever spawns on map side 1 (sides swap at half time). */
export const attackingTeam = (sideSwapped: boolean): 0 | 1 => (sideSwapped ? 0 : 1);

/** Which bomb site (if any) a point is in (a little height slack above the floor). */
export const siteAt = (sites: readonly BombSiteDef[], p: Vec3): 'A' | 'B' | null => {
  for (const s of sites)
    if (
      p.x >= s.min.x &&
      p.x <= s.max.x &&
      p.z >= s.min.z &&
      p.z <= s.max.z &&
      p.y >= s.min.y - 1 &&
      p.y <= s.max.y + 3
    )
      return s.name;
  return null;
};

/** Round start: the bomb goes to a random attacker. */
export const newBomb = (world: WorldState, attackers: 0 | 1): BombState => {
  const ps = world.players.filter((p) => p.team === attackers && p.alive);
  const carrier = ps.length ? ps[rngInt(world.rng, ps.length)] : null;
  return {
    carrier: carrier?.id ?? null,
    pos: carrier ? clone(carrier.pos) : v3(),
    planted: null,
    plant: null,
    defuse: null,
    exploded: false,
    defused: false,
  };
};

/** Is this player holding Use (G) this tick? */
export const holdingUse = (p: PlayerState): boolean => (p.prevButtons & Btn.Use) !== 0;

/** Plant/defuse roots you in place (and it ends a wind-up); cleared when you let go. */
export const useRoot = (p: PlayerState, on: boolean): void => {
  if (on) p.speedCap = 0.01;
  else if (p.windup === 0) p.speedCap = 0;
};

/**
 * One live tick of the bomb. Returns the round result if this tick decided it, else null.
 * `roundOver`: the round timer ran out this tick (only matters before a plant).
 */
export const updateBomb = (
  bomb: BombState,
  world: WorldState,
  ctx: SimContext,
  attackers: 0 | 1,
  roundOver: boolean,
): { winner: 0 | 1; reason: 'exploded' | 'defused' | 'time' } | null => {
  const r = ctx.config.rules;
  const dt = ctx.dt;
  const sites = ctx.level.def.bombSites ?? [];
  const defenders = (1 - attackers) as 0 | 1;
  const byId = (id: number | null) =>
    id === null ? undefined : world.players.find((p) => p.id === id);

  // ---- before the plant ----
  if (!bomb.planted) {
    const carrier = byId(bomb.carrier);
    if (bomb.carrier !== null && (!carrier || !carrier.alive)) {
      // the carrier died (or left): the bomb drops where they were
      bomb.carrier = null;
      if (bomb.plant) {
        const p = byId(bomb.plant.player);
        if (p) useRoot(p, false);
      }
      bomb.plant = null;
      world.events.push({ type: 'bombDrop', pos: clone(bomb.pos) });
    }
    if (bomb.carrier === null) {
      // any living attacker walking over it picks it up
      const taker = world.players.find(
        (p) => p.alive && p.team === attackers && len(sub(p.pos, bomb.pos)) <= r.bombPickupRadius,
      );
      if (taker) {
        bomb.carrier = taker.id;
        world.events.push({ type: 'bombPickup', player: taker.id });
      }
    }
    const c = byId(bomb.carrier);
    if (c) bomb.pos = clone(c.pos);

    // planting: the carrier holds Use inside a site, standing on the ground
    if (c && c.alive) {
      const site = siteAt(sites, c.pos);
      if (site && holdingUse(c) && c.grounded) {
        if (!bomb.plant) world.events.push({ type: 'plantStart', player: c.id, site });
        bomb.plant = { player: c.id, ticks: (bomb.plant?.ticks ?? 0) + 1 };
        useRoot(c, true);
        if (bomb.plant.ticks >= secTicks(r.bombPlantSec, dt)) {
          useRoot(c, false);
          bomb.plant = null;
          bomb.carrier = null;
          bomb.pos = clone(c.pos);
          bomb.planted = {
            site,
            tick: world.tick,
            explodeAt: world.tick + secTicks(r.bombFuseSec, dt),
            by: c.id,
          };
          world.events.push({ type: 'bombPlanted', player: c.id, site, pos: clone(bomb.pos) });
        }
      } else if (bomb.plant) {
        useRoot(c, false);
        bomb.plant = null;
        world.events.push({ type: 'plantCancel', player: c.id });
      }
    }
    if (!bomb.planted && roundOver) return { winner: defenders, reason: 'time' };
    return null;
  }

  // ---- planted: the fuse runs, defenders try to defuse ----
  const pl = bomb.planted;
  // defusing: a living defender next to the bomb holding Use, on the ground (one at a time)
  let d = byId(bomb.defuse?.player ?? null);
  if (
    d &&
    !(d.alive && holdingUse(d) && d.grounded && len(sub(d.pos, bomb.pos)) <= r.bombUseRadius)
  ) {
    useRoot(d, false);
    bomb.defuse = null;
    world.events.push({ type: 'defuseCancel', player: d.id });
    d = undefined;
  }
  if (!bomb.defuse) {
    const nd = world.players.find(
      (p) =>
        p.alive &&
        p.team === defenders &&
        p.grounded &&
        holdingUse(p) &&
        len(sub(p.pos, bomb.pos)) <= r.bombUseRadius,
    );
    if (nd) {
      bomb.defuse = { player: nd.id, ticks: 0 };
      world.events.push({ type: 'defuseStart', player: nd.id });
      d = nd;
    }
  }
  // the fuse wins a tie: it has to be defused *before* the tick it goes off
  if (world.tick >= pl.explodeAt) {
    if (d) useRoot(d, false);
    bomb.defuse = null;
    bomb.exploded = true;
    bombBlast(world, ctx, bomb.pos, pl.by);
    return { winner: attackers, reason: 'exploded' };
  }
  if (bomb.defuse && d) {
    bomb.defuse.ticks++;
    useRoot(d, true);
    if (bomb.defuse.ticks >= secTicks(r.bombDefuseSec, dt)) {
      useRoot(d, false);
      bomb.defused = true;
      world.events.push({ type: 'bombDefused', player: d.id });
      return { winner: defenders, reason: 'defused' };
    }
  }
  return null;
};

/** The bomb goes off at `pos`: deadly close by, less damage further out (`by` gets the kills). */
export const bombBlast = (world: WorldState, ctx: SimContext, pos: Vec3, by: number): void => {
  const r = ctx.config.rules;
  world.events.push({ type: 'bombExploded', pos: clone(pos) });
  for (const p of world.players) {
    if (!p.alive) continue;
    const dist = len(sub(p.pos, pos));
    if (dist >= r.bombDamageRadius) continue;
    const dmg =
      dist <= r.bombKillRadius
        ? 9999
        : 100 * (1 - (dist - r.bombKillRadius) / (r.bombDamageRadius - r.bombKillRadius));
    applyDamage(world, ctx, by, p, dmg, 'bomb', false, p.pos, pos);
  }
};

/** A player left mid-round: if they carried the bomb it drops where they were. */
export const bombPlayerLeft = (bomb: BombState, world: WorldState, id: number): void => {
  if (bomb.carrier !== id) return;
  const p = world.players.find((q) => q.id === id);
  bomb.carrier = null;
  if (p) bomb.pos = clone(p.pos);
  bomb.plant = null;
};

/**
 * Where bots should go in bomb mode, and whether they should hold Use there.
 * Attackers: the carrier heads for its chosen site and plants; the others go with it.
 * Defenders: split between the sites; once it's planted everyone goes for the bomb and the
 * nearest one defuses. A dropped bomb: the nearest attacker fetches it.
 */
export const bombBotObjectives = (
  bomb: BombState,
  world: WorldState,
  ctx: SimContext,
  attackers: 0 | 1,
  targetSite: 'A' | 'B',
): Record<number, { goal: Vec3 | null; use: boolean; first: boolean }> => {
  const out: Record<number, { goal: Vec3 | null; use: boolean; first: boolean }> = {};
  const sites = ctx.level.def.bombSites ?? [];
  const centre = (s: BombSiteDef) =>
    v3((s.min.x + s.max.x) / 2, s.min.y + 0.5, (s.min.z + s.max.z) / 2);
  const target = sites.find((s) => s.name === targetSite) ?? sites[0];
  const alive = world.players.filter((p) => p.alive);
  for (const p of world.players) out[p.id] = { goal: null, use: false, first: false };
  const atk = alive.filter((p) => p.team === attackers);
  const def = alive.filter((p) => p.team !== attackers);
  if (bomb.planted) {
    let nearest: PlayerState | null = null;
    for (const p of def)
      if (!nearest || len(sub(p.pos, bomb.pos)) < len(sub(nearest.pos, bomb.pos))) nearest = p;
    for (const p of def)
      out[p.id] = { goal: clone(bomb.pos), use: p === nearest, first: p === nearest };
    for (const p of atk) out[p.id] = { goal: clone(bomb.pos), use: false, first: false };
    return out;
  }
  if (!target) return out;
  const aim = centre(target);
  if (bomb.carrier === null) {
    let nearest: PlayerState | null = null;
    for (const p of atk)
      if (!nearest || len(sub(p.pos, bomb.pos)) < len(sub(nearest.pos, bomb.pos))) nearest = p;
    for (const p of atk)
      out[p.id] = { goal: p === nearest ? clone(bomb.pos) : aim, use: false, first: p === nearest };
  } else {
    for (const p of atk) {
      const carrying = p.id === bomb.carrier;
      const inSite = siteAt(sites, p.pos) !== null;
      out[p.id] = { goal: aim, use: carrying && inSite, first: carrying };
    }
  }
  def.forEach((p, i) => {
    const s = sites[i % Math.max(1, sites.length)];
    out[p.id] = { goal: s ? centre(s) : null, use: false, first: false };
  });
  return out;
};
