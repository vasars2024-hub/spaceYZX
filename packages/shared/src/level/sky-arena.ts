// The "sky duel" overtime arena (rules/match.ts): a few floating platforms high above the ship,
// in the open sky on every side. Fall off and you're gone. Added to the competitive maps by
// the map registry (maps/index.ts), so it is part of every match level's collision.
//
// Layout (top view, x across, z up; the main platform's top is the arena centre, y = 0):
//
//            [corner]      [ side pad  ]      [corner]        corner pads: top +3 m
//                     +----------------------+
//   [end pad]  A A    |  c    [perch]    c   |    B B  [end pad]   end pads: top +1 m
//   (top +1)   A A    |      [| wall |]      |    B B              perch over the middle: +6 m
//                     |  c               c   |                     c: low crates (cover)
//                     +----------------------+
//            [corner]      [ side pad  ]      [corner]        side pads: top +1.5 m
//
// Team A (cyan, team 0) starts at the -x end, team B (orange, team 1) at the +x end. The
// layout is a mirror image across the arena's own x = 0, so mirrored maps (Kestrel) stay
// mirror-symmetric.
import type { Vec3 } from '../math/vec3';
import { v3 } from '../math/vec3';
import type { BoxDef, LevelDef, Material, SkyArenaDef, SpawnDef } from './types';

/** How far above the ship's top the arena floats. */
export const SKY_ARENA_HEIGHT = 250;
/**
 * Everything higher than this below the arena's floor counts as "up in the sky": the ship's
 * fell-out-of-bounds rescue leaves you alone there (you fall to your death instead), and the
 * sky jetpack is on (sim/movement.ts). Deeper than the fall-death line (rules skyFallKillDepth).
 */
export const SKY_ZONE_DEPTH = 60;

const box = (min: Vec3, max: Vec3, mat: Material): BoxDef => ({
  c: v3((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2),
  h: v3((max.x - min.x) / 2, (max.y - min.y) / 2, (max.z - min.z) / 2),
  mat,
});

/** The arena around `c` (the main platform's top centre). */
export const buildSkyArena = (c: Vec3): SkyArenaDef => {
  const boxes: BoxDef[] = [];
  const add = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    m: Material,
  ) => boxes.push(box(v3(c.x + x0, c.y + y0, c.z + z0), v3(c.x + x1, c.y + y1, c.z + z1), m));
  // main platform 30 × 18 m
  add(-15, -1, -9, 15, 0, 9, 'plate');
  // cover: two low walls in the middle (crouch behind them, no tall pillar) and four crates
  for (const sx of [-1, 1]) add(sx * 2 - 0.4, 0, -2, sx * 2 + 0.4, 1.2, 2, 'panel');
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      add(sx * 7 - 0.7, 0, sz * 4.5 - 1.3, sx * 7 + 0.7, 1.3, sz * 4.5 + 1.3, 'crate');
  // perch floating over the middle (jetpack up to it)
  add(-2.5, 5.6, -2.5, 2.5, 6, 2.5, 'grate');
  // side pads (2.5 m gap, a bit higher), end pads behind each team's start, corner pads
  for (const sz of [-1, 1]) {
    const z0 = sz > 0 ? 11.5 : -16.5;
    add(-4, 0.9, z0, 4, 1.5, z0 + 5, 'grate');
  }
  for (const sx of [-1, 1]) {
    const x0 = sx > 0 ? 18 : -23;
    add(x0, 0.4, -3, x0 + 5, 1, 3, 'grate');
    for (const sz of [-1, 1]) {
      const z0 = sz > 0 ? 10.5 : -13.5;
      const cx0 = sx > 0 ? 18.5 : -21.5;
      add(cx0, 2.5, z0, cx0 + 3, 3, z0 + 3, 'grate');
    }
  }
  // starts: each team in a line across its end of the main platform, facing the other end
  // (yaw 90 faces -x, -90 faces +x)
  const spawns: SpawnDef[] = [];
  for (const team of [0, 1] as const)
    for (const z of [0, -3, 3, -6, 6])
      spawns.push({
        pos: v3(c.x + (team === 0 ? -12 : 12), c.y, c.z + z),
        yawDeg: team === 0 ? -90 : 90,
        team,
      });
  return { center: clone3(c), radius: 24, boxes, spawns };
};

const clone3 = (p: Vec3): Vec3 => v3(p.x, p.y, p.z);

/** The level with a sky arena floating SKY_ARENA_HEIGHT above the middle of its top. */
export const withSkyArena = (def: LevelDef): LevelDef => {
  const c = v3(
    (def.boundsMin.x + def.boundsMax.x) / 2,
    def.boundsMax.y + SKY_ARENA_HEIGHT,
    (def.boundsMin.z + def.boundsMax.z) / 2,
  );
  return { ...def, skyArena: buildSkyArena(c) };
};

/** Is this point up in the sky around the arena (not in or near the ship)? */
export const inSkyZone = (def: LevelDef, pos: Vec3): boolean => {
  const a = def.skyArena;
  return !!a && pos.y >= a.center.y - SKY_ZONE_DEPTH;
};
