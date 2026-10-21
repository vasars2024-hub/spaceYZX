import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  createPlayer,
  csConfig,
  hashWorld,
  step,
  stepPredict,
  v3,
  type SimEvent,
  type Vec3,
} from '../src/index';
import { flatLevel, makeSim, settle, type Sim } from './helpers';

// Head landings (sim/stomp.ts): coming down onto another player's head.

/**
 * Player 1 (team 0, facing -Z) drops from `height` metres above the floor at `at`, onto player 2
 * (team `team2`) standing at the origin.
 */
const setup = (team2: 0 | 1, opts: { cs?: boolean; at?: Vec3; height?: number } = {}): Sim => {
  const sim = makeSim(flatLevel());
  if (opts.cs) sim.ctx.config = csConfig(sim.config);
  sim.config = sim.ctx.config;
  addPlayer(sim.world, createPlayer(2, team2, v3(0, 0, 0), 0, sim.config));
  settle(sim);
  const at = opts.at ?? v3(0.1, 0, 0);
  const h = opts.height ?? 4;
  sim.p.pos = v3(at.x, h + sim.config.movement.standHeight / 2, at.z);
  sim.p.vel = v3(0, 0, 0);
  sim.p.grounded = false;
  return sim;
};

const other = (sim: Sim) => sim.world.players.find((q) => q.id === 2)!;

/** Run `n` ticks (nobody pressing anything); returns all events seen. */
const runAll = (sim: Sim, n: number): SimEvent[] => {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    const inputs: Record<number, { tick: number; buttons: number; view: typeof sim.p.view }> = {};
    for (const q of sim.world.players)
      inputs[q.id] = { tick: sim.world.tick + 1, buttons: 0, view: q.view };
    step(sim.world, inputs, sim.ctx);
    out.push(...sim.world.events);
  }
  return out;
};

/** Run until player 1's first stomp; returns that event and player 1's velocity right after. */
const untilStomp = (sim: Sim, max = 120) => {
  for (let i = 0; i < max; i++) {
    const inputs: Record<number, { tick: number; buttons: number; view: typeof sim.p.view }> = {};
    for (const q of sim.world.players)
      inputs[q.id] = { tick: sim.world.tick + 1, buttons: 0, view: q.view };
    step(sim.world, inputs, sim.ctx);
    const e = sim.world.events.find((x) => x.type === 'stomp');
    if (e && e.type === 'stomp') return { e, vel: { ...sim.p.vel }, events: [...sim.world.events] };
  }
  return null;
};

describe('head landing (stomp)', () => {
  it('Boomerang modes: a teammate head launches you forward the way you look, nobody hurt', () => {
    const sim = setup(0);
    const s = untilStomp(sim);
    expect(s).not.toBeNull();
    expect(s!.e.kind).toBe('boost');
    expect(s!.e.target).toBe(2);
    const m = sim.config.movement;
    // facing -Z: thrown along -Z at the boost speed, and up
    expect(s!.vel.z).toBeCloseTo(-m.stompTeamForward, 5);
    expect(Math.abs(s!.vel.x)).toBeLessThan(1e-6);
    expect(s!.vel.y).toBeCloseTo(m.stompTeamUp, 5);
    // flies well forward before landing, and nobody loses health
    const z0 = sim.p.pos.z;
    runAll(sim, 120);
    expect(sim.p.grounded).toBe(true);
    expect(z0 - sim.p.pos.z).toBeGreaterThan(9);
    expect(sim.p.hp).toBe(sim.config.combat.maxHp);
    expect(other(sim).hp).toBe(sim.config.combat.maxHp);
    expect(other(sim).alive).toBe(true);
  });

  it('Boomerang modes: an enemy head kills them on the spot (a stomp kill) and you bounce', () => {
    const sim = setup(1);
    const s = untilStomp(sim);
    expect(s).not.toBeNull();
    expect(s!.e.kind).toBe('kill');
    const kill = s!.events.find((x) => x.type === 'kill');
    expect(kill).toMatchObject({ type: 'kill', attacker: 1, victim: 2, kind: 'stomp' });
    expect(other(sim).alive).toBe(false);
    expect(sim.p.kills).toBe(1);
    expect(s!.vel.y).toBeCloseTo(sim.config.movement.stompKillBounce, 5);
    runAll(sim, 120);
    expect(sim.p.hp).toBe(sim.config.combat.maxHp);
  });

  it('CS modes: a teammate or an enemy head throws you straight up, never a kill', () => {
    for (const team of [0, 1] as const) {
      const sim = setup(team, { cs: true });
      const s = untilStomp(sim);
      expect(s).not.toBeNull();
      expect(s!.e.kind).toBe('up');
      expect(s!.vel.y).toBeCloseTo(sim.config.movement.stompCsUp, 5);
      expect(Math.hypot(s!.vel.x, s!.vel.z)).toBeLessThan(1e-6);
      expect(s!.events.some((x) => x.type === 'kill' || x.type === 'hit')).toBe(false);
      // high enough for a boost spot: feet ~2 m over their head at the top
      let top = 0;
      for (let i = 0; i < 60; i++) {
        runAll(sim, 1);
        top = Math.max(top, sim.p.pos.y - sim.config.movement.standHeight / 2);
      }
      expect(top).toBeGreaterThan(3.5);
      expect(other(sim).alive).toBe(true);
      expect(other(sim).hp).toBe(sim.config.combat.maxHp);
      expect(sim.p.hp).toBe(sim.config.combat.maxHp);
    }
  });

  it('a head landing never causes fall damage, even from a deadly height', () => {
    // 16 m over the floor would hurt badly on the floor (fallSafeHeight 8)
    for (const cs of [false, true]) {
      const sim = setup(0, { cs, height: 16 });
      const s = untilStomp(sim, 200);
      expect(s).not.toBeNull();
      runAll(sim, 240);
      expect(sim.p.alive).toBe(true);
      expect(sim.p.hp).toBe(sim.config.combat.maxHp);
    }
    // control: the same drop beside them does hurt
    const miss = setup(0, { at: v3(3, 0, 0), height: 16 });
    const ev = runAll(miss, 240);
    expect(ev.some((x) => x.type === 'stomp')).toBe(false);
    expect(miss.p.hp).toBeLessThan(miss.config.combat.maxHp);
  });

  it('sideways bumps, walking through someone or a drop beside them never count', () => {
    // dropping next to them, bodies overlapping sideways (0.7 m apart: radius 0.4 each)
    const beside = setup(1, { at: v3(0.7, 0, 0) });
    expect(runAll(beside, 120).some((x) => x.type === 'stomp')).toBe(false);
    expect(other(beside).alive).toBe(true);
    // standing inside the same spot on the floor
    const sim = makeSim(flatLevel());
    addPlayer(sim.world, createPlayer(2, 1, v3(0.2, 0, 0), 0, sim.config));
    expect(runAll(sim, 60).some((x) => x.type === 'stomp')).toBe(false);
    // moving sideways through their head height without falling (a level flight)
    const fly = setup(1, { at: v3(-3, 0, 0), height: 1.7 });
    fly.ctx.config.movement.gravity = 0;
    fly.p.vel = v3(8, 0, 0);
    expect(runAll(fly, 60).some((x) => x.type === 'stomp')).toBe(false);
    expect(other(fly).alive).toBe(true);
  });

  it('the same pair cannot stomp again during the cooldown', () => {
    const sim = setup(0, { cs: true });
    const s = untilStomp(sim);
    expect(s).not.toBeNull();
    expect(sim.p.stompOn).toBe(2);
    expect(sim.p.stompCd).toBeGreaterThan(0);
    // dropped straight back onto them at once: no second stomp while it lasts
    const dropBack = () => {
      sim.p.pos = v3(0.1, 2.1 + sim.config.movement.standHeight / 2, 0);
      sim.p.vel = v3(0, -6, 0);
      return runAll(sim, 5).some((x) => x.type === 'stomp');
    };
    expect(dropBack()).toBe(false);
    // control: once it has run out, the same drop counts again
    sim.p.stompCd = 0;
    expect(dropBack()).toBe(true);
  });

  it('is deterministic', () => {
    const go = () => {
      const sim = setup(1);
      runAll(sim, 150);
      return hashWorld(sim.world);
    };
    expect(go()).toBe(go());
  });

  it('client prediction bounces you the same way but never kills (the server decides)', () => {
    const server = setup(1);
    const client = setup(1);
    const ss = untilStomp(server);
    expect(ss).not.toBeNull();
    let predicted: SimEvent | undefined;
    for (let i = 0; i < 120 && !predicted; i++) {
      stepPredict(
        client.world,
        1,
        { tick: client.world.tick + 1, buttons: 0, view: client.p.view },
        client.ctx,
      );
      predicted = client.world.events.find((x) => x.type === 'stomp');
    }
    expect(predicted).toMatchObject({ type: 'stomp', kind: 'kill', target: 2 });
    expect(client.p.vel).toEqual(ss!.vel);
    expect(other(client).alive).toBe(true);
  });
});
