import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  applyArenaBotObjectives,
  applyDamage,
  ARENA_MAP,
  arenaCanSee,
  arenaJoin,
  arenaLeave,
  arenaPitOf,
  arenaPitZ,
  arenaStandings,
  arenaWatchPit,
  BOT_SKILLS,
  botThink,
  Btn,
  buildLevel,
  capsuleOverlaps,
  createArena,
  createBotMemory,
  createPlayer,
  createWorld,
  csConfig,
  defaultConfig,
  hashWorld,
  lineOfSight,
  mapDef,
  MAPS,
  newRating,
  nextLadder,
  pairLadder,
  pickArenaGroup,
  pickSitter,
  qForward,
  raycast,
  rngFloat,
  rngFromSeed,
  step,
  TICK_DT,
  updateArena,
  updateArenaRatings,
  v3,
  waypointRoute,
  yawToView,
  type ArenaEntry,
  type ArenaSettings,
  type ArenaState,
  type BotMemory,
  type GameConfig,
  type PlayerInput,
  type SimContext,
  type Vec3,
  type WorldState,
} from '../src/index';

const LEVEL = buildLevel(mapDef('arena'));
const DEF = LEVEL.def;
const PITS = DEF.arenaPits!;

const standingCapsule = (feet: Vec3) => ({
  center: v3(feet.x, feet.y + 0.9, feet.z),
  up: v3(0, 1, 0),
  halfSeg: 0.45,
  radius: 0.4,
});

/** Which pit a point is in (-1: none). */
const pitAt = (p: Vec3): number =>
  PITS.findIndex((q) => p.x >= q.min.x && p.x <= q.max.x && p.z >= q.min.z && p.z <= q.max.z);

describe('Arena map', () => {
  it('is registered as an arena-only, mirror-symmetric map with 4 pits', () => {
    const m = MAPS.find((x) => x.id === 'arena');
    expect(m?.arena).toBe(true);
    expect(m?.competitive).toBe(false);
    expect(m?.symmetric).toBe(true);
    expect(PITS.length).toBe(ARENA_MAP.pits);
    PITS.forEach((p, i) => expect(p.center.z).toBe(arenaPitZ(i)));
    expect(DEF.towers.length).toBe(0);
    expect(DEF.skyArena).toBeUndefined();
  });

  it('has two valid spawns per pit, at opposite ends, facing each other', () => {
    PITS.forEach((pit, i) => {
      const [a, b] = pit.spawns;
      expect(a.team).toBe(0);
      expect(b.team).toBe(1);
      expect(a.pos.x).toBeLessThan(0);
      expect(b.pos.x).toBe(-a.pos.x);
      for (const s of [a, b]) {
        expect(pitAt(s.pos)).toBe(i);
        expect(capsuleOverlaps(LEVEL, standingCapsule(s.pos))).toBe(false);
        expect(
          raycast(LEVEL, v3(s.pos.x, s.pos.y + 1, s.pos.z), v3(0, -1, 0), 2)?.point.y,
        ).toBeCloseTo(0, 3);
      }
      // the view at each spawn looks toward the other one
      expect(qForward(yawToView(a.yawDeg)).x).toBeGreaterThan(0.9);
      expect(qForward(yawToView(b.yawDeg)).x).toBeLessThan(-0.9);
      // and they can see each other down the middle (over the centre crate: from eye height)
      expect(lineOfSight(LEVEL, v3(a.pos.x, 1.6, a.pos.z + 5), v3(b.pos.x, 1.6, b.pos.z + 5))).toBe(
        true,
      );
    });
  });

  it('keeps every ramp at 30° or less, and has upper ground along both sides', () => {
    const tilted = DEF.boxes.filter((b) => b.q);
    expect(tilted.length).toBe(4 * PITS.length);
    for (const b of tilted) {
      const q = b.q!;
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      expect((Math.acos(Math.min(1, upY)) * 180) / Math.PI).toBeLessThanOrEqual(30);
    }
    for (const pit of PITS)
      for (const s of [-1, 1]) {
        const top = v3(0, 6, pit.center.z + s * 9.5);
        expect(raycast(LEVEL, top, v3(0, -1, 0), 10)?.point.y).toBeCloseTo(ARENA_MAP.upper.y, 3);
      }
  });

  it('seals every pit: rays from inside hit its own walls, floor or ceiling', () => {
    for (const pit of PITS)
      for (const p of [
        v3(0, 2, pit.center.z + 5),
        v3(-17, 1.5, pit.center.z),
        v3(17, 1.5, pit.center.z),
        v3(0, 5, pit.center.z + 9.5),
        v3(0, 9, pit.center.z),
      ])
        for (let a = 0; a < 360; a += 15)
          for (const el of [-60, -20, 0, 20, 45, 80]) {
            const r = (el * Math.PI) / 180;
            const dir = v3(
              Math.cos((a * Math.PI) / 180) * Math.cos(r),
              Math.sin(r),
              Math.sin((a * Math.PI) / 180) * Math.cos(r),
            );
            const hit = raycast(LEVEL, p, dir, 200);
            expect(hit, `ray from ${JSON.stringify(p)} a${a} e${el}`).not.toBeNull();
            expect(pitAt(hit!.point), 'hit inside the same pit').toBe(PITS.indexOf(pit));
          }
  });

  it('keeps pits apart: no line of sight from one pit into another', () => {
    for (let i = 0; i < PITS.length; i++)
      for (let j = i + 1; j < PITS.length; j++) {
        expect(Math.abs(PITS[i].center.z - PITS[j].center.z)).toBeGreaterThanOrEqual(50);
        for (const x of [-15, 0, 15])
          for (const y of [1.6, 4.6])
            expect(lineOfSight(LEVEL, v3(x, y, PITS[i].center.z), v3(x, y, PITS[j].center.z))).toBe(
              false,
            );
      }
  });

  it('waypoints sit in open space, links see each other, stay in their pit, and connect the pit', () => {
    const wps = DEF.waypoints!;
    for (const [i, w] of wps.entries()) {
      expect(
        capsuleOverlaps(LEVEL, { center: w.pos, up: v3(0, 1, 0), halfSeg: 0, radius: 0.3 }),
        `waypoint ${i}`,
      ).toBe(false);
      for (const j of w.links) {
        expect(pitAt(wps[j].pos)).toBe(pitAt(w.pos));
        expect(lineOfSight(LEVEL, w.pos, wps[j].pos), `link ${i} → ${j}`).toBe(true);
      }
    }
    for (let p = 0; p < PITS.length; p++) {
      const mine = wps.map((w, i) => [w, i] as const).filter(([w]) => pitAt(w.pos) === p);
      const from = mine[0][1];
      for (const [, i] of mine) expect(waypointRoute(wps, from, i).length).toBeGreaterThan(0);
      // the upper ground on both sides is part of the graph
      expect(mine.filter(([w]) => w.pos.y > 3.5).length).toBe(10);
    }
  });

  const walkTo = (pitIndex: number, goal: Vec3, seed = 5): boolean => {
    const config = defaultConfig();
    const ctx: SimContext = { level: LEVEL, config, dt: TICK_DT };
    const world = createWorld(LEVEL, seed);
    const s = PITS[pitIndex].spawns[0];
    const p = addPlayer(world, createPlayer(1, 0, s.pos, s.yawDeg, config));
    const mem = createBotMemory(1, BOT_SKILLS.normal, seed);
    mem.objective = v3(goal.x, goal.y - 1, goal.z);
    mem.objectiveFirst = true;
    for (let t = 0; t < 60 * 25; t++) {
      step(world, { 1: botThink(world, ctx, p, mem) }, ctx);
      if (
        Math.hypot(p.pos.x - goal.x, p.pos.z - goal.z) < 2.5 &&
        Math.abs(p.pos.y - (goal.y - 1)) < 1.5
      )
        return true;
    }
    return false;
  };

  it.each([
    ['the far upper ground (south)', 0, v3(7.8, 4, -9.5)],
    ['the far upper ground (north)', 0, v3(7.8, 4, 9.5)],
    ['the near upper ground end', 0, v3(-3, 4, 9.5)],
    ['the far spawn', 0, v3(17, 1, 0)],
    ['the upper ground in pit 3', 2, v3(0, 4, -9.5)],
    ['the far spawn in pit 4', 3, v3(17, 1, 0)],
  ])('a bot walks to %s', (_name, pit, local) => {
    const goal = v3(local.x, local.y, PITS[pit].center.z + local.z);
    expect(walkTo(pit, goal)).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------

const fast: Partial<ArenaSettings> = {
  breakSec: 0.1,
  afterDuelSec: 0,
  warmupSec: 0.1,
  duelSec: 45,
  matchMin: 60,
};

const setup = (
  n: number,
  settings: Partial<ArenaSettings> = fast,
  seed = 3,
  config: GameConfig = defaultConfig(),
) => {
  const ctx: SimContext = { level: LEVEL, config, dt: TICK_DT };
  const world = createWorld(LEVEL, seed);
  const st = createArena('lethal', settings);
  for (let id = 1; id <= n; id++) {
    const s = DEF.spawns[(id - 1) % DEF.spawns.length];
    addPlayer(world, createPlayer(id, 0, s.pos, s.yawDeg, config));
    arenaJoin(st, world, ctx, id);
  }
  return { ctx, world, st };
};

const tick = (
  world: WorldState,
  ctx: SimContext,
  st: ArenaState,
  inputs: Record<number, PlayerInput> = {},
) => {
  step(world, inputs, ctx);
  updateArena(st, world, ctx);
};

/** Run until the arena reaches `phase` (or give up). */
const until = (
  world: WorldState,
  ctx: SimContext,
  st: ArenaState,
  phase: ArenaState['phase'],
  max = 60 * 120,
) => {
  for (let i = 0; i < max && st.phase !== phase; i++) tick(world, ctx, st);
  expect(st.phase).toBe(phase);
};

const kill = (world: WorldState, ctx: SimContext, by: number, victim: number) => {
  const p = world.players.find((q) => q.id === victim)!;
  p.shield = false; // (the round-start shield would soak this up)
  applyDamage(world, ctx, by, p, 9999, 'slash', false, p.pos, p.pos);
};

/** Play one round: in every duel `loser(duel ids)` dies to the other. */
const playRound = (
  world: WorldState,
  ctx: SimContext,
  st: ArenaState,
  loser: (ids: [number, number]) => number,
) => {
  until(world, ctx, st, 'duel');
  const round = st.round;
  step(world, {}, ctx);
  for (const d of st.duels) {
    const l = loser(d.ids);
    kill(world, ctx, d.ids[0] === l ? d.ids[1] : d.ids[0], l);
  }
  updateArena(st, world, ctx);
  for (let i = 0; i < 600 && st.round === round && st.phase !== 'matchEnd'; i++)
    tick(world, ctx, st);
};

describe('Arena rules: ladder and pairing', () => {
  it('moves winners up a pit and losers down (CS arena ladder)', () => {
    const ladder = [1, 2, 3, 4, 5, 6, 7, 8];
    const duels = [
      { ids: [1, 2] as [number, number], winner: 1 },
      { ids: [3, 4] as [number, number], winner: 4 },
      { ids: [5, 6] as [number, number], winner: 5 },
      { ids: [7, 8] as [number, number], winner: 7 },
    ];
    // pit 0: both top winners; pit 1: loser of 0 + winner of 2; pit 2: loser of 1 + winner
    // of 3; pit 3: both bottom losers
    expect(nextLadder(ladder, duels)).toEqual([1, 4, 2, 5, 3, 7, 6, 8]);
    // 2 players: they stay (winner on top)
    expect(nextLadder([5, 9], [{ ids: [5, 9], winner: 9 }])).toEqual([9, 5]);
    // a player who sat out keeps their place
    expect(
      nextLadder(
        [1, 2, 3, 4, 5],
        [
          { ids: [1, 2], winner: 2 },
          { ids: [4, 5], winner: 5 },
        ],
      ),
    ).toEqual([2, 5, 3, 1, 4]);
  });

  it('pairs neighbours on the ladder, but avoids repeat match-ups', () => {
    const cost = (met: Record<string, number>) => (a: number, b: number, gap: number) =>
      (gap - 1) ** 2 + 10 * (met[[a, b].sort().join('-')] ?? 0);
    expect(pairLadder([1, 2, 3, 4], cost({}))).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(pairLadder([1, 2, 3, 4], cost({ '1-2': 1, '3-4': 1 }))).toEqual([
      [1, 3],
      [2, 4],
    ]);
    expect(pairLadder([1, 2, 3, 4, 5, 6, 7, 8], cost({})).length).toBe(4);
  });

  it('sits out the player with the fewest sit-outs (odd counts), in rotation', () => {
    const e = (id: number, sitOuts: number, lastSitOut = 0): ArenaEntry => ({
      id,
      wins: 0,
      losses: 0,
      kills: 0,
      deaths: 0,
      damage: 0,
      sitOuts,
      lastSitOut,
      met: {},
      lastOpponent: null,
      left: false,
    });
    expect(pickSitter([1, 2, 3, 4], [])).toBeNull();
    expect(pickSitter([1, 2, 3], [e(1, 0), e(2, 0), e(3, 0)])).toBe(3); // lowest on the ladder
    expect(pickSitter([1, 2, 3], [e(1, 0), e(2, 1, 4), e(3, 1, 2)])).toBe(1);
    expect(pickSitter([1, 2, 3], [e(1, 1, 5), e(2, 1, 4), e(3, 1, 6)])).toBe(2);
  });

  it('4 players: everyone has met all 3 others after 3 rounds', () => {
    const { ctx, world, st } = setup(4);
    const rng = rngFromSeed(11);
    for (let r = 0; r < 3; r++)
      playRound(world, ctx, st, (ids) => ids[rngFloat(rng) < 0.5 ? 0 : 1]);
    for (const e of st.entries) expect(Object.keys(e.met).length).toBe(3);
  });

  it.each([6, 8])('%i players: no straight rematches, and many different opponents', (n) => {
    const { ctx, world, st } = setup(n);
    const rng = rngFromSeed(n * 7);
    const last = new Map<number, number>();
    for (let r = 0; r < n - 1; r++) {
      until(world, ctx, st, 'duel');
      for (const d of st.duels) {
        expect(last.get(d.ids[0])).not.toBe(d.ids[1]);
        last.set(d.ids[0], d.ids[1]);
        last.set(d.ids[1], d.ids[0]);
      }
      playRound(world, ctx, st, (ids) => ids[rngFloat(rng) < 0.5 ? 0 : 1]);
    }
    for (const e of st.entries)
      expect(Object.keys(e.met).length, `player ${e.id}`).toBeGreaterThanOrEqual(n - 3);
  });

  it('8 players: the top winner stays in pit 1, the bottom loser in pit 4, winners climb', () => {
    const { ctx, world, st } = setup(8);
    until(world, ctx, st, 'duel');
    const before = st.duels.map((d) => ({ pit: d.pit, w: d.ids[0], l: d.ids[1] }));
    playRound(world, ctx, st, (ids) => ids[1]);
    until(world, ctx, st, 'break');
    const pitNow = (id: number) => st.duels.find((d) => d.ids.includes(id))!.pit;
    expect(pitNow(before[0].w)).toBe(0);
    expect(pitNow(before[3].l)).toBe(3);
    const up = before.reduce((s, b) => s + pitNow(b.w), 0);
    const down = before.reduce((s, b) => s + pitNow(b.l), 0);
    expect(up).toBeLessThan(down);
  });

  it('5 players: each sits out exactly once in 5 rounds', () => {
    const { ctx, world, st } = setup(5);
    const sat: number[] = [];
    for (let r = 0; r < 5; r++) {
      until(world, ctx, st, 'duel');
      expect(st.sitting.length).toBe(1);
      sat.push(st.sitting[0]);
      // the one sitting out waits (dead), everyone else fights
      expect(world.players.find((p) => p.id === st.sitting[0])!.alive).toBe(false);
      playRound(world, ctx, st, (ids) => ids[1]);
    }
    expect([...sat].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('Arena rules: duels and the match', () => {
  it('starts after the warmup with 2+ players (not with 1), everyone in their own pit', () => {
    const one = setup(1, { ...fast, warmupSec: 1 });
    for (let i = 0; i < 120; i++) tick(one.world, one.ctx, one.st);
    expect(one.st.phase).toBe('warmup');
    const { ctx, world, st } = setup(4, { ...fast, warmupSec: 1 });
    for (let i = 0; i < 30; i++) tick(world, ctx, st);
    expect(st.phase).toBe('warmup');
    until(world, ctx, st, 'break', 120);
    expect(st.duels.length).toBe(2);
    for (const d of st.duels)
      for (const [side, id] of d.ids.entries()) {
        const p = world.players.find((q) => q.id === id)!;
        expect(pitAt(p.pos)).toBe(d.pit);
        expect(p.team).toBe(side);
        expect(p.frozen).toBe(true);
      }
    until(world, ctx, st, 'duel');
    expect(world.players.every((p) => !p.frozen)).toBe(true);
  });

  it('first kill wins the duel; the winner freezes, then both wait for the round', () => {
    const { ctx, world, st } = setup(4, { ...fast, afterDuelSec: 1 });
    until(world, ctx, st, 'duel');
    const [a, b] = st.duels[0].ids;
    step(world, {}, ctx);
    kill(world, ctx, a, b);
    updateArena(st, world, ctx);
    expect(st.duels[0]).toMatchObject({ winner: a, reason: 'kill' });
    expect(st.entries.find((e) => e.id === a)).toMatchObject({ wins: 1, kills: 1 });
    expect(st.entries.find((e) => e.id === b)).toMatchObject({ losses: 1, deaths: 1 });
    const pa = world.players.find((p) => p.id === a)!;
    expect(pa.frozen && pa.alive).toBe(true);
    for (let i = 0; i < 61; i++) tick(world, ctx, st);
    expect(pa.alive).toBe(false); // waiting (spectating) now
    // the other pit is still fighting: no new round yet
    expect(st.phase).toBe('duel');
    expect(st.duels[1].winner).toBeNull();
  });

  it('at the duel timer: more HP wins; equal HP: a coin flip — never a draw', () => {
    const { ctx, world, st } = setup(4, { ...fast, duelSec: 2, afterDuelSec: 1 });
    until(world, ctx, st, 'duel');
    const [a, b] = st.duels[0].ids;
    const pb = world.players.find((p) => p.id === b)!;
    pb.shield = false;
    applyDamage(world, ctx, a, pb, 20, 'slash', false, pb.pos, pb.pos);
    for (let i = 0; i < 130 && st.duels.some((d) => d.winner === null); i++) tick(world, ctx, st);
    expect(st.duels[0]).toMatchObject({ winner: a, reason: 'hp' });
    expect(st.duels[1].reason).toBe('coin');
    expect(st.duels[1].ids).toContain(st.duels[1].winner);
  });

  it('both dying on the same tick: more damage dealt wins', () => {
    const { ctx, world, st } = setup(2, { ...fast, afterDuelSec: 1 });
    until(world, ctx, st, 'duel');
    const [a, b] = st.duels[0].ids;
    const pa = world.players.find((p) => p.id === a)!;
    step(world, {}, ctx);
    pa.shield = false;
    applyDamage(world, ctx, b, pa, 30, 'slash', false, pa.pos, pa.pos);
    updateArena(st, world, ctx);
    step(world, {}, ctx);
    kill(world, ctx, a, b);
    kill(world, ctx, b, a);
    updateArena(st, world, ctx);
    expect(st.duels[0]).toMatchObject({ winner: b, reason: 'trade' });
  });

  it('leaving mid-duel is a forfeit; with 1 player left the arena ends', () => {
    const { ctx, world, st } = setup(3);
    until(world, ctx, st, 'duel');
    const [a, b] = st.duels[0].ids;
    arenaLeave(st, world, ctx, a);
    world.players = world.players.filter((p) => p.id !== a);
    expect(st.duels[0]).toMatchObject({ winner: b, reason: 'forfeit' });
    expect(st.phase).toBe('duel');
    const other = st.ladder.find((id) => id !== b)!;
    arenaLeave(st, world, ctx, other);
    expect(st.phase).toBe('matchEnd');
    expect(st.winner).toBe(b);
    expect(arenaStandings(st).at(-1)!.left).toBe(true);
  });

  it('the time limit: the running round finishes, then most duel wins takes the arena', () => {
    const { ctx, world, st } = setup(4, { ...fast, matchMin: 0.05, duelSec: 5 });
    until(world, ctx, st, 'duel');
    // time runs out during round 1 (3 s): it still plays out, and no round 2 starts
    for (let i = 0; i < 200; i++) tick(world, ctx, st);
    expect(world.tick).toBeGreaterThan(st.matchEnds);
    expect(st.phase).toBe('duel');
    until(world, ctx, st, 'matchEnd');
    expect(st.round).toBe(1);
    expect(st.endReason).toBe('time limit');
    expect(st.winner).toBe(st.standings[0]);
    expect(st.entries.find((e) => e.id === st.winner)!.wins).toBe(1);
  });

  it('standings: most wins, then fewer losses, more damage, more kills', () => {
    const st = createArena();
    const e = (id: number, wins: number, losses: number, damage: number, kills: number) => ({
      id,
      wins,
      losses,
      kills,
      deaths: 0,
      damage,
      sitOuts: 0,
      lastSitOut: 0,
      met: {},
      lastOpponent: null,
      left: false,
    });
    st.entries = [
      e(1, 3, 2, 500, 3),
      e(2, 4, 3, 100, 1),
      e(3, 3, 1, 100, 1),
      e(4, 3, 2, 500, 4),
      e(5, 3, 2, 600, 0),
      { ...e(6, 9, 0, 900, 9), left: true },
    ];
    st.ladder = [1, 2, 3, 4, 5];
    expect(arenaStandings(st).map((x) => x.id)).toEqual([2, 3, 5, 4, 1, 6]);
  });

  it('sees only its own pit; a waiting player watches the top pit still fighting', () => {
    const { ctx, world, st } = setup(6);
    until(world, ctx, st, 'duel');
    const [a, b] = st.duels[0].ids;
    const [c, d] = st.duels[1].ids;
    expect(arenaCanSee(st, world, a, b)).toBe(true);
    expect(arenaCanSee(st, world, a, c)).toBe(false);
    expect(arenaPitOf(st, c)).toBe(1);
    step(world, {}, ctx);
    kill(world, ctx, d, c);
    updateArena(st, world, ctx);
    // c is dead and waiting: watches pit 0 (still fighting), not its own
    expect(arenaWatchPit(st, world, c)).toBe(0);
    expect(arenaCanSee(st, world, c, a)).toBe(true);
    expect(arenaCanSee(st, world, c, st.duels[2].ids[0])).toBe(false);
  });

  it.each([
    ['lethal', defaultConfig(), Btn.Fire],
    ['cs', csConfig(defaultConfig()), Btn.Fire],
  ] as const)('%s kit: shots never cross into another pit', (_kit, config, fire) => {
    const run = (samePit: boolean) => {
      const ctx: SimContext = { level: LEVEL, config, dt: TICK_DT };
      const world = createWorld(LEVEL, 4);
      const z0 = PITS[0].center.z;
      // A on pit 1's upper ground, looking across the pit toward pit 2 (+z)
      const a = addPlayer(world, createPlayer(1, 0, v3(0, 3, z0 + 8), 180, config));
      const bz = samePit ? z0 + 11 : PITS[1].center.z - 9.5;
      const b = addPlayer(world, createPlayer(2, 1, v3(0, samePit ? 3 : 3, bz), 0, config));
      let hits = 0;
      for (let t = 0; t < 60 * 4; t++) {
        const buttons = t % 30 < 15 ? fire : 0;
        step(world, { 1: { tick: world.tick + 1, buttons, view: yawToView(180) } }, ctx);
        hits += world.events.filter((e) => e.type === 'hit' && e.victim === 2).length;
      }
      return { hits, hp: b.hp, a };
    };
    expect(run(true).hits).toBeGreaterThan(0); // the shots work
    const across = run(false);
    expect(across.hits).toBe(0);
    expect(across.hp).toBe(defaultConfig().combat.maxHp);
  });

  it('bots fight their opponent in their pit; the same seed plays the same arena', () => {
    const play = (seed: number) => {
      const { ctx, world, st } = setup(
        4,
        { ...fast, matchMin: 1.2, duelSec: 25, breakSec: 1, afterDuelSec: 1 },
        seed,
      );
      const mems: BotMemory[] = world.players.map((p) =>
        createBotMemory(p.id, BOT_SKILLS.normal, seed * 10 + p.id),
      );
      for (let t = 0; t < 60 * 150 && st.phase !== 'matchEnd'; t++) {
        const inputs: Record<number, PlayerInput> = {};
        for (const m of mems)
          inputs[m.id] = botThink(
            world,
            ctx,
            world.players.find((p) => p.id === m.id)!,
            m,
          );
        tick(world, ctx, st, inputs);
        applyArenaBotObjectives(st, world, ctx, mems);
        // nobody is ever hurt by someone outside their duel
        for (const e of world.events)
          if (e.type === 'hit' && e.attacker !== e.victim) {
            const d = st.duels.find((x) => x.ids.includes(e.victim));
            expect(d?.ids).toContain(e.attacker);
          }
      }
      return { st, hash: hashWorld(world) };
    };
    const a = play(21);
    expect(a.st.phase).toBe('matchEnd');
    expect(a.st.history.length).toBeGreaterThanOrEqual(4);
    expect(a.st.history.filter((h) => h.reason === 'kill').length).toBeGreaterThan(0);
    expect(a.st.winner).not.toBeNull();
    const b = play(21);
    expect(b.hash).toBe(a.hash);
    expect(b.st.history).toEqual(a.st.history);
  });
});

describe('Arena ladder rating and queue', () => {
  it('rates per duel: wins raise, losses lower, beating stronger players counts more', () => {
    const r = (rating: number) => ({ ...newRating(), rating, rd: 80 });
    const players = [r(1500), r(1500), r(1700), r(1300)].map((rating) => ({
      rating,
      placementGamesLeft: 0,
      left: false,
    }));
    const up = updateArenaRatings(players, [
      { a: 0, b: 2, winner: 0 }, // 0 beats the strong one
      { a: 1, b: 3, winner: 1 }, // 1 beats the weak one
    ]);
    expect(up[0].delta).toBeGreaterThan(up[1].delta);
    expect(up[1].delta).toBeGreaterThan(0);
    expect(up[2].delta).toBeLessThan(0);
    expect(up[3].delta).toBeLessThan(0);
    // more wins in a match move you more
    const many = updateArenaRatings(players, [
      { a: 0, b: 1, winner: 0 },
      { a: 0, b: 3, winner: 0 },
      { a: 0, b: 2, winner: 0 },
    ]);
    expect(many[0].delta).toBeGreaterThan(up[0].delta);
    // leaving costs extra
    const left = updateArenaRatings(
      [players[0], { ...players[1], left: true }],
      [{ a: 0, b: 1, winner: 0 }],
      { leaverPenalty: 15 },
    );
    expect(left[1].delta).toBeLessThan(-15);
  });

  it('the queue gathers 2–8 players: full rooms go at once, else after the gather window', () => {
    const e = (id: string, rating: number, joinedAtMs: number) => ({
      id,
      rating,
      pingMs: 20,
      joinedAtMs,
    });
    const opts = { minPlayers: 2, maxPlayers: 8, gatherMs: 15_000 };
    expect(pickArenaGroup([e('a', 1500, 0)], 60_000, opts)).toBeNull();
    const two = [e('a', 1500, 0), e('b', 1500, 5_000)];
    expect(pickArenaGroup(two, 10_000, opts)).toBeNull();
    expect(pickArenaGroup(two, 20_000, opts)).toEqual(['a', 'b']);
    const ten = Array.from({ length: 10 }, (_, i) => e(`p${i}`, 1000 + i * 100, i));
    const group = pickArenaGroup(ten, 20, opts)!;
    expect(group.length).toBe(8);
    expect(group[0]).toBe('p0');
    // nearest to the longest waiter's rating: the two strongest wait for the next room
    expect(group).not.toContain('p9');
    expect(group).not.toContain('p8');
  });
});
