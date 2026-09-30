// TEMP (not committed): quick checks while building Afterglow
import { mapDef, findOverlaps, describeOverlap } from '@space-yz/shared';

const d = mapDef('afterglow');
console.log(
  'boxes',
  d.boxes.length,
  'lights',
  d.lights?.length,
  'trim',
  d.boxes.filter((b) => b.mat === 'trim').length,
);
const o = findOverlaps(d);
console.log('overlaps', o.length);
for (const x of o.slice(0, 40)) console.log(describeOverlap(d, x));
