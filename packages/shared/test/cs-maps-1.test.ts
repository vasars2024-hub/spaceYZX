// The CS2 classics Dust 2 and Mirage (level/maps/cs/): their layouts follow the rules of the map
// rework — real callouts, both bomb sites, T Spawn attacks (orange) and CT Spawn defends (cyan),
// smooth ramps no steeper than 30°, no gravity areas, a grid of at most 140 cells, and hand-placed
// props and painted signs that sit where they can be built (props between cell centres, clear of
// the lines bots walk; signs on a wall face beside a floor). The generic graybox tests
// (graybox-maps, minimap, map-clipping, sky-overtime) check that they play.
import { describe, expect, it } from 'vitest';
import { DUST2_LAYOUT, getMap, mapDef, MIRAGE_LAYOUT, type GrayboxLayout } from '../src/index';

const MAPS_1: [string, GrayboxLayout, string[]][] = [
  [
    'dust2',
    DUST2_LAYOUT,
    [
      'T Spawn',
      'Outside Long',
      'Long Doors',
      'Blue',
      'Long A',
      'Pit',
      'A Site',
      'Goose',
      'Short',
      'Catwalk',
      'Mid',
      'Mid Doors',
      'Xbox',
      'Lower Tunnels',
      'Upper Tunnels',
      'B Site',
      'B Window',
      'Back Plat',
      'B Doors',
      'CT Spawn',
      'CT Mid',
    ],
  ],
  [
    'mirage',
    MIRAGE_LAYOUT,
    [
      'T Spawn',
      'T Ramp',
      'Palace',
      'A Ramp',
      'A Site',
      'Ninja',
      'Stairs',
      'Jungle',
      'Connector',
      'CT',
      'Ticket Booth',
      'Mid',
      'Top Mid',
      'Window',
      'Short',
      'Catwalk',
      'Underpass',
      'Apartments',
      'B Site',
      'Market',
      'Market Window',
      'Kitchen',
      'B Short',
    ],
  ],
];

const WALL = '.';

describe.each(MAPS_1)('%s layout', (id, lay, callouts) => {
  const W = lay.layers[0].rows[0].length;
  const H = lay.layers[0].rows.length;
  const at = (l: number, x: number, y: number) => lay.layers[l]?.rows[y]?.[x];
  const isFloor = (c: string | undefined) => !!c && c !== WALL && c !== '~';

  it('is registered as a competitive graybox with the desert look', () => {
    const m = getMap(id);
    expect(m.id).toBe(id);
    expect(m.competitive && m.graybox && !m.retired).toBe(true);
    expect(lay.theme).toBe('desert');
  });

  it('grid: one size for every layer, at most 140 cells across', () => {
    for (const layer of lay.layers) {
      expect(layer.rows).toHaveLength(H);
      for (const r of layer.rows) expect(r).toHaveLength(W);
    }
    expect(Math.max(W, H)).toBeLessThanOrEqual(140);
  });

  it('callouts: the real ones, each once; one T, one CT spawn, sites A and B, no gravity', () => {
    const areas = Object.values(lay.legend);
    const names = areas.map((a) => a.n);
    expect(new Set(names).size).toBe(names.length);
    for (const c of callouts) expect(names).toContain(c);
    expect(areas.filter((a) => a.k === 'orange').map((a) => a.n)).toEqual(['T Spawn']);
    expect(areas.filter((a) => a.k === 'cyan').map((a) => a.n)).toEqual(['CT Spawn']);
    const sites = areas.filter((a) => a.k === 'site').map((a) => a.n[0]);
    expect(sites.sort()).toEqual(['A', 'B']);
    expect(areas.filter((a) => a.k === 'gravity')).toEqual([]);
    // every legend entry is used
    const used = new Set(lay.layers.flatMap((l) => l.rows.join('').split('')));
    for (const c of Object.keys(lay.legend)) expect(used.has(c), c).toBe(true);
    // the bomb: orange (team 1) attacks from T Spawn, the built map has sites A and B
    expect((mapDef(id).bombSites ?? []).map((b) => b.name).sort()).toEqual(['A', 'B']);
  });

  it('ramps: straight runs, no steeper than 30°', () => {
    for (const [c, a] of Object.entries(lay.legend)) {
      if (a.k !== 'ramp') continue;
      expect(a.r, a.n).toBeDefined();
      expect(a.dir, a.n).toBeDefined();
      const along: number[] = [];
      lay.layers.forEach((layer) =>
        layer.rows.forEach((row, y) =>
          [...row].forEach((ch, x) => {
            if (ch === c) along.push(a.dir === 'n' || a.dir === 's' ? y : x);
          }),
        ),
      );
      const run = (Math.max(...along) - Math.min(...along) + 1) * lay.cellM;
      const rise = a.r![1] - a.r![0];
      expect((Math.atan2(rise, run) * 180) / Math.PI, a.n).toBeLessThanOrEqual(30);
    }
  });

  it('props stand between cell centres on one flat floor, clear of the bot lines', () => {
    expect(lay.cover).toBe(false);
    expect(lay.props!.length).toBeGreaterThan(10);
    const margin = 0.5 / lay.cellM; // half a metre from every line between cell centres
    for (const p of lay.props!) {
      const l = p.l ?? 0;
      const cxr = p.x + p.w / 2;
      const cyr = p.y + p.d / 2;
      const X = Math.round(cxr);
      const Y = Math.round(cyr);
      const where = `prop at ${X},${Y}`;
      expect(Math.abs(cxr - X) + Math.abs(cyr - Y), where).toBeLessThan(1e-9);
      expect(p.w / 2, where).toBeLessThanOrEqual(0.5 - margin);
      expect(p.d / 2, where).toBeLessThanOrEqual(0.5 - margin);
      const four = [at(l, X - 1, Y - 1), at(l, X, Y - 1), at(l, X - 1, Y), at(l, X, Y)];
      expect(new Set(four).size, where).toBe(1);
      const a = lay.legend[four[0]!];
      expect(a && a.k !== 'ramp' && !a.r, where).toBe(true);
    }
  });

  it('signs sit on a wall face beside a floor', () => {
    expect(lay.signs!.length).toBeGreaterThan(8);
    const d = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const;
    for (const s of lay.signs!) {
      const l = s.l ?? 0;
      const where = `sign "${s.text}" at ${s.x},${s.y}`;
      for (let i = 0; i < lay.layers.length; i++)
        if (!lay.layers[i].overlay) expect(at(i, s.x, s.y), where).toBe(WALL);
      const [dx, dy] = d[s.face];
      expect(isFloor(at(l, s.x + dx, s.y + dy)), where).toBe(true);
    }
  });
});
