// TEMP (not committed)
import { buildLevel, mapDef } from '@space-yz/shared';
import { createAnalyzer, defaultOptions, findSamples } from './metrics';
import { mapConfig } from './maps';

const def = mapDef('afterglow');
const an = createAnalyzer(buildLevel(def), mapConfig('afterglow', def), defaultOptions(true));
findSamples(an);
const show = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) => {
  for (const s of an.samples)
    if (
      s.feet.x >= x0 &&
      s.feet.x <= x1 &&
      s.feet.z >= z0 &&
      s.feet.z <= z1 &&
      s.feet.y >= y0 &&
      s.feet.y <= y1
    )
      console.log(s.feet.x, s.feet.y.toFixed(2), s.feet.z, s.reachable ? 'R' : '-');
};
const args = process.argv.slice(2).map(Number);
show(args[0], args[1], args[2], args[3], args[4], args[5]);
