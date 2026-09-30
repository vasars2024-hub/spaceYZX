// Colossus Yard: the big Brawl map (rules/brawl.ts). An orbital drydock, mirror-symmetric across
// x = 0, 32 sealed spawn shelters, crane booms reached by stairs and launch pads, zip-rails, and
// a void under the platform's edge.
import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  applyBrawlBotObjectives,
  BOT_SKILLS,
  botThink,
  BRAWL_DEFAULTS,
  brawlSafeSpawn,
  Btn,
  buildLevel,
  capsuleOverlaps,
  createBotMemory,
  createBrawl,
  createPlayer,
  createWorld,
  defaultConfig,
  describeOverlap,
  findOverlaps,
  isEnemy,
  len,
  lineOfSight,
  mapDef,
  MAPS,
  raycast,
  startBrawl,
  step,
  sub,
  TICK_DT,
  updateBrawl,
  v3,
  waypointRoute,
  yawToView,
  type BrawlVariant,
  type LevelDef,
  type PlayerInput,
  type SimContext,
  type Vec3,
} from '../src/index';
import { COLOSSUS_SHELTERS, COLOSSUS_YARD, SHELTER_SIZE } from '../src/level/maps/colossus-yard';

const C = COLOSSUS_YARD;
const def = () => mapDef('colossus-yard');
const level = () => buildLevel(def());
const key = (n: number) => n.toFixed(3);
const wpIndex = (d: LevelDef, name: string) => {
  const i = d.waypoints!.findIndex((w) => w.name === name);
  if (i < 0) throw new Error(`no waypoint ${name}`);
  return i;
};
const wpPos = (d: LevelDef, name: string) => d.waypoints![wpIndex(d, name)].pos;
const standing = (feet: Vec3, radius = 0.4) => ({
  center: v3(feet.x, feet.y + 0.9, feet.z),
  up: v3(0, 1, 0),
  halfSeg: 0.45,
  radius,
});
const floorUnder = (lv: ReturnType<typeof level>, p: Vec3, reach = 2) =>
  raycast(lv, v3(p.x, p.y + 1, p.z), v3(0, -1, 0), reach)?.point.y;
const sim = (d: LevelDef = def(), seed = 3) => {
  const lv = buildLevel(d);
  const config = defaultConfig();
  const ctx: SimContext = { level: lv, config, dt: TICK_DT };
  return { lv, config, ctx, world: createWorld(lv, seed) };
};
/** a shelter's footprint (room, door gaps and screens), with the mirrored copy for sx = -1 */
const inShelter = (p: { x: number; z: number }) =>
  COLOSSUS_SHELTERS.some((s) =>
    [1, -1].some((sx) => {
      const u = SHELTER_SIZE.L + 2 * SHELTER_SIZE.T + SHELTER_SIZE.gap;
      const v = Math.max(SHELTER_SIZE.screen, SHELTER_SIZE.W + SHELTER_SIZE.T);
      const dx = Math.abs(p.x - sx * s.x);
      const dz = Math.abs(p.z - s.z);
      return s.along === 'x' ? dx <= u && dz <= v : dx <= v && dz <= u;
    }),
  );

describe('Colossus Yard: the map', () => {
  it('is registered for Brawl (not the objective modes), big, outdoor at sunrise', () => {
    const m = MAPS.find((x) => x.id === 'colossus-yard');
    expect(m?.name).toBe('Colossus Yard');
    expect(m?.competitive).toBe(false);
    expect(m?.brawl ?? true).toBe(true);
    const d = def();
    expect(d.name).toBe('Colossus Yard');
    // about 240 × 200 m (the piers reach out past the north edge)
    expect(d.boundsMax.x - d.boundsMin.x).toBeGreaterThanOrEqual(240);
    expect(d.boundsMax.z - d.boundsMin.z).toBeGreaterThanOrEqual(200);
    expect(d.outdoor?.sun).toBeDefined();
    expect(d.fog?.color).toBe(d.outdoor?.horizon);
    expect(d.towers).toEqual([]);
    expect(d.bombSites ?? []).toEqual([]);
    expect(d.powerups!.length).toBeGreaterThanOrEqual(4);
    expect(d.powerups!.length).toBeLessThanOrEqual(6);
  });

  it('stays within the box budget', () => {
    // a big map: large boxes, far scenery drawn one quad a face (lowDetail)
    const d = def();
    expect(d.boxes.length).toBeLessThan(1100);
    const far = d.boxes.filter((b) => Math.abs(b.c.y) > 100 || Math.abs(b.c.z) > 300);
    expect(far.length).toBeGreaterThan(0);
    for (const b of far) expect(b.lowDetail && b.noCollide).toBe(true);
  });

  it('is mirror-symmetric across x = 0 (teams swapped)', () => {
    const d = def();
    const boxes = new Set(
      d.boxes.map((b) => [b.c.x, b.c.y, b.c.z, b.h.x, b.h.y, b.h.z].map(key).join(',')),
    );
    for (const b of d.boxes) {
      if (b.q) continue;
      const m = [-b.c.x, b.c.y, b.c.z, b.h.x, b.h.y, b.h.z].map(key).join(',');
      expect(boxes.has(m), `mirror of box at ${b.c.x},${b.c.y},${b.c.z}`).toBe(true);
    }
    const ramps = d.boxes.filter((b) => b.q);
    expect(ramps.filter((b) => b.c.x > 0).length).toBe(ramps.filter((b) => b.c.x < 0).length);
    for (const s of d.spawns)
      expect(
        d.spawns.some(
          (o) =>
            o.team !== s.team && key(o.pos.x) === key(-s.pos.x) && key(o.pos.z) === key(s.pos.z),
        ),
      ).toBe(true);
    for (const w of d.waypoints!)
      expect(
        d.waypoints!.some((o) => key(o.pos.x) === key(-w.pos.x) && key(o.pos.z) === key(w.pos.z)),
      ).toBe(true);
    for (const p of d.launchPads!)
      expect(
        d.launchPads!.some((o) => key(o.min.x) === key(-p.max.x) && key(o.vel.x) === key(-p.vel.x)),
      ).toBe(true);
    for (const p of d.powerups!)
      expect(d.powerups!.some((o) => key(o.x) === key(-p.x) && key(o.z) === key(p.z))).toBe(true);
  });

  it('has no visible clipping (no two pieces of a different look cut into each other)', () => {
    const d = def();
    expect(findOverlaps(d).map((o) => describeOverlap(d, o))).toEqual([]);
  });

  it('follows the plan: floor where the plan has floor', () => {
    const lv = level();
    const H = C.hull;
    const Y = C.boomY;
    const places: [string, number, number, number][] = [
      ['north apron', -30, 0, -36],
      ['south apron', -30, 0, 38],
      ['freight band', -60, 0, -92.3],
      ['pier end', -80, 0, -110],
      ['keel hall', -30, 0, -6],
      ['deck 1', -30, H.deck1, 0],
      ['deck 2 gallery', -30, H.deck2, -12.7],
      ['spine deck', -30, H.spine, 0],
      ['gantry boom', -20, Y, -68],
      ['gantry trolley', 0, Y, -64],
      ['hammerhead boom', -50, Y, 68],
      ['scaffold top', -29, H.spine, -20],
      ['container top (1 high)', -84, 2.6, -77.5],
      ['container top (2 high)', -81.5, 5.2, -56.75],
      ['hangar', -80, 0, 0],
    ];
    for (const [name, x, y, z] of places)
      for (const sx of [1, -1]) {
        const p = v3(sx * x, y, z);
        expect(floorUnder(lv, p), name).toBeCloseTo(y, 3);
        expect(capsuleOverlaps(lv, standing(p)), name).toBe(false);
      }
  });

  it('keeps every ramp at 30° or less', () => {
    const d = def();
    const slopes: number[] = [];
    for (const b of d.boxes) {
      if (!b.q || b.noCollide) continue;
      if (b.prism !== undefined) slopes.push((Math.atan2(2 * b.h.y, 2 * b.h.z) * 180) / Math.PI);
      else {
        const q = b.q;
        const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
        slopes.push((Math.acos(Math.min(1, upY)) * 180) / Math.PI);
      }
    }
    expect(slopes.length).toBeGreaterThan(40);
    for (const s of slopes) expect(s).toBeLessThanOrEqual(30);
  });
});

describe('Colossus Yard: spawns', () => {
  it('has 32 valid spawns: 16 per team, each on its own half', () => {
    const d = def();
    const lv = level();
    expect(d.spawns.length).toBe(32);
    for (const team of [0, 1] as const) {
      const own = d.spawns.filter((s) => s.team === team);
      expect(own.length).toBe(16);
      for (const s of own) {
        expect(team === 0 ? s.pos.x < 0 : s.pos.x > 0).toBe(true);
        expect(capsuleOverlaps(lv, standing(s.pos)), `spawn ${s.pos.x},${s.pos.z}`).toBe(false);
        expect(floorUnder(lv, s.pos)).toBeCloseTo(s.pos.y, 3);
      }
    }
  });

  it('spreads the spawns over the whole yard', () => {
    const d = def();
    let minGap = Infinity;
    for (const s of d.spawns)
      for (const o of d.spawns) if (o !== s) minGap = Math.min(minGap, len(sub(o.pos, s.pos)));
    expect(minGap).toBeGreaterThanOrEqual(15);
    // every part of the yard has spawns: each quarter of each half
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        for (const [x0, x1] of [
          [0, 60],
          [60, 120],
        ])
          expect(
            d.spawns.filter(
              (s) =>
                Math.sign(s.pos.x) === sx &&
                Math.sign(s.pos.z) === sz &&
                Math.abs(s.pos.x) >= x0 &&
                Math.abs(s.pos.x) < x1,
            ).length,
          ).toBeGreaterThanOrEqual(2);
  });

  it('no spawn is in view from anywhere outside its shelter', () => {
    const lv = level();
    const eyes = lv.def.spawns.map((s) => v3(s.pos.x, s.pos.y + 1.7, s.pos.z));
    // the long lanes and the high ground by name...
    const Y = C.boomY + 1.7;
    const S = C.hull.spine + 1.7;
    const named: Vec3[] = [];
    for (const sx of [1, -1]) {
      for (let x = 0; x <= 38; x += 4) named.push(v3(sx * x, Y, -68)); // the gantry boom
      for (let x = 38; x <= 80; x += 4) named.push(v3(sx * x, Y, 68)); // the hammerheads
      for (let x = 0; x <= 48; x += 4) named.push(v3(sx * x, S, 0)); // the spine
      for (let x = 0; x <= 112; x += 8) {
        named.push(v3(sx * x, 1.7, -92.3)); // the freight line
        named.push(v3(sx * x, 1.7, 92.3));
      }
      for (let x = 0; x <= 96; x += 8) {
        named.push(v3(sx * x, 1.7, -36)); // the aprons
        named.push(v3(sx * x, 1.7, 38));
      }
      named.push(v3(sx * 80, 1.7, -110)); // the piers
      named.push(v3(sx * 72, 1.7, 0)); // in front of the hangars
    }
    expect(named.filter(inShelter)).toEqual([]);
    for (const l of named)
      for (const e of eyes)
        expect(lineOfSight(lv, l, e), `${JSON.stringify(l)} sees ${JSON.stringify(e)}`).toBe(false);
    // ...and every place anyone can stand, on a 3 m grid (every floor, stacked ones too)
    let checked = 0;
    for (let x = -118; x <= 118; x += 3)
      for (let z = -112; z <= 98; z += 3) {
        let y = 30;
        for (let k = 0; k < 4; k++) {
          const h = raycast(lv, v3(x, y, z), v3(0, -1, 0), 50);
          if (!h || h.point.y < -1) break;
          y = h.point.y - 2.2;
          const p = v3(x, h.point.y + 1.7, z);
          if (inShelter(p)) continue;
          checked++;
          for (const e of eyes)
            if (lineOfSight(lv, p, e)) expect.fail(`${x},${p.y},${z} sees a spawn`);
        }
      }
    expect(checked).toBeGreaterThan(5000);
  });

  it('every shelter has two ways out (a door at each end, round the screens)', () => {
    const d = def();
    const wps = d.waypoints!;
    const far = wpIndex(d, 'bmM'); // the gantry's trolley, across the map for everyone
    for (const s of COLOSSUS_SHELTERS)
      for (const side of ['W', 'E']) {
        for (const door of ['g0', 'g1']) {
          const i = wpIndex(d, `${s.name}${door}${side}`);
          expect(waypointRoute(wps, i, far).length, `${s.name}${door}${side}`).toBeGreaterThan(0);
        }
        // the two doors lead out different ways (never through the room)
        const g0 = wpIndex(d, `${s.name}g0${side}`);
        const g1 = wpIndex(d, `${s.name}g1${side}`);
        expect(wps[g0].links).not.toContain(g1);
      }
  });
});

describe('Colossus Yard: edge, pads, rails', () => {
  const run = (from: Vec3, yaw: number, ticks: number, buttons = Btn.Forward) => {
    const { config, ctx, world } = sim();
    const p = addPlayer(world, createPlayer(1, 0, from, yaw, config));
    const track: Vec3[] = [];
    for (let t = 0; t < ticks && p.alive; t++) {
      step(world, { 1: { tick: world.tick + 1, buttons, view: yawToView(yaw) } }, ctx);
      track.push({ ...p.pos });
    }
    return { p, track };
  };

  it('walking off a pier into the void kills; the glass screen keeps you on the platform', () => {
    // yaw 0 faces -z: north, out along the pier and off its open end
    const off = run(v3(-80, 0, -104), 0, 240);
    expect(off.p.alive).toBe(false);
    expect(off.track.some((q) => q.y < C.killY + 2)).toBe(true);
    // sprinting at the edge anywhere else: the blast screen stops you
    for (const [from, yaw] of [
      [v3(-40, 0, -95), 0],
      [v3(-110, 0, 20), 90],
      [v3(40, 0, 95), 180],
    ] as const) {
      const r = run(from, yaw, 180);
      expect(r.p.alive).toBe(true);
      expect(Math.abs(r.p.pos.x)).toBeLessThan(C.halfX);
      expect(Math.abs(r.p.pos.z)).toBeLessThan(C.halfZ);
    }
  });

  it('each launch pad throws you onto a crane boom (and the landing never hurts)', () => {
    const d = def();
    expect(d.launchPads!.length).toBe(4);
    for (const pad of d.launchPads!) {
      for (const f of [0.1, 0.5, 0.9]) {
        const { config, ctx, world } = sim();
        const from = v3(
          pad.min.x + 0.1 + f * (pad.max.x - pad.min.x - 0.2),
          0,
          (pad.min.z + pad.max.z) / 2,
        );
        const p = addPlayer(world, createPlayer(1, 0, from, 0, config));
        for (let t = 0; t < 240; t++) step(world, {}, ctx);
        expect(p.grounded).toBe(true);
        expect(p.hp).toBe(config.combat.maxHp);
        expect(p.pos.y - config.movement.standHeight / 2).toBeCloseTo(C.boomY, 1);
        // on a boom deck: the gantry's (z -69.5..-66.5) or a hammerhead's (z 66.5..69.5)
        expect(Math.abs(p.pos.z)).toBeGreaterThan(66.5);
        expect(Math.abs(p.pos.z)).toBeLessThan(69.5);
      }
    }
  });

  it('the zip-rail between the hammerheads carries you across the south yard', () => {
    const { config, ctx, world } = sim();
    const R = C.craneRail;
    // jump from the west boom's inner tip, looking east (yaw -90 faces +x)
    const p = addPlayer(world, createPlayer(1, 0, v3(-R.x + 0.4, C.boomY, R.z), -90, config));
    let rode = false;
    for (let t = 0; t < 60 * 8; t++) {
      const buttons = t < 3 ? Btn.Jump : 0;
      step(world, { 1: { tick: world.tick + 1, buttons, view: yawToView(-90) } }, ctx);
      if (p.rail) rode = true;
    }
    expect(rode).toBe(true);
    expect(p.alive).toBe(true);
    expect(p.pos.x).toBeGreaterThan(R.x - 3);
    expect(p.pos.y - config.movement.standHeight / 2).toBeCloseTo(C.boomY, 1);
  });

  it('the freight line: jump for its zip-rail from a flatcar, not by walking over one', () => {
    const railZ = (C.band.inner + C.band.outer) / 2;
    // walking across a flatcar (1.2 m, vaulted) under the rail doesn't catch it
    const walk = run(v3(-60, 0, -railZ + 3), 0, 120);
    expect(walk.p.rail).toBeNull();
    // standing on a flatcar and jumping does
    const { config, ctx, world } = sim();
    const p = addPlayer(world, createPlayer(1, 0, v3(-60, 1.2, -railZ), -90, config));
    let rode = false;
    for (let t = 0; t < 60; t++) {
      const buttons = t < 3 ? Btn.Jump : 0;
      step(world, { 1: { tick: world.tick + 1, buttons, view: yawToView(-90) } }, ctx);
      if (p.rail) rode = true;
    }
    expect(rode).toBe(true);
  });
});

describe('Colossus Yard: waypoints and bots', () => {
  it('waypoints sit in open space over floor, off the pads, and all connect', () => {
    const lv = level();
    const wps = lv.def.waypoints!;
    expect(wps.length).toBeGreaterThan(300);
    for (const w of wps) {
      expect(
        capsuleOverlaps(lv, { center: w.pos, up: v3(0, 1, 0), halfSeg: 0, radius: 0.3 }),
        `waypoint ${w.name}`,
      ).toBe(false);
      expect(floorUnder(lv, w.pos, 2.5), `waypoint ${w.name}`).toBeCloseTo(w.pos.y - 1, 1);
      for (const p of lv.def.launchPads!)
        expect(
          w.pos.x > p.min.x - 0.5 &&
            w.pos.x < p.max.x + 0.5 &&
            w.pos.z > p.min.z - 0.5 &&
            w.pos.z < p.max.z + 0.5,
          `waypoint ${w.name} on a launch pad`,
        ).toBe(false);
    }
    // every node reaches every other one (links go both ways)
    for (let i = 0; i < wps.length; i++)
      expect(waypointRoute(wps, 0, i).length, wps[i].name).toBeGreaterThan(0);
    for (const w of wps) for (const j of w.links) expect(wps[j].links).toContain(wps.indexOf(w));
  });

  it('every link is a walk: sight, floor all the way, no step higher than a stair', () => {
    const lv = level();
    const wps = lv.def.waypoints!;
    const floorAt = (x: number, y: number, z: number) =>
      raycast(lv, v3(x, y, z), v3(0, -1, 0), 4.5)?.point.y ?? null;
    wps.forEach((w, i) =>
      w.links.forEach((j) => {
        if (j < i) return;
        const a = w.pos;
        const b = wps[j].pos;
        const name = `${w.name} → ${wps[j].name}`;
        expect(lineOfSight(lv, a, b), name).toBe(true);
        const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.4));
        let prev = a.y - 1;
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const x = a.x + (b.x - a.x) * t;
          const z = a.z + (b.z - a.z) * t;
          const f = floorAt(x, prev + 1.6, z);
          expect(f, `${name}: floor at ${x.toFixed(1)},${z.toFixed(1)}`).not.toBeNull();
          expect(
            Math.abs(f! - prev),
            `${name}: step at ${x.toFixed(1)},${z.toFixed(1)}`,
          ).toBeLessThan(0.45);
          expect(
            capsuleOverlaps(lv, standing(v3(x, f!, z), 0.36)),
            `${name}: squeeze at ${x.toFixed(1)},${z.toFixed(1)}`,
          ).toBe(false);
          for (const p of lv.def.launchPads!)
            expect(
              x > p.min.x - 0.3 && x < p.max.x + 0.3 && z > p.min.z - 0.3 && z < p.max.z + 0.3,
              `${name} crosses a launch pad`,
            ).toBe(false);
          prev = f!;
        }
      }),
    );
  });

  // a bot walks to the high places by stairs only (bots never use the pads or the rails)
  const goals = ['bmM', 'bm2W', 'hb1E', 'hb2W', 'spM', 'sp2E', 'r1topW', 'r3topE', 'pr2W', 'sy13E'];
  it.each(goals)('a bot walks from both ends of the yard to %s', (goal) => {
    const d = def();
    const g = wpPos(d, goal);
    for (const si of [0, 31]) {
      const { config, ctx, world } = sim(d);
      const s = d.spawns[si];
      const p = addPlayer(world, createPlayer(1, 0, s.pos, s.yawDeg, config));
      const mem = createBotMemory(1, BOT_SKILLS.normal, 9);
      mem.objective = v3(g.x, g.y - 1, g.z);
      mem.objectiveFirst = true;
      let arrived = false;
      for (let t = 0; t < 60 * 90 && !arrived; t++) {
        step(world, { 1: botThink(world, ctx, p, mem) }, ctx);
        arrived =
          Math.hypot(p.pos.x - g.x, p.pos.z - g.z) < 2.5 &&
          Math.abs(p.pos.y - 0.9 - (g.y - 1)) < 1.2;
      }
      expect(arrived, `from spawn ${si}`).toBe(true);
    }
  });
});

describe('Colossus Yard: Brawl', () => {
  const brawl = (variant: BrawlVariant, n: number, seed: number) => {
    const { config, ctx, world } = sim(def(), seed);
    if (variant === 'ffa') ctx.ffa = true;
    const spawns = ctx.level.def.spawns;
    for (let i = 0; i < n; i++) {
      const team = (i % 2) as 0 | 1;
      const s = spawns.find((sp) => sp.team === team)!;
      addPlayer(world, createPlayer(i + 1, team, s.pos, s.yawDeg, config));
    }
    const bs = createBrawl(variant);
    startBrawl(bs, world, ctx);
    return { config, ctx, world, bs };
  };

  it('a TDM start puts each team on its own half; FFA spreads everyone over the yard', () => {
    const t = brawl('tdm', 10, 4);
    for (const p of t.world.players) expect(p.team === 0 ? p.pos.x < 0 : p.pos.x > 0).toBe(true);
    const f = brawl('ffa', 10, 4);
    const spots = new Set(
      f.world.players.map((p) => `${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)}`),
    );
    expect(spots.size).toBe(10);
    for (const p of f.world.players)
      for (const q of f.world.players)
        if (p !== q) expect(len(sub(p.pos, q.pos))).toBeGreaterThan(15);
  });

  it('respawns far from the enemies (and out of their sight)', () => {
    const w = brawl('tdm', 10, 7);
    const me = w.world.players.find((p) => p.team === 0)!;
    const foes = w.world.players.filter((p) => isEnemy(w.ctx, p, me));
    const west = w.ctx.level.def.spawns.filter((s) => s.team === 0);
    foes.forEach((f, i) => {
      const s = west[(i * 3) % west.length];
      f.pos = v3(s.pos.x, 0.9, s.pos.z);
    });
    for (let k = 0; k < 20; k++) {
      const s = brawlSafeSpawn(w.bs, w.world, w.ctx, me);
      expect(Math.min(...foes.map((f) => len(sub(f.pos, s.pos))))).toBeGreaterThan(35);
    }
  });

  it('an 8-bot free-for-all: kills happen all over the yard, nobody is killed at spawn', () => {
    const { ctx, world, bs } = brawl('ffa', 8, 11);
    const mems = world.players.map((p) => createBotMemory(p.id, BOT_SKILLS.normal, p.id * 13));
    const spawnedAt = new Map(world.players.map((p) => [p.id, 0]));
    const alive = new Map(world.players.map((p) => [p.id, true]));
    const lives: number[] = [];
    const deathSpots: Vec3[] = [];
    for (let t = 0; t < 60 * 90; t++) {
      applyBrawlBotObjectives(bs, world, ctx, mems);
      const inputs: Record<number, PlayerInput> = {};
      for (const m of mems)
        inputs[m.id] = botThink(
          world,
          ctx,
          world.players.find((p) => p.id === m.id)!,
          m,
        );
      step(world, inputs, ctx);
      for (const e of world.events)
        if (e.type === 'kill') {
          lives.push((world.tick - spawnedAt.get(e.victim)!) * TICK_DT);
          deathSpots.push({ ...world.players.find((p) => p.id === e.victim)!.pos });
        }
      updateBrawl(bs, world, ctx);
      for (const p of world.players) {
        if (p.alive && !alive.get(p.id)) spawnedAt.set(p.id, world.tick);
        alive.set(p.id, p.alive);
      }
    }
    expect(bs.phase).toBe('live');
    const kills = world.players.reduce((n, p) => n + p.kills, 0);
    expect(kills).toBeGreaterThanOrEqual(10);
    // nobody dies within the spawn protection (and a moment after it)
    expect(Math.min(...lives)).toBeGreaterThan(BRAWL_DEFAULTS.protectSec + 0.5);
    // the fights spread out: deaths in both halves and both the north and the south
    expect(deathSpots.some((q) => q.x < 0) && deathSpots.some((q) => q.x > 0)).toBe(true);
    expect(deathSpots.some((q) => q.z < 0) && deathSpots.some((q) => q.z > 0)).toBe(true);
  });
});
