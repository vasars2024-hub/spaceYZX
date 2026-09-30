// Stormglass (docs/NEW-MAPS.md, docs/maps/stormglass.md): two bastions of rooms on three floors
// (the undercroft, the deck, the instrument floor) over The Eye, a floorless middle crossed by the
// Glass Bridge (north, into the Lens: site A) with the Cable Duct under it (into the crypt, up the
// pit), the Broken Span (south, a running jump over the Sag: site B) with the Pipe Gallery under
// it, and the Anemometer (centre: pads, zip-rails, catwalks, the perch).
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
  csConfig,
  defaultConfig,
  describeOverlap,
  findOverlaps,
  lineOfSight,
  MAPS,
  raycast,
  startMatch,
  step,
  TICK_DT,
  updateMatch,
  v3,
  waypointRoute,
  withSkyArena,
  yawToView,
  type BotMemory,
  type GameConfig,
  type LevelDef,
  type PlayerInput,
  type SimContext,
  type SimEvent,
  type Vec3,
} from '../src/index';
import { buildStormglass, STORMGLASS } from '../src/level/maps/stormglass';

// (the registry flips the map to competitive when it is released; test it the way matches see it)
let cached: LevelDef | null = null;
const def = (): LevelDef => (cached ??= withSkyArena(buildStormglass()));
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
const feetY = (p: { pos: Vec3 }, config: GameConfig) => p.pos.y - config.movement.standHeight / 2;

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

const sim = (d: LevelDef = def(), config: GameConfig = defaultConfig()) => {
  const lv = buildLevel(d);
  const ctx: SimContext = { level: lv, config, dt: TICK_DT };
  return { lv, config, ctx, world: createWorld(lv, 3) };
};

/** yaw (degrees) that faces from a toward b (yaw 0 faces -z, 90 faces -x) */
const yawTo = (a: Vec3, b: Vec3) => (Math.atan2(-(b.x - a.x), -(b.z - a.z)) * 180) / Math.PI;

describe('Stormglass map', () => {
  it('is registered; outdoor at violet dusk, 150 × 110 m, in the box budget', () => {
    expect(MAPS.find((m) => m.id === 'stormglass')).toBeDefined();
    const d = def();
    expect(d.name).toBe('Stormglass');
    expect(d.boundsMax.x - d.boundsMin.x).toBe(150);
    expect(d.boundsMax.z - d.boundsMin.z).toBe(110);
    expect(d.outdoor?.sun).toBeDefined();
    expect(d.fog?.color).toBe(d.outdoor?.horizon);
    expect(d.boxes.length).toBeLessThan(1500);
    // the cloud sea and its lightning far below
    expect(d.boxes.some((b) => b.mat === 'cloud' && b.c.y < STORMGLASS.killY - 20)).toBe(true);
    expect(d.boxes.some((b) => b.mat === 'glow' && b.c.y < STORMGLASS.killY - 10)).toBe(true);
  });

  it('is mirror-symmetric across x = 0 (the registry can flag it `symmetric`)', () => {
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
    for (const t of d.towers)
      expect(d.towers.some((o) => o.team !== t.team && key(o.pos.x) === key(-t.pos.x))).toBe(true);
    for (const w of d.waypoints!)
      expect(
        d.waypoints!.some((o) => key(o.pos.x) === key(-w.pos.x) && key(o.pos.z) === key(w.pos.z)),
      ).toBe(true);
    for (const list of [d.launchPads!, d.killVolumes!, d.bombSites!])
      for (const p of list)
        expect(
          (list as { min: Vec3; max: Vec3 }[]).some(
            (o) => key(o.min.x) === key(-p.max.x) && key(o.max.x) === key(-p.min.x),
          ),
        ).toBe(true);
    for (const r of d.rails)
      expect(
        d.rails.some((o) =>
          o.points.every(
            (p, i) => key(p.x) === key(-r.points[i].x) && key(p.z) === key(r.points[i].z),
          ),
        ),
      ).toBe(true);
    // A on the north crossing, B on the south one, both on the middle line
    const A = d.bombSites!.find((s) => s.name === 'A')!;
    const B = d.bombSites!.find((s) => s.name === 'B')!;
    expect(A.max.z).toBeLessThan(0);
    expect(B.min.z).toBeGreaterThan(0);
    for (const p of d.powerups!) expect(p.x).toBe(0);
  });

  it('has no visible clipping (no two pieces of a different look cut into each other)', () => {
    const d = def();
    expect(findOverlaps(d).map((o) => describeOverlap(d, o))).toEqual([]);
  });

  it('follows the plan: floor where the plan has ground, on all three floors', () => {
    const lv = level();
    const S = STORMGLASS;
    const U = S.floors.under;
    const F5 = S.floors.upper;
    const places: [string, number, number, number][] = [
      ['courtyard', 62, 0, 6],
      ['front hall', 50, 0, 0],
      ['gate bay', 41, 0, 0],
      ['north corridor', 52.5, 0, -17],
      ['pad bay', 42.5, 0, -13.5],
      ['bridgehead', 44.5, 0, -28],
      ['north hall', 52.5, 0, -29],
      ['south hall', 52.5, 0, 29],
      ['keep passage', 59.5, 0, -15],
      ['dome gallery', 53, F5, -30],
      ['radio room', 53, F5, 30],
      ['upper corridor', 52.5, F5, 17],
      ['instrument deck', 51, F5, 0],
      ['north vault', 45.5, U, -28.5],
      ['south vault', 45.5, U, 28.5],
      ['cistern', 45, U, 0],
      ['keep cellar', 62, U, 0],
      ['hatch', 61, U, 19.5],
      ['Cable Duct', 20.5, U, -32],
      ['crypt', 4.5, U, -32],
      ['Pipe Gallery', 22, U, 32],
      ['Glass Bridge', 22, 0, -32],
      ['the Lens (A)', 6, 0, -35],
      ['Broken Span', 20, 0, 32.2],
      ['span lip', 3, 0, 32],
      ['the Sag (B)', 3, S.sag.y, 38],
      ['the Anemometer', 7, S.disc.y, -5],
      ['the perch', 2, S.perch.y, 1.5],
      ['catwalk', 24, 3, 0],
      ['hop shard 1', 30, 2, -10.75],
      ['lookout top', 37.25, 2.6, -10.75],
    ];
    for (const [name, x, y, z] of places)
      for (const xx of [x, -x]) {
        expect(raycast(lv, v3(xx, y + 1, z), v3(0, -1, 0), 2)?.point.y, name).toBeCloseTo(y, 3);
        expect(capsuleOverlaps(lv, standingCapsule(v3(xx, y, z))), name).toBe(false);
      }
    // the undercroft and the lower rooms are roofed: no sky over them
    for (const [name, x, y, z] of places.filter(([, , y]) => y < 0 || y === F5))
      expect(raycast(lv, v3(x, y + 1, z), v3(0, 1, 0), 40), name).not.toBeNull();
  });

  it('The Eye has no floor: from its air you fall into the kill volume', () => {
    const lv = level();
    const S = STORMGLASS;
    const kill = def().killVolumes![0];
    expect(kill.max.y).toBe(S.killY);
    // the kill volume covers the whole map (and more) below the Sag
    expect(kill.min.x).toBeLessThan(def().boundsMin.x);
    expect(kill.max.x).toBeGreaterThan(def().boundsMax.x);
    expect(kill.min.z).toBeLessThan(def().boundsMin.z);
    expect(kill.max.z).toBeGreaterThan(def().boundsMax.z);
    expect(kill.max.y).toBeLessThan(S.sag.y - 3);
    for (const [x, z] of [
      [22, -22],
      [28, 20],
      [10, -47],
      [30, 45],
      [20, -8],
      [0, -48],
      [18, 0.2 + S.catwalk.width],
    ])
      for (const xx of [x, -x])
        expect(raycast(lv, v3(xx, 3, z), v3(0, -1, 0), 3 - S.killY), `${xx}, ${z}`).toBeNull();
  });

  it('has 8 valid spawns per team in three detached groups, Towers, sites with floor, the power-up', () => {
    const d = def();
    const lv = level();
    const S = STORMGLASS;
    // [group, x0, x1, y, z0, z1] (east; the west team mirrored)
    const areas: [string, number, number, number, number, number][] = [
      ['gallery', 47, 60, S.floors.upper, -40, -26],
      ['keep', S.courtyard.x0, S.courtyard.x1, 0, S.courtyard.z0, S.courtyard.z1],
      ['hatch', 56, 68, S.floors.under, 14, 25],
    ];
    for (const team of [0, 1] as const) {
      const spawns = d.spawns.filter((s) => s.team === team);
      expect(spawns.length).toBe(8);
      expect(new Set(spawns.map((s) => s.group))).toEqual(new Set(areas.map(([g]) => g)));
      for (const s of spawns) {
        expect(capsuleOverlaps(lv, standingCapsule(s.pos))).toBe(false);
        expect(
          raycast(lv, v3(s.pos.x, s.pos.y + 1, s.pos.z), v3(0, -1, 0), 2)?.point.y,
        ).toBeCloseTo(s.pos.y, 3);
        const [, x0, x1, y, z0, z1] = areas.find(([g]) => g === s.group)!;
        const x = team === 1 ? s.pos.x : -s.pos.x;
        expect(x > x0 && x < x1 && s.pos.z > z0 && s.pos.z < z1, `${s.group}`).toBe(true);
        expect(s.pos.y).toBe(y);
        // facing the Eye
        expect(s.yawDeg).toBe(team === 0 ? -90 : 90);
      }
      for (const [g] of areas)
        expect(spawns.filter((s) => s.group === g).length).toBeGreaterThanOrEqual(2);
      const t = d.towers.find((x) => x.team === team)!;
      expect(Math.sign(t.pos.x)).toBe(team === 0 ? -1 : 1);
      const w = wpPos(d, team === 0 ? 'towerW' : 'towerE');
      expect(Math.hypot(w.x - t.pos.x, w.z - t.pos.z)).toBeLessThan(
        t.radius + defaultConfig().rules.towerTouchRadius + 0.5,
      );
      expect(Math.sign(d.controllerHomes![team].x)).toBe(team === 0 ? -1 : 1);
    }
    for (const s of d.bombSites!) {
      const c = v3((s.min.x + s.max.x) / 2, s.min.y + 1, (s.min.z + s.max.z) / 2);
      expect(raycast(lv, c, v3(0, -1, 0), 2)?.point.y).toBeCloseTo(s.min.y, 3);
      expect(capsuleOverlaps(lv, standingCapsule(v3(c.x, s.min.y, c.z)))).toBe(false);
      // enclosed: a roof over the site
      expect(raycast(lv, c, v3(0, 1, 0), 30), `site ${s.name} roof`).not.toBeNull();
      expect((s.max.x - s.min.x) * (s.max.z - s.min.z)).toBeGreaterThan(60);
    }
    // the power-up floats over the perch, the highest ground
    const [pu] = d.powerups!;
    expect(d.powerups!.length).toBe(1);
    expect(raycast(lv, pu, v3(0, -1, 0), 2)?.point.y).toBeCloseTo(STORMGLASS.perch.y, 3);
  });

  it('every spawn group has two exits: block either one and bots still get out', () => {
    const d = def();
    // [the group's own waypoint, its two exits] (east)
    const groups: [string, string, string][] = [
      ['galNE', 'stairTopNE', 'uCorrN0E'],
      ['towerE', 'doorE', 'yardNE'],
      ['hatchE', 'hTun3E', 'hatchNE'],
    ];
    for (const [from, a, c] of groups)
      for (const shut of [a, c]) {
        const dd = withBlocked(d, [shut]);
        for (const goal of ['siteA', 'siteB', 'dE'])
          expect(
            waypointRoute(dd.waypoints!, wpIndex(dd, from), wpIndex(dd, goal)).length,
            `${from} → ${goal} with ${shut} shut`,
          ).toBeGreaterThan(0);
      }
    // (the keep's third exit: the south yard)
    expect(wpIndex(d, 'yardSE')).toBeGreaterThanOrEqual(0);
  });

  it('the bomb sites each have entrances from both teams, over and under the Eye', () => {
    const d = def();
    const wps = d.waypoints!;
    const into = (site: string) =>
      wps[wpIndex(d, site)].links.map((j) => wps[j].name!).sort();
    // A: the two bridge doors and the stair pit up from the crypt
    expect(into('siteA')).toEqual(['lensE', 'lensW', 'pitTop'].sort());
    // B: the two span ramps and the two Pipe Gallery mouths
    expect(into('siteB')).toEqual(['sagFootE', 'sagFootW', 'sagInE', 'sagInW'].sort());
  });

  it('waypoints sit in open space above the void, links have line of sight, all reachable', () => {
    const lv = level();
    const wps = lv.def.waypoints!;
    for (const w of wps) {
      expect(
        capsuleOverlaps(lv, { center: w.pos, up: v3(0, 1, 0), halfSeg: 0, radius: 0.3 }),
        `waypoint ${w.name}`,
      ).toBe(false);
      // standing on something (not over the void)
      expect(raycast(lv, w.pos, v3(0, -1, 0), 1.5), `floor under ${w.name}`).not.toBeNull();
      for (const j of w.links) {
        expect(lineOfSight(lv, w.pos, wps[j].pos), `link ${w.name} → ${wps[j].name}`).toBe(true);
        // ground all along every link (bots never walk over the void)
        for (let t = 0.1; t < 1; t += 0.1) {
          const p = v3(
            w.pos.x + (wps[j].pos.x - w.pos.x) * t,
            w.pos.y + (wps[j].pos.y - w.pos.y) * t,
            w.pos.z + (wps[j].pos.z - w.pos.z) * t,
          );
          expect(
            raycast(lv, p, v3(0, -1, 0), 2.5),
            `link ${w.name} → ${wps[j].name}`,
          ).not.toBeNull();
        }
      }
      for (const p of lv.def.launchPads ?? [])
        expect(
          w.pos.x >= p.min.x - 0.4 &&
            w.pos.x <= p.max.x + 0.4 &&
            w.pos.z >= p.min.z - 0.4 &&
            w.pos.z <= p.max.z + 0.4,
          `waypoint ${w.name} on a launch pad`,
        ).toBe(false);
    }
    for (const from of ['towerE', 'towerW'])
      for (let i = 0; i < wps.length; i++)
        expect(
          waypointRoute(wps, wpIndex(lv.def, from), i).length,
          `${from} → ${wps[i].name}`,
        ).toBeGreaterThan(0);
    // the graph covers the lanes, the high ground, the sites and the power-up
    for (const n of ['gb1', 'lens', 'sp1', 'sagRampMid', 'cw2', 'd', 'd2a', 'pg2a', 'galN', 'hatch'])
      for (const s of ['E', 'W']) expect(wpIndex(lv.def, n + s)).toBeGreaterThanOrEqual(0);
    for (const n of ['siteA', 'siteB', 'perchS', 'discN', 'rampFoot', 'cryptMid', 'upDeckE'])
      expect(wpIndex(lv.def, n)).toBeGreaterThanOrEqual(0);
  });

  it('keeps every ramp at 30° or less', () => {
    const rotated = def().boxes.filter((b) => b.q && !b.noCollide);
    const tilted = rotated.filter((b) => Math.abs(b.q!.x) + Math.abs(b.q!.z) > 1e-9);
    // catwalks (2) and their railing bars (16); the stairs and ramps are wedges (unturned)
    expect(tilted.length).toBe(18);
    for (const b of rotated) {
      const q = b.q!;
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      expect((Math.acos(Math.min(1, upY)) * 180) / Math.PI).toBeLessThanOrEqual(30);
    }
  });

  it('cover is half (≤ 1.25 m) or full (≥ 2 m), nothing in between', () => {
    // standing pieces on the walkable floors: bastions, bridges, the Lens, the Sag, the perch
    const S = STORMGLASS;
    const floors = [0, S.floors.under, S.floors.upper, S.perch.y];
    for (const b of def().boxes) {
      if (b.noCollide || b.q) continue;
      const bottom = b.c.y - b.h.y;
      const h = 2 * b.h.y;
      if (!floors.some((f) => Math.abs(bottom - f) < 1e-6)) continue;
      if (b.h.x < 0.2 && b.h.z < 0.2) continue; // thin posts
      expect(h <= 1.25 || h >= 2, `box at ${b.c.x},${b.c.y},${b.c.z} is ${h} m tall`).toBe(true);
    }
  });

  it('no spawn is in view from the Eye, the enemy half or its own bastion front', () => {
    const lv = level();
    const S = STORMGLASS;
    for (const team of [0, 1] as const) {
      const s = team === 0 ? -1 : 1;
      const spawnPts = lv.def.spawns
        .filter((sp) => sp.team === team)
        .flatMap((sp) => [0.6, 1.6].map((h) => v3(sp.pos.x, sp.pos.y + h, sp.pos.z)));
      // every waypoint short of the spawn side's inner rooms (the Eye, the enemy bastion, and
      // its own front: bridgehead, pad bays, gate bay, vaults), at eye height ...
      const lookouts: Vec3[] = lv.def
        .waypoints!.filter((w) => s * w.pos.x < 45)
        .map((w) => v3(w.pos.x, w.pos.y + 0.6, w.pos.z));
      // ... and the high spots bots never walk: lookouts, launch towers, shards, the perch rim
      for (const z of [-1, 1]) {
        lookouts.push(
          v3(s * 37.25, 2.6 + 1.6, z * 10.75),
          v3(s * 40, 2.6 + 1.6, z * 16.5),
          v3(-s * 37.25, 2.6 + 1.6, z * 10.75),
          v3(-s * 40, 2.6 + 1.6, z * 16.5),
          v3(0, S.perch.y + 1.6, z * 2.5),
          v3(2.5, S.perch.y + 1.6, z * 2.5),
          v3(-2.5, S.perch.y + 1.6, z * 2.5),
        );
        for (const [x0, z0, x1, z1, top] of [...S.shards, ...S.dropShards])
          for (const sx of [-1, 1])
            lookouts.push(v3((sx * (x0 + x1)) / 2, top + 1.6, (z * (z0 + z1)) / 2));
      }
      for (const l of lookouts)
        for (const p of spawnPts)
          expect(lineOfSight(lv, l, p), `${JSON.stringify(l)} sees ${JSON.stringify(p)}`).toBe(
            false,
          );
    }
  });
});

describe('Stormglass: the Eye, the pads, the rails, the Broken Span', () => {
  it('falling into the Eye kills; the crossings, the Lens, the Sag and the Anemometer hold', () => {
    const { config, ctx, world } = sim();
    const S = STORMGLASS;
    const fallers = [
      v3(20, 1, -20),
      v3(-20, 1, 20),
      v3(22, 1, -22),
      v3(30, 1, -45),
      v3(-15, 7, 0.2 + S.catwalk.width),
    ].map((p, i) => addPlayer(world, createPlayer(10 + i, 0, p, 0, config)));
    const safe: [Vec3, number][] = [
      [v3(22, 0.5, -32), 0],
      [v3(0, 0.5, -32), 0],
      [v3(-20, 0.5, 32.2), 0],
      [v3(3, S.sag.y + 0.5, 38), S.sag.y],
      [v3(20.5, S.floors.under + 0.5, -32), S.floors.under],
      [v3(22, S.floors.under + 0.5, 32), S.floors.under],
      [v3(-7, S.disc.y + 0.5, 5), S.disc.y],
      [v3(0, S.perch.y + 0.5, 1.5), S.perch.y],
    ];
    const standing = safe.map(([p], i) => addPlayer(world, createPlayer(30 + i, 1, p, 0, config)));
    for (let t = 0; t < 60 * 4; t++) step(world, {}, ctx);
    for (const p of fallers) expect(p.alive, `player ${p.id}`).toBe(false);
    standing.forEach((p, i) => {
      expect(p.alive).toBe(true);
      expect(feetY(p, config)).toBeCloseTo(safe[i][1], 1);
    });
  });

  it('each launch pad throws you onto the Anemometer, unhurt', () => {
    const d = def();
    expect(d.launchPads!.length).toBe(4);
    for (const pad of d.launchPads!) {
      const { config, ctx, world } = sim();
      const c = v3((pad.min.x + pad.max.x) / 2, pad.min.y, (pad.min.z + pad.max.z) / 2);
      const p = addPlayer(world, createPlayer(1, 0, c, 0, config));
      const events: SimEvent[] = [];
      for (let t = 0; t < 60 * 4; t++) {
        step(world, {}, ctx);
        events.push(...world.events);
      }
      expect(events.filter((e) => e.type === 'launch').length).toBe(1);
      expect(p.alive).toBe(true);
      expect(p.hp).toBe(config.combat.maxHp);
      expect(p.grounded).toBe(true);
      expect(feetY(p, config)).toBeCloseTo(STORMGLASS.disc.y, 1);
      expect(Math.abs(p.pos.x)).toBeLessThan(8);
      expect(Math.abs(p.pos.z)).toBeLessThan(10);
    }
  });

  it('you climb a launch tower (hold jump against it) and the pad on top throws you', () => {
    const pad = def().launchPads!.find((p) => p.min.x > 0 && p.min.z > 0)!;
    const { config, ctx, world } = sim();
    const zc = (pad.min.z + pad.max.z) / 2;
    // on the terrace behind the tower, facing the Eye
    const p = addPlayer(world, createPlayer(1, 0, v3(pad.max.x + 2, 0, zc), 90, config));
    let launched = false;
    for (let t = 0; t < 60 * 5; t++) {
      const buttons = launched ? 0 : Btn.Forward | (t > 5 ? Btn.Jump : 0);
      step(world, { 1: { tick: world.tick + 1, buttons, view: yawToView(90) } }, ctx);
      launched ||= world.events.some((e) => e.type === 'launch');
    }
    expect(launched).toBe(true);
    expect(p.alive).toBe(true);
    expect(p.grounded).toBe(true);
    expect(feetY(p, config)).toBeCloseTo(STORMGLASS.disc.y, 1);
    // bots can't: the tower is taller than a jump and a vault (1.2 + 1.25 m)
    expect(pad.min.y).toBeGreaterThan(2.45);
  });

  it('a zip-rail carries you from the rim up onto the Anemometer, and back down', () => {
    for (const rail of def().rails) {
      const { config, ctx, world } = sim();
      const [a] = rail.points;
      const s = Math.sign(a.x);
      // stand under the rail's rim end, face the Eye, jump into it
      const p = addPlayer(world, createPlayer(1, 0, v3(a.x + s * 0.8, 0, a.z), 0, config));
      const yaw = s > 0 ? 90 : -90;
      let grabbed = false;
      for (let t = 0; t < 60 * 5; t++) {
        const buttons = t > 10 && t < 14 ? Btn.Jump : 0;
        step(world, { 1: { tick: world.tick + 1, buttons, view: yawToView(yaw) } }, ctx);
        grabbed ||= !!p.rail;
      }
      expect(grabbed).toBe(true);
      expect(p.alive).toBe(true);
      expect(p.grounded).toBe(true);
      expect(feetY(p, config)).toBeCloseTo(STORMGLASS.disc.y, 1);
      expect(Math.abs(p.pos.x)).toBeLessThan(STORMGLASS.disc.apothem - 1);
      // and back: jump into it at the Anemometer end facing home
      const e = rail.points[rail.points.length - 1];
      p.pos = v3(e.x - s * 0.8, STORMGLASS.disc.y + config.movement.standHeight / 2 + 0.01, e.z);
      p.vel = v3();
      grabbed = false;
      for (let t = 0; t < 60 * 5; t++) {
        const buttons = t > 10 && t < 14 ? Btn.Jump : 0;
        step(world, { 1: { tick: world.tick + 1, buttons, view: yawToView(-yaw) } }, ctx);
        grabbed ||= !!p.rail;
      }
      expect(grabbed).toBe(true);
      expect(p.alive).toBe(true);
      expect(p.grounded).toBe(true);
      expect(feetY(p, config)).toBeCloseTo(0, 1);
      expect(Math.abs(p.pos.x)).toBeGreaterThan(STORMGLASS.rimX);
    }
  });

  /** sprint from `from` toward -x (s = 1) or +x, jump at the lip; where do you end up? */
  const spanJump = (config: GameConfig, s: 1 | -1, jump: boolean) => {
    const { ctx, world } = sim(def(), config);
    const P = STORMGLASS.span;
    const p = addPlayer(world, createPlayer(1, 0, v3(s * 12, 0, 32.2), 0, config));
    const yaw = s > 0 ? 90 : -90;
    let jumped = false;
    for (let t = 0; t < 60 * 3; t++) {
      let buttons = Btn.Forward;
      // take off as late as you can: when the lip is under your leading edge
      if (jump && !jumped && p.grounded && s * p.pos.x < P.x0 + 0.25) {
        buttons |= Btn.Jump;
        jumped = true;
      }
      if (s * p.pos.x < -8) buttons = 0;
      step(world, { 1: { tick: world.tick + 1, buttons, view: yawToView(yaw) } }, ctx);
    }
    return { p, jumped };
  };

  it('the Broken Span: a sprinting jump clears the gap (normal and CS speed)', () => {
    const P = STORMGLASS.span;
    expect(2 * P.x0).toBeCloseTo(3.6, 6);
    for (const config of [defaultConfig(), csConfig(defaultConfig())])
      for (const s of [1, -1] as const) {
        const { p, jumped } = spanJump(config, s, true);
        expect(jumped).toBe(true);
        expect(p.alive).toBe(true);
        expect(feetY(p, config)).toBeCloseTo(0, 1);
        expect(s * p.pos.x).toBeLessThan(-P.x0);
      }
  });

  it('the Broken Span: running off the lip without a jump drops you into the Sag, alive', () => {
    const config = defaultConfig();
    const { p } = spanJump(config, 1, false);
    expect(p.alive).toBe(true);
    expect(feetY(p, config)).toBeCloseTo(STORMGLASS.sag.y, 1);
  });

  /**
   * A running jump from one surface to the next (one press at the edge, or at a wall you run
   * into; `hold`: keep Space held after it — a climb up the wall or rail, or the jetpack). Where
   * do you stand afterwards?
   */
  const hop = (from: Vec3, to: Vec3, hold: boolean, config = defaultConfig()) => {
    const { ctx, world } = sim(def(), config);
    const p = addPlayer(world, createPlayer(1, 0, from, 0, config));
    const yaw = yawTo(from, to);
    const dir = v3(to.x - from.x, 0, to.z - from.z);
    const l = Math.hypot(dir.x, dir.z);
    let jumped = false;
    for (let t = 0; t < 60 * 4; t++) {
      let buttons = Btn.Forward;
      // jump at the edge (no floor just ahead), or when a wall stops you
      const ahead = v3(p.pos.x + (dir.x / l) * 0.45, p.pos.y, p.pos.z + (dir.z / l) * 0.45);
      const edge = !raycast(ctx.level, ahead, v3(0, -1, 0), 1.3);
      const blocked = t > 20 && Math.hypot(p.vel.x, p.vel.z) < 0.5;
      if (!jumped && p.grounded && (edge || blocked)) {
        buttons |= Btn.Jump;
        jumped = true;
      } else if (jumped) {
        // steer the landing like a player: keep pushing while short of the spot, brake past it
        const left = ((to.x - p.pos.x) * dir.x + (to.z - p.pos.z) * dir.z) / l;
        if (left < 0) buttons = Btn.Back;
        if (hold && !p.grounded) buttons |= Btn.Jump;
      }
      if (jumped && p.grounded && Math.hypot(p.pos.x - to.x, p.pos.z - to.z) < 1) buttons = 0;
      step(world, { 1: { tick: world.tick + 1, buttons, view: yawToView(yaw) } }, ctx);
      if (!p.alive) break;
    }
    return { p, jumped };
  };

  it('the hop shards: climb the lookout, jump up the chain, climb over the Anemometer rail', () => {
    const config = defaultConfig();
    const LK = STORMGLASS.lookout;
    for (const sx of [1, -1])
      for (const sz of [1, -1]) {
        const tops = STORMGLASS.shards.map(([x0, z0, x1, z1, top]) =>
          v3((sx * (x0 + x1)) / 2, top, (sz * (z0 + z1)) / 2),
        );
        const lz = (sz * (LK.z0 + LK.z1)) / 2;
        const stops = [
          v3(sx * (LK.x1 + 3), 0, lz),
          v3((sx * (LK.x0 + LK.x1)) / 2, LK.y, lz),
          ...tops,
          v3(sx * 7, STORMGLASS.disc.y, sz * -3),
        ];
        for (let i = 1; i < stops.length; i++) {
          // a climb up the lookout, plain jumps up the shards, a climb over the handrail
          const climb = i === 1 || i === stops.length - 1;
          const { p, jumped } = hop(stops[i - 1], stops[i], climb, config);
          const at = `hop ${i} (${sx}, ${sz})`;
          expect(jumped, at).toBe(true);
          expect(p.alive, at).toBe(true);
          expect(p.grounded, at).toBe(true);
          expect(Math.abs(feetY(p, config) - stops[i].y), at).toBeLessThan(0.1);
          expect(Math.hypot(p.pos.x - stops[i].x, p.pos.z - stops[i].z), at).toBeLessThan(2.5);
        }
      }
  });

  it('handrails and the Anemometer lip keep a strafing player on', () => {
    const S = STORMGLASS;
    const cases: [string, Vec3, number][] = [
      ['Glass Bridge', v3(22, 0, -32), 0],
      ['catwalk', v3(24, 3, 0), 180],
      ['Lens pit rail', v3(3, 0, -26), -90],
      ['Sag balcony', v3(5, 0, 33), 180],
      ['Anemometer', v3(9, S.disc.y, -3), -90],
    ];
    for (const [name, at, yaw] of cases) {
      const { config, ctx, world } = sim();
      const p = addPlayer(world, createPlayer(1, 0, at, yaw, config));
      for (let t = 0; t < 60 * 3; t++)
        step(
          world,
          { 1: { tick: world.tick + 1, buttons: Btn.Forward, view: yawToView(yaw) } },
          ctx,
        );
      expect(p.alive, name).toBe(true);
      expect(feetY(p, config), name).toBeGreaterThan(at.y - 3);
    }
  });
});

describe('Stormglass bots', () => {
  const S = STORMGLASS;
  const disc = ['dE', 'dW'];
  const glass = ['gb1E', 'gb1W'];
  const span = ['sp1E', 'sp1W'];
  const duct = ['d2aE', 'd2aW'];
  const pipes = ['pg2aE', 'pg2aW'];
  /** [lane, waypoints closed (the other lanes), where the carrier crosses x = 0: z range] */
  const lanes: [string, string[], [number, number]][] = [
    ['catwalks over the Anemometer', [...glass, ...span, ...duct, ...pipes], [-12, 12]],
    ['Glass Bridge and the Lens', [...disc, ...span, ...duct, ...pipes], [-42, -22]],
    ['Cable Duct and the crypt', [...disc, ...span, ...glass, ...pipes], [-42, -22]],
    ['Broken Span and the Sag', [...disc, ...glass, ...duct, ...pipes], [23, 44]],
    ['Pipe Gallery and the Sag', [...disc, ...glass, ...duct, ...span], [23, 44]],
  ];
  it.each(lanes.flatMap(([n, b, z]) => ([0, 1] as const).map((team) => [n, team, b, z] as const)))(
    'a bot carries the Controller to the enemy Tower via the %s (team %i)',
    (_name, team, blocked, [z0, z1]) => {
      const { lv, config, ctx, world } = sim(withBlocked(def(), [...blocked]));
      const s = lv.def.spawns.find((sp) => sp.team === team)!;
      addPlayer(world, createPlayer(1, team, s.pos, s.yawDeg, config));
      const mem = createBotMemory(1, BOT_SKILLS.normal, 5);
      const ms = createMatch('1v1');
      startMatch(ms, world, ctx);
      let fell = false;
      const crossedAt: number[] = [];
      for (let t = 0; t < 60 * 60 && ms.phase !== 'roundEnd'; t++) {
        applyBotObjectives(ms, world, ctx, [mem]);
        step(world, { 1: botThink(world, ctx, world.players[0], mem) }, ctx);
        updateMatch(ms, world, ctx);
        fell ||= world.events.some((e) => e.type === 'kill');
        const p = world.players[0];
        if (Math.abs(p.pos.x) < 1) crossedAt.push(p.pos.z);
      }
      expect(fell).toBe(false);
      expect(crossedAt.length).toBeGreaterThan(0);
      for (const z of crossedAt) expect(z > z0 && z < z1, `crossed x = 0 at z ${z}`).toBe(true);
      expect(ms.rounds[0]?.reason).toBe('tower');
      expect(ms.rounds[0]?.winner).toBe(team);
    },
  );

  const goals: [string, 0 | 1, string][] = [
    ['Cyan to A (the Lens)', 0, 'siteA'],
    ['Cyan to B (the Sag)', 0, 'siteB'],
    ['Orange to A (the Lens)', 1, 'siteA'],
    ['Orange to B (the Sag)', 1, 'siteB'],
    ['Cyan up to the perch', 0, 'perchS'],
    ['Orange up to the perch', 1, 'perchS'],
  ];
  it.each(goals)('a bot walks %s', (_name, team, goal) => {
    const d = def();
    const { config, ctx, world } = sim(d);
    const s = d.spawns.find((sp) => sp.team === team)!;
    const p = addPlayer(world, createPlayer(1, team, s.pos, s.yawDeg, config));
    const mem = createBotMemory(1, BOT_SKILLS.normal, 9);
    const g = wpPos(d, goal);
    mem.objective = v3(g.x, g.y - 1, g.z);
    mem.objectiveFirst = true;
    let arrived = false;
    for (let t = 0; t < 60 * 40 && !arrived; t++) {
      step(world, { 1: botThink(world, ctx, p, mem) }, ctx);
      arrived =
        Math.hypot(p.pos.x - g.x, p.pos.z - g.z) < 2.5 && Math.abs(p.pos.y - (g.y - 0.1)) < 1.5;
    }
    expect(p.alive).toBe(true);
    expect(arrived).toBe(true);
  });

  it('an Elimination match with bots plays out rounds; both teams reach the middle', () => {
    const config = defaultConfig();
    const d = def();
    const ctx: SimContext = { level: buildLevel(d), config, dt: TICK_DT };
    const world = createWorld(ctx.level, 7);
    const mems: BotMemory[] = [];
    let id = 1;
    for (const team of [0, 1] as const)
      for (let i = 0; i < 3; i++) {
        const s = d.spawns.filter((sp) => sp.team === team)[i];
        addPlayer(world, createPlayer(id, team, s.pos, s.yawDeg, config));
        mems.push(createBotMemory(id, BOT_SKILLS.normal, id * 17));
        id++;
      }
    const ms = createMatch('3v3', 'elim');
    startMatch(ms, world, ctx);
    const reachedMiddle = [false, false];
    const kills: SimEvent[] = [];
    while (ms.rounds.length < 2 && world.tick < 60 * 60 * 6) {
      const inputs: Record<number, PlayerInput> = {};
      for (const mem of mems) {
        const p = world.players.find((q) => q.id === mem.id)!;
        if (p.alive) inputs[p.id] = botThink(world, ctx, p, mem);
      }
      step(world, inputs, ctx);
      updateMatch(ms, world, ctx);
      applyBotObjectives(ms, world, ctx, mems);
      kills.push(...world.events.filter((e) => e.type === 'kill'));
      for (const p of world.players)
        if (p.alive && Math.abs(p.pos.x) < S.disc.apothem) reachedMiddle[p.team] = true;
    }
    expect(ms.rounds.length).toBe(2);
    for (const r of ms.rounds) expect(r.winner).not.toBeNull();
    expect(reachedMiddle).toEqual([true, true]);
    expect(kills.length).toBeGreaterThan(0);
  }, 120000);
});
