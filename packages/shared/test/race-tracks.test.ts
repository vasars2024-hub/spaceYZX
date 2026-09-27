// The race maps (level/maps/race-*.ts and surf-*.ts): sky courses built from course data
// (level/course). Registered race-only (surf maps apart, never in the ranked pool); their data is
// plain JSON; nothing cuts through anything; every section has a deadly floor under it; the
// course is complete, in order and drivable; checkpoints come every ≤ 25 s; the bunny-hop,
// surf and jetpack sections really need those skills.
//
// How the duration is measured: a bot racer (bots/racer.ts) drives the racing line in the real
// simulation with ordinary inputs. STEADY_RACER is a skilled run: sprinting, first-tick bunny
// hops with perfect air-strafes, surfing, flights that land where they aim, no SURGE and no
// hesitation. A human's strafing is modelled by HUMAN_RACER's `strafeEff` (the share of air
// ticks with the right keys and mouse): each map must be finishable at its design level
// (falls allowed), which keeps every jump human-feasible. tools/race/time-tracks.ts prints both.
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
  expandCourse,
  findOverlaps,
  getMap,
  headingYaw,
  HUMAN_RACER,
  mapDef,
  MAPS,
  pointInAabb,
  raceMaps,
  raceTracks,
  raycast,
  resetRacer,
  STEADY_RACER,
  step,
  surfMaps,
  TICK_DT,
  v3,
  validateCourse,
  type LevelDef,
  type RaceLineNode,
  type RacerSkill,
  type SimContext,
} from '../src/index';

const TRACKS = raceMaps().map((m) => m.id);

/** How well a human must strafe to get round (the maps' difficulty curve). */
const DESIGN_EFF: Record<string, number> = {
  'race-sunspire': 0.6,
  'race-neon': 0.8,
  'race-ember': 0.85,
  'surf-aurora': 0.6,
  'surf-cinder': 0.6,
};

const sim = (def: LevelDef) => {
  const config = defaultConfig();
  const ctx: SimContext = { level: buildLevel(def), config, dt: TICK_DT };
  const world = createWorld(ctx.level, 1);
  return { ctx, world, config };
};

/** A whole run from the grid with `skill` (for at most `maxSec`). */
const run = (def: LevelDef, skill: RacerSkill, maxSec = 400) => {
  const { ctx, world, config } = sim(def);
  const g = def.race!.grid[0];
  const p = addPlayer(world, createPlayer(1, 0, g.pos, g.yawDeg, config));
  resetRacer(p, config.movement, g.pos, g.yawDeg, 0);
  return driveRaceLine(ctx, world, p, step, skill, maxSec);
};

/** A run from checkpoint `cp` (its respawn) until the next gate or `maxSec`. */
const runFrom = (def: LevelDef, cp: number, skill: RacerSkill, maxSec: number) => {
  const { ctx, world, config } = sim(def);
  const race = def.race!;
  const at = race.checkpoints[cp - 1];
  const p = addPlayer(world, createPlayer(1, 0, at.respawn, at.yawDeg, config));
  resetRacer(p, config.movement, at.respawn, at.yawDeg, cp);
  const r = driveRaceLine(ctx, world, p, step, skill, maxSec);
  return { reachedNext: p.raceCp > cp || r.splitsSec.length > 0, report: r };
};

/** Drive from the first node of `nodes` (standing there, raceCp `cp`) along them. */
const driveFrom = (def: LevelDef, nodes: RaceLineNode[], cp: number) => {
  const { ctx, world, config } = sim(def);
  const a = nodes[0].pos;
  const b = nodes[1].pos;
  const yaw = headingYaw((Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI);
  const p = addPlayer(world, createPlayer(1, 0, a, yaw, config));
  resetRacer(p, config.movement, a, yaw, cp);
  return driveNodes(ctx, world, p, nodes, step, 30);
};

it('three race tracks and two surf maps, only for races; the ranked pool is the tracks', () => {
  expect(raceTracks().map((m) => m.id)).toEqual(['race-sunspire', 'race-neon', 'race-ember']);
  expect(surfMaps().map((m) => m.id)).toEqual(['surf-aurora', 'surf-cinder']);
  for (const id of TRACKS) {
    const m = MAPS.find((x) => x.id === id)!;
    expect(m.competitive).toBe(false);
    expect(m.arena).toBeFalsy();
    expect(m.course).toBeDefined();
    expect(mapDef(id).skyArena).toBeUndefined();
  }
  // no other map is a race map; surf maps have no jetpack and no SURGE
  for (const m of MAPS) if (!m.race) expect(mapDef(m.id).race).toBeUndefined();
  for (const m of surfMaps()) {
    const r = mapDef(m.id).race!;
    expect(r.surf && r.noJetpack && r.noSurge).toBe(true);
  }
});

describe.each(TRACKS)('%s', (id) => {
  const def = mapDef(id);
  const race = def.race!;
  const data = getMap(id).course!();

  it('is plain JSON data: a round trip builds the same level, and the data is valid', () => {
    const copy = JSON.parse(JSON.stringify(data));
    expect(copy).toEqual(data);
    expect(expandCourse(copy).def).toEqual(expandCourse(data).def);
    expect(validateCourse(data)).toEqual([]);
  });

  it('nothing cuts through anything (the clipping check)', () => {
    expect(findOverlaps(def)).toEqual([]);
  });

  it('has a start grid, walled checkpoint rooms, a finish; every spot clear with ground under', () => {
    expect(race.checkpoints.length).toBeGreaterThanOrEqual(4);
    expect(race.grid.length).toBe(8);
    const level = buildLevel(def);
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
    // every checkpoint is a room: walls on both sides (under their big windows) and a roof
    for (const c of race.checkpoints) {
      const at = v3(c.respawn.x, c.respawn.y + 0.6, c.respawn.z);
      const yaw = (-c.yawDeg * Math.PI) / 180;
      const right = v3(Math.cos(yaw), 0, Math.sin(yaw));
      for (const s of [-1, 1])
        expect(raycast(level, at, v3(right.x * s, 0, right.z * s), 8), 'side wall').not.toBeNull();
      expect(raycast(level, at, v3(0, 1, 0), 8), 'roof').not.toBeNull();
    }
  });

  it('stays inside the network range; a deadly floor under the whole line, never on it', () => {
    for (const b of def.boxes)
      if (!b.noCollide)
        for (const k of ['x', 'y', 'z'] as const) expect(Math.abs(b.c[k])).toBeLessThan(500);
    const kills = race.killVolumes ?? [];
    for (const n of race.line) {
      expect(Math.abs(n.pos.x)).toBeLessThan(490);
      expect(Math.abs(n.pos.z)).toBeLessThan(490);
      const body = v3(n.pos.x, n.pos.y + 0.9, n.pos.z);
      expect(kills.some((k) => pointInAabb(body, k.min, k.max))).toBe(false);
      // falling straight down from any point of the line ends in a floor within 45 m
      let hit = false;
      for (let d = 1; d <= 45 && !hit; d += 1)
        hit = kills.some((k) => pointInAabb(v3(body.x, body.y - d, body.z), k.min, k.max));
      expect(hit, `no floor under ${JSON.stringify(n.pos)}`).toBe(true);
    }
  });

  it('a skilled run passes every gate in order, checkpoints ≤ 25 s apart, about 3 min', () => {
    const r = run(def, STEADY_RACER);
    expect(r.finished).toBe(true);
    expect(r.respawns).toBe(0);
    expect(r.splitsSec.length).toBe(race.checkpoints.length + 1);
    let last = 0;
    for (const s of r.splitsSec) {
      expect(s).toBeGreaterThan(last);
      expect(s - last).toBeLessThanOrEqual(25);
      last = s;
    }
    // race tracks about 3 minutes (2:40–3:20); surf maps 1:30–2:30
    if (getMap(id).surf) {
      expect(r.timeSec).toBeGreaterThan(90);
      expect(r.timeSec).toBeLessThan(150);
    } else {
      expect(r.timeSec).toBeGreaterThan(160);
      expect(r.timeSec).toBeLessThan(200);
    }
    // race movement is fast: well past the race sprint
    expect(r.topSpeed).toBeGreaterThan(defaultConfig().movement.raceSprintSpeed * 3);
  }, 60000);

  it('a human who strafes at its design level gets round (falls allowed)', () => {
    const r = run(def, { ...HUMAN_RACER, strafeEff: DESIGN_EFF[id] }, 900);
    expect(r.finished).toBe(true);
  }, 60000);

  it('a fall after any checkpoint puts you back in that checkpoint room', () => {
    const { ctx, world, config } = sim(def);
    const p = addPlayer(world, createPlayer(1, 0, race.grid[0].pos, 0, config));
    race.checkpoints.forEach((cp, i) => {
      resetRacer(p, config.movement, cp.respawn, cp.yawDeg, i + 1);
      p.pos = v3(cp.respawn.x + 40, race.killY + 3, cp.respawn.z + 40);
      let back = false;
      for (let t = 0; t < 120 && !back; t++) {
        step(world, {}, ctx);
        back = world.events.some((e) => e.type === 'raceRespawn' && e.cp === i + 1);
      }
      expect(back, `checkpoint ${i + 1}`).toBe(true);
      expect(p.pos.x).toBeCloseTo(cp.respawn.x, 5);
      expect(p.pos.z).toBeCloseTo(cp.respawn.z, 5);
      expect(pointInAabb(p.pos, cp.min, cp.max)).toBe(true);
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

  it('the bunny-hop and surf sections need air-strafing (holding W gets you nowhere)', () => {
    // from every checkpoint that leads into a hop chain or a surf ramp: no strafing, no gate
    const noStrafe: RacerSkill = { ...STEADY_RACER, strafeEff: 0 };
    let tried = 0;
    race.checkpoints.forEach((_, i) => {
      const cp = i + 1;
      const section = race.line.filter((n) => n.cp === cp);
      const needs = section.some((n) => n.surf) || section.filter((n) => n.hop).length >= 8;
      if (!needs || tried >= 4) return;
      tried++;
      expect(runFrom(def, cp, noStrafe, 40).reachedNext, `section after checkpoint ${cp}`).toBe(
        false,
      );
      expect(runFrom(def, cp, STEADY_RACER, 40).reachedNext).toBe(true);
    });
    expect(tried).toBeGreaterThan(0);
  }, 60000);

  it('every jetpack gap needs the jetpack', () => {
    const jets = race.line.map((n, i) => [n, i] as const).filter(([n]) => n.jet);
    if (getMap(id).surf) expect(jets.length).toBe(0);
    for (const [n, i] of jets) {
      const nodes = race.line.slice(i - 1, i + 2);
      expect(driveFrom(def, nodes, n.cp).reached).toBe(true);
      const plain = nodes.map((x) => ({ ...x, jet: undefined }));
      expect(driveFrom(def, plain, n.cp).reached).toBe(false);
    }
  });
});
