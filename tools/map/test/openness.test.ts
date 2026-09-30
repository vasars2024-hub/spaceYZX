// Owner's rule: competitive maps play like CS maps — one duel at a time, never shot at from
// everywhere at once (tools/map/openness.ts). Every competitive map must meet the targets.
import { describe, expect, it } from 'vitest';
import { buildLevel, mapDef, MAPS } from '@space-yz/shared';
import { createAnalyzer, defaultOptions, findSamples } from '../metrics';
import { mapConfig } from '../maps';
import { measureOpenness, opennessProblems } from '../openness';

const openness = (id: string) => {
  const def = mapDef(id);
  const an = createAnalyzer(buildLevel(def), mapConfig(id, def), defaultOptions(true));
  findSamples(an);
  return measureOpenness(an);
};

describe('openness: one duel at a time', () => {
  it.each(MAPS.filter((m) => m.competitive).map((m) => m.id))(
    '%s meets the openness targets',
    (id) => {
      const r = openness(id);
      expect(r.spots).toBeGreaterThan(100);
      expect(opennessProblems(r), JSON.stringify(r.regions.slice(0, 5))).toEqual([]);
    },
    60000,
  );
});
