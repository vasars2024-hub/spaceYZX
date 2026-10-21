import { describe, expect, it } from 'vitest';
import {
  v3,
  len,
  normalize,
  rotateToward,
  angleBetween,
  qFromAxisAngle,
  qRotate,
  qFromUnitVectors,
  qFromBasis,
  qForward,
  qUp,
  rngFromSeed,
  rngFloat,
  rngNextU32,
} from '../src/index';

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('vec3/quat', () => {
  it('rotates vectors with quaternions', () => {
    const q = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2);
    const r = qRotate(q, v3(1, 0, 0));
    close(r.x, 0);
    close(r.z, -1);
  });

  it('builds shortest-arc and basis quaternions', () => {
    const q = qFromUnitVectors(v3(0, 1, 0), v3(1, 0, 0));
    const r = qRotate(q, v3(0, 1, 0));
    close(r.x, 1);
    const b = qFromBasis(normalize(v3(1, 0, -1)), v3(0, 1, 0));
    const f = qForward(b);
    close(f.x, Math.SQRT1_2);
    close(f.z, -Math.SQRT1_2);
    close(qUp(b).y, 1);
  });

  it('rotateToward limits angular step', () => {
    const r = rotateToward(v3(1, 0, 0), v3(0, 1, 0), 0.1);
    close(angleBetween(r, v3(1, 0, 0)), 0.1, 1e-6);
    close(len(r), 1);
    const flipped = rotateToward(v3(0, 1, 0), v3(0, -1, 0), 0.5, v3(0, 0, -1));
    close(angleBetween(flipped, v3(0, 1, 0)), 0.5, 1e-6);
  });
});

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = rngFromSeed(42);
    const b = rngFromSeed(42);
    for (let i = 0; i < 100; i++) expect(rngNextU32(a)).toBe(rngNextU32(b));
    const c = rngFromSeed(43);
    expect(rngNextU32(c)).not.toBe(rngNextU32(rngFromSeed(42)));
  });
  it('produces floats in [0,1) with a sane mean', () => {
    const s = rngFromSeed(7);
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      const f = rngFloat(s);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      sum += f;
    }
    close(sum / 10000, 0.5, 0.02);
  });
});
