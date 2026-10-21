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
  MAPS,
  moverTimeline,
  penetration,
  qRotate,
  queryBoxes,
  raycast,
  setLevelTick,
  startMatch,
  step,
  TICK_DT,
  timelineAt,
  updateMatch,
  v3,
  waypointRoute,
  withSkyArena,
  yawToView,
  type BotMemory,
  type BoxDef,
  type Level,
  type LevelDef,
  type PlayerInput,
  type SimContext,
  type Vec3,
} from '../src/index';
import { buildOrrery, ORRERY } from '../src/level/maps/orrery';

let cached: LevelDef | null = null;
/** the map as a competitive map is played (with its sky duel arena) */
const def = (): LevelDef => (cached ??= withSkyArena(buildOrrery()));
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
const HALF = 0.9; // standing body centre above the feet
/** an eye on the upper floor */
const U1 = ORRERY.upper + 1.6;

/** the map without its planets: what the static routes stand on */
const staticDef = (): LevelDef => {
  const d = def();
  const moving = new Set(d.movers!.flatMap((m) => m.boxes));
  return { ...d, boxes: d.boxes.filter((_, i) => !moving.has(i)), movers: [] };
};

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

/** the planets' timelines: [mercury E, mercury W, venus E, venus W, saturn E, saturn W] */
const PLANETS = ['mercury', 'venus', 'saturn'] as const;

describe('The Orrery map', () => {
  it('is registered as a symmetric competitive map and sized like a team map', () => {
    const m = MAPS.find((x) => x.id === 'orrery');
    expect(m?.name).toBe('The Orrery');
    expect(m?.competitive).toBe(true);
    expect(m?.symmetric).toBe(true);
    const d = def();
    expect(d.name).toBe('The Orrery');
    expect(d.boundsMax.x - d.boundsMin.x).toBe(116);
    expect(d.sky).toBeDefined();
    expect(d.ambient!).toBeLessThan(0.8);
    expect(d.movers).toHaveLength(6);
    // in line with the other maps (the client's budget)
    expect(d.boxes.length).toBeGreaterThan(550);
    expect(d.boxes.length).toBeLessThan(950);
    // interiors are lit
    expect(d.lights!.length).toBeGreaterThan(60);
  });

  it('has no visible clipping (the combat maps’ overlap check)', () => {
    const d = def();
    expect(findOverlaps(d).map((o) => describeOverlap(d, o))).toEqual([]);
  });

  it('is mirror-symmetric across x = 0 (boxes, spawns, Towers, waypoints, sites)', () => {
    const d = def();
    const boxes = new Set(
      d.boxes.map((b) => [b.c.x, b.c.y, b.c.z, b.h.x, b.h.y, b.h.z].map(key).join(',')),
    );
    for (const b of d.boxes) {
      if (b.q) continue;
      const m = [-b.c.x, b.c.y, b.c.z, b.h.x, b.h.y, b.h.z].map(key).join(',');
      expect(boxes.has(m), `mirror of box at ${b.c.x},${b.c.y},${b.c.z}`).toBe(true);
    }
    // turned boxes: each has a twin of the mirrored shape (its axes mirrored, up to sign; a
    // prism's ridge mirrored too)
    const shapeKey = (b: BoxDef, mirror: boolean) => {
      const f = (p: Vec3) => (mirror ? v3(-p.x, p.y, p.z) : p);
      const axes = [v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)].map((a) => f(qRotate(b.q!, a)));
      const canon = (a: Vec3) => {
        const s =
          Math.abs(a.x) > 1e-6
            ? Math.sign(a.x)
            : Math.abs(a.y) > 1e-6
              ? Math.sign(a.y)
              : Math.sign(a.z);
        return [a.x * s, a.y * s, a.z * s];
      };
      const parts = [...[f(b.c)].flatMap((c) => [c.x, c.y, c.z]), b.h.x, b.h.y, b.h.z];
      parts.push(...axes.flatMap(canon));
      if (b.prism !== undefined) {
        const up = qRotate(b.q!, v3(0, 1, 0));
        const along = qRotate(b.q!, v3(0, 0, 1));
        const ridge = v3(
          b.c.x + up.x * b.h.y + along.x * b.prism * b.h.z,
          b.c.y + up.y * b.h.y + along.y * b.prism * b.h.z,
          b.c.z + up.z * b.h.y + along.z * b.prism * b.h.z,
        );
        const r = f(ridge);
        parts.push(r.x, r.y, r.z);
      }
      return parts
        .map((n) => key(n + 0))
        .join(',')
        .replace(/-0\.000/g, '0.000');
    };
    const turned = new Set(d.boxes.filter((b) => b.q).map((b) => shapeKey(b, false)));
    for (const b of d.boxes.filter((x) => x.q))
      expect(turned.has(shapeKey(b, true)), `mirror of turned box at ${JSON.stringify(b.c)}`).toBe(
        true,
      );
    for (const s of d.spawns)
      expect(
        d.spawns.some(
          (o) =>
            o.team !== s.team &&
            o.group === s.group &&
            key(o.pos.x) === key(-s.pos.x) &&
            key(o.pos.z) === key(s.pos.z) &&
            key(o.yawDeg) === key(-s.yawDeg),
        ),
      ).toBe(true);
    for (const t of d.towers)
      expect(d.towers.some((o) => o.team !== t.team && key(o.pos.x) === key(-t.pos.x))).toBe(true);
    for (const w of d.waypoints!)
      expect(
        d.waypoints!.some((o) => key(o.pos.x) === key(-w.pos.x) && key(o.pos.z) === key(w.pos.z)),
      ).toBe(true);
    // both sites and the power-ups sit on the mirror line
    for (const s of d.bombSites!) expect(s.min.x).toBe(-s.max.x);
    for (const p of d.powerups!) expect(p.x).toBe(0);
    for (const l of d.lights!)
      expect(
        d.lights!.some(
          (o) =>
            key(o.pos.x) === key(-l.pos.x) &&
            key(o.pos.z) === key(l.pos.z) &&
            o.radius === l.radius,
        ),
      ).toBe(true);
  });

  it('the planets move as mirrored pairs: same path, speed, wait and phase', () => {
    const d = def();
    const movers = d.movers!;
    const setOf = (i: number) =>
      new Set(
        movers[i].boxes.map((bi) => {
          const b = d.boxes[bi];
          return [b.c.x, b.c.y, b.c.z].map(key).join(',');
        }),
      );
    for (let p = 0; p < 3; p++) {
      const [e, w] = [movers[2 * p], movers[2 * p + 1]];
      expect(e.boxes.length).toBe(w.boxes.length);
      // the west planet is the east one's mirror image, box for box
      const west = setOf(2 * p + 1);
      for (const bi of e.boxes) {
        const b = d.boxes[bi];
        expect(west.has([-b.c.x, b.c.y, b.c.z].map(key).join(','))).toBe(true);
        expect(d.boxes[bi].c.x).toBeGreaterThan(0);
      }
      expect(w.speed).toBe(e.speed);
      expect(w.delay).toBe(e.delay);
      expect(w.path.length).toBe(e.path.length);
      // same timeline, tick for tick (paths run along z only: x → -x changes nothing)
      const te = moverTimeline(e.path, e.speed, e.delay);
      const tw = moverTimeline(w.path, w.speed, w.delay);
      expect(tw.period).toBe(te.period);
      for (let t = 0; t < te.period; t += 7) {
        const a = timelineAt(te, t);
        const b = timelineAt(tw, t);
        expect([key(-a.x), key(a.y), key(a.z)]).toEqual([key(b.x), key(b.y), key(b.z)]);
      }
    }
    // Mercury and Venus share a schedule, half a loop apart: while Mercury waits at the Sun,
    // Venus waits at the south dock, and back
    const PL = ORRERY.planets;
    const tm = moverTimeline(movers[0].path, movers[0].speed, movers[0].delay);
    const tv = moverTimeline(movers[2].path, movers[2].speed, movers[2].delay);
    expect(tv.period).toBe(tm.period);
    for (let t = 0; t < tm.period; t += 5) {
      const m = Math.abs(PL.mercury.at.z + timelineAt(tm, t).z);
      const v = Math.abs(PL.venus.at.z + timelineAt(tv, t).z);
      expect(m + v).toBeCloseTo(Math.abs(PL.mercury.at.z) + Math.abs(PL.venus.at.z), 6);
    }
  });

  it('follows the plan: floor where the plan has rooms, on every floor', () => {
    const lv = level();
    const U = ORRERY.upper;
    const B = ORRERY.crypt;
    const places: [string, number, number, number][] = [
      ['the Sun’s ledge', 5.25, U, 0],
      ['orbit hall, east side', 15, 0, 11.5],
      ['orbit hall, by the end door', 6, 0, 17],
      ['A site', 0, 0, -39.5],
      ['B site', 0, 0, 39.5],
      ['mid corridor', 0, 0, 26.5],
      ['star-chart library', 25.5, 0, 38],
      ['map room', 46.5, 0, 33.5],
      ['clock room', 22.5, 0, 11.5],
      ['Tower room', 33, 0, 4.5],
      ['lens workshop', 37.5, 0, 13],
      ['vestibule', 46.5, 0, 20],
      ['spawn room', 53, 0, 24],
      ['upper gallery', 17, U, 24.5],
      ['heaven over the site', 10.5, U, 32.5],
      ['gear crypt', 0, B, 6],
      ['crawl tunnel', 14, B, 0],
    ];
    for (const [name, x, y, z] of places)
      for (const xx of [x, -x])
        for (const zz of [z, -z]) {
          const at = `${name} (${xx}, ${zz})`;
          expect(raycast(lv, v3(xx, y + 1, zz), v3(0, -1, 0), 2)?.point.y, at).toBeCloseTo(y, 3);
          expect(capsuleOverlaps(lv, standingCapsule(v3(xx, y, zz))), at).toBe(false);
        }
  });

  it('is built of rooms: the Sun blocks the hall, walls part the hall from the wings and sites', () => {
    const lv = level();
    const HX = ORRERY.hall.x;
    const HZ = ORRERY.hall.z;
    const blocked: [string, Vec3, Vec3][] = [
      ['across the hall, north ↔ south', v3(0, 1.6, -HZ + 2), v3(0, 1.6, HZ - 2)],
      ['across the hall, west ↔ east', v3(-HX + 2, 1.6, 0), v3(HX - 2, 1.6, 0)],
      ['across the hall, corner ↔ corner', v3(-8, 1.6, -9), v3(8, 1.6, 9)],
      ['across the hall on the Sun', v3(0, U1, -6), v3(0, U1, 6)],
      ['A site ↔ B site', v3(6, 1.6, -40), v3(6, 1.6, 40)],
      ['the hall ↔ the Tower room', v3(15, 1.6, 0), v3(34, 1.6, 4)],
      ['the hall ↔ the library', v3(15, 1.6, 15), v3(25, 1.6, 38)],
      ['A site ↔ the hall', v3(6, 1.6, -38), v3(6, 1.6, -15)],
      ['the crypt ↔ the hall', v3(4.5, ORRERY.crypt + 1.6, 4.5), v3(12, 1.6, 12)],
      ['the upper gallery ↔ the Sun', v3(24, U1, 26.5), v3(5, U1, 5)],
    ];
    for (const [name, a, b] of blocked) expect(lineOfSight(lv, a, b), name).toBe(false);
  });

  it('has 8 valid spawns per team in two sheltered groups, Towers in their rooms, sites with floor', () => {
    const d = def();
    const lv = level();
    const SR = ORRERY.spawnRoom;
    for (const team of [0, 1] as const) {
      const spawns = d.spawns.filter((s) => s.team === team);
      expect(spawns.length).toBe(8);
      // detached: a north group (nearer A) and a south group (nearer B), four each
      const groups = [...new Set(spawns.map((s) => s.group))].sort();
      expect(groups).toEqual(['north', 'south']);
      for (const g of groups) expect(spawns.filter((s) => s.group === g)).toHaveLength(4);
      for (const s of spawns) {
        expect(capsuleOverlaps(lv, standingCapsule(s.pos))).toBe(false);
        expect(
          raycast(lv, v3(s.pos.x, s.pos.y + 1, s.pos.z), v3(0, -1, 0), 2)?.point.y,
        ).toBeCloseTo(s.pos.y, 3);
        const x = team === 0 ? -s.pos.x : s.pos.x;
        const z = Math.abs(s.pos.z);
        expect(x > SR.x0 && x < SR.x1 && z > SR.z0 && z < SR.z1).toBe(true);
        expect(Math.sign(s.pos.z)).toBe(s.group === 'north' ? -1 : 1);
      }
      const t = d.towers.find((x) => x.team === team)!;
      expect(Math.sign(t.pos.x)).toBe(team === 0 ? -1 : 1);
      const w = wpPos(d, team === 0 ? 'towerW' : 'towerE');
      expect(Math.hypot(w.x - t.pos.x, w.z - t.pos.z)).toBeLessThan(
        t.radius + defaultConfig().rules.towerTouchRadius + 0.5,
      );
      expect(d.controllerHomes![team].x * (team === 0 ? -1 : 1)).toBeGreaterThan(0);
    }
    const names = d.bombSites!.map((s) => s.name).sort();
    expect(names).toEqual(['A', 'B']);
    for (const s of d.bombSites!) {
      const c = v3((s.min.x + s.max.x) / 2, s.min.y + 1, (s.min.z + s.max.z) / 2);
      expect(raycast(lv, c, v3(0, -1, 0), 2)?.point.y).toBeCloseTo(s.min.y, 3);
      expect(capsuleOverlaps(lv, standingCapsule(v3(c.x, s.min.y, c.z)))).toBe(false);
      expect((s.max.x - s.min.x) * (s.max.z - s.min.z)).toBeGreaterThan(80);
    }
    // A in the north gallery, B in the south one, both beyond the orbit hall
    const A = d.bombSites!.find((s) => s.name === 'A')!;
    const B = d.bombSites!.find((s) => s.name === 'B')!;
    expect(A.max.z).toBeLessThan(-ORRERY.hall.z);
    expect(B.min.z).toBeGreaterThan(ORRERY.hall.z);
    // the power-ups sit on the Sun's ledge
    expect(d.powerups!).toHaveLength(2);
    for (const p of d.powerups!)
      expect(raycast(lv, p, v3(0, -1, 0), 2)?.point.y).toBeCloseTo(ORRERY.sun, 3);
  });

  it('waypoints sit in open space, stand on static floor only, and every one is reachable', () => {
    const lv = level();
    const still = buildLevel(staticDef());
    const wps = lv.def.waypoints!;
    for (const w of wps) {
      expect(
        capsuleOverlaps(lv, { center: w.pos, up: v3(0, 1, 0), halfSeg: 0, radius: 0.3 }),
        `waypoint ${w.name}`,
      ).toBe(false);
      // floor under it without any planet (the static routes)
      expect(raycast(still, w.pos, v3(0, -1, 0), 1.5), `floor under ${w.name}`).not.toBeNull();
      for (const j of w.links) {
        expect(lineOfSight(lv, w.pos, wps[j].pos), `link ${w.name} → ${wps[j].name}`).toBe(true);
        // static floor all along the link (no gaps a planet would have to bridge)
        const n = Math.ceil(Math.hypot(wps[j].pos.x - w.pos.x, wps[j].pos.z - w.pos.z));
        for (let k = 1; k < n; k++) {
          const t = k / n;
          const p = v3(
            w.pos.x + (wps[j].pos.x - w.pos.x) * t,
            w.pos.y + (wps[j].pos.y - w.pos.y) * t,
            w.pos.z + (wps[j].pos.z - w.pos.z) * t,
          );
          expect(
            raycast(still, p, v3(0, -1, 0), 2.5),
            `link ${w.name} → ${wps[j].name}`,
          ).not.toBeNull();
        }
      }
    }
    // from every spawn group of both teams
    for (const from of ['spawnSE', 'spawnNE', 'spawnSW', 'spawnNW'])
      for (let i = 0; i < wps.length; i++)
        expect(waypointRoute(wps, wpIndex(lv.def, from), i).length, wps[i].name).toBeGreaterThan(0);
  });

  it('each spawn area has 3 exits and each site 3 ground entrances (waypoint graph cuts)', () => {
    const d = def();
    const wps = d.waypoints!;
    const reach = (from: string, cut: string[]) => {
      const blocked = new Set(cut.map((n) => wpIndex(d, n)));
      const seen = new Set([wpIndex(d, from)]);
      const todo = [...seen];
      while (todo.length) {
        const i = todo.pop()!;
        for (const j of wps[i].links)
          if (!seen.has(j) && !blocked.has(j)) {
            seen.add(j);
            todo.push(j);
          }
      }
      return seen;
    };
    // the south-east spawn: out of the vestibule by the lens door, the gallery ramp or the map room door
    const exits = ['lensESE', 'rampLowSE', 'mapNSE'];
    expect(reach('spawnSE', exits).has(wpIndex(d, 'towerE'))).toBe(false);
    for (const keep of exits)
      expect(
        reach(
          'spawnSE',
          exits.filter((e) => e !== keep),
        ).has(wpIndex(d, 'hallDoorS')),
        keep,
      ).toBe(true);
    // B: the mid corridor and the two libraries' side doors
    const entries = ['bcorrS', 'siteESE', 'siteESW'];
    expect(reach('siteS', entries).has(wpIndex(d, 'hallDoorS'))).toBe(false);
    for (const keep of entries)
      expect(
        reach(
          'siteS',
          entries.filter((e) => e !== keep),
        ).has(wpIndex(d, 'spawnSE')),
        keep,
      ).toBe(true);
  });

  it('keeps every ramp at 30° or less', () => {
    const d = def();
    const prisms = d.boxes.filter((b) => b.prism !== undefined);
    // the Sun (2), the crypt stairs (2), the Tower tubes (2), the gallery ramps (4)
    expect(prisms.length).toBe(10);
    for (const b of prisms) {
      const deg = (Math.atan2(2 * b.h.y, 2 * b.h.z) * 180) / Math.PI;
      expect(deg).toBeLessThanOrEqual(30);
      expect(deg).toBeGreaterThan(20);
    }
  });

  it('no spawn is in view from anywhere outside the spawn areas', () => {
    const lv = level();
    const eyes: Vec3[] = [];
    // every 2.5 m over the building, on every floor, at standing / jumping heights (points
    // inside walls and inside the spawn areas themselves skipped)
    for (let x = -57.5; x <= 57.5; x += 2.5)
      for (let z = -45; z <= 45; z += 2.5) {
        if (Math.abs(x) > 44 && Math.abs(z) > 10 && Math.abs(z) < 31) continue;
        for (const y of [ORRERY.crypt + 1.6, 1.6, 3, 4.6, 8.6, 10, 13, 16]) {
          const p = v3(x, y, z);
          if (capsuleOverlaps(lv, { center: p, up: v3(0, 1, 0), halfSeg: 0, radius: 0.2 }))
            continue;
          eyes.push(p);
        }
      }
    expect(eyes.length).toBeGreaterThan(5000);
    for (const s of lv.def.spawns) {
      const targets = [v3(s.pos.x, 1.0, s.pos.z), v3(s.pos.x, 1.7, s.pos.z)];
      for (const e of eyes)
        for (const t of targets)
          expect(lineOfSight(lv, e, t), `${JSON.stringify(e)} sees ${JSON.stringify(t)}`).toBe(
            false,
          );
    }
  });
});

describe('The Orrery: the planets', () => {
  const PL = ORRERY.planets;
  /** stand a player at `feet` and step the world (no input) */
  const run = (feet: Vec3, ticks: number, input?: (t: number) => number) => {
    const { config, ctx, world } = sim();
    const p = addPlayer(world, createPlayer(1, 0, feet, 0, config));
    const track: Vec3[] = [];
    for (let t = 0; t < ticks; t++) {
      const buttons = input ? input(t) : 0;
      step(world, { 1: { tick: world.tick + 1, buttons, view: yawToView(0) } }, ctx);
      track.push({ ...p.pos });
    }
    return { p, track, world, ctx };
  };
  const period = (m: { at: Vec3; to: Vec3; speed: number; wait: number }) =>
    moverTimeline([v3(), v3(m.to.x - m.at.x, m.to.y - m.at.y, m.to.z - m.at.z)], m.speed, m.wait);

  it.each([
    ['Mercury: north dock → the Sun', PL.mercury, 1],
    ['Mercury (west twin)', PL.mercury, -1],
    ['Venus: the Sun → south dock', PL.venus, 1],
    ['Saturn: north dock → south dock', PL.saturn, 1],
    ['Saturn (west twin)', PL.saturn, -1],
  ] as const)('%s: a player standing on it is carried to the other end', (_n, pl, sx) => {
    const tl = period(pl);
    const cap = 0.12;
    const start = v3(sx * pl.at.x, pl.at.y + cap, pl.at.z);
    const { p } = run(start, tl.wait + tl.travel[0] + 20);
    expect(p.alive).toBe(true);
    expect(p.grounded).toBe(true);
    expect(p.pos.x).toBeCloseTo(sx * pl.to.x, 1);
    expect(p.pos.y - HALF).toBeCloseTo(pl.to.y + cap, 1);
    expect(p.pos.z).toBeCloseTo(pl.to.z, 1);
  });

  it('a rider steps off Mercury onto the Sun, and off Venus into the south gallery', () => {
    const tl = period(PL.mercury);
    const arrive = tl.wait + tl.travel[0] + 5;
    // (the run helper looks north, yaw 0: walking backwards goes south, +z)
    const m = run(v3(PL.mercury.at.x, PL.mercury.at.y + 0.12, PL.mercury.at.z), arrive + 60, (t) =>
      t > arrive ? Btn.Back : 0,
    );
    expect(m.p.alive).toBe(true);
    expect(m.p.pos.z).toBeGreaterThan(-ORRERY.pedestal + 0.5);
    expect(m.p.pos.y - HALF).toBeCloseTo(ORRERY.sun, 1);
    const v = run(v3(PL.venus.at.x, PL.venus.at.y + 0.12, PL.venus.at.z), arrive + 60, (t) =>
      t > arrive ? Btn.Back : 0,
    );
    expect(v.p.alive).toBe(true);
    expect(v.p.pos.z).toBeGreaterThan(ORRERY.hall.z + 1);
    expect(v.p.pos.y - HALF).toBeCloseTo(ORRERY.upper, 1);
  });

  it('nobody is crushed: players under the planets, at the docks and jumping under them live', () => {
    const U = ORRERY.upper;
    const HZ = ORRERY.hall.z;
    const spots: [string, Vec3][] = [
      ['hall floor under Mercury at the dock', v3(3.6, 0, -18.6)],
      ['hall floor under Venus at the Sun', v3(3.6, 0, 10.35)],
      ['hall floor under Saturn', v3(14, 0, 0)],
      ['on the gear tooth under Saturn', v3(16, 2.5, 0)],
      ['on a hub under Saturn', v3(16.5, 1.1, 5.5)],
      ['gallery edge at Mercury’s dock', v3(3.6, U, -HZ - 1.35)],
      ['gallery edge at Saturn’s dock', v3(16, U, HZ + 1.35)],
      ['Sun edge at Mercury’s dock', v3(4.5, U, -ORRERY.pedestal + 0.35)],
      ['Sun edge at Venus’ dock', v3(-4.5, U, ORRERY.pedestal - 0.35)],
    ];
    const longest = Math.max(...PLANETS.map((n) => period(PL[n]).period));
    for (const [name, feet] of spots) {
      // stand still for a whole loop, then jump non-stop for another
      const { p } = run(feet, 2 * longest, (t) => (t > longest && t % 40 === 0 ? Btn.Jump : 0));
      expect(p.alive, name).toBe(true);
    }
  });

  it('their paths are clear: no static box in the way, room to stand above, none under in reach', () => {
    const d = def();
    const lv = buildLevel(d);
    const staticIds = (min: Vec3, max: Vec3) =>
      queryBoxes(lv, min, max).filter((i) => lv.boxes[i].mover < 0 && lv.boxes[i].collide);
    const longest = Math.max(...PLANETS.map((n) => period(PL[n]).period));
    for (let t = 0; t <= longest; t += 6) {
      setLevelTick(lv, t);
      for (const [mi, m] of lv.movers.entries()) {
        const ids = m.boxes.filter((i) => lv.boxes[i].collide);
        for (const i of ids) {
          const b = lv.boxes[i];
          for (const j of staticIds(b.min, b.max))
            expect(
              penetration(b, lv.boxes[j]),
              `planet ${mi} at tick ${t} hits box ${j}`,
            ).toBeLessThan(0.01);
        }
        // the walking surface: its top and middle (c of the rim bars)
        // (the first box is the rim's unturned bar: its length is the planet's radius)
        const rim = lv.boxes[ids[0]];
        const top = rim.max.y;
        const c = rim.c;
        const r = rim.h.x;
        for (const [dx, dz] of [
          [0, 0],
          [r * 0.6, 0],
          [-r * 0.6, 0],
          [0, r * 0.6],
          [0, -r * 0.6],
        ]) {
          // nothing static over a rider's head (2.4 m: a standing player and a hop)
          const up = raycast(lv, v3(c.x + dx, top + 0.3, c.z + dz), v3(0, 1, 0), 2.4);
          expect(up && lv.boxes[up.box].mover < 0, `over planet ${mi} at tick ${t}`).toBeFalsy();
          // nothing to stand on under it within a standing player's reach (+ 0.5 m)
          const bottom = top - 2;
          const down = raycast(lv, v3(c.x + dx, bottom - 0.01, c.z + dz), v3(0, -1, 0), 2.3);
          expect(
            down && lv.boxes[down.box].mover < 0,
            `under planet ${mi} at tick ${t}`,
          ).toBeFalsy();
        }
      }
    }
  });
});

describe('The Orrery bots', () => {
  const walkTo = (d: LevelDef, team: 0 | 1, goal: Vec3, seconds: number, seed = 9) => {
    const { config, ctx, world } = sim(d);
    const s = d.spawns.find((sp) => sp.team === team)!;
    const p = addPlayer(world, createPlayer(1, team, s.pos, s.yawDeg, config));
    const mem = createBotMemory(1, BOT_SKILLS.normal, seed);
    mem.objective = v3(goal.x, goal.y - 1, goal.z);
    mem.objectiveFirst = true;
    for (let t = 0; t < 60 * seconds; t++) {
      step(world, { 1: botThink(world, ctx, p, mem) }, ctx);
      if (
        Math.hypot(p.pos.x - goal.x, p.pos.z - goal.z) < 2.5 &&
        Math.abs(p.pos.y - HALF - (goal.y - 1)) < 1.5
      )
        return true;
    }
    return false;
  };

  it.each([0, 1] as const)('a bot climbs the Sun (team %i)', (team) => {
    expect(walkTo(def(), team, wpPos(def(), 'sunS'), 40)).toBe(true);
  });

  it.each([0, 1] as const)('a bot goes down into the gear crypt (team %i)', (team) => {
    expect(walkTo(def(), team, wpPos(def(), 'pitSS'), 40)).toBe(true);
  });

  // (blocked: the side doors, so the bot must come through the mid corridor; or the mid
  // corridor, so it must come through a library)
  const sides = (n: 'N' | 'S') => [`siteE${n}E`, `siteE${n}W`];
  const mid = (n: 'N' | 'S') => [`bcorr${n}`];
  it.each([
    ['A, through mid', 0, 'siteN', sides('N')],
    ['B, through mid', 0, 'siteS', sides('S')],
    ['A, through the library', 1, 'siteN', mid('N')],
    ['B, through the library', 1, 'siteS', mid('S')],
    ['A, through mid', 1, 'siteN', sides('N')],
    ['B, through the library', 0, 'siteS', mid('S')],
  ] as const)('a bot walks to %s (team %i)', (_n, team, site, blocked) => {
    const d = withBlocked(def(), [...blocked]);
    expect(walkTo(d, team, wpPos(d, site), 40)).toBe(true);
  });

  it.each([0, 1] as const)('a bot carries the Controller to the enemy Tower (team %i)', (team) => {
    const { lv, config, ctx, world } = sim();
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
  });

  it('an Elimination match of bots (3v3) plays out rounds', () => {
    const config = defaultConfig();
    const lv: Level = level();
    const ctx: SimContext = { level: lv, config, dt: TICK_DT };
    const world = createWorld(lv, 11);
    const mems: BotMemory[] = [];
    let id = 1;
    for (const team of [0, 1] as const)
      for (let i = 0; i < 3; i++) {
        const s = lv.def.spawns.filter((sp) => sp.team === team)[i];
        addPlayer(world, createPlayer(id, team, s.pos, s.yawDeg, config));
        mems.push(createBotMemory(id, BOT_SKILLS.normal, id * 13));
        id++;
      }
    const ms = createMatch('3v3', 'elim');
    startMatch(ms, world, ctx);
    let kills = 0;
    while (ms.rounds.length < 2 && world.tick < 60 * 60 * 6) {
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
    expect(ms.rounds.length).toBeGreaterThanOrEqual(2);
    expect(kills).toBeGreaterThan(0);
    for (const r of ms.rounds) expect(r.winner).not.toBeNull();
  }, 120000);
});
