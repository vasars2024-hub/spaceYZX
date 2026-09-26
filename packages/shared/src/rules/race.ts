// Parkour race rules: 1–8 racers run a race track (LevelDef.race) from a standing start.
// Deterministic; shared by the server (packages/server/src/game/rules/race.ts) and offline
// practice. What happens to each racer's body (gates, falls, fuel cells, SURGE) is the
// simulation's (sim/race.ts), so it is predicted online; this module runs the race around it.
//
//   lobby      free running (gates don't count, falls are free). The countdown starts
//              `lobbySec` after the first racer is in (the host can start it sooner).
//   countdown  3-2-1: every racer frozen on the start grid, surges and fuel cells reset.
//   racing     the clock runs from GO. Gates are timed (splits); crossing the finish records
//              your time. A racer still out at `dnfParMul` × par time is DNF; once all but one
//              are done, the last one gets `lastRacerGraceSec` more (never past that limit).
//   results    finishing order (DNF and leavers last), then back to the lobby.
// No combat on race tracks: the simulation skips weapons and damage (sim/world.ts), and
// racers pass through each other (players never collide in this game).
import type { Vec3 } from '../math/vec3';
import { distSq } from '../math/vec3';
import type { SimContext } from '../sim/context';
import type { PlayerState, WorldState } from '../sim/state';
import type { RaceDef } from '../level/types';
import { gateCenter, hasFinished, raceGates, resetRacer } from '../sim/race';
import { type RaceSettings, raceSettings } from '../config/race';

export type RacePhase = 'lobby' | 'countdown' | 'racing' | 'results';

export interface RaceEntry {
  id: number;
  /** ticks from GO at each gate passed, in order (the last gate is the finish) */
  splits: number[];
  /** race time in ticks (0 = not finished) */
  finishTicks: number;
  dnf: boolean;
  /** left the room during the race */
  left: boolean;
  /** checkpoint respawns (falls + the respawn key) */
  respawns: number;
  surges: number;
  fuel: number;
}

/** One racer's line in the results (what the Race ladder and personal bests are built from). */
export interface RaceStanding {
  id: number;
  /** 1 = winner; every DNF / leaver shares the place after the last finisher */
  place: number;
  /** race time (null: DNF or left) */
  timeMs: number | null;
  dnf: boolean;
  left: boolean;
  /** time at each gate passed (ms from GO) */
  splitsMs: number[];
  respawns: number;
  surges: number;
  fuel: number;
}

/** The record of a finished race (the server stores it later: see rating/race.ts). */
export interface RaceResult {
  mode: 'race';
  /** map id of the track */
  track: string;
  parSec: number;
  /** race number in this room */
  race: number;
  durationSec: number;
  /** best first */
  standings: RaceStanding[];
}

export interface RaceState {
  settings: RaceSettings;
  /** map id of the track (results, personal bests) */
  track: string;
  phase: RacePhase;
  phaseEnds: number;
  /** lobby: tick the countdown starts (0 = not scheduled) */
  startAt: number;
  /** tick of GO */
  startTick: number;
  /** DNF limit (tick) */
  limitTick: number;
  /** once all but one racer are done: the last one's deadline (0 = not yet) */
  graceEnds: number;
  /** races run in this room */
  race: number;
  /** ids in this race, start grid order */
  racers: number[];
  entries: RaceEntry[];
  /** current order, leader first (finishers by time, then by progress, DNF, leavers) */
  order: number[];
  result: RaceResult | null;
}

const secTicks = (s: number, dt: number) => Math.round(s / dt);
const ticksMs = (t: number, dt: number) => Math.round(t * dt * 1000);

export const createRace = (track: string, settings: Partial<RaceSettings> = {}): RaceState => ({
  settings: raceSettings(settings),
  track,
  phase: 'lobby',
  phaseEnds: 0,
  startAt: 0,
  startTick: 0,
  limitTick: 0,
  graceEnds: 0,
  race: 0,
  racers: [],
  entries: [],
  order: [],
  result: null,
});

const newEntry = (id: number): RaceEntry => ({
  id,
  splits: [],
  finishTicks: 0,
  dnf: false,
  left: false,
  respawns: 0,
  surges: 0,
  fuel: 0,
});

const courseOf = (ctx: SimContext): RaceDef => {
  const race = ctx.level.def.race;
  if (!race) throw new Error(`${ctx.level.def.name} is not a race track`);
  return race;
};

const playerOf = (world: WorldState, id: number): PlayerState | undefined =>
  world.players.find((p) => p.id === id);

const entryOf = (st: RaceState, id: number): RaceEntry | undefined =>
  st.entries.find((e) => e.id === id);

const isDone = (e: RaceEntry): boolean => e.finishTicks > 0 || e.dnf || e.left;

/** Start slot `i` (wraps if the grid is smaller than the field). */
const slotFeet = (race: RaceDef, i: number): { pos: Vec3; yawDeg: number } =>
  race.grid.length
    ? race.grid[i % race.grid.length]
    : { pos: race.start.respawn, yawDeg: race.start.yawDeg };

/** Out of the race (lobby, spectating a race you joined late): free running from the start. */
const placeFree = (st: RaceState, world: WorldState, ctx: SimContext, p: PlayerState): void => {
  const race = courseOf(ctx);
  const i = Math.max(0, world.players.indexOf(p));
  const s = slotFeet(race, i);
  resetRacer(p, ctx.config.movement, s.pos, s.yawDeg, -1);
  p.team = 0;
};

// ------------------------------------------------------------------------------------------
// Order

/**
 * How far along a racer is between gates: gates passed, then the distance left to the next
 * gate (smaller is further). Lower keys come first.
 */
const progressKey = (race: RaceDef, p: PlayerState | undefined): [number, number] => {
  if (!p) return [0, Infinity];
  const gates = raceGates(race);
  const cp = Math.max(0, Math.min(gates.length, p.raceCp));
  if (cp >= gates.length) return [-cp, 0];
  return [-cp, distSq(p.pos, gateCenter(gates[cp]))];
};

/** The current order of a race: finishers by time, then by progress, then DNF, then leavers. */
export const raceOrder = (st: RaceState, world: WorldState, ctx: SimContext): number[] => {
  const race = courseOf(ctx);
  const rank = (e: RaceEntry): number => (e.left ? 3 : e.dnf ? 2 : e.finishTicks > 0 ? 0 : 1);
  const keys = new Map(st.entries.map((e) => [e.id, progressKey(race, playerOf(world, e.id))]));
  return st.entries
    .slice()
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra === 0) return a.finishTicks - b.finishTicks || a.id - b.id;
      if (ra === 2) return b.splits.length - a.splits.length || a.id - b.id;
      const ka = keys.get(a.id)!;
      const kb = keys.get(b.id)!;
      return ka[0] - kb[0] || ka[1] - kb[1] || a.id - b.id;
    })
    .map((e) => e.id);
};

// ------------------------------------------------------------------------------------------
// Flow

/** 3-2-1: the racers (everyone in the room, up to maxRacers) line up frozen on the grid. */
export const startRaceCountdown = (st: RaceState, world: WorldState, ctx: SimContext): void => {
  const race = courseOf(ctx);
  const m = ctx.config.movement;
  const count = Math.max(1, secTicks(st.settings.countdownSec, ctx.dt));
  const ids = world.players.map((p) => p.id).sort((a, b) => a - b);
  st.racers = ids.slice(0, st.settings.maxRacers);
  st.entries = st.racers.map(newEntry);
  st.order = st.racers.slice();
  st.result = null;
  st.race++;
  st.startAt = 0;
  st.graceEnds = 0;
  for (const p of world.players) {
    const i = st.racers.indexOf(p.id);
    if (i < 0) {
      placeFree(st, world, ctx, p);
      continue;
    }
    const s = slotFeet(race, i);
    resetRacer(p, m, s.pos, s.yawDeg, 0);
    // frozen through the countdown by the simulation's own penalty clock (sim/race.ts): it
    // lets go on exactly the GO tick, so clients predict the start instead of waiting for it
    p.frozen = true;
    p.racePenalty = count;
    p.team = 0;
  }
  st.phase = 'countdown';
  st.phaseEnds = world.tick + count;
};

/** Host asked to start (or offline: right away). False when not in the lobby / nobody's in. */
export const requestRaceStart = (st: RaceState, world: WorldState): boolean => {
  if (st.phase !== 'lobby' || world.players.length < st.settings.minRacers) return false;
  st.startAt = world.tick + 1;
  return true;
};

const finishRace = (st: RaceState, world: WorldState, ctx: SimContext): void => {
  st.order = raceOrder(st, world, ctx);
  st.result = raceResult(st, ctx);
  st.phase = 'results';
  st.phaseEnds = world.tick + secTicks(st.settings.resultsSec, ctx.dt);
};

/** After the results: everyone back to free running; the next race starts by itself. */
export const resetRaceToLobby = (st: RaceState, world: WorldState, ctx: SimContext): void => {
  st.phase = 'lobby';
  st.startAt = 0;
  st.racers = [];
  for (const p of world.players) placeFree(st, world, ctx, p);
};

/** Call once per tick after `step()`. */
export const updateRace = (st: RaceState, world: WorldState, ctx: SimContext): void => {
  const race = courseOf(ctx);
  const s = st.settings;
  const tick = world.tick;
  switch (st.phase) {
    case 'lobby':
      if (world.players.length < s.minRacers) {
        st.startAt = 0;
        return;
      }
      if (!st.startAt) st.startAt = tick + secTicks(s.lobbySec, ctx.dt);
      if (tick >= st.startAt) startRaceCountdown(st, world, ctx);
      return;
    case 'countdown':
      if (tick >= st.phaseEnds) {
        for (const id of st.racers) {
          const p = playerOf(world, id);
          if (p) {
            p.frozen = false;
            p.racePenalty = 0;
          }
        }
        st.phase = 'racing';
        st.startTick = tick;
        st.limitTick = tick + secTicks(race.parSec * s.dnfParMul, ctx.dt);
        st.phaseEnds = st.limitTick;
      }
      return;
    case 'results':
      if (tick >= st.phaseEnds) resetRaceToLobby(st, world, ctx);
      return;
  }

  // ---- racing ----
  for (const e of world.events) {
    if (!('player' in e)) continue;
    const en = entryOf(st, e.player);
    if (!en || isDone(en)) continue;
    if (e.type === 'raceRespawn' && e.penalty) en.respawns++;
    else if (e.type === 'surge') en.surges++;
    else if (e.type === 'raceFuel') en.fuel++;
  }
  for (const en of st.entries) {
    if (isDone(en)) continue;
    const p = playerOf(world, en.id);
    if (!p) {
      en.left = true;
      continue;
    }
    while (en.splits.length < Math.min(p.raceCp, race.checkpoints.length + 1))
      en.splits.push(tick - st.startTick);
    if (hasFinished(race, p)) en.finishTicks = en.splits[en.splits.length - 1] || 1;
  }
  const open = st.entries.filter((e) => !isDone(e));
  if (
    open.length === 1 &&
    st.entries.length >= 2 &&
    st.entries.some((e) => e.finishTicks > 0) &&
    !st.graceEnds
  )
    st.graceEnds = tick + secTicks(s.lastRacerGraceSec, ctx.dt);
  const limit = st.graceEnds ? Math.min(st.limitTick, st.graceEnds) : st.limitTick;
  st.phaseEnds = limit;
  if (tick >= limit) for (const e of open) e.dnf = true;
  st.order = raceOrder(st, world, ctx);
  if (st.entries.every(isDone)) finishRace(st, world, ctx);
};

/** A player joined: in the lobby they run freely; mid-race they wait for the next race. */
export const raceJoin = (st: RaceState, world: WorldState, ctx: SimContext, id: number): void => {
  const p = playerOf(world, id);
  if (p) placeFree(st, world, ctx, p);
};

/** A player is leaving (call before removing them): in a race they are out (left). */
export const raceLeave = (st: RaceState, world: WorldState, ctx: SimContext, id: number): void => {
  const e = entryOf(st, id);
  if (st.phase === 'countdown' && e) {
    st.entries = st.entries.filter((x) => x.id !== id);
    st.racers = st.racers.filter((x) => x !== id);
    if (!st.racers.length) resetRaceToLobby(st, world, ctx);
    return;
  }
  if (st.phase !== 'racing' || !e || isDone(e)) return;
  e.left = true;
  if (st.entries.every(isDone)) finishRace(st, world, ctx);
};

// ------------------------------------------------------------------------------------------
// Results and the view for clients

/** The results record of the race (standings best first). */
export const raceResult = (st: RaceState, ctx: SimContext): RaceResult => {
  const race = courseOf(ctx);
  const dt = ctx.dt;
  const byId = new Map(st.entries.map((e) => [e.id, e]));
  const order = st.order.filter((id) => byId.has(id));
  for (const e of st.entries) if (!order.includes(e.id)) order.push(e.id);
  const finishers = order.filter((id) => byId.get(id)!.finishTicks > 0).length;
  const last = st.entries.reduce((a, e) => Math.max(a, e.splits[e.splits.length - 1] ?? 0), 0);
  return {
    mode: 'race',
    track: st.track,
    parSec: race.parSec,
    race: st.race,
    durationSec: Math.round(last * dt),
    standings: order.map((id, i) => {
      const e = byId.get(id)!;
      const done = e.finishTicks > 0;
      return {
        id,
        place: done ? i + 1 : finishers + 1,
        timeMs: done ? ticksMs(e.finishTicks, dt) : null,
        dnf: !done && !e.left,
        left: e.left,
        splitsMs: e.splits.map((t) => ticksMs(t, dt)),
        respawns: e.respawns,
        surges: e.surges,
        fuel: e.fuel,
      };
    }),
  };
};

export interface RaceViewRacer {
  id: number;
  /** gates passed (as the rules saw it) */
  cp: number;
  /** ticks from GO at each gate passed */
  splits: number[];
  finishTicks: number;
  dnf: boolean;
  left: boolean;
}

/** Compact race state for clients (HUD, results). */
export interface RaceView {
  track: string;
  phase: RacePhase;
  phaseEnds: number;
  startAt: number;
  startTick: number;
  limitTick: number;
  race: number;
  parSec: number;
  /** checkpoints + the finish */
  gates: number;
  racers: RaceViewRacer[];
  /** leader first */
  order: number[];
  result: RaceResult | null;
}

export const raceView = (st: RaceState, ctx: Pick<SimContext, 'level'>): RaceView => {
  const race = ctx.level.def.race;
  return {
    track: st.track,
    phase: st.phase,
    phaseEnds: st.phaseEnds,
    startAt: st.startAt,
    startTick: st.startTick,
    limitTick: st.limitTick,
    race: st.race,
    parSec: race?.parSec ?? 0,
    gates: race ? race.checkpoints.length + 1 : 0,
    racers: st.entries.map((e) => ({
      id: e.id,
      cp: e.splits.length,
      splits: e.splits.slice(),
      finishTicks: e.finishTicks,
      dnf: e.dnf,
      left: e.left,
    })),
    order: st.order.slice(),
    result: st.result,
  };
};

/** Race time of a tick (seconds from GO; 0 before the start). */
export const raceClock = (v: Pick<RaceView, 'phase' | 'startTick'>, tick: number, dt: number) =>
  v.phase === 'racing' || v.phase === 'results' ? Math.max(0, (tick - v.startTick) * dt) : 0;
