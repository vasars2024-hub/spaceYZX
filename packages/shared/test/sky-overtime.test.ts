import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  applyBotObjectives,
  BOT_SKILLS,
  botThink,
  Btn,
  buildLevel,
  createBotMemory,
  createMatch,
  createPlayer,
  createWorld,
  defaultConfig,
  inSkyZone,
  jetpackTuning,
  mapDef,
  MAPS,
  Phase,
  qForward,
  raycast,
  startMatch,
  step,
  TICK_DT,
  towerOf,
  updateMatch,
  v3,
  type MatchState,
  type PlayerInput,
  type RankedMode,
  type SimContext,
  type SimEvent,
  type WorldState,
} from '../src/index';

const MATCH_MAPS = MAPS.filter((m) => m.competitive).map((m) => m.id);

const setup = (mapId: string, mode: RankedMode, perTeam: number, seed = 7, sky = 1) => {
  const config = defaultConfig();
  config.rules.skyOvertimeChance = sky;
  const ctx: SimContext = { level: buildLevel(mapDef(mapId)), config, dt: TICK_DT };
  const world = createWorld(ctx.level, seed);
  let id = 1;
  for (const team of [0, 1] as const)
    for (let i = 0; i < perTeam; i++) {
      const s = ctx.level.def.spawns.find((sp) => sp.team === team)!;
      addPlayer(world, createPlayer(id++, team, s.pos, s.yawDeg, config));
    }
  const ms = createMatch(mode);
  return { ctx, world, ms };
};

const secs = (s: number) => Math.round(s * 60);

const tick = (
  ms: MatchState,
  world: WorldState,
  ctx: SimContext,
  n = 1,
  inputs: () => Record<number, PlayerInput> = () => ({}),
) => {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    step(world, inputs(), ctx);
    updateMatch(ms, world, ctx);
    events.push(...world.events);
  }
  return events;
};

/** Start the match and skip straight to the end of round 1's timer (overtime starts). */
const toOvertime = (ms: MatchState, world: WorldState, ctx: SimContext) => {
  startMatch(ms, world, ctx);
  ms.phaseEnds = world.tick + 1; // skip the spawn lock
  tick(ms, world, ctx, 1);
  expect(ms.phase).toBe('live');
  ms.roundEnds = world.tick + 1;
  return tick(ms, world, ctx, 1);
};

const player = (world: WorldState, id: number) => world.players.find((p) => p.id === id)!;

describe('sky duel overtime', () => {
  it.each(MATCH_MAPS)(
    '%s: has a sky arena high above the ship, solid and open to the sky',
    (id) => {
      const def = mapDef(id);
      const a = def.skyArena!;
      expect(a).toBeDefined();
      expect(a.center.y - def.boundsMax.y).toBeGreaterThanOrEqual(200);
      const level = buildLevel(def);
      // the main platform is solid under the middle and at each team's start
      for (const s of a.spawns) {
        const hit = raycast(level, v3(s.pos.x, s.pos.y + 2, s.pos.z), v3(0, -1, 0), 4);
        expect(hit?.point.y).toBeCloseTo(a.center.y, 5);
      }
      // nothing above the main platform's edges but open sky, nothing below it but the void
      const hitUp = raycast(
        level,
        v3(a.center.x + 12, a.center.y + 1, a.center.z),
        v3(0, 1, 0),
        400,
      );
      expect(hitUp).toBeNull();
      const out = v3(a.center.x, a.center.y + 1, a.center.z + a.radius + 5);
      expect(raycast(level, out, v3(0, -1, 0), 100)).toBeNull();
      // the arena is a mirror image across its own middle (Kestrel stays symmetric)
      const key = (n: number) => n.toFixed(3);
      const boxes = new Set(
        a.boxes.map((b) => [b.c.x - a.center.x, b.c.y, b.c.z, b.h.x, b.h.y, b.h.z].map(key).join()),
      );
      for (const b of a.boxes)
        expect(
          boxes.has([a.center.x - b.c.x, b.c.y, b.c.z, b.h.x, b.h.y, b.h.z].map(key).join()),
        ).toBe(true);
      expect(a.spawns.filter((s) => s.team === 0).length).toBe(5);
      expect(a.spawns.filter((s) => s.team === 1).length).toBe(5);
    },
  );

  it('the timer roll picks the sky duel about 25% of the time (seeded), else the collapse', () => {
    let sky = 0;
    const n = 400;
    for (let seed = 1; seed <= n; seed++) {
      const { ctx, world, ms } = setup(MATCH_MAPS[seed % MATCH_MAPS.length], '1v1', 1, seed, 0.25);
      const events = toOvertime(ms, world, ctx);
      const ot = events.find((e) => e.type === 'overtime');
      expect(ot).toBeDefined();
      expect(ms.overtime?.kind).toBe(ot?.type === 'overtime' ? ot.kind : null);
      if (ms.overtime?.kind === 'sky') sky++;
    }
    expect(sky / n).toBeGreaterThan(0.19);
    expect(sky / n).toBeLessThan(0.31);
    // same seed, same result
    const a = setup('kestrel', '1v1', 1, 11, 0.25);
    const b = setup('kestrel', '1v1', 1, 11, 0.25);
    toOvertime(a.ms, a.world, a.ctx);
    toOvertime(b.ms, b.world, b.ctx);
    expect(a.ms.overtime?.kind).toBe(b.ms.overtime?.kind);
  });

  it('a map without a sky arena always collapses', () => {
    const { ctx, world, ms } = setup('kestrel', '1v1', 1);
    ctx.level = buildLevel({ ...mapDef('kestrel'), skyArena: undefined });
    toOvertime(ms, world, ctx);
    expect(ms.overtime?.kind).toBe('collapse');
  });

  it.each(MATCH_MAPS)('%s: everyone alive is teleported to the arena, teams facing off', (id) => {
    const { ctx, world, ms } = setup(id, '2v2', 2);
    startMatch(ms, world, ctx);
    ms.phaseEnds = world.tick + 1;
    tick(ms, world, ctx, 1);
    // a Boomerang in flight and a grenade: both gone after the teleport
    const b1 = world.boomerangs.find((b) => b.owner === 1)!;
    b1.phase = Phase.Out;
    const dead = player(world, 4);
    dead.alive = false;
    dead.hp = 0;
    const deadAt = { ...dead.pos };
    ms.roundEnds = world.tick + 1;
    const events = tick(ms, world, ctx, 1);
    expect(events).toContainEqual({ type: 'overtime', kind: 'sky' });
    expect(ms.overtime?.kind).toBe('sky');
    expect(ms.phase).toBe('live');
    const a = ctx.level.def.skyArena!;
    for (const p of world.players.filter((q) => q.alive)) {
      expect(inSkyZone(ctx.level.def, p.pos)).toBe(true);
      expect(Math.abs(p.pos.y - (a.center.y + 0.9))).toBeLessThan(0.2);
      expect(Math.hypot(p.pos.x - a.center.x, p.pos.z - a.center.z)).toBeLessThan(a.radius);
      // team 0 at the -x end looking +x, team 1 the other way round
      const side = p.team === 0 ? -1 : 1;
      expect(Math.sign(p.pos.x - a.center.x)).toBe(side);
      expect(Math.sign(qForward(p.view).x)).toBe(-side);
      expect(Math.hypot(p.vel.x, p.vel.z)).toBeLessThan(1e-6);
    }
    // distinct spots
    const keys = world.players.filter((q) => q.alive).map((p) => `${p.pos.x},${p.pos.z}`);
    expect(new Set(keys).size).toBe(keys.length);
    // the dead stay dead where they were
    expect(dead.alive).toBe(false);
    expect(dead.pos.x).toBeCloseTo(deadAt.x, 6);
    expect(world.boomerangs.every((b) => b.phase === Phase.Held)).toBe(true);
    expect(world.grenades).toEqual([]);
    // they land on the platform and stay up there (no "fell out of the ship" rescue)
    tick(ms, world, ctx, secs(1));
    for (const p of world.players.filter((q) => q.alive)) {
      expect(p.grounded).toBe(true);
      expect(inSkyZone(ctx.level.def, p.pos)).toBe(true);
    }
  });

  it('the jetpack is sped up in the sky: bigger tank, faster climb and refill', () => {
    const { ctx, world, ms } = setup('split-deck', '1v1', 1);
    toOvertime(ms, world, ctx);
    const m = ctx.config.movement;
    const p = player(world, 1);
    const sky = jetpackTuning(m, ctx.level.def, p.pos);
    const ship = jetpackTuning(m, ctx.level.def, ctx.level.def.spawns[0].pos);
    expect(ship.fuel).toBe(m.jetpackFuelSec);
    expect(sky.fuel).toBeCloseTo(m.jetpackFuelSec * 3, 6);
    expect(sky.refillPerSec).toBeGreaterThan(ship.refillPerSec);
    expect(sky.maxRise).toBeGreaterThan(ship.maxRise);
    expect(p.jetFuel).toBeCloseTo(sky.fuel, 6);
    // jump, then hold Space in the air: it burns longer and climbs faster than the ship's
    let top = 0;
    let burn = 0;
    let t = 0;
    tick(ms, world, ctx, secs(0.5)); // land first
    const inputs = () => {
      t++;
      // press (jump), release, then a fresh press held down (jetpack)
      const b = t <= 2 ? Btn.Jump : t <= 8 ? 0 : Btn.Jump;
      return { 1: { tick: world.tick + 1, buttons: b, view: p.view } };
    };
    for (let i = 0; i < secs(3); i++) {
      tick(ms, world, ctx, 1, inputs);
      top = Math.max(top, p.vel.y);
      if (p.jetOn) burn++;
    }
    expect(top).toBeGreaterThan(m.jetpackMaxRise + 1);
    expect(burn * TICK_DT).toBeGreaterThan(m.jetpackFuelSec * 2);
    expect(p.alive).toBe(true);
  });

  it('falling off the arena kills you (never back into the ship), the other side wins', () => {
    const { ctx, world, ms } = setup('kestrel', '1v1', 1);
    toOvertime(ms, world, ctx);
    const a = ctx.level.def.skyArena!;
    const p = player(world, 1);
    // step off the far side, out over the void
    p.pos = v3(a.center.x, a.center.y + 1, a.center.z + a.radius + 6);
    const events = tick(ms, world, ctx, secs(3));
    const kill = events.find((e) => e.type === 'kill' && e.victim === 1);
    expect(kill).toMatchObject({ type: 'kill', kind: 'world' });
    expect(p.alive).toBe(false);
    expect(p.pos.y).toBeGreaterThan(a.center.y - ctx.config.rules.skyFallKillDepth - 3);
    expect(ms.rounds[0]).toMatchObject({ winner: 1, reason: 'elimination' });
  });

  it('lasts 20 s at most and always has a winner: alive, then HP, then a coin', () => {
    for (const seed of [3, 4, 5, 6]) {
      const { ctx, world, ms } = setup('split-deck', '1v1', 1, seed);
      toOvertime(ms, world, ctx);
      const start = world.tick;
      if (seed === 3) player(world, 1).hp = 40;
      while (ms.rounds.length === 0 && world.tick - start < secs(30)) tick(ms, world, ctx, 1);
      expect(world.tick - start).toBe(secs(ctx.config.rules.skyOvertimeSec));
      expect(ms.rounds[0].reason).toBe('sky');
      expect(ms.rounds[0].winner).not.toBeNull();
      if (seed === 3) expect(ms.rounds[0].winner).toBe(1);
    }
    expect(defaultConfig().rules.skyOvertimeSec).toBe(20);
  });

  it('the Tower cannot be touched during the sky duel', () => {
    const { ctx, world, ms } = setup('kestrel', '1v1', 1);
    toOvertime(ms, world, ctx);
    const carrier = player(world, ms.controllers[0].carrier!);
    const tower = towerOf(ms, ctx, 1)!;
    carrier.pos = v3(tower.pos.x, tower.pos.y + 0.9, tower.pos.z);
    carrier.vel = v3();
    // (down in the ship is far below the arena: that's a fall, not a Tower touch)
    const events = tick(ms, world, ctx, 2);
    expect(events.some((e) => e.type === 'towerTouch')).toBe(false);
    expect(ms.rounds[0]).toMatchObject({ winner: 1, reason: 'elimination' });
    expect(carrier.alive).toBe(false);
  });

  it('the next round starts back in the ship as usual', () => {
    const { ctx, world, ms } = setup('split-deck', '2v2', 2);
    toOvertime(ms, world, ctx);
    const a = ctx.level.def.skyArena!;
    player(world, 1).pos = v3(a.center.x, a.center.y + 1, a.center.z + a.radius + 6);
    tick(ms, world, ctx, secs(ctx.config.rules.skyOvertimeSec) + 1);
    expect(ms.phase).toBe('roundEnd');
    tick(ms, world, ctx, secs(ctx.config.rules.resultsSec) + 1);
    expect(ms.round).toBe(2);
    expect(ms.phase).toBe('spawnLock');
    expect(ms.overtime).toBeNull();
    const d = ctx.level.def;
    for (const p of world.players) {
      expect(p.alive).toBe(true);
      expect(inSkyZone(d, p.pos)).toBe(false);
      expect(p.pos.y).toBeLessThan(d.boundsMax.y);
      expect(p.jetFuel).toBe(ctx.config.movement.jetpackFuelSec);
    }
  });

  it.each(MATCH_MAPS)('%s: bots fight up there instead of walking off the edge', (id) => {
    for (const [mode, n, seed] of [
      ['1v1', 1, 1],
      ['2v2', 2, 2],
      ['2v2', 2, 3],
      ['5v5', 5, 4],
    ] as const) {
      const { ctx, world, ms } = setup(id, mode, n, seed);
      const mems = world.players.map((p) =>
        createBotMemory(p.id, BOT_SKILLS.normal, seed * 31 + p.id),
      );
      const inputs = () => {
        applyBotObjectives(ms, world, ctx, mems);
        const out: Record<number, PlayerInput> = {};
        for (const mem of mems) out[mem.id] = botThink(world, ctx, player(world, mem.id), mem);
        return out;
      };
      toOvertime(ms, world, ctx);
      expect(ms.overtime?.kind).toBe('sky');
      const start = world.tick;
      const falls: number[] = [];
      while (ms.rounds.length === 0 && world.tick - start < secs(25)) {
        for (const e of tick(ms, world, ctx, 1, inputs))
          if (e.type === 'kill' && e.kind === 'world') falls.push(world.tick - start);
      }
      // nobody walks off in the first seconds; the round is decided within the 20 s
      expect(
        falls.every((t) => t > secs(5)),
        `${mode} falls at ${falls}`,
      ).toBe(true);
      expect(falls.length).toBeLessThanOrEqual(1);
      expect(ms.rounds[0].winner).not.toBeNull();
      expect(world.tick - start).toBeLessThanOrEqual(secs(20));
    }
  });
});
