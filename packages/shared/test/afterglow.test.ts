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
  mapDef,
  MAPS,
  qRotate,
  raycast,
  startMatch,
  step,
  TICK_DT,
  updateMatch,
  v3,
  waypointRoute,
  yawToView,
  type BotMemory,
  type BoxDef,
  type Level,
  type LevelDef,
  type PlayerInput,
  type SimContext,
  type SimEvent,
  type Vec3,
  type WorldState,
} from '../src/index';
import { AFTERGLOW, buildAfterglow } from '../src/level/maps/afterglow';

// (the registry marks the map competitive once it ships; the tests build it either way)
const def = () => mapDef('afterglow');
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
const key = (n: number) => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2);
const UP = AFTERGLOW.up;
const M = AFTERGLOW.metro;
const P = AFTERGLOW.plaza.y;

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

/** a box's corners in world space (a prism's six), rounded, sorted */
const corners = (b: BoxDef): string[] => {
  const { x: hx, y: hy, z: hz } = b.h;
  const local: Vec3[] = [];
  if (b.prism !== undefined)
    for (const sx of [-1, 1]) {
      local.push(v3(sx * hx, -hy, -hz), v3(sx * hx, -hy, hz), v3(sx * hx, hy, b.prism * hz));
    }
  else
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) for (const sz of [-1, 1]) local.push(v3(sx * hx, sy * hy, sz * hz));
  return local
    .map((p) => (b.q ? qRotate(b.q, p) : p))
    .map((p) => [p.x + b.c.x, p.y + b.c.y, p.z + b.c.z].map(key).join(','))
    .sort();
};
const mirrorCorners = (b: BoxDef): string[] =>
  corners(b)
    .map((s) => {
      const [x, y, z] = s.split(',').map(Number);
      return [-x, y, z].map(key).join(',');
    })
    .sort();

/** every place a player can stand, on a 1 m grid (feet), at every level */
const standingSpots = (lv: Level): Vec3[] => {
  const out: Vec3[] = [];
  for (let x = -54; x <= 54; x += 1)
    for (let z = -40; z <= 40; z += 1)
      for (const top of [8, 4.4, 1, -1.3]) {
        const h = raycast(lv, v3(x + 0.25, top, z + 0.25), v3(0, -1, 0), 25);
        if (!h || h.normal.y < 0.7) continue;
        const feet = v3(x + 0.25, h.point.y, z + 0.25);
        if (capsuleOverlaps(lv, standingCapsule(feet))) continue;
        if (!out.some((p) => p.x === feet.x && p.z === feet.z && Math.abs(p.y - feet.y) < 0.3))
          out.push(feet);
      }
  return out;
};

describe('Afterglow map', () => {
  it('is registered, about 110 × 84 m, and dark: low ambient light, lots of neon', () => {
    const m = MAPS.find((x) => x.id === 'afterglow');
    expect(m?.build).toBe(buildAfterglow);
    expect(m?.arena).toBeFalsy();
    expect(m?.competitive).toBe(true);
    expect(m?.symmetric).toBe(true);
    const d = def();
    expect(d.name).toBe('Afterglow');
    expect(d.boundsMax.x - d.boundsMin.x).toBe(112);
    expect(d.boundsMax.z - d.boundsMin.z).toBe(84);
    expect(d.boxes.length).toBeGreaterThan(500);
    expect(d.boxes.length).toBeLessThan(950);
    expect(d.ambient).toBeLessThan(0.6);
    expect(d.boxes.filter((b) => b.mat === 'trim').length).toBeGreaterThan(80);
    expect(d.lights!.length).toBeGreaterThan(60);
    expect(d.sky?.moons.length).toBeGreaterThan(0);
    // the dome: a skyglass roof over the whole market
    const roof = d.boxes.find((b) => b.mat === 'skyglass' && b.c.y > AFTERGLOW.dome)!;
    expect(roof.h.x).toBeGreaterThanOrEqual(AFTERGLOW.halfX);
    expect(roof.h.z).toBeGreaterThanOrEqual(AFTERGLOW.south);
  });

  it('is mirror-symmetric across x = 0 (every box, ramps and koi too; teams swapped)', () => {
    const d = def();
    const all = new Set(d.boxes.map((b) => corners(b).join(';')));
    for (const b of d.boxes)
      expect(all.has(mirrorCorners(b).join(';')), `box at ${JSON.stringify(b.c)}`).toBe(true);
    const mir = (p: Vec3) => [-p.x, p.y, p.z].map(key).join(',');
    const at = (p: Vec3) => [p.x, p.y, p.z].map(key).join(',');
    for (const s of d.spawns)
      expect(
        d.spawns.some((o) => o.team !== s.team && o.group === s.group && at(o.pos) === mir(s.pos)),
      ).toBe(true);
    for (const t of d.towers)
      expect(d.towers.some((o) => o.team !== t.team && at(o.pos) === mir(t.pos))).toBe(true);
    // waypoints: named twins (…E ↔ …W), links mirrored too
    const wps = d.waypoints!;
    const twin = (n: string) =>
      n.endsWith('E') ? `${n.slice(0, -1)}W` : n.endsWith('W') ? `${n.slice(0, -1)}E` : n;
    for (const w of wps) {
      const o = wps[wpIndex(d, twin(w.name!))];
      expect(at(o.pos), w.name).toBe(mir(w.pos));
      expect(o.links.map((j) => twin(wps[j].name!)).sort()).toEqual(
        w.links.map((j) => wps[j].name!).sort(),
      );
    }
    for (const s of d.bombSites!) expect(s.min.x).toBe(-s.max.x);
    for (const p of d.powerups!) expect(p.x).toBe(0);
    for (const l of d.lights!) expect(d.lights!.some((o) => at(o.pos) === mir(l.pos))).toBe(true);
  });

  it('has no visible clipping (no two pieces of a different look cut into each other)', () => {
    const d = def();
    expect(findOverlaps(d).map((o) => describeOverlap(d, o))).toEqual([]);
  });

  it('follows the plan: open floor where the plan has ground, on all three floors', () => {
    const lv = level();
    const places: [string, number, number, number][] = [
      ['Tower hall', 47, 0, -8],
      ['north spawn yard', 50, 0, -27],
      ['south spawn yard', 50, 0, 27],
      ['metro platform (spawn)', 50, M, 11],
      ['Lantern Alley', 42, 0, -38],
      ['the alley corner', 26, 0, -33],
      ['Noodle Bar', 36, 0, -27],
      ['Noodle Row', 32, 0, -16],
      ['Arcade Lane', 19, 0, -27.5],
      ['arcade hall (A)', 0, 0, -32],
      ['Arcade Row', 0, 0, -20],
      ['Market Street', 34, 0, -6],
      ['Lantern Passage', 19, 0, -10],
      ['Koi Plaza rim', 10, 0, -7],
      ['Koi Plaza basin', 7, P, -11],
      ['teahouse', 18, UP, -12],
      ['teahouse balcony', 13, UP, -3],
      ['pachinko parlour', 38, 0, 11],
      ['Foyer', 6, 0, 6.5],
      ['South Alley', 16, 0, 12],
      ['Tram Street', 22, 0, 18],
      ['Stair Alley', 30, 0, 26],
      ['Rail Street', 26, 0, 37],
      ['monorail track', 22, UP, 24],
      ['station, north platform', 6, UP, 21],
      ['station, in the train', 2, UP, 24],
      ['station, south platform', 6, UP, 27],
      ['metro hall', 6, M, 24],
      ['metro tunnel (west)', 20, M, 23],
      ['metro tunnel (east)', 40, M, 19],
      ['metro kink', 29, M, 12],
    ];
    for (const [name, x, y, z] of places)
      for (const xx of [x, -x]) {
        expect(raycast(lv, v3(xx, y + 1, z), v3(0, -1, 0), 2)?.point.y, name).toBeCloseTo(y, 3);
        expect(capsuleOverlaps(lv, standingCapsule(v3(xx, y, z))), name).toBe(false);
      }
  });

  it('has 8 spawns per team in three detached groups (north yard, metro, south yard), Towers, sites with floor, a power-up', () => {
    const d = def();
    const lv = level();
    for (const team of [0, 1] as const) {
      const spawns = d.spawns.filter((s) => s.team === team);
      expect(spawns.length).toBe(8);
      const count: Record<string, number> = {};
      for (const s of spawns) {
        expect(capsuleOverlaps(lv, standingCapsule(s.pos))).toBe(false);
        expect(
          raycast(lv, v3(s.pos.x, s.pos.y + 1, s.pos.z), v3(0, -1, 0), 2)?.point.y,
        ).toBeCloseTo(s.pos.y, 3);
        const g = s.group as keyof typeof AFTERGLOW.spawnAreas;
        const area = AFTERGLOW.spawnAreas[g];
        expect(area, `group ${s.group}`).toBeDefined();
        const x = team === 1 ? s.pos.x : -s.pos.x;
        expect(x > area.x0 && x < area.x1 && s.pos.z > area.z0 && s.pos.z < area.z1).toBe(true);
        expect(s.pos.y).toBe(area.y);
        count[g] = (count[g] ?? 0) + 1;
      }
      expect(count).toEqual({ north: 3, metro: 2, south: 3 });
      const t = d.towers.find((x) => x.team === team)!;
      expect(t.pos.x).toBe(team === 1 ? 51 : -51);
      const w = wpPos(d, team === 1 ? 'towerE' : 'towerW');
      expect(Math.hypot(w.x - t.pos.x, w.z - t.pos.z)).toBeLessThan(
        t.radius + defaultConfig().rules.towerTouchRadius + 0.5,
      );
      const home = d.controllerHomes![team];
      expect(capsuleOverlaps(lv, standingCapsule(v3(home.x, 0, home.z)))).toBe(false);
    }
    const [A, B] = ['A', 'B'].map((n) => d.bombSites!.find((s) => s.name === n)!);
    // A indoors in the arcade hall, B on the station's upper floor, both across the middle
    expect(A.min.z).toBeGreaterThan(AFTERGLOW.arcade.z0);
    expect(A.max.z).toBeLessThan(AFTERGLOW.arcade.z1);
    expect(B.min.y).toBe(UP);
    expect(B.min.z).toBeGreaterThanOrEqual(AFTERGLOW.station.z0);
    expect(B.max.z).toBeLessThanOrEqual(AFTERGLOW.station.z1);
    for (const s of d.bombSites!) {
      expect((s.max.x - s.min.x) * (s.max.z - s.min.z)).toBeGreaterThan(100);
      const c = v3((s.min.x + s.max.x) / 2, s.min.y + 1, (s.min.z + s.max.z) / 2 - 1);
      expect(raycast(lv, c, v3(0, -1, 0), 2)?.point.y).toBeCloseTo(s.min.y, 3);
      expect(capsuleOverlaps(lv, standingCapsule(v3(c.x, s.min.y, c.z)))).toBe(false);
    }
    // the power-up floats over the Koi Plaza's sunk basin, in reach
    for (const p of d.powerups!) {
      const floor = raycast(lv, p, v3(0, -1, 0), 3)!;
      expect(floor.point.y).toBeCloseTo(P, 2);
      expect(capsuleOverlaps(lv, standingCapsule(floor.point))).toBe(false);
    }
  });

  it('no spawn can be seen from anywhere outside its base (streets, upper floor, metro)', () => {
    const lv = level();
    const spots = standingSpots(lv).filter((p) => Math.abs(p.x) < AFTERGLOW.halfX);
    // every floor of the map is sampled
    for (const y of [P, 0, UP, M]) expect(spots.some((p) => Math.abs(p.y - y) < 0.05)).toBe(true);
    expect(spots.length).toBeGreaterThan(2500);
    for (const p of spots)
      for (const s of lv.def.spawns)
        for (const dy of [0.3, 1, 1.7])
          expect(
            lineOfSight(lv, v3(p.x, p.y + 1.6, p.z), v3(s.pos.x, s.pos.y + dy, s.pos.z)),
            `${JSON.stringify(p)} sees ${JSON.stringify(s.pos)}`,
          ).toBe(false);
  });

  it('each spawn group has two ways out, and the groups are apart', () => {
    const d = def();
    // the room's waypoint and the first waypoints of its two ways out (east half)
    const exits: Record<string, [string, string[]]> = {
      north: ['nYardE', ['nYardSE', 'nYardNE']], // → Tower hall / → the corridor to the alley
      metro: ['platE', ['rampBotE', 'platInE']], // → up to the Tower hall / → the tunnel
      south: ['sYardE', ['sYardNE', 'sYardSE']], // → Tower hall / → the corridor to Rail Street
    };
    for (const [group, [room, outs]] of Object.entries(exits)) {
      const wps = d.waypoints!;
      const r = wpIndex(d, room);
      // the room's waypoint is next to the group's spawns
      for (const sp of d.spawns.filter((x) => x.team === 1 && x.group === group))
        expect(Math.hypot(sp.pos.x - wps[r].pos.x, sp.pos.z - wps[r].pos.z)).toBeLessThan(6);
      for (const o of outs) {
        expect(wps[r].links.includes(wpIndex(d, o)), `${room} → ${o}`).toBe(true);
        // with this way out shut, the other one still leads to both sites
        const cut = withBlocked(d, [o]);
        for (const site of ['siteA', 'siteB'])
          expect(
            waypointRoute(cut.waypoints!, r, wpIndex(d, site)).length,
            `${group} without ${o} → ${site}`,
          ).toBeGreaterThan(0);
      }
    }
    // the groups' centres are at least 20 m apart (or a floor apart)
    const centre = (g: string) => {
      const ss = d.spawns.filter((s) => s.team === 1 && s.group === g);
      return v3(
        ss.reduce((a, s) => a + s.pos.x, 0) / ss.length,
        ss[0].pos.y,
        ss.reduce((a, s) => a + s.pos.z, 0) / ss.length,
      );
    };
    const [n, m, s] = ['north', 'metro', 'south'].map(centre);
    expect(Math.abs(n.z - s.z)).toBeGreaterThan(40);
    expect(n.y - m.y).toBe(-M);
    expect(Math.abs(m.z - n.z)).toBeGreaterThan(20);
  });

  it('waypoints sit in open space over floor, links have line of sight, all are reachable', () => {
    const lv = level();
    const wps = lv.def.waypoints!;
    for (const w of wps) {
      expect(
        capsuleOverlaps(lv, { center: w.pos, up: v3(0, 1, 0), halfSeg: 0, radius: 0.3 }),
        `waypoint ${w.name}`,
      ).toBe(false);
      expect(raycast(lv, w.pos, v3(0, -1, 0), 1.5)?.point.y, w.name).toBeCloseTo(w.pos.y - 1, 1);
      for (const j of w.links)
        expect(lineOfSight(lv, w.pos, wps[j].pos), `link ${w.name} → ${wps[j].name}`).toBe(true);
    }
    for (const from of ['towerE', 'towerW'])
      for (let i = 0; i < wps.length; i++)
        expect(waypointRoute(wps, wpIndex(lv.def, from), i).length, wps[i].name).toBeGreaterThan(0);
    // the graph covers every part of the plan: all three floors, both sites, every spawn group
    for (const name of ['siteA', 'siteB', 'pN', 'basin', 'thE', 'trk2W', 'mhC', 'kinkNE', 'pk3W'])
      expect(() => wpIndex(lv.def, name)).not.toThrow();
    const heights = new Set(wps.map((w) => key(w.pos.y - 1)));
    for (const y of [P, 0, UP, M]) expect(heights.has(key(y))).toBe(true);
    for (const s of lv.def.spawns)
      expect(
        wps.some(
          (w) =>
            Math.hypot(w.pos.x - s.pos.x, w.pos.z - s.pos.z) < 6 &&
            Math.abs(w.pos.y - 1 - s.pos.y) < 0.1,
        ),
        `a waypoint near the ${s.group} spawn at ${JSON.stringify(s.pos)}`,
      ).toBe(true);
  });

  it('keeps every ramp at 30° or less, and every piece of cover half or full', () => {
    const d = def();
    const rotated = d.boxes.filter((b) => b.q && !b.noCollide);
    // stairs (the station stair, and per side: to the teahouse ×2, to the monorail, down to the
    // metro ×3) and the ramps under the plaza's steps (6): all solid wedges
    expect(rotated.length).toBe(19);
    for (const b of rotated) {
      expect(b.prism).toBeDefined();
      expect((Math.atan2(b.h.y, b.h.z) * 180) / Math.PI).toBeLessThanOrEqual(30);
    }
    // cover standing on a floor is waist-high (≤ 1.25 m: see and vault over it) or taller
    // than a player (≥ 2 m): nothing in between to hide a head behind
    const floors = [P, P + 0.04, 0, UP, M];
    for (const b of d.boxes) {
      if (b.noCollide || b.q) continue;
      const y0 = b.c.y - b.h.y;
      const h = 2 * b.h.y;
      if (!floors.some((f) => Math.abs(f - y0) < 0.01)) continue;
      if (Math.max(b.h.x, b.h.z) > 6) continue; // walls and floors of the plan, not cover
      expect(h <= 1.25 || h >= 2, `${b.mat} at ${JSON.stringify(b.c)}: ${h.toFixed(2)} m`).toBe(
        true,
      );
    }
  });

  it('cuts the long lines: no door-to-door line across site A, the train ends the track, Market Street stops at the teahouse stair', () => {
    const lv = level();
    for (const z of [-29.8, -29, -28.2])
      expect(lineOfSight(lv, v3(13, 1.6, z), v3(-13, 1.6, z)), `A side doors, z ${z}`).toBe(false);
    for (const z of [22.5, 24, 25.5])
      expect(lineOfSight(lv, v3(30, UP + 1.6, z), v3(-30, UP + 1.6, z)), `track z ${z}`).toBe(
        false,
      );
    for (let z = -7.75; z < -4; z += 0.5)
      expect(lineOfSight(lv, v3(40, 1.6, z), v3(-40, 1.6, z)), `market z ${z}`).toBe(false);
    // the station stair does not look up Arcade Row into the hall
    expect(lineOfSight(lv, v3(-1, 3.9, 13), v3(-1, 1.6, -34))).toBe(false);
    // the metro tunnel has no line from one base platform to the other
    expect(lineOfSight(lv, v3(51, M + 1.6, 19.5), v3(-51, M + 1.6, 19.5))).toBe(false);
  });
});

describe('Afterglow: paper screens, the plaza, the stairs', () => {
  const run = (world: WorldState, ctx: SimContext, ticks: number, buttons = 0, yaw = 0) => {
    const events: SimEvent[] = [];
    for (let t = 0; t < ticks; t++) {
      step(world, { 1: { tick: world.tick + 1, buttons, view: yawToView(yaw) } }, ctx);
      events.push(...world.events);
    }
    return events;
  };
  const feet = (p: { pos: Vec3 }) => p.pos.y - defaultConfig().movement.standHeight / 2;

  it('a paper screen in Lantern Alley stops players, lasers and sight, but not the Boomerang', () => {
    const lv = level();
    // the screen at x 32 (z -40..-38), seen from the west
    const eye = v3(29.5, 1.6, -39);
    const dir = v3(1, 0, 0);
    const hit = raycast(lv, eye, dir, 10)!;
    expect(hit.point.x).toBeCloseTo(31.9, 3);
    expect(lv.def.boxes[hit.box].mat).toBe('paper');
    expect(lv.def.boxes[hit.box].boomerangPasses).toBe(true);
    expect(raycast(lv, eye, dir, 5, 0.2, true)).toBeNull(); // the Boomerang's flight
    expect(lineOfSight(lv, eye, v3(34, 1.6, -39))).toBe(false);
    expect(capsuleOverlaps(lv, standingCapsule(v3(32, 0, -39)))).toBe(true);
    // a player walking east into it stops at the paper
    const { config, ctx, world } = sim();
    const p = addPlayer(world, createPlayer(1, 0, v3(29.5, 0, -39), -90, config));
    run(world, ctx, 90, Btn.Forward, -90);
    expect(p.pos.x).toBeLessThan(31.9);
  });

  it('a Quick Throw flies through the paper screen and hits the player behind it', () => {
    const { config, ctx, world } = sim();
    const thrower = addPlayer(world, createPlayer(1, 0, v3(29, 0, -39), -90, config));
    const target = addPlayer(world, createPlayer(2, 1, v3(35, 0, -39), 90, config));
    const events: SimEvent[] = [];
    const tick = (buttons: number, n: number) => {
      for (let i = 0; i < n; i++) {
        step(
          world,
          {
            1: { tick: world.tick + 1, buttons, view: yawToView(-90) },
            2: { tick: world.tick + 1, buttons: 0, view: yawToView(90) },
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
  });

  it('the plaza steps take you down into the basin and back up to the rim', () => {
    for (const s of [1, -1]) {
      const { config, ctx, world } = sim();
      const west = s > 0 ? 90 : -90; // toward the fountain
      const p = addPlayer(world, createPlayer(1, 0, v3(s * 11, 0, -7), west, config));
      run(world, ctx, 45, Btn.Forward, west);
      run(world, ctx, 30);
      expect(p.grounded).toBe(true);
      expect(feet(p)).toBeLessThan(P + 0.1);
      expect(s * p.pos.x).toBeLessThan(5.6);
      run(world, ctx, 90, Btn.Forward, -west);
      run(world, ctx, 20);
      expect(feet(p)).toBeCloseTo(0, 1);
      expect(s * p.pos.x).toBeGreaterThan(8.5);
    }
  });

  it('every stair leads where the plan says: up to the teahouse, monorail and station, down to the metro', () => {
    const cases: [string, Vec3, number, number, (p: Vec3) => boolean][] = [
      ['station stair (Foyer → B)', v3(0.5, 0, 6), 180, UP, (q) => q.z > 18.5],
      ['monorail stair (Rail Street → track)', v3(36, 0, 38), 0, UP, (q) => q.z < 25.5],
      ['teahouse stair (Arcade Lane)', v3(20, 0, -28), 180, UP, (q) => q.z > -15.5],
      ['teahouse stair (Market Street)', v3(26, 0, -6), 90, UP, (q) => q.x < 13.8],
      ['Foyer → metro hall', v3(8, 0, 6), 180, M, (q) => q.z > 18.5],
      ['pachinko → metro', v3(41, 0, 4), 90, M, (q) => q.x < 29.8],
      ['Tower hall → metro platform', v3(46, 0, -4), 180, M, (q) => q.z > 8.5],
    ];
    for (const [name, from, yaw, y, arrived] of cases)
      for (const s of [1, -1]) {
        const { config, ctx, world } = sim();
        const yy = s > 0 ? yaw : yaw === 180 ? 180 : -yaw;
        const p = addPlayer(world, createPlayer(1, 0, v3(s * from.x, from.y, from.z), yy, config));
        let reached = false;
        for (let t = 0; t < 240 && !reached; t++) {
          run(world, ctx, 1, Btn.Forward, yy);
          reached =
            p.grounded &&
            Math.abs(feet(p) - y) < 0.05 &&
            arrived(v3(s * p.pos.x, p.pos.y, p.pos.z));
        }
        expect(reached, `${name} (${s > 0 ? 'east' : 'west'})`).toBe(true);
      }
  });
});

describe('Afterglow bots', () => {
  const walk = (d: LevelDef, team: 0 | 1, goalName: string, seconds: number, group?: string) => {
    const { config, ctx, world } = sim(d);
    const s = d.spawns.find((sp) => sp.team === team && (!group || sp.group === group))!;
    const p = addPlayer(world, createPlayer(1, team, s.pos, s.yawDeg, config));
    const mem = createBotMemory(1, BOT_SKILLS.normal, 9);
    const goal = wpPos(d, goalName);
    mem.objective = v3(goal.x, goal.y - 1, goal.z);
    mem.objectiveFirst = true;
    for (let t = 0; t < 60 * seconds; t++) {
      step(world, { 1: botThink(world, ctx, p, mem) }, ctx);
      if (
        Math.hypot(p.pos.x - goal.x, p.pos.z - goal.z) < 2.5 &&
        Math.abs(p.pos.y - 0.9 - (goal.y - 1)) < 1
      )
        return true;
    }
    return false;
  };
  const goals: [string, string][] = [
    ['the Koi Plaza', 'pE'],
    ['the fountain basin', 'basin'],
    ['the teahouse', 'th'],
    ['the monorail track', 'trk2'],
    ['the pachinko parlour', 'pk3'],
    ['the Noodle Bar', 'nbW'],
    ['Rail Street', 'rsW'],
    ['the metro hall', 'mhS'],
  ];
  it.each(goals.flatMap(([n, g]) => ([0, 1] as const).map((team) => [n, team, g] as const)))(
    'a bot walks from its spawn to %s (team %i)',
    (_name, team, goal) => {
      const own = team === 1 ? 'E' : 'W';
      const d = def();
      const name = d.waypoints!.some((w) => w.name === goal) ? goal : `${goal}${own}`;
      expect(walk(d, team, name, 40)).toBe(true);
    },
    30000,
  );

  const groups = ['north', 'metro', 'south'];
  it.each(
    groups.flatMap((g) =>
      (['siteA', 'siteB'] as const).flatMap((site) =>
        ([0, 1] as const).map((team) => [g, site, team] as const),
      ),
    ),
  )(
    'a bot from the %s spawn group walks to %s (team %i)',
    (group, site, team) => {
      expect(walk(def(), team, site, 40, group)).toBe(true);
    },
    30000,
  );

  // crossings of the middle (x = 0): arcade, plaza, Foyer, station, metro hall
  const MIDDLE: Record<string, string[]> = {
    arcade: ['siteA', 'aFront'],
    plaza: ['row', 'pN', 'pS', 'basin', 'basinN'],
    foyer: ['sMouth', 'foyerC', 'stMid'],
    station: ['stTop', 'siteB'],
    metro: ['mhC', 'mhS'],
  };
  const lanes = Object.keys(MIDDLE);
  it.each(lanes.flatMap((lane) => ([0, 1] as const).map((team) => [lane, team] as const)))(
    'a bot carries the Controller to the enemy Tower through the %s (team %i)',
    (lane, team) => {
      const blocked = lanes.filter((l) => l !== lane).flatMap((l) => MIDDLE[l]);
      const { lv, config, ctx, world } = sim(withBlocked(def(), blocked));
      const s = lv.def.spawns.find((sp) => sp.team === team)!;
      addPlayer(world, createPlayer(1, team, s.pos, s.yawDeg, config));
      const mem = createBotMemory(1, BOT_SKILLS.normal, 5);
      const ms = createMatch('1v1');
      startMatch(ms, world, ctx);
      for (let t = 0; t < 60 * 50 && ms.phase !== 'roundEnd'; t++) {
        applyBotObjectives(ms, world, ctx, [mem]);
        step(world, { 1: botThink(world, ctx, world.players[0], mem) }, ctx);
        updateMatch(ms, world, ctx);
      }
      expect(ms.rounds[0]?.reason).toBe('tower');
      expect(ms.rounds[0]?.winner).toBe(team);
    },
    60000,
  );

  it('an Elimination match of bots (2v2) plays its rounds out: they meet, fight, rounds end', () => {
    const d = def();
    const config = defaultConfig();
    const ctx: SimContext = { level: buildLevel(d), config, dt: TICK_DT };
    const world = createWorld(ctx.level, 11);
    const mems: BotMemory[] = [];
    let id = 1;
    for (const team of [0, 1] as const)
      for (let i = 0; i < 2; i++) {
        const s = d.spawns.filter((sp) => sp.team === team)[i];
        addPlayer(world, createPlayer(id, team, s.pos, s.yawDeg, config));
        mems.push(createBotMemory(id, BOT_SKILLS.normal, id * 13));
        id++;
      }
    const ms = createMatch('2v2', 'elim');
    startMatch(ms, world, ctx);
    let kills = 0;
    const secs = (x: number) => Math.round(x * 60);
    while (ms.rounds.length < 2 && world.tick < secs(2 * (5 + 80 + 60 + 5))) {
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
    expect(ms.rounds.length).toBe(2);
    expect(kills).toBeGreaterThan(0);
    for (const r of ms.rounds) expect(r.winner).not.toBeNull();
  }, 120000);
});
