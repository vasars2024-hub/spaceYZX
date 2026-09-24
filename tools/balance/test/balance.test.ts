import { describe, expect, it } from 'vitest';
import { runBalance } from '../run';

describe('bot matches (balance tool smoke test)', () => {
  it('bots move, throw and get kills in a short 1v1', () => {
    const r = runBalance({ minutes: 1, matches: 1, skill: 'normal', size: 1, seed: 7 });
    expect(r.totalKills).toBeGreaterThan(0);
    expect(r.boomerangHitPct).toBeGreaterThan(0);
  });
});
