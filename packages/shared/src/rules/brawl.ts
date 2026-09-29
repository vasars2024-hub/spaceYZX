// Brawl: the quick drop-in mode (one-click Play). Two variants: 'tdm' (two teams, first team to
// 50 kills) and 'ffa' (everyone against everyone, first to 20 kills; the sim runs with
// `ctx.ffa`). No rounds: the dead are back after ~2 s at a safe spawn (far from enemies, out of
// their sight) with a short spawn protection (the shield; it ends early when you attack). A
// 5-minute timer caps a match; then a results screen and the next Brawl starts on the next map
// of the rotation (the caller changes the map: `updateBrawl` returns true when it is time).
// Players join and leave mid-match. Deterministic (the world's seeded RNG), shared by the
// server's public/private Brawl rooms and offline Brawl vs bots.
import type { Vec3 } from '../math/vec3';
import { v3, clone, len, sub } from '../math/vec3';
import { rngInt, rngShuffle } from '../math/rng';
import { lineOfSight } from '../level/collision';
import type { SpawnDef } from '../level/types';
import { MAPS, type MapInfo } from '../level/maps/index';
import { isEnemy, type SimContext } from '../sim/context';
import type { PlayerState, WorldState } from '../sim/state';
import type { SimEvent } from '../sim/events';
import { respawnPlayer } from '../sim/world';
import { eyePos } from '../sim/movement';
import { clearPowerups } from '../sim/powerups';
import type { BotMemory } from '../bots/brain';
import { type BrawlSettings, brawlSettings } from '../config/brawl';
import { updateRoundPowerups, botPowerupGoal } from './powerups';

export type BrawlVariant = 'tdm' | 'ffa';
export const BRAWL_VARIANTS: readonly BrawlVariant[] = ['tdm', 'ffa'];
/** 'live': fighting; 'end': the results screen (everyone frozen) until the next Brawl */
export type BrawlPhase = 'live' | 'end';
/** 'score': someone reached the kill target; 'time': the timer ran out */
export type BrawlEndReason = 'score' | 'time' | '';

export interface BrawlState {
  variant: BrawlVariant;
  settings: BrawlSettings;
  phase: BrawlPhase;
  /** the running match's first tick and the tick its timer runs out */
  startTick: number;
  endsTick: number;
  /** 'end': the tick the results are over */
  phaseEnds: number;
  /** TDM: kills per team (team kills and deaths by the map don't count) */
  scores: [number, number];
  /** TDM: the winning team; FFA: the winning player's id; null = a draw (or still running) */
  winner: number | null;
  endReason: BrawlEndReason;
  /** dead player id -> tick they died (respawn timer) */
  deadSince: Record<number, number>;
  /** player id -> tick their spawn protection ends */
  protectUntil: Record<number, number>;
  /** spawn point index -> the tick someone last (re)spawned there (spawn-camp protection) */
  spawnUsed: Record<number, number>;
  /** Brawls started so far (1 = the first) */
  matchNo: number;
  /** power-ups: the running cycle's first tick and how many it spawned */
  powerupsSince: number;
  powerupsSpawned: number;
}

const secTicks = (s: number, dt: number) => Math.round(s / dt);

export const createBrawl = (
  variant: BrawlVariant = 'tdm',
  settings: Partial<BrawlSettings> = {},
): BrawlState => ({
  variant,
  settings: brawlSettings(settings),
  phase: 'live',
  startTick: 0,
  endsTick: 0,
  phaseEnds: 0,
  scores: [0, 0],
  winner: null,
  endReason: '',
  deadSince: {},
  protectUntil: {},
  spawnUsed: {},
  matchNo: 0,
  powerupsSince: 0,
  powerupsSpawned: 0,
});

/** Kills to win: a player's in FFA, a team's in TDM. */
export const brawlTarget = (bs: Pick<BrawlState, 'variant' | 'settings'>): number =>
  bs.variant === 'ffa' ? bs.settings.ffaKills : bs.settings.tdmKills;

// ---------------------------------------------------------------- maps

/**
 * The Brawl map rotation: the big Brawl maps first (Colossus Yard), then the competitive maps
 * (never Arena / race tracks).
 */
export const brawlMaps = (maps: readonly MapInfo[] = MAPS): MapInfo[] => {
  const ok = maps.filter((m) => !m.arena && !m.race);
  return [...ok.filter((m) => m.brawl), ...ok.filter((m) => !m.brawl && m.competitive)];
};

/** The map a Brawl (and the offline Free fight) plays unless another one is picked. */
export const DEFAULT_BRAWL_MAP = (maps: readonly MapInfo[] = MAPS): string =>
  brawlMaps(maps)[0]?.id ?? maps[0].id;

/** The map after `current` in the rotation (the first one if `current` isn't in it). */
export const nextBrawlMap = (current: string, maps: readonly MapInfo[] = MAPS): string => {
  const list = brawlMaps(maps);
  if (!list.length) return current;
  const i = list.findIndex((m) => m.id === current);
  return list[(i + 1) % list.length].id;
};

// ---------------------------------------------------------------- spawns

/**
 * The safest spawn point for `p` right now: as far from the living enemies as possible
 * (distances past `safeFarM` all count the same), a point any enemy (within `sightM`) can see
 * counts `seenPenaltyM` nearer, and points someone stands on are avoided. Spawn-camp
 * protection: a point with an enemy within `denyM` is out (unless every point has one), and a
 * point used in the last `reuseSec` counts `reusePenaltyM` nearer, so a camper can't farm one
 * spot. Among the points within `spawnSlackM` of the best one a seeded pick decides, so spawns
 * don't become predictable.
 */
export const brawlSafeSpawn = (
  bs: BrawlState,
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
): SpawnDef => {
  const s = bs.settings;
  const spawns = ctx.level.def.spawns;
  if (spawns.length <= 1) return spawns[0];
  const m = ctx.config.movement;
  const foes = world.players.filter((q) => q.alive && isEnemy(ctx, q, p));
  const others = world.players.filter((q) => q.alive && q.id !== p.id);
  const eyes = foes.map((f) => eyePos(f, m));
  const recent = secTicks(s.reuseSec, ctx.dt);
  const scored = spawns.map((sp, i) => {
    const eye = v3(sp.pos.x, sp.pos.y + m.standHeight - 0.1, sp.pos.z);
    let closest = Infinity;
    for (const f of foes) closest = Math.min(closest, len(sub(f.pos, sp.pos)));
    let score = Math.min(closest, s.safeFarM);
    // an enemy right at the point: never there (a camper standing in the spawn)
    if (closest < s.denyM) score -= 500;
    // (only enemies near enough to matter are ray-tested)
    if (
      foes.some(
        (f, k) => len(sub(f.pos, sp.pos)) < s.sightM && lineOfSight(ctx.level, eyes[k], eye),
      )
    )
      score -= s.seenPenaltyM;
    const used = bs.spawnUsed[i];
    if (used !== undefined && world.tick - used < recent) score -= s.reusePenaltyM;
    if (others.some((q) => len(sub(q.pos, sp.pos)) < s.occupiedM + m.standHeight / 2))
      score -= 1000;
    return { sp, score };
  });
  let best = -Infinity;
  for (const x of scored) best = Math.max(best, x.score);
  const pool = scored.filter((x) => x.score >= best - s.spawnSlackM);
  return pool[rngInt(world.rng, pool.length)].sp;
};

const protect = (bs: BrawlState, world: WorldState, ctx: SimContext, p: PlayerState): void => {
  bs.protectUntil[p.id] = world.tick + secTicks(bs.settings.protectSec, ctx.dt);
  p.shield = true;
};

/** (Re)spawn `p` at `at` with spawn protection. */
const spawnAt = (
  bs: BrawlState,
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  at: SpawnDef,
): void => {
  respawnPlayer(world, p, at.pos, at.yawDeg, ctx.config);
  const i = ctx.level.def.spawns.indexOf(at);
  if (i >= 0) bs.spawnUsed[i] = world.tick;
  delete bs.deadSince[p.id];
  protect(bs, world, ctx, p);
};

/** Respawn `p` now at the safest spawn point. */
export const brawlRespawn = (
  bs: BrawlState,
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
): void => spawnAt(bs, world, ctx, p, brawlSafeSpawn(bs, world, ctx, p));

// ---------------------------------------------------------------- the match

/**
 * Start a Brawl (the first, or the next one after the results): scores and every player's
 * kills/deaths reset, the timer starts, everyone is placed and protected. TDM: each team on its
 * own side's spawns; FFA: spread over every spawn point of the map.
 */
export const startBrawl = (bs: BrawlState, world: WorldState, ctx: SimContext): void => {
  const t = world.tick;
  bs.phase = 'live';
  bs.matchNo++;
  bs.startTick = t;
  bs.endsTick = t + secTicks(bs.settings.timeLimitSec, ctx.dt);
  bs.phaseEnds = 0;
  bs.scores = [0, 0];
  bs.winner = null;
  bs.endReason = '';
  bs.deadSince = {};
  bs.protectUntil = {};
  bs.spawnUsed = {};
  bs.powerupsSince = t;
  bs.powerupsSpawned = 0;
  world.grenades = [];
  world.twins = [];
  clearPowerups(world);
  const all = ctx.level.def.spawns;
  const players = [...world.players].sort((a, b) => a.id - b.id);
  for (const p of players) {
    p.kills = 0;
    p.deaths = 0;
    p.teamKills = 0;
    p.damageDealt = 0;
  }
  if (bs.variant === 'ffa') {
    const spots = rngShuffle(world.rng, all);
    players.forEach((p, i) => spawnAt(bs, world, ctx, p, spots[i % spots.length]));
    return;
  }
  for (const team of [0, 1] as const) {
    const own = all.filter((s) => s.team === team || s.team === undefined);
    const spots = rngShuffle(world.rng, own.length ? own : all);
    players
      .filter((p) => p.team === team)
      .forEach((p, i) => spawnAt(bs, world, ctx, p, spots[i % spots.length]));
  }
};

/** The player who started an attack in this event (spawn protection ends), or null. */
const attackerOf = (e: SimEvent): number | null => {
  switch (e.type) {
    case 'throw':
    case 'slash':
    case 'laserWarn':
    case 'laserFire':
    case 'grenadeThrow':
    case 'gunFire':
    case 'windupStart':
      return e.player;
    case 'recallStart':
      return e.lethal ? e.player : null;
    default:
      return null;
  }
};

const endBrawl = (
  bs: BrawlState,
  world: WorldState,
  ctx: SimContext,
  winner: number | null,
  reason: BrawlEndReason,
): void => {
  bs.phase = 'end';
  bs.winner = winner;
  bs.endReason = reason;
  bs.phaseEnds = world.tick + secTicks(bs.settings.resultsSec, ctx.dt);
  bs.protectUntil = {};
  for (const p of world.players) {
    p.frozen = true;
    p.shield = false;
  }
  world.grenades = [];
  clearPowerups(world);
};

/**
 * One Brawl tick (call after `step()`). Returns true once the results screen is over: the
 * caller moves the room to the next map (`nextBrawlMap`) and calls `startBrawl` again.
 */
export const updateBrawl = (bs: BrawlState, world: WorldState, ctx: SimContext): boolean => {
  if (bs.phase === 'end') {
    for (const p of world.players) p.frozen = true; // (players who joined during the results)
    return world.tick >= bs.phaseEnds;
  }
  const s = bs.settings;
  // this tick's events: team kills count for TDM, attacking ends your spawn protection
  for (const e of world.events) {
    if (e.type === 'kill') {
      if (bs.variant !== 'tdm' || e.teamKill || e.attacker === e.victim) continue;
      const k = world.players.find((p) => p.id === e.attacker);
      if (k) bs.scores[k.team]++;
      continue;
    }
    const who = attackerOf(e);
    if (who !== null && bs.protectUntil[who] !== undefined) {
      delete bs.protectUntil[who];
      const p = world.players.find((q) => q.id === who);
      if (p) p.shield = false;
    }
  }
  // spawn protection: the shield stays up (even after absorbing a hit) until it runs out
  for (const p of world.players) {
    const until = bs.protectUntil[p.id];
    if (until === undefined) continue;
    if (!p.alive || world.tick >= until) {
      delete bs.protectUntil[p.id];
      p.shield = false;
    } else p.shield = true;
  }
  // respawns (the living are placed first: a spawn is judged against where everyone is now)
  const respawnTicks = secTicks(s.respawnSec, ctx.dt);
  for (const p of world.players) {
    if (p.alive) {
      delete bs.deadSince[p.id];
      continue;
    }
    bs.deadSince[p.id] ??= world.tick;
    if (world.tick - bs.deadSince[p.id] >= respawnTicks) brawlRespawn(bs, world, ctx, p);
  }
  // power-ups: one `powerupFirstSec` into every cycle (while a power-up point is free)
  if (world.tick - bs.powerupsSince >= secTicks(s.powerupCycleSec, ctx.dt)) {
    bs.powerupsSince = world.tick;
    bs.powerupsSpawned = 0;
  }
  bs.powerupsSpawned = updateRoundPowerups(world, ctx, bs.powerupsSince, bs.powerupsSpawned);
  // the kill target, then the timer
  const target = brawlTarget(bs);
  if (bs.variant === 'tdm') {
    const [a, b] = bs.scores;
    if (a >= target || b >= target) {
      endBrawl(bs, world, ctx, a === b ? null : a > b ? 0 : 1, 'score');
      return false;
    }
    if (world.tick >= bs.endsTick) endBrawl(bs, world, ctx, a === b ? null : a > b ? 0 : 1, 'time');
    return false;
  }
  const table = brawlStandings(world);
  const top = table[0];
  if (top && top.kills >= target) {
    endBrawl(bs, world, ctx, top.id, 'score');
    return false;
  }
  if (world.tick >= bs.endsTick) {
    const second = table[1];
    const tied = !!second && second.kills === top?.kills && second.deaths === top?.deaths;
    endBrawl(bs, world, ctx, top && !tied ? top.id : null, 'time');
  }
  return false;
};

/** A player joined mid-match: straight in at a safe spawn (frozen during the results). */
export const brawlJoin = (bs: BrawlState, world: WorldState, ctx: SimContext, id: number): void => {
  const p = world.players.find((q) => q.id === id);
  if (!p) return;
  if (bs.phase === 'end') {
    p.frozen = true;
    return;
  }
  brawlRespawn(bs, world, ctx, p);
};

/** A player left: forget their timers. */
export const brawlLeave = (bs: BrawlState, id: number): void => {
  delete bs.deadSince[id];
  delete bs.protectUntil[id];
};

// ---------------------------------------------------------------- views

/** One scoreboard row. Score = 100 per kill + damage dealt to enemies. */
export interface BrawlRow {
  id: number;
  team: 0 | 1;
  kills: number;
  deaths: number;
  score: number;
}

/** Everyone, best first: most kills, then score, then fewest deaths. */
export const brawlStandings = (world: WorldState): BrawlRow[] =>
  world.players
    .map((p) => ({
      id: p.id,
      team: p.team,
      kills: p.kills,
      deaths: p.deaths,
      score: p.kills * 100 + Math.round(p.damageDealt),
    }))
    .sort((a, b) => b.kills - a.kills || b.score - a.score || a.deaths - b.deaths || a.id - b.id);

/** What clients are shown (the server sends it as `{ rules: 'brawl', ... }`). */
export interface BrawlView {
  variant: BrawlVariant;
  phase: BrawlPhase;
  startTick: number;
  endsTick: number;
  phaseEnds: number;
  target: number;
  scores: [number, number];
  winner: number | null;
  endReason: BrawlEndReason;
  matchNo: number;
  /** the map being played and the next one in the rotation */
  map: string;
  next: string;
  /** every player, best first */
  table: BrawlRow[];
  /** seconds until a dead player is back */
  respawnSec: number;
}

export const brawlView = (bs: BrawlState, world: WorldState, map: string): BrawlView => ({
  variant: bs.variant,
  phase: bs.phase,
  startTick: bs.startTick,
  endsTick: bs.endsTick,
  phaseEnds: bs.phaseEnds,
  target: brawlTarget(bs),
  scores: [bs.scores[0], bs.scores[1]],
  winner: bs.winner,
  endReason: bs.endReason,
  matchNo: bs.matchNo,
  map,
  next: nextBrawlMap(map),
  table: brawlStandings(world),
  respawnSec: bs.settings.respawnSec,
});

// ---------------------------------------------------------------- bots

/**
 * Bots hunt: each heads for the nearest living enemy (a power-up close by first), and fights
 * whoever it meets on the way. Nothing to do during the results.
 */
export const applyBrawlBotObjectives = (
  bs: BrawlState,
  world: WorldState,
  ctx: SimContext,
  mems: Iterable<BotMemory>,
): void => {
  for (const mem of mems) {
    mem.objectiveFirst = false;
    mem.useAt = null;
    mem.objective = null;
    if (bs.phase !== 'live') continue;
    const self = world.players.find((p) => p.id === mem.id);
    if (!self?.alive) continue;
    let best: Vec3 | null = null;
    let bestD = Infinity;
    for (const q of world.players) {
      if (!q.alive || !isEnemy(ctx, q, self)) continue;
      const d = len(sub(q.pos, self.pos));
      if (d < bestD) {
        bestD = d;
        best = q.pos;
      }
    }
    mem.objective = botPowerupGoal(world, ctx, mem.id) ?? (best ? clone(best) : null);
  }
};
