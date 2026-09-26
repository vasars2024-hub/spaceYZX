// The objective glitch (maps with LevelDef.objectiveGlitch, e.g. Orbital Ring): Tower mode and
// Bomb mode bleed into each other.
//
// Tower mode: a Controller carrier can also *plant* their Controller at bomb site A or B by
// holding Use (G) there for `glitchPlantSec`. It goes off `glitchFuseSec` later and wins the
// round for the planting team, unless an enemy holds Use next to it for `glitchDefuseSec`:
// then it is defused and returns to its team's home (the round goes on). One Controller can be
// planted at a time; while it ticks, the round timer waits for it. The other team can still
// win the normal ways (their own Tower touch, eliminating everyone).
// Bomb mode: the bomb carrier can also win by touching the defenders' Tower (match.ts).
//
// Deterministic; runs inside updateMatch.
import type { Vec3 } from '../math/vec3';
import { v3, clone, sub, len } from '../math/vec3';
import type { SimContext } from '../sim/context';
import type { WorldState, PlayerState } from '../sim/state';
import type { BombSiteDef } from '../level/types';
import { bombBlast, holdingUse, siteAt, useRoot } from './bomb';

/** The part of a team's Controller the glitch touches (match.ts ControllerState). */
export interface GlitchController {
  team: 0 | 1;
  carrier: number | null;
  droppedAt: Vec3 | null;
  droppedTick: number;
  pickup: { player: number; ticks: number } | null;
}

export interface GlitchState {
  /** a Controller carrier holding Use in a site: who, whose Controller, ticks so far */
  plant: { player: number; team: 0 | 1; ticks: number } | null;
  /** a planted Controller: whose, where, and the tick it goes off */
  planted: { team: 0 | 1; site: 'A' | 'B'; tick: number; explodeAt: number; by: number } | null;
  /** where the planted Controller lies (while planting: the planter) */
  pos: Vec3;
  defuse: { player: number; ticks: number } | null;
}

export const newGlitch = (): GlitchState => ({
  plant: null,
  planted: null,
  pos: v3(),
  defuse: null,
});

/** Does this map run the objective glitch (and have the sites for it)? */
export const glitchOn = (ctx: SimContext): boolean =>
  !!ctx.level.def.objectiveGlitch && (ctx.level.def.bombSites?.length ?? 0) > 0;

const secTicks = (s: number, dt: number) => Math.round(s / dt);

/**
 * One live tick of the glitch in Tower mode. `canPlant`: plants may start (live, no overtime).
 * `home(team)`: where a defused Controller goes. Returns the round result if it went off.
 */
export const updateGlitch = (
  g: GlitchState,
  world: WorldState,
  ctx: SimContext,
  controllers: readonly GlitchController[],
  home: (team: 0 | 1) => Vec3,
  canPlant: boolean,
): { winner: 0 | 1; reason: 'exploded' } | null => {
  const r = ctx.config.rules;
  const dt = ctx.dt;
  const sites = ctx.level.def.bombSites ?? [];
  const byId = (id: number | null | undefined) =>
    id === null || id === undefined ? undefined : world.players.find((p) => p.id === id);

  // ---- before a plant ----
  if (!g.planted) {
    const canHold = (p: PlayerState | undefined, team: 0 | 1): p is PlayerState =>
      !!p &&
      p.alive &&
      controllers[team].carrier === p.id &&
      holdingUse(p) &&
      p.grounded &&
      siteAt(sites, p.pos) !== null;
    if (g.plant) {
      const p = byId(g.plant.player);
      if (!canPlant || !canHold(p, g.plant.team)) {
        if (p) useRoot(p, false);
        world.events.push({ type: 'plantCancel', player: g.plant.player });
        g.plant = null;
      }
    }
    if (!g.plant && canPlant)
      for (const c of controllers) {
        const p = byId(c.carrier);
        if (!canHold(p, c.team)) continue;
        g.plant = { player: p.id, team: c.team, ticks: 0 };
        world.events.push({ type: 'plantStart', player: p.id, site: siteAt(sites, p.pos)! });
        break;
      }
    if (!g.plant) return null;
    const p = byId(g.plant.player)!;
    g.plant.ticks++;
    g.pos = clone(p.pos);
    useRoot(p, true);
    if (g.plant.ticks < secTicks(r.glitchPlantSec, dt)) return null;
    // planted: the Controller leaves its carrier and starts ticking
    useRoot(p, false);
    const c = controllers[g.plant.team];
    c.carrier = null;
    c.droppedAt = null;
    c.pickup = null;
    const site = siteAt(sites, p.pos)!;
    g.planted = {
      team: g.plant.team,
      site,
      tick: world.tick,
      explodeAt: world.tick + secTicks(r.glitchFuseSec, dt),
      by: p.id,
    };
    g.plant = null;
    world.events.push({ type: 'bombPlanted', player: p.id, site, pos: clone(g.pos) });
    return null;
  }

  // ---- planted: the fuse runs, the other team tries to defuse ----
  const pl = g.planted;
  const defenders = (1 - pl.team) as 0 | 1;
  const canDefuse = (p: PlayerState | undefined): p is PlayerState =>
    !!p &&
    p.alive &&
    p.team === defenders &&
    holdingUse(p) &&
    p.grounded &&
    len(sub(p.pos, g.pos)) <= r.bombUseRadius;
  let d = byId(g.defuse?.player);
  if (g.defuse && !canDefuse(d)) {
    if (d) useRoot(d, false);
    world.events.push({ type: 'defuseCancel', player: g.defuse.player });
    g.defuse = null;
    d = undefined;
  }
  if (!g.defuse) {
    const nd = world.players.find((p) => canDefuse(p));
    if (nd) {
      g.defuse = { player: nd.id, ticks: 0 };
      world.events.push({ type: 'defuseStart', player: nd.id });
      d = nd;
    }
  }
  // the fuse wins a tie
  if (world.tick >= pl.explodeAt) {
    if (d) useRoot(d, false);
    g.defuse = null;
    bombBlast(world, ctx, g.pos, pl.by);
    return { winner: pl.team, reason: 'exploded' };
  }
  if (g.defuse && d) {
    g.defuse.ticks++;
    useRoot(d, true);
    if (g.defuse.ticks >= secTicks(r.glitchDefuseSec, dt)) {
      useRoot(d, false);
      world.events.push({ type: 'bombDefused', player: d.id });
      // the Controller goes home; its team has to fetch it again
      const c = controllers[pl.team];
      c.carrier = null;
      c.droppedAt = home(pl.team);
      c.droppedTick = world.tick;
      c.pickup = null;
      world.events.push({ type: 'controllerReturn', team: pl.team });
      g.planted = null;
      g.defuse = null;
    }
  }
  return null;
};

/** A player left mid-round: a plant or defuse they were holding stops. */
export const glitchPlayerLeft = (g: GlitchState, id: number): void => {
  if (g.plant?.player === id) g.plant = null;
  if (g.defuse?.player === id) g.defuse = null;
};

/**
 * Bots in Tower mode on a glitch map. With a Controller planted, the nearest enemy goes to
 * defuse it and the planting team's others guard it. Otherwise, on rounds where the bots chose
 * to plant (`plant`), Controller carriers head for `site` and plant there. Only the players
 * returned here change plans; everyone else keeps the normal Tower objectives.
 */
export const glitchBotObjectives = (
  g: GlitchState,
  world: WorldState,
  ctx: SimContext,
  controllers: readonly GlitchController[],
  plant: boolean,
  site: 'A' | 'B',
): Record<number, { goal: Vec3; use: boolean; first: boolean }> => {
  const out: Record<number, { goal: Vec3; use: boolean; first: boolean }> = {};
  const alive = world.players.filter((p) => p.alive);
  if (g.planted) {
    const team = g.planted.team;
    let nearest: PlayerState | null = null;
    for (const p of alive)
      if (p.team !== team && (!nearest || len(sub(p.pos, g.pos)) < len(sub(nearest.pos, g.pos))))
        nearest = p;
    if (nearest) out[nearest.id] = { goal: clone(g.pos), use: true, first: true };
    for (const p of alive)
      if (p.team === team && !controllers.some((c) => c.carrier === p.id))
        out[p.id] = { goal: clone(g.pos), use: false, first: false };
    return out;
  }
  if (!plant) return out;
  const sites = ctx.level.def.bombSites ?? [];
  const target = sites.find((s) => s.name === site) ?? sites[0];
  if (!target) return out;
  const aim = siteCentre(target);
  for (const c of controllers) {
    const p = alive.find((q) => q.id === c.carrier);
    if (!p) continue;
    out[p.id] = { goal: aim, use: siteAt(sites, p.pos) !== null, first: true };
  }
  return out;
};

const siteCentre = (s: BombSiteDef): Vec3 =>
  v3((s.min.x + s.max.x) / 2, s.min.y + 0.5, (s.min.z + s.max.z) / 2);
