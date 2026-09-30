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
  findOverlaps,
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
  type BotMemory,
  type LevelDef,
  type PlayerInput,
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

/** Cyan's spawn buildings (Orange's mirror them) */
const ROOMS = [SAKURA_HOLD.gatehouse, SAKURA_HOLD.postern];
const inRoom = (p: Vec3) =>
  ROOMS.some((r) => [p.z, mirZ(p.z)].some((z) => p.x > r.x0 && p.x < r.x1 && z > r.z0 && z < r.z1));

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
    expect(d.boxes.length).toBeGreaterThan(500);
    expect(d.boxes.length).toBeLessThan(950);
    expect(findOverlaps(d)).toEqual([]);
  });

  it('is mirror-symmetric north ↔ south (z → 80 - z, teams swapped)', () => {
    const d = def();
    const boxes = new Set(
      d.boxes.map((b) => [b.c.x, b.c.y, b.c.z, b.h.x, b.h.y, b.h.z].map(key).join(',')),
    );
    // (the far scenery outside the castle walls is not mirrored)
    const inside = (b: (typeof d.boxes)[number]) =>
      b.c.x >= 0 && b.c.x <= 80 && b.c.z >= 0 && b.c.z <= 80;
    for (const b of d.boxes.filter(inside)) {
      const twin = [b.c.x, b.c.y, mirZ(b.c.z), b.h.x, b.h.y, b.h.z].map(key).join(',');
      expect(boxes.has(twin), `box ${JSON.stringify(b.c)}`).toBe(true);
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
    for (const w of d.waypoints!)
      expect(
        d.waypoints!.some(
          (o) => key(o.pos.x) === key(w.pos.x) && key(o.pos.z) === key(mirZ(w.pos.z)),
        ),
      ).toBe(true);
    for (const p of d.slowZones!)
      expect(
        d.slowZones!.some(
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

  it('follows the plan: open floor on every floor of the compound', () => {
    const lv = level();
    const K = SAKURA_HOLD.keep;
    const places: [string, number, number, number][] = [
      ['gatehouse', 35, 0, 5],
      ['postern', 6, 0, 6],
      ['front court', 44, 0, 17],
      ['tatami hall', 19, 0, 18],
      ['tea room', 51, 0, 18],
      ['tea corridor', 61.5, 0, 13],
      ['west lane', 13, 0, 20],
      ['keep, ground floor', 45.5, 0, 36],
      ['keep, 1st floor', 45.3, K.floors[1], 37.8],
      ['keep, 2nd floor', 34.7, K.floors[2], 35.1],
      ['keep roof', 35, K.roof, 35],
      ['wall-walk', 5.5, SAKURA_HOLD.wall, 30],
      ['cellar tunnel', 23.5, SAKURA_HOLD.cellar, 30],
      ['cellar storeroom', 40, SAKURA_HOLD.cellar, 40],
      ['A site', 60, 0, 35],
      ['B site', 17, 0, 40],
      ['moat', 75.5, -SAKURA_HOLD.moat.depth, 20],
    ];
    for (const [name, x, y, z] of places)
      for (const zz of [z, mirZ(z)]) {
        expect(raycast(lv, v3(x, y + 1, zz), v3(0, -1, 0), 2)?.point.y, name).toBeCloseTo(y, 3);
        expect(capsuleOverlaps(lv, standingCapsule(v3(x, y, zz))), name).toBe(false);
      }
  });

  it('has 8 valid spawns per team in two groups (gatehouse, postern), Towers, sites with floor', () => {
    const d = def();
    const lv = level();
    for (const team of [0, 1] as const) {
      const spawns = d.spawns.filter((s) => s.team === team);
      expect(spawns.length).toBe(8);
      for (const [group, room] of [
        ['gate', SAKURA_HOLD.gatehouse],
        ['postern', SAKURA_HOLD.postern],
      ] as const) {
        const list = spawns.filter((s) => s.group === group);
        expect(list.length).toBe(4);
        for (const s of list) {
          expect(capsuleOverlaps(lv, standingCapsule(s.pos))).toBe(false);
          expect(
            raycast(lv, v3(s.pos.x, s.pos.y + 1, s.pos.z), v3(0, -1, 0), 2)?.point.y,
          ).toBeCloseTo(s.pos.y, 3);
          const z = team === 0 ? s.pos.z : mirZ(s.pos.z);
          expect(z > room.z0 && z < room.z1 && s.pos.x > room.x0 && s.pos.x < room.x1).toBe(true);
        }
      }
      const t = d.towers.find((x) => x.team === team)!;
      const w = wpPos(d, team === 0 ? 'towerN' : 'towerS');
      expect(Math.hypot(w.x - t.pos.x, w.z - t.pos.z)).toBeLessThan(
        t.radius + defaultConfig().rules.towerTouchRadius + 0.5,
      );
    }
    for (const s of d.bombSites!) {
      expect(s.max.x - s.min.x).toBeGreaterThanOrEqual(8);
      expect(s.max.z - s.min.z).toBeGreaterThanOrEqual(8);
      const c = v3((s.min.x + s.max.x) / 2, s.min.y + 1, (s.min.z + s.max.z) / 2);
      expect(raycast(lv, c, v3(0, -1, 0), 2)?.point.y).toBeCloseTo(s.min.y, 3);
      expect(capsuleOverlaps(lv, standingCapsule(v3(c.x, s.min.y, c.z)))).toBe(false);
    }
    // the power-up floats over the keep roof's stair hatch
    expect(d.powerups!.map((p) => [p.x, p.z])).toEqual([[40, 40]]);
  });

  it('no spawn can be seen from anywhere outside its spawn building', () => {
    const lv = level();
    const eyes: Vec3[] = [];
    const floors = [
      0,
      SAKURA_HOLD.wall,
      ...SAKURA_HOLD.keep.floors.slice(1),
      SAKURA_HOLD.keep.roof,
    ];
    for (let x = 3; x < 78; x += 1.5)
      for (let z = 3; z < 78; z += 1.5)
        for (const y of floors) {
          const feet = v3(x, y, z);
          if (inRoom(feet)) continue;
          const hit = raycast(lv, v3(x, y + 1, z), v3(0, -1, 0), 1.4);
          if (!hit || Math.abs(hit.point.y - y) > 0.5) continue;
          if (capsuleOverlaps(lv, standingCapsule(v3(x, hit.point.y, z)))) continue;
          eyes.push(v3(x, hit.point.y + 1.6, z));
        }
    expect(eyes.length).toBeGreaterThan(600);
    for (const s of lv.def.spawns)
      for (const chest of [v3(s.pos.x, 1, s.pos.z), v3(s.pos.x, 1.6, s.pos.z)])
        for (const e of eyes)
          expect(
            lineOfSight(lv, e, chest),
            `${JSON.stringify(e)} sees ${JSON.stringify(s.pos)}`,
          ).toBe(false);
  });

  it('every spawn building has 2+ exits: blocking any one still reaches both sites', () => {
    const d = def();
    const exits: [string, string[]][] = [
      ['towerN', ['gateOutN', 'gSideWN', 'gSideEN']],
      ['pInN', ['pDoorSN', 'pDoorEN']],
      ['towerS', ['gateOutS', 'gSideWS', 'gSideES']],
      ['pInS', ['pDoorSS', 'pDoorES']],
    ];
    for (const [from, doors] of exits) {
      for (const door of doors) {
        const wps = withBlocked(d, [door]).waypoints!;
        for (const site of ['siteA', 'siteB'])
          expect(
            waypointRoute(wps, wpIndex(d, from), wpIndex(d, site)).length,
            `${from} ${door}`,
          ).toBeGreaterThan(0);
      }
      // with every door blocked it is sealed: the doors really are the exits
      const sealed = withBlocked(d, doors).waypoints!;
      expect(waypointRoute(sealed, wpIndex(d, from), wpIndex(d, 'siteA')).length).toBe(0);
    }
  });

  it('each bomb site has 3+ entrances (blocking all of them cuts it off)', () => {
    const d = def();
    const entrances: [string, string[]][] = [
      ['siteB', ['bVerN', 'bVerS', 'bLink', 'wDown']],
      ['siteA', ['aVerN', 'aVerS', 'aLink', 'wGate']],
    ];
    for (const [site, ways] of entrances) {
      for (const way of ways) {
        const wps = withBlocked(
          d,
          ways.filter((w) => w !== way),
        ).waypoints!;
        expect(
          waypointRoute(wps, wpIndex(d, 'towerN'), wpIndex(d, site)).length,
          way,
        ).toBeGreaterThan(0);
      }
      const cut = withBlocked(d, ways).waypoints!;
      expect(waypointRoute(cut, wpIndex(d, 'towerN'), wpIndex(d, site)).length).toBe(0);
    }
  });

  it('waypoints sit in open space, keep out of the moat, and every one is reachable', () => {
    const lv = level();
    const wps = lv.def.waypoints!;
    for (const w of wps) {
      expect(
        capsuleOverlaps(lv, { center: w.pos, up: v3(0, 1, 0), halfSeg: 0, radius: 0.3 }),
        `waypoint ${w.name}`,
      ).toBe(false);
      const floor = raycast(lv, w.pos, v3(0, -1, 0), 3);
      expect(Math.abs(w.pos.y - 1 - (floor?.point.y ?? -99)), `floor under ${w.name}`).toBeLessThan(
        0.5,
      );
      for (const j of w.links)
        expect(lineOfSight(lv, w.pos, wps[j].pos), `link ${w.name} → ${wps[j].name}`).toBe(true);
    }
    // the moat is a real (slow) route: its waypoints are in the water
    const m = wpPos(lv.def, 'moat2N');
    expect(slowZoneMul(lv.def, v3(m.x, m.y - 1, m.z))).toBeLessThan(1);
    for (const from of ['towerN', 'towerS', 'pInN', 'pInS'])
      for (let i = 0; i < wps.length; i++)
        expect(waypointRoute(wps, wpIndex(lv.def, from), i).length, wps[i].name).toBeGreaterThan(0);
  });

  it('keeps every ramp at 30° or less', () => {
    const rotated = def().boxes.filter((b) => b.q && !b.noCollide);
    expect(rotated.length).toBeGreaterThan(0);
    for (const b of rotated) {
      const q = b.q!;
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      expect((Math.acos(Math.min(1, upY)) * 180) / Math.PI).toBeLessThanOrEqual(30);
    }
  });
});

describe('Sakura Hold: moat, paper walls', () => {
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

  it('wading through the moat is slow; the lane beside the wall-walk is not', () => {
    // yaw 180 faces +z
    const wade = run(v3(75.5, -SAKURA_HOLD.moat.depth, 15), 180, 90);
    const dry = run(v3(13, 0, 12.5), 180, 90);
    const speed = (t: Vec3[]) => Math.hypot(t[89].x - t[59].x, t[89].z - t[59].z) / 0.5;
    const cap = defaultConfig().movement.sprintSpeed * SAKURA_HOLD.moat.speedMul;
    expect(speed(wade.track)).toBeLessThanOrEqual(cap + 0.05);
    expect(speed(wade.track)).toBeGreaterThan(cap * 0.8);
    expect(speed(dry.track)).toBeGreaterThan(8.5);
  });

  it('a paper wall stops players, lasers and sight, but not the Boomerang', () => {
    const lv = level();
    // the first shoji screen of the tea corridor (z 16, x 58..60.8)
    const eye = v3(59.4, 1.6, 13);
    const dir = v3(0, 0, 1);
    const hit = raycast(lv, eye, dir, 10)!;
    expect(hit.point.z).toBeCloseTo(15.9, 3);
    expect(lv.def.boxes[hit.box].mat).toBe('paper');
    expect(lv.def.boxes[hit.box].boomerangPasses).toBe(true);
    expect(raycast(lv, eye, dir, 10, 0.2, true)).toBeNull(); // the Boomerang's flight
    expect(lineOfSight(lv, eye, v3(59.4, 1.6, 18.5))).toBe(false);
    expect(capsuleOverlaps(lv, standingCapsule(v3(59.4, 0, 16)))).toBe(true);
    const walk = run(v3(59.4, 0, 13), 180, 90);
    expect(walk.p.pos.z).toBeLessThan(15.9);
  });

  it('a Quick Throw flies through the paper wall and hits the player behind it', () => {
    const { config, ctx, world } = sim();
    const thrower = addPlayer(world, createPlayer(1, 0, v3(59.4, 0, 13), 180, config));
    const target = addPlayer(world, createPlayer(2, 1, v3(59.4, 0, 18.5), 0, config));
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
});

describe('Sakura Hold bots', () => {
  const walkTo = (
    d: LevelDef,
    from: Vec3,
    yaw: number,
    team: 0 | 1,
    goalName: string,
    secs: number,
  ) => {
    const { config, ctx, world } = sim(d);
    const p = addPlayer(world, createPlayer(1, team, from, yaw, config));
    const mem = createBotMemory(1, BOT_SKILLS.normal, 9);
    const goal = wpPos(d, goalName);
    mem.objective = v3(goal.x, goal.y - 1, goal.z);
    mem.objectiveFirst = true;
    for (let t = 0; t < 60 * secs; t++) {
      step(world, { 1: botThink(world, ctx, p, mem) }, ctx);
      if (
        Math.hypot(p.pos.x - goal.x, p.pos.z - goal.z) < 2.5 &&
        Math.abs(p.pos.y - (goal.y - 1)) < 1.5
      )
        return true;
    }
    return false;
  };

  const lanes: [string, string[]][] = [
    ['front court and keep', ['hallN', 'hallS', 'tRoomN', 'tRoomS', 'laneN', 'laneS']],
    ['halls and verandas', ['kDoorN', 'kDoorS']],
  ];
  it.each(lanes.flatMap(([n, b]) => ([0, 1] as const).map((team) => [n, team, b] as const)))(
    'a bot carries the Controller to the enemy Tower via the %s (team %i)',
    (_name, team, blocked) => {
      const { lv, config, ctx, world } = sim(withBlocked(def(), [...blocked]));
      const s = lv.def.spawns.find((sp) => sp.team === team && sp.group === 'gate')!;
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
    60000,
  );

  // every spawn group to both sites, and the flank routes (wall-walk, moat, cellar)
  const siteRoutes: [string, 0 | 1, string, string, string[]][] = [
    ['Cyan gatehouse to A', 0, 'gate', 'siteA', []],
    ['Cyan gatehouse to B', 0, 'gate', 'siteB', []],
    ['Cyan postern to A', 0, 'postern', 'siteA', []],
    ['Cyan postern to B', 0, 'postern', 'siteB', []],
    ['Orange gatehouse to A', 1, 'gate', 'siteA', []],
    ['Orange gatehouse to B', 1, 'gate', 'siteB', []],
    ['Orange postern to A', 1, 'postern', 'siteA', []],
    ['Orange postern to B', 1, 'postern', 'siteB', []],
    ['Cyan postern to B along the wall-walk', 0, 'postern', 'siteB', ['laneN', 'hallWN']],
    ['Cyan gatehouse to A through the moat', 0, 'gate', 'siteA', ['tRoomN', 'kDoorN', 'tCorrN2N']],
    [
      'Orange gatehouse to A through the moat',
      1,
      'gate',
      'siteA',
      ['tRoomS', 'kDoorS', 'tCorrN2S'],
    ],
  ];
  it.each(siteRoutes)(
    'a bot walks %s',
    (_name, team, group, site, blocked) => {
      const d = withBlocked(def(), blocked);
      const s = d.spawns.find((sp) => sp.team === team && sp.group === group)!;
      expect(walkTo(d, s.pos, s.yawDeg, team, site, 40)).toBe(true);
    },
    60000,
  );

  it('a bot takes the cellar loop from the tatami hall to the tea room', () => {
    const d = def();
    const from = wpPos(d, 'hallN');
    expect(walkTo(d, v3(from.x, 0, from.z), 180, 0, 'cRoom', 30)).toBe(true);
    const c = wpPos(d, 'cRoom');
    expect(walkTo(d, v3(c.x, c.y - 1, c.z), 90, 0, 'tTopN', 30)).toBe(true);
  }, 60000);

  it('a bot climbs the keep to its roof', () => {
    const d = def();
    const s = d.spawns.find((sp) => sp.team === 0 && sp.group === 'gate')!;
    expect(walkTo(d, s.pos, s.yawDeg, 0, 'roofNN', 40)).toBe(true);
  }, 60000);

  it('an Elimination match with bots (2v2) plays rounds to a result', () => {
    const d = def();
    const { config, ctx, world } = sim(d);
    const mems: BotMemory[] = [];
    let id = 1;
    for (const team of [0, 1] as const)
      for (let i = 0; i < 2; i++) {
        const s = d.spawns.filter((sp) => sp.team === team)[i * 4];
        addPlayer(world, createPlayer(id, team, s.pos, s.yawDeg, config));
        mems.push(createBotMemory(id, BOT_SKILLS.normal, id * 17));
        id++;
      }
    const ms = createMatch('2v2', 'elim');
    startMatch(ms, world, ctx);
    const kills: SimEvent[] = [];
    while (ms.rounds.length < 2 && world.tick < 60 * 2 * (5 + 80 + 40)) {
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
    expect(ms.rounds.length).toBe(2);
    expect(kills.length).toBeGreaterThan(0);
    for (const r of ms.rounds) expect(r.winner).not.toBeNull();
  }, 120000);
});
