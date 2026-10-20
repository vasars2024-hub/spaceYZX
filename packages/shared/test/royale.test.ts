// Royale (rules/royale.ts): free-for-all elimination on a royale map — spread-out spawns, the
// shrinking zone and its damage, location flashes, rounds and the first to 3 round wins.
import { describe, expect, it } from 'vitest';
import {
  buildLevel,
  createWorld,
  createPlayer,
  addPlayer,
  defaultConfig,
  step,
  applyDamage,
  createRoyale,
  startRoyale,
  updateRoyale,
  royaleToLobby,
  royaleJoin,
  royaleView,
  royaleStandings,
  royaleZoneAt,
  royaleData,
  royaleMaps,
  hasRoyale,
  planRoyaleZone,
  pickRoyaleSpawns,
  minGap,
  flashIntervalSec,
  royaleTimeScale,
  royaleRoundTimeFactor,
  royaleRoundRadiusFactor,
  outsideZone,
  applyRoyaleBotObjectives,
  botThink,
  createBotMemory,
  BOT_SKILLS,
  ROYALE_DEFAULTS,
  ROYALE_STAGES,
  royaleSettings,
  hashWorld,
  isEnemy,
  rngFromSeed,
  mapDef,
  MAPS,
  v3,
  TICK_DT,
  type BotMemory,
  type LevelDef,
  type PlayerInput,
  type RoyaleSettings,
  type RoyaleState,
  type SimContext,
  type SpawnDef,
  type WorldState,
} from '../src/index';
import { ROYALE_TEST_MAP, royaleTestDef, royaleTestMapInfo } from './royale-map';

const sec = (s: number) => Math.round(s / TICK_DT);
const S = royaleSettings();

/** A Royale on the test map with `n` players (ids 1…n; no bots unless `bots`). */
const setup = (
  n: number,
  seed = 7,
  settings: Partial<RoyaleSettings> = {},
  def = royaleTestDef(),
) => {
  const config = defaultConfig();
  const ctx: SimContext = { level: buildLevel(def), config, dt: TICK_DT, ffa: true };
  const world = createWorld(ctx.level, seed);
  for (let id = 1; id <= n; id++) {
    const s = def.spawns[id % def.spawns.length];
    addPlayer(world, createPlayer(id, id === 1 ? 0 : 1, s.pos, s.yawDeg, config));
  }
  const st = createRoyale(settings);
  startRoyale(st, world, ctx);
  return { ctx, world, st };
};

type W = { ctx: SimContext; world: WorldState; st: RoyaleState };

const run = (w: W, ticks: number, bots: BotMemory[] = []): boolean => {
  let over = false;
  for (let i = 0; i < ticks; i++) {
    const inputs: Record<number, PlayerInput> = {};
    for (const m of bots) {
      const p = w.world.players.find((q) => q.id === m.id);
      if (p) inputs[p.id] = botThink(w.world, w.ctx, p, m);
    }
    step(w.world, inputs, w.ctx);
    if (updateRoyale(w.st, w.world, w.ctx)) over = true;
    applyRoyaleBotObjectives(w.st, w.world, w.ctx, bots);
  }
  return over;
};

const toLive = (w: W) => run(w, sec(w.st.settings.countdownSec) + 1);

const kill = (w: W, id: number) => {
  const p = w.world.players.find((q) => q.id === id)!;
  p.shield = false;
  applyDamage(w.world, w.ctx, id, p, 9999, 'world', false, p.pos, p.pos);
};

/** Kill everyone but `winner` (in id order), then let the rules see it. */
const winRound = (w: W, winner: number) => {
  for (const p of w.world.players) if (p.id !== winner && p.alive) kill(w, p.id);
  run(w, 1);
};

describe('royale: spawns', () => {
  it('picks the most spread-out points (smallest gap within 10 % of the best possible)', () => {
    // a ring of 12 points plus 6 clustered in the middle: the best 6 are every other ring point
    const pts: SpawnDef[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pts.push({ pos: v3(Math.cos(a) * 100, 0, Math.sin(a) * 100), yawDeg: 0 });
    }
    for (let i = 0; i < 6; i++) pts.push({ pos: v3(i * 3 - 7, 0, 2), yawDeg: 0 });
    // brute force the true best smallest gap for 6 of the 18
    const bestGap = (k: number): number => {
      let best = 0;
      const pick: number[] = [];
      const rec = (from: number) => {
        if (pick.length === k) {
          best = Math.max(best, minGap(pick.map((i) => pts[i].pos)));
          return;
        }
        for (let i = from; i < pts.length; i++) {
          pick.push(i);
          rec(i + 1);
          pick.pop();
        }
      };
      rec(0);
      return best;
    };
    for (const k of [2, 4, 6]) {
      const best = bestGap(k);
      for (let seed = 1; seed <= 5; seed++) {
        const idx = pickRoyaleSpawns(pts, k, rngFromSeed(seed), 0.9);
        expect(new Set(idx).size).toBe(k);
        expect(minGap(idx.map((i) => pts[i].pos))).toBeGreaterThanOrEqual(best * 0.9 - 1e-9);
      }
    }
    // more players than points: every point, then again
    expect(pickRoyaleSpawns(pts.slice(0, 3), 5, rngFromSeed(1))).toEqual([0, 1, 2, 0, 1]);
  });

  it('a round places everyone on its own spread-out royale spawn, frozen for the countdown', () => {
    const w = setup(8);
    const data = royaleData(w.ctx.level.def);
    expect(w.st.phase).toBe('countdown');
    expect(w.st.round).toBe(1);
    expect(new Set(w.st.spawnIdx).size).toBe(8);
    const at = w.world.players.map((p) => p.pos);
    const best = minGap(w.st.spawnIdx.map((i) => data.spawns[i].pos));
    expect(minGap(at)).toBeCloseTo(best, 1);
    // far apart on the test yard (32 points over ~240 m)
    expect(best).toBeGreaterThan(40);
    expect(w.world.players.every((p) => p.frozen && p.alive)).toBe(true);
    toLive(w);
    expect(w.st.phase).toBe('live');
    expect(w.world.players.every((p) => !p.frozen)).toBe(true);
  });

  it('the spawn set and seats depend on the seed (and only on it)', () => {
    const a = setup(6, 3).world.players.map((p) => p.pos);
    const b = setup(6, 3).world.players.map((p) => p.pos);
    expect(a).toEqual(b);
    const seeds = new Set<string>();
    for (let seed = 1; seed <= 8; seed++)
      seeds.add(JSON.stringify(setup(6, seed).world.players.map((p) => p.pos)));
    expect(seeds.size).toBeGreaterThan(1);
  });
});

describe('royale: the zone', () => {
  it('stages: wait, then shrink to a smaller circle that lies inside the last one', () => {
    const w = setup(5);
    const plan = w.st.zone!;
    const data = royaleData(w.ctx.level.def);
    expect(plan.radius).toBe(data.radius);
    expect(plan.stages.length).toBe(ROYALE_STAGES.length);
    let prev = { center: plan.center, radius: plan.radius };
    let t = w.st.liveTick;
    for (const s of plan.stages) {
      expect(s.waitStart).toBe(t);
      expect(s.shrinkStart).toBeGreaterThan(s.waitStart);
      expect(s.shrinkEnd).toBeGreaterThan(s.shrinkStart);
      expect(s.radius).toBeLessThan(prev.radius);
      const off = Math.hypot(s.center.x - prev.center.x, s.center.z - prev.center.z);
      expect(off + s.radius).toBeLessThanOrEqual(prev.radius + 1e-6);
      prev = s;
      t = s.shrinkEnd;
    }
    expect(plan.stages[plan.stages.length - 1].radius).toBe(0);
    // the zone at a few moments
    const s0 = plan.stages[0];
    const wait = royaleZoneAt(plan, s0.waitStart + 10);
    expect(wait).toMatchObject({ stage: 0, state: 'wait', radius: plan.radius });
    expect(wait.next?.radius).toBe(s0.radius);
    const mid = royaleZoneAt(plan, Math.round((s0.shrinkStart + s0.shrinkEnd) / 2));
    expect(mid.state).toBe('shrink');
    expect(mid.radius).toBeCloseTo((plan.radius + s0.radius) / 2, 0);
    expect(royaleZoneAt(plan, s0.shrinkEnd)).toMatchObject({ stage: 1, state: 'wait' });
    const closed = royaleZoneAt(plan, t + 5);
    expect(closed).toMatchObject({ state: 'closed', radius: 0, next: null });
    // damage grows every stage
    for (let i = 1; i < plan.stages.length; i++)
      expect(plan.stages[i].dps).toBeGreaterThan(plan.stages[i - 1].dps);
  });

  it('times scale with the map: a ~1 km map plays the stages as written, smaller maps quicker', () => {
    expect(royaleTimeScale(500, S)).toBe(1);
    expect(royaleTimeScale(135, S)).toBeCloseTo(Math.sqrt(135 / 500), 6);
    expect(royaleTimeScale(20, S)).toBe(S.minTimeScale);
    expect(royaleTimeScale(5000, S)).toBe(S.maxTimeScale);
    // the whole first-round plan at the reference size: 6–9 minutes
    const total = ROYALE_STAGES.reduce((n, s) => n + s.waitSec + s.shrinkSec, 0);
    expect(total / 60).toBeGreaterThanOrEqual(6);
    expect(total / 60).toBeLessThanOrEqual(9);
  });

  it('later rounds: zone times × 0.85 per round played (floor 0.5), first circle × 0.92 (floor 0.6)', () => {
    expect(ROYALE_DEFAULTS.roundTimeFactor).toBe(0.85);
    expect(ROYALE_DEFAULTS.roundRadiusFactor).toBe(0.92);
    expect(royaleRoundTimeFactor(1, S)).toBe(1);
    expect(royaleRoundTimeFactor(2, S)).toBeCloseTo(0.85, 9);
    expect(royaleRoundTimeFactor(3, S)).toBeCloseTo(0.7225, 9);
    expect(royaleRoundTimeFactor(9, S)).toBe(0.5);
    expect(royaleRoundRadiusFactor(2, S)).toBeCloseTo(0.92, 9);
    expect(royaleRoundRadiusFactor(12, S)).toBe(0.6);
    const def = royaleTestDef();
    const plan = (round: number) => planRoyaleZone(def, 1000, round, S, rngFromSeed(5), TICK_DT);
    const r1 = plan(1);
    const r2 = plan(2);
    expect(r2.radius).toBeCloseTo(r1.radius * 0.92, 6);
    for (let i = 0; i < r1.stages.length; i++) {
      const a = r1.stages[i];
      const b = r2.stages[i];
      // (ticks are whole: within a tick of 0.85 ×)
      expect(
        Math.abs(b.shrinkStart - b.waitStart - 0.85 * (a.shrinkStart - a.waitStart)),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(b.shrinkEnd - b.shrinkStart - 0.85 * (a.shrinkEnd - a.shrinkStart)),
      ).toBeLessThanOrEqual(1);
    }
    const dur = (p: typeof r1) => p.stages[p.stages.length - 1].shrinkEnd - 1000;
    expect(dur(r2) / dur(r1)).toBeCloseTo(0.85, 2);
  });

  it('outside the zone you lose HP every half second, more in later stages', () => {
    const w = setup(3);
    toLive(w);
    const plan = w.st.zone!;
    const p = w.world.players.find((q) => q.id === 2)!;
    // a tiny zone round player 3 (spawns are far apart: player 2 stands well outside it)
    const safe = w.world.players.find((q) => q.id === 3)!.pos;
    plan.center = { ...safe };
    plan.radius = 5;
    for (const s of plan.stages) Object.assign(s, { center: { ...safe }, radius: 5 });
    const far = { ...p.pos };
    const hold = () => {
      p.pos = { ...far };
      p.vel = v3();
    };
    const hp0 = p.hp;
    // the first wait is a grace period: no damage yet
    for (let i = 0; i < sec(2); i++) {
      hold();
      run(w, 1);
    }
    expect(p.hp).toBe(hp0);
    // from the first shrink on it hurts
    w.world.tick = plan.stages[0].shrinkStart;
    for (let i = 0; i < sec(2); i++) {
      hold();
      run(w, 1);
    }
    expect(outsideZone(royaleZoneAt(plan, w.world.tick), p.pos)).toBe(true);
    const lost = hp0 - p.hp;
    expect(lost).toBeGreaterThanOrEqual(ROYALE_STAGES[0].dps * 1.5 - 1e-6);
    expect(lost).toBeLessThanOrEqual(ROYALE_STAGES[0].dps * 2 + 1e-6);
    // the others (inside) are untouched
    expect(w.world.players.find((q) => q.id === 3)!.hp).toBe(hp0);
    // stage 4: 7 HP a second
    p.hp = 100;
    while (w.world.tick < plan.stages[3].waitStart + 2) {
      w.world.tick++;
    }
    const before = p.hp;
    for (let i = 0; i < sec(2); i++) {
      hold();
      run(w, 1);
    }
    expect(before - p.hp).toBeCloseTo(ROYALE_STAGES[3].dps * 2, 0);
  });
});

describe('royale: location flashes', () => {
  it('the interval runs from 45 s with 10 alive down to 10 s with 2', () => {
    expect(flashIntervalSec(10, S)).toBe(45);
    expect(flashIntervalSec(12, S)).toBe(45);
    expect(flashIntervalSec(2, S)).toBe(10);
    expect(flashIntervalSec(6, S)).toBeCloseTo(27.5, 9);
    for (let n = 3; n <= 10; n++)
      expect(flashIntervalSec(n, S)).toBeGreaterThan(flashIntervalSec(n - 1, S));
  });

  it('everyone alive is revealed for 1.5 s; deaths bring the next flash closer', () => {
    const w = setup(6);
    toLive(w);
    const first = w.st.nextFlash;
    expect(first - w.st.liveTick).toBe(sec(flashIntervalSec(6, S)));
    expect(w.st.revealed).toEqual([]);
    run(w, first - w.world.tick);
    expect(w.st.revealed.sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Object.keys(w.st.flashPos).length).toBe(6);
    run(w, sec(S.flashSec) + 1);
    expect(w.st.revealed).toEqual([]);
    const next = w.st.nextFlash;
    expect(next - w.st.lastFlash).toBe(sec(flashIntervalSec(6, S)));
    // three die: the flash comes at the 3-alive interval after the last one
    kill(w, 4);
    kill(w, 5);
    kill(w, 6);
    run(w, 1);
    expect(w.st.nextFlash).toBe(w.st.lastFlash + sec(flashIntervalSec(3, S)));
    expect(w.st.nextFlash).toBeLessThan(next);
    const v = royaleView(w.st, w.world, ROYALE_TEST_MAP);
    expect(v.alive.sort()).toEqual([1, 2, 3]);
  });
});

describe('royale: rounds and the match', () => {
  it('the last one alive wins the round; places count down as players fall', () => {
    const w = setup(5);
    toLive(w);
    kill(w, 3);
    run(w, 1);
    expect(w.st.out).toEqual([{ id: 3, place: 5, tick: w.world.tick }]);
    kill(w, 1);
    kill(w, 5);
    run(w, 1);
    // same tick: more kills / damage first, else the lower id places higher
    expect(w.st.out.slice(1).map((o) => [o.id, o.place])).toEqual([
      [1, 3],
      [5, 4],
    ]);
    kill(w, 2);
    run(w, 1);
    expect(w.st.phase).toBe('roundEnd');
    expect(w.st.roundWinner).toBe(4);
    expect(w.st.wins[4]).toBe(1);
    expect(w.st.out.find((o) => o.place === 1)?.id).toBe(4);
    expect(w.world.players.every((p) => p.frozen)).toBe(true);
    const table = royaleStandings(w.st, w.world);
    expect(table[0]).toMatchObject({ id: 4, wins: 1, place: 1 });
    // next round: everyone back, fresh spawns, the zone a little smaller and quicker
    const r1 = w.st.zone!;
    run(w, sec(S.roundResultsSec) + 1);
    expect(w.st.phase).toBe('countdown');
    expect(w.st.round).toBe(2);
    expect(w.world.players.every((p) => p.alive && p.hp === 100)).toBe(true);
    expect(w.st.zone!.radius).toBeCloseTo(r1.radius * 0.92, 6);
  });

  it('everyone out on the same tick: the best of them wins the round', () => {
    const w = setup(3);
    toLive(w);
    w.world.players.find((p) => p.id === 3)!.kills = 2;
    for (const id of [1, 2, 3]) kill(w, id);
    run(w, 1);
    expect(w.st.phase).toBe('roundEnd');
    expect(w.st.roundWinner).toBe(3);
  });

  it('the first to 3 round wins takes the match; then the results, then the lobby', () => {
    const w = setup(4);
    const winners = [2, 3, 2, 4, 2];
    let i = 0;
    while (w.st.phase !== 'end') {
      toLive(w);
      winRound(w, winners[i++]);
      if (w.st.phase === 'roundEnd') run(w, sec(S.roundResultsSec) + 1);
    }
    expect(i).toBe(5);
    expect(w.st.winner).toBe(2);
    expect(w.st.wins).toEqual({ 1: 0, 2: 3, 3: 1, 4: 1 });
    expect(w.st.rounds.map((r) => r.winner)).toEqual(winners);
    const table = royaleStandings(w.st, w.world);
    expect(table[0]).toMatchObject({ id: 2, wins: 3 });
    expect(table[3].id).toBe(1);
    const over = run(w, sec(S.resultsSec) + 1);
    expect(over).toBe(true);
    royaleToLobby(w.st, w.world, w.ctx);
    expect(w.st.phase).toBe('lobby');
    // a new match starts from zero
    startRoyale(w.st, w.world, w.ctx);
    expect(w.st.round).toBe(1);
    expect(w.st.wins[2]).toBe(0);
  });

  it('a player who joins mid-match watches until the next round', () => {
    const w = setup(3);
    toLive(w);
    const s = w.ctx.level.def.spawns[0];
    addPlayer(w.world, createPlayer(9, 1, s.pos, s.yawDeg, w.ctx.config));
    royaleJoin(w.st, w.world, w.ctx, 9);
    expect(w.world.players.find((p) => p.id === 9)!.alive).toBe(false);
    winRound(w, 1);
    // (the newcomer never counted: 3 entrants)
    expect(w.st.out.length).toBe(3);
    run(w, sec(S.roundResultsSec) + 1);
    expect(w.st.entrants).toContain(9);
    expect(w.world.players.find((p) => p.id === 9)!.alive).toBe(true);
  });

  it('free-for-all: everyone is everyone else’s enemy', () => {
    const w = setup(3);
    const [a, b] = w.world.players;
    a.team = 0;
    b.team = 0;
    expect(isEnemy(w.ctx, a, b)).toBe(true);
  });
});

describe('royale: maps', () => {
  it('every royale map (and the test yard) has its spawn points inside the first circle', () => {
    const defs = [royaleTestDef(), ...royaleMaps().map((m) => mapDef(m.id))];
    for (const d of defs) {
      const r = d.royale!;
      expect(r.spawns.length, d.name).toBeGreaterThanOrEqual(ROYALE_DEFAULTS.maxPlayers);
      for (const sp of r.spawns)
        expect(outsideZone({ center: r.center, radius: r.radius }, sp.pos), d.name).toBe(false);
    }
  });

  it('only maps with royale data are offered (none in the registry yet; the test yard has it)', () => {
    expect(hasRoyale(mapDef('colossus-yard'))).toBe(false);
    expect(hasRoyale(royaleTestDef())).toBe(true);
    const defOf = (id: string): LevelDef => (id === ROYALE_TEST_MAP ? royaleTestDef() : mapDef(id));
    const list = [...MAPS, royaleTestMapInfo()];
    expect(royaleMaps(list, defOf).map((m) => m.id)).toContain(ROYALE_TEST_MAP);
    // every map flagged `royale` in the registry really has the data
    for (const m of MAPS.filter((x) => x.royale)) expect(hasRoyale(mapDef(m.id)), m.id).toBe(true);
    // royale data on a map without it: its spawns and its whole bounds (tools)
    const d = royaleData(mapDef('training-bay'));
    expect(d.spawns.length).toBe(mapDef('training-bay').spawns.length);
    expect(d.radius).toBeGreaterThan(30);
  });
});

/** A bot Royale on the test map: `n` bots (ids 1…n), quick zone. */
const botMatch = (n: number, seed: number, settings: Partial<RoyaleSettings> = {}) => {
  const w = setup(n, seed, { minTimeScale: 0.15, refRadiusM: 6000, ...settings });
  // (the zone at 0.15 × of a 1 km map's times: a round lasts about 1.5 minutes)
  const bots = w.world.players.map((p) =>
    createBotMemory(p.id, BOT_SKILLS.normal, seed * 31 + p.id),
  );
  return { w, bots };
};

describe('royale: bots', () => {
  it('a bot round on the test map ends with exactly one winner', () => {
    const { w, bots } = botMatch(6, 11, { winsToWin: 1 });
    let t = 0;
    while (w.st.phase !== 'end' && t < sec(240)) {
      run(w, 60, bots);
      t += 60;
    }
    expect(w.st.phase).toBe('end');
    expect(w.st.winner).not.toBeNull();
    const places = w.st.out.map((o) => o.place).sort((a, b) => a - b);
    expect(places).toEqual([1, 2, 3, 4, 5, 6]);
    expect(w.st.out.find((o) => o.place === 1)!.id).toBe(w.st.winner);
    // bots killed each other (not only the zone)
    expect(w.world.players.reduce((k, p) => k + p.kills, 0)).toBeGreaterThan(0);
  }, 120_000);

  it('bots outside the zone run for it', () => {
    const { w, bots } = botMatch(4, 3);
    toLive(w);
    const plan = w.st.zone!;
    const p = w.world.players[0];
    // jump to the third stage: the first circle is a quarter of the yard
    w.world.tick = plan.stages[2].waitStart + 10;
    applyRoyaleBotObjectives(w.st, w.world, w.ctx, bots);
    const z = royaleZoneAt(plan, w.world.tick);
    const mem = bots.find((m) => m.id === p.id)!;
    const outside = Math.hypot(p.pos.x - z.center.x, p.pos.z - z.center.z) > z.radius - 8;
    if (outside) {
      expect(mem.objectiveFirst).toBe(true);
      expect(mem.objective).toEqual(z.next!.center);
    }
    expect(mem.objective).not.toBeNull();
  });

  it('a bot Royale replays bit for bit (same seed, same match)', () => {
    const play = () => {
      const { w, bots } = botMatch(5, 21);
      run(w, sec(40), bots);
      return { hash: hashWorld(w.world), view: JSON.stringify(royaleView(w.st, w.world, 'x')) };
    };
    const a = play();
    const b = play();
    expect(a.hash).toBe(b.hash);
    expect(a.view).toBe(b.view);
  }, 60_000);
});
