// Premier's map veto pool (services/queue.ts): competitive maps with bomb sites join it by
// themselves; small maps opt out with `premier: false` in the map registry.
import { describe, expect, it } from 'vitest';
import { getMap, mapDef } from '@space-yz/shared';
import { premierMapPool } from '../src/services/queue';

describe('Premier map pool', () => {
  it('has Canyon Relay (bomb sites A/B) but not the small Sakura Hold', () => {
    const pool = premierMapPool();
    expect(pool).toContain('canyon-relay');
    expect(mapDef('canyon-relay').bombSites?.map((s) => s.name)).toEqual(['A', 'B']);
    // Sakura Hold has bomb sites too, but it is built for 1v1–3v3
    expect(mapDef('sakura-hold').bombSites?.length).toBe(2);
    expect(getMap('sakura-hold').premier).toBe(false);
    expect(pool).not.toContain('sakura-hold');
    for (const id of pool) expect(getMap(id).premier).not.toBe(false);
  });
});
