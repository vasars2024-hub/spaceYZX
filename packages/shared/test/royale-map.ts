// A SMALL royale map for tests only (no real map is shipped with royale data yet; the Shibuya
// mega map brings it): Colossus Yard (about 240 × 215 m) with royale data added — its own spawn
// points as the royale spawns (teams dropped) and a zone round the middle of the yard that
// covers every one of them.
import { mapDef, v3, type LevelDef } from '../src/index';

export const ROYALE_TEST_MAP = 'royale-test-yard';

let cached: LevelDef | null = null;

export const royaleTestDef = (): LevelDef => {
  if (cached) return cached;
  const base = mapDef('colossus-yard');
  cached = {
    ...base,
    name: 'Royale Test Yard',
    royale: {
      spawns: base.spawns.map((s) => ({ pos: s.pos, yawDeg: s.yawDeg })),
      center: v3(0, 0, -7),
      radius: 165,
    },
  };
  return cached;
};

/** The test map as a registry entry (registerMap it in a test file to play it by id). */
export const royaleTestMapInfo = () => ({
  id: ROYALE_TEST_MAP,
  name: 'Royale Test Yard',
  build: royaleTestDef,
  competitive: false,
  royale: true,
});
