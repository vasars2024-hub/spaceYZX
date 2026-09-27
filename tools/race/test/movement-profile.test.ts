// The movement profile the surf maps are fitted to (SURF_PROFILE, docs/movement-map-design/
// movement-profile.md) still matches the simulation: if movement physics change, this fails
// until the profile's version is bumped, `npm run race:lab` re-run and every surf map re-checked.
import { describe, expect, it } from 'vitest';
import { defaultConfig, STEADY_RACER, SURF_PROFILE } from '@space-yz/shared';
import { bhop, faceHold, jumpApex, runJump } from '../lab';
import { referenceSpeed } from '../movement-lab';

const near = (a: number, b: number, tol: number) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe(SURF_PROFILE.version, () => {
  it('body, jump apex and running jump', () => {
    const m = defaultConfig().movement;
    expect(m.standHeight).toBe(SURF_PROFILE.H);
    expect(m.radius * 2).toBe(SURF_PROFILE.W);
    near(jumpApex(), SURF_PROFILE.Z, 0.03);
    near(runJump(m.raceSprintSpeed, false), SURF_PROFILE.J, 0.2);
  });

  it('bunny hops; holding Space re-jumps only where a map asks for it', () => {
    const b = bhop(16, 1);
    near(b.perHop, SURF_PROFILE.B16.perHop, 0.4);
    near(b.gain, SURF_PROFILE.B16.gain, 0.1);
    expect(bhop(16, 1, 6, true).hops > 1).toBe(SURF_PROFILE.holdToBhop);
    // (a map may turn hold-to-bhop on: then holding does re-jump)
    expect(bhop(16, 1, 6, true, true).hops).toBeGreaterThan(4);
  });

  it('the stable surf face range', () => {
    const [lo, hi] = SURF_PROFILE.faces;
    for (const a of [lo, hi]) expect(faceHold(a, 20).ok && faceHold(a, 30).ok, `${a}°`).toBe(true);
    expect(faceHold(hi + 5, 20).ok, `${hi + 5}° is past it`).toBe(false);
  });

  it('the reference surf speed V', () => {
    near(referenceSpeed(STEADY_RACER).v, SURF_PROFILE.V, 1);
  }, 30000);
});
