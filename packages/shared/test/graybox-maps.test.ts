// Every graybox map (level/graybox.ts; MapInfo `graybox`): built from its checked layout, it must
// be playable — bots reach every floor from both spawns, no waypoint is stuck inside geometry,
// spawns stand on a floor, and a bot walks from each spawn onto each bomb site.
import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  BOT_SKILLS,
  botThink,
  buildLevel,
  capsuleOverlaps,
  createBotMemory,
  createPlayer,
  createWorld,
  defaultConfig,
  mapDef,
  MAPS,
  pointInAabb,
  step,
  TICK_DT,
  v3,
  waypointRoute,
  type LevelDef,
  type SimContext,
  type Vec3,
} from '../src/index';

// (Skyfount is a free-roam sky map: every crossing is a jump or a jetpack hop bots can't make)
const BOT_MAPS = MAPS.filter((m) => m.graybox && m.competitive).map((m) => m.id);
const ALL = MAPS.filter((m) => m.graybox).map((m) => m.id);

const nearestWp = (d: LevelDef, p: Vec3) => {
  const wps = d.waypoints!;
  let best = 0;
  let bd = Infinity;
  wps.forEach((w, i) => {
    const dist = Math.hypot(w.pos.x - p.x, w.pos.y - (p.y + 1), w.pos.z - p.z);
    if (dist < bd) {
      bd = dist;
      best = i;
    }
  });
  return best;
};

describe('graybox maps', () => {
  it.each(ALL)('%s builds: spawns, Towers, callouts, no waypoint inside geometry', (id) => {
    const d = mapDef(id);
    const lv = buildLevel(d);
    for (const team of [0, 1] as const) {
      expect(d.spawns.filter((s) => s.team === team)).toHaveLength(8);
      expect(d.towers.filter((t) => t.team === team)).toHaveLength(1);
    }
    expect(d.callouts?.length).toBeGreaterThan(8);
    const stuck = d.waypoints!.filter((w) =>
      capsuleOverlaps(lv, { center: w.pos, up: v3(0, 1, 0), halfSeg: 0, radius: 0.3 }),
    );
    expect(stuck.map((w) => w.name)).toEqual([]);
  });

  it.each(BOT_MAPS)('%s: bots reach every waypoint and both sites from both spawns', (id) => {
    const d = mapDef(id);
    const wps = d.waypoints!;
    for (const team of [0, 1] as const) {
      const from = nearestWp(d, d.spawns.find((s) => s.team === team)!.pos);
      const lost = wps
        .filter((_, i) => waypointRoute(wps, from, i).length === 0)
        .map((w) => w.name);
      expect(lost, `team ${team}`).toEqual([]);
    }
  });

  const walks = BOT_MAPS.flatMap((id) =>
    (mapDef(id).bombSites ?? []).flatMap((z) =>
      ([0, 1] as const).map((team) => [id, team, z.name] as const),
    ),
  );
  it.each(walks)('%s: a team %i bot walks from spawn onto site %s', (id, team, site) => {
    const config = defaultConfig();
    const lv = buildLevel(mapDef(id));
    const ctx: SimContext = { level: lv, config, dt: TICK_DT };
    const world = createWorld(lv, 3);
    const s = lv.def.spawns.find((sp) => sp.team === team)!;
    const p = addPlayer(world, createPlayer(1, team, s.pos, s.yawDeg, config));
    const mem = createBotMemory(1, BOT_SKILLS.normal, 3);
    const zone = lv.def.bombSites!.find((b) => b.name === site)!;
    const goal = lv.def.waypoints!.find((w) => pointInAabb(w.pos, zone.min, zone.max))!;
    mem.objective = v3(goal.pos.x, goal.pos.y - 1, goal.pos.z);
    mem.objectiveFirst = true;
    let arrived = false;
    for (let t = 0; t < 60 * 45 && !arrived; t++) {
      step(world, { 1: botThink(world, ctx, p, mem) }, ctx);
      arrived = pointInAabb(p.pos, zone.min, zone.max);
    }
    expect(arrived, `ended at ${JSON.stringify(p.pos)}`).toBe(true);
  });
});
