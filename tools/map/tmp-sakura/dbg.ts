import {
  buildLevel,
  mapDef,
  findOverlaps,
  describeOverlap,
  lineOfSight,
  capsuleOverlaps,
  v3,
  waypointRoute,
  sakuraHoldPlan,
  raycast,
} from '@space-yz/shared';
import { createAnalyzer, defaultOptions, findSamples } from '../metrics';
import { mapConfig } from '../maps';
import { measureOpenness } from '../openness';

const def = mapDef('sakura-hold');
const lv = buildLevel(def);
const args = process.argv.slice(2);
if (args.includes('plan'))
  console.log(
    sakuraHoldPlan()
      .map((r, i) => String(i).padStart(2) + ' ' + r)
      .join('\n'),
  );
console.log('boxes', def.boxes.length);
const ov = findOverlaps(def);
console.log('overlaps', ov.length);
for (const o of ov.slice(0, 40)) console.log('  ', describeOverlap(def, o));
const wps = def.waypoints!;
for (const w of wps) {
  if (capsuleOverlaps(lv, { center: w.pos, up: v3(0, 1, 0), halfSeg: 0, radius: 0.3 }))
    console.log('wp in solid', w.name);
  const down = raycast(lv, w.pos, v3(0, -1, 0), 3);
  if (!down || Math.abs(w.pos.y - 1 - down.point.y) > 0.5)
    console.log('wp floor?', w.name, down?.point.y);
  for (const j of w.links) {
    if (!lineOfSight(lv, w.pos, wps[j].pos)) console.log('no LOS', w.name, '->', wps[j].name);
    const a = w.pos;
    const b = wps[j].pos;
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    for (let t = 0.05; t < 1; t += 0.4 / Math.max(L, 1)) {
      const p = v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
      if (
        capsuleOverlaps(lv, {
          center: v3(p.x, p.y + 0.1, p.z),
          up: v3(0, 1, 0),
          halfSeg: 0.2,
          radius: 0.35,
        })
      ) {
        console.log('tight link', w.name, '->', wps[j].name, p.x.toFixed(1), p.z.toFixed(1));
        break;
      }
    }
  }
}
const start = wps.findIndex((w) => w.name === 'towerN');
for (let i = 0; i < wps.length; i++)
  if (i !== start && !waypointRoute(wps, start, i).length) console.log('unreachable', wps[i].name);
for (const s of def.spawns)
  if (
    capsuleOverlaps(lv, {
      center: v3(s.pos.x, s.pos.y + 0.9, s.pos.z),
      up: v3(0, 1, 0),
      halfSeg: 0.45,
      radius: 0.4,
    })
  )
    console.log('spawn blocked', s.pos);
if (!args.includes('noopen')) {
  const an = createAnalyzer(lv, mapConfig('sakura-hold', def), defaultOptions(true));
  findSamples(an);
  const r = measureOpenness(an);
  console.log('openness', r.spots, r.watchedMean, r.watchedP90, r.wideShare, r.anglesMean);
  console.log(JSON.stringify(r.regions.slice(0, 14)));
}
