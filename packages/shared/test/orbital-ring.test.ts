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
  lineOfSight,
  mapDef,
  MAPS,
  matchView,
  ORBITAL_RING,
  raycast,
  startMatch,
  step,
  TICK_DT,
  updateMatch,
  v3,
  waypointRoute,
  yawToView,
  type LevelDef,
  type MatchState,
  type SimContext,
  type Vec3,
  type WorldState,
} from '../src/index';

const def = () => mapDef('orbital-ring');
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

describe('Orbital Ring map', () => {
  it('is a competitive map next to Split Deck and Kestrel, ', () => {
    const m = MAPS.find((x) => x.id === 'orbital-ring');
    expect(m?.competitive).toBe(true);
    expect(MAPS.find((x) => x.id === 'split-deck')?.competitive).toBe(true);
    expect(MAPS.find((x) => x.id === 'kestrel')?.competitive).toBe(true);
  });

  it('is mirror-symmetric north ↔ south (z → -z, teams swapped)', () => {
    const d = def();
    const boxes = new Set(
      d.boxes.map((b) => [b.c.x, b.c.y, b.c.z, b.h.x, b.h.y, b.h.z].map(key).join(',')),
    );
    for (const b of d.boxes) {
      const twin = [b.c.x, b.c.y, -b.c.z, b.h.x, b.h.y, b.h.z].map(key).join(',');
      expect(boxes.has(twin), `box ${JSON.stringify(b.c)}`).toBe(true);
    }
    for (const s of d.spawns)
      expect(
        d.spawns.some(
          (o) =>
            o.team !== s.team && key(o.pos.x) === key(s.pos.x) && key(o.pos.z) === key(-s.pos.z),
        ),
      ).toBe(true);
    expect(d.towers.map((t) => t.pos.z).sort((a, b) => a - b)).toEqual([-67.5, 67.5]);
    for (const w of d.waypoints!)
      expect(
        d.waypoints!.some((o) => key(o.pos.x) === key(w.pos.x) && key(o.pos.z) === key(-w.pos.z)),
      ).toBe(true);
    for (const list of [d.launchPads ?? [], d.portals ?? []])
      for (const p of list)
        expect(
          list.some(
            (o) =>
              key(o.min.x) === key(p.min.x) &&
              key(o.min.z) === key(-p.max.z) &&
              key(o.max.z) === key(-p.min.z),
          ),
        ).toBe(true);
    // bomb sites east (A) and west (B), centred between the spawns
    const A = d.bombSites!.find((s) => s.name === 'A')!;
    const B = d.bombSites!.find((s) => s.name === 'B')!;
    expect(A.min.x).toBeGreaterThan(0);
    expect(B.max.x).toBeLessThan(0);
    expect(A.min.z).toBe(-A.max.z);
    expect(B.min.z).toBe(-B.max.z);
  });

  it('has 8 valid spawns per team (clear capsule, floor underneath, inside its spawn)', () => {
    const lv = level();
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
        const zm = Math.abs(s.pos.z);
        expect(zm > ORBITAL_RING.spawn.z0 && zm < ORBITAL_RING.spawn.z1).toBe(true);
        expect(Math.sign(s.pos.z)).toBe(team === 0 ? -1 : 1);
      }
    }
  });

  it('has Towers + Controller homes, bomb sites with floor, power-ups and devices in the open', () => {
    const d = def();
    const lv = level();
    for (const team of [0, 1] as const) {
      const t = d.towers.find((x) => x.team === team)!;
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
    expect(d.powerups!.length).toBe(3);
    for (const p of d.powerups!)
      expect(capsuleOverlaps(lv, { center: p, up: v3(0, 1, 0), halfSeg: 0, radius: 0.4 })).toBe(
        false,
      );
    // the middle one floats over the hole: straight down is the pit floor
    expect(raycast(lv, d.powerups![0], v3(0, -1, 0), 20)?.point.y).toBeCloseTo(
      ORBITAL_RING.basement,
      3,
    );
    expect(d.rails.length).toBe(5);
    expect(d.launchPads!.length).toBe(6);
    expect(d.portals!.length).toBe(2);
    for (const pt of d.portals!) {
      expect(capsuleOverlaps(lv, { ...standingCapsule(pt.exit), center: pt.exit })).toBe(false);
      // an exit never lands inside a portal (no ping-pong)
      for (const o of d.portals!)
        expect(
          pt.exit.x >= o.min.x &&
            pt.exit.x <= o.max.x &&
            pt.exit.z >= o.min.z &&
            pt.exit.z <= o.max.z,
        ).toBe(false);
    }
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
      // no waypoint on a launch pad or in a portal (bots would get thrown around)
      for (const p of [...(lv.def.launchPads ?? []), ...(lv.def.portals ?? [])])
        expect(
          w.pos.x >= p.min.x - 0.4 &&
            w.pos.x <= p.max.x + 0.4 &&
            w.pos.z >= p.min.z - 0.4 &&
            w.pos.z <= p.max.z + 0.4 &&
            w.pos.y >= p.min.y &&
            w.pos.y <= p.max.y,
          `waypoint ${w.name} on a device`,
        ).toBe(false);
    }
    for (const from of ['towerN', 'towerS'])
      for (let i = 0; i < wps.length; i++)
        expect(
          waypointRoute(wps, wpIndex(lv.def, from), i).length,
          `${from} → ${wps[i].name}`,
        ).toBeGreaterThan(0);
  });

  it('keeps every ramp at 30° or less', () => {
    const tilted = def().boxes.filter((b) => b.q && !b.noCollide);
    expect(tilted.length).toBe(8);
    for (const b of tilted) {
      const q = b.q!;
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      expect((Math.acos(Math.min(1, upY)) * 180) / Math.PI).toBeLessThanOrEqual(30);
    }
  });

  it('seals the station: rays from every room hit a wall, floor or the glass', () => {
    const lv = level();
    const rooms = [
      v3(0, 2, -63),
      v3(0, 2, 63),
      v3(0, 3, -10),
      v3(0, -4, -10),
      v3(12, 8, 0),
      v3(19, 2, -19),
      v3(19, -4, -19),
      v3(50, 2, 0),
      v3(-50, 2, 0),
      v3(43, 2, -40),
      v3(30, 2, -63),
      v3(8, -3, -38),
      v3(30, -2, 8),
      v3(0, 2, -35),
      v3(30, 2, 0),
    ];
    for (const p of rooms)
      for (let a = 0; a < 360; a += 15)
        for (const el of [-45, 0, 30, 70]) {
          const r = (el * Math.PI) / 180;
          const dir = v3(
            Math.cos((a * Math.PI) / 180) * Math.cos(r),
            Math.sin(r),
            Math.sin((a * Math.PI) / 180) * Math.cos(r),
          );
          expect(raycast(lv, p, dir, 250), `ray from ${JSON.stringify(p)} a${a} e${el}`).not.toBe(
            null,
          );
        }
  });

  it('no spawn is in view from the ring, the core or the far end of its outer corridors', () => {
    const lv = level();
    for (const z of [-1, 1]) {
      const spawnPts = lv.def.spawns
        .filter((s) => Math.sign(s.pos.z) === z)
        .map((s) => v3(s.pos.x, 1.6, s.pos.z));
      const lookouts = [
        v3(0, 1.6, z * 19),
        v3(8, 1.6, z * 10),
        v3(43, 1.6, z * 63),
        v3(-43, 1.6, z * 63),
      ];
      for (const l of lookouts)
        for (const s of spawnPts)
          expect(lineOfSight(lv, l, s), `${JSON.stringify(l)} sees ${JSON.stringify(s)}`).toBe(
            false,
          );
    }
  });
});

describe('Orbital Ring devices', () => {
  const run = (world: WorldState, ctx: SimContext, ticks: number, buttons = 0, yaw = 0) => {
    const events: string[] = [];
    for (let t = 0; t < ticks; t++) {
      step(world, { 1: { tick: world.tick + 1, buttons, view: yawToView(yaw) } }, ctx);
      for (const e of world.events) events.push(e.type);
    }
    return events;
  };

  it('a pit launch pad throws you up through the hole onto the core floor', () => {
    const { config, ctx, world } = sim();
    const p = addPlayer(world, createPlayer(1, 0, v3(-2, ORBITAL_RING.basement, 0), 0, config));
    const events = run(world, ctx, 150);
    expect(events).toContain('launch');
    expect(events.filter((e) => e === 'launch').length).toBe(1);
    expect(p.grounded).toBe(true);
    expect(p.pos.y - config.movement.standHeight / 2).toBeCloseTo(0, 1); // feet on the core floor
    expect(p.pos.x).toBeGreaterThan(ORBITAL_RING.hole);
  });

  it('a core corner pad throws you onto that side’s balcony', () => {
    const { config, ctx, world } = sim();
    for (const [x, z] of [
      [12.4, -12.4],
      [-12.4, 12.4],
    ]) {
      const p = addPlayer(world, createPlayer(world.players.length + 1, 0, v3(x, 0, z), 0, config));
      for (let t = 0; t < 150; t++) step(world, {}, ctx);
      expect(p.grounded).toBe(true);
      expect(p.pos.y - config.movement.standHeight / 2).toBeCloseTo(ORBITAL_RING.balcony, 0);
      expect(Math.abs(p.pos.x)).toBeGreaterThan(11);
      expect(Math.abs(p.pos.z)).toBeLessThan(8);
    }
  });

  it('the rift portals: walk into the back of A, come out at the back of B (and back)', () => {
    const { config, ctx, world } = sim();
    // yaw -90: facing +x (east), into A's portal
    const p = addPlayer(world, createPlayer(1, 0, v3(56, 0, 0), -90, config));
    const east = run(world, ctx, 90, Btn.Forward, -90);
    expect(east).toContain('portal');
    expect(p.pos.x).toBeLessThan(-40); // in B site now, still heading east
    expect(p.pos.x).toBeGreaterThan(-58);
    const back = run(world, ctx, 150, Btn.Forward, 90); // west, into B's portal
    expect(back).toContain('portal');
    expect(p.pos.x).toBeGreaterThan(40);
    expect(p.pos.x).toBeLessThan(58);
  });

  it('the core zip-rail carries you balcony to balcony over the hole', () => {
    const { config, ctx, world } = sim();
    const p = addPlayer(world, createPlayer(1, 0, v3(12.5, ORBITAL_RING.balcony, 0), 0, config));
    run(world, ctx, 10);
    // jump under the rail, facing west, and ride it
    const ev = run(world, ctx, 25, Btn.Jump, 90);
    expect(ev).toContain('railGrab');
    run(world, ctx, 150, 0, 90);
    expect(p.pos.x).toBeLessThan(-10);
    expect(p.pos.y - config.movement.standHeight / 2).toBeCloseTo(ORBITAL_RING.balcony, 0);
  });
});

describe('Orbital Ring bots', () => {
  // Tower mode: each team's carrier takes each lane to the enemy Tower
  const lanes: [string, string[]][] = [
    [
      'ring and core',
      ['l1aNE', 'l1aNW', 'l1aSE', 'l1aSW', 'stDoorNE', 'stDoorNW', 'stDoorSE', 'stDoorSW'],
    ],
    ['outer corridors via a site', ['cnANE', 'cnANW', 'cnASE', 'cnASW']],
    ['basement ring', ['cn1N', 'cn1S', 'l1aNE', 'l1aNW', 'l1aSE', 'l1aSW']],
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
    ['Cyan to A through the ring', 0, 'aCE', ['l1aNE', 'stDoorNE', 'stDoorNW']],
    ['Cyan to A down the outer corridor', 0, 'aCE', ['cnANE', 'cnANW']],
    ['Cyan to B through the basement', 0, 'aCW', ['l1aNW', 'cn1N']],
    ['Orange to A through the basement', 1, 'aCE', ['l1aSE', 'cn1S']],
    ['Orange to B down the outer corridor', 1, 'aCW', ['cnASE', 'cnASW']],
    [
      'Orange to A dropping through the hole',
      1,
      'aCE',
      [
        ...['l1aSE', 'l1aSW', 'stDoorSE', 'stDoorSW', 'ringCSE', 'ringCSW'],
        ...['cDoor2SE', 'cDoor2SW', 'cDoor2NE', 'cDoor2NW', 'cDoor1NE', 'cDoor1NW'],
      ],
    ],
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
    expect(arrived).toBe(true);
  });
});
