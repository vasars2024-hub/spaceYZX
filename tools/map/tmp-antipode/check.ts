// scratch check (deleted before commit)
import {
  buildLevel,
  mapDef,
  findOverlaps,
  describeOverlap,
  capsuleOverlaps,
  lineOfSight,
  waypointRoute,
  gravityDirAt,
  createWorld,
  defaultConfig,
  TICK_DT,
  raycast,
  normalize,
  len,
  v3,
  withSkyArena,
} from '@space-yz/shared';
import { createAnalyzer, defaultOptions, findSamples } from '../metrics';
import { mapConfig } from '../maps';
import { measureOpenness } from '../openness';

const def = mapDef('antipode');
console.log('boxes', def.boxes.length);
const ov = findOverlaps(def);
console.log(
  'overlaps',
  ov.length,
  ov.slice(0, 15).map((o) => describeOverlap(def, o)),
);
const lv = buildLevel(withSkyArena(def));
const ctx = { level: lv, config: defaultConfig(), dt: TICK_DT };
const world = createWorld(lv, 1);
const wps = def.waypoints!;
let bad = 0;
for (const w of wps) {
  if (capsuleOverlaps(lv, { center: w.pos, up: v3(0, 1, 0), halfSeg: 0, radius: 0.3 })) {
    console.log('wp in solid', w.name);
    bad++;
  }
  const g = gravityDirAt(ctx, world, w.pos);
  if (len(g) < 0.5) {
    console.log('wp zeroG', w.name);
    bad++;
  } else if (!raycast(lv, w.pos, normalize(g), 1.6)) {
    console.log('wp no floor', w.name, JSON.stringify(g));
    bad++;
  }
  for (const j of w.links)
    if (!lineOfSight(lv, w.pos, wps[j].pos)) {
      if (!w.name!.startsWith('~')) console.log('link blocked', w.name, '→', wps[j].name);
      bad++;
    }
}
const home = wps.findIndex((w) => w.name === 'home.tower');
for (let i = 0; i < wps.length; i++)
  if (waypointRoute(wps, home, i).length === 0) {
    console.log('unreached', wps[i].name);
    bad++;
  }
for (const s of def.spawns) {
  if (s.team !== 0) continue;
  const c = { center: v3(s.pos.x, s.pos.y + 0.91, s.pos.z), up: v3(0, 1, 0), halfSeg: 0.5, radius: 0.4 };
  if (capsuleOverlaps(lv, c)) {
    console.log('spawn blocked', JSON.stringify(s.pos));
    bad++;
  }
}
console.log('problems', bad);
if (process.argv[2] !== 'noopen') {
  const an = createAnalyzer(buildLevel(def), mapConfig('antipode', def), defaultOptions(true));
  findSamples(an);
  const r = measureOpenness(an);
  console.log(JSON.stringify({ ...r, regions: r.regions.slice(0, 6) }, null, 1));
}
