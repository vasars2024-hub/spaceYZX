// The race tracks (level/maps/race-*.ts): registered as race-only maps, the course is complete
// and in order, falls return you to your checkpoint, every shortcut can be run and saves time,
// and a steady racer needs about three minutes.
//
// How the duration is measured: a bot racer (bots/racer.ts, STEADY_RACER) drives the racing
// line in the real simulation with ordinary inputs — sprinting all the way, jumping at the
// take-off edges, riding the zip-rails, launch pads and the portal — but never sliding,
// bunny-hopping, surging or taking a shortcut. That is a realistic pace for a decent player;
// a good run with surges and shortcuts is 15–25 s faster (the shortcut savings are measured
// below). tools/race/time-tracks.ts prints the same run.
import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  buildLevel,
  capsuleOverlaps,
  createPlayer,
  createWorld,
  defaultConfig,
  driveNodes,
  driveRaceLine,
  headingYaw,
  mapDef,
  MAPS,
  raceMaps,
  raycast,
  resetRacer,
  step,
  TICK_DT,
  v3,
  type LevelDef,
  type RaceLineNode,
  type SimContext,
} from '../src/index';

const TRACKS = raceMaps().map((m) => m.id);

const sim = (def: LevelDef) => {
  const config = defaultConfig();
  const ctx: SimContext = { level: buildLevel(def), config, dt: TICK_DT };
  const world = createWorld(ctx.level, 1);
  return { ctx, world, config };
};

/** Drive from the first node of `nodes` (standing there, raceCp `cp`) along them. */
const driveFrom = (def: LevelDef, nodes: RaceLineNode[], cp: number) => {
  const { ctx, world, config } = sim(def);
  const a = nodes[0].pos;
  const b = nodes[1].pos;
  const yaw = headingYaw((Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI);
  const p = addPlayer(world, createPlayer(1, 0, a, yaw, config));
  resetRacer(p, config.movement, a, yaw, cp);
  return driveNodes(ctx, world, p, nodes, step, 60);
};

it('there are two race tracks, only for races', () => {
  expect(TRACKS).toEqual(['race-cliffline', 'race-canopy']);
  for (const id of TRACKS) {
    const m = MAPS.find((x) => x.id === id)!;
    expect(m.competitive).toBe(false);
    expect(m.arena).toBeFalsy();
    expect(mapDef(id).skyArena).toBeUndefined();
  }
  // no other map is a race track
  for (const m of MAPS) if (!m.race) expect(mapDef(m.id).race).toBeUndefined();
});

describe.each(TRACKS)('%s', (id) => {
  const def = mapDef(id);
  const race = def.race!;

  it('has a start grid, 6–10 numbered checkpoints, a finish, fuel cells and forks', () => {
    expect(race.checkpoints.length).toBeGreaterThanOrEqual(6);
    expect(race.checkpoints.length).toBeLessThanOrEqual(10);
    expect(race.grid.length).toBe(8);
    expect(race.fuelCells!.length).toBeGreaterThanOrEqual(2);
    expect(race.forks!.length).toBeGreaterThanOrEqual(3);
    expect(def.outdoor).toBeDefined();
    const level = buildLevel(def);
    // every grid slot and respawn point: clear to stand in, ground underneath
    const spots = [
      ...race.grid.map((g) => g.pos),
      race.start.respawn,
      ...race.checkpoints.map((c) => c.respawn),
      race.finish.respawn,
    ];
    for (const s of spots) {
      const cap = { center: v3(s.x, s.y + 0.95, s.z), up: v3(0, 1, 0), halfSeg: 0.5, radius: 0.4 };
      expect(capsuleOverlaps(level, cap), `spot ${JSON.stringify(s)}`).toBe(false);
      expect(raycast(level, v3(s.x, s.y + 1, s.z), v3(0, -1, 0), 1.6)).not.toBeNull();
    }
  });

  it('stays inside the network position range (±512 m) and its bounds', () => {
    // (players can only stand on colliding boxes; far scenery may lie beyond)
    for (const b of def.boxes)
      if (!b.noCollide)
        for (const k of ['x', 'y', 'z'] as const) expect(Math.abs(b.c[k])).toBeLessThan(500);
    for (const n of race.line) {
      expect(n.pos.x).toBeGreaterThan(def.boundsMin.x);
      expect(n.pos.x).toBeLessThan(def.boundsMax.x);
      expect(n.pos.z).toBeGreaterThan(def.boundsMin.z);
      expect(n.pos.z).toBeLessThan(def.boundsMax.z);
      expect(n.pos.y).toBeGreaterThan(race.killY + 5);
    }
  });

  it('a steady racer passes every gate in order and finishes in about 3 minutes', () => {
    const { ctx, world, config } = sim(def);
    const g = race.grid[0];
    const p = addPlayer(world, createPlayer(1, 0, g.pos, g.yawDeg, config));
    resetRacer(p, config.movement, g.pos, g.yawDeg, 0);
    const r = driveRaceLine(ctx, world, p, step);
    expect(r.finished).toBe(true);
    expect(r.respawns).toBe(0);
    expect(r.splitsSec.length).toBe(race.checkpoints.length + 1);
    for (let i = 1; i < r.splitsSec.length; i++)
      expect(r.splitsSec[i]).toBeGreaterThan(r.splitsSec[i - 1] + 5);
    // 2:30–3:30 at a steady sprint (see the top of this file)
    expect(r.timeSec).toBeGreaterThan(150);
    expect(r.timeSec).toBeLessThan(210);
    // par is a good run's time
    expect(race.parSec).toBe(180);
  });

  it('a fall after any checkpoint puts you back at that checkpoint', () => {
    const { ctx, world, config } = sim(def);
    const p = addPlayer(world, createPlayer(1, 0, race.grid[0].pos, 0, config));
    race.checkpoints.forEach((cp, i) => {
      resetRacer(p, config.movement, cp.respawn, cp.yawDeg, i + 1);
      // drop the racer well off the course, below its checkpoint
      p.pos = v3(cp.respawn.x + 30, race.killY + 3, cp.respawn.z + 30);
      let back = false;
      for (let t = 0; t < 120 && !back; t++) {
        step(world, {}, ctx);
        back = world.events.some((e) => e.type === 'raceRespawn' && e.cp === i + 1);
      }
      expect(back, `checkpoint ${i + 1}`).toBe(true);
      expect(p.pos.x).toBeCloseTo(cp.respawn.x, 5);
      expect(p.pos.z).toBeCloseTo(cp.respawn.z, 5);
      expect(p.racePenalty).toBeGreaterThan(0);
    });
  });

  it('every kill volume sends you back', () => {
    const { ctx, world, config } = sim(def);
    const p = addPlayer(world, createPlayer(1, 0, race.grid[0].pos, 0, config));
    for (const k of race.killVolumes ?? []) {
      resetRacer(p, config.movement, race.start.respawn, 0, 1);
      p.pos = v3((k.min.x + k.max.x) / 2, (k.min.y + k.max.y) / 2, (k.min.z + k.max.z) / 2);
      step(world, {}, ctx);
      expect(world.events.some((e) => e.type === 'raceRespawn')).toBe(true);
    }
  });

  it.each(race.forks!.map((f) => [f.name, f] as const))(
    'shortcut "%s" can be run and saves time over the safe way',
    (_name, fork) => {
      const a = fork.riskyLine[0].pos;
      const z = fork.riskyLine[fork.riskyLine.length - 1].pos;
      const same = (n: RaceLineNode, q: typeof a) =>
        n.pos.x === q.x && n.pos.y === q.y && n.pos.z === q.z;
      const i0 = race.line.findIndex((n) => same(n, a));
      const i1 = race.line.findIndex((n) => same(n, z));
      expect(i0).toBeGreaterThanOrEqual(0);
      expect(i1).toBeGreaterThan(i0);
      const safe = driveFrom(def, race.line.slice(i0, i1 + 1), fork.cp);
      const risky = driveFrom(def, fork.riskyLine, fork.cp);
      expect(safe.reached).toBe(true);
      expect(risky.reached).toBe(true);
      expect(risky.timeSec).toBeLessThan(safe.timeSec - 2);
      // a jetpack gap needs the jetpack, a SURGE lead needs the surge
      const special = fork.riskyLine.some((n) => n.jet || n.surge);
      if (special) {
        const plain = fork.riskyLine.map((n) => ({ ...n, jet: undefined, surge: undefined }));
        expect(driveFrom(def, plain, fork.cp).reached).toBe(false);
      }
    },
  );
});
