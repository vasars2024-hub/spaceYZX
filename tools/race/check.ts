// A course's health: the clipping check (boxes cutting through each other), the render budget
// and the course validation, for one map, every race map, or (--all) every map in the game.
//
//   npx tsx tools/race/check.ts [map-id ...] [--all] [--list]
import {
  describeOverlap,
  findOverlaps,
  mapDef,
  MAPS,
  raceMaps,
  validateCourse,
} from '@space-yz/shared';
import { mapBudget } from './budget';

const args = process.argv.slice(2);
const list = args.includes('--list');
const ids = args.filter((a) => !a.startsWith('--'));
for (const m of args.includes('--all') || ids.length ? MAPS : raceMaps(true)) {
  if (ids.length && !ids.includes(m.id)) continue;
  const def = mapDef(m.id);
  const hits = findOverlaps(def);
  const b = mapBudget(m.id);
  const problems = m.course ? validateCourse(m.course()) : [];
  console.log(
    `${m.id}: ${hits.length} overlaps · ${b.boxes} boxes · ${b.triangles} triangles · ${b.trims} strip lights · ${problems.length} problems`,
  );
  for (const p of problems.slice(0, 10)) console.log(`  ! ${p}`);
  if (list) for (const h of hits.slice(0, 40)) console.log(`  ${describeOverlap(def, h)}`);
}
