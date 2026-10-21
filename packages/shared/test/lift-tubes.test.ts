import { describe, expect, it } from 'vitest';
import {
  BOT_SKILLS,
  Btn,
  botThink,
  createBotMemory,
  v3,
  step,
  feetPos,
  tubeThrowVelocity,
  type LiftTubeDef,
  type SimEvent,
  type Vec3,
} from '../src/index';
import { flatLevel, makeSim, run, type Sim } from './helpers';

// Suction tubes (LevelDef.liftTubes, sim/devices.ts): the maps' ladders.

/** A ledge 8 m up (z -20 .. -10) and a tube up its front face that throws you onto it. */
const TUBE: LiftTubeDef = {
  base: v3(0, 0, -9),
  top: v3(0, 9, -9),
  land: v3(0, 8, -14),
  radius: 0.9,
};
const ledgeLevel = (tube: LiftTubeDef = TUBE) =>
  flatLevel([{ c: v3(0, 4, -15), h: v3(10, 4, 5) }], [], { liftTubes: [tube] });

/** Run n ticks with `buttons`, collecting events. */
const go = (sim: Sim, n: number, buttons = 0): SimEvent[] => {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    step(sim.world, { 1: { tick: sim.world.tick + 1, buttons, view: sim.p.view } }, sim.ctx);
    out.push(...sim.world.events);
  }
  return out;
};

describe('suction tubes', () => {
  it('pulls you up the middle of the tube and throws you onto its landing spot', () => {
    const sim = makeSim(ledgeLevel(), v3(0.5, 0, -5)); // facing -Z, toward the tube
    run(sim, 30);
    const ev: SimEvent[] = [];
    let entered = -1;
    let maxOff = 0;
    let maxUp = 0;
    let landedAt: Vec3 | null = null;
    for (let i = 0; i < 300 && !landedAt; i++) {
      // walk in; then strafing and jumping in the tube do nothing (no way out of its side)
      const mash = i % 2 ? Btn.Left : Btn.Jump;
      const e = go(sim, 1, entered < 0 ? Btn.Forward : sim.p.tube >= 0 ? mash : 0);
      ev.push(...e);
      if (entered < 0 && e.some((x) => x.type === 'tubeEnter')) entered = i;
      if (sim.p.tube >= 0) {
        const f = feetPos(sim.p, sim.config.movement);
        if (i > entered + 10) maxOff = Math.max(maxOff, Math.hypot(f.x - 0, f.z + 9));
        maxUp = Math.max(maxUp, sim.p.vel.y);
      }
      if (ev.some((x) => x.type === 'tubeExit') && e.some((x) => x.type === 'land'))
        landedAt = feetPos(sim.p, sim.config.movement);
    }
    expect(entered).toBeGreaterThanOrEqual(0);
    expect(ev.some((x) => x.type === 'tubeExit')).toBe(true);
    // centred, at tube speed
    expect(maxOff).toBeLessThan(0.05);
    expect(maxUp).toBeCloseTo(sim.config.movement.tubeSpeed, 5);
    // landed on the ledge at the landing spot, unhurt
    expect(landedAt).not.toBeNull();
    const f = landedAt!;
    expect(Math.abs(f.y - 8)).toBeLessThan(0.1);
    expect(Math.hypot(f.x - TUBE.land.x, f.z - TUBE.land.z)).toBeLessThan(0.6);
    expect(sim.p.hp).toBe(sim.config.combat.maxHp);
  });

  it('the throw is an arc from the top to the landing spot', () => {
    const sim = makeSim(ledgeLevel());
    const v = tubeThrowVelocity(TUBE, sim.ctx);
    const g = sim.config.movement.gravity;
    // where the arc comes back down to the landing height
    const t = (v.y + Math.sqrt(v.y * v.y - 2 * g * (TUBE.land.y - TUBE.top.y))) / g;
    expect(TUBE.top.x + v.x * t).toBeCloseTo(TUBE.land.x, 6);
    expect(TUBE.top.z + v.z * t).toBeCloseTo(TUBE.land.z, 6);
    // it rises a little above the higher end
    expect((v.y * v.y) / (2 * g)).toBeCloseTo(sim.config.movement.tubeArcHeight, 6);
  });

  it('a long throw down from a high tube never hurts', () => {
    // top 25 m up, landing on the floor far away: a fall that would otherwise kill
    const tube: LiftTubeDef = {
      base: v3(0, 0, -6),
      top: v3(0, 25, -6),
      land: v3(0, 0, -30),
      radius: 0.9,
    };
    const sim = makeSim(flatLevel([], [], { liftTubes: [tube] }), v3(0, 0, -6));
    let impact = 0;
    let f: Vec3 | null = null;
    let exited = false;
    for (let i = 0; i < 400 && !f; i++) {
      const e = go(sim, 1);
      if (e.some((x) => x.type === 'tubeExit')) exited = true;
      const land = e.find((x) => x.type === 'land');
      if (exited && land?.type === 'land') {
        impact = land.speed;
        f = feetPos(sim.p, sim.config.movement);
      }
    }
    expect(f).not.toBeNull();
    expect(impact).toBeGreaterThan(20); // (a fall like that kills: fallLethalHeight)
    go(sim, 60);
    expect(sim.p.alive).toBe(true);
    expect(sim.p.hp).toBe(sim.config.combat.maxHp);
    expect(Math.hypot(f!.x, f!.z + 30)).toBeLessThan(0.6);
  });

  it('a short cooldown after the throw: landing at the mouth does not pull you straight back in', () => {
    // a tube that throws you right back onto its own mouth
    const tube: LiftTubeDef = {
      base: v3(0, 0, -6),
      top: v3(0, 4, -6),
      land: v3(0, 0, -6.5),
      radius: 1,
    };
    const sim = makeSim(flatLevel([], [], { liftTubes: [tube] }), v3(0, 0, -6));
    const ev = go(sim, 1);
    expect(ev.some((x) => x.type === 'tubeEnter')).toBe(true);
    let exitTick = -1;
    let again = -1;
    for (let i = 0; i < 300 && again < 0; i++) {
      const e = go(sim, 1);
      if (exitTick < 0 && e.some((x) => x.type === 'tubeExit')) exitTick = i;
      else if (exitTick >= 0 && e.some((x) => x.type === 'tubeEnter')) again = i;
    }
    expect(exitTick).toBeGreaterThanOrEqual(0);
    // only once the cooldown is over
    expect(again - exitTick).toBeGreaterThanOrEqual(
      Math.round(sim.config.movement.tubeCooldownSec * 60),
    );
  });

  it('is deterministic', () => {
    const once = () => {
      const sim = makeSim(ledgeLevel(), v3(0.6, 0, -4));
      go(sim, 200, Btn.Forward);
      return JSON.stringify(sim.world);
    };
    expect(once()).toBe(once());
  });
});

describe('bots and suction tubes', () => {
  it('a bot whose route goes up a tube (a one-way waypoint link mouth → landing) rides it', () => {
    const def = {
      ...ledgeLevel(),
      waypoints: [
        { pos: v3(0, 1, 6), links: [1] },
        { pos: v3(0, 1, -9), links: [0, 2] }, // the tube's mouth: one way up to the landing
        { pos: v3(0, 9, -14), links: [3] },
        { pos: v3(0, 9, -18), links: [2] },
      ],
    };
    const sim = makeSim(def, v3(0, 0, 6));
    const mem = createBotMemory(1, BOT_SKILLS.normal, 3);
    mem.objective = v3(0, 8, -18);
    mem.objectiveFirst = true;
    let rode = false;
    let arrived = false;
    for (let t = 0; t < 60 * 15 && !arrived; t++) {
      step(sim.world, { 1: botThink(sim.world, sim.ctx, sim.p, mem) }, sim.ctx);
      if (sim.world.events.some((e) => e.type === 'tubeExit')) rode = true;
      const f = feetPos(sim.p, sim.config.movement);
      arrived = sim.p.grounded && f.y > 7.5 && f.z < -16;
    }
    expect(rode).toBe(true);
    expect(arrived).toBe(true);
    expect(sim.p.hp).toBe(sim.config.combat.maxHp);
  });
});
