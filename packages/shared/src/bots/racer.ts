// Bot racers: drive along a race track's racing line (LevelDef.race.line) with the normal player
// inputs, so they obey exactly the same movement as everyone else — race movement included:
// Source-style air-strafing, bunny hops on the first ground tick, surfing (strafing into the
// ramp), and flights that land on target (airToward). Also the driver of the track timing tests
// (STEADY_RACER: a skilled run; HUMAN_RACER: sloppier strafing). Deterministic: a per-bot
// seeded RNG, no clocks.
//
// Line nodes are feet positions in order; `jump` nodes are take-off edges, `hop` nodes a
// bunny-hop chain, `surf` nodes the line along a surf ramp's face (curved ramps too: their line
// is dense), `strafe` a strafed flight, `air` a point to fly through (a window, a ring, a portal
// flown through). Launch pads, portals (turning ones too) and mantles need no input. Back from
// a fall in a surf map's restart bay, it drives the bay's way back (RaceGateDef.bayLine: the
// launch pad) and rejoins the racing line. A bot that stops making progress hops, and after a
// while holds the respawn key.
import type { Vec3 } from '../math/vec3';
import { v3, add, sub, dot, len, scale, cross, UP } from '../math/vec3';
import type { Quat } from '../math/quat';
import { qFromYawPitch } from '../math/quat';
import type { RngState } from '../math/rng';
import { rngFloat, rngFromSeed } from '../math/rng';
import type { SimContext } from '../sim/context';
import type { PlayerInput } from '../sim/input';
import { Btn } from '../sim/input';
import { slowZoneMul } from '../sim/movement';
import type { PlayerState, WorldState } from '../sim/state';
import type { RaceDef, RaceGateDef, RaceLineNode } from '../level/types';
import type { BotSkillName } from './brain';

export interface RacerSkill {
  /** chance, at each line node, to lose a moment (hesitate): lower is faster */
  hesitate: number;
  /** ticks lost per hesitation [min, max] */
  hesitateTicks: [number, number];
  /** uses its SURGE charges on long straights */
  surges: boolean;
  /**
   * how well it air-strafes (0..1, default 1): the share of air ticks it gets its keys and mouse
   * right; the rest it holds nothing (a human's sloppy strafes)
   */
  strafeEff?: number;
}

/** Bot racer skills by bot difficulty (the same names as the combat bots). */
export const RACER_SKILLS: Record<BotSkillName, RacerSkill> = {
  rookie: { hesitate: 0.3, hesitateTicks: [20, 50], surges: false, strafeEff: 0.65 },
  casual: { hesitate: 0.2, hesitateTicks: [15, 40], surges: false, strafeEff: 0.75 },
  easy: { hesitate: 0.12, hesitateTicks: [10, 30], surges: false, strafeEff: 0.85 },
  normal: { hesitate: 0.05, hesitateTicks: [8, 20], surges: true, strafeEff: 0.95 },
  hard: { hesitate: 0, hesitateTicks: [0, 0], surges: true },
};

/** The timing test's driver: never hesitates, never surges, strafes perfectly (a skilled run). */
export const STEADY_RACER: RacerSkill = { hesitate: 0, hesitateTicks: [0, 0], surges: false };
/** A decent human: strafes right about 60 % of the time in the air (the tracks' feasibility test). */
export const HUMAN_RACER: RacerSkill = {
  hesitate: 0,
  hesitateTicks: [0, 0],
  surges: false,
  strafeEff: 0.6,
};

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
  /** ticks spent wading in a slow zone (a canal) well below the line */
  wading: number;
  /** ticks to keep holding the respawn key */
  reset: number;
  /** jump was pressed last tick (a jump needs a fresh press) */
  jumped: boolean;
  /** checkpoint section a surge was last used in (-1 = none yet) */
  surgedCp: number;
  /** ticks to keep Space held after a jump (a jetpack burn) */
  hold: number;
  /**
   * the line it follows when not the track's own: back from a restart bay, the bay's way back
   * and then the racing line from where it joins (null: RaceDef.line)
   */
  line: RaceLineNode[] | null;
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
  wading: 0,
  reset: 0,
  jumped: false,
  surgedCp: -1,
  hold: 0,
  line: null,
});

/** Where a racer is coming back to right now: its section's anchor, else its checkpoint. */
const recoveryOf = (race: RaceDef, p: PlayerState): RaceGateDef | null => {
  const a = p.raceAnchor >= 0 ? race.anchors?.[p.raceAnchor] : undefined;
  if (a && a.cp === p.raceCp) return a;
  return p.raceCp > 0 ? (race.checkpoints[p.raceCp - 1] ?? null) : null;
};

const flat = (v: Vec3): Vec3 => v3(v.x, 0, v.z);

/** Time in the air of a bunny hop on the flat (a jump's up-and-down, MOVEMENT_PROFILE v1). */
const HOP_AIR_SEC = 0.7;
/** Keeping a hop chain's pace, a racer may land this far past the middle of a pad (m). */
const PAD_SLACK = 4;

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

/** View looking horizontally along `dir`. */
const lookAlong = (dir: Vec3): Quat => {
  const yaw = Math.atan2(-dir.x, -dir.z);
  return qFromYawPitch(yaw, 0, UP, v3(0, 0, -1));
};

/**
 * Source-style air-strafing toward a horizontal direction `want`: look along your velocity and
 * press A or D, so the wish direction is at right angles to your velocity — every tick adds
 * the most speed the air rules allow (raceAirWishCap) and bends your path toward `want`. Once
 * you are on course it alternates sides tick by tick (a zigzag too small to see) and keeps
 * gaining speed. Returns the view and the strafe key.
 */
export const strafeToward = (
  p: PlayerState,
  want: Vec3,
  tick: number,
): { view: Quat; buttons: number } => {
  const v = flat(p.vel);
  const s = len(v);
  const w = flat(want);
  const wl = len(w);
  if (s < 2 || wl < 1e-6) return { view: lookAlong(wl > 1e-6 ? w : v3(0, 0, -1)), buttons: 0 };
  const vd = scale(v, 1 / s);
  const wd = scale(w, 1 / wl);
  // the right-hand perpendicular of your velocity
  const right = cross(vd, UP);
  const side = dot(right, wd);
  const aligned = dot(vd, wd) > 0.999 && Math.abs(side) < 0.03;
  const turnRight = aligned ? tick % 2 === 0 : side > 0;
  return { view: lookAlong(vd), buttons: turnRight ? Btn.Right : Btn.Left };
};

/**
 * Air control toward a landing (race movement): arrive over `target` just as you come down to
 * its height. Too slow: strafe for speed (strafeToward). Too fast: a wish direction angled back
 * against your velocity sheds exactly what's too much. About right: turn toward it without
 * gaining. Returns the view and keys (a strafe key; none when on course).
 */
export const airToward = (
  p: PlayerState,
  target: Vec3,
  tick: number,
  cap: number,
  gravity: number,
  /**
   * keep up to this pace (a bunny-hop chain needs it for the next hop) as long as you still
   * come down no more than PAD_SLACK metres past the target
   */
  minSpeed = 0,
): { view: Quat; buttons: number } => {
  const feet = v3(p.pos.x, p.pos.y - 0.9, p.pos.z);
  const to = flat(sub(target, feet));
  const dist = len(to);
  const vy = p.vel.y;
  const drop = feet.y - target.y;
  const disc = vy * vy + 2 * gravity * drop;
  // time until you are back down at the target's height (its apex when it's above you)
  const t = disc >= 0 ? (vy + Math.sqrt(disc)) / gravity : Math.max(0.05, vy / gravity);
  const tt = Math.max(0.05, t);
  const want = Math.max(dist / tt, Math.min(minSpeed, (dist + PAD_SLACK) / tt));
  const v = flat(p.vel);
  const s = len(v);
  if (s < want - 0.3 || s < 2) return strafeToward(p, to, tick);
  const vd = scale(v, 1 / s);
  const wd = dist > 1e-6 ? scale(to, 1 / dist) : vd;
  const right = cross(vd, UP);
  const side = dot(right, wd) >= 0 ? 1 : -1;
  const off = Math.acos(Math.max(-1, Math.min(1, dot(vd, wd))));
  // along-velocity part of the wish: -cap turns without changing speed, more negative sheds
  let c = -cap;
  if (s > want + 0.3) {
    const d = Math.min(s - want, 3);
    c = -Math.sqrt(Math.max(cap * cap, s * s + cap * cap - (s - d) * (s - d)));
  } else if (off < 0.01) return { view: lookAlong(vd), buttons: 0 };
  const cos = Math.max(-1, Math.min(1, c / s));
  const sin = Math.sqrt(1 - cos * cos);
  const w = add(scale(vd, cos), scale(right, side * sin));
  // press D with the view turned so that "right" is the wish direction
  return { view: lookAlong(cross(UP, w)), buttons: Btn.Right };
};

/**
 * Surfing along a ramp's line from `a` to `b` (feet points on the face): strafe for speed
 * (strafeToward) while you ride at the line's height; once you have slipped down the face, push
 * straight into the ramp instead (the wish at right angles to the ramp, not to your velocity:
 * the most climb the air rules give).
 */
export const surfToward = (
  p: PlayerState,
  a: Vec3,
  b: Vec3,
  tick: number,
): { view: Quat; buttons: number } => {
  const feet = v3(p.pos.x, p.pos.y - 0.9, p.pos.z);
  const ab = sub(b, a);
  const abf = flat(ab);
  const l2 = dot(abf, abf);
  const t = l2 > 1e-6 ? Math.max(0, Math.min(1, dot(flat(sub(feet, a)), abf) / l2)) : 1;
  const lineY = a.y + ab.y * t;
  const below = lineY - feet.y;
  const toB = flat(sub(b, feet));
  if (below < 0.5 || l2 < 1e-6) return strafeToward(p, toB, tick);
  const dir = scale(abf, 1 / Math.sqrt(l2));
  const right = cross(dir, UP);
  // the line (up the face) is on this side of you
  const onLine = add(a, scale(ab, t));
  const side = dot(right, flat(sub(onLine, feet))) >= 0 ? 1 : -1;
  const w = scale(right, side);
  return { view: lookAlong(cross(UP, w)), buttons: Btn.Right };
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
  const n = race.checkpoints.length;
  const racing = p.raceCp >= 0 && p.raceCp <= n;
  // a new gate, or a teleport (portal, checkpoint respawn): re-sync the node
  const moved = mem.lastPos ? len(sub(p.pos, mem.lastPos)) : 0;
  mem.lastPos = { ...p.pos };
  if (racing && (p.raceCp !== mem.cp || moved > 8)) {
    const line = mem.line ?? race.line;
    const first = lineNodeForCp(line, p.raceCp);
    if (mem.node < first) mem.node = first;
    if (moved > 8) {
      // back at the checkpoint or anchor (a respawn): its restart bay's way back, or its
      // section from the start; else (a portal) the nearest point of it
      const rec = recoveryOf(race, p);
      const at = rec ? rec.respawn : race.start.respawn;
      const home = Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < 2;
      if (home && rec?.bayLine && rec.join !== undefined) {
        mem.line = [...rec.bayLine, ...race.line.slice(rec.join)];
        mem.node = 0;
      } else if (home) {
        mem.line = null;
        mem.node = lineNodeForCp(race.line, p.raceCp);
      } else mem.node = nearestNode(line, p.pos, first, p.raceCp);
    }
    mem.cp = p.raceCp;
    mem.stuck = 0;
  }
  const line = mem.line ?? race.line;
  // lobby, countdown, penalty, finished: stand still
  if (!racing || p.frozen) {
    if (!racing) {
      mem.node = 0;
      mem.line = null;
    }
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
    const airy = !!(cur.strafe || cur.surf || cur.air);
    const near =
      len(toCur) < (cur.jump ? 0.6 : airy ? 2.5 : 1.6) &&
      Math.abs(cur.pos.y - feet.y) < (airy ? 6 : 3);
    // (a portal is only left by going through it: see the re-sync above; a take-off edge only
    // by jumping off it, from the ground)
    if (cur.portal || !(near || (passed && (len(toCur) < (airy ? 14 : 6) || p.rail)))) break;
    if (cur.jump && !p.grounded && p.coyote === 0 && !p.rail) break;
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
  // race movement: bunny hops, surfing and strafed flights (see airToward)
  const prev = mem.node > 0 ? line[mem.node - 1] : null;
  const hop = !!prev?.hop;
  const surfing = !!(prev?.surf && target.surf);
  if (!p.grounded && !p.jetOn && mem.hold === 0 && p.airTicks > 1) {
    mem.stuck = 0;
    const m = ctx.config.movement;
    // (fly through windows and rings toward where you land next; on surf maps a portal flown
    // through is aimed at itself: what comes after it is on the other side)
    const surfMap = !!race.surf;
    let land = mem.node;
    while (line[land].air && !(surfMap && line[land].portal) && land < line.length - 1) land++;
    // (coming down onto a take-off edge: land a little short of it, then run and jump)
    let aim = line[land].pos;
    const before = land > 0 ? line[land - 1].pos : null;
    if (line[land].jump && before) {
      const back = flat(sub(before, aim));
      const bl = len(back);
      if (bl > 1e-6) aim = add(aim, scale(back, Math.min(2.5, bl / 2) / bl));
    }
    // (surf maps — boarding a surf ramp: its face runs on ahead, so fly at it without braking;
    // landing on a pad of a hop chain: keep the pace the next hop needs, past its middle)
    const after = line[land + 1];
    const pace =
      surfMap && line[land].hop && after?.hop
        ? len(flat(sub(after.pos, line[land].pos))) / HOP_AIR_SEC
        : 0;
    const air = surfing
      ? surfToward(p, prev!.pos, target.pos, tick)
      : surfMap && line[land].surf
        ? strafeToward(p, flat(sub(aim, feet)), tick)
        : airToward(p, aim, tick, m.raceAirWishCap, m.gravity, pace);
    let buttons = air.buttons;
    // a sloppy strafer lets go now and then (a fixed pattern: deterministic)
    // (holding the key into a surf ramp is easy: there only the aim is off, less often)
    const eff0 = mem.skill.strafeEff ?? 1;
    const eff = surfing && eff0 > 0 ? 1 - (1 - eff0) / 3 : eff0;
    if (eff < 1 && (tick * 0.618034) % 1 >= eff) buttons = 0;
    // bunny hops: tap Space on the way down (buffered, it fires on the landing tick)
    if (hop && p.vel.y < -1 && tick % 2 === 0) buttons |= Btn.Jump;
    mem.jumped = (buttons & Btn.Jump) !== 0;
    return { tick, buttons, view: air.view };
  }
  if (hop && p.grounded) {
    // landed on the pad you were heading for: head for the next one
    const t = flat(sub(target.pos, feet));
    // (anywhere on it: pads on surf maps are up to ~10 m across)
    if (
      target.hop &&
      len(t) < (race.surf ? 6 : 3.5) &&
      Math.abs(target.pos.y - feet.y) < 1.5 &&
      mem.node < line.length - 1
    )
      mem.node++;
    const next = line[mem.node];
    const v2 = lookAt(p.pos, next.pos);
    // jump on the first ground tick (a fresh press)
    const b2 = mem.jumped ? Btn.Forward : Btn.Forward | Btn.Jump;
    mem.jumped = !mem.jumped;
    return { tick, buttons: b2, view: v2 };
  }

  // progress watchdog: hop when stuck, respawn at the checkpoint when really stuck
  const speed = len(flat(p.vel));
  mem.stuck = speed < 1 && mem.wait === 0 ? mem.stuck + 1 : Math.max(0, mem.stuck - 2);
  // fell into shallow water under the line: wading keeps it moving, so the speed check above
  // never fires; give it 3 s to climb out, then respawn
  const wading = slowZoneMul(ctx.level.def, p.pos) < 1 && target.pos.y - feet.y > 3;
  mem.wading = wading ? mem.wading + 1 : 0;
  if (mem.stuck > 60 * 5 || mem.wading > 60 * 3) {
    mem.stuck = 0;
    mem.wading = 0;
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
  /**
   * where each respawn happened (feet), the gates passed then and the node heading for (its
   * index in the line the bot was following, and where it is)
   */
  falls: { pos: Vec3; cp: number; node: number; target: Vec3 | null }[];
  /** the furthest line node reached */
  node: number;
  /** the highest horizontal speed reached (m/s) */
  topSpeed: number;
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
  /** a memory to go on with (a racer already driving: tests of recoveries), else a fresh one */
  memory?: RacerMemory,
): RaceRunReport => {
  const race = ctx.level.def.race!;
  const mem = memory ?? createRacerMemory(p.id, skill, 7);
  const start = world.tick;
  const splits: number[] = [];
  const falls: RaceRunReport['falls'] = [];
  let furthest = 0;
  let topSpeed = 0;
  let lastFeet = v3(p.pos.x, p.pos.y - 0.9, p.pos.z);
  const report = (finished: boolean): RaceRunReport => ({
    finished,
    timeSec: (world.tick - start) * ctx.dt,
    splitsSec: splits,
    respawns: falls.length,
    falls,
    node: furthest,
    topSpeed,
  });
  for (let t = 0; t < maxSec / ctx.dt; t++) {
    const input = racerThink(world, ctx, p, mem);
    stepFn(world, { [p.id]: input }, ctx);
    for (const e of world.events) {
      if (e.type === 'raceCp' && e.player === p.id) splits.push((world.tick - start) * ctx.dt);
      if (e.type === 'raceRespawn' && e.player === p.id)
        falls.push({
          pos: lastFeet,
          cp: e.cp,
          node: mem.node,
          target: (mem.line ?? race.line)[mem.node]?.pos ?? null,
        });
    }
    furthest = Math.max(furthest, mem.node);
    topSpeed = Math.max(topSpeed, len(flat(p.vel)));
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
