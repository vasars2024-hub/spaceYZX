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
  spawnOrder,
  startMatch,
  step,
  TICK_DT,
  updateMatch,
  v3,
  waypointRoute,
  yawToView,
  type BotMemory,
  type LevelDef,
  type PlayerInput,
  type SimContext,
  type SimEvent,
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
/** mirror across the east ↔ west line x = 60 */
const mirX = (x: number) => 120 - x;
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
  it('is a competitive outdoor map (Split Deck stays default)', () => {
    expect(MAPS.find((x) => x.id === 'canyon-relay')?.competitive).toBe(true);
    expect(DEFAULT_MATCH_MAP()).toBe('split-deck');
    const d = def();
    expect(d.name).toBe('Canyon Relay');
    // an outdoor map: sky gradient, sunset key light, warm fog the colour of the horizon
    expect(d.outdoor?.horizon).toBe(0xf2a65a);
    expect(d.fog?.color).toBe(d.outdoor?.horizon);
    expect(d.skyArena).toBeDefined();
    expect(d.boxes.length).toBeGreaterThan(500);
  });

  it('is mirror-symmetric north ↔ south (z → 100 - z, teams swapped) and east ↔ west', () => {
    const d = def();
    const boxes = new Set(
      d.boxes.map((b) => [b.c.x, b.c.y, b.c.z, b.h.x, b.h.y, b.h.z].map(key).join(',')),
    );
    for (const b of d.boxes) {
      if (b.c.z < -3 || b.c.z > 103) continue; // far scenery beyond the north cliff
      const twin = [b.c.x, b.c.y, mirZ(b.c.z), b.h.x, b.h.y, b.h.z].map(key).join(',');
      expect(boxes.has(twin), `box ${JSON.stringify(b.c)}`).toBe(true);
    }
    for (const b of d.boxes.filter((x) => !x.noCollide)) {
      const twin = [mirX(b.c.x), b.c.y, b.c.z, b.h.x, b.h.y, b.h.z].map(key).join(',');
      expect(boxes.has(twin), `box ${JSON.stringify(b.c)} (east ↔ west)`).toBe(true);
    }
    for (const s of d.spawns)
      expect(
        d.spawns.some(
          (o) =>
            o.team !== s.team &&
            o.group === s.group &&
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
    // bomb sites in the east (A) and west (B) basins, on the middle line
    const A = d.bombSites!.find((s) => s.name === 'A')!;
    const B = d.bombSites!.find((s) => s.name === 'B')!;
    expect(A.min.x).toBeGreaterThan(101);
    expect(B.max.x).toBeLessThan(19);
    for (const s of [A, B]) expect(s.min.z).toBe(mirZ(s.max.z));
  });

  it('follows the plan: open floor in the pueblo, the mine, the tunnel, the canyons and basins', () => {
    const lv = level();
    const C = CANYON_RELAY;
    // [name, x, floor y, z] in the north-east quarter (checked in all four quarters)
    const places: [string, number, number, number][] = [
      ['station yard', 62.5, 0, 6],
      ['east camp', 90, 0, 5],
      ['storehouse', 79, 0, 12],
      ['cantina', 78, 0, 19],
      ['plaza', 66, 0, 25],
      ['rim street', 75, 0, 28],
      ['relay house', 64, 0, 32],
      ['terrace', 64, 0, 38],
      ['lookout', 75, 0, 36],
      ['gatehouse', 84.5, 0, 37],
      ['rock bridge', 85, 0, 46],
      ['mine hall', 62, C.mine, 27],
      ['mine gallery', 82, C.mine, 28],
      ['cave passage', 96, C.mine, 36],
      ['slot canyon', 108, 0, 10],
      ['basin', 108, C.basin, 42],
    ];
    for (const [name, x, y, z] of places)
      for (const xx of [x, mirX(x)])
        for (const zz of [z, mirZ(z)]) {
          const hit = raycast(lv, v3(xx, y + 1, zz), v3(0, -1, 0), 2);
          expect(hit?.point.y, `${name} ${xx},${zz}`).toBeCloseTo(y, 3);
          expect(capsuleOverlaps(lv, standingCapsule(v3(xx, y, zz))), name).toBe(false);
        }
    // covered rooms have roofs; the mine has rock over it
    for (const [name, x, y, z] of [
      ['storehouse', 79, 0, 12],
      ['cantina', 78, 0, 19],
      ['relay house', 64, 0, 32],
      ['lookout', 75, 0, 36],
      ['gatehouse', 84.5, 0, 37],
      ['mine gallery', 82, C.mine, 28],
      ['rail tunnel', 60, C.rail, 40],
    ] as const)
      expect(raycast(lv, v3(x, y + 1, z), v3(0, 1, 0), 20), `${name} roof`).not.toBeNull();
    // the rail tunnel under the gorge, all the way across
    for (const z of [40, 45, 50, 55, 60]) {
      expect(raycast(lv, v3(60, C.rail + 1, z), v3(0, -1, 0), 2)?.point.y).toBeCloseTo(C.rail, 3);
      expect(capsuleOverlaps(lv, standingCapsule(v3(60, C.rail, z)))).toBe(false);
    }
    // the gorge: a long drop, open to the sky
    const down = raycast(lv, v3(70, 5, 50), v3(0, -1, 0), 60)!;
    expect(down.point.y).toBeCloseTo(C.gorgeFloor, 3);
    expect(raycast(lv, v3(70, 5, 50), v3(0, 1, 0), 200)).toBeNull();
  });

  it('has 8 spawns per team in three sheltered groups (station yard, east camp, west camp)', () => {
    const lv = level();
    for (const team of [0, 1] as const) {
      const spawns = lv.def.spawns.filter((s) => s.team === team);
      expect(spawns.length).toBe(8);
      const groups = new Map<string, number>();
      for (const s of spawns) groups.set(s.group!, (groups.get(s.group!) ?? 0) + 1);
      expect([...groups.entries()].sort()).toEqual([
        ['east camp', 3],
        ['station', 2],
        ['west camp', 3],
      ]);
      // a 3v3 round starts one player in each group
      expect(new Set(spawnOrder(spawns).slice(0, 3).map((s) => s.group)).size).toBe(3);
      for (const s of spawns) {
        expect(capsuleOverlaps(lv, standingCapsule(s.pos)), `spawn ${s.pos.x},${s.pos.z}`).toBe(
          false,
        );
        expect(
          raycast(lv, v3(s.pos.x, s.pos.y + 1, s.pos.z), v3(0, -1, 0), 2)?.point.y,
        ).toBeCloseTo(s.pos.y, 3);
        const z = team === 0 ? s.pos.z : mirZ(s.pos.z);
        const x = s.pos.x >= 60 ? s.pos.x : mirX(s.pos.x);
        const inYard = x < 66 && z > 2 && z < 13;
        const inCamp = x > 83 && x < 98 && z > 2 && z < 12.5;
        expect(s.group === 'station' ? inYard : inCamp, `spawn ${s.pos.x},${s.pos.z}`).toBe(true);
      }
    }
  });

  it('no spawn is seen from the enemy half, the gorge, the canyons, the basins or far away', () => {
    const lv = level();
    const wps = lv.def.waypoints!;
    for (const s of lv.def.spawns) {
      const eye = v3(s.pos.x, s.pos.y + 1.6, s.pos.z);
      for (const w of wps) {
        const from = v3(w.pos.x, w.pos.y + 0.6, w.pos.z);
        if (!lineOfSight(lv, from, eye)) continue;
        const own = s.team === 0 ? w.pos.z < 42 : w.pos.z > 58;
        const town = w.pos.x > 22 && w.pos.x < 98;
        const d = Math.hypot(from.x - eye.x, from.z - eye.z);
        expect(own && town && d < 20, `${w.name} sees spawn ${s.pos.x},${s.pos.z}`).toBe(true);
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
      // big enough to fight over: at least 10 × 10 m
      expect(s.max.x - s.min.x).toBeGreaterThanOrEqual(10);
      expect(s.max.z - s.min.z).toBeGreaterThanOrEqual(10);
      // under the natural arch
      expect(raycast(lv, v3(c.x, s.min.y + 1, 50), v3(0, 1, 0), 20)).not.toBeNull();
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

  it('lights every covered room and the mine', () => {
    const lights = def().lights!;
    const lit = (x: number, y: number, z: number) =>
      lights.some((l) => Math.hypot(l.pos.x - x, l.pos.y - y, l.pos.z - z) < l.radius * 0.8);
    for (const [x, y, z] of [
      [79, 1, 12], // storehouse
      [78, 1, 19], // cantina
      [92, 1, 18], // mine house
      [64, 1, 32], // relay house
      [75, 1, 36], // lookout
      [84.5, 1, 37], // gatehouse
      [62, CANYON_RELAY.mine + 1, 27], // mine hall
      [82, CANYON_RELAY.mine + 1, 28], // gallery
      [96, CANYON_RELAY.mine + 1, 36], // cave passage
      [60, CANYON_RELAY.rail + 1, 45], // rail tunnel
    ])
      for (const xx of [x, mirX(x)])
        for (const zz of [z, mirZ(z)]) expect(lit(xx, y, zz), `${xx},${y},${zz}`).toBe(true);
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
      for (const k of lv.def.killVolumes ?? []) {
        const inside =
          w.pos.x > k.min.x &&
          w.pos.x < k.max.x &&
          w.pos.z > k.min.z &&
          w.pos.z < k.max.z &&
          w.pos.y - 1 < k.max.y &&
          w.pos.y - 1 > k.min.y;
        expect(inside, `waypoint ${w.name} in the gorge`).toBe(false);
      }
    }
    // every waypoint from each Tower and from every spawn group
    const froms = ['towerN', 'towerS', ...all4('camp')];
    for (const from of froms)
      for (let i = 0; i < wps.length; i++)
        expect(
          waypointRoute(wps, wpIndex(lv.def, from), i).length,
          `${from} → ${wps[i].name}`,
        ).toBeGreaterThan(0);
  });

  it('keeps every ramp at 30° or less', () => {
    const rotated = def().boxes.filter((b) => b.q && !b.noCollide);
    // the plaza stairs, the mine house stairs, the rail stairs and the canyon ramps (4 each);
    // the rock fins only turn about the vertical
    const tilted = rotated.filter((b) => Math.abs(b.q!.x) + Math.abs(b.q!.z) > 1e-9);
    expect(tilted.length).toBe(16);
    for (const b of rotated) {
      const q = b.q!;
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      expect((Math.acos(Math.min(1, upY)) * 180) / Math.PI).toBeLessThanOrEqual(30);
    }
  });
});

describe('Canyon Relay: the gorge, the relay rock and the launch pads', () => {
  it('falling into the gorge kills; the relay rock, the bridges and the rail tunnel are safe', () => {
    const { config, ctx, world } = sim();
    const C = CANYON_RELAY;
    const fall = addPlayer(world, createPlayer(1, 0, v3(72, 4.5, 50), 0, config));
    const rock = addPlayer(world, createPlayer(2, 0, v3(60, 1.5, 50), 0, config));
    const bridge = addPlayer(world, createPlayer(3, 1, v3(85, 1.5, 50), 0, config));
    const west = addPlayer(world, createPlayer(4, 1, v3(50, 4.5, 50), 0, config));
    const tunnel = addPlayer(world, createPlayer(5, 1, v3(60, C.rail + 0.5, 46), 0, config));
    for (let t = 0; t < 180; t++) step(world, {}, ctx);
    const feet = (p: typeof rock) => p.pos.y - config.movement.standHeight / 2;
    expect(fall.alive).toBe(false);
    expect(west.alive).toBe(false);
    expect(rock.alive).toBe(true);
    expect(feet(rock)).toBeCloseTo(C.relay.top, 1);
    expect(bridge.alive).toBe(true);
    expect(feet(bridge)).toBeCloseTo(0, 1);
    expect(tunnel.alive).toBe(true);
    expect(feet(tunnel)).toBeCloseTo(C.rail, 1);
  });

  it('sprinting off the terrace in the middle lands you on the relay rock (and its power-up)', () => {
    const { config, ctx, world } = sim();
    // yaw 180 faces +z: from the north terrace toward the gorge
    const p = addPlayer(world, createPlayer(1, 0, v3(60, 0, 38), 180, config));
    for (let t = 0; t < 240; t++) {
      const buttons = p.pos.z < 44.5 ? Btn.Forward : 0;
      step(world, { 1: { tick: world.tick + 1, buttons, view: yawToView(180) } }, ctx);
    }
    expect(p.alive).toBe(true);
    expect(p.pos.y - config.movement.standHeight / 2).toBeCloseTo(CANYON_RELAY.relay.top, 1);
  });

  it('each launch pad throws you across the gorge onto the far terrace', () => {
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
      expect(p.pos.y - config.movement.standHeight / 2).toBeCloseTo(0, 1);
      // the other side of the gorge, on the far terrace (the mirrored pad side)
      const z = c.z < 50 ? p.pos.z : mirZ(p.pos.z);
      expect(z).toBeGreaterThan(CANYON_RELAY.gorge.z1 + 2);
      expect(z).toBeLessThan(64);
      expect(Math.abs(p.pos.x - 60)).toBeLessThan(3);
    }
  });
});

describe('Canyon Relay bots', () => {
  const lanes: [string, string[]][] = [
    ['rock bridges', ['tunnel']],
    ['rail tunnel under the gorge', ['bridgeMidE', 'bridgeMidW']],
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
    60000,
  );

  // [name, team, spawn group, site, waypoints cut off]
  const siteRoutes: [string, 0 | 1, string, string, string[]][] = [
    ['Cyan east camp to A down the slot canyon', 0, 'east camp', 'siteE', ['caveNE', 'caveSE']],
    ['Cyan station to A through the mine and the cave', 0, 'station', 'siteE', all4('gate')],
    ['Cyan west camp to B down the slot canyon', 0, 'west camp', 'siteW', ['caveNW', 'caveSW']],
    ['Orange east camp to A through the mine', 1, 'east camp', 'siteE', all4('gate')],
    ['Orange station to B down the slot canyon', 1, 'station', 'siteW', ['caveNW', 'caveSW']],
    ['Orange west camp to B through the mine', 1, 'west camp', 'siteW', all4('gate')],
  ];
  it.each(siteRoutes)('a bot walks %s', (_name, team, group, site, blocked) => {
    const d = withBlocked(def(), blocked);
    const { config, ctx, world } = sim(d);
    const s = d.spawns.find((sp) => sp.team === team && sp.group === group)!;
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

  it('an Elimination match with bots (3v3, one per spawn group) plays rounds to a result', () => {
    const d = def();
    const { config, ctx, world } = sim(d);
    const mems: BotMemory[] = [];
    let id = 1;
    for (const team of [0, 1] as const)
      for (const group of ['station', 'east camp', 'west camp']) {
        const s = d.spawns.find((sp) => sp.team === team && sp.group === group)!;
        addPlayer(world, createPlayer(id, team, s.pos, s.yawDeg, config));
        mems.push(createBotMemory(id, BOT_SKILLS.normal, id * 17));
        id++;
      }
    const ms = createMatch('3v3', 'elim');
    startMatch(ms, world, ctx);
    const kills: SimEvent[] = [];
    while (ms.rounds.length < 1 && world.tick < 60 * (5 + 80 + 40)) {
      const inputs: Record<number, PlayerInput> = {};
      for (const mem of mems) {
        const p = world.players.find((q) => q.id === mem.id)!;
        if (p.alive) inputs[p.id] = botThink(world, ctx, p, mem);
      }
      step(world, inputs, ctx);
      updateMatch(ms, world, ctx);
      applyBotObjectives(ms, world, ctx, mems);
      kills.push(...world.events.filter((e) => e.type === 'kill'));
    }
    expect(ms.rounds.length).toBe(1);
    expect(ms.rounds[0].winner).not.toBeNull();
    expect(kills.length).toBeGreaterThan(0);
  }, 120000);
});
