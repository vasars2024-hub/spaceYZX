// Thirty Doors (level/maps/surf-thirty-doors.ts, docs/movement-map-design/maps/X01-thirty-doors.md):
// a stage surf map of thirty sealed rooms, easy to extreme. It is not a standard 3-minute map
// (thirty gates, ~5 minutes: surf-maps.test.ts's release checks don't fit it), so it is checked
// here on its own terms — the same kinds of checks, ported, plus what makes it a stage map:
//
//   data       plain JSON (a round trip builds the same level), valid, nothing clips, in range
//   rooms      thirty, in order, each named over its gate ("n · NAME") with its own gimmick;
//              every room's door is a portal marked with the next room's number, coming out
//              level into a speed ring that sets that room's level speed (so every room starts
//              the same, however you came in); the door exits and every portal exit are clear
//   recovery   a fall anywhere in a room brings you back to that room's start (its restart bay,
//              never an earlier room); every bay is clear, with ground under it, off the route;
//              from every bay the racing-line bot clears the room on its own, and coming back is
//              never faster than carrying on
//   timing     a practiced clean run (STEADY_RACER) clears all thirty rooms in order without a
//              fall in 250–310 s, no room shorter than 5 s or longer than 20 s; a human strafing
//              at 0.6 finishes (falls allowed)
//   devices    red zones kill at their surface; booster rings set the speed they say
//   difficulty the rooms get harder in order: faster starts, smaller doors, tighter faces and
//              bends, smaller windows, more red (teach → medium → hard → extreme)
//   look       every room is walled in its wing's colour and numbered on its far wall
import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  buildLevel,
  capsuleOverlaps,
  createPlayer,
  createRacerMemory,
  createWorld,
  defaultConfig,
  driveRaceLine,
  expandCourse,
  findOverlaps,
  HUMAN_RACER,
  pointInAabb,
  racerThink,
  raycast,
  resetRacer,
  rotateAxis,
  sendRacerBack,
  STEADY_RACER,
  step,
  SURF_PROFILE,
  TICK_DT,
  v3,
  validateCourse,
  type CourseData,
  type LevelDef,
  type RacerSkill,
  type RouteElement,
  type SimContext,
} from '../src/index';
import {
  THIRTY_DOORS_ROOMS as ROOMS,
  THIRTY_DOORS_SPEED as SPEED,
  thirtyDoorsCourse,
  type DoorLevel,
} from '../src/level/maps/surf-thirty-doors';

const data: CourseData = thirtyDoorsCourse();
const def: LevelDef = expandCourse(data).def;
const race = def.race!;
const config = defaultConfig();
// (the level is built once: every run below starts a fresh world on it)
const ctx: SimContext = { level: buildLevel(def), config, dt: TICK_DT };
const LEVELS: DoorLevel[] = ['teach', 'medium', 'hard', 'extreme'];

/** A racer standing at `feet` facing `yaw`, with `cp` gates passed. */
const racer = (feet = race.grid[0].pos, yaw = race.grid[0].yawDeg, cp = 0) => {
  const world = createWorld(ctx.level, 1);
  const p = addPlayer(world, createPlayer(1, 0, feet, yaw, config));
  resetRacer(p, config.movement, feet, yaw, cp);
  return { world, p };
};

/** A whole run from the grid. */
const run = (skill: RacerSkill, maxSec = 700) => {
  const { world, p } = racer();
  return driveRaceLine(ctx, world, p, step, skill, maxSec);
};
let clean: ReturnType<typeof run> | null = null;
const cleanRun = () => (clean ??= run(STEADY_RACER));

/**
 * Come back at room `cp`'s restart bay the way a fall does, then drive on until the next gate
 * (or `maxSec`): did it get there, how long it took, the gates passed by then.
 */
const recover = (cp: number, maxSec = 60) => {
  const at = race.checkpoints[cp - 1];
  const { world, p } = racer(at.respawn, at.yawDeg, cp);
  // (racing somewhere else in the room, as the bot sees it; then a fall brings it back)
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

/** The route split into rooms (room n: from its gate to the next; 0: the start). */
const roomRoutes = (): RouteElement[][] => {
  const out: RouteElement[][] = [[]];
  for (const e of data.route) {
    if (e.t === 'gate' && !e.finish) out.push([]);
    out[out.length - 1].push(e);
  }
  return out;
};

/** The door portals (marked with the next room's number), in order. */
const doors = () => (def.portals ?? []).filter((pt) => /^\d+$/.test(pt.glyph ?? ''));

describe('surf-thirty-doors', () => {
  it('is a surf map fitted to the current movement profile: no jetpack, no SURGE', () => {
    expect(data.kind).toBe('surf');
    expect(data.profile).toBe(SURF_PROFILE.version);
    expect(race.surf && race.noJetpack && race.noSurge).toBe(true);
    expect(data.parSec).toBeGreaterThanOrEqual(250);
  });

  it('is plain JSON data: a round trip builds the same level, and the data is valid', () => {
    const copy = JSON.parse(JSON.stringify(data));
    expect(copy).toEqual(data);
    expect(expandCourse(copy).def).toEqual(def);
    expect(validateCourse(data)).toEqual([]);
  });

  it('nothing cuts through anything (the clipping check)', () => {
    expect(findOverlaps(def)).toEqual([]);
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

  it('thirty rooms in order, each named over its gate, easy to extreme', () => {
    expect(ROOMS.length).toBe(30);
    ROOMS.forEach((r, i) => expect(r.n).toBe(i + 1));
    expect(new Set(ROOMS.map((r) => r.name)).size).toBe(30);
    for (const r of ROOMS) expect(r.idea.length).toBeGreaterThan(20);
    // five to teach, five medium, ten hard, ten extreme — never easier than the room before
    const count = (l: DoorLevel) => ROOMS.filter((r) => r.level === l).length;
    expect(LEVELS.map(count)).toEqual([5, 5, 10, 10]);
    for (let i = 1; i < 30; i++)
      expect(LEVELS.indexOf(ROOMS[i].level)).toBeGreaterThanOrEqual(
        LEVELS.indexOf(ROOMS[i - 1].level),
      );
    // a progress gate per room (its split), named "n · NAME", then the finish
    expect(race.checkpoints.length).toBe(30);
    race.checkpoints.forEach((g, i) =>
      expect(g.name).toBe(`${i + 1} · ${ROOMS[i].name.toUpperCase()}`),
    );
    expect(race.finish).toBeTruthy();
  });

  it("every room's door is a portal marked with the next room's number, into a speed ring", () => {
    const ds = doors();
    expect(ds.map((d) => d.glyph)).toEqual(ROOMS.slice(1).map((r) => String(r.n)));
    for (const [i, d] of ds.entries()) {
      const next = ROOMS[i + 1];
      // (you come out level, heading south: every room starts the same way)
      expect(d.vertical).toBe('zero');
      const out = rotateAxis(d.dir!, v3(0, 1, 0), (-(d.turn ?? 0) * Math.PI) / 180);
      expect(out.z).toBeCloseTo(1, 5);
      // the ring sets the room's level speed, whatever you came in with
      for (const vIn of [v3(45, -10, 0), v3(0, 0, 18), v3(-20, 5, 30)]) {
        const { world, p } = racer(v3(d.exit.x, d.exit.y - 0.95, d.exit.z), 0, next.n - 1);
        p.pos = { ...d.exit };
        p.vel = vIn;
        p.grounded = false;
        step(world, {}, ctx);
        expect(Math.hypot(p.vel.x, p.vel.z), `door into ${next.n}`).toBeCloseTo(
          SPEED[next.level],
          1,
        );
        expect(p.vel.z).toBeGreaterThan(0);
      }
    }
  });

  it('portal exits are clear (offset ones: the whole opening round them)', () => {
    for (const pt of def.portals ?? []) {
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
        expect(capsuleOverlaps(ctx.level, cap), `${pt.name} exit ${JSON.stringify(c)}`).toBe(false);
      }
    }
  });

  it('every restart bay is clear, with ground under it, and off the route', () => {
    const bays = [...race.checkpoints, race.finish];
    for (const b of bays) {
      const s = b.respawn;
      const cap = { center: v3(s.x, s.y + 0.95, s.z), up: v3(0, 1, 0), halfSeg: 0.5, radius: 0.4 };
      expect(capsuleOverlaps(ctx.level, cap), `bay ${JSON.stringify(s)}`).toBe(false);
      expect(raycast(ctx.level, v3(s.x, s.y + 1, s.z), v3(0, -1, 0), 1.6)).not.toBeNull();
    }
    for (const b of race.checkpoints)
      for (const n of race.line)
        expect(
          Math.hypot(n.pos.x - b.respawn.x, n.pos.y - b.respawn.y, n.pos.z - b.respawn.z),
          `bay at ${JSON.stringify(b.respawn)}`,
        ).toBeGreaterThan(8);
  });

  it("a fall anywhere in a room brings you back to that room's start, never an earlier one", () => {
    const kills = race.killVolumes ?? [];
    for (let n = 1; n <= 30; n++) {
      const nodes = race.line.filter((q, i) => q.cp === n && !race.line[i - 1]?.portal);
      expect(nodes.length).toBeGreaterThan(5);
      for (const q of nodes.filter((_, i) => i % 6 === 0)) {
        // falling straight down from the line ends in the room's cloud sea within 90 m
        let under: { x: number; y: number; z: number } | null = null;
        for (let d = 1; d <= 90 && !under; d++) {
          const at = v3(q.pos.x, q.pos.y + 0.9 - d, q.pos.z);
          if (kills.some((k) => pointInAabb(at, k.min, k.max))) under = at;
        }
        expect(under, `room ${n}: no floor under ${JSON.stringify(q.pos)}`).not.toBeNull();
        // and landing in it puts you back in this room's restart bay
        const { world, p } = racer(race.checkpoints[n - 1].respawn, 0, n);
        p.pos = v3(under!.x, under!.y, under!.z);
        world.events.length = 0;
        step(world, {}, ctx);
        const back = world.events.find((e) => e.type === 'raceRespawn');
        expect(back, `room ${n}`).toBeTruthy();
        expect(p.raceCp).toBe(n);
        const bay = race.checkpoints[n - 1].respawn;
        expect(Math.hypot(p.pos.x - bay.x, p.pos.z - bay.z)).toBeLessThan(0.01);
      }
    }
  });

  it('a practiced clean run clears all thirty rooms in order, without a fall, in 250–310 s', () => {
    const r = cleanRun();
    expect(r.finished).toBe(true);
    expect(r.respawns).toBe(0);
    expect(r.splitsSec.length).toBe(31);
    let last = 0;
    for (const [i, s] of r.splitsSec.entries()) {
      expect(s).toBeGreaterThan(last);
      // (every room is a real challenge, none a slog: gate n + 1 − gate n)
      if (i > 0) {
        expect(s - last, `room ${i}`).toBeGreaterThan(5);
        expect(s - last, `room ${i}`).toBeLessThan(20);
      }
      last = s;
    }
    expect(r.timeSec).toBeGreaterThanOrEqual(250);
    expect(r.timeSec).toBeLessThanOrEqual(310);
    // (par is a good run: the practiced clean run, rounded)
    expect(Math.abs(r.timeSec - data.parSec)).toBeLessThan(20);
  }, 60000);

  it('from every restart bay the bot clears the room on its own; dying is never a shortcut', () => {
    const r = cleanRun();
    const penalty = config.movement.raceSurfPenaltySec;
    for (let cp = 1; cp <= 30; cp++) {
      const back = recover(cp);
      expect(back.passed, `from room ${cp}'s bay`).toBe(true);
      expect(back.raceCp, 'a recovery never grants progress beyond the next gate').toBe(cp + 1);
      expect(back.sec + penalty, `room ${cp}`).toBeGreaterThan(
        r.splitsSec[cp] - r.splitsSec[cp - 1],
      );
    }
  }, 120000);

  it('a human strafing at 0.6 finishes (falls allowed)', () => {
    const r = run({ ...HUMAN_RACER, strafeEff: 0.6 }, 1200);
    expect(r.finished).toBe(true);
  }, 90000);

  it('touching any red zone sends you back (exactly at its surface)', () => {
    const reds = def.boxes.filter((b) => b.kill);
    expect(reds.length).toBeGreaterThan(100);
    const { world, p } = racer();
    for (const b of reds.filter((_, k) => k % 5 === 0)) {
      resetRacer(p, config.movement, race.start.respawn, 0, 1);
      const top = b.hull
        ? v3(
            (b.hull[4].x + b.hull[1].x) / 2,
            (b.hull[4].y + b.hull[1].y) / 2,
            (b.hull[4].z + b.hull[1].z) / 2,
          )
        : v3(b.c.x, b.c.y + b.h.y, b.c.z);
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
  });

  it('portals inside the rooms keep your speed and turn you exactly as they say', () => {
    const inner = (def.portals ?? []).filter((pt) => !/^\d+$/.test(pt.glyph ?? ''));
    // Turnaround 1, Quarter Turns 2, Portal Maze 3, Chain Reaction 4, The Gauntlet 1
    expect(inner.length).toBe(11);
    const headingOf = (x: number, z: number) =>
      ((((Math.atan2(x, -z) * 180) / Math.PI) % 360) + 360) % 360;
    for (const pt of inner) {
      const dir = pt.dir!;
      const right = v3(-dir.z, 0, dir.x);
      const mid = v3(
        (pt.min.x + pt.max.x) / 2,
        (pt.min.y + pt.max.y) / 2,
        (pt.min.z + pt.max.z) / 2,
      );
      const w = Math.abs(dir.x) > 0.5 ? pt.max.z - pt.min.z : pt.max.x - pt.min.x;
      // (the middle and 1.5 m inside either edge, at 30 and 40 m/s, level and falling)
      for (const across of [0, w / 2 - 1.5, 1.5 - w / 2])
        for (const [speed, vy] of [
          [30, 0],
          [40, -8],
        ]) {
          const start = v3(
            mid.x - dir.x * 4 + right.x * across,
            mid.y,
            mid.z - dir.z * 4 + right.z * across,
          );
          const { world, p } = racer(v3(start.x, start.y - 0.9, start.z), 0, 1);
          p.pos = start;
          p.vel = v3(dir.x * speed, vy, dir.z * speed);
          p.grounded = false;
          let fired = 0;
          for (let t = 0; t < 12 && !fired; t++) {
            step(world, {}, ctx);
            fired = world.events.filter((e) => e.type === 'portal').length;
          }
          const tag = `${pt.glyph} at ${across.toFixed(1)}, ${speed} m/s`;
          expect(fired, tag).toBe(1);
          expect(Math.hypot(p.vel.x, p.vel.z), tag).toBeCloseTo(speed, 1);
          const want = (headingOf(dir.x, dir.z) + (pt.turn ?? 0) + 360) % 360;
          const got = headingOf(p.vel.x, p.vel.z);
          expect(Math.abs(((got - want + 540) % 360) - 180), tag).toBeLessThan(0.5);
        }
    }
  });

  it('booster rings in the rooms set the speed they say (Slingshot, Cannon)', () => {
    const doorExits = doors().map((d) => d.exit);
    const rings = (def.launchPads ?? []).filter(
      (l) =>
        // (not a door's speed ring, not a restart bay's launch)
        !doorExits.some((x) => pointInAabb(x, l.min, l.max)) &&
        !race.checkpoints.some((g) =>
          g.bayLine?.some((q) => pointInAabb(v3(q.pos.x, q.pos.y + 0.9, q.pos.z), l.min, l.max)),
        ),
    );
    expect(rings.length).toBe(3);
    for (const l of rings) {
      const c = v3((l.min.x + l.max.x) / 2, (l.min.y + l.max.y) / 2, (l.min.z + l.max.z) / 2);
      const { world, p } = racer(v3(c.x, c.y - 0.9, c.z), 0, 1);
      p.pos = c;
      p.vel = v3(3, -12, 25);
      p.grounded = false;
      step(world, {}, ctx);
      expect(Math.hypot(p.vel.x, p.vel.z)).toBeGreaterThanOrEqual(36);
      expect(Math.hypot(p.vel.x, p.vel.z)).toBeCloseTo(Math.hypot(l.vel.x, l.vel.z), 1);
    }
  });

  it('every racing-line point has ≥ 3 m of head room under anything solid (red limits apart)', () => {
    const up = v3(0, 1, 0);
    let worst = Infinity;
    let where = '';
    for (const n of race.line) {
      if (n.portal) continue;
      let from = v3(n.pos.x, n.pos.y + SURF_PROFILE.H, n.pos.z);
      let gone = 0;
      for (let tries = 0; tries < 8; tries++) {
        const hit = raycast(ctx.level, from, up, 30 - gone);
        if (!hit) break;
        const b = ctx.level.boxes[hit.box];
        if (b.kill || !b.collide) {
          from = v3(from.x, hit.point.y + 0.05, from.z);
          gone += hit.t + 0.05;
          continue;
        }
        if (gone + hit.t < worst) {
          worst = gone + hit.t;
          where = `${n.pos.x.toFixed(1)}, ${n.pos.y.toFixed(1)}, ${n.pos.z.toFixed(1)}`;
        }
        break;
      }
    }
    expect(worst, `tightest head room at ${where}`).toBeGreaterThanOrEqual(3);
  });

  it('the rooms get harder in order: faster, smaller doors, tighter faces and bends, more red', () => {
    const routes = roomRoutes();
    const stats = ROOMS.map((room) => {
      const els = routes[room.n].filter((e) => !e.alt);
      const curves = els.filter((e) => e.t === 'curve');
      const radii = curves.flatMap((e) =>
        e.legs.flatMap((l) => (l.turn ? [l.radius ?? 20, l.toRadius ?? l.radius ?? 20] : [])),
      );
      const windows = els.flatMap((e) => (e.t === 'window' ? [e.hole[0]] : []));
      const red =
        els.filter((e) => e.t === 'red').length +
        curves.filter((e) => e.red !== undefined || e.legs.some((l) => typeof l.red === 'number'))
          .length;
      return {
        level: room.level,
        face: Math.min(...curves.map((e) => e.height)),
        radius: Math.min(Infinity, ...radii),
        window: Math.min(Infinity, ...windows),
        red,
        door: room.door[0],
      };
    });
    const of = (l: DoorLevel) => stats.filter((s) => s.level === l);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    for (let i = 1; i < LEVELS.length; i++) {
      const [a, b] = [of(LEVELS[i - 1]), of(LEVELS[i])];
      // faster starts, smaller doors
      expect(SPEED[LEVELS[i]]).toBeGreaterThan(SPEED[LEVELS[i - 1]]);
      expect(Math.max(...b.map((s) => s.door))).toBeLessThan(Math.min(...a.map((s) => s.door)));
      // tighter faces (the smallest face of each room, on average)
      expect(mean(b.map((s) => s.face))).toBeLessThan(mean(a.map((s) => s.face)));
      // tighter bends, smaller windows (where a level has them)
      const tight = (xs: typeof a) => Math.min(...xs.map((s) => s.radius));
      if (i >= 2) expect(tight(b)).toBeLessThan(tight([...a, ...of(LEVELS[i - 2])]));
      const win = (xs: typeof a) => Math.min(...xs.map((s) => s.window));
      if (i >= 2) expect(win(b)).toBeLessThan(win(a));
      // more rooms with red zones
      expect(b.filter((s) => s.red > 0).length).toBeGreaterThanOrEqual(
        a.filter((s) => s.red > 0).length,
      );
    }
    // the first ten rooms have no red at all; most extreme rooms do
    expect(stats.slice(0, 10).every((s) => s.red === 0)).toBe(true);
    expect(of('extreme').filter((s) => s.red > 0).length).toBeGreaterThanOrEqual(6);
    // the teaching rooms: wide faces only (16–18 m), gentle bends (≥ 80 m)
    for (const s of of('teach')) {
      expect(s.face).toBeGreaterThanOrEqual(16);
      expect(s.radius).toBeGreaterThanOrEqual(80);
    }
  });

  it('every room is walled in and numbered on its far wall', () => {
    const blocks = (data.scenery ?? []).filter(
      (s): s is Extract<typeof s, { t: 'block' }> => s.t === 'block',
    );
    const walls = blocks.filter(
      (b) => !b.mat && b.size[1] > 40 && Math.min(b.size[0], b.size[2]) <= 2,
    );
    expect(walls.length).toBe(4 * 30);
    // (the digits: glowing bars on the south walls, 1–2 digits a room)
    const digits = blocks.filter((b) => b.mat === 'glow' && b.size[2] === 0.6 && b.size[1] >= 2);
    expect(digits.length).toBeGreaterThan(30 * 3);
    // nothing of the shells collides
    expect(blocks.every((b) => !b.solid)).toBe(true);
  });
});
