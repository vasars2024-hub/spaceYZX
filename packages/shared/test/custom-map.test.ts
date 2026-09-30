import { describe, expect, it } from 'vitest';
import {
  MAPS,
  CUSTOM_MAP_LIMITS,
  applyCustomPatch,
  baseBoxesForEditor,
  boxAabb,
  boxFingerprint,
  compileCustomMap,
  countPieces,
  customMoverOffset,
  expandCustomBlock,
  levelToCustomMap,
  mapDef,
  mapDefForSize,
  qRotate,
  validateCustomMap,
  v3,
  type CustomBlock,
  type CustomMapDoc,
} from '../src/index';

// The Map Maker's docs (level/custom): the checker, the compiler, edits of built-in maps.

const block = (b: Partial<CustomBlock> & Pick<CustomBlock, 'id' | 'shape'>): CustomBlock => ({
  pos: [0, 0, 0],
  size: [4, 1, 4],
  mat: 'concrete',
  ...b,
});

const doc = (more: Partial<CustomMapDoc> = {}): CustomMapDoc => ({
  v: 1,
  name: 'Test map',
  base: '',
  sky: 'day',
  blocks: [block({ id: 1, shape: 'box', pos: [0, -0.5, 0], size: [20, 1, 20] })],
  movers: [],
  spawns: [],
  portals: [],
  launchPads: [],
  ...more,
});

const bad = (raw: unknown): string[] => {
  const r = validateCustomMap(raw);
  expect(r.ok).toBe(false);
  return r.ok ? [] : r.errors;
};

describe('validateCustomMap', () => {
  it('accepts a good doc and strips unknown fields', () => {
    const r = validateCustomMap({ ...doc(), evil: 1, blocks: [{ ...doc().blocks[0], x: 2 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.doc as unknown as Record<string, unknown>).evil).toBeUndefined();
    expect((r.doc.blocks[0] as unknown as Record<string, unknown>).x).toBeUndefined();
    expect(r.doc).toEqual(doc());
  });

  it('rejects bad input', () => {
    expect(bad(null).length).toBeGreaterThan(0);
    expect(bad('map').length).toBeGreaterThan(0);
    expect(bad({ ...doc(), v: 2 }).length).toBeGreaterThan(0);
    expect(bad({ ...doc(), name: '' }).length).toBeGreaterThan(0);
    expect(bad({ ...doc(), name: 'x'.repeat(41) }).length).toBeGreaterThan(0);
    expect(bad({ ...doc(), sky: 'purple' }).length).toBeGreaterThan(0);
    const b = doc().blocks[0];
    expect(bad(doc({ blocks: [{ ...b, pos: [0, NaN, 0] }] })).length).toBeGreaterThan(0);
    expect(bad(doc({ blocks: [{ ...b, pos: [0, 1e9, 0] }] })).length).toBeGreaterThan(0);
    expect(bad(doc({ blocks: [{ ...b, pos: [0, 0] as never }] })).length).toBeGreaterThan(0);
    expect(bad(doc({ blocks: [{ ...b, size: [0, 1, 1] }] })).length).toBeGreaterThan(0);
    expect(bad(doc({ blocks: [{ ...b, mat: 'lava' as never }] })).length).toBeGreaterThan(0);
    expect(bad(doc({ blocks: [{ ...b, shape: 'sphere' as never }] })).length).toBeGreaterThan(0);
    expect(bad(doc({ blocks: [b, { ...b }] }))[0]).toMatch(/twice/);
    expect(bad(doc({ blocks: [{ ...b, id: 1.5 }] })).length).toBeGreaterThan(0);
    // a curve needs its curve; angles and segments in range
    expect(bad(doc({ blocks: [block({ id: 2, shape: 'curveRamp' })] })).length).toBeGreaterThan(0);
    expect(
      bad(
        doc({ blocks: [block({ id: 2, shape: 'curveRamp', curve: { radius: 5, angle: 400 } })] }),
      ),
    ).toHaveLength(1);
    expect(
      bad(
        doc({
          blocks: [
            block({ id: 2, shape: 'curvePlatform', curve: { radius: 5, angle: 90, segments: 99 } }),
          ],
        }),
      ),
    ).toHaveLength(1);
    // a block reaching outside the map
    expect(
      bad(
        doc({ blocks: [block({ id: 2, shape: 'box', pos: [470, 0, 0], size: [100, 1, 1] })] }),
      )[0],
    ).toMatch(/outside/);
  });

  it('checks movers', () => {
    const m = {
      block: 1,
      points: [
        [0, 0, 0],
        [0, 5, 0],
      ],
      speed: 3,
      delay: 1,
    };
    expect(validateCustomMap(doc({ movers: [m] as never })).ok).toBe(true);
    expect(bad(doc({ movers: [{ ...m, block: 7 }] as never }))[0]).toMatch(/no block/);
    expect(bad(doc({ movers: [{ ...m, points: [[0, 0, 0]] }] as never })).length).toBe(1);
    expect(bad(doc({ movers: [{ ...m, points: Array(5).fill([0, 0, 0]) }] as never }))[0]).toMatch(
      /at most 4/,
    );
    expect(bad(doc({ movers: [{ ...m, speed: 0.1 }] as never })).length).toBe(1);
    expect(bad(doc({ movers: [{ ...m, speed: 31 }] as never })).length).toBe(1);
    expect(bad(doc({ movers: [{ ...m, delay: -1 }] as never })).length).toBe(1);
    expect(bad(doc({ movers: [{ ...m, delay: 31 }] as never })).length).toBe(1);
    expect(bad(doc({ movers: [m, m] as never }))[0]).toMatch(/already moves/);
  });

  it('counts curve pieces toward the limit', () => {
    const curve = block({
      id: 1,
      shape: 'curvePlatform',
      curve: { radius: 20, angle: 360, segments: 48 },
    });
    expect(countPieces({ blocks: [curve] })).toBe(48);
    expect(countPieces({ blocks: [block({ id: 1, shape: 'cylinder' })] })).toBe(6);
    const n = Math.floor(CUSTOM_MAP_LIMITS.maxPieces / 48) + 1;
    const blocks = Array.from({ length: n }, (_, i) => ({ ...curve, id: i + 1 }));
    expect(bad(doc({ blocks }))[0]).toMatch(/too many/);
  });

  it('checks portals and edits', () => {
    const portal = { from: { pos: [0, 1, 0], size: [3, 3, 1] }, to: [0, 1, 0.2] };
    expect(bad(doc({ portals: [portal] as never }))[0]).toMatch(/inside a portal/);
    expect(validateCustomMap(doc({ portals: [{ ...portal, to: [20, 1, 0] }] as never })).ok).toBe(
      true,
    );
    expect(
      validateCustomMap(doc({ portals: [{ ...portal, to: [20, 1, 0], twoWay: true }] as never }))
        .ok,
    ).toBe(true);
    expect(bad(doc({ patch: { removed: [] } }))[0]).toMatch(/built-in/);
    expect(
      validateCustomMap(doc({ base: 'kestrel', patch: { removed: ['1,2,3|1,1,1'] } })).ok,
    ).toBe(true);
    expect(bad(doc({ base: 'kestrel', patch: { removed: [7] as never } })).length).toBe(1);
  });
});

describe('compileCustomMap', () => {
  const full = doc({
    sky: 'night',
    blocks: [
      block({ id: 1, shape: 'box', pos: [0, -0.5, 0], size: [40, 1, 40] }),
      block({ id: 2, shape: 'wedge', pos: [5, 1, 0], size: [4, 2, 6], rot: [30, 0, 0] }),
      block({ id: 3, shape: 'surf', pos: [-10, 4, 0], size: [8, 4, 30], mat: 'rock' }),
      block({ id: 4, shape: 'surfSide', pos: [-20, 4, 0], size: [8, 4, 30], rot: [90, 0, 0] }),
      block({
        id: 5,
        shape: 'curveSurf',
        pos: [0, 10, 40],
        size: [8, 4, 1],
        curve: { radius: 20, angle: -120 },
      }),
      block({
        id: 6,
        shape: 'curveRamp',
        pos: [30, 0, 0],
        size: [4, 0.5, 1],
        curve: { radius: 8, angle: 270, rise: 10 },
      }),
      block({ id: 7, shape: 'quarterPipe', pos: [0, 0, -15], size: [10, 4, 1], mat: 'metal' }),
      block({
        id: 8,
        shape: 'curvePlatform',
        pos: [0, 5, 0],
        size: [3, 0.4, 1],
        curve: { radius: 12, angle: 360 },
      }),
      block({ id: 9, shape: 'cylinder', pos: [10, 2, 10], size: [3, 4, 3], mat: 'glass' }),
      block({
        id: 10,
        shape: 'killpaint',
        pos: [-5, 0.05, 5],
        size: [4, 0.1, 4],
        mat: 'killpaint',
      }),
      block({
        id: 11,
        shape: 'box',
        pos: [0, 3, -5],
        size: [4, 0.5, 4],
        mat: 'neon',
        noCollide: true,
      }),
    ],
    movers: [
      {
        block: 11,
        points: [
          [0, 3, -5],
          [0, 8, -5],
          [5, 8, -5],
        ],
        speed: 4,
        delay: 1,
      },
    ],
    spawns: [{ pos: [0, 0, 0], yaw: 90, team: 0 }],
    portals: [{ from: { pos: [15, 1.5, 15], size: [3, 3, 1] }, to: [-15, 1.5, -15], twoWay: true }],
    launchPads: [{ pos: [12, 0.25, -12], size: [2, 0.5, 2], vel: [0, 20, -5] }],
  });

  it('is deterministic and survives a JSON round trip', () => {
    expect(validateCustomMap(full).ok).toBe(true);
    const a = compileCustomMap(full);
    const b = compileCustomMap(JSON.parse(JSON.stringify(full)) as CustomMapDoc);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a.boxes).toHaveLength(countPieces(full));
    expect(a.spawns[0].yawDeg).toBe(-90);
    expect(a.portals).toHaveLength(2);
    expect(a.launchPads).toHaveLength(1);
    expect(a.killVolumes).toHaveLength(1);
    expect(a.movers).toHaveLength(1);
    expect(a.outdoor?.stars).toBe(true);
    expect(a.race).toBeUndefined();
  });

  it('with no spawns: one on top of the first block', () => {
    const def = compileCustomMap(doc());
    expect(def.spawns).toEqual([{ pos: v3(0, 0.05, 0), yawDeg: 0 }]);
  });

  it('curves: tops are flat on pos (platform), climb `rise` (ramp); pipes end vertical', () => {
    const flat = expandCustomBlock(
      block({
        id: 1,
        shape: 'curvePlatform',
        pos: [0, 5, 0],
        size: [3, 0.4, 1],
        curve: { radius: 12, angle: 180 },
      }),
    );
    for (const b of flat) expect(boxAabb(b).max.y).toBeCloseTo(5, 6);
    const ramp = expandCustomBlock(
      block({
        id: 1,
        shape: 'curveRamp',
        pos: [0, 0, 0],
        size: [4, 0.5, 1],
        curve: { radius: 8, angle: 180, rise: 9 },
      }),
    );
    expect(ramp[0].c.y).toBeLessThan(ramp[ramp.length - 1].c.y - 7);
    const pipe = expandCustomBlock(
      block({ id: 1, shape: 'quarterPipe', pos: [0, 0, 0], size: [10, 4, 1] }),
    );
    const top = pipe[pipe.length - 1];
    expect(Math.abs(qRotate(top.q!, v3(0, 1, 0)).y)).toBeLessThan(0.1); // nearly vertical
    expect(boxAabb(top).max.y).toBeGreaterThan(3.7);
  });

  it('a race: gates, grid, line and the default killY', () => {
    const d = doc({
      race: {
        start: { pos: [0, 1.5, 0], size: [8, 3, 8], yaw: 0 },
        checkpoints: [{ pos: [0, 1.5, -40], size: [6, 3, 2], yaw: 0, name: 'Hill' }],
        finish: { pos: [0, 1.5, -80], size: [6, 3, 2], yaw: 180 },
      },
      blocks: [
        block({ id: 1, shape: 'box', pos: [0, -0.5, -40], size: [20, 1, 100] }),
        block({
          id: 2,
          shape: 'killpaint',
          pos: [0, 0.05, -20],
          size: [20, 0.1, 2],
          mat: 'killpaint',
        }),
      ],
    });
    const def = compileCustomMap(d);
    const r = def.race!;
    expect(r.checkpoints).toHaveLength(1);
    expect(r.checkpoints[0].name).toBe('Hill');
    expect(r.finish.yawDeg).toBe(-180);
    expect(r.grid).toHaveLength(8);
    expect(def.spawns).toBe(r.grid);
    expect(r.line.map((n) => n.cp)).toEqual([0, 0, 1]);
    expect(r.killY).toBeCloseTo(-31, 6);
    expect(r.killVolumes).toHaveLength(1);
    expect(def.killVolumes).toBeUndefined();
    for (const g of r.grid) {
      expect(g.pos.x).toBeGreaterThanOrEqual(-4);
      expect(g.pos.x).toBeLessThanOrEqual(4);
    }
  });

  it('mover offsets: point 1, wait, travel, ..., back to point 1', () => {
    const m = {
      block: 1,
      points: [
        [0, 0, 0],
        [10, 0, 0],
      ] as [number, number, number][],
      speed: 5,
      delay: 1,
    };
    expect(customMoverOffset(m, 0)).toEqual([0, 0, 0]);
    expect(customMoverOffset(m, 0.99)).toEqual([0, 0, 0]);
    expect(customMoverOffset(m, 2)[0]).toBeCloseTo(5, 6);
    expect(customMoverOffset(m, 3.5)).toEqual([10, 0, 0]);
    expect(customMoverOffset(m, 5)[0]).toBeCloseTo(5, 6);
    expect(customMoverOffset(m, 6)).toEqual([0, 0, 0]);
    expect(customMoverOffset(m, 6.5)).toEqual([0, 0, 0]);
  });
});

describe('built-in maps', () => {
  it('every built-in map converts to a doc that validates and compiles back', () => {
    for (const info of MAPS) {
      const def = mapDef(info.id);
      const d = levelToCustomMap(def, info.id, info.name);
      const r = validateCustomMap(JSON.parse(JSON.stringify(d)));
      if (!r.ok) throw new Error(`${info.id}: ${r.errors.join('; ')}`);
      const back = compileCustomMap(r.doc);
      expect(back.boxes.length).toBeGreaterThan(0);
      expect(!!back.race).toBe(!!def.race);
      // shapes and places survive (boxes stay where they were; curved surf pieces and scenery
      // reaching past the network's ±500 m can't be blocks)
      const src = def.boxes.filter((b) => {
        if (b.hull || Math.max(Math.abs(b.c.x), Math.abs(b.c.y), Math.abs(b.c.z)) > 480)
          return false;
        const bb = boxAabb(b);
        return Math.max(-bb.min.x, -bb.min.y, -bb.min.z, bb.max.x, bb.max.y, bb.max.z) <= 500;
      });
      expect(back.boxes).toHaveLength(Math.min(src.length, CUSTOM_MAP_LIMITS.maxPieces));
      back.boxes.forEach((b, i) => {
        const o = src[i];
        expect(
          Math.abs(b.c.x - o.c.x) + Math.abs(b.c.y - o.c.y) + Math.abs(b.c.z - o.c.z),
        ).toBeLessThan(1e-3);
        const ea = boxAabb(b);
        const eo = boxAabb(o);
        if (Math.min(o.h.x, o.h.y, o.h.z) > 0.05 && Math.max(o.h.x, o.h.y, o.h.z) < 480) {
          expect(
            Math.abs(ea.max.x - eo.max.x) +
              Math.abs(ea.max.y - eo.max.y) +
              Math.abs(ea.max.z - eo.max.z),
          ).toBeLessThan(1e-3);
          if (o.prism === undefined || [-1, 0, 1].includes(o.prism))
            expect(!!b.surf, `${info.id} box ${i}`).toBe(!!o.surf);
          if (o.prism !== undefined && b.prism !== undefined) {
            // the ridge (the high edge) is in the same place
            const ridge = (x: typeof b) => {
              const l = v3(0, x.h.y, x.prism! * x.h.z);
              const w = x.q ? qRotate(x.q, l) : l;
              return v3(x.c.x + w.x, x.c.y + w.y, x.c.z + w.z);
            };
            const ra = ridge(b);
            const ro = ridge(o);
            expect(
              Math.abs(ra.x - ro.x) + Math.abs(ra.y - ro.y) + Math.abs(ra.z - ro.z),
            ).toBeLessThan(1e-3);
          }
        }
      });
    }
  });

  it('an edit of a map with moving blocks keeps each mover on its own boxes', () => {
    const base = mapDefForSize('orrery');
    const movers = base.movers!;
    const moving = new Set(movers.flatMap((m) => m.boxes));
    const all = baseBoxesForEditor('orrery');
    const unique = (fp: string) => all.filter((o) => o.fingerprint === fp).length === 1;
    // a still box before the first mover's boxes: every mover's indices shift down by one
    const still = all.find(
      (b, i) => !moving.has(i) && i < movers[0].boxes[0] && unique(b.fingerprint),
    )!;
    const edited = applyCustomPatch(
      base,
      doc({ base: 'orrery', patch: { removed: [still.fingerprint] } }),
    );
    expect(edited.movers).toHaveLength(movers.length);
    edited.movers!.forEach((m, k) =>
      expect(m.boxes.map((i) => edited.boxes[i])).toEqual(
        movers[k].boxes.map((i) => base.boxes[i]),
      ),
    );
    // removing one of a mover's own boxes: that box leaves the mover, the rest ride on
    const own = movers[0].boxes.find((i) => unique(all[i].fingerprint))!;
    const cut = applyCustomPatch(
      base,
      doc({ base: 'orrery', patch: { removed: [all[own].fingerprint] } }),
    );
    expect(cut.movers![0].boxes).toHaveLength(movers[0].boxes.length - 1);
    expect(cut.movers![0].boxes.every((i) => i < cut.boxes.length)).toBe(true);
  });

  it('an empty edit is the map itself; removing a box removes exactly it', () => {
    for (const info of MAPS) {
      const base = mapDefForSize(info.id);
      const edit = doc({ base: info.id, blocks: [], patch: { removed: [] } });
      expect(applyCustomPatch(base, edit)).toEqual(base);
      expect(compileCustomMap(edit)).toEqual(base);
    }
    const base = mapDefForSize('split-deck', 2);
    const boxes = baseBoxesForEditor('split-deck');
    const victim = boxes.find(
      (b) => boxes.filter((o) => o.fingerprint === b.fingerprint).length === 1,
    )!;
    const edited = applyCustomPatch(
      base,
      doc({
        base: 'split-deck',
        patch: { removed: [victim.fingerprint] },
        blocks: [block({ id: 1, shape: 'box', pos: [0, 30, 0], size: [2, 2, 2] })],
      }),
    );
    expect(edited.boxes).toHaveLength(base.boxes.length);
    expect(edited.boxes.some((b) => boxFingerprint(b) === victim.fingerprint)).toBe(false);
    expect(edited.boxes[edited.boxes.length - 1].c).toEqual(v3(0, 30, 0));
    // everything else of the map stays
    expect(edited.towers).toEqual(base.towers);
    expect(edited.bombSites).toEqual(base.bombSites);
    expect(edited.waypoints).toEqual(base.waypoints);
    expect(edited.skyArena).toEqual(base.skyArena);
    expect(edited.sizeWalls).toEqual(base.sizeWalls);
    expect(edited.spawns).toEqual(base.spawns);
  });

  it('edits drop portals and launch pads by index and keep race maps racing', () => {
    const base = mapDefForSize('orbital-ring');
    const edited = applyCustomPatch(
      base,
      doc({
        base: 'orbital-ring',
        blocks: [],
        patch: { removed: [], removedPortals: [0], removedLaunchPads: [0, 1] },
      }),
    );
    expect(edited.portals).toHaveLength((base.portals?.length ?? 0) - 1);
    expect(edited.launchPads).toHaveLength((base.launchPads?.length ?? 0) - 2);
    const race = mapDefForSize('race-sunspire');
    const paint = applyCustomPatch(
      race,
      doc({
        base: 'race-sunspire',
        patch: { removed: [] },
        blocks: [block({ id: 1, shape: 'killpaint', pos: [0, 100, 0], size: [2, 0.1, 2] })],
      }),
    );
    expect(paint.race!.killVolumes).toHaveLength((race.race!.killVolumes?.length ?? 0) + 1);
    expect(paint.race!.line).toBe(race.race!.line);
    expect(paint.killVolumes).toEqual(race.killVolumes);
  });
});
