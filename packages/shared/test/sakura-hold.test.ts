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
  DEFAULT_MATCH_MAP,
  defaultConfig,
  lineOfSight,
  mapDef,
  MAPS,
  raycast,
  SAKURA_HOLD,
  slowZoneMul,
  startMatch,
  step,
  TICK_DT,
  updateMatch,
  v3,
  waypointRoute,
  yawToView,
  type LevelDef,
  type SimContext,
  type SimEvent,
  type Vec3,
} from '../src/index';

const def = () => mapDef('sakura-hold');
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
const key = (n: number) => n.toFixed(3);
/** mirror across the north ↔ south line z = 40 */
const mirZ = (z: number) => 80 - z;

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

describe('Sakura Hold map', () => {
  it('is a competitive map kept out of the Premier pool; Split Deck stays the default', () => {
    const m = MAPS.find((x) => x.id === 'sakura-hold');
    expect(m?.competitive).toBe(true);
    expect(m?.premier).toBe(false);
    expect(m?.arena).toBeFalsy();
    expect(DEFAULT_MATCH_MAP()).toBe('split-deck');
    const d = def();
    expect(d.name).toBe('Sakura Hold');
    expect(d.boundsMax.x - d.boundsMin.x).toBe(80);
    expect(d.boundsMax.z - d.boundsMin.z).toBe(80);
    expect(d.outdoor).toBeDefined();
    expect(d.fog?.color).toBe(d.outdoor?.horizon);
  });

  it('is mirror-symmetric north ↔ south (z → 80 - z, teams swapped)', () => {
    const d = def();
    const boxes = new Set(
      d.boxes.map((b) => [b.c.x, b.c.y, b.c.z, b.h.x, b.h.y, b.h.z].map(key).join(',')),
    );
    for (const b of d.boxes) {
      const twin = [b.c.x, b.c.y, mirZ(b.c.z), b.h.x, b.h.y, b.h.z].map(key).join(',');
      expect(boxes.has(twin), `box ${JSON.stringify(b.c)}`).toBe(true);
    }
    for (const s of d.spawns)
      expect(
        d.spawns.some(
          (o) =>
            o.team !== s.team &&
            key(o.pos.x) === key(s.pos.x) &&
            key(o.pos.z) === key(mirZ(s.pos.z)),
        ),
      ).toBe(true);
    for (const w of d.waypoints!)
      expect(
        d.waypoints!.some(
          (o) => key(o.pos.x) === key(w.pos.x) && key(o.pos.z) === key(mirZ(w.pos.z)),
        ),
      ).toBe(true);
    for (const list of [d.launchPads!, d.slowZones!])
      for (const p of list)
        expect(
          list.some(
            (o) =>
              key(o.min.x) === key(p.min.x) &&
              key(o.min.z) === key(mirZ(p.max.z)) &&
              key(o.max.z) === key(mirZ(p.min.z)),
          ),
        ).toBe(true);
    const A = d.bombSites!.find((s) => s.name === 'A')!;
    const B = d.bombSites!.find((s) => s.name === 'B')!;
    expect(A.min.x).toBeGreaterThan(SAKURA_HOLD.keep.x1);
    expect(B.max.x).toBeLessThan(SAKURA_HOLD.keep.x0);
    for (const s of [A, B]) expect(s.min.z).toBe(mirZ(s.max.z));
  });

  it('follows the plan: open floor where the plan has ground', () => {
    const lv = level();
    const K = SAKURA_HOLD.keep;
    const places: [string, number, number, number][] = [
      ['Cyan gate', 35, 0, 7],
      ['gate bridge', 40, 0, 14],
      ['courtyard', 47, 0, 21],
      ['keep, ground floor', 46, 0, 35],
      ['keep, 1st floor', 46, K.floors[1], 35],
      ['keep, 2nd floor', 34, K.floors[2], 35],
      ['keep roof', 40, K.roof, 35],
      ['east wall walkway', 73, SAKURA_HOLD.wall, 30],
      ['west wall walkway', 7, SAKURA_HOLD.wall, 30],
      ['A site', 59.5, 0, 40],
      ['B site', 20.5, 0, 40],
      ['moat', 68, -SAKURA_HOLD.moat.depth, 30],
      ['moat, north', 25, -SAKURA_HOLD.moat.depth, 14],
    ];
    for (const [name, x, y, z] of places)
      for (const zz of [z, mirZ(z)]) {
        expect(raycast(lv, v3(x, y + 1, zz), v3(0, -1, 0), 2)?.point.y, name).toBeCloseTo(y, 3);
        expect(capsuleOverlaps(lv, standingCapsule(v3(x, y, zz))), name).toBe(false);
      }
  });

  it('has 8 valid spawns per team inside its gatehouse, Towers, sites with floor', () => {
    const d = def();
    const lv = level();
    const G = SAKURA_HOLD.gate;
    for (const team of [0, 1] as const) {
      const spawns = d.spawns.filter((s) => s.team === team);
      expect(spawns.length).toBe(8);
      for (const s of spawns) {
        expect(capsuleOverlaps(lv, standingCapsule(s.pos))).toBe(false);
        expect(
          raycast(lv, v3(s.pos.x, s.pos.y + 1, s.pos.z), v3(0, -1, 0), 2)?.point.y,
        ).toBeCloseTo(s.pos.y, 3);
        const z = team === 0 ? s.pos.z : mirZ(s.pos.z);
        expect(z > G.z0 && z < G.z1 && s.pos.x > G.x0 && s.pos.x < G.x1).toBe(true);
      }
      const t = d.towers.find((x) => x.team === team)!;
      const w = wpPos(d, team === 0 ? 'towerN' : 'towerS');
      expect(Math.hypot(w.x - t.pos.x, w.z - t.pos.z)).toBeLessThan(
        t.radius + defaultConfig().rules.towerTouchRadius + 0.5,
      );
    }
    for (const s of d.bombSites!) {
      const c = v3((s.min.x + s.max.x) / 2, s.min.y + 1, (s.min.z + s.max.z) / 2);
      expect(raycast(lv, c, v3(0, -1, 0), 2)?.point.y).toBeCloseTo(s.min.y, 3);
      expect(capsuleOverlaps(lv, standingCapsule(v3(c.x, s.min.y, c.z)))).toBe(false);
    }
    // the power-up floats over the roof hatch of the keep
    expect(d.powerups!.map((p) => [p.x, p.z])).toEqual([[40, 40]]);
  });

  it('waypoints sit in open space, keep out of the moat, and every one is reachable', () => {
    const lv = level();
    const wps = lv.def.waypoints!;
    for (const w of wps) {
      expect(
        capsuleOverlaps(lv, { center: w.pos, up: v3(0, 1, 0), halfSeg: 0, radius: 0.3 }),
        `waypoint ${w.name}`,
      ).toBe(false);
      expect(slowZoneMul(lv.def, w.pos), `waypoint ${w.name} in the moat`).toBe(1);
      for (const j of w.links) {
        expect(lineOfSight(lv, w.pos, wps[j].pos), `link ${w.name} → ${wps[j].name}`).toBe(true);
        // no link wades through the moat either
        for (let t = 0.1; t < 1; t += 0.1) {
          const p = v3(
            w.pos.x + (wps[j].pos.x - w.pos.x) * t,
            w.pos.y + (wps[j].pos.y - w.pos.y) * t,
            w.pos.z + (wps[j].pos.z - w.pos.z) * t,
          );
          expect(slowZoneMul(lv.def, p), `link ${w.name} → ${wps[j].name}`).toBe(1);
        }
      }
      for (const p of lv.def.launchPads ?? [])
        expect(
          w.pos.x >= p.min.x - 0.4 &&
            w.pos.x <= p.max.x + 0.4 &&
            w.pos.z >= p.min.z - 0.4 &&
            w.pos.z <= p.max.z + 0.4 &&
            w.pos.y - 1 <= p.max.y,
          `waypoint ${w.name} on a launch pad`,
        ).toBe(false);
    }
    for (const from of ['towerN', 'towerS'])
      for (let i = 0; i < wps.length; i++)
        expect(waypointRoute(wps, wpIndex(lv.def, from), i).length, wps[i].name).toBeGreaterThan(0);
  });

  it('keeps every ramp at 30° or less', () => {
    const rotated = def().boxes.filter((b) => b.q && !b.noCollide);
    // keep stairs (4), wall ramps from the ground (4), wall ramps down into the sites (2)
    expect(rotated.length).toBe(10);
    for (const b of rotated) {
      const q = b.q!;
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      expect((Math.acos(Math.min(1, upY)) * 180) / Math.PI).toBeLessThanOrEqual(30);
    }
  });

  it('no spawn is in view from the courtyard, the walls or the keep roof', () => {
    const lv = level();
    for (const north of [true, false]) {
      const Z = (z: number) => (north ? z : mirZ(z));
      const spawnPts = lv.def.spawns
        .filter((s) => (s.team === 0) === north)
        .map((s) => v3(s.pos.x, 1.6, s.pos.z));
      const lookouts = [
        v3(40, 1.6, Z(20)),
        v3(47, 1.6, Z(21)),
        v3(40, 1.6, Z(17)),
        v3(73, 5.6, Z(24)),
        v3(7, 5.6, Z(24)),
        v3(40, 13.6, Z(33)),
        v3(40, 13.6, Z(47)),
        v3(62, 1.6, Z(8)),
      ];
      for (const l of lookouts)
        for (const s of spawnPts)
          expect(lineOfSight(lv, l, s), `${JSON.stringify(l)} sees ${JSON.stringify(s)}`).toBe(
            false,
          );
    }
  });
});

describe('Sakura Hold: moat, paper walls, launch pads', () => {
  const run = (from: Vec3, yaw: number, ticks: number, d = def()) => {
    const { config, ctx, world } = sim(d);
    const p = addPlayer(world, createPlayer(1, 0, from, yaw, config));
    const track: Vec3[] = [];
    for (let t = 0; t < ticks; t++) {
      step(world, { 1: { tick: world.tick + 1, buttons: Btn.Forward, view: yawToView(yaw) } }, ctx);
      track.push({ ...p.pos });
    }
    return { p, track, config };
  };

  it('wading through the moat is slow; the courtyard next to it is not', () => {
    // yaw 180 faces +z: along the east moat, and along the lawn beside it
    const wade = run(v3(68, -SAKURA_HOLD.moat.depth, 18), 180, 90);
    const dry = run(v3(47, 0, 21), -90, 90);
    const speed = (t: Vec3[]) => Math.hypot(t[89].x - t[59].x, t[89].z - t[59].z) / 0.5;
    const cap = defaultConfig().movement.sprintSpeed * SAKURA_HOLD.moat.speedMul;
    expect(speed(wade.track)).toBeLessThanOrEqual(cap + 0.05);
    expect(speed(wade.track)).toBeGreaterThan(cap * 0.8);
    expect(speed(dry.track)).toBeGreaterThan(8.5);
  });

  it('a paper wall stops players, lasers and sight, but not the Boomerang', () => {
    const lv = level();
    // the shoji screen at z 26, x 50..60
    const eye = v3(55, 1.6, 22);
    const dir = v3(0, 0, 1);
    const hit = raycast(lv, eye, dir, 10)!;
    expect(hit.point.z).toBeCloseTo(25.9, 3);
    expect(lv.def.boxes[hit.box].mat).toBe('paper');
    expect(lv.def.boxes[hit.box].boomerangPasses).toBe(true);
    expect(raycast(lv, eye, dir, 10, 0.2, true)).toBeNull(); // the Boomerang's flight
    expect(lineOfSight(lv, eye, v3(55, 1.6, 30))).toBe(false);
    expect(capsuleOverlaps(lv, standingCapsule(v3(55, 0, 26)))).toBe(true);
    // a player walking into it stops at the paper
    const walk = run(v3(55, 0, 22), 180, 90);
    expect(walk.p.pos.z).toBeLessThan(25.9);
  });

  it('a Quick Throw flies through the paper wall and hits the player behind it', () => {
    const { config, ctx, world } = sim();
    const thrower = addPlayer(world, createPlayer(1, 0, v3(55, 0, 22), 180, config));
    const target = addPlayer(world, createPlayer(2, 1, v3(55, 0, 30), 0, config));
    const events: SimEvent[] = [];
    const tick = (buttons: number, n: number) => {
      for (let i = 0; i < n; i++) {
        step(
          world,
          {
            1: { tick: world.tick + 1, buttons, view: yawToView(180) },
            2: { tick: world.tick + 1, buttons: 0, view: yawToView(0) },
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
    expect(target.hp).toBeLessThan(config.combat.maxHp ?? 100);
  });

  it('each launch pad throws you up onto the keep roof', () => {
    for (const pad of def().launchPads!) {
      const { config, ctx, world } = sim();
      const c = v3((pad.min.x + pad.max.x) / 2, 0, (pad.min.z + pad.max.z) / 2);
      const p = addPlayer(world, createPlayer(1, 0, c, 0, config));
      for (let t = 0; t < 180; t++) step(world, {}, ctx);
      expect(p.grounded).toBe(true);
      expect(p.pos.y - config.movement.standHeight / 2).toBeCloseTo(SAKURA_HOLD.keep.roof, 1);
      const K = SAKURA_HOLD.keep;
      expect(p.pos.z > K.z0 && p.pos.z < K.z1 && p.pos.x > K.x0 && p.pos.x < K.x1).toBe(true);
    }
  });
});

describe('Sakura Hold bots', () => {
  const lanes: [string, string[]][] = [
    ['courtyard and keep', ['wFootNE', 'wFootNW', 'wFootSE', 'wFootSW']],
    ['castle walls', ['bridgeInNE', 'bridgeInNW', 'bridgeInSE', 'bridgeInSW']],
  ];
  it.each(lanes.flatMap(([n, b]) => ([0, 1] as const).map((team) => [n, team, b] as const)))(
    'a bot carries the Controller to the enemy Tower via the %s (team %i)',
    (_name, team, blocked) => {
      const { lv, config, ctx, world } = sim(withBlocked(def(), [...blocked]));
      const s = lv.def.spawns.find((sp) => sp.team === team)!;
      addPlayer(world, createPlayer(1, team, s.pos, s.yawDeg, config));
      const mem = createBotMemory(1, BOT_SKILLS.normal, 5);
      const ms = createMatch('1v1');
      startMatch(ms, world, ctx);
      for (let t = 0; t < 60 * 45 && ms.phase !== 'roundEnd'; t++) {
        applyBotObjectives(ms, world, ctx, [mem]);
        step(world, { 1: botThink(world, ctx, world.players[0], mem) }, ctx);
        updateMatch(ms, world, ctx);
      }
      expect(ms.rounds[0]?.reason).toBe('tower');
      expect(ms.rounds[0]?.winner).toBe(team);
    },
  );

  const siteRoutes: [string, 0 | 1, string, string[]][] = [
    ['Cyan to A along the wall', 0, 'siteE', ['bridgeInNE', 'bridgeInNW']],
    ['Cyan to B through the courtyard', 0, 'siteW', ['wFootNE', 'wFootNW']],
    ['Orange to A through the courtyard', 1, 'siteE', ['wFootSE', 'wFootSW']],
    ['Orange to B along the wall', 1, 'siteW', ['bridgeInSE', 'bridgeInSW']],
  ];
  it.each(siteRoutes)('a bot walks %s', (_name, team, site, blocked) => {
    const d = withBlocked(def(), blocked);
    const { config, ctx, world } = sim(d);
    const s = d.spawns.find((sp) => sp.team === team)!;
    const p = addPlayer(world, createPlayer(1, team, s.pos, s.yawDeg, config));
    const mem = createBotMemory(1, BOT_SKILLS.normal, 9);
    const goal = wpPos(d, site);
    mem.objective = v3(goal.x, goal.y - 1, goal.z);
    mem.objectiveFirst = true;
    let arrived = false;
    for (let t = 0; t < 60 * 30 && !arrived; t++) {
      step(world, { 1: botThink(world, ctx, p, mem) }, ctx);
      arrived =
        Math.hypot(p.pos.x - goal.x, p.pos.z - goal.z) < 2.5 &&
        Math.abs(p.pos.y - (goal.y - 1)) < 1.5;
    }
    expect(arrived).toBe(true);
  });

  it('a bot reaches the keep roof by the stairs', () => {
    const d = def();
    const { config, ctx, world } = sim(d);
    const s = d.spawns.find((sp) => sp.team === 0)!;
    const p = addPlayer(world, createPlayer(1, 0, s.pos, s.yawDeg, config));
    const mem = createBotMemory(1, BOT_SKILLS.normal, 4);
    const goal = wpPos(d, 'roofPN');
    mem.objective = v3(goal.x, goal.y - 1, goal.z);
    mem.objectiveFirst = true;
    let arrived = false;
    for (let t = 0; t < 60 * 40 && !arrived; t++) {
      step(world, { 1: botThink(world, ctx, p, mem) }, ctx);
      arrived =
        Math.hypot(p.pos.x - goal.x, p.pos.z - goal.z) < 2.5 &&
        Math.abs(p.pos.y - (goal.y - 1)) < 1.5;
    }
    expect(arrived).toBe(true);
  });
});
