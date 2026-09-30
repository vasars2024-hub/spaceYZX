import { describe, expect, it } from 'vitest';
import { runMatches } from '../matches';

describe('npm run matches', () => {
  it('plays full bot matches on Kestrel and reports how rounds end', () => {
    const r = runMatches({ mode: '1v1', matches: 1, skill: 'normal', seed: 3 });
    expect(r.rounds).toBeGreaterThanOrEqual(5);
    expect(r.avgRoundSec).toBeGreaterThan(3);
    expect(r.avgRoundSec).toBeLessThanOrEqual(40);
    const total = Object.values(r.reasons).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 5);
    expect(r.avgMatchSec).toBeLessThan(15 * 60);
  }, 30_000);
});
