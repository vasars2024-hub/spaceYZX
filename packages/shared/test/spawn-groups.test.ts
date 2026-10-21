import { describe, expect, it } from 'vitest';
import { spawnOrder, v3, type SpawnDef } from '../src/index';

const sp = (x: number, group?: string): SpawnDef => ({
  pos: v3(x, 0, 0),
  yawDeg: 0,
  team: 0,
  ...(group ? { group } : {}),
});

describe('detached spawn groups (spawnOrder)', () => {
  it('keeps the shuffled order when no spawn has a group', () => {
    const s = [sp(3), sp(1), sp(2)];
    expect(spawnOrder(s)).toEqual(s);
  });

  it('spreads a team over every group before doubling up', () => {
    // shuffled: two in the lobby, then the tunnel, then the lobby again, then the ramp...
    const s = [sp(1, 'lobby'), sp(2, 'lobby'), sp(3, 'tunnel'), sp(4, 'lobby'), sp(5, 'ramp')];
    const order = spawnOrder(s);
    expect(order.map((o) => o.pos.x)).toEqual([1, 3, 5, 2, 4]);
    // a 3v3 team: three different groups
    expect(new Set(order.slice(0, 3).map((o) => o.group)).size).toBe(3);
    // nothing lost, nothing repeated
    expect(order.map((o) => o.pos.x).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
