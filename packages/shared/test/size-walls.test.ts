// Smaller teams play a smaller map (level/size-walls.ts): the force-field walls each map adds for
// small teams really close what they should, keep what must stay open, and nothing slips past.
import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  applyBotObjectives,
  BOT_SKILLS,
  botThink,
  buildLevel,
  capsuleOverlaps,
  createBotMemory,
  createMatch,
  createPlayer,
  createWorld,
  defaultConfig,
  insideWalls,
  lineOfSight,
  linkCrossesWalls,
  mapDef,
  mapDefForSize,
  raycast,
  sizeWallBoxes,
  startMatch,
  step,
  TICK_DT,
  updateMatch,
  v3,
  type BoxDef,
  type Level,
  type LevelDef,
  type SimContext,
  type Vec3,
  type WaypointDef,
} from '../src/index';

type MapId = 'split-deck' | 'kestrel' | 'orbital-ring' | 'canyon-relay';
const IDS: MapId[] = ['split-deck', 'kestrel', 'orbital-ring', 'canyon-relay'];
const SIZES = [1, 2, 3, 4, 5];
const ALL = 1e4;

interface Aabb {
  min: Vec3;
  max: Vec3;
}
const aabb = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Aabb => ({
  min: v3(x0, y0, z0),
  max: v3(x1, y1, z1),
});
const inside = (p: Vec3, b: Aabb) =>
  p.x >= b.min.x &&
  p.x <= b.max.x &&
  p.y >= b.min.y &&
  p.y <= b.max.y &&
  p.z >= b.min.z &&
  p.z <= b.max.z;

/**
 * Each map's middle (1v1 / 2v2 play there): every way from a spawn to the enemy Tower must pass
 * through it. All heights.
 */
const MIDDLE: Record<MapId, Aabb[]> = {
  // the atrium with the gantry strip, and the pit under it
  'split-deck': [aabb(43, -ALL, 35, 85, ALL, 63)],
  // the reactor room
  kestrel: [aabb(-21, -ALL, -19, 21, ALL, 19)],
  // the ring hall with the core, the pit and the tunnels under it
  'orbital-ring': [aabb(32, -ALL, 31, 88, ALL, 89)],
  // the gorge crossings: bridges, relay rock, launch pad flights
  'canyon-relay': [aabb(-ALL, -ALL, 42, ALL, ALL, 58)],
};

/** the mirror image of a point (symmetric maps) */
const MIRROR: Partial<Record<MapId, (p: Vec3) => Vec3>> = {
  kestrel: (p) => v3(-p.x, p.y, p.z),
  'orbital-ring': (p) => v3(p.x, p.y, 120 - p.z),
  'canyon-relay': (p) => v3(p.x, p.y, 100 - p.z),
};

const sized = (id: MapId, n: number) => mapDefForSize(id, n);
const walls = (id: MapId, n: number) => sizeWallBoxes(mapDef(id), n);

const levels = new Map<string, Level>();
const levelFor = (id: MapId, n: number): Level => {
  const k = `${id}@${n}`;
  let lv = levels.get(k);
  if (!lv) levels.set(k, (lv = buildLevel(sized(id, n))));
  return lv;
};

const up = (p: Vec3, dy: number) => v3(p.x, p.y + dy, p.z);
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * The waypoint nearest to `p` (feet) that someone standing there can see (within 16 m; else the
 * nearest one: spawns up on Kestrel's ready deck); for a Tower (`p` inside its block) the nearest
 * one within 8 m.
 */
const nearestWp = (d: LevelDef, lv: Level, p: Vec3, tower = false): number => {
  const near = (sight: boolean, maxD: number) => {
    let best = -1;
    let bd = Infinity;
    d.waypoints!.forEach((w, i) => {
      const dd = dist(w.pos, up(p, 1));
      if (dd < bd && dd < maxD && (!sight || lineOfSight(lv, up(p, 1), w.pos))) {
        bd = dd;
        best = i;
      }
    });
    return best;
  };
  if (tower) return near(false, 8);
  const i = near(true, 16);
  return i >= 0 ? i : near(false, 16);
};

/** waypoints reachable from `from` along the links, skipping `removed` */
const reach = (wps: WaypointDef[], from: number, removed = new Set<number>()): Set<number> => {
  const seen = new Set<number>([from]);
  const stack = [from];
  while (stack.length) {
    const i = stack.pop()!;
    for (const j of wps[i].links)
      if (!seen.has(j) && !removed.has(j)) {
        seen.add(j);
        stack.push(j);
      }
  }
  return seen;
};

const siteCentre = (s: { min: Vec3; max: Vec3 }) =>
  v3((s.min.x + s.max.x) / 2, s.min.y, (s.min.z + s.max.z) / 2);

const standing = (feet: Vec3) => ({
  center: v3(feet.x, feet.y + 0.9, feet.z),
  up: v3(0, 1, 0),
  halfSeg: 0.45,
  radius: 0.4,
});

/** the box a player dies outside of (sim/world.ts: 20 m past the bounds) */
const killBox = (d: LevelDef): Aabb => ({
  min: v3(d.boundsMin.x - 20, d.boundsMin.y - 20, d.boundsMin.z - 20),
  max: v3(d.boundsMax.x + 20, d.boundsMax.y + 20, d.boundsMax.z + 20),
});

/** a wall's world AABB (walls are axis-aligned panels) */
const box3 = (b: BoxDef): Aabb => ({
  min: v3(b.c.x - b.h.x, b.c.y - b.h.y, b.c.z - b.h.z),
  max: v3(b.c.x + b.h.x, b.c.y + b.h.y, b.c.z + b.h.z),
});

/** how high above its floor anyone gets beside a wall: jump + jetpack + wall-jumps + a climb */
const REACH = 9;

describe('size walls: smaller teams play a smaller map', () => {
  it.each(IDS)('%s: 4v4 and 5v5 play the unchanged map; smaller sizes add walls', (id) => {
    const base = mapDef(id);
    expect(base.sizeWalls?.length).toBeGreaterThan(0);
    for (const n of [4, 5]) {
      expect(sized(id, n)).toBe(base);
      expect(sized(id, n).boxes.some((b) => b.mat === 'forcefield')).toBe(false);
    }
    // no layer above 3
    expect(Math.max(...base.sizeWalls!.map((l) => l.maxTeamSize))).toBeLessThanOrEqual(3);
    for (const n of [1, 2, 3]) {
      const d = sized(id, n);
      const w = walls(id, n);
      expect(w.length).toBeGreaterThan(0);
      // the map's own boxes come first, untouched; then the walls
      expect(d.boxes.slice(0, base.boxes.length)).toEqual(base.boxes);
      expect(d.boxes.length).toBe(base.boxes.length + w.length);
      expect(d.boxes.slice(base.boxes.length).every((b) => b.mat === 'forcefield')).toBe(true);
      // thin axis-aligned panels
      for (const b of w) {
        expect(b.q).toBeUndefined();
        expect(Math.min(b.h.x, b.h.z)).toBeLessThanOrEqual(0.25);
      }
    }
    // layers stack: 1v1 has at least 2v2's walls, 2v2 at least 3v3's
    expect(walls(id, 1).length).toBe(walls(id, 2).length);
    expect(walls(id, 2).length).toBeGreaterThan(walls(id, 3).length);
  });

  describe.each(IDS)('%s', (id) => {
    it.each(SIZES)(
      'size %i: spawns, Towers and bomb sites are open and reachable along the bot graph',
      (n) => {
        const d = sized(id, n);
        const lv = levelFor(id, n);
        const w = walls(id, n);
        const wps = d.waypoints!;
        for (const s of d.spawns) {
          expect(insideWalls(s.pos, w, 0.5), `spawn ${s.pos.x},${s.pos.z}`).toBe(false);
          expect(capsuleOverlaps(lv, standing(s.pos))).toBe(false);
        }
        for (const t of d.towers) expect(insideWalls(t.pos, w, t.radius + 1)).toBe(false);
        for (const h of d.controllerHomes ?? []) expect(insideWalls(h, w, 1)).toBe(false);
        const targets: [string, Vec3, boolean][] = [
          ...d.towers.map((t): [string, Vec3, boolean] => [`Tower ${t.team}`, t.pos, true]),
          ...(d.bombSites ?? []).map((s): [string, Vec3, boolean] => [
            `site ${s.name}`,
            siteCentre(s),
            false,
          ]),
        ];
        for (const s of d.bombSites ?? []) {
          const c = siteCentre(s);
          expect(insideWalls(up(c, 1), w, 1), `site ${s.name}`).toBe(false);
          // floor under the middle of the site
          expect(raycast(lv, up(c, 1), v3(0, -1, 0), 2)?.point.y).toBeCloseTo(s.min.y, 1);
        }
        for (const team of [0, 1] as const)
          for (const s of d.spawns.filter((sp) => sp.team === team)) {
            const from = nearestWp(d, lv, s.pos);
            expect(from, `spawn ${s.pos.x},${s.pos.z}`).toBeGreaterThanOrEqual(0);
            const r = reach(wps, from);
            for (const [name, p, tower] of targets) {
              const to = nearestWp(d, lv, p, tower);
              expect(to, `${name} has a waypoint`).toBeGreaterThanOrEqual(0);
              expect(r.has(to), `team ${team} reaches ${name}`).toBe(true);
            }
          }
      },
    );

    it.each([1, 2])(
      'size %i: every way from a spawn to the enemy Tower runs through the middle',
      (n) => {
        const d = sized(id, n);
        const lv = levelFor(id, n);
        const wps = d.waypoints!;
        const middle = new Set<number>();
        wps.forEach((w, i) => {
          if (MIDDLE[id].some((m) => inside(w.pos, m))) middle.add(i);
        });
        expect(middle.size).toBeGreaterThan(0);
        for (const team of [0, 1] as const) {
          const s = d.spawns.find((sp) => sp.team === team)!;
          const enemy = d.towers.find((t) => t.team !== team)!;
          const from = nearestWp(d, lv, s.pos);
          const to = nearestWp(d, lv, enemy.pos, true);
          expect(reach(wps, from).has(to)).toBe(true);
          expect(reach(wps, from, middle).has(to), `team ${team} walks round the middle`).toBe(
            false,
          );
        }
      },
    );

    it('size 3: at least two separate ways to each enemy Tower and each bomb site', () => {
      // no single waypoint away from both ends cuts a spawn off from a target
      const n = 3;
      const d = sized(id, n);
      const lv = levelFor(id, n);
      const wps = d.waypoints!;
      const R = 12;
      for (const team of [0, 1] as const) {
        const s = d.spawns.find((sp) => sp.team === team)!;
        const from = nearestWp(d, lv, s.pos);
        const targets: [string, Vec3, boolean][] = [
          ['enemy Tower', d.towers.find((t) => t.team !== team)!.pos, true],
          ...(d.bombSites ?? []).map((st): [string, Vec3, boolean] => [
            `site ${st.name}`,
            siteCentre(st),
            false,
          ]),
        ];
        for (const [name, p, tower] of targets) {
          const to = nearestWp(d, lv, p, tower);
          expect(from).toBeGreaterThanOrEqual(0);
          expect(to).toBeGreaterThanOrEqual(0);
          wps.forEach((w, i) => {
            if (dist(w.pos, wps[from].pos) < R || dist(w.pos, wps[to].pos) < R) return;
            expect(
              reach(wps, from, new Set([i])).has(to),
              `team ${team} → ${name}: everything runs through ${w.name ?? i}`,
            ).toBe(true);
          });
        }
      }
    });

    it.each([1, 2, 3])('size %i: every bot link the walls cut is really blocked', (n) => {
      const orig = mapDef(id).waypoints!;
      const w = walls(id, n);
      const lv = levelFor(id, n);
      let cut = 0;
      orig.forEach((a, i) => {
        for (const j of a.links) {
          const b = orig[j];
          if (!linkCrossesWalls(a.pos, b.pos, w)) continue;
          cut++;
          for (const dy of [-0.5, 0, 0.8])
            expect(
              lineOfSight(lv, up(a.pos, dy), up(b.pos, dy)),
              `${a.name ?? i} → ${b.name ?? j}`,
            ).toBe(false);
        }
      });
      expect(cut).toBeGreaterThan(0);
    });

    it.each([1, 2, 3])('size %i: nothing in the open part sees into the closed part', (n) => {
      const orig = mapDef(id).waypoints!;
      const kept = sized(id, n).waypoints!;
      const lv = levelFor(id, n);
      const keptPos = new Set(kept.map((k) => k.pos));
      const closed = orig.filter((o) => !keptPos.has(o.pos));
      if (n <= 2) expect(closed.length).toBeGreaterThan(0);
      for (const o of kept)
        for (const c of closed) {
          if (dist(o.pos, c.pos) > 70) continue;
          for (const dy of [0, 0.7])
            expect(lineOfSight(lv, up(o.pos, dy), up(c.pos, dy)), `${o.name} sees ${c.name}`).toBe(
              false,
            );
        }
    });

    it.each([1, 2, 3])(
      'size %i: no gap round, under or over a wall (rays across it and just past its edges)',
      (n) => {
        const d = sized(id, n);
        const lv = levelFor(id, n);
        const kb = killBox(d);
        for (const wb of walls(id, n)) {
          const b = box3(wb);
          const thin: 'x' | 'z' = wb.h.x < wb.h.z ? 'x' : 'z';
          const lat: 'x' | 'z' = thin === 'x' ? 'z' : 'x';
          const l0 = b.min[lat] - 0.25;
          const l1 = b.max[lat] + 0.25;
          // from the floor in front of it (or its own bottom, a wall under the map)
          const front = v3(wb.c.x, Math.min(b.max.y - 0.3, d.boundsMax.y), wb.c.z);
          front[thin] = b.min[thin] - 0.6;
          const floor = raycast(lv, front, v3(0, -1, 0), 200)?.point.y ?? b.min.y;
          const y0 = Math.max(b.min.y, floor) + 0.2;
          const y1 = Math.min(b.max.y + 0.25, y0 + REACH);
          const nl = Math.max(2, Math.ceil((l1 - l0) / 0.5));
          const ny = Math.max(2, Math.ceil((y1 - y0) / 0.5));
          const probe = (l: number, y: number) => {
            const a = v3(0, y, 0);
            const c = v3(0, y, 0);
            a[lat] = l;
            c[lat] = l;
            a[thin] = b.min[thin] - 0.6;
            c[thin] = b.max[thin] + 0.6;
            if (!inside(a, kb) || !inside(c, kb)) return;
            expect(
              lineOfSight(lv, a, c),
              `past the wall at ${wb.c.x},${wb.c.y},${wb.c.z}: ${lat} ${l.toFixed(2)}, y ${y.toFixed(2)}`,
            ).toBe(false);
          };
          for (let i = 0; i <= nl; i++)
            for (let k = 0; k <= ny; k++)
              probe(l0 + ((l1 - l0) * i) / nl, y0 + ((y1 - y0) * k) / ny);
          // right over the top and under the bottom: solid, or out of the map
          const mid = (b.min[lat] + b.max[lat]) / 2;
          probe(mid, b.max.y + 0.15);
          probe(mid, Math.max(b.min.y, floor) - 0.15);
        }
      },
    );

    it('keeps each layer’s bot graph links clear of every wall', () => {
      for (const n of [1, 2, 3]) {
        const d = sized(id, n);
        const w = walls(id, n);
        for (const a of d.waypoints!) {
          expect(insideWalls(a.pos, w)).toBe(false);
          for (const j of a.links)
            expect(linkCrossesWalls(a.pos, d.waypoints![j].pos, w)).toBe(false);
        }
      }
    });
  });

  it.each(IDS.filter((id) => MIRROR[id]))(
    '%s: the walls and moved sites are mirror images',
    (id) => {
      const mir = MIRROR[id]!;
      const k = (p: Vec3) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
      const keyOf = (b: Aabb) => `${k(b.min)}|${k(b.max)}`;
      const mirrorBox = (b: Aabb): Aabb => {
        const p = mir(b.min);
        const q = mir(b.max);
        return {
          min: v3(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.min(p.z, q.z)),
          max: v3(Math.max(p.x, q.x), Math.max(p.y, q.y), Math.max(p.z, q.z)),
        };
      };
      for (const layer of mapDef(id).sizeWalls!) {
        const keys = new Set(layer.boxes.map((b) => keyOf(box3(b))));
        for (const b of layer.boxes) expect(keys.has(keyOf(mirrorBox(box3(b))))).toBe(true);
        // moved sites: each one's mirror image is a site (itself or the other one)
        const sites = new Set((layer.bombSites ?? []).map((s) => keyOf(s)));
        for (const s of layer.bombSites ?? []) expect(sites.has(keyOf(mirrorBox(s)))).toBe(true);
      }
    },
  );

  it('Canyon Relay 1v1 / 2v2: the curtains cut the whole map (no way over, under or round)', () => {
    const d = sized('canyon-relay', 2);
    const w = walls('canyon-relay', 2);
    const kb = killBox(d);
    for (const x of [99.7, 20.3])
      for (let z = kb.min.z; z <= kb.max.z; z += 1)
        for (let y = kb.min.y; y <= kb.max.y; y += 1)
          expect(insideWalls(v3(x, y, z), w), `x ${x}, y ${y}, z ${z}`).toBe(true);
  });
});

describe('size walls: bots play the small maps', () => {
  // Tower mode, 1v1: a bot carries the Controller from its spawn to the enemy Tower
  it.each(IDS.flatMap((id) => ([0, 1] as const).map((team) => [id, team] as const)))(
    '%s 1v1: a bot of team %i takes the Controller to the enemy Tower',
    (id, team) => {
      const config = defaultConfig();
      const lv = buildLevel(sized(id, 1));
      const ctx: SimContext = { level: lv, config, dt: TICK_DT };
      const world = createWorld(lv, 5);
      const s = lv.def.spawns.find((sp) => sp.team === team)!;
      addPlayer(world, createPlayer(1, team, s.pos, s.yawDeg, config));
      const mem = createBotMemory(1, BOT_SKILLS.normal, 5);
      const ms = createMatch('1v1');
      startMatch(ms, world, ctx);
      for (let t = 0; t < 60 * 60 && ms.phase !== 'roundEnd'; t++) {
        applyBotObjectives(ms, world, ctx, [mem]);
        step(world, { 1: botThink(world, ctx, world.players[0], mem) }, ctx);
        updateMatch(ms, world, ctx);
      }
      expect(ms.rounds[0]?.reason).toBe('tower');
      expect(ms.rounds[0]?.winner).toBe(team);
    },
  );

  // Bomb mode, 1v1: a bot walks from its spawn onto each moved site
  const siteWalks = IDS.flatMap((id) =>
    (sized(id, 1).bombSites ?? []).flatMap((s) =>
      ([0, 1] as const).map((team) => [id, team, s.name] as const),
    ),
  );
  it.each(siteWalks)('%s 1v1: a bot of team %i walks onto site %s', (id, team, name) => {
    const config = defaultConfig();
    const d = sized(id, 1);
    const lv = buildLevel(d);
    const ctx: SimContext = { level: lv, config, dt: TICK_DT };
    const world = createWorld(lv, 9);
    const s = d.spawns.find((sp) => sp.team === team)!;
    const p = addPlayer(world, createPlayer(1, team, s.pos, s.yawDeg, config));
    const mem = createBotMemory(1, BOT_SKILLS.normal, 9);
    const site = d.bombSites!.find((x) => x.name === name)!;
    const goal = siteCentre(site);
    mem.objective = goal;
    mem.objectiveFirst = true;
    let arrived = false;
    for (let t = 0; t < 60 * 45 && !arrived; t++) {
      step(world, { 1: botThink(world, ctx, p, mem) }, ctx);
      arrived = inside(p.pos, {
        min: v3(site.min.x, site.min.y - 1, site.min.z),
        max: v3(site.max.x, site.max.y, site.max.z),
      });
    }
    expect(arrived).toBe(true);
  });
});
