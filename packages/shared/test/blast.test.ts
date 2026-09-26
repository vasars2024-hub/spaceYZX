import { describe, expect, it } from 'vitest';
import {
  Btn,
  Phase,
  addPlayer,
  createPlayer,
  step,
  v3,
  type BoomerangState,
  type BoxDef,
  type PlayerInput,
  type PlayerState,
  type Quat,
  type SimEvent,
  type Vec3,
} from '../src';
import { flatLevel, makeSim, settle, view, type Sim } from './helpers';

// The explosive throw: every 6th Quick Throw explodes on the first wall or player it hits.

const tick = (sim: Sim, n = 1, v?: Quat): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    const inputs: Record<number, PlayerInput> = {};
    for (const p of sim.world.players)
      inputs[p.id] = { tick: sim.world.tick + 1, buttons: 0, view: p.id === 1 && v ? v : p.view };
    step(sim.world, inputs, sim.ctx);
    events.push(...sim.world.events);
  }
  return events;
};

const throwOnce = (sim: Sim, v = view(0)): SimEvent[] => {
  const ev: SimEvent[] = [];
  for (let i = 0; i < 5; i++) {
    const inputs: Record<number, PlayerInput> = {};
    for (const p of sim.world.players)
      inputs[p.id] = {
        tick: sim.world.tick + 1,
        buttons: p.id === 1 ? Btn.Fire : 0,
        view: p.id === 1 ? v : p.view,
      };
    step(sim.world, inputs, sim.ctx);
    ev.push(...sim.world.events);
  }
  ev.push(...tick(sim, 1, v));
  return ev;
};

const boomerangOf = (sim: Sim): BoomerangState => sim.world.boomerangs.find((b) => b.owner === 1)!;

/** Throw and wait until it's back in hand (or dropped). */
const throwAndWait = (sim: Sim, v = view(0)): SimEvent[] => {
  const ev = throwOnce(sim, v);
  for (let i = 0; i < 400; i++) {
    const b = boomerangOf(sim);
    if (b.phase === Phase.Held || b.phase === Phase.Dropped) break;
    ev.push(...tick(sim, 1, v));
  }
  return ev;
};

const other = (sim: Sim, id: number, team: 0 | 1, feet: Vec3): PlayerState =>
  addPlayer(sim.world, createPlayer(id, team, feet, 180, sim.config));

const still = (sim: Sim) => {
  sim.config.movement.runSpeed = 0;
  sim.config.movement.sprintSpeed = 0;
};

describe('explosive throw', () => {
  it('the 6th Quick Throw is explosive; one that hits nothing keeps its charge', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    still(sim);
    for (let k = 0; k < 5; k++) {
      throwOnce(sim);
      expect(boomerangOf(sim).explosive).toBe(false);
      throwAndWait(sim);
    }
    expect(sim.p.blastCount).toBe(5);
    const ev = throwAndWait(sim);
    expect(ev.some((e) => e.type === 'blast')).toBe(false);
    expect(boomerangOf(sim).phase).toBe(Phase.Held); // came back: nothing hit
    expect(sim.p.blastCount).toBe(5); // still charged
    throwOnce(sim);
    expect(boomerangOf(sim).explosive).toBe(true);
  });

  it('explodes on the first wall (no bounce) and hurts enemies near it, not teammates', () => {
    const wall: BoxDef = { c: v3(0, 2, -10), h: v3(5, 2, 0.5) };
    const sim = makeSim(flatLevel([wall]));
    settle(sim);
    still(sim);
    const foe = other(sim, 2, 1, v3(2.2, 0, -8));
    const mate = other(sim, 3, 0, v3(-2.2, 0, -8));
    settle(sim);
    sim.p.blastCount = 5;
    const ev = throwAndWait(sim);
    const blast = ev.find((e) => e.type === 'blast');
    expect(blast).toBeTruthy();
    expect(ev.some((e) => e.type === 'wallBounce')).toBe(false);
    expect(boomerangOf(sim).phase).toBe(Phase.Dropped);
    expect(foe.hp).toBe(sim.config.combat.maxHp - sim.config.combat.blastDamage);
    expect(mate.hp).toBe(sim.config.combat.maxHp);
    expect(sim.p.blastCount).toBe(0);
    const hit = ev.find((e) => e.type === 'hit' && e.victim === 2);
    expect(hit && hit.type === 'hit' && hit.kind).toBe('blast');
  });

  it('explodes on the first player it hits: the hit plus the blast', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    still(sim);
    const foe = other(sim, 2, 1, v3(0, 0, -8));
    settle(sim);
    sim.p.blastCount = 5;
    const ev = throwAndWait(sim, view(0, -3));
    const c = sim.config.combat;
    expect(ev.filter((e) => e.type === 'blast').length).toBe(1);
    const dmg = ev
      .filter((e) => e.type === 'hit' && e.victim === 2)
      .map((e) => e.type === 'hit' && e.kind);
    expect(dmg).toContain('blast');
    expect(foe.hp).toBeLessThanOrEqual(c.maxHp - c.quickBodyDamage - c.blastDamage);
    expect(sim.p.blastCount).toBe(0);
  });
});
