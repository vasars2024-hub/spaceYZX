// Cache and Train (level/maps/cs/): CS2 classics rebuilt about 3× their real size as grayboxes.
// The shared bar (bots, routes, clipping) is in graybox-maps / minimap / map-clipping; this file
// checks what is special to these two: registered for matches, about 3× the real size, the real
// callouts, smooth ramps no steeper than 30°, no gravity areas, bomb spawns the CS way round,
// props standing on floor and signs painted on walls.
import { describe, expect, it } from 'vitest';
import {
  CACHE_LAYOUT,
  CACHE_SCALE,
  mapDef,
  MAPS,
  TRAIN_LAYOUT,
  type GrayboxLayout,
} from '../src/index';

// (scale: undefined = traced from the radar at 1.25× real size)
const MAPS_4: [id: string, layout: GrayboxLayout, scale: number | undefined, callouts: string[]][] =
  [
    [
      'cache',
      CACHE_LAYOUT,
      CACHE_SCALE,
      [
        'T Spawn',
        'A Main',
        'Squeaky',
        'A Site',
        'Quad',
        'Forklift',
        'Highway',
        'CT',
        'Garage',
        'Mid',
        'White Box',
        'Z Connector',
        'Boost',
        'Vents',
        'Checkers',
        'B Main',
        'B Site',
        'Headshot',
        'Heaven',
        'Sun Room',
        'T Connector',
        'CT Spawn',
      ],
    ],
    [
      'train',
      TRAIN_LAYOUT,
      undefined,
      [
        'T Spawn',
        'Alley',
        'T Main',
        'Ivy',
        'Popdog',
        'A Main',
        'A Site',
        'Ladder Room',
        'Connector',
        'Z',
        'El Box',
        'Heaven',
        'Hell',
        'B Site',
        'Upper B',
        'Lower B',
        'B Halls',
        'Catwalk',
        'CT Spawn',
      ],
    ],
  ];

/** The real maps' playable size in CS units (about), to check the 3× scale. */
const REAL_U: Record<string, number> = { cache: 3750, train: 4250 };

describe.each(MAPS_4)('%s', (id, lay, scale, callouts) => {
  const rows = lay.layers[0].rows;
  const W = rows[0].length;
  const H = rows.length;
  const floorAt = (l: number, x: number, y: number) => {
    const c = lay.layers[l]?.rows[y]?.[x];
    return !!c && c !== '.' && c !== '~';
  };

  it('is a competitive graybox map with the industrial look and no automatic cover', () => {
    const info = MAPS.find((m) => m.id === id)!;
    expect(info.competitive).toBe(true);
    expect(info.graybox).toBe(true);
    expect(info.retired).toBeFalsy();
    expect(lay.theme).toBe('industrial');
    expect(lay.cover).toBe(false);
    expect(lay.sizes).toBeUndefined(); // 3v3 and up play the whole map
  });

  it('is about 3× (traced: 1.25×) the real map, with at most ~140 cells across', () => {
    const traced = lay.layers.some((L) => L.heights);
    if (!traced) expect(scale).toBe(3);
    expect(Math.max(W, H)).toBeLessThanOrEqual(140);
    const across = Math.max(W, H) * lay.cellM;
    const real = REAL_U[id] * 0.0254 * (traced ? 1.25 : 3);
    expect(across).toBeGreaterThan(real * 0.8);
    expect(across).toBeLessThan(real * 1.25);
  });

  it('has the real callouts, CS bomb sides and no gravity areas', () => {
    const names = Object.values(lay.legend).map((a) => a.n);
    for (const n of callouts) expect(names, n).toContain(n);
    const kinds = Object.values(lay.legend).map((a) => a.k);
    expect(kinds.filter((k) => k === 'orange')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'cyan')).toHaveLength(1);
    expect(kinds).not.toContain('gravity');
    expect(Object.values(lay.legend).find((a) => a.k === 'orange')!.n).toBe('T Spawn');
    expect(Object.values(lay.legend).find((a) => a.k === 'cyan')!.n).toBe('CT Spawn');
    const sites = Object.values(lay.legend).filter((a) => a.k === 'site');
    expect(sites.map((a) => a.n[0]).sort()).toEqual(['A', 'B']);
    expect(
      mapDef(id)
        .bombSites!.map((b) => b.name)
        .sort(),
    ).toEqual(['A', 'B']);
  });

  it('ramps are straight runs no steeper than 30°', () => {
    for (const [c, a] of Object.entries(lay.legend)) {
      if (a.k !== 'ramp') continue;
      expect(a.dir, a.n).toBeDefined();
      expect(a.r, a.n).toBeDefined();
      const ys: number[] = [];
      const xs: number[] = [];
      lay.layers.forEach((L) =>
        L.rows.forEach((r, y) => [...r].forEach((ch, x) => ch === c && (xs.push(x), ys.push(y)))),
      );
      const along = a.dir === 'n' || a.dir === 's' ? ys : xs;
      const run = (Math.max(...along) - Math.min(...along) + 1) * lay.cellM;
      const rise = Math.abs(a.r![1] - a.r![0]);
      expect((Math.atan2(rise, run) * 180) / Math.PI, a.n).toBeLessThanOrEqual(30);
    }
  });

  it('props stand on floor cells, signs sit on a wall facing a floor', () => {
    expect(lay.props!.length).toBeGreaterThan(10);
    for (const p of lay.props!) {
      for (let y = Math.floor(p.y); y < Math.ceil(p.y + p.d); y++)
        for (let x = Math.floor(p.x); x < Math.ceil(p.x + p.w); x++)
          expect(floorAt(p.l ?? 0, x, y), `prop at ${p.x},${p.y}`).toBe(true);
      expect(p.h).toBeGreaterThan(0.5);
      expect(p.h).toBeLessThanOrEqual(4);
    }
    const STEP = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const;
    expect(lay.signs!.length).toBeGreaterThan(10);
    for (const s of lay.signs!) {
      const [dx, dy] = STEP[s.face];
      expect(floorAt(s.l ?? 0, s.x, s.y), s.text).toBe(false);
      expect(floorAt(s.l ?? 0, s.x + dx, s.y + dy), s.text).toBe(true);
    }
  });
});

describe('train', () => {
  it('has the train cars as long props in rows with gaps between them', () => {
    const cars = TRAIN_LAYOUT.props!.filter((p) => p.kind === 'car');
    expect(cars.length).toBeGreaterThanOrEqual(8);
    for (const c of cars) {
      expect(c.h).toBeGreaterThanOrEqual(3);
      expect(c.h).toBeLessThanOrEqual(4);
      expect(c.w * TRAIN_LAYOUT.cellM).toBeGreaterThan(c.d * TRAIN_LAYOUT.cellM * 2);
    }
    // no two cars touch (walkable gaps between them)
    for (const a of cars)
      for (const b of cars)
        if (a !== b)
          expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.d <= b.y || b.y + b.d <= a.y).toBe(
            true,
          );
  });

  it('has a suction tube from Ladder Room up to Heaven instead of the ladder', () => {
    const lg = TRAIN_LAYOUT.legend;
    const tube = (TRAIN_LAYOUT.links ?? []).find(
      ([a, b, k]) => k === 'tube' && lg[a].n === 'Ladder Room' && lg[b].n === 'Heaven',
    );
    expect(tube).toBeDefined();
    expect(tube![3]).not.toBe(false);
    expect(lg[tube![1]].h!).toBeGreaterThan(lg[tube![0]].h! + 2.6); // (too high to climb)
  });
});
