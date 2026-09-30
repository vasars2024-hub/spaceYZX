import { buildStormglass } from '../packages/shared/src/level/maps/stormglass';
import { findOverlaps, describeOverlap } from '../packages/shared/src/index';
const t0 = Date.now();
const d = buildStormglass();
console.log('build ms', Date.now() - t0, 'boxes', d.boxes.length, 'collide', d.boxes.filter(b=>!b.noCollide).length);
const o = findOverlaps(d);
console.log('overlaps', o.length);
for (const x of o.slice(0, 30)) console.log(describeOverlap(d, x));
