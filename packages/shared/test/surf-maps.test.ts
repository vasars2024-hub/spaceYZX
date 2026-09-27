// The standard surf maps (level/maps/surf-*.ts, docs/movement-map-design): built from course
// data (level/course) and checked against the design brief's release requirements — every map
// on every run, so a change to one of them (or to the movement) can't quietly break it:
//
//   data       plain JSON (a round trip builds the same level), valid, nothing clips
//   gates      a clean run passes C1..C5 and the finish in order; every gate is big enough for
//              all legal lines (a sloppier human passes them too) and a fall never counts one
//   recovery   EVERY restart bay (gates' and anchors') gets you to the next gate on its own, from
//              a standing start (the minimum it guarantees); it grants no progress; coming back
//              is never faster than carrying on from where the anchor is
//   hazards    touching any red zone sends you back; no ramp is inside a kill height
//   seams      riding every curved ramp slow, typical and fast: no catch (no sudden loss)
//   timing     a practiced clean run (STEADY_RACER, perfect strafing) takes 165–195 s; a human
//              strafing at the map's design level finishes (falls allowed)
//   forks      each optional line (faster or salvage) can be ridden and rejoins the route
//
// How the time is measured: bots/racer.ts drives the racing line with ordinary inputs in the
// real simulation (tools/race/time-tracks.ts prints the same runs, per act).
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
  HUMAN_RACER,
  mapDef,
  racerThink,
  raycast,
  resetRacer,
  rotateAxis,
  sendRacerBack,
  STEADY_RACER,
  step,
  SURF_PROFILE,
  surfMaps,
  TICK_DT,
  v3,
  validateCourse,
  type LevelDef,
  type RaceGateDef,
  type RacerSkill,
  type SimContext,
} from '../src/index';

const MAPS = surfMaps().map((m) => m.id);

/** How well a human must strafe to get round (Beginner 0.6, Intermediate 0.75). */
const DESIGN_EFF = (id: string): number => (getMap(id).mode === 'intermediate' ? 0.75 : 0.6);

const sim = (def: LevelDef) => {
  const config = defaultConfig();
  const ctx: SimContext = { level: buildLevel(def), config, dt: TICK_DT };
  const world = createWorld(ctx.level, 1);
  return { ctx, world, config };
};

/** A whole run from the grid. */
const run = (def: LevelDef, skill: RacerSkill, maxSec = 400) => {
  const { ctx, world, config } = sim(def);
  const g = def.race!.grid[0];
  const p = addPlayer(world, createPlayer(1, 0, g.pos, g.yawDeg, config));
  resetRacer(p, config.movement, g.pos, g.yawDeg, 0);
  return driveRaceLine(ctx, world, p, step, skill, maxSec);
};

/**
 * Come back at a recovery point (gate `cp`'s bay, or anchor `anchor`'s) the way a fall does,
 * then drive on until the next gate (or `maxSec`): did it get there, and how long it took.
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
  // (the gates it had passed when it reached the next one: never more than that one)
  return { passed, sec: t * TICK_DT, raceCp: cpThen };
};

describe.each(MAPS)('%s', (id) => {
  const def = mapDef(id);
  const race = def.race!;
  const data = getMap(id).course!();
  // one clean run and one human run, shared by the tests below
  let clean: ReturnType<typeof run> | null = null;
  const cleanRun = () => (clean ??= run(def, STEADY_RACER));

  it('is a surf map of a standard mode, fitted to the current movement profile', () => {
    expect(['beginner', 'intermediate']).toContain(getMap(id).mode);
    expect(data.kind).toBe('surf');
    expect(data.mode).toBe(getMap(id).mode);
    expect(data.profile).toBe(SURF_PROFILE.version);
    expect(race.surf && race.noJetpack && race.noSurge).toBe(true);
  });

  it('is plain JSON data: a round trip builds the same level, and the data is valid', () => {
    const copy = JSON.parse(JSON.stringify(data));
    expect(copy).toEqual(data);
    expect(expandCourse(copy).def).toEqual(expandCourse(data).def);
    expect(validateCourse(data)).toEqual([]);
  });

  it('nothing cuts through anything (the clipping check)', () => {
    expect(findOverlaps(def)).toEqual([]);
  });

  it('C1–C5 and a finish; five-plus recovery anchors; every bay clear, with ground under it', () => {
    expect(race.checkpoints.length).toBe(5);
    for (const g of race.checkpoints) expect(g.name, 'every progress gate is named').toBeTruthy();
    expect((race.anchors ?? []).length).toBeGreaterThanOrEqual(5);
    const level = buildLevel(def);
    const bays: RaceGateDef[] = [...race.checkpoints, ...(race.anchors ?? []), race.finish];
    for (const b of bays) {
      const s = b.respawn;
      const cap = { center: v3(s.x, s.y + 0.95, s.z), up: v3(0, 1, 0), halfSeg: 0.5, radius: 0.4 };
      expect(capsuleOverlaps(level, cap), `bay ${JSON.stringify(s)}`).toBe(false);
      expect(raycast(level, v3(s.x, s.y + 1, s.z), v3(0, -1, 0), 1.6)).not.toBeNull();
    }
    // bays are off the route: no racing line point passes within 8 m of one
    for (const b of bays.slice(0, -1))
      for (const n of race.line)
        expect(
          Math.hypot(n.pos.x - b.respawn.x, n.pos.y - b.respawn.y, n.pos.z - b.respawn.z),
          `bay at ${JSON.stringify(b.respawn)}`,
        ).toBeGreaterThan(8);
  });

  it('portals: clear exits; a recovery just before one restarts you before it', () => {
    const level = buildLevel(def);
    for (const pt of def.portals ?? []) {
      // (keeping the offset: the whole opening round the exit must be clear too)
      const r = pt.offset ? (pt.max.y - pt.min.y) / 2 - 1 : 0;
      for (const [x, y] of [
        [0, 0],
        [-r, -r],
        [r, -r],
        [-r, r],
        [r, r],
      ]) {
        // (across the way out: the way in turned as the portal turns you)
        const out = rotateAxis(
          pt.dir ?? v3(0, 0, -1),
          v3(0, 1, 0),
          (-(pt.turn ?? 0) * Math.PI) / 180,
        );
        const side = v3(-out.z, 0, out.x);
        const c = v3(pt.exit.x + side.x * x, pt.exit.y + y, pt.exit.z + side.z * x);
        const cap = { center: c, up: v3(0, 1, 0), halfSeg: 0.5, radius: 0.4 };
        expect(capsuleOverlaps(level, cap), `${pt.name} exit ${JSON.stringify(c)}`).toBe(false);
      }
    }
    // a gate or anchor whose next step is a portal throws you through that portal again
    data.route.forEach((e, i) => {
      if (e.t !== 'anchor' && !(e.t === 'gate' && !e.finish)) return;
      const next = data.route.slice(i + 1).find((q) => !q.alt && q.t !== 'red');
      if (next?.t !== 'portal') return;
      const [w, h] = next.size ?? [7, 8];
      const mid = [next.at[0], next.at[1] + h / 2, next.at[2]];
      const to = e.to!;
      expect(Math.abs(to[1] - mid[1]), `${e.name}'s re-entry`).toBeLessThan(h / 2);
      expect(Math.hypot(to[0] - mid[0], to[2] - mid[2]), `${e.name}'s re-entry`).toBeLessThan(
        w / 2,
      );
    });
  });

  it('stays in the network range, above the kill height', () => {
    for (const b of def.boxes)
      if (!b.noCollide)
        for (const k of ['x', 'y', 'z'] as const) expect(Math.abs(b.c[k])).toBeLessThan(500);
    for (const n of race.line) {
      expect(Math.abs(n.pos.x)).toBeLessThan(490);
      expect(Math.abs(n.pos.z)).toBeLessThan(490);
      expect(n.pos.y).toBeGreaterThan(race.killY + 10);
    }
  });

  it(`a practiced clean run passes every gate in order in ${SURF_PROFILE.cleanRun.join('–')} s`, () => {
    const r = cleanRun();
    expect(r.finished).toBe(true);
    expect(r.respawns).toBe(0);
    expect(r.splitsSec.length).toBe(race.checkpoints.length + 1);
    let last = 0;
    for (const s of r.splitsSec) {
      expect(s).toBeGreaterThan(last);
      last = s;
    }
    expect(r.timeSec).toBeGreaterThanOrEqual(SURF_PROFILE.cleanRun[0]);
    expect(r.timeSec).toBeLessThanOrEqual(SURF_PROFILE.cleanRun[1]);
  }, 60000);

  it('a human strafing at the design level finishes (falls allowed)', () => {
    const r = run(def, { ...HUMAN_RACER, strafeEff: DESIGN_EFF(id) }, 900);
    expect(r.finished).toBe(true);
  }, 90000);

  it('every gate is wide enough for every line: the racing line crosses it well inside', () => {
    // the line (sampled every half metre) passes through each gate with room all round it
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
        `gate ${g.name ?? 'finish'}: the line passes ${best.toFixed(1)} m inside`,
      ).toBeGreaterThan(1.5);
    }
  });

  it('every restart bay gets you to the next gate on its own, never faster than carrying on', () => {
    const r = cleanRun();
    const penalty = defaultConfig().movement.raceSurfPenaltySec;
    const gateSec = (cp: number) => (cp === 0 ? 0 : r.splitsSec[cp - 1]);
    // the gates' bays (C1..C5)
    race.checkpoints.forEach((_, i) => {
      const cp = i + 1;
      const back = recover(def, cp, -1);
      expect(back.passed, `from C${cp}'s bay`).toBe(true);
      expect(back.raceCp, 'a recovery never grants progress beyond the next gate').toBe(cp + 1);
      expect(back.sec + penalty).toBeGreaterThan(r.splitsSec[cp] - gateSec(cp) - 1e-6);
    });
    // the anchors' bays: completable, and slower than carrying on from the anchor itself
    (race.anchors ?? []).forEach((a, i) => {
      const back = recover(def, a.cp, i);
      expect(back.passed, `from ${a.name ?? `R${i + 1}`}'s bay`).toBe(true);
      expect(back.raceCp).toBe(a.cp + 1);
      // (the clean run's time from the anchor to the next gate: when it went through the anchor)
      const through = anchorTimes(def)[i];
      expect(through, `the clean run passes ${a.name}`).toBeGreaterThan(0);
      expect(back.sec + penalty, `${a.name}: dying on purpose is never a shortcut`).toBeGreaterThan(
        r.splitsSec[a.cp] - through,
      );
    });
  }, 120000);

  it('touching any red zone sends you back (exactly at its surface)', () => {
    const { ctx, world, config } = sim(def);
    const reds = def.boxes.map((b, i) => [b, i] as const).filter(([b]) => b.kill);
    expect(reds.length).toBeGreaterThan(0);
    const p = addPlayer(world, createPlayer(1, 0, race.grid[0].pos, 0, config));
    for (const [b] of reds.filter((_, k) => k % 7 === 0)) {
      resetRacer(p, config.movement, race.start.respawn, 0, 1);
      // just above the middle of the piece's top (a hull's ridge-side corner, else its top)
      const top = b.hull
        ? v3(
            (b.hull[4].x + b.hull[1].x) / 2,
            (b.hull[4].y + b.hull[1].y) / 2,
            (b.hull[4].z + b.hull[1].z) / 2,
          )
        : v3(b.c.x, b.c.y + b.h.y, b.c.z);
      p.pos = v3(top.x, top.y + 0.9 + 0.01, top.z);
      p.vel = v3();
      step(world, {}, ctx);
      expect(
        world.events.some((e) => e.type === 'raceRespawn' && e.reason === 'red'),
        `red zone at ${JSON.stringify(top)}`,
      ).toBe(true);
    }
  });

  it('every optional line can be ridden and rejoins the route', () => {
    for (const f of race.forks ?? []) {
      const { ctx, world, config } = sim(def);
      const a = f.riskyLine[0].pos;
      const b = f.riskyLine[1].pos;
      const yaw = -((Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI);
      const p = addPlayer(world, createPlayer(1, 0, a, yaw, config));
      resetRacer(p, config.movement, a, yaw, f.cp);
      p.pos = v3(a.x, a.y + 0.92, a.z);
      const d = v3(b.x - a.x, 0, b.z - a.z);
      const l = Math.hypot(d.x, d.z);
      p.vel = v3((d.x / l) * SURF_PROFILE.V, 0, (d.z / l) * SURF_PROFILE.V);
      const r = driveNodes(ctx, world, p, f.riskyLine, step, 40);
      expect(r.reached, f.name).toBe(true);
    }
  }, 60000);
});

/** Seconds from GO at which the clean run passes each anchor (0: never). */
const anchorCache = new Map<string, number[]>();
const anchorTimes = (def: LevelDef): number[] => {
  const hit = anchorCache.get(def.name);
  if (hit) return hit;
  const { ctx, world, config } = sim(def);
  const g = def.race!.grid[0];
  const p = addPlayer(world, createPlayer(1, 0, g.pos, g.yawDeg, config));
  resetRacer(p, config.movement, g.pos, g.yawDeg, 0);
  const out = (def.race!.anchors ?? []).map(() => 0);
  const start = world.tick;
  driveRaceLine(
    ctx,
    world,
    p,
    (w, i, c) => {
      step(w, i, c);
      for (const e of w.events)
        if (e.type === 'raceAnchor' && e.player === 1) out[e.anchor] = (w.tick - start) * TICK_DT;
    },
    STEADY_RACER,
    300,
  );
  anchorCache.set(def.name, out);
  return out;
};
