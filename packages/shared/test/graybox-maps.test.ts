// Every graybox map (level/graybox.ts; MapInfo `graybox`): built from its checked layout, it must
// be playable — bots reach every floor from both spawns, no waypoint is stuck inside geometry,
// spawns stand on a floor, and a bot walks from each spawn onto each bomb site. Their layouts
// build without warnings, no waypoint is a dead end, and every straight ramp keeps the pace.
import { describe, expect, it } from 'vitest';
import * as shared from '../src/index';
import {
  addPlayer,
  BOT_SKILLS,
  Btn,
  botThink,
  buildGraybox,
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
  yawToView,
  type GrayboxLayout,
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

/** every graybox map's layout (the exported *_LAYOUT objects), by the map it builds */
const LAYOUTS = Object.entries(shared)
  .filter(([k, v]) => k.endsWith('_LAYOUT') && !!(v as { layers?: unknown })?.layers)
  .map(([, v]) => v as GrayboxLayout);
const layoutOf = (id: string) => LAYOUTS.find((l) => l.name === mapDef(id).name);

describe('graybox maps', () => {
  it.each(ALL)('%s: its layout builds without warnings (but ramps steeper than 30°)', (id) => {
    const lay = layoutOf(id);
    expect(lay, 'layout').toBeDefined();
    const warns: string[] = [];
    buildGraybox(lay!, { warn: (m) => warns.push(m) });
    // (30°–45° still keeps the pace: see the ramp walks below)
    expect(warns.filter((m) => !/ is [0-9.]+° steep \(more than 30°/.test(m))).toEqual([]);
  });

  it.each(BOT_MAPS)('%s: no dead ends: every waypoint leads back to both spawns', (id) => {
    const d = mapDef(id);
    const wps = d.waypoints!;
    const back: number[][] = wps.map(() => []);
    wps.forEach((w, i) => w.links.forEach((j) => back[j].push(i)));
    for (const team of [0, 1] as const) {
      const home = nearestWp(d, d.spawns.find((s) => s.team === team)!.pos);
      const seen = new Set([home]);
      const q = [home];
      for (let i = 0; i < q.length; i++)
        for (const j of back[q[i]])
          if (!seen.has(j)) {
            seen.add(j);
            q.push(j);
          }
      expect(
        wps.filter((_, i) => !seen.has(i)).map((w) => w.name),
        `team ${team}`,
      ).toEqual([]);
    }
  });

  // every straight ramp of an upright floor with a landing at both ends: running straight up it
  // and straight down it keeps at least 0.9 of the flat-ground pace
  const ramps = ALL.flatMap((id) => {
    const lay = layoutOf(id);
    if (!lay || lay.sky) return [];
    return Object.entries(lay.legend).flatMap(([c, a]) =>
      a.k === 'ramp' && a.dir && (a.o ?? 'up') === 'up'
        ? lay.layers.flatMap((L, l) =>
            (L.o ?? 'up') === 'up' && L.rows.some((r) => r.includes(c))
              ? [[id, c, l] as const]
              : [],
          )
        : [],
    );
  });
  /** the landing waypoints at both ends of a straight ramp (none: a landing beside it) */
  const rampEnds = (id: string, c: string, l: number) => {
    const lay = layoutOf(id)!;
    const a = lay.legend[c];
    const L = lay.layers[l];
    const s = lay.cellM;
    const d = mapDef(id);
    let [x0, x1, y0, y1] = [Infinity, -1, Infinity, -1];
    L.rows.forEach((r, y) =>
      [...r].forEach((ch, x) => {
        if (ch !== c) return;
        [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
      }),
    );
    const ew = a.dir === 'e' || a.dir === 'w';
    const mid = ew ? Math.floor((y0 + y1) / 2) : Math.floor((x0 + x1) / 2);
    const ends = {
      e: [
        [x0 - 1, mid],
        [x1 + 1, mid],
      ],
      w: [
        [x1 + 1, mid],
        [x0 - 1, mid],
      ],
      s: [
        [mid, y0 - 1],
        [mid, y1 + 1],
      ],
      n: [
        [mid, y1 + 1],
        [mid, y0 - 1],
      ],
    }[a.dir!];
    const [lo, hi] = a.r!;
    // the waypoint of the landing cell at the ramp's height there (any layer)
    const landing = ([x, y]: number[], h: number) =>
      d.waypoints!.filter(
        (w) => w.name!.endsWith(`:${x},${y}`) && Math.abs(w.pos.y - 1 - h) < 0.7,
      )[0];
    const [pl, ph] = [landing(ends[0], lo), landing(ends[1], hi)];
    return pl && ph ? { d, s, pl, ph } : null;
  };
  it('the ramp walks cover most ramps', () =>
    expect(ramps.filter(([id, c, l]) => rampEnds(id, c, l)).length).toBeGreaterThan(30));
  it.each(ramps)('%s: ramp %s (layer %i) keeps 0.9 of the pace both ways', (id, c, l) => {
    const ends = rampEnds(id, c, l);
    if (!ends) return; // (a landing beside the ramp, not at its end: no straight run)
    const { d, s, pl, ph } = ends;
    const lv = buildLevel(d);
    const config = defaultConfig();
    const ctx: SimContext = { level: lv, config, dt: TICK_DT };
    // (rails start in some landings: a run that grabs one doesn't count)
    const onRail = (p: Vec3) =>
      d.rails.some((r) => r.points.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < s));
    const run = (from: Vec3, to: Vec3) => {
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const dist = Math.hypot(dx, dz);
      const yaw = (Math.atan2(-dx, -dz) * 180) / Math.PI;
      const world = createWorld(lv, 1);
      const p = addPlayer(world, createPlayer(1, 0, v3(from.x, from.y - 0.1, from.z), yaw, config));
      let flat = 0;
      let tIn = -1;
      for (let t = 0; t < 600; t++) {
        step(world, { 1: { tick: t, buttons: Btn.Forward, view: yawToView(yaw) } }, ctx);
        const along = ((p.pos.x - from.x) * dx + (p.pos.z - from.z) * dz) / dist;
        if (along < s / 2) flat = Math.max(flat, Math.hypot(p.vel.x, p.vel.z));
        else if (tIn < 0) tIn = t;
        if (along >= dist - s / 2) return (dist - s) / ((t - tIn) * TICK_DT) / flat;
      }
      return 0;
    };
    if (onRail(pl.pos) || onRail(ph.pos)) return;
    expect(run(pl.pos, ph.pos), 'up').toBeGreaterThanOrEqual(0.9);
    expect(run(ph.pos, pl.pos), 'down').toBeGreaterThanOrEqual(0.9);
  });

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
      // (one sweep over the waypoint graph: which waypoints can be reached from the spawn)
      const seen = new Set([from]);
      const queue = [from];
      while (queue.length)
        for (const j of wps[queue.pop()!].links)
          if (!seen.has(j)) {
            seen.add(j);
            queue.push(j);
          }
      const lost = wps.filter((_, i) => !seen.has(i)).map((w) => w.name);
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
