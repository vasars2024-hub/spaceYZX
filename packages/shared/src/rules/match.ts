// Match rules: Controller & Tower objective, rounds, spawn lock, side swap, overtime (the
// collapse, or by a seeded roll the sky duel), hard cap. Deterministic and shared by the server and offline practice matches.
import type { Vec3 } from '../math/vec3';
import { v3, clone, sub, len } from '../math/vec3';
import { rngShuffle, rngFloat } from '../math/rng';
import { applyDamage } from '../sim/combat';
import type { SimContext } from '../sim/context';
import type { WorldState, PlayerState } from '../sim/state';
import type { TowerDef } from '../level/types';
import { respawnPlayer, newBoomerang, yawToView } from '../sim/world';
import { jetpackTuning } from '../sim/movement';
import { Move } from '../sim/state';
import { canTakeOver, takeOverBot } from '../sim/takeover';
import {
  type BombState,
  newBomb,
  updateBomb,
  attackingTeam,
  bombPlayerLeft,
  bombBotObjectives,
} from './bomb';
import { MODE_RULES, type ModeRules } from '../config/rules';
import type { LoadoutName } from '../config/loadout';
import type { RankedMode } from '../rating/global';
import type { BotMemory } from '../bots/brain';
import { clearPowerups } from '../sim/powerups';
import { updateRoundPowerups, botPowerupGoal } from './powerups';

export type MatchPhase = 'warmup' | 'spawnLock' | 'live' | 'roundEnd' | 'matchEnd';
export type RoundEndReason =
  'tower' | 'elimination' | 'time' | 'draw' | 'collapse' | 'sky' | 'exploded' | 'defused';

/** What a match is played for: carry your Controller to the enemy Tower, or plant/defuse. */
export type MatchObjective = 'tower' | 'bomb';

/**
 * Overtime after the round timer: the ship collapses toward `center` ('collapse'), or everyone
 * duels on the floating sky arena around `center` ('sky', level/sky-arena.ts).
 */
export interface OvertimeState {
  kind: 'collapse' | 'sky';
  start: number;
  ends: number;
  center: Vec3;
  /** collapse: zone radius (horizontal metres) when overtime started; sky: the arena's size */
  r0: number;
  /** collapse: player id -> ticks spent outside the zone in a row (unused in the sky) */
  outside: Record<number, number>;
}

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
  overtime: OvertimeState | null;
  objective: MatchObjective;
  /**
   * Kit: 'lethal' (Boomerang, Laser, Grenade) or 'cs' (AK + Deagle; CS mode = bomb + 'cs').
   * The sim reads it from the config (csConfig), this copy is for the rules and the HUD.
   */
  loadout: LoadoutName;
  /** bomb mode: this round's bomb (null otherwise) */
  bomb: BombState | null;
  /** bomb mode: the site the attacking bots go for this round */
  botSite: 'A' | 'B';
  /** power-ups this round has had so far (rules/powerups.ts) */
  powerupsSpawned: number;
}

const secTicks = (s: number, dt: number) => Math.round(s / dt);

export const createMatch = (
  mode: RankedMode,
  objective: MatchObjective = 'tower',
  loadout: LoadoutName = 'lethal',
): MatchState => ({
  objective,
  loadout,
  bomb: null,
  botSite: 'A',
  powerupsSpawned: 0,
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
  overtime: null,
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
      p.shield = ms.loadout !== 'cs'; // one free hit per round (Boomerang modes)
    });
  }
  // grenades/boomerang flight from the last round are gone (and power-ups, twins, freezes)
  world.grenades = [];
  clearPowerups(world);
  ms.powerupsSpawned = 0;
  // carriers: 1v1 each player carries their own; teams rotate the carrier each round
  for (const team of [0, 1] as const) {
    const ps = teamPlayers(world, team);
    const c = ms.controllers[team];
    c.carrier = ps.length ? ps[(ms.round - 1) % ps.length].id : null;
    c.droppedAt = null;
    c.pickup = null;
  }
  ms.overtime = null;
  if (ms.objective === 'bomb') {
    ms.bomb = newBomb(world, attackingTeam(ms.sideSwapped));
    ms.botSite = rngFloat(world.rng) < 0.5 ? 'A' : 'B';
  } else ms.bomb = null;
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
  ms.overtime = null;
  ms.phase = 'roundEnd';
  ms.phaseEnds = world.tick + secTicks(ctx.config.rules.resultsSec, ctx.dt);
  for (const p of world.players) p.frozen = true;
  clearPowerups(world);
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
  clearPowerups(world);
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
    // rounds always have a winner and max rounds is odd, so this is only a safety net
    if (a !== b) return endMatch(ms, world, ctx, a > b ? 0 : 1, 'most round wins');
    const [ka, kb] = ms.teamKillsTotal;
    const w = ka !== kb ? (ka > kb ? 0 : 1) : rngFloat(world.rng) < 0.5 ? 0 : 1;
    return endMatch(ms, world, ctx, w, 'total kills');
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
        ms.roundEnds =
          world.tick + secTicks(ms.objective === 'bomb' ? r.bombRoundSec : ms.rules.roundSec, dt);
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
  // power-ups in the middle of the map (lethal loadout; not once overtime has started)
  if (!ms.overtime)
    ms.powerupsSpawned = updateRoundPowerups(world, ctx, ms.roundStart, ms.powerupsSpawned);
  if (ms.objective === 'bomb') return updateBombRound(ms, world, ctx);

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
        const home = homeOf(ms, ctx, c.team);
        // (already waiting at home for a teammate: nothing returns)
        if (len(sub(c.droppedAt, home)) > 1e-3)
          world.events.push({ type: 'controllerReturn', team: c.team });
        c.droppedAt = home;
        c.droppedTick = world.tick;
      }
    }
  }

  // Tower touch with the Controller wins the round instantly (switched off in overtime)
  for (const c of ms.overtime ? [] : ms.controllers) {
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
    // both wiped out on the same tick: more kills so far, else a seeded coin flip
    if (alive[0] === 0 && alive[1] === 0)
      return endRound(ms, world, ctx, tieBreak(ms, world), 'elimination');
    if (alive[0] === 0) return endRound(ms, world, ctx, 1, 'elimination');
    if (alive[1] === 0) return endRound(ms, world, ctx, 0, 'elimination');
  }

  // timer: overtime starts (the Tower switches off; the ship collapses toward the middle, or
  // everyone is taken up to the sky duel)
  void hp;
  if (world.tick >= ms.roundEnds && !ms.overtime) startOvertime(ms, world, ctx);
  const ot = ms.overtime;
  if (ot?.kind === 'sky') {
    const res = updateSky(ot, world, ctx);
    if (res !== null) return endRound(ms, world, ctx, res, 'sky');
  } else if (ot) {
    const radius = collapseRadius(ot, world.tick, ctx);
    for (const p of world.players) {
      if (!p.alive) continue;
      const out = Math.hypot(p.pos.x - ot.center.x, p.pos.z - ot.center.z) > radius;
      if (!out) {
        delete ot.outside[p.id];
        continue;
      }
      ot.outside[p.id] = (ot.outside[p.id] ?? 0) + 1;
      if (ot.outside[p.id] >= secTicks(r.collapseOutsideSec, dt)) {
        applyDamage(world, ctx, p.id, p, 9999, 'world', false, p.pos, p.pos);
        delete ot.outside[p.id];
      }
    }
    if (world.tick >= ot.ends) {
      // still undecided: alive players, then HP, then who's nearer the middle, then a coin
      const a2: [number, number] = [0, 0];
      const hp2: [number, number] = [0, 0];
      const near: [number, number] = [0, 0];
      for (const p of world.players) {
        if (!p.alive) continue;
        a2[p.team]++;
        hp2[p.team] += p.hp;
        near[p.team] += Math.hypot(p.pos.x - ot.center.x, p.pos.z - ot.center.z);
      }
      const win: 0 | 1 =
        a2[0] !== a2[1]
          ? a2[0] > a2[1]
            ? 0
            : 1
          : hp2[0] !== hp2[1]
            ? hp2[0] > hp2[1]
              ? 0
              : 1
            : near[0] !== near[1]
              ? near[0] < near[1]
                ? 0
                : 1
              : rngFloat(world.rng) < 0.5
                ? 0
                : 1;
      return endRound(ms, world, ctx, win, 'collapse');
    }
  }

  // reveals: carriers are always shown (or pulse through walls, if the rule is off); everyone
  // in the last seconds / sudden death. 1v1 never reveals: you find your opponent yourself.
  if (ms.rules.teamSize <= 1) {
    ms.revealed = [];
    return;
  }
  const since = world.tick - ms.roundStart;
  const every = secTicks(ms.rules.carrierRevealEverySec, dt);
  const pulse = since % every < secTicks(r.carrierRevealSec, dt) && since >= every;
  const lastSeconds = ms.roundEnds - world.tick <= secTicks(r.lastSecondsRevealAll, dt);
  if (ms.suddenDeath || lastSeconds || ms.overtime)
    ms.revealed = world.players.filter((p) => p.alive).map((p) => p.id);
  else if (pulse || r.carrierAlwaysRevealed)
    ms.revealed = ms.controllers.map((c) => c.carrier).filter((id): id is number => id !== null);
  else ms.revealed = [];
};

/** A live tick of a bomb-mode round: the bomb, then eliminations. */
const updateBombRound = (ms: MatchState, world: WorldState, ctx: SimContext): void => {
  const bomb = ms.bomb;
  if (!bomb) return;
  const attackers = attackingTeam(ms.sideSwapped);
  const defenders = (1 - attackers) as 0 | 1;
  const res = updateBomb(bomb, world, ctx, attackers, world.tick >= ms.roundEnds);
  if (res) return endRound(ms, world, ctx, res.winner, res.reason);
  const alive: [number, number] = [0, 0];
  const present: [number, number] = [0, 0];
  for (const p of world.players) {
    present[p.team]++;
    if (p.alive) alive[p.team]++;
  }
  if (present[0] === 0 || present[1] === 0) return;
  // defenders all dead: attackers win (planted or not)
  if (alive[defenders] === 0) return endRound(ms, world, ctx, attackers, 'elimination');
  // attackers all dead before the plant: defenders win; after it, they still have to defuse
  if (alive[attackers] === 0 && !bomb.planted)
    return endRound(ms, world, ctx, defenders, 'elimination');
};

/** The middle of the map: where the collapse closes in (halfway between the two Towers). */
const mapMiddle = (ctx: SimContext): Vec3 => {
  const t = ctx.level.def.towers;
  if (t.length >= 2)
    return v3(
      (t[0].pos.x + t[1].pos.x) / 2,
      (t[0].pos.y + t[1].pos.y) / 2,
      (t[0].pos.z + t[1].pos.z) / 2,
    );
  const d = ctx.level.def;
  return v3((d.boundsMin.x + d.boundsMax.x) / 2, 0, (d.boundsMin.z + d.boundsMax.z) / 2);
};

/** The timer ran out: roll for the sky duel (maps with a sky arena), else the collapse. */
const startOvertime = (ms: MatchState, world: WorldState, ctx: SimContext): void => {
  const arena = ctx.level.def.skyArena;
  if (arena && rngFloat(world.rng) < ctx.config.rules.skyOvertimeChance) startSky(ms, world, ctx);
  else startCollapse(ms, world, ctx);
};

/**
 * Sky duel: every living player is taken to the floating arena, teams at opposite ends facing
 * each other, standing still, Boomerang back in hand, no grenades left flying, a full (sky)
 * jetpack tank. The Tower is off (like any overtime).
 */
const startSky = (ms: MatchState, world: WorldState, ctx: SimContext): void => {
  const arena = ctx.level.def.skyArena!;
  const m = ctx.config.movement;
  for (const team of [0, 1] as const) {
    const spots = arena.spawns.filter((s) => s.team === team);
    teamPlayers(world, team)
      .filter((p) => p.alive)
      .forEach((p, i) => {
        const s = spots[i % Math.max(1, spots.length)] ?? arena.spawns[0];
        // more players than spots: the next row stands a step further back
        const back = Math.floor(i / Math.max(1, spots.length)) * 1.5 * (team === 0 ? -1 : 1);
        p.pos = v3(s.pos.x + back, s.pos.y + m.standHeight / 2 + 0.01, s.pos.z);
        p.vel = v3();
        p.up = v3(0, 1, 0);
        p.view = yawToView(s.yawDeg);
        p.move = Move.Air;
        p.grounded = false;
        p.crouched = false;
        p.mantle = null;
        p.rail = null;
        p.mag = null;
        p.magT = 0;
        p.dashTicks = 0;
        p.coyote = 0;
        p.jumpBuffer = 0;
        p.jetOn = false;
        p.jetHold = -1;
        p.jetCd = 0;
        p.jetFuel = jetpackTuning(m, ctx.level.def, p.pos).fuel;
      });
  }
  for (const b of world.boomerangs) {
    const owner = world.players.find((p) => p.id === b.owner);
    if (owner) Object.assign(b, newBoomerang(owner.id, owner.pos));
  }
  world.grenades = [];
  world.twins = [];
  ms.overtime = {
    kind: 'sky',
    start: world.tick,
    ends: world.tick + secTicks(ctx.config.rules.skyOvertimeSec, ctx.dt),
    center: clone(arena.center),
    r0: arena.radius,
    outside: {},
  };
  world.events.push({ type: 'overtime', kind: 'sky' });
};

/**
 * A sky duel tick: falling too far below the arena ends you. At the time limit, if it's still
 * undecided: alive players, then HP, then who's nearer the arena's middle, then a coin.
 * Returns the round's winner once the time is up, else null.
 */
const updateSky = (ot: OvertimeState, world: WorldState, ctx: SimContext): 0 | 1 | null => {
  const r = ctx.config.rules;
  for (const p of world.players)
    if (p.alive && p.pos.y < ot.center.y - r.skyFallKillDepth)
      applyDamage(world, ctx, p.id, p, 9999, 'world', false, p.pos, p.pos);
  if (world.tick < ot.ends) return null;
  const a: [number, number] = [0, 0];
  const hp: [number, number] = [0, 0];
  const near: [number, number] = [0, 0];
  for (const p of world.players) {
    if (!p.alive) continue;
    a[p.team]++;
    hp[p.team] += p.hp;
    near[p.team] += Math.hypot(p.pos.x - ot.center.x, p.pos.z - ot.center.z);
  }
  if (a[0] !== a[1]) return a[0] > a[1] ? 0 : 1;
  if (hp[0] !== hp[1]) return hp[0] > hp[1] ? 0 : 1;
  if (near[0] !== near[1]) return near[0] < near[1] ? 0 : 1;
  return rngFloat(world.rng) < 0.5 ? 0 : 1;
};

const startCollapse = (ms: MatchState, world: WorldState, ctx: SimContext): void => {
  const r = ctx.config.rules;
  const center = mapMiddle(ctx);
  // start wide enough that nobody is caught outside the moment it begins
  let far = r.collapseMinRadius;
  for (const p of world.players)
    if (p.alive) far = Math.max(far, Math.hypot(p.pos.x - center.x, p.pos.z - center.z));
  ms.overtime = {
    kind: 'collapse',
    start: world.tick,
    ends: world.tick + secTicks(r.collapseMaxSec, ctx.dt),
    center,
    r0: far + 4,
    outside: {},
  };
  world.events.push({ type: 'overtime', kind: 'collapse' });
};

/** The safe zone's radius now: shrinks from r0 to the minimum over `collapseShrinkSec`. */
export const collapseRadius = (
  ot: Pick<OvertimeState, 'start' | 'r0'>,
  tick: number,
  ctx: Pick<SimContext, 'config' | 'dt'>,
): number => {
  const r = ctx.config.rules;
  const u = Math.min(1, Math.max(0, (tick - ot.start) / secTicks(r.collapseShrinkSec, ctx.dt)));
  return ot.r0 + (r.collapseMinRadius - ot.r0) * u;
};

/** Both teams wiped out together: more kills so far, else a seeded coin flip. */
const tieBreak = (ms: MatchState, world: WorldState): 0 | 1 => {
  const [ka, kb] = ms.teamKillsTotal;
  if (ka !== kb) return ka > kb ? 0 : 1;
  return rngFloat(world.rng) < 0.5 ? 0 : 1;
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
  objective: ms.objective,
  loadout: ms.loadout,
  attackers: ms.objective === 'bomb' ? attackingTeam(ms.sideSwapped) : null,
  bomb: ms.bomb
    ? {
        carrier: ms.bomb.carrier,
        pos: ms.bomb.pos,
        planted: ms.bomb.planted
          ? { site: ms.bomb.planted.site, explodeAt: ms.bomb.planted.explodeAt }
          : null,
        plant: ms.bomb.plant,
        defuse: ms.bomb.defuse,
      }
    : null,
  overtime: ms.overtime
    ? {
        kind: ms.overtime.kind,
        center: ms.overtime.center,
        r0: ms.overtime.r0,
        start: ms.overtime.start,
        ends: ms.overtime.ends,
      }
    : null,
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
  overtime: Pick<OvertimeState, 'kind' | 'center' | 'r0' | 'start' | 'ends'> | null;
  objective: MatchObjective;
  /** 'cs': CS mode (players are drawn dim, the HUD shows guns) */
  loadout: LoadoutName;
  /** bomb mode: which team attacks this half */
  attackers: 0 | 1 | null;
  bomb: {
    carrier: number | null;
    pos: Vec3;
    planted: { site: 'A' | 'B'; explodeAt: number } | null;
    plant: { player: number; ticks: number } | null;
    defuse: { player: number; ticks: number } | null;
  } | null;
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
  // sky duel: the Tower is off; stay on the arena and fight (drift back to its middle)
  if (ms.overtime?.kind === 'sky') {
    for (const p of world.players) if (p.alive) out[p.id] = clone(ms.overtime.center);
    return out;
  }
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

/** A player left: drop their Controller (or the bomb) where they were. */
export const playerLeft = (ms: MatchState, world: WorldState, id: number): void => {
  if (ms.bomb) bombPlayerLeft(ms.bomb, world, id);
  const p = world.players.find((q) => q.id === id);
  for (const c of ms.controllers) {
    if (c.carrier !== id) continue;
    c.carrier = null;
    c.droppedAt = p ? clone(p.pos) : null;
    c.droppedTick = world.tick;
  }
};

/** Can a dead player take over this bot teammate now? Only while the round is live. */
export const canTakeOverInMatch = (
  ms: MatchState,
  world: WorldState,
  humanId: number,
  botId: number,
): boolean => ms.phase === 'live' && canTakeOver(world, humanId, botId);

/**
 * A dead player takes over a bot teammate (the caller checks that it IS a bot): bodies swap
 * (sim/takeover), and whatever the bot was doing for the objective the human now does —
 * carrying the Controller, or standing on a dropped one.
 */
export const takeOverInMatch = (
  ms: MatchState,
  world: WorldState,
  humanId: number,
  botId: number,
): boolean => {
  if (!canTakeOverInMatch(ms, world, humanId, botId)) return false;
  takeOverBot(world, humanId, botId);
  const swap = (id: number) => (id === botId ? humanId : id === humanId ? botId : id);
  for (const c of ms.controllers) {
    if (c.carrier !== null) c.carrier = swap(c.carrier);
    if (c.pickup) c.pickup.player = swap(c.pickup.player);
  }
  ms.revealed = ms.revealed.map(swap);
  if (ms.bomb) {
    const b = ms.bomb;
    if (b.carrier !== null) b.carrier = swap(b.carrier);
    if (b.plant) b.plant.player = swap(b.plant.player);
    if (b.defuse) b.defuse.player = swap(b.defuse.player);
  }
  return true;
};

/** A team gave up (everyone left a ranked match): the other team wins now. */
export const forfeitMatch = (
  ms: MatchState,
  world: WorldState,
  ctx: SimContext,
  winner: 0 | 1,
): void => {
  if (ms.phase === 'warmup' || ms.phase === 'matchEnd') return;
  endMatch(ms, world, ctx, winner, 'forfeit');
};

/** After the results screen: back to warmup (everyone respawns, free play). */
export const resetToWarmup = (ms: MatchState, world: WorldState, ctx: SimContext): void => {
  ms.phase = 'warmup';
  ms.round = 0;
  ms.revealed = [];
  ms.controllers = [newController(0), newController(1)];
  clearPowerups(world);
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
  if (ms.objective === 'bomb') {
    const obj =
      ms.phase === 'live' && ms.bomb
        ? bombBotObjectives(ms.bomb, world, ctx, attackingTeam(ms.sideSwapped), ms.botSite)
        : {};
    for (const mem of mems) {
      const o = obj[mem.id];
      mem.objective = o?.goal ?? null;
      mem.objectiveFirst = !!o?.first;
      mem.useAt = o?.use ? (o.goal ?? null) : null;
      botSeekPowerup(ms, world, ctx, mem);
    }
    return;
  }
  const obj = botObjectives(ms, world, ctx);
  for (const mem of mems) {
    mem.objective = obj[mem.id] ?? null;
    mem.objectiveFirst =
      ms.phase === 'live' &&
      ms.overtime?.kind !== 'sky' &&
      ms.controllers.some((c) => c.carrier === mem.id);
    mem.useAt = null;
    botSeekPowerup(ms, world, ctx, mem);
  }
};

/** A bot with nothing urgent to do (not carrying, planting…) detours to a nearby power-up. */
const botSeekPowerup = (
  ms: MatchState,
  world: WorldState,
  ctx: SimContext,
  mem: BotMemory,
): void => {
  if (ms.phase !== 'live' || ms.overtime || mem.objectiveFirst || mem.useAt) return;
  const goal = botPowerupGoal(world, ctx, mem.id);
  if (goal) mem.objective = goal;
};
