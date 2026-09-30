import { describe, expect, it } from 'vitest';
import { v3, fallDamage } from '../src/index';
import { flatLevel, makeSim, run, settle, type Sim } from './helpers';

// Fall damage and leaving the map (combat maps; races handle falls themselves).

/** Drop the player from `height` metres above the floor and let them land. */
const drop = (sim: Sim, height: number): void => {
  settle(sim);
  sim.p.pos = v3(0, sim.p.pos.y + height, 0);
  sim.p.vel = v3(0, 0, 0);
  sim.p.grounded = false;
  run(sim, 180);
};

describe('fall damage', () => {
  it('no damage for normal drops, more for bigger ones, a long fall kills', () => {
    const hp = (h: number) => {
      const sim = makeSim(flatLevel());
      drop(sim, h);
      return sim.p.alive ? sim.p.hp : 0;
    };
    const max = makeSim(flatLevel()).config.combat.maxHp;
    expect(hp(2)).toBe(max);
    expect(hp(7.5)).toBe(max);
    const mid = hp(14);
    expect(mid).toBeLessThan(max);
    expect(mid).toBeGreaterThan(0);
    expect(hp(18)).toBeLessThan(mid);
    expect(hp(26)).toBe(0);
  });

  it('the damage curve: free up to the safe height, certain death from the lethal one', () => {
    const sim = makeSim(flatLevel());
    const g = sim.config.movement.gravity;
    const c = sim.config.combat;
    const at = (h: number) => fallDamage(Math.sqrt(2 * g * h), sim.ctx);
    expect(at(c.fallSafeHeight - 0.1)).toBe(0);
    expect(at(c.fallSafeHeight + 2)).toBeGreaterThan(0);
    expect(at(c.fallLethalHeight)).toBeGreaterThanOrEqual(c.maxHp);
  });

  it('a launch pad flight never hurts on landing', () => {
    const sim = makeSim(
      flatLevel([], [], {
        launchPads: [{ min: v3(-1, 0, -1), max: v3(1, 2, 1), vel: v3(0, 30, 6) }],
      }),
      v3(0, 0, 0),
    );
    run(sim, 300); // thrown ~22 m up, lands well away from the pad
    expect(sim.p.alive).toBe(true);
    expect(sim.p.hp).toBe(sim.config.combat.maxHp);
  });
});

describe('leaving the map', () => {
  it('walking off the outside of the map (e.g. with gravity boots) kills you', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    sim.p.pos = v3(150, 5, 0); // outside the bounds (±100) and the 20 m margin
    run(sim, 2);
    expect(sim.p.alive).toBe(false);
  });

  it('inside the bounds nothing happens', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    sim.p.pos = v3(90, 0.9, 0);
    run(sim, 10);
    expect(sim.p.alive).toBe(true);
  });
});
