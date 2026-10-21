// No seam catches on any surf map: every curved ramp of the racing line (level/course/curve.ts:
// exactly-joined pieces) ridden on the real map from its first line point at slow, typical and
// fast valid speeds (0.8 V, V, 1.15 V of MOVEMENT_PROFILE's reference surf speed) — the rider
// follows it to its end, never loses more than a sliver of speed in one tick and is never
// kicked off the face. Collision continuity is a release requirement (the design brief §4.4).
// Race tracks rebuilt on curved ramps (docs/movement-map-design/race/REVAMP.md) are ridden too,
// once they are listed here (as in race-tracks.test.ts REVAMPED).
import { describe, expect, it } from 'vitest';
import { expandCourse, getMap, mapDef, SURF_PROFILE, surfMaps } from '@space-yz/shared';
import { rideLine } from '../lab';

const REVAMPED_TRACKS = ['race-sunspire', 'race-neon', 'race-ember'];

describe.each([...surfMaps().map((m) => m.id), ...REVAMPED_TRACKS])('%s', (id) => {
  it('rides every curved ramp without a catch, slow to fast', () => {
    const data = getMap(id).course!();
    const { elementNodes } = expandCourse(data);
    const def = mapDef(id);
    const V = SURF_PROFILE.V;
    let ramps = 0;
    data.route.forEach((e, i) => {
      if (e.t !== 'curve' || e.alt) return;
      const line = elementNodes[i].map((n) => n.pos);
      if (line.length < 3) return;
      ramps++;
      for (const v of [0.8 * V, V, 1.15 * V]) {
        const r = rideLine(def, line, v, 1, 8, 7);
        const at = `ramp ${i} (from ${line[0].x.toFixed(0)}, ${line[0].y.toFixed(0)}, ${line[0].z.toFixed(0)}) at ${v.toFixed(0)} m/s`;
        expect(r.ok, at).toBe(true);
        expect(r.grounded, `${at}: never ground`).toBe(0);
        expect(r.worstDrop, `${at}: the worst one-tick loss`).toBeLessThan(0.5);
      }
    });
    expect(ramps).toBeGreaterThan(10);
  }, 120000);
});
