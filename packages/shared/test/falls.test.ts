import { describe, expect, it } from 'vitest';
import { v3, fallDamage, type SimEvent } from '../src/index';
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

describe('launch pad flights never hurt', () => {
  const full = (sim: Sim) => sim.p.alive && sim.p.hp === sim.config.combat.maxHp;
  /** Run until the player has landed (a 'land' event) at a height below `belowY`. */
  const runUntilLanded = (sim: Sim, belowY: number, max = 600): SimEvent[] => {
    const all: SimEvent[] = [];
    for (let i = 0; i < max; i++) {
      run(sim, 1);
      all.push(...sim.world.events);
      const flown = i > 10 && all.some((e) => e.type === 'launch');
      if (flown && sim.world.events.some((e) => e.type === 'land') && sim.p.pos.y < belowY) break;
    }
    run(sim, 30);
    return all;
  };

  it('not after brushing a high ledge on the way and falling off it', () => {
    // thrown onto a 1.6 m deep ledge 12 m up, you slide off its far side and drop to the floor:
    // that one-tick touch used to end the flight, so the drop hurt
    const sim = makeSim(
      flatLevel([{ c: v3(0, 11.5, -22.8), h: v3(3, 0.5, 0.8) }], [], {
        launchPads: [{ min: v3(-1, 0, -1), max: v3(1, 2, 1), vel: v3(0, 25, -12) }],
      }),
    );
    const ev = runUntilLanded(sim, 3);
    const lands = ev.filter((e) => e.type === 'land');
    expect(lands.length).toBeGreaterThanOrEqual(3); // (spawning,) the ledge, then the floor
    expect(full(sim)).toBe(true);
  });

  it('not after hitting a ceiling and falling further than the throw was aimed', () => {
    const sim = makeSim(
      flatLevel([{ c: v3(0, 14.5, -6), h: v3(4, 0.5, 8) }], [], {
        launchPads: [{ min: v3(-1, 0, -1), max: v3(1, 2, 1), vel: v3(0, 30, -3) }],
      }),
    );
    runUntilLanded(sim, 3);
    expect(full(sim)).toBe(true);
  });

  it('not from a touch pad, nor when a pad throws you onto another pad', () => {
    const sim = makeSim(
      flatLevel([], [], {
        launchPads: [
          { min: v3(-1, 0, -1), max: v3(1, 0.2, 1), vel: v3(0, 26, -6), touch: true },
          // where the first throw comes down: a second, bigger throw
          { min: v3(-2, 0, -18), max: v3(2, 2, -14), vel: v3(0, 30, -4) },
        ],
      }),
    );
    const ev: SimEvent[] = [];
    for (let i = 0; i < 600; i++) {
      run(sim, 1);
      ev.push(...sim.world.events);
    }
    expect(ev.filter((e) => e.type === 'launch').length).toBeGreaterThanOrEqual(2);
    expect(full(sim)).toBe(true);
  });

  it('the flight ends once you have stood on the ground for a moment: later falls hurt again', () => {
    const sim = makeSim(
      flatLevel([], [], {
        launchPads: [{ min: v3(-1, 0, -1), max: v3(1, 2, 1), vel: v3(0, 30, 6) }],
      }),
    );
    run(sim, 300);
    expect(full(sim)).toBe(true);
    expect(sim.p.padFlight).toBe(false);
    sim.p.pos = v3(sim.p.pos.x, sim.p.pos.y + 14, sim.p.pos.z);
    sim.p.vel = v3();
    sim.p.grounded = false;
    run(sim, 180);
    expect(sim.p.hp).toBeLessThan(sim.config.combat.maxHp);
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
