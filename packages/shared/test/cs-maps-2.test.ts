// Inferno and Nuke (level/maps/cs/): the CS2 classics rebuilt as grayboxes (traced ones: 1.25× real,
// others about 3×). Checks what the shared graybox tests don't: the grid size, smooth straight ramps no
// steeper than 30°, no gravity areas, the real callouts, props standing on flat floor, signs on
// walls facing a floor, and Nuke's stacked sites with the Vents drop.
import { describe, expect, it } from 'vitest';
import { INFERNO_LAYOUT, mapDef, MAPS, NUKE_LAYOUT, type GrayboxLayout } from '../src/index';

const CALLOUTS: Record<string, string[]> = {
  inferno: [
    'T Spawn',
    'T Ramp',
    'Second Mid',
    'Mid',
    'Top Mid',
    'Apartments',
    'Balcony',
    'Boiler',
    'Pit',
    'Graveyard',
    'A Site',
    'Library',
    'Truck',
    'Arch Side',
    'Arch',
    'CT',
    'Banana',
    'Car',
    'Logs',
    'Coffins',
    'B Site',
    'Fountain',
    'New Box',
    'Dark',
    'Construction',
    'Church',
    'CT Spawn',
  ],
  nuke: [
    'T Spawn',
    'T Roof',
    'Outside',
    'Secret',
    'Mini',
    'Garage',
    'Silo',
    'Lobby',
    'Squeaky',
    'Hut',
    'Heaven',
    'Hell',
    'Main',
    'Ramp Room',
    'Ramp',
    'A Site',
    'Rafters',
    'Vents',
    'B Site',
    'Toxic',
    'Decon',
    'Window',
    'Double Doors',
    'CT Spawn',
  ],
};
const LAYOUTS: [string, GrayboxLayout][] = [
  ['inferno', INFERNO_LAYOUT],
  ['nuke', NUKE_LAYOUT],
];
const DIR: Record<string, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

describe.each(LAYOUTS)('%s layout', (id, lay) => {
  const W = lay.layers[0].rows[0].length;
  const H = lay.layers[0].rows.length;
  const at = (l: number, x: number, y: number) => lay.layers[l].rows[y]?.[x];
  const floorArea = (c: string | undefined) => {
    const a = c ? lay.legend[c] : undefined;
    return a && !['solid', 'void'].includes(a.k) ? a : undefined;
  };

  it('is registered as a competitive graybox, ~3× scale, at most 140 cells across', () => {
    const m = MAPS.find((x) => x.id === id)!;
    expect(m).toBeDefined();
    expect(m.competitive && m.graybox).toBe(true);
    // (maps traced from the radar — per-cell heights — are 1.25× real size: 32..48 CS units a cell)
    if (lay.layers.some((L) => L.heights)) {
      expect(lay.cellM).toBeGreaterThanOrEqual(32 * 0.0254 * 1.25 - 1e-6);
      expect(lay.cellM).toBeLessThanOrEqual(48 * 0.0254 * 1.25 + 1e-6);
    } else expect(lay.cellM).toBeCloseTo(64 * 0.0254 * 3, 6);
    expect(W).toBeLessThanOrEqual(140);
    expect(H).toBeLessThanOrEqual(140);
    for (const layer of lay.layers) {
      expect(layer.rows).toHaveLength(H);
      for (const r of layer.rows) expect(r).toHaveLength(W);
    }
    expect(lay.theme).toBe(id === 'inferno' ? 'italian' : 'industrial');
    expect(lay.sizes).toBeUndefined();
  });

  it('has the real callouts, one T (orange) and one CT (cyan) spawn, sites A and B', () => {
    const names = Object.values(lay.legend).map((a) => a.n);
    for (const n of CALLOUTS[id]) expect(names, n).toContain(n);
    const kinds = Object.values(lay.legend).map((a) => a.k);
    expect(kinds.filter((k) => k === 'orange')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'cyan')).toHaveLength(1);
    expect(kinds).not.toContain('gravity');
    expect(lay.legend[Object.keys(lay.legend).find((c) => lay.legend[c].k === 'orange')!].n).toBe(
      'T Spawn',
    );
    const sites = Object.values(lay.legend).filter((a) => a.k === 'site');
    expect(sites.map((a) => a.n).sort()).toEqual(['A Site', 'B Site']);
    // tubes and pads are for players only; nothing else
    for (const [, , kind, oneWay] of lay.links ?? []) {
      expect(kind).toBe('tube');
      expect(oneWay).not.toBe(false);
    }
  });

  it('ramps are straight runs no steeper than 30°', () => {
    for (const [c, a] of Object.entries(lay.legend)) {
      if (a.k !== 'ramp') continue;
      expect(a.dir, c).toBeDefined();
      expect(a.r, c).toBeDefined();
      const cells: [number, number][] = [];
      lay.layers.forEach((layer) =>
        layer.rows.forEach((r, y) => [...r].forEach((ch, x) => ch === c && cells.push([x, y]))),
      );
      expect(cells.length, c).toBeGreaterThan(0);
      const along = cells.map(([x, y]) => (a.dir === 'n' || a.dir === 's' ? y : x));
      const run = (Math.max(...along) - Math.min(...along) + 1) * lay.cellM;
      const rise = Math.abs(a.r![1] - a.r![0]);
      expect(rise / run, `${a.n} slope`).toBeLessThanOrEqual(Math.tan(Math.PI / 6));
    }
  });

  it('props stand on flat floor of one area inside their layer', () => {
    // (maps traced from the radar — per-cell heights — keep the radar's props where they are:
    // they only have to stand on floor, never cut into a wall; the tracer flattens the floor
    // under each and the builder keeps bots clear)
    if (lay.layers.some((L) => L.heights)) {
      for (const p of lay.props ?? []) {
        const l = p.l ?? 0;
        for (let y = Math.floor(p.y); y < p.y + p.d - 1e-6; y++)
          for (let x = Math.floor(p.x); x < p.x + p.w - 1e-6; x++)
            expect(floorArea(at(l, x, y)), `prop at ${p.x},${p.y} over ${x},${y}`).toBeDefined();
      }
      return;
    }
    for (const p of lay.props ?? []) {
      const l = p.l ?? 0;
      const seen = new Set<string>();
      for (let y = Math.floor(p.y); y < Math.ceil(p.y + p.d); y++)
        for (let x = Math.floor(p.x); x < Math.ceil(p.x + p.w); x++) {
          const c = at(l, x, y);
          const a = floorArea(c);
          expect(a, `prop at ${p.x},${p.y}: cell ${x},${y} is '${c}'`).toBeDefined();
          expect(['ramp', 'orange', 'cyan'], `prop at ${p.x},${p.y}`).not.toContain(a!.k);
          seen.add(String(a!.h ?? lay.layers[l].y));
        }
      expect(seen.size, `prop at ${p.x},${p.y} spans heights`).toBe(1);
    }
  });

  it('signs hang on a wall cell, facing a floor', () => {
    expect((lay.signs ?? []).length).toBeGreaterThan(10);
    for (const s of lay.signs ?? []) {
      const l = s.l ?? 0;
      expect(at(l, s.x, s.y), `${s.text}`).toBe('.');
      const [dx, dy] = DIR[s.face];
      expect(floorArea(at(l, s.x + dx, s.y + dy)), `${s.text}`).toBeDefined();
    }
  });
});

describe('nuke: vertical', () => {
  const d = mapDef('nuke');
  const site = (n: string) => d.bombSites!.find((b) => b.name === n)!;

  it('A Site lies right over B Site', () => {
    const a = site('A');
    const b = site('B');
    expect(a.min.y - b.max.y).toBeGreaterThan(-0.01);
    const ox = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
    const oz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
    // (traced at 1.25× real size the two bomb zones overlap about 10 m each way; the old 3× build 30 m)
    const min = NUKE_LAYOUT.layers.some((L) => L.heights) ? 8 : 30;
    expect(ox).toBeGreaterThan(min);
    expect(oz).toBeGreaterThan(min);
  });

  it('Vents: a one-way suction tube from the duct under A up into A (no ladder)', () => {
    const lay = NUKE_LAYOUT;
    const tubes = (lay.links ?? []).filter(
      ([a, , k]) => k === 'tube' && lay.legend[a].n === 'Vents',
    );
    expect(tubes.length).toBe(1);
    const [a, b] = tubes[0];
    expect(lay.legend[b].h!).toBeGreaterThan(lay.legend[a].h! + 6);
    expect(['Mini', 'Main', 'A Site']).toContain(lay.legend[b].n);
  });
});
