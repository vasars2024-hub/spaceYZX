import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  applyBotObjectives,
  BOT_SKILLS,
  botThink,
  Btn,
  buildLevel,
  CANYON_RELAY,
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
  startMatch,
  step,
  TICK_DT,
  updateMatch,
  v3,
  waypointRoute,
  yawToView,
  type LevelDef,
  type SimContext,
  type Vec3,
} from '../src/index';

const def = () => mapDef('canyon-relay');
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
/** mirror across the north ↔ south line z = 50 */
const mirZ = (z: number) => 100 - z;
const all4 = (base: string) => ['NE', 'NW', 'SE', 'SW'].map((q) => base + q);

/** The map with some waypoints cut off, so bots have to take one particular route. */
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

describe('Canyon Relay map', () => {
  it('is a competitive map next to Split Deck, Kestrel and Orbital Ring (Split Deck stays default)', () => {
    expect(MAPS.find((x) => x.id === 'canyon-relay')?.competitive).toBe(true);
    for (const id of ['split-deck', 'kestrel', 'orbital-ring'])
      expect(MAPS.find((x) => x.id === id)?.competitive).toBe(true);
    expect(DEFAULT_MATCH_MAP()).toBe('split-deck');
    const d = def();
    expect(d.name).toBe('Canyon Relay');
    // an outdoor map: sky gradient, sunset key light, warm fog the colour of the horizon
    expect(d.outdoor?.horizon).toBe(0xf2a65a);
    expect(d.fog?.color).toBe(d.outdoor?.horizon);
    expect(d.skyArena).toBeDefined();
  });

  it('is mirror-symmetric north ↔ south (z → 100 - z, teams swapped)', () => {
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
    expect(d.towers.map((t) => t.pos.z).sort((a, b) => a - b)).toEqual([9, 91]);
    for (const w of d.waypoints!)
      expect(
        d.waypoints!.some(
          (o) => key(o.pos.x) === key(w.pos.x) && key(o.pos.z) === key(mirZ(w.pos.z)),
        ),
      ).toBe(true);
    for (const p of d.launchPads!)
      expect(
        d.launchPads!.some(
          (o) =>
            key(o.min.x) === key(p.min.x) &&
            key(o.min.z) === key(mirZ(p.max.z)) &&
            key(o.vel.x) === key(p.vel.x) &&
            key(o.vel.z) === key(-p.vel.z),
        ),
      ).toBe(true);
    // bomb sites east (A) and west (B), on the middle line
    const A = d.bombSites!.find((s) => s.name === 'A')!;
    const B = d.bombSites!.find((s) => s.name === 'B')!;
    expect(A.min.x).toBeGreaterThan(98);
    expect(B.max.x).toBeLessThan(22);
    for (const s of [A, B]) expect(s.min.z).toBe(mirZ(s.max.z));
  });

  it('follows the plan: open floor where the plan has ground', () => {
    const lv = level();
    const M = CANYON_RELAY.mesa;
    // [name, x, floor y, z] in the north half (checked mirrored too)
    const places: [string, number, number, number][] = [
      ['Cyan camp', 52, 0, 10],
      ['outer path, east', 88, 0, 11],
      ['outer path, west', 32, 0, 11],
      ['north mesa', 78, M, 21],
      ['north mesa, gorge edge', 60, M, 40],
      ['spire top', 62, CANYON_RELAY.spire.top, 27],
      ['east bridge', 85, M, 46],
      ['west bridge', 35, M, 46],
      ['east slot canyon', 107, 0, 11],
      ['west slot canyon', 13, 0, 30],
      ['A basin', 107, CANYON_RELAY.basin, 46],
      ['B basin', 13, CANYON_RELAY.basin, 46],
      ['relay rock', 60, CANYON_RELAY.relay.top, 48],
    ];
    for (const [name, x, y, z] of places)
      for (const zz of [z, mirZ(z)]) {
        expect(raycast(lv, v3(x, y + 1, zz), v3(0, -1, 0), 2)?.point.y, name).toBeCloseTo(y, 3);
        expect(capsuleOverlaps(lv, standingCapsule(v3(x, y, zz))), name).toBe(false);
      }
    // the gorge: a long drop, open to the sky
    const down = raycast(lv, v3(72, 5, 50), v3(0, -1, 0), 60)!;
    expect(down.point.y).toBeCloseTo(CANYON_RELAY.gorgeFloor, 3);
    expect(raycast(lv, v3(72, 5, 50), v3(0, 1, 0), 200)).toBeNull();
  });

  it('has 8 valid spawns per team (clear capsule, floor underneath, inside its camp)', () => {
    const lv = level();
    const CP = CANYON_RELAY.camp;
    for (const team of [0, 1] as const) {
      const spawns = lv.def.spawns.filter((s) => s.team === team);
      expect(spawns.length).toBe(8);
      for (const s of spawns) {
        expect(capsuleOverlaps(lv, standingCapsule(s.pos)), `spawn ${s.pos.x},${s.pos.z}`).toBe(
          false,
        );
        expect(
          raycast(lv, v3(s.pos.x, s.pos.y + 1, s.pos.z), v3(0, -1, 0), 2)?.point.y,
        ).toBeCloseTo(s.pos.y, 3);
        const z = team === 0 ? s.pos.z : mirZ(s.pos.z);
        expect(z > CP.z0 && z < CP.z1 && s.pos.x > CP.x0 && s.pos.x < CP.x1).toBe(true);
      }
    }
  });

  it('has Towers + Controller homes, bomb sites with floor, the power-up on the relay rock', () => {
    const d = def();
    const lv = level();
    for (const team of [0, 1] as const) {
      const t = d.towers.find((x) => x.team === team)!;
      expect(t.pos.x).toBe(60);
      const home = d.controllerHomes![team];
      expect(capsuleOverlaps(lv, standingCapsule(v3(home.x, 0, home.z)))).toBe(false);
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
    expect(d.powerups!.length).toBe(1);
    const p = d.powerups![0];
    expect([p.x, p.z]).toEqual([60, 50]);
    expect(raycast(lv, p, v3(0, -1, 0), 3)?.point.y).toBeCloseTo(CANYON_RELAY.relay.top, 3);
    // the collapse closes in halfway between the Towers: on the relay rock
    const R = CANYON_RELAY.relay;
    const mid = v3(
      (d.towers[0].pos.x + d.towers[1].pos.x) / 2,
      0,
      (d.towers[0].pos.z + d.towers[1].pos.z) / 2,
    );
    expect(mid.x > R.x0 && mid.x < R.x1 && mid.z > R.z0 && mid.z < R.z1).toBe(true);
    expect(d.launchPads!.length).toBe(4);
  });

  it('waypoints sit in open space, links have line of sight, every waypoint is reachable', () => {
    const lv = level();
    const wps = lv.def.waypoints!;
    for (const w of wps) {
      expect(
        capsuleOverlaps(lv, { center: w.pos, up: v3(0, 1, 0), halfSeg: 0, radius: 0.3 }),
        `waypoint ${w.name}`,
      ).toBe(false);
      for (const j of w.links)
        expect(lineOfSight(lv, w.pos, wps[j].pos), `link ${w.name} → ${wps[j].name}`).toBe(true);
      for (const p of lv.def.launchPads ?? [])
        expect(
          w.pos.x >= p.min.x - 0.4 &&
            w.pos.x <= p.max.x + 0.4 &&
            w.pos.z >= p.min.z - 0.4 &&
            w.pos.z <= p.max.z + 0.4,
          `waypoint ${w.name} on a launch pad`,
        ).toBe(false);
      // nothing inside the deadly gorge
      for (const k of lv.def.killVolumes ?? [])
        expect(w.pos.y - 1 > k.max.y, `waypoint ${w.name} in the gorge`).toBe(true);
    }
    for (const from of ['towerN', 'towerS'])
      for (let i = 0; i < wps.length; i++)
        expect(
          waypointRoute(wps, wpIndex(lv.def, from), i).length,
          `${from} → ${wps[i].name}`,
        ).toBeGreaterThan(0);
  });

  it('keeps every ramp at 30° or less', () => {
    const rotated = def().boxes.filter((b) => b.q && !b.noCollide);
    // cliff ramps, canyon passages, spire ramps and canyon dips (4 each); the fins only turn
    // about the vertical
    const tilted = rotated.filter((b) => Math.abs(b.q!.x) + Math.abs(b.q!.z) > 1e-9);
    expect(tilted.length).toBe(16);
    for (const b of rotated) {
      const q = b.q!;
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      expect((Math.acos(Math.min(1, upY)) * 180) / Math.PI).toBeLessThanOrEqual(30);
    }
  });

  it('no spawn is in view from the enemy mesa, its spire or the outer paths', () => {
    const lv = level();
    const M = CANYON_RELAY.mesa;
    const top = CANYON_RELAY.spire.top;
    for (const north of [true, false]) {
      const Z = (z: number) => (north ? z : mirZ(z));
      const spawnPts = lv.def.spawns
        .filter((s) => (s.team === 0) === north)
        .map((s) => v3(s.pos.x, 1.6, s.pos.z));
      // enemy lookouts (the other half), and this half's mesa and outer paths
      const lookouts = [
        v3(60, top + 1.6, Z(73)),
        v3(62, top + 1.6, Z(71)),
        v3(60, M + 1.6, Z(60)),
        v3(85, M + 1.6, Z(62)),
        v3(60, M + 1.6, Z(20)),
        v3(78, M + 1.6, Z(21)),
        v3(35, M + 1.6, Z(21)),
        v3(90, 1.6, Z(11)),
        v3(30, 1.6, Z(11)),
        v3(107, 1.6, Z(11)),
      ];
      for (const l of lookouts)
        for (const s of spawnPts)
          expect(lineOfSight(lv, l, s), `${JSON.stringify(l)} sees ${JSON.stringify(s)}`).toBe(
            false,
          );
    }
  });
});

describe('Canyon Relay: the gorge and the launch pads', () => {
  it('falling into the gorge kills; the relay rock and the bridges are safe', () => {
    const { config, ctx, world } = sim();
    const fall = addPlayer(world, createPlayer(1, 0, v3(72, 4.5, 50), 0, config));
    const rock = addPlayer(world, createPlayer(2, 0, v3(60, 1.5, 50), 0, config));
    const bridge = addPlayer(world, createPlayer(3, 1, v3(85, 4.5, 50), 0, config));
    const west = addPlayer(world, createPlayer(4, 1, v3(30, 4.5, 50), 0, config));
    for (let t = 0; t < 180; t++) step(world, {}, ctx);
    expect(fall.alive).toBe(false);
    expect(west.alive).toBe(false);
    expect(rock.alive).toBe(true);
    expect(rock.pos.y - config.movement.standHeight / 2).toBeCloseTo(CANYON_RELAY.relay.top, 1);
    expect(bridge.alive).toBe(true);
    expect(bridge.pos.y - config.movement.standHeight / 2).toBeCloseTo(CANYON_RELAY.mesa, 1);
  });

  it('sprinting off the mesa edge in the middle lands you on the relay rock (and its power-up)', () => {
    const { config, ctx, world } = sim();
    // yaw 180 faces +z: from the north mesa toward the gorge
    const p = addPlayer(world, createPlayer(1, 0, v3(60, CANYON_RELAY.mesa, 34), 180, config));
    for (let t = 0; t < 240; t++) {
      const buttons = p.pos.z < 44.5 ? Btn.Forward : 0;
      step(world, { 1: { tick: world.tick + 1, buttons, view: yawToView(180) } }, ctx);
    }
    expect(p.alive).toBe(true);
    expect(p.pos.y - config.movement.standHeight / 2).toBeCloseTo(CANYON_RELAY.relay.top, 1);
  });

  it('each launch pad throws you across the gorge onto the far mesa, in the open', () => {
    const d = def();
    for (const pad of d.launchPads!) {
      const { config, ctx, world } = sim();
      const c = v3((pad.min.x + pad.max.x) / 2, pad.min.y, (pad.min.z + pad.max.z) / 2);
      const p = addPlayer(world, createPlayer(1, 0, c, 0, config));
      const events: string[] = [];
      for (let t = 0; t < 180; t++) {
        step(world, {}, ctx);
        for (const e of world.events) events.push(e.type);
      }
      expect(events.filter((e) => e === 'launch').length).toBe(1);
      expect(p.alive).toBe(true);
      expect(p.grounded).toBe(true);
      expect(p.pos.y - config.movement.standHeight / 2).toBeCloseTo(CANYON_RELAY.mesa, 1);
      // the other side of the gorge, a few metres past its edge (the mirrored pad side)
      const z = c.z < 50 ? p.pos.z : mirZ(p.pos.z);
      expect(z).toBeGreaterThan(CANYON_RELAY.gorge.z1 + 4);
      expect(z).toBeLessThan(72);
      // in toward the middle, in front of the far spire
      expect(Math.abs(p.pos.x - 60)).toBeLessThan(3);
    }
  });
});

describe('Canyon Relay bots', () => {
  const bridges = ['bridgeMidE', 'bridgeMidW'];
  const canyons = [...all4('cOut'), ...all4('passBot')];
  const lanes: [string, string[]][] = [
    ['rock bridges', canyons],
    ['slot canyons and basins', bridges],
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
      for (let t = 0; t < 60 * 60 && ms.phase !== 'roundEnd'; t++) {
        applyBotObjectives(ms, world, ctx, [mem]);
        step(world, { 1: botThink(world, ctx, world.players[0], mem) }, ctx);
        updateMatch(ms, world, ctx);
      }
      expect(ms.rounds[0]?.reason).toBe('tower');
      expect(ms.rounds[0]?.winner).toBe(team);
    },
  );

  const siteRoutes: [string, 0 | 1, string, string[]][] = [
    ['Cyan to A down the outer path', 0, 'siteE', ['passTopNE']],
    ['Cyan to B over the mesa and the passage', 0, 'siteW', ['cOutNW']],
    ['Orange to A over the mesa and the passage', 1, 'siteE', ['cOutSE']],
    ['Orange to B down the outer path', 1, 'siteW', ['passTopSW']],
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
    for (let t = 0; t < 60 * 40 && !arrived; t++) {
      step(world, { 1: botThink(world, ctx, p, mem) }, ctx);
      arrived =
        Math.hypot(p.pos.x - goal.x, p.pos.z - goal.z) < 2.5 &&
        Math.abs(p.pos.y - (goal.y - 1)) < 1.5;
    }
    expect(p.alive).toBe(true);
    expect(arrived).toBe(true);
  });
});
