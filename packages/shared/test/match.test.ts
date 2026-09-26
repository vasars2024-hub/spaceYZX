import { describe, expect, it } from 'vitest';
import {
  buildLevel,
  createWorld,
  createPlayer,
  addPlayer,
  defaultConfig,
  step,
  mapDef,
  createMatch,
  startMatch,
  updateMatch,
  towerOf,
  sideOf,
  botObjectives,
  playerLeft,
  v3,
  TICK_DT,
  type MatchState,
  type SimContext,
  type WorldState,
  type RankedMode,
  type SimEvent,
  MODE_RULES,
  collapseRadius,
} from '../src/index';

const setup = (mode: RankedMode, perTeam: number, seed = 7) => {
  const config = defaultConfig();
  const ctx: SimContext = { level: buildLevel(mapDef('kestrel')), config, dt: TICK_DT };
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

describe('match rules', () => {
  it('spawn lock freezes everyone at distinct random spawns, then goes live', () => {
    const { ctx, world, ms } = setup('2v2', 2);
    startMatch(ms, world, ctx);
    expect(ms.phase).toBe('spawnLock');
    expect(world.players.every((p) => p.frozen)).toBe(true);
    const keys = world.players.map((p) => `${p.pos.x.toFixed(2)},${p.pos.z.toFixed(2)}`);
    expect(new Set(keys).size).toBe(keys.length);
    // team 0 spawns on the -X side, team 1 on +X
    for (const p of world.players) expect(Math.sign(p.pos.x)).toBe(p.team === 0 ? -1 : 1);
    const before = world.players.map((p) => ({ ...p.pos }));
    tick(ms, world, ctx, secs(5) - 2);
    expect(ms.phase).toBe('spawnLock');
    world.players.forEach((p, i) => expect(Math.abs(p.pos.x - before[i].x)).toBeLessThan(0.01));
    tick(ms, world, ctx, 3);
    expect(ms.phase).toBe('live');
    expect(world.players.every((p) => !p.frozen)).toBe(true);
  });

  it('1v1: each player carries their own Controller; teams rotate the carrier', () => {
    const a = setup('1v1', 1);
    startMatch(a.ms, a.world, a.ctx);
    expect(a.ms.controllers[0].carrier).toBe(1);
    expect(a.ms.controllers[1].carrier).toBe(2);
    const b = setup('2v2', 2);
    startMatch(b.ms, b.world, b.ctx);
    const first = b.ms.controllers[0].carrier;
    tick(b.ms, b.world, b.ctx, secs(5) + 1);
    kill(b.world, 3, 1);
    kill(b.world, 4, 1);
    tick(b.ms, b.world, b.ctx, secs(5) + 2);
    expect(b.ms.round).toBe(2);
    expect(b.ms.controllers[0].carrier).not.toBe(first);
  });

  it('touching the enemy Tower with the Controller wins the round', () => {
    const { ctx, world, ms } = setup('1v1', 1);
    startMatch(ms, world, ctx);
    tick(ms, world, ctx, secs(5) + 1);
    const carrier = world.players.find((p) => p.id === ms.controllers[0].carrier)!;
    const tower = towerOf(ms, ctx, 1)!;
    expect(tower.pos.x).toBeGreaterThan(0);
    carrier.pos = v3(tower.pos.x - 3, 0.9, 0);
    carrier.vel = v3();
    tick(ms, world, ctx, 1);
    expect(ms.phase).toBe('roundEnd');
    expect(ms.scores).toEqual([1, 0]);
    expect(ms.rounds[0].reason).toBe('tower');
  });

  it('a non-carrier at the Tower does nothing; eliminating the team wins', () => {
    const { ctx, world, ms } = setup('2v2', 2);
    startMatch(ms, world, ctx);
    tick(ms, world, ctx, secs(5) + 1);
    const nonCarrier = world.players.find(
      (p) => p.team === 0 && p.id !== ms.controllers[0].carrier,
    )!;
    const tower = towerOf(ms, ctx, 1)!;
    nonCarrier.pos = v3(tower.pos.x - 3, 0.9, 0);
    tick(ms, world, ctx, 1);
    expect(ms.phase).toBe('live');
    kill(world, 3, 1);
    tick(ms, world, ctx, 1);
    expect(ms.phase).toBe('live');
    kill(world, 4, 2);
    tick(ms, world, ctx, 1);
    expect(ms.phase).toBe('roundEnd');
    expect(ms.rounds[0]).toMatchObject({ winner: 0, reason: 'elimination' });
  });

  it('Controller drops on death, a teammate picks it up after 0.5 s, else it returns home', () => {
    const { ctx, world, ms } = setup('2v2', 2);
    startMatch(ms, world, ctx);
    tick(ms, world, ctx, secs(5) + 1);
    const c = ms.controllers[0];
    const carrierId = c.carrier!;
    const mate = world.players.find((p) => p.team === 0 && p.id !== carrierId)!;
    kill(world, carrierId, 3);
    tick(ms, world, ctx, 1);
    expect(c.carrier).toBeNull();
    expect(c.droppedAt).not.toBeNull();
    // teammate stands on it: picked up after 0.5 s
    mate.pos = { ...c.droppedAt! };
    mate.vel = v3();
    const dropPos = { ...c.droppedAt! };
    for (let i = 0; i < secs(0.5) + 2 && c.carrier === null; i++) {
      mate.pos = { ...dropPos };
      mate.vel = v3();
      tick(ms, world, ctx, 1);
    }
    expect(c.carrier).toBe(mate.id);
    // now it drops again and nobody touches it: returns home after 8 s
    kill(world, mate.id, 3);
    tick(ms, world, ctx, 1);
    expect(ms.phase).toBe('roundEnd'); // team 0 eliminated
  });

  it('dropped Controller returns home after 8 s untouched', () => {
    const { ctx, world, ms } = setup('2v2', 2);
    startMatch(ms, world, ctx);
    tick(ms, world, ctx, secs(5) + 1);
    const c = ms.controllers[0];
    const carrier = world.players.find((p) => p.id === c.carrier)!;
    carrier.pos = v3(-20, 0.9, 0);
    kill(world, carrier.id, 3);
    tick(ms, world, ctx, 1);
    expect(c.droppedAt!.x).toBeCloseTo(-20, 0);
    // keep the teammate far away
    const mate = world.players.find((p) => p.team === 0 && p.alive)!;
    mate.pos = v3(-80, 0.9, 30);
    let returns = 0;
    const run = (n: number) => {
      for (let i = 0; i < n; i++) {
        tick(ms, world, ctx, 1);
        returns += world.events.filter((e) => e.type === 'controllerReturn').length;
      }
    };
    run(secs(8) + 1);
    expect(c.droppedAt!.x).toBeLessThan(-70); // back at the team's home
    expect(returns).toBe(1);
    // it waits there for a teammate, without "returning" again every 8 s
    const home = { ...c.droppedAt! };
    run(secs(20));
    expect(returns).toBe(1);
    expect(c.droppedAt).toEqual(home);
  });

  // move a player to (x, z) on the floor of the map middle's height, standing still
  const place = (world: WorldState, id: number, at: { x: number; y: number; z: number }) => {
    const p = world.players.find((q) => q.id === id)!;
    p.pos = { x: at.x, y: p.pos.y, z: at.z };
    p.vel = { x: 0, y: 0, z: 0 };
  };

  // (these three force the collapse: the sky duel roll is tested in sky-overtime.test.ts)
  it('time out starts the collapse: the Tower switches off, the zone shrinks to the middle', () => {
    const { ctx, world, ms } = setup('2v2', 2);
    ctx.config.rules.skyOvertimeChance = 0;
    startMatch(ms, world, ctx);
    tick(ms, world, ctx, secs(5) + 1);
    tick(ms, world, ctx, secs(MODE_RULES['2v2'].roundSec));
    expect(ms.overtime).not.toBeNull();
    expect(ms.phase).toBe('live'); // no round result from the timer itself
    const ot = ms.overtime!;
    const r0 = collapseRadius(ot, world.tick, ctx);
    tick(ms, world, ctx, secs(10));
    expect(collapseRadius(ot, world.tick, ctx)).toBeLessThan(r0);
    tick(ms, world, ctx, secs(ctx.config.rules.collapseShrinkSec));
    expect(collapseRadius(ot, world.tick, ctx)).toBeCloseTo(ctx.config.rules.collapseMinRadius, 6);
  });

  it('outside the zone for 3 s kills you; the team left in the middle wins', () => {
    const { ctx, world, ms } = setup('2v2', 2);
    ctx.config.rules.skyOvertimeChance = 0;
    startMatch(ms, world, ctx);
    tick(ms, world, ctx, secs(5) + 1);
    tick(ms, world, ctx, secs(MODE_RULES['2v2'].roundSec));
    const mid = ms.overtime!.center;
    // team 0 (ids 1, 2) goes to the middle; team 1 stays at its spawn
    place(world, 1, mid);
    place(world, 2, mid);
    for (let i = 0; i < secs(ctx.config.rules.collapseMaxSec) && ms.rounds.length === 0; i++)
      tick(ms, world, ctx, 1);
    expect(ms.rounds[0]).toMatchObject({ winner: 0, reason: 'elimination' });
    expect(world.players.filter((p) => p.team === 1).every((p) => !p.alive)).toBe(true);
    expect(world.players.filter((p) => p.team === 0).every((p) => p.alive)).toBe(true);
  });

  it('never a draw: when overtime runs out, alive players, then HP decide', () => {
    const { ctx, world, ms } = setup('1v1', 1);
    ctx.config.rules.skyOvertimeChance = 0;
    startMatch(ms, world, ctx);
    tick(ms, world, ctx, secs(5) + 1);
    tick(ms, world, ctx, secs(MODE_RULES['1v1'].roundSec));
    const mid = ms.overtime!.center;
    place(world, 1, mid);
    place(world, 2, mid);
    world.players.find((p) => p.id === 1)!.hp = 40;
    tick(ms, world, ctx, secs(ctx.config.rules.collapseMaxSec) + 1);
    expect(ms.rounds[0]).toMatchObject({ winner: 1, reason: 'collapse' });
    // every round in these tests has a winner
    expect(ms.rounds.every((r) => r.winner !== null)).toBe(true);
  });

  it('first to N ends the match; sides swap at half; no sudden death (max rounds is odd)', () => {
    const { ctx, world, ms } = setup('1v1', 1);
    startMatch(ms, world, ctx);
    // alternate wins: 1v1 is first to 5, max 9 → 4-4 → round 9 decides it
    for (let r = 0; r < 8; r++) {
      tick(ms, world, ctx, secs(5) + 1);
      expect(ms.phase).toBe('live');
      if (r === 4) expect(ms.sideSwapped).toBe(true);
      if (r === 3) expect(ms.sideSwapped).toBe(false);
      const loser = r % 2 === 0 ? 2 : 1;
      kill(world, loser, loser === 1 ? 2 : 1);
      tick(ms, world, ctx, 1);
      expect(ms.phase).toBe('roundEnd');
      tick(ms, world, ctx, secs(5));
    }
    expect(ms.scores).toEqual([4, 4]);
    expect(ms.suddenDeath).toBe(false);
    expect(ms.round).toBe(9);
    tick(ms, world, ctx, secs(5) + 1);
    // a normal full-length round (1v1 never reveals anyone)
    expect(ms.roundEnds - ms.roundStart).toBe(secs(MODE_RULES['1v1'].roundSec));
    tick(ms, world, ctx, 1);
    expect(ms.revealed.length).toBe(0);
    // side swapped: team 0 now spawns on +X
    expect(sideOf(ms, 0)).toBe(1);
    expect(world.players.find((p) => p.team === 0)!.pos.x).toBeGreaterThan(0);
    kill(world, 1, 2);
    tick(ms, world, ctx, 1);
    tick(ms, world, ctx, secs(5));
    expect(ms.phase).toBe('matchEnd');
    expect(ms.winner).toBe(1);
  });

  it('first to 5 wins early', () => {
    const { ctx, world, ms } = setup('1v1', 1);
    startMatch(ms, world, ctx);
    for (let r = 0; r < 5; r++) {
      tick(ms, world, ctx, secs(5) + 1);
      kill(world, 2, 1);
      tick(ms, world, ctx, 1 + secs(5));
    }
    expect(ms.phase).toBe('matchEnd');
    expect(ms.winner).toBe(0);
    expect(ms.endReason).toContain('first to 5');
  });

  it('team modes always reveal the carriers', () => {
    const { ctx, world, ms } = setup('2v2', 2);
    startMatch(ms, world, ctx);
    tick(ms, world, ctx, secs(5) + 1);
    for (let i = 0; i < secs(6); i++) {
      tick(ms, world, ctx, 1);
      expect(ms.revealed.length).toBe(2);
    }
  });

  it('1v1 never reveals the opponent', () => {
    const { ctx, world, ms } = setup('1v1', 1);
    startMatch(ms, world, ctx);
    for (let i = 0; i < secs(40); i++) {
      tick(ms, world, ctx, 1);
      expect(ms.revealed.length).toBe(0);
    }
  });

  it('carrier reveal pulses 1 s every 5 s when not always on; everyone in the last 20 s', () => {
    const { ctx, world, ms } = setup('2v2', 2);
    ctx.config.rules.carrierAlwaysRevealed = 0;
    startMatch(ms, world, ctx);
    tick(ms, world, ctx, secs(5) + 1);
    const seen: boolean[] = [];
    for (let i = 0; i < secs(12); i++) {
      tick(ms, world, ctx, 1);
      seen.push(ms.revealed.length > 0);
    }
    const on = seen.filter(Boolean).length;
    expect(on).toBeGreaterThanOrEqual(secs(2) - 2);
    expect(on).toBeLessThanOrEqual(secs(2) + 2);
    tick(ms, world, ctx, secs(MODE_RULES['2v2'].roundSec - 18 - 5));
    expect(ms.revealed.length).toBe(4);
  });

  it('never runs past the 15-minute hard cap', () => {
    const { ctx, world, ms } = setup('1v1', 1);
    ctx.config.rules.hardCapMin = 1;
    startMatch(ms, world, ctx);
    tick(ms, world, ctx, secs(61));
    expect(ms.phase).toBe('matchEnd');
    expect(ms.endReason).toBe('time limit');
  });

  it('a carrier leaving drops the Controller; bots get objectives', () => {
    const { ctx, world, ms } = setup('2v2', 2);
    startMatch(ms, world, ctx);
    tick(ms, world, ctx, secs(5) + 1);
    const obj = botObjectives(ms, world, ctx);
    const carrier = ms.controllers[0].carrier!;
    expect(obj[carrier]!.x).toBeGreaterThan(60); // heads for the enemy Tower
    playerLeft(ms, world, carrier);
    expect(ms.controllers[0].carrier).toBeNull();
    expect(ms.controllers[0].droppedAt).not.toBeNull();
  });
});
