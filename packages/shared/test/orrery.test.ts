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
  it('is registered (placeholder flags until the coordinator flips it) and sized like a team map', () => {
    const m = MAPS.find((x) => x.id === 'orrery');
    expect(m?.name).toBe('The Orrery');
    const d = def();
    expect(d.name).toBe('The Orrery');
    expect(d.boundsMax.x - d.boundsMin.x).toBe(116);
    expect(d.boundsMax.z - d.boundsMin.z).toBeCloseTo(93.2, 5);
    expect(d.sky).toBeDefined();
    expect(d.ambient!).toBeLessThan(0.8);
    expect(d.movers).toHaveLength(6);
    // in line with the other maps (the client's budget)
    expect(d.boxes.length).toBeGreaterThan(550);
    expect(d.boxes.length).toBeLessThan(900);
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
    // both sites and the power-up sit on the mirror line
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
      // same timeline, tick for tick (paths run along z and y only: x → -x changes nothing)
      const te = moverTimeline(e.path, e.speed, e.delay);
      const tw = moverTimeline(w.path, w.speed, w.delay);
      expect(tw.period).toBe(te.period);
      for (let t = 0; t < te.period; t += 7) {
        const a = timelineAt(te, t);
        const b = timelineAt(tw, t);
        expect([key(-a.x), key(a.y), key(a.z)]).toEqual([key(b.x), key(b.y), key(b.z)]);
      }
    }
    // Mercury and Venus share a schedule, half a loop apart: one pair is always at the Sun
    const tm = moverTimeline(movers[0].path, movers[0].speed, movers[0].delay);
    const tv = moverTimeline(movers[2].path, movers[2].speed, movers[2].delay);
    expect(tv.period).toBe(tm.period);
    const sunTop = (m: number, t: number) => {
      const tl = m === 0 ? tm : tv;
      const at = m === 0 ? ORRERY.planets.mercury.at : ORRERY.planets.venus.at;
      return at.y + timelineAt(tl, t).y;
    };
    for (let t = 0; t < tm.period; t += 5) {
      const m = sunTop(0, t);
      const v = sunTop(2, t);
      // while one waits at the Sun (y 12) the other waits at the Ring (y 6), and back
      expect(m + v).toBeCloseTo(ORRERY.ring + ORRERY.sun, 6);
    }
  });

  it('follows the plan: open floor where the plan has ground', () => {
    const lv = level();
    const R = ORRERY.ring;
    const S = ORRERY.sun;
    const places: [string, number, number, number][] = [
      ['Well, west', -22, 0, 0],
      ['Well, north field', -6, 0, -20],
      ['Sun gate', 0, 0, 13],
      ['spiral, SE landing', 10.5, ORRERY.spiralLanding, 10.5],
      ['spiral, NW landing', -10.5, S, -10.5],
      ['the Sun', 0, S, -3],
      ['A site', 0, 0, -37],
      ['B site', 0, 0, 37],
      ['north gallery, west', -21, 0, -39],
      ['west yard', -37.5, 0, 8],
      ['Ring over the yard', -38, R, 0],
      ['Ring over A', 0, R, -37],
      ['Ring corner', 37, R, 36],
      ['Cyan spawn room', -50, 0, 0],
      ['Cyan vestibule', -52, 0, 12.5],
    ];
    for (const [name, x, y, z] of places)
      for (const xx of [x, -x]) {
        expect(raycast(lv, v3(xx, y + 1, z), v3(0, -1, 0), 2)?.point.y, name).toBeCloseTo(y, 3);
        expect(capsuleOverlaps(lv, standingCapsule(v3(xx, y, z))), name).toBe(false);
      }
  });

  it('has 8 valid spawns per team inside its room, Towers in front, sites with floor', () => {
    const d = def();
    const lv = level();
    const SP = ORRERY.spawn;
    for (const team of [0, 1] as const) {
      const spawns = d.spawns.filter((s) => s.team === team);
      expect(spawns.length).toBe(8);
      for (const s of spawns) {
        expect(capsuleOverlaps(lv, standingCapsule(s.pos))).toBe(false);
        expect(
          raycast(lv, v3(s.pos.x, s.pos.y + 1, s.pos.z), v3(0, -1, 0), 2)?.point.y,
        ).toBeCloseTo(s.pos.y, 3);
        const x = team === 0 ? -s.pos.x : s.pos.x;
        expect(x > SP.x0 && x < SP.x1 && Math.abs(s.pos.z) < SP.z).toBe(true);
      }
      const t = d.towers.find((x) => x.team === team)!;
      // the Tower stands in the yard in front of the team's spawn
      expect(Math.sign(t.pos.x)).toBe(team === 0 ? -1 : 1);
      expect(Math.abs(t.pos.x)).toBeGreaterThan(ORRERY.well.x);
      expect(Math.abs(t.pos.x)).toBeLessThan(ORRERY.outer.x);
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
    }
    // A in the north gallery, B in the south one
    const A = d.bombSites!.find((s) => s.name === 'A')!;
    const B = d.bombSites!.find((s) => s.name === 'B')!;
    expect(A.max.z).toBeLessThan(-ORRERY.well.z);
    expect(B.min.z).toBeGreaterThan(ORRERY.well.z);
    // the power-up floats over the Sun
    expect(d.powerups!.map((p) => [p.x, p.y, p.z])).toEqual([[0, ORRERY.sun + 1, 0]]);
    expect(raycast(lv, d.powerups![0], v3(0, -1, 0), 2)?.point.y).toBeCloseTo(ORRERY.sun, 3);
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
    for (const from of ['spawnW', 'spawnE'])
      for (let i = 0; i < wps.length; i++)
        expect(waypointRoute(wps, wpIndex(lv.def, from), i).length, wps[i].name).toBeGreaterThan(0);
  });

  it('keeps every ramp at 30° or less (and the spiral is a long one)', () => {
    const d = def();
    const prisms = d.boxes.filter((b) => b.prism !== undefined);
    // yards (4), galleries (4), the double spiral (2 × 2)
    expect(prisms.length).toBe(12);
    for (const b of prisms) {
      const deg = (Math.atan2(2 * b.h.y, 2 * b.h.z) * 180) / Math.PI;
      expect(deg).toBeLessThanOrEqual(30);
      expect(deg).toBeGreaterThan(20);
    }
    // the spiral from the gate to the top: 7.5 m + 3 m landing + 18 m
    const P = ORRERY.pedestal;
    expect(P - ORRERY.gate + (ORRERY.band - P) + 2 * P).toBeGreaterThan(25);
  });

  it('no spawn is in view from anywhere outside its own room and vestibules', () => {
    const lv = level();
    const eyes: Vec3[] = [];
    // every 2.5 m over the dome, the undercroft and the Ring, at standing / jumping / flying
    // heights (points inside walls skipped)
    for (let x = -45; x <= 45; x += 2.5)
      for (let z = -45; z <= 45; z += 2.5)
        for (const y of [1.6, 3, 4.6, 7.6, 9, 11, 13.6, 16, 20]) {
          const p = v3(x, y, z);
          if (capsuleOverlaps(lv, { center: p, up: v3(0, 1, 0), halfSeg: 0, radius: 0.2 }))
            continue;
          eyes.push(p);
        }
    expect(eyes.length).toBeGreaterThan(8000);
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
    ['Mercury: north Ring → the Sun', PL.mercury, 1],
    ['Mercury (west twin)', PL.mercury, -1],
    ['Venus: the Sun → south Ring', PL.venus, 1],
    ['Saturn: north Ring → south Ring', PL.saturn, 1],
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

  it('a rider steps off Mercury onto the Sun, and off Venus onto the south Ring', () => {
    const tl = period(PL.mercury);
    const arrive = tl.wait + tl.travel[0] + 5;
    // (the run helper looks north, yaw 0: walking backwards goes south, +z)
    const m = run(v3(PL.mercury.at.x, PL.mercury.at.y + 0.12, PL.mercury.at.z), arrive + 90, (t) =>
      t > arrive ? Btn.Back : 0,
    );
    expect(m.p.alive).toBe(true);
    expect(m.p.pos.z).toBeGreaterThan(-ORRERY.pedestal + 0.5);
    expect(m.p.pos.y - HALF).toBeCloseTo(ORRERY.sun, 1);
    const v = run(v3(PL.venus.at.x, PL.venus.at.y + 0.12, PL.venus.at.z), arrive + 90, (t) =>
      t > arrive ? Btn.Back : 0,
    );
    expect(v.p.alive).toBe(true);
    expect(v.p.pos.z).toBeGreaterThan(ORRERY.well.z + 0.5);
    expect(v.p.pos.y - HALF).toBeCloseTo(ORRERY.ring, 1);
  });

  it('nobody is crushed: players under the planets, at the docks and jumping under them live', () => {
    const W = ORRERY.well.z;
    const spots: [string, Vec3][] = [
      ['Well floor under Mercury at the Ring', v3(4.5, 0, -27)],
      ['Well floor under Venus at the Ring', v3(4.5, 0, 27)],
      ['Well floor under Saturn', v3(22, 0, 0)],
      ['on a hub under Saturn', v3(22, 1.2, 5)],
      ['Ring edge at Mercury’s dock', v3(4.5, ORRERY.ring, -W - 0.35)],
      ['Ring edge at Saturn’s dock', v3(22, ORRERY.ring, W + 0.35)],
      ['Sun edge at Mercury’s dock', v3(4.5, ORRERY.sun, -ORRERY.pedestal + 0.35)],
      ['Sun edge at Venus’ dock', v3(-4.5, ORRERY.sun, ORRERY.pedestal - 0.35)],
      ['spiral foot under Venus', v3(5, 1.8, 10.5)],
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

  it.each([0, 1] as const)('a bot climbs the spiral to the Sun (team %i)', (team) => {
    expect(walkTo(def(), team, wpPos(def(), 'sunC'), 40)).toBe(true);
  });

  // (blocked: the ground routes into that gallery, so the bot must come over the Ring and
  // down the gallery's ramp; or the Ring, so it must come along the ground)
  const ground = (n: 'N' | 'S') => [
    `archWell${n}W`,
    `archWell${n}E`,
    `siteGate${n}`,
    `galEnd${n}W`,
    `galEnd${n}E`,
  ];
  const ring = (n: 'N' | 'S') => [`rampTop${n}W`, `rampTop${n}E`];
  it.each([
    ['A, over the Ring', 0, 'siteN', ground('N')],
    ['B, over the Ring', 0, 'siteS', ground('S')],
    ['A, on the ground', 1, 'siteN', ring('N')],
    ['B, on the ground', 1, 'siteS', ring('S')],
    ['A, over the Ring', 1, 'siteN', ground('N')],
    ['B, on the ground', 0, 'siteS', ring('S')],
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
