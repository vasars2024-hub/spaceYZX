// TEMP
import { mapDef, buildLevel, v3, lineOfSight } from '@space-yz/shared';
const lv = buildLevel(mapDef('afterglow'));
const a = process.argv.slice(2).map(Number);
console.log(lineOfSight(lv, v3(a[0], a[1], a[2]), v3(a[3], a[4], a[5])));
