// Elimination ('elim'): rounds like Tower mode, but no Towers, Controllers or bomb — a round is
// won only by wiping out the enemy team; when the timer runs out, Tower mode's overtime decides.
// Also 3v3 (casual team size) starting with all three objectives on every competitive map.
import { describe, expect, it } from 'vitest';
import {
  buildLevel,
  createWorld,
  createPlayer,
  addPlayer,
  defaultConfig,
  csConfig,
  step,
  mapDef,
  createMatch,
  startMatch,
  updateMatch,
  towerOf,
  botObjectives,
  applyBotObjectives,
  matchView,
  botThink,
  createBotMemory,
  BOT_SKILLS,
  v3,
  sub,
  len,
  TICK_DT,
  MODE_RULES,
  type BotMemory,
  type GameConfig,
  type MatchObjective,
  type MatchState,
  type PlayerInput,
  type SimContext,
  type SimEvent,
  type TeamMode,
  type WorldState,
} from '../src/index';

const COMPETITIVE = ['split-deck', 'kestrel', 'orbital-ring'];

const setup = (
  mode: TeamMode,
  perTeam: number,
  opts: {
    map?: string;
    objective?: MatchObjective;
    config?: GameConfig;
    loadout?: 'lethal' | 'cs';
  } = {},
) => {
  const config = opts.config ?? defaultConfig();
  const ctx: SimContext = { level: buildLevel(mapDef(opts.map ?? 'kestrel')), config, dt: TICK_DT };
  const world = createWorld(ctx.level, 7);
  let id = 1;
  for (const team of [0, 1] as const)
    for (let i = 0; i < perTeam; i++) {
      const s = ctx.level.def.spawns.find((sp) => sp.team === team)!;
      addPlayer(world, createPlayer(id++, team, s.pos, s.yawDeg, config));
    }
  const ms = createMatch(mode, opts.objective ?? 'elim', opts.loadout ?? 'lethal');
  return { ctx, world, ms };
};

let pending: SimEvent[] = [];

const tick = (ms: MatchState, world: WorldState, ctx: SimContext, n = 1) => {
  for (let i = 0; i < n; i++) {
    step(world, {}, ctx);
    world.events.push(...pending);
    pending = [];
    updateMatch(ms, world, ctx);
  }
};

const secs = (s: number) => Math.round(s * 60);

const kill = (world: WorldState, victim: number, attacker: number) => {
  const v = world.players.find((p) => p.id === victim)!;
  const a = world.players.find((p) => p.id === attacker)!;
  v.alive = false;
  v.hp = 0;
  pending.push({
    type: 'kill',
    attacker,
    victim,
    kind: 'slash',
    teamKill: v.team === a.team,
    pos: { ...v.pos },
    src: { ...a.pos },
    throwId: 0,
  });
};

describe('Elimination', () => {
  it('has no Controllers or bomb; touching the enemy Tower does nothing', () => {
    const { ctx, world, ms } = setup('1v1', 1);
    startMatch(ms, world, ctx);
    expect(ms.controllers.map((c) => c.carrier)).toEqual([null, null]);
    expect(ms.bomb).toBeNull();
    const view = matchView(ms);
    expect(view.objective).toBe('elim');
    expect(view.carriers).toEqual([]);
    expect(view.attackers).toBeNull();
    expect(view.bomb).toBeNull();
    tick(ms, world, ctx, secs(5) + 1);
    expect(ms.phase).toBe('live');
    // same round length as Tower mode for the size
    expect(ms.roundEnds - ms.roundStart).toBe(secs(MODE_RULES['1v1'].roundSec));
    const p = world.players.find((q) => q.team === 0)!;
    const tower = towerOf(ms, ctx, 1)!;
    p.pos = v3(tower.pos.x - 3, 0.9, tower.pos.z);
    p.vel = v3();
    tick(ms, world, ctx, 30);
    expect(ms.phase).toBe('live');
    expect(ms.scores).toEqual([0, 0]);
  });

  it('a round is won by eliminating the whole enemy team', () => {
    const { ctx, world, ms } = setup('2v2', 2);
    startMatch(ms, world, ctx);
    tick(ms, world, ctx, secs(5) + 1);
    kill(world, 3, 1);
    tick(ms, world, ctx, 2);
    expect(ms.phase).toBe('live');
    kill(world, 4, 2);
    tick(ms, world, ctx, 1);
    expect(ms.phase).toBe('roundEnd');
    expect(ms.scores).toEqual([1, 0]);
    expect(ms.rounds[0].reason).toBe('elimination');
    // next round: still no carriers
    tick(ms, world, ctx, secs(5) + 2);
    expect(ms.round).toBe(2);
    expect(ms.controllers.map((c) => c.carrier)).toEqual([null, null]);
  });

  it('reveals everyone in the last seconds, like Tower mode', () => {
    const { ctx, world, ms } = setup('2v2', 2);
    startMatch(ms, world, ctx);
    tick(ms, world, ctx, secs(5) + 1);
    tick(ms, world, ctx, secs(10));
    expect(ms.revealed).toEqual([]);
    const r = ctx.config.rules;
    tick(ms, world, ctx, ms.roundEnds - world.tick - secs(r.lastSecondsRevealAll) + 1);
    expect(ms.revealed.sort()).toEqual([1, 2, 3, 4]);
  });

  it('timer runs out: the collapse overtime decides it (never a draw)', () => {
    const config = defaultConfig();
    config.rules.skyOvertimeChance = 0;
    config.rules.collapseOutsideSec = 1e6; // (nobody dies outside the zone here)
    const { ctx, world, ms } = setup('1v1', 1, { config });
    startMatch(ms, world, ctx);
    tick(ms, world, ctx, secs(5) + 1);
    tick(ms, world, ctx, ms.roundEnds - world.tick);
    expect(ms.phase).toBe('live');
    expect(ms.overtime?.kind).toBe('collapse');
    // both still alive at the time limit: the tie-break (alive, then HP, ...) picks the winner
    world.players[1].hp -= 10;
    tick(ms, world, ctx, ms.overtime!.ends - world.tick + 1);
    expect(ms.phase).toBe('roundEnd');
    expect(ms.rounds).toEqual([{ winner: 0, reason: 'collapse', tick: expect.any(Number) }]);
  });

  it('can end in the sky duel on a map with a sky arena', () => {
    const config = defaultConfig();
    config.rules.skyOvertimeChance = 1;
    const map = COMPETITIVE.find((m) => mapDef(m).skyArena);
    if (!map) return;
    const { ctx, world, ms } = setup('1v1', 1, { config, map });
    startMatch(ms, world, ctx);
    tick(ms, world, ctx, secs(5) + 1);
    tick(ms, world, ctx, ms.roundEnds - world.tick);
    expect(ms.overtime?.kind).toBe('sky');
    tick(ms, world, ctx, ms.overtime!.ends - world.tick + 1);
    expect(ms.phase).toBe('roundEnd');
    expect(ms.rounds[0].winner).not.toBeNull();
  });

  it('works with the CS kit (no round-start shield, round by elimination)', () => {
    const { ctx, world, ms } = setup('2v2', 2, {
      config: csConfig(defaultConfig()),
      loadout: 'cs',
    });
    startMatch(ms, world, ctx);
    expect(ms.objective).toBe('elim');
    expect(ms.bomb).toBeNull();
    expect(world.players.every((p) => !p.shield)).toBe(true);
    tick(ms, world, ctx, secs(5) + 1);
    kill(world, 1, 3);
    kill(world, 2, 4);
    tick(ms, world, ctx, 1);
    expect(ms.scores).toEqual([0, 1]);
    expect(ms.rounds[0].reason).toBe('elimination');
  });

  it('bots head for the nearest living enemy', () => {
    const { ctx, world, ms } = setup('2v2', 2);
    startMatch(ms, world, ctx);
    expect(Object.values(botObjectives(ms, world, ctx)).every((g) => g === null)).toBe(true);
    tick(ms, world, ctx, secs(5) + 1);
    const obj = botObjectives(ms, world, ctx);
    for (const p of world.players) {
      const enemies = world.players.filter((q) => q.team !== p.team && q.alive);
      const nearest = Math.min(...enemies.map((q) => len(sub(q.pos, p.pos))));
      expect(obj[p.id]).not.toBeNull();
      expect(len(sub(obj[p.id]!, p.pos))).toBeCloseTo(nearest, 5);
    }
  });

  for (const map of ['split-deck', 'kestrel'])
    it(`bots close in on each other and fight (${map})`, () => {
      const config = defaultConfig();
      const def = mapDef(map);
      const ctx: SimContext = { level: buildLevel(def), config, dt: TICK_DT };
      const world = createWorld(ctx.level, 11);
      const mems: BotMemory[] = [];
      let id = 1;
      for (const team of [0, 1] as const)
        for (let i = 0; i < 2; i++) {
          const s = def.spawns.filter((sp) => sp.team === team)[i] ?? def.spawns[0];
          addPlayer(world, createPlayer(id, team, s.pos, s.yawDeg, config));
          mems.push(createBotMemory(id, BOT_SKILLS.normal, id * 13));
          id++;
        }
      const ms = createMatch('2v2', 'elim');
      startMatch(ms, world, ctx);
      const gap = () => {
        let d = Infinity;
        for (const p of world.players)
          for (const q of world.players)
            if (p.alive && q.alive && p.team !== q.team) d = Math.min(d, len(sub(p.pos, q.pos)));
        return d;
      };
      const kills: SimEvent[] = [];
      let startGap = 0;
      let minGap = Infinity;
      while (ms.rounds.length < 1 && world.tick < secs(5 + 90 + 40)) {
        const inputs: Record<number, PlayerInput> = {};
        for (const mem of mems) {
          const p = world.players.find((q) => q.id === mem.id)!;
          if (p.alive) inputs[p.id] = botThink(world, ctx, p, mem);
        }
        step(world, inputs, ctx);
        updateMatch(ms, world, ctx);
        applyBotObjectives(ms, world, ctx, mems);
        kills.push(...world.events.filter((e) => e.type === 'kill'));
        if (ms.phase === 'live' && world.tick === ms.roundStart + 1) startGap = gap();
        if (ms.phase === 'live') minGap = Math.min(minGap, gap());
      }
      expect(startGap).toBeGreaterThan(0);
      expect(minGap).toBeLessThan(startGap * 0.5);
      expect(kills.length).toBeGreaterThan(0);
      expect(ms.rounds.length).toBe(1);
      expect(ms.rounds[0].winner).not.toBeNull();
    }, 60000);
});

describe('3v3', () => {
  it('rules sit between 2v2 and 5v5', () => {
    const r = MODE_RULES['3v3'];
    expect(r.teamSize).toBe(3);
    expect(r.roundSec).toBeGreaterThan(MODE_RULES['2v2'].roundSec);
    expect(r.roundSec).toBeLessThan(MODE_RULES['5v5'].roundSec);
    expect(r.firstTo).toBe(MODE_RULES['2v2'].firstTo);
    expect(r.maxRounds % 2).toBe(1);
    // the longest match (every round played out, ~10 s between) stays under the hard cap
    const rules = defaultConfig().rules;
    expect(r.maxRounds * (r.roundSec + rules.spawnLockSec + rules.resultsSec)).toBeLessThan(
      rules.hardCapMin * 60,
    );
  });

  for (const map of COMPETITIVE)
    for (const objective of ['tower', 'bomb', 'elim'] as const)
      it(`starts with 3 per team on distinct own-side spawns (${map}, ${objective})`, () => {
        const def = mapDef(map);
        for (const team of [0, 1])
          expect(def.spawns.filter((s) => s.team === team).length).toBeGreaterThanOrEqual(3);
        const { ctx, world, ms } = setup('3v3', 3, { map, objective });
        startMatch(ms, world, ctx);
        expect(ms.rules.teamSize).toBe(3);
        expect(ms.phase).toBe('spawnLock');
        for (const team of [0, 1] as const)
          expect(world.players.filter((p) => p.team === team && p.alive).length).toBe(3);
        const keys = world.players.map((p) => `${p.pos.x.toFixed(2)},${p.pos.z.toFixed(2)}`);
        expect(new Set(keys).size).toBe(6);
        if (objective === 'tower')
          expect(ms.controllers.every((c) => c.carrier !== null)).toBe(true);
        if (objective === 'bomb') expect(ms.bomb?.carrier).not.toBeNull();
        tick(ms, world, ctx, secs(5) + 1);
        expect(ms.phase).toBe('live');
      });
});
