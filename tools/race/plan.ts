// Print a course's route: every element with where it is (building and debugging tracks).
//
//   npx tsx tools/race/plan.ts <map-id>
import { getMap, mapDef } from '@space-yz/shared';

const id = process.argv[2] ?? 'race-sunspire';
const data = getMap(id).course!();
const f = (p: number[]) => p.map((x) => x.toFixed(1).padStart(7)).join('');
let stage = 0;
data.route.forEach((e, i) => {
  const at = ('at' in e ? e.at : 'from' in e ? e.from : 'to' in e ? e.to : null) ?? [0, 0, 0];
  if (e.t === 'stage') stage++;
  console.log(
    `${String(i).padStart(3)} ${e.t.padEnd(9)}${f(at)}  ${e.go ?? ''}${e.t === 'stage' ? `  ← checkpoint ${stage}` : ''}`,
  );
});
const def = mapDef(id);
console.log(`${def.boxes.length} boxes, ${def.race!.line.length} line nodes`);
