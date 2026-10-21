// Cloud Foundry (surf map B03, level/maps/surf-cloud-foundry.ts): what the shared surf-map tests
// (surf-maps.test.ts) can't see. The condenser walkway's low pipe must teach crouching (standing
// you are blocked, crouched you walk under it; the bots don't crouch, so the walkway fork is
// ridden from past the pipe), and the brief's critical test: no hidden boost, the scoops move you
// by collision and your own control only.
import { describe, expect, it } from 'vitest';
import { Btn, cloudFoundryCourse, mapDef, v3 } from '../src/index';
import { makeSim, run } from './helpers';

const data = cloudFoundryCourse();
const def = mapDef('surf-cloud-foundry');

describe('surf-cloud-foundry', () => {
  it('the walkway pipe blocks a standing runner and lets a crouching one through', () => {
    const pipes = (data.scenery ?? []).filter(
      (e) => e.t === 'block' && e.solid && e.mat === 'trim',
    );
    expect(pipes.length).toBe(1);
    const pipe = pipes[0];
    if (pipe.t !== 'block') throw new Error('not a block');
    const [x, y, z] = pipe.at;
    // (the grating is 1.4 m under the pipe; the pads run west, so does the walkway)
    const feet = v3(x + 8, y - 1.4, z);
    const yaw = -((Math.atan2(-1, 0) * 180) / Math.PI);
    for (const crouch of [false, true]) {
      const sim = makeSim(def, feet, yaw);
      run(sim, 20);
      expect(sim.p.grounded, 'standing on the grating').toBe(true);
      run(sim, 180, Btn.Forward | (crouch ? Btn.Crouch : 0));
      const passed = sim.p.pos.x < x - 2;
      expect(passed, crouch ? 'crouched: under the pipe' : 'standing: blocked').toBe(crouch);
      // (still on the grating: nobody falls off beside the pipe)
      expect(sim.p.pos.y - 0.9).toBeGreaterThan(y - 1.4 - 1.5);
    }
  });

  it('no hidden boost: no boosters; launch pads only in restart bays and salvage branches', () => {
    expect(data.route.some((e) => e.t === 'booster')).toBe(false);
    for (const e of data.route)
      if (e.t === 'launch') expect(e.alt, 'a launch off the route').toBe(true);
    // the portal keeps your speed (it only moves you: turn 0)
    expect((def.portals ?? []).length).toBe(1);
    expect(def.portals![0].turn ?? 0).toBe(0);
  });
});
