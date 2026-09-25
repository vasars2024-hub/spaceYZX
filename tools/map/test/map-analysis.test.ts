import { describe, expect, it } from 'vitest';
import {
  buildLevel,
  LevelBuilder,
  mapDef,
  normalize,
  raycast,
  v3,
  type LevelDef,
  type SpawnDef,
  type Vec3,
} from '@space-yz/shared';
import { parseArgs, plans, unknownOptions } from '../analyze';
import { mapConfig, type MapAnalysisConfig, type RegionDef, type Team } from '../maps';
import {
  analyzeMap,
  bodyModel,
  createAnalyzer,
  defaultOptions,
  featureReach,
  findSamples,
  nearestCover,
  openGround,
  peekBalance,
  spawnSafety,
  type Analyzer,
} from '../metrics';
import { RayIndex } from '../rays';
import { plainSummary, renderMarkdown } from '../report';

// ------------------------------------------------------------------ tiny synthetic levels

/** A flat floor (top at y = 0) inside 6 m walls: x ∈ [-hx, hx], z ∈ [-hz, hz]. */
const arena = (
  hx: number,
  hz: number,
  build: (b: LevelBuilder) => void,
  spawns: SpawnDef[],
  extra: Partial<LevelDef> = {},
): LevelDef => {
  const b = new LevelBuilder();
  b.box(v3(-hx - 1, -1, -hz - 1), v3(hx + 1, 0, hz + 1));
  b.box(v3(-hx - 1, 0, -hz - 1), v3(-hx, 6, hz + 1));
  b.box(v3(hx, 0, -hz - 1), v3(hx + 1, 6, hz + 1));
  b.box(v3(-hx, 0, -hz - 1), v3(hx, 6, -hz));
  b.box(v3(-hx, 0, hz), v3(hx, 6, hz + 1));
  build(b);
  return b.build({
    name: 'Test arena',
    boundsMin: v3(-hx - 2, -2, -hz - 2),
    boundsMax: v3(hx + 2, 8, hz + 2),
    defaultGravity: v3(0, -1, 0),
    zones: [],
    rails: [],
    pads: [],
    spawns,
    towers: [],
    ...extra,
  });
};

const region = (
  name: string,
  side: Team | null,
  lane: string,
  x0: number,
  x1: number,
): RegionDef => ({
  name,
  side,
  lane,
  min: v3(x0, -1e9, -1e9),
  max: v3(x1, 1e9, 1e9),
});

const config = (regions: RegionDef[]): MapAnalysisConfig => ({
  id: 'test',
  teamNames: ['A', 'B'],
  regions,
  baseRegion: ['A base', 'B base'],
  chokepoints: [],
  lanes: [],
});

/** One region covering the whole arena (a lane, not a base). */
const open = (hx: number) => config([region('arena', null, 'main', -hx - 1, hx + 1)]);

const spawn = (x: number, z: number, team: Team): SpawnDef => ({
  pos: v3(x, 0, z),
  yawDeg: 0,
  team,
});

const analyzer = (def: LevelDef, cfg: MapAnalysisConfig): Analyzer => {
  const an = createAnalyzer(buildLevel(def), cfg, defaultOptions());
  findSamples(an);
  return an;
};

const sampleAt = (an: Analyzer, x: number, z: number, y = 0) => {
  const s = an.samples.find(
    (q) =>
      q.reachable &&
      Math.abs(q.feet.x - x) < 1e-6 &&
      Math.abs(q.feet.z - z) < 1e-6 &&
      Math.abs(q.feet.y - y) < 0.01,
  );
  if (!s) throw new Error(`no reachable spot at (${x}, ${y}, ${z})`);
  return s;
};

// ------------------------------------------------------------------ tests

describe('map analysis: building blocks', () => {
  it('the fast ray index gives exactly the game raycast answers', () => {
    for (const def of [
      mapDef('kestrel'),
      arena(10, 10, (b) => b.box(v3(-1, 0, -1), v3(1, 1.2, 1)), []),
    ]) {
      const level = buildLevel(def);
      const idx = new RayIndex(level, 2);
      let seed = 7;
      const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
      const lo = def.boundsMin;
      const hi = def.boundsMax;
      for (let i = 0; i < 4000; i++) {
        const o = v3(
          lo.x + rnd() * (hi.x - lo.x),
          lo.y + rnd() * (hi.y - lo.y),
          lo.z + rnd() * (hi.z - lo.z),
        );
        const dir = normalize(v3(rnd() - 0.5, i % 3 ? rnd() - 0.5 : 0, rnd() - 0.5));
        const max = rnd() * 200;
        expect(idx.raycast(o, dir, max)?.t ?? null).toBe(raycast(level, o, dir, max)?.t ?? null);
      }
    }
  });

  it('takes eye, chest and hitbox heights from the game', () => {
    const game = createAnalyzer(
      buildLevel(arena(5, 5, () => {}, [])),
      open(5),
      defaultOptions(),
    ).game;
    const stand = bodyModel(game, false);
    const crouch = bodyModel(game, true);
    expect(stand.eye).toBeCloseTo(1.6, 5);
    expect(crouch.eye).toBeCloseTo(0.95, 5);
    expect(stand.chest).toBeCloseTo(1.0, 1);
    expect(stand.silhouette.length).toBeGreaterThan(30);
    expect(stand.silhouette.length).toBeLessThan(50);
  });

  it('reads its command line', () => {
    expect(
      parseArgs(['kestrel', '--out', 'x', '--png', '--quick', '--spacing', '1.5']),
    ).toMatchObject({ map: 'kestrel', out: 'x', png: true, quick: true, spacing: 1.5, heat: true });
    const d = parseArgs(['--out', 'somewhere', '--playwright', 'pw/index.js']);
    expect(d.map).toBe('kestrel');
    expect(d.playwright).toBe('pw/index.js');
    expect(d.png).toBe(false);
    expect(unknownOptions(['kestrel', '--pngs', '--quick', '--out', 'x'])).toEqual(['--pngs']);
  });
});

describe('map analysis: known answers on tiny levels', () => {
  // two bases, 60 × 20 m, split by a wall at x = 0 (optionally with a 3 m doorway)
  const split = (door: boolean) =>
    arena(
      30,
      10,
      (b) => {
        if (door) {
          b.box(v3(-0.5, 0, -10), v3(0.5, 6, -1.5));
          b.box(v3(-0.5, 0, 1.5), v3(0.5, 6, 10));
        } else b.box(v3(-0.5, 0, -10), v3(0.5, 6, 10));
      },
      [spawn(-20, 0, 0), spawn(20, 0, 1)],
    );
  const bases = config([region('A base', 0, 'base', -31, 0), region('B base', 1, 'base', 0, 31)]);

  it('spawn exposure: nothing sees a spawn behind a solid wall', () => {
    const an = analyzer(split(false), bases);
    const r = spawnSafety(an, new Uint16Array(an.samples.length));
    expect(r.spawns.map((s) => s.exposedBy)).toEqual([0, 0]);
    expect(r.pairs).toEqual([]);
  });

  it('spawn exposure: a doorway in line with the spawns exposes them', () => {
    const an = analyzer(split(true), bases);
    const r = spawnSafety(an, new Uint16Array(an.samples.length));
    const [a, b] = r.spawns;
    expect(a.exposedBy).toBeGreaterThan(0);
    // every spot that sees A's spawn is on B's half, and the mirror is the same
    expect(a.fromEnemySide).toBe(a.exposedBy);
    expect(b.exposedBy).toBe(a.exposedBy);
    // the nearest one stands in the doorway: 20.5 m from A's eye (spots are on a 1 m grid)
    expect(a.closest?.dist).toBeCloseTo(20.5, 1);
    expect(a.closest?.pos.x).toBeCloseTo(0.5, 5);
    expect(Math.abs(a.closest!.pos.z)).toBeCloseTo(0.5, 5);
    expect(a.closest?.region).toBe('B base');
    // and the two spawns see each other, eye to eye, 40 m apart
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0].dist).toBeCloseTo(40, 5);
  });

  // one thin box in a big room; defenders stand behind it, attackers 5–30 m on the other side
  const coverBox = (height: number) =>
    analyzer(
      arena(40, 20, (b) => b.box(v3(-0.2, 0, -3), v3(0.2, height, 3)), [
        spawn(-10, 12, 0),
        spawn(10, 12, 1),
      ]),
      open(40),
    );

  it('head glitch: a 1.5 m box lets a standing player shoot while showing almost nothing', () => {
    const p = peekBalance(coverBox(1.5));
    expect(p.coverBoxes).toHaveLength(1);
    expect(p.coverBoxes[0].height).toBeCloseTo(1.5, 5);
    expect(p.glitchPairs).toBeGreaterThan(0);
    // only standing players get the glitch (a crouched eye is below the top)
    expect(p.byStance.find((x) => x.stance === 'crouch')?.glitchPairs).toBe(0);
    for (const s of p.glitchSpots) {
      expect(s.stance).toBe('stand');
      expect(s.worst!.shown).toBeLessThan(0.15);
    }
  });

  it('head glitch: a 1.2 m box shows the head and shoulders, so no glitch', () => {
    const p = peekBalance(coverBox(1.2));
    expect(p.coverBoxes).toHaveLength(1);
    expect(p.pairs).toBeGreaterThan(100);
    expect(p.glitchPairs).toBe(0);
    expect(p.glitchSpots).toEqual([]);
  });

  it('open ground: an empty 40 × 40 m room is one open field in the middle', () => {
    const an = analyzer(
      arena(20, 20, () => {}, [spawn(-18, 0, 0), spawn(18, 0, 1)]),
      open(20),
    );
    // the spot nearest the centre is 19.5 m from the walls
    expect(nearestCover(an, sampleAt(an, 0.5, 0.5))).toBeCloseTo(19.5, 5);
    const n = an.samples.length;
    const o = openGround(an, new Float32Array(n), new Float32Array(n));
    // more than 8 m from every wall: the 24 × 24 spots with |x|, |z| < 12
    expect(o.zones).toHaveLength(1);
    expect(o.zones[0].area).toBe(576);
    expect(o.zones[0].maxCover).toBeCloseTo(19.5, 5);
    expect(o.zones[0].onBox).toBe(false);
  });

  it('open ground: a waist-high box is cover next to it, and its top is an exposed spot', () => {
    const an = analyzer(
      arena(20, 20, (b) => b.box(v3(4, 0, -1), v3(6, 1, 1)), [spawn(-18, 0, 0), spawn(18, 0, 1)]),
      open(20),
    );
    expect(nearestCover(an, sampleAt(an, 2.5, 0.5))).toBeCloseTo(1.5, 5);
    // standing on the box: the box itself is not cover
    expect(nearestCover(an, sampleAt(an, 4.5, 0.5, 1))).toBeCloseTo(15.5, 5);
    const n = an.samples.length;
    const o = openGround(an, new Float32Array(n), new Float32Array(n));
    const top = o.zones.filter((z) => z.onBox);
    expect(top).toHaveLength(1);
    expect(top[0].area).toBe(4);
    const floor = o.zones.filter((z) => !z.onBox);
    expect(floor).toHaveLength(1);
    expect(floor[0].area).toBeLessThan(576);
  });

  it('zip-rails and pads: only what a jump can reach counts', () => {
    const pad = (y: number) => ({
      min: v3(-2, y, -2),
      max: v3(2, y + 2, 2),
      zone: 'none',
      gravity: v3(0, 1, 0),
      durationSec: 1,
      cooldownSec: 1,
    });
    const rail = (y: number) => ({ points: [v3(-10, y, 0), v3(10, y, 0)] as Vec3[] });
    const an = analyzer(
      arena(20, 20, () => {}, [spawn(-18, 0, 0), spawn(18, 0, 1)], {
        rails: [rail(2.5), rail(10)],
        pads: [pad(0), pad(20)],
      }),
      open(20),
    );
    const f = featureReach(an);
    expect(f.rails[0].reachable).toBe(true);
    expect(f.rails[1].reachable).toBe(false);
    // hand at the top of a jump: 0.9 + 1.1 + 1.2 = 3.2 m; the rail is 10 m up and 0.5 m to the
    // side of the nearest grid spot; grab radius 1 m
    expect(f.rails[1].gap).toBeCloseTo(Math.hypot(10 - 3.2, 0.5) - 1, 1);
    expect(f.pads.map((p) => p.reachable)).toEqual([true, false]);
  });
});

describe('map analysis: Kestrel', () => {
  it('runs in quick mode, gives both teams the same numbers and renders the report', () => {
    const t0 = performance.now();
    const def = mapDef('kestrel');
    const a = analyzeMap(buildLevel(def), mapConfig('kestrel', def), defaultOptions(true));
    expect(performance.now() - t0).toBeLessThan(15_000);
    const r = a.report;
    expect(r.samples.reachable).toBeGreaterThan(1000);
    // mirror-symmetric map: the same numbers for both sides
    expect(r.routes.mirror.ok).toBe(true);
    expect(new Set(r.routes.lanes.map((l) => l.lane)).size).toBe(3);
    expect(r.spawns.teams[0].exposingSamples).toBe(r.spawns.teams[1].exposingSamples);
    expect(r.towers[0].scoring.seenFrom).toBe(r.towers[1].scoring.seenFrom);
    expect(r.chokepoints[0].seeAll).toBe(r.chokepoints[1].seeAll);
    expect(r.sightlines.longest.length).toBeGreaterThan(3);
    // the report opens with the plain-language summary
    const md = renderMarkdown(r, ['kestrel-ground.svg']);
    expect(md.indexOf('## In plain words')).toBeGreaterThan(0);
    expect(md.indexOf('## In plain words')).toBeLessThan(md.indexOf('## 1. Walkable spots'));
    expect(plainSummary(r).length).toBeGreaterThan(5);
    expect(() => JSON.parse(JSON.stringify(r))).not.toThrow();
    // every plan is a complete SVG
    const svgs = plans(a);
    expect(svgs.map(([name]) => name)).toContain('kestrel-ground.svg');
    expect(svgs.map(([name]) => name)).toContain('kestrel-upper.svg');
    for (const [, svg] of svgs) {
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
      expect(svg).not.toContain('NaN');
    }
  });
});
