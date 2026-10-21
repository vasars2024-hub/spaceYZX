// Smaller teams play a smaller map (owner's rule). A map may define "size walls"
// (LevelDef.sizeWalls): layers of glowing force-field panels that exist only when the match
// has at most `maxTeamSize` players per team — e.g. 1v1 / 2v2 are confined to the middle (you
// can't walk around a side lane to touch the Tower), 3v3 loses some outer routes, 4v4 / 5v5
// play the whole map.
//
// sizedLevelDef() turns a map into the version for one team size: the walls join the boxes (so
// they collide, block bullets, Boomerangs and line of sight, and the renderer draws them), the
// layer's spawn / Tower / bomb-site overrides apply, and the bot waypoint graph keeps only the
// part reachable from the spawns without crossing a wall. Server rooms and clients both build
// the level from mapDefForSize(map, teamSize), so they always agree. Pure and deterministic.
import type { Vec3 } from '../math/vec3';
import { v3 } from '../math/vec3';
import type { BoxDef, LevelDef, SizeWallDef, WaypointDef } from './types';

/** Team size that plays the whole map (5v5; 4v4 too unless a map says otherwise). */
export const FULL_TEAM_SIZE = 5;

/** The size-wall layers up for this team size, smallest first. */
export const activeSizeWalls = (def: LevelDef, teamSize: number): SizeWallDef[] =>
  (def.sizeWalls ?? [])
    .filter((l) => teamSize <= l.maxTeamSize)
    .sort((a, b) => a.maxTeamSize - b.maxTeamSize);

/** Every wall box of the active layers, as they are added to the level. */
export const sizeWallBoxes = (def: LevelDef, teamSize: number): BoxDef[] =>
  activeSizeWalls(def, teamSize).flatMap((l) =>
    l.boxes.map((b) => ({ ...b, mat: 'forcefield' as const, noCollide: false, noRender: false })),
  );

/** World AABB of an (unrotated or rotated) box. */
const aabb = (b: BoxDef): { min: Vec3; max: Vec3 } => {
  // rotated walls: a loose bound is fine for pruning bot links
  const r = b.q ? Math.hypot(b.h.x, b.h.y, b.h.z) : 0;
  const hx = r || b.h.x;
  const hy = r || b.h.y;
  const hz = r || b.h.z;
  return {
    min: v3(b.c.x - hx, b.c.y - hy, b.c.z - hz),
    max: v3(b.c.x + hx, b.c.y + hy, b.c.z + hz),
  };
};

/** Does segment a→b pass through the box grown by `pad` (slab test)? */
const segHitsBox = (a: Vec3, b: Vec3, box: { min: Vec3; max: Vec3 }, pad: number): boolean => {
  let t0 = 0;
  let t1 = 1;
  for (const k of ['x', 'y', 'z'] as const) {
    const d = b[k] - a[k];
    const lo = box.min[k] - pad;
    const hi = box.max[k] + pad;
    if (Math.abs(d) < 1e-9) {
      if (a[k] < lo || a[k] > hi) return false;
      continue;
    }
    let ta = (lo - a[k]) / d;
    let tb = (hi - a[k]) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
};

/** Is a bot link from `a` to `b` (waypoint positions) cut by one of the walls? */
export const linkCrossesWalls = (a: Vec3, b: Vec3, walls: readonly BoxDef[]): boolean =>
  // a walker's body, a little padded (walls are thin panels): maps put waypoints about 1 m
  // over the floor (some at the feet), so sample just above the point and 0.9 m higher —
  // a low opening (a crouch vent) is caught as well as a door
  [0.2, 0.9].some((dy) => {
    const pa = v3(a.x, a.y + dy, a.z);
    const pb = v3(b.x, b.y + dy, b.z);
    return walls.some((w) => segHitsBox(pa, pb, aabb(w), 0.3));
  });

/** Is a point inside one of the walls (grown by `pad`)? */
export const insideWalls = (p: Vec3, walls: readonly BoxDef[], pad = 0): boolean =>
  walls.some((w) => {
    const { min, max } = aabb(w);
    return (
      p.x >= min.x - pad &&
      p.x <= max.x + pad &&
      p.y >= min.y - pad &&
      p.y <= max.y + pad &&
      p.z >= min.z - pad &&
      p.z <= max.z + pad
    );
  });

const dist2 = (a: Vec3, b: Vec3): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

/**
 * The waypoint graph without links that cross a wall, reduced to the waypoints reachable from
 * `from` (the spawns). Links are remapped to the kept waypoints (names stay). Returns the new
 * list and, for every old index, its new index (-1 = dropped).
 */
export const prunedWaypoints = (
  wps: readonly WaypointDef[],
  walls: readonly BoxDef[],
  from: readonly Vec3[],
): { waypoints: WaypointDef[]; remap: number[] } => {
  const ok = (i: number, j: number) =>
    j >= 0 && j < wps.length && !linkCrossesWalls(wps[i].pos, wps[j].pos, walls);
  // start from the waypoint nearest each spawn
  const seen = new Set<number>();
  const stack: number[] = [];
  for (const p of from) {
    let best = -1;
    let bd = Infinity;
    wps.forEach((w, i) => {
      const d = dist2(w.pos, p);
      if (d < bd && !insideWalls(w.pos, walls)) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0 && !seen.has(best)) {
      seen.add(best);
      stack.push(best);
    }
  }
  while (stack.length) {
    const i = stack.pop()!;
    for (const j of wps[i].links)
      if (!seen.has(j) && ok(i, j)) {
        seen.add(j);
        stack.push(j);
      }
  }
  const remap = wps.map(() => -1);
  let n = 0;
  wps.forEach((_, i) => {
    if (seen.has(i)) remap[i] = n++;
  });
  const waypoints: WaypointDef[] = [];
  wps.forEach((w, i) => {
    if (remap[i] < 0) return;
    waypoints.push({
      ...w,
      links: w.links.filter((j) => remap[j] >= 0 && ok(i, j)).map((j) => remap[j]),
    });
  });
  return { waypoints, remap };
};

/**
 * The map as played with `teamSize` players per team: the active size walls added (as
 * 'forcefield' boxes after the map's own), the layers' overrides applied, the waypoint graph
 * cut at the walls, power-ups in closed parts left out. No walls for this size: `def` itself.
 */
export const sizedLevelDef = (def: LevelDef, teamSize: number): LevelDef => {
  const layers = activeSizeWalls(def, teamSize);
  if (!layers.length) return def;
  const walls = sizeWallBoxes(def, teamSize);
  const pick = <K extends 'spawns' | 'towers' | 'controllerHomes' | 'bombSites'>(
    k: K,
  ): SizeWallDef[K] | undefined => layers.find((l) => l[k] !== undefined)?.[k];
  const spawns = pick('spawns') ?? def.spawns;
  const out: LevelDef = {
    ...def,
    boxes: [...def.boxes, ...walls],
    spawns,
    towers: pick('towers') ?? def.towers,
    controllerHomes: pick('controllerHomes') ?? def.controllerHomes,
    bombSites: pick('bombSites') ?? def.bombSites,
  };
  if (def.waypoints?.length) {
    const { waypoints } = prunedWaypoints(
      def.waypoints,
      walls,
      spawns.map((s) => s.pos),
    );
    out.waypoints = waypoints;
    // power-ups and dev teleports: only where a kept waypoint is near (a closed room keeps none)
    const open = (p: Vec3, pad: number) =>
      !insideWalls(p, walls, pad) &&
      waypoints.some((w) => dist2(w.pos, p) < 14 * 14 && !linkCrossesWalls(w.pos, p, walls));
    if (def.powerups) out.powerups = def.powerups.filter((p) => open(p, 0));
    if (def.areas) out.areas = def.areas.filter((a) => open(a.pos, 0.5));
  } else if (def.areas) out.areas = def.areas.filter((a) => !insideWalls(a.pos, walls, 0.5));
  return out;
};
