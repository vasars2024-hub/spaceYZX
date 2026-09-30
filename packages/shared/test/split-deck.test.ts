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
  getMap,
  lineOfSight,
  mapDef,
  MAPS,
  raycast,
  SPLIT_DECK,
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

const def = () => mapDef('split-deck');
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

describe('Split Deck map', () => {
  it('is the default match map: competitive, not mirror-symmetric; Kestrel stays available', () => {
    const m = MAPS.find((x) => x.id === 'split-deck');
    expect(m?.competitive).toBe(true);
    expect(m?.symmetric).toBeFalsy();
    expect(DEFAULT_MATCH_MAP()).toBe('split-deck');
    expect(getMap('kestrel').id).toBe('kestrel');
    expect(mapDef('kestrel').name).toBe('Kestrel');
  });

  it('has 8 valid spawns per team (clear capsule, floor underneath, inside its base)', () => {
    const lv = level();
    for (const team of [0, 1] as const) {
      const spawns = lv.def.spawns.filter((s) => s.team === team);
      expect(spawns.length).toBe(8);
      const base = team === 0 ? SPLIT_DECK.cyanSpawn : SPLIT_DECK.orangeSpawn;
      for (const s of spawns) {
        expect(capsuleOverlaps(lv, standingCapsule(s.pos)), `spawn ${s.pos.x},${s.pos.z}`).toBe(
          false,
        );
        const hit = raycast(lv, v3(s.pos.x, s.pos.y + 1, s.pos.z), v3(0, -1, 0), 2);
        expect(hit?.point.y).toBeCloseTo(s.pos.y, 3);
        expect(
          s.pos.x > base.x0 && s.pos.x < base.x1 && s.pos.z > base.z0 && s.pos.z < base.z1,
        ).toBe(true);
      }
    }
  });

  it('carries the Controller & Tower data: a Tower and a Controller home per team', () => {
    const d = def();
    const lv = level();
    expect(d.towers.map((t) => t.team).sort()).toEqual([0, 1]);
    expect(d.controllerHomes?.length).toBe(2);
    for (const team of [0, 1] as const) {
      const t = d.towers.find((x) => x.team === team)!;
      const home = d.controllerHomes![team];
      // the home is in the open, on the floor, near its own Tower
      expect(capsuleOverlaps(lv, standingCapsule(v3(home.x, 0, home.z)))).toBe(false);
      expect(Math.hypot(home.x - t.pos.x, home.z - t.pos.z)).toBeLessThan(6);
      // a carrier standing at the Tower waypoint touches the Tower (radius + touch reach)
      const w = wpPos(d, team === 0 ? 'cTower' : 'oTower');
      expect(Math.hypot(w.x - t.pos.x, w.z - t.pos.z)).toBeLessThan(
        t.radius + defaultConfig().rules.towerTouchRadius + 0.5,
      );
    }
  });

  it('carries Bomb mode data: sites A (deck) and B (hold) with floor, a power-up over the hole', () => {
    const d = def();
    const lv = level();
    expect(d.bombSites?.map((s) => s.name).sort()).toEqual(['A', 'B']);
    const A = d.bombSites!.find((s) => s.name === 'A')!;
    const B = d.bombSites!.find((s) => s.name === 'B')!;
    expect(A.min.y).toBe(SPLIT_DECK.deck);
    expect(B.min.y).toBe(SPLIT_DECK.hold);
    for (const s of [A, B]) {
      const c = v3((s.min.x + s.max.x) / 2, s.min.y + 1, (s.min.z + s.max.z) / 2);
      expect(raycast(lv, c, v3(0, -1, 0), 2)?.point.y).toBeCloseTo(s.min.y, 3);
    }
    expect(d.powerups?.length).toBeGreaterThan(0);
    const p = d.powerups![0];
    // nothing under it but the pit floor, 7 m down: it floats over the hole
    expect(raycast(lv, p, v3(0, -1, 0), 20)?.point.y).toBeCloseTo(SPLIT_DECK.hold, 3);
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
    }
    // from both spawns to everywhere (the hole drops are one-way, so both directions matter)
    for (const from of ['cTower', 'oTower'])
      for (let i = 0; i < wps.length; i++)
        expect(
          waypointRoute(wps, wpIndex(lv.def, from), i).length,
          `${from} → ${wps[i].name}`,
        ).toBeGreaterThan(0);
  });

  it('keeps every ramp at 30° or less (full sprint speed)', () => {
    const tilted = def().boxes.filter((b) => b.q);
    expect(tilted.length).toBeGreaterThanOrEqual(6);
    for (const b of tilted) {
      const q = b.q!;
      // world y of the box's local up axis
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      expect((Math.acos(Math.min(1, upY)) * 180) / Math.PI).toBeLessThanOrEqual(30);
    }
  });

  it('seals the ship: rays from every room hit a wall, floor or the glass', () => {
    const lv = level();
    const rooms = [
      v3(60, 2, 10),
      v3(60, 2, 90),
      v3(60, 3, 49),
      v3(60, -3, 49),
      v3(93, 8, 27),
      v3(93, 8, 55),
      v3(27, -3, 28),
      v3(25, -3, 55),
      v3(39, -3, 47),
      v3(30, 2, 82),
      v3(90, 2, 82),
      v3(50, 2, 72),
    ];
    for (const p of rooms)
      for (let a = 0; a < 360; a += 10)
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

  it('closes the atrium and the A deck with a glass ceiling at y 14 (it collides)', () => {
    const lv = level();
    for (const p of [v3(60, 3, 49), v3(72, 3, 45), v3(80.5, 9, 44), v3(93, 8, 27)]) {
      const hit = raycast(lv, p, v3(0, 1, 0), 30)!;
      expect(hit.point.y).toBeCloseTo(SPLIT_DECK.glass, 3);
      expect(lv.def.boxes[hit.box].mat).toBe('skyglass');
    }
    // a player flying up with the jetpack stops under the glass
    const config = defaultConfig();
    const ctx: SimContext = { level: lv, config, dt: TICK_DT };
    const world = createWorld(lv, 1);
    const p = addPlayer(world, createPlayer(1, 0, v3(93, SPLIT_DECK.deck, 27), 0, config));
    let top = -Infinity;
    for (let t = 0; t < 60 * 6; t++) {
      // tap-hold: jump, then keep Space held in the air (jetpack), re-jump after landing
      const buttons = t % 90 < 60 ? Btn.Jump : 0;
      step(world, { 1: { tick: world.tick + 1, buttons, view: yawToView(0) } }, ctx);
      top = Math.max(top, p.pos.y + config.movement.standHeight / 2); // head (pos = body centre)
    }
    expect(top).toBeGreaterThan(SPLIT_DECK.deck + 3); // it really flew
    expect(top).toBeLessThanOrEqual(SPLIT_DECK.glass + 0.01);
  });

  it('the atrium hole is a real drop into the pit', () => {
    const lv = level();
    const config = defaultConfig();
    const ctx: SimContext = { level: lv, config, dt: TICK_DT };
    const world = createWorld(lv, 1);
    // on the hole's south rim, sprinting north over the edge
    const p = addPlayer(world, createPlayer(1, 1, v3(60, 0, 58.5), 0, config));
    for (let t = 0; t < 90; t++)
      step(world, { 1: { tick: world.tick + 1, buttons: Btn.Forward, view: yawToView(0) } }, ctx);
    const PT = SPLIT_DECK.pit;
    expect(p.pos.y - config.movement.standHeight / 2).toBeCloseTo(SPLIT_DECK.hold, 1); // feet
    expect(p.pos.x > PT.x0 && p.pos.x < PT.x1 && p.pos.z > PT.z0 && p.pos.z < PT.z1).toBe(true);
  });

  // Tower mode: each team's carrier takes each lane (the other lanes cut off in the bot graph)
  const lanes: [string, string[]][] = [
    ['mid (connector, atrium, mid corridor)', ['aNDoor', 'bNDoor']],
    ['A side (A deck, deck run, east lane)', ['cnDoor', 'bNDoor', 'gTop']],
    ['B side (hold, basement corridor, west lane)', ['cnDoor', 'aNDoor', 'stRamp']],
    ['B side (hold, stairs, mid corridor)', ['cnDoor', 'aNDoor', 'bc2']],
  ];
  it.each(lanes.flatMap(([n, b]) => ([0, 1] as const).map((team) => [n, b, team] as const)))(
    'a bot carries the Controller to the enemy Tower via the %s (team %i)',
    (_name, blocked, team) => {
      const config = defaultConfig();
      const lv = buildLevel(withBlocked(def(), [...blocked]));
      const ctx: SimContext = { level: lv, config, dt: TICK_DT };
      const world = createWorld(lv, 5);
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

  // Bomb mode (data only for now): bots can walk every attack route and both defender routes
  const bombRoutes: [string, 0 | 1, string, string[]][] = [
    ['Cyan to A (east ramp)', 0, 'aC', []],
    ['Cyan to B (west ramp)', 0, 'bC', []],
    ['Orange to A: east lane, deck run', 1, 'aC', ['gTop']],
    ['Orange to A: mid, atrium, gantry', 1, 'aC', ['dr1']],
    ['Orange to B: west lane, basement corridor', 1, 'bC', ['stGate', 'pitC']],
    ['Orange to B: mid, stairs', 1, 'bC', ['bc2', 'pitC']],
    ['Orange to B: drop through the atrium hole', 1, 'bC', ['stGate', 'bc2']],
  ];
  it.each(bombRoutes)('a bot walks %s', (_name, team, site, blocked) => {
    const config = defaultConfig();
    const d = withBlocked(def(), blocked);
    const lv = buildLevel(d);
    const ctx: SimContext = { level: lv, config, dt: TICK_DT };
    const world = createWorld(lv, 9);
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
