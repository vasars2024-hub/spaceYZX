import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  applyBotObjectives,
  BOT_SKILLS,
  botThink,
  Btn,
  buildLevel,
  capsuleOverlaps,
  createBotMemory,
  createMatch,
  createPlayer,
  createWorld,
  defaultConfig,
  describeOverlap,
  findOverlaps,
  lineOfSight,
  mapDef,
  MAPS,
  qRotate,
  raycast,
  startMatch,
  step,
  TICK_DT,
  updateMatch,
  v3,
  waypointRoute,
  yawToView,
  type BotMemory,
  type BoxDef,
  type Level,
  type LevelDef,
  type PlayerInput,
  type SimContext,
  type SimEvent,
  type Vec3,
  type WorldState,
} from '../src/index';
import { AFTERGLOW, buildAfterglow } from '../src/level/maps/afterglow';

// (the registry marks the map competitive once it ships; the tests build it either way)
const def = () => mapDef('afterglow');
const level = () => buildLevel(def());
const wpIndex = (d: LevelDef, name: string) => {
  const i = d.waypoints!.findIndex((w) => w.name === name);
  if (i < 0) throw new Error(`no waypoint ${name}`);
  return i;
};
const wpPos = (d: LevelDef, name: string) => d.waypoints![wpIndex(d, name)].pos;
const standingCapsule = (feet: Vec3) => ({
  center: v3(feet.x, feet.y + 0.9, feet.z),
  up: v3(0, 1, 0),
  halfSeg: 0.45,
  radius: 0.4,
});
const key = (n: number) => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2);
const R = AFTERGLOW.roof;
const Y = AFTERGLOW.rail;
const P = AFTERGLOW.plaza.y;

const withBlocked = (d: LevelDef, names: string[]): LevelDef => {
  const blocked = new Set(names.map((n) => wpIndex(d, n)));
  return {
    ...d,
    waypoints: d.waypoints!.map((w, i) => ({
      ...w,
      links: blocked.has(i) ? [] : w.links.filter((l) => !blocked.has(l)),
    })),
  };
};

const sim = (d: LevelDef = def()) => {
  const lv = buildLevel(d);
  const config = defaultConfig();
  const ctx: SimContext = { level: lv, config, dt: TICK_DT };
  return { lv, config, ctx, world: createWorld(lv, 3) };
};

/** a box's corners in world space (a prism's six), rounded, sorted */
const corners = (b: BoxDef): string[] => {
  const { x: hx, y: hy, z: hz } = b.h;
  const local: Vec3[] = [];
  if (b.prism !== undefined)
    for (const sx of [-1, 1]) {
      local.push(v3(sx * hx, -hy, -hz), v3(sx * hx, -hy, hz), v3(sx * hx, hy, b.prism * hz));
    }
  else
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) for (const sz of [-1, 1]) local.push(v3(sx * hx, sy * hy, sz * hz));
  return local
    .map((p) => (b.q ? qRotate(b.q, p) : p))
    .map((p) => [p.x + b.c.x, p.y + b.c.y, p.z + b.c.z].map(key).join(','))
    .sort();
};
const mirrorCorners = (b: BoxDef): string[] =>
  corners(b)
    .map((s) => {
      const [x, y, z] = s.split(',').map(Number);
      return [-x, y, z].map(key).join(',');
    })
    .sort();

/** every place a player can stand, on a 1 m grid (feet), at every level */
const standingSpots = (lv: Level): Vec3[] => {
  const out: Vec3[] = [];
  for (let x = -54; x <= 54; x += 1)
    for (let z = -40; z <= 40; z += 1)
      for (const top of [20, 12.4, 7.9, 4.4, 1]) {
        const h = raycast(lv, v3(x + 0.25, top, z + 0.25), v3(0, -1, 0), 25);
        if (!h || h.normal.y < 0.7) continue;
        const feet = v3(x + 0.25, h.point.y, z + 0.25);
        if (capsuleOverlaps(lv, standingCapsule(feet))) continue;
        if (!out.some((p) => p.x === feet.x && p.z === feet.z && Math.abs(p.y - feet.y) < 0.3))
          out.push(feet);
      }
  return out;
};

describe('Afterglow map', () => {
  it('is registered, about 110 × 84 m, and dark: low ambient light, lots of neon', () => {
    const m = MAPS.find((x) => x.id === 'afterglow');
    expect(m?.build).toBe(buildAfterglow);
    expect(m?.arena).toBeFalsy();
    const d = def();
    expect(d.name).toBe('Afterglow');
    expect(d.boundsMax.x - d.boundsMin.x).toBe(112);
    expect(d.boundsMax.z - d.boundsMin.z).toBe(84);
    expect(d.boxes.length).toBeLessThan(900);
    expect(d.ambient).toBeLessThan(0.6);
    expect(d.boxes.filter((b) => b.mat === 'trim').length).toBeGreaterThan(80);
    expect(d.lights!.length).toBeGreaterThan(40);
    expect(d.sky?.moons.length).toBeGreaterThan(0);
    // the dome: a skyglass roof over the whole market
    const roof = d.boxes.find((b) => b.mat === 'skyglass' && b.c.y > AFTERGLOW.dome)!;
    expect(roof.h.x).toBeGreaterThanOrEqual(AFTERGLOW.halfX);
    expect(roof.h.z).toBeGreaterThanOrEqual(AFTERGLOW.south);
  });

  it('is mirror-symmetric across x = 0 (every box, ramps and koi too; teams swapped)', () => {
    const d = def();
    const all = new Set(d.boxes.map((b) => corners(b).join(';')));
    for (const b of d.boxes)
      expect(all.has(mirrorCorners(b).join(';')), `box at ${JSON.stringify(b.c)}`).toBe(true);
    const mir = (p: Vec3) => [-p.x, p.y, p.z].map(key).join(',');
    const at = (p: Vec3) => [p.x, p.y, p.z].map(key).join(',');
    for (const s of d.spawns)
      expect(d.spawns.some((o) => o.team !== s.team && at(o.pos) === mir(s.pos))).toBe(true);
    for (const t of d.towers)
      expect(d.towers.some((o) => o.team !== t.team && at(o.pos) === mir(t.pos))).toBe(true);
    // waypoints: named twins (…E ↔ …W), links mirrored too
    const wps = d.waypoints!;
    const twin = (n: string) =>
      n.endsWith('E') ? `${n.slice(0, -1)}W` : n.endsWith('W') ? `${n.slice(0, -1)}E` : n;
    for (const w of wps) {
      const o = wps[wpIndex(d, twin(w.name!))];
      expect(at(o.pos), w.name).toBe(mir(w.pos));
      expect(o.links.map((j) => twin(wps[j].name!)).sort()).toEqual(
        w.links.map((j) => wps[j].name!).sort(),
      );
    }
    for (const r of d.rails)
      expect(d.rails.some((o) => o.points.map(at).join() === r.points.map(mir).join())).toBe(true);
    for (const s of d.bombSites!) expect(s.min.x).toBe(-s.max.x);
    for (const p of d.powerups!) expect(p.x).toBe(0);
    for (const l of d.lights!) expect(d.lights!.some((o) => at(o.pos) === mir(l.pos))).toBe(true);
  });

  it('has no visible clipping (no two pieces of a different look cut into each other)', () => {
    const d = def();
    expect(findOverlaps(d).map((o) => describeOverlap(d, o))).toEqual([]);
  });

  it('follows the plan: open floor where the plan has ground, at every height', () => {
    const lv = level();
    const places: [string, number, number, number][] = [
      ['spawn room', 50.9, 0, -4],
      ['spawn wing', 50, 0, -17.5],
      ['spawn street', 42, 0, 0],
      ['lantern alley', 27, 0, -36],
      ['side passage', 16.5, 0, -25],
      ['arcade hall (A)', 0, 0, -28],
      ['arcade side door', 14.5, 0, -35.5],
      ['promenade', 6, 0, -16],
      ['market street', 29.5, 0, -8],
      ['market gate', 13, 0, -8],
      ['Koi Plaza', 7, P, -4],
      ['dry fountain basin', 2, P, -1.8],
      ['north rooftop', 27, R, -21],
      ['south rooftop', 27, R, 9],
      ['fire escape landing', 34.7, R, -13.75],
      ['monorail deck', 30, Y, 17.5],
      ['station, north platform', 6, Y, 13],
      ['station, in the train', 0, Y, 17.5],
      ['station, south platform', 6, Y, 22],
      ['concourse', 6, 0, 18],
      ['rail street', 30, 0, 22],
      ['overlook', 10, 0, 36],
    ];
    for (const [name, x, y, z] of places)
      for (const xx of [x, -x]) {
        expect(raycast(lv, v3(xx, y + 1, z), v3(0, -1, 0), 2)?.point.y, name).toBeCloseTo(y, 3);
        expect(capsuleOverlaps(lv, standingCapsule(v3(xx, y, z))), name).toBe(false);
      }
  });

  it('has 8 valid spawns per team in its spawn room, Towers, sites with floor, a power-up', () => {
    const d = def();
    const lv = level();
    const SR = AFTERGLOW.spawnRoom;
    for (const team of [0, 1] as const) {
      const spawns = d.spawns.filter((s) => s.team === team);
      expect(spawns.length).toBe(8);
      for (const s of spawns) {
        expect(capsuleOverlaps(lv, standingCapsule(s.pos))).toBe(false);
        expect(
          raycast(lv, v3(s.pos.x, s.pos.y + 1, s.pos.z), v3(0, -1, 0), 2)?.point.y,
        ).toBeCloseTo(s.pos.y, 3);
        const x = team === 1 ? s.pos.x : -s.pos.x;
        expect(x > SR.x0 && x < SR.x1 && s.pos.z > SR.z0 && s.pos.z < SR.z1).toBe(true);
      }
      const t = d.towers.find((x) => x.team === team)!;
      expect(t.pos.x).toBe(team === 1 ? 51 : -51);
      const w = wpPos(d, team === 1 ? 'towerE' : 'towerW');
      expect(Math.hypot(w.x - t.pos.x, w.z - t.pos.z)).toBeLessThan(
        t.radius + defaultConfig().rules.towerTouchRadius + 0.5,
      );
      const home = d.controllerHomes![team];
      expect(capsuleOverlaps(lv, standingCapsule(v3(home.x, 0, home.z)))).toBe(false);
    }
    const [A, B] = ['A', 'B'].map((n) => d.bombSites!.find((s) => s.name === n)!);
    // A in the arcade hall, B on the station platform, both across the middle
    expect(A.min.z).toBeGreaterThan(AFTERGLOW.arcade.z0);
    expect(A.max.z).toBeLessThan(AFTERGLOW.arcade.z1);
    expect(B.min.y).toBe(Y);
    for (const s of d.bombSites!) {
      const c = v3((s.min.x + s.max.x) / 2, s.min.y + 1, (s.min.z + s.max.z) / 2);
      expect(raycast(lv, c, v3(0, -1, 0), 2)?.point.y).toBeCloseTo(s.min.y, 3);
      expect(capsuleOverlaps(lv, standingCapsule(v3(c.x, s.min.y, c.z)))).toBe(false);
    }
    // the power-up floats over the dry fountain's basin, in reach
    for (const p of d.powerups!) {
      const floor = raycast(lv, p, v3(0, -1, 0), 3)!;
      expect(floor.point.y).toBeCloseTo(P, 2);
      expect(capsuleOverlaps(lv, standingCapsule(floor.point))).toBe(false);
    }
  });

  it('no spawn can be seen from anywhere outside its spawn arcade (streets, roofs, monorail)', () => {
    const lv = level();
    const spots = standingSpots(lv).filter((p) => Math.abs(p.x) < AFTERGLOW.halfX);
    // every level of the map is sampled
    for (const y of [P, 0, R, Y]) expect(spots.some((p) => Math.abs(p.y - y) < 0.05)).toBe(true);
    expect(spots.length).toBeGreaterThan(5000);
    for (const p of spots)
      for (const s of lv.def.spawns)
        for (const dy of [0.3, 1, 1.7])
          expect(
            lineOfSight(lv, v3(p.x, p.y + 1.6, p.z), v3(s.pos.x, s.pos.y + dy, s.pos.z)),
            `${JSON.stringify(p)} sees ${JSON.stringify(s.pos)}`,
          ).toBe(false);
  });

  it('waypoints sit in open space over floor, links have line of sight, all are reachable', () => {
    const lv = level();
    const wps = lv.def.waypoints!;
    for (const w of wps) {
      expect(
        capsuleOverlaps(lv, { center: w.pos, up: v3(0, 1, 0), halfSeg: 0, radius: 0.3 }),
        `waypoint ${w.name}`,
      ).toBe(false);
      expect(raycast(lv, w.pos, v3(0, -1, 0), 1.5)?.point.y, w.name).toBeCloseTo(w.pos.y - 1, 1);
      for (const j of w.links)
        expect(lineOfSight(lv, w.pos, wps[j].pos), `link ${w.name} → ${wps[j].name}`).toBe(true);
    }
    for (const from of ['towerE', 'towerW'])
      for (let i = 0; i < wps.length; i++)
        expect(waypointRoute(wps, wpIndex(lv.def, from), i).length, wps[i].name).toBeGreaterThan(0);
    // the graph covers every part of the plan: street, plaza, rooftops, monorail, both sites
    for (const name of ['siteA', 'siteB', 'pN', 'basin', 'roofN2E', 'roofS3W', 'deck1E', 'ovC'])
      expect(() => wpIndex(lv.def, name)).not.toThrow();
    const heights = new Set(wps.map((w) => key(w.pos.y - 1)));
    for (const y of [P, 0, R, Y]) expect(heights.has(key(y))).toBe(true);
  });

  it('keeps every ramp at 30° or less, and every piece of cover half or full', () => {
    const d = def();
    const rotated = d.boxes.filter((b) => b.q && !b.noCollide);
    // fire escapes (4), monorail stairs (2), station stairs (2) and ramps (2), the ramps under
    // the plaza's steps (6): all solid wedges
    expect(rotated.length).toBe(16);
    for (const b of rotated) {
      expect(b.prism).toBeDefined();
      expect((Math.atan2(b.h.y, b.h.z) * 180) / Math.PI).toBeLessThanOrEqual(30);
    }
    // cover standing on a floor is waist-high (≤ 1.25 m: see and vault over it) or taller
    // than a player (≥ 2 m): nothing in between to hide a head behind
    const floors = [P, P + 0.04, 0, R, Y];
    for (const b of d.boxes) {
      if (b.noCollide || b.q) continue;
      const y0 = b.c.y - b.h.y;
      const h = 2 * b.h.y;
      if (!floors.some((f) => Math.abs(f - y0) < 0.01)) continue;
      expect(h <= 1.25 || h >= 2, `${b.mat} at ${JSON.stringify(b.c)}: ${h.toFixed(2)} m`).toBe(
        true,
      );
    }
  });
});

describe('Afterglow: paper screens, the plaza, the monorail', () => {
  const run = (world: WorldState, ctx: SimContext, ticks: number, buttons = 0, yaw = 0) => {
    const events: SimEvent[] = [];
    for (let t = 0; t < ticks; t++) {
      step(world, { 1: { tick: world.tick + 1, buttons, view: yawToView(yaw) } }, ctx);
      events.push(...world.events);
    }
    return events;
  };
  const feet = (p: { pos: Vec3 }) => p.pos.y - defaultConfig().movement.standHeight / 2;

  it('a paper screen in the alley stops players, lasers and sight, but not the Boomerang', () => {
    const lv = level();
    // the screen at x 31 (z -36.5..-32), seen from the west
    const eye = v3(28, 1.6, -34);
    const dir = v3(1, 0, 0);
    const hit = raycast(lv, eye, dir, 10)!;
    expect(hit.point.x).toBeCloseTo(30.9, 3);
    expect(lv.def.boxes[hit.box].mat).toBe('paper');
    expect(lv.def.boxes[hit.box].boomerangPasses).toBe(true);
    expect(raycast(lv, eye, dir, 10, 0.2, true)).toBeNull(); // the Boomerang's flight
    expect(lineOfSight(lv, eye, v3(34, 1.6, -34))).toBe(false);
    expect(capsuleOverlaps(lv, standingCapsule(v3(31, 0, -34)))).toBe(true);
    // a player walking east into it stops at the paper
    const { config, ctx, world } = sim();
    const p = addPlayer(world, createPlayer(1, 0, v3(28, 0, -34), -90, config));
    run(world, ctx, 90, Btn.Forward, -90);
    expect(p.pos.x).toBeLessThan(30.9);
  });

  it('a Quick Throw flies through the paper screen and hits the player behind it', () => {
    const { config, ctx, world } = sim();
    const thrower = addPlayer(world, createPlayer(1, 0, v3(28, 0, -34), -90, config));
    const target = addPlayer(world, createPlayer(2, 1, v3(34, 0, -34), 90, config));
    const events: SimEvent[] = [];
    const tick = (buttons: number, n: number) => {
      for (let i = 0; i < n; i++) {
        step(
          world,
          {
            1: { tick: world.tick + 1, buttons, view: yawToView(-90) },
            2: { tick: world.tick + 1, buttons: 0, view: yawToView(90) },
          },
          ctx,
        );
        events.push(...world.events);
      }
    };
    tick(0, 10);
    tick(Btn.Fire, 5);
    tick(0, 40);
    expect(thrower.alive).toBe(true);
    expect(events.some((e) => e.type === 'hit' && e.victim === target.id)).toBe(true);
  });

  it('the plaza steps take you down to the fountain and back up to the street', () => {
    const { config, ctx, world } = sim();
    const p = addPlayer(world, createPlayer(1, 0, v3(13, 0, -4), 90, config));
    run(world, ctx, 45, Btn.Forward, 90); // west, down the east steps
    run(world, ctx, 30);
    expect(p.grounded).toBe(true);
    expect(feet(p)).toBeCloseTo(P, 1);
    expect(p.pos.x).toBeLessThan(8.6);
    run(world, ctx, 90, Btn.Forward, -90); // east, back up to the market gate
    run(world, ctx, 20);
    expect(feet(p)).toBeCloseTo(0, 1);
    expect(p.pos.x).toBeGreaterThan(11.5);
  });

  it('the stairs by the spawn street climb onto the monorail; the rail street stairs and the roof ramp reach the station', () => {
    const cases: [string, Vec3, number, (p: Vec3) => boolean][] = [
      // south, up the stairs beside the spawn street, onto the deck
      ['monorail stairs', v3(38, 0, -3), 180, (q) => q.z > AFTERGLOW.deck.z0],
      // west, up from the rail street onto the south platform
      ['station stairs', v3(30, 0, 22.3), 90, (q) => q.x < AFTERGLOW.station.x],
      // west, up the ramp from the south rooftops onto the north platform
      ['rooftop ramp', v3(22, R, 13.8), 90, (q) => q.x < AFTERGLOW.station.x],
    ];
    for (const [name, from, yaw, arrived] of cases)
      for (const s of [1, -1]) {
        const { config, ctx, world } = sim();
        const y = s > 0 ? yaw : yaw === 180 ? 180 : -yaw;
        const p = addPlayer(world, createPlayer(1, 0, v3(s * from.x, from.y, from.z), y, config));
        let reached = false;
        for (let t = 0; t < 180 && !reached; t++) {
          run(world, ctx, 1, Btn.Forward, y);
          reached =
            p.grounded &&
            Math.abs(feet(p) - Y) < 0.05 &&
            arrived(v3(s * p.pos.x, p.pos.y, p.pos.z));
        }
        expect(reached, `${name} (${s > 0 ? 'east' : 'west'})`).toBe(true);
      }
  });

  it('the zip-rail along the monorail carries you into the station', () => {
    for (const s of [1, -1]) {
      const { config, ctx, world } = sim();
      const west = s > 0 ? 90 : -90; // toward the station
      const p = addPlayer(world, createPlayer(1, 0, v3(s * 38, Y, AFTERGLOW.railZ), west, config));
      run(world, ctx, 10);
      const ev = run(world, ctx, 25, Btn.Jump, west);
      expect(ev.map((e) => e.type)).toContain('railGrab');
      run(world, ctx, 150, 0, west);
      expect(p.grounded).toBe(true);
      expect(feet(p)).toBeCloseTo(Y, 1);
      expect(Math.abs(p.pos.x)).toBeLessThan(AFTERGLOW.railX[0] + 1);
    }
  });

  it('the train in the station ends the monorail’s long line; its doors open across', () => {
    const lv = level();
    const z = AFTERGLOW.railZ;
    expect(lineOfSight(lv, v3(30, Y + 1.6, z), v3(-30, Y + 1.6, z))).toBe(false);
    expect(lineOfSight(lv, v3(0, Y + 1.6, 13), v3(0, Y + 1.6, 21.5))).toBe(true);
    // and the market street has no line from one spawn street to the other
    for (let zz = AFTERGLOW.market.z0 + 0.25; zz < AFTERGLOW.market.z1; zz += 0.5)
      expect(lineOfSight(lv, v3(40, 1.6, zz), v3(-40, 1.6, zz)), `z ${zz}`).toBe(false);
  });
});

describe('Afterglow bots', () => {
  const walk = (d: LevelDef, team: 0 | 1, goalName: string, seconds: number) => {
    const { config, ctx, world } = sim(d);
    const s = d.spawns.find((sp) => sp.team === team)!;
    const p = addPlayer(world, createPlayer(1, team, s.pos, s.yawDeg, config));
    const mem = createBotMemory(1, BOT_SKILLS.normal, 9);
    const goal = wpPos(d, goalName);
    mem.objective = v3(goal.x, goal.y - 1, goal.z);
    mem.objectiveFirst = true;
    for (let t = 0; t < 60 * seconds; t++) {
      step(world, { 1: botThink(world, ctx, p, mem) }, ctx);
      if (
        Math.hypot(p.pos.x - goal.x, p.pos.z - goal.z) < 2.5 &&
        Math.abs(p.pos.y - 0.9 - (goal.y - 1)) < 1
      )
        return true;
    }
    return false;
  };
  const goals: [string, string][] = [
    ['the Koi Plaza', 'pE'],
    ['the fountain', 'basin'],
    ['site A in the arcade hall', 'siteA'],
    ['site B in the station', 'siteB'],
    ['the north rooftops', 'roofN2'],
    ['the south rooftops, then the ramp', 'rampFoot'],
    ['the monorail', 'deck1'],
    ['the overlook', 'ovC'],
  ];
  it.each(goals.flatMap(([n, g]) => ([0, 1] as const).map((team) => [n, team, g] as const)))(
    'a bot walks from its spawn to %s (team %i)',
    (_name, team, goal) => {
      const own = team === 1 ? 'E' : 'W';
      const d = def();
      const name = d.waypoints!.some((w) => w.name === goal) ? goal : `${goal}${own}`;
      expect(walk(d, team, name, 40)).toBe(true);
    },
    30000,
  );

  // crossings of the middle (x = 0): arcade, plaza, station, concourse / overlook
  const MIDDLE: Record<string, string[]> = {
    arcade: ['siteA', 'aBack', 'aFront'],
    plaza: ['pN', 'pS', 'basin'],
    station: ['bNC', 'siteB', 'bSC'],
    concourse: ['conc', 'ovC'],
  };
  const lanes = Object.keys(MIDDLE);
  it.each(lanes.flatMap((lane) => ([0, 1] as const).map((team) => [lane, team] as const)))(
    'a bot carries the Controller to the enemy Tower through the %s (team %i)',
    (lane, team) => {
      const blocked = lanes.filter((l) => l !== lane).flatMap((l) => MIDDLE[l]);
      const { lv, config, ctx, world } = sim(withBlocked(def(), blocked));
      const s = lv.def.spawns.find((sp) => sp.team === team)!;
      addPlayer(world, createPlayer(1, team, s.pos, s.yawDeg, config));
      const mem = createBotMemory(1, BOT_SKILLS.normal, 5);
      const ms = createMatch('1v1');
      startMatch(ms, world, ctx);
      for (let t = 0; t < 60 * 50 && ms.phase !== 'roundEnd'; t++) {
        applyBotObjectives(ms, world, ctx, [mem]);
        step(world, { 1: botThink(world, ctx, world.players[0], mem) }, ctx);
        updateMatch(ms, world, ctx);
      }
      expect(ms.rounds[0]?.reason).toBe('tower');
      expect(ms.rounds[0]?.winner).toBe(team);
    },
    60000,
  );

  it('an Elimination match of bots (2v2) plays its rounds out: they meet, fight, rounds end', () => {
    const d = def();
    const config = defaultConfig();
    const ctx: SimContext = { level: buildLevel(d), config, dt: TICK_DT };
    const world = createWorld(ctx.level, 11);
    const mems: BotMemory[] = [];
    let id = 1;
    for (const team of [0, 1] as const)
      for (let i = 0; i < 2; i++) {
        const s = d.spawns.filter((sp) => sp.team === team)[i];
        addPlayer(world, createPlayer(id, team, s.pos, s.yawDeg, config));
        mems.push(createBotMemory(id, BOT_SKILLS.normal, id * 13));
        id++;
      }
    const ms = createMatch('2v2', 'elim');
    startMatch(ms, world, ctx);
    let kills = 0;
    const secs = (x: number) => Math.round(x * 60);
    while (ms.rounds.length < 2 && world.tick < secs(2 * (5 + 80 + 60 + 5))) {
      const inputs: Record<number, PlayerInput> = {};
      for (const mem of mems) {
        const p = world.players.find((q) => q.id === mem.id)!;
        if (p.alive) inputs[p.id] = botThink(world, ctx, p, mem);
      }
      step(world, inputs, ctx);
      updateMatch(ms, world, ctx);
      applyBotObjectives(ms, world, ctx, mems);
      kills += world.events.filter((e) => e.type === 'kill').length;
    }
    expect(ms.rounds.length).toBe(2);
    expect(kills).toBeGreaterThan(0);
    for (const r of ms.rounds) expect(r.winner).not.toBeNull();
  }, 120000);
});
