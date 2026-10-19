// Grayboxes (level/graybox.ts): redesigned layouts built from their checked tile grids. The
// Split Deck graybox is the first: it must be walkable (steps, both sites, both spawns), its
// bots must find their way, smaller teams' force fields must leave the objectives open, and it
// must stay out of every queue until it gets real geometry.
import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  BOT_SKILLS,
  botThink,
  buildGraybox,
  buildLevel,
  capsuleOverlaps,
  createBotMemory,
  createPlayer,
  createWorld,
  defaultConfig,
  getMap,
  mapDef,
  mapDefForSize,
  pointInAabb,
  raycast,
  SPLIT_DECK_LAYOUT,
  step,
  TICK_DT,
  v3,
  waypointRoute,
  type SimContext,
  type Vec3,
} from '../src/index';
import { brawlMaps } from '../src/rules/brawl';

const ID = 'split-deck-graybox';
const down = v3(0, -1, 0);

describe('Split Deck graybox', () => {
  it('is a graybox map: practice and custom rooms, never the Brawl rotation', () => {
    const m = getMap(ID);
    expect(m.id).toBe(ID);
    expect(m.competitive).toBe(true);
    expect(m.graybox).toBe(true);
    expect(brawlMaps().map((b) => b.id)).not.toContain(ID);
  });

  it('builds the layout: both sites, 8 spawns and a Tower per team, a teleport per callout', () => {
    const d = mapDef(ID);
    expect(d.bombSites?.map((s) => s.name).sort()).toEqual(['A', 'B']);
    for (const team of [0, 1] as const) {
      expect(d.spawns.filter((s) => s.team === team)).toHaveLength(8);
      expect(d.towers.filter((t) => t.team === team)).toHaveLength(1);
    }
    expect(d.areas?.map((a) => a.name)).toEqual(
      expect.arrayContaining(['A Deck', 'B Hold', 'Mid Hall', 'Catwalk', 'A Long', 'B Tunnels']),
    );
    // a layout with a missing legend entry is refused, not silently built
    expect(() =>
      buildGraybox({
        ...SPLIT_DECK_LAYOUT,
        legend: { ...SPLIT_DECK_LAYOUT.legend, M: undefined! },
      }),
    ).toThrow(/legend/);
  });

  it('spawns stand on floor with room to stand', () => {
    const lv = buildLevel(mapDef(ID));
    for (const s of lv.def.spawns) {
      const hit = raycast(lv, v3(s.pos.x, s.pos.y + 0.5, s.pos.z), down, 1);
      expect(hit, `floor under ${JSON.stringify(s.pos)}`).not.toBeNull();
      const center = v3(s.pos.x, s.pos.y + 0.95, s.pos.z);
      expect(
        capsuleOverlaps(lv, { center, up: v3(0, 1, 0), halfSeg: 0.45, radius: 0.35 }, 0.05),
      ).toBe(false);
    }
  });

  it('every stair step is a walkable step (no higher than the step-up height)', () => {
    const lv = buildLevel(mapDef(ID));
    const stepUp = defaultConfig().movement.stepHeight;
    expect(lv.def.boxes.filter((b) => b.mat === 'grate').length).toBeGreaterThan(40);
    const s = SPLIT_DECK_LAYOUT.cellM;
    const rows = SPLIT_DECK_LAYOUT.layers[0].rows;
    // walk each straight flight along its rising direction, a quarter metre at a time (inside
    // the stair cells: the Catwalk overhangs the foot of A Short)
    for (const [c, a] of Object.entries(SPLIT_DECK_LAYOUT.legend)) {
      // (gravity areas are zero-G vents, not stairs)
      if (!a.dir || !a.r || (a.k === 'gravity' && a.g !== 'stairs')) continue;
      const [lo, hi] = a.r;
      const alongX = a.dir === 'e' || a.dir === 'w';
      const cells = rows.flatMap((r, y) => [...r].flatMap((ch, x) => (ch === c ? [[x, y]] : [])));
      const lanes = new Map<number, number[]>();
      for (const [x, y] of cells) {
        const lane = alongX ? y : x;
        lanes.set(lane, [...(lanes.get(lane) ?? []), alongX ? x : y]);
      }
      for (const [lane, at] of lanes) {
        const heights: number[] = [];
        for (let u = Math.min(...at) * s + 0.05; u < (Math.max(...at) + 1) * s; u += 0.25) {
          const [px, pz] = alongX ? [u, (lane + 0.5) * s] : [(lane + 0.5) * s, u];
          const hit = raycast(lv, v3(px, hi + 0.3, pz), down, hi - lo + 2);
          expect(hit, `${a.n}: floor at ${px.toFixed(2)},${pz.toFixed(2)}`).not.toBeNull();
          heights.push(hit!.point.y);
        }
        for (let i = 1; i < heights.length; i++)
          expect(Math.abs(heights[i] - heights[i - 1]), `${a.n} step ${i}`).toBeLessThanOrEqual(
            stepUp,
          );
        // the first and last steps meet the floors at either end
        expect(Math.min(...heights) - lo).toBeLessThanOrEqual(stepUp);
        expect(hi - Math.max(...heights)).toBeLessThanOrEqual(stepUp);
      }
    }
  });

  it('bot waypoints: every one reachable from both spawns, links between neighbours only', () => {
    const d = mapDef(ID);
    const wps = d.waypoints!;
    const nearest = (p: Vec3) =>
      wps.reduce(
        (b, w, i) =>
          Math.hypot(w.pos.x - p.x, w.pos.y - 1 - p.y, w.pos.z - p.z) <
          Math.hypot(wps[b].pos.x - p.x, wps[b].pos.y - 1 - p.y, wps[b].pos.z - p.z)
            ? i
            : b,
        0,
      );
    for (const team of [0, 1] as const) {
      const from = nearest(d.spawns.find((s) => s.team === team)!.pos);
      for (let i = 0; i < wps.length; i++)
        expect(waypointRoute(wps, from, i).length, `team ${team} → ${wps[i].name}`).toBeGreaterThan(
          0,
        );
    }
    for (const w of wps)
      for (const j of w.links)
        expect(Math.hypot(w.pos.x - wps[j].pos.x, w.pos.z - wps[j].pos.z)).toBeLessThanOrEqual(
          SPLIT_DECK_LAYOUT.cellM + 0.01,
        );
  });

  it.each([
    ['Cyan', 0, 'A'],
    ['Cyan', 0, 'B'],
    ['Orange', 1, 'A'],
    ['Orange', 1, 'B'],
  ] as const)('a %s bot walks from spawn onto site %s', (_n, team, site) => {
    const config = defaultConfig();
    const lv = buildLevel(mapDef(ID));
    const ctx: SimContext = { level: lv, config, dt: TICK_DT };
    const world = createWorld(lv, 3);
    const s = lv.def.spawns.find((sp) => sp.team === team)!;
    const p = addPlayer(world, createPlayer(1, team, s.pos, s.yawDeg, config));
    const mem = createBotMemory(1, BOT_SKILLS.normal, 3);
    const zone = lv.def.bombSites!.find((b) => b.name === site)!;
    mem.objective = v3(
      (zone.min.x + zone.max.x) / 2,
      zone.min.y + 0.5,
      (zone.min.z + zone.max.z) / 2,
    );
    mem.objectiveFirst = true;
    let arrived = false;
    for (let t = 0; t < 60 * 40 && !arrived; t++) {
      step(world, { 1: botThink(world, ctx, p, mem) }, ctx);
      arrived = pointInAabb(p.pos, zone.min, zone.max);
    }
    expect(arrived).toBe(true);
  });

  it('3v3 and smaller: force fields close the east long route, spawns and sites stay open', () => {
    const full = mapDef(ID);
    const small = mapDefForSize(ID, 3);
    expect(small.boxes.length).toBeGreaterThan(full.boxes.length);
    expect(mapDefForSize(ID, 5).boxes.length).toBe(full.boxes.length);
    const lv = buildLevel(small);
    const fields = small.boxes.filter((b) => b.mat === 'forcefield');
    const inField = (p: Vec3) =>
      fields.some(
        (b) =>
          Math.abs(p.x - b.c.x) < b.h.x &&
          Math.abs(p.y - b.c.y) < b.h.y &&
          Math.abs(p.z - b.c.z) < b.h.z,
      );
    for (const sp of small.spawns)
      expect(inField(v3(sp.pos.x, sp.pos.y + 1, sp.pos.z))).toBe(false);
    for (const z of small.bombSites!)
      expect(inField(v3((z.min.x + z.max.x) / 2, z.min.y + 1.5, (z.min.z + z.max.z) / 2))).toBe(
        false,
      );
    // the smaller map's bots still reach both sites from both spawns
    const wps = small.waypoints!;
    for (const team of [0, 1] as const) {
      const sp = small.spawns.find((s) => s.team === team)!.pos;
      const from = wps.findIndex(
        (w) =>
          Math.hypot(w.pos.x - sp.x, w.pos.z - sp.z) < 2.9 && Math.abs(w.pos.y - 1 - sp.y) < 0.5,
      );
      expect(from).toBeGreaterThanOrEqual(0);
      for (const z of small.bombSites!) {
        const to = wps.findIndex((w) =>
          pointInAabb(v3(w.pos.x, w.pos.y - 0.9, w.pos.z), z.min, z.max),
        );
        expect(waypointRoute(wps, from, to).length, `team ${team} → ${z.name}`).toBeGreaterThan(0);
      }
    }
    expect(lv.boxes.length).toBeGreaterThan(0);
  });
});
