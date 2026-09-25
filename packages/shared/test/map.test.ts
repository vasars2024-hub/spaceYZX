import { describe, expect, it } from 'vitest';
import {
  buildLevel,
  mapDef,
  MAPS,
  capsuleOverlaps,
  raycast,
  lineOfSight,
  waypointRoute,
  createWorld,
  createPlayer,
  addPlayer,
  defaultConfig,
  step,
  createMatch,
  startMatch,
  updateMatch,
  applyBotObjectives,
  botThink,
  createBotMemory,
  BOT_SKILLS,
  TICK_DT,
  v3,
  type Level,
} from '../src/index';

const kestrel = () => buildLevel(mapDef('kestrel'));

const standingCapsule = (feet: { x: number; y: number; z: number }) => ({
  center: v3(feet.x, feet.y + 0.9, feet.z),
  up: v3(0, 1, 0),
  halfSeg: 0.45,
  radius: 0.4,
});

const key = (n: number) => n.toFixed(3);

describe('Kestrel map', () => {
  it('is registered as the competitive map', () => {
    expect(MAPS.find((m) => m.id === 'kestrel')?.competitive).toBe(true);
  });

  it('is mirror-symmetric across x = 0', () => {
    const def = mapDef('kestrel');
    const boxes = new Set(
      def.boxes.map((b) => [b.c.x, b.c.y, b.c.z, b.h.x, b.h.y, b.h.z].map(key).join(',')),
    );
    for (const b of def.boxes) {
      if (b.q) continue; // ramps: checked by count below
      const m = [-b.c.x, b.c.y, b.c.z, b.h.x, b.h.y, b.h.z].map(key).join(',');
      expect(boxes.has(m), `mirror of box at ${b.c.x},${b.c.y},${b.c.z}`).toBe(true);
    }
    const ramps = def.boxes.filter((b) => b.q);
    expect(ramps.filter((b) => b.c.x > 0).length).toBe(ramps.filter((b) => b.c.x < 0).length);
    // spawns, towers, zones and waypoints mirror too
    for (const s of def.spawns)
      expect(
        def.spawns.some(
          (o) =>
            o.team !== s.team && key(o.pos.x) === key(-s.pos.x) && key(o.pos.z) === key(s.pos.z),
        ),
      ).toBe(true);
    expect(def.towers.map((t) => t.pos.x).sort((a, b) => a - b)).toEqual([-88, 88]);
    for (const w of def.waypoints!)
      expect(
        def.waypoints!.some((o) => key(o.pos.x) === key(-w.pos.x) && key(o.pos.z) === key(w.pos.z)),
      ).toBe(true);
  });

  it('has 8 valid spawns per team (clear capsule, floor underneath)', () => {
    const level = kestrel();
    for (const team of [0, 1]) {
      const spawns = level.def.spawns.filter((s) => s.team === team);
      expect(spawns.length).toBe(8);
      for (const s of spawns) {
        expect(capsuleOverlaps(level, standingCapsule(s.pos)), `spawn ${s.pos.x},${s.pos.z}`).toBe(
          false,
        );
        const hit = raycast(level, v3(s.pos.x, s.pos.y + 1, s.pos.z), v3(0, -1, 0), 2);
        expect(hit).not.toBeNull();
      }
    }
  });

  it('waypoints sit in open space, links have line of sight, and the graph is connected', () => {
    const level: Level = kestrel();
    const wps = level.def.waypoints!;
    for (const w of wps) {
      expect(
        capsuleOverlaps(level, { center: w.pos, up: v3(0, 1, 0), halfSeg: 0, radius: 0.3 }),
        `waypoint ${JSON.stringify(w.pos)}`,
      ).toBe(false);
      for (const j of w.links)
        expect(
          lineOfSight(level, w.pos, wps[j].pos),
          `link ${JSON.stringify(w.pos)} → ${JSON.stringify(wps[j].pos)}`,
        ).toBe(true);
    }
    for (let i = 1; i < wps.length; i++) expect(waypointRoute(wps, 0, i).length).toBeGreaterThan(0);
  });

  it('offers exactly three separate routes between the bases', () => {
    const level = kestrel();
    const wps = level.def.waypoints!;
    const near = (x: number, z: number) =>
      wps.findIndex((w) => Math.abs(w.pos.x - x) < 0.5 && Math.abs(w.pos.z - z) < 0.5);
    const a = near(-84.5, 0);
    const b = near(84.5, 0);
    // remove lane middles and check which routes still connect the Towers
    const without = (blocked: number[]) =>
      wps.map((w, i) => ({
        ...w,
        links: blocked.includes(i) ? [] : w.links.filter((l) => !blocked.includes(l)),
      }));
    // reactor room: floor on both sides of the platform, and the balcony window into the shaft
    const mid = [near(0, 9), near(0, -9), near(0, 16)];
    const S0 = near(0, 31); // zero-G shaft
    const SC = near(0, -38.5); // engine ceiling
    for (const i of [a, b, ...mid, S0, SC]) expect(i).toBeGreaterThanOrEqual(0);
    expect(waypointRoute(wps, a, b).length).toBeGreaterThan(0);
    const viaMid = waypointRoute(without([S0, SC]), a, b);
    expect(viaMid.some((i) => mid.includes(i))).toBe(true);
    expect(waypointRoute(without([...mid, SC]), a, b)).toContain(S0);
    expect(waypointRoute(without([...mid, S0]), a, b)).toContain(SC);
    expect(waypointRoute(without([...mid, S0, SC]), a, b)).toEqual([]);
  });

  it('has the three gravity areas: zero-G shaft, wall corridor, ceiling section', () => {
    const def = mapDef('kestrel');
    const shaft = def.zones.find((z) => z.name === 'cargo-shaft')!;
    expect(shaft.gravity).toEqual(v3(0, 0, 0));
    expect(def.zones.filter((z) => z.name.startsWith('engine-wall')).length).toBe(2);
    expect(def.pads.length).toBe(2);
  });

  it.each([
    ['main hall', null],
    ['zero-G shaft', v3(-60, 0.9, 30)],
    ['engine corridor', v3(-60, 0.9, -34)],
  ] as const)('a bot carries the Controller to the enemy Tower via the %s', (_name, start) => {
    const config = defaultConfig();
    const ctx = { level: kestrel(), config, dt: TICK_DT };
    const world = createWorld(ctx.level, 3);
    const s = ctx.level.def.spawns.find((sp) => sp.team === 0)!;
    addPlayer(world, createPlayer(1, 0, s.pos, s.yawDeg, config));
    const mem = createBotMemory(1, BOT_SKILLS.normal, 3);
    const ms = createMatch('1v1');
    startMatch(ms, world, ctx);
    if (start) world.players[0].pos = { ...start };
    for (let t = 0; t < 60 * 45 && ms.phase !== 'roundEnd'; t++) {
      applyBotObjectives(ms, world, ctx, [mem]);
      step(world, { 1: botThink(world, ctx, world.players[0], mem) }, ctx);
      updateMatch(ms, world, ctx);
    }
    expect(ms.rounds[0]?.reason).toBe('tower');
  });
});
