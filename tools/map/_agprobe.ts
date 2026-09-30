// TEMP (not committed)
import { mapDef, buildLevel, raycast, v3, capsuleOverlaps } from '@space-yz/shared';
const lv = buildLevel(mapDef('afterglow'));
const probe = (x: number, y: number, z: number) => {
  const h = raycast(lv, v3(x, y, z), v3(0, -1, 0), 20);
  const f = h ? h.point.y : NaN;
  const cap = { center: v3(x, f + 0.9, z), up: v3(0, 1, 0), halfSeg: 0.45, radius: 0.4 };
  console.log(x, y, z, '→ floor', f.toFixed(2), 'n', h?.normal.y.toFixed(2), 'blocked', capsuleOverlaps(lv, cap));
};
for (const [x, y, z] of [
  [19, 8, -6], [16, 8, -6], [13, 8, -6], [18, 8, -12], [20, 8, -20], [36, 8, 30], [36, 8, 24], [0, 8, 12], [0, 8, 22], [8, -1.5, 12], [46, -1.5, 3], [35, -1.5, 4],
]) probe(x, y, z);
