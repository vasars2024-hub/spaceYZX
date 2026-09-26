import { describe, expect, it } from 'vitest';
import {
  Btn,
  Phase,
  respawnPlayer,
  eyePos,
  hitboxOf,
  chestOf,
  sub,
  normalize,
  cross,
  qFromBasis,
  v3,
  buildLevel,
  createWorld,
  createPlayer,
  addPlayer,
  defaultConfig,
  mapDef,
  TICK_DT,
  type Vec3,
} from '@space-yz/shared';
import { Room } from '../src/game/room';
import type { Conn } from '../src/game/conn';
import { LagHistory } from '../src/game/lagcomp';
import { TeamVision } from '../src/game/visibility';
import { flatLevel } from '../../shared/test/helpers';
import { GameHub } from '../src/game/hub';

const fakeConn = (rttMs = 0) => {
  const sent: unknown[] = [];
  const c = {
    rttMs,
    sent,
    sendBinary: () => {},
    sendJson: (m: unknown) => sent.push(m),
  };
  return c as unknown as Conn & { sent: unknown[] };
};

const lookAt = (from: Vec3, to: Vec3) => {
  const f = normalize(sub(to, from));
  const right = normalize(cross(f, v3(0, 1, 0)));
  return qFromBasis(f, cross(right, f));
};

/**
 * A lagged shooter fires the Laser at a target standing at A. The target teleports to B
 * `moveBeforeFire` ticks before the Laser goes off. The shooter's inputs say it sees the world
 * `viewLag` ticks in the past.
 */
const laserDuel = (opts: { lagComp: boolean; viewLag: number; moveBeforeFire: number }) => {
  const room = new Room({
    code: 'LAG',
    mode: 'practice',
    map: 'training-bay',
    lagComp: opts.lagComp,
    seed: 1,
  });
  const shooter = room.addMember('Shooter', fakeConn(), { team: 0 });
  const target = room.addMember('Target', fakeConn(), { team: 1 });
  const w = room.world;
  const ps = w.players.find((p) => p.id === shooter.id)!;
  const pt = w.players.find((p) => p.id === target.id)!;
  respawnPlayer(w, ps, v3(-12, 0, 15), 0, room.ctx.config);
  respawnPlayer(w, pt, v3(-12, 0, -15), 180, room.ctx.config);
  // Boomerang away so LMB fires the Laser
  const b = w.boomerangs.find((x) => x.owner === ps.id)!;
  b.phase = Phase.Dropped;
  b.pos = v3(-20, 0.2, 20);
  const aim = chestOf(hitboxOf(pt, room.ctx.config));
  const warn = Math.round(room.ctx.config.combat.laserWarnSec / TICK_DT);
  const press = 30;
  // the press is applied on tick start+press+1; the Laser fires `warn` ticks later
  const fireAt = w.tick + press + 1 + warn;
  const send = (buttons: number) => {
    const view = lookAt(eyePos(ps, room.ctx.config.movement), aim);
    room.receiveInputs(shooter.id, 0, [{ tick: w.tick + 1, buttons, view, viewLag: opts.viewLag }]);
  };
  for (let i = 0; i < press + warn + 10; i++) {
    send(i === press ? Btn.Fire : 0);
    room.tick();
    if (w.tick === fireAt - opts.moveBeforeFire) {
      pt.pos = { ...pt.pos, x: pt.pos.x + 2.5 };
    }
  }
  return { hp: pt.hp, room };
};

describe('lag compensation', () => {
  it('history interpolates hitboxes between ticks and clamps the rewind', () => {
    const config = defaultConfig();
    const ctx = { level: buildLevel(mapDef('training-bay')), config, dt: TICK_DT };
    const world = createWorld(ctx.level, 1);
    const p = addPlayer(world, createPlayer(1, 0, v3(0, 0, 0), 0, config));
    const h = new LagHistory();
    for (let t = 1; t <= 30; t++) {
      world.tick = t;
      p.pos = v3(t, 0.9, 0);
      h.record(world, config);
    }
    expect(h.hitboxesAt(20.5)![0].head.x).toBeCloseTo(20.5, 5);
    // 350 ms of history: the oldest ticks are gone
    expect(h.hitboxesAt(5)![0].head.x).toBeGreaterThan(8);
    // 175 ms latency + 100 ms interpolation + 50 ms input lead allowance = 19.5 ticks
    expect(h.clampTick(0, 30)).toBeCloseTo(10.5, 5);
    expect(h.clampTick(25, 30)).toBe(25);
  });

  it('a Laser at a standing target hits (sanity)', () => {
    expect(laserDuel({ lagComp: false, viewLag: 0, moveBeforeFire: -99 }).hp).toBeLessThan(100);
  });

  it('a lagged Laser hits where the shooter saw the target', () => {
    expect(laserDuel({ lagComp: true, viewLag: 6, moveBeforeFire: 3 }).hp).toBeLessThan(100);
  });

  it('without lag compensation the same shot misses', () => {
    expect(laserDuel({ lagComp: false, viewLag: 6, moveBeforeFire: 3 }).hp).toBe(100);
  });

  it('never rewinds more than 175 ms of latency (+ interpolation and input lead)', () => {
    // shooter claims to see 30 ticks (500 ms) in the past: only 19.5 ticks are honoured
    expect(laserDuel({ lagComp: true, viewLag: 30, moveBeforeFire: 3 }).hp).toBeLessThan(100);
    expect(laserDuel({ lagComp: true, viewLag: 30, moveBeforeFire: 18 }).hp).toBeLessThan(100);
    expect(laserDuel({ lagComp: true, viewLag: 30, moveBeforeFire: 22 }).hp).toBe(100);
  });
});

describe('line-of-sight culling', () => {
  it('hides enemies behind walls from the whole team, shows revealed ones', () => {
    const config = defaultConfig();
    const ctx = { level: buildLevel(mapDef('kestrel')), config, dt: TICK_DT };
    const world = createWorld(ctx.level, 1);
    // A in the reactor room (mid), E in the orange hangar
    const a = addPlayer(world, createPlayer(1, 0, v3(-15, 0, -9), -90, config));
    const e = addPlayer(world, createPlayer(2, 1, v3(80, 0, 30), 90, config));
    const vis = new TeamVision();
    world.tick = 3;
    vis.updateAll(world, ctx, []);
    expect(vis.visible(0, e.id, 1, world.tick)).toBe(false);
    expect(vis.visible(1, a.id, 0, world.tick)).toBe(false);
    expect(vis.visible(0, a.id, 0, world.tick)).toBe(true); // teammates always
    // revealed: always sent
    world.tick = 6;
    vis.updateAll(world, ctx, [e.id]);
    expect(vis.visible(0, e.id, 1, world.tick)).toBe(true);
    // in the open reactor room, in line: visible
    e.pos = v3(15, 0.9, -9);
    world.tick = 30;
    vis.updateAll(world, ctx, []);
    expect(vis.visible(0, e.id, 1, world.tick)).toBe(true);
    // gone again behind walls: stays visible briefly (sticky), then hidden
    e.pos = v3(80, 0.9, 30);
    world.tick = 33;
    vis.updateAll(world, ctx, []);
    expect(vis.visible(0, e.id, 1, world.tick)).toBe(true);
    world.tick = 60;
    vis.updateAll(world, ctx, []);
    expect(vis.visible(0, e.id, 1, world.tick)).toBe(false);
  });
});

describe('line-of-sight culling: partly covered enemies', () => {
  // A wall ends at x = 0 (it covers x < 0), 10 m in front of the viewer. An enemy 20 m away
  // stands just behind its edge: the middle of their body is hidden, a shoulder sticks out.
  const setup = (enemyX: number) => {
    const config = defaultConfig();
    const def = flatLevel([{ c: v3(-10, 2, -10), h: v3(10, 2, 0.5) }]);
    const ctx = { level: buildLevel(def), config, dt: TICK_DT };
    const world = createWorld(ctx.level, 1);
    addPlayer(world, createPlayer(1, 0, v3(0, 0, 0), 0, config));
    const e = addPlayer(world, createPlayer(2, 1, v3(enemyX, 0, -20), 180, config));
    const vis = new TeamVision();
    world.tick = 8;
    vis.updateAll(world, ctx, []);
    return { vis, e, world };
  };

  it('sends an enemy whose shoulder shows past a wall edge (holding an angle)', () => {
    const { vis, e, world } = setup(-0.15);
    expect(vis.visible(0, e.id, 1, world.tick)).toBe(true);
  });

  it('sends an enemy you are about to peek (you are a step behind the corner)', () => {
    // viewer 0.4 m behind the wall's edge; the enemy stands 1 m past it, far away
    const config = defaultConfig();
    const def = flatLevel([{ c: v3(-10, 2, -10), h: v3(10, 2, 0.5) }]);
    const ctx = { level: buildLevel(def), config, dt: TICK_DT };
    const world = createWorld(ctx.level, 1);
    addPlayer(world, createPlayer(1, 0, v3(-0.4, 0, -8.5), 0, config));
    const e = addPlayer(world, createPlayer(2, 1, v3(-1.5, 0, -30), 180, config));
    const vis = new TeamVision();
    world.tick = 8;
    vis.updateAll(world, ctx, []);
    expect(vis.visible(0, e.id, 1, world.tick)).toBe(true);
  });

  it('still hides an enemy fully behind the wall', () => {
    const { vis, e, world } = setup(-2);
    expect(vis.visible(0, e.id, 1, world.tick)).toBe(false);
  });
});

describe('ping equalization', () => {
  it('gives low-ping players up to 30 ms of input delay, with hysteresis', () => {
    const hub = new GameHub({ log: () => {} });
    const room = hub.createRoom({ mode: 'practice', map: 'training-bay' })!;
    const fast = room.addMember('Fast', fakeConn(20));
    const slow = room.addMember('Slow', fakeConn(140));
    hub.equalize(room);
    hub.equalize(room);
    expect(fast.equalizeTicks).toBe(0);
    hub.equalize(room);
    expect(fast.equalizeTicks).toBe(1); // 30 ms cap → one 16.7 ms tick
    expect(slow.equalizeTicks).toBe(0);
    expect((fast.conn as unknown as { sent: unknown[] }).sent).toContainEqual({
      t: 'netcfg',
      inputDelay: 1,
    });
    hub.close();
  });
});
