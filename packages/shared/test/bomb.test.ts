import { describe, expect, it } from 'vitest';
import {
  Btn,
  v3,
  addPlayer,
  createPlayer,
  step,
  newBomb,
  updateBomb,
  siteAt,
  type BombState,
  type PlayerState,
  type SimEvent,
  type Vec3,
} from '../src/index';
import { flatLevel, makeSim, settle, type Sim } from './helpers';

// attacker (team 1, id 1) starts inside site A at the origin; defender (team 0, id 2) 12 m away
const setup = () => {
  const def = flatLevel();
  def.bombSites = [
    { name: 'A', min: v3(-5, 0, -5), max: v3(5, 3, 5) },
    { name: 'B', min: v3(40, 0, 40), max: v3(50, 3, 50) },
  ];
  const sim = makeSim(def);
  sim.p.team = 1;
  const d = addPlayer(sim.world, createPlayer(2, 0, v3(0, 0, -12), 0, sim.config));
  settle(sim);
  const bomb = newBomb(sim.world, 1);
  return { sim, d, bomb };
};

const secs = (s: number) => Math.round(s * 60);

/** One tick: step the sim with these held buttons, then the bomb. */
const tick = (
  sim: Sim,
  bomb: BombState,
  held: Record<number, number> = {},
  roundOver = false,
): { res: ReturnType<typeof updateBomb>; events: SimEvent[] } => {
  const inputs: Record<number, { tick: number; buttons: number; view: PlayerState['view'] }> = {};
  for (const p of sim.world.players)
    inputs[p.id] = { tick: sim.world.tick + 1, buttons: held[p.id] ?? 0, view: p.view };
  step(sim.world, inputs, sim.ctx);
  const res = updateBomb(bomb, sim.world, sim.ctx, 1, roundOver);
  return { res, events: [...sim.world.events] };
};

const run = (sim: Sim, bomb: BombState, n: number, held: Record<number, number> = {}) => {
  const events: SimEvent[] = [];
  let res: ReturnType<typeof updateBomb> = null;
  for (let i = 0; i < n && !res; i++) {
    const t = tick(sim, bomb, held);
    events.push(...t.events);
    res = t.res;
  }
  return { res, events };
};

const plant = (sim: Sim, bomb: BombState) =>
  run(sim, bomb, secs(sim.config.rules.bombPlantSec), { 1: Btn.Use });

const moveTo = (p: PlayerState, at: Vec3) => {
  p.pos = { ...at, y: p.pos.y };
  p.vel = v3();
};

describe('bomb mode', () => {
  it('the bomb starts with an attacker; sites are where they are', () => {
    const { sim, bomb } = setup();
    expect(bomb.carrier).toBe(1);
    expect(siteAt(sim.ctx.level.def.bombSites!, v3(0, 1, 0))).toBe('A');
    expect(siteAt(sim.ctx.level.def.bombSites!, v3(20, 1, 20))).toBe(null);
  });

  it(`planting takes exactly bombPlantSec of holding Use in a site; letting go resets it`, () => {
    const { sim, bomb } = setup();
    const need = secs(sim.config.rules.bombPlantSec);
    run(sim, bomb, need - 1, { 1: Btn.Use });
    expect(bomb.planted).toBeNull();
    // let go one tick short: progress is lost
    const cancel = tick(sim, bomb, {});
    expect(cancel.events.some((e) => e.type === 'plantCancel')).toBe(true);
    run(sim, bomb, need - 1, { 1: Btn.Use });
    expect(bomb.planted).toBeNull();
    const done = run(sim, bomb, 1, { 1: Btn.Use });
    expect(done.events.some((e) => e.type === 'bombPlanted')).toBe(true);
    expect(bomb.planted?.site).toBe('A');
  });

  it("can't plant outside a site", () => {
    const { sim, bomb } = setup();
    moveTo(sim.p, v3(20, 0, 20));
    run(sim, bomb, secs(5), { 1: Btn.Use });
    expect(bomb.planted).toBeNull();
  });

  it('the fuse: it goes off exactly bombFuseSec after the plant', () => {
    const { sim, bomb } = setup();
    plant(sim, bomb);
    const plantedAt = sim.world.tick;
    const fuse = secs(sim.config.rules.bombFuseSec);
    const r1 = run(sim, bomb, fuse - 1);
    expect(r1.res).toBeNull();
    const r2 = run(sim, bomb, 1);
    expect(r2.res).toEqual({ winner: 1, reason: 'exploded' });
    expect(sim.world.tick - plantedAt).toBe(fuse);
  });

  it('a full defuse (bombDefuseSec) before the fuse ends wins for the defenders', () => {
    const { sim, d, bomb } = setup();
    plant(sim, bomb);
    moveTo(d, bomb.pos);
    const r = run(sim, bomb, secs(sim.config.rules.bombDefuseSec), { 2: Btn.Use });
    expect(r.res).toEqual({ winner: 0, reason: 'defused' });
  });

  it('a defuse started with less than bombDefuseSec left is too late (the fuse wins ties)', () => {
    const { sim, d, bomb } = setup();
    plant(sim, bomb);
    const c = sim.config.rules;
    // wait until exactly bombDefuseSec is left: the defuse would finish on the explosion tick
    run(sim, bomb, secs(c.bombFuseSec) - secs(c.bombDefuseSec));
    moveTo(d, bomb.pos);
    const r = run(sim, bomb, secs(c.bombDefuseSec) + 1, { 2: Btn.Use });
    expect(r.res).toEqual({ winner: 1, reason: 'exploded' });
  });

  it('with one tick to spare, the defuse makes it', () => {
    const { sim, d, bomb } = setup();
    plant(sim, bomb);
    const c = sim.config.rules;
    moveTo(d, bomb.pos);
    run(sim, bomb, secs(c.bombFuseSec) - secs(c.bombDefuseSec) - 2);
    const r = run(sim, bomb, secs(c.bombDefuseSec) + 5, { 2: Btn.Use });
    expect(r.res).toEqual({ winner: 0, reason: 'defused' });
  });

  it('letting go or dying cancels the defuse and the progress starts over', () => {
    const { sim, d, bomb } = setup();
    plant(sim, bomb);
    moveTo(d, bomb.pos);
    const c = sim.config.rules;
    run(sim, bomb, secs(c.bombDefuseSec) - 5, { 2: Btn.Use });
    const t = tick(sim, bomb, {});
    expect(t.events.some((e) => e.type === 'defuseCancel')).toBe(true);
    expect(bomb.defuse).toBeNull();
    run(sim, bomb, secs(c.bombDefuseSec) - 5, { 2: Btn.Use });
    expect(bomb.defuse?.ticks).toBe(secs(c.bombDefuseSec) - 5);
    d.alive = false;
    tick(sim, bomb, { 2: Btn.Use });
    expect(bomb.defuse).toBeNull();
  });

  it('planting and defusing root you in place', () => {
    const { sim, d, bomb } = setup();
    run(sim, bomb, 30, { 1: Btn.Use | Btn.Forward });
    expect(Math.hypot(sim.p.vel.x, sim.p.vel.z)).toBeLessThan(0.1);
    run(sim, bomb, secs(3), { 1: Btn.Use });
    moveTo(d, bomb.pos);
    run(sim, bomb, 30, { 2: Btn.Use | Btn.Forward });
    expect(Math.hypot(d.vel.x, d.vel.z)).toBeLessThan(0.1);
  });

  it('time out with no plant: defenders win; a plant just before time out still gets the full fuse', () => {
    const a = setup();
    const t = tick(a.sim, a.bomb, {}, true);
    expect(t.res).toEqual({ winner: 0, reason: 'time' });

    const b = setup();
    plant(b.sim, b.bomb);
    const plantedAt = b.sim.world.tick;
    // the round timer "runs out" every tick from here on: it no longer matters
    let res: ReturnType<typeof updateBomb> = null;
    while (!res) res = tick(b.sim, b.bomb, {}, true).res;
    expect(res).toEqual({ winner: 1, reason: 'exploded' });
    expect(b.sim.world.tick - plantedAt).toBe(secs(b.sim.config.rules.bombFuseSec));
  });

  it('the carrier dies: the bomb drops; an attacker picks it up, a defender cannot', () => {
    const { sim, d, bomb } = setup();
    moveTo(sim.p, v3(20, 0, 20));
    tick(sim, bomb);
    sim.p.alive = false;
    const t = tick(sim, bomb);
    expect(t.events.some((e) => e.type === 'bombDrop')).toBe(true);
    expect(bomb.carrier).toBeNull();
    moveTo(d, bomb.pos);
    tick(sim, bomb);
    expect(bomb.carrier).toBeNull();
    const a2 = addPlayer(
      sim.world,
      createPlayer(3, 1, v3(bomb.pos.x, 0, bomb.pos.z), 0, sim.config),
    );
    a2.pos = { ...bomb.pos };
    tick(sim, bomb);
    expect(bomb.carrier).toBe(3);
  });

  it('the explosion kills within bombKillRadius and hurts out to bombDamageRadius', () => {
    const { sim, d, bomb } = setup();
    plant(sim, bomb);
    const c = sim.config.rules;
    const near = addPlayer(sim.world, createPlayer(4, 0, v3(0, 0, 0), 0, sim.config));
    moveTo(near, v3(bomb.pos.x + c.bombKillRadius - 1, 0, bomb.pos.z));
    moveTo(d, v3(bomb.pos.x, 0, bomb.pos.z + (c.bombKillRadius + c.bombDamageRadius) / 2));
    const far = addPlayer(sim.world, createPlayer(5, 0, v3(0, 0, 0), 0, sim.config));
    moveTo(far, v3(bomb.pos.x, 0, bomb.pos.z - c.bombDamageRadius - 2));
    run(sim, bomb, secs(c.bombFuseSec) + 1);
    expect(near.alive).toBe(false);
    expect(d.alive).toBe(true);
    expect(d.hp).toBeLessThan(100);
    expect(far.hp).toBe(100);
  });
});
