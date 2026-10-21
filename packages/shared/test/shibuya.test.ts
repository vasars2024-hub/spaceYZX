// Shibuya (level/maps/graybox/shibuya.ts), the royale mega map: about 1 km across and centred on
// the origin (the network sends positions within ±512 m), royale spawns spread over the whole
// city on floors with room to stand, every one of them connected to the Scramble Crossing (the
// zone's centre) by the bots' waypoints, and bots actually walking there without getting stuck.
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
  getMap,
  mapDef,
  pointInAabb,
  raycast,
  step,
  TICK_DT,
  v3,
  type SimContext,
  type Vec3,
} from '../src/index';

const def = () => mapDef('shibuya');
const flat = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);

describe('Shibuya (royale mega map)', () => {
  it('is a royale map, not a competitive one, about 10× a normal map and inside the network range', () => {
    const m = getMap('shibuya');
    expect(m.id).toBe('shibuya');
    expect(m.royale).toBe(true);
    expect(m.competitive).toBe(false);
    const d = def();
    const w = d.boundsMax.x - d.boundsMin.x;
    const h = d.boundsMax.z - d.boundsMin.z;
    expect(w).toBeGreaterThanOrEqual(900);
    expect(w).toBeLessThanOrEqual(1100);
    expect(h).toBeGreaterThanOrEqual(900);
    for (const v of [d.boundsMin, d.boundsMax])
      for (const c of [v.x, v.y, v.z]) expect(Math.abs(c)).toBeLessThanOrEqual(500);
    expect(d.bombSites ?? []).toEqual([]);
    // (a big map, but not a heavy one)
    expect(d.boxes.length).toBeLessThan(16000);
  });

  it('has 10–12 royale spawns, far apart, and a zone covering the whole city', () => {
    const r = def().royale!;
    expect(r.spawns.length).toBeGreaterThanOrEqual(10);
    expect(r.spawns.length).toBeLessThanOrEqual(12);
    for (let i = 0; i < r.spawns.length; i++)
      for (let j = i + 1; j < r.spawns.length; j++)
        expect(flat(r.spawns[i].pos, r.spawns[j].pos), `spawns ${i} and ${j}`).toBeGreaterThan(240);
    const d = def();
    for (const [x, z] of [
      [d.boundsMin.x, d.boundsMin.z],
      [d.boundsMin.x, d.boundsMax.z],
      [d.boundsMax.x, d.boundsMin.z],
      [d.boundsMax.x, d.boundsMax.z],
    ])
      expect(Math.hypot(x - r.center.x, z - r.center.z)).toBeLessThanOrEqual(r.radius);
  });

  it('every royale spawn stands on a floor with room to stand', () => {
    const d = def();
    const lv = buildLevel(d);
    const m = defaultConfig().movement;
    for (const s of d.royale!.spawns) {
      const hit = raycast(lv, v3(s.pos.x, s.pos.y + 0.3, s.pos.z), v3(0, -1, 0), 0.6);
      expect(hit, `floor under ${JSON.stringify(s.pos)}`).not.toBeNull();
      const center = v3(s.pos.x, s.pos.y + m.standHeight / 2 + 0.05, s.pos.z);
      expect(
        capsuleOverlaps(lv, {
          center,
          up: v3(0, 1, 0),
          halfSeg: m.standHeight / 2 - m.radius,
          radius: m.radius,
        }),
        `room at ${JSON.stringify(s.pos)}`,
      ).toBe(false);
      for (const k of d.killVolumes ?? []) expect(pointInAabb(s.pos, k.min, k.max)).toBe(false);
    }
  });

  it('every royale spawn reaches the Scramble Crossing by bot waypoints', () => {
    const d = def();
    const wps = d.waypoints!;
    const nearest = (p: Vec3) => {
      let best = 0;
      let bd = Infinity;
      wps.forEach((w, i) => {
        const dist = Math.hypot(w.pos.x - p.x, w.pos.y - (p.y + 1), w.pos.z - p.z);
        if (dist < bd) [bd, best] = [dist, i];
      });
      return best;
    };
    const goal = nearest(d.royale!.center);
    for (const s of d.royale!.spawns) {
      // (a plain search over the links: the bots' own route search is too slow for 11 × 16k)
      const seen = new Uint8Array(wps.length);
      const queue = [nearest(s.pos)];
      seen[queue[0]] = 1;
      for (let k = 0; k < queue.length && !seen[goal]; k++)
        for (const v of wps[queue[k]].links)
          if (!seen[v]) {
            seen[v] = 1;
            queue.push(v);
          }
      expect(seen[goal], `from ${JSON.stringify(s.pos)}`).toBe(1);
    }
  });

  // three spawns at different distances and heights: the hill (8 m), the river (−4 m), the east
  const walks = [4, 5, 10];
  it.each(walks)(
    'a bot walks from royale spawn %i toward the crossing for 60 s without getting stuck',
    (i) => {
      const config = defaultConfig();
      const lv = buildLevel(def());
      const ctx: SimContext = { level: lv, config, dt: TICK_DT };
      const world = createWorld(lv, 3);
      const r = lv.def.royale!;
      const s = r.spawns[i];
      const p = addPlayer(world, createPlayer(1, 0, s.pos, s.yawDeg, config));
      const mem = createBotMemory(1, BOT_SKILLS.normal, 3);
      mem.objective = r.center;
      mem.objectiveFirst = true;
      const start = flat(p.pos, r.center);
      const trail: Vec3[] = [];
      for (let t = 0; t < 60 * 60; t++) {
        step(world, { 1: botThink(world, ctx, p, mem) }, ctx);
        if (t % 60 === 0) trail.push({ ...p.pos });
        if (flat(p.pos, r.center) < 15) break;
      }
      expect(p.alive).toBe(true);
      const end = flat(p.pos, r.center);
      // it got there, or most of the way
      expect(end, `from ${start.toFixed(0)} m, ended at ${JSON.stringify(p.pos)}`).toBeLessThan(
        Math.max(40, start * 0.35),
      );
      // never stood still for 8 s on the way
      for (let k = 8; k < trail.length; k++)
        expect(
          flat(trail[k], trail[k - 8]),
          `stuck near ${JSON.stringify(trail[k])}`,
        ).toBeGreaterThan(4);
    },
    120_000,
  );
});
