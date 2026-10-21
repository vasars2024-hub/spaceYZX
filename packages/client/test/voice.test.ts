// Push-to-talk routing: team talk must only ever go to teammates.
import { describe, expect, it } from 'vitest';
import { talkTargets } from '../src/net/voice';

describe('talkTargets', () => {
  const peers = new Map<number, 0 | 1>([
    [2, 0],
    [3, 1],
    [4, 0],
    [5, 1],
  ]);

  it('team talk reaches teammates only', () => {
    expect([...talkTargets('team', peers, 0)].sort()).toEqual([2, 4]);
    expect([...talkTargets('team', peers, 1)].sort()).toEqual([3, 5]);
  });

  it('all talk reaches everyone, no talk nobody', () => {
    expect([...talkTargets('all', peers, 0)].sort()).toEqual([2, 3, 4, 5]);
    expect(talkTargets(null, peers, 0).size).toBe(0);
  });
});
