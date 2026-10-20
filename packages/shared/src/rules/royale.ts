// Royale: the free-for-all elimination mode on the big royale maps (LevelDef.royale). Everyone
// for themselves (the sim runs with `ctx.ffa`), one life per round, no objectives, no
// respawns: the last player alive wins the round, and the first to win `winsToWin` rounds (3)
// wins the match. Each round:
//   - everyone starts at a fixed royale spawn point, the points picked as far apart as possible
//     (pickRoyaleSpawns), frozen for a short countdown
//   - the play zone shrinks in stages (wait, shrink, wait…) toward a final circle that wanders
//     inside the current one; outside it you lose HP every half second, more each stage. Later
//     rounds of a match run quicker on a smaller first circle (config/royale.ts)
//   - every so often every living player's position is flashed to everyone for 1.5 s, more often
//     the fewer are left (flashIntervalSec)
// Deterministic (the world's seeded RNG), shared by the server's Royale rooms and offline
// Royale vs bots. Online rooms wait in a 'lobby' (free play with respawns) until the host starts
// or the room is full.
import type { Vec3 } from '../math/vec3';
import { v3, clone, len, sub } from '../math/vec3';
import { rngFloat, rngInt, rngShuffle, type RngState } from '../math/rng';
import type { LevelDef, SpawnDef } from '../level/types';
import { MAPS, mapDef, type MapInfo } from '../level/maps/index';
import { isEnemy, type SimContext } from '../sim/context';
import type { PlayerState, WorldState } from '../sim/state';
import { respawnPlayer } from '../sim/world';
import { applyDamage } from '../sim/combat';
import { clearPowerups } from '../sim/powerups';
import type { BotMemory } from '../bots/brain';
import { loadoutOf } from '../config/loadout';
import {
  ROYALE_STAGES,
  type RoyaleSettings,
  type RoyaleStageDef,
  royaleSettings,
} from '../config/royale';

/**
 * 'lobby': online rooms waiting for players (free play, the dead come back); 'countdown':
 * everyone frozen at their round spawn; 'live': the fight; 'roundEnd': the round's placings
 * (frozen); 'end': the match results (frozen), then the lobby / the next match.
 */
export type RoyalePhase = 'lobby' | 'countdown' | 'live' | 'roundEnd' | 'end';

/** A circle of the play zone (horizontal: `center.y` is only where bots aim for). */
export interface RoyaleCircle {
  center: Vec3;
  radius: number;
}

/** One stage of a round's zone plan, in ticks. */
export interface RoyaleZoneStage extends RoyaleCircle {
  /** the zone holds still from here (the next circle, this stage's, is already known) */
  waitStart: number;
  /** ...closes in from here to `shrinkEnd`, ending as this stage's circle */
  shrinkStart: number;
  shrinkEnd: number;
  /** HP per second outside the zone during this stage */
  dps: number;
}

/** A round's whole zone: the first circle, then the stages (fixed when the round starts). */
export interface RoyaleZonePlan extends RoyaleCircle {
  stages: RoyaleZoneStage[];
}

/** The zone at one tick (royaleZoneAt). */
export interface RoyaleZoneNow extends RoyaleCircle {
  /** the stage running (0 = the first); stages.length once the zone has closed */
  stage: number;
  state: 'wait' | 'shrink' | 'closed';
  /** the circle it closes in to next (null once closed) */
  next: RoyaleCircle | null;
  /** the tick this wait / shrink ends (0 once closed) */
  until: number;
  dps: number;
}

/** A player out of the round: their place (1 = won the round). */
export interface RoyalePlacing {
  id: number;
  place: number;
  tick: number;
}

export interface RoyaleState {
  settings: RoyaleSettings;
  phase: RoyalePhase;
  /** countdown / roundEnd / end: the tick this phase is over */
  phaseEnds: number;
  /** matches started so far (1 = the first) */
  matchNo: number;
  /** the round of the running match (1 = the first; 0 = none yet) */
  round: number;
  /** the tick the running round went (or goes) live */
  liveTick: number;
  zone: RoyaleZonePlan | null;
  /** the players this round started with (ids, sorted) */
  entrants: number[];
  /** the royale spawn points this round uses (indices into royaleData(def).spawns) */
  spawnIdx: number[];
  /** this round's placings so far, the best last (the winner is added when it ends) */
  out: RoyalePlacing[];
  /** the round's winner (roundEnd / end), null while it runs */
  roundWinner: number | null;
  /** round wins this match, per player id */
  wins: Record<number, number>;
  /** sum of every finished round's place per player (tiebreak: a better average) */
  placeSum: Record<number, number>;
  /** every finished round's winner */
  rounds: { winner: number | null; tick: number }[];
  /** the match winner ('end'), null before */
  winner: number | null;
  /** location flashes: the next one starts at `nextFlash`, the running one shows until `flashUntil` */
  nextFlash: number;
  flashUntil: number;
  lastFlash: number;
  /** where everyone alive stood at the last flash (bots go hunting there) */
  flashPos: Record<number, Vec3>;
  /** players shown to everyone right now (the flash) */
  revealed: number[];
  /** lobby: dead player id -> tick they died */
  deadSince: Record<number, number>;
}

const secTicks = (s: number, dt: number) => Math.round(s / dt);

export const createRoyale = (settings: Partial<RoyaleSettings> = {}): RoyaleState => ({
  settings: royaleSettings(settings),
  phase: 'lobby',
  phaseEnds: 0,
  matchNo: 0,
  round: 0,
  liveTick: 0,
  zone: null,
  entrants: [],
  spawnIdx: [],
  out: [],
  roundWinner: null,
  wins: {},
  placeSum: {},
  rounds: [],
  winner: null,
  nextFlash: 0,
  flashUntil: 0,
  lastFlash: 0,
  flashPos: {},
  revealed: [],
  deadSince: {},
});

// ---------------------------------------------------------------- maps

/** Does this map have royale data (spawn points and a zone)? */
export const hasRoyale = (def: LevelDef): boolean => !!def.royale?.spawns.length;

/**
 * The maps Royale can be played on: maps in rotation flagged `royale` (MapInfo.royale: their
 * LevelDef has royale data; the flag spares building every map to find out). `defOf` builds a
 * flagged map to make sure (cached by mapDef).
 */
export const royaleMaps = (
  maps: readonly MapInfo[] = MAPS,
  defOf: (id: string) => LevelDef = mapDef,
): MapInfo[] => maps.filter((m) => m.royale && !m.retired && hasRoyale(defOf(m.id)));

/** The map Royale plays unless another is picked (null: no Royale map yet). */
export const DEFAULT_ROYALE_MAP = (
  maps: readonly MapInfo[] = MAPS,
  defOf: (id: string) => LevelDef = mapDef,
): string | null => royaleMaps(maps, defOf)[0]?.id ?? null;

/**
 * The map's royale data. A map without any (tests, tools) gets a stand-in: its normal spawn
 * points and a zone round the middle of its bounds covering the whole map.
 */
export const royaleData = (def: LevelDef): NonNullable<LevelDef['royale']> => {
  if (def.royale?.spawns.length) return def.royale;
  const cx = (def.boundsMin.x + def.boundsMax.x) / 2;
  const cz = (def.boundsMin.z + def.boundsMax.z) / 2;
  const y = def.spawns.length ? def.spawns.reduce((s, p) => s + p.pos.y, 0) / def.spawns.length : 0;
  const radius =
    Math.hypot(def.boundsMax.x - def.boundsMin.x, def.boundsMax.z - def.boundsMin.z) / 2;
  return { spawns: def.spawns, center: v3(cx, y, cz), radius };
};

// ---------------------------------------------------------------- spawns

/** Horizontal distance (spawn spreading and the zone are flat: x and z). */
const flat = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

/** The smallest gap between any two of these points (Infinity for fewer than two). */
export const minGap = (pts: readonly Vec3[]): number => {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) m = Math.min(m, flat(pts[i], pts[j]));
  return m;
};

/**
 * Pick `n` of the spawn points so they are as far apart from each other as possible (the
 * smallest gap between any two chosen points as large as possible). How: starting from every
 * point in turn, keep adding the point farthest from the ones chosen so far, then improve each
 * set by swapping single points while that widens its smallest gap. Every set whose smallest
 * gap is at least `slack` × the best one found may be picked; the seeded roll decides, so
 * rounds don't always start on the very same spots. Returns indices into `spawns`, sorted.
 * Fewer points than players: every point, then again from the first (the caller staggers
 * the doubles).
 */
export const pickRoyaleSpawns = (
  spawns: readonly SpawnDef[],
  n: number,
  rng: RngState,
  slack = 0.9,
): number[] => {
  const m = spawns.length;
  if (n <= 0 || m === 0) return [];
  if (n >= m) return Array.from({ length: n }, (_, i) => i % m);
  const d = (i: number, j: number) => flat(spawns[i].pos, spawns[j].pos);
  const gapOf = (set: number[]) => {
    let g = Infinity;
    for (let a = 0; a < set.length; a++)
      for (let b = a + 1; b < set.length; b++) g = Math.min(g, d(set[a], set[b]));
    return g;
  };
  const found = new Map<string, { set: number[]; gap: number }>();
  for (let start = 0; start < m; start++) {
    // greedy: always the point farthest from the chosen ones (ties: the lower index)
    const set = [start];
    const near = Array.from({ length: m }, (_, j) => d(start, j));
    while (set.length < n) {
      let best = -1;
      for (let j = 0; j < m; j++)
        if (!set.includes(j) && (best < 0 || near[j] > near[best])) best = j;
      set.push(best);
      for (let j = 0; j < m; j++) near[j] = Math.min(near[j], d(best, j));
    }
    // improve: swap one chosen point for an unchosen one while it widens the smallest gap
    let gap = gapOf(set);
    for (let pass = 0; pass < 8; pass++) {
      let better = false;
      for (let k = 0; k < set.length && !better; k++)
        for (let j = 0; j < m && !better; j++) {
          if (set.includes(j)) continue;
          const old = set[k];
          set[k] = j;
          const g = gapOf(set);
          if (g > gap + 1e-9) {
            gap = g;
            better = true;
          } else set[k] = old;
        }
      if (!better) break;
    }
    const sorted = [...set].sort((a, b) => a - b);
    found.set(sorted.join(','), { set: sorted, gap });
  }
  const all = [...found.values()].sort((a, b) => (a.set.join(',') < b.set.join(',') ? -1 : 1));
  const top = Math.max(...all.map((x) => x.gap));
  const pool = all.filter((x) => x.gap >= top * slack);
  return pool[rngInt(rng, pool.length)].set;
};

// ---------------------------------------------------------------- the zone

/**
 * How much this map stretches the zone's times: sqrt(radius / refRadiusM), within the
 * settings' limits. A 500 m zone (a ~1 km map) plays the stage times as written.
 */
export const royaleTimeScale = (radius: number, s: RoyaleSettings): number =>
  Math.min(s.maxTimeScale, Math.max(s.minTimeScale, Math.sqrt(Math.max(0, radius) / s.refRadiusM)));

/** Round `round` (1 = the first) of a match: its zone times × this (quicker each round). */
export const royaleRoundTimeFactor = (round: number, s: RoyaleSettings): number =>
  Math.max(s.minRoundTimeFactor, s.roundTimeFactor ** Math.max(0, round - 1));

/** Round `round` of a match: its first circle's radius × this (a little smaller each round). */
export const royaleRoundRadiusFactor = (round: number, s: RoyaleSettings): number =>
  Math.max(s.minRoundRadiusFactor, s.roundRadiusFactor ** Math.max(0, round - 1));

/**
 * The zone plan of a round going live at `liveTick`: the first circle (the map's royale circle,
 * smaller in later rounds), then every stage's circle. Each new circle lies wholly inside the
 * one before; its middle is a random waypoint that fits (somewhere players can stand), or a
 * random point when none does.
 */
export const planRoyaleZone = (
  def: LevelDef,
  liveTick: number,
  round: number,
  s: RoyaleSettings,
  rng: RngState,
  dt: number,
  stages: readonly RoyaleStageDef[] = ROYALE_STAGES,
): RoyaleZonePlan => {
  const data = royaleData(def);
  const r0 = data.radius * royaleRoundRadiusFactor(round, s);
  const k = royaleTimeScale(data.radius, s) * royaleRoundTimeFactor(round, s);
  const wps = def.waypoints ?? [];
  const out: RoyaleZoneStage[] = [];
  let c = clone(data.center);
  let r = r0;
  let t = liveTick;
  for (const st of stages) {
    const next = data.radius * st.radius * royaleRoundRadiusFactor(round, s);
    const room = Math.max(0, r - next);
    const fits = wps.filter((w) => flat(w.pos, c) <= room);
    let center: Vec3;
    if (fits.length) center = clone(fits[rngInt(rng, fits.length)].pos);
    else {
      const a = rngFloat(rng) * Math.PI * 2;
      const q = Math.sqrt(rngFloat(rng)) * room;
      center = v3(c.x + Math.cos(a) * q, c.y, c.z + Math.sin(a) * q);
    }
    const waitStart = t;
    const shrinkStart = waitStart + secTicks(st.waitSec * k, dt);
    const shrinkEnd = shrinkStart + Math.max(1, secTicks(st.shrinkSec * k, dt));
    out.push({ waitStart, shrinkStart, shrinkEnd, center, radius: next, dps: st.dps });
    c = center;
    r = next;
    t = shrinkEnd;
  }
  return { center: clone(data.center), radius: r0, stages: out };
};

/** Where the zone is at `tick` (a pure function of the plan: clients compute it themselves). */
export const royaleZoneAt = (plan: RoyaleZonePlan, tick: number): RoyaleZoneNow => {
  let c = plan.center;
  let r = plan.radius;
  for (let i = 0; i < plan.stages.length; i++) {
    const s = plan.stages[i];
    const next = { center: s.center, radius: s.radius };
    if (tick < s.shrinkStart)
      return {
        stage: i,
        state: 'wait',
        center: c,
        radius: r,
        next,
        until: s.shrinkStart,
        dps: s.dps,
      };
    if (tick < s.shrinkEnd) {
      const u = (tick - s.shrinkStart) / (s.shrinkEnd - s.shrinkStart);
      return {
        stage: i,
        state: 'shrink',
        center: v3(
          c.x + (s.center.x - c.x) * u,
          c.y + (s.center.y - c.y) * u,
          c.z + (s.center.z - c.z) * u,
        ),
        radius: r + (s.radius - r) * u,
        next,
        until: s.shrinkEnd,
        dps: s.dps,
      };
    }
    c = s.center;
    r = s.radius;
  }
  const last = plan.stages[plan.stages.length - 1];
  return {
    stage: plan.stages.length,
    state: 'closed',
    center: c,
    radius: r,
    next: null,
    until: 0,
    dps: last?.dps ?? 0,
  };
};

/** The first wait of a round: the zone doesn't hurt yet (time to get in). */
export const royaleZoneGrace = (z: RoyaleZoneNow): boolean => z.stage === 0 && z.state === 'wait';

/** Is this point outside the zone circle (horizontally)? */
export const outsideZone = (z: RoyaleCircle, p: Vec3): boolean => flat(p, z.center) > z.radius;

// ---------------------------------------------------------------- location flashes

/**
 * Seconds between two location flashes with `alive` players left: `flashMaxSec` (45 s) with
 * `flashMaxAlive` (10) or more, `flashMinSec` (10 s) with 2, in a straight line between
 * (10 → 45 s, 8 → 36 s, 6 → 27.5 s, 4 → 19 s, 2 → 10 s).
 *
 * Why: with many players alive they run into each other on their own and a flash is just a
 * hint of where the fights are. With few left the map is mostly empty: frequent flashes stop
 * the last ones from hiding in a corner (the zone does the rest), and the final duel is about
 * fighting, not searching.
 */
export const flashIntervalSec = (alive: number, s: RoyaleSettings): number => {
  const u = Math.min(1, Math.max(0, (alive - 2) / Math.max(1, s.flashMaxAlive - 2)));
  return s.flashMinSec + (s.flashMaxSec - s.flashMinSec) * u;
};

// ---------------------------------------------------------------- the match

const byId = (world: WorldState, id: number): PlayerState | undefined =>
  world.players.find((p) => p.id === id);

/** Place `p` at a royale spawn point (the doubles of a crowded map stagger 1.5 m apart). */
const placeAt = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  sp: SpawnDef,
  double: number,
): void => {
  const a = double * 2.1;
  const off = double ? v3(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5) : v3();
  respawnPlayer(world, p, v3(sp.pos.x + off.x, sp.pos.y, sp.pos.z + off.z), sp.yawDeg, ctx.config);
};

/**
 * Start a match from round 1: round wins, kills and the history reset, then the first round
 * (royaleBeginRound). Everyone in the world plays.
 */
export const startRoyale = (st: RoyaleState, world: WorldState, ctx: SimContext): void => {
  st.matchNo++;
  st.round = 0;
  st.wins = {};
  st.placeSum = {};
  st.rounds = [];
  st.winner = null;
  st.deadSince = {};
  for (const p of world.players) {
    p.kills = 0;
    p.deaths = 0;
    p.teamKills = 0;
    p.damageDealt = 0;
  }
  royaleBeginRound(st, world, ctx);
};

/**
 * The next round: everyone in the world takes part, placed on fresh spread-out spawn points in
 * a seeded order, frozen for the countdown with the round shield (one free hit); the round's
 * zone is planned.
 */
export const royaleBeginRound = (st: RoyaleState, world: WorldState, ctx: SimContext): void => {
  const s = st.settings;
  const t = world.tick;
  st.round++;
  st.phase = 'countdown';
  st.phaseEnds = t + secTicks(s.countdownSec, ctx.dt);
  st.liveTick = st.phaseEnds;
  st.out = [];
  st.roundWinner = null;
  st.revealed = [];
  st.flashPos = {};
  st.flashUntil = 0;
  st.lastFlash = st.liveTick;
  const players = [...world.players].sort((a, b) => a.id - b.id);
  st.entrants = players.map((p) => p.id);
  for (const p of players) st.wins[p.id] ??= 0;
  st.nextFlash = st.liveTick + secTicks(flashIntervalSec(players.length, s), ctx.dt);
  const data = royaleData(ctx.level.def);
  st.spawnIdx = pickRoyaleSpawns(data.spawns, players.length, world.rng, s.spawnSlack);
  const order = rngShuffle(world.rng, players);
  // one free hit per round with the Boomerang kit (like a match round); never with guns
  const shield = !loadoutOf(ctx.config).guns;
  order.forEach((p, i) => {
    const sp = data.spawns[st.spawnIdx[i]];
    placeAt(world, ctx, p, sp, Math.floor(i / Math.max(1, data.spawns.length)));
    p.frozen = true;
    p.shield = shield;
  });
  st.zone = planRoyaleZone(ctx.level.def, st.liveTick, st.round, s, world.rng, ctx.dt);
  world.grenades = [];
  world.twins = [];
  clearPowerups(world);
};

/** Better first: a player who died on the same tick with more kills / damage places higher. */
const sameTickOrder = (world: WorldState, a: number, b: number): number => {
  const pa = byId(world, a);
  const pb = byId(world, b);
  return (
    (pb?.kills ?? 0) - (pa?.kills ?? 0) || (pb?.damageDealt ?? 0) - (pa?.damageDealt ?? 0) || a - b
  );
};

const endRound = (st: RoyaleState, world: WorldState, ctx: SimContext, winner: number | null) => {
  const s = st.settings;
  st.roundWinner = winner;
  st.rounds.push({ winner, tick: world.tick });
  if (winner !== null) st.wins[winner] = (st.wins[winner] ?? 0) + 1;
  for (const o of st.out) st.placeSum[o.id] = (st.placeSum[o.id] ?? 0) + o.place;
  st.revealed = [];
  st.flashUntil = 0;
  for (const p of world.players) {
    p.frozen = true;
    p.shield = false;
  }
  world.grenades = [];
  clearPowerups(world);
  if (winner !== null && st.wins[winner] >= s.winsToWin) {
    st.winner = winner;
    st.phase = 'end';
    st.phaseEnds = world.tick + secTicks(s.resultsSec, ctx.dt);
  } else {
    st.phase = 'roundEnd';
    st.phaseEnds = world.tick + secTicks(s.roundResultsSec, ctx.dt);
  }
};

/** A live tick: the zone hurts, flashes, then who is out and whether the round is over. */
const updateLive = (st: RoyaleState, world: WorldState, ctx: SimContext): void => {
  const s = st.settings;
  const t = world.tick;
  // the zone: damage pulses for everyone outside (not during the first wait: a grace period
  // to get in, should a spawn point lie outside a later round's smaller first circle)
  if (st.zone) {
    const pulse = Math.max(1, secTicks(s.zonePulseSec, ctx.dt));
    const z = royaleZoneAt(st.zone, t);
    if (t > st.liveTick && (t - st.liveTick) % pulse === 0 && !royaleZoneGrace(z)) {
      const dmg = z.dps * pulse * ctx.dt;
      for (const p of world.players)
        if (p.alive && st.entrants.includes(p.id) && outsideZone(z, p.pos))
          applyDamage(world, ctx, p.id, p, dmg, 'world', false, clone(p.pos), clone(p.pos));
    }
  }
  // who is out: everyone newly dead (or gone) takes the places just below the living
  const placed = new Set(st.out.map((o) => o.id));
  const alive = st.entrants.filter((id) => byId(world, id)?.alive);
  const newly = st.entrants
    .filter((id) => !placed.has(id) && !byId(world, id)?.alive)
    .sort((a, b) => sameTickOrder(world, a, b));
  newly.forEach((id, i) => st.out.push({ id, place: alive.length + 1 + i, tick: t }));
  // deaths bring the next flash closer (never later): the interval for who is left now
  if (newly.length)
    st.nextFlash = Math.min(
      st.nextFlash,
      Math.max(t + 1, st.lastFlash + secTicks(flashIntervalSec(alive.length, s), ctx.dt)),
    );
  // the round is over with one (or nobody: all out on the same tick) left
  if (alive.length <= 1 && st.entrants.length > 0) {
    if (alive.length === 1) st.out.push({ id: alive[0], place: 1, tick: t });
    const winner = alive[0] ?? st.out.find((o) => o.place === 1)?.id ?? null;
    endRound(st, world, ctx, winner);
    return;
  }
  // location flashes
  if (t >= st.nextFlash) {
    st.lastFlash = t;
    st.flashUntil = t + secTicks(s.flashSec, ctx.dt);
    st.nextFlash = t + secTicks(flashIntervalSec(alive.length, s), ctx.dt);
    st.flashPos = {};
    for (const id of alive) st.flashPos[id] = clone(byId(world, id)!.pos);
  }
  st.revealed = t < st.flashUntil ? alive : [];
};

/** Lobby: free play while the room waits; the dead are back at a random royale spawn. */
const updateLobby = (st: RoyaleState, world: WorldState, ctx: SimContext): void => {
  const spawns = royaleData(ctx.level.def).spawns;
  for (const p of world.players) {
    p.frozen = false;
    if (p.alive) {
      delete st.deadSince[p.id];
      continue;
    }
    st.deadSince[p.id] ??= world.tick;
    if (world.tick - st.deadSince[p.id] >= secTicks(st.settings.lobbyRespawnSec, ctx.dt)) {
      const sp = spawns[rngInt(world.rng, spawns.length)];
      if (sp) respawnPlayer(world, p, sp.pos, sp.yawDeg, ctx.config);
      delete st.deadSince[p.id];
    }
  }
};

/**
 * One Royale tick (call after `step()`). Returns true once the match results are over: the
 * caller goes back to the lobby (royaleToLobby) or starts the next match (startRoyale).
 */
export const updateRoyale = (st: RoyaleState, world: WorldState, ctx: SimContext): boolean => {
  switch (st.phase) {
    case 'lobby':
      updateLobby(st, world, ctx);
      return false;
    case 'countdown':
      for (const p of world.players) p.frozen = true;
      if (world.tick >= st.phaseEnds) {
        st.phase = 'live';
        for (const p of world.players) if (st.entrants.includes(p.id)) p.frozen = false;
      }
      return false;
    case 'live':
      updateLive(st, world, ctx);
      return false;
    case 'roundEnd':
      for (const p of world.players) p.frozen = true;
      if (world.tick >= st.phaseEnds) royaleBeginRound(st, world, ctx);
      return false;
    case 'end':
      for (const p of world.players) p.frozen = true;
      return world.tick >= st.phaseEnds;
  }
};

/** Back to the lobby (online rooms after the match results): free play, everyone placed. */
export const royaleToLobby = (st: RoyaleState, world: WorldState, ctx: SimContext): void => {
  st.phase = 'lobby';
  st.phaseEnds = 0;
  st.zone = null;
  st.entrants = [];
  st.out = [];
  st.revealed = [];
  st.flashUntil = 0;
  st.deadSince = {};
  const spawns = royaleData(ctx.level.def).spawns;
  for (const p of [...world.players].sort((a, b) => a.id - b.id)) {
    const sp = spawns[rngInt(world.rng, spawns.length)];
    if (sp) respawnPlayer(world, p, sp.pos, sp.yawDeg, ctx.config);
    p.frozen = false;
  }
};

/**
 * A player joined: in the lobby they play right away (at a random royale spawn); during a match
 * they watch (dead) until the next round, which they join with no round wins.
 */
export const royaleJoin = (
  st: RoyaleState,
  world: WorldState,
  ctx: SimContext,
  id: number,
): void => {
  const p = byId(world, id);
  if (!p) return;
  if (st.phase === 'lobby') {
    const spawns = royaleData(ctx.level.def).spawns;
    const sp = spawns[rngInt(world.rng, spawns.length)];
    if (sp) respawnPlayer(world, p, sp.pos, sp.yawDeg, ctx.config);
    return;
  }
  p.alive = false;
  p.hp = 0;
  p.frozen = true;
};

/** A player left: forget their timers (a living one counts as out of the round). */
export const royaleLeave = (st: RoyaleState, id: number): void => {
  delete st.deadSince[id];
  delete st.flashPos[id];
  st.revealed = st.revealed.filter((x) => x !== id);
};

// ---------------------------------------------------------------- views

/** One standings row: round wins, kills, and (this round) their place once they're out. */
export interface RoyaleRow {
  id: number;
  wins: number;
  kills: number;
  alive: boolean;
  /** this round's place (1 = won it), null while still in */
  place: number | null;
  /** in this round at all (false: joined mid-match, watching) */
  playing: boolean;
}

/**
 * Everyone, best first: most round wins, then the better average place in finished rounds,
 * then most kills, then the lower id. During a round the living rank before the dead with the
 * same wins, then by this round's place.
 */
export const royaleStandings = (st: RoyaleState, world: WorldState): RoyaleRow[] => {
  const placeOf = new Map(st.out.map((o) => [o.id, o.place]));
  const rows = world.players.map((p) => ({
    id: p.id,
    wins: st.wins[p.id] ?? 0,
    kills: p.kills,
    alive: p.alive && st.entrants.includes(p.id),
    place: placeOf.get(p.id) ?? null,
    playing: st.entrants.includes(p.id),
  }));
  const rounds = Math.max(1, st.rounds.length);
  const avg = (id: number) => (st.placeSum[id] ?? rounds * 99) / rounds;
  const roundRank = (r: RoyaleRow) => r.place ?? (r.alive ? 0 : 999);
  return rows.sort(
    (a, b) =>
      b.wins - a.wins ||
      avg(a.id) - avg(b.id) ||
      roundRank(a) - roundRank(b) ||
      b.kills - a.kills ||
      a.id - b.id,
  );
};

/** What clients are shown (the server sends it as `{ rules: 'royale', ... }`). */
export interface RoyaleView {
  phase: RoyalePhase;
  phaseEnds: number;
  matchNo: number;
  round: number;
  winsToWin: number;
  liveTick: number;
  zone: RoyaleZonePlan | null;
  /** players this round started with, and the ids still alive */
  entrants: number;
  alive: number[];
  /** this round's placings so far */
  out: RoyalePlacing[];
  roundWinner: number | null;
  winner: number | null;
  /** every player, best first */
  table: RoyaleRow[];
  nextFlash: number;
  flashUntil: number;
  revealed: number[];
  map: string;
}

export const royaleView = (st: RoyaleState, world: WorldState, map: string): RoyaleView => ({
  phase: st.phase,
  phaseEnds: st.phaseEnds,
  matchNo: st.matchNo,
  round: st.round,
  winsToWin: st.settings.winsToWin,
  liveTick: st.liveTick,
  zone: st.zone,
  entrants: st.entrants.length,
  alive: st.entrants.filter((id) => byId(world, id)?.alive),
  out: st.out,
  roundWinner: st.roundWinner,
  winner: st.winner,
  table: royaleStandings(st, world),
  nextFlash: st.phase === 'live' ? st.nextFlash : 0,
  flashUntil: st.flashUntil,
  revealed: st.revealed,
  map,
});

// ---------------------------------------------------------------- bots

/**
 * Bots play the zone first: outside it (taking damage) they run for the next circle and keep
 * running while they fight; outside the circle the zone is closing in to, they head there.
 * Inside, they hunt: the nearest enemy where the last location flash showed them (only
 * enemies inside the next circle), and fight whoever they meet on the way (the brain's own
 * sight). With nobody known, they roam the next circle (zoneWanderPoint).
 */
export const applyRoyaleBotObjectives = (
  st: RoyaleState,
  world: WorldState,
  ctx: SimContext,
  mems: Iterable<BotMemory>,
): void => {
  const z = st.zone && st.phase === 'live' ? royaleZoneAt(st.zone, world.tick) : null;
  for (const mem of mems) {
    mem.objectiveFirst = false;
    mem.useAt = null;
    mem.objective = null;
    if (st.phase === 'lobby') continue; // free play: the brain wanders and fights
    if (!z) continue;
    const self = byId(world, mem.id);
    if (!self?.alive) continue;
    const goal = z.next ?? z;
    // a little inside the edge counts as outside: get in before it hurts
    const margin = Math.min(8, z.radius * 0.15);
    if (flat(self.pos, z.center) > z.radius - margin) {
      mem.objective = clone(goal.center);
      mem.objectiveFirst = true;
      continue;
    }
    if (flat(self.pos, goal.center) > goal.radius) {
      mem.objective = clone(goal.center);
      mem.objectiveFirst = z.state === 'shrink';
      continue;
    }
    let best: Vec3 | null = null;
    let bestD = Infinity;
    for (const q of world.players) {
      if (!q.alive || !isEnemy(ctx, q, self)) continue;
      const at = st.flashPos[q.id];
      if (!at || flat(at, goal.center) > goal.radius) continue;
      const d = len(sub(at, self.pos));
      // (already there and nobody: that lead is stale)
      if (d < 6) continue;
      if (d < bestD) {
        bestD = d;
        best = at;
      }
    }
    mem.objective = clone(best ?? zoneWanderPoint(ctx.level.def, goal, mem.id, world.tick, ctx.dt));
  }
};

/** Waypoints inside each stage circle (keyed by the stage's centre object: one list a stage). */
const insideCache = new WeakMap<Vec3, Vec3[]>();

/**
 * Somewhere inside `circle` for a bot with no lead to roam to: one of the waypoints in it,
 * picked from the bot's id and the time (a new spot every 12 s), so the bots spread out over
 * the zone instead of all walking to its middle. No waypoint in it: the middle.
 */
const zoneWanderPoint = (
  def: LevelDef,
  circle: RoyaleCircle,
  id: number,
  tick: number,
  dt: number,
): Vec3 => {
  let list = insideCache.get(circle.center);
  if (!list) {
    list = (def.waypoints ?? [])
      .map((w) => w.pos)
      .filter((p) => flat(p, circle.center) <= circle.radius * 0.8);
    insideCache.set(circle.center, list);
  }
  if (!list.length) return circle.center;
  const slot = Math.floor(tick / secTicks(12, dt));
  return list[(id * 7919 + slot * 104729) % list.length];
};
