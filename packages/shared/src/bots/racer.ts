// Bot racers: drive along a race track's racing line (LevelDef.race.line — the safe route) with
// the normal player inputs, so they obey exactly the same movement as everyone else. Also the
// "realistic pace" driver of the track timing test (sprinting, no slides, no surges, no
// shortcuts). Deterministic: a per-bot seeded RNG, no clocks.
//
// Line nodes are feet positions in order; `jump` nodes are take-off edges (and the spots under
// a zip-rail's start: the jump grabs the rail). Launch pads, portals and mantles need no input.
// A bot that stops making progress hops, and after a while holds the respawn key.
import type { Vec3 } from '../math/vec3';
import { v3, sub, dot, len, UP } from '../math/vec3';
import { qFromYawPitch } from '../math/quat';
import type { RngState } from '../math/rng';
import { rngFloat, rngFromSeed } from '../math/rng';
import type { SimContext } from '../sim/context';
import type { PlayerInput } from '../sim/input';
import { Btn } from '../sim/input';
import type { PlayerState, WorldState } from '../sim/state';
import type { RaceLineNode } from '../level/types';
import type { BotSkillName } from './brain';

export interface RacerSkill {
  /** chance, at each line node, to lose a moment (hesitate): lower is faster */
  hesitate: number;
  /** ticks lost per hesitation [min, max] */
  hesitateTicks: [number, number];
  /** uses its SURGE charges on long straights */
  surges: boolean;
}

/** Bot racer skills by bot difficulty (the same names as the combat bots). */
export const RACER_SKILLS: Record<BotSkillName, RacerSkill> = {
  rookie: { hesitate: 0.3, hesitateTicks: [20, 50], surges: false },
  casual: { hesitate: 0.2, hesitateTicks: [15, 40], surges: false },
  easy: { hesitate: 0.12, hesitateTicks: [10, 30], surges: false },
  normal: { hesitate: 0.05, hesitateTicks: [8, 20], surges: true },
  hard: { hesitate: 0, hesitateTicks: [0, 0], surges: true },
};

/** The timing test's driver: never hesitates, never surges (a steady sprint on the line). */
export const STEADY_RACER: RacerSkill = { hesitate: 0, hesitateTicks: [0, 0], surges: false };

export interface RacerMemory {
  id: number;
  skill: RacerSkill;
  rng: RngState;
  /** index of the line node heading for */
  node: number;
  /** gates passed when last seen (a change or a respawn re-syncs the node) */
  cp: number;
  lastPos: Vec3 | null;
  /** hesitation ticks left */
  wait: number;
  /** ticks without progress */
  stuck: number;
  /** ticks to keep holding the respawn key */
  reset: number;
  /** jump was pressed last tick (a jump needs a fresh press) */
  jumped: boolean;
  /** checkpoint section a surge was last used in (-1 = none yet) */
  surgedCp: number;
  /** ticks to keep Space held after a jump (a jetpack burn) */
  hold: number;
}

export const createRacerMemory = (id: number, skill: RacerSkill, seed: number): RacerMemory => ({
  id,
  skill,
  rng: rngFromSeed(seed),
  node: 0,
  cp: -1,
  lastPos: null,
  wait: 0,
  stuck: 0,
  reset: 0,
  jumped: false,
  surgedCp: -1,
  hold: 0,
});

const flat = (v: Vec3): Vec3 => v3(v.x, 0, v.z);

/** First line node of checkpoint section `cp` (where a racer with `cp` gates heads first). */
export const lineNodeForCp = (line: readonly RaceLineNode[], cp: number): number => {
  const i = line.findIndex((n) => n.cp >= cp);
  return i < 0 ? line.length - 1 : i;
};

/** The line node of section `cp` (from `first` on) nearest to a body position. */
const nearestNode = (
  line: readonly RaceLineNode[],
  pos: Vec3,
  first: number,
  cp: number,
): number => {
  const feet = v3(pos.x, pos.y - 0.9, pos.z);
  let best = first;
  let bestD = Infinity;
  for (let i = first; i < line.length && line[i].cp <= cp; i++) {
    const d = len(sub(line[i].pos, feet));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  // already between that node and the next one: head for the next
  const next = line[best + 1];
  if (next && !line[best].jump && !line[best].portal) {
    const ab = sub(next.pos, line[best].pos);
    if (dot(sub(feet, line[best].pos), ab) > 0) return best + 1;
  }
  return best;
};

/** View looking horizontally from `from` toward `to`. */
const lookAt = (from: Vec3, to: Vec3) => {
  const d = flat(sub(to, from));
  const yaw = len(d) < 1e-6 ? 0 : Math.atan2(-d.x, -d.z);
  return qFromYawPitch(yaw, 0, UP, v3(0, 0, -1));
};

/** One tick of a bot racer's inputs. */
export const racerThink = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  mem: RacerMemory,
): PlayerInput => {
  const tick = world.tick + 1;
  const race = ctx.level.def.race;
  const idle: PlayerInput = { tick, buttons: 0, view: p.view };
  if (!race || !race.line.length) return idle;
  const line = race.line;
  const n = race.checkpoints.length;
  const racing = p.raceCp >= 0 && p.raceCp <= n;
  // a new gate, or a teleport (portal, checkpoint respawn): re-sync the node
  const moved = mem.lastPos ? len(sub(p.pos, mem.lastPos)) : 0;
  mem.lastPos = { ...p.pos };
  if (racing && (p.raceCp !== mem.cp || moved > 8)) {
    const first = lineNodeForCp(line, p.raceCp);
    if (mem.node < first) mem.node = first;
    if (moved > 8) mem.node = nearestNode(line, p.pos, first, p.raceCp);
    mem.cp = p.raceCp;
    mem.stuck = 0;
  }
  // lobby, countdown, penalty, finished: stand still
  if (!racing || p.frozen) {
    if (!racing) mem.node = 0;
    mem.cp = p.raceCp;
    mem.stuck = 0;
    mem.jumped = false;
    return idle;
  }

  // holding the respawn key after being stuck
  if (mem.reset > 0) {
    mem.reset--;
    return { tick, buttons: Btn.Recall, view: p.view };
  }

  // advance past reached nodes (close enough, or past the node along the way in)
  const feet = v3(p.pos.x, p.pos.y - 0.9, p.pos.z);
  while (mem.node < line.length - 1) {
    const cur = line[mem.node];
    const next = line[mem.node + 1];
    const toCur = flat(sub(cur.pos, feet));
    const seg = flat(mem.node > 0 ? sub(cur.pos, line[mem.node - 1].pos) : sub(next.pos, cur.pos));
    const segLen = len(seg);
    const passed =
      segLen > 1e-6 && dot(flat(sub(feet, cur.pos)), seg) / segLen > (cur.jump ? -0.35 : 0);
    const near = len(toCur) < (cur.jump ? 0.6 : 1.6) && Math.abs(cur.pos.y - feet.y) < 3;
    // (a portal is only left by going through it: see the re-sync above)
    if (cur.portal || !(near || (passed && (len(toCur) < 6 || p.rail)))) break;
    if (cur.jump && !p.rail && (p.grounded || p.coyote > 0)) {
      mem.node++;
      mem.jumped = true;
      mem.hold = cur.jet ?? 0;
      const surge = cur.surge && p.surgeLeft > 0 ? Btn.Dash : 0;
      return { tick, buttons: Btn.Forward | Btn.Jump | surge, view: lookAt(p.pos, next.pos) };
    }
    mem.node++;
    if (cur.mag && !p.mag)
      return { tick, buttons: Btn.Forward | Btn.MagBoots, view: lookAt(p.pos, next.pos) };
    const sk = mem.skill;
    if (sk.hesitate > 0 && rngFloat(mem.rng) < sk.hesitate)
      mem.wait =
        sk.hesitateTicks[0] +
        Math.floor(rngFloat(mem.rng) * (sk.hesitateTicks[1] - sk.hesitateTicks[0] + 1));
  }
  const target = line[mem.node];
  const view = lookAt(p.pos, target.pos);
  if (p.rail) {
    mem.stuck = 0;
    mem.jumped = false;
    return { tick, buttons: 0, view };
  }

  // progress watchdog: hop when stuck, respawn at the checkpoint when really stuck
  const speed = len(flat(p.vel));
  mem.stuck = speed < 1 && mem.wait === 0 ? mem.stuck + 1 : Math.max(0, mem.stuck - 2);
  if (mem.stuck > 60 * 5) {
    mem.stuck = 0;
    mem.reset = Math.round(ctx.config.movement.raceRespawnHoldSec / ctx.dt) + 2;
    return { tick, buttons: Btn.Recall, view };
  }
  let buttons = 0;
  if (mem.wait > 0) mem.wait--;
  else buttons |= Btn.Forward;
  // a jetpack burn: let go of Space after the jump, then press and hold it in the air (a fresh
  // press in the air arms the jetpack; it lights after the hold time)
  if (mem.hold > 0) {
    mem.hold--;
    mem.stuck = 0;
    if (p.airTicks > 3) buttons |= Btn.Jump;
  }
  if (mem.stuck > 45 && mem.stuck % 30 === 0 && !mem.jumped) buttons |= Btn.Jump;
  // surge on a long straight (skilled bots): spread over the race, one per section at most
  if (mem.skill.surges && p.surgeLeft > 0 && p.grounded && mem.surgedCp !== p.raceCp) {
    const ahead = len(flat(sub(target.pos, feet)));
    const every = Math.ceil((n + 1) / Math.max(1, ctx.config.movement.raceSurgeCharges));
    if (ahead > 35 && p.raceCp % every === 0 && !target.jump) {
      buttons |= Btn.Dash;
      mem.surgedCp = p.raceCp;
    }
  }
  mem.jumped = (buttons & Btn.Jump) !== 0 && mem.hold === 0;
  return { tick, buttons, view };
};

export interface RaceRunReport {
  finished: boolean;
  /** race time (s) when finished, else the time driven */
  timeSec: number;
  /** seconds from GO at each gate passed */
  splitsSec: number[];
  /** checkpoint respawns (falls, or stuck) */
  respawns: number;
  /** where each respawn happened (feet), the gates passed then and the node heading for */
  falls: { pos: Vec3; cp: number; node: number }[];
  /** the furthest line node reached */
  node: number;
}

/**
 * Drive one bot racer along a track's racing line until it finishes (or `maxSec`): the time a
 * steady player needs on the safe route (the timing test, tools/race). The racer must already
 * be racing (raceCp 0, on the grid). `stepFn` is the world step (sim/world.ts `step`).
 */
export const driveRaceLine = (
  ctx: SimContext,
  world: WorldState,
  p: PlayerState,
  stepFn: (world: WorldState, inputs: Record<number, PlayerInput>, ctx: SimContext) => void,
  skill: RacerSkill = STEADY_RACER,
  maxSec = 400,
): RaceRunReport => {
  const race = ctx.level.def.race!;
  const mem = createRacerMemory(p.id, skill, 7);
  const start = world.tick;
  const splits: number[] = [];
  const falls: RaceRunReport['falls'] = [];
  let furthest = 0;
  let lastFeet = v3(p.pos.x, p.pos.y - 0.9, p.pos.z);
  const report = (finished: boolean): RaceRunReport => ({
    finished,
    timeSec: (world.tick - start) * ctx.dt,
    splitsSec: splits,
    respawns: falls.length,
    falls,
    node: furthest,
  });
  for (let t = 0; t < maxSec / ctx.dt; t++) {
    const input = racerThink(world, ctx, p, mem);
    stepFn(world, { [p.id]: input }, ctx);
    for (const e of world.events) {
      if (e.type === 'raceCp' && e.player === p.id) splits.push((world.tick - start) * ctx.dt);
      if (e.type === 'raceRespawn' && e.player === p.id)
        falls.push({ pos: lastFeet, cp: e.cp, node: mem.node });
    }
    furthest = Math.max(furthest, mem.node);
    lastFeet = v3(p.pos.x, p.pos.y - 0.9, p.pos.z);
    if (p.raceCp > race.checkpoints.length) return report(true);
  }
  return report(false);
};

/**
 * Drive one bot racer along any list of line nodes (a risky shortcut, a stretch of the safe
 * route) from where it stands until it is within 2 m of the last node: the track tests use it
 * to check that every shortcut can be run and how much time it saves.
 */
export const driveNodes = (
  ctx: SimContext,
  world: WorldState,
  p: PlayerState,
  nodes: RaceLineNode[],
  stepFn: (world: WorldState, inputs: Record<number, PlayerInput>, ctx: SimContext) => void,
  maxSec = 60,
): { reached: boolean; timeSec: number; respawns: number } => {
  const race = ctx.level.def.race!;
  const cp = Math.max(0, p.raceCp);
  const line = nodes.map((n) => ({ ...n, cp }));
  const sub_: SimContext = {
    ...ctx,
    level: { ...ctx.level, def: { ...ctx.level.def, race: { ...race, line } } },
  };
  const mem = createRacerMemory(p.id, STEADY_RACER, 7);
  mem.cp = p.raceCp;
  const goal = line[line.length - 1].pos;
  const start = world.tick;
  let respawns = 0;
  for (let t = 0; t < maxSec / ctx.dt; t++) {
    const input = racerThink(world, sub_, p, mem);
    stepFn(world, { [p.id]: input }, sub_);
    for (const e of world.events) if (e.type === 'raceRespawn' && e.player === p.id) respawns++;
    if (respawns) break;
    const feet = v3(p.pos.x, p.pos.y - 0.9, p.pos.z);
    if (len(flat(sub(goal, feet))) < 2 && Math.abs(goal.y - feet.y) < 2)
      return { reached: true, timeSec: (world.tick - start) * ctx.dt, respawns };
  }
  return { reached: false, timeSec: (world.tick - start) * ctx.dt, respawns };
};
