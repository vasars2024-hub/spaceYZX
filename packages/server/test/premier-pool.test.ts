// Premier's map veto pool (services/queue.ts): competitive maps with bomb sites join it by
// themselves; small maps opt out with `premier: false` in the map registry.
import { describe, expect, it } from 'vitest';
import { getMap, mapDef } from '@space-yz/shared';
import { premierMapPool } from '../src/services/queue';

describe('Premier map pool', () => {
  it('has Canyon Relay (bomb sites A/B) but not the small Sakura Hold', () => {
    const pool = premierMapPool();
    expect(pool).toContain('canyon-relay-graybox');
    expect(
      mapDef('canyon-relay-graybox')
        .bombSites?.map((s) => s.name)
        .sort(),
    ).toEqual(['A', 'B']);
    // Sakura Hold has bomb sites too, but it is built for 1v1–3v3
    expect(mapDef('sakura-hold-graybox').bombSites?.length).toBe(2);
    expect(getMap('sakura-hold-graybox').premier).toBe(false);
    expect(pool).not.toContain('sakura-hold-graybox');
    expect(mapDef('kestrel-graybox').bombSites ?? []).toHaveLength(0);
    expect(pool).not.toContain('kestrel-graybox');
    expect(pool).not.toContain('skyfount-graybox');
    for (const id of pool) {
      expect(getMap(id).premier).not.toBe(false);
      expect(getMap(id).retired).toBeFalsy();
    }
  });
});
