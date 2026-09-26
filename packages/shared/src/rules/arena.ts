// Arena 1v1 rules: a room of 2–8 players fights short 1v1 duels, each pair in its own sealed
// pit (level `arenaPits`), all duels of a round at the same time. Deterministic; shared by the
// server (packages/server/src/game/rules/arena.ts) and offline arena practice.
//
//   warmup    free play in pits (respawns). The match starts `warmupSec` after 2+ players are
//             in (the host can start it sooner; ranked rooms start after `startSec`).
//   break     `breakSec`: everyone stands frozen in the pit of their next duel.
//   duel      first kill wins. At `duelSec` nobody's dead: more HP wins, then a seeded coin
//             flip (both dying on the same tick: more damage dealt in the duel, then the coin).
//             Never a draw. A decided duel's players wait (spectate) until every pit is done.
//   (round over) the ladder moves — winners up a pit, losers down, like CS arenas — and the
//             next round is paired: among players near each other on the ladder, the pairing
//             that repeats earlier match-ups least (a min-cost matching). Odd player count:
//             one sits out, in rotation (fewest sit-outs first).
//   matchEnd  once `matchMin` is up, no new round starts; when the last one ends, the player
//             with the most duel wins wins the arena (then fewer losses, more damage dealt,
//             more kills, higher on the ladder).
import type { Vec3 } from '../math/vec3';
import { v3, clone } from '../math/vec3';
import { rngFloat, rngShuffle } from '../math/rng';
import type { SimContext } from '../sim/context';
import type { WorldState, PlayerState } from '../sim/state';
import type { ArenaPitDef } from '../level/types';
import { respawnPlayer } from '../sim/world';
import type { LoadoutName } from '../config/loadout';
import { type ArenaSettings, arenaSettings } from '../config/arena';
import type { BotMemory } from '../bots/brain';

export type ArenaPhase = 'warmup' | 'break' | 'duel' | 'matchEnd';
/**
 * How a duel was decided: a kill; both died on the same tick ('trade': more damage, then a
 * coin); the timer ('hp': more HP left; 'coin': equal HP); the opponent left ('forfeit').
 */
export type DuelEndReason = 'kill' | 'trade' | 'hp' | 'coin' | 'forfeit';

export interface ArenaDuel {
  pit: number;
  /** [team 0 at the pit's -x end, team 1 at its +x end] */
  ids: [number, number];
  winner: number | null;
  reason: DuelEndReason | null;
  /** damage each side dealt the other in this duel */
  dmg: [number, number];
  /** tick it was decided (0 = still on) */
  endTick: number;
}

export interface ArenaEntry {
  id: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  damage: number;
  sitOuts: number;
  /** round of the last sit-out (0 = never) */
  lastSitOut: number;
  /** opponent id -> duels fought against them this match */
  met: Record<number, number>;
  lastOpponent: number | null;
  /** left during the match (kept for the results, always ranked last) */
  left: boolean;
}

export interface ArenaDuelRecord {
  round: number;
  pit: number;
  ids: [number, number];
  winner: number;
  reason: DuelEndReason;
}

export interface ArenaState {
  loadout: LoadoutName;
  settings: ArenaSettings;
  phase: ArenaPhase;
  phaseEnds: number;
  /** warmup: tick the match starts (0 = not scheduled) */
  startAt: number;
  round: number;
  matchStartTick: number;
  /** no new round starts from this tick on */
  matchEnds: number;
  /** this round's duel timer */
  duelEnds: number;
  /** players in the match, top of the ladder first (players who left are taken out) */
  ladder: number[];
  /** preferred first ladder order (ranked: by rating); null = seeded shuffle */
  seed: number[] | null;
  entries: ArenaEntry[];
  duels: ArenaDuel[];
  /** sitting this round out */
  sitting: number[];
  history: ArenaDuelRecord[];
  /** final order (matchEnd) */
  standings: number[];
  winner: number | null;
  endReason: string;
  /** how many pits the level has */
  pitCount: number;
  /** warmup respawns */
  deadSince: Record<number, number>;
}

const secTicks = (s: number, dt: number) => Math.round(s / dt);

export const createArena = (
  loadout: LoadoutName = 'lethal',
  settings: Partial<ArenaSettings> = {},
): ArenaState => ({
  loadout,
  settings: arenaSettings(settings),
  phase: 'warmup',
  phaseEnds: 0,
  startAt: 0,
  round: 0,
  matchStartTick: 0,
  matchEnds: 0,
  duelEnds: 0,
  ladder: [],
  seed: null,
  entries: [],
  duels: [],
  sitting: [],
  history: [],
  standings: [],
  winner: null,
  endReason: '',
  pitCount: 1,
  deadSince: {},
});

const newEntry = (id: number): ArenaEntry => ({
  id,
  wins: 0,
  losses: 0,
  kills: 0,
  deaths: 0,
  damage: 0,
  sitOuts: 0,
  lastSitOut: 0,
  met: {},
  lastOpponent: null,
  left: false,
});

const entryOf = (st: ArenaState, id: number): ArenaEntry | undefined =>
  st.entries.find((e) => e.id === id);

const playerOf = (world: WorldState, id: number): PlayerState | undefined =>
  world.players.find((p) => p.id === id);

/** The level's duel pits (a map without any: one "pit" between the first spawns of each team). */
export const arenaPits = (ctx: Pick<SimContext, 'level'>): ArenaPitDef[] => {
  const def = ctx.level.def;
  if (def.arenaPits?.length) return def.arenaPits;
  const a = def.spawns.find((s) => s.team === 0) ?? def.spawns[0];
  const b = def.spawns.find((s) => s.team === 1) ?? def.spawns[def.spawns.length - 1];
  return [
    {
      center: v3((a.pos.x + b.pos.x) / 2, a.pos.y, (a.pos.z + b.pos.z) / 2),
      min: def.boundsMin,
      max: def.boundsMax,
      spawns: [a, b],
    },
  ];
};

// ------------------------------------------------------------------------------------------
// Ladder and pairing (pure)

/**
 * The ladder after a round (CS arena style): the winner of each pit moves up a pit, the loser
 * down; the top pit's winner and the bottom pit's loser stay. `duels` in pit order (top first).
 * Players who didn't duel (sat out, joined mid-round) keep their place on the ladder.
 */
export const nextLadder = (
  ladder: readonly number[],
  duels: readonly Pick<ArenaDuel, 'ids' | 'winner'>[],
): number[] => {
  const decided = duels.filter((d) => d.winner !== null);
  const W = decided.map((d) => d.winner!);
  const L = decided.map((d) => (d.ids[0] === d.winner ? d.ids[1] : d.ids[0]));
  const P = decided.length;
  if (P === 0) return ladder.slice();
  let moved: number[];
  if (P === 1) moved = [W[0], L[0]];
  else {
    // new pit 0: both top winners; pit j: the loser from above and the winner from below;
    // last pit: both bottom losers
    moved = [W[0], W[1]];
    for (let j = 1; j < P - 1; j++) moved.push(L[j - 1], W[j + 1]);
    moved.push(L[P - 2], L[P - 1]);
  }
  moved = moved.filter((id) => ladder.includes(id));
  const dueled = new Set(moved);
  const out: (number | null)[] = ladder.map((id) => (dueled.has(id) ? null : id));
  let k = 0;
  for (let i = 0; i < out.length; i++) if (out[i] === null) out[i] = moved[k++];
  return out as number[];
};

/**
 * Who sits out a round with an odd number of players: fewest sit-outs so far, then the one who
 * sat out longest ago, then the lowest on the ladder. Null when the count is even.
 */
export const pickSitter = (
  ladder: readonly number[],
  entries: readonly ArenaEntry[],
): number | null => {
  if (ladder.length % 2 === 0) return null;
  let best: number | null = null;
  let key: [number, number, number] = [Infinity, Infinity, Infinity];
  ladder.forEach((id, i) => {
    const e = entries.find((x) => x.id === id);
    const k: [number, number, number] = [e?.sitOuts ?? 0, e?.lastSitOut ?? 0, -i];
    if (
      k[0] < key[0] ||
      (k[0] === key[0] && (k[1] < key[1] || (k[1] === key[1] && k[2] < key[2])))
    ) {
      key = k;
      best = id;
    }
  });
  return best;
};

/**
 * Pair players (in ladder order, even count) with the lowest total cost — an exact min-cost
 * perfect matching over bitmasks (8 players: 256 states). `cost(a, b, gap)`: `gap` = how many
 * ladder steps apart they are (1 = neighbours). Pairs come out top of the ladder first.
 */
export const pairLadder = (
  ids: readonly number[],
  cost: (a: number, b: number, gap: number) => number,
): [number, number][] => {
  const n = ids.length;
  if (n < 2) return [];
  if (n > 16) {
    const out: [number, number][] = [];
    for (let i = 0; i + 1 < n; i += 2) out.push([ids[i], ids[i + 1]]);
    return out;
  }
  const full = (1 << n) - 1;
  const best = new Map<number, { c: number; j: number }>();
  const solve = (mask: number): number => {
    if (mask === full) return 0;
    const hit = best.get(mask);
    if (hit) return hit.c;
    let i = 0;
    while (mask & (1 << i)) i++;
    let c = Infinity;
    let pick = -1;
    for (let j = i + 1; j < n; j++) {
      if (mask & (1 << j)) continue;
      const rest = mask | (1 << i) | (1 << j);
      // an odd leftover can't be paired: skip (only happens with an odd count)
      if (bitCount(full & ~rest) % 2 === 1) continue;
      const v = cost(ids[i], ids[j], j - i) + solve(rest);
      if (v < c - 1e-9) {
        c = v;
        pick = j;
      }
    }
    best.set(mask, { c, j: pick });
    return c;
  };
  solve(0);
  const out: [number, number][] = [];
  let mask = 0;
  while (mask !== full) {
    let i = 0;
    while (mask & (1 << i)) i++;
    const j = best.get(mask)?.j ?? -1;
    if (j < 0) break;
    out.push([ids[i], ids[j]]);
    mask |= (1 << i) | (1 << j);
  }
  return out;
};

const bitCount = (x: number): number => {
  let n = 0;
  for (let v = x; v; v &= v - 1) n++;
  return n;
};

/** The pairing cost the arena uses (see ArenaSettings: repeat, rematch and ladder-gap costs). */
export const arenaPairCost =
  (entries: readonly ArenaEntry[], s: ArenaSettings) =>
  (a: number, b: number, gap: number): number => {
    const ea = entries.find((e) => e.id === a);
    const met = ea?.met[b] ?? 0;
    const rematch = ea?.lastOpponent === b || entries.find((e) => e.id === b)?.lastOpponent === a;
    return s.ladderGapCost * (gap - 1) ** 2 + s.repeatCost * met + (rematch ? s.rematchCost : 0);
  };

/** Final (or current) order: most wins, fewest losses, most damage, most kills, ladder. */
export const arenaStandings = (st: ArenaState): ArenaEntry[] => {
  const pos = (id: number) => {
    const i = st.ladder.indexOf(id);
    return i < 0 ? Infinity : i;
  };
  return st.entries
    .slice()
    .sort(
      (a, b) =>
        Number(a.left) - Number(b.left) ||
        b.wins - a.wins ||
        a.losses - b.losses ||
        b.damage - a.damage ||
        b.kills - a.kills ||
        pos(a.id) - pos(b.id) ||
        a.id - b.id,
    );
};

// ------------------------------------------------------------------------------------------
// Placing players

const placeIn = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  pit: ArenaPitDef,
  side: 0 | 1,
): void => {
  const s = pit.spawns[side];
  p.team = side;
  respawnPlayer(world, p, s.pos, s.yawDeg, ctx.config);
};

/** Out of the fight until the next round (they spectate). */
const bench = (p: PlayerState): void => {
  p.alive = false;
  p.hp = 0;
};

/** Warmup: player i of the ladder plays in pit ⌊i/2⌋ (wrapping), on side i % 2. */
const warmupSlot = (st: ArenaState, id: number): { pit: number; side: 0 | 1 } | null => {
  const i = st.ladder.indexOf(id);
  if (i < 0) return null;
  return { pit: Math.floor(i / 2) % Math.max(1, st.pitCount), side: (i % 2) as 0 | 1 };
};

const placeWarmup = (st: ArenaState, world: WorldState, ctx: SimContext, p: PlayerState) => {
  const slot = warmupSlot(st, p.id);
  const pits = arenaPits(ctx);
  if (slot) placeIn(world, ctx, p, pits[slot.pit] ?? pits[0], slot.side);
};

// ------------------------------------------------------------------------------------------
// Match flow

/** Start the arena match: fresh stats, the first ladder (st.seed, else shuffled), round 1. */
export const startArena = (st: ArenaState, world: WorldState, ctx: SimContext): void => {
  st.pitCount = arenaPits(ctx).length;
  const ids = world.players.map((p) => p.id).sort((a, b) => a - b);
  const seeded = (st.seed ?? []).filter((id) => ids.includes(id));
  const rest = ids.filter((id) => !seeded.includes(id));
  st.ladder = [...seeded, ...(st.seed ? rest : rngShuffle(world.rng, rest))];
  st.entries = st.ladder.map(newEntry);
  st.round = 0;
  st.history = [];
  st.standings = [];
  st.winner = null;
  st.endReason = '';
  st.startAt = 0;
  st.deadSince = {};
  st.matchStartTick = world.tick;
  st.matchEnds = world.tick + secTicks(st.settings.matchMin * 60, ctx.dt);
  for (const p of world.players) {
    p.kills = 0;
    p.deaths = 0;
    p.teamKills = 0;
    p.damageDealt = 0;
  }
  beginArenaRound(st, world, ctx);
};

/** Pair the next round, put everyone in their pit (frozen) and start the break. */
export const beginArenaRound = (st: ArenaState, world: WorldState, ctx: SimContext): void => {
  const s = st.settings;
  const pits = arenaPits(ctx);
  st.pitCount = pits.length;
  st.round++;
  st.ladder = st.ladder.filter((id) => !!playerOf(world, id));
  st.sitting = [];
  const sitOut = (id: number) => {
    st.sitting.push(id);
    const e = entryOf(st, id);
    if (e) {
      e.sitOuts++;
      e.lastSitOut = st.round;
    }
  };
  let ids = st.ladder.slice();
  const sitter = pickSitter(ids, st.entries);
  if (sitter !== null) {
    sitOut(sitter);
    ids = ids.filter((id) => id !== sitter);
  }
  const pairs = pairLadder(ids, arenaPairCost(st.entries, s));
  // more pairs than pits (never with 8 players and 4 pits): the lowest pairs sit out too
  for (const pr of pairs.splice(pits.length)) for (const id of pr) sitOut(id);
  // sides alternate by round (the pits are mirror images, this is only for variety)
  st.duels = pairs.map((pr, pit) => ({
    pit,
    ids: st.round % 2 === 0 ? [pr[1], pr[0]] : [pr[0], pr[1]],
    winner: null,
    reason: null,
    dmg: [0, 0],
    endTick: 0,
  }));
  for (const p of world.players) {
    const d = st.duels.find((x) => x.ids.includes(p.id));
    if (d) {
      placeIn(world, ctx, p, pits[d.pit], d.ids[0] === p.id ? 0 : 1);
      p.frozen = true;
      p.shield = st.loadout !== 'cs'; // one free hit per round (Boomerang modes)
    } else bench(p);
  }
  world.grenades = [];
  st.phase = 'break';
  st.phaseEnds = world.tick + secTicks(s.breakSec, ctx.dt);
  st.duelEnds = 0;
};

const decide = (
  st: ArenaState,
  world: WorldState,
  d: ArenaDuel,
  winnerSide: 0 | 1,
  reason: DuelEndReason,
): void => {
  const w = d.ids[winnerSide];
  const l = d.ids[1 - winnerSide];
  d.winner = w;
  d.reason = reason;
  d.endTick = world.tick;
  const ew = entryOf(st, w);
  const el = entryOf(st, l);
  if (ew) {
    ew.wins++;
    ew.met[l] = (ew.met[l] ?? 0) + 1;
    ew.lastOpponent = l;
  }
  if (el) {
    el.losses++;
    el.met[w] = (el.met[w] ?? 0) + 1;
    el.lastOpponent = w;
  }
  st.history.push({ round: st.round, pit: d.pit, ids: [d.ids[0], d.ids[1]], winner: w, reason });
  // the winner stands still (and can't be hurt) until the round is over
  const wp = playerOf(world, w);
  if (wp?.alive) wp.frozen = true;
};

const coin = (world: WorldState): 0 | 1 => (rngFloat(world.rng) < 0.5 ? 0 : 1);

/** End the arena match now: final standings, results screen. */
export const endArena = (
  st: ArenaState,
  world: WorldState,
  ctx: SimContext,
  reason: string,
): void => {
  const order = arenaStandings(st);
  st.standings = order.map((e) => e.id);
  st.winner = order.find((e) => !e.left)?.id ?? null;
  st.endReason = reason;
  st.phase = 'matchEnd';
  st.phaseEnds = world.tick + secTicks(st.settings.resultsSec, ctx.dt);
  st.sitting = [];
  for (const p of world.players) p.frozen = true;
};

/** After the results: back to warmup (free play in pits; the next match starts by itself). */
export const resetArenaToWarmup = (st: ArenaState, world: WorldState, ctx: SimContext): void => {
  st.phase = 'warmup';
  st.round = 0;
  st.duels = [];
  st.sitting = [];
  st.startAt = 0;
  st.deadSince = {};
  st.pitCount = arenaPits(ctx).length;
  st.ladder = st.ladder.filter((id) => !!playerOf(world, id));
  for (const p of world.players) {
    if (!st.ladder.includes(p.id)) st.ladder.push(p.id);
    placeWarmup(st, world, ctx, p);
  }
};

/** Schedule the start (host pressed start / ranked): `startSec` from now. False if too few. */
export const requestArenaStart = (st: ArenaState, world: WorldState, ctx: SimContext): boolean => {
  if (st.phase !== 'warmup' || st.ladder.length < st.settings.minPlayers) return false;
  const at = world.tick + secTicks(st.settings.startSec, ctx.dt);
  st.startAt = st.startAt ? Math.min(st.startAt, at) : at;
  return true;
};

/** Call once per tick after `step()`. */
export const updateArena = (st: ArenaState, world: WorldState, ctx: SimContext): void => {
  const s = st.settings;
  const dt = ctx.dt;
  const tick = world.tick;
  st.pitCount = arenaPits(ctx).length;

  // bookkeeping: damage and kills inside a running duel
  if (st.phase === 'duel')
    for (const e of world.events) {
      if (e.type !== 'hit' && e.type !== 'kill') continue;
      const d = st.duels.find((x) => x.winner === null && x.ids.includes(e.victim));
      if (!d) continue;
      const vs = d.ids.indexOf(e.victim);
      const opp = d.ids[1 - vs];
      if (e.type === 'hit') {
        if (e.attacker !== opp) continue;
        d.dmg[1 - vs] += e.damage;
        const ea = entryOf(st, opp);
        if (ea) ea.damage += e.damage;
      } else {
        const ev = entryOf(st, e.victim);
        if (ev) ev.deaths++;
        const ea = e.attacker === opp ? entryOf(st, opp) : undefined;
        if (ea) ea.kills++;
      }
    }

  switch (st.phase) {
    case 'warmup': {
      // free play in pits: the dead respawn after a moment
      for (const p of world.players) {
        if (!st.ladder.includes(p.id)) st.ladder.push(p.id);
        if (p.alive) {
          delete st.deadSince[p.id];
          continue;
        }
        st.deadSince[p.id] ??= tick;
        if (tick - st.deadSince[p.id] >= secTicks(s.warmupRespawnSec, dt)) {
          placeWarmup(st, world, ctx, p);
          delete st.deadSince[p.id];
        }
      }
      if (st.ladder.length < s.minPlayers) st.startAt = 0;
      else if (!st.startAt) st.startAt = tick + secTicks(s.warmupSec, dt);
      if (st.startAt && tick >= st.startAt) startArena(st, world, ctx);
      return;
    }
    case 'break':
      if (tick >= st.phaseEnds) {
        for (const d of st.duels)
          for (const id of d.winner === null ? d.ids : []) {
            const p = playerOf(world, id);
            if (p) p.frozen = false;
          }
        st.phase = 'duel';
        st.duelEnds = tick + secTicks(s.duelSec, dt);
      }
      return;
    case 'matchEnd':
      if (tick >= st.phaseEnds) resetArenaToWarmup(st, world, ctx);
      return;
  }

  // ---- duel ----
  for (const d of st.duels) {
    if (d.winner !== null) continue;
    const a = playerOf(world, d.ids[0]);
    const b = playerOf(world, d.ids[1]);
    const aUp = !!a?.alive;
    const bUp = !!b?.alive;
    if (!aUp && !bUp) {
      const side: 0 | 1 = d.dmg[0] !== d.dmg[1] ? (d.dmg[0] > d.dmg[1] ? 0 : 1) : coin(world);
      decide(st, world, d, side, 'trade');
    } else if (!aUp || !bUp) decide(st, world, d, aUp ? 0 : 1, 'kill');
    else if (tick >= st.duelEnds) {
      if (a!.hp !== b!.hp) decide(st, world, d, a!.hp > b!.hp ? 0 : 1, 'hp');
      else decide(st, world, d, coin(world), 'coin');
    }
  }
  // decided duels: after a moment both players wait for the round to end
  const after = secTicks(s.afterDuelSec, dt);
  let lastEnd = 0;
  let open = false;
  for (const d of st.duels) {
    if (d.winner === null) {
      open = true;
      continue;
    }
    lastEnd = Math.max(lastEnd, d.endTick);
    if (tick - d.endTick >= after)
      for (const id of d.ids) {
        const p = playerOf(world, id);
        if (p?.alive) bench(p);
      }
  }
  if (open || tick - lastEnd < after) return;
  // round over: move the ladder, then the next round (or the end once time is up)
  st.ladder = nextLadder(st.ladder, st.duels);
  if (tick >= st.matchEnds) endArena(st, world, ctx, 'time limit');
  else if (st.ladder.filter((id) => !!playerOf(world, id)).length < s.minPlayers)
    endArena(st, world, ctx, 'not enough players');
  else beginArenaRound(st, world, ctx);
};

/** A player joined: warmup puts them in a pit; mid-match they wait for the next round. */
export const arenaJoin = (st: ArenaState, world: WorldState, ctx: SimContext, id: number): void => {
  if (!st.ladder.includes(id)) st.ladder.push(id);
  const e = entryOf(st, id);
  if (e) e.left = false;
  else if (st.phase !== 'warmup') st.entries.push(newEntry(id));
  const p = playerOf(world, id);
  if (!p) return;
  if (st.phase === 'warmup') placeWarmup(st, world, ctx, p);
  else bench(p);
};

/**
 * A player is leaving (call before removing them from the world): their running duel is a
 * forfeit win for the opponent; with fewer than 2 players left the match ends.
 */
export const arenaLeave = (
  st: ArenaState,
  world: WorldState,
  ctx: SimContext,
  id: number,
): void => {
  st.ladder = st.ladder.filter((x) => x !== id);
  st.sitting = st.sitting.filter((x) => x !== id);
  delete st.deadSince[id];
  if (st.phase === 'warmup') {
    st.entries = st.entries.filter((e) => e.id !== id);
    if (st.ladder.length < st.settings.minPlayers) st.startAt = 0;
    return;
  }
  if (st.phase === 'matchEnd') return;
  const e = entryOf(st, id);
  if (e) e.left = true;
  const d = st.duels.find((x) => x.winner === null && x.ids.includes(id));
  if (d) decide(st, world, d, d.ids[0] === id ? 1 : 0, 'forfeit');
  const present = st.ladder.filter((x) => x !== id && !!playerOf(world, x));
  if (present.length < st.settings.minPlayers) endArena(st, world, ctx, 'not enough players');
};

// ------------------------------------------------------------------------------------------
// Who sees whom, bots, the view for clients

const duelOf = (st: ArenaState, id: number): ArenaDuel | undefined =>
  st.phase === 'warmup' ? undefined : st.duels.find((d) => d.ids.includes(id));

/** The pit a player is in right now (-1: sitting out / not placed). */
export const arenaPitOf = (st: ArenaState, id: number): number => {
  if (st.phase === 'warmup') return warmupSlot(st, id)?.pit ?? -1;
  return duelOf(st, id)?.pit ?? -1;
};

/**
 * The pit a player looks at: their own while their duel runs (or while they still stand in it),
 * else the top pit that is still fighting.
 */
export const arenaWatchPit = (st: ArenaState, world: WorldState, id: number): number => {
  if (st.phase === 'warmup') return warmupSlot(st, id)?.pit ?? 0;
  const d = duelOf(st, id);
  if (d && (d.winner === null || !!playerOf(world, id)?.alive)) return d.pit;
  if (st.phase === 'duel') {
    const live = st.duels.filter((x) => x.winner === null).sort((a, b) => a.pit - b.pit)[0];
    if (live) return live.pit;
  }
  return d?.pit ?? st.duels[0]?.pit ?? 0;
};

/**
 * Can `viewer` see player `target` (the server sends only these; offline the client draws only
 * these)? Only players in the pit you're in or watching; always yourself.
 */
export const arenaCanSee = (
  st: ArenaState,
  world: WorldState,
  viewer: number,
  target: number,
): boolean => {
  if (viewer === target) return true;
  const tp = arenaPitOf(st, target);
  return tp >= 0 && tp === arenaWatchPit(st, world, viewer);
};

/** Where each bot heads: its opponent (warmup: its pit-mate), else the middle of its pit. */
export const arenaBotObjectives = (
  st: ArenaState,
  world: WorldState,
  ctx: SimContext,
): Record<number, Vec3 | null> => {
  const out: Record<number, Vec3 | null> = {};
  const pits = arenaPits(ctx);
  const aim = (me: number, opp: number | undefined, pit: number) => {
    const o = opp === undefined ? undefined : playerOf(world, opp);
    const c = pits[pit]?.center;
    out[me] = o?.alive ? clone(o.pos) : c ? v3(c.x, c.y + 1, c.z) : null;
  };
  for (const p of world.players) out[p.id] = null;
  if (st.phase === 'warmup') {
    st.ladder.forEach((id, i) => {
      const slot = warmupSlot(st, id);
      if (slot) aim(id, st.ladder[i ^ 1], slot.pit);
    });
  } else if (st.phase === 'duel')
    for (const d of st.duels) {
      if (d.winner !== null) continue;
      aim(d.ids[0], d.ids[1], d.pit);
      aim(d.ids[1], d.ids[0], d.pit);
    }
  return out;
};

/** Point every bot at its opponent; a new round wipes what they were chasing. */
export const applyArenaBotObjectives = (
  st: ArenaState,
  world: WorldState,
  ctx: SimContext,
  mems: Iterable<BotMemory>,
): void => {
  const obj = arenaBotObjectives(st, world, ctx);
  for (const mem of mems) {
    mem.objective = obj[mem.id] ?? null;
    mem.objectiveFirst = false;
    mem.useAt = null;
    if (st.phase === 'break') {
      mem.target = null;
      mem.path = [];
      mem.goal = null;
    }
  }
};

export interface ArenaTableRow {
  id: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  damage: number;
  left: boolean;
}

/** Compact arena state for clients (HUD, standings, results). */
export interface ArenaView {
  loadout: LoadoutName;
  phase: ArenaPhase;
  phaseEnds: number;
  startAt: number;
  round: number;
  matchStartTick: number;
  matchEnds: number;
  duelEnds: number;
  duelSec: number;
  pits: number;
  duels: {
    pit: number;
    ids: [number, number];
    winner: number | null;
    reason: DuelEndReason | null;
    endTick: number;
  }[];
  sitting: number[];
  ladder: number[];
  /** standings, best first (empty in warmup) */
  table: ArenaTableRow[];
  winner: number | null;
  endReason: string;
}

export const arenaView = (st: ArenaState): ArenaView => ({
  loadout: st.loadout,
  phase: st.phase,
  phaseEnds: st.phaseEnds,
  startAt: st.startAt,
  round: st.round,
  matchStartTick: st.matchStartTick,
  matchEnds: st.matchEnds,
  duelEnds: st.duelEnds,
  duelSec: st.settings.duelSec,
  pits: st.pitCount,
  duels: st.duels.map((d) => ({
    pit: d.pit,
    ids: [d.ids[0], d.ids[1]],
    winner: d.winner,
    reason: d.reason,
    endTick: d.endTick,
  })),
  sitting: st.sitting.slice(),
  ladder: st.ladder.slice(),
  table:
    st.phase === 'warmup'
      ? []
      : arenaStandings(st).map((e) => ({
          id: e.id,
          wins: e.wins,
          losses: e.losses,
          kills: e.kills,
          deaths: e.deaths,
          damage: Math.round(e.damage),
          left: e.left,
        })),
  winner: st.winner,
  endReason: st.endReason,
});
