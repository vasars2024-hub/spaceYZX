// Antipode: two decks facing each other across a zero-G Seam (level/maps/antipode.ts), each deck
// rooms and corridors, the bomb sites on the north hull wall, flank tunnels on the south one.
// Checks the half-turn symmetry, the plan, spawns (two detached groups a team; the ceiling team
// spawns upside down), objectives, the bot graph, and steps the sim through every way across:
// the launch pads, the Seam, the Spindle, the site rooms, the junction hall, the tunnels.
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
  gravityDirAt,
  inSkyZone,
  len,
  lineOfSight,
  MAPS,
  normalize,
  projectOnPlane,
  qForward,
  qFromBasis,
  qMul,
  qRotate,
  raycast,
  siteAt,
  startMatch,
  step,
  sub,
  TICK_DT,
  touchesPowerup,
  updateMatch,
  v3,
  waypointRoute,
  withSkyArena,
  yawToView,
  type BotMemory,
  type BoxDef,
  type LevelDef,
  type PlayerInput,
  type PlayerState,
  type SimContext,
  type SimEvent,
  type Vec3,
  type WorldState,
} from '../src/index';
import {
  ANTIPODE,
  ANTIPODE_FLOOR,
  ANTIPODE_HANG,
  ANTIPODE_TURN,
  antipodeImage,
  antipodeImageDir,
  buildAntipode,
} from '../src/level/maps/antipode';

const A = ANTIPODE;
const H = A.H;
/** the map as a match plays it (with the sky duel arena, like a competitive map) */
const def = (): LevelDef => withSkyArena(buildAntipode());
const level = () => buildLevel(def());
const key = (n: number) => (Math.abs(n) < 5e-4 ? 0 : n).toFixed(3);
const vkey = (p: Vec3) => [p.x, p.y, p.z].map(key).join(',');
const UP = v3(0, 1, 0);
const DOWN = v3(0, -1, 0);

const wpIndex = (d: LevelDef, name: string) => {
  const i = d.waypoints!.findIndex((w) => w.name === name);
  if (i < 0) throw new Error(`no waypoint ${name}`);
  return i;
};
const wpPos = (d: LevelDef, name: string) => d.waypoints![wpIndex(d, name)].pos;
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
/** an upright standing body with its feet at `feet` */
const standing = (feet: Vec3) => ({
  center: v3(feet.x, feet.y + 0.91, feet.z),
  up: UP,
  halfSeg: 0.5,
  radius: 0.4,
});
const sim = (d: LevelDef = def(), seed = 3) => {
  const lv = buildLevel(d);
  const config = defaultConfig();
  const ctx: SimContext = { level: lv, config, dt: TICK_DT };
  return { lv, config, ctx, world: createWorld(lv, seed) };
};
/** the deck a point belongs to: floor (y < 14) or ceiling */
const deckUp = (p: Vec3) => (p.y < H / 2 ? UP : DOWN);

describe('Antipode: the map', () => {
  it('is registered and sized like the other maps', () => {
    const m = MAPS.find((x) => x.id === 'antipode');
    expect(m?.name).toBe('Antipode');
    const d = def();
    expect(d.name).toBe('Antipode');
    expect(d.boundsMax.x - d.boundsMin.x).toBe(124);
    expect(d.boundsMax.z - d.boundsMin.z).toBe(66);
    expect(d.boundsMax.y - d.boundsMin.y).toBe(32);
    expect(d.boxes.length).toBeGreaterThan(300);
    expect(d.boxes.length).toBeLessThan(900);
    expect(d.skyArena!.center.y - d.boundsMax.y).toBeGreaterThanOrEqual(200);
    // sealed: no gravity zone reaches the sky duel arena (it keeps normal gravity)
    for (const z of d.zones) expect(z.max.y).toBeLessThan(d.boundsMax.y + 5);
  });

  it('is the same after a half-turn: boxes, zones, spawns, Towers, sites, waypoints, areas', () => {
    const d = def();
    const img = antipodeImage;
    // colliding boxes (decoration may change colour, never place): centre, size, turn, prism
    const solid = d.boxes.filter((b) => !b.noCollide);
    const qkey = (b: BoxDef) => {
      if (!b.q) return 'axis';
      const q =
        b.q.w < 0 || (b.q.w === 0 && b.q.x < 0)
          ? { x: -b.q.x, y: -b.q.y, z: -b.q.z, w: -b.q.w }
          : b.q;
      return [q.x, q.y, q.z, q.w].map(key).join(',');
    };
    const bkey = (c: Vec3, b: BoxDef, q: string) =>
      `${vkey(c)}|${[b.h.x, b.h.y, b.h.z].map(key).join(',')}|${q}|${b.prism ?? ''}`;
    const all = new Set(solid.map((b) => bkey(b.c, b, qkey(b))));
    for (const b of solid) {
      let q = 'axis';
      if (b.q || b.prism !== undefined)
        q = qkey({ ...b, q: qMul(ANTIPODE_TURN, b.q ?? { x: 0, y: 0, z: 0, w: 1 }) });
      expect(all.has(bkey(img(b.c), b, q)), `twin of box at ${vkey(b.c)}`).toBe(true);
    }
    // the turned boxes really are turned: a point inside each maps into its twin
    const lv = buildLevel(d);
    for (const b of solid.filter((x) => x.q)) {
      // (a point well inside it: prisms are only solid on one side of their slant)
      const o = qRotate(b.q!, v3(0, -b.h.y / 2, ((b.prism ?? 0) * b.h.z) / 2));
      const p = v3(b.c.x + o.x, b.c.y + o.y, b.c.z + o.z);
      const inside = (c: Vec3) =>
        capsuleOverlaps(lv, { center: c, up: UP, halfSeg: 0, radius: 0.05 });
      expect(inside(p)).toBe(true);
      expect(inside(img(p))).toBe(true);
    }
    // gravity zones (with their priorities)
    const zkey = (min: Vec3, max: Vec3, g: Vec3, pri = 0) =>
      `${vkey(min)}|${vkey(max)}|${vkey(g)}|${pri}`;
    const zones = new Set(d.zones.map((z) => zkey(z.min, z.max, z.gravity, z.priority)));
    for (const z of d.zones) {
      const a = img(z.min);
      const b = img(z.max);
      const min = v3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z));
      const max = v3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
      expect(zones.has(zkey(min, max, antipodeImageDir(z.gravity), z.priority)), z.name).toBe(true);
    }
    // gravity everywhere (a sample grid) turns over too
    const ctx = { level: lv, config: defaultConfig(), dt: TICK_DT };
    const world = createWorld(lv, 1);
    for (let x = -61; x <= 61; x += 3.7)
      for (let y = -1; y <= 29; y += 1.3)
        for (let z = -32; z <= 32; z += 2.9) {
          const p = v3(x, y, z);
          expect(vkey(gravityDirAt(ctx, world, img(p)))).toBe(
            vkey(antipodeImageDir(gravityDirAt(ctx, world, p))),
          );
        }
    // spawns: each cyan floor spawn has an orange ceiling twin (a hanging upright body: its
    // head where the twin's feet are... turned over, the same body)
    const body = (s: { pos: Vec3 }) => v3(s.pos.x, s.pos.y + 0.91, s.pos.z);
    for (const s of d.spawns) {
      const twin = d.spawns.find(
        (o) =>
          o.team !== s.team &&
          vkey(body(o)) === vkey(img(body(s))) &&
          key(o.yawDeg) === key(-s.yawDeg),
      );
      expect(twin, `twin of spawn ${vkey(s.pos)}`).toBeDefined();
    }
    // Towers: the touch volumes (rules/match.ts: pos.y - 1 .. pos.y + height + 2) turn over
    const [t0, t1] = [0, 1].map((t) => d.towers.find((x) => x.team === t)!);
    expect(vkey(v3(t1.pos.x, 0, t1.pos.z))).toBe(vkey(v3(-t0.pos.x, 0, t0.pos.z)));
    expect(t1.pos.y - 1).toBeCloseTo(H - (t0.pos.y + t0.height + 2), 6);
    expect(t1.pos.y + t1.height + 2).toBeCloseTo(H - (t0.pos.y - 1), 6);
    expect([t1.radius, t1.height]).toEqual([t0.radius, t0.height]);
    const homes = d.controllerHomes!;
    expect(vkey(homes[1])).toBe(vkey(img(homes[0])));
    // sites
    const sA = d.bombSites!.find((s) => s.name === 'A')!;
    const sB = d.bombSites!.find((s) => s.name === 'B')!;
    expect(vkey(sB.min)).toBe(vkey(v3(-sA.max.x, H - sA.max.y, sA.min.z)));
    expect(vkey(sB.max)).toBe(vkey(v3(-sA.min.x, H - sA.min.y, sA.max.z)));
    // waypoints and their links
    const wps = d.waypoints!;
    const byPos = new Map(wps.map((w, i) => [vkey(w.pos), i]));
    const twinOf = wps.map((w) => byPos.get(vkey(img(w.pos))));
    for (let i = 0; i < wps.length; i++) {
      expect(twinOf[i], `twin of waypoint ${wps[i].name}`).toBeDefined();
      const tw = wps[twinOf[i]!];
      expect(tw.links.map((j) => twinOf[j]).sort()).toEqual([...wps[i].links].sort());
    }
    // areas and power-ups
    for (const a of d.areas!) {
      const b = d.areas!.find(
        (o) =>
          vkey(v3(o.pos.x, o.pos.y + 0.91, o.pos.z)) ===
          vkey(img(v3(a.pos.x, a.pos.y + 0.91, a.pos.z))),
      );
      expect(b, `twin of area ${a.name}`).toBeDefined();
    }
    for (const p of d.powerups!)
      expect(d.powerups!.some((o) => vkey(o) === vkey(img(p)))).toBe(true);
  });

  it('has no visible clipping (the global clipping check)', () => {
    const d = def();
    expect(findOverlaps(d).map((o) => describeOverlap(d, o))).toEqual([]);
  });

  it('follows the plan: rooms on each deck, closed off from the Seam but for the well', () => {
    const lv = level();
    const F = ANTIPODE_FLOOR;
    // every room / corridor of the plan has floor at its middle (and its twin has ceiling)
    const places: [string, number, number][] = [
      ['bastion, by the Tower', -50, 0],
      ['quarters, the bunks', -45, -21],
      ['north passage', -42, 13],
      ['south passage', -42, -13],
      ['home hall', -32, -4],
      ['B lobby', -38, 20],
      ['tunnel lobby (west)', -28, -22],
      ['north gallery', -20, 21],
      ['junction corridor', -3, 16],
      ['south gallery', -18, -20],
      ['the well', -8, 3],
      ['east hall', 32, -2],
      ['A lobby', 31, 22],
      ['tunnel lobby (east)', 26, -21],
      ['north-east gallery', 20, 21],
      ['south-east gallery', 18, -20],
    ];
    for (const [name, x, z] of places) {
      expect(
        Object.values(F).some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1),
        `${name} in the plan`,
      ).toBe(true);
      const hit = raycast(lv, v3(x, 1, z), DOWN, 2);
      expect(hit?.point.y, name).toBeCloseTo(0, 2);
      expect(capsuleOverlaps(lv, standing(v3(x, 0.02, z))), name).toBe(false);
      // a roof over it (the deck house), except over the well
      const roof = raycast(lv, v3(x, 1, z), UP, 20);
      if (name === 'the well') expect(roof).toBeNull();
      else expect(roof?.point.y, `${name}: roof`).toBeCloseTo(A.roof, 2);
      const q = antipodeImage(v3(x, 0, z));
      expect(raycast(lv, v3(q.x, q.y - 1, q.z), UP, 2)?.point.y, `${name} (ceiling)`).toBeCloseTo(
        H,
        2,
      );
    }
    // the decks see each other only through the well
    expect(lineOfSight(lv, v3(-10, 1.6, 8), v3(-10, H - 1.6, 8))).toBe(true);
    expect(lineOfSight(lv, v3(-30, 1.6, 0), v3(-30, H - 1.6, 0))).toBe(false);
    expect(lineOfSight(lv, v3(-18, 1.6, 0), v3(18, H - 1.6, 0))).toBe(false);
    expect(lineOfSight(lv, v3(-10, 10, 0), v3(10, 10, 0))).toBe(false); // the Spindle
    // the rooms are shut from each other by walls: the bastion never sees the home hall's far
    // end, the galleries never see the Seam
    expect(lineOfSight(lv, v3(-50, 1.6, 0), v3(-24, 1.6, 0))).toBe(false);
    expect(lineOfSight(lv, v3(-15, 1.6, 21), v3(-15, 12, 15))).toBe(false);
    // the side planes are closed rooms and tunnels, not an open band along the hull
    expect(lineOfSight(lv, v3(-31, 7, 29.4), v3(31, 7, 29.4))).toBe(false);
    expect(lineOfSight(lv, v3(-31, 7, 29.4), v3(0, 7, 29.4))).toBe(false);
    // the tunnels' baffles: no lane down the whole bar
    for (const y of [7.6, 9, 10.4])
      expect(lineOfSight(lv, v3(-26, y, -29.4), v3(26, y, -29.4)), `bar at y ${y}`).toBe(false);
  });

  it('has its gravity: floor deck, the Seam, ceiling deck, the Spindle, the side planes', () => {
    const { ctx, world } = sim();
    const g = (x: number, y: number, z: number) => gravityDirAt(ctx, world, v3(x, y, z));
    expect(g(-30, 1, 0)).toEqual(v3(0, -1, 0));
    expect(g(-30, 7.9, 0)).toEqual(v3(0, -1, 0));
    for (const y of [8.1, 12, 14, 16, 19.9]) expect(len(g(-10, y, 8)), `y ${y}`).toBe(0);
    expect(g(30, 20.1, 0)).toEqual(v3(0, 1, 0));
    expect(g(30, 27, 0)).toEqual(v3(0, 1, 0));
    // the Spindle's grooves pull into their faces all the way up (through the Seam)
    for (const y of [3, 8, 14, 20, 25]) {
      expect(g(-5, y, 0), `-x groove y ${y}`).toEqual(v3(1, 0, 0));
      expect(g(5, y, 0), `+x groove y ${y}`).toEqual(v3(-1, 0, 0));
      expect(g(0, y, 5), `+z groove y ${y}`).toEqual(v3(0, 0, -1));
      expect(g(0, y, -5), `-z groove y ${y}`).toEqual(v3(0, 0, 1));
    }
    expect(g(-8, 1, 0)).toEqual(v3(0, -1, 0));
    // the side planes pull into the hull walls (the sites' rooms, the junction, the tunnels)
    for (const [x, y] of [
      [-31, 7],
      [-31, 21],
      [31, 14],
      [0, 7],
      [-14, 14],
    ])
      expect(g(x, y, 28), `north ${x},${y}`).toEqual(v3(0, 0, 1));
    for (const [x, y] of [
      [-28, 5],
      [-10, 9],
      [0, 14],
      [10, 19],
    ])
      expect(g(x, y, -28), `south ${x},${y}`).toEqual(v3(0, 0, -1));
    // inside each deck door the floor (ceiling) keeps its gravity until the fillet
    for (const [x, z] of [
      [-31, 26],
      [-3, 26],
      [31, 26],
      [-28, -26],
      [28, -26],
    ]) {
      expect(g(x, 1, z), `door ${x},${z}`).toEqual(v3(0, -1, 0));
      expect(g(-x, 27, z), `door ${-x},${z} (ceiling)`).toEqual(v3(0, 1, 0));
    }
  });

  it('keeps ramps at 30° or less; the 45° fillets only sit across a gravity bend', () => {
    const d = def();
    const { ctx, world } = sim();
    const turned = d.boxes.filter((b) => (b.q || b.prism !== undefined) && !b.noCollide);
    let fillets = 0;
    for (const b of turned) {
      // drifting cargo in the Seam: nobody stands on it
      if (b.prism === undefined) {
        expect(b.c.y > A.seam.y0 + 2 && b.c.y < A.seam.y1 - 2, `cargo at ${vkey(b.c)}`).toBe(true);
        expect(len(gravityDirAt(ctx, world, b.c))).toBe(0);
        continue;
      }
      const n = normalize(qRotate(b.q!, v3(0, b.h.z, -b.prism * b.h.y)));
      const up = deckUp(b.c);
      const slope =
        (Math.acos(Math.min(1, Math.abs(n.x * up.x + n.y * up.y + n.z * up.z))) * 180) / Math.PI;
      if (slope <= 30.01) continue;
      expect(slope, `prism at ${vkey(b.c)}`).toBeCloseTo(45, 3);
      fillets++;
      const out = v3(b.c.x + n.x * 1.2, b.c.y + n.y * 1.2, b.c.z + n.z * 1.2);
      const gdir = gravityDirAt(ctx, world, out);
      const cos = -(gdir.x * n.x + gdir.y * n.y + gdir.z * n.z);
      expect(cos, `fillet at ${vkey(b.c)}`).toBeGreaterThan(Math.cos((50 * Math.PI) / 180));
    }
    // 4 grooves + 5 side-plane doors, on both decks
    expect(fillets).toBe(18);
  });

  it('keeps cover half (≤ 1.25 m) or full (≥ 2 m) on the floor deck', () => {
    const d = def();
    for (const b of d.boxes) {
      if (b.noCollide || b.q || b.mat === 'skyglass') continue;
      const y0 = b.c.y - b.h.y;
      const tall = 2 * b.h.y;
      // standing on the floor deck, smaller than a wall
      if (Math.abs(y0) > 1e-6 || tall >= 5) continue;
      if (b.h.x < 0.3 || b.h.z < 0.3) continue; // pillars, ribs
      expect(tall <= 1.25 || tall >= 2, `box at ${vkey(b.c)}: ${tall} m`).toBe(true);
    }
  });
});

describe('Antipode: spawns and objectives', () => {
  /** a spawn group's room (cyan's; orange's is its image) */
  const ROOMS: Record<string, [number, number, number, number]> = {
    bastion: [A.bastion.x0, A.bastion.x1, -A.bastion.z, A.bastion.z],
    quarters: [A.quarters.x0, A.quarters.x1, A.quarters.z0, A.quarters.z1],
  };
  const inRoom = (p: Vec3, pad: number) =>
    Object.values(ROOMS).some(([x0, x1, z0, z1]) => {
      const inside = (q: Vec3) =>
        q.x > x0 - pad && q.x < x1 + pad && q.z > z0 - pad && q.z < z1 + pad;
      return (p.y < A.roof + 1 && inside(p)) || (p.y > H - A.roof - 1 && inside(antipodeImage(p)));
    });

  it('has 8 spawns per team in two detached groups: cyan standing on the floor, orange hanging from the ceiling', () => {
    const d = def();
    const lv = level();
    for (const team of [0, 1] as const) {
      const spawns = d.spawns.filter((s) => s.team === team);
      expect(spawns.length).toBe(8);
      const groups = new Map<string, number>();
      for (const s of spawns) groups.set(s.group!, (groups.get(s.group!) ?? 0) + 1);
      expect([...groups.entries()].sort()).toEqual([
        ['bastion', 4],
        ['quarters', 4],
      ]);
      for (const s of spawns) {
        expect(capsuleOverlaps(lv, standing(s.pos)), vkey(s.pos)).toBe(false);
        // in its group's room
        const cyan = team === 0 ? s.pos : antipodeImage(v3(s.pos.x, s.pos.y + ANTIPODE_HANG, s.pos.z));
        const [x0, x1, z0, z1] = ROOMS[s.group!];
        expect(cyan.x > x0 && cyan.x < x1 && cyan.z > z0 && cyan.z < z1, vkey(s.pos)).toBe(true);
        if (team === 0) {
          expect(raycast(lv, v3(s.pos.x, s.pos.y + 1, s.pos.z), DOWN, 2)?.point.y).toBeCloseTo(
            0,
            3,
          );
          expect(s.yawDeg).toBe(-90);
        } else {
          expect(s.pos.y + ANTIPODE_HANG).toBeCloseTo(H, 6);
          const hit = raycast(lv, v3(s.pos.x, s.pos.y + 1, s.pos.z), UP, 2);
          expect(hit?.point.y).toBeCloseTo(H, 3);
          expect(s.yawDeg).toBe(90);
        }
      }
    }
  });

  it('each spawn room has two ways out (either door alone leads to the whole map)', () => {
    const d = def();
    const exits: [string, string, string[]][] = [
      ['bastion', 'home.spN', ['home.doorN', 'home.doorS']],
      ['quarters', 'q.sp', ['q.door', 'q.edoor']],
    ];
    for (const [room, from, doors] of exits)
      for (const shut of doors) {
        const dd = withBlocked(d, [shut]);
        const wps = dd.waypoints!;
        // (the other door still reaches the enemy's Tower on the other deck)
        expect(
          waypointRoute(wps, wpIndex(dd, from), wpIndex(dd, '~home.tower')).length,
          `${room} with ${shut} shut`,
        ).toBeGreaterThan(0);
      }
  });

  it('no spawn is in view from outside its room (both decks, the Seam, the side planes)', () => {
    const d = def();
    const lv = level();
    const lookouts: Vec3[] = [];
    const add = (p: Vec3) => {
      if (inRoom(p, 1)) return;
      if (capsuleOverlaps(lv, { center: p, up: UP, halfSeg: 0, radius: 0.2 })) return;
      lookouts.push(p);
    };
    for (let x = -59; x <= 59; x += 2.5)
      for (let z = -23.5; z <= 23.5; z += 2.5)
        for (const y of [1.0, 1.6, 4, 10, 14, 18, H - 4, H - 1.6, H - 1.0]) add(v3(x, y, z));
    // the side planes (a body on the hull wall: eyes 1.6 m off it)
    for (let x = -59; x <= 59; x += 2.5)
      for (let y = 1; y < H; y += 2)
        for (const z of [25.8, 28, 29.4, -25.8, -28, -29.4]) add(v3(x, y, z));
    expect(lookouts.length).toBeGreaterThan(3000);
    for (const s of d.spawns) {
      const u = s.team === 0 ? UP : DOWN;
      const feet = s.team === 0 ? s.pos : v3(s.pos.x, H, s.pos.z);
      const pts = [0.3, 1.0, 1.6].map((h) => v3(feet.x, feet.y + u.y * h, feet.z));
      for (const l of lookouts)
        for (const p of pts)
          expect(lineOfSight(lv, l, p), `${vkey(l)} sees spawn ${vkey(s.pos)}`).toBe(false);
    }
  });

  it('has its Towers, homes, sites and power-ups where they can be reached', () => {
    const d = def();
    const lv = level();
    const config = defaultConfig();
    const reach = (t: { radius: number }) => t.radius + config.rules.towerTouchRadius;
    for (const t of d.towers) {
      const w = wpPos(d, t.team === 0 ? 'home.tower' : '~home.tower');
      expect(Math.hypot(w.x - t.pos.x, w.z - t.pos.z)).toBeLessThan(reach(t) - 0.3);
      const bodyY = t.team === 0 ? 0.91 : H - 0.91;
      expect(bodyY - t.pos.y).toBeGreaterThanOrEqual(-1);
      expect(bodyY - t.pos.y).toBeLessThanOrEqual(t.height + 2);
      const block = raycast(
        lv,
        v3(t.pos.x + 3, t.team === 0 ? 1 : H - 1, t.pos.z),
        v3(-1, 0, 0),
        3,
      );
      expect(block?.point.x).toBeCloseTo(t.pos.x + 1, 3);
    }
    for (const h of d.controllerHomes!)
      expect(capsuleOverlaps(lv, { center: h, up: UP, halfSeg: 0.5, radius: 0.4 })).toBe(false);
    // the sites: rooms on the north hull wall, halfway between the decks (A in orange's half
    // of the hull, B in cyan's); a planter stands on the wall
    const sA = d.bombSites!.find((s) => s.name === 'A')!;
    const sB = d.bombSites!.find((s) => s.name === 'B')!;
    expect(sA.min.x).toBeGreaterThan(0);
    expect(sB.max.x).toBeLessThan(0);
    for (const s of [sA, sB]) {
      expect(s.min.z).toBeGreaterThanOrEqual(A.plane.z0);
      expect(s.max.x - s.min.x).toBeGreaterThanOrEqual(10);
      expect(s.max.y - s.min.y).toBeGreaterThanOrEqual(10);
      const c = v3((s.min.x + s.max.x) / 2, (s.min.y + s.max.y) / 2, A.plane.z1);
      // wall to stand on, room to stand
      expect(raycast(lv, v3(c.x, c.y, c.z - 1), v3(0, 0, 1), 2)?.point.z).toBeCloseTo(c.z, 3);
      const body = v3(c.x, c.y + 2, c.z - 0.91);
      expect(
        capsuleOverlaps(lv, { center: body, up: v3(0, 0, -1), halfSeg: 0.5, radius: 0.4 }),
      ).toBe(false);
      expect(siteAt(d.bombSites!, body)).toBe(s.name);
      // nobody on either deck is in a site
      expect(siteAt(d.bombSites!, v3(c.x, 0.91, 20))).toBeNull();
      expect(siteAt(d.bombSites!, v3(c.x, H - 0.91, 20))).toBeNull();
    }
    expect(d.powerups).toEqual(A.powerups);
    for (const p of d.powerups!) {
      expect(p.y).toBe(H / 2);
      expect(capsuleOverlaps(lv, { center: p, up: UP, halfSeg: 0, radius: 0.35 })).toBe(false);
    }
  });

  it('has a bot graph in open space that joins every part of both decks', () => {
    const d = def();
    const lv = level();
    const { ctx, world } = sim();
    const wps = d.waypoints!;
    for (const w of wps) {
      expect(
        capsuleOverlaps(lv, { center: w.pos, up: UP, halfSeg: 0, radius: 0.3 }),
        `waypoint ${w.name}`,
      ).toBe(false);
      const g = gravityDirAt(ctx, world, w.pos);
      expect(len(g), `waypoint ${w.name} in zero-G`).toBeGreaterThan(0.5);
      expect(
        raycast(lv, w.pos, normalize(g), 1.6),
        `waypoint ${w.name}: nothing to stand on`,
      ).not.toBeNull();
      for (const j of w.links)
        expect(lineOfSight(lv, w.pos, wps[j].pos), `link ${w.name} → ${wps[j].name}`).toBe(true);
    }
    // reachable from every spawn group of both teams
    for (const from of ['home.spN', 'q.sp', '~home.spN', '~q.sp'])
      for (let i = 0; i < wps.length; i++)
        expect(waypointRoute(wps, wpIndex(d, from), i).length, wps[i].name).toBeGreaterThan(0);
    // the halves join only up the Spindle's grooves, through the site rooms, the junction
    // hall and the tunnels' rung
    const lower = new Set(wps.map((w, i) => (w.pos.y < H / 2 ? i : -1)).filter((i) => i >= 0));
    const crossings = wps.flatMap((w, i) =>
      w.links.filter((j) => lower.has(i) !== lower.has(j)).map((j) => `${w.name}→${wps[j].name}`),
    );
    const both = (a: string, b: string) => [`${a}→${b}`, `${b}→${a}`];
    expect(crossings.sort()).toEqual(
      [
        ...both('sp.w3', '~sp.e3'),
        ...both('sp.e3', '~sp.w3'),
        ...both('sp.n3', '~sp.n3'),
        ...both('sp.s3', '~sp.s3'),
        ...both('nB.top', '~nA.top'),
        ...both('nA.top', '~nB.top'),
        ...both('nJ.top', '~nJ.top'),
        ...both('rung.1', '~rung.1'),
      ].sort(),
    );
  });
});

/** Walk from `start` through the named waypoints, looking along the way (holding forward). */
const walkRoute = (
  start: Vec3,
  yawDeg: number,
  names: string[],
  opts: { maxTicks?: number; onTick?: (p: PlayerState, t: number) => void } = {},
) => {
  const d = def();
  const { config, ctx, world } = sim(d);
  const p = addPlayer(world, createPlayer(1, 0, start, yawDeg, config));
  const events: SimEvent[] = [];
  let view = yawToView(yawDeg);
  let i = 0;
  let t = 0;
  for (; t < (opts.maxTicks ?? 60 * 40) && i < names.length; t++) {
    const target = wpPos(d, names[i]);
    if (len(sub(target, p.pos)) < 1.6) {
      i++;
      continue;
    }
    // (a target straight overhead: keep walking the way you were, into the wall ahead)
    const flat = projectOnPlane(sub(target, p.pos), p.up);
    if (len(flat) > 0.5) view = qFromBasis(normalize(flat), p.up);
    step(world, { 1: { tick: world.tick + 1, buttons: Btn.Forward, view } }, ctx);
    events.push(...world.events);
    opts.onTick?.(p, t);
  }
  for (let k = 0; k < 30; k++) step(world, {}, ctx);
  return { p, arrived: i >= names.length, ticks: t, events, config };
};


describe('Antipode: across the Seam, up the Spindle, through the side planes', () => {

  it('an orange spawn turns over and stands on the ceiling (facing kept, no damage)', () => {
    const d = def();
    for (const s of d.spawns.filter((sp) => sp.team === 1)) {
      const { config, ctx, world } = sim(d);
      const p = addPlayer(world, createPlayer(1, 1, s.pos, s.yawDeg, config));
      const center0 = { ...p.pos };
      for (let t = 0; t < 30; t++) step(world, {}, ctx);
      expect(p.grounded).toBe(true);
      expect(p.up.y).toBeCloseTo(-1, 6);
      expect(p.pos.y).toBeCloseTo(H - config.movement.standHeight / 2 - 0.01, 1);
      expect(Math.hypot(p.pos.x - center0.x, p.pos.z - center0.z)).toBeLessThan(1e-6);
      expect(p.hp).toBe(config.combat.maxHp);
      // still looking down the hull toward the other end (-x)
      expect(qForward(p.view).x).toBeLessThan(-0.99);
    }
  });

  it('a round starts with orange standing on the ceiling when the spawn lock ends', () => {
    const d = def();
    const { config, ctx, world } = sim(d);
    let id = 1;
    for (const team of [0, 1] as const)
      for (const s of d.spawns.filter((sp) => sp.team === team).slice(0, 3))
        addPlayer(world, createPlayer(id++, team, s.pos, s.yawDeg, config));
    const ms = createMatch('3v3', 'elim');
    startMatch(ms, world, ctx);
    for (let t = 0; t < 60 * 12 && ms.phase !== 'live'; t++) {
      step(world, {}, ctx);
      updateMatch(ms, world, ctx);
    }
    expect(ms.phase).toBe('live');
    for (let t = 0; t < 20; t++) {
      step(world, {}, ctx);
      updateMatch(ms, world, ctx);
    }
    for (const p of world.players) {
      expect(p.alive).toBe(true);
      expect(p.grounded).toBe(true);
      expect(p.up.y).toBeCloseTo(p.team === 0 ? 1 : -1, 6);
      expect(p.pos.y).toBeCloseTo(p.team === 0 ? 0.9 : H - 0.9, 1);
    }
  });

  it('floating across the midline hands you to the other deck (both ways)', () => {
    for (const [from, vy, deckY, upY] of [
      [v3(-8, 13.5, 8), 3, H - 0.91, -1],
      [v3(8, 14.5, 8), -3, 0.91, 1],
    ] as const) {
      const { config, ctx, world } = sim();
      const p = addPlayer(world, createPlayer(1, 0, v3(from.x, from.y - 0.91, from.z), 0, config));
      p.vel = v3(0, vy, 0);
      step(world, {}, ctx);
      expect(p.gravity).toEqual(v3(0, 0, 0));
      for (let t = 0; t < 60 * 6 && !p.grounded; t++) step(world, {}, ctx);
      expect(p.grounded).toBe(true);
      expect(p.pos.y).toBeCloseTo(deckY, 1);
      expect(p.up.y).toBeCloseTo(upY, 6);
      expect(p.hp).toBe(config.combat.maxHp); // an 8 m fall at most
    }
  });

  it.each([
    [
      '-x groove',
      v3(-14, 0, 0),
      -90,
      ['sp.w0', 'sp.w1', 'sp.w2', 'sp.w3', '~sp.e3', '~sp.e2', '~sp.e1', '~sp.e0', '~ring.se'],
    ],
    [
      '+x groove',
      v3(14, 0, 0),
      90,
      ['sp.e0', 'sp.e1', 'sp.e2', 'sp.e3', '~sp.w3', '~sp.w2', '~sp.w1', '~sp.w0', '~ring.nw'],
    ],
    [
      '+z groove',
      v3(-3, 0, 10),
      0,
      ['sp.n0', 'sp.n1', 'sp.n2', 'sp.n3', '~sp.n3', '~sp.n2', '~sp.n1', '~sp.n0', '~ring.ne'],
    ],
    [
      '-z groove',
      v3(-6, 0, -12),
      180,
      ['sp.s0', 'sp.s1', 'sp.s2', 'sp.s3', '~sp.s3', '~sp.s2', '~sp.s1', '~sp.s0', '~ring.se'],
    ],
  ] as const)(
    'a player walks the Spindle from the floor to the ceiling (%s)',
    (_n, start, yaw, route) => {
      const d = def();
      const pctx: SimContext = { level: level(), config: defaultConfig(), dt: TICK_DT };
      let onFace = 0;
      let touched = false;
      const { p, arrived, ticks, config } = walkRoute(start, yaw, [...route], {
        onTick: (pl) => {
          if (Math.abs(pl.up.y) < 0.01) onFace++;
          for (const u of d.powerups!) if (touchesPowerup(pl, u, pctx)) touched = true;
        },
      });
      expect(arrived).toBe(true);
      expect(ticks / 60).toBeLessThan(9); // the slow way: ~5 s up the column
      expect(onFace / 60).toBeGreaterThan(2); // walking up the face
      expect(p.grounded).toBe(true);
      expect(p.up.y).toBeCloseTo(-1, 6);
      expect(p.pos.y).toBeCloseTo(H - 0.91, 1);
      expect(p.hp).toBe(config.combat.maxHp);
      // the ±z grooves carry you through the power-ups at the Spindle's middle
      if (route[0] === 'sp.n0' || route[0] === 'sp.s0') expect(touched).toBe(true);
    },
  );

  it('a launch pad in the well throws you through the Seam onto the other deck (no damage)', () => {
    for (const [x, z] of A.pads) {
      const { config, ctx, world } = sim();
      const p = addPlayer(world, createPlayer(1, 0, v3(x, 0.05, z), -90, config));
      let floated = 0;
      let t = 0;
      for (; t < 60 * 6; t++) {
        step(world, {}, ctx);
        if (len(p.gravity) === 0) floated++;
        if (t > 30 && p.grounded) break;
      }
      for (let k = 0; k < 30; k++) step(world, {}, ctx);
      expect(floated / 60).toBeGreaterThan(0.3);
      expect(p.grounded).toBe(true);
      expect(p.up.y).toBeCloseTo(-1, 6);
      expect(p.pos.y).toBeCloseTo(H - 0.91, 1);
      // still in the well (on the ceiling deck's well floor)
      expect(Math.abs(p.pos.x)).toBeLessThan(A.well.x);
      expect(Math.abs(p.pos.z)).toBeLessThan(A.well.z);
      expect(p.hp).toBe(config.combat.maxHp);
    }
  });

  const wallWalk = (pl: PlayerState) => Math.abs(Math.abs(pl.up.z) - 1) < 0.01;
  it.each([
    [
      'site B: floor door → up the wall through the site → ceiling door',
      v3(-31, 0, 18),
      180,
      [
        ...['out', 'door', 'in', 'w1', 'c', 'top'].map((w) => `nB.${w}`),
        ...['top', 'c', 'w1', 'in', 'door', 'out'].map((w) => `~nA.${w}`),
      ],
      -1,
    ],
    [
      'the connector: site B → junction hall → ceiling',
      v3(-31, 0, 18),
      180,
      [
        ...['out', 'door', 'in', 'w1', 'c', 'inner', 'side'].map((w) => `nB.${w}`),
        'arm.w',
        'nJ.wside',
        'nJ.top',
        ...['top', 'c', 'w1', 'in', 'door', 'out'].map((w) => `~nJ.${w}`),
      ],
      -1,
    ],
    [
      'the flank tunnels: low bar, up the rung, high bar → ceiling',
      v3(-28, 0, -19),
      0,
      [
        ...['out', 'door', 'in', 'w1', 'w2'].map((w) => `sW.${w}`),
        'bar.-20',
        'bar.-10',
        'bar.-8',
        'rung.0',
        'rung.1',
        '~rung.1',
        '~rung.0',
        '~bar.8',
        '~bar.10',
        '~bar.20',
        ...['w2', 'w1', 'in', 'door', 'out'].map((w) => `~sE.${w}`),
      ],
      -1,
    ],
    [
      'the flank tunnels: along the low bar to the far floor lobby',
      v3(-28, 0, -19),
      0,
      [
        ...['out', 'door', 'in', 'w1', 'w2'].map((w) => `sW.${w}`),
        'bar.-20',
        'bar.-10',
        'bar.-8',
        'rung.0',
        'bar.8',
        'bar.10',
        'bar.20',
        ...['w2', 'w1', 'in', 'door', 'out'].map((w) => `sE.${w}`),
      ],
      1,
    ],
  ] as const)('a player walks a side plane (%s)', (_n, start, yaw, route, upY) => {
    let onWall = 0;
    const { p, arrived, ticks, config } = walkRoute(start, yaw, [...route], {
      onTick: (pl) => {
        if (wallWalk(pl)) onWall++;
      },
    });
    expect(arrived).toBe(true);
    expect(ticks / 60).toBeLessThan(20);
    expect(onWall / 60).toBeGreaterThan(2.5);
    expect(p.grounded).toBe(true);
    expect(p.up.y).toBeCloseTo(upY, 6);
    expect(p.pos.y).toBeCloseTo(upY > 0 ? 0.91 : H - 0.91, 1);
    expect(Math.abs(p.pos.z)).toBeLessThan(A.halfZ);
    expect(p.hp).toBe(config.combat.maxHp);
  });


  it('the sky duel takes both teams up to the arena standing upright, and back home after', () => {
    const d = def();
    const { config, ctx, world } = sim(d);
    config.rules.skyOvertimeChance = 1;
    let id = 1;
    for (const team of [0, 1] as const)
      for (const s of d.spawns.filter((sp) => sp.team === team).slice(0, 2))
        addPlayer(world, createPlayer(id++, team, s.pos, s.yawDeg, config));
    const ms = createMatch('2v2');
    startMatch(ms, world, ctx);
    ms.phaseEnds = world.tick + 1;
    step(world, {}, ctx);
    updateMatch(ms, world, ctx);
    for (let t = 0; t < 30; t++) {
      step(world, {}, ctx);
      updateMatch(ms, world, ctx);
    }
    ms.roundEnds = world.tick + 1;
    for (let t = 0; t < 60; t++) {
      step(world, {}, ctx);
      updateMatch(ms, world, ctx);
    }
    expect(ms.overtime?.kind).toBe('sky');
    for (const p of world.players) {
      expect(inSkyZone(d, p.pos)).toBe(true);
      expect(p.grounded).toBe(true);
      expect(p.up.y).toBeCloseTo(1, 6);
    }
    for (let t = 0; t < 60 * 40 && ms.round < 2; t++) {
      step(world, {}, ctx);
      updateMatch(ms, world, ctx);
    }
    expect(ms.round).toBe(2);
    for (let t = 0; t < 30; t++) {
      step(world, {}, ctx);
      updateMatch(ms, world, ctx);
    }
    // round 2: back in the ship, each body standing on its own deck
    for (const p of world.players) {
      expect(inSkyZone(d, p.pos)).toBe(false);
      expect(p.up.y).toBeCloseTo(p.pos.y > H / 2 ? -1 : 1, 6);
    }
  });

});


describe('Antipode bots', () => {
  const SPINDLE = ['sp.w2', 'sp.e2', 'sp.n2', 'sp.s2'];
  const SITES = ['nB.top', 'nA.top'];
  const lanes: [string, string[]][] = [
    ['the Spindle', [...SITES, 'nJ.top', 'rung.1']],
    ['the site rooms', [...SPINDLE, 'nJ.top', 'rung.1']],
    ['the junction hall', [...SPINDLE, ...SITES, 'rung.1']],
    ['the flank tunnels', [...SPINDLE, ...SITES, 'nJ.top']],
  ];
  it.each(lanes.flatMap(([n, b]) => ([0, 1] as const).map((team) => [n, team, b] as const)))(
    'a bot carries the Controller to the enemy Tower on the other deck via %s (team %i)',
    (_name, team, blocked) => {
      const base = def();
      const d = withBlocked(base, [...blocked, ...blocked.map((b) => `~${b}`)]);
      const { config, ctx, world } = sim(d, 5);
      const s = d.spawns.find((sp) => sp.team === team)!;
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
      const p = world.players[0];
      expect(p.pos.y > H / 2).toBe(team === 0);
      expect(p.alive).toBe(true);
    },
  );

  it.each(
    ([0, 1] as const).flatMap((team) =>
      (['A', 'B'] as const).flatMap((site) =>
        (['bastion', 'quarters'] as const).map((group) => [team, site, group] as const),
      ),
    ),
  )('a team-%i bot walks to site %s from its %s and stands in it', (team, site, group) => {
    const d = def();
    const { config, ctx, world } = sim(d, 9);
    const s = d.spawns.find((sp) => sp.team === team && sp.group === group)!;
    const p = addPlayer(world, createPlayer(1, team, s.pos, s.yawDeg, config));
    const mem = createBotMemory(1, BOT_SKILLS.normal, 9);
    const st = d.bombSites!.find((x) => x.name === site)!;
    mem.objective = v3((st.min.x + st.max.x) / 2, st.min.y + 0.5, (st.min.z + st.max.z) / 2);
    mem.objectiveFirst = true;
    let inSite = false;
    for (let t = 0; t < 60 * 50 && !inSite; t++) {
      step(world, { 1: botThink(world, ctx, p, mem) }, ctx);
      inSite = p.grounded && siteAt(d.bombSites!, p.pos) === site;
    }
    expect(inSite).toBe(true);
  });

  it.each(['A', 'B'] as const)(
    'Bomb: an orange attacker bot plants in site %s (standing on the north hull wall)',
    (site) => {
      const d = def();
      const { config, ctx, world } = sim(d, 4);
      const s = d.spawns.find((sp) => sp.team === 1)!;
      addPlayer(world, createPlayer(1, 1, s.pos, s.yawDeg, config));
      const mem = createBotMemory(1, BOT_SKILLS.normal, 4);
      const ms = createMatch('1v1', 'bomb');
      startMatch(ms, world, ctx);
      ms.botSite = site;
      let planted: SimEvent | undefined;
      for (let t = 0; t < 60 * 60 && !planted; t++) {
        applyBotObjectives(ms, world, ctx, [mem]);
        step(world, { 1: botThink(world, ctx, world.players[0], mem) }, ctx);
        updateMatch(ms, world, ctx);
        planted = world.events.find((e) => e.type === 'bombPlanted');
      }
      expect(planted?.type === 'bombPlanted' && planted.site).toBe(site);
      // planted standing on the site's wall
      const p = world.players[0];
      expect(p.up.z).toBeCloseTo(-1, 6);
      expect(p.pos.z).toBeCloseTo(A.plane.z1 - 0.91, 1);
    },
  );

  it('Elimination matches with bots (2v2) play out rounds, fought across and between the decks', () => {
    const d = def();
    let crossedAny = false;
    for (const seed of [11, 12, 13]) {
      const { config, ctx, world } = sim(d, seed);
      const mems: BotMemory[] = [];
      let id = 1;
      for (const team of [0, 1] as const)
        for (let i = 0; i < 2; i++) {
          const s = d.spawns.filter((sp) => sp.team === team)[i];
          addPlayer(world, createPlayer(id, team, s.pos, s.yawDeg, config));
          mems.push(createBotMemory(id, BOT_SKILLS.normal, id * 13 + seed));
          id++;
        }
      const ms = createMatch('2v2', 'elim');
      startMatch(ms, world, ctx);
      const kills: SimEvent[] = [];
      const player = (w: WorldState, i: number) => w.players.find((q) => q.id === i)!;
      while (ms.rounds.length < 1 && world.tick < 60 * 240) {
        applyBotObjectives(ms, world, ctx, mems);
        const inputs: Record<number, PlayerInput> = {};
        for (const mem of mems) {
          const p = player(world, mem.id);
          if (p.alive) inputs[p.id] = botThink(world, ctx, p, mem);
        }
        step(world, inputs, ctx);
        kills.push(...world.events.filter((e) => e.type === 'kill'));
        updateMatch(ms, world, ctx);
        // (a bot well over on the other team's deck)
        for (const p of world.players)
          if (p.alive && (p.team === 0 ? p.pos.y > H / 2 + 6 : p.pos.y < H / 2 - 6))
            crossedAny = true;
      }
      expect(ms.rounds.length, `seed ${seed}`).toBe(1);
      expect(ms.rounds[0].winner).not.toBeNull();
      expect(kills.length).toBeGreaterThan(0);
    }
    // they go looking for each other: over the Spindle / stairwells to the other deck
    expect(crossedAny).toBe(true);
  });

});
