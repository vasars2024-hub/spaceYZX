import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  applyBotObjectives,
  BOT_SKILLS,
  botThink,
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
  MAPS,
  qRotate,
  quat,
  raycast,
  startMatch,
  step,
  TICK_DT,
  updateMatch,
  v3,
  waypointRoute,
  withSkyArena,
  type BotMemory,
  type BoxDef,
  type LevelDef,
  type PlayerInput,
  type SimContext,
  type SimEvent,
  type Vec3,
} from '../src/index';
import { buildLeviathan, LEVIATHAN, spineSurfaceY } from '../src/level/maps/leviathan';

// built as the match rooms build a competitive map (with the sky duel arena above it)
let cached: LevelDef | null = null;
const def = () => (cached ??= withSkyArena(buildLeviathan()));
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

/** world-space corners of a box, or the six corners of a prism (wedge ramp) */
const corners = (b: BoxDef): Vec3[] => {
  const q = b.q ?? quat();
  const { x: hx, y: hy, z: hz } = b.h;
  const local: Vec3[] = [];
  if (b.prism !== undefined) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) local.push(v3(sx * hx, -hy, sz * hz));
    for (const sx of [-1, 1]) local.push(v3(sx * hx, hy, b.prism * hz));
  } else
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) for (const sz of [-1, 1]) local.push(v3(sx * hx, sy * hy, sz * hz));
  return local.map((p) => {
    const r = qRotate(q, p);
    return v3(r.x + b.c.x, r.y + b.c.y, r.z + b.c.z);
  });
};
const CYAN = 0x19e3ff;
const ORANGE = 0xff8a1f;
/** the other team's colour / material (a mirrored box belongs to the other team) */
const swapTeam = (c: number | undefined) => (c === CYAN ? ORANGE : c === ORANGE ? CYAN : c);
const swapMat = (m: string | undefined) => (m === 'teamA' ? 'teamB' : m === 'teamB' ? 'teamA' : m);
const looks = (b: BoxDef, mirrored = false) =>
  [
    mirrored ? swapMat(b.mat) : b.mat,
    mirrored ? swapTeam(b.color) : b.color,
    mirrored ? swapTeam(b.trim) : b.trim,
    !!b.noCollide,
    b.prism !== undefined,
  ].join('|');
const sameShape = (a: Vec3[], b: Vec3[]) =>
  a.length === b.length &&
  a.every((p) => b.some((q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < 1e-4));

/** walks a bot toward a waypoint; true once it stands there */
const botWalk = (
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
    const feet = p.pos.y - config.movement.standHeight / 2;
    if (
      p.alive &&
      Math.hypot(p.pos.x - goal.x, p.pos.z - goal.z) < 2.5 &&
      Math.abs(feet - (goal.y - 1)) < 1
    )
      return true;
  }
  return false;
};

describe('Leviathan map', () => {
  it('is registered; outdoor under a nebula sky, about 120 × 134 m', () => {
    const m = MAPS.find((x) => x.id === 'leviathan');
    expect(m).toBeDefined();
    expect(m!.build).toBe(buildLeviathan);
    const d = def();
    expect(d.name).toBe('Leviathan');
    expect(d.boundsMax.x - d.boundsMin.x).toBe(120);
    expect(d.boundsMax.z - d.boundsMin.z).toBe(136);
    expect(d.outdoor?.stars).toBe(true);
    expect(d.fog?.color).toBe(d.outdoor?.horizon);
    // in line with the other maps (they use 550–800)
    expect(d.boxes.length).toBeGreaterThan(500);
    expect(d.boxes.length).toBeLessThan(800);
  });

  it('is an exact mirror image across x = 0 (every box, rotated ones included; teams swapped)', () => {
    const d = def();
    const boxes = d.boxes.map((b) => ({ b, c: corners(b), k: looks(b) }));
    for (const { b, c } of boxes) {
      const m = c.map((p) => v3(-p.x, p.y, p.z));
      const k = looks(b, true);
      expect(
        boxes.some((o) => o.k === k && sameShape(m, o.c)),
        `mirror of ${b.mat} at ${b.c.x}, ${b.c.y}, ${b.c.z}`,
      ).toBe(true);
    }
    for (const s of d.spawns)
      expect(
        d.spawns.some(
          (o) =>
            o.team !== s.team &&
            key(o.pos.x) === key(-s.pos.x) &&
            key(o.pos.z) === key(s.pos.z) &&
            o.yawDeg === -s.yawDeg,
        ),
      ).toBe(true);
    for (const t of d.towers)
      expect(d.towers.some((o) => o.team !== t.team && key(o.pos.x) === key(-t.pos.x))).toBe(true);
    for (const w of d.waypoints!) {
      const twin = d.waypoints!.find(
        (o) =>
          key(o.pos.x) === key(-w.pos.x) &&
          key(o.pos.y) === key(w.pos.y) &&
          key(o.pos.z) === key(w.pos.z),
      );
      expect(twin, `waypoint ${w.name}`).toBeDefined();
      // same links, mirrored
      const names = (i: number[]) =>
        i.map((j) => d.waypoints![j].name!.replace(/[EW]$/, '')).sort();
      expect(names(twin!.links)).toEqual(names(w.links));
    }
    for (const l of d.lights!)
      expect(
        d.lights!.some(
          (o) =>
            key(o.pos.x) === key(-l.pos.x) &&
            key(o.pos.y) === key(l.pos.y) &&
            key(o.pos.z) === key(l.pos.z) &&
            o.color === swapTeam(l.color),
        ),
      ).toBe(true);
    // the bomb sites and the power-up sit on the mirror line: both teams have the same way there
    for (const s of d.bombSites!) expect(s.min.x).toBe(-s.max.x);
    for (const p of d.powerups!) expect(p.x).toBe(0);
    expect(d.bombSites!.find((s) => s.name === 'A')!.max.z).toBeLessThan(-40); // the skull, north
    expect(d.bombSites!.find((s) => s.name === 'B')!.min.z).toBeGreaterThan(40); // the tail, south
  });

  it('has no visible clipping (no two pieces of a different look cut into each other)', () => {
    const d = def();
    expect(findOverlaps(d).map((o) => describeOverlap(d, o))).toEqual([]);
  });

  it('follows the plan: open floor where the plan has floor', () => {
    const lv = level();
    const S = LEVIATHAN.spine;
    const Y = LEVIATHAN.heart.balconyY;
    const places: [string, number, number, number][] = [
      ['camp front corridor', 49.5, 0, 0],
      ['camp porch', 50, 0, 13.5],
      ['flank lane', 31, 0, -9],
      ['flank lane, south', 34, 0, 33],
      ['rib gap', 23, 0, 8],
      ['east aisle', 12, 0, -24],
      ['under the balcony', 6.5, 0, -6.5],
      ['the power-up, under the heart', 0, 0, 0],
      ['heart balcony', 7.5, Y, 0],
      ['heart balcony, north side', 0, Y, -7.5],
      ['the spine', 1.4, S.y, -8],
      ['the spine, middle', 0, S.y, 4],
      ['the neck', 1.5, spineSurfaceY(-30), -30],
      ['the tail root', 1.5, spineSurfaceY(30), 30],
      ['the skull, site A', 0, 0, -56],
      ['jaw grounds', 25, 0, -54],
      ['tail, site B', 0, 0, 54],
      ['tail grounds', 17.5, 0, 55],
    ];
    for (const [name, x, y, z] of places)
      for (const xx of [x, -x]) {
        expect(raycast(lv, v3(xx, y + 1, z), v3(0, -1, 0), 2)?.point.y, name).toBeCloseTo(y, 3);
        expect(capsuleOverlaps(lv, standingCapsule(v3(xx, y, z))), name).toBe(false);
      }
    // the spine: 10 m up with nothing overhead
    expect(raycast(lv, v3(1.4, S.y + 1, -8), v3(0, 1, 0), 50)).toBeNull();
  });

  it('has 8 valid spawns per team in its camp, Towers in front, sites with floor, the power-up in the heart', () => {
    const d = def();
    const lv = level();
    const R = LEVIATHAN.camp.room;
    for (const team of [0, 1] as const) {
      const spawns = d.spawns.filter((s) => s.team === team);
      expect(spawns.length).toBe(8);
      for (const s of spawns) {
        expect(capsuleOverlaps(lv, standingCapsule(s.pos))).toBe(false);
        expect(
          raycast(lv, v3(s.pos.x, s.pos.y + 1, s.pos.z), v3(0, -1, 0), 2)?.point.y,
        ).toBeCloseTo(s.pos.y, 3);
        const x = team === 0 ? -s.pos.x : s.pos.x;
        expect(x > R.x0 && x < R.x1 && Math.abs(s.pos.z) < R.z).toBe(true);
        // facing the map
        expect(Math.sign(s.yawDeg)).toBe(team === 0 ? 1 : -1);
      }
      expect(new Set(spawns.map((s) => `${s.pos.x},${s.pos.z}`)).size).toBe(8);
      const t = d.towers.find((x) => x.team === team)!;
      expect(t.pos.x).toBe(team === 0 ? -41 : 41);
      const w = wpPos(d, team === 0 ? 'towerW' : 'towerE');
      expect(Math.hypot(w.x - t.pos.x, w.z - t.pos.z)).toBeLessThan(
        t.radius + defaultConfig().rules.towerTouchRadius + 0.5,
      );
      expect(d.controllerHomes![team].x).toBe(team === 0 ? -44.5 : 44.5);
    }
    for (const s of d.bombSites!) {
      const c = v3((s.min.x + s.max.x) / 2, s.min.y + 1, (s.min.z + s.max.z) / 2);
      expect(raycast(lv, c, v3(0, -1, 0), 2)?.point.y).toBeCloseTo(s.min.y, 3);
      expect(capsuleOverlaps(lv, standingCapsule(v3(c.x, s.min.y, c.z)))).toBe(false);
    }
    // the power-up floats under the heart (which glows, and doesn't collide)
    expect(d.powerups!.map((p) => [p.x, p.y, p.z])).toEqual([[0, 1, 0]]);
    const heart = d.boxes.filter((b) => b.mat === 'glow' && b.color === 0xd13a7a);
    expect(heart.length).toBeGreaterThanOrEqual(4);
    for (const b of heart) expect(b.noCollide).toBe(true);
    expect(lineOfSight(lv, v3(0, 1.6, -8), v3(0, 1.6, 8))).toBe(true);
  });

  it('waypoints sit in open space, links are clear, and every one is reachable from both camps', () => {
    const lv = level();
    const wps = lv.def.waypoints!;
    expect(new Set(wps.map((w) => w.name)).size).toBe(wps.length);
    for (const w of wps) {
      expect(
        capsuleOverlaps(lv, { center: w.pos, up: v3(0, 1, 0), halfSeg: 0, radius: 0.3 }),
        `waypoint ${w.name}`,
      ).toBe(false);
      // on a floor (about 1 m over it)
      expect(raycast(lv, w.pos, v3(0, -1, 0), 1.5)?.point.y, `waypoint ${w.name}`).toBeCloseTo(
        w.pos.y - 1,
        1,
      );
      for (const j of w.links)
        expect(lineOfSight(lv, w.pos, wps[j].pos), `link ${w.name} → ${wps[j].name}`).toBe(true);
    }
    for (const from of ['spawnE', 'spawnW'])
      for (let i = 0; i < wps.length; i++)
        expect(waypointRoute(wps, wpIndex(lv.def, from), i).length, wps[i].name).toBeGreaterThan(0);
    // the spine, the neck, the balcony and both sites are on the graph
    for (const n of [
      'spineB0E',
      'spine-4',
      'neck-26E',
      'neck26W',
      'balMidN',
      'balE',
      'heart',
      'siteA',
      'siteB',
    ])
      expect(wpIndex(lv.def, n)).toBeGreaterThanOrEqual(0);
  });

  it('the only ways between the halves: through the nave, the skull, the tail or over the spine', () => {
    const d = def();
    const E = wpIndex(d, 'spawnE');
    const W = wpIndex(d, 'spawnW');
    const route = (blocked: string[]) => {
      const dd = withBlocked(d, blocked);
      return waypointRoute(dd.waypoints!, E, W);
    };
    // the central line: everything that joins the east half to the west one
    const heart = ['heart', 'balMidN', 'balMidS', 'rampN', 'rampS'];
    const spine = ['spine-20', 'spine-12', 'spine-4', 'spine4', 'spine12', 'spine20'];
    const skull = ['apron', 'foramen', 'siteA'];
    const tail = ['siteB'];
    expect(route([...heart, ...spine, ...skull, ...tail])).toEqual([]);
    const names = (r: number[]) => r.map((i) => d.waypoints![i].name);
    expect(names(route([...spine, ...skull, ...tail]))).toEqual(
      expect.arrayContaining([expect.stringMatching(/^(heart|balMid|ramp)/)]),
    );
    expect(names(route([...heart, ...skull, ...tail]))).toEqual(
      expect.arrayContaining([expect.stringMatching(/^spine/)]),
    );
    expect(route([...heart, ...spine, ...tail]).length).toBeGreaterThan(0);
    expect(route([...heart, ...spine, ...skull]).length).toBeGreaterThan(0);
  });

  it('keeps every ramp at 30° or less; the only tilted boxes are bone and crystal', () => {
    const d = def();
    const ramps = d.boxes.filter((b) => b.prism !== undefined);
    // neck, tail root, and the balcony's four ramps
    expect(ramps.length).toBe(6);
    for (const b of ramps) {
      const deg = (Math.atan2(2 * b.h.y, 2 * b.h.z) * 180) / Math.PI;
      expect(deg).toBeLessThanOrEqual(30);
      expect(deg).toBeGreaterThan(20);
    }
    // ribs, vault arches, the tail's coil and the heart: rotated, never a slab to walk up
    for (const b of d.boxes.filter((x) => x.q && x.prism === undefined))
      expect(b.mat === 'rock' || b.mat === 'glow', `${b.mat} at ${b.c.x},${b.c.y},${b.c.z}`).toBe(
        true,
      );
  });

  it('cover is half (≤ 1.25 m) or full (≥ 2 m): no box a player stands behind is in between', () => {
    const d = def();
    for (const b of d.boxes) {
      if (b.noCollide || b.q || b.h.x < 0.3 || b.h.z < 0.3) continue;
      const bottom = b.c.y - b.h.y;
      const h = 2 * b.h.y;
      // things standing on the ground floor or the balcony
      if (Math.abs(bottom) > 0.01 && Math.abs(bottom - LEVIATHAN.heart.balconyY) > 0.01) continue;
      expect(h <= 1.25 || h >= 2, `${b.mat} at ${b.c.x},${b.c.y},${b.c.z}: ${h} m`).toBe(true);
    }
  });

  it('no spawn is in view from anywhere outside its own hut (every surface, standing or jumping)', () => {
    const lv = level();
    const targets = lv.def.spawns.flatMap((s) => [
      v3(s.pos.x, s.pos.y + 1.6, s.pos.z),
      v3(s.pos.x, s.pos.y + 0.9, s.pos.z),
    ]);
    const C = LEVIATHAN.camp;
    let samples = 0;
    for (let x = -59; x <= 59; x += 1.5)
      for (let z = -67; z <= 67; z += 1.5) {
        // every surface in this column, top down
        let y = 20;
        for (let guard = 0; guard < 6; guard++) {
          const hit = raycast(lv, v3(x, y, z), v3(0, -1, 0), y + 2);
          if (!hit || hit.point.y < -0.5) break;
          const f = hit.point.y;
          y = f - 0.3;
          const inHut = Math.abs(x) >= C.x0 - 0.1 && Math.abs(z) <= C.z + 0.1 && f < 3;
          if (inHut || capsuleOverlaps(lv, standingCapsule(v3(x, f, z)))) continue;
          samples++;
          for (const eye of [1.6, 3.0, 6.0])
            for (const t of targets)
              expect(
                lineOfSight(lv, v3(x, f + eye, z), t),
                `(${x}, ${f + eye}, ${z}) sees a spawn at ${t.x}, ${t.z}`,
              ).toBe(false);
        }
      }
    expect(samples).toBeGreaterThan(5000);
  });

  it('falling off the edge of the fossil kills; standing at its rim does not', () => {
    const { config, ctx, world } = sim();
    const faller = addPlayer(world, createPlayer(1, 0, v3(0, 0, 69), 0, config));
    const stay = addPlayer(world, createPlayer(2, 1, v3(20, 0, 64.5), 0, config));
    for (let t = 0; t < 120; t++) step(world, {}, ctx);
    expect(faller.alive).toBe(false);
    expect(stay.alive).toBe(true);
    expect(stay.grounded).toBe(true);
  });
});

describe('Leviathan bots', () => {
  it.each([
    ['the spine (up the neck or the tail root)', 'spine-4'],
    ['the heart balcony', 'balMidN'],
    ['the power-up under the heart', 'heart'],
    ['site A in the skull', 'siteA'],
    ['site B in the tail', 'siteB'],
    ['the jaw grounds', 'jawN'],
  ] as const)('a bot walks from each camp to %s', (_name, goal) => {
    const d = def();
    for (const team of [0, 1] as const) {
      const s = d.spawns.find((sp) => sp.team === team)!;
      expect(
        botWalk(
          d,
          s.pos,
          s.yawDeg,
          team,
          goal === 'jawN' && team === 0 ? 'jawNW' : goal === 'jawN' ? 'jawNE' : goal,
          40,
        ),
      ).toBe(true);
    }
  });

  it('a bot drops off the spine onto the balcony', () => {
    const d = def();
    const from = wpPos(d, 'spineB-8E');
    expect(botWalk(d, v3(from.x, from.y - 1, from.z), 90, 0, 'balNE', 15)).toBe(true);
  });

  it.each([
    ['whatever way is shortest', []],
    [
      'over the spine',
      ['heart', 'balMidN', 'balMidS', 'rampN', 'rampS', 'apron', 'foramen', 'siteA', 'siteB'],
    ],
    [
      'through the skull',
      ['heart', 'balMidN', 'balMidS', 'rampN', 'rampS', 'spine-20', 'spine20', 'siteB', 'apron'],
    ],
  ] as [string, string[]][])(
    'a bot carries the Controller to the enemy Tower (%s)',
    (_name, blocked) => {
      for (const team of [0, 1] as const) {
        const d = withBlocked(def(), blocked);
        const { lv, config, ctx, world } = sim(d);
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
      }
    },
    60000,
  );

  it('an Elimination match with bots (2v2) plays rounds to a result', () => {
    const d = def();
    const { config, ctx, world } = sim(d);
    const mems: BotMemory[] = [];
    let id = 1;
    for (const team of [0, 1] as const)
      for (let i = 0; i < 2; i++) {
        const s = d.spawns.filter((sp) => sp.team === team)[i];
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
    // every round has a winner (by wiping the other team out, or the overtime)
    for (const r of ms.rounds) expect(r.winner).not.toBeNull();
    expect(ms.rounds.some((r) => r.reason === 'elimination')).toBe(true);
  }, 120000);
});
