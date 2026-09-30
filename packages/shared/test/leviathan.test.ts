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
import { buildLeviathan, LEVIATHAN } from '../src/level/maps/leviathan';

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
const UP = LEVIATHAN.floors.upper;
const LOW = LEVIATHAN.floors.marrow;

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

/** a team's camp rectangle (vestibule + spawn room) that holds `p`, if any */
const campOf = (p: { x: number; z: number }) => {
  const C = LEVIATHAN.camp;
  const ax = Math.abs(p.x);
  const az = Math.abs(p.z);
  if (ax < C.x[0] - 0.1 || ax > C.x[1] + 0.1) return null;
  if (az <= C.mid.z + 0.1) return 'heart';
  if (az >= C.side.d[0] - 0.1 && az <= C.side.d[1] + 0.1) return p.z < 0 ? 'skull' : 'tail';
  return null;
};

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

// the waypoints on the mirror line (x = 0) by the part of the body they are in
const tagged = (names: string[]) => names.flatMap((n) => [`${n}N`, `${n}S`]);
const CROSSINGS = {
  heart: ['heart', 'heartN', 'heartS'],
  throat: tagged(['dThrH', 'thr1', 'thr2', 'thr3', 'thr4', 'dSkull']),
  spine: tagged(['bal', 'dSpH', 'sp1', 'sp2', 'dsp2', 'sp3', 'sp4', 'dSpSk', 'ledge']),
  marrow: tagged(['jun', 'foramen', 'pitBot']),
  skull: ['skSN', 'siteN', 'pitTopN'],
  tail: ['skSS', 'siteS', 'pitTopS'],
};

describe('Leviathan map', () => {
  it('is registered; outdoor under a nebula sky, about 94 × 136 m', () => {
    const m = MAPS.find((x) => x.id === 'leviathan');
    expect(m).toBeDefined();
    expect(m!.build).toBe(buildLeviathan);
    expect(m!.symmetric).toBe(true);
    const d = def();
    expect(d.name).toBe('Leviathan');
    expect(d.boundsMax.x - d.boundsMin.x).toBe(94);
    expect(d.boundsMax.z - d.boundsMin.z).toBe(136);
    expect(d.outdoor?.stars).toBe(true);
    expect(d.fog?.color).toBe(d.outdoor?.horizon);
    // in line with the other maps
    expect(d.boxes.length).toBeGreaterThan(400);
    expect(d.boxes.length).toBeLessThan(950);
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
            o.yawDeg === -s.yawDeg &&
            o.group === s.group,
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

  it('follows the plan: three floors, floor where the plan has floor, roofs over the rooms', () => {
    const lv = level();
    const places: [string, number, number, number, boolean][] = [
      // name, x, floor y, z, roofed (something solid within 12 m overhead)
      ['heart camp', 41, 0, 0, true],
      ['skull camp', 41, 0, -24, true],
      ['Tower room', 25, 0, 5, true],
      ['flank, first room', 30.5, 0, -14, true],
      ['flank, second room', 30.5, 0, -40, true],
      ['rib hall', 18, 0, 0, true],
      ['rib gallery 1', 16, 0, -13, true],
      ['rib gallery 2', 14, 0, -40, true],
      ['the throat', 0, 0, -20, true],
      ['the gullet', 0, 0, 34, true],
      ['the power-up, in the heart', 0, 0, 0, true],
      ['heart balcony', 0, UP, -6.75, true],
      ['heart balcony, east', 8.75, UP, 0, true],
      ['the spine', 0, UP, -22, true],
      ['the spine, south', 0, UP, 31, true],
      ['top of the stairs', 6, UP, -42.5, true],
      ['the brow ledge', 0, UP, -47.5, true],
      ['the skull, site A', 0, 0, -51.5, true],
      ['behind the foramen', 5, 0, -65, true],
      ['the tail, site B', 0, 0, 51.5, true],
      ['jaw grounds (open to the nebula)', 24, 0, -52, false],
      ['hip yard (open to the nebula)', 24, 0, 52, false],
      ['marrow chamber', 0, LOW, -37, true],
      ['marrow canal', 15, LOW, 38, true],
      ['marrow elbow', 27, LOW, -30, true],
      ['foramen tunnel', 0, LOW, -48, true],
    ];
    for (const [name, x, y, z, roofed] of places)
      for (const xx of x === 0 ? [0] : [x, -x]) {
        expect(raycast(lv, v3(xx, y + 1, z), v3(0, -1, 0), 2)?.point.y, name).toBeCloseTo(y, 3);
        expect(capsuleOverlaps(lv, standingCapsule(v3(xx, y, z))), name).toBe(false);
        expect(raycast(lv, v3(xx, y + 1, z), v3(0, 1, 0), 12) !== null, name).toBe(roofed);
      }
    // floors stack: the spine over the throat, the throat over the marrow chamber
    expect(raycast(lv, v3(0, UP + 1, -37), v3(0, -1, 0), 20)?.point.y).toBeCloseTo(UP, 3);
    expect(raycast(lv, v3(0, 1, -37), v3(0, -1, 0), 20)?.point.y).toBeCloseTo(0, 3);
  });

  it('has 8 valid spawns per team in three sheltered camps, Towers, sites with floor, the power-up in the heart', () => {
    const d = def();
    const lv = level();
    for (const team of [0, 1] as const) {
      const spawns = d.spawns.filter((s) => s.team === team);
      expect(spawns.length).toBe(8);
      const count = (g: string) => spawns.filter((s) => s.group === g).length;
      expect([count('skull'), count('heart'), count('tail')]).toEqual([3, 2, 3]);
      for (const s of spawns) {
        expect(capsuleOverlaps(lv, standingCapsule(s.pos))).toBe(false);
        expect(
          raycast(lv, v3(s.pos.x, s.pos.y + 1, s.pos.z), v3(0, -1, 0), 2)?.point.y,
        ).toBeCloseTo(s.pos.y, 3);
        // in its own camp's spawn room, on its team's side, facing the map
        expect(campOf(s.pos)).toBe(s.group);
        expect(Math.abs(s.pos.x)).toBeGreaterThan(LEVIATHAN.camp.partition + 1);
        expect(Math.sign(s.pos.x)).toBe(team === 0 ? -1 : 1);
        expect(Math.sign(s.yawDeg)).toBe(team === 0 ? 1 : -1);
      }
      expect(new Set(spawns.map((s) => `${s.pos.x},${s.pos.z}`)).size).toBe(8);
      const t = d.towers.find((x) => x.team === team)!;
      expect(t.pos.x).toBe(team === 0 ? -27 : 27);
      const w = wpPos(d, team === 0 ? 'towerW' : 'towerE');
      expect(Math.hypot(w.x - t.pos.x, w.z - t.pos.z)).toBeLessThan(
        t.radius + defaultConfig().rules.towerTouchRadius + 0.5,
      );
    }
    for (const s of d.bombSites!) {
      const c = v3((s.min.x + s.max.x) / 2, s.min.y + 1, (s.min.z + s.max.z) / 2);
      expect(raycast(lv, c, v3(0, -1, 0), 2)?.point.y).toBeCloseTo(s.min.y, 3);
      expect(capsuleOverlaps(lv, standingCapsule(v3(c.x, s.min.y, c.z)))).toBe(false);
      expect((s.max.x - s.min.x) * (s.max.z - s.min.z)).toBeGreaterThan(120);
    }
    // the power-up floats under the heart (which glows, and doesn't collide)
    expect(d.powerups!.map((p) => [p.x, p.y, p.z])).toEqual([[0, 1, 0]]);
    const heart = d.boxes.filter((b) => b.mat === 'glow' && b.color === 0xd13a7a);
    expect(heart.length).toBeGreaterThanOrEqual(4);
    for (const b of heart) expect(b.noCollide).toBe(true);
  });

  it('waypoints sit in open space, links are clear, and every one is reachable from every spawn', () => {
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
    // from every spawn (every group of both teams) to every waypoint
    for (const s of lv.def.spawns) {
      let from = -1;
      let best = Infinity;
      wps.forEach((w, i) => {
        const dd = Math.hypot(w.pos.x - s.pos.x, w.pos.y - 1 - s.pos.y, w.pos.z - s.pos.z);
        if (dd < best && lineOfSight(lv, v3(s.pos.x, s.pos.y + 1, s.pos.z), w.pos)) {
          best = dd;
          from = i;
        }
      });
      expect(best).toBeLessThan(6);
      for (let i = 0; i < wps.length; i++)
        expect(waypointRoute(wps, from, i).length, wps[i].name).toBeGreaterThan(0);
    }
  });

  it('the halves meet only in the middle line: heart, throat / gullet, spine, marrow, skull, tail — each one on its own', () => {
    const d = def();
    const E = wpIndex(d, 'campME');
    const W = wpIndex(d, 'campMW');
    const route = (blocked: string[]) => waypointRoute(withBlocked(d, blocked).waypoints!, E, W);
    const all = Object.values(CROSSINGS).flat();
    expect(route(all)).toEqual([]);
    for (const [name, nodes] of Object.entries(CROSSINGS)) {
      const keep = new Set(nodes);
      const r = route(all.filter((n) => !keep.has(n)));
      expect(r.length, `only through the ${name}`).toBeGreaterThan(0);
    }
  });

  it('keeps every ramp at 30° or less; the only tilted boxes are bone and crystal', () => {
    const d = def();
    const ramps = d.boxes.filter((b) => b.prism !== undefined);
    // spine stairs (4), flank pits (4), foramen pits (2)
    expect(ramps.length).toBe(10);
    for (const b of ramps) {
      const deg = (Math.atan2(2 * b.h.y, 2 * b.h.z) * 180) / Math.PI;
      expect(deg).toBeLessThanOrEqual(30);
      expect(deg).toBeGreaterThan(20);
    }
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
      // things standing on a floor: the marrow, the ground, the balcony / ledges / spine
      if (![LOW, 0, UP].some((y) => Math.abs(bottom - y) < 0.01)) continue;
      expect(h <= 1.25 || h >= 2, `${b.mat} at ${b.c.x},${b.c.y},${b.c.z}: ${h} m`).toBe(true);
    }
  });

  it('no spawn is in view from anywhere outside its own camp (every surface, standing or jumping)', () => {
    const lv = level();
    const targets = lv.def.spawns.flatMap((s) => [
      v3(s.pos.x, s.pos.y + 1.6, s.pos.z),
      v3(s.pos.x, s.pos.y + 0.9, s.pos.z),
    ]);
    let samples = 0;
    for (let x = -46; x <= 46; x += 1.5)
      for (let z = -67; z <= 67; z += 1.5) {
        // every surface in this column, top down
        let y = 12.5;
        for (let guard = 0; guard < 8; guard++) {
          const hit = raycast(lv, v3(x, y, z), v3(0, -1, 0), y + 8);
          if (!hit || hit.point.y < LOW - 0.5) break;
          const f = hit.point.y;
          y = f - 0.3;
          if ((campOf({ x, z }) && f < 3) || capsuleOverlaps(lv, standingCapsule(v3(x, f, z))))
            continue;
          samples++;
          for (const eye of [1.6, 3.0])
            for (const t of targets)
              expect(
                lineOfSight(lv, v3(x, f + eye, z), t),
                `(${x}, ${f + eye}, ${z}) sees a spawn at ${t.x}, ${t.z}`,
              ).toBe(false);
        }
      }
    expect(samples).toBeGreaterThan(3000);
  });

  it('every camp has two ways out (its vestibule has two doors)', () => {
    const lv = level();
    const C = LEVIATHAN.camp;
    const doorsOf = (zs: number[]) =>
      zs.filter((z) => lineOfSight(lv, v3(C.x[0] + 1, 1.5, z), v3(C.x[0] - 2, 1.5, z))).length;
    expect(doorsOf([-4.5, 4.5])).toBe(2);
    expect(doorsOf([-20.5, -29.5])).toBe(2);
    expect(doorsOf([20.5, 29.5])).toBe(2);
    expect(doorsOf([0, -24, 24, -12])).toBe(0);
  });
});

describe('Leviathan bots', () => {
  const firstOf = (team: 0 | 1, group: string) =>
    def().spawns.find((sp) => sp.team === team && sp.group === group)!;

  it.each([
    ['site A in the skull', 'siteN'],
    ['site B in the tail', 'siteS'],
  ] as const)('a bot walks from every camp to %s', (_name, goal) => {
    const d = def();
    for (const team of [0, 1] as const)
      for (const group of ['skull', 'heart', 'tail']) {
        const s = firstOf(team, group);
        expect(botWalk(d, s.pos, s.yawDeg, team, goal, 40), `${team} ${group}`).toBe(true);
      }
  });

  it.each([
    ['the power-up in the heart', 'heart'],
    ['the heart balcony (up the spine stairs)', 'balN'],
    ['the spine', 'sp2S'],
    ['the brow ledge', 'ledgeN'],
    ['the marrow chamber', 'junN'],
    ['the foramen', 'foramenS'],
  ] as const)('a bot walks from its heart camp to %s', (_name, goal) => {
    const d = def();
    for (const team of [0, 1] as const) {
      const s = firstOf(team, 'heart');
      expect(botWalk(d, s.pos, s.yawDeg, team, goal, 40)).toBe(true);
    }
  });

  it('a bot drops off the brow ledge onto the site', () => {
    const d = def();
    const from = wpPos(d, 'ledgeCNE');
    expect(botWalk(d, v3(from.x, from.y - 1, from.z), 180, 0, 'siteEN', 15)).toBe(true);
  });

  it.each([
    ['whatever way is shortest', []],
    ['through the marrow', Object.values(CROSSINGS).flat().filter((n) => !CROSSINGS.marrow.includes(n))],
    ['over the spine', Object.values(CROSSINGS).flat().filter((n) => !CROSSINGS.spine.includes(n))],
    ['through the tail', Object.values(CROSSINGS).flat().filter((n) => !CROSSINGS.tail.includes(n))],
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
