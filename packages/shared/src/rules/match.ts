// Match rules: Controller & Tower objective, rounds, spawn lock, side swap, sudden death,
// hard cap. Deterministic and shared by the server and offline practice matches.
import type { Vec3 } from '../math/vec3';
import { v3, clone, sub, len } from '../math/vec3';
import { rngShuffle } from '../math/rng';
import type { SimContext } from '../sim/context';
import type { WorldState, PlayerState } from '../sim/state';
import type { TowerDef } from '../level/types';
import { respawnPlayer } from '../sim/world';
import { MODE_RULES, type ModeRules } from '../config/rules';
import type { RankedMode } from '../rating/global';
import type { BotMemory } from '../bots/brain';

export type MatchPhase = 'warmup' | 'spawnLock' | 'live' | 'roundEnd' | 'matchEnd';
export type RoundEndReason = 'tower' | 'elimination' | 'time' | 'draw';

export interface ControllerState {
  team: 0 | 1;
  carrier: number | null;
  droppedAt: Vec3 | null;
  droppedTick: number;
  pickup: { player: number; ticks: number } | null;
}

export interface RoundResult {
  winner: 0 | 1 | null;
  reason: RoundEndReason;
  tick: number;
}

export interface MatchState {
  mode: RankedMode;
  rules: ModeRules;
  phase: MatchPhase;
  phaseEnds: number;
  round: number;
  scores: [number, number];
  sideSwapped: boolean;
  suddenDeath: boolean;
  roundStart: number;
  roundEnds: number;
  matchStartTick: number;
  controllers: [ControllerState, ControllerState];
  rounds: RoundResult[];
  winner: 0 | 1 | null;
  endReason: string;
  revealed: number[];
  teamKillsTotal: [number, number]; // kills per team (tiebreak), team kills excluded
  carrierDamageByMate: Record<number, number>; // anti-grief: damage dealt to own carrier
  deadSince: Record<number, number>; // warmup respawns
}

const secTicks = (s: number, dt: number) => Math.round(s / dt);

export const createMatch = (mode: RankedMode): MatchState => ({
  mode,
  rules: { ...MODE_RULES[mode] },
  phase: 'warmup',
  phaseEnds: 0,
  round: 0,
  scores: [0, 0],
  sideSwapped: false,
  suddenDeath: false,
  roundStart: 0,
  roundEnds: 0,
  matchStartTick: 0,
  controllers: [newController(0), newController(1)],
  rounds: [],
  winner: null,
  endReason: '',
  revealed: [],
  teamKillsTotal: [0, 0],
  carrierDamageByMate: {},
  deadSince: {},
});

const newController = (team: 0 | 1): ControllerState => ({
  team,
  carrier: null,
  droppedAt: null,
  droppedTick: 0,
  pickup: null,
});

/** Which map side a team plays on this round. */
export const sideOf = (ms: MatchState, team: 0 | 1): 0 | 1 =>
  (team ^ (ms.sideSwapped ? 1 : 0)) as 0 | 1;

export const towerOf = (ms: MatchState, ctx: SimContext, team: 0 | 1): TowerDef | undefined => {
  const side = sideOf(ms, team);
  return ctx.level.def.towers.find((t) => t.team === side);
};

const homeOf = (ms: MatchState, ctx: SimContext, team: 0 | 1): Vec3 => {
  const side = sideOf(ms, team);
  const h = ctx.level.def.controllerHomes?.[side];
  if (h) return clone(h);
  const s = ctx.level.def.spawns.find((sp) => sp.team === side) ?? ctx.level.def.spawns[0];
  return v3(s.pos.x, s.pos.y + 0.9, s.pos.z);
};

const teamPlayers = (world: WorldState, team: 0 | 1): PlayerState[] =>
  world.players.filter((p) => p.team === team).sort((a, b) => a.id - b.id);

/** Start (or restart) a match from round 1. */
export const startMatch = (ms: MatchState, world: WorldState, ctx: SimContext): void => {
  ms.scores = [0, 0];
  ms.round = 0;
  ms.rounds = [];
  ms.sideSwapped = false;
  ms.suddenDeath = false;
  ms.winner = null;
  ms.endReason = '';
  ms.teamKillsTotal = [0, 0];
  ms.carrierDamageByMate = {};
  ms.matchStartTick = world.tick;
  for (const p of world.players) {
    p.kills = 0;
    p.deaths = 0;
    p.teamKills = 0;
    p.damageDealt = 0;
  }
  beginRound(ms, world, ctx);
};

export const beginRound = (ms: MatchState, world: WorldState, ctx: SimContext): void => {
  ms.round++;
  const r = ctx.config.rules;
  // random spawn per player on their side, no two players on the same spot
  for (const team of [0, 1] as const) {
    const side = sideOf(ms, team);
    const spawns = rngShuffle(
      world.rng,
      ctx.level.def.spawns.filter((s) => s.team === side || s.team === undefined),
    );
    teamPlayers(world, team).forEach((p, i) => {
      const s = spawns[i % Math.max(1, spawns.length)] ?? ctx.level.def.spawns[0];
      respawnPlayer(world, p, s.pos, s.yawDeg, ctx.config);
      p.frozen = true;
    });
  }
  // grenades/boomerang flight from the last round are gone
  world.grenades = [];
  // carriers: 1v1 each player carries their own; teams rotate the carrier each round
  for (const team of [0, 1] as const) {
    const ps = teamPlayers(world, team);
    const c = ms.controllers[team];
    c.carrier = ps.length ? ps[(ms.round - 1) % ps.length].id : null;
    c.droppedAt = null;
    c.pickup = null;
  }
  ms.phase = 'spawnLock';
  ms.phaseEnds = world.tick + secTicks(r.spawnLockSec, ctx.dt);
  ms.revealed = [];
  world.events.push({ type: 'roundStart', round: ms.round, suddenDeath: ms.suddenDeath });
};

const endRound = (
  ms: MatchState,
  world: WorldState,
  ctx: SimContext,
  winner: 0 | 1 | null,
  reason: RoundEndReason,
): void => {
  if (winner !== null) ms.scores[winner]++;
  ms.rounds.push({ winner, reason, tick: world.tick });
  ms.phase = 'roundEnd';
  ms.phaseEnds = world.tick + secTicks(ctx.config.rules.resultsSec, ctx.dt);
  for (const p of world.players) p.frozen = true;
  world.events.push({ type: 'roundEnd', round: ms.round, winner, reason });
};

const endMatch = (
  ms: MatchState,
  world: WorldState,
  ctx: SimContext,
  winner: 0 | 1 | null,
  reason: string,
): void => {
  ms.winner = winner;
  ms.endReason = reason;
  ms.phase = 'matchEnd';
  ms.phaseEnds = world.tick + secTicks(ctx.config.rules.matchResultsSec, ctx.dt);
  for (const p of world.players) p.frozen = true;
  world.events.push({ type: 'matchEnd', winner, reason });
};

/** Decide what happens after a round's results screen. */
const afterRound = (ms: MatchState, world: WorldState, ctx: SimContext): void => {
  const R = ms.rules;
  const [a, b] = ms.scores;
  if (ms.suddenDeath) {
    const last = ms.rounds[ms.rounds.length - 1];
    if (last?.winner !== null && last?.winner !== undefined)
      return endMatch(ms, world, ctx, last.winner, 'sudden death');
    const [ka, kb] = ms.teamKillsTotal;
    return endMatch(
      ms,
      world,
      ctx,
      ka === kb ? null : ka > kb ? 0 : 1,
      'total kills (sudden death draw)',
    );
  }
  if (a >= R.firstTo || b >= R.firstTo)
    return endMatch(ms, world, ctx, a > b ? 0 : 1, `first to ${R.firstTo}`);
  if (ms.round >= R.maxRounds) {
    if (a !== b) return endMatch(ms, world, ctx, a > b ? 0 : 1, 'most round wins');
    ms.suddenDeath = true;
  }
  if (!ms.sideSwapped && ms.round === Math.floor(R.maxRounds / 2)) ms.sideSwapped = true;
  beginRound(ms, world, ctx);
};

/** Call once per tick after `step()`. */
export const updateMatch = (ms: MatchState, world: WorldState, ctx: SimContext): void => {
  const r = ctx.config.rules;
  const dt = ctx.dt;

  // bookkeeping from this tick's events
  for (const e of world.events) {
    if (e.type === 'kill') {
      const killer = world.players.find((p) => p.id === e.attacker);
      if (killer && !e.teamKill && e.attacker !== e.victim) ms.teamKillsTotal[killer.team]++;
      for (const c of ms.controllers) {
        if (c.carrier === e.victim && ms.phase === 'live') {
          c.carrier = null;
          c.droppedAt = v3(e.pos.x, e.pos.y, e.pos.z);
          c.droppedTick = world.tick;
          c.pickup = null;
          world.events.push({ type: 'controllerDrop', team: c.team, pos: c.droppedAt });
        }
      }
    } else if (e.type === 'hit') {
      const attacker = world.players.find((p) => p.id === e.attacker);
      const carrierOf = attacker ? ms.controllers[attacker.team].carrier : null;
      if (attacker && carrierOf === e.victim && e.attacker !== e.victim)
        ms.carrierDamageByMate[attacker.id] = (ms.carrierDamageByMate[attacker.id] ?? 0) + e.damage;
    }
  }

  // hard cap: never run past 15 minutes
  if (
    ms.phase !== 'warmup' &&
    ms.phase !== 'matchEnd' &&
    world.tick - ms.matchStartTick >= secTicks(r.hardCapMin * 60, dt)
  ) {
    const [a, b] = ms.scores;
    const [ka, kb] = ms.teamKillsTotal;
    endMatch(
      ms,
      world,
      ctx,
      a !== b ? (a > b ? 0 : 1) : ka !== kb ? (ka > kb ? 0 : 1) : null,
      'time limit',
    );
    return;
  }

  switch (ms.phase) {
    case 'warmup': {
      // free play while waiting: respawn after a short delay
      for (const p of world.players) {
        if (p.alive) {
          delete ms.deadSince[p.id];
          continue;
        }
        ms.deadSince[p.id] ??= world.tick;
        if (world.tick - ms.deadSince[p.id] >= secTicks(r.warmupRespawnSec, dt)) {
          const spawns = ctx.level.def.spawns.filter((s) => s.team === p.team);
          const s = rngShuffle(world.rng, spawns)[0] ?? ctx.level.def.spawns[0];
          respawnPlayer(world, p, s.pos, s.yawDeg, ctx.config);
          delete ms.deadSince[p.id];
        }
      }
      return;
    }
    case 'spawnLock':
      if (world.tick >= ms.phaseEnds) {
        for (const p of world.players) p.frozen = false;
        ms.phase = 'live';
        ms.roundStart = world.tick;
        ms.roundEnds = world.tick + secTicks(ms.rules.roundSec * (ms.suddenDeath ? 0.5 : 1), dt);
        world.events.push({ type: 'roundLive', round: ms.round });
      }
      return;
    case 'roundEnd':
      if (world.tick >= ms.phaseEnds) afterRound(ms, world, ctx);
      return;
    case 'matchEnd':
      if (world.tick >= ms.phaseEnds) resetToWarmup(ms, world, ctx);
      return;
  }

  // ---- live ----
  // controller pickup / return
  for (const c of ms.controllers) {
    if (c.carrier !== null || !c.droppedAt) continue;
    const mates = teamPlayers(world, c.team).filter((p) => p.alive);
    const near = mates.find((p) => len(sub(p.pos, c.droppedAt!)) <= r.controllerPickupRadius);
    if (near) {
      if (c.pickup?.player === near.id) c.pickup.ticks++;
      else c.pickup = { player: near.id, ticks: 1 };
      if (c.pickup.ticks >= secTicks(r.controllerPickupSec, dt)) {
        c.carrier = near.id;
        c.droppedAt = null;
        c.pickup = null;
        world.events.push({ type: 'controllerPickup', team: c.team, player: near.id });
      }
    } else {
      c.pickup = null;
      if (world.tick - c.droppedTick >= secTicks(r.controllerReturnSec, dt)) {
        c.droppedAt = homeOf(ms, ctx, c.team);
        c.droppedTick = world.tick;
        world.events.push({ type: 'controllerReturn', team: c.team });
      }
    }
  }

  // Tower touch with the Controller wins the round instantly
  for (const c of ms.controllers) {
    if (c.carrier === null) continue;
    const carrier = world.players.find((p) => p.id === c.carrier);
    const tower = towerOf(ms, ctx, (1 - c.team) as 0 | 1);
    if (!carrier || !carrier.alive || !tower) continue;
    const scale = ms.suddenDeath ? r.suddenDeathTowerScale : 1;
    const dx = carrier.pos.x - tower.pos.x;
    const dz = carrier.pos.z - tower.pos.z;
    const dy = carrier.pos.y - tower.pos.y;
    const reach = tower.radius * scale + r.towerTouchRadius;
    if (Math.hypot(dx, dz) <= reach && dy >= -1 && dy <= tower.height + 2) {
      world.events.push({ type: 'towerTouch', team: c.team, player: carrier.id });
      endRound(ms, world, ctx, c.team, 'tower');
      return;
    }
  }

  // elimination
  const alive: [number, number] = [0, 0];
  const hp: [number, number] = [0, 0];
  const present: [number, number] = [0, 0];
  for (const p of world.players) {
    present[p.team]++;
    if (p.alive) {
      alive[p.team]++;
      hp[p.team] += p.hp;
    }
  }
  if (present[0] > 0 && present[1] > 0) {
    if (alive[0] === 0 && alive[1] === 0) return endRound(ms, world, ctx, null, 'draw');
    if (alive[0] === 0) return endRound(ms, world, ctx, 1, 'elimination');
    if (alive[1] === 0) return endRound(ms, world, ctx, 0, 'elimination');
  }

  // timer
  if (world.tick >= ms.roundEnds) {
    if (alive[0] !== alive[1]) return endRound(ms, world, ctx, alive[0] > alive[1] ? 0 : 1, 'time');
    if (hp[0] !== hp[1]) return endRound(ms, world, ctx, hp[0] > hp[1] ? 0 : 1, 'time');
    return endRound(ms, world, ctx, null, 'draw');
  }

  // reveals: enemy carriers pulse through walls; everyone in the last seconds / sudden death
  const since = world.tick - ms.roundStart;
  const every = secTicks(ms.rules.carrierRevealEverySec, dt);
  const pulse = since % every < secTicks(r.carrierRevealSec, dt) && since >= every;
  const lastSeconds = ms.roundEnds - world.tick <= secTicks(r.lastSecondsRevealAll, dt);
  if (ms.suddenDeath || lastSeconds)
    ms.revealed = world.players.filter((p) => p.alive).map((p) => p.id);
  else if (pulse)
    ms.revealed = ms.controllers.map((c) => c.carrier).filter((id): id is number => id !== null);
  else ms.revealed = [];
};

/** Compact state for clients (HUD, markers). */
export const matchView = (ms: MatchState): MatchView => ({
  mode: ms.mode,
  phase: ms.phase,
  phaseEnds: ms.phaseEnds,
  round: ms.round,
  maxRounds: ms.rules.maxRounds,
  firstTo: ms.rules.firstTo,
  scores: ms.scores,
  sideSwapped: ms.sideSwapped,
  suddenDeath: ms.suddenDeath,
  roundEnds: ms.roundEnds,
  carriers: ms.controllers.map((c) => c.carrier).filter((id): id is number => id !== null),
  controllers: ms.controllers.map((c) => ({
    team: c.team,
    carrier: c.carrier,
    droppedAt: c.droppedAt,
    returnAt: c.droppedAt ? c.droppedTick : 0,
  })),
  revealed: ms.revealed,
  rounds: ms.rounds,
  winner: ms.winner,
  endReason: ms.endReason,
});

export interface MatchView {
  mode: RankedMode;
  phase: MatchPhase;
  phaseEnds: number;
  round: number;
  maxRounds: number;
  firstTo: number;
  scores: [number, number];
  sideSwapped: boolean;
  suddenDeath: boolean;
  roundEnds: number;
  carriers: number[];
  controllers: { team: 0 | 1; carrier: number | null; droppedAt: Vec3 | null; returnAt: number }[];
  revealed: number[];
  rounds: RoundResult[];
  winner: 0 | 1 | null;
  endReason: string;
}

/**
 * Where each bot should head when it isn't fighting: carriers run for the enemy Tower,
 * teammates pick up a dropped Controller or escort, and some defenders hunt the enemy carrier.
 */
export const botObjectives = (
  ms: MatchState,
  world: WorldState,
  ctx: SimContext,
): Record<number, Vec3 | null> => {
  const out: Record<number, Vec3 | null> = {};
  for (const p of world.players) out[p.id] = null;
  if (ms.phase !== 'live') return out;
  for (const team of [0, 1] as const) {
    const mine = ms.controllers[team];
    const theirs = ms.controllers[1 - team];
    const enemyTower = towerOf(ms, ctx, (1 - team) as 0 | 1);
    const ownTower = towerOf(ms, ctx, team);
    const ps = teamPlayers(world, team).filter((p) => p.alive);
    ps.forEach((p, i) => {
      if (mine.carrier === p.id && enemyTower) {
        out[p.id] = clone(enemyTower.pos);
      } else if (mine.droppedAt && i === 0) {
        out[p.id] = clone(mine.droppedAt);
      } else if (theirs.carrier !== null && i % 2 === 1) {
        const ec = world.players.find((q) => q.id === theirs.carrier);
        out[p.id] = ec ? clone(ec.pos) : ownTower ? clone(ownTower.pos) : null;
      } else if (mine.carrier !== null) {
        const c = world.players.find((q) => q.id === mine.carrier);
        out[p.id] = c ? clone(c.pos) : enemyTower ? clone(enemyTower.pos) : null;
      } else if (enemyTower) {
        out[p.id] = clone(enemyTower.pos);
      }
    });
  }
  return out;
};

/** Players who joined mid-round sit out until the next round. */
export const benchPlayer = (ms: MatchState, p: PlayerState): void => {
  if (ms.phase === 'live' || ms.phase === 'roundEnd') {
    p.alive = false;
    p.hp = 0;
  }
};

/** A player left: drop their Controller where they were. */
export const playerLeft = (ms: MatchState, world: WorldState, id: number): void => {
  const p = world.players.find((q) => q.id === id);
  for (const c of ms.controllers) {
    if (c.carrier !== id) continue;
    c.carrier = null;
    c.droppedAt = p ? clone(p.pos) : null;
    c.droppedTick = world.tick;
  }
};

/** After the results screen: back to warmup (everyone respawns, free play). */
export const resetToWarmup = (ms: MatchState, world: WorldState, ctx: SimContext): void => {
  ms.phase = 'warmup';
  ms.round = 0;
  ms.revealed = [];
  ms.controllers = [newController(0), newController(1)];
  for (const p of world.players) {
    const spawns = ctx.level.def.spawns.filter((s) => s.team === p.team || s.team === undefined);
    const s = rngShuffle(world.rng, spawns)[0] ?? ctx.level.def.spawns[0];
    respawnPlayer(world, p, s.pos, s.yawDeg, ctx.config);
  }
};

/** Point every bot at its objective; Controller carriers push it even while fighting. */
export const applyBotObjectives = (
  ms: MatchState,
  world: WorldState,
  ctx: SimContext,
  mems: Iterable<BotMemory>,
): void => {
  const obj = botObjectives(ms, world, ctx);
  for (const mem of mems) {
    mem.objective = obj[mem.id] ?? null;
    mem.objectiveFirst = ms.phase === 'live' && ms.controllers.some((c) => c.carrier === mem.id);
  }
};
