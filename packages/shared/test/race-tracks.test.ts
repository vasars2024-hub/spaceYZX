// The parkour race tracks (level/maps/race-*.ts): sky courses built from course data
// (level/course). Registered race-only (never in a combat mode's pool); their data is plain
// JSON; nothing cuts through anything; every section has a deadly floor under it; the course is
// complete, in order and drivable; checkpoints come every ≤ 25 s; the bunny-hop, surf and
// jetpack sections really need those skills. (The surf maps have their own requirements:
// surf-maps.test.ts.)
//
// How the duration is measured: a bot racer (bots/racer.ts) drives the racing line in the real
// simulation with ordinary inputs. STEADY_RACER is a skilled run: sprinting, first-tick bunny
// hops with perfect air-strafes, surfing, flights that land where they aim, no SURGE and no
// hesitation. A human's strafing is modelled by HUMAN_RACER's `strafeEff` (the share of air
// ticks with the right keys and mouse): each map must be finishable at its design level
// (falls allowed), which keeps every jump human-feasible. tools/race/time-tracks.ts prints both.
//
// Tracks rebuilt to the revamp plan (docs/movement-map-design/race/REVAMP.md §5; REVAMPED below)
// meet its rules instead of the older ones: five walled rooms C1–C5, a 170–190 s clean run with
// rooms ≤ 36 s apart and recovery points (room or anchor) at most `recoverySec` apart, no
// jetpack (Ember Spire keeps it: fuel is a route choice), no surf wedges, no walkway over 12 m, bhop pads clear of walls — and, ported from
// surf-maps.test.ts, every restart bay gets you to the next room and is never faster than riding
// on, red zones kill at their surface, the optional lines ride (faster ones save time), portal
// exits are clear and the racing line crosses every room well inside it.
import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  buildLevel,
  capsuleOverlaps,
  createPlayer,
  createRacerMemory,
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
  qRotate,
  raceMaps,
  racerThink,
  raceTracks,
  raycast,
  resetRacer,
  rotateAxis,
  sendRacerBack,
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

const TRACKS = raceTracks().map((m) => m.id);

/** How well a human must strafe to get round (the maps' difficulty curve). */
const DESIGN_EFF: Record<string, number> = {
  'race-sunspire': 0.6,
  'race-neon': 0.8,
  'race-ember': 0.85,
};

/**
 * Tracks rebuilt to the revamp plan, with their recovery cadence (the longest a clean run goes
 * between recovery points: the start, a room, an anchor, the finish). The others keep the older
 * checks until they are rebuilt.
 */
const REVAMPED: Record<string, { recoverySec: number; jetpack?: boolean }> = {
  'race-sunspire': { recoverySec: 14 },
  'race-neon': { recoverySec: 13 },
  // (Ember Spire keeps the jetpack: fuel is a route choice — the last test below)
  'race-ember': { recoverySec: 11, jetpack: true },
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

/**
 * A steady clean run with what the revamp checks need: when it passed each anchor (s from GO,
 * 0: never) and where it was, how fast, every tick (to time the racing line between two points).
 */
const cleanRecords = new Map<string, ReturnType<typeof recordClean>>();
const recordClean = (def: LevelDef) => {
  const { ctx, world, config } = sim(def);
  const g = def.race!.grid[0];
  const p = addPlayer(world, createPlayer(1, 0, g.pos, g.yawDeg, config));
  resetRacer(p, config.movement, g.pos, g.yawDeg, 0);
  const anchors = (def.race!.anchors ?? []).map(() => 0);
  const track: { x: number; y: number; z: number; v: number }[] = [];
  const start = world.tick;
  const report = driveRaceLine(
    ctx,
    world,
    p,
    (w, i, c) => {
      step(w, i, c);
      track.push({ x: p.pos.x, y: p.pos.y - 0.9, z: p.pos.z, v: Math.hypot(p.vel.x, p.vel.z) });
      for (const e of w.events)
        if (e.type === 'raceAnchor' && e.player === 1)
          anchors[e.anchor] = (w.tick - start) * TICK_DT;
    },
    STEADY_RACER,
    400,
  );
  return { report, anchors, track };
};
const cleanOf = (def: LevelDef) => {
  let r = cleanRecords.get(def.name);
  if (!r) cleanRecords.set(def.name, (r = recordClean(def)));
  return r;
};

/**
 * Come back at a recovery point (room `cp`, or anchor `anchor`'s restart bay) the way a fall
 * does, then drive on until the next room (or `maxSec`): did it get there, how long it took, and
 * the rooms passed by then.
 */
const recover = (def: LevelDef, cp: number, anchor: number, maxSec = 60) => {
  const { ctx, world, config } = sim(def);
  const race = def.race!;
  const at = anchor >= 0 ? race.anchors![anchor] : race.checkpoints[cp - 1];
  const p = addPlayer(world, createPlayer(1, 0, at.respawn, at.yawDeg, config));
  resetRacer(p, config.movement, at.respawn, at.yawDeg, cp);
  p.raceAnchor = anchor;
  // (racing somewhere else in the section, as the bot sees it; then a fall brings it back)
  const mem = createRacerMemory(1, STEADY_RACER, 7);
  p.pos = v3(at.respawn.x + 30, at.respawn.y + 30, at.respawn.z);
  racerThink(world, ctx, p, mem);
  sendRacerBack(world, ctx, p, 'key');
  let passed = false;
  let t = 0;
  let cpThen = -1;
  driveRaceLine(
    ctx,
    world,
    p,
    (w, i, c) => {
      step(w, i, c);
      if (passed) return;
      t++;
      if (w.events.some((e) => e.type === 'raceCp' && e.player === 1)) {
        passed = true;
        cpThen = p.raceCp;
      }
    },
    STEADY_RACER,
    maxSec,
    mem,
  );
  return { passed, sec: t * TICK_DT, raceCp: cpThen };
};

it('three race tracks and the surf maps, only for races; the ranked pool is the tracks', () => {
  expect(raceTracks().map((m) => m.id)).toEqual(['race-sunspire', 'race-neon', 'race-ember']);
  expect(surfMaps().map((m) => m.id)).toContain('surf-copper-reef');
  for (const id of raceMaps().map((m) => m.id)) {
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
  const revamp = REVAMPED[id];

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
    if (revamp) expect(race.checkpoints.length).toBe(5);
    else expect(race.checkpoints.length).toBeGreaterThanOrEqual(4);
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
      // and beside it (falling off the side of a ramp or a pad)
      for (const [dx, dz] of [
        [14, 0],
        [-14, 0],
        [0, 14],
        [0, -14],
      ]) {
        let side = false;
        for (let d = 0; d <= 45 && !side; d += 1)
          side = kills.some((k) =>
            pointInAabb(v3(body.x + dx, body.y - d, body.z + dz), k.min, k.max),
          );
        expect(side, `no floor beside ${JSON.stringify(n.pos)}`).toBe(true);
      }
    }
  });

  it('nothing you can stand on is inside a deadly floor (riding low on a surf ramp is safe)', () => {
    const kills = race.killVolumes ?? [];
    const deadly = (x: number, y: number, z: number) =>
      [0.1, 1.1].some((up) => kills.some((k) => pointInAabb(v3(x, y + up, z), k.min, k.max)));
    for (const b of def.boxes) {
      if (b.noCollide) continue;
      const at = (x: number, y: number, z: number) => {
        const w = b.q ? qRotate(b.q, v3(x, y, z)) : v3(x, y, z);
        return v3(b.c.x + w.x, b.c.y + w.y, b.c.z + w.z);
      };
      const pts = [];
      if (b.prism !== undefined) {
        // both slanted faces, ridge to foot
        const ridge = Math.max(-1, Math.min(1, b.prism)) * b.h.z;
        for (let i = 0; i <= 10; i++)
          for (let j = 0; j <= 10; j++)
            for (const foot of [-b.h.z, b.h.z])
              pts.push(
                at(
                  -b.h.x + (b.h.x * i) / 5,
                  b.h.y - (b.h.y * j) / 5,
                  ridge + ((foot - ridge) * j) / 10,
                ),
              );
      } else
        for (let i = 0; i <= 4; i++)
          for (let j = 0; j <= 4; j++)
            pts.push(at(-b.h.x + (b.h.x * i) / 2, b.h.y, -b.h.z + (b.h.z * j) / 2));
      for (const p of pts)
        expect(deadly(p.x, p.y, p.z), `deadly spot ${JSON.stringify(p)}`).toBe(false);
    }
  });

  it(`a skilled run passes every gate in order, checkpoints ≤ ${revamp ? 36 : 25} s apart, about 3 min`, () => {
    const r = revamp ? cleanOf(def).report : run(def, STEADY_RACER);
    expect(r.finished).toBe(true);
    expect(r.respawns).toBe(0);
    expect(r.splitsSec.length).toBe(race.checkpoints.length + 1);
    let last = 0;
    for (const s of r.splitsSec) {
      expect(s).toBeGreaterThan(last);
      expect(s - last).toBeLessThanOrEqual(revamp ? 36 : 25);
      last = s;
    }
    // about 3 minutes (2:40–3:20; rebuilt tracks 2:50–3:10)
    expect(r.timeSec).toBeGreaterThan(revamp ? 170 : 160);
    expect(r.timeSec).toBeLessThan(revamp ? 190 : 200);
    if (revamp) {
      // a fall never costs more than the recovery cadence: the start, every room, every anchor
      // and the finish follow each other at most `recoverySec` apart on the clean run
      const anchors = cleanOf(def).anchors;
      for (const [i, t] of anchors.entries())
        expect(t, `the clean run passes ${race.anchors![i].name}`).toBeGreaterThan(0);
      const points = [0, ...r.splitsSec, ...anchors].sort((a, b) => a - b);
      for (let i = 1; i < points.length; i++)
        expect(
          points[i] - points[i - 1],
          `recovery points at ${points[i - 1].toFixed(1)} s and ${points[i].toFixed(1)} s`,
        ).toBeLessThanOrEqual(revamp.recoverySec);
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
    for (const [n, i] of jets) {
      const nodes = race.line.slice(i - 1, i + 2);
      expect(driveFrom(def, nodes, n.cp).reached).toBe(true);
      const plain = nodes.map((x) => ({ ...x, jet: undefined }));
      expect(driveFrom(def, plain, n.cp).reached).toBe(false);
    }
  });

  // ---- rebuilt tracks (the revamp plan's rules) ----

  it.runIf(!!revamp)(
    'rebuilt: no jetpack (but where designed), no surf wedges, no walkway over 12 m, pads clear of walls',
    () => {
      expect(!!race.noJetpack).toBe(!revamp.jetpack);
      expect(data.route.filter((e) => e.t === 'surf')).toEqual([]);
      // no straight running: every walkway on the racing line is 12 m or shorter
      const { elementNodes } = expandCourse(data);
      data.route.forEach((e, i) => {
        if (e.t !== 'path' || e.alt) return;
        const [a, b] = elementNodes[i].map((n) => n.pos);
        expect(Math.hypot(b.x - a.x, b.z - a.z), `walkway ${i}`).toBeLessThanOrEqual(12);
      });
      // an early jump press within 0.35 m of a wall fires a wall-jump instead of a bunny hop: no
      // wall (nor ceiling) stands within 1.5 m of a pad's edges, from just over its top to 3.4 m up
      const level = buildLevel(def);
      let pads = 0;
      for (const e of data.route) {
        if (e.t !== 'jumps') continue;
        for (const pd of e.pads) {
          pads++;
          const [w, d] = pd.size ?? [4, 4];
          const h = ((pd.heading ?? 0) * Math.PI) / 180;
          const fw = v3(Math.sin(h), 0, -Math.cos(h));
          const rt = v3(Math.cos(h), 0, Math.sin(h));
          for (const [sx, sz] of [
            [-1, -1],
            [0, -1],
            [1, -1],
            [-1, 0],
            [1, 0],
            [-1, 1],
            [0, 1],
            [1, 1],
          ]) {
            const c = v3(
              pd.at[0] + (rt.x * sx * w) / 2 - (fw.x * sz * d) / 2,
              pd.at[1] + 1.9,
              pd.at[2] + (rt.z * sx * w) / 2 - (fw.z * sz * d) / 2,
            );
            const cap = { center: c, up: v3(0, 1, 0), halfSeg: 0, radius: 1.5 };
            expect(capsuleOverlaps(level, cap), `a wall by the pad at ${pd.at.join(', ')}`).toBe(
              false,
            );
          }
        }
      }
      expect(pads).toBeGreaterThan(20);
    },
  );

  it.runIf(!!revamp)(
    'rebuilt: named rooms and anchors; every restart bay clear, ground under it, off the route',
    () => {
      for (const g of race.checkpoints) expect(g.name, 'every room is named').toBeTruthy();
      expect((race.anchors ?? []).length).toBeGreaterThanOrEqual(5);
      const level = buildLevel(def);
      for (const a of race.anchors ?? []) {
        expect(a.name, 'every anchor is named').toBeTruthy();
        const s = a.respawn;
        const cap = {
          center: v3(s.x, s.y + 0.95, s.z),
          up: v3(0, 1, 0),
          halfSeg: 0.5,
          radius: 0.4,
        };
        expect(capsuleOverlaps(level, cap), `bay ${JSON.stringify(s)}`).toBe(false);
        expect(raycast(level, v3(s.x, s.y + 1, s.z), v3(0, -1, 0), 1.6)).not.toBeNull();
        // bays are off the route: no racing line point passes within 8 m of one
        for (const n of race.line)
          expect(
            Math.hypot(n.pos.x - s.x, n.pos.y - s.y, n.pos.z - s.z),
            `${a.name}'s bay`,
          ).toBeGreaterThan(8);
      }
    },
  );

  it.runIf(!!revamp)(
    'rebuilt: portal exits are clear; the racing line crosses every room well inside it',
    () => {
      const level = buildLevel(def);
      for (const pt of def.portals ?? []) {
        // (keeping the offset: the whole opening round the exit must be clear too)
        const r = pt.offset ? (pt.max.y - pt.min.y) / 2 - 1 : 0;
        const out = rotateAxis(
          pt.dir ?? v3(0, 0, -1),
          v3(0, 1, 0),
          (-(pt.turn ?? 0) * Math.PI) / 180,
        );
        const side = v3(-out.z, 0, out.x);
        for (const [x, y] of [
          [0, 0],
          [-r, -r],
          [r, -r],
          [-r, r],
          [r, r],
        ]) {
          const c = v3(pt.exit.x + side.x * x, pt.exit.y + y, pt.exit.z + side.z * x);
          const cap = { center: c, up: v3(0, 1, 0), halfSeg: 0.5, radius: 0.4 };
          expect(capsuleOverlaps(level, cap), `${pt.name} exit ${JSON.stringify(c)}`).toBe(false);
        }
      }
      // the line (sampled every half metre) passes through each room with room all round it
      const pts: { x: number; y: number; z: number }[] = [];
      for (let i = 1; i < race.line.length; i++) {
        const a = race.line[i - 1].pos;
        const b = race.line[i].pos;
        if (race.line[i - 1].portal) continue;
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.5));
        for (let k = 0; k < n; k++) {
          const t = k / n;
          pts.push(v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + 0.9, a.z + (b.z - a.z) * t));
        }
      }
      for (const g of [...race.checkpoints, race.finish]) {
        const room = (q: { x: number; y: number; z: number }) =>
          Math.min(
            q.y - g.min.y,
            g.max.y - q.y,
            q.x - g.min.x,
            g.max.x - q.x,
            q.z - g.min.z,
            g.max.z - q.z,
          );
        const best = Math.max(...pts.map(room));
        expect(
          best,
          `room ${g.name ?? 'finish'}: the line passes ${best.toFixed(1)} m inside`,
        ).toBeGreaterThan(1.5);
      }
    },
  );

  it.runIf(!!revamp)(
    'rebuilt: every restart bay gets you to the next room on its own, never faster than carrying on',
    () => {
      const { report: r, anchors } = cleanOf(def);
      const penalty = defaultConfig().movement.racePenaltySec;
      const gateSec = (cp: number) => (cp === 0 ? 0 : r.splitsSec[cp - 1]);
      // the rooms (C1..C5)
      race.checkpoints.forEach((_, i) => {
        const cp = i + 1;
        const back = recover(def, cp, -1);
        expect(back.passed, `from room C${cp}`).toBe(true);
        expect(back.raceCp, 'a recovery never grants progress beyond the next room').toBe(cp + 1);
        expect(back.sec + penalty).toBeGreaterThan(r.splitsSec[cp] - gateSec(cp) - 1e-6);
      });
      // the anchors' bays: completable, and slower than carrying on from the anchor itself
      (race.anchors ?? []).forEach((a, i) => {
        const back = recover(def, a.cp, i);
        expect(back.passed, `from ${a.name}'s bay`).toBe(true);
        expect(back.raceCp).toBe(a.cp + 1);
        expect(
          back.sec + penalty,
          `${a.name}: dying on purpose is never a shortcut`,
        ).toBeGreaterThan(r.splitsSec[a.cp] - anchors[i]);
      });
    },
    120000,
  );

  it.runIf(!!revamp)(
    'rebuilt: touching any red zone sends you back (exactly at its surface)',
    () => {
      const { ctx, world, config } = sim(def);
      const reds = def.boxes.filter((b) => b.kill);
      // (every red block — ceilings, lintels, floors — and a sample of the red strips' slivers)
      const blocks = reds.filter((b) => !b.hull);
      expect(blocks.length).toBeGreaterThan(2);
      const p = addPlayer(world, createPlayer(1, 0, race.grid[0].pos, 0, config));
      for (const b of [...blocks, ...reds.filter((b) => b.hull).filter((_, k) => k % 7 === 0)]) {
        resetRacer(p, config.movement, race.start.respawn, 0, 1);
        // just above the middle of the piece's top (a hull's ridge-side corner, else its top)
        const top = b.hull
          ? v3(
              (b.hull[4].x + b.hull[1].x) / 2,
              (b.hull[4].y + b.hull[1].y) / 2,
              (b.hull[4].z + b.hull[1].z) / 2,
            )
          : v3(b.c.x, b.c.y + b.h.y, b.c.z);
        // dropped from half a metre: it lands and settles on the top (resting a few cm above it)
        p.pos = v3(top.x, top.y + 0.9 + 0.5, top.z);
        p.vel = v3();
        world.events.length = 0;
        for (let t = 0; t < 45 && !world.events.some((e) => e.type === 'raceRespawn'); t++)
          step(world, {}, ctx);
        expect(
          world.events.some((e) => e.type === 'raceRespawn' && e.reason === 'red'),
          `red zone at ${JSON.stringify(top)}`,
        ).toBe(true);
      }
    },
  );

  it.runIf(!!revamp)(
    'rebuilt: every optional line rides and rejoins; faster lines save time',
    () => {
      const forks = race.forks ?? [];
      // (salvage lines — ways back up after a fall — are marked in the course data)
      const salvage = (data.forks ?? []).map((f) => !!f.salvage);
      expect(forks.filter((_, k) => !salvage[k]).length).toBeGreaterThan(0);
      const { track } = cleanOf(def);
      const nearest = (q: { x: number; y: number; z: number }): number => {
        let best = 0;
        let bd = Infinity;
        track.forEach((t, i) => {
          const d = Math.hypot(t.x - q.x, t.y - q.y, t.z - q.z);
          if (d < bd) {
            bd = d;
            best = i;
          }
        });
        return best;
      };
      for (const [k, f] of forks.entries()) {
        const { ctx, world, config } = sim(def);
        const a = f.riskyLine[0].pos;
        const b = f.riskyLine[1].pos;
        const yaw = -((Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI);
        const p = addPlayer(world, createPlayer(1, 0, a, yaw, config));
        resetRacer(p, config.movement, a, yaw, f.cp);
        // (on a ramp or in the air at the clean run's speed there; else standing)
        const i0 = nearest(a);
        const speed = f.riskyLine[0].surf || f.riskyLine[0].air ? track[i0].v : 0;
        p.pos = v3(a.x, a.y + 0.92, a.z);
        const d = v3(b.x - a.x, 0, b.z - a.z);
        const l = Math.hypot(d.x, d.z);
        p.vel = v3((d.x / l) * speed, 0, (d.z / l) * speed);
        const r = driveNodes(ctx, world, p, f.riskyLine, step, 40);
        expect(r.reached, f.name).toBe(true);
        if (salvage[k]) continue;
        // a faster line beats the racing line between the same two points
        const lineSec = (nearest(f.riskyLine[f.riskyLine.length - 1].pos) - i0) * TICK_DT;
        expect(
          r.timeSec,
          `${f.name}: ${r.timeSec.toFixed(1)} s vs the line's ${lineSec.toFixed(1)} s`,
        ).toBeLessThan(lineSec - 0.5);
      }
    },
    60000,
  );

  it.runIf(!!revamp?.jetpack)(
    'rebuilt, jetpack: saving fuel opens the fastest line; a respawn never refills the tank',
    () => {
      const m = defaultConfig().movement;
      // the last burn is the fuel line (the racing line): a full tank clears it, the tank a long
      // burn earlier (0.8 s of the 1.6 s) leaves does not (there is no climbing over its hot lip)
      const jets = race.line.map((n, i) => [n, i] as const).filter(([n]) => n.jet);
      expect(jets.length).toBeGreaterThanOrEqual(3);
      const [lift, li] = jets[jets.length - 1];
      const nodes = race.line.slice(li - 1, li + 4);
      const lifts = (fuel: number) => {
        const { ctx, world, config } = sim(def);
        const a = nodes[0].pos;
        const b = nodes[1].pos;
        const yaw = headingYaw((Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI);
        const p = addPlayer(world, createPlayer(1, 0, a, yaw, config));
        resetRacer(p, config.movement, a, yaw, lift.cp);
        p.jetFuel = fuel;
        return driveNodes(ctx, world, p, nodes, step, 20).reached;
      };
      expect(lifts(m.raceJetpackFuelSec), 'a full tank lifts').toBe(true);
      expect(lifts(0.8), 'a tank half burnt does not').toBe(false);
      // with too little fuel you take the dry way (a salvage line in the same section): slower
      const dry = (race.forks ?? []).findIndex(
        (f, k) => f.cp === lift.cp && data.forks?.[k]?.salvage,
      );
      expect(dry, 'a dry way on').toBeGreaterThanOrEqual(0);
      const f = race.forks![dry];
      const { track } = cleanOf(def);
      const nearest = (q: { x: number; y: number; z: number }): number => {
        let best = 0;
        let bd = Infinity;
        track.forEach((t, i) => {
          const d = Math.hypot(t.x - q.x, t.y - q.y, t.z - q.z);
          if (d < bd) {
            bd = d;
            best = i;
          }
        });
        return best;
      };
      const { ctx, world, config } = sim(def);
      const a = f.riskyLine[0].pos;
      const b = f.riskyLine[1].pos;
      const yaw = headingYaw((Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI);
      const p = addPlayer(world, createPlayer(1, 0, a, yaw, config));
      resetRacer(p, config.movement, a, yaw, f.cp);
      const ride = driveNodes(ctx, world, p, f.riskyLine, step, 30);
      expect(ride.reached).toBe(true);
      const lineSec = (nearest(f.riskyLine[f.riskyLine.length - 1].pos) - nearest(a)) * TICK_DT;
      const loss = ride.timeSec - lineSec;
      expect(loss, 'the fuel line saves time').toBeGreaterThan(1);
      // a dry rider can't refill by respawning: the room before the lift gives back the fuel
      // they had when they passed it (sim/race.ts), not a full tank
      const room = race.checkpoints[lift.cp - 1];
      p.raceCp = lift.cp;
      p.raceAnchor = -1;
      p.raceFuelKept = 0.2;
      p.jetFuel = 0;
      sendRacerBack(world, ctx, p, 'key');
      expect(p.pos.x).toBeCloseTo(room.respawn.x, 3);
      expect(p.jetFuel).toBeCloseTo(0.2, 5);
    },
    120000,
  );
});
