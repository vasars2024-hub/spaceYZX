// TEMP (not committed)
import { mapDef, buildLevel, raycast, v3, capsuleOverlaps, lineOfSight, waypointRoute } from '@space-yz/shared';
const lv = buildLevel(mapDef('afterglow'));
const wps = lv.def.waypoints!;
for (const w of wps) {
  if (capsuleOverlaps(lv, { center: w.pos, up: v3(0, 1, 0), halfSeg: 0, radius: 0.3 })) console.log('in solid', w.name);
  const f = raycast(lv, w.pos, v3(0, -1, 0), 1.5)?.point.y;
  if (f === undefined || Math.abs(f - (w.pos.y - 1)) > 0.05) console.log('floor', w.name, f);
  for (const j of w.links) if (!lineOfSight(lv, w.pos, wps[j].pos)) console.log('los', w.name, wps[j].name);
}
const t = wps.findIndex((w) => w.name === 'towerE');
for (let i = 0; i < wps.length; i++) if (waypointRoute(wps, t, i).length === 0 && i !== t) console.log('unreach', wps[i].name);
console.log('n', wps.length);
