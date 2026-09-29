// Antipode: two decks facing each other across a zero-G Seam (level/maps/antipode.ts). Checks the
// half-turn symmetry, the plan, spawns (the ceiling team spawns upside down), objectives, the bot
// graph, and steps the sim through every way across: the Seam, the Spindle, the stairwells.
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

  it('follows the plan: floor (and ceiling) where the plan has it', () => {
    const lv = level();
    const G = A.gantry;
    const places: [string, number, number, number][] = [
      ['bastion, spawns', -56, 0, 0],
      ['bastion, vestibule', -45.5, 0, 0],
      ['yard', -38, 0, 9],
      ['floor deck, middle', -12, 0, -4],
      ['west launch gantry', -14, G.top, 12],
      ['east launch gantry', 14, G.top, 12],
      ['west gantry ramp', -23, (6.2 * G.top) / 12.2, 12],
      ['south catwalk', -30, 3.5, -21.5],
      ['north catwalk', 30, 3.5, 21.5],
      ['site A', 51, 0, 0],
      ['glass floor', -24, 0, 18],
      ['north stairwell, by its floor door', -30.5, 0, 27],
      ['south stairwell, by its floor door', 30.5, 0, -27],
    ];
    for (const [name, x, y, z] of places) {
      const p = v3(x, y, z);
      const hit = raycast(lv, v3(x, y + 1, z), DOWN, 2);
      expect(hit?.point.y, name).toBeCloseTo(y, 2);
      // (a hair above it: on the ramp the body stands a touch off the slope)
      expect(capsuleOverlaps(lv, standing(v3(x, y + 0.1, z))), name).toBe(false);
      // the same place on the ceiling deck, upside down
      const q = antipodeImage(p);
      const up = raycast(lv, v3(q.x, q.y - 1, q.z), UP, 2);
      expect(up?.point.y, `${name} (ceiling)`).toBeCloseTo(q.y, 2);
      expect(
        capsuleOverlaps(lv, {
          center: v3(q.x, q.y - 1.01, q.z),
          up: UP,
          halfSeg: 0.5,
          radius: 0.4,
        }),
        `${name} (ceiling)`,
      ).toBe(false);
    }
    // the Seam is open between the decks (you see the other deck overhead) except for the
    // Spindle, the gantry stacks and the drifting cargo
    expect(lineOfSight(lv, v3(-30, 1.6, 0), v3(-30, H - 1.6, 0))).toBe(true);
    expect(lineOfSight(lv, v3(-20, 1.6, 10), v3(-20, H - 1.6, -10))).toBe(true);
    expect(lineOfSight(lv, v3(-10, 10, 0), v3(10, 10, 0))).toBe(false); // the Spindle
    // each launch gantry stands right under one of the other deck's gantries
    for (const x of [-14, 14]) {
      const hit = raycast(lv, v3(x, G.top + 1, 12), UP, H);
      expect(hit?.point.y).toBeCloseTo(H - G.top, 2);
    }
  });

  it('has its gravity: down on the floor deck, zero-G in the Seam, up on the ceiling deck, into the Spindle and the stairwell walls', () => {
    const { ctx, world } = sim();
    const g = (x: number, y: number, z: number) => gravityDirAt(ctx, world, v3(x, y, z));
    expect(g(-30, 1, 0)).toEqual(v3(0, -1, 0));
    expect(g(-30, 7.9, 0)).toEqual(v3(0, -1, 0));
    for (const y of [8.1, 12, 14, 16, 19.9]) expect(len(g(-30, y, 0)), `y ${y}`).toBe(0);
    expect(g(30, 20.1, 0)).toEqual(v3(0, 1, 0));
    expect(g(30, 27, 0)).toEqual(v3(0, 1, 0));
    // the Spindle's grooves pull into their faces all the way up (through the Seam)
    for (const y of [3, 8, 14, 20, 25]) {
      expect(g(-5, y, 0), `-x groove y ${y}`).toEqual(v3(1, 0, 0));
      expect(g(5, y, 0), `+x groove y ${y}`).toEqual(v3(-1, 0, 0));
      expect(g(0, y, 5), `+z groove y ${y}`).toEqual(v3(0, 0, -1));
      expect(g(0, y, -5), `-z groove y ${y}`).toEqual(v3(0, 0, 1));
    }
    // (but not the floor in front of a groove, where you walk in)
    expect(g(-5, 1, 0)).toEqual(v3(0, -1, 0));
    expect(g(-8, 1, 0)).toEqual(v3(0, -1, 0));
    // the stairwells pull into their outer walls, except by the doors (floor / ceiling)
    expect(g(0, 14, 28)).toEqual(v3(0, 0, 1));
    expect(g(0, 14, -28)).toEqual(v3(0, 0, -1));
    expect(g(-30.5, 1, 27)).toEqual(v3(0, -1, 0));
    expect(g(30.5, 27, 27)).toEqual(v3(0, 1, 0));
    expect(g(30.5, 1, -27)).toEqual(v3(0, -1, 0));
    expect(g(-30.5, 27, -27)).toEqual(v3(0, 1, 0));
  });

  it('keeps ramps at 30° or less; the 45° fillets only sit across a gravity bend', () => {
    const d = def();
    const { ctx, world } = sim();
    const turned = d.boxes.filter((b) => (b.q || b.prism !== undefined) && !b.noCollide);
    let fillets = 0;
    let ramps = 0;
    for (const b of turned) {
      // drifting cargo in the Seam: nobody stands on it
      if (b.prism === undefined) {
        expect(b.c.y > A.seam.y0 + 2 && b.c.y < A.seam.y1 - 2, `cargo at ${vkey(b.c)}`).toBe(true);
        expect(len(gravityDirAt(ctx, world, b.c))).toBe(0);
        continue;
      }
      // the prism's slanted face: its outward normal in the world (level/level.ts prismShape)
      const n = normalize(qRotate(b.q!, v3(0, b.h.z, -b.prism * b.h.y)));
      const up = deckUp(b.c);
      const slope =
        (Math.acos(Math.min(1, Math.abs(n.x * up.x + n.y * up.y + n.z * up.z))) * 180) / Math.PI;
      if (slope <= 30.01) {
        ramps++;
        continue;
      }
      // a fillet: 45°, and gravity just off its face (either side of the bend) is 45° to it
      expect(slope, `prism at ${vkey(b.c)}`).toBeCloseTo(45, 3);
      fillets++;
      const out = v3(b.c.x + n.x * 1.2, b.c.y + n.y * 1.2, b.c.z + n.z * 1.2);
      const gdir = gravityDirAt(ctx, world, out);
      const cos = -(gdir.x * n.x + gdir.y * n.y + gdir.z * n.z);
      expect(cos, `fillet at ${vkey(b.c)}`).toBeGreaterThan(Math.cos((50 * Math.PI) / 180));
    }
    // 4 grooves + 2 stairwells, on both decks; 2 gantry ramps + 2 catwalk ramps per deck
    expect(fillets).toBe(12);
    expect(ramps).toBe(8);
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
  it('has 8 spawns per team in its bastion: cyan standing on the floor, orange hanging from the ceiling', () => {
    const d = def();
    const lv = level();
    const B = A.bastion;
    for (const team of [0, 1] as const) {
      const spawns = d.spawns.filter((s) => s.team === team);
      expect(spawns.length).toBe(8);
      for (const s of spawns) {
        // the upright body createPlayer puts there is clear
        expect(capsuleOverlaps(lv, standing(s.pos)), vkey(s.pos)).toBe(false);
        const x = team === 0 ? s.pos.x : -s.pos.x;
        expect(x > B.x0 && x < B.blastX && Math.abs(s.pos.z) < B.z).toBe(true);
        if (team === 0) {
          expect(raycast(lv, v3(s.pos.x, s.pos.y + 1, s.pos.z), DOWN, 2)?.point.y).toBeCloseTo(
            0,
            3,
          );
          expect(s.yawDeg).toBe(-90); // facing +x
        } else {
          // its head just under the ceiling: after the turn its feet stand there
          expect(s.pos.y + ANTIPODE_HANG).toBeCloseTo(H, 6);
          const hit = raycast(lv, v3(s.pos.x, s.pos.y + 1, s.pos.z), UP, 2);
          expect(hit?.point.y).toBeCloseTo(H, 3);
          expect(s.yawDeg).toBe(90); // facing -x
        }
      }
    }
  });

  it('no spawn is in view from outside its bastion (both decks, the Seam, gantries, catwalks, roofs, stairwells)', () => {
    const d = def();
    const lv = level();
    const B = A.bastion;
    const inBastion = (p: Vec3) =>
      (p.x < B.x1 + 1 && Math.abs(p.z) < B.z + 1 && p.y < B.h + 1) ||
      (p.x > -B.x1 - 1 && Math.abs(p.z) < B.z + 1 && p.y > H - B.h - 1);
    const lookouts: Vec3[] = [];
    const add = (p: Vec3) => {
      if (inBastion(p)) return;
      if (capsuleOverlaps(lv, { center: p, up: UP, halfSeg: 0, radius: 0.2 })) return;
      lookouts.push(p);
    };
    for (let x = -59; x <= 59; x += 2.5)
      for (let z = -23; z <= 23; z += 2.5)
        for (const y of [1.0, 1.6, 7.6, 10, 14, 18, 20.4, H - 1.6, H - 1.0]) add(v3(x, y, z));
    // gantry decks and catwalks (eye height above them), both decks
    for (const p of [
      v3(-14, A.gantry.top + 1.6, 12),
      v3(14, A.gantry.top + 1.6, 12),
      v3(-30, 5.1, -21.5),
      v3(30, 5.1, 21.5),
    ]) {
      add(p);
      add(antipodeImage(p));
    }
    // the stairwells
    for (let x = -35; x <= 35; x += 3)
      for (let y = 1; y < H; y += 2.5)
        for (const z of [26, 28, 30, -26, -28, -30]) add(v3(x, y, z));
    expect(lookouts.length).toBeGreaterThan(3000);
    for (const s of d.spawns) {
      const u = s.team === 0 ? UP : DOWN; // the body once it stands
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
      // a waypoint where a carrier touches it (in the rules' touch volume)
      const w = wpPos(d, t.team === 0 ? 'home.tower' : '~home.tower');
      expect(Math.hypot(w.x - t.pos.x, w.z - t.pos.z)).toBeLessThan(reach(t) - 0.3);
      const bodyY = t.team === 0 ? 0.91 : H - 0.91;
      expect(bodyY - t.pos.y).toBeGreaterThanOrEqual(-1);
      expect(bodyY - t.pos.y).toBeLessThanOrEqual(t.height + 2);
      // its block stands on (hangs from) its deck
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
    // site A on the floor deck in orange's half, B on the ceiling deck in cyan's half
    const sA = d.bombSites!.find((s) => s.name === 'A')!;
    const sB = d.bombSites!.find((s) => s.name === 'B')!;
    expect(sA.min.x).toBeGreaterThan(0);
    expect(sA.min.y).toBe(0);
    expect(sB.max.x).toBeLessThan(0);
    expect(sB.max.y).toBe(H);
    const cA = v3((sA.min.x + sA.max.x) / 2, 0, (sA.min.z + sA.max.z) / 2);
    expect(raycast(lv, v3(cA.x, 1, cA.z), DOWN, 2)?.point.y).toBeCloseTo(0, 3);
    expect(capsuleOverlaps(lv, standing(cA))).toBe(false);
    expect(siteAt(d.bombSites!, v3(cA.x, 0.91, cA.z))).toBe('A');
    const cB = antipodeImage(cA);
    expect(raycast(lv, v3(cB.x, H - 1, cB.z), UP, 2)?.point.y).toBeCloseTo(H, 3);
    // a planter standing on the ceiling is in site B (and nobody on the floor under it is)
    expect(siteAt(d.bombSites!, v3(cB.x, H - 0.91, cB.z))).toBe('B');
    expect(siteAt(d.bombSites!, v3(cB.x, 0.91, cB.z))).toBeNull();
    // power-ups: at the Spindle's middle, in the ±z grooves, in open space
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
      // on a surface: never floating in the Seam (a floor within 1.5 m along its gravity)
      const g = gravityDirAt(ctx, world, w.pos);
      expect(len(g), `waypoint ${w.name} in zero-G`).toBeGreaterThan(0.5);
      expect(
        raycast(lv, w.pos, normalize(g), 1.6),
        `waypoint ${w.name}: nothing to stand on`,
      ).not.toBeNull();
      for (const j of w.links)
        expect(lineOfSight(lv, w.pos, wps[j].pos), `link ${w.name} → ${wps[j].name}`).toBe(true);
    }
    for (const from of ['home.tower', '~home.tower'])
      for (let i = 0; i < wps.length; i++)
        expect(waypointRoute(wps, wpIndex(d, from), i).length, wps[i].name).toBeGreaterThan(0);
    // the decks join only where they should: up the Spindle's grooves and across the
    // stairwells' walls
    const floor = new Set(wps.map((w, i) => (w.pos.y < H / 2 ? i : -1)).filter((i) => i >= 0));
    const crossings = wps.flatMap((w, i) =>
      w.links.filter((j) => floor.has(i) !== floor.has(j)).map((j) => `${w.name}→${wps[j].name}`),
    );
    expect(crossings.sort()).toEqual(
      [
        'sp.w3→~sp.e3',
        '~sp.e3→sp.w3',
        'sp.e3→~sp.w3',
        '~sp.w3→sp.e3',
        'sp.n3→~sp.n3',
        '~sp.n3→sp.n3',
        'sp.s3→~sp.s3',
        '~sp.s3→sp.s3',
        'n.w4→~n.w4',
        '~n.w4→n.w4',
        's.w4→~s.w4',
        '~s.w4→s.w4',
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

describe('Antipode: across the Seam, up the Spindle, along the stairwells', () => {
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

  it('a jump off a launch gantry drifts across the Seam and lands on the other deck (the gantry over it)', () => {
    const { config, ctx, world } = sim();
    const G = A.gantry;
    const p = addPlayer(world, createPlayer(1, 0, v3(14, G.top, 12), -90, config));
    const view = yawToView(-90);
    for (let t = 0; t < 20; t++)
      step(world, { 1: { tick: world.tick + 1, buttons: 0, view } }, ctx);
    expect(p.grounded).toBe(true);
    let floated = 0;
    let t = 0;
    const lands: number[] = [];
    for (; t < 60 * 6; t++) {
      step(world, { 1: { tick: world.tick + 1, buttons: t < 2 ? Btn.Jump : 0, view } }, ctx);
      if (p.gravity.y === 0 && p.gravity.x === 0 && p.gravity.z === 0) floated++;
      for (const e of world.events) if (e.type === 'land' && e.player === 1) lands.push(e.speed);
      if (t > 30 && p.grounded) break;
    }
    // (it lands, and turns over in the next moments)
    for (let k = 0; k < 30; k++)
      step(world, { 1: { tick: world.tick + 1, buttons: 0, view } }, ctx);
    // drifted through the zero-G band for a couple of seconds, then fell "up" 1.5 m
    expect(floated / 60).toBeGreaterThan(1.5);
    expect(floated / 60).toBeLessThan(3.5);
    expect(p.grounded).toBe(true);
    expect(p.up.y).toBeCloseTo(-1, 6);
    expect(p.pos.y).toBeCloseTo(H - G.top - 0.91, 1);
    expect(p.hp).toBe(config.combat.maxHp);
    expect(lands.length).toBe(1);
  });

  it('a running jump off the gantry crosses the Seam and lands on the ceiling deck itself', () => {
    const { config, ctx, world } = sim();
    const G = A.gantry;
    // run south off the east gantry, jumping at its edge
    const p = addPlayer(world, createPlayer(1, 0, v3(14, G.top, G.z1 - 0.5), 0, config));
    const view = yawToView(0);
    let jumped = false;
    for (let t = 0; t < 60 * 8; t++) {
      const jump = !jumped && p.pos.z < G.z0 + 0.6;
      if (jump) jumped = true;
      step(
        world,
        { 1: { tick: world.tick + 1, buttons: Btn.Forward | (jump ? Btn.Jump : 0), view } },
        ctx,
      );
      if (jumped && p.grounded && p.pos.y > H / 2) break;
    }
    expect(p.grounded).toBe(true);
    expect(p.up.y).toBeCloseTo(-1, 6);
    // on the ceiling deck's own surface (not a gantry), after falling "up" from the Seam
    expect(p.pos.y).toBeCloseTo(H - 0.91, 1);
    expect(p.pos.z).toBeLessThan(G.z0 - 5);
    expect(p.hp).toBeGreaterThan(config.combat.maxHp - 15);
  });

  it('floating across the midline hands you to the other deck (both ways)', () => {
    for (const [from, vy, deckY, upY] of [
      [v3(-24, 13.5, 8), 3, H - 0.91, -1],
      [v3(24, 14.5, 8), -3, 0.91, 1],
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
      '-x groove: cyan floor → site B',
      v3(-14, 0, 0),
      -90,
      ['sp.w0', 'sp.w1', 'sp.w2', 'sp.w3', '~sp.e3', '~sp.e2', '~sp.e1', '~sp.e0', '~ring.se'],
    ],
    [
      '+x groove: site A → orange ceiling',
      v3(14, 0, 0),
      90,
      ['sp.e0', 'sp.e1', 'sp.e2', 'sp.e3', '~sp.w3', '~sp.w2', '~sp.w1', '~sp.w0', '~ring.nw'],
    ],
    [
      '+z groove',
      v3(0, 0, 14),
      0,
      ['sp.n0', 'sp.n1', 'sp.n2', 'sp.n3', '~sp.n3', '~sp.n2', '~sp.n1', '~sp.n0', '~ring.ne'],
    ],
    [
      '-z groove',
      v3(0, 0, -14),
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

  it.each([
    ['north: cyan yard → orange yard', v3(-30.5, 0, 17), 180, 'n'],
    ['south: site A → site B', v3(30.5, 0, -17), 0, 's'],
  ] as const)(
    'a player walks a hull stairwell floor → wall → ceiling (%s)',
    (_n, start, yaw, k) => {
      const route = ['out', 'door', 'in', 'w1', 'w2', 'w3', 'w4'].map((w) => `${k}.${w}`);
      const back = [...route].reverse().map((n) => `~${n}`);
      let onWall = 0;
      const { p, arrived, ticks, config } = walkRoute(start, yaw, [...route, ...back], {
        onTick: (pl) => {
          if (Math.abs(Math.abs(pl.up.z) - 1) < 0.01) onWall++;
        },
      });
      expect(arrived).toBe(true);
      expect(ticks / 60).toBeLessThan(15);
      expect(onWall / 60).toBeGreaterThan(6); // most of the way on the outer wall
      expect(p.up.y).toBeCloseTo(-1, 6);
      expect(p.pos.y).toBeCloseTo(H - 0.91, 1);
      // out of the ceiling door into the hall, at the other end of the stairwell
      expect(Math.abs(p.pos.z)).toBeLessThan(A.halfZ);
      expect(Math.sign(p.pos.x)).toBe(Math.sign(-start.x));
      expect(p.hp).toBe(config.combat.maxHp);
    },
  );

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
  const lanes: [string, string[]][] = [
    ['the Spindle', ['n.w2', 's.w2']],
    ['the north stairwell', [...SPINDLE, 's.w2']],
    ['the south stairwell', [...SPINDLE, 'n.w2']],
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
      // it ended on the enemy deck
      const p = world.players[0];
      expect(p.pos.y > H / 2).toBe(team === 0);
      expect(p.alive).toBe(true);
    },
  );

  it.each([
    [0, 'A'],
    [0, 'B'],
    [1, 'A'],
    [1, 'B'],
  ] as const)('a team-%i bot walks to site %s and stands in it', (team, site) => {
    const d = def();
    const { config, ctx, world } = sim(d, 9);
    const s = d.spawns.find((sp) => sp.team === team)!;
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
    'Bomb: an orange attacker bot plants in site %s (A down on the floor deck, B on its own)',
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
      // planted standing on the site's deck
      const p = world.players[0];
      expect(p.pos.y).toBeCloseTo(site === 'A' ? 0.9 : H - 0.9, 1);
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
