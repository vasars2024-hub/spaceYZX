// TEMP (not committed)
import { mapDef, buildLevel, raycast, v3, capsuleOverlaps, lineOfSight, type Vec3 } from '@space-yz/shared';
const lv = buildLevel(mapDef('afterglow'));
const cap = (f: Vec3) => ({ center: v3(f.x, f.y + 0.9, f.z), up: v3(0, 1, 0), halfSeg: 0.45, radius: 0.4 });
const spots: Vec3[] = [];
for (let x = -43.75; x <= 43.75; x += 1)
  for (let z = -39.75; z <= 39.75; z += 1)
    for (const top of [8, 4.4, 1, -1.3]) {
      const h = raycast(lv, v3(x, top, z), v3(0, -1, 0), 25);
      if (!h || h.normal.y < 0.7) continue;
      const f = v3(x, h.point.y, z);
      if (capsuleOverlaps(lv, cap(f))) continue;
      if (!spots.some((p) => p.x === x && p.z === z && Math.abs(p.y - f.y) < 0.3)) spots.push(f);
    }
console.log('spots', spots.length);
let bad = 0;
for (const s of lv.def.spawns) {
  const seen: string[] = [];
  for (const p of spots)
    for (const dy of [0.3, 1, 1.7])
      if (lineOfSight(lv, v3(p.x, p.y + 1.6, p.z), v3(s.pos.x, s.pos.y + dy, s.pos.z))) {
        seen.push(`${p.x},${p.y.toFixed(1)},${p.z}`);
        break;
      }
  if (seen.length) { bad++; console.log(s.group, s.pos.x, s.pos.y, s.pos.z, seen.length, seen.slice(0, 6).join(' | ')); }
}
console.log('bad', bad);
